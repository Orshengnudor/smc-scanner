import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import CandleChart, { type OverlayToggles } from '../components/CandleChart';
import SetupPanel, { type AlertEntry } from '../components/SetupPanel';
import AlertBanner from '../components/AlertBanner';
import SettingsPanel from '../components/SettingsPanel';
import { useDerivCandles } from '../hooks/useDerivCandles';
import { useConnection } from '../hooks/useConnection';
import {
  detectFVGs,
  updateFVGMitigation,
  detectLiquiditySweeps,
  detectMSS,
  getLastClosedCRTLevel,
  validateSetup,
  type SetupStatus,
  type ScannerSettings,
} from '../lib/smcEngine';
import {
  SYMBOLS,
  TIMEFRAMES,
  HTF_TIMEFRAMES,
  LTF_TIMEFRAMES,
  DEFAULT_SYMBOL,
  DEFAULT_HTF,
  DEFAULT_LTF,
  COLORS,
} from '../lib/constants';

const DERIV_TOKEN = import.meta.env.VITE_DERIV_TOKEN || '';

const DEFAULT_SETTINGS: ScannerSettings = {
  fvgMinSize: 0,
  sweepBuffer: 0,
  setupExpiryCandles: 30,
};

type HTFMode = 'full' | 'single';

export default function Index() {
  const { connected, authenticated } = useConnection(DERIV_TOKEN);

  const [symbol, setSymbol] = useState(DEFAULT_SYMBOL);
  const [htfGranularity, setHtfGranularity] = useState(DEFAULT_HTF);
  const [ltfGranularity, setLtfGranularity] = useState(DEFAULT_LTF);
  const [htfMode, setHtfMode] = useState<HTFMode>('full');
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [settings, setSettings] = useState<ScannerSettings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [alertLog, setAlertLog] = useState<AlertEntry[]>([]);
  const [overlays, setOverlays] = useState<OverlayToggles>({
    crtLevels: true,
    fvg: true,
    sweep: true,
    mss: true,
  });

  const { candles: htfCandles, loading: htfLoading } = useDerivCandles(symbol, htfGranularity);
  const { candles: ltfCandles, loading: ltfLoading } = useDerivCandles(symbol, ltfGranularity);

  // SMC computations — throttled by candle close (only re-run when candle array length changes)
  const htfLen = htfCandles.length;
  const ltfLen = ltfCandles.length;

  const ltfFVGs = useMemo(() => {
    const raw = detectFVGs(ltfCandles, settings);
    return updateFVGMitigation(raw, ltfCandles);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ltfLen, settings]);

  const ltfSweeps = useMemo(
    () => detectLiquiditySweeps(ltfCandles, 3, settings),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ltfLen, settings]
  );

  const ltfMSS = useMemo(
    () => detectMSS(ltfCandles, 3),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ltfLen]
  );

  const htfFVGs = useMemo(
    () => updateFVGMitigation(detectFVGs(htfCandles, settings), htfCandles),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [htfLen, settings]
  );

  const htfSweeps = useMemo(
    () => detectLiquiditySweeps(htfCandles, 3, settings),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [htfLen, settings]
  );

  const htfMSS = useMemo(
    () => detectMSS(htfCandles, 3),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [htfLen]
  );

  const crtLevel = useMemo(
    () => getLastClosedCRTLevel(htfCandles),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [htfLen]
  );

  // HTF single-candle display
  const htfDisplayCandles = useMemo(() => {
    if (htfMode === 'single') return htfCandles.slice(-3);
    return htfCandles;
  }, [htfCandles, htfMode]);

  // Validate setup on candle close (not every tick)
  const setupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (htfCandles.length < 5 || ltfCandles.length < 5) return;
    if (setupTimerRef.current) clearTimeout(setupTimerRef.current);
    setupTimerRef.current = setTimeout(() => {
      const status = validateSetup(htfCandles, ltfCandles, settings);
      setSetupStatus(status);
    }, 200);
    return () => { if (setupTimerRef.current) clearTimeout(setupTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [htfLen, ltfLen, settings]);

  const toggleOverlay = (key: keyof OverlayToggles) => {
    setOverlays(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleNewAlert = useCallback((alert: AlertEntry) => {
    setAlertLog(prev => [alert, ...prev].slice(0, 50)); // keep last 50
  }, []);

  const connStatus = !connected ? 'DISCONNECTED' : !authenticated ? 'CONNECTED' : 'LIVE';
  const connColor = !connected ? COLORS.bear : !authenticated ? COLORS.sweep : COLORS.bull;

  const symbolLabel = SYMBOLS.find(s => s.value === symbol)?.label ?? symbol;
  const htfLabel = TIMEFRAMES.find(t => t.value === htfGranularity)?.label ?? '';
  const ltfLabel = TIMEFRAMES.find(t => t.value === ltfGranularity)?.label ?? '';

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      width: '100vw',
      background: COLORS.bg,
      color: COLORS.white,
      fontFamily: "'JetBrains Mono', 'Courier New', monospace",
      overflow: 'hidden',
    }}>
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div style={{
        height: 44,
        borderBottom: `1px solid ${COLORS.border}`,
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px',
        gap: 12,
        flexShrink: 0,
        background: '#050505',
        position: 'relative',
        zIndex: 600,
      }}>
        {/* Logo */}
        <span style={{ color: COLORS.bull, fontSize: 12, fontWeight: 700, letterSpacing: 2, marginRight: 8 }}>
          SMC▸
        </span>

        {/* Symbol */}
        <Select
          value={symbol}
          onChange={setSymbol}
          options={SYMBOLS.map(s => ({ value: s.value, label: s.label }))}
          width={200}
        />

        <Divider />

        {/* HTF */}
        <span style={{ color: COLORS.label, fontSize: 10 }}>HTF</span>
        <Select
          value={htfGranularity}
          onChange={v => setHtfGranularity(Number(v))}
          options={HTF_TIMEFRAMES.map(t => ({ value: t.value, label: t.label }))}
          width={72}
        />

        {/* LTF */}
        <span style={{ color: COLORS.label, fontSize: 10 }}>LTF</span>
        <Select
          value={ltfGranularity}
          onChange={v => setLtfGranularity(Number(v))}
          options={LTF_TIMEFRAMES.map(t => ({ value: t.value, label: t.label }))}
          width={72}
        />

        <Divider />

        {/* HTF Mode toggle */}
        <ToggleBtn
          label="SINGLE"
          active={htfMode === 'single'}
          onClick={() => setHtfMode(m => m === 'single' ? 'full' : 'single')}
        />

        <Divider />

        {/* Overlay toggles */}
        <span style={{ color: COLORS.label, fontSize: 10 }}>SHOW</span>
        <ToggleBtn label="CRT" active={overlays.crtLevels} color={COLORS.crt} onClick={() => toggleOverlay('crtLevels')} />
        <ToggleBtn label="FVG" active={overlays.fvg} color={COLORS.bull} onClick={() => toggleOverlay('fvg')} />
        <ToggleBtn label="SWEEP" active={overlays.sweep} color={COLORS.sweep} onClick={() => toggleOverlay('sweep')} />
        <ToggleBtn label="MSS" active={overlays.mss} color={COLORS.mss} onClick={() => toggleOverlay('mss')} />

        <Divider />

        {/* Settings toggle */}
        <ToggleBtn
          label="⚙ SET"
          active={showSettings}
          onClick={() => setShowSettings(s => !s)}
        />

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Connection status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%',
            background: connColor,
            display: 'inline-block',
            boxShadow: connected ? `0 0 6px ${connColor}` : undefined,
          }} />
          <span style={{ color: connColor, fontSize: 10, letterSpacing: 1 }}>{connStatus}</span>
        </div>
      </div>

      {/* Settings dropdown */}
      {showSettings && (
        <SettingsPanel
          settings={settings}
          onChange={setSettings}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* ── Main Content ────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

        {/* ── Left: HTF Panel ──────────────────────────────────────── */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          borderRight: `1px solid ${COLORS.border}`,
          minWidth: 0,
        }}>
          <PanelHeader
            title={`${symbolLabel} — ${htfLabel}`}
            subtitle={htfMode === 'single' ? 'LAST CLOSED CANDLE' : 'FULL CHART'}
            loading={htfLoading}
          />
          <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
            {htfLoading && <LoadingOverlay />}
            <ChartSizer>
              {(h) => (
                <CandleChart
                  candles={htfDisplayCandles}
                  fvgs={htfFVGs}
                  sweeps={htfSweeps}
                  mssEvents={htfMSS}
                  crtLevel={crtLevel}
                  overlays={overlays}
                  height={h}
                />
              )}
            </ChartSizer>
          </div>
        </div>

        {/* ── Right: LTF Panel + Setup Panel ───────────────────────── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

          {/* LTF Chart */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, borderBottom: `1px solid ${COLORS.border}` }}>
            <PanelHeader
              title={`${symbolLabel} — ${ltfLabel}`}
              subtitle="LTF WITH HTF LEVELS"
              loading={ltfLoading}
            />
            <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
              {/* Chart area */}
              <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
                {ltfLoading && <LoadingOverlay />}
                <ChartSizer>
                  {(h) => (
                    <CandleChart
                      candles={ltfCandles}
                      fvgs={ltfFVGs}
                      sweeps={ltfSweeps}
                      mssEvents={ltfMSS}
                      crtLevel={crtLevel}
                      overlays={overlays}
                      height={h}
                    />
                  )}
                </ChartSizer>
              </div>

              {/* Setup Panel sidebar */}
              <div style={{
                width: 190,
                borderLeft: `1px solid ${COLORS.border}`,
                flexShrink: 0,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}>
                <SetupPanel
                  status={setupStatus}
                  loading={ltfLoading || htfLoading}
                  alertLog={alertLog}
                />
              </div>
            </div>
          </div>

          {/* ── Bottom Status Bar ─────────────────────────────────── */}
          <div style={{
            height: 32,
            background: '#050505',
            borderTop: `1px solid ${COLORS.border}`,
            display: 'flex',
            alignItems: 'center',
            padding: '0 12px',
            gap: 16,
            flexShrink: 0,
            fontSize: 10,
            letterSpacing: 0.5,
          }}>
            {setupStatus ? (
              <>
                <StatusItem label="BIAS" value={setupStatus.bias.toUpperCase()} color={
                  setupStatus.bias === 'bullish' ? COLORS.bull :
                  setupStatus.bias === 'bearish' ? COLORS.bear : COLORS.label
                } />
                <StatusItem
                  label="SWEEP"
                  value={setupStatus.sweepDetected ? (setupStatus.sweepType === 'buy_side' ? 'BSL' : 'SSL') : '—'}
                  color={setupStatus.sweepDetected ? COLORS.sweep : COLORS.label}
                />
                <StatusItem
                  label="MSS"
                  value={setupStatus.mssConfirmed ? (setupStatus.mssKind ?? '✓') : '—'}
                  color={setupStatus.mssConfirmed ? COLORS.mss : COLORS.label}
                />
                <StatusItem
                  label="FVG"
                  value={setupStatus.fvgPresent ? 'ACTIVE' : '—'}
                  color={setupStatus.fvgPresent ? COLORS.bull : COLORS.label}
                />
                <div style={{ width: 1, height: 16, background: COLORS.border }} />
                <StatusItem
                  label="SETUP"
                  value={setupStatus.activeSetup
                    ? `${setupStatus.activeSetup.toUpperCase()} (${setupStatus.conditionsMet}/4)`
                    : `NONE (${setupStatus.conditionsMet}/4)`}
                  color={
                    setupStatus.activeSetup === 'buy' ? COLORS.bull :
                    setupStatus.activeSetup === 'sell' ? COLORS.bear : COLORS.label
                  }
                  bold
                />
                {setupStatus.tradeZones && (
                  <>
                    <div style={{ width: 1, height: 16, background: COLORS.border }} />
                    <StatusItem
                      label="SL"
                      value={formatPriceShort(setupStatus.tradeZones.stopLoss)}
                      color={COLORS.bear}
                    />
                    <StatusItem
                      label="TP1"
                      value={`${formatPriceShort(setupStatus.tradeZones.tp1)} (${setupStatus.tradeZones.rr1}R)`}
                      color={COLORS.bull}
                    />
                  </>
                )}
              </>
            ) : (
              <span style={{ color: COLORS.label }}>AWAITING DATA...</span>
            )}
          </div>
        </div>
      </div>

      <AlertBanner status={setupStatus} onNewAlert={handleNewAlert} />
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPriceShort(p: number) {
  if (p > 1000) return p.toFixed(2);
  if (p > 10) return p.toFixed(3);
  return p.toFixed(4);
}

// ── Utility sub-components ────────────────────────────────────────────────────

function Select({ value, onChange, options, width }: {
  value: string | number;
  onChange: (v: string) => void;
  options: { value: string | number; label: string }[];
  width?: number;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        background: '#0f0f0f',
        border: `1px solid ${COLORS.border}`,
        color: COLORS.white,
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
        padding: '3px 6px',
        width,
        cursor: 'pointer',
        outline: 'none',
      }}
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function ToggleBtn({ label, active, onClick, color }: {
  label: string;
  active: boolean;
  onClick: () => void;
  color?: string;
}) {
  const c = color || COLORS.neutral;
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? `${c}22` : 'transparent',
        border: `1px solid ${active ? c : COLORS.border}`,
        color: active ? c : COLORS.label,
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10,
        padding: '3px 7px',
        cursor: 'pointer',
        letterSpacing: 0.5,
        transition: 'all 0.15s',
      }}
    >
      {label}
    </button>
  );
}

