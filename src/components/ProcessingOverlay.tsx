interface ProcessingOverlayProps {
  active: boolean;
}

export default function ProcessingOverlay({ active }: ProcessingOverlayProps) {
  return (
    <div className={`overlay screen-processing ${active ? 'active' : ''}`}>
      <div className="flex flex-col items-center gap-4">
        <div className="processing-spinner" />
        <span className="text-lg font-medium text-white">Capturing...</span>
      </div>
    </div>
  );
}
