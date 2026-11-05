/** 类型库：体量原型 × 立面模式 × 屋顶套件。 */
import { DISTRICT } from '../city/config.js';
import { makeRng } from '../rng.js';
import { WALL, ROOF, NEON } from './palette.js';
import {
  podiumTower, setbackStack, slabBlock, twinBar, houseCluster, shopShed, pickMassing,
} from './massing.js';
import { dressRoof, dressTerrace } from './roofscape.js';
import { HEIGHT } from './heightField.js';
import { FACE_OF, placeMiniTree, placeCherry } from './claimUtil.js';

const TRAD_WALL = [0xe0d6c8, 0xd4c4b0, 0xc8b8a0];
const TRAD_ROOF = [0x6a4a32, 0x5a4030, 0x7a5a42];

const RECIPE = {
  [DISTRICT.CBD]: {
    family: 'office', style: 'curtain', wall: WALL.office, roof: ROOF.office,
    lit: [0.32, 0.48], shop: false,
    kit: { parapet: true, mech: 0.65, antenna: 0.3, crown: 0.25 },
  },
  [DISTRICT.SUB_CENTER]: {
    family: 'office', style: 'mullion', wall: WALL.office, roof: ROOF.office,
    lit: [0.3, 0.45], shop: false,
    kit: { parapet: true, mech: 0.6, antenna: 0.3, crown: 0.25 },
  },
  [DISTRICT.LANDMARK]: {
    family: 'office', style: 'curtain', wall: WALL.office, roof: ROOF.office,
    lit: [0.3, 0.45], shop: false,
    kit: { parapet: true, mech: 0.6, antenna: 0.3, crown: 0.25 },
  },
  [DISTRICT.STATION_FRONT]: {
    family: 'shop', style: 'shopfront', upper: 'curtain', wall: WALL.shop, roof: ROOF.office,
    lit: [0.35, 0.5], shop: true,
    kit: { parapet: true, mech: 0.5, billboard: 0.25 },
  },
  [DISTRICT.HIGH_RISE_RESI]: {
    family: 'apartment', style: 'gallery', wall: WALL.danchi, roof: ROOF.danchi,
    lit: [0.3, 0.45], shop: false,
    kit: { parapet: true, mech: 0.55 },
  },
  [DISTRICT.DANCHI]: {
    family: 'danchi', style: 'gallery', wall: WALL.danchi, roof: ROOF.danchi,
    lit: [0.3, 0.45], shop: false,
    kit: { parapet: true, mech: 0.65 },
  },
  [DISTRICT.COMMERCIAL]: {
    family: 'shop', style: 'shopfront', upper: 'punched', wall: WALL.shop, roof: ROOF.house,
    lit: [0.3, 0.45], shop: true,
    kit: { parapet: true, billboard: 0.25 },
  },
  [DISTRICT.ENTERTAINMENT]: {
    family: 'shop', style: 'shopfront', upper: 'punched', wall: WALL.shop, roof: ROOF.house,
    lit: [0.35, 0.5], shop: true, sign: 0.55,
    kit: { parapet: true, billboard: 0.4 },
  },
  [DISTRICT.ELECTRONICS]: {
    family: 'shop', style: 'shopfront', upper: 'punched', wall: WALL.shop, roof: ROOF.house,
    lit: [0.35, 0.5], shop: true, sign: 0.5,
    kit: { parapet: true, billboard: 0.4 },
  },
  [DISTRICT.LOW_RISE_RESI]: {
    family: 'house', style: 'punched', wall: WALL.house, roof: ROOF.house,
    lit: [0.3, 0.45], shop: false,
    kit: { gable: true },
  },
  [DISTRICT.TRADITIONAL]: {
    family: 'traditional', style: 'punched', wall: TRAD_WALL, roof: TRAD_ROOF,
    lit: [0.3, 0.45], shop: false,
    kit: { gable: true },
  },
  [DISTRICT.PORT_INDUSTRY]: {
    family: 'industrial', style: 'punched', wall: WALL.industrial, roof: ROOF.industrial,
    lit: [0.25, 0.4], shop: false,
    kit: { sawtooth: true, mech: 0.3 },
  },
  [DISTRICT.FREIGHT_YARD]: {
    family: 'industrial', style: 'punched', wall: WALL.industrial, roof: ROOF.industrial,
    lit: [0.25, 0.4], shop: false,
    kit: { sawtooth: true, mech: 0.3 },
  },
  [DISTRICT.UNIVERSITY]: {
    family: 'civic', style: 'punched', wall: WALL.civic, roof: ROOF.civic,
    lit: [0.3, 0.45], shop: false,
    kit: { parapet: true, mech: 0.3 },
  },
  [DISTRICT.SCHOOL]: {
    family: 'civic', style: 'punched', wall: WALL.civic, roof: ROOF.civic,
    lit: [0.3, 0.42], shop: false,
    kit: { parapet: true, mech: 0.25 },
  },
  [DISTRICT.HOSPITAL]: {
    family: 'civic', style: 'punched', wall: WALL.civic, roof: ROOF.civic,
    lit: [0.3, 0.45], shop: false,
    kit: { parapet: true, mech: 0.35 },
  },
  [DISTRICT.PUBLIC]: {
    family: 'civic', style: 'punched', wall: WALL.civic, roof: ROOF.civic,
    lit: [0.3, 0.42], shop: false,
    kit: { parapet: true, mech: 0.25 },
  },
};

