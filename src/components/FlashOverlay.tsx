interface FlashOverlayProps {
  active: boolean;
}

export default function FlashOverlay({ active }: FlashOverlayProps) {
  return (
    <div className={`overlay flash-overlay ${active ? 'active' : ''}`} />
  );
}
