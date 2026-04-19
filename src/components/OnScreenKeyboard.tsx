import { useState, useCallback } from 'react';

const LAYOUTS: Record<string, string[][]> = {
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

interface OnScreenKeyboardProps {
  value: string;
  onChange: (newValue: string) => void;
}

export default function OnScreenKeyboard({ value, onChange }: OnScreenKeyboardProps) {
  const [layout, setLayout] = useState('alpha');
  const [shiftActive, setShiftActive] = useState(false);

  const typeChar = useCallback((ch: string) => {
    onChange(value + ch);
    if (shiftActive) {
      setShiftActive(false);
    }
  }, [value, onChange, shiftActive]);

  const handleAction = useCallback((action: string) => {
    switch (action) {
      case 'backspace':
        if (value.length > 0) {
          onChange(value.slice(0, -1));
        }
        break;
      case 'shift':
        setShiftActive(prev => !prev);
        break;
      case 'space':
        onChange(value + ' ');
        break;
      case 'clear':
        onChange('');
        break;
      case 'numbers':
        setShiftActive(false);
        setLayout('numbers');
        break;
      case 'alpha':
        setShiftActive(false);
        setLayout('alpha');
        break;
      case 'symbols':
        setShiftActive(false);
        setLayout('symbols');
        break;
    }
  }, [value, onChange]);

  const rows = LAYOUTS[layout];

  return (
    <div className="keyboard-container">
      {rows.map((row, rowIdx) => (
        <div key={rowIdx} className="keyboard-row">
          {row.map((key, keyIdx) => {
            if (key.startsWith('{')) {
              const action = key.slice(1, -1);
              let label = '';
              let extraClass = 'kb-key-wide';

              switch (action) {
                case 'shift':
                  label = '\u21E7';
                  break;
                case 'backspace':
                  label = '\u232B';
                  break;
                case 'space':
                  label = '';
                  extraClass = 'kb-key-space';
                  break;
                case 'clear':
                  label = 'Clear';
                  break;
                case 'numbers':
                  label = '123';
                  break;
                case 'alpha':
                  label = 'ABC';
                  break;
                case 'symbols':
                  label = '#+=';
                  break;
              }

              return (
                <button
                  key={keyIdx}
                  type="button"
                  className={`kb-key ${extraClass} ${action === 'shift' && shiftActive ? 'kb-key-active' : ''}`}
                  onClick={(e) => { e.preventDefault(); handleAction(action); }}
                >
                  {label}
                </button>
              );
            }

            const display = shiftActive ? key.toUpperCase() : key;
            return (
              <button
                key={keyIdx}
                type="button"
                className="kb-key"
                onClick={(e) => { e.preventDefault(); typeChar(display); }}
              >
                {display}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
