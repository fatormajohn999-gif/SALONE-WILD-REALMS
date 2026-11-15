import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import '@babylonjs/core/Meshes/thinInstanceMesh';
import type { Scene } from '@babylonjs/core/scene';
import type { ColliderCircle } from '../types';
import {
  PLAYABLE_BOUNDARY,
  clamp,
  getExactGroundHeight,
  getFootprintMinGroundHeight,
  getPathDistance,
  getRiverInfo,
  getTerrainSlope,
  valueNoise2D,
} from './terrainMath';

export interface ForestFloraHandle {
  colliders: ColliderCircle[];
  shadowCasterMeshes: AbstractMesh[];
  heroShadowMeshes: AbstractMesh[];
}

interface TreeArchetype {
  trunk: Mesh;
  canopy: Mesh;
  trunkRadius: number;
}

function createBarkTexture(scene: Scene): DynamicTexture {
  const size = 128;
  const tex = new DynamicTexture('treeBarkTex', { width: size, height: size }, scene, true);
  const ctx = tex.getContext();

  ctx.fillStyle = '#4E3827';
  ctx.fillRect(0, 0, size, size);

  let seed = 911;
  const rand = (): number => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  for (let i = 0; i < 180; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const w = 1 + rand() * 3;
    const h = 14 + rand() * 38;
    ctx.fillStyle = rand() > 0.5 ? 'rgba(32, 21, 14, 0.42)' : 'rgba(104, 78, 56, 0.28)';
    ctx.fillRect(x, y, w, h);
  }

  tex.uScale = 2;
  tex.vScale = 3;
  tex.update();
  return tex;
}

function createFoliageTexture(scene: Scene, baseHex: string, name: string): DynamicTexture {
  const size = 128;
  const tex = new DynamicTexture(name, { width: size, height: size }, scene, true);
  const ctx = tex.getContext();

  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, size, size);

  let seed = 2311;
  const rand = (): number => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  for (let i = 0; i < 280; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 3 + rand() * 8;
    ctx.fillStyle = rand() > 0.48 ? 'rgba(130, 185, 95, 0.2)' : 'rgba(16, 42, 22, 0.25)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  tex.update();
  return tex;
}

function appendInstanceMatrix(
  target: number[],
  pos: Vector3,
  rotY: number,
  scale: Vector3,
  pitchX = 0,
  rollZ = 0
): void {
  const q = Quaternion.RotationYawPitchRoll(rotY, pitchX, rollZ);
  const m = Matrix.Compose(scale, q, pos);
  for (let i = 0; i < 16; i++) {
    target.push(m.m[i]);
  }
}

/**
 * Builds a tapered cylinder connecting exact world-local endpoints p0 -> p1
 * with exact Quaternion orientation and baked world matrix ready for Mesh.MergeMeshes.
 */
function createConnectedSegment(
  name: string,
  p0: Vector3,
  p1: Vector3,
  diamBottom: number,
  diamTop: number,
  tessellation: number,
  scene: Scene
): Mesh {
  const diff = p1.subtract(p0);
  const length = Math.max(0.05, diff.length());
  const seg = MeshBuilder.CreateCylinder(
    name,
    {
      height: length,
      diameterBottom: diamBottom,
      diameterTop: diamTop,
      tessellation,
    },
    scene
  );

  seg.position.copyFrom(p0).addInPlace(p1).scaleInPlace(0.5);
  const dir = diff.scale(1 / length);
  if (dir.y < -0.9999) {
    seg.rotation.x = Math.PI;
  } else {
    const q = new Quaternion();
    Quaternion.FromUnitVectorsToRef(Vector3.Up(), dir, q);
    seg.rotationQuaternion = q;
  }
  seg.computeWorldMatrix(true);
  return seg;
}

function setUniformVertexColor(mesh: Mesh, color: Color3): void {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  if (!positions) return;
  const count = positions.length / 3;
  const colors = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    colors[i * 4] = color.r;
    colors[i * 4 + 1] = color.g;
    colors[i * 4 + 2] = color.b;
    colors[i * 4 + 3] = 1.0;
  }
  mesh.setVerticesData(VertexBuffer.ColorKind, colors);
}

