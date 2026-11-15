import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import '@babylonjs/core/Meshes/thinInstanceMesh';
import type { Scene } from '@babylonjs/core/scene';
import type { ColliderCircle } from '../types';
import {
  getExactGroundHeight,
  getFootprintMinGroundHeight,
  getRiverCenterX,
  getRiverInfo,
  getStreamWaterY,
  valueNoise2D,
} from './terrainMath';

export interface WaterHandle {
  update: (dt: number) => void;
  colliders: ColliderCircle[];
}

function createWaterRippleTexture(scene: Scene): DynamicTexture {
  const size = 256;
  const tex = new DynamicTexture('waterRippleTex', { width: size, height: size }, scene, true);
  const ctx = tex.getContext();

  ctx.fillStyle = '#1E7E8B';
  ctx.fillRect(0, 0, size, size);

  let seed = 7919;
  const rand = (): number => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  // Clear blue-green current streaks & sunlit surface ripples
  for (let i = 0; i < 480; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const w = 2 + rand() * 7;
    const h = 14 + rand() * 36;
    const bright = rand() > 0.42;
    ctx.fillStyle = bright
      ? 'rgba(186, 246, 240, 0.22)'
      : 'rgba(14, 66, 78, 0.22)';
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, h / w);
    ctx.beginPath();
    ctx.arc(0, 0, w, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  tex.uScale = 2.4;
  tex.vScale = 30;
  tex.wrapU = DynamicTexture.WRAP_ADDRESSMODE;
  tex.wrapV = DynamicTexture.WRAP_ADDRESSMODE;
  tex.update();
  return tex;
}

function createWaterfallFoamTexture(scene: Scene): DynamicTexture {
  const size = 256;
  const tex = new DynamicTexture('waterfallFoamTex', { width: size, height: size }, scene, true);
  const ctx = tex.getContext();

  ctx.fillStyle = '#4FB2B8';
  ctx.fillRect(0, 0, size, size);

  let seed = 3571;
  const rand = (): number => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  for (let i = 0; i < 560; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const w = 2 + rand() * 7;
    const h = 18 + rand() * 48;
    ctx.fillStyle =
      rand() > 0.28 ? 'rgba(238, 253, 252, 0.42)' : 'rgba(128, 214, 218, 0.28)';
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, h / w);
    ctx.beginPath();
    ctx.arc(0, 0, w, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  tex.uScale = 1.6;
  tex.vScale = 3.2;
  tex.wrapU = DynamicTexture.WRAP_ADDRESSMODE;
  tex.wrapV = DynamicTexture.WRAP_ADDRESSMODE;
  tex.update();
  return tex;
}

export function createWaterAndWaterfall(scene: Scene): WaterHandle {
  const colliders: ColliderCircle[] = [];

  // 1. Continuous Stream Water Ribbon (z = -42 to 124) with perpendicular bank offsets
  //    plus circular Plunge Pool basin at (poolCenterX, -42)
  const leftBank: Vector3[] = [];
  const rightBank: Vector3[] = [];

  for (let z = -40; z <= 124; z += 1.25) {
    const cx = getRiverCenterX(z);
    const info = getRiverInfo(cx, z);
    const slope = getRiverCenterX(z + 0.5) - getRiverCenterX(z - 0.5);
    const invLen = 1 / Math.sqrt(1 + slope * slope);
    const nx = invLen;
    const nz = -slope * invLen;
    // Terrain crosses waterY around 0.92 * halfWidth and reaches +0.65 by 1.08 * halfWidth,
    // so 1.03 * halfWidth tucks the water sheet edge neatly into the earthen banks.
    const span = info.halfWidth * 1.03;
    const y = getStreamWaterY(z);
    leftBank.push(new Vector3(cx - nx * span, y, z - nz * span));
    rightBank.push(new Vector3(cx + nx * span, y, z + nz * span));
  }

  const streamMesh = MeshBuilder.CreateRibbon(
    'kambuiStreamWater',
    {
      pathArray: [leftBank, rightBank],
      sideOrientation: Mesh.DOUBLESIDE,
      updatable: false,
    },
    scene
  );
  streamMesh.isPickable = false;

  const waterTex = createWaterRippleTexture(scene);
  const waterMat = new StandardMaterial('kambuiWaterMat', scene);
  waterMat.diffuseTexture = waterTex;
  waterMat.diffuseColor = new Color3(0.42, 0.88, 0.86);
  waterMat.emissiveColor = new Color3(0.06, 0.25, 0.27);
  waterMat.specularColor = new Color3(0.9, 0.98, 0.98);
  waterMat.specularPower = 60;
  waterMat.alpha = 0.83;
  waterMat.backFaceCulling = false;
  streamMesh.material = waterMat;
  streamMesh.freezeWorldMatrix();

  // Plunge pool water surface tucked cleanly under the carved circular basin (radius 10.2 -> 10.5)
  const poolCenterX = getRiverCenterX(-42);
  const poolWaterY = getStreamWaterY(-42);
  const poolDisc = MeshBuilder.CreateDisc(
    'kambuiPlungePoolWater',
    { radius: 10.5, tessellation: 28 },
    scene
  );
  poolDisc.position.set(poolCenterX, poolWaterY, -42);
  poolDisc.rotation.x = Math.PI / 2;
  poolDisc.material = waterMat;
  poolDisc.isPickable = false;
  poolDisc.freezeWorldMatrix();

  // 2. Waterfall Cascade pouring off the South-East Cliff directly into the Plunge Pool (z = -42)
  const cliffTopZ = -56.5;
  const cliffGroundY = getExactGroundHeight(poolCenterX + 0.8, cliffTopZ);
  const cliffTopY = Math.max(poolWaterY + 6.4, cliffGroundY - 0.45);

  const wfLeft: Vector3[] = [];
  const wfRight: Vector3[] = [];
  const steps = 14;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // Parabolic cascade from cliff crest (-56.5) directly into plunge pool (-45.5)
    const z = cliffTopZ + t * 11.0;
    const dropCurve = Math.pow(t, 1.6);
    const y = cliffTopY * (1 - dropCurve) + (poolWaterY - 0.18) * dropCurve;
    const width = 2.2 + t * 1.45;
    const centerX = poolCenterX + 0.8 - t * 0.5;
    wfLeft.push(new Vector3(centerX - width, y, z));
    wfRight.push(new Vector3(centerX + width, y, z));
  }

  const waterfallMesh = MeshBuilder.CreateRibbon(
    'kambuiWaterfall',
    {
      pathArray: [wfLeft, wfRight],
      sideOrientation: Mesh.DOUBLESIDE,
      updatable: false,
    },
    scene
  );
  waterfallMesh.isPickable = false;

  const waterfallTex = createWaterfallFoamTexture(scene);
  const waterfallMat = new StandardMaterial('waterfallMat', scene);
  waterfallMat.diffuseTexture = waterfallTex;
  waterfallMat.emissiveColor = new Color3(0.32, 0.56, 0.58);
  waterfallMat.specularColor = new Color3(0.92, 0.99, 1.0);
  waterfallMat.alpha = 0.88;
  waterfallMesh.material = waterfallMat;
  waterfallMesh.freezeWorldMatrix();

  // Splash foam ring resting on the plunge pool surface
  const foamRing = MeshBuilder.CreateDisc(
    'waterfallFoamPool',
    { radius: 4.5, tessellation: 20 },
    scene
  );
  foamRing.position.set(poolCenterX + 0.3, poolWaterY + 0.035, -45.2);
  foamRing.rotation.x = Math.PI / 2;
  foamRing.isPickable = false;
  const foamMat = new StandardMaterial('waterfallFoamRingMat', scene);
  foamMat.diffuseColor = new Color3(0.88, 0.98, 0.97);
  foamMat.emissiveColor = new Color3(0.36, 0.54, 0.54);
  foamMat.alpha = 0.55;
  foamRing.material = foamMat;
  foamRing.freezeWorldMatrix();

  // 3. River Bank Stones, Submerged Stream Boulders, Waterfall Cliff Rocks, and Stepping-Stone Ford
  const riverStoneBase = MeshBuilder.CreatePolyhedron(
    'riverStoneTemplate',
    { type: 1, size: 0.6 },
    scene
  );
  riverStoneBase.isPickable = false;
  riverStoneBase.receiveShadows = true;
  const riverStoneMat = new StandardMaterial('riverStoneMat', scene);
  riverStoneMat.diffuseColor = new Color3(0.39, 0.42, 0.4);
  riverStoneMat.specularColor = new Color3(0.22, 0.24, 0.23);
  riverStoneBase.material = riverStoneMat;

  const stoneMatrices: number[] = [];
  const pushMatrix = (
    pos: Vector3,
    rotY: number,
    scale: Vector3,
    tiltX = 0,
    tiltZ = 0
  ): void => {
    const q = Quaternion.RotationYawPitchRoll(rotY, tiltX, tiltZ);
    const m = Matrix.Compose(scale, q, pos);
    for (let i = 0; i < 16; i++) {
      stoneMatrices.push(m.m[i]);
    }
  };

  // Stones lining both banks and partially submerged inside the stream
  for (let z = -47; z <= 118; z += 3.0) {
    const cx = getRiverCenterX(z);
    const info = getRiverInfo(cx, z);
    const n1 = valueNoise2D(z * 0.41, 11.3);
    const n2 = valueNoise2D(z * 0.37, 27.9);
    const n3 = valueNoise2D(z * 0.63, 41.7);

    // Left bank stone (rooted on bank slope)
    if (n1 > 0.3) {
      const sx = cx - info.halfWidth * (0.94 + n1 * 0.32);
      const scale = 0.65 + n1 * 1.05;
      const minY = getFootprintMinGroundHeight(sx, z, scale * 0.45);
      pushMatrix(
        new Vector3(sx, minY + scale * 0.14, z),
        n1 * Math.PI * 2,
        new Vector3(scale * 1.22, scale * 0.62, scale)
      );
      if (scale > 1.25 && Math.abs(z - 38) > 6) {
        colliders.push({ x: sx, z, radius: scale * 0.52 });
      }
    }

    // Right bank stone (rooted on bank slope)
    if (n2 > 0.34) {
      const sx = cx + info.halfWidth * (0.94 + n2 * 0.32);
      const scale = 0.6 + n2 * 1.0;
      const sz = z + 1.2;
      const minY = getFootprintMinGroundHeight(sx, sz, scale * 0.45);
      pushMatrix(
        new Vector3(sx, minY + scale * 0.14, sz),
        n2 * Math.PI * 2,
        new Vector3(scale, scale * 0.58, scale * 1.24)
      );
      if (scale > 1.25 && Math.abs(z - 38) > 6) {
        colliders.push({ x: sx, z: sz, radius: scale * 0.52 });
      }
    }

    // Partially submerged rocks sitting directly on the riverbed and peeking above water
    if (n3 > 0.55 && Math.abs(z - 38) > 6 && z > -38) {
      const side = n1 > 0.5 ? 1 : -1;
      const sx = cx + side * info.halfWidth * (0.38 + (n3 - 0.55) * 0.8);
      const sz = z + 0.6;
      const bedY = getExactGroundHeight(sx, sz);
      const scale = 0.72 + n3 * 0.85;
      pushMatrix(
        new Vector3(sx, bedY + scale * 0.28, sz),
        n3 * Math.PI * 2,
        new Vector3(scale * 1.18, scale * 0.78, scale)
      );
    }
  }

  // Flat-topped stepping stones anchored on the riverbed across the shallow ford (z ≈ 38)
  const fordZ = 38.2;
  const fordCenterX = getRiverCenterX(fordZ);
  for (let i = -2; i <= 2; i++) {
    const fx = fordCenterX + i * 1.62;
    const fz = fordZ + Math.sin(i * 1.1) * 0.42;
    const bedY = getExactGroundHeight(fx, fz);
    const waterY = getStreamWaterY(fz);
    const stoneTop = waterY + 0.08;
    const stoneCenterY = (bedY + stoneTop) * 0.5;
    const halfH = Math.max(0.18, (stoneTop - bedY) * 0.55);
    pushMatrix(
      new Vector3(fx, stoneCenterY, fz),
      i * 0.7,
      new Vector3(1.22, halfH * 1.65, 1.04)
    );
  }

  // Large framing boulders flanking the waterfall cliff
  const cliffBoulders = [
    { x: poolCenterX - 3.6, z: -53.5, s: new Vector3(3.4, 4.2, 3.0), r: 1.9 },
    { x: poolCenterX + 5.6, z: -53.5, s: new Vector3(3.6, 4.5, 3.2), r: 2.0 },
    { x: poolCenterX - 5.4, z: -48.5, s: new Vector3(2.8, 2.5, 2.6), r: 1.55 },
    { x: poolCenterX + 6.5, z: -48.0, s: new Vector3(2.9, 2.6, 2.5), r: 1.65 },
    { x: poolCenterX + 0.9, z: -56.5, s: new Vector3(4.2, 2.2, 2.5), r: 2.2 },
  ];
  cliffBoulders.forEach((b, idx) => {
    const minY = getFootprintMinGroundHeight(b.x, b.z, b.r * 0.65);
    pushMatrix(new Vector3(b.x, minY + b.s.y * 0.22, b.z), idx * 0.9, b.s);
    colliders.push({ x: b.x, z: b.z, radius: b.r });
  });

  if (stoneMatrices.length > 0) {
    riverStoneBase.thinInstanceSetBuffer('matrix', new Float32Array(stoneMatrices), 16, true);
    riverStoneBase.thinInstanceRefreshBoundingInfo(false);
  }

  const update = (dt: number): void => {
    // Scroll stream ripples downstream (+Z direction) and waterfall downward
    waterTex.vOffset -= dt * 0.52;
    waterfallTex.vOffset += dt * 1.5;
  };

  return {
    update,
    colliders,
  };
}
