(function () {
  'use strict';

  const LAYOUTS = {
    alpha: [
      ['q','w','e','r','t','y','u','i','o','p'],
      ['a','s','d','f','g','h','j','k','l'],
      ['{shift}','z','x','c','v','b','n','m','{backspace}'],
      ['{numbers}','-','_','@','{space}','.','{clear}']
    ],
    numbers: [
      ['1','2','3','4','5','6','7','8','9','0'],
      ['+','(',')','/','#','&','!','?'],
      ['{symbols}','.',',','@','-','_','{backspace}'],
      ['{alpha}','{space}','{clear}']
    ],
    symbols: [
      ['~','`','|','$','^','*','"','\'',':',';'],
      ['{','}','[',']','<','>','=','%'],
      ['{numbers}','.',',','@','-','_','{backspace}'],
      ['{alpha}','{space}','{clear}']
    ]
  };

  let container = null;
  let getActiveInput = null;
  let currentLayout = 'alpha';
  let shiftActive = false;

  function init(containerEl, activeInputFn) {
    container = containerEl;
    getActiveInput = activeInputFn;
    renderLayout(currentLayout);
  }

  function renderLayout(layoutName) {
    currentLayout = layoutName;
    const layout = LAYOUTS[layoutName];
    container.innerHTML = '';

    for (const row of layout) {
      const rowEl = document.createElement('div');
      rowEl.className = 'keyboard-row';

      for (const key of row) {
        const btn = document.createElement('button');
        btn.className = 'kb-key';
        btn.setAttribute('type', 'button');

        if (key.startsWith('{')) {
          const action = key.slice(1, -1);
          btn.dataset.action = action;
          btn.classList.add('kb-key-wide');

          switch (action) {
            case 'shift':
              btn.textContent = '\u21E7';
              if (shiftActive) btn.classList.add('kb-key-active');
              break;
            case 'backspace':
              btn.textContent = '\u232B';
              break;
            case 'space':
              btn.textContent = '';
              btn.classList.remove('kb-key-wide');
              btn.classList.add('kb-key-space');
              break;
            case 'clear':
              btn.textContent = 'Clear';
              break;
            case 'numbers':
              btn.textContent = '123';
              break;
            case 'alpha':
              btn.textContent = 'ABC';
              break;
            case 'symbols':
              btn.textContent = '#+=';
              break;
          }

          btn.addEventListener('click', (e) => {
            e.preventDefault();
            handleAction(action);
          });
        } else {
          const display = shiftActive ? key.toUpperCase() : key;
          btn.textContent = display;
          btn.addEventListener('click', (e) => {
            e.preventDefault();
            typeChar(display);
          });
        }

        rowEl.appendChild(btn);
      }

      container.appendChild(rowEl);
    }
  }

  function typeChar(ch) {
    const input = getActiveInput();
    if (!input) return;
    input.value += ch;
    if (shiftActive) {
      shiftActive = false;
      renderLayout(currentLayout);
    }
  }

  function handleAction(action) {
    const input = getActiveInput();
    switch (action) {
      case 'backspace':
        if (input && input.value.length > 0) {
          input.value = input.value.slice(0, -1);
        }
        break;
      case 'shift':
        shiftActive = !shiftActive;
        renderLayout(currentLayout);
        break;
      case 'space':
        if (input) input.value += ' ';
        break;
      case 'clear':
        if (input) input.value = '';
        break;
      case 'numbers':
        shiftActive = false;
        renderLayout('numbers');
        break;
      case 'alpha':
        shiftActive = false;
        renderLayout('alpha');
        break;
      case 'symbols':
        shiftActive = false;
        renderLayout('symbols');
        break;
    }
  }

  window.Photobooth = window.Photobooth || {};
  window.Photobooth.Keyboard = { init };
})();
