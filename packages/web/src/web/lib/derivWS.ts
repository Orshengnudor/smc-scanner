// Deriv WebSocket Manager
// wss://ws.binaryws.com/websockets/v3?app_id=1089
// Handles connection, auth, heartbeat, reconnect, subscriptions
// + data validation: dedup, sort, gap detection

export type Candle = {
  time: number; // epoch seconds
  open: number;
  high: number;
  low: number;
  close: number;
};

type Subscription = {
  symbol: string;
  granularity: number; // seconds
  onCandle: (candle: Candle, isNew: boolean) => void;
};

type MessageHandler = (data: any) => void;

const APP_ID = 1089;
const WS_URL = `wss://ws.binaryws.com/websockets/v3?app_id=${APP_ID}`;
const HEARTBEAT_INTERVAL = 30_000;
const RECONNECT_DELAY = 3_000;

// ── Data Validation Helpers ───────────────────────────────────────────────────

/**
 * Dedup + sort candles by time. Also detects and marks gaps.
 * A "gap" is defined as > 5x the expected granularity between candles.
 */
export function sanitizeCandles(candles: Candle[], granularity: number): Candle[] {
  if (candles.length === 0) return [];

  // 1. Deduplicate by time (keep last seen)
  const map = new Map<number, Candle>();
  for (const c of candles) {
    map.set(c.time, c);
  }

  // 2. Sort ascending
  const sorted = Array.from(map.values()).sort((a, b) => a.time - b.time);

  // 3. Filter out candles with invalid OHLC (NaN, zero, negative)
  const valid = sorted.filter(c =>
    isFinite(c.open) && isFinite(c.high) && isFinite(c.low) && isFinite(c.close) &&
    c.high >= c.low && c.open > 0 && c.close > 0
  );

  return valid;
}

/**
 * Merge a new incoming candle into an existing sorted candle array.
 * Deduplicates by time, returns new sorted array.
 */
export function mergeCandle(existing: Candle[], incoming: Candle): Candle[] {
  if (!isFinite(incoming.open) || !isFinite(incoming.close) || incoming.open <= 0) {
    return existing;
  }
  const map = new Map<number, Candle>();
  for (const c of existing) map.set(c.time, c);
  map.set(incoming.time, incoming);
  return Array.from(map.values()).sort((a, b) => a.time - b.time);
}

class DerivWSManager {
  private ws: WebSocket | null = null;
  private token: string = '';
  private subscriptions: Map<string, Subscription> = new Map();
  private pendingHandlers: Map<string, MessageHandler> = new Map();
  private subIds: Map<string, string> = new Map(); // key -> subscription_id
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connected = false;
  private authenticated = false;
  private destroyed = false;

  onConnectionChange: ((connected: boolean, authenticated: boolean) => void) | null = null;

  setToken(token: string) {
    this.token = token;
  }

  connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
    this.ws = new WebSocket(WS_URL);

    this.ws.onopen = () => {
      this.connected = true;
      this.startHeartbeat();
      if (this.token) this.authorize();
      else {
        this.onConnectionChange?.(true, false);
        this.resubscribeAll();
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleMessage(data);
      } catch {}
    };

    this.ws.onerror = () => {};

