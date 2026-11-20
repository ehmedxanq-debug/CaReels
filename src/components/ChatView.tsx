import React, { useEffect, useRef, useState } from 'react';
import {
  addDoc,
  collection,
  doc,
  getDocFromServer,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { Ban, Crown, MessageSquare, Send, ShieldCheck } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { ChatMessage, UserProfile } from '../types';
import { isAccountBlockedFromDoc } from '../utils/accountStorage';
import { CaReelsLogo } from './CaReelsLogo';
import { UserAvatar } from './UserAvatar';

interface ChatViewProps {
  userProfile: UserProfile;
  onRequireLogin?: () => void;
}

interface PersonLookup {
  username?: string;
  photoURL?: string;
  isAdmin?: boolean;
}

function parseChatTimestamp(val: unknown): number {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const parsed = Date.parse(val);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (typeof val === 'object' && val !== null) {
    const obj = val as { toMillis?: () => number; seconds?: number };
    if (typeof obj.toMillis === 'function') {
      try {
        return obj.toMillis();
      } catch {
        return 0;
      }
    }
    if (typeof obj.seconds === 'number') {
      return obj.seconds * 1000;
    }
  }
  return 0;
}

export const ChatView: React.FC<ChatViewProps> = ({ userProfile, onRequireLogin }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [peopleMap, setPeopleMap] = useState<Record<string, PersonLookup>>({});
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Optional live lookup from people collection to enrich usernames & admin roles
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'people'),
      (snap) => {
        const map: Record<string, PersonLookup> = {};
        snap.docs.forEach((d) => {
          const data = d.data() as Record<string, unknown>;
          const roleStr = String(data.role || '').toLowerCase();
          const rawPhoto =
            data.photoURL || data.avatarUrl || data.avatar || data.picture || data.photo || '';
          map[d.id] = {
            username: data.username ? String(data.username) : undefined,
            photoURL: rawPhoto ? String(rawPhoto).trim() : undefined,
            isAdmin: data.isAdmin === true || roleStr === 'admin',
          };
        });
        setPeopleMap(map);
      },
      () => {
        // Ignore if rules restrict listing people
      }
    );
    return () => unsub();
  }, []);

  // Real-time listener on Firestore chats collection
  useEffect(() => {
    const peopleByUsername: Record<string, PersonLookup> = {};
    for (const person of Object.values(peopleMap)) {
      const key = (person.username || '').replace(/^@+/, '').trim().toLowerCase();
      if (key && !peopleByUsername[key]) {
        peopleByUsername[key] = person;
      }
    }

    const chatsRef = collection(db, 'chats');
    const unsub = onSnapshot(
      chatsRef,
      (snapshot) => {
        const list: ChatMessage[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data() as Record<string, unknown>;
          const uid = String(data.userId || data.uid || data.senderId || '');
          const personInfo = uid ? peopleMap[uid] : undefined;

          const rawRole = String(
            data.role || data.senderRole || data.userRole || data.type || data.from || ''
          )
            .trim()
            .toLowerCase();

          const rawUsername = String(
            data.username ||
              data.userName ||
              data.senderName ||
              data.sender ||
              data.author ||
              data.name ||
              personInfo?.username ||
              ''
          ).trim();

          const nameLookup = rawUsername
            ? peopleByUsername[rawUsername.replace(/^@+/, '').toLowerCase()]
            : undefined;

          const isAdmin =
            data.isAdmin === true ||
            data.admin === true ||
            rawRole === 'admin' ||
            rawUsername.toLowerCase() === 'admin' ||
            uid.toLowerCase() === 'admin' ||
            Boolean(personInfo?.isAdmin);

          const displayUsername = rawUsername || (isAdmin ? 'Admin' : 'istifadəçi');

          const embeddedPhoto = String(
            data.photoURL || data.authorPhotoURL || data.avatarUrl || ''
          ).trim();
          const authorPhotoURL =
            personInfo?.photoURL ||
            nameLookup?.photoURL ||
            (uid && uid === userProfile.uid ? userProfile.photoURL : undefined) ||
            embeddedPhoto ||
            undefined;

          const messageText = String(
            data.text ||
              data.message ||
              data.msg ||
              data.content ||
              data.body ||
              data.mesaj ||
              data.yazi ||
              ''
          );

          const createdAtMs =
            parseChatTimestamp(data.createdAt) ||
            parseChatTimestamp(data.timestamp) ||
            parseChatTimestamp(data.createdAtMs) ||
            parseChatTimestamp(data.time) ||
            0;

          return {
            id: docSnap.id,
            userId: uid,
            username: displayUsername,
            authorPhotoURL,
            text: messageText,
            isAdmin,
            createdAtMs,
          };
        });

        list.sort((a, b) => a.createdAtMs - b.createdAtMs);
        setMessages(list);
        setLoading(false);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'chats');
        setLoading(false);
      }
    );

    return () => unsub();
  }, [peopleMap, userProfile.uid, userProfile.photoURL]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (userProfile.isBlocked) {
      setError('Hesabınız bloklanıb. Mesaj yaza bilməzsiniz.');
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
            setError('Hesabınız bloklanıb. Mesaj yaza bilməzsiniz.');
            setSending(false);
            return;
          }
        } catch {
          // Fallback to userProfile.isBlocked
        }
      }
      await addDoc(collection(db, 'chats'), {
        uid: userProfile.uid,
        userId: userProfile.uid,
        username: userProfile.username,
        photoURL: userProfile.isGuest ? '' : userProfile.photoURL || '',
        email: userProfile.email,
        text: trimmed,
        isAdmin: false,
        role: 'user',
        createdAt: serverTimestamp(),
        createdAtMs: Date.now(),
      });
      setText('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'chats');
      setError('Mesaj göndərilə bilmədi. Yenidən yoxlayın.');
    } finally {
      setSending(false);
    }
  };

  const formatTime = (ms: number) => {
    if (!ms) return '';
    try {
      return new Intl.DateTimeFormat('az-AZ', {
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(ms));
    } catch {
      return '';
    }
  };

  return (
    <div className="flex h-full w-full flex-col bg-[#08080B] text-white">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-white/10 bg-[#0D0D12]/90 px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-3.5 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <CaReelsLogo size={34} />
          <div>
            <h1 className="text-lg font-bold leading-tight" style={{ fontFamily: 'var(--font-display)' }}>
              CaReels Chat
            </h1>
            <p className="text-xs text-zinc-400">Canlı icma söhbəti</p>
          </div>
        </div>
        <div className="text-xs font-mono tabular-nums text-zinc-400">
          {messages.length} mesaj
        </div>
      </header>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4">
        {loading ? (
          <div className="py-16 text-center text-sm text-zinc-400">
            Söhbət yüklənir...
          </div>
        ) : messages.length === 0 ? (
          <div className="mx-auto mt-12 max-w-sm rounded-3xl border border-white/10 bg-[#101015] p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#A8001E]/20 text-[#C8102E]">
              <MessageSquare className="h-6 w-6" />
            </div>
            <h2 className="mt-4 text-base font-bold text-white" style={{ fontFamily: 'var(--font-display)' }}>
              Hələ mesaj yoxdur
            </h2>
            <p className="mt-1.5 text-xs text-zinc-400">
              İlk mesajı yazaraq söhbəti başladın.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isOwn = msg.userId === userProfile.uid && !msg.isAdmin;

            // Distinct Admin Message Card
            if (msg.isAdmin) {
              return (
                <div key={msg.id} className="flex items-start gap-2.5">
                  {msg.authorPhotoURL ? (
                    <UserAvatar
                      photoURL={msg.authorPhotoURL}
                      name={msg.username}
                      sizeClass="mt-1 h-8 w-8 ring-1 ring-amber-400/50"
                      textClass="text-[11px]"
                    />
                  ) : (
                    <CaReelsLogo
                      variant="flame"
                      size={32}
                      className="mt-1 h-8 w-8 shrink-0 rounded-full ring-1 ring-amber-400/50"
                    />
                  )}
                  <div className="flex min-w-0 flex-1 flex-col items-start">
                    {/* Username + Admin Label clearly shown above the message */}
                    <div className="mb-1.5 flex items-center gap-2 px-1 text-xs">
                      <Crown className="h-3.5 w-3.5 text-amber-400" />
                      <span className="font-bold text-amber-300">
                        @{msg.username}
                      </span>
                      <span className="text-zinc-500">·</span>
                      <span className="inline-flex items-center gap-1 font-bold tracking-wide text-[#FF6B81]">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        ADMIN
                      </span>
                      {msg.createdAtMs > 0 && (
                        <>
                          <span className="text-zinc-500">·</span>
                          <span className="font-mono text-[11px] tabular-nums text-zinc-400">
                            {formatTime(msg.createdAtMs)}
                          </span>
                        </>
                      )}
                    </div>

                    <div className="max-w-[88%] sm:max-w-[74%] rounded-2xl rounded-tl-sm border border-amber-400/50 bg-gradient-to-br from-[#5A0010] via-[#3A000B] to-[#1D0409] px-4 py-3 text-sm font-medium leading-relaxed text-amber-50 shadow-[0_10px_30px_rgba(168,0,30,0.4)] break-words">
                      {msg.text}
                    </div>
                  </div>
                </div>
              );
            }

            // Standard User Message (Avatar + Username clearly shown)
            return (
              <div
                key={msg.id}
                className={`flex items-start gap-2.5 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}
              >
                <UserAvatar
                  photoURL={msg.authorPhotoURL}
                  name={msg.username}
                  sizeClass="mt-1 h-8 w-8 ring-1 ring-white/15"
                  textClass="text-[11px]"
                />
                <div className={`flex min-w-0 flex-1 flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
                  <div className="mb-1 flex items-center gap-2 px-1 text-xs text-zinc-400">
                    <span
                      className={
                        isOwn
                          ? 'font-bold text-[#E04F67]'
                          : 'font-bold text-zinc-200'
                      }
                    >
                      @{msg.username}
                    </span>
                    {msg.createdAtMs > 0 && (
                      <>
                        <span>·</span>
                        <span className="font-mono text-[11px] tabular-nums">
                          {formatTime(msg.createdAtMs)}
                        </span>
                      </>
                    )}
                  </div>

                  <div
                    className={`max-w-[82%] sm:max-w-[68%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed break-words ${
                      isOwn
                        ? 'rounded-tr-sm bg-[#8B0018] text-white shadow-[0_6px_20px_rgba(139,0,24,0.35)]'
                        : 'rounded-tl-sm border border-white/10 bg-[#14141B] text-zinc-100'
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer lifted safely above the floating oval bottom navigation panel */}
      <div className="border-t border-white/10 bg-[#0C0C11]/95 px-4 pt-3 pb-[calc(4.75rem+env(safe-area-inset-bottom))] backdrop-blur-xl">
        {userProfile.isGuest ? (
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 rounded-2xl border border-white/15 bg-white/[0.04] px-4 py-2.5">
            <span className="text-xs text-zinc-300">
              Mesaj yazmaq üçün Google hesabı ilə daxil olun.
            </span>
            <button
              type="button"
              onClick={() => onRequireLogin?.()}
              className="shrink-0 rounded-xl bg-[#A8001E] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#C8102E] transition-colors cursor-pointer"
            >
              Daxil ol
            </button>
          </div>
        ) : userProfile.isBlocked ? (
          <div className="mx-auto flex max-w-3xl items-center justify-center gap-2.5 rounded-2xl border border-[#A8001E]/50 bg-[#A8001E]/15 px-4 py-3 text-xs font-semibold text-rose-200">
            <Ban className="h-4 w-4 shrink-0 text-[#E04F67]" />
            <span>Hesabınız bloklanıb. Chata mesaj yaza bilməzsiniz.</span>
          </div>
        ) : (
          <>
            {error && <p className="mb-2 text-xs text-rose-400">{error}</p>}
            <form onSubmit={handleSend} className="mx-auto flex max-w-3xl items-center gap-2.5">
              <input
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Mesaj yazın..."
                maxLength={500}
                className="min-h-[46px] flex-1 rounded-2xl border border-white/15 bg-black/60 px-4 text-sm text-white placeholder:text-zinc-500 focus:border-[#A8001E] focus:outline-none"
              />
              <button
                type="submit"
                disabled={!text.trim() || sending}
                aria-label="Mesaj göndər"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#A8001E] text-white shadow-[0_6px_18px_rgba(168,0,30,0.4)] hover:bg-[#C8102E] active:scale-95 transition-all disabled:opacity-40 cursor-pointer"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};
