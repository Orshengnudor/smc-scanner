import { useState, useMemo, useEffect, useRef, useCallback } from 'react';

// ── Auth gate ──────────────────────────────────────────────────────────────
const AUTH_URL = 'https://smc-auth.vercel.app';
const TOKEN_KEY = 'smc_auth_token';

function AuthGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'ok' | 'locked'>('loading');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) { setStatus('locked'); return; }
    fetch(`${AUTH_URL}/api/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(r => r.json())
      .then((d: { valid: boolean }) => {
        if (d.valid) setStatus('ok');
        else { localStorage.removeItem(TOKEN_KEY); setStatus('locked'); }
      })
      .catch(() => { localStorage.removeItem(TOKEN_KEY); setStatus('locked'); });
  }, []);

  const login = async () => {
    if (!pw) return;
    setBusy(true); setErr('');
    try {
      const res = await fetch(`${AUTH_URL}/api/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      });
      if (res.ok) {
        const d = await res.json() as { token: string };
        localStorage.setItem(TOKEN_KEY, d.token);
        setStatus('ok');
      } else {
        setErr('Invalid access code');
      }
    } catch {
      setErr('Connection error');
    } finally {
      setBusy(false);
    }
  };

  if (status === 'loading') {
    return (
      <div style={{
        minHeight: '100vh', background: '#0a0a0f', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        fontFamily: "'JetBrains Mono', monospace", color: '#6b7280', fontSize: 11,
      }}>
        Authenticating...
      </div>
    );
  }

  if (status === 'locked') {
    return (
      <div style={{
        minHeight: '100vh', background: '#0a0a0f', display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 24,
      }}>
        <div style={{
          width: '100%', maxWidth: 360,
          border: '1px solid #1e1e2e', background: '#12121a', padding: 32,
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          <div style={{ color: '#818cf8', fontSize: 11, letterSpacing: 2, marginBottom: 8 }}>SMC SCANNER</div>
          <div style={{ color: '#e2e2f0', fontSize: 18, fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>ACCESS REQUIRED</div>
          <div style={{ color: '#6b7280', fontSize: 11, marginBottom: 24 }}>Enter your access code to continue</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ position: 'relative', width: '100%' }}>
              <input
                type={showPw ? 'text' : 'password'}
                value={pw}
                onChange={e => setPw(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && login()}
                placeholder="Access code"
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  background: '#0a0a0f', border: '1px solid #1e1e2e',
                  color: '#e2e2f0', fontSize: 13, padding: '10px 40px 10px 12px',
                  outline: 'none', borderRadius: 2, width: '100%', boxSizing: 'border-box',
                }}
              />
              <button
                type="button"
                onClick={() => setShowPw(s => !s)}
                style={{
                  position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#6b7280', padding: 0, lineHeight: 1, fontSize: 14,
                }}
              >
                {showPw ? '🙈' : '👁'}
              </button>
            </div>
            {err && <div style={{ color: '#ef4444', fontSize: 11 }}>✕ {err}</div>}
            <button
              onClick={login}
              disabled={busy || !pw}
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                background: '#818cf8', border: '1px solid #818cf8',
                color: '#fff', fontSize: 11, padding: '10px 16px',
                cursor: busy ? 'not-allowed' : 'pointer',
                letterSpacing: 1, textTransform: 'uppercase',
                opacity: busy || !pw ? 0.5 : 1, borderRadius: 2,
              }}
            >
              {busy ? 'Verifying...' : 'Enter'}
            </button>
          </div>
          <div style={{ color: '#6b7280', fontSize: 10, marginTop: 20 }}>Contact admin for access</div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
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
  grid:    '#1a1a1a',
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
  grid:    '#d0cbbf',
};

