(function () {
  'use strict';

  let toastEl = null;
  let toastTimeout = null;

  function init(toastElement) {
    toastEl = toastElement;
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function isValidPhone(phone) {
    const digits = phone.replace(/\D/g, '');
    return digits.length >= 10;
  }

  function flashInput(el) {
    el.classList.add('!border-red-500');
    setTimeout(() => el.classList.remove('!border-red-500'), 2500);
  }

  function showToast(message) {
    clearTimeout(toastTimeout);
    toastEl.textContent = message;
    toastEl.classList.add('visible');
    toastTimeout = setTimeout(() => {
      toastEl.classList.remove('visible');
    }, 3000);
  }

  window.Photobooth = window.Photobooth || {};
  window.Photobooth.Validation = { init, isValidEmail, isValidPhone, flashInput, showToast };
})();
