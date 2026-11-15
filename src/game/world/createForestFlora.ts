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
  getPathDistance,
  getRiverInfo,
  getTerrainHeight,
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
    ctx.fillStyle = rand() > 0.48 ? 'rgba(130, 185, 95, 0.18)' : 'rgba(16, 42, 22, 0.24)';
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
  tiltX = 0,
  tiltZ = 0
): void {
  const q = Quaternion.RotationYawPitchRoll(rotY, tiltX, tiltZ);
  const m = Matrix.Compose(scale, q, pos);
  for (let i = 0; i < 16; i++) {
    target.push(m.m[i]);
  }
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
    branchAngles: number[];
    canopyClusters: Array<{ x: number; y: number; z: number; sx: number; sy: number; sz: number }>;
  }
): TreeArchetype {
  const trunkParts: Mesh[] = [];
  const canopyParts: Mesh[] = [];

  // Lower trunk
  const lowerH = config.height * 0.56;
  const lowerTrunk = MeshBuilder.CreateCylinder(
    `arch_${id}_lowerTrunk`,
    {
      height: lowerH,
      diameterTop: config.trunkRadius * 1.45,
      diameterBottom: config.trunkRadius * 2.2,
      tessellation: 7,
    },
    scene
  );
  lowerTrunk.position.set(0, lowerH * 0.5 - 0.15, 0);
  trunkParts.push(lowerTrunk);

  // Upper trunk with slight organic bend
  const upperH = config.height * 0.48;
  const upperTrunk = MeshBuilder.CreateCylinder(
    `arch_${id}_upperTrunk`,
    {
      height: upperH,
      diameterTop: config.trunkRadius * 0.72,
      diameterBottom: config.trunkRadius * 1.45,
      tessellation: 7,
    },
    scene
  );
  upperTrunk.position.set(config.leanX * 0.5, lowerH + upperH * 0.45 - 0.25, 0);
  upperTrunk.rotation.z = -config.leanX * 0.18;
  trunkParts.push(upperTrunk);

  // Flared root buttresses at base
  for (let r = 0; r < 3; r++) {
    const angle = (r / 3) * Math.PI * 2 + id * 0.7;
    const rootMesh = MeshBuilder.CreateCylinder(
      `arch_${id}_root_${r}`,
      {
        height: 1.35,
        diameterTop: config.trunkRadius * 0.35,
        diameterBottom: config.trunkRadius * 0.9,
        tessellation: 5,
      },
      scene
    );
    rootMesh.position.set(
      Math.cos(angle) * config.trunkRadius * 0.95,
      0.32,
      Math.sin(angle) * config.trunkRadius * 0.95
    );
    rootMesh.rotation.z = -Math.cos(angle) * 0.55;
    rootMesh.rotation.x = Math.sin(angle) * 0.55;
    trunkParts.push(rootMesh);
  }

  // Visible forked branches reaching into canopy
  config.branchAngles.forEach((ang, bIdx) => {
    const bLen = config.height * 0.36;
    const branch = MeshBuilder.CreateCylinder(
      `arch_${id}_branch_${bIdx}`,
      {
        height: bLen,
        diameterTop: config.trunkRadius * 0.28,
        diameterBottom: config.trunkRadius * 0.65,
        tessellation: 5,
      },
      scene
    );
    const branchY = config.height * (0.64 + (bIdx % 2) * 0.12);
    branch.position.set(
      config.leanX * 0.6 + Math.cos(ang) * (bLen * 0.35),
      branchY,
      Math.sin(ang) * (bLen * 0.35)
    );
    branch.rotation.z = -Math.cos(ang) * 0.68;
    branch.rotation.x = Math.sin(ang) * 0.68;
    trunkParts.push(branch);
  });

  // Layered organic foliage clusters
  config.canopyClusters.forEach((c, cIdx) => {
    const cluster = MeshBuilder.CreateIcoSphere(
      `arch_${id}_leaf_${cIdx}`,
      { radius: 1, subdivisions: 1 },
      scene
    );
    cluster.position.set(c.x + config.leanX * 0.7, c.y, c.z);
    cluster.scaling.set(c.sx, c.sy, c.sz);
    cluster.rotation.y = cIdx * 0.9;
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

  return { trunk, canopy };
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
  const groundY = getTerrainHeight(x, z);
  const parts: Mesh[] = [];

  // Massive furrowed trunk
  const mainTrunk = MeshBuilder.CreateCylinder(
    'greatOldTreeTrunk',
    { height: 11.5, diameterTop: 1.55, diameterBottom: 2.7, tessellation: 10 },
    scene
  );
  mainTrunk.position.set(x, groundY + 5.4, z);
  parts.push(mainTrunk);

  // 5 dramatic Sierra Leone silk-cotton buttress roots
  for (let i = 0; i < 5; i++) {
    const ang = (i / 5) * Math.PI * 2 + 0.3;
    const buttress = MeshBuilder.CreateBox(
      `greatOldButtress_${i}`,
      { width: 0.48, height: 3.6, depth: 2.4 },
      scene
    );
    buttress.position.set(
      x + Math.cos(ang) * 1.45,
      groundY + 1.2,
      z + Math.sin(ang) * 1.45
    );
    buttress.rotation.y = -ang + Math.PI / 2;
    buttress.rotation.x = 0.38;
    parts.push(buttress);
  }

  // Sweeping upper boughs
  for (let i = 0; i < 5; i++) {
    const ang = (i / 5) * Math.PI * 2 + 0.5;
    const bough = MeshBuilder.CreateCylinder(
      `greatOldBough_${i}`,
      { height: 6.4, diameterTop: 0.42, diameterBottom: 0.92, tessellation: 7 },
      scene
    );
    bough.position.set(
      x + Math.cos(ang) * 2.4,
      groundY + 10.6,
      z + Math.sin(ang) * 2.4
    );
    bough.rotation.z = -Math.cos(ang) * 0.78;
    bough.rotation.x = Math.sin(ang) * 0.78;
    parts.push(bough);
  }

  const oldTreeWood = Mesh.MergeMeshes(parts, true, true, undefined, false, false)!;
  oldTreeWood.name = 'greatOldTreeWood';
  oldTreeWood.material = barkMat;
  oldTreeWood.receiveShadows = true;
  oldTreeWood.isPickable = false;
  oldTreeWood.freezeWorldMatrix();
  heroShadowMeshes.push(oldTreeWood);

  // Broad multi-tiered canopy clusters
  const crownParts: Mesh[] = [];
  const crownOffsets = [
    { x: 0, y: 14.2, z: 0, sx: 5.4, sy: 2.6, sz: 5.2 },
    { x: 4.1, y: 12.6, z: 1.8, sx: 3.9, sy: 2.2, sz: 3.8 },
    { x: -3.9, y: 12.8, z: 2.1, sx: 3.8, sy: 2.2, sz: 3.6 },
    { x: 1.5, y: 12.4, z: -4.1, sx: 4.0, sy: 2.3, sz: 3.8 },
    { x: -2.8, y: 12.5, z: -3.2, sx: 3.7, sy: 2.1, sz: 3.7 },
    { x: 0.4, y: 15.6, z: 0.3, sx: 3.5, sy: 2.0, sz: 3.5 },
  ];

  crownOffsets.forEach((c, idx) => {
    const cluster = MeshBuilder.CreateIcoSphere(
      `greatOldCrown_${idx}`,
      { radius: 1, subdivisions: 2 },
      scene
    );
    cluster.position.set(x + c.x, groundY + c.y, z + c.z);
    cluster.scaling.set(c.sx, c.sy, c.sz);
    crownParts.push(cluster);
  });

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
      { width: 0.32, height: 1.05, sideOrientation: Mesh.DOUBLESIDE },
      scene
    );
    blade.position.set(Math.cos(ang) * 0.36, 0.32, Math.sin(ang) * 0.36);
    blade.rotation.y = -ang + Math.PI / 2;
    blade.rotation.x = 0.92;
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
    { x: 0, y: 0.45, z: 0, sx: 0.85, sy: 0.62, sz: 0.82 },
    { x: 0.5, y: 0.34, z: 0.25, sx: 0.62, sy: 0.48, sz: 0.6 },
    { x: -0.45, y: 0.36, z: -0.22, sx: 0.6, sy: 0.5, sz: 0.62 },
  ];
  offsets.forEach((o, i) => {
    const s = MeshBuilder.CreateIcoSphere(
      `bushClump_${i}`,
      { radius: 0.8, subdivisions: 1 },
      scene
    );
    s.position.set(o.x, o.y, o.z);
    s.scaling.set(o.sx, o.sy, o.sz);
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
      { width: 0.62, height: 0.48, sideOrientation: Mesh.DOUBLESIDE },
      scene
    );
    p.position.y = 0.2;
    p.rotation.y = (i / 3) * Math.PI;
    blades.push(p);
  }
  const tuft = Mesh.MergeMeshes(blades, true, true, undefined, false, false)!;
  tuft.name = 'grassTuftTemplate';
  tuft.material = mat;
  tuft.isPickable = false;
  tuft.receiveShadows = true;
  return tuft;
}

