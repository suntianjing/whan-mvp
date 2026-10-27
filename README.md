# 武楼 WHAN · 武汉楼市 MVP

光谷东聚焦的**纯静态**移动端行情站（无后端、无构建）。品牌：**武楼 / WHAN**。

> 行情指标来自武汉市住更局公开月报；**精选盘名为光谷东真实项目；价格为公开挂牌/在售参考非网签；户型图来自公开售楼资料（示意参考）**。仅供产品演示，不构成交易或投资建议。

## 如何打开

### 推荐：本地静态服务（fetch 读 `data/*.json`）

```bash
cd /workspace/whan-mvp
python3 -m http.server 8765
# 浏览器访问 http://127.0.0.1:8765/
```

底部导航：**行情 · 新房 · 二手 · 对比 · 说明**。详情页从列表或首页卡片进入。

### 离线 / 直接打开 `index.html`

页面同时加载 `js/data-embed.js`（由 JSON 生成的内嵌副本）。当 `file://` 拦截 `fetch` 时，会自动回退到内嵌数据，仍可浏览。

改完 `data/*.json` 后请重新生成内嵌文件：

```bash
python3 scripts/generate-embed.py
```

## 目录结构

```
whan-mvp/
├── index.html              # 行情（首页）
├── new.html                # 新房列表
├── secondhand.html         # 二手列表
├── detail.html             # 详情（?type=new|sh&id=…）
├── compare.html            # 对比（localStorage）
├── about.html              # 说明 / 收藏 / 数据口径
├── css/styles.css          # 视觉 tokens 与布局
├── js/app.js               # 加载数据、渲染、筛选、详情
├── js/data-embed.js        # 内嵌数据（由脚本生成）
├── data/
│   ├── market.json         # 脉搏、参考价、判断、精选 id
│   ├── newhomes.json       # 新房列表 + 详情字段
│   └── secondhand.json     # 二手列表 + 详情字段
├── scripts/
│   ├── fetch_zgj_stats.py          # 住更局月报 + history
│   ├── fetch_daily.py              # 日表 ASPX 列表/JPEG/OCR
│   ├── apply_official_to_market.py # 合并进 market.json
│   ├── generate-embed.py           # JSON → data-embed.js
│   └── update-note.md              # 每日更新作业说明
├── data/official/          # latest_monthly / history_monthly / latest_daily
└── README.md
```

## 视觉约定（已锁定）

| Token | 值 |
|-------|----|
| 背景 | `#000` / 卡片 `#0a0a0a` |
| 文字 | `#f5f5f5` / 次级 `#8a8a8a` |
| 描边 | `rgba(255,255,255,0.12)` |
| 字体 | system-ui；英文标签宽字距（WHAN） |
| 画幅 | 移动优先，内容最大约 390–430px，桌面两侧黑底信箱 |

不使用 SpaceX / Tesla 等第三方品牌名称或标识。

## 日常更新（住更局月报流水线）

```bash
python3 scripts/fetch_zgj_stats.py          # 拉列表+最新/上月月报 → data/official/
python3 scripts/apply_official_to_market.py # 合并进 data/market.json
python3 scripts/generate-embed.py           # 同步 js/data-embed.js
git add -A && git commit -m "chore: refresh official housing stats" && git push origin main
```

- 月报列表：https://zgj.wuhan.gov.cn/xxgk/xxgkml/sjfb/spzfxysydjcjb/
- 每日列表页目前无可用数字表，指标以月报为准（见 `data/official/latest_daily.json` 说明）
- 楼盘库 `newhomes.json` / `secondhand.json` 可按周轮换精选 id

详见 `scripts/update-note.md`。

## 页面能力

1. **行情**：月报 KPI、日表网签、板块挂牌指数、月度趋势图、判断文案、精选楼盘  
2. **新房 / 二手**：真实项目名 + 公开挂牌参考价；价格带/地铁/学区等客户端筛选；收藏与加入对比  
3. **对比**：localStorage 2–3 项并排（价格/面积/朝向/采光/配套）  
4. **详情**：heroImage、户型示意、采光、配套、OSM 地图、备案查询（商品房项目查询）、来源页  
5. **说明**：官方 vs 挂牌 vs 示意字段、日表状态、本地收藏列表、更新节奏  

## 预览原稿

早期视觉预览保留在 `/workspace/wuhan-market-preview/`（单页 tab 示意）。本目录为可导航产品 MVP。
