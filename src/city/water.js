/** 水系与港湾（规格 §7）。主河走城市东侧、轨道环之外，不穿 CBD。 */
import { CFG, T, ROAD, isWater, isRoad } from './config.js';
import { catmullRom, resample, polylineLength } from './geom.js';
import { makeRng } from '../rng.js';

// §7.1（2026-09-20 裁定修订）：中段 r≥290，抖动 ±22 后仍高于环轨外包络 264——
// 主河不再横穿轨道环（旧控制点深入 r≈106，把环轨切断两次，见 Task 11 报告 S1）。
// 首点 [30,-544]→[50,-544]（+20，裁定许可的幅度）：拉陡上游段，否则上游探针点走向 ≈37°，
// 横向扫描读数膨胀到 11（真宽 6.6），河宽下游/上游比只有 1.18（需 >1.5，实测 1.56）。
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

/** 道路带类型：跨水时整段成桥（规格 §7.3），而不是只留中柱或路面。轨交同（裁定 ③b）。 */
const isRoadBand = (t) => isRoad(t) || t === T.SIDEWALK || t === T.MEDIAN || t === T.RAIL;

/** 海陆界（规格 §7.2）：纯几何、无随机，测试可独立重建（makeCoast + eastOfCoast 判定岸内/外）。 */
export function makeCoast() {
  return catmullRom(COAST_CTRL.map(([x, z], i) => {
    const bump = [0, -34, 26, -42, 30, -22, 0][i] ?? 0;
    const L = Math.hypot(x, z) || 1;
    return [x + (x / L) * bump, z + (z / L) * bump];
  }), { closed: false, perSeg: 10 });
}

/** 点是否在岸线「向海」一侧：以原点为内侧，比较该点方位角处岸线半径 */
export function eastOfCoast(coast, x, z) {
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

/**
 * 渐宽折线压印（规格 §7.1）。河床格一律沉为 WATER/h=0；
 * 落入河床的道路带格不跳过——记进 cross（idx→原 roadId，roadId 保留在格上），
 * 供 buildBridges 整段拾桥；跳过会让水在每条路带处断流。
 */
function stampRiver(field, pts, widthFn, cross) {
  const dense = resample(pts, 0.5);
  const total = dense.length - 1 || 1;
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
      if (isRoadBand(field.t[i])) cross.set(i, field.roadId[i]);
      else field.roadId[i] = -1;
      field.t[i] = T.WATER; field.h[i] = 0;
    }
  }
}

/**
 * 海岸截断（规格 §7.2「界外侧全部 SEA」，裁定 ④）：
 * 每条路的 pts 截到岸线——保留岸内折点前缀 + 岸线交点（段内二分），记 truncatedBySea。
 * 格子侧的抹除在 applyWater 的压海循环里统一做（岸线外侧一切格 → SEA）。
 */
function truncateRoadsBySea(roads, coast) {
  for (const r of roads) {
    const P = r.pts;
    let cut = null;
    for (let j = 0; j < P.length - 1 && !cut; j++) {
      const seg = resample([P[j], P[j + 1]], 0.5);
      for (let s = 1; s < seg.length; s++) {          // s=0 即段起点，已含于前一段判定
        if (!eastOfCoast(coast, seg[s][0], seg[s][1])) continue;
        let a = seg[s - 1], b = seg[s];
        for (let it = 0; it < 24; it++) {
          const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
          if (eastOfCoast(coast, m[0], m[1])) b = m; else a = m;
        }
        cut = { j, pt: a };
        break;
      }
    }
    if (!cut) continue;
    r.pts = [...P.slice(0, cut.j + 1), cut.pt];
    r.truncatedBySea = true;
    r.length = polylineLength(r.pts);
  }
}

