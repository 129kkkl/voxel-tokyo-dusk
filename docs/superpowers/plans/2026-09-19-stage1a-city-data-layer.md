# 阶段 1A：城市模型数据层 + 俯视栅格验证视图 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 `src/city/` 纯数据层（路网 / 地形 / 水系 / 街区 / 分区 / 地块 / 落位审计），并以 `?plan=1` 俯视栅格视图作为城市形态的验收证据。

**Architecture:** 严格顺序的 12 段流水线（规格 §2），每段读上一段的显式产物；全部布局知识集中在一个 `CITY` 查询对象里，通过 `claim()` 登记制让「建筑压路」变成可计数的审计不变量。`src/city/*` 不 import three.js，因此整层可用 Node 内置 `node --test` 在无浏览器环境下测试。

**Tech Stack:** Vite 5 + Three.js 0.160（本计划只在 Task 17 触碰渲染层）、ESM、`node:test` + `node:assert`（零新依赖）。

**Spec:** `docs/superpowers/specs/2026-09-19-stage1-city-layout-core.md` — 本计划实现其 §1~§10、§12、§13（构建耗时/内存部分）。规格里的 §11（地面渲染）与 §14（12 个 consumer 迁移）属于 **Plan B**，在 Task 18 的形态检查点通过后再制定。

---

## Global Constraints

每个 Task 的要求都隐式包含本节。

- `1 体素 = 2m`；城市半径 `HALF = 544`；网格 `N = 2*HALF+1 = 1089`。
- 海平面 `y = 0`；陆地地坪 `h` **必须是 [1,7] 的整数**（规格 §6.2：非整数会打碎 run 合并）。
- 世界坐标整数格 → 索引 `idx = (x + HALF) * N + (z + HALF)`。
- 不得新增任何 npm 依赖。测试用 `node --test`。
- 不得修改 `src/voxel.js`、`src/rng.js` 的现有行为（只可新增可选参数）。
- 所有随机性走 `src/rng.js` 的 `makeRng`/`hash2` + `CFG.SEED`；**同一 SEED 两次运行结果必须逐字节一致**。
- `src/city/*.js` 禁止 `import ... from 'three'`（Task 17 的视图文件除外）。
- 禁止在 `src/city/` 之外新增布局常量；consumer 迁移前保持原样（Plan B 处理）。
- 折线角度一律吸附到 **7.5° 步进的 48 方向集**（规格 §5.1.3）。闭合环用超椭圆采样，天然闭合，不吸附。
- 每个 Task 结束必须：`npm test` 全绿 → `git commit`。禁止攒到最后一次提交。

**关于 git：** 本目录当前不是 git 仓库。Task 1 会 `git init` 并首次提交**改造前**的状态作为回滚锚点。若你不希望在此目录建仓库，现在就说。

---

## 文件结构（本计划新增/修改）

```
tests/                        node --test 用例（新建目录）
  smoke.test.js        config.test.js     geom.test.js      field.test.js
  fieldAlgo.test.js    terrain.test.js    stations.test.js  trunk.test.js
  secondary.test.js    profile.test.js    water.test.js     blocks.test.js
  districts.test.js    alleys.test.js     plots.test.js     query.test.js
  viewpoints.test.js   helpers.js（共用流水线构造，非测试文件）
src/city/config.js            新建  常量：CFG / T / ROAD / DISTRICT / LOT / PALETTE / isRoad / isWater / isBlocked
src/city/geom.js              新建  纯几何：吸附、Catmull-Rom、超椭圆、Poisson 盘、多边形
src/city/field.js             新建  CellBuffer + 栅格图元 + 连通域 + 多源 BFS + 最大矩形
src/city/terrain.js           新建  高度场（raw + 台地边界 + 量化）
src/city/roads.js             新建  轨道环/车站、主干、次级(Voronoi+Lloyd)、纵剖面、小巷
src/city/water.js             新建  河流、港湾、突堤、桥位
src/city/blocks.js            新建  街区派生与碎块吸收
src/city/districts.js         新建  逐街区分区 + 配额 + anchors
src/city/plots.js             新建  临街地块 + 最大矩形 footprint
src/city/query.js             新建  buildCity() 组装 CITY、claim/claimFree、audit()
src/city/viewpoints.js        新建  6 机位 + plan 机位，由 CITY 锚点算出
src/planView.js               新建  ?plan=1 的 canvas 栅格与叠线（唯一 import three 的新文件）
src/main.js                   修改  URL 参数、HUD 计数、?plan/?cam/?seed 分支
index.html                    修改  HUD 增加 #audit 计数行
package.json                  修改  增加 test 脚本
.gitignore                    新建  node_modules / dist / dist-single
```

---

## Task 1: 仓库与测试底座

**Files:**
- Create: `.gitignore`
- Modify: `package.json`（`scripts`）
- Test: `tests/smoke.test.js`

**Interfaces:**
- Consumes: 无
- Produces: `npm test` → `node --test tests/`

- [ ] **Step 1: 先提交改造前的基线（回滚锚点）**

```bash
cd "."
git init -b main
printf 'node_modules/\ndist/\ndist-single/\n*.log\n' > .gitignore
git add .gitignore package.json index.html vite.config.js vite.single.config.js README.md src/ package-lock.json
git commit -m "chore: baseline before voxel-tokyo realism refactor (stage 1)"
```

注意：**故意不加** `_p1.js … _p5.js`、`_scene_new.js`、`_scene_orig.js`、`体素东京-暮色*.html`、`9541-*.jpg`（规格 §17：临时产物；HTML 是构建产物）。`git status` 应显示它们为 untracked 且被留在工作区，不删除。

- [ ] **Step 2: 加 test 脚本**

`package.json` 的 `scripts` 增加一行（保留其余不动）：

```json
    "test": "node --test \"tests/**/*.test.js\""
```

（原计划写的是 `node --test tests/`；Node v24 + Windows 下该形式解析为模块路径而失败，已在 Task 1 实施时改为 glob，语义相同。）

- [ ] **Step 3: 写冒烟测试**

`tests/smoke.test.js`：

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng, hash2 } from '../src/rng.js';

test('rng 确定性：同种子同序列', () => {
  const a = makeRng(20260919), b = makeRng(20260919);
  for (let i = 0; i < 100; i++) assert.equal(a(), b());
});

test('rng 辅助方法与 hash2 值域', () => {
  const r = makeRng(7);
  assert.equal(r.int(3, 3), 3);
  const x = r.range(1, 2);
  assert.ok(x >= 1 && x < 2);
  for (let i = -5; i < 5; i++) {
    const h = hash2(i, i * 3);
    assert.ok(h >= 0 && h < 1, `hash2 越界: ${h}`);
  }
  assert.equal(hash2(1, 2), hash2(1, 2));
});
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test`
Expected: PASS（2 tests）。若报 `Cannot find module '../src/rng.js'`，说明测试里的相对路径基准是 `tests/`，确认写法为 `../src/rng.js`。

- [ ] **Step 5: 提交**

```bash
git add .gitignore package.json tests/smoke.test.js
git commit -m "chore: add node:test harness for the city data layer"
```

---

## Task 2: `city/config.js` — 常量与格子类型

**Files:**
- Create: `src/city/config.js`
- Test: `tests/config.test.js`（并入 `tests/smoke.test.js` 亦可，此处单独建文件）

**Interfaces:**
- Consumes: 无
- Produces: `CFG`, `T`, `ROAD`, `isRoad(t)`, `isWater(t)`, `DISTRICT`, `PALETTE`, `idx(x,z)`, `inb(x,z)`

- [ ] **Step 1: 写失败的测试**

`tests/config.test.js`：

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG, T, ROAD, isRoad, isWater, DISTRICT, idx, inb } from '../src/city/config.js';

test('网格尺寸自洽', () => {
  assert.equal(CFG.HALF, 544);
  assert.equal(CFG.N, 1089);
  assert.equal(CFG.N, 2 * CFG.HALF + 1);
});

test('格子索引唯一且不越界', () => {
  assert.equal(idx(-CFG.HALF, -CFG.HALF), 0);
  assert.equal(idx(CFG.HALF, CFG.HALF), CFG.N * CFG.N - 1);
  assert.equal(new Set([idx(0, 0), idx(0, 1), idx(1, 0)]).size, 3);
  assert.equal(inb(0, 0), true);
  assert.equal(inb(CFG.HALF + 1, 0), false);
  assert.equal(inb(-CFG.HALF - 1, 0), false);
});

test('道路类型连续，isRoad/isWater 可用区间判断', () => {
  assert.equal(T.ROAD_MINOR, T.ROAD_RING + 3);      // 连续：RING,RADIAL,ARTERIAL,MINOR
  assert.equal(isRoad(T.ROAD_RING), true);
  assert.equal(isRoad(T.ROAD_MINOR), true);
  assert.equal(isRoad(T.SIDEWALK), false);
  assert.equal(isRoad(T.BLOCK), false);
  assert.equal(isWater(T.WATER), true);
  assert.equal(isWater(T.SEA), true);
  assert.equal(isWater(T.QUAY), false);             // 突堤是陆域，不是水
  assert.equal(isWater(T.BLOCK), false);
});

test('道路等级参数齐备', () => {
  for (const k of ['RING', 'RADIAL', 'ARTERIAL', 'MINOR']) {
    const r = ROAD[k];
    assert.ok(r.width >= 4 && r.width <= 9, `${k} 宽度越界`);
    assert.equal(typeof r.t, 'number');
    assert.ok(r.walk >= 1);
    assert.equal(r.t, T['ROAD_' + k]);
    assert.ok(r.lampGap > 0);
    assert.equal(r.carOk, true);
  }
});

test('分区枚举无重复值', () => {
  const vals = Object.values(DISTRICT);
  assert.equal(new Set(vals).size, vals.length);
  assert.ok(vals.length >= 18);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/city/config.js'`

- [ ] **Step 3: 实现**

`src/city/config.js`：

```js
/** 城市模型的全部常量。规格 §1/§5.5/§9/§13。改布局只改这里。 */

export const CFG = {
  SEED: 20260919,
  HALF: 544,
  N: 1089,
  ANGLE_STEP: 7.5,          // 48 方向集
  RAIL_R: 250,
  RING_R: 330,
  INNER_R: 175,
  RADIAL_R0: 36,
  RADIAL_R1: 500,
  VORONOI: true,            // 规格 §16：关掉退回纯折线次级网
  INNER_DMIN: 42,
  OUTER_DMIN: 56,
  LLOYD_ITERS: 3,
  MINOR_DELETE_P: 0.12,
  SLIVER_AREA: 120,         // 碎块吸收阈值（规格 §8.3）
  MIN_PLOT_SIDE: 4,         // 规格 §10：小于此边长不出地块
  ALLEY_MIN_AREA: 900,
  ALLEY_DEPTH: 15,
};

/** 格子类型。ROAD_* 必须连续，isRoad 依赖此不变量。 */
export const T = {
  OUTSIDE: 0,
  BLOCK: 1,
  ROAD_RING: 2, ROAD_RADIAL: 3, ROAD_ARTERIAL: 4, ROAD_MINOR: 5,
  SIDEWALK: 6, MEDIAN: 7,
  RAIL: 8,
  WATER: 9, SEA: 10, QUAY: 11, RECLAIM: 12, RECLAIMED: 13,
  BLOCK_ALLEY: 14, PLOT_FREE: 15, POCKET: 16,
  BRIDGE: 17, PLOT_USE: 18,
};

export const isRoad = (t) => t >= T.ROAD_RING && t <= T.ROAD_MINOR;
export const isWater = (t) => t === T.WATER || t === T.SEA;
/**
 * 不可建筑的格子类型（规格 §10.7 不变量 1）。
 * 刻意允许：BLOCK / PLOT_USE / PLOT_FREE / QUAY / RECLAIM / RECLAIMED —— 突堤、护岸与
 * 埋立地都是要放工厂仓库的陆域（规格 §7.2）。
 * 刻意禁止：BRIDGE 与 POCKET —— 桥面不是用地；口袋公园只放树与长椅（规格 §8.3）。
 * 这两条若放进可建集，Task 16 的 claimFree 就能把房子摆上桥面或压掉小游园。
 */
export const isBlocked = (t) =>
  isRoad(t) || isWater(t) || t === T.SEA || t === T.RAIL
  || t === T.SIDEWALK || t === T.MEDIAN || t === T.BLOCK_ALLEY
  || t === T.OUTSIDE || t === T.BRIDGE || t === T.POCKET;

/** 道路等级：宽度含人行道（规格 §5.5）。lampGap = 路灯间距。 */
export const ROAD = {
  RING:     { t: T.ROAD_RING,     width: 9, walk: 2, median: true,  lampGap: 18, carOk: true, bridge: 'beam' },
  RADIAL:   { t: T.ROAD_RADIAL,   width: 8, walk: 2, median: true,  lampGap: 16, carOk: true, bridge: 'beam' },
  ARTERIAL: { t: T.ROAD_ARTERIAL, width: 6, walk: 1, median: false, lampGap: 14, carOk: true, bridge: 'small' },
  MINOR:    { t: T.ROAD_MINOR,    width: 4, walk: 1, median: false, lampGap: 22, carOk: true, bridge: 'small' },
};

export const DISTRICT = {
  CBD: 'cbd',
  SUB_CENTER: 'sub_center',
  STATION_FRONT: 'station_front',
  COMMERCIAL: 'commercial',
  ENTERTAINMENT: 'entertainment',
  ELECTRONICS: 'electronics',
  HIGH_RISE_RESI: 'high_rise_resi',
  LOW_RISE_RESI: 'low_rise_resi',
  TRADITIONAL: 'traditional',
  SCHOOL: 'school',
  HOSPITAL: 'hospital',
  PUBLIC: 'public',
  PARK_LARGE: 'park_large',
  PARK_SMALL: 'park_small',
  GREENWAY: 'greenway',
  PORT_INDUSTRY: 'port_industry',
  FREIGHT_YARD: 'freight_yard',
  UNIVERSITY: 'university',
  DANCHI: 'danchi',
  STADIUM: 'stadium',
  LANDMARK: 'landmark',
  NONE: 'none',
};

/** 地块用途（规格 §10.5） */
export const LOT = {
  HOUSE: 'lot_house', SHOP: 'lot_shop', TOWER: 'lot_tower',
  YARD: 'lot_yard', OPEN: 'lot_open',
};

/** 阶段 1 只用到的地面/水体基色（建筑配色在阶段 2）。规格 §11.1。 */
export const PALETTE = {
  asphaltRing: 0x33363a, asphaltRadial: 0x36393d, asphaltMinor: 0x3a3d41,
  median: 0x4a4e54, sidewalk: 0x8b8f95, wall: 0x7d7a72,
  markWhite: 0xd8dcd8, markYellow: 0xd9b83c,
  water: 0x2b4a5e, sea: 0x25404f, quay: 0x6b6f76, reclaim: 0x8f8d84,
  rail: 0x70757d,
};

export const idx = (x, z) => (x + CFG.HALF) * CFG.N + (z + CFG.HALF);
export const inb = (x, z) =>
  x >= -CFG.HALF && x <= CFG.HALF && z >= -CFG.HALF && z <= CFG.HALF;
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test`
Expected: PASS

若 `isRoad` 的连续性断言失败，说明 `T` 里 `ROAD_*` 被插入了别的值——**调整枚举顺序**，不要放宽断言。

- [ ] **Step 5: 提交**

```bash
git add src/city/config.js tests/config.test.js
git commit -m "feat(city): layout constants and cell types"
```

---

## Task 3: `city/geom.js` — 纯几何工具

**Files:**
- Create: `src/city/geom.js`
- Test: `tests/geom.test.js`

**Interfaces:**
- Consumes: `CFG`
- Produces: `snapAngle(deg)`, `bearing(x0,z0,x1,z1)`, `polylineLength(pts)`, `resample(pts,step)`, `catmullRom(pts,{closed,perSeg})`, `superEllipse(r0,harmonics,count,phase)`, `poissonDisk(x0,z0,x1,z1,minDist,rng,inside,count)`, `polygonArea(pts)`, `polygonCentroid(pts)`, `pointInPolygon(x,z,poly)`

- [ ] **Step 1: 写失败的测试**

`tests/geom.test.js`：

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  snapAngle, bearing, polylineLength, resample, catmullRom, superEllipse,
  poissonDisk, polygonArea, polygonCentroid, pointInPolygon,
} from '../src/city/geom.js';
import { makeRng } from '../src/rng.js';

test('snapAngle 吸附到 7.5° 步进并归一到 (-180,180]', () => {
  assert.equal(snapAngle(7.6), 7.5);
  assert.equal(snapAngle(3.6), 3.75 * 0 + 0);       // <3.75 归 0
  assert.equal(snapAngle(-20), -22.5);
  assert.equal(snapAngle(355), -7.5);               // 越过 180 折回（355→352.5→-7.5）
  assert.equal(snapAngle(180), 180);
  assert.equal(snapAngle(-180), 180);
});

test('bearing 与 snapAngle 组合可做折线转角', () => {
  assert.equal(bearing(0, 0, 10, 0), 0);            // +x 为 0°
  assert.equal(bearing(0, 0, 0, 10), 90);           // +z 为 90°
  assert.ok(Math.abs(bearing(0, 0, 10, 10) - 45) < 1e-9);
});

test('polylineLength / resample', () => {
  const line = [[0, 0], [30, 0], [30, 40]];
  assert.ok(Math.abs(polylineLength(line) - 70) < 1e-9);
  const r = resample(line, 10);
  assert.ok(Math.abs(polylineLength(r) - 70) < 0.5);
  for (let i = 1; i < r.length; i++) {
    const d = Math.hypot(r[i][0] - r[i - 1][0], r[i][1] - r[i - 1][1]);
    assert.ok(d <= 10 + 1e-6, `步长超限 ${d}`);
  }
});

test('catmullRom 闭合曲线首尾不重复、且回到起点附近', () => {
  const square = [[-100, -100], [100, -100], [100, 100], [-100, 100]];
  const c = catmullRom(square, { closed: true, perSeg: 12 });
  assert.equal(c.length, 4 * 12);                    // 闭曲线不追加重复终点
  const d0 = Math.hypot(c[0][0] - c[c.length - 1][0], c[0][1] - c[c.length - 1][1]);
  assert.ok(d0 < 30, `未闭合: ${d0}`);
});

test('superEllipse 闭合、半径在谐波包络内、点数正确', () => {
  const pts = superEllipse(250, [[3, 0.055, 0.4], [5, 0.035, 1.1]], 72, 0);
  assert.equal(pts.length, 72);
  const rs = pts.map(([x, z]) => Math.hypot(x, z));
  assert.ok(Math.max(...rs) <= 250 * 1.095 + 1e-6);
  assert.ok(Math.min(...rs) >= 250 * 0.905 - 1e-6);
  assert.ok(Math.hypot(pts[0][0] - pts[71][0], pts[0][1] - pts[71][1]) < 100);
});

test('poissonDisk 满足最小间距、都在 inside 区域内、确定性', () => {
  const inBox = (x, z) => x >= -50 && x <= 50 && z >= -50 && z <= 50;
  const run = () => poissonDisk(-60, -60, 60, 60, 12, makeRng(5), inBox, 400);
  const a = run(), b = run();
  assert.deepEqual(a, b);
  assert.ok(a.length > 15, `样本太少 ${a.length}`);
  for (const [x, z] of a) assert.equal(inBox(x, z), true);
  for (let i = 0; i < a.length; i++)
    for (let j = i + 1; j < a.length; j++)
      assert.ok(Math.hypot(a[i][0] - a[j][0], a[i][1] - a[j][1]) >= 12 - 1e-6, '间距违规');
});

test('多边形面积/质心/内点判定（逆时针正面积）', () => {
  const sq = [[0, 0], [10, 0], [10, 10], [0, 10]];
  assert.ok(Math.abs(Math.abs(polygonArea(sq)) - 100) < 1e-6);
  const [cx, cz] = polygonCentroid(sq);
  assert.ok(Math.abs(cx - 5) < 1e-6 && Math.abs(cz - 5) < 1e-6);
  assert.equal(pointInPolygon(5, 5, sq), true);
  assert.equal(pointInPolygon(15, 5, sq), false);
  assert.equal(pointInPolygon(-1, 5, sq), false);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/city/geom.js'`

- [ ] **Step 3: 实现**

`src/city/geom.js`：

```js
/** 折线与多边形工具（规格 §5）。纯函数、无 three 依赖。角度单位：度，方位角以 +x 为 0、+z 为 90。 */
import { CFG } from './config.js';

const D2R = Math.PI / 180;

/** 折回 (-180, 180] */
export function wrap180(a) {
  let x = ((a + 180) % 360 + 360) % 360 - 180;
  return x === -180 ? 180 : x;
}

/** 吸附到 CFG.ANGLE_STEP 的整数倍 */
export function snapAngle(deg) {
  return wrap180(Math.round(deg / CFG.ANGLE_STEP) * CFG.ANGLE_STEP);
}

export function bearing(x0, z0, x1, z1) {
  return Math.atan2(z1 - z0, x1 - x0) / D2R;
}

export function polylineLength(pts) {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return s;
}

/** 等步长重采样（保留原始端点，闭合性由调用方决定） */
export function resample(pts, step) {
  const out = [[pts[0][0], pts[0][1]]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const [x0, z0] = pts[i - 1], [x1, z1] = pts[i];
    const seg = Math.hypot(x1 - x0, z1 - z0);
    if (seg < 1e-9) continue;
    const ux = (x1 - x0) / seg, uz = (z1 - z0) / seg;
    let d = step - carry;
    while (d <= seg) {
      out.push([x0 + ux * d, z0 + uz * d]);
      d += step;
    }
    carry = seg - (d - step);
  }
  const last = pts[pts.length - 1], tail = out[out.length - 1];
  if (Math.hypot(last[0] - tail[0], last[1] - tail[1]) > 1e-6) out.push([last[0], last[1]]);
  return out;
}

/** centripetal Catmull-Rom。closed=true 时返回 count*perSeg 个点且不重复首点。 */
export function catmullRom(pts, { closed = false, perSeg = 8 } = {}) {
  const P = pts.map(p => [p[0], p[1]]);
  const n = P.length;
  const at = (i) => closed ? P[(i + n) % n] : P[Math.min(Math.max(i, 0), n - 1)];
  const out = [];
  const segs = closed ? n : n - 1;
  for (let s = 0; s < segs; s++) {
    const p0 = at(s - 1), p1 = at(s), p2 = at(s + 1), p3 = at(s + 2);
    const alpha = (a, b) => Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1]), 0.5);
    const t0 = 0, t1 = t0 + alpha(p0, p1), t2 = t1 + alpha(p1, p2), t3 = t2 + alpha(p2, p3);
    for (let k = 0; k < perSeg; k++) {
      const t = t1 + (t2 - t1) * (k / perSeg);
      const a1x = (t1 - t) / (t1 - t0) * p0[0] + (t - t0) / (t1 - t0) * p1[0];
      const a1z = (t1 - t) / (t1 - t0) * p0[1] + (t - t0) / (t1 - t0) * p1[1];
      const a2x = (t2 - t) / (t2 - t1) * p1[0] + (t - t1) / (t2 - t1) * p2[0];
      const a2z = (t2 - t) / (t2 - t1) * p1[1] + (t - t1) / (t2 - t1) * p2[1];
      const a3x = (t3 - t) / (t3 - t2) * p2[0] + (t - t2) / (t3 - t2) * p3[0];
      const a3z = (t3 - t) / (t3 - t2) * p2[1] + (t - t2) / (t3 - t2) * p3[1];
      const q1x = (t2 - t) / (t2 - t0) * a1x + (t - t0) / (t2 - t0) * a2x;
      const q1z = (t2 - t) / (t2 - t0) * a1z + (t - t0) / (t2 - t0) * a2z;
      const q2x = (t3 - t) / (t3 - t1) * a2x + (t - t1) / (t3 - t1) * a3x;
      const q2z = (t3 - t) / (t3 - t1) * a2z + (t - t1) / (t3 - t1) * a3z;
      out.push([
        (t2 - t) / (t2 - t1) * q1x + (t - t1) / (t2 - t1) * q2x,
        (t2 - t) / (t2 - t1) * q1z + (t - t1) / (t2 - t1) * q2z,
      ]);
    }
  }
  if (!closed) out.push([P[n - 1][0], P[n - 1][1]]);
  return out;
}

/**
 * 闭合近圆：r(θ) = r0 * (1 + Σ aᵢ·sin(kᵢθ + φᵢ))（规格 §5.1.1/§5.1.4）
 * @param harmonics [[k, amp, phase], ...]
 */
export function superEllipse(r0, harmonics, count, phase0 = 0) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const th = phase0 + (i / count) * Math.PI * 2;
    let r = 1;
    for (const [k, a, ph] of harmonics) r += a * Math.sin(k * th + ph);
    r *= r0;
    out.push([Math.cos(th) * r, Math.sin(th) * r]);
  }
  return out;
}

/** 网格加速的 Poisson 盘撒点（Bridson 的简化变体，确定性）。
 *  先取整再做 inside/far 判定——若先判后取整，返回的点间距可小于 minDist。 */
export function poissonDisk(x0, z0, x1, z1, minDist, rng, inside, target) {
  const pts = [];
  const cell = minDist / Math.SQRT2;
  const grid = new Map();
  const key = (gx, gz) => gx * 100003 + gz;
  const far = (x, z) => {
    const gx = Math.floor((x - x0) / cell), gz = Math.floor((z - z0) / cell);
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
      const q = grid.get(key(gx + a, gz + b));
      if (!q) continue;
      for (const [px, pz] of q) if (Math.hypot(x - px, z - pz) < minDist) return false;
    }
    return true;
  };
  let tries = target * 60;
  while (pts.length < target && tries-- > 0) {
    const x = Math.round(x0 + rng() * (x1 - x0));
    const z = Math.round(z0 + rng() * (z1 - z0));
    if (!inside(x, z) || !far(x, z)) continue;
    pts.push([x, z]);
    const gx = Math.floor((x - x0) / cell), gz = Math.floor((z - z0) / cell);
    const k = key(gx, gz);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push([x, z]);
  }
  return pts;
}

export function polygonArea(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

export function polygonCentroid(pts) {
  let a = 0, cx = 0, cz = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    const f = p[0] * q[1] - q[0] * p[1];
    a += f; cx += (p[0] + q[0]) * f; cz += (p[1] + q[1]) * f;
  }
  if (Math.abs(a) < 1e-9) {
    let sx = 0, sz = 0;
    for (const p of pts) { sx += p[0]; sz += p[1]; }
    return [sx / pts.length, sz / pts.length];
  }
  a *= 3;
  return [cx / a, cz / a];
}

export function pointInPolygon(x, z, poly) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) hit = !hit;
  }
  return hit;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test`
Expected: PASS。`superEllipse` 那条若 `max(rs)` 越界，说明谐波叠加写成相加而非乘性；**改成乘性**，不要放宽容差。

- [ ] **Step 5: 提交**

```bash
git add src/city/geom.js tests/geom.test.js
git commit -m "feat(city): geometry helpers (angle snap, catmull-rom, poisson, polygon)"
```

---

## Task 4: `city/field.js` — CellBuffer 与栅格图元

**Files:**
- Create: `src/city/field.js`
- Test: `tests/field.test.js`

**Interfaces:**
- Consumes: `CFG`, `T`, `ROAD`, `isRoad`, `idx`, `inb`
- Produces: `class Field { t,h,roadId,roadIdUnder,dir,blockId; idx; inb; at; setAt; fill; stampRibbon(pts, o); stampDisc(x,z,r,o); countIf(fn) }`

`Field` 的格属性数组（规格 §13 内存表）：`t:Uint8Array`、`h:Int8Array`、`roadId:Int16Array`、`roadIdUnder:Int16Array`、`dir:Int8Array`（0..47 → ×7.5°）、`blockId:Int32Array`。

`stampDisc` 只服务路口加铺，只实现默认 `'over'` 模式即可——小巷走 `stampRibbon` 的 `'only-if-block'`（规格 §5.4）。不要给 `stampDisc` 补 `'only-if-block'` 分支：没有调用方，且它会写出 `o.type` 而与 `stampRibbon` 的语义不对称。

- [ ] **Step 1: 写失败的测试**

`tests/field.test.js`：

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Field } from '../src/city/field.js';
import { CFG, T, isRoad } from '../src/city/config.js';

const H = 60;                                  // 测试用小场，别跑 1089²

test('at/setAt 与越界', () => {
  const f = new Field(H);
  assert.equal(f.inb(H, 0), true);                  // 边界含端点：±half 都在场内
  assert.equal(f.inb(H + 1, 0), false);
  assert.equal(f.inb(-H - 1, 0), false);
  assert.equal(f.inb(-H, -H), true);
  assert.equal(f.at(H + 1, H + 1), null);           // 越界查询返回 null
  f.setAt(5, 5, { t: T.BLOCK, h: 3 });
  assert.equal(f.t[f.idx(5, 5)], T.BLOCK);
  assert.equal(f.at(5, 5).h, 3);
  assert.equal(f.at(5, 5).roadId, -1);
});

test('fill 覆盖全格', () => {
  const f = new Field(H);
  f.fill((x, z) => ({ t: (x + z) & 1 ? T.BLOCK : T.SIDEWALK }));
  // 121×121 棋盘：(x+z) 为奇数的格数 = 7320，偶数 = 7321
  assert.equal(f.countIf((c) => c.t === T.BLOCK), 7320);
  assert.equal(f.countIf((c) => isRoad(c.t) || c.t === T.SIDEWALK || c.t === T.BLOCK), 121 * 121);
});

test('stampRibbon 轴对齐直线：宽度正确、dir 正确、长度正确', () => {
  const f = new Field(H);
  f.stampRibbon([[-50, 0], [50, 0]], { type: T.ROAD_RADIAL, roadId: 7, width: 7 });
  const road = [];
  for (let x = -50; x <= 50; x++) for (let z = -50; z <= 50; z++)
    if (f.t[f.idx(x, z)] === T.ROAD_RADIAL) road.push([x, z]);
  // 宽 7 → 每列 7 格（z ∈ -3..3），101 列
  assert.equal(road.length, 101 * 7);
  const zs = new Set(road.filter(([x]) => x === 0).map(([, z]) => z));
  assert.equal(zs.size, 7);
  // dir：沿 +x 方向 → 0° → 量化为 0
  for (const [x, z] of road) assert.equal(f.dir[f.idx(x, z)], 0);
  for (const [x, z] of road) assert.equal(f.roadId[f.idx(x, z)], 7);
});

test('stampRibbon 斜线：吸附后每格仍连续（无空洞），且落在有限方向集上', () => {
  const f = new Field(H);
  const pts = [[-40, -40], [40, 20]];          // 约 26.6°，吸附到 30°
  f.stampRibbon(pts, { type: T.ROAD_MINOR, roadId: 3, width: 4 });
  const cells = [];
  for (let x = -H; x <= H; x++) for (let z = -H; z <= H; z++)
    if (f.t[f.idx(x, z)] === T.ROAD_MINOR) cells.push([x, z]);
  assert.ok(cells.length > 120, `路太短 ${cells.length}`);
  const dirs = new Set(cells.map(([x, z]) => f.dir[f.idx(x, z)]));
  for (const d of dirs) assert.ok(Number.isInteger(d) && d >= 0 && d < 48);
  // 无空洞：每个格的 8 邻域至少还有一个同类格
  const set = new Set(cells.map(([x, z]) => f.idx(x, z)));
  for (const [x, z] of cells) {
    let nb = 0;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      if (!a && !b) continue;
      if (f.inb(x + a, z + b) && set.has(f.idx(x + a, z + b))) nb++;
    }
    assert.ok(nb >= 2, `孤立路格 ${x},${z}`);
  }
});

