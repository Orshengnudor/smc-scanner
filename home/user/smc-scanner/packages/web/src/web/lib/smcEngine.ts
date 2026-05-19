// SMC Engine — all detection logic lives here
// FVG, Liquidity Sweep, MSS/BOS/CHOCH, Bias, Setup Validation

import type { Candle } from './derivWS';

export type FVG = {
  id: string;
  type: 'bullish' | 'bearish';
  top: number;
  bottom: number;
  time: number; // candle time of middle candle
  mitigated: boolean;
  partial: boolean;
};

export type LiquiditySweep = {
  id: string;
  type: 'buy_side' | 'sell_side'; // buy_side = swept highs, sell_side = swept lows
  level: number;
  time: number;
  sweptTime: number;
};

export type MSS = {
  id: string;
  type: 'bullish' | 'bearish';
  level: number; // the broken structure level
  time: number;
  kind: 'BOS' | 'CHOCH';
};

export type CRTLevel = {
  high: number;
  low: number;
  close: number;
  open: number;
  time: number;
};

export type HTFBias = 'bullish' | 'bearish' | 'neutral';

export type TradeZones = {
  entryHigh: number;   // top of FVG entry zone
  entryLow: number;    // bottom of FVG entry zone
  stopLoss: number;    // MSS/sweep invalidation level
  tp1: number;         // TP1: nearest opposing liquidity
  tp2: number;         // TP2: next liquidity pool (2x RR minimum)
  rr1: number;         // Risk:Reward to TP1
  rr2: number;         // Risk:Reward to TP2
};

export type SetupStatus = {
  bias: HTFBias;
  sweepDetected: boolean;
  sweepType: 'buy_side' | 'sell_side' | null;
  mssConfirmed: boolean;
  mssKind: 'BOS' | 'CHOCH' | null;
  fvgPresent: boolean;
  activeSetup: 'buy' | 'sell' | null;
  conditionsMet: number; // out of 4
  tradeZones: TradeZones | null;
};

export type ScannerSettings = {
  fvgMinSize: number;       // minimum FVG size in price units (0 = no filter)
  sweepBuffer: number;      // pip buffer beyond swing high/low to count as sweep (0 = exact)
  setupExpiryCandles: number; // how many candles before a setup expires (0 = no expiry)
  rsiPeriod: number;        // RSI period for momentum confluence (default 14)
};

// ── FVG Detection ─────────────────────────────────────────────────────────────
export function detectFVGs(candles: Candle[], settings?: Pick<ScannerSettings, 'fvgMinSize'>): FVG[] {
  const fvgs: FVG[] = [];
  if (candles.length < 3) return fvgs;
  const minSize = settings?.fvgMinSize ?? 0;

  for (let i = 1; i < candles.length - 1; i++) {
    const prev = candles[i - 1];
    const curr = candles[i];
    const next = candles[i + 1];

    // Bullish FVG: gap between prev.low and next.high
    if (prev.low > next.high) {
      const size = prev.low - next.high;
      if (size >= minSize) {
        fvgs.push({
          id: `fvg-bull-${curr.time}`,
          type: 'bullish',
          top: prev.low,
          bottom: next.high,
          time: curr.time,
          mitigated: false,
          partial: false,
        });
      }
    }

    // Bearish FVG: gap between next.low and prev.high
    if (prev.high < next.low) {
      const size = next.low - prev.high;
      if (size >= minSize) {
        fvgs.push({
          id: `fvg-bear-${curr.time}`,
          type: 'bearish',
          top: next.low,
          bottom: prev.high,
          time: curr.time,
          mitigated: false,
          partial: false,
        });
      }
    }
  }

  return fvgs;
}

