import { useState, useRef, useCallback, useEffect } from 'react';
import OnScreenKeyboard from './OnScreenKeyboard';
import { isValidEmail, isValidPhone } from '../lib/validation';

interface ContactScreenProps {
  active: boolean;
  enableEmail: boolean;
  enablePhone: boolean;
  photoCount: number;
  galleryEnabled: boolean;
  mode: 'dev' | 'prod';
  onSubmit: (email: string, phone: string) => void;
}

export default function ContactScreen({
  active,
  enableEmail,
  enablePhone,
  photoCount,
  galleryEnabled,
  mode,
  onSubmit,
}: ContactScreenProps) {
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [activeField, setActiveField] = useState<'email' | 'phone' | null>(
    enableEmail ? 'email' : enablePhone ? 'phone' : null
  );
  const [toast, setToast] = useState<string | null>(null);
  const [flashEmail, setFlashEmail] = useState(false);
  const [flashPhone, setFlashPhone] = useState(false);

  const toastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    setToast(msg);
    toastTimeout.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const flashInput = useCallback((field: 'email' | 'phone') => {
    if (field === 'email') {
      setFlashEmail(true);
      setTimeout(() => setFlashEmail(false), 2500);
    } else {
      setFlashPhone(true);
      setTimeout(() => setFlashPhone(false), 2500);
    }
  }, []);

  const handleSubmit = useCallback(() => {
    const trimEmail = email.trim();
    const trimPhone = phone.trim();

    if (enableEmail && enablePhone && !trimEmail && !trimPhone) {
      flashInput('email');
      flashInput('phone');
      showToast('Please enter an email address or phone number.');
      return;
    }

    if (enableEmail && !enablePhone && !trimEmail) {
      flashInput('email');
      showToast('Please enter an email address.');
      return;
    }

    if (enablePhone && !enableEmail && !trimPhone) {
      flashInput('phone');
      showToast('Please enter a phone number.');
      return;
    }

    if (trimEmail && !isValidEmail(trimEmail)) {
      flashInput('email');
      showToast('Please enter a valid email address (e.g. name@example.com).');
      return;
    }

    if (trimPhone && !isValidPhone(trimPhone)) {
      flashInput('phone');
      showToast('Please enter a valid phone number (at least 10 digits).');
      return;
    }

    onSubmit(trimEmail, trimPhone);
  }, [email, phone, enableEmail, enablePhone, onSubmit, flashInput, showToast]);

  // Reset form when becoming active
  const prevActive = useRef(active);
  useEffect(() => {
    if (active && !prevActive.current) {
      setEmail('');
      setPhone('');
      setActiveField(enableEmail ? 'email' : enablePhone ? 'phone' : null);
    }
    prevActive.current = active;
  }, [active, enableEmail, enablePhone]);

  const activeValue = activeField === 'email' ? email : activeField === 'phone' ? phone : '';
  const activeOnChange = useCallback((newValue: string) => {
    if (activeField === 'email') setEmail(newValue);
    else if (activeField === 'phone') setPhone(newValue);
  }, [activeField]);

  const hintText = enableEmail && enablePhone
    ? 'Enter your email and/or phone number to receive your photos.'
    : enableEmail
    ? 'Enter your email address to receive your photos.'
    : 'Enter your phone number to receive your photos.';

  return (
    <div className={`screen screen-contact ${active ? 'active' : ''}`}>
      <div className="flex flex-col h-full">
        {/* Top section: form card */}
        <div className="flex-1 flex items-center justify-center pt-6 pb-2">
          <div className="contact-card w-full max-w-2xl rounded-xl border border-border bg-card/90 backdrop-blur-xl shadow-2xl space-y-6">
            <div className="text-center space-y-1.5">
              <h2 className="contact-heading font-bold tracking-tight">Session Complete</h2>
              <p className="text-xl text-muted-foreground">
                You took {photoCount} photo{photoCount !== 1 ? 's' : ''}!
              </p>
            </div>
            <div className="space-y-3">
              {enableEmail && (
                <div className="space-y-1.5">
                  <label htmlFor="input-email" className="text-lg font-medium text-muted-foreground">Email</label>
                  <input
                    type="text"
                    id="input-email"
                    readOnly={mode !== 'dev'}
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onClick={() => setActiveField('email')}
                    className={`contact-input flex w-full rounded-lg border border-input bg-background px-5 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background transition-all ${
                      activeField === 'email' ? '!ring-2 !ring-ring' : ''
                    } ${flashEmail ? '!border-red-500' : ''}`}
                  />
                </div>
              )}
              {enablePhone && (
                <div className="space-y-1.5">
                  <label htmlFor="input-phone" className="text-lg font-medium text-muted-foreground">Phone</label>
                  <input
                    type="text"
                    id="input-phone"
                    readOnly={mode !== 'dev'}
                    placeholder="(555) 123-4567"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    onClick={() => setActiveField('phone')}
                    className={`contact-input flex w-full rounded-lg border border-input bg-background px-5 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background transition-all ${
                      activeField === 'phone' ? '!ring-2 !ring-ring' : ''
                    } ${flashPhone ? '!border-red-500' : ''}`}
                  />
                </div>
              )}
            </div>
            <p className="text-base text-center text-muted-foreground">{hintText}</p>
            <button className="btn-primary-action w-full" onClick={handleSubmit}>
              {galleryEnabled ? 'Submit' : 'Submit & Finish'}
            </button>
          </div>
        </div>
        {/* Bottom section: on-screen keyboard */}
        <OnScreenKeyboard value={activeValue} onChange={activeOnChange} />
      </div>

      {/* Validation toast */}
      <div className={`toast ${toast ? 'visible' : ''}`}>
        {toast}
      </div>
    </div>
  );
}