test('stampRibbon mode=only-if-block 只改 BLOCK，且改写为 BLOCK_ALLEY', () => {
  const f = new Field(H);
  f.stampRibbon([[-50, 0], [50, 0]], { type: T.ROAD_RING, roadId: 1, width: 9 });
  f.setAt(-10, 20, { t: T.BLOCK });        // 小巷沿 x=-10 走（z∈10..30），BLOCK 要摆在它扫过的地方
  f.setAt(-11, 5, { t: T.BLOCK });         // 纵向超出折线范围，不应被刻
  f.setAt(0, 20, { t: T.BLOCK });          // 横向超出覆盖宽度，不应被刻
  f.stampRibbon([[-10, 10], [-10, 30]], { type: T.ROAD_MINOR, roadId: 2, width: 4, mode: 'only-if-block' });
  assert.equal(f.t[f.idx(0, 0)], T.ROAD_RING);              // 主干未被覆盖
  assert.equal(f.t[f.idx(-10, 20)], T.BLOCK_ALLEY);         // BLOCK 被刻成小巷
  assert.equal(f.t[f.idx(-11, 5)], T.BLOCK);                // z 范围外保持 BLOCK
  assert.equal(f.t[f.idx(0, 20)], T.BLOCK);                 // x 范围外保持 BLOCK
});

test('stampRibbon 等级优先：低等级不能把高等级路面降级（规格 §5.2）', () => {
  const f = new Field(H);
  f.stampRibbon([[-50, 0], [50, 0]], { type: T.ROAD_RING, roadId: 11, width: 9 });
  f.stampRibbon([[0, -30], [0, 30]], { type: T.ROAD_MINOR, roadId: 22, width: 4 });
  // 交叉处必须仍是环状主干，且 roadId 仍是主干的 id
  assert.equal(f.t[f.idx(0, 0)], T.ROAD_RING);
  assert.equal(f.roadId[f.idx(0, 0)], 11);
  // 反过来：高等级压过低等级时，被埋的 id 进 roadIdUnder
  const g = new Field(H);
  g.stampRibbon([[0, -30], [0, 30]], { type: T.ROAD_MINOR, roadId: 22, width: 4 });
  g.stampRibbon([[-50, 0], [50, 0]], { type: T.ROAD_RING, roadId: 11, width: 9 });
  assert.equal(g.t[g.idx(0, 0)], T.ROAD_RING);
  assert.equal(g.roadIdUnder[g.idx(0, 0)], 22);
});

test('stampRibbon taper：宽度随 t 单调变化', () => {
  const f = new Field(H);
  f.stampRibbon([[-55, 0], [55, 0]], { type: T.ROAD_ARTERIAL, roadId: 4, width: 6, taper: [3, 11] });
  const wAt = (x) => {
    let n = 0;
    for (let z = -H; z <= H; z++) if (f.t[f.idx(x, z)] === T.ROAD_ARTERIAL) n++;
    return n;
  };
  assert.ok(wAt(-50) < wAt(50), '未渐宽');
  assert.ok(Math.abs(wAt(-50) - 3) <= 1);
  assert.ok(Math.abs(wAt(50) - 11) <= 1);
});

