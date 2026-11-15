import { Compass } from 'lucide-react';

interface TitleOverlayProps {
  isSceneReady: boolean;
  onEnterWorld: () => void;
}

export function TitleOverlay({ isSceneReady, onEnterWorld }: TitleOverlayProps) {
  return (
    <div className="fixed inset-0 z-30 bg-[#08140E]/72 backdrop-blur-[3px] flex flex-col items-center justify-center px-6 py-8 text-center">
      <div className="w-full max-w-md bg-[#0E2017]/90 border border-[#E6EFE8]/15 rounded-3xl p-7 sm:p-8 shadow-2xl shadow-black/50">
        <div className="w-12 h-12 rounded-2xl bg-[#183827] border border-[#C8A96A]/35 flex items-center justify-center mx-auto mb-5">
          <Compass className="w-6 h-6 text-[#C8A96A]" />
        </div>

        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#EDF3EE] text-balance">
          SALONE: WILD REALMS
        </h1>

        <p className="mt-2 text-sm sm:text-base text-[#C8A96A] font-medium">
          Explore Together.
        </p>

        <p className="mt-4 text-xs sm:text-sm text-[#A7C1B0] leading-relaxed">
          Emerald Forest · Follow the winding laterite trail past the Great Old
          Tree, cross Kambui Stream, and climb the rocky ridge.
        </p>

        <button
          type="button"
          disabled={!isSceneReady}
          onClick={onEnterWorld}
          className="mt-7 w-full min-h-[50px] px-6 rounded-xl bg-[#C8A96A] hover:bg-[#D5B97E] disabled:opacity-60 text-[#0B1A13] font-semibold text-sm tracking-wide transition-colors active:scale-[0.98]"
        >
          {isSceneReady ? 'Enter Emerald Forest' : 'Preparing Forest...'}
        </button>
      </div>
    </div>
  );
}
