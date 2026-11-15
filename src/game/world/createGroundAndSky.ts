import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { Scene } from '@babylonjs/core/scene';
import {
  MAP_HALF_SIZE,
  MAP_SIZE,
  TERRAIN_SUBDIVISIONS,
  clamp,
  fbm2D,
  getExactGroundHeight,
  getPathDistance,
  getRiverInfo,
  getTerrainHeightGrid,
  getTerrainSlope,
  lerp,
  smoothstep,
  valueNoise2D,
} from './terrainMath';

export interface GroundAndSkyHandle {
  groundMesh: Mesh;
  sunLight: DirectionalLight;
  hemiLight: HemisphericLight;
}

function createSkyDome(scene: Scene, sunDirection: Vector3): void {
  const skyDome = MeshBuilder.CreateSphere(
    'emeraldSkyDome',
    { diameter: 480, segments: 24, sideOrientation: Mesh.BACKSIDE },
    scene
  );
  skyDome.isPickable = false;
  skyDome.infiniteDistance = true;

  const positions = skyDome.getVerticesData(VertexBuffer.PositionKind);
  if (positions) {
    const colors = new Float32Array((positions.length / 3) * 4);
    const horizonColor = new Color3(0.75, 0.87, 0.87);
    const midSkyColor = new Color3(0.41, 0.68, 0.87);
    const zenithColor = new Color3(0.16, 0.41, 0.68);
    const lowerColor = new Color3(0.16, 0.24, 0.19);

    for (let i = 0; i < positions.length / 3; i++) {
      const y = positions[i * 3 + 1];
      const normalizedY = y / 240;
      let col: Color3;

      if (normalizedY >= 0) {
        if (normalizedY < 0.32) {
          col = Color3.Lerp(horizonColor, midSkyColor, normalizedY / 0.32);
        } else {
          col = Color3.Lerp(midSkyColor, zenithColor, (normalizedY - 0.32) / 0.68);
        }
      } else {
        col = Color3.Lerp(horizonColor, lowerColor, Math.min(1, -normalizedY * 3.0));
      }

      colors[i * 4] = col.r;
      colors[i * 4 + 1] = col.g;
      colors[i * 4 + 2] = col.b;
      colors[i * 4 + 3] = 1.0;
    }

    skyDome.setVerticesData(VertexBuffer.ColorKind, colors);
  }

  const skyMat = new StandardMaterial('emeraldSkyMat', scene);
  skyMat.emissiveColor = new Color3(1, 1, 1);
  skyMat.disableLighting = true;
  skyMat.backFaceCulling = true;
  skyDome.material = skyMat;
  skyDome.freezeWorldMatrix();

  // Warm sun disc aligned with directional sunlight
  const sunDisc = MeshBuilder.CreateDisc('sunDisc', { radius: 11, tessellation: 24 }, scene);
  sunDisc.position = sunDirection.scale(-210);
  sunDisc.billboardMode = Mesh.BILLBOARDMODE_ALL;
  sunDisc.isPickable = false;
  const sunDiscMat = new StandardMaterial('sunDiscMat', scene);
  sunDiscMat.emissiveColor = new Color3(1.0, 0.96, 0.84);
  sunDiscMat.disableLighting = true;
  sunDisc.material = sunDiscMat;
  sunDisc.freezeWorldMatrix();
}

/**
 * Paints a 1024x1024 multi-biome world map matching the exact terrain:
 * natural forest grass, dark forest soil, brown laterite dirt path,
 * fallen leaf litter, rocky surfaces, riverbank mud, and sand/gravel bars.
 */
