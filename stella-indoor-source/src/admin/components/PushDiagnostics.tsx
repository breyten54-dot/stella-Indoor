import { useState } from 'react';
import { Stethoscope, Loader2, Copy, Check } from 'lucide-react';
import {
  isPushSupported, getNotificationPermission, subscribeToPush,
  getPushSubscription, isPushSubscriptionCurrent,
} from '@/admin/lib/pushNotifications';
import type { PushResult } from '@/admin/lib/pushNotifications';
import { VAPID_PUBLIC_KEY } from '@/admin/lib/pushConfig';

interface DiagReport {
  timestamp: string;
  userAgent: string;
  displayMode: string;
  support: { sw: boolean; push: boolean; notification: boolean };
  permission: string;
  sw: { registered: boolean; active: boolean; waiting: boolean; script: string };
  servedSwVersion: string;
  installedCaches: string[];
  vapid: { prefix: string; length: number };
  subscription: { present: boolean; currentKey: boolean; endpointPrefix: string };
  subscribeAttempt: PushResult | null;
}

async function collectDiagnostics(runSubscribe: boolean): Promise<DiagReport> {
  const report: DiagReport = {
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent,
    displayMode: window.matchMedia('(display-mode: standalone)').matches
      ? 'standalone (installed app)'
      : window.matchMedia('(display-mode: minimal-ui)').matches ? 'minimal-ui' : 'browser tab',
    support: {
      sw: 'serviceWorker' in navigator,
      push: 'PushManager' in window,
      notification: 'Notification' in window,
    },
    permission: getNotificationPermission(),
    sw: { registered: false, active: false, waiting: false, script: '' },
    servedSwVersion: 'fetch failed',
    installedCaches: [],
    vapid: { prefix: VAPID_PUBLIC_KEY.slice(0, 10), length: VAPID_PUBLIC_KEY.length },
    subscription: { present: false, currentKey: false, endpointPrefix: '' },
    subscribeAttempt: null,
  };

  try {
    const reg = await navigator.serviceWorker.getRegistration('/sw-admin.js');
    if (reg) {
      report.sw = {
        registered: true,
        active: !!reg.active,
        waiting: !!reg.waiting,
        script: reg.active?.scriptURL || reg.installing?.scriptURL || '',
      };
    }
  } catch { /* leave defaults */ }

  // Version the SERVER is serving vs the caches the RUNNING SW actually installed.
  // A mismatch means the device is executing a stale service worker.
  try {
    const swSource = await (await fetch('/sw-admin.js', { cache: 'no-store' })).text();
    report.servedSwVersion = swSource.match(/stella-admin-v\d+/)?.[0] || 'version marker not found';
  } catch { /* leave 'fetch failed' */ }
  try {
    report.installedCaches = (await caches.keys()).filter(k => k.startsWith('stella-admin'));
  } catch { /* leave [] */ }

  try {
    const sub = await getPushSubscription();
    if (sub) {
      report.subscription = {
        present: true,
        currentKey: await isPushSubscriptionCurrent(),
        endpointPrefix: sub.endpoint.slice(0, 40),
      };
    }
  } catch { /* leave defaults */ }

  if (runSubscribe) {
    report.subscribeAttempt = await subscribeToPush();
  }
  return report;
}

function reportToText(r: DiagReport): string {
  return [
    `STELLA PUSH DIAGNOSTIC — ${r.timestamp}`,
    `device: ${r.userAgent}`,
    `display mode: ${r.displayMode}`,
    `support: sw=${r.support.sw} push=${r.support.push} notification=${r.support.notification}`,
    `permission: ${r.permission}`,
    `service worker: registered=${r.sw.registered} active=${r.sw.active} waiting=${r.sw.waiting}`,
    `sw script: ${r.sw.script || 'none'}`,
    `served sw version: ${r.servedSwVersion}`,
    `installed caches: ${r.installedCaches.join(', ') || 'none'}`,
    `vapid key: ${r.vapid.prefix}... (${r.vapid.length} chars)`,
    `subscription: present=${r.subscription.present} currentKey=${r.subscription.currentKey} endpoint=${r.subscription.endpointPrefix || 'n/a'}`,
    r.subscribeAttempt
      ? `SUBSCRIBE ATTEMPT: success=${r.subscribeAttempt.success} step=${r.subscribeAttempt.step || 'n/a'} error=${r.subscribeAttempt.error || 'none'}`
      : 'SUBSCRIBE ATTEMPT: not run',
  ].join('\n');
}

