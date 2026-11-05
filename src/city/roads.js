/** 路网（规格 §5）。P2 轨道环与车站 → P3 主干 → P4 次级 → P5 纵剖面 → P9 小巷。
 *  轨道先于道路（规格 §5.1）——真实东京的放射路是沿山手线的车站长出来的，
 *  所以 buildTrunks 把放射干道对准 buildRailAndStations 选出的车站，而不是反过来。 */
import { CFG, DISTRICT, ROAD, ROAD_RANK, T, isRoad } from './config.js';
import { quantize } from './terrain.js';
import {
  superEllipse, catmullRom, polylineLength, wrap180, snapAngle, bearing, poissonDisk, resample,
} from './geom.js';

/** 规格 §5.1.2：不等间距的 10 个方位角（山手线站位的角序），再加种子抖动 ±4°。 */
const STATION_BEARINGS = [14, 51, 88, 121, 158, 196, 233, 264, 301, 340];
const SUB_MINGAP = 60;           // §5.1.2：sub 两两方位角间隔下限；配额 4 由 §9 固定（见 pickSubs 的四元组合）
const ANTIPODE = 172;            // §5.1.2「不会四角对称」：两 sub 不得近乎对跖（间隔 < 172°）

/** 两方位角的劣弧夹角（度） */
function gapOf(a, b) {
  const g = Math.abs(a - b);
  return g > 180 ? 360 - g : g;
}

/** 在闭合折线上按方位角找点：取该方向上投影最大的那段的中点（误差 < 半个采样步长） */
function pointAtBearing(pts, deg) {
  const th = deg * Math.PI / 180;
  const tx = Math.cos(th), tz = Math.sin(th);
  let best = null, bestD = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    const proj = mx * tx + mz * tz;
    if (proj > bestD) { bestD = proj; best = [mx, mz]; }
  }
  return best || pts[0];
}

/**
 * 从候选站里取 4 个「两两间隔 ≥ 60° 且互不为对跖点」的站作副都心。
 * 穷举 C(9,4)=126 组，不做逐个贪心：在「≥60° 且 <172°」这个联合约束下贪心会走进死路。
 * 实测 500 个种子——brief 版贪心有 310 次选出对跖站对；给贪心加对跖上限后只有 196 次凑满 4 站。
 * 择优次序：离对跖最远 → 最小两两间隔最大 → 候选半径序靠前（半径序是稳定全序，故确定性）。
 * 若没有任何一组满足 ≥60°，退回「最大化最小间隔」的一组：配额优先于形状（规格 §9）。
 */
function pickSubs(cands) {
  const n = cands.length;
  let best = null, bestKey = null;
  const better = (k) => !bestKey
    || k[0] > bestKey[0]
    || (k[0] === bestKey[0] && k[1] > bestKey[1])
    || (k[0] === bestKey[0] && k[1] === bestKey[1] && k[2] < bestKey[2]);
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++)
    for (let c = b + 1; c < n; c++) for (let d = c + 1; d < n; d++) {
      const q = [cands[a], cands[b], cands[c], cands[d]];
      let minGap = Infinity, worstAnti = Infinity;
      for (let i = 0; i < q.length; i++) for (let j = i + 1; j < q.length; j++) {
        const g = gapOf(q[i].bearing, q[j].bearing);
        minGap = Math.min(minGap, g);
        worstAnti = Math.min(worstAnti, Math.abs(g - 180));
      }
      // anti = 这一组离对跖点的最小余量；须同时满足 ≥60° 与余量 > 180-ANTIPODE（= 8°），否则形状不合格
      const anti = minGap >= SUB_MINGAP && worstAnti > 180 - ANTIPODE ? worstAnti : -Infinity;
      const key = [anti, minGap, a + b + c + d];
      if (better(key)) { best = q; bestKey = key; }
    }
  return best || [];
}

export function buildRailAndStations(rng) {
  const h1 = [3, 0.055, rng() * 6.283], h2 = [5, 0.035, rng() * 6.283];
  const ring = superEllipse(CFG.RAIL_R, [h1, h2], 72, 0);
  // 72 控制点 × 每段 6 次采样 = 432 点的准闭合折线（首尾相距 < 4）。
  // 显式闭合与等步长重采样由压印方（Task 8）负责，stampRibbon 不自动闭合。
  const pts = catmullRom(ring, { closed: true, perSeg: 6 });

  const stations = STATION_BEARINGS.map((b, i) => {
    const bearing = wrap180(b + rng.range(-4, 4));
    const [x, z] = pointAtBearing(pts, bearing);
    return { id: i, x: Math.round(x), z: Math.round(z), bearing, t: 0, rank: 'local' };
  });

  // main：离原点最近的站
  let main = stations[0];
  for (const s of stations) if (Math.hypot(s.x, s.z) < Math.hypot(main.x, main.z)) main = s;
  main.rank = 'main';

  // sub：候选按到原点的距离排序（与 brief 同序），再按上面的规则择优
  const cands = stations.filter((s) => s !== main)
    .slice().sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z) || a.id - b.id);
  for (const s of pickSubs(cands)) s.rank = 'sub';

  return { pts, length: polylineLength(pts), stations, mainStation: main };
}

