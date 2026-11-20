export const ADMOB_REWARDED_DOWNLOAD_UNIT_ID = 'ca-app-pub-6119289488320767/1719416867';
export const ADMOB_INTERSTITIAL_FEED_UNIT_ID = 'ca-app-pub-6119289488320767/5191758019';

export interface AdMobConfig {
  rewardedDownloadUnitId: string;
  interstitialFeedUnitId: string;
}

export interface RewardedAdResult {
  rewarded: boolean;
  shown: boolean;
}

interface CapacitorAdMobPlugin {
  initialize?: (options?: Record<string, unknown>) => Promise<void>;
  prepareRewardVideoAd?: (options: { adId: string; isTesting?: boolean }) => Promise<unknown>;
  showRewardVideoAd?: () => Promise<unknown>;
  prepareInterstitial?: (options: { adId: string; isTesting?: boolean }) => Promise<unknown>;
  showInterstitial?: () => Promise<unknown>;
  addListener?: (
    eventName: string,
    listenerFunc: (info: unknown) => void
  ) => Promise<{ remove: () => Promise<void> }>;
}

interface CordovaAdMobInstance {
  load?: () => Promise<void>;
  show?: () => Promise<void>;
  on?: (event: string, cb: (...args: unknown[]) => void) => void;
  once?: (event: string, cb: (...args: unknown[]) => void) => void;
}

interface CordovaAdMobNamespace {
  RewardedAd?: new (opts: { adUnitId: string }) => CordovaAdMobInstance;
  InterstitialAd?: new (opts: { adUnitId: string }) => CordovaAdMobInstance;
  start?: () => Promise<void>;
}

interface AndroidAdMobBridge {
  preloadRewardedAd?: (adUnitId: string) => void;
  loadRewardedAd?: (adUnitId: string) => void;
  showRewardedAd?: (adUnitId: string) => unknown;
  showRewardedVideo?: (adUnitId: string) => unknown;
  loadAndShowRewarded?: (adUnitId: string) => unknown;
  preloadInterstitialAd?: (adUnitId: string) => void;
  loadInterstitialAd?: (adUnitId: string) => void;
  showInterstitialAd?: (adUnitId: string) => unknown;
  showInterstitial?: (adUnitId: string) => unknown;
  loadAndShowInterstitial?: (adUnitId: string) => unknown;
}

interface WebKitMessageHandler {
  postMessage: (message: unknown) => void;
}

interface CaReelsAdWindow extends Window {
  CaReelsAdMobConfig?: AdMobConfig;
  Capacitor?: {
    Plugins?: {
      AdMob?: CapacitorAdMobPlugin;
    };
  };
  admob?: CordovaAdMobNamespace;
  AndroidAdMob?: AndroidAdMobBridge;
  AdMobBridge?: AndroidAdMobBridge;
  Android?: AndroidAdMobBridge;
  webkit?: {
    messageHandlers?: {
      AdMob?: WebKitMessageHandler;
      CaReelsAdMob?: WebKitMessageHandler;
    };
  };
  onCaReelsRewardedAdResult?: (earned: boolean) => void;
  __onCaReelsRewardedComplete?: (earned: boolean) => void;
  onAdMobRewardedResult?: (earned: boolean) => void;
  onCaReelsInterstitialClosed?: () => void;
  __onCaReelsInterstitialClosed?: () => void;
  onAdMobInterstitialClosed?: () => void;
}

function getAdWindow(): CaReelsAdWindow | null {
  if (typeof window === 'undefined') return null;
  return window as CaReelsAdWindow;
}

const w = getAdWindow();
if (w) {
  w.CaReelsAdMobConfig = {
    rewardedDownloadUnitId: ADMOB_REWARDED_DOWNLOAD_UNIT_ID,
    interstitialFeedUnitId: ADMOB_INTERSTITIAL_FEED_UNIT_ID,
  };
}

let capacitorInitialized = false;
let rewardedPreloadInFlight = false;
let interstitialPreloadInFlight = false;

function getCapacitorAdMob(): CapacitorAdMobPlugin | null {
  return getAdWindow()?.Capacitor?.Plugins?.AdMob || null;
}

function getCordovaAdMob(): CordovaAdMobNamespace | null {
  return getAdWindow()?.admob || null;
}

