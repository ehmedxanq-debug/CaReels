import React, { useEffect, useState } from 'react';
import { deleteDoc, doc } from 'firebase/firestore';
import { Check, Copy, Download, Loader2, MessageCircle, PlaySquare, Share2, Trash2, X } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { PostItem, UserProfile } from '../types';
import {
  hasNativeAdMobBridge,
  preloadRewardedDownloadAd,
  showRewardedDownloadAd,
} from '../utils/admob';

interface ShareDownloadSheetProps {
  post: PostItem;
  viewerProfile: UserProfile;
  onAdPlayingChange?: (playing: boolean) => void;
  onDeleted?: (postId: string) => void;
  onClose: () => void;
}

export const ShareDownloadSheet: React.FC<ShareDownloadSheetProps> = ({
  post,
  viewerProfile,
  onAdPlayingChange,
  onDeleted,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);
  const [waitingAd, setWaitingAd] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState<string | null>(null);
  const nativeAdAvailable = hasNativeAdMobBridge();

  useEffect(() => {
    void preloadRewardedDownloadAd();
  }, []);

  const isOwner =
    !viewerProfile.isGuest &&
    Boolean(
      (post.uid && post.uid === viewerProfile.uid) ||
        (!post.uid &&
          post.username &&
          viewerProfile.username &&
          post.username.toLowerCase() === viewerProfile.username.toLowerCase())
    );

  const shareUrl = `${window.location.origin}/?post=${encodeURIComponent(post.id)}`;
  const shareText = `CaReels videosuna bax: ${post.caption || 'CaReels'}${post.musicName ? ` · Musiqi: ${post.musicName}` : ''}`;

  const handleWhatsAppShare = () => {
    const waUrl = `https://wa.me/?text=${encodeURIComponent(`${shareText}\n${shareUrl}`)}`;
    const link = document.createElement('a');
    link.href = waUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setDownloadStatus('Link kopyalana bilmədi.');
    }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'CaReels',
          text: shareText,
          url: shareUrl,
        });
      } catch {
        // User cancelled share
      }
    } else {
      handleCopyLink();
    }
  };

  const handleDownloadToGallery = async () => {
    if (!post.videoUrl || waitingAd || downloading) return;
    setDownloadStatus(null);
    setWaitingAd(true);
    onAdPlayingChange?.(true);

    try {
      const adResult = await showRewardedDownloadAd();
      if (!adResult.rewarded) {
        setDownloadStatus('Videonu endirmək üçün reklamı sona qədər izləməlisiniz.');
        return;
      }
    } finally {
      onAdPlayingChange?.(false);
      setWaitingAd(false);
    }

    setDownloading(true);
    try {
      let response = await fetch(post.videoUrl, { mode: 'cors' }).catch(() => null);
      if (!response || !response.ok) {
        response = await fetch(`/api/video-proxy?url=${encodeURIComponent(post.videoUrl)}`);
      }
      if (!response.ok) throw new Error('Fetch failed');
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `CaReels-${post.id}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
      setDownloadStatus('Video cihazınıza endirildi.');
    } catch {
      const a = document.createElement('a');
      a.href = post.videoUrl;
      a.download = `CaReels-${post.id}.mp4`;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setDownloadStatus('Endirmə başladıldı.');
    } finally {
      setDownloading(false);
      void preloadRewardedDownloadAd();
    }
  };

  const handleDeletePost = async () => {
    if (!isOwner || deleting) return;
    setDeleting(true);
    setDownloadStatus(null);
    try {
      await deleteDoc(doc(db, 'posts', post.id));
      onDeleted?.(post.id);
      onClose();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `posts/${post.id}`);
      setDownloadStatus('Videonu silmək mümkün olmadı.');
      setDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 backdrop-blur-sm sm:items-center"
      onClick={() => {
        if (!deleting) onClose();
      }}
    >
      <div
        className="w-full max-w-md rounded-t-3xl border border-white/15 bg-[#121218] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-white shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-white/20 sm:hidden" />

        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <h2 className="text-base font-bold" style={{ fontFamily: 'var(--font-display)' }}>
            Paylaş və ya Endir
          </h2>
          <button
            type="button"
            disabled={deleting}
            onClick={onClose}
            aria-label="Bağla"
            className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 space-y-2.5">
          <button
            type="button"
            onClick={handleWhatsAppShare}
            className="flex min-h-[52px] w-full items-center gap-3.5 rounded-2xl bg-[#25D366]/15 px-4 py-3 text-left text-sm font-semibold text-emerald-300 hover:bg-[#25D366]/25 transition-colors cursor-pointer"
          >
            <MessageCircle className="h-5 w-5 shrink-0 text-[#25D366]" />
            <span>WhatsApp-da paylaş</span>
          </button>

          <button
            type="button"
            onClick={handleNativeShare}
            className="flex min-h-[52px] w-full items-center gap-3.5 rounded-2xl bg-white/5 px-4 py-3 text-left text-sm font-semibold text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <Share2 className="h-5 w-5 shrink-0 text-[#A8001E]" />
            <span>Digər tətbiqlərlə paylaş</span>
          </button>

          <button
            type="button"
            onClick={handleCopyLink}
            className="flex min-h-[52px] w-full items-center gap-3.5 rounded-2xl bg-white/5 px-4 py-3 text-left text-sm font-semibold text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            {copied ? (
              <Check className="h-5 w-5 shrink-0 text-emerald-400" />
            ) : (
              <Copy className="h-5 w-5 shrink-0 text-zinc-300" />
            )}
            <span>{copied ? 'Link kopyalandı' : 'Video linkini kopyala'}</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadToGallery}
            disabled={waitingAd || downloading || !post.videoUrl}
            className="flex min-h-[52px] w-full items-center gap-3.5 rounded-2xl bg-[#A8001E] px-4 py-3 text-left text-sm font-semibold text-white shadow-[0_8px_24px_rgba(255,32,78,0.3)] hover:bg-[#C8102E] transition-colors disabled:opacity-50 cursor-pointer"
          >
            {waitingAd || downloading ? (
              <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
            ) : nativeAdAvailable ? (
              <PlaySquare className="h-5 w-5 shrink-0" />
            ) : (
              <Download className="h-5 w-5 shrink-0" />
            )}
            <span>
              {waitingAd
                ? 'Reklam göstərilir...'
                : downloading
                  ? 'Endirilir...'
                  : nativeAdAvailable
                    ? 'Reklama baxıb qalereyaya endir'
                    : 'Cihazın qalereyasına endir'}
            </span>
          </button>

          {/* Delete Video — ONLY visible to the post's owner */}
          {isOwner && (
            !confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="flex min-h-[52px] w-full items-center gap-3.5 rounded-2xl border border-rose-500/35 bg-rose-500/10 px-4 py-3 text-left text-sm font-semibold text-rose-300 hover:bg-rose-500/20 transition-colors cursor-pointer"
              >
                <Trash2 className="h-5 w-5 shrink-0 text-rose-400" />
                <span>Videonu sil</span>
              </button>
            ) : (
              <div className="rounded-2xl border border-rose-500/40 bg-rose-500/15 p-3.5 space-y-2.5">
                <p className="text-xs font-semibold text-rose-200">
                  Bu videonu silmək istədiyinizə əminsiniz?
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={() => setConfirmDelete(false)}
                    className="min-h-[40px] rounded-xl border border-white/15 bg-white/5 text-xs font-semibold text-white hover:bg-white/10 cursor-pointer"
                  >
                    Ləğv et
                  </button>
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={handleDeletePost}
                    className="flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl bg-rose-600 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-60 cursor-pointer"
                  >
                    {deleting ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Silinir...</span>
                      </>
                    ) : (
                      <span>Bəli, sil</span>
                    )}
                  </button>
                </div>
              </div>
            )
          )}
        </div>

        {downloadStatus && (
          <p className="mt-3 text-center text-xs font-medium text-zinc-300">
            {downloadStatus}
          </p>
        )}
      </div>
    </div>
  );
};
