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
import type { FVG, LiquiditySweep, MSS, CRTLevel } from '../lib/smcEngine';

export type OverlayToggles = {
  crtLevels: boolean;
  fvg: boolean;
  sweep: boolean;
  mss: boolean;
  grid: boolean;
  crossLines: boolean;
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

type Props = {
  candles: Candle[];
  fvgs?: FVG[];
  sweeps?: LiquiditySweep[];
  mssEvents?: MSS[];
  crtLevel?: CRTLevel | null;
  overlays: OverlayToggles;
  height?: number;
  theme: Theme;
  granularity: number; // seconds per candle — for countdown
  onCrosshairMove?: (time: number | null, price: number | null) => void;
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

/** Distance from point (px, py) to segment (x1,y1)-(x2,y2) */
function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

const HIT_RADIUS = 8; // px — easier to grab lines

function fmtCountdown(secs: number): string {
  if (secs <= 0) return '0:00';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return `${h}:${String(rm).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

const CandleChart = forwardRef<ChartHandle, Props>(({
  candles,
  fvgs = [],
  sweeps = [],
  mssEvents = [],
  crtLevel,
  overlays,
  height = 400,
  theme,
  granularity,
  onCrosshairMove,
  drawnLines = [],
  onLinesChange,
  drawMode = false,
  drawColor = '#f5c518',
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartDivRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const overlaySeriesRef = useRef<ISeriesApi<'Line'>[]>([]);
  const lastPriceRef = useRef<number | null>(null);

  // Countdown
  const [countdown, setCountdown] = useState<number>(0);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Drawing state (mutable — no React re-renders during drag)
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

  const linesRef = useRef<DrawnLine[]>(drawnLines);
  const onLinesChangeRef = useRef(onLinesChange);
  const drawModeRef = useRef(drawMode);
  const drawColorRef = useRef(drawColor);
  useEffect(() => { linesRef.current = drawnLines; }, [drawnLines]);
  useEffect(() => { onLinesChangeRef.current = onLinesChange; }, [onLinesChange]);
  useEffect(() => { drawModeRef.current = drawMode; }, [drawMode]);
  useEffect(() => { drawColorRef.current = drawColor; }, [drawColor]);

  useImperativeHandle(ref, () => ({
    syncCrosshair: (_time: number | null, _price: number | null) => {},
  }));

  // ── Countdown: compute from last candle time + granularity ────────────────
  useEffect(() => {
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    if (candles.length === 0) return;

    const lastCandle = candles[candles.length - 1];
    // Next candle opens at lastCandle.time + granularity
    const nextCandleTime = lastCandle.time + granularity;

    const tick = () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const remaining = nextCandleTime - nowSec;
      setCountdown(Math.max(0, remaining));
    };

    tick();
    countdownIntervalRef.current = setInterval(tick, 1000);
    return () => {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, [candles, granularity]);

  // ── Canvas: line-to-pixel converters ──────────────────────────────────────
  const lineToPixels = useCallback((line: DrawnLine): { x1: number; y1: number; x2: number; y2: number } | null => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return null;
    const x1 = chart.timeScale().timeToCoordinate(line.time1 as any);
    const y1 = series.priceToCoordinate(line.price1);
    const x2 = chart.timeScale().timeToCoordinate(line.time2 as any);
    const y2 = series.priceToCoordinate(line.price2);
    if (x1 == null || y1 == null || x2 == null || y2 == null) return null;
    return { x1, y1, x2, y2 };
  }, []);

  const pixelsToLine = useCallback((x1: number, y1: number, x2: number, y2: number, color: string, id?: string): DrawnLine | null => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return null;
    const t1 = chart.timeScale().coordinateToTime(x1);
    const p1 = series.coordinateToPrice(y1);
    const t2 = chart.timeScale().coordinateToTime(x2);
    const p2 = series.coordinateToPrice(y2);
    if (t1 == null || p1 == null || t2 == null || p2 == null) return null;
    return {
      id: id ?? `line-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      time1: Number(t1), price1: p1,
      time2: Number(t2), price2: p2,
      color,
    };
  }, []);

  // ── Canvas redraw ──────────────────────────────────────────────────────────
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const ds = drawStateRef.current;
    const lines = linesRef.current;

    for (const line of lines) {
      const px = lineToPixels(line);
      if (!px) continue;
      const isDragging = ds.draggingId === line.id;

      ctx.save();
      ctx.strokeStyle = line.color;
      ctx.lineWidth = isDragging ? 2.5 : 1.5;
      ctx.setLineDash([]);
      if (isDragging) {
        ctx.shadowColor = line.color;
        ctx.shadowBlur = 8;
      }
      ctx.beginPath();
      ctx.moveTo(px.x1, px.y1);
      ctx.lineTo(px.x2, px.y2);
      ctx.stroke();
      ctx.restore();

      // Endpoint dots
      ctx.save();
      ctx.fillStyle = line.color;
      [{ x: px.x1, y: px.y1 }, { x: px.x2, y: px.y2 }].forEach(({ x, y }) => {
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
    }

    // In-progress preview
    if (ds.drawing) {
      ctx.save();
      ctx.strokeStyle = drawColorRef.current;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(ds.startX, ds.startY);
      ctx.lineTo(ds.curX, ds.curY);
      ctx.stroke();
      ctx.restore();
    }
  }, [lineToPixels]);

  // ── Resize canvas to match container ──────────────────────────────────────
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
      upColor: theme.bull,
      downColor: theme.bear,
      borderUpColor: theme.bull,
      borderDownColor: theme.bear,
      wickUpColor: theme.bull,
      wickDownColor: theme.bear,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    chart.subscribeCrosshairMove((param) => {
      // Use crosshair Y coordinate → price (accurate for any candle hovered)
      let price: number | null = null;
      if (param.point?.y != null) {
        price = series.coordinateToPrice(param.point.y);
      }
      if (price == null && param.seriesData) {
        const d = param.seriesData.get(series) as any;
        if (d) price = d.close ?? d.value ?? null;
      }
      lastPriceRef.current = price;
      if (onCrosshairMove) {
        const t = param.time ? Number(param.time) : null;
        onCrosshairMove(t, price);
      }
    });

    chart.timeScale().subscribeVisibleTimeRangeChange(() => {
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

  // ── Candles ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!seriesRef.current || candles.length === 0) return;
    const data: CandlestickData[] = candles.map(c => ({
      time: c.time as any,
      open: c.open, high: c.high, low: c.low, close: c.close,
    }));
    seriesRef.current.setData(data);
    setTimeout(() => redrawCanvas(), 0);
  }, [candles, redrawCanvas]);

  // ── SMC Overlays ───────────────────────────────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series || candles.length === 0) return;

    const canDrawLines = candles.length >= 2;
    overlaySeriesRef.current.forEach(s => { try { chart.removeSeries(s); } catch {} });
    overlaySeriesRef.current = [];

    if (canDrawLines) {
      const firstTime = candles[0].time;
      const lastTime = candles[candles.length - 1].time;

      if (overlays.crtLevels && crtLevel) {
        const crtStart = Math.max(crtLevel.time, firstTime);
        const defs = [
          { price: crtLevel.high,  color: theme.bull, label: 'H' },
          { price: crtLevel.close, color: theme.crt,  label: 'C' },
          { price: crtLevel.low,   color: theme.bear,  label: 'L' },
        ];
        defs.forEach(({ price, color, label }) => {
          const pts = safeLineData(crtStart, lastTime, price);
          if (!pts) return;
          const s = chart.addSeries(LineSeries, {
            color, lineWidth: 1, lineStyle: LineStyle.Dashed,
            priceLineVisible: false, lastValueVisible: false,
            crosshairMarkerVisible: false, title: label,
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
          const mkLine = (pts: LineData[]) => {
            const s = chart.addSeries(LineSeries, {
              color: color + '55', lineWidth: 1, lineStyle: LineStyle.Dotted,
              priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
            });
            s.setData(pts);
            overlaySeriesRef.current.push(s);
          };
          mkLine(topPts);
          mkLine(botPts);
        });
      }

      if (overlays.sweep) {
        sweeps.slice(-5).forEach(sw => {
          const swStart = Math.max(sw.time, firstTime);
          const pts = safeLineData(swStart, lastTime, sw.level);
          if (!pts) return;
          const s = chart.addSeries(LineSeries, {
            color: theme.sweep, lineWidth: 1, lineStyle: LineStyle.Dashed,
            priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
          });
          s.setData(pts);
          overlaySeriesRef.current.push(s);
        });
      }
    }

    if (overlays.mss && mssEvents.length > 0) {
      const markers = mssEvents.slice(-3).map(m => ({
        time: m.time as any,
        position: (m.type === 'bullish' ? 'belowBar' : 'aboveBar') as any,
        color: theme.mss,
        shape: (m.type === 'bullish' ? 'arrowUp' : 'arrowDown') as any,
        text: m.kind,
        size: 1,
      }));
      try { createSeriesMarkers(series, markers); } catch {}
    } else {
      try { createSeriesMarkers(series, []); } catch {}
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles, fvgs, sweeps, mssEvents, crtLevel,
      overlays.crtLevels, overlays.fvg, overlays.sweep, overlays.mss,
      theme.bull, theme.bear, theme.crt, theme.sweep, theme.mss]);

  // ── Redraw canvas when drawnLines / drawMode change ───────────────────────
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
    const lines = linesRef.current;

    // Check if near an existing line → enter drag mode
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      const px = lineToPixels(line);
      if (!px) continue;
      const dist = distToSegment(x, y, px.x1, px.y1, px.x2, px.y2);
      if (dist <= HIT_RADIUS) {
        const midX = (px.x1 + px.x2) / 2;
        const midY = (px.y1 + px.y2) / 2;
        ds.draggingId = line.id;
        ds.dragOffsetX = x - midX;
        ds.dragOffsetY = y - midY;
        ds.dragLine = { ...line };
        e.preventDefault();
        redrawCanvas();
        return;
      }
    }

    // Start drawing new line
    ds.drawing = true;
    ds.startX = x; ds.startY = y;
    ds.curX = x;   ds.curY = y;
    redrawCanvas();
  }, [lineToPixels, redrawCanvas]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawModeRef.current) return;
    const { x, y } = getCanvasPos(e);
    const ds = drawStateRef.current;

    if (ds.draggingId && ds.dragLine) {
      const line = ds.dragLine;
      const px = lineToPixels(line);
      if (px) {
        const halfDx = (px.x2 - px.x1) / 2;
        const halfDy = (px.y2 - px.y1) / 2;
        const newMidX = x - ds.dragOffsetX;
        const newMidY = y - ds.dragOffsetY;
        const newPx = {
          x1: newMidX - halfDx, y1: newMidY - halfDy,
          x2: newMidX + halfDx, y2: newMidY + halfDy,
        };
        const newLine = pixelsToLine(newPx.x1, newPx.y1, newPx.x2, newPx.y2, line.color, line.id);
        if (newLine) {
          linesRef.current = linesRef.current.map(l => l.id === line.id ? newLine : l);
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
      ds.draggingId = null;
      ds.dragLine = null;
      redrawCanvas();
    } else if (ds.drawing) {
      ds.drawing = false;
      const dist = Math.hypot(x - ds.startX, y - ds.startY);
      if (dist >= 4) {
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
    const ds = drawStateRef.current;
    if (ds.drawing) {
      ds.drawing = false;
      redrawCanvas();
    }
    // Don't cancel drag on leave — user may re-enter
  }, [redrawCanvas]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height, position: 'relative', overflow: 'hidden' }}
    >
      {/* Chart renders here */}
      <div ref={chartDivRef} style={{ width: '100%', height: '100%' }} />

      {/* Canvas overlay for drawing */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0, left: 0,
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

      {/* Countdown badge — bottom left */}
      {candles.length > 0 && (
        <div style={{
          position: 'absolute',
          bottom: 24, left: 8,
          zIndex: 20,
          background: 'rgba(0,0,0,0.55)',
          border: `1px solid ${theme.border}`,
          borderRadius: 3,
          padding: '2px 6px',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
          color: countdown <= 10 ? theme.bear : countdown <= 30 ? theme.sweep : theme.label,
          letterSpacing: 1,
          pointerEvents: 'none',
        }}>
          {fmtCountdown(countdown)}
        </div>
      )}
    </div>
  );
});

CandleChart.displayName = 'CandleChart';
export default CandleChart;
