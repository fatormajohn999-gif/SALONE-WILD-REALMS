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
  clamp,
  fbm2D,
  getPathDistance,
  getRiverInfo,
  getTerrainHeight,
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
    const horizonColor = new Color3(0.77, 0.88, 0.87);
    const midSkyColor = new Color3(0.42, 0.68, 0.86);
    const zenithColor = new Color3(0.17, 0.42, 0.68);
    const lowerColor = new Color3(0.24, 0.36, 0.29);

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
        col = Color3.Lerp(horizonColor, lowerColor, Math.min(1, -normalizedY * 2.5));
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
 * Paints a 512x512 multi-biome world map matching terrainMath:
 * forest grass, dark soil, laterite brown dirt path, fallen leaf litter,
 * rocky surfaces, riverbank mud, and sandy/gravel water margins.
 */
function createBiomeMacroTexture(scene: Scene): DynamicTexture {
  const size = 512;
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
      const microVar = valueNoise2D(worldX * 0.25, worldZ * 0.25);

      // 1. Base Natural Forest Grass
      let r = lerp(54, 78, macroVar);
      let g = lerp(89, 121, macroVar);
      let b = lerp(47, 61, macroVar);

      // 2. Dark Forest Soil under wooded regions (outside clearing & path)
      const distFromCenter = Math.hypot(worldX, worldZ);
      const soilNoise = valueNoise2D(worldX * 0.08 + 12.4, worldZ * 0.08 + 3.1);
      const soilWeight =
        smoothstep(12, 26, distFromCenter) *
        smoothstep(0.46, 0.72, soilNoise) *
        0.72;
      r = lerp(r, 46 + microVar * 12, soilWeight);
      g = lerp(g, 39 + microVar * 10, soilWeight);
      b = lerp(b, 28 + microVar * 8, soilWeight);

      // 3. Fallen Leaf-Covered Ground (warm amber/russet patches in forest floor)
      const leafNoise = valueNoise2D(worldX * 0.13 + 31.2, worldZ * 0.13 + 19.8);
      const leafWeight =
        smoothstep(10, 22, distFromCenter) *
        smoothstep(0.55, 0.78, leafNoise) *
        0.78;
      r = lerp(r, 114 + microVar * 18, leafWeight);
      g = lerp(g, 83 + microVar * 14, leafWeight);
      b = lerp(b, 44 + microVar * 10, leafWeight);

      // 4. Winding Brown Laterite Dirt Path
      if (pathDist < 2.6) {
        const pathWeight = 1 - smoothstep(0.95, 2.4, pathDist);
        const pathGrain = microVar * 16;
        r = lerp(r, 126 + pathGrain, pathWeight);
        g = lerp(g, 84 + pathGrain * 0.75, pathWeight);
        b = lerp(b, 53 + pathGrain * 0.5, pathWeight);
      }

      // 5. Rocky Surfaces (steep slopes, Rocky Hill, Waterfall Cliff)
      const rockyHillMask = 1 - smoothstep(10, 26, Math.hypot(worldX - 54, worldZ - 62));
      const cliffMask = 1 - smoothstep(8, 22, Math.hypot(worldX - 52, worldZ + 64));
      const rockWeight = clamp(
        Math.max(
          smoothstep(0.28, 0.52, slope),
          rockyHillMask * smoothstep(0.35, 0.7, macroVar),
          cliffMask * 0.85
        ),
        0,
        1
      );
      if (rockWeight > 0.01) {
        const rockShade = 92 + microVar * 32;
        r = lerp(r, rockShade, rockWeight);
        g = lerp(g, rockShade * 0.99, rockWeight);
        b = lerp(b, rockShade * 0.93, rockWeight);
      }

      // 6. Riverbank Mud & 7. Sand / Gravel near water
      if (worldZ >= -52 && river.distance < river.halfWidth + 4.8) {
        const mudBand =
          1 - smoothstep(river.halfWidth * 0.7, river.halfWidth + 4.2, river.distance);
        r = lerp(r, 58 + microVar * 12, mudBand * 0.85);
        g = lerp(g, 48 + microVar * 10, mudBand * 0.85);
        b = lerp(b, 36 + microVar * 8, mudBand * 0.85);

        const sandBarNoise = valueNoise2D(worldX * 0.18 + 5.1, worldZ * 0.18 + 8.9);
        const isFordOrShore =
          river.distance > river.halfWidth * 0.45 &&
          river.distance < river.halfWidth + 2.1;
        if (isFordOrShore && (sandBarNoise > 0.42 || Math.abs(worldZ - 40) < 6)) {
          const sandWeight =
            (1 - smoothstep(0.8, 2.2, Math.abs(river.distance - river.halfWidth * 0.95))) *
            0.88;
          r = lerp(r, 154 + microVar * 20, sandWeight);
          g = lerp(g, 140 + microVar * 18, sandWeight);
          b = lerp(b, 108 + microVar * 14, sandWeight);
        }

        // Darker riverbed gravel under shallow water
        if (river.distance < river.halfWidth * 0.78) {
          const bedWeight = 1 - smoothstep(river.halfWidth * 0.35, river.halfWidth * 0.78, river.distance);
          r = lerp(r, 64 + microVar * 18, bedWeight * 0.75);
          g = lerp(g, 66 + microVar * 16, bedWeight * 0.75);
          b = lerp(b, 56 + microVar * 14, bedWeight * 0.75);
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
 * Small seamless tiled micro-detail texture so close-up ground has crisp organic grain.
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

  for (let i = 0; i < 3200; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 0.8 + rand() * 2.8;
    const shade = rand() > 0.5 ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.16)';
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  texture.uScale = 58;
  texture.vScale = 58;
  texture.update();
  return texture;
}

export function createGroundAndSky(scene: Scene): GroundAndSkyHandle {
  // Bright, serene tropical forest sky & atmospheric depth
  scene.clearColor = new Color4(0.68, 0.82, 0.84, 1.0);
  scene.ambientColor = new Color3(0.22, 0.28, 0.24);

  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogColor = new Color3(0.73, 0.85, 0.84);
  scene.fogDensity = 0.0046;

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
      subdivisions: 150,
      updatable: false,
    },
    scene
  );

  const positions = groundMesh.getVerticesData(VertexBuffer.PositionKind);
  const indices = groundMesh.getIndices();
  if (positions && indices) {
    for (let i = 0; i < positions.length / 3; i++) {
      const x = positions[i * 3];
      const z = positions[i * 3 + 2];
      positions[i * 3 + 1] = getTerrainHeight(x, z);
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
  groundMat.detailMap.diffuseBlendLevel = 0.36;
  groundMat.detailMap.bumpLevel = 0.28;

  groundMesh.material = groundMat;
  groundMesh.receiveShadows = true;
  groundMesh.freezeWorldMatrix();

  return {
    groundMesh,
    sunLight,
    hemiLight,
  };
}
