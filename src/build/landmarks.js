import { LANDMARK, WINDOW, shade } from './palette.js';
import { claimBase } from './claimUtil.js';
import { hash2 } from '../rng.js';

function inClaim(base, x, z) {
  return x >= base.x0 && x <= base.x1 && z >= base.z0 && z <= base.z1;
}

function boxIn(vox, base, x0, y0, z0, x1, y1, z1, color, glow = false) {
  const sx0 = Math.max(x0, base.x0);
  const sz0 = Math.max(z0, base.z0);
  const sx1 = Math.min(x1, base.x1);
  const sz1 = Math.min(z1, base.z1);
  if (sx1 < sx0 || sz1 < sz0) return;
  vox.box(sx0, y0, sz0, sx1, y1, sz1, color, glow);
}

function addIn(vox, base, x, y, z, color, glow = false) {
  // 判定用四舍五入面格：窗格可微凸（x.3 / z.3）而不被裁掉
  if (!inClaim(base, Math.round(x), Math.round(z))) return;
  vox.add(x, y, z, color, glow);
}

/** 微凸细部（窗带/竖梃/层间线）：claim 按整数面判定，实例放微凸位置 */
function boxOut(vox, base, x0, y0, z0, x1, y1, z1, color, glow = false) {
  const rx0 = Math.min(Math.round(x0), Math.round(x1));
  const rx1 = Math.max(Math.round(x0), Math.round(x1));
  const rz0 = Math.min(Math.round(z0), Math.round(z1));
  const rz1 = Math.max(Math.round(z0), Math.round(z1));
  if (rx0 < base.x0 || rx1 > base.x1 || rz0 < base.z0 || rz1 > base.z1) return;
  vox.box(x0, y0, z0, x1, y1, z1, color, glow);
}

/** 面上一道斜撑：dir=+1 为 /，dir=-1 为 \。c 为沿向中心，fix 为固定轴坐标 */
function braceDiag(vox, base, c, ya, yb, half, fix, alongZ, col, dir) {
  const H = yb - ya;
  for (let k = 0; k <= H; k++) {
    const t = H ? k / H : 0;
    const d = dir > 0
      ? Math.round(-half + t * 2 * half)
      : Math.round(half - t * 2 * half);
    const y = ya + k;
    if (alongZ) addIn(vox, base, c + d, y, fix, col, false);
    else addIn(vox, base, fix, y, c + d, col, false);
  }
}

/** 面上 X 形斜撑（两道交叉斜杆） */
function braceX(vox, base, c, ya, yb, half, fix, alongZ, col) {
  braceDiag(vox, base, c, ya, yb, half, fix, alongZ, col, 1);
  braceDiag(vox, base, c, ya, yb, half, fix, alongZ, col, -1);
}

/** 面上 Z 形单斜撑（与上下环梁合成 Z 字） */
function braceZ(vox, base, c, ya, yb, half, fix, alongZ, col, dir = 1) {
  braceDiag(vox, base, c, ya, yb, half, fix, alongZ, col, dir);
}

