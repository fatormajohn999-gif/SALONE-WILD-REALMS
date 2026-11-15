import type { Engine } from '@babylonjs/core/Engines/engine';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { Scene } from '@babylonjs/core/scene';
import type { ColliderCircle, EnvironmentSceneHandle, GraphicsQuality } from '../types';

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Computes natural ground elevation for the initial foundation clearing.
 * Keeps the central 18m clearing flat for reliable movement & jump testing,
 * blending smoothly into gentle rolling hills toward the horizon.
 */
export function getFoundationGroundHeight(x: number, z: number): number {
  const dist = Math.hypot(x, z);
  const edgeBlend = smoothstep(18, 42, dist);
  if (edgeBlend <= 0) {
    return 0;
  }

  const gentleHills =
    Math.sin(x * 0.065) * Math.cos(z * 0.055) * 2.4 +
    Math.sin((x + z) * 0.032) * 1.4 +
    1.1;

  return gentleHills * edgeBlend;
}

function createSkyDome(scene: Scene): Mesh {
  const skyDome = MeshBuilder.CreateSphere(
    'skyDome',
    { diameter: 340, segments: 20, sideOrientation: Mesh.BACKSIDE },
    scene
  );
  skyDome.isPickable = false;
  skyDome.infiniteDistance = true;

  const positions = skyDome.getVerticesData(VertexBuffer.PositionKind);
  if (positions) {
    const colors = new Float32Array((positions.length / 3) * 4);
    const horizonColor = new Color3(0.76, 0.85, 0.79);
    const midSkyColor = new Color3(0.39, 0.62, 0.71);
    const zenithColor = new Color3(0.16, 0.34, 0.45);
    const lowerColor = new Color3(0.24, 0.34, 0.28);

    for (let i = 0; i < positions.length / 3; i++) {
      const y = positions[i * 3 + 1];
      const normalizedY = y / 170;
      let col: Color3;

      if (normalizedY >= 0) {
        if (normalizedY < 0.35) {
          col = Color3.Lerp(horizonColor, midSkyColor, normalizedY / 0.35);
        } else {
          col = Color3.Lerp(midSkyColor, zenithColor, (normalizedY - 0.35) / 0.65);
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

  const skyMat = new StandardMaterial('skyMat', scene);
  skyMat.emissiveColor = new Color3(1, 1, 1);
  skyMat.disableLighting = true;
  skyMat.backFaceCulling = true;
  skyDome.material = skyMat;
  skyDome.freezeWorldMatrix();

  return skyDome;
}

function createProceduralGroundTexture(scene: Scene): DynamicTexture {
  const size = 512;
  const texture = new DynamicTexture('groundTex', { width: size, height: size }, scene, true);
  const ctx = texture.getContext();

  // Rich natural moss & meadow grass base
  ctx.fillStyle = '#3B5C3B';
  ctx.fillRect(0, 0, size, size);

  // Subtle deterministic mottling for organic ground detail without external texture downloads
  let seed = 1337;
  const nextRand = (): number => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  for (let i = 0; i < 2400; i++) {
    const x = nextRand() * size;
    const y = nextRand() * size;
    const r = 2 + nextRand() * 10;
    const tone = nextRand();

    if (tone < 0.33) {
      ctx.fillStyle = 'rgba(42, 70, 44, 0.22)';
    } else if (tone < 0.66) {
      ctx.fillStyle = 'rgba(79, 112, 69, 0.18)';
    } else {
      ctx.fillStyle = 'rgba(98, 96, 65, 0.14)';
    }

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  texture.uScale = 18;
  texture.vScale = 18;
  texture.anisotropicFilteringLevel = 4;
  texture.update();

  return texture;
}

function createGroundMesh(scene: Scene): Mesh {
  const ground = MeshBuilder.CreateGround(
    'foundationGround',
    { width: 180, height: 180, subdivisions: 64, updatable: false },
    scene
  );

  const positions = ground.getVerticesData(VertexBuffer.PositionKind);
  const indices = ground.getIndices();
  if (positions && indices) {
    for (let i = 0; i < positions.length / 3; i++) {
      const x = positions[i * 3];
      const z = positions[i * 3 + 2];
      positions[i * 3 + 1] = getFoundationGroundHeight(x, z);
    }
    ground.updateVerticesData(VertexBuffer.PositionKind, positions);

    const normals = new Float32Array(positions.length);
    VertexData.ComputeNormals(positions, indices, normals);
    ground.updateVerticesData(VertexBuffer.NormalKind, normals);
  }

  const groundMat = new StandardMaterial('groundMat', scene);
  groundMat.diffuseTexture = createProceduralGroundTexture(scene);
  groundMat.specularColor = new Color3(0.04, 0.05, 0.04);
  groundMat.ambientColor = new Color3(0.25, 0.3, 0.25);

  ground.material = groundMat;
  ground.receiveShadows = true;
  ground.freezeWorldMatrix();

  return ground;
}

function createClearingLandmarks(
  scene: Scene,
  registerShadowCaster: (mesh: AbstractMesh) => void
): ColliderCircle[] {
  const colliders: ColliderCircle[] = [];

  const stoneMat = new StandardMaterial('clearingStoneMat', scene);
  stoneMat.diffuseColor = new Color3(0.36, 0.4, 0.37);
  stoneMat.specularColor = new Color3(0.08, 0.08, 0.08);

  const mossStoneMat = new StandardMaterial('clearingMossStoneMat', scene);
  mossStoneMat.diffuseColor = new Color3(0.28, 0.38, 0.31);
  mossStoneMat.specularColor = new Color3(0.06, 0.06, 0.06);

  // Subtle scattered boulders around the clearing so movement speed & depth perception are immediate
  const stoneSpecs = [
    { x: -7.5, z: 6.2, sx: 1.5, sy: 0.95, sz: 1.3, rotY: 0.4, mossy: true },
    { x: 9.2, z: 8.4, sx: 1.9, sy: 1.15, sz: 1.6, rotY: 1.1, mossy: false },
    { x: -11.4, z: -5.8, sx: 2.1, sy: 1.3, sz: 1.7, rotY: 2.3, mossy: true },
    { x: 10.6, z: -7.2, sx: 1.4, sy: 0.85, sz: 1.25, rotY: 0.9, mossy: false },
    { x: 2.4, z: 13.5, sx: 2.3, sy: 1.35, sz: 1.8, rotY: 1.7, mossy: true },
  ];

  stoneSpecs.forEach((spec, idx) => {
    const stone = MeshBuilder.CreatePolyhedron(
      `clearingStone_${idx}`,
      { type: 1, size: 0.75 },
      scene
    );
    const groundY = getFoundationGroundHeight(spec.x, spec.z);
    stone.position.set(spec.x, groundY + spec.sy * 0.38, spec.z);
    stone.scaling.set(spec.sx, spec.sy, spec.sz);
    stone.rotation.y = spec.rotY;
    stone.material = spec.mossy ? mossStoneMat : stoneMat;
    stone.receiveShadows = true;
    stone.freezeWorldMatrix();
    registerShadowCaster(stone);

    colliders.push({
      x: spec.x,
      z: spec.z,
      radius: Math.max(spec.sx, spec.sz) * 0.56,
    });
  });

  // Simple wooden trail marker post at the edge of the clearing
  const woodMat = new StandardMaterial('trailPostWoodMat', scene);
  woodMat.diffuseColor = new Color3(0.41, 0.3, 0.21);
  woodMat.specularColor = new Color3(0.06, 0.05, 0.04);

  const postX = 4.6;
  const postZ = 6.2;
  const postBaseY = getFoundationGroundHeight(postX, postZ);

  const post = MeshBuilder.CreateCylinder(
    'trailMarkerPost',
    { height: 1.8, diameterTop: 0.16, diameterBottom: 0.2, tessellation: 8 },
    scene
  );
  post.position.set(postX, postBaseY + 0.85, postZ);
  post.material = woodMat;
  post.receiveShadows = true;
  post.freezeWorldMatrix();
  registerShadowCaster(post);

  const signArm = MeshBuilder.CreateBox(
    'trailMarkerArm',
    { width: 0.9, height: 0.22, depth: 0.08 },
    scene
  );
  signArm.position.set(postX + 0.25, postBaseY + 1.48, postZ);
  signArm.rotation.y = -0.32;
  signArm.material = woodMat;
  signArm.receiveShadows = true;
  signArm.freezeWorldMatrix();
  registerShadowCaster(signArm);

  colliders.push({ x: postX, z: postZ, radius: 0.35 });

  return colliders;
}

export function createEnvironmentScene(
  engine: Engine,
  initialQuality: GraphicsQuality
): EnvironmentSceneHandle {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.73, 0.83, 0.77, 1.0);
  scene.ambientColor = new Color3(0.18, 0.24, 0.2);

  // Subtle atmospheric depth fog matching the sky horizon
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogColor = new Color3(0.74, 0.84, 0.78);
  scene.fogDensity = 0.0052;

  createSkyDome(scene);

  // Ambient natural daylight fill
  const hemiLight = new HemisphericLight('skyFillLight', new Vector3(0, 1, 0), scene);
  hemiLight.diffuse = new Color3(0.88, 0.94, 0.98);
  hemiLight.groundColor = new Color3(0.18, 0.27, 0.2);
  hemiLight.intensity = 0.65;

  // Primary warm sunlight
  const sunDirection = new Vector3(-0.46, -0.82, -0.34).normalize();
  const sunLight = new DirectionalLight('sunLight', sunDirection, scene);
  sunLight.position = sunDirection.scale(-45);
  sunLight.diffuse = new Color3(1.0, 0.95, 0.84);
  sunLight.specular = new Color3(1.0, 0.91, 0.74);
  sunLight.intensity = 1.35;
  sunLight.shadowMinZ = 5;
  sunLight.shadowMaxZ = 110;

  // Soft visual sun disc in the sky matching sun direction
  const sunDisc = MeshBuilder.CreateDisc('sunDisc', { radius: 8.5, tessellation: 20 }, scene);
  sunDisc.position = sunDirection.scale(-155);
  sunDisc.billboardMode = Mesh.BILLBOARDMODE_ALL;
  sunDisc.isPickable = false;
  const sunDiscMat = new StandardMaterial('sunDiscMat', scene);
  sunDiscMat.emissiveColor = new Color3(1.0, 0.95, 0.82);
  sunDiscMat.disableLighting = true;
  sunDisc.material = sunDiscMat;
  sunDisc.freezeWorldMatrix();

  const shadowCasters: AbstractMesh[] = [];
  let shadowGenerator: ShadowGenerator | null = null;

  const rebuildShadows = (quality: GraphicsQuality): void => {
    if (shadowGenerator) {
      shadowGenerator.dispose();
      shadowGenerator = null;
    }

    if (quality === 'low') {
      sunLight.shadowEnabled = false;
      return;
    }

    sunLight.shadowEnabled = true;
    const mapSize = quality === 'high' ? 1024 : 512;
    shadowGenerator = new ShadowGenerator(mapSize, sunLight);
    shadowGenerator.usePoissonSampling = true;
    shadowGenerator.bias = 0.0008;
    shadowGenerator.normalBias = 0.02;

    for (const mesh of shadowCasters) {
      shadowGenerator.addShadowCaster(mesh, true);
    }
  };

  const registerShadowCaster = (mesh: AbstractMesh): void => {
    shadowCasters.push(mesh);
    if (shadowGenerator) {
      shadowGenerator.addShadowCaster(mesh, true);
    }
  };

  rebuildShadows(initialQuality);

  createGroundMesh(scene);
  const colliders = createClearingLandmarks(scene, registerShadowCaster);

  const applyQuality = (quality: GraphicsQuality): void => {
    scene.fogEnabled = true;
    rebuildShadows(quality);
  };

  const dispose = (): void => {
    if (shadowGenerator) {
      shadowGenerator.dispose();
      shadowGenerator = null;
    }
    scene.dispose();
  };

  return {
    scene,
    sunLight,
    shadowGenerator,
    getGroundHeight: getFoundationGroundHeight,
    colliders,
    registerShadowCaster,
    applyQuality,
    dispose,
  };
}
