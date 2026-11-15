import { ArrowUp, Footprints } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import type { InputManager } from '../game/controls/InputManager';

interface TouchControlsProps {
  inputManager: InputManager | null;
  isSprinting: boolean;
  onToggleSprint: () => void;
}

interface JoystickState {
  active: boolean;
  originX: number;
  originY: number;
  knobX: number;
  knobY: number;
}

const JOYSTICK_MAX_RADIUS = 46;

export function TouchControls({
  inputManager,
  isSprinting,
  onToggleSprint,
}: TouchControlsProps) {
  const joyPointerIdRef = useRef<number | null>(null);
  const joyOriginRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lookPointerIdRef = useRef<number | null>(null);
  const lastLookPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const [joystick, setJoystick] = useState<JoystickState>({
    active: false,
    originX: 0,
    originY: 0,
    knobX: 0,
    knobY: 0,
  });

  const handleJoystickDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (joyPointerIdRef.current !== null) {
        return;
      }
      if (e.pointerType === 'mouse' && e.button !== 0) {
        return;
      }
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      joyPointerIdRef.current = e.pointerId;

      const rect = e.currentTarget.getBoundingClientRect();
      const originX = e.clientX - rect.left;
      const originY = e.clientY - rect.top;
      joyOriginRef.current = { x: originX, y: originY };

      setJoystick({
        active: true,
        originX,
        originY,
        knobX: 0,
        knobY: 0,
      });

      inputManager?.setTouchMove(0, 0);
    },
    [inputManager]
  );

  const handleJoystickMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (joyPointerIdRef.current !== e.pointerId) {
        return;
      }
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const curX = e.clientX - rect.left;
      const curY = e.clientY - rect.top;

      const dx = curX - joyOriginRef.current.x;
      const dy = curY - joyOriginRef.current.y;
      const dist = Math.hypot(dx, dy);

      let clampedX = dx;
      let clampedY = dy;
      if (dist > JOYSTICK_MAX_RADIUS) {
        const scale = JOYSTICK_MAX_RADIUS / dist;
        clampedX = dx * scale;
        clampedY = dy * scale;
      }

      const normX = clampedX / JOYSTICK_MAX_RADIUS;
      // Screen Y grows downward; forward movement is negative screen Y
      const normY = -clampedY / JOYSTICK_MAX_RADIUS;
      inputManager?.setTouchMove(normX, normY);

      setJoystick({
        active: true,
        originX: joyOriginRef.current.x,
        originY: joyOriginRef.current.y,
        knobX: clampedX,
        knobY: clampedY,
      });
    },
    [inputManager]
  );

  const handleJoystickEnd = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (joyPointerIdRef.current !== e.pointerId) {
        return;
      }
      joyPointerIdRef.current = null;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      setJoystick({
        active: false,
        originX: 0,
        originY: 0,
        knobX: 0,
        knobY: 0,
      });
      inputManager?.setTouchMove(0, 0);
    },
    [inputManager]
  );

  const handleLookDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (lookPointerIdRef.current !== null) {
      return;
    }
    if (e.pointerType === 'mouse' && e.button !== 0) {
      return;
    }
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    lookPointerIdRef.current = e.pointerId;
    lastLookPosRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleLookMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (lookPointerIdRef.current !== e.pointerId) {
        return;
      }
      e.preventDefault();
      const dx = e.clientX - lastLookPosRef.current.x;
      const dy = e.clientY - lastLookPosRef.current.y;
      lastLookPosRef.current = { x: e.clientX, y: e.clientY };
      inputManager?.addLookDelta(dx, dy);
    },
    [inputManager]
  );

  const handleLookEnd = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (lookPointerIdRef.current !== e.pointerId) {
      return;
    }
    lookPointerIdRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }, []);

  const handleJumpPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      e.preventDefault();
      inputManager?.triggerJump();
    },
    [inputManager]
  );

  const handleSprintPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      e.preventDefault();
      onToggleSprint();
    },
    [onToggleSprint]
  );

  return (
    <div className="fixed inset-0 z-10 pointer-events-none select-none">
      {/* Left half: Virtual movement joystick zone */}
      <div
        className="absolute left-0 bottom-0 top-16 w-1/2 pointer-events-auto touch-none"
        onPointerDown={handleJoystickDown}
        onPointerMove={handleJoystickMove}
        onPointerUp={handleJoystickEnd}
        onPointerCancel={handleJoystickEnd}
        aria-label="Movement joystick area"
      >
        {/* Resting visual guide in bottom-left thumb zone */}
        {!joystick.active && (
          <div className="absolute left-6 bottom-6 pb-safe pl-safe pointer-events-none">
            <div className="w-28 h-28 rounded-full border border-[#E6EFE8]/25 bg-[#0B1A13]/40 backdrop-blur-[3px] flex items-center justify-center shadow-lg shadow-black/25">
              <div className="w-11 h-11 rounded-full bg-[#E6EFE8]/80 border border-[#C8A96A]/40 shadow-md" />
            </div>
          </div>
        )}

        {/* Active dynamic joystick positioned directly under user's thumb */}
        {joystick.active && (
          <div
            className="absolute pointer-events-none -translate-x-1/2 -translate-y-1/2"
            style={{
              left: `${joystick.originX}px`,
              top: `${joystick.originY}px`,
            }}
          >
            <div className="w-28 h-28 rounded-full border border-[#C8A96A]/50 bg-[#0B1A13]/55 backdrop-blur-sm flex items-center justify-center shadow-xl shadow-black/35">
              <div
                className="w-11 h-11 rounded-full bg-[#E6EFE8] border-2 border-[#C8A96A] shadow-md transition-transform duration-75 ease-out"
                style={{
                  transform: `translate(${joystick.knobX}px, ${joystick.knobY}px)`,
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Right half: Camera look drag zone */}
      <div
        className="absolute right-0 bottom-0 top-16 w-1/2 pointer-events-auto touch-none"
        onPointerDown={handleLookDown}
        onPointerMove={handleLookMove}
        onPointerUp={handleLookEnd}
        onPointerCancel={handleLookEnd}
        aria-label="Camera rotation area"
      />

      {/* Right thumb action buttons */}
      <div className="absolute right-6 bottom-6 pb-safe pr-safe flex items-end gap-3.5 pointer-events-auto">
        <button
          type="button"
          onPointerDown={handleSprintPointerDown}
          aria-pressed={isSprinting}
          aria-label={isSprinting ? 'Switch to walk' : 'Switch to run'}
          className={`min-w-[56px] min-h-[56px] px-3.5 rounded-2xl border backdrop-blur-md flex flex-col items-center justify-center gap-0.5 transition-transform active:scale-95 touch-none ${
            isSprinting
              ? 'bg-[#C8A96A] text-[#0B1A13] border-[#E5CFA0] shadow-lg shadow-black/35'
              : 'bg-[#0B1A13]/70 text-[#E6EFE8] border-[#E6EFE8]/20 shadow-lg shadow-black/30'
          }`}
        >
          <Footprints className="w-5 h-5" />
          <span className="text-[11px] font-semibold tracking-tight leading-none whitespace-nowrap">
            {isSprinting ? 'Run' : 'Walk'}
          </span>
        </button>

        <button
          type="button"
          onPointerDown={handleJumpPointerDown}
          aria-label="Jump"
          className="min-w-[68px] min-h-[68px] px-4 rounded-2xl bg-[#163626]/85 hover:bg-[#1D4631] text-[#EDF3EE] border border-[#E6EFE8]/25 backdrop-blur-md flex flex-col items-center justify-center gap-0.5 shadow-xl shadow-black/35 active:scale-95 transition-transform touch-none"
        >
          <ArrowUp className="w-6 h-6 text-[#C8A96A]" />
          <span className="text-xs font-semibold tracking-tight leading-none whitespace-nowrap">
            Jump
          </span>
        </button>
      </div>
    </div>
  );
}
