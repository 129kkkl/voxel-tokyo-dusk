import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Field } from '../src/city/field.js';
import { T } from '../src/city/config.js';

const H = 30;

/** 便捷构造：给定 half 与一个 (x,z)=>t 的判定 */
function makeField(half, pred) {
  const f = new Field(half);
  f.fill((x, z) => ({ t: pred(x, z) ? T.BLOCK : T.ROAD_MINOR }));
  return f;
}

test('connectedComponents：两块分离区域，面积/bbox/质心正确', () => {
  // x<0 是一整块；x>=0 里 z<5 一块、z>=5 一块，被一条 ROAD 走廊（x=0 列）分开
  const f = makeField(H, (x, z) => x !== 0);
  const comps = f.connectedComponents((t) => t === T.BLOCK);
  assert.equal(comps.length, 2);
  const sorted = comps.slice().sort((a, b) => b.area - a.area);
  assert.equal(sorted[0].area, 30 * 61);            // 左侧 x∈-30..-1
  assert.equal(sorted[1].area, 30 * 61);
  assert.deepEqual(sorted[0].bbox, [-30, -30, -1, 30]);
  for (const c of sorted) {
    assert.ok(Math.abs(c.centroid[0] - (c.bbox[0] + c.bbox[2]) / 2) < 1e-6);
    assert.equal(c.cells.length, c.area);
  }
});

test('connectedComponents：4 邻域而非 8 邻域（对角不连通）', () => {
  const f = new Field(H);
  f.fill((x, z) => ({ t: T.ROAD_MINOR }));
  for (const [x, z] of [[0, 0], [1, 1]]) f.setAt(x, z, { t: T.BLOCK });
  const comps = f.connectedComponents((t) => t === T.BLOCK);
  assert.equal(comps.length, 2);
});

test('connectedComponents：环形墙内的洞单独成块（含 1 格宽墙）', () => {
  const f = new Field(H);
  f.fill((x, z) => ({ t: T.BLOCK }));
  for (let a = -8; a <= 8; a++) for (let b = -8; b <= 8; b++)
    if (Math.max(Math.abs(a), Math.abs(b)) === 8) f.setAt(a, b, { t: T.ROAD_MINOR });
  const comps = f.connectedComponents((t) => t === T.BLOCK);
  assert.equal(comps.length, 2);
  const hole = comps.find((c) => c.area === 15 * 15);
  assert.ok(hole, '内洞未单独成块');
});

test('multiSourceBFS：所有区域格都被分配、种子格标签即自身', () => {
  const f = makeField(H, (x, z) => x !== 0);
  const seeds = [[-15, 0], [-5, 10], [-20, -20], [10, 0], [20, 15], [5, -25]];
  const { label, sizes } = f.multiSourceBFS(seeds, (x, z) => f.t[f.idx(x, z)] === T.BLOCK);
  let assigned = 0;
  for (let x = -H; x <= H; x++) for (let z = -H; z <= H; z++) {
    const i = f.idx(x, z);
    if (f.t[i] !== T.BLOCK) { assert.equal(label[i], -1, '非区域格不应有标签'); continue; }
    assert.ok(label[i] >= 0 && label[i] < seeds.length, `漏分 ${x},${z}`);
    assigned++;
  }
  assert.equal(assigned, 2 * 30 * 61);
  const sum = Array.from(sizes).reduce((a, b) => a + b, 0);
  assert.equal(sum, assigned);
  for (let s = 0; s < seeds.length; s++) assert.equal(label[f.idx(seeds[s][0], seeds[s][1])], s);
});

test('multiSourceBFS：不相邻的种子各自占据独立分量（不会穿越道路）', () => {
  const f = makeField(H, (x, z) => x !== 0);
  const seeds = [[-10, 0], [10, 0]];
  const { label } = f.multiSourceBFS(seeds, (x, z) => f.t[f.idx(x, z)] === T.BLOCK);
  assert.equal(label[f.idx(-25, 0)], 0);
  assert.equal(label[f.idx(25, 0)], 1);
});

test('maxRectInMask：实心矩形取自身', () => {
  const ok = (x, z) => x >= 0 && x <= 9 && z >= 0 && z <= 5;
  const r = new Field(1).maxRectInMask(-2, -2, 12, 8, ok);
  assert.deepEqual([r.x0, r.z0, r.x1, r.z1], [0, 0, 9, 5]);
  assert.equal(r.area, 10 * 6);
});

test('maxRectInMask：L 形取最大内接矩形', () => {
  // 20×20 挖掉右下角 10×10 → 最大内接矩形 20×10 或 10×20，面积 200
  const ok = (x, z) => x >= 0 && x < 20 && z >= 0 && z < 20 && !(x >= 10 && z >= 10);
  const r = new Field(1).maxRectInMask(-1, -1, 21, 21, ok);
  assert.equal(r.area, 200);
});

test('maxRectInMask：斜边街区（阶梯掩码）不越界', () => {
  // 掩码是 x + z <= 20 的下三角
  const ok = (x, z) => x >= 0 && z >= 0 && x + z <= 20;
  const r = new Field(1).maxRectInMask(0, 0, 21, 21, ok);
  for (let x = r.x0; x <= r.x1; x++)
    for (let z = r.z0; z <= r.z1; z++) assert.ok(ok(x, z), `矩形越出掩码 ${x},${z}`);
  // 三角形最大内接轴对齐矩形为 11×11=121（x,z ∈ 0..10 时 x+z<=20 成立）
  assert.equal(r.area, 121);
});

test('maxRectInMask：无可行格返回 null', () => {
  assert.equal(new Field(1).maxRectInMask(0, 0, 5, 5, () => false), null);
});
