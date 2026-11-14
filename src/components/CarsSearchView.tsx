import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { Car, Search, X } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { CarItem } from '../types';
import { CaReelsLogo } from './CaReelsLogo';

function normalizePlate(value: string): string {
  return value.replace(/[\s\-_.]/g, '').toLowerCase();
}

function resolveMediaUrl(raw: unknown): string {
  if (!raw) return '';
  if (Array.isArray(raw) && raw.length > 0) {
    return resolveMediaUrl(raw[0]);
  }
  if (typeof raw === 'object' && raw !== null && 'url' in raw) {
    return resolveMediaUrl((raw as { url?: unknown }).url);
  }
  if (typeof raw !== 'string') return '';
  let trimmed = raw.trim();
  if (!trimmed) return '';

  if (/^(files\.)?catbox\.moe\//i.test(trimmed)) {
    trimmed = `https://${trimmed}`;
  }
  if (/^http:\/\/(files\.)?catbox\.moe\//i.test(trimmed)) {
    trimmed = trimmed.replace(/^http:\/\//i, 'https://');
  }
  if (/^https:\/\/catbox\.moe\/([^/]+\.[a-z0-9]+)$/i.test(trimmed)) {
    trimmed = trimmed.replace(/^https:\/\/catbox\.moe\//i, 'https://files.catbox.moe/');
  }

  if (trimmed.startsWith('gs://')) {
    const withoutScheme = trimmed.slice(5);
    const slashIdx = withoutScheme.indexOf('/');
    if (slashIdx > 0) {
      const bucket = withoutScheme.slice(0, slashIdx);
      const path = withoutScheme.slice(slashIdx + 1);
      return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media`;
    }
  }
  return trimmed;
}

function extractCarPhoto(data: Record<string, unknown>): string {
  const candidates = [
    data.photoUrl,
    data.photoURL,
    data.photo_url,
    data.photo,
    data.foto,
    data.fotoUrl,
    data.imageUrl,
    data.imageURL,
    data.image_url,
    data.image,
    data.images,
    data.photos,
    data.sekil,
    data.img,
    data.pic,
    data.thumbnail,
    data.catbox,
    data.catboxUrl,
    data.url,
    data.link,
  ];
  for (const c of candidates) {
    const resolved = resolveMediaUrl(c);
    if (resolved) return resolved;
  }
  for (const val of Object.values(data)) {
    if (typeof val === 'string') {
      const t = val.trim();
      if (
        t.includes('catbox.moe') ||
        t.startsWith('gs://') ||
        (t.startsWith('http') &&
          (/\.(jpg|jpeg|png|webp|gif|avif)(\?|$)/i.test(t) ||
            t.includes('firebasestorage')))
      ) {
        return resolveMediaUrl(t);
      }
    }
  }
  return '';
}

export const CarsSearchView: React.FC = () => {
  const [cars, setCars] = useState<CarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [plateQuery, setPlateQuery] = useState('');
  const [zoomedCar, setZoomedCar] = useState<CarItem | null>(null);
  const [proxyFallbackIds, setProxyFallbackIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const carsRef = collection(db, 'cars');
    const unsub = onSnapshot(
      carsRef,
      (snapshot) => {
        const list: CarItem[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data() as Record<string, unknown>;
          const plateNumber = String(
            data.plateNumber ||
              data.plate_number ||
              data.plate ||
              data.carNumber ||
              data.car_number ||
              data.number ||
              data.nomre ||
              data['nömrə'] ||
              data.avtomobilNomresi ||
              data.licensePlate ||
              data.kod ||
              docSnap.id ||
              ''
          ).trim();

          const brand = String(data.brand || data.make || data.marka || '');
          const model = String(data.model || '');
          const title = String(
            data.title || data.name || `${brand} ${model}`.trim() || plateNumber || 'Avtomobil'
          );

          const imageUrl = extractCarPhoto(data);
          const videoUrl = resolveMediaUrl(data.videoUrl || data.video || '');

          const ts = data.createdAt;
          const createdAtMs =
            ts && typeof ts === 'object' && typeof (ts as { toMillis?: () => number }).toMillis === 'function'
              ? (ts as { toMillis: () => number }).toMillis()
              : ts && typeof ts === 'object' && typeof (ts as { seconds?: number }).seconds === 'number'
                ? (ts as { seconds: number }).seconds * 1000
                : typeof data.createdAtMs === 'number'
                  ? data.createdAtMs
                  : 0;

          return {
            id: docSnap.id,
            plateNumber,
            brand,
            model,
            title,
            year: String(data.year || data.il || ''),
            price: String(data.price || data.qiymet || data.amount || ''),
            city: String(data.city || data.location || data.seher || data.region || ''),
            engine: String(data.engine || data.motor || ''),
            fuel: String(data.fuel || data.yanacaq || ''),
            mileage: String(data.mileage || data.yurus || data.km || ''),
            description: String(data.description || data.details || data.about || data.melumat || ''),
            imageUrl,
            videoUrl,
            phone: String(data.phone || data.contact || data.telefon || ''),
            createdAtMs,
          };
        });

        list.sort((a, b) => b.createdAtMs - a.createdAtMs);
        setCars(list);
        setLoading(false);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'cars');
        setLoading(false);
      }
    );

    return () => unsub();
  }, []);

  const filteredCars = useMemo(() => {
    const q = normalizePlate(plateQuery);
    if (!q) return cars;
    return cars.filter(
      (car) =>
        normalizePlate(car.plateNumber).includes(q) ||
        normalizePlate(car.id).includes(q)
    );
  }, [cars, plateQuery]);

  const getDisplayImageSrc = (car: CarItem) => {
    if (!car.imageUrl) return '';
    if (proxyFallbackIds[car.id] && car.imageUrl.startsWith('http')) {
      return `/api/video-proxy?url=${encodeURIComponent(car.imageUrl)}`;
    }
    return car.imageUrl;
  };

  return (
    <div className="flex h-full w-full flex-col bg-[#08080B] text-white">
      {/* Header with single Car Plate Number Search Box */}
      <header className="border-b border-white/10 bg-[#0D0D12]/95 px-4 pt-4 pb-4 backdrop-blur-xl">
        <div className="mx-auto max-w-3xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <CaReelsLogo size={32} />
              <h1 className="text-lg font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
                Maşın Axtarış
              </h1>
            </div>
            <span className="font-mono text-xs tabular-nums text-zinc-400">
              {filteredCars.length} nəticə
            </span>
          </div>

          <div className="relative flex items-center">
            <Search className="pointer-events-none absolute left-4 h-4 w-4 text-[#C8102E]" />
            <input
              type="text"
              value={plateQuery}
              onChange={(e) => setPlateQuery(e.target.value.toUpperCase())}
              placeholder="Avtomobil nömrəsini yazın (məs. 90-AA-001)"
              className="min-h-[48px] w-full rounded-2xl border border-white/15 bg-black/70 pl-11 pr-11 font-mono text-sm font-semibold tracking-wider text-white placeholder:font-sans placeholder:font-normal placeholder:tracking-normal placeholder:text-zinc-500 focus:border-[#A8001E] focus:outline-none"
            />
            {plateQuery && (
              <button
                type="button"
                onClick={() => setPlateQuery('')}
                aria-label="Nömrəni təmizlə"
                className="absolute right-2.5 flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Open Car Photos Feed */}
      <div className="flex-1 overflow-y-auto px-4 pt-5 pb-24">
        <div className="mx-auto max-w-3xl space-y-5">
          {loading ? (
            <div className="py-16 text-center text-sm text-zinc-400">
              Avtomobillər yüklənir...
            </div>
          ) : filteredCars.length === 0 ? (
            <div className="mx-auto mt-10 max-w-md rounded-3xl border border-white/10 bg-[#101015] p-8 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#A8001E]/20 text-[#C8102E]">
                <Car className="h-6 w-6" />
              </div>
              <h2 className="mt-4 text-base font-bold text-white" style={{ fontFamily: 'var(--font-display)' }}>
                {cars.length === 0
                  ? 'Avtomobil əlavə edilməyib'
                  : 'Bu nömrəyə uyğun avtomobil tapılmadı'}
              </h2>
              <p className="mt-1.5 text-xs text-zinc-400">
                {cars.length === 0
                  ? 'Firestore "cars" kolleksiyasına əlavə edilən avtomobil şəkilləri burada açıq şəkildə görünəcək.'
                  : 'Avtomobil nömrəsini düzgün yazdığınızdan əmin olun.'}
              </p>
            </div>
          ) : (
            filteredCars.map((car) => {
              const photoSrc = getDisplayImageSrc(car);
              return (
                <article
                  key={car.id}
                  className="overflow-hidden rounded-3xl border border-white/15 bg-[#101015] shadow-lg"
                >
                  {/* Plate Number Header */}
                  <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="rounded-lg border border-white/25 bg-white px-2.5 py-1 font-mono text-sm font-extrabold tracking-widest text-black">
                        {car.plateNumber || car.id}
                      </span>
                      {car.title && car.title !== car.plateNumber && (
                        <span className="text-sm font-semibold text-zinc-200 truncate">
                          {car.title}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Open Full Unobstructed Photo Display */}
                  <div className="w-full bg-black">
                    {photoSrc ? (
                      <button
                        type="button"
                        onClick={() => setZoomedCar(car)}
                        className="block w-full cursor-zoom-in"
                      >
                        <img
                          src={photoSrc}
                          alt={car.plateNumber || car.title}
                          referrerPolicy="no-referrer"
                          onError={() => {
                            if (!proxyFallbackIds[car.id] && car.imageUrl.startsWith('http')) {
                              setProxyFallbackIds((prev) => ({ ...prev, [car.id]: true }));
                            }
                          }}
                          className="max-h-[520px] w-full object-contain mx-auto"
                        />
                      </button>
                    ) : car.videoUrl ? (
                      <video
                        src={car.videoUrl}
                        controls
                        playsInline
                        className="max-h-[520px] w-full object-contain mx-auto"
                      />
                    ) : (
                      <div className="flex h-56 w-full flex-col items-center justify-center text-zinc-500">
                        <Car className="h-10 w-10 text-[#A8001E]/60" />
                        <span className="mt-2 text-xs">Foto linki yoxdur</span>
                      </div>
                    )}
                  </div>

                  {car.description && (
                    <div className="px-4 py-3 text-sm text-zinc-300 border-t border-white/10">
                      {car.description}
                    </div>
                  )}
                </article>
              );
            })
          )}
        </div>
      </div>

      {/* Fullscreen Photo Zoom Modal */}
      {zoomedCar && getDisplayImageSrc(zoomedCar) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4"
          onClick={() => setZoomedCar(null)}
        >
          <button
            type="button"
            onClick={() => setZoomedCar(null)}
            aria-label="Bağla"
            className="absolute top-4 right-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={getDisplayImageSrc(zoomedCar)}
            alt={zoomedCar.plateNumber}
            referrerPolicy="no-referrer"
            className="max-h-[92vh] max-w-full object-contain"
          />
        </div>
      )}
    </div>
  );
};
