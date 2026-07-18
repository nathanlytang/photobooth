// Preload — runs in an isolated context with sandbox enabled.
//
// This is a defense-in-depth layer that mirrors the in-app KioskGuard. The
// primary hardening lives in main.cjs (`before-input-event`, navigation locks,
// permission denial). Here we additionally:
//   - swallow touchscreen/mouse escape surfaces (context menu, drag, aux click)
//   - swallow gesture-based zoom/navigation
//   - block page-level escape keys
//
// We deliberately expose NO "exit" bridge to the renderer: the only way out of
// the kiosk is the physical-keyboard chord handled in the main process, so a
// touchscreen or mouse can never trigger it.

const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('kiosk', {
  shell: 'electron',
});

// Keyboard escapes (page level — main.cjs also blocks these at the Chromium
// layer; this covers the renderer if events ever reach it).
window.addEventListener(
  'keydown',
  (e) => {
    const key = (e.key || '').toLowerCase();
    const mod = e.metaKey || e.ctrlKey;
    const block =
      key === 'f11' ||
      key === 'f12' ||
      key === 'f5' ||
      (mod && (key === 'r' || key === 'w' || key === 'q' || key === 'm' || key === 'h')) ||
      (e.metaKey && key === 'tab') ||
      (mod && e.shiftKey && key === 'i') ||
      (mod && (key === '=' || key === '+' || key === '-' || key === '0'));
    if (block) {
      e.preventDefault();
      e.stopPropagation();
    }
  },
  true,
);

// Touch/mouse escape surfaces.
const swallow = (e) => {
  e.preventDefault();
  e.stopPropagation();
};
window.addEventListener('contextmenu', swallow, true); // right-click / long-press
window.addEventListener('dragstart', swallow, true);
window.addEventListener('drop', swallow, true);
window.addEventListener('auxclick', swallow, true); // middle-click

// Gesture zoom (trackpad pinch, ctrl+wheel) and history swipe.
window.addEventListener(
  'wheel',
  (e) => {
    if (e.ctrlKey) e.preventDefault();
  },
  { passive: false, capture: true },
);
window.addEventListener(
  'gesturestart',
  (e) => e.preventDefault(),
  { passive: false, capture: true },
);