/** 折线「对准车站」的判定容差是 20 格（tests/trunk.test.js）；本文件的构造保证 ≤ 13。 */
const D2R = Math.PI / 180;
const RANK_ORDER = { main: 0, sub: 1, local: 2 };

/** 吸附到 7.5° 步进的 48 方向集（规格 §5.1.3） */
const snap = (deg) => snapAngle(deg);

/**
 * 从 (cx,cz) 沿方位角 deg0 出发走 len（格），每段长 segLen，方向逐段吸附到 7.5°。
 * 给 target（车站）时先**朝车站瞄准**：每段重算「当前点→车站」的方位角再吸附，
 * 并把车站垂足（target 在本段方向上的投影）当作一个折点踩上去——它与前后两点共线，
 * 既不改变任何一段的方向（7.5° 吸附判据照旧成立），又让折线真的经过车站，
 * 且最近距离 ≤ segLen·sin(3.75°) ≈ 13 格（实测 300 种子 ≤ 12.9）。
 * 这就是「放射路沿车站长出来」的走法（规格 §5.1.3）。落到垂足后改为随机摆动 ±10°
 * （吸附后为 0/±7.5/±15）；垂足已在身后也判定过站——放射线是开链，不为追站而回头。
 */
function spoke(cx, cz, deg0, len, segLen, rng, target) {
  let deg = snap(deg0), x = cx, z = cz, left = len;
  const pts = [[x, z]];
  let aiming = !!target;
  while (left > 1e-9) {
    let step = Math.min(segLen, left);
    if (aiming) {
      const aimDeg = snap(bearing(x, z, target[0], target[1]));
      const ra = aimDeg * D2R, ux = Math.cos(ra), uz = Math.sin(ra);
      const foot = (target[0] - x) * ux + (target[1] - z) * uz;   // 垂足在本段方向上的投影
      if (foot > 0 && foot < step) {                              // 本段跨过车站垂足：踩上去，此后摆动
        step = foot;
        deg = aimDeg;
        aiming = false;
      } else if (foot > 0) {                                      // 还没到，继续朝站走
        deg = aimDeg;
      } else {
        aiming = false;                                           // 已越过垂足（预算耗尽等退化情形）
        deg = snap(deg + rng.range(-10, 10));
      }
    } else {
      deg = snap(deg + rng.range(-10, 10));
    }
    const r = deg * D2R;
    x += Math.cos(r) * step; z += Math.sin(r) * step;
    pts.push([x, z]);
    left -= step;
  }
  return pts;
}

/** 折线整体沿左方法向平移 off 格（铁路支线贴着放射干道走，规格 §5.1.6） */
function offsetPolyline(pts, off) {
  return pts.map(([x, z], i) => {
    const q = pts[Math.min(i + 1, pts.length - 1)], p = pts[Math.max(i - 1, 0)];
    let dx = q[0] - p[0], dz = q[1] - p[1];
    const L = Math.hypot(dx, dz) || 1;
    dx /= L; dz /= L;
    return [x - dz * off, z + dx * off];
  });
}

