interface IdleScreenProps {
  active: boolean;
  videoEnabled: boolean;
  onStart: () => void;
  onStartVideo: () => void;
}

export default function IdleScreen({ active, videoEnabled, onStart, onStartVideo }: IdleScreenProps) {
  return (
    <div className={`screen ${active ? 'active' : ''}`}>
      <div className="mt-auto flex flex-col items-center gap-4 pb-12">
        {videoEnabled ? (
          <>
            <button className="btn-primary-action idle-mode-btn" onClick={onStart}>
              Take Photos
            </button>
            <button className="btn-secondary-action idle-mode-btn" onClick={onStartVideo}>
              Leave a Video Message
            </button>
          </>
        ) : (
          <button className="btn-primary-action" onClick={onStart}>
            Start Session
          </button>
        )}
      </div>
    </div>
  );
}
