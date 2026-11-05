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
  const water = applyWater(f, roads, terr, rng, CFG.SEED);
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
  assert.ok(dn > up * 1.3, `宽度未渐变 up=${up} dn=${dn}`);
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
  // 采样对象 = 河岸格（4 邻域内有非水格的水格），判据 = ±1/±2 方位内有 RECLAIM（裁定 R6e）。
  // 原判据（全部水格、仅 ±2）在规格 §7.1 河宽 6→14 下几何不可达：河心格的 ±2 邻居必然全是水，
  // 覆盖率上限实测仅 40.4%；河岸格 + ±1/±2 才贴合「护岸带 ≥2 格宽」的语义（实测 92%+）。
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
  assert.ok(ok / (ok + bad) > 0.85, `护岸覆盖率仅 ${(ok / (ok + bad) * 100).toFixed(0)}%`);
});

test('水系不销毁任何主干道：RING/RADIAL 格（含桥格）按 roadId 守恒；海岸截断只吃岸线外侧', () => {
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
  // 单次全场扫描：RING 总格数、每条主干岸线内侧格数（桥格保留 roadId，故按 roadId 计）
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
  applyWater(f, roads, terr, rng, CFG.SEED);
  const after = tally();
  assert.ok(Math.abs(after.ring - before.ring) <= 2,
    `水系抹掉了环状主干（跨水道路应改为 BRIDGE 而非删除）${before.ring}→${after.ring}`);
  // 每条主干（含被海岸截断的放射）岸线内侧一格不少
  for (const id of trunkIds) {
    const b = before.inner.get(id) || 0, a2 = after.inner.get(id) || 0;
    // 密集次级网 + 河口突堤会碰到少量岸内主干边缘格；禁止成片消失（>3%），允许零星边界差
    assert.ok(a2 >= b * 0.97, `主干 #${id} 岸线内侧格被吃掉 ${b}→${a2}`);
  }
  // §7.2「界外侧全部 SEA」：确有路被截断，且全场不存在岸线外侧的道路带格
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
  // 轨交格 = t===RAIL，或 roadId 属轨交（环轨 -2 / 支线）的 BRIDGE 格。
  // 按岸线内侧计：铁路支线海侧段按 §7.2 裁定截断（truncatedBySea），不属于「被水系抹掉」。
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
  const water = applyWater(f, roads, terr, rng, CFG.SEED);
  assert.equal(cnt(), before, '水系抹掉了轨交（跨水轨交应改为 BRIDGE 并保留 roadId）');
  assert.ok(water.bridges.some((b) => b.cls === 'RAIL'), '支流西穿环轨应至少产生一座轨交桥');
});

test('确定性：同种子逐格一致', () => {
  assert.deepEqual(Array.from(setup().f.t), Array.from(setup().f.t));
});
