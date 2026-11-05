import { test } from 'node:test';
import assert from 'node:assert/strict';
import { viewpoint, VIEW_NAMES, parseParams } from '../src/city/viewpoints.js';
import { buildCity } from '../src/city/query.js';

const CITY = buildCity();

test('六个验收机位 + plan 全部可用', () => {
  assert.deepEqual(VIEW_NAMES.slice().sort(),
    ['cbd', 'harbor', 'mainstreet', 'pano', 'plan', 'resi', 'station'].sort());
  for (const n of VIEW_NAMES) {
    const v = viewpoint(n, CITY);
    assert.ok(v, `${n} 无机位`);
    for (const k of ['position', 'target']) {
      assert.equal(v[k].length, 3);
      for (const c of v[k]) assert.ok(Number.isFinite(c), `${n}.${k} 非数`);
    }
    assert.ok(v.position[1] > 0, `${n} 相机在地面下`);
  }
});

test('机位由 CITY 锚点派生', () => {
  const mutated = {
    ...CITY,
    anchors: {
      ...CITY.anchors,
      greatPark: { x: 123, z: -456 },
      stationFront: { x: 55, z: -66 },
      portOffice: { x: 300, z: 300 },
      stadium: { x: -300, z: -100 },
      wharf: { x: 250, z: 250 },
    },
  };
  assert.notDeepEqual(viewpoint('resi', mutated).target, viewpoint('resi', CITY).target);
  assert.notDeepEqual(viewpoint('harbor', mutated).position, viewpoint('harbor', CITY).position);
});

test('街景机位低、航拍机位高', () => {
  assert.ok(viewpoint('pano', CITY).position[1] > 200);
  for (const n of ['cbd', 'mainstreet', 'resi', 'station']) {
    assert.ok(viewpoint(n, CITY).position[1] < 40, `${n} 不是街景高度`);
  }
});

test('街景机位落在道路上或足够高', () => {
  for (const n of ['cbd', 'mainstreet', 'resi', 'station']) {
    const [x, y, z] = viewpoint(n, CITY).position;
    const okRoad = CITY.isRoad(Math.round(x), Math.round(z)) || CITY.isSidewalk(Math.round(x), Math.round(z));
    assert.ok(okRoad || y > CITY.groundY(Math.round(x), Math.round(z)) + 2,
      `${n} 机位既不在路上也不够高`);
  }
});

test('parseParams 覆盖四种参数且不崩', () => {
  assert.deepEqual(parseParams('?plan=1&cam=cbd&debug=1&seed=42'),
    { plan: '1', debug: true, cam: 'cbd', seed: 42 });
  assert.deepEqual(parseParams(''), { plan: null, debug: false, cam: null, seed: null });
  assert.deepEqual(parseParams('?seed=abc'), { plan: null, debug: false, cam: null, seed: null });
});
