/** 中央地标：仿东京塔的体素高塔（约 100 单位高，橙白航空涂装，橙色段夜间发光） */
const ORANGE = 0xff8c2e;
const WHITE = 0xe8e4da;
const DECK = 0xdcd6c8;

const isOrange = (y) => ((y / 10) | 0) % 2 === 0;

/** 矩形周边一圈发光窗 */
function perimeterGlow(vox, cx, y, cz, w, d, color) {
  const hw = w / 2 + 0.5, hd = d / 2 + 0.5;
  for (let x = -w / 2 + 0.5; x <= w / 2 - 0.5; x += 1) {
    vox.add(cx + x, y, cz + hd, color, true);
    vox.add(cx + x, y, cz - hd, color, true);
  }
  for (let z = -d / 2 + 0.5; z <= d / 2 - 0.5; z += 1) {
    vox.add(cx + hw, y, cz + z, color, true);
    vox.add(cx - hw, y, cz + z, color, true);
  }
}

/** 一个高度段的桁架：四根 2×2 塔腿 + 环梁 + 阶梯斜撑 */
function latticeSection(vox, cx, cz, y0, y1, halfAt, beamStep) {
  let cell = 0;
  for (let y = y0; y <= y1; y++) {
    const half = halfAt(y);
    const orange = isOrange(y);
    const col = orange ? ORANGE : WHITE;
    for (const sx of [1, -1]) {
      for (const sz of [1, -1]) {
        vox.add(cx + sx * half, y, cz + sz * half, col, orange);
        vox.add(cx + sx * (half - 1), y, cz + sz * half, col, orange);
        vox.add(cx + sx * half, y, cz + sz * (half - 1), col, orange);
        vox.add(cx + sx * (half - 1), y, cz + sz * (half - 1), col, orange);
      }
    }
    const inCell = (y - y0) % beamStep;
    if (inCell === 0) {
      // 环梁
      vox.box(cx - half, y, cz - half, cx + half, y, cz - half, col, orange);
      vox.box(cx - half, y, cz + half, cx + half, y, cz + half, col, orange);
      vox.box(cx - half, y, cz - half, cx - half, y, cz + half, col, orange);
      vox.box(cx + half, y, cz - half, cx + half, y, cz + half, col, orange);
      if (y > y0) cell++;
    } else if (half >= 3) {
      // 阶梯斜撑：沿侧面逐层平移，相邻格方向交替
      const k = inCell / beamStep;
      const zz = Math.round((cell % 2 === 0 ? -1 + 2 * k : 1 - 2 * k) * (half - 1));
      vox.add(cx + half, y, cz + zz, col, orange);
      vox.add(cx - half, y, cz - zz, col, orange);
      vox.add(cx + zz, y, cz + half, col, orange);
      vox.add(cx - zz, y, cz - half, col, orange);
    }
  }
}

export function buildTower(vox) {
  const cx = 0, cz = 0;

  // 底部裙楼 FootTown（五层展馆基座）
  vox.boxC(cx, 2.5, cz, 16, 5, 16, 0xcfc9ba);
  vox.boxC(cx, 5.3, cz, 17, 0.6, 17, 0xb5afa0);
  for (let i = -6; i <= 6; i += 2) {
    for (const y of [1.5, 3.5]) {
      vox.add(cx + i, y, cz + 8.5, 0xffd98a, true);
      vox.add(cx + i, y, cz - 8.5, 0xffd98a, true);
      vox.add(cx + 8.5, y, cz + i, 0xffd98a, true);
      vox.add(cx - 8.5, y, cz + i, 0xffd98a, true);
    }
  }
  // 裙楼入口雨棚
  vox.boxC(cx, 3.2, cz + 9, 6, 0.5, 2, 0x8a4040);
  vox.boxC(cx, 3.2, cz - 9, 6, 0.5, 2, 0x8a4040);

  // 下部塔身 y6..36：half 9 → 4
  latticeSection(vox, cx, cz, 6, 36, (y) => Math.round(9 - (5 * (y - 6)) / 30), 5);

  // 大展望台
  vox.boxC(cx, 37, cz, 15, 1.4, 15, ORANGE, true);
  vox.boxC(cx, 39, cz, 13, 3, 13, DECK);
  perimeterGlow(vox, cx, 39, cz, 13, 13, 0xffe1a0);
  vox.boxC(cx, 41, cz, 14, 0.7, 14, WHITE);
  vox.boxC(cx, 41.8, cz, 10, 0.9, 10, ORANGE, true);

  // 上部塔身 y42..74：half 4 → 1
  latticeSection(vox, cx, cz, 42, 74, (y) => Math.max(1, Math.round(4 - (3 * (y - 42)) / 32)), 6);

  // 顶部展望台
  vox.boxC(cx, 67.5, cz, 10, 1.2, 10, ORANGE, true);
  vox.boxC(cx, 69.3, cz, 8, 3, 8, DECK);
  perimeterGlow(vox, cx, 69.3, cz, 8, 8, 0xffe1a0);
  vox.boxC(cx, 71.4, cz, 9, 0.7, 9, WHITE);

  // 天线桅杆（红白相间，顶端红光由 main.js 中的闪烁信标覆盖）
  for (let y = 75; y <= 98; y++) {
    vox.add(cx, y, cz, y % 4 < 2 ? 0xd8352a : WHITE, y >= 93);
  }
  vox.add(cx, 90, cz, 0xff3b30, true); // 中段障碍灯
  return { tipY: 99.5 };
}
