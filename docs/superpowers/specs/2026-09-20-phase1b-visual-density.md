# Phase 1B 实施 Spec：视觉密度复兴

日期：2026-09-20  
项目：`.`  
上级计划：`docs/superpowers/plans/2026-09-20-major-upgrade-plan.md`  
视觉基准：`9541-hvvuiym6375369.jpg` — **黄昏写实密度**（已确认）  
阶段 1A 遗留：`docs/superpowers/plans/2026-09-19-stage1a-checkpoint.md`

---

## 0. 一句话目标

在 **不改** `src/city/` 布局语义的前提下，把当前「有机空城 + 占位盒子」升级为「有机满城 + 有窗密度城市」：全景机位一眼能读出 CBD / 住宅 / 港 / 站前的层次，地标可辨，路侧有灯。

**成功画面（pano）**：远山 + 黄昏天 → 东京塔暖橙天际线锚点 → CBD 高塔群与大量中低层填充 → 河港与轨道环线切开城市 → 无大片荒地。

---

## 1. 范围

### 1.1 本阶段做

| 项 | 说明 |
| --- | --- |
| 基线与度量 | 截图基线、HUD 密度/覆盖率、差距清单（可与编码同日启动） |
| 渲染架构 | 新建 `src/build/`，`main.js` 切换入口 |
| 建筑密度 | plot 使用率提升、街区内部填充、分区高度与色彩层次 |
| 立面最低标准 | 主体 + ≥2 面窗 + 底层差异 + 屋顶构件 + 分级窗光 |
| 地标增强 | 东京塔 / 天空树 / 都厅 / 神社 / 巨蛋（几何仍限制在 claim 内） |
| 轨道与站 | 桥墩托梁双轨接触网、车站雨棚站台名牌；站台不叠轨 |
| 街道静态 | 路灯、电线杆+架空线、信号灯、公交站、贩卖机、桥灯、河岸樱花 |
| 地面轻改 | 标线按 `dirAngle`、水面去自发光、分区地坪色差 |
| 验收工具 | `?debug=1` 体素反查最小可用；audit 保持 0 |

### 1.2 本阶段不做

- 完整建筑类型库精修与招牌字形艺术（Phase 2）
- glow ≤15% 硬压（本阶段监控，目标 ≤25%）
- 动态车流 / 行人 / 船（Phase 3）
- 天空/雾终调（Phase 4）
- CITY 构建耗时优化到 400ms（Phase P，可并行但不阻塞）
- 推倒 `src/city/` 或回退 35×35
- 外部 GLB 模型

### 1.3 入口约束

- 建筑/构筑落位 **只** 允许 `CITY.claim` / `CITY.claimFree`
- 旧模块 `residential.js` 等 **不得** 被 `main.js` 直接 import
- 零件函数可从旧文件 **拷贝改造** 进 `src/build/`，但布局逻辑必须读 CITY
- `npm test` 全绿；`npm run build` / `build:single` 每任务结束可出图

---

## 2. 视觉 Token（Phase 1B 冻结草案）

与上级计划 §6 一致，本阶段直接落地到 `src/build/palette.js`。

