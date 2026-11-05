import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Field } from '../src/city/field.js';
import { CFG, T, isRoad, ROAD } from '../src/city/config.js';

const H = 60;                                  // 测试用小场，别跑 1089²

test('at/setAt 与越界', () => {
  const f = new Field(H);
  assert.equal(f.inb(H, 0), true);                  // 边界含端点：±half 都在场内
  assert.equal(f.inb(H + 1, 0), false);
  assert.equal(f.inb(-H - 1, 0), false);
  assert.equal(f.inb(-H, -H), true);
  assert.equal(f.at(H + 1, H + 1), null);           // 越界查询返回 null
  f.setAt(5, 5, { t: T.BLOCK, h: 3 });
  assert.equal(f.t[f.idx(5, 5)], T.BLOCK);
  assert.equal(f.at(5, 5).h, 3);
  assert.equal(f.at(5, 5).roadId, -1);
});

test('fill 覆盖全格', () => {
  const f = new Field(H);
  f.fill((x, z) => ({ t: (x + z) & 1 ? T.BLOCK : T.SIDEWALK }));
  // 121×121 棋盘：(x+z) 为奇数的格数 = 7320，偶数 = 7321
  assert.equal(f.countIf((c) => c.t === T.BLOCK), 7320);
  assert.equal(f.countIf((c) => isRoad(c.t) || c.t === T.SIDEWALK || c.t === T.BLOCK), 121 * 121);
});

test('stampRibbon 轴对齐直线：宽度正确、dir 正确、长度正确', () => {
  const f = new Field(H);
  f.stampRibbon([[-50, 0], [50, 0]], { type: T.ROAD_RADIAL, roadId: 7, width: 7 });
  const road = [];
  for (let x = -50; x <= 50; x++) for (let z = -50; z <= 50; z++)
    if (f.t[f.idx(x, z)] === T.ROAD_RADIAL) road.push([x, z]);
  // 宽 7 → 每列 7 格（z ∈ -3..3），101 列
  assert.equal(road.length, 101 * 7);
  const zs = new Set(road.filter(([x]) => x === 0).map(([, z]) => z));
  assert.equal(zs.size, 7);
  // dir：沿 +x 方向 → 0° → 量化为 0
  for (const [x, z] of road) assert.equal(f.dir[f.idx(x, z)], 0);
  for (const [x, z] of road) assert.equal(f.roadId[f.idx(x, z)], 7);
});

test('stampRibbon 斜线：吸附后每格仍连续（无空洞），且落在有限方向集上', () => {
  const f = new Field(H);
  const pts = [[-40, -40], [40, 20]];          // 约 26.6°，吸附到 30°
  f.stampRibbon(pts, { type: T.ROAD_MINOR, roadId: 3, width: 4 });
  const cells = [];
  for (let x = -H; x <= H; x++) for (let z = -H; z <= H; z++)
    if (f.t[f.idx(x, z)] === T.ROAD_MINOR) cells.push([x, z]);
  assert.ok(cells.length > 120, `路太短 ${cells.length}`);
  const dirs = new Set(cells.map(([x, z]) => f.dir[f.idx(x, z)]));
  for (const d of dirs) assert.ok(Number.isInteger(d) && d >= 0 && d < 48);
  // 无空洞：每个格的 8 邻域至少还有一个同类格
  const set = new Set(cells.map(([x, z]) => f.idx(x, z)));
  for (const [x, z] of cells) {
    let nb = 0;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      if (!a && !b) continue;
      if (f.inb(x + a, z + b) && set.has(f.idx(x + a, z + b))) nb++;
    }
    assert.ok(nb >= 2, `孤立路格 ${x},${z}`);
  }
});

