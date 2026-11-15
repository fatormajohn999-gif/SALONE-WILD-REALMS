import { useCallback, useRef, useState } from 'react';
import { GameHUD } from './components/GameHUD';
import { GameViewport } from './components/GameViewport';
import { TitleOverlay } from './components/TitleOverlay';
import { TouchControls } from './components/TouchControls';
import type { GameController } from './game/GameController';
import type { GraphicsQuality } from './game/types';

function detectInitialMobileQuality(): GraphicsQuality {
  if (typeof window === 'undefined') {
    return 'medium';
  }
  const dpr = window.devicePixelRatio || 1;
  const cores = navigator.hardwareConcurrency || 4;
  if (cores <= 4 && dpr >= 2.5) {
    return 'low';
  }
  return 'medium';
}

export default function App() {
  const controllerRef = useRef<GameController | null>(null);
  const [inputManager, setInputManager] = useState<GameController['inputManager'] | null>(
    null
  );
  const [isSceneReady, setIsSceneReady] = useState(false);
  const [hasEnteredWorld, setHasEnteredWorld] = useState(false);
  const [isWebGLContextLost, setIsWebGLContextLost] = useState(false);
  const [quality, setQuality] = useState<GraphicsQuality>(detectInitialMobileQuality);
  const [isSprinting, setIsSprinting] = useState(false);

  const handleControllerReady = useCallback((controller: GameController | null) => {
    controllerRef.current = controller;
    setInputManager(controller ? controller.inputManager : null);
  }, []);

  const handleSceneReady = useCallback(() => {
    setIsSceneReady(true);
  }, []);

  const handleWebGLContextChange = useCallback((lost: boolean) => {
    setIsWebGLContextLost(lost);
  }, []);

  const handleToggleSprint = useCallback(() => {
    setIsSprinting((prev) => {
      const next = !prev;
      controllerRef.current?.inputManager.setTouchSprint(next);
      return next;
    });
  }, []);

  const handleRecenterCamera = useCallback(() => {
    controllerRef.current?.recenterCamera();
  }, []);

  const handleResetPosition = useCallback(() => {
    controllerRef.current?.resetExplorerPosition();
  }, []);

  return (
    <main className="relative w-full h-full overflow-hidden bg-[#0B1A13]">
      <GameViewport
        quality={quality}
        onControllerReady={handleControllerReady}
        onSceneReady={handleSceneReady}
        onWebGLContextChange={handleWebGLContextChange}
      />

      {hasEnteredWorld && !isWebGLContextLost && (
        <>
          <GameHUD
            quality={quality}
            onChangeQuality={setQuality}
            onRecenterCamera={handleRecenterCamera}
            onResetPosition={handleResetPosition}
          />
          <TouchControls
            inputManager={inputManager}
            isSprinting={isSprinting}
            onToggleSprint={handleToggleSprint}
          />
        </>
      )}

      {!hasEnteredWorld && (
        <TitleOverlay
          isSceneReady={isSceneReady}
          onEnterWorld={() => setHasEnteredWorld(true)}
        />
      )}

      {isWebGLContextLost && (
        <div className="fixed inset-0 z-40 bg-[#0B1A13]/92 flex items-center justify-center p-6 text-center">
          <div className="max-w-sm bg-[#10241A] border border-[#E6EFE8]/15 rounded-2xl p-6 shadow-xl">
            <h2 className="font-display text-lg font-semibold text-[#EDF3EE]">
              Graphics Context Paused
            </h2>
            <p className="mt-2 text-xs text-[#A7C1B0] leading-relaxed">
              Your device temporarily paused 3D rendering. Restoring graphics automatically
              or tap below to reload the scene.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 w-full min-h-[44px] rounded-xl bg-[#C8A96A] text-[#0B1A13] text-xs font-semibold"
            >
              Reload Scene
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
