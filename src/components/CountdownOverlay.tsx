interface CountdownOverlayProps {
  active: boolean;
  value: number;
}

export default function CountdownOverlay({ active, value }: CountdownOverlayProps) {
  return (
    <div className={`overlay ${active ? 'active' : ''}`} style={{ background: 'rgba(0,0,0,0.35)', zIndex: 60 }}>
      <div
        className="countdown-number font-black text-white countdown-pulse"
        style={{ textShadow: '0 0 60px rgba(0,0,0,0.7)' }}
      >
        {value}
      </div>
    </div>
  );
}
