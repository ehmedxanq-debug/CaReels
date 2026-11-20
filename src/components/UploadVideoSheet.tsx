import React, { useEffect, useRef, useState } from 'react';
import { signInAnonymously } from 'firebase/auth';
import { addDoc, collection, doc, getDocFromServer, serverTimestamp } from 'firebase/firestore';
import { AlertTriangle, Ban, CheckCircle2, Film, Loader2, Music2, Upload, X } from 'lucide-react';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { UserProfile } from '../types';
import { isAccountBlockedFromDoc } from '../utils/accountStorage';
import { uploadMediaFile } from '../utils/mediaUpload';
import { ensureMp4Faststart, extractVideoPosterBlob } from '../utils/mp4Faststart';

interface UploadVideoSheetProps {
  userProfile: UserProfile;
  onClose: () => void;
  onUploaded?: (postId: string) => void;
  onUnlockAudio?: () => void;
  onRequireLogin?: () => void;
}

export const UploadVideoSheet: React.FC<UploadVideoSheetProps> = ({
  userProfile,
  onClose,
  onUploaded,
  onUnlockAudio,
  onRequireLogin,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [musicName, setMusicName] = useState('');
  const [region, setRegion] = useState<'az' | 'tr'>('az');
  const [category, setCategory] = useState('masin');
  const [customFilter, setCustomFilter] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [selectedFile]);

  const resetForm = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setCaption('');
    setMusicName('');
    setRegion('az');
    setCategory('masin');
    setCustomFilter('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setError(null);
    setSuccessMessage(null);
    if (!file) {
      setSelectedFile(null);
      return;
    }
    const hasVideoExt = /\.(mp4|mov|webm|m4v|3gp|mkv|avi)$/i.test(file.name || '');
    if (file.type && !file.type.startsWith('video/') && !hasVideoExt) {
      setError('Zəhmət olmasa yalnız video faylı seçin (MP4, MOV, WebM).');
      e.target.value = '';
      setSelectedFile(null);
      return;
    }
    setSelectedFile(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (uploading) return;

    if (userProfile.isBlocked) {
      setError('Hesabınız bloklandığı üçün video paylaşa bilməzsiniz.');
      return;
    }

    if (!selectedFile) {
      setError('Zəhmət olmasa yükləmək üçün video faylı seçin.');
      return;
    }

    onUnlockAudio?.();
    setUploading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      if (!userProfile.isGuest && userProfile.uid) {
        try {
          const freshSnap = await getDocFromServer(doc(db, 'people', userProfile.uid));
          if (freshSnap.exists() && isAccountBlockedFromDoc(freshSnap.data() as Record<string, unknown>)) {
            setError('Hesabınız bloklanıb. Video paylaşa bilməzsiniz, yalnız videolara baxa bilərsiniz.');
            setUploading(false);
            return;
          }
        } catch {
          // Proceed with cached isBlocked state if offline
        }
      }

      const [fastVideoFile, posterFile] = await Promise.all([
        ensureMp4Faststart(selectedFile),
        extractVideoPosterBlob(selectedFile),
      ]);

      const [videoUrl, posterUrl] = await Promise.all([
        uploadMediaFile(fastVideoFile, 'video.mp4'),
        posterFile
          ? uploadMediaFile(posterFile, 'poster.jpg').catch(() => '')
          : Promise.resolve(''),
      ]);
      const chosenFilter = customFilter.trim() || category;

      if (!auth.currentUser && userProfile.isGuest) {
        try {
          await Promise.race([
            signInAnonymously(auth),
            new Promise<void>((resolve) => window.setTimeout(resolve, 2000)),
          ]);
        } catch {
          // Ignore if anonymous auth disabled
        }
      }

      const rawUploaderName = userProfile.isGuest
        ? 'qonaq'
        : userProfile.username || auth.currentUser?.displayName || 'istifadeci';
      const uploaderUsername = rawUploaderName.trim().replace(/^@+/, '') || 'istifadeci';

      const docRef = await addDoc(collection(db, 'posts'), {
        videoUrl,
        ...(posterUrl ? { posterUrl } : {}),
        caption: caption.trim(),
        musicName: musicName.trim() || 'Orijinal Səs',
        region,
        category: chosenFilter,
        filtr: chosenFilter,
        accountName: uploaderUsername,
        authorPhotoURL: userProfile.isGuest ? '' : userProfile.photoURL || '',
        uid: auth.currentUser?.uid || userProfile.uid,
        username: uploaderUsername,
        likesCount: 0,
        commentsCount: 0,
        likedBy: [],
        createdAt: serverTimestamp(),
      });

      resetForm();
      setSuccessMessage('Video uğurla paylaşıldı!');
      window.setTimeout(() => {
        onUploaded?.(docRef.id);
      }, 550);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'posts');
      const rawMsg = err instanceof Error ? err.message : String(err || '');
      if (rawMsg.toLowerCase().includes('permission') || rawMsg.toLowerCase().includes('insufficient')) {
        setError('Video paylaşmaq üçün Google hesabı ilə daxil olmalısınız.');
      } else {
        setError(rawMsg || 'Video yüklənərkən xəta baş verdi. Yenidən cəhd edin.');
      }
    } finally {
      setUploading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) {
      return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={() => {
        if (!uploading) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-video-title"
        className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-white/15 bg-[#0E0E13] text-white shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#A8001E]/20 text-[#E04F67]">
              <Upload className="h-4 w-4" />
            </div>
            <div>
              <h2
                id="upload-video-title"
                className="text-base font-bold text-white"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Video Paylaş
              </h2>
              <p className="text-[11px] text-zinc-400">
                Catbox.moe üzərindən birbaşa yayım
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={uploading}
            onClick={onClose}
            aria-label="Bağla"
            className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-white disabled:opacity-40 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        {userProfile.isBlocked ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#A8001E]/40 bg-[#A8001E]/15 text-[#E04F67]">
              <Ban className="h-7 w-7" />
            </div>
            <h3 className="text-lg font-bold text-white" style={{ fontFamily: 'var(--font-display)' }}>
              Hesabınız bloklanıb
            </h3>
            <p className="max-w-xs text-xs leading-relaxed text-zinc-300">
              Bloklandığınız üçün video paylaşa, rəy yaza və ya mesaj göndərə bilməzsiniz. Yalnız videolara baxa bilərsiniz.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-2 min-h-[42px] rounded-2xl bg-white/10 px-6 text-xs font-semibold text-white hover:bg-white/15 transition-colors cursor-pointer"
            >
              Bağla
            </button>
          </div>
        ) : (
        <form
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-4"
        >
          {/* Platform Policy Warning Banner */}
          <div className="flex items-start gap-2.5 rounded-2xl border border-amber-500/35 bg-amber-500/10 px-3.5 py-2.5 text-xs leading-relaxed text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <span>
              Video platformaya uyğun olmazsa, admin gördükdə dərhal siləcək və 3-cü cəhdinizdə hesabınız bloklanacaq.
            </span>
          </div>

          {userProfile.isGuest && (
            <div className="flex items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-xs text-zinc-300">
              <span>Qonaq kimi paylaşırsınız</span>
              {onRequireLogin && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onRequireLogin();
                  }}
                  className="font-semibold text-[#E04F67] hover:underline cursor-pointer"
                >
                  Google ilə daxil ol
                </button>
              )}
            </div>
          )}
          {/* File Picker */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-zinc-300">
              Video faylı *
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              onChange={handleFileChange}
              disabled={uploading}
              className="sr-only"
              id="careels-video-file-input"
            />
            <label
              htmlFor="careels-video-file-input"
              className={`flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed px-4 py-5 text-center transition-colors ${
                uploading
                  ? 'cursor-not-allowed border-white/10 bg-white/[0.02] opacity-60'
                  : 'cursor-pointer border-[#A8001E]/50 bg-[#A8001E]/[0.06] hover:bg-[#A8001E]/12'
              }`}
            >
              <Film className="h-7 w-7 text-[#E04F67]" />
              {selectedFile ? (
                <div className="space-y-0.5">
                  <p className="max-w-[260px] truncate text-sm font-semibold text-white">
                    {selectedFile.name}
                  </p>
                  <p className="text-xs text-zinc-400">
                    {formatFileSize(selectedFile.size)} · Dəyişmək üçün toxunun
                  </p>
                </div>
              ) : (
                <div className="space-y-0.5">
                  <p className="text-sm font-semibold text-white">
                    Video faylı seçin
                  </p>
                  <p className="text-xs text-zinc-400">
                    MP4, MOV və ya WebM formatı dəstəklənir
                  </p>
                </div>
              )}
            </label>

            {previewUrl && (
              <div className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-black">
                <video
                  src={previewUrl}
                  controls
                  playsInline
                  preload="metadata"
                  onLoadedMetadata={(e) => {
                    e.currentTarget.muted = false;
                    e.currentTarget.volume = 1;
                  }}
                  className="max-h-48 w-full object-contain"
                />
              </div>
            )}
          </div>

          {/* Caption */}
          <div>
            <label
              htmlFor="careels-upload-caption"
              className="mb-1.5 block text-xs font-semibold text-zinc-300"
            >
              Alt yazı
            </label>
            <textarea
              id="careels-upload-caption"
              rows={2}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              disabled={uploading}
              placeholder="Video haqqında qısa məlumat..."
              className="w-full resize-none rounded-2xl border border-white/15 bg-black/50 px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:border-[#A8001E] focus:outline-none disabled:opacity-60"
            />
          </div>

          {/* Music Name */}
          <div>
            <label
              htmlFor="careels-upload-music"
              className="mb-1.5 block text-xs font-semibold text-zinc-300"
            >
              Musiqi adı
            </label>
            <div className="relative">
              <Music2 className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input
                id="careels-upload-music"
                type="text"
                value={musicName}
                onChange={(e) => setMusicName(e.target.value)}
                disabled={uploading}
                placeholder="Məs: Orijinal Səs"
                className="w-full rounded-2xl border border-white/15 bg-black/50 py-2.5 pr-3.5 pl-10 text-sm text-white placeholder:text-zinc-500 focus:border-[#A8001E] focus:outline-none disabled:opacity-60"
              />
            </div>
          </div>

          {/* Region & Category Row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="mb-1.5 block text-xs font-semibold text-zinc-300">
                Ölkə / Dil
              </span>
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-white/5 p-1">
                {(['az', 'tr'] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    disabled={uploading}
                    onClick={() => setRegion(item)}
                    className={`min-h-[34px] rounded-lg text-xs font-semibold uppercase transition-colors cursor-pointer ${
                      region === item
                        ? 'bg-[#A8001E] text-white'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="mb-1.5 block text-xs font-semibold text-zinc-300">
                Kateqoriya
              </span>
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-white/5 p-1">
                {[
                  { id: 'masin', label: 'Maşın' },
                  { id: 'musiqi', label: 'Musiqi' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    disabled={uploading}
                    onClick={() => {
                      setCategory(item.id);
                      setCustomFilter('');
                    }}
                    className={`min-h-[34px] rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      !customFilter.trim() && category === item.id
                        ? 'bg-[#A8001E] text-white'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Optional Custom Filter */}
          <div>
            <label
              htmlFor="careels-upload-custom-filter"
              className="mb-1.5 block text-xs font-semibold text-zinc-300"
            >
              Xüsusi filtr (istəyə bağlı)
            </label>
            <input
              id="careels-upload-custom-filter"
              type="text"
              value={customFilter}
              onChange={(e) => setCustomFilter(e.target.value)}
              disabled={uploading}
              placeholder="Məs: Drift, BMW, Remix..."
              className="w-full rounded-2xl border border-white/15 bg-black/50 px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:border-[#A8001E] focus:outline-none disabled:opacity-60"
            />
          </div>

          {error && (
            <div
              role="alert"
              className="space-y-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3.5 py-2.5 text-xs font-medium text-rose-200"
            >
              <p>{error}</p>
              {userProfile.isGuest && onRequireLogin && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onRequireLogin();
                  }}
                  className="inline-flex min-h-[34px] items-center rounded-xl bg-[#A8001E] px-3 text-xs font-semibold text-white hover:bg-[#C8102E] transition-colors cursor-pointer"
                >
                  Google hesabı ilə daxil ol
                </button>
              )}
            </div>
          )}

          {successMessage && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2.5 text-xs font-semibold text-emerald-300">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={uploading || !selectedFile}
            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-[#A8001E] px-5 text-sm font-semibold text-white shadow-[0_10px_28px_rgba(168,0,30,0.4)] hover:bg-[#C8102E] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 transition-all cursor-pointer"
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Yüklənir...</span>
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                <span>Paylaş</span>
              </>
            )}
          </button>
        </form>
        )}
      </div>
    </div>
  );
};
