import { UserProfile } from '../types';

const LAST_PROFILE_KEY = 'careels_last_profile_v1';
const PROFILE_PREFIX = 'careels_profile_';

function isValidProfile(val: unknown): val is UserProfile {
  if (!val || typeof val !== 'object') return false;
  const obj = val as Partial<UserProfile>;
  return Boolean(
    typeof obj.uid === 'string' &&
      obj.uid.trim().length > 0 &&
      typeof obj.username === 'string' &&
      obj.username.trim().length > 0 &&
      !obj.isGuest
  );
}

export function saveRegisteredProfile(profile: UserProfile): void {
  if (!isValidProfile(profile)) return;
  try {
    const serialized = JSON.stringify(profile);
    localStorage.setItem(`${PROFILE_PREFIX}${profile.uid}`, serialized);
    localStorage.setItem(LAST_PROFILE_KEY, serialized);
  } catch {
    // Ignore storage quota or private browsing errors
  }
}

export function loadSavedProfileByUid(uid: string): UserProfile | null {
  if (!uid) return null;
  try {
    const raw = localStorage.getItem(`${PROFILE_PREFIX}${uid}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isValidProfile(parsed) && parsed.uid === uid ? parsed : null;
  } catch {
    return null;
  }
}

export function loadSavedRegisteredProfile(): UserProfile | null {
  try {
    const raw = localStorage.getItem(LAST_PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isValidProfile(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearSavedRegisteredAccount(uid?: string): void {
  try {
    const last = loadSavedRegisteredProfile();
    localStorage.removeItem(LAST_PROFILE_KEY);
    if (uid) {
      localStorage.removeItem(`${PROFILE_PREFIX}${uid}`);
    }
    if (last?.uid) {
      localStorage.removeItem(`${PROFILE_PREFIX}${last.uid}`);
    }
  } catch {
    // Ignore storage errors
  }
}

export function isAccountBlockedFromDoc(data?: Record<string, unknown>): boolean {
  if (!data) return false;
  const statusStr = String(data.status || '').trim().toLowerCase();
  return (
    data.isBlocked === true ||
    data.blocked === true ||
    data.isBanned === true ||
    data.banned === true ||
    statusStr === 'blocked' ||
    statusStr === 'banned'
  );
}
