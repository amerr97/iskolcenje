import React, { useMemo, useState } from 'react';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { Download, RefreshCw, CheckCircle2, TriangleAlert } from 'lucide-react';

export type GithubAsset = {
  name: string;
  browser_download_url: string;
  content_type?: string;
  size?: number;
};

export type GithubRelease = {
  tag_name: string;
  name: string;
  body: string;
  html_url: string;
  assets: GithubAsset[];
  published_at: string;
};

export const RELEASE_API_URL = 'https://api.github.com/repos/amerr97/e-iskolcenje/releases/latest';
const RELEASES_PAGE_URL = 'https://github.com/amerr97/e-iskolcenje/releases/';
const WEB_FALLBACK_VERSION = '1.1.0';

export const extractVersion = (rawValue: string): string => {
  const match = rawValue.match(/(\d+(?:\.\d+){0,2})/);
  return match ? match[1] : '0.0.0';
};

export const compareVersions = (a: string, b: string): number => {
  const aParts = a.split('.').map(Number);
  const bParts = b.split('.').map(Number);
  const maxLen = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < maxLen; i += 1) {
    const aValue = aParts[i] ?? 0;
    const bValue = bParts[i] ?? 0;
    if (aValue > bValue) return 1;
    if (aValue < bValue) return -1;
  }
  return 0;
};

interface UpdatesTabProps {
  initialCurrentVersion?: string;
  initialRelease?: GithubRelease | null;
  initialError?: string | null;
  onUpdateStatusChange?: (payload: {
    currentVersion: string;
    release: GithubRelease | null;
    updateAvailable: boolean;
    checkedAt: number;
    error: string | null;
  }) => void;
}

const UpdatesTab: React.FC<UpdatesTabProps> = ({
  initialCurrentVersion = WEB_FALLBACK_VERSION,
  initialRelease = null,
  initialError = null,
  onUpdateStatusChange,
}) => {
  const [currentVersion, setCurrentVersion] = useState<string>(initialCurrentVersion);
  const [release, setRelease] = useState<GithubRelease | null>(initialRelease);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(initialError);

  const isUpdateAvailable = useMemo(() => {
    if (!release) return false;
    const localVersion = extractVersion(currentVersion);
    const remoteVersion = extractVersion(release.tag_name || release.name);
    return compareVersions(remoteVersion, localVersion) > 0;
  }, [release, currentVersion]);

  const apkAsset = useMemo(() => {
    if (!release) return null;
    return release.assets.find((asset) =>
      asset.name.toLowerCase().endsWith('.apk') ||
      asset.content_type?.toLowerCase().includes('android')
    ) ?? null;
  }, [release]);

  const checkForUpdates = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(RELEASE_API_URL, {
        headers: { Accept: 'application/vnd.github+json' },
      });

      if (!response.ok) {
        throw new Error(`GitHub API greška (${response.status})`);
      }

      const data = (await response.json()) as GithubRelease;
      setRelease(data);
      const localVersion = extractVersion(currentVersion);
      const remoteVersion = extractVersion(data.tag_name || data.name);
      const updateAvailable = compareVersions(remoteVersion, localVersion) > 0;
      onUpdateStatusChange?.({
        currentVersion,
        release: data,
        updateAvailable,
        checkedAt: Date.now(),
        error: null,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Nepoznata greška';
      setError(message);
      setRelease(null);
      onUpdateStatusChange?.({
        currentVersion,
        release: null,
        updateAvailable: false,
        checkedAt: Date.now(),
        error: message,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleInstall = async () => {
    if (!release) return;
    const targetUrl = apkAsset?.browser_download_url ?? release.html_url;
    if (Capacitor.isNativePlatform() && !apkAsset) {
      setError('APK asset nije pronađen u release-u.');
      return;
    }

    setDownloading(true);
    setError(null);
    try {
      await Browser.open({ url: targetUrl });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Greška pri preuzimanju APK-a.';
      setError(message);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
        <h2 className="text-2xl font-bold text-slate-800 mb-2 flex items-center gap-2">
          <RefreshCw className="text-indigo-600 w-6 h-6" /> Provjera ažuriranja
        </h2>
        <p className="text-slate-500 mb-6">
          Provjerite da li postoji noviji APK na GitHub Releases stranici.
        </p>

        <div className="grid sm:grid-cols-2 gap-4 mb-6">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Trenutna verzija</p>
            <p className="text-lg font-bold text-slate-800">v{extractVersion(currentVersion)}</p>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Zadnja objavljena verzija</p>
            <p className="text-lg font-bold text-slate-800">
              {release ? `v${extractVersion(release.tag_name || release.name)}` : '-'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={checkForUpdates}
            disabled={loading}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition-colors disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Provjeravam...' : 'Provjeri ažuriranja'}
          </button>

          <button
            onClick={handleInstall}
            disabled={!release || !isUpdateAvailable || downloading}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-slate-200 hover:border-indigo-500 text-slate-700 font-semibold transition-colors disabled:opacity-60 disabled:hover:border-slate-200"
          >
            <Download className="w-4 h-4" />
            {downloading ? 'Preuzimam APK...' : 'Preuzmi i instaliraj'}
          </button>
        </div>

        {release && !error && (
          <div className={`mt-6 rounded-xl border p-4 ${isUpdateAvailable ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
            {isUpdateAvailable ? (
              <p className="text-emerald-700 font-medium flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                Dostupna je nova verzija. Kliknite "Preuzmi i instaliraj".
              </p>
            ) : (
              <p className="text-slate-700 font-medium">
                Već koristite najnoviju verziju.
              </p>
            )}
            {release.body && (
              <p className="text-sm text-slate-600 mt-3 whitespace-pre-wrap">{release.body}</p>
            )}
          </div>
        )}

        {error && (
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800 text-sm">
            <p className="font-semibold flex items-center gap-2">
              <TriangleAlert className="w-4 h-4" />
              Neuspjela provjera ažuriranja
            </p>
            <p className="mt-1">{error}</p>
          </div>
        )}

        <p className="text-xs text-slate-500 mt-6">
          Napomena: Android uvijek traži potvrdu korisnika za instalaciju APK-a (Unknown apps dozvola).
        </p>
        <button
          type="button"
          onClick={() => Browser.open({ url: RELEASES_PAGE_URL })}
          className="mt-2 text-xs font-semibold text-indigo-600 hover:text-indigo-700 underline underline-offset-2"
        >
          {RELEASES_PAGE_URL}
        </button>
      </div>
    </div>
  );
};

export default UpdatesTab;
