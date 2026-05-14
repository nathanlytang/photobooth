import { useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import type { PhotoboothConfig } from '@/admin/types';

interface Props {
  config: PhotoboothConfig;
  onChange: (next: PhotoboothConfig) => void;
}

export default function AdvancedTab({ config, onChange }: Props) {
  const [raw, setRaw] = useState(() => JSON.stringify(config, null, 2));
  const [error, setError] = useState('');

  function apply() {
    setError('');
    try {
      const parsed = JSON.parse(raw);
      onChange(parsed);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-3">
      <Label>Raw config.json</Label>
      <Textarea
        className="font-mono text-xs"
        rows={24}
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button variant="outline" onClick={apply}>Parse & Apply</Button>
    </div>
  );
}
