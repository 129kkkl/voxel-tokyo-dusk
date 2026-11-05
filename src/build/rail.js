import * as THREE from 'three';
import { PROP } from './palette.js';

const ELEVATED = 12;

function densify(pts) {
  const dense = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    const steps = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1])));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      dense.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return dense;
}

export function placeRail(vox, CITY, stats) {
  const pts = CITY.rail.pts;
  const dense = densify(pts);

  for (let i = 0; i < dense.length; i++) {
    const [x, z] = dense[i];
    const xi = Math.round(x);
    const zi = Math.round(z);
    const gy = CITY.groundY(xi, zi);
    const y = Math.max(gy + 4, ELEVATED);

    // 桥面 + 托梁
    vox.box(xi - 2, y, zi, xi + 2, y, zi, PROP.deck, false);
    if (i % 12 === 0) {
      for (let yy = gy; yy < y; yy++) vox.add(xi, yy, zi, PROP.pier, false);
      vox.box(xi - 3, y - 1, zi, xi + 3, y - 1, zi, PROP.pier, false);
    }
    // 双轨
    vox.add(xi, y + 1, zi - 1, PROP.rail, false);
    vox.add(xi, y + 1, zi + 1, PROP.rail, false);
    // 接触网
    if (i % 8 === 0) {
      for (let yy = y + 2; yy <= y + 6; yy++) vox.add(xi, yy, zi - 2, PROP.pier, false);
      vox.add(xi, y + 6, zi + 2, PROP.wire, false);
    }
  }

  // 车站：站台与轨道分离
  for (const s of CITY.stations) {
    const gy = CITY.groundY(s.x, s.z);
    const big = s.rank === 'main' ? 16 : s.rank === 'sub' ? 11 : 8;
    const y = Math.max(gy + 4, ELEVATED);
    // 估算轨道方向，站台侧向偏移
    let tx = 0;
    let tz = 1;
    // 用相邻轨道点估切向
    let best = 0;
    let bestD = 1e9;
    for (let i = 0; i < dense.length; i++) {
      const d = (dense[i][0] - s.x) ** 2 + (dense[i][1] - s.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    const p0 = dense[best];
    const p1 = dense[(best + 2) % dense.length];
    tx = p1[0] - p0[0];
    tz = p1[1] - p0[1];
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl;
    tz /= tl;
    // 法向偏移（站台在一侧）
    const nx = -tz;
    const nz = tx;
    const off = 6;
    const sx = Math.round(s.x + nx * off);
    const sz = Math.round(s.z + nz * off);
    const y0 = CITY.groundY(sx, sz);
    const claim = CITY.claimFree(
      sx - big, sz - 3, sx + big, sz + 3,
      `station_${s.rank}`,
    );
    if (!claim) continue;

    vox.box(claim.x0, y0, claim.z0, claim.x1, y0 + 1, claim.z1, 0x6a6e76, false);
    vox.box(claim.x0, y0 + 7, claim.z0, claim.x1, y0 + 8, claim.z1, PROP.canopy, false);
    for (let x = claim.x0 + 2; x < claim.x1; x += 4) {
      vox.add(x, y0 + 6, Math.round(claim.cz), PROP.stationSign, true);
    }
    // 台阶连向轨旁（不画在轨上）
    for (let i = 0; i < 4; i++) {
      const bx = Math.round(s.x + nx * (3 + i));
      const bz = Math.round(s.z + nz * (3 + i));
      if (CITY.isRail(bx, bz) || CITY.isRoad(bx, bz) || CITY.isWater(bx, bz)) continue;
      vox.add(bx, y0 + i, bz, 0x8a8e96, false);
    }
  }

  // 支线
  if (CITY.rail.spur?.pts) {
    const sd = densify(CITY.rail.spur.pts);
    for (let i = 0; i < sd.length; i++) {
      const [x, z] = sd[i];
      const xi = Math.round(x);
      const zi = Math.round(z);
      const gy = CITY.groundY(xi, zi);
      const y = Math.max(gy + 2, 4);
      vox.box(xi - 1, y, zi, xi + 1, y, zi, PROP.deck, false);
      vox.add(xi, y + 1, zi - 1, PROP.rail, false);
      vox.add(xi, y + 1, zi + 1, PROP.rail, false);
      if (i % 16 === 0) for (let yy = gy; yy < y; yy++) vox.add(xi, yy, zi, PROP.pier, false);
    }
  }

  const curvePts = dense.filter((_, i) => i % 3 === 0).map(([x, z]) => {
    const xi = Math.round(x);
    const zi = Math.round(z);
    const gy = CITY.groundY(xi, zi);
    return new THREE.Vector3(xi, Math.max(gy + 4, ELEVATED) + 1.5, zi);
  });
  if (stats) stats.railDense = dense.length;
  return new THREE.CatmullRomCurve3(curvePts, true, 'centripetal');
}