// Update FVG mitigation status based on latest candles
export function updateFVGMitigation(fvgs: FVG[], candles: Candle[]): FVG[] {
  return fvgs.map(fvg => {
    // Only check candles after the FVG formed
    const laterCandles = candles.filter(c => c.time > fvg.time);
    let mitigated = fvg.mitigated;
    let partial = fvg.partial;

    for (const c of laterCandles) {
      if (fvg.type === 'bullish') {
        // Price filled the gap from below
        if (c.low <= fvg.top && c.low > fvg.bottom) partial = true;
        if (c.low <= fvg.bottom) { mitigated = true; partial = false; break; }
      } else {
        // Bearish FVG
        if (c.high >= fvg.bottom && c.high < fvg.top) partial = true;
        if (c.high >= fvg.top) { mitigated = true; partial = false; break; }
      }
    }

    return { ...fvg, mitigated, partial };
  });
}

// ── Swing High/Low Detection ──────────────────────────────────────────────────
function getSwingHighs(candles: Candle[], lookback = 3): Array<{ price: number; time: number; idx: number }> {
  const swings = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    const c = candles[i];
    let isHigh = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j !== i && candles[j].high >= c.high) { isHigh = false; break; }
    }
    if (isHigh) swings.push({ price: c.high, time: c.time, idx: i });
  }
  return swings;
}

function getSwingLows(candles: Candle[], lookback = 3): Array<{ price: number; time: number; idx: number }> {
  const swings = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    const c = candles[i];
    let isLow = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j !== i && candles[j].low <= c.low) { isLow = false; break; }
    }
    if (isLow) swings.push({ price: c.low, time: c.time, idx: i });
  }
  return swings;
}

// Public wrappers (no idx) for external callers
export function getSwingHighsPublic(candles: Candle[], lookback = 3) {
  return getSwingHighs(candles, lookback).map(s => ({ price: s.price, time: s.time }));
}
export function getSwingLowsPublic(candles: Candle[], lookback = 3) {
  return getSwingLows(candles, lookback).map(s => ({ price: s.price, time: s.time }));
}

// ── Liquidity Sweep Detection ─────────────────────────────────────────────────
export function detectLiquiditySweeps(
  candles: Candle[],
  lookback = 3,
  settings?: Pick<ScannerSettings, 'sweepBuffer'>
): LiquiditySweep[] {
  const sweeps: LiquiditySweep[] = [];
  if (candles.length < lookback * 2 + 2) return sweeps;
  const buffer = settings?.sweepBuffer ?? 0;

  const swingHighs = getSwingHighs(candles, lookback);
  const swingLows = getSwingLows(candles, lookback);

  // For each swing high, check if a later candle wicks above (+ buffer) then closes back below
  for (const sh of swingHighs) {
    const laterCandles = candles.filter(c => c.time > sh.time);
    for (const c of laterCandles) {
      if (c.high > sh.price + buffer && c.close < sh.price) {
        sweeps.push({
          id: `sweep-buy-${c.time}`,
          type: 'buy_side',
          level: sh.price,
          time: sh.time,
          sweptTime: c.time,
        });
        break;
      }
    }
  }

  // For each swing low, check if a later candle wicks below (- buffer) then closes back above
  for (const sl of swingLows) {
    const laterCandles = candles.filter(c => c.time > sl.time);
    for (const c of laterCandles) {
      if (c.low < sl.price - buffer && c.close > sl.price) {
        sweeps.push({
          id: `sweep-sell-${c.time}`,
          type: 'sell_side',
          level: sl.price,
          time: sl.time,
          sweptTime: c.time,
        });
        break;
      }
    }
  }

  return sweeps;
}

