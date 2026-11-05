import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG, T, ROAD, isRoad, isWater, isBlocked, DISTRICT, idx, inb } from '../src/city/config.js';

test('网格尺寸自洽', () => {
  assert.equal(CFG.HALF, 544);
  assert.equal(CFG.N, 1089);
  assert.equal(CFG.N, 2 * CFG.HALF + 1);
});

test('格子索引唯一且不越界', () => {
  assert.equal(idx(-CFG.HALF, -CFG.HALF), 0);
  assert.equal(idx(CFG.HALF, CFG.HALF), CFG.N * CFG.N - 1);
  assert.equal(new Set([idx(0, 0), idx(0, 1), idx(1, 0)]).size, 3);
  assert.equal(inb(0, 0), true);
  assert.equal(inb(CFG.HALF + 1, 0), false);
  assert.equal(inb(-CFG.HALF - 1, 0), false);
});

test('道路类型连续，isRoad/isWater 可用区间判断', () => {
  assert.equal(T.ROAD_MINOR, T.ROAD_RING + 3);      // 连续：RING,RADIAL,ARTERIAL,MINOR
  assert.equal(isRoad(T.ROAD_RING), true);
  assert.equal(isRoad(T.ROAD_MINOR), true);
  assert.equal(isRoad(T.SIDEWALK), false);
  assert.equal(isRoad(T.BLOCK), false);
  assert.equal(isWater(T.WATER), true);
  assert.equal(isWater(T.SEA), true);
  assert.equal(isWater(T.BRIDGE), true);            // 桥格下就是水（规格 §7.3「桥下格保持 WATER」）
  assert.equal(isWater(T.QUAY), false);             // 突堤是陆域，不是水
  assert.equal(isWater(T.BLOCK), false);
});

test('isBlocked 精确划出可建/不可建两集（规格 §10.7 不变量 1）', () => {
  const blocked = new Set([
    T.ROAD_RING, T.ROAD_RADIAL, T.ROAD_ARTERIAL, T.ROAD_MINOR,   // 路面（isRoad 区间）
    T.WATER, T.SEA,                                              // 水体（isWater）
    T.RAIL, T.SIDEWALK, T.MEDIAN, T.BLOCK_ALLEY, T.OUTSIDE,
    T.BRIDGE,                                                    // 桥面不是用地
    T.POCKET,                                                    // 口袋公园只放树与长椅（§8.3）
  ]);
  const buildable = new Set([
    T.BLOCK, T.PLOT_USE, T.PLOT_FREE,
    T.QUAY, T.RECLAIM, T.RECLAIMED,             // 突堤与埋立地都是要放工厂仓库的陆域（§7.2）
  ]);
  for (const t of blocked) assert.equal(isBlocked(t), true, `type ${t} 必须不可建`);
  for (const t of buildable) assert.equal(isBlocked(t), false, `type ${t} 必须可建`);
  // 两集必须不重叠且穷尽 T：新增格子类型时被强制在这里显式表态
  const all = new Set(Object.values(T));
  assert.equal(all.size, blocked.size + buildable.size);
  for (const t of all) assert.ok(blocked.has(t) !== buildable.has(t), `type ${t} 归类未定`);
});

test('道路等级参数齐备', () => {
  for (const k of ['RING', 'RADIAL', 'ARTERIAL', 'MINOR']) {
    const r = ROAD[k];
    assert.ok(r.width >= 4 && r.width <= 9, `${k} 宽度越界`);
    assert.equal(typeof r.t, 'number');
    assert.ok(r.walk >= 1);
    assert.equal(r.t, T['ROAD_' + k]);
    assert.ok(r.lampGap > 0);
    assert.equal(r.carOk, true);
  }
});

test('分区枚举无重复值', () => {
  const vals = Object.values(DISTRICT);
  assert.equal(new Set(vals).size, vals.length);
  assert.ok(vals.length >= 18);
});
