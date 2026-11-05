import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractBlocks } from '../src/city/blocks.js';
import { fullPipeline } from './helpers.js';
import { T, CFG } from '../src/city/config.js';

test('街区数在宽区间内（规格 §8.5，收紧到 1100~1600 在形态检查点调参）', () => {
  const { blocks } = fullPipeline();
  assert.ok(blocks.length >= 900 && blocks.length <= 2200,
    `街区数 ${blocks.length}`);
});

test('每个街区的格全是 BLOCK，且 blockId 唯一一致', () => {
  const { f, blocks } = fullPipeline();
  for (const b of blocks) {
    assert.ok(b.area >= CFG.SLIVER_AREA, `碎块漏吸收 ${b.area}`);
    for (const i of b.cells) {
      assert.ok(f.t[i] === T.BLOCK, `街区含非 BLOCK 格 type=${f.t[i]}`);
      assert.equal(f.blockId[i], b.id, 'blockId 未回写');
    }
  }
});

test('街区互不相邻越界：每块格数总和 = field 中 BLOCK 格数', () => {
  const { f, blocks } = fullPipeline();
  const total = blocks.reduce((s, b) => s + b.area, 0);
  assert.equal(total, f.countIf((c) => c.t === T.BLOCK));
});

test('同街区高度全等（规格 §6.3，run 合并的前提）', () => {
  const { f, blocks } = fullPipeline();
  for (const b of blocks) {
    const h0 = f.h[b.cells[0]];
    for (const i of b.cells) assert.equal(f.h[i], h0, `街区 ${b.id} 高度不齐`);
    assert.equal(b.h, h0);
  }
});

test('无孤立飞地：每个街区至少有一条临街边', () => {
  const { blocks } = fullPipeline();
  const orphan = blocks.filter((b) => !b.frontage.length);
  assert.equal(orphan.length, 0, `存在 ${orphan.length} 个无临街的孤岛街区`);
});

test('异形街区存在：既有较规整块，也有三角形/扇形', () => {
  const { blocks } = fullPipeline();
  const fills = blocks.filter((b) => b.area > 800).map((b) => {
    const [x0, z0, x1, z1] = b.bbox;
    return b.area / ((x1 - x0 + 1) * (z1 - z0 + 1));
  });
  assert.ok(fills.filter((v) => v > 0.75).length > 15, `缺少较规整街区 (got ${fills.filter((v) => v > 0.75).length})`);
  assert.ok(fills.filter((v) => v < 0.65).length > 40, '缺少三角形/扇形异形街区');
});

test('面积分布右偏：最大块 < 60× 中位数', () => {
  const { blocks } = fullPipeline();
  const a = blocks.map((b) => b.area).sort((x, y) => x - y);
  const med = a[Math.floor(a.length / 2)];
  assert.ok(a.at(-1) < med * 60, `最大块 ${a.at(-1)} vs 中位 ${med}`);
});

test('确定性：同种子同结果', () => {
  assert.deepEqual(fullPipeline().blocks.map((b) => b.area), fullPipeline().blocks.map((b) => b.area));
});
