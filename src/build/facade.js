/** 立面零件 v2：暗窗必生成 + 同色连段合并（窗格织物）。 */
import { WINDOW, pickWindowColor, shade } from './palette.js';
import { FACE_OF, bandHex } from './claimUtil.js';
import { hash2 } from '../rng.js';

const GRID = {
  curtain: { bay: 1, floor: 1, mullion: 6, lineEvery: 3, margin: 0 },
  mullion: { bay: 2, floor: 2, mullion: 3, lineEvery: 3, margin: 0 },
  punched: { bay: 3, floor: 2, mullion: 0, lineEvery: 3, margin: 1 },
  gallery: { bay: 3, floor: 3, mullion: 0, lineEvery: 0, margin: 1 },
  shopfront: { bay: 3, floor: 2, mullion: 0, lineEvery: 3, margin: 1 },
};

/** 体量外圈薄带（楼层线/压檐）：0.5 高缩放实例，不吞一整行窗 */
export function faceRing(vox, x0, y, z0, x1, z1, color, off = 0.25) {
  const sx = x1 - x0 + 1;
  const sz = z1 - z0 + 1;
  const cy = y + 0.3;
  vox.boxC((x0 + x1) / 2, cy, z1 + off, sx, 0.5, 0.5, color, false);
  vox.boxC((x0 + x1) / 2, cy, z0 - off, sx, 0.5, 0.5, color, false);
  vox.boxC(x1 + off, cy, (z0 + z1) / 2, 0.5, 0.5, sz, color, false);
  vox.boxC(x0 - off, cy, (z0 + z1) / 2, 0.5, 0.5, sz, color, false);
}

/**
 * 画一个长方体量的墙身 + 四面窗格。
 * v: {x0, y, z0, x1, z1, h}，屋顶面在 y+h
 */
export function paintVolume(vox, v, opts) {
  const {
    wall, style = 'punched', litP = 0.35, rng, face = 0,
    shopFront = false, faces = null,
    plinth = true, cornice = true, lineEvery = null, upper = null,
  } = opts;
  const { x0, y: y0, z0, x1, z1, h } = v;
  if (h <= 0 || x1 < x0 || z1 < z0) return;
  const y1 = y0 + h - 1;

  const baseH = plinth ? Math.min(2, Math.max(1, Math.floor(h * 0.15))) : 0;
  if (baseH > 0) {
    vox.box(x0, y0, z0, x1, y0 + baseH - 1, z1, shade(wall, shopFront ? 0.72 : 0.85), false);
  }

  const bodyBot = y0 + baseH;
  if (bodyBot <= y1) {
    const bands = Math.max(1, Math.min(5, Math.floor(h / 5)));
    const spanY = y1 - bodyBot + 1;
    for (let b = 0; b < bands; b++) {
      const ya = bodyBot + Math.floor((b * spanY) / bands);
      const yb = bodyBot + Math.floor(((b + 1) * spanY) / bands) - 1;
      if (yb < ya) continue;
      vox.box(x0, ya, z0, x1, yb, z1, bandHex(wall, b, x0 * 7 + z0), false);
    }
  }

  const grid = GRID[style] || GRID.punched;
  const le = lineEvery ?? grid.lineEvery;
  if (le > 0) {
    for (let y = bodyBot + le; y <= y1 - 1; y += le) {
      faceRing(vox, x0, y, z0, x1, z1, shade(wall, 0.82));
    }
  }
  if (cornice && h >= 2) faceRing(vox, x0, y1, z0, x1, z1, shade(wall, 1.08));

  const fl = faces || [0, 1, 2, 3];
  for (const f of fl) {
    paintFace(vox, v, f, {
      wall, style, litP, rng, face, shopFront, baseH,
      upper: upper || (style === 'shopfront' ? 'punched' : style),
    });
  }
}