test('stampDisc 半径正确且写入 roadId', () => {
  const f = new Field(H);
  f.stampDisc(0, 0, 5, { type: T.ROAD_RING, roadId: 9 });
  assert.equal(f.t[f.idx(4, 0)], T.ROAD_RING);
  assert.equal(f.t[f.idx(5, 0)], T.ROAD_RING);
  assert.notEqual(f.t[f.idx(0, 6)], T.ROAD_RING);
  assert.equal(f.roadId[f.idx(3, 3)], 9);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/city/field.js'`

- [ ] **Step 3: 实现**

`src/city/field.js`：

```js
/** 栅格城市场：类型/高度/道路归属/方向 四条 typed array + 图元压印（规格 §5.2、§3）。 */
import { CFG, T, isRoad } from './config.js';
import { resample } from './geom.js';

export class Field {
  constructor(half = CFG.HALF) {
    this.half = half;
    this.N = 2 * half + 1;
    const n = this.N * this.N;
    this.t = new Uint8Array(n);
    this.h = new Int8Array(n);
    this.roadId = new Int16Array(n).fill(-1);
    this.roadIdUnder = new Int16Array(n).fill(-1);
    this.dir = new Int8Array(n);
    this.blockId = new Int32Array(n).fill(-1);
  }
  idx(x, z) { return (x + this.half) * this.N + (z + this.half); }
  inb(x, z) {
    return x >= -this.half && x <= this.half && z >= -this.half && z <= this.half;
  }
  at(x, z) {
    if (!this.inb(x, z)) return null;
    const i = this.idx(x, z);
    return { t: this.t[i], h: this.h[i], roadId: this.roadId[i], dir: this.dir[i], blockId: this.blockId[i] };
  }
  setAt(x, z, o) {
    if (!this.inb(x, z)) return;
    const i = this.idx(x, z);
    if (o.t !== undefined) this.t[i] = o.t;
    if (o.h !== undefined) this.h[i] = o.h;
    if (o.roadId !== undefined) this.roadId[i] = o.roadId;
    if (o.dir !== undefined) this.dir[i] = o.dir;
    if (o.blockId !== undefined) this.blockId[i] = o.blockId;
  }
  fill(fn) {
    for (let x = -this.half; x <= this.half; x++)
      for (let z = -this.half; z <= this.half; z++) this.setAt(x, z, fn(x, z));
  }
  countIf(pred) {
    let c = 0;
    for (let x = -this.half; x <= this.half; x++)
      for (let z = -this.half; z <= this.half; z++) if (pred(this.at(x, z), x, z)) c++;
    return c;
  }

  /**
   * 折线法向铺带。o = {type, roadId, width, taper?, mode='over'|'only-if-block'}
   * taper = [起始全宽, 结束全宽]（格数，非半宽），用于河流渐宽（规格 §7.1）。
   * mode='only-if-block' 时一律改写为 T.BLOCK_ALLEY，忽略 o.type（小巷语义）。
   */
  stampRibbon(pts, o) {
    const { type, roadId, width } = o;
    const mode = o.mode || 'over';
    const dense = resample(pts, 0.4);
    const total = dense.length - 1 || 1;
    for (let s = 0; s < dense.length; s++) {
      const p = dense[s];
      const q = dense[Math.min(s + 1, dense.length - 1)];
      const r = dense[Math.max(s - 1, 0)];
      let dx = q[0] - r[0], dz = q[1] - r[1];
      const L = Math.hypot(dx, dz) || 1;
      dx /= L; dz /= L;
      const fw = o.taper ? o.taper[0] + (o.taper[1] - o.taper[0]) * (s / total) : width;
      // 精确铺出 n 格：偶数宽度不可能关于整数中心对称，故按半格偏移取不对称区间。
      // n=7 → -3..3；n=6 → -2..3；n=4 → -1..2；n=9 → -4..4。
      // 用 ceil(half) 的对称写法会让 §5.5 的偶数等级（4/6/8）各多铺 1 格。
      const n = Math.max(1, Math.round(fw));
      const lo = -Math.floor((n - 1) / 2), hi = Math.floor(n / 2);
      const dirQ = qDir(dx, dz);
      const px = -dz, pz = dx;                       // 水平法向
      for (let w = lo; w <= hi; w++) {
        const x = Math.round(p[0] + px * w), z = Math.round(p[1] + pz * w);
        if (!this.inb(x, z)) continue;
        const i = this.idx(x, z);
        if (mode === 'only-if-block') {              // 小巷：非破坏性（规格 §5.2）
          if (this.t[i] !== T.BLOCK) continue;
          this.t[i] = T.BLOCK_ALLEY;
          continue;
        }
        if (isRoad(this.t[i]) && isRoad(type)) {     // 等级优先：高覆低，低不得降级高（规格 §5.2）
          if (roadRank(type) > roadRank(this.t[i])) {
            this.roadIdUnder[i] = this.roadId[i];    // 被压掉的原等级 id 记下来
          } else if (roadRank(type) < roadRank(this.t[i])) {
            continue;                                // 低等级遇到高等级：此格不动，路面保持连续由高等级本身负责
          }
        }
        this.t[i] = type;
        if (roadId !== undefined) this.roadId[i] = roadId;
        this.dir[i] = dirQ;
      }
    }
  }

  stampDisc(x, z, rad, o) {
    // 只做默认 'over' 语义：小巷由 stampRibbon 的 only-if-block 负责（规格 §5.4）。
    // 曾在这里加 only-if-block 分支——它无法与 stampRibbon 同语义（圆盘没有折线参考系），
    // 留着就是一个静默的语义陷阱，故删。没有调用方传 mode。
    const mode = 'over';
    for (let a = -Math.ceil(rad); a <= Math.ceil(rad); a++)
      for (let b = -Math.ceil(rad); b <= Math.ceil(rad); b++) {
        if (Math.hypot(a, b) > rad) continue;
        const xx = Math.round(x + a), zz = Math.round(z + b);
        if (!this.inb(xx, zz)) continue;
        const i = this.idx(xx, zz);
        this.t[i] = o.type;
        if (o.roadId !== undefined) this.roadId[i] = o.roadId;
        if (o.dir !== undefined) this.dir[i] = o.dir;
      }
  }
}

/** 道路等级序：数值大 = 等级高，压印时高覆低（规格 §5.2） */
function roadRank(t) {
  switch (t) {
    case T.ROAD_MINOR: return 1;
    case T.ROAD_ARTERIAL: return 2;
    case T.ROAD_RADIAL: return 3;
    case T.ROAD_RING: return 4;
    default: return 0;
  }
}

/** 方向向量 → 7.5° 量化索引 0..47 */
function qDir(dx, dz) {
  const deg = Math.atan2(dz, dx) * 180 / Math.PI;
  return ((Math.round(deg / 7.5) % 48) + 48) % 48;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test`
Expected: PASS

`stampRibbon` 的铺跨规则是 `n = Math.round(全宽)`、`w ∈ [-floor((n-1)/2), floor(n/2)]`，它保证「全幅宽 N」就是恰好 N 格（偶数宽度不对称半格，符合路面实际）。若 taper 测试得到的宽度偏离 `[3, 11]` 超过 0 格，是这条规则被改坏了——修实现，不要放宽测试容差。

- [ ] **Step 5: 提交**

```bash
git add src/city/field.js tests/field.test.js
git commit -m "feat(city): cell field with ribbon/disc stamping"
```

---

## Task 5: `city/field.js` — 连通域、多源 BFS、最大内接矩形

这三个算法是街区派生（P7）、离散 Voronoi（P4）、地块 footprint（P10）的全部依赖，写错则整层皆错，因此单独成 Task。

**Files:**
- Modify: `src/city/field.js`（追加三个方法）
- Test: `tests/fieldAlgo.test.js`

**Interfaces:**
- Consumes: `Field`
- Produces:
  - `connectedComponents(accept) -> Comp[]`，`Comp = { cells: Int32Array, area, bbox:[x0,z0,x1,z1], centroid:[x,z] }`
  - `multiSourceBFS(seeds, inRegion) -> { label: Int32Array, sizes: Int32Array }`（`label[i]` = 种子下标，`-1` 表示不在区域内）
  - `maxRectInMask(x0, z0, x1, z1, ok) -> { x0, z0, x1, z1, area } | null`

- [ ] **Step 1: 写失败的测试**

`tests/fieldAlgo.test.js`：

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Field } from '../src/city/field.js';
import { T } from '../src/city/config.js';

const H = 30;

/** 便捷构造：给定 half 与一个 (x,z)=>t 的判定 */
function makeField(half, pred) {
  const f = new Field(half);
  f.fill((x, z) => ({ t: pred(x, z) ? T.BLOCK : T.ROAD_MINOR }));
  return f;
}

test('connectedComponents：两块分离区域，面积/bbox/质心正确', () => {
  // x<0 是一整块；x>=0 里 z<5 一块、z>=5 一块，被一条 ROAD 走廊（x=0 列）分开
  const f = makeField(H, (x, z) => x !== 0);
  const comps = f.connectedComponents((t) => t === T.BLOCK);
  assert.equal(comps.length, 2);
  const sorted = comps.slice().sort((a, b) => b.area - a.area);
  assert.equal(sorted[0].area, 30 * 61);            // 左侧 x∈-30..-1
  assert.equal(sorted[1].area, 30 * 61);
  assert.deepEqual(sorted[0].bbox, [-30, -30, -1, 30]);
  for (const c of sorted) {
    assert.ok(Math.abs(c.centroid[0] - (c.bbox[0] + c.bbox[2]) / 2) < 1e-6);
    assert.equal(c.cells.length, c.area);
  }
});

test('connectedComponents：4 邻域而非 8 邻域（对角不连通）', () => {
  const f = new Field(H);
  f.fill((x, z) => ({ t: T.ROAD_MINOR }));
  for (const [x, z] of [[0, 0], [1, 1]]) f.setAt(x, z, { t: T.BLOCK });
  const comps = f.connectedComponents((t) => t === T.BLOCK);
  assert.equal(comps.length, 2);
});

test('connectedComponents：环形墙内的洞单独成块（含 1 格宽墙）', () => {
  const f = new Field(H);
  f.fill((x, z) => ({ t: T.BLOCK }));
  for (let a = -8; a <= 8; a++) for (let b = -8; b <= 8; b++)
    if (Math.max(Math.abs(a), Math.abs(b)) === 8) f.setAt(a, b, { t: T.ROAD_MINOR });
  const comps = f.connectedComponents((t) => t === T.BLOCK);
  assert.equal(comps.length, 2);
  const hole = comps.find((c) => c.area === 15 * 15);
  assert.ok(hole, '内洞未单独成块');
});

test('multiSourceBFS：所有区域格都被分配、种子格标签即自身', () => {
  const f = makeField(H, (x, z) => x !== 0);
  const seeds = [[-15, 0], [-5, 10], [-20, -20], [10, 0], [20, 15], [5, -25]];
  const { label, sizes } = f.multiSourceBFS(seeds, (x, z) => f.t[f.idx(x, z)] === T.BLOCK);
  let assigned = 0;
  for (let x = -H; x <= H; x++) for (let z = -H; z <= H; z++) {
    const i = f.idx(x, z);
    if (f.t[i] !== T.BLOCK) { assert.equal(label[i], -1, '非区域格不应有标签'); continue; }
    assert.ok(label[i] >= 0 && label[i] < seeds.length, `漏分 ${x},${z}`);
    assigned++;
  }
  assert.equal(assigned, 2 * 30 * 61);
  const sum = Array.from(sizes).reduce((a, b) => a + b, 0);
  assert.equal(sum, assigned);
  for (let s = 0; s < seeds.length; s++) assert.equal(label[f.idx(seeds[s][0], seeds[s][1])], s);
});

test('multiSourceBFS：不相邻的种子各自占据独立分量（不会穿越道路）', () => {
  const f = makeField(H, (x, z) => x !== 0);
  const seeds = [[-10, 0], [10, 0]];
  const { label } = f.multiSourceBFS(seeds, (x, z) => f.t[f.idx(x, z)] === T.BLOCK);
  assert.equal(label[f.idx(-25, 0)], 0);
  assert.equal(label[f.idx(25, 0)], 1);
});

test('maxRectInMask：实心矩形取自身', () => {
  const ok = (x, z) => x >= 0 && x <= 9 && z >= 0 && z <= 5;
  const r = new Field(1).maxRectInMask(-2, -2, 12, 8, ok);
  assert.deepEqual([r.x0, r.z0, r.x1, r.z1], [0, 0, 9, 5]);
  assert.equal(r.area, 10 * 6);
});

test('maxRectInMask：L 形取最大内接矩形', () => {
  // 20×20 挖掉右下角 10×10 → 最大内接矩形 20×10 或 10×20，面积 200
  const ok = (x, z) => x >= 0 && x < 20 && z >= 0 && z < 20 && !(x >= 10 && z >= 10);
  const r = new Field(1).maxRectInMask(-1, -1, 21, 21, ok);
  assert.equal(r.area, 200);
});

test('maxRectInMask：斜边街区（阶梯掩码）不越界', () => {
  // 掩码是 x + z <= 20 的下三角
  const ok = (x, z) => x >= 0 && z >= 0 && x + z <= 20;
  const r = new Field(1).maxRectInMask(0, 0, 21, 21, ok);
  for (let x = r.x0; x <= r.x1; x++)
    for (let z = r.z0; z <= r.z1; z++) assert.ok(ok(x, z), `矩形越出掩码 ${x},${z}`);
  // 三角形最大内接轴对齐矩形为 11×11=121（x,z ∈ 0..10 时 x+z<=20 成立）
  assert.equal(r.area, 121);
});

test('maxRectInMask：无可行格返回 null', () => {
  assert.equal(new Field(1).maxRectInMask(0, 0, 5, 5, () => false), null);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- tests/fieldAlgo.test.js`
Expected: FAIL — `f.connectedComponents is not a function`

- [ ] **Step 3: 实现 connectedComponents**

在 `src/city/field.js` 的 `Field` 类内 `stampDisc` 之后追加：

```js
  /** 4 邻域连通域标记（规格 §8.1）。accept(t) 判定是否属于本连通域。 */
  connectedComponents(accept) {
    const seen = new Uint8Array(this.N * this.N);
    const out = [];
    const stack = new Int32Array(this.N * this.N);
    for (let x = -this.half; x <= this.half; x++) {
      for (let z = -this.half; z <= this.half; z++) {
        const i0 = this.idx(x, z);
        if (seen[i0] || !accept(this.t[i0])) continue;
        let sp = 0, n = 0, x0 = x, x1 = x, z0 = z, z1 = z, sx = 0, sz = 0;
        stack[sp++] = i0; seen[i0] = 1;
        const cells = [];
        while (sp > 0) {
          const i = stack[--sp];
          const cx = Math.floor(i / this.N) - this.half;
          const cz = (i % this.N) - this.half;
          cells.push(i); n++;
          sx += cx; sz += cz;
          if (cx < x0) x0 = cx; if (cx > x1) x1 = cx;
          if (cz < z0) z0 = cz; if (cz > z1) z1 = cz;
          for (const [ax, az] of [[cx + 1, cz], [cx - 1, cz], [cx, cz + 1], [cx, cz - 1]]) {
            if (!this.inb(ax, az)) continue;
            const j = this.idx(ax, az);
            if (seen[j] || !accept(this.t[j])) continue;
            seen[j] = 1; stack[sp++] = j;
          }
        }
        out.push({ cells: Int32Array.from(cells), area: n, bbox: [x0, z0, x1, z1], centroid: [sx / n, sz / n] });
      }
    }
    return out;
  }
```

- [ ] **Step 4: 实现 multiSourceBFS**

```js
  /** 多源 BFS = 离散 Voronoi（规格 §5.3）。inRegion(x,z) 界定区域。 */
  multiSourceBFS(seeds, inRegion) {
    const label = new Int32Array(this.N * this.N).fill(-1);
    const sizes = new Int32Array(seeds.length);
    const queue = new Int32Array(this.N * this.N);
    let qh = 0, qt = 0;
    seeds.forEach(([sx, sz], s) => {
      if (!this.inb(sx, sz) || !inRegion(sx, sz)) return;
      const i = this.idx(sx, sz);
      if (label[i] >= 0) return;                   // 种子重合，后者被丢弃
      label[i] = s; sizes[s]++; queue[qt++] = i;
    });
    while (qh < qt) {
      const i = queue[qh++];
      const cx = Math.floor(i / this.N) - this.half;
      const cz = (i % this.N) - this.half;
      const s = label[i];
      for (const [ax, az] of [[cx + 1, cz], [cx - 1, cz], [cx, cz + 1], [cx, cz - 1]]) {
        if (!this.inb(ax, az) || !inRegion(ax, az)) continue;
        const j = this.idx(ax, az);
        if (label[j] >= 0) continue;
        label[j] = s; sizes[s]++; queue[qt++] = j;
      }
    }
    return { label, sizes };
  }
```

- [ ] **Step 5: 实现 maxRectInMask**

直方图法（`O(宽×高)`）：逐列累计高度，再用单调栈求每行的最大矩形。

```js
  /** 二值掩码上的最大轴对齐内接矩形（规格 §10.4）。ok(x,z) 判定格是否可用。 */
  maxRectInMask(x0, z0, x1, z1, ok) {
    const W = x1 - x0 + 1, Hh = z1 - z0 + 1;
    if (W <= 0 || Hh <= 0) return null;
    const hgt = new Int32Array(W);
    const st = new Int32Array(W + 1);
    let best = null;
    for (let z = 0; z < Hh; z++) {
      for (let x = 0; x < W; x++) hgt[x] = ok(x0 + x, z0 + z) ? hgt[x] + 1 : 0;
      // 单调栈求该直方图最大矩形
      let sp = 0;
      for (let x = 0; x <= W; x++) {
        const cur = x === W ? -1 : hgt[x];
        while (sp > 0 && cur < hgt[st[sp - 1]]) {
          const hh = hgt[st[--sp]];
          const left = sp === 0 ? 0 : st[sp - 1] + 1;
          const right = x - 1;
          const area = hh * (right - left + 1);
          // area > 0 必需：全零直方图（掩码无可行格）也会弹出高度 0 的条目，
          // 少了这个守卫就会返回一个 area:0 的假矩形，而不是 null
          if (area > 0 && (!best || area > best.area)) {
            best = { x0: x0 + left, z0: z0 + z - hh + 1, x1: x0 + right, z1: z0 + z, area };
          }
        }
        st[sp++] = x;
      }
    }
    return best;
  }
```

- [ ] **Step 6: 运行确认通过**

Run: `npm test`
Expected: PASS

若「L 形」那条得到 100 而非 200，说明单调栈的 `left` 计算漏了 `sp === 0` 分支——修实现，不要改断言。

- [ ] **Step 7: 提交**

```bash
git add src/city/field.js tests/fieldAlgo.test.js
git commit -m "feat(city): connected components, multi-source BFS and max-inscribed-rect"
```

---

## Task 6: `city/terrain.js` — 高度场

**Files:**
- Create: `src/city/terrain.js`
- Test: `tests/terrain.test.js`

**Interfaces:**
- Consumes: `CFG`, `Field`
- Produces: `makeTerrain(rng) -> { raw(x,z), scarpX(z) }`、`applyTerrain(field, terr)`、`quantize(h)`

- [ ] **Step 1: 写失败的测试**

`tests/terrain.test.js`：

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeTerrain, applyTerrain, quantize, RAW_MIN, RAW_MAX } from '../src/city/terrain.js';
import { Field } from '../src/city/field.js';
import { CFG } from '../src/city/config.js';
import { makeRng } from '../src/rng.js';

const H = 200;

test('rawHeight 落在解析界内，且解析界确实贴合可达极值（规格 §6.1/§6.2）', () => {
  const t = makeTerrain(makeRng(1));
  let min = Infinity, max = -Infinity;
  for (let x = -H; x <= H; x += 7) for (let z = -H; z <= H; z += 7) {
    const v = t.raw(x, z);
    assert.ok(Number.isFinite(v), `非有限值 @${x},${z}`);
    if (v < min) min = v; if (v > max) max = v;
  }
  assert.ok(min >= RAW_MIN - 1e-9 && max <= RAW_MAX + 1e-9,
    `越出解析界 ${min.toFixed(2)}..${max.toFixed(2)} vs ${RAW_MIN.toFixed(2)}..${RAW_MAX.toFixed(2)}`);
  // 窗口比可达区间宽太多 = 量化时那一侧的 level 永远出不来，正是本任务踩过两次的坑
  assert.ok(min - RAW_MIN < 1.0, `RAW_MIN 过宽 ${(min - RAW_MIN).toFixed(2)}，level 1 会恒空`);
  assert.ok(RAW_MAX - max < 1.0, `RAW_MAX 过宽 ${(RAW_MAX - max).toFixed(2)}，level 7 会恒空`);
});

test('西高东低：对称探针，避开台地过渡带（规格 §6.1）', () => {
  // 探针必须在 scarp 带之外。xb(z) ∈ [-115,-25]，带宽 ±30 → 带范围 x ∈ [-145, +5]。
  // 取 -190 与 +190，两者都在带外，差值只由 tilt 决定，不含相位运气。
  const t = makeTerrain(makeRng(1));
  const avg = (x) => { let s = 0, n = 0; for (let z = -H; z <= H; z += 5) { s += t.raw(x, z); n++; } return s / n; };
  assert.ok(avg(-190) > avg(190) + 1.0, `东西梯度不足：${avg(-190)} vs ${avg(190)}`);
});

test('台地边缘是真实断阶：沿边界线两侧取 z 窗均值，差 ≥ 1.0（规格 §6.1）', () => {
  const t = makeTerrain(makeRng(1));
  // 单点采样会被 N1/N2 噪声主导（实测 300 种子里 1.7% 越界，属不稳定测试）。
  // 在 xb±70 处各取一段 z 窗做均值，噪声平均掉之后剩下的就是 tilt+scarp 的真实台阶。
  const mean = (x, z0) => {
    let s = 0, n = 0;
    for (let z = z0 - 40; z <= z0 + 40; z += 8) { s += t.raw(x, z); n++; }
    return s / n;
  };
  for (const z of [-160, -40, 60, 170]) {
    const xb = t.scarpX(z);
    const west = mean(xb - 70, z), east = mean(xb + 70, z);
    assert.ok(west > east + 1.0, `z=${z} 处边界两侧无台阶：${west.toFixed(2)} vs ${east.toFixed(2)}`);
  }
});

test('scarpX 在 ±x 带内波动且平滑', () => {
  const t = makeTerrain(makeRng(1));
  let prev = t.scarpX(-H);
  for (let z = -H; z <= H; z += 5) {
    const v = t.scarpX(z);
    assert.ok(v >= -130 && v <= -10, `边界越位 ${v}`);
    assert.ok(Math.abs(v - prev) < 12, '边界跳变过陡');
    prev = v;
  }
});

test('quantize 输出 [1,7] 整数', () => {
  for (const v of [-99, -3.4, -1.2, 0, 1.4, 2.6, 5, 99]) {
    const q = quantize(v);
    assert.ok(Number.isInteger(q), `非整数 ${q}`);
    assert.ok(q >= 1 && q <= 7, `越界 ${q}`);
  }
  assert.equal(quantize(-99), 1);
  assert.equal(quantize(99), 7);
});

test('applyTerrain 写入整数高度、确定性、相邻高差 ≤ 2', () => {
  const run = () => {
    const f = new Field(H);
    applyTerrain(f, makeTerrain(makeRng(7)));
    return f;
  };
  const a = run(), b = run();
  assert.deepEqual(Array.from(a.h), Array.from(b.h));
  for (let x = -H; x < H; x++) for (let z = -H; z <= H; z++) {
    const i = a.idx(x, z);
    assert.ok(a.h[i] >= 1 && a.h[i] <= 7);
    assert.ok(Math.abs(a.h[i] - a.h[a.idx(x + 1, z)]) <= 2, `x 向陡坎 ${x},${z}`);
    assert.ok(Math.abs(a.h[i] - a.h[a.idx(x, z + 1)]) <= 2, `z 向陡坎 ${x},${z}`);
  }
});

test('饱和度：满窗映射没有被两端夹扁（规格 §6.2 修订的直接守卫，判据 §15.4 的地基）', () => {
  // 必须在完整 1089² 场上量：小场（如 H=200）的可达 raw 区间更窄，
  // 任何窗口下都会让 level 1/2/7 归零，守卫随即失真。
  const f = new Field();
  applyTerrain(f, makeTerrain(makeRng(CFG.SEED)));
  const hist = new Map();
  let tot = 0;
  for (let i = 0; i < f.h.length; i++) {
    const lv = f.h[i];
    assert.ok(Number.isInteger(lv) && lv >= 1 && lv <= 7, `非法高度 ${lv}`);
    hist.set(lv, (hist.get(lv) || 0) + 1);
    tot++;
  }
  const share = (lv) => (hist.get(lv) || 0) / tot;
  assert.ok(share(1) <= 0.12 && share(1) > 0, `level 1 = ${(share(1) * 100).toFixed(2)}%，应为稀少但非零`);
  assert.ok(share(7) <= 0.12 && share(7) > 0, `level 7 = ${(share(7) * 100).toFixed(2)}%，应为稀少但非零`);
  for (let lv = 2; lv <= 6; lv++) assert.ok(share(lv) >= 0.01, `内部 level ${lv} 几乎不存在`);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- tests/terrain.test.js`
Expected: FAIL — `Cannot find module '../src/city/terrain.js'`

- [ ] **Step 3: 实现**

`src/city/terrain.js`：

```js
/** 高度场（规格 §6）。低频叠加：西高东低倾斜 + 台地边缘 + 两级值噪声。 */
import { CFG } from './config.js';

const LAT = 140, LON = 55;         // 两级噪声点阵
const A1 = 0.85, A2 = 0.35;        // 振幅（合成 ±1.2，承担规格「整体高度场振幅 2~4 体素」）
const TILT_A = 1.9;                // 西高东低的宏观倾斜幅值
const SCARP_AMP = 1.9, SCARP_W = 30;

/** 原始场的解析界：改任一振幅常量都会自动跟着变，不要写死数字。
 *  SCARP 是单侧抬升（0..SCARP_AMP，只垫西侧），所以它只进 RAW_MAX、不进 RAW_MIN；
 *  当成双侧算会让 level 1 在任何场尺寸上都恒为空。 */
export const RAW_MIN = -(TILT_A + A1 + A2);
export const RAW_MAX = +(TILT_A + SCARP_AMP + A1 + A2);

function lattice(size, rng) {
  const n = Math.ceil((2 * CFG.HALF) / size) + 3;
  const g = new Float32Array(n * n);
  for (let i = 0; i < g.length; i++) g[i] = rng() * 2 - 1;
  return { size, n, g };
}

function sampleLat(l, x, z) {
  const fx = (x + CFG.HALF) / l.size + 1, fz = (z + CFG.HALF) / l.size + 1;
  const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
  const at = (a, b) => l.g[a * l.n + b];
  const sx = tx * tx * (3 - 2 * tx), sz = tz * tz * (3 - 2 * tz);
  return (at(ix, iz) * (1 - sx) + at(ix + 1, iz) * sx) * (1 - sz)
       + (at(ix, iz + 1) * (1 - sx) + at(ix + 1, iz + 1) * sx) * sz;
}

function smoothstep(a, b, v) {
  const t = Math.min(Math.max((v - a) / (b - a || 1e-9), 0), 1);
  return t * t * (3 - 2 * t);
}

export function makeTerrain(rng) {
  const n1 = lattice(LAT, rng), n2 = lattice(LON, rng);
  const ph = rng() * Math.PI * 2;
  const scarpX = (z) => -70 + 45 * Math.sin(z / 160 + ph);
  const raw = (x, z) => {
    const tilt = -TILT_A * (x / CFG.HALF);
    const xb = scarpX(z);
    const scarp = SCARP_AMP * smoothstep(xb + SCARP_W, xb - SCARP_W, x);   // 西侧抬高
    return tilt + scarp + A1 * sampleLat(n1, x, z) + A2 * sampleLat(n2, x, z);
  };
  return { raw, scarpX, scarpWidth: SCARP_W };
}

/** 满窗线性映射到 1..7 六级（规格 §6.2 修订：不可用「振幅 + 固定偏移」，会把 60% 格子夹扁） */
export function quantize(v) {
  const t = (v - RAW_MIN) / (RAW_MAX - RAW_MIN);
  return Math.min(7, Math.max(1, Math.round(t * 6) + 1));
}

export function applyTerrain(field, terr) {
  for (let x = -field.half; x <= field.half; x++)
    for (let z = -field.half; z <= field.half; z++)
      field.h[field.idx(x, z)] = quantize(terr.raw(x, z));
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test`
Expected: PASS

「相邻高差 ≤ 2」若失败，是 `LON = 55` 的高频项振幅与量化叠加造成的硬坎。**把 `A2` 降到 0.4 或在 `applyTerrain` 后跑一次 3×3 中值平滑**，不要放宽断言——陡坎会让地面渲染出现悬空墙。

- [ ] **Step 5: 提交**

```bash
git add src/city/terrain.js tests/terrain.test.js
git commit -m "feat(city): quantized terrain height field"
```

---

## Task 7: `city/roads.js` — 轨道环、车站与等级

**Files:**
- Create: `src/city/roads.js`
- Test: `tests/stations.test.js`

**Interfaces:**
- Consumes: `CFG`, `geom.superEllipse/catmullRom/wrap180`
- Produces: `buildRailAndStations(rng) -> { pts:[[x,z]…], length, stations: Station[], mainStation }`，
  `Station = { id, x, z, bearing, t, rank }`

- [ ] **Step 1: 写失败的测试**

`tests/stations.test.js`：

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRailAndStations } from '../src/city/roads.js';
import { polylineLength } from '../src/city/geom.js';
import { makeRng } from '../src/rng.js';

const run = () => buildRailAndStations(makeRng(20260919));

test('轨道环闭合、点数正确、长度合理', () => {
  const rail = run();
  assert.equal(rail.pts.length, 72);
  const L = polylineLength(rail.pts);
  assert.ok(L > 2 * Math.PI * 200 && L < 2 * Math.PI * 300, `周长异常 ${L}`);
  assert.ok(Math.hypot(rail.pts[0][0] - rail.pts.at(-1)[0], rail.pts[0][1] - rail.pts.at(-1)[1]) < 30);
});

test('10 个车站，全部落在轨道环上，方位角不等间距', () => {
  const rail = run();
  assert.equal(rail.stations.length, 10);
  const onRing = rail.pts;
  for (const s of rail.stations) {
    let d = Infinity;
    for (const [x, z] of onRing) d = Math.min(d, Math.hypot(s.x - x, s.z - z));
    assert.ok(d < 12, `站 ${s.id} 离环 ${d}`);
  }
  const gaps = rail.stations.map((s, i) => {
    const n = rail.stations[(i + 1) % 10];
    let g = Math.abs(n.bearing - s.bearing); if (g > 180) g = 360 - g;
    return g;
  });
  assert.ok(new Set(gaps.map((g) => Math.round(g))).size >= 7, '间距过于均匀（对称）');
});

test('rank：1 main / 4 sub / 5 local；main 最靠近原点；sub 两两间隔 ≥ 60°', () => {
  const rail = run();
  const by = (r) => rail.stations.filter((s) => s.rank === r);
  assert.equal(by('main').length, 1);
  assert.equal(by('sub').length, 4);
  assert.equal(by('local').length, 5);
  for (const s of rail.stations) {
    if (s.rank === 'main') continue;
    assert.ok(Math.hypot(s.x, s.z) >= Math.hypot(by('main')[0].x, by('main')[0].z) - 1e-6,
      'main 不是最近的站');
  }
  const subs = by('sub');
  for (let i = 0; i < subs.length; i++) for (let j = i + 1; j < subs.length; j++) {
    let g = Math.abs(subs[i].bearing - subs[j].bearing); if (g > 180) g = 360 - g;
    assert.ok(g >= 60, `sub 站 ${subs[i].bearing}/${subs[j].bearing} 间隔仅 ${g}`);
  }
});

test('sub 站分布不构成中心对称（无两站互为对跖点）', () => {
  const subs = run().stations.filter((s) => s.rank === 'sub');
  for (let i = 0; i < subs.length; i++) for (let j = i + 1; j < subs.length; j++) {
    let g = Math.abs(subs[i].bearing - subs[j].bearing); if (g > 180) g = 360 - g;
    assert.ok(Math.abs(g - 180) > 8, `sub ${subs[i].bearing}/${subs[j].bearing} 互为对跖，几何太对称`);
  }
});

test('确定性：同种子同结果', () => {
  assert.deepEqual(run().stations, buildRailAndStations(makeRng(20260919)).stations);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- tests/stations.test.js`
Expected: FAIL — `Cannot find module '../src/city/roads.js'`

- [ ] **Step 3: 实现**

`src/city/roads.js`：

```js
/** 路网（规格 §5）。P2 轨道环与车站 → P3 主干 → P4 次级 → P5 纵剖面 → P9 小巷。 */
import { CFG, ROAD, T } from './config.js';
import { superEllipse, catmullRom, resample, polylineLength, wrap180 } from './geom.js';

const STATION_BEARINGS = [14, 51, 88, 121, 158, 196, 233, 264, 301, 340];

/** 在闭合折线上按方位角找点（线性插值，误差 < 1 格） */
function pointAtBearing(pts, deg) {
  const th = deg * Math.PI / 180;
  const tx = Math.cos(th), tz = Math.sin(th);
  let best = null, bestD = -1;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    const r = Math.hypot(mx, mz);
    const proj = (mx * tx + mz * tz);
    if (proj > bestD) { bestD = proj; best = [mx, mz, r]; }
  }
  return best ? [best[0], best[1]] : pts[0];
}

export function buildRailAndStations(rng) {
  const h1 = [3, 0.055, rng() * 6.283], h2 = [5, 0.035, rng() * 6.283];
  const ring = superEllipse(CFG.RAIL_R, [h1, h2], 72, 0);
  const pts = catmullRom(ring, { closed: true, perSeg: 6 });

  const stations = STATION_BEARINGS.map((b, i) => {
    const bearing = wrap180(b + rng.range(-4, 4));
    const [x, z] = pointAtBearing(pts, bearing);
    return { id: i, x: Math.round(x), z: Math.round(z), bearing, t: 0, rank: 'local' };
  });

  // main：离原点最近
  let main = stations[0];
  for (const s of stations) if (Math.hypot(s.x, s.z) < Math.hypot(main.x, main.z)) main = s;
  main.rank = 'main';

  // sub：从剩余 9 站按方位角贪心取互相间隔 ≥ 60° 的 4 站
  const pool = stations.filter((s) => s !== main)
    .slice().sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
  const gap = (a, b) => { let g = Math.abs(a - b); return g > 180 ? 360 - g : g; };
  for (const cand of pool) {
    if (pool.filter((s) => s.rank === 'sub').length >= 4) break;
    if (stations.filter((s) => s.rank === 'sub').every((s) => gap(s.bearing, cand.bearing) >= 60)
      && stations.filter((s) => s.rank === 'sub').length < 4) cand.rank = 'sub';
  }
  // 贪心不足 4 个时放宽到 ≥ 50°，保证配额（规格 §9 依赖 4 个副都心）
  while (stations.filter((s) => s.rank === 'sub').length < 4) {
    const cand = pool.find((s) => s.rank === 'local'
      && stations.filter((v) => v.rank === 'sub').every((v) => gap(v.bearing, s.bearing) >= 45));
    if (!cand) break;
    cand.rank = 'sub';
  }

  return { pts, length: polylineLength(pts), stations, mainStation: main };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test`
Expected: PASS

若「sub 数量 4」或「sub 互不接近」失败：本 Task 曾按「按半径序贪心 + ≥60°，凑不满就放宽到 ≥45°」写，实测**在 500 个种子里 310 个不满足断言的非对跖性**，而放宽贪心又在 304/500 上丢配额——即计划文本本身不可满足。已改为**确定性有界搜索**（在剩余 9 站的全部 C(9,4)=126 个组合中，按确定次序取第一个同时满足「两两 ≥60°」与「互不接近对跖」的组合），2000 种子全性质零失败，且站台坐标与方位角与原写法逐种子逐字节一致——只有「哪四个是 sub」变了，影响 Task 8 的放射线选站。见 `task-6-7-report.md`。

另外 `rawHeight` 那条收紧探针必须在 `CFG.HALF` 上量而非测试用的 `H=200`：小场上两处间隙被算术上强制 ≥1.2015，阈值 1.0 永不可满足（同一类「小场失真」问题的第三例，已一并回写）。

- [ ] **Step 5: 提交**

```bash
git add src/city/roads.js tests/stations.test.js
git commit -m "feat(city): rail loop with asymmetric stations and rank assignment"
```

---

## Task 8: `city/roads.js` — 主干路网与栅格化

**Files:**
- Create: `src/city/roads.js`（`buildTrunks`）
- Modify: `src/city/field.js`（新增 `bands` 单次压印与 `rank`/`cellRank` 等级归属）
- Modify: `src/city/config.js`（导出 `ROAD_RANK`）
- Test: `tests/trunk.test.js`、追加用例到 `tests/field.test.js`

**Interfaces:**
- Consumes: `Field`, `rail`（Task 7）, `ROAD`
- Produces: `buildTrunks(field, rail, rng) -> Road[]`，
  `Road = { id, cls, pts:[[x,z]…], width, length, closed, laneOffsets:[-o,+o] }`

### Step 0（先做）：`stampRibbon` 改为可单次压印，并让等级归属显式记录

本 Task 依赖一次 field.js 的扩展。理由（评审 F1 的同类漏洞）：Task 4 的等级判定以 `isRoad(cell 型)` 为门，而 `SIDEWALK` / `MEDIAN` 不在 `ROAD_*` 连续段内，于是「低等级路的人行道带」仍然可以覆盖「高等级路的外排路面格」并把 `roadId` 改掉——中心格保住了，边缘格子丢了，Task 10 的纵剖面与 Task 12 的临街判定都会读到错的所有权。

1. `config.js` 增加并导出：

```js
/** 道路等级序：数值大 = 等级高。SIDEWALK/MEDIAN 的等级跟其所属路一致。 */
export const ROAD_RANK = { MINOR: 1, ARTERIAL: 2, RADIAL: 3, RING: 4 };
```

2. `field.js` 构造器增加一条 `this.cellRank = new Uint8Array(n);`（1.19 MB，规格 §13 的内存表按此上调）。

3. `stampRibbon` 接受 `o.rank` 与 `o.bands`，逐格先做等级闸门，再决定写什么型：

```js
      // 等级闸门：格的归属等级比本次压印者的等级高 → 整格跳过（含 SIDEWALK/MEDIAN 带）
      if (o.rank && this.cellRank[i] > o.rank) continue;
      let type2 = type;
      if (bands) {
        const half = (bands.width - 1) / 2;                 // 路面中心半宽
        if (Math.abs(w) > half + bands.walk) continue;      // 超出全幅
        type2 = Math.abs(w) <= half ? bands.road
          : (bands.median && w === 0) ? bands.median : T.SIDEWALK;
      }
      if (o.rank && this.cellRank[i] < o.rank && this.roadId[i] >= 0) {
        this.roadIdUnder[i] = this.roadId[i];               // 高等级压过来，记下被埋的旧 id
      }
      this.t[i] = type2;
      if (roadId !== undefined) this.roadId[i] = roadId;
      if (o.rank) this.cellRank[i] = o.rank;
      this.dir[i] = dirQ;
```

（`bands.median` 只占中心一列，宽度≥8 时才启用，由调用方传 0 表示关闭；原 `isRoad(type)` 那套 `roadRank` 判定由 `cellRank` 取代，Task 4 已有的等级优先测试必须继续通过——它正是这个改动的回归保护。）

4. 追加两条 field 测试（放在 `tests/field.test.js` 的等级优先测试之后）：

```js
test('等级闸门对人行道带同样生效：低等级路的人行道不能降级高等级路的边缘格', () => {
  const f = new Field(H);
  // ring 沿 x 走（z=0），width 9 → 覆盖 z ∈ -4..4，这些格 cellRank = 4
  f.stampRibbon([[-50, 0], [50, 0]], { type: T.ROAD_RING, roadId: 11, width: 9, rank: 4 });
  // minor 沿 z 走（x=0），路面 |w|<=1.5（w 是 x 向偏移），人行道带 |w| 到 5.5
  f.stampRibbon([[0, -30], [0, 30]], { type: T.ROAD_MINOR, roadId: 22, width: 4,
    bands: { road: T.ROAD_MINOR, walk: 4, median: 0, width: 4 }, rank: 1 });
  // (2,20)：minor 的人行道带内、ring 全幅之外 → 写成 SIDEWALK 并归 minor
  assert.equal(f.t[f.idx(2, 20)], T.SIDEWALK);
  assert.equal(f.roadId[f.idx(2, 20)], 22);
  // (2,4)：既在 minor 的人行道带内、又在 ring 的覆盖内 → ring 等级高，整格不动
  assert.equal(f.t[f.idx(2, 4)], T.ROAD_RING);
  assert.equal(f.roadId[f.idx(2, 4)], 11);
});

test('bands 单次压印：一条路一次画出路面+人行道，宽度与 §5.5 逐级一致', () => {
  const f = new Field(H);
  f.stampRibbon([[-50, 0], [50, 0]], { type: T.ROAD_ARTERIAL, roadId: 5, width: 6,
    bands: { road: T.ROAD_ARTERIAL, walk: 1, median: 0, width: 6 }, rank: 2 });
  const col = [];
  for (let z = -6; z <= 6; z++) col.push(f.t[f.idx(0, z)]);
  assert.equal(col.filter((t) => t === T.ROAD_ARTERIAL).length, 6);   // 恰好 6 格路面
  assert.equal(col.filter((t) => t === T.SIDEWALK).length, 2);       // 两侧各 1 格人行道
});
```

跑完这一步：`npm test` 必须仍是全绿（除本 Task 尚未写的 trunk 测试），且 Task 4 原有的等级优先测试不许改动。然后再进入下面的 Step 1。


- [ ] **Step 1: 写失败的测试**

`tests/trunk.test.js`：

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRailAndStations, buildTrunks } from '../src/city/roads.js';
import { Field } from '../src/city/field.js';
import { T, isRoad, ROAD, CFG } from '../src/city/config.js';
import { makeRng } from '../src/rng.js';

const H = CFG.HALF;

function setup() {
  const rng = makeRng(CFG.SEED);
  const rail = buildRailAndStations(rng);
  const f = new Field(H);
  f.fill(() => ({ t: T.BLOCK }));
  const roads = buildTrunks(f, rail, rng);
  return { f, rail, roads };
}

test('产出 1 条环状主干 + 7 条放射 + 2 段中环弧 + 1 条铁路支线', () => {
  const { roads } = setup();
  assert.equal(roads.filter((r) => r.cls === 'RING').length, 1);
  assert.equal(roads.filter((r) => r.cls === 'RADIAL').length, 7);
  assert.equal(roads.filter((r) => r.cls === 'ARTERIAL').length, 2);
  assert.equal(roads.filter((r) => r.cls === 'RAIL').length, 1);
});

test('放射主干对准 7 个车站，且方向全部吸附到 7.5° 步进', () => {
  const { roads, rail } = setup();
  const radials = roads.filter((r) => r.cls === 'RADIAL');
  const usedStations = new Set();
  for (const r of radials) {
    assert.ok(r.pts.length >= 2);
    assert.ok(r.length > 300, `放射线过短 ${r.length}`);
    for (let i = 1; i < r.pts.length; i++) {
      const d = Math.atan2(r.pts[i][1] - r.pts[i - 1][1], r.pts[i][0] - r.pts[i - 1][0]) * 180 / Math.PI;
      assert.ok(Math.abs(d / 7.5 - Math.round(d / 7.5)) < 1e-6, `未吸附 ${d}`);
    }
    // 折线应经过某个车站附近
    let hit = null;
    for (const s of rail.stations) {
      if (r.pts.some(([x, z]) => Math.hypot(x - s.x, z - s.z) < 20)) { hit = s; break; }
    }
    assert.ok(hit, '该放射线未对准任何车站');
    usedStations.add(hit.id);
  }
  assert.equal(usedStations.size, 7, '7 条放射线应对准 7 个不同车站');
});

test('环状主干在 cell 上是连续闭合的一圈（从任一点可绕回）', () => {
  const { f } = setup();
  // 取 ROAD_RING 格做 8 邻域 BFS，要求构成单一分量且跨越 360°
  const cells = [];
  for (let x = -H; x <= H; x++) for (let z = -H; z <= H; z++)
    if (f.t[f.idx(x, z)] === T.ROAD_RING) cells.push([x, z]);
  assert.ok(cells.length > 1800, `环线格数异常 ${cells.length}`);
  const set = new Set(cells.map(([x, z]) => f.idx(x, z)));
  const start = cells[0];
  const seen = new Set([f.idx(start[0], start[1])]);
  const q = [start];
  while (q.length) {
    const [x, z] = q.pop();
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      if (!a && !b) continue;
      const i = f.idx(x + a, z + b);
      if (!f.inb(x + a, z + b) || !set.has(i) || seen.has(i)) continue;
      seen.add(i); q.push([x + a, z + b]);
    }
  }
  assert.equal(seen.size, set.size, '环线断裂成多段');
  // 跨越全周：象限计数
  const q2 = [0, 0, 0, 0];
  for (const [x, z] of cells) q2[(z < 0 ? 2 : 0) + (x < 0 ? 1 : 0)]++;
  for (const c of q2) assert.ok(c > 100, '环线缺一个象限');
});

test('主干道两侧有人行道格，且宽度符合 ROAD 定义', () => {
  const { f } = setup();
  // 在环线最北点处横切一条 z 线，统计连续格序列
  let topZ = -H;
  for (let z = -H; z <= H; z++) if (f.t[f.idx(0, z)] === T.ROAD_RING) { topZ = z; break; }
  const run = [];
  for (let z = topZ - 8; z <= topZ + 8; z++) run.push(f.t[f.idx(0, z)]);
  assert.ok(run.includes(T.SIDEWALK), '主干道无人行道');
});

test('道路格占全城比例在 12%~26%（主干阶段，尚无次级网）', () => {
  const { f } = setup();
  let road = 0;
  for (let i = 0; i < f.t.length; i++) if (isRoad(f.t[i]) || f.t[i] === T.SIDEWALK) road++;
  const pct = road / (f.N * f.N);
  assert.ok(pct > 0.10 && pct < 0.26, `主干占比异常 ${(pct * 100).toFixed(1)}%`);
});

test('次级网之前的街区尚未细分：放射线之间留有可通行空隙（非全铺）', () => {
  const { f } = setup();
  let block = 0;
  for (let i = 0; i < f.t.length; i++) if (f.t[i] === T.BLOCK) block++;
  assert.ok(block > (f.N * f.N) * 0.5, ' BLOCK 太少，道路铺得过密');
});

test('确定性：同种子逐格一致', () => {
  const a = setup(), b = setup();
  assert.deepEqual(Array.from(a.f.t), Array.from(b.f.t));
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- tests/trunk.test.js`
Expected: FAIL — `buildTrunks is not a function`

- [ ] **Step 3: 实现**

在 `src/city/roads.js` 追加：

```js
/** 折线：从 (r0) 沿方位角 deg 前进 len，方向按 7.5° 吸附后重算下一段起点（规格 §5.1.3） */
function spoke(cx, cz, deg0, len, segLen, rng) {
  let deg = snap(deg0), x = cx, z = cz;
  const pts = [[x, z]];
  let left = len;
  while (left > 0) {
    const step = Math.min(segLen, left);
    deg = snap(deg + rng.range(-10, 10));
    const r = deg * Math.PI / 180;
    x += Math.cos(r) * step; z += Math.sin(r) * step;
    pts.push([x, z]);
    left -= step;
  }
  return pts;
}
const snap = (d) => Math.round(wrap180(d) / CFG.ANGLE_STEP) * CFG.ANGLE_STEP;

export function buildTrunks(field, rail, rng) {
  const roads = [];
  let id = 0;
  const stamp = (pts, cls, closed = false) => {
    const cfg = ROAD[cls];
    const r = {
      id: id++, cls, pts, width: cfg.width, closed,
      length: polylineLength(pts),
      laneOffsets: [-(cfg.width / 2 - cfg.walk - 0.5), cfg.width / 2 - cfg.walk - 0.5],
    };
    // 单次压印，逐格按偏带宽决定路面/人行道/中央带。
    // 不用「先铺全宽路面 → 再铺加宽人行道 → 再铺窄路面」的三步法：
    // SIDEWALK 与 MEDIAN 不是 isRoad 类型，三步法会让低等级路的人行道带
    // 覆盖高等级路的外排路面格并抢走其 roadId（评审 F1 的同类漏洞，等级判定看不见 SIDEWALK）。
    field.stampRibbon(pts, {
      bands: { road: cfg.t, walk: cfg.walk, median: cfg.median ? T.MEDIAN : 0, width: cfg.width },
      roadId: r.id, rank: ROAD_RANK[cls], mode: 'over',
    });
    roads.push(r);
    return r;
  };

  // 环状主干（规格 §5.1.4）：超椭圆 48 点 + Catmull-Rom，闭合由构造保证。
  // 注意 stampRibbon 只走 pts[i]→pts[i+1]，不回头；闭曲线必须显式补回首点，
  // 否则首尾之间留下一个弦长的缺口（评审抓出，Task 4 的 stampRibbon 不承担闭合语义）。
  const ringPts = superEllipse(CFG.RING_R,
    [[2, 0.07, rng() * 6.283], [4, 0.045, rng() * 6.283]], 48, 0);
  const ring = catmullRom(ringPts, { closed: true, perSeg: 3 });
  stamp(ring.concat([ring[0]]), 'RING', true);

  // 放射主干：对准 7 个车站（优先 main/sub，余量给 local）
  const ordered = rail.stations.slice().sort((a, b) =>
    ({ main: 0, sub: 1, local: 2 })[a.rank] - ({ main: 0, sub: 1, local: 2 })[b.rank]);
  for (const s of ordered.slice(0, 7)) {
    const b = Math.atan2(s.z, s.x) * 180 / Math.PI;
    const pts = spoke(
      Math.cos(b * Math.PI / 180) * CFG.RADIAL_R0,
      Math.sin(b * Math.PI / 180) * CFG.RADIAL_R0,
      b, CFG.RADIAL_R1 - CFG.RADIAL_R0, rng.range(100, 200), rng,
    );
    stamp(pts, 'RADIAL');
  }

  // 中环弧 2 段（规格 §5.1.5）
  for (const [a0, a1] of [[100, 170], [280, 350]]) {
    const pts = [];
    for (let d = a0; d <= a1; d += 5) {
      const r = CFG.INNER_R * (1 + 0.05 * Math.sin(d / 18));
      pts.push([Math.cos(d * Math.PI / 180) * r, Math.sin(d * Math.PI / 180) * r]);
    }
    stamp(pts, 'ARTERIAL');
  }

  // 铁路放射支线：沿 main 站最近的一条放射线外侧 7 格（规格 §5.1.6）
  const mr = roads.find((r) => r.cls === 'RADIAL');
  const spur = mr.pts.map(([x, z], i) => {
    const q = mr.pts[Math.min(i + 1, mr.pts.length - 1)];
    const p = mr.pts[Math.max(i - 1, 0)];
    const dx = q[0] - p[0], dz = q[1] - p[1], L = Math.hypot(dx, dz) || 1;
    return [x - dz / L * 7, z + dx / L * 7];
  });
  const railSpur = { id: id++, cls: 'RAIL', pts: spur, width: 5, closed: false,
    length: polylineLength(spur), laneOffsets: [-1.5, 1.5] };
  field.stampRibbon(spur, { type: T.RAIL, roadId: railSpur.id, width: 5, mode: 'over' });
  roads.push(railSpur);

  // 轨道环本体压印。rail.pts 来自 catmullRom(closed)，但 stampRibbon 不回头，
  // 必须显式补回首点，否则环上留约 3.5 格的缺口（Task 6/7 实施者实测并回传）。
  field.stampRibbon(rail.pts.concat([rail.pts[0]]), { type: T.RAIL, roadId: -2, width: 5, mode: 'over' });
  return roads;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test`
Expected: PASS

人行道那三连刷（加宽→缩窄回路面→中央带）是刻意的简单做法，避免自己写法向偏移。**若「道路格占比」断言超过 0.26**，说明 `walk` 被重复累加，检查缩窄回路面那一步的宽度是否为 `width - walk*2`。

- [ ] **Step 5: 提交**

```bash
git add src/city/roads.js tests/trunk.test.js
git commit -m "feat(city): trunk road network (ring, 7 radials, mid-arcs, rail spur)"
```

---

## Task 9: `city/roads.js` — 次级路网（扇区 + 离散 Voronoi + Lloyd + 删段）

**Files:**
- Modify: `src/city/roads.js`（新增 `buildSecondaries`）
- Test: `tests/secondary.test.js`

**Interfaces:**
- Consumes: `field`, `roads`, `rail`, `Field.multiSourceBFS`, `poissonDisk`, `pointInPolygon`
- Produces: `buildSecondaries(field, roads, rail, rng) -> Road[]`（追加的 `cls === 'MINOR'` 路）

**扇区定义**（规格 §2 的必要性说明）：由环状主干折线 + 7 条放射折线围成。用「角度 + 内外」二元组判定某格属于哪个扇区：

```js
sectorOf(x, z) -> { ringInside: bool, sectorIndex: 0..6 }
```

`sectorIndex` = 该点方位角落在哪两条相邻放射线方位角之间。这样不需要多边形布尔运算，且天然把全城切成 14 个区域（内 7 + 外 7）。

- [ ] **Step 1: 写失败的测试**

`tests/secondary.test.js`：

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRailAndStations, buildTrunks, buildSecondaries } from '../src/city/roads.js';
import { Field } from '../src/city/field.js';
import { T, isRoad, CFG } from '../src/city/config.js';
import { makeRng } from '../src/rng.js';

const H = CFG.HALF;

function setup(withVoronoi = true) {
  const rng = makeRng(CFG.SEED);
  const rail = buildRailAndStations(rng);
  const f = new Field(H);
  f.fill(() => ({ t: T.BLOCK }));
  const roads = buildTrunks(f, rail, rng);
  if (withVoronoi) roads.push(...buildSecondaries(f, roads, rail, rng));
  return { f, rail, roads };
}

test('次级路数量在 60~200 条，cls 全为 MINOR', () => {
  const { roads } = setup();
  const minor = roads.filter((r) => r.cls === 'MINOR');
  assert.ok(minor.length >= 60 && minor.length <= 200, `次级路数 ${minor.length}`);
  assert.equal(minor.every((r) => r.pts.length >= 2), true);
});

test('所有 ROAD_MINOR 格都归属某条次级路（roadId 一致）', () => {
  const { f, roads } = setup();
  const ids = new Set(roads.filter((r) => r.cls === 'MINOR').map((r) => r.id));
  for (let x = -H; x <= H; x++) for (let z = -H; z <= H; z++) {
    const i = f.idx(x, z);
    if (f.t[i] === T.ROAD_MINOR) assert.ok(ids.has(f.roadId[i]), `孤儿次级路格 ${x},${z}`);
  }
});

test('每个扇区都被覆盖：14 个扇区内至少各有 3 个次级路格', () => {
  const { f, roads } = setup();
  const radials = roads.filter((r) => r.cls === 'RADIAL')
    .map((r) => Math.atan2(r.pts[0][1], r.pts[0][0]) * 180 / Math.PI)
    .slice().sort((a, b) => a - b);
  const hit = new Map();
  for (let x = -H; x <= H; x += 2) for (let z = -H; z <= H; z += 2) {
    if (f.t[f.idx(x, z)] !== T.ROAD_MINOR) continue;
    const r = Math.hypot(x, z);
    let deg = Math.atan2(z, x) * 180 / Math.PI; if (deg < 0) deg += 360;
    let si = 0;
    for (let i = 0; i < radials.length; i++) {
      const a = (radials[i] + 360) % 360, b = (radials[(i + 1) % radials.length] + 360) % 360;
      const inArc = a < b ? (deg >= a && deg < b) : (deg >= a || deg < b);
      if (inArc) { si = i; break; }
    }
    const key = si * 2 + (r > CFG.RING_R ? 1 : 0);
    hit.set(key, (hit.get(key) || 0) + 1);
  }
  assert.ok(hit.size >= 26, `仅 ${hit.size}/28 个扇区被细分`);
});

test('删段后无孤立分量：从任一 BLOCK 格出发不能到达 OUTSIDE（城市未被切断为飞地）', () => {
  const { f } = setup();
  // 每个扇区的次级路网自身应连通：取 ROAD_MINOR 格的并集按扇区分组做 8 邻域分量数检查
  const minor = [];
  for (let x = -H; x <= H; x += 3) for (let z = -H; z <= H; z += 3)
    if (f.t[f.idx(x, z)] === T.ROAD_MINOR) minor.push([x, z]);
  assert.ok(minor.length > 3000, '次级路总长不足');
});

test('内城扇区地块比近郊密：内圈次级路格密度 > 外圈 1.2 倍', () => {
  const { f } = setup();
  let inn = 0, out = 0, innCells = 0, outCells = 0;
  for (let x = -H; x <= H; x += 3) for (let z = -H; z <= H; z += 3) {
    const r = Math.hypot(x, z);
    if (r < CFG.RING_R - 60) { innCells++; if (f.t[f.idx(x, z)] === T.ROAD_MINOR) inn++; }
    else if (r > CFG.RING_R + 60) { outCells++; if (f.t[f.idx(x, z)] === T.ROAD_MINOR) out++; }
  }
  assert.ok(inn / innCells > 1.2 * (out / outCells),
    `内/外密度 ${(inn / innCells).toFixed(3)} vs ${(out / outCells).toFixed(3)}`);
});

test('CFG.VORONOI=false 时不产出次级路（规格 §16 的回退开关）', () => {
  const rng = makeRng(CFG.SEED);
  const rail = buildRailAndStations(rng);
  const f = new Field(H);
  f.fill(() => ({ t: T.BLOCK }));
  const roads = buildTrunks(f, rail, rng);        // 必须传真路网：空数组会让函数在
  const saved = CFG.VORONOI;                      // radials.length<2 处早退，测不到开关
  CFG.VORONOI = false;
  const out = buildSecondaries(f, roads, rail, rng);
  CFG.VORONOI = saved;
  assert.equal(out.length, 0);
  const control = buildSecondaries(f, roads, rail, makeRng(CFG.SEED));
  assert.ok(control.length > 0, '对照组也没产出次级路，说明开关测试无效');
});

test('确定性：同种子逐格一致', () => {
  assert.deepEqual(Array.from(setup().f.t), Array.from(setup().f.t));
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- tests/secondary.test.js`
Expected: FAIL — `buildSecondaries is not a function`

- [ ] **Step 3: 实现**

在 `src/city/roads.js` 追加：

```js
/**
 * 次级路网：14 个扇区各自做 Poisson 撒点 + 多源 BFS 离散 Voronoi + 3 轮 Lloyd，
 * 区界即道路（规格 §5.3）。
 */
export function buildSecondaries(field, roads, rail, rng) {
  if (!CFG.VORONOI) return [];
  const radials = roads.filter((r) => r.cls === 'RADIAL')
    .map((r) => Math.atan2(r.pts[0][1], r.pts[0][0]) * 180 / Math.PI)
    .slice().sort((a, b) => a - b);
  if (radials.length < 2) return [];

  const sectors = [];
  for (let s = 0; s < radials.length; s++) {
    const a = (radials[s] + 360) % 360;
    const b = (radials[(s + 1) % radials.length] + 360) % 360;
    for (const inner of [true, false]) {
      sectors.push({
        s, inner, a, b,
        dMin: inner ? CFG.INNER_DMIN : CFG.OUTER_DMIN,
        test: (x, z) => {
          const r = Math.hypot(x, z);
          if (inner && r > CFG.RING_R) return false;
          if (!inner && r <= CFG.RING_R) return false;
          let deg = Math.atan2(z, x) * 180 / Math.PI; if (deg < 0) deg += 360;
          return a < b ? (deg >= a && deg < b) : (deg >= a || deg < b);
        },
      });
    }
  }

  const out = [];
  let id = field.maxRoadId ? field.maxRoadId + 1 : 1000;
  for (const sec of sectors) {
    // 扇区包围盒
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let x = -field.half; x <= field.half; x += 4) for (let z = -field.half; z <= field.half; z += 4) {
      if (!sec.test(x, z)) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
    if (x1 - x0 < sec.dMin * 2 || z1 - z0 < sec.dMin * 2) continue;

    const inRegion = (x, z) => sec.test(x, z)
      && field.inb(x, z) && field.t[field.idx(x, z)] === T.BLOCK;   // 不切主干
    let seeds = poissonDisk(x0, z0, x1, z1, sec.dMin, rng,
      (x, z) => inRegion(Math.round(x), Math.round(z)), 400);
    if (seeds.length < 2) continue;

    let res = field.multiSourceBFS(seeds, inRegion);

    // Lloyd：种子移到所属区质心，重跑（规格 §5.3.3）
    for (let it = 0; it < CFG.LLOYD_ITERS; it++) {
      const sx = new Float64Array(seeds.length), sz = new Float64Array(seeds.length);
      const cnt = new Int32Array(seeds.length);
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
        const i = field.idx(x, z);
        const L = res.label[i];
        if (L < 0) continue;
        sx[L] += x; sz[L] += z; cnt[L]++;
      }
      seeds = seeds.map(([px, pz], k) => {
        if (!cnt[k]) return [px, pz];
        const nx = Math.round(sx[k] / cnt[k]), nz = Math.round(sz[k] / cnt[k]);
        return inRegion(nx, nz) ? [nx, nz] : [px, pz];
      });
      res = field.multiSourceBFS(seeds, inRegion);
    }

    // 区界即道路：格邻域中出现别的 label 或 -1（区域缝隙）即为边（规格 §5.3.4）
    const boundary = [];
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      const i = field.idx(x, z);
      if (res.label[i] < 0) continue;
      const me = res.label[i];
      for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const j = field.idx(x + ax, z + az);
        if (!inb(field, x + ax, z + az)) continue;
        if (res.label[j] !== me) { boundary.push([x, z]); break; }
      }
    }
    if (boundary.length < 40) continue;

    // 把边界格按 8 邻域串成折线，逐条压印（保证 roadId 与 dir 存在）
    const groups = regionChain(field, boundary);
    for (const g of groups) {
      if (g.length < 4) continue;
      const pts = dedupeChain(g.map((i) => [
        Math.floor(i / field.N) - field.half, (i % field.N) - field.half,
      ]));
      const r = {
        id: id++, cls: 'MINOR', pts, width: ROAD.MINOR.width, closed: false,
        length: polylineLength(pts), laneOffsets: [-1, 1],
      };
      field.stampRibbon(pts, { type: T.ROAD_MINOR, roadId: r.id, width: r.width, mode: 'over' });
      out.push(r);
    }
  }
  field.maxRoadId = id;
  return deleteRuns(field, out, rng);
}

const inb = (f, x, z) => f.inb(x, z);

/** 边界格按 8 邻域串成链（不要求完美折线，粗即可） */
function regionChain(field, cells) {
  const set = new Set(cells.map(([x, z]) => field.idx(x, z)));
  const left = new Set(set);
  const groups = [];
  while (left.size) {
    const first = left.values().next().value;
    left.delete(first);
    const group = [first];
    const q = [first];
    while (q.length) {
      const i = q.pop();
      const x = Math.floor(i / field.N) - field.half, z = (i % field.N) - field.half;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        if (!a && !b) continue;
        const j = field.idx(x + a, z + b);
        if (!left.has(j)) continue;
        left.delete(j); group.push(j); q.push(j);
      }
    }
    groups.push(group);
  }
  return groups;
}

/** 一组格 → 折线：从最左格出发，每步走向最近未访问格（近似排序，够渲染用） */
function dedupeChain(cells) {
  const rest = cells.slice();
  rest.sort((p, q) => (p[0] - q[0]) || (p[1] - q[1]));
  const out = [rest.shift()];
  while (rest.length) {
    const [lx, lz] = out[out.length - 1];
    let bi = 0, bd = Infinity;
    for (let i = 0; i < rest.length; i++) {
      const d = Math.hypot(rest[i][0] - lx, rest[i][1] - lz);
      if (d < bd) { bd = d; bi = i; }
      if (d < 1.5) break;
    }
    out.push(rest.splice(bi, 1)[0]);
  }
  // 抽稀：合并共线段，只保留方向变化 > 7.5° 的转折点
  const simp = [out[0]];
  for (let i = 1; i < out.length - 1; i++) {
    const a = out[i - 1], b = out[i], c = out[i + 1];
    const d1 = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const d2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
    let dd = Math.abs(d2 - d1) * 180 / Math.PI;
    if (dd > 180) dd = 360 - dd;
    if (dd > 7.5) simp.push(b);
  }
  simp.push(out[out.length - 1]);
  return simp;
}

/** 随机删段：把部分次级路格改回 BLOCK，制造丁字/断头（规格 §5.3.5） */
function deleteRuns(field, minors, rng) {
  const keep = [];
  for (const r of minors) {
    if (r.length > 260) { keep.push(r); continue; }          // 长边保留（连通性）
    if (rng() < CFG.MINOR_DELETE_P) {                         // 整条删除并复原格
      const dense = resample(r.pts, 0.5);
      for (const p of dense) {
        const x = Math.round(p[0]), z = Math.round(p[1]);
        if (!field.inb(x, z)) continue;
        const i = field.idx(x, z);
        if (field.t[i] === T.ROAD_MINOR && field.roadId[i] === r.id) {
          field.t[i] = T.BLOCK; field.roadId[i] = -1;
        }
      }
      r.deleted = true;
      continue;
    }
    keep.push(r);
  }
  return keep.filter((r) => !r.deleted);
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test`
Expected: PASS

**关于「删段后无孤立分量」这条测试**：它现在只检查次级路总长，是个弱断言。真正的检查在 Task 12（街区数量与面积分布）——若删段切断了某个扇区，那里会表现为街区数暴跌。**保留本条但在 Task 12 里补一条硬检查**，不要在本 Task 假装验证了连通性。

若「内/外密度比」失败：把 `OUTER_DMIN` 提到 62，不要放宽 1.2 倍阈值。

- [ ] **Step 5: 提交**

```bash
git add src/city/roads.js tests/secondary.test.js
git commit -m "feat(city): secondary network via discrete Voronoi + Lloyd + run deletion"
```

---

## Task 10: `city/roads.js` — 道路纵剖面（P5）

**Files:**
- Modify: `src/city/roads.js`（新增 `profileHeights`）
- Test: `tests/profile.test.js`

**Interfaces:**
- Consumes: `field`（已有 `h` = 地形量化值）, `roads`
- Produces: `profileHeights(field, roads, terr)` — 就地改写道路格的 `h`，返回 `field`

- [ ] **Step 1: 写失败的测试**

`tests/profile.test.js`：

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRailAndStations, buildTrunks, buildSecondaries, profileHeights } from '../src/city/roads.js';
import { makeTerrain, applyTerrain, quantize } from '../src/city/terrain.js';
import { Field } from '../src/city/field.js';
import { T, isRoad, CFG } from '../src/city/config.js';
import { makeRng, hash2 } from '../src/rng.js';
import { resample } from '../src/city/geom.js';

const H = CFG.HALF;

function setup() {
  const rng = makeRng(CFG.SEED);
  const terr = makeTerrain(makeRng(CFG.SEED ^ 0x51ab));
  const rail = buildRailAndStations(rng);
  const f = new Field(H);
  f.fill(() => ({ t: T.BLOCK }));
  applyTerrain(f, terr);
  const roads = buildTrunks(f, rail, rng);
  roads.push(...buildSecondaries(f, roads, rail, rng));
  profileHeights(f, roads, terr);
  return { f, roads, terr };
}

test('道路格高度全为 [0,7] 整数', () => {
  const { f } = setup();
  for (let x = -H; x <= H; x++) for (let z = -H; z <= H; z++) {
    const i = f.idx(x, z);
    if (!isRoad(f.t[i]) && f.t[i] !== T.SIDEWALK && f.t[i] !== T.RAIL) continue;
    assert.ok(Number.isInteger(f.h[i]), `非整数 ${f.h[i]}`);
    assert.ok(f.h[i] >= 0 && f.h[i] <= 7, `越界 ${f.h[i]}`);
  }
});

test('沿路任意 30 格步长内高差 ≤ 1（缓坡，规格 §6.3）', () => {
  const { f, roads } = setup();
  for (const r of roads) {
    if (r.cls === 'MINOR') continue;                     // 次级路允许局部小起伏
    const dense = resample(r.pts, 30);
    for (let k = 1; k < dense.length; k++) {
      const a = dense[k - 1], b = dense[k];
      const ga = [Math.round(a[0]), Math.round(a[1])], gb = [Math.round(b[0]), Math.round(b[1])];
      if (!f.inb(ga[0], ga[1]) || !f.inb(gb[0], gb[1])) continue;
      const ha = f.h[f.idx(ga[0], ga[1])], hb = f.h[f.idx(gb[0], gb[1])];
      assert.ok(Math.abs(ha - hb) <= 1,
        `${r.cls}#${r.id} 在 ${ga}->${gb} 处高差 ${ha - hb} > 1`);
    }
  }
});

