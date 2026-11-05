import * as THREE from 'three';
import { DISTRICT, LOT } from '../city/config.js';
import { makeRng } from '../rng.js';
import { claimWithRetry, fillBlockInterior } from './claimUtil.js';
import { placeBuildingByDistrict, buildGreen } from './districts.js';
import { buildHeightField } from './heightField.js';
import { placeLandmarks } from './landmarks.js';
import { placeRail } from './rail.js';
import { placeStreetProps } from './street.js';

function emptyStats() {
  return {
    buildings: {},
    claimsUsed: 0,
    plotsTotal: 0,
    plotsClaimed: 0,
    plotUseRate: 0,
    freeFill: 0,
    landmarks: {},
    props: {
      lamps: 0, poles: 0, signals: 0, vending: 0, cars: 0, cherries: 0, parkTrees: 0, bridges: 0,
    },
    byDistrict: {},
  };
}

export function placeFromCity(vox, CITY) {
  const stats = emptyStats();
  const local = makeRng(20260919 ^ 0x9e37);
  const hField = buildHeightField(CITY);

  placeLandmarks(vox, CITY, stats);

  for (const p of CITY.plots) {
    stats.plotsTotal++;
    const district = p.district;

    if (p.kind === LOT.OPEN || district === DISTRICT.PARK_LARGE
      || district === DISTRICT.PARK_SMALL || district === DISTRICT.GREENWAY) {
      if (local.chance(0.55)) {
        buildGreen(vox, CITY, p, local, stats);
        stats.plotsClaimed++;
      }
      continue;
    }

    const c = claimWithRetry(CITY, p, district || p.kind);
    if (!c) continue;
    stats.claimsUsed++;
    stats.plotsClaimed++;

    const bd = stats.byDistrict[district]
      || (stats.byDistrict[district] = { plots: 0, claims: 0 });
    bd.plots++;
    bd.claims++;

    placeBuildingByDistrict(vox, c, district, p, stats, hField);
  }

  for (const b of CITY.blocks) {
    fillBlockInterior(vox, CITY, b, local, stats);
  }

  const railCurve = placeRail(vox, CITY, stats);
  placeStreetProps(vox, CITY, stats);

  const aud = CITY.audit();
  CITY.stats.audit = aud;
  CITY.stats.claims = CITY.claims.length;
  stats.claimsUsed = CITY.claims.length;
  stats.plotUseRate = stats.plotsTotal
    ? +(stats.plotsClaimed / stats.plotsTotal).toFixed(3)
    : 0;
  CITY.stats.buildVis = stats;

  return { railCurve, stats };
}

export function buildRailCurveFromCity(CITY) {
  const pts = CITY.rail.pts;
  const dense = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    const steps = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 3));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      dense.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return new THREE.CatmullRomCurve3(
    dense.map(([x, z]) => {
      const xi = Math.round(x);
      const zi = Math.round(z);
      return new THREE.Vector3(xi, Math.max(CITY.groundY(xi, zi) + 4, 12) + 1.5, zi);
    }),
    true,
    'centripetal',
  );
}