export function applyWater(field, roads, terr, rng, seed = CFG.SEED) {
  // 水系随机与路网共享 rng 解耦：dMin/删段等调参会改变 poisson 消耗的随机数个数，
  // 进而改变河道/岸线抖动，使水系测试随路网参数无故翻车。水系用独立派生种子。
  const wrng = makeRng((seed ^ 0xA71E) >>> 0);
  const river = catmullRom(jitter(RIVER_CTRL, wrng, 22), { closed: false, perSeg: 14 });
  const trib = catmullRom(jitter(TRIBUTARY_CTRL, wrng, 18), { closed: false, perSeg: 12 });
  const coast = makeCoast();

  // 海（§7.2）：岸线外侧一切格 → SEA。道路带格同样抹除（roadId=-1、cellRank 清 0），
  // 路账侧已先截断到岸线（truncatedBySea），岸内一格不动。
  truncateRoadsBySea(roads, coast);
  for (let x = -field.half; x <= field.half; x++) for (let z = -field.half; z <= field.half; z++) {
    if (!eastOfCoast(coast, x, z)) continue;
    const i = field.idx(x, z);
    field.t[i] = T.SEA; field.h[i] = 0; field.roadId[i] = -1; field.cellRank[i] = 0;
  }

  const cross = new Map();
  stampRiver(field, river, riverWidth, cross);
  stampRiver(field, trib, (t) => 5 + 3 * t, cross);

  // 突堤码头 5 座（规格 §7.2）：从岸线向海伸出。
  // 涂刷走包围盒逆变换：近 45° 的突堤若沿 (s,w) 整数步进，两个方向分量都 >0.5，
  // 逐格跳跃会在对角线上留下棋盘状空洞（突堤 #2 中心格实测即空洞，类型滞留 SEA）。
  const piers = [];
  for (let k = 0; k < 5; k++) {
    const p = coast[Math.floor((k + 0.5) / 5.5 * coast.length)];
    const L = Math.hypot(p[0], p[1]) || 1;
    const ux = p[0] / L, uz = p[1] / L;                 // 向海方向
    const len = 30 + Math.round(wrng() * 25), wid = 4 + Math.round(wrng() * 6);
    const ex = Math.max(Math.abs(ux), Math.abs(uz)) * len + wid * Math.SQRT2 + 2;
    for (let x = Math.floor(p[0] - ex); x <= Math.ceil(p[0] + ex); x++)
      for (let z = Math.floor(p[1] - ex); z <= Math.ceil(p[1] + ex); z++) {
        const s = (x - p[0]) * ux + (z - p[1]) * uz;
        const w = (x - p[0]) * -uz + (z - p[1]) * ux;
        if (s < 0 || s > len || Math.abs(w) > wid || !field.inb(x, z)) continue;
        const i = field.idx(x, z);
        if (field.t[i] !== T.SEA && field.t[i] !== T.WATER) continue;
        field.t[i] = T.QUAY; field.h[i] = 1; field.roadId[i] = -1;
      }
    piers.push({ id: k, x: Math.round(p[0] + ux * len * 0.5), z: Math.round(p[1] + uz * len * 0.5), len, wid });
  }

  const bridges = buildBridges(field, roads, cross);

  // 护岸：水面（含桥格）外 3 格内的陆域 → RECLAIM，高度 ≥1（规格 §7.1 两侧护岸）。
  // 道路带/轨道/岸壁受保护，不被改写。
  const waterCells = [];
  for (let x = -field.half; x <= field.half; x++) for (let z = -field.half; z <= field.half; z++)
    if (isWater(field.t[field.idx(x, z)])) waterCells.push([x, z]);
  for (const [x, z] of waterCells) for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) {
    const xx = x + a, zz = z + b;
    if (!field.inb(xx, zz)) continue;
    const i = field.idx(xx, zz);
    if (isWater(field.t[i]) || field.t[i] === T.QUAY) continue;
    if (isRoadBand(field.t[i])) continue;
    field.t[i] = T.RECLAIM;
    field.h[i] = Math.max(1, field.h[i]);
  }

  return {
    bridges, piers, coast,
    // 返回的折线做 8 格重采样：tests 要求 mainRiver >100 点（perSeg=14 只有 85 点、
    // 10 格重采样在新控制点下恰好 100 点卡边）；压印始终走 stampRiver 内部的 0.5 重采样，
    // 返回密度不影响河床形状。
    mainRiver: resample(river, 8), tributary: resample(trib, 8),
  };
}

