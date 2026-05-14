import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { PhotoboothConfig } from '@/admin/types';

interface Props {
  config: PhotoboothConfig;
  onChange: (next: PhotoboothConfig) => void;
}

export default function AdminTab({ config, onChange }: Props) {
  const admin = config.admin;
  const [confirmPw, setConfirmPw] = useState('');
  const [error, setError] = useState('');

  const updateAdmin = (patch: Partial<PhotoboothConfig['admin']>) => {
    onChange({ ...config, admin: { ...admin, ...patch } });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Password</Label>
          <Input
            type="password"
            value={admin.password}
            onChange={(e) => {
              setError('');
              updateAdmin({ password: e.target.value });
            }}
          />
          <p className="text-xs text-zinc-500">Plaintext password used to access this admin panel. Stored in config.json — keep the file private.</p>
        </div>
        <div className="space-y-1.5">
          <Label>Confirm Password</Label>
          <Input
            type="password"
            value={confirmPw}
            onChange={(e) => {
              setError('');
              setConfirmPw(e.target.value);
            }}
          />
          {confirmPw && admin.password !== confirmPw && (
            <p className="text-xs text-red-600">Passwords do not match</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>Session TTL (minutes)</Label>
          <Input type="number" value={admin.sessionTtlMinutes} onChange={(e) => updateAdmin({ sessionTtlMinutes: Number(e.target.value) })} />
          <p className="text-xs text-zinc-500">How long a logged-in admin session lasts before requiring a re-login.</p>
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
