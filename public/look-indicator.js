(function () {
  'use strict';

  let indicatorEl = null;
  let textEl = null;

  function init(indicator, arrow, text, position, label) {
    indicatorEl = indicator;
    textEl = text;
    indicatorEl.classList.add(`position-${position}`);
    textEl.textContent = label;
  }

  function show() {
    indicatorEl.classList.remove('hidden');
  }

  function hide() {
    indicatorEl.classList.add('hidden');
  }

  function pop() {
    indicatorEl.classList.remove('pop');
    void indicatorEl.offsetWidth;
    indicatorEl.classList.add('pop');
  }

  function startPulsing() {
    indicatorEl.classList.remove('pop');
    indicatorEl.classList.add('pulsing');
  }

  function stopPulsing() {
    indicatorEl.classList.remove('pulsing');
  }

  window.Photobooth = window.Photobooth || {};
  window.Photobooth.LookIndicator = { init, show, hide, pop, startPulsing, stopPulsing };
})();
