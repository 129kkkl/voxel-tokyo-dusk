# Phase 1B 差距清单（T0 基线）

日期：2026-09-20  
基线 seed：`20260919`  
探针：`_probe_baseline.mjs`  
测试：`npm test` 126/126 PASS（经 MIMO_NODE）

## 数字基线（改造前 / 占位 cityBuild）

| 项 | 值 |
| --- | --- |
| CITY buildMs | 2415 |
| blocks | 1098 |
| plots | 1991（house 948 / shop 580 / tower 306 / open 137 / yard 20） |
| 简单 claim 模拟 | 1635 / 1854 → useRate **88.2%** |
| audit | 五类全 0 |
| roads | 2566 |
| railPts | 432 |

**结论**：claim 门控与数据层不是空城主因；主因是 **建筑几何为占位盒子** + **无街道生活** + **地标过简** + 旧精致模块未接入。

## 分区街区分布（形态健康）

| district | blocks |
| --- | --- |
| station_front | 367 |
| low_rise_resi | 293 |
| sub_center | 183 |
| high_rise_resi | 97 |
| cbd | 55 |
| greenway | 38 |
| park_small | 22 |
| 其余 | 传统/娱乐/电器/团地/港口等偏少 |

## 视觉差距 Top 10（对照参考图）

1. **建筑为色块**：`cityBuild.placeBuilding` 单色盒 + 仅 +z 稀疏窗，无楼层带/勒脚/屋顶设备  
2. **窗光不成阵**：全景看不到「城市亮起来」的密度感  
3. **CBD 天际线弱**：办公高度带未与幕墙/竖梃立面绑定，地标外高塔像柱子  
4. **住宅无町屋零件**：无阳台/雨棚/暖墙变化  
5. **娱乐/电器街无招牌语义**（Phase 1B 仅点缀竖幅）  
6. **轨道简陋**：桥面细条、车站叠轨、无接触网  
7. **路侧空白**：无路灯/电线杆/信号/贩卖机/车辆  
8. **公园像色块**：树数量少、无步道/樱花语义  
9. **水面/标线**：地面标线随机感强；水面 glow 规格要求去自发光  
10. **HUD 缺密度指标**：无法量化 plotUseRate / buildings / lamps  

## Phase 1B 应对映射

| 差距 | 任务 |
| --- | --- |
| 1–5, 9 | T2 facade + types + districts 分发 |
| 3, 4, 公园 | T3 密度 + green |
| 5 地标 | T4 landmarks.js |
| 6 | T5 rail.js |
| 7–8 | T6 street.js |
| 9–10 | T7 ground 轻改 + HUD + debug |

## 截图基线

目录：`docs/baseline/stage1a/`  
状态：浏览器截图待 DevServer 稳定后补拍（`?cam=pano/cbd/mainstreet/resi/harbor/station` + `?plan=1`）。  
对比包将写入 `docs/baseline/phase1b/`。

## LEGACY 已标注

`residential / skyscrapers / street / park / special / shrine / landmarks / cityBuild` 文件头已加 LEGACY 注释；`main.js` 已切到 `src/build/index.js`。
