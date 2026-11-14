import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Heart,
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

interface VideoCardProps {
  post: PostItem;
  isActive: boolean;
  isLiked: boolean;
  isMuted: boolean;
  shouldLoop?: boolean;
  onVideoEnded?: () => void;
  onUnlockAudio: () => void;
  onToggleMute: () => void;
  onToggleLike: (post: PostItem) => void;
  onOpenComments: (post: PostItem) => void;
  onOpenShareMenu: (post: PostItem) => void;
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

export const VideoCard: React.FC<VideoCardProps> = ({
  post,
  isActive,
  isLiked,
  isMuted,
  shouldLoop = false,
  onVideoEnded,
  onUnlockAudio,
  onToggleMute,
  onToggleLike,
  onOpenComments,
  onOpenShareMenu,
  onWatched,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [useProxyFallback, setUseProxyFallback] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [showCenterFlash, setShowCenterFlash] = useState<'play' | 'pause' | null>(null);
  const lastTapRef = useRef<number>(0);
  const watchedLoggedRef = useRef<string | null>(null);
  const isMutedRef = useRef(isMuted);
  isMutedRef.current = isMuted;

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

  const tryStartPlayback = async (video: HTMLVideoElement) => {
    video.muted = isMutedRef.current;
    try {
      await video.play();
      setIsPlaying(true);
      setAudioBlocked(false);
    } catch {
      video.muted = true;
      setAudioBlocked(true);
      try {
        await video.play();
        setIsPlaying(true);
      } catch {
        setIsPlaying(false);
      }
    }
  };

  useEffect(() => {
    if (isActive && watchedLoggedRef.current !== post.id) {
      watchedLoggedRef.current = post.id;
      onWatched(post);
    }
  }, [isActive, post, onWatched]);

  useEffect(() => {
    setUseProxyFallback(false);
    setVideoError(false);
  }, [post.id, post.videoUrl]);

  useEffect(() => {
    if (isEmbedVideo) {
      setIsPlaying(isActive);
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    if (isActive) {
      setVideoError(false);
      if (video.readyState >= 1) {
        try {
          video.currentTime = 0;
        } catch {
          // ignore seek error on unbuffered stream
        }
      }
      tryStartPlayback(video);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }, [isActive, post.id, activeVideoSrc, reloadKey, isEmbedVideo]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = isMuted;
    if (!isMuted) {
      setAudioBlocked(false);
      if (isActive && video.paused) {
        video.play().then(() => setIsPlaying(true)).catch(() => {});
      }
    }
  }, [isMuted, isActive]);

  const handleVideoTap = () => {
    const now = Date.now();
    const isDoubleTap = now - lastTapRef.current < 260;
    lastTapRef.current = now;

    if (audioBlocked || isMuted) {
      onUnlockAudio();
    }

    if (isDoubleTap) {
      if (!isLiked) {
        onToggleLike(post);
      }
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play().then(() => setIsPlaying(true)).catch(() => {});
      setShowCenterFlash('play');
    } else {
      video.pause();
      setIsPlaying(false);
      setShowCenterFlash('pause');
    }

    setTimeout(() => setShowCenterFlash(null), 500);
  };

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video || !video.duration) return;
    setProgress((video.currentTime / video.duration) * 100);
  };

  const handleRetryVideo = (e: React.MouseEvent) => {
    e.stopPropagation();
    setVideoError(false);
    setReloadKey((k) => k + 1);
  };

  return (
    <section className="relative h-full w-full snap-start snap-always overflow-hidden bg-black select-none">
      {/* Video Player (Supports Catbox, Direct Video, Firebase Storage, YouTube Shorts/Embed, Google Drive) */}
      {youtubeId ? (
        isActive ? (
          <iframe
            key={`${post.id}-yt-${isMuted ? 'm' : 'u'}`}
            src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1&mute=${isMuted ? 1 : 0}&loop=1&playlist=${youtubeId}&playsinline=1&rel=0&modestbranding=1`}
            title={post.caption || 'CaReels Video'}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            className="h-full w-full border-0"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[#0C0C10]">
            <CaReelsLogo size={48} className="opacity-60" />
          </div>
        )
      ) : drivePreviewUrl ? (
        isActive ? (
          <iframe
            src={drivePreviewUrl}
            title={post.caption || 'CaReels Video'}
            allow="autoplay"
            className="h-full w-full border-0"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[#0C0C10]">
            <CaReelsLogo size={48} className="opacity-60" />
          </div>
        )
      ) : activeVideoSrc && !videoError ? (
        <video
          key={`${post.id}-${useProxyFallback ? 'proxy' : 'direct'}-${reloadKey}`}
          ref={videoRef}
          src={activeVideoSrc}
          poster={post.posterUrl || undefined}
          loop
          playsInline
          autoPlay={isActive}
          preload="auto"
          onClick={handleVideoTap}
          onLoadedData={() => {
            if (isActive && videoRef.current && videoRef.current.paused) {
              tryStartPlayback(videoRef.current);
            }
          }}
          onCanPlay={() => {
            if (isActive && videoRef.current && videoRef.current.paused) {
              tryStartPlayback(videoRef.current);
            }
          }}
          onTimeUpdate={handleTimeUpdate}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onError={() => {
            if (!useProxyFallback && post.videoUrl.startsWith('http')) {
              setUseProxyFallback(true);
            } else {
              setVideoError(true);
            }
          }}
          className="h-full w-full object-cover cursor-pointer"
        />
      ) : (
        <div
          onClick={handleVideoTap}
          className="flex h-full w-full flex-col items-center justify-center bg-[#0C0C10] px-6 text-center text-zinc-400"
        >
          <CaReelsLogo size={48} className="opacity-75" />
          <p className="mt-3 text-sm font-medium text-zinc-300">
            {post.videoUrl ? 'Video yüklənərkən xəta baş verdi' : 'Video linki tapılmadı'}
          </p>
          {post.videoUrl && (
            <button
              type="button"
              onClick={handleRetryVideo}
              className="mt-4 inline-flex min-h-[42px] items-center gap-2 rounded-full bg-[#A8001E] px-5 text-xs font-semibold text-white hover:bg-[#C8102E] transition-colors cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Yenidən yüklə</span>
            </button>
          )}
        </div>
      )}

      {/* Subtle Bottom Scrim for High-Contrast Readability */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-black/90 via-black/45 to-transparent"
      />

      {/* Audio Blocked Unmute Helper */}
      {(audioBlocked || isMuted) && isActive && !videoError && !drivePreviewUrl && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onUnlockAudio();
          }}
          className="absolute top-16 left-1/2 -translate-x-1/2 z-20 flex min-h-[40px] items-center gap-2 rounded-full bg-black/60 px-4 py-2 text-xs font-semibold text-white backdrop-blur-md border border-white/15 hover:bg-black/80 transition-colors cursor-pointer"
        >
          <VolumeX className="h-4 w-4 text-[#C8102E]" />
          <span>Səsi aç</span>
        </button>
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

      {/* RIGHT SIDE UNIFIED VERTICAL ACTION STACK + VINYL DISC (lowered with equal spacing for mobile) */}
      <div className="absolute right-2.5 bottom-14 z-20 flex flex-col items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#A8001E] ring-2 ring-[#C8102E] shadow-[0_6px_18px_rgba(168,0,30,0.55)]">
          <CaReelsLogo size={38} className="rounded-full" />
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleLike(post);
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

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleMute();
          }}
          aria-label={isMuted ? 'Səsi aç' : 'Səsi bağla'}
          className="flex h-9 w-11 items-center justify-center bg-transparent text-white/90 hover:text-white transition-transform active:scale-90 cursor-pointer"
        >
          {isMuted ? (
            <VolumeX className="h-5 w-5 drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)]" />
          ) : (
            <Volume2 className="h-5 w-5 drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)]" />
          )}
        </button>

        <div
          className={`relative flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-tr from-[#3B000B] via-zinc-900 to-[#5C0010] p-1.5 shadow-[0_0_18px_rgba(0,0,0,0.85)] ring-2 ring-[#A8001E]/70 ${
            isPlaying ? 'animate-spin-slow' : 'animate-spin-paused'
          }`}
          title={post.musicName || 'CaReels Audio'}
        >
          <div className="absolute inset-1 rounded-full border border-white/10" />
          <CaReelsLogo size={22} className="relative z-10 rounded-full" />
        </div>
      </div>

      {/* BOTTOM-LEFT: Account Name ("CaReels"), Caption (Alt yazı), and Music Name */}
      <div className="pointer-events-none absolute left-3.5 right-[68px] bottom-14 z-20 flex flex-col gap-1 text-left">
        <div
          className="text-base font-extrabold tracking-tight text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {post.accountName || 'CaReels'}
        </div>

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
};
