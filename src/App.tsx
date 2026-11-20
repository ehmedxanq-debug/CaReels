import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  Car,
  ChevronDown,
  ChevronUp,
  Home,
  MessageSquare,
  Music2,
  Plus,
  Search,
  Settings,
  User as UserIcon,
} from 'lucide-react';
import {
  auth,
  db,
  getStorageBucketHost,
  handleFirestoreError,
  OperationType,
  testFirestoreConnection,
} from './firebase';
import {
  CategoryFilter,
  MainTab,
  PostItem,
  PublicPersonProfile,
  RegionFilter,
  UserProfile,
  WatchHistoryItem,
} from './types';
import { CaReelsLogo } from './components/CaReelsLogo';
import { CarsLookupView } from './components/CarsLookupView';
import { ChatView } from './components/ChatView';
import { CommentsSheet } from './components/CommentsSheet';
import { CreatorProfileSheet } from './components/CreatorProfileSheet';
import { LoginScreen } from './components/LoginScreen';
import { ProfileView } from './components/ProfileView';
import {
  matchesCategory,
  matchesRegion,
  SearchOverlay,
} from './components/SearchOverlay';
import { SettingsDrawer } from './components/SettingsDrawer';
import { ShareDownloadSheet } from './components/ShareDownloadSheet';
import { UploadVideoSheet } from './components/UploadVideoSheet';
import { UserAvatar } from './components/UserAvatar';
import { UsernameScreen } from './components/UsernameScreen';
import { VideoCard } from './components/VideoCard';
import {
  clearSavedRegisteredAccount,
  isAccountBlockedFromDoc,
  loadSavedProfileByUid,
  loadSavedRegisteredProfile,
  saveRegisteredProfile,
} from './utils/accountStorage';
import {
  hasNativeAdMobBridge,
  preloadFeedInterstitialAd,
  showFeedInterstitialAd,
} from './utils/admob';
import {
  isSystemOrProtectedUid,
  isUidKnownDeleted,
  markUidVerifiedExists,
  purgeAccountContentFromFirestore,
  verifyAndPurgeIfAccountDeleted,
} from './utils/accountCleanup';

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
    return `https://firebasestorage.googleapis.com/v0/b/${getStorageBucketHost()}/o/${encodeURIComponent(cleanPath)}?alt=media`;
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

const GUEST_MODE_KEY = 'careels_guest_mode_v1';
const RECENT_SEEN_KEY_PREFIX = 'careels_recent_seen_v2_';

function getRecentSeenStorageKey(accountScope: string): string {
  return `${RECENT_SEEN_KEY_PREFIX}${accountScope || 'anon'}`;
}

function readRecentSeenMap(accountScope: string): Record<string, number> {
  const clean: Record<string, number> = {};
  try {
    const raw = localStorage.getItem(getRecentSeenStorageKey(accountScope));
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object') {
        for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
          if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
            clean[k] = v;
          }
        }
      }
    }
    // Seed from existing per-account local history if available
    const histRaw = localStorage.getItem(`careels_history_${accountScope}`);
    if (histRaw) {
      const histParsed = JSON.parse(histRaw) as unknown;
      if (Array.isArray(histParsed)) {
        for (const item of histParsed) {
          if (
            item &&
            typeof item === 'object' &&
            typeof (item as WatchHistoryItem).postId === 'string' &&
            typeof (item as WatchHistoryItem).watchedAt === 'number'
          ) {
            const pid = (item as WatchHistoryItem).postId;
            const wat = (item as WatchHistoryItem).watchedAt;
            if (pid && wat > (clean[pid] || 0)) {
              clean[pid] = wat;
            }
          }
        }
      }
    }
  } catch {
    // ignore storage errors
  }
  return clean;
}