function buildTreeArchetype(
  scene: Scene,
  id: number,
  barkMat: StandardMaterial,
  canopyMat: StandardMaterial,
  config: {
    height: number;
    trunkRadius: number;
    leanX: number;
    leanZ: number;
    canopyClusters: Array<{
      x: number;
      y: number;
      z: number;
      sx: number;
      sy: number;
      sz: number;
      branchFrom?: 'mid' | 'fork' | 'crown';
    }>;
  }
): TreeArchetype {
  const trunkParts: Mesh[] = [];
  const canopyParts: Mesh[] = [];

  // Continuous spine from deeply buried base (-0.85m) to crown apex
  const basePt = new Vector3(0, -0.85, 0);
  const midPt = new Vector3(config.leanX * 0.42, config.height * 0.52, config.leanZ * 0.42);
  const forkPt = new Vector3(config.leanX * 0.78, config.height * 0.74, config.leanZ * 0.78);
  const crownPt = new Vector3(config.leanX, config.height * 0.96, config.leanZ);

  trunkParts.push(
    createConnectedSegment(
      `arch_${id}_lowerTrunk`,
      basePt,
      midPt,
      config.trunkRadius * 2.25,
      config.trunkRadius * 1.5,
      7,
      scene
    ),
    createConnectedSegment(
      `arch_${id}_midTrunk`,
      new Vector3(midPt.x, midPt.y - 0.14, midPt.z),
      forkPt,
      config.trunkRadius * 1.52,
      config.trunkRadius * 1.06,
      7,
      scene
    ),
    createConnectedSegment(
      `arch_${id}_upperLeader`,
      new Vector3(forkPt.x, forkPt.y - 0.1, forkPt.z),
      crownPt,
      config.trunkRadius * 1.08,
      config.trunkRadius * 0.44,
      6,
      scene
    )
  );

  // 4 flared roots connecting inside lower trunk down to -0.78m below origin
  for (let r = 0; r < 4; r++) {
    const angle = (r / 4) * Math.PI * 2 + id * 0.65;
    const rootStart = new Vector3(
      Math.cos(angle) * config.trunkRadius * 0.35,
      0.88,
      Math.sin(angle) * config.trunkRadius * 0.35
    );
    const rootEnd = new Vector3(
      Math.cos(angle) * config.trunkRadius * 2.05,
      -0.78,
      Math.sin(angle) * config.trunkRadius * 2.05
    );
    trunkParts.push(
      createConnectedSegment(
        `arch_${id}_root_${r}`,
        rootStart,
        rootEnd,
        config.trunkRadius * 0.45,
        config.trunkRadius * 0.92,
        5,
        scene
      )
    );
  }

  // Every canopy cluster connects via a continuous branch back to the trunk spine
  config.canopyClusters.forEach((c, cIdx) => {
    const clusterCenter = new Vector3(c.x, c.y, c.z);
    const originNode =
      c.branchFrom === 'mid'
        ? midPt
        : c.branchFrom === 'crown'
          ? crownPt
          : forkPt;

    const branchTarget = new Vector3(c.x, c.y - c.sy * 0.22, c.z);
    if (branchTarget.subtract(originNode).length() > 0.6) {
      trunkParts.push(
        createConnectedSegment(
          `arch_${id}_branch_${cIdx}`,
          originNode,
          branchTarget,
          config.trunkRadius * (c.branchFrom === 'crown' ? 0.48 : 0.72),
          config.trunkRadius * 0.24,
          5,
          scene
        )
      );
    }

    const cluster = MeshBuilder.CreateIcoSphere(
      `arch_${id}_leaf_${cIdx}`,
      { radius: 1, subdivisions: 1 },
      scene
    );
    cluster.position.copyFrom(clusterCenter);
    cluster.scaling.set(c.sx, c.sy, c.sz);
    cluster.rotation.y = cIdx * 0.85;
    cluster.computeWorldMatrix(true);
    canopyParts.push(cluster);
  });

  const trunk = Mesh.MergeMeshes(trunkParts, true, true, undefined, false, false)!;
  trunk.name = `treeArchetypeTrunk_${id}`;
  trunk.material = barkMat;
  trunk.isPickable = false;
  trunk.receiveShadows = true;

  const canopy = Mesh.MergeMeshes(canopyParts, true, true, undefined, false, false)!;
  canopy.name = `treeArchetypeCanopy_${id}`;
  canopy.material = canopyMat;
  canopy.isPickable = false;
  canopy.receiveShadows = true;

  return { trunk, canopy, trunkRadius: config.trunkRadius };
}

