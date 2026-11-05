# 阶段 1 设计规格：城市布局核心（路网 / 地形 / 水系 / 街区 / 地块）

日期：2026-09-19
项目：体素东京 · 暮色（`.`）
状态：已确认，待实施计划

---

## 0. 范围：四阶段划分与本阶段边界

整个「写实生活都市」改造拆成 4 个独立验收的阶段，各自 `npm run build` 通过、各自出 Playwright 截图。本文件只规定**阶段 1**。

| 阶段 | 内容 | 交付判据 |
| --- | --- | --- |
| **1（本文）** | 城市模型：路网 / 地形 / 水系港湾 / 街区派生 / 地块切分 / 分区重判 / 8 个 consumer 迁移到查询契约 / 地面渲染 / 验证工具 | 路网有机、地面有起伏、河是弯的并汇入港湾、**零建筑压路**、`?plan=1` 俯视栅格可判读 |
| 2 | 建筑类型库扩充 + 全局去霓虹与建材配色（提示词第 3、5 节） | 六大类新原型落地、glow ≤ 15% |
| 3 | 动态车流 / 行人 / 船只 + 静态生活细节（第 6 节） | 车辆沿车道行驶、行人游走、生活细节清单达标 |
| 4 | 氛围收尾（雾 / 天光 / 路灯点亮时机）+ 六机位终验 + README | 六张截图全部通过验收 |

**阶段 1 的中间态是允许的**：房子仍是旧样式（町屋盒子、描边霓虹写字楼），但它们必须摆在新生成的地块上、落在正确地坪高度、不压任何道路水体轨道。

**阶段 1 明确不做**：新建筑原型、去霓虹化（唯一例外见 §11.5）、动态车流行人、雾与天光调参。

---

## 1. 坐标系与网格

- 沿用 `1 体素 = 2m`。城市半径 `HALF = 544`，网格 `N = 2*HALF+1 = 1089`，即 1089×1089 = 118.6 万格。
- 世界坐标 `x, z ∈ [-544, 544]` 的整数格对应 cell 索引 `idx = (x + HALF) * N + (z + HALF)`。
- 竖向：`y` 为体素层。**海平面 `y = 0`**（水面中心在 `y = 0`，河床/海床 `y = -1`）。陆地地坪 `h ∈ [1, 7]` 的整数。
- 现有 `CITY_HALF` 语义不变，其余 `ground.js` 导出的布局常量全部删除（§14）。

---

## 2. 生成流水线（严格顺序）

顺序是设计的一部分，不可重排。每一步的输入是上一步的显式产物。

```
P1  terrain.raw      原始高度场（连续值，未量化）
P2  roads.rail       山手线环形轨道曲线 + 车站节点 + 一条放射铁路支线（先于道路！§5.1）
P3  roads.trunk      环状主干 / 放射主干 / 中环弧；栅格化进 cell buffer
                     写 type=ROAD_* / roadId / dirAngle
P4  roads.secondary  离散 Voronoi 次级网 + 删段（§5.3）
P5  roads.profile    道路纵向剖面高度（沿折线移动平均），写 cell.h
P6  water.apply      河流样条带 + 港湾海陆界 + 突堤码头 + 桥位；覆盖 type 与 h
P7  blocks.floodfill 非道路/非水体格 → 连通域 → 街区多边形 + 碎块吸收
P8  districts.assign 逐街区指派分区（§9）
P9  roads.alleys     知道哪些是住宅区后，在街区内刻非破坏性小巷（§5.4）
P10 plots.build      逐街区切临街地块 + 最大矩形可用 footprint（§10）
P11 build            渲染（地面 + 各模块），期间生成器通过 CITY.claim() 登记落位
P12 audit            全量审计：已登记 footprint 无压路/压水/压轨、两两不相交、
                     地坪合法；结果计数写 HUD，非零即为本阶段不通过
```

`CITY` 在 P10 完成后冻结几何部分（拓扑只读），但 `claims` 表在 P12 前持续追加。

**顺序里三处反直觉但必要**：
- 小巷（P9）必须晚于街区派生（P7）**和**分区判定（P8），因为「哪些街区是住宅」要先知道；
- 次级网（P4）早于街区，因为它用的「扇区」是**在折线层面**由环状主干与放射主干围出的多边形（不依赖 cell 连通域），这样 Voronoi 才能反向决定街区形状而不是事后修补；
- 车站 `rank`（P2）早于分区（P8），因为站前商业与副都心的判定要读它，不能反过来等分区。

---

## 3. 文件与模块边界

新增 `src/city/`，全部为**纯数据模块，不 import three.js**（唯一例外：曲线用轻量自实现采样，避免拉入 three 依赖，见 §3.1）。

