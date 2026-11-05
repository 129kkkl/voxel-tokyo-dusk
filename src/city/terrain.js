/** 高度场（规格 §6）。低频叠加：西高东低倾斜 + 台地边缘 + 两级值噪声。 */
import { CFG } from './config.js';

const LAT = 140, LON = 55;         // 两级噪声点阵
const A1 = 0.85, A2 = 0.35;        // 振幅（合成 ±1.2，承担规格「整体高度场振幅 2~4 体素」）
const TILT_A = 1.9;                // 西高东低的宏观倾斜幅值
const SCARP_AMP = 1.9, SCARP_W = 30;

/** 原始场的解析界：改任一振幅常量都会自动跟着变，不要写死数字。
 *  SCARP 是单侧抬升（0..SCARP_AMP，只垫西侧），所以它只进 RAW_MAX、不进 RAW_MIN；
 *  当成双侧算会让 level 1 在任何场尺寸上都恒为空。 */
export const RAW_MIN = -(TILT_A + A1 + A2);
export const RAW_MAX = +(TILT_A + SCARP_AMP + A1 + A2);

function lattice(size, rng) {
  const n = Math.ceil((2 * CFG.HALF) / size) + 3;
  const g = new Float32Array(n * n);
  for (let i = 0; i < g.length; i++) g[i] = rng() * 2 - 1;
  return { size, n, g };
}

function sampleLat(l, x, z) {
  const fx = (x + CFG.HALF) / l.size + 1, fz = (z + CFG.HALF) / l.size + 1;
  const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
  const at = (a, b) => l.g[a * l.n + b];
  const sx = tx * tx * (3 - 2 * tx), sz = tz * tz * (3 - 2 * tz);
  return (at(ix, iz) * (1 - sx) + at(ix + 1, iz) * sx) * (1 - sz)
       + (at(ix, iz + 1) * (1 - sx) + at(ix + 1, iz + 1) * sx) * sz;
}

function smoothstep(a, b, v) {
  const t = Math.min(Math.max((v - a) / (b - a || 1e-9), 0), 1);
  return t * t * (3 - 2 * t);
}

export function makeTerrain(rng) {
  const n1 = lattice(LAT, rng), n2 = lattice(LON, rng);
  const ph = rng() * Math.PI * 2;
  const scarpX = (z) => -70 + 45 * Math.sin(z / 160 + ph);
  const raw = (x, z) => {
    const tilt = -TILT_A * (x / CFG.HALF);
    const xb = scarpX(z);
    const scarp = SCARP_AMP * smoothstep(xb + SCARP_W, xb - SCARP_W, x);   // 西侧抬高
    return tilt + scarp + A1 * sampleLat(n1, x, z) + A2 * sampleLat(n2, x, z);
  };
  return { raw, scarpX, scarpWidth: SCARP_W };
}

/** 满窗线性映射到 1..7 六级（规格 §6.2 修订：不可用「振幅 + 固定偏移」，会把 60% 格子夹扁） */
export function quantize(v) {
  const t = (v - RAW_MIN) / (RAW_MAX - RAW_MIN);
  return Math.min(7, Math.max(1, Math.round(t * 6) + 1));
}

export function applyTerrain(field, terr) {
  for (let x = -field.half; x <= field.half; x++)
    for (let z = -field.half; z <= field.half; z++)
      field.h[field.idx(x, z)] = quantize(terr.raw(x, z));
}