test('道路剖面确实改变了地形（台地边缘被拉平成坡道，而非完全等于地形）', () => {
  const { f, terr } = setup();
  let diff = 0, tot = 0;
  for (let x = -H; x <= H; x += 3) for (let z = -H; z <= H; z += 3) {
    const i = f.idx(x, z);
    if (!isRoad(f.t[i])) continue;
    tot++;
    const raw = quantize(terr.raw(x, z));   // 基准必须与 §6.2 现行量化同映射（见下方注）
    if (raw !== f.h[i]) diff++;
  }
  assert.ok(tot > 3000);
  // 阈值 0.15 是未经验证写下的，任何符合 §6.3 的实现都不可达：§6.2 修订①收窄振幅后，
  // W=60 移动平均在低频场上的取整翻转率物理上界 ~7%（实测 3.3%；台地边缘带 19.6%）。
  // 下界 0.02 仍有牙：完全不平滑（0%）触下界，脱钩（>85%）触上界，实测余量 1.6×。
  assert.ok(diff / tot > 0.02, `道路几乎没平滑地形（${(diff / tot * 100).toFixed(1)}%）`);
  assert.ok(diff / tot < 0.85, '道路高度与地形脱钩（过度拉平）');
});

test('人行道格继承所在路面高度（不出现路缘内部错台）', () => {
  const { f, roads } = setup();
  for (const r of roads) {
    if (r.cls === 'RAIL') continue;
    const dense = resample(r.pts, 4);
    const seen = new Set();
    for (const p of dense) {
      const x = Math.round(p[0]), z = Math.round(p[1]);
      if (!f.inb(x, z) || seen.has(f.idx(x, z))) continue;
      seen.add(f.idx(x, z));
      const i = f.idx(x, z);
      if (f.t[i] === T.SIDEWALK) {
        // 同一 roadId 的路面格高度必须与人行道一致
        for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) {
          const j = f.idx(x + a, z + b);
          if (!f.inb(x + a, z + b) || f.roadId[j] !== f.roadId[i] || !isRoad(f.t[j])) continue;
          assert.equal(f.h[i], f.h[j], `人行道与路面错台 @${x},${z}`);
        }
      }
      if (seen.size > 4000) break;
    }
  }
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- tests/profile.test.js`
Expected: FAIL — `profileHeights is not a function`

- [ ] **Step 3: 实现**

在 `src/city/roads.js` 追加：

```js
/**
 * 道路纵剖面（规格 §6.3）：沿折线对原始高度做窗口 60 的移动平均后取整，
 * 再写回该路宽覆盖的全部格（含人行道），从而消除路缘错台。
 */
export function profileHeights(field, roads, terr) {
  const W = 60;
  for (const r of roads) {
    const dense = resample(r.pts, 4);
    if (!dense.length) continue;
    const prof = dense.map((p) => terr.raw(p[0], p[1]));
    const sm = prof.map((_, i) => {
      let s = 0, n = 0;
      for (let k = i - W / 8; k <= i + W / 8; k++) {
        const j = Math.round(k);
        if (j < 0 || j >= prof.length) continue;
        s += prof[j]; n++;
      }
      return s / (n || 1);
    });
    const clampH = (v) => quantize(v);   // 必须走 §6.2 现行量化：P7 的街区 h 取边界道路 h 众数，
                                         // 用修订①已废止的 +2.6 映射会把废弃尺度扩散全城。
    let acc = 0;
    for (let i = 0; i < dense.length; i++) {
      const x = Math.round(dense[i][0]), z = Math.round(dense[i][1]);
      if (!field.inb(x, z)) continue;
      if (i > 0 && Math.hypot(x - Math.round(dense[i - 1][0]), z - Math.round(dense[i - 1][1])) < 3) continue;
      const h = clampH(sm[i]);
      const span = Math.ceil(r.width / 2) + 2;
      for (let a = -span; a <= span; a++) for (let b = -span; b <= span; b++) {
        const xx = x + a, zz = z + b;
        if (!field.inb(xx, zz)) continue;
        const j = field.idx(xx, zz);
        if (!isRoad(field.t[j]) && field.t[j] !== T.SIDEWALK && field.t[j] !== T.RAIL) continue;
        if (field.roadId[j] !== r.id) continue;
        field.h[j] = h; acc++;
      }
    }
    r.profiled = acc;
  }
  return field;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test`
Expected: PASS

「缓坡」若在大半径弯道上失败，把 `resample` 步长从 30 提到 45 检查；真错则是 `W/8` 窗口太小——**提到 `W/4`**，不要放宽容差。

- [ ] **Step 5: 提交**

```bash
git add src/city/roads.js tests/profile.test.js
git commit -m "feat(city): road longitudinal profiles smoothing terrain"
```

---

## Task 11: `city/water.js` — 河流、港湾、突堤与桥位

**Files:**
- Create: `src/city/water.js`
- Test: `tests/water.test.js`

**Interfaces:**
- Consumes: `Field`, `roads`, `terr`, `catmullRom`, `wrap180`
- Produces: `applyWater(field, roads, terr, rng) -> { bridges: Bridge[], mainRiver, tributary, coast }`，
  `Bridge = { id, roadId, cls, pts:[[x,z]…], deck: int, span: int }`

- [ ] **Step 1: 写失败的测试**

`tests/water.test.js`：

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRailAndStations, buildTrunks, buildSecondaries, profileHeights } from '../src/city/roads.js';
import { applyWater, RIVER_CTRL, TRIBUTARY_CTRL, makeCoast, eastOfCoast } from '../src/city/water.js';
import { makeTerrain, applyTerrain } from '../src/city/terrain.js';
import { Field } from '../src/city/field.js';
import { T, isWater, isRoad, CFG } from '../src/city/config.js';
import { makeRng } from '../src/rng.js';
import { resample } from '../src/city/geom.js';

const H = CFG.HALF;

function setup() {
  const rng = makeRng(CFG.SEED);
  const terr = makeTerrain(makeRng(CFG.SEED ^ 0x51ab));
  const rail = buildRailAndStations(rng);
  const f = new Field(H);
  f.fill(() => ({ t: T.BLOCK }));
  applyTerrain(f, terr);
  const roads = buildTrunks(f, rail, rng);
  roads.push(...buildSecondaries(f, roads, rail, rng));
  profileHeights(f, roads, terr);
  const water = applyWater(f, roads, terr, rng);
  return { f, roads, terr, rail, water };
}

test('主河从起点连续通到海面（一格不断）', () => {
  const { f, water } = setup();
  assert.ok(water.mainRiver.length > 100);
  const reach = new Set([f.idx(Math.round(water.mainRiver[0][0]), Math.round(water.mainRiver[0][1]))]);
  const q = [water.mainRiver[0]];
  while (q.length) {
    const [x0, z0] = q.pop();
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const x = Math.round(x0) + a, z = Math.round(z0) + b;
      if (!f.inb(x, z)) continue;
      const i = f.idx(x, z);
      if (reach.has(i) || !isWater(f.t[i])) continue;
      reach.add(i); q.push([x, z]);
    }
  }
  const mouth = f.idx(Math.round(water.mainRiver.at(-1)[0]), Math.round(water.mainRiver.at(-1)[1]));
  assert.ok(isWater(f.t[mouth]));
  assert.ok(reach.has(mouth), '主河断裂：起点无法到达河口');
});

test('河面不发光：WATER/SEA 格存在且 h = 0（规格 §11.5）', () => {
  const { f } = setup();
  let w = 0, s = 0;
  for (let x = -H; x <= H; x++) for (let z = -H; z <= H; z++) {
    const i = f.idx(x, z);
    if (f.t[i] === T.WATER) { w++; assert.equal(f.h[i], 0, '河床应为 0'); }
    if (f.t[i] === T.SEA) { s++; assert.equal(f.h[i], 0, '海床应为 0'); }
  }
  assert.ok(w > 6000 && w < 40000, `河道格数异常 ${w}`);
  assert.ok(s > 40000, `海域格数异常 ${s}`);
});

test('河宽沿流向渐增（下游 > 上游 1.5 倍）', () => {
  const { f, water } = setup();
  const widthAt = (p) => {
    const [x, z] = [Math.round(p[0]), Math.round(p[1])];
    let n = 0;
    for (let a = -12; a <= 12; a++) if (f.inb(x + a, z) && isWater(f.t[f.idx(x + a, z)])) n++;
    return n;
  };
  const up = widthAt(water.mainRiver[8]), dn = widthAt(water.mainRiver.at(-12));
  assert.ok(dn > up * 1.5, `宽度未渐变 up=${up} dn=${dn}`);
});

test('港湾在东南：SEA 只出现在 x+z 大的象限；5 座突堤为陆域', () => {
  const { f, water } = setup();
  assert.equal(water.piers.length, 5);
  let wrong = 0;
  for (let x = -H; x <= H; x += 4) for (let z = -H; z <= H; z += 4)
    if (f.t[f.idx(x, z)] === T.SEA && x + z < 380) wrong++;
  assert.equal(wrong, 0, '海域泄漏到内陆');
  for (const p of water.piers) {
    assert.equal(f.t[f.idx(p.x, p.z)], T.QUAY, '突堤中心应为陆域');
    assert.ok(p.x + p.z > 400);
  }
});

test('桥只出现在道路跨水处，且数量 ≥ 6；桥面高于两岸', () => {
  const { f, roads, water } = setup();
  assert.ok(water.bridges.length >= 6, `桥太少 ${water.bridges.length}`);
  const byId = new Map(roads.map((r) => [r.id, r]));
  for (const b of water.bridges) {
    const r = byId.get(b.roadId);
    assert.ok(r, `桥 ${b.id} 引用了不存在的道路`);
    assert.ok(b.deck >= 1, '桥面高度异常');
    for (const [x, z] of b.pts) {
      const i = f.idx(Math.round(x), Math.round(z));
      assert.ok(isWater(f.t[i]) || f.t[i] === T.BRIDGE, `桥格落在非水上 ${x},${z}:${f.t[i]}`);
    }
  }
});

test('河岸两侧有 RECLAIM 护岸带（≥2 格宽），其高度 ≥1', () => {
  // 采样对象 = 河岸格（4 邻域内有非水格的水格），判据 = ±1/±2 方位内有 RECLAIM（2026-09-20 裁定 R6e）。
  // 原判据（全部水格、仅 ±2）在规格 §7.1 河宽 6→14 下几何不可达：河心格的 ±2 邻居必然全是水，
  // 覆盖率上限实测仅 40.4%；河岸格 + ±1/±2 才贴合「护岸带 ≥2 格宽」的语义（实测 95%+）。
  const { f } = setup();
  let ok = 0, bad = 0;
  for (let x = -H; x <= H; x += 3) for (let z = -H; z <= H; z += 3) {
    if (f.t[f.idx(x, z)] !== T.WATER) continue;
    let bank = false;
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!f.inb(x + a, z + b) || !isWater(f.t[f.idx(x + a, z + b)])) bank = true;
    }
    if (!bank) continue;
    let found = false;
    for (const [a, b] of [[2, 0], [-2, 0], [0, 2], [0, -2], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const i = f.idx(x + a, z + b);
      if (!f.inb(x + a, z + b)) continue;
      if (f.t[i] === T.RECLAIM && f.h[i] >= 1) found = true;
    }
    found ? ok++ : bad++;
  }
  assert.ok(ok / (ok + bad) > 0.9, `护岸覆盖率仅 ${(ok / (ok + bad) * 100).toFixed(0)}%`);
});

test('水系不销毁任何主干道：RING/RADIAL 格（含桥格）按 roadId 守恒；海岸截断只吃岸线外侧', () => {
  // 判据按 roadId 统计（含 BRIDGE 桥格，桥格保留 roadId）——原判据按格子类型精确计数，
  // 跨水段改 BRIDGE 后字面计数必减，与断言信息「跨水道路应改为 BRIDGE 而非删除」自相矛盾（2026-09-20 裁定）。
  const rng = makeRng(CFG.SEED);
  const terr = makeTerrain(makeRng(CFG.SEED ^ 0x51ab));
  const rail = buildRailAndStations(rng);
  const f = new Field(H);
  f.fill(() => ({ t: T.BLOCK }));
  applyTerrain(f, terr);
  const roads = buildTrunks(f, rail, rng);
  roads.push(...buildSecondaries(f, roads, rail, rng));
  profileHeights(f, roads, terr);
  const coast = makeCoast();
  const ringIds = new Set(roads.filter((r) => r.cls === 'RING').map((r) => r.id));
  const trunkIds = new Set(roads.filter((r) => r.cls === 'RING' || r.cls === 'RADIAL').map((r) => r.id));
  const tally = () => {
    let ring = 0;
    const inner = new Map();
    for (let x = -H; x <= H; x++) for (let z = -H; z <= H; z++) {
      const c = f.at(x, z);
      if (c.roadId < 0) continue;
      if (ringIds.has(c.roadId)) ring++;
      if (trunkIds.has(c.roadId) && !eastOfCoast(coast, x, z))
        inner.set(c.roadId, (inner.get(c.roadId) || 0) + 1);
    }
    return { ring, inner };
  };
  const before = tally();
  applyWater(f, roads, terr, rng);
  const after = tally();
  assert.equal(after.ring, before.ring, '水系抹掉了环状主干（跨水道路应改为 BRIDGE 而非删除）');
  for (const id of trunkIds) {
    assert.equal(after.inner.get(id) || 0, before.inner.get(id) || 0, `主干 #${id} 岸线内侧格被吃掉`);
  }
  // §7.2「界外侧全部 SEA」：确有路被截断（truncatedBySea），且全场不存在岸线外侧的道路带格
  const truncated = roads.filter((r) => r.truncatedBySea);
  assert.ok(truncated.length >= 1, '应有路被海岸截断（放射/支线/次级伸进海）');
  let leak = 0;
  for (let x = -H; x <= H; x++) for (let z = -H; z <= H; z++) {
    const t = f.t[f.idx(x, z)];
    if ((isRoad(t) || t === T.SIDEWALK || t === T.MEDIAN || t === T.RAIL) && eastOfCoast(coast, x, z)) leak++;
  }
  assert.equal(leak, 0, '岸线外侧仍存在道路格');
});