| 文件 | 职责 | 导出 |
| --- | --- | --- |
| `city/config.js` | 所有常量：半径、道路等级宽度、分区表、配色、种子 | `CFG`, `ROAD_CLASS`, `DISTRICT` |
| `city/field.js` | `CellBuffer`：类型 / 高度 / roadId / dirAngle 四条 typed array；栅格图元工具（线段印花带、圆盘、ribbon 填充）；连通域标记；多源 BFS；最大矩形 | `Field` 及其方法 |
| `city/geom.js` | 折线/多边形工具：角度吸附、Catmull-Rom 自实现采样、Poisson 盘采样、多边形质心与面积 | 纯函数 |
| `city/terrain.js` | P1 原始高度场 + P6 水体下切 + 最终量化 | `rawHeight(x,z)`, `quantize()` |
| `city/roads.js` | P2~P5、P9 路网生成（轨道环、车站、支线、主干、次级网、小巷）与道路纵剖面 | `buildRailAndStations()`, `buildTrunks()`, `buildSecondaries()`, `profileHeights()`, `buildAlleys()` |
| `city/water.js` | P6 河 / 港 / 岸线 / 桥位 | `applyWater(field, roads)` |
| `city/blocks.js` | P7 街区派生 | `extractBlocks(field)` |
| `city/districts.js` | P8 分区判定 | `assignDistricts(blocks, ctx)` |
| `city/plots.js` | P10 地块切分 | `buildPlots(blocks, field)` |
| `city/query.js` | 组装 `CITY` 单例、`claim` 登记表、P12 审计，对外唯一入口 | `buildCity()`, `CITY` |
| `city/viewpoints.js` | 6 个验收机位 + `plan` 机位，全部由 `CITY.anchors` 与街区质心算出，不含硬编码坐标 | `viewpoint(name, CITY)` |
| `ground.js` | 降级为地面渲染器：只读 `CITY`，铺体素 | `buildGround(vox, CITY)` |

**§3.1** 曲线：`city/geom.js` 内实现 centripetal Catmull-Rom 的 `pointAt(t)` 与 `getSpacedPoints(n)`（约 40 行），使 `city/` 层可脱离 three.js 独立测试；`rail.js` 侧继续用 three 的曲线驱动列车动画，两者由同一组控制点构造，保证一致。

**依赖方向**：`city/*` 互不 import `src/` 其他模块；其他模块只 import `city/query.js` + `city/config.js`。禁止 consumer 再自行硬编码任何布局常量。

---

## 4. 对外契约 `CITY`

替换现有的解析式判定（`CORRIDORS` / `RIVER_X` / `RIVER_Z` / `RING_INNER` / `RING_OUTER` / `BLOCK_SIZE` / `blockTypeAt` / `isOnDiagonalRoad`）。

```js
CITY = {
  HALF, N,

  // —— 逐格查询（读 cell buffer，O(1)）——
  cell(x, z)            -> {type, h, roadId, dirAngle} | null   // 越界返回 null
  isRoad(x,z) / isWater(x,z) / isRail(x,z) / isBridge(x,z) / isSidewalk(x,z)
  groundY(x, z)         -> int          // 该点地坪 y（量化后整数）

  // —— 结构 ——
  roads:   Road[]     // {id, cls, pts:[[x,z]…], width, length, laneOffsets:[±o]}
  rail:    {pts, length, spur:{pts,length}, stations: Station[]}
  stations: Station[] // {id, x, z, bearing, rank}  rank: 'main'|'sub'|'local'
  blocks:  Block[]    // {id, cells, poly, bbox, centroid, area, district, h, frontage, plots}
  plots:   Plot[]     // {id, blockId, rect, cx, cz, w, d, face, roadId, district, h, kind}

  blockAt(x,z) -> Block|null
  blocksIn(x0,z0,x1,z1) -> Block[]

  // —— 落位契约（消灭「建筑压路」的机制，§4.2）——
  claim(plotId, w, d, kind) -> {cx, cz, w, d, y} | null   // 申领；失败即返回 null
  claimFree(rect, tag)      -> bool                        // 非地块用途（广场/围墙…）
  footprintClear(x0,z0,x1,z1) -> bool                      // 纯查询，不落登记
  claims:  Claim[]                                         // 全部已登记矩形
  audit()  -> {overlap, onRoad, onWater, onRail, badPad, total}

  // —— 地标与用地锚点（供 landmark/tower/special/park 定位）——
  anchors: { landmarkTower, skytree, metroGov, stadium, freightYard, university,
             danchi, greatPark, shrine, portOffice, wharf, railMainStation }
}
```

**§4.1 为什么必须是登记制而不是 `if (!clear) continue`**：`continue` 让「合理放弃」与「真的压路了」在事后无法区分，验收判据 §15.3 就不可测。登记制把所有实际落位记成一张矩形表，P12 才能给出一个必须为 0 的数字。

**§4.2 `claim` 的语义**：在 `plot.rect` 内随机偏移地试放 `w×d`，要求 (a) 完全落在该 plot 掩码内、(b) `footprintClear` 为真、(c) 不与任何已有 claim 相交。三条件全满足才写入 `claims` 并返回矩形；否则返回 `null`，调用方**必须**放弃（不得强行落位）。尝试次数上限 4 次，超出即跳过该地块。

**§4.3 `audit()` 的判据**：对每条 claim，逐格检查覆盖范围内无 `ROAD_*` / `WATER` / `SEA` / `RAIL` / `SIDEWALK` 格、`h` 全等、且与其它 claim 无交叠。五类计数任一非零即视为 bug。`?debug=1` 把每条违规 claim 画成红柱并列出 `tag`。

**§4.4 迁移后各模块的唯一正确用法**：

```js
for (const b of CITY.blocks) {
  if (b.district !== DISTRICT.LOW_RISE_RESI) continue;
  for (const p of b.plots) {
    const w = rng.int(4, 5), d = rng.int(4, 5);
    const c = CITY.claim(p.id, w, d, 'house');   // 唯一合法落位入口
    if (!c) continue;
    house(vox, c.cx, c.y, c.cz, c.w, c.d, rng, p.face);
  }
}
```

---

## 5. 路网

### §5.1 先轨道、后道路（本规格的核心因果设计）

真实东京的放射路是**沿着山手线的车站**长出来的，不是先有路再有站。因此：

