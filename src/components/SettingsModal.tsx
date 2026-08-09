import React, { useState, useEffect, useRef } from 'react';
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { UserShow } from '../types';
import { Download, Upload, X, CheckCircle2, AlertCircle, Bell, BellRing, Smartphone, Server, KeyRound } from 'lucide-react';
import { auth, db } from '../firebase';
import { writeBatch, doc } from 'firebase/firestore';
import { 
  getNotificationPermissionStatus, 
  areNotificationsEnabled, 
  setNotificationsEnabled, 
  requestNotificationPermission, 
  sendLocalNotification, 
  isIOS, 
  isStandalonePWA 
} from '../lib/notifications';
import { TMDB_API_KEY_STORAGE_KEY } from '../lib/tmdb';
import { normalizeAioStreamsBaseUrl, validateAioStreamsProvider } from '../lib/debrid';

export function SettingsModal({ isOpen, onClose, shows }: { isOpen: boolean, onClose: () => void, shows: UserShow[] }) {
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [importStatus, setImportStatus] = useState<{type: 'idle' | 'loading' | 'success' | 'error', message: string}>({ type: 'idle', message: '' });

  const [aiostreamsUrl, setAiostreamsUrl] = useState('');
  const [aiostreamsSaved, setAiostreamsSaved] = useState(false);
  const [tmdbKey, setTmdbKey] = useState('');
  const [tmdbSaved, setTmdbSaved] = useState(false);
  const [tmdbSaving, setTmdbSaving] = useState(false);
  const [tmdbError, setTmdbError] = useState('');

  const [notifPermission, setNotifPermission] = useState<NotificationPermission | "unsupported">('default');
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [testNotifSent, setTestNotifSent] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [providerError, setProviderError] = useState('');
  const [providerWarning, setProviderWarning] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined' && isOpen) {
      setNotifPermission(getNotificationPermissionStatus());
      setNotifEnabled(areNotificationsEnabled());
      setTmdbKey(localStorage.getItem(TMDB_API_KEY_STORAGE_KEY) || '');
      setTmdbError('');
      
      const currentUrl = localStorage.getItem("aiostreams_base_url") || "";
      const envUrl = (import.meta as any).env?.VITE_AIOSTREAMS_BASE_URL?.trim();
      
      if (currentUrl && envUrl) {
        const normCurrent = currentUrl.replace(/\/manifest\.json(?:\?.*)?$/i, "").replace(/\/+$/, "");
        const normEnv = envUrl.replace(/\/manifest\.json(?:\?.*)?$/i, "").replace(/\/+$/, "");
        
        if (normCurrent === normEnv) {
          localStorage.removeItem("aiostreams_base_url");
          setAiostreamsUrl('');
        } else {
          setAiostreamsUrl(currentUrl);
        }
      } else {
        setAiostreamsUrl(currentUrl);
      }
    }
  }, [isOpen]);

  const handleSaveTmdbKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (typeof window === 'undefined') return;

    const trimmed = tmdbKey.trim();
    setTmdbError('');

    if (!trimmed) {
      localStorage.removeItem(TMDB_API_KEY_STORAGE_KEY);
      setTmdbSaved(true);
      setTimeout(() => setTmdbSaved(false), 2500);
      return;
    }

    setTmdbSaving(true);
    try {
      const response = await fetch(
        `https://api.themoviedb.org/3/configuration?api_key=${encodeURIComponent(trimmed)}`,
        { headers: { Accept: 'application/json' } }
      );
      if (!response.ok) {
        throw new Error(response.status === 401 ? 'TMDB rejected this API key.' : `TMDB validation failed (HTTP ${response.status}).`);
      }

      localStorage.setItem(TMDB_API_KEY_STORAGE_KEY, trimmed);
      setTmdbKey(trimmed);
      setTmdbSaved(true);
      setTimeout(() => setTmdbSaved(false), 2500);
    } catch (err: any) {
      setTmdbError(err?.message || 'Unable to validate the TMDB API key.');
    } finally {
      setTmdbSaving(false);
    }
  };

  const handleSaveAiostreamsUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (typeof window !== 'undefined') {
      const trimmed = aiostreamsUrl.trim();
      setProviderError('');
      setProviderWarning('');
      
      if (trimmed) {
        setLoading(true);
        try {
          const normalized = normalizeAioStreamsBaseUrl(trimmed);
          let validationWarning = '';
          try {
            await validateAioStreamsProvider(normalized);
          } catch (validationError: any) {
            validationWarning = `${validationError?.message || 'Manifest validation was unavailable.'} The URL was saved because its stream endpoint will be tested when you play a title.`;
          }
          const envUrl = (import.meta as any).env?.VITE_AIOSTREAMS_BASE_URL?.trim();
          if (envUrl && normalized === normalizeAioStreamsBaseUrl(envUrl)) {
            localStorage.removeItem("aiostreams_base_url");
            setAiostreamsUrl('');
          } else {
            localStorage.setItem("aiostreams_base_url", normalized);
            setAiostreamsUrl(normalized);
          }

          setProviderWarning(validationWarning);
          setAiostreamsSaved(true);
          setTimeout(() => setAiostreamsSaved(false), 2500);
        } catch (err: any) {
          setProviderError(err.message || "Failed to validate provider.");
        } finally {
          setLoading(false);
        }
      } else {
        localStorage.removeItem("aiostreams_base_url");
        setProviderWarning('');
        setAiostreamsSaved(true);
        setTimeout(() => setAiostreamsSaved(false), 2500);
      }
    }
  };

  const handleToggleNotifications = async () => {
    if (notifPermission !== 'granted') {
      const result = await requestNotificationPermission();
      setNotifPermission(result);
      if (result === 'granted') {
        setNotifEnabled(true);
      } else {
        setNotifEnabled(false);
      }
    } else {
      const nextState = !notifEnabled;
      setNotificationsEnabled(nextState);
      setNotifEnabled(nextState);
    }
  };

  const handleSendTestNotification = async () => {
    try {
      await sendLocalNotification(
        "📺 NextUp Episode Alert Test",
        "Notification setup successful! You will receive alerts when new episodes in your library air.",
        "/icon-192.png"
      );
      setTestNotifSent(true);
      setTimeout(() => setTestNotifSent(false), 3000);
    } catch (error) {
      console.error("Test notification failed:", error);
    }
  };


  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [isOpen]);

  if (!isOpen) return null;
  
  const handleExport = () => {
    const dataStr = JSON.stringify(shows, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nextup_export_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportStatus({ type: 'loading', message: 'Restoring backup...' });
    const user = auth.currentUser;
    if (!user) {
      setImportStatus({ type: 'error', message: 'Not authenticated.' });
      return;
    }

    try {
      const text = await file.text();
      const importedData = JSON.parse(text) as UserShow[];
      
      if (!Array.isArray(importedData)) {
        throw new Error("Invalid backup file format. Expected an array of shows.");
      }
      
      // We will batch insert the shows
      const batch = writeBatch(db);
      let count = 0;
      
      for (const show of importedData) {
        if (!show.id || !show.name) continue; // Basic validation
        const showRef = doc(db, `users/${user.uid}/shows/${show.id}`);
        batch.set(showRef, show, { merge: true }); // Merge to avoid completely deleting fields if schema changed
        count++;
      }
      
      if (count > 0) {
        await batch.commit();
        setImportStatus({ type: 'success', message: `Successfully restored ${count} shows.` });
      } else {
        setImportStatus({ type: 'error', message: 'No valid shows found in backup file.' });
      }
      
    } catch (err: any) {
      console.error(err);
      setImportStatus({ type: 'error', message: err.message || 'Failed to parse backup file.' });
    }
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    if (newPin.length < 6) {
      setError('New PIN must be at least 6 digits');
      setLoading(false);
      return;
    }

    const user = auth.currentUser;
    if (!user || !user.email) {
      setError('Not authenticated');
      setLoading(false);
      return;
    }

    try {
      try {
        const credential = EmailAuthProvider.credential(user.email, currentPin);
        await reauthenticateWithCredential(user, credential);
      } catch (err: any) {
        if ((err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') && currentPin.length < 6) {
          const credential = EmailAuthProvider.credential(user.email, currentPin + '-nextup');
          await reauthenticateWithCredential(user, credential);
        } else {
          throw err;
        }
      }
      await updatePassword(user, newPin);
      setSuccess('PIN updated successfully!');
      setCurrentPin('');
      setNewPin('');
    } catch (err: any) {
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
        setError('Incorrect current PIN.');
      } else {
        setError(err.message || 'Failed to update PIN');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-md p-6 shadow-2xl relative animate-in max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain" onClick={(e) => e.stopPropagation()}>
        <button 
          onClick={onClose}
          className="absolute right-4 top-4 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
        >
          <X className="w-6 h-6" />
        </button>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Settings</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <h3 className="text-lg font-medium text-slate-200">Change PIN</h3>
          
          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1.5">Current 6-digit PIN</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={currentPin}
              onChange={(e) => setCurrentPin(e.target.value.replace(/[^0-9]/g, ''))}
              required
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-3 px-4 text-slate-900 dark:text-white focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all tracking-[0.3em] font-mono text-base"
              placeholder="••••••"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1.5">New 6-digit PIN</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/[^0-9]/g, ''))}
              required
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-3 px-4 text-slate-900 dark:text-white focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all tracking-[0.3em] font-mono text-base"
              placeholder="••••••"
            />
          </div>

          {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
          {success && <p className="text-green-400 text-sm mt-2">{success}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-900 dark:text-white font-bold py-3 rounded-xl transition-all disabled:opacity-50"
          >
            {loading ? "Updating..." : "Update PIN"}
          </button>
        </form>

        <div className="border-t border-slate-200 dark:border-slate-800 pt-8 mt-6">
          <div className="flex items-center gap-2 mb-2">
            <KeyRound className="w-5 h-5 text-orange-500" />
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">TMDB Catalog</h3>
          </div>
          <p className="text-slate-600 dark:text-slate-400 text-sm mb-3">
            Enter your TMDB v3 API key to load discovery, metadata, and poster artwork. The key stays in this browser and is never synced to GitHub or Firebase.
          </p>
          <form onSubmit={handleSaveTmdbKey} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                TMDB API Key
              </label>
              <input
                type="password"
                value={tmdbKey}
                onChange={(e) => setTmdbKey(e.target.value)}
                placeholder="Enter your TMDB v3 API key"
                autoComplete="off"
                spellCheck={false}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-2.5 px-3.5 text-slate-900 dark:text-white text-xs font-mono focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all"
              />
            </div>
            {tmdbSaved && (
              <p className="text-emerald-500 text-xs flex items-center gap-1 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" /> TMDB key saved. Reload NextUp to refresh the catalog.
              </p>
            )}
            {tmdbError && (
              <p className="text-red-500 text-xs flex items-center gap-1 font-medium">
                <X className="w-3.5 h-3.5" /> {tmdbError}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={tmdbSaving}
                className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-500/50 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition-all shadow-md shadow-orange-500/20"
              >
                {tmdbSaving ? 'Validating...' : 'Save TMDB Key'}
              </button>
              {tmdbKey && (
                <button
                  type="button"
                  onClick={() => {
                    setTmdbKey('');
                    localStorage.removeItem(TMDB_API_KEY_STORAGE_KEY);
                    setTmdbError('');
                    setTmdbSaved(true);
                    setTimeout(() => setTmdbSaved(false), 2500);
                  }}
                  className="px-3 py-2.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition-colors"
                >
                  Remove Key
                </button>
              )}
            </div>
          </form>
        </div>

        <div className="border-t border-slate-200 dark:border-slate-800 pt-8 mt-6">
          <div className="flex items-center gap-2 mb-2">
            <Server className="w-5 h-5 text-orange-500" />
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">Stream Provider (AIOStreams / Torrentio)</h3>
          </div>
          <p className="text-slate-600 dark:text-slate-400 text-sm mb-3">
            Configure your custom Stremio addon or AIOStreams manifest URL (e.g., Real-Debrid, Torrentio, or private AIOStreams instance).
          </p>
          <form onSubmit={handleSaveAiostreamsUrl} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                Manifest or Base URL
              </label>
              <input
                type="url"
                value={aiostreamsUrl}
                onChange={(e) => setAiostreamsUrl(e.target.value)}
                placeholder="https://torrentio.strem.fun or https://aiostreams.../manifest.json"
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-2.5 px-3.5 text-slate-900 dark:text-white text-xs font-mono focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all"
              />
            </div>
            {aiostreamsSaved && (
              <p className="text-emerald-500 text-xs flex items-center gap-1 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" /> Stream provider URL saved successfully!
              </p>
            )}
              {providerError && (
                <p className="text-red-500 text-xs flex items-center gap-1 font-medium">
                  <X className="w-3.5 h-3.5" /> {providerError}
                </p>
              )}
              {providerWarning && (
                <p className="text-amber-500 text-xs flex items-start gap-1 font-medium">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {providerWarning}
                </p>
              )}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-500/50 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition-all shadow-md shadow-orange-500/20"
              >
                {loading ? 'Validating...' : 'Save Provider URL'}
              </button>
              {aiostreamsUrl && (
                <button
                  type="button"
                  onClick={() => {
                      setAiostreamsUrl('');
                      localStorage.removeItem("aiostreams_base_url");
                      setProviderError('');
                      setProviderWarning('');
                      setAiostreamsSaved(true);
                    setTimeout(() => setAiostreamsSaved(false), 2500);
                  }}
                  className="px-3 py-2.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition-colors"
                >
                  Reset Default
                </button>
              )}
            </div>
          </form>
        </div>

        <div className="border-t border-slate-200 dark:border-slate-800 pt-8 mt-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <BellRing className="w-5 h-5 text-orange-500" />
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">Episode Airing Alerts</h3>
            </div>
            {notifPermission === 'granted' && notifEnabled && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                <CheckCircle2 className="w-3.5 h-3.5" /> Active
              </span>
            )}
          </div>

          <p className="text-slate-600 dark:text-slate-400 text-sm mb-4">
            Get in-app notifications on your phone or desktop when new episodes of shows in your library air!
          </p>

          {isIOS() && !isStandalonePWA() && (
            <div className="p-3.5 mb-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs space-y-1.5">
              <div className="flex items-center gap-1.5 font-bold">
                <Smartphone className="w-4 h-4 shrink-0" />
                <span>iOS Web Push Requirement</span>
              </div>
              <p className="leading-relaxed">
                On iOS (iPhone/iPad), Apple requires adding NextUp to your <strong>Home Screen</strong> to receive notifications:
              </p>
              <ol className="list-decimal list-inside space-y-0.5 opacity-90">
                <li>Tap Safari's <strong>Share</strong> button (box with arrow up)</li>
                <li>Select <strong>Add to Home Screen</strong></li>
                <li>Open NextUp from your Home Screen to enable alerts</li>
              </ol>
            </div>
          )}

          <div className="space-y-3">
            <button
              type="button"
              onClick={handleToggleNotifications}
              className={`w-full py-3 px-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                notifEnabled && notifPermission === 'granted'
                  ? 'bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white hover:bg-slate-300 dark:hover:bg-slate-700'
                  : 'bg-orange-500 hover:bg-orange-600 text-white shadow-lg shadow-orange-500/25 active:scale-95'
              }`}
            >
              <Bell className="w-4 h-4 shrink-0" />
              <span>
                {notifPermission === 'denied'
                  ? 'Notifications Blocked in Browser Settings'
                  : notifEnabled && notifPermission === 'granted'
                  ? 'Disable Airing Alerts'
                  : 'Enable Airing Alerts'}
              </span>
            </button>

            {notifPermission === 'granted' && (
              <button
                type="button"
                onClick={handleSendTestNotification}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
              >
                {testNotifSent ? '✓ Test Alert Fired!' : 'Send Test Notification'}
              </button>
            )}
          </div>
        </div>



        <div className="border-t border-slate-200 dark:border-slate-800 pt-8 mt-6">
          <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Data Backup</h3>
          <p className="text-slate-600 dark:text-slate-400 text-sm mb-4">Download a JSON copy of your entire library and watch history, or restore from a previous backup.</p>
          <div className="flex flex-col sm:flex-row gap-3">
            <button 
              onClick={handleExport}
              className="flex-1 flex items-center justify-center gap-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-900 dark:text-white font-bold py-2.5 px-4 rounded-xl transition-colors"
            >
              <Download className="w-5 h-5" /> Export Data
            </button>
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={importStatus.type === 'loading'}
              className="flex-1 flex items-center justify-center gap-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-900 dark:text-white font-bold py-2.5 px-4 rounded-xl transition-colors disabled:opacity-50"
            >
              <Upload className="w-5 h-5" /> {importStatus.type === 'loading' ? 'Restoring...' : 'Restore Data'}
            </button>
            <input 
              type="file" 
              accept=".json" 
              ref={fileInputRef} 
              onChange={handleImport} 
              className="hidden" 
            />
          </div>
          {importStatus.message && (
            <div className={`mt-3 p-3 rounded-lg flex items-start gap-2 text-sm ${
              importStatus.type === 'error' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 
              importStatus.type === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 
              'bg-blue-500/10 text-blue-400 border border-blue-500/20'
            }`}>
              {importStatus.type === 'error' ? <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> : <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />}
              <p>{importStatus.message}</p>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
