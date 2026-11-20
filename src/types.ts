export interface UserProfile {
  uid: string;
  email: string;
  username: string;
  photoURL?: string;
  bio?: string;
  following?: string[];
  followers?: string[];
  isBlocked?: boolean;
  isGuest?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PublicPersonProfile {
  uid: string;
  username: string;
  photoURL?: string;
  bio?: string;
  following: string[];
  followers: string[];
}

export interface PostItem {
  id: string;
  videoUrl: string;
  posterUrl?: string;
  accountName: string;
  authorPhotoURL?: string;
  caption: string;
  musicName: string;
  likesCount: number;
  commentsCount: number;
  likedBy: string[];
  region: string;
  category: string;
  filters: string[];
  primaryFilter: string;
  uid?: string;
  username?: string;
  createdAtMs: number;
}

export interface CommentItem {
  id: string;
  postId: string;
  userId: string;
  username: string;
  authorPhotoURL?: string;
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
  authorPhotoURL?: string;
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

export type MainTab = 'feed' | 'cars' | 'chat' | 'profile';
export type RegionFilter = 'all' | 'az' | 'tr';
export type CategoryFilter = string;
