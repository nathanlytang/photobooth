import { useEffect, useRef } from 'react';
import type { ThumbnailItem } from '../types';

interface ThumbnailStripProps {
  thumbnails: ThumbnailItem[];
}

export default function ThumbnailStrip({ thumbnails }: ThumbnailStripProps) {
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (stripRef.current) {
      stripRef.current.scrollLeft = stripRef.current.scrollWidth;
    }
  }, [thumbnails]);

  if (thumbnails.length === 0) return null;

  return (
    <div
      ref={stripRef}
      className="flex gap-3 overflow-x-auto max-w-full px-4 py-2 no-scrollbar rounded-xl bg-black/30 backdrop-blur-sm"
    >
      {thumbnails.map((t) =>
        t.url ? (
          <img
            key={t.photoNumber}
            className="thumbnail"
            src={t.url}
            alt={`Photo ${t.photoNumber}`}
          />
        ) : (
          <div key={t.photoNumber} className="thumbnail thumbnail-loading">
            <div className="thumbnail-spinner" />
          </div>
        )
      )}
    </div>
  );
}
