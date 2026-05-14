import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const COLORS = {
  bg: '#000000',
  surface: '#0a0a0a',
  border: '#1e1e1e',
  bull: '#00ff88',
  bear: '#ff3b3b',
  neutral: '#888888',
  label: '#444444',
  white: '#ffffff',
  sweep: '#ff9900',
  mss: '#f5c518',
  crt: '#4488ff',
};

type Candle = { time: number; open: number; high: number; low: number; close: number };
type HTFBias = 'bullish' | 'bearish' | 'neutral';
type SetupStatus = {
  bias: HTFBias;
  sweepDetected: boolean;
  sweepType: 'buy_side' | 'sell_side' | null;
  mssConfirmed: boolean;
  mssKind: 'BOS' | 'CHOCH' | null;
  fvgPresent: boolean;
  activeSetup: 'buy' | 'sell' | null;
  conditionsMet: number;
};

const SYMBOLS = [
  { value: '1HZ10V', label: 'V10 (1s)' },
  { value: 'R_10', label: 'V10' },
  { value: '1HZ25V', label: 'V25 (1s)' },
  { value: 'R_25', label: 'V25' },
  { value: '1HZ50V', label: 'V50 (1s)' },
  { value: 'R_50', label: 'V50' },
  { value: '1HZ75V', label: 'V75 (1s)' },
  { value: 'R_75', label: 'V75' },
  { value: '1HZ100V', label: 'V100 (1s)' },
  { value: 'R_100', label: 'V100' },
  { value: '1HZ90V', label: 'V90 (1s)' },
];

function getSwingHighs(candles: Candle[], lb = 3) {
  const r = [];
  for (let i = lb; i < candles.length - lb; i++) {
    let ok = true;
    for (let j = i - lb; j <= i + lb; j++) if (j !== i && candles[j].high >= candles[i].high) { ok = false; break; }
    if (ok) r.push({ price: candles[i].high, time: candles[i].time });
  }
  return r;
}

function getSwingLows(candles: Candle[], lb = 3) {
  const r = [];
  for (let i = lb; i < candles.length - lb; i++) {
    let ok = true;
    for (let j = i - lb; j <= i + lb; j++) if (j !== i && candles[j].low <= candles[i].low) { ok = false; break; }
    if (ok) r.push({ price: candles[i].low, time: candles[i].time });
  }
  return r;
}

function calcBias(candles: Candle[]): HTFBias {
  if (candles.length < 10) return 'neutral';
  const r = candles.slice(-20);
  const sh = getSwingHighs(r, 2);
  const sl = getSwingLows(r, 2);
  if (sh.length < 2 || sl.length < 2) return 'neutral';
  const lh = sh[sh.length - 1].price, ph = sh[sh.length - 2].price;
  const ll = sl[sl.length - 1].price, pl = sl[sl.length - 2].price;
  if (lh > ph && ll > pl) return 'bullish';
  if (lh < ph && ll < pl) return 'bearish';
  return 'neutral';
}

function detectFVG(candles: Candle[]) {
  for (let i = 1; i < candles.length - 1; i++) {
    const prev = candles[i - 1], next = candles[i + 1];
    if (prev.low > next.high) return 'bullish';
    if (prev.high < next.low) return 'bearish';
  }
  return null;
}

function detectSweep(candles: Candle[]) {
  const sh = getSwingHighs(candles, 3);
  const sl = getSwingLows(candles, 3);
  const recent = candles.slice(-5);
  for (const c of recent) {
    for (const h of sh) if (c.time > h.time && c.high > h.price && c.close < h.price) return 'buy_side';
    for (const l of sl) if (c.time > l.time && c.low < l.price && c.close > l.price) return 'sell_side';
  }
  return null;
}

function detectMSS(candles: Candle[]) {
  const sh = getSwingHighs(candles, 3);
  const sl = getSwingLows(candles, 3);
  const recent = candles.slice(-5);
  for (const c of recent) {
    for (const h of sh) if (c.time > h.time && c.close > h.price) return { type: 'bullish', kind: 'BOS' };
    for (const l of sl) if (c.time > l.time && c.close < l.price) return { type: 'bearish', kind: 'BOS' };
  }
  return null;
}