/**
 * P3 主干路网：环状主干 + 7 条放射主干 + 2 段中环弧 + 1 条铁路放射支线，
 * 并把 P2 的轨道环本体压进 cell。返回 Road[]（cls ∈ RING/RADIAL/ARTERIAL/RAIL）。
 * 压印一律走 stampRibbon 的 bands 单次模式 + 显式 rank：
 * 三步法（先铺全宽路面 → 再铺加宽人行道 → 再缩窄回路面）会让低等级路的人行道带
 * 覆盖高等级路的外排路面格并抢走 roadId——等级判定在格子类型上看不见 SIDEWALK（评审 F1）。
 */
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
    field.stampRibbon(pts, {
      type: cfg.t, width: cfg.width, roadId: r.id, rank: ROAD_RANK[cls], mode: 'over',
      bands: { road: cfg.t, walk: cfg.walk, median: cfg.median ? T.MEDIAN : 0, width: cfg.width },
    });
    roads.push(r);
    return r;
  };

  // 环状主干（规格 §5.1.4）：超椭圆 48 点 + Catmull-Rom，闭合由构造保证。
  // 注意 stampRibbon 只走 pts[i]→pts[i+1]，不回头；闭曲线必须显式补回首点，
  // 否则首尾之间留下一个弦长的缺口（Task 6/7 实测环轨缺口 ~3.5 格）。
  const ringPts = superEllipse(CFG.RING_R,
    [[2, 0.07, rng() * 6.283], [4, 0.045, rng() * 6.283]], 48, 0);
  const ring = catmullRom(ringPts, { closed: true, perSeg: 3 });
  stamp(ring.concat([ring[0]]), 'RING', true);

  // 放射主干 7 条（规格 §5.1.3）：方位角对准其中 7 个车站，main 优先、其次 sub、余量给 local。
  const ordered = rail.stations.slice()
    .sort((a, b) => RANK_ORDER[a.rank] - RANK_ORDER[b.rank] || a.id - b.id);
  for (const s of ordered.slice(0, 7)) {
    const b = Math.atan2(s.z, s.x) / D2R;
    const pts = spoke(
      Math.cos(b * D2R) * CFG.RADIAL_R0, Math.sin(b * D2R) * CFG.RADIAL_R0,
      b, CFG.RADIAL_R1 - CFG.RADIAL_R0, rng.range(100, 200), rng, [s.x, s.z],
    );
    stamp(pts, 'RADIAL');
  }

  // 中环弧 2 段（规格 §5.1.5）：r≈175，只覆盖 100°~170° 与 280°~350°，制造非对称。
  for (const [a0, a1] of [[100, 170], [280, 350]]) {
    const pts = [];
    for (let d = a0; d <= a1; d += 5) {
      const r = CFG.INNER_R * (1 + 0.05 * Math.sin(d / 18));
      pts.push([Math.cos(d * D2R) * r, Math.sin(d * D2R) * r]);
    }
    stamp(pts, 'ARTERIAL');
  }

  // 铁路放射支线 1 条（规格 §5.1.6）：贴 main 站那条放射主干（ordered[0] 即 main，故 roads[1]）
  // 外侧 7 格，沿末段方向延伸到 r≈520 的城市边缘。
  const mr = roads.find((r) => r.cls === 'RADIAL');
  const spur = offsetPolyline(mr.pts, 7);
  const lp = spur[spur.length - 1], lq = spur[spur.length - 2];
  let dx = lp[0] - lq[0], dz = lp[1] - lq[1];
  const L = Math.hypot(dx, dz) || 1;
  dx /= L; dz /= L;
  const pd = lp[0] * dx + lp[1] * dz;                       // 沿方向解 |P + t·d| = SPUR_R
  const t = -pd + Math.sqrt(pd * pd + CFG.RAIL_SPUR_R * CFG.RAIL_SPUR_R - lp[0] * lp[0] - lp[1] * lp[1]);
  if (t > 0) spur.push([lp[0] + dx * t, lp[1] + dz * t]);
  const railSpur = {
    id: id++, cls: 'RAIL', pts: spur, width: 5, closed: false,
    length: polylineLength(spur), laneOffsets: [-1.5, 1.5],
  };
  field.stampRibbon(spur, { type: T.RAIL, roadId: railSpur.id, width: 5, rank: ROAD_RANK.RAIL, mode: 'over' });
  roads.push(railSpur);

  // 轨道环本体压印。rail.pts 来自 catmullRom(closed)，不重复首点，而 stampRibbon 不回头，
  // 必须显式补回首点，否则环上留 ~3.5 格缺口（Task 6/7 实施者实测并回传）。
  // RAIL 带 ROAD_RANK.RAIL：压过道路是预期（高架在上，§5.1.6 的高架/路基分段由 P5 定），
  // 但压过之后格子仍归它——不带 rank 时 P4 的区界带会顺着它铺、把 58% 的轨道格吃掉。
  field.stampRibbon(rail.pts.concat([rail.pts[0]]),
    { type: T.RAIL, roadId: -2, width: 5, rank: ROAD_RANK.RAIL, mode: 'over' });
  return roads;
}

/** 8 邻域偏移表：走链按此固定次序取邻居，同分时先到先得 → 确定性。 */
const NEI = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
/** 4 邻域偏移表：区对归属只认 4 邻域（8 邻域会在节点处把对角第三区也算进来，边数翻倍）。 */
const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
/** 区对键的进制：单扇区的种子（= 区）数上限是 poissonDisk 的 target 400 < 1024。 */
const KEYM = 1024;
/** 「对侧不是本扇区的某个区，而是别区的空地」的哨兵 label（> 任何真 label，故不撞键）。 */
const SEAM = 1023;
/**
 * 区界带宽：规格 §5.3.4 给的是 4~5（「度 3 的节点连出的边取 4，长边取 5」），这里一律取上界 5。
 * 理由是实测的：折线走的是区对里 label 较小那一侧的格子行（一条边一份折线，不去而复返），
 * 偶数宽度的压印是 -1..+2 的不对称区间，靠朝向决定它盖住邻区那一行还是盖不住 ——
 * width 4 时实测有 359 条区界没闭合，BLOCK 连成一整片：最大街区 74479 格（14 个区的量级），
 * 中位 1 格。改成 5（±2）后邻区那一行必被盖住，街区数回到区的数量级（见 secondary.test.js）。
 */
const EDGE_WIDTH = 5;

/**
 * 扇区定义（规格 §5.3 的「待细分区域」）：7 条放射干道把全城切成 7 个楔形，
 * 环状主干再各切成内/外两半 → 14 个区域。判定只用「方位角落在哪两条相邻放射线之间」
 * +「半径在环内还是环外」两个量，不需要多边形布尔运算。环线是超椭圆（r = 330·(1±0.115)），
 * 用理想圆 RING_R 切带来的误差由 inRegion 的 BLOCK 条件吸收：主干带压过的格本就不是 BLOCK。
 */
