interface IdleScreenProps {
  active: boolean;
  onStart: () => void;
}

export default function IdleScreen({ active, onStart }: IdleScreenProps) {
  return (
    <div className={`screen ${active ? 'active' : ''}`}>
      <div className="mt-auto flex flex-col items-center pb-12">
        <button className="btn-primary-action" onClick={onStart}>
          Start Session
        </button>
      </div>
    </div>
  );
}