function fmtCountdown(secs: number): string {
  if (secs <= 0) return '0:00';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return `${h}:${String(rm).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmt(p: number) {
  if (p > 1000) return p.toFixed(2);
  if (p > 10)   return p.toFixed(3);
  return p.toFixed(4);
}

// ── localStorage helpers ──────────────────────────────────────────────────────
function lsGet<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function lsSet(key: string, val: unknown) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

function Scanner() {
  const { connected } = useConnection(DERIV_TOKEN);

  // ── Persisted state ────────────────────────────────────────────────────────
  const [dark, setDark] = useState<boolean>(() => lsGet('smc_dark', true));
  const [symbol, setSymbol] = useState<string>(() => lsGet('smc_symbol', DEFAULT_SYMBOL));
  const [htfGranularity, setHtfGranularity] = useState<number>(() => lsGet('smc_htf', DEFAULT_HTF));
  const [ltfGranularity, setLtfGranularity] = useState<number>(() => lsGet('smc_ltf', DEFAULT_LTF));
  const [htfMode, setHtfMode] = useState<HTFMode>(() => lsGet('smc_htfMode', 'full' as HTFMode));
  const [showLiveCandle, setShowLiveCandle] = useState<boolean>(() => lsGet('smc_showLive', false));
  const [showHtfPrice, setShowHtfPrice] = useState<boolean>(() => lsGet('smc_showPrice', true));
  const [overlays, setOverlays] = useState<OverlayToggles>(() => lsGet('smc_overlays', {
    crtLevels: true, fvg: true, sweep: true, mss: true, grid: true, crossLines: true, sessions: true,
  }));
  const [drawnLines, setDrawnLines] = useState<DrawnLine[]>(() => lsGet('smc_lines', []));

  useEffect(() => { lsSet('smc_dark',      dark); }, [dark]);
  useEffect(() => { lsSet('smc_symbol',    symbol); }, [symbol]);
  useEffect(() => { lsSet('smc_htf',       htfGranularity); }, [htfGranularity]);
  useEffect(() => { lsSet('smc_ltf',       ltfGranularity); }, [ltfGranularity]);
  useEffect(() => { lsSet('smc_htfMode',   htfMode); }, [htfMode]);
  useEffect(() => { lsSet('smc_showLive',  showLiveCandle); }, [showLiveCandle]);
  useEffect(() => { lsSet('smc_showPrice', showHtfPrice); }, [showHtfPrice]);
  useEffect(() => { lsSet('smc_overlays',  overlays); }, [overlays]);
  useEffect(() => { lsSet('smc_lines',     drawnLines); }, [drawnLines]);

  const T = dark ? DARK_THEME : LIGHT_THEME;

  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [settings, setSettings] = useState<ScannerSettings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [alertLog, setAlertLog] = useState<AlertEntry[]>([]);
  const [scannerOpen, setScannerOpen] = useState(() => window.innerWidth >= 768);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);

  useEffect(() => {
    const onResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) setScannerOpen(false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const [drawMode, setDrawMode] = useState(false);
  const [lineColorIdx, setLineColorIdx] = useState(0);

  // Countdown per panel
  const [htfCountdown, setHtfCountdown] = useState(0);
  const [ltfCountdown, setLtfCountdown] = useState(0);

  // Crosshair prices
  const [htfCrosshairPrice, setHtfCrosshairPrice] = useState<number | null>(null);
  const [ltfCrosshairPrice, setLtfCrosshairPrice] = useState<number | null>(null);

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

  // HTF display candles
  const htfDisplayCandles = useMemo(() => {
    if (htfMode === 'single') {
      if (htfCandles.length >= 2) {
        // last closed candle + optionally the live forming candle
        return showLiveCandle ? htfCandles.slice(-2) : htfCandles.slice(-2, -1);
      }
      return htfCandles.slice(-1);
    }
    return htfCandles;
  }, [htfCandles, htfMode, showLiveCandle]);

  // LTF display
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

  // Live price
  const htfLivePrice = htfCandles.length > 0
    ? (htfMode === 'single' && htfCandles.length >= 2
        ? htfCandles[htfCandles.length - 2].close
        : htfCandles[htfCandles.length - 1].close)
    : null;
  const ltfLivePrice = ltfCandles.length > 0 ? ltfCandles[ltfCandles.length - 1].close : null;
  const displayHtfPrice = htfCrosshairPrice ?? htfLivePrice;
  const displayLtfPrice = ltfCrosshairPrice ?? ltfLivePrice;

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
        {htfMode === 'single' && (
          <ToggleBtn T={T} label="LIVE" active={showLiveCandle} color={T.bull}
            onClick={() => setShowLiveCandle(v => !v)} />
        )}
        <Divider T={T} />

        <Label T={T}>SHOW</Label>
        <ToggleBtn T={T} label="CRT"   active={overlays.crtLevels} color={T.crt}   onClick={() => toggleOverlay('crtLevels')} />
        <ToggleBtn T={T} label="FVG"   active={overlays.fvg}       color={T.bull}  onClick={() => toggleOverlay('fvg')} />
        <ToggleBtn T={T} label="SWEEP" active={overlays.sweep}     color={T.sweep} onClick={() => toggleOverlay('sweep')} />
        <ToggleBtn T={T} label="MSS"   active={overlays.mss}       color={T.mss}   onClick={() => toggleOverlay('mss')} />
        <ToggleBtn T={T} label="GRID"  active={overlays.grid}                      onClick={() => toggleOverlay('grid')} />
        <ToggleBtn T={T} label="SESS"  active={overlays.sessions} color="#00cc77"  onClick={() => toggleOverlay('sessions')} />
        <ToggleBtn T={T} label="PRICE" active={showHtfPrice} color={T.sweep}       onClick={() => setShowHtfPrice(v => !v)} />
        <Divider T={T} />

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

        <ToggleBtn T={T} label={dark ? '☀' : '◑'} active={false} onClick={() => setDark(d => !d)} />
        <Divider T={T} />

        <ToggleBtn T={T} label={scannerOpen ? '▶ SCAN' : '◀ SCAN'} active={scannerOpen}
          color={T.mss} onClick={() => setScannerOpen(o => !o)} />
        <Divider T={T} />

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

        <div style={{ flex: 1, display: 'flex', flexDirection: isMobile ? 'column' : 'row', minWidth: 0, overflow: 'hidden' }}>

          {/* HTF */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, [isMobile ? 'borderBottom' : 'borderRight']: `1px solid ${T.border}` }}>
            <PanelHeader T={T}
              title={htfLabel}
              subtitle={htfMode === 'single' ? (showLiveCandle ? 'CLOSED + LIVE' : 'LAST CLOSED') : 'HTF'}
              loading={htfLoading}
              price={showHtfPrice ? displayHtfPrice : null}
              priceColor={T.text}
              countdown={htfCandles.length > 0 ? htfCountdown : null}
              countdownTheme={T}
              mobileControls={isMobile ? (<>
                <MiniBtn T={T} label="SGL" active={htfMode === 'single'} onClick={() => setHtfMode(m => m === 'single' ? 'full' : 'single')} />
                {htfMode === 'single' && <MiniBtn T={T} label="LIVE" active={showLiveCandle} color={T.bull} onClick={() => setShowLiveCandle(v => !v)} />}
                <MiniBtn T={T} label="SESS" active={overlays.sessions} color="#00cc77" onClick={() => toggleOverlay('sessions')} />
                <MiniBtn T={T} label="FVG" active={overlays.fvg} color={T.bull} onClick={() => toggleOverlay('fvg')} />
                <MiniBtn T={T} label="MSS" active={overlays.mss} color={T.mss} onClick={() => toggleOverlay('mss')} />
                <MiniBtn T={T} label="SWP" active={overlays.sweep} color={T.sweep} onClick={() => toggleOverlay('sweep')} />
              </>) : undefined}
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
                    granularity={htfGranularity}
                    onCrosshairMove={(_, price) => setHtfCrosshairPrice(price)}
                    onCountdownChange={setHtfCountdown}
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
              price={showHtfPrice ? displayLtfPrice : null}
              priceColor={T.text}
              countdown={ltfCandles.length > 0 ? ltfCountdown : null}
              countdownTheme={T}
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
                    granularity={ltfGranularity}
                    onCrosshairMove={(_, price) => setLtfCrosshairPrice(price)}
                    onCountdownChange={setLtfCountdown}
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

        {/* Scanner sidebar — overlay on mobile, inline on desktop */}
        {scannerOpen && (
          <>
            {/* Mobile backdrop */}
            {isMobile && (
              <div
                onClick={() => setScannerOpen(false)}
                style={{
                  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
                  zIndex: 999,
                }}
              />
            )}
            <div style={isMobile ? {
              position: 'fixed', top: 0, right: 0, bottom: 0,
              width: 220, zIndex: 1000,
              display: 'flex', flexDirection: 'column',
              background: T.surface, borderLeft: `1px solid ${T.border}`,
              boxShadow: '-4px 0 20px rgba(0,0,0,0.4)',
              overflow: 'hidden',
            } : {
              width: 196, borderLeft: `1px solid ${T.border}`,
              flexShrink: 0, display: 'flex', flexDirection: 'column',
              background: T.surface, overflow: 'hidden',
            }}>
              {/* Mobile close button */}
              {isMobile && (
                <button
                  onClick={() => setScannerOpen(false)}
                  style={{
                    alignSelf: 'flex-end', margin: '8px 8px 0',
                    background: 'transparent', border: 'none',
                    color: T.text, fontSize: 18, cursor: 'pointer', lineHeight: 1,
                    padding: '4px 8px',
                  }}
                >✕</button>
              )}
              <SetupPanel
                status={setupStatus}
                loading={ltfLoading || htfLoading}
                alertLog={alertLog}
              />
            </div>
          </>
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
          <span style={{ marginLeft: 'auto', color: lineColor, fontSize: 10 }}>
            ✎ DRAG TO DRAW · DRAG LINE TO MOVE
          </span>
        )}
      </div>

      <AlertBanner status={setupStatus} onNewAlert={handleNewAlert} />
    </div>
  );
}

export default function Index() {
  return <AuthGate><Scanner /></AuthGate>;
}

// ── Sub-components ────────────────────────────────────────────────────────────

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

function MiniBtn({ T, label, active, onClick, color }: {
  T: Theme; label: string; active: boolean; onClick: () => void; color?: string;
}) {
  const c = color || T.neutral;
  return (
    <button onClick={onClick} style={{
      background: active ? `${c}22` : 'transparent',
      border: `1px solid ${active ? c : T.border}`,
      color: active ? c : T.label,
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 9, padding: '1px 4px',
      cursor: 'pointer', letterSpacing: 0.3, whiteSpace: 'nowrap',
      lineHeight: 1.4,
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

function PanelHeader({ T, title, subtitle, loading, price, priceColor, countdown, countdownTheme, mobileControls }: {
  T: Theme; title: string; subtitle: string; loading: boolean;
  price?: number | null; priceColor?: string;
  countdown?: number | null; countdownTheme?: Theme;
  mobileControls?: React.ReactNode;
}) {
  const ct = countdownTheme ?? T;
  const cdColor = countdown != null
    ? (countdown <= 10 ? ct.bear : countdown <= 30 ? ct.sweep : ct.label)
    : ct.label;

  return (
    <div style={{
      height: 28, borderBottom: `1px solid ${T.border}`,
      display: 'flex', alignItems: 'center',
      padding: '0 8px', gap: 6, flexShrink: 0, background: T.surface,
    }}>
      <span style={{ color: T.text, fontSize: 11, fontWeight: 600 }}>{title}</span>
      <span style={{ color: T.label, fontSize: 10 }}>{subtitle}</span>
      {price != null && (
        <span style={{ marginLeft: 2, color: priceColor ?? T.text, fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>
          {price > 1000 ? price.toFixed(2) : price > 10 ? price.toFixed(3) : price.toFixed(4)}
        </span>
      )}
      {/* Mobile quick-toggles */}
      {mobileControls && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 4 }}>
          {mobileControls}
        </div>
      )}
      <div style={{ flex: 1 }} />
      {loading && <span style={{ color: T.neutral, fontSize: 10 }}>LOADING...</span>}
      {countdown != null && !loading && (
        <span style={{
          color: cdColor, fontSize: 10, fontWeight: 600,
          letterSpacing: 1, fontFamily: "'JetBrains Mono', monospace",
        }}>
          {fmtCountdown(countdown)}
        </span>
      )}
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
