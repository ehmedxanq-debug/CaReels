import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Heart,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Music2,
  Pause,
  Play,
  RefreshCw,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { PostItem } from '../types';
import { CaReelsLogo } from './CaReelsLogo';
import { UserAvatar } from './UserAvatar';

interface VideoCardProps {
  post: PostItem;
  isActive: boolean;
  isLiked: boolean;
  isMuted: boolean;
  preloadMode?: 'auto' | 'metadata' | 'none';
  shouldMountMedia?: boolean;
  shouldLoop?: boolean;
  onActiveReady?: () => void;
  onVideoEnded?: () => void;
  onBlessVideos?: () => void;
  onUnlockAudio: () => void;
  onToggleMute: () => void;
  onToggleLike: (post: PostItem) => void;
  onOpenComments: (post: PostItem) => void;
  onOpenShareMenu: (post: PostItem) => void;
  onOpenCreatorProfile?: (post: PostItem) => void;
  onWatched: (post: PostItem) => void;
}

function getYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) {
      return u.pathname.replace('/', '').split('/')[0] || null;
    }
    if (u.hostname.includes('youtube.com')) {
      if (u.pathname.startsWith('/shorts/')) {
        return u.pathname.split('/shorts/')[1]?.split('/')[0] || null;
      }
      if (u.pathname.startsWith('/embed/')) {
        return u.pathname.split('/embed/')[1]?.split('/')[0] || null;
      }
      return u.searchParams.get('v');
    }
  } catch {
    return null;
  }
  return null;
}

function getGoogleDrivePreviewUrl(url: string): string | null {
  const match = url.match(/drive\.google\.com\/file\/d\/([^/]+)/i);
  if (match && match[1]) {
    return `https://drive.google.com/file/d/${match[1]}/preview`;
  }
  return null;
}

function unlockTabAudioContext() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(0);
    osc.stop(0.01);
    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 100);
  } catch {
    // ignore AudioContext restriction
  }
}

interface VideoMediaLayerProps {
  postId: string;
  caption: string;
  videoUrl: string;
  activeVideoSrc: string;
  posterUrl?: string;
  youtubeId: string | null;
  drivePreviewUrl: string | null;
  isActive: boolean;
  effectiveMuted: boolean;
  preloadMode: 'auto' | 'metadata' | 'none';
  shouldMountMedia: boolean;
  streamKey: string;
  videoError: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onTapVideo: () => void;
  onLoadedMetadata: () => void;
  onLoadedData: () => void;
  onCanPlay: () => void;
  onWaiting: () => void;
  onPlaying: () => void;
  onTimeUpdate: () => void;
  onPlay: () => void;
  onPause: () => void;
  onError: () => void;
  onRetry: (e: React.MouseEvent) => void;
}

