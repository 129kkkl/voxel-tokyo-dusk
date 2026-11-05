import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// 旧方框环线参数：createTrain 已改由 CITY.rail.pts 驱动；此处仅保留 buildRail（未接入 main）的本地常量
const RING_INNER = 250;
const RING_OUTER = 330;
const isOnRiver = () => false;

// 环线轨道面高度：抬高到町屋屋顶（~11）之上，桥墩不再插进房子
const INNER_Y = 13;
const OUTER_Y = 15;

/**
 * 环市中心高架环线（内环 + 外环）+ 多列电车
 * 轨道曲线同时用于铺设桥体体素和驱动列车动画
 */
export function buildRail(vox) {
  // 内环（±256）
  const innerRaw = [
    [-RING_INNER + 12, -RING_INNER], [0, -RING_INNER], [RING_INNER - 12, -RING_INNER],
    [RING_INNER, -RING_INNER + 12], [RING_INNER, 0], [RING_INNER, RING_INNER - 12],
    [RING_INNER - 12, RING_INNER], [0, RING_INNER], [-RING_INNER + 12, RING_INNER],
    [-RING_INNER, RING_INNER - 12], [-RING_INNER, 0], [-RING_INNER, -RING_INNER + 12],
  ];
  const innerPoints = innerRaw.map(([x, z]) => new THREE.Vector3(x, INNER_Y, z));
  const innerCurve = new THREE.CatmullRomCurve3(innerPoints, true, 'centripetal');

  // 外环（±416）
  const outerRaw = [
    [-RING_OUTER + 12, -RING_OUTER], [0, -RING_OUTER], [RING_OUTER - 12, -RING_OUTER],
    [RING_OUTER, -RING_OUTER + 12], [RING_OUTER, 0], [RING_OUTER, RING_OUTER - 12],
    [RING_OUTER - 12, RING_OUTER], [0, RING_OUTER], [-RING_OUTER + 12, RING_OUTER],
    [-RING_OUTER, RING_OUTER - 12], [-RING_OUTER, 0], [-RING_OUTER, -RING_OUTER + 12],
  ];
  const outerPoints = outerRaw.map(([x, z]) => new THREE.Vector3(x, OUTER_Y, z));
  const outerCurve = new THREE.CatmullRomCurve3(outerPoints, true, 'centripetal');

  // 铺设内环轨道
  buildTrack(vox, innerCurve, INNER_Y);
  // 铺设外环轨道
  buildTrack(vox, outerCurve, OUTER_Y);

  return innerCurve; // 返回内环用于电车
}

function buildTrack(vox, curve, height) {
  const N = 2000;
  const seen = new Set();
  const wireSeen = new Set();
  for (let i = 0; i < N; i++) {
    const t = i / N;
    const p = curve.getPointAt(t);
    const tan = curve.getTangentAt(t);
    const px = -tan.z, pz = tan.x; // 水平法向
    // 指向环心的"内侧"单位方向（接触网立在内侧股道一畔）
    const inLen = Math.hypot(p.x, p.z) || 1;
    const ix = -p.x / inLen, iz = -p.z / inLen;

    for (let w = -2.5; w <= 2.5; w += 1) {
      const x = Math.round(p.x + px * w), z = Math.round(p.z + pz * w);
      const key = x + ',' + z;
      if (seen.has(key)) continue;
      seen.add(key);
      const edge = Math.abs(w) === 2.5;
      vox.add(x, height - 0.5, z, edge ? 0xa8adb4 : 0x70757d);
      if (Math.abs(w) === 1.5) vox.add(x, height + 0.1, z, 0x3a3f45); // 双轨
    }

    // 接触网导线（内侧股道上方，去重后约 1 体素/单位连续）
    const wx = Math.round(p.x + ix * 1.5), wz = Math.round(p.z + iz * 1.5);
    const wkey = wx + ',' + wz;
    if (!wireSeen.has(wkey)) {
      wireSeen.add(wkey);
      vox.add(wx, height + 3.8, wz, 0x2a2d33);
    }

    // 桥墩（约每 24 单位一根；跨河处桥墩下探到河床）
    if (i % 25 === 0) {
      const x = Math.round(p.x), z = Math.round(p.z);
      const base = isOnRiver(x, z) ? -1 : 0;
      const h = height - 1 - base;
      vox.boxC(x, base + h / 2, z, 2, h, 2, 0x7d8189);
      vox.boxC(x, height - 1, z, 4, 1, 4, 0x7d8189); // 墩顶托梁
      if (base === 0) vox.boxC(x, 0.5, z, 3, 1, 3, 0x6b6f76); // 基础
    }

    // 接触网杆（约每 12 单位一根，细柱 + 横腕 + 吊弦）
    if (i % 12 === 0) {
      const bx = Math.round(p.x + ix * 3.4), bz = Math.round(p.z + iz * 3.4);
      vox.boxC(bx, height + 2.1, bz, 0.3, 4.2, 0.3, 0x6b6f76);
      // 横腕伸向轨道上方（体素轴对齐，取主导方向）
      const ax = Math.round(p.x + ix * 2.3), az = Math.round(p.z + iz * 2.3);
      if (Math.abs(ix) > Math.abs(iz)) {
        vox.boxC(ax, height + 4.1, bz, 2.4, 0.25, 0.25, 0x6b6f76);
      } else {
        vox.boxC(bx, height + 4.1, az, 0.25, 0.25, 2.4, 0x6b6f76);
      }
      vox.add(wx, height + 3.9, wz, 0x3a3f45); // 吊弦/绝缘子
    }
  }
}