function createGreatOldTree(
  scene: Scene,
  barkMat: StandardMaterial,
  canopyMat: StandardMaterial,
  x: number,
  z: number,
  heroShadowMeshes: AbstractMesh[],
  colliders: ColliderCircle[]
): void {
  const groundY = getFootprintMinGroundHeight(x, z, 2.7);
  const parts: Mesh[] = [];

  // Massive continuous silk-cotton trunk from -1.1m underground up to crown
  const basePt = new Vector3(x, groundY - 1.1, z);
  const midPt = new Vector3(x + 0.12, groundY + 6.0, z + 0.08);
  const forkPt = new Vector3(x + 0.2, groundY + 9.2, z + 0.12);
  const apexPt = new Vector3(x + 0.25, groundY + 13.8, z + 0.15);

  parts.push(
    createConnectedSegment('greatOldLowerTrunk', basePt, midPt, 2.75, 1.95, 10, scene),
    createConnectedSegment(
      'greatOldUpperTrunk',
      new Vector3(midPt.x, midPt.y - 0.2, midPt.z),
      forkPt,
      1.98,
      1.45,
      9,
      scene
    ),
    createConnectedSegment(
      'greatOldCrownLeader',
      new Vector3(forkPt.x, forkPt.y - 0.15, forkPt.z),
      apexPt,
      1.42,
      0.55,
      8,
      scene
    )
  );

  // 5 connected silk-cotton buttress roots anchored firmly underground
  for (let i = 0; i < 5; i++) {
    const ang = (i / 5) * Math.PI * 2 + 0.3;
    const pStart = new Vector3(
      x + Math.cos(ang) * 0.62,
      groundY + 2.8,
      z + Math.sin(ang) * 0.62
    );
    const pEnd = new Vector3(
      x + Math.cos(ang) * 2.65,
      groundY - 0.9,
      z + Math.sin(ang) * 2.65
    );
    parts.push(createConnectedSegment(`greatOldButtress_${i}`, pStart, pEnd, 0.72, 1.15, 6, scene));
  }

  // Broad multi-tiered canopy clusters connected directly by sweeping boughs
  const crownOffsets = [
    { x: 0.25, y: 14.0, z: 0.15, sx: 5.4, sy: 2.5, sz: 5.2, isOuter: false },
    { x: 4.1, y: 12.6, z: 1.8, sx: 3.9, sy: 2.2, sz: 3.8, isOuter: true },
    { x: -3.9, y: 12.8, z: 2.1, sx: 3.8, sy: 2.2, sz: 3.6, isOuter: true },
    { x: 1.5, y: 12.4, z: -4.1, sx: 4.0, sy: 2.3, sz: 3.8, isOuter: true },
    { x: -2.8, y: 12.5, z: -3.2, sx: 3.7, sy: 2.1, sz: 3.7, isOuter: true },
    { x: 3.2, y: 11.9, z: -1.8, sx: 3.3, sy: 2.0, sz: 3.2, isOuter: true },
    { x: 0.4, y: 15.6, z: 0.3, sx: 3.5, sy: 2.0, sz: 3.5, isOuter: false },
  ];

  const crownParts: Mesh[] = [];
  crownOffsets.forEach((c, idx) => {
    if (c.isOuter) {
      const target = new Vector3(x + c.x, groundY + c.y - 0.45, z + c.z);
      parts.push(
        createConnectedSegment(`greatOldBough_${idx}`, forkPt, target, 0.95, 0.38, 7, scene)
      );
    }

    const cluster = MeshBuilder.CreateIcoSphere(
      `greatOldCrown_${idx}`,
      { radius: 1, subdivisions: 2 },
      scene
    );
    cluster.position.set(x + c.x, groundY + c.y, z + c.z);
    cluster.scaling.set(c.sx, c.sy, c.sz);
    cluster.computeWorldMatrix(true);
    crownParts.push(cluster);
  });

  const oldTreeWood = Mesh.MergeMeshes(parts, true, true, undefined, false, false)!;
  oldTreeWood.name = 'greatOldTreeWood';
  oldTreeWood.material = barkMat;
  oldTreeWood.receiveShadows = true;
  oldTreeWood.isPickable = false;
  oldTreeWood.freezeWorldMatrix();
  heroShadowMeshes.push(oldTreeWood);

  const oldTreeCrown = Mesh.MergeMeshes(crownParts, true, true, undefined, false, false)!;
  oldTreeCrown.name = 'greatOldTreeCrown';
  oldTreeCrown.material = canopyMat;
  oldTreeCrown.receiveShadows = true;
  oldTreeCrown.isPickable = false;
  oldTreeCrown.freezeWorldMatrix();
  heroShadowMeshes.push(oldTreeCrown);

  colliders.push({ x, z, radius: 1.95 });
}

function buildFernTemplate(scene: Scene, mat: StandardMaterial): Mesh {
  const fronds: Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2;
    const blade = MeshBuilder.CreatePlane(
      `fernBlade_${i}`,
      { width: 0.34, height: 1.05, sideOrientation: Mesh.DOUBLESIDE },
      scene
    );
    blade.position.set(Math.cos(ang) * 0.34, 0.28, Math.sin(ang) * 0.34);
    blade.rotation.y = -ang + Math.PI / 2;
    blade.rotation.x = 0.92;
    blade.computeWorldMatrix(true);
    fronds.push(blade);
  }
  const fern = Mesh.MergeMeshes(fronds, true, true, undefined, false, false)!;
  fern.name = 'fernTemplate';
  fern.material = mat;
  fern.isPickable = false;
  fern.receiveShadows = true;
  return fern;
}

function buildBushTemplate(scene: Scene, mat: StandardMaterial): Mesh {
  const clumps: Mesh[] = [];
  const offsets = [
    { x: 0, y: 0.42, z: 0, sx: 0.85, sy: 0.62, sz: 0.82 },
    { x: 0.48, y: 0.32, z: 0.22, sx: 0.62, sy: 0.48, sz: 0.6 },
    { x: -0.44, y: 0.34, z: -0.2, sx: 0.6, sy: 0.5, sz: 0.62 },
  ];
  offsets.forEach((o, i) => {
    const s = MeshBuilder.CreateIcoSphere(
      `bushClump_${i}`,
      { radius: 0.8, subdivisions: 1 },
      scene
    );
    s.position.set(o.x, o.y, o.z);
    s.scaling.set(o.sx, o.sy, o.sz);
    s.computeWorldMatrix(true);
    clumps.push(s);
  });
  const bush = Mesh.MergeMeshes(clumps, true, true, undefined, false, false)!;
  bush.name = 'bushTemplate';
  bush.material = mat;
  bush.isPickable = false;
  bush.receiveShadows = true;
  return bush;
}

function buildGrassTuftTemplate(scene: Scene, mat: StandardMaterial): Mesh {
  const blades: Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const p = MeshBuilder.CreatePlane(
      `grassPlane_${i}`,
      { width: 0.64, height: 0.5, sideOrientation: Mesh.DOUBLESIDE },
      scene
    );
    p.position.y = 0.2;
    p.rotation.y = (i / 3) * Math.PI;
    p.computeWorldMatrix(true);
    blades.push(p);
  }
  const tuft = Mesh.MergeMeshes(blades, true, true, undefined, false, false)!;
  tuft.name = 'grassTuftTemplate';
  tuft.material = mat;
  tuft.isPickable = false;
  tuft.receiveShadows = true;
  return tuft;
}

