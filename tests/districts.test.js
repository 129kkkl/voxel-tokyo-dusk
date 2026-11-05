import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignDistricts, QUOTA } from '../src/city/districts.js';
import { fullPipeline } from './helpers.js';
import { DISTRICT, CFG, T } from '../src/city/config.js';

function setup() {
  const p = fullPipeline();
  const anchors = assignDistricts(p.blocks, p);
  return { ...p, anchors };
}

const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length;

test('每个街区都有分区，且值合法', () => {
  const { blocks } = setup();
  const legal = new Set(Object.values(DISTRICT));
  for (const b of blocks) assert.ok(legal.has(b.district), `街区 ${b.id} 分区非法: ${b.district}`);
});

test('配额达标：每类设施的块数不低于 QUOTA', () => {
  const { blocks } = setup();
  const count = (d) => blocks.filter((b) => b.district === d).length;
  for (const [d, n] of Object.entries(QUOTA)) {
    assert.ok(count(d) >= n, `${d} 期望 ≥${n} 实得 ${count(d)}`);
    assert.ok(count(d) <= n + 8, `${d} 超出配额：${count(d)} vs ${n}`);
  }
});

test('副都心至少 4 处、方位分散、且都贴着轨道环', () => {
  const { blocks } = setup();
  const subs = blocks.filter((b) => b.district === DISTRICT.SUB_CENTER).map((b) => b.centroid);
  assert.ok(subs.length >= 4, `副都心仅 ${subs.length} 块`);
  const buckets = new Set();
  for (const [x, z] of subs) {
    let deg = Math.atan2(z, x) * 180 / Math.PI; if (deg < 0) deg += 360;
    buckets.add(Math.floor(deg / 30));
    const d = Math.abs(Math.hypot(x, z) - CFG.RAIL_R);
    assert.ok(d < 130, `副都心离轨道环 ${d} > 130`);
  }
  assert.ok(buckets.size >= 4, `副都心只分布在 ${buckets.size} 个 30° 方位桶`);
});

test('CBD 紧邻 main 站且面积大', () => {
  const { blocks, anchors } = setup();
  const cbd = blocks.filter((b) => b.district === DISTRICT.CBD);
  assert.ok(cbd.length >= 3, `CBD 仅 ${cbd.length} 块`);
  for (const b of cbd) {
    const d = Math.hypot(b.centroid[0] - anchors.railMainStation.x, b.centroid[1] - anchors.railMainStation.z);
    assert.ok(d < 160, `CBD 块离 main 站 ${d}`);
  }
});

test('工业沿湾岸：PORT_INDUSTRY 全部邻接海或突堤', () => {
  const { f, blocks } = setup();
  const ports = blocks.filter((x) => x.district === DISTRICT.PORT_INDUSTRY);
  assert.ok(ports.length >= 1, '没有工业区块');
  for (const b of ports) {
    let nearSea = false;
    for (const i of b.cells) {
      const x = Math.floor(i / f.N) - f.half, z = (i % f.N) - f.half;
      for (let a = -3; a <= 3; a++) for (let c = -3; c <= 3; c++) {
        if (!f.inb(x + a, z + c)) continue;
        const t = f.t[f.idx(x + a, z + c)];
        if (t === T.SEA || t === T.QUAY) nearSea = true;
      }
    }
    assert.ok(nearSea, `工业区块 ${b.id} 不临海`);
  }
});

test('绿地成系统：大公园 / 小游园 / 河岸绿带', () => {
  const { blocks } = setup();
  const n = (d) => blocks.filter((b) => b.district === d).length;
  assert.equal(n(DISTRICT.PARK_LARGE), QUOTA[DISTRICT.PARK_LARGE]);
  assert.ok(n(DISTRICT.PARK_SMALL) >= 12, `小游园仅 ${n(DISTRICT.PARK_SMALL)}`);
  assert.ok(n(DISTRICT.GREENWAY) >= 10, `河岸绿带仅 ${n(DISTRICT.GREENWAY)}`);
});

test('住宅由内而外从公寓塔楼渐变到町屋', () => {
  const { blocks } = setup();
  const r = (b) => Math.hypot(b.centroid[0], b.centroid[1]);
  const hi = blocks.filter((b) => b.district === DISTRICT.HIGH_RISE_RESI).map(r);
  const lo = blocks.filter((b) => b.district === DISTRICT.LOW_RISE_RESI).map(r);
  assert.ok(hi.length > 20 && lo.length > 100);
  assert.ok(avg(hi) < avg(lo), `塔楼带平均半径 ${avg(hi)} 未小于低层 ${avg(lo)}`);
});

test('anchors 全部有值且在城市内', () => {
  const { anchors } = setup();
  for (const [k, v] of Object.entries(anchors)) {
    assert.ok(v && Number.isFinite(v.x) && Number.isFinite(v.z), `锚点 ${k} 缺失`);
    assert.ok(Math.abs(v.x) <= CFG.HALF && Math.abs(v.z) <= CFG.HALF, `锚点 ${k} 越界`);
  }
});

test('确定性', () => {
  const a = setup(), b = setup();
  assert.deepEqual(a.blocks.map((x) => x.district), b.blocks.map((x) => x.district));
});
