/** CITY 单例：布局知识唯一的出口（规格 §4）。claim 登记制让「压路」成为可计数不变量。 */
import { CFG, T, isRoad, isWater, isBlocked, idx as gidx, inb } from './config.js';
import { Field } from './field.js';
import { makeTerrain, applyTerrain } from './terrain.js';
import { buildRailAndStations, buildTrunks, buildSecondaries, profileHeights, buildAlleys } from './roads.js';
import { applyWater } from './water.js';
import { extractBlocks } from './blocks.js';
import { assignDistricts } from './districts.js';
import { buildPlots } from './plots.js';
import { makeRng } from '../rng.js';

export function buildCity(seed = CFG.SEED) {
  const t0 = (typeof performance !== 'undefined' ? performance : Date).now();
  const rng = makeRng(seed);
  const terr = makeTerrain(makeRng(seed ^ 0x51ab));
  const rail = buildRailAndStations(rng);
  const field = new Field(CFG.HALF);
  field.fill(() => ({ t: T.BLOCK }));
  applyTerrain(field, terr);
  const roads = buildTrunks(field, rail, rng);
  roads.push(...buildSecondaries(field, roads, rail, rng));
  profileHeights(field, roads, terr);
  const water = applyWater(field, roads, terr, rng, seed);
  const blocks = extractBlocks(field);
  const anchors = assignDistricts(blocks, { field, rail, roads, terr, water });
  buildAlleys(field, blocks, makeRng(seed ^ 0x77));
  const plots = buildPlots(blocks, field);

  const claims = [];
  const plotById = new Map(plots.map((p) => [p.id, p]));

  const at = (x, z) => (inb(x, z) ? field.at(x, z) : null);
  const tAt = (x, z) => (inb(x, z) ? field.t[gidx(x, z)] : T.OUTSIDE);

  const CITY = {
    HALF: CFG.HALF, N: field.N, field, terr,
    roads, rail, stations: rail.stations, blocks, plots, anchors,
    bridges: water.bridges, piers: water.piers, claims,

    cell: at,
    isRoad: (x, z) => isRoad(tAt(x, z)),
    isWater: (x, z) => isWater(tAt(x, z)),
    isRail: (x, z) => tAt(x, z) === T.RAIL,
    isBridge: (x, z) => tAt(x, z) === T.BRIDGE,
    isSidewalk: (x, z) => tAt(x, z) === T.SIDEWALK,
    groundY: (x, z) => {
      if (!inb(x, z)) return 0;
      const t = field.t[gidx(x, z)];
      if (t === T.WATER || t === T.SEA) return 0;
      return field.h[gidx(x, z)];
    },
    typeAt: tAt,

    blockAt(x, z) {
      if (!inb(x, z)) return null;
      const b = field.blockId[gidx(x, z)];
      return b >= 0 ? blocks[b] : null;
    },
    blocksIn(x0, z0, x1, z1) {
      return blocks.filter((b) => !(b.bbox[2] < x0 || b.bbox[0] > x1 || b.bbox[3] < z0 || b.bbox[1] > z1));
    },

    footprintClear(x0, z0, x1, z1) {
      const hist = new Map();
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
        if (!inb(x, z)) return false;
        const i = gidx(x, z);
        if (isBlocked(field.t[i])) return false;
        hist.set(field.h[i], (hist.get(field.h[i]) || 0) + 1);
      }
      return hist.size <= 1;
    },

    claim(plotId, w, d, tag = '') {
      const p = plotById.get(plotId);
      if (!p) return null;
      const slackX = p.w - w, slackZ = p.d - d;
      if (slackX < 0 || slackZ < 0) return null;
      for (let tries = 0; tries < 4; tries++) {
        const jx = tries === 0 ? (slackX >> 1) : Math.floor(rng() * (slackX + 1));
        const jz = tries === 0 ? (slackZ >> 1) : Math.floor(rng() * (slackZ + 1));
        const rect = { x0: p.rect.x0 + jx, z0: p.rect.z0 + jz, x1: p.rect.x0 + jx + w - 1, z1: p.rect.z0 + jz + d - 1 };
        if (!CITY.footprintClear(rect.x0, rect.z0, rect.x1, rect.z1)) continue;
        if (overlapsAny(claims, rect)) continue;
        const c = {
          tag, plotId, blockId: p.blockId, y: p.h, ...rect,
          cx: (rect.x0 + rect.x1) / 2, cz: (rect.z0 + rect.z1) / 2, w, d,
        };
        claims.push(c);
        return c;
      }
      return null;
    },

    claimFree(x0, z0, x1, z1, tag = '') {
      if (!CITY.footprintClear(x0, z0, x1, z1)) return null;
      const rect = { x0, z0, x1, z1 };
      if (overlapsAny(claims, rect)) return null;
      const c = {
        tag, plotId: -1, blockId: -1,
        y: field.h[gidx((x0 + x1) >> 1, (z0 + z1) >> 1)],
        ...rect, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w: x1 - x0 + 1, d: z1 - z0 + 1,
      };
      claims.push(c);
      return c;
    },

    audit() {
      const out = { overlap: 0, onRoad: 0, onWater: 0, onRail: 0, badPad: 0, total: claims.length, bad: [] };
      const B = 64;
      const buckets = new Map();
      const bkeys = (r) => {
        const ks = [];
        for (let bx = Math.floor(r.x0 / B); bx <= Math.floor(r.x1 / B); bx++)
          for (let bz = Math.floor(r.z0 / B); bz <= Math.floor(r.z1 / B); bz++) ks.push(bx * 4096 + bz);
        return ks;
      };
      claims.forEach((a, i) => {
        for (const k of bkeys(a)) {
          if (!buckets.has(k)) buckets.set(k, []);
          buckets.get(k).push(i);
        }
      });
      const seen = new Set();
      for (let i = 0; i < claims.length; i++) {
        const a = claims[i];
        let road = false, water = false, rail = false, badPad = false;
        const hs = new Set();
        for (let x = a.x0; x <= a.x1; x++) for (let z = a.z0; z <= a.z1; z++) {
          const t = tAt(x, z);
          if (isRoad(t) || t === T.SIDEWALK) road = true;
          if (t === T.WATER || t === T.SEA || t === T.QUAY) water = true;
          if (t === T.RAIL) rail = true;
          if (!inb(x, z) || isBlocked(t)) badPad = true;
          else hs.add(field.h[gidx(x, z)]);
        }
        if (hs.size > 1) badPad = true;
        for (const k of bkeys(a)) for (const j of buckets.get(k) || []) {
          if (j <= i) continue;
          const pair = i * 1e6 + j;
          if (seen.has(pair)) continue;
          seen.add(pair);
          const b = claims[j];
          if (a.x0 <= b.x1 && b.x0 <= a.x1 && a.z0 <= b.z1 && b.z0 <= a.z1) out.overlap++;
        }
        if (road) { out.onRoad++; out.bad.push({ tag: a.tag, why: 'road', x: a.cx, z: a.cz }); }
        if (water) { out.onWater++; out.bad.push({ tag: a.tag, why: 'water', x: a.cx, z: a.cz }); }
        if (rail) { out.onRail++; out.bad.push({ tag: a.tag, why: 'rail', x: a.cx, z: a.cz }); }
        if (badPad) { out.badPad++; out.bad.push({ tag: a.tag, why: 'pad', x: a.cx, z: a.cz }); }
      }
      return out;
    },

    stats: {},
  };

  CITY.stats = {
    buildMs: Math.round((typeof performance !== 'undefined' ? performance : Date).now() - t0),
    blocks: blocks.length, plots: plots.length, roads: roads.length,
    bridges: water.bridges.length, stations: rail.stations.length,
    roadCells: field.countIf((c) => isRoad(c.t)),
    waterCells: field.countIf((c) => isWater(c.t) || c.t === T.SEA),
  };
  return CITY;
}

function overlapsAny(list, r) {
  for (const b of list) if (r.x0 <= b.x1 && b.x0 <= r.x1 && r.z0 <= b.z1 && b.z0 <= r.z1) return true;
  return false;
}
