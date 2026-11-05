/** 城市模型的全部常量。规格 §1/§5.5/§9/§13。改布局只改这里。 */

export const CFG = {
  SEED: 20260919,
  HALF: 544,
  N: 1089,
  ANGLE_STEP: 7.5,          // 48 方向集
  RAIL_R: 250,
  RING_R: 330,
  INNER_R: 175,
  RADIAL_R0: 36,
  RADIAL_R1: 500,
  RAIL_SPUR_R: 520,           // §5.1.6：放射铁路支线到城市边缘的半径
  VORONOI: true,            // 规格 §16：关掉退回纯折线次级网
  /**
   * 撒点最小间距：为把街区数推进 1100~1600，实测收到 18 / 36
   * （brief 42/56 过疏；36/62 时街区仅 ~366）。MINOR_DELETE_P=0.2 压道路格占比。
   */
  INNER_DMIN: 18,
  OUTER_DMIN: 36,
  LLOYD_ITERS: 3,
  MINOR_DELETE_P: 0.2,      // U2 试过 0.28：secondary 压力档判别力断言翻车，回退 0.2
  SLIVER_AREA: 180,         // 碎块吸收阈值（规格 §8.3，U2 收紧到 180 → 碎块只做口袋绿地）
  MIN_PLOT_SIDE: 4,         // 规格 §10：小于此边长不出地块
  ALLEY_MIN_AREA: 900,
  ALLEY_DEPTH: 15,
};

/** 格子类型。ROAD_* 必须连续，isRoad 依赖此不变量。 */
export const T = {
  OUTSIDE: 0,
  BLOCK: 1,
  ROAD_RING: 2, ROAD_RADIAL: 3, ROAD_ARTERIAL: 4, ROAD_MINOR: 5,
  SIDEWALK: 6, MEDIAN: 7,
  RAIL: 8,
  WATER: 9, SEA: 10, QUAY: 11, RECLAIM: 12, RECLAIMED: 13,
  BLOCK_ALLEY: 14, PLOT_FREE: 15, POCKET: 16,
  BRIDGE: 17, PLOT_USE: 18,
};

export const isRoad = (t) => t >= T.ROAD_RING && t <= T.ROAD_MINOR;
/**
 * 道路等级序：数值大 = 等级高。压印闸门按「格的实际归属等级」判，不按格子类型判——
 * SIDEWALK / MEDIAN 不在 ROAD_* 连续段里，用 isRoad 做门会让低等级路的人行道带
 * 覆盖高等级路的外排路面格并把 roadId 抢走（评审 F1 的同类漏洞）。
 * SIDEWALK/MEDIAN 的等级跟其所属路一致，由 stampRibbon 写入 cellRank。
 * RAIL 也占一格等级且高于一切道路：轨道是 P2 的既有构筑物，规格 §5.1 的因果就是
 * 「路沿站长大」，路可以横穿它（7 处路口），但不能沿着它把它擦掉——不带 rank 时
 * 实测 P4 的区界带吃掉了 58% 的轨道格（10676 → 4849）。
 */
export const ROAD_RANK = { MINOR: 1, ARTERIAL: 2, RADIAL: 3, RING: 4, RAIL: 5 };
/**
 * 水域判定含 BRIDGE：桥格是「架在水上的路面」，桥下就是水（规格 §7.3「桥下格保持 WATER」的
 * 单高度场表达——格类型记桥面 deck，连通性/护岸等水域语义照常覆盖桥格）。
 * 对 applyWater 之前的所有阶段零影响：场上不存在 BRIDGE 格时本函数行为与原定义逐点一致。
 */
export const isWater = (t) => t === T.WATER || t === T.SEA || t === T.BRIDGE;
/**
 * 不可建筑的格子类型（规格 §10.7 不变量 1）。
 * 刻意允许：BLOCK / PLOT_USE / PLOT_FREE / QUAY / RECLAIM / RECLAIMED —— 突堤、护岸与
 * 埋立地都是要放工厂仓库的陆域（规格 §7.2）。
 * 刻意禁止：BRIDGE 与 POCKET —— 桥面不是用地；口袋公园只放树与长椅（规格 §8.3）。
 * 这两条若放进可建集，Task 16 的 claimFree 就能把房子摆上桥面或压掉小游园。
 */
export const isBlocked = (t) =>
  isRoad(t) || isWater(t) || t === T.SEA || t === T.RAIL
  || t === T.SIDEWALK || t === T.MEDIAN || t === T.BLOCK_ALLEY
  || t === T.OUTSIDE || t === T.BRIDGE || t === T.POCKET;

/** 道路等级：宽度含人行道（规格 §5.5）。lampGap = 路灯间距。 */
export const ROAD = {
  RING:     { t: T.ROAD_RING,     width: 9, walk: 2, median: true,  lampGap: 18, carOk: true, bridge: 'beam' },
  RADIAL:   { t: T.ROAD_RADIAL,   width: 8, walk: 2, median: true,  lampGap: 16, carOk: true, bridge: 'beam' },
  ARTERIAL: { t: T.ROAD_ARTERIAL, width: 6, walk: 1, median: false, lampGap: 14, carOk: true, bridge: 'small' },
  MINOR:    { t: T.ROAD_MINOR,    width: 4, walk: 1, median: false, lampGap: 22, carOk: true, bridge: 'small' },
};

export const DISTRICT = {
  CBD: 'cbd',
  SUB_CENTER: 'sub_center',
  STATION_FRONT: 'station_front',
  COMMERCIAL: 'commercial',
  ENTERTAINMENT: 'entertainment',
  ELECTRONICS: 'electronics',
  HIGH_RISE_RESI: 'high_rise_resi',
  LOW_RISE_RESI: 'low_rise_resi',
  TRADITIONAL: 'traditional',
  SCHOOL: 'school',
  HOSPITAL: 'hospital',
  PUBLIC: 'public',
  PARK_LARGE: 'park_large',
  PARK_SMALL: 'park_small',
  GREENWAY: 'greenway',
  PORT_INDUSTRY: 'port_industry',
  FREIGHT_YARD: 'freight_yard',
  UNIVERSITY: 'university',
  DANCHI: 'danchi',
  STADIUM: 'stadium',
  LANDMARK: 'landmark',
  NONE: 'none',
};

/** 地块用途（规格 §10.5） */
export const LOT = {
  HOUSE: 'lot_house', SHOP: 'lot_shop', TOWER: 'lot_tower',
  YARD: 'lot_yard', OPEN: 'lot_open',
};

/** 阶段 1 只用到的地面/水体基色（建筑配色在阶段 2）。规格 §11.1。 */
export const PALETTE = {
  asphaltRing: 0x33363a, asphaltRadial: 0x36393d, asphaltMinor: 0x3a3d41,
  median: 0x4a4e54, sidewalk: 0x8b8f95, wall: 0x7d7a72,
  markWhite: 0xd8dcd8, markYellow: 0xd9b83c,
  water: 0x2b4a5e, sea: 0x25404f, quay: 0x6b6f76, reclaim: 0x8f8d84,
  rail: 0x70757d,
};

export const idx = (x, z) => (x + CFG.HALF) * CFG.N + (z + CFG.HALF);
export const inb = (x, z) =>
  x >= -CFG.HALF && x <= CFG.HALF && z >= -CFG.HALF && z <= CFG.HALF;