```js
// src/build/palette.js — 唯一配色出口
export const SKY = {
  top: 0x0b1026,
  mid: 0x1a2750,
  horizonWarm: 0xc47a3a,
  horizonMauve: 0x6b4a6e,
};
export const FOG = { color: 0x3a3040, density: 0.00055 };
export const LIGHT = { sun: 0xffa050, hemiSky: 0x5a5fb0, hemiGround: 0x5a4030 };

export const WINDOW = {
  warm: [0xffc27a, 0xffd98a, 0xffb36a],
  cool: [0x8ec8ff, 0xd8e8ff],
  warmBias: 0.7,          // 冷色占比上限 30%
};

export const WALL = {
  house:  [0xe8e4da, 0xd9cfc0, 0xc4cdd4, 0xb8b0a4, 0xe0d6c8, 0xd4c4b0],
  shop:   [0x9c8a78, 0x8a7a6a, 0x7e7468, 0xa89880],
  office: [0x6a6e78, 0x7a7e88, 0x5e6470, 0x8a8e98, 0x3d4148, 0x27344b],
  industrial: [0x5a5e66, 0x6a6e76],
  civic:  [0xc4b8a4, 0xb0b4b8, 0xa8aeb8],
  shrine: 0x8b3a2a,
};

export const ROOF = {
  house: [0x3f4750, 0x37424e, 0x54483f, 0x2f3a45, 0x4a4a55],
  office: 0x4a4e54,
  industrial: 0x555a62,
};

export const GROUND = {
  // 与 city/config.js PALETTE 对齐，建筑侧只读不改路
  park: [0x3d6a38, 0x3f5c3a],
  dirt: 0x6f6a5e,
};

export const LANDMARK = {
  towerOrange: 0xff8c2e,
  towerWhite: 0xe8e4da,
  towerGlow: 0xff8a3c,
  skytreeBody: 0xc8d0d8,
  skytreeGlow: 0x4ac8ff,
  metroBody: 0xb0b4b8,
  metroWin: 0xffd27a,
  beacon: 0xff3b30,
};

export const NEON_RESTRICTED = {
  // 仅娱乐/电器街允许的点缀色，面积须受控
  magenta: 0xff4fd8,
  cyan: 0x3fe8ff,
  purple: 0xb44fff,
  yellow: 0xffe14a,
};
```

**规则**

- 暗窗 **不** `vox.add`（墙面色代替）
- 亮窗 glow=true；主体墙/屋顶/地面 glow=false
- 墙面明度抖动：按「楼层带索引」`hash` ±3–5%，禁止逐格噪色
- 娱乐/电器街招牌为点缀，不主导全景色相

---

## 3. 目标架构

### 3.1 目录

```
src/build/
  palette.js          见上
  facade.js           立面零件（窗阵、勒脚、屋顶、竖梃）
  massing.js          体量：塔楼/板楼/退台/裙房
  claimUtil.js        降尺度 claim 重试、街区内部 claimFree 填充
  districts.js        district → builder 分发 + 高度带
  types/
    house.js          町屋 / 小公寓
    shop.js           商业楼 + 底层店面
    office.js         办公塔（幕墙/竖梃/核心/退台简化版）
    danchi.js         团地
    industrial.js     仓库 / 厂房
    civic.js          学校/医院/公共（低层大面宽）
    green.js          公园/绿带/口袋
    landmark.js       三塔 + 神社 + 巨蛋（claim 内）
  props/
    street.js         路灯/电线/信号/公交站/贩卖机/静态车
    rail.js           轨道/接触网/车站
    trees.js          树/樱花（从旧 park.js 迁零件）
  index.js            placeFromCity 唯一导出
  stats.js            建筑计数、plot 使用率、glow 估算
```

### 3.2 依赖方向

```
main.js
  → build/index.js          唯一渲染入口
      → city/query.js       只读 CITY + claim
      → city/config.js      DISTRICT / LOT / ROAD
      → rng.js
      → voxel.js            仅通过 vox 参数，不 import
  → ground.js               仅铺装（轻改标线/水光）
  → sky.js / rail.createTrain / city/viewpoints
```

`src/build/**` **禁止** import `residential.js` / `skyscrapers.js` / `ground.js` 布局常量 / `street.js` 旧路径。

### 3.3 对外 API

```js
// src/build/index.js
export function placeFromCity(vox, CITY) {
  // returns { railCurve, stats }
}

// stats 结构（写入 CITY.stats.buildVis）
{
  buildings: { house, shop, office, danchi, industrial, civic, other },
  claimsUsed, plotsTotal, plotsClaimed, plotUseRate,
  freeFill,          // claimFree 填充次数
  landmarks: { tower, skytree, metro, shrine, stadium, port, ok },
  props: { lamps, poles, signals, vending, cars },
  byDistrict: { [district]: { plots, claims, avgH } },
}
```

---

## 4. 核心算法与规格

### 4.1 高度带（`districts.js`）