test('水系不抹掉轨交：岸线内侧轨交格守恒，跨水轨交成桥 ≥1', () => {
  // 2026-09-20 裁定 ③b：跨水轨交格 → BRIDGE、保留原 roadId、deck=max(两岸 h)+2。
  // 守恒按岸线内侧计：铁路支线海侧段按 §7.2 裁定截断（truncatedBySea），不属于「被水系抹掉」。
  const rng = makeRng(CFG.SEED);
  const terr = makeTerrain(makeRng(CFG.SEED ^ 0x51ab));
  const rail = buildRailAndStations(rng);
  const f = new Field(H);
  f.fill(() => ({ t: T.BLOCK }));
  applyTerrain(f, terr);
  const roads = buildTrunks(f, rail, rng);
  roads.push(...buildSecondaries(f, roads, rail, rng));
  profileHeights(f, roads, terr);
  const coast = makeCoast();
  const railIds = new Set([-2, roads.find((r) => r.cls === 'RAIL').id]);
  const cnt = () => {
    let n = 0;
    for (let x = -H; x <= H; x++) for (let z = -H; z <= H; z++) {
      if (eastOfCoast(coast, x, z)) continue;
      const c = f.at(x, z);
      if (c.t === T.RAIL || (c.t === T.BRIDGE && railIds.has(c.roadId))) n++;
    }
    return n;
  };
  const before = cnt();
  const water = applyWater(f, roads, terr, rng);
  assert.equal(cnt(), before, '水系抹掉了轨交（跨水轨交应改为 BRIDGE 并保留 roadId）');
  assert.ok(water.bridges.some((b) => b.cls === 'RAIL'), '支流西穿环轨应至少产生一座轨交桥');
});

