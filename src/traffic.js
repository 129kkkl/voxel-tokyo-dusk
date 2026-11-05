/**
 * Phase S 街道生活：动态车流 + 船只。
 * 沿 CITY.roads 的 RING/RADIAL/ARTERIAL 生成双向车道 LUT（日本左侧行驶），
 * 车/灯/船一律 InstancedMesh，update 只写矩阵，零帧分配。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RIVER_CTRL, TRIBUTARY_CTRL, makeCoast } from './city/water.js';
import { catmullRom } from './city/geom.js';
import { T } from './city/config.js';
import { makeRng } from './rng.js';
import { PROP } from './build/palette.js';

const SEED = 20260919 ^ 0x5A17C;
const SPACING = 90;             // 每车道车距（格）≈ 全城 120+ 辆（80–150）
const LANE_OFF_MIN = 1.5, LANE_OFF_MAX = 2.0;

// ---------- 几何小工具 ----------

function tintedBox(bucket, w, h, d, x, y, z, r, g, b) {
  const geo = new THREE.BoxGeometry(w, h, d);
  geo.translate(x, y, z);
  const n = geo.attributes.position.count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    colors[i * 3] = r; colors[i * 3 + 1] = g; colors[i * 3 + 2] = b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  bucket.push(geo);
}

/** 轿车/出租/卡车共用盒组：车身 + 座舱 + 保险杠。实例色 = 车漆 */
function carGeometry() {
  const G = [];
  tintedBox(G, 2.0, 1.05, 4.3, 0, 1.05, 0, 1, 1, 1);
  tintedBox(G, 1.8, 0.72, 2.1, 0, 1.82, -0.25, 0.84, 0.86, 0.9);
  tintedBox(G, 2.06, 0.28, 0.28, 0, 0.72, 2.1, 0.18, 0.18, 0.2);
  tintedBox(G, 2.06, 0.28, 0.28, 0, 0.72, -2.1, 0.18, 0.18, 0.2);
  return mergeGeometries(G);
}

/** 巴士：长方车厢 + 车顶空调 + 窗带 */
function busGeometry() {
  const G = [];
  tintedBox(G, 2.35, 2.1, 8.4, 0, 1.35, 0, 1, 1, 1);
  tintedBox(G, 2.38, 0.7, 7.2, 0, 1.75, 0, 0.55, 0.6, 0.65);
  tintedBox(G, 1.8, 0.35, 2.2, 0, 2.55, -1.2, 0.5, 0.5, 0.55);
  tintedBox(G, 2.36, 0.2, 8.2, 0, 0.55, 0, 0.18, 0.18, 0.2);
  return mergeGeometries(G);
}

/** 货轮：船体 + 尾楼 + 集装箱列 */
function cargoGeometry() {
  const G = [];
  tintedBox(G, 3.6, 1.6, 16, 0, 0.15, 0, 0.55, 0.52, 0.5);
  tintedBox(G, 3.2, 2.4, 3.6, 0, 1.6, -5.4, 0.82, 0.8, 0.76);
  tintedBox(G, 2.2, 0.3, 1.2, 0, 3.0, -5.4, 0.4, 0.4, 0.42);
  for (let i = 0; i < 3; i++) {
    tintedBox(G, 2.8, 1.3, 2.4, 0, 1.7, -1 + i * 2.6,
      [0.54, 0.23, 0.16, 0.14][i] ?? 0.4, [0.23, 0.35, 0.35, 0.35][i] ?? 0.35, [0.16, 0.54, 0.23, 0.5][i] ?? 0.3);
  }
  return mergeGeometries(G);
}

/** 小艇：艇体 + 驾驶舱 */
function smallBoatGeometry() {
  const G = [];
  tintedBox(G, 1.7, 0.85, 5.0, 0, 0.05, 0, 0.75, 0.72, 0.68);
  tintedBox(G, 1.3, 0.75, 1.5, 0, 0.75, -0.6, 0.88, 0.86, 0.82);
  return mergeGeometries(G);
}

function lightGeometry() {
  const G = [];
  tintedBox(G, 0.38, 0.2, 0.12, 0, 0, 0, 1, 1, 1);
  return mergeGeometries(G);
}

