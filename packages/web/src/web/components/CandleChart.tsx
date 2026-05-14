import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type LineData,
  CrosshairMode,
  LineStyle,
} from 'lightweight-charts';
import type { Candle } from '../lib/derivWS';
import type { FVG, LiquiditySweep, MSS, CRTLevel } from '../lib/smcEngine';
import { COLORS } from '../lib/constants';

export type OverlayToggles = {
  crtLevels: boolean;
  fvg: boolean;
  sweep: boolean;
  mss: boolean;
};

type Props = {
  candles: Candle[];
  fvgs?: FVG[];
  sweeps?: LiquiditySweep[];
  mssEvents?: MSS[];
  crtLevel?: CRTLevel | null;
  overlays: OverlayToggles;
  height?: number;
  onCrosshairMove?: (time: number | null, price: number | null) => void;
  externalCrosshair?: { time: number | null; price: number | null };
};

export type ChartHandle = {
  syncCrosshair: (time: number | null, price: number | null) => void;
};

const CandleChart = forwardRef<ChartHandle, Props>(({
  candles,
  fvgs = [],
  sweeps = [],
  mssEvents = [],
  crtLevel,
  overlays,
  height = 400,
  onCrosshairMove,
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const primitiveSeriesRef = useRef<ISeriesApi<'Line'>[]>([]);

  useImperativeHandle(ref, () => ({
    syncCrosshair: (_time: number | null, _price: number | null) => {
      // v5 crosshair sync
    },
  }));

  // Init chart
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height,
      layout: {
        background: { color: COLORS.bg },
        textColor: COLORS.neutral,
        fontFamily: "'JetBrains Mono', 'Courier New', monospace",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: '#111111', style: LineStyle.Dotted },
        horzLines: { color: '#111111', style: LineStyle.Dotted },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#555555', style: LineStyle.Dashed, labelBackgroundColor: '#222222' },
        horzLine: { color: '#555555', style: LineStyle.Dashed, labelBackgroundColor: '#222222' },
      },
      rightPriceScale: {
        borderColor: COLORS.border,
        textColor: COLORS.neutral,
      },
      timeScale: {
        borderColor: COLORS.border,
        textColor: COLORS.neutral,
        timeVisible: true,
        secondsVisible: false,
      },
    });

    // v5 API: addSeries with named constructor
    const series = chart.addSeries(CandlestickSeries, {
      upColor: COLORS.bull,
      downColor: COLORS.bear,
      borderUpColor: COLORS.bull,
      borderDownColor: COLORS.bear,
      wickUpColor: COLORS.bull,
      wickDownColor: COLORS.bear,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    chart.subscribeCrosshairMove((param) => {
      if (onCrosshairMove) {
        const t = param.time ? Number(param.time) : null;
        onCrosshairMove(t, null);
      }
    });

    const ro = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [height]);

  // Update candles
  useEffect(() => {
    if (!seriesRef.current || candles.length === 0) return;
    const data: CandlestickData[] = candles.map(c => ({
      time: c.time as any,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    seriesRef.current.setData(data);
  }, [candles]);

  // Draw overlays
  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series || candles.length === 0) return;

    // Remove old line series
    primitiveSeriesRef.current.forEach(s => { try { chart.removeSeries(s); } catch {} });
    primitiveSeriesRef.current = [];

    // ── CRT Levels ───────────────────────────────────────────────
    if (overlays.crtLevels && crtLevel) {
      const styles = [
        { price: crtLevel.high, color: COLORS.bull, title: 'CRT H', dash: LineStyle.Dashed },
        { price: crtLevel.low, color: COLORS.bear, title: 'CRT L', dash: LineStyle.Dashed },
        { price: crtLevel.close, color: COLORS.crt, title: 'CRT C', dash: LineStyle.Dotted },
      ];
      styles.forEach(({ price, color, title, dash }) => {
        series.createPriceLine({ price, color, lineWidth: 1, lineStyle: dash, axisLabelVisible: true, title });
      });
    }

    // ── FVGs ─────────────────────────────────────────────────────
    if (overlays.fvg) {
      const activeFVGs = fvgs.filter(f => !f.mitigated);
      activeFVGs.slice(-10).forEach(fvg => {
        const color = fvg.type === 'bullish' ? COLORS.bull : COLORS.bear;

        const topLine = chart.addSeries(LineSeries, {
          color,
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        const botLine = chart.addSeries(LineSeries, {
          color,
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });

        const lastTime = candles[candles.length - 1].time;
        const topData: LineData[] = [
          { time: fvg.time as any, value: fvg.top },
          { time: lastTime as any, value: fvg.top },
        ];
        const botData: LineData[] = [
          { time: fvg.time as any, value: fvg.bottom },
          { time: lastTime as any, value: fvg.bottom },
        ];
        topLine.setData(topData);
        botLine.setData(botData);
        primitiveSeriesRef.current.push(topLine, botLine);
      });
    }

    // ── Sweep price lines ─────────────────────────────────────────
    if (overlays.sweep) {
      sweeps.slice(-10).forEach(sw => {
        series.createPriceLine({
          price: sw.level,
          color: COLORS.sweep,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: false,
          title: sw.type === 'buy_side' ? '⚡ BSL' : '⚡ SSL',
        });
      });
    }

    // ── MSS markers ──────────────────────────────────────────────
    if (overlays.mss && mssEvents.length > 0) {
      const markers = mssEvents.slice(-8).map(m => ({
        time: m.time as any,
        position: (m.type === 'bullish' ? 'belowBar' : 'aboveBar') as any,
        color: COLORS.mss,
        shape: (m.type === 'bullish' ? 'arrowUp' : 'arrowDown') as any,
        text: m.kind,
        size: 1,
      }));
      if (markers.length > 0) {
        try { createSeriesMarkers(series, markers); } catch {}
      }
    }

  }, [candles, fvgs, sweeps, mssEvents, crtLevel, overlays]);

  return <div ref={containerRef} style={{ width: '100%', height }} />;
});

CandleChart.displayName = 'CandleChart';
export default CandleChart;
