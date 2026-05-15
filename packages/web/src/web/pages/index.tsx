import { useState, useMemo, useEffect, useRef, useCallback } from 'react';

// ── Auth gate ──────────────────────────────────────────────────────────────
const AUTH_URL = 'https://smc-auth.vercel.app';
const TOKEN_KEY = 'smc_auth_token';
const TOUR_KEY  = 'smc_tour_done';

function AuthGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'ok' | 'locked'>('loading');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [firstLogin, setFirstLogin] = useState(false);

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
        const tourDone = localStorage.getItem(TOUR_KEY);
        if (!tourDone) setFirstLogin(true);
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
          <div style={{ color: '#6b7280', fontSize: 10, marginTop: 20 }}>
            Contact admin for access
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {children}
      {firstLogin && <OnboardingTour onDone={() => setFirstLogin(false)} />}
    </>
  );
}

// ── Onboarding Tour ────────────────────────────────────────────────────────

const TOUR_STEPS = [
  {
    title: 'Welcome to SMC Scanner',
    body: 'This is your Smart Money Concept (SMC) trading scanner. It monitors real-time price action and automatically detects key market structures to help you identify high-probability trade setups.',
    anchor: null,
  },
  {
    title: 'Symbol & Timeframe Selector',
    body: 'Use the dropdown at the top-left to select your trading symbol (e.g. Volatility 75). HTF is your Higher Time Frame for bias — set it to a bigger candle period. LTF is your Lower Time Frame for entry — set it smaller.',
    anchor: 'header',
  },
  {
    title: 'SINGLE & LIVE Mode',
    body: 'SINGLE mode shows only the last closed HTF candle and its corresponding LTF candles — perfect for zoomed-in entry analysis. Enable LIVE to also show the currently forming candle in real time.',
    anchor: 'header',
  },
  {
    title: 'Overlay Toggles (CRT, FVG, SWEEP, MSS)',
    body: 'These buttons control what gets drawn on the charts:\n• CRT — Candle Range Theory levels (key HTF price zones)\n• FVG — Fair Value Gaps (imbalances price tends to fill)\n• SWEEP — Liquidity sweeps (stop-hunt wicks)\n• MSS — Market Structure Shifts (trend change signals)\n• GRID — Price grid\n• SESS — Trading sessions (London, NY, Asia)',
    anchor: 'header',
  },
  {
    title: 'Draw Tool',
    body: 'Click the ✎ button to enter draw mode. Drag on either chart to draw horizontal lines. Click the color swatch to cycle through colors. Use CLR to clear all lines. Lines persist across sessions.',
    anchor: 'header',
  },
  {
    title: 'HTF & LTF Charts',
    body: 'The left panel is your Higher Time Frame chart — used to read overall bias and structure. The right panel is your Lower Time Frame — used to time your entry. Both update live via Deriv WebSocket feed.',
    anchor: null,
  },
  {
    title: 'SCAN Panel',
    body: 'The SCAN sidebar (toggle via SCAN button top-right) shows the auto-detected setup status: market bias, whether a liquidity sweep occurred, if MSS is confirmed, and if a valid FVG is present. When all 4 conditions align — a setup is confirmed with SL and TP levels.',
    anchor: 'scan',
  },
  {
    title: 'Status Bar',
    body: 'The bottom bar gives you a quick read at a glance: BIAS, SWEEP, MSS, FVG, active SETUP type, and trade zones (SL / TP1 with R-multiple). Green = bullish signal, red = bearish.',
    anchor: 'statusbar',
  },
  {
    title: 'Settings & Theme',
    body: 'Click ⚙ to adjust scanner sensitivity (FVG min size, sweep buffer, setup expiry). Click ☀/◑ to toggle light/dark theme. All your preferences are saved automatically.',
    anchor: 'header',
  },
  {
    title: "You're all set",
    body: "That's the full tour. You can revisit this guide anytime by clicking the ? button in the top-right header.\n\nFor support, reach out:\n• Email: orshengnudor1@gmail.com\n• X: @orshengnudor_1",
    anchor: null,
  },
];

