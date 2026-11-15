import type { Engine } from '@babylonjs/core/Engines/engine';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { Scene } from '@babylonjs/core/scene';
import type { ColliderCircle, EnvironmentSceneHandle, GraphicsQuality } from '../types';
import { createForestFlora } from '../world/createForestFlora';
import { createGroundAndSky } from '../world/createGroundAndSky';
import { createWaterAndWaterfall } from '../world/createWaterAndWaterfall';
import { getTerrainHeight } from '../world/terrainMath';

export function createEnvironmentScene(
  engine: Engine,
  initialQuality: GraphicsQuality
): EnvironmentSceneHandle {
  const scene = new Scene(engine);

  const { sunLight } = createGroundAndSky(scene);
  const sunDir = sunLight.direction.clone();

  const waterHandle = createWaterAndWaterfall(scene);
  const floraHandle = createForestFlora(scene);

  const colliders: ColliderCircle[] = [
    ...waterHandle.colliders,
    ...floraHandle.colliders,
  ];

  // Dynamic shadow casters registered externally (e.g. explorer character)
  const dynamicShadowCasters: AbstractMesh[] = [];
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
    shadowGenerator.bias = 0.0012;
    shadowGenerator.normalBias = 0.025;

    for (const mesh of dynamicShadowCasters) {
      shadowGenerator.addShadowCaster(mesh, true);
    }
    for (const mesh of floraHandle.heroShadowMeshes) {
      shadowGenerator.addShadowCaster(mesh, true);
    }
    if (quality === 'high') {
      for (const mesh of floraHandle.shadowCasterMeshes) {
        shadowGenerator.addShadowCaster(mesh, true);
      }
    }
  };

  const registerShadowCaster = (mesh: AbstractMesh): void => {
    dynamicShadowCasters.push(mesh);
    if (shadowGenerator) {
      shadowGenerator.addShadowCaster(mesh, true);
    }
  };

  rebuildShadows(initialQuality);

  const update = (dt: number, focusX = 0, focusZ = 0): void => {
    waterHandle.update(dt);

    if (sunLight.shadowEnabled) {
      // Snap shadow center to 2m grid to avoid shadow-edge shimmer during movement
      const snapX = Math.round(focusX * 0.5) * 2;
      const snapZ = Math.round(focusZ * 0.5) * 2;
      sunLight.position.set(
        snapX - sunDir.x * 75,
        -sunDir.y * 75,
        snapZ - sunDir.z * 75
      );
    }
  };

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
    getGroundHeight: getTerrainHeight,
    colliders,
    registerShadowCaster,
    update,
    applyQuality,
    dispose,
  };
}
