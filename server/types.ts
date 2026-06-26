// --- Config Types ---

/** An arbitrary `--set-config path=value` invocation. */
export interface CameraSetConfig {
  path: string;
  value: string;
}

/**
 * gphoto2 config paths for every setting the photobooth writes. All paths
 * live in config.json — nothing is hardcoded. Shortened names (e.g. `iso`)
 * and fully-qualified paths (e.g. `/main/imgsettings/iso`) are both accepted
 * by gphoto2; pick whatever your camera needs.
 */
export interface CameraPaths {
  /** Exposure settings */
  iso: string;
  shutterSpeed: string;
  aperture: string;
  pictureProfile?: string;
  /** Action: trigger autofocus. */
  autofocus: string;
  /** Setting: capture target (card vs internal RAM). */
  captureTarget: string;
}

/**
 * Per-mode overrides. Values, path overrides and startup configs can all be
 * customized per mode; anything omitted falls back to the top-level config.
 */
export interface CameraModeSettings {
  iso?: string;
  shutterSpeed?: string;
  aperture?: string;
  pictureProfile?: string;
  /** Path overrides for this mode (e.g. movieiso in video mode). */
  paths?: Partial<CameraPaths>;
  /** Arbitrary set-config calls to run when entering this mode. */
  startupConfigs?: CameraSetConfig[];
}

export interface CameraMovieConfig {
  startConfigPath: string;
  startValue: string;
  stopConfigPath: string;
  stopValue: string;
  fileExtension: string; // e.g. "mov", "mp4"
}

export interface CameraConfig {
  // Base (photo-mode) values
  iso: string;
  shutterSpeed: string;
  aperture: string;
  pictureProfile?: string;
  captureTarget: 'card' | 'internal';
  /** Required: gphoto2 config paths for every setting. */
  paths: CameraPaths;
  /** Arbitrary set-config calls to run when entering photo mode / at startup. */
  startupConfigs?: CameraSetConfig[];
  /** Per-video-session overrides (values, path overrides, startup configs). */
  video?: CameraModeSettings;
  /** Video recording start/stop configuration. */
  movie?: CameraMovieConfig;
  /**
   * When true the camera is assumed to stay in movie mode permanently:
   *   - `camera.video.startupConfigs` are applied once at server startup.
   *   - Photo captures still work via `--capture-image` (still from live-view
   *     on most bodies).
   */
  persistentMovieMode?: boolean;
  // Index signature used for runtime iteration of string settings.
  [key: string]:
    | string
    | CameraPaths
    | CameraSetConfig[]
    | CameraMovieConfig
    | CameraModeSettings
    | boolean
    | undefined;
}

