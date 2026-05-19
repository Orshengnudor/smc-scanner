import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import CandleChart, { type OverlayToggles, type DrawnLine, type Theme } from '../components/CandleChart';
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
  HTF_TIMEFRAMES,
  LTF_TIMEFRAMES,
  DEFAULT_SYMBOL,
  DEFAULT_HTF,
  DEFAULT_LTF,
} from '../lib/constants';

const DERIV_TOKEN = import.meta.env.VITE_DERIV_TOKEN || '';

const DEFAULT_SETTINGS: ScannerSettings = {
  fvgMinSize: 0,
  sweepBuffer: 0,
  setupExpiryCandles: 30,
};

type HTFMode = 'full' | 'single';
const LINE_COLORS = ['#f5c518', '#ff9900', '#00bfff', '#00e676', '#ff5252', '#ffffff'];

// ── Themes ────────────────────────────────────────────────────────────────────
const DARK_THEME: Theme = {
  bg:      '#000000',
  surface: '#0d0d0d',
  border:  '#1e1e1e',
  text:    '#ffffff',
  label:   '#555555',
  bull:    '#00ff88',
  bear:    '#ff3b3b',
  neutral: '#666666',
  sweep:   '#ff9900',
  mss:     '#f5c518',
  crt:     '#4488ff',
  grid:    '#111111',
};

const LIGHT_THEME: Theme = {
  bg:      '#f5f0e8',
  surface: '#ede8df',
  border:  '#ccc5b5',
  text:    '#1a1a1a',
  label:   '#857e70',
  bull:    '#1a7a4a',
  bear:    '#c0392b',
  neutral: '#7a7060',
  sweep:   '#c05a00',
  mss:     '#8a6200',
  crt:     '#1a44bb',
  grid:    '#ddd8cc',
};

