import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VoxelBuilder } from './voxel.js';
import { buildGround } from './ground.js';
import { placeFromCity, buildRailCurveFromCity } from './build/index.js';
import { buildSky } from './sky.js';
import { createTrain } from './rail.js';
import { createTraffic } from './traffic.js';
import { buildCity } from './city/query.js';
import { viewpoint, parseParams } from './city/viewpoints.js';
import { mountPlanView } from './planView.js';
import { CFG } from './city/config.js';

// ---------- URL 参数 ----------
const PARAMS = parseParams(location.search);
const CITY = buildCity(PARAMS.seed ?? CFG.SEED);

// ---------- 渲染器 ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.42;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1026);
scene.fog = PARAMS.plan ? null : new THREE.FogExp2(0x3a3040, 0.00042);

// ---------- 相机与操控 ----------
let camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.5, 4000);
camera.position.set(400, 280, 400);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 30, 0);
controls.enableDamping = true;
controls.autoRotate = !PARAMS.cam && !PARAMS.plan;
controls.autoRotateSpeed = 0.3;
controls.minDistance = 30;
controls.maxDistance = 1200;
controls.maxPolarAngle = 1.48;

// ---------- 光照 ----------
// 冷天光 + 暖地光：提亮建筑受光面（解黑柱），窗光仍是最亮织物
scene.add(new THREE.HemisphereLight(0x6a78c8, 0x8a5a40, 1.8));
scene.add(new THREE.AmbientLight(0x4a4060, 0.68));
// 夕阳主光：与天空暖侧（sky.js sunDir 0.83, 0.55）同方位
const sunLight = new THREE.DirectionalLight(0xffa050, 1.45);
sunLight.position.set(500, 180, 330);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
Object.assign(sunLight.shadow.camera, {
  left: -600, right: 600, top: 600, bottom: -600, near: 100, far: 1600,
});
sunLight.bias = -0.0006;
sunLight.shadow.bias = -0.0006;
scene.add(sunLight, sunLight.target);

// 锚点点光
const a = CITY.anchors;
const towerLight = new THREE.PointLight(0xff9a3c, 1200, 250, 2);
towerLight.position.set(a.landmarkTower.x, CITY.groundY(a.landmarkTower.x, a.landmarkTower.z) + 18, a.landmarkTower.z);
const skytreeLight = new THREE.PointLight(0x6ac4ff, 1000, 220, 2);
skytreeLight.position.set(a.skytree.x, CITY.groundY(a.skytree.x, a.skytree.z) + 18, a.skytree.z);
const metroLight = new THREE.PointLight(0xffd27a, 900, 200, 2);
metroLight.position.set(a.metroGov.x, CITY.groundY(a.metroGov.x, a.metroGov.z) + 18, a.metroGov.z);
scene.add(towerLight, skytreeLight, metroLight);

// 街区级微弱点光（站前 / 娱乐，数量克制，托夜感）
const weakLights = [];
const putWeak = (px, pz, color, intensity, dist) => {
  const gy = CITY.groundY(Math.round(px), Math.round(pz));
  const l = new THREE.PointLight(color, intensity, dist, 2);
  l.position.set(px, gy + 16, pz);
  weakLights.push(l);
  scene.add(l);
};
if (a.stationFront) putWeak(a.stationFront.x, a.stationFront.z, 0xffc27a, 240, 110);
const entBlocks = (CITY.blocks || [])
  .filter((b) => b.district === 'entertainment')
  .sort((p, q) => (q.area || 0) - (p.area || 0))
  .slice(0, 2);
for (const b of entBlocks) putWeak(b.centroid[0], b.centroid[1], 0xff6ad5, 160, 85);
const stationBlocks = (CITY.blocks || [])
  .filter((b) => b.district === 'station_front')
  .sort((p, q) => (q.area || 0) - (p.area || 0))
  .slice(0, 1);
for (const b of stationBlocks) putWeak(b.centroid[0], b.centroid[1], 0xffd98a, 200, 95);

function applyViewpoint(name) {
  const v = viewpoint(name, CITY);
  if (!v) return;
  camera.position.set(v.position[0], v.position[1], v.position[2]);
  controls.target.set(v.target[0], v.target[1], v.target[2]);
  controls.autoRotate = false;
  controls.update();
}

// ---------- 生成城市 ----------
const vox = new VoxelBuilder({ keepRecords: PARAMS.debug });
const statsEl = document.getElementById('stats');
const auditEl = document.getElementById('audit');
let railCurve = null;