1. **轨道环**：一条闭合曲线，超椭圆采样 72 点，
   `r(θ) = 250 * (1 + 0.055·sin(3θ+φ1) + 0.035·sin(5θ+φ2))`，φ 由种子定。
   闭合由构造保证，不需要角度吸附（相邻弦向仅差 5°，栅格化后楼梯自然平滑）。
2. **车站**：在轨道环上按**不等间距**取 10 个点（方位角 `[14, 51, 88, 121, 158, 196, 233, 264, 301, 340]°` + 种子抖动 ±4°）。`rank` 在本步定（分区判定 P9 要读它，不能反过来）：最靠近原点的站为 `main`；从剩余 9 站里按方位角贪心取互相间隔 ≥ 60° 的 4 站为 `sub`（天然不对称，不会四角对称）；其余 5 站 `local`。
3. **放射主干 7 条**：从 `r≈36`（中心广场外缘）出发，**方位角对准其中 7 个车站**，向外到 `r≈500`。每条 3~6 段，段长 100~200，转角 ±7.5° 或 ±15°（交替符号，种子定），**每段方向吸附到 7.5° 步进的 48 方向集**（吸附后重算下一段起点，累积漂移只作用于角度不作用于闭合性——放射线是开链，无闭合问题）。
   全幅宽 `7~9`。
4. **环状主干（山手通）**：闭合曲线，超椭圆 `r(θ) = 330 * (1 + 0.07·sin(2θ+ψ1) + 0.045·sin(4θ+ψ2))`，与轨道环**不同心、不同形状**（真实的山手线与山手通不是同一条线）。宽 `9`。
5. **中环弧 2 段**：`r≈175`，只覆盖 100°~170° 与 280°~350° 两段（真实城市的中环常是残弧），宽 `6`，用于制造非对称。
6. **铁路放射支线 1 条**：从 `main` 站沿最近的一条放射主干外侧 6~8 格引出，到城市边缘 `r≈520`（货运/本线分离的暗示，也给阶段 3 的第二条线路留出结构位）。高架/路基地面段按 `groundY` 决定。
7. **次级路（离散 Voronoi，用户选定的混合方案）**：见 §5.3。
8. **小巷**：见 §5.4（在 P8 才执行）。

### §5.2 栅格化

`Field.stampRibbon(field, pts, width, cls, id, mode)`：沿折线以 0.4 步长采样，在每个采样点沿法向铺 `width` 格；`width ≥ 5` 时额外在中心线两侧各 1 格写入 `MEDIAN`（中央分隔带）。写入 `type=ROAD_*`、`roadId`、`dirAngle`（该格的路段方向，阶段 3 车道偏移用）。

两种压印模式，因为小巷在 P9 才生成、晚于高等级路：

- `mode='over'`（主干/次级，P3~P4 用）：等级从低到高依次压印，高等级覆盖低等级；被覆盖格的原 `roadId` 记入 `roadIdUnder`（阶段 3 要知道支路在哪里断、小巷被压在哪，故保留）。
- `mode='only-if-block'`（小巷，P9 用）：**非破坏性**——只改当前 `type === BLOCK` 的格，绝不覆盖任何高等级道路、水体、轨道。这保证小巷天然不会截断主干，也不需要事后回滚。

`Field.stampDisc`：路口处按 `width/2 + 1` 铺一次圆盘，消除折线接缝处的斜向空洞。

### §5.3 次级路：多源 BFS 离散 Voronoi + Lloyd

不用几何库。对**每个大的待细分区域**（环内扇区、环外扇区各自成区，由放射线与环线切出）：

1. Poisson 盘撒种子：区域内最小间距 `dMin`——内城扇区 `42`，近郊扇区 `56`（种子间距即目标街区长边，≈ 84m / 112m）。
2. 多源 BFS（4 邻域、只在区域格内传播）→ 离散 Voronoi 区。
3. **Lloyd 松弛 3 轮**：每轮把种子移到其 BFS 区的质心（取整，重落回区内），重跑 BFS。
4. **区界即道路**：属于 ≥2 个区的格及其 4 邻域 → `type=ROAD_MINOR`，`width=4~5`（按种子度决定：度 3 的节点连出的边取 4，长边取 5）。
5. **随机删段制造有机性**：以 12% 概率删除一条完整 Voronoi 边（两区合并）。删除后必须重跑 BFS 确认该边两侧仍是同区且无区域被孤立；否则放弃该次删除。→ 丁字路口、断头路、错位交叉由此自然产生。
6. Voronoi 边方向不受 7.5° 约束（BFS 天然轴对齐 + 45° 楼梯）；`width 4` 的膨胀让锯齿不外露。这是「混合」的代价，接受。

### §5.4 小巷（仅住宅区，P9 执行，非破坏性）

分区（P8）已知，故可精确选目标：`district ∈ {LOW_RISE_RESI, TRADITIONAL}` 且面积 > 900 格的街区，沿长轴方向在距临街边 14~16 格处刻一条宽 2 的通路，两端接到该街区的两块临街边。

写入 `type = BLOCK_ALLEY`，但**保留原 `blockId` 与 `h`**——即小巷是「街区内部的通路」而不是把街区劈成两块（真实街区内的小巷正是如此）。因此不需要重跑连通域；代价是 P10 生成地块时必须跳过 `BLOCK_ALLEY` 格，使地块天然被小巷分成前后两排。审计（§4.3）把 `BLOCK_ALLEY` 视为不可建格。

### §5.5 道路等级表（`ROAD_CLASS`）

