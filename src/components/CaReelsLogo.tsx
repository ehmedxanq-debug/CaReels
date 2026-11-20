import React from 'react';

interface CaReelsLogoProps {
  size?: number;
  className?: string;
  variant?: 'badge' | 'bare' | 'flame';
}

export const CaReelsLogo: React.FC<CaReelsLogoProps> = ({
  size = 40,
  className = '',
  variant = 'badge',
}) => {
  if (variant === 'flame') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-label="CaReels Alov Loqosu"
      >
        <defs>
          <linearGradient id="careels-flame-bg" x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#CC1133" />
            <stop offset="55%" stopColor="#9E001C" />
            <stop offset="100%" stopColor="#4A000D" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="32" fill="url(#careels-flame-bg)" />
        {/* Pure solid white flame */}
        <path
          d="M34.2 12.5C35.2 18.8 31.1 22.8 29.3 25.4C27.2 28.4 26.8 31.2 28.1 33.4C29.3 31.3 31.3 29.7 33.4 28.9C33.8 24.8 37.3 21.1 40.2 19.3C41.8 24.4 47.5 28.6 47.5 36.8C47.5 45.4 40.6 51.8 32 51.8C23.4 51.8 16.5 45.4 16.5 36.8C16.5 29.6 21.4 24.8 25.6 21.2C29.4 18 32.7 15.6 34.2 12.5Z"
          fill="#FFFFFF"
        />
      </svg>
    );
  }

  if (variant === 'bare') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-label="CaReels Maşın Loqosu"
      >
        <defs>
          <linearGradient id="careels-car-bare" x1="8" y1="20" x2="56" y2="46" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FF3B5C" />
            <stop offset="55%" stopColor="#B80021" />
            <stop offset="100%" stopColor="#6E0014" />
          </linearGradient>
        </defs>
        {/* Aggressive lowered (peredoklu) sports silhouette */}
        <path
          d="M7 40.5C7 37.5 9.2 35 12.8 34.1L20.5 26.8C23.1 24.4 26.7 23.2 30.8 23.2H42.2C45.8 23.2 49.2 24.8 51.6 27.6L55.2 32C56.8 33.9 57.5 36.1 57.2 38.8L56.7 41.8C56.5 43.1 55.4 44 54 44H50.4C50.4 40.3 47.4 37.3 43.7 37.3C40 37.3 37 40.3 37 44H24.6C24.6 40.3 21.6 37.3 17.9 37.3C14.2 37.3 11.2 40.3 11.2 44H9.4C8 44 7 42.9 7 41.5V40.5Z"
          fill="url(#careels-car-bare)"
        />
        {/* Sleek cabin glass */}
        <path
          d="M23.2 32.8L28.6 26.6H41.4C43.7 26.6 45.9 27.7 47.4 29.5L49.9 32.8H23.2Z"
          fill="#0B0B10"
          fillOpacity="0.88"
        />
        {/* Front stance splitter + LED headlight */}
        <path d="M51 35.5H56.4L55.6 37.6H49.8L51 35.5Z" fill="#FFE4E8" />
        <path d="M6 45.8H58" stroke="#E11D48" strokeWidth="2.2" strokeLinecap="round" />
        {/* Lowered wheels */}
        <circle cx="17.9" cy="44" r="5.2" fill="#0B0B10" stroke="#FFE4E8" strokeWidth="1.8" />
        <circle cx="17.9" cy="44" r="1.9" fill="#FF3B5C" />
        <circle cx="43.7" cy="44" r="5.2" fill="#0B0B10" stroke="#FFE4E8" strokeWidth="1.8" />
        <circle cx="43.7" cy="44" r="1.9" fill="#FF3B5C" />
      </svg>
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="CaReels Maşın Loqosu"
    >
      <defs>
        <linearGradient id="careels-dark-red" x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#CC1133" />
          <stop offset="55%" stopColor="#9E001C" />
          <stop offset="100%" stopColor="#4A000D" />
        </linearGradient>
        <linearGradient id="careels-car-body" x1="10" y1="22" x2="54" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#FFD6DE" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="18" fill="url(#careels-dark-red)" />
      {/* Subtle hood/road stance speed glow */}
      <path d="M9 46.5H55" stroke="white" strokeOpacity="0.35" strokeWidth="2" strokeLinecap="round" />
      {/* Modern peredoklu lowered coupe silhouette (front nose pitched low) */}
      <path
        d="M8.5 38.2C8.7 35.7 10.6 33.8 13.4 33L21.3 25.4C23.8 23.1 27.2 22 31.1 22H40.6C44.1 22 47.4 23.6 49.8 26.4L53.7 31.2C55.4 33.2 56 35.6 55.6 38.4L55.2 40.9C55 42.1 54 43 52.7 43H49.3C49.3 39.6 46.5 36.8 43.1 36.8C39.7 36.8 36.9 39.6 36.9 43H25.1C25.1 39.6 22.3 36.8 18.9 36.8C15.5 36.8 12.7 39.6 12.7 43H10.7C9.4 43 8.4 41.9 8.5 40.5V38.2Z"
        fill="url(#careels-car-body)"
      />
      {/* Tinted fastback cabin window */}
      <path
        d="M23.8 31.8L28.8 25.4H39.8C42.1 25.4 44.3 26.5 45.7 28.4L48.3 31.8H23.8Z"
        fill="#2B0008"
      />
      {/* Sharp aggressive front LED headlight + front lip accent */}
      <path d="M49.5 34.6H55L54.1 36.6H48.2L49.5 34.6Z" fill="#FF2E54" />
      <path d="M46.5 42.6H54.5" stroke="#FF758F" strokeWidth="1.6" strokeLinecap="round" />
      {/* Lowered multi-spoke wheels tucked tightly into fenders */}
      <circle cx="18.9" cy="43" r="4.8" fill="#170206" stroke="#FFFFFF" strokeWidth="1.8" />
      <circle cx="18.9" cy="43" r="1.7" fill="#FF3B5C" />
      <circle cx="43.1" cy="43" r="4.8" fill="#170206" stroke="#FFFFFF" strokeWidth="1.8" />
      <circle cx="43.1" cy="43" r="1.7" fill="#FF3B5C" />
    </svg>
  );
};