function sectorDefs(radialDeg) {
  const secs = [];
  for (let s = 0; s < radialDeg.length; s++) {
    const a = (radialDeg[s] + 360) % 360;
    const b = (radialDeg[(s + 1) % radialDeg.length] + 360) % 360;
    const span = ((b - a) % 360 + 360) % 360;
    for (const inner of [true, false]) {
      const rMin = inner ? 0 : CFG.RING_R, rMax = inner ? CFG.RING_R : CFG.HALF * 1.5;
      let x0 = inner ? 0 : 1e9, x1 = inner ? 0 : -1e9;
      let z0 = inner ? 0 : 1e9, z1 = inner ? 0 : -1e9;
      for (const rr of [rMin, rMax]) {
        if (rr === 0) continue;
        for (let d = 0; d <= 360; d++) {                 // 1° 采样的弧 → 楔形包围盒
          const th = (a + span * (d / 360)) * D2R;
          const px = Math.cos(th) * rr, pz = Math.sin(th) * rr;
          if (px < x0) x0 = px; if (px > x1) x1 = px;
          if (pz < z0) z0 = pz; if (pz > z1) z1 = pz;
        }
      }
      secs.push({
        s, inner, a, b, span, id: secs.length,
        dMin: inner ? CFG.INNER_DMIN : CFG.OUTER_DMIN,
        box: [Math.max(-CFG.HALF, Math.floor(x0)), Math.max(-CFG.HALF, Math.floor(z0)),
          Math.min(CFG.HALF, Math.ceil(x1)), Math.min(CFG.HALF, Math.ceil(z1))],
      });
    }
  }
  return secs;
}

/**
 * 逐格扇区归属：把 1.19M 次 atan2/hypot 摊成一次性的表，
 * 之后每扇区每格只做两次定长数组读（撒点/BFS/Lloyd/边界判定都要问「这格归谁」）。
 */
function classifySectors(N, sectors) {
  const owner = new Int8Array(N * N).fill(-1);
  const half = CFG.HALF;
  for (const sec of sectors) {
    const [x0, z0, x1, z1] = sec.box;
    for (let x = x0; x <= x1; x++) {
      const base = (x + half) * N + half;
      for (let z = z0; z <= z1; z++) {
        const i = base + z;
        if (owner[i] >= 0) continue;                     // 楔形边界格先到先得（放射线自身已被主干占用）
        const r = Math.hypot(x, z);
        if (sec.inner ? r > CFG.RING_R : r <= CFG.RING_R) continue;
        let deg = Math.atan2(z, x) / D2R; if (deg < 0) deg += 360;
        const hit = sec.a < sec.b
          ? (deg >= sec.a && deg < sec.b)
          : (deg >= sec.a || deg < sec.b);               // 跨 ±180° 的楔形
        if (hit) owner[i] = sec.id;
      }
    }
  }
  return owner;
}

/**
 * 区界即道路（规格 §5.3.4）：一条 Voronoi 边 = 一条次级路折线。
 * 三步：① 逐格找「本区 + 唯一的邻区」，按区对 (u,v)（u<v）归桶，且**只收 label===u 的一侧**
 *   ——两侧都收会让每条边变成两格宽的蛇形带，折线去而复返，一条路变成自己的复本。
 *   邻区那一行由带宽盖住（EDGE_WIDTH，见其注释）。
 * ② 桶内按 8 邻域切连通块 = 一条完整的 Voronoi 边（也就是 §5.3.5 删段的单位）。
 * ③ 块内贪心走链：直行优先、同分按 NEI 序先到先得；走不动就连到块内最近的未走格。
 *   「一条边只产出一条折线」靠的是先切块再走链，而不是靠走链本身：先前那版按「消耗边」
 *   走链，实测把区界图剁成 1737 段（中位 6 格）碎链，看着像街、跑起来是断头路。
 * 刻意不把 label = -1 一律当边界：那样每个区的整圈外沿都会变成一条贴骨街，实测次级路格
 * 从 ~90k 涨到 190k（占全城 16%），而且把 P4 的区界带压到 P2 的轨道上（见 ROAD_RANK.RAIL）。
 * 但 -1 里有一类必须补：**扇区缝合线**。扇区是按「放射线方位角 + RING_R 理想圆」切的（规格
 * §5.3），而真正的放射干线是 ±7.5° 逐段摆动出去的折线、末端还只到 r=500 —— 于是楔形边和
 * 干线之间会留下一条两侧都是 BLOCK 的缝，两侧各自 BFS 都把它当外沿（label=-1）、谁都不压路，
 * 整条缝就把 14 个扇区缝回成一整片：实测最大的 BLOCK 连通块 73341 格（跨 3 个外圈扇区）。
 * 判据是「邻格 label<0 且它是 BLOCK 且它属于编号不比我大的扇区」——由扇区号大的一侧压，
 * 每处缝合恰好压一次；对侧是主干/轨道带（cellRank>0 ⇒ t≠BLOCK）时仍然不压。
 * 节点格（4 邻域里出现 ≥2 个不同邻区）不再整格丢弃：它归「最小的那个区对」，剩下的邻接由
 * closeSeams 兜住。buf = { mark, used, done }：三条 N*N 复用数组，跨扇区不清空（自己抹自己
 * 用过的格子）。
 */
function sectorStreets(field, owner, label, sec, buf) {
  const { N, half } = field;
  const [x0, z0, x1, z1] = sec.box;
  const { mark, used, done } = buf;
  const buckets = [];
  const at = new Map();
  let unlabeled = 0;
  for (let x = x0; x <= x1; x++) {
    const base = (x + half) * N + half;
    for (let z = z0; z <= z1; z++) {
      const i = base + z;
      const me = label[i];
      if (me < 0) {
        // 本扇区内够不着种子的空地（被干线带围出的飞地）：留给 §8.3 的碎块吸收，这里只计数
        if (owner[i] === sec.id && field.t[i] === T.BLOCK) unlabeled++;
        continue;
      }
      let other = -1;
      for (let k = 0; k < 4; k++) {
        const ax = D4[k][0], az = D4[k][1];
        if ((ax > 0 && x >= x1) || (ax < 0 && x <= x0) || (az > 0 && z >= z1) || (az < 0 && z <= z0)) continue;
        const j = i + ax * N + az;
        const L = label[j];
        let cand = -1;
        if (L === me) continue;
        if (L >= 0) cand = L;
        else if (owner[j] <= sec.id && field.t[j] === T.BLOCK) cand = SEAM;  // 缝合线（见上方注释）
        if (cand < 0) continue;
        if (other < 0 || cand < other) other = cand;   // 节点格归它最小的那个区对，不再整格丢弃
      }
      if (other < 0 || me > other) continue;
      const key = me * KEYM + other;
      let bi = at.get(key);
      if (bi === undefined) {
        bi = buckets.length; at.set(key, bi);
        buckets.push({ u: me, v: other, seam: other === SEAM, cells: [] });
      }
      mark[i] = bi + 1;
      buckets[bi].cells.push(i);
    }
  }

  const out = [];
  const stack = [];
  for (let bi = 0; bi < buckets.length; bi++) {
    const cells = buckets[bi].cells, tag = bi + 1;
    for (let s = 0; s < cells.length; s++) {
      if (used[cells[s]]) continue;
      const comp = [];
      stack.length = 0; stack.push(cells[s]); used[cells[s]] = 1;
      while (stack.length) {
        const i = stack.pop();
        comp.push(i);
        const cx = (i / N) | 0, cz = i % N;
        for (let k = 0; k < 8; k++) {
          const nx = cx + NEI[k][0], nz = cz + NEI[k][1];
          if (nx < 0 || nx >= N || nz < 0 || nz >= N) continue;
          const j = nx * N + nz;
          if (used[j] || mark[j] !== tag) continue;
          used[j] = 1; stack.push(j);
        }
      }
      out.push({ u: buckets[bi].u, v: buckets[bi].v, seam: buckets[bi].seam, chain: orderChain(field, comp, mark, tag, done) });
    }
    for (const i of cells) { mark[i] = 0; used[i] = 0; }
  }
  return { streets: out, unlabeled };
}

/**
 * 一条边（块）→ 一串有序格子。起点取块内最小索引（= (x,z) 字典序最小），每步走 8 邻域里
 * 与上一步方向点积最大的未走格，走不动就近跳到块内未走格（跳距实测 ≤ 3，带宽盖掉）。
 */
function orderChain(field, comp, mark, tag, done) {
  const { N, half } = field;
  const pts = [];
  let cur = comp[0];
  for (let i = 1; i < comp.length; i++) if (comp[i] < cur) cur = comp[i];
  let dx = 0, dz = 0, left = comp.length;
  while (left > 0) {
    done[cur] = 1; left--;
    const cx = (cur / N) | 0, cz = cur % N;
    pts.push([cx - half, cz - half]);
    let bj = -1, bs = -2, bax = 0, baz = 0;
    for (let k = 0; k < 8; k++) {
      const ax = NEI[k][0], az = NEI[k][1];
      const nx = cx + ax, nz = cz + az;
      if (nx < 0 || nx >= N || nz < 0 || nz >= N) continue;
      const j = nx * N + nz;
      if (done[j] || mark[j] !== tag) continue;
      const s = dx * ax + dz * az;                        // 1 直行 > 0 侧向 > 负 回头
      if (s > bs) { bs = s; bj = j; bax = ax; baz = az; }
    }
    if (bj < 0) {                                         // 就近跳接：确定性 = 距离 then 索引
      let bd = Infinity;
      for (let i = 0; i < comp.length; i++) {
        const j = comp[i];
        if (done[j]) continue;
        const jx = (j / N) | 0, jz = j % N;
        const d = (jx - cx) * (jx - cx) + (jz - cz) * (jz - cz);
        if (d < bd || (d === bd && j < bj)) { bd = d; bj = j; }
      }
      dx = 0; dz = 0;
      if (bj < 0) break;
      cur = bj;
      continue;
    }
    dx = bax; dz = baz; cur = bj;
  }
  for (const i of comp) done[i] = 0;
  return pts;
}


/**
 * 补皮（规格 §5.3.4「区界格及其 4 邻域」的下半句）：把这条边的**邻区那一行**也写成同一条路。
 * 为什么非补不可：45° 楼梯段上，stampRibbon 的法向偏移是 (-0.707, +0.707)·w，
 * w = -2..2 取整后只剩 (x+1,z-1)/(x,z)/(x-1,z+1) 三个斜向格 —— 轴向相邻的邻区那一行压根不在
 * 带宽里，于是两区之间没有路、街块从缝里连成一片（实测 1080 处这样的缝，最大街区 7469 格）。
 * dir 直接从已压好的中心格抄，免得在这里再实现一份 48 方向量化。
 */