| cls | 全幅宽 | 车行 | 人行道 | `MEDIAN` | 用途 |
| --- | --- | --- | --- | --- | --- |
| `RING` | 9 | 5 | 2 | 有 | 环状主干 |
| `RADIAL` | 7~9 | 3~5 | 2 | 有(≥8 时) | 放射主干 |
| `ARTERIAL` | 6 | 4 | 1 | 无 | 中环弧、连接段 |
| `MINOR` | 4~5 | 2~3 | 1 | 无 | 次级（Voronoi 边） |

住宅小巷不是 `ROAD_*` 等级，而是 §5.4 的 `BLOCK_ALLEY`（街区内部通路，保留 `blockId`）。阶段 3 的车辆寻路只允许 `cls ∈ {RING, RADIAL, ARTERIAL, MINOR}`，`BLOCK_ALLEY` 只走行人与自行车。

---

## 6. 地形

### §6.1 表达式

`rawHeight(x,z) = TILT + SCARP + N1 + N2`

- `TILT = -1.9 * (x/HALF)` → 西部 +1.9 / 东部 −1.9（**西高东低**，下町在东与东南）。
- `SCARP`：台地边缘。边界线 `xb(z) = -70 + 45·sin(z/160 + φ)`；`SCARP = 1.9 * smoothstep(xb(z)+30, xb(z)-30, x)`（西侧抬 1.9）。这就是「山手台地 / 下町」的分界，宽 60 格的缓过渡带。
- `N1`：值噪声，点阵格 140，双线性插值，振幅 0.85。
- `N2`：值噪声，点阵格 55，振幅 0.35。

提示词要求「整体高度场振幅 2~4 体素」由 `N1+N2`（合成 ±1.2）承担，`TILT` 与 `SCARP` 是宏观倾斜与台地断阶，不计入该振幅。

### §6.2 量化

`SCARP` 是**单侧**抬升（`0..SCARP_A`，只把西侧垫高，东侧为 0），所以原始场的解析界不对称，必须由振幅常量算出并导出（**不写死数字**）：

`RAW_MIN = -(TILT_A + A1 + A2)`（东端：倾斜为负、无台地、噪声取谷）
`RAW_MAX = +(TILT_A + SCARP_A + A1 + A2)`（西端：倾斜为正、叠上台地、噪声取峰）

映射：`h = clamp(round((raw - RAW_MIN) / (RAW_MAX - RAW_MIN) * 6) + 1, 1, 7)`

即把整个原始振幅铺满 `[1,7]` 六级，下町 1~2、中部 3~4、山手台地 5~6、极值 7，总起伏 6 体素 ≈ 12m，与真实的山手/下町高差同量级。

> **两处历史修订。** ① 原写法 `h = clamp(round(raw + 2.6), 1, 7)` 配合 `TILT ±3.4`/`SCARP 2.4`/`N1 1.3`/`N2 0.5`，raw 跨度 12.8 而窗口只有 6.0，实测 **59.4% 格子夹在 1 或 7**，西部梯度被压平，废掉判据 §15.4；故收窄振幅并改为满窗映射。② 收窄后曾把 `RAW_MIN` 写成 `-(TILT_A + SCARP_A + A1 + A2)`，把单侧的 SCARP 当成双侧算，使 RAW_MIN 比可达最小值还低 1.9 —— level 1 在**任何**场尺寸上都恒为空。上式已按单侧性改正。

**必须为整数**：连续高度会让 §11 的 run-length 合并全部断裂，实例数从 ~10 万涨到百万级。

**饱和度守卫**（写进 `tests/terrain.test.js`）：必须在**完整 1089² 场**上量，不得用小场——小场的可达 raw 区间比全网格更窄，会让守卫在任何窗口下都失真。判据为：两端 level 1 与 level 7 各占比 ≤ 12% 且 > 0（它们本就该稀少，只有夹扁时才多）；内部 level 2~6 各占比 ≥ 1%。

台阶之间的高差用挡土墙表达（§11.3），墙顶做 1 格宽的压顶，台地边缘配坡道与阶梯。

### §6.3 道路优先

P5：每条道路的纵剖面 = 沿折线对 `rawHeight` 做移动平均（窗口 60 格）后取整，写入道路格的 `h`。道路跨越台地边缘时，其纵剖面天然形成 1 格/60 格的缓坡——**这就是提示词要的「道路随地形缓坡」与「台地边缘坡道」**。

街区格的 `h` 在 P7 定：= 该街区边界道路格 `h` 的众数，同街区内所有格同高 → run 合并友好，建筑地坪不需要逐格查询。若某街区与道路之间出现 > 1 的高差（街区坐落在台地上而临街地在下），差额由 §11.3 的挡土墙吸收。

---

## 7. 水系与港湾

### §7.1 河流

一条主河 + 一条支流，均为 Catmull-Rom 样条（`geom.js` 自实现）。

- **主河走城市东侧，不穿 CBD 核心**（对应隅田川在轨道环东侧的位置；若穿中心会把丸之内切散）：控制点 `[50,-544], [150,-370], [235,-195], [292,-15], [305,150], [325,265], [350,380]`，每点抖动 ±22。宽度沿 `t` 从 6 渐变到 14（在 `t ∈ [0,.35,.7,1]` 上取 `[6,8,11,14]` 线性插值）。终点 `(350,380)` 落在 §7.2 的海陆界之外，即河在港湾内消失，形成河口。（2026-09-20 修订：中段 r≥290，抖动后仍高于环轨外包络 264，主河不穿轨道环。）
- **支流自西向东**汇入主河 `t≈0.5` 处：控制点 `[-544,-30], [-380,-55], [-210,-20], [-40,30], [118,88], [205,75], [298,67]`，宽 5→8。它的存在让西部台地边缘与下町之间多一条天然分界。
- **宽度渐变 + 弯曲**取代现在的等宽直线渠道。