/** 东京塔：桁架四腿 + 环梁 + X/Z 斜撑 + FootTown 窗格 + 展望台窗带 */
export function placeTokyoTower(vox, CITY, stats) {
  const a = CITY.anchors.landmarkTower;
  if (!a) return;
  const base = claimBase(CITY, a.x, a.z, 15, 15, 'landmark_tower');
  if (!base) return;
  const x = Math.round(base.cx);
  const z = Math.round(base.cz);
  const y0 = base.y;
  // 最大半宽随 claim 收缩（腿在 ±R，裙楼 ±(R-1)）
  const R = Math.max(2, Math.min(5, Math.floor(Math.min(base.x1 - base.x0, base.z1 - base.z0) / 2) - 1));

  // FootTown 裙楼 + 窗格
  boxIn(vox, base, x - R + 1, y0, z - R + 1, x + R - 1, y0 + 4, z + R - 1, 0xcfc9ba, false);
  for (let wy = y0 + 1; wy <= y0 + 3; wy += 2) {
    for (let u = -R + 2; u <= R - 2; u += 2) {
      const lit = hash2(x + u * 3, wy) > 0.5;
      const col = lit ? WINDOW.warm[(hash2(u, wy) * WINDOW.warm.length) | 0] : WINDOW.dark[0];
      addIn(vox, base, x + u, wy, z + R - 0.7, col, lit);
      addIn(vox, base, x + u, wy, z - R + 0.7, col, lit);
      addIn(vox, base, x + R - 0.7, wy, z + u, col, lit);
      addIn(vox, base, x - R + 0.7, wy, z + u, col, lit);
    }
  }
  // 裙楼店面带（小面积 glow）
  boxOut(vox, base, x - R + 2, y0, z + R - 0.7, x + R - 2, y0, z + R - 0.7, WINDOW.warm[0], true);

  const halfAt = (y) => Math.max(1, Math.floor(R * (1 - y / 100)));
  const bandOf = (y) => (y / 10) | 0;
  const isOrange = (band) => band % 2 === 0;
  const legCol = (band) => (isOrange(band) ? LANDMARK.towerOrange : LANDMARK.towerWhite);

  // 桁架段：10 层一段（段内半宽恒定），橙段整段发光
  for (let band = 0; band < 10; band++) {
    const ya = band * 10;
    const yb = Math.min(94, ya + 9);
    const half = halfAt(ya);
    const orange = isOrange(band);
    const col = legCol(band);
    for (const sx of [1, -1]) {
      for (const sz of [1, -1]) {
        const px = x + sx * half;
        const pz = z + sz * half;
        boxIn(vox, base, px, y0 + 5 + ya, pz, px, y0 + 5 + yb, pz, col, orange);
        if (half >= 2) {
          const qx = x + sx * (half - 1);
          boxIn(vox, base, qx, y0 + 5 + ya, pz, qx, y0 + 5 + yb, pz, col, false);
        }
      }
    }
  }

  // 环梁 + X/Z 斜撑：每 4 层一跨，斜撑交替，可读
  let zDir = 1;
  for (let y = 0; y < 95; y += 4) {
    const half = halfAt(y);
    const col = legCol(bandOf(y));
    const yTop = Math.min(94, y + 3);
    if (half < 2) continue;
    boxIn(vox, base, x - half, y0 + 5 + y, z - half, x + half, y0 + 5 + y, z - half, col, false);
    boxIn(vox, base, x - half, y0 + 5 + y, z + half, x + half, y0 + 5 + y, z + half, col, false);
    boxIn(vox, base, x - half, y0 + 5 + y, z - half, x - half, y0 + 5 + y, z + half, col, false);
    boxIn(vox, base, x + half, y0 + 5 + y, z - half, x + half, y0 + 5 + y, z + half, col, false);
    const useX = ((y / 4) | 0) % 2 === 0;
    const yaB = y0 + 5 + y;
    const ybB = y0 + 5 + yTop;
    for (const s of [1, -1]) {
      const fz = z + s * half;
      if (useX) braceX(vox, base, x, yaB, ybB, half, fz, true, col);
      else braceZ(vox, base, x, yaB, ybB, half, fz, true, col, zDir);
    }
    for (const s of [1, -1]) {
      const fx = x + s * half;
      if (useX) braceZ(vox, base, z, yaB, ybB, half, fx, false, col, -zDir);
      else braceX(vox, base, z, yaB, ybB, half, fx, false, col);
    }
    zDir = -zDir;
  }

  // 展望台：甲板 + 体量 + 窗带
  const dw = Math.min(3, R - 1);
  boxIn(vox, base, x - dw - 1, y0 + 57, z - dw - 1, x + dw + 1, y0 + 57, z + dw + 1, 0xdcd6c8, false);
  boxIn(vox, base, x - dw, y0 + 58, z - dw, x + dw, y0 + 62, z + dw, LANDMARK.towerWhite, false);
  for (const wy of [y0 + 59, y0 + 60]) {
    boxOut(vox, base, x - dw, wy, z + dw + 0.3, x + dw, wy, z + dw + 0.3, LANDMARK.towerGlow, true);
    boxOut(vox, base, x - dw, wy, z - dw - 0.3, x + dw, wy, z - dw - 0.3, LANDMARK.towerGlow, true);
    boxOut(vox, base, x + dw + 0.3, wy, z - dw, x + dw + 0.3, wy, z + dw, LANDMARK.towerGlow, true);
    boxOut(vox, base, x - dw - 0.3, wy, z - dw, x - dw - 0.3, wy, z + dw, LANDMARK.towerGlow, true);
  }
  boxIn(vox, base, x - dw - 1, y0 + 63, z - dw - 1, x + dw + 1, y0 + 63, z + dw + 1, shade(LANDMARK.towerWhite, 1.05), false);

  // 天线
  for (let y = 95; y < 102; y++) {
    if (inClaim(base, x, z)) vox.add(x, y0 + 5 + y, z, y % 2 ? LANDMARK.towerOrange : LANDMARK.towerWhite, y > 98);
  }
  if (stats) stats.landmarks.tower = base;
}