/** 高架车站：站台、雨棚、吊灯、伪字形站名牌、两端落地台阶 */
export function buildStation(vox) {
  // 内环车站（南侧，轨道在 +z 一侧）
  buildSingleStation(vox, 0, RING_INNER - 4, INNER_Y, 1);
  // 外环车站（北侧，轨道在 -z 一侧）
  buildSingleStation(vox, 0, -RING_OUTER + 4, OUTER_Y, -1);
}

function buildSingleStation(vox, x, z, height, dir) {
  // 站台
  vox.boxC(x, height, z, 30, 1, 4, 0x9aa0a6);
  for (let px = -14; px <= 14; px += 2) {
    vox.add(x + px, height + 0.6, z + dir * 1.7, 0xffd27a, true); // 安全线
  }

  // 雨棚与支柱
  for (let px = -12; px <= 12; px += 6) {
    vox.boxC(x + px, height + 2.5, z + dir * 0.7, 0.6, 4, 0.6, 0x8b8f94);
  }
  vox.boxC(x, height + 4.7, z, 32, 0.7, 6, 0x3f4750);
  for (let px = -12; px <= 12; px += 4) {
    vox.add(x + px, height + 4.2, z, 0xfff2cc, true);
  }

  // 站名牌：5×7 伪字形点阵拼 3 个抽象方块字（横竖笔画结构，非随机点）
  vox.boxC(x, height + 2.9, z + dir * 0.5, 8.6, 3.6, 0.3, 0x0f2a33);
  const GLYPHS = [
    [ // 京風
      '..#..',
      '#####',
      '#...#',
      '#####',
      '#...#',
      '#####',
      '.#.#.',
    ],
    [ // 山風
      '..#..',
      '..#..',
      '#.#.#',
      '#.#.#',
      '#.#.#',
      '#####',
      '.....',
    ],
    [ // 川風
      '#..##',
      '#..#.',
      '#..#.',
      '#..#.',
      '#..#.',
      '#..##',
      '.....',
    ],
  ];
  const pitch = 0.45;
  const totalW = (GLYPHS.length * 5 + (GLYPHS.length - 1)) * pitch; // 字距 1 列
  for (let g = 0; g < GLYPHS.length; g++) {
    const gx0 = x - totalW / 2 + g * 6 * pitch;
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (GLYPHS[g][row][col] !== '#') continue;
        vox.boxC(
          gx0 + (col + 0.5) * pitch,
          height + 2.9 + (3 - row) * pitch,
          z + dir * 0.72,
          0.34, 0.34, 0.12, 0x7fe8ff, true,
        );
      }
    }
  }

  // 两端落地台阶（随轨道高度加长）+ 扶手立柱
  const steps = Math.round(height);
  for (const s of [1, -1]) {
    for (let k = 0; k <= steps; k++) {
      vox.boxC(x + s * (15 + k), height - 0.25 - k, z, 1.2, 0.5, 3, 0x8b8f94);
      if (k % 2 === 0) vox.add(x + s * (15 + k), height + 0.55 - k, z + 1.2, 0x6b6f76);
    }
    vox.boxC(x + s * (15 + steps + 0.6), 1.5, z, 0.5, 3, 0.5, 0x6b6f76);
  }
}

// ---------- 电车 ----------

/** 生成一个平移好、带顶点色的盒子几何体，推入合并桶 */
function boxGeo(bucket, w, h, d, x, y, z, color) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  bucket.push(g);
}

/**
 * 五节编组电车，沿环线运行
 * 每节车的全部盒子按材质合并成 2 个 BufferGeometry（光照件 + 发光件），
 * 5 节车共 10 个 Mesh；初始化时把轨道曲线预采样成弧长均匀查找表，
 * update 只做插值查表，不再逐帧调用 getPointAt
 */