function buildWildflowerTemplate(scene: Scene, mat: StandardMaterial): Mesh {
  const parts: Mesh[] = [];
  const leafColor = new Color3(0.24, 0.52, 0.2);
  const stemColor = new Color3(0.28, 0.56, 0.22);
  const bloomColors = [
    new Color3(0.95, 0.78, 0.24),
    new Color3(0.94, 0.45, 0.32),
    new Color3(0.92, 0.88, 0.72),
  ];

  // Low green rosette leaves sitting directly at ground level
  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * Math.PI * 2 + 0.3;
    const leaf = MeshBuilder.CreatePlane(
      `flowerLeaf_${i}`,
      { width: 0.2, height: 0.38, sideOrientation: Mesh.DOUBLESIDE },
      scene
    );
    leaf.position.set(Math.cos(ang) * 0.14, 0.08, Math.sin(ang) * 0.14);
    leaf.rotation.y = -ang + Math.PI / 2;
    leaf.rotation.x = 1.1;
    leaf.computeWorldMatrix(true);
    setUniformVertexColor(leaf, leafColor);
    parts.push(leaf);
  }

  // 3 slender stems topped with colorful blossoms
  for (let i = 0; i < 3; i++) {
    const ang = (i / 3) * Math.PI * 2 + 0.4;
    const dx = Math.cos(ang) * 0.11;
    const dz = Math.sin(ang) * 0.11;
    const h = 0.26 + (i % 2) * 0.09;

    const stem = createConnectedSegment(
      `flowerStem_${i}`,
      new Vector3(0, -0.02, 0),
      new Vector3(dx, h, dz),
      0.025,
      0.018,
      4,
      scene
    );
    setUniformVertexColor(stem, stemColor);
    parts.push(stem);

    const bloom = MeshBuilder.CreateIcoSphere(
      `flowerBloom_${i}`,
      { radius: 0.065, subdivisions: 1 },
      scene
    );
    bloom.position.set(dx, h + 0.02, dz);
    bloom.scaling.set(1.15, 0.68, 1.15);
    bloom.computeWorldMatrix(true);
    setUniformVertexColor(bloom, bloomColors[i % bloomColors.length]);
    parts.push(bloom);
  }

  const flower = Mesh.MergeMeshes(parts, true, true, undefined, false, false)!;
  flower.name = 'wildflowerTemplate';
  flower.material = mat;
  flower.isPickable = false;
  flower.receiveShadows = true;
  return flower;
}

/**
 * Builds a fallen log aligned along local +Z (-1.9 to +1.9) with a resting stub
 * so yaw/pitch from world endpoint sampling seats the entire trunk cleanly on slopes.
 */
function buildFallenLogTemplate(scene: Scene, mat: StandardMaterial): Mesh {
  const trunk = MeshBuilder.CreateCylinder(
    'fallenLogMain',
    { height: 3.8, diameterTop: 0.34, diameterBottom: 0.5, tessellation: 7 },
    scene
  );
  trunk.rotation.x = Math.PI / 2;
  trunk.position.y = 0.16;
  trunk.computeWorldMatrix(true);

  const stub = MeshBuilder.CreateCylinder(
    'fallenLogStub',
    { height: 0.95, diameterTop: 0.14, diameterBottom: 0.22, tessellation: 5 },
    scene
  );
  stub.position.set(0.18, 0.42, 0.55);
  stub.rotation.x = 0.55;
  stub.rotation.z = -0.45;
  stub.computeWorldMatrix(true);

  const log = Mesh.MergeMeshes([trunk, stub], true, true, undefined, false, false)!;
  log.name = 'fallenLogTemplate';
  log.material = mat;
  log.isPickable = false;
  log.receiveShadows = true;
  return log;
}