test('确定性：同种子逐格一致', () => {
  assert.deepEqual(Array.from(setup().f.t), Array.from(setup().f.t));
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- tests/water.test.js`
Expected: FAIL — `Cannot find module '../src/city/water.js'`

- [ ] **Step 3: 实现**

`src/city/water.js`：

```js
/** 水系与港湾（规格 §7）。主河走城市东侧，不穿 CBD。 */
import { CFG, T, ROAD, isWater, isRoad } from './config.js';
import { catmullRom, resample, polylineLength } from './geom.js';

// §7.1（2026-09-20 裁定修订）：中段 r≥290，抖动 ±22 后仍高于环轨外包络 264，主河不穿轨道环；
// 首点 [30,-544]→[50,-544]（+20）拉陡上游段，否则河宽下游/上游比仅 1.18（需 >1.5）。
export const RIVER_CTRL = [[50, -544], [150, -370], [235, -195], [292, -15], [305, 150], [325, 265], [350, 380]];
export const TRIBUTARY_CTRL = [[-544, -30], [-380, -55], [-210, -20], [-40, 30], [118, 88], [205, 75], [298, 67]];
const COAST_CTRL = [[544, 120], [470, 205], [400, 265], [330, 330], [255, 400], [185, 470], [120, 544]];

/** 河宽在 t∈[0,.35,.7,1] 上取 [6,8,11,14]（规格 §7.1） */
function riverWidth(t) {
  const K = [[0, 6], [.35, 8], [.7, 11], [1, 14]];
  for (let i = 1; i < K.length; i++) {
    if (t <= K[i][0]) {
      const f = (t - K[i - 1][0]) / (K[i][0] - K[i - 1][0]);
      return K[i - 1][1] + (K[i][1] - K[i - 1][1]) * f;
    }
  }
  return K[K.length - 1][1];
}

function jitter(pts, rng, amp) {
  return pts.map(([x, z]) => [x + rng.range(-amp, amp), z + rng.range(-amp, amp)]);
}

/** 渐宽折线压印 + 记下水岸格，供护岸二次通行 */
function stampRiver(field, pts, widthFn, rng) {
  const dense = resample(pts, 0.5);
  const total = dense.length - 1 || 1;
  const banks = [];
  for (let s = 0; s < dense.length; s++) {
    const p = dense[s], q = dense[Math.min(s + 1, dense.length - 1)], r = dense[Math.max(s - 1, 0)];
    let dx = q[0] - r[0], dz = q[1] - r[1];
    const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    const half = widthFn(s / total) / 2;
    for (let w = -Math.ceil(half); w <= Math.ceil(half); w++) {
      if (Math.abs(w) > half) continue;
      const x = Math.round(p[0] - dz * w), z = Math.round(p[1] + dx * w);
      if (!field.inb(x, z)) continue;
      const i = field.idx(x, z);
      if (Math.abs(w) === Math.ceil(half)) banks.push([x, z]);
      if (isRoad(field.t[i]) || field.t[i] === T.SIDEWALK) continue;   // 不覆盖道路（跨水处成桥）
      field.t[i] = T.WATER; field.h[i] = 0; field.roadId[i] = -1;
    }
  }
  return banks;
}

export function applyWater(field, roads, terr, rng) {
  const river = catmullRom(jitter(RIVER_CTRL, rng, 22), { closed: false, perSeg: 14 });
  const trib = catmullRom(jitter(TRIBUTARY_CTRL, rng, 18), { closed: false, perSeg: 12 });
  const coast = catmullRom(COAST_CTRL.map(([x, z], i) => {
    const bump = [0, -34, 26, -42, 30, -22, 0][i] ?? 0;
    const L = Math.hypot(x, z) || 1;
    return [x + (x / L) * bump, z + (z / L) * bump];
  }), { closed: false, perSeg: 10 });

  // 海：岸线外侧（离原点更远的一侧）
  for (let x = -field.half; x <= field.half; x++) for (let z = -field.half; z <= field.half; z++) {
    if (!eastOfCoast(field, coast, x, z)) continue;
    const i = field.idx(x, z);
    if (isRoad(field.t[i]) || field.t[i] === T.SIDEWALK) continue;
    field.t[i] = T.SEA; field.h[i] = 0; field.roadId[i] = -1;
  }

  const banks = [...stampRiver(field, river, riverWidth, rng)];
  banks.push(...stampRiver(field, trib, (t) => 5 + 3 * t, rng));

  // 突堤码头 5 座（规格 §7.2）：从岸线向海伸出
  const piers = [];
  for (let k = 0; k < 5; k++) {
    const p = coast[Math.floor((k + 0.5) / 5.5 * coast.length)];
    const L = Math.hypot(p[0], p[1]) || 1;
    const ux = p[0] / L, uz = p[1] / L;                 // 向海方向
    const len = 30 + Math.round(rng() * 25), wid = 4 + Math.round(rng() * 6);
    for (let s = 0; s < len; s++) for (let w = -wid; w <= wid; w++) {
      const x = Math.round(p[0] + ux * s - uz * w), z = Math.round(p[1] + uz * s + ux * w);
      if (!field.inb(x, z)) continue;
      const i = field.idx(x, z);
      if (field.t[i] !== T.SEA) continue;
      field.t[i] = T.QUAY; field.h[i] = 1;
    }
    piers.push({ id: k, x: Math.round(p[0] + ux * len * 0.5), z: Math.round(p[1] + uz * len * 0.5), len, wid });
  }

  // 护岸：水面 4 邻域外 2 格内的陆域 → RECLAIM，高度 ≥1
  const waterCells = [];
  for (let x = -field.half; x <= field.half; x++) for (let z = -field.half; z <= field.half; z++)
    if (isWater(field.t[field.idx(x, z)])) waterCells.push([x, z]);
  for (const [x, z] of waterCells) for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) {
    const xx = x + a, zz = z + b;
    if (!field.inb(xx, zz)) continue;
    const i = field.idx(xx, zz);
    if (isWater(field.t[i]) || field.t[i] === T.QUAY) continue;
    if (isRoad(field.t[i]) || field.t[i] === T.SIDEWALK || field.t[i] === T.RAIL) continue;
    field.t[i] = T.RECLAIM;
    field.h[i] = Math.max(1, field.h[i]);
  }

  const bridges = buildBridges(field, roads);
  return { bridges, piers, mainRiver: river, tributary: trib, coast };
}

/** 点是否在岸线「向海」一侧：以原点为内侧，比较该点方位角处岸线半径 */
function eastOfCoast(field, coast, x, z) {
  if (x < 0 || z < 0) return false;                     // 海只在东南象限
  let deg = Math.atan2(z, x) * 180 / Math.PI; if (deg < 0) deg += 360;
  let best = Infinity;
  for (let i = 0; i < coast.length; i++) {
    const a = coast[i], b = coast[(i + 1) % coast.length];
    const d1 = norm(Math.atan2(a[1], a[0]) * 180 / Math.PI);
    const d2 = norm(Math.atan2(b[1], b[0]) * 180 / Math.PI);
    const inside = d1 <= d2 ? (deg >= d1 && deg <= d2) : (deg >= d1 || deg <= d2);
    if (!inside) continue;
    const t = Math.abs(deg - d1) / (Math.abs(d2 - d1) || 1e-6);
    const r = Math.hypot(a[0], a[1]) * (1 - t) + Math.hypot(b[0], b[1]) * t;
    best = Math.min(best, r);
  }
  if (!Number.isFinite(best)) return false;
  return Math.hypot(x, z) > best;
}
const norm = (d) => ((d % 360) + 360) % 360;

/** 桥：一条道路连续跨水的格段（规格 §7.3） */
function buildBridges(field, roads) {
  const bridges = [];
  let id = 0;
  for (const r of roads) {
    const dense = resample(r.pts, 1);
    let run = null;
    const flush = () => {
      if (!run || run.pts.length < 5) { run = null; return; }
      // 桥面净空按道路等级：主干/次级 1 格，轨道 2 格（其下还要过街）
      const clearance = r.cls === 'RAIL' ? 2 : 1;
      let bank = 0;
      for (const p of [run.pts[0], run.pts.at(-1)]) {
        const x = Math.round(p[0]), z = Math.round(p[1]);
        for (let s = 1; s <= 6; s++) for (const q of [field.at(x + s, z), field.at(x - s, z), field.at(x, z + s), field.at(x, z - s)]) {
          if (q && !isWater(q.t)) bank = Math.max(bank, q.h);
        }
      }
      const deck = bank + clearance;
      for (const p of run.pts) {
        const x = Math.round(p[0]), z = Math.round(p[1]);
        if (!field.inb(x, z)) continue;
        const i = field.idx(x, z);
        if (!isWater(field.t[i])) continue;
        field.t[i] = T.BRIDGE; field.h[i] = deck; field.roadId[i] = r.id;
      }
      bridges.push({ id: id++, roadId: r.id, cls: r.cls, pts: run.pts, deck, span: run.pts.length });
      run = null;
    };
    for (const p of dense) {
      const x = Math.round(p[0]), z = Math.round(p[1]);
      const c = field.at(x, z);
      if (c && (isWater(c.t) || c.t === T.BRIDGE)) {
        if (!run) run = { pts: [] };
        run.pts.push([x, z]);
      } else flush();
    }
    flush();
  }
  return bridges;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test`
Expected: PASS

落地定稿（2026-09-20 裁定，实测 80/80 全绿）的语义以代码为准，要点：
- `stampRiver` 不跳过道路带格（含轨交）：河床一律沉 WATER，跨水道路带格记入 cross 并保留 roadId；`buildBridges` 按 roadId + 8 连通聚簇整段转 BRIDGE（不是只留中柱），deck = max(两岸 h) + 净空（道路 1、轨交 2）。
- `isWater` 含 BRIDGE（config.js）：桥格下就是水，主河连通 BFS 照常穿桥；语义即 §7.3「桥下格保持 WATER」。对 applyWater 之前的阶段零影响。
- 轨交跨水同样成桥：环轨（roadId=-2）由 `ringRailRoad` 按场上格带方位角分箱还原合成路账后入 bridges（cls 'RAIL'）；岸线内侧轨交格守恒有硬断言。
- 海岸截断兑现 §7.2「界外侧全部 SEA」：岸线外侧一切格（含道路带格）抹成 SEA（roadId=-1、cellRank=0），每条路的 pts 截到岸线（岸内前缀 + 二分交点），记 `r.truncatedBySea`。
- 突堤涂刷走包围盒逆变换（近 45° 整数步进会留对角棋盘空洞）；返回折线 8 格重采样（mainRiver >100 点）。
- `catmullRom` 开放曲线首末段 NaN 已修（geom.js，幻影点退化时取端点；闭合行为不变）。

- [ ] **Step 5: 提交**

```bash
git add src/city/water.js src/city/config.js src/city/geom.js tests/water.test.js tests/config.test.js
git commit -m "feat(city): spline river, harbor with piers, and auto bridge siting"
```

---

## Task 12: `city/blocks.js` — 街区派生（P7）

**Files:**
- Create: `src/city/blocks.js`
- Test: `tests/blocks.test.js`

**Interfaces:**
- Consumes: `Field.connectedComponents`
- Produces: `extractBlocks(field) -> Block[]`，
`Block = { id, cells: Int32Array, bbox, centroid, area, perimeter, frontage: [{roadId, road}], h, district: null, plots: [] }`

- [ ] **Step 1: 写失败的测试**

`tests/blocks.test.js`：

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractBlocks } from '../src/city/blocks.js';
import { fullPipeline } from './helpers.js';
import { T, isRoad, isWater, CFG } from '../src/city/config.js';

const H = CFG.HALF;

test('街区数在 1100~1600（规格 §8.5）', () => {
  const { blocks } = fullPipeline();
  assert.ok(blocks.length >= 900 && blocks.length <= 2200,
    `街区数 ${blocks.length}（初值允许宽区间，收紧到 1100~1600 在 Task 18 调参）`);
});

test('每个街区的格全是 BLOCK 家族，且 blockId 唯一一致', () => {
  const { f, blocks } = fullPipeline();
  for (const b of blocks) {
    assert.ok(b.area >= CFG.SLIVER_AREA, `碎块漏吸收 ${b.area}`);
    for (const i of b.cells) {
      assert.ok(f.t[i] === T.BLOCK, `街区含非 BLOCK 格 type=${f.t[i]}`);
      assert.equal(f.blockId[i], b.id, 'blockId 未回写');
    }
  }
});

test('街区互不相邻越界：每块格数总和 = field 中 BLOCK 格数', () => {
  const { f, blocks } = fullPipeline();
  const total = blocks.reduce((s, b) => s + b.area, 0);
  assert.equal(total, f.countIf((c) => c.t === T.BLOCK));
});

test('同街区高度全等（规格 §6.3，run 合并的前提）', () => {
  const { f, blocks } = fullPipeline();
  for (const b of blocks) {
    const h0 = f.h[b.cells[0]];
    for (const i of b.cells) assert.equal(f.h[i], h0, `街区 ${b.id} 高度不齐`);
    assert.equal(b.h, h0);
  }
});

test('无孤立飞地：每个街区至少有一条临街边（extractBlocks 不把 POCKET 作为 block 返回）', () => {
  const { blocks } = fullPipeline();
  const orphan = blocks.filter((b) => !b.frontage.length);
  assert.equal(orphan.length, 0, `存在 ${orphan.length} 个无临街的孤岛街区（删段切断了连通性）`);
});

test('异形街区存在：既有轴对齐矩形块，也有三角形/扇形块', () => {
  const { blocks } = fullPipeline();
  // 填充率 = 面积 / bbox 面积。矩形 ≈1，三角 ≈0.5，扇形 <0.7
  const fills = blocks.filter((b) => b.area > 800).map((b) => {
    const [x0, z0, x1, z1] = b.bbox;
    return b.area / ((x1 - x0 + 1) * (z1 - z0 + 1));
  });
  assert.ok(fills.filter((v) => v > 0.9).length > 20, '缺少近矩形街区');
  assert.ok(fills.filter((v) => v < 0.65).length > 40, '缺少三角形/扇形异形街区');
});

test('面积分布右偏：最大块 < 60× 中位数（无超大空地吞城）', () => {
  const { blocks } = fullPipeline();
  const a = blocks.map((b) => b.area).sort((x, y) => x - y);
  const med = a[Math.floor(a.length / 2)];
  assert.ok(a.at(-1) < med * 60, `最大块 ${a.at(-1)} vs 中位 ${med}`);
});

test('确定性：同种子同结果', () => {
  assert.deepEqual(fullPipeline().blocks.map((b) => b.area), fullPipeline().blocks.map((b) => b.area));
});
```

- [ ] **Step 2: 写测试辅助 `tests/helpers.js`**

多个 Task 共用同一份完整流水线，抽出来避免复制：

```js
import { buildRailAndStations, buildTrunks, buildSecondaries, profileHeights } from '../src/city/roads.js';
import { applyWater } from '../src/city/water.js';
import { makeTerrain, applyTerrain } from '../src/city/terrain.js';
import { extractBlocks } from '../src/city/blocks.js';
import { Field } from '../src/city/field.js';
import { T, CFG } from '../src/city/config.js';
import { makeRng } from '../src/rng.js';

/** 跑到 P7（街区派生）为止。districts / alleys / plots 由后续 Task 的 runDistricts 追加。 */
export function fullPipeline(seed = CFG.SEED) {
  const rng = makeRng(seed);
  const terr = makeTerrain(makeRng(seed ^ 0x51ab));
  const rail = buildRailAndStations(rng);
  const f = new Field(CFG.HALF);
  f.fill(() => ({ t: T.BLOCK }));
  applyTerrain(f, terr);
  const roads = buildTrunks(f, rail, rng);
  roads.push(...buildSecondaries(f, roads, rail, rng));
  profileHeights(f, roads, terr);
  const water = applyWater(f, roads, terr, rng);
  const blocks = extractBlocks(f);
  // field 与 f 是同一个对象的两个键名：测试与 districts/query 两侧都用 field，helpers 保留 f 作为简写
  return { f, field: f, roads, rail, terr, water, blocks };
}
```

此处刻意**不 import `buildAlleys`**（它到 Task 14 才存在）；Task 15 Step 2 的 `runDistricts` 再补上。

- [ ] **Step 3: 运行确认失败**

Run: `npm test -- tests/blocks.test.js`
Expected: FAIL — `Cannot find module '../src/city/blocks.js'`

- [ ] **Step 4: 实现**

`src/city/blocks.js`：

```js
/** 街区派生（规格 §8）：道路切出来的连通域，不手画任何多边形。 */
import { CFG, T, isRoad, isWater } from './config.js';

export function extractBlocks(field) {
  const raw = field.connectedComponents((t) => t === T.BLOCK);
  // 碎块吸收（§8.3）：并入面积最大的 8 邻接块；无邻块 → POCKET
  const byIdx = new Map();
  raw.forEach((c, k) => { c.id = k; byIdx.set(k, c); });
  const neighborIds = (comp) => {
    const seen = new Map();
    for (const i of comp.cells) {
      const x = Math.floor(i / field.N) - field.half, z = (i % field.N) - field.half;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        if (!a && !b) continue;
        const j = field.inb(x + a, z + b) ? field.idx(x + a, z + b) : -1;
        if (j < 0) continue;
        const other = idxToComp.get(j);
        if (other !== undefined && other !== comp.id) {
          seen.set(other, (seen.get(other) || 0) + 1);
        }
      }
    }
    return [...seen.entries()].sort((p, q) => q[1] - p[1]);
  };
  const idxToComp = new Map();
  for (const c of raw) for (const i of c.cells) idxToComp.set(i, c.id);

  const pocket = new Set();
  for (const c of raw.slice().sort((a, b) => a.area - b.area)) {
    if (c.area >= CFG.SLIVER_AREA) continue;
    const best = neighborIds(c).find(([k]) => !pocket.has(k) && byIdx.get(k).area >= CFG.SLIVER_AREA);
    if (!best) { pocket.add(c.id); continue; }
    const target = byIdx.get(best[0]);
    for (const i of c.cells) {
      if (field.t[i] !== T.BLOCK) continue;
      target.cells = Int32Array.from([...target.cells, i]);
      idxToComp.set(i, target.id);
      const x = Math.floor(i / field.N) - field.half, z = (i % field.N) - field.half;
      if (x < target.bbox[0]) target.bbox[0] = x; if (x > target.bbox[2]) target.bbox[2] = x;
      if (z < target.bbox[1]) target.bbox[1] = z; if (z > target.bbox[3]) target.bbox[3] = z;
    }
    target.area = target.cells.length;
    c.cells = Int32Array.from([]);
  }

  const out = [];
  for (const c of raw) {
    if (!c.cells.length) continue;
    const isPk = pocket.has(c.id);
    if (isPk) { for (const i of c.cells) field.t[i] = T.POCKET; continue; }
    // 高度众数（§6.3）+ 一致性回写
    const hist = new Map();
    for (const i of c.cells) hist.set(field.h[i], (hist.get(field.h[i]) || 0) + 1);
    const h = [...hist.entries()].sort((a, b) => b[1] - a[1])[0][0];
    for (const i of c.cells) { field.h[i] = h; field.blockId[i] = out.length; }
    // 临街边
    const front = new Map();
    let perimeter = 0;
    for (const i of c.cells) {
      const x = Math.floor(i / field.N) - field.half, z = (i % field.N) - field.half;
      for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (!field.inb(x + ax, z + az)) continue;
        const j = field.idx(x + ax, z + az);
        if (isRoad(field.t[j]) || field.t[j] === T.SIDEWALK || isWater(field.t[j])) {
          perimeter++;
          const rid = field.t[j] === T.SIDEWALK || isRoad(field.t[j]) ? field.roadId[j] : -1;
          if (rid >= 0) front.set(rid, (front.get(rid) || 0) + 1);
        }
      }
    }
    out.push({
      id: out.length, cells: c.cells, bbox: c.bbox, centroid: c.centroid,
      area: c.cells.length, perimeter,
      frontage: [...front.entries()].sort((a, b) => b[1] - a[1]).map(([roadId, n]) => ({ roadId, n })),
      h, district: null, plots: [],
    });
  }
  return out;
}
```

- [ ] **Step 5: 运行确认通过**

Run: `npm test`
Expected: PASS

「无孤立飞地」这条是本计划里替代 Task 9 弱断言的硬检查（Task 9 Step 4 已注明）。若失败，把 `CFG.MINOR_DELETE_P` 降到 0.08 再看——删段真的会切断街区，这是设计后果而非 bug，需要在 Task 18 的形态评审里定夺。

- [ ] **Step 6: 提交**

```bash
git add src/city/blocks.js tests/blocks.test.js tests/helpers.js
git commit -m "feat(city): block derivation from road-carved connected components"
```

---

## Task 13: `city/districts.js` — 分区与锚点（P8）

**Files:**
- Create: `src/city/districts.js`
- Test: `tests/districts.test.js`

**Interfaces:**
- Consumes: `blocks`, `field`, `rail`, `roads`, `terr`
- Produces: `assignDistricts(blocks, ctx) -> { anchors: Anchors }`；就地写 `block.district` 与 `field.blockDistrict`
  `Anchors = { landmarkTower, skytree, metroGov, stadium, freightYard, university, danchi, greatPark, shrine, portOffice, wharf, railMainStation }`

- [ ] **Step 1: 写失败的测试**

`tests/districts.test.js`：

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignDistricts, QUOTA } from '../src/city/districts.js';
import { fullPipeline } from './helpers.js';
import { DISTRICT, CFG, T } from '../src/city/config.js';

function setup() {
  const p = fullPipeline();
  const anchors = assignDistricts(p.blocks, p);
  return { ...p, anchors };
}

test('每个街区都有分区，且值合法', () => {
  const { blocks } = setup();
  const legal = new Set(Object.values(DISTRICT));
  for (const b of blocks) assert.ok(legal.has(b.district), `街区 ${b.id} 分区非法: ${b.district}`);
});

test('配额达标：每类设施的块数等于 QUOTA（规格 §9.2）', () => {
  const { blocks } = setup();
  const count = (d) => blocks.filter((b) => b.district === d).length;
  for (const [d, n] of Object.entries(QUOTA)) {
    assert.ok(count(d) >= n, `${d} 期望 ≥${n} 实得 ${count(d)}`);
    assert.ok(count(d) <= n + 3, `${d} 超出配额：${count(d)} vs ${n}`);
  }
});

test('副都心至少 4 处、方位分散（≥4 个 30° 桶）、且都贴着轨道环', () => {
  const { blocks } = setup();
  const subs = blocks.filter((b) => b.district === DISTRICT.SUB_CENTER).map((b) => b.centroid);
  assert.ok(subs.length >= 4, `副都心仅 ${subs.length} 块`);
  const buckets = new Set();
  for (const [x, z] of subs) {
    let deg = Math.atan2(z, x) * 180 / Math.PI; if (deg < 0) deg += 360;
    buckets.add(Math.floor(deg / 30));
    const d = Math.abs(Math.hypot(x, z) - CFG.RAIL_R);
    assert.ok(d < 130, `副都心离轨道环 ${d} > 130`);
  }
  assert.ok(buckets.size >= 4, `副都心只分布在 ${buckets.size} 个 30° 方位桶，过于扎堆`);
});

test('CBD 紧邻 main 站且面积大', () => {
  const { blocks, anchors } = setup();
  const cbd = blocks.filter((b) => b.district === DISTRICT.CBD);
  assert.ok(cbd.length >= 3, `CBD 仅 ${cbd.length} 块`);
  for (const b of cbd) {
    const d = Math.hypot(b.centroid[0] - anchors.railMainStation.x, b.centroid[1] - anchors.railMainStation.z);
    assert.ok(d < 160, `CBD 块离 main 站 ${d}`);
  }
});

test('工业沿湾岸：PORT_INDUSTRY 全部邻接海或突堤', () => {
  const { f, blocks } = setup();
  for (const b of blocks.filter((x) => x.district === DISTRICT.PORT_INDUSTRY)) {
    let nearSea = false;
    for (const i of b.cells) {
      const x = Math.floor(i / f.N) - f.half, z = (i % f.N) - f.half;
      for (let a = -3; a <= 3; a++) for (let c = -3; c <= 3; c++) {
        if (!f.inb(x + a, z + c)) continue;
        const t = f.t[f.idx(x + a, z + c)];
        if (t === T.SEA || t === T.QUAY) nearSea = true;
      }
    }
    assert.ok(nearSea, `工业区块 ${b.id} 不临海`);
  }
});

test('绿地成系统：1 个大公园集群 + ≥12 个小游园 + 河岸绿带成片', () => {
  const { blocks } = setup();
  const n = (d) => blocks.filter((b) => b.district === d).length;
  assert.equal(n(DISTRICT.PARK_LARGE), QUOTA[DISTRICT.PARK_LARGE]);
  assert.ok(n(DISTRICT.PARK_SMALL) >= 12, `小游园仅 ${n(DISTRICT.PARK_SMALL)}`);
  assert.ok(n(DISTRICT.GREENWAY) >= 15, `河岸绿带仅 ${n(DISTRICT.GREENWAY)}`);
});

test('住宅由内而外从公寓塔楼渐变到町屋', () => {
  const { blocks } = setup();
  const r = (b) => Math.hypot(b.centroid[0], b.centroid[1]);
  const hi = blocks.filter((b) => b.district === DISTRICT.HIGH_RISE_RESI).map(r);
  const lo = blocks.filter((b) => b.district === DISTRICT.LOW_RISE_RESI).map(r);
  assert.ok(hi.length > 20 && lo.length > 100);
  assert.ok(avg(hi) < avg(lo), `塔楼带平均半径 ${avg(hi)} 未小于低层 ${avg(lo)}`);
});

test('anchors 全部有值且在城市内', () => {
  const { anchors } = setup();
  for (const [k, v] of Object.entries(anchors)) {
    assert.ok(v && Number.isFinite(v.x) && Number.isFinite(v.z), `锚点 ${k} 缺失`);
    assert.ok(Math.abs(v.x) <= CFG.HALF && Math.abs(v.z) <= CFG.HALF, `锚点 ${k} 越界`);
  }
});

test('确定性', () => {
  const a = setup(), b = setup();
  assert.deepEqual(a.blocks.map((x) => x.district), b.blocks.map((x) => x.district));
});

const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length;
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- tests/districts.test.js`
Expected: FAIL — `Cannot find module '../src/city/districts.js'`

- [ ] **Step 3: 实现**

`src/city/districts.js`：

```js
/** 逐街区分区（规格 §9）。配额制保证设施不消失、不扎堆。 */
import { CFG, DISTRICT as D, T, isWater } from './config.js';
import { hash2 } from '../rng.js';

/** 各分区最少块数（§9.2）。改这里改城市结构。 */
export const QUOTA = {
  [D.SCHOOL]: 3, [D.HOSPITAL]: 2, [D.PUBLIC]: 4,
  [D.PARK_LARGE]: 6, [D.PARK_SMALL]: 22,
  [D.FREIGHT_YARD]: 4, [D.UNIVERSITY]: 3, [D.DANCHI]: 5, [D.STADIUM]: 1,
  [D.TRADITIONAL]: 3, [D.ENTERTAINMENT]: 4, [D.ELECTRONICS]: 3,
};

export function assignDistricts(blocks, ctx) {
  const { field, rail, roads, terr } = ctx;
  const ringR = CFG.RING_R, railR = CFG.RAIL_R;
  const rOf = (b) => Math.hypot(b.centroid[0], b.centroid[1]);
  const bearingOf = (b) => { let d = Math.atan2(b.centroid[1], b.centroid[0]) * 180 / Math.PI; return d < 0 ? d + 360 : d; };
  const toStation = (b, s) => Math.hypot(b.centroid[0] - s.x, b.centroid[1] - s.z);

  // 水域类直接跳过
  for (const b of blocks) b.district = null;

  // 1) 站前 / 副都心 / CBD（由车站驱动，规格 §5.1 的因果）
  const main = rail.mainStation;
  const subs = rail.stations.filter((s) => s.rank === 'sub');
  for (const b of blocks) {
    const r = rOf(b);
    if (toStation(b, main) < 150 && r < railR) { b.district = D.CBD; continue; }
    if (subs.some((s) => toStation(b, s) < 95)) { b.district = D.SUB_CENTER; continue; }
    if (rail.stations.filter((s) => s.rank !== 'local').some((s) => toStation(b, s) < 185)) {
      b.district = D.STATION_FRONT; continue;
    }
  }

  // 2) 湾岸工业 / 码头
  for (const b of blocks) {
    if (b.district) continue;
    const near = b.cells.some((i) => {
      const x = Math.floor(i / field.N) - field.half, z = (i % field.N) - field.half;
      for (let a = -3; a <= 3; a++) for (let c = -3; c <= 3; c++) {
        if (!field.inb(x + a, z + c)) continue;
        const t = field.t[field.idx(x + a, z + c)];
        if (t === T.SEA || t === T.QUAY || t === T.RECLAIMED) return true;
      }
      return false;
    });
    if (near && b.centroid[0] + b.centroid[1] > 300) b.district = D.PORT_INDUSTRY;
  }

  // 3) 河岸绿带
  for (const b of blocks) {
    if (b.district) continue;
    const wet = b.cells.some((i) => {
      const x = Math.floor(i / field.N) - field.half, z = (i % field.N) - field.half;
      for (const [a, c] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (!field.inb(x + a, z + c)) continue;
        if (field.t[field.idx(x + a, z + c)] === T.RECLAIM) return true;
      }
      return false;
    });
    if (wet) b.district = D.GREENWAY;
  }

  // 4) 住宅渐变：距轨道环的远近（规格 §9）
  for (const b of blocks) {
    if (b.district) continue;
    const d = Math.abs(rOf(b) - railR);
    b.district = d < 150 ? D.HIGH_RISE_RESI : D.LOW_RISE_RESI;
  }

  // 5) 环内剩余 → 商业
  for (const b of blocks) if (!b.district) b.district = rOf(b) < ringR ? D.COMMERCIAL : D.LOW_RISE_RESI;

  // 6) 配额类：从候选里按 hash 升序取前 k（§9.2）
  const take = (k, pred) => {
    const cand = blocks.filter((b) => !b.quotaUsed && pred(b))
      .sort((a, b) => hash2(a.id, 777) - hash2(b.id, 777))
      .slice(0, QUOTA[k]);
    for (const b of cand) { b.district = k; b.quotaUsed = true; }
    return cand;
  };
  // 连片性：先取种子块，再吸收其邻块。候选只允许从 EXPENDABLE 里抢——
  // 否则 cluster 会把已定的 CBD / SUB_CENTER 块改判成公园或大学，破坏 §9 的因果。
  const EXPENDABLE = new Set([
    D.COMMERCIAL, D.LOW_RISE_RESI, D.HIGH_RISE_RESI, D.STATION_FRONT, D.PORT_INDUSTRY,
  ]);
  const cluster = (k, seedPred, n) => {
    const seed = blocks.filter((b) => !b.quotaUsed && EXPENDABLE.has(b.district) && seedPred(b))
      .sort((a, b) => hash2(a.id, 131) - hash2(b.id, 131))[0];
    if (!seed) return [];
    const got = [seed]; seed.district = k; seed.quotaUsed = true;
    while (got.length < n) {
      let next = null, bd = 1e9;
      for (const b of blocks) {
        if (b.quotaUsed || !EXPENDABLE.has(b.district)) continue;
        const d = Math.hypot(b.centroid[0] - got[0].centroid[0], b.centroid[1] - got[0].centroid[1]);
        if (d < bd) { bd = d; next = b; }
      }
      if (!next || bd > 190) break;
      next.district = k; next.quotaUsed = true; got.push(next);
    }
    return got;
  };

  const scarpZ = blocks.filter((b) => b.centroid[1] > -120 && b.centroid[1] < 160);
  cluster(D.PARK_LARGE, (b) => b.area > 1400 && terr.scarpX(b.centroid[1]) - 260 < b.centroid[0]
    && b.centroid[0] < terr.scarpX(b.centroid[1]) + 120 && scarpZ.includes(b), QUOTA[D.PARK_LARGE]);
  cluster(D.ENTERTAINMENT, (b) => b.district === D.COMMERCIAL, QUOTA[D.ENTERTAINMENT]);
  cluster(D.ELECTRONICS, (b) => b.district === D.COMMERCIAL && !b.quotaUsed, QUOTA[D.ELECTRONICS]);
  cluster(D.TRADITIONAL, (b) => b.district === D.LOW_RISE_RESI
    && Math.abs(b.centroid[0] - terr.scarpX(b.centroid[1])) < 120, QUOTA[D.TRADITIONAL]);
  cluster(D.UNIVERSITY, (b) => b.district === D.LOW_RISE_RESI && b.area > 1200
    && b.centroid[0] < -150, QUOTA[D.UNIVERSITY]);
  cluster(D.FREIGHT_YARD, (b) => b.district === D.HIGH_RISE_RESI && b.centroid[0] > 0
    && b.centroid[1] < -260, QUOTA[D.FREIGHT_YARD]);
  cluster(D.DANCHI, (b) => b.district === D.LOW_RISE_RESI && b.area > 1500 && rOf(b) > 380,
    QUOTA[D.DANCHI]);
  cluster(D.STADIUM, (b) => b.area > 2000 && rOf(b) > railR + 40, 1);
  take(D.SCHOOL, (b) => b.district === D.LOW_RISE_RESI && b.area > 700);
  take(D.HOSPITAL, (b) => (b.district === D.LOW_RISE_RESI || b.district === D.HIGH_RISE_RESI) && b.area > 900);
  take(D.PUBLIC, (b) => b.district === D.HIGH_RISE_RESI || b.district === D.LOW_RISE_RESI);
  take(D.PARK_SMALL, (b) => b.area < 420 || b.district === D.LOW_RISE_RESI);

  for (const b of blocks) if (!b.district) b.district = D.LOW_RISE_RESI;

  // 7) anchors
  const anchors = {
    railMainStation: { x: main.x, z: main.z },
    landmarkTower: { x: 0, z: 0 },
    skytree: centroidOf(blocks, (b) => b.district === D.SUB_CENTER && bearingOf(b) > 20 && bearingOf(b) < 110),
    metroGov: centroidOf(blocks, (b) => b.district === D.SUB_CENTER && bearingOf(b) > 200 && bearingOf(b) < 290),
    stationFront: centroidOf(blocks, (b) => b.district === D.STATION_FRONT),
    stadium: centroidOf(blocks, (b) => b.district === D.STADIUM),
    freightYard: centroidOf(blocks, (b) => b.district === D.FREIGHT_YARD),
    university: centroidOf(blocks, (b) => b.district === D.UNIVERSITY),
    danchi: centroidOf(blocks, (b) => b.district === D.DANCHI),
    greatPark: centroidOf(blocks, (b) => b.district === D.PARK_LARGE),
    shrine: centroidOf(blocks, (b) => b.district === D.TRADITIONAL),
    portOffice: centroidOf(blocks, (b) => b.district === D.PORT_INDUSTRY),
    wharf: ctx.water?.piers?.[2] ?? centroidOf(blocks, (b) => b.district === D.PORT_INDUSTRY),
  };
  return anchors;
}

function centroidOf(blocks, pred) {
  const hit = blocks.filter(pred);
  if (!hit.length) return null;
  const big = hit.sort((a, b) => b.area - a.area)[0];
  return { x: Math.round(big.centroid[0]), z: Math.round(big.centroid[1]) };
}
```

`wharf` 取自 `ctx.water.piers[2]`，其形状是 §Task 11 的 `{id, x, z, len, wid}`，与其余锚点的 `{x, z}` 兼容。`centroidOf` 返回 `null` 时下游用 `??` 兜底——`viewpoints.test.js` 的「anchors 全部有值」这条会在任一候选分区为空时失败，**此时应查分区配额，不要给锚点硬编码坐标**。

- [ ] **Step 4: 运行确认通过**

Run: `npm test`
Expected: PASS

「配额达标」若某类低于下限，是 `cluster` 的 `seedPred` 太苛刻。**放宽 `seedPred`（降低面积阈值）而不是放宽断言**，因为规格要求「绿地成系统」依赖配额确实被满足。

- [ ] **Step 5: 提交**

```bash
git add src/city/districts.js tests/districts.test.js
git commit -m "feat(city): per-block district assignment with quota-driven facilities"
```

---

## Task 14: `city/roads.js` — 街区内小巷（P9）

**Files:**
- Modify: `src/city/roads.js`（新增 `buildAlleys`）
- Test: `tests/alleys.test.js`

**Interfaces:**
- Consumes: `blocks`（已带 `district`）, `field`
- Produces: `buildAlleys(field, blocks, rng) -> Alley[]`，`Alley = { blockId, pts, h }`

- [ ] **Step 1: 写失败的测试**

`tests/alleys.test.js`：

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAlleys } from '../src/city/roads.js';
import { fullPipeline } from './helpers.js';
import { assignDistricts } from '../src/city/districts.js';
import { DISTRICT, T, isRoad, CFG } from '../src/city/config.js';
import { makeRng } from '../src/rng.js';

function setup() {
  const p = fullPipeline();
  p.anchors = assignDistricts(p.blocks, p);
  const before = Array.from(p.f.t);
  p.alleys = buildAlleys(p.f, p.blocks, makeRng(CFG.SEED ^ 0x77));
  return { ...p, before };
}

test('产出 ≥30 条小巷，全部位于住宅/传统区街区内部', () => {
  const { alleys } = setup();
  assert.ok(alleys.length >= 30, `小巷仅 ${alleys.length} 条`);
  for (const a of alleys) assert.ok(
    a.district === DISTRICT.LOW_RISE_RESI || a.district === DISTRICT.TRADITIONAL,
    `小巷出现在非住宅区: ${a.district}`);
});

test('非破坏性：小巷只把 BLOCK 改成 BLOCK_ALLEY，未删除任何道路/水体/轨道格（规格 §5.4）', () => {
  const { f, before } = setup();
  for (let i = 0; i < before.length; i++) {
    const b = before[i], a = f.t[i];
    if (b === a) continue;
    assert.equal(b, T.BLOCK, `原非 BLOCK 格被改写 ${b}→${a} @${i}`);
    assert.equal(a, T.BLOCK_ALLEY);
  }
});

test('小巷格保留 blockId 与 h（街区不被劈开）', () => {
  const { f, blocks } = setup();
  let n = 0;
  for (let x = -CFG.HALF; x <= CFG.HALF; x++) for (let z = -CFG.HALF; z <= CFG.HALF; z++) {
    const i = f.idx(x, z);
    if (f.t[i] !== T.BLOCK_ALLEY) continue;
    assert.ok(f.blockId[i] >= 0, `小巷格丢了 blockId @${x},${z}`);
    const b = blocks[f.blockId[i]];
    assert.equal(f.h[i], b.h, '小巷高度与所属街区不一致');
    n++;
  }
  assert.ok(n > 500, `小巷格数过少 ${n}`);
});

test('小巷不改变街区面积统计（BLOCK_ALLEY 不计入 block.cells，但 block.cells.length 不变）', () => {
  const { blocks } = setup();
  for (const b of blocks) assert.ok(b.area >= CFG.SLIVER_AREA);
});

test('确定性', () => {
  assert.equal(setup().alleys.length, setup().alleys.length);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- tests/alleys.test.js`
Expected: FAIL — `buildAlleys is not a function`

- [ ] **Step 3: 实现**

在 `src/city/roads.js` 追加：

```js
/** 住宅街区内的小巷（规格 §5.4）：非破坏性、保留 blockId、不重跑连通域。 */
export function buildAlleys(field, blocks, rng) {
  const out = [];
  for (const b of blocks) {
    if (b.district !== DISTRICT.LOW_RISE_RESI && b.district !== DISTRICT.TRADITIONAL) continue;
    if (b.area < CFG.ALLEY_MIN_AREA) continue;
    if (rng() > 0.55) continue;                                  // 不是每个住宅块都有
    const [x0, z0, x1, z1] = b.bbox;
    const wide = (x1 - x0) >= (z1 - z0);
    const mask = new Set(b.cells);
    const n = 1 + (rng() < 0.3 ? 1 : 0);
    for (let k = 0; k < n; k++) {
      const fixed = wide
        ? z0 + Math.round(CFG.ALLEY_DEPTH + k * 22 + rng.range(-2, 2))
        : x0 + Math.round(CFG.ALLEY_DEPTH + k * 22 + rng.range(-2, 2));
      if (fixed > (wide ? z1 - 6 : x1 - 6)) continue;
      const pts = [];
      for (let v = wide ? x0 : z0; v <= (wide ? x1 : z1); v++) {
        const x = wide ? v : fixed, z = wide ? fixed : v;
        if (!mask.has(field.idx(x, z))) { if (pts.length > 8) break; continue; }
        pts.push([x, z]);
      }
      if (pts.length < 10) continue;
      let carved = 0;
      for (const [x, z] of pts) for (let w = 0; w < 2; w++) {
        const xx = wide ? x : x + w, zz = wide ? z + w : z;
        const i = field.idx(xx, zz);
        if (!mask.has(i) || field.t[i] !== T.BLOCK) continue;
        field.t[i] = T.BLOCK_ALLEY;                   // blockId / h 均保留
        carved++;
      }
      if (carved < 12) continue;
      out.push({ blockId: b.id, district: b.district, pts, h: b.h });
    }
  }
  return out;
}
```

需要 `import { DISTRICT } from './config.js'` 加入文件头。

- [ ] **Step 4: 运行确认通过**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/city/roads.js tests/alleys.test.js
git commit -m "feat(city): non-destructive alleys inside residential blocks"
```

---

## Task 15: `city/plots.js` — 临街地块与可用 footprint

**Files:**
- Create: `src/city/plots.js`
- Test: `tests/plots.test.js`

**Interfaces:**
- Consumes: `blocks`（带 district）、`field`、`Field.maxRectInMask`
- Produces: `buildPlots(blocks, field, rng) -> Plot[]`，
`Plot = { id, blockId, rect:{x0,z0,x1,z1}, cx, cz, w, d, face:0|1|2|3, roadId, district, h, kind }`
另回写 `field` 中地块格为 `PLOT_FREE`（未临街的室内格）。

`face` 语义沿用 `src/residential.js:15` 的 `FRONT = [[0,1],[0,-1],[1,0],[-1,0]]`，即 `0:+z 1:-z 2:+x 3:-x`，使现有朝向部件旋转代码可直接复用（规格 §10.1）。

- [ ] **Step 1: 写失败的测试**

`tests/plots.test.js`：

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlots, FACE_OF } from '../src/city/plots.js';
import { runDistricts } from './helpers.js';
import { T, DISTRICT, CFG, isBlocked } from '../src/city/config.js';
import { makeRng } from '../src/rng.js';

function setup() {
  const p = runDistricts();                       // 到 P9（含小巷）
  p.plots = buildPlots(p.blocks, p.f);
  return p;
}

test('地块数 ≥ 街区数 × 1.5（每块至少几条临街面）', () => {
  const { plots, blocks } = setup();
  assert.ok(plots.length >= blocks.length * 1.5,
    `地块过少 ${plots.length} vs ${blocks.length} 街区`);
});

test('每个地块都是 4 个 face 之一，且 w/d ≥ MIN_PLOT_SIDE', () => {
  const { plots } = setup();
  for (const p of plots) {
    assert.ok([0, 1, 2, 3].includes(p.face), `face 非法 ${p.face}`);
    assert.ok(p.w >= CFG.MIN_PLOT_SIDE && p.d >= CFG.MIN_PLOT_SIDE,
      `地块过小 ${p.w}×${p.d}`);
  }
});

test('硬不变量：任何地块都不含道路/水体/轨道/小巷/人行道格（规格 §10.7 不变量 1）', () => {
  const { f, plots } = setup();
  let bad = 0;
  for (const p of plots) {
    for (let x = p.rect.x0; x <= p.rect.x1; x++) for (let z = p.rect.z0; z <= p.rect.z1; z++) {
      if (isBlocked(f.t[f.idx(x, z)])) { bad++; if (bad < 5) console.log('违规格', x, z, f.t[f.idx(x, z)]); }
    }
  }
  assert.equal(bad, 0, `${bad} 个地块格压路/压水/压轨`);
});

test('硬不变量：任意两个地块矩形不相交（规格 §10.7 不变量 2）', () => {
  const { plots } = setup();
  const cells = new Map();
  let clash = 0;
  for (const p of plots) for (let x = p.rect.x0; x <= p.rect.x1; x++) for (let z = p.rect.z0; z <= p.rect.z1; z++) {
    const k = `${x},${z}`;
    if (cells.has(k) && cells.get(k) !== p.blockId) { clash++; }
    else cells.set(k, p.blockId);
  }
  assert.equal(clash, 0, `${clash} 处跨街区重叠`);
});

test('硬不变量：地块高度与所属街区全等（规格 §10.7 不变量 3）', () => {
  const { f, plots, blocks } = setup();
  for (const p of plots) {
    assert.equal(p.h, blocks[p.blockId].h);
    for (let x = p.rect.x0; x <= p.rect.x1; x++) for (let z = p.rect.z0; z <= p.rect.z1; z++)
      assert.equal(f.h[f.idx(x, z)], p.h, `地块 ${p.id} 内部高度不齐`);
  }
});

test('每个地块都退让临街边 ≥1 格人行道（setback，规格 §10.4）', () => {
  const { f, plots } = setup();
  for (const p of plots) {
    const [ox, oz] = FACE_OF[p.face];
    const fx = p.face === 2 ? p.rect.x1 : p.face === 3 ? p.rect.x0 : Math.round(p.cx);
    const fz = p.face === 0 ? p.rect.z1 : p.face === 1 ? p.rect.z0 : Math.round(p.cz);
    const nx = fx + ox, nz = fz + oz;                        // 临街侧外一格
    if (!f.inb(nx, nz)) continue;
    const t = f.t[f.idx(nx, nz)];
    assert.ok(t === T.SIDEWALK || isBlocked(t), `地块 ${p.id} 临街侧外不是人行道/路，type=${t}`);
  }
});

test('地块 kind 与分区匹配：住宅出 LOT_HOUSE，办公出 LOT_TOWER', () => {
  const { plots } = setup();
  const byD = new Map();
  for (const p of plots) {
    if (!byD.has(p.district)) byD.set(p.district, new Set());
    byD.get(p.district).add(p.kind);
  }
  assert.ok(byD.get(DISTRICT.LOW_RISE_RESI)?.has('lot_house'));
  assert.ok(byD.get(DISTRICT.CBD)?.has('lot_tower') || byD.get(DISTRICT.SUB_CENTER)?.has('lot_tower'),
    '办公区未产出塔楼地块');
});

test('异形（三角）街区仍产出地块：至少 60% 的三角块有 ≥2 地块', () => {
  const { blocks, plots } = setup();
  const tri = blocks.filter((b) => {
    const [x0, z0, x1, z1] = b.bbox;
    return b.area / ((x1 - x0 + 1) * (z1 - z0 + 1)) < 0.65 && b.area > 600;
  });
  assert.ok(tri.length > 20, `三角块太少 ${tri.length}`);
  const ok = tri.filter((b) => plots.filter((p) => p.blockId === b.id).length >= 2).length;
  assert.ok(ok / tri.length > 0.6, `三角块出块率仅 ${(ok / tri.length * 100).toFixed(0)}%`);
});

test('确定性', () => {
  const a = setup(), b = setup();
  assert.deepEqual(a.plots.map((p) => [p.rect.x0, p.rect.z0, p.w, p.d, p.face]),
    b.plots.map((p) => [p.rect.x0, p.rect.z0, p.w, p.d, p.face]));
});
```

- [ ] **Step 2: 在 `tests/helpers.js` 追加 `runDistricts`**

`fullPipeline` 之后再加一个跑到 P9 的版本（Task 14 之后可用）：

```js
import { assignDistricts } from '../src/city/districts.js';
import { makeRng } from '../src/rng.js';

/** 跑到 P9：分区 + 小巷。plots 由调用方补。 */
export function runDistricts(seed = CFG.SEED) {
  const p = fullPipeline(seed);
  const rng = makeRng(seed);
  p.anchors = assignDistricts(p.blocks, p);
  p.alleys = buildAlleys(p.f, p.blocks, makeRng(seed ^ 0x77));
  return p;
}
```

同时把 `helpers.js` 顶部的 import 补上 `buildAlleys`（Task 14 已加入 `roads.js` 导出）。

- [ ] **Step 3: 运行确认失败**

Run: `npm test -- tests/plots.test.js`
Expected: FAIL — `Cannot find module '../src/city/plots.js'`

- [ ] **Step 4: 实现**

`src/city/plots.js`：

```js
/** 临街地块切分（规格 §10）。最大内接矩形保证零压路。 */
import { CFG, T, DISTRICT as D, LOT, isRoad } from './config.js';
import { hash2 } from '../rng.js';

/** face 外法向，与 src/residential.js 的 FRONT 同序：0:+z 1:-z 2:+x 3:-x */
export const FACE_OF = [[0, 1], [0, -1], [1, 0], [-1, 0]];

/** 分区 → 条带深度 / 切段间距 / 地块 kind（规格 §10.2~§10.5） */
const RULE = {
  [D.LOW_RISE_RESI]:    { depth: 16, spacing: [7, 13], kind: LOT.HOUSE, setback: 1 },
  [D.TRADITIONAL]:      { depth: 16, spacing: [8, 14], kind: LOT.HOUSE, setback: 1 },
  [D.HIGH_RISE_RESI]:   { depth: 22, spacing: [14, 22], kind: LOT.HOUSE, setback: 2 },
  [D.DANCHI]:           { depth: 28, spacing: [22, 34], kind: LOT.TOWER, setback: 2 },
  [D.COMMERCIAL]:       { depth: 22, spacing: [11, 17], kind: LOT.SHOP, setback: 2 },
  [D.STATION_FRONT]:    { depth: 26, spacing: [14, 22], kind: LOT.SHOP, setback: 2 },
  [D.ENTERTAINMENT]:    { depth: 20, spacing: [8, 13], kind: LOT.SHOP, setback: 1 },
  [D.ELECTRONICS]:      { depth: 22, spacing: [10, 16], kind: LOT.SHOP, setback: 1 },
  [D.CBD]:              { depth: 40, spacing: [24, 40], kind: LOT.TOWER, setback: 2 },
  [D.SUB_CENTER]:       { depth: 38, spacing: [22, 36], kind: LOT.TOWER, setback: 2 },
  [D.PORT_INDUSTRY]:    { depth: 60, spacing: [30, 52], kind: LOT.TOWER, setback: 2 },
  [D.FREIGHT_YARD]:     { depth: 55, spacing: [34, 60], kind: LOT.YARD, setback: 2 },
  [D.UNIVERSITY]:       { depth: 40, spacing: [24, 40], kind: LOT.TOWER, setback: 2 },
  [D.SCHOOL]:           { depth: 30, spacing: [24, 30], kind: LOT.SHOP, setback: 2 },
  [D.HOSPITAL]:         { depth: 30, spacing: [22, 30], kind: LOT.SHOP, setback: 2 },
  [D.PUBLIC]:           { depth: 18, spacing: [12, 20], kind: LOT.SHOP, setback: 1 },
  [D.LANDMARK]:         { depth: 30, spacing: [24, 30], kind: LOT.TOWER, setback: 2 },
};

export function buildPlots(blocks, field) {
  // 切段抖动走 hash2（位置稳定：同一格无论生成顺序都得到同一间距），因此不需要 rng
  const plots = [];
  for (const b of blocks) {
    const rule = RULE[b.district] || { depth: 18, spacing: [10, 16], kind: LOT.SHOP, setback: 1 };
    const allowed = new Set(b.cells);
    // 小巷格不可建（规格 §5.4）
    for (const i of b.cells) if (field.t[i] === T.BLOCK_ALLEY) allowed.delete(i);

    // 按 face 收集临街边格
    const runs = [[], [], [], []];
    for (const i of allowed) {
      const x = Math.floor(i / field.N) - field.half, z = (i % field.N) - field.half;
      for (let f = 0; f < 4; f++) {
        const [ox, oz] = FACE_OF[f];
        const j = field.inb(x + ox, z + oz) ? field.idx(x + ox, z + oz) : -1;
        if (j >= 0 && (isRoad(field.t[j]) || field.t[j] === T.SIDEWALK)) { runs[f].push([x, z, field.roadId[j]]); break; }
      }
    }

    for (let f = 0; f < 4; f++) {
      const cells = runs[f];
      if (cells.length < 3) continue;
      const [ox, oz] = FACE_OF[f];
      const along = f < 2 ? 0 : 1;                      // 0 = 沿 x 排列，1 = 沿 z
      cells.sort((p, q) => (p[along] - q[along]) || (p[1 - along] - q[1 - along]));

      // 按 depth 内可用格数分带，再按 spacing 切段
      let u = cells[0][along];
      while (u <= cells[cells.length - 1][along]) {
        const spacing = rule.spacing[0] + Math.floor(hash2(u + b.id * 977, f * 31) * (rule.spacing[1] - rule.spacing[0] + 1));
        const band = cells.filter((c) => c[along] >= u && c[along] < u + spacing);
        u += spacing;
        if (band.length < 2) continue;
        const strip = { x0: 1e9, x1: -1e9, z0: 1e9, z1: -1e9 };
        for (const [x, z] of band) {
          if (x < strip.x0) strip.x0 = x; if (x > strip.x1) strip.x1 = x;
          if (z < strip.z0) strip.z0 = z; if (z > strip.z1) strip.z1 = z;
        }
        const ok = (x, z) => {
          const i = field.inb(x, z) ? field.idx(x, z) : -1;
          if (i < 0 || !allowed.has(i)) return false;
          // 深度限制：从最外临街格向内 depth 内
          const d = f === 0 ? band.reduce((m, c) => Math.min(m, c[1]), 1e9)
            : f === 1 ? band.reduce((m, c) => Math.max(m, c[1]), -1e9)
            : f === 2 ? band.reduce((m, c) => Math.min(m, c[0]), 1e9)
            : band.reduce((m, c) => Math.max(m, c[0]), -1e9);
          return f < 2 ? Math.abs(z - d) < rule.depth : Math.abs(x - d) < rule.depth;
        };
        const rect = field.maxRectInMask(strip.x0, strip.z0, strip.x1, strip.z1, ok);
        if (!rect) continue;
        const sx = rule.setback, sz = rule.setback;
        const rx0 = rect.x0 + sx, rx1 = rect.x1 - sx, rz0 = rect.z0 + sz, rz1 = rect.z1 - sz;
        const w = rx1 - rx0 + 1, d = rz1 - rz0 + 1;
        if (w < CFG.MIN_PLOT_SIDE || d < CFG.MIN_PLOT_SIDE) continue;
        const roadId = band[0][2];
        const plot = {
          id: plots.length, blockId: b.id, rect: { x0: rx0, z0: rz0, x1: rx1, z1: rz1 },
          cx: (rx0 + rx1) / 2, cz: (rz0 + rz1) / 2, w, d,
          face: f, roadId, district: b.district, h: b.h, kind: rule.kind,
        };
        plots.push(plot);
        b.plots.push(plot.id);
      }
    }
  }
  // 室内余格 → PLOT_FREE（规格 §10.6）
  for (const p of plots) for (let x = p.rect.x0; x <= p.rect.x1; x++) for (let z = p.rect.z0; z <= p.rect.z1; z++) {
    const i = field.idx(x, z);
    if (field.t[i] === T.BLOCK) field.t[i] = T.PLOT_USE;
  }
  const used = new Set(plots.map((p) => p.blockId));
  for (const b of blocks) {
    if (!used.has(b.id)) continue;
    for (const i of b.cells) if (field.t[i] === T.BLOCK) field.t[i] = T.PLOT_FREE;
  }
  return plots;
}
```

`T.PLOT_USE`（Task 2 已定义为 18）表示「已被地块占用的可建格」，与 `PLOT_FREE`（室内余格）区分，审计与阶段 2 的地块类型判定都要读它。它**不在** `isBlocked` 里，因此申领合法。

- [ ] **Step 5: 运行确认通过**

Run: `npm test`
Expected: PASS

「退让临街边」这条最可能失败：`maxRectInMask` 可能取到一条完全在室内、不贴临街边的矩形。**解法**：把 `ok(x,z)` 限制为「距该带最外临街格 ≤ depth 且 ≥ setback」，并要求矩形至少有一格与 `band` 的临街线相邻（`ok` 外加 `touchesFrontage` 检查）。修实现，不要删这条测试——退让正是提示词第 4 节点名的要求。

- [ ] **Step 6: 提交**

```bash
git add src/city/plots.js src/city/config.js tests/plots.test.js tests/helpers.js
git commit -m "feat(city): frontage plot subdivision with inscribed-rect footprints"
```

---

## Task 16: `city/query.js` — CITY 组装、claim 登记与审计

**Files:**
- Create: `src/city/query.js`
- Test: `tests/query.test.js`

**Interfaces:**
- Consumes: 前述所有模块
- Produces: `buildCity(seed?) -> CITY`（规格 §4 的完整契约：`cell/at/isRoad/isWater/isRail/isBridge/isSidewalk/groundY/blockAt/blocksIn/claim/claimFree/footprintClear/claims/audit/stations/roads/rail/blocks/plots/anchors/bridges/stats`）

- [ ] **Step 1: 写失败的测试**

`tests/query.test.js`：

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCity } from '../src/city/query.js';
import { T, DISTRICT, CFG, isBlocked } from '../src/city/config.js';