function getAndroidBridge(): AndroidAdMobBridge | null {
  const win = getAdWindow();
  if (!win) return null;
  return win.AndroidAdMob || win.AdMobBridge || win.Android || null;
}

function getIOSHandler(): WebKitMessageHandler | null {
  const handlers = getAdWindow()?.webkit?.messageHandlers;
  if (!handlers) return null;
  return handlers.CaReelsAdMob || handlers.AdMob || null;
}

export function hasNativeAdMobBridge(): boolean {
  const androidBridge = getAndroidBridge();
  const hasAndroidMethod = Boolean(
    androidBridge &&
      (androidBridge.showRewardedAd ||
        androidBridge.showRewardedVideo ||
        androidBridge.loadAndShowRewarded ||
        androidBridge.showInterstitialAd ||
        androidBridge.showInterstitial ||
        androidBridge.loadAndShowInterstitial)
  );
  return Boolean(
    getCapacitorAdMob() || getCordovaAdMob() || hasAndroidMethod || getIOSHandler()
  );
}

async function ensureCapacitorInitialized(plugin: CapacitorAdMobPlugin): Promise<void> {
  if (capacitorInitialized) return;
  capacitorInitialized = true;
  if (typeof plugin.initialize === 'function') {
    try {
      await plugin.initialize({});
    } catch {
      // ignore if already initialized natively
    }
  }
}

export async function preloadRewardedDownloadAd(): Promise<void> {
  if (rewardedPreloadInFlight) return;
  rewardedPreloadInFlight = true;
  try {
    const cap = getCapacitorAdMob();
    if (cap?.prepareRewardVideoAd) {
      await ensureCapacitorInitialized(cap);
      await cap.prepareRewardVideoAd({ adId: ADMOB_REWARDED_DOWNLOAD_UNIT_ID });
      return;
    }

    const android = getAndroidBridge();
    if (android) {
      if (typeof android.preloadRewardedAd === 'function') {
        android.preloadRewardedAd(ADMOB_REWARDED_DOWNLOAD_UNIT_ID);
      } else if (typeof android.loadRewardedAd === 'function') {
        android.loadRewardedAd(ADMOB_REWARDED_DOWNLOAD_UNIT_ID);
      }
      return;
    }

    const ios = getIOSHandler();
    if (ios) {
      ios.postMessage({
        action: 'preloadRewarded',
        adUnitId: ADMOB_REWARDED_DOWNLOAD_UNIT_ID,
      });
    }
  } catch {
    // Non-fatal preload failure
  } finally {
    rewardedPreloadInFlight = false;
  }
}

export async function preloadFeedInterstitialAd(): Promise<void> {
  if (interstitialPreloadInFlight) return;
  interstitialPreloadInFlight = true;
  try {
    const cap = getCapacitorAdMob();
    if (cap?.prepareInterstitial) {
      await ensureCapacitorInitialized(cap);
      await cap.prepareInterstitial({ adId: ADMOB_INTERSTITIAL_FEED_UNIT_ID });
      return;
    }

    const android = getAndroidBridge();
    if (android) {
      if (typeof android.preloadInterstitialAd === 'function') {
        android.preloadInterstitialAd(ADMOB_INTERSTITIAL_FEED_UNIT_ID);
      } else if (typeof android.loadInterstitialAd === 'function') {
        android.loadInterstitialAd(ADMOB_INTERSTITIAL_FEED_UNIT_ID);
      }
      return;
    }

    const ios = getIOSHandler();
    if (ios) {
      ios.postMessage({
        action: 'preloadInterstitial',
        adUnitId: ADMOB_INTERSTITIAL_FEED_UNIT_ID,
      });
    }
  } catch {
    // Non-fatal preload failure
  } finally {
    interstitialPreloadInFlight = false;
  }
}

