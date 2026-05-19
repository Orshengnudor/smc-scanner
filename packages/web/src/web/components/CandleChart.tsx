import { useEffect, useRef, useImperativeHandle, forwardRef, useCallback, useState } from 'react';
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
import type { FVG, LiquiditySweep, MSS, CRTLevel, LiquidityStack } from '../lib/smcEngine';

export type OverlayToggles = {
  crtLevels: boolean;
  fvg: boolean;
  sweep: boolean;
  mss: boolean;
  grid: boolean;
  crossLines: boolean;
  sessions: boolean;
  liqStacks: boolean;
};

export type DrawnLine = {
  id: string;
  time1: number;
  price1: number;
  time2: number;
  price2: number;
  color: string;
};

export type Theme = {
  bg: string;
  surface: string;
  border: string;
  text: string;
  label: string;
  bull: string;
  bear: string;
  neutral: string;
  sweep: string;
  mss: string;
  crt: string;
  grid: string;
};

// ── Trading sessions (UTC hours) ──────────────────────────────────────────────
const SESSIONS = [
  { name: 'Sydney',   startH: 21, startM: 0, endH: 6,  endM: 0,  color: 'rgba(100,160,255,0.10)', border: 'rgba(100,160,255,0.45)' },
  { name: 'Tokyo',    startH: 0,  startM: 0, endH: 9,  endM: 0,  color: 'rgba(255,200,50,0.09)',  border: 'rgba(255,200,50,0.45)'  },
  { name: 'London',   startH: 7,  startM: 0, endH: 16, endM: 0,  color: 'rgba(0,220,100,0.10)',   border: 'rgba(0,220,100,0.50)'   },
  { name: 'New York', startH: 12, startM: 0, endH: 21, endM: 0,  color: 'rgba(255,80,80,0.09)',   border: 'rgba(255,80,80,0.45)'   },
] as const;

type Props = {
  candles: Candle[];

  fvgs?: FVG[];
  sweeps?: LiquiditySweep[];
  mssEvents?: MSS[];
  crtLevel?: CRTLevel | null;
  liquidityStacks?: LiquidityStack[];
  overlays: OverlayToggles;
  height?: number;
  theme: Theme;
  granularity: number;
  onCrosshairMove?: (time: number | null, price: number | null) => void;
  onCountdownChange?: (secs: number) => void;
  drawnLines?: DrawnLine[];
  onLinesChange?: (lines: DrawnLine[]) => void;
  drawMode?: boolean;
  drawColor?: string;
};

export type ChartHandle = {
  syncCrosshair: (time: number | null, price: number | null) => void;
};

function safeLineData(t1: number, t2: number, value: number): LineData[] | null {
  if (t1 >= t2) return null;
  return [{ time: t1 as any, value }, { time: t2 as any, value }];
}

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

const HIT_RADIUS = 8;

/**
 * Given the visible time range, generate session bands as pixel x-ranges.
 */
function getSessionBands(
  chart: IChartApi,
  canvasWidth: number,
  canvasHeight: number,
  visibleRange: { from: number; to: number } | null,
): Array<{ x1: number; x2: number; color: string; border: string; name: string }> {
  if (!visibleRange) return [];

  const bands: Array<{ x1: number; x2: number; color: string; border: string; name: string }> = [];
  const DAY = 86400;

  const fromDay = Math.floor(visibleRange.from / DAY) * DAY;
  const toDay   = Math.ceil(visibleRange.to / DAY) * DAY;

  for (const sess of SESSIONS) {
    const startSec = sess.startH * 3600 + sess.startM * 60;
    const endSec   = sess.endH   * 3600 + sess.endM   * 60;
    const crossesMidnight = endSec <= startSec;

    for (let day = fromDay; day <= toDay; day += DAY) {
      let segStart: number, segEnd: number;

      if (crossesMidnight) {
        // Part 1: start → midnight
        segStart = day + startSec;
        segEnd   = day + DAY;
        const x1a = chart.timeScale().timeToCoordinate(segStart as any);
        const x2a = chart.timeScale().timeToCoordinate(segEnd as any);
        if (x1a != null && x2a != null) {
          const left = Math.min(x1a, x2a); const right = Math.max(x1a, x2a);
          if (right > 0 && left < canvasWidth)
            bands.push({ x1: left, x2: right, color: sess.color, border: sess.border, name: sess.name });
        }
        // Part 2: midnight → end
        segStart = day + DAY;
        segEnd   = day + DAY + endSec;
        const x1b = chart.timeScale().timeToCoordinate(segStart as any);
        const x2b = chart.timeScale().timeToCoordinate(segEnd as any);
        if (x1b != null && x2b != null) {
          const left = Math.min(x1b, x2b); const right = Math.max(x1b, x2b);
          if (right > 0 && left < canvasWidth)
            bands.push({ x1: left, x2: right, color: sess.color, border: sess.border, name: sess.name });
        }
      } else {
        segStart = day + startSec;
        segEnd   = day + endSec;
        const x1 = chart.timeScale().timeToCoordinate(segStart as any);
        const x2 = chart.timeScale().timeToCoordinate(segEnd as any);
        if (x1 != null && x2 != null) {
          const left = Math.min(x1, x2); const right = Math.max(x1, x2);
          if (right > 0 && left < canvasWidth)
            bands.push({ x1: left, x2: right, color: sess.color, border: sess.border, name: sess.name });
        }
      }
    }
  }

  return bands;
}

