/** 临街地块切分（规格 §10）。最大内接矩形保证零压路。
 *  U3 街墙对齐：先按 (roadId, face) 分组，连续段共用建筑线与统一退线；
 *  面阔按用途约束，超宽在 band 内递归二分。 */
import { CFG, T, DISTRICT as D, LOT, isRoad } from './config.js';
import { hash2 } from '../rng.js';

/** face 外法向，与 src/residential.js 的 FRONT 同序：0:+z 1:-z 2:+x 3:-x */
export const FACE_OF = [[0, 1], [0, -1], [1, 0], [-1, 0]];

/** depth=最大进深；spacing=基准间距的 [lo,hi] 提示（实际取中值 ×(1±15%)）；kind=用途 */
const RULE = {
  [D.LOW_RISE_RESI]:    { depth: 16, spacing: [7, 13], kind: LOT.HOUSE },
  [D.TRADITIONAL]:      { depth: 16, spacing: [8, 14], kind: LOT.HOUSE },
  [D.HIGH_RISE_RESI]:   { depth: 22, spacing: [14, 22], kind: LOT.HOUSE },
  [D.DANCHI]:           { depth: 28, spacing: [22, 34], kind: LOT.TOWER },
  [D.COMMERCIAL]:       { depth: 22, spacing: [11, 17], kind: LOT.SHOP },
  [D.STATION_FRONT]:    { depth: 26, spacing: [14, 22], kind: LOT.SHOP },
  [D.ENTERTAINMENT]:    { depth: 20, spacing: [8, 13], kind: LOT.SHOP },
  [D.ELECTRONICS]:      { depth: 22, spacing: [10, 16], kind: LOT.SHOP },
  [D.CBD]:              { depth: 40, spacing: [24, 40], kind: LOT.TOWER },
  [D.SUB_CENTER]:       { depth: 38, spacing: [22, 36], kind: LOT.TOWER },
  [D.PORT_INDUSTRY]:    { depth: 60, spacing: [30, 52], kind: LOT.TOWER },
  [D.FREIGHT_YARD]:     { depth: 55, spacing: [34, 60], kind: LOT.YARD },
  [D.UNIVERSITY]:       { depth: 40, spacing: [24, 40], kind: LOT.TOWER },
  [D.SCHOOL]:           { depth: 30, spacing: [24, 30], kind: LOT.SHOP },
  [D.HOSPITAL]:         { depth: 30, spacing: [22, 30], kind: LOT.SHOP },
  [D.PUBLIC]:           { depth: 18, spacing: [12, 20], kind: LOT.SHOP },
  [D.LANDMARK]:         { depth: 30, spacing: [24, 30], kind: LOT.TOWER },
  [D.STADIUM]:          { depth: 40, spacing: [28, 40], kind: LOT.YARD },
  [D.PARK_LARGE]:       { depth: 20, spacing: [16, 28], kind: LOT.OPEN },
  [D.PARK_SMALL]:       { depth: 14, spacing: [12, 20], kind: LOT.OPEN },
  [D.GREENWAY]:         { depth: 14, spacing: [12, 20], kind: LOT.OPEN },
};

/** U3 面阔约束 [min,max]：住宅 5–9、商业 6–12、办公 8–16；yard/open 不限（只受 MIN_PLOT_SIDE） */
const FRONTAGE = {
  [LOT.HOUSE]: [5, 9],
  [LOT.SHOP]: [6, 12],
  [LOT.TOWER]: [8, 16],
};

/** U3 退线按道路等级：RING/RADIAL 3、ARTERIAL 2、MINOR 1（同段一致） */
function setbackOf(streetT, rank) {
  if (streetT === T.ROAD_RING || streetT === T.ROAD_RADIAL) return 3;
  if (streetT === T.ROAD_ARTERIAL) return 2;
  if (streetT === T.ROAD_MINOR) return 1;
  // 人行道格：cellRank 与其所属路一致（stampRibbon 写入）
  if (rank >= ROAD_RANK_HIGH) return 3;
  if (rank === 2) return 2;
  return 1;
}
const ROAD_RANK_HIGH = 3; // RADIAL=3 RING=4

