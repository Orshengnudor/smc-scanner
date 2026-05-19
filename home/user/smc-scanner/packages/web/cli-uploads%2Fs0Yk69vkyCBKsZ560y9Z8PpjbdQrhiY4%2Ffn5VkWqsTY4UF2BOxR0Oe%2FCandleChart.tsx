import { useEffect, useRef, useImperativeHandle, forwardRef, useCallback } from 'react';
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

const HIT_RADIUS = 6; // px

const CandleChart = forwardRef<ChartHandle, Props>(({
  candles,
  fvgs = [],
  sweeps = [],
  mssEvents = [],
  crtLevel,
  overlays,
  height = 400,
  theme,
  onCrosshairMove,
  drawnLines = [],
  onLinesChange,
  drawMode = false,
  drawColor = '#f5c518',
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const overlaySeriesRef = useRef<ISeriesApi<'Line'>[]>([]);
  const lastPriceRef = useRef<number | null>(null);

  // Drawing state (mutable, not React state — avoids re-renders during drag)
  const drawStateRef = useRef<{
    drawing: boolean;        // currently dragging new line
    startX: number; startY: number;
    curX: number; curY: number;
    draggingId: string | null; // id of line being repositioned
    dragOffsetX: number; dragOffsetY: number; // offset from line midpoint at drag start
    dragLine: DrawnLine | null; // snapshot of line being dragged
  }>({
    drawing: false, startX: 0, startY: 0, curX: 0, curY: 0,
    draggingId: null, dragOffsetX: 0, dragOffsetY: 0, dragLine: null,
  });

  // Keep latest drawnLines + callbacks accessible in canvas event handlers without stale closures
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

  // ── Canvas: line-to-pixel and pixel-to-line converters ────────────────────
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

    // Draw committed lines
    const lines = linesRef.current;
    for (const line of lines) {
      const px = lineToPixels(line);
      if (!px) continue;
      ctx.save();
      ctx.strokeStyle = line.color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([]);
      // Highlight if being dragged
      if (ds.draggingId === line.id) {
        ctx.lineWidth = 2.5;
        ctx.shadowColor = line.color;
        ctx.shadowBlur = 6;
      }
      ctx.beginPath();
      ctx.moveTo(px.x1, px.y1);
      ctx.lineTo(px.x2, px.y2);
      ctx.stroke();
      ctx.restore();

      // Endpoint handles
      ctx.save();
      ctx.fillStyle = line.color;
      ctx.beginPath();
      ctx.arc(px.x1, px.y1, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(px.x2, px.y2, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Draw in-progress line (preview)
    if (ds.drawing) {
      ctx.save();
      ctx.strokeStyle = drawColorRef.current;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
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
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height,
      layout: {
        background: { color: theme.bg },
        textColor: theme.label,
        fontFamily: "'JetBrains Mono', 'Courier New', monospace",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: overlays.grid ? theme.grid : 'transparent', style: LineStyle.Dotted },
        horzLines: { color: overlays.grid ? theme.grid : 'transparent', style: LineStyle.Dotted },
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
      if (param.seriesData) {
        const d = param.seriesData.get(series) as any;
        if (d) lastPriceRef.current = d.close ?? d.value ?? null;
      }
      if (onCrosshairMove) {
        const t = param.time ? Number(param.time) : null;
        onCrosshairMove(t, lastPriceRef.current);
      }
    });

    // Redraw canvas lines whenever chart pans/zooms
    chart.timeScale().subscribeVisibleTimeRangeChange(() => {
      syncCanvasSize();
      redrawCanvas();
    });

    const ro = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
        syncCanvasSize();
        redrawCanvas();
      }
    });
    ro.observe(containerRef.current);

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
        vertLines: { color: overlays.grid ? theme.grid : 'transparent', style: LineStyle.Dotted },
        horzLines: { color: overlays.grid ? theme.grid : 'transparent', style: LineStyle.Dotted },
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
    // After new data, redraw canvas (price scale may shift)
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

  // ── Redraw canvas whenever drawnLines or drawMode changes ─────────────────
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

    // Check if clicking near an existing line → drag it
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
        return;
      }
    }

    // Start new line
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
      // Move entire line
      const line = ds.dragLine;
      const px = lineToPixels(line);
      if (px) {
        const dx = (px.x2 - px.x1) / 2;
        const dy = (px.y2 - px.y1) / 2;
        const newMidX = x - ds.dragOffsetX;
        const newMidY = y - ds.dragOffsetY;
        const newPx = {
          x1: newMidX - dx, y1: newMidY - dy,
          x2: newMidX + dx, y2: newMidY + dy,
        };
        const newLine = pixelsToLine(newPx.x1, newPx.y1, newPx.x2, newPx.y2, line.color, line.id);
        if (newLine) {
          // Update linesRef live for smooth redraw without triggering React re-render mid-drag
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
      // Commit drag result
      onLinesChangeRef.current?.([...linesRef.current]);
      ds.draggingId = null;
      ds.dragLine = null;
      redrawCanvas();
    } else if (ds.drawing) {
      ds.drawing = false;
      // Only commit if dragged at least a few pixels (not an accidental click)
      const dist = Math.hypot(x - ds.startX, y - ds.startY);
      if (dist >= 3) {
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
  }, [redrawCanvas]);

  // Cursor style for canvas
  const getCanvasCursor = () => {
    if (!drawMode) return 'default';
    return 'crosshair';
  };

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height, position: 'relative' }}
    >
      {/* lightweight-charts mounts here — pointer-events blocked by canvas when drawMode */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0, left: 0,
          width: '100%', height: '100%',
          pointerEvents: drawMode ? 'all' : 'none',
          cursor: getCanvasCursor(),
          zIndex: 10,
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      />
    </div>
  );
});

CandleChart.displayName = 'CandleChart';
export default CandleChart;