/** 天空树：tripod 加粗 + 螺旋点阵加密 + 青蓝双层观景台 */
export function placeSkytree(vox, CITY, stats) {
  const a = CITY.anchors.skytree;
  if (!a) return;
  const base = claimBase(CITY, a.x, a.z, 13, 13, 'skytree');
  if (!base) return;
  const x = Math.round(base.cx);
  const z = Math.round(base.cz);
  const y0 = base.y;
  const S = Math.max(2, Math.min(3, Math.floor(Math.min(base.x1 - base.x0, base.z1 - base.z0) / 2) - 2));
  const L = Math.max(1, Math.floor(Math.min(base.x1 - base.x0, base.z1 - base.z0) / 2) - 2);

  boxIn(vox, base, x - S - 1, y0, z - S - 1, x + S + 1, y0 + 2, z + S + 1, 0x555a62, false);

  // tripod 基座：加粗腿 + 斜撑汇入芯筒
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    for (let y = 2; y < 18; y++) {
      const t = (y - 2) / 16;
      const r = Math.max(1, Math.round(L + 1 - L * t));
      const px = x + sx * r;
      const pz = z + sz * r;
      const fat = y < 10 ? 1 : 0;
      boxIn(vox, base, px, y0 + y, pz, px + sx * fat, y0 + y, pz + sz * fat, LANDMARK.skytreeBody, false);
    }
    for (const hy of [4, 8, 12]) {
      const r = Math.max(1, Math.round(L + 1 - L * ((hy - 2) / 16)));
      const px = x + sx * r;
      const pz = z + sz * r;
      for (let k = 0; k < 3; k++) {
        const qx = Math.round(px + (x - px) * (k / 2) * 0.55);
        const qz = Math.round(pz + (z - pz) * (k / 2) * 0.55);
        addIn(vox, base, qx, y0 + hy + k, qz, LANDMARK.skytreeBody, false);
      }
    }
  }

  // 螺旋外壁点阵：三螺旋脊 + 交错点阵（比旧 hash 更密）
  for (let y = 0; y < 100; y++) {
    const s = Math.max(1, Math.floor(S * (1 - y / 110) + 0.5));
    for (let dx = -s; dx <= s; dx++) {
      for (let dz = -s; dz <= s; dz++) {
        const onRing = Math.abs(dx) === s || Math.abs(dz) === s;
        if (!onRing && !(dx === 0 && dz === 0)) continue;
        const px = x + dx;
        const pz = z + dz;
        if (!inClaim(base, px, pz)) continue;
        if (dx === 0 && dz === 0) {
          vox.add(px, y0 + 3 + y, pz, LANDMARK.skytreeBody, false);
          continue;
        }
        const around = (Math.atan2(dz, dx) / (Math.PI * 2) + 1.25) % 1;
        const spiral = ((around * 3 + y * 0.06) % 1) < 0.34;
        const grid = ((px + pz + y) & 1) === 0;
        const dense = hash2(px + y, pz) > 0.12;
        if (!(spiral || (grid && dense))) continue;
        vox.add(px, y0 + 3 + y, pz, LANDMARK.skytreeBody, false);
      }
    }
  }

  // 青蓝观景台双层（窗带式光环）
  for (const [dy, half] of [[72, L], [82, L + 1]]) {
    const hh = Math.min(half, L + 1);
    boxIn(vox, base, x - hh - 1, y0 + dy, z - hh - 1, x + hh + 1, y0 + dy, z + hh + 1, 0x8a9098, false);
    boxIn(vox, base, x - hh, y0 + dy + 1, z - hh, x + hh, y0 + dy + 2, z + hh, shade(LANDMARK.skytreeGlow, 0.62), false);
    boxOut(vox, base, x - hh, y0 + dy + 1, z + hh + 0.3, x + hh, y0 + dy + 1, z + hh + 0.3, LANDMARK.skytreeGlow, true);
    boxOut(vox, base, x - hh, y0 + dy + 1, z - hh - 0.3, x + hh, y0 + dy + 1, z - hh - 0.3, LANDMARK.skytreeGlow, true);
    boxOut(vox, base, x + hh + 0.3, y0 + dy + 1, z - hh, x + hh + 0.3, y0 + dy + 1, z + hh, LANDMARK.skytreeGlow, true);
    boxOut(vox, base, x - hh - 0.3, y0 + dy + 1, z - hh, x - hh - 0.3, y0 + dy + 1, z + hh, LANDMARK.skytreeGlow, true);
    boxIn(vox, base, x - hh - 1, y0 + dy + 3, z - hh - 1, x + hh + 1, y0 + dy + 3, z + hh + 1, 0x8a9098, false);
  }
  addIn(vox, base, x, y0 + 104, z, LANDMARK.beacon, true);
  if (stats) stats.landmarks.skytree = base;
}

