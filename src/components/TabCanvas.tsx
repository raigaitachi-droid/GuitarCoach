import { PointerEvent, useEffect, useRef } from 'react';
import { TabNote } from '../types';

interface Props {
  notes: TabNote[];
  playbackMs: number;
  tempo: number;
  waitingId?: string;
  loopStartId?: string;
  loopEndId?: string;
  selectingLoop?: boolean;
  onLoopSelect?: (start: TabNote, end: TabNote) => void;
}
const STRING_NAMES = ['e', 'B', 'G', 'D', 'A', 'E'];

// Retains the existing scrolling tab geometry, fret labels, sustain lengths,
// and legato marks. Decorative effects and game overlays are removed.
export function TabCanvas({ notes, playbackMs, tempo, waitingId, loopStartId, loopEndId, selectingLoop, onLoopSelect }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const view = useRef({ notes, playbackMs, tempo, waitingId, loopStartId, loopEndId, selectingLoop, onLoopSelect });
  const draggedNote = useRef<TabNote | null>(null);
  view.current = { notes, playbackMs, tempo, waitingId, loopStartId, loopEndId, selectingLoop, onLoopSelect };

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
      const { notes, playbackMs: now, waitingId, loopStartId, loopEndId, selectingLoop } = view.current;
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
        if (note.id === loopStartId || note.id === loopEndId) {
          ctx.strokeStyle = note.id === loopStartId ? '#8ecfb0' : '#d9bd82';
          ctx.lineWidth = 2;
          ctx.strokeRect(x - radius - 7, y - 22, radius * 2 + 14, 44);
          ctx.lineWidth = 1;
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

  const noteAtPointer = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const hitX = rect.width * 0.18;
    const visibleWindowMs = 4500;
    const laneHeight = (rect.height - 80) / 6;
    const xAt = (time: number) => hitX + (time - view.current.playbackMs) / visibleWindowMs * (rect.width - hitX);
    const yAt = (string: number) => 40 + laneHeight * (string - 0.5);
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const candidate = view.current.notes
      .filter((note) => xAt(note.timestampMs) >= 48 && xAt(note.timestampMs) <= rect.width + 24)
      .map((note) => ({ note, distance: Math.hypot(xAt(note.timestampMs) - x, yAt(note.string) - y) }))
      .filter((entry) => entry.distance <= 30)
      .sort((a, b) => a.distance - b.distance)[0];
    return candidate?.note || null;
  };

  const selecting = Boolean(selectingLoop);
  const startDrag = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!selecting || !view.current.onLoopSelect) return;
    const note = noteAtPointer(event);
    if (!note) return;
    draggedNote.current = note;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };
  const finishDrag = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!draggedNote.current || !view.current.onLoopSelect) return;
    const start = draggedNote.current;
    draggedNote.current = null;
    const end = noteAtPointer(event);
    if (end) view.current.onLoopSelect(start, end);
    event.preventDefault();
  };
  return <div className={selecting ? 'tab-surface is-selecting-loop' : 'tab-surface'}>
    <canvas ref={canvasRef} onPointerDown={startDrag} onPointerUp={finishDrag} role="img" aria-label={selecting ? 'Drag from the first note to the last note to set the loop' : 'Scrolling guitar tablature. Fret numbers appear on six strings; correct notes turn green and missed notes turn red.'} />
  </div>;
}
