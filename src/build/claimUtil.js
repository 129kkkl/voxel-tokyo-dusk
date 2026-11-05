import { hash2 } from '../rng.js';

/** FACE 外法向，与 city/plots.js FACE_OF 一致 */
export const FACE_OF = [[0, 1], [0, -1], [1, 0], [-1, 0]];

export function claimWithRetry(CITY, plot, tag, wFrac = 0.85, dFrac = 0.75) {
  let w = Math.max(4, Math.min(plot.w, Math.floor(plot.w * wFrac)));
  let d = Math.max(4, Math.min(plot.d, Math.floor(plot.d * dFrac)));
  for (let i = 0; i < 4; i++) {
    const c = CITY.claim(plot.id, w, d, tag);
    if (c) return c;
    w = Math.max(4, w - 1);
    d = Math.max(4, d - 1);
    if (w < 4 && d < 4) break;
  }
  return null;
}

/**
 * 地标基座：优先锚点附近 plot（尺寸可缩水），再螺旋 claimFree。
 * CBD 地块常只有 10×11，固定 15×15 会整体漂到远郊。
 */
export function claimBase(CITY, cx, cz, w, d, tag, minSide = 9) {
  // 1) 按距离排序附近可容身 plot，尺寸从目标往下试
  const candidates = [];
  for (const p of CITY.plots) {
    const dist = Math.hypot(p.cx - cx, p.cz - cz);
    if (dist > 360) continue;
    if (p.w < minSide || p.d < minSide) continue;
    candidates.push({ p, dist });
  }
  candidates.sort((a, b) => a.dist - b.dist);
  for (const { p } of candidates.slice(0, 24)) {
    const tw = Math.min(w, p.w);
    const td = Math.min(d, p.d);
    if (tw < minSide || td < minSide) continue;
    const c = CITY.claim(p.id, tw, td, tag);
    if (c) return c;
  }
  // 2) 螺旋 claimFree，尺寸可缩水
  for (let ww = w; ww >= minSide; ww -= 2) {
    const dd = Math.max(minSide, Math.round(d * (ww / w)));
    const hw = Math.floor(ww / 2);
    const hd = Math.floor(dd / 2);
    for (let r = 0; r <= 70; r += 3) {
      const steps = r === 0 ? 1 : 14;
      for (let a = 0; a < steps; a++) {
        const th = (a / steps) * Math.PI * 2;
        const x0 = Math.round(cx + Math.cos(th) * r) - hw;
        const z0 = Math.round(cz + Math.sin(th) * r) - hd;
        const c = CITY.claimFree(x0, z0, x0 + ww - 1, z0 + dd - 1, tag);
        if (c) return c;
      }
    }
  }
  return null;
}

/** 街区内部空地小构筑（claimFree），提升密度 */
export function fillBlockInterior(vox, CITY, block, rng, stats) {
  const kinds = fillKindFor(block.district);
  if (!kinds) return;
  const free = [];
  for (const i of block.cells) {
    const x = Math.floor(i / CITY.N) - CITY.HALF;
    const z = i % CITY.N - CITY.HALF;
    const t = CITY.typeAt(x, z);
    if (t !== 1 /* BLOCK */ && t !== 15 /* PLOT_FREE */ && t !== 18 /* PLOT_USE */) continue;
    free.push([x, z]);
  }
  if (free.length < 20) return;

  const attempts = Math.min(8, Math.max(2, Math.floor(free.length / 80)));
  for (let n = 0; n < attempts; n++) {
    const p = free[Math.floor(rng() * free.length)];
    const w = rng.int(3, 6);
    const d = rng.int(3, 6);
    const x0 = p[0] - (w >> 1);
    const z0 = p[1] - (d >> 1);
    const c = CITY.claimFree(x0, z0, x0 + w - 1, z0 + d - 1, 'fill');
    if (!c) continue;
    const kind = kinds[Math.floor(rng() * kinds.length)];
    const y0 = c.y;
    if (kind === 'tree') {
      placeMiniTree(vox, Math.round(c.cx), Math.round(c.cz), y0, rng);
    } else if (kind === 'lot') {
      vox.box(c.x0, y0, c.z0, c.x1, y0, c.z1, 0x4a4e48, false);
    } else if (kind === 'shed') {
      const h = rng.int(2, 3);
      vox.box(c.x0, y0, c.z0, c.x1, y0 + h, c.z1, 0x6a6a60, false);
      vox.box(c.x0, y0 + h + 1, c.z0, c.x1, y0 + h + 1, c.z1, 0x4a4a50, false);
    } else if (kind === 'container') {
      const col = [0x8a3a2a, 0x3a5a8a, 0x5a7a3a][rng.int(0, 2)];
      vox.box(c.x0, y0 + 1, c.z0, c.x1, y0 + 3, c.z1, col, false);
    } else if (kind === 'court') {
      vox.box(c.x0, y0, c.z0, c.x1, y0, c.z1, 0x3a5040, false);
      vox.box(c.x0, y0 + 0.2, c.z0, c.x1, y0 + 0.2, c.z1, 0x2a3a30, false);
    }
    if (stats) stats.freeFill++;
  }
}

function fillKindFor(district) {
  switch (district) {
    case 'park_large':
    case 'park_small':
    case 'greenway':
      return ['tree', 'tree', 'lot'];
    case 'port_industry':
    case 'freight_yard':
      return ['container', 'shed', 'lot'];
    case 'cbd':
    case 'sub_center':
    case 'station_front':
      return ['lot', 'shed'];
    case 'low_rise_resi':
    case 'traditional':
    case 'high_rise_resi':
      return ['tree', 'lot', 'shed'];
    case 'school':
    case 'university':
    case 'hospital':
    case 'public':
      return ['tree', 'court', 'lot'];
    default:
      return rngPickDefault();
  }
}

function rngPickDefault() {
  return ['tree', 'lot'];
}

export function placeMiniTree(vox, x, z, y0, rng) {
  const h = rng.int(2, 4);
  const g = [0x2f5d2a, 0x3a6b32, 0x2a5226][rng.int(0, 2)];
  vox.boxC(x, y0 + h / 2, z, 0.6, h, 0.6, 0x5a4230, false);
  vox.boxC(x, y0 + h + 0.8, z, 2.2, 1.6, 2.2, g, false);
  if (h >= 3) vox.boxC(x, y0 + h + 2, z, 1.2, 0.9, 1.2, g, false);
}

export function placeCherry(vox, x, z, y0, rng) {
  const h = rng.int(3, 5);
  vox.boxC(x, y0 + h / 2, z, 0.5, h, 0.5, 0x5a4030, false);
  vox.boxC(x, y0 + h + 1.2, z, 2.4, 1.4, 2.4, 0xf0a0b8, false);
  vox.boxC(x + 0.8, y0 + h + 2, z, 1.4, 0.8, 1.4, 0xf8c0d0, false);
}

export function bandShade(hex, bandIndex, salt = 0) {
  const f = 0.96 + hash2(bandIndex, salt) * 0.08;
  return {
    r: Math.min(255, ((hex >> 16) & 255) * f) | 0,
    g: Math.min(255, ((hex >> 8) & 255) * f) | 0,
    b: Math.min(255, (hex & 255) * f) | 0,
  };
}

export function bandHex(hex, bandIndex, salt = 0) {
  const c = bandShade(hex, bandIndex, salt);
  return (c.r << 16) | (c.g << 8) | c.b;
}