| district | 高度（体素层） | 类型 | 备注 |
| --- | --- | --- | --- |
| CBD | 28–72 | office | 冷灰/玻璃，窗密 |
| SUB_CENTER | 24–64 | office | 略矮 |
| STATION_FRONT | 14–36 | shop/office | 中高层 |
| HIGH_RISE_RESI | 12–24 | house/danchi | 窗格整齐 |
| DANCHI | 18–30 | danchi | 板/塔 |
| COMMERCIAL | 8–16 | shop | 底层店面 |
| ENTERTAINMENT | 8–18 | shop | 可有点缀招牌 |
| ELECTRONICS | 8–18 | shop | 屋顶广告位 |
| LOW_RISE_RESI | 4–8 | house | 2–3 层感 |
| TRADITIONAL | 4–7 | house | 暖木色，近神社 |
| PORT_INDUSTRY | 4–10 | industrial | 长条 |
| FREIGHT_YARD | 4–8 | industrial | 堆场 |
| UNIVERSITY / SCHOOL / HOSPITAL / PUBLIC | 6–14 | civic | 大面宽 |
| PARK_* / GREENWAY | — | green | |
| LANDMARK / STADIUM | 特殊 | landmark | claimBase |
| 其它 | 4–8 | house/shop 混合 | |

高度随机用 `makeRng(CFG.SEED ^ 0xB17D)`，与路网 rng 流解耦（避免改建筑抖动布局测试）。

### 4.2 立面最低标准（`facade.js`）

对每个 claim 结果 `{x0,z0,x1,z1,y,w,d}`：

```js
/**
 * paintBuilding(vox, c, opts)
 * opts: { wall, roof, floors, face, windowStyle, litP, baseColor, shopFront }
 */
```

必须实现：

1. **主体** `vox.box` 墙体，`y0` 到 `y0+h-1`
2. **勒脚/底层**：最下一到两层用 `shade(wall, 0.85)` 或 shop 色
3. **窗阵（至少两面）**：朝街 `plot.face` 与其对面；`w≥3 && d≥3` 时可加侧面
   - 楼层步长 2，开间步长 2
   - 暗窗跳过；亮窗 `hash2(x,y,z) < litP` → `WINDOW.warm/cool`
   - 楼层带衰减：`litP(y) = base * (1 - 0.35 * (y-y0)/h)`，底层更亮
4. **屋顶**：压边一格 `shade(roof)` + 概率水箱/机房/天线（住宅 60%、办公 40%）
5. **`plot.face` 零件**：住宅阳台/雨棚概率；商业底层光带（小面积 glow）

`office` 立面模式（简化 Phase 1B）：

| mode | 视觉 |
| --- | --- |
| curtain | 密窗，墙色深，竖向连续亮带感（每 2 层整行概率高一点） |
| mullion | 竖向梃线：每 3 列墙色打断窗行 |
| core | 中央核心筒两侧窗，或退台体量 `massing.js` |

### 4.3 密度策略（`claimUtil.js`）

```js
// claimWithRetry(CITY, plot, tag)
// 1) wantW = min(p.w, max(4, floor(p.w * 0.85)))
// 2) wantD = min(p.d, max(4, floor(p.d * 0.75)))
// 3) claim；失败则 wantW/D 各 -1，最多 3 轮
// 4) 仍失败 return null

// fillBlockInterior(vox, CITY, block, rng)
// 对街区细胞中 type===PLOT_FREE 或未被 plot 矩形覆盖的格：
// 按分区概率 p 放小构筑（3×3~6×6），claimFree
//   house 区：小棚/停车位色块
//   commercial：小庭院/变电
//   park：树
//   industrial：集装箱色块
```

**覆盖率目标（HUD 可测）**

| 指标 | 1A 基线（待 Phase 0 实测） | 1B 目标 |
| --- | --- | --- |
| plots 中有 claim 的比例 | 未知，偏低 | **≥ 70%** 总体；LOW_RISE_RESI ≥ 75%；CBD ≥ 85% |
| buildings 总数 | 占位循环次数级 | 相对基线 **×2–4**（以 solid 实例数与 claims 对照） |
| 公园/OPEN 地块有树或地坪变化 | 低 | ≥ 50% 的 OPEN plot |
| pano 主观「荒地」 | 明显 | 无大片连续空地坪 |

### 4.4 地标（`types/landmark.js`）

沿用 `cityBuild.js` 的 `claimBase` 思路，迁入 `claimUtil.js`，几何从旧模块增强：