test('stampRibbon mode=only-if-block 只改 BLOCK，且改写为 BLOCK_ALLEY', () => {
  const f = new Field(H);
  f.stampRibbon([[-50, 0], [50, 0]], { type: T.ROAD_RING, roadId: 1, width: 9 });
  f.setAt(-10, 20, { t: T.BLOCK });        // 小巷沿 x=-10 走（z∈10..30），BLOCK 要摆在它扫过的地方
  f.setAt(-11, 5, { t: T.BLOCK });         // 纵向超出折线范围，不应被刻
  f.setAt(0, 20, { t: T.BLOCK });          // 横向超出覆盖宽度，不应被刻
  f.stampRibbon([[-10, 10], [-10, 30]], { type: T.ROAD_MINOR, roadId: 2, width: 4, mode: 'only-if-block' });
  assert.equal(f.t[f.idx(0, 0)], T.ROAD_RING);              // 主干未被覆盖
  assert.equal(f.t[f.idx(-10, 20)], T.BLOCK_ALLEY);         // BLOCK 被刻成小巷
  assert.equal(f.t[f.idx(-11, 5)], T.BLOCK);                // z 范围外保持 BLOCK
  assert.equal(f.t[f.idx(0, 20)], T.BLOCK);                 // x 范围外保持 BLOCK
});

test('stampRibbon 等级优先：低等级不能把高等级路面降级（规格 §5.2）', () => {
  const f = new Field(H);
  f.stampRibbon([[-50, 0], [50, 0]], { type: T.ROAD_RING, roadId: 11, width: 9 });
  f.stampRibbon([[0, -30], [0, 30]], { type: T.ROAD_MINOR, roadId: 22, width: 4 });
  // 交叉处必须仍是环状主干，且 roadId 仍是主干的 id
  assert.equal(f.t[f.idx(0, 0)], T.ROAD_RING);
  assert.equal(f.roadId[f.idx(0, 0)], 11);
  // 反过来：高等级压过低等级时，被埋的 id 进 roadIdUnder
  const g = new Field(H);
  g.stampRibbon([[0, -30], [0, 30]], { type: T.ROAD_MINOR, roadId: 22, width: 4 });
  g.stampRibbon([[-50, 0], [50, 0]], { type: T.ROAD_RING, roadId: 11, width: 9 });
  assert.equal(g.t[g.idx(0, 0)], T.ROAD_RING);
  assert.equal(g.roadIdUnder[g.idx(0, 0)], 22);
});

test('等级闸门对人行道带同样生效：低等级路的人行道不能降级高等级路的边缘格', () => {
  const f = new Field(H);
  // ring 沿 x 走（z=0），width 9 → 覆盖 z ∈ -4..4，这些格 cellRank = 4
  f.stampRibbon([[-50, 0], [50, 0]], { type: T.ROAD_RING, roadId: 11, width: 9, rank: 4 });
  // minor 沿 z 走（x=0）。偶数宽度的带是不对称的（§5.5 裁定）：width 4 的带覆盖 x ∈ -2..1，
  // 所以交叉检验格取 x=-2 而非 x=+2 —— brief 写 +2 时那一格根本不在带内，断言不可满足。
  f.stampRibbon([[0, -30], [0, 30]], { type: T.ROAD_MINOR, roadId: 22, width: 4,
    bands: { road: T.ROAD_MINOR, walk: 4, median: 0, width: 4 }, rank: 1 });
  // (-2,20)：minor 的人行道带内、ring 全幅之外 → 写成 SIDEWALK 并归 minor
  assert.equal(f.t[f.idx(-2, 20)], T.SIDEWALK);
  assert.equal(f.roadId[f.idx(-2, 20)], 22);
  // (-2,4)：既在 minor 的覆盖内、又在 ring 的覆盖内 → ring 等级高，整格不动
  assert.equal(f.t[f.idx(-2, 4)], T.ROAD_RING);
  assert.equal(f.roadId[f.idx(-2, 4)], 11);
});

