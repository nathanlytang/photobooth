interface SuccessOverlayProps {
  active: boolean;
}

export default function SuccessOverlay({ active }: SuccessOverlayProps) {
  return (
    <div className={`overlay ${active ? 'active' : ''}`}>
      <div className="success-card glass-panel flex flex-col items-center text-center">
        <svg className="success-icon text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
        <h2 className="success-heading font-bold text-white">Success!</h2>
        <p className="success-text text-white/80">Your photos will be sent to you soon.</p>
      </div>
    </div>
  );
}