// ── MSS / BOS / CHOCH Detection ───────────────────────────────────────────────
export function detectMSS(candles: Candle[], lookback = 3): MSS[] {
  const results: MSS[] = [];
  if (candles.length < lookback * 2 + 2) return results;

  const swingHighs = getSwingHighs(candles, lookback);
  const swingLows = getSwingLows(candles, lookback);

  // Bullish MSS: price breaks above a swing high (BOS if in uptrend, CHOCH if in downtrend)
  for (const sh of swingHighs) {
    const laterCandles = candles.filter(c => c.time > sh.time);
    for (const c of laterCandles) {
      if (c.close > sh.price) {
        // Determine BOS vs CHOCH: if we recently had a lower low, it's CHOCH
        const prevLows = swingLows.filter(sl => sl.time < c.time).slice(-3);
        const isChoch = prevLows.length >= 2 && prevLows[prevLows.length - 1].price < prevLows[prevLows.length - 2].price;
        results.push({
          id: `mss-bull-${c.time}`,
          type: 'bullish',
          level: sh.price,
          time: c.time,
          kind: isChoch ? 'CHOCH' : 'BOS',
        });
        break;
      }
    }
  }

  // Bearish MSS: price breaks below a swing low
  for (const sl of swingLows) {
    const laterCandles = candles.filter(c => c.time > sl.time);
    for (const c of laterCandles) {
      if (c.close < sl.price) {
        const prevHighs = swingHighs.filter(sh => sh.time < c.time).slice(-3);
        const isChoch = prevHighs.length >= 2 && prevHighs[prevHighs.length - 1].price > prevHighs[prevHighs.length - 2].price;
        results.push({
          id: `mss-bear-${c.time}`,
          type: 'bearish',
          level: sl.price,
          time: c.time,
          kind: isChoch ? 'CHOCH' : 'BOS',
        });
        break;
      }
    }
  }

  return results;
}

// ── HTF Bias ──────────────────────────────────────────────────────────────────
export function calculateHTFBias(candles: Candle[]): HTFBias {
  if (candles.length < 10) return 'neutral';

  const recent = candles.slice(-20);
  const swingHighs = getSwingHighs(recent, 2);
  const swingLows = getSwingLows(recent, 2);

  if (swingHighs.length < 2 || swingLows.length < 2) return 'neutral';

  const lastHigh = swingHighs[swingHighs.length - 1].price;
  const prevHigh = swingHighs[swingHighs.length - 2].price;
  const lastLow = swingLows[swingLows.length - 1].price;
  const prevLow = swingLows[swingLows.length - 2].price;

  // Higher highs + higher lows = bullish
  if (lastHigh > prevHigh && lastLow > prevLow) return 'bullish';
  // Lower highs + lower lows = bearish
  if (lastHigh < prevHigh && lastLow < prevLow) return 'bearish';
  return 'neutral';
}

// ── CRT Level from last closed HTF candle ─────────────────────────────────────
export function getLastClosedCRTLevel(candles: Candle[]): CRTLevel | null {
  if (candles.length < 2) return null;
  // Last fully closed candle is second to last (last may still be forming)
  const c = candles[candles.length - 2];
  return { high: c.high, low: c.low, close: c.close, open: c.open, time: c.time };
}