function paintFace(vox, v, face, o) {
  const { wall, style, litP, rng, face: front, shopFront, baseH, upper } = o;
  const { x0, y: y0, z0, x1, z1, h } = v;
  const [nx, nz] = FACE_OF[face];
  const alongZ = nz !== 0;
  const u0 = alongZ ? x0 : z0;
  const u1 = alongZ ? x1 : z1;
  const span = u1 - u0 + 1;
  const y1 = y0 + h - 1;
  if (h < 3 || span < 2) return;
  const wallCoord = nz > 0 ? z1 + 0.35
    : nz < 0 ? z0 - 0.35
      : nx > 0 ? x1 + 0.35 : x0 - 0.35;
  const grid = GRID[style] || GRID.punched;
  const faceMul = face === front ? 1.0 : face === (front ^ 1) ? 0.85 : 0.5;

  let yStart = y0 + baseH + 1;
  const yEnd = y1 - 1;
  if (shopFront && face === front) {
    paintShopBand(vox, u0, u1, y0 + baseH, alongZ, wallCoord, rng, wall, nz, nx, z0, z1, x0, x1);
    yStart = y0 + baseH + 2;
  }
  if (yEnd < yStart) return;

  if (style === 'gallery') {
    paintGalleryFace(vox, u0, u1, yStart, yEnd, alongZ, wallCoord, wall, litP, rng, face, y0, h, faceMul);
    return;
  }

  const upStyle = style === 'shopfront' ? upper : style;
  const uGrid = GRID[upStyle] || GRID.punched;
  for (let y = yStart; y <= yEnd; y += uGrid.floor) {
    const floorFrac = (y - y0) / Math.max(1, h);
    const p = litP * (1 - 0.5 * floorFrac) * faceMul;
    const cells = rowCells(u0, u1, uGrid, y, face, p, rng, span);
    if (cells.length) paintRow(vox, cells, y, alongZ, wallCoord);
  }

  if (uGrid.mullion > 0 && span > uGrid.mullion) {
    const col = shade(wall, 0.9);
    for (let u = u0 + uGrid.mullion - 1; u < u1; u += uGrid.mullion) {
      if (alongZ) vox.box(u, yStart, wallCoord, u, yEnd, wallCoord, col, false);
      else vox.box(wallCoord, yStart, u, wallCoord, yEnd, u, col, false);
    }
  }
}

function rowCells(u0, u1, grid, y, face, p, rng, span) {
  const dense = grid.bay <= 1;
  const margin = (!dense && span < 7) ? 0 : grid.margin;
  const start = u0 + margin;
  const end = u1 - margin;
  const cells = [];
  if (end < start) return cells;
  const bay = (!dense && span <= 5) ? 2 : grid.bay;
  if (dense) {
    for (let u = start; u <= end; u++) {
      if (grid.mullion > 0 && ((u - start) % grid.mullion) === grid.mullion - 1) continue;
      cells.push({ u, y, face });
    }
  } else {
    for (let u = start; u <= end; u += bay) cells.push({ u, y, face });
  }
  if (!cells.length) return cells;

  // 亮窗成簇（平均簇长 ~2.2，利于合并），暗窗逐格取 3 色（优先同色合并）
  const b = 0.45;
  const a = Math.max(0.02, Math.min(0.85, (p * b) / Math.max(0.08, 1 - p)));
  let lit = false;
  let col = 0;
  for (const c of cells) {
    if (!lit) {
      if (rng() < a) {
        lit = true;
        col = pickWindowColor(rng);
      }
    } else if (rng() < b) lit = false;
    if (lit) {
      c.color = col;
      c.glow = true;
    } else {
      c.color = WINDOW.dark[Math.min(WINDOW.dark.length - 1,
        (hash2(c.u, c.y * 13 + c.face * 101) * WINDOW.dark.length) | 0)];
      c.glow = false;
    }
  }
  return cells;
}

/** 同一行连续同色窗合并为缩放实例 */
function paintRow(vox, cells, y, alongZ, wallCoord) {
  let i = 0;
  while (i < cells.length) {
    let j = i;
    while (j + 1 < cells.length && cells[j + 1].u === cells[j].u + 1
      && cells[j + 1].color === cells[i].color && cells[j + 1].glow === cells[i].glow) j++;
    const ua = cells[i].u;
    const ub = cells[j].u;
    if (alongZ) vox.box(ua, y, wallCoord, ub, y, wallCoord, cells[i].color, cells[i].glow);
    else vox.box(wallCoord, y, ua, wallCoord, y, ub, cells[i].color, cells[i].glow);
    i = j + 1;
  }
}