填充：逐采样点按当点宽度铺跨（`stampRibbon` 的变体 `stampTaperedRibbon`）。河岸两侧再各铺 3 格 `RECLAIM`（护岸 / 亲水步道），`h = max(1, 邻地 h)`。河床 `h = 0`，水面渲染在 `y = 0`（**不发光的暗水面**，见 §11.5）。

### §7.2 港湾与海

东南角是海。海陆界 = 一条从 `(544, 120)` 到 `(120, 544)` 的开放样条，控制点带凹凸（海湾内凹 25~45 格、岬角外凸 20~35 格）。界外侧全部 `SEA`，`h = 0`。

- **突堤码头 5 座**：从岸线向海伸出 `30~55 × 8~12` 的矩形陆域（`QUAY`），之间形成泊位水面。
- **埋立地**：两处 `SEA` 内切出的矩形工业地（`RECLAIMED`，`h = 1`，与下町同高，体现「填海地最低」的真实逻辑）。
- 主河在东南汇入港湾，河口宽 = 当时河宽 × 1.4。

### §7.3 桥

P6 末尾：遍历道路格与水/海格的邻接关系求交，一条道路连续跨水的格段 = 一座桥（段长按水宽 + 两岸各 2 格）。按 `cls` 配桥型，桥长两侧外扩 2 格：`RING/RADIAL` → 梁桥（含桥墩入水、双侧防撞栏 + 桥头灯）；`ARTERIAL/MINOR` → 简支小桥；`BLOCK_ALLEY` 或绿道跨水 → 朱桥（红栏）。桥面 `h = max(两岸 h) + 1`（保证净空），桥下格保持 `WATER`（桥不产生街区块）——实现上桥格类型为 `BRIDGE` 且 `isWater` 为真，语义等同「桥下格保持 WATER」；轨交跨水同样成桥，净空 2（2026-09-20 裁定）。

---

## 8. 街区派生（P7）

1. 4 邻域连通域标记所有 `type ∈ {BLOCK}` 的格（非道路、非水、非轨道、非海）。
2. 每块记录：`cells`（格列表）、`bbox`、`centroid`、`area`、`perimeter`（与道路/水相邻的边）、`frontage`（相邻 `roadId` 集合与最长临街边）。
3. **碎块吸收**：`area < 120` 的块并入相邻最大块；无邻块则改类型为 `POCKET`（口袋公园/空地，可放树与长椅，不放建筑）。
4. **异形街区是免费产物**：放射线之间天然是扇形/三角形块，中环弧残段内侧天然是月牙形块，不额外手写任何多边形。
5. 目标街区数 **1100~1600**；`area` 分布期望：CBD/站前 1200~2600 格（大街区，对应 40~60 边长），近郊住宅 400~1000 格（对应 20~35 边长）。若分布明显偏窄，调 §5.3 的 `dMin`，**不改代码结构**。

---

## 9. 分区（P8，逐街区判定，不再逐网格索引）

`DISTRICT` 完整集合：

| 常量 | 语义 | 判定 |
| --- | --- | --- |
| `CBD` | 丸之内式办公 + 车站大楼 | 轨道环内、`r < 120`、紧邻 `main` 站 |
| `SUB_CENTER` | 副都心高层集群 | 4 个 `sub` 站周围 1~2 街区半径内（**方位不对称**，站点见 §5.1.2） |
| `STATION_FRONT` | 站前商业（中高层零售 + 公寓） | 任一 `rank ≥ sub` 站外 2~5 街区环带 |
| `COMMERCIAL` | 一般商业街（含商店街候选） | 环内剩余、或沿 `RADIAL/ARTERIAL` 连续临街 3 块以上 |
| `ENTERTAINMENT` | 繁华街（保留，阶段 2 去霓虹） | 1 处连片 4~7 块 |
| `ELECTRONICS` | 电器街（保留，同上） | 1 处连片 3~5 块 |
| `HIGH_RISE_RESI` | 板状公寓塔楼带（10~20 层） | 轨道环外 1~3 街区，或 `danchi` 邻近 |
| `LOW_RISE_RESI` | 低层町屋与一户建 | 由内向外距离衰减的剩余区域 |
| `TRADITIONAL` | 神社寺庙 + 老镇 | 台地边缘附近 1 片 3~6 块，绑定 `shrine` 锚点 |
| `SCHOOL` / `HOSPITAL` / `PUBLIC` | 学校 / 医院 / 交番消防 | 每 N 个住宅块强制取 1（哈希序确定，见 §9.2） |
| `PARK_LARGE` | 大公园 1 处（含体育场邻接绿地） | 台地上连片 6~10 块 |
| `PARK_SMALL` | 街区小游园 / 球技场 | 每 ~12 块取 1；`POCKET` 一律转此 |
| `GREENWAY` | 河岸绿带 | 河两侧 `RECLAIM` 格所属块 |
| `PORT_INDUSTRY` | 湾岸工厂 / 仓库 / 油罐 | 邻 `SEA/QUAY` 且非主河上游 |
| `FREIGHT_YARD` | 综合货物站场（**替代机场**） | 环外东北角锚点，4~6 块 |
| `UNIVERSITY` | 大学校园（**替代游乐园**） | 山手台地边缘锚点，3~5 块 |
| `DANCHI` | 团地（大面积集合住宅） | 近郊 1~2 处，4~8 块 |
| `STADIUM` | 巨蛋体育场 + 周边（保留） | 1 块 ≥ 2000 格 |
| `RAIL_CORRIDOR` | 轨道廊道（非建筑） | 轨道环两侧 6 格 |
| `WATER` / `SEA` / `QUAY` | 水面 / 海 / 岸壁 | 由 §7 决定 |
| `LANDMARK` | 三塔基地 | 独立锚点，各占 1~2 块 |

