import React, { useState } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Clock,
  Edit3,
  ExternalLink,
  LogOut,
  Mail,
  Music2,
  Play,
  Send,
  Trash2,
  User as UserIcon,
  X,
} from 'lucide-react';
import { useTelegramLinks } from '../config';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { UserProfile, WatchHistoryItem } from '../types';
import { clearSavedRegisteredAccount } from '../utils/accountStorage';
import { CaReelsLogo } from './CaReelsLogo';
import { UserAvatar } from './UserAvatar';

interface SettingsDrawerProps {
  userProfile: UserProfile;
  history: WatchHistoryItem[];
  onUpdateProfile: (updated: UserProfile) => void;
  onSelectHistoryPost: (postId: string) => void;
  onClearHistory: () => void;
  onRequireLogin?: () => void;
  onSignOut?: () => void;
  onClose: () => void;
}

export const SettingsDrawer: React.FC<SettingsDrawerProps> = ({
  userProfile,
  history,
  onUpdateProfile,
  onSelectHistoryPost,
  onClearHistory,
  onRequireLogin,
  onSignOut,
  onClose,
}) => {
  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameInput, setUsernameInput] = useState(userProfile.username);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHistoryScreen, setShowHistoryScreen] = useState(false);
  const { groupUrl } = useTelegramLinks();

  const handleSaveUsername = async () => {
    const cleaned = usernameInput.trim().toLowerCase();
    if (cleaned.length < 3 || cleaned.length > 24 || !/^[a-z0-9_]+$/.test(cleaned)) {
      setError('İstifadəçi adı 3-24 simvol (a-z, 0-9, _) olmalıdır.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await setDoc(
        doc(db, 'people', userProfile.uid),
        {
          username: cleaned,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      onUpdateProfile({ ...userProfile, username: cleaned });
      setEditingUsername(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `people/${userProfile.uid}`);
      setError('Yeniləmək mümkün olmadı.');
    } finally {
      setSaving(false);
    }
  };

  const formatWatchedTime = (ms: number) => {
    try {
      return new Intl.DateTimeFormat('az-AZ', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: 'short',
      }).format(new Date(ms));
    } catch {
      return '';
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-start bg-black/65 backdrop-blur-sm"
      onClick={onClose}
    >
      <aside
        className="flex h-full w-full max-w-sm flex-col border-r border-white/10 bg-[#0E0E13] text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <CaReelsLogo size={30} />
            <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--font-display)' }}>
              Ayarlar
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Ayarları bağla"
            className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Account Info (Username & Email) */}
        <div className="border-b border-white/10 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <UserAvatar
                photoURL={userProfile.photoURL}
                name={userProfile.username}
                sizeClass="h-11 w-11"
                textClass="text-xs"
              />
              <div className="min-w-0">
                <div className="text-xs text-zinc-400">İstifadəçi adı</div>
                {editingUsername ? (
                  <div className="mt-1 flex items-center gap-1.5">
                    <input
                      type="text"
                      value={usernameInput}
                      onChange={(e) => setUsernameInput(e.target.value)}
                      className="w-36 rounded-lg border border-white/20 bg-black/50 px-2.5 py-1 text-sm text-white focus:border-[#A8001E] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleSaveUsername}
                      disabled={saving}
                      aria-label="Yadda saxla"
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#A8001E] text-white cursor-pointer"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="truncate text-base font-bold text-white">
                    {userProfile.isGuest ? 'Qonaq rejimi' : `@${userProfile.username}`}
                  </div>
                )}
              </div>
            </div>

            {!editingUsername && !userProfile.isGuest && (
              <button
                type="button"
                onClick={() => {
                  setUsernameInput(userProfile.username);
                  setEditingUsername(true);
                }}
                aria-label="Username düzəliş et"
                className="flex h-9 w-9 items-center justify-center rounded-xl text-zinc-400 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
              >
                <Edit3 className="h-4 w-4" />
              </button>
            )}
          </div>

          {error && <p className="text-xs text-rose-400">{error}</p>}

          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/5 text-zinc-300">
              <Mail className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs text-zinc-400">Email</div>
              <div className="truncate text-sm font-medium text-zinc-200">
                {userProfile.email}
              </div>
            </div>
          </div>

          {/* Teleqram Kanal Section */}
          <div className="rounded-2xl border border-[#A8001E]/35 bg-[#A8001E]/[0.08] p-3.5">
            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[#E04F67]">
                Teleqram Kanal
              </span>
            </div>
            <a
              href={groupUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-[44px] w-full items-center justify-center gap-2.5 rounded-xl bg-[#A8001E] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_6px_20px_rgba(168,0,30,0.35)] hover:bg-[#C8102E] active:scale-[0.98] transition-all cursor-pointer"
            >
              <Send className="h-4 w-4 shrink-0" />
              <span>Teleqram Qrupuna Keç</span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-80" />
            </a>
            <p className="mt-2 text-center text-xs leading-relaxed text-zinc-300">
              Bizim qrupa qoşulun videolarınızı göndərin
            </p>
          </div>
        </div>

        {/* Watch History Button */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          <button
            type="button"
            onClick={() => setShowHistoryScreen(true)}
            className="flex min-h-[60px] w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left hover:border-[#A8001E]/45 hover:bg-white/[0.08] active:scale-[0.99] transition-all cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#A8001E]/20 text-[#E04F67]">
                <Clock className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white">Baxış tarixçəsi</div>
                <div className="text-xs text-zinc-400">
                  {history.length > 0
                    ? `${history.length} baxılmış video`
                    : 'Baxdığınız videolar'}
                </div>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-zinc-400" />
          </button>
        </div>

        {/* Sign Out / Sign In Footer */}
        <div className="border-t border-white/10 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {userProfile.isGuest ? (
            <button
              type="button"
              onClick={() => {
                onClose();
                onRequireLogin?.();
              }}
              className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-2xl bg-[#A8001E] px-4 text-sm font-semibold text-white shadow-[0_8px_22px_rgba(168,0,30,0.4)] hover:bg-[#C8102E] transition-colors cursor-pointer"
            >
              <UserIcon className="h-4 w-4" />
              <span>Google hesabı ilə daxil ol</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (onSignOut) {
                  onSignOut();
                } else {
                  clearSavedRegisteredAccount(userProfile.uid);
                  auth.signOut();
                }
              }}
              className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-zinc-200 hover:bg-[#A8001E]/15 hover:border-[#A8001E]/40 hover:text-white transition-colors cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
              <span>Hesabdan çıx</span>
            </button>
          )}
        </div>
      </aside>

      {/* Dedicated Full-Screen Watch History Videos View */}
      {showHistoryScreen && (
        <div
          className="fixed inset-0 z-[60] flex flex-col bg-[#08080B] text-white"
          onClick={(e) => e.stopPropagation()}
        >
          <header className="flex items-center justify-between border-b border-white/10 bg-[#0D0D12]/95 px-4 pt-[max(0.9rem,env(safe-area-inset-top))] pb-3.5 backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowHistoryScreen(false)}
                aria-label="Ayarlara qayıt"
                className="flex h-10 w-10 items-center justify-center rounded-2xl text-zinc-300 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div>
                <h2
                  className="text-base font-bold text-white"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  Baxış tarixçəsi
                </h2>
                <p className="text-xs text-zinc-400">
                  {history.length} video
                </p>
              </div>
            </div>

            {history.length > 0 && (
              <button
                type="button"
                onClick={onClearHistory}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-semibold text-zinc-300 hover:border-[#A8001E]/50 hover:bg-[#A8001E]/15 hover:text-white transition-colors cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5 text-[#E04F67]" />
                <span>Təmizlə</span>
              </button>
            )}
          </header>

          <div className="flex-1 overflow-y-auto px-4 py-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <div className="mx-auto max-w-4xl">
              {history.length === 0 ? (
                <div className="mx-auto mt-10 max-w-sm rounded-3xl border border-white/10 bg-[#111116] px-6 py-14 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#A8001E]/20 text-[#E04F67]">
                    <Clock className="h-6 w-6" />
                  </div>
                  <p className="mt-4 text-base font-semibold text-white">
                    Hələ baxılmış video yoxdur
                  </p>
                  <p className="mt-1.5 text-sm text-zinc-400">
                    İzlədiyiniz videolar burada görünəcək.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {history.map((item) => (
                    <button
                      key={`${item.postId}-${item.watchedAt}`}
                      type="button"
                      onClick={() => {
                        onSelectHistoryPost(item.postId);
                        setShowHistoryScreen(false);
                        onClose();
                      }}
                      className="group relative aspect-[9/16] overflow-hidden rounded-2xl border border-white/10 bg-[#14141A] text-left transition-transform hover:scale-[1.01] active:scale-[0.98] cursor-pointer"
                    >
                      {item.videoUrl ? (
                        <video
                          src={item.videoUrl}
                          muted
                          playsInline
                          preload="metadata"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-zinc-900">
                          <Play className="h-8 w-8 text-zinc-600" />
                        </div>
                      )}

                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent" />

                      <div className="absolute top-2.5 right-2.5 rounded-md bg-black/55 px-2 py-0.5 text-[10px] font-medium text-zinc-200 backdrop-blur-sm">
                        {formatWatchedTime(item.watchedAt)}
                      </div>

                      <div className="absolute inset-x-0 bottom-0 p-3">
                        <p className="line-clamp-2 text-xs font-semibold text-white">
                          {item.caption || 'CaReels videosu'}
                        </p>
                        {item.musicName && (
                          <div className="mt-1 flex items-center gap-1 text-[11px] text-zinc-300 truncate">
                            <Music2 className="h-3 w-3 shrink-0 text-[#A8001E]" />
                            <span className="truncate">{item.musicName}</span>
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
