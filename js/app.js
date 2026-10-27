(function () {
  "use strict";

  var CACHE = null;

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

  function loadData() {
    if (CACHE) return Promise.resolve(CACHE);
    var embed = window.WHAN_EMBED;
    return Promise.all([
      fetchJson("data/market.json").catch(function () { return null; }),
      fetchJson("data/newhomes.json").catch(function () { return null; }),
      fetchJson("data/secondhand.json").catch(function () { return null; })
    ]).then(function (parts) {
      var market = parts[0];
      var newhomes = parts[1];
      var secondhand = parts[2];
      if (market && newhomes && secondhand) {
        CACHE = { market: market, newhomes: newhomes, secondhand: secondhand, source: "fetch" };
        return CACHE;
      }
      if (embed && embed.market && embed.newhomes && embed.secondhand) {
        CACHE = {
          market: market || embed.market,
          newhomes: newhomes || embed.newhomes,
          secondhand: secondhand || embed.secondhand,
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

  function floorSvg(kind) {
    // Line-plan SVGs — schematic only
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
    // default three-bed
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
      '<path d="M168 78 Q178 78 178 88" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="1"/>' +
      '<path d="M108 158 Q108 148 118 148" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="1"/>' +
      "</svg>"
    );
  }

  function tagsHtml(tags) {
    if (!tags || !tags.length) return "";
    return (
      '<div class="tag-row">' +
      tags
        .map(function (t) {
          return '<span class="tag">' + t + "</span>";
        })
        .join("") +
      "</div>"
    );
  }

  function newCard(item) {
    return (
      '<a class="listing" href="detail.html?type=new&id=' +
      encodeURIComponent(item.id) +
      '">' +
      '<div class="listing-img"><span class="listing-tag">' +
      (item.heroLabel || "New · 示例") +
      "</span></div>" +
      '<div class="listing-body">' +
      '<div class="listing-title">' +
      item.name +
      "</div>" +
      (item.nameNote ? '<div class="listing-note">' + item.nameNote + "</div>" : "") +
      tagsHtml(item.tags) +
      '<div class="listing-meta">' +
      item.meta +
      "</div>" +
      '<div class="listing-row">' +
      "<div><span class=\"listing-price\">" +
      item.price.toFixed(2) +
      '</span> <span class="listing-unit">' +
      item.priceUnit +
      "</span></div>" +
      '<span class="listing-unit">' +
      (item.status || "") +
      "</span>" +
      "</div></div></a>"
    );
  }

  function shCard(item) {
    return (
      '<a class="listing" href="detail.html?type=sh&id=' +
      encodeURIComponent(item.id) +
      '">' +
      '<div class="listing-img"><span class="listing-tag">' +
      (item.heroLabel || "Resale · 示例") +
      "</span></div>" +
      '<div class="listing-body">' +
      '<div class="listing-title">' +
      item.name +
      (item.unitLabel ? " · " + item.unitLabel : "") +
      "</div>" +
      (item.nameNote ? '<div class="listing-note">' + item.nameNote + "</div>" : "") +
      tagsHtml(item.tags) +
      '<div class="listing-meta">' +
      item.meta +
      "</div>" +
      '<div class="listing-row">' +
      "<div><span class=\"listing-price\">" +
      item.priceTotal +
      '</span> <span class="listing-unit">' +
      item.priceUnit +
      " · 约 " +
      item.pricePerSqm.toFixed(2) +
      " 万/㎡</span></div>" +
      '<span class="listing-unit">' +
      (item.taxStatus || "") +
      "</span>" +
      "</div></div></a>"
    );
  }

  function matchFilter(item, filter) {
    if (!filter || filter === "全部") return true;
    if (filter === "~100㎡") {
      var s = item.size || 0;
      return s >= 90 && s <= 110;
    }
    return (item.tags || []).indexOf(filter) !== -1 || item.status === filter;
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
          '<div class="k">' +
          x.label +
          "</div>" +
          '<div class="v">' +
          x.value +
          "</div>" +
          '<div class="d' +
          (x.trend === "down" ? " down" : "") +
          '">' +
          x.delta +
          "</div></div>"
        );
      })
      .join("");

    var curatedNew = pickIds(data.newhomes.items, m.curatedNewIds).slice(0, 2);
    var curatedSh = pickIds(data.secondhand.items, m.curatedSecondhandIds).slice(0, 2);

    root.innerHTML =
      '<div class="page">' +
      '<div class="topbar">' +
      '<div class="brand">' +
      (m.brandZh || "武楼") +
      "<small>" +
      (m.brand || "WHAN") +
      "</small></div>" +
      '<div class="pill">' +
      (m.focusArea || "光谷东") +
      (m.sample === false ? " · 官方月报" : " · 示例") +
      "</div></div>" +
      '<div class="pulse">' +
      '<div class="pulse-loc">' +
      (m.cityPulse && m.cityPulse.en ? m.cityPulse.en : "City Pulse") +
      "</div>" +
      '<div class="pulse-title">' +
      (m.cityPulse && m.cityPulse.title ? m.cityPulse.title : "市场脉搏") +
      "</div>" +
      '<div class="pulse-live"><i></i>' +
      (m.cityPulse && m.cityPulse.status ? m.cityPulse.status : "示例数据") +
      "</div>" +
      '<div class="ref-price">' +
      '<div class="k">' +
      (m.referencePrice && m.referencePrice.label ? m.referencePrice.label : "参考价") +
      (m.sample === false ? "" : " · 示例") +
      "</div>" +
      '<div><span class="v">' +
      (m.referencePrice ? m.referencePrice.value : "—") +
      '</span><span class="u">' +
      (m.referencePrice ? m.referencePrice.unit : "") +
      "</span></div></div>" +
      '<div class="metrics">' +
      metrics +
      "</div></div>" +
      '<div class="judgment"><div class="k">Judgment · 判断</div><p>' +
      (m.judgment || "") +
      "</p></div>" +
      '<div class="update-stamp">更新时间 · ' +
      (m.updatedLabel || m.updatedAt || "—") +
      " · 数据源 " +
      (data.source === "fetch" ? "JSON" : "内嵌") +
      "</div>" +
      '<div class="sec"><div class="sec-head"><h2>精选新房</h2><a href="new.html">全部</a></div>' +
      curatedNew.map(newCard).join("") +
      "</div>" +
      '<div class="sec" style="margin-bottom:8px"><div class="sec-head"><h2>精选二手</h2><a href="secondhand.html">全部</a></div>' +
      curatedSh.map(shCard).join("") +
      "</div></div>";
  }

  function renderList(kind, data) {
    var root = qs("#app-root");
    if (!root) return;
    var pack = kind === "new" ? data.newhomes : data.secondhand;
    var filters = pack.filters || ["全部"];
    var active = "全部";

    function paint() {
      var items = (pack.items || []).filter(function (it) {
        return matchFilter(it, active);
      });
      var cards =
        kind === "new"
          ? items.map(newCard).join("")
          : items.map(shCard).join("");

      root.innerHTML =
        '<div class="page">' +
        '<div class="topbar">' +
        '<div class="brand">' +
        (data.market.brandZh || "武楼") +
        "<small>" +
        (data.market.brand || "WHAN") +
        "</small></div>" +
        '<div class="pill">' +
        (pack.area || "光谷东") +
        " · 示例</div></div>" +
        '<div class="page-head">' +
        "<h1>" +
        (kind === "new" ? "新房" : "二手") +
        '</h1><p class="sub">' +
        (kind === "new"
          ? "光谷东精选示意楼盘 · 筛选为示意交互"
          : pack.focusNote || "精选二手 · 示例") +
        "</p></div>" +
        '<div class="filters" id="filters">' +
        filters
          .map(function (f) {
            return (
              '<button type="button" class="chip' +
              (f === active ? " on" : "") +
              '" data-filter="' +
              f +
              '">' +
              f +
              "</button>"
            );
          })
          .join("") +
        "</div>" +
        '<div class="list-wrap"><div class="list-count">共 ' +
        items.length +
        " 条 · 示例</div>" +
        (cards || '<div class="error">无匹配条目</div>') +
        "</div></div>";

      qsa("#filters .chip").forEach(function (btn) {
        btn.addEventListener("click", function () {
          active = btn.getAttribute("data-filter");
          paint();
        });
      });
    }

    paint();
  }

  function renderDetail(data) {
    var root = qs("#app-root");
    if (!root) return;
    var p = params();
    var type = p.type === "sh" ? "sh" : "new";
    var id = p.id || "";
    var item =
      type === "sh"
        ? byId(data.secondhand.items, id)
        : byId(data.newhomes.items, id);

    if (!item) {
      root.innerHTML =
        '<div class="page detail"><a class="detail-back" href="index.html">← 返回</a>' +
        '<div class="error">未找到该条目（示例数据 id 无效）</div></div>';
      return;
    }

    var backHref = type === "sh" ? "secondhand.html" : "new.html";
    var priceHtml =
      type === "sh"
        ? '<div class="detail-price">' +
          item.priceTotal +
          '<span class="u">万 · 约 ' +
          item.pricePerSqm.toFixed(2) +
          " 万/㎡ · 示例</span></div>"
        : '<div class="detail-price">' +
          item.price.toFixed(2) +
          '<span class="u">' +
          item.priceUnit +
          " · 示例</span></div>";

    var daylight = (item.daylight || [])
      .map(function (d) {
        return (
          '<div class="score-row"><div class="score-label">' +
          d.label +
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
          a.name +
          '</span><span class="far">' +
          a.distance +
          "</span></div>"
        );
      })
      .join("");

    var specs = (item.specs || [])
      .map(function (s) {
        return (
          '<div class="spec-cell"><div class="k">' +
          s.k +
          '</div><div class="v">' +
          s.v +
          "</div></div>"
        );
      })
      .join("");

    var layout = item.layout || {};
    var filing = item.filingUrl || "https://fgj.wuhan.gov.cn/";

    root.innerHTML =
      '<div class="page detail">' +
      '<a class="detail-back" href="' +
      backHref +
      '">← 返回 · ' +
      (data.market.brandZh || "武楼") +
      "</a>" +
      '<div class="detail-hero"><span class="listing-tag">' +
      (item.heroLabel || "示例") +
      "</span></div>" +
      '<h1 class="detail-title">' +
      item.name +
      (item.unitLabel ? " · " + item.unitLabel : "") +
      "</h1>" +
      '<p class="detail-sub">' +
      (item.area || "光谷东") +
      " · 示例数据 · " +
      (layout.title || "") +
      (layout.rooms ? " · " + layout.rooms : "") +
      (item.nameNote ? " · " + item.nameNote : "") +
      "</p>" +
      priceHtml +
      tagsHtml(item.tags) +
      '<div class="floor-card"><div class="kicker">Floor Plan · 户型示意</div>' +
      floorSvg(layout.svg || "three-bed") +
      '<div class="floor-legend"><span><i style="background:rgba(255,255,255,0.08)"></i>起居</span>' +
      '<span><i style="border-style:dashed"></i>阳台</span><span><i></i>房间</span></div></div>' +
      '<div class="floor-card"><div class="kicker">Daylight · 采光评分</div>' +
      daylight +
      "</div>" +
      '<div class="floor-card"><div class="kicker">Amenities · 配套距离</div><div class="dist-list">' +
      amenities +
      "</div></div>" +
      '<div class="floor-card" style="padding:0;overflow:hidden">' +
      '<div class="kicker" style="padding:16px 16px 0">Specs · 规格</div>' +
      '<div class="spec-grid" style="border:none;border-radius:0;margin-top:12px">' +
      specs +
      "</div></div>" +
      '<div class="cta-row">' +
      '<button type="button" class="btn btn-primary" id="btn-compare">加入对比</button>' +
      '<a class="btn btn-ghost" href="' +
      filing +
      '" target="_blank" rel="noopener noreferrer">查看备案</a>' +
      "</div>" +
      '<p class="caption">示例数据 · 不构成交易或投资建议<br>备案链接触达武汉住更局公开站点（占位）</p>' +
      "</div>";

    var btn = qs("#btn-compare");
    if (btn) {
      btn.addEventListener("click", function () {
        btn.textContent = "已加入对比";
        btn.classList.add("is-done");
        btn.disabled = true;
        toast("已加入对比（本地示意）");
      });
    }
  }

  function renderAbout(data) {
    var root = qs("#app-root");
    if (!root) return;
    var m = data.market;
    var sources = (m.sources || [])
      .map(function (s) {
        return "<li>" + s + "</li>";
      })
      .join("");

    root.innerHTML =
      '<div class="page about">' +
      '<div class="topbar">' +
      '<div class="brand">' +
      (m.brandZh || "武楼") +
      "<small>" +
      (m.brand || "WHAN") +
      "</small></div>" +
      '<span class="sample-badge">' +
      (m.sample === false ? "Official + Sample cards" : "Sample") +
      "</span></div>" +
      '<div class="page-head"><h1>说明</h1>' +
      '<p class="sub">数据口径、更新节奏与免责声明</p></div>' +
      "<h2>" +
      (m.sample === false ? "数据说明" : "示例数据说明") +
      "</h2>" +
      "<p>" +
      (m.disclaimer || "") +
      "</p>" +
      '<div class="card">' +
      '<div class="meta-row"><span class="k">聚焦板块</span><span>' +
      (m.focusArea || "光谷东") +
      "</span></div>" +
      '<div class="meta-row"><span class="k">最近更新</span><span>' +
      (m.updatedLabel || "—") +
      "</span></div>" +
      '<div class="meta-row"><span class="k">加载方式</span><span>' +
      (data.source === "fetch" ? "data/*.json（fetch）" : "js/data-embed.js（内嵌）") +
      "</span></div></div>" +
      "<h2>" +
      (m.sample === false ? "数据来源" : "数据来源（示意）") +
      "</h2><ul>" +
      sources +
      "</ul>" +
      "<h2>更新节奏</h2><p>" +
      (m.cadence || "") +
      "</p>" +
      "<h2>品牌</h2><p>WHAN / 武楼 — 原创品牌示意，不借用第三方航天或汽车品牌名称与标识。</p>" +
      "<footer>WHAN · 武楼<br>武汉楼市分析 MVP · 示例</footer></div>";
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
      })
      .catch(function (err) {
        if (root) {
          root.innerHTML =
            '<div class="error">' +
            (err && err.message ? err.message : "加载失败") +
            "<br><br>建议：<code>python3 -m http.server 8765</code></div>";
        }
      });
  }

  window.WHAN = {
    boot: boot,
    toast: toast,
    loadData: loadData
  };
})();