**§9.2 配额制**：先算各分区所需块数（如 `SCHOOL` 3、`HOSPITAL` 2、`PARK_SMALL` 25…），再从候选块集合中按 `hash(blockId)` 升序取前 k 个。这保证「绿地成系统」而不是随机撒，且**改种子不会让某类设施消失**。

**§9.3 机场/游乐园的既有代码**：`special.js` 的 `buildAirport` / `buildAmusementPark` 在阶段 1 内**改造为 `FREIGHT_YARD` / `UNIVERSITY+DANCHI` 的落地**（保留可复用的构件函数：跑道几何 → 站场轨道束；航站楼 → 货物仓库；摩天轮删除；过山车删除）。阶段 1 只需平面成立（地面铺装 + 围墙 + 少量体块），精修在阶段 2。

---

## 10. 地块（P10）与建筑落位契约

1. 遍历街区的临街边，按边所属 `roadId` 与该边的**主导罗盘方向**归入 **4 个朝向组**（`face ∈ {0:+z, 1:-z, 2:+x, 3:-x}`）。离散 Voronoi 造成的斜边按其法向落到最近的那一个——这样 `residential.js` 现有的 `FRONT[face]` 部件旋转机制可直接复用，不需要重写朝向数学。
2. 每个朝向组生成一条**临街条带**：深度 `D` 按分区取（住宅 16、一般商业 22、站前 26、办公 40、工业 60）。
3. 条带沿临街方向按 `spacing` 切段（住宅 `7~13`、商业 `11~17`、办公 `24~40`），段间留 1~2 格隙缝（消防间距感）。
4. 每段 → 用**最大矩形算法**（二值矩阵直方图法，O(格数)）在「该段 ∩ 街区格 ∖ `BLOCK_ALLEY`」掩码上求最大轴对齐内接矩形，再各边内缩 `setback = 1~2`（人行道退让）。
5. 结果 `Plot{ id, blockId, rect, cx, cz, w, d, face, roadId, district, h, kind }`；`kind ∈ {LOT_HOUSE, LOT_SHOP, LOT_TOWER, LOT_YARD, LOT_OPEN}`（`LOT_OPEN` = 内部停车场 / 空地，不进 `claim`）。
6. 街区未被条带覆盖的内部格 → `PLOT_FREE`（中庭、奥地停车场）。
7. **三条不变量**（P12 审计逐条给数，任一非 0 即本阶段不通过）：
   - `claim` 出的矩形全部落在其 plot 的掩码内，故不含任何 `ROAD_*` / `WATER` / `SEA` / `RAIL` / `SIDEWALK` / `BLOCK_ALLEY` 格；
   - 任意两条 claim 不相交（plot 之间由掩码划分天然不相交，跨 plot 的越界才会相交，故相交计数直接暴露「绕过 `claim` 自己摆」的代码）；
   - 每条 claim 覆盖范围内 `h` 全等（不悬空、不陷地）。
8. **不允许的旁路**：任何模块若不调用 `claim`/`claimFree` 而直接向 `vox` 提交一个 footprint，审计查不到它 → 因此 §12 的 `?debug=1` 另跑一次**体素级反查**：把每个已放置的非地面体素的 `x,z` 列投到 cell buffer 上，统计「落在道路/水体/轨道格上的体素数」。这是唯一能抓住旁路的手段，也是 §15.3 的真正判据。该反查 O(体素数)，只在 debug 模式跑。

建筑高度与形式在阶段 2 决定；阶段 1 各生成器**只做一件事**：把房子按 `plot.rect` 的边界放进去，不再自己算位置。

---

## 11. 地面渲染（`ground.js` 重写）

### §11.1 类型 → 配色

一张 `type → 基色` 表（阶段 1 先只放地面项）：沥青 `0x33363a`（**不用纯黑**）按等级微差 `0x33363a/0x36393d/0x3a3d41`；`MEDIAN` `0x4a4e54`；人行道 `0x8b8f95`；街区分区地坪按 §9 给 2~3 个低饱和基色（水泥/沥青/砂石/绿地基础色）；水面 `0x2b4a5e` 不发光；`QUAY` `0x6b6f76`；挡土墙 `0x7d7a72`。标线（白 `0xd8dcd8` / 黄 `0xd9b83c`）沿用「按段画在格上」的做法，但改从 `cell.dirAngle` 推导，不再是 `x%6`。

### §11.2 run-length 合并（保留并加强）

沿用现有二维合并（横向 run + 纵向条带），key 从 `[y,color,glow]` 改为 `[y, type, colorVariant, glow]`。因为 §6.2 强制整数高度、§6.3 强制同街区同高，**同色同高的大片区域仍然存在**，合并能力不退化。预算目标：地面 ≤ **120k** 实例。

### §11.3 挡土墙与坡道

P7 之后遍历每格与 4 邻域：若 `h > h_nb`，在边界处从 `h_nb+1` 到 `h` 铺一列墙格（同 `type` 的连续边界段再纵向合并）。台地边缘（`SCARP` 带）额外在 `xb(z)` 附近放 2~3 格宽的护坡台阶。预算 ≤ **15k**。

### §11.4 逐体素抖动的落地尺度（与提示词第 3 节的取舍）

提示词要求「同一大墙面允许 ±5% 明度的逐体素抖动」。**在地面上不采用逐格抖动**：118.6 万格若逐格变色，§11.2 的 run 合并能力全部丧失，实例数从 ~10 万直接冲到百万级，70 万预算当场被地面独占。改为：