const FALLBACK = {
  family: 'house', style: 'punched', wall: WALL.house, roof: ROOF.house,
  lit: [0.3, 0.45], shop: false, kit: { gable: true },
};

export function styleFor(district) {
  return RECIPE[district] || FALLBACK;
}

export function heightFor(district, rng) {
  const r = HEIGHT[district] || [4, 8];
  return rng ? rng.int(r[0], r[1]) : Math.round((r[0] + r[1]) / 2);
}

const MASS_FN = {
  podiumTower, setbackStack, slabBlock, twinBar, houseCluster, shopShed,
};

function frontWidth(c, face) {
  return (face < 2 ? c.w : c.d);
}

function dress(vox, tops, opts, hero = false) {
  const primary = tops.find((t) => t.kind === 'tower' || t.kind === 'slab'
    || t.kind === 'bar' || t.kind === 'house' || t.kind === 'shed') || tops[tops.length - 1];
  for (const t of tops) {
    if (t === primary) continue;
    if (t.kind === 'terrace') dressTerrace(vox, t, opts);
    else dressRoof(vox, t, { ...opts, mech: 0, antenna: 0, crown: 0, billboard: 0, parapet: true });
  }
  if (!primary) return;
  const kit = { ...opts };
  if (hero) kit.crown = Math.max(kit.crown || 0, 0.6);
  dressRoof(vox, primary, kit);
}

function balconyRow(vox, c, face, h, rng) {
  const [nx, nz] = FACE_OF[face];
  const y = c.y + Math.min(h - 1, 3 + rng.int(0, 2));
  const col = 0x6a5a4a;
  if (nz !== 0) {
    const zz = nz > 0 ? c.z1 + 1 : c.z0 - 1;
    vox.box(c.x0 + 1, y, zz, c.x1 - 1, y, zz, col, false);
  } else {
    const xx = nx > 0 ? c.x1 + 1 : c.x0 - 1;
    vox.box(xx, y, c.z0 + 1, xx, y, c.z1 - 1, col, false);
  }
}

function verticalSign(vox, c, face, h, rng) {
  const [nx, nz] = FACE_OF[face];
  const col = rng.pick([NEON.magenta, NEON.cyan, NEON.purple, NEON.yellow]);
  const y1 = c.y + Math.min(h - 1, 8);
  if (nz !== 0) {
    const zz = nz > 0 ? c.z1 + 0.5 : c.z0 - 0.5;
    vox.box(c.x1, c.y + 2, zz, c.x1, y1, zz, col, true);
  } else {
    const xx = nx > 0 ? c.x1 + 0.5 : c.x0 - 0.5;
    vox.box(xx, c.y + 2, c.z1, xx, y1, c.z1, col, true);
  }
}

export function buildHouse(vox, c, district, rng, face, h) {
  const st = styleFor(district === DISTRICT.TRADITIONAL ? DISTRICT.TRADITIONAL : DISTRICT.LOW_RISE_RESI);
  const trad = district === DISTRICT.TRADITIONAL;
  const wall = rng.pick(trad ? TRAD_WALL : st.wall);
  const roofCol = rng.pick(trad ? TRAD_ROOF : st.roof);
  // 硬规则：低层/传统强制坡顶出檐
  const { tops } = houseCluster(vox, c, {
    h, wall, style: 'punched', litP: rng.range(st.lit[0], st.lit[1]), rng, face,
    shopFront: false,
  });
  dress(vox, tops, { rng, wall, roofCol, ...st.kit });
  if (c.w >= 4 && c.d >= 4 && rng.chance(0.55)) {
    balconyRow(vox, c, face, h, rng);
  }
}

