import { useEffect, useMemo, useRef, useState } from 'react';

interface VideoReadyScreenProps {
  active: boolean;
  prompts: string[];
  selectedPrompt: string | null;
  keptTakeCount: number;
  maxRecordSeconds: number;
  onSelectPrompt: (prompt: string | null) => void;
  onStartRecording: () => void;
  onEndSession: () => void;
}

/**
 * Deterministically shuffle an array on each "reshuffle" click. Uses Fisher-Yates
 * with Math.random. We don't care about cryptographic quality for prompt order.
 */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function VideoReadyScreen({
  active,
  prompts,
  selectedPrompt,
  keptTakeCount,
  maxRecordSeconds,
  onSelectPrompt,
  onStartRecording,
  onEndSession,
}: VideoReadyScreenProps) {
  const [shuffleSeed, setShuffleSeed] = useState(0);

  // Reshuffle every time the screen becomes active (matches "fresh pick per take")
  const prevActive = useRef(active);
  useEffect(() => {
    if (active && !prevActive.current) {
      setShuffleSeed((s) => s + 1);
    }
    prevActive.current = active;
  }, [active]);

  const displayPrompts = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    shuffleSeed;
    return prompts.length > 0 ? shuffle(prompts) : [];
  }, [prompts, shuffleSeed]);

  const maxMinutes = Math.floor(maxRecordSeconds / 60);
  const maxSecondsRem = maxRecordSeconds % 60;
  const maxDurationText = maxMinutes > 0
    ? `${maxMinutes}:${String(maxSecondsRem).padStart(2, '0')}`
    : `${maxSecondsRem}s`;

  return (
    <div className={`screen screen-video-ready ${active ? 'active' : ''}`}>
      {/* End-session button (top-right) */}
      <div className="flex justify-end p-6">
        <button
          className="end-session-btn glass-panel inline-flex items-center gap-2 rounded-xl font-semibold text-white transition-colors hover:bg-black/70"
          onClick={onEndSession}
        >
          {keptTakeCount > 0 ? 'End Session' : 'Cancel'}
        </button>
      </div>

      <div className="flex-1 min-h-0 flex items-center justify-center px-4 pb-6">
        <div className="video-ready-card w-full max-w-4xl max-h-full rounded-xl border border-border bg-card/90 backdrop-blur-xl shadow-2xl flex flex-col gap-6">
          <div className="text-center space-y-1.5">
            <h2 className="video-ready-heading font-bold tracking-tight">
              Leave a Video Message
            </h2>
            {keptTakeCount > 0 && (
              <p className="text-xl text-muted-foreground">
                {keptTakeCount} video{keptTakeCount !== 1 ? 's' : ''} recorded
              </p>
            )}
            {displayPrompts.length > 0 && (
              <p className="text-base text-muted-foreground pt-1">
                Pick a prompt or choose your own direction — {maxDurationText} max
              </p>
            )}
          </div>

          {displayPrompts.length > 0 && (
            <div className="flex-1 min-h-0 flex flex-col gap-2">
              <div className="video-prompt-list flex-1 min-h-0 overflow-y-auto pr-1">
                <div className="grid grid-cols-1 gap-2">
                  {displayPrompts.map((p) => (
                    <button
                      key={p}
                      className={`video-prompt-btn ${selectedPrompt === p ? 'selected' : ''}`}
                      onClick={() => onSelectPrompt(selectedPrompt === p ? null : p)}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <button
                className="video-prompt-skip-btn shrink-0"
                onClick={() => onSelectPrompt(null)}
              >
                {selectedPrompt === null ? 'No prompt selected' : 'Skip the prompt'}
              </button>
            </div>
          )}

          <button className="btn-primary-action w-full shrink-0" onClick={onStartRecording}>
            Start Recording
          </button>
        </div>
      </div>
    </div>
  );
}
