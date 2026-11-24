"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { compressPhoto } from "@/lib/compress-photo";

type Shot = { id: number; createdAt: string };

export function BrandPhotos({ drugId, onChange }: { drugId: number; onChange?: () => void }) {
  const [photos, setPhotos] = useState<Shot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);

  useEffect(() => {
    let cancel = false;
    api<{ photos: Shot[] }>(`/api/drugs/${drugId}/photos`)
      .then((result) => {
        if (!cancel) setPhotos(result.photos);
      })
      .catch(() => {
        if (!cancel) setPhotos([]);
      });
    return () => {
      cancel = true;
    };
  }, [drugId]);

  return (
    <div className="space-y-2 sm:col-span-2">
      <span className="text-sm font-medium">Packaging photos</span>
      <p className="text-xs text-muted">Up to six pictures of the box, so the next person can match it on the shelf.</p>
      <div className="flex flex-wrap items-center gap-2">
        {photos.map((photo) => (
          <div key={photo.id} className="relative">
            <button type="button" onClick={() => setOpenId(photo.id)} className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/drugs/${drugId}/photos/${photo.id}`} alt="" className="size-16 rounded-lg object-cover" />
            </button>
            <button
              type="button"
              className="absolute -right-1 -top-1 rounded-full bg-ink px-1.5 text-[10px] text-paper-2"
              onClick={() => {
                void api<{ photos: Shot[] }>(`/api/drugs/${drugId}/photos/${photo.id}`, { method: "DELETE" })
                  .then((result) => {
                    setPhotos(result.photos);
                    onChange?.();
                  })
                  .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Could not remove that photo."));
              }}
            >
              ×
            </button>
          </div>
        ))}
        <label className="inline-flex cursor-pointer items-center rounded-lg border border-line bg-paper-2 px-3 py-2 text-sm">
          Add photo
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              setError(null);
              void compressPhoto(file)
                .then((photo) => api<{ photos: Shot[] }>(`/api/drugs/${drugId}/photos`, {
                  method: "POST",
                  body: JSON.stringify({ photo }),
                }))
                .then((result) => {
                  setPhotos(result.photos);
                  onChange?.();
                })
                .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Could not save that photo."));
            }}
          />
        </label>
      </div>
      {error ? <p className="text-sm text-clay">{error}</p> : null}
      {openId ? (
        <button type="button" className="block" onClick={() => setOpenId(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/drugs/${drugId}/photos/${openId}`} alt="Packaging" className="max-h-64 rounded-lg" />
        </button>
      ) : null}
    </div>
  );
}
