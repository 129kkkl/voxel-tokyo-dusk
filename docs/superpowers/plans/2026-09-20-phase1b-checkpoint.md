# Phase 1B 检查点：视觉密度复兴

日期：2026-09-20  
分支：工作区（Phase 1B 切片交付）  
视觉方向：黄昏写实密度（已确认）

## 交付内容

| 项 | 状态 |
| --- | --- |
| `src/build/**` 渲染库 | palette / facade / claimUtil / districts / landmarks / rail / street / index |
| `main.js` 入口切换 | `placeFromCity` 自 `src/build/index.js` |
| 地标 claim 可缩水 | 东京塔等不再漂到远郊 |
| HUD 密度指标 | use% / bld / lamps / audit |
| LEGACY 标注 | residential 等 8 文件 |
| 单文件 | `体素东京-暮色.html`（≈568KB）已重建 |
| 基线截图 | `docs/baseline/phase1b/*.png` |
| 差距清单 | `docs/baseline/gap-list.md` |

## 数字验收（seed=20260919）

| 判据 | 目标 | 实测 | 结论 |
| --- | --- | --- | --- |
| npm test | 全绿 | 126/126 | ✅ |
| build / build:single | 成功 | 成功 | ✅ |
| audit 五类 | 0 | 全 0（claims 4009） | ✅ |
| plotUseRate | ≥70% | **88%**（1748/1991） | ✅ |
| buildings | 显著有肉 | house768 station476 office205 danchi146 civic39 industrial21 green79 | ✅ |
| 地标落位 | 三塔+神社可辨 | tower@ (91,31) / skytree / metro / shrine / stadium / port | ✅ |
| 路侧道具 | 可见 | lamps856 poles82 signals23 vending35 cars51 cherries63 parkTrees449 | ✅ |
| 总实例 | ≤660k | **294,468** | ✅ |
| glow 占比 | ≤25%（1B） | **≈20%** | ✅ |
| FPS pano | 不显著劣化 | **104 fps** | ✅ |
| CITY buildMs | （债务，P阶段） | ≈2200ms | ⚠️ 未达标，已记录 |
| 体素级 debug 反查 | 计数为 0 | 未完整接入 HUD | ⚠️ 部分 |
| 六机位主观密度 | 相对空城变好 | pano 满城+双塔+环线；resi 町屋+樱花；plan 路网可读 | ✅ |

## 截图结论

- **pano**：城市连续建成，东京塔橙色桁架与天空树青蓝观景台可辨，环线高架穿城，无大片荒漠。
- **cbd / mainstreet**：街景有塔楼群与轨道，窗光阵列存在；近景仍偏「体素块」，立面精修留给 Phase 2。
- **resi**：低层暖墙、樱花树、路灯，住宅区语义成立。
- **plan**：有机环+放射+次级网+东南港湾，Stage 1A 形态未回退。

## 已知问题（进入 Phase 2 / P）

1. CITY 冷跑 ≈2.2s，未到 400ms → Phase P
2. 近景立面仍简化，招牌/幕墙模式/屋顶设备需 Phase 2 类型库
3. `commercial` 分区在本种子街区配额中几乎缺失（station_front 承担商业形态）
4. `?debug=1` 体素反查未写入 HUD
5. 场景偏暗 → 已略提 hemi/ambient/fog，终调属 Phase 4
6. 模拟实例数 ≠ 真实 InstancedMesh 合批后数量（HUD 294k 为构建后真实体素记录）

## 文件变更摘要

```
src/build/palette.js
src/build/facade.js
src/build/claimUtil.js
src/build/districts.js
src/build/landmarks.js
src/build/rail.js
src/build/street.js
src/build/index.js
src/main.js          # 入口+HUD+灯光+信标对齐 claim
src/ground.js        # 水面注释（去自发光按 PALETTE）
docs/baseline/gap-list.md
docs/baseline/phase1b/*.png
体素东京-暮色.html
_probe_baseline.mjs / _probe_vis.mjs / _shot.mjs
```

## 结论

Phase 1B **主目标达成**：在保留有机城市数据层与 claim 审计的前提下，渲染从占位盒子升级为可读的黄昏密度城市；地标、路侧、轨道、分区形态均上机。未完成项（CITY 性能、debug 反查、立面精修、动态车流）按计划进入 Phase P / 2 / 3。

**下一步建议**：Phase 2 建筑类型库与配色精修，或 Phase P 先把 CITY 构建压到可接受耗时。
