#!/usr/bin/env python3
"""Fetch Wuhan ZGJ public housing monthly (and attempt daily) stats.

Respectful: one GET per needed page. User-Agent identifies WHAN personal project.
Writes:
  data/official/latest_monthly.json
  data/official/history_monthly.json  (last N months)
  data/official/latest_daily.json     (ASPX attempt; may be unavailable)
Exits non-zero if monthly parse fails (does not touch market.json).
"""
from __future__ import annotations

import json
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any
from urllib.parse import urljoin

try:
    from bs4 import BeautifulSoup
except ImportError:
    print("BeautifulSoup required: pip install beautifulsoup4", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "data" / "official"
LIST_URL = "https://zgj.wuhan.gov.cn/xxgk/xxgkml/sjfb/spzfxysydjcjb/"
DAILY_NAV_URL = "https://zgj.wuhan.gov.cn/fzlm/mrxjspflby/index.shtml"
DAILY_ASPX_LIST = "http://119.97.201.20/spfcjtj/Sectionlist.aspx"
DAILY_ASPX_BASE = "http://119.97.201.20/spfcjtj/"
HISTORY_MONTHS = 8
UA = "WHAN-personal-project-bot/1.0 (+https://suntianjing.github.io/whan-mvp/; personal static site)"
TZ_SH = timezone(timedelta(hours=8))

MONTH_TITLE_RE = re.compile(
    r"(?P<y>20\d{2})年(?P<m>\d{1,2})月.*(新建商品房|商品住房).*(成交|统计|监测|简报)"
)


def now_shanghai() -> datetime:
    return datetime.now(TZ_SH)


def fetch(url: str) -> str:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": UA,
            "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.5",
        },
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = resp.read()
        charset = resp.headers.get_content_charset() or "utf-8"
    try:
        return raw.decode(charset)
    except UnicodeDecodeError:
        return raw.decode("utf-8", errors="replace")


def abs_url(href: str, base: str = LIST_URL) -> str:
    return urljoin(base, href.strip())


def parse_list(html: str) -> list[dict[str, str]]:
    soup = BeautifulSoup(html, "html.parser")
    items: list[dict[str, str]] = []
    seen: set[str] = set()
    for a in soup.find_all("a", href=True):
        title = a.get("title") or a.get_text(" ", strip=True)
        title = re.sub(r"\s+", " ", title).strip()
        href = a["href"]
        if not MONTH_TITLE_RE.search(title):
            continue
        if "t20" not in href or not href.endswith(".shtml"):
            continue
        url = abs_url(href)
        if url in seen:
            continue
        seen.add(url)
        m = MONTH_TITLE_RE.search(title)
        assert m
        pub = ""
        parent = a.parent
        if parent:
            span = parent.find("span")
            if span:
                pub = span.get_text(strip=True)
            if not pub:
                sm = re.search(r"20\d{2}-\d{2}-\d{2}", parent.get_text(" ", strip=True))
                if sm:
                    pub = sm.group(0)
        items.append(
            {
                "title": title,
                "url": url,
                "year": m.group("y"),
                "month": str(int(m.group("m"))),
                "listPublishDate": pub,
            }
        )
    return items


def _cell_text(cell) -> str:
    return re.sub(r"\s+", " ", cell.get_text(" ", strip=True)).replace("\xa0", " ").strip()


def _parse_number(text: str) -> float | int | None:
    t = text.replace(",", "").replace("，", "").strip()
    if not t or t in {"—", "-", "/", "－"}:
        return None
    try:
        if "." in t:
            return float(t)
        return int(t)
    except ValueError:
        return None


def parse_detail(html: str, meta: dict[str, str]) -> dict[str, Any]:
    soup = BeautifulSoup(html, "html.parser")
    pub_meta = soup.find("meta", attrs={"name": "PubDate"})
    publish_date = (pub_meta.get("content") or "").strip() if pub_meta else ""
    if not publish_date:
        m = re.search(r"20\d{2}-\d{2}-\d{2}(?:\s+\d{2}:\d{2})?", soup.get_text(" ", strip=True))
        publish_date = m.group(0) if m else meta.get("listPublishDate", "")

    table = soup.find("table")
    if not table:
        raise ValueError("monthly detail: no table found")

    rows: list[list[str]] = []
    for tr in table.find_all("tr"):
        cells = [_cell_text(c) for c in tr.find_all(["td", "th"])]
        if cells:
            rows.append(cells)

    def extract_row(label: str) -> dict[str, Any] | None:
        for row in rows:
            if not row:
                continue
            name = row[0].replace(" ", "")
            if name != label and label not in name:
                continue
            nums = []
            for c in row[1:]:
                n = _parse_number(c)
                if n is not None:
                    nums.append(n)
            if len(nums) < 2:
                raise ValueError(f"monthly detail: row {label!r} missing 套数/面积")
            return {
                "region": label,
                "housingUnits": nums[0],
                "housingAreaSqm": nums[1],
            }
        return None

    city = extract_row("合计")
    donghu = extract_row("东湖高新区")
    if not city:
        raise ValueError("monthly detail: 合计 row not found")
    if not donghu:
        raise ValueError("monthly detail: 东湖高新区 row not found")

    period = f"{meta['year']}-{int(meta['month']):02d}"
    return {
        "period": period,
        "year": int(meta["year"]),
        "month": int(meta["month"]),
        "title": meta["title"],
        "url": meta["url"],
        "publishDate": publish_date,
        "city": {
            "housingUnits": city["housingUnits"],
            "housingAreaSqm": city["housingAreaSqm"],
        },
        "donghuGaoxin": {
            "housingUnits": donghu["housingUnits"],
            "housingAreaSqm": donghu["housingAreaSqm"],
            "note": "东湖高新区作为光谷东聚焦的公开行政区代理指标",
        },
        "sourceOrg": "武汉市住房和城市更新局",
        "series": "新建商品房成交统计情况（商品住房）",
    }