export function PushDiagnostics() {
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<DiagReport | null>(null);
  const [copied, setCopied] = useState(false);

  const run = async () => {
    setRunning(true);
    setCopied(false);
    try {
      setReport(await collectDiagnostics(true));
    } finally {
      setRunning(false);
    }
  };

  const copy = async () => {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(reportToText(report));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can be unavailable in some webviews — show the text for manual copy.
      window.prompt('Copy the diagnostic below:', reportToText(report));
    }
  };

  const ok = (v: boolean) => (v ? 'text-[#7ED321]' : 'text-red-400');
  const line = 'flex items-start justify-between gap-3 py-1.5 text-xs';

  return (
    <div className="bg-[#13182b] rounded-2xl border border-[#1e293b] p-6" data-testid="push-diagnostics">
      <div className="flex items-center gap-2 mb-4">
        <Stethoscope className="w-4 h-4 text-[#818cf8]" />
        <h3 className="text-sm font-bold text-[#94a3b8]">Push Diagnostics</h3>
      </div>
      <p className="text-[11px] text-[#475569] mb-3">
        Runs the full notification setup and reports exactly which step works or fails on this device.
        {!isPushSupported() && ' (Push is not supported in this browser — the report will show what is missing.)'}
      </p>

      <button
        onClick={run}
        disabled={running}
        data-testid="run-diagnostics"
        className="w-full h-10 rounded-xl bg-[#1e293b] hover:bg-[#334155] text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
      >
        {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Stethoscope className="w-3.5 h-3.5" />}
        Run Diagnostics
      </button>

      {report && (
        <div className="mt-4 space-y-0.5" data-testid="diagnostics-report">
          <div className={line}><span className="text-[#64748b]">Display mode</span><span className="text-[#cbd5e1] text-right">{report.displayMode}</span></div>
          <div className={line}><span className="text-[#64748b]">Browser support</span>
            <span className={ok(report.support.sw && report.support.push && report.support.notification)}>
              sw {report.support.sw ? '✓' : '✗'} · push {report.support.push ? '✓' : '✗'} · notif {report.support.notification ? '✓' : '✗'}
            </span>
          </div>
          <div className={line}><span className="text-[#64748b]">Permission</span><span className={ok(report.permission === 'granted')}>{report.permission}</span></div>
          <div className={line}><span className="text-[#64748b]">Service worker</span>
            <span className={ok(report.sw.registered && report.sw.active)}>
              {report.sw.registered ? `registered · ${report.sw.active ? 'active' : 'NOT active'}${report.sw.waiting ? ' · update waiting' : ''}` : 'NOT registered'}
            </span>
          </div>
          <div className={line}><span className="text-[#64748b]">Server SW version</span><span className="text-[#cbd5e1]">{report.servedSwVersion}</span></div>
          <div className={line}><span className="text-[#64748b]">Installed on device</span>
            <span className={ok(report.installedCaches.includes(report.servedSwVersion))}>
              {report.installedCaches.join(', ') || 'none'}
            </span>
          </div>
          <div className={line}><span className="text-[#64748b]">VAPID key</span><span className="text-[#cbd5e1]">{report.vapid.prefix}... ({report.vapid.length})</span></div>
          <div className={line}><span className="text-[#64748b]">Subscription</span>
            <span className={ok(report.subscription.present && report.subscription.currentKey)}>
              {report.subscription.present ? `present · key ${report.subscription.currentKey ? 'current' : 'STALE'}` : 'none'}
            </span>
          </div>
          {report.subscription.endpointPrefix && (
            <div className={line}><span className="text-[#64748b]">Endpoint</span><span className="text-[#cbd5e1] break-all text-right">{report.subscription.endpointPrefix}...</span></div>
          )}
          {report.subscribeAttempt && (
            <div className={`mt-2 p-3 rounded-xl border ${report.subscribeAttempt.success ? 'bg-[#1B7A40]/10 border-[#1B7A40]/20' : 'bg-red-500/10 border-red-500/20'}`}>
              <p className={`text-xs font-bold ${report.subscribeAttempt.success ? 'text-[#7ED321]' : 'text-red-300'}`} data-testid="subscribe-attempt">
                Subscribe attempt: {report.subscribeAttempt.success ? 'SUCCESS' : `FAILED at step "${report.subscribeAttempt.step}"`}
              </p>
              {report.subscribeAttempt.error && <p className="text-[11px] text-red-300/80 mt-1 break-all">{report.subscribeAttempt.error}</p>}
            </div>
          )}
          <button
            onClick={copy}
            className="mt-3 w-full h-9 rounded-xl bg-[#6366f1]/10 border border-[#6366f1]/20 text-[#818cf8] text-xs font-bold flex items-center justify-center gap-2 hover:bg-[#6366f1]/20 transition-colors"
          >
            {copied ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy full report</>}
          </button>
        </div>
      )}
    </div>
  );
}
