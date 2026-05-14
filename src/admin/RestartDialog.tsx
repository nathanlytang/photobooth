import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogTitle, DialogDescription } from '@/components/ui/dialog';

interface RestartDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function RestartDialog({ open, onOpenChange }: RestartDialogProps) {
  const [status, setStatus] = useState<'confirm' | 'restarting' | 'back'>('confirm');

  useEffect(() => {
    if (open) setStatus('confirm');
  }, [open]);

  async function doRestart() {
    setStatus('restarting');
    try {
      await fetch('/api/admin/restart', { method: 'POST' });
    } catch {
      // ignore
    }
    // Poll until server is back
    let attempts = 0;
    const poll = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch('/api/admin/session', { method: 'GET' });
        if (res.ok) {
          clearInterval(poll);
          setStatus('back');
          window.location.reload();
        }
      } catch {
        // still down
      }
      if (attempts > 120) {
        clearInterval(poll);
        setStatus('back');
      }
    }, 1000);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <div className="space-y-4">
        <DialogTitle>Restart Application</DialogTitle>
        <DialogDescription>
          {status === 'confirm'
            ? 'This will exit the process and rely on PM2 to restart it. In development you may need to restart manually.'
            : status === 'restarting'
            ? 'Waiting for the server to come back online…'
            : 'The server should be back. Refresh the page if needed.'}
        </DialogDescription>
        <div className="flex justify-end gap-2">
          {status === 'confirm' && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={doRestart}>
                Restart Now
              </Button>
            </>
          )}
          {status === 'restarting' && (
            <Button disabled>
              <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" />
              Restarting…
            </Button>
          )}
          {status === 'back' && (
            <Button onClick={() => window.location.reload()}>Reload Page</Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