const VideoMediaLayer: React.FC<VideoMediaLayerProps> = React.memo(({
  postId,
  caption,
  videoUrl,
  activeVideoSrc,
  posterUrl,
  youtubeId,
  drivePreviewUrl,
  isActive,
  effectiveMuted,
  preloadMode,
  shouldMountMedia,
  streamKey,
  videoError,
  videoRef,
  onTapVideo,
  onLoadedMetadata,
  onLoadedData,
  onCanPlay,
  onWaiting,
  onPlaying,
  onTimeUpdate,
  onPlay,
  onPause,
  onError,
  onRetry,
}) => {
  if (!shouldMountMedia) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#08080B]">
        {posterUrl ? (
          <img
            src={posterUrl}
            alt={caption || 'CaReels'}
            className="h-full w-full object-cover opacity-80"
            loading="lazy"
          />
        ) : (
          <CaReelsLogo size={44} className="opacity-40" />
        )}
      </div>
    );
  }

  if (youtubeId) {
    return isActive ? (
      <iframe
        key={`${postId}-yt-${effectiveMuted ? 'm' : 'u'}`}
        src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1&mute=${effectiveMuted ? 1 : 0}&loop=1&playlist=${youtubeId}&playsinline=1&rel=0&modestbranding=1`}
        title={caption || 'CaReels Video'}
        allow="autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
        className="h-full w-full border-0"
      />
    ) : (
      <div className="flex h-full w-full items-center justify-center bg-[#0C0C10]">
        <CaReelsLogo size={48} className="opacity-60" />
      </div>
    );
  }

  if (drivePreviewUrl) {
    return isActive ? (
      <iframe
        src={drivePreviewUrl}
        title={caption || 'CaReels Video'}
        allow="autoplay"
        className="h-full w-full border-0"
      />
    ) : (
      <div className="flex h-full w-full items-center justify-center bg-[#0C0C10]">
        <CaReelsLogo size={48} className="opacity-60" />
      </div>
    );
  }

  if (activeVideoSrc && !videoError) {
    return (
      <video
        key={streamKey}
        ref={videoRef}
        data-careels-video="true"
        data-active={isActive ? 'true' : 'false'}
        src={activeVideoSrc}
        poster={posterUrl || undefined}
        muted={effectiveMuted}
        loop
        playsInline
        autoPlay={isActive}
        preload={preloadMode}
        onClick={onTapVideo}
        onLoadedMetadata={onLoadedMetadata}
        onLoadedData={onLoadedData}
        onCanPlay={onCanPlay}
        onWaiting={onWaiting}
        onPlaying={onPlaying}
        onTimeUpdate={onTimeUpdate}
        onPlay={onPlay}
        onPause={onPause}
        onError={onError}
        className="h-full w-full object-cover touch-pan-y cursor-pointer"
      />
    );
  }

  return (
    <div
      onClick={onTapVideo}
      className="flex h-full w-full flex-col items-center justify-center bg-[#0C0C10] px-6 text-center text-zinc-400"
    >
      <CaReelsLogo size={48} className="opacity-75" />
      <p className="mt-3 text-sm font-medium text-zinc-300">
        {videoUrl ? 'Video yüklənərkən xəta baş verdi' : 'Video linki tapılmadı'}
      </p>
      {videoUrl && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 inline-flex min-h-[42px] items-center gap-2 rounded-full bg-[#A8001E] px-5 text-xs font-semibold text-white hover:bg-[#C8102E] transition-colors cursor-pointer"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Yenidən yüklə</span>
        </button>
      )}
    </div>
  );
});

export const VideoCard: React.FC<VideoCardProps> = React.memo(({
  post,
  isActive,
  isLiked,
  isMuted,
  preloadMode = 'auto',
  shouldMountMedia = true,
  onActiveReady,
  onBlessVideos,
  onUnlockAudio,
  onToggleMute,
  onToggleLike,
  onOpenComments,
  onOpenShareMenu,
  onOpenCreatorProfile,
  onWatched,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [useProxyFallback, setUseProxyFallback] = useState(() =>
    Boolean(post.videoUrl && post.videoUrl.includes('catbox.moe'))
  );
  const [videoError, setVideoError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [showCenterFlash, setShowCenterFlash] = useState<'play' | 'pause' | null>(null);
  const lastTapRef = useRef<number>(0);
  const singleTapTimerRef = useRef<number | null>(null);
  const watchedLoggedRef = useRef<string | null>(null);
  const userPausedRef = useRef<boolean>(false);
  const autoplayMutedFallbackRef = useRef<boolean>(false);
  const triedAlternativeStreamRef = useRef<boolean>(false);
  const postRef = useRef(post);
  postRef.current = post;
  const activeReadyFiredRef = useRef<boolean>(false);
  const onActiveReadyRef = useRef(onActiveReady);
  onActiveReadyRef.current = onActiveReady;
  const onToggleLikeRef = useRef(onToggleLike);
  onToggleLikeRef.current = onToggleLike;
  const onUnlockAudioRef = useRef(onUnlockAudio);
  onUnlockAudioRef.current = onUnlockAudio;
  const isLikedRef = useRef(isLiked);
  isLikedRef.current = isLiked;
  const audioBlockedRef = useRef(audioBlocked);
  audioBlockedRef.current = audioBlocked;
  const useProxyFallbackRef = useRef(useProxyFallback);
  useProxyFallbackRef.current = useProxyFallback;
  const isMutedRef = useRef(isMuted);
  isMutedRef.current = isMuted;
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;

  const notifyActiveReady = useCallback(() => {
    if (!isActiveRef.current || activeReadyFiredRef.current) return;
    activeReadyFiredRef.current = true;
    onActiveReadyRef.current?.();
  }, []);

  const youtubeId = useMemo(
    () => (post.videoUrl ? getYouTubeId(post.videoUrl) : null),
    [post.videoUrl]
  );
  const drivePreviewUrl = useMemo(
    () => (post.videoUrl && !youtubeId ? getGoogleDrivePreviewUrl(post.videoUrl) : null),
    [post.videoUrl, youtubeId]
  );
  const isEmbedVideo = Boolean(youtubeId || drivePreviewUrl);

  const activeVideoSrc = useMemo(() => {
    if (!post.videoUrl) return '';
    if (useProxyFallback && post.videoUrl.startsWith('http')) {
      return `/api/video-proxy?url=${encodeURIComponent(post.videoUrl)}`;
    }
    return post.videoUrl;
  }, [post.videoUrl, useProxyFallback]);

  const tryStartPlayback = useCallback(async (video: HTMLVideoElement) => {
    if (!isActiveRef.current) return;
    const targetMuted = isMutedRef.current || autoplayMutedFallbackRef.current;
    video.muted = targetMuted;
    if (!targetMuted) {
      video.volume = 1;
    }
    try {
      await video.play();
      if (!isActiveRef.current) {
        video.pause();
        return;
      }
      setIsPlaying(true);
      setIsBuffering(false);
      if (!targetMuted) {
        autoplayMutedFallbackRef.current = false;
        setAudioBlocked(false);
      }
    } catch (err) {
      if (!isActiveRef.current) return;
      const errName = err instanceof DOMException ? err.name : '';
      if (!targetMuted && errName === 'NotAllowedError') {
        autoplayMutedFallbackRef.current = true;
        video.muted = true;
        setAudioBlocked(true);
        try {
          await video.play();
          if (!isActiveRef.current) {
            video.pause();
            return;
          }
          setIsPlaying(true);
          setIsBuffering(false);
        } catch {
          setIsPlaying(false);
        }
      } else {
        setIsPlaying(false);
        if (video.readyState >= 2) {
          setTimeout(() => {
            if (isActiveRef.current && !userPausedRef.current && videoRef.current && videoRef.current.paused) {
              const v = videoRef.current;
              v.muted = isMutedRef.current || autoplayMutedFallbackRef.current;
              v.play()
                .then(() => {
                  setIsPlaying(true);
                  setIsBuffering(false);
                })
                .catch(() => {
                  if (!v.muted) {
                    autoplayMutedFallbackRef.current = true;
                    v.muted = true;
                    setAudioBlocked(true);
                    v.play().then(() => {
                      setIsPlaying(true);
                      setIsBuffering(false);
                    }).catch(() => {});
                  }
                });
            }
          }, 80);
        }
      }
    }
  }, []);

  useEffect(() => {
    if (isActive && watchedLoggedRef.current !== post.id) {
      watchedLoggedRef.current = post.id;
      onWatched(postRef.current);
    }
  }, [isActive, post.id, onWatched]);

  useEffect(() => {
    const preferProxy = Boolean(post.videoUrl && post.videoUrl.includes('catbox.moe'));
    setUseProxyFallback(preferProxy);
    triedAlternativeStreamRef.current = false;
    setVideoError(false);
    setAudioBlocked(false);
    autoplayMutedFallbackRef.current = false;
    activeReadyFiredRef.current = false;
    userPausedRef.current = false;
  }, [post.id, post.videoUrl]);

  // Switch direct external host to RAM-cached server proxy quickly if connection hangs with zero frames
  useEffect(() => {
    if (
      !isActive ||
      isEmbedVideo ||
      useProxyFallback ||
      videoError ||
      !shouldMountMedia ||
      !post.videoUrl.startsWith('http')
    ) {
      return;
    }
    const fastTimer = window.setTimeout(() => {
      const video = videoRef.current;
      if (
        isActiveRef.current &&
        video &&
        video.readyState === 0 &&
        video.buffered.length === 0 &&
        !video.error
      ) {
        triedAlternativeStreamRef.current = true;
        setUseProxyFallback(true);
      }
    }, 1800);
    const slowTimer = window.setTimeout(() => {
      const video = videoRef.current;
      if (
        isActiveRef.current &&
        video &&
        video.readyState < 2 &&
        video.buffered.length === 0 &&
        !video.error
      ) {
        triedAlternativeStreamRef.current = true;
        setUseProxyFallback(true);
      }
    }, 3600);
    return () => {
      window.clearTimeout(fastTimer);
      window.clearTimeout(slowTimer);
    };
  }, [isActive, isEmbedVideo, useProxyFallback, videoError, shouldMountMedia, post.videoUrl, reloadKey]);

  useLayoutEffect(() => {
    if (isEmbedVideo) {
      setIsPlaying(isActive);
      setIsBuffering(false);
      if (isActive) notifyActiveReady();
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    if (isActive) {
      activeReadyFiredRef.current = false;
      userPausedRef.current = false;
      setVideoError(false);
      if (video.readyState < 2) {
        setIsBuffering(true);
      } else {
        setIsBuffering(false);
        notifyActiveReady();
      }
      tryStartPlayback(video);
    } else {
      activeReadyFiredRef.current = false;
      userPausedRef.current = false;
      autoplayMutedFallbackRef.current = false;
      video.pause();
      setIsPlaying(false);
      setIsBuffering(false);
      if (video.readyState >= 2 && video.currentTime > 0.5) {
        try {
          video.currentTime = 0;
        } catch {
          // ignore seek error on unbuffered stream
        }
      }
    }
  }, [isActive, post.id, activeVideoSrc, reloadKey, isEmbedVideo, shouldMountMedia, notifyActiveReady, tryStartPlayback]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isMuted) {
      video.muted = true;
    } else if (!autoplayMutedFallbackRef.current) {
      video.muted = false;
      video.volume = 1;
      setAudioBlocked(false);
      if (isActive && !userPausedRef.current && video.paused) {
        video.play().then(() => setIsPlaying(true)).catch(() => {});
      }
    }
  }, [isMuted, isActive]);

  useEffect(() => {
    return () => {
      if (singleTapTimerRef.current !== null) {
        window.clearTimeout(singleTapTimerRef.current);
      }
    };
  }, []);

  const handleVideoTap = useCallback(() => {
    const now = Date.now();
    const isDoubleTap = now - lastTapRef.current < 260;
    lastTapRef.current = now;

    if (audioBlockedRef.current || autoplayMutedFallbackRef.current) {
      autoplayMutedFallbackRef.current = false;
      setAudioBlocked(false);
      if (videoRef.current) {
        videoRef.current.muted = false;
        videoRef.current.volume = 1;
      }
      onUnlockAudioRef.current();
    }

    if (isDoubleTap) {
      if (singleTapTimerRef.current !== null) {
        window.clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }
      userPausedRef.current = false;
      const video = videoRef.current;
      if (video && video.paused) {
        video.play().then(() => setIsPlaying(true)).catch(() => {});
      }
      if (!isLikedRef.current) {
        onToggleLikeRef.current(postRef.current);
      }
      return;
    }

    if (singleTapTimerRef.current !== null) {
      window.clearTimeout(singleTapTimerRef.current);
    }

    singleTapTimerRef.current = window.setTimeout(() => {
      singleTapTimerRef.current = null;
      const video = videoRef.current;
      if (!video) return;

      if (video.paused) {
        userPausedRef.current = false;
        video.play().then(() => setIsPlaying(true)).catch(() => {});
        setShowCenterFlash('play');
      } else {
        userPausedRef.current = true;
        video.pause();
        setIsPlaying(false);
        setShowCenterFlash('pause');
      }

      setTimeout(() => setShowCenterFlash(null), 500);
    }, 230);
  }, []);

  const handleRetryVideo = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    triedAlternativeStreamRef.current = false;
    setVideoError(false);
    setReloadKey((k) => k + 1);
  }, []);

  const handleSoundButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    unlockTabAudioContext();
    const shouldUnmute = audioBlocked || autoplayMutedFallbackRef.current || isMuted;
    if (shouldUnmute) {
      autoplayMutedFallbackRef.current = false;
      onBlessVideos?.();
    }
    if (audioBlocked) {
      onUnlockAudio();
      setAudioBlocked(false);
    } else {
      onToggleMute();
    }
    const video = videoRef.current;
    if (video && isActive) {
      video.muted = !shouldUnmute;
      if (shouldUnmute) {
        video.volume = 1;
      }
      if (!userPausedRef.current && video.paused) {
        video.play().then(() => setIsPlaying(true)).catch(() => {});
      }
    }
  };

  const handleMediaLoadedMetadata = useCallback(() => {
    if (isActiveRef.current && !userPausedRef.current && videoRef.current && videoRef.current.paused) {
      tryStartPlayback(videoRef.current);
    }
  }, [tryStartPlayback]);

  const handleMediaLoadedData = useCallback(() => {
    setIsBuffering(false);
    if (isActiveRef.current) {
      notifyActiveReady();
      if (!userPausedRef.current && videoRef.current && videoRef.current.paused) {
        tryStartPlayback(videoRef.current);
      }
    }
  }, [notifyActiveReady, tryStartPlayback]);

  const handleMediaCanPlay = useCallback(() => {
    setIsBuffering(false);
    if (isActiveRef.current) {
      notifyActiveReady();
      if (!userPausedRef.current && videoRef.current && videoRef.current.paused) {
        tryStartPlayback(videoRef.current);
      }
    }
  }, [notifyActiveReady, tryStartPlayback]);

  const handleMediaWaiting = useCallback(() => {
    if (isActiveRef.current) setIsBuffering(true);
  }, []);

  const handleMediaPlaying = useCallback(() => {
    setIsBuffering(false);
    setIsPlaying(true);
    if (isActiveRef.current) {
      notifyActiveReady();
    }
    // IMPORTANT: Never unmute inside async onPlaying if browser required muted autoplay fallback,
    // otherwise Chrome/Safari immediately pauses the playing video!
    if (!isMutedRef.current && !autoplayMutedFallbackRef.current && videoRef.current) {
      videoRef.current.muted = false;
      videoRef.current.volume = 1;
      setAudioBlocked(false);
    }
  }, [notifyActiveReady]);

  const handleMediaTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.duration) return;
    setProgress((video.currentTime / video.duration) * 100);
  }, []);

  const handleMediaPlay = useCallback(() => {
    setIsPlaying(true);
  }, []);

  const handleMediaPause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const handleMediaError = useCallback(() => {
    if (!triedAlternativeStreamRef.current && postRef.current.videoUrl.startsWith('http')) {
      triedAlternativeStreamRef.current = true;
      setUseProxyFallback((prev) => !prev);
    } else {
      setIsBuffering(false);
      setVideoError(true);
    }
  }, []);

  const effectiveMuted = isMuted || audioBlocked;
  const streamKey = `${post.id}-${useProxyFallback ? 'proxy' : 'direct'}-${reloadKey}`;

  return (
    <section className="relative h-full min-h-full w-full shrink-0 snap-start snap-always overflow-hidden bg-black select-none">
      {/* Isolated Memoized Video Player (never re-renders on Like or Comment updates) */}
      <VideoMediaLayer
        postId={post.id}
        caption={post.caption}
        videoUrl={post.videoUrl}
        activeVideoSrc={activeVideoSrc}
        posterUrl={post.posterUrl}
        youtubeId={youtubeId}
        drivePreviewUrl={drivePreviewUrl}
        isActive={isActive}
        effectiveMuted={effectiveMuted}
        preloadMode={preloadMode}
        shouldMountMedia={shouldMountMedia}
        streamKey={streamKey}
        videoError={videoError}
        videoRef={videoRef}
        onTapVideo={handleVideoTap}
        onLoadedMetadata={handleMediaLoadedMetadata}
        onLoadedData={handleMediaLoadedData}
        onCanPlay={handleMediaCanPlay}
        onWaiting={handleMediaWaiting}
        onPlaying={handleMediaPlaying}
        onTimeUpdate={handleMediaTimeUpdate}
        onPlay={handleMediaPlay}
        onPause={handleMediaPause}
        onError={handleMediaError}
        onRetry={handleRetryVideo}
      />

      {/* Subtle Bottom Scrim for High-Contrast Readability */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-black/90 via-black/45 to-transparent"
      />

      {/* Lightweight Buffering Indicator while mobile video opens */}
      {isActive && isBuffering && !isPlaying && !videoError && !isEmbedVideo && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm">
            <Loader2 className="h-6 w-6 animate-spin text-[#C8102E]" />
          </div>
        </div>
      )}

      {/* Center Play / Pause Flash Indicator */}
      {showCenterFlash && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-black/55 backdrop-blur-sm">
            {showCenterFlash === 'play' ? (
              <Play className="h-8 w-8 text-white fill-white ml-0.5" />
            ) : (
              <Pause className="h-8 w-8 text-white fill-white" />
            )}
          </div>
        </div>
      )}

      {/* RIGHT SIDE UNIFIED VERTICAL ACTION STACK + LIFTED VINYL DISC */}
      <div
        onPointerDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="absolute right-2.5 bottom-[calc(4.15rem+env(safe-area-inset-bottom))] z-20 flex flex-col items-center gap-2"
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenCreatorProfile?.(post);
          }}
          aria-label={`${post.accountName || 'Hesab'} profilinə bax`}
          className="rounded-full ring-2 ring-white/80 shadow-[0_6px_18px_rgba(0,0,0,0.6)] transition-transform active:scale-90 cursor-pointer overflow-hidden"
        >
          {(() => {
            const normalizedAccount = (post.accountName || '').replace(/^@+/, '').trim().toLowerCase();
            const normalizedUser = (post.username || '').replace(/^@+/, '').trim().toLowerCase();
            const isCaReelsPost =
              (!post.uid && (!normalizedUser || normalizedUser === 'careels')) ||
              normalizedAccount === 'careels' ||
              normalizedUser === 'careels';
            if (isCaReelsPost) {
              return <CaReelsLogo variant="flame" size={44} className="h-11 w-11 rounded-full" />;
            }
            return (
              <UserAvatar
                photoURL={post.authorPhotoURL}
                name={post.username || post.accountName || 'CR'}
                sizeClass="h-11 w-11"
                textClass="text-xs"
              />
            );
          })()}
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleLike(post);
            const video = videoRef.current;
            if (isActive && !userPausedRef.current && video && video.paused && video.readyState >= 2) {
              video.play().catch(() => {});
            }
          }}
          aria-label="Bəyən"
          className="flex w-11 flex-col items-center gap-0.5 bg-transparent py-0.5 text-white transition-transform active:scale-90 cursor-pointer"
        >
          <Heart
            className={`h-7 w-7 drop-shadow-[0_2px_8px_rgba(0,0,0,0.75)] transition-colors ${
              isLiked ? 'fill-[#B80021] text-[#B80021]' : 'text-white'
            }`}
          />
          <span className="font-mono text-[11px] font-bold leading-none tabular-nums drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
            {post.likesCount}
          </span>
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenComments(post);
          }}
          aria-label="Şərhlər"
          className="flex w-11 flex-col items-center gap-0.5 bg-transparent py-0.5 text-white transition-transform active:scale-90 cursor-pointer"
        >
          <MessageCircle className="h-7 w-7 drop-shadow-[0_2px_8px_rgba(0,0,0,0.75)]" />
          <span className="font-mono text-[11px] font-bold leading-none tabular-nums drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
            {post.commentsCount}
          </span>
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenShareMenu(post);
          }}
          aria-label="Paylaş və ya endir"
          className="flex h-9 w-11 items-center justify-center bg-transparent text-white transition-transform active:scale-90 cursor-pointer"
        >
          <MoreHorizontal className="h-6 w-6 drop-shadow-[0_2px_8px_rgba(0,0,0,0.75)]" />
        </button>

        {/* Sound Button right above the Music Vinyl Disc (starts muted on first entry) */}
        <button
          type="button"
          onClick={handleSoundButtonClick}
          aria-label={effectiveMuted ? 'Səsi aç' : 'Səsi bağla'}
          className={`flex h-9 w-11 items-center justify-center rounded-full transition-transform active:scale-90 cursor-pointer ${
            effectiveMuted
              ? 'bg-black/45 text-white ring-1 ring-[#C8102E]/70 backdrop-blur-sm'
              : 'bg-transparent text-white/95 hover:text-white'
          }`}
        >
          {effectiveMuted ? (
            <VolumeX className="h-5 w-5 text-[#E04F67] drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)]" />
          ) : (
            <Volume2 className="h-5 w-5 drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)]" />
          )}
        </button>

        <div
          className={`relative flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-tr from-[#3B000B] via-zinc-900 to-[#5C0010] p-1.5 shadow-[0_0_18px_rgba(0,0,0,0.85)] ring-2 ring-[#A8001E]/70 ${
            isPlaying ? 'animate-spin-slow' : 'animate-spin-paused'
          }`}
          title={post.musicName || 'CaReels Audio'}
        >
          <div className="absolute inset-1 rounded-full border border-white/10" />
          <CaReelsLogo size={20} className="relative z-10 rounded-full" />
        </div>
      </div>

      {/* BOTTOM-LEFT: Clickable Creator Name, Caption (Alt yazı), and Music Name */}
      <div className="pointer-events-none absolute left-3.5 right-[70px] bottom-[calc(4.15rem+env(safe-area-inset-bottom))] z-20 flex flex-col gap-1 text-left">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenCreatorProfile?.(post);
          }}
          className="pointer-events-auto self-start text-base font-extrabold tracking-tight text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)] hover:underline cursor-pointer"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {post.accountName || 'CaReels'}
        </button>

        {post.caption && (
          <p className="line-clamp-2 text-sm leading-snug text-zinc-100 drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)]">
            {post.caption}
          </p>
        )}

        <div className="mt-0.5 flex items-center gap-2 text-xs font-medium text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)]">
          <Music2 className="h-3.5 w-3.5 shrink-0 text-[#C8102E]" />
          <span className="truncate">
            {post.musicName || 'Orijinal səs · CaReels'}
          </span>
        </div>
      </div>

      {/* Video Playback Progress Bar */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[2px] bg-white/15">
        <div
          className="h-full bg-[#A8001E] transition-[width] duration-150"
          style={{ width: `${progress}%` }}
        />
      </div>
    </section>
  );
});