// ---------- 弧长 LUT ----------

/**
 * 折线 → 等弧长采样表。sample(d, out) 只做两次数组读 + lerp，
 * 每帧零次 getPointAt / CatmullRom。
 */
function buildPath(pts2d, closed, yFn) {
  const n = pts2d.length;
  const segCount = closed ? n : n - 1;
  const segs = new Float64Array(Math.max(segCount, 1));
  let total = 0;
  for (let i = 0; i < segCount; i++) {
    const a = pts2d[i], b = pts2d[(i + 1) % n];
    segs[i] = Math.hypot(b[0] - a[0], b[1] - a[1]);
    total += segs[i];
  }
  if (!(total > 1)) return null;
  const count = Math.max(24, Math.min(2400, Math.round(total / 2)));
  const arr = new Float32Array(count * 3);
  const denom = closed ? count : count - 1;
  let segI = 0, segAcc = 0;
  for (let k = 0; k < count; k++) {
    const d = (k / denom) * total;
    while (segI < segCount - 1 && segAcc + segs[segI] < d) {
      segAcc += segs[segI];
      segI++;
    }
    const segLen = segs[segI] || 1;
    const t = Math.min(1, Math.max(0, (d - segAcc) / segLen));
    const a = pts2d[segI], b = pts2d[(segI + 1) % n];
    const x = a[0] + (b[0] - a[0]) * t;
    const z = a[1] + (b[1] - a[1]) * t;
    arr[k * 3] = x;
    arr[k * 3 + 1] = yFn(x, z);
    arr[k * 3 + 2] = z;
  }
  return { arr, count, length: total, closed };
}

function sampleAt(path, d, out) {
  const { arr, count, length, closed } = path;
  const nSeg = closed ? count : count - 1;
  let f = (((d % length) + length) % length) / length * nSeg;
  if (f >= nSeg) f = nSeg - 1e-6;
  let i0 = Math.floor(f);
  if (i0 >= nSeg) i0 = nSeg - 1;
  const t = f - i0;
  const a = (i0 % count) * 3;
  const i1 = closed ? (i0 + 1) % count : Math.min(i0 + 1, count - 1);
  const b = i1 * 3;
  out.set(
    arr[a] + (arr[b] - arr[a]) * t,
    arr[a + 1] + (arr[b + 1] - arr[a + 1]) * t,
    arr[a + 2] + (arr[b + 2] - arr[a + 2]) * t,
  );
}

/** 沿切向左偏 off（日本左侧行驶：顺折线方向的车道偏左） */
function offsetLeft(pts, off, closed) {
  const n = pts.length;
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const p = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)];
    const q = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    let dx = q[0] - p[0], dz = q[1] - p[1];
    const L = Math.hypot(dx, dz) || 1;
    dx /= L; dz /= L;
    out[i] = [pts[i][0] + dz * off, pts[i][1] - dx * off];
  }
  return out;
}

function reversePts(pts) {
  const out = pts.slice();
  out.reverse();
  return out;
}

/** 闭合折线若显式补了首点（RING 如此），去掉重复尾点，免得接缝切向退化 */
function dedupeClose(pts, closed) {
  if (!closed || pts.length < 3) return pts;
  const a = pts[0], b = pts[pts.length - 1];
  return Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.5 ? pts.slice(0, -1) : pts;
}

// ---------- 车辆类型 ----------

const CAR_TYPES = [
  { mesh: 'car', s: [1, 1, 1], speed: 11, color: 0xc8c8d0, w: 22 },
  { mesh: 'car', s: [1, 1, 1], speed: 10, color: 0x3a4a6a, w: 18 },
  { mesh: 'car', s: [0.92, 0.92, 0.92], speed: 12, color: 0x8a3a3a, w: 14 },
  { mesh: 'car', s: [1, 1, 0.95], speed: 11, color: 0xe8a030, w: 12 }, // 出租
  { mesh: 'car', s: [1, 1, 1.08], speed: 10, color: 0xd8d0c0, w: 10 },
  { mesh: 'car', s: [1.05, 1.18, 1.55], speed: 8, color: 0x8a8f96, w: 10 }, // 卡车
  { mesh: 'bus', s: [1, 1, 1], speed: 7, color: 0x4a7a5a, w: 14 },
];

