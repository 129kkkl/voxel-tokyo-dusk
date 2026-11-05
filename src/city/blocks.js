/** 街区派生（规格 §8）：道路切出来的连通域，不手画任何多边形。 */
import { CFG, T, isRoad, isWater } from './config.js';

export function extractBlocks(field) {
  const raw = field.connectedComponents((t) => t === T.BLOCK);
  const byIdx = new Map();
  raw.forEach((c, k) => { c.id = k; byIdx.set(k, c); });
  const idxToComp = new Map();
  for (const c of raw) for (const i of c.cells) idxToComp.set(i, c.id);

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
    if (pocket.has(c.id)) { for (const i of c.cells) field.t[i] = T.POCKET; continue; }
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
    if (!front.size && c.area < 400) {
      for (const i of c.cells) field.t[i] = T.POCKET;
      continue;
    }
    const hist = new Map();
    for (const i of c.cells) hist.set(field.h[i], (hist.get(field.h[i]) || 0) + 1);
    const h = [...hist.entries()].sort((a, b) => b[1] - a[1])[0][0];
    for (const i of c.cells) { field.h[i] = h; field.blockId[i] = out.length; }
    out.push({
      id: out.length, cells: c.cells, bbox: c.bbox, centroid: c.centroid,
      area: c.cells.length, perimeter,
      frontage: [...front.entries()].sort((a, b) => b[1] - a[1]).map(([roadId, n]) => ({ roadId, n })),
      h, district: null, plots: [],
    });
  }
  return out;
}
