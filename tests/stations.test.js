import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRailAndStations } from '../src/city/roads.js';
import { polylineLength } from '../src/city/geom.js';
import { makeRng } from '../src/rng.js';

const run = () => buildRailAndStations(makeRng(20260919));

test('轨道环闭合、点数正确、长度合理', () => {
  const rail = run();
  // 规格 §5.1.1 的「超椭圆采样 72 点」是控制点数；buildRailAndStations 返回的是
  // catmullRom 加密后的折线（每段 6 次采样 = 432 点），后面所有压印都吃这条密折线。
  // 只留 72 点会让站离环的判据（<12）从 1.9 涨到 11.7，几乎踩线，故密折线是必需的。
  assert.equal(rail.pts.length, 72 * 6);
  const L = polylineLength(rail.pts);
  assert.ok(L > 2 * Math.PI * 200 && L < 2 * Math.PI * 300, `周长异常 ${L}`);
  assert.ok(Math.hypot(rail.pts[0][0] - rail.pts.at(-1)[0], rail.pts[0][1] - rail.pts.at(-1)[1]) < 30);
});

test('10 个车站，全部落在轨道环上，方位角不等间距', () => {
  const rail = run();
  assert.equal(rail.stations.length, 10);
  const onRing = rail.pts;
  for (const s of rail.stations) {
    let d = Infinity;
    for (const [x, z] of onRing) d = Math.min(d, Math.hypot(s.x - x, s.z - z));
    assert.ok(d < 12, `站 ${s.id} 离环 ${d}`);
  }
  const gaps = rail.stations.map((s, i) => {
    const n = rail.stations[(i + 1) % 10];
    let g = Math.abs(n.bearing - s.bearing); if (g > 180) g = 360 - g;
    return g;
  });
  assert.ok(new Set(gaps.map((g) => Math.round(g))).size >= 7, '间距过于均匀（对称）');
});

test('rank：1 main / 4 sub / 5 local；main 最靠近原点；sub 两两间隔 ≥ 60°', () => {
  const rail = run();
  const by = (r) => rail.stations.filter((s) => s.rank === r);
  assert.equal(by('main').length, 1);
  assert.equal(by('sub').length, 4);
  assert.equal(by('local').length, 5);
  for (const s of rail.stations) {
    if (s.rank === 'main') continue;
    assert.ok(Math.hypot(s.x, s.z) >= Math.hypot(by('main')[0].x, by('main')[0].z) - 1e-6,
      'main 不是最近的站');
  }
  const subs = by('sub');
  for (let i = 0; i < subs.length; i++) for (let j = i + 1; j < subs.length; j++) {
    let g = Math.abs(subs[i].bearing - subs[j].bearing); if (g > 180) g = 360 - g;
    assert.ok(g >= 60, `sub 站 ${subs[i].bearing}/${subs[j].bearing} 间隔仅 ${g}`);
  }
});

test('sub 站分布不构成中心对称（无两站互为对跖点）', () => {
  const subs = run().stations.filter((s) => s.rank === 'sub');
  for (let i = 0; i < subs.length; i++) for (let j = i + 1; j < subs.length; j++) {
    let g = Math.abs(subs[i].bearing - subs[j].bearing); if (g > 180) g = 360 - g;
    assert.ok(Math.abs(g - 180) > 8, `sub ${subs[i].bearing}/${subs[j].bearing} 互为对跖，几何太对称`);
  }
});

test('确定性：同种子同结果', () => {
  assert.deepEqual(run().stations, buildRailAndStations(makeRng(20260919)).stations);
});