| 地标 | claim 建议 | 几何要点 |
| --- | --- | --- |
| 东京塔 | 13×13，tag `landmark_tower` | 迁 `tower.js` `latticeSection`：四腿+环梁+斜撑；橙段 glow；FootTown 裙楼；展望台；航空信标仍由 `main.js` blink mesh 或体素闪烁 |
| 天空树 | 11×11，`skytree` | 收分芯 + 外壁条带/点阵；tripod；青蓝观景台 glow |
| 都厅 | 22×12，`metro_gov` | 双塔、层间线、网格窗、中缝；窗暖黄 |
| 神社 | 16×16，`shrine` | 参道+鸟居列（在 claim 内纵向排）、灯笼、主殿+屋檐、五重塔剪影 |
| 巨蛋 | 28×24，`stadium` | 连续壳面（高度环带缩放）+ 透光带 glow 点 |
| 港口 | 24×16，`port_office` | 仓库+门吊剪影 |

**硬约束**：几何 `x,z` 超出 claim 矩形的一律跳过；`audit()` 仍全 0。

### 4.5 轨道（`props/rail.js`）

基于 `CITY.rail.pts` 与 `CITY.stations`：

- 环线加密采样后：桥墩（每 10–14 点）+ 托梁 + 双轨轨条 + 接触网杆（每 8 点）+ 导线
- 高度：`y = max(groundY + 4, 12)`，跨水处墩到河床
- 车站：
  - main：宽 ~28，站台、雨棚、台阶、发光名牌
  - sub/local：递减
  - **站台矩形与轨道带分离**：站台在轨道一侧偏移 4–6 格，用 `claimFree`，禁止与 `T.RAIL` 格重叠
- 曲线：与 `createTrain` 同一组控制点（centripetal CatmullRom）

### 4.6 街道道具（`props/street.js`）

沿 `CITY.roads` 遍历（跳过 `MINOR` 可降频）：

| 道具 | 规则 |
| --- | --- |
| 路灯 | 按 `ROAD[cls].lampGap`；落在 `isSidewalk` 或路缘；灯头 glow 暖黄 |
| 电线杆 + 架空线 | ARTERIAL/RADIAL/RING；杆距 20–28；线用细 box 连接 |
| 信号灯 | 主干交叉口附近（道路折点或 bridge 邻域）概率 |
| 公交站 | STATION_FRONT / COMMERCIAL 临街 sidewalk |
| 贩卖机 | 住宅/商业 sidewalk 概率 1/80 |
| 桥灯 + 栏杆 | `CITY.bridges` 两端 |
| 河岸樱花 | `type===RECLAIM/RECLAIMED` 或 greenway 邻水格 |
| 静态车 | 道路 `laneOffsets` + `dirAngle` 摆 2–4 体素车体（头尾灯），数量按路长控制 |

### 4.7 地面轻改（`ground.js`）

1. 标线颜色与方向：用 `cell.dirAngle` / roadId，删除与道路无关的随机感
2. 水面 `glow=false`（`PALETTE.water/sea`）
3. 街区分区地坪：按 `block.district` 取 2–3 个低饱和基色 + 8×8 瓦片 `hash2` ±5% 明度
4. 不改 cell buffer 语义；不追求本阶段 ≤135k，但 HUD 打印地面实例数

---

## 5. `main.js` 切换

```js
import { placeFromCity } from './build/index.js';
// 删除 cityBuild import

const steps = [
  { name: '地面', fn: () => buildGround(vox, CITY) },
  { name: '城市建筑', fn: () => {
      const r = placeFromCity(vox, CITY);
      railCurve = r.railCurve;
      CITY.stats.buildVis = r.stats;
  }},
];
```

HUD 一行示例：

```
voxels … · CITY 2300ms · claims 4200/4800 (87%) · buildings 3900 · lamps 1200 · audit 0
```

URL 参数保持：`?plan / ?cam / ?debug / ?seed`。

---

## 6. 任务分解（执行顺序）

> 每个任务结束：`npm test` + 视情况 `build:single`；禁止跨任务长期红灯。

### T0 基线（并行启动）

- [ ] 六机位 + `?plan=1|district` 截图 → `docs/baseline/stage1a/`
- [ ] Node 探针或 HUD 记录：blocks/plots/claims、district 分布、CITY buildMs
- [ ] 差距清单 `docs/baseline/gap-list.md`（≥10 条）
- [ ] 旧源文件头加 LEGACY 注释

