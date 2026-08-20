// --- Frontend Config (received from /api/config) ---

export interface CropConfig {
  enabled: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FrontendVideoConfig {
  enabled: boolean;
  maxRecordSeconds: number;
  countdownSeconds: number;
  /** Ms to fire the start trigger before countdown hits 0 (mirrors photo shutterOffsetMs). */
  startOffsetMs: number;
  prompts: string[];
  promptsPersistDuringRecording: boolean;
  shareEnabled: boolean;
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
  eventName: string | null;
  screensaverTimeoutSeconds: number;
  galleryEnabled: boolean;
  video: FrontendVideoConfig;
}

// --- WebSocket Message Types ---

export interface PhotoRecord {
  filename: string;
  capturedAt: string;
}

export interface SessionStartedPayload {
  id: string;
  type: SessionType;
  resumed: boolean;
  photos: PhotoRecord[];
  videoTakes: VideoTake[];
  keptTakeCount: number;
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

export type SessionType = 'photo' | 'video';

export interface VideoTake {
  takeNumber: number;
  cameraPath: string | null;
  fileExtension: string;
  prompt: string | null;
  startedAt: string;
  stoppedAt: string | null;
  kept: boolean;
  localFilename?: string;
  uploaded?: boolean;
  uploadSkipped?: boolean;
  downloadError?: string;
  uploadError?: string;
}

export interface SessionMetadata {
  sessionId: string;
  type: SessionType;
  shareId: string | null;
  shareUrl: string | null;
  eventName: string | null;
  startedAt: string;
  endedAt: string;
  photoCount: number;
  photos: PhotoRecord[];
  videoTakes: VideoTake[];
  keptVideoCount: number;
  contact: {
    email: string | null;
    phone: string | null;
  };
}

export interface SessionEndedPayload {
  id: string;
  type: SessionType;
  shareId: string | null;
  shareUrl: string | null;
  metadata: SessionMetadata;
}

export interface ErrorPayload {
  message: string;
}

// --- Video WS payloads ---

export interface VideoSessionStartedPayload {
  id: string;
  type: SessionType;
  resumed: boolean;
  photos: PhotoRecord[];
  videoTakes: VideoTake[];
  keptTakeCount: number;
}

export interface VideoCountdownPayload { seconds: number; }
export interface VideoRecordingStartedPayload { takeNumber: number; startedAt: string; maxSeconds: number; }
export interface VideoRecordingStoppedPayload { take: VideoTake; }
export interface VideoTakeKeptPayload { take: VideoTake; keptTakeCount: number; }
export interface VideoTakeDiscardedPayload { keptTakeCount: number; }
export interface VideoDownloadProgressPayload { takeNumber: number; percent: number; }
export interface VideoDownloadCompletePayload { take: VideoTake; }
export interface VideoErrorPayload { message: string; }

export type WsServerMessage =
  | { type: 'session:started'; payload: SessionStartedPayload }
  | { type: 'capture:countdown'; payload: CaptureCountdownPayload }
  | { type: 'capture:captured'; payload: CaptureCapturedPayload }
  | { type: 'capture:complete'; payload: CaptureCompletePayload }
  | { type: 'capture:error'; payload: CaptureErrorPayload }
  | { type: 'session:ended'; payload: SessionEndedPayload }
  | { type: 'video:session:started'; payload: VideoSessionStartedPayload }
  | { type: 'video:countdown'; payload: VideoCountdownPayload }
  | { type: 'video:recording-started'; payload: VideoRecordingStartedPayload }
  | { type: 'video:recording-stopped'; payload: VideoRecordingStoppedPayload }
  | { type: 'video:take-kept'; payload: VideoTakeKeptPayload }
  | { type: 'video:take-discarded'; payload: VideoTakeDiscardedPayload }
  | { type: 'video:download-progress'; payload: VideoDownloadProgressPayload }
  | { type: 'video:download-complete'; payload: VideoDownloadCompletePayload }
  | { type: 'video:session:ended'; payload: SessionEndedPayload }
  | { type: 'video:error'; payload: VideoErrorPayload }
  | { type: 'config:updated'; payload: Record<string, never> }
  | { type: 'error'; payload: ErrorPayload };

// --- App Screen State ---

export type ScreenName =
  | 'idle'
  | 'session'
  | 'contact'
  | 'share'
  | 'video-ready'
  | 'video-recording'
  | 'video-review';

export type OverlayName = 'countdown' | 'processing' | 'success' | 'flash' | null;

export interface ThumbnailItem {
  photoNumber: number;
  url: string | null; // null = loading placeholder
}
