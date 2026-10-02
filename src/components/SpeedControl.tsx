import { useEffect, useId, useRef, useState } from 'react';

const MIN_SPEED = 15;
const MAX_SPEED = 175;
const SPEED_MARKS = [15, 25, 50, 75, 100, 125, 150, 175];

interface Props {
  originalBpm: number;
  percent: number;
  disabled: boolean;
  onChange: (percent: number) => void;
}

export function SpeedControl({ originalBpm, percent, disabled, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const slider = useRef<HTMLInputElement>(null);
  const panelId = useId();
  const bpm = Math.round(originalBpm * percent / 100);
  const setPercent = (value: number) => {
    if (Number.isFinite(value)) onChange(Math.max(MIN_SPEED, Math.min(MAX_SPEED, value)));
  };
  const setBpm = (value: number) => {
    if (value > 0 && Number.isFinite(value)) setPercent(value / Math.max(1, originalBpm) * 100);
  };

  useEffect(() => {
    if (!open) return;
    slider.current?.focus();
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !host.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  return (
    <div className="speed-control" ref={host}>
      <button className="speed-trigger" ref={trigger} disabled={disabled} aria-label="Playback speed"
        aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(!open)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17a9 9 0 1 1 16 0M12 12l4-4" /><circle cx="12" cy="12" r="1.5" /></svg>
        <span>Speed</span><strong>{Math.round(percent)}%</strong>
        <svg className="speed-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>
      </button>
      {open && <div id={panelId} className="speed-panel" role="dialog" aria-label="Playback speed settings">
        <div className="speed-panel-heading"><span>Playback speed</span><strong>{Math.round(percent)}<small>%</small></strong></div>
        <div className="speed-bpm-row">
          <span>Tempo</span>
          <div className="speed-bpm-control">
            <button type="button" aria-label="Decrease tempo" onClick={() => setBpm(bpm - 5)}>−</button>
            <input aria-label="Tempo" type="number" min={Math.max(1, Math.round(originalBpm * MIN_SPEED / 100))}
              max={Math.round(originalBpm * MAX_SPEED / 100)} value={bpm} onChange={event => setBpm(Number(event.target.value))} />
            <span>BPM</span>
            <button type="button" aria-label="Increase tempo" onClick={() => setBpm(bpm + 5)}>+</button>
          </div>
        </div>
        <div className="speed-ruler" aria-hidden="true">
          {SPEED_MARKS.map(mark => <span key={mark} className={Math.abs(percent - mark) < 0.5 ? 'is-selected' : ''}
            style={{ left: `${(mark - MIN_SPEED) / (MAX_SPEED - MIN_SPEED) * 100}%`, height: `${24 + mark * 0.38}px` }}>
            <b>{mark}</b>
          </span>)}
        </div>
        <input className="speed-slider" ref={slider} aria-label="Playback speed percent" type="range"
          min={MIN_SPEED} max={MAX_SPEED} step="1" value={percent} aria-valuetext={`${Math.round(percent)} percent, ${bpm} BPM`}
          onChange={event => setPercent(Number(event.target.value))} />
        <div className="speed-presets" aria-label="Speed presets">
          {[50, 75, 100, 125].map(value => <button key={value} type="button" aria-pressed={Math.abs(percent - value) < 0.5}
            onClick={() => setPercent(value)}>{value === 100 ? 'Original · 100%' : `${value}%`}</button>)}
        </div>
      </div>}
    </div>
  );
}
