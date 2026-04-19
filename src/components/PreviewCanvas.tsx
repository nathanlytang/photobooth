import { useRef, useCallback, useState } from 'react';
import type { CropConfig } from '../types';

interface PreviewCanvasProps {
  cropConfig: CropConfig | null;
  onBinaryMessage: React.MutableRefObject<((data: ArrayBuffer) => void) | null>;
}

export default function PreviewCanvas({ cropConfig, onBinaryMessage }: PreviewCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const [hasSignal, setHasSignal] = useState(false);

  const handleFrame = useCallback((data: ArrayBuffer) => {
    const arr = new Uint8Array(data);
    // Check for FRAME prefix (5 bytes: F R A M E)
    if (arr.length > 5 &&
        arr[0] === 70 && arr[1] === 82 && arr[2] === 65 &&
        arr[3] === 77 && arr[4] === 69) {
      const jpegData = arr.subarray(5);
      const blob = new Blob([jpegData], { type: 'image/jpeg' });
      const url = URL.createObjectURL(blob);

      if (!hasSignal) setHasSignal(true);

      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current;
        if (!canvas) { URL.revokeObjectURL(url); return; }

        if (!ctxRef.current) {
          ctxRef.current = canvas.getContext('2d');
        }
        const ctx = ctxRef.current;
        if (!ctx) { URL.revokeObjectURL(url); return; }

        if (cropConfig && cropConfig.enabled) {
          if (canvas.width !== cropConfig.width) canvas.width = cropConfig.width;
          if (canvas.height !== cropConfig.height) canvas.height = cropConfig.height;
          ctx.drawImage(
            img,
            cropConfig.x, cropConfig.y, cropConfig.width, cropConfig.height,
            0, 0, cropConfig.width, cropConfig.height
          );
        } else {
          if (canvas.width !== img.naturalWidth) canvas.width = img.naturalWidth;
          if (canvas.height !== img.naturalHeight) canvas.height = img.naturalHeight;
          ctx.drawImage(img, 0, 0);
        }
        URL.revokeObjectURL(url);
      };
      img.src = url;
    }
  }, [cropConfig, hasSignal]);

  // Expose the handler via ref so the parent can wire it to the WebSocket
  onBinaryMessage.current = handleFrame;

  return (
    <div className="absolute inset-0 z-0 flex items-center justify-center bg-black">
      <canvas ref={canvasRef} className="w-full h-full object-cover mirror" />
      {!hasSignal && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-muted-foreground">
          <svg className="w-16 h-16 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z" />
          </svg>
          <span className="text-lg">Waiting for camera feed...</span>
        </div>
      )}
    </div>
  );
}
