import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

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

const HTF_TFS = [
  { value: 900, label: '15m' },
  { value: 1800, label: '30m' },
  { value: 3600, label: '1H' },
  { value: 14400, label: '4H' },
  { value: 86400, label: '1D' },
];

const LTF_TFS = [
  { value: 60, label: '1m' },
  { value: 180, label: '3m' },
  { value: 300, label: '5m' },
  { value: 900, label: '15m' },
  { value: 1800, label: '30m' },
];

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const CHART_HEIGHT = Math.floor((SCREEN_HEIGHT - 200) / 2);

const DERIV_TOKEN = process.env.EXPO_PUBLIC_DERIV_TOKEN || '';

// Embed lightweight-charts in a WebView for mobile charts
function MobileChart({
  symbol,
  granularity,
  label,
  showCRT,
}: {
  symbol: string;
  granularity: number;
  label: string;
  showCRT?: boolean;
}) {
  const html = `
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<script src="https://unpkg.com/lightweight-charts@5.0.0/dist/lightweight-charts.standalone.production.js"></script>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #000; overflow: hidden; }
  #chart { width: 100vw; height: 100vh; }
  #status { position: absolute; top: 6px; left: 8px; color: #888; font-size: 10px; font-family: monospace; z-index: 10; }
</style>
</head>
<body>
<div id="chart"></div>
<div id="status">CONNECTING...</div>
<script>
const chart = LightweightCharts.createChart(document.getElementById('chart'), {
  width: window.innerWidth,
  height: window.innerHeight,
  layout: { background: { color: '#000000' }, textColor: '#888888', fontSize: 9 },
  grid: { vertLines: { color: '#111111' }, horzLines: { color: '#111111' } },
  rightPriceScale: { borderColor: '#1e1e1e' },
  timeScale: { borderColor: '#1e1e1e', timeVisible: true, secondsVisible: false },
  crosshair: { mode: 1 },
});

const series = chart.addCandlestickSeries({
  upColor: '#00ff88', downColor: '#ff3b3b',
  borderUpColor: '#00ff88', borderDownColor: '#ff3b3b',
  wickUpColor: '#00ff88', wickDownColor: '#ff3b3b',
});

window.addEventListener('resize', () => {
  chart.applyOptions({ width: window.innerWidth, height: window.innerHeight });
});

const token = '${DERIV_TOKEN}';
const symbol = '${symbol}';
const granularity = ${granularity};
const ws = new WebSocket('wss://ws.binaryws.com/websockets/v3?app_id=1089');
const candleMap = new Map();
let subId = null;

ws.onopen = () => {
  if (token) ws.send(JSON.stringify({ authorize: token }));
  else subscribe();
};

ws.onmessage = (e) => {
  const d = JSON.parse(e.data);
  if (d.msg_type === 'authorize') { subscribe(); return; }
  if (d.msg_type === 'candles' && d.candles) {
    d.candles.forEach(c => candleMap.set(c.epoch, {
      time: c.epoch, open: +c.open, high: +c.high, low: +c.low, close: +c.close
    }));
    if (d.subscription?.id) subId = d.subscription.id;
    updateChart();
    document.getElementById('status').textContent = '';
  }
  if (d.msg_type === 'ohlc' && d.ohlc) {
    const o = d.ohlc;
    candleMap.set(o.open_time, { time: o.open_time, open: +o.open, high: +o.high, low: +o.low, close: +o.close });
    updateChart();
  }
};

ws.onerror = () => { document.getElementById('status').textContent = 'ERROR'; };
ws.onclose = () => { document.getElementById('status').textContent = 'DISCONNECTED'; };

function subscribe() {
  ws.send(JSON.stringify({
    ticks_history: symbol, adjust_start_time: 1, count: 200,
    end: 'latest', granularity, style: 'candles', subscribe: 1
  }));
}

function updateChart() {
  const sorted = Array.from(candleMap.values()).sort((a, b) => a.time - b.time);
  series.setData(sorted);
}

setInterval(() => { if (ws.readyState === 1) ws.send(JSON.stringify({ ping: 1 })); }, 30000);
</script>
</body>
</html>
  `;

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <View style={styles.panelHeader}>
        <Text style={styles.panelTitle}>{label}</Text>
      </View>
      <WebView
        source={{ html }}
        style={{ flex: 1, backgroundColor: '#000' }}
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        originWhitelist={['*']}
      />
    </View>
  );
}

