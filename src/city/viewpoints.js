/** 验收机位：全部由 CITY 锚点与街区派生（规格 §12）。 */
export const VIEW_NAMES = ['pano', 'cbd', 'mainstreet', 'resi', 'harbor', 'station', 'plan'];

export function viewpoint(name, CITY) {
  const a = CITY.anchors;
  const gy = (x, z) => CITY.groundY(Math.round(x), Math.round(z));
  const nearBlock = (pt, district) => {
    let best = null, bd = 1e9;
    for (const b of CITY.blocks) {
      if (district && b.district !== district) continue;
      const d = Math.hypot(b.centroid[0] - pt.x, b.centroid[1] - pt.z);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  };
  const streetCam = (target) => {
    const road = nearestTrunkRoadPoint(CITY, target);
    return {
      position: [Math.round(road.x), gy(road.x, road.z) + 12, Math.round(road.z)],
      target: [target.x, gy(target.x, target.z) + 14, target.z],
    };
  };
  const aerial = (target, h, back) => ({
    position: [target.x + back, h, target.z + back],
    target: [target.x, gy(target.x, target.z) + 10, target.z],
  });

  switch (name) {
    case 'pano':
      return { position: [430, 330, 430], target: [0, 30, 0], ortho: false };
    case 'plan':
      return { position: [0, 1400, 0.001], target: [0, 0, 0], ortho: true };
    case 'cbd': {
      const t = a.railMainStation;
      return streetCam({ x: t.x + 20, z: t.z + 20 });
    }
    case 'station': {
      const t = a.stationFront ?? nearBlock(a.railMainStation, 'station_front');
      const p = t && t.centroid
        ? { x: Math.round(t.centroid[0]), z: Math.round(t.centroid[1]) }
        : (t && Number.isFinite(t.x) ? { x: t.x, z: t.z } : { x: a.railMainStation.x + 30, z: a.railMainStation.z + 30 });
      return streetCam(p);
    }
    case 'mainstreet': {
      const t = nearBlock({ x: 0, z: 0 }, 'commercial') || nearBlock({ x: 0, z: 0 }, 'station_front');
      return streetCam({ x: Math.round(t.centroid[0]), z: Math.round(t.centroid[1]) });
    }
    case 'resi': {
      const t = nearBlock(a.greatPark ?? { x: -200, z: 0 }, 'low_rise_resi');
      return streetCam({ x: Math.round(t.centroid[0]), z: Math.round(t.centroid[1]) });
    }
    case 'harbor': {
      const w = a.wharf ?? a.portOffice ?? { x: 300, z: 300 };
      return aerial({ x: w.x ?? 300, z: w.z ?? 300 }, 90, -140);
    }
    default: return null;
  }
}

function nearestTrunkRoadPoint(CITY, p) {
  let best = null, bd = 1e9;
  for (const r of CITY.roads) {
    if (r.cls === 'MINOR' || r.cls === 'RAIL') continue;
    for (const q of r.pts) {
      const d = Math.hypot(q[0] - p.x, q[1] - p.z);
      if (d < bd) { bd = d; best = { x: q[0], z: q[1] }; }
    }
  }
  return best ?? { x: p.x + 12, z: p.z + 12 };
}

export function parseParams(search) {
  const q = new URLSearchParams(search || '');
  const seed = Number(q.get('seed'));
  return {
    plan: q.get('plan'),
    debug: q.get('debug') === '1',
    cam: q.get('cam'),
    seed: Number.isFinite(seed) && seed > 0 ? seed : null,
  };
}