function waitForNativeRewardedCallback(triggerShow: () => void): Promise<RewardedAdResult> {
  const win = getAdWindow();
  if (!win) return Promise.resolve({ rewarded: true, shown: false });

  return new Promise<RewardedAdResult>((resolve) => {
    let settled = false;
    const prevOnCaReels = win.onCaReelsRewardedAdResult;
    const prevInternal = win.__onCaReelsRewardedComplete;
    const prevLegacy = win.onAdMobRewardedResult;

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener('careels:admob:rewarded', onCustomEvent as EventListener);
      win.onCaReelsRewardedAdResult = prevOnCaReels;
      win.__onCaReelsRewardedComplete = prevInternal;
      win.onAdMobRewardedResult = prevLegacy;
    };

    const finish = (earned: boolean, shown: boolean) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ rewarded: earned, shown });
    };

    const handleResult = (earned: unknown) => {
      finish(Boolean(earned), true);
    };

    const onCustomEvent = (evt: CustomEvent<{ earned?: boolean }>) => {
      finish(Boolean(evt?.detail?.earned), true);
    };

    win.onCaReelsRewardedAdResult = handleResult;
    win.__onCaReelsRewardedComplete = handleResult;
    win.onAdMobRewardedResult = handleResult;
    window.addEventListener('careels:admob:rewarded', onCustomEvent as EventListener);

    const timeoutId = window.setTimeout(() => {
      finish(false, false);
    }, 45000);

    try {
      triggerShow();
    } catch {
      finish(false, false);
    }
  });
}

function waitForNativeInterstitialClose(triggerShow: () => void): Promise<{ shown: boolean }> {
  const win = getAdWindow();
  if (!win) return Promise.resolve({ shown: false });

  return new Promise<{ shown: boolean }>((resolve) => {
    let settled = false;
    const prevOnCaReels = win.onCaReelsInterstitialClosed;
    const prevInternal = win.__onCaReelsInterstitialClosed;
    const prevLegacy = win.onAdMobInterstitialClosed;

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener(
        'careels:admob:interstitial-closed',
        onCustomEvent as EventListener
      );
      win.onCaReelsInterstitialClosed = prevOnCaReels;
      win.__onCaReelsInterstitialClosed = prevInternal;
      win.onAdMobInterstitialClosed = prevLegacy;
    };

    const finish = (shown: boolean) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ shown });
    };

    const onCustomEvent = () => finish(true);

    win.onCaReelsInterstitialClosed = () => finish(true);
    win.__onCaReelsInterstitialClosed = () => finish(true);
    win.onAdMobInterstitialClosed = () => finish(true);
    window.addEventListener('careels:admob:interstitial-closed', onCustomEvent as EventListener);

    const timeoutId = window.setTimeout(() => {
      finish(true);
    }, 30000);

    try {
      triggerShow();
    } catch {
      finish(false);
    }
  });
}

export async function showRewardedDownloadAd(): Promise<RewardedAdResult> {
  // 1. Capacitor AdMob Plugin
  const cap = getCapacitorAdMob();
  if (cap?.prepareRewardVideoAd && cap?.showRewardVideoAd) {
    try {
      await ensureCapacitorInitialized(cap);
      await cap.prepareRewardVideoAd({ adId: ADMOB_REWARDED_DOWNLOAD_UNIT_ID });
      let earned = false;
      const handles: Array<{ remove: () => Promise<void> }> = [];

      const showOutcome = await new Promise<boolean>((resolve) => {
        let done = false;
        const finish = (ok: boolean) => {
          if (done) return;
          done = true;
          window.clearTimeout(timerId);
          resolve(ok);
        };

        const timerId = window.setTimeout(() => finish(earned), 45000);

        if (typeof cap.addListener === 'function') {
          cap
            .addListener('onRewardedVideoAdReward', () => {
              earned = true;
            })
            .then((h) => handles.push(h))
            .catch(() => {});
          cap
            .addListener('onRewardedVideoAdDismissed', () => finish(earned))
            .then((h) => handles.push(h))
            .catch(() => {});
          cap
            .addListener('onRewardedVideoAdFailedToShow', () => finish(false))
            .then((h) => handles.push(h))
            .catch(() => {});
          cap
            .addListener('onRewardedVideoAdFailedToLoad', () => finish(false))
            .then((h) => handles.push(h))
            .catch(() => {});
        }

        cap
          .showRewardVideoAd!()
          .then((res) => {
            if (res && typeof res === 'object' && 'amount' in (res as Record<string, unknown>)) {
              earned = true;
              finish(true);
            } else if (typeof cap.addListener !== 'function') {
              finish(true);
            }
          })
          .catch(() => finish(false));
      });

      await Promise.all(handles.map((h) => h.remove().catch(() => {})));
      return { rewarded: showOutcome, shown: true };
    } catch {
      return { rewarded: false, shown: false };
    }
  }

  // 2. Cordova AdMob Plus
  const cordovaAdMob = getCordovaAdMob();
  if (cordovaAdMob?.RewardedAd) {
    try {
      await cordovaAdMob.start?.();
      const rewardedAd = new cordovaAdMob.RewardedAd({
        adUnitId: ADMOB_REWARDED_DOWNLOAD_UNIT_ID,
      });
      let earned = false;
      rewardedAd.on?.('reward', () => {
        earned = true;
      });
      await rewardedAd.load?.();
      await rewardedAd.show?.();
      return { rewarded: earned, shown: true };
    } catch {
      return { rewarded: false, shown: false };
    }
  }

  // 3. Android WebView JavascriptInterface Bridge
  const android = getAndroidBridge();
  const showAndroidRewarded =
    android?.showRewardedAd || android?.showRewardedVideo || android?.loadAndShowRewarded;
  if (android && typeof showAndroidRewarded === 'function') {
    return waitForNativeRewardedCallback(() => {
      showAndroidRewarded.call(android, ADMOB_REWARDED_DOWNLOAD_UNIT_ID);
    });
  }

  // 4. iOS WKWebView MessageHandler
  const ios = getIOSHandler();
  if (ios) {
    return waitForNativeRewardedCallback(() => {
      ios.postMessage({
        action: 'showRewarded',
        adUnitId: ADMOB_REWARDED_DOWNLOAD_UNIT_ID,
      });
    });
  }

  // Pure web browser fallback (no native AdMob container present)
  return { rewarded: true, shown: false };
}

