import React, { useMemo, useState } from 'react';
import { ArrowLeft, Filter, Heart, MessageCircle, Music2, Play, Search, X } from 'lucide-react';
import { CategoryFilter, PostItem, RegionFilter } from '../types';

interface SearchOverlayProps {
  posts: PostItem[];
  initialRegion: RegionFilter;
  initialCategory: CategoryFilter;
  onApplyFilters: (region: RegionFilter, category: CategoryFilter) => void;
  onSelectPost: (postId: string) => void;
  onClose: () => void;
}

const REGION_AZ_ALIASES = new Set(['az', 'azerbaijan', 'azərbaycan', 'azerbaycan']);
const REGION_TR_ALIASES = new Set(['tr', 'turkey', 'türkiyə', 'turkiye']);
const MUSIQI_ALIASES = new Set(['musiqi', 'music', 'mahni', 'mahnı', 'song', 'audio']);
const MASIN_ALIASES = new Set(['masin', 'maşın', 'car', 'cars', 'auto', 'avto', 'mashin']);

export function matchesRegion(post: PostItem | string, filter: RegionFilter): boolean {
  if (filter === 'all') return true;
  const candidates =
    typeof post === 'string'
      ? [post]
      : [post.region, post.category, post.primaryFilter, ...post.filters];

  const normalizedList = candidates
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);

  if (filter === 'az') {
    return normalizedList.some((v) => REGION_AZ_ALIASES.has(v));
  }
  if (filter === 'tr') {
    return normalizedList.some((v) => REGION_TR_ALIASES.has(v));
  }
  return true;
}

export function matchesCategory(post: PostItem | string, filter: CategoryFilter): boolean {
  const cleanFilter = filter.trim().toLowerCase();
  if (!cleanFilter || cleanFilter === 'all') return true;

  const candidates =
    typeof post === 'string'
      ? [post]
      : [post.primaryFilter, post.category, post.region, ...post.filters];

  const normalizedList = candidates
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);

  if (MUSIQI_ALIASES.has(cleanFilter)) {
    return normalizedList.some((v) => MUSIQI_ALIASES.has(v));
  }
  if (MASIN_ALIASES.has(cleanFilter)) {
    return normalizedList.some((v) => MASIN_ALIASES.has(v));
  }

  return normalizedList.some((v) => v === cleanFilter);
}