function persistRecentSeenMap(accountScope: string, map: Record<string, number>) {
  try {
    localStorage.setItem(getRecentSeenStorageKey(accountScope), JSON.stringify(map));
  } catch {
    // ignore quota errors
  }
}

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export default function App() {
  const [isGuest, setIsGuest] = useState<boolean>(() => {
    try {
      return localStorage.getItem(GUEST_MODE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [userProfile, setUserProfile] = useState<UserProfile | null>(() => {
    try {
      if (localStorage.getItem(GUEST_MODE_KEY) === '1') return null;
    } catch {
      // ignore
    }
    return loadSavedRegisteredProfile();
  });
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(() => {
    try {
      if (localStorage.getItem(GUEST_MODE_KEY) === '1') return false;
    } catch {
      // ignore
    }
    return loadSavedRegisteredProfile() === null;
  });
  const [profileChecked, setProfileChecked] = useState<boolean>(() => loadSavedRegisteredProfile() !== null);
  const [guestPrompt, setGuestPrompt] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<MainTab>('feed');

  const [posts, setPosts] = useState<PostItem[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [postsError, setPostsError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(true);

  const [regionFilter, setRegionFilter] = useState<RegionFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');

  const [showSearch, setShowSearch] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [activeCommentsPostId, setActiveCommentsPostId] = useState<string | null>(null);
  const [activeSharePostId, setActiveSharePostId] = useState<string | null>(null);
  const [activeCreatorKey, setActiveCreatorKey] = useState<{
    uid?: string;
    username?: string;
    accountName?: string;
  } | null>(null);
  const [peopleDirectory, setPeopleDirectory] = useState<Record<string, PublicPersonProfile>>({});
  const [peopleDirectoryReady, setPeopleDirectoryReady] = useState(false);
  const [deletedUids, setDeletedUids] = useState<Record<string, true>>({});
  const [subFollowersMap, setSubFollowersMap] = useState<Record<string, string[]>>({});
  const [followPending, setFollowPending] = useState(false);
  const [history, setHistory] = useState<WatchHistoryItem[]>([]);

  const initialAccountScope = useMemo(() => {
    if (isGuest) return 'guest';
    if (userProfile?.uid && !userProfile.isGuest) return userProfile.uid;
    return 'anon';
  }, [isGuest, userProfile?.uid, userProfile?.isGuest]);

  const [feedCycles, setFeedCycles] = useState<Array<{ cycleId: number; postIds: string[] }>>([]);
  const [activeVideoReady, setActiveVideoReady] = useState(false);
  const [adOverlayActive, setAdOverlayActive] = useState(false);
  const feedRef = useRef<HTMLDivElement | null>(null);
  const warmedUrlsRef = useRef<Set<string>>(new Set());
  const postsRef = useRef<PostItem[]>([]);
  postsRef.current = posts;
  const activeIndexRef = useRef(0);
  activeIndexRef.current = activeIndex;
  const activeVideoReadyRef = useRef(false);
  activeVideoReadyRef.current = activeVideoReady;
  const swipesSinceLastAdRef = useRef(0);
  const nextInterstitialTargetRef = useRef(7 + Math.floor(Math.random() * 2));
  const lastCountedFeedKeyRef = useRef<string | null>(null);
  const interstitialInFlightRef = useRef(false);
  const scrollSettleTimerRef = useRef<number | null>(null);
  const shuffleWeightsRef = useRef<Map<string, number>>(new Map());
  const hasMountedFilterEffectRef = useRef(false);
  const recentlySeenMapRef = useRef<Record<string, number>>(readRecentSeenMap(initialAccountScope));
  const sessionStartSeenRef = useRef<Record<string, number>>({ ...recentlySeenMapRef.current });
  const nextCycleIdRef = useRef(1);
  const peopleDirectoryRef = useRef<Record<string, PublicPersonProfile>>({});
  peopleDirectoryRef.current = peopleDirectory;
  const subFollowersMapRef = useRef<Record<string, string[]>>({});
  subFollowersMapRef.current = subFollowersMap;
  const hasAppliedInitialRankRef = useRef(false);
  const hasSyncedHistoryRankRef = useRef(false);
  const likingPostIdsRef = useRef<Set<string>>(new Set());
  const followingLockRef = useRef<Set<string>>(new Set());
  const pendingPostIdRef = useRef<string | null>(
    new URLSearchParams(window.location.search).get('post')
  );

  const buildFollowerCountsMap = useCallback(
    (
      peopleMap: Record<string, PublicPersonProfile>,
      subMap: Record<string, string[]>
    ): Record<string, number> => {
      const sets: Record<string, Set<string>> = {};
      const addFollower = (targetUid: string, followerUid: string) => {
        if (!targetUid || !followerUid || targetUid === followerUid) return;
        if (!sets[targetUid]) sets[targetUid] = new Set<string>();
        sets[targetUid].add(followerUid);
      };
      for (const person of Object.values(peopleMap)) {
        for (const targetUid of person.following) {
          addFollower(targetUid, person.uid);
        }
        for (const followerUid of person.followers) {
          addFollower(person.uid, followerUid);
        }
      }
      for (const [targetUid, subList] of Object.entries(subMap)) {
        for (const followerUid of subList) {
          addFollower(targetUid, followerUid);
        }
      }
      const counts: Record<string, number> = {};
      for (const [uid, set] of Object.entries(sets)) {
        counts[uid] = set.size;
      }
      return counts;
    },
    []
  );

  const computeUnwatchedScore = useCallback(
    (post: PostItem, followerCounts: Record<string, number>, jitter: number): number => {
      const now = Date.now();
      const ageHours =
        post.createdAtMs > 0 ? Math.max(0, (now - post.createdAtMs) / 3600000) : 720;
      const recencyScore =
        post.createdAtMs > 0 ? Math.max(0, 120 - Math.log2(1 + ageHours) * 14) : 10;
      const safeLikes = Math.max(0, post.likesCount);
      const likesScore = Math.log10(1 + safeLikes) * 28 + Math.min(safeLikes, 20) * 0.8;
      const creatorFollowers = post.uid ? (followerCounts[post.uid] ?? 0) : 0;
      const followerScore =
        Math.log10(1 + creatorFollowers) * 24 + Math.min(creatorFollowers, 25) * 0.8;
      return recencyScore + likesScore + followerScore + jitter;
    },
    []
  );

  // Order videos:
  // 1) Any newly uploaded / unwatched video for this account is shown ONCE at the top.
  // 2) Once seen by this account, it loses "new" priority and enters the frequently shuffled watched pool,
  //    stratified from oldest-watched ("çoxdan baxdığı") to most recently watched.
  const orderPostsForFeed = useCallback(
    (
      pool: PostItem[],
      seenMap: Record<string, number>,
      followerCounts: Record<string, number>,
      options?: { tailIds?: string[]; pinnedPostId?: string }
    ): PostItem[] => {
      if (pool.length <= 1) return [...pool];

      const now = Date.now();
      const tailIndexMap = new Map<string, number>();
      if (options?.tailIds) {
        options.tailIds.forEach((id, idx) => {
          tailIndexMap.set(id, idx);
        });
      }

      let pinnedPost: PostItem | null = null;
      const candidates: PostItem[] = [];
      for (const item of pool) {
        if (options?.pinnedPostId && item.id === options.pinnedPostId && !pinnedPost) {
          pinnedPost = item;
        } else {
          candidates.push(item);
        }
      }

      const unwatched: PostItem[] = [];
      const watched: Array<{ post: PostItem; effectiveSeenAt: number }> = [];

      for (const item of candidates) {
        const tailPos = tailIndexMap.get(item.id);
        if (tailPos !== undefined) {
          watched.push({ post: item, effectiveSeenAt: now + tailPos + 1 });
          continue;
        }
        const seenAt = seenMap[item.id] || 0;
        if (seenAt <= 0) {
          unwatched.push(item);
        } else {
          watched.push({ post: item, effectiveSeenAt: seenAt });
        }
      }

      // Unwatched / new videos appear first (each account sees them 1 time before they mix into watched pool)
      const scoredUnwatched = unwatched.map((item) => ({
        post: item,
        score: computeUnwatchedScore(item, followerCounts, Math.random() * 110),
      }));
      scoredUnwatched.sort((a, b) => b.score - a.score);

      // Watched videos sorted from oldest-watched ("çoxdan baxdığı") to most recently watched,
      // then shuffled within age tiers so the order mixes frequently while oldest-watched stay first
      watched.sort((a, b) => a.effectiveSeenAt - b.effectiveSeenAt);

      const shuffledWatched: PostItem[] = [];
      if (watched.length <= 2) {
        shuffledWatched.push(...watched.map((w) => w.post));
      } else {
        const tierCount = watched.length <= 6 ? 2 : 4;
        const tierSize = Math.ceil(watched.length / tierCount);
        for (let start = 0; start < watched.length; start += tierSize) {
          const tierItems = watched.slice(start, start + tierSize).map((w) => w.post);
          shuffleInPlace(tierItems);
          shuffledWatched.push(...tierItems);
        }
      }

      const ordered: PostItem[] = [
        ...(pinnedPost ? [pinnedPost] : []),
        ...scoredUnwatched.map((s) => s.post),
        ...shuffledWatched,
      ];

      // Prevent back-to-back repeat across cycle boundaries
      if (
        !pinnedPost &&
        options?.tailIds &&
        options.tailIds.length > 0 &&
        ordered.length > 1
      ) {
        const lastTailId = options.tailIds[options.tailIds.length - 1];
        if (ordered[0].id === lastTailId) {
          const swapIdx = ordered.findIndex((p) => !tailIndexMap.has(p.id));
          const targetIdx = swapIdx > 0 ? swapIdx : ordered.length - 1;
          [ordered[0], ordered[targetIdx]] = [ordered[targetIdx], ordered[0]];
        }
      }

      return ordered;
    },
    [computeUnwatchedScore]
  );

  const createShuffledCycleIds = useCallback(
    (pool: PostItem[], tailIds: string[]): string[] => {
      if (pool.length === 0) return [];
      const followerCounts = buildFollowerCountsMap(
        peopleDirectoryRef.current,
        subFollowersMapRef.current
      );
      return orderPostsForFeed(pool, recentlySeenMapRef.current, followerCounts, {
        tailIds,
      }).map((p) => p.id);
    },
    [buildFollowerCountsMap, orderPostsForFeed]
  );

  const blessFeedVideos = useCallback(() => {
    const container = feedRef.current;
    if (!container) return;
    const activeVideo = container.querySelector<HTMLVideoElement>(
      'video[data-careels-video="true"][data-active="true"]'
    );
    if (activeVideo) {
      activeVideo.muted = false;
      activeVideo.volume = 1;
      if (activeVideo.paused && activeVideo.readyState >= 2) {
        activeVideo.play().catch(() => {});
      }
    }
  }, []);

  // Boot Firestore connection check
  useEffect(() => {
    testFirestoreConnection();
  }, []);

  // Auth listener with automatic saved-account hydration (no repeated login/registration on return visits)
  useEffect(() => {
    let settled = false;
    const authFallbackTimer = window.setTimeout(() => {
      if (!settled) {
        setAuthLoading(false);
      }
    }, 4500);

    const unsub = onAuthStateChanged(auth, (user) => {
      settled = true;
      window.clearTimeout(authFallbackTimer);
      setAuthUser(user);
      if (!user) {
        const savedProfile = loadSavedRegisteredProfile();
        if (savedProfile && !isGuest) {
          setUserProfile(savedProfile);
        } else if (!isGuest) {
          setUserProfile(null);
        }
        setAuthLoading(false);
        setProfileChecked(true);
      } else if (user.isAnonymous) {
        setIsGuest(true);
        try {
          localStorage.setItem(GUEST_MODE_KEY, '1');
        } catch {
          // ignore
        }
        setUserProfile({
          uid: user.uid,
          email: 'Qonaq rejimi',
          username: 'qonaq',
          isBlocked: false,
          isGuest: true,
        });
        setAuthLoading(false);
        setProfileChecked(true);
      } else {
        setIsGuest(false);
        try {
          localStorage.removeItem(GUEST_MODE_KEY);
        } catch {
          // ignore
        }
        let hydrated = false;
        const cachedForUid =
          loadSavedProfileByUid(user.uid) ||
          (() => {
            const last = loadSavedRegisteredProfile();
            return last && last.uid === user.uid ? last : null;
          })();
        if (cachedForUid) {
          setUserProfile(cachedForUid);
          saveRegisteredProfile(cachedForUid);
          setAuthLoading(false);
          setProfileChecked(true);
          hydrated = true;
        }
        if (!hydrated) {
          setProfileChecked(false);
        }
      }
    });

    return () => {
      window.clearTimeout(authFallbackTimer);
      unsub();
    };
  }, [isGuest]);

  const monitoredUid =
    authUser && !authUser.isAnonymous
      ? authUser.uid
      : userProfile && !userProfile.isGuest
        ? userProfile.uid
        : null;

  // Real-time Firestore listener + 1-second server polling for account & block status
  useEffect(() => {
    if (!monitoredUid) return;

    const personRef = doc(db, 'people', monitoredUid);
    let syncedEmail = false;
    let resolved = false;
    let emailLookupDone = false;

    const buildProfileFromDoc = (uid: string, data: Record<string, unknown>): UserProfile | null => {
      if (!data.username || typeof data.username !== 'string') return null;
      const blocked = isAccountBlockedFromDoc(data);
      const following = Array.isArray(data.following)
        ? Array.from(new Set(data.following.map((x) => String(x)).filter(Boolean)))
        : [];
      const followers = Array.isArray(data.followers)
        ? Array.from(new Set(data.followers.map((x) => String(x)).filter(Boolean)))
        : [];
      const rawPhoto =
        data.photoURL || data.avatarUrl || data.avatar || data.picture || data.photo || authUser?.photoURL || '';
      return {
        uid,
        email: String(data.email || authUser?.email || ''),
        username: data.username,
        photoURL: normalizeStorageUrl(rawPhoto),
        bio: typeof data.bio === 'string' ? data.bio : '',
        following,
        followers,
        isBlocked: blocked,
      };
    };

    const syncProfileState = (nextProfile: UserProfile) => {
      setUserProfile((prev) => {
        if (
          prev &&
          prev.uid === nextProfile.uid &&
          prev.username === nextProfile.username &&
          prev.email === nextProfile.email &&
          (prev.photoURL || '') === (nextProfile.photoURL || '') &&
          (prev.bio || '') === (nextProfile.bio || '') &&
          Boolean(prev.isBlocked) === Boolean(nextProfile.isBlocked) &&
          (prev.following || []).join(',') === (nextProfile.following || []).join(',') &&
          (prev.followers || []).join(',') === (nextProfile.followers || []).join(',')
        ) {
          return prev;
        }
        saveRegisteredProfile(nextProfile);
        return nextProfile;
      });
    };

    const applyPersonData = async (
      exists: boolean,
      data?: Record<string, unknown>,
      fromCache = false
    ) => {
      if (exists && data) {
        const nextProfile = buildProfileFromDoc(monitoredUid, data);
        if (nextProfile) {
          syncProfileState(nextProfile);

          if (!syncedEmail && authUser && !authUser.isAnonymous) {
            syncedEmail = true;
            const syncPayload: Record<string, unknown> = {
              uid: monitoredUid,
              email: authUser.email || nextProfile.email,
              username: nextProfile.username,
              updatedAt: serverTimestamp(),
            };
            if (!data.photoURL && nextProfile.photoURL) {
              syncPayload.photoURL = nextProfile.photoURL;
            }
            setDoc(personRef, syncPayload, { merge: true }).catch(() => {});
          }
          setAuthLoading(false);
          setProfileChecked(true);
          return;
        }
      }

      // If no doc found under UID on a fresh login with email, check if email already registered previously
      if (!exists && !fromCache && !emailLookupDone && authUser?.email) {
        emailLookupDone = true;
        try {
          const emailSnap = await getDocs(
            query(collection(db, 'people'), where('email', '==', authUser.email))
          );
          const matchedDoc = emailSnap.docs.find((d) => {
            const raw = d.data() as Record<string, unknown>;
            return typeof raw.username === 'string' && raw.username.trim().length > 0;
          });
          if (matchedDoc) {
            const matchedData = matchedDoc.data() as Record<string, unknown>;
            const restored = buildProfileFromDoc(monitoredUid, matchedData);
            if (restored) {
              await setDoc(
                personRef,
                {
                  uid: monitoredUid,
                  email: authUser.email,
                  username: restored.username,
                  photoURL: restored.photoURL || '',
                  bio: restored.bio || '',
                  isBlocked: Boolean(restored.isBlocked),
                  updatedAt: serverTimestamp(),
                },
                { merge: true }
              ).catch(() => {});
              syncProfileState(restored);
              setAuthLoading(false);
              setProfileChecked(true);
              return;
            }
          }
        } catch {
          // Proceed normally if query is restricted
        }
      }

      // If the server explicitly confirms a previously registered account was deleted from Firebase:
      // automatically delete that account's videos & comments and sign out cleanly
      const existingSaved = loadSavedProfileByUid(monitoredUid);
      const wasPreviouslyRegistered = Boolean(
        existingSaved || (userProfile && userProfile.uid === monitoredUid)
      );

      if (!exists && !fromCache && wasPreviouslyRegistered) {
        void purgeAccountContentFromFirestore(
          monitoredUid,
          postsRef.current.map((p) => p.id)
        );
        setDeletedUids((prev) => (prev[monitoredUid] ? prev : { ...prev, [monitoredUid]: true }));
        setPosts((prev) => prev.filter((p) => p.uid !== monitoredUid));
        clearSavedRegisteredAccount(monitoredUid);
        setUserProfile(null);
        setAuthLoading(false);
        setProfileChecked(true);
        if (auth.currentUser && auth.currentUser.uid === monitoredUid) {
          auth.signOut().catch(() => {});
        }
        return;
      }

      // Keep previously saved profile intact if offline / cached
      if (existingSaved) {
        setUserProfile((prev) => prev || existingSaved);
        setAuthLoading(false);
        setProfileChecked(true);
        return;
      }

      if (!fromCache) {
        setUserProfile(null);
        setAuthLoading(false);
        setProfileChecked(true);
      }
    };

    const profileTimeoutId = window.setTimeout(() => {
      if (resolved) return;
      getDoc(personRef)
        .then((snap) => {
          if (resolved) return;
          resolved = true;
          void applyPersonData(
            snap.exists(),
            snap.data() as Record<string, unknown> | undefined,
            snap.metadata.fromCache
          );
        })
        .catch(() => {
          if (resolved) return;
          resolved = true;
          setAuthLoading(false);
          setProfileChecked(true);
        });
    }, 3500);

    const unsubPerson = onSnapshot(
      personRef,
      (snap) => {
        resolved = true;
        window.clearTimeout(profileTimeoutId);
        void applyPersonData(
          snap.exists(),
          snap.data() as Record<string, unknown> | undefined,
          snap.metadata.fromCache
        );
      },
      (err) => {
        resolved = true;
        window.clearTimeout(profileTimeoutId);
        handleFirestoreError(err, OperationType.GET, `people/${monitoredUid}`);
        const fallbackSaved = loadSavedProfileByUid(monitoredUid);
        setUserProfile((prev) => prev || fallbackSaved);
        setAuthLoading(false);
        setProfileChecked(true);
      }
    );

    // Active 1-second Firebase heartbeat check so block/unblock applies immediately
    let pollInFlight = false;
    const pollIntervalId = window.setInterval(() => {
      if (pollInFlight) return;
      pollInFlight = true;
      getDocFromServer(personRef)
        .then((snap) => {
          if (snap.exists()) {
            markUidVerifiedExists(monitoredUid);
            const data = snap.data() as Record<string, unknown>;
            const nextProfile = buildProfileFromDoc(monitoredUid, data);
            if (nextProfile) {
              syncProfileState(nextProfile);
            } else {
              const blocked = isAccountBlockedFromDoc(data);
              setUserProfile((prev) => {
                if (!prev || Boolean(prev.isBlocked) === blocked) return prev;
                const updated = { ...prev, isBlocked: blocked };
                saveRegisteredProfile(updated);
                return updated;
              });
            }
          } else if (loadSavedProfileByUid(monitoredUid)) {
            // Account deleted from Firebase server -> purge posts & comments and clear session
            void purgeAccountContentFromFirestore(
              monitoredUid,
              postsRef.current.map((p) => p.id)
            );
            setDeletedUids((prev) => (prev[monitoredUid] ? prev : { ...prev, [monitoredUid]: true }));
            setPosts((prev) => prev.filter((p) => p.uid !== monitoredUid));
            clearSavedRegisteredAccount(monitoredUid);
            setUserProfile(null);
            if (auth.currentUser && auth.currentUser.uid === monitoredUid) {
              auth.signOut().catch(() => {});
            }
          }
        })
        .catch(() => {
          // Ignore transient offline errors during 1s heartbeat
        })
        .finally(() => {
          pollInFlight = false;
        });
    }, 1000);

    return () => {
      window.clearTimeout(profileTimeoutId);
      window.clearInterval(pollIntervalId);
      unsubPerson();
    };
  }, [monitoredUid, authUser]);

  const accountSeenScope = monitoredUid || (isGuest ? 'guest' : 'anon');
  const accountSeenScopeRef = useRef(accountSeenScope);
  accountSeenScopeRef.current = accountSeenScope;

  useEffect(() => {
    const scopedMap = readRecentSeenMap(accountSeenScope);
    recentlySeenMapRef.current = scopedMap;
    sessionStartSeenRef.current = { ...scopedMap };
    hasSyncedHistoryRankRef.current = false;
  }, [accountSeenScope]);

  // Load Watch History from localStorage + Firestore (works for both signed-in users and guests)
  useEffect(() => {
    const historyKeyUid = monitoredUid || (isGuest ? 'guest' : null);
    if (!historyKeyUid) {
      setHistory([]);
      return;
    }

    const storageKey = `careels_history_${historyKeyUid}`;
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

    if (!monitoredUid) return;

    const histQuery = query(
      collection(db, 'people', monitoredUid, 'history'),
      orderBy('watchedAt', 'desc')
    );
    const unsub = onSnapshot(
      histQuery,
      (snap) => {
        if (snap.empty) {
          hasSyncedHistoryRankRef.current = true;
          return;
        }
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

        // Sync Firestore per-account watch timestamps into feed seen map
        let changed = false;
        const merged = { ...recentlySeenMapRef.current };
        for (const item of items) {
          if (item.postId && item.watchedAt > (merged[item.postId] || 0)) {
            merged[item.postId] = item.watchedAt;
            changed = true;
          }
        }
        if (changed) {
          recentlySeenMapRef.current = merged;
          persistRecentSeenMap(monitoredUid, merged);
          if (!hasSyncedHistoryRankRef.current && activeIndexRef.current === 0) {
            hasSyncedHistoryRankRef.current = true;
            sessionStartSeenRef.current = { ...merged };
            const followerCounts = buildFollowerCountsMap(
              peopleDirectoryRef.current,
              subFollowersMapRef.current
            );
            setPosts((prev) => {
              if (prev.length <= 1) return prev;
              const pinnedId = prev[0]?.id;
              const ordered = orderPostsForFeed(prev, merged, followerCounts, {
                pinnedPostId: pinnedId,
              });
              shuffleWeightsRef.current.clear();
              ordered.forEach((p, idx) => shuffleWeightsRef.current.set(p.id, idx));
              return ordered;
            });
          }
        }
      },
      () => {
        // Fallback to localStorage seamlessly
      }
    );

    return () => unsub();
  }, [monitoredUid, isGuest, buildFollowerCountsMap, orderPostsForFeed]);

  const hasActiveSession = Boolean(authUser || userProfile || isGuest);

  const markDeletedUid = useCallback((uid: string) => {
    if (!uid) return;
    setDeletedUids((prev) => (prev[uid] ? prev : { ...prev, [uid]: true }));
    setPosts((prev) => prev.filter((p) => p.uid !== uid));
  }, []);

  // Real-time Firestore people directory (avatars, bios, usernames, follower/following graph + deletion watcher)
  useEffect(() => {
    if (!hasActiveSession) return;
    const unsub = onSnapshot(
      collection(db, 'people'),
      (snap) => {
        const next: Record<string, PublicPersonProfile> = {};
        snap.docs.forEach((d) => {
          markUidVerifiedExists(d.id);
          const data = d.data() as Record<string, unknown>;
          const following = Array.isArray(data.following)
            ? Array.from(new Set(data.following.map((x) => String(x)).filter(Boolean)))
            : [];
          const followers = Array.isArray(data.followers)
            ? Array.from(new Set(data.followers.map((x) => String(x)).filter(Boolean)))
            : [];
          const rawPhoto =
            data.photoURL || data.avatarUrl || data.avatar || data.picture || data.photo || '';
          const normalizedPhoto = normalizeStorageUrl(rawPhoto) || undefined;
          next[d.id] = {
            uid: d.id,
            username: String(data.username || ''),
            photoURL: normalizedPhoto,
            bio: typeof data.bio === 'string' ? data.bio : '',
            following,
            followers,
          };
        });
        setPeopleDirectory(next);
        if (!snap.metadata.fromCache && snap.docs.length > 0) {
          setPeopleDirectoryReady(true);
        }

        // Immediately detect any deleted account and purge their posts & comments
        snap.docChanges().forEach((change) => {
          if (change.type === 'removed') {
            const removedUid = change.doc.id;
            const knownPostIds = postsRef.current.map((p) => p.id);
            void verifyAndPurgeIfAccountDeleted(removedUid, knownPostIds).then((wasDeleted) => {
              if (wasDeleted) {
                markDeletedUid(removedUid);
              }
            });
          }
        });
      },
      () => {
        // Gracefully ignore if listing people is restricted
      }
    );
    return () => unsub();
  }, [hasActiveSession, markDeletedUid]);

  // Verify any post whose author UID is missing from peopleDirectory (catches offline account deletions)
  useEffect(() => {
    if (!peopleDirectoryReady || Object.keys(peopleDirectory).length === 0 || posts.length === 0) {
      return;
    }
    const knownPostIds = posts.map((p) => p.id);
    const orphanUids = Array.from(
      new Set(
        posts
          .filter(
            (p) =>
              p.uid &&
              !isSystemOrProtectedUid(p.uid) &&
              !peopleDirectory[p.uid] &&
              !deletedUids[p.uid] &&
              (p.username || '').toLowerCase() !== 'qonaq' &&
              (p.accountName || '').toLowerCase() !== 'careels'
          )
          .map((p) => p.uid as string)
      )
    );
    for (const uid of orphanUids) {
      void verifyAndPurgeIfAccountDeleted(uid, knownPostIds).then((wasDeleted) => {
        if (wasDeleted) {
          markDeletedUid(uid);
        }
      });
    }
  }, [peopleDirectoryReady, peopleDirectory, posts, deletedUids, markDeletedUid]);

  // Listen to current user's subcollection followers if present
  useEffect(() => {
    if (!monitoredUid) return;
    const unsub = onSnapshot(
      collection(db, 'people', monitoredUid, 'followers'),
      (snap) => {
        const ids = snap.docs.map((d) => d.id).filter(Boolean);
        setSubFollowersMap((prev) => ({ ...prev, [monitoredUid]: ids }));
      },
      () => {}
    );
    return () => unsub();
  }, [monitoredUid]);

  // Real-time Firestore posts listener (starts immediately for authUser, restored profile, or guest)
  useEffect(() => {
    if (!hasActiveSession) return;

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
            ? Array.from(new Set(data.likedBy.map((x) => String(x)).filter(Boolean)))
            : [];
          const likesCount =
            typeof data.likesCount === 'number'
              ? Math.max(data.likesCount, likedBy.length)
              : typeof data.likes === 'number'
                ? Math.max(data.likes, likedBy.length)
                : likedBy.length;
          const commentsCount =
            typeof data.commentsCount === 'number'
              ? data.commentsCount
              : typeof data.comments === 'number'
                ? data.comments
                : 0;
          const { region, category, filters, primaryFilter } = extractPostFilters(data);
          const rawUsername = String(
            data.username || data.userName || data.authorUsername || ''
          ).trim();
          const cleanUsername = rawUsername.replace(/^@+/, '');
          const rawAccountName = String(data.accountName || '').trim();
          const resolvedAccountName = cleanUsername
            ? `@${cleanUsername}`
            : rawAccountName && rawAccountName.toLowerCase() !== 'careels'
              ? rawAccountName
              : 'CaReels';

          return {
            id: docSnap.id,
            videoUrl,
            posterUrl: posterUrl || undefined,
            accountName: resolvedAccountName,
            authorPhotoURL:
              normalizeStorageUrl(
                data.authorPhotoURL || data.photoURL || data.avatarUrl || data.authorAvatar
              ) || undefined,
            caption,
            musicName,
            likesCount: Math.max(0, likesCount),
            commentsCount: Math.max(0, commentsCount),
            likedBy,
            region,
            category,
            filters,
            primaryFilter,
            uid: data.uid ? String(data.uid) : undefined,
            username: cleanUsername || undefined,
            createdAtMs: parseTimestampMs(data.createdAt),
          };
        });

        const followerCounts = buildFollowerCountsMap(
          peopleDirectoryRef.current,
          subFollowersMapRef.current
        );

        setPosts((prev) => {
          if (prev.length === 0) {
            const initialOrdered = orderPostsForFeed(
              mapped,
              sessionStartSeenRef.current,
              followerCounts
            );
            shuffleWeightsRef.current.clear();
            initialOrdered.forEach((item, idx) => {
              shuffleWeightsRef.current.set(item.id, idx);
            });
            return initialOrdered;
          }

          const mappedById = new Map<string, PostItem>();
          for (const item of mapped) {
            mappedById.set(item.id, item);
          }
          const prevById = new Map<string, PostItem>();
          for (const item of prev) {
            prevById.set(item.id, item);
          }

          let anyDiff = false;
          const keptReconciled: PostItem[] = [];
          for (const oldItem of prev) {
            const nextItem = mappedById.get(oldItem.id);
            if (!nextItem) {
              anyDiff = true;
              continue;
            }
            const unchanged =
              oldItem.videoUrl === nextItem.videoUrl &&
              oldItem.posterUrl === nextItem.posterUrl &&
              oldItem.accountName === nextItem.accountName &&
              oldItem.authorPhotoURL === nextItem.authorPhotoURL &&
              oldItem.caption === nextItem.caption &&
              oldItem.musicName === nextItem.musicName &&
              oldItem.likesCount === nextItem.likesCount &&
              oldItem.commentsCount === nextItem.commentsCount &&
              oldItem.region === nextItem.region &&
              oldItem.category === nextItem.category &&
              oldItem.uid === nextItem.uid &&
              oldItem.username === nextItem.username &&
              oldItem.likedBy.length === nextItem.likedBy.length &&
              oldItem.likedBy.every((id, i) => id === nextItem.likedBy[i]);
            if (unchanged) {
              keptReconciled.push(oldItem);
            } else {
              anyDiff = true;
              keptReconciled.push(nextItem);
            }
          }

          const brandNewUnseen: PostItem[] = [];
          const brandNewSeen: PostItem[] = [];
          for (const item of mapped) {
            if (!prevById.has(item.id)) {
              anyDiff = true;
              if ((recentlySeenMapRef.current[item.id] || 0) <= 0) {
                brandNewUnseen.push(item);
              } else {
                brandNewSeen.push(item);
              }
            }
          }

          if (!anyDiff) return prev;

          if (brandNewUnseen.length > 0) {
            // Insert brand-new unseen post right after current video (or at top if not started yet)
            // so the user sees it once without jumping their currently playing video
            const curIdx = activeIndexRef.current;
            const insertAt =
              curIdx >= 0 && curIdx < keptReconciled.length
                ? curIdx === 0 && !activeVideoReadyRef.current
                  ? 0
                  : Math.min(curIdx + 1, keptReconciled.length)
                : 0;
            keptReconciled.splice(insertAt, 0, ...brandNewUnseen);
          }
          if (brandNewSeen.length > 0) {
            keptReconciled.push(...brandNewSeen);
          }

          return keptReconciled;
        });
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
  }, [hasActiveSession, buildFollowerCountsMap, orderPostsForFeed]);

  // Apply creator follower weighting once peopleDirectory loads while feed is still at top
  useEffect(() => {
    if (hasAppliedInitialRankRef.current) return;
    if (posts.length === 0 || Object.keys(peopleDirectory).length === 0) return;
    hasAppliedInitialRankRef.current = true;
    if (activeIndex !== 0) return;

    const followerCounts = buildFollowerCountsMap(peopleDirectory, subFollowersMap);
    setPosts((prev) => {
      if (prev.length <= 1) return prev;
      const pinnedId = prev[0]?.id;
      const ordered = orderPostsForFeed(prev, sessionStartSeenRef.current, followerCounts, {
        pinnedPostId: pinnedId,
      });
      shuffleWeightsRef.current.clear();
      ordered.forEach((item, idx) => shuffleWeightsRef.current.set(item.id, idx));
      return ordered;
    });
  }, [peopleDirectory, subFollowersMap, posts.length, activeIndex, buildFollowerCountsMap, orderPostsForFeed]);

  const enrichedPosts = useMemo(() => {
    const peopleByUsername: Record<string, PublicPersonProfile> = {};
    for (const person of Object.values(peopleDirectory)) {
      const unameKey = (person.username || '').replace(/^@+/, '').trim().toLowerCase();
      if (unameKey && !peopleByUsername[unameKey]) {
        peopleByUsername[unameKey] = person;
      }
    }

    return posts
      .filter((post) => !post.uid || (!deletedUids[post.uid] && !isUidKnownDeleted(post.uid)))
      .map((post) => {
        const cleanPostUname = (post.username || '').replace(/^@+/, '').trim().toLowerCase();
        const creator =
          (post.uid ? peopleDirectory[post.uid] : undefined) ||
          (cleanPostUname ? peopleByUsername[cleanPostUname] : undefined);
        const resolvedPhoto =
          normalizeStorageUrl(creator?.photoURL || post.authorPhotoURL) || undefined;
        if (!creator) {
          return resolvedPhoto !== post.authorPhotoURL
            ? { ...post, authorPhotoURL: resolvedPhoto }
            : post;
        }
        const cleanUname = (creator.username || post.username || '').replace(/^@+/, '').trim();
        const nextUsername = cleanUname || post.username;
        const nextAccountName = cleanUname ? `@${cleanUname}` : post.accountName;
        if (
          nextUsername === post.username &&
          nextAccountName === post.accountName &&
          resolvedPhoto === post.authorPhotoURL
        ) {
          return post;
        }
        return {
          ...post,
          username: nextUsername,
          accountName: nextAccountName,
          authorPhotoURL: resolvedPhoto,
        };
      });
  }, [posts, peopleDirectory, deletedUids]);

  const followerSetsByUid = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    const ensureSet = (uid: string) => {
      if (!map[uid]) map[uid] = new Set<string>();
      return map[uid];
    };

    for (const person of Object.values(peopleDirectory)) {
      for (const targetUid of person.following) {
        if (targetUid && targetUid !== person.uid) {
          ensureSet(targetUid).add(person.uid);
        }
      }
      for (const followerUid of person.followers) {
        if (followerUid && followerUid !== person.uid) {
          ensureSet(person.uid).add(followerUid);
        }
      }
    }

    for (const [targetUid, subList] of Object.entries(subFollowersMap)) {
      for (const followerUid of subList) {
        if (followerUid && followerUid !== targetUid) {
          ensureSet(targetUid).add(followerUid);
        }
      }
    }

    return map;
  }, [peopleDirectory, subFollowersMap]);

  const dynamicDesktopFilters = useMemo(() => {
    const map = new Map<string, string>();
    const regionSet = new Set(['az', 'tr', 'azerbaijan', 'azərbaycan', 'azerbaycan', 'turkey', 'türkiyə', 'turkiye']);
    for (const p of enrichedPosts) {
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
  }, [enrichedPosts]);

  const filteredPosts = useMemo(() => {
    return enrichedPosts.filter(
      (p) => matchesRegion(p, regionFilter) && matchesCategory(p, categoryFilter)
    );
  }, [enrichedPosts, regionFilter, categoryFilter]);

  useEffect(() => {
    setFeedCycles([]);
    setActiveIndex(0);
    if (hasMountedFilterEffectRef.current) {
      sessionStartSeenRef.current = { ...recentlySeenMapRef.current };
      const followerCounts = buildFollowerCountsMap(
        peopleDirectoryRef.current,
        subFollowersMapRef.current
      );
      setPosts((prev) => {
        if (prev.length <= 1) return prev;
        const ordered = orderPostsForFeed(prev, recentlySeenMapRef.current, followerCounts);
        shuffleWeightsRef.current.clear();
        ordered.forEach((item, idx) => shuffleWeightsRef.current.set(item.id, idx));
        return ordered;
      });
    } else {
      hasMountedFilterEffectRef.current = true;
    }
    if (feedRef.current) {
      feedRef.current.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [regionFilter, categoryFilter, buildFollowerCountsMap, orderPostsForFeed]);

  const feedEntries = useMemo(() => {
    const entries: Array<{ key: string; post: PostItem }> = filteredPosts.map((p) => ({
      key: `c0-${p.id}`,
      post: p,
    }));
    if (feedCycles.length === 0 || filteredPosts.length === 0) {
      return entries;
    }
    const postById = new Map<string, PostItem>();
    for (const p of filteredPosts) {
      postById.set(p.id, p);
    }
    for (const cycle of feedCycles) {
      cycle.postIds.forEach((pid, idx) => {
        const post = postById.get(pid);
        if (post) {
          entries.push({
            key: `c${cycle.cycleId}-${idx}-${pid}`,
            post,
          });
        }
      });
    }
    return entries;
  }, [filteredPosts, feedCycles]);

  // Infinite feed loop: when reaching the final 3 videos, append a freshly shuffled batch prioritizing oldest-watched videos
  useEffect(() => {
    if (postsLoading || filteredPosts.length === 0) return;
    if (activeIndex >= feedEntries.length - 3) {
      const tailWindow = Math.min(4, Math.max(1, Math.floor(filteredPosts.length / 2)));
      const tailIds = feedEntries.slice(-tailWindow).map((e) => e.post.id);
      const nextIds = createShuffledCycleIds(filteredPosts, tailIds);
      if (nextIds.length > 0) {
        const cycleId = nextCycleIdRef.current++;
        setFeedCycles((prev) => [...prev, { cycleId, postIds: nextIds }]);
      }
    }
  }, [activeIndex, feedEntries, filteredPosts, postsLoading, createShuffledCycleIds]);

  useEffect(() => {
    if (activeIndex >= feedEntries.length && feedEntries.length > 0) {
      setActiveIndex(0);
    }
  }, [feedEntries.length, activeIndex]);

  // Give active video exclusive download bandwidth first, then unlock background preloading of the next video
  useEffect(() => {
    setActiveVideoReady(false);
    const unlockTimer = window.setTimeout(() => {
      setActiveVideoReady(true);
    }, 1500);
    return () => window.clearTimeout(unlockTimer);
  }, [activeIndex, activeTab]);

  // Once current video is ready/playing, warm the first 1.5MB of the VERY NEXT video into server RAM cache
  useEffect(() => {
    if (!activeVideoReady || activeTab !== 'feed') return;
    const nextUrl = feedEntries[activeIndex + 1]?.post.videoUrl;
    if (
      !nextUrl ||
      !nextUrl.startsWith('http') ||
      nextUrl.includes('youtube.com') ||
      nextUrl.includes('youtu.be') ||
      nextUrl.includes('drive.google.com') ||
      warmedUrlsRef.current.has(nextUrl)
    ) {
      return;
    }
    warmedUrlsRef.current.add(nextUrl);
    fetch(`/api/video-warm?url=${encodeURIComponent(nextUrl)}`).catch(() => {});
  }, [activeVideoReady, activeTab, activeIndex, feedEntries]);

  // Preload first feed interstitial ad silently in native wrappers
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (hasNativeAdMobBridge()) {
        void preloadFeedInterstitialAd();
      }
    }, 3000);
    return () => window.clearTimeout(timer);
  }, []);

  // Show AdMob Interstitial Ad every 7-8 videos watched/swiped in feed
  useEffect(() => {
    if (activeTab !== 'feed' || postsLoading || feedEntries.length === 0) return;
    const currentKey = feedEntries[activeIndex]?.key;
    if (!currentKey) return;

    if (lastCountedFeedKeyRef.current === null) {
      lastCountedFeedKeyRef.current = currentKey;
      return;
    }
    if (lastCountedFeedKeyRef.current === currentKey) return;

    lastCountedFeedKeyRef.current = currentKey;
    swipesSinceLastAdRef.current += 1;

    if (
      swipesSinceLastAdRef.current >= nextInterstitialTargetRef.current - 2 &&
      hasNativeAdMobBridge()
    ) {
      void preloadFeedInterstitialAd();
    }

    if (
      swipesSinceLastAdRef.current >= nextInterstitialTargetRef.current &&
      !interstitialInFlightRef.current &&
      !showUpload &&
      !showSettings &&
      !showSearch &&
      !activeSharePostId &&
      !activeCommentsPostId
    ) {
      swipesSinceLastAdRef.current = 0;
      nextInterstitialTargetRef.current = 7 + Math.floor(Math.random() * 2);

      if (!hasNativeAdMobBridge()) return;

      interstitialInFlightRef.current = true;
      setAdOverlayActive(true);
      showFeedInterstitialAd()
        .catch(() => {})
        .finally(() => {
          interstitialInFlightRef.current = false;
          setAdOverlayActive(false);
          window.setTimeout(() => {
            void preloadFeedInterstitialAd();
          }, 1200);
        });
    }
  }, [
    activeIndex,
    activeTab,
    postsLoading,
    feedEntries,
    showUpload,
    showSettings,
    showSearch,
    activeSharePostId,
    activeCommentsPostId,
  ]);

  const handleActiveReady = useCallback(() => {
    setActiveVideoReady(true);
  }, []);

  const handleUnlockAudio = useCallback(() => {
    blessFeedVideos();
    setIsMuted(false);
  }, [blessFeedVideos]);

  const handleToggleMute = useCallback(() => {
    setIsMuted((m) => {
      if (m) blessFeedVideos();
      return !m;
    });
  }, [blessFeedVideos]);

  const handleOpenComments = useCallback((p: PostItem) => {
    setActiveCommentsPostId(p.id);
  }, []);

  const handleOpenShareMenu = useCallback((p: PostItem) => {
    setActiveSharePostId(p.id);
  }, []);

  const scrollToIndex = useCallback(
    (index: number, behavior: ScrollBehavior = 'smooth') => {
      if (!isMuted) {
        blessFeedVideos();
      }
      const container = feedRef.current;
      if (!container) return;
      const clamped = Math.max(0, Math.min(index, feedEntries.length - 1));
      setActiveIndex(clamped);
      container.scrollTo({
        top: clamped * container.clientHeight,
        behavior,
      });
    },
    [feedEntries.length, isMuted, blessFeedVideos]
  );

  const handleHomeShuffle = useCallback(() => {
    if (!isMuted) {
      blessFeedVideos();
    }
    setActiveTab('feed');
    sessionStartSeenRef.current = { ...recentlySeenMapRef.current };
    const followerCounts = buildFollowerCountsMap(
      peopleDirectoryRef.current,
      subFollowersMapRef.current
    );
    setFeedCycles([]);
    setPosts((prev) => {
      const ordered = orderPostsForFeed(prev, recentlySeenMapRef.current, followerCounts);
      shuffleWeightsRef.current.clear();
      ordered.forEach((item, idx) => shuffleWeightsRef.current.set(item.id, idx));
      return ordered;
    });
    setActiveIndex(0);
    setTimeout(() => {
      feedRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    }, 20);
  }, [isMuted, blessFeedVideos, buildFollowerCountsMap, orderPostsForFeed]);

  const handleVideoUploaded = useCallback(
    (newPostId: string) => {
      setFeedCycles([]);
      setPosts((prev) => {
        const uploadedIdx = prev.findIndex((p) => p.id === newPostId);
        if (uploadedIdx <= 0) return prev;
        const copy = [...prev];
        const [item] = copy.splice(uploadedIdx, 1);
        return [item, ...copy];
      });
      setRegionFilter('all');
      setCategoryFilter('all');
      setActiveTab('feed');
      setActiveIndex(0);
      setIsMuted(false);
      blessFeedVideos();
      setShowUpload(false);
      setTimeout(() => {
        feedRef.current?.scrollTo({ top: 0, behavior: 'auto' });
      }, 40);
    },
    [blessFeedVideos]
  );

  useEffect(() => {
    const targetId = pendingPostIdRef.current;
    if (!targetId || feedEntries.length === 0) return;
    const idx = feedEntries.findIndex((e) => e.post.id === targetId);
    if (idx !== -1) {
      pendingPostIdRef.current = null;
      setActiveTab('feed');
      scrollToIndex(idx);
    }
  }, [feedEntries, scrollToIndex]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        activeTab !== 'feed' ||
        showSearch ||
        showSettings ||
        showUpload ||
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
    showUpload,
    activeCommentsPostId,
    activeSharePostId,
  ]);

  const handleSelectPostById = (postId: string) => {
    setActiveTab('feed');
    let idx = feedEntries.findIndex((e) => e.post.id === postId);
    if (idx === -1) {
      setRegionFilter('all');
      setCategoryFilter('all');
      setFeedCycles([]);
      idx = enrichedPosts.findIndex((p) => p.id === postId);
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
    const syncIndex = () => {
      const el = feedRef.current;
      if (!el || el.clientHeight === 0) return;
      const nextIdx = Math.round(el.scrollTop / el.clientHeight);
      if (nextIdx >= 0 && nextIdx < feedEntries.length) {
        setActiveIndex((prev) => (prev !== nextIdx ? nextIdx : prev));
      }
    };
    syncIndex();
    if (scrollSettleTimerRef.current) {
      window.clearTimeout(scrollSettleTimerRef.current);
    }
    scrollSettleTimerRef.current = window.setTimeout(syncIndex, 100);
  };

  const effectiveProfile: UserProfile | null = useMemo(() => {
    if (userProfile) return userProfile;
    if (authUser?.isAnonymous || isGuest) {
      return {
        uid: authUser?.uid || 'guest',
        email: 'Qonaq rejimi',
        username: 'qonaq',
        isBlocked: false,
        isGuest: true,
      };
    }
    return null;
  }, [userProfile, authUser, isGuest]);

  const handleEnterAsGuest = useCallback(() => {
    setIsGuest(true);
    setGuestPrompt(null);
    try {
      localStorage.setItem(GUEST_MODE_KEY, '1');
    } catch {
      // ignore
    }
  }, []);

  const handleExitGuestToLogin = useCallback(() => {
    setIsGuest(false);
    setGuestPrompt(null);
    setShowSettings(false);
    setShowUpload(false);
    setActiveCommentsPostId(null);
    try {
      localStorage.removeItem(GUEST_MODE_KEY);
    } catch {
      // ignore
    }
    if (auth.currentUser?.isAnonymous) {
      auth.signOut().catch(() => {});
    }
  }, []);

  const handleSignOut = useCallback(() => {
    clearSavedRegisteredAccount(userProfile?.uid || authUser?.uid);
    setUserProfile(null);
    setIsGuest(false);
    setShowSettings(false);
    setShowUpload(false);
    setActiveCommentsPostId(null);
    setActiveTab('feed');
    try {
      localStorage.removeItem(GUEST_MODE_KEY);
    } catch {
      // ignore
    }
    auth.signOut().catch(() => {});
  }, [userProfile?.uid, authUser?.uid]);

  const resolvePerson = useCallback(
    (uid: string): PublicPersonProfile => {
      const existing = peopleDirectory[uid];
      if (existing) return existing;
      return {
        uid,
        username: 'istifadeci',
        bio: '',
        following: [],
        followers: [],
      };
    },
    [peopleDirectory]
  );

  const myFollowerUsers: PublicPersonProfile[] = useMemo(() => {
    if (!effectiveProfile || effectiveProfile.isGuest) return [];
    const set = followerSetsByUid[effectiveProfile.uid];
    if (!set) return [];
    return Array.from(set).map((uid) => resolvePerson(uid));
  }, [effectiveProfile, followerSetsByUid, resolvePerson]);

  const myFollowingUsers: PublicPersonProfile[] = useMemo(() => {
    if (!effectiveProfile || effectiveProfile.isGuest) return [];
    const followingIds =
      peopleDirectory[effectiveProfile.uid]?.following || effectiveProfile.following || [];
    return Array.from(
      new Set(followingIds.filter((id) => id && id !== effectiveProfile.uid))
    ).map((uid) => resolvePerson(uid));
  }, [effectiveProfile, peopleDirectory, resolvePerson]);

  const handleToggleLike = useCallback(
    async (post: PostItem) => {
      if (!effectiveProfile) return;
      if (effectiveProfile.isGuest) {
        setGuestPrompt('Videonu bəyənmək üçün Google hesabı ilə daxil olun.');
        return;
      }

      const uid = effectiveProfile.uid;
      if (likingPostIdsRef.current.has(post.id)) return;
      likingPostIdsRef.current.add(post.id);

      const currentlyLiked = post.likedBy.includes(uid);
      const delta = currentlyLiked ? -1 : 1;

      setPosts((prev) =>
        prev.map((p) => {
          if (p.id !== post.id) return p;
          const nextLikedBy = currentlyLiked
            ? p.likedBy.filter((id) => id !== uid)
            : Array.from(new Set([...p.likedBy, uid]));
          return {
            ...p,
            likesCount: Math.max(0, p.likesCount + delta),
            likedBy: nextLikedBy,
          };
        })
      );

      const postRef = doc(db, 'posts', post.id);
      try {
        await updateDoc(postRef, {
          likesCount: increment(delta),
          likedBy: currentlyLiked ? arrayRemove(uid) : arrayUnion(uid),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `posts/${post.id}`);
      } finally {
        likingPostIdsRef.current.delete(post.id);
      }
    },
    [effectiveProfile]
  );

  const handleOpenCreatorProfile = useCallback(
    (post: PostItem) => {
      setActiveCreatorKey({
        uid: post.uid,
        username: post.username,
        accountName: post.accountName,
      });

      if (post.uid) {
        getDoc(doc(db, 'people', post.uid))
          .then((snap) => {
            if (!snap.exists()) return;
            const data = snap.data() as Record<string, unknown>;
            const following = Array.isArray(data.following)
              ? Array.from(new Set(data.following.map((x) => String(x)).filter(Boolean)))
              : [];
            const followers = Array.isArray(data.followers)
              ? Array.from(new Set(data.followers.map((x) => String(x)).filter(Boolean)))
              : [];
            const rawPhoto =
              data.photoURL || data.avatarUrl || data.avatar || data.picture || data.photo || '';
            setPeopleDirectory((prev) => ({
              ...prev,
              [snap.id]: {
                uid: snap.id,
                username: String(data.username || ''),
                photoURL: normalizeStorageUrl(rawPhoto) || undefined,
                bio: typeof data.bio === 'string' ? data.bio : '',
                following,
                followers,
              },
            }));
          })
          .catch(() => {});

        getDocs(collection(db, 'people', post.uid, 'followers'))
          .then((snap) => {
            const ids = snap.docs.map((d) => d.id).filter(Boolean);
            setSubFollowersMap((prev) => ({ ...prev, [post.uid!]: ids }));
          })
          .catch(() => {});
      }
    },
    []
  );

  const handleToggleFollow = async (targetUid: string) => {
    if (!effectiveProfile) return;
    if (effectiveProfile.isGuest) {
      setGuestPrompt('Takip etmək üçün Google hesabı ilə daxil olun.');
      return;
    }

    const myUid = effectiveProfile.uid;
    if (!targetUid || targetUid === myUid || targetUid.startsWith('name:')) return;
    if (followingLockRef.current.has(targetUid)) return;
    followingLockRef.current.add(targetUid);
    setFollowPending(true);

    const myFollowing = peopleDirectory[myUid]?.following || effectiveProfile.following || [];
    const targetFollowerSet = followerSetsByUid[targetUid];
    const currentlyFollowing =
      myFollowing.includes(targetUid) || Boolean(targetFollowerSet?.has(myUid));

    // Optimistic update (1 follow max per user)
    setPeopleDirectory((prev) => {
      const me = prev[myUid] || {
        uid: myUid,
        username: effectiveProfile.username,
        photoURL: effectiveProfile.photoURL,
        bio: effectiveProfile.bio,
        following: myFollowing,
        followers: [],
      };
      const target = prev[targetUid] || {
        uid: targetUid,
        username: '',
        following: [],
        followers: [],
      };
      const nextMyFollowing = currentlyFollowing
        ? me.following.filter((id) => id !== targetUid)
        : Array.from(new Set([...me.following, targetUid]));
      const nextTargetFollowers = currentlyFollowing
        ? target.followers.filter((id) => id !== myUid)
        : Array.from(new Set([...target.followers, myUid]));

      return {
        ...prev,
        [myUid]: { ...me, following: nextMyFollowing },
        [targetUid]: { ...target, followers: nextTargetFollowers },
      };
    });

    setSubFollowersMap((prev) => {
      const existing = prev[targetUid] || [];
      const next = currentlyFollowing
        ? existing.filter((id) => id !== myUid)
        : Array.from(new Set([...existing, myUid]));
      return { ...prev, [targetUid]: next };
    });

    try {
      await setDoc(
        doc(db, 'people', myUid),
        {
          following: currentlyFollowing ? arrayRemove(targetUid) : arrayUnion(targetUid),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      if (currentlyFollowing) {
        await deleteDoc(doc(db, 'people', targetUid, 'followers', myUid)).catch(() => {});
        await updateDoc(doc(db, 'people', targetUid), {
          followers: arrayRemove(myUid),
        }).catch(() => {});
      } else {
        await setDoc(doc(db, 'people', targetUid, 'followers', myUid), {
          uid: myUid,
          createdAt: serverTimestamp(),
        }).catch(() => {});
        await updateDoc(doc(db, 'people', targetUid), {
          followers: arrayUnion(myUid),
        }).catch(() => {});
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `people/${myUid}`);
    } finally {
      followingLockRef.current.delete(targetUid);
      setFollowPending(false);
    }
  };

  const handleWatched = useCallback(
    (post: PostItem) => {
      const now = Date.now();
      const updatedSeen: Record<string, number> = {
        ...recentlySeenMapRef.current,
        [post.id]: now,
      };
      const seenEntries = Object.entries(updatedSeen);
      if (seenEntries.length > 1000) {
        seenEntries.sort((a, b) => b[1] - a[1]);
        recentlySeenMapRef.current = Object.fromEntries(seenEntries.slice(0, 1000));
      } else {
        recentlySeenMapRef.current = updatedSeen;
      }
      persistRecentSeenMap(accountSeenScopeRef.current, recentlySeenMapRef.current);

      const historyKeyUid = monitoredUid || (isGuest ? 'guest' : null);
      if (!historyKeyUid) return;
      const entry: WatchHistoryItem = {
        postId: post.id,
        caption: post.caption,
        musicName: post.musicName,
        videoUrl: post.videoUrl,
        watchedAt: now,
      };

      setHistory((prev) => {
        const filtered = prev.filter((item) => item.postId !== post.id);
        const next = [entry, ...filtered].slice(0, 50);
        try {
          localStorage.setItem(`careels_history_${historyKeyUid}`, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });

      if (monitoredUid) {
        setDoc(doc(db, 'people', monitoredUid, 'history', post.id), entry).catch(() => {});
      }
    },
    [monitoredUid, isGuest]
  );

  const handleClearHistory = () => {
    const historyKeyUid = authUser?.uid || (isGuest ? 'guest' : null);
    if (!historyKeyUid) return;
    setHistory([]);
    try {
      localStorage.removeItem(`careels_history_${historyKeyUid}`);
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

  if (!isGuest && !userProfile && (authLoading || (authUser && !authUser.isAnonymous && !profileChecked))) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-[#08080B] text-white">
        <CaReelsLogo size={56} className="animate-pulse" />
        <p className="mt-4 text-sm font-medium text-zinc-400">CaReels yüklənir...</p>
      </div>
    );
  }

  if (!authUser && !userProfile && !isGuest) {
    return <LoginScreen onGuestContinue={handleEnterAsGuest} />;
  }

  if (!effectiveProfile) {
    if (!authUser) {
      return <LoginScreen onGuestContinue={handleEnterAsGuest} />;
    }
    return (
      <UsernameScreen
        user={authUser}
        onComplete={(profile) => {
          saveRegisteredProfile(profile);
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
              onClick={() => setActiveTab('cars')}
              className={`flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3.5 text-sm font-semibold transition-colors cursor-pointer ${
                activeTab === 'cars'
                  ? 'bg-[#A8001E] text-white'
                  : 'text-zinc-300 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Car className="h-4 w-4" />
              <span>Avtomobil Axtarışı</span>
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

            <button
              type="button"
              onClick={() => setActiveTab('profile')}
              className={`flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3.5 text-sm font-semibold transition-colors cursor-pointer ${
                activeTab === 'profile'
                  ? 'bg-[#A8001E] text-white'
                  : 'text-zinc-300 hover:bg-white/5 hover:text-white'
              }`}
            >
              <UserIcon className="h-4 w-4" />
              <span>Profil</span>
            </button>

            <div className="my-3 border-t border-white/10" />

            <button
              type="button"
              onClick={() => setShowUpload(true)}
              className="flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3.5 text-sm font-semibold text-zinc-300 hover:bg-white/5 hover:text-white transition-colors cursor-pointer"
            >
              <Plus className="h-4 w-4 text-[#E04F67]" />
              <span>Video Yüklə</span>
            </button>

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
          <UserAvatar
            photoURL={effectiveProfile.isGuest ? undefined : effectiveProfile.photoURL}
            name={effectiveProfile.isGuest ? 'QN' : effectiveProfile.username}
            sizeClass="h-10 w-10"
            textClass="text-xs"
          />
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-white">
              {effectiveProfile.isGuest ? 'Qonaq rejimi' : `@${effectiveProfile.username}`}
            </div>
            <div className="truncate text-xs text-zinc-400">{effectiveProfile.email}</div>
          </div>
        </button>
      </aside>

      {/* Main Content Stage */}
      <main className="relative flex h-full min-h-0 flex-1 items-center justify-center bg-[#08080B] overflow-hidden">
        {/* TAB 1: Əsas Səhifə (posts kolleksiyası) */}
        {activeTab === 'feed' && (
          <>
            <div
              aria-hidden="true"
              className="pointer-events-none hidden lg:block absolute h-[520px] w-[520px] rounded-full bg-[#A8001E]/15 blur-[150px]"
            />

            <div className="relative h-full w-full min-h-0 lg:h-[92vh] lg:max-h-[860px] lg:w-auto lg:aspect-[9/16] lg:overflow-hidden lg:rounded-3xl lg:border lg:border-white/15 lg:shadow-[0_24px_80px_rgba(0,0,0,0.85)]">
              {/* Top-Left CaReels Wordmark & Top-Right Search */}
              <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center justify-between pl-3 pr-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
                <div className="pointer-events-auto flex items-center">
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
                    {effectiveProfile.isGuest
                      ? 'Videoları görmək üçün giriş tələb olunur'
                      : 'Videolar oxuna bilmədi'}
                  </h2>
                  <p className="mt-2 max-w-xs text-xs text-rose-300 break-words">
                    {effectiveProfile.isGuest
                      ? 'Bu bölmə qonaq girişini məhdudlaşdırır. Google hesabı ilə daxil olub bütün videoları izləyə bilərsiniz.'
                      : postsError}
                  </p>
                  {effectiveProfile.isGuest && (
                    <button
                      type="button"
                      onClick={handleExitGuestToLogin}
                      className="mt-5 min-h-[44px] rounded-2xl bg-[#A8001E] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#C8102E] transition-colors cursor-pointer"
                    >
                      Google hesabı ilə daxil ol
                    </button>
                  )}
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
                  className="no-scrollbar tiktok-feed h-full w-full snap-y snap-mandatory overflow-y-auto"
                >
                  {feedEntries.map((entry, idx) => {
                    const post = entry.post;
                    const offset = idx - activeIndex;
                    const shouldMountMedia = offset >= -1 && offset <= 2;
                    const preloadMode: 'auto' | 'metadata' | 'none' =
                      offset === 0
                        ? 'auto'
                        : offset === 1
                          ? activeVideoReady
                            ? 'auto'
                            : 'metadata'
                          : offset === -1 || offset === 2
                            ? 'metadata'
                            : 'none';

                    return (
                      <VideoCard
                        key={entry.key}
                        post={post}
                        isActive={idx === activeIndex && activeTab === 'feed' && !adOverlayActive}
                        isLiked={post.likedBy.includes(effectiveProfile.uid)}
                        isMuted={isMuted}
                        preloadMode={preloadMode}
                        shouldMountMedia={shouldMountMedia}
                        onActiveReady={handleActiveReady}
                        onBlessVideos={blessFeedVideos}
                        onUnlockAudio={handleUnlockAudio}
                        onToggleMute={handleToggleMute}
                        onToggleLike={handleToggleLike}
                        onOpenComments={handleOpenComments}
                        onOpenShareMenu={handleOpenShareMenu}
                        onOpenCreatorProfile={handleOpenCreatorProfile}
                        onWatched={handleWatched}
                      />
                    );
                  })}
                </div>
              )}
            </div>

            {feedEntries.length > 1 && (
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
                  disabled={activeIndex >= feedEntries.length - 1}
                  aria-label="Növbəti video"
                  className="flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white hover:bg-[#A8001E] hover:border-[#A8001E] transition-colors disabled:opacity-30 cursor-pointer"
                >
                  <ChevronDown className="h-5 w-5" />
                </button>
              </div>
            )}
          </>
        )}

        {/* TAB 2: Avtomobil Axtarışı */}
        {activeTab === 'cars' && <CarsLookupView />}

        {/* TAB 3: Chat (chats kolleksiyası) */}
        {activeTab === 'chat' && (
          <ChatView userProfile={effectiveProfile} onRequireLogin={handleExitGuestToLogin} />
        )}

        {/* TAB 4: Profil */}
        {activeTab === 'profile' && (
          <ProfileView
            userProfile={effectiveProfile}
            posts={enrichedPosts}
            followerUsers={myFollowerUsers}
            followingUsers={myFollowingUsers}
            onUpdateProfile={(updated) => {
              const normalizedPhoto = normalizeStorageUrl(updated.photoURL) || undefined;
              const nextUpdated = { ...updated, photoURL: normalizedPhoto || updated.photoURL || '' };
              setUserProfile(nextUpdated);
              saveRegisteredProfile(nextUpdated);
              setPeopleDirectory((prev) => ({
                ...prev,
                [nextUpdated.uid]: {
                  uid: nextUpdated.uid,
                  username: nextUpdated.username,
                  photoURL: normalizedPhoto,
                  bio: nextUpdated.bio,
                  following: prev[nextUpdated.uid]?.following || nextUpdated.following || [],
                  followers: prev[nextUpdated.uid]?.followers || nextUpdated.followers || [],
                },
              }));
              setPosts((prev) =>
                prev.map((p) =>
                  p.uid === nextUpdated.uid
                    ? {
                        ...p,
                        authorPhotoURL: normalizedPhoto || p.authorPhotoURL,
                        username: nextUpdated.username || p.username,
                        accountName: nextUpdated.username ? `@${nextUpdated.username}` : p.accountName,
                      }
                    : p
                )
              );
            }}
            onInspectUser={(person) => {
              setActiveCreatorKey({
                uid: person.uid,
                username: person.username,
                accountName: person.username ? `@${person.username}` : 'CaReels',
              });
            }}
            onSelectPost={handleSelectPostById}
            onOpenUpload={() => setShowUpload(true)}
            onOpenSettings={() => setShowSettings(true)}
            onRequireLogin={handleExitGuestToLogin}
            onSignOut={handleSignOut}
          />
        )}

        {/* FLOATING CENTERED WIDER SLIM OVAL BOTTOM PANEL: [Home] - [Car] - [+] - [Chat] - [Profil] */}
        <nav
          aria-label="Əsas naviqasiya"
          className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 z-40 w-[calc(100%-2rem)] max-w-[400px] -translate-x-1/2 lg:left-[calc(50%+9rem)] lg:w-[340px]"
        >
          <div className="grid w-full grid-cols-5 items-center rounded-full border border-[#A8001E]/45 bg-[#0F0F14]/90 px-2 py-0.5 shadow-[0_10px_28px_rgba(0,0,0,0.82)] backdrop-blur-xl">
            {/* 1. Home Icon */}
            <div className="flex justify-center">
              <button
                type="button"
                onClick={handleHomeShuffle}
                aria-label="Əsas səhifə"
                className={`flex h-8 w-11 items-center justify-center rounded-full transition-all cursor-pointer ${
                  activeTab === 'feed'
                    ? 'bg-[#A8001E] text-white shadow-[0_3px_10px_rgba(168,0,30,0.45)]'
                    : 'text-zinc-300 hover:text-white hover:bg-white/5'
                }`}
              >
                <Home className="h-4 w-4 shrink-0" />
              </button>
            </div>

            {/* 2. Car Icon (next to Home) */}
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => setActiveTab('cars')}
                aria-label="Avtomobil axtarışı"
                className={`flex h-8 w-11 items-center justify-center rounded-full transition-all cursor-pointer ${
                  activeTab === 'cars'
                    ? 'bg-[#A8001E] text-white shadow-[0_3px_10px_rgba(168,0,30,0.45)]'
                    : 'text-zinc-300 hover:text-white hover:bg-white/5'
                }`}
              >
                <Car className="h-4 w-4 shrink-0" />
              </button>
            </div>

            {/* 3. + Video Upload Icon (DEAD CENTER) */}
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => setShowUpload(true)}
                aria-label="Video yüklə"
                className="flex h-7 w-11 items-center justify-center rounded-full bg-white text-[#0A0A0E] shadow-sm transition-transform hover:bg-zinc-200 active:scale-90 cursor-pointer"
              >
                <Plus className="h-4 w-4 stroke-[2.5] shrink-0" />
              </button>
            </div>

            {/* 4. Chat Icon */}
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => setActiveTab('chat')}
                aria-label="Chat"
                className={`flex h-8 w-11 items-center justify-center rounded-full transition-all cursor-pointer ${
                  activeTab === 'chat'
                    ? 'bg-[#A8001E] text-white shadow-[0_3px_10px_rgba(168,0,30,0.45)]'
                    : 'text-zinc-300 hover:text-white hover:bg-white/5'
                }`}
              >
                <MessageSquare className="h-4 w-4 shrink-0" />
              </button>
            </div>

            {/* 5. Profil Icon */}
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => setActiveTab('profile')}
                aria-label="Profil"
                className={`flex h-8 w-11 items-center justify-center rounded-full transition-all cursor-pointer ${
                  activeTab === 'profile'
                    ? 'bg-[#A8001E] text-white shadow-[0_3px_10px_rgba(168,0,30,0.45)]'
                    : 'text-zinc-300 hover:text-white hover:bg-white/5'
                }`}
              >
                <UserIcon className="h-4 w-4 shrink-0" />
              </button>
            </div>
          </div>
        </nav>
      </main>

      {/* Search & Filter Full Overlay */}
      {showSearch && (
        <SearchOverlay
          posts={enrichedPosts}
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

      {/* Guest Action Toast Prompt */}
      {guestPrompt && (
        <div className="fixed top-20 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 items-center justify-between gap-3 rounded-2xl border border-[#A8001E]/50 bg-[#121218]/95 px-4 py-3 text-xs text-white shadow-2xl backdrop-blur-xl">
          <span className="text-zinc-200">{guestPrompt}</span>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={handleExitGuestToLogin}
              className="rounded-xl bg-[#A8001E] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#C8102E] transition-colors cursor-pointer"
            >
              Daxil ol
            </button>
            <button
              type="button"
              onClick={() => setGuestPrompt(null)}
              className="text-zinc-400 hover:text-white cursor-pointer"
              aria-label="Bağla"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Settings & Watch History Drawer */}
      {showSettings && (
        <SettingsDrawer
          userProfile={effectiveProfile}
          history={history}
          onUpdateProfile={(updated) => {
            setUserProfile(updated);
            saveRegisteredProfile(updated);
          }}
          onSelectHistoryPost={handleSelectPostById}
          onClearHistory={handleClearHistory}
          onRequireLogin={handleExitGuestToLogin}
          onSignOut={handleSignOut}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* Real-time Comments & Replies Sheet */}
      {activeCommentsPost && (
        <CommentsSheet
          post={activeCommentsPost}
          userProfile={effectiveProfile}
          peopleDirectory={peopleDirectory}
          peopleDirectoryReady={peopleDirectoryReady}
          deletedUids={deletedUids}
          onMarkUidDeleted={markDeletedUid}
          onRequireLogin={handleExitGuestToLogin}
          onClose={() => setActiveCommentsPostId(null)}
        />
      )}

      {/* WhatsApp Share, Gallery Download (with AdMob Rewarded Ad) & Owner Delete Sheet */}
      {activeSharePost && (
        <ShareDownloadSheet
          post={activeSharePost}
          viewerProfile={effectiveProfile}
          onAdPlayingChange={setAdOverlayActive}
          onDeleted={(deletedId) => {
            setPosts((prev) => prev.filter((p) => p.id !== deletedId));
          }}
          onClose={() => setActiveSharePostId(null)}
        />
      )}

      {/* Catbox.moe Video Upload Sheet */}
      {showUpload && (
        <UploadVideoSheet
          userProfile={effectiveProfile}
          onUnlockAudio={() => {
            blessFeedVideos();
            setIsMuted(false);
          }}
          onUploaded={handleVideoUploaded}
          onRequireLogin={handleExitGuestToLogin}
          onClose={() => setShowUpload(false)}
        />
      )}
      {/* Creator Public Profile Sheet (Full-Screen, opened from video avatar, username, or follow lists) */}
      {activeCreatorKey && (() => {
        const keyUid = activeCreatorKey.uid;
        const cleanUname = (activeCreatorKey.username || activeCreatorKey.accountName || 'CaReels')
          .replace(/^@+/, '')
          .trim();
        const personFromDir =
          (keyUid && !keyUid.startsWith('name:') ? peopleDirectory[keyUid] : undefined) ||
          Object.values(peopleDirectory).find(
            (p) => p.username && p.username.toLowerCase() === cleanUname.toLowerCase()
          );
        const resolvedUid = personFromDir?.uid || keyUid || `name:${cleanUname.toLowerCase()}`;
        const isOfficialCaReels =
          !personFromDir &&
          (!keyUid || resolvedUid.startsWith('name:')) &&
          cleanUname.toLowerCase() === 'careels';

        const fallbackPostPhoto = enrichedPosts.find(
          (p) =>
            ((keyUid && p.uid === keyUid) ||
              (p.username && p.username.toLowerCase() === cleanUname.toLowerCase())) &&
            p.authorPhotoURL
        )?.authorPhotoURL;

        const creatorObj: PublicPersonProfile = personFromDir
          ? {
              ...personFromDir,
              photoURL: personFromDir.photoURL || fallbackPostPhoto,
            }
          : {
              uid: resolvedUid,
              username: cleanUname,
              photoURL: fallbackPostPhoto,
              bio: isOfficialCaReels ? 'CaReels Rəsmi Avtomobil & Musiqi Kanalı' : '',
              following: [],
              followers: [],
            };
        const creatorPosts = enrichedPosts.filter((p) => {
          if (keyUid && !keyUid.startsWith('name:') && p.uid) return p.uid === keyUid;
          if (p.username && cleanUname) return p.username.toLowerCase() === cleanUname.toLowerCase();
          return (p.accountName || '').toLowerCase() === (activeCreatorKey.accountName || '').toLowerCase();
        });

        const allRegisteredUsers = Object.values(peopleDirectory);
        const followerIds = resolvedUid.startsWith('name:')
          ? []
          : Array.from(followerSetsByUid[resolvedUid] || []);
        const followerUsers = isOfficialCaReels
          ? allRegisteredUsers
          : followerIds.map((uid) => resolvePerson(uid));
        const followersCount = isOfficialCaReels
          ? allRegisteredUsers.length
          : followerUsers.length;

        const followingIds = isOfficialCaReels
          ? []
          : (personFromDir?.following || []).filter((id) => id && id !== resolvedUid);
        const followingUsers = Array.from(new Set(followingIds)).map((uid) => resolvePerson(uid));
        const followingCount = followingUsers.length;

        const myFollowingList = !effectiveProfile.isGuest
          ? peopleDirectory[effectiveProfile.uid]?.following || effectiveProfile.following || []
          : [];
        const isFollowing =
          !effectiveProfile.isGuest &&
          !isOfficialCaReels &&
          !resolvedUid.startsWith('name:') &&
          (myFollowingList.includes(resolvedUid) ||
            Boolean(followerSetsByUid[resolvedUid]?.has(effectiveProfile.uid)));

        return (
          <CreatorProfileSheet
            creator={creatorObj}
            viewerProfile={effectiveProfile}
            creatorPosts={creatorPosts}
            followerUsers={followerUsers}
            followingUsers={followingUsers}
            followersCount={followersCount}
            followingCount={followingCount}
            isOfficialCaReels={isOfficialCaReels}
            isFollowing={isFollowing}
            followPending={followPending}
            onToggleFollow={handleToggleFollow}
            onInspectUser={(person) => {
              setActiveCreatorKey({
                uid: person.uid,
                username: person.username,
                accountName: person.username ? `@${person.username}` : 'CaReels',
              });
            }}
            onSelectPost={(postId) => {
              setActiveCreatorKey(null);
              handleSelectPostById(postId);
            }}
            onClose={() => setActiveCreatorKey(null)}
          />
        );
      })()}
    </div>
  );
}
