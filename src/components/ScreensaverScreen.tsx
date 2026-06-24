interface ScreensaverScreenProps {
  active: boolean;
  eventName: string | null;
  onDismiss: () => void;
}

/**
 * Full-screen black screensaver shown after the idle screen has been
 * untouched for `screensaverTimeoutSeconds`.
 *
 * Tapping/clicking anywhere dismisses it and returns to the idle screen.
 */
export default function ScreensaverScreen({ active, eventName, onDismiss }: ScreensaverScreenProps) {
  if (!active) return null;

  return (
    <div
      className="screensaver"
      onClick={onDismiss}
      onTouchStart={onDismiss}
      role="button"
      aria-label="Tap to continue"
    >
      <div className="screensaver-inner">
        {eventName && <div className="screensaver-event">{eventName}</div>}
        <div className="screensaver-divider" aria-hidden="true" />
        <div className="screensaver-title">PHOTOBOOTH</div>
      </div>
      <div className="screensaver-hint">Tap anywhere to continue</div>
    </div>
  );
}