/** 都厅双塔：竖梃 + 层间线 + 窗织物 + 顶部机电 */
export function placeMetroGov(vox, CITY, stats) {
  const a = CITY.anchors.metroGov;
  if (!a) return;
  const base = claimBase(CITY, a.x, a.z, 22, 14, 'metro_gov');
  if (!base) return;
  const x = Math.round(base.cx);
  const z = Math.round(base.cz);
  const y0 = base.y;
  const W = base.x1 - base.x0 + 1;
  const D = base.z1 - base.z0 + 1;
  // 塔身半宽/半深与双塔间距随 claim 收缩，保证两塔都完整落在 claim 内
  const hw = Math.max(2, Math.min(4, Math.floor((W - 2) / 4)));
  const hd = Math.max(2, Math.min(4, Math.floor((D - 1) / 2)));
  const gap = Math.max(hw + 1, Math.floor((W - 1) / 2) - hw);
  const body = LANDMARK.metroBody;
  const line = shade(body, 0.78);
  const mull = shade(body, 0.88);

  for (const s of [-1, 1]) {
    const cx = x + s * gap;
    // 塔身
    boxIn(vox, base, cx - hw, y0, z - hd, cx + hw, y0 + 48, z + hd, body, false);
    // 层间线：每 3 行一圈暗线（四边薄带）
    for (let y = y0 + 3; y < y0 + 48; y += 3) {
      boxOut(vox, base, cx - hw, y, z + hd, cx + hw, y, z + hd, line, false);
      boxOut(vox, base, cx - hw, y, z - hd, cx + hw, y, z - hd, line, false);
      boxOut(vox, base, cx + hw, y, z - hd, cx + hw, y, z + hd, line, false);
      boxOut(vox, base, cx - hw, y, z - hd, cx - hw, y, z + hd, line, false);
    }
    // 竖梃：每 3 开间贯通
    for (let ox = -hw + 1; ox <= hw - 1; ox += 3) {
      boxOut(vox, base, cx + ox, y0 + 1, z - hd - 0.2, cx + ox, y0 + 47, z - hd - 0.2, mull, false);
      boxOut(vox, base, cx + ox, y0 + 1, z + hd + 0.2, cx + ox, y0 + 47, z + hd + 0.2, mull, false);
      boxOut(vox, base, cx - hw - 0.2, y0 + 1, z + ox, cx - hw - 0.2, y0 + 47, z + ox, mull, false);
      boxOut(vox, base, cx + hw + 0.2, y0 + 1, z + ox, cx + hw + 0.2, y0 + 47, z + ox, mull, false);
    }
    // 窗织物：四面，暗格 + 亮格（facade v2 纪律）
    for (let y = y0 + 2; y < y0 + 47; y += 2) {
      for (let ox = -hw + 1; ox <= hw - 1; ox++) {
        if (ox % 3 === 0) continue;
        const lit = hash2(cx + ox, y) > 0.5;
        const col = lit ? LANDMARK.metroWin : LANDMARK.metroWinDark;
        addIn(vox, base, cx + ox, y, z + hd + 0.3, col, lit);
        addIn(vox, base, cx + ox, y, z - hd - 0.3, col, lit);
        addIn(vox, base, cx + hw + 0.3, y, z + ox, col, lit);
        addIn(vox, base, cx - hw - 0.3, y, z + ox, col, lit);
      }
    }
    // 檐口 + 顶部机电层
    boxIn(vox, base, cx - hw - 1, y0 + 48, z - hd - 1, cx + hw + 1, y0 + 50, z + hd + 1, 0x8a8e96, false);
    boxIn(vox, base, cx - hw + 1, y0 + 51, z - hd + 1, cx + hw - 1, y0 + 53, z + hd - 1, 0x6a6e76, false);
    boxIn(vox, base, cx - 1, y0 + 54, z - 1, cx + 1, y0 + 56, z + 1, shade(0x6a6e76, 1.12), false);
  }
  // 中缝
  const mid = Math.max(1, gap - hw - 1);
  boxIn(vox, base, x - mid, y0, z - 2, x + mid, y0 + 20, z + 2, 0x6a6e76, false);
  if (stats) stats.landmarks.metro = base;
}

