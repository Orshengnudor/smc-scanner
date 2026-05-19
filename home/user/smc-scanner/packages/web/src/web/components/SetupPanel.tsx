import { useState } from 'react';
import type { EnhancedSetupStatus } from '../lib/smcEngine';
import { COLORS } from '../lib/constants';

export type AlertEntry = {
  id: string;
  message: string;
  type: 'sweep' | 'mss' | 'setup';
  time: number;
};

type Props = {
  status: EnhancedSetupStatus | null;
  loading: boolean;
  alertLog: AlertEntry[];
};

function StatusDot({ ok }: { ok: boolean }) {
  const color = ok ? COLORS.bull : COLORS.label;
  return (
    <span style={{
      display: 'inline-block',
      width: 7, height: 7,
      borderRadius: '50%',
      backgroundColor: color,
      marginRight: 6,
      flexShrink: 0,
    }} />
  );
}

function PriceTag({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      padding: '5px 10px',
      borderBottom: `1px solid ${COLORS.border}`,
    }}>
      <div>
        <span style={{ color: COLORS.label, fontSize: 9, letterSpacing: 1 }}>{label}</span>
        {sub && <span style={{ color: COLORS.label, fontSize: 8, marginLeft: 4 }}>{sub}</span>}
      </div>
      <span style={{ color, fontSize: 11, fontWeight: 700, letterSpacing: 0.5, fontFamily: 'JetBrains Mono, monospace' }}>
        {value}
      </span>
    </div>
  );
}

function formatPrice(p: number) {
  // Auto-detect decimal places from magnitude
  if (p > 1000) return p.toFixed(2);
  if (p > 10) return p.toFixed(3);
  return p.toFixed(4);
}

