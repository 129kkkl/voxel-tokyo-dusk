import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  snapAngle, bearing, polylineLength, resample, catmullRom, superEllipse,
  poissonDisk, polygonArea, polygonCentroid, pointInPolygon,
} from '../src/city/geom.js';
import { makeRng } from '../src/rng.js';

test('snapAngle 吸附到 7.5° 步进并归一到 (-180,180]', () => {
  assert.equal(snapAngle(7.6), 7.5);
  assert.equal(snapAngle(3.6), 3.75 * 0 + 0);       // <3.75 归 0
  assert.equal(snapAngle(-20), -22.5);
  assert.equal(snapAngle(355), -7.5);               // 越过 180 折回（355→352.5→-7.5）
  assert.equal(snapAngle(180), 180);
  assert.equal(snapAngle(-180), 180);
});

test('bearing 与 snapAngle 组合可做折线转角', () => {
  assert.equal(bearing(0, 0, 10, 0), 0);            // +x 为 0°
  assert.equal(bearing(0, 0, 0, 10), 90);           // +z 为 90°
  assert.ok(Math.abs(bearing(0, 0, 10, 10) - 45) < 1e-9);
});

test('polylineLength / resample', () => {
  const line = [[0, 0], [30, 0], [30, 40]];
  assert.ok(Math.abs(polylineLength(line) - 70) < 1e-9);
  const r = resample(line, 10);
  assert.ok(Math.abs(polylineLength(r) - 70) < 0.5);
  for (let i = 1; i < r.length; i++) {
    const d = Math.hypot(r[i][0] - r[i - 1][0], r[i][1] - r[i - 1][1]);
    assert.ok(d <= 10 + 1e-6, `步长超限 ${d}`);
  }
});

test('catmullRom 闭合曲线首尾不重复、且回到起点附近', () => {
  const square = [[-100, -100], [100, -100], [100, 100], [-100, 100]];
  const c = catmullRom(square, { closed: true, perSeg: 12 });
  assert.equal(c.length, 4 * 12);                    // 闭曲线不追加重复终点
  const d0 = Math.hypot(c[0][0] - c[c.length - 1][0], c[0][1] - c[c.length - 1][1]);
  assert.ok(d0 < 30, `未闭合: ${d0}`);
});

test('superEllipse 闭合、半径在谐波包络内、点数正确', () => {
  const pts = superEllipse(250, [[3, 0.055, 0.4], [5, 0.035, 1.1]], 72, 0);
  assert.equal(pts.length, 72);
  const rs = pts.map(([x, z]) => Math.hypot(x, z));
  assert.ok(Math.max(...rs) <= 250 * 1.095 + 1e-6);
  assert.ok(Math.min(...rs) >= 250 * 0.905 - 1e-6);
  assert.ok(Math.hypot(pts[0][0] - pts[71][0], pts[0][1] - pts[71][1]) < 100);
});

test('poissonDisk 满足最小间距、都在 inside 区域内、确定性', () => {
  const inBox = (x, z) => x >= -50 && x <= 50 && z >= -50 && z <= 50;
  const run = () => poissonDisk(-60, -60, 60, 60, 12, makeRng(5), inBox, 400);
  const a = run(), b = run();
  assert.deepEqual(a, b);
  assert.ok(a.length > 15, `样本太少 ${a.length}`);
  for (const [x, z] of a) assert.equal(inBox(x, z), true);
  for (let i = 0; i < a.length; i++)
    for (let j = i + 1; j < a.length; j++)
      assert.ok(Math.hypot(a[i][0] - a[j][0], a[i][1] - a[j][1]) >= 12 - 1e-6, '间距违规');
});

test('多边形面积/质心/内点判定（逆时针正面积）', () => {
  const sq = [[0, 0], [10, 0], [10, 10], [0, 10]];
  assert.ok(Math.abs(Math.abs(polygonArea(sq)) - 100) < 1e-6);
  const [cx, cz] = polygonCentroid(sq);
  assert.ok(Math.abs(cx - 5) < 1e-6 && Math.abs(cz - 5) < 1e-6);
  assert.equal(pointInPolygon(5, 5, sq), true);
  assert.equal(pointInPolygon(15, 5, sq), false);
  assert.equal(pointInPolygon(-1, 5, sq), false);
});