export default function Index() {
  const { connected } = useConnection(DERIV_TOKEN);
  const [dark, setDark] = useState(true);
  const T = dark ? DARK_THEME : LIGHT_THEME;

  const [symbol, setSymbol] = useState(DEFAULT_SYMBOL);
  const [htfGranularity, setHtfGranularity] = useState(DEFAULT_HTF);
  const [ltfGranularity, setLtfGranularity] = useState(DEFAULT_LTF);
  const [htfMode, setHtfMode] = useState<HTFMode>('full');
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [settings, setSettings] = useState<ScannerSettings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [alertLog, setAlertLog] = useState<AlertEntry[]>([]);
  const [scannerOpen, setScannerOpen] = useState(true);
  const [drawMode, setDrawMode] = useState(false);
  const [drawnLines, setDrawnLines] = useState<DrawnLine[]>([]);
  const [lineColorIdx, setLineColorIdx] = useState(0);

  const [overlays, setOverlays] = useState<OverlayToggles>({
    crtLevels: true,
    fvg: true,
    sweep: true,
    mss: true,
    grid: true,
    crossLines: true,
  });

  const { candles: htfCandles, loading: htfLoading } = useDerivCandles(symbol, htfGranularity);
  const { candles: ltfCandles, loading: ltfLoading } = useDerivCandles(symbol, ltfGranularity);

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

  // HTF display — single = last closed candle
  const htfDisplayCandles = useMemo(() => {
    if (htfMode === 'single') {
      if (htfCandles.length >= 2) return htfCandles.slice(-2, -1);
      return htfCandles.slice(-1);
    }
    return htfCandles;
  }, [htfCandles, htfMode]);

  // LTF display — single = only candles that fit inside 1 HTF candle
  const ltfCandlesPerHTF = Math.max(1, Math.round(htfGranularity / ltfGranularity));
  const ltfDisplayCandles = useMemo(() => {
    if (htfMode === 'single') return ltfCandles.slice(-ltfCandlesPerHTF);
    return ltfCandles;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ltfCandles, htfMode, ltfCandlesPerHTF]);

  // Setup validation
  const setupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (htfCandles.length < 5 || ltfCandles.length < 5) return;
    if (setupTimerRef.current) clearTimeout(setupTimerRef.current);
    setupTimerRef.current = setTimeout(() => {
      setSetupStatus(validateSetup(htfCandles, ltfCandles, settings));
    }, 200);
    return () => { if (setupTimerRef.current) clearTimeout(setupTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [htfLen, ltfLen, settings]);

  const toggleOverlay = (key: keyof OverlayToggles) =>
    setOverlays(prev => ({ ...prev, [key]: !prev[key] }));

  const handleNewAlert = useCallback((alert: AlertEntry) => {
    setAlertLog(prev => [alert, ...prev].slice(0, 50));
  }, []);

  const handleLinesChange = useCallback((lines: DrawnLine[]) => {
    setDrawnLines(lines);
  }, []);

  const clearLines = () => setDrawnLines([]);

  const htfLabel = HTF_TIMEFRAMES.find(t => t.value === htfGranularity)?.label ?? '';
  const ltfLabel = LTF_TIMEFRAMES.find(t => t.value === ltfGranularity)?.label ?? '';
  const lineColor = LINE_COLORS[lineColorIdx % LINE_COLORS.length];

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100vh', width: '100vw',
      background: T.bg, color: T.text,
      fontFamily: "'JetBrains Mono', 'Courier New', monospace",
      overflow: 'hidden',
    }}>
      {/* ── Header ──────────────────────────────────────────────── */}
      <div style={{
        height: 40, borderBottom: `1px solid ${T.border}`,
        display: 'flex', alignItems: 'center',
        padding: '0 10px', gap: 8, flexShrink: 0,
        background: T.surface, zIndex: 600,
      }}>
        <span style={{ color: T.bull, fontSize: 11, fontWeight: 700, letterSpacing: 2, marginRight: 4 }}>SMC▸</span>
        <Divider T={T} />

        <Select T={T} value={symbol} onChange={setSymbol}
          options={SYMBOLS.map(s => ({ value: s.value, label: s.label }))} width={170} />
        <Divider T={T} />

        <Label T={T}>HTF</Label>
        <Select T={T} value={htfGranularity} onChange={v => setHtfGranularity(Number(v))}
          options={HTF_TIMEFRAMES.map(t => ({ value: t.value, label: t.label }))} width={62} />

        <Label T={T}>LTF</Label>
        <Select T={T} value={ltfGranularity} onChange={v => setLtfGranularity(Number(v))}
          options={LTF_TIMEFRAMES.map(t => ({ value: t.value, label: t.label }))} width={62} />
        <Divider T={T} />

        <ToggleBtn T={T} label="SINGLE" active={htfMode === 'single'}
          onClick={() => setHtfMode(m => m === 'single' ? 'full' : 'single')} />
        <Divider T={T} />

        <Label T={T}>SHOW</Label>
        <ToggleBtn T={T} label="CRT"   active={overlays.crtLevels} color={T.crt}   onClick={() => toggleOverlay('crtLevels')} />
        <ToggleBtn T={T} label="FVG"   active={overlays.fvg}       color={T.bull}  onClick={() => toggleOverlay('fvg')} />
        <ToggleBtn T={T} label="SWEEP" active={overlays.sweep}     color={T.sweep} onClick={() => toggleOverlay('sweep')} />
        <ToggleBtn T={T} label="MSS"   active={overlays.mss}       color={T.mss}   onClick={() => toggleOverlay('mss')} />
        <ToggleBtn T={T} label="GRID"  active={overlays.grid}                      onClick={() => toggleOverlay('grid')} />
        <Divider T={T} />

        {/* Draw tools */}
        <ToggleBtn T={T} label={drawMode ? '✎ ON' : '✎'} active={drawMode} color={lineColor}
          onClick={() => setDrawMode(d => !d)} />
        {drawMode && (
          <>
            <div title="Cycle color" onClick={() => setLineColorIdx(i => (i + 1) % LINE_COLORS.length)}
              style={{ width: 13, height: 13, borderRadius: 2, background: lineColor,
                cursor: 'pointer', border: `1px solid ${T.border}`, flexShrink: 0 }} />
            {drawnLines.length > 0 &&
              <ToggleBtn T={T} label="CLR" active={false} color={T.bear} onClick={clearLines} />}
          </>
        )}
        <Divider T={T} />

        <ToggleBtn T={T} label="⚙" active={showSettings} onClick={() => setShowSettings(s => !s)} />

        <div style={{ flex: 1 }} />

        {/* Dark/Light toggle */}
        <ToggleBtn T={T} label={dark ? '☀' : '◑'} active={false}
          onClick={() => setDark(d => !d)} />
        <Divider T={T} />

        {/* Scanner toggle */}
        <ToggleBtn T={T} label={scannerOpen ? '▶ SCAN' : '◀ SCAN'} active={scannerOpen}
          color={T.mss} onClick={() => setScannerOpen(o => !o)} />
        <Divider T={T} />

        {/* Connection dot */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: connected ? T.bull : T.bear, display: 'inline-block',
            boxShadow: connected ? `0 0 5px ${T.bull}` : undefined,
          }} />
          <span style={{ color: connected ? T.bull : T.bear, fontSize: 10, letterSpacing: 1 }}>
            {connected ? 'LIVE' : 'DISCONNECTED'}
          </span>
        </div>
      </div>

      {showSettings && (
        <SettingsPanel settings={settings} onChange={setSettings} onClose={() => setShowSettings(false)} />
      )}

      {/* ── Main ────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

        {/* Charts — side by side, equal width */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'row', minWidth: 0, overflow: 'hidden' }}>

          {/* HTF */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, borderRight: `1px solid ${T.border}` }}>
            <PanelHeader T={T}
              title={htfLabel}
              subtitle={htfMode === 'single' ? 'LAST CLOSED' : 'HTF'}
              loading={htfLoading}
            />
            <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
              {htfLoading && <LoadingOverlay T={T} />}
              <ChartSizer>
                {(h) => (
                  <CandleChart
                    candles={htfDisplayCandles}
                    fvgs={htfFVGs}
                    sweeps={htfSweeps}
                    mssEvents={htfMSS.slice(-3)}
                    crtLevel={crtLevel}
                    overlays={overlays}
                    theme={T}
                    height={h}
                    drawnLines={drawnLines}
                    onLinesChange={handleLinesChange}
                    drawMode={drawMode}
                    drawColor={lineColor}
                  />
                )}
              </ChartSizer>
            </div>
          </div>

          {/* LTF */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <PanelHeader T={T}
              title={ltfLabel}
              subtitle="LTF"
              loading={ltfLoading}
            />
            <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
              {ltfLoading && <LoadingOverlay T={T} />}
              <ChartSizer>
                {(h) => (
                  <CandleChart
                    candles={ltfDisplayCandles}
                    fvgs={ltfFVGs}
                    sweeps={ltfSweeps}
                    mssEvents={ltfMSS.slice(-3)}
                    crtLevel={crtLevel}
                    overlays={overlays}
                    theme={T}
                    height={h}
                    drawnLines={drawnLines}
                    onLinesChange={handleLinesChange}
                    drawMode={drawMode}
                    drawColor={lineColor}
                  />
                )}
              </ChartSizer>
            </div>
          </div>
        </div>

        {/* Scanner sidebar */}
        {scannerOpen && (
          <div style={{
            width: 196, borderLeft: `1px solid ${T.border}`,
            flexShrink: 0, display: 'flex', flexDirection: 'column',
            background: T.surface, overflow: 'hidden',
          }}>
            <SetupPanel
              status={setupStatus}
              loading={ltfLoading || htfLoading}
              alertLog={alertLog}
            />
          </div>
        )}
      </div>

      {/* ── Status bar ─────────────────────────────────────────── */}
      <div style={{
        height: 28, background: T.surface, borderTop: `1px solid ${T.border}`,
        display: 'flex', alignItems: 'center', padding: '0 10px',
        gap: 14, flexShrink: 0, fontSize: 10, letterSpacing: 0.5,
      }}>
        {setupStatus ? (
          <>
            <StatusItem T={T} label="BIAS" value={setupStatus.bias.toUpperCase()} color={
              setupStatus.bias === 'bullish' ? T.bull :
              setupStatus.bias === 'bearish' ? T.bear : T.label
            } />
            <StatusItem T={T} label="SWEEP"
              value={setupStatus.sweepDetected ? (setupStatus.sweepType === 'buy_side' ? 'BSL' : 'SSL') : '—'}
              color={setupStatus.sweepDetected ? T.sweep : T.label} />
            <StatusItem T={T} label="MSS"
              value={setupStatus.mssConfirmed ? (setupStatus.mssKind ?? '✓') : '—'}
              color={setupStatus.mssConfirmed ? T.mss : T.label} />
            <StatusItem T={T} label="FVG"
              value={setupStatus.fvgPresent ? 'ACTIVE' : '—'}
              color={setupStatus.fvgPresent ? T.bull : T.label} />
            <div style={{ width: 1, height: 14, background: T.border }} />
            <StatusItem T={T} label="SETUP" bold
              value={setupStatus.activeSetup
                ? `${setupStatus.activeSetup.toUpperCase()} (${setupStatus.conditionsMet}/4)`
                : `NONE (${setupStatus.conditionsMet}/4)`}
              color={setupStatus.activeSetup === 'buy' ? T.bull :
                     setupStatus.activeSetup === 'sell' ? T.bear : T.label} />
            {setupStatus.tradeZones && (
              <>
                <div style={{ width: 1, height: 14, background: T.border }} />
                <StatusItem T={T} label="SL"  value={fmt(setupStatus.tradeZones.stopLoss)} color={T.bear} />
                <StatusItem T={T} label="TP1" value={`${fmt(setupStatus.tradeZones.tp1)} (${setupStatus.tradeZones.rr1}R)`} color={T.bull} />
              </>
            )}
          </>
        ) : (
          <span style={{ color: T.label }}>AWAITING DATA...</span>
        )}
        {drawMode && (
          <span style={{ marginLeft: 'auto', color: lineColor, fontSize: 10 }}>✎ DRAG TO DRAW · DRAG LINE TO MOVE</span>
        )}
      </div>

      <AlertBanner status={setupStatus} onNewAlert={handleNewAlert} />
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(p: number) {
  if (p > 1000) return p.toFixed(2);
  if (p > 10)   return p.toFixed(3);
  return p.toFixed(4);
}

// ── Sub-components (all theme-aware) ─────────────────────────────────────────

function Select({ T, value, onChange, options, width }: {
  T: Theme; value: string | number;
  onChange: (v: string) => void;
  options: { value: string | number; label: string }[];
  width?: number;
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{
      background: T.surface, border: `1px solid ${T.border}`,
      color: T.text, fontFamily: "'JetBrains Mono', monospace",
      fontSize: 10, padding: '2px 5px', width, cursor: 'pointer', outline: 'none',
    }}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function ToggleBtn({ T, label, active, onClick, color }: {
  T: Theme; label: string; active: boolean; onClick: () => void; color?: string;
}) {
  const c = color || T.neutral;
  return (
    <button onClick={onClick} style={{
      background: active ? `${c}22` : 'transparent',
      border: `1px solid ${active ? c : T.border}`,
      color: active ? c : T.label,
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 10, padding: '2px 6px',
      cursor: 'pointer', letterSpacing: 0.5, whiteSpace: 'nowrap',
    }}>
      {label}
    </button>
  );
}

function Label({ T, children }: { T: Theme; children: React.ReactNode }) {
  return <span style={{ color: T.label, fontSize: 10, flexShrink: 0 }}>{children}</span>;
}

function Divider({ T }: { T: Theme }) {
  return <div style={{ width: 1, height: 16, background: T.border, flexShrink: 0 }} />;
}

function PanelHeader({ T, title, subtitle, loading }: {
  T: Theme; title: string; subtitle: string; loading: boolean;
}) {
  return (
    <div style={{
      height: 28, borderBottom: `1px solid ${T.border}`,
      display: 'flex', alignItems: 'center',
      padding: '0 10px', gap: 8, flexShrink: 0, background: T.surface,
    }}>
      <span style={{ color: T.text, fontSize: 11, fontWeight: 600 }}>{title}</span>
      <span style={{ color: T.label, fontSize: 10 }}>{subtitle}</span>
      {loading && <span style={{ color: T.neutral, fontSize: 10, marginLeft: 'auto' }}>LOADING...</span>}
    </div>
  );
}

function StatusItem({ T, label, value, color, bold }: {
  T: Theme; label: string; value: string; color: string; bold?: boolean;
}) {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      <span style={{ color: T.label }}>{label}</span>
      <span style={{ color, fontWeight: bold ? 700 : 400 }}>{value}</span>
    </div>
  );
}

function LoadingOverlay({ T }: { T: Theme }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, background: T.bg + 'cc',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 10, fontFamily: "'JetBrains Mono', monospace",
      fontSize: 11, color: T.neutral, letterSpacing: 2,
    }}>
      LOADING...
    </div>
  );
}

function ChartSizer({ children }: { children: (height: number) => React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(300);

  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) setHeight(entry.contentRect.height);
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
