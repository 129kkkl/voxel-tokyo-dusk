/** 体量原语：全部限制在 claim 矩形内（出檐/雨棚由 roofscape 另挑 1 格）。 */
import { shade } from './palette.js';
import { paintVolume } from './facade.js';

function seg(x0, y, z0, x1, z1, h) {
  return { x0, y, z0, x1, z1, h };
}

function bodyOpts(opts, extra) {
  const { h, ...rest } = opts;
  return { ...rest, ...extra };
}

/** 裙房 h/4 全幅 + 塔楼收进 25–35% */
export function podiumTower(vox, c, opts) {
  const { h, rng, wall } = opts;
  const y0 = c.y;
  const ph = Math.max(2, Math.round(h * 0.25));
  const th = Math.max(3, h - ph);
  paintVolume(vox, seg(c.x0, y0, c.z0, c.x1, c.z1, ph), bodyOpts(opts, { cornice: false }));
  vox.box(c.x0, y0 + ph, c.z0, c.x1, y0 + ph, c.z1, shade(wall, 0.8), false);

  const insetX = Math.max(1, Math.round(c.w * rng.range(0.25, 0.35)));
  const insetZ = Math.max(1, Math.round(c.d * rng.range(0.25, 0.35)));
  let tx0 = c.x0 + insetX;
  let tx1 = c.x1 - insetX;
  let tz0 = c.z0 + insetZ;
  let tz1 = c.z1 - insetZ;
  if (tx1 - tx0 < 1) { tx0 = c.x0; tx1 = c.x1; }
  if (tz1 - tz0 < 1) { tz0 = c.z0; tz1 = c.z1; }
  paintVolume(vox, seg(tx0, y0 + ph, tz0, tx1, tz1, th), bodyOpts(opts, { shopFront: false, plinth: false }));

  return {
    tops: [
      { ...seg(tx0, y0 + h, tz0, tx1, tz1, 0), kind: 'tower' },
      { ...seg(c.x0, y0 + ph, c.z0, c.x1, c.z1, 0), kind: 'terrace' },
    ],
  };
}

/** 2–3 段递进收分，每段收 15–25% */
export function setbackStack(vox, c, opts) {
  const { h, rng, wall } = opts;
  const y0 = c.y;
  const n = h >= 36 ? 3 : 2;
  let x0 = c.x0;
  let z0 = c.z0;
  let x1 = c.x1;
  let z1 = c.z1;
  let y = y0;
  let rem = h;
  const tops = [];
  for (let i = 0; i < n; i++) {
    const last = i === n - 1;
    const frac = n === 2 ? (i === 0 ? 0.55 : 0.45) : (i === 0 ? 0.44 : i === 1 ? 0.33 : 0.23);
    const th = last ? rem : Math.max(3, Math.round(h * frac));
    paintVolume(vox, seg(x0, y, z0, x1, z1, th), bodyOpts(opts, {
      shopFront: i === 0 ? opts.shopFront : false,
      plinth: i === 0,
    }));
    y += th;
    rem -= th;
    if (last) {
      tops.push({ ...seg(x0, y, z0, x1, z1, 0), kind: 'tower' });
      break;
    }
    vox.box(x0, y, z0, x1, y, z1, shade(wall, 0.8), false);
    tops.push({ ...seg(x0, y, z0, x1, z1, 0), kind: 'terrace' });
    const fx = Math.max(1, Math.round((x1 - x0 + 1) * rng.range(0.15, 0.25)));
    const fz = Math.max(1, Math.round((z1 - z0 + 1) * rng.range(0.15, 0.25)));
    if (x1 - fx - (x0 + fx) < 1 || z1 - fz - (z0 + fz) < 1) {
      tops.pop();
      break;
    }
    x0 += fx; x1 -= fx; z0 += fz; z1 -= fz;
  }
  return { tops };
}

/** 板楼：长向满幅短向薄 */
export function slabBlock(vox, c, opts) {
  const { h, rng } = opts;
  let x0, x1, z0, z1;
  if (c.w >= c.d) {
    x0 = c.x0; x1 = c.x1;
    const t = Math.max(2, Math.min(c.d, Math.round(c.d * 0.55) || 2));
    z0 = c.z0 + rng.int(0, Math.max(0, c.d - t));
    z1 = z0 + t - 1;
  } else {
    z0 = c.z0; z1 = c.z1;
    const t = Math.max(2, Math.min(c.w, Math.round(c.w * 0.55) || 2));
    x0 = c.x0 + rng.int(0, Math.max(0, c.w - t));
    x1 = x0 + t - 1;
  }
  paintVolume(vox, seg(x0, c.y, z0, x1, z1, h), bodyOpts(opts));
  return { tops: [{ ...seg(x0, c.y + h, z0, x1, z1, 0), kind: 'slab' }] };
}

