import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Film,
  Heart,
  Play,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import { PostItem, PublicPersonProfile, UserProfile } from '../types';
import { CaReelsLogo } from './CaReelsLogo';
import { FollowListModal } from './FollowListModal';
import { UserAvatar } from './UserAvatar';

interface CreatorProfileSheetProps {
  creator: PublicPersonProfile;
  viewerProfile: UserProfile;
  creatorPosts: PostItem[];
  followerUsers: PublicPersonProfile[];
  followingUsers: PublicPersonProfile[];
  followersCount: number;
  followingCount: number;
  isOfficialCaReels?: boolean;
  isFollowing: boolean;
  followPending?: boolean;
  onToggleFollow: (targetUid: string) => void;
  onInspectUser: (person: PublicPersonProfile) => void;
  onSelectPost: (postId: string) => void;
  onClose: () => void;
}

export const CreatorProfileSheet: React.FC<CreatorProfileSheetProps> = ({
  creator,
  viewerProfile,
  creatorPosts,
  followerUsers,
  followingUsers,
  followersCount,
  followingCount,
  isOfficialCaReels = false,
  isFollowing,
  followPending = false,
  onToggleFollow,
  onInspectUser,
  onSelectPost,
  onClose,
}) => {
  const [listModalType, setListModalType] = useState<'followers' | 'following' | null>(null);

  const isOwnProfile = !viewerProfile.isGuest && viewerProfile.uid === creator.uid;
  const canFollow =
    !isOfficialCaReels &&
    Boolean(creator.uid && !creator.uid.startsWith('name:')) &&
    !isOwnProfile;

  const totalLikes = useMemo(
    () => creatorPosts.reduce((sum, p) => sum + p.likesCount, 0),
    [creatorPosts]
  );

  const displayHandle = isOfficialCaReels
    ? 'CaReels'
    : creator.username
      ? `@${creator.username.replace(/^@+/, '')}`
      : 'CaReels';

  return (
    <div className="fixed inset-0 z-50 flex h-[100dvh] w-full flex-col bg-[#08080B] text-white">
      {/* Full-Screen Top Bar */}
      <header className="flex items-center justify-between border-b border-white/10 bg-[#0D0D12]/90 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3.5 backdrop-blur-xl">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onClose}
            aria-label="Geri qayıt"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <h2
              className="truncate text-base font-bold text-white sm:text-lg"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {displayHandle}
            </h2>
            <p className="text-[11px] text-zinc-400">
              {isOfficialCaReels ? 'Rəsmi Platforma Hesabı' : `${creatorPosts.length} video`}
            </p>
          </div>
        </div>
      </header>

      {/* Full-Screen Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-4 py-5 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-3xl space-y-6">
          {/* Identity Hero */}
          <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-[#161018] to-[#0E0E14] p-6 text-center">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-20 left-1/2 h-40 w-72 -translate-x-1/2 rounded-full bg-[#A8001E]/25 blur-[70px]"
            />

            <div className="relative flex flex-col items-center space-y-3">
              {isOfficialCaReels ? (
                <CaReelsLogo
                  variant="flame"
                  size={96}
                  className="h-24 w-24 rounded-full ring-2 ring-[#C8102E] shadow-[0_10px_30px_rgba(168,0,30,0.35)]"
                />
              ) : (
                <UserAvatar
                  photoURL={creator.photoURL}
                  name={creator.username || 'CR'}
                  sizeClass="h-24 w-24"
                  textClass="text-2xl"
                  className="ring-2 ring-[#C8102E] shadow-[0_10px_30px_rgba(168,0,30,0.35)]"
                />
              )}

              <div className="space-y-1">
                <div
                  className="text-xl font-extrabold text-white"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  {displayHandle}
                </div>
                {(creator.bio || isOfficialCaReels) && (
                  <p className="mx-auto max-w-md text-xs leading-relaxed text-zinc-300">
                    {creator.bio || 'Azərbaycanın musiqi və avtomobil qısa video platforması.'}
                  </p>
                )}
              </div>

              {canFollow && (
                <button
                  type="button"
                  disabled={followPending}
                  onClick={() => onToggleFollow(creator.uid)}
                  className={`inline-flex min-h-[42px] min-w-[160px] items-center justify-center gap-2 rounded-2xl px-5 text-xs font-semibold transition-all cursor-pointer disabled:opacity-60 ${
                    isFollowing
                      ? 'border border-white/20 bg-white/10 text-white hover:bg-white/15'
                      : 'bg-[#A8001E] text-white shadow-[0_8px_22px_rgba(168,0,30,0.4)] hover:bg-[#C8102E]'
                  }`}
                >
                  {isFollowing ? (
                    <>
                      <UserCheck className="h-4 w-4 text-emerald-400" />
                      <span>Takip edilir</span>
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-4 w-4" />
                      <span>Takip et</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Metrics: Takip etdikləri (clickable) · Bəyənmə · Takipçi (clickable) */}
            <div className="relative mt-6 grid grid-cols-3 gap-2.5 border-t border-white/10 pt-4">
              <button
                type="button"
                onClick={() => setListModalType('following')}
                className="rounded-2xl bg-white/[0.04] px-3 py-2.5 text-center hover:bg-white/[0.09] transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-center gap-1 text-base font-bold text-white">
                  <UserCheck className="h-3.5 w-3.5 text-[#E04F67]" />
                  <span>{followingCount}</span>
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
                  <span>{followersCount}</span>
                </div>
                <div className="mt-0.5 text-[11px] text-zinc-400">Takipçi</div>
              </button>
            </div>
          </section>

          {/* Creator Videos Grid */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Film className="h-4 w-4 text-[#E04F67]" />
              <h3
                className="text-sm font-bold text-white"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Paylaşdığı Videolar ({creatorPosts.length})
              </h3>
            </div>

            {creatorPosts.length === 0 ? (
              <div className="rounded-3xl border border-white/10 bg-[#101015] px-4 py-12 text-center text-xs text-zinc-400">
                Bu istifadəçinin hələ videosu yoxdur.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {creatorPosts.map((post) => (
                  <button
                    key={post.id}
                    type="button"
                    onClick={() => {
                      onClose();
                      onSelectPost(post.id);
                    }}
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
                        <Play className="h-7 w-7 text-zinc-500" />
                      </div>
                    )}
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent p-2.5">
                      <div className="flex items-center gap-1 text-[11px] font-semibold text-white">
                        <Heart className="h-3 w-3 text-[#E04F67]" />
                        <span>{post.likesCount}</span>
                      </div>
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
    </div>
  );
};
