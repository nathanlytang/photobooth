import { useState, useEffect } from 'react';
import LoginScreen from './LoginScreen';
import AdminPanel from './AdminPanel';
import type { PhotoboothConfig } from './types';

export default function AdminApp() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [config, setConfig] = useState<PhotoboothConfig | null>(null);

  useEffect(() => {
    fetch('/api/admin/session')
      .then((res) => res.json())
      .then((data) => {
        setAuthenticated(data.authenticated);
        if (data.authenticated) {
          loadConfig();
        }
      })
      .catch(() => setAuthenticated(false));
  }, []);

  function loadConfig() {
    fetch('/api/admin/config')
      .then((res) => res.json())
      .then((data) => setConfig(data))
      .catch(() => setAuthenticated(false));
  }

  function handleLogin() {
    setAuthenticated(true);
    loadConfig();
  }

  function handleLogout() {
    fetch('/api/admin/logout', { method: 'POST' }).finally(() => {
      setAuthenticated(false);
      setConfig(null);
    });
  }

  if (authenticated === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" />
      </div>
    );
  }

  if (!authenticated) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  if (!config) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" />
      </div>
    );
  }

  return <AdminPanel initialConfig={config} onLogout={handleLogout} />;
}