function buildFallenLogTemplate(scene: Scene, mat: StandardMaterial): Mesh {
  const trunk = MeshBuilder.CreateCylinder(
    'fallenLogMain',
    { height: 4.2, diameterTop: 0.36, diameterBottom: 0.52, tessellation: 7 },
    scene
  );
  trunk.rotation.z = Math.PI / 2;
  trunk.position.y = 0.18;

  const stub = MeshBuilder.CreateCylinder(
    'fallenLogStub',
    { height: 1.0, diameterTop: 0.14, diameterBottom: 0.24, tessellation: 5 },
    scene
  );
  stub.position.set(0.6, 0.48, 0.22);
  stub.rotation.x = 0.65;
  stub.rotation.z = -0.35;

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

  // 1. Build 4 distinct tree archetypes
  const archetypes: TreeArchetype[] = [
    buildTreeArchetype(scene, 0, barkMat, canopyMats[0], {
      height: 11.2,
      trunkRadius: 0.42,
      leanX: 0.35,
      branchAngles: [0.4, 2.1, 3.8, 5.2],
      canopyClusters: [
        { x: 0, y: 11.4, z: 0, sx: 3.1, sy: 2.1, sz: 3.0 },
        { x: 1.9, y: 10.1, z: 1.1, sx: 2.3, sy: 1.7, sz: 2.2 },
        { x: -1.8, y: 10.3, z: -1.2, sx: 2.4, sy: 1.8, sz: 2.3 },
        { x: 0.4, y: 12.6, z: -0.6, sx: 2.1, sy: 1.5, sz: 2.0 },
      ],
    }),
    buildTreeArchetype(scene, 1, barkMat, canopyMats[1], {
      height: 8.6,
      trunkRadius: 0.38,
      leanX: -0.25,
      branchAngles: [0.9, 2.9, 4.9],
      canopyClusters: [
        { x: 0, y: 8.8, z: 0, sx: 3.3, sy: 1.9, sz: 3.2 },
        { x: -2.0, y: 7.7, z: 1.3, sx: 2.3, sy: 1.5, sz: 2.2 },
        { x: 2.1, y: 7.9, z: -0.9, sx: 2.2, sy: 1.6, sz: 2.3 },
      ],
    }),
    buildTreeArchetype(scene, 2, barkMat, canopyMats[2], {
      height: 13.0,
      trunkRadius: 0.34,
      leanX: 0.2,
      branchAngles: [1.1, 3.4, 5.6],
      canopyClusters: [
        { x: 0, y: 13.1, z: 0, sx: 2.5, sy: 1.8, sz: 2.5 },
        { x: 1.3, y: 11.8, z: 0.9, sx: 2.0, sy: 1.4, sz: 1.9 },
        { x: -1.2, y: 11.6, z: -1.1, sx: 1.9, sy: 1.5, sz: 2.0 },
      ],
    }),
    buildTreeArchetype(scene, 3, barkMat, canopyMats[3], {
      height: 7.4,
      trunkRadius: 0.34,
      leanX: 0.48,
      branchAngles: [0.2, 2.3, 4.3],
      canopyClusters: [
        { x: 0.3, y: 7.5, z: 0.2, sx: 2.7, sy: 1.7, sz: 2.6 },
        { x: -1.5, y: 6.7, z: -0.9, sx: 2.1, sy: 1.4, sz: 2.0 },
        { x: 1.6, y: 6.9, z: 1.0, sx: 1.9, sy: 1.4, sz: 1.9 },
      ],
    }),
  ];

  // 2. Place Great Old Silk-Cotton Tree Landmark at (-16, 28)
  const oldTreeX = -16;
  const oldTreeZ = 28;
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
  const signPostY = getTerrainHeight(signPostX, signPostZ);
  const postMesh = MeshBuilder.CreateCylinder(
    'trailSignPost',
    { height: 1.9, diameterTop: 0.16, diameterBottom: 0.21, tessellation: 8 },
    scene
  );
  postMesh.position.set(signPostX, signPostY + 0.9, signPostZ);
  postMesh.material = barkMat;
  postMesh.receiveShadows = true;
  postMesh.freezeWorldMatrix();
  heroShadowMeshes.push(postMesh);

  const signArm = MeshBuilder.CreateBox(
    'trailSignBoard',
    { width: 0.95, height: 0.24, depth: 0.08 },
    scene
  );
  signArm.position.set(signPostX + 0.22, signPostY + 1.52, signPostZ + 0.05);
  signArm.rotation.y = 0.55;
  signArm.material = barkMat;
  signArm.receiveShadows = true;
  signArm.freezeWorldMatrix();
  heroShadowMeshes.push(signArm);
  colliders.push({ x: signPostX, z: signPostZ, radius: 0.35 });

  // 4. Populate Forest Trees (~330 varied trees + perimeter woodland wall)
  const treeMatrices: number[][] = [[], [], [], []];
  const rootMatrices: number[] = [];

  const cellSize = 11.2;
  for (let gx = -120; gx <= 120; gx += cellSize) {
    for (let gz = -120; gz <= 120; gz += cellSize) {
      const n1 = valueNoise2D(gx * 0.37 + 5.1, gz * 0.43 + 9.2);
      const n2 = valueNoise2D(gx * 0.71 + 18.4, gz * 0.63 + 2.7);
      const n3 = valueNoise2D(gx * 1.13 + 3.8, gz * 0.97 + 14.1);

      const x = gx + (n1 - 0.5) * 9.2;
      const z = gz + (n2 - 0.5) * 9.2;
      const distCenter = Math.hypot(x, z);

      // Denser woodland near map borders; natural glades in interior
      const isRim = distCenter > 92;
      if (!isRim && n3 < 0.26) {
        continue;
      }

      // Keep starting clearing, dirt path, stream channel, Great Old Tree, and rocky hill clear
      if (distCenter < 13.5) continue;
      if (Math.hypot(x - oldTreeX, z - oldTreeZ) < 10.2) continue;
      if (getPathDistance(x, z) < 3.6) continue;

      const river = getRiverInfo(x, z);
      if (z >= -56 && river.distance < river.halfWidth + 3.0) continue;

      const rockyHillDist = Math.hypot(x - 54, z - 62);
      if (rockyHillDist < 12.5) continue;

      const slope = getTerrainSlope(x, z);
      if (slope > 0.48 && !isRim) continue;

      const y = getTerrainHeight(x, z);
      const archIdx = Math.floor(n3 * 4) % 4;
      const scaleXZ = 0.8 + n1 * 0.52;
      const scaleY = 0.78 + n2 * 0.62;
      const rotY = (n1 + n2) * Math.PI * 2;
      const tiltX = (n2 - 0.5) * 0.09;
      const tiltZ = (n3 - 0.5) * 0.09;

      appendInstanceMatrix(
        treeMatrices[archIdx],
        new Vector3(x, y - 0.1, z),
        rotY,
        new Vector3(scaleXZ, scaleY, scaleXZ),
        tiltX,
        tiltZ
      );

      if (Math.abs(x) <= PLAYABLE_BOUNDARY && Math.abs(z) <= PLAYABLE_BOUNDARY) {
        colliders.push({ x, z, radius: 0.45 * scaleXZ });
      }

      // Occasional exposed surface roots radiating around larger trees
      if (n3 > 0.62 && !isRim) {
        appendInstanceMatrix(
          rootMatrices,
          new Vector3(x + Math.cos(rotY) * 0.9, y + 0.08, z + Math.sin(rotY) * 0.9),
          rotY + 0.4,
          new Vector3(scaleXZ * 1.1, 0.42, scaleXZ * 0.6)
        );
      }
    }
  }

  archetypes.forEach((arch, idx) => {
    const buf = new Float32Array(treeMatrices[idx]);
    if (buf.length > 0) {
      arch.trunk.thinInstanceSetBuffer('matrix', buf, 16, true);
      arch.canopy.thinInstanceSetBuffer('matrix', buf, 16, true);
      shadowCasterMeshes.push(arch.trunk, arch.canopy);
    }
  });

  // Exposed root template mesh
  const rootTemplate = MeshBuilder.CreateCylinder(
    'exposedRootTemplate',
    { height: 2.2, diameterTop: 0.14, diameterBottom: 0.34, tessellation: 6 },
    scene
  );
  rootTemplate.rotation.z = Math.PI / 2 - 0.18;
  rootTemplate.material = barkMat;
  rootTemplate.isPickable = false;
  rootTemplate.receiveShadows = true;
  if (rootMatrices.length > 0) {
    rootTemplate.thinInstanceSetBuffer('matrix', new Float32Array(rootMatrices), 16, true);
  } else {
    rootTemplate.setEnabled(false);
  }

  // 5. Ferns, Bushes, Grass Tufts, Fallen Logs, Dry Leaf Patches, and Rocky Hill Boulders
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
    { radius: 0.95, tessellation: 7 },
    scene
  );
  dryLeafTemplate.rotation.x = Math.PI / 2;
  dryLeafTemplate.material = dryLeafMat;
  dryLeafTemplate.isPickable = false;
  dryLeafTemplate.receiveShadows = true;

  const fernMatrices: number[] = [];
  const bushMatrices: number[] = [];
  const grassMatrices: number[] = [];
  const logMatrices: number[] = [];
  const rockMatrices: number[] = [];
  const leafMatrices: number[] = [];

  // Scattered undergrowth & forest floor details
  for (let gx = -112; gx <= 112; gx += 6.2) {
    for (let gz = -112; gz <= 112; gz += 6.2) {
      const n1 = valueNoise2D(gx * 0.53 + 2.1, gz * 0.59 + 8.4);
      const n2 = valueNoise2D(gx * 0.89 + 14.3, gz * 0.77 + 5.6);
      const x = gx + (n1 - 0.5) * 5.0;
      const z = gz + (n2 - 0.5) * 5.0;

      const river = getRiverInfo(x, z);
      const inWater = z >= -52 && river.distance < river.halfWidth * 0.92;
      if (inWater) continue;

      const pathDist = getPathDistance(x, z);
      const slope = getTerrainSlope(x, z);
      const y = getTerrainHeight(x, z);
      const distCenter = Math.hypot(x, z);

      // Ferns thrive near moisture, tree shade, and clearing edges
      if (pathDist > 2.3 && slope < 0.45 && n1 > 0.56) {
        const s = 0.7 + n2 * 0.85;
        appendInstanceMatrix(
          fernMatrices,
          new Vector3(x, y + 0.02, z),
          n1 * Math.PI * 2,
          new Vector3(s, s, s)
        );
      }

      // Forest bushes / shrubs
      if (distCenter > 10 && pathDist > 2.9 && slope < 0.44 && n2 > 0.76) {
        const s = 0.75 + n1 * 0.7;
        appendInstanceMatrix(
          bushMatrices,
          new Vector3(x, y - 0.05, z),
          n2 * Math.PI * 2,
          new Vector3(s, s * 0.9, s)
        );
      }

      // Grass tufts across meadows and trail edges
      if (pathDist > 1.85 && slope < 0.34 && n1 < 0.68) {
        const s = 0.65 + n2 * 0.75;
        appendInstanceMatrix(
          grassMatrices,
          new Vector3(x, y - 0.02, z),
          (n1 + n2) * Math.PI * 2,
          new Vector3(s, s, s)
        );
      }

      // Fallen branches / logs
      if (distCenter > 11 && pathDist > 3.2 && slope < 0.3 && n1 > 0.88 && n2 > 0.65) {
        const s = 0.75 + n2 * 0.65;
        appendInstanceMatrix(
          logMatrices,
          new Vector3(x, y + 0.06, z),
          n1 * Math.PI * 2,
          new Vector3(s, s, s),
          0,
          (n2 - 0.5) * 0.14
        );
        colliders.push({ x, z, radius: 0.75 * s });
      }

      // Dry leaf & debris clusters under forest floor
      if (distCenter > 10 && pathDist > 2.4 && slope < 0.35 && n2 > 0.78) {
        const s = 0.8 + n1 * 1.1;
        appendInstanceMatrix(
          leafMatrices,
          new Vector3(x, y + 0.03, z),
          n1 * Math.PI * 2,
          new Vector3(s, 1, s * 0.8)
        );
      }
    }
  }

  // Natural Rock Formations: Rocky Hill (54, 62), Clearing Stones, and Scattered Boulders
  const heroRocks = [
    // Starting clearing framing stones
    { x: -7.8, z: 6.4, s: new Vector3(1.5, 0.95, 1.3), r: 0.95 },
    { x: 9.2, z: 8.1, s: new Vector3(1.8, 1.1, 1.5), r: 1.1 },
    { x: -10.5, z: -6.2, s: new Vector3(2.1, 1.25, 1.7), r: 1.25 },
    // Rocky Hill Outcrops around (54, 62)
    { x: 52.5, z: 63.0, s: new Vector3(4.2, 3.1, 3.6), r: 2.3 },
    { x: 57.5, z: 60.5, s: new Vector3(3.6, 2.5, 3.1), r: 1.9 },
    { x: 49.0, z: 59.5, s: new Vector3(2.8, 1.8, 2.4), r: 1.5 },
    { x: 56.0, z: 66.8, s: new Vector3(3.3, 2.3, 2.9), r: 1.8 },
    { x: 61.5, z: 63.5, s: new Vector3(2.9, 1.9, 2.6), r: 1.6 },
    // Other trailside rock formations
    { x: -24, z: 48, s: new Vector3(3.1, 2.1, 2.5), r: 1.7 },
    { x: -34, z: -22, s: new Vector3(3.4, 2.4, 2.8), r: 1.85 },
    { x: 26, z: -18, s: new Vector3(2.6, 1.7, 2.2), r: 1.45 },
  ];

  heroRocks.forEach((b, idx) => {
    const by = getTerrainHeight(b.x, b.z);
    appendInstanceMatrix(
      rockMatrices,
      new Vector3(b.x, by + b.s.y * 0.3, b.z),
      idx * 1.1,
      b.s
    );
    colliders.push({ x: b.x, z: b.z, radius: b.r });
  });

  // Additional smaller natural rocks across hills & slopes
  for (let gx = -108; gx <= 108; gx += 16) {
    for (let gz = -108; gz <= 108; gz += 16) {
      const n1 = valueNoise2D(gx * 0.31 + 41.2, gz * 0.29 + 19.7);
      const n2 = valueNoise2D(gx * 0.61 + 7.3, gz * 0.67 + 33.1);
      if (n1 < 0.58) continue;

      const x = gx + (n1 - 0.5) * 12;
      const z = gz + (n2 - 0.5) * 12;
      if (Math.hypot(x, z) < 12) continue;
      if (getPathDistance(x, z) < 3.0) continue;
      const river = getRiverInfo(x, z);
      if (z >= -52 && river.distance < river.halfWidth + 2.2) continue;

      const y = getTerrainHeight(x, z);
      const s = 0.8 + n2 * 1.45;
      appendInstanceMatrix(
        rockMatrices,
        new Vector3(x, y + s * 0.26, z),
        n1 * Math.PI * 2,
        new Vector3(s * 1.2, s * 0.78, s)
      );
      colliders.push({ x, z, radius: s * 0.68 });
    }
  }

  const applyThinBuffer = (mesh: Mesh, arr: number[]): void => {
    if (arr.length > 0) {
      mesh.thinInstanceSetBuffer('matrix', new Float32Array(arr), 16, true);
    } else {
      mesh.setEnabled(false);
    }
  };

  applyThinBuffer(fernTemplate, fernMatrices);
  applyThinBuffer(bushTemplate, bushMatrices);
  applyThinBuffer(grassTemplate, grassMatrices);
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