def mom_pct(curr: float | int, prev: float | int | None) -> float | None:
    if prev is None or prev == 0:
        return None
    return round((float(curr) - float(prev)) / float(prev) * 100.0, 2)


def try_daily() -> dict[str, Any]:
    """Attempt zgj daily nav + known ASPX list under spfcjtj/."""
    fetched_at = now_shanghai().isoformat(timespec="seconds")
    base: dict[str, Any] = {
        "ok": False,
        "available": False,
        "flag": "daily_unavailable_use_monthly",
        "messageZh": "日表暂不可用，已用月报",
        "zgjDailyNav": DAILY_NAV_URL,
        "fetchedAt": fetched_at,
    }

    # 1) zgj nav shell
    try:
        nav_html = fetch(DAILY_NAV_URL)
        soup = BeautifulSoup(nav_html, "html.parser")
        external: list[str] = []
        for a in soup.find_all("a", href=True):
            t = a.get_text(strip=True)
            h = a["href"]
            if "每日" in t or "spfcjtj" in h or "Sectionlist" in h:
                external.append(abs_url(h, DAILY_NAV_URL))
        base["zgjNavExternal"] = external[:5]
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        base["zgjNavError"] = str(e)

    # 2) ASPX Sectionlist
    try:
        print(f"GET daily aspx {DAILY_ASPX_LIST}")
        aspx_html = fetch(DAILY_ASPX_LIST)
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        base.update(
            {
                "url": DAILY_ASPX_LIST,
                "reason": f"ASPX list fetch failed: {e}",
                "note": "无法访问日表 ASPX；行情依赖月报。",
            }
        )
        return base

    soup = BeautifulSoup(aspx_html, "html.parser")
    entries: list[dict[str, str]] = []
    seen: set[str] = set()
    for a in soup.find_all("a", href=True):
        t = re.sub(r"\s+", " ", a.get_text(" ", strip=True))
        h = a["href"]
        if "Content2.aspx" not in h:
            continue
        m = re.search(r"(20\d{2})年(\d{1,2})月(\d{1,2})日", t)
        if not m:
            continue
        date = f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"
        if date in seen:
            continue
        seen.add(date)
        entries.append(
            {
                "title": t,
                "url": abs_url(h, DAILY_ASPX_BASE),
                "date": date,
            }
        )

    latest_detail = None
    if entries:
        detail_url = entries[0]["url"]
        try:
            print(f"GET daily detail {detail_url}")
            dhtml = fetch(detail_url)
            dsoup = BeautifulSoup(dhtml, "html.parser")
            nums = 0
            for tr in dsoup.find_all("tr"):
                for c in tr.find_all(["td", "th"]):
                    if _parse_number(_cell_text(c)) is not None:
                        nums += 1
            latest_detail = {
                "url": detail_url,
                "title": entries[0]["title"],
                "date": entries[0]["date"],
                "hasImageStats": "image.aspx" in dhtml,
                "hasHtmlTable": bool(dsoup.find("table")),
                "numericTableCells": nums,
            }
            if nums >= 4 and latest_detail["hasHtmlTable"]:
                # Unexpected: real HTML table — mark available for future parser
                base.update(
                    {
                        "ok": True,
                        "available": True,
                        "flag": "daily_html_table_present",
                        "messageZh": "日表 HTML 表可用（需扩展解析器）",
                        "url": DAILY_ASPX_LIST,
                        "aspxListOk": True,
                        "recentDays": entries[:10],
                        "latestDetail": latest_detail,
                        "note": "检测到 HTML 数字表，可扩展解析；当前仍以月报驱动行情。",
                    }
                )
                return base
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            latest_detail = {"url": detail_url, "error": str(e)}

    base.update(
        {
            "url": DAILY_ASPX_LIST,
            "reason": (
                "daily detail publishes stats as image.aspx (no HTML table to parse); "
                "monthly report remains source of truth"
            ),
            "aspxListOk": True,
            "recentDays": entries[:10],
            "latestDetail": latest_detail,
            "note": (
                "ASPX 列表可访问，详情成交数字以图片发布，本流水线不做 OCR；"
                "行情以月报为准。"
            ),
        }
    )
    return base