export function buildApartment(vox, c, district, rng, face, h) {
  const st = styleFor(DISTRICT.HIGH_RISE_RESI);
  const wall = rng.pick(st.wall);
  const fw = frontWidth(c, face);
  // 面宽 <7 降级小公寓：薄板 + punched，禁 curtain
  const small = fw < 7;
  const kind = small ? 'slabBlock' : pickMassing(c, h, st.family, rng);
  const style = small ? 'punched' : st.style;
  const fn = MASS_FN[kind] || slabBlock;
  const { tops } = fn(vox, c, {
    h, wall, style, litP: rng.range(st.lit[0], st.lit[1]), rng, face, shopFront: false,
  });
  dress(vox, tops, { rng, wall, roofCol: rng.pick(st.roof), ...st.kit });
  if (small && rng.chance(0.6)) balconyRow(vox, c, face, h, rng);
}

export function buildShop(vox, c, district, rng, face, h) {
  const st = styleFor(district);
  const wall = rng.pick(st.wall);
  const upper = st.upper === 'curtain' && Math.min(c.w, c.d) >= 6 && h >= 10 ? 'curtain' : 'punched';
  const kind = pickMassing(c, h, st.family, rng);
  const fn = MASS_FN[kind] || shopShed;
  const { tops } = fn(vox, c, {
    h, wall, style: st.style, upper,
    litP: rng.range(st.lit[0], st.lit[1]), rng, face, shopFront: st.shop,
  });
  dress(vox, tops, { rng, wall, roofCol: rng.pick(st.roof), ...st.kit });
  if (st.sign && c.w >= 3 && c.d >= 3 && rng.chance(st.sign)) {
    verticalSign(vox, c, face, h, rng);
  }
  if (district === DISTRICT.ELECTRONICS && rng.chance(0.35) && c.w >= 5) {
    vox.box(c.x0 + 1, c.y + h + 1, c.z0 + 1, c.x1 - 1, c.y + h + 2, c.z1 - 1, 0x2a3038, false);
    for (let x = c.x0 + 1; x <= c.x1 - 1; x += 2) {
      vox.add(x, c.y + h + 2, c.z1 - 1, rng.chance(0.5) ? NEON.cyan : NEON.yellow, true);
    }
  }
}

export function buildOffice(vox, c, district, rng, face, h, hero = false) {
  const st = styleFor(district === DISTRICT.LANDMARK ? DISTRICT.CBD : district);
  const wall = rng.pick(st.wall);
  const kind = pickMassing(c, h, 'office', rng);
  const style = kind === 'shopShed' ? (h >= 8 ? 'mullion' : 'punched') : st.style;
  const fn = MASS_FN[kind] || shopShed;
  const { tops } = fn(vox, c, {
    h, wall, style, litP: rng.range(st.lit[0], st.lit[1]), rng, face,
    shopFront: district === DISTRICT.STATION_FRONT,
  });
  dress(vox, tops, {
    rng, wall, roofCol: rng.pick(st.roof), ...st.kit,
  }, hero);
}

export function buildDanchi(vox, c, district, rng, face, h) {
  const st = styleFor(DISTRICT.DANCHI);
  const wall = rng.pick(st.wall);
  const kind = pickMassing(c, h, st.family, rng);
  const fn = MASS_FN[kind] || slabBlock;
  const { tops } = fn(vox, c, {
    h, wall, style: st.style, litP: rng.range(st.lit[0], st.lit[1]), rng, face, shopFront: false,
  });
  dress(vox, tops, { rng, wall, roofCol: rng.pick(st.roof), ...st.kit });
}

export function buildIndustrial(vox, c, district, rng, face, h) {
  const st = styleFor(district);
  const wall = rng.pick(st.wall);
  const { tops } = shopShed(vox, c, {
    h, wall, style: 'punched', litP: rng.range(st.lit[0], st.lit[1]), rng, face,
    shopFront: false,
  });
  dress(vox, tops, { rng, wall, roofCol: rng.pick(st.roof), ...st.kit });
}

export function buildCivic(vox, c, district, rng, face, h) {
  const st = styleFor(district);
  const wall = rng.pick(st.wall);
  const kind = pickMassing(c, h, st.family, rng);
  const fn = MASS_FN[kind] || slabBlock;
  const { tops } = fn(vox, c, {
    h, wall, style: st.style, litP: rng.range(st.lit[0], st.lit[1]), rng, face, shopFront: false,
  });
  dress(vox, tops, { rng, wall, roofCol: rng.pick(st.roof), ...st.kit });
}

