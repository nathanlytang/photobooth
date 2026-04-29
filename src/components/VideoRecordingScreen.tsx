interface VideoRecordingScreenProps {
  active: boolean;
  prompt: string | null;
  showPromptDuringRecording: boolean;
  elapsedSeconds: number;
  maxSeconds: number;
  onStop: () => void;
}

function formatClock(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function VideoRecordingScreen({
  active,
  prompt,
  showPromptDuringRecording,
  elapsedSeconds,
  maxSeconds,
  onStop,
}: VideoRecordingScreenProps) {
  const remaining = Math.max(0, maxSeconds - elapsedSeconds);
  const nearEnd = remaining <= 10;

  return (
    <div className={`screen screen-video-recording ${active ? 'active' : ''}`}>
      {/* Top: REC badge + timer */}
      <div className="flex items-start justify-between p-6">
        <div className="glass-panel video-rec-badge inline-flex items-center gap-2">
          <span className="video-rec-dot" />
          <span>REC</span>
        </div>
        <div className={`glass-panel video-timer ${nearEnd ? 'warning' : ''}`}>
          {formatClock(elapsedSeconds)} / {formatClock(maxSeconds)}
        </div>
      </div>

      {/* Prompt text (centered top) */}
      {showPromptDuringRecording && prompt && (
        <div className="flex justify-center px-8">
          <div className="glass-panel video-prompt-banner max-w-3xl text-center">
            {prompt}
          </div>
        </div>
      )}

      <div className="mt-auto flex flex-col items-center pb-10">
        <button
          className="video-stop-btn"
          onClick={onStop}
          aria-label="Stop recording"
        >
          <span className="video-stop-btn-inner" />
        </button>
        <span className="video-stop-hint mt-3">Tap to stop</span>
      </div>
    </div>
  );
}
