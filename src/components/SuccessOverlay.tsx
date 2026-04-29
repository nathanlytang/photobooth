export type SuccessVariant = 'photos-sent' | 'videos-saved' | 'videos-sent';

interface SuccessOverlayProps {
  active: boolean;
  variant: SuccessVariant;
}

const VARIANT_MESSAGES: Record<SuccessVariant, string> = {
  'photos-sent': 'Your photos will be sent to you soon.',
  'videos-saved': 'Your video messages were saved.',
  'videos-sent': 'Your video messages will be sent to you soon.',
};

export default function SuccessOverlay({ active, variant }: SuccessOverlayProps) {
  return (
    <div className={`overlay ${active ? 'active' : ''}`}>
      <div className="success-card glass-panel flex flex-col items-center text-center">
        <svg className="success-icon text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
        <h2 className="success-heading font-bold text-white">Thank you!</h2>
        <p className="success-text text-white/80">{VARIANT_MESSAGES[variant]}</p>
      </div>
    </div>
  );
}
