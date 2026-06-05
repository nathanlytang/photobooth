export interface CameraSetConfig {
  path: string;
  value: string;
}

export interface CameraPaths {
  iso: string;
  shutterSpeed: string;
  aperture: string;
  pictureProfile?: string;
  autofocus: string;
  captureTarget: string;
}

export interface CameraModeSettings {
  iso?: string;
  shutterSpeed?: string;
  aperture?: string;
  pictureProfile?: string;
  paths?: Partial<CameraPaths>;
  startupConfigs?: CameraSetConfig[];
}

export interface CameraMovieConfig {
  startConfigPath: string;
  startValue: string;
  stopConfigPath: string;
  stopValue: string;
  fileExtension: string;
}

export interface CameraConfig {
  iso: string;
  shutterSpeed: string;
  aperture: string;
  pictureProfile?: string;
  captureTarget: 'card' | 'internal';
  paths: CameraPaths;
  startupConfigs?: CameraSetConfig[];
  video?: CameraModeSettings;
  movie?: CameraMovieConfig;
  persistentMovieMode?: boolean;
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

export interface VideoAudioExternalMicConfig {
  enabled: boolean;
  ffmpegInput: string;
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
  runInitialSweep?: boolean;
}

export interface NotificationsConfig {
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