export function createTrain(scene, curve) {
  const lambert = new THREE.MeshLambertMaterial({ vertexColors: true });
  const glass = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });

  const BODY = 0xdfe3e8, STRIPE = 0x6fbf3f, ROOF = 0x9aa0a6, DOOR = 0xc6cbd2;
  const FRAME = 0x3a3f45, DARK = 0x2a2d33, WIN = 0xffe9a8, CAB = 0x22303c;

  const cars = [];
  const N_CARS = 5;
  for (let i = 0; i < N_CARS; i++) {
    const L = [], G = [];
    // 车体 / 车顶 / 腰线
    boxGeo(L, 2.6, 2.2, 7, 0, 1.6, 0, BODY);
    boxGeo(L, 2.2, 0.3, 6.6, 0, 2.85, 0, ROOF);
    boxGeo(L, 2.66, 0.4, 7.02, 0, 1.1, 0, STRIPE);
    // 底架与转向架
    boxGeo(L, 2.2, 0.4, 6.6, 0, 0.45, 0, FRAME);
    boxGeo(L, 1.8, 0.5, 1.4, 0, 0.3, 2.2, DARK);
    boxGeo(L, 1.8, 0.5, 1.4, 0, 0.3, -2.2, DARK);
    // 车门凹槽（两端各一，略深于车体色）+ 门上气窗
    for (const dz of [-2.85, 2.85]) {
      boxGeo(L, 2.64, 1.7, 1.0, 0, 1.72, dz, DOOR);
      boxGeo(G, 2.66, 0.45, 0.5, 0, 2.2, dz, WIN);
    }
    // 按扇分格的侧窗（4 扇/侧，窗间留车体墙柱）
    for (const dz of [-1.62, -0.55, 0.55, 1.62]) {
      boxGeo(G, 2.66, 0.75, 0.85, 0, 1.95, dz, WIN);
    }
    if (i === 0) { // 头车：驾驶室窗 + 前灯
      boxGeo(L, 2.0, 0.8, 0.15, 0, 2.0, 3.5, CAB);
      boxGeo(G, 0.5, 0.3, 0.12, 0.7, 1.2, 3.55, 0xfff6d8);
      boxGeo(G, 0.5, 0.3, 0.12, -0.7, 1.2, 3.55, 0xfff6d8);
    }
    if (i === N_CARS - 1) { // 尾车尾灯
      boxGeo(G, 0.5, 0.25, 0.12, 0.7, 1.2, -3.55, 0xff3b30);
      boxGeo(G, 0.5, 0.25, 0.12, -0.7, 1.2, -3.55, 0xff3b30);
    }
    if (i === 2) { // 中间车受电弓（对准接触网导线高度）
      boxGeo(L, 1.2, 0.15, 1.6, 0, 3.05, 0, FRAME);
      boxGeo(L, 0.12, 0.7, 1.2, 0.5, 3.5, 0, FRAME);
      boxGeo(L, 0.12, 0.7, 1.2, -0.5, 3.5, 0, FRAME);
      boxGeo(L, 1.4, 0.1, 0.3, 0, 3.9, 0, DARK);
    }
    const car = new THREE.Group();
    car.add(new THREE.Mesh(mergeGeometries(L), lambert));
    car.add(new THREE.Mesh(mergeGeometries(G), glass));
    scene.add(car);
    cars.push(car);
  }

  // 预采样弧长均匀查找表（闭曲线：getSpacedPoints 返回 SAMPLES+1 点，首尾重合）
  const SAMPLES = 512;
  const table = curve.getSpacedPoints(SAMPLES);
  const len = curve.getLength();
  const spacing = 8.3; // 节间距
  let dist = 0;
  const pos = new THREE.Vector3(), aim = new THREE.Vector3();

  // 弧长 d → 表内插值，返回所在段起点下标
  function sampleAt(d, out) {
    const f = (((d % len) + len) % len) / len * SAMPLES;
    const i0 = Math.floor(f) % SAMPLES;
    const i1 = (i0 + 1) % SAMPLES;
    out.lerpVectors(table[i0], table[i1], f - Math.floor(f));
    return i0;
  }

  return {
    update(dt) {
      dist = (dist + dt * 11) % len;
      for (let i = 0; i < cars.length; i++) {
        const i0 = sampleAt(dist - i * spacing, pos);
        const i2 = (i0 + 2) % SAMPLES; // 朝前看两格，得到平滑切向
        aim.set(
          pos.x + (table[i2].x - table[i0].x),
          pos.y + (table[i2].y - table[i0].y),
          pos.z + (table[i2].z - table[i0].z),
        );
        cars[i].position.set(pos.x, pos.y + 0.2, pos.z);
        cars[i].lookAt(aim.x, pos.y + 0.2, aim.z);
      }
    },
  };
}
