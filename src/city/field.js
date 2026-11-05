/** 栅格城市场：类型/高度/道路归属/方向 四条 typed array（+ 被埋归属与每格道路等级）
 *  + 图元压印（规格 §5.2、§3）。 */
import { CFG, T } from './config.js';
import { resample } from './geom.js';

export class Field {
  constructor(half = CFG.HALF) {
    this.half = half;
    this.N = 2 * half + 1;
    const n = this.N * this.N;
    this.t = new Uint8Array(n);
    this.h = new Int8Array(n);
    this.roadId = new Int16Array(n).fill(-1);
    this.roadIdUnder = new Int16Array(n).fill(-1);
    this.dir = new Int8Array(n);
    this.blockId = new Int32Array(n).fill(-1);
    // 每格的归属道路等级（0 = 不属于任何路）。压印闸门的唯一依据：
    // 格子类型看不出 SIDEWALK/MEDIAN 属于哪条路，故把等级显式记在格上（Task 8 Step 0）。
    this.cellRank = new Uint8Array(n);
  }
  idx(x, z) { return (x + this.half) * this.N + (z + this.half); }
  inb(x, z) {
    return x >= -this.half && x <= this.half && z >= -this.half && z <= this.half;
  }
  at(x, z) {
    if (!this.inb(x, z)) return null;
    const i = this.idx(x, z);
    return { t: this.t[i], h: this.h[i], roadId: this.roadId[i], dir: this.dir[i], blockId: this.blockId[i] };
  }
  setAt(x, z, o) {
    if (!this.inb(x, z)) return;
    const i = this.idx(x, z);
    if (o.t !== undefined) this.t[i] = o.t;
    if (o.h !== undefined) this.h[i] = o.h;
    if (o.roadId !== undefined) this.roadId[i] = o.roadId;
    if (o.dir !== undefined) this.dir[i] = o.dir;
    if (o.blockId !== undefined) this.blockId[i] = o.blockId;
  }
  fill(fn) {
    for (let x = -this.half; x <= this.half; x++)
      for (let z = -this.half; z <= this.half; z++) this.setAt(x, z, fn(x, z));
  }
  countIf(pred) {
    let c = 0;
    for (let x = -this.half; x <= this.half; x++)
      for (let z = -this.half; z <= this.half; z++) if (pred(this.at(x, z), x, z)) c++;
    return c;
  }

