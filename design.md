# SMC Scanner — Design Direction

## Aesthetic
Bloomberg terminal meets modern trading platform. Pure dark, data-dense, zero decoration.

## Colors
- Background: `#000000`
- Surface / panels: `#0a0a0a`, `#111111`
- Borders: `#1e1e1e`
- Bull / Green: `#00ff88` (bright terminal green)
- Bear / Red: `#ff3b3b`
- Neutral / Label: `#888888`
- Highlight / Active: `#ffffff`
- FVG Bullish fill: `rgba(0,255,136,0.08)`
- FVG Bearish fill: `rgba(255,59,59,0.08)`
- MSS marker: `#f5c518`
- Sweep marker: `#ff9900`

## Typography
- Font: `JetBrains Mono` (monospace, terminal feel)
- Fallback: `'Courier New', monospace`
- Sizes: xs=10px, sm=11px, base=12px, md=13px, lg=14px, xl=16px
- All labels UPPERCASE

## Layout
- Full viewport, no scroll
- Header bar (32px): symbol selector, TF selectors, overlay toggles, connection status
- Main area: 50/50 split (resizable later) HTF left | LTF right
- Bottom status bar (28px): Setup scanner status — Bias / Sweep / MSS / Active Setup
- Setup panel (right sidebar, 200px): checklist of conditions

## Chart Style
- Lightweight-charts v5
- Dark background matching app
- Grid lines: very subtle `#1a1a1a`
- Crosshair: white dashed
- Up candle: `#00ff88` fill, `#00ff88` wick
- Down candle: `#ff3b3b` fill, `#ff3b3b` wick

## Mobile
- Stack layout (HTF top, LTF bottom)
- Bottom tab: Charts | Scanner | Settings
- Same terminal color palette