- **地面 / 道路 / 广场**：按 **8×8 瓦片**取一个 ±5% 明度偏移（同瓦片内同色，跨瓦片可见细微色差，读作铺装分块与年头差异）。
- **建筑外墙**：按 **「楼层带 × 朝向面」**取 ±3~5% 偏移（一面墙上有若干条微差横带，读作楼板-shadow 与玻璃批次差）。
- **1 体素尺度的抖动只用于本就逐格放置的小构件**（铺路石、围墙、屋顶瓦带），因为它们数量小且不参与大 run 合并。

三处都不是逐格高对比噪色，满足提示词「禁止 1 体素尺度的高对比噪点」，同时保住预算。抖动值由 `hash2` 在瓦片/楼层带索引上取，仍确定。

### §11.5 阶段 1 顺带删除的发光（唯一例外）

现有河面 `0x2e7fa8` glow=true（`ground.js:293`）属于「水面自发光」，与去霓虹方向直接冲突，且是地面发光的全部来源。阶段 1 内把**地面发光降为 0**（路灯/橱窗/车灯的发光在建筑与街道模块里，阶段 2/3 处理）。

---

## 12. 验证工具（阶段 1 的验收依赖，必须实现）

在 `main.js` 读 URL 参数，不进生产默认路径：

| 参数 | 行为 |
| --- | --- |
| `?plan=1` | 把 cell buffer 画成 `N×N` canvas 贴图（type → 色、`h` → 明度、站/桥/地块矩形叠线）贴一张水平大平面，俯视正射相机。**用来判断路网形态**——不需要三维渲染就能确认「有机 / 无压路」。`?plan=blocks` 改为按 `blockId` 上色（看街区切分），`?plan=district` 按 §9 分区上色。 |
| `?debug=1` | 三维场景叠加分区色块半透明面片；跑 §10.8 的**体素级反查**（在 `vox.buildBatched` 清空记录**之前**，用 `vox.solid` 原始记录做，故 `CFG.DEBUG` 下须置 `vox.keepRecords = true`），违规列画红柱并在 HUD 列出前 20 条的 `tag` 与 `x,z`。 |
| `?cam=<name>` | 相机预置：`pano`（全景）/ `cbd`（CBD 街景，低机位）/ `mainstreet`（商店街）/ `resi`（住宅区）/ `harbor`（河港）/ `station`（站前广场）/ `plan`。同时关闭 `autoRotate`，使截图可复现。机位存 `city/viewpoints.js`，由 `CITY` 的锚点算出，**不写死数字**（布局变了机位自动跟着走）。 |
| `?seed=<n>` | 覆盖 `CFG.SEED`，用来批量试形态（默认种子固定）。 |

`stats` HUD 追加：`CITY` 构建耗时、街区数 / 地块数 / claim 数、审计五类违规计数、体素级反查的「压在路上的体素数」、总实例、glow 占比、各模块体素计数（`voxel.js` 按 caller 分组）。

---

## 13. 预算与硬约束

| 项 | 现状 | 阶段 1 上限 |
| --- | --- | --- |
| 总实例 | ~430k | ≤ 660k（留 40k 给阶段 2/3） |
| 地面 + 挡土 | 77k | ≤ 135k |
| 高架轨道 + 车站 | ~30k | ≤ 45k（单环 r=250 周长约 1570，加放射支线 520，比现在的双对方框短） |
| glow 实例 | 未统计 | 阶段 1 不升；地面 glow 归零后实测，`≤15%` 的路线在阶段 2 达成 |
| `CITY` 构建耗时 | — | ≤ 400ms（P1~P10，主线程，分帧让出；HUD 打印实测） |
| 每帧新增开销 | — | 0（阶段 1 不引入任何逐帧更新） |
| 内存 | — | cell buffer 4 条 `Int16Array(N*N)` ≈ 9.5MB + `roadIdUnder` 2.4MB，可接受 |

保留不动：`VoxelBuilder` 及其 chunk/RLE/包围球/分批让出机制、`shadowMap.autoUpdate=false` 静态烘焙、`rng.js` 确定性种子、`build:single` 产物链。

---

## 14. consumer 迁移清单（阶段 1 同批改，不留兼容壳）

删除 `ground.js` 的 `BLOCK_SIZE / BLOCK_COUNT / CORRIDORS / RIVER_X / RIVER_Z / RING_INNER / RING_OUTER / DISTRICTS / blockTypeAt / isOnDiagonalRoad / isOnRiver / isOnBridge`。**不提供任何 re-export 兼容壳**——留着就会有人继续用错的那套。