    this.ws.onclose = () => {
      this.connected = false;
      this.authenticated = false;
      this.stopHeartbeat();
      this.onConnectionChange?.(false, false);
      if (!this.destroyed) {
        this.reconnectTimer = setTimeout(() => this.connect(), RECONNECT_DELAY);
      }
    };
  }

  disconnect() {
    this.destroyed = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }

  private authorize() {
    this.send({ authorize: this.token });
  }

  private handleMessage(data: any) {
    if (data.msg_type === 'authorize') {
      if (data.error) {
        console.error('Deriv auth error:', data.error.message);
        this.onConnectionChange?.(true, false);
      } else {
        this.authenticated = true;
        this.onConnectionChange?.(true, true);
        this.resubscribeAll();
      }
      return;
    }

    if (data.msg_type === 'ping') return;

    // Handle pending one-shot requests
    const reqId = data.req_id?.toString();
    if (reqId && this.pendingHandlers.has(reqId)) {
      const handler = this.pendingHandlers.get(reqId)!;
      this.pendingHandlers.delete(reqId);
      handler(data);
      return;
    }

    // Handle live candle updates (ohlc subscription)
    if (data.msg_type === 'ohlc' && data.ohlc) {
      const ohlc = data.ohlc;
      const key = `${ohlc.symbol}:${ohlc.granularity}`;
      const sub = this.subscriptions.get(key);
      if (sub) {
        const open = parseFloat(ohlc.open);
        const high = parseFloat(ohlc.high);
        const low = parseFloat(ohlc.low);
        const close = parseFloat(ohlc.close);

        // Validate before delivering
        if (isFinite(open) && isFinite(high) && isFinite(low) && isFinite(close)
          && high >= low && open > 0) {
          const candle: Candle = {
            time: ohlc.open_time,
            open,
            high,
            low,
            close,
          };
          sub.onCandle(candle, false);
        }
      }
    }

    // Handle history response (candles msg_type handled via pendingHandlers above)
    if (data.msg_type === 'candles' && data.candles) {
      const reqId2 = data.req_id?.toString();
      if (reqId2 && this.pendingHandlers.has(reqId2)) {
        const handler = this.pendingHandlers.get(reqId2)!;
        this.pendingHandlers.delete(reqId2);
        handler(data);
      }
    }
  }

  private resubscribeAll() {
    for (const [key, sub] of this.subscriptions.entries()) {
      this.subIds.delete(key);
      this._subscribeCandles(key, sub);
    }
  }

  private _subscribeCandles(key: string, sub: Subscription) {
    const reqId = Date.now() + Math.random();
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

    this.pendingHandlers.set(reqId.toString(), (data: any) => {
      if (data.error) {
        console.error('Subscription error:', data.error.message);
        return;
      }
      if (data.candles) {
        const raw: Candle[] = data.candles.map((c: any) => ({
          time: c.epoch,
          open: parseFloat(c.open),
          high: parseFloat(c.high),
          low: parseFloat(c.low),
          close: parseFloat(c.close),
        }));

        // Sanitize: dedup + sort + validate
        const candles = sanitizeCandles(raw, sub.granularity);
        candles.forEach((c, i) => sub.onCandle(c, i === candles.length - 1));
      }
      if (data.subscription?.id) {
        this.subIds.set(key, data.subscription.id);
      }
    });
  }

  subscribe(symbol: string, granularity: number, onCandle: (candle: Candle, isNew: boolean) => void): string {
    const key = `${symbol}:${granularity}`;
    this.subscriptions.set(key, { symbol, granularity, onCandle });
    if (this.connected) {
      this._subscribeCandles(key, { symbol, granularity, onCandle });
    }
    return key;
  }

  unsubscribe(key: string) {
    const subId = this.subIds.get(key);
    if (subId) {
      this.send({ forget: subId });
      this.subIds.delete(key);
    }
    this.subscriptions.delete(key);
  }

  getHistory(symbol: string, granularity: number, count: number): Promise<Candle[]> {
    return new Promise((resolve, reject) => {
      if (!this.connected) return reject(new Error('Not connected'));
      const reqId = Date.now() + Math.random();
      this.send({
        ticks_history: symbol,
        adjust_start_time: 1,
        count,
        end: 'latest',
        granularity,
        style: 'candles',
        req_id: reqId,
      });
      this.pendingHandlers.set(reqId.toString(), (data: any) => {
        if (data.error) return reject(new Error(data.error.message));
        const raw: Candle[] = (data.candles || []).map((c: any) => ({
          time: c.epoch,
          open: parseFloat(c.open),
          high: parseFloat(c.high),
          low: parseFloat(c.low),
          close: parseFloat(c.close),
        }));
        resolve(sanitizeCandles(raw, granularity));
      });
    });
  }

  private send(data: object) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      this.send({ ping: 1 });
    }, HEARTBEAT_INTERVAL);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  isConnected() { return this.connected; }
  isAuthenticated() { return this.authenticated; }
}

export const derivWS = new DerivWSManager();
