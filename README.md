# 武楼 WHAN · 武汉楼市 MVP

光谷东聚焦的**纯静态**移动端行情站（无后端、无构建）。品牌：**武楼 / WHAN**。

> 全部楼盘名、价格与指标均为**示例数据**，仅供产品演示，不构成交易或投资建议。

## 如何打开

### 推荐：本地静态服务（fetch 读 `data/*.json`）

```bash
cd /workspace/whan-mvp
python3 -m http.server 8765
# 浏览器访问 http://127.0.0.1:8765/
```

底部导航：**行情 · 新房 · 二手 · 说明**。详情页从列表或首页卡片进入。

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
├── about.html              # 说明 / 数据口径
├── css/styles.css          # 视觉 tokens 与布局
├── js/app.js               # 加载数据、渲染、筛选、详情
├── js/data-embed.js        # 内嵌数据（由脚本生成）
├── data/
│   ├── market.json         # 脉搏、参考价、判断、精选 id
│   ├── newhomes.json       # 新房列表 + 详情字段
│   └── secondhand.json     # 二手列表 + 详情字段
├── scripts/
│   ├── generate-embed.py   # JSON → data-embed.js
│   └── update-note.md      # 未来每日更新作业说明
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

## 日常更新（数据替换）

1. 改写 `data/market.json`（参考价、指标、判断文案、`updatedAt`）
2. 按需更新 `data/newhomes.json`、`data/secondhand.json`
3. 运行 `python3 scripts/generate-embed.py`
4. 重新发布静态目录

详见 `scripts/update-note.md`。

## 页面能力

1. **行情**：光谷东大参考价、一行判断、3 枚指标芯片、精选新房/二手、更新时间戳、底栏  
2. **新房**：示意筛选芯片 + 光谷东示意楼盘列表（地铁/学区等标签）  
3. **二手**：约 100㎡ 主力段精选  
4. **详情**：hero、价格、户型 SVG 线稿、采光分、配套距离、规格；CTA「加入对比」「查看备案」（住更局占位链接）  
5. **说明**：示例数据声明、来源示意、更新节奏  

## 预览原稿

早期视觉预览保留在 `/workspace/wuhan-market-preview/`（单页 tab 示意）。本目录为可导航产品 MVP。
