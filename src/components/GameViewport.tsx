import { useEffect, useRef } from 'react';
import { GameController } from '../game/GameController';
import type { CharacterMovementState, GraphicsQuality } from '../game/types';

interface GameViewportProps {
  quality: GraphicsQuality;
  onControllerReady: (controller: GameController | null) => void;
  onSceneReady: () => void;
  onWebGLContextChange: (lost: boolean) => void;
  onMovementStateChange?: (state: CharacterMovementState) => void;
}

export function GameViewport({
  quality,
  onControllerReady,
  onSceneReady,
  onWebGLContextChange,
  onMovementStateChange,
}: GameViewportProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const controllerRef = useRef<GameController | null>(null);
  const initialQualityRef = useRef<GraphicsQuality>(quality);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const controller = new GameController(canvas, initialQualityRef.current, {
      onReady: onSceneReady,
      onWebGLContextChange,
      onMovementStateChange,
    });

    controllerRef.current = controller;
    onControllerReady(controller);

    return () => {
      controller.dispose();
      controllerRef.current = null;
      onControllerReady(null);
    };
  }, [onControllerReady, onMovementStateChange, onSceneReady, onWebGLContextChange]);

  useEffect(() => {
    controllerRef.current?.setGraphicsQuality(quality);
  }, [quality]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full block touch-none outline-none"
      aria-label="SALONE: WILD REALMS 3D Game Viewport"
    />
  );
}
