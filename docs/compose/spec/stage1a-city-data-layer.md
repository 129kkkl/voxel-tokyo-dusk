---
feature: stage1a-city-data-layer
status: delivered
updated: 2026-09-20
branch: feat/stage1a-city-data-layer
commits: 3d2a412..13bfe0d
---

# Stage 1A 城市数据层 + 单文件可见升级

## Report

**What was built** — 接手 Stage 1A 未完成工作：补齐 `src/city/` 数据层（blocks / districts / alleys / plots / query / viewpoints），落地 `CITY` 查询契约与 `claim()` 登记审计；`ground.js` 重写为读 cell buffer 的铺装+挡土墙；新增 `cityBuild.js`（地块建筑走 claim，地标/车站/环线经 claimFree 或 claim 占位后再画）。`main.js` 支持 `?plan/?cam/?debug/?seed`，HUD 显示审计计数。离线单文件 `体素东京-暮色.html` 已用新流水线重建，相对旧 35×35 手写布局具备有机路网、起伏地坪、弯曲河湾与分区建筑。

**Verification** —
- `npm test`：126 pass / 0 fail（含 blocks/districts/alleys/plots/query/viewpoints/water/secondary）
- `npm run build` 与 `npm run build:single` 成功；`体素东京-暮色.html` ≈550KB，含 `PLOT_USE`/`SUB_CENTER`/`claimFree` 等新契约
- Node 探针：blocks≈1098，plots≈1991，claims≈1635；地标 tag 含 landmark_tower/skytree/metro_gov/shrine/stadium/port_office；`audit()` 五类违规全 0
- 实例约 263k solid + 14k glow（未超 660k 预算）

**Journey log** —
1. Voronoi `dMin` 原 36/62 只产出 ~366 街区；调至 18/36 + 删段 0.2 后进入 1100 带，道路占比约 26%。
2. 水系随机与路网 `rng` 共享流，调 dMin 会让河宽/岸线测试无故抖动 → `applyWater` 改用 `seed^0xA71E` 独立派生。
3. 评审 C1：地标锚点硬编码 `(0,0)` 且在 `ROAD_MINOR` 上；改为 CBD/副都心街区质心 + `claimBase`。
4. 复审发现 claim 门控过严导致地标整体不落位 → 地标优先占位、螺旋+邻近 plot 双路径，几何限制在 claim 矩形内。
5. 已知中间态：CITY 冷跑 ~2.3s（>400ms 目标）、地面实例 ~253k（>135k）、`?debug` 体素反查未接、旧 residential/street 等 consumer 未迁移（不在 main 图内）。

## [S1] Problem

「体素东京 · 暮色」需从手写 35×35 街区升级为可查询的有机城市布局，并使离线单 HTML 有真实结构变化。Stage 1A 计划 Task 12–18 与渲染接入原未完成。

## [S2] Design

沿用 `docs/superpowers/specs/2026-09-19-stage1-city-layout-core.md` 与 Stage 1A 计划；本 compose 交付在数据层之上增加最小渲染闭环。权威实现说明见 `docs/superpowers/plans/2026-09-19-stage1a-checkpoint.md`。

- 数据层：`src/city/*` 不 import three（`planView.js` 除外）
- 建筑落位唯一入口：`CITY.claim` / `claimFree`；地标先占位再画，几何不超出 claim
- 工作区：环境禁止 `git worktree add`，在既有分支 `feat/stage1a-city-data-layer` 上交付

## [S3] Out of Scope

阶段 2 去霓虹与建筑原型、阶段 3 动态车流、阶段 4 六机位终验；`_p*.js` 等遗留临时文件不删。

## Tasks

- [x] T1: 完成 `city/blocks.js` + helpers + blocks 测试 — acceptance: 街区派生测试绿 (covers: S2)
- [x] T2: 完成 `city/districts.js` — acceptance: 分区/配额/锚点测试绿 (covers: S2)
- [x] T3: 完成 `buildAlleys` — acceptance: 小巷非破坏性测试绿 (covers: S2)
- [x] T4: 完成 `city/plots.js` — acceptance: 地块不变量测试绿 (covers: S2)
- [x] T5: 完成 `city/query.js` — acceptance: claim/audit 测试绿，干净跑五类为 0 (covers: S2)
- [x] T6: 完成 viewpoints + planView + URL 参数 — acceptance: 单元测试绿 (covers: S2)
- [x] T7: 形态检查与单文件重建 — acceptance: 测试绿 + `build:single` + HTML 含新布局 (covers: S1)
- [x] T8: 渲染接入最小闭环 — acceptance: ground 读 CITY；建筑/地标经 claim；审计 0 违规 (covers: S1)
