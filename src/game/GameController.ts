import { ThirdPersonCamera } from './camera/ThirdPersonCamera';
import { ExplorerCharacter } from './character/ExplorerCharacter';
import { CharacterController } from './controls/CharacterController';
import { InputManager } from './controls/InputManager';
import { createBabylonEngine, type EngineHandle } from './engine/createEngine';
import { createEnvironmentScene } from './scene/createEnvironmentScene';
import type {
  CharacterMovementState,
  EnvironmentSceneHandle,
  GameCallbacks,
  GraphicsQuality,
} from './types';

export class GameController {
  private readonly engineHandle: EngineHandle;
  private readonly envHandle: EnvironmentSceneHandle;
  private readonly character: ExplorerCharacter;
  private readonly thirdPersonCamera: ThirdPersonCamera;
  private readonly characterController: CharacterController;
  public readonly inputManager: InputManager;

  private lastMovementState: CharacterMovementState = 'idle';
  private disposed = false;

  constructor(
    canvas: HTMLCanvasElement,
    initialQuality: GraphicsQuality,
    callbacks?: GameCallbacks
  ) {
    this.engineHandle = createBabylonEngine(
      canvas,
      initialQuality,
      callbacks?.onWebGLContextChange
    );

    this.envHandle = createEnvironmentScene(this.engineHandle.engine, initialQuality);

    this.character = new ExplorerCharacter(
      this.envHandle.scene,
      this.envHandle.registerShadowCaster
    );

    this.thirdPersonCamera = new ThirdPersonCamera(this.envHandle.scene);
    this.characterController = new CharacterController(this.character);
    this.characterController.resetPosition(this.envHandle.getGroundHeight);

    this.inputManager = new InputManager();

    // Position camera cleanly behind player on frame 0
    this.thirdPersonCamera.update(
      1,
      this.characterController.getPosition(),
      false,
      this.envHandle.getGroundHeight
    );

    this.engineHandle.engine.runRenderLoop(() => {
      if (this.disposed) {
        return;
      }

      const rawDt = this.engineHandle.engine.getDeltaTime() / 1000;
      // Clamp dt to prevent huge simulation jumps after mobile app backgrounding
      const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

      const input = this.inputManager.consumeInputState();
      this.thirdPersonCamera.applyLookDelta(input.lookDeltaX, input.lookDeltaY);

      const movementState = this.characterController.update(
        dt,
        input,
        this.thirdPersonCamera.getYaw(),
        this.envHandle.getGroundHeight,
        this.envHandle.colliders
      );

      this.thirdPersonCamera.update(
        dt,
        this.characterController.getPosition(),
        movementState === 'run',
        this.envHandle.getGroundHeight
      );

      if (movementState !== this.lastMovementState) {
        this.lastMovementState = movementState;
        callbacks?.onMovementStateChange?.(movementState);
      }

      this.envHandle.scene.render();
    });

    callbacks?.onReady?.();
  }

  public setGraphicsQuality(quality: GraphicsQuality): void {
    this.engineHandle.applyQuality(quality);
    this.envHandle.applyQuality(quality);
  }

  public recenterCamera(): void {
    this.thirdPersonCamera.recenterBehindYaw(this.characterController.getFacingYaw());
  }

  public resetExplorerPosition(): void {
    this.characterController.resetPosition(this.envHandle.getGroundHeight);
    this.thirdPersonCamera.reset();
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.engineHandle.engine.stopRenderLoop();
    this.inputManager.dispose();
    this.thirdPersonCamera.dispose();
    this.character.dispose();
    this.envHandle.dispose();
    this.engineHandle.dispose();
  }
}