function pickType(rng) {
  let roll = rng() * CAR_TYPES.reduce((a, t) => a + t.w, 0);
  for (const t of CAR_TYPES) {
    roll -= t.w;
    if (roll <= 0) return t;
  }
  return CAR_TYPES[0];
}

// ---------- 车道路径 ----------

function buildLanePaths(CITY) {
  const yAt = (x, z) => CITY.groundY(Math.round(x), Math.round(z)) + 0.5;
  const paths = [];
  for (const road of CITY.roads) {
    if (road.cls !== 'RING' && road.cls !== 'RADIAL' && road.cls !== 'ARTERIAL') continue;
    const pts = dedupeClose(road.pts, road.closed);
    if (!pts || pts.length < 2) continue;
    const raw = Math.abs(road.laneOffsets?.[1] ?? 1.5);
    const off = Math.min(LANE_OFF_MAX, Math.max(LANE_OFF_MIN, raw));
    // 顺行（左车道）
    const fwd = buildPath(offsetLeft(pts, off, road.closed), road.closed, yAt);
    if (fwd) paths.push(fwd);
    // 对向（右车道，折线反向）
    const rev = buildPath(reversePts(offsetLeft(pts, -off, road.closed)), road.closed, yAt);
    if (rev) paths.push(rev);
  }
  return paths;
}

// ---------- 车辆实例 ----------

function createVehicles(scene, CITY, rng) {
  const paths = buildLanePaths(CITY);
  const states = [];
  for (const path of paths) {
    const n = Math.max(2, Math.min(24, Math.round(path.length / SPACING)));
    for (let i = 0; i < n; i++) {
      const type = pickType(rng);
      states.push({
        path,
        s: ((i + rng() * 0.35) / n) * path.length,
        speed: type.speed * (0.85 + rng() * 0.3),
        type,
      });
    }
  }

  const cars = [], buses = [];
  states.forEach((st, i) => {
    st.li = i * 2; // 头/尾灯在 lightMesh 里的实例下标
    (st.type.mesh === 'bus' ? buses : cars).push(st);
  });

  const lambert = new THREE.MeshLambertMaterial({ vertexColors: true });
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });

  const carMesh = new THREE.InstancedMesh(carGeometry(), lambert, Math.max(cars.length, 1));
  const busMesh = new THREE.InstancedMesh(busGeometry(), lambert, Math.max(buses.length, 1));
  const lightMesh = new THREE.InstancedMesh(lightGeometry(), glowMat, Math.max(states.length * 2, 1));
  carMesh.count = cars.length;
  busMesh.count = buses.length;
  lightMesh.count = states.length * 2;
  for (const m of [carMesh, busMesh, lightMesh]) {
    m.castShadow = false;
    m.receiveShadow = false;
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(m);
  }

  // 静态色（实例色只写一次）
  const col = new THREE.Color();
  cars.forEach((st, i) => carMesh.setColorAt(i, col.setHex(st.type.color)));
  buses.forEach((st, i) => busMesh.setColorAt(i, col.setHex(st.type.color)));
  for (const st of states) {
    lightMesh.setColorAt(st.li, col.setHex(PROP.carLightF));
    lightMesh.setColorAt(st.li + 1, col.setHex(PROP.carLightR));
  }
  if (carMesh.instanceColor) carMesh.instanceColor.needsUpdate = true;
  if (busMesh.instanceColor) busMesh.instanceColor.needsUpdate = true;
  if (lightMesh.instanceColor) lightMesh.instanceColor.needsUpdate = true;

  // 每帧复用，禁止 new
  const pos = new THREE.Vector3();
  const aim = new THREE.Vector3();
  const lp = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const lightScale = new THREE.Vector3(0.4, 0.22, 0.12);
  const quat = new THREE.Quaternion();
  const eul = new THREE.Euler();
  const mat = new THREE.Matrix4();

  function placeList(list, mesh, base) {
    for (let i = 0; i < list.length; i++) {
      const st = list[i];
      sampleAt(st.path, st.s, pos);
      sampleAt(st.path, st.s + 3, aim);
      const yaw = Math.atan2(aim.x - pos.x, aim.z - pos.z);
      quat.setFromEuler(eul.set(0, yaw, 0));
      scale.set(st.type.s[0], st.type.s[1], st.type.s[2]);
      mat.compose(pos, quat, scale);
      mesh.setMatrixAt(base + i, mat);

      // 头灯 / 尾灯（车身局部 ±z，随车身缩放与朝向）
      const sz = st.type.s[2], sy = st.type.s[1];
      for (let k = 0; k < 2; k++) {
        lp.set(0, (k === 0 ? 1.0 : 0.95) * sy, (k === 0 ? 2.18 : -2.18) * sz)
          .applyQuaternion(quat)
          .add(pos);
        mat.compose(lp, quat, lightScale);
        lightMesh.setMatrixAt(st.li + k, mat);
      }
    }
  }

  return {
    count: states.length,
    meshes: 3,
    update(dt) {
      for (const st of states) {
        st.s += st.speed * dt;
        if (st.s >= st.path.length) st.s -= st.path.length;
      }
      placeList(cars, carMesh, 0);
      placeList(buses, busMesh, 0);
      carMesh.instanceMatrix.needsUpdate = true;
      busMesh.instanceMatrix.needsUpdate = true;
      lightMesh.instanceMatrix.needsUpdate = true;
    },
  };
}

