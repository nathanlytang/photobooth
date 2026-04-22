import { useEffect, useCallback, useRef } from 'react';
import { useAppState } from './hooks/useAppState';
import { useWebSocket } from './hooks/useWebSocket';
import type {
  WsServerMessage,
  SessionStartedPayload,
  CaptureCountdownPayload,
  CaptureCapturedPayload,
  CaptureCompletePayload,
  SessionEndedPayload,
  VideoCountdownPayload,
  VideoRecordingStartedPayload,
  VideoTakeKeptPayload,
  VideoTakeDiscardedPayload,
} from './types';

import PreviewCanvas from './components/PreviewCanvas';
import KioskGuard from './components/KioskGuard';
import LookIndicator from './components/LookIndicator';
import IdleScreen from './components/IdleScreen';
import SessionScreen from './components/SessionScreen';
import ContactScreen from './components/ContactScreen';
import ShareScreen from './components/ShareScreen';
import CountdownOverlay from './components/CountdownOverlay';
import FlashOverlay from './components/FlashOverlay';
import ProcessingOverlay from './components/ProcessingOverlay';
import SuccessOverlay from './components/SuccessOverlay';
import VideoReadyScreen from './components/VideoReadyScreen';
import VideoRecordingScreen from './components/VideoRecordingScreen';
import VideoReviewScreen from './components/VideoReviewScreen';

