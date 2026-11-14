export interface UserProfile {
  uid: string;
  email: string;
  username: string;
  photoURL?: string;
  isBlocked?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PostItem {
  id: string;
  videoUrl: string;
  posterUrl?: string;
  accountName: string;
  caption: string;
  musicName: string;
  likesCount: number;
  commentsCount: number;
  likedBy: string[];
  region: string;
  category: string;
  filters: string[];
  primaryFilter: string;
  createdAtMs: number;
}

export interface CommentItem {
  id: string;
  postId: string;
  userId: string;
  username: string;
  text: string;
  parentId: string | null;
  createdAtMs: number;
}

export interface WatchHistoryItem {
  postId: string;
  caption: string;
  musicName: string;
  videoUrl: string;
  watchedAt: number;
}

export interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  text: string;
  isAdmin: boolean;
  createdAtMs: number;
}

export interface CarItem {
  id: string;
  plateNumber: string;
  brand: string;
  model: string;
  title: string;
  year: string;
  price: string;
  city: string;
  engine: string;
  fuel: string;
  mileage: string;
  description: string;
  imageUrl: string;
  videoUrl: string;
  phone: string;
  createdAtMs: number;
}

export type MainTab = 'feed' | 'chat';
export type RegionFilter = 'all' | 'az' | 'tr';
export type CategoryFilter = string;