export function buildGreen(vox, CITY, plot, rng, stats) {
  const y0 = plot.h;
  const { x0, z0, x1, z1 } = plot.rect;
  vox.box(x0, y0, z0, x1, y0, z1, rng.pick([0x3d6a38, 0x3f5c3a, 0x356332]), false);
  const area = plot.w * plot.d;
  const n = Math.min(10, Math.max(2, Math.floor(area / 35)));
  const greenway = plot.district === DISTRICT.GREENWAY;
  for (let i = 0; i < n; i++) {
    const x = rng.int(x0 + 1, Math.max(x0 + 1, x1 - 1));
    const z = rng.int(z0 + 1, Math.max(z0 + 1, z1 - 1));
    if (greenway && rng.chance(0.4)) placeCherry(vox, x, z, y0, rng);
    else placeMiniTree(vox, x, z, y0, rng);
  }
  if (area > 80 && rng.chance(0.5)) {
    const midZ = Math.round((z0 + z1) / 2);
    vox.box(x0, y0 + 0.15, midZ, x1, y0 + 0.15, midZ, 0x8a8070, false);
  }
  if (stats) stats.buildings.green = (stats.buildings.green || 0) + 1;
}

export function districtRng(district, plotId, salt = 0) {
  let h = plotId * 977 + salt;
  for (let i = 0; i < (district || '').length; i++) h = (h * 31 + district.charCodeAt(i)) | 0;
  return makeRng((Math.imul(h, 0x9E3779B1) ^ 0xB17D) >>> 0);
}

export function placeBuildingByDistrict(vox, c, district, plot, stats, hField) {
  const face = plot?.face ?? 0;
  const rng = districtRng(district, plot?.id ?? c.x0 * 31 + c.z0, 0);
  const key = bucketKey(district);
  if (stats) stats.buildings[key] = (stats.buildings[key] || 0) + 1;

  const h = hField && plot ? hField.hFor(plot) : heightFor(district, rng);
  const hero = hField && plot ? hField.isHero(plot.id) : false;

  switch (district) {
    case DISTRICT.CBD:
    case DISTRICT.SUB_CENTER:
    case DISTRICT.LANDMARK:
      buildOffice(vox, c, district, rng, face, h, hero);
      break;
    case DISTRICT.STATION_FRONT:
      if (rng.chance(0.3)) buildOffice(vox, c, district, rng, face, h, hero);
      else buildShop(vox, c, district, rng, face, h);
      break;
    case DISTRICT.HIGH_RISE_RESI:
      buildApartment(vox, c, district, rng, face, h);
      break;
    case DISTRICT.DANCHI:
      buildDanchi(vox, c, district, rng, face, h);
      break;
    case DISTRICT.COMMERCIAL:
    case DISTRICT.ENTERTAINMENT:
    case DISTRICT.ELECTRONICS:
      buildShop(vox, c, district, rng, face, h);
      break;
    case DISTRICT.LOW_RISE_RESI:
    case DISTRICT.TRADITIONAL:
      buildHouse(vox, c, district, rng, face, h);
      break;
    case DISTRICT.PORT_INDUSTRY:
    case DISTRICT.FREIGHT_YARD:
      buildIndustrial(vox, c, district, rng, face, h);
      break;
    case DISTRICT.UNIVERSITY:
    case DISTRICT.SCHOOL:
    case DISTRICT.HOSPITAL:
    case DISTRICT.PUBLIC:
      buildCivic(vox, c, district, rng, face, h);
      break;
    case DISTRICT.STADIUM:
    case DISTRICT.PARK_LARGE:
    case DISTRICT.PARK_SMALL:
    case DISTRICT.GREENWAY:
      break;
    default:
      buildHouse(vox, c, DISTRICT.LOW_RISE_RESI, rng, face, h);
      break;
  }
}

function bucketKey(district) {
  switch (district) {
    case DISTRICT.CBD:
    case DISTRICT.SUB_CENTER:
    case DISTRICT.LANDMARK:
      return 'office';
    case DISTRICT.STATION_FRONT:
      return 'station';
    case DISTRICT.COMMERCIAL:
    case DISTRICT.ENTERTAINMENT:
    case DISTRICT.ELECTRONICS:
      return 'shop';
    case DISTRICT.DANCHI:
    case DISTRICT.HIGH_RISE_RESI:
      return 'danchi';
    case DISTRICT.LOW_RISE_RESI:
    case DISTRICT.TRADITIONAL:
      return 'house';
    case DISTRICT.PORT_INDUSTRY:
    case DISTRICT.FREIGHT_YARD:
      return 'industrial';
    default:
      return 'civic';
  }
}