test('F1 真身：bands 压出的高等级人行道格不会被低等级路抢走 roadId', () => {
  const f = new Field(H);
  f.stampRibbon([[-50, 0], [50, 0]], { width: 9, roadId: 31, rank: 4,
    bands: { road: T.ROAD_RING, walk: 2, median: T.MEDIAN, width: 9 } });
  assert.equal(f.t[f.idx(-2, 3)], T.SIDEWALK);       // 环的外排人行道（isRoad 为 false）
  f.stampRibbon([[0, -20], [0, 20]], { width: 4, roadId: 41, rank: 1,
    bands: { road: T.ROAD_MINOR, walk: 1, median: 0, width: 4 } });
  // 旧闸门以 isRoad(格型) 为门，看不见 SIDEWALK → 这格的 roadId 会被 minor 抢走
  assert.equal(f.t[f.idx(-2, 3)], T.SIDEWALK);
  assert.equal(f.roadId[f.idx(-2, 3)], 31);
  assert.equal(f.cellRank[f.idx(-2, 3)], 4);
});

test('bands 单次压印：一条路一次画出路面+人行道+中央带，逐级符合规格 §5.5 的表', () => {
  const f = new Field(H);
  f.stampRibbon([[-50, 0], [50, 0]], { type: T.ROAD_ARTERIAL, roadId: 5, width: 6,
    bands: { road: T.ROAD_ARTERIAL, walk: 1, median: 0, width: 6 }, rank: 2 });
  const col = [];
  for (let z = -8; z <= 8; z++) col.push(f.t[f.idx(0, z)]);
  // §5.5：ARTERIAL 全幅 6 = 车行 4 + 人行道 1×2。brief 断言的「6 格路面 + 2 格人行道」
  // 需要铺 8 格，而 width 6 的带最多只有 6 格（n = round(width)），算术上不可能。
  assert.equal(col.filter((t) => t === T.ROAD_ARTERIAL).length, 4);
  assert.equal(col.filter((t) => t === T.SIDEWALK).length, 2);
  assert.equal(col.filter((t) => t !== 0).length, 6);          // 恰好全幅 6 格
  // 其余等级同表：RING 9 = 车行 5（含 1 格中央带）+ 人行道 2×2；MINOR 4 = 车行 2 + 1×2
  const cross = (cls) => {
    const cfg = ROAD[cls], g = new Field(H);
    g.stampRibbon([[-50, 0], [50, 0]], { width: cfg.width, roadId: 1, rank: 4,
      bands: { road: cfg.t, walk: cfg.walk, median: cfg.median ? T.MEDIAN : 0, width: cfg.width } });
    const c = [];
    for (let z = -8; z <= 8; z++) c.push(g.t[g.idx(0, z)]);
    return c.filter((t) => t === cfg.t).length + c.filter((t) => t === T.MEDIAN).length
      + c.filter((t) => t === T.SIDEWALK).length;
  };
  assert.equal(cross('RING'), 9);
  assert.equal(cross('RADIAL'), 8);
  assert.equal(cross('MINOR'), 4);
});

test('stampRibbon taper：宽度随 t 单调变化', () => {
  const f = new Field(H);
  f.stampRibbon([[-55, 0], [55, 0]], { type: T.ROAD_ARTERIAL, roadId: 4, width: 6, taper: [3, 11] });
  const wAt = (x) => {
    let n = 0;
    for (let z = -H; z <= H; z++) if (f.t[f.idx(x, z)] === T.ROAD_ARTERIAL) n++;
    return n;
  };
  assert.ok(wAt(-50) < wAt(50), '未渐宽');
  assert.ok(Math.abs(wAt(-50) - 3) <= 1);
  assert.ok(Math.abs(wAt(50) - 11) <= 1);
});

test('stampDisc 半径正确且写入 roadId', () => {
  const f = new Field(H);
  f.stampDisc(0, 0, 5, { type: T.ROAD_RING, roadId: 9 });
  assert.equal(f.t[f.idx(4, 0)], T.ROAD_RING);
  assert.equal(f.t[f.idx(5, 0)], T.ROAD_RING);
  assert.notEqual(f.t[f.idx(0, 6)], T.ROAD_RING);
  assert.equal(f.roadId[f.idx(3, 3)], 9);
});
