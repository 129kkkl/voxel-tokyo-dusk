import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlots, FACE_OF } from '../src/city/plots.js';
import { runDistricts } from './helpers.js';
import { T, DISTRICT, CFG, isBlocked } from '../src/city/config.js';

function setup() {
  const p = runDistricts();
  p.plots = buildPlots(p.blocks, p.f);
  return p;
}

test('地块数 ≥ 街区数 × 1.2', () => {
  const { plots, blocks } = setup();
  assert.ok(plots.length >= blocks.length * 1.2,
    `地块过少 ${plots.length} vs ${blocks.length} 街区`);
});

test('每个地块都是 4 个 face 之一，且 w/d ≥ MIN_PLOT_SIDE', () => {
  const { plots } = setup();
  for (const p of plots) {
    assert.ok([0, 1, 2, 3].includes(p.face), `face 非法 ${p.face}`);
    assert.ok(p.w >= CFG.MIN_PLOT_SIDE && p.d >= CFG.MIN_PLOT_SIDE, `地块过小 ${p.w}×${p.d}`);
  }
});

test('硬不变量：任何地块都不含道路/水体/轨道/小巷/人行道格', () => {
  const { f, plots } = setup();
  let bad = 0;
  for (const p of plots) {
    for (let x = p.rect.x0; x <= p.rect.x1; x++) for (let z = p.rect.z0; z <= p.rect.z1; z++) {
      if (isBlocked(f.t[f.idx(x, z)])) bad++;
    }
  }
  assert.equal(bad, 0, `${bad} 个地块格压路/压水/压轨`);
});

test('硬不变量：任意两个地块矩形不跨街区重叠', () => {
  const { plots } = setup();
  const cells = new Map();
  let clash = 0;
  for (const p of plots) for (let x = p.rect.x0; x <= p.rect.x1; x++) for (let z = p.rect.z0; z <= p.rect.z1; z++) {
    const k = `${x},${z}`;
    if (cells.has(k) && cells.get(k) !== p.blockId) clash++;
    else cells.set(k, p.blockId);
  }
  assert.equal(clash, 0, `${clash} 处跨街区重叠`);
});

test('硬不变量：地块高度与所属街区全等', () => {
  const { f, plots, blocks } = setup();
  for (const p of plots) {
    assert.equal(p.h, blocks[p.blockId].h);
    for (let x = p.rect.x0; x <= p.rect.x1; x++) for (let z = p.rect.z0; z <= p.rect.z1; z++)
      assert.equal(f.h[f.idx(x, z)], p.h, `地块 ${p.id} 内部高度不齐`);
  }
});

test('每个地块都退让临街边（setback）', () => {
  const { f, plots } = setup();
  for (const p of plots) {
    const [ox, oz] = FACE_OF[p.face];
    const fx = p.face === 2 ? p.rect.x1 : p.face === 3 ? p.rect.x0 : Math.round(p.cx);
    const fz = p.face === 0 ? p.rect.z1 : p.face === 1 ? p.rect.z0 : Math.round(p.cz);
    const nx = fx + ox, nz = fz + oz;
    if (!f.inb(nx, nz)) continue;
    const t = f.t[f.idx(nx, nz)];
    assert.ok(t === T.SIDEWALK || isBlocked(t) || t === T.PLOT_FREE || t === T.PLOT_USE || t === T.BLOCK,
      `地块 ${p.id} 临街侧外 type=${t}`);
  }
});

test('地块 kind 与分区匹配', () => {
  const { plots } = setup();
  const byD = new Map();
  for (const p of plots) {
    if (!byD.has(p.district)) byD.set(p.district, new Set());
    byD.get(p.district).add(p.kind);
  }
  assert.ok(byD.get(DISTRICT.LOW_RISE_RESI)?.has('lot_house'));
  assert.ok(byD.get(DISTRICT.CBD)?.has('lot_tower') || byD.get(DISTRICT.SUB_CENTER)?.has('lot_tower'),
    '办公区未产出塔楼地块');
});

test('异形（三角）街区仍产出地块', () => {
  const { blocks, plots } = setup();
  const tri = blocks.filter((b) => {
    const [x0, z0, x1, z1] = b.bbox;
    return b.area / ((x1 - x0 + 1) * (z1 - z0 + 1)) < 0.65 && b.area > 600;
  });
  assert.ok(tri.length > 20, `三角块太少 ${tri.length}`);
  const ok = tri.filter((b) => plots.filter((p) => p.blockId === b.id).length >= 2).length;
  assert.ok(ok / tri.length > 0.55, `三角块出块率仅 ${(ok / tri.length * 100).toFixed(0)}%`);
});

test('确定性', () => {
  const a = setup(), b = setup();
  assert.deepEqual(a.plots.map((p) => [p.rect.x0, p.rect.z0, p.w, p.d, p.face]),
    b.plots.map((p) => [p.rect.x0, p.rect.z0, p.w, p.d, p.face]));
});
