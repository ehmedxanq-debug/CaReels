import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
} from 'firebase/auth';
import {
  Disc3,
  ExternalLink,
  Film,
  Music2,
  ShieldCheck,
  UserCheck,
  Volume2,
} from 'lucide-react';
import { auth, googleProvider } from '../firebase';
import { CaReelsLogo } from './CaReelsLogo';

interface LoginScreenProps {
  onSuccess?: () => void;
  onGuestContinue?: () => void;
}

function isInIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

function isInAppWebView(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /Telegram|FBAN|FBAV|Instagram|Line\/|MicroMessenger|Twitter|TikTok/i.test(ua);
}

function formatFirebaseAuthError(err: unknown): {
  text: string;
  needsExternalBrowser?: boolean;
} {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code || '')
      : '';
  const message = err instanceof Error ? err.message : String(err || '');
  const combined = `${code} ${message}`.toLowerCase();

  if (combined.includes('unauthorized-domain')) {
    const host = typeof window !== 'undefined' ? window.location.hostname : '';
    return {
      text: `Bu domen (${host}) Firebase icazəli domenlər (Authorized domains) siyahısında deyil. Firebase Console → Authentication → Settings → Authorized domains bölməsinə əlavə edin.`,
    };
  }
  if (combined.includes('popup-blocked')) {
    return {
      text: 'Brauzer giriş pəncərəsini (Pop-up) blokladı. Pop-up icazəsi verib yenidən toxunun.',
      needsExternalBrowser: isInIframe() || isInAppWebView(),
    };
  }
  if (combined.includes('popup-closed-by-user') || combined.includes('cancelled-popup-request')) {
    return {
      text: isInIframe() || isInAppWebView()
        ? 'Bu pəncərədə Google girişi yarımçıq qaldı. Aşağıdakı düymə ilə Safari/Chrome-da tam ekranda açıb daxil olun.'
        : 'Google hesab seçimi tamamlanmadı. Yenidən toxunub hesabınızı seçin.',
      needsExternalBrowser: isInIframe() || isInAppWebView(),
    };
  }
  if (combined.includes('operation-not-supported') || combined.includes('web-storage-unsupported')) {
    return {
      text: 'Gizli rejim (Private Browsing) və ya cookie məhdudiyyəti girişə mane olur. Normal brauzer rejimində açın.',
      needsExternalBrowser: true,
    };
  }
  if (combined.includes('network-request-failed')) {
    return {
      text: 'İnternet bağlantısı xətası. Bağlantınızı yoxlayıb yenidən cəhd edin.',
    };
  }
  return {
    text: `Daxil olmaq mümkün olmadı (${code || 'xəta'}). Yenidən cəhd edin.`,
    needsExternalBrowser: isInIframe() || isInAppWebView(),
  };
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onSuccess,
  onGuestContinue,
}) => {
  const [loading, setLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsExternalBrowser, setNeedsExternalBrowser] = useState(false);

  const popupInFlightRef = useRef(false);
  const recoveryTimerRef = useRef<number | null>(null);
  const safetyTimerRef = useRef<number | null>(null);

  const clearAuthTimers = useCallback(() => {
    popupInFlightRef.current = false;
    if (recoveryTimerRef.current !== null) {
      window.clearTimeout(recoveryTimerRef.current);
      recoveryTimerRef.current = null;
    }
    if (safetyTimerRef.current !== null) {
      window.clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => clearAuthTimers();
  }, [clearAuthTimers]);

  // Unlock immediately if Firebase auth succeeds while Safari/Chrome popup promise stalled due to COOP
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        clearAuthTimers();
        setLoading(false);
        onSuccess?.();
      }
    });
    return () => unsub();
  }, [clearAuthTimers, onSuccess]);

  // Recover cleanly if user returns from Google account picker on Safari/Chrome and the popup promise hung
  useEffect(() => {
    const handleReturnFromPopup = () => {
      if (!popupInFlightRef.current) return;
      if (document.visibilityState === 'hidden') return;

      if (recoveryTimerRef.current !== null) {
        window.clearTimeout(recoveryTimerRef.current);
      }
      recoveryTimerRef.current = window.setTimeout(() => {
        if (!popupInFlightRef.current) return;
        if (auth.currentUser) {
          clearAuthTimers();
          setLoading(false);
          onSuccess?.();
          return;
        }
        clearAuthTimers();
        setLoading(false);
        setError('Google hesab seçimi cavab vermədi. Yenidən toxunub cəhd edin.');
      }, 2800);
    };

    const handlePageShow = () => {
      if (!auth.currentUser) {
        clearAuthTimers();
        setLoading(false);
      }
    };

    window.addEventListener('focus', handleReturnFromPopup);
    window.addEventListener('pageshow', handlePageShow);
    document.addEventListener('visibilitychange', handleReturnFromPopup);
    return () => {
      window.removeEventListener('focus', handleReturnFromPopup);
      window.removeEventListener('pageshow', handlePageShow);
      document.removeEventListener('visibilitychange', handleReturnFromPopup);
    };
  }, [clearAuthTimers, onSuccess]);

  const handleGuestSignIn = async () => {
    if (loading || guestLoading) return;
    setGuestLoading(true);
    setError(null);
    clearAuthTimers();

    try {
      await Promise.race([
        signInAnonymously(auth),
        new Promise<void>((resolve) => window.setTimeout(resolve, 2500)),
      ]);
    } catch {
      // Anonymous auth disabled or unavailable -> continue cleanly in local guest mode
    } finally {
      setGuestLoading(false);
      onGuestContinue?.();
    }
  };

  const handleGoogleSignIn = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    setNeedsExternalBrowser(false);

    popupInFlightRef.current = true;
    safetyTimerRef.current = window.setTimeout(() => {
      if (!popupInFlightRef.current) return;
      clearAuthTimers();
      if (!auth.currentUser) {
        setLoading(false);
        setError('Giriş pəncərəsi çox uzun çəkdi. Yenidən cəhd edin.');
      }
    }, 20000);

    try {
      await signInWithPopup(auth, googleProvider);
      clearAuthTimers();
      onSuccess?.();
      setLoading(false);
    } catch (err: unknown) {
      clearAuthTimers();
      const formatted = formatFirebaseAuthError(err);
      setError(formatted.text);
      setNeedsExternalBrowser(Boolean(formatted.needsExternalBrowser));
      setLoading(false);
    }
  };

  return (
    <div className="relative h-[100dvh] w-full overflow-y-auto overflow-x-hidden bg-[#08080B] text-white flex flex-col justify-between">
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
              disabled={loading || guestLoading}
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

            <button
              type="button"
              onClick={handleGuestSignIn}
              disabled={loading || guestLoading}
              className="mt-3 flex min-h-[48px] w-full items-center justify-center gap-2.5 rounded-2xl border border-white/15 bg-white/[0.06] px-6 py-3 text-sm font-semibold text-zinc-100 hover:bg-white/[0.12] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 transition-all cursor-pointer"
            >
              <UserCheck className="h-4 w-4 shrink-0 text-[#E04F67]" />
              <span>{guestLoading ? 'Qonaq kimi açılır...' : 'Qonaq kimi daxil ol'}</span>
            </button>

            {loading && (
              <div className="mt-2.5 flex items-center justify-between text-xs text-zinc-400">
                <span>Google hesab pəncərəsi açılır...</span>
                <button
                  type="button"
                  onClick={() => {
                    clearAuthTimers();
                    setLoading(false);
                    setError(null);
                  }}
                  className="font-semibold text-[#E04F67] hover:underline cursor-pointer"
                >
                  Ləğv et
                </button>
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="mt-3 space-y-2.5 rounded-xl border border-[#A8001E]/40 bg-[#A8001E]/10 px-4 py-3 text-xs font-medium text-rose-200"
              >
                <p>{error}</p>
                {needsExternalBrowser && typeof window !== 'undefined' && (
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={window.location.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-[38px] items-center gap-2 rounded-xl bg-[#A8001E] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#C8102E] transition-colors"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      <span>Brauzerdə birbaşa aç</span>
                    </a>
                  </div>
                )}
              </div>
            )}

            <div className="mt-4 flex items-center gap-2 text-xs text-zinc-400">
              <ShieldCheck className="h-4 w-4 shrink-0 text-zinc-500" />
              <span>
                Bir dəfə daxil olduqdan sonra hesabınız yadda saxlanılır.
              </span>
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