def build_history(items: list[dict[str, str]], n: int = HISTORY_MONTHS) -> dict[str, Any]:
    take = items[:n]
    months: list[dict[str, Any]] = []
    for meta in reversed(take):
        print(f"GET history {meta['year']}-{meta['month']} {meta['url']}")
        detail = parse_detail(fetch(meta["url"]), meta)
        months.append(
            {
                "period": detail["period"],
                "year": detail["year"],
                "month": detail["month"],
                "title": detail["title"],
                "url": detail["url"],
                "publishDate": detail["publishDate"],
                "cityHousingUnits": detail["city"]["housingUnits"],
                "cityHousingAreaSqm": detail["city"]["housingAreaSqm"],
                "donghuHousingUnits": detail["donghuGaoxin"]["housingUnits"],
                "donghuHousingAreaSqm": detail["donghuGaoxin"]["housingAreaSqm"],
                "sourceOrg": detail["sourceOrg"],
            }
        )
    return {
        "series": "新建商品房成交统计情况（商品住房）",
        "sourceOrg": "武汉市住房和城市更新局",
        "listUrl": LIST_URL,
        "fetchedAt": now_shanghai().isoformat(timespec="seconds"),
        "months": months,
    }


def load_previous() -> dict[str, Any] | None:
    path = OUT_DIR / "latest_monthly.json"
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    fetched_at = now_shanghai().isoformat(timespec="seconds")

    print(f"GET list {LIST_URL}")
    list_html = fetch(LIST_URL)
    items = parse_list(list_html)
    if not items:
        print("ERROR: no monthly report links on list page", file=sys.stderr)
        return 1

    newest = items[0]
    prior_meta = items[1] if len(items) > 1 else None
    print(f"newest: {newest['title']} -> {newest['url']}")

    prev_snap = load_previous()
    newer_than_stored = True
    if prev_snap and prev_snap.get("url") == newest["url"]:
        newer_than_stored = False
        print("note: newest list URL matches last stored snapshot (no newer monthly yet)")
    elif prev_snap:
        print(
            f"newer monthly detected vs stored "
            f"{prev_snap.get('period')} / {prev_snap.get('url')}"
        )

    print(f"GET detail {newest['url']}")
    detail_html = fetch(newest["url"])
    current = parse_detail(detail_html, newest)

    prior: dict[str, Any] | None = None
    if prior_meta:
        print(f"GET prior {prior_meta['url']}")
        prior_html = fetch(prior_meta["url"])
        prior = parse_detail(prior_html, prior_meta)

    mom: dict[str, Any] = {}
    if prior:
        mom = {
            "priorPeriod": prior["period"],
            "priorUrl": prior["url"],
            "cityHousingUnitsPct": mom_pct(
                current["city"]["housingUnits"], prior["city"]["housingUnits"]
            ),
            "cityHousingAreaPct": mom_pct(
                current["city"]["housingAreaSqm"], prior["city"]["housingAreaSqm"]
            ),
            "donghuHousingUnitsPct": mom_pct(
                current["donghuGaoxin"]["housingUnits"],
                prior["donghuGaoxin"]["housingUnits"],
            ),
            "donghuHousingAreaPct": mom_pct(
                current["donghuGaoxin"]["housingAreaSqm"],
                prior["donghuGaoxin"]["housingAreaSqm"],
            ),
        }

    snapshot = {
        **current,
        "fetchedAt": fetched_at,
        "listUrl": LIST_URL,
        "newerThanStored": newer_than_stored,
        "previousStoredUrl": (prev_snap or {}).get("url"),
        "mom": mom,
        "prior": (
            {
                "period": prior["period"],
                "url": prior["url"],
                "publishDate": prior["publishDate"],
                "city": prior["city"],
                "donghuGaoxin": {
                    "housingUnits": prior["donghuGaoxin"]["housingUnits"],
                    "housingAreaSqm": prior["donghuGaoxin"]["housingAreaSqm"],
                },
            }
            if prior
            else None
        ),
    }

    out_monthly = OUT_DIR / "latest_monthly.json"
    out_monthly.write_text(
        json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"wrote {out_monthly.relative_to(ROOT)}")
    print(
        f"city units={current['city']['housingUnits']} "
        f"area={current['city']['housingAreaSqm']} | "
        f"donghu units={current['donghuGaoxin']['housingUnits']} "
        f"area={current['donghuGaoxin']['housingAreaSqm']}"
    )

    # History (reuses newest/prior pages already fetched when possible)
    try:
        history = build_history(items, HISTORY_MONTHS)
        out_hist = OUT_DIR / "history_monthly.json"
        out_hist.write_text(
            json.dumps(history, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        print(f"wrote {out_hist.relative_to(ROOT)} months={len(history['months'])}")
    except Exception as e:
        print(f"WARN: history_monthly failed: {e}", file=sys.stderr)

    daily = try_daily()
    out_daily = OUT_DIR / "latest_daily.json"
    out_daily.write_text(
        json.dumps(daily, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"wrote {out_daily.relative_to(ROOT)} ok={daily.get('ok')}")
    if not daily.get("ok"):
        print(f"daily gap: {daily.get('reason')}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
