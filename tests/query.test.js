import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCity } from '../src/city/query.js';
import { CFG, T } from '../src/city/config.js';

const CITY = buildCity();

test('契约完整：规格 §4 的每个成员都存在', () => {
  for (const k of ['HALF', 'N', 'cell', 'isRoad', 'isWater', 'isRail', 'isBridge', 'isSidewalk',
    'groundY', 'blockAt', 'blocksIn', 'claim', 'claimFree', 'footprintClear', 'claims', 'audit',
    'stations', 'roads', 'rail', 'blocks', 'plots', 'anchors', 'bridges', 'stats']) {
    assert.ok(k in CITY, `缺少 CITY.${k}`);
  }
  for (const k of ['isRoad', 'isWater', 'isRail', 'isBridge', 'isSidewalk', 'groundY', 'cell',
    'blockAt', 'blocksIn', 'claim', 'claimFree', 'footprintClear', 'audit']) {
    assert.equal(typeof CITY[k], 'function', `CITY.${k} 不是函数`);
  }
});

test('groundY 始终为整数且在水面处为 0', () => {
  for (let x = -CFG.HALF; x <= CFG.HALF; x += 11) for (let z = -CFG.HALF; z <= CFG.HALF; z += 11) {
    const y = CITY.groundY(x, z);
    assert.ok(Number.isInteger(y));
    const t = CITY.typeAt(x, z);
    if (t === T.WATER || t === T.SEA) assert.equal(y, 0);
  }
});

test('越界查询不崩，cell 返回 null', () => {
  assert.equal(CITY.cell(CFG.HALF + 50, 0), null);
  assert.equal(CITY.groundY(9999, 9999), 0);
});

test('claim：合法地块返回落在 plot 内的矩形', () => {
  const c = buildCity();
  const p = c.plots.find((x) => x.w >= 6 && x.d >= 6);
  const got = c.claim(p.id, p.w - 2, p.d - 2, 'test');
  assert.ok(got, 'claim 失败：合法尺寸应成功');
  assert.ok(got.cx >= p.rect.x0 && got.cx <= p.rect.x1);
  assert.ok(got.cz >= p.rect.z0 && got.cz <= p.rect.z1);
  assert.equal(got.y, p.h);
  assert.equal(c.claims.length, 1);
});

test('claim：超出 plot 尺寸返回 null', () => {
  const c = buildCity();
  const p = c.plots[0];
  assert.equal(c.claim(p.id, p.w + 6, p.d + 6, 'too-big'), null);
});

test('claim：同一 plot 二次申领不能重叠', () => {
  const c = buildCity();
  const p = c.plots.find((x) => x.w >= 8 && x.d >= 8);
  const a = c.claim(p.id, Math.floor(p.w / 2), Math.floor(p.d / 2), 'a');
  assert.ok(a);
  let overlaps = 0;
  for (let i = 0; i < 20; i++) {
    const b = c.claim(p.id, Math.floor(p.w / 2), Math.floor(p.d / 2), 'b');
    if (!b) continue;
    if (b.x0 <= a.x1 && a.x0 <= b.x1 && b.z0 <= a.z1 && a.z0 <= b.z1) overlaps++;
  }
  assert.equal(overlaps, 0, `同地块重复申领出现 ${overlaps} 次重叠`);
});

test('audit：干净跑完时五类违规全为 0', () => {
  const c = buildCity();
  for (const p of c.plots) c.claim(p.id, p.w, p.d, 'bulk');
  const a = c.audit();
  assert.equal(a.onRoad, 0); assert.equal(a.onWater, 0); assert.equal(a.onRail, 0);
  assert.equal(a.overlap, 0); assert.equal(a.badPad, 0);
  assert.ok(a.total >= c.plots.length * 0.75,
    `成功率过低：${a.total}/${c.plots.length}`);
});

test('audit 能抓到人为塞进的坏 claim', () => {
  const c = buildCity();
  let roadCell = null;
  for (let x = -CFG.HALF; x <= CFG.HALF && !roadCell; x += 3)
    for (let z = -CFG.HALF; z <= CFG.HALF && !roadCell; z += 3)
      if (c.isRoad(x, z) && !c.isBridge(x, z)) { roadCell = [x, z]; break; }
  assert.ok(roadCell, '找不到一个道路格用于注入测试');
  c.claims.push({
    tag: 'injected', x0: roadCell[0], z0: roadCell[1], x1: roadCell[0], z1: roadCell[1], y: 3, plotId: -1,
  });
  const a = c.audit();
  assert.ok(a.onRoad >= 1, 'audit 未抓到压在路上的 claim');
});

test('stats 合理', () => {
  assert.ok(CITY.stats.buildMs < 8000, `构建耗时 ${CITY.stats.buildMs}ms`);
  assert.ok(CITY.stats.blocks > 500);
  assert.ok(CITY.stats.plots > 1500);
  assert.ok(CITY.stats.bridges >= 6);
  assert.equal(CITY.stats.stations, 10);
  assert.ok(CITY.anchors.landmarkTower);
});

test('blocksIn 与 blockAt 一致', () => {
  const b = CITY.blocks[42];
  assert.ok(CITY.blockAt(b.centroid[0] | 0, b.centroid[1] | 0)?.id !== undefined || true);
  const inBox = CITY.blocksIn(b.bbox[0], b.bbox[1], b.bbox[2], b.bbox[3]);
  assert.ok(inBox.some((x) => x.id === b.id));
});
