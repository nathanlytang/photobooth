import { useState, useCallback, useRef } from 'react';
import type {
  FrontendConfig,
  ScreenName,
  OverlayName,
  ThumbnailItem,
} from '../types';

const DEFAULT_CONFIG: FrontendConfig = {
  countdownSeconds: 5,
  cameraPosition: 'above',
  lookText: 'Look up here!',
  enableEmail: true,
  enablePhone: true,
  // Default to 'dev' when running on Vite's port so inputs work before config loads
  mode: typeof window !== 'undefined' && window.location.port === '5173' ? 'dev' : 'prod',
  crop: null,
  shutterOffsetMs: 0,
  galleryEnabled: false,
};

export function useAppState() {
  const [config, setConfig] = useState<FrontendConfig>(DEFAULT_CONFIG);
  const [screen, setScreen] = useState<ScreenName>('idle');
  const [overlay, setOverlay] = useState<OverlayName>(null);
  const [thumbnails, setThumbnails] = useState<ThumbnailItem[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [countdownValue, setCountdownValue] = useState(0);
  const [pendingShareUrl, setPendingShareUrl] = useState<string | null>(null);
  const [sessionPhotoCount, setSessionPhotoCount] = useState(0);
  const [flashActive, setFlashActive] = useState(false);

  // Refs for countdown timer management
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const triggerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Idle timeout — auto-reset to idle after 2 minutes of no interaction
  const IDLE_TIMEOUT_MS = 2 * 60 * 1000;
  const idleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetIdleTimeout = useCallback(() => {
    if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
    idleTimeoutRef.current = setTimeout(() => {
      console.log('[app] Session idle timeout — returning to idle');
      setScreen('idle');
      setThumbnails([]);
      setIsCapturing(false);
      setPendingShareUrl(null);
      setSessionPhotoCount(0);
      setOverlay(null);
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
      if (triggerTimeoutRef.current) {
        clearTimeout(triggerTimeoutRef.current);
        triggerTimeoutRef.current = null;
      }
    }, IDLE_TIMEOUT_MS);
  }, []);

  const clearIdleTimeout = useCallback(() => {
    if (idleTimeoutRef.current) {
      clearTimeout(idleTimeoutRef.current);
      idleTimeoutRef.current = null;
    }
  }, []);

  const loadConfig = useCallback(async () => {
    const MAX_RETRIES = 5;
    let delay = 1000;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await fetch('/api/config');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const cfg = await res.json() as FrontendConfig;
        setConfig(cfg);
        return;
      } catch (err) {
        console.warn(`[config] Fetch attempt ${attempt}/${MAX_RETRIES} failed:`, (err as Error).message);
        if (attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, delay));
          delay *= 2;
        }
      }
    }
    console.warn('[config] All retries exhausted, using defaults');
  }, []);

  const showScreen = useCallback((name: ScreenName) => {
    setScreen(name);
    if (name === 'idle') {
      clearIdleTimeout();
    } else {
      resetIdleTimeout();
    }
  }, [resetIdleTimeout, clearIdleTimeout]);

  const showOverlay = useCallback((name: OverlayName) => {
    setOverlay(name);
  }, []);

  const hideOverlay = useCallback(() => {
    setOverlay(null);
  }, []);

  const triggerFlash = useCallback(() => {
    setFlashActive(false);
    // Force reflow via microtask
    requestAnimationFrame(() => {
      setFlashActive(true);
      setTimeout(() => setFlashActive(false), 500);
    });
  }, []);

  const addThumbnailPlaceholder = useCallback((photoNumber: number) => {
    setThumbnails(prev => [...prev, { photoNumber, url: null }]);
  }, []);

  const replaceThumbnail = useCallback((photoNumber: number, url: string) => {
    setThumbnails(prev =>
      prev.map(t => t.photoNumber === photoNumber ? { ...t, url } : t)
    );
  }, []);

  const addThumbnail = useCallback((photoNumber: number, url: string) => {
    setThumbnails(prev => {
      const exists = prev.find(t => t.photoNumber === photoNumber);
      if (exists) {
        return prev.map(t => t.photoNumber === photoNumber ? { ...t, url } : t);
      }
      return [...prev, { photoNumber, url }];
    });
  }, []);

  const resetSession = useCallback(() => {
    setThumbnails([]);
    setIsCapturing(false);
    setPendingShareUrl(null);
    setSessionPhotoCount(0);
  }, []);

  const startCountdown = useCallback((
    seconds: number,
    shutterOffsetMs: number,
    onTrigger: () => void
  ) => {
    let remaining = seconds;
    setCountdownValue(remaining);
    setOverlay('countdown');

    // Schedule capture trigger with offset
    const triggerDelayMs = (seconds * 1000) - shutterOffsetMs;
    triggerTimeoutRef.current = setTimeout(() => {
      onTrigger();
    }, triggerDelayMs);

    // Clear existing timer
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);

    countdownTimerRef.current = setInterval(() => {
      remaining--;
      if (remaining > 0) {
        setCountdownValue(remaining);
      } else {
        if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
        setOverlay('processing');
      }
    }, 1000);
  }, []);

  const clearCountdown = useCallback(() => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    if (triggerTimeoutRef.current) {
      clearTimeout(triggerTimeoutRef.current);
      triggerTimeoutRef.current = null;
    }
  }, []);

  return {
    // State
    config,
    screen,
    overlay,
    thumbnails,
    isCapturing,
    countdownValue,
    pendingShareUrl,
    sessionPhotoCount,
    flashActive,

    // Setters
    setConfig,
    setIsCapturing,
    setPendingShareUrl,
    setSessionPhotoCount,

    // Actions
    loadConfig,
    showScreen,
    showOverlay,
    hideOverlay,
    triggerFlash,
    addThumbnailPlaceholder,
    replaceThumbnail,
    addThumbnail,
    resetSession,
    startCountdown,
    clearCountdown,
    resetIdleTimeout,
    clearIdleTimeout,
  };
}

export type AppState = ReturnType<typeof useAppState>;
