#!/usr/bin/env python3
"""Merge data/official/latest_monthly.json into data/market.json.

Only writes parsed official figures. Exits non-zero if snapshot missing/invalid;
leaves market.json unchanged on failure.
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
MARKET = ROOT / "data" / "market.json"
MONTHLY = ROOT / "data" / "official" / "latest_monthly.json"
DAILY = ROOT / "data" / "official" / "latest_daily.json"
TZ_SH = timezone(timedelta(hours=8))


def fmt_int(n: float | int) -> str:
    return f"{int(round(float(n))):,}".replace(",", "")


def fmt_area_wan(sqm: float | int) -> str:
    return f"{float(sqm) / 10000.0:.2f}"


def fmt_mom(pct: float | None) -> tuple[str, str]:
    """Return (delta fragment, trend up|down|flat)."""
    if pct is None:
        return ("环比 —", "flat")
    if abs(pct) < 0.05:
        return ("环比持平", "flat")
    arrow = "−" if pct < 0 else "+"
    trend = "down" if pct < 0 else "up"
    return (f"环比 {arrow}{abs(pct):.1f}%", trend)


def build_judgment(snap: dict[str, Any]) -> str:
    period = snap["period"]  # YYYY-MM
    y, m = period.split("-")
    period_zh = f"{y}年{int(m)}月"
    city_u = int(snap["city"]["housingUnits"])
    dh_u = int(snap["donghuGaoxin"]["housingUnits"])
    mom = snap.get("mom") or {}
    city_pct = mom.get("cityHousingUnitsPct")
    dh_pct = mom.get("donghuHousingUnitsPct")

    def pct_zh(p: float | None) -> str:
        if p is None:
            return "环比数据暂缺"
        if abs(p) < 0.05:
            return "环比持平"
        sign = "−" if p < 0 else "+"
        return f"环比{sign}{abs(p):.1f}%"

    city_mom = pct_zh(city_pct)
    dh_mom = pct_zh(dh_pct)

    if city_pct is not None and dh_pct is not None:
        if dh_pct < city_pct - 0.5:
            rel = "东湖高新环比降幅大于全市，板块成交降温相对更明显"
        elif dh_pct > city_pct + 0.5:
            rel = "东湖高新环比好于全市，板块成交相对更有韧性"
        else:
            rel = "东湖高新与全市环比走势大致同步"
    else:
        rel = "（缺上月对照，暂不作环比相对判断）"

    return (
        f"据武汉市住更局《{period_zh}新建商品房成交统计情况》，"
        f"全市商品住房成交{city_u}套（{city_mom}），"
        f"东湖高新区{dh_u}套（{dh_mom}，光谷东公开行政区代理指标）。"
        f"{rel}。"
        f"行情指标来自住更局公开月报；楼盘卡片仍为示意，不构成交易或投资建议。"
    )


def apply(market: dict[str, Any], snap: dict[str, Any]) -> dict[str, Any]:
    now = datetime.now(TZ_SH)
    updated_at = now.isoformat(timespec="seconds")
    updated_label = now.strftime("%Y-%m-%d %H:%M") + "（住更局月报）"

    period = snap["period"]
    y, m = period.split("-")
    period_zh = f"{y}年{int(m)}月"
    city_u = snap["city"]["housingUnits"]
    city_a = snap["city"]["housingAreaSqm"]
    dh_u = snap["donghuGaoxin"]["housingUnits"]
    dh_a = snap["donghuGaoxin"]["housingAreaSqm"]
    mom = snap.get("mom") or {}

    city_delta, city_trend = fmt_mom(mom.get("cityHousingUnitsPct"))
    dh_delta, dh_trend = fmt_mom(mom.get("donghuHousingUnitsPct"))
    area_delta, area_trend = fmt_mom(mom.get("cityHousingAreaPct"))

    daily_note = ""
    if DAILY.exists():
        try:
            daily = json.loads(DAILY.read_text(encoding="utf-8"))
            if not daily.get("ok"):
                daily_note = "每日成交页暂不可解析，指标以月报为准。"
        except (json.JSONDecodeError, OSError):
            pass

    status = f"{period_zh}月报已接入"
    if daily_note:
        status += " · 无每日表"

    market = dict(market)
    market["sample"] = False
    market["official"] = {
        "period": period,
        "periodLabel": period_zh,
        "publishDate": snap.get("publishDate"),
        "url": snap["url"],
        "fetchedAt": snap.get("fetchedAt"),
        "cityHousingUnits": city_u,
        "cityHousingAreaSqm": city_a,
        "donghuHousingUnits": dh_u,
        "donghuHousingAreaSqm": dh_a,
        "mom": mom,
        "sourceOrg": snap.get("sourceOrg", "武汉市住房和城市更新局"),
    }
    market["updatedAt"] = updated_at
    market["updatedLabel"] = updated_label
    market["referencePrice"] = {
        "value": int(dh_u) if float(dh_u) == int(dh_u) else dh_u,
        "unit": "套",
        "label": "东湖高新商品住房成交",
        "note": f"{period_zh} · 住更局月报",
    }
    market["judgment"] = build_judgment(snap)
    market["metrics"] = [
        {
            "id": "city_units",
            "label": "全市商品住房成交",
            "value": fmt_int(city_u),
            "delta": f"套 · {period_zh} · {city_delta}",
            "trend": city_trend if city_trend != "flat" else "down",
            "official": True,
        },
        {
            "id": "donghu_units",
            "label": "东湖高新商品住房成交",
            "value": fmt_int(dh_u),
            "delta": f"套 · {period_zh} · {dh_delta}",
            "trend": dh_trend if dh_trend != "flat" else "down",
            "official": True,
        },
        {
            "id": "city_area",
            "label": "全市成交面积",
            "value": fmt_area_wan(city_a),
            "delta": f"万㎡ · {period_zh} · {area_delta}",
            "trend": area_trend if area_trend != "flat" else "down",
            "official": True,
        },
    ]
    market["cityPulse"] = {
        "title": "光谷东市场脉搏",
        "en": "City Pulse · Wuhan",
        "status": status,
    }
    market["sources"] = [
        f"武汉市住房和城市更新局《{period_zh}新建商品房成交统计情况》 {snap['url']}",
        "东湖高新区商品住房成交作为光谷东聚焦的公开行政区代理指标",
        "楼盘精选卡片仍为示意样本，非备案核验结果；地铁/配套距离为步行示意",
    ]
    market["cadence"] = (
        "每日可运行 scripts/fetch_zgj_stats.py → apply_official_to_market.py → "
        "generate-embed.py；有新月报时刷新行情指标。每日成交列表页目前为 JS/外链，"
        "暂以月报 + 更新时间戳为准。"
    )
    market["disclaimer"] = (
        "行情指标（全市/东湖高新商品住房成交套数与面积及环比）来自武汉市住房和城市更新局"
        "公开月报，由本站脚本抓取汇总；楼盘卡片名称与报价仍为示意，仅供产品演示，"
        "不构成交易或投资建议。备案信息请以住更局公开渠道为准。"
        + (f" {daily_note}" if daily_note else "")
    )
    # keep curated ids untouched
    return market


def validate_snap(snap: dict[str, Any]) -> None:
    required = ["period", "url", "city", "donghuGaoxin"]
    for k in required:
        if k not in snap:
            raise ValueError(f"snapshot missing {k}")
    for block in ("city", "donghuGaoxin"):
        for field in ("housingUnits", "housingAreaSqm"):
            if field not in snap[block]:
                raise ValueError(f"snapshot {block} missing {field}")
            v = snap[block][field]
            if not isinstance(v, (int, float)):
                raise ValueError(f"snapshot {block}.{field} not numeric")


def main() -> int:
    if not MONTHLY.exists():
        print(f"ERROR: missing {MONTHLY}; run fetch_zgj_stats.py first", file=sys.stderr)
        return 1
    try:
        snap = json.loads(MONTHLY.read_text(encoding="utf-8"))
        validate_snap(snap)
    except (json.JSONDecodeError, ValueError, OSError) as e:
        print(f"ERROR: invalid monthly snapshot: {e}", file=sys.stderr)
        return 1

    try:
        market = json.loads(MARKET.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as e:
        print(f"ERROR: cannot read market.json: {e}", file=sys.stderr)
        return 1

    updated = apply(market, snap)
    MARKET.write_text(
        json.dumps(updated, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"updated {MARKET.relative_to(ROOT)}")
    print("judgment:")
    print(updated["judgment"])
    print("metrics:")
    for m in updated["metrics"]:
        print(f"  - {m['label']}: {m['value']} ({m['delta']}) trend={m['trend']}")
    print(
        f"referencePrice: {updated['referencePrice']['value']} "
        f"{updated['referencePrice']['unit']}"
    )
    print(f"source: {snap['url']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
