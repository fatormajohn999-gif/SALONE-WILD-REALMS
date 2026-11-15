export const MAP_SIZE = 260;
export const MAP_HALF_SIZE = MAP_SIZE / 2;
export const PLAYABLE_BOUNDARY = 110;
export const TERRAIN_SUBDIVISIONS = 200;

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
 * Center X coordinate of the winding Emerald River as a function of Z.
 * Flows from the SE Waterfall Plunge Pool (x ≈ 24, z = -42) past the east edge
 * of the starting clearing (x ≈ 17.5, z = 0) so it is clearly visible right away,
 * crosses the trail ford around (x ≈ 15, z = 38), and winds NW into the forest.
 */
export function getRiverCenterX(z: number): number {
  const t = clamp((z + 50) / 172, 0, 1);
  const baseLine = lerp(25, -10, t);
  const meander =
    Math.sin(z * 0.048 + 0.4) * 8.2 +
    Math.cos(z * 0.092 - 0.5) * 2.8;
  return baseLine + meander;
}

/**
 * Water surface elevation along the river, sloping gently downstream (-Z to +Z).
 */
export function getStreamWaterY(z: number): number {
  const t = clamp((z + 48) / 172, 0, 1);
  return lerp(0.12, -1.55, t);
}

/**
 * Evaluates river geometry at (x, z), including the waterfall plunge pool.
 */
