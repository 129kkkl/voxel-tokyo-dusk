/** U1 高度场：分区基带 × 中心衰减 × 邻里值噪声，消灭钉板天际线。 */
import { DISTRICT } from '../city/config.js';
import { makeRng, hash2 } from '../rng.js';

export const HEIGHT = {
  [DISTRICT.CBD]: [28, 72],
  [DISTRICT.SUB_CENTER]: [24, 64],
  [DISTRICT.STATION_FRONT]: [14, 36],
  [DISTRICT.HIGH_RISE_RESI]: [12, 24],
  [DISTRICT.DANCHI]: [18, 30],
  [DISTRICT.COMMERCIAL]: [8, 16],
  [DISTRICT.ENTERTAINMENT]: [8, 18],
  [DISTRICT.ELECTRONICS]: [8, 18],
  [DISTRICT.LOW_RISE_RESI]: [3, 6],
  [DISTRICT.TRADITIONAL]: [2, 5],
  [DISTRICT.PORT_INDUSTRY]: [4, 10],
  [DISTRICT.FREIGHT_YARD]: [4, 8],
  [DISTRICT.UNIVERSITY]: [6, 14],
  [DISTRICT.SCHOOL]: [6, 12],
  [DISTRICT.HOSPITAL]: [6, 12],
  [DISTRICT.PUBLIC]: [6, 12],
  [DISTRICT.LANDMARK]: [20, 48],
};

function smooth(t) {
  return t * t * (3 - 2 * t);
}

/** 值噪声（尺度 ~100），块质心上的邻里高度相关 */
function valueNoise(x, z, scale = 100) {
  const gx = x / scale;
  const gz = z / scale;
  const x0 = Math.floor(gx);
  const z0 = Math.floor(gz);
  const fx = smooth(gx - x0);
  const fz = smooth(gz - z0);
  const n00 = hash2(x0, z0);
  const n10 = hash2(x0 + 1, z0);
  const n01 = hash2(x0, z0 + 1);
  const n11 = hash2(x0 + 1, z0 + 1);
  return (n00 * (1 - fx) + n10 * fx) * (1 - fz)
    + (n01 * (1 - fx) + n11 * fx) * fz;
}

export function buildHeightField(CITY) {
  const A = CITY.anchors || {};
  const centers = [];
  const addC = (p, r, w) => {
    if (p && p.x != null && p.z != null) centers.push({ x: p.x, z: p.z, r, w });
  };
  addC(A.railMainStation, 240, 1);
  addC(A.landmarkTower, 210, 0.95);
  addC(A.skytree, 160, 0.8);
  addC(A.metroGov, 160, 0.8);
  addC(A.stationFront, 150, 0.7);

  function proximity(x, z) {
    let f = 0;
    for (const c of centers) {
      const t = Math.max(0, 1 - Math.hypot(x - c.x, z - c.z) / c.r) * c.w;
      if (t > f) f = t;
    }
    return f;
  }

  const hById = new Map();
  const heroIds = new Set();
  const rng = makeRng(0x51A7C17 ^ 0x9E3779B9);

  const byBlock = new Map();
  for (const p of CITY.plots) {
    if (!byBlock.has(p.blockId)) byBlock.set(p.blockId, []);
    byBlock.get(p.blockId).push(p);
  }

  for (const [bid, ps] of byBlock) {
    const block = CITY.blocks[bid] || null;
    const dist = ps[0].district || block?.district;
    const band = HEIGHT[dist] || [4, 8];
    const lo = band[0];
    const hi = band[1];
    const bw = hi - lo;
    const cx = block ? block.centroid[0] : (ps[0].rect.x0 + ps[0].rect.x1) / 2;
    const cz = block ? block.centroid[1] : (ps[0].rect.z0 + ps[0].rect.z1) / 2;
    // 噪声权重 30%，其余按中心衰减
    const t = 0.7 * proximity(cx, cz) + 0.3 * valueNoise(cx, cz, 100);
    const base = lo + Math.round(t * bw);

    let tiers = null;
    if (dist === DISTRICT.DANCHI || dist === DISTRICT.HIGH_RISE_RESI) {
      const nT = rng.chance(0.45) ? 1 : 2;
      tiers = [];
      for (let i = 0; i < nT; i++) tiers.push(lo + Math.round((0.35 + 0.5 * rng()) * bw));
    }

    let prev = null;
    for (let i = 0; i < ps.length; i++) {
      // 地块抖动 ±25% 带宽，邻里仍相近（相邻 clamp 在后）；最终锁回基带
      let h = tiers
        ? tiers[i % tiers.length]
        : base + Math.round((hash2(ps[i].id, 31) - 0.5) * bw * 0.5);
      if (prev != null) {
        const lim = Math.max(1, Math.round(bw * 0.4));
        h = Math.max(prev - lim, Math.min(prev + lim, h));
      }
      h = Math.max(lo, Math.min(hi, Math.round(h)));
      hById.set(ps[i].id, h);
      prev = h;
    }
  }

  // 英雄塔：CBD 与每个副都心各 1–3 栋拔尖到带顶 +10%
  const subs = [
    A.skytree ? { x: A.skytree.x, z: A.skytree.z } : null,
    A.metroGov ? { x: A.metroGov.x, z: A.metroGov.z } : null,
  ];
  const subZone = (p, s) => Math.hypot(
    (p.rect.x0 + p.rect.x1) / 2 - s.x, (p.rect.z0 + p.rect.z1) / 2 - s.z,
  ) < 120;
  const zones = [
    { list: CITY.plots.filter((p) => p.district === DISTRICT.CBD), hi: HEIGHT[DISTRICT.CBD][1], salt: 11 },
    ...subs.filter(Boolean).map((s, i) => ({
      list: CITY.plots.filter((p) => p.district === DISTRICT.SUB_CENTER
        && subZone(p, s) && (i === 0 || !subs[0] || !subZone(p, subs[0]))),
      hi: HEIGHT[DISTRICT.SUB_CENTER][1],
      salt: 22 + i * 17,
    })),
  ];
  for (const z of zones) {
    const cand = z.list
      .filter((p) => Math.min(p.w, p.d) >= 5)
      .sort((a, b) => (hash2(a.id, 4242 + z.salt) - hash2(b.id, 4242 + z.salt)));
    const n = Math.min(cand.length, 1 + Math.floor(hash2(z.salt, 77) * 2.99));
    for (let i = 0; i < n; i++) {
      hById.set(cand[i].id, Math.round(z.hi * 1.1));
      heroIds.add(cand[i].id);
    }
  }

  return {
    hFor(plot, block) {
      const h = hById.get(plot.id);
      if (h != null) return h;
      const band = HEIGHT[plot?.district] || [4, 8];
      return Math.round((band[0] + band[1]) / 2);
    },
    isHero(plotId) {
      return heroIds.has(plotId);
    },
  };
}
