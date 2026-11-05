/** ?plan=1：把 cell buffer 画成正射俯视贴图（规格 §12）。 */
import * as THREE from 'three';
import { T, DISTRICT } from './city/config.js';

const TYPE_COLOR = {
  [T.ROAD_RING]: 0x8a8f96, [T.ROAD_RADIAL]: 0x7d838b, [T.ROAD_ARTERIAL]: 0x6f757e,
  [T.ROAD_MINOR]: 0x62686f, [T.SIDEWALK]: 0x43484f, [T.MEDIAN]: 0x2c3036,
  [T.RAIL]: 0xd8a23c, [T.WATER]: 0x2e6f95, [T.SEA]: 0x234f6d, [T.QUAY]: 0x8a7a5c,
  [T.RECLAIM]: 0x5b6b57, [T.RECLAIMED]: 0x6b5f4a, [T.BLOCK_ALLEY]: 0x9aa0a8,
  [T.PLOT_FREE]: 0x3f4a3a, [T.PLOT_USE]: 0x4a5a40, [T.POCKET]: 0x4d7a3f, [T.BRIDGE]: 0xc9b98a,
  [T.BLOCK]: 0x354034, [T.OUTSIDE]: 0x14161a,
};
const DISTRICT_COLOR = {
  [DISTRICT.CBD]: 0x2f6fa8, [DISTRICT.SUB_CENTER]: 0x7a4fb0, [DISTRICT.STATION_FRONT]: 0xc06a3a,
  [DISTRICT.COMMERCIAL]: 0xc9a13a, [DISTRICT.ENTERTAINMENT]: 0xb04a6a, [DISTRICT.ELECTRONICS]: 0x4a9ab0,
  [DISTRICT.HIGH_RISE_RESI]: 0x6a8a4a, [DISTRICT.LOW_RISE_RESI]: 0x8aa06a, [DISTRICT.TRADITIONAL]: 0xa86a3a,
  [DISTRICT.SCHOOL]: 0x3aa88a, [DISTRICT.HOSPITAL]: 0xd8d8d8, [DISTRICT.PUBLIC]: 0x9a9a5a,
  [DISTRICT.PARK_LARGE]: 0x2f7a2f, [DISTRICT.PARK_SMALL]: 0x53a053, [DISTRICT.GREENWAY]: 0x6ab04a,
  [DISTRICT.PORT_INDUSTRY]: 0x5a5a6a, [DISTRICT.FREIGHT_YARD]: 0x8a6a2a, [DISTRICT.UNIVERSITY]: 0x3a6a9a,
  [DISTRICT.DANCHI]: 0x7a9a4a, [DISTRICT.STADIUM]: 0xb0b040, [DISTRICT.LANDMARK]: 0xff5050,
};

export function planTexture(CITY, mode = 'type') {
  const N = CITY.N;
  const cvs = document.createElement('canvas');
  cvs.width = N; cvs.height = N;
  const ctx = cvs.getContext('2d');
  const img = ctx.createImageData(N, N);
  const d = img.data;
  const f = CITY.field;
  for (let x = -CITY.HALF; x <= CITY.HALF; x++) {
    for (let z = -CITY.HALF; z <= CITY.HALF; z++) {
      const i = f.idx(x, z);
      const px = ((z + CITY.HALF) * N + (x + CITY.HALF)) * 4;
      let c;
      if (mode === 'district') {
        const b = f.blockId[i];
        c = b >= 0 ? (DISTRICT_COLOR[CITY.blocks[b].district] ?? 0x20242a) : (TYPE_COLOR[f.t[i]] ?? 0x20242a);
      } else if (mode === 'blocks') {
        const b = f.blockId[i];
        c = b >= 0 ? hsl(b * 137.508 % 360, 0.45, 0.5) : (TYPE_COLOR[f.t[i]] ?? 0x101216);
      } else if (mode === 'height') {
        const v = Math.max(0, Math.min(255, (f.h[i] / 7) * 255));
        c = (v << 16) | (v << 8) | v;
      } else {
        c = TYPE_COLOR[f.t[i]] ?? 0x20242a;
      }
      d[px] = (c >> 16) & 255; d[px + 1] = (c >> 8) & 255; d[px + 2] = c & 255; d[px + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  if (mode === 'type' || mode === 'district') {
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1;
    for (const p of CITY.plots) {
      ctx.strokeRect(p.rect.x0 - CITY.HALF + 0.5, p.rect.z0 - CITY.HALF + 0.5, p.w, p.d);
    }
    ctx.fillStyle = '#ff3b30';
    for (const s of CITY.stations) {
      ctx.fillRect(s.x - CITY.HALF - 2, s.z - CITY.HALF - 2, 5, 5);
    }
    ctx.fillStyle = '#ffe14a';
    for (const b of CITY.bridges) {
      if (!b.pts?.length) continue;
      ctx.fillRect(b.pts[0][0] - CITY.HALF - 1, b.pts[0][1] - CITY.HALF - 1, 3, 3);
    }
  }
  const tex = new THREE.CanvasTexture(cvs);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function hsl(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const k = (n) => (n + h / 30) % 12;
  const f2 = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return (Math.round(f2(0) * 255) << 16) | (Math.round(f2(8) * 255) << 8) | Math.round(f2(4) * 255);
}

export function mountPlanView(scene, CITY, mode) {
  const tex = planTexture(CITY, mode);
  const size = CITY.N;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, fog: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.5;
  scene.add(mesh);
  return { mesh, texture: tex };
}
