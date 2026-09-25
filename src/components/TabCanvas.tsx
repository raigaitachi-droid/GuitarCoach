import { useEffect, useRef } from 'react';
import { TabNote } from '../types';

interface Props { notes: TabNote[]; playbackMs: number; tempo: number; waitingId?: string }
const STRING_NAMES = ['e', 'B', 'G', 'D', 'A', 'E'];

// Retains the existing scrolling tab geometry, fret labels, sustain lengths,
// and legato marks. Decorative effects and game overlays are removed.
export function TabCanvas({ notes, playbackMs, tempo, waitingId }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const view = useRef({ notes, playbackMs, tempo, waitingId });
  view.current = { notes, playbackMs, tempo, waitingId };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let frame = 0;
    const draw = () => {
      const rect = canvas.parentElement!.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) {
        canvas.width = Math.round(rect.width * dpr);
        canvas.height = Math.round(rect.height * dpr);
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#15191b';
      ctx.fillRect(0, 0, rect.width, rect.height);
      const { notes, playbackMs: now, waitingId } = view.current;
      const hitX = rect.width * 0.18;
      const visibleWindowMs = 4500;
      const laneHeight = (rect.height - 80) / 6;
      const xAt = (time: number) => hitX + (time - now) / visibleWindowMs * (rect.width - hitX);
      const yAt = (string: number) => 40 + laneHeight * (string - 0.5);
      ctx.font = '14px ui-monospace, monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      for (let string = 1; string <= 6; string++) {
        const y = yAt(string);
        ctx.strokeStyle = '#41494b';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(44, y); ctx.lineTo(rect.width - 24, y); ctx.stroke();
        ctx.fillStyle = '#a2aba9';
        ctx.fillText(STRING_NAMES[string - 1], 20, y);
      }
      // Use imported measure indices for labels instead of inventing 4/4 bars.
      const measures = new Set<number>();
      for (const note of notes) {
        if (!note.measureIndex || measures.has(note.measureIndex)) continue;
        measures.add(note.measureIndex);
        const x = xAt(note.timestampMs);
        if (x < 50 || x > rect.width - 30) continue;
        ctx.fillStyle = '#929b99';
        ctx.fillText(`Bar ${note.measureIndex}`, Math.min(x, rect.width - 70), 20);
        ctx.strokeStyle = '#2a3032';
        ctx.beginPath(); ctx.moveTo(x, 36); ctx.lineTo(x, rect.height - 30); ctx.stroke();
      }
      ctx.strokeStyle = '#99b9a5';
      ctx.beginPath(); ctx.moveTo(hitX, 36); ctx.lineTo(hitX, rect.height - 30); ctx.stroke();
      const visible = notes.filter((note) => xAt(note.timestampMs) >= 48 && xAt(note.timestampMs) <= rect.width + 24);
      for (const note of visible) {
        const x = xAt(note.timestampMs);
        const y = yAt(note.string);
        const next = notes.find((candidate) => candidate.string === note.string && candidate.timestampMs > note.timestampMs);
        const gap = next ? xAt(next.timestampMs) - x : 100;
        const radius = Math.max(9, Math.min(16, (gap - 4) / 2));
        const color = note.hitState === 'hit' ? '#89d9a8' : note.hitState === 'miss' || note.hitState === 'wrong' ? '#f29393' : '#e3e8e4';
        const sustain = Math.min(xAt(note.timestampMs + note.durationMs) - x, gap - radius - 4);
        if (sustain > 20) {
          ctx.strokeStyle = '#59615e';
          ctx.beginPath(); ctx.moveTo(x + radius, y); ctx.lineTo(x + sustain, y); ctx.stroke();
        }
        ctx.fillStyle = '#15191b';
        ctx.fillRect(x - radius, y - 15, radius * 2, 30);
        if (note.id === waitingId) {
          ctx.strokeStyle = '#99b9a5';
          ctx.strokeRect(x - radius - 4, y - 19, radius * 2 + 8, 38);
        }
        ctx.fillStyle = color;
        ctx.font = '600 20px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(String(note.fret), x, y);
        if (note.hitState === 'hit' || note.hitState === 'miss') {
          ctx.font = '12px system-ui, sans-serif';
          ctx.fillText(note.hitState === 'hit' ? '✓' : '×', x, y + 22);
        }
        if (note.isHarmonic || note.isHammerOn || note.isPullOff) {
          ctx.font = '10px system-ui, sans-serif';
          ctx.fillStyle = '#a2aba9';
          ctx.fillText(note.isHarmonic ? '◇' : note.isHammerOn ? 'H' : 'P', x, y - 24);
        }
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);

  return <div className="tab-surface"><canvas ref={canvasRef} role="img" aria-label="Scrolling guitar tablature. Fret numbers appear on six strings; correct notes turn green and missed notes turn red." /></div>;
}