// ── Trade Zones Calculator ────────────────────────────────────────────────────
export function calculateTradeZones(
  setup: 'buy' | 'sell',
  activeFVGs: FVG[],
  lastMSS: MSS | null,
  lastSweep: LiquiditySweep | null,
  swingHighs: Array<{ price: number; time: number }>,
  swingLows: Array<{ price: number; time: number }>,
  currentPrice: number
): TradeZones | null {
  // Entry zone = best unmitigated FVG aligned with setup
  const alignedFVGs = activeFVGs.filter(f =>
    setup === 'buy' ? f.type === 'bullish' : f.type === 'bearish'
  );
  if (alignedFVGs.length === 0) return null;

  // Nearest FVG to current price
  const entryFVG = alignedFVGs.reduce((best, fvg) => {
    const mid = (fvg.top + fvg.bottom) / 2;
    const bestMid = (best.top + best.bottom) / 2;
    return Math.abs(mid - currentPrice) < Math.abs(bestMid - currentPrice) ? fvg : best;
  });

  const entryHigh = entryFVG.top;
  const entryLow = entryFVG.bottom;
  const entryMid = (entryHigh + entryLow) / 2;

  // Stop loss = MSS level invalidation, or sweep level, whichever is further
  let stopLoss: number;
  if (setup === 'buy') {
    const mssLevel = lastMSS?.level ?? null;
    const sweepLevel = lastSweep?.type === 'sell_side' ? lastSweep.level : null;
    const candidates = [mssLevel, sweepLevel, entryLow].filter((v): v is number => v !== null);
    stopLoss = Math.min(...candidates) * 0.9998; // tiny buffer below
  } else {
    const mssLevel = lastMSS?.level ?? null;
    const sweepLevel = lastSweep?.type === 'buy_side' ? lastSweep.level : null;
    const candidates = [mssLevel, sweepLevel, entryHigh].filter((v): v is number => v !== null);
    stopLoss = Math.max(...candidates) * 1.0002;
  }

  const risk = Math.abs(entryMid - stopLoss);
  if (risk === 0) return null;

  // TP1 = nearest opposing liquidity pool (swing high/low on opposite side)
  // TP2 = 2nd opposing swing (2x+ RR)
  let tp1: number, tp2: number;

  if (setup === 'buy') {
    // Look for swing highs above entry
    const above = swingHighs.filter(h => h.price > entryMid).sort((a, b) => a.price - b.price);
    tp1 = above[0]?.price ?? entryMid + risk * 1.5;
    tp2 = above[1]?.price ?? entryMid + risk * 3;
  } else {
    // Look for swing lows below entry
    const below = swingLows.filter(l => l.price < entryMid).sort((a, b) => b.price - a.price);
    tp1 = below[0]?.price ?? entryMid - risk * 1.5;
    tp2 = below[1]?.price ?? entryMid - risk * 3;
  }

  const rr1 = parseFloat((Math.abs(tp1 - entryMid) / risk).toFixed(2));
  const rr2 = parseFloat((Math.abs(tp2 - entryMid) / risk).toFixed(2));

  return { entryHigh, entryLow, stopLoss, tp1, tp2, rr1, rr2 };
}