function Divider() {
  return <div style={{ width: 1, height: 20, background: COLORS.border }} />;
}

function PanelHeader({ title, subtitle, loading }: { title: string; subtitle: string; loading: boolean }) {
  return (
    <div style={{
      height: 32,
      borderBottom: `1px solid ${COLORS.border}`,
      display: 'flex',
      alignItems: 'center',
      padding: '0 12px',
      gap: 10,
      flexShrink: 0,
      background: '#050505',
    }}>
      <span style={{ color: COLORS.white, fontSize: 11, fontWeight: 600 }}>{title}</span>
      <span style={{ color: COLORS.label, fontSize: 10 }}>{subtitle}</span>
      {loading && <span style={{ color: COLORS.neutral, fontSize: 10, marginLeft: 'auto' }}>LOADING...</span>}
    </div>
  );
}

function StatusItem({ label, value, color, bold }: { label: string; value: string; color: string; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
      <span style={{ color: COLORS.label }}>{label}</span>
      <span style={{ color, fontWeight: bold ? 700 : 400 }}>{value}</span>
    </div>
  );
}

function LoadingOverlay() {
  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10,
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 12,
      color: COLORS.neutral,
      letterSpacing: 2,
    }}>
      LOADING CANDLES...
    </div>
  );
}

function ChartSizer({ children }: { children: (height: number) => React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(400);

  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        setHeight(entry.contentRect.height);
      }
    });
    ro.observe(ref.current);
    setHeight(ref.current.clientHeight);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={ref} style={{ width: '100%', height: '100%' }}>
      {children(height)}
    </div>
  );
}