function paintShopBand(vox, u0, u1, y, alongZ, wallCoord, rng, wall, nz, nx, z0, z1, x0, x1) {
  const cells = [];
  for (let u = u0; u <= u1; u++) cells.push({ u, y, face: -1 });
  const b = 0.45;
  const a = 0.55 * b / 0.45;
  let lit = false;
  let col = 0;
  for (const c of cells) {
    if (!lit) {
      if (rng() < a) {
        lit = true;
        col = pickWindowColor(rng);
      }
    } else if (rng() < b) lit = false;
    if (lit) {
      c.color = col;
      c.glow = true;
    } else {
      c.color = WINDOW.dark[0];
      c.glow = false;
    }
  }
  paintRow(vox, cells, y, alongZ, wallCoord);
  // 雨棚 1 格出挑
  const yA = y + 1;
  const ac = shade(wall, 1.05);
  if (alongZ) {
    const awn = nz > 0 ? z1 + 1 : z0 - 1;
    vox.box(u0, yA, awn, u1, yA, awn, ac, false);
  } else {
    const awn = nx > 0 ? x1 + 1 : x0 - 1;
    vox.box(awn, yA, u0, awn, yA, u1, ac, false);
  }
}

function paintGalleryFace(vox, u0, u1, yStart, yEnd, alongZ, wallCoord, wall, litP, rng, face, y0, h, faceMul) {
  const deckCol = shade(wall, 0.82);
  const doorCol = shade(wall, 0.62);
  for (let y = yStart; y <= yEnd; y += 3) {
    if (alongZ) {
      vox.box(u0, y, wallCoord + 0.15, u1, y, wallCoord + 0.15, deckCol, false);
      vox.box(u0, y + 1, wallCoord + 0.3, u1, y + 1, wallCoord + 0.3, WINDOW.frame, false);
    } else {
      vox.box(wallCoord + 0.15, y, u0, wallCoord + 0.15, y, u1, deckCol, false);
      vox.box(wallCoord + 0.3, y + 1, u0, wallCoord + 0.3, y + 1, u1, WINDOW.frame, false);
    }
    const floorFrac = (y - y0) / Math.max(1, h);
    const p = litP * (1 - 0.5 * floorFrac) * faceMul;
    const cells = [];
    for (let u = u0; u <= u1; u += 3) {
      const lit = rng() < p * 0.8;
      cells.push({
        u,
        color: lit ? pickWindowColor(rng) : doorCol,
        glow: lit,
      });
    }
    if (cells.length) paintRow(vox, cells, y + 2, alongZ, wallCoord);
    const wins = [];
    for (let u = u0 + 1; u <= u1; u += 3) {
      const lit = rng() < p * 0.6;
      wins.push({
        u,
        color: lit ? pickWindowColor(rng) : WINDOW.dark[1],
        glow: lit,
      });
    }
    if (wins.length) paintRow(vox, wins, y + 2, alongZ, wallCoord + 0.2);
  }
}

/** 兼容入口：单体量墙身 + 平屋面 */
export function paintBody(vox, c, opts) {
  const { h, roof = 0x4a4e54, roofKit = true, rng, ...rest } = opts;
  paintVolume(vox, c, { ...rest, h, rng });
  vox.box(c.x0, c.y + h, c.z0, c.x1, c.y + h, c.z1, shade(roof, 0.95), false);
  if (roofKit && h >= 4 && rng && (c.x1 - c.x0 >= 2 || c.z1 - c.z0 >= 2)) {
    const wx = c.x0 + 1 + (rng() < 0.5 ? 0 : Math.max(0, c.x1 - c.x0 - 2));
    const wz = c.z0 + 1 + (rng() < 0.5 ? 0 : Math.max(0, c.z1 - c.z0 - 2));
    vox.box(wx, c.y + h + 1, wz, Math.min(c.x1, wx + 1), c.y + h + 3, Math.min(c.z1, wz + 1), 0x6a6e76, false);
  }
}

/** 极简体量：无窗盒，用于填充构筑 */
export function paintBox(vox, c, color, h) {
  vox.box(c.x0, c.y, c.z0, c.x1, c.y + h, c.z1, color, false);
}
