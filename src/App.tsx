import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  Car,
  ChevronDown,
  ChevronUp,
  Home,
  MessageSquare,
  Music2,
  Search,
  Settings,
} from 'lucide-react';
import {
  auth,
  db,
  handleFirestoreError,
  OperationType,
  testFirestoreConnection,
} from './firebase';
import {
  CategoryFilter,
  MainTab,
  PostItem,
  RegionFilter,
  UserProfile,
  WatchHistoryItem,
} from './types';
import { CaReelsLogo } from './components/CaReelsLogo';
import { ChatView } from './components/ChatView';
import { CommentsSheet } from './components/CommentsSheet';
import { LoginScreen } from './components/LoginScreen';
import {
  matchesCategory,
  matchesRegion,
  SearchOverlay,
} from './components/SearchOverlay';
import { SettingsDrawer } from './components/SettingsDrawer';
import { ShareDownloadSheet } from './components/ShareDownloadSheet';
import { UsernameScreen } from './components/UsernameScreen';
import { VideoCard } from './components/VideoCard';

function parseTimestampMs(val: unknown): number {
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

function normalizeStorageUrl(raw: unknown): string {
  if (!raw) return '';
  if (Array.isArray(raw) && raw.length > 0) {
    return normalizeStorageUrl(raw[0]);
  }
  if (typeof raw === 'object' && raw !== null && 'url' in raw) {
    return normalizeStorageUrl((raw as { url?: unknown }).url);
  }
  if (typeof raw !== 'string') return '';
  let trimmed = raw.trim();
  if (!trimmed) return '';

  // Handle Catbox links with missing scheme or missing "files." subdomain
  if (/^(files\.)?catbox\.moe\//i.test(trimmed)) {
    trimmed = `https://${trimmed}`;
  }
  if (/^http:\/\/(files\.)?catbox\.moe\//i.test(trimmed)) {
    trimmed = trimmed.replace(/^http:\/\//i, 'https://');
  }
  if (/^https:\/\/catbox\.moe\/([^/]+\.[a-z0-9]+)$/i.test(trimmed)) {
    trimmed = trimmed.replace(/^https:\/\/catbox\.moe\//i, 'https://files.catbox.moe/');
  }

  if (trimmed.startsWith('gs://')) {
    const withoutScheme = trimmed.slice(5);
    const slashIdx = withoutScheme.indexOf('/');
    if (slashIdx > 0) {
      const bucket = withoutScheme.slice(0, slashIdx);
      const path = withoutScheme.slice(slashIdx + 1);
      return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media`;
    }
  }
  // Handle bare relative Firebase Storage paths (e.g. "posts/video.mp4" or "videos/clip.mp4")
  if (
    !trimmed.startsWith('http://') &&
    !trimmed.startsWith('https://') &&
    !trimmed.startsWith('data:') &&
    !trimmed.startsWith('blob:') &&
    /\.(mp4|mov|webm|m4v|m3u8)$/i.test(trimmed)
  ) {
    const cleanPath = trimmed.replace(/^\/+/, '');
    return `https://firebasestorage.googleapis.com/v0/b/cartube-65ac6.firebasestorage.app/o/${encodeURIComponent(cleanPath)}?alt=media`;
  }
  return trimmed;
}

function findUrlRecursively(val: unknown): string {
  if (!val) return '';
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (
      trimmed.includes('catbox.moe') ||
      trimmed.startsWith('gs://') ||
      (trimmed.startsWith('http') &&
        (/\.(mp4|mov|webm|m4v|m3u8)(\?|$)/i.test(trimmed) ||
          trimmed.includes('firebasestorage.googleapis.com') ||
          trimmed.includes('firebasestorage.app') ||
          trimmed.includes('youtube.com') ||
          trimmed.includes('youtu.be') ||
          trimmed.includes('drive.google.com') ||
          trimmed.includes('cloudinary.com')))
    ) {
      return normalizeStorageUrl(trimmed);
    }
    return '';
  }
  if (Array.isArray(val)) {
    for (const item of val) {
      const found = findUrlRecursively(item);
      if (found) return found;
    }
  } else if (typeof val === 'object') {
    for (const entry of Object.values(val as Record<string, unknown>)) {
      const found = findUrlRecursively(entry);
      if (found) return found;
    }
  }
  return '';
}

function extractPostVideoUrl(data: Record<string, unknown>): string {
  const candidates = [
    data.catbox,
    data.catboxUrl,
    data.catboxURL,
    data.catbox_url,
    data.catboxLink,
    data.catbox_link,
    data.catboxFile,
    data.videoUrl,
    data.videoURL,
    data.VideoUrl,
    data.video_url,
    data.video,
    data.videos,
    data.url,
    data.URL,
    data.mediaUrl,
    data.media_url,
    data.src,
    data.link,
    data.videoLink,
    data.videoPath,
    data.storagePath,
    data.reelUrl,
    data.clipUrl,
    data.fileUrl,
    data.file,
    data.downloadUrl,
    data.downloadURL,
    data.mp4,
    data.streamUrl,
    data.stream,
    data.media,
  ];
  for (const candidate of candidates) {
    const resolved = normalizeStorageUrl(candidate);
    if (resolved) return resolved;
  }
  // Fallback: recursively scan all fields/nested objects for any Catbox or video URL
  return findUrlRecursively(data);
}

function collectFilterTokens(val: unknown): string[] {
  if (!val) return [];
  if (Array.isArray(val)) {
    return val.flatMap((entry) => collectFilterTokens(entry));
  }
  if (typeof val === 'string') {
    return val
      .split(/[,;|/]+/)
      .map((part) => part.trim())
      .filter(Boolean);
  }
  return [];
}

function extractPostFilters(data: Record<string, unknown>): {
  region: string;
  category: string;
  filters: string[];
  primaryFilter: string;
} {
  const region = String(
    data.region || data.country || data.lang || data.olke || data.dil || ''
  ).trim();

  const explicitFilterTokens = [
    ...collectFilterTokens(data.filtr),
    ...collectFilterTokens(data.filter),
    ...collectFilterTokens(data.filtre),
    ...collectFilterTokens(data.filters),
  ];
  const categoryTokens = [
    ...collectFilterTokens(data.category),
    ...collectFilterTokens(data.kateqoriya),
    ...collectFilterTokens(data.type),
    ...collectFilterTokens(data.group),
    ...collectFilterTokens(data.qrup),
    ...collectFilterTokens(data.tag),
    ...collectFilterTokens(data.tags),
  ];
  const regionTokens = collectFilterTokens(region);

  const seen = new Set<string>();
  const filters: string[] = [];
  for (const token of [...explicitFilterTokens, ...categoryTokens, ...regionTokens]) {
    const key = token.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      filters.push(token);
    }
  }

  const category = String(
    categoryTokens[0] || explicitFilterTokens[0] || ''
  ).trim();

  const primaryFilter =
    explicitFilterTokens[0] ||
    categoryTokens[0] ||
    (region ? region.toUpperCase() : '') ||
    'Digər';

  return { region, category, filters, primaryFilter };
}

export default function App() {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [profileChecked, setProfileChecked] = useState(false);

  const [activeTab, setActiveTab] = useState<MainTab>('feed');

  const [posts, setPosts] = useState<PostItem[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [postsError, setPostsError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(false);

  const [regionFilter, setRegionFilter] = useState<RegionFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');

  const [showSearch, setShowSearch] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [activeCommentsPostId, setActiveCommentsPostId] = useState<string | null>(null);
  const [activeSharePostId, setActiveSharePostId] = useState<string | null>(null);
  const [history, setHistory] = useState<WatchHistoryItem[]>([]);

  const feedRef = useRef<HTMLDivElement | null>(null);
  const shuffleWeightsRef = useRef<Map<string, number>>(new Map());
  const pendingPostIdRef = useRef<string | null>(
    new URLSearchParams(window.location.search).get('post')
  );

  // Boot Firestore connection check
  useEffect(() => {
    testFirestoreConnection();
  }, []);

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      if (!user) {
        setUserProfile(null);
        setAuthLoading(false);
        setProfileChecked(true);
      } else {
        setProfileChecked(false);
      }
    });

    return () => unsub();
  }, []);

  // Real-time Firestore people/{uid} & block status listener
  useEffect(() => {
    if (!authUser) return;

    const personRef = doc(db, 'people', authUser.uid);
    let syncedEmail = false;

    const unsubPerson = onSnapshot(
      personRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          const statusStr = String(data.status || '').trim().toLowerCase();
          const blocked =
            data.isBlocked === true ||
            data.blocked === true ||
            data.isBanned === true ||
            data.banned === true ||
            statusStr === 'blocked' ||
            statusStr === 'banned';

          if (data.username && typeof data.username === 'string') {
            const profile: UserProfile = {
              uid: authUser.uid,
              email: String(data.email || authUser.email || ''),
              username: data.username,
              photoURL: String(data.photoURL || authUser.photoURL || ''),
              isBlocked: blocked,
            };
            setUserProfile(profile);

            if (!syncedEmail) {
              syncedEmail = true;
              setDoc(
                personRef,
                {
                  uid: authUser.uid,
                  email: authUser.email || profile.email,
                  username: profile.username,
                  updatedAt: serverTimestamp(),
                },
                { merge: true }
              ).catch(() => {});
            }
          } else {
            setUserProfile(null);
          }
        } else {
          setUserProfile(null);
        }
        setAuthLoading(false);
        setProfileChecked(true);
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, `people/${authUser.uid}`);
        setUserProfile(null);
        setAuthLoading(false);
        setProfileChecked(true);
      }
    );

    return () => unsubPerson();
  }, [authUser]);

  // Load Watch History from localStorage + Firestore
  useEffect(() => {
    if (!authUser) {
      setHistory([]);
      return;
    }

    const storageKey = `careels_history_${authUser.uid}`;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setHistory(parsed);
        }
      }
    } catch {
      // ignore storage errors
    }

    const histQuery = query(
      collection(db, 'people', authUser.uid, 'history'),
      orderBy('watchedAt', 'desc')
    );
    const unsub = onSnapshot(
      histQuery,
      (snap) => {
        if (snap.empty) return;
        const items: WatchHistoryItem[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            postId: String(data.postId || d.id),
            caption: String(data.caption || ''),
            musicName: String(data.musicName || ''),
            videoUrl: String(data.videoUrl || ''),
            watchedAt: typeof data.watchedAt === 'number' ? data.watchedAt : Date.now(),
          };
        });
        setHistory(items);
        try {
          localStorage.setItem(storageKey, JSON.stringify(items.slice(0, 50)));
        } catch {
          // ignore
        }
      },
      () => {
        // Fallback to localStorage seamlessly
      }
    );

    return () => unsub();
  }, [authUser]);

  // Real-time Firestore posts listener
  useEffect(() => {
    if (!authUser || !userProfile) return;

    setPostsLoading(true);
    setPostsError(null);
    const postsRef = collection(db, 'posts');

    const unsub = onSnapshot(
      postsRef,
      (snapshot) => {
        const mapped: PostItem[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data() as Record<string, unknown>;
          const videoUrl = extractPostVideoUrl(data);
          const posterUrl = normalizeStorageUrl(
            data.posterUrl || data.thumbnail || data.cover || data.poster || data.imageUrl || ''
          );
          const caption = String(
            data.caption || data.description || data.text || data.title || data.altYazi || ''
          );
          const musicName = String(
            data.musicName || data.music || data.song || data.audioName || data.musiqi || ''
          );
          const likedBy = Array.isArray(data.likedBy)
            ? data.likedBy.map((x) => String(x))
            : [];
          const likesCount =
            typeof data.likesCount === 'number'
              ? data.likesCount
              : typeof data.likes === 'number'
                ? data.likes
                : likedBy.length;
          const commentsCount =
            typeof data.commentsCount === 'number'
              ? data.commentsCount
              : typeof data.comments === 'number'
                ? data.comments
                : 0;
          const { region, category, filters, primaryFilter } = extractPostFilters(data);

          return {
            id: docSnap.id,
            videoUrl,
            posterUrl: posterUrl || undefined,
            accountName: 'CaReels',
            caption,
            musicName,
            likesCount: Math.max(0, likesCount),
            commentsCount: Math.max(0, commentsCount),
            likedBy,
            region,
            category,
            filters,
            primaryFilter,
            createdAtMs: parseTimestampMs(data.createdAt),
          };
        });

        for (const item of mapped) {
          if (!shuffleWeightsRef.current.has(item.id)) {
            shuffleWeightsRef.current.set(item.id, Math.random());
          }
        }
        mapped.sort(
          (a, b) =>
            (shuffleWeightsRef.current.get(a.id) ?? 0) -
            (shuffleWeightsRef.current.get(b.id) ?? 0)
        );
        setPosts(mapped);
        setPostsError(null);
        setPostsLoading(false);
      },
      (err) => {
        const info = handleFirestoreError(err, OperationType.LIST, 'posts');
        setPostsError(info.error || 'Videoları yükləmək mümkün olmadı.');
        setPostsLoading(false);
      }
    );

    return () => unsub();
  }, [authUser, userProfile]);

  const dynamicDesktopFilters = useMemo(() => {
    const map = new Map<string, string>();
    const regionSet = new Set(['az', 'tr', 'azerbaijan', 'azərbaycan', 'azerbaycan', 'turkey', 'türkiyə', 'turkiye']);
    for (const p of posts) {
      for (const f of p.filters) {
        const trimmed = f.trim();
        if (!trimmed) continue;
        const lower = trimmed.toLowerCase();
        if (regionSet.has(lower)) continue;
        if (!map.has(lower)) {
          map.set(lower, trimmed);
        }
      }
    }
    if (map.size === 0) {
      return [
        { key: 'musiqi', label: 'Musiqi' },
        { key: 'masin', label: 'Maşın' },
      ];
    }
    return Array.from(map.entries()).map(([key, label]) => ({ key, label }));
  }, [posts]);

  const filteredPosts = useMemo(() => {
    return posts.filter(
      (p) => matchesRegion(p, regionFilter) && matchesCategory(p, categoryFilter)
    );
  }, [posts, regionFilter, categoryFilter]);

  useEffect(() => {
    if (activeIndex >= filteredPosts.length && filteredPosts.length > 0) {
      setActiveIndex(0);
    }
  }, [filteredPosts.length, activeIndex]);

  const scrollToIndex = useCallback(
    (index: number, behavior: ScrollBehavior = 'smooth') => {
      const container = feedRef.current;
      if (!container) return;
      const clamped = Math.max(0, Math.min(index, filteredPosts.length - 1));
      setActiveIndex(clamped);
      container.scrollTo({
        top: clamped * container.clientHeight,
        behavior,
      });
    },
    [filteredPosts.length]
  );

  const handleHomeShuffle = useCallback(() => {
    setActiveTab('feed');
    setPosts((prev) => {
      const next = [...prev];
      for (let i = next.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [next[i], next[j]] = [next[j], next[i]];
      }
      next.forEach((item, idx) => {
        shuffleWeightsRef.current.set(item.id, idx);
      });
      return next;
    });
    setActiveIndex(0);
    setTimeout(() => {
      feedRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    }, 20);
  }, []);

  useEffect(() => {
    const targetId = pendingPostIdRef.current;
    if (!targetId || filteredPosts.length === 0) return;
    const idx = filteredPosts.findIndex((p) => p.id === targetId);
    if (idx !== -1) {
      pendingPostIdRef.current = null;
      setActiveTab('feed');
      scrollToIndex(idx);
    }
  }, [filteredPosts, scrollToIndex]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        activeTab !== 'feed' ||
        showSearch ||
        showSettings ||
        activeCommentsPostId ||
        activeSharePostId
      ) {
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        scrollToIndex(activeIndex + 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        scrollToIndex(activeIndex - 1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    activeTab,
    activeIndex,
    scrollToIndex,
    showSearch,
    showSettings,
    activeCommentsPostId,
    activeSharePostId,
  ]);

  const handleSelectPostById = (postId: string) => {
    setActiveTab('feed');
    let idx = filteredPosts.findIndex((p) => p.id === postId);
    if (idx === -1) {
      setRegionFilter('all');
      setCategoryFilter('all');
      idx = posts.findIndex((p) => p.id === postId);
      if (idx !== -1) {
        setTimeout(() => scrollToIndex(idx), 80);
      }
      return;
    }
    setTimeout(() => scrollToIndex(idx), 40);
  };

  const handleFeedScroll = () => {
    const container = feedRef.current;
    if (!container || container.clientHeight === 0) return;
    const nextIdx = Math.round(container.scrollTop / container.clientHeight);
    if (nextIdx !== activeIndex && nextIdx >= 0 && nextIdx < filteredPosts.length) {
      setActiveIndex(nextIdx);
    }
  };

  const handleToggleLike = async (post: PostItem) => {
    if (!userProfile) return;
    const uid = userProfile.uid;
    const currentlyLiked = post.likedBy.includes(uid);
    const delta = currentlyLiked ? -1 : 1;

    setPosts((prev) =>
      prev.map((p) =>
        p.id === post.id
          ? {
              ...p,
              likesCount: Math.max(0, p.likesCount + delta),
              likedBy: currentlyLiked
                ? p.likedBy.filter((id) => id !== uid)
                : [...p.likedBy, uid],
            }
          : p
      )
    );

    try {
      await updateDoc(doc(db, 'posts', post.id), {
        likesCount: increment(delta),
        likedBy: currentlyLiked ? arrayRemove(uid) : arrayUnion(uid),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `posts/${post.id}`);
    }
  };

  const handleWatched = useCallback(
    (post: PostItem) => {
      if (!authUser) return;
      const entry: WatchHistoryItem = {
        postId: post.id,
        caption: post.caption,
        musicName: post.musicName,
        videoUrl: post.videoUrl,
        watchedAt: Date.now(),
      };

      setHistory((prev) => {
        const filtered = prev.filter((item) => item.postId !== post.id);
        const next = [entry, ...filtered].slice(0, 50);
        try {
          localStorage.setItem(`careels_history_${authUser.uid}`, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });

      setDoc(doc(db, 'people', authUser.uid, 'history', post.id), entry).catch(() => {});
    },
    [authUser]
  );

  const handleClearHistory = () => {
    if (!authUser) return;
    setHistory([]);
    try {
      localStorage.removeItem(`careels_history_${authUser.uid}`);
    } catch {
      // ignore
    }
  };

  const activeCommentsPost = useMemo(
    () => posts.find((p) => p.id === activeCommentsPostId) || null,
    [posts, activeCommentsPostId]
  );

  const activeSharePost = useMemo(
    () => posts.find((p) => p.id === activeSharePostId) || null,
    [posts, activeSharePostId]
  );

  if (authLoading || (authUser && !profileChecked)) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-[#08080B] text-white">
        <CaReelsLogo size={56} className="animate-pulse" />
        <p className="mt-4 text-sm font-medium text-zinc-400">CaReels yüklənir...</p>
      </div>
    );
  }

  if (!authUser) {
    return <LoginScreen />;
  }

  if (!userProfile) {
    return (
      <UsernameScreen
        user={authUser}
        onComplete={(profile) => {
          setUserProfile(profile);
        }}
      />
    );
  }

  const hasActiveFilter = regionFilter !== 'all' || categoryFilter !== 'all';

  return (
    <div className="relative flex h-[100dvh] w-full overflow-hidden bg-[#08080B] text-white">
      {/* Desktop Left Navigation Rail */}
      <aside className="hidden lg:flex lg:w-72 lg:shrink-0 lg:flex-col lg:justify-between lg:border-r lg:border-white/10 lg:bg-[#0B0B0F] lg:p-6">
        <div>
          <div className="flex items-center gap-3">
            <CaReelsLogo size={38} />
            <span
              className="text-xl font-extrabold tracking-tight text-white"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              CaReels
            </span>
          </div>

          <nav className="mt-8 space-y-1.5">
            <button
              type="button"
              onClick={handleHomeShuffle}
              className={`flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3.5 text-sm font-semibold transition-colors cursor-pointer ${
                activeTab === 'feed'
                  ? 'bg-[#A8001E] text-white'
                  : 'text-zinc-300 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Home className="h-4 w-4" />
              <span>Əsas Səhifə</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('chat')}
              className={`flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3.5 text-sm font-semibold transition-colors cursor-pointer ${
                activeTab === 'chat'
                  ? 'bg-[#A8001E] text-white'
                  : 'text-zinc-300 hover:bg-white/5 hover:text-white'
              }`}
            >
              <MessageSquare className="h-4 w-4" />
              <span>Chat</span>
            </button>

            <div className="my-3 border-t border-white/10" />

            <button
              type="button"
              onClick={() => setShowSearch(true)}
              className="flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3.5 text-sm font-semibold text-zinc-300 hover:bg-white/5 hover:text-white transition-colors cursor-pointer"
            >
              <Search className="h-4 w-4" />
              <span>Video Axtarış</span>
            </button>

            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className="flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3.5 text-sm font-semibold text-zinc-300 hover:bg-white/5 hover:text-white transition-colors cursor-pointer"
            >
              <Settings className="h-4 w-4" />
              <span>Ayarlar & Tarixçə</span>
            </button>
          </nav>

          {/* Desktop Quick Video Filters */}
          {activeTab === 'feed' && (
            <div className="mt-7 border-t border-white/10 pt-5 space-y-4">
              <div>
                <p className="mb-2 text-xs font-semibold text-zinc-400">Ölkə / Dil</p>
                <div className="flex items-center gap-1.5 rounded-xl bg-white/5 p-1">
                  {(
                    [
                      { id: 'all', label: 'Hamısı' },
                      { id: 'az', label: 'AZ' },
                      { id: 'tr', label: 'TR' },
                    ] as { id: RegionFilter; label: string }[]
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setRegionFilter(item.id)}
                      className={`flex-1 min-h-[34px] rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                        regionFilter === item.id
                          ? 'bg-[#A8001E] text-white'
                          : 'text-zinc-300 hover:text-white'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold text-zinc-400">Filtrlər</p>
                <div className="flex flex-wrap gap-1.5">
                  {dynamicDesktopFilters.map((item) => {
                    const isActive = categoryFilter.toLowerCase() === item.key;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => setCategoryFilter(isActive ? 'all' : item.key)}
                        className={`flex min-h-[36px] items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-[#A8001E]/25 text-[#E04F67] border border-[#A8001E]/50'
                            : 'bg-white/5 text-zinc-300 hover:bg-white/10'
                        }`}
                      >
                        {item.key === 'musiqi' && <Music2 className="h-3.5 w-3.5" />}
                        {item.key === 'masin' && <Car className="h-3.5 w-3.5" />}
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* User Footer Info */}
        <button
          type="button"
          onClick={() => setShowSettings(true)}
          className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-left hover:bg-white/[0.07] transition-colors cursor-pointer"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#A8001E]/20 text-xs font-bold text-[#E04F67]">
            {userProfile.username.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-white">@{userProfile.username}</div>
            <div className="truncate text-xs text-zinc-400">{userProfile.email}</div>
          </div>
        </button>
      </aside>

      {/* Main Content Stage */}
      <main className="relative flex flex-1 items-center justify-center bg-[#08080B] overflow-hidden">
        {/* TAB 1: Əsas Səhifə (posts kolleksiyası) */}
        {activeTab === 'feed' && (
          <>
            <div
              aria-hidden="true"
              className="pointer-events-none hidden lg:block absolute h-[520px] w-[520px] rounded-full bg-[#A8001E]/15 blur-[150px]"
            />

            <div className="relative h-full w-full lg:h-[92vh] lg:max-h-[860px] lg:w-auto lg:aspect-[9/16] lg:overflow-hidden lg:rounded-3xl lg:border lg:border-white/15 lg:shadow-[0_24px_80px_rgba(0,0,0,0.85)]">
              {/* Top-Left Settings + Large CaReels Wordmark & Top-Right Search */}
              <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center justify-between px-4 pt-4">
                <div className="pointer-events-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowSettings(true)}
                    aria-label="Ayarlar"
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-transparent text-white transition-transform active:scale-90 cursor-pointer"
                  >
                    <Settings className="h-6 w-6 drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)]" />
                  </button>
                  <span
                    className="text-2xl font-extrabold tracking-tight text-[#C8102E] drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)] select-none"
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
                    CaReels
                  </span>
                </div>

                {hasActiveFilter ? (
                  <button
                    type="button"
                    onClick={() => setShowSearch(true)}
                    className="pointer-events-auto flex min-h-[34px] items-center gap-1.5 rounded-full bg-black/55 px-3.5 text-xs font-semibold text-white backdrop-blur-md border border-white/15 cursor-pointer"
                  >
                    {regionFilter !== 'all' && (
                      <span className="text-[#E04F67]">{regionFilter.toUpperCase()}</span>
                    )}
                    {regionFilter !== 'all' && categoryFilter !== 'all' && (
                      <span className="text-zinc-400">·</span>
                    )}
                    {categoryFilter !== 'all' && (
                      <span>
                        {categoryFilter === 'musiqi'
                          ? 'Musiqi'
                          : categoryFilter === 'masin'
                            ? 'Maşın'
                            : categoryFilter}
                      </span>
                    )}
                  </button>
                ) : (
                  <div />
                )}

                <button
                  type="button"
                  onClick={() => setShowSearch(true)}
                  aria-label="Axtarış"
                  className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-transparent text-white transition-transform active:scale-90 cursor-pointer"
                >
                  <Search className="h-6 w-6 drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)]" />
                </button>
              </div>

              {postsLoading ? (
                <div className="flex h-full w-full flex-col items-center justify-center bg-[#0C0C10] px-6 text-center">
                  <CaReelsLogo size={52} className="animate-pulse" />
                  <p className="mt-4 text-sm font-medium text-zinc-400">
                    Videolar yüklənir...
                  </p>
                </div>
              ) : postsError ? (
                <div className="flex h-full w-full flex-col items-center justify-center bg-[#0C0C10] px-8 text-center">
                  <CaReelsLogo size={54} />
                  <h2
                    className="mt-5 text-xl font-bold text-white"
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
                    Videolar oxuna bilmədi
                  </h2>
                  <p className="mt-2 max-w-xs text-xs text-rose-300 break-words">
                    {postsError}
                  </p>
                </div>
              ) : filteredPosts.length === 0 ? (
                <div className="flex h-full w-full flex-col items-center justify-center bg-[#0C0C10] px-8 text-center">
                  <CaReelsLogo size={54} />
                  <h2
                    className="mt-5 text-xl font-bold text-white"
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
                    {posts.length === 0
                      ? 'Hələ video paylaşılmayıb'
                      : 'Bu filtrə uyğun video tapılmadı'}
                  </h2>
                  <p className="mt-2 max-w-xs text-sm text-zinc-400">
                    {posts.length === 0
                      ? 'Firestore "posts" kolleksiyasına yeni video əlavə edildikdə burada avtomatik görünəcək.'
                      : 'Seçilmiş AZ / TR və ya Musiqi / Maşın filtrinə uyğun nəticə yoxdur.'}
                  </p>
                  {hasActiveFilter && (
                    <button
                      type="button"
                      onClick={() => {
                        setRegionFilter('all');
                        setCategoryFilter('all');
                      }}
                      className="mt-5 min-h-[44px] rounded-2xl bg-[#A8001E] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#C8102E] transition-colors cursor-pointer"
                    >
                      Filtrləri sıfırla
                    </button>
                  )}
                </div>
              ) : (
                <div
                  ref={feedRef}
                  onScroll={handleFeedScroll}
                  className="no-scrollbar h-full w-full snap-y snap-mandatory overflow-y-scroll"
                >
                  {filteredPosts.map((post, idx) => (
                    <VideoCard
                      key={post.id}
                      post={post}
                      isActive={idx === activeIndex && activeTab === 'feed'}
                      isLiked={post.likedBy.includes(userProfile.uid)}
                      isMuted={isMuted}
                      onUnlockAudio={() => setIsMuted(false)}
                      onToggleMute={() => setIsMuted((m) => !m)}
                      onToggleLike={handleToggleLike}
                      onOpenComments={(p) => setActiveCommentsPostId(p.id)}
                      onOpenShareMenu={(p) => setActiveSharePostId(p.id)}
                      onWatched={handleWatched}
                    />
                  ))}
                </div>
              )}
            </div>

            {filteredPosts.length > 1 && (
              <div className="hidden lg:flex lg:flex-col lg:gap-3 lg:ml-6">
                <button
                  type="button"
                  onClick={() => scrollToIndex(activeIndex - 1)}
                  disabled={activeIndex === 0}
                  aria-label="Əvvəlki video"
                  className="flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white hover:bg-[#A8001E] hover:border-[#A8001E] transition-colors disabled:opacity-30 cursor-pointer"
                >
                  <ChevronUp className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => scrollToIndex(activeIndex + 1)}
                  disabled={activeIndex >= filteredPosts.length - 1}
                  aria-label="Növbəti video"
                  className="flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white hover:bg-[#A8001E] hover:border-[#A8001E] transition-colors disabled:opacity-30 cursor-pointer"
                >
                  <ChevronDown className="h-5 w-5" />
                </button>
              </div>
            )}
          </>
        )}

        {/* TAB 2: Chat (chats kolleksiyası) */}
        {activeTab === 'chat' && <ChatView userProfile={userProfile} />}

        {/* FLOATING CENTERED SLIM OVAL BOTTOM PANEL: [Home Icon] - [Red Flame Logo Dead Center] - [Chat Icon] */}
        <nav
          aria-label="Əsas naviqasiya"
          className="fixed bottom-3 left-1/2 z-40 -translate-x-1/2 lg:left-[calc(50%+9rem)]"
        >
          <div className="grid w-[236px] grid-cols-3 items-center rounded-full border border-[#A8001E]/45 bg-[#0F0F14]/90 px-2 py-1 shadow-[0_10px_28px_rgba(0,0,0,0.82)] backdrop-blur-xl">
            {/* Left: Home Icon (shuffles videos & shows video feed) */}
            <div className="flex justify-center">
              <button
                type="button"
                onClick={handleHomeShuffle}
                aria-label="Əsas səhifə"
                className={`flex h-9 w-14 items-center justify-center rounded-full transition-all cursor-pointer ${
                  activeTab === 'feed'
                    ? 'bg-[#A8001E] text-white shadow-[0_3px_10px_rgba(168,0,30,0.45)]'
                    : 'text-zinc-300 hover:text-white hover:bg-white/5'
                }`}
              >
                <Home className="h-4 w-4 shrink-0" />
              </button>
            </div>

            {/* Dead Center: Pure Red Flame Logo (no red circle/box background) */}
            <div className="flex justify-center">
              <button
                type="button"
                onClick={handleHomeShuffle}
                aria-label="CaReels"
                className="flex h-9 w-9 items-center justify-center bg-transparent transition-transform active:scale-90 cursor-pointer"
              >
                <CaReelsLogo size={28} variant="bare" />
              </button>
            </div>

            {/* Right: Chat Icon */}
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => setActiveTab('chat')}
                aria-label="Chat"
                className={`flex h-9 w-14 items-center justify-center rounded-full transition-all cursor-pointer ${
                  activeTab === 'chat'
                    ? 'bg-[#A8001E] text-white shadow-[0_3px_10px_rgba(168,0,30,0.45)]'
                    : 'text-zinc-300 hover:text-white hover:bg-white/5'
                }`}
              >
                <MessageSquare className="h-4 w-4 shrink-0" />
              </button>
            </div>
          </div>
        </nav>
      </main>

      {/* Search & Filter Full Overlay */}
      {showSearch && (
        <SearchOverlay
          posts={posts}
          initialRegion={regionFilter}
          initialCategory={categoryFilter}
          onApplyFilters={(reg, cat) => {
            setRegionFilter(reg);
            setCategoryFilter(cat);
          }}
          onSelectPost={handleSelectPostById}
          onClose={() => setShowSearch(false)}
        />
      )}

      {/* Settings & Watch History Drawer */}
      {showSettings && (
        <SettingsDrawer
          userProfile={userProfile}
          history={history}
          onUpdateProfile={(updated) => setUserProfile(updated)}
          onSelectHistoryPost={handleSelectPostById}
          onClearHistory={handleClearHistory}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* Real-time Comments & Replies Sheet */}
      {activeCommentsPost && (
        <CommentsSheet
          post={activeCommentsPost}
          userProfile={userProfile}
          onClose={() => setActiveCommentsPostId(null)}
        />
      )}

      {/* WhatsApp Share & Gallery Download Sheet */}
      {activeSharePost && (
        <ShareDownloadSheet
          post={activeSharePost}
          onClose={() => setActiveSharePostId(null)}
        />
      )}
    </div>
  );
}
