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
        handleSessionEnded(p.shareUrl);
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

  const handleSessionEnded = useCallback((shareUrl: string | null) => {
    const hasContactForm = state.config.enableEmail || state.config.enablePhone;

    if (state.config.galleryEnabled && shareUrl) {
      // Show share screen (whether contact form was shown or not)
      state.showScreen('share');
    } else {
      // No gallery — show brief success overlay and return to idle
      state.showScreen('idle');
      state.showOverlay('success');
      setTimeout(() => state.hideOverlay(), 3000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.config.enableEmail, state.config.enablePhone, state.config.galleryEnabled]);

  const handleShareDone = useCallback(() => {
    state.showScreen('idle');
  }, [state.showScreen]);

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
      <IdleScreen active={state.screen === 'idle'} onStart={handleStart} />
      <SessionScreen
        active={state.screen === 'session'}
        thumbnails={state.thumbnails}
        isCapturing={state.isCapturing}
        onCapture={handleCapture}
        onEndSession={handleEndSession}
      />
      <ContactScreen
        active={state.screen === 'contact'}
        enableEmail={state.config.enableEmail}
        enablePhone={state.config.enablePhone}
        photoCount={state.sessionPhotoCount}
        galleryEnabled={state.config.galleryEnabled}
        mode={state.config.mode}
        onSubmit={handleContactSubmit}
      />
      <ShareScreen
        active={state.screen === 'share'}
        shareUrl={state.pendingShareUrl}
        photoCount={state.sessionPhotoCount}
        onDone={handleShareDone}
      />

      {/* Overlays */}
      <CountdownOverlay active={state.overlay === 'countdown'} value={state.countdownValue} />
      <ProcessingOverlay active={state.overlay === 'processing'} />
      <SuccessOverlay active={state.overlay === 'success'} />
      <FlashOverlay active={state.flashActive} />
    </div>
  );
}