export default function App() {
  const state = useAppState();
  const binaryHandlerRef = useRef<((data: ArrayBuffer) => void) | null>(null);
  const lookPulsingRef = useRef(false);

  // Load config on mount
  useEffect(() => {
    state.loadConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track look indicator pulsing based on overlay
  const lookPulsing = state.overlay === 'countdown';
  lookPulsingRef.current = lookPulsing;

  const onBinaryMessage = useCallback((data: ArrayBuffer) => {
    binaryHandlerRef.current?.(data);
  }, []);

  const onJsonMessage = useCallback((msg: WsServerMessage) => {
    switch (msg.type) {
      case 'session:started': {
        const p = msg.payload as SessionStartedPayload;
        state.resetSession();
        state.showScreen('session');
        // Restore thumbnails if resuming
        if (p.photos && p.photos.length > 0) {
          for (let i = 0; i < p.photos.length; i++) {
            state.addThumbnail(i + 1, `/sessions/${p.id}/${p.photos[i].filename}`);
          }
        }
        break;
      }
      case 'capture:countdown': {
        const p = msg.payload as CaptureCountdownPayload;
        // Reset label so stale text from a prior video session doesn't leak
        // into the photo processing overlay (e.g. "Saving video...").
        state.setProcessingLabel('Capturing...');
        state.startCountdown(p.seconds, state.config.shutterOffsetMs, () => {
          wsSend('capture:trigger');
        });
        break;
      }
      case 'capture:captured': {
        const p = msg.payload as CaptureCapturedPayload;
        state.hideOverlay();
        state.triggerFlash();
        state.addThumbnailPlaceholder(p.photoNumber);
        state.setIsCapturing(false);
        break;
      }
      case 'capture:complete': {
        const p = msg.payload as CaptureCompletePayload;
        state.replaceThumbnail(p.photoNumber, p.url);
        break;
      }
      case 'capture:error': {
        state.setIsCapturing(false);
        state.hideOverlay();
        state.clearCountdown();
        console.error('[capture] Error:', msg.payload.message);
        break;
      }
      case 'session:ended': {
        const p = msg.payload as SessionEndedPayload;
        state.setPendingShareUrl(p.shareUrl || null);
        state.setSessionPhotoCount(p.metadata?.photoCount || 0);
        handleSessionEnded(p.shareUrl, p.metadata?.photoCount || 0);
        break;
      }

      // --- Video guestbook ---

      case 'video:session:started': {
        // Payload is informational (kept-take count is 0 at start). Reset
        // transient video state and move to the ready screen.
        state.beginVideoSession();
        state.showScreen('video-ready');
        break;
      }
      case 'video:countdown': {
        const p = msg.payload as VideoCountdownPayload;
        // Pre-stage the spinner label so it's ready the moment the countdown
        // reaches 0 (the overlay swap itself happens inside startVideoCountdown).
        state.setProcessingLabel('Starting camera...');
        state.startVideoCountdown(p.seconds, state.config.video.startOffsetMs, () => {
          // Triggered early (offset) — fire the WS confirm so the server can
          // start the slow gphoto2 movieStart() in the background while the
          // user still sees the countdown tick down to 0.
          wsSend('video:start-recording-confirm');
        });
        break;
      }
      case 'video:recording-started': {
        const p = msg.payload as VideoRecordingStartedPayload;
        // If recording began before the countdown visually finished (large
        // offset + fast camera), cancel any pending countdown ticks so they
        // don't later re-show the processing overlay over the recording UI.
        state.clearCountdown();
        state.hideOverlay();
        state.beginRecordingTimer(p.maxSeconds);
        state.showScreen('video-recording');
        break;
      }
      case 'video:recording-stopped': {
        // Server has finished stopping + preparing the take. Hide the
        // spinner shown on stop-button tap and show the review screen.
        state.stopRecordingTimer();
        state.hideOverlay();
        state.showScreen('video-review');
        break;
      }
      case 'video:take-kept': {
        const p = msg.payload as VideoTakeKeptPayload;
        state.setKeptTakeCount(p.keptTakeCount);
        state.setSelectedPrompt(null);
        state.showScreen('video-ready');
        break;
      }
      case 'video:take-discarded': {
        const p = msg.payload as VideoTakeDiscardedPayload;
        state.setKeptTakeCount(p.keptTakeCount);
        state.setSelectedPrompt(null);
        state.showScreen('video-ready');
        break;
      }
      case 'video:session:ended': {
        const p = msg.payload as SessionEndedPayload;
        state.setPendingShareUrl(p.shareUrl || null);
        state.setSessionPhotoCount(p.metadata?.keptVideoCount || 0);
        handleVideoSessionEnded(p.shareUrl, p.metadata?.keptVideoCount || 0);
        break;
      }
      case 'video:download-progress':
      case 'video:download-complete': {
        // background; no UI action needed
        break;
      }
      case 'video:error': {
        console.error('[video] Error:', msg.payload.message);
        state.stopRecordingTimer();
        state.hideOverlay();
        state.clearCountdown();
        break;
      }

      case 'error': {
        console.error('[server] Error:', msg.payload.message);
        state.setIsCapturing(false);
        state.hideOverlay();
        state.clearCountdown();
        break;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.config.shutterOffsetMs]);

  const { send: wsSend } = useWebSocket({ onBinaryMessage, onJsonMessage });

  // --- Event handlers ---

  const handleStart = useCallback(() => {
    wsSend('session:start');
  }, [wsSend]);

  const handleCapture = useCallback(() => {
    if (state.isCapturing) return;
    state.setIsCapturing(true);
    state.resetIdleTimeout();
    wsSend('capture');
  }, [wsSend, state.isCapturing, state.setIsCapturing, state.resetIdleTimeout]);

  const handleEndSession = useCallback(() => {
    const count = state.thumbnails.length;
    state.setSessionPhotoCount(count);

    // No photos taken — skip contact/share, just end and return to idle
    if (count === 0) {
      wsSend('session:end', { email: '', phone: '' });
      state.showScreen('idle');
      return;
    }

    const hasContactForm = state.config.enableEmail || state.config.enablePhone;

    if (hasContactForm) {
      state.showScreen('contact');
    } else {
      wsSend('session:end', { email: '', phone: '' });
    }
  }, [wsSend, state.thumbnails.length, state.config.enableEmail, state.config.enablePhone, state.showScreen, state.setSessionPhotoCount]);

  const handleContactSubmit = useCallback((email: string, phone: string) => {
    state.clearIdleTimeout();
    wsSend('session:end', { email, phone });
  }, [wsSend, state.clearIdleTimeout]);

  const handleSessionEnded = useCallback((shareUrl: string | null, photoCount: number) => {
    // Zero photos taken — return straight to idle. Skip the QR/share screen
    // and the success popup; there's nothing to share.
    if (photoCount === 0) {
      state.showScreen('idle');
      return;
    }

    if (state.config.galleryEnabled && shareUrl) {
      // Show share screen (whether contact form was shown or not)
      state.showScreen('share');
    } else {
      // No gallery — show brief success overlay and return to idle
      state.showScreen('idle');
      state.setSuccessVariant('photos-sent');
      state.showOverlay('success');
      setTimeout(() => state.hideOverlay(), 3000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.config.enableEmail, state.config.enablePhone, state.config.galleryEnabled]);

  const handleShareDone = useCallback(() => {
    state.showScreen('idle');
    state.endVideoState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.showScreen, state.endVideoState]);

  // --- Video-guestbook handlers ---

  const handleStartVideo = useCallback(() => {
    wsSend('video:session:start');
  }, [wsSend]);

  const handleStartRecording = useCallback(() => {
    // Hide the "Leave a Video Message" card immediately so the countdown /
    // spinner overlays aren't obscured by it. Fall back to the live-preview
    // (idle) screen until `video:recording-started` arrives.
    state.showScreen('idle');
    wsSend('video:start-recording', { prompt: state.selectedPrompt });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsSend, state.selectedPrompt]);

  const handleStopRecording = useCallback(() => {
    // movieStop() on the server can take several seconds — show spinner
    // immediately so the UI doesn't feel stuck.
    state.setProcessingLabel('Saving video...');
    state.showOverlay('processing');
    wsSend('video:stop-recording');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsSend]);

  const handleKeepTake = useCallback(() => {
    wsSend('video:keep');
  }, [wsSend]);

  const handleRetakeTake = useCallback(() => {
    wsSend('video:retake');
  }, [wsSend]);

  const handleEndVideoSession = useCallback(() => {
    if (state.keptTakeCount === 0) {
      // No kept takes — skip contact/share, just end and return to idle.
      wsSend('video:session:end', { email: '', phone: '' });
      state.showScreen('idle');
      state.endVideoState();
      return;
    }
    const hasContactForm = state.config.enableEmail || state.config.enablePhone;
    const shareEnabled = state.config.video.shareEnabled;
    if (shareEnabled && hasContactForm) {
      state.showScreen('contact');
    } else {
      wsSend('video:session:end', { email: '', phone: '' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsSend, state.keptTakeCount, state.config, state.showScreen, state.endVideoState]);

  const handleVideoContactSubmit = useCallback((email: string, phone: string) => {
    state.clearIdleTimeout();
    wsSend('video:session:end', { email, phone });
  }, [wsSend, state.clearIdleTimeout]);

  const handleVideoSessionEnded = useCallback((shareUrl: string | null, keptCount: number) => {
    if (keptCount === 0) {
      // Already navigated to idle; nothing to do.
      state.endVideoState();
      return;
    }
    const shareEnabled = state.config.video.shareEnabled;
    if (state.config.galleryEnabled && shareUrl) {
      state.showScreen('share');
    } else {
      state.showScreen('idle');
      // Choose variant based on whether "send to user" is enabled
      state.setSuccessVariant(shareEnabled ? 'videos-sent' : 'videos-saved');
      state.showOverlay('success');
      setTimeout(() => state.hideOverlay(), 3000);
      state.endVideoState();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.config.galleryEnabled, state.config.video.shareEnabled, state.showScreen, state.showOverlay, state.hideOverlay, state.endVideoState]);

  // Dispatch contact submit based on active session type.
  const dispatchContactSubmit = useCallback((email: string, phone: string) => {
    if (state.sessionType === 'video') {
      handleVideoContactSubmit(email, phone);
    } else {
      handleContactSubmit(email, phone);
    }
  }, [state.sessionType, handleVideoContactSubmit, handleContactSubmit]);

  return (
    <div id="app" className="relative w-full h-full">
      <KioskGuard mode={state.config.mode} />

      {/* Live Preview (always visible) */}
      <PreviewCanvas
        cropConfig={state.config.crop}
        onBinaryMessage={binaryHandlerRef}
      />

      {/* Look indicator */}
      <LookIndicator
        visible={state.screen === 'session'}
        pulsing={lookPulsing}
        position={state.config.cameraPosition}
        text={state.config.lookText}
      />

      {/* Screens */}
      <IdleScreen
        active={state.screen === 'idle'}
        videoEnabled={state.config.video.enabled}
        onStart={handleStart}
        onStartVideo={handleStartVideo}
      />
      <SessionScreen
        active={state.screen === 'session'}
        thumbnails={state.thumbnails}
        isCapturing={state.isCapturing}
        onCapture={handleCapture}
        onEndSession={handleEndSession}
      />
      <VideoReadyScreen
        active={state.screen === 'video-ready'}
        prompts={state.config.video.prompts}
        selectedPrompt={state.selectedPrompt}
        keptTakeCount={state.keptTakeCount}
        maxRecordSeconds={state.config.video.maxRecordSeconds}
        onSelectPrompt={state.setSelectedPrompt}
        onStartRecording={handleStartRecording}
        onEndSession={handleEndVideoSession}
      />
      <VideoRecordingScreen
        active={state.screen === 'video-recording'}
        prompt={state.selectedPrompt}
        showPromptDuringRecording={state.config.video.promptsPersistDuringRecording}
        elapsedSeconds={state.elapsedSeconds}
        maxSeconds={state.recordingMaxSeconds}
        onStop={handleStopRecording}
      />
      <VideoReviewScreen
        active={state.screen === 'video-review'}
        onKeep={handleKeepTake}
        onRetake={handleRetakeTake}
      />
      <ContactScreen
        active={state.screen === 'contact'}
        enableEmail={state.config.enableEmail}
        enablePhone={state.config.enablePhone}
        photoCount={state.sessionPhotoCount}
        galleryEnabled={state.config.galleryEnabled}
        mode={state.config.mode}
        onSubmit={dispatchContactSubmit}
      />
      <ShareScreen
        active={state.screen === 'share'}
        shareUrl={state.pendingShareUrl}
        photoCount={state.sessionPhotoCount}
        onDone={handleShareDone}
      />

      {/* Overlays */}
      <CountdownOverlay active={state.overlay === 'countdown'} value={state.countdownValue} />
      <ProcessingOverlay active={state.overlay === 'processing'} label={state.processingLabel} />
      <SuccessOverlay active={state.overlay === 'success'} variant={state.successVariant} />
      <FlashOverlay active={state.flashActive} />
    </div>
  );
}
