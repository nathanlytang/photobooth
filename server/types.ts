// --- Config Types ---

export interface CameraConfig {
  iso: string;
  shutterSpeed: string;
  aperture: string;
  whiteBalance: string;
  pictureProfile?: string;
  captureTarget: 'card' | 'internal';
  [key: string]: string | undefined;
}

export interface CropConfig {
  enabled: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PreviewConfig {
  device: string;
  width: number;
  height: number;
  fps: number;
  crop?: CropConfig;
}

export interface ResizeConfig {
  enabled: boolean;
  mode?: string;
  preset?: string;
  longEdge?: number;
  percentage?: number;
  quality?: number;
}

export interface GalleryServerConfig {
  enabled: boolean;
  baseUrl: string;
  authToken: string;
  resize?: ResizeConfig;
}

export interface AppConfig {
  port: number;
  sessionsDir: string;
  countdownSeconds: number;
  shutterOffsetMs?: number;
  cameraPosition?: 'above' | 'below';
  lookText?: string;
  enableEmail?: boolean;
  enablePhone?: boolean;
  mode?: 'dev' | 'prod';
  eventName?: string;
  generateShareId?: boolean;
  periodicAutofocus?: boolean;
  galleryServer?: GalleryServerConfig;
}

export interface PhotoboothConfig {
  camera: CameraConfig;
  preview: PreviewConfig;
  app: AppConfig;
}

// --- Session Types ---

export interface PhotoRecord {
  filename: string;
  capturedAt: string;
}

export interface Session {
  id: string;
  dir: string;
  photoCount: number;
  startedAt: string;
  photos: PhotoRecord[];
  shareId: string | null;
  shareUrl: string | null;
}

export interface SessionStartResult {
  id: string;
  resumed: boolean;
  photos: PhotoRecord[];
}

export interface ContactInfo {
  email?: string;
  phone?: string;
}

export interface SessionMetadata {
  sessionId: string;
  shareId: string | null;
  shareUrl: string | null;
  eventName: string | null;
  resize: ResizeConfig | null;
  startedAt: string;
  endedAt: string;
  photoCount: number;
  photos: PhotoRecord[];
  contact: {
    email: string | null;
    phone: string | null;
  };
}

export interface SessionEndResult {
  id: string;
  shareId: string | null;
  shareUrl: string | null;
  metadata: SessionMetadata;
}

// --- Gallery Types ---

export interface ShareResult {
  shareId: string;
  shareUrl: string;
}

// --- WebSocket Message Types ---

export type WsClientMessageType =
  | 'session:start'
  | 'capture'
  | 'capture:trigger'
  | 'session:end';

export type WsServerMessageType =
  | 'session:started'
  | 'capture:countdown'
  | 'capture:captured'
  | 'capture:complete'
  | 'capture:error'
  | 'session:ended'
  | 'error';

export interface WsMessage<T = unknown> {
  type: WsClientMessageType | WsServerMessageType;
  payload?: T;
}

// --- Capture Result ---

export interface CaptureResult {
  filename: string;
  path: string;
}

// --- Frontend Config (sent via /api/config) ---

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