function paintInterfaceRow(field, owner, label, sec, chain, roadId) {
  const { N, half } = field;
  const [x0, z0, x1, z1] = sec.box;
  for (let c = 0; c < chain.length; c++) {
    const [x, z] = chain[c];
    const i = (x + half) * N + z + half;
    const me = label[i];
    const d = field.dir[i];
    for (let k = 0; k < 4; k++) {
      const ax = D4[k][0], az = D4[k][1];
      if ((ax > 0 && x >= x1) || (ax < 0 && x <= x0) || (az > 0 && z >= z1) || (az < 0 && z <= z0)) continue;
      const j = i + ax * N + az;
      const L = label[j];
      const across = (L >= 0 && L !== me)
        || (L < 0 && owner[j] <= sec.id && field.t[j] === T.BLOCK);   // 缝合线对侧同理
      if (!across || field.cellRank[j] > ROAD_RANK.MINOR) continue;   // 主干/轨道让位（§5.2 等级序）
      field.t[j] = T.ROAD_MINOR;
      field.roadId[j] = roadId;
      field.cellRank[j] = ROAD_RANK.MINOR;
      field.dir[j] = d;
    }
  }
}

/**
 * 闭合兜底（规格 §5.3.4「区界格及其 4 邻域」）：本扇区里还有「两侧是不同区、中间却没有路」
 * 的 BLOCK 格吗？有就并入离它最近的那条次级路（roadId 与 dir 都从那条路抄，于是
 * secondary.test.js 第 2 条「每个 ROAD_MINOR 格都归属某条存在的次级路」仍然成立）。
 * 触发场景：被 chain.length<4 丢掉的碎边、节点格里带宽没盖到的那几格。
 * 只扫一遍、只改 BLOCK→ROAD，label 不参与写入故不会级联，扫描序固定 ⇒ 确定性。
 */
function closeSeams(field, label, sec) {
  const { N, half } = field;
  const [x0, z0, x1, z1] = sec.box;
  let painted = 0;
  const tryPaint = (x, z, i, me) => {
    for (let r = 1; r <= 4; r++) {
      for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
        if (Math.max(Math.abs(a), Math.abs(b)) !== r) continue;
        const j = field.inb(x + a, z + b) ? field.idx(x + a, z + b) : -1;
        if (j < 0 || field.cellRank[j] !== ROAD_RANK.MINOR) continue;
        field.t[i] = T.ROAD_MINOR;
        field.roadId[i] = field.roadId[j];
        field.cellRank[i] = ROAD_RANK.MINOR;
        field.dir[i] = field.dir[j];
        painted++;
        return true;
      }
    }
    return false;
  };
  for (let x = x0; x <= x1; x++) {
    let i = (x + half) * N + z0 + half;
    for (let z = z0; z <= z1; z++, i++) {
      const me = label[i];
      if (me < 0 || field.t[i] !== T.BLOCK) continue;
      let across = false;
      for (let k = 0; k < 4; k++) {
        const ax = D4[k][0], az = D4[k][1];
        if ((ax > 0 && x >= x1) || (ax < 0 && x <= x0) || (az > 0 && z >= z1) || (az < 0 && z <= z0)) continue;
        const j = i + ax * N + az;
        const L = label[j];
        if ((L >= 0 && L !== me) || (L < 0 && field.t[j] === T.BLOCK)) { across = true; break; }
      }
      if (!across) continue;
      tryPaint(x, z, i, me);
    }
  }
  return painted;
}

/** 阶梯链 → 折线：丢掉共线的中间点（规格 §5.3.6：区界方向不受 7.5° 约束，靠带宽掩盖锯齿） */
function chainToPolyline(chain) {
  if (chain.length < 3) return chain.slice();
  const pts = [chain[0]];
  for (let i = 1; i < chain.length - 1; i++) {
    const a = chain[i - 1], b = chain[i], c = chain[i + 1];
    if (b[0] - a[0] !== c[0] - b[0] || b[1] - a[1] !== c[1] - b[1]) pts.push(b);
  }
  pts.push(chain[chain.length - 1]);
  return pts;
}

/**
 * 扇区内的「区邻接图」：点 = Voronoi 区，边 = 一条次级路（= 一条完整 Voronoi 边）。
 * 路网连通 ⟺ 这张图连通（边的并集相连当且仅当区能被保留的边从一个走到另一个），
 * 所以「删掉一条边后两端是否仍连通」就是 §5.3.5 要的判定，比在全场上重跑 BFS 便宜三个量级。
 * taken 记「这个区有没有已经被删过」——规格写的是删一条边 ⇒ **两区**合并，见 deleteRuns。
 */
function regionGraph(minors) {
  const graphs = new Map();
  for (const r of minors) {
    let G = graphs.get(r.sec);
    if (!G) { G = { nid: new Map(), inc: [], edges: [], taken: [] }; graphs.set(r.sec, G); }
    const nid = (l) => {
      let n = G.nid.get(l);
      if (n === undefined) { n = G.inc.length; G.nid.set(l, n); G.inc.push([]); G.taken.push(false); }
      return n;
    };
    const a = nid(r.u), b = nid(r.v);
    const e = G.edges.length;
    G.edges.push({ a, b, gone: false });
    r.gi = e;
    G.inc[a].push(e);
    if (b !== a) G.inc[b].push(e);
  }
  return graphs;
}