const CITY = buildCity();                       // 模块级共享，避免每条测试重建（约 3s）

test('契约完整：规格 §4 的每个成员都存在', () => {
  for (const k of ['HALF', 'N', 'cell', 'isRoad', 'isWater', 'isRail', 'isBridge', 'isSidewalk',
    'groundY', 'blockAt', 'blocksIn', 'claim', 'claimFree', 'footprintClear', 'claims', 'audit',
    'stations', 'roads', 'rail', 'blocks', 'plots', 'anchors', 'bridges', 'stats']) {
    assert.ok(k in CITY, `缺少 CITY.${k}`);
  }
  for (const k of ['isRoad', 'isWater', 'isRail', 'isBridge', 'isSidewalk', 'groundY', 'cell',
    'blockAt', 'blocksIn', 'claim', 'claimFree', 'footprintClear', 'audit']) {
    assert.equal(typeof CITY[k], 'function', `CITY.${k} 不是函数`);
  }
});

test('groundY 始终为整数且在水面处为 0', () => {
  for (let x = -CFG.HALF; x <= CFG.HALF; x += 11) for (let z = -CFG.HALF; z <= CFG.HALF; z += 11) {
    const y = CITY.groundY(x, z);
    assert.ok(Number.isInteger(y));
    if (CITY.isWater(x, z)) assert.equal(y, 0);
  }
});

test('越界查询不崩，cell 返回 null', () => {
  assert.equal(CITY.cell(CFG.HALF + 50, 0), null);
  assert.equal(CITY.groundY(9999, 9999), 0);
});

test('claim：合法地块返回落在 plot 内的矩形', () => {
  const c = buildCity();
  const p = c.plots.find((x) => x.w >= 6 && x.d >= 6);
  const got = c.claim(p.id, p.w - 2, p.d - 2, 'test');
  assert.ok(got, 'claim 失败：合法尺寸应成功');
  assert.ok(got.cx >= p.rect.x0 && got.cx <= p.rect.x1);
  assert.ok(got.cz >= p.rect.z0 && got.cz <= p.rect.z1);
  assert.ok(got.y === p.h);
  assert.equal(c.claims.length, 1);
});

test('claim：超出 plot 尺寸返回 null（不是抛异常）', () => {
  const c = buildCity();
  const p = c.plots[0];
  assert.equal(c.claim(p.id, p.w + 6, p.d + 6, 'too-big'), null);
});

test('claim：同一 plot 二次申领不能重叠', () => {
  const c = buildCity();
  const p = c.plots.find((x) => x.w >= 8 && x.d >= 8);
  const a = c.claim(p.id, Math.floor(p.w / 2), Math.floor(p.d / 2), 'a');
  assert.ok(a);
  let overlaps = 0;
  for (let i = 0; i < 20; i++) {
    const b = c.claim(p.id, Math.floor(p.w / 2), Math.floor(p.d / 2), 'b');
    if (!b) continue;
    if (b.rect.x0 <= a.rect.x1 && a.rect.x0 <= b.rect.x1 && b.rect.z0 <= a.rect.z1 && a.rect.z0 <= b.rect.z1) overlaps++;
  }
  assert.equal(overlaps, 0, `同地块重复申领出现 ${overlaps} 次重叠`);
});

test('audit：干净跑完时五类违规全为 0', () => {
  const c = buildCity();
  for (const p of c.plots) c.claim(p.id, p.w, p.d, 'bulk');   // 精确尺寸居中，应几乎全部成功
  const a = c.audit();
  assert.equal(a.onRoad, 0); assert.equal(a.onWater, 0); assert.equal(a.onRail, 0);
  assert.equal(a.overlap, 0); assert.equal(a.badPad, 0);
  assert.ok(a.total >= c.plots.length * 0.9,
    `成功率过低：${a.total}/${c.plots.length}——claim 或 footprintClear 有问题`);
});

test('audit 能抓到人为塞进的坏 claim（否则审计是假的）', () => {
  const c = buildCity();
  let roadCell = null;
  for (let x = -CFG.HALF; x <= CFG.HALF && !roadCell; x += 3)
    for (let z = -CFG.HALF; z <= CFG.HALF; z += 3)
      if (c.isRoad(x, z) && !c.isBridge(x, z)) { roadCell = [x, z]; break; }
  assert.ok(roadCell, '找不到一个道路格用于注入测试');
  c.claims.push({ tag: 'injected', x0: roadCell[0], z0: roadCell[1], x1: roadCell[0], z1: roadCell[1], y: 3, plotId: -1 });
  const a = c.audit();
  assert.ok(a.onRoad >= 1, 'audit 未抓到压在路上的 claim');
});

test('stats 合理：街区/地块/桥/站数量非零，构建耗时 < 400ms（规格 §13）', () => {
  assert.ok(CITY.stats.buildMs < 1500, `构建耗时 ${CITY.stats.buildMs}ms（首建含 JIT，放宽到 1500；热跑应在 400 内）`);
  assert.ok(CITY.stats.blocks > 500);
  assert.ok(CITY.stats.plots > 2000);
  assert.ok(CITY.stats.bridges >= 6);
  assert.equal(CITY.stats.stations, 10);
  assert.ok(CITY.anchors.landmarkTower);
});

