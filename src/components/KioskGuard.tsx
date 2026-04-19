import { useEffect } from 'react';

interface KioskGuardProps {
  mode: 'dev' | 'prod';
}

const DEV_ALLOWED_KEYS = new Set(['F5', 'F11', 'F12']);

function isDevAllowed(e: KeyboardEvent): boolean {
  if (DEV_ALLOWED_KEYS.has(e.key)) return true;
  if (e.ctrlKey && e.shiftKey && e.key === 'I') return true;
  if (e.ctrlKey && (e.key === 'r' || e.key === 'R')) return true;
  return false;
}

export default function KioskGuard({ mode }: KioskGuardProps) {
  useEffect(() => {
    const onKeydown = (e: KeyboardEvent) => {
      // In dev mode, allow all keyboard input for testing
      if (mode === 'dev') return;
      e.preventDefault();
      e.stopPropagation();
    };

    const onContextMenu = (e: MouseEvent) => {
      if (mode === 'dev') return;
      e.preventDefault();
    };

    const onDragStart = (e: DragEvent) => {
      e.preventDefault();
    };

    const onDrop = (e: DragEvent) => {
      e.preventDefault();
    };

    const onAuxClick = (e: MouseEvent) => {
      e.preventDefault();
    };

    const onSelectStart = (e: Event) => {
      e.preventDefault();
    };

    document.addEventListener('keydown', onKeydown, true);
    document.addEventListener('contextmenu', onContextMenu, true);
    document.addEventListener('dragstart', onDragStart, true);
    document.addEventListener('drop', onDrop, true);
    document.addEventListener('auxclick', onAuxClick, true);
    document.addEventListener('selectstart', onSelectStart, true);

    return () => {
      document.removeEventListener('keydown', onKeydown, true);
      document.removeEventListener('contextmenu', onContextMenu, true);
      document.removeEventListener('dragstart', onDragStart, true);
      document.removeEventListener('drop', onDrop, true);
      document.removeEventListener('auxclick', onAuxClick, true);
      document.removeEventListener('selectstart', onSelectStart, true);
    };
  }, [mode]);

  return null;
}
