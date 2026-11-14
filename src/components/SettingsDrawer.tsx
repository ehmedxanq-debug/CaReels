import React, { useState } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import {
  Check,
  Clock,
  Edit3,
  LogOut,
  Mail,
  Music2,
  Play,
  Trash2,
  User as UserIcon,
  X,
} from 'lucide-react';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { UserProfile, WatchHistoryItem } from '../types';
import { CaReelsLogo } from './CaReelsLogo';

interface SettingsDrawerProps {
  userProfile: UserProfile;
  history: WatchHistoryItem[];
  onUpdateProfile: (updated: UserProfile) => void;
  onSelectHistoryPost: (postId: string) => void;
  onClearHistory: () => void;
  onClose: () => void;
}

export const SettingsDrawer: React.FC<SettingsDrawerProps> = ({
  userProfile,
  history,
  onUpdateProfile,
  onSelectHistoryPost,
  onClearHistory,
  onClose,
}) => {
  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameInput, setUsernameInput] = useState(userProfile.username);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#A8001E]/15 text-[#A8001E]">
                <UserIcon className="h-5 w-5" />
              </div>
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
                    @{userProfile.username}
                  </div>
                )}
              </div>
            </div>

            {!editingUsername && (
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
        </div>

        {/* Watch History Section */}
        <div className="flex flex-1 flex-col overflow-hidden p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-[#A8001E]" />
              <h3 className="text-sm font-semibold text-white">Baxış tarixçəsi</h3>
            </div>
            {history.length > 0 && (
              <button
                type="button"
                onClick={onClearHistory}
                className="inline-flex items-center gap-1 text-xs font-medium text-zinc-400 hover:text-[#A8001E] transition-colors cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Təmizlə</span>
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
            {history.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-center">
                <p className="text-sm text-zinc-400">Hələ baxılmış video yoxdur.</p>
                <p className="mt-1 text-xs text-zinc-500">
                  İzlədiyiniz videolar burada görünəcək.
                </p>
              </div>
            ) : (
              history.map((item) => (
                <button
                  key={`${item.postId}-${item.watchedAt}`}
                  type="button"
                  onClick={() => {
                    onSelectHistoryPost(item.postId);
                    onClose();
                  }}
                  className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-2.5 text-left hover:bg-white/[0.08] transition-colors cursor-pointer"
                >
                  <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded-xl bg-black">
                    {item.videoUrl ? (
                      <video
                        src={item.videoUrl}
                        muted
                        playsInline
                        preload="metadata"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Play className="h-4 w-4 text-zinc-600" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">
                      {item.caption || 'CaReels videosu'}
                    </p>
                    {item.musicName && (
                      <div className="mt-0.5 flex items-center gap-1 text-xs text-zinc-400 truncate">
                        <Music2 className="h-3 w-3 shrink-0 text-[#A8001E]" />
                        <span className="truncate">{item.musicName}</span>
                      </div>
                    )}
                    <p className="mt-0.5 text-[11px] text-zinc-500">
                      {formatWatchedTime(item.watchedAt)}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Sign Out Footer */}
        <div className="border-t border-white/10 p-4">
          <button
            type="button"
            onClick={() => auth.signOut()}
            className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-zinc-200 hover:bg-[#A8001E]/15 hover:border-[#A8001E]/40 hover:text-white transition-colors cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
            <span>Hesabdan çıx</span>
          </button>
        </div>
      </aside>
    </div>
  );
};