**验收**：基线图存在；数字可复现（seed=20260919）。

### T1 脚手架

- [ ] 建 `src/build/`：`palette.js` / `stats.js` / `claimUtil.js` / `index.js` 空壳
- [ ] `index.js` 暂时 re-export 现有 `cityBuild.placeFromCity` 或内联拷贝，保证 main 可切换
- [ ] `main.js` 改为 import `build/index.js`
- [ ] 单文件仍可构建

**验收**：行为与切换前一致（或仅路径变化）；测试绿。

### T2 立面零件 + 住宅/办公最小类型

- [ ] `facade.js`：`paintBody` / `paintWindows` / `paintRoof` / `shade`
- [ ] `types/house.js`：高度 4–8，暖墙，两面窗，屋顶水箱概率
- [ ] `types/office.js`：高度带 + 三种简化立面 + 窗光
- [ ] `types/shop.js`：底层店面色 + 上层窗
- [ ] `districts.js` 分发 + `claimWithRetry`
- [ ] 替换 `placeFromCity` 内建筑循环

**验收**：

- `?cam=pano` 可见窗阵，不再是纯色块
- `?cam=resi` 住宅可辨
- `?cam=cbd` 有高塔密度
- audit 0；claims 数相对 1A 上升
- 总实例 < 660k

### T3 密度填充

- [ ] `fillBlockInterior` + 公园树 `types/green.js` / `props/trees.js`
- [ ] danchi / industrial / civic 简单体量
- [ ] stats：plotUseRate、byDistrict
- [ ] HUD 打印

**验收**：plotUseRate 达 §4.3 目标带；pano 无大片荒地；公园有树。

### T4 地标增强

- [ ] `types/landmark.js`：塔/天空树/都厅/神社/巨蛋/港
- [ ] 迁 `latticeSection` 等零件，坐标全部来自 `claimBase`
- [ ] `main.js` 信标位置与塔顶对齐 `CITY.anchors` + claim 高度

**验收**：六机位中地标可辨；放大无穿帮压路；audit 0。

### T5 轨道与站

- [ ] `props/rail.js` 替换 `cityBuild.placeRailFromCity`
- [ ] 站台不叠轨；雨棚/名牌/台阶
- [ ] `createTrain` 曲线一致

**验收**：`?cam=station` 站体成立；`?cam=pano` 环线有体量；train 不报错。

### T6 街道静态

- [ ] `props/street.js` 全套道具
- [ ] 静态车辆
- [ ] 桥灯/樱花

**验收**：`?cam=mainstreet/cbd/station` 路侧细节可见；实例仍达标。

### T7 地面轻改 + debug 反查 + 基线对比

- [ ] 标线/水光/地坪色差
- [ ] `?debug=1`：非地面体素压在 road/water/rail 的计数（`vox.keepRecords`）
- [ ] 重截六机位 → `docs/baseline/phase1b/`
- [ ] 与 stage1a 对比表（密度/层次/地标/路侧）

**验收（Phase 1B 出口）**：

| # | 判据 | 标准 |
| --- | --- | --- |
| 1 | 构建 | `npm test` 绿；`build` / `build:single` 成功 |
| 2 | 审计 | `audit()` 五类 = 0 |
| 3 | 反查 | debug 压路/水/轨体素 = 0 |
| 4 | 密度 | plotUseRate 总体 ≥70%；pano 无明显荒漠 |
| 5 | 层次 | cbd/resi/harbor/station 形态可辨 |
| 6 | 地标 | 三塔+神社可辨，不压路 |
| 7 | 路侧 | mainstreet 机位可见灯/杆/至少一种道具 |
| 8 | 预算 | 总实例 ≤660k；glow ≤25%（记录数值） |
| 9 | 性能 | `?cam=pano` FPS 不显著劣于 1A（同机） |
| 10 | 对比 | 相对 stage1a 基线，密度/层次主观显著变好 |

---

## 7. 代码契约摘录

### 7.1 claim 结果

```js
// CITY.claim / claimFree 返回
{ x0, y, z0, x1, z1, w, d, cx, cz, plotId, tag }
```

### 7.2 plot

