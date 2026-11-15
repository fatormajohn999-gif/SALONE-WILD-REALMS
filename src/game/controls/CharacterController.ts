import { Scalar } from '@babylonjs/core/Maths/math.scalar';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { ExplorerCharacter } from '../character/ExplorerCharacter';
import type { CharacterMovementState, ColliderCircle, InputState } from '../types';

export class CharacterController {
  private readonly character: ExplorerCharacter;
  private readonly walkSpeed = 4.2;
  private readonly runSpeed = 7.6;
  private readonly jumpImpulse = 7.4;
  private readonly gravity = -20.5;
  private readonly worldRadiusLimit = 80;
  private readonly characterRadius = 0.38;

  private velocityX = 0;
  private velocityZ = 0;
  private velocityY = 0;
  private isGrounded = true;
  private coyoteTimer = 0;
  private jumpBufferTimer = 0;
  private facingYaw = 0;
  private currentState: CharacterMovementState = 'idle';

  constructor(character: ExplorerCharacter) {
    this.character = character;
  }

  public getPosition(): Vector3 {
    return this.character.root.position;
  }

  public getFacingYaw(): number {
    return this.facingYaw;
  }

  public getMovementState(): CharacterMovementState {
    return this.currentState;
  }

  public resetPosition(getGroundHeight: (x: number, z: number) => number): void {
    const startY = getGroundHeight(0, 0);
    this.character.root.position.set(0, startY, 0);
    this.velocityX = 0;
    this.velocityY = 0;
    this.velocityZ = 0;
    this.isGrounded = true;
    this.facingYaw = 0;
    this.character.setFacingYaw(0);
    this.currentState = 'idle';
  }

  public update(
    dt: number,
    input: InputState,
    cameraYaw: number,
    getGroundHeight: (x: number, z: number) => number,
    colliders: ColliderCircle[]
  ): CharacterMovementState {
    const inputMag = Math.min(1, Math.hypot(input.moveX, input.moveY));
    const hasMove = inputMag > 0.08;

    // Transform 2D joystick/key input into world XZ relative to camera yaw
    const forwardX = Math.sin(cameraYaw);
    const forwardZ = Math.cos(cameraYaw);
    const rightX = Math.cos(cameraYaw);
    const rightZ = -Math.sin(cameraYaw);

    let desiredDirX = 0;
    let desiredDirZ = 0;

    if (hasMove) {
      desiredDirX = forwardX * input.moveY + rightX * input.moveX;
      desiredDirZ = forwardZ * input.moveY + rightZ * input.moveX;
      const len = Math.hypot(desiredDirX, desiredDirZ);
      if (len > 0.0001) {
        desiredDirX /= len;
        desiredDirZ /= len;
      }
    }

    const maxSpeed = input.sprint ? this.runSpeed : this.walkSpeed;
    const targetSpeed = hasMove ? maxSpeed * inputMag : 0;
    const targetVelX = desiredDirX * targetSpeed;
    const targetVelZ = desiredDirZ * targetSpeed;

    const accelRate = this.isGrounded ? (hasMove ? 14 : 11) : 5;
    const horizAlpha = 1 - Math.exp(-accelRate * dt);
    this.velocityX = Scalar.Lerp(this.velocityX, targetVelX, horizAlpha);
    this.velocityZ = Scalar.Lerp(this.velocityZ, targetVelZ, horizAlpha);

    // Coyote time and jump buffering make mobile jump taps responsive
    if (this.isGrounded) {
      this.coyoteTimer = 0.11;
    } else {
      this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);
    }

    if (input.jumpPressed) {
      this.jumpBufferTimer = 0.13;
    } else {
      this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dt);
    }

    if (this.jumpBufferTimer > 0 && this.coyoteTimer > 0) {
      this.velocityY = this.jumpImpulse;
      this.isGrounded = false;
      this.coyoteTimer = 0;
      this.jumpBufferTimer = 0;
    }

    // Apply gravity
    this.velocityY += this.gravity * dt;

    const pos = this.character.root.position;
    let nextX = pos.x + this.velocityX * dt;
    let nextZ = pos.z + this.velocityZ * dt;
    let nextY = pos.y + this.velocityY * dt;

    // Resolve horizontal circle collisions against clearing landmarks
    for (const col of colliders) {
      const dx = nextX - col.x;
      const dz = nextZ - col.z;
      const dist = Math.hypot(dx, dz);
      const minDist = col.radius + this.characterRadius;
      if (dist < minDist) {
        if (dist > 0.0001) {
          const push = minDist - dist;
          nextX += (dx / dist) * push;
          nextZ += (dz / dist) * push;
        } else {
          nextZ += minDist;
        }
      }
    }

    // Keep explorer within the foundation clearing boundary
    nextX = Scalar.Clamp(nextX, -this.worldRadiusLimit, this.worldRadiusLimit);
    nextZ = Scalar.Clamp(nextZ, -this.worldRadiusLimit, this.worldRadiusLimit);

    const groundY = getGroundHeight(nextX, nextZ);
    if (nextY <= groundY) {
      nextY = groundY;
      this.velocityY = 0;
      this.isGrounded = true;
    } else {
      this.isGrounded = false;
    }

    pos.set(nextX, nextY, nextZ);

    // Smoothly turn explorer toward movement direction
    const horizontalSpeed = Math.hypot(this.velocityX, this.velocityZ);
    if (hasMove && horizontalSpeed > 0.2) {
      const targetYaw = Math.atan2(desiredDirX, desiredDirZ);
      const yawDiff = Math.atan2(
        Math.sin(targetYaw - this.facingYaw),
        Math.cos(targetYaw - this.facingYaw)
      );
      this.facingYaw += yawDiff * (1 - Math.exp(-12 * dt));
      this.character.setFacingYaw(this.facingYaw);
    }

    let nextState: CharacterMovementState = 'idle';
    if (!this.isGrounded) {
      nextState = 'jump';
    } else if (horizontalSpeed > 0.45) {
      nextState = input.sprint && horizontalSpeed > this.walkSpeed + 0.5 ? 'run' : 'walk';
    }

    this.currentState = nextState;
    const normalizedSpeed = Math.min(1, horizontalSpeed / maxSpeed);
    this.character.updateAnimation(dt, nextState, normalizedSpeed);

    return nextState;
  }
}