/**
 * 桥（规格 §7.3）：把 stampRiver 记下的跨水道路带格（含轨交格，裁定 ③b）按
 * roadId + 8 连通聚簇，一簇 = 一条路连续跨水的格段；簇 ≥5 格成桥，整簇转 BRIDGE，
 * 桥面 deck = max(两岸 h) + 净空（道路 1、轨交 2），roadId 保留——路一格没丢，
 * 只是跨水段换了桥面。桥格类型 BRIDGE 且 isWater 为真，语义等同「桥下格保持 WATER」。
 * 环轨（roadId=-2，不在 roads 清单）先按场上格带还原一条合成路账并入 roads，
 * 其跨水簇照常成桥（支流西穿环即天然实例）。
 */
function buildBridges(field, roads, cross) {
  const byRoad = new Map();
  for (const [i, roadId] of cross) {
    if (!byRoad.has(roadId)) byRoad.set(roadId, []);
    byRoad.get(roadId).push(i);
  }
  if (byRoad.has(-2) && !roads.some((r) => r.id === -2)) roads.push(ringRailRoad(field));
  const byId = new Map(roads.map((r) => [r.id, r]));
  const bridges = [];
  let id = 0;
  for (const [roadId, cells] of byRoad) {
    const r = byId.get(roadId);
    if (!r) continue;                                    // 无主跨水格（理论不出现）：保持 WATER
    const pool = new Set(cells);
    while (pool.size) {
      // 8 连通取一簇
      const seed = pool.values().next().value;
      const cluster = [];
      const stack = [seed];
      pool.delete(seed);
      while (stack.length) {
        const i = stack.pop();
        cluster.push(i);
        const cx = Math.floor(i / field.N) - field.half, cz = (i % field.N) - field.half;
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
          if (!field.inb(cx + a, cz + b)) continue;
          const j = field.idx(cx + a, cz + b);
          if (pool.has(j)) { pool.delete(j); stack.push(j); }
        }
      }
      // 沿道路中心线取有序桥面点（规格：段长按水宽 + 两岸各 2 格，这里以落入水面的格段为准）
      const inCluster = new Set(cluster);
      const pts = [];
      for (const p of resample(r.pts, 1)) {
        const x = Math.round(p[0]), z = Math.round(p[1]);
        if (field.inb(x, z) && inCluster.has(field.idx(x, z))) pts.push([x, z]);
      }
      if (pts.length < 5) continue;                      // 扫边擦水不成桥
      // 两岸高：簇外 2 格内的陆域最大 h
      let bank = 0;
      for (const i of cluster) {
        const cx = Math.floor(i / field.N) - field.half, cz = (i % field.N) - field.half;
        for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
          const q = field.at(cx + a, cz + b);
          if (q && !isWater(q.t) && !isRoadBand(q.t)) bank = Math.max(bank, q.h);
        }
      }
      const deck = Math.max(bank, 1) + (r.cls === 'RAIL' ? 2 : 1);
      for (const i of cluster) {
        field.t[i] = T.BRIDGE; field.h[i] = deck; field.roadId[i] = r.id;
      }
      bridges.push({ id: id++, roadId: r.id, cls: r.cls, pts, deck, span: pts.length });
    }
  }
  return bridges;
}

/**
 * 环轨合成路账：场上 roadId=-2 的轨交环格带按绕原点方位角分箱取均值，
 * 还原成闭合中心线（跨水格已转 BRIDGE/WATER 但 roadId 保留，仍入箱）。
 * 只在环轨确有跨水簇时调用一次，推进 roads 清单，让桥条目有据可查。
 */
function ringRailRoad(field) {
  const BINS = 1440;
  const sx = new Float64Array(BINS), sz = new Float64Array(BINS), sn = new Uint32Array(BINS);
  for (let x = -field.half; x <= field.half; x++) for (let z = -field.half; z <= field.half; z++) {
    const i = field.idx(x, z);
    if (field.roadId[i] !== -2) continue;
    const b = Math.floor(norm(Math.atan2(z, x) * 180 / Math.PI) / 360 * BINS) % BINS;
    sx[b] += x; sz[b] += z; sn[b]++;
  }
  const pts = [];
  for (let b = 0; b < BINS; b++) if (sn[b]) pts.push([sx[b] / sn[b], sz[b] / sn[b]]);
  return {
    id: -2, cls: 'RAIL', pts, width: 5, closed: true,
    length: polylineLength(pts.concat([pts[0]])),
    laneOffsets: [-1.5, 1.5],
  };
}