function formatTime(ts: number) {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function alertColor(type: AlertEntry['type']) {
  if (type === 'setup') return COLORS.bull;
  if (type === 'sweep') return COLORS.sweep;
  return COLORS.mss;
}

// ── Tab: Scanner ─────────────────────────────────────────────────────────────
function ScannerTab({ status }: { status: EnhancedSetupStatus | null }) {
  if (!status) return (
    <div style={{ padding: '12px 10px', color: COLORS.label, fontSize: 11 }}>AWAITING DATA...</div>
  );

  const biasColor = status.bias === 'bullish' ? COLORS.bull : status.bias === 'bearish' ? COLORS.bear : COLORS.label;
  const setupColor = status.activeSetup === 'buy' ? COLORS.bull : status.activeSetup === 'sell' ? COLORS.bear : COLORS.label;

  const conditions = [
    { label: 'HTF BIAS', met: status.bias !== 'neutral', value: status.bias.toUpperCase(), valueColor: biasColor },
    {
      label: 'LIQ SWEEP', met: status.sweepDetected,
      value: status.sweepType ? (status.sweepType === 'buy_side' ? 'BSL SWEPT' : 'SSL SWEPT') : 'NONE',
      valueColor: status.sweepDetected ? COLORS.sweep : COLORS.label,
    },
    {
      label: 'MSS / BOS', met: status.mssConfirmed,
      value: status.mssConfirmed && status.mssKind ? status.mssKind : 'NONE',
      valueColor: status.mssConfirmed ? COLORS.mss : COLORS.label,
    },
    {
      label: 'FVG', met: status.fvgPresent,
      value: status.fvgPresent ? 'ACTIVE' : 'NONE',
      valueColor: status.fvgPresent ? COLORS.bull : COLORS.label,
    },
  ];

  const tz = status.tradeZones;

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Active Setup */}
      <div style={{ padding: '10px 10px', borderBottom: `1px solid ${COLORS.border}` }}>
        <div style={{ color: COLORS.label, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>ACTIVE SETUP</div>
        <div style={{ color: setupColor, fontSize: 15, fontWeight: 700, letterSpacing: 1 }}>
          {status.activeSetup ? `${status.activeSetup.toUpperCase()} SETUP` : 'NONE'}
        </div>
        <div style={{ color: COLORS.label, fontSize: 9, marginTop: 3 }}>
          {status.conditionsMet}/4 CONDITIONS
        </div>
        <div style={{ height: 3, background: COLORS.border, borderRadius: 2, marginTop: 5 }}>
          <div style={{
            height: '100%',
            width: `${(status.conditionsMet / 4) * 100}%`,
            background: setupColor,
            borderRadius: 2,
            transition: 'width 0.3s ease',
          }} />
        </div>
      </div>

      {/* Conditions checklist */}
      <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 7, borderBottom: `1px solid ${COLORS.border}` }}>
        {conditions.map(cond => (
          <div key={cond.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <StatusDot ok={cond.met} />
              <span style={{ color: COLORS.neutral, fontSize: 10, letterSpacing: 0.5 }}>{cond.label}</span>
            </div>
            <span style={{ color: cond.valueColor, fontSize: 10, fontWeight: 600 }}>{cond.value}</span>
          </div>
        ))}
      </div>

      {/* RSI Confluence Row */}
      {status.rsi && (
        <div style={{
          padding: '6px 10px', borderBottom: `1px solid ${COLORS.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ color: COLORS.label, fontSize: 9, letterSpacing: 1 }}>RSI ({status.rsi.period})</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{
              color: status.rsi.value > 70 ? COLORS.bear : status.rsi.value < 30 ? COLORS.bull : COLORS.neutral,
              fontSize: 11, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace',
            }}>
              {status.rsi.value.toFixed(1)}
            </span>
            <span style={{
              fontSize: 9, fontWeight: 600, letterSpacing: 0.5,
              color: status.rsi.momentum === 'bullish' ? COLORS.bull
                   : status.rsi.momentum === 'bearish' ? COLORS.bear
                   : COLORS.label,
            }}>
              {status.rsi.momentum.toUpperCase()}
              {status.rsi.value > 70 ? ' OB' : status.rsi.value < 30 ? ' OS' : ''}
            </span>
          </div>
        </div>
      )}

      {/* Trade Zones — only shown when active setup */}
      {tz ? (
        <div>
          <div style={{ padding: '6px 10px', color: COLORS.neutral, fontSize: 9, letterSpacing: 1, borderBottom: `1px solid ${COLORS.border}` }}>
            TRADE ZONES
          </div>
          {/* Entry zone */}
          <div style={{ padding: '5px 10px', borderBottom: `1px solid ${COLORS.border}` }}>
            <div style={{ color: COLORS.label, fontSize: 9, letterSpacing: 1, marginBottom: 3 }}>ENTRY (FVG)</div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: COLORS.label, fontSize: 9 }}>HIGH</span>
              <span style={{ color: setupColor, fontSize: 10, fontWeight: 600 }}>{formatPrice(tz.entryHigh)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: COLORS.label, fontSize: 9 }}>LOW</span>
              <span style={{ color: setupColor, fontSize: 10, fontWeight: 600 }}>{formatPrice(tz.entryLow)}</span>
            </div>
          </div>
          <PriceTag label="STOP LOSS" value={formatPrice(tz.stopLoss)} color={COLORS.bear} sub="INVALIDATION" />
          {status.nearestLiquidityTP ? (
            <PriceTag label="TP1 (LIQ)" value={formatPrice(status.nearestLiquidityTP)} color={COLORS.bull} sub="EQH/OldHL" />
          ) : (
            <PriceTag label="TP1" value={formatPrice(tz.tp1)} color={COLORS.bull} sub={`${tz.rr1}R`} />
          )}
          <PriceTag label="TP2" value={formatPrice(tz.tp2)} color={COLORS.bull} sub={`${tz.rr2}R`} />
        </div>
      ) : status.activeSetup ? (
        <div style={{ padding: '8px 10px', color: COLORS.label, fontSize: 9 }}>
          NO FVG IN ZONE — WAIT
        </div>
      ) : null}
    </div>
  );
}

// ── Tab: Alert Log ────────────────────────────────────────────────────────────
function AlertLogTab({ alerts }: { alerts: AlertEntry[] }) {
  if (alerts.length === 0) {
    return (
      <div style={{ padding: '12px 10px', color: COLORS.label, fontSize: 10, textAlign: 'center', marginTop: 20 }}>
        NO ALERTS YET
      </div>
    );
  }

  return (
    <div style={{ overflowY: 'auto', flex: 1 }}>
      {alerts.map(alert => (
        <div key={alert.id} style={{
          padding: '7px 10px',
          borderBottom: `1px solid ${COLORS.border}`,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}>
          <span style={{ color: alertColor(alert.type), fontSize: 10, fontWeight: 600, letterSpacing: 0.3 }}>
            {alert.message}
          </span>
          <span style={{ color: COLORS.label, fontSize: 9 }}>
            {formatTime(alert.time)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function SetupPanel({ status, loading, alertLog }: Props) {
  const [activeTab, setActiveTab] = useState<'scanner' | 'alerts'>('scanner');

  const tabStyle = (tab: 'scanner' | 'alerts') => ({
    flex: 1,
    padding: '6px 4px',
    background: 'transparent',
    border: 'none',
    borderBottom: `2px solid ${activeTab === tab ? COLORS.bull : 'transparent'}`,
    color: activeTab === tab ? COLORS.white : COLORS.label,
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 9,
    letterSpacing: 1,
    cursor: 'pointer',
    transition: 'all 0.15s',
  });

  if (loading && !status) {
    return (
      <div style={{ padding: '12px 10px', color: COLORS.label, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}>
        LOADING...
      </div>
    );
  }

  const unread = alertLog.length;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      fontFamily: "'JetBrains Mono', 'Courier New', monospace",
      fontSize: 11,
    }}>
      {/* Tab bar */}
      <div style={{
        display: 'flex',
        borderBottom: `1px solid ${COLORS.border}`,
        flexShrink: 0,
        background: '#050505',
      }}>
        <button style={tabStyle('scanner')} onClick={() => setActiveTab('scanner')}>
          SCANNER
        </button>
        <button style={tabStyle('alerts')} onClick={() => setActiveTab('alerts')}>
          ALERTS{unread > 0 ? ` (${unread})` : ''}
        </button>
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {activeTab === 'scanner'
          ? <ScannerTab status={status} />
          : <AlertLogTab alerts={alertLog} />
        }
      </div>
    </div>
  );
}
