import React from 'react';
import { Car, Search } from 'lucide-react';
import { CaReelsLogo } from './CaReelsLogo';

export const CarsLookupView: React.FC = () => {
  return (
    <div className="flex h-full w-full flex-col bg-[#08080B] text-white">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-white/10 bg-[#0D0D12]/90 px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-3.5 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <CaReelsLogo size={34} />
          <div>
            <h1
              className="text-lg font-bold leading-tight"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Avtomobil Axtarışı
            </h1>
            <p className="text-xs text-zinc-400">Dövlət qeydiyyat nişanı üzrə</p>
          </div>
        </div>
      </header>

      {/* Center Content */}
      <div className="relative flex flex-1 items-center justify-center px-6 pb-20">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute h-72 w-72 rounded-full bg-[#A8001E]/20 blur-[120px]"
        />

        <div className="relative z-10 w-full max-w-md rounded-3xl border border-white/10 bg-[#101016]/90 p-7 text-center shadow-[0_24px_70px_rgba(0,0,0,0.65)] backdrop-blur-xl space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl border border-[#A8001E]/45 bg-[#A8001E]/20 text-[#E04F67] shadow-[0_8px_24px_rgba(168,0,30,0.3)]">
            <Car className="h-8 w-8" />
          </div>

          <h2
            className="text-xl font-extrabold tracking-tight text-white sm:text-2xl"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Tezliklə nömrə ilə avtomobilinizi tapın
          </h2>

          <p className="text-xs leading-relaxed text-zinc-400 sm:text-sm">
            Avtomobil nömrəsini daxil edərək paylaşılan videoları və məlumatları birbaşa görmək funksiyası hazırlanır.
          </p>

          <div className="mx-auto flex max-w-xs items-center gap-2.5 rounded-2xl border border-white/10 bg-black/50 px-3.5 py-2.5 text-left text-xs text-zinc-500">
            <Search className="h-4 w-4 shrink-0 text-[#E04F67]" />
            <span>Məs: 99-AA-999</span>
          </div>
        </div>
      </div>
    </div>
  );
};