export interface CropConfig {
  enabled: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PreviewPlatformConfig {
  inputFormat: string;
  device: string;
  pixelFormat?: string;
}

export interface PreviewConfig {
  width: number;
  height: number;
  fps: number;
  platform: {
    linux: PreviewPlatformConfig;
    darwin: PreviewPlatformConfig;
  };
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

export interface VideoAudioExternalMicConfig {
  enabled: boolean;
  ffmpegInput: string;   // tokenized string, e.g. "-f alsa -i hw:1,0"
  sampleRate?: number;
  channels?: number;
}

export interface VideoAudioConfig {
  externalMic?: VideoAudioExternalMicConfig;
}

export interface VideoShareConfig {
  enabled: boolean;
  upload: boolean;
  uploadTiming?: 'immediate' | 'onEnd';
}

export interface VideoConfig {
  enabled: boolean;
  maxRecordSeconds: number;
  countdownSeconds: number;
  /**
   * Milliseconds to fire the start-recording trigger *before* the countdown
   * reaches zero. Mirrors `app.shutterOffsetMs` for photo mode. Useful to
   * compensate for the ~1-3s gphoto2 movie-start latency so recording begins
   * closer to "0".
   */
  startOffsetMs?: number;
  prompts?: string[];
  promptsPersistDuringRecording?: boolean;
  audio?: VideoAudioConfig;
  share?: VideoShareConfig;
}

export interface AdminConfig {
  password: string;
  sessionTtlMinutes: number;
}

export interface NotificationsSmtpConfig {
  host: string;
  port: number;
  secure?: boolean;
  user?: string;
  pass?: string;
}

export interface NotificationsTwilioConfig {
  accountSid: string;
  authToken: string;
  from: string;
}

export type NotificationsChannel = 'email' | 'sms' | 'both' | 'preferEmail' | 'preferSms';
export type NotificationsMode = 'all' | 'retry';

export interface NotificationsOptions {
  channel?: NotificationsChannel;
  deleteAfterSend?: boolean;
  skipAlreadySent?: boolean;
  skipVideoSessions?: boolean;
  maxAgeDays?: number;
  dryRun?: boolean;
  continueOnError?: boolean;
  mode?: NotificationsMode;
  retryQueuePath?: string;
  /** Whether the in-server watcher should sweep the sessions dir on startup. */
  runInitialSweep?: boolean;
}

export interface NotificationsConfig {
  /** Master toggle for the in-server notification watcher. The `pnpm notify` script ignores this. */
  enabled?: boolean;
  from?: { email?: string; sms?: string };
  subject?: string;
  emailTemplate?: string;
  smsTemplate?: string;
  smtp?: NotificationsSmtpConfig;
  twilio?: NotificationsTwilioConfig;
  options?: NotificationsOptions;
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
  screensaverTimeoutSeconds?: number;
  generateShareId?: boolean;
  periodicAutofocus?: boolean;
  galleryServer?: GalleryServerConfig;
  video?: VideoConfig;
  notifications?: NotificationsConfig;
}

export interface PhotoboothConfig {
  camera: CameraConfig;
  preview: PreviewConfig;
  app: AppConfig;
  admin: AdminConfig;
}

// --- Session Types ---

export type SessionType = 'photo' | 'video';

export interface PhotoRecord {
  filename: string;
  capturedAt: string;
}

export interface VideoTake {
  takeNumber: number;
  cameraPath: string | null;     // on-camera file path; null if we couldn't detect it
  fileExtension: string;
  prompt: string | null;
  startedAt: string;
  stoppedAt: string | null;
  kept: boolean;
  localFilename?: string;         // set when downloaded locally
  uploaded?: boolean;             // set when uploaded to gallery server
  uploadSkipped?: boolean;        // true when share.upload=false
  downloadError?: string;         // set if download to host failed
  uploadError?: string;           // set if gallery upload failed
}

export interface Session {
  id: string;
  type: SessionType;
  dir: string;
  photoCount: number;
  startedAt: string;
  photos: PhotoRecord[];
  videoTakes: VideoTake[];
  currentTake: VideoTake | null;
  shareId: string | null;
  shareUrl: string | null;
}

export interface SessionStartResult {
  id: string;
  type: SessionType;
  resumed: boolean;
  photos: PhotoRecord[];
  videoTakes: VideoTake[];
  keptTakeCount: number;
}

export interface ContactInfo {
  email?: string;
  phone?: string;
}

export interface SessionMetadata {
  sessionId: string;
  type: SessionType;
  shareId: string | null;
  shareUrl: string | null;
  eventName: string | null;
  resize: ResizeConfig | null;
  startedAt: string;
  endedAt: string;
  photoCount: number;
  photos: PhotoRecord[];
  videoTakes: VideoTake[];
  keptVideoCount: number;
  contact: {
    email: string | null;
    phone: string | null;
    sent?: ContactSentInfo;
  };
}

export type ContactSentMethod = 'email' | 'sms' | 'both';

export interface ContactSentAttempt {
  method: 'email' | 'sms';
  ok: boolean;
  error?: string;
  at: string;
}

export interface ContactSentInfo {
  sent: boolean;
  method: ContactSentMethod;
  sentAt: string;
  recipients?: { email?: string; phone?: string };
  attempts?: ContactSentAttempt[];
}

export interface SessionEndResult {
  id: string;
  type: SessionType;
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
  | 'session:end'
  | 'video:session:start'
  | 'video:start-recording'
  | 'video:start-recording-confirm'
  | 'video:stop-recording'
  | 'video:keep'
  | 'video:retake'
  | 'video:session:end';

export type WsServerMessageType =
  | 'session:started'
  | 'capture:countdown'
  | 'capture:captured'
  | 'capture:complete'
  | 'capture:error'
  | 'session:ended'
  | 'video:session:started'
  | 'video:countdown'
  | 'video:recording-started'
  | 'video:recording-stopped'
  | 'video:take-kept'
  | 'video:take-discarded'
  | 'video:download-progress'
  | 'video:download-complete'
  | 'video:session:ended'
  | 'video:error'
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

export interface FrontendVideoConfig {
  enabled: boolean;
  maxRecordSeconds: number;
  countdownSeconds: number;
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