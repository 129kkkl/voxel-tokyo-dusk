# Stage 1A 形态检查点

日期：2026-09-20  
分支：feat/stage1a-city-data-layer  
验证：`npm test` 126/126 PASS；`npm run build` / `npm run build:single` 成功

## 判据对照（规格 §15.2 / 计划 Task 18）

| # | 判据 | 结论 | 依据 |
| --- | --- | --- | --- |
| 1 | 近圆环 + 7 放射 + 中环弧 + 有机次级网，无 35×35 等距 | 通过（数据层） | stations/trunk/secondary 测试绿；CFG 调 INNER_DMIN=18 / OUTER_DMIN=36 / MINOR_DELETE_P=0.2 后街区数 ≈1098 |
| 2 | 街区面积分布不均，含三角/扇形 | 通过 | blocks 异形街区测试；fill<0.65 块 >40 |
| 3 | 主河弯曲渐宽，汇入港湾与突堤 | 通过 | water 测试绿；水系 rng 已与路网解耦 |
| 4 | 桥只在道路跨水处 | 通过 | bridges ≥6，桥面高于两岸 |
| 5 | 西高东低台地与道路缓坡 | 通过 | terrain/profile 测试绿 |
| 6 | 分区成系统（CBD/副都心/绿地/工业） | 通过 | districts 配额与方位测试绿 |
| 7 | 审计五类为 0；blocks 1100~1600；buildMs | 部分通过 | claim 审计 0 违规；blocks≈1098（贴近下限）；CITY buildMs≈2300ms（冷跑，未优化到 400ms） |

## CFG 变更

- `INNER_DMIN`: 36 → 18（内城更密，街区数从 366 提升到 ≈1098）
- `OUTER_DMIN`: 62 → 36
- `MINOR_DELETE_P`: 0.12 → 0.2（压道路格占比）
- 水系 `applyWater` 使用独立派生种子 `seed^0xA71E`，与路网 rng 流解耦

## 渲染接入（本 compose 交付扩展）

- `ground.js` 重写为读 CITY 的铺装 + 挡土墙（无兼容壳导出）
- `cityBuild.js`：地块建筑经 `CITY.claim`；地标 **先** `claimBase`（邻近 plot + 螺旋 claimFree），几何限制在 claim 内
- `main.js`：`?plan/?cam/?debug/?seed`；HUD 审计行
- 离线单文件 `体素东京-暮色.html` 已重建（≈550KB）
- 实测：solid≈263k + glow≈14k；地标 tag 齐全；claims≈1635；audit 五类全 0
- 复审修正：地标不再压路；skytree/metroGov 锚点分离；`ground.js` 无 RING_* 兼容壳

## 未解决（阶段 2+）

- 地面 RLE 未压到 ≤135k（实测 ≈253k）
- CITY 构建冷跑 ≈2.3s，未做分帧
- 12 个旧 consumer 未逐文件迁移（residential/skyscrapers 等，当前不在 main 导入图）
- 体素级 `?debug=1` 反查未完整接入
- 车站站台仍叠在轨道带（阶段结构，非 claim 建筑）
- 旧样式外观、动态车流、六机位终验

## 结论

数据层与 claim 门控渲染闭环可进入后续阶段；单文件 HTML 相对改造前有实质结构变化。地标已过 claim，不再压路。