/** 去掉边 gi 之后，它的两端是否仍然连通（平行边算两条路，故多邻接的区不会被误判为桥）。 */
function survivesRemoval(G, gi) {
  const e = G.edges[gi];
  if (e.a === e.b) return true;
  const seen = new Uint8Array(G.inc.length);
  const q = [e.a];
  seen[e.a] = 1;
  while (q.length) {
    const n = q.pop();
    for (const k of G.inc[n]) {
      if (k === gi || G.edges[k].gone) continue;
      const m = G.edges[k].a === n ? G.edges[k].b : G.edges[k].a;
      if (m === e.b) return true;                 // 仍有路 → 删掉 gi 不会把区切成两半
      if (!seen[m]) { seen[m] = 1; q.push(m); }
    }
  }
  return false;
}

/**
 * 随机删段（规格 §5.3.5）：短边以 CFG.MINOR_DELETE_P 的概率整条放弃，制造丁字/断头；
 * 长边一律保留（它们是连通性的骨架）。三条 brief 没写、但规格/实测逼出来的规矩：
 * ① 删除前必须确认该边两端仍连通，否则放弃这次删除 —— 无此闸门时实测 12% 删除会把
 *    238 段次级路（2911 格）摘成够不着主干的飞地，§5.3.5 的「无区域被孤立」正是拦这个。
 *    缝合线边（r.seam）不参与抽签：它不是「两个区之间的边」，删掉就是把两个扇区缝回一片。
 * ② 「两区合并」按字面执行：一条边的两端若已被别的删除合过区就放弃，否则连片删除会把
 *    8~9 个区并成一坨（实测最大街区 25449 格 ≈ 9 个区，§15 的街区面积带是 400~2600）。
 * ③ 抽签发生在**压印之前**，且按扇区成批做：brief 是「先全压上、再按 roadId 回头擦」，
 *    而两条次级路的带宽在交叉处互相覆盖（同等级可覆盖，见 §5.2），被擦掉的那条会把
 *    活下来那条的路面上重叠格一起带走 —— 实测因此在路网上打出几十个洞，最大街区
 *    从 5037 格（p=0）涨到 20005 格。改成压前抽签，保留的路就一根格子都不掉。
 */
function deleteRuns(made, rng, stats) {
  const graphs = regionGraph(made.map((m) => m.r));
  const keep = [];
  for (const m of made) {
    const r = m.r;
    let drop = false;
    if (!r.seam && r.length <= 260) {
      if (stats) stats.candidates++;
      if (rng() < CFG.MINOR_DELETE_P) {
        const G = graphs.get(r.sec);
        const e = G.edges[r.gi];
        if (!G.taken[e.a] && !G.taken[e.b] && survivesRemoval(G, r.gi)) {
          G.taken[e.a] = G.taken[e.b] = true;           // 两个区各自只允许合并一次
          e.gone = true;
          drop = true;
          if (stats) stats.deleted++;
        } else if (stats) stats.refused++;        // 桥边 / 已经合过区 → 放弃这次删除
      }
    }
    if (!drop) keep.push(m);
  }
  if (stats) {
    // §5.3.5 的「无区域被孤立」：删完之后还有没有任何一个区一条路都不剩。
    // 叶子区（度 1）是主要触发形态 —— 挡在它前面的正是「这条边是桥就不删」那道闸门。
    for (const G of graphs.values()) {
      for (let n = 0; n < G.inc.length; n++) {
        if (G.inc[n].every((k) => G.edges[k].gone)) stats.isolated++;
      }
    }
  }
  return keep;
}

/**
 * P4 次级路网：14 个扇区各自 Poisson 撒点 → 多源 BFS 离散 Voronoi → 3 轮 Lloyd →
 * 区界压成 width 4 的 MINOR 路 → 随机删段（规格 §5.3）。
 * `rail` 在本步不直接读：轨道格在 P3 已被压成 T.RAIL，而 inRegion 只收 BLOCK 格，
 * 于是次级网天然绕开轨道、并在轨道两侧各自成区；参数留给后续形态调整。
 * `stats` 是可选出参（诊断用）：只被写、不参与任何判定，也不动 rng，故不影响确定性。
 */
