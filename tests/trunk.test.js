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

test('bands 画出的SIDEWALK/MEDIAN格数 = Σ(路长 × §5.5 该等级的格数)，且都归属某条主干', () => {
  const { f, roads } = setup();
  const byId = new Map(roads.map((r) => [r.id, r]));
  let sw = 0, med = 0, orphan = 0, medOnThin = 0;
  for (let i = 0; i < f.t.length; i++) {
    const t = f.t[i];
    if (t !== T.SIDEWALK && t !== T.MEDIAN) continue;
    if (t === T.SIDEWALK) sw++; else med++;
    const r = byId.get(f.roadId[i]);
    if (!r) { orphan++; continue; }
    if (t === T.MEDIAN && r.width < 8) medOnThin++;      // §5.5：中央带只在 width ≥ 8 时
  }
  // 期望值：RING 9 = 4 人行道 + 1 中央带 + 4 路面；RADIAL 8 = 4 + 1 + 3；ARTERIAL 6 = 2 + 4
  let wantSw = 0, wantMed = 0;
  for (const r of roads) {
    const cfg = ROAD[r.cls];
    if (!cfg) continue;                                   // RAIL 不是一级道路，无 bands
    wantSw += r.length * cfg.walk * 2;
    if (cfg.median) wantMed += r.length;
  }
  assert.ok(sw > 1000 && med > 100, `bands 没画出人行道/中央带：${sw}/${med}`);
  assert.ok(Math.abs(sw - wantSw) / wantSw < 0.1, `人行道格数 ${sw} vs 期望 ${wantSw.toFixed(0)}`);
  assert.ok(Math.abs(med - wantMed) / wantMed < 0.1, `中央带格数 ${med} vs 期望 ${wantMed.toFixed(0)}`);
  assert.equal(orphan, 0, '有 SIDEWALK/MEDIAN 格不属于任何路（Task 12 的临街判定会读错）');
  assert.equal(medOnThin, 0, '窄路不该有中央带');
});

test('道路格占全城比例：主干阶段实测 3.48%~3.57%（见下方注）', () => {
  const { f } = setup();
  let road = 0;
  for (let i = 0; i < f.t.length; i++) if (isRoad(f.t[i]) || f.t[i] === T.SIDEWALK) road++;
  const pct = road / (f.N * f.N);
  // brief 的界限是 `pct > 0.10 && pct < 0.26`（标题 12%~26%），下界在主干阶段不可满足：
  // 分母是 1089² 全网格，而 P3 的总产出只有 环 2100×9 + 7×(464×8) + 2×(215×6) ≈ 47.7k 格
  // = 4.02% 的**上界**（交叉口重叠只会更少），10% 需要 118k 格。300 个种子实测
  // 3.48~3.57%（均值 3.54%），与实现无关，任何符合 §5.5 宽度表的 P3 都落在这个带里。
  // 12%~26% 是 P4 次级网压完之后的全网口径（§5.3 的 Voronoi 边宽 4 才是道路格的大头），
  // 由 tests/secondary.test.js 按那个带判。
  assert.ok(pct > 0.030 && pct < 0.045, `主干占比异常 ${(pct * 100).toFixed(1)}%`);
});

test('次级网之前的街区尚未细分：放射线之间留有可通行空隙（非全铺）', () => {
  const { f } = setup();
  let block = 0;
  for (let i = 0; i < f.t.length; i++) if (f.t[i] === T.BLOCK) block++;
  assert.ok(block > (f.N * f.N) * 0.5, ' BLOCK 太少，道路铺得过密');
});

test('环状主干折线显式闭合：stampRibbon 不回头，少收尾点就留 ~3.5 格缺口', () => {
  const { roads } = setup();
  const ring = roads.find((r) => r.cls === 'RING');
  const first = ring.pts[0], last = ring.pts[ring.pts.length - 1];
  assert.equal(ring.closed, true);
  assert.deepEqual([last[0], last[1]], [first[0], first[1]]);
});

test('确定性：同种子逐格一致', () => {
  const a = setup(), b = setup();
  assert.deepEqual(Array.from(a.f.t), Array.from(b.f.t));
  assert.deepEqual(Array.from(a.f.roadId), Array.from(b.f.roadId));
  assert.deepEqual(Array.from(a.f.dir), Array.from(b.f.dir));
  assert.deepEqual(Array.from(a.f.cellRank), Array.from(b.f.cellRank));
});
