import ThumbnailStrip from './ThumbnailStrip';
import type { ThumbnailItem } from '../types';

interface SessionScreenProps {
  active: boolean;
  thumbnails: ThumbnailItem[];
  isCapturing: boolean;
  onCapture: () => void;
  onEndSession: () => void;
}

export default function SessionScreen({
  active,
  thumbnails,
  isCapturing,
  onCapture,
  onEndSession,
}: SessionScreenProps) {
  return (
    <div className={`screen ${active ? 'active' : ''}`}>
      <div className="flex justify-end p-6">
        <button
          className="end-session-btn glass-panel inline-flex items-center gap-2 rounded-xl font-semibold text-white transition-colors hover:bg-black/70"
          onClick={onEndSession}
        >
          End Session
        </button>
      </div>
      <div className="mt-auto flex flex-col items-center gap-5 pb-8">
        <ThumbnailStrip thumbnails={thumbnails} />
        <button
          className="capture-btn"
          disabled={isCapturing}
          onClick={onCapture}
        >
          <span className="capture-btn-inner" />
        </button>
      </div>
    </div>
  );
}