function computeSetup(htf: Candle[], ltf: Candle[]): SetupStatus {
  const bias = calcBias(htf);
  const sweepType = detectSweep(ltf) as 'buy_side' | 'sell_side' | null;
  const mssResult = detectMSS(ltf);
  const fvgType = detectFVG(ltf);

  const sweepDetected = !!sweepType;
  const mssConfirmed = !!mssResult;
  const fvgPresent = !!fvgType;
  const mssKind = (mssResult?.kind as 'BOS' | 'CHOCH' | null) ?? null;

  let conditionsMet = 0;
  let activeSetup: 'buy' | 'sell' | null = null;

  if (bias === 'bullish') {
    if (bias === 'bullish') conditionsMet++;
    if (sweepType === 'sell_side') conditionsMet++;
    if (mssResult?.type === 'bullish') conditionsMet++;
    if (fvgType === 'bullish') conditionsMet++;
    if (conditionsMet >= 3) activeSetup = 'buy';
  } else if (bias === 'bearish') {
    if (bias === 'bearish') conditionsMet++;
    if (sweepType === 'buy_side') conditionsMet++;
    if (mssResult?.type === 'bearish') conditionsMet++;
    if (fvgType === 'bearish') conditionsMet++;
    if (conditionsMet >= 3) activeSetup = 'sell';
  }

  return { bias, sweepDetected, sweepType, mssConfirmed, mssKind, fvgPresent, activeSetup, conditionsMet };
}

const DERIV_TOKEN = process.env.EXPO_PUBLIC_DERIV_TOKEN || '';

function useScannerData(symbol: string, htfGran: number, ltfGran: number) {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [connected, setConnected] = useState(false);
  const htfRef = useRef<Map<number, Candle>>(new Map());
  const ltfRef = useRef<Map<number, Candle>>(new Map());
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    htfRef.current = new Map();
    ltfRef.current = new Map();
    setStatus(null);

    const ws = new WebSocket('wss://ws.binaryws.com/websockets/v3?app_id=1089');
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      if (DERIV_TOKEN) {
        ws.send(JSON.stringify({ authorize: DERIV_TOKEN }));
      } else {
        subscribe();
      }
    };

    ws.onmessage = (e) => {
      const d = JSON.parse(e.data);
      if (d.msg_type === 'authorize' && !d.error) { subscribe(); return; }
      if (d.msg_type === 'candles' && d.candles) {
        const map = d.echo_req?.granularity === htfGran ? htfRef.current : ltfRef.current;
        d.candles.forEach((c: any) => map.set(c.epoch, {
          time: c.epoch, open: +c.open, high: +c.high, low: +c.low, close: +c.close,
        }));
        tryCompute();
      }
      if (d.msg_type === 'ohlc' && d.ohlc) {
        const o = d.ohlc;
        const map = +o.granularity === htfGran ? htfRef.current : ltfRef.current;
        map.set(o.open_time, { time: o.open_time, open: +o.open, high: +o.high, low: +o.low, close: +o.close });
        tryCompute();
      }
    };

    ws.onclose = () => setConnected(false);

    function subscribe() {
      [htfGran, ltfGran].forEach(gran => {
        ws.send(JSON.stringify({
          ticks_history: symbol, adjust_start_time: 1, count: 200,
          end: 'latest', granularity: gran, style: 'candles', subscribe: 1,
        }));
      });
    }

    function tryCompute() {
      const htf = Array.from(htfRef.current.values()).sort((a, b) => a.time - b.time);
      const ltf = Array.from(ltfRef.current.values()).sort((a, b) => a.time - b.time);
      if (htf.length > 5 && ltf.length > 5) {
        setStatus(computeSetup(htf, ltf));
      }
    }

    const ping = setInterval(() => { if (ws.readyState === 1) ws.send(JSON.stringify({ ping: 1 })); }, 30000);

    return () => {
      clearInterval(ping);
      ws.close();
    };
  }, [symbol, htfGran, ltfGran]);

  return { status, connected };
}

