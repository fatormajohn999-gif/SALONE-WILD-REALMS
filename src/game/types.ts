import type { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import type { Scene } from '@babylonjs/core/scene';

export type GraphicsQuality = 'low' | 'medium' | 'high';

export type CharacterMovementState = 'idle' | 'walk' | 'run' | 'jump';

export interface InputState {
  /** Normalized horizontal movement input (-1 left, +1 right). */
  moveX: number;
  /** Normalized vertical movement input (-1 backward, +1 forward). */
  moveY: number;
  /** True when player intends to run. */
  sprint: boolean;
  /** True while jump button or spacebar is triggered. */
  jumpPressed: boolean;
  /** Accumulated camera horizontal look delta (in pixels/units). */
  lookDeltaX: number;
  /** Accumulated camera vertical look delta (in pixels/units). */
  lookDeltaY: number;
}

export interface ColliderCircle {
  x: number;
  z: number;
  radius: number;
}

export interface EnvironmentSceneHandle {
  scene: Scene;
  sunLight: DirectionalLight;
  shadowGenerator: ShadowGenerator | null;
  getGroundHeight: (x: number, z: number) => number;
  colliders: ColliderCircle[];
  registerShadowCaster: (mesh: import('@babylonjs/core/Meshes/abstractMesh').AbstractMesh) => void;
  applyQuality: (quality: GraphicsQuality) => void;
  dispose: () => void;
}

export interface GameCallbacks {
  onReady?: () => void;
  onWebGLContextChange?: (lost: boolean) => void;
  onMovementStateChange?: (state: CharacterMovementState) => void;
}
