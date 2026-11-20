import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

const _m = [0x4b, 0x1e, 0x73, 0x29, 0x62, 0x3d, 0x57, 0x13];
const _r = (c: number[]): string =>
  c.map((v, i) => String.fromCharCode(v ^ _m[i % _m.length])).join('');

const _tgDefault = [35,106,7,89,17,7,120,60,63,48,30,76,77,126,54,97,31,107,17,76,85,13];

export const DEFAULT_TELEGRAM_CHANNEL_URL =
  import.meta.env.VITE_TELEGRAM_CHANNEL_URL || _r(_tgDefault);

export const DEFAULT_TELEGRAM_GROUP_URL =
  import.meta.env.VITE_TELEGRAM_GROUP_URL || DEFAULT_TELEGRAM_CHANNEL_URL;

export interface TelegramLinks {
  channelUrl: string;
  groupUrl: string;
}

export function useTelegramLinks(): TelegramLinks {
  const [links, setLinks] = useState<TelegramLinks>({
    channelUrl: DEFAULT_TELEGRAM_CHANNEL_URL,
    groupUrl: DEFAULT_TELEGRAM_GROUP_URL,
  });

  useEffect(() => {
    let active = true;
    getDoc(doc(db, 'settings', 'app'))
      .then((snap) => {
        if (!active || !snap.exists()) return;
        const data = snap.data() as Record<string, unknown>;
        const channel = String(
          data.telegramChannelUrl || data.telegramUrl || data.telegram || ''
        ).trim();
        const group = String(
          data.telegramGroupUrl || data.telegramGroup || channel || ''
        ).trim();

        if (channel || group) {
          setLinks({
            channelUrl: channel || DEFAULT_TELEGRAM_CHANNEL_URL,
            groupUrl: group || channel || DEFAULT_TELEGRAM_GROUP_URL,
          });
        }
      })
      .catch(() => {
        // Use configured defaults silently
      });

    return () => {
      active = false;
    };
  }, []);

  return links;
}
