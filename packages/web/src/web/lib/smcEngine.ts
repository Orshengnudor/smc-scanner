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

// ── Liquidity Stack Detection ─────────────────────────────────────────────────
// A liquidity stack is a cluster of swing highs OR swing lows that sit within
// a tight price band (tolerance = 0.15% of price by default). These are zones
// where stop-losses and pending orders pool together — high-value targets.

export type LiquidityStack = {
  id: string;
  type: 'highs' | 'lows';       // cluster of swing highs or swing lows
  priceHigh: number;             // top of the cluster band
  priceLow: number;              // bottom of the cluster band
  midPrice: number;              // centre of the cluster
  count: number;                 // how many levels are stacked
  levels: Array<{ price: number; time: number }>; // individual levels
  touched: boolean;              // price has entered the zone
  time: number;                  // time of the most recent level in cluster
};

export function detectLiquidityStacks(
  candles: Candle[],
  lookback = 3,
  tolerancePct = 0.15          // % of price — 0.15% works well for VIX synthetics
): LiquidityStack[] {
  if (candles.length < lookback * 2 + 2) return [];

  const swingHighs = getSwingHighsPublic(candles, lookback);
  const swingLows  = getSwingLowsPublic(candles, lookback);
  const lastPrice  = candles[candles.length - 1].close;
  const tol        = lastPrice * (tolerancePct / 100);

  const stacks: LiquidityStack[] = [];

  // Cluster swing highs
  const usedH = new Set<number>();
  for (let i = 0; i < swingHighs.length; i++) {
    if (usedH.has(i)) continue;
    const anchor = swingHighs[i];
    const cluster = [anchor];
    usedH.add(i);
    for (let j = i + 1; j < swingHighs.length; j++) {
      if (usedH.has(j)) continue;
      if (Math.abs(swingHighs[j].price - anchor.price) <= tol) {
        cluster.push(swingHighs[j]);
        usedH.add(j);
      }
    }
    if (cluster.length >= 2) {
      const prices = cluster.map(c => c.price);
      const hi = Math.max(...prices);
      const lo = Math.min(...prices);
      const mid = (hi + lo) / 2;
      const latest = cluster.reduce((a, b) => b.time > a.time ? b : a);
      // check if price has already touched this zone
      const touched = candles.some(c => c.high >= lo && c.low <= hi && c.time > latest.time);
      stacks.push({
        id: `liqstack-H-${latest.time}`,
        type: 'highs',
        priceHigh: hi + tol * 0.3,   // slight buffer above
        priceLow:  lo - tol * 0.3,
        midPrice: mid,
        count: cluster.length,
        levels: cluster,
        touched,
        time: latest.time,
      });
    }
  }

  // Cluster swing lows
  const usedL = new Set<number>();
  for (let i = 0; i < swingLows.length; i++) {
    if (usedL.has(i)) continue;
    const anchor = swingLows[i];
    const cluster = [anchor];
    usedL.add(i);
    for (let j = i + 1; j < swingLows.length; j++) {
      if (usedL.has(j)) continue;
      if (Math.abs(swingLows[j].price - anchor.price) <= tol) {
        cluster.push(swingLows[j]);
        usedL.add(j);
      }
    }
    if (cluster.length >= 2) {
      const prices = cluster.map(c => c.price);
      const hi = Math.max(...prices);
      const lo = Math.min(...prices);
      const mid = (hi + lo) / 2;
      const latest = cluster.reduce((a, b) => b.time > a.time ? b : a);
      const touched = candles.some(c => c.high >= lo && c.low <= hi && c.time > latest.time);
      stacks.push({
        id: `liqstack-L-${latest.time}`,
        type: 'lows',
        priceHigh: hi + tol * 0.3,
        priceLow:  lo - tol * 0.3,
        midPrice: mid,
        count: cluster.length,
        levels: cluster,
        touched,
        time: latest.time,
      });
    }
  }

  return stacks;
}
