import { Engine } from '@babylonjs/core/Engines/engine';
import type { GraphicsQuality } from '../types';

export interface EngineHandle {
  engine: Engine;
  applyQuality: (quality: GraphicsQuality) => void;
  dispose: () => void;
}

function getHardwareScalingForQuality(quality: GraphicsQuality): number {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

  switch (quality) {
    case 'low':
      // Render slightly below native CSS resolution to protect battery and frame rate on budget Android GPUs.
      return 1.25;
    case 'medium':
      // Cap effective pixel ratio at 1.35x for crisp mobile visuals without 3x GPU fill-rate overload.
      return 1 / Math.min(dpr, 1.35);
    case 'high':
      // Cap effective pixel ratio at 2.0x.
      return 1 / Math.min(dpr, 2);
  }
}

export function createBabylonEngine(
  canvas: HTMLCanvasElement,
  initialQuality: GraphicsQuality,
  onContextChange?: (lost: boolean) => void
): EngineHandle {
  const engine = new Engine(
    canvas,
    initialQuality !== 'low',
    {
      preserveDrawingBuffer: false,
      stencil: false,
      antialias: initialQuality !== 'low',
      powerPreference: 'high-performance',
      failIfMajorPerformanceCaveat: false,
    },
    false
  );

  const applyQuality = (quality: GraphicsQuality): void => {
    engine.setHardwareScalingLevel(getHardwareScalingForQuality(quality));
    engine.resize();
  };

  applyQuality(initialQuality);

  const handleResize = (): void => {
    engine.resize();
  };

  let orientationTimer: number | null = null;
  const handleOrientationChange = (): void => {
    engine.resize();
    if (orientationTimer !== null) {
      window.clearTimeout(orientationTimer);
    }
    // Mobile WebViews often update layout dimensions a frame after orientationchange fires.
    orientationTimer = window.setTimeout(() => {
      engine.resize();
    }, 150);
  };

  const handleContextLost = (event: Event): void => {
    event.preventDefault();
    onContextChange?.(true);
  };

  const handleContextRestored = (): void => {
    onContextChange?.(false);
    engine.resize();
  };

  canvas.addEventListener('webglcontextlost', handleContextLost, false);
  canvas.addEventListener('webglcontextrestored', handleContextRestored, false);
  window.addEventListener('resize', handleResize);
  window.addEventListener('orientationchange', handleOrientationChange);

  let resizeObserver: ResizeObserver | null = null;
  if (typeof ResizeObserver !== 'undefined' && canvas.parentElement) {
    resizeObserver = new ResizeObserver(() => {
      engine.resize();
    });
    resizeObserver.observe(canvas.parentElement);
  }

  const dispose = (): void => {
    if (orientationTimer !== null) {
      window.clearTimeout(orientationTimer);
    }
    resizeObserver?.disconnect();
    window.removeEventListener('resize', handleResize);
    window.removeEventListener('orientationchange', handleOrientationChange);
    canvas.removeEventListener('webglcontextlost', handleContextLost);
    canvas.removeEventListener('webglcontextrestored', handleContextRestored);
    engine.dispose();
  };

  return {
    engine,
    applyQuality,
    dispose,
  };
}
