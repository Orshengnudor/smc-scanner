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
    body: 'This is your Smart Money Concept (SMC) trading scanner — a real-time tool that connects directly to the Deriv live price feed and automatically detects key market structures.\n\nIt does the heavy lifting: identifying Fair Value Gaps, Liquidity Sweeps, Market Structure Shifts, and CRT levels so you can focus on making trading decisions, not hunting for setups manually.\n\nThis quick tour will walk you through every part of the interface. Use Next/Prev to navigate, or Skip if you want to jump straight in.',
    anchor: null,
  },
  {
    title: 'Symbol Selector',
    body: 'The dropdown at the top-left lets you choose which market to monitor. Examples include Volatility 75, Volatility 100, Boom/Crash indices, and other Deriv synthetic instruments.\n\nWhen you change the symbol, both charts reload with fresh live data for that market. Your last selected symbol is saved automatically — it will still be selected next time you open the scanner.',
    anchor: 'header',
  },
  {
    title: 'HTF & LTF Timeframe Selectors',
    body: 'HTF = Higher Time Frame. This is your big-picture view — used to determine market bias and identify key structural levels. Set it to a longer candle period (e.g. 1H, 4H).\n\nLTF = Lower Time Frame. This is your entry view — used to time your trade after HTF has confirmed a setup. Set it smaller than your HTF (e.g. 5M, 15M).\n\nThe two charts always show the same symbol side by side — HTF on the left, LTF on the right. Both update live.',
    anchor: 'header',
  },
  {
    title: 'SINGLE Mode',
    body: 'Click the SINGLE button to toggle Single Candle Mode on or off.\n\nWhen ON: The HTF chart zooms into just the last closed candle. The LTF chart shows only the candles that fall within that one HTF candle\'s time window. This lets you drill into the internal price action of a single HTF candle — very useful for finding precise entries.\n\nWhen OFF: Both charts show the full candle history as normal.\n\nWhen SINGLE is on, you also get the LIVE button. Click LIVE to also show the currently forming (not yet closed) HTF candle alongside the last closed one.',
    anchor: 'header',
  },
  {
    title: 'CRT — Candle Range Theory',
    body: 'Click the CRT button to turn this overlay on or off.\n\nCRT levels are key price zones derived from the open, high, low, and close of the last fully closed HTF candle. These represent the range that smart money established in the previous candle — and price frequently reacts at these levels.\n\nWhen ON: You\'ll see horizontal lines drawn on both charts marking the CRT high, low, open, and close levels.\n\nWhen OFF: These lines are hidden. Toggle it off if you want a cleaner chart without the reference lines.',
    anchor: 'header',
  },
  {
    title: 'FVG — Fair Value Gap',
    body: 'Click the FVG button to turn this overlay on or off.\n\nA Fair Value Gap is a price imbalance that forms between three consecutive candles — where the wick of candle 1 and the wick of candle 3 do not overlap with candle 2\'s body. This gap represents an area of inefficiency that price has a strong tendency to return to and "fill".\n\nWhen ON: Active FVG zones are shaded on the charts. Bullish FVGs are typically green (price likely to move up through them), bearish FVGs are red.\n\nWhen OFF: FVG zones are hidden. You might do this if you want to reduce visual clutter while focusing on other signals.',
    anchor: 'header',
  },
  {
    title: 'SWEEP — Liquidity Sweep',
    body: 'Click the SWEEP button to turn this overlay on or off.\n\nA Liquidity Sweep (also called a stop hunt) is when price pushes past a prior swing high or swing low — triggering stop losses from retail traders sitting beyond those levels — and then reverses sharply. This is how smart money accumulates positions at better prices.\n\nWhen ON: Detected sweep points are marked on the charts with arrows or markers showing where the sweep occurred and which direction.\n\nWhen OFF: Sweep markers are hidden. The SCAN panel still detects sweeps in the background regardless — this only controls the chart visuals.',
    anchor: 'header',
  },
  {
    title: 'MSS — Market Structure Shift',
    body: 'Click the MSS button to turn this overlay on or off.\n\nA Market Structure Shift occurs when price breaks through a significant structure level in the opposite direction after a liquidity sweep. For example: if price sweeps a prior low (bearish sweep) and then breaks above a recent high, that\'s a bullish MSS — signalling a potential reversal from bearish to bullish.\n\nMSS is one of the strongest confirmation signals in SMC trading. An MSS after a sweep is the market showing its hand.\n\nWhen ON: MSS events are marked on the chart with labels.\n\nWhen OFF: MSS markers are hidden from the chart.',
    anchor: 'header',
  },
  {
    title: 'GRID, SESS & PRICE',
    body: 'Three more toggles — each controls a different visual layer:\n\nGRID — Turns the background price grid lines on or off. The grid helps you visually align price levels across the chart. Turn it off for a minimal clean look.\n\nSESS (Sessions) — Highlights the major trading session windows: London, New York, and Asia. Each session is shaded a different colour on the chart. Very useful for understanding when volume and volatility spike. Click to toggle on/off.\n\nPRICE — Shows the current live price reading in the chart panel headers. When on, you see the real-time price update next to the timeframe label. Click to toggle it off if you prefer a cleaner header.',
    anchor: 'header',
  },
  {
    title: 'Draw Tool (✎)',
    body: 'Click the ✎ button to enter Draw Mode.\n\nIn draw mode, you can drag horizontally on either chart to draw your own horizontal level lines — useful for marking S/R levels, your entry zones, or personal price targets.\n\nColour swatch: When draw mode is on, a small coloured square appears. Click it to cycle through available line colours.\n\nMove lines: After drawing, you can drag any line up or down to reposition it.\n\nCLR button: Appears when you have drawn lines. Click CLR to delete all drawn lines at once.\n\nYour lines are saved in your browser — they persist across sessions automatically. Clearing browser data will erase them.',
    anchor: 'header',
  },
  {
    title: 'SCAN Panel',
    body: 'Click the SCAN button (top-right) to open or close the setup analysis panel.\n\nThe SCAN panel is the brain of the scanner. It shows the current state of all 4 SMC conditions in real time:\n\n• BIAS — Bullish or Bearish, based on HTF market structure\n• SWEEP — Whether a liquidity sweep was detected (BSL = Buy Side, SSL = Sell Side)\n• MSS — Whether a Market Structure Shift has confirmed after the sweep\n• FVG — Whether an active Fair Value Gap is present for entry\n\nWhen all 4 conditions are met, a SETUP fires with a direction (BUY or SELL), a Stop Loss level, and Take Profit target.\n\nThe score (e.g. 3/4) shows how many conditions are currently met. Markets aren\'t always in setup — patience is part of the strategy.',
    anchor: 'scan',
  },
  {
    title: 'Status Bar & Settings',
    body: 'Status Bar (bottom strip): Shows a compact live summary — BIAS, SWEEP, MSS, FVG, SETUP type, and trade zones (SL / TP with R-multiple). Green = bullish, red = bearish. Always visible at a glance.\n\nSettings ⚙: Click the gear icon to fine-tune scanner sensitivity:\n• FVG Min Size — filters out tiny FVGs below a certain price gap size\n• Sweep Buffer — tolerance in price units for detecting sweeps\n• Setup Expiry — how many candles a setup stays valid before being dismissed\n\nTheme ☀/◑: Toggle between dark and light mode. Preference is saved automatically.\n\nAll settings persist across sessions.',
    anchor: 'statusbar',
  },
  {
    title: "You're all set",
    body: "That covers everything. Every toggle on the header can be clicked at any time to turn features on or off — experiment freely, your preferences are always saved.\n\nYou can revisit this guide anytime by clicking the ? button in the header.\n\nFor support or questions:\n• Email: orshengnudor1@gmail.com\n• X: @orshengnudor_1",
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
    body: `SMC Scanner is a real-time trading analysis tool built on Smart Money Concept (SMC) principles. It connects directly to the Deriv live price feed via WebSocket and automatically detects key market structures across two timeframes simultaneously.

The goal is simple: instead of manually hunting for setups across multiple charts, the scanner watches the market 24/7 and tells you when a high-probability trade setup is forming — with entry context, stop loss, and take profit levels already calculated.

It is built for traders who use the SMC / ICT methodology: liquidity concepts, fair value gaps, market structure, and candle range theory.`,
  },
  {
    heading: 'Getting Access',
    body: `SMC Scanner is a restricted platform. Access is controlled exclusively by the admin.

How it works:
• The admin generates a unique access code for each user
• You use that code to log into the scanner
• Access codes can have an expiry date set by the admin
• The admin can revoke a code at any time

If your code stops working, it has either expired or been revoked. The scanner will not give details — contact the admin directly for a new code.

To request access:
→ Email: orshengnudor1@gmail.com
→ X: @orshengnudor_1

You do not choose your own password. The access code IS your password — treat it like one. Do not share it.`,
  },
  {
    heading: 'Logging In',
    body: `1. Open smc-scanner-web.vercel.app
2. You will see an "ACCESS REQUIRED" prompt
3. Enter the access code given to you by the admin
4. Click Enter (or press the Enter key)
5. You're in

Your session is saved in your browser. You will not need to log in again unless:
• Your access code expires
• Your access code is revoked by the admin
• You manually log out
• You clear your browser data

If you see "Invalid access code":
→ Make sure you copied the code exactly — no extra spaces at the start or end
→ Codes are case-sensitive
→ If it still fails, the code may have expired — contact admin`,
  },
  {
    heading: 'The Two Charts (HTF & LTF)',
    body: `The scanner always shows two charts side by side:

LEFT CHART — HTF (Higher Time Frame)
This is your big-picture view. You use the HTF to:
• Determine overall market bias (is the market bullish or bearish right now?)
• Identify key structural levels — previous highs, lows, and swing points
• Spot where liquidity is sitting above or below price
• Read CRT and FVG zones on a higher level

Set the HTF to a longer candle period — common choices are 1H, 4H, or Daily.

RIGHT CHART — LTF (Lower Time Frame)
This is your precision entry view. After the HTF tells you the direction and key levels, you drop to the LTF to:
• Time your actual entry more precisely
• Watch for lower timeframe confirmation signals
• See where FVGs and sweeps are forming within the move

Set the LTF to something shorter than your HTF — e.g. if HTF is 1H, LTF could be 5M or 15M.

Both charts stream live data. The countdown timer in each panel header shows how many seconds remain until the current candle closes.`,
  },
  {
    heading: 'Symbol & Timeframe Selection',
    body: `SYMBOL SELECTOR (top-left dropdown)
Choose which Deriv market to monitor — Volatility 75, Volatility 100, Boom/Crash indices, and other synthetic instruments are available.

When you change the symbol, both charts reload automatically with live data for that market. Your last selected symbol is remembered and restored next time you open the scanner.

HTF SELECTOR
Appears after the HTF label in the header. Click it to choose your Higher Time Frame candle period. Available options include 5M through Daily timeframes depending on your strategy.

LTF SELECTOR
Same as above but for the Lower Time Frame. Always set this smaller than your HTF so the two charts complement each other.

Both timeframe preferences are saved automatically.`,
  },
  {
    heading: 'SINGLE Mode & LIVE Toggle',
    body: `SINGLE MODE (click to toggle on/off)
When you click SINGLE in the header, it turns on Single Candle Mode.

What it does: The HTF chart zooms into only the last fully closed HTF candle. The LTF chart then shows only the LTF candles that fall within that single HTF candle's time window.

Why use it: This gives you an extremely zoomed-in view of what happened inside one HTF candle — perfect for finding precise entry points after you've identified a setup on the full chart. Instead of seeing hundreds of candles at once, you're focused on the one that matters right now.

Click SINGLE again to turn it off and go back to full chart view.

LIVE TOGGLE (only visible when SINGLE is on)
When SINGLE mode is active, the LIVE button appears. Click it to also show the currently forming (not yet closed) HTF candle alongside the last closed one.

This lets you watch in real time as the current candle develops — useful if you're monitoring whether a breakout or reversal is forming right now. Click LIVE again to hide the forming candle and only show the closed one.`,
  },
  {
    heading: 'CRT — Candle Range Theory',
    body: `BUTTON: CRT (click to toggle on/off)

CRT stands for Candle Range Theory. When you click the CRT button in the header, it turns the CRT overlay on. Click it again to turn it off.

What it shows: Horizontal lines drawn at the open, high, low, and close of the last fully closed HTF candle. These four price points define the "range" that was established in the previous HTF candle.

Why it matters: In SMC, the previous candle's range is significant. Price frequently returns to these levels — the high and low act as liquidity pools, and the open/close act as balance points. When price approaches a CRT level, it often reacts with a reversal or continuation signal.

How to use it:
• CRT high — potential sell zone / liquidity above
• CRT low — potential buy zone / liquidity below
• CRT open/close — mid-range balance levels to watch

When ON: You'll see horizontal reference lines on both charts.
When OFF: The lines are hidden. Turn it off for a cleaner chart if you don't need the reference levels right now.`,
  },
  {
    heading: 'FVG — Fair Value Gap',
    body: `BUTTON: FVG (click to toggle on/off)

FVG stands for Fair Value Gap. Click the FVG button in the header to turn this overlay on or off.

What it is: A Fair Value Gap forms when three consecutive candles leave a price gap between them — specifically, when the high of candle 1 is below the low of candle 3 (or vice versa), leaving candle 2 completely isolated with no overlap. This gap is an area of price inefficiency — the market moved too fast and left an imbalance behind.

Why it matters: Price has a very strong tendency to "return to fill" FVGs before continuing its move. FVGs are prime entry zones in SMC trading — they represent areas where smart money is still present and where the market is likely to revisit.

Bullish FVG: Forms when price moved up aggressively, leaving a gap below. Price often comes back down to fill it before continuing up — this is where you look for buy entries.

Bearish FVG: Forms when price moved down aggressively, leaving a gap above. Price often retraces up to fill it before continuing down — this is where you look for sell entries.

When ON: Active (unfilled) FVG zones are shaded on both charts. Once a FVG gets filled by price, it is automatically marked as mitigated.
When OFF: All FVG shading is hidden. The scanner still detects them in the background — this only affects the visual display.`,
  },
  {
    heading: 'SWEEP — Liquidity Sweep',
    body: `BUTTON: SWEEP (click to toggle on/off)

Click the SWEEP button in the header to show or hide liquidity sweep markers on the charts.

What a sweep is: A Liquidity Sweep (also known as a stop hunt) happens when price pushes beyond a prior swing high or swing low — spiking just far enough to trigger stop-loss orders placed by retail traders beyond those levels — and then immediately reverses. This is smart money (institutions, banks) collecting liquidity at better prices before making their actual move.

Why it matters: A sweep is the first signal in the SMC entry model. Before any significant move, the market typically takes out liquidity first. Recognising a sweep tells you: smart money just entered, and a reversal may be coming.

Buy-Side Liquidity Sweep (BSL): Price sweeps above a prior high, taking out buy-stop orders, then reverses down. Ironically this often precedes a bullish reversal because smart money was absorbing sell orders.

Sell-Side Liquidity Sweep (SSL): Price sweeps below a prior low, taking out sell-stop orders, then reverses up. Often precedes a bearish move.

When ON: Sweep events are marked directly on the charts so you can see exactly where they occurred.
When OFF: Sweep markers are hidden from the chart. The SCAN panel still detects sweeps in the background — the toggle only controls the chart visual.`,
  },
  {
    heading: 'MSS — Market Structure Shift',
    body: `BUTTON: MSS (click to toggle on/off)

Click the MSS button in the header to turn Market Structure Shift markers on or off.

What it is: A Market Structure Shift is when price breaks through a key structural level in the opposite direction — signalling that the current trend is potentially over and a new one is beginning. In the SMC model, MSS is the confirmation that follows a liquidity sweep.

The sequence looks like this:
1. Price sweeps a liquidity level (takes out stops)
2. Price then aggressively breaks through the most recent swing high or low in the opposite direction
3. That break IS the MSS — the market has shifted structure

Why it matters: MSS is your confirmation signal. A sweep alone isn't enough — the MSS tells you the move is real and not just a fakeout. A sweep + MSS together is one of the highest-probability signals in SMC trading.

Bullish MSS: After a sell-side sweep, price breaks above a prior swing high → confirms bullish reversal.
Bearish MSS: After a buy-side sweep, price breaks below a prior swing low → confirms bearish reversal.

When ON: MSS events are labelled on the chart at the exact candle where the shift occurred.
When OFF: MSS labels are hidden from the chart view.`,
  },
  {
    heading: 'GRID — Price Grid',
    body: `BUTTON: GRID (click to toggle on/off)

The GRID button controls whether background price grid lines are shown on the charts.

What it is: Evenly spaced horizontal lines across the chart that serve as visual reference points for reading price levels. Think of it as graph paper behind the candles.

When ON: Subtle grid lines appear across both charts, making it easier to eyeball price distances and align your analysis with specific price levels.

When OFF: Grid lines are hidden, giving the charts a cleaner, minimal look. Some traders prefer no grid to reduce visual noise — especially when using the draw tool for manual level marking.

This is purely a visual preference — it has no effect on detection or analysis. Click to toggle at any time.`,
  },
  {
    heading: 'SESS — Trading Sessions',
    body: `BUTTON: SESS (click to toggle on/off)

Click the SESS button to turn session markers on or off on the charts.

What it shows: Vertical shaded bands on the chart marking the three major global trading sessions:
• Asia Session — typically quieter, range-bound price action
• London Session — often where the day's first major move begins
• New York Session — highest volume, sharpest moves, most setups

Why it matters: Time of day matters enormously in trading. The best SMC setups — especially sweeps and MSS events — tend to happen during session opens and overlaps (e.g. London open, NY open, London/NY overlap). Knowing which session you're in helps you avoid low-probability setups during dead hours and focus energy when real institutional volume is active.

When ON: Session windows are highlighted as coloured shading across both charts.
When OFF: Session shading is hidden. Turn it off if you find it visually distracting or if you trade only one session and don't need the context.`,
  },
  {
    heading: 'PRICE Display',
    body: `BUTTON: PRICE (click to toggle on/off)

The PRICE button controls whether the live price reading is shown in the header of each chart panel.

When ON: The current live price updates in real time next to the timeframe label in each panel header. When you move your crosshair over the chart, the price reading updates to show the price at your cursor position.

When OFF: The price display is hidden from the panel headers. Useful if you want a cleaner, more minimal header bar without the number updating constantly.

This does not affect anything functionally — it's purely a display preference. Click to toggle at any time.`,
  },
  {
    heading: 'Draw Tool (✎)',
    body: `BUTTON: ✎ (click to toggle draw mode on/off)

The draw tool lets you mark your own horizontal levels directly on the charts. Click the ✎ button to enter draw mode — click it again to exit.

How to draw a line:
• With draw mode ON, click and drag horizontally on either chart
• Release to place the line
• The line stays on both charts at that price level

Move a line:
• Click and drag any existing line up or down to reposition it

Change line colour:
• When draw mode is on, a small coloured square appears next to the ✎ button
• Click it to cycle through available colours: yellow, orange, blue, green, red, white
• New lines will use the selected colour

Delete all lines:
• When you have drawn lines, a CLR button appears
• Click CLR to remove all your drawn lines at once

Persistence:
• All your drawn lines are automatically saved in your browser
• They will still be there next time you open the scanner
• Clearing your browser's localStorage or cache will erase them

Draw mode hint:
• While in draw mode, the status bar at the bottom shows: "✎ DRAG TO DRAW · DRAG LINE TO MOVE"
• Exit draw mode when you're done so you don't accidentally add lines while scrolling`,
  },
  {
    heading: 'SCAN Panel',
    body: `BUTTON: SCAN (click to open/close the panel)

The SCAN panel is the central output of the scanner. Click SCAN in the top-right of the header to open or close it. On mobile it slides in as an overlay — tap the ✕ or tap outside to close it.

What it shows:

BIAS
The overall market bias based on HTF structure analysis. Values: BULLISH, BEARISH, or NEUTRAL. This tells you which direction the market is currently favouring.

SWEEP
Whether a liquidity sweep was detected recently. Shows BSL (Buy Side Liquidity sweep — above prior highs) or SSL (Sell Side Liquidity sweep — below prior lows). If no sweep is detected, shows —.

MSS
Whether a Market Structure Shift has confirmed. Shows the type of MSS or ✓ if confirmed. If no MSS yet, shows —.

FVG
Whether an active (unfilled) Fair Value Gap is present that aligns with the setup direction. ACTIVE means there's a valid FVG available for entry. — means no qualifying FVG.

SETUP SCORE (e.g. 3/4)
How many of the 4 conditions are currently met. When all 4 align, a full setup fires.

ACTIVE SETUP
When all 4 conditions are met, the panel shows BUY or SELL with a score of 4/4. This is your signal. It also displays:
• SL — calculated Stop Loss level
• TP1 — first Take Profit target with the R-multiple (e.g. 2.1R)

Important: Not every market condition will produce a setup. The scanner only fires when genuine confluence exists. Patience is part of the strategy.`,
  },
  {
    heading: 'Status Bar (Bottom Strip)',
    body: `The status bar runs across the very bottom of the screen and is always visible — it gives you a constant at-a-glance read of the current market state without needing to open the SCAN panel.

What it shows (left to right):
• BIAS — current market direction (bullish/bearish/neutral)
• SWEEP — whether a sweep was detected and which side (BSL/SSL)
• MSS — whether structure shift is confirmed
• FVG — whether a valid fair value gap is active
• SETUP — current setup status and conditions met count (e.g. BUY 4/4 or NONE 2/4)
• SL — stop loss level if a setup is active
• TP1 — take profit level with R-multiple if a setup is active

Colour coding:
• Green = bullish signal / buy side
• Red = bearish signal / sell side
• Orange = sweep detected
• Yellow = MSS related
• Grey = inactive / no signal

When no data has loaded yet, it shows "AWAITING DATA..." — this clears once the live feed connects and enough candles are loaded.`,
  },
  {
    heading: 'Settings (⚙)',
    body: `BUTTON: ⚙ (click to open/close the settings panel)

The settings panel lets you fine-tune how sensitive the scanner's detection algorithms are. Click ⚙ in the header to open it, click again to close.

FVG MIN SIZE
Sets the minimum price gap size required for a Fair Value Gap to be considered valid. Default is 0 (all gaps count). Increase this to filter out very small, insignificant FVGs and only highlight larger, more meaningful imbalances.

SWEEP BUFFER
A tolerance value in price units for liquidity sweep detection. Sometimes price doesn't sweep perfectly cleanly — the buffer allows for small deviations when identifying whether a swing point was taken out. Increase it if you find sweeps aren't being detected on your instrument. Default is 0.

SETUP EXPIRY (candles)
How many candles a detected setup remains valid before being dismissed. Default is 30. If a setup forms but price hasn't reacted within this many candles, the setup is considered expired and cleared. Reduce this number for more aggressive expiry, increase it to keep setups active longer.

Leave all settings at defaults if you're unsure — they're tuned for general use across Deriv synthetic indices. Adjustments are most useful when adapting to a specific symbol's behaviour.`,
  },
  {
    heading: 'Theme (☀ / ◑)',
    body: `BUTTON: ☀ or ◑ (click to switch theme)

Click the theme button (shows ☀ in dark mode, ◑ in light mode) to toggle between the dark and light colour scheme.

DARK THEME (default)
Black background with high-contrast coloured indicators. Easier on the eyes during long sessions, especially at night. Bullish candles are bright green, bearish candles are red, overlays are clearly visible.

LIGHT THEME
Warm off-white / parchment background. Some traders prefer this in bright environments. All overlays and indicators adapt to the light palette automatically.

Your theme preference is saved automatically and restored next time you open the scanner.`,
  },
  {
    heading: 'Troubleshooting',
    body: `Charts show "LOADING..." and never update
→ The scanner relies on a live WebSocket connection to Deriv. Check your internet connection and try refreshing the page. If the problem persists, Deriv's servers may be temporarily unavailable.

"DISCONNECTED" shows in the top-right
→ The WebSocket connection dropped. Refresh the page — it reconnects automatically on load.

"Invalid access code" on login
→ Double-check the code has no extra spaces. Codes are case-sensitive. If still failing, the code may be expired or revoked — contact admin for a new one.

No setup showing in the SCAN panel
→ This is completely normal. A setup only fires when all 4 SMC conditions align at the same time: bias + sweep + MSS + FVG. Markets are not always in setup. The scanner is designed to only show high-quality signals — fewer signals is a feature, not a bug. Wait for the market to set up properly.

Session expired / logged out unexpectedly
→ Your access code has expired. Contact admin for a renewed code.

Drawn lines disappeared
→ Lines are stored in your browser's localStorage. If you cleared browser data, cookies, or cache, the lines will be gone. Also check that draw mode was properly exited — if draw mode was accidentally left on, you may have moved lines without realising.

The SCAN panel shows 3/4 but no setup fires
→ One condition is not yet met. Check which item is showing — (—) is the missing one. Common scenario: sweep and MSS detected, but no FVG present at that level, or the FVG has already been filled.

Price seems wrong or frozen
→ Refresh the page. If the WebSocket reconnects and the countdown timer starts moving, the data is live again.

Need more help?
→ Email: orshengnudor1@gmail.com
→ X: @orshengnudor_1`,
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
  detectLiquidityStacks,
  type SetupStatus,
  type ScannerSettings,
  type LiquidityStack,
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
    crtLevels: true, fvg: true, sweep: true, mss: true, grid: true, crossLines: true, sessions: true, liqStacks: true,
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

  const htfLiqStacks = useMemo(
    () => detectLiquidityStacks(htfCandles),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [htfLen]
  );
  const ltfLiqStacks = useMemo(
    () => detectLiquidityStacks(ltfCandles),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ltfLen]
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

  // ── Liquidity Stack proximity alert ───────────────────────────────────────
  const firedStackAlertsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (ltfCandles.length === 0) return;
    const currentPrice = ltfCandles[ltfCandles.length - 1].close;
    const allStacks = [...ltfLiqStacks, ...htfLiqStacks];
    for (const stack of allStacks) {
      if (stack.touched) continue; // already raided
      const inZone = currentPrice >= stack.priceLow && currentPrice <= stack.priceHigh;
      const approaching = !inZone && (
        Math.abs(currentPrice - stack.midPrice) / currentPrice < 0.003 // within 0.3%
      );
      if ((inZone || approaching) && !firedStackAlertsRef.current.has(stack.id)) {
        firedStackAlertsRef.current.add(stack.id);
        const side = stack.type === 'highs' ? 'SSL' : 'BSL';
        const action = inZone ? 'ENTERING' : 'APPROACHING';
        handleNewAlert({
          id: `liqstack-alert-${stack.id}-${Date.now()}`,
          message: `${action} ${side} STACK ×${stack.count} @ ${stack.midPrice.toFixed(2)}`,
          type: 'liq_stack',
          time: Date.now(),
        });
      }
      // Reset fired flag once price moves away (so it can alert again next approach)
      if (!inZone && !approaching) {
        firedStackAlertsRef.current.delete(stack.id);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ltfLen, ltfLiqStacks, htfLiqStacks]);

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
        <ToggleBtn T={T} label="FVG"    active={overlays.fvg}        color={T.bull}           onClick={() => toggleOverlay('fvg')} />
        <ToggleBtn T={T} label="SWEEP"  active={overlays.sweep}      color={T.sweep}          onClick={() => toggleOverlay('sweep')} />
        <ToggleBtn T={T} label="MSS"    active={overlays.mss}        color={T.mss}            onClick={() => toggleOverlay('mss')} />
        <ToggleBtn T={T} label="GRID"   active={overlays.grid}                                onClick={() => toggleOverlay('grid')} />
        <ToggleBtn T={T} label="SESS"   active={overlays.sessions}   color="#00cc77"          onClick={() => toggleOverlay('sessions')} />
        <ToggleBtn T={T} label="STACKS" active={overlays.liqStacks}  color="rgba(255,180,0,1)" onClick={() => toggleOverlay('liqStacks')} />
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
                    liquidityStacks={htfLiqStacks}
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
                    liquidityStacks={ltfLiqStacks}
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
