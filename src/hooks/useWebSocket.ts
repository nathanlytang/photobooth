import { useEffect, useRef, useCallback } from 'react';
import type { WsServerMessage } from '../types';

interface UseWebSocketOptions {
  onBinaryMessage: (data: ArrayBuffer) => void;
  onJsonMessage: (msg: WsServerMessage) => void;
}

export function useWebSocket({ onBinaryMessage, onJsonMessage }: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep latest callbacks in refs to avoid reconnect on callback change
  const onBinaryRef = useRef(onBinaryMessage);
  onBinaryRef.current = onBinaryMessage;
  const onJsonRef = useRef(onJsonMessage);
  onJsonRef.current = onJsonMessage;

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // In dev (Vite on :5173), connect WS directly to the backend on :3000
    // to avoid Vite's HMR WebSocket conflicts. In production, same host.
    const isDev = window.location.port === '5173';
    const host = isDev ? `${window.location.hostname}:3000` : window.location.host;
    const url = `${protocol}//${host}/ws`;

    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[ws] Connected');
    };

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        onBinaryRef.current(event.data);
      } else {
        try {
          const msg = JSON.parse(event.data as string) as WsServerMessage;
          onJsonRef.current(msg);
        } catch {
          // ignore non-JSON text messages
        }
      }
    };

    ws.onclose = () => {
      console.log('[ws] Disconnected, reconnecting in 2s...');
      reconnectTimeout.current = setTimeout(connect, 2000);
    };

    ws.onerror = (err) => {
      console.error('[ws] Error:', err);
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((type: string, payload?: unknown) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, payload }));
    }
  }, []);

  return { send };
}