// ---------- 船只 ----------

function snapWater(CITY, x, z, maxR, want) {
  const xi = Math.round(x), zi = Math.round(z);
  if (CITY.typeAt(xi, zi) === want) return [xi, zi];
  for (let r = 1; r <= maxR; r++) {
    for (let a = 0; a < 12; a++) {
      const th = (a / 12) * Math.PI * 2;
      const xx = Math.round(x + Math.cos(th) * r);
      const zz = Math.round(z + Math.sin(th) * r);
      if (CITY.typeAt(xx, zz) === want) return [xx, zz];
    }
  }
  return [xi, zi];
}

/** 河/支流中线：用与 applyWater 同序的派生 rng 重放 jitter，再贴到 WATER 格 */
function waterRoutes(CITY) {
  const seed = 20260919;
  // 主河/支流各自独立派生会与 water.js 的 wrng 消耗序冲突，这里整段重放两步
  const wrng = makeRng((seed ^ 0xA71E) >>> 0);
  const jit = (pts, amp) => pts.map(([x, z]) => [x + wrng.range(-amp, amp), z + wrng.range(-amp, amp)]);
  const river = catmullRom(jit(RIVER_CTRL, 22), { closed: false, perSeg: 14 });
  const trib = catmullRom(jit(TRIBUTARY_CTRL, 18), { closed: false, perSeg: 12 });

  const snapLine = (line, want) => line.map(([x, z]) => snapWater(CITY, x, z, 6, want));

  // 海上两条往返环：沿岸线外扩，构成闭合巡逻圈
  const coast = makeCoast();
  const push = (p, r) => {
    const L = Math.hypot(p[0], p[1]) || 1;
    return [p[0] + (p[0] / L) * r, p[1] + (p[1] / L) * r];
  };
  const seaLoopA = coast.map((p) => push(p, 55))
    .concat(reversePts(coast.map((p) => push(p, 95))));
  const seaLoopB = coast.map((p) => push(p, 35))
    .concat(reversePts(coast.map((p) => push(p, 70))));
  const snapSea = (line) => line.map(([x, z]) => snapWater(CITY, x, z, 10, T.SEA));

  return {
    river: snapLine(river, T.WATER),
    trib: snapLine(trib, T.WATER),
    seaA: snapSea(seaLoopA),
    seaB: snapSea(seaLoopB),
  };
}

