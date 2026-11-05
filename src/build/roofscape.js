/** 屋顶轮廓：女儿墙 / 坡顶 / 机电 / 桅杆 / 冠部 / 广告位。 */
import { shade, LANDMARK, NEON, WINDOW } from './palette.js';
import { faceRing } from './facade.js';

/** 屋面 deck（top.y 即屋面） */
export function roofDeck(vox, top, color) {
  vox.box(top.x0, top.y, top.z0, top.x1, top.y, top.z1, color, false);
}

/** 女儿墙：高 1，办公/商业必配 */
export function parapet(vox, top, color, hgt = 1) {
  const { x0, y, z0, x1, z1 } = top;
  for (let i = 0; i < hgt; i++) {
    const yy = y + 1 + i;
    vox.box(x0, yy, z0, x1, yy, z0, color, false);
    vox.box(x0, yy, z1, x1, yy, z1, color, false);
    vox.box(x0, yy, z0 + 1, x0, yy, z1 - 1, color, false);
    vox.box(x1, yy, z0 + 1, x1, yy, z1 - 1, color, false);
  }
}

/** 锯齿女儿墙（工业） */
export function sawtoothParapet(vox, top, color) {
  const { x0, y, z0, x1, z1 } = top;
  const longX = (x1 - x0) >= (z1 - z0);
  if (longX) {
    for (let u = x0; u <= x1; u += 2) {
      vox.box(u, y + 1, z0, u, y + 2, z0, color, false);
    }
    vox.box(x0, y + 1, z1, x1, y + 1, z1, color, false);
  } else {
    for (let u = z0; u <= z1; u += 2) {
      vox.box(x0, y + 1, u, x0, y + 2, u, color, false);
    }
    vox.box(x1, y + 1, z0, x1, y + 1, z1, color, false);
  }
}

/** 坡屋顶：起脊或单坡，出檐 1 格，vox.box 斜面近似 */
export function gableRoof(vox, top, roofCol, rng) {
  const { x0, y, z0, x1, z1 } = top;
  const w = x1 - x0 + 1;
  const d = z1 - z0 + 1;
  const alongX = w >= d;
  const rise = Math.min(2, Math.max(1, Math.round(Math.min(w, d) / 4) || 1));
  const mono = rng && rng.chance(0.25);
  for (let i = 0; i < rise; i++) {
    const col = shade(roofCol, 0.95 + i * 0.08);
    if (alongX) {
      const za = z0 - 1 + (mono ? 0 : i);
      const zb = z1 + 1 - i;
      if (za > zb) break;
      vox.box(x0 - 1, y + i, za, x1 + 1, y + i, zb, col, false);
    } else {
      const xa = x0 - 1 + (mono ? 0 : i);
      const xb = x1 + 1 - i;
      if (xa > xb) break;
      vox.box(xa, y + i, z0 - 1, xb, y + i, z1 + 1, col, false);
    }
  }
}

/** 机电层 / 水箱 */
export function mechKit(vox, top, rng) {
  const { x0, y, z0, x1, z1 } = top;
  const w = x1 - x0 + 1;
  const d = z1 - z0 + 1;
  if (w < 2 || d < 2) return;
  const bw = Math.max(1, Math.min(3, Math.floor(w * 0.4)));
  const bd = Math.max(1, Math.min(3, Math.floor(d * 0.4)));
  const bx = Math.min(x1 - bw + 1, x0 + (rng.chance(0.5) ? 0 : w - bw));
  const bz = Math.min(z1 - bd + 1, z0 + (rng.chance(0.5) ? 0 : d - bd));
  if (rng.chance(0.5)) {
    vox.box(bx, y + 1, bz, bx + bw - 1, y + 3, bz + bd - 1, 0x6a6e76, false);
  } else {
    vox.box(bx, y + 1, bz, bx + bw - 1, y + 2, bz + bd - 1, 0x5a5e66, false);
  }
}

/** 天线桅杆 */
export function antennaMast(vox, top) {
  const mx = Math.round((top.x0 + top.x1) / 2);
  const mz = Math.round((top.z0 + top.z1) / 2);
  vox.box(mx, top.y + 1, mz, mx, top.y + 4, mz, 0x8a8e96, false);
  vox.add(mx, top.y + 5, mz, LANDMARK.beacon, true);
}

/** 冠部：退台顶细檐 + 小面积 crown glow */
export function crown(vox, top, wall) {
  faceRing(vox, top.x0, top.y + 1, top.z0, top.x1, top.z1, shade(wall, 1.12), 0.3);
  const mx = Math.round((top.x0 + top.x1) / 2);
  const mz = Math.round((top.z0 + top.z1) / 2);
  vox.box(mx, top.y + 2, mz, mx, top.y + 2, mz, NEON.signWarm, true);
}

/** 屋顶广告位 */
export function billboard(vox, top, rng) {
  const { x0, y, z0, x1, z1 } = top;
  const longX = (x1 - x0) >= (z1 - z0);
  const col = rng.pick([NEON.magenta, NEON.cyan, NEON.yellow, NEON.signWarm]);
  if (longX) {
    const bx = x0 + 1;
    vox.box(bx, y + 1, z0, bx, y + 3, z1, WINDOW.frame, false);
    vox.box(bx + 1, y + 2, z0 + 1, bx + 1, y + 3, z1 - 1, col, true);
  } else {
    const bz = z0 + 1;
    vox.box(x0, y + 1, bz, x1, y + 3, bz, WINDOW.frame, false);
    vox.box(x0 + 1, y + 2, bz + 1, x1 - 1, y + 3, bz + 1, col, true);
  }
}

/**
 * 屋顶套件。opts:
 * { rng, wall, roofCol, parapet, gable, sawtooth, mech, antenna, crown, billboard }
 */
export function dressRoof(vox, top, opts) {
  const {
    rng, wall, roofCol = 0x4a4e54,
    parapet: wantP = false, gable: wantG = false, sawtooth: wantS = false,
    mech: pMech = 0, antenna: pAnt = 0, crown: pCrown = 0, billboard: pBill = 0,
  } = opts;

  if (wantG) {
    gableRoof(vox, top, roofCol, rng);
    return;
  }

  roofDeck(vox, top, shade(roofCol, 0.95));
  if (wantS) sawtoothParapet(vox, top, shade(roofCol, 0.9));
  else if (wantP) parapet(vox, top, shade(wall, 1.05));

  if (pMech > 0 && rng && rng.chance(pMech)) mechKit(vox, top, rng);
  if (pAnt > 0 && rng && rng.chance(pAnt)) antennaMast(vox, top);
  if (pCrown > 0 && rng && rng.chance(pCrown)) crown(vox, top, wall);
  if (pBill > 0 && rng && rng.chance(pBill)) billboard(vox, top, rng);
}

/** 裙房/退台露台：屋面已在体量里铺好，这里只做矮沿 */
export function dressTerrace(vox, top, opts) {
  parapet(vox, top, shade(opts.wall, 1.02));
}
