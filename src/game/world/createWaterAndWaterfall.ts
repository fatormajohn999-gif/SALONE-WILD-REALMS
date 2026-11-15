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
  getRiverCenterX,
  getRiverInfo,
  getStreamWaterY,
  getTerrainHeight,
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

  ctx.fillStyle = '#257B79';
  ctx.fillRect(0, 0, size, size);

  let seed = 7919;
  const rand = (): number => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  // Soft longitudinal current streaks & sunlit ripples
  for (let i = 0; i < 420; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const w = 2 + rand() * 8;
    const h = 14 + rand() * 34;
    const bright = rand() > 0.45;
    ctx.fillStyle = bright
      ? 'rgba(182, 240, 232, 0.14)'
      : 'rgba(18, 68, 72, 0.16)';
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, h / w);
    ctx.beginPath();
    ctx.arc(0, 0, w, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  tex.uScale = 2.2;
  tex.vScale = 28;
  tex.wrapU = DynamicTexture.WRAP_ADDRESSMODE;
  tex.wrapV = DynamicTexture.WRAP_ADDRESSMODE;
  tex.update();
  return tex;
}

function createWaterfallFoamTexture(scene: Scene): DynamicTexture {
  const size = 256;
  const tex = new DynamicTexture('waterfallFoamTex', { width: size, height: size }, scene, true);
  const ctx = tex.getContext();

  ctx.fillStyle = '#4EA8AA';
  ctx.fillRect(0, 0, size, size);

  let seed = 3571;
  const rand = (): number => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  for (let i = 0; i < 520; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const w = 2 + rand() * 7;
    const h = 18 + rand() * 48;
    ctx.fillStyle =
      rand() > 0.3 ? 'rgba(235, 252, 250, 0.35)' : 'rgba(130, 212, 214, 0.25)';
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

  // 1. Stream Water Ribbon along carved riverbed (z = -51 to z = 124)
  const leftBank: Vector3[] = [];
  const rightBank: Vector3[] = [];

  for (let z = -51; z <= 124; z += 2) {
    const cx = getRiverCenterX(z);
    const info = getRiverInfo(cx, z);
    const span = info.halfWidth * 1.15;
    const y = getStreamWaterY(z);
    leftBank.push(new Vector3(cx - span, y, z));
    rightBank.push(new Vector3(cx + span, y, z));
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
  waterMat.diffuseColor = new Color3(0.45, 0.85, 0.82);
  waterMat.emissiveColor = new Color3(0.08, 0.24, 0.23);
  waterMat.specularColor = new Color3(0.85, 0.96, 0.94);
  waterMat.specularPower = 52;
  waterMat.alpha = 0.78;
  waterMat.backFaceCulling = false;
  streamMesh.material = waterMat;
  streamMesh.freezeWorldMatrix();

  // 2. Waterfall Cascade at the South-East Cliff into the Plunge Pool
  const poolCenterX = getRiverCenterX(-44);
  const poolWaterY = getStreamWaterY(-44);
  const cliffTopZ = -58;
  const cliffTopY = Math.max(poolWaterY + 7.2, getTerrainHeight(poolCenterX + 1.5, cliffTopZ) - 0.6);

  const wfLeft: Vector3[] = [];
  const wfRight: Vector3[] = [];
  const steps = 12;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // Smooth parabolic water arc falling from cliffTopZ to -49.5
    const z = cliffTopZ + t * 8.5;
    const dropCurve = Math.pow(t, 1.55);
    const y = cliffTopY * (1 - dropCurve) + (poolWaterY - 0.15) * dropCurve;
    const width = 2.1 + t * 1.3;
    const centerX = poolCenterX + 1.2 - t * 0.6;
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
  waterfallMat.emissiveColor = new Color3(0.32, 0.55, 0.56);
  waterfallMat.specularColor = new Color3(0.9, 0.98, 1.0);
  waterfallMat.alpha = 0.88;
  waterfallMesh.material = waterfallMat;
  waterfallMesh.freezeWorldMatrix();

  // Splash foam ring at waterfall base
  const foamRing = MeshBuilder.CreateDisc(
    'waterfallFoamPool',
    { radius: 4.4, tessellation: 18 },
    scene
  );
  foamRing.position.set(poolCenterX + 0.6, poolWaterY + 0.04, -49.2);
  foamRing.rotation.x = Math.PI / 2;
  foamRing.isPickable = false;
  const foamMat = new StandardMaterial('waterfallFoamRingMat', scene);
  foamMat.diffuseColor = new Color3(0.88, 0.97, 0.96);
  foamMat.emissiveColor = new Color3(0.35, 0.52, 0.52);
  foamMat.alpha = 0.52;
  foamRing.material = foamMat;
  foamRing.freezeWorldMatrix();

  // 3. River Stones, Waterfall Cliff Rocks, and Stepping-Stone Ford (ThinInstanced)
  const riverStoneBase = MeshBuilder.CreatePolyhedron(
    'riverStoneTemplate',
    { type: 1, size: 0.6 },
    scene
  );
  riverStoneBase.isPickable = false;
  riverStoneBase.receiveShadows = true;
  const riverStoneMat = new StandardMaterial('riverStoneMat', scene);
  riverStoneMat.diffuseColor = new Color3(0.41, 0.43, 0.4);
  riverStoneMat.specularColor = new Color3(0.18, 0.2, 0.19);
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

  // Stones lining both banks along the stream
  for (let z = -50; z <= 116; z += 3.2) {
    const cx = getRiverCenterX(z);
    const info = getRiverInfo(cx, z);
    const n1 = valueNoise2D(z * 0.41, 11.3);
    const n2 = valueNoise2D(z * 0.37, 27.9);

    if (n1 > 0.32) {
      const sx = cx - info.halfWidth * (0.85 + n1 * 0.45);
      const sy = getTerrainHeight(sx, z);
      const scale = 0.65 + n1 * 1.1;
      pushMatrix(
        new Vector3(sx, sy + scale * 0.18, z),
        n1 * Math.PI * 2,
        new Vector3(scale * 1.2, scale * 0.62, scale)
      );
      if (scale > 1.25 && Math.abs(z - 40) > 6) {
        colliders.push({ x: sx, z, radius: scale * 0.55 });
      }
    }

    if (n2 > 0.35) {
      const sx = cx + info.halfWidth * (0.85 + n2 * 0.45);
      const sy = getTerrainHeight(sx, z);
      const scale = 0.6 + n2 * 1.05;
      pushMatrix(
        new Vector3(sx, sy + scale * 0.18, z + 1.2),
        n2 * Math.PI * 2,
        new Vector3(scale, scale * 0.58, scale * 1.25)
      );
      if (scale > 1.25 && Math.abs(z - 40) > 6) {
        colliders.push({ x: sx, z: z + 1.2, radius: scale * 0.55 });
      }
    }
  }

  // Flat-topped stepping stones across the shallow ford where the dirt path crosses (z ≈ 40)
  const fordZ = 40.3;
  const fordCenterX = getRiverCenterX(fordZ);
  for (let i = -2; i <= 2; i++) {
    const fx = fordCenterX + i * 1.65;
    const fz = fordZ + Math.sin(i * 1.1) * 0.45;
    const fy = getStreamWaterY(fz);
    pushMatrix(
      new Vector3(fx, fy - 0.06, fz),
      i * 0.7,
      new Vector3(1.25, 0.38, 1.05)
    );
  }

  // Large framing boulders flanking the waterfall cliff
  const cliffBoulders = [
    { x: poolCenterX - 3.4, z: -56, s: new Vector3(3.6, 4.4, 3.2), r: 2.0 },
    { x: poolCenterX + 6.0, z: -56, s: new Vector3(3.8, 4.8, 3.4), r: 2.2 },
    { x: poolCenterX - 5.2, z: -51, s: new Vector3(2.8, 2.5, 2.6), r: 1.6 },
    { x: poolCenterX + 6.8, z: -50, s: new Vector3(3.0, 2.7, 2.5), r: 1.7 },
    { x: poolCenterX + 1.2, z: -58.5, s: new Vector3(4.5, 2.4, 2.8), r: 2.4 },
  ];
  cliffBoulders.forEach((b, idx) => {
    const by = getTerrainHeight(b.x, b.z);
    pushMatrix(new Vector3(b.x, by + b.s.y * 0.28, b.z), idx * 0.9, b.s);
    colliders.push({ x: b.x, z: b.z, radius: b.r });
  });

  if (stoneMatrices.length > 0) {
    riverStoneBase.thinInstanceSetBuffer('matrix', new Float32Array(stoneMatrices), 16, true);
  }

  const update = (dt: number): void => {
    // Scroll stream ripples downstream (+Z direction) and waterfall downward
    waterTex.vOffset -= dt * 0.48;
    waterfallTex.vOffset += dt * 1.45;
  };

  return {
    update,
    colliders,
  };
}
