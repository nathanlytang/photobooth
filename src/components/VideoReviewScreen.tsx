interface VideoReviewScreenProps {
  active: boolean;
  onKeep: () => void;
  onRetake: () => void;
}

export default function VideoReviewScreen({ active, onKeep, onRetake }: VideoReviewScreenProps) {
  return (
    <div className={`screen screen-video-review ${active ? 'active' : ''}`}>
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="video-review-card w-full max-w-3xl rounded-xl border border-border bg-card/90 backdrop-blur-xl shadow-2xl text-center space-y-8">
          <div className="space-y-2">
            <h2 className="video-review-heading font-bold tracking-tight">
              How was that?
            </h2>
            <p className="text-xl text-muted-foreground">
              Keep this take, or record it again.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <button className="btn-secondary-action video-review-btn" onClick={onRetake}>
              Record Again
            </button>
            <button className="btn-primary-action video-review-btn" onClick={onKeep}>
              Keep It
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
