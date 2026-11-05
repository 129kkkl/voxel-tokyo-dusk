/** 折线与多边形工具（规格 §5）。纯函数、无 three 依赖。角度单位：度，方位角以 +x 为 0、+z 为 90。 */
import { CFG } from './config.js';

const D2R = Math.PI / 180;

/** 折回 (-180, 180] */
export function wrap180(a) {
  let x = ((a + 180) % 360 + 360) % 360 - 180;
  return x === -180 ? 180 : x;
}

/** 吸附到 CFG.ANGLE_STEP 的整数倍 */
export function snapAngle(deg) {
  return wrap180(Math.round(deg / CFG.ANGLE_STEP) * CFG.ANGLE_STEP);
}

export function bearing(x0, z0, x1, z1) {
  return Math.atan2(z1 - z0, x1 - x0) / D2R;
}

export function polylineLength(pts) {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return s;
}

/** 等步长重采样（保留原始端点，闭合性由调用方决定） */
export function resample(pts, step) {
  const out = [[pts[0][0], pts[0][1]]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const [x0, z0] = pts[i - 1], [x1, z1] = pts[i];
    const seg = Math.hypot(x1 - x0, z1 - z0);
    if (seg < 1e-9) continue;
    const ux = (x1 - x0) / seg, uz = (z1 - z0) / seg;
    let d = step - carry;
    while (d <= seg) {
      out.push([x0 + ux * d, z0 + uz * d]);
      d += step;
    }
    carry = seg - (d - step);
  }
  const last = pts[pts.length - 1], tail = out[out.length - 1];
  if (Math.hypot(last[0] - tail[0], last[1] - tail[1]) > 1e-6) out.push([last[0], last[1]]);
  return out;
}

/** centripetal Catmull-Rom。closed=true 时返回 count*perSeg 个点且不重复首点。 */
export function catmullRom(pts, { closed = false, perSeg = 8 } = {}) {
  const P = pts.map(p => [p[0], p[1]]);
  const n = P.length;
  const at = (i) => closed ? P[(i + n) % n] : P[Math.min(Math.max(i, 0), n - 1)];
  const out = [];
  const segs = closed ? n : n - 1;
  for (let s = 0; s < segs; s++) {
    const p0 = at(s - 1), p1 = at(s), p2 = at(s + 1), p3 = at(s + 2);
    const alpha = (a, b) => Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1]), 0.5);
    const t0 = 0, t1 = t0 + alpha(p0, p1), t2 = t1 + alpha(p1, p2), t3 = t2 + alpha(p2, p3);
    for (let k = 0; k < perSeg; k++) {
      const t = t1 + (t2 - t1) * (k / perSeg);
      // 开放曲线首末段的幻影点就是端点本身（p0===p1 / p2===p3），弧长参数退化（t0===t1 /
      // t2===t3）时 a1/a3 的插值分母为 0，插值点就在端点上，直接取端点——否则首末段整段
      // 吐出 NaN（Task 11 之前 catmullRom 只有闭合曲线调用方，从未踩到）。
      const a1x = t1 === t0 ? p1[0] : (t1 - t) / (t1 - t0) * p0[0] + (t - t0) / (t1 - t0) * p1[0];
      const a1z = t1 === t0 ? p1[1] : (t1 - t) / (t1 - t0) * p0[1] + (t - t0) / (t1 - t0) * p1[1];
      const a2x = (t2 - t) / (t2 - t1) * p1[0] + (t - t1) / (t2 - t1) * p2[0];
      const a2z = (t2 - t) / (t2 - t1) * p1[1] + (t - t1) / (t2 - t1) * p2[1];
      const a3x = t3 === t2 ? p2[0] : (t3 - t) / (t3 - t2) * p2[0] + (t - t2) / (t3 - t2) * p3[0];
      const a3z = t3 === t2 ? p2[1] : (t3 - t) / (t3 - t2) * p2[1] + (t - t2) / (t3 - t2) * p3[1];
      const q1x = (t2 - t) / (t2 - t0) * a1x + (t - t0) / (t2 - t0) * a2x;
      const q1z = (t2 - t) / (t2 - t0) * a1z + (t - t0) / (t2 - t0) * a2z;
      const q2x = (t3 - t) / (t3 - t1) * a2x + (t - t1) / (t3 - t1) * a3x;
      const q2z = (t3 - t) / (t3 - t1) * a2z + (t - t1) / (t3 - t1) * a3z;
      out.push([
        (t2 - t) / (t2 - t1) * q1x + (t - t1) / (t2 - t1) * q2x,
        (t2 - t) / (t2 - t1) * q1z + (t - t1) / (t2 - t1) * q2z,
      ]);
    }
  }
  if (!closed) out.push([P[n - 1][0], P[n - 1][1]]);
  return out;
}

/**
 * 闭合近圆：r(θ) = r0 * (1 + Σ aᵢ·sin(kᵢθ + φᵢ))（规格 §5.1.1/§5.1.4）
 * @param harmonics [[k, amp, phase], ...]
 */
export function superEllipse(r0, harmonics, count, phase0 = 0) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const th = phase0 + (i / count) * Math.PI * 2;
    let r = 1;
    for (const [k, a, ph] of harmonics) r += a * Math.sin(k * th + ph);
    r *= r0;
    out.push([Math.cos(th) * r, Math.sin(th) * r]);
  }
  return out;
}

/** 网格加速的 Poisson 盘撒点（Bridson 的简化变体，确定性）。
 *  先取整再做 inside/far 判定——若先判后取整，返回的点间距可小于 minDist。 */
export function poissonDisk(x0, z0, x1, z1, minDist, rng, inside, target) {
  const pts = [];
  const cell = minDist / Math.SQRT2;
  const grid = new Map();
  const key = (gx, gz) => gx * 100003 + gz;
  const far = (x, z) => {
    const gx = Math.floor((x - x0) / cell), gz = Math.floor((z - z0) / cell);
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
      const q = grid.get(key(gx + a, gz + b));
      if (!q) continue;
      for (const [px, pz] of q) if (Math.hypot(x - px, z - pz) < minDist) return false;
    }
    return true;
  };
  let tries = target * 60;
  while (pts.length < target && tries-- > 0) {
    const x = Math.round(x0 + rng() * (x1 - x0));
    const z = Math.round(z0 + rng() * (z1 - z0));
    if (!inside(x, z) || !far(x, z)) continue;
    pts.push([x, z]);
    const gx = Math.floor((x - x0) / cell), gz = Math.floor((z - z0) / cell);
    const k = key(gx, gz);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push([x, z]);
  }
  return pts;
}

export function polygonArea(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

export function polygonCentroid(pts) {
  let a = 0, cx = 0, cz = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    const f = p[0] * q[1] - q[0] * p[1];
    a += f; cx += (p[0] + q[0]) * f; cz += (p[1] + q[1]) * f;
  }
  if (Math.abs(a) < 1e-9) {
    let sx = 0, sz = 0;
    for (const p of pts) { sx += p[0]; sz += p[1]; }
    return [sx / pts.length, sz / pts.length];
  }
  a *= 3;
  return [cx / a, cz / a];
}

export function pointInPolygon(x, z, poly) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) hit = !hit;
  }
  return hit;
}