  /**
   * 折线法向铺带。o = {type, roadId, width, taper?, rank?, bands?, mode='over'|'only-if-block'}
   * taper = [起始全宽, 结束全宽]（格数，非半宽），用于河流渐宽（规格 §7.1）。
   * rank = 本次压印者的道路等级（缺省按 type 推）；格的 cellRank 更高 → 整格跳过。
   * bands = {road, walk, median, width}：一次压印同时画出车行道 + 人行道 +（可选）中央带，
   *   width 为**全幅宽**，车行格数 = width - 2*walk（规格 §5.5 的「宽度含人行道」）。
   *   有了 bands 就不必先铺全宽再缩窄——三步法会让 SIDEWALK 带绕过等级闸门（评审 F1）。
   * mode='only-if-block' 时一律改写为 T.BLOCK_ALLEY，忽略 o.type（小巷语义）。
   */
  stampRibbon(pts, o) {
    const bands = o.bands || null;
    // type/width 缺省时回落到 bands 的全幅定义：bands 已经把路面类型与宽度都带上了，
    // 少传一个就静默铺出 0 格（Math.round(undefined) = NaN），故在这里兜住。
    const type = o.type !== undefined ? o.type : (bands ? bands.road : undefined);
    const width = o.width !== undefined ? o.width : (bands ? bands.width : 1);
    const { roadId } = o;
    const mode = o.mode || 'over';
    const rank = o.rank === undefined ? roadRank(type) : o.rank;
    // 车行格数：全宽扣掉两侧人行道。bands.walk 大于 (width-1)/2 时至少留 1 格路面。
    const car = bands ? Math.max(1, bands.width - 2 * (bands.walk | 0)) : 0;
    const dense = resample(pts, 0.4);
    const total = dense.length - 1 || 1;
    for (let s = 0; s < dense.length; s++) {
      const p = dense[s];
      const q = dense[Math.min(s + 1, dense.length - 1)];
      const r = dense[Math.max(s - 1, 0)];
      let dx = q[0] - r[0], dz = q[1] - r[1];
      const L = Math.hypot(dx, dz) || 1;
      dx /= L; dz /= L;
      const fw = o.taper ? o.taper[0] + (o.taper[1] - o.taper[0]) * (s / total) : width;
      // 精确铺出 n 格：偶数宽度不可能关于整数中心对称，故按半格偏移取不对称区间。
      // n=7 → -3..3；n=6 → -2..3；n=4 → -1..2；n=9 → -4..4。
      // 用 ceil(half) 的对称写法会让 §5.5 的偶数等级（4/6/8）各多铺 1 格。
      const n = Math.max(1, Math.round(fw));
      const lo = -Math.floor((n - 1) / 2), hi = Math.floor(n / 2);
      const dirQ = qDir(dx, dz);
      const px = -dz, pz = dx;                       // 水平法向
      for (let w = lo; w <= hi; w++) {
        const x = Math.round(p[0] + px * w), z = Math.round(p[1] + pz * w);
        if (!this.inb(x, z)) continue;
        const i = this.idx(x, z);
        if (mode === 'only-if-block') {              // 小巷：非破坏性（规格 §5.2）
          if (this.t[i] !== T.BLOCK) continue;
          this.t[i] = T.BLOCK_ALLEY;
          continue;
        }
        // 带内序号：外排 walk 格是人行道，中间 car 格是路面，路面中心一列可为中央带。
        let t2 = type;
        if (bands) {
          const k = w - lo;
          t2 = (k < bands.walk || k >= bands.walk + car) ? T.SIDEWALK
            : (bands.median && w === 0) ? T.MEDIAN : bands.road;
        }
        // 等级闸门：格的实际归属等级高于本次压印者 → 整格跳过（含 SIDEWALK/MEDIAN 带）。
        // 闸门看 cellRank 而不看 t[i]，否则低等级路的人行道带能降级高等级路的边缘路面格。
        if (rank) {
          if (this.cellRank[i] > rank) continue;
          if (this.cellRank[i] < rank && this.roadId[i] >= 0) {
            this.roadIdUnder[i] = this.roadId[i];    // 被压掉的原等级 id 记下来
          }
        }
        this.t[i] = t2;
        if (roadId !== undefined) this.roadId[i] = roadId;
        if (rank) this.cellRank[i] = rank;
        this.dir[i] = dirQ;
      }
    }
  }

  stampDisc(x, z, rad, o) {
    // 只做默认 'over' 语义：小巷由 stampRibbon 的 only-if-block 负责（规格 §5.4）。
    // 曾在这里加 only-if-block 分支——它无法与 stampRibbon 同语义（圆盘没有折线参考系），
    // 留着就是一个静默的语义陷阱，故删。没有调用方传 mode。
    const mode = 'over';
    for (let a = -Math.ceil(rad); a <= Math.ceil(rad); a++)
      for (let b = -Math.ceil(rad); b <= Math.ceil(rad); b++) {
        if (Math.hypot(a, b) > rad) continue;
        const xx = Math.round(x + a), zz = Math.round(z + b);
        if (!this.inb(xx, zz)) continue;
        const i = this.idx(xx, zz);
        if (mode === 'only-if-block' && this.t[i] !== T.BLOCK) continue;
        this.t[i] = o.type;
        if (o.roadId !== undefined) this.roadId[i] = o.roadId;
        if (o.dir !== undefined) this.dir[i] = o.dir;
      }
  }