export default function ChartsScreen() {
  const [symbol, setSymbol] = useState('1HZ10V');
  const [htfTF, setHtfTF] = useState(14400);
  const [ltfTF, setLtfTF] = useState(300);

  const htfLabel = HTF_TFS.find(t => t.value === htfTF)?.label ?? '';
  const ltfLabel = LTF_TFS.find(t => t.value === ltfTF)?.label ?? '';
  const symLabel = SYMBOLS.find(s => s.value === symbol)?.label ?? symbol;

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.logo}>SMC▸</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
          <View style={styles.headerRow}>
            {/* Symbol */}
            <View style={styles.selectorGroup}>
              <Text style={styles.selectorLabel}>SYMBOL</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.chipRow}>
                  {SYMBOLS.map(s => (
                    <TouchableOpacity
                      key={s.value}
                      style={[styles.chip, symbol === s.value && styles.chipActive]}
                      onPress={() => setSymbol(s.value)}
                    >
                      <Text style={[styles.chipText, symbol === s.value && styles.chipTextActive]}>
                        {s.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>
          </View>
        </ScrollView>
      </View>

      {/* TF row */}
      <View style={styles.tfRow}>
        <Text style={styles.tfSectionLabel}>HTF</Text>
        {HTF_TFS.map(t => (
          <TouchableOpacity
            key={t.value}
            style={[styles.tfChip, htfTF === t.value && styles.tfChipActive]}
            onPress={() => setHtfTF(t.value)}
          >
            <Text style={[styles.tfChipText, htfTF === t.value && styles.tfChipTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
        <View style={styles.tfDivider} />
        <Text style={styles.tfSectionLabel}>LTF</Text>
        {LTF_TFS.map(t => (
          <TouchableOpacity
            key={t.value}
            style={[styles.tfChip, ltfTF === t.value && styles.tfChipActive]}
            onPress={() => setLtfTF(t.value)}
          >
            <Text style={[styles.tfChipText, ltfTF === t.value && styles.tfChipTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Charts */}
      <View style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <View style={{ flex: 1, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
          <MobileChart
            symbol={symbol}
            granularity={htfTF}
            label={`${symLabel} — ${htfLabel} (HTF)`}
          />
        </View>
        <View style={{ flex: 1 }}>
          <MobileChart
            symbol={symbol}
            granularity={ltfTF}
            label={`${symLabel} — ${ltfLabel} (LTF)`}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: '#050505',
  },
  logo: {
    color: COLORS.bull,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 2,
    marginRight: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectorGroup: {
    flexDirection: 'column',
    gap: 4,
  },
  selectorLabel: {
    color: COLORS.label,
    fontSize: 9,
    letterSpacing: 1,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 6,
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: 'transparent',
  },
  chipActive: {
    borderColor: COLORS.bull,
    backgroundColor: 'rgba(0,255,136,0.1)',
  },
  chipText: {
    color: COLORS.label,
    fontSize: 10,
    fontFamily: 'System',
  },
  chipTextActive: {
    color: COLORS.bull,
  },
  tfRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: '#050505',
    gap: 4,
  },
  tfSectionLabel: {
    color: COLORS.label,
    fontSize: 9,
    letterSpacing: 1,
    marginRight: 2,
  },
  tfDivider: {
    width: 1,
    height: 14,
    backgroundColor: COLORS.border,
    marginHorizontal: 4,
  },
  tfChip: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tfChipActive: {
    borderColor: COLORS.bull,
    backgroundColor: 'rgba(0,255,136,0.1)',
  },
  tfChipText: {
    color: COLORS.label,
    fontSize: 10,
  },
  tfChipTextActive: {
    color: COLORS.bull,
  },
  panelHeader: {
    height: 26,
    paddingHorizontal: 10,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: '#050505',
  },
  panelTitle: {
    color: COLORS.neutral,
    fontSize: 10,
    fontFamily: 'System',
    letterSpacing: 0.5,
  },
});
