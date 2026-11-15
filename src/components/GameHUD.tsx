import { Compass, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import { useState } from 'react';
import type { GraphicsQuality } from '../game/types';

interface GameHUDProps {
  quality: GraphicsQuality;
  onChangeQuality: (quality: GraphicsQuality) => void;
  onRecenterCamera: () => void;
  onResetPosition: () => void;
}

const QUALITY_OPTIONS: {
  id: GraphicsQuality;
  label: string;
  detail: string;
}[] = [
  {
    id: 'low',
    label: 'Low',
    detail: 'Best battery & smooth FPS on entry-level Android phones (shadows off).',
  },
  {
    id: 'medium',
    label: 'Medium',
    detail: 'Balanced resolution and soft shadows for most Android devices.',
  },
  {
    id: 'high',
    label: 'High',
    detail: 'Higher render clarity and sharper sunlight shadows.',
  },
];

export function GameHUD({
  quality,
  onChangeQuality,
  onRecenterCamera,
  onResetPosition,
}: GameHUDProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <>
      {/* Compact top bar obeying mobile HUD restraint */}
      <header className="fixed top-0 left-0 right-0 z-20 pt-safe px-4 py-2.5 flex items-center justify-between gap-4 pointer-events-none">
        <div className="pointer-events-auto flex items-baseline gap-2.5 bg-[#0B1A13]/65 backdrop-blur-md border border-[#E6EFE8]/12 rounded-xl px-3.5 py-2 shadow-md shadow-black/20">
          <span className="font-display text-sm sm:text-base font-semibold tracking-tight text-[#EDF3EE] whitespace-nowrap">
            SALONE: WILD REALMS
          </span>
          <span className="hidden sm:inline text-xs text-[#A7C1B0]" aria-hidden="true">
            ·
          </span>
          <span className="hidden sm:inline text-xs text-[#A7C1B0] whitespace-nowrap">
            Foundation Clearing
          </span>
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onRecenterCamera}
            aria-label="Recenter camera behind explorer"
            title="Recenter camera"
            className="min-w-[44px] min-h-[44px] px-3 rounded-xl bg-[#0B1A13]/70 hover:bg-[#132A1F] text-[#EDF3EE] border border-[#E6EFE8]/15 backdrop-blur-md flex items-center justify-center gap-2 transition-colors active:scale-95"
          >
            <Compass className="w-4 h-4 text-[#C8A96A]" />
            <span className="hidden md:inline text-xs font-medium whitespace-nowrap">
              Recenter
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Open graphics and controls settings"
            title="Settings"
            className="min-w-[44px] min-h-[44px] px-3 rounded-xl bg-[#0B1A13]/70 hover:bg-[#132A1F] text-[#EDF3EE] border border-[#E6EFE8]/15 backdrop-blur-md flex items-center justify-center gap-2 transition-colors active:scale-95"
          >
            <SlidersHorizontal className="w-4 h-4 text-[#A7C1B0]" />
            <span className="hidden md:inline text-xs font-medium whitespace-nowrap">
              Settings
            </span>
          </button>
        </div>
      </header>

      {/* Settings Drawer / Modal */}
      {settingsOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/55 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-title"
          onClick={() => setSettingsOpen(false)}
        >
          <div
            className="w-full sm:max-w-md bg-[#0F2218] text-[#EDF3EE] border-t sm:border border-[#E6EFE8]/15 rounded-t-3xl sm:rounded-2xl p-5 pb-safe shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4 mb-5">
              <h2 id="settings-title" className="font-display text-lg font-semibold">
                Settings
              </h2>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                aria-label="Close settings"
                className="min-w-[44px] min-h-[44px] rounded-xl bg-[#163022] hover:bg-[#1D3E2C] flex items-center justify-center text-[#A7C1B0] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-5">
              {/* Graphics Quality Selector */}
              <div>
                <p className="text-sm font-medium text-[#EDF3EE] mb-2">
                  Android Graphics Quality
                </p>
                <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#09150F] rounded-xl border border-[#E6EFE8]/10">
                  {QUALITY_OPTIONS.map((opt) => {
                    const selected = quality === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onChangeQuality(opt.id)}
                        className={`min-h-[40px] rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                          selected
                            ? 'bg-[#C8A96A] text-[#0B1A13]'
                            : 'text-[#A7C1B0] hover:text-[#EDF3EE]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-xs text-[#A7C1B0] leading-relaxed">
                  {QUALITY_OPTIONS.find((o) => o.id === quality)?.detail}
                </p>
              </div>

              {/* Controls Summary */}
              <div className="pt-4 border-t border-[#E6EFE8]/10">
                <p className="text-sm font-medium text-[#EDF3EE] mb-2">
                  Controls
                </p>
                <div className="space-y-1.5 text-xs text-[#A7C1B0]">
                  <p>Touch Left: Virtual joystick to walk and steer</p>
                  <p>Touch Right: Drag to rotate third-person camera</p>
                  <p>Walk / Run & Jump: Right-hand thumb buttons</p>
                  <p>Keyboard: WASD or Arrows, Shift to run, Space to jump</p>
                </div>
              </div>

              {/* Explorer Reset Action */}
              <div className="pt-4 border-t border-[#E6EFE8]/10 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    onResetPosition();
                    setSettingsOpen(false);
                  }}
                  className="w-full min-h-[46px] px-4 rounded-xl bg-[#163022] hover:bg-[#1E402E] border border-[#E6EFE8]/15 text-sm font-medium text-[#EDF3EE] flex items-center justify-center gap-2 transition-colors"
                >
                  <RotateCcw className="w-4 h-4 text-[#C8A96A]" />
                  <span>Reset Explorer to Center</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