export async function showFeedInterstitialAd(): Promise<{ shown: boolean }> {
  // 1. Capacitor AdMob Plugin
  const cap = getCapacitorAdMob();
  if (cap?.prepareInterstitial && cap?.showInterstitial) {
    try {
      await ensureCapacitorInitialized(cap);
      await cap.prepareInterstitial({ adId: ADMOB_INTERSTITIAL_FEED_UNIT_ID });
      const handles: Array<{ remove: () => Promise<void> }> = [];

      await new Promise<void>((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          window.clearTimeout(timerId);
          resolve();
        };

        const timerId = window.setTimeout(finish, 30000);

        if (typeof cap.addListener === 'function') {
          cap
            .addListener('onInterstitialAdDismissed', finish)
            .then((h) => handles.push(h))
            .catch(() => {});
          cap
            .addListener('onInterstitialAdFailedToShow', finish)
            .then((h) => handles.push(h))
            .catch(() => {});
          cap
            .addListener('onInterstitialAdFailedToLoad', finish)
            .then((h) => handles.push(h))
            .catch(() => {});
        }

        cap
          .showInterstitial!()
          .then(() => {
            if (typeof cap.addListener !== 'function') {
              finish();
            }
          })
          .catch(finish);
      });

      await Promise.all(handles.map((h) => h.remove().catch(() => {})));
      return { shown: true };
    } catch {
      return { shown: false };
    }
  }

  // 2. Cordova AdMob Plus
  const cordovaAdMob = getCordovaAdMob();
  if (cordovaAdMob?.InterstitialAd) {
    try {
      await cordovaAdMob.start?.();
      const interstitial = new cordovaAdMob.InterstitialAd({
        adUnitId: ADMOB_INTERSTITIAL_FEED_UNIT_ID,
      });
      await interstitial.load?.();
      await interstitial.show?.();
      return { shown: true };
    } catch {
      return { shown: false };
    }
  }

  // 3. Android WebView JavascriptInterface Bridge
  const android = getAndroidBridge();
  const showAndroidInterstitial =
    android?.showInterstitialAd ||
    android?.showInterstitial ||
    android?.loadAndShowInterstitial;
  if (android && typeof showAndroidInterstitial === 'function') {
    return waitForNativeInterstitialClose(() => {
      showAndroidInterstitial.call(android, ADMOB_INTERSTITIAL_FEED_UNIT_ID);
    });
  }

  // 4. iOS WKWebView MessageHandler
  const ios = getIOSHandler();
  if (ios) {
    return waitForNativeInterstitialClose(() => {
      ios.postMessage({
        action: 'showInterstitial',
        adUnitId: ADMOB_INTERSTITIAL_FEED_UNIT_ID,
      });
    });
  }

  // Pure web browser fallback
  return { shown: false };
}
