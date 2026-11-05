import { PROP } from './palette.js';
import { ROAD } from '../city/config.js';
import { makeRng } from '../rng.js';
import { placeCherry, placeMiniTree } from './claimUtil.js';

const CLS_GAP = {
  RING: 18,
  RADIAL: 16,
  ARTERIAL: 14,
  MINOR: 22,
};

export function placeStreetProps(vox, CITY, stats) {
  const rng = makeRng(20260919 ^ 0x57EE7);
  const s = stats.props;
  const bridges = CITY.bridges || [];

  for (const road of CITY.roads) {
    const cls = road.cls;
    if (!CLS_GAP[cls] && cls !== 'RAIL') continue;
    const gap = CLS_GAP[cls] || 30;
    const pts = road.pts;
    if (!pts || pts.length < 2) continue;

    let acc = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i];
      const q = pts[i + 1];
      const seg = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (seg < 0.001) continue;
      acc += seg;
      if (acc < gap) continue;
      acc = 0;

      const t = 0.35 + rng() * 0.3;
      const x = p[0] + (q[0] - p[0]) * t;
      const z = p[1] + (q[1] - p[1]) * t;
      const ux = (q[0] - p[0]) / seg;
      const uz = (q[1] - p[1]) / seg;
      // 法向
      const nx = -uz;
      const nz = ux;
      const width = ROAD[cls]?.width ?? 6;
      const off = width / 2 + 0.8;

      // 路灯（两侧交替）
      for (const side of rng.chance(0.5) ? [1] : [-1]) {
        const lx = Math.round(x + nx * off * side);
        const lz = Math.round(z + nz * off * side);
        if (Math.abs(lx) > CITY.HALF || Math.abs(lz) > CITY.HALF
          || CITY.isRoad(lx, lz) || CITY.isWater(lx, lz) || CITY.isRail(lx, lz)) continue;
        const gy = CITY.groundY(lx, lz);
        for (let y = 0; y < 5; y++) vox.add(lx, gy + y, lz, PROP.lampPole, false);
        vox.add(lx, gy + 5, lz + (uz >= 0 ? 0.4 : -0.4), PROP.lampHead, true);
        s.lamps++;
      }

      // 电线杆（高等级路）
      if (cls !== 'MINOR' && rng.chance(0.55)) {
        const px = Math.round(x - nx * (off + 1));
        const pz = Math.round(z - nz * (off + 1));
        if (!CITY.isRoad(px, pz) && !CITY.isWater(px, pz) && !CITY.isRail(px, pz)) {
          const gy = CITY.groundY(px, pz);
          for (let y = 0; y < 6; y++) vox.add(px, gy + y, pz, PROP.lampPole, false);
          vox.box(px - 1, gy + 5, pz, px + 1, gy + 5, pz, PROP.lampPole, false);
          s.poles++;
        }
      }

      // 信号灯：主干交叉感
      if (cls !== 'MINOR' && rng.chance(0.12)) {
        const sx = Math.round(x + nx * off);
        const sz = Math.round(z + nz * off);
        if (!CITY.isRoad(sx, sz) && !CITY.isWater(sx, sz)) {
          const gy = CITY.groundY(sx, sz);
          vox.add(sx, gy + 1, sz, PROP.lampPole, false);
          vox.add(sx, gy + 2, sz, 0xd83030, true);
          vox.add(sx, gy + 3, sz, 0x3ad830, true);
          s.signals++;
        }
      }

      // 贩卖机
      if (cls !== 'MINOR' && rng.chance(0.2)) {
        const vx = Math.round(x + nx * (off + 0.5));
        const vz = Math.round(z + nz * (off + 0.5));
        if (!CITY.isRoad(vx, vz) && !CITY.isWater(vx, vz) && !CITY.isRail(vx, vz)) {
          const gy = CITY.groundY(vx, vz);
          const col = PROP.vending[rng.int(0, PROP.vending.length - 1)];
          vox.box(vx, gy, vz, vx, gy + 2, vz, col, false);
          vox.add(vx, gy + 1, vz + 0.4, 0xffe0a0, true);
          s.vending++;
        }
      }

      // 静态车（路侧停靠）：压到 0.1，动态车流占主车道，避免叠影
      if (cls !== 'MINOR' && rng.chance(0.1)) {
        const lane = rng.chance(0.5) ? 1 : -1;
        const carOff = (width / 2 - 0.7) * lane;
        const cx = Math.round(x + nx * carOff);
        const cz = Math.round(z + nz * carOff);
        if (!CITY.isWater(cx, cz) && !CITY.isRail(cx, cz)) {
          const gy = CITY.groundY(cx, cz);
          const body = rng.chance(0.2) ? PROP.bus : PROP.carBody[rng.int(0, PROP.carBody.length - 1)];
          const len = body === PROP.bus ? 5 : 3;
          // 沿路向放置
          if (Math.abs(ux) > Math.abs(uz)) {
            vox.box(cx - len / 2, gy + 1, cz, cx + len / 2, gy + 2, cz, body, false);
            vox.add(ux >= 0 ? cx + len / 2 : cx - len / 2, gy + 1, cz, PROP.carLightF, true);
            vox.add(ux >= 0 ? cx - len / 2 : cx + len / 2, gy + 1, cz, PROP.carLightR, true);
          } else {
            vox.box(cx, gy + 1, cz - len / 2, cx, gy + 2, cz + len / 2, body, false);
            vox.add(cx, gy + 1, uz >= 0 ? cz + len / 2 : cz - len / 2, PROP.carLightF, true);
            vox.add(cx, gy + 1, uz >= 0 ? cz - len / 2 : cz + len / 2, PROP.carLightR, true);
          }
          s.cars++;
        }
      }
    }

    // 河岸樱花 / 绿带
    if (cls === 'RING' || cls === 'RADIAL') {
      // handled below via reclaim scan subset
    }
  }

  // 桥灯与栏杆
  for (const b of bridges) {
    const pts = b.pts || b.poly || [];
    const list = pts.length ? pts : [[b.x0, b.z0], [b.x1, b.z1]];
    for (let i = 0; i < list.length; i++) {
      const [x, z] = list[i];
      const xi = Math.round(x);
      const zi = Math.round(z);
      const gy = CITY.groundY(xi, zi);
      if (i % 2 === 0) {
        vox.add(xi - 2, gy + 2, zi, PROP.lampHead, true);
        vox.add(xi + 2, gy + 2, zi, PROP.lampHead, true);
        vox.box(xi - 2, gy + 1, zi - 1, xi + 2, gy + 1, zi - 1, PROP.pier, false);
        vox.box(xi - 2, gy + 1, zi + 1, xi + 2, gy + 1, zi + 1, PROP.pier, false);
      }
    }
    s.bridges = (s.bridges || 0) + 1;
  }

  // 护岸樱花：RECLAIM 带抽样
  const f = CITY.field;
  const half = CITY.HALF;
  let cherries = 0;
  for (let z = -half; z <= half && cherries < 220; z += 7) {
    for (let x = -half; x <= half && cherries < 220; x += 7) {
      const i = f.idx(x, z);
      const t = f.t[i];
      if (t !== 12 && t !== 13) continue; // RECLAIM / RECLAIMED
      if (rng.chance(0.25)) {
        placeCherry(vox, x, z, f.h[i], rng);
        cherries++;
      }
    }
  }
  s.cherries = cherries;

  // 公园街区补树（若 green 地块少）
  for (const b of CITY.blocks) {
    if (b.district !== 'park_large' && b.district !== 'park_small' && b.district !== 'greenway') continue;
    const n = Math.min(8, Math.max(2, Math.floor(b.cells.length / 40)));
    for (let k = 0; k < n; k++) {
      const i = b.cells[Math.floor(rng() * b.cells.length)];
      const x = Math.floor(i / CITY.N) - CITY.HALF;
      const z = (i % CITY.N) - CITY.HALF;
      if (CITY.isRoad(x, z) || CITY.isWater(x, z) || CITY.isRail(x, z)) continue;
      if (rng.chance(0.35)) placeCherry(vox, x, z, CITY.groundY(x, z), rng);
      else placeMiniTree(vox, x, z, CITY.groundY(x, z), rng);
      s.parkTrees = (s.parkTrees || 0) + 1;
    }
  }
}
