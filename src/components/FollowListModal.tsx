import React from 'react';
import { ChevronRight, Users, X } from 'lucide-react';
import { PublicPersonProfile } from '../types';
import { UserAvatar } from './UserAvatar';

interface FollowListModalProps {
  title: string;
  users: PublicPersonProfile[];
  onSelectUser: (user: PublicPersonProfile) => void;
  onClose: () => void;
}

export const FollowListModal: React.FC<FollowListModalProps> = ({
  title,
  users,
  onSelectUser,
  onClose,
}) => {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="flex max-h-[82dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-white/15 bg-[#0E0E13] text-white shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-[#E04F67]" />
            <h3
              className="text-base font-bold"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {title} ({users.length})
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Bağla"
            className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {users.length === 0 ? (
            <div className="py-12 text-center text-xs text-zinc-400">
              Hələ heç bir hesab yoxdur.
            </div>
          ) : (
            <div className="space-y-1.5">
              {users.map((person) => {
                const handle = person.username
                  ? `@${person.username.replace(/^@+/, '')}`
                  : '@istifadeci';
                return (
                  <button
                    key={person.uid}
                    type="button"
                    onClick={() => {
                      onClose();
                      onSelectUser(person);
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-2xl border border-white/5 bg-white/[0.03] px-3.5 py-2.5 text-left hover:bg-white/[0.08] transition-colors cursor-pointer"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <UserAvatar
                        photoURL={person.photoURL}
                        name={person.username || 'CR'}
                        sizeClass="h-11 w-11"
                        textClass="text-xs"
                      />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold text-white">
                          {handle}
                        </div>
                        {person.bio && (
                          <div className="truncate text-xs text-zinc-400">
                            {person.bio}
                          </div>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-zinc-500" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
