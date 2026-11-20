import React, { useState } from 'react';
import { User } from 'firebase/auth';
import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { ArrowRight, AtSign, LogOut } from 'lucide-react';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { UserProfile } from '../types';
import { clearSavedRegisteredAccount, saveRegisteredProfile } from '../utils/accountStorage';
import { CaReelsLogo } from './CaReelsLogo';

interface UsernameScreenProps {
  user: User;
  onComplete: (profile: UserProfile) => void;
}

export const UsernameScreen: React.FC<UsernameScreenProps> = ({ user, onComplete }) => {
  const suggested = (user.email?.split('@')[0] || '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 20);

  const [username, setUsername] = useState(suggested);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = username.trim().toLowerCase();

    if (cleaned.length < 3 || cleaned.length > 24) {
      setError('İstifadəçi adı 3 ilə 24 simvol arasında olmalıdır.');
      return;
    }

    if (!/^[a-z0-9_]+$/.test(cleaned)) {
      setError('Yalnız ingilis hərfləri (a-z), rəqəmlər (0-9) və alt xətt (_) istifadə edin.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Check if username is already taken by another user
      const peopleRef = collection(db, 'people');
      try {
        const q = query(peopleRef, where('username', '==', cleaned));
        const snap = await getDocs(q);
        const takenByOther = snap.docs.some((d) => d.id !== user.uid);
        if (takenByOther) {
          setError('Bu istifadəçi adı artıq tutulub. Başqa ad seçin.');
          setSaving(false);
          return;
        }
      } catch {
        // If security rules block listing all people, proceed to write user's own doc
      }

      const profileData = {
        uid: user.uid,
        email: user.email || '',
        username: cleaned,
        photoURL: user.photoURL || '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await setDoc(doc(db, 'people', user.uid), profileData, { merge: true });

      const completedProfile: UserProfile = {
        uid: user.uid,
        email: user.email || '',
        username: cleaned,
        photoURL: user.photoURL || '',
        bio: '',
        following: [],
        followers: [],
        isBlocked: false,
      };
      saveRegisteredProfile(completedProfile);
      onComplete(completedProfile);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `people/${user.uid}`);
      setError('İstifadəçi adı yadda saxlanılarkən xəta baş verdi.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative h-[100dvh] w-full overflow-y-auto overflow-x-hidden bg-[#08080B] text-white flex flex-col items-center justify-center px-6 py-8">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[420px] w-[420px] rounded-full bg-[#A8001E]/20 blur-[140px]"
      />

      <div className="relative z-10 w-full max-w-md rounded-3xl border border-white/10 bg-[#111116]/90 p-7 sm:p-9 shadow-[0_24px_70px_rgba(0,0,0,0.75)] backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CaReelsLogo size={36} />
            <span
              className="text-lg font-extrabold tracking-tight"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              CaReels
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              clearSavedRegisteredAccount(user.uid);
              auth.signOut();
            }}
            className="flex min-h-[40px] items-center gap-1.5 rounded-xl px-3 text-xs font-medium text-zinc-400 hover:bg-white/5 hover:text-white transition-colors cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Çıxış</span>
          </button>
        </div>

        <h1
          className="mt-7 text-2xl font-bold tracking-tight text-white sm:text-3xl"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          İstifadəçi adını seç
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          Daxil olan hesab: <span className="font-medium text-zinc-200">{user.email}</span>
        </p>

        <form onSubmit={handleSubmit} className="mt-7 space-y-5">
          <div>
            <label htmlFor="careels-username" className="block text-xs font-medium text-zinc-300 mb-2">
              Username
            </label>
            <div className="relative flex items-center">
              <AtSign className="pointer-events-none absolute left-4 h-5 w-5 text-[#A8001E]" />
              <input
                id="careels-username"
                type="text"
                autoFocus
                autoComplete="off"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value.replace(/\s+/g, ''));
                  if (error) setError(null);
                }}
                placeholder="istifadeci_adi"
                className="min-h-[50px] w-full rounded-2xl border border-white/15 bg-black/50 pl-11 pr-4 text-base font-medium text-white placeholder:text-zinc-600 focus:border-[#A8001E] focus:outline-none focus:ring-2 focus:ring-[#A8001E]/30 transition-all"
              />
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              Rəylərdə və ayarlarda bu adla görünəcəksiniz.
            </p>
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-xl border border-[#A8001E]/40 bg-[#A8001E]/10 px-4 py-2.5 text-xs font-medium text-rose-200"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={saving || username.trim().length < 3}
            className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-[#A8001E] px-6 py-3.5 text-base font-semibold text-white shadow-[0_10px_30px_rgba(255,32,78,0.35)] transition-all hover:bg-[#C8102E] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
          >
            <span>{saving ? 'Yadda saxlanılır...' : 'Davam et və Proqramı Aç'}</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
