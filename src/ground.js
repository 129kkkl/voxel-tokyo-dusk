/** 地面渲染：只读 CITY cell buffer，按类型/高度做 run-length 合并（规格 §11）。 */
import { T, PALETTE, DISTRICT } from './city/config.js';
import { hash2 } from './rng.js';

const BLOCK_BASE = {
  [DISTRICT.CBD]: 0x4a4e55,
  [DISTRICT.SUB_CENTER]: 0x4e4a55,
  [DISTRICT.STATION_FRONT]: 0x524e48,
  [DISTRICT.COMMERCIAL]: 0x555248,
  [DISTRICT.ENTERTAINMENT]: 0x5a4a4e,
  [DISTRICT.ELECTRONICS]: 0x4a5558,
  [DISTRICT.HIGH_RISE_RESI]: 0x4c5248,
  [DISTRICT.LOW_RISE_RESI]: 0x54564a,
  [DISTRICT.TRADITIONAL]: 0x5a5244,
  [DISTRICT.SCHOOL]: 0x4e5650,
  [DISTRICT.HOSPITAL]: 0x5a5a58,
  [DISTRICT.PUBLIC]: 0x55564c,
  [DISTRICT.PARK_LARGE]: 0x3f5c3a,
  [DISTRICT.PARK_SMALL]: 0x456340,
  [DISTRICT.GREENWAY]: 0x40663c,
  [DISTRICT.PORT_INDUSTRY]: 0x4a4a50,
  [DISTRICT.FREIGHT_YARD]: 0x555040,
  [DISTRICT.UNIVERSITY]: 0x4a524c,
  [DISTRICT.DANCHI]: 0x4e5448,
  [DISTRICT.STADIUM]: 0x5a5844,
  [DISTRICT.LANDMARK]: 0x555050,
  [DISTRICT.NONE]: 0x505048,
};

function typeColor(CITY, x, z, t, i) {
  switch (t) {
    case T.ROAD_RING: return PALETTE.asphaltRing;
    case T.ROAD_RADIAL: return PALETTE.asphaltRadial;
    case T.ROAD_ARTERIAL: return 0x383b3f;
    case T.ROAD_MINOR: return PALETTE.asphaltMinor;
    case T.SIDEWALK: return PALETTE.sidewalk;
    case T.MEDIAN: return PALETTE.median;
    case T.RAIL: return PALETTE.rail;
    // 水面不自发光（规格 §11.5）
    case T.WATER: return PALETTE.water;
    case T.SEA: return PALETTE.sea;
    case T.QUAY: return PALETTE.quay;
    case T.RECLAIM: return PALETTE.reclaim;
    case T.RECLAIMED: return 0x6b5f4a;
    case T.BRIDGE: return 0x6a655c;
    case T.BLOCK_ALLEY: return 0x6a6e72;
    case T.POCKET: return 0x3d6a38;
    case T.PLOT_FREE: return 0x3a4038;
    case T.PLOT_USE: {
      const b = CITY.blocks[CITY.field.blockId[i]];
      return BLOCK_BASE[b?.district] ?? 0x4a4e48;
    }
    case T.BLOCK: {
      const b = CITY.blocks[CITY.field.blockId[i]];
      return BLOCK_BASE[b?.district] ?? 0x4a4e48;
    }
    case T.OUTSIDE: return 0x1a1c20;
    default: return 0x33363a;
  }
}

function shade(hex, f) {
  const r = Math.min(255, Math.max(0, ((hex >> 16) & 255) * f));
  const g = Math.min(255, Math.max(0, ((hex >> 8) & 255) * f));
  const b = Math.min(255, Math.max(0, (hex & 255) * f));
  return (r << 16) | (g << 8) | b;
}

/**
 * U5 车道标线：道路坐标系 (along, across)，不用 (x+z)%7 屏幕哈希。
 * dir 是 7.5° 步进方向角，切向 = dir，法向 = dir+90°。
 */