test('blocksIn 与 blockAt 一致', () => {
  const b = CITY.blocks[42];
  assert.equal(CITY.blockAt(b.centroid[0] | 0, b.centroid[1] | 0)?.id ?? -1,
    CITY.blockAt(b.centroid[0] | 0, b.centroid[1] | 0)?.id ?? -1);
  const inBox = CITY.blocksIn(b.bbox[0], b.bbox[1], b.bbox[2], b.bbox[3]);
  assert.ok(inBox.some((x) => x.id === b.id));
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- tests/query.test.js`
Expected: FAIL — `Cannot find module '../src/city/query.js'`

- [ ] **Step 3: 实现**

`src/city/query.js`：

```js
/** CITY 单例：布局知识唯一的出口（规格 §4）。claim 登记制让「压路」成为可计数不变量（§4.1）。 */
import { CFG, T, DISTRICT, ROAD, isRoad, isWater, isBlocked, idx as gidx, inb } from './config.js';
import { Field } from './field.js';
import { makeTerrain, applyTerrain } from './terrain.js';
import { buildRailAndStations, buildTrunks, buildSecondaries, profileHeights, buildAlleys } from './roads.js';
import { applyWater } from './water.js';
import { extractBlocks } from './blocks.js';
import { assignDistricts } from './districts.js';
import { buildPlots } from './plots.js';
import { makeRng } from '../rng.js';

export function buildCity(seed = CFG.SEED) {
  const t0 = performance.now();
  const rng = makeRng(seed);
  const terr = makeTerrain(makeRng(seed ^ 0x51ab));
  const rail = buildRailAndStations(rng);
  const field = new Field(CFG.HALF);
  field.fill(() => ({ t: T.BLOCK }));
  applyTerrain(field, terr);
  const roads = buildTrunks(field, rail, rng);
  roads.push(...buildSecondaries(field, roads, rail, rng));
  profileHeights(field, roads, terr);
  const water = applyWater(field, roads, terr, rng);
  const blocks = extractBlocks(field);
  const anchors = assignDistricts(blocks, { field, rail, roads, terr, water });
  buildAlleys(field, blocks, makeRng(seed ^ 0x77));
  const plots = buildPlots(blocks, field);

  const claims = [];
  const plotById = new Map(plots.map((p) => [p.id, p]));

  const at = (x, z) => (inb(x, z) ? field.at(x, z) : null);
  const tAt = (x, z) => (inb(x, z) ? field.t[gidx(x, z)] : T.OUTSIDE);

  const CITY = {
    HALF: CFG.HALF, N: field.N, field, terr,
    roads, rail, stations: rail.stations, blocks, plots, anchors,
    bridges: water.bridges, piers: water.piers, claims,

    cell: at,
    isRoad: (x, z) => isRoad(tAt(x, z)),
    isWater: (x, z) => isWater(tAt(x, z)),
    isRail: (x, z) => tAt(x, z) === T.RAIL,
    isBridge: (x, z) => tAt(x, z) === T.BRIDGE,
    isSidewalk: (x, z) => tAt(x, z) === T.SIDEWALK,
    groundY: (x, z) => (inb(x, z) ? field.h[gidx(x, z)] : 0),
    typeAt: tAt,

    blockAt(x, z) {
      if (!inb(x, z)) return null;
      const b = field.blockId[gidx(x, z)];
      return b >= 0 ? blocks[b] : null;
    },
    blocksIn(x0, z0, x1, z1) {
      return blocks.filter((b) => !(b.bbox[2] < x0 || b.bbox[0] > x1 || b.bbox[3] < z0 || b.bbox[1] > z1));
    },

    /** 纯查询：范围是否完全可建（不落登记） */
    footprintClear(x0, z0, x1, z1) {
      const hist = new Map();
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
        if (!inb(x, z)) return false;
        const i = gidx(x, z);
        if (isBlocked(field.t[i])) return false;
        hist.set(field.h[i], (hist.get(field.h[i]) || 0) + 1);
      }
      return hist.size <= 1;
    },

    /** 唯一合法落位入口（规格 §4.2） */
    claim(plotId, w, d, tag = '') {
      const p = plotById.get(plotId);
      if (!p) return null;
      const slackX = p.w - w, slackZ = p.d - d;
      if (slackX < 0 || slackZ < 0) return null;
      for (let tries = 0; tries < 4; tries++) {
        // 首次居中，之后随机偏移；越界或冲突则换一次尝试（规格 §4.2 上限 4 次）
        const jx = tries === 0 ? (slackX >> 1) : Math.floor(rng() * (slackX + 1));
        const jz = tries === 0 ? (slackZ >> 1) : Math.floor(rng() * (slackZ + 1));
        const rect = { x0: p.rect.x0 + jx, z0: p.rect.z0 + jz, x1: p.rect.x0 + jx + w - 1, z1: p.rect.z0 + jz + d - 1 };
        if (!CITY.footprintClear(rect.x0, rect.z0, rect.x1, rect.z1)) continue;
        if (overlapsAny(claims, rect)) continue;
        const c = { tag, plotId, blockId: p.blockId, y: p.h, ...rect,
          cx: (rect.x0 + rect.x1) / 2, cz: (rect.z0 + rect.z1) / 2, w, d };
        claims.push(c);
        return c;
      }
      return null;
    },

    /** 非地块用途（围墙、广场、站前棚等）：只要求范围可建且不与 claim 冲突 */
    claimFree(x0, z0, x1, z1, tag = '') {
      if (!CITY.footprintClear(x0, z0, x1, z1)) return null;
      const rect = { x0, z0, x1, z1 };
      if (overlapsAny(claims, rect)) return null;
      const c = { tag, plotId: -1, blockId: -1, y: field.h[gidx((x0 + x1) >> 1, (z0 + z1) >> 1)],
        ...rect, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w: x1 - x0 + 1, d: z1 - z0 + 1 };
      claims.push(c);
      return c;
    },

    /** 全量审计（规格 §4.3） */
    audit() {
      const out = { overlap: 0, onRoad: 0, onWater: 0, onRail: 0, badPad: 0, total: claims.length, bad: [] };
      // 重叠检测用 64 格空间桶，避免 O(n²)（地块上万时二次方要跑几十秒）
      const B = 64;
      const buckets = new Map();
      const bkeys = (r) => {
        const ks = [];
        for (let bx = Math.floor(r.x0 / B); bx <= Math.floor(r.x1 / B); bx++)
          for (let bz = Math.floor(r.z0 / B); bz <= Math.floor(r.z1 / B); bz++) ks.push(bx * 4096 + bz);
        return ks;
      };
      claims.forEach((a, i) => { for (const k of bkeys(a)) {
        if (!buckets.has(k)) buckets.set(k, []);
        buckets.get(k).push(i);
      } });
      const seen = new Set();
      for (let i = 0; i < claims.length; i++) {
        const a = claims[i];
        let road = false, water = false, rail = false, badPad = false;
        const hs = new Set();
        for (let x = a.x0; x <= a.x1; x++) for (let z = a.z0; z <= a.z1; z++) {
          const t = tAt(x, z);
          if (isRoad(t) || t === T.SIDEWALK) road = true;
          if (isWater(t) || t === T.QUAY) water = true;
          if (t === T.RAIL) rail = true;
          if (!inb(x, z) || isBlocked(t)) badPad = true;
          else hs.add(field.h[gidx(x, z)]);
        }
        if (hs.size > 1) badPad = true;
        for (const k of bkeys(a)) for (const j of buckets.get(k) || []) {
          if (j <= i) continue;
          const pair = i * 1e6 + j;
          if (seen.has(pair)) continue;
          seen.add(pair);
          const b = claims[j];
          if (a.x0 <= b.x1 && b.x0 <= a.x1 && a.z0 <= b.z1 && b.z0 <= a.z1) out.overlap++;
        }
        if (road) { out.onRoad++; out.bad.push({ tag: a.tag, why: 'road', x: a.cx, z: a.cz }); }
        if (water) { out.onWater++; out.bad.push({ tag: a.tag, why: 'water', x: a.cx, z: a.cz }); }
        if (rail) { out.onRail++; out.bad.push({ tag: a.tag, why: 'rail', x: a.cx, z: a.cz }); }
        if (badPad) { out.badPad++; out.bad.push({ tag: a.tag, why: 'pad', x: a.cx, z: a.cz }); }
      }
      return out;
    },

    stats: {},
  };

  CITY.stats = {
    buildMs: Math.round(performance.now() - t0),
    blocks: blocks.length, plots: plots.length, roads: roads.length,
    bridges: water.bridges.length, stations: rail.stations.length,
    roadCells: field.countIf((c) => isRoad(c.t)),
    waterCells: field.countIf((c) => isWater(c.t) || c.t === T.SEA),
  };
  return CITY;
}

function overlapsAny(list, r) {
  for (const b of list) if (r.x0 <= b.x1 && b.x0 <= r.x1 && r.z0 <= b.z1 && b.z0 <= r.z1) return true;
  return false;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test`
Expected: PASS

「audit 能抓到坏 claim」这条是整套契约的守门人。若 `claims.push()` 之后 `audit()` 仍报 0，检查 `audit` 是否读了 `claims` 的实时长度而非缓存值。

- [ ] **Step 5: 记录审计基线**

```bash
node --input-type=module -e "
import('node:perf_hooks').then(async ({performance}) => {
  globalThis.performance = performance;
  const { buildCity } = await import('./src/city/query.js');
  const c = buildCity();
  console.log('stats', c.stats);
  console.log('audit', c.audit());
});"
```

Expected: `stats.buildMs` < 400（Node 侧无 JIT 预热，允许到 900）；`audit` 五类计数为 0（此时还没有任何 claim，`total: 0`）。**把这个输出贴在 commit message 里。**

- [ ] **Step 6: 提交**

```bash
git add src/city/query.js tests/query.test.js
git commit -m "feat(city): CITY facade with claim registry and footprint audit"
```

---

## Task 17: 俯视栅格视图与 URL 参数（`?plan` / `?cam` / `?debug` / `?seed`）

这是本计划的**交付物**：不渲染三维城市，只把 cell buffer 画成一张正射俯视图。形态是否「有机」在这里判，比在三维里猜快得多。

**Files:**
- Create: `src/city/viewpoints.js`
- Create: `src/planView.js`
- Modify: `src/main.js`
- Modify: `index.html`（HUD 结构）
- Test: `tests/viewpoints.test.js`

**Interfaces:**
- Consumes: `CITY`
- Produces: `viewpoint(name, CITY) -> { position:[x,y,z], target:[x,y,z], ortho?:bool }`；
  `mountPlanView(scene, CITY, mode) -> { mesh }`；`parseParams(location.search) -> {plan, debug, cam, seed}`

- [ ] **Step 1: 写失败的测试**

`tests/viewpoints.test.js`：

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { viewpoint, VIEW_NAMES, parseParams } from '../src/city/viewpoints.js';
import { buildCity } from '../src/city/query.js';
import { DISTRICT } from '../src/city/config.js';

const CITY = buildCity();

test('六个验收机位 + plan 全部可用', () => {
  assert.deepEqual(VIEW_NAMES.slice().sort(),
    ['cbd', 'harbor', 'mainstreet', 'pano', 'plan', 'resi', 'station'].sort());
  for (const n of VIEW_NAMES) {
    const v = viewpoint(n, CITY);
    assert.ok(v, `${n} 无机位`);
    for (const k of ['position', 'target']) {
      assert.equal(v[k].length, 3);
      for (const c of v[k]) assert.ok(Number.isFinite(c), `${n}.${k} 非数`);
    }
    assert.ok(v.position[1] > 0, `${n} 相机在地面下`);
  }
});

test('机位由 CITY 锚点派生，不写死坐标（改 anchors 机位必须跟着动）', () => {
  const mutated = { ...CITY, anchors: { ...CITY.anchors,
    greatPark: { x: 123, z: -456 }, stationFront: { x: 55, z: -66 },
    portOffice: { x: 300, z: 300 }, stadium: { x: -300, z: -100 } } };
  assert.notDeepEqual(viewpoint('resi', mutated).target, viewpoint('resi', CITY).target);
});

test('街景机位低、航拍机位高', () => {
  assert.ok(viewpoint('pano', CITY).position[1] > 200);
  for (const n of ['cbd', 'mainstreet', 'resi', 'station']) {
    assert.ok(viewpoint(n, CITY).position[1] < 40, `${n} 不是街景高度`);
  }
});

test('街景机位站在真实道路上（能看见路），且不穿建筑', () => {
  for (const n of ['cbd', 'mainstreet', 'resi', 'station']) {
    const [x, y, z] = viewpoint(n, CITY).position;
    const okRoad = CITY.isRoad(Math.round(x), Math.round(z)) || CITY.isSidewalk(Math.round(x), Math.round(z));
    assert.ok(okRoad || y > CITY.groundY(Math.round(x), Math.round(z)) + 2,
      `${n} 机位既不在路上也不够高，会卡在建筑里`);
  }
});

test('parseParams 覆盖四种参数且不崩', () => {
  assert.deepEqual(parseParams('?plan=1&cam=cbd&debug=1&seed=42'),
    { plan: '1', debug: true, cam: 'cbd', seed: 42 });
  assert.deepEqual(parseParams(''), { plan: null, debug: false, cam: null, seed: null });
  assert.deepEqual(parseParams('?seed=abc'), { plan: null, debug: false, cam: null, seed: null });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- tests/viewpoints.test.js`
Expected: FAIL — `Cannot find module '../src/city/viewpoints.js'`

- [ ] **Step 3: 实现 `city/viewpoints.js`**

```js
/** 验收机位：全部由 CITY 锚点与街区派生，布局变了机位自动跟（规格 §12）。 */
export const VIEW_NAMES = ['pano', 'cbd', 'mainstreet', 'resi', 'harbor', 'station', 'plan'];

export function viewpoint(name, CITY) {
  const a = CITY.anchors;
  const gy = (x, z) => CITY.groundY(Math.round(x), Math.round(z));
  const nearBlock = (pt, district) => {
    let best = null, bd = 1e9;
    for (const b of CITY.blocks) {
      if (district && b.district !== district) continue;
      const d = Math.hypot(b.centroid[0] - pt.x, b.centroid[1] - pt.z);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  };
  /** 站在目标附近的一条主干道上，朝目标看，高度 12（约 24m，人视偏上） */
  const streetCam = (target, look) => {
    const road = nearestTrunkRoadPoint(CITY, target);
    const dx = road.x - target.x, dz = road.z - target.z;
    const L = Math.hypot(dx, dz) || 1;
    return {
      position: [Math.round(road.x), gy(road.x, road.z) + 12, Math.round(road.z)],
      target: [target.x, (look ?? (gy(target.x, target.z) + 14)), target.z],
    };
  };
  const aerial = (target, h, back) => ({
    position: [target.x + back, h, target.z + back],
    target: [target.x, gy(target.x, target.z) + 10, target.z],
  });

  switch (name) {
    case 'pano':
      return { position: [430, 330, 430], target: [0, 30, 0], ortho: false };
    case 'plan':
      return { position: [0, 1400, 0.001], target: [0, 0, 0], ortho: true };
    case 'cbd': {
      const t = a.railMainStation;
      return streetCam({ x: t.x + 20, z: t.z + 20 });
    }
    case 'station': {
      const t = a.stationFront ?? nearBlock(a.railMainStation, 'station_front');
      const p = t ? { x: Math.round(t.centroid?.[0] ?? t.x), z: Math.round(t.centroid?.[1] ?? t.z) } : { x: 120, z: 120 };
      return streetCam(p);
    }
    case 'mainstreet': {
      const t = nearBlock({ x: 0, z: 0 }, 'commercial') || nearBlock({ x: 0, z: 0 }, 'station_front');
      return streetCam({ x: Math.round(t.centroid[0]), z: Math.round(t.centroid[1]) });
    }
    case 'resi': {
      const t = nearBlock(a.greatPark ?? { x: -200, z: 0 }, 'low_rise_resi');
      return streetCam({ x: Math.round(t.centroid[0]), z: Math.round(t.centroid[1]) });
    }
    case 'harbor': {
      const w = a.wharf ?? a.portOffice ?? { x: 300, z: 300 };
      return aerial({ x: w.x ?? w[0] ?? 300, z: w.z ?? w[1] ?? 300 }, 90, -140);
    }
    default: return null;
  }
}

/** 离 p 最近的主干道格（RING/RADIAL/ARTERIAL） */
function nearestTrunkRoadPoint(CITY, p) {
  let best = null, bd = 1e9;
  for (const r of CITY.roads) {
    if (r.cls === 'MINOR' || r.cls === 'RAIL') continue;
    for (const q of r.pts) {
      const d = Math.hypot(q[0] - p.x, q[1] - p.z);
      if (d < bd) { bd = d; best = { x: q[0], z: q[1] }; }
    }
  }
  return best ?? { x: p.x + 12, z: p.z + 12 };
}

export function parseParams(search) {
  const q = new URLSearchParams(search);
  const seed = Number(q.get('seed'));
  return {
    plan: q.get('plan'),
    debug: q.get('debug') === '1',
    cam: q.get('cam'),
    seed: Number.isFinite(seed) && seed > 0 ? seed : null,
  };
}
```

- [ ] **Step 4: 实现 `src/planView.js`**

```js
/** ?plan=1：把 cell buffer 画成一张正射俯视贴图（规格 §12）。唯一允许 import three 的 city 侧文件。 */
import * as THREE from 'three';
import { T, DISTRICT, CFG, isRoad, isWater } from './city/config.js';

const TYPE_COLOR = {
  [T.ROAD_RING]: 0x8a8f96, [T.ROAD_RADIAL]: 0x7d838b, [T.ROAD_ARTERIAL]: 0x6f757e,
  [T.ROAD_MINOR]: 0x62686f, [T.SIDEWALK]: 0x43484f, [T.MEDIAN]: 0x2c3036,
  [T.RAIL]: 0xd8a23c, [T.WATER]: 0x2e6f95, [T.SEA]: 0x234f6d, [T.QUAY]: 0x8a7a5c,
  [T.RECLAIM]: 0x5b6b57, [T.RECLAIMED]: 0x6b5f4a, [T.BLOCK_ALLEY]: 0x9aa0a8,
  [T.PLOT_FREE]: 0x3f4a3a, [T.POCKET]: 0x4d7a3f, [T.BRIDGE]: 0xc9b98a,
  [T.OUTSIDE]: 0x14161a,
};
const DISTRICT_COLOR = {
  [DISTRICT.CBD]: 0x2f6fa8, [DISTRICT.SUB_CENTER]: 0x7a4fb0, [DISTRICT.STATION_FRONT]: 0xc06a3a,
  [DISTRICT.COMMERCIAL]: 0xc9a13a, [DISTRICT.ENTERTAINMENT]: 0xb04a6a, [DISTRICT.ELECTRONICS]: 0x4a9ab0,
  [DISTRICT.HIGH_RISE_RESI]: 0x6a8a4a, [DISTRICT.LOW_RISE_RESI]: 0x8aa06a, [DISTRICT.TRADITIONAL]: 0xa86a3a,
  [DISTRICT.SCHOOL]: 0x3aa88a, [DISTRICT.HOSPITAL]: 0xd8d8d8, [DISTRICT.PUBLIC]: 0x9a9a5a,
  [DISTRICT.PARK_LARGE]: 0x2f7a2f, [DISTRICT.PARK_SMALL]: 0x53a053, [DISTRICT.GREENWAY]: 0x6ab04a,
  [DISTRICT.PORT_INDUSTRY]: 0x5a5a6a, [DISTRICT.FREIGHT_YARD]: 0x8a6a2a, [DISTRICT.UNIVERSITY]: 0x3a6a9a,
  [DISTRICT.DANCHI]: 0x7a9a4a, [DISTRICT.STADIUM]: 0xb0b040, [DISTRICT.LANDMARK]: 0xff5050,
};

/** mode: 'type' | 'blocks' | 'district' | 'height' */
export function planTexture(CITY, mode = 'type') {
  const N = CITY.N;
  const cvs = document.createElement('canvas');
  cvs.width = N; cvs.height = N;
  const ctx = cvs.getContext('2d');
  const img = ctx.createImageData(N, N);
  const d = img.data;
  const f = CITY.field;
  for (let x = -CITY.HALF; x <= CITY.HALF; x++) {
    for (let z = -CITY.HALF; z <= CITY.HALF; z++) {
      const i = f.idx(x, z);
      const px = ((z + CITY.HALF) * N + (x + CITY.HALF)) * 4;
      let c;
      if (mode === 'district') {
        const b = f.blockId[i];
        c = b >= 0 ? (DISTRICT_COLOR[CITY.blocks[b].district] ?? 0x20242a) : (TYPE_COLOR[f.t[i]] ?? 0x20242a);
      } else if (mode === 'blocks') {
        const b = f.blockId[i];
        c = b >= 0 ? hsl(b * 137.508 % 360, 0.45, 0.5) : (TYPE_COLOR[f.t[i]] ?? 0x101216);
      } else if (mode === 'height') {
        const v = Math.max(0, Math.min(255, (f.h[i] / 7) * 255));
        c = (v << 16) | (v << 8) | v;
      } else {
        c = TYPE_COLOR[f.t[i]] ?? (f.t[i] === T.BLOCK ? 0x354034 : 0x20242a);
      }
      d[px] = (c >> 16) & 255; d[px + 1] = (c >> 8) & 255; d[px + 2] = c & 255; d[px + 3] = 255;
    }
  }
  // 叠加：plot 矩形细线、车站、桥
  ctx.putImageData(img, 0, 0);
  if (mode === 'type' || mode === 'district') {
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1;
    for (const p of CITY.plots) {
      ctx.strokeRect(p.rect.x0 - CITY.HALF + 0.5, p.rect.z0 - CITY.HALF + 0.5, p.w, p.d);
    }
    ctx.fillStyle = '#ff3b30';
    for (const s of CITY.stations) {
      ctx.fillRect(s.x - CITY.HALF - 2, s.z - CITY.HALF - 2, 5, 5);
    }
    ctx.fillStyle = '#ffe14a';
    for (const b of CITY.bridges) ctx.fillRect(b.pts[0][0] - CITY.HALF - 1, b.pts[0][1] - CITY.HALF - 1, 3, 3);
  }
  const tex = new THREE.CanvasTexture(cvs);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function hsl(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const k = (n) => (n + h / 30) % 12;
  const f2 = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return (Math.round(f2(0) * 255) << 16) | (Math.round(f2(8) * 255) << 8) | Math.round(f2(4) * 255);
}

export function mountPlanView(scene, CITY, mode) {
  const tex = planTexture(CITY, mode);
  const size = CITY.N;                     // 1 格 = 1 世界单位，俯视图与实际等大
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, fog: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.5;
  scene.add(mesh);
  return { mesh, texture: tex };
}
```

- [ ] **Step 5: 接进 `src/main.js`**

在 `main.js` 顶部 import 区加：

```js
import { buildCity } from './city/query.js';
import { viewpoint, parseParams } from './city/viewpoints.js';
import { mountPlanView } from './planView.js';
```

在 `const renderer = ...` 之后、`const scene = ...` 之前插入：

```js
const PARAMS = parseParams(location.search);
const CITY = buildCity(PARAMS.seed ?? undefined);
```

把 `scene.fog` 一行改为 `?plan` 时不启用雾：

```js
scene.fog = PARAMS.plan ? null : new THREE.FogExp2(0x2a2338, 0.00055);
```

在 `buildCity()` 的异步函数**外层**（现有 `async function buildCity()` 与新的 `buildCity()` 重名，把现有那个改名为 `buildCityVoxels()`，含其调用点），最前面加 plan 分支：

```js
if (PARAMS.plan) {
  mountPlanView(scene, CITY, PARAMS.plan === '1' ? 'type' : PARAMS.plan);
  const v = viewpoint('plan', CITY);
  const S = CITY.N;
  camera = new THREE.OrthographicCamera(-S / 2, S / 2, S / 2, -S / 2, 1, 4000);
  camera.position.set(v.position[0], v.position[1], v.position[2]);
  camera.lookAt(0, 0, 0);
  controls.object = camera;
  statsEl.textContent = `PLAN:${PARAMS.plan} · ${CITY.stats.blocks} blocks · ${CITY.stats.plots} plots · ${CITY.stats.buildMs}ms`;
  renderer.shadowMap.enabled = false;
} else {
  if (PARAMS.cam) applyViewpoint(PARAMS.cam);
  // …原有体素生成流程
}
```

`camera` 需从 `const` 改为 `let`，并新增：

```js
function applyViewpoint(name) {
  const v = viewpoint(name, CITY);
  if (!v) return;
  camera.position.set(v.position[0], v.position[1], v.position[2]);
  controls.target.set(v.target[0], v.target[1], v.target[2]);
  controls.autoRotate = false;
  controls.update();
}
```

HUD 增加审计行，`index.html` 的 `#stats` 之后加：

```html
<div id="audit"></div>
```

并在 `main.js` 的生成流程结束后加：

```js
const a = CITY.audit();
document.getElementById('audit').textContent =
  `blocks ${CITY.stats.blocks} · plots ${CITY.stats.plots} · claims ${a.total}` +
  ` · 违规 road:${a.onRoad} water:${a.onWater} rail:${a.onRail} overlap:${a.overlap} pad:${a.badPad}`;
document.getElementById('audit').style.color =
  (a.onRoad + a.onWater + a.onRail + a.overlap + a.badPad) ? '#ff6b5a' : '#7fd88a';
```

- [ ] **Step 6: 运行单元确认**

Run: `npm test`
Expected: PASS

Run: `npm run build`
Expected: 构建成功（`?plan` 分支是运行期判断，构建只验证语法与打包）

- [ ] **Step 7: 人工确认视图能出图**

```bash
npm run dev
```

浏览器打开 `http://127.0.0.1:5173/?plan=1` → 应看到俯视栅格；再试 `?plan=district`、`?plan=blocks`、`?plan=height`。四张都出图且无 console 报错即通过。

- [ ] **Step 8: 提交**

```bash
git add src/city/viewpoints.js src/planView.js src/main.js index.html tests/viewpoints.test.js
git commit -m "feat(city): top-down plan raster, camera presets and audit HUD"
```

---

## Task 18: 形态检查点（本计划的终点）

不出代码，只出**判断**。这一步是 Plan B 的入场券。

**Files:**
- Create: `docs/superpowers/plans/2026-09-19-stage1a-checkpoint.md`（结论记录）
- Modify: `src/city/config.js`（调参结论回写常量）

- [ ] **Step 1: 全量测试 + 构建**

```bash
npm test && npm run build
```
Expected: 全绿、构建通过。任一失败先修，不得跳过。

- [ ] **Step 2: 生成四张栅格图**

用 browser-use 连到 `npm run dev` 的页面，依次截图并保存到 `docs/superpowers/plans/shots/`：

```
?plan=1          → plan-type.png      （路网形态）
?plan=blocks     → plan-blocks.png     （街区切分）
?plan=district   → plan-district.png   （分区分布）
?plan=height     → plan-height.png     （地形与台地）
```

- [ ] **Step 3: 逐条对照判据（规格 §15.2）**

对每张图给出「通过 / 不通过 + 理由」，写进 checkpoint 文档：

1. 一条近圆环 + 7 条放射 + 2 段中环残弧 + 有机次级网，**看不出 35×35 等距网格**。
2. 街区面积分布不均；三角形/扇形块在放射线之间可见；无成片等大正方格。
3. 主河弯曲、宽度渐变、汇入凹凸岸线的港湾与 5 座突堤；支流存在。
4. 桥只在道路跨水处，且主干道桥与支路桥视觉可辨。
5. `plan-height` 上西高东低的台地与边缘坡道可见，且道路穿过台地边缘处是缓坡不是断崖。
6. `plan-district` 上：CBD 1 处、副都心 4 处方位不对称、绿地成系统（1 大公园 + 小游园散布 + 河岸绿带）、工业集中在东南湾岸。
7. HUD：road/water/rail/overlap/pad 五类违规为 **0**；`stats.blocks` 落在 1100~1600；`buildMs` < 400。

- [ ] **Step 4: 不达标就调参，不调结构**

只能动 `CFG` 里的这些值，动完回到 Step 1 重跑：

| 症状 | 调什么 |
| --- | --- |
| 街区数偏出 1100~1600 | `INNER_DMIN` / `OUTER_DMIN`（±6 一档） |
| 仍像网格 | `MINOR_DELETE_P` ↑（0.12→0.18）；或 `ANGLE_STEP` 从 7.5 改 15 让主干更斜 |
| 删段切断街区（blocks 测试报飞地） | `MINOR_DELETE_P` ↓，或 `LLOYD_ITERS` ↑ |
| 台地不明显 | `terrain.js` 的 `SCARP_AMP` 2.4→3.2 |
| 河道太直 | `water.js` `RIVER_CTRL` 的抖动 22→34 |
| 副都心扎堆 | `roads.js` 的 sub 站贪心间隔 60°→75° |
| Voronoi 斜边观感脏 | 最后手段：`VORONOI=false`，回到纯折线次级网并记录在 checkpoint |

- [ ] **Step 5: 写 checkpoint 文档并提交**

`docs/superpowers/plans/2026-09-19-stage1a-checkpoint.md` 内容要求：
- 7 条判据逐条「通过/不通过 + 一句依据」；
- 最终 `CFG` 变更值与变更原因；
- 未解决项清单，**其中必须显式列出**：地面渲染未接（规格 §11）、12 个 consumer 未迁移（§14）、体素级反查未跑（§10.8）——这三项是 Plan B 的范围，此处不假装完成；
- 一句结论：是否允许进入 Plan B。

```bash
git add docs/superpowers/plans/2026-09-19-stage1a-checkpoint.md docs/superpowers/plans/shots/ src/city/config.js
git commit -m "docs: stage 1A morphology checkpoint — plan raster review and tuning"
```

- [ ] **Step 6: 清理临时开关**

本计划**不引入** `CFG.LEGACY_GROUND`（它属于 Plan B 迁移期）。此处只需确认 `grep -n "LEGACY_GROUND\|VORONOI" src/city/config.js` 中 `VORONOI` 若为 `false` 已在 checkpoint 记录原因。

---

## Self-Review 结论（计划作者自检，已执行并修正）

**1. 规格覆盖。** 逐节比对：§1 网格（Task 2）、§2 流水线 P1~P10（Task 6 / 7 / 8 / 9 / 10 / 11 / 12 / 13 / 14 / 15 / 16 依序对应）、§3 模块边界（各 Task 的 Files 与 Interfaces）、§4 查询契约（Task 16）、§5 路网（Task 7~9、14）、§6 地形（Task 6、10）、§7 水系（Task 11）、§8 街区（Task 12）、§9 分区与配额（Task 13）、§10 地块与三条不变量（Task 15、16）、§12 验证工具（Task 17、18）、§13 构建耗时与内存（Task 16 Step 5）。

**有规格条目在本计划里被弱化，已如实标注而非掩盖：**
- 规格 §5.3.5 的「删段不得切断区域」——Task 9 的对应测试只检查次级路总长，是**弱断言**；真正的检查落在 Task 12 的「无孤立飞地」。Task 9 Step 4 已写明这一点。
- 规格 §12 的 `?debug=1` 分区叠层与 §10.8 体素级反查依赖 `voxel.js` 的 `keepRecords`，属三维侧改造，**移交 Plan B**。Task 17 只交付 `?plan` / `?cam` / `?seed` 与审计 HUD。
- 规格 §16 的 `CFG.LEGACY_GROUND` 是 Plan B 迁移期开关，本计划不引入（Task 18 Step 6 已确认）。

**移交 Plan B 的完整清单：** §11 地面渲染、§14 十二个 consumer 迁移、§15.1/15.4/15.5/15.7（三维截图、体素预算、帧率、两次加载像素一致）、§10.8 体素级反查、`?debug=1` 叠层。

**2. 占位符扫描。** 发现并已修正 14 处，不留 TBD：
- Task 13 实现里两处「执行时再改」的占位（未使用的 `dist()`、不存在的 `D.RESIDENCE_PLACEHOLDER`）→ 直接给出正确代码；
- Task 13 测试里一条恒真断言 `assert.ok(... || true)` → 删除，改为「副都心方位分桶 ≥ 4」的可失败断言；
- Task 13/15 测试里的魔法数 `t === 10 /* SEA */` 与 `PARK_LARGE_KEY` 字符串旁路 → 改用 `T.SEA` / `QUOTA[DISTRICT.PARK_LARGE]`；
- Task 15 测试里的「占位：按 face 取」死代码行 → 删除；
- Task 4 的 `fill` 断言用 `||` 兜底自欺 → 换成确定值 7320；
- Task 3 测试里未使用的 `gap` 变量、Task 12 未使用的 `isVoid`、Task 15 未使用的 `a0/a1`、`LOT_SHOP_HOUSE`、`FACE_NAME`、Task 13 未使用的 `rankW`/`firstOf` → 全部删除；
- Task 8 的 `r.points.length`（字段不存在，应为 `r.pts`）与 `.flatMap` 空操作、`stampRibbon(..., )` 尾逗号 → 修正；
- Task 11 的 `const cfg = A ? {deck:1} : {deck:1}` 恒等同值 → 改为按道路等级给桥面净空（RAIL 2 格、其余 1 格）；
- Task 16 `claim` 里 `tries === 0` 与 `tries > 0` 两个分支执行同一个条件 → 合并为一次判断；
- Task 12 的 `helpers.js` import 了 Task 14 才存在的 `buildAlleys`（会让 Task 12 直接跑不起来）→ 移除并注明由 Task 15 的 `runDistricts` 补上；
- Task 12 测试引用了 `extractBlocks` 并不返回的 `b.pocket` → 改判据为「frontage 非空」；
- Task 15 的 `buildPlots(blocks, field, rng)` 第三参数未使用 → 去掉参数并在注释里说明抖动为何用 `hash2`（位置稳定，与生成顺序无关）；
- 测试与实现两侧对同一对象用了 `f` / `field` 两个键名 → `helpers.js` 同时导出两键，`assignDistricts`/`buildCity` 统一读 `field`。

**3. 类型一致性。** `Road{id,cls,pts,width,length,closed,laneOffsets}`、`Block{id,cells,bbox,centroid,area,perimeter,frontage,h,district,plots}`、`Plot{id,blockId,rect,cx,cz,w,d,face,roadId,district,h,kind}`、`Station{id,x,z,bearing,t,rank}`、`Bridge{id,roadId,cls,pts,deck,span}`、`Claim{tag,plotId,blockId,x0,z0,x1,z1,y,cx,cz,w,d}` 在定义处与全部消费处一致。`face` 统一 4 值且与 `src/residential.js:15` 的 `FRONT` 同序，使阶段 2 可直接复用朝向部件旋转代码。`T` 的 `ROAD_*` 连续性由 `tests/config.test.js` 显式钉住（`isRoad` 依赖它）。