/** 神社：两层屋檐 + 五重塔逐层出挑 + 灯笼串 */
export function placeShrine(vox, CITY, stats) {
  const a = CITY.anchors.shrine;
  if (!a) return;
  const base = claimBase(CITY, a.x, a.z, 18, 18, 'shrine');
  if (!base) return;
  const x = Math.round(base.cx);
  const z = Math.round(base.cz);
  const y0 = base.y;
  const hw = Math.floor((base.x1 - base.x0) / 2);
  const hd = Math.floor((base.z1 - base.z0) / 2);
  const hallW = Math.max(2, Math.min(5, hw - 2));
  const hallD = Math.max(2, Math.min(4, hd - 3));

  // 参道地坪
  boxIn(vox, base, x - 2, y0, z + hallD, x + 2, y0, base.z1, 0x8a8070, false);
  // 鸟居
  for (const dz of [hallD + 2, hallD + 5, hallD + 8]) {
    const zz = z + dz;
    if (zz > base.z1) continue;
    if (!inClaim(base, x - 2, zz)) continue;
    vox.add(x - 2, y0 + 1, zz, LANDMARK.torii, false);
    vox.add(x + 2, y0 + 1, zz, LANDMARK.torii, false);
    boxIn(vox, base, x - 3, y0 + 4, zz, x + 3, y0 + 4, zz, LANDMARK.torii, false);
    boxIn(vox, base, x - 2, y0 + 3, zz, x + 2, y0 + 3, zz, LANDMARK.torii, false);
  }
  // 主殿（偏前，给五重塔留位）
  const hz = z + 1;
  boxIn(vox, base, x - hallW, y0, hz - hallD, x + hallW, y0 + 3, hz + hallD, LANDMARK.shrineWood, false);
  // 两层出檐：下檐大出挑，上檐收进
  boxIn(vox, base, x - hallW - 2, y0 + 4, hz - hallD - 2, x + hallW + 2, y0 + 4, hz + hallD + 2, LANDMARK.shrineRoof, false);
  boxIn(vox, base, x - hallW, y0 + 5, hz - hallD, x + hallW, y0 + 5, hz + hallD, shade(LANDMARK.shrineRoof, 1.12), false);
  boxIn(vox, base, x - hallW + 1, y0 + 6, hz, x + hallW - 1, y0 + 7, hz, 0x6a3020, false);
  // 五重塔：每层檐口独立出挑（大檐 + 檐口线）
  const tx = x - Math.max(2, hw - 2);
  const tz = z - Math.max(2, hd - 2);
  const pS = 2;
  if (inClaim(base, tx, tz)) {
    for (let i = 0; i < 5; i++) {
      const s = Math.max(1, pS - Math.floor(i * 0.5));
      const yb = y0 + 1 + i * 4;
      boxIn(vox, base, tx - s + 1, yb, tz - s + 1, tx + s - 1, yb + 1, tz + s - 1, LANDMARK.shrineWood, false);
      boxIn(vox, base, tx - s - 2, yb + 2, tz - s - 2, tx + s + 2, yb + 2, tz + s + 2, LANDMARK.shrineRoof, false);
      boxIn(vox, base, tx - s - 1, yb + 3, tz - s - 1, tx + s + 1, yb + 3, tz + s + 1, shade(LANDMARK.shrineRoof, 0.85), false);
    }
    boxIn(vox, base, tx, y0 + 21, tz, tx, y0 + 23, tz, LANDMARK.torii, false);
  }
  // 灯笼串
  for (let i = 0; i < 4; i++) {
    const zz = hz + hallD + i * 2;
    if (zz > base.z1) continue;
    if (inClaim(base, x + 3, zz)) vox.add(x + 3, y0 + 3, zz, 0xffb36a, true);
    if (inClaim(base, x - 3, zz)) vox.add(x - 3, y0 + 3, zz, 0xffb36a, true);
  }
  if (stats) stats.landmarks.shrine = base;
}

