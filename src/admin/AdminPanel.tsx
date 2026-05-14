import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import GeneralTab from './tabs/GeneralTab';
import CameraTab from './tabs/CameraTab';
import PreviewTab from './tabs/PreviewTab';
import GalleryTab from './tabs/GalleryTab';
import VideoTab from './tabs/VideoTab';
import NotificationsTab from './tabs/NotificationsTab';
import AdminTab from './tabs/AdminTab';
import AdvancedTab from './tabs/AdvancedTab';
import RestartDialog from './RestartDialog';
import type { PhotoboothConfig } from './types';

interface AdminPanelProps {
  initialConfig: PhotoboothConfig;
  onLogout: () => void;
}

export default function AdminPanel({ initialConfig, onLogout }: AdminPanelProps) {
  const [original, setOriginal] = useState<PhotoboothConfig>(initialConfig);
  const [draft, setDraft] = useState<PhotoboothConfig>(initialConfig);
  const [tab, setTab] = useState('general');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState('');
  const [restartOpen, setRestartOpen] = useState(false);

  const dirty = JSON.stringify(original) !== JSON.stringify(draft);

  const handleChange = useCallback((next: PhotoboothConfig) => {
    setDraft(next);
    setSaveError('');
    setSaveSuccess('');
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaveError('');
    setSaveSuccess('');
    try {
      const res = await fetch('/api/admin/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error || 'Save failed');
      } else {
        setOriginal(draft);
        setSaveSuccess('Saved successfully');
      }
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function handleDiscard() {
    setDraft(original);
    setSaveError('');
    setSaveSuccess('');
  }

  return (
    <div className="h-full min-h-screen overflow-y-auto bg-zinc-50 text-zinc-900 select-text">
      <header className="border-b bg-white px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Photobooth Admin</h1>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => setRestartOpen(true)}>
              Restart App
            </Button>
            <Button variant="ghost" size="sm" onClick={onLogout}>
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-6">
        <Card>
          <CardContent className="pt-6">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList>
                <TabsTrigger value="general">General</TabsTrigger>
                <TabsTrigger value="camera">Camera</TabsTrigger>
                <TabsTrigger value="preview">Preview</TabsTrigger>
                <TabsTrigger value="gallery">Gallery</TabsTrigger>
                <TabsTrigger value="video">Video</TabsTrigger>
                <TabsTrigger value="notifications">Notifications</TabsTrigger>
                <TabsTrigger value="admin">Admin</TabsTrigger>
                <TabsTrigger value="advanced">Advanced</TabsTrigger>
              </TabsList>

              <TabsContent value="general">
                <GeneralTab config={draft} onChange={handleChange} />
              </TabsContent>
              <TabsContent value="camera">
                <CameraTab config={draft} onChange={handleChange} />
              </TabsContent>
              <TabsContent value="preview">
                <PreviewTab config={draft} onChange={handleChange} />
              </TabsContent>
              <TabsContent value="gallery">
                <GalleryTab config={draft} onChange={handleChange} />
              </TabsContent>
              <TabsContent value="video">
                <VideoTab config={draft} onChange={handleChange} />
              </TabsContent>
              <TabsContent value="notifications">
                <NotificationsTab config={draft} onChange={handleChange} />
              </TabsContent>
              <TabsContent value="admin">
                <AdminTab config={draft} onChange={handleChange} />
              </TabsContent>
              <TabsContent value="advanced">
                <AdvancedTab config={draft} onChange={handleChange} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {dirty && <span className="rounded bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">Unsaved changes</span>}
            {saveError && <span className="text-sm text-red-600">{saveError}</span>}
            {saveSuccess && <span className="text-sm text-green-600">{saveSuccess}</span>}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleDiscard} disabled={!dirty}>
              Discard
            </Button>
            <Button onClick={handleSave} disabled={!dirty || saving}>
              {saving ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </main>

      <RestartDialog open={restartOpen} onOpenChange={setRestartOpen} />
    </div>
  );
}
