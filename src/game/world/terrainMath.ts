export const MAP_SIZE = 260;
export const MAP_HALF_SIZE = MAP_SIZE / 2;
export const PLAYABLE_BOUNDARY = 110;

export interface RiverSample {
  centerX: number;
  distance: number;
  halfWidth: number;
  waterY: number;
  bedY: number;
  isPool: boolean;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Deterministic 2D value noise in [0, 1] */
export function valueNoise2D(x: number, z: number): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;

  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);

  const hash = (ix: number, iz: number): number => {
    const n = Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453123;
    return n - Math.floor(n);
  };

  const a = hash(xi, zi);
  const b = hash(xi + 1, zi);
  const c = hash(xi, zi + 1);
  const d = hash(xi + 1, zi + 1);

  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

/** Multi-octave fractal noise in [0, 1] */
export function fbm2D(x: number, z: number, octaves = 3): number {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let norm = 0;

  for (let i = 0; i < octaves; i++) {
    value += valueNoise2D(x * frequency, z * frequency) * amplitude;
    norm += amplitude;
    amplitude *= 0.5;
    frequency *= 2.03;
  }

  return value / norm;
}

/**
 * Center X coordinate of the winding Kambui stream as a function of Z.
 * Runs from the waterfall plunge pool in the south-east (z ≈ -48, x ≈ 48)
 * northward through the central valley (z ≈ 42, x ≈ 18) toward the northern hills.
 */
export function getRiverCenterX(z: number): number {
  // Base diagonal flow from SE (+48 at z=-48) toward NNW (-10 at z=+110)
  const t = clamp((z + 55) / 170, 0, 1);
  const baseLine = lerp(50, -14, t);
  const meander =
    Math.sin(z * 0.042 + 0.6) * 11.5 +
    Math.cos(z * 0.095) * 3.8;
  return baseLine + meander;
}

/**
 * Water surface elevation along the stream, sloping gently downhill from south to north.
 */
export function getStreamWaterY(z: number): number {
  const t = clamp((z + 52) / 172, 0, 1);
  return lerp(0.15, -1.55, t);
}

/**
 * Evaluates river geometry at (x, z) including the waterfall plunge pool.
 */
export function getRiverInfo(x: number, z: number): RiverSample {
  const centerX = getRiverCenterX(z);
  const dx = Math.abs(x - centerX);

  // Waterfall plunge pool centered near (getRiverCenterX(-44), -44)
  const poolCenterX = getRiverCenterX(-44);
  const poolDist = Math.hypot(x - poolCenterX, z - -44);
  const poolRadius = 11.5;

  const baseHalfWidth =
    3.6 + Math.sin(z * 0.08 + 1.2) * 0.85 + Math.cos(z * 0.17) * 0.45;
  // Shallow ford widening near z = 40 where the dirt path crosses
  const fordFactor = 1 - smoothstep(0, 12, Math.abs(z - 40));
  const halfWidth = baseHalfWidth + fordFactor * 1.4;

  const waterY = getStreamWaterY(z);
  const isPool = poolDist < poolRadius;

  if (z < -50) {
    // Upstream of waterfall cliff: no lower stream bed
    return {
      centerX,
      distance: 999,
      halfWidth,
      waterY,
      bedY: waterY,
      isPool: false,
    };
  }

  let effectiveDist = dx;
  let effectiveHalfWidth = halfWidth;
  if (poolDist < poolRadius + 4) {
    effectiveDist = Math.min(dx, poolDist);
    effectiveHalfWidth = Math.max(halfWidth, poolRadius * 0.78);
  }

  const channelDepth = isPool ? 1.05 : fordFactor > 0.35 ? 0.35 : 0.65;
  const bedY = waterY - channelDepth;

  return {
    centerX,
    distance: effectiveDist,
    halfWidth: effectiveHalfWidth,
    waterY,
    bedY,
    isPool,
  };
}

/**
 * Waypoints for the winding brown laterite dirt walking path:
 * Starting Clearing -> Great Old Tree -> River Stepping Ford -> Rocky Hill Overlook -> Waterfall Overlook
 */
const PATH_WAYPOINTS: ReadonlyArray<[number, number]> = [
  [0, -4],
  [-3, 8],
  [-11, 21],
  [-4, 33],
  [8, 39],
  [21, 41], // Crosses shallow stream ford
  [36, 46],
  [48, 54], // Climbs toward Rocky Hill
  [54, 32],
  [58, 4],
  [55, -24],
  [42, -36], // Ends near waterfall plunge pool overlook
];

function distToSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number
): number {
  const vx = bx - ax;
  const vz = bz - az;
  const wx = px - ax;
  const wz = pz - az;
  const c1 = vx * wx + vz * wz;
  if (c1 <= 0) return Math.hypot(px - ax, pz - az);
  const c2 = vx * vx + vz * vz;
  if (c2 <= c1) return Math.hypot(px - bx, pz - bz);
  const b = c1 / c2;
  return Math.hypot(px - (ax + b * vx), pz - (az + b * vz));
}

/**
 * Shortest distance in meters from (x, z) to the winding dirt walking path.
 */
export function getPathDistance(x: number, z: number): number {
  let minD = 999;
  for (let i = 0; i < PATH_WAYPOINTS.length - 1; i++) {
    const [ax, az] = PATH_WAYPOINTS[i];
    const [bx, bz] = PATH_WAYPOINTS[i + 1];
    const d = distToSegment(x, z, ax, az, bx, bz);
    if (d < minD) minD = d;
  }
  // Organic wobble so edges aren't geometrically straight
  const wobble = (valueNoise2D(x * 0.22, z * 0.22) - 0.5) * 0.7;
  return Math.max(0, minD + wobble);
}

/**
 * Computes natural terrain elevation (meters) across the 260m x 260m Emerald Forest map.
 */
export function getTerrainHeight(x: number, z: number): number {
  const distFromCenter = Math.hypot(x, z);

  // 1. Base Sierra Leone tropical forest rolling hills & valleys
  const macroNoise = (fbm2D(x * 0.014 + 4.1, z * 0.014 + 2.7, 3) - 0.45) * 11.5;
  const detailUndulation =
    Math.sin(x * 0.055) * Math.cos(z * 0.048) * 1.15 +
    (valueNoise2D(x * 0.09, z * 0.09) - 0.5) * 0.9;

  let height = macroNoise + detailUndulation;

  // 2. Keep Starting Forest Clearing around (0, 0) gently level for arrival
  const clearingFlatten = 1 - smoothstep(8, 22, distFromCenter);
  height = lerp(height, 0.35 + detailUndulation * 0.15, clearingFlatten);

  // 3. Elevated Rocky Hill landmark around (54, 62)
  const rockyHillDist = Math.hypot(x - 54, z - 62);
  const rockyHillBoost = (1 - smoothstep(6, 32, rockyHillDist)) * 7.8;
  height += rockyHillBoost;

  // 4. Waterfall Cliff Ledge south-east of the plunge pool (around x=52, z=-64)
  const poolCenterX = getRiverCenterX(-44);
  const cliffDist = Math.hypot(x - (poolCenterX + 4), z - -66);
  const waterfallCliff = (1 - smoothstep(8, 28, cliffDist)) * 10.5;
  height += waterfallCliff;

  // 5. Natural surrounding boundary hills enclosing the 250m x 250m playable valley
  const rimBlend = smoothstep(94, 128, distFromCenter);
  if (rimBlend > 0) {
    const rimNoise = fbm2D(x * 0.03 + 9.2, z * 0.03 + 1.4, 2) * 8.0;
    height += rimBlend * (13.5 + rimNoise);
  }

  // 6. Carve the natural stream channel & waterfall plunge pool smoothly into the terrain
  const river = getRiverInfo(x, z);
  if (z >= -52 && river.distance < river.halfWidth + 8.5) {
    const bankBlend = 1 - smoothstep(river.halfWidth * 0.72, river.halfWidth + 8.0, river.distance);
    const targetRiverHeight =
      river.distance < river.halfWidth * 0.78
        ? river.bedY
        : lerp(river.waterY + 0.35, river.bedY, 1 - smoothstep(river.halfWidth * 0.72, river.halfWidth + 1.8, river.distance));
    height = lerp(height, targetRiverHeight, bankBlend * 0.92);
  }

  return height;
}

/**
 * Estimates terrain slope magnitude (0 = flat, ~1+ = steep cliff/hill).
 */
export function getTerrainSlope(x: number, z: number): number {
  const eps = 1.2;
  const hx1 = getTerrainHeight(x + eps, z);
  const hx0 = getTerrainHeight(x - eps, z);
  const hz1 = getTerrainHeight(x, z + eps);
  const hz0 = getTerrainHeight(x, z - eps);
  const dx = (hx1 - hx0) / (2 * eps);
  const dz = (hz1 - hz0) / (2 * eps);
  return Math.hypot(dx, dz);
}