function createBoats(scene, CITY) {
  const routes = waterRoutes(CITY);
  const yAt = () => 0.05; // 水面顶 ≈ -0.3，船体原点略入水
  const riverPath = buildPath(routes.river, false, yAt);
  const tribPath = buildPath(routes.trib, false, yAt);
  const seaA = buildPath(routes.seaA, true, yAt);
  const seaB = buildPath(routes.seaB, true, yAt);

  const cargoStates = [];
  const smallStates = [];
  if (riverPath) {
    cargoStates.push({ path: riverPath, s: riverPath.length * 0.3, speed: 5.5, s3: [1, 1, 1], color: 0x6a6560 });
    smallStates.push({ path: riverPath, s: riverPath.length * 0.7, speed: 8, s3: [1, 1, 1], color: 0xd8d0c0 });
  }
  if (tribPath) {
    smallStates.push({ path: tribPath, s: tribPath.length * 0.4, speed: 7, s3: [1, 1, 1], color: 0x3a4a6a });
  }
  if (seaA) {
    cargoStates.push({ path: seaA, s: seaA.length * 0.1, speed: 6, s3: [1.1, 1.1, 1.15], color: 0x5a5e66 });
    smallStates.push({ path: seaA, s: seaA.length * 0.55, speed: 9, s3: [1, 1, 1], color: 0xc8c8d0 });
  }
  if (seaB) {
    smallStates.push({ path: seaB, s: seaB.length * 0.2, speed: 8.5, s3: [1, 1, 1], color: 0x8a3a3a });
  }

  const lambert = new THREE.MeshLambertMaterial({ vertexColors: true });
  const cargoMesh = new THREE.InstancedMesh(cargoGeometry(), lambert, Math.max(cargoStates.length, 1));
  const smallMesh = new THREE.InstancedMesh(smallBoatGeometry(), lambert, Math.max(smallStates.length, 1));
  cargoMesh.count = cargoStates.length;
  smallMesh.count = smallStates.length;
  for (const m of [cargoMesh, smallMesh]) {
    m.castShadow = false;
    m.receiveShadow = false;
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(m);
  }

  const col = new THREE.Color();
  cargoStates.forEach((st, i) => cargoMesh.setColorAt(i, col.setHex(st.color)));
  smallStates.forEach((st, i) => smallMesh.setColorAt(i, col.setHex(st.color)));
  if (cargoMesh.instanceColor) cargoMesh.instanceColor.needsUpdate = true;
  if (smallMesh.instanceColor) smallMesh.instanceColor.needsUpdate = true;

  const pos = new THREE.Vector3();
  const aim = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const eul = new THREE.Euler();
  const mat = new THREE.Matrix4();
  const all = [...cargoStates, ...smallStates];

  function place(list, mesh) {
    for (let i = 0; i < list.length; i++) {
      const st = list[i];
      sampleAt(st.path, st.s, pos);
      sampleAt(st.path, st.s + 6, aim);
      const yaw = Math.atan2(aim.x - pos.x, aim.z - pos.z);
      quat.setFromEuler(eul.set(0, yaw, 0));
      scale.set(st.s3[0], st.s3[1], st.s3[2]);
      mat.compose(pos, quat, scale);
      mesh.setMatrixAt(i, mat);
    }
  }

  return {
    count: all.length,
    meshes: 2,
    update(dt) {
      for (const st of all) {
        st.s += st.speed * dt;
        if (st.s >= st.path.length) st.s -= st.path.length;
      }
      place(cargoStates, cargoMesh);
      place(smallStates, smallMesh);
      cargoMesh.instanceMatrix.needsUpdate = true;
      smallMesh.instanceMatrix.needsUpdate = true;
    },
  };
}

// ---------- 入口 ----------

/**
 * 创建动态车流 + 船只。返回 { update(dt), stats }。
 * 车辆动画走 InstancedMesh + 预采样 LUT，帧内零 Object3D 创建。
 */
export function createTraffic(scene, CITY) {
  const rng = makeRng(SEED);
  const vehicles = createVehicles(scene, CITY, rng);
  const boats = createBoats(scene, CITY);
  return {
    update(dt) {
      vehicles.update(dt);
      boats.update(dt);
    },
    stats: {
      cars: vehicles.count,
      boats: boats.count,
      instancedMeshes: vehicles.meshes + boats.meshes,
    },
  };
}
