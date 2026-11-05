# V2 升级执行检查点（Phase M / U / L / S / X / P）

日期：2026-09-22  
计划：`docs/superpowers/plans/2026-09-22-overall-upgrade-v2.md`  
基线：`docs/baseline/phase1b/` → 终验：`docs/final/`

## 数字验收（seed=20260919）

| 判据 | 目标 | 实测 | 结论 |
| --- | --- | --- | --- |
| npm test | 全绿 | **128/128**（新增 streetWall×2） | ✅ |
| build / build:single | 成功 | 成功，单文件 ≈595KB | ✅ |
| audit 五类 | 0 | 全 0（claims 4021） | ✅ |
| 总实例 | ≤800k | **538,919**（solid 510k + glow 28.9k） | ✅ |
| glow 占比 | ≤15% | **5.4%** | ✅ |
| plotUseRate | ≥85% | **96.7%**（2312 bld） | ✅ |
| 地标 | 六座齐全 | tower/skytree/metro/shrine/stadium/port | ✅ |
| FPS pano | ≥45 | **149–197 fps**（HUD 实测） | ✅ |
| 街墙对齐 | 同段 setback 一致 | 260 组 0 混用 | ✅ |
| 低层锁高 | 3–6 无瘦高柱 | heightField LOW_RISE avg 3.5 | ✅ |
| 动态 | 车流+船 | 124 车 + 6 船，5 InstancedMesh | ✅ |
| LEGACY 清理 | 根目录干净 | 52 文件入 `_legacy/` | ✅ |

## 各阶段交付

### Phase M 建筑形态学
- `facade.js` v2：**暗窗织物**（非 glow 深玻璃）+ 楼层暗线 + 四面窗 + 窗行合并
- `massing.js`：podiumTower / setbackStack / slabBlock / twinBar / houseCluster / shopShed
- `roofscape.js`：女儿墙 / 坡顶出檐 / 机电水箱 / 天线 / 冠部 / 广告位
- `districts.js` 类型库：体量×立面×屋顶五元组；住宅强制坡顶；HIGH_RISE 走 slab+gallery
- `heightField.js`：分区基带 + 中心衰减 + 值噪声 + 邻接 clamp + 英雄塔

### Phase U 城市秩序
- `plots.js`：同 (roadId,face) 段共用建筑线与退线；面阔约束递归二分；`corner` 标记
- `ground.js`：车道标线改道路坐标系（去掉 `(x+z)%7` 锯齿）；路缘实线
- `config.js`：`SLIVER_AREA` 120→180；`MINOR_DELETE_P` 试 0.28 失败回退 0.2（secondary 压力档判别力）
- 新增 `tests/streetWall.test.js`（退线一致性 + 面阔约束）

### Phase M5 + L 地标与光
- 六地标按 claim 自适应缩放（修复被裁切）；东京塔 X/Z 斜撑+整段橙光；都厅窗织物；神社两层檐；巨蛋 14 环收分；港口门吊杆件
- 天空渐变对齐 palette SKY；雾密度 0.00042；hemi 1.8 / sun 1.45 / exposure 1.42；三塔点光 + 街区微光

### Phase S 动态
- `src/traffic.js`：车道弧长 LUT、124 车（轿车/出租/巴士/卡车）、6 船（货轮/小艇）；每帧仅 setMatrixAt

### Phase P 工程卫生
- `_legacy/` 收纳 52 个探针/碎片/旧渲染模块；README 项目结构对齐现实

## 六机位 HUD 终验快照

```
538,919 voxels · 149–197 fps · CITY ~2350ms · claims 4021
blocks 1043 · plots 2391 · use 97% · bld 2312 · lamps 851 · 违规全 0
```

截图落盘：`docs/final/final-{pano,cbd,mainstreet,resi,harbor,station,plan}.png`  
（人工视觉判读可后补；数字与 HUD 判据已齐。）

## 已知遗留

1. CITY 冷跑仍 ≈2.3s（Phase P 性能债未压到 800ms）
2. `MINOR_DELETE_P` 保持 0.2（0.28 会破坏 secondary 压力档测试判别力）
3. `commercial` 分区在本 seed 配额中仍偏少（station_front 承担商业形态）
4. 行人未做（计划标注可选）
5. 六机位截图的人工逐张签字判读未做（截图已落盘）
6. `src/tower.js` 留在 src/（无 LEGACY 头但不在导入图，可后续归档）

## 结论

用户两大主诉「建筑物不好看、城市布局杂乱」对应的 **Phase M + U** 已落地并通过数字验收；光织物、动态车流、工程卫生、单文件重建一并完成。升级计划 V2 的主路径交付完毕。
