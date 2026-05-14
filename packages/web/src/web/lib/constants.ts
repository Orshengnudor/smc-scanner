export const SYMBOLS = [
  { value: 'R_10', label: 'Volatility 10 Index' },
  { value: '1HZ10V', label: 'Volatility 10 (1s) Index' },
  { value: 'R_25', label: 'Volatility 25 Index' },
  { value: '1HZ25V', label: 'Volatility 25 (1s) Index' },
  { value: 'R_50', label: 'Volatility 50 Index' },
  { value: '1HZ50V', label: 'Volatility 50 (1s) Index' },
  { value: 'R_75', label: 'Volatility 75 Index' },
  { value: '1HZ75V', label: 'Volatility 75 (1s) Index' },
  { value: 'R_100', label: 'Volatility 100 Index' },
  { value: '1HZ100V', label: 'Volatility 100 (1s) Index' },
  { value: '1HZ90V', label: 'Volatility 90 (1s) Index' },
];

export const TIMEFRAMES = [
  { value: 60, label: '1m' },
  { value: 180, label: '3m' },
  { value: 300, label: '5m' },
  { value: 900, label: '15m' },
  { value: 1800, label: '30m' },
  { value: 3600, label: '1H' },
  { value: 14400, label: '4H' },
  { value: 86400, label: '1D' },
];

export const HTF_TIMEFRAMES = [
  { value: 900, label: '15m' },
  { value: 1800, label: '30m' },
  { value: 3600, label: '1H' },
  { value: 14400, label: '4H' },
  { value: 86400, label: '1D' },
];

export const LTF_TIMEFRAMES = [
  { value: 60, label: '1m' },
  { value: 180, label: '3m' },
  { value: 300, label: '5m' },
  { value: 900, label: '15m' },
  { value: 1800, label: '30m' },
];

export const DEFAULT_SYMBOL = '1HZ10V';
export const DEFAULT_HTF = 14400; // 4H
export const DEFAULT_LTF = 300;   // 5m

export const COLORS = {
  bg: '#000000',
  surface: '#0a0a0a',
  border: '#1e1e1e',
  bull: '#00ff88',
  bear: '#ff3b3b',
  neutral: '#888888',
  label: '#555555',
  white: '#ffffff',
  fvgBull: 'rgba(0, 255, 136, 0.12)',
  fvgBear: 'rgba(255, 59, 59, 0.12)',
  sweep: '#ff9900',
  mss: '#f5c518',
  crt: '#4488ff',
};
