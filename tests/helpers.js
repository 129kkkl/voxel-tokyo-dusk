import { buildRailAndStations, buildTrunks, buildSecondaries, profileHeights, buildAlleys } from '../src/city/roads.js';
import { applyWater } from '../src/city/water.js';
import { makeTerrain, applyTerrain } from '../src/city/terrain.js';
import { extractBlocks } from '../src/city/blocks.js';
import { assignDistricts } from '../src/city/districts.js';
import { Field } from '../src/city/field.js';
import { T, CFG } from '../src/city/config.js';
import { makeRng } from '../src/rng.js';

/** 跑到 P7（街区派生）为止。districts / alleys / plots 由 runDistricts / 调用方追加。 */
export function fullPipeline(seed = CFG.SEED) {
  const rng = makeRng(seed);
  const terr = makeTerrain(makeRng(seed ^ 0x51ab));
  const rail = buildRailAndStations(rng);
  const f = new Field(CFG.HALF);
  f.fill(() => ({ t: T.BLOCK }));
  applyTerrain(f, terr);
  const roads = buildTrunks(f, rail, rng);
  roads.push(...buildSecondaries(f, roads, rail, rng));
  profileHeights(f, roads, terr);
  const water = applyWater(f, roads, terr, rng, seed);
  const blocks = extractBlocks(f);
  return { f, field: f, roads, rail, terr, water, blocks };
}

/** 跑到 P9：分区 + 小巷。plots 由调用方补。 */
export function runDistricts(seed = CFG.SEED) {
  const p = fullPipeline(seed);
  p.anchors = assignDistricts(p.blocks, p);
  p.alleys = buildAlleys(p.f, p.blocks, makeRng(seed ^ 0x77));
  return p;
}