/** 巨蛋：平滑收分壳面 + 透光带点阵 */
export function placeStadium(vox, CITY, stats) {
  const a = CITY.anchors.stadium;
  if (!a) return;
  const base = claimBase(CITY, a.x, a.z, 30, 26, 'stadium');
  if (!base) return;
  const x = Math.round(base.cx);
  const z = Math.round(base.cz);
  const y0 = base.y;
  const RX = Math.max(4, Math.floor((base.x1 - base.x0) / 2) - 1);
  const RZ = Math.max(3, Math.floor((base.z1 - base.z0) / 2) - 1);

  const rings = 14;
  const pts = 36;
  for (let ring = 0; ring < rings; ring++) {
    const t = ring / (rings - 1);
    const shrink = Math.cos(t * Math.PI * 0.42);
    const rx = RX * shrink;
    const rz = RZ * shrink;
    const h = y0 + Math.round(Math.sin(t * Math.PI * 0.48) * 11);
    const lightBand = ring === 4 || ring === 8 || ring === 12;
    for (let i = 0; i < pts; i++) {
      const th = (i / pts) * Math.PI * 2;
      const px = Math.round(x + Math.cos(th) * rx);
      const pz = Math.round(z + Math.sin(th) * rz);
      if (!inClaim(base, px, pz)) continue;
      const glow = lightBand && (i % 2 === 0);
      vox.add(px, h, pz, glow ? 0xd0e8ff : LANDMARK.stadium, glow);
    }
  }
  // 壳面下缘墙
  for (const hy of [y0 + 1, y0 + 2]) {
    for (let i = 0; i < 28; i++) {
      const th = (i / 28) * Math.PI * 2;
      const px = Math.round(x + Math.cos(th) * RX);
      const pz = Math.round(z + Math.sin(th) * RZ);
      if (!inClaim(base, px, pz)) continue;
      vox.add(px, hy, pz, LANDMARK.stadium, false);
    }
  }
  boxIn(vox, base, x - RX + 4, y0, z - RZ + 3, x + RX - 4, y0 + 2, z + RZ - 3, LANDMARK.stadiumDark, false);
  if (stats) stats.landmarks.stadium = base;
}