// ── Full Setup Validator ───────────────────────────────────────────────────────
export function validateSetup(
  htfCandles: Candle[],
  ltfCandles: Candle[],
  settings?: ScannerSettings
): SetupStatus {
  const bias = calculateHTFBias(htfCandles);
  const ltfSweeps = detectLiquiditySweeps(ltfCandles, 2, settings);
  const ltfMSS = detectMSS(ltfCandles, 2);
  const ltfFVGs = detectFVGs(ltfCandles, settings);
  const updatedFVGs = updateFVGMitigation(ltfFVGs, ltfCandles);

  // Expiry window — default 30 candles if not set
  const expiryCandles = settings?.setupExpiryCandles ?? 30;
  const recentTime = ltfCandles.length > 0
    ? ltfCandles[Math.max(0, ltfCandles.length - expiryCandles)]?.time ?? 0
    : 0;

  const recentSweeps = ltfSweeps.filter(s => s.sweptTime >= recentTime);
  const recentMSS = ltfMSS.filter(m => m.time >= recentTime);
  const activeFVGs = updatedFVGs.filter(f => !f.mitigated && f.time >= recentTime);

  const lastSweep = recentSweeps[recentSweeps.length - 1] ?? null;
  const lastMSS = recentMSS[recentMSS.length - 1] ?? null;

  const sweepDetected = !!lastSweep;
  const sweepType = lastSweep?.type ?? null;
  const mssConfirmed = !!lastMSS;
  const mssKind = lastMSS?.kind ?? null;
  const fvgPresent = activeFVGs.length > 0;

  let activeSetup: 'buy' | 'sell' | null = null;
  let conditionsMet = 0;

  if (bias === 'bullish') {
    if (bias === 'bullish') conditionsMet++;
    if (sweepType === 'sell_side') conditionsMet++;
    if (lastMSS?.type === 'bullish') conditionsMet++;
    if (activeFVGs.some(f => f.type === 'bullish')) conditionsMet++;
    if (conditionsMet >= 3) activeSetup = 'buy';
  } else if (bias === 'bearish') {
    if (bias === 'bearish') conditionsMet++;
    if (sweepType === 'buy_side') conditionsMet++;
    if (lastMSS?.type === 'bearish') conditionsMet++;
    if (activeFVGs.some(f => f.type === 'bearish')) conditionsMet++;
    if (conditionsMet >= 3) activeSetup = 'sell';
  }

  // Compute trade zones if we have an active setup
  let tradeZones: TradeZones | null = null;
  if (activeSetup && ltfCandles.length > 0) {
    const currentPrice = ltfCandles[ltfCandles.length - 1].close;
    const swingHighs = getSwingHighsPublic(ltfCandles, 3);
    const swingLows = getSwingLowsPublic(ltfCandles, 3);
    tradeZones = calculateTradeZones(
      activeSetup, activeFVGs, lastMSS, lastSweep,
      swingHighs, swingLows, currentPrice
    );
  }

  return {
    bias,
    sweepDetected,
    sweepType,
    mssConfirmed,
    mssKind,
    fvgPresent,
    activeSetup,
    conditionsMet,
    tradeZones,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 2 ENGINE UPGRADES — Equal Highs/Lows, Old H/L, Session H/L, RSI, Trendlines
// ═══════════════════════════════════════════════════════════════════════════════

// ── Equal Highs / Equal Lows ─────────────────────────────────────────────────
export type EqualLevel = {
  id: string;
  type: 'eqh' | 'eql';
  price: number;
  time1: number;
  time2: number;   // most recent touch
  touches: number;
  swept: boolean;
};

/**
 * Detect Equal Highs (EQH) and Equal Lows (EQL).
 * Two or more swing highs/lows within `tolerance` (default 0.05%) of each other.
 */
export function detectEqualLevels(
  candles: Candle[],
  lookback = 3,
  tolerancePct = 0.05
): EqualLevel[] {
  if (candles.length < lookback * 2 + 2) return [];

  const swingHighs = getSwingHighs(candles, lookback);
  const swingLows  = getSwingLows(candles, lookback);
  const results: EqualLevel[] = [];

  // Group swing highs that are within tolerance of each other
  const usedHigh = new Set<number>();
  for (let i = 0; i < swingHighs.length; i++) {
    if (usedHigh.has(i)) continue;
    const a = swingHighs[i];
    const tol = a.price * (tolerancePct / 100);
    const group = [a];
    for (let j = i + 1; j < swingHighs.length; j++) {
      if (Math.abs(swingHighs[j].price - a.price) <= tol) {
        group.push(swingHighs[j]);
        usedHigh.add(j);
      }
    }
    if (group.length >= 2) {
      const avgPrice = group.reduce((s, g) => s + g.price, 0) / group.length;
      const lastTouch = group[group.length - 1];
      // Check if swept by a later candle
      const laterCandles = candles.filter(c => c.time > lastTouch.time);
      const swept = laterCandles.some(c => c.high > avgPrice);
      results.push({
        id: `eqh-${a.time}`,
        type: 'eqh',
        price: avgPrice,
        time1: a.time,
        time2: lastTouch.time,
        touches: group.length,
        swept,
      });
    }
  }

  // Group swing lows
  const usedLow = new Set<number>();
  for (let i = 0; i < swingLows.length; i++) {
    if (usedLow.has(i)) continue;
    const a = swingLows[i];
    const tol = a.price * (tolerancePct / 100);
    const group = [a];
    for (let j = i + 1; j < swingLows.length; j++) {
      if (Math.abs(swingLows[j].price - a.price) <= tol) {
        group.push(swingLows[j]);
        usedLow.add(j);
      }
    }
    if (group.length >= 2) {
      const avgPrice = group.reduce((s, g) => s + g.price, 0) / group.length;
      const lastTouch = group[group.length - 1];
      const laterCandles = candles.filter(c => c.time > lastTouch.time);
      const swept = laterCandles.some(c => c.low < avgPrice);
      results.push({
        id: `eql-${a.time}`,
        type: 'eql',
        price: avgPrice,
        time1: a.time,
        time2: lastTouch.time,
        touches: group.length,
        swept,
      });
    }
  }

  return results;
}

// ── Old High / Old Low ────────────────────────────────────────────────────────
export type OldLevel = {
  type: 'old_high' | 'old_low';
  price: number;
  time: number;
  raided: boolean; // price has since traded through it
};

/**
 * Find the most significant old high and old low in the recent history.
 * "Old" = swing that formed at least `minAge` candles ago and is the most extreme.
 */
export function detectOldLevels(candles: Candle[], lookback = 3, minAge = 5): OldLevel[] {
  if (candles.length < lookback * 2 + minAge + 2) return [];

  // Only consider swings that are at least minAge candles from the end
  const cutoff = candles[candles.length - minAge]?.time ?? 0;
  const allHighs = getSwingHighs(candles, lookback).filter(s => s.time <= cutoff);
  const allLows  = getSwingLows(candles, lookback).filter(s => s.time <= cutoff);

  const results: OldLevel[] = [];

  if (allHighs.length > 0) {
    // Most significant = highest swing high
    const dominant = allHighs.reduce((a, b) => b.price > a.price ? b : a);
    const laterCandles = candles.filter(c => c.time > dominant.time);
    const raided = laterCandles.some(c => c.high > dominant.price);
    results.push({ type: 'old_high', price: dominant.price, time: dominant.time, raided });
  }

  if (allLows.length > 0) {
    const dominant = allLows.reduce((a, b) => b.price < a.price ? b : a);
    const laterCandles = candles.filter(c => c.time > dominant.time);
    const raided = laterCandles.some(c => c.low < dominant.price);
    results.push({ type: 'old_low', price: dominant.price, time: dominant.time, raided });
  }

  return results;
}

// ── Session High / Low ────────────────────────────────────────────────────────
export type SessionHL = {
  session: 'Asia' | 'London' | 'New York';
  high: number;
  low: number;
  startTime: number;
  endTime: number;
  swept_high: boolean;
  swept_low: boolean;
};

const SESSION_DEF = [
  { session: 'Asia'     as const, startH: 0,  endH: 8  },
  { session: 'London'   as const, startH: 7,  endH: 16 },
  { session: 'New York' as const, startH: 12, endH: 21 },
];

/**
 * Compute the High/Low for each of the last N sessions.
 * Returns the previous (closed) session H/L for each session type.
 */
export function detectSessionLevels(candles: Candle[], pastSessions = 2): SessionHL[] {
  if (candles.length === 0) return [];

  const results: SessionHL[] = [];

  for (const def of SESSION_DEF) {
    // Collect all candles in past sessions for this type
    const sessions: { start: number; end: number; candles: Candle[] }[] = [];

    // Find distinct days in the data
    const days = new Set(candles.map(c => Math.floor(c.time / 86400) * 86400));
    const sortedDays = Array.from(days).sort((a, b) => a - b);

    for (const day of sortedDays) {
      let startSec = day + def.startH * 3600;
      let endSec   = day + def.endH   * 3600;
      // Handle London/NY overlap — use strict window
      const sessCandles = candles.filter(c => c.time >= startSec && c.time < endSec);
      if (sessCandles.length >= 2) {
        sessions.push({ start: startSec, end: endSec, candles: sessCandles });
      }
    }

    // Take the N most recent CLOSED sessions (not the current one forming)
    const now = Date.now() / 1000;
    const closedSessions = sessions.filter(s => s.end < now).slice(-pastSessions);

    for (const s of closedSessions) {
      const high = Math.max(...s.candles.map(c => c.high));
      const low  = Math.min(...s.candles.map(c => c.low));
      // Check if later candles swept the levels
      const later = candles.filter(c => c.time >= s.end);
      results.push({
        session: def.session,
        high, low,
        startTime: s.start,
        endTime: s.end,
        swept_high: later.some(c => c.high > high),
        swept_low:  later.some(c => c.low < low),
      });
    }
  }

  return results;
}

// ── RSI Calculation ───────────────────────────────────────────────────────────
export type RSIResult = {
  value: number;          // 0-100
  momentum: 'bullish' | 'bearish' | 'neutral';
  overbought: boolean;    // > 70
  oversold: boolean;      // < 30
  divergence: 'bullish' | 'bearish' | null;
};

export function calculateRSI(candles: Candle[], period = 14): RSIResult | null {
  if (candles.length < period + 2) return null;

  const closes = candles.map(c => c.close);
  const changes = closes.slice(1).map((c, i) => c - closes[i]);

  // Wilder smoothing
  let avgGain = 0, avgLoss = 0;
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i];
    else avgLoss += Math.abs(changes[i]);
  }
  avgGain /= period;
  avgLoss /= period;

  for (let i = period; i < changes.length; i++) {
    const g = changes[i] > 0 ? changes[i] : 0;
    const l = changes[i] < 0 ? Math.abs(changes[i]) : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
  }

  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  const rsi = 100 - (100 / (1 + rs));

  // Divergence: compare last 2 swings of price vs RSI-derived momentum
  let divergence: 'bullish' | 'bearish' | null = null;
  const recentLen = Math.min(30, candles.length);
  const recent = candles.slice(-recentLen);

  // Simple divergence: price makes lower low but closes higher → bullish div
  const priceHigh = Math.max(...recent.slice(-10).map(c => c.high));
  const priceLow  = Math.min(...recent.slice(-10).map(c => c.low));
  const priceHighPrev = Math.max(...recent.slice(-20, -10).map(c => c.high));
  const priceLowPrev  = Math.min(...recent.slice(-20, -10).map(c => c.low));

  if (priceLow < priceLowPrev && rsi > 35) divergence = 'bullish';
  else if (priceHigh > priceHighPrev && rsi < 65) divergence = 'bearish';

  return {
    value: parseFloat(rsi.toFixed(2)),
    momentum: rsi > 55 ? 'bullish' : rsi < 45 ? 'bearish' : 'neutral',
    overbought: rsi > 70,
    oversold: rsi < 30,
    divergence,
  };
}

