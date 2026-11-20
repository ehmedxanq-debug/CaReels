import React, { useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  doc,
  getDocFromServer,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { Ban, CornerDownRight, Send, X } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { CommentItem, PostItem, PublicPersonProfile, UserProfile } from '../types';
import {
  isSystemOrProtectedUid,
  isUidKnownDeleted,
  verifyAndPurgeIfAccountDeleted,
} from '../utils/accountCleanup';
import { isAccountBlockedFromDoc } from '../utils/accountStorage';
import { UserAvatar } from './UserAvatar';

interface CommentsSheetProps {
  post: PostItem;
  userProfile: UserProfile;
  peopleDirectory?: Record<string, PublicPersonProfile>;
  peopleDirectoryReady?: boolean;
  deletedUids?: Record<string, true>;
  onMarkUidDeleted?: (uid: string) => void;
  onRequireLogin?: () => void;
  onClose: () => void;
}

export const CommentsSheet: React.FC<CommentsSheetProps> = ({
  post,
  userProfile,
  peopleDirectory,
  peopleDirectoryReady = false,
  deletedUids,
  onMarkUidDeleted,
  onRequireLogin,
  onClose,
}) => {
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<{ id: string; username: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const commentsRef = collection(db, 'posts', post.id, 'comments');
    const q = query(commentsRef, orderBy('createdAt', 'asc'));

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list: CommentItem[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          const ts = data.createdAt;
          const createdAtMs =
            ts && typeof ts.toMillis === 'function'
              ? ts.toMillis()
              : typeof data.createdAtMs === 'number'
                ? data.createdAtMs
                : Date.now();
          return {
            id: docSnap.id,
            postId: post.id,
            userId: String(data.userId || ''),
            username: String(data.username || 'istifadəçi'),
            authorPhotoURL: data.authorPhotoURL ? String(data.authorPhotoURL) : undefined,
            text: String(data.text || ''),
            parentId: data.parentId ? String(data.parentId) : null,
            createdAtMs,
          };
        });
        setComments(list);
        setLoading(false);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, `posts/${post.id}/comments`);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [post.id]);

  const [localDeletedUids, setLocalDeletedUids] = useState<Record<string, true>>({});

  useEffect(() => {
    if (!peopleDirectoryReady || !peopleDirectory || comments.length === 0) return;
    const candidateUids = Array.from(
      new Set(
        comments
          .map((c) => c.userId)
          .filter(
            (uid) =>
              uid &&
              !isSystemOrProtectedUid(uid) &&
              !peopleDirectory[uid] &&
              !deletedUids?.[uid] &&
              !localDeletedUids[uid]
          )
      )
    );
    for (const uid of candidateUids) {
      void verifyAndPurgeIfAccountDeleted(uid, [post.id]).then((wasDeleted) => {
        if (wasDeleted) {
          setLocalDeletedUids((prev) => (prev[uid] ? prev : { ...prev, [uid]: true }));
          onMarkUidDeleted?.(uid);
        }
      });
    }
  }, [comments, peopleDirectoryReady, peopleDirectory, deletedUids, localDeletedUids, post.id, onMarkUidDeleted]);

  const visibleComments = useMemo(() => {
    return comments.filter(
      (c) => !deletedUids?.[c.userId] && !localDeletedUids[c.userId] && !isUidKnownDeleted(c.userId)
    );
  }, [comments, deletedUids, localDeletedUids]);

  const peopleByUsername = useMemo(() => {
    const map: Record<string, PublicPersonProfile> = {};
    if (!peopleDirectory) return map;
    for (const person of Object.values(peopleDirectory)) {
      const key = (person.username || '').replace(/^@+/, '').trim().toLowerCase();
      if (key && !map[key]) {
        map[key] = person;
      }
    }
    return map;
  }, [peopleDirectory]);

  const resolveCommentPhoto = (item: CommentItem): string | undefined => {
    if (item.userId && peopleDirectory?.[item.userId]?.photoURL) {
      return peopleDirectory[item.userId].photoURL;
    }
    const cleanName = (item.username || '').replace(/^@+/, '').trim().toLowerCase();
    if (cleanName && peopleByUsername[cleanName]?.photoURL) {
      return peopleByUsername[cleanName].photoURL;
    }
    if (item.userId && item.userId === userProfile.uid && userProfile.photoURL) {
      return userProfile.photoURL;
    }
    return item.authorPhotoURL || undefined;
  };

  // Organize into top-level comments + replies map
  const { topLevel, repliesMap } = useMemo(() => {
    const top: CommentItem[] = [];
    const map: Record<string, CommentItem[]> = {};
    for (const c of visibleComments) {
      if (c.parentId) {
        if (!map[c.parentId]) map[c.parentId] = [];
        map[c.parentId].push(c);
      } else {
        top.push(c);
      }
    }
    return { topLevel: top, repliesMap: map };
  }, [visibleComments]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (userProfile.isBlocked) {
      setError('Hesabınız bloklanıb. Rəy yaza bilməzsiniz.');
      return;
    }
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setError(null);
    try {
      if (!userProfile.isGuest && userProfile.uid) {
        try {
          const freshSnap = await getDocFromServer(doc(db, 'people', userProfile.uid));
          if (freshSnap.exists() && isAccountBlockedFromDoc(freshSnap.data() as Record<string, unknown>)) {
            setError('Hesabınız bloklanıb. Rəy yaza bilməzsiniz.');
            setSending(false);
            return;
          }
        } catch {
          // Fallback to userProfile.isBlocked
        }
      }
      const commentsRef = collection(db, 'posts', post.id, 'comments');
      await addDoc(commentsRef, {
        postId: post.id,
        userId: userProfile.uid,
        username: userProfile.username,
        authorPhotoURL: userProfile.isGuest ? '' : userProfile.photoURL || '',
        text: trimmed,
        parentId: replyingTo ? replyingTo.id : null,
        createdAt: serverTimestamp(),
        createdAtMs: Date.now(),
      });

      try {
        await updateDoc(doc(db, 'posts', post.id), {
          commentsCount: increment(1),
        });
      } catch {
        // If post doc rules only allow specific updates, subcollection comment still succeeds
      }

      setText('');
      setReplyingTo(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `posts/${post.id}/comments`);
      setError('Rəy göndərilə bilmədi. Yenidən cəhd edin.');
    } finally {
      setSending(false);
    }
  };

  const formatTime = (ms: number) => {
    const diffSec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
    if (diffSec < 60) return 'indi';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} dəq`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr} saat`;
    const diffDay = Math.floor(diffHr / 24);
    return `${diffDay} gün`;
  };

  const totalDisplayed = visibleComments.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 sm:items-center sm:justify-end"
      onClick={onClose}
    >
      <div
        className="flex h-[74vh] w-full flex-col rounded-t-3xl border-t border-white/15 bg-[#121218] text-white shadow-2xl sm:h-full sm:max-w-md sm:rounded-none sm:border-t-0 sm:border-l"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag Handle (mobile) */}
        <div className="mx-auto mt-3 h-1.5 w-10 rounded-full bg-white/20 sm:hidden" />

        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-white" style={{ fontFamily: 'var(--font-display)' }}>
              Rəylər
            </h2>
            <span className="font-mono text-xs tabular-nums text-zinc-400">
              {totalDisplayed}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Rəyləri bağla"
            className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Comments List */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {loading ? (
            <div className="py-12 text-center text-sm text-zinc-400">Rəylər yüklənir...</div>
          ) : topLevel.length === 0 ? (
            <div className="py-14 text-center">
              <p className="text-sm font-medium text-zinc-300">Hələ rəy yazılmayıb</p>
              <p className="mt-1 text-xs text-zinc-500">İlk rəyi siz yazın.</p>
            </div>
          ) : (
            topLevel.map((comment) => {
              const replies = repliesMap[comment.id] || [];
              return (
                <div key={comment.id} className="space-y-3">
                  <div className="flex items-start gap-3">
                    <UserAvatar
                      photoURL={resolveCommentPhoto(comment)}
                      name={comment.username}
                      sizeClass="h-8 w-8"
                      textClass="text-xs"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-semibold text-zinc-200">@{comment.username}</span>
                        <span className="text-zinc-500">·</span>
                        <span className="text-zinc-500">{formatTime(comment.createdAtMs)}</span>
                      </div>
                      <p className="mt-1 text-sm leading-relaxed text-zinc-100 break-words">
                        {comment.text}
                      </p>
                      {!userProfile.isBlocked && (
                        <button
                          type="button"
                          onClick={() =>
                            setReplyingTo({ id: comment.id, username: comment.username })
                          }
                          className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-zinc-400 hover:text-[#A8001E] transition-colors cursor-pointer"
                        >
                          <CornerDownRight className="h-3 w-3" />
                          <span>Cavabla</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Nested Replies */}
                  {replies.length > 0 && (
                    <div className="ml-9 space-y-3 border-l border-white/10 pl-3.5">
                      {replies.map((reply) => (
                        <div key={reply.id} className="flex items-start gap-2.5">
                          <UserAvatar
                            photoURL={resolveCommentPhoto(reply)}
                            name={reply.username}
                            sizeClass="h-6 w-6"
                            textClass="text-[10px]"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 text-xs">
                              <span className="font-semibold text-zinc-200">@{reply.username}</span>
                              <span className="text-zinc-500">·</span>
                              <span className="text-zinc-500">{formatTime(reply.createdAtMs)}</span>
                            </div>
                            <p className="mt-0.5 text-sm leading-relaxed text-zinc-200 break-words">
                              {reply.text}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Reply Indicator & Composer */}
        <div className="border-t border-white/10 bg-[#0D0D12] p-4">
          {userProfile.isGuest ? (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/15 bg-white/[0.04] px-4 py-2.5">
              <span className="text-xs text-zinc-300">
                Rəy yazmaq üçün Google hesabı ilə daxil olun.
              </span>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onRequireLogin?.();
                }}
                className="shrink-0 rounded-xl bg-[#A8001E] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#C8102E] transition-colors cursor-pointer"
              >
                Daxil ol
              </button>
            </div>
          ) : userProfile.isBlocked ? (
            <div className="flex items-center justify-center gap-2.5 rounded-2xl border border-[#A8001E]/50 bg-[#A8001E]/15 px-4 py-3 text-xs font-semibold text-rose-200">
              <Ban className="h-4 w-4 shrink-0 text-[#E04F67]" />
              <span>Hesabınız bloklanıb. Videolara rəy yaza bilməzsiniz.</span>
            </div>
          ) : (
            <>
              {replyingTo && (
                <div className="mb-2.5 flex items-center justify-between rounded-xl bg-[#A8001E]/15 px-3 py-1.5 text-xs text-rose-200">
                  <span>
                    Cavab yazılır: <strong className="text-white">@{replyingTo.username}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => setReplyingTo(null)}
                    className="text-zinc-300 hover:text-white cursor-pointer"
                    aria-label="Cavabı ləğv et"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {error && (
                <p className="mb-2 text-xs text-rose-400">{error}</p>
              )}

              <form onSubmit={handleSend} className="flex items-center gap-2.5">
                <input
                  type="text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={
                    replyingTo
                      ? `@${replyingTo.username} istifadəçisinə cavab yaz...`
                      : 'Rəy yazın...'
                  }
                  maxLength={400}
                  className="min-h-[44px] flex-1 rounded-2xl border border-white/15 bg-black/50 px-4 text-sm text-white placeholder:text-zinc-500 focus:border-[#A8001E] focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!text.trim() || sending}
                  aria-label="Rəyi göndər"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#A8001E] text-white transition-all hover:bg-[#C8102E] active:scale-95 disabled:opacity-40 cursor-pointer"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
