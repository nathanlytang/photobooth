interface LookIndicatorProps {
  visible: boolean;
  pulsing: boolean;
  position: 'above' | 'below';
  text: string;
}

export default function LookIndicator({ visible, pulsing, position, text }: LookIndicatorProps) {
  const classes = [
    'look-indicator',
    `position-${position}`,
    visible ? '' : 'hidden',
    pulsing ? 'pulsing' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={classes}>
      <div className="look-arrow" />
      <span className="look-text">{text}</span>
    </div>
  );
}