export function buildSecondaries(field, roads, rail, rng, stats) {
  if (!CFG.VORONOI) return [];
  const radialDeg = roads.filter((r) => r.cls === 'RADIAL')
    .map((r) => Math.atan2(r.pts[0][1], r.pts[0][0]) / D2R)
    .sort((a, b) => a - b);
  if (radialDeg.length < 2) return [];

  const { N, half } = field;
  const sectors = sectorDefs(radialDeg);
  const owner = classifySectors(N, sectors);
  const buf = { mark: new Uint16Array(N * N), used: new Uint8Array(N * N), done: new Uint8Array(N * N) };
  const out = [];
  let id = roads.reduce((m, r) => (r.id >= m ? r.id + 1 : m), 0);
  const minor = ROAD.MINOR;

  for (const sec of sectors) {
    const [x0, z0, x1, z1] = sec.box;
    const inRegion = (x, z) => {
      const i = (x + half) * N + z + half;
      return owner[i] === sec.id && field.t[i] === T.BLOCK;
    };
    let seeds = poissonDisk(x0, z0, x1, z1, sec.dMin, rng, inRegion, 400);
    if (seeds.length < 2) continue;
    let res = field.multiSourceBFS(seeds, inRegion);
    let area = res.sizes.reduce((a, b) => a + b, 0);

    for (let it = 0; it < CFG.LLOYD_ITERS; it++) {       // Lloyd 3 轮（§5.3.3）
      const sx = new Float64Array(seeds.length), sz = new Float64Array(seeds.length);
      const cnt = new Int32Array(seeds.length);
      for (let x = x0; x <= x1; x++) {
        let i = (x + half) * N + z0 + half;
        for (let z = z0; z <= z1; z++, i++) {
          const L = res.label[i];
          if (L < 0) continue;
          sx[L] += x; sz[L] += z; cnt[L]++;
        }
      }
      let moved = 0;
      seeds = seeds.map(([px, pz], k) => {
        if (!cnt[k]) return [px, pz];
        const nx = Math.round(sx[k] / cnt[k]), nz = Math.round(sz[k] / cnt[k]);
        if (!inRegion(nx, nz)) return [px, pz];
        moved++;
        return [nx, nz];
      });
      const prev = res.sizes;
      res = field.multiSourceBFS(seeds, inRegion);
      // 松弛有效性：本区格数与上轮之差的绝对值和。种子原地不动时它是 0。
      let shift = 0;
      for (let k = 0; k < res.sizes.length; k++) shift += Math.abs(res.sizes[k] - (prev[k] || 0));
      if (stats) stats.lloyd.push({ s: sec.id, it, seeds: seeds.length, moved, shift, area });
      if (!moved) break;
      area = res.sizes.reduce((a, b) => a + b, 0);
    }

    const { streets, unlabeled } = sectorStreets(field, owner, res.label, sec, buf);
    const bcells = streets.reduce((a, s) => a + s.chain.length, 0);
    if (stats) {
      stats.sectors++; stats.edges += streets.length; stats.boundary += bcells;
      stats.unlabeled += unlabeled;
      stats.seam += streets.filter((s) => s.seam).length;
    }
    if (bcells < 40) continue;                      // 区界太短 = 这个扇区没被细分
    const made = [];
    for (const st of streets) {
      if (st.chain.length < 1) continue;
      const pts = st.chain.length >= 2
        ? chainToPolyline(st.chain)
        : [st.chain[0], [st.chain[0][0] + 1, st.chain[0][1]]];
      const r = {
        id: id++, cls: 'MINOR', pts, width: EDGE_WIDTH, closed: false,
        length: Math.max(1, polylineLength(pts)), laneOffsets: [-1, 1],
        sec: sec.id, u: st.u, v: st.v, seam: st.seam,
      };
      made.push({ r, chain: st.chain });
    }
    for (const { r, chain } of deleteRuns(made, rng, stats)) {
      field.stampRibbon(r.pts, {
        type: minor.t, width: EDGE_WIDTH, roadId: r.id, rank: ROAD_RANK.MINOR, mode: 'over',
      });
      paintInterfaceRow(field, owner, res.label, sec, chain, r.id);
      out.push(r);
    }
    const closed = closeSeams(field, res.label, sec);   // 必须无条件跑：诊断不得改变产出
    if (stats) {                                  // 闭合性体检：还剩下多少条「两区之间没有路」的缝
      stats.closed += closed;
      const lab = res.label;
      for (let x = x0; x <= x1; x++) {
        let i = (x + half) * N + z0 + half;
        for (let z = z0; z <= z1; z++, i++) {
          const me = lab[i];
          if (me < 0 || field.t[i] !== T.BLOCK) continue;
          for (let k = 0; k < 4; k++) {
            const ax = D4[k][0], az = D4[k][1];
            if ((ax > 0 && x >= x1) || (ax < 0 && x <= x0) || (az > 0 && z >= z1) || (az < 0 && z <= z0)) continue;
            const j = i + ax * N + az;
            if (lab[j] >= 0 && lab[j] !== me && field.t[j] === T.BLOCK) stats.leaks++;
          }
        }
      }
    }
  }
  if (stats) stats.roads = out.length;
  return out;
}

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
    const clampH = (v) => quantize(v);
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

/** 住宅街区内的小巷（规格 §5.4）：非破坏性、保留 blockId、不重跑连通域。 */
export function buildAlleys(field, blocks, rng) {
  const out = [];
  for (const b of blocks) {
    if (b.district !== DISTRICT.LOW_RISE_RESI && b.district !== DISTRICT.TRADITIONAL) continue;
    if (b.area < CFG.ALLEY_MIN_AREA) continue;
    if (rng() > 0.55) continue;
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
        field.t[i] = T.BLOCK_ALLEY;
        carved++;
      }
      if (carved < 12) continue;
      out.push({ blockId: b.id, district: b.district, pts, h: b.h });
    }
  }
  return out;
}
