import { useState, useEffect, useRef, useCallback } from 'react';
import { derivWS, mergeCandle, type Candle } from '../lib/derivWS';

export function useDerivCandles(symbol: string, granularity: number) {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const subKeyRef = useRef<string | null>(null);
  const candleMapRef = useRef<Map<number, Candle>>(new Map());
  const isFirstBatch = useRef(true);

  // Throttle: track last candle time to detect new candles vs ticks
  const lastCandleTimeRef = useRef<number>(0);

  const resetAndSubscribe = useCallback(() => {
    if (subKeyRef.current) {
      derivWS.unsubscribe(subKeyRef.current);
    }
    candleMapRef.current = new Map();
    isFirstBatch.current = true;
    lastCandleTimeRef.current = 0;
    setLoading(true);
    setCandles([]);

    const key = derivWS.subscribe(symbol, granularity, (candle, _isNew) => {
      const isNewCandle = candle.time > lastCandleTimeRef.current;

      if (isNewCandle) {
        lastCandleTimeRef.current = candle.time;
      }

      // Always update the candle map (handles both bulk history and live updates)
      candleMapRef.current.set(candle.time, candle);

      // For live ticks (same candle updating): only trigger React state update
      // if it's a new candle OR we just got the first batch
      if (isFirstBatch.current) {
        const sorted = Array.from(candleMapRef.current.values()).sort((a, b) => a.time - b.time);
        if (sorted.length > 1) {
          isFirstBatch.current = false;
          setLoading(false);
          setCandles([...sorted]);
        }
      } else if (isNewCandle) {
        // New candle opened — always update
        const sorted = Array.from(candleMapRef.current.values()).sort((a, b) => a.time - b.time);
        setCandles([...sorted]);
      } else {
        // Tick updating current candle — use mergeCandle for efficiency
        setCandles(prev => mergeCandle(prev, candle));
      }
    });
    subKeyRef.current = key;
  }, [symbol, granularity]);

  useEffect(() => {
    resetAndSubscribe();
    return () => {
      if (subKeyRef.current) {
        derivWS.unsubscribe(subKeyRef.current);
      }
    };
  }, [resetAndSubscribe]);

  return { candles, loading };
}
