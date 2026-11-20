import React, { useEffect, useMemo, useRef, useState } from 'react';
import { updateProfile } from 'firebase/auth';
import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  Ban,
  Camera,
  Check,
  CheckCircle2,
  Edit3,
  Film,
  Heart,
  Loader2,
  LogOut,
  Music2,
  Play,
  Plus,
  Settings,
  User as UserIcon,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { PostItem, PublicPersonProfile, UserProfile } from '../types';
import { clearSavedRegisteredAccount } from '../utils/accountStorage';
import { uploadMediaFile } from '../utils/mediaUpload';
import { CaReelsLogo } from './CaReelsLogo';
import { FollowListModal } from './FollowListModal';
import { UserAvatar } from './UserAvatar';

interface ProfileViewProps {
  userProfile: UserProfile;
  posts: PostItem[];
  followerUsers: PublicPersonProfile[];
  followingUsers: PublicPersonProfile[];
  onUpdateProfile: (updated: UserProfile) => void;
  onInspectUser: (person: PublicPersonProfile) => void;
  onSelectPost: (postId: string) => void;
  onOpenUpload: () => void;
  onOpenSettings: () => void;
  onRequireLogin: () => void;
  onSignOut?: () => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  userProfile,
  posts,
  followerUsers,
  followingUsers,
  onUpdateProfile,
  onInspectUser,
  onSelectPost,
  onOpenUpload,
  onOpenSettings,
  onRequireLogin,
  onSignOut,
}) => {
  const [showEditModal, setShowEditModal] = useState(false);
  const [listModalType, setListModalType] = useState<'followers' | 'following' | null>(null);
  const [usernameInput, setUsernameInput] = useState(userProfile.username);
  const [bioInput, setBioInput] = useState(userProfile.bio || '');
  const [uploadedPhotoUrl, setUploadedPhotoUrl] = useState(userProfile.photoURL || '');
  const [localPhotoPreview, setLocalPhotoPreview] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoStatus, setPhotoStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      if (localPhotoPreview) {
        URL.revokeObjectURL(localPhotoPreview);
      }
    };
  }, [localPhotoPreview]);

  const myPosts = useMemo(() => {
    if (userProfile.isGuest) return [];
    const uname = userProfile.username.toLowerCase();
    return posts.filter(
      (p) =>
        (p.uid && p.uid === userProfile.uid) ||
        (p.username && p.username.toLowerCase() === uname)
    );
  }, [posts, userProfile]);

  const totalLikes = useMemo(
    () => myPosts.reduce((sum, item) => sum + item.likesCount, 0),
    [myPosts]
  );

  const openEditProfile = () => {
    setUsernameInput(userProfile.username);
    setBioInput(userProfile.bio || '');
    setUploadedPhotoUrl(userProfile.photoURL || '');
    setLocalPhotoPreview(null);
    setPhotoStatus(null);
    setError(null);
    setShowEditModal(true);
  };

  const syncUserPostsProfile = async (
    uid: string,
    updates: { authorPhotoURL?: string; username?: string; accountName?: string }
  ) => {
    if (!uid) return;
    try {
      const userPostsSnap = await getDocs(query(collection(db, 'posts'), where('uid', '==', uid)));
      await Promise.all(
        userPostsSnap.docs.map((postDoc) => updateDoc(postDoc.ref, updates).catch(() => {}))
      );
    } catch {
      // Ignore if post query or batch update is partially restricted
    }
  };

  // Immediately upload selected photo to Catbox/proxy, persist photoURL in Firestore & user posts, and show it immediately
  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setError(null);
    setPhotoStatus(null);
    if (!file) return;

    const hasImgExt = /\.(jpg|jpeg|png|webp|gif|heic|heif)$/i.test(file.name || '');
    if (file.type && !file.type.startsWith('image/') && !hasImgExt) {
      setError('Zəhmət olmasa yalnız şəkil faylı seçin.');
      e.target.value = '';
      return;
    }

    if (localPhotoPreview) {
      URL.revokeObjectURL(localPhotoPreview);
    }
    const preview = URL.createObjectURL(file);
    setLocalPhotoPreview(preview);
    setUploadingPhoto(true);

    try {
      const catboxUrl = await uploadMediaFile(file, 'avatar.jpg');
      setUploadedPhotoUrl(catboxUrl);

      await setDoc(
        doc(db, 'people', userProfile.uid),
        {
          uid: userProfile.uid,
          email: userProfile.email,
          username: userProfile.username,
          photoURL: catboxUrl,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      if (auth.currentUser && auth.currentUser.uid === userProfile.uid) {
        updateProfile(auth.currentUser, { photoURL: catboxUrl }).catch(() => {});
      }

      void syncUserPostsProfile(userProfile.uid, { authorPhotoURL: catboxUrl });

      onUpdateProfile({
        ...userProfile,
        photoURL: catboxUrl,
      });
      setPhotoStatus('Profil fotosu yükləndi!');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      setError(msg || 'Şəkil yüklənə bilmədi.');
    } finally {
      setUploadingPhoto(false);
      e.target.value = '';
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || uploadingPhoto || userProfile.isGuest) return;

    const cleanedUsername = usernameInput.trim().toLowerCase();
    if (cleanedUsername.length < 3 || cleanedUsername.length > 24 || !/^[a-z0-9_]+$/.test(cleanedUsername)) {
      setError('İstifadəçi adı 3-24 simvol (a-z, 0-9, _) olmalıdır.');
      return;
    }

    const cleanedBio = bioInput.trim().slice(0, 160);
    const nextPhotoUrl = uploadedPhotoUrl || userProfile.photoURL || '';

    setSaving(true);
    setError(null);

    try {
      if (cleanedUsername !== userProfile.username.toLowerCase()) {
        try {
          const q = query(collection(db, 'people'), where('username', '==', cleanedUsername));
          const snap = await getDocs(q);
          const takenByOther = snap.docs.some((d) => d.id !== userProfile.uid);
          if (takenByOther) {
            setError('Bu istifadəçi adı artıq tutulub.');
            setSaving(false);
            return;
          }
        } catch {
          // Proceed if listing is restricted
        }
      }

      await setDoc(
        doc(db, 'people', userProfile.uid),
        {
          uid: userProfile.uid,
          email: userProfile.email,
          username: cleanedUsername,
          bio: cleanedBio,
          photoURL: nextPhotoUrl,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      if (auth.currentUser && auth.currentUser.uid === userProfile.uid && nextPhotoUrl) {
        updateProfile(auth.currentUser, { photoURL: nextPhotoUrl }).catch(() => {});
      }

      void syncUserPostsProfile(userProfile.uid, {
        authorPhotoURL: nextPhotoUrl,
        username: cleanedUsername,
        accountName: `@${cleanedUsername}`,
      });

      onUpdateProfile({
        ...userProfile,
        username: cleanedUsername,
        bio: cleanedBio,
        photoURL: nextPhotoUrl,
      });

      setShowEditModal(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `people/${userProfile.uid}`);
      const msg = err instanceof Error ? err.message : '';
      setError(msg || 'Profil yenilənə bilmədi.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full w-full flex-col bg-[#08080B] text-white">
      {/* Top Bar */}
      <header className="flex items-center justify-between border-b border-white/10 bg-[#0D0D12]/90 px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-3.5 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <CaReelsLogo size={34} />
          <div>
            <h1
              className="text-lg font-bold leading-tight"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Profil
            </h1>
            <p className="text-xs text-zinc-400">
              {userProfile.isGuest ? 'Qonaq rejimi' : `@${userProfile.username}`}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Ayarlar"
          className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10 transition-colors cursor-pointer"
        >
          <Settings className="h-4 w-4" />
        </button>
      </header>

      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto px-4 py-5 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-3xl space-y-6">
          {/* Profile Identity Card */}
          <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-[#161018] to-[#0E0E14] p-5 sm:p-6">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-20 left-1/2 h-40 w-72 -translate-x-1/2 rounded-full bg-[#A8001E]/25 blur-[70px]"
            />

            <div className="relative flex flex-col items-center text-center sm:flex-row sm:items-center sm:text-left sm:justify-between gap-4">
              <div className="flex flex-col items-center sm:flex-row sm:items-center gap-4">
                {userProfile.isGuest ? (
                  <UserAvatar
                    name="QN"
                    sizeClass="h-20 w-20"
                    textClass="text-xl"
                    className="ring-2 ring-[#A8001E]/60 shadow-[0_8px_24px_rgba(168,0,30,0.3)]"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={openEditProfile}
                    aria-label="Profil şəklini düzəlt"
                    className="group relative rounded-full ring-2 ring-[#C8102E] shadow-[0_8px_24px_rgba(168,0,30,0.3)] cursor-pointer"
                  >
                    <UserAvatar
                      photoURL={userProfile.photoURL}
                      name={userProfile.username}
                      sizeClass="h-20 w-20"
                      textClass="text-xl"
                    />
                    <span className="absolute -right-1 -bottom-1 flex h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-[#A8001E] text-white shadow-md">
                      <Camera className="h-3.5 w-3.5" />
                    </span>
                  </button>
                )}

                <div className="space-y-1">
                  <div className="flex items-center justify-center sm:justify-start gap-2">
                    <h2
                      className="text-xl font-bold text-white"
                      style={{ fontFamily: 'var(--font-display)' }}
                    >
                      {userProfile.isGuest ? 'Qonaq İstifadəçi' : `@${userProfile.username}`}
                    </h2>
                    {!userProfile.isGuest && (
                      <button
                        type="button"
                        onClick={openEditProfile}
                        aria-label="Profili düzəlt"
                        className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-200 hover:bg-white/15 hover:text-white transition-colors cursor-pointer"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  <p className="text-xs text-zinc-400">{userProfile.email}</p>

                  {!userProfile.isGuest && (
                    <p className="max-w-md text-xs leading-relaxed text-zinc-200">
                      {userProfile.bio ? (
                        userProfile.bio
                      ) : (
                        <button
                          type="button"
                          onClick={openEditProfile}
                          className="text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
                        >
                          + Bio əlavə et
                        </button>
                      )}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2">
                {userProfile.isGuest ? (
                  <button
                    type="button"
                    onClick={onRequireLogin}
                    className="inline-flex min-h-[42px] items-center gap-2 rounded-2xl bg-[#A8001E] px-4 text-xs font-semibold text-white shadow-[0_8px_22px_rgba(168,0,30,0.4)] hover:bg-[#C8102E] transition-colors cursor-pointer"
                  >
                    <UserIcon className="h-4 w-4" />
                    <span>Google hesabı ilə daxil ol</span>
                  </button>
                ) : (
                  <>
                    {!userProfile.isBlocked && (
                      <button
                        type="button"
                        onClick={onOpenUpload}
                        className="inline-flex min-h-[42px] items-center gap-1.5 rounded-2xl bg-[#A8001E] px-4 text-xs font-semibold text-white shadow-[0_8px_22px_rgba(168,0,30,0.4)] hover:bg-[#C8102E] transition-colors cursor-pointer"
                      >
                        <Plus className="h-4 w-4" />
                        <span>Video Yüklə</span>
                      </button>
                    )}
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
                      className="inline-flex min-h-[42px] items-center gap-1.5 rounded-2xl border border-white/15 bg-white/5 px-3.5 text-xs font-semibold text-zinc-200 hover:bg-white/10 transition-colors cursor-pointer"
                    >
                      <LogOut className="h-4 w-4" />
                      <span>Çıxış</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {userProfile.isBlocked && !userProfile.isGuest && (
              <div className="relative mt-4 flex items-center gap-2 rounded-2xl border border-[#A8001E]/50 bg-[#A8001E]/15 px-4 py-2.5 text-xs font-semibold text-rose-200">
                <Ban className="h-4 w-4 shrink-0 text-[#E04F67]" />
                <span>Hesabınız bloklanıb. Rəy yaza, mesaj göndərə və video paylaşa bilməzsiniz — yalnız videolara baxa bilərsiniz.</span>
              </div>
            )}

            {/* Metrics: Takip etdikləri (clickable) · Bəyənmə · Takipçi (clickable) */}
            <div className="relative mt-5 grid grid-cols-3 gap-2.5 border-t border-white/10 pt-4">
              <button
                type="button"
                onClick={() => setListModalType('following')}
                className="rounded-2xl bg-white/[0.04] px-3 py-2.5 text-center hover:bg-white/[0.09] transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-center gap-1 text-base font-bold text-white">
                  <UserCheck className="h-3.5 w-3.5 text-[#E04F67]" />
                  <span>{followingUsers.length}</span>
                </div>
                <div className="mt-0.5 text-[11px] text-zinc-400">Takip etdikləri</div>
              </button>

              <div className="rounded-2xl bg-white/[0.04] px-3 py-2.5 text-center">
                <div className="flex items-center justify-center gap-1 text-base font-bold text-white">
                  <Heart className="h-3.5 w-3.5 text-[#E04F67]" />
                  <span>{totalLikes}</span>
                </div>
                <div className="mt-0.5 text-[11px] text-zinc-400">Bəyənmə</div>
              </div>

              <button
                type="button"
                onClick={() => setListModalType('followers')}
                className="rounded-2xl bg-white/[0.04] px-3 py-2.5 text-center hover:bg-white/[0.09] transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-center gap-1 text-base font-bold text-white">
                  <Users className="h-3.5 w-3.5 text-[#E04F67]" />
                  <span>{followerUsers.length}</span>
                </div>
                <div className="mt-0.5 text-[11px] text-zinc-400">Takipçi</div>
              </button>
            </div>
          </section>

          {/* My Uploaded Videos */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3
                className="text-sm font-bold text-white"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Paylaşdığım Videolar ({myPosts.length})
              </h3>
              {!userProfile.isGuest && (
                <button
                  type="button"
                  onClick={onOpenUpload}
                  className="text-xs font-semibold text-[#E04F67] hover:underline cursor-pointer"
                >
                  + Yeni video
                </button>
              )}
            </div>

            {userProfile.isGuest ? (
              <div className="rounded-3xl border border-white/10 bg-[#101015] px-6 py-12 text-center space-y-3">
                <p className="text-sm font-semibold text-white">
                  Qonaq rejimində şəxsi videolar saxlanılmır
                </p>
                <p className="text-xs text-zinc-400">
                  Öz videolarınızı yükləmək və profilinizdə görmək üçün Google hesabı ilə daxil olun.
                </p>
                <button
                  type="button"
                  onClick={onRequireLogin}
                  className="mt-1 inline-flex min-h-[42px] items-center justify-center rounded-2xl bg-[#A8001E] px-5 text-xs font-semibold text-white hover:bg-[#C8102E] transition-colors cursor-pointer"
                >
                  Google hesabı ilə daxil ol
                </button>
              </div>
            ) : myPosts.length === 0 ? (
              <div className="rounded-3xl border border-white/10 bg-[#101015] px-6 py-12 text-center space-y-3">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#A8001E]/20 text-[#E04F67]">
                  <Film className="h-6 w-6" />
                </div>
                <p className="text-sm font-semibold text-white">
                  Hələ video paylaşmamısınız
                </p>
                <p className="text-xs text-zinc-400">
                  Aşağıdakı + düyməsinə toxunaraq ilk videonuzu paylaşın.
                </p>
                <button
                  type="button"
                  onClick={onOpenUpload}
                  className="mt-1 inline-flex min-h-[42px] items-center gap-1.5 rounded-2xl bg-[#A8001E] px-5 text-xs font-semibold text-white hover:bg-[#C8102E] transition-colors cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  <span>Video Yüklə</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {myPosts.map((post) => (
                  <button
                    key={post.id}
                    type="button"
                    onClick={() => onSelectPost(post.id)}
                    className="group relative aspect-[9/16] overflow-hidden rounded-2xl border border-white/10 bg-[#14141A] text-left transition-transform hover:scale-[1.01] active:scale-[0.98] cursor-pointer"
                  >
                    {post.videoUrl ? (
                      <video
                        src={post.videoUrl}
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
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                    <div className="absolute top-2.5 right-2.5 flex items-center gap-1 rounded-md bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
                      <Heart className="h-3 w-3 text-[#E04F67]" />
                      <span>{post.likesCount}</span>
                    </div>
                    <div className="absolute inset-x-0 bottom-0 p-3">
                      <p className="line-clamp-2 text-xs font-semibold text-white">
                        {post.caption || 'CaReels videosu'}
                      </p>
                      {post.musicName && (
                        <div className="mt-1 flex items-center gap-1 text-[11px] text-zinc-300 truncate">
                          <Music2 className="h-3 w-3 shrink-0 text-[#A8001E]" />
                          <span className="truncate">{post.musicName}</span>
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Followers / Following Modal */}
      {listModalType && (
        <FollowListModal
          title={listModalType === 'followers' ? 'Takipçilər' : 'Takip etdikləri'}
          users={listModalType === 'followers' ? followerUsers : followingUsers}
          onSelectUser={(person) => onInspectUser(person)}
          onClose={() => setListModalType(null)}
        />
      )}

      {/* Edit Profile Modal: Immediate Catbox Photo Upload + Username + Bio */}
      {showEditModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => {
            if (!saving && !uploadingPhoto) setShowEditModal(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-profile-modal-title"
            className="flex max-h-[90dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-white/15 bg-[#0E0E13] text-white shadow-2xl sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <h2
                id="edit-profile-modal-title"
                className="text-base font-bold"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Profili Düzəlt
              </h2>
              <button
                type="button"
                disabled={saving || uploadingPhoto}
                onClick={() => setShowEditModal(false)}
                aria-label="Bağla"
                className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-white cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              onSubmit={handleSaveProfile}
              className="flex-1 overflow-y-auto p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-5"
            >
              {/* Immediate Profile Photo Selector */}
              <div className="flex flex-col items-center gap-2.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoChange}
                  disabled={saving || uploadingPhoto}
                  className="sr-only"
                  id="careels-profile-photo-input"
                />
                <label
                  htmlFor="careels-profile-photo-input"
                  className="relative cursor-pointer"
                >
                  <UserAvatar
                    photoURL={localPhotoPreview || uploadedPhotoUrl || userProfile.photoURL}
                    name={usernameInput || userProfile.username}
                    sizeClass="h-24 w-24"
                    textClass="text-2xl"
                    className="ring-2 ring-[#C8102E] shadow-[0_8px_24px_rgba(168,0,30,0.35)]"
                  />
                  <span className="absolute right-0 bottom-0 flex h-8 w-8 items-center justify-center rounded-full border border-white/25 bg-[#A8001E] text-white shadow-lg">
                    {uploadingPhoto ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Camera className="h-4 w-4" />
                    )}
                  </span>
                </label>

                <label
                  htmlFor="careels-profile-photo-input"
                  className="text-xs font-semibold text-[#E04F67] hover:underline cursor-pointer"
                >
                  {uploadingPhoto
                    ? 'Profil şəkli yüklənir...'
                    : 'Qalereyadan profil fotosu seç'}
                </label>

                {photoStatus && (
                  <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>{photoStatus}</span>
                  </div>
                )}
              </div>

              {/* Username */}
              <div>
                <label
                  htmlFor="edit-profile-username"
                  className="mb-1.5 block text-xs font-semibold text-zinc-300"
                >
                  İstifadəçi adı
                </label>
                <input
                  id="edit-profile-username"
                  type="text"
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  disabled={saving}
                  placeholder="istifadeci_adi"
                  className="w-full rounded-2xl border border-white/15 bg-black/50 px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:border-[#A8001E] focus:outline-none disabled:opacity-60"
                />
              </div>

              {/* Bio */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label
                    htmlFor="edit-profile-bio"
                    className="text-xs font-semibold text-zinc-300"
                  >
                    Bio (Haqqınızda)
                  </label>
                  <span className="text-[11px] text-zinc-500">{bioInput.length}/160</span>
                </div>
                <textarea
                  id="edit-profile-bio"
                  rows={3}
                  maxLength={160}
                  value={bioInput}
                  onChange={(e) => setBioInput(e.target.value)}
                  disabled={saving}
                  placeholder="Özünüz və ya avtomobiliniz haqqında qısa məlumat..."
                  className="w-full resize-none rounded-2xl border border-white/15 bg-black/50 px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:border-[#A8001E] focus:outline-none disabled:opacity-60"
                />
              </div>

              {error && (
                <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3.5 py-2 text-xs font-medium text-rose-200">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={saving || uploadingPhoto}
                className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-2xl bg-[#A8001E] px-5 text-sm font-semibold text-white shadow-[0_10px_28px_rgba(168,0,30,0.4)] hover:bg-[#C8102E] disabled:opacity-60 transition-colors cursor-pointer"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Yadda saxlanılır...</span>
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    <span>Yadda saxla</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