/** 港口：仓库锯齿屋顶 + 门吊杆件（立柱+横梁+斜撑）；主梁沿 claim 长轴 */
export function placePort(vox, CITY, stats) {
  const a = CITY.anchors.portOffice;
  if (!a) return;
  const base = claimBase(CITY, a.x, a.z, 24, 16, 'port_office');
  if (!base) return;
  const x = Math.round(base.cx);
  const z = Math.round(base.cz);
  const y0 = base.y;
  const W = base.x1 - base.x0 + 1;
  const D = base.z1 - base.z0 + 1;
  // 局部 (u,v)：u 沿长轴（门吊主梁方向），v 沿短轴
  const alongX = W >= D;
  const U = Math.floor((alongX ? W : D) / 2) - 1;
  const V = Math.floor((alongX ? D : W) / 2) - 1;
  const at = (u, v) => (alongX ? [x + u, z + v] : [x + v, z + u]);
  const boxUV = (u0, v0, u1, v1, yA, yB, color, glow) => {
    const [ax0, az0] = at(u0, v0);
    const [ax1, az1] = at(u1, v1);
    boxIn(vox, base, Math.min(ax0, ax1), yA, Math.min(az0, az1), Math.max(ax0, ax1), yB, Math.max(az0, az1), color, glow);
  };
  const addUV = (u, v, y, color, glow) => {
    const [ax, az] = at(u, v);
    addIn(vox, base, ax, y, az, color, glow);
  };
  const U0 = Math.max(2, U - 1);
  const V0 = Math.max(1, V - 1);

  // 仓库主体
  boxUV(-U0, -V0, U0, V0, y0, y0 + 5, 0x5a5e66, false);
  // 锯齿屋顶：齿面爬升 + 竖直采光面（沿 u）
  for (let i = 0; i < 8; i++) {
    const bu = -U0 + i * 3;
    if (bu > U0) break;
    boxUV(bu, -V0, Math.min(bu + 1, U0), V0, y0 + 6, y0 + 6, 0x4a5058, false);
    boxUV(bu + 1, -V0, Math.min(bu + 1, U0), V0, y0 + 7, y0 + 7, 0x4a5058, false);
    if (bu + 2 <= U0) {
      boxUV(bu + 2, -V0, bu + 2, V0, y0 + 6, y0 + 7, 0x7a90a8, false);
    }
  }
  boxUV(-1, -1, 1, 1, y0 + 8, y0 + 8, 0x4a5058, false);

  // 门吊：两组 A 架腿 + 横梁 + 斜撑（杆件可读，不是实心块）
  const crane = 0x8a7a3a;
  const craneDk = shade(0x8a7a3a, 0.78);
  const legU = U0;
  for (const su of [-1, 1]) {
    const uu = su * legU;
    for (const sv of [-1, 1]) {
      for (let y = 0; y < 12; y++) addUV(uu, sv * V0, y0 + y, crane, false);
    }
    for (const hy of [3, 7]) {
      boxUV(uu, -V0, uu, V0, y0 + hy, y0 + hy, craneDk, false);
    }
    // A 架 X 斜撑：面固定在 u=uu，沿 v
    const [fx, fz] = at(uu, 0);
    braceX(vox, base, alongX ? z : x, y0, y0 + 4, V0, alongX ? fx : fz, !alongX, craneDk);
    braceX(vox, base, alongX ? z : x, y0 + 6, y0 + 10, V0, alongX ? fx : fz, !alongX, craneDk);
    boxUV(uu, -V0, uu, V0, y0 + 12, y0 + 12, crane, false);
  }
  // 主横梁（沿 u）
  boxUV(-legU, -1, legU, 1, y0 + 13, y0 + 14, crane, false);
  // 梁上小车
  boxUV(-1, -1, 1, 1, y0 + 15, y0 + 16, craneDk, false);
  // 腿顶 → 梁 中斜撑
  for (const su of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      addUV(su * legU * (1 - k * 0.12), 0, y0 + 14 + k, craneDk, false);
    }
  }
  // 作业警示灯（信标 glow）
  addUV(-legU, 0, y0 + 17, LANDMARK.beacon, true);
  addUV(legU, 0, y0 + 17, LANDMARK.beacon, true);
  if (stats) stats.landmarks.port = base;
}

export function placeLandmarks(vox, CITY, stats) {
  placeTokyoTower(vox, CITY, stats);
  placeSkytree(vox, CITY, stats);
  placeMetroGov(vox, CITY, stats);
  placeShrine(vox, CITY, stats);
  placeStadium(vox, CITY, stats);
  placePort(vox, CITY, stats);
}
