import { useEffect, useRef, useState } from 'react';
import type { SetupStatus } from '../lib/smcEngine';
import { COLORS } from '../lib/constants';
import type { AlertEntry } from './SetupPanel';

type Props = {
  status: SetupStatus | null;
  onNewAlert: (alert: AlertEntry) => void;
};

type BannerAlert = AlertEntry & { visible: boolean };

function alertColor(type: AlertEntry['type']) {
  if (type === 'setup') return COLORS.bull;
  if (type === 'sweep') return COLORS.sweep;
  if (type === 'liq_stack') return 'rgba(255,180,0,1)';
  return COLORS.mss;
}

export default function AlertBanner({ status, onNewAlert }: Props) {
  const [banners, setBanners] = useState<BannerAlert[]>([]);
  const prevStatusRef = useRef<SetupStatus | null>(null);

  useEffect(() => {
    if (!status) return;
    const prev = prevStatusRef.current;
    const newAlerts: AlertEntry[] = [];

    // Sweep detected
    if (status.sweepDetected && !prev?.sweepDetected) {
      newAlerts.push({
        id: `sweep-${Date.now()}`,
        message: `LIQUIDITY SWEEP — ${status.sweepType === 'buy_side' ? 'BUY SIDE (HIGHS)' : 'SELL SIDE (LOWS)'}`,
        type: 'sweep',
        time: Date.now(),
      });
      try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.3);
      } catch {}
    }

    // MSS confirmed
    if (status.mssConfirmed && !prev?.mssConfirmed) {
      newAlerts.push({
        id: `mss-${Date.now()}`,
        message: `MSS CONFIRMED — ${status.mssKind}`,
        type: 'mss',
        time: Date.now(),
      });
    }

    // Full setup ready
    if (status.activeSetup && !prev?.activeSetup) {
      newAlerts.push({
        id: `setup-${Date.now()}`,
        message: `SETUP READY — ${status.activeSetup.toUpperCase()} ${status.conditionsMet}/4`,
        type: 'setup',
        time: Date.now(),
      });
      try {
        const ctx = new AudioContext();
        [0, 0.2].forEach(delay => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain); gain.connect(ctx.destination);
          osc.frequency.value = 1200;
          gain.gain.setValueAtTime(0.12, ctx.currentTime + delay);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.15);
          osc.start(ctx.currentTime + delay); osc.stop(ctx.currentTime + delay + 0.15);
        });
      } catch {}
    }

    if (newAlerts.length > 0) {
      // Push to persistent log
      newAlerts.forEach(a => onNewAlert(a));
      // Show banners
      setBanners(prev => [
        ...newAlerts.map(a => ({ ...a, visible: true })),
        ...prev,
      ].slice(0, 5));
    }

    prevStatusRef.current = status;
  }, [status, onNewAlert]);

  // Auto-dismiss banners after 8s
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setBanners(prev => prev.filter(a => now - a.time < 8000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  if (banners.length === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 50,
      right: 16,
      zIndex: 1000,
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      maxWidth: 300,
    }}>
      {banners.map(alert => (
        <div
          key={alert.id}
          onClick={() => setBanners(prev => prev.filter(a => a.id !== alert.id))}
          style={{
            background: '#0f0f0f',
            border: `1px solid ${alertColor(alert.type)}`,
            color: alertColor(alert.type),
            padding: '8px 12px',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11,
            cursor: 'pointer',
            letterSpacing: 0.5,
            boxShadow: `0 0 12px ${alertColor(alert.type)}33`,
          }}
        >
          {alert.message}
        </div>
      ))}
    </div>
  );
}
