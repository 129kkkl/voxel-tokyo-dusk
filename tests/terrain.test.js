import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeTerrain, applyTerrain, quantize, RAW_MIN, RAW_MAX } from '../src/city/terrain.js';
import { Field } from '../src/city/field.js';
import { CFG } from '../src/city/config.js';
import { makeRng } from '../src/rng.js';

const H = 200;                      // 局部 fixture（测试 2/4/6 用，沿用 brief）
// RAW_MIN/RAW_MAX 是对「完整 1089² 场」定义的解析界：tilt 只在 x = ±HALF 才吃满 ±1.9。
// 在 ±200 窗里 tilt 只有 ±0.6985，两侧各留下 ≥1.2015 的死区，于是「界贴合可达极值」
// 在任何窗口下都无法成立 —— 与饱和度守卫同一族缺陷（§6.2 裁定 2），故本测试的探针跑满场。
// 步长 7 只为控开销（156² = 24336 次采样），阈值与措辞一字未改。
const FH = CFG.HALF;

test('rawHeight 落在解析界内，且解析界确实贴合可达极值（规格 §6.1/§6.2）', () => {
  const t = makeTerrain(makeRng(1));
  let min = Infinity, max = -Infinity;
  for (let x = -FH; x <= FH; x += 7) for (let z = -FH; z <= FH; z += 7) {
    const v = t.raw(x, z);
    assert.ok(Number.isFinite(v), `非有限值 @${x},${z}`);
    if (v < min) min = v; if (v > max) max = v;
  }
  assert.ok(min >= RAW_MIN - 1e-9 && max <= RAW_MAX + 1e-9,
    `越出解析界 ${min.toFixed(2)}..${max.toFixed(2)} vs ${RAW_MIN.toFixed(2)}..${RAW_MAX.toFixed(2)}`);
  // 窗口比可达区间宽太多 = 量化时那一侧的 level 永远出不来，正是本任务踩过两次的坑
  assert.ok(min - RAW_MIN < 1.0, `RAW_MIN 过宽 ${(min - RAW_MIN).toFixed(2)}，level 1 会恒空`);
  assert.ok(RAW_MAX - max < 1.0, `RAW_MAX 过宽 ${(RAW_MAX - max).toFixed(2)}，level 7 会恒空`);
});

test('西高东低：对称探针，避开台地过渡带（规格 §6.1）', () => {
  // 探针必须在 scarp 带之外。xb(z) ∈ [-115,-25]，带宽 ±30 → 带范围 x ∈ [-145, +5]。
  // 取 -190 与 +190，两者都在带外，差值只由 tilt 决定，不含相位运气。
  const t = makeTerrain(makeRng(1));
  const avg = (x) => { let s = 0, n = 0; for (let z = -H; z <= H; z += 5) { s += t.raw(x, z); n++; } return s / n; };
  assert.ok(avg(-190) > avg(190) + 1.0, `东西梯度不足：${avg(-190)} vs ${avg(190)}`);
});

test('台地边缘是真实断阶：沿边界线两侧取 z 窗均值，差 ≥ 1.0（规格 §6.1）', () => {
  const t = makeTerrain(makeRng(1));
  // 单点采样会被 N1/N2 噪声主导（实测 300 种子里 1.7% 越界，属不稳定测试）。
  // 在 xb±70 处各取一段 z 窗做均值，噪声平均掉之后剩下的就是 tilt+scarp 的真实台阶。
  const mean = (x, z0) => {
    let s = 0, n = 0;
    for (let z = z0 - 40; z <= z0 + 40; z += 8) { s += t.raw(x, z); n++; }
    return s / n;
  };
  for (const z of [-160, -40, 60, 170]) {
    const xb = t.scarpX(z);
    const west = mean(xb - 70, z), east = mean(xb + 70, z);
    assert.ok(west > east + 1.0, `z=${z} 处边界两侧无台阶：${west.toFixed(2)} vs ${east.toFixed(2)}`);
  }
});

test('scarpX 在 ±x 带内波动且平滑', () => {
  const t = makeTerrain(makeRng(1));
  let prev = t.scarpX(-H);
  for (let z = -H; z <= H; z += 5) {
    const v = t.scarpX(z);
    assert.ok(v >= -130 && v <= -10, `边界越位 ${v}`);
    assert.ok(Math.abs(v - prev) < 12, '边界跳变过陡');
    prev = v;
  }
});

test('quantize 输出 [1,7] 整数', () => {
  for (const v of [-99, -3.4, -1.2, 0, 1.4, 2.6, 5, 99]) {
    const q = quantize(v);
    assert.ok(Number.isInteger(q), `非整数 ${q}`);
    assert.ok(q >= 1 && q <= 7, `越界 ${q}`);
  }
  assert.equal(quantize(-99), 1);
  assert.equal(quantize(99), 7);
});

test('applyTerrain 写入整数高度、确定性、相邻高差 ≤ 2', () => {
  const run = () => {
    const f = new Field(H);
    applyTerrain(f, makeTerrain(makeRng(7)));
    return f;
  };
  const a = run(), b = run();
  assert.deepEqual(Array.from(a.h), Array.from(b.h));
  for (let x = -H; x < H; x++) for (let z = -H; z <= H; z++) {
    const i = a.idx(x, z);
    assert.ok(a.h[i] >= 1 && a.h[i] <= 7);
    assert.ok(Math.abs(a.h[i] - a.h[a.idx(x + 1, z)]) <= 2, `x 向陡坎 ${x},${z}`);
    assert.ok(Math.abs(a.h[i] - a.h[a.idx(x, z + 1)]) <= 2, `z 向陡坎 ${x},${z}`);
  }
});

test('饱和度：满窗映射没有被两端夹扁（规格 §6.2 修订的直接守卫，判据 §15.4 的地基）', () => {
  // 必须在完整 1089² 场上量：小场（如 H=200）的可达 raw 区间更窄，
  // 任何窗口下都会让 level 1/2/7 归零，守卫随即失真。
  const f = new Field();
  applyTerrain(f, makeTerrain(makeRng(CFG.SEED)));
  const hist = new Map();
  let tot = 0;
  for (let i = 0; i < f.h.length; i++) {
    const lv = f.h[i];
    assert.ok(Number.isInteger(lv) && lv >= 1 && lv <= 7, `非法高度 ${lv}`);
    hist.set(lv, (hist.get(lv) || 0) + 1);
    tot++;
  }
  const share = (lv) => (hist.get(lv) || 0) / tot;
  assert.ok(share(1) <= 0.12 && share(1) > 0, `level 1 = ${(share(1) * 100).toFixed(2)}%，应为稀少但非零`);
  assert.ok(share(7) <= 0.12 && share(7) > 0, `level 7 = ${(share(7) * 100).toFixed(2)}%，应为稀少但非零`);
  for (let lv = 2; lv <= 6; lv++) assert.ok(share(lv) >= 0.01, `内部 level ${lv} 几乎不存在`);
});