function OnboardingTour({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const total = TOUR_STEPS.length;
  const current = TOUR_STEPS[step];

  const finish = () => {
    localStorage.setItem(TOUR_KEY, '1');
    onDone();
  };

  const next = () => {
    if (step < total - 1) setStep(s => s + 1);
    else finish();
  };

  const prev = () => { if (step > 0) setStep(s => s - 1); };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(2px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20, fontFamily: "'JetBrains Mono', monospace",
    }}>
      <div style={{
        width: '100%', maxWidth: 480,
        background: '#12121a', border: '1px solid #818cf8',
        padding: 28, position: 'relative',
        boxShadow: '0 0 40px rgba(129,140,248,0.15)',
      }}>
        {/* Step counter */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 20,
        }}>
          <div style={{ display: 'flex', gap: 5 }}>
            {Array.from({ length: total }).map((_, i) => (
              <div key={i} style={{
                width: i === step ? 18 : 6, height: 4, borderRadius: 2,
                background: i === step ? '#818cf8' : i < step ? '#3b3b5c' : '#1e1e2e',
                transition: 'width 0.2s, background 0.2s',
              }} />
            ))}
          </div>
          <span style={{ color: '#6b7280', fontSize: 10, letterSpacing: 1 }}>
            {step + 1} / {total}
          </span>
        </div>

        {/* Content */}
        <div style={{ color: '#818cf8', fontSize: 10, letterSpacing: 2, marginBottom: 8, textTransform: 'uppercase' }}>
          {step === 0 ? 'Getting Started' : `Step ${step} of ${total - 1}`}
        </div>
        <div style={{ color: '#e2e2f0', fontSize: 15, fontWeight: 700, letterSpacing: 0.5, marginBottom: 14 }}>
          {current.title}
        </div>
        <div style={{
          color: '#9ca3af', fontSize: 12, lineHeight: 1.7,
          whiteSpace: 'pre-line', marginBottom: 28,
        }}>
          {current.body}
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {step > 0 && (
            <button onClick={prev} style={{
              background: 'transparent', border: '1px solid #1e1e2e',
              color: '#6b7280', fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10, padding: '8px 16px', cursor: 'pointer',
              letterSpacing: 1, textTransform: 'uppercase',
            }}>← Prev</button>
          )}
          <div style={{ flex: 1 }} />
          <button onClick={finish} style={{
            background: 'transparent', border: 'none',
            color: '#4b5563', fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10, cursor: 'pointer', letterSpacing: 1,
            textDecoration: 'underline',
          }}>Skip tour</button>
          <button onClick={next} style={{
            background: '#818cf8', border: '1px solid #818cf8',
            color: '#fff', fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10, padding: '8px 20px', cursor: 'pointer',
            letterSpacing: 1, textTransform: 'uppercase',
          }}>
            {step === total - 1 ? 'Done ✓' : 'Next →'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Docs Modal ─────────────────────────────────────────────────────────────

const DOC_SECTIONS = [
  {
    heading: 'What is SMC Scanner?',
    body: `SMC Scanner is a real-time trading analysis tool built on Smart Money Concept (SMC) principles. It connects to the Deriv live feed and automatically detects key market structures — liquidity sweeps, fair value gaps, market structure shifts, and CRT levels — to help you identify high-probability trade setups.`,
  },
  {
    heading: 'Getting Access',
    body: `SMC Scanner is access-controlled. You need an access code from the admin to log in.\n\n• The admin has full authority over who can access the platform\n• Access codes can have expiry dates\n• If your code stops working, contact the admin for a renewal\n• To request access: Email orshengnudor1@gmail.com or DM @orshengnudor_1 on X`,
  },
  {
    heading: 'Logging In',
    body: `1. Open smc-scanner-web.vercel.app\n2. You'll be prompted for an access code\n3. Enter the code provided by the admin\n4. You're in — your session is saved, you won't need to log in again unless it expires\n\nIf you see "Invalid access code" — double-check you copied it correctly (no spaces). If it still fails, the code may be expired or revoked.`,
  },
  {
    heading: 'Reading the Charts',
    body: `The interface has two chart panels side by side:\n\n• Left panel = HTF (Higher Time Frame) — shows the big picture. Used to determine market bias (bullish or bearish) and key levels\n• Right panel = LTF (Lower Time Frame) — shows entry precision. Used to time your entry after HTF confirms structure\n\nBoth charts update live. The countdown timer in each panel header shows how many seconds remain until the current candle closes.`,
  },
  {
    heading: 'Overlay Indicators',
    body: `Toggle these from the header buttons:\n\n• CRT — Candle Range Theory levels. Key price zones derived from the last closed HTF candle\n• FVG — Fair Value Gap. An imbalance zone between three candles that price often revisits\n• SWEEP — Liquidity sweep. A wick that took out a prior high/low (stop hunt) before reversing\n• MSS — Market Structure Shift. When price breaks structure in the opposite direction — signals a trend change\n• GRID — Price grid lines for visual reference\n• SESS — Session markers (London, New York, Asia) — useful for timing entries`,
  },
  {
    heading: 'The SCAN Panel',
    body: `Click "SCAN" in the top-right to open the setup panel. It shows:\n\n• BIAS — overall market direction based on HTF structure\n• SWEEP — whether a liquidity sweep was detected and which side (Buy Side / Sell Side)\n• MSS — whether a market structure shift has confirmed\n• FVG — whether an active fair value gap is present\n• SETUP — when all 4 conditions align, a BUY or SELL setup is active with SL and TP1 levels\n\nThe setup score (e.g. 3/4) tells you how many conditions are currently met.`,
  },
  {
    heading: 'Drawing Lines',
    body: `Click the ✎ button in the header to enter draw mode:\n\n• Drag horizontally on either chart to draw a line\n• Click the colored square to cycle through line colors\n• Drag an existing line up/down to reposition it\n• Click CLR to clear all drawn lines\n• Lines are saved across sessions automatically`,
  },
  {
    heading: 'SINGLE Mode',
    body: `SINGLE mode restricts the HTF chart to show only the last closed candle, and the LTF chart to show only the candles that fall within that HTF candle's time range.\n\nThis is useful for zooming into a specific candle's internal price action without the noise of the full chart. Enable LIVE to also show the currently forming candle alongside the last closed one.`,
  },
  {
    heading: 'Settings',
    body: `Click ⚙ to open scanner settings:\n\n• FVG Min Size — minimum gap size to be considered a valid FVG (filter out tiny gaps)\n• Sweep Buffer — tolerance in price units for sweep detection\n• Setup Expiry — how many candles a detected setup remains valid before being dismissed\n\nLeave at defaults if unsure — they're tuned for general use.`,
  },
  {
    heading: 'Troubleshooting',
    body: `Charts show "LOADING..." forever\n→ Check your internet connection. The scanner uses a live WebSocket — it needs a stable connection.\n\n"DISCONNECTED" in top-right\n→ WebSocket dropped. Refresh the page to reconnect.\n\n"Invalid access code"\n→ Wrong code, expired, or revoked. Contact admin.\n\nNo setups showing in SCAN panel\n→ Normal — setups only appear when all 4 SMC conditions align. Markets aren't always in setup.\n\nLines disappeared\n→ Check if draw mode is still on. Lines are stored in localStorage — clearing browser data will erase them.\n\nNeed more help?\n→ Email: orshengnudor1@gmail.com\n→ X: @orshengnudor_1`,
  },
];

function DocsModal({ onClose, T }: { onClose: () => void; T: typeof DARK_THEME }) {
  const [active, setActive] = useState(0);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9000,
      background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(3px)',
      display: 'flex', alignItems: 'stretch', justifyContent: 'center',
      fontFamily: "'JetBrains Mono', monospace",
    }}>
      <div style={{
        width: '100%', maxWidth: 820,
        background: T.surface, border: `1px solid ${T.border}`,
        display: 'flex', flexDirection: 'column',
        margin: '20px 16px',
        boxShadow: '0 0 60px rgba(0,0,0,0.5)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          height: 48, borderBottom: `1px solid ${T.border}`,
          display: 'flex', alignItems: 'center',
          padding: '0 20px', gap: 12, flexShrink: 0,
          background: T.bg,
        }}>
          <span style={{ color: T.bull, fontSize: 11, fontWeight: 700, letterSpacing: 2 }}>SMC▸</span>
          <span style={{ color: T.border }}>|</span>
          <span style={{ color: T.text, fontSize: 11, letterSpacing: 1 }}>DOCS & HELP</span>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{
            background: 'transparent', border: `1px solid ${T.border}`,
            color: T.label, fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10, padding: '4px 12px', cursor: 'pointer', letterSpacing: 1,
          }}>✕ CLOSE</button>
        </div>

        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
          {/* Sidebar nav */}
          <div style={{
            width: 200, borderRight: `1px solid ${T.border}`,
            display: 'flex', flexDirection: 'column',
            overflowY: 'auto', flexShrink: 0,
            background: T.bg,
          }}>
            {DOC_SECTIONS.map((s, i) => (
              <button key={i} onClick={() => setActive(i)} style={{
                background: i === active ? `${T.accent}22` : 'transparent',
                border: 'none',
                borderLeft: i === active ? `2px solid ${T.accent}` : '2px solid transparent',
                color: i === active ? T.text : T.label,
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10, padding: '10px 14px',
                cursor: 'pointer', letterSpacing: 0.3,
                textAlign: 'left', lineHeight: 1.4,
                width: '100%',
              }}>
                {s.heading}
              </button>
            ))}
          </div>

          {/* Content */}
          <div style={{
            flex: 1, overflowY: 'auto', padding: '28px 28px',
          }}>
            <div style={{ color: T.accent, fontSize: 10, letterSpacing: 2, marginBottom: 10, textTransform: 'uppercase' }}>
              Documentation
            </div>
            <div style={{ color: T.text, fontSize: 15, fontWeight: 700, letterSpacing: 0.5, marginBottom: 18 }}>
              {DOC_SECTIONS[active].heading}
            </div>
            <div style={{
              color: '#9ca3af', fontSize: 12, lineHeight: 1.9,
              whiteSpace: 'pre-line',
            }}>
              {DOC_SECTIONS[active].body}
            </div>

            {/* Nav buttons */}
            <div style={{ display: 'flex', gap: 10, marginTop: 36 }}>
              {active > 0 && (
                <button onClick={() => setActive(a => a - 1)} style={{
                  background: 'transparent', border: `1px solid ${T.border}`,
                  color: T.label, fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 10, padding: '7px 16px', cursor: 'pointer', letterSpacing: 1,
                }}>← Previous</button>
              )}
              <div style={{ flex: 1 }} />
              {active < DOC_SECTIONS.length - 1 && (
                <button onClick={() => setActive(a => a + 1)} style={{
                  background: T.accent, border: `1px solid ${T.accent}`,
                  color: '#fff', fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 10, padding: '7px 16px', cursor: 'pointer', letterSpacing: 1,
                }}>Next →</button>
              )}
            </div>

            {/* Footer */}
            <div style={{
              marginTop: 40, paddingTop: 20,
              borderTop: `1px solid ${T.border}`,
              color: T.label, fontSize: 10, lineHeight: 1.8,
            }}>
              Need help? Reach out:<br />
              Email: <span style={{ color: T.accent }}>orshengnudor1@gmail.com</span>&nbsp;&nbsp;|&nbsp;&nbsp;
              X: <span style={{ color: T.accent }}>@orshengnudor_1</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
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
  const [showDocs, setShowDocs] = useState(false);
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

        {/* Docs button */}
        <ToggleBtn T={T} label="?" active={showDocs} color={T.mss} onClick={() => setShowDocs(d => !d)} />
        <Divider T={T} />

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

      {/* Docs modal */}
      {showDocs && <DocsModal onClose={() => setShowDocs(false)} T={T} />}
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
