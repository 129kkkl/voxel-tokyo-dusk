/** Phase 1B 视觉配色唯一出口（黄昏写实密度）。 */

export const SKY = {
  top: 0x0b1026,
  mid: 0x1a2750,
  horizonWarm: 0xc47a3a,
  horizonMauve: 0x6b4a6e,
};

export const WINDOW = {
  warm: [0xffc27a, 0xffd98a, 0xffb36a],
  cool: [0x8ec8ff, 0xd8e8ff],
  warmBias: 0.7,
  dark: [0x1a2230, 0x222a3a, 0x2a3344],
  frame: 0x2a2e34,
};

export const WALL = {
  house: [0xe8e4da, 0xd9cfc0, 0xc4cdd4, 0xb8b0a4, 0xe0d6c8, 0xd4c4b0, 0xd0d4d8],
  shop: [0x9c8a78, 0x8a7a6a, 0x7e7468, 0xa89880, 0xb0a090],
  office: [0x6a6e78, 0x7a7e88, 0x5e6470, 0x8a8e98, 0x3d4148, 0x27344b, 0x2e3f4c],
  danchi: [0xc8c0b4, 0xb8b0a4, 0xa8aeb8, 0xd0c8b8],
  industrial: [0x5a5e66, 0x6a6e76, 0x4a5058],
  civic: [0xc4b8a4, 0xb0b4b8, 0xa8aeb8, 0xd4cfc4],
  shrine: [0x6a4a32, 0x8b3a2a, 0x5a4030],
};

export const ROOF = {
  house: [0x3f4750, 0x37424e, 0x54483f, 0x2f3a45, 0x4a4a55, 0x3a3f48],
  office: [0x4a4e54, 0x3a3e44],
  danchi: [0x4a4e54, 0x3f4750],
  industrial: [0x555a62, 0x4a5058],
  civic: [0x4a5048, 0x3f4750],
};

export const GROUND = {
  park: [0x3d6a38, 0x3f5c3a, 0x356332],
  dirt: 0x6f6a5e,
  lot: 0x4a4e48,
};

export const LANDMARK = {
  towerOrange: 0xff8c2e,
  towerWhite: 0xe8e4da,
  towerGlow: 0xff8a3c,
  skytreeBody: 0xc8d0d8,
  skytreeGlow: 0x4ac8ff,
  metroBody: 0xb0b4b8,
  metroWin: 0xffd27a,
  metroWinDark: 0x3a4050,
  beacon: 0xff3b30,
  shrineRoof: 0x8b3a2a,
  shrineWood: 0x6a4a32,
  torii: 0xc23a2a,
  stadium: 0x8a8e96,
  stadiumDark: 0x6a6e76,
};

export const NEON = {
  magenta: 0xff4fd8,
  cyan: 0x3fe8ff,
  purple: 0xb44fff,
  yellow: 0xffe14a,
  signWarm: 0xffb36a,
};

export const PROP = {
  lampPole: 0x4a4e54,
  lampHead: 0xffe0a0,
  wire: 0x2a2e34,
  vending: [0xd84a3a, 0x3a6ad8, 0xe8e4da],
  carBody: [0xc8c8d0, 0x3a4a6a, 0x8a3a3a, 0x2a2a2e, 0xd8d0c0],
  carLightF: 0xffe8a0,
  carLightR: 0xd83030,
  bus: 0x4a7a5a,
  cherry: 0xf0a0b8,
  treeTrunk: 0x5a4030,
  treeLeaf: [0x2f5d2a, 0x3a6b32, 0x2a5226],
  rail: 0x8a8e96,
  deck: 0x5a6068,
  pier: 0x4a4e54,
  canopy: 0x8a8e96,
  stationSign: 0xffe14a,
  container: [0x8a3a2a, 0x3a5a8a, 0x5a7a3a, 0x8a7a3a],
};

export function shade(hex, f) {
  const r = Math.min(255, Math.max(0, ((hex >> 16) & 255) * f));
  const g = Math.min(255, Math.max(0, ((hex >> 8) & 255) * f));
  const b = Math.min(255, Math.max(0, (hex & 255) * f));
  return (r << 16) | (g << 8) | b;
}

export function pickWindowColor(rng) {
  const arr = rng() < WINDOW.warmBias ? WINDOW.warm : WINDOW.cool;
  return arr[rng.int(0, arr.length - 1)];
}