| 文件 | 改动 |
| --- | --- |
| `ground.js` | 整体重写为 `buildGround(vox, CITY)`（§11） |
| `residential.js` | 删 `OFFS` / `plotBlocked` / `mergeBlocked` / `frontClear` / `shopBlocked` 四套重复避让判定；改遍历 `CITY.blocks` → `b.plots` → `CITY.claim()`；`house()` / `shop()` 等签名加 `y0`（地坪），内部所有 `y` 由相对量改 `y0 +` |
| `skyscrapers.js` | 删 `generateSkyscraperDefs` 的手写 `i,j` 与 5 段硬编码范围 → 由 `CBD`/`SUB_CENTER`/`STATION_FRONT` 街区与 plot 驱动；`cx,cz` 来自 `claim`，基高来自 `CITY`。立面/霓虹原样保留（阶段 2 再改） |
| `street.js` | 路灯/电线杆/贩卖机/信号灯/公交站沿 `CITY.roads` 折线按 `cls` 间距布在 `isSidewalk` 格上；删 `nearCorr`；河畔樱花改挂 §7.1 的 `RECLAIM` 格；桥栏与桥头灯改遍历 §7.3 的桥列表；车辆暂仍静态烘焙，但位置与朝向改从 `CITY.roads` 的 `laneOffsets` + `dirAngle` 取（阶段 3 换动画时直接复用同一套路径数据） |
| `rail.js` | 轨道曲线改由 `CITY.rail.pts` 构造（与 `city/roads.js` 同一控制点）；桥墩下探到 `CITY.groundY`（跨水到河床）；车站改在 `CITY.stations` 上（`main` 站规模更大），删 `RING_INNER/RING_OUTER` 与方框折点；`createTrain` 的弧长查找表逻辑不动 |
| `special.js` | `buildPort` → 依 §7.2 岸线/突堤坐标（不再硬编码 376/408/282 等）；`buildAirport` → `FREIGHT_YARD`（§9.3）；`buildAmusementPark` → `UNIVERSITY`+`DANCHI`；`buildStadium` → 位置取 `CITY.anchors.stadium`。四处均须走 `claimFree` |
| `park.js` | `buildPark` 遍历 `PARK_LARGE`/`PARK_SMALL`/`GREENWAY`/`POCKET` 街区；`cherryTree` 保持导出（被 `street.js` 用）；删 `BLOCK_SIZE` |
| `shrine.js` | 位置改 `CITY.anchors.shrine`（在 `TRADITIONAL` 块内）；删 `BLOCK_SIZE` |
| `tower.js` / `landmarks.js` | 位置改 `CITY.anchors.*`；基高改 `CITY.groundY`；`main.js` 里 `8*32` 之类的硬编码坐标清零 |
| `main.js` | 构建步骤序列按 §2 调整（先 `CITY = buildCity()` 再 `buildGround(vox, CITY)`）；点光源位置从锚点取；新增 §12 的 URL 参数与 HUD 计数 |
| `voxel.js` | 不动，除两处：`buildBatched` 增加按 caller 分组的计数（供 HUD）；新增 `keepRecords` 开关（仅 `?debug=1` 打开，用于 §10.8 体素级反查） |

---

## 15. 阶段 1 完成判据（逐条可验）

1. `npm run build` 通过；`npm run build:single` 出单文件。
2. `?plan=1` 俯视图中可读出：一条近圆环 + 7 条放射 + 中环残弧 + 有机次级网；街区面积分布不均且含三角形/梯形；河弯曲渐宽，汇入凹凸岸线的港湾与 5 座突堤。**无 35×35 等距痕迹**。
3. `?debug=1` 下 HUD 的两组数字**同时为 0**：(a) `audit()` 五类违规；(b) 体素级反查「压在道路/水体/轨道格上的非地面体素数」。（(b) 是硬判据，能抓住任何绕过 `claim` 的模块。）
4. 六机位截图：全景 / CBD 街景 / 商店街 / 住宅区 / 河港 / 站前广场。逐张确认：路面可见且不被占、地坪有高差、桥在路口处、天光下无发光水面、无建筑悬空。
5. 总实例 ≤ 660k；`CITY` 构建 ≤ 400ms；帧率不低于现状（改动后 `?cam=pano` 实测 FPS 与改前同机位对比）。
6. 同一种子两次加载像素一致（确定性未破）。
7. 地面实例 ≤ 135k（§11.2 的 RLE 未被地形打碎的量化证据）。

## 16. 风险与对策

| 风险 | 对策 |
| --- | --- |
| 地形 + 异形路网打碎 run 合并，实例爆炸 | §6.2 强制整数高度、§6.3 强制同街区同高；判据 §15.7 专门盯这一项；爆了先调 `dMin` 与噪声振幅，**不改结构** |
| 碎街区 / 极窄地块放不下建筑 | §8.3 碎块吸收 + §10.4 setback 失败即降 `w/d`；宁可少放房子，不放歪 |
| 离散 Voronoi 的 45° 斜边观感脏 | §5.3.6 边宽膨胀 4~5；仍脏则用 `CFG.VORONOI=false` 退回纯折线次级网（配置开关，不改结构） |
| 一次改 12 个文件，中间态不可运行 | 实施计划按 §2 流水线切序：P1~P10 纯数据 + `?plan=1` 先独立通过（此时三维场景仍是旧渲染），再一次性切 consumer。`CFG.LEGACY_GROUND=true` 临时开关保留旧 `buildGround` 到迁移完成，保证每步都能出图 |
| 高度场把建筑托到半空（旧模块仍按 `y=0` 起建） | 迁移顺序上**先给每个生成器加 `y0` 形参并传 `CITY.groundY`**（机械改动，一次一个文件），再接 plot 驱动；`?debug=1` 的悬空计数即时暴露漏改 |
| 分区配额改动导致某类设施消失 / 扎堆 | §9.2 配额制 + `?plan=district` 一张图看全部分区分布 |

`CFG.LEGACY_GROUND` 与 `CFG.VORONOI` 是**迁移期的临时开关**，阶段 1 结束时必须连同旧 `buildGround` 代码一起删除（判据：`grep -rn LEGACY_GROUND src/` 为空）。

## 17. 附：项目根目录的遗留文件

`_p1.js` … `_p5.js`、`_scene_new.js`、`_scene_orig.js` 是上一轮从单文件 HTML 反解出的临时产物（minified three 别名表 + 手写注释），不在构建路径内。本阶段不引用、不修改、不删除。