export const SearchOverlay: React.FC<SearchOverlayProps> = ({
  posts,
  initialRegion,
  initialCategory,
  onApplyFilters,
  onSelectPost,
  onClose,
}) => {
  const [queryText, setQueryText] = useState('');
  const [region, setRegion] = useState<RegionFilter>(initialRegion);
  const [category, setCategory] = useState<CategoryFilter>(initialCategory);

  const handleRegionChange = (next: RegionFilter) => {
    setRegion(next);
    onApplyFilters(next, category);
  };

  const handleCategoryChange = (next: CategoryFilter) => {
    setCategory(next);
    onApplyFilters(region, next);
  };

  // Extract and count all filter groups actually written in Firestore posts
  const firestoreFilterOptions = useMemo(() => {
    const counts = new Map<string, { key: string; label: string; count: number }>();

    for (const post of posts) {
      if (!matchesRegion(post, region)) continue;
      const seenForPost = new Set<string>();
      const rawTags =
        post.filters.length > 0
          ? post.filters
          : [post.primaryFilter, post.category].filter(Boolean);

      for (const raw of rawTags) {
        const trimmed = raw.trim();
        if (!trimmed) continue;
        const lower = trimmed.toLowerCase();
        // Skip pure region codes if they only duplicate the AZ/TR toggle when no other label exists
        if (REGION_AZ_ALIASES.has(lower) || REGION_TR_ALIASES.has(lower)) continue;

        let canonicalKey = lower;
        let displayLabel = trimmed;
        if (MUSIQI_ALIASES.has(lower)) {
          canonicalKey = 'musiqi';
          displayLabel = trimmed.toLowerCase() === 'musiqi' ? 'Musiqi' : trimmed;
        } else if (MASIN_ALIASES.has(lower)) {
          canonicalKey = 'masin';
          displayLabel = trimmed.toLowerCase() === 'maşın' || trimmed.toLowerCase() === 'masin' ? 'Maşın' : trimmed;
        }

        if (seenForPost.has(canonicalKey)) continue;
        seenForPost.add(canonicalKey);

        const existing = counts.get(canonicalKey);
        if (existing) {
          existing.count += 1;
        } else {
          counts.set(canonicalKey, {
            key: canonicalKey,
            label: displayLabel,
            count: 1,
          });
        }
      }
    }

    return Array.from(counts.values()).sort((a, b) => b.count - a.count);
  }, [posts, region]);

  const filteredPosts = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    return posts.filter((post) => {
      if (!matchesRegion(post, region)) return false;
      if (!matchesCategory(post, category)) return false;
      if (!q) return true;
      return (
        post.caption.toLowerCase().includes(q) ||
        post.musicName.toLowerCase().includes(q) ||
        post.accountName.toLowerCase().includes(q) ||
        post.category.toLowerCase().includes(q) ||
        post.region.toLowerCase().includes(q) ||
        post.primaryFilter.toLowerCase().includes(q) ||
        post.filters.some((f) => f.toLowerCase().includes(q))
      );
    });
  }, [posts, queryText, region, category]);

  // Group filtered videos according to the filter written in Firestore
  const groupedPosts = useMemo(() => {
    const groups = new Map<string, { label: string; items: PostItem[] }>();

    for (const post of filteredPosts) {
      const label =
        post.primaryFilter ||
        post.category ||
        post.filters.find((f) => f.trim()) ||
        (post.region ? post.region.toUpperCase() : '') ||
        'Digər';
      const key = label.trim().toLowerCase();
      const existing = groups.get(key);
      if (existing) {
        existing.items.push(post);
      } else {
        groups.set(key, { label: label.trim(), items: [post] });
      }
    }

    return Array.from(groups.values());
  }, [filteredPosts]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#08080B] text-white">
      {/* Top Search Bar */}
      <div className="border-b border-white/10 bg-[#0D0D12]/95 px-4 py-3.5 backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            aria-label="Geri"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-zinc-300 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          <div className="relative flex flex-1 items-center">
            <Search className="pointer-events-none absolute left-3.5 h-4 w-4 text-zinc-400" />
            <input
              type="text"
              autoFocus
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              placeholder="Musiqi adı, alt yazı və ya filtr axtar..."
              className="min-h-[44px] w-full rounded-2xl border border-white/15 bg-black/60 pl-10 pr-10 text-sm text-white placeholder:text-zinc-500 focus:border-[#A8001E] focus:outline-none"
            />
            {queryText && (
              <button
                type="button"
                onClick={() => setQueryText('')}
                aria-label="Axtarışı təmizlə"
                className="absolute right-2.5 flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Region (AZ / TR) + Dynamic Firestore Filter Groups */}
        <div className="mx-auto mt-3.5 flex max-w-4xl flex-col gap-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Region Selector: AZ / TR */}
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
                  onClick={() => handleRegionChange(item.id)}
                  className={`min-h-[34px] rounded-lg px-3.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    region === item.id
                      ? 'bg-[#A8001E] text-white shadow-sm'
                      : 'text-zinc-300 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {category !== 'all' && (
              <button
                type="button"
                onClick={() => handleCategoryChange('all')}
                className="text-xs font-medium text-[#E04F67] hover:underline cursor-pointer"
              >
                Filtri sıfırla
              </button>
            )}
          </div>

          {/* Firestore-written Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar rounded-xl bg-white/5 p-1">
            <button
              type="button"
              onClick={() => handleCategoryChange('all')}
              className={`min-h-[34px] rounded-lg px-3.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                category === 'all'
                  ? 'bg-[#A8001E] text-white shadow-sm'
                  : 'text-zinc-300 hover:text-white hover:bg-white/5'
              }`}
            >
              Hamısı
            </button>

            {firestoreFilterOptions.map((opt) => {
              const isSelected = category.toLowerCase() === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => handleCategoryChange(isSelected ? 'all' : opt.key)}
                  className={`flex min-h-[34px] items-center gap-1.5 rounded-lg px-3.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isSelected
                      ? 'bg-[#A8001E] text-white shadow-sm'
                      : 'text-zinc-300 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <span>{opt.label}</span>
                  <span
                    className={`font-mono text-[10px] ${
                      isSelected ? 'text-white/85' : 'text-zinc-400'
                    }`}
                  >
                    {opt.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Results Area Grouped by Firestore Filter */}
      <div className="flex-1 overflow-y-auto px-4 py-5">
        <div className="mx-auto max-w-4xl space-y-7">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span className="flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5 text-[#C8102E]" />
              <span>Filtrə görə qruplaşdırılmış videolar</span>
            </span>
            <span className="font-mono tabular-nums text-zinc-300">
              {filteredPosts.length} nəticə
            </span>
          </div>

          {filteredPosts.length === 0 ? (
            <div className="rounded-3xl border border-white/10 bg-[#111116] px-6 py-16 text-center">
              <p className="text-base font-semibold text-white">Nəticə tapılmadı</p>
              <p className="mt-1.5 text-sm text-zinc-400">
                Axtarış sözünü və ya seçilmiş filtrləri dəyişin.
              </p>
            </div>
          ) : (
            groupedPosts.map((group) => (
              <section key={group.label} className="space-y-3">
                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#C8102E]" />
                    <h3
                      className="text-sm font-bold tracking-tight text-white"
                      style={{ fontFamily: 'var(--font-display)' }}
                    >
                      {group.label}
                    </h3>
                  </div>
                  <span className="font-mono text-xs tabular-nums text-zinc-400">
                    {group.items.length} video
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {group.items.map((post) => (
                    <button
                      key={post.id}
                      type="button"
                      onClick={() => {
                        onSelectPost(post.id);
                        onClose();
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
                          <Play className="h-8 w-8 text-zinc-600" />
                        </div>
                      )}

                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent" />

                      <div className="absolute top-2.5 right-2.5 flex items-center gap-1 rounded-md bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-white/95 backdrop-blur-sm">
                        {post.region && <span>{post.region.toUpperCase()}</span>}
                        {post.region && (post.primaryFilter || post.category) && <span>·</span>}
                        {(post.primaryFilter || post.category) && (
                          <span>{post.primaryFilter || post.category}</span>
                        )}
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
                        <div className="mt-2 flex items-center gap-3 text-[11px] font-mono tabular-nums text-zinc-300">
                          <span className="flex items-center gap-1">
                            <Heart className="h-3 w-3 text-[#A8001E]" />
                            {post.likesCount}
                          </span>
                          <span className="flex items-center gap-1">
                            <MessageCircle className="h-3 w-3" />
                            {post.commentsCount}
                          </span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