```js
{ id, blockId, rect:{x0,z0,x1,z1}, cx, cz, w, d, face, roadId, district, h, kind }
// face: 0:+z 1:-z 2:+x 3:-x（与 FACE_OF 一致）
```

### 7.3 零件朝向（自 residential.js）

```js
export const FACE_OF = [[0,1],[0,-1],[1,0],[-1,0]];
// 阳台/雨棚/店面沿 face 外法向偏移
```

### 7.4 窗函数

```js
function paintWindows(vox, c, { h, face, litP, rng, style }) {
  // 至少 face 与 face^1；步长2；亮窗才 add
  // 楼层带 litP 衰减；warmBias 0.7
}
```

---

## 8. 风险与对策（实施层）

| 风险 | 对策 |
| --- | --- |
| 窗光实例爆炸 | 暗窗不生成；步长≥2；亮灯率 25–45%；HUD glow 计数 |
| claim 过严仍空 | retry + interior fill；必要时对 LOW_RISE 仅 -1 重试优先 |
| 旧 rng 耦合弄脏测试 | 建筑/道具 rng 独立 seed 派生 |
| 地标 claimBase 扫 plots 过慢 | 先按 district 过滤 LANDMARK/CBD 邻域再搜 |
| 街道道具沿路遍历过重 | 稀疏采样 pts；MINOR 降频；杆线合并 box |
| 切 main 后回归 | T1 先等价切换再改行为；git 小步提交 |
| 站台叠轨 | rail.js 强制偏移 + 可选 assert（debug） |

---

## 9. 文件变更地图

| 操作 | 路径 |
| --- | --- |
| 新增 | `src/build/**`（见 §3.1） |
| 修改 | `src/main.js`（入口 + HUD） |
| 修改 | `src/ground.js`（标线/水光/地坪色） |
| 修改 | `src/voxel.js`（仅 debug keepRecords / 按 caller 计数，若尚未有） |
| 标注 LEGACY | `residential.js` `skyscrapers.js` `street.js` `park.js` `special.js` `shrine.js` `landmarks.js` `cityBuild.js` |
| 归档/删除 | Phase 1B 通过后：`cityBuild.js` 迁空；legacy 旧文件移到 `_legacy/` 或删除（git 可追） |
| 文档 | `docs/baseline/**`；本 spec 勾选；上级计划 Phase 1B 状态更新 |
| 产物 | `体素东京-暮色.html` 每阶段重建 |

**禁止修改**（除非单独说明）：`src/city/roads|water|blocks|plots|districts|field|terrain|geom` 的生成语义；`tests/**` 中形态不变量测试（应保持绿）。

---

## 10. 建议提交切片

| Commit | 内容 |
| --- | --- |
| c1 | T0 基线截图 + LEGACY 标注 + gap-list |
| c2 | T1 build 脚手架 + main 切换 |
| c3 | T2 facade + house/office/shop + 分发 |
| c4 | T3 密度填充 + green/industrial/civic + stats HUD |
| c5 | T4 地标 |
| c6 | T5 轨道车站 |
| c7 | T6 街道道具 |
| c8 | T7 地面/debug/对比包 + README 小节更新 |

---

## 11. 完成定义（DoD）

Phase 1B 只有在以下 **全部** 满足时才算交付：

1. §6 验收表 1–10 全过  
2. `docs/baseline/phase1b/` 六机位截图相对 stage1a 有明确改善记录  
3. `体素东京-暮色.html` 为 1B 产物  
4. 已知问题写入 checkpoint（如 CITY 仍 2s+、glow 未到 15%、行人无）  
5. 上级计划中 Phase 1B 勾选，下阶段（Phase 2）可直接开工  

---

## 12. 开工检查清单（执行当日）

- [ ] 阅读上级计划 §0–§5 与本 spec  
- [ ] 确认视觉方向「黄昏写实密度」未变  
- [ ] `npm test` 基线绿  
- [ ] 固定 `CFG.SEED=20260919` 做所有对比  
- [ ] 从 **T0** 开始，不跳过基线  
- [ ] 每个 commit 可 `build:single`  

---

*本 spec 是 Phase 1B 的唯一实施依据。Phase 2/3/4 另写 spec 时引用本文编号（F1-x / T-x）。*
