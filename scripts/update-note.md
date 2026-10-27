# 每日更新作业（住更局公开统计）

目标：用**武汉市住房和城市更新局**公开月报刷新行情数字，站点仍是**纯静态发布**（GitHub Pages）。

## 官方数据源

| 类型 | URL | 现状 |
|------|-----|------|
| 商品住房销（预）售**月度**监测简报列表 | https://zgj.wuhan.gov.cn/xxgk/xxgkml/sjfb/spzfxysydjcjb/ | 可解析；脚本取最新一篇详情表 |
| 月度详情示例（2026年9月） | https://zgj.wuhan.gov.cn/xxgk/xxgkml/sjfb/spzfxysydjcjb/202610/t20261010_2858776.shtml | 解析全市合计 + 东湖高新区 商品住房套数/面积 |
| 每日新建商品房成交统计列表 | https://zgj.wuhan.gov.cn/fzlm/mrxjspflby/index.shtml | 页内无数字表（JS/导航壳），侧栏外链 ASPX；**暂不依赖** |

东湖高新区行作为**光谷东**聚焦的公开行政区代理指标。

## 流程

```
python3 scripts/fetch_zgj_stats.py
  → data/official/latest_monthly.json
  → data/official/latest_daily.json（若不可解析则写明原因）

python3 scripts/apply_official_to_market.py
  → 改写 data/market.json（official 段、metrics、judgment、sources、updatedAt）

python3 scripts/generate-embed.py
  → js/data-embed.js

git commit && git push origin main
  → https://suntianjing.github.io/whan-mvp/
```

## 抓取约定

- User-Agent：`WHAN-personal-project-bot/1.0`（个人项目）
- 每个需要的页面 **一次 GET**（列表 + 最新月报 + 上月对照 + 每日探测），不循环锤击
- 解析失败：**非零退出**，不改写 `market.json`
- **不编造数字**：只写入抓到的字段；环比来自同表结构的上月详情

## 写入 `market.json` 的字段

- `official.*`：period、全市/东湖高新套数与面积、mom、月报 URL
- `metrics[]`：全市成交套数、东湖高新成交套数、全市成交面积（万㎡）及环比
- `referencePrice`：东湖高新商品住房成交套数（大数字）
- `judgment`：中文模板，对比东湖高新 vs 全市环比方向，并注明住更局月报
- `sources`：精确月报 URL
- `sample: false`；`disclaimer` 仍声明**楼盘卡片为示意**

## 楼盘库

- `newhomes.json` / `secondhand.json` 精选 id 默认可周更，不必每日全量改
- 名称继续示意，避免误用商标品牌

## 非目标

- 服务端 API、登录、收藏云同步
- 高频爬虫 / 对抗外链每日 ASPX
- 真实备案核验（「查看备案」保持官网占位）

## 责任边界

行情数字来自住更局公开月报，须保留来源链接与「楼盘示意」边界；正式对外前由业务确认免责声明与引用合规。