/** 直方图上贴建筑线的最大内接矩形：底边固定在 building line 上（U3 街墙） */
function maxRectFront(h) {
  const n = h.length;
  const stack = [];
  let best = null;
  for (let i = 0; i <= n; i++) {
    const cur = i < n ? h[i] : 0;
    while (stack.length && cur < h[stack[stack.length - 1]]) {
      const height = h[stack.pop()];
      const left = stack.length ? stack[stack.length - 1] + 1 : 0;
      const right = i - 1;
      const w = right - left + 1;
      const area = height * w;
      if (height >= CFG.MIN_PLOT_SIDE && w >= CFG.MIN_PLOT_SIDE && (!best || area > best.area)) {
        best = { i0: left, i1: right, depth: height, area };
      }
    }
    stack.push(i);
  }
  return best;
}

export function buildPlots(blocks, field) {
  const plots = [];
  for (const b of blocks) {
    const rule = RULE[b.district] || { depth: 18, spacing: [10, 16], kind: LOT.SHOP };
    const fr = FRONTAGE[rule.kind] || null;
    const allowed = new Set(b.cells);
    for (const i of b.cells) if (field.t[i] === T.BLOCK_ALLEY) allowed.delete(i);
    const taken = new Set();

    // ---- 0. 临街格按 face 收集（首个命中 face 归属，保持原语义）----
    const faceCells = [[], [], [], []];
    for (const i of allowed) {
      const x = Math.floor(i / field.N) - field.half, z = (i % field.N) - field.half;
      for (let f = 0; f < 4; f++) {
        const [ox, oz] = FACE_OF[f];
        const j = field.inb(x + ox, z + oz) ? field.idx(x + ox, z + oz) : -1;
        if (j >= 0 && (isRoad(field.t[j]) || field.t[j] === T.SIDEWALK)) {
          faceCells[f].push([x, z, field.roadId[j], field.t[j], field.cellRank[j]]);
          break;
        }
      }
    }

    for (let f = 0; f < 4; f++) {
      const along = f < 2 ? 0 : 1, perp = 1 - along;
      const streetPlus = f === 0 || f === 2; // 街在 perp 正向

      // ---- 1. 按 roadId 分组（U3：切分前先分组）----
      const byRoad = new Map();
      for (const c of faceCells[f]) {
        const k = c[2];
        if (!byRoad.has(k)) byRoad.set(k, []);
        byRoad.get(k).push(c);
      }

      for (const cells of byRoad.values()) {
        cells.sort((p, q) => (p[along] - q[along]) || (p[perp] - q[perp]));
        // 同组统一退线（按道路等级）
        let rankMax = 0, st = T.ROAD_MINOR;
        for (const c of cells) {
          if (c[4] > rankMax) { rankMax = c[4]; st = c[3]; }
          else if (c[4] === rankMax && isRoad(c[3])) st = c[3];
        }
        const S = setbackOf(st, rankMax);

        // ---- 2. 连续段：along 连续且 perp 不跳变 ----
        let seg = [], segIdx = 0;
        const segs = [];
        for (const c of cells) {
          if (seg.length) {
            const p = seg[seg.length - 1];
            const dA = c[along] - p[along], dP = Math.abs(c[perp] - p[perp]);
            if (dA > 1 || dP > 2) { segs.push(seg); seg = []; }
          }
          seg.push(c);
        }
        if (seg.length) segs.push(seg);

        for (const segment of segs) {
          if (segment.length < 2) continue;
          cutSegment(segment);
          segIdx++;
        }

        /** 3. band 切分：基准间距 ×(1±15%)，同段方差收窄 */
        function cutSegment(segment) {
          const base = (rule.spacing[0] + rule.spacing[1]) / 2;
          let u = segment[0][along];
          const uEnd = segment[segment.length - 1][along];
          while (u <= uEnd) {
            const r = hash2(u + b.id * 977, f * 31 + segIdx * 13);
            const spacing = Math.max(CFG.MIN_PLOT_SIDE + 1,
              Math.round(base * (1 + (r - 0.5) * 0.3)));
            placeBand(segment, u, u + spacing - 1);
            u += spacing;
          }
        }

        /** band 内放一栋（超宽递归二分）：建筑线贴 front，进深入街区 */
        function placeBand(segment, u0, u1) {
          const band = segment.filter((c) => c[along] >= u0 && c[along] <= u1);
          if (band.length < 2) return;

          const heightsAt = (a0, a1, B) => {
            const h = [];
            for (let a = a0; a <= a1; a++) {
              let d = 0;
              while (d < rule.depth) {
                const p = streetPlus ? B - d : B + d;
                const x = along === 0 ? a : p, z = along === 0 ? p : a;
                const i = field.inb(x, z) ? field.idx(x, z) : -1;
                if (i < 0 || !allowed.has(i) || taken.has(i)) break;
                d++;
              }
              h.push(d);
            }
            return h;
          };
          const buildLine = (cells, aMid) => {
            let ref = cells[0], bestD = 1e9;
            for (const c of cells) {
              const d = Math.abs(c[along] - aMid);
              if (d < bestD) { bestD = d; ref = c; }
            }
            // 建筑线 = 临街格退 S：同段同 setback ⇒ 临街距离一致
            return streetPlus ? ref[perp] - S : ref[perp] + S;
          };

          // 第一遍：band 中点定建筑线 → 找贴线最大矩形
          const a0 = band[0][along], a1 = band[band.length - 1][along];
          const B0 = buildLine(band, (a0 + a1) / 2);
          const best = maxRectFront(heightsAt(a0, a1, B0));
          if (!best) return;

          const w = best.i1 - best.i0 + 1;
          const minF = fr ? fr[0] : CFG.MIN_PLOT_SIDE;
          const maxF = fr ? fr[1] : 1e9;
          // U3 面阔约束：超出在 band 内递归二分
          if (w > maxF) {
            const m = best.i0 + ((best.i1 - best.i0) >> 1);
            placeBand(segment, a0 + best.i0, a0 + m);
            placeBand(segment, a0 + m + 1, a0 + best.i1);
            return;
          }

          // 第二遍：以矩形自身中点重定建筑线（临街距离钉死为 S+1）
          const cellsR = band.filter((c) => c[along] >= a0 + best.i0 && c[along] <= a0 + best.i1);
          const B = buildLine(cellsR.length ? cellsR : band, a0 + best.i0 + w / 2);
          const h2 = heightsAt(a0 + best.i0, a0 + best.i1, B);
          let depth = 1e9;
          for (const v of h2) depth = Math.min(depth, v);
          if (depth < CFG.MIN_PLOT_SIDE) return;
          if (w < minF) return;

          const q0 = streetPlus ? B - depth + 1 : B;
          const q1 = streetPlus ? B : B + depth - 1;
          const x0 = along === 0 ? a0 + best.i0 : q0, x1 = along === 0 ? a0 + best.i1 : q1;
          const z0 = along === 0 ? q0 : a0 + best.i0, z1 = along === 0 ? q1 : a0 + best.i1;

          // 街角：band 端点同时临两个 face 的路 → plot.corner
          let corner = false;
          for (const c of cellsR.length ? [cellsR[0], cellsR[cellsR.length - 1]] : []) {
            let faces = 0;
            for (let f2 = 0; f2 < 4; f2++) {
              const [ox, oz] = FACE_OF[f2];
              const j = field.inb(c[0] + ox, c[1] + oz) ? field.idx(c[0] + ox, c[1] + oz) : -1;
              if (j >= 0 && (isRoad(field.t[j]) || field.t[j] === T.SIDEWALK)) faces++;
            }
            if (faces >= 2) { corner = true; break; }
          }

          const plot = {
            id: plots.length, blockId: b.id, rect: { x0, z0, x1, z1 },
            cx: (x0 + x1) / 2, cz: (z0 + z1) / 2,
            w: x1 - x0 + 1, d: z1 - z0 + 1,
            face: f, roadId: band[0][2], district: b.district, h: b.h, kind: rule.kind,
            setback: S, corner,
          };
          plots.push(plot);
          b.plots.push(plot.id);
          for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) taken.add(field.idx(x, z));
        }
      }
    }
  }

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
