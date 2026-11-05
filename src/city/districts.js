/** 逐街区分区（规格 §9）。配额制保证设施不消失、不扎堆。 */
import { CFG, DISTRICT as D, T } from './config.js';
import { hash2 } from '../rng.js';

/** 各分区最少块数（§9.2）。 */
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

  for (const b of blocks) b.district = null;

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

  for (const b of blocks) {
    if (b.district) continue;
    const d = Math.abs(rOf(b) - railR);
    b.district = d < 150 ? D.HIGH_RISE_RESI : D.LOW_RISE_RESI;
  }

  for (const b of blocks) if (!b.district) b.district = rOf(b) < ringR ? D.COMMERCIAL : D.LOW_RISE_RESI;

  const take = (k, pred, n = QUOTA[k]) => {
    const cand = blocks.filter((b) => !b.quotaUsed && pred(b))
      .sort((a, b) => hash2(a.id, 777) - hash2(b.id, 777))
      .slice(0, n);
    for (const b of cand) { b.district = k; b.quotaUsed = true; }
    return cand;
  };

  const EXPENDABLE = new Set([
    D.COMMERCIAL, D.LOW_RISE_RESI, D.HIGH_RISE_RESI, D.STATION_FRONT, D.PORT_INDUSTRY, D.GREENWAY,
  ]);
  const cluster = (k, seedPred, n) => {
    const seed = blocks.filter((b) => !b.quotaUsed && EXPENDABLE.has(b.district) && seedPred(b))
      .sort((a, b) => hash2(a.id, 131) - hash2(b.id, 131))[0];
    if (!seed) {
      // 兜底：放宽可动集合再取一次，保证配额优先于形状（规格 §9.2）
      const alt = blocks.filter((b) => !b.quotaUsed && seedPred(b))
        .sort((a, b) => hash2(a.id, 131) - hash2(b.id, 131))[0];
      if (!alt) return [];
      alt.district = k; alt.quotaUsed = true;
      const got = [alt];
      while (got.length < n) {
        let next = null, bd = 1e9;
        for (const b of blocks) {
          if (b.quotaUsed) continue;
          const d = Math.hypot(b.centroid[0] - got[0].centroid[0], b.centroid[1] - got[0].centroid[1]);
          if (d < bd) { bd = d; next = b; }
        }
        if (!next || bd > 220) break;
        next.district = k; next.quotaUsed = true; got.push(next);
      }
      return got;
    }
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
    // 配额缺口：从任意未占用块按 hash 补齐
    if (got.length < n) {
      const extra = blocks.filter((b) => !b.quotaUsed && (b.district === D.LOW_RISE_RESI || b.district === D.COMMERCIAL || b.district === D.HIGH_RISE_RESI))
        .sort((a, b) => hash2(a.id, 99) - hash2(b.id, 99)).slice(0, n - got.length);
      for (const b of extra) { b.district = k; b.quotaUsed = true; got.push(b); }
    }
    return got;
  };

  const scarpZ = (b) => b.centroid[1] > -120 && b.centroid[1] < 160;
  cluster(D.PARK_LARGE, (b) => b.area > 1000 && terr.scarpX(b.centroid[1]) - 260 < b.centroid[0]
    && b.centroid[0] < terr.scarpX(b.centroid[1]) + 120 && scarpZ(b), QUOTA[D.PARK_LARGE]);
  if (blocks.filter((b) => b.district === D.PARK_LARGE).length < QUOTA[D.PARK_LARGE]) {
    take(D.PARK_LARGE, (b) => b.area > 900 && b.centroid[0] < 80, QUOTA[D.PARK_LARGE]);
  }
  cluster(D.ENTERTAINMENT, (b) => b.district === D.COMMERCIAL || b.district === D.STATION_FRONT, QUOTA[D.ENTERTAINMENT]);
  cluster(D.ELECTRONICS, (b) => !b.quotaUsed && (b.district === D.COMMERCIAL || b.district === D.STATION_FRONT), QUOTA[D.ELECTRONICS]);
  cluster(D.TRADITIONAL, (b) => !b.quotaUsed && (b.district === D.LOW_RISE_RESI || b.district === D.HIGH_RISE_RESI)
    && Math.abs(b.centroid[0] - terr.scarpX(b.centroid[1])) < 140, QUOTA[D.TRADITIONAL]);
  if (blocks.filter((b) => b.district === D.TRADITIONAL).length < QUOTA[D.TRADITIONAL]) {
    take(D.TRADITIONAL, (b) => !b.quotaUsed && b.district === D.LOW_RISE_RESI, QUOTA[D.TRADITIONAL]);
  }
  cluster(D.UNIVERSITY, (b) => !b.quotaUsed && b.area > 900 && b.centroid[0] < -120, QUOTA[D.UNIVERSITY]);
  if (blocks.filter((b) => b.district === D.UNIVERSITY).length < QUOTA[D.UNIVERSITY]) {
    take(D.UNIVERSITY, (b) => !b.quotaUsed && b.area > 800, QUOTA[D.UNIVERSITY]);
  }
  cluster(D.FREIGHT_YARD, (b) => !b.quotaUsed && b.centroid[0] > 0 && b.centroid[1] < -200, QUOTA[D.FREIGHT_YARD]);
  if (blocks.filter((b) => b.district === D.FREIGHT_YARD).length < QUOTA[D.FREIGHT_YARD]) {
    take(D.FREIGHT_YARD, (b) => !b.quotaUsed && b.centroid[0] > 100, QUOTA[D.FREIGHT_YARD]);
  }
  cluster(D.DANCHI, (b) => !b.quotaUsed && b.area > 1200 && rOf(b) > 340, QUOTA[D.DANCHI]);
  if (blocks.filter((b) => b.district === D.DANCHI).length < QUOTA[D.DANCHI]) {
    take(D.DANCHI, (b) => !b.quotaUsed && b.area > 1000, QUOTA[D.DANCHI]);
  }
  cluster(D.STADIUM, (b) => !b.quotaUsed && b.area > 1800 && rOf(b) > railR + 20, 1);
  if (!blocks.some((b) => b.district === D.STADIUM)) {
    take(D.STADIUM, (b) => !b.quotaUsed && b.area > 1600, 1);
  }
  take(D.SCHOOL, (b) => (b.district === D.LOW_RISE_RESI || b.district === D.HIGH_RISE_RESI) && b.area > 500);
  take(D.HOSPITAL, (b) => (b.district === D.LOW_RISE_RESI || b.district === D.HIGH_RISE_RESI) && b.area > 700);
  take(D.PUBLIC, (b) => b.district === D.HIGH_RISE_RESI || b.district === D.LOW_RISE_RESI);
  take(D.PARK_SMALL, (b) => b.area < 420 || b.district === D.LOW_RISE_RESI || b.district === D.HIGH_RISE_RESI);

  for (const b of blocks) if (!b.district) b.district = D.LOW_RISE_RESI;

  const byDist = (d) => blocks.filter((b) => b.district === d);
  const nearestTo = (list, x, z) => {
    if (!list || !list.length) return null;
    const s = list.slice().sort((a, b) =>
      Math.hypot(a.centroid[0] - x, a.centroid[1] - z) - Math.hypot(b.centroid[0] - x, b.centroid[1] - z));
    return { x: Math.round(s[0].centroid[0]), z: Math.round(s[0].centroid[1]) };
  };
  const subBlocks = byDist(D.SUB_CENTER);
  const skyB = subBlocks.filter((b) => bearingOf(b) >= 20 && bearingOf(b) <= 110)
    .sort((a, b) => b.area - a.area)[0]
    || subBlocks.filter((b) => bearingOf(b) < 180).sort((a, b) => b.area - a.area)[0]
    || subBlocks[0];
  const metroB = subBlocks.filter((b) => b !== skyB && bearingOf(b) >= 200 && bearingOf(b) <= 290)
    .sort((a, b) => b.area - a.area)[0]
    || subBlocks.filter((b) => b !== skyB && bearingOf(b) > 160).sort((a, b) => b.area - a.area)[0]
    || subBlocks.filter((b) => b !== skyB)[0]
    || subBlocks[0];
  const asPt = (b, fx, fz) => (b ? { x: Math.round(b.centroid[0]), z: Math.round(b.centroid[1]) } : { x: fx, z: fz });

  // 地标锚点落在街区质心，不落在道路中心（评审 C1：旧 (0,0) 是 ROAD_MINOR）
  const anchors = {
    railMainStation: { x: main.x, z: main.z },
    landmarkTower: nearestTo(byDist(D.CBD), 0, 0)
      ?? nearestTo(byDist(D.STATION_FRONT), 0, 0)
      ?? nearestTo(byDist(D.COMMERCIAL), 0, 0)
      ?? { x: 48, z: 48 },
    skytree: asPt(skyB, 80, 80),
    metroGov: asPt(metroB, -80, -80),
    stationFront: nearestTo(byDist(D.STATION_FRONT), main.x, main.z)
      ?? { x: main.x + 30, z: main.z + 30 },
    stadium: nearestTo(byDist(D.STADIUM), 280, -220) ?? { x: 280, z: -220 },
    freightYard: nearestTo(byDist(D.FREIGHT_YARD), 320, -300) ?? { x: 320, z: -300 },
    university: nearestTo(byDist(D.UNIVERSITY), -280, 40) ?? { x: -280, z: 40 },
    danchi: nearestTo(byDist(D.DANCHI), -300, 280) ?? { x: -300, z: 280 },
    greatPark: nearestTo(byDist(D.PARK_LARGE), -200, 40) ?? { x: -200, z: 40 },
    shrine: nearestTo(byDist(D.TRADITIONAL), -80, 20) ?? { x: -80, z: 20 },
    portOffice: nearestTo(byDist(D.PORT_INDUSTRY), 300, 300) ?? { x: 300, z: 300 },
    wharf: ctx.water?.piers?.[2] ?? nearestTo(byDist(D.PORT_INDUSTRY), 320, 320) ?? { x: 320, z: 320 },
  };
  if (anchors.wharf && anchors.wharf.x === undefined && Array.isArray(anchors.wharf)) {
    anchors.wharf = { x: anchors.wharf[0], z: anchors.wharf[1] };
  }
  return anchors;
}

function centroidOf(blocks, pred) {
  const hit = blocks.filter(pred);
  if (!hit.length) return null;
  const big = hit.slice().sort((a, b) => b.area - a.area)[0];
  return { x: Math.round(big.centroid[0]), z: Math.round(big.centroid[1]) };
}