/** 双柱 + 中缝 */
export function twinBar(vox, c, opts) {
  const { h, rng } = opts;
  const tops = [];
  const horiz = c.w >= c.d;
  const gap = Math.min(2, Math.max(1, Math.floor((horiz ? c.d : c.w) * 0.18)));
  const short = horiz ? c.d : c.w;
  const bar = Math.max(2, Math.floor((short - gap) / 2));
  for (let k = 0; k < 2; k++) {
    let x0, x1, z0, z1;
    if (horiz) {
      x0 = c.x0; x1 = c.x1;
      z0 = c.z0 + k * (bar + gap);
      z1 = Math.min(c.z1, z0 + bar - 1);
    } else {
      z0 = c.z0; z1 = c.z1;
      x0 = c.x0 + k * (bar + gap);
      x1 = Math.min(c.x1, x0 + bar - 1);
    }
    if (x1 < x0 || z1 < z0) continue;
    const hh = k === 0 ? h : Math.max(3, h - rng.int(0, 2));
    paintVolume(vox, seg(x0, c.y, z0, x1, z1, hh), bodyOpts(opts, { shopFront: false }));
    tops.push({ ...seg(x0, c.y + hh, z0, x1, z1, 0), kind: 'bar' });
  }
  if (!tops.length) return slabBlock(vox, c, opts);
  return { tops };
}

/** 主屋 + 附属小屋 */
export function houseCluster(vox, c, opts) {
  const { h, rng } = opts;
  const y0 = c.y;
  if (c.w <= 4 && c.d <= 4) {
    paintVolume(vox, seg(c.x0, y0, c.z0, c.x1, c.z1, h), bodyOpts(opts));
    return { tops: [{ ...seg(c.x0, y0 + h, c.z0, c.x1, c.z1, 0), kind: 'house' }] };
  }
  const horiz = c.w >= c.d;
  const tops = [];
  const cut = horiz
    ? c.x0 + Math.max(2, Math.round(c.w * rng.range(0.58, 0.74))) - 1
    : c.z0 + Math.max(2, Math.round(c.d * rng.range(0.58, 0.74))) - 1;
  let mx0 = c.x0, mx1 = c.x1, mz0 = c.z0, mz1 = c.z1;
  let ax0 = c.x0, ax1 = c.x1, az0 = c.z0, az1 = c.z1;
  if (horiz) {
    mx1 = cut; ax0 = cut + 1;
    if (ax0 > ax1) { ax0 = ax1; }
  } else {
    mz1 = cut; az0 = cut + 1;
    if (az0 > az1) { az0 = az1; }
  }
  paintVolume(vox, seg(mx0, y0, mz0, mx1, mz1, h), bodyOpts(opts));
  tops.push({ ...seg(mx0, y0 + h, mz0, mx1, mz1, 0), kind: 'house' });
  if (!(horiz && ax0 > c.x1) && !(!horiz && az0 > c.z1)) {
    const ah = Math.max(2, h - rng.int(1, 2));
    paintVolume(vox, seg(ax0, y0, az0, ax1, az1, ah), bodyOpts(opts, { shopFront: false }));
    tops.push({ ...seg(ax0, y0 + ah, az0, ax1, az1, 0), kind: 'annex' });
  }
  return { tops };
}

/** 窄面深、平屋顶女儿墙 */
export function shopShed(vox, c, opts) {
  paintVolume(vox, seg(c.x0, c.y, c.z0, c.x1, c.z1, opts.h), bodyOpts(opts));
  return { tops: [{ ...seg(c.x0, c.y + opts.h, c.z0, c.x1, c.z1, 0), kind: 'shed' }] };
}

/**
 * 体量选择：w<6 强制 shed/house 系；
 * setbackStack 仅当 h≥24 且 min(w,d)≥8。
 */
export function pickMassing(c, h, family, rng) {
  const minS = Math.min(c.w, c.d);
  const maxS = Math.max(c.w, c.d);
  if (family === 'house' || family === 'traditional') return 'houseCluster';
  if (family === 'industrial') return 'shopShed';
  if (c.w < 6 || c.d < 6) {
    if (family === 'danchi' || family === 'apartment') return 'slabBlock';
    return maxS >= 9 ? 'slabBlock' : 'shopShed';
  }
  if (family === 'office') {
    if (h >= 24 && minS >= 8) return rng.chance(0.55) ? 'setbackStack' : 'podiumTower';
    if (h >= 14 && minS >= 6) return 'podiumTower';
    return 'shopShed';
  }
  if (family === 'danchi' || family === 'apartment') {
    if (minS >= 10 && h >= 12 && rng.chance(0.35)) return 'twinBar';
    return 'slabBlock';
  }
  if (family === 'civic') return 'slabBlock';
  return 'shopShed';
}

export const MASSING = {
  podiumTower, setbackStack, slabBlock, twinBar, houseCluster, shopShed,
};