function createBiomeMacroTexture(scene: Scene): DynamicTexture {
  const size = 1024;
  const texture = new DynamicTexture('terrainBiomeTex', { width: size, height: size }, scene, true);
  const ctx = texture.getContext();
  const imgData = ctx.getImageData(0, 0, size, size);
  const data = imgData.data;

  for (let py = 0; py < size; py++) {
    // DynamicTexture has invertY = true: py=0 maps to v=1 (+Z)
    const worldZ = (0.5 - (py + 0.5) / size) * MAP_SIZE;

    for (let px = 0; px < size; px++) {
      const worldX = ((px + 0.5) / size - 0.5) * MAP_SIZE;

      const slope = getTerrainSlope(worldX, worldZ);
      const river = getRiverInfo(worldX, worldZ);
      const pathDist = getPathDistance(worldX, worldZ);

      const macroVar = fbm2D(worldX * 0.045 + 1.3, worldZ * 0.045 + 6.7, 2);
      const microVar = valueNoise2D(worldX * 0.35, worldZ * 0.35);

      // 1. Base Natural Forest Grass
      let r = lerp(52, 79, macroVar) + (microVar - 0.5) * 10;
      let g = lerp(88, 124, macroVar) + (microVar - 0.5) * 12;
      let b = lerp(44, 60, macroVar) + (microVar - 0.5) * 8;

      // 2. Dark Forest Soil under wooded regions (outside clearing & path)
      const distFromCenter = Math.hypot(worldX, worldZ);
      const soilNoise = valueNoise2D(worldX * 0.08 + 12.4, worldZ * 0.08 + 3.1);
      const soilWeight =
        smoothstep(11, 24, distFromCenter) *
        smoothstep(0.42, 0.72, soilNoise) *
        0.78;
      r = lerp(r, 45 + microVar * 14, soilWeight);
      g = lerp(g, 38 + microVar * 11, soilWeight);
      b = lerp(b, 27 + microVar * 8, soilWeight);

      // 3. Fallen Leaf-Covered Ground (warm amber/russet patches in forest floor)
      const leafNoise = valueNoise2D(worldX * 0.14 + 31.2, worldZ * 0.14 + 19.8);
      const leafWeight =
        smoothstep(9, 20, distFromCenter) *
        smoothstep(0.52, 0.78, leafNoise) *
        0.82;
      r = lerp(r, 116 + microVar * 20, leafWeight);
      g = lerp(g, 83 + microVar * 14, leafWeight);
      b = lerp(b, 43 + microVar * 10, leafWeight);

      // 4. Winding Brown Laterite Dirt Path
      if (pathDist < 2.8) {
        const pathWeight = 1 - smoothstep(1.0, 2.55, pathDist);
        const pathGrain = microVar * 18;
        r = lerp(r, 132 + pathGrain, pathWeight);
        g = lerp(g, 86 + pathGrain * 0.75, pathWeight);
        b = lerp(b, 52 + pathGrain * 0.5, pathWeight);
      }

      // 5. Rocky Surfaces (steep slopes, Rocky Hill, Waterfall Cliff)
      const rockyHillMask = 1 - smoothstep(10, 26, Math.hypot(worldX - 54, worldZ - 62));
      const cliffMask = 1 - smoothstep(8, 22, Math.hypot(worldX - 25, worldZ + 60));
      const rockWeight = clamp(
        Math.max(
          smoothstep(0.26, 0.5, slope),
          rockyHillMask * smoothstep(0.32, 0.68, macroVar),
          cliffMask * 0.88
        ),
        0,
        1
      );
      if (rockWeight > 0.01) {
        const rockShade = 90 + microVar * 34;
        r = lerp(r, rockShade, rockWeight);
        g = lerp(g, rockShade * 0.99, rockWeight);
        b = lerp(b, rockShade * 0.92, rockWeight);
      }

      // 6. Riverbank Mud & 7. Sand / Gravel near water
      if (river.distance < river.halfWidth + 5.2) {
        const mudBand =
          1 - smoothstep(river.halfWidth * 0.75, river.halfWidth + 4.4, river.distance);
        r = lerp(r, 56 + microVar * 14, mudBand * 0.88);
        g = lerp(g, 46 + microVar * 11, mudBand * 0.88);
        b = lerp(b, 34 + microVar * 8, mudBand * 0.88);

        const sandBarNoise = valueNoise2D(worldX * 0.18 + 5.1, worldZ * 0.18 + 8.9);
        const isFordOrShore =
          river.distance > river.halfWidth * 0.52 &&
          river.distance < river.halfWidth + 2.3;
        if (isFordOrShore && (sandBarNoise > 0.38 || Math.abs(worldZ - 38) < 6.5)) {
          const sandWeight =
            (1 - smoothstep(0.7, 2.3, Math.abs(river.distance - river.halfWidth * 1.02))) *
            0.9;
          r = lerp(r, 158 + microVar * 22, sandWeight);
          g = lerp(g, 143 + microVar * 19, sandWeight);
          b = lerp(b, 108 + microVar * 15, sandWeight);
        }

        // Riverbed gravel & stones under water
        if (river.distance < river.halfWidth * 0.86) {
          const bedWeight =
            1 - smoothstep(river.halfWidth * 0.4, river.halfWidth * 0.86, river.distance);
          r = lerp(r, 70 + microVar * 22, bedWeight * 0.82);
          g = lerp(g, 74 + microVar * 19, bedWeight * 0.82);
          b = lerp(b, 62 + microVar * 16, bedWeight * 0.82);
        }
      }

      const idx = (py * size + px) * 4;
      data[idx] = clamp(Math.round(r), 0, 255);
      data[idx + 1] = clamp(Math.round(g), 0, 255);
      data[idx + 2] = clamp(Math.round(b), 0, 255);
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  texture.anisotropicFilteringLevel = 4;
  texture.update();
  return texture;
}

/**
 * Seamless tiled micro-detail texture so close-up ground has crisp organic grain.
 */
function createGroundDetailTexture(scene: Scene): DynamicTexture {
  const size = 256;
  const texture = new DynamicTexture('terrainDetailTex', { width: size, height: size }, scene, true);
  const ctx = texture.getContext();

  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);

  let seed = 4099;
  const rand = (): number => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  for (let i = 0; i < 3600; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 0.8 + rand() * 2.8;
    const shade = rand() > 0.5 ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.18)';
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  texture.uScale = 64;
  texture.vScale = 64;
  texture.update();
  return texture;
}

/**
 * Builds an opaque rock-earth perimeter skirt and underside cap beneath the terrain
 * so low or edge camera angles never see floating geometry or empty void below the world.
 */
function createTerrainBaseSkirt(scene: Scene): void {
  const baseDepth = -24;
  const skirtMat = new StandardMaterial('terrainSkirtMat', scene);
  skirtMat.diffuseColor = new Color3(0.18, 0.2, 0.16);
  skirtMat.specularColor = new Color3(0.02, 0.02, 0.02);

  const step = 4;
  const buildEdgeWall = (
    name: string,
    getPoint: (t: number) => [number, number]
  ): void => {
    const topPath: Vector3[] = [];
    const bottomPath: Vector3[] = [];
    for (let i = 0; i <= TERRAIN_SUBDIVISIONS; i += step) {
      const t = i / TERRAIN_SUBDIVISIONS;
      const [x, z] = getPoint(t);
      const y = getExactGroundHeight(x, z);
      topPath.push(new Vector3(x, y + 0.1, z));
      bottomPath.push(new Vector3(x, baseDepth, z));
    }
    const wall = MeshBuilder.CreateRibbon(
      name,
      {
        pathArray: [topPath, bottomPath],
        sideOrientation: Mesh.DOUBLESIDE,
        updatable: false,
      },
      scene
    );
    wall.material = skirtMat;
    wall.isPickable = false;
    wall.freezeWorldMatrix();
  };

  buildEdgeWall('skirtNorth', (t) => [lerp(-MAP_HALF_SIZE, MAP_HALF_SIZE, t), MAP_HALF_SIZE]);
  buildEdgeWall('skirtSouth', (t) => [lerp(-MAP_HALF_SIZE, MAP_HALF_SIZE, t), -MAP_HALF_SIZE]);
  buildEdgeWall('skirtWest', (t) => [-MAP_HALF_SIZE, lerp(-MAP_HALF_SIZE, MAP_HALF_SIZE, t)]);
  buildEdgeWall('skirtEast', (t) => [MAP_HALF_SIZE, lerp(-MAP_HALF_SIZE, MAP_HALF_SIZE, t)]);

  // Solid underside base plane closing off the bottom of the world volume
  const bottomCap = MeshBuilder.CreateGround(
    'terrainUndersideCap',
    { width: MAP_SIZE, height: MAP_SIZE, subdivisions: 1 },
    scene
  );
  bottomCap.position.y = baseDepth;
  bottomCap.material = skirtMat;
  bottomCap.isPickable = false;
  bottomCap.freezeWorldMatrix();

  // Backface-visible solid dark earth layer directly beneath the terrain mesh at baseDepth
  const bottomUnder = MeshBuilder.CreatePlane(
    'terrainUndersidePlate',
    { size: MAP_SIZE, sideOrientation: Mesh.DOUBLESIDE },
    scene
  );
  bottomUnder.position.y = baseDepth;
  bottomUnder.rotation.x = Math.PI / 2;
  bottomUnder.material = skirtMat;
  bottomUnder.isPickable = false;
  bottomUnder.freezeWorldMatrix();
}

export function createGroundAndSky(scene: Scene): GroundAndSkyHandle {
  // Bright, serene tropical forest sky & atmospheric depth
  scene.clearColor = new Color4(0.68, 0.82, 0.84, 1.0);
  scene.ambientColor = new Color3(0.22, 0.28, 0.24);

  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogColor = new Color3(0.73, 0.85, 0.84);
  scene.fogDensity = 0.0044;

  const sunDirection = new Vector3(-0.48, -0.78, -0.4).normalize();
  createSkyDome(scene, sunDirection);

  const hemiLight = new HemisphericLight('forestSkyFill', new Vector3(0, 1, 0), scene);
  hemiLight.diffuse = new Color3(0.88, 0.95, 1.0);
  hemiLight.groundColor = new Color3(0.18, 0.26, 0.17);
  hemiLight.intensity = 0.72;

  const sunLight = new DirectionalLight('forestSunLight', sunDirection, scene);
  sunLight.position = sunDirection.scale(-75);
  sunLight.diffuse = new Color3(1.0, 0.95, 0.83);
  sunLight.specular = new Color3(1.0, 0.92, 0.76);
  sunLight.intensity = 1.4;
  sunLight.shadowMinZ = 10;
  sunLight.shadowMaxZ = 180;
  sunLight.autoUpdateExtends = false;
  sunLight.orthoLeft = -52;
  sunLight.orthoRight = 52;
  sunLight.orthoTop = 52;
  sunLight.orthoBottom = -52;

  const groundMesh = MeshBuilder.CreateGround(
    'emeraldTerrain',
    {
      width: MAP_SIZE,
      height: MAP_SIZE,
      subdivisions: TERRAIN_SUBDIVISIONS,
      updatable: false,
    },
    scene
  );

  const grid = getTerrainHeightGrid();
  const positions = groundMesh.getVerticesData(VertexBuffer.PositionKind);
  const indices = groundMesh.getIndices();
  if (positions && indices) {
    const vertCount = positions.length / 3;
    for (let i = 0; i < vertCount; i++) {
      positions[i * 3 + 1] = grid[i];
    }
    groundMesh.updateVerticesData(VertexBuffer.PositionKind, positions);

    const normals = new Float32Array(positions.length);
    VertexData.ComputeNormals(positions, indices, normals);
    groundMesh.updateVerticesData(VertexBuffer.NormalKind, normals);
  }

  const groundMat = new StandardMaterial('emeraldTerrainMat', scene);
  groundMat.diffuseTexture = createBiomeMacroTexture(scene);
  groundMat.specularColor = new Color3(0.05, 0.05, 0.04);
  groundMat.ambientColor = new Color3(0.28, 0.34, 0.28);

  const detailTex = createGroundDetailTexture(scene);
  groundMat.detailMap.texture = detailTex;
  groundMat.detailMap.isEnabled = true;
  groundMat.detailMap.diffuseBlendLevel = 0.42;
  groundMat.detailMap.bumpLevel = 0.34;

  groundMesh.material = groundMat;
  groundMesh.receiveShadows = true;
  groundMesh.freezeWorldMatrix();

  createTerrainBaseSkirt(scene);

  return {
    groundMesh,
    sunLight,
    hemiLight,
  };
}
