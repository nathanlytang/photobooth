(function () {
  'use strict';

  const { Kiosk, Keyboard, Validation, LookIndicator } = window.Photobooth;

  // --- State ---
  let ws = null;
  let currentScreen = 'idle';
  let countdownSeconds = 5;
  let countdownTimer = null;
  let isCapturing = false;
  let activeInput = null;
  let enableEmail = true;
  let enablePhone = true;

  // --- DOM Elements ---
  const previewImg = document.getElementById('preview');
  const noSignal = document.getElementById('no-signal');
  const screenIdle = document.getElementById('screen-idle');
  const screenSession = document.getElementById('screen-session');
  const screenCountdown = document.getElementById('screen-countdown');
  const screenContact = document.getElementById('screen-contact');
  const screenProcessing = document.getElementById('screen-processing');
  const flashOverlay = document.getElementById('flash-overlay');
  const countdownNumber = document.getElementById('countdown-number');
  const thumbnailStrip = document.getElementById('thumbnail-strip');
  const photoCountMsg = document.getElementById('photo-count-msg');

  const btnStart = document.getElementById('btn-start');
  const btnCapture = document.getElementById('btn-capture');
  const btnEndSession = document.getElementById('btn-end-session');
  const btnSubmit = document.getElementById('btn-submit');
  const inputEmail = document.getElementById('input-email');
  const inputPhone = document.getElementById('input-phone');
  const groupEmail = document.getElementById('group-email');
  const groupPhone = document.getElementById('group-phone');
  const formHint = document.getElementById('form-hint');

  // --- Init ---
  async function init() {
    let cameraPosition = 'above';
    let lookText = 'Look up here!';
    let appMode = 'prod';

    try {
      const res = await fetch('/api/config');
      const cfg = await res.json();
      countdownSeconds = cfg.countdownSeconds || 5;
      cameraPosition = cfg.cameraPosition || 'above';
      lookText = cfg.lookText || (cameraPosition === 'above' ? 'Look up here!' : 'Look down here!');
      enableEmail = cfg.enableEmail !== false;
      enablePhone = cfg.enablePhone !== false;
      appMode = cfg.mode || 'prod';
    } catch (err) {
      console.warn('Could not fetch config, using defaults');
    }

    Kiosk.init(appMode);
    Validation.init(document.getElementById('toast'));
    LookIndicator.init(
      document.getElementById('look-indicator'),
      document.getElementById('look-arrow'),
      document.getElementById('look-text'),
      cameraPosition,
      lookText
    );
    Keyboard.init(document.getElementById('keyboard'), () => activeInput);

    setupContactForm();
    connectWebSocket();
    bindEvents();
  }

  // --- Contact Form Setup ---
  function setupContactForm() {
    if (!enableEmail) groupEmail.style.display = 'none';
    if (!enablePhone) groupPhone.style.display = 'none';

    if (enableEmail && enablePhone) {
      formHint.textContent = 'Enter your email and/or phone number to receive your photos.';
    } else if (enableEmail) {
      formHint.textContent = 'Enter your email address to receive your photos.';
    } else if (enablePhone) {
      formHint.textContent = 'Enter your phone number to receive your photos.';
    }
  }

  // --- WebSocket ---
  function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}`;

    ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      console.log('[ws] Connected');
    };

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        handleBinaryMessage(event.data);
      } else {
        handleJsonMessage(event.data);
      }
    };

    ws.onclose = () => {
      console.log('[ws] Disconnected, reconnecting in 2s...');
      setTimeout(connectWebSocket, 2000);
    };

    ws.onerror = (err) => {
      console.error('[ws] Error:', err);
    };
  }

  function handleBinaryMessage(data) {
    const arr = new Uint8Array(data);
    if (arr.length > 5 &&
        arr[0] === 70 && arr[1] === 82 && arr[2] === 65 &&
        arr[3] === 77 && arr[4] === 69) {
      const jpegData = arr.subarray(5);
      const blob = new Blob([jpegData], { type: 'image/jpeg' });
      const url = URL.createObjectURL(blob);

      const oldSrc = previewImg.src;
      previewImg.src = url;

      if (oldSrc && oldSrc.startsWith('blob:')) {
        URL.revokeObjectURL(oldSrc);
      }

      noSignal.classList.add('hidden');
      previewImg.classList.add('has-feed');
    }
  }

  function handleJsonMessage(data) {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }

    const { type, payload } = msg;

    switch (type) {
      case 'session:started':
        showScreen('session');
        thumbnailStrip.innerHTML = '';
        btnCapture.disabled = false;
        if (payload.photos && payload.photos.length > 0) {
          for (const photo of payload.photos) {
            addThumbnail(`/sessions/${payload.id}/${photo.filename}`);
          }
        }
        break;

      case 'capture:countdown':
        startCountdown(payload.seconds);
        break;

      case 'capture:complete':
        isCapturing = false;
        hideOverlay(screenProcessing);
        triggerFlash();
        addThumbnail(payload.url);
        btnCapture.disabled = false;
        break;

      case 'capture:error':
        isCapturing = false;
        hideOverlay(screenProcessing);
        btnCapture.disabled = false;
        console.error('[capture] Error:', payload.message);
        break;

      case 'session:ended':
        showScreen('idle');
        break;

      case 'error':
        console.error('[server] Error:', payload.message);
        isCapturing = false;
        hideOverlay(screenProcessing);
        hideOverlay(screenCountdown);
        btnCapture.disabled = false;
        break;
    }
  }

  function wsSend(type, payload) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, payload }));
    }
  }

  // --- UI Events ---
  function bindEvents() {
    btnStart.addEventListener('click', () => {
      wsSend('session:start');
    });

    btnCapture.addEventListener('click', () => {
      if (isCapturing) return;
      isCapturing = true;
      btnCapture.disabled = true;
      wsSend('capture');
    });

    btnEndSession.addEventListener('click', () => {
      const count = thumbnailStrip.children.length;
      photoCountMsg.textContent = `You took ${count} photo${count !== 1 ? 's' : ''}!`;
      inputEmail.value = '';
      inputPhone.value = '';
      activeInput = enableEmail ? inputEmail : (enablePhone ? inputPhone : null);
      highlightActiveInput();
      showScreen('contact');
    });

    btnSubmit.addEventListener('click', () => {
      const email = enableEmail ? inputEmail.value.trim() : '';
      const phone = enablePhone ? inputPhone.value.trim() : '';

      if (enableEmail && enablePhone && !email && !phone) {
        Validation.flashInput(inputEmail);
        Validation.flashInput(inputPhone);
        Validation.showToast('Please enter an email address or phone number.');
        return;
      }

      if (enableEmail && !enablePhone && !email) {
        Validation.flashInput(inputEmail);
        Validation.showToast('Please enter an email address.');
        return;
      }

      if (enablePhone && !enableEmail && !phone) {
        Validation.flashInput(inputPhone);
        Validation.showToast('Please enter a phone number.');
        return;
      }

      if (email && !Validation.isValidEmail(email)) {
        Validation.flashInput(inputEmail);
        Validation.showToast('Please enter a valid email address (e.g. name@example.com).');
        return;
      }

      if (phone && !Validation.isValidPhone(phone)) {
        Validation.flashInput(inputPhone);
        Validation.showToast('Please enter a valid phone number (at least 10 digits).');
        return;
      }

      wsSend('session:end', { email, phone });
    });

    inputEmail.addEventListener('click', () => {
      activeInput = inputEmail;
      highlightActiveInput();
    });
    inputPhone.addEventListener('click', () => {
      activeInput = inputPhone;
      highlightActiveInput();
    });
  }

  function highlightActiveInput() {
    inputEmail.classList.toggle('!ring-2', activeInput === inputEmail);
    inputEmail.classList.toggle('!ring-ring', activeInput === inputEmail);
    inputPhone.classList.toggle('!ring-2', activeInput === inputPhone);
    inputPhone.classList.toggle('!ring-ring', activeInput === inputPhone);
  }

  // --- Screen Management ---
  function showScreen(name) {
    currentScreen = name;
    screenIdle.classList.toggle('active', name === 'idle');
    screenSession.classList.toggle('active', name === 'session');
    screenContact.classList.toggle('active', name === 'contact');

    if (name === 'session') {
      LookIndicator.show();
    } else {
      LookIndicator.hide();
    }
  }

  function showOverlay(el) {
    el.classList.add('active');
  }

  function hideOverlay(el) {
    el.classList.remove('active');
  }

  // --- Countdown ---
  function startCountdown(seconds) {
    let remaining = seconds;
    countdownNumber.textContent = remaining;
    showOverlay(screenCountdown);
    LookIndicator.startPulsing();

    clearInterval(countdownTimer);
    countdownTimer = setInterval(() => {
      remaining--;
      if (remaining > 0) {
        countdownNumber.textContent = remaining;
      } else {
        clearInterval(countdownTimer);
        countdownTimer = null;
        LookIndicator.stopPulsing();
        hideOverlay(screenCountdown);
        showOverlay(screenProcessing);
        wsSend('capture:trigger');
      }
    }, 1000);
  }

  // --- Flash Effect ---
  function triggerFlash() {
    flashOverlay.classList.remove('active');
    void flashOverlay.offsetWidth;
    flashOverlay.classList.add('active');
    setTimeout(() => {
      flashOverlay.classList.remove('active');
    }, 500);
  }

  // --- Thumbnails ---
  function addThumbnail(url) {
    const img = document.createElement('img');
    img.className = 'thumbnail';
    img.src = url;
    img.alt = 'Photo';
    thumbnailStrip.appendChild(img);
    thumbnailStrip.scrollLeft = thumbnailStrip.scrollWidth;
  }

  // --- Boot ---
  document.addEventListener('DOMContentLoaded', init);
})();