export default function ScannerScreen() {
  const [symbol, setSymbol] = useState('1HZ10V');
  const { status, connected } = useScannerData(symbol, 14400, 300);

  const biasColor = !status ? COLORS.label : status.bias === 'bullish' ? COLORS.bull : status.bias === 'bearish' ? COLORS.bear : COLORS.label;
  const setupColor = !status?.activeSetup ? COLORS.label : status.activeSetup === 'buy' ? COLORS.bull : COLORS.bear;

  const conditions = status ? [
    { label: 'HTF BIAS', met: status.bias !== 'neutral', value: status.bias.toUpperCase(), color: biasColor },
    { label: 'LIQ SWEEP', met: status.sweepDetected, value: status.sweepType ? (status.sweepType === 'buy_side' ? 'BSL SWEPT' : 'SSL SWEPT') : 'NONE', color: status.sweepDetected ? COLORS.sweep : COLORS.label },
    { label: 'MSS / BOS', met: status.mssConfirmed, value: status.mssKind ?? 'NONE', color: status.mssConfirmed ? COLORS.mss : COLORS.label },
    { label: 'FVG', met: status.fvgPresent, value: status.fvgPresent ? 'ACTIVE' : 'NONE', color: status.fvgPresent ? COLORS.bull : COLORS.label },
  ] : [];

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.logo}>SMC▸ SCANNER</Text>
        <View style={[styles.dot, { backgroundColor: connected ? COLORS.bull : COLORS.bear }]} />
        <Text style={{ color: connected ? COLORS.bull : COLORS.bear, fontSize: 10 }}>
          {connected ? 'LIVE' : 'OFF'}
        </Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12 }}>
        {/* Symbol selector */}
        <Text style={styles.sectionLabel}>SYMBOL</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
          <View style={styles.chipRow}>
            {SYMBOLS.map(s => (
              <TouchableOpacity
                key={s.value}
                style={[styles.chip, symbol === s.value && styles.chipActive]}
                onPress={() => setSymbol(s.value)}
              >
                <Text style={[styles.chipText, symbol === s.value && styles.chipTextActive]}>{s.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {/* Active Setup */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>ACTIVE SETUP</Text>
          <Text style={[styles.setupText, { color: setupColor }]}>
            {status?.activeSetup ? `${status.activeSetup.toUpperCase()} SETUP` : 'NO SETUP'}
          </Text>
          <Text style={styles.condCount}>
            {status ? `${status.conditionsMet}/4 CONDITIONS MET` : 'LOADING...'}
          </Text>
          {/* Bar */}
          <View style={styles.barBg}>
            <View style={[styles.barFill, {
              width: `${((status?.conditionsMet ?? 0) / 4) * 100}%` as any,
              backgroundColor: setupColor,
            }]} />
          </View>
        </View>

        {/* Conditions */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>CONDITIONS CHECKLIST</Text>
          {conditions.map(c => (
            <View key={c.label} style={styles.condRow}>
              <View style={styles.condLeft}>
                <View style={[styles.condDot, { backgroundColor: c.met ? c.color : COLORS.label }]} />
                <Text style={styles.condLabel}>{c.label}</Text>
              </View>
              <Text style={[styles.condValue, { color: c.color }]}>{c.value}</Text>
            </View>
          ))}
        </View>

        {/* Strategy reminder */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>SETUP LOGIC</Text>
          <Text style={styles.strategyText}>
            {'HTF BIAS → LIQ SWEEP → MSS/CHOCH → FVG ENTRY\n\nBUY: Bullish bias + SSL swept + Bullish MSS + Bullish FVG\nSELL: Bearish bias + BSL swept + Bearish MSS + Bearish FVG'}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e1e',
    backgroundColor: '#050505',
    gap: 8,
  },
  logo: { color: '#00ff88', fontSize: 13, fontWeight: '700', letterSpacing: 2, flex: 1 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  sectionLabel: { color: '#444', fontSize: 10, letterSpacing: 1, marginBottom: 6 },
  chipRow: { flexDirection: 'row', gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: '#1e1e1e' },
  chipActive: { borderColor: '#00ff88', backgroundColor: 'rgba(0,255,136,0.1)' },
  chipText: { color: '#444', fontSize: 11 },
  chipTextActive: { color: '#00ff88' },
  card: {
    borderWidth: 1,
    borderColor: '#1e1e1e',
    backgroundColor: '#050505',
    padding: 14,
    marginBottom: 12,
  },
  cardLabel: { color: '#444', fontSize: 10, letterSpacing: 1, marginBottom: 10 },
  setupText: { fontSize: 24, fontWeight: '700', letterSpacing: 1, marginBottom: 4 },
  condCount: { color: '#555', fontSize: 11, marginBottom: 8 },
  barBg: { height: 3, backgroundColor: '#1e1e1e', borderRadius: 2 },
  barFill: { height: '100%', borderRadius: 2 },
  condRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  condLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  condDot: { width: 7, height: 7, borderRadius: 4 },
  condLabel: { color: '#888', fontSize: 11, letterSpacing: 0.5 },
  condValue: { fontSize: 11, fontWeight: '600' },
  strategyText: { color: '#555', fontSize: 10, lineHeight: 18 },
});
