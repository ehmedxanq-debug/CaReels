import React from 'react';

interface CaReelsLogoProps {
  size?: number;
  className?: string;
  variant?: 'badge' | 'bare';
}

export const CaReelsLogo: React.FC<CaReelsLogoProps> = ({
  size = 40,
  className = '',
  variant = 'badge',
}) => {
  if (variant === 'bare') {
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
          <linearGradient id="careels-bare-flame" x1="18" y1="10" x2="46" y2="54" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#E11D48" />
            <stop offset="50%" stopColor="#A8001E" />
            <stop offset="100%" stopColor="#6E0014" />
          </linearGradient>
          <linearGradient id="careels-bare-core" x1="32" y1="28" x2="32" y2="47" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FF758F" />
            <stop offset="100%" stopColor="#C8102E" />
          </linearGradient>
        </defs>
        <path
          d="M34.6 9.5C34.6 9.5 36.6 19.2 30 25.6C27.8 27.8 25.9 26.6 25.5 23.6C25.1 20.9 22.6 19.6 22.6 19.6C22.6 19.6 14.8 27.1 14.8 37.5C14.8 47.4 22.5 55 32 55C41.5 55 49.2 47.4 49.2 37.5C49.2 25.2 40.6 15.2 34.6 9.5Z"
          fill="url(#careels-bare-flame)"
        />
        <path
          d="M32.5 29.5C32.5 29.5 37.6 34 37.6 39.8C37.6 43.7 35 46.8 32 46.8C29 46.8 26.4 43.7 26.4 39.8C26.4 36.5 28.5 33.9 29.2 33.1C29.2 33.1 29.9 35.6 31.6 35.6C32.9 35.6 32.5 29.5 32.5 29.5Z"
          fill="url(#careels-bare-core)"
        />
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
      aria-label="CaReels Alov Loqosu"
    >
      <defs>
        <linearGradient id="careels-dark-red" x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#CC1133" />
          <stop offset="55%" stopColor="#9E001C" />
          <stop offset="100%" stopColor="#5C0010" />
        </linearGradient>
        <linearGradient id="careels-flame-inner" x1="32" y1="22" x2="32" y2="49" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFE4E8" />
          <stop offset="100%" stopColor="#FF8FA3" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="18" fill="url(#careels-dark-red)" />
      {/* Outer flame silhouette */}
      <path
        d="M34.2 12.5C34.2 12.5 35.8 20.6 30.2 26.1C28.4 27.9 26.8 26.9 26.5 24.4C26.2 22.1 24.1 21 24.1 21C24.1 21 17.5 27.4 17.5 36.2C17.5 44.5 24 51 32 51C40 51 46.5 44.5 46.5 36.2C46.5 25.8 39.2 17.3 34.2 12.5Z"
        fill="white"
      />
      {/* Inner flame tongue */}
      <path
        d="M32.4 29.5C32.4 29.5 36.8 33.4 36.8 38.4C36.8 41.7 34.6 44.5 32 44.5C29.4 44.5 27.2 41.7 27.2 38.4C27.2 35.6 29 33.3 29.6 32.6C29.6 32.6 30.2 34.8 31.6 34.8C32.7 34.8 32.4 29.5 32.4 29.5Z"
        fill="url(#careels-flame-inner)"
      />
    </svg>
  );
};