// ── Trendline Liquidity ───────────────────────────────────────────────────────
export type TrendlineLiquidity = {
  id: string;
  type: 'descending' | 'ascending'; // descending = bearish trendline, ascending = bullish
  point1: { time: number; price: number };
  point2: { time: number; price: number };
  slope: number;        // price change per second
  swept: boolean;       // price has broken through the trendline
  sweepTime?: number;
};

/**
 * Detect trendline liquidity — diagonal zones formed by connecting swing highs (descending)
 * or swing lows (ascending).
 */
export function detectTrendlineLiquidity(candles: Candle[], lookback = 3): TrendlineLiquidity[] {
  if (candles.length < lookback * 4 + 2) return [];

  const swingHighs = getSwingHighs(candles, lookback);
  const swingLows  = getSwingLows(candles, lookback);
  const results: TrendlineLiquidity[] = [];

  // Descending trendline: connect the 2 most recent swing highs that form a lower high
  if (swingHighs.length >= 2) {
    const last2 = swingHighs.slice(-2);
    if (last2[1].price < last2[0].price) {
      // Descending: lower high — this is a bearish trendline with sell-stop liquidity above
      const p1 = last2[0];
      const p2 = last2[1];
      const slope = (p2.price - p1.price) / (p2.time - p1.time);

      // Check if price has swept above this trendline since p2
      const laterCandles = candles.filter(c => c.time > p2.time);
      let swept = false;
      let sweepTime: number | undefined;
      for (const c of laterCandles) {
        const trendlinePrice = p1.price + slope * (c.time - p1.time);
        if (c.high > trendlinePrice) {
          swept = true;
          sweepTime = c.time;
          break;
        }
      }

      results.push({
        id: `tl-desc-${p1.time}`,
        type: 'descending',
        point1: { time: p1.time, price: p1.price },
        point2: { time: p2.time, price: p2.price },
        slope,
        swept,
        sweepTime,
      });
    }
  }

  // Ascending trendline: connect the 2 most recent swing lows that form a higher low
  if (swingLows.length >= 2) {
    const last2 = swingLows.slice(-2);
    if (last2[1].price > last2[0].price) {
      const p1 = last2[0];
      const p2 = last2[1];
      const slope = (p2.price - p1.price) / (p2.time - p1.time);

      const laterCandles = candles.filter(c => c.time > p2.time);
      let swept = false;
      let sweepTime: number | undefined;
      for (const c of laterCandles) {
        const trendlinePrice = p1.price + slope * (c.time - p1.time);
        if (c.low < trendlinePrice) {
          swept = true;
          sweepTime = c.time;
          break;
        }
      }

      results.push({
        id: `tl-asc-${p1.time}`,
        type: 'ascending',
        point1: { time: p1.time, price: p1.price },
        point2: { time: p2.time, price: p2.price },
        slope,
        swept,
        sweepTime,
      });
    }
  }

  return results;
}