  /** 4 邻域连通域标记（规格 §8.1）。accept(t) 判定是否属于本连通域。 */
  connectedComponents(accept) {
    const seen = new Uint8Array(this.N * this.N);
    const out = [];
    const stack = new Int32Array(this.N * this.N);
    for (let x = -this.half; x <= this.half; x++) {
      for (let z = -this.half; z <= this.half; z++) {
        const i0 = this.idx(x, z);
        if (seen[i0] || !accept(this.t[i0])) continue;
        let sp = 0, n = 0, x0 = x, x1 = x, z0 = z, z1 = z, sx = 0, sz = 0;
        stack[sp++] = i0; seen[i0] = 1;
        const cells = [];
        while (sp > 0) {
          const i = stack[--sp];
          const cx = Math.floor(i / this.N) - this.half;
          const cz = (i % this.N) - this.half;
          cells.push(i); n++;
          sx += cx; sz += cz;
          if (cx < x0) x0 = cx; if (cx > x1) x1 = cx;
          if (cz < z0) z0 = cz; if (cz > z1) z1 = cz;
          for (const [ax, az] of [[cx + 1, cz], [cx - 1, cz], [cx, cz + 1], [cx, cz - 1]]) {
            if (!this.inb(ax, az)) continue;
            const j = this.idx(ax, az);
            if (seen[j] || !accept(this.t[j])) continue;
            seen[j] = 1; stack[sp++] = j;
          }
        }
        out.push({ cells: Int32Array.from(cells), area: n, bbox: [x0, z0, x1, z1], centroid: [sx / n, sz / n] });
      }
    }
    return out;
  }

  /** 多源 BFS = 离散 Voronoi（规格 §5.3）。inRegion(x,z) 界定区域。 */
  multiSourceBFS(seeds, inRegion) {
    const label = new Int32Array(this.N * this.N).fill(-1);
    const sizes = new Int32Array(seeds.length);
    const queue = new Int32Array(this.N * this.N);
    let qh = 0, qt = 0;
    seeds.forEach(([sx, sz], s) => {
      if (!this.inb(sx, sz) || !inRegion(sx, sz)) return;
      const i = this.idx(sx, sz);
      if (label[i] >= 0) return;                   // 种子重合，后者被丢弃
      label[i] = s; sizes[s]++; queue[qt++] = i;
    });
    while (qh < qt) {
      const i = queue[qh++];
      const cx = Math.floor(i / this.N) - this.half;
      const cz = (i % this.N) - this.half;
      const s = label[i];
      for (const [ax, az] of [[cx + 1, cz], [cx - 1, cz], [cx, cz + 1], [cx, cz - 1]]) {
        if (!this.inb(ax, az) || !inRegion(ax, az)) continue;
        const j = this.idx(ax, az);
        if (label[j] >= 0) continue;
        label[j] = s; sizes[s]++; queue[qt++] = j;
      }
    }
    return { label, sizes };
  }

  /** 二值掩码上的最大轴对齐内接矩形（规格 §10.4）。ok(x,z) 判定格是否可用。 */
  maxRectInMask(x0, z0, x1, z1, ok) {
    const W = x1 - x0 + 1, Hh = z1 - z0 + 1;
    if (W <= 0 || Hh <= 0) return null;
    const hgt = new Int32Array(W);
    const st = new Int32Array(W + 1);
    let best = null;
    for (let z = 0; z < Hh; z++) {
      for (let x = 0; x < W; x++) hgt[x] = ok(x0 + x, z0 + z) ? hgt[x] + 1 : 0;
      // 单调栈求该直方图最大矩形
      let sp = 0;
      for (let x = 0; x <= W; x++) {
        const cur = x === W ? -1 : hgt[x];
        while (sp > 0 && cur < hgt[st[sp - 1]]) {
          const hh = hgt[st[--sp]];
          const left = sp === 0 ? 0 : st[sp - 1] + 1;
          const right = x - 1;
          const area = hh * (right - left + 1);
          // area > 0 必需：全零直方图（掩码无可行格）也会弹出高度 0 的条目，
          // 少了这个守卫就会返回一个 area:0 的假矩形，而不是 null
          if (area > 0 && (!best || area > best.area)) {
            best = { x0: x0 + left, z0: z0 + z - hh + 1, x1: x0 + right, z1: z0 + z, area };
          }
        }
        st[sp++] = x;
      }
    }
    return best;
  }
}

/** 道路等级序：数值大 = 等级高，压印时高覆低（规格 §5.2） */
function roadRank(t) {
  switch (t) {
    case T.ROAD_MINOR: return 1;
    case T.ROAD_ARTERIAL: return 2;
    case T.ROAD_RADIAL: return 3;
    case T.ROAD_RING: return 4;
    default: return 0;
  }
}

/** 方向向量 → 7.5° 量化索引 0..47 */
function qDir(dx, dz) {
  const deg = Math.atan2(dz, dx) * 180 / Math.PI;
  return ((Math.round(deg / 7.5) % 48) + 48) % 48;
}