async function buildCityVoxels() {
  if (PARAMS.plan) {
    mountPlanView(scene, CITY, PARAMS.plan === '1' ? 'type' : PARAMS.plan);
    const v = viewpoint('plan', CITY);
    const S = CITY.N;
    camera = new THREE.OrthographicCamera(-S / 2, S / 2, S / 2, -S / 2, 1, 4000);
    camera.position.set(v.position[0], v.position[1], v.position[2]);
    camera.lookAt(0, 0, 0);
    controls.object = camera;
    statsEl.textContent = `PLAN:${PARAMS.plan} · ${CITY.stats.blocks} blocks · ${CITY.stats.plots} plots · ${CITY.stats.buildMs}ms`;
    if (auditEl) {
      const aud = CITY.audit();
      auditEl.textContent = `audit claims ${aud.total} road:${aud.onRoad} water:${aud.onWater} rail:${aud.onRail} overlap:${aud.overlap} pad:${aud.badPad}`;
    }
    renderer.shadowMap.enabled = false;
    return { solid: 0, glow: 0 };
  }

  statsEl.textContent = `CITY ${CITY.stats.buildMs}ms · blocks ${CITY.stats.blocks} · plots ${CITY.stats.plots}`;

  const steps = [
    { name: '地面', fn: () => buildGround(vox, CITY) },
    { name: '城市建筑', fn: () => {
      const r = placeFromCity(vox, CITY);
      railCurve = r.railCurve || buildRailCurveFromCity(CITY);
    }},
  ];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    statsEl.textContent = `正在生成: ${step.name} (${i + 1}/${steps.length})`;
    await new Promise((resolve) => setTimeout(resolve, 10));
    step.fn();
  }

  statsEl.textContent = '正在构建体素网格...';
  const { group, counts } = await vox.buildBatched(50000, (current, total, type) => {
    const percent = ((current / total) * 100).toFixed(0);
    statsEl.textContent = `正在构建: ${percent}% (${type === 'solid' ? '实体' : '发光'})`;
  });
  scene.add(group);
  renderer.shadowMap.needsUpdate = true;

  const aud = CITY.audit();
  const vis = CITY.stats.buildVis;
  if (auditEl) {
    const b = vis?.buildings || {};
    const bsum = Object.values(b).reduce((a, n) => a + n, 0);
    auditEl.textContent =
      `blocks ${CITY.stats.blocks} · plots ${CITY.stats.plots} · claims ${aud.total}`
      + ` · use ${vis ? Math.round((vis.plotUseRate || 0) * 100) : 0}%`
      + ` · bld ${bsum} · lamps ${vis?.props?.lamps ?? 0}`
      + ` · 违规 road:${aud.onRoad} water:${aud.onWater} rail:${aud.onRail} overlap:${aud.overlap} pad:${aud.badPad}`;
    auditEl.style.color =
      (aud.onRoad + aud.onWater + aud.onRail + aud.overlap + aud.badPad) ? '#ff6b5a' : '#7fd88a';
  }
  return counts;
}

let counts = { solid: 0, glow: 0 };
let train = null;
let traffic = null;
let clouds = null;
let beacon = null;

if (PARAMS.cam) applyViewpoint(PARAMS.cam);

buildCityVoxels().then((c) => {
  counts = c;
  const skyResult = buildSky(scene);
  clouds = skyResult.clouds;

  if (railCurve && !PARAMS.plan) {
    try { train = createTrain(scene, railCurve); } catch (e) { console.warn('train skip', e); }
  }
  if (!PARAMS.plan) {
    try { traffic = createTraffic(scene, CITY); } catch (e) { console.warn('traffic skip', e); }
  }

  const vis = CITY.stats.buildVis;
  const towerClaim = vis?.landmarks?.tower;
  const bx = towerClaim ? towerClaim.cx : a.landmarkTower.x;
  const bz = towerClaim ? towerClaim.cz : a.landmarkTower.z;
  const gy = towerClaim ? towerClaim.y : CITY.groundY(a.landmarkTower.x, a.landmarkTower.z);
  beacon = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 1.4, 1.4),
    new THREE.MeshBasicMaterial({ color: 0xff3b30 }),
  );
  beacon.castShadow = false;
  beacon.position.set(bx, gy + 99.5, bz);
  if (!PARAMS.plan) scene.add(beacon);

  statsEl.textContent = `${(counts.solid + counts.glow).toLocaleString()} voxels · CITY ${CITY.stats.buildMs}ms · claims ${CITY.stats.claims ?? '—'} · 就绪`;
});

let last = performance.now();
let fpsAcc = 0, fpsN = 0, elapsed = 0, degradeStage = 0;

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  elapsed += dt;

  controls.update();
  if (train) train.update(dt);
  if (traffic) traffic.update(dt);
  if (beacon) {
    beacon.material.color.setHex((now % 1400) < 700 ? 0xff3b30 : 0x4a100c);
  }
  if (clouds) {
    clouds.mesh.position.x = (elapsed * clouds.speed) % clouds.period;
  }

  renderer.render(scene, camera);

  fpsAcc += dt; fpsN++;
  if (fpsAcc >= 1) {
    const fps = fpsN / fpsAcc;
    fpsAcc = 0; fpsN = 0;
    statsEl.textContent = `${(counts.solid + counts.glow).toLocaleString()} voxels · ${fps.toFixed(0)} fps · CITY ${CITY.stats.buildMs}ms · claims ${CITY.stats.claims ?? '—'}`;
    if (elapsed > 5 && fps < 22) {
      if (degradeStage === 0) {
        degradeStage = 1;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
      } else if (degradeStage === 1) {
        degradeStage = 2;
        renderer.setPixelRatio(1);
        sunLight.castShadow = false;
        renderer.shadowMap.enabled = false;
        scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
      }
    }
  }
}
animate(performance.now());
