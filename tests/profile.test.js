import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRailAndStations, buildTrunks, buildSecondaries, profileHeights } from '../src/city/roads.js';
import { makeTerrain, applyTerrain, quantize } from '../src/city/terrain.js';
import { Field } from '../src/city/field.js';
import { T, isRoad, CFG } from '../src/city/config.js';
import { makeRng, hash2 } from '../src/rng.js';
import { resample } from '../src/city/geom.js';

const H = CFG.HALF;

function setup() {
  const rng = makeRng(CFG.SEED);
  const terr = makeTerrain(makeRng(CFG.SEED ^ 0x51ab));
  const rail = buildRailAndStations(rng);
  const f = new Field(H);
  f.fill(() => ({ t: T.BLOCK }));
  applyTerrain(f, terr);
  const roads = buildTrunks(f, rail, rng);
  roads.push(...buildSecondaries(f, roads, rail, rng));
  profileHeights(f, roads, terr);
  return { f, roads, terr };
}

test('道路格高度全为 [0,7] 整数', () => {
  const { f } = setup();
  for (let x = -H; x <= H; x++) for (let z = -H; z <= H; z++) {
    const i = f.idx(x, z);
    if (!isRoad(f.t[i]) && f.t[i] !== T.SIDEWALK && f.t[i] !== T.RAIL) continue;
    assert.ok(Number.isInteger(f.h[i]), `非整数 ${f.h[i]}`);
    assert.ok(f.h[i] >= 0 && f.h[i] <= 7, `越界 ${f.h[i]}`);
  }
});

test('沿路任意 30 格步长内高差 ≤ 1（缓坡，规格 §6.3）', () => {
  const { f, roads } = setup();
  for (const r of roads) {
    if (r.cls === 'MINOR') continue;                     // 次级路允许局部小起伏
    const dense = resample(r.pts, 30);
    for (let k = 1; k < dense.length; k++) {
      const a = dense[k - 1], b = dense[k];
      const ga = [Math.round(a[0]), Math.round(a[1])], gb = [Math.round(b[0]), Math.round(b[1])];
      if (!f.inb(ga[0], ga[1]) || !f.inb(gb[0], gb[1])) continue;
      const ha = f.h[f.idx(ga[0], ga[1])], hb = f.h[f.idx(gb[0], gb[1])];
      assert.ok(Math.abs(ha - hb) <= 1,
        `${r.cls}#${r.id} 在 ${ga}->${gb} 处高差 ${ha - hb} > 1`);
    }
  }
});

test('道路剖面确实改变了地形（台地边缘被拉平成坡道，而非完全等于地形）', () => {
  const { f, terr } = setup();
  let diff = 0, tot = 0;
  for (let x = -H; x <= H; x += 3) for (let z = -H; z <= H; z += 3) {
    const i = f.idx(x, z);
    if (!isRoad(f.t[i])) continue;
    tot++;
    const raw = quantize(terr.raw(x, z));
    if (raw !== f.h[i]) diff++;
  }
  assert.ok(tot > 3000);
  assert.ok(diff / tot > 0.02, `道路几乎没平滑地形（${(diff / tot * 100).toFixed(1)}%）`);
  assert.ok(diff / tot < 0.85, '道路高度与地形脱钩（过度拉平）');
});

test('人行道格继承所在路面高度（不出现路缘内部错台）', () => {
  const { f, roads } = setup();
  for (const r of roads) {
    if (r.cls === 'RAIL') continue;
    const dense = resample(r.pts, 4);
    const seen = new Set();
    for (const p of dense) {
      const x = Math.round(p[0]), z = Math.round(p[1]);
      if (!f.inb(x, z) || seen.has(f.idx(x, z))) continue;
      seen.add(f.idx(x, z));
      const i = f.idx(x, z);
      if (f.t[i] === T.SIDEWALK) {
        // 同一 roadId 的路面格高度必须与人行道一致
        for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) {
          const j = f.idx(x + a, z + b);
          if (!f.inb(x + a, z + b) || f.roadId[j] !== f.roadId[i] || !isRoad(f.t[j])) continue;
          assert.equal(f.h[i], f.h[j], `人行道与路面错台 @${x},${z}`);
        }
      }
      if (seen.size > 4000) break;
    }
  }
});