function laneMark(f, x, z, i, t, roadId) {
  const isAsphalt = t === T.ROAD_RING || t === T.ROAD_RADIAL || t === T.ROAD_ARTERIAL || t === T.ROAD_MINOR;
  if (!isAsphalt) return null;
  const dir = f.dir[i] & 63;
  const th = (dir / 64) * Math.PI * 2;
  const tx = Math.cos(th), tz = Math.sin(th);
  const nx = -tz, nz = tx;
  let walkPlus = false, walkMinus = false, asphN = 0;
  for (let s = 1; s <= 4; s++) {
    for (const sgn of [1, -1]) {
      const px = Math.round(x + nx * s * sgn), pz = Math.round(z + nz * s * sgn);
      if (!f.inb(px, pz)) continue;
      const tt = f.t[f.idx(px, pz)];
      if (tt === T.SIDEWALK || tt === T.MEDIAN) {
        if (sgn > 0) walkPlus = true; else walkMinus = true;
      }
      if (tt === T.ROAD_RING || tt === T.ROAD_RADIAL || tt === T.ROAD_ARTERIAL || tt === T.ROAD_MINOR) asphN++;
    }
  }
  const along = Math.round(x * tx + z * tz);
  const across = Math.round(x * nx + z * nz);
  const yellow = roadId === 0;

  if (walkPlus !== walkMinus) {
    return { kind: 2, color: shade(yellow ? PALETTE.markYellow : PALETTE.markWhite, 0.75) };
  }
  if (!walkPlus && !walkMinus && asphN >= 3) {
    const lane = ((across % 6) + 6) % 6;
    if (lane === 0 || lane === 1) {
      const dash = ((along % 12) + 12) % 12;
      if (dash < 5) return { kind: 1, color: yellow ? PALETTE.markYellow : PALETTE.markWhite };
    }
  }
  return null;
}

/** 纵向挡土墙 + 顶面铺装。run-length 合并同一 (y,type,color) 连续段。 */
export function buildGround(vox, CITY) {
  const f = CITY.field;
  const half = CITY.HALF;
  const N = CITY.N;

  // 顶面：沿 x 扫描 run
  for (let z = -half; z <= half; z++) {
    let x = -half;
    while (x <= half) {
      const i = f.idx(x, z);
      const t = f.t[i];
      const h = t === T.WATER || t === T.SEA ? 0 : f.h[i];
      const tile = ((x >> 3) ^ (z >> 3)) * 0;
      const jitter = 0.95 + hash2(x >> 3, z >> 3) * 0.1;
      let base = typeColor(CITY, x, z, t, i);
      // U5 标线：道路坐标系虚线/路缘，不用 (x+z)%7 屏幕哈希
      const mk = laneMark(f, x, z, i, t, f.roadId[i]);
      if (mk) base = mk.color;
      const color = shade(base, jitter);
      let x1 = x;
      while (x1 + 1 <= half) {
        const j = f.idx(x1 + 1, z);
        const t2 = f.t[j];
        const h2 = t2 === T.WATER || t2 === T.SEA ? 0 : f.h[j];
        if (t2 !== t || h2 !== h) break;
        const mk2 = laneMark(f, x1 + 1, z, j, t2, f.roadId[j]);
        const base2 = mk2 ? mk2.color : typeColor(CITY, x1 + 1, z, t2, j);
        const j2 = shade(base2, 0.95 + hash2((x1 + 1) >> 3, z >> 3) * 0.1);
        if (j2 !== color) break;
        x1++;
      }
      const yTop = h;
      // 水面略薄、陆地 1 格高铺装
      const sy = t === T.WATER || t === T.SEA ? 0.2 : 1;
      vox.box(x, yTop - 0.5 + sy / 2, z, x1, yTop - 0.5 + sy / 2, z, color, false);
      // 修正 box 中心：用两角点
      x = x1 + 1;
    }
  }

  // 挡土墙：相邻格高差
  let wallCount = 0;
  const WALL = PALETTE.wall;
  for (let z = -half; z <= half; z++) {
    for (let x = -half; x <= half; x++) {
      const i = f.idx(x, z);
      const t = f.t[i];
      if (t === T.WATER || t === T.SEA) continue;
      const h = f.h[i];
      // +x 邻域
      if (x < half) {
        const j = f.idx(x + 1, z);
        const t2 = f.t[j];
        if (t2 !== T.WATER && t2 !== T.SEA) {
          const h2 = f.h[j];
          if (h > h2 + 0) {
            for (let y = h2 + 1; y <= h; y++) {
              vox.add(x + 0.5, y - 0.5, z, shade(WALL, 0.95 + hash2(x, z) * 0.08), false);
              wallCount++;
            }
          } else if (h2 > h) {
            for (let y = h + 1; y <= h2; y++) {
              vox.add(x + 0.5, y - 0.5, z, shade(WALL, 0.92 + hash2(x, z) * 0.08), false);
              wallCount++;
            }
          }
        }
      }
      if (z < half) {
        const j = f.idx(x, z + 1);
        const t2 = f.t[j];
        if (t2 !== T.WATER && t2 !== T.SEA) {
          const h2 = f.h[j];
          if (h > h2) {
            for (let y = h2 + 1; y <= h; y++) {
              vox.add(x, y - 0.5, z + 0.5, shade(WALL, 0.9 + hash2(x, z + 1) * 0.1), false);
              wallCount++;
            }
          }
        }
      }
    }
  }
  return { wallCount };
}
