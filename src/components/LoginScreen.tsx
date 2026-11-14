import React, { useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { Disc3, Film, Music2, ShieldCheck, Volume2 } from 'lucide-react';
import { auth, googleProvider } from '../firebase';
import { CaReelsLogo } from './CaReelsLogo';

interface LoginScreenProps {
  onSuccess?: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
      onSuccess?.();
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : 'Google hesabı ilə daxil olarkən xəta baş verdi.';
      if (message.includes('popup-closed-by-user')) {
        setError('Giriş pəncərəsi bağlandı. Yenidən cəhd edin.');
      } else if (message.includes('popup-blocked')) {
        setError('Brauzer açılan pəncərəni blokladı. İcazə verib yenidən yoxlayın.');
      } else {
        setError('Daxil olmaq mümkün olmadı. Zəhmət olmasa yenidən cəhd edin.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#08080B] text-white flex flex-col justify-between">
      {/* Ambient crimson cinema glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full bg-[#A8001E]/20 blur-[140px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-48 -right-32 h-[540px] w-[540px] rounded-full bg-[#D90429]/20 blur-[150px]"
      />

      {/* Minimal Top Brand Bar */}
      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <CaReelsLogo size={38} />
          <span
            className="text-xl font-extrabold tracking-tight text-white"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            CaReels
          </span>
        </div>
        <span className="text-xs font-medium text-zinc-400">
          AZ · TR Qısa Video Platforması
        </span>
      </header>

      {/* Main Split Content */}
      <main className="relative z-10 mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 items-center gap-12 px-6 py-8 lg:grid-cols-12 lg:py-12">
        {/* Left Column: Editorial Headline + Google Sign-In */}
        <div className="flex flex-col items-start lg:col-span-7">
          <p className="mb-4 text-sm font-semibold tracking-wide text-[#A8001E]">
            Musiqi · Avtomobil · Ritm
          </p>
          <h1
            className="max-w-xl text-4xl font-extrabold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-6xl"
            style={{ fontFamily: 'var(--font-display)', textWrap: 'balance' }}
          >
            Hər saniyəsi canlı, səsli qısa videolar.
          </h1>
          <p className="mt-5 max-w-lg text-base leading-relaxed text-zinc-300 sm:text-lg">
            Avtomatik səsli oxutma, AZ və TR kateqoriya filtrləri, canlı şərh və cavablaşma ilə CaReels dünyasına qoşul.
          </p>

          {/* Feature Highlights (Clean Unboxed Grid) */}
          <div className="mt-8 grid w-full max-w-lg grid-cols-1 gap-4 border-t border-white/10 pt-6 sm:grid-cols-3">
            <div className="flex items-start gap-2.5">
              <Volume2 className="mt-0.5 h-4 w-4 shrink-0 text-[#A8001E]" />
              <div>
                <div className="text-sm font-semibold text-white">Səsli axın</div>
                <div className="text-xs text-zinc-400">Avtomatik açılış</div>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Music2 className="mt-0.5 h-4 w-4 shrink-0 text-[#A8001E]" />
              <div>
                <div className="text-sm font-semibold text-white">Musiqi və Maşın</div>
                <div className="text-xs text-zinc-400">AZ · TR filtrləri</div>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Film className="mt-0.5 h-4 w-4 shrink-0 text-[#A8001E]" />
              <div>
                <div className="text-sm font-semibold text-white">Canlı əlaqə</div>
                <div className="text-xs text-zinc-400">Bəyəni, rəy, paylaşım</div>
              </div>
            </div>
          </div>

          {/* Primary Google Sign-In CTA */}
          <div className="mt-9 w-full max-w-sm">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="group relative flex min-h-[52px] w-full items-center justify-center gap-3 rounded-2xl bg-[#A8001E] px-6 py-3.5 text-base font-semibold text-white shadow-[0_12px_36px_rgba(255,32,78,0.38)] transition-all duration-200 hover:bg-[#C8102E] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
            >
              <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#FFFFFF"
                  d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81Z"
                />
              </svg>
              <span>{loading ? 'Hesaba daxil olunur...' : 'Google hesabı ilə daxil ol'}</span>
            </button>

            {error && (
              <p
                role="alert"
                className="mt-3 rounded-xl border border-[#A8001E]/40 bg-[#A8001E]/10 px-4 py-2.5 text-xs font-medium text-rose-200"
              >
                {error}
              </p>
            )}

            <div className="mt-4 flex items-center gap-2 text-xs text-zinc-400">
              <ShieldCheck className="h-4 w-4 shrink-0 text-zinc-500" />
              <span>Google hesabınızı seçdikdən sonra istifadəçi adınızı təyin edəcəksiniz.</span>
            </div>
          </div>
        </div>

        {/* Right Column: Kinetic Vertical Reel Stage Preview */}
        <div className="hidden lg:flex lg:col-span-5 lg:justify-center">
          <div className="relative h-[540px] w-[304px] rounded-[36px] border border-white/15 bg-gradient-to-b from-[#17121A] via-[#100D13] to-[#09080C] p-4 shadow-[0_28px_80px_rgba(0,0,0,0.75)] flex flex-col justify-between overflow-hidden">
            {/* Inner crimson ambient spotlight */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(255,32,78,0.28),transparent_65%)]"
            />

            {/* Top minimal mock chrome */}
            <div className="relative z-10 flex items-center justify-between text-xs text-zinc-400">
              <span>Ayarlar</span>
              <span>Axtarış</span>
            </div>

            {/* Center kinetic logo centerpiece */}
            <div className="relative z-10 flex flex-col items-center justify-center text-center">
              <div className="relative flex h-28 w-28 items-center justify-center">
                <div className="absolute inset-0 rounded-full border border-[#A8001E]/40 animate-ping [animation-duration:3s]" />
                <div className="absolute inset-2 rounded-full border border-white/15" />
                <CaReelsLogo size={68} />
              </div>
              <p
                className="mt-5 text-lg font-bold tracking-tight text-white"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                CaReels
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                Real vaxt video axınına hazır
              </p>
            </div>

            {/* Bottom-left & Bottom-right TikTok structure silhouette */}
            <div className="relative z-10 flex items-end justify-between gap-3">
              <div className="space-y-1.5 text-left">
                <div className="text-sm font-bold text-white">CaReels</div>
                <div className="text-xs text-zinc-300">Video alt yazısı burada görünür</div>
                <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
                  <Music2 className="h-3 w-3 text-[#A8001E]" />
                  <span>Musiqi adı</span>
                </div>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/20 bg-zinc-900 animate-spin-slow">
                <Disc3 className="h-5 w-5 text-[#A8001E]" />
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="relative z-10 mx-auto w-full max-w-6xl px-6 py-4 text-xs text-zinc-500">
        CaReels · Bütün videolar real vaxtda yayımlanır
      </footer>
    </div>
  );
};
