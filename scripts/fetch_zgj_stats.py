#!/usr/bin/env python3
"""Fetch Wuhan ZGJ public housing monthly (and attempt daily) stats.

Respectful: one GET per needed page. User-Agent identifies WHAN personal project.
Writes data/official/latest_monthly.json; optionally latest_daily.json.
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
DAILY_URL = "https://zgj.wuhan.gov.cn/fzlm/mrxjspflby/index.shtml"
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

    # Expected data rows: region + 商品住房套数/面积 as first two numeric cols after name
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
    """Attempt daily list; document when empty / JS / external-only."""
    fetched_at = now_shanghai().isoformat(timespec="seconds")
    try:
        html = fetch(DAILY_URL)
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        return {
            "ok": False,
            "url": DAILY_URL,
            "fetchedAt": fetched_at,
            "reason": f"fetch failed: {e}",
            "note": "每日页不可用；行情依赖月报 + 本流水线更新时间戳。",
        }

    soup = BeautifulSoup(html, "html.parser")
    tables = soup.find_all("table")
    numeric_rows = 0
    for table in tables:
        for tr in table.find_all("tr"):
            cells = [_cell_text(c) for c in tr.find_all(["td", "th"])]
            if any(_parse_number(c) is not None for c in cells):
                numeric_rows += 1

    external: list[str] = []
    for a in soup.find_all("a", href=True):
        t = a.get_text(strip=True)
        h = a["href"]
        if "每日" in t or "spfcjtj" in h or "Sectionlist" in h:
            external.append(abs_url(h, DAILY_URL))

    if numeric_rows == 0:
        return {
            "ok": False,
            "url": DAILY_URL,
            "fetchedAt": fetched_at,
            "reason": "page has no parseable stats table (JS shell / nav only)",
            "externalCandidates": external[:5],
            "note": (
                "zgj 每日列表页本身无成交数字表，侧栏指向外部 ASPX "
                "(如 http://119.97.201.20/spfcjtj/Sectionlist.aspx)。"
                "本流水线不继续锤击外部主机；行情指标以月报为准。"
            ),
        }

    return {
        "ok": True,
        "url": DAILY_URL,
        "fetchedAt": fetched_at,
        "numericRows": numeric_rows,
        "note": "unexpected: daily table present — extend parser if needed",
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

    print(f"GET daily {DAILY_URL}")
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
