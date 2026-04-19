// --- Frontend Config (received from /api/config) ---

export interface CropConfig {
  enabled: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FrontendConfig {
  countdownSeconds: number;
  cameraPosition: 'above' | 'below';
  lookText: string;
  enableEmail: boolean;
  enablePhone: boolean;
  mode: 'dev' | 'prod';
  crop: CropConfig | null;
  shutterOffsetMs: number;
  galleryEnabled: boolean;
}

// --- WebSocket Message Types ---

export interface PhotoRecord {
  filename: string;
  capturedAt: string;
}

export interface SessionStartedPayload {
  id: string;
  resumed: boolean;
  photos: PhotoRecord[];
}

export interface CaptureCountdownPayload {
  seconds: number;
}

export interface CaptureCapturedPayload {
  photoNumber: number;
}

export interface CaptureCompletePayload {
  filename: string;
  photoNumber: number;
  url: string;
}

export interface CaptureErrorPayload {
  message: string;
}

export interface SessionMetadata {
  sessionId: string;
  shareId: string | null;
  shareUrl: string | null;
  eventName: string | null;
  startedAt: string;
  endedAt: string;
  photoCount: number;
  photos: PhotoRecord[];
  contact: {
    email: string | null;
    phone: string | null;
  };
}

export interface SessionEndedPayload {
  id: string;
  shareId: string | null;
  shareUrl: string | null;
  metadata: SessionMetadata;
}

export interface ErrorPayload {
  message: string;
}

export type WsServerMessage =
  | { type: 'session:started'; payload: SessionStartedPayload }
  | { type: 'capture:countdown'; payload: CaptureCountdownPayload }
  | { type: 'capture:captured'; payload: CaptureCapturedPayload }
  | { type: 'capture:complete'; payload: CaptureCompletePayload }
  | { type: 'capture:error'; payload: CaptureErrorPayload }
  | { type: 'session:ended'; payload: SessionEndedPayload }
  | { type: 'error'; payload: ErrorPayload };

// --- App Screen State ---

export type ScreenName = 'idle' | 'session' | 'contact' | 'share';

export type OverlayName = 'countdown' | 'processing' | 'success' | 'flash' | null;

export interface ThumbnailItem {
  photoNumber: number;
  url: string | null; // null = loading placeholder
}