export function getRiverInfo(x: number, z: number): RiverSample {
  const centerX = getRiverCenterX(z);
  const slopeApprox = getRiverCenterX(z + 0.5) - getRiverCenterX(z - 0.5);
  const dx = Math.abs(x - centerX) / Math.sqrt(1 + slopeApprox * slopeApprox);

  // Waterfall plunge pool centered at (poolCenterX, -42)
  const poolCenterX = getRiverCenterX(-42);
  const poolDist = Math.hypot(x - poolCenterX, z - -42);
  const poolRadius = 10.2;

  const baseHalfWidth =
    4.2 + Math.sin(z * 0.08 + 1.1) * 0.8 + Math.cos(z * 0.16) * 0.4;
  // Shallow ford widening near z = 38 where the dirt trail crosses
  const fordFactor = 1 - smoothstep(0, 10, Math.abs(z - 38));
  const halfWidth = baseHalfWidth + fordFactor * 1.4;

  const waterY = getStreamWaterY(z);
  const isPool = poolDist < poolRadius;

  // North of the plunge pool cliff face (z < -42 - poolRadius), no stream channel exists
  const streamActive = z >= -44;
  const inPoolInfluence = poolDist < poolRadius + 8.5;

  if (!streamActive && !inPoolInfluence) {
    return {
      centerX,
      distance: 999,
      halfWidth,
      waterY,
      bedY: waterY,
      isPool: false,
    };
  }

  let effectiveDist = streamActive ? dx : 999;
  let effectiveHalfWidth = halfWidth;
  if (inPoolInfluence) {
    // Compare normalized distances so the circular pool blends seamlessly into the stream
    const poolNorm = poolDist / poolRadius;
    const streamNorm = streamActive ? dx / halfWidth : 999;
    if (poolNorm <= streamNorm) {
      effectiveDist = poolDist;
      effectiveHalfWidth = poolRadius;
    }
  }

  const channelDepth = isPool ? 1.25 : fordFactor > 0.35 ? 0.34 : 0.78;
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
 * Starting Clearing -> Great Old Tree -> Shallow River Ford -> Rocky Hill -> Waterfall Overlook
 */
const PATH_WAYPOINTS: ReadonlyArray<[number, number]> = [
  [0, -4],
  [-3, 8],
  [-10, 20],
  [-4, 31],
  [6, 36],
  [21, 39], // Crosses shallow stream ford
  [37, 45],
  [50, 56], // Climbs toward Rocky Hill
  [56, 32],
  [58, 4],
  [50, -22],
  [36, -34], // Ends overlooking the waterfall plunge pool
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
  const wobble = (valueNoise2D(x * 0.22, z * 0.22) - 0.5) * 0.65;
  return Math.max(0, minD + wobble);
}

/**
 * Analytical terrain elevation function (meters) across the 260m x 260m map.
 */
export function getTerrainHeight(x: number, z: number): number {
  const distFromCenter = Math.hypot(x, z);

  // 1. Base Sierra Leone tropical forest rolling hills & valleys
  const macroNoise = (fbm2D(x * 0.015 + 4.1, z * 0.015 + 2.7, 3) - 0.44) * 12.0;
  const detailUndulation =
    Math.sin(x * 0.055) * Math.cos(z * 0.048) * 1.15 +
    (valueNoise2D(x * 0.09, z * 0.09) - 0.5) * 0.9;

  let height = macroNoise + detailUndulation;

  // 2. Keep Starting Forest Clearing around (0, 0) gently sloped and open
  const clearingFlatten = 1 - smoothstep(7, 20, distFromCenter);
  height = lerp(height, 0.65 + detailUndulation * 0.14, clearingFlatten);

  // 3. Elevated Rocky Hill landmark around (54, 62)
  const rockyHillDist = Math.hypot(x - 54, z - 62);
  const rockyHillBoost = (1 - smoothstep(6, 32, rockyHillDist)) * 8.2;
  height += rockyHillBoost;

  // 4. Waterfall Cliff Ledge just south of the plunge pool (z ≈ -60)
  const poolCenterX = getRiverCenterX(-42);
  const cliffDist = Math.hypot(x - (poolCenterX + 1), z - -62);
  const waterfallCliff = (1 - smoothstep(7, 24, cliffDist)) * 11.0;
  height += waterfallCliff;

  // 5. Natural surrounding boundary hills enclosing the 250m x 250m playable valley
  const rimBlend = smoothstep(94, 128, distFromCenter);
  if (rimBlend > 0) {
    const rimNoise = fbm2D(x * 0.03 + 9.2, z * 0.03 + 1.4, 2) * 8.5;
    height += rimBlend * (14.5 + rimNoise);
  }

  // 6. Carve the river channel & banks with 100% authority so terrain never buries water
  const river = getRiverInfo(x, z);
  if (river.distance < river.halfWidth + 9.0) {
    if (river.distance <= river.halfWidth * 0.8) {
      height = river.bedY;
    } else if (river.distance <= river.halfWidth * 1.08) {
      // Bank crosses waterY cleanly around 0.92 * halfWidth and rises to waterY + 0.65 by 1.08 * halfWidth
      const bankT = smoothstep(
        river.halfWidth * 0.8,
        river.halfWidth * 1.08,
        river.distance
      );
      height = lerp(river.bedY, river.waterY + 0.65, bankT);
    } else {
      const outerBlend =
        1 -
        smoothstep(
          river.halfWidth * 1.08,
          river.halfWidth + 9.0,
          river.distance
        );
      const bankEdgeY = Math.max(height, river.waterY + 0.65);
      height = lerp(height, bankEdgeY, outerBlend * 0.85);
    }
  }

  return height;
}

/**
 * Precomputed vertex height grid matching Babylon's CreateGround(200 subdivisions)
 * so every placed object and the player's feet match the exact rendered triangles.
 */
const GRID_STRIDE = TERRAIN_SUBDIVISIONS + 1;
const CELL_SIZE = MAP_SIZE / TERRAIN_SUBDIVISIONS;
let cachedHeightGrid: Float32Array | null = null;

export function getTerrainHeightGrid(): Float32Array {
  if (cachedHeightGrid) {
    return cachedHeightGrid;
  }

  const grid = new Float32Array(GRID_STRIDE * GRID_STRIDE);
  for (let row = 0; row <= TERRAIN_SUBDIVISIONS; row++) {
    const z =
      ((TERRAIN_SUBDIVISIONS - row) * MAP_SIZE) / TERRAIN_SUBDIVISIONS -
      MAP_HALF_SIZE;
    for (let col = 0; col <= TERRAIN_SUBDIVISIONS; col++) {
      const x = (col * MAP_SIZE) / TERRAIN_SUBDIVISIONS - MAP_HALF_SIZE;
      grid[row * GRID_STRIDE + col] = getTerrainHeight(x, z);
    }
  }

  cachedHeightGrid = grid;
  return grid;
}

/**
 * Computes the EXACT triangle-interpolated Y height on the rendered Babylon ground mesh.
 * Matches CreateGroundVertexData triangle diagonal layout identically.
 */
export function getExactGroundHeight(x: number, z: number): number {
  const grid = getTerrainHeightGrid();
  const cx = clamp(x, -MAP_HALF_SIZE, MAP_HALF_SIZE - 0.0001);
  const cz = clamp(z, -MAP_HALF_SIZE + 0.0001, MAP_HALF_SIZE);

  const fx = (cx + MAP_HALF_SIZE) / CELL_SIZE;
  const fz = (MAP_HALF_SIZE - cz) / CELL_SIZE;

  const col = clamp(Math.floor(fx), 0, TERRAIN_SUBDIVISIONS - 1);
  const row = clamp(Math.floor(fz), 0, TERRAIN_SUBDIVISIONS - 1);

  const u = fx - col;
  const v = fz - row;

  const h00 = grid[row * GRID_STRIDE + col];
  const h10 = grid[row * GRID_STRIDE + col + 1];
  const h01 = grid[(row + 1) * GRID_STRIDE + col];
  const h11 = grid[(row + 1) * GRID_STRIDE + col + 1];

  if (u >= v) {
    return h00 + u * (h10 - h00) + v * (h11 - h10);
  }
  return h00 + v * (h01 - h00) + u * (h11 - h01);
}

/**
 * Returns the minimum exact ground height across a circular footprint so
 * wide trunks, boulders, and bushes never have a downhill corner floating.
 */
export function getFootprintMinGroundHeight(
  x: number,
  z: number,
  radius: number
): number {
  let minY = getExactGroundHeight(x, z);
  if (radius <= 0.05) {
    return minY;
  }
  const diag = radius * 0.7071;
  const samples: ReadonlyArray<[number, number]> = [
    [x + radius, z],
    [x - radius, z],
    [x, z + radius],
    [x, z - radius],
    [x + diag, z + diag],
    [x - diag, z + diag],
    [x + diag, z - diag],
    [x - diag, z - diag],
  ];
  for (let i = 0; i < samples.length; i++) {
    const h = getExactGroundHeight(samples[i][0], samples[i][1]);
    if (h < minY) minY = h;
  }
  return minY;
}

/**
 * Estimates terrain slope magnitude (0 = flat, ~1+ = steep cliff/hill).
 */
export function getTerrainSlope(x: number, z: number): number {
  const eps = 1.1;
  const hx1 = getExactGroundHeight(x + eps, z);
  const hx0 = getExactGroundHeight(x - eps, z);
  const hz1 = getExactGroundHeight(x, z + eps);
  const hz0 = getExactGroundHeight(x, z - eps);
  const dx = (hx1 - hx0) / (2 * eps);
  const dz = (hz1 - hz0) / (2 * eps);
  return Math.hypot(dx, dz);
}
