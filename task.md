# SMC Scanner Build

## Status
- [x] derivWS.ts — WebSocket manager
- [x] smcEngine.ts — FVG, Sweep, MSS, Bias, Setup validator
- [x] constants.ts — Symbols, timeframes, colors
- [x] useDerivCandles.ts — hook
- [x] useConnection.ts — hook
- [x] CandleChart.tsx — lightweight-charts component
- [x] SetupPanel.tsx — conditions checklist
- [x] AlertBanner.tsx — in-app alerts
- [ ] Main page (index.tsx) — split layout, header, all panels
- [ ] styles.css update — JetBrains Mono, terminal theme
- [ ] Mobile (Expo) — scanner screen
- [ ] Build check
- [ ] Deliver

## Key decisions
- Deriv WS: wss://ws.binaryws.com/websockets/v3?app_id=1089
- Token baked into .env, not hardcoded
- lightweight-charts v5 for both panels
- No confidence %, use 4/4 checklist instead
- JetBrains Mono terminal aesthetic (bloomberg style)
- Defaults: V10 1s + V100, 4H HTF + 5m LTF
