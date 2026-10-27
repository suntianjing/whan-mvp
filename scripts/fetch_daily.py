#!/usr/bin/env python3
"""Fetch latest Wuhan daily 网签备案 stats from ASPX list + image.aspx JPEG.

1) GET Sectionlist.aspx → newest Content2 GUID/title/date
2) Derive image.aspx?ID={GUID}; download JPEG
3) If tesseract + chi_sim available, OCR and try to parse 合计/东湖高新区
4) On OCR failure: keep previous latest_daily.json if ok, else write stub with
   imageUrl/guid/title for browser+manual extract (see whan-screenshots/).

Writes data/official/latest_daily.json
"""
from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse, parse_qs

try:
    from bs4 import BeautifulSoup
except ImportError:
    print("BeautifulSoup required: pip install beautifulsoup4", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "official" / "latest_daily.json"
ASPX_BASE = "http://119.97.201.20/spfcjtj/"
ASPX_LIST = ASPX_BASE + "Sectionlist.aspx?pagenum=1"
DAILY_NAV = "https://zgj.wuhan.gov.cn/fzlm/mrxjspflby/index.shtml"
UA = "WHAN-personal-project-bot/1.0 (+https://suntianjing.github.io/whan-mvp/; personal static site)"
TZ = timezone(timedelta(hours=8))


def now_iso() -> str:
    return datetime.now(TZ).isoformat(timespec="seconds")


def fetch_bytes(url: str) -> bytes:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": UA, "Accept": "*/*"},
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=45) as resp:
        return resp.read()


def fetch_text(url: str) -> str:
    raw = fetch_bytes(url)
    for enc in ("utf-8", "gbk", "gb2312"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def parse_list(html: str) -> list[dict[str, str]]:
    soup = BeautifulSoup(html, "html.parser")
    out: list[dict[str, str]] = []
    seen: set[str] = set()
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if "Content2.aspx" not in href:
            continue
        text = re.sub(r"\s+", " ", a.get_text(" ", strip=True))
        m = re.search(r"(20\d{2})年(\d{1,2})月(\d{1,2})日", text)
        if not m:
            continue
        full = urljoin(ASPX_BASE, href)
        qs = parse_qs(urlparse(full).query)
        guid = (qs.get("ID") or [None])[0]
        if not guid or guid in seen:
            continue
        seen.add(guid)
        date = f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"
        out.append(
            {
                "title": text.split(date)[0].strip() if date in text else text,
                "date": date,
                "guid": guid,
                "detailUrl": full,
                "imageUrl": f"{ASPX_BASE}image.aspx?ID={guid}",
            }
        )
    return out


def ocr_image(path: Path) -> str | None:
    if not shutil.which("tesseract"):
        return None
    # Prefer chi_sim+eng
    langs = "chi_sim+eng"
    try:
        proc = subprocess.run(
            ["tesseract", str(path), "stdout", "-l", langs, "--psm", "6"],
            capture_output=True,
            timeout=120,
            check=False,
        )
        if proc.returncode != 0:
            proc = subprocess.run(
                ["tesseract", str(path), "stdout", "--psm", "6"],
                capture_output=True,
                timeout=120,
                check=False,
            )
        text = (proc.stdout or b"").decode("utf-8", errors="replace")
        return text if text.strip() else None
    except (OSError, subprocess.TimeoutExpired):
        return None


def _nums_on_line(line: str) -> list[float]:
    # OCR often mangles decimals; keep integers and simple floats
    found = re.findall(r"\d+(?:\.\d+)?", line.replace(",", ""))
    out: list[float] = []
    for x in found:
        try:
            out.append(float(x) if "." in x else float(int(x)))
        except ValueError:
            continue
    return out


def parse_ocr(text: str) -> dict[str, Any] | None:
    """Best-effort: find 合计 and 东湖高新区 lines with housing units/area."""
    city = None
    donghu = None
    for raw in text.splitlines():
        line = re.sub(r"\s+", "", raw)
        if not line:
            continue
        nums = _nums_on_line(raw)
        if len(nums) < 2:
            continue
        if "合计" in line and "小计" not in line:
            city = {"housingUnits": nums[0], "housingAreaSqm": nums[1]}
        if "东湖高新" in line:
            donghu = {"housingUnits": nums[0], "housingAreaSqm": nums[1]}
    if not city or not donghu:
        return None
    # sanity: city units should be > district
    if city["housingUnits"] < donghu["housingUnits"]:
        return None
    if city["housingUnits"] > 50000:  # daily city rarely that high
        return None
    return {"city": city, "donghuGaoxin": donghu}


def load_previous() -> dict[str, Any] | None:
    if not OUT.exists():
        return None
    try:
        return json.loads(OUT.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def main() -> int:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    print(f"GET {ASPX_LIST}")
    try:
        html = fetch_text(ASPX_LIST)
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        print(f"ERROR list fetch: {e}", file=sys.stderr)
        return 1

    entries = parse_list(html)
    if not entries:
        print("ERROR: no daily entries on list", file=sys.stderr)
        return 1

    latest = entries[0]
    print(f"latest: {latest['date']} {latest['title']}")
    print(f"image: {latest['imageUrl']}")

    prev = load_previous()
    jpeg_path = None
    ocr_text = None
    parsed = None
    extract_method = "list_only"

    try:
        print(f"GET image {latest['imageUrl']}")
        blob = fetch_bytes(latest["imageUrl"])
        td = Path(tempfile.mkdtemp(prefix="whan-daily-"))
        jpeg_path = td / f"{latest['guid']}.jpg"
        jpeg_path.write_bytes(blob)
        print(f"saved {jpeg_path} ({len(blob)} bytes)")
        ocr_text = ocr_image(jpeg_path)
        if ocr_text:
            extract_method = "tesseract_ocr"
            parsed = parse_ocr(ocr_text)
            print("OCR chars:", len(ocr_text), "parsed:", bool(parsed))
        else:
            print("OCR unavailable or empty")
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        print(f"WARN image fetch failed: {e}")

    base: dict[str, Any] = {
        "url": ASPX_LIST,
        "zgjDailyNav": DAILY_NAV,
        "fetchedAt": now_iso(),
        "date": latest["date"],
        "title": latest["title"],
        "detailUrl": latest["detailUrl"],
        "imageUrl": latest["imageUrl"],
        "guid": latest["guid"],
        "aspxListOk": True,
        "recentDays": [
            {"date": e["date"], "title": e["title"], "url": e["detailUrl"], "guid": e["guid"]}
            for e in entries[:10]
        ],
        "sourceOrg": "武汉市住房和城市更新局",
        "unit": "套 / 平方米",
        "note": "本表数据为已完成新建商品房买卖合同网签数据，预签约数据不纳入成交统计。",
    }

    if parsed:
        payload = {
            **base,
            "ok": True,
            "available": True,
            "flag": "daily_ok",
            "messageZh": "日表已接入（OCR）",
            "extractMethod": extract_method,
            "city": {
                "housingUnits": parsed["city"]["housingUnits"],
                "housingAreaSqm": parsed["city"]["housingAreaSqm"],
            },
            "donghuGaoxin": {
                "housingUnits": parsed["donghuGaoxin"]["housingUnits"],
                "housingAreaSqm": parsed["donghuGaoxin"]["housingAreaSqm"],
                "note": "东湖高新区作为光谷东聚焦的公开行政区代理指标",
            },
            "ocrPreview": (ocr_text or "")[:800],
        }
    elif (
        prev
        and prev.get("ok")
        and prev.get("date") == latest["date"]
        and prev.get("city")
        and prev.get("donghuGaoxin")
    ):
        # Same day already verified
        payload = {
            **prev,
            **base,
            "ok": True,
            "available": True,
            "flag": "daily_ok",
            "messageZh": prev.get("messageZh") or "日表已接入",
            "extractMethod": prev.get("extractMethod") or "cached_verified",
            "city": prev["city"],
            "donghuGaoxin": prev["donghuGaoxin"],
        }
        if prev.get("rows"):
            payload["rows"] = prev["rows"]
            payload["columns"] = prev.get("columns")
    elif prev and prev.get("ok") and prev.get("city"):
        # OCR failed — keep last good numbers but refresh list metadata
        payload = {
            **base,
            "ok": True,
            "available": True,
            "flag": "daily_ok_stale_numbers",
            "messageZh": f"日表列表已更新；数字仍为 {prev.get('date')} 核验稿（OCR 未通过）",
            "extractMethod": "cached_previous_verified",
            "numbersDate": prev.get("date"),
            "city": prev["city"],
            "donghuGaoxin": prev["donghuGaoxin"],
            "statWindow": prev.get("statWindow"),
            "imageUrlCurrent": latest["imageUrl"],
            "imageUrlNumbers": prev.get("imageUrl"),
            "ocrFailed": True,
            "manualHint": (
                "Download imageUrlCurrent, extract table (browser/manual), "
                "save JSON like whan-screenshots/daily-stats-YYYY-MM-DD.json, "
                "then re-run or merge into latest_daily.json"
            ),
        }
        if prev.get("rows"):
            payload["rows"] = prev["rows"]
            payload["columns"] = prev.get("columns")
    else:
        payload = {
            **base,
            "ok": False,
            "available": False,
            "flag": "daily_image_pending_extract",
            "messageZh": "日表图片已定位，待 OCR/人工核验",
            "extractMethod": extract_method,
            "ocrFailed": True,
            "manualHint": (
                "JPEG at imageUrl — HTML has no numbers. "
                "Use browser + manual JSON (see /workspace/whan-screenshots/) "
                "or install tesseract-ocr tesseract-ocr-chi-sim and re-run."
            ),
        }

    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)} ok={payload.get('ok')} flag={payload.get('flag')}")
    if payload.get("city"):
        print(
            f"city {payload['city'].get('housingUnits')} / "
            f"donghu {payload['donghuGaoxin'].get('housingUnits')}"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
