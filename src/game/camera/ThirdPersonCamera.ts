import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Scalar } from '@babylonjs/core/Maths/math.scalar';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';

export class ThirdPersonCamera {
  public readonly camera: FreeCamera;

  private yaw = 0;
  private pitch = 0.34;
  private distance = 6.2;
  private readonly minPitch = -0.14;
  private readonly maxPitch = 1.05;
  private readonly lookSensitivity = 0.0055;

  private readonly targetLookAt = new Vector3(0, 1.4, 0);
  private readonly desiredLookAt = new Vector3(0, 1.4, 0);
  private readonly desiredCamPos = new Vector3(0, 3.2, -6.2);

  private recenterTargetYaw: number | null = null;

  constructor(scene: Scene) {
    this.camera = new FreeCamera(
      'thirdPersonCamera',
      new Vector3(0, 3.2, -6.2),
      scene
    );
    this.camera.inputs.clear();
    this.camera.minZ = 0.25;
    this.camera.maxZ = 440;
    this.camera.fov = 0.78;
    scene.activeCamera = this.camera;
  }

  public getYaw(): number {
    return this.yaw;
  }

  public applyLookDelta(dx: number, dy: number): void {
    if (dx === 0 && dy === 0) {
      return;
    }
    this.recenterTargetYaw = null;
    this.yaw += dx * this.lookSensitivity;
    this.pitch = Scalar.Clamp(
      this.pitch + dy * this.lookSensitivity,
      this.minPitch,
      this.maxPitch
    );
  }

  public recenterBehindYaw(targetYaw: number): void {
    this.recenterTargetYaw = targetYaw;
  }

  public reset(): void {
    this.yaw = 0;
    this.pitch = 0.34;
    this.recenterTargetYaw = null;
  }

  public update(
    dt: number,
    playerPosition: Vector3,
    isRunning: boolean,
    getGroundHeight: (x: number, z: number) => number
  ): void {
    if (this.recenterTargetYaw !== null) {
      const diff = Math.atan2(
        Math.sin(this.recenterTargetYaw - this.yaw),
        Math.cos(this.recenterTargetYaw - this.yaw)
      );
      this.yaw += diff * (1 - Math.exp(-8 * dt));
      if (Math.abs(diff) < 0.01) {
        this.yaw = this.recenterTargetYaw;
        this.recenterTargetYaw = null;
      }
    }

    this.desiredLookAt.set(
      playerPosition.x,
      playerPosition.y + 1.42,
      playerPosition.z
    );

    const followAlpha = 1 - Math.exp(-14 * dt);
    Vector3.LerpToRef(
      this.targetLookAt,
      this.desiredLookAt,
      followAlpha,
      this.targetLookAt
    );

    const dirX = -Math.sin(this.yaw) * Math.cos(this.pitch);
    const dirY = Math.sin(this.pitch);
    const dirZ = -Math.cos(this.yaw) * Math.cos(this.pitch);

    const camX = this.targetLookAt.x + dirX * this.distance;
    const camZ = this.targetLookAt.z + dirZ * this.distance;
    let camY = this.targetLookAt.y + dirY * this.distance;

    // Sample terrain clearance at the camera position and intermediate arm points
    // so low, elevated, or orbiting angles never clip below hills or terrain faces.
    const armSamples = [0.4, 0.65, 0.85, 1.0];
    let requiredMinY = getGroundHeight(camX, camZ) + 0.72;
    for (let i = 0; i < armSamples.length; i++) {
      const t = armSamples[i];
      const sx = this.targetLookAt.x + dirX * (this.distance * t);
      const sz = this.targetLookAt.z + dirZ * (this.distance * t);
      const clearance = t >= 0.95 ? 0.72 : 0.48;
      const sampleMinY = getGroundHeight(sx, sz) + clearance;
      if (sampleMinY > requiredMinY) {
        requiredMinY = sampleMinY;
      }
    }

    if (camY < requiredMinY) {
      camY = requiredMinY;
    }

    this.desiredCamPos.set(camX, camY, camZ);
    const camAlpha = 1 - Math.exp(-18 * dt);
    Vector3.LerpToRef(
      this.camera.position,
      this.desiredCamPos,
      camAlpha,
      this.camera.position
    );

    const targetFov = isRunning ? 0.83 : 0.78;
    this.camera.fov = Scalar.Lerp(
      this.camera.fov,
      targetFov,
      1 - Math.exp(-6 * dt)
    );

    this.camera.setTarget(this.targetLookAt);
  }

  public dispose(): void {
    this.camera.dispose();
  }
}