export function createForestFlora(scene: Scene): ForestFloraHandle {
  const colliders: ColliderCircle[] = [];
  const shadowCasterMeshes: AbstractMesh[] = [];
  const heroShadowMeshes: AbstractMesh[] = [];

  // Shared materials
  const barkMat = new StandardMaterial('forestBarkMat', scene);
  barkMat.diffuseTexture = createBarkTexture(scene);
  barkMat.specularColor = new Color3(0.05, 0.04, 0.03);

  const canopyColors = [
    { name: 'canopyEmeraldTex', hex: '#23532B', specular: new Color3(0.06, 0.09, 0.05) },
    { name: 'canopySunlitTex', hex: '#336C36', specular: new Color3(0.07, 0.1, 0.05) },
    { name: 'canopyMossTex', hex: '#2A5E35', specular: new Color3(0.05, 0.08, 0.05) },
    { name: 'canopyOliveTex', hex: '#3D6E34', specular: new Color3(0.07, 0.09, 0.05) },
  ];

  const canopyMats = canopyColors.map((c, idx) => {
    const m = new StandardMaterial(`canopyMat_${idx}`, scene);
    m.diffuseTexture = createFoliageTexture(scene, c.hex, c.name);
    m.specularColor = c.specular;
    return m;
  });

  // 1. Build 4 distinct tree archetypes with fully connected trunks, roots, branches, & canopies
  const archetypes: TreeArchetype[] = [
    buildTreeArchetype(scene, 0, barkMat, canopyMats[0], {
      height: 11.2,
      trunkRadius: 0.42,
      leanX: 0.32,
      leanZ: 0.12,
      canopyClusters: [
        { x: 0.32, y: 11.3, z: 0.12, sx: 3.1, sy: 2.1, sz: 3.0, branchFrom: 'crown' },
        { x: 2.0, y: 10.1, z: 1.15, sx: 2.3, sy: 1.7, sz: 2.2, branchFrom: 'fork' },
        { x: -1.7, y: 10.3, z: -1.1, sx: 2.4, sy: 1.8, sz: 2.3, branchFrom: 'fork' },
        { x: 0.55, y: 12.4, z: -0.45, sx: 2.1, sy: 1.5, sz: 2.0, branchFrom: 'crown' },
      ],
    }),
    buildTreeArchetype(scene, 1, barkMat, canopyMats[1], {
      height: 8.6,
      trunkRadius: 0.38,
      leanX: -0.24,
      leanZ: 0.14,
      canopyClusters: [
        { x: -0.24, y: 8.8, z: 0.14, sx: 3.3, sy: 1.9, sz: 3.2, branchFrom: 'crown' },
        { x: -2.05, y: 7.7, z: 1.25, sx: 2.3, sy: 1.5, sz: 2.2, branchFrom: 'fork' },
        { x: 1.95, y: 7.9, z: -0.9, sx: 2.2, sy: 1.6, sz: 2.3, branchFrom: 'fork' },
      ],
    }),
    buildTreeArchetype(scene, 2, barkMat, canopyMats[2], {
      height: 13.0,
      trunkRadius: 0.35,
      leanX: 0.18,
      leanZ: -0.14,
      canopyClusters: [
        { x: 0.18, y: 13.0, z: -0.14, sx: 2.5, sy: 1.8, sz: 2.5, branchFrom: 'crown' },
        { x: 1.4, y: 11.7, z: 0.85, sx: 2.0, sy: 1.4, sz: 1.9, branchFrom: 'fork' },
        { x: -1.15, y: 11.5, z: -1.1, sx: 1.9, sy: 1.5, sz: 2.0, branchFrom: 'fork' },
      ],
    }),
    buildTreeArchetype(scene, 3, barkMat, canopyMats[3], {
      height: 7.4,
      trunkRadius: 0.34,
      leanX: 0.38,
      leanZ: 0.15,
      canopyClusters: [
        { x: 0.38, y: 7.5, z: 0.15, sx: 2.7, sy: 1.7, sz: 2.6, branchFrom: 'crown' },
        { x: -1.4, y: 6.7, z: -0.85, sx: 2.1, sy: 1.4, sz: 2.0, branchFrom: 'mid' },
        { x: 1.65, y: 6.9, z: 1.0, sx: 1.9, sy: 1.4, sz: 1.9, branchFrom: 'fork' },
      ],
    }),
  ];

  // 2. Place Great Old Silk-Cotton Tree Landmark at (-15, 24) beside the winding trail
  const oldTreeX = -15;
  const oldTreeZ = 24;
  createGreatOldTree(
    scene,
    barkMat,
    canopyMats[0],
    oldTreeX,
    oldTreeZ,
    heroShadowMeshes,
    colliders
  );

  // 3. Wooden trail signpost at the edge of the starting clearing
  const signPostX = 3.8;
  const signPostZ = 5.6;
  const signPostY = getExactGroundHeight(signPostX, signPostZ);
  const postMesh = MeshBuilder.CreateCylinder(
    'trailSignPost',
    { height: 2.1, diameterTop: 0.16, diameterBottom: 0.21, tessellation: 8 },
    scene
  );
  postMesh.position.set(signPostX, signPostY + 0.85, signPostZ);
  postMesh.material = barkMat;
  postMesh.receiveShadows = true;
  postMesh.freezeWorldMatrix();
  heroShadowMeshes.push(postMesh);

  const signArm = MeshBuilder.CreateBox(
    'trailSignBoard',
    { width: 0.95, height: 0.24, depth: 0.08 },
    scene
  );
  signArm.position.set(signPostX + 0.22, signPostY + 1.56, signPostZ + 0.05);
  signArm.rotation.y = 0.55;
  signArm.material = barkMat;
  signArm.receiveShadows = true;
  signArm.freezeWorldMatrix();
  heroShadowMeshes.push(signArm);
  colliders.push({ x: signPostX, z: signPostZ, radius: 0.35 });

  // 4. Populate Forest Trees with varied groves & clearings, using footprint min height
  const treeMatrices: number[][] = [[], [], [], []];
  const rootMatrices: number[] = [];

  const cellSize = 10.8;
  for (let gx = -120; gx <= 120; gx += cellSize) {
    for (let gz = -120; gz <= 120; gz += cellSize) {
      const n1 = valueNoise2D(gx * 0.37 + 5.1, gz * 0.43 + 9.2);
      const n2 = valueNoise2D(gx * 0.71 + 18.4, gz * 0.63 + 2.7);
      const n3 = valueNoise2D(gx * 1.13 + 3.8, gz * 0.97 + 14.1);

      const x = gx + (n1 - 0.5) * 8.6;
      const z = gz + (n2 - 0.5) * 8.6;
      const distCenter = Math.hypot(x, z);

      // Vary woodland density across groves vs natural clearings
      const groveFactor = valueNoise2D(x * 0.032 + 4.4, z * 0.032 + 11.7);
      const isRim = distCenter > 92;
      if (!isRim && n3 < (groveFactor > 0.55 ? 0.16 : 0.42)) {
        continue;
      }

      // Keep starting clearing, dirt path, stream channel, Great Old Tree, and rocky hill clear
      if (distCenter < 13.0) continue;
      if (Math.hypot(x - oldTreeX, z - oldTreeZ) < 10.5) continue;
      if (getPathDistance(x, z) < 3.6) continue;

      const river = getRiverInfo(x, z);
      if (z >= -52 && river.distance < river.halfWidth + 3.2) continue;

      const rockyHillDist = Math.hypot(x - 54, z - 62);
      if (rockyHillDist < 12.2) continue;

      const slope = getTerrainSlope(x, z);
      if (slope > 0.48 && !isRim) continue;

      const archIdx = Math.floor(n3 * 4) % 4;
      const scaleXZ = 0.8 + n1 * 0.5;
      const scaleY = 0.78 + n2 * 0.58;
      const rotY = (n1 + n2) * Math.PI * 2;
      // Keep tree tilt gentle so deeply anchored base & roots stay rooted
      const tiltX = (n2 - 0.5) * 0.06;
      const tiltZ = (n3 - 0.5) * 0.06;

      const footprintR = archetypes[archIdx].trunkRadius * 2.1 * scaleXZ;
      const groundMinY = getFootprintMinGroundHeight(x, z, footprintR);

      appendInstanceMatrix(
        treeMatrices[archIdx],
        new Vector3(x, groundMinY, z),
        rotY,
        new Vector3(scaleXZ, scaleY, scaleXZ),
        tiltX,
        tiltZ
      );

      if (Math.abs(x) <= PLAYABLE_BOUNDARY && Math.abs(z) <= PLAYABLE_BOUNDARY) {
        colliders.push({ x, z, radius: 0.45 * scaleXZ });
      }

      // Exposed surface roots hugging the terrain outward from larger trees
      if (n3 > 0.58 && !isRim) {
        const rootDirX = Math.cos(rotY);
        const rootDirZ = Math.sin(rotY);
        const rx = x + rootDirX * (0.95 * scaleXZ);
        const rz = z + rootDirZ * (0.95 * scaleXZ);
        const rootRiver = getRiverInfo(rx, rz);
        if (rz < -52 || rootRiver.distance >= rootRiver.halfWidth + 1.5) {
          const y0 = getExactGroundHeight(x + rootDirX * 0.25, z + rootDirZ * 0.25);
          const y1 = getExactGroundHeight(rx + rootDirX * 0.9, rz + rootDirZ * 0.9);
          const rootPitch = -Math.asin(clamp((y1 - y0) / 1.8, -0.5, 0.5));
          const rootYaw = Math.atan2(rootDirX, rootDirZ);
          const rootY = Math.min(y0, y1) - 0.06;

          appendInstanceMatrix(
            rootMatrices,
            new Vector3(rx, rootY, rz),
            rootYaw,
            new Vector3(scaleXZ * 0.62, 0.44, scaleXZ * 1.15),
            rootPitch,
            0
          );
        }
      }
    }
  }

  archetypes.forEach((arch, idx) => {
    const buf = new Float32Array(treeMatrices[idx]);
    if (buf.length > 0) {
      arch.trunk.thinInstanceSetBuffer('matrix', buf, 16, true);
      arch.canopy.thinInstanceSetBuffer('matrix', buf, 16, true);
      arch.trunk.thinInstanceRefreshBoundingInfo(false);
      arch.canopy.thinInstanceRefreshBoundingInfo(false);
      shadowCasterMeshes.push(arch.trunk, arch.canopy);
    } else {
      arch.trunk.setEnabled(false);
      arch.canopy.setEnabled(false);
    }
  });

  // Exposed surface root template aligned along +Z so rootYaw/rootPitch orient cleanly
  const rootTemplate = MeshBuilder.CreateCylinder(
    'exposedRootTemplate',
    { height: 2.1, diameterTop: 0.13, diameterBottom: 0.34, tessellation: 6 },
    scene
  );
  rootTemplate.rotation.x = Math.PI / 2 - 0.14;
  rootTemplate.material = barkMat;
  rootTemplate.isPickable = false;
  rootTemplate.receiveShadows = true;
  if (rootMatrices.length > 0) {
    rootTemplate.thinInstanceSetBuffer('matrix', new Float32Array(rootMatrices), 16, true);
    rootTemplate.thinInstanceRefreshBoundingInfo(false);
  } else {
    rootTemplate.setEnabled(false);
  }

  // 5. Ferns, Bushes, Grass Tufts, Wildflowers, Fallen Logs, Dry Leaf Patches, & Rocks
  const fernMat = new StandardMaterial('fernMat', scene);
  fernMat.diffuseColor = new Color3(0.24, 0.47, 0.21);
  fernMat.specularColor = new Color3(0.05, 0.08, 0.04);
  const fernTemplate = buildFernTemplate(scene, fernMat);

  const bushMat = new StandardMaterial('bushMat', scene);
  bushMat.diffuseTexture = createFoliageTexture(scene, '#28522A', 'bushLeafTex');
  bushMat.specularColor = new Color3(0.05, 0.07, 0.04);
  const bushTemplate = buildBushTemplate(scene, bushMat);

  const grassMat = new StandardMaterial('grassTuftMat', scene);
  grassMat.diffuseColor = new Color3(0.32, 0.52, 0.24);
  grassMat.specularColor = new Color3(0.03, 0.05, 0.02);
  const grassTemplate = buildGrassTuftTemplate(scene, grassMat);

  const flowerMat = new StandardMaterial('wildflowerMat', scene);
  flowerMat.diffuseColor = new Color3(1, 1, 1);
  flowerMat.specularColor = new Color3(0.04, 0.04, 0.03);
  const flowerTemplate = buildWildflowerTemplate(scene, flowerMat);

  const fallenLogTemplate = buildFallenLogTemplate(scene, barkMat);

  const forestRockMat = new StandardMaterial('forestRockMat', scene);
  forestRockMat.diffuseColor = new Color3(0.39, 0.41, 0.38);
  forestRockMat.specularColor = new Color3(0.09, 0.09, 0.08);
  const rockTemplate = MeshBuilder.CreatePolyhedron(
    'forestRockTemplate',
    { type: 1, size: 0.72 },
    scene
  );
  rockTemplate.material = forestRockMat;
  rockTemplate.isPickable = false;
  rockTemplate.receiveShadows = true;

  const dryLeafMat = new StandardMaterial('dryLeafDebrisMat', scene);
  dryLeafMat.diffuseColor = new Color3(0.47, 0.33, 0.17);
  dryLeafMat.specularColor = new Color3(0.03, 0.02, 0.01);
  const dryLeafTemplate = MeshBuilder.CreateDisc(
    'dryLeafTemplate',
    { radius: 0.9, tessellation: 7 },
    scene
  );
  dryLeafTemplate.rotation.x = Math.PI / 2;
  dryLeafTemplate.material = dryLeafMat;
  dryLeafTemplate.isPickable = false;
  dryLeafTemplate.receiveShadows = true;

  const fernMatrices: number[] = [];
  const bushMatrices: number[] = [];
  const grassMatrices: number[] = [];
  const flowerMatrices: number[] = [];
  const logMatrices: number[] = [];
  const rockMatrices: number[] = [];
  const leafMatrices: number[] = [];

  // Undergrowth & forest floor details sampled against exact triangle heights
  for (let gx = -112; gx <= 112; gx += 5.8) {
    for (let gz = -112; gz <= 112; gz += 5.8) {
      const n1 = valueNoise2D(gx * 0.53 + 2.1, gz * 0.59 + 8.4);
      const n2 = valueNoise2D(gx * 0.89 + 14.3, gz * 0.77 + 5.6);
      const x = gx + (n1 - 0.5) * 4.8;
      const z = gz + (n2 - 0.5) * 4.8;

      const river = getRiverInfo(x, z);
      // Never place dry-land plants underwater or right on water edge
      if (z >= -52 && river.distance < river.halfWidth + 0.75) continue;

      const pathDist = getPathDistance(x, z);
      const slope = getTerrainSlope(x, z);
      const exactY = getExactGroundHeight(x, z);
      const distCenter = Math.hypot(x, z);
      const groveDensity = valueNoise2D(x * 0.04 + 9.1, z * 0.04 + 2.3);

      // Ferns thrive in shaded groves and riverbank margins
      if (pathDist > 2.25 && slope < 0.45 && n1 > (groveDensity > 0.5 ? 0.48 : 0.62)) {
        const s = 0.7 + n2 * 0.85;
        const fernY = getFootprintMinGroundHeight(x, z, 0.45 * s) - 0.03;
        appendInstanceMatrix(
          fernMatrices,
          new Vector3(x, fernY, z),
          n1 * Math.PI * 2,
          new Vector3(s, s, s)
        );
      }

      // Forest bushes / shrubs rooted cleanly across their footprint
      if (distCenter > 10 && pathDist > 2.9 && slope < 0.44 && n2 > 0.74) {
        const s = 0.75 + n1 * 0.7;
        const bushY = getFootprintMinGroundHeight(x, z, 0.7 * s) - 0.07;
        appendInstanceMatrix(
          bushMatrices,
          new Vector3(x, bushY, z),
          n2 * Math.PI * 2,
          new Vector3(s, s * 0.9, s)
        );
      }

      // Grass tufts across clearings, meadows, and trail edges
      if (pathDist > 1.85 && slope < 0.36 && n1 < 0.72) {
        const s = 0.65 + n2 * 0.75;
        appendInstanceMatrix(
          grassMatrices,
          new Vector3(x, exactY - 0.04, z),
          (n1 + n2) * Math.PI * 2,
          new Vector3(s, s, s)
        );
      }

      // Small tropical wildflowers & low forest plants along sunny glades & path borders
      if (pathDist > 2.0 && slope < 0.34 && n1 > 0.66 && n2 < 0.42) {
        const s = 0.8 + n2 * 0.7;
        appendInstanceMatrix(
          flowerMatrices,
          new Vector3(x, exactY - 0.02, z),
          (n1 + n2) * Math.PI * 2,
          new Vector3(s, s, s)
        );
      }

      // Fallen logs pitched along exact terrain slope between both log endpoints
      if (distCenter > 11 && pathDist > 3.2 && slope < 0.28 && n1 > 0.86 && n2 > 0.62) {
        const s = 0.78 + n2 * 0.55;
        const yaw = n1 * Math.PI * 2;
        const halfSpan = 1.65 * s;
        const dx = Math.sin(yaw) * halfSpan;
        const dz = Math.cos(yaw) * halfSpan;

        const rA = getRiverInfo(x - dx, z - dz);
        const rB = getRiverInfo(x + dx, z + dz);
        const clearOfWater =
          (z - dz < -50 || rA.distance >= rA.halfWidth + 0.8) &&
          (z + dz < -50 || rB.distance >= rB.halfWidth + 0.8);

        if (clearOfWater) {
          const yA = getExactGroundHeight(x - dx, z - dz);
          const yB = getExactGroundHeight(x + dx, z + dz);
          const midCheck = (yA + yB) * 0.5;
          // Only place fallen logs where terrain under the log doesn't dip away
          if (Math.abs(exactY - midCheck) < 0.14) {
            const pitch = -Math.asin(clamp((yB - yA) / (halfSpan * 2), -0.45, 0.45));
            const baseLogY = Math.min(exactY, midCheck) - 0.05;
            appendInstanceMatrix(
              logMatrices,
              new Vector3(x, baseLogY, z),
              yaw,
              new Vector3(s, s, s),
              pitch,
              0
            );
            colliders.push({ x, z, radius: 0.72 * s });
          }
        }
      }

      // Dry leaf & forest debris discs tilted gently to match terrain normal
      if (distCenter > 10 && pathDist > 2.4 && slope < 0.34 && n2 > 0.76) {
        const s = 0.75 + n1 * 0.95;
        const hx1 = getExactGroundHeight(x + 0.65, z);
        const hx0 = getExactGroundHeight(x - 0.65, z);
        const hz1 = getExactGroundHeight(x, z + 0.65);
        const hz0 = getExactGroundHeight(x, z - 0.65);
        const pitchX = -Math.atan2(hz1 - hz0, 1.3);
        const rollZ = Math.atan2(hx1 - hx0, 1.3);
        appendInstanceMatrix(
          leafMatrices,
          new Vector3(x, exactY + 0.015, z),
          0,
          new Vector3(s, 1, s * 0.82),
          pitchX,
          rollZ
        );
      }
    }
  }

  // Natural Rock Formations: Rocky Hill (54, 62), Clearing Stones, and Scattered Boulders
  const heroRocks = [
    { x: -7.8, z: 6.4, s: new Vector3(1.5, 0.95, 1.3), r: 0.95 },
    { x: 9.2, z: 8.1, s: new Vector3(1.8, 1.1, 1.5), r: 1.1 },
    { x: -10.5, z: -6.2, s: new Vector3(2.1, 1.25, 1.7), r: 1.25 },
    { x: 52.5, z: 63.0, s: new Vector3(4.2, 3.1, 3.6), r: 2.3 },
    { x: 57.5, z: 60.5, s: new Vector3(3.6, 2.5, 3.1), r: 1.9 },
    { x: 49.0, z: 59.5, s: new Vector3(2.8, 1.8, 2.4), r: 1.5 },
    { x: 56.0, z: 66.8, s: new Vector3(3.3, 2.3, 2.9), r: 1.8 },
    { x: 61.5, z: 63.5, s: new Vector3(2.9, 1.9, 2.6), r: 1.6 },
    { x: -24, z: 48, s: new Vector3(3.1, 2.1, 2.5), r: 1.7 },
    { x: -34, z: -22, s: new Vector3(3.4, 2.4, 2.8), r: 1.85 },
    { x: 29, z: -14, s: new Vector3(2.6, 1.7, 2.2), r: 1.45 },
  ];

  heroRocks.forEach((b, idx) => {
    const minY = getFootprintMinGroundHeight(b.x, b.z, b.r * 0.72);
    // Polyhedron size 0.72 extends 0.72*s.y below center; +0.20*s.y embeds firmly into terrain
    appendInstanceMatrix(
      rockMatrices,
      new Vector3(b.x, minY + b.s.y * 0.2, b.z),
      idx * 1.1,
      b.s
    );
    colliders.push({ x: b.x, z: b.z, radius: b.r });
  });

  // Additional smaller natural rocks and stones across hills & forest floor
  for (let gx = -108; gx <= 108; gx += 14) {
    for (let gz = -108; gz <= 108; gz += 14) {
      const n1 = valueNoise2D(gx * 0.31 + 41.2, gz * 0.29 + 19.7);
      const n2 = valueNoise2D(gx * 0.61 + 7.3, gz * 0.67 + 33.1);
      if (n1 < 0.54) continue;

      const x = gx + (n1 - 0.5) * 11;
      const z = gz + (n2 - 0.5) * 11;
      if (Math.hypot(x, z) < 11.5) continue;
      if (getPathDistance(x, z) < 2.9) continue;
      const river = getRiverInfo(x, z);
      if (z >= -52 && river.distance < river.halfWidth + 2.2) continue;

      const s = 0.65 + n2 * 1.45;
      const minY = getFootprintMinGroundHeight(x, z, s * 0.52);
      appendInstanceMatrix(
        rockMatrices,
        new Vector3(x, minY + s * 0.16, z),
        n1 * Math.PI * 2,
        new Vector3(s * 1.2, s * 0.78, s)
      );
      if (s > 0.95) {
        colliders.push({ x, z, radius: s * 0.66 });
      }
    }
  }

  const applyThinBuffer = (mesh: Mesh, arr: number[]): void => {
    if (arr.length > 0) {
      mesh.thinInstanceSetBuffer('matrix', new Float32Array(arr), 16, true);
      mesh.thinInstanceRefreshBoundingInfo(false);
    } else {
      mesh.setEnabled(false);
    }
  };

  applyThinBuffer(fernTemplate, fernMatrices);
  applyThinBuffer(bushTemplate, bushMatrices);
  applyThinBuffer(grassTemplate, grassMatrices);
  applyThinBuffer(flowerTemplate, flowerMatrices);
  applyThinBuffer(fallenLogTemplate, logMatrices);
  applyThinBuffer(rockTemplate, rockMatrices);
  applyThinBuffer(dryLeafTemplate, leafMatrices);

  heroShadowMeshes.push(rockTemplate);

  return {
    colliders,
    shadowCasterMeshes,
    heroShadowMeshes,
  };
}