// ── Enhanced SetupStatus with new fields ──────────────────────────────────────
export type EnhancedSetupStatus = SetupStatus & {
  rsi: RSIResult | null;
  eqLevels: EqualLevel[];
  oldLevels: OldLevel[];
  sessionLevels: SessionHL[];
  trendlines: TrendlineLiquidity[];
  // Upgraded TP targets using liquidity pools
  nearestLiquidityTP: number | null;
};

/**
 * Full enhanced setup validation — wraps validateSetup and adds all new data.
 */
export function validateSetupEnhanced(
  htfCandles: Candle[],
  ltfCandles: Candle[],
  settings?: ScannerSettings
): EnhancedSetupStatus {
  const base = validateSetup(htfCandles, ltfCandles, settings);

  const rsi           = calculateRSI(ltfCandles, settings?.rsiPeriod ?? 14);
  const eqLevels      = detectEqualLevels(ltfCandles, 3, 0.05);
  const oldLevels     = detectOldLevels(ltfCandles, 3, 10);
  const sessionLevels = detectSessionLevels([...htfCandles, ...ltfCandles].sort((a,b) => a.time - b.time));
  const trendlines    = detectTrendlineLiquidity(ltfCandles, 3);

  // Find nearest liquidity TP (EQH for sells, EQL for buys)
  let nearestLiquidityTP: number | null = null;
  if (base.activeSetup && ltfCandles.length > 0) {
    const price = ltfCandles[ltfCandles.length - 1].close;
    if (base.activeSetup === 'buy') {
      const targets = [
        ...eqLevels.filter(e => e.type === 'eqh' && !e.swept && e.price > price).map(e => e.price),
        ...oldLevels.filter(o => o.type === 'old_high' && !o.raided && o.price > price).map(o => o.price),
        ...sessionLevels.filter(s => !s.swept_high && s.high > price).map(s => s.high),
      ].sort((a, b) => a - b);
      nearestLiquidityTP = targets[0] ?? null;
    } else {
      const targets = [
        ...eqLevels.filter(e => e.type === 'eql' && !e.swept && e.price < price).map(e => e.price),
        ...oldLevels.filter(o => o.type === 'old_low' && !o.raided && o.price < price).map(o => o.price),
        ...sessionLevels.filter(s => !s.swept_low && s.low < price).map(s => s.low),
      ].sort((a, b) => b - a);
      nearestLiquidityTP = targets[0] ?? null;
    }
  }

  return {
    ...base,
    rsi,
    eqLevels,
    oldLevels,
    sessionLevels,
    trendlines,
    nearestLiquidityTP,
  };
}
