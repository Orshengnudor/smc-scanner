// Deriv WebSocket Manager
// Market data (candles, ticks) is PUBLIC — no auth needed.
// wss://ws.binaryws.com/websockets/v3?app_id=1089

export type Candle = {
  time: number; // epoch seconds
  open: number;
  high: number;
  low: number;
  close: number;
};

type Subscription = {
  symbol: string;
  granularity: number;
  onCandle: (candle: Candle) => void;
};

type MessageHandler = (data: any) => void;

const APP_ID = 1089;
const WS_URL = `wss://ws.binaryws.com/websockets/v3?app_id=${APP_ID}`;
const HEARTBEAT_INTERVAL = 25_000;
const MAX_RETRIES = 8;

// req_id must be an INTEGER — Deriv truncates floats and keys won't match
let _reqCounter = 1;
function nextReqId(): number { return _reqCounter++; }

export function sanitizeCandles(candles: Candle[]): Candle[] {
  if (candles.length === 0) return [];
  const map = new Map<number, Candle>();
  for (const c of candles) map.set(c.time, c);
  return Array.from(map.values())
    .sort((a, b) => a.time - b.time)
    .filter(c =>
      isFinite(c.open) && isFinite(c.high) && isFinite(c.low) && isFinite(c.close) &&
      c.high >= c.low && c.open > 0 && c.close > 0
    );
}

export function mergeCandle(existing: Candle[], incoming: Candle): Candle[] {
  if (!isFinite(incoming.open) || incoming.open <= 0) return existing;
  const map = new Map<number, Candle>();
  for (const c of existing) map.set(c.time, c);
  map.set(incoming.time, incoming);
  return Array.from(map.values()).sort((a, b) => a.time - b.time);
}

class DerivWSManager {
  private ws: WebSocket | null = null;
  private subscriptions = new Map<string, Subscription>();
  private pendingHandlers = new Map<string, MessageHandler>();
  private subIds = new Map<string, string>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private retryCount = 0;
  private _connected = false;
  private _destroyed = false;

  onStatusChange: ((connected: boolean) => void) | null = null;

  // No-op — kept for API compat
  setToken(_token: string) {}

  get connected() { return this._connected; }

  connect() {
    if (this._destroyed) { this._destroyed = false; this.retryCount = 0; }
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;

    this.ws = new WebSocket(WS_URL);

    this.ws.onopen = () => {
      this._connected = true;
      this.retryCount = 0;
      this.startHeartbeat();
      this.onStatusChange?.(true);
      this.resubscribeAll();
    };

    this.ws.onmessage = (e) => {
      try { this.handleMessage(JSON.parse(e.data)); } catch {}
    };

    this.ws.onerror = () => {};

    this.ws.onclose = () => {
      this._connected = false;
      this.stopHeartbeat();
      this.onStatusChange?.(false);
      if (!this._destroyed && this.retryCount < MAX_RETRIES) {
        const delay = Math.min(3000 * Math.pow(1.5, this.retryCount), 30000);
        this.retryCount++;
        this.reconnectTimer = setTimeout(() => this.connect(), delay);
      }
    };
  }

  disconnect() {
    this._destroyed = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }

  private handleMessage(data: any) {
    if (data.msg_type === 'ping') return;

    const reqId = data.req_id?.toString();
    if (reqId && this.pendingHandlers.has(reqId)) {
      const h = this.pendingHandlers.get(reqId)!;
      this.pendingHandlers.delete(reqId);
      h(data);
      return;
    }

    if (data.msg_type === 'ohlc' && data.ohlc) {
      const o = data.ohlc;
      const key = `${o.symbol}:${o.granularity}`;
      const sub = this.subscriptions.get(key);
      if (sub) {
        const c: Candle = {
          time: o.open_time,
          open: parseFloat(o.open),
          high: parseFloat(o.high),
          low: parseFloat(o.low),
          close: parseFloat(o.close),
        };
        if (isFinite(c.open) && c.open > 0) sub.onCandle(c);
      }
    }
  }

  private resubscribeAll() {
    for (const [key, sub] of this.subscriptions) {
      this.subIds.delete(key);
      this._doSubscribe(key, sub);
    }
  }

  private _doSubscribe(key: string, sub: Subscription) {
    const reqId = nextReqId();
    this.send({
      ticks_history: sub.symbol,
      adjust_start_time: 1,
      count: 500,
      end: 'latest',
      granularity: sub.granularity,
      style: 'candles',
      subscribe: 1,
      req_id: reqId,
    });
    this.pendingHandlers.set(reqId.toString(), (data) => {
      if (data.error) { console.error('[DerivWS] Subscribe error:', data.error.message); return; }
      if (data.candles) {
        const candles = sanitizeCandles(data.candles.map((c: any) => ({
          time: c.epoch,
          open: parseFloat(c.open),
          high: parseFloat(c.high),
          low: parseFloat(c.low),
          close: parseFloat(c.close),
        })));
        candles.forEach(c => sub.onCandle(c));
      }
      if (data.subscription?.id) this.subIds.set(key, data.subscription.id);
    });
  }

  subscribe(symbol: string, granularity: number, onCandle: (candle: Candle) => void): string {
    const key = `${symbol}:${granularity}`;
    this.subscriptions.set(key, { symbol, granularity, onCandle });
    if (this._connected) {
      this._doSubscribe(key, { symbol, granularity, onCandle });
    } else {
      // Not connected yet — connect() will resubscribeAll on open
      this.connect();
    }
    return key;
  }

  unsubscribe(key: string) {
    const id = this.subIds.get(key);
    if (id) { this.send({ forget: id }); this.subIds.delete(key); }
    this.subscriptions.delete(key);
  }

  private send(data: object) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(data));
  }

  private startHeartbeat() {
    this.heartbeatTimer = setInterval(() => this.send({ ping: 1 }), HEARTBEAT_INTERVAL);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
  }
}

export const derivWS = new DerivWSManager();