const CandleChart = forwardRef<ChartHandle, Props>(({
  candles,

  fvgs = [],
  sweeps = [],
  mssEvents = [],
  crtLevel,
  liquidityStacks = [],
  overlays,
  height = 400,
  theme,
  granularity,
  onCrosshairMove,
  onCountdownChange,
  drawnLines = [],
  onLinesChange,
  drawMode = false,
  drawColor = '#f5c518',
}, ref) => {
  const containerRef  = useRef<HTMLDivElement>(null);
  const chartDivRef   = useRef<HTMLDivElement>(null);
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const chartRef      = useRef<IChartApi | null>(null);
  const seriesRef     = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const overlaySeriesRef = useRef<ISeriesApi<'Line'>[]>([]);
  const visibleRangeRef  = useRef<{ from: number; to: number } | null>(null);

  // Drawing state
  const drawStateRef = useRef<{
    drawing: boolean;
    startX: number; startY: number;
    curX: number; curY: number;
    draggingId: string | null;
    dragOffsetX: number; dragOffsetY: number;
    dragLine: DrawnLine | null;
  }>({
    drawing: false, startX: 0, startY: 0, curX: 0, curY: 0,
    draggingId: null, dragOffsetX: 0, dragOffsetY: 0, dragLine: null,
  });

  const linesRef          = useRef<DrawnLine[]>(drawnLines);
  const onLinesChangeRef  = useRef(onLinesChange);
  const onCountdownRef    = useRef(onCountdownChange);
  const drawModeRef       = useRef(drawMode);
  const drawColorRef      = useRef(drawColor);
  const overlaysRef       = useRef(overlays);

  useEffect(() => { linesRef.current         = drawnLines; }, [drawnLines]);
  useEffect(() => { onLinesChangeRef.current = onLinesChange; }, [onLinesChange]);
  useEffect(() => { onCountdownRef.current   = onCountdownChange; }, [onCountdownChange]);
  useEffect(() => { drawModeRef.current      = drawMode; }, [drawMode]);
  useEffect(() => { drawColorRef.current     = drawColor; }, [drawColor]);
  useEffect(() => { overlaysRef.current      = overlays; }, [overlays]);

  useImperativeHandle(ref, () => ({
    syncCrosshair: (_time: number | null, _price: number | null) => {},
  }));

  // ── Countdown — bubble up to parent ───────────────────────────────────────
  useEffect(() => {
    if (candles.length === 0) { onCountdownRef.current?.(0); return; }
    const nextCandleTime = candles[candles.length - 1].time + granularity;
    const tick = () => {
      const secs = Math.max(0, nextCandleTime - Math.floor(Date.now() / 1000));
      onCountdownRef.current?.(secs);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [candles, granularity]);

  // ── Canvas converters ──────────────────────────────────────────────────────
  const lineToPixels = useCallback((line: DrawnLine) => {
    const chart = chartRef.current; const series = seriesRef.current;
    if (!chart || !series) return null;
    const x1 = chart.timeScale().timeToCoordinate(line.time1 as any);
    const y1 = series.priceToCoordinate(line.price1);
    const x2 = chart.timeScale().timeToCoordinate(line.time2 as any);
    const y2 = series.priceToCoordinate(line.price2);
    if (x1 == null || y1 == null || x2 == null || y2 == null) return null;
    return { x1, y1, x2, y2 };
  }, []);

  const pixelsToLine = useCallback((x1: number, y1: number, x2: number, y2: number, color: string, id?: string): DrawnLine | null => {
    const chart = chartRef.current; const series = seriesRef.current;
    if (!chart || !series) return null;
    const t1 = chart.timeScale().coordinateToTime(x1);
    const p1 = series.coordinateToPrice(y1);
    const t2 = chart.timeScale().coordinateToTime(x2);
    const p2 = series.coordinateToPrice(y2);
    if (t1 == null || p1 == null || t2 == null || p2 == null) return null;
    return {
      id: id ?? `line-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      time1: Number(t1), price1: p1, time2: Number(t2), price2: p2, color,
    };
  }, []);

  // ── Canvas redraw ─────────────────────────────────────────────────────────
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const chart = chartRef.current;
    const ds    = drawStateRef.current;
    const lines = linesRef.current;
    const ovl   = overlaysRef.current;

    // Session bands
    if (chart && ovl.sessions) {
      const bands = getSessionBands(chart, canvas.width, canvas.height, visibleRangeRef.current);
      for (const band of bands) {
        const x1 = Math.max(0, band.x1);
        const x2 = Math.min(canvas.width, band.x2);
        if (x2 <= x1) continue;
        ctx.save();
        ctx.fillStyle = band.color;
        ctx.fillRect(x1, 0, x2 - x1, canvas.height);
        ctx.strokeStyle = band.border;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(x1, 0); ctx.lineTo(x1, canvas.height); ctx.stroke();
        ctx.restore();
      }
    }

    // Drawn lines
    for (const line of lines) {
      const px = lineToPixels(line);
      if (!px) continue;
      const isDragging = ds.draggingId === line.id;
      ctx.save();
      ctx.strokeStyle = line.color;
      ctx.lineWidth = isDragging ? 2.5 : 1.5;
      ctx.setLineDash([]);
      if (isDragging) { ctx.shadowColor = line.color; ctx.shadowBlur = 8; }
      ctx.beginPath(); ctx.moveTo(px.x1, px.y1); ctx.lineTo(px.x2, px.y2); ctx.stroke();
      ctx.restore();
      ctx.save();
      ctx.fillStyle = line.color;
      for (const { x, y } of [{ x: px.x1, y: px.y1 }, { x: px.x2, y: px.y2 }]) {
        ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }

    // In-progress preview
    if (ds.drawing) {
      ctx.save();
      ctx.strokeStyle = drawColorRef.current;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(ds.startX, ds.startY); ctx.lineTo(ds.curX, ds.curY); ctx.stroke();
      ctx.restore();
    }
  }, [lineToPixels]);

  const syncCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }, []);

  // ── Init chart ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!chartDivRef.current) return;
    const chart = createChart(chartDivRef.current, {
      width: chartDivRef.current.clientWidth,
      height,
      layout: {
        background: { color: theme.bg },
        textColor: theme.label,
        fontFamily: "'JetBrains Mono', 'Courier New', monospace",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: overlays.grid ? theme.grid : 'transparent', style: LineStyle.Solid },
        horzLines: { color: overlays.grid ? theme.grid : 'transparent', style: LineStyle.Solid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: theme.neutral, style: LineStyle.Dashed, labelBackgroundColor: theme.surface },
        horzLine: { color: theme.neutral, style: LineStyle.Dashed, labelBackgroundColor: theme.surface },
      },
      rightPriceScale: { borderColor: theme.border, textColor: theme.label },
      timeScale: { borderColor: theme.border, textColor: theme.label, timeVisible: true, secondsVisible: false },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: theme.bull, downColor: theme.bear,
      borderUpColor: theme.bull, borderDownColor: theme.bear,
      wickUpColor: theme.bull, wickDownColor: theme.bear,
    });

    chartRef.current  = chart;
    seriesRef.current = series;

    chart.subscribeCrosshairMove((param) => {
      let price: number | null = null;
      if (param.point?.y != null) price = series.coordinateToPrice(param.point.y);
      if (price == null && param.seriesData) {
        const d = param.seriesData.get(series) as any;
        if (d) price = d.close ?? d.value ?? null;
      }
      onCrosshairMove?.(param.time ? Number(param.time) : null, price);
    });

    chart.timeScale().subscribeVisibleTimeRangeChange((range) => {
      visibleRangeRef.current = range ? { from: Number(range.from), to: Number(range.to) } : null;
      syncCanvasSize();
      redrawCanvas();
    });

    requestAnimationFrame(() => {
      const r = chart.timeScale().getVisibleRange();
      if (r) visibleRangeRef.current = { from: Number(r.from), to: Number(r.to) };
      syncCanvasSize();
      redrawCanvas();
    });

    const ro = new ResizeObserver(() => {
      if (chartDivRef.current) {
        chart.applyOptions({ width: chartDivRef.current.clientWidth });
        syncCanvasSize();
        redrawCanvas();
      }
    });
    ro.observe(chartDivRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height]);

  // ── Theme sync ─────────────────────────────────────────────────────────────
  useEffect(() => {
    chartRef.current?.applyOptions({
      layout: { background: { color: theme.bg }, textColor: theme.label },
      rightPriceScale: { borderColor: theme.border, textColor: theme.label },
      timeScale: { borderColor: theme.border, textColor: theme.label },
      crosshair: {
        vertLine: { color: theme.neutral, labelBackgroundColor: theme.surface },
        horzLine: { color: theme.neutral, labelBackgroundColor: theme.surface },
      },
    });
    seriesRef.current?.applyOptions({
      upColor: theme.bull, downColor: theme.bear,
      borderUpColor: theme.bull, borderDownColor: theme.bear,
      wickUpColor: theme.bull, wickDownColor: theme.bear,
    });
  }, [theme]);

  // ── Grid sync ──────────────────────────────────────────────────────────────
  useEffect(() => {
    chartRef.current?.applyOptions({
      grid: {
        vertLines: { color: overlays.grid ? theme.grid : 'transparent', style: LineStyle.Solid },
        horzLines: { color: overlays.grid ? theme.grid : 'transparent', style: LineStyle.Solid },
      },
    });
  }, [overlays.grid, theme.grid]);

  // ── Sessions toggle ────────────────────────────────────────────────────────
  useEffect(() => {
    syncCanvasSize();
    redrawCanvas();
  }, [overlays.sessions, redrawCanvas, syncCanvasSize]);

  // ── Candles ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current;
    if (!seriesRef.current || !chart || candles.length === 0) return;
    const data: CandlestickData[] = candles.map(c => ({
      time: c.time as any, open: c.open, high: c.high, low: c.low, close: c.close,
    }));
    seriesRef.current.setData(data);

    requestAnimationFrame(() => {
      const r = chart.timeScale().getVisibleRange();
      if (r) visibleRangeRef.current = { from: Number(r.from), to: Number(r.to) };
      syncCanvasSize();
      redrawCanvas();
    });
  }, [candles, redrawCanvas, syncCanvasSize]);

  // ── SMC Overlays ───────────────────────────────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current; const series = seriesRef.current;
    if (!chart || !series || candles.length === 0) return;

    // Remove existing overlay series one by one, clear ref immediately
    const toRemove = [...overlaySeriesRef.current];
    overlaySeriesRef.current = [];
    toRemove.forEach(s => { try { chart.removeSeries(s); } catch {} });

    const extentCandles = candles;
    const firstTime = extentCandles[0].time;
    const lastTime  = extentCandles[extentCandles.length - 1].time;

    try {
    if (extentCandles.length >= 2) {
      if (overlays.crtLevels && crtLevel) {
        const crtStart = Math.max(crtLevel.time, firstTime);
        [
          { price: crtLevel.high,  color: theme.bull, label: 'H' },
          { price: crtLevel.close, color: theme.crt,  label: 'C' },
          { price: crtLevel.low,   color: theme.bear, label: 'L' },
        ].forEach(({ price, color, label }) => {
          const pts = safeLineData(crtStart, lastTime, price);
          if (!pts) return;
          const s = chart.addSeries(LineSeries, {
            color, lineWidth: 1, lineStyle: LineStyle.Dashed,
            priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, title: label,
          });
          s.setData(pts);
          overlaySeriesRef.current.push(s);
        });
      }

      if (overlays.fvg) {
        fvgs.filter(f => !f.mitigated).slice(-8).forEach(fvg => {
          const color = fvg.type === 'bullish' ? theme.bull : theme.bear;
          const fvgStart = Math.max(fvg.time, firstTime);
          const topPts = safeLineData(fvgStart, lastTime, fvg.top);
          const botPts = safeLineData(fvgStart, lastTime, fvg.bottom);
          if (!topPts || !botPts) return;
          [topPts, botPts].forEach(pts => {
            const s = chart.addSeries(LineSeries, {
              color: color + '55', lineWidth: 1, lineStyle: LineStyle.Dotted,
              priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
            });
            s.setData(pts);
            overlaySeriesRef.current.push(s);
          });
        });
      }

      if (overlays.sweep) {
        sweeps.slice(-5).forEach(sw => {
          const pts = safeLineData(Math.max(sw.time, firstTime), lastTime, sw.level);
          if (!pts) return;
          const s = chart.addSeries(LineSeries, {
            color: theme.sweep, lineWidth: 1, lineStyle: LineStyle.Dashed,
            priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
          });
          s.setData(pts);
          overlaySeriesRef.current.push(s);
        });
      }

      if (overlays.liqStacks && liquidityStacks && liquidityStacks.length > 0) {
        liquidityStacks.forEach(stack => {
          // Highs stacks = bearish liquidity (above price) → amber/orange
          // Lows stacks  = bullish liquidity (below price) → purple/violet
          const isHighs = stack.type === 'highs';
          const zoneColor  = isHighs ? 'rgba(255,180,0,0.18)'   : 'rgba(160,80,255,0.18)';
          const lineColor  = isHighs ? 'rgba(255,180,0,0.85)'   : 'rgba(160,80,255,0.85)';
          const dimColor   = isHighs ? 'rgba(255,180,0,0.35)'   : 'rgba(160,80,255,0.35)';
          const stackStart = Math.max(stack.time, firstTime);
          const topPts = safeLineData(stackStart, lastTime, stack.priceHigh);
          const botPts = safeLineData(stackStart, lastTime, stack.priceLow);
          const midPts = safeLineData(stackStart, lastTime, stack.midPrice);
          if (!topPts || !botPts || !midPts) return;

          // Top boundary
          const sTop = chart.addSeries(LineSeries, {
            color: stack.touched ? dimColor : lineColor,
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
          });
          sTop.setData(topPts);
          overlaySeriesRef.current.push(sTop);

          // Bottom boundary
          const sBot = chart.addSeries(LineSeries, {
            color: stack.touched ? dimColor : lineColor,
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
          });
          sBot.setData(botPts);
          overlaySeriesRef.current.push(sBot);

          // Mid line — labelled with count
          const sMid = chart.addSeries(LineSeries, {
            color: stack.touched ? dimColor : zoneColor.replace('0.18', '0.0'),
            lineWidth: 1,
            lineStyle: LineStyle.Solid,
            priceLineVisible: false,
            lastValueVisible: true,
            crosshairMarkerVisible: false,
            title: `${isHighs ? 'EQH' : 'EQL'} ×${stack.count}`,
          });
          sMid.setData(midPts);
          overlaySeriesRef.current.push(sMid);
        });
      }
    }

    if (overlays.mss && mssEvents.length > 0) {
      const markers = mssEvents.slice(-3).map(m => ({
        time: m.time as any,
        position: (m.type === 'bullish' ? 'belowBar' : 'aboveBar') as any,
        color: theme.mss,
        shape: (m.type === 'bullish' ? 'arrowUp' : 'arrowDown') as any,
        text: m.kind, size: 1,
      }));
      try { createSeriesMarkers(series, markers); } catch {}
    } else {
      try { createSeriesMarkers(series, []); } catch {}
    }
    } catch (e) { console.warn('overlay render error', e); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles, fvgs, sweeps, mssEvents, crtLevel, liquidityStacks,
      overlays.crtLevels, overlays.fvg, overlays.sweep, overlays.mss, overlays.liqStacks,
      theme.bull, theme.bear, theme.crt, theme.sweep, theme.mss]);

  // ── Redraw when drawnLines/drawMode change ────────────────────────────────
  useEffect(() => {
    syncCanvasSize();
    redrawCanvas();
  }, [drawnLines, drawMode, redrawCanvas, syncCanvasSize]);

  // ── Canvas mouse events ────────────────────────────────────────────────────
  const getCanvasPos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawModeRef.current) return;
    const { x, y } = getCanvasPos(e);
    const ds = drawStateRef.current;

    for (let i = linesRef.current.length - 1; i >= 0; i--) {
      const line = linesRef.current[i];
      const px = lineToPixels(line);
      if (!px) continue;
      if (distToSegment(x, y, px.x1, px.y1, px.x2, px.y2) <= HIT_RADIUS) {
        ds.draggingId   = line.id;
        ds.dragOffsetX  = x - (px.x1 + px.x2) / 2;
        ds.dragOffsetY  = y - (px.y1 + px.y2) / 2;
        ds.dragLine     = { ...line };
        e.preventDefault();
        redrawCanvas();
        return;
      }
    }

    ds.drawing = true;
    ds.startX = x; ds.startY = y;
    ds.curX   = x; ds.curY   = y;
    redrawCanvas();
  }, [lineToPixels, redrawCanvas]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawModeRef.current) return;
    const { x, y } = getCanvasPos(e);
    const ds = drawStateRef.current;

    if (ds.draggingId && ds.dragLine) {
      const px = lineToPixels(ds.dragLine);
      if (px) {
        const halfDx = (px.x2 - px.x1) / 2;
        const halfDy = (px.y2 - px.y1) / 2;
        const midX   = x - ds.dragOffsetX;
        const midY   = y - ds.dragOffsetY;
        const newLine = pixelsToLine(midX - halfDx, midY - halfDy, midX + halfDx, midY + halfDy, ds.dragLine.color, ds.dragLine.id);
        if (newLine) {
          linesRef.current = linesRef.current.map(l => l.id === ds.dragLine!.id ? newLine : l);
          redrawCanvas();
        }
      }
    } else if (ds.drawing) {
      ds.curX = x; ds.curY = y;
      redrawCanvas();
    }
  }, [lineToPixels, pixelsToLine, redrawCanvas]);

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawModeRef.current) return;
    const { x, y } = getCanvasPos(e);
    const ds = drawStateRef.current;

    if (ds.draggingId) {
      onLinesChangeRef.current?.([...linesRef.current]);
      ds.draggingId = null; ds.dragLine = null;
      redrawCanvas();
    } else if (ds.drawing) {
      ds.drawing = false;
      if (Math.hypot(x - ds.startX, y - ds.startY) >= 4) {
        const newLine = pixelsToLine(ds.startX, ds.startY, x, y, drawColorRef.current);
        if (newLine) {
          const updated = [...linesRef.current, newLine];
          linesRef.current = updated;
          onLinesChangeRef.current?.(updated);
        }
      }
      redrawCanvas();
    }
  }, [pixelsToLine, redrawCanvas]);

  const handleMouseLeave = useCallback(() => {
    if (drawStateRef.current.drawing) {
      drawStateRef.current.drawing = false;
      redrawCanvas();
    }
  }, [redrawCanvas]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height, position: 'relative', overflow: 'hidden' }}
    >
      <div ref={chartDivRef} style={{ width: '100%', height: '100%' }} />

      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute', top: 0, left: 0,
          width: '100%', height: '100%',
          pointerEvents: drawMode ? 'all' : 'none',
          cursor: drawMode ? 'crosshair' : 'default',
          zIndex: 10,
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      />

      {/* Session legend */}
      {overlays.sessions && (
        <div style={{
          position: 'absolute', top: 6, left: 8, zIndex: 20,
          display: 'flex', gap: 6, pointerEvents: 'none',
        }}>
          {SESSIONS.map(s => (
            <div key={s.name} style={{
              display: 'flex', alignItems: 'center', gap: 3,
              background: 'rgba(0,0,0,0.50)',
              border: `1px solid ${s.border}`,
              borderRadius: 3, padding: '1px 5px',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 9, color: s.border, letterSpacing: 0.5,
            }}>
              <div style={{ width: 7, height: 7, borderRadius: 1, background: s.color, border: `1px solid ${s.border}` }} />
              {s.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

CandleChart.displayName = 'CandleChart';
export default CandleChart;
