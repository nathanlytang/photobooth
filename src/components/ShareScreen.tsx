import { useEffect, useRef } from 'react';
import { renderQRCode } from '../lib/qrcode';

interface ShareScreenProps {
  active: boolean;
  shareUrl: string | null;
  photoCount: number;
  onDone: () => void;
}

export default function ShareScreen({ active, shareUrl, photoCount, onDone }: ShareScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (active && shareUrl && canvasRef.current) {
      try {
        renderQRCode(canvasRef.current, shareUrl, 560);
      } catch (err) {
        console.error('[qr] Failed to render QR code:', err);
      }
    }
  }, [active, shareUrl]);

  const displayUrl = shareUrl?.replace(/^https?:\/\//, '') || '';

  return (
    <div className={`screen screen-share ${active ? 'active' : ''}`}>
      <div className="flex flex-col items-center justify-center h-full">
        <div className="share-card w-full max-w-2xl rounded-xl border border-border bg-card/90 backdrop-blur-xl shadow-2xl flex flex-col items-center text-center">
          <svg className="share-check-icon text-green-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
          <h2 className="share-heading font-bold tracking-tight text-foreground">Your Photos Are Ready!</h2>
          <p className="text-xl text-muted-foreground mt-1">
            {photoCount} photo{photoCount !== 1 ? 's' : ''} ready to view
          </p>
          <p className="text-muted-foreground mt-4 text-lg">Scan the QR code to view and download your photos</p>
          <canvas ref={canvasRef} className="mt-6 rounded-lg share-qr-canvas" />
          <p className="mt-4 text-lg font-mono text-muted-foreground break-all px-4">{displayUrl}</p>
          <button className="btn-primary-action w-full mt-8" onClick={onDone}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
