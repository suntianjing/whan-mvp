(function () {
  "use strict";

  var CACHE = null;
  var COMPARE_KEY = "whan_compare";
  var FAV_KEY = "whan_favorites";
  var COMPARE_MAX = 3;
  var FILING_DEFAULT = "http://spfxm.whfgxx.org.cn:8083/spfxmcx/spfcx_index.aspx";

  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }
  function qsa(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }
  function params() {
    var p = {};
    location.search.replace(/^\?/, "").split("&").forEach(function (pair) {
      if (!pair) return;
      var kv = pair.split("=");
      p[decodeURIComponent(kv[0])] = decodeURIComponent((kv[1] || "").replace(/\+/g, " "));
    });
    return p;
  }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function toast(msg) {
    var el = qs("#toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "toast";
      el.className = "toast";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () {
      el.classList.remove("show");
    }, 1800);
  }
  function fetchJson(path) {
    return fetch(path, { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }
  function loadStore(key) {
    try {
      var raw = localStorage.getItem(key);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }
  function saveStore(key, arr) {
    try {
      localStorage.setItem(key, JSON.stringify(arr));
    } catch (e) {}
  }
  function entryKey(type, id) {
    return type + ":" + id;
  }
  function hasEntry(list, type, id) {
    var k = entryKey(type, id);
    return list.some(function (x) {
      return entryKey(x.type, x.id) === k;
    });
  }
  function toggleFav(type, id) {
    var list = loadStore(FAV_KEY);
    if (hasEntry(list, type, id)) {
      list = list.filter(function (x) {
        return entryKey(x.type, x.id) !== entryKey(type, id);
      });
      saveStore(FAV_KEY, list);
      toast("已取消收藏");
      return false;
    }
    list.push({ type: type, id: id, at: Date.now() });
    saveStore(FAV_KEY, list);
    toast("已收藏");
    return true;
  }
  function addCompare(type, id) {
    var list = loadStore(COMPARE_KEY);
    if (hasEntry(list, type, id)) {
      toast("已在对比列表");
      return list;
    }
    if (list.length >= COMPARE_MAX) {
      toast("对比最多 " + COMPARE_MAX + " 项，请先到对比页移除");
      return list;
    }
    list.push({ type: type, id: id, at: Date.now() });
    saveStore(COMPARE_KEY, list);
    toast("已加入对比（" + list.length + "/" + COMPARE_MAX + "）");
    return list;
  }
  function removeCompare(type, id) {
    var list = loadStore(COMPARE_KEY).filter(function (x) {
      return entryKey(x.type, x.id) !== entryKey(type, id);
    });
    saveStore(COMPARE_KEY, list);
    return list;
  }

  function loadData() {
    if (CACHE) return Promise.resolve(CACHE);
    var embed = window.WHAN_EMBED;
    return Promise.all([
      fetchJson("data/market.json").catch(function () { return null; }),
      fetchJson("data/newhomes.json").catch(function () { return null; }),
      fetchJson("data/secondhand.json").catch(function () { return null; }),
      fetchJson("data/official/history_monthly.json").catch(function () { return null; }),
      fetchJson("data/official/latest_daily.json").catch(function () { return null; })
    ]).then(function (parts) {
      var market = parts[0];
      var newhomes = parts[1];
      var secondhand = parts[2];
      var history = parts[3];
      var daily = parts[4];
      if (market && newhomes && secondhand) {
        CACHE = {
          market: market,
          newhomes: newhomes,
          secondhand: secondhand,
          history: history || (embed && embed.history) || null,
          daily: daily || (embed && embed.daily) || null,
          source: "fetch"
        };
        return CACHE;
      }
      if (embed && embed.market && embed.newhomes && embed.secondhand) {
        CACHE = {
          market: market || embed.market,
          newhomes: newhomes || embed.newhomes,
          secondhand: secondhand || embed.secondhand,
          history: history || embed.history || null,
          daily: daily || embed.daily || null,
          source: "embed"
        };
        return CACHE;
      }
      throw new Error("无法加载数据：请用本地服务打开，或确认 js/data-embed.js 存在。");
    });
  }

  function byId(list, id) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }
  function pickIds(items, ids) {
    var out = [];
    (ids || []).forEach(function (id) {
      var it = byId(items, id);
      if (it) out.push(it);
    });
    return out;
  }
  function resolveItem(data, type, id) {
    return type === "sh"
      ? byId(data.secondhand.items, id)
      : byId(data.newhomes.items, id);
  }
  function itemType(kind) {
    return kind === "sh" || kind === "secondhand" ? "sh" : "new";
  }
  function priceOf(item, type) {
    if (type === "sh") return item.pricePerSqm || 0;
    return item.price || 0;
  }
  function daylightAvg(item) {
    var d = item.daylight || [];
    if (!d.length) return null;
    var s = 0;
    d.forEach(function (x) { s += x.score || 0; });
    return Math.round(s / d.length);
  }

  function floorSvg(kind) {
    if (kind === "two-bed") {
      return (
        '<svg class="floor-svg" viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg" aria-label="户型示意">' +
        '<rect x="8" y="8" width="304" height="184" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="1.5"/>' +
        '<rect x="8" y="8" width="170" height="100" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.28)" stroke-width="1"/>' +
        '<text x="93" y="62" text-anchor="middle" fill="#8a8a8a" font-size="11" font-family="system-ui">客厅</text>' +
        '<rect x="178" y="8" width="134" height="60" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="1"/>' +
        '<text x="245" y="42" text-anchor="middle" fill="#8a8a8a" font-size="10" font-family="system-ui">厨房</text>' +
        '<rect x="178" y="68" width="134" height="40" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="1"/>' +
        '<text x="245" y="92" text-anchor="middle" fill="#8a8a8a" font-size="10" font-family="system-ui">卫</text>' +
        '<rect x="8" y="108" width="170" height="36" fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.2)" stroke-width="1" stroke-dasharray="4 3"/>' +
        '<text x="93" y="131" text-anchor="middle" fill="#8a8a8a" font-size="10" font-family="system-ui">阳台 · 南</text>' +
        '<rect x="8" y="144" width="150" height="48" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="1"/>' +
        '<text x="83" y="172" text-anchor="middle" fill="#8a8a8a" font-size="10" font-family="system-ui">主卧</text>' +
        '<rect x="158" y="144" width="154" height="48" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="1"/>' +
        '<text x="235" y="172" text-anchor="middle" fill="#8a8a8a" font-size="10" font-family="system-ui">次卧</text>' +
        "</svg>"
      );
    }
    if (kind === "four-bed") {
      return (
        '<svg class="floor-svg" viewBox="0 0 320 220" xmlns="http://www.w3.org/2000/svg" aria-label="户型示意">' +
        '<rect x="8" y="8" width="304" height="204" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="1.5"/>' +
        '<rect x="8" y="8" width="150" height="100" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.28)" stroke-width="1"/>' +
        '<text x="83" y="62" text-anchor="middle" fill="#8a8a8a" font-size="11" font-family="system-ui">客厅</text>' +
        '<rect x="158" y="8" width="78" height="60" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="1"/>' +
        '<text x="197" y="42" text-anchor="middle" fill="#8a8a8a" font-size="10" font-family="system-ui">餐厅</text>' +
        '<rect x="236" y="8" width="76" height="60" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="1"/>' +
        '<text x="274" y="42" text-anchor="middle" fill="#8a8a8a" font-size="10" font-family="system-ui">厨房</text>' +
        '<rect x="158" y="68" width="78" height="40" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="1"/>' +
        '<text x="197" y="92" text-anchor="middle" fill="#8a8a8a" font-size="10" font-family="system-ui">卫</text>' +
        '<rect x="236" y="68" width="76" height="40" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="1"/>' +
        '<text x="274" y="92" text-anchor="middle" fill="#8a8a8a" font-size="10" font-family="system-ui">卫</text>' +
        '<rect x="8" y="108" width="150" height="36" fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.2)" stroke-width="1" stroke-dasharray="4 3"/>' +
        '<text x="83" y="131" text-anchor="middle" fill="#8a8a8a" font-size="10" font-family="system-ui">阳台 · 南</text>' +
        '<rect x="8" y="144" width="90" height="68" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="1"/>' +
        '<text x="53" y="182" text-anchor="middle" fill="#8a8a8a" font-size="10" font-family="system-ui">主卧</text>' +
        '<rect x="98" y="144" width="80" height="68" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="1"/>' +
        '<text x="138" y="182" text-anchor="middle" fill="#8a8a8a" font-size="10" font-family="system-ui">次卧</text>' +
        '<rect x="178" y="108" width="66" height="104" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="1"/>' +
        '<text x="211" y="164" text-anchor="middle" fill="#8a8a8a" font-size="10" font-family="system-ui">次卧</text>' +
        '<rect x="244" y="108" width="68" height="104" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="1"/>' +
        '<text x="278" y="164" text-anchor="middle" fill="#8a8a8a" font-size="10" font-family="system-ui">书房</text>' +
        "</svg>"
      );
    }
    if (kind === "three-bed-compact") {
      return (
        '<svg class="floor-svg" viewBox="0 0 320 210" xmlns="http://www.w3.org/2000/svg" aria-label="户型示意">' +
        '<rect x="8" y="8" width="304" height="194" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="1.5"/>' +
        '<rect x="8" y="8" width="168" height="100" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.28)" stroke-width="1"/>' +
        '<text x="92" y="62" text-anchor="middle" fill="#8a8a8a" font-size="11" font-family="system-ui">客厅</text>' +
        '<rect x="176" y="8" width="136" height="55" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="1"/>' +
        '<text x="244" y="40" text-anchor="middle" fill="#8a8a8a" font-size="10" font-family="system-ui">厨房</text>' +
        '<rect x="176" y="63" width="136" height="45" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="1"/>' +
        '<text x="244" y="90" text-anchor="middle" fill="#8a8a8a" font-size="10" font-family="system-ui">卫</text>' +
        '<rect x="8" y="108" width="168" height="34" fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.2)" stroke-width="1" stroke-dasharray="4 3"/>' +
        '<text x="92" y="130" text-anchor="middle" fill="#8a8a8a" font-size="10" font-family="system-ui">阳台 · 南</text>' +
        '<rect x="8" y="142" width="100" height="60" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="1"/>' +
        '<text x="58" y="176" text-anchor="middle" fill="#8a8a8a" font-size="10" font-family="system-ui">主卧</text>' +
        '<rect x="108" y="142" width="88" height="60" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="1"/>' +
        '<text x="152" y="176" text-anchor="middle" fill="#8a8a8a" font-size="10" font-family="system-ui">次卧</text>' +
        '<rect x="196" y="108" width="116" height="94" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="1"/>' +
        '<text x="254" y="160" text-anchor="middle" fill="#8a8a8a" font-size="10" font-family="system-ui">次卧</text>' +
        "</svg>"
      );
    }
    return (
      '<svg class="floor-svg" viewBox="0 0 320 220" xmlns="http://www.w3.org/2000/svg" aria-label="户型示意">' +
      '<rect x="8" y="8" width="304" height="204" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="1.5"/>' +
      '<rect x="8" y="8" width="160" height="110" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.28)" stroke-width="1"/>' +
      '<text x="88" y="68" text-anchor="middle" fill="#8a8a8a" font-size="11" font-family="system-ui">客厅</text>' +
      '<rect x="168" y="8" width="72" height="70" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="1"/>' +
      '<text x="204" y="48" text-anchor="middle" fill="#8a8a8a" font-size="10" font-family="system-ui">厨房</text>' +
      '<rect x="240" y="8" width="72" height="70" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="1"/>' +
      '<text x="276" y="48" text-anchor="middle" fill="#8a8a8a" font-size="10" font-family="system-ui">卫</text>' +
      '<rect x="8" y="118" width="160" height="40" fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.2)" stroke-width="1" stroke-dasharray="4 3"/>' +
      '<text x="88" y="142" text-anchor="middle" fill="#8a8a8a" font-size="10" font-family="system-ui">阳台 · 南</text>' +
      '<rect x="8" y="158" width="100" height="54" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="1"/>' +
      '<text x="58" y="188" text-anchor="middle" fill="#8a8a8a" font-size="10" font-family="system-ui">主卧</text>' +
      '<rect x="108" y="158" width="80" height="54" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="1"/>' +
      '<text x="148" y="188" text-anchor="middle" fill="#8a8a8a" font-size="10" font-family="system-ui">次卧</text>' +
      '<rect x="188" y="118" width="124" height="94" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="1"/>' +
      '<text x="250" y="168" text-anchor="middle" fill="#8a8a8a" font-size="10" font-family="system-ui">次卧 / 书房</text>' +
      "</svg>"
    );
  }

  function tagsHtml(tags) {
    if (!tags || !tags.length) return "";
    return (
      '<div class="tag-row">' +
      tags.map(function (t) { return '<span class="tag">' + esc(t) + "</span>"; }).join("") +
      "</div>"
    );
  }

  function heroImageUrl(item) {
    var u = item && item.heroImage != null ? String(item.heroImage).trim() : "";
    return u || "";
  }

  /** Geometric CSS fallback when no local hero; never leave an empty frame. */
  function renderHero(item, className, tagText) {
    var url = heroImageUrl(item);
    var tag = '<span class="listing-tag">' + esc(tagText || item.heroLabel || "") + "</span>";
    if (url) {
      return (
        '<div class="' +
        className +
        ' has-hero" style="background-image:linear-gradient(180deg,rgba(0,0,0,0.15),rgba(0,0,0,0.55)),url(\'' +
        esc(url).replace(/'/g, "%27") +
        '\');background-size:cover;background-position:center;">' +
        tag +
        "</div>"
      );
    }
    return '<div class="' + className + ' hero-fallback">' + tag + "</div>";
  }

  function heroStyle(item) {
    var url = heroImageUrl(item);
    if (url) {
      return (
        ' style="background-image:linear-gradient(180deg,rgba(0,0,0,0.15),rgba(0,0,0,0.55)),url(\'' +
        esc(url).replace(/'/g, "%27") +
        '\');background-size:cover;background-position:center;"'
      );
    }
    return "";
  }

  function starBtn(type, id, compact) {
    var on = hasEntry(loadStore(FAV_KEY), type, id);
    return (
      '<button type="button" class="icon-btn fav-btn' +
      (on ? " on" : "") +
      (compact ? " compact" : "") +
      '" data-fav-type="' +
      esc(type) +
      '" data-fav-id="' +
      esc(id) +
      '" aria-label="收藏">' +
      (on ? "★" : "☆") +
      "</button>"
    );
  }

  function bindFavButtons(root) {
    qsa(".fav-btn", root || document).forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        var type = btn.getAttribute("data-fav-type");
        var id = btn.getAttribute("data-fav-id");
        var on = toggleFav(type, id);
        btn.classList.toggle("on", on);
        btn.textContent = on ? "★" : "☆";
      });
    });
  }

  function newCard(item) {
    return (
      '<div class="listing-wrap">' +
      '<a class="listing" href="detail.html?type=new&id=' +
      encodeURIComponent(item.id) +
      '">' +
      renderHero(item, "listing-img", item.heroLabel || "New") +
      '<div class="listing-body">' +
      '<div class="listing-title">' +
      esc(item.name) +
      "</div>" +
      (item.nameNote ? '<div class="listing-note">' + esc(item.nameNote) + "</div>" : "") +
      tagsHtml(item.tags) +
      '<div class="listing-meta">' +
      esc(item.meta) +
      "</div>" +
      '<div class="listing-row">' +
      "<div><span class=\"listing-price\">" +
      Number(item.price).toFixed(2) +
      '</span> <span class="listing-unit">' +
      esc(item.priceUnit) +
      "</span></div>" +
      '<span class="listing-unit">' +
      esc(item.status || "") +
      "</span>" +
      "</div></div></a>" +
      '<div class="listing-actions">' +
      starBtn("new", item.id, true) +
      '<button type="button" class="chip-mini cmp-add" data-cmp-type="new" data-cmp-id="' +
      esc(item.id) +
      '">对比</button></div></div>'
    );
  }

  function shCard(item) {
    return (
      '<div class="listing-wrap">' +
      '<a class="listing" href="detail.html?type=sh&id=' +
      encodeURIComponent(item.id) +
      '">' +
      renderHero(item, "listing-img", item.heroLabel || "Resale") +
      '<div class="listing-body">' +
      '<div class="listing-title">' +
      esc(item.name) +
      (item.unitLabel ? " · " + esc(item.unitLabel) : "") +
      "</div>" +
      (item.nameNote ? '<div class="listing-note">' + esc(item.nameNote) + "</div>" : "") +
      tagsHtml(item.tags) +
      '<div class="listing-meta">' +
      esc(item.meta) +
      "</div>" +
      '<div class="listing-row">' +
      "<div><span class=\"listing-price\">" +
      item.priceTotal +
      '</span> <span class="listing-unit">' +
      esc(item.priceUnit) +
      " · 约 " +
      Number(item.pricePerSqm).toFixed(2) +
      " 万/㎡</span></div>" +
      '<span class="listing-unit">' +
      esc(item.taxStatus || "") +
      "</span>" +
      "</div></div></a>" +
      '<div class="listing-actions">' +
      starBtn("sh", item.id, true) +
      '<button type="button" class="chip-mini cmp-add" data-cmp-type="sh" data-cmp-id="' +
      esc(item.id) +
      '">对比</button></div></div>'
    );
  }

  function bindCompareAdds(root) {
    qsa(".cmp-add", root || document).forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        addCompare(btn.getAttribute("data-cmp-type"), btn.getAttribute("data-cmp-id"));
      });
    });
  }

  function matchFilter(item, filter, kind) {
    if (!filter || filter === "全部") return true;
    if (filter === "~100㎡") {
      var s = item.size || 0;
      if (!s && item.areaRange) {
        var m = String(item.areaRange).match(/(\d+)/);
        s = m ? Number(m[1]) : 0;
      }
      return s >= 88 && s <= 115;
    }
    // price bands new (万/㎡)
    if (kind === "new") {
      if (filter === "≤1.4万") return (item.price || 0) <= 1.4;
      if (filter === "1.4–1.6万") return (item.price || 0) > 1.4 && (item.price || 0) < 1.6;
      if (filter === "≥1.6万") return (item.price || 0) >= 1.6;
      // legacy bands
      if (filter === "≤2.3万") return (item.price || 0) <= 2.3;
      if (filter === "2.3–2.6万") return (item.price || 0) > 2.3 && (item.price || 0) < 2.6;
      if (filter === "≥2.6万") return (item.price || 0) >= 2.6;
    }
    // price bands sh (万/㎡ listing)
    if (kind === "sh") {
      var pps = item.pricePerSqm || 0;
      if (filter === "≤1.3万") return pps <= 1.3;
      if (filter === "1.3–1.45万") return pps > 1.3 && pps < 1.45;
      if (filter === "≥1.45万") return pps >= 1.45;
      if (filter === "≤220万") return (item.priceTotal || 0) <= 220;
      if (filter === "220–250万") return (item.priceTotal || 0) > 220 && (item.priceTotal || 0) < 250;
      if (filter === "≥250万") return (item.priceTotal || 0) >= 250;
    }
    return (item.tags || []).indexOf(filter) !== -1 || item.status === filter || item.taxStatus === filter;
  }

  function trendChartSvg(history) {
    var months = (history && history.months) || [];
    if (!months.length) {
      return '<div class="chart-empty">暂无月度历史 · 运行 fetch_zgj_stats.py 生成 history_monthly.json</div>';
    }
    var valsCity = months.map(function (m) { return Number(m.cityHousingUnits) || 0; });
    var valsDh = months.map(function (m) { return Number(m.donghuHousingUnits) || 0; });
    var max = Math.max.apply(null, valsCity.concat(valsDh).concat([1]));
    var W = 360, H = 140, padL = 28, padR = 8, padT = 12, padB = 28;
    var innerW = W - padL - padR;
    var innerH = H - padT - padB;
    function xAt(i) {
      return padL + (months.length === 1 ? innerW / 2 : (i * innerW) / (months.length - 1));
    }
    function yAt(v) {
      return padT + innerH - (v / max) * innerH;
    }
    function path(vals) {
      return vals
        .map(function (v, i) {
          return (i === 0 ? "M" : "L") + xAt(i).toFixed(1) + " " + yAt(v).toFixed(1);
        })
        .join(" ");
    }
    var labels = months
      .map(function (m, i) {
        var lab = String(m.month) + "月";
        return (
          '<text x="' +
          xAt(i).toFixed(1) +
          '" y="' +
          (H - 8) +
          '" text-anchor="middle" fill="#8a8a8a" font-size="9" font-family="system-ui">' +
          lab +
          "</text>"
        );
      })
      .join("");
    return (
      '<svg class="trend-svg" viewBox="0 0 ' +
      W +
      " " +
      H +
      '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="月度成交趋势">' +
      '<line x1="' + padL + '" y1="' + padT + '" x2="' + padL + '" y2="' + (padT + innerH) + '" stroke="rgba(255,255,255,0.12)"/>' +
      '<line x1="' + padL + '" y1="' + (padT + innerH) + '" x2="' + (W - padR) + '" y2="' + (padT + innerH) + '" stroke="rgba(255,255,255,0.12)"/>' +
      '<path d="' + path(valsCity) + '" fill="none" stroke="#f5f5f5" stroke-width="1.6"/>' +
      '<path d="' + path(valsDh) + '" fill="none" stroke="#7ddea0" stroke-width="1.6"/>' +
      valsCity
        .map(function (v, i) {
          return '<circle cx="' + xAt(i).toFixed(1) + '" cy="' + yAt(v).toFixed(1) + '" r="2.2" fill="#f5f5f5"/>';
        })
        .join("") +
      valsDh
        .map(function (v, i) {
          return '<circle cx="' + xAt(i).toFixed(1) + '" cy="' + yAt(v).toFixed(1) + '" r="2.2" fill="#7ddea0"/>';
        })
        .join("") +
      labels +
      "</svg>" +
      '<div class="chart-legend"><span><i class="lg-city"></i>全市商品住房</span><span><i class="lg-dh"></i>东湖高新</span></div>'
    );
  }

  function dailyBlock(data) {
    var ds = (data.market && data.market.dailyStats) || {};
    var daily = data.daily || {};
    var available = ds.available || daily.ok || daily.available;
    var cityU = ds.cityHousingUnits != null ? ds.cityHousingUnits : (daily.city && daily.city.housingUnits);
    var dhU = ds.donghuHousingUnits != null ? ds.donghuHousingUnits : (daily.donghuGaoxin && daily.donghuGaoxin.housingUnits);
    var date = ds.date || daily.date || daily.numbersDate || "";
    if (!available || cityU == null) {
      return (
        '<div class="daily-card">' +
        '<div class="kicker">Daily · 日表</div>' +
        '<div class="daily-flag">日表暂不可用，已用月报</div>' +
        '<p class="daily-note">' +
        esc(ds.messageZh || daily.messageZh || "ASPX 图待核验") +
        "</p></div>"
      );
    }
    return (
      '<div class="daily-card">' +
      '<div class="kicker">Daily · 昨日网签</div>' +
      '<div class="daily-date">' +
      esc(date) +
      " · 商品住房</div>" +
      '<div class="daily-metrics">' +
      '<div class="metric"><div class="k">全市网签</div><div class="v">' +
      esc(String(cityU)) +
      '</div><div class="d">套</div></div>' +
      '<div class="metric"><div class="k">东湖高新</div><div class="v">' +
      esc(String(dhU)) +
      '</div><div class="d">套 · 光谷东代理</div></div>' +
      "</div>" +
      (daily.detailUrl || ds.detailUrl
        ? '<a class="daily-link" href="' +
          esc(daily.detailUrl || ds.detailUrl) +
          '" target="_blank" rel="noopener noreferrer">原文 / 统计图</a>'
        : "") +
      "</div>"
    );
  }

  function plateBlock(m) {
    var pi = m.plateIndices || {};
    var sh = pi.secondhandListingAvg;
    var nh = pi.newHomeAvg;
    if (!sh && !nh) return "";
    return (
      '<div class="plate-card">' +
      '<div class="kicker">Plate · 板块挂牌指数</div>' +
      '<div class="plate-row">' +
      (sh
        ? '<div><div class="k">二手挂牌均价</div><div class="v">' +
          sh.value +
          '</div><div class="d">' +
          esc(sh.unit) +
          " · " +
          esc(sh.source) +
          " · " +
          esc(sh.asOf) +
          "</div></div>"
        : "") +
      (nh
        ? '<div><div class="k">新房参考</div><div class="v">' +
          nh.value +
          '</div><div class="d">' +
          esc(nh.unit) +
          " · " +
          esc(nh.source) +
          " · " +
          esc(nh.asOf) +
          "</div></div>"
        : "") +
      "</div>" +
      '<p class="plate-note">挂牌参考 · 非网签成交价</p></div>'
    );
  }

  function renderHome(data) {
    var m = data.market;
    var root = qs("#app-root");
    if (!root) return;
    var metrics = (m.metrics || [])
      .slice(0, 3)
      .map(function (x) {
        return (
          '<div class="metric">' +
          '<div class="k">' + esc(x.label) + "</div>" +
          '<div class="v">' + esc(x.value) + "</div>" +
          '<div class="d' + (x.trend === "down" ? " down" : "") + '">' + esc(x.delta) + "</div></div>"
        );
      })
      .join("");
    var curatedNew = pickIds(data.newhomes.items, m.curatedNewIds).slice(0, 2);
    var curatedSh = pickIds(data.secondhand.items, m.curatedSecondhandIds).slice(0, 2);
    root.innerHTML =
      '<div class="page">' +
      '<div class="topbar">' +
      '<div class="brand">' + esc(m.brandZh || "武楼") + "<small>" + esc(m.brand || "WHAN") + "</small></div>" +
      '<div class="pill">' + esc(m.focusArea || "光谷东") + " · 公开行情</div></div>" +
      '<div class="pulse">' +
      '<div class="pulse-loc">' + esc((m.cityPulse && m.cityPulse.en) || "City Pulse") + "</div>" +
      '<div class="pulse-title">' + esc((m.cityPulse && m.cityPulse.title) || "市场脉搏") + "</div>" +
      '<div class="pulse-live"><i></i>' + esc((m.cityPulse && m.cityPulse.status) || "数据加载") + "</div>" +
      '<div class="ref-price"><div class="k">' +
      esc((m.referencePrice && m.referencePrice.label) || "参考") +
      '</div><div><span class="v">' +
      esc((m.referencePrice && m.referencePrice.value) || "—") +
      '</span><span class="u">' +
      esc((m.referencePrice && m.referencePrice.unit) || "") +
      "</span></div></div>" +
      '<div class="metrics">' + metrics + "</div></div>" +
      dailyBlock(data) +
      plateBlock(m) +
      '<div class="judgment"><div class="k">Judgment · 判断</div><p>' + esc(m.judgment || "") + "</p></div>" +
      '<div class="sec"><div class="sec-head"><h2>成交趋势 · 月报</h2></div>' +
      '<div class="chart-card">' + trendChartSvg(data.history) + "</div></div>" +
      '<div class="update-stamp">更新时间 · ' +
      esc(m.updatedLabel || m.updatedAt || "—") +
      " · 数据源 " +
      (data.source === "fetch" ? "JSON" : "内嵌") +
      "</div>" +
      '<div class="sec"><div class="sec-head"><h2>精选新房</h2><a href="new.html">全部</a></div>' +
      curatedNew.map(newCard).join("") +
      "</div>" +
      '<div class="sec" style="margin-bottom:8px"><div class="sec-head"><h2>精选二手</h2><a href="secondhand.html">全部</a></div>' +
      curatedSh.map(shCard).join("") +
      "</div></div>";
    bindFavButtons(root);
    bindCompareAdds(root);
  }

  function renderList(kind, data) {
    var root = qs("#app-root");
    if (!root) return;
    var pack = kind === "new" ? data.newhomes : data.secondhand;
    var filters = pack.filters || ["全部"];
    var active = "全部";
    function paint() {
      var items = (pack.items || []).filter(function (it) {
        return matchFilter(it, active, kind);
      });
      var cards = kind === "new" ? items.map(newCard).join("") : items.map(shCard).join("");
      root.innerHTML =
        '<div class="page">' +
        '<div class="topbar">' +
        '<div class="brand">' + esc(data.market.brandZh || "武楼") + "<small>" + esc(data.market.brand || "WHAN") + "</small></div>" +
        '<div class="pill">' + esc(pack.area || "光谷东") + " · 挂牌参考</div></div>" +
        '<div class="page-head"><h1>' +
        (kind === "new" ? "新房" : "二手") +
        '</h1><p class="sub">' +
        esc(
          kind === "new"
            ? (pack.priceBasis || "公开参考挂牌/在售标价 · 非网签")
            : (pack.focusNote || "精选二手 · 挂牌参考")
        ) +
        "</p></div>" +
        '<div class="filters" id="filters">' +
        filters
          .map(function (f) {
            return (
              '<button type="button" class="chip' +
              (f === active ? " on" : "") +
              '" data-filter="' +
              esc(f) +
              '">' +
              esc(f) +
              "</button>"
            );
          })
          .join("") +
        "</div>" +
        '<div class="list-wrap"><div class="list-count">共 ' +
        items.length +
        " 条</div>" +
        (cards || '<div class="error">无匹配条目</div>') +
        "</div></div>";
      qsa("#filters .chip").forEach(function (btn) {
        btn.addEventListener("click", function () {
          active = btn.getAttribute("data-filter");
          paint();
        });
      });
      bindFavButtons(root);
      bindCompareAdds(root);
    }
    paint();
  }

  function mapBlock(item) {
    if (item.lat == null || item.lng == null) return "";
    var lat = item.lat;
    var lng = item.lng;
    var link = "https://www.openstreetmap.org/?mlat=" + lat + "&mlon=" + lng + "#map=15/" + lat + "/" + lng;
    var staticSrc =
      "https://staticmap.openstreetmap.de/staticmap.php?center=" +
      lat +
      "," +
      lng +
      "&zoom=14&size=780x360&markers=" +
      lat +
      "," +
      lng +
      ",lightblue1";
    var placeholder =
      '<div class="map-placeholder" role="img" aria-label="地图占位">' +
      '<div class="map-placeholder-title">地图暂不可用</div>' +
      '<div class="map-placeholder-coords">' +
      lat +
      ", " +
      lng +
      "</div></div>";
    return (
      '<div class="floor-card map-card"><div class="kicker">Map · 位置（近似）</div>' +
      '<div class="map-frame">' +
      '<img class="map-static" alt="静态地图 ' +
      lat +
      ", " +
      lng +
      '" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="' +
      staticSrc +
      '" onerror="this.style.display=\'none\';var p=this.nextElementSibling;if(p)p.hidden=false;" />' +
      '<div class="map-placeholder" hidden>' +
      '<div class="map-placeholder-title">地图暂不可用</div>' +
      '<div class="map-placeholder-coords">' +
      lat +
      ", " +
      lng +
      "</div></div>" +
      "</div>" +
      '<a class="daily-link" href="' +
      link +
      '" target="_blank" rel="noopener noreferrer">在 OSM 打开 · ' +
      lat +
      ", " +
      lng +
      "</a></div>"
    );
  }

  function filingHref(item, type) {
    if (type === "sh") {
      return item.communitySourceUrl || item.sourceUrl || item.filingUrl || "#";
    }
    var base = item.filingUrl || FILING_DEFAULT;
    var q = item.filingQuery || (item.filingNameHints && item.filingNameHints[0]) || item.name;
    // ASPX portal may ignore query; still pass for documentation / future
    return base + (base.indexOf("?") >= 0 ? "&" : "?") + "q=" + encodeURIComponent(q);
  }

  function renderDetail(data) {
    var root = qs("#app-root");
    if (!root) return;
    var p = params();
    var type = p.type === "sh" ? "sh" : "new";
    var id = p.id || "";
    var item = resolveItem(data, type, id);
    if (!item) {
      root.innerHTML =
        '<div class="page detail"><a class="detail-back" href="index.html">← 返回</a>' +
        '<div class="error">未找到该条目</div></div>';
      return;
    }
    var backHref = type === "sh" ? "secondhand.html" : "new.html";
    var priceHtml =
      type === "sh"
        ? '<div class="detail-price">' +
          item.priceTotal +
          '<span class="u">万 · 约 ' +
          Number(item.pricePerSqm).toFixed(2) +
          " 万/㎡ · 挂牌参考</span></div>"
        : '<div class="detail-price">' +
          Number(item.price).toFixed(2) +
          '<span class="u">' +
          esc(item.priceUnit) +
          " · 挂牌参考</span></div>";
    var daylight = (item.daylight || [])
      .map(function (d) {
        return (
          '<div class="score-row"><div class="score-label">' +
          esc(d.label) +
          '</div><div class="score-bar"><span style="width:' +
          d.score +
          '%"></span></div><div class="score-num">' +
          d.score +
          "</div></div>"
        );
      })
      .join("");
    var amenities = (item.amenities || [])
      .map(function (a) {
        return (
          '<div class="dist-item"><span class="name">' +
          esc(a.name) +
          '</span><span class="far">' +
          esc(a.distance) +
          "</span></div>"
        );
      })
      .join("");
    var specs = (item.specs || [])
      .map(function (s) {
        return (
          '<div class="spec-cell"><div class="k">' +
          esc(s.k) +
          '</div><div class="v">' +
          esc(s.v) +
          "</div></div>"
        );
      })
      .join("");
    var layout = item.layout || {};
    var filing = filingHref(item, type);
    var filingLabel =
      type === "sh"
        ? esc(item.communitySourceLabel || "小区来源页")
        : "查看备案 · " + esc(item.filingQuery || item.name);
    var inCmp = hasEntry(loadStore(COMPARE_KEY), type, id);
    root.innerHTML =
      '<div class="page detail">' +
      '<div class="detail-top">' +
      '<a class="detail-back" href="' + backHref + '">← 返回 · ' + esc(data.market.brandZh || "武楼") + "</a>" +
      starBtn(type, id, false) +
      "</div>" +
      renderHero(item, "detail-hero", item.heroLabel || "光谷东") +
      (item.imageAttribution
        ? '<p class="img-attr">' + esc(item.imageAttribution) + "</p>"
        : "") +
      '<h1 class="detail-title">' +
      esc(item.name) +
      (item.unitLabel ? " · " + esc(item.unitLabel) : "") +
      "</h1>" +
      '<p class="detail-sub">' +
      esc(item.area || "光谷东") +
      " · " +
      esc(item.nameNote || "挂牌参考") +
      (layout.title ? " · " + esc(layout.title) : "") +
      "</p>" +
      priceHtml +
      tagsHtml(item.tags) +
      '<div class="floor-card"><div class="kicker">Floor Plan · 户型示意' +
      (layout.schematic !== false ? "（几何示意）" : "") +
      "</div>" +
      floorSvg(layout.svg || "three-bed") +
      '<div class="floor-legend"><span><i style="background:rgba(255,255,255,0.08)"></i>起居</span>' +
      '<span><i style="border-style:dashed"></i>阳台</span><span><i></i>房间</span></div></div>' +
      '<div class="floor-card"><div class="kicker">Daylight · 采光评分（示意）</div>' +
      daylight +
      "</div>" +
      '<div class="floor-card"><div class="kicker">Amenities · 配套</div><div class="dist-list">' +
      amenities +
      "</div></div>" +
      mapBlock(item) +
      '<div class="floor-card" style="padding:0;overflow:hidden">' +
      '<div class="kicker" style="padding:16px 16px 0">Specs · 规格</div>' +
      '<div class="spec-grid" style="border:none;border-radius:0;margin-top:12px">' +
      specs +
      "</div></div>" +
      '<div class="cta-row">' +
      '<button type="button" class="btn btn-primary" id="btn-compare"' +
      (inCmp ? " disabled" : "") +
      ">" +
      (inCmp ? "已加入对比" : "加入对比") +
      "</button>" +
      '<a class="btn btn-ghost" id="btn-filing" href="' +
      esc(filing) +
      '" target="_blank" rel="noopener noreferrer">' +
      filingLabel +
      "</a>" +
      (item.sourceUrl
        ? '<a class="btn btn-ghost" href="' +
          esc(item.sourceUrl) +
          '" target="_blank" rel="noopener noreferrer">来源页</a>'
        : "") +
      '<a class="btn btn-ghost" href="compare.html">打开对比页</a>' +
      "</div>" +
      '<p class="caption">挂牌参考 · 不构成交易或投资建议<br>' +
      (type === "new"
        ? "备案：住更局「商品房项目查询」中搜索「" +
          esc(item.filingQuery || item.name) +
          "」"
        : "二手来源页为小区公开挂牌入口") +
      "</p></div>";
    bindFavButtons(root);
    var btn = qs("#btn-compare");
    if (btn && !inCmp) {
      btn.addEventListener("click", function () {
        addCompare(type, id);
        btn.textContent = "已加入对比";
        btn.classList.add("is-done");
        btn.disabled = true;
      });
    }
    if (type === "new") {
      var fb = qs("#btn-filing");
      if (fb) {
        fb.addEventListener("click", function () {
          var q = item.filingQuery || item.name;
          try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(q);
            }
          } catch (e) {}
          toast("已复制项目名：请在查询页粘贴搜索");
        });
      }
    }
  }

  function renderCompare(data) {
    var root = qs("#app-root");
    if (!root) return;
    var list = loadStore(COMPARE_KEY);
    var items = [];
    list.forEach(function (e) {
      var it = resolveItem(data, e.type, e.id);
      if (it) items.push({ type: e.type, item: it });
    });
    if (!items.length) {
      root.innerHTML =
        '<div class="page">' +
        '<div class="topbar"><div class="brand">' +
        esc(data.market.brandZh || "武楼") +
        "<small>" +
        esc(data.market.brand || "WHAN") +
        '</small></div><div class="pill">对比</div></div>' +
        '<div class="page-head"><h1>对比</h1><p class="sub">从详情或列表点「加入对比」，最多 3 项</p></div>' +
        '<div class="empty-state">暂无对比项<br><a href="new.html">去新房</a> · <a href="secondhand.html">去二手</a></div></div>';
      return;
    }
    function cell(label, vals) {
      return (
        '<div class="cmp-row"><div class="cmp-k">' +
        esc(label) +
        "</div>" +
        vals
          .map(function (v) {
            return '<div class="cmp-v">' + v + "</div>";
          })
          .join("") +
        "</div>"
      );
    }
    var names = items.map(function (x) {
      return (
        '<div class="cmp-head-cell"><div class="cmp-name">' +
        esc(x.item.name) +
        '</div><div class="cmp-type">' +
        (x.type === "sh" ? "二手" : "新房") +
        '</div><button type="button" class="chip-mini cmp-rm" data-type="' +
        x.type +
        '" data-id="' +
        esc(x.item.id) +
        '">移除</button>' +
        '<a class="daily-link" href="detail.html?type=' +
        x.type +
        "&id=" +
        encodeURIComponent(x.item.id) +
        '">详情</a></div>'
      );
    });
    var prices = items.map(function (x) {
      if (x.type === "sh") {
        return esc(x.item.priceTotal + " 万 / " + Number(x.item.pricePerSqm).toFixed(2) + " 万/㎡");
      }
      return esc(Number(x.item.price).toFixed(2) + " " + (x.item.priceUnit || ""));
    });
    var areas = items.map(function (x) {
      return esc(x.item.areaRange || (x.item.size ? x.item.size + "㎡" : x.item.area || "—"));
    });
    var orients = items.map(function (x) {
      return esc(x.item.orientation || "—");
    });
    var days = items.map(function (x) {
      var a = daylightAvg(x.item);
      return a == null ? "—" : a + "";
    });
    var amens = items.map(function (x) {
      return (x.item.amenities || [])
        .slice(0, 3)
        .map(function (a) {
          return esc(a.name) + " " + esc(a.distance);
        })
        .join("<br>") || "—";
    });
    root.innerHTML =
      '<div class="page">' +
      '<div class="topbar"><div class="brand">' +
      esc(data.market.brandZh || "武楼") +
      "<small>" +
      esc(data.market.brand || "WHAN") +
      '</small></div><div class="pill">' +
      items.length +
      " / " +
      COMPARE_MAX +
      "</div></div>" +
      '<div class="page-head"><h1>对比</h1><p class="sub">并排查看挂牌参考字段</p></div>' +
      '<div class="cmp-table" style="--cmp-cols:' +
      items.length +
      '">' +
      '<div class="cmp-row cmp-heads"><div class="cmp-k"></div>' +
      names.join("") +
      "</div>" +
      cell("价格", prices) +
      cell("面积", areas) +
      cell("朝向", orients) +
      cell("采光均分", days) +
      cell("配套", amens) +
      "</div>" +
      '<p class="caption">精选盘名为光谷东真实项目 · 价格为公开挂牌/在售参考非网签 · 户型图为几何示意</p></div>';
    qsa(".cmp-rm", root).forEach(function (btn) {
      btn.addEventListener("click", function () {
        removeCompare(btn.getAttribute("data-type"), btn.getAttribute("data-id"));
        renderCompare(data);
      });
    });
  }

  function renderAbout(data) {
    var root = qs("#app-root");
    if (!root) return;
    var m = data.market;
    var sources = (m.sources || [])
      .map(function (s) {
        return "<li>" + esc(s) + "</li>";
      })
      .join("");
    var favs = loadStore(FAV_KEY);
    var favHtml = favs
      .map(function (e) {
        var it = resolveItem(data, e.type, e.id);
        if (!it) return "";
        return (
          '<a class="fav-row" href="detail.html?type=' +
          e.type +
          "&id=" +
          encodeURIComponent(e.id) +
          '"><span>' +
          esc(it.name) +
          '</span><span class="far">' +
          (e.type === "sh" ? "二手" : "新房") +
          "</span></a>"
        );
      })
      .join("");
    var ds = m.dailyStats || {};
    var legend = m.fieldLegend || {};
    root.innerHTML =
      '<div class="page about">' +
      '<div class="topbar">' +
      '<div class="brand">' +
      esc(m.brandZh || "武楼") +
      "<small>" +
      esc(m.brand || "WHAN") +
      '</small></div>' +
      '<span class="sample-badge">Official + Public listings</span></div>' +
      '<div class="page-head"><h1>说明</h1><p class="sub">数据口径、收藏、更新节奏</p></div>' +
      "<h2>收藏</h2>" +
      (favHtml
        ? '<div class="card fav-list">' + favHtml + "</div>"
        : '<p class="sub">暂无收藏 · 在卡片或详情点 ★</p>') +
      "<h2>日表状态</h2>" +
      '<div class="card"><div class="meta-row"><span class="k">状态</span><span>' +
      esc(ds.messageZh || (ds.available ? "日表已接入" : "日表暂不可用，已用月报")) +
      "</span></div>" +
      '<div class="meta-row"><span class="k">日期</span><span>' +
      esc(ds.date || "—") +
      "</span></div>" +
      '<div class="meta-row"><span class="k">全市网签</span><span>' +
      esc(ds.cityHousingUnits != null ? ds.cityHousingUnits + " 套" : "—") +
      "</span></div>" +
      '<div class="meta-row"><span class="k">东湖高新</span><span>' +
      esc(ds.donghuHousingUnits != null ? ds.donghuHousingUnits + " 套" : "—") +
      "</span></div></div>" +
      "<h2>字段口径</h2>" +
      "<p><strong>官方</strong>：" +
      esc((legend.official || []).join("、") || "月报/日表") +
      "<br><strong>公开挂牌</strong>：" +
      esc((legend.listing_public || []).join("、") || "项目名与挂牌价") +
      "<br><strong>示意</strong>：" +
      esc((legend.sample_schematic || []).join("、") || "户型线稿等") +
      "</p>" +
      "<h2>数据说明</h2><p>" +
      esc(m.disclaimer || "") +
      "</p>" +
      '<div class="card">' +
      '<div class="meta-row"><span class="k">聚焦板块</span><span>' +
      esc(m.focusArea || "光谷东") +
      "</span></div>" +
      '<div class="meta-row"><span class="k">最近更新</span><span>' +
      esc(m.updatedLabel || "—") +
      "</span></div>" +
      '<div class="meta-row"><span class="k">加载方式</span><span>' +
      (data.source === "fetch" ? "data/*.json（fetch）" : "js/data-embed.js（内嵌）") +
      "</span></div></div>" +
      "<h2>数据来源</h2><ul>" +
      sources +
      "</ul>" +
      "<h2>更新节奏</h2><p>" +
      esc(m.cadence || "") +
      "</p>" +
      "<h2>精选盘说明</h2><p>精选盘名为光谷东真实项目；价格为公开挂牌/在售参考非网签；户型图为几何示意。</p>" +
      "<h2>品牌</h2><p>WHAN / 武楼 — 原创品牌示意，不借用第三方航天或汽车品牌名称与标识。</p>" +
      "<footer>WHAN · 武楼<br>武汉楼市分析 MVP</footer></div>";
  }

  function boot(page) {
    var root = qs("#app-root");
    if (root) root.innerHTML = '<div class="loading">加载中…</div>';
    loadData()
      .then(function (data) {
        if (page === "home") renderHome(data);
        else if (page === "new") renderList("new", data);
        else if (page === "sh") renderList("sh", data);
        else if (page === "detail") renderDetail(data);
        else if (page === "about") renderAbout(data);
        else if (page === "compare") renderCompare(data);
      })
      .catch(function (err) {
        if (root) {
          root.innerHTML =
            '<div class="error">' +
            esc(err && err.message ? err.message : "加载失败") +
            "<br><br>建议：<code>python3 -m http.server 8765</code></div>";
        }
      });
  }

  window.WHAN = {
    boot: boot,
    toast: toast,
    loadData: loadData,
    addCompare: addCompare,
    toggleFav: toggleFav
  };
})();
