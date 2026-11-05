import * as THREE from 'three';
import { makeRng } from './rng.js';
import { SKY } from './build/palette.js';

function hexVec3(hex) {
  const r = ((hex >> 16) & 255) / 255;
  const g = ((hex >> 8) & 255) / 255;
  const b = (hex & 255) / 255;
  return `vec3(${r.toFixed(4)}, ${g.toFixed(4)}, ${b.toFixed(4)})`;
}

/** 黄昏天空穹顶（深蓝→紫→橙渐变）、星空、月亮、远山剪影、飘动云块 */
export function buildSky(scene) {
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */`
      varying vec3 vP;
      void main() {
        vP = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vP;
      void main() {
        vec3 d = normalize(vP);
        float h = d.y;
        vec3 top = ${hexVec3(SKY.top)};
        vec3 mid = ${hexVec3(SKY.mid)};
        vec3 horWarm = ${hexVec3(SKY.horizonWarm)};
        vec3 horMauve = ${hexVec3(SKY.horizonMauve)};
        // 夕阳余晖方向（与 main.js DirectionalLight 同方位）
        vec2 sunDir = normalize(vec2(0.83, 0.55));
        float sunAz = max(dot(normalize(d.xz), sunDir), 0.0);
        // 地平：向阳暖橙，背阳藕紫
        vec3 hor = mix(horMauve, horWarm, smoothstep(0.0, 0.75, sunAz));
        vec3 col = h > 0.16
          ? mix(mid, top, smoothstep(0.16, 0.65, h))
          : mix(hor, mid, smoothstep(-0.03, 0.16, h));
        float sun = pow(sunAz, 6.0)
                  * (1.0 - smoothstep(0.0, 0.35, abs(h - 0.03)));
        col += vec3(1.0, 0.55, 0.25) * sun * 0.35;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(750, 32, 16), skyMat);
  sky.renderOrder = -10;
  scene.add(sky);

  const rng = makeRng(42);

  // 星空
  const starPos = [];
  for (let i = 0; i < 500; i++) {
    const a = rng.range(0, Math.PI * 2), e = rng.range(0.18, 1.4), r = 700;
    starPos.push(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0xcdd8ff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.75,
  })));

  // 月亮
  const moon = new THREE.Mesh(
    new THREE.CircleGeometry(22, 32),
    new THREE.MeshBasicMaterial({ color: 0xf2eeda, fog: false }),
  );
  moon.position.set(-320, 330, -380);
  moon.lookAt(0, 0, 0);
  scene.add(moon);

  // 远山剪影（两圈）：远处更掺雾色，与 FogExp2 融合
  const fogCol = new THREE.Color(0x3a3040);
  const mNear = new THREE.Color(0x232c4e);
  const mFar = mNear.clone().lerp(fogCol, 0.55);
  const mMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true });
  const mts = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mMat, 120);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pv = new THREE.Vector3(), sv = new THREE.Vector3();
  const mcc = new THREE.Color();
  let mi = 0;
  for (let i = 0; i < 120; i++) {
    if (!rng.chance(0.75)) continue; // 留出缺口，山脊更自然
    const a = (i / 120) * Math.PI * 2 + rng.range(-0.04, 0.04);
    const far = i % 3 === 0;
    const r = far ? rng.range(900, 1000) : rng.range(700, 850);
    const hgt = far ? rng.range(30, 80) : rng.range(18, 50);
    pv.set(Math.cos(a) * r, hgt / 2 - 6, Math.sin(a) * r);
    sv.set(rng.range(60, 140), hgt, rng.range(40, 80));
    m4.compose(pv, q, sv);
    mts.setMatrixAt(mi, m4);
    mcc.copy(far ? mFar : mNear).offsetHSL(0, 0, rng.range(-0.015, 0.015));
    mts.setColorAt(mi, mcc);
    mi++;
  }
  mts.count = mi;
  if (mts.instanceColor) mts.instanceColor.needsUpdate = true;
  mts.frustumCulled = false;
  scene.add(mts);

  // 城市外围地面衬底
  const base = new THREE.Mesh(
    new THREE.CircleGeometry(1200, 48),
    new THREE.MeshLambertMaterial({ color: 0x141018 }),
  );
  base.rotation.x = -Math.PI / 2;
  base.position.y = -0.65;
  scene.add(base);

  // 夜云：单个 InstancedMesh 容纳全部云团盒子（每朵云 3~6 个大小错落的盒子），
  // 整体平移 + 周期复制实现无缝循环；颜色按 x+z 在冷蓝与暖橙粉之间插值，
  // 朝向夕阳方向 (+x,+z) 偏暖，背向偏冷
  const CLOUD_PERIOD = 2000;
  const cloudSpecs = [];
  for (let i = 0; i < 12; i++) {
    const cx = rng.range(-1000, 1000);
    const cy = rng.range(250, 350);
    const cz = rng.range(-1000, 1000);
    const w = rng.range(50, 100);
    const d = rng.range(20, 35);
    const boxes = [[0, 0, 0, w, rng.range(3, 5), d]];
    const nExtra = rng.int(2, 5);
    for (let b = 0; b < nExtra; b++) {
      boxes.push([
        rng.range(-w * 0.5, w * 0.5),
        rng.range(-2, 2),
        rng.range(-d * 0.5, d * 0.5),
        w * rng.range(0.35, 0.7),
        rng.range(2, 4),
        d * rng.range(0.4, 0.8),
      ]);
    }
    cloudSpecs.push({ cx, cy, cz, boxes });
  }

  let cloudCount = 0;
  for (const s of cloudSpecs) cloudCount += s.boxes.length * 3; // ±周期各复制一份
  const cloudMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.55 }),
    cloudCount,
  );
  const warm = new THREE.Color(0xb08bb0);
  const cool = new THREE.Color(0x454e7d);
  const cc = new THREE.Color();
  let ci = 0;
  for (const s of cloudSpecs) {
    const t = Math.min(Math.max((s.cx + s.cz + 2000) / 4000, 0), 1);
    cc.copy(cool).lerp(warm, t);
    for (const rep of [-CLOUD_PERIOD, 0, CLOUD_PERIOD]) {
      for (const b of s.boxes) {
        pv.set(s.cx + b[0] + rep, s.cy + b[1], s.cz + b[2]);
        sv.set(b[3], b[4], b[5]);
        m4.compose(pv, q, sv);
        cloudMesh.setMatrixAt(ci, m4);
        cloudMesh.setColorAt(ci, cc);
        ci++;
      }
    }
  }
  cloudMesh.count = ci;
  cloudMesh.instanceMatrix.needsUpdate = true;
  if (cloudMesh.instanceColor) cloudMesh.instanceColor.needsUpdate = true;
  cloudMesh.frustumCulled = false; // 实例带周期副本遍布天空，不做剔除
  scene.add(cloudMesh);

  // 用法：clouds.mesh.position.x = (elapsed * clouds.speed) % clouds.period
  const clouds = { mesh: cloudMesh, speed: 2, period: CLOUD_PERIOD };

  return { clouds };
}
