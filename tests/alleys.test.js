import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAlleys } from '../src/city/roads.js';
import { fullPipeline } from './helpers.js';
import { assignDistricts } from '../src/city/districts.js';
import { DISTRICT, T, CFG } from '../src/city/config.js';
import { makeRng } from '../src/rng.js';

function setup() {
  const p = fullPipeline();
  p.anchors = assignDistricts(p.blocks, p);
  const before = Array.from(p.f.t);
  p.alleys = buildAlleys(p.f, p.blocks, makeRng(CFG.SEED ^ 0x77));
  return { ...p, before };
}

test('产出小巷，全部位于住宅/传统区街区内部', () => {
  const { alleys } = setup();
  assert.ok(alleys.length >= 20, `小巷仅 ${alleys.length} 条`);
  for (const a of alleys) assert.ok(
    a.district === DISTRICT.LOW_RISE_RESI || a.district === DISTRICT.TRADITIONAL,
    `小巷出现在非住宅区: ${a.district}`);
});

test('非破坏性：只把 BLOCK 改成 BLOCK_ALLEY', () => {
  const { f, before } = setup();
  for (let i = 0; i < before.length; i++) {
    const b = before[i], a = f.t[i];
    if (b === a) continue;
    assert.equal(b, T.BLOCK, `原非 BLOCK 格被改写 ${b}→${a} @${i}`);
    assert.equal(a, T.BLOCK_ALLEY);
  }
});

test('小巷格保留 blockId 与 h', () => {
  const { f, blocks } = setup();
  let n = 0;
  for (let x = -CFG.HALF; x <= CFG.HALF; x++) for (let z = -CFG.HALF; z <= CFG.HALF; z++) {
    const i = f.idx(x, z);
    if (f.t[i] !== T.BLOCK_ALLEY) continue;
    assert.ok(f.blockId[i] >= 0, `小巷格丢了 blockId @${x},${z}`);
    const b = blocks[f.blockId[i]];
    assert.equal(f.h[i], b.h, '小巷高度与所属街区不一致');
    n++;
  }
  assert.ok(n > 300, `小巷格数过少 ${n}`);
});

test('小巷不破坏街区面积统计', () => {
  const { blocks } = setup();
  for (const b of blocks) assert.ok(b.area >= CFG.SLIVER_AREA);
});

test('确定性', () => {
  assert.equal(setup().alleys.length, setup().alleys.length);
});
