import type { InputState } from '../types';

export class InputManager {
  private readonly keysDown = new Set<string>();
  private touchMoveX = 0;
  private touchMoveY = 0;
  private touchSprint = false;
  private queuedJump = false;
  private lookDeltaX = 0;
  private lookDeltaY = 0;

  constructor() {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleWindowBlur);
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    this.keysDown.add(e.code);
    if (e.code === 'Space' && !e.repeat) {
      this.queuedJump = true;
    }
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    this.keysDown.delete(e.code);
  };

  private handleWindowBlur = (): void => {
    this.keysDown.clear();
  };

  public setTouchMove(x: number, y: number): void {
    this.touchMoveX = x;
    this.touchMoveY = y;
  }

  public setTouchSprint(active: boolean): void {
    this.touchSprint = active;
  }

  public triggerJump(): void {
    this.queuedJump = true;
  }

  public addLookDelta(dx: number, dy: number): void {
    this.lookDeltaX += dx;
    this.lookDeltaY += dy;
  }

  public consumeInputState(): InputState {
    let keyX = 0;
    let keyY = 0;

    if (this.keysDown.has('KeyW') || this.keysDown.has('ArrowUp')) keyY += 1;
    if (this.keysDown.has('KeyS') || this.keysDown.has('ArrowDown')) keyY -= 1;
    if (this.keysDown.has('KeyD') || this.keysDown.has('ArrowRight')) keyX += 1;
    if (this.keysDown.has('KeyA') || this.keysDown.has('ArrowLeft')) keyX -= 1;

    if (keyX !== 0 && keyY !== 0) {
      const invSqrt2 = 1 / Math.SQRT2;
      keyX *= invSqrt2;
      keyY *= invSqrt2;
    }

    const useTouchMove =
      Math.abs(this.touchMoveX) > 0.01 || Math.abs(this.touchMoveY) > 0.01;
    const moveX = useTouchMove ? this.touchMoveX : keyX;
    const moveY = useTouchMove ? this.touchMoveY : keyY;

    const keyboardSprint =
      this.keysDown.has('ShiftLeft') || this.keysDown.has('ShiftRight');

    const state: InputState = {
      moveX,
      moveY,
      sprint: this.touchSprint || keyboardSprint,
      jumpPressed: this.queuedJump,
      lookDeltaX: this.lookDeltaX,
      lookDeltaY: this.lookDeltaY,
    };

    this.queuedJump = false;
    this.lookDeltaX = 0;
    this.lookDeltaY = 0;

    return state;
  }

  public dispose(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleWindowBlur);
  }
}
