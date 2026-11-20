import React, { useEffect, useState } from 'react';

interface UserAvatarProps {
  photoURL?: string;
  name?: string;
  sizeClass?: string;
  textClass?: string;
  className?: string;
}

export const UserAvatar: React.FC<UserAvatarProps> = ({
  photoURL,
  name,
  sizeClass = 'h-11 w-11',
  textClass = 'text-xs',
  className = '',
}) => {
  const [useProxy, setUseProxy] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  const normalizedPhotoURL = React.useMemo(() => {
    const raw = (photoURL || '').trim();
    if (!raw) return '';
    let url = raw;
    if (/^(files\.)?catbox\.moe\//i.test(url)) {
      url = `https://${url}`;
    }
    if (/^http:\/\/(files\.)?catbox\.moe\//i.test(url)) {
      url = url.replace(/^http:\/\//i, 'https://');
    }
    if (/^https:\/\/catbox\.moe\/([^/]+\.[a-z0-9]+)$/i.test(url)) {
      url = url.replace(/^https:\/\/catbox\.moe\//i, 'https://files.catbox.moe/');
    }
    return url;
  }, [photoURL]);

  useEffect(() => {
    setUseProxy(false);
    setImgFailed(false);
  }, [normalizedPhotoURL]);

  const cleanName = (name || 'CR').replace(/^@+/, '').trim();
  const initials = (cleanName.slice(0, 2) || 'CR').toUpperCase();

  const resolvedSrc =
    normalizedPhotoURL && !imgFailed
      ? useProxy && normalizedPhotoURL.startsWith('http')
        ? `/api/video-proxy?url=${encodeURIComponent(normalizedPhotoURL)}`
        : normalizedPhotoURL
      : '';

  return (
    <div
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-[#A8001E] to-[#3B000B] font-extrabold text-white select-none ${sizeClass} ${textClass} ${className}`}
    >
      {resolvedSrc ? (
        <img
          src={resolvedSrc}
          alt={cleanName || 'Profil şəkli'}
          referrerPolicy="no-referrer"
          onError={() => {
            if (!useProxy && photoURL?.startsWith('http')) {
              setUseProxy(true);
            } else {
              setImgFailed(true);
            }
          }}
          className="h-full w-full object-cover opacity-100"
        />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
};
