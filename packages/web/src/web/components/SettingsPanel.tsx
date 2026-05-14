import type { ScannerSettings } from '../lib/smcEngine';
import { COLORS } from '../lib/constants';

type Props = {
  settings: ScannerSettings;
  onChange: (s: ScannerSettings) => void;
  onClose: () => void;
};

function Row({ label, desc, children }: { label: string; desc: string; children: React.ReactNode }) {
  return (
    <div style={{
      padding: '10px 14px',
      borderBottom: `1px solid ${COLORS.border}`,
      display: 'flex',
      flexDirection: 'column',
      gap: 5,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: COLORS.neutral, fontSize: 10, letterSpacing: 0.5 }}>{label}</span>
        {children}
      </div>
      <span style={{ color: COLORS.label, fontSize: 9 }}>{desc}</span>
    </div>
  );
}

const inputStyle = {
  background: '#0f0f0f',
  border: `1px solid ${COLORS.border}`,
  color: COLORS.white,
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 11,
  padding: '3px 7px',
  width: 70,
  outline: 'none',
  textAlign: 'right' as const,
};

export default function SettingsPanel({ settings, onChange, onClose }: Props) {
  const set = (key: keyof ScannerSettings, val: number) => {
    onChange({ ...settings, [key]: val });
  };

  return (
    <div style={{
      position: 'fixed',
      top: 44,
      right: 0,
      width: 280,
      background: '#080808',
      border: `1px solid ${COLORS.border}`,
      borderTop: 'none',
      zIndex: 500,
      fontFamily: "'JetBrains Mono', monospace",
      boxShadow: '-8px 4px 32px rgba(0,0,0,0.8)',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 14px',
        borderBottom: `1px solid ${COLORS.border}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span style={{ color: COLORS.neutral, fontSize: 10, letterSpacing: 2 }}>SCANNER SETTINGS</span>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: COLORS.label,
            cursor: 'pointer',
            fontSize: 14,
            lineHeight: 1,
            padding: 2,
          }}
        >
          ✕
        </button>
      </div>

      <Row
        label="FVG MIN SIZE"
        desc="Minimum gap size to qualify as FVG. 0 = detect all. Higher = only significant gaps."
      >
        <input
          type="number"
          min={0}
          step={0.001}
          value={settings.fvgMinSize}
          onChange={e => set('fvgMinSize', Math.max(0, parseFloat(e.target.value) || 0))}
          style={inputStyle}
        />
      </Row>

      <Row
        label="SWEEP BUFFER"
        desc="Extra price units wick must penetrate beyond swing high/low to count as sweep. 0 = any wick."
      >
        <input
          type="number"
          min={0}
          step={0.001}
          value={settings.sweepBuffer}
          onChange={e => set('sweepBuffer', Math.max(0, parseFloat(e.target.value) || 0))}
          style={inputStyle}
        />
      </Row>

      <Row
        label="SETUP EXPIRY (candles)"
        desc="How many LTF candles before a sweep/MSS/FVG is considered expired. 0 = no expiry."
      >
        <input
          type="number"
          min={0}
          step={1}
          value={settings.setupExpiryCandles}
          onChange={e => set('setupExpiryCandles', Math.max(0, parseInt(e.target.value) || 0))}
          style={inputStyle}
        />
      </Row>

      {/* Reset */}
      <div style={{ padding: '10px 14px' }}>
        <button
          onClick={() => onChange({ fvgMinSize: 0, sweepBuffer: 0, setupExpiryCandles: 30 })}
          style={{
            background: 'transparent',
            border: `1px solid ${COLORS.border}`,
            color: COLORS.label,
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 9,
            letterSpacing: 1,
            padding: '5px 10px',
            cursor: 'pointer',
            width: '100%',
          }}
        >
          RESET DEFAULTS
        </button>
      </div>
    </div>
  );
}
