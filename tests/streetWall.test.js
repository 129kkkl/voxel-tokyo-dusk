import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlots } from '../src/city/plots.js';
import { runDistricts } from './helpers.js';

function setup() {
  const p = runDistricts();
  p.plots = buildPlots(p.blocks, p.f);
  return p;
}

test('U3 街墙：同 (roadId, face) 段内建筑退线一致（setback 无混用）', () => {
  const { plots } = setup();
  const by = new Map();
  for (const p of plots) {
    const k = `${p.roadId}:${p.face}`;
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(p);
  }
  let groups = 0, mixed = 0;
  for (const [k, list] of by) {
    if (list.length < 3) continue;
    groups++;
    const st = new Set(list.map((p) => p.setback));
    if (st.size > 1) {
      mixed++;
      assert.fail(`段 ${k} 混用退线 ${[...st]}（n=${list.length}）`);
    }
  }
  assert.ok(groups > 20, `可检段过少 ${groups}，本条测试无判别力`);
  assert.equal(mixed, 0);
});

test('U3 面阔约束：住宅 5–9、商业 6–12、办公 8–16（超宽已二分）', () => {
  const { plots } = setup();
  const LIM = { lot_house: [5, 9], lot_shop: [6, 12], lot_tower: [8, 16] };
  let checked = 0;
  for (const p of plots) {
    const lim = LIM[p.kind];
    if (!lim) continue;
    const front = p.face < 2 ? p.w : p.d;
    checked++;
    assert.ok(front >= lim[0] && front <= lim[1],
      `plot ${p.id} kind=${p.kind} 面阔 ${front} 超界 [${lim}]`);
  }
  assert.ok(checked > 100, `可检地块过少 ${checked}`);
});
