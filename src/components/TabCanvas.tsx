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
const STRING_LABEL_COLORS = ['rgba(188, 103, 223, .74)', 'rgba(74, 203, 137, .72)', 'rgba(138, 155, 255, .72)', 'rgba(224, 109, 88, .72)', 'rgba(54, 200, 191, .72)', 'rgba(230, 168, 79, .74)'];
const FRET_DIGIT_FONT = '"Inter", "Manrope", "Space Grotesk", "Aptos", "Segoe UI", system-ui, sans-serif';
const TABULAR_DIGITS = '0123456789';
const drawCenteredTabularText = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number) => {
  const advance = Math.max(...Array.from(TABULAR_DIGITS, (digit) => ctx.measureText(digit).width));
  const totalWidth = advance * text.length;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let index = 0; index < text.length; index++) {
    const slotCenter = x - totalWidth / 2 + advance * (index + 0.5);
    ctx.fillText(text[index], slotCenter, y);
  }
  ctx.restore();
};

const drawBendMarker = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
  ctx.save();
  ctx.font = '800 11px ' + FRET_DIGIT_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(3, 8, 12, .92)';
  ctx.fillStyle = 'rgba(236, 246, 245, .92)';
  ctx.strokeText('b', x, y);
  ctx.fillText('b', x, y);
  ctx.restore();
};

// Retains the existing scrolling tab geometry, fret labels, sustain lengths,
// and legato marks. Decorative effects and game overlays are removed.
export function TabCanvas({ notes, playbackMs, tempo, waitingId, loopStartId, loopEndId, selectingLoop, onLoopSelect }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const view = useRef({ notes, playbackMs, tempo, waitingId, loopStartId, loopEndId, selectingLoop, onLoopSelect });
  const draggedNote = useRef<TabNote | null>(null);
  const draggedEndNote = useRef<TabNote | null>(null);
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
      ctx.clearRect(0, 0, rect.width, rect.height);
      const panelWash = ctx.createLinearGradient(0, 0, 0, rect.height);
      panelWash.addColorStop(0, 'rgba(12, 26, 38, .26)');
      panelWash.addColorStop(0.38, 'rgba(6, 14, 22, .18)');
      panelWash.addColorStop(1, 'rgba(2, 7, 13, .34)');
      ctx.fillStyle = panelWash;
      ctx.fillRect(0, 0, rect.width, rect.height);
      const { notes, playbackMs: now, waitingId, loopStartId, loopEndId, selectingLoop } = view.current;
      const hitX = rect.width * 0.18;
      const visibleWindowMs = 4500;
      const laneHeight = (rect.height - 80) / 6;
      const xAt = (time: number) => hitX + (time - now) / visibleWindowMs * (rect.width - hitX);
      const yAt = (string: number) => 40 + laneHeight * (string - 0.5);
      ctx.font = '600 14px ui-monospace, monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      for (let string = 1; string <= 6; string++) {
        const y = yAt(string);
        ctx.strokeStyle = 'rgba(196, 218, 224, .16)';
        ctx.lineWidth = 0.75;
        ctx.beginPath(); ctx.moveTo(44, y); ctx.lineTo(rect.width - 24, y); ctx.stroke();
        ctx.fillStyle = STRING_LABEL_COLORS[string - 1];
        ctx.fillText(STRING_NAMES[string - 1], 20, y);
      }
      // Use imported measure indices for labels instead of inventing 4/4 bars.
      const measures = new Set<number>();
      for (const note of notes) {
        if (!note.measureIndex || measures.has(note.measureIndex)) continue;
        measures.add(note.measureIndex);
        const x = xAt(note.timestampMs);
        if (x < 50 || x > rect.width - 30) continue;
        ctx.fillStyle = 'rgba(194, 211, 216, .7)';
        ctx.font = '600 13px ui-monospace, monospace';
        ctx.fillText(`Bar ${note.measureIndex}`, Math.min(x, rect.width - 70), 20);
        ctx.font = '600 14px ui-monospace, monospace';
        // Fill a snapped pixel column instead of stroking a fractional canvas
        // coordinate; this keeps the bar boundary visibly solid on every DPR.
        ctx.fillStyle = 'rgba(185, 210, 218, .24)';
        ctx.fillRect(Math.round(x) - 1, 36, 2, rect.height - 66);
      }
      ctx.strokeStyle = 'rgba(126, 255, 229, .56)';
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
          ctx.strokeStyle = 'rgba(168, 190, 190, .24)';
          ctx.beginPath(); ctx.moveTo(x + radius, y); ctx.lineTo(x + sustain, y); ctx.stroke();
        }
        ctx.fillStyle = 'rgba(3, 9, 15, .58)';
        ctx.fillRect(x - radius, y - 15, radius * 2, 30);
        if (note.id === waitingId) {
          ctx.strokeStyle = 'rgba(126, 255, 229, .56)';
          ctx.strokeRect(x - radius - 4, y - 19, radius * 2 + 8, 38);
        }
        if (note.id === loopStartId || note.id === loopEndId) {
          ctx.strokeStyle = note.id === loopStartId ? '#8ecfb0' : '#d9bd82';
          ctx.lineWidth = 2;
          ctx.strokeRect(x - radius - 7, y - 22, radius * 2 + 14, 44);
          ctx.lineWidth = 1;
        }
        ctx.fillStyle = color;
        ctx.font = '750 20px ' + FRET_DIGIT_FONT;
        ctx.textAlign = 'center';
        drawCenteredTabularText(ctx, String(note.fret), x, y);
        if (note.isBend) {
          drawBendMarker(ctx, x + radius + 5, y - 16);
        }
        if (note.hitState === 'hit' || note.hitState === 'miss') {
          ctx.font = '12px system-ui, sans-serif';
          ctx.fillText(note.hitState === 'hit' ? '✓' : '×', x, y + 22);
        }
        if (note.isHarmonic || note.isHammerOn || note.isPullOff) {
          ctx.font = '10px system-ui, sans-serif';
          ctx.fillStyle = 'rgba(182, 199, 204, .72)';
          ctx.fillText(note.isHarmonic ? '◇' : note.isHammerOn ? 'H' : 'P', x, y - 24);
        }
      }
      const isDragging = Boolean(draggedNote.current && draggedEndNote.current);
      const loopStart = draggedNote.current || (loopStartId ? notes.find((note) => note.id === loopStartId) : undefined);
      const loopEnd = draggedEndNote.current || (loopEndId ? notes.find((note) => note.id === loopEndId) : undefined);
      if (loopStart && loopEnd) {
        // Leave a small visual lead-in before the first selected fret so the
        // left boundary reads as a bracket, rather than crossing the note box.
        const startX = Math.max(44, xAt(loopStart.timestampMs) - 24);
        const endX = xAt(loopEnd.timestampMs + loopEnd.durationMs);
        const left = Math.min(startX, endX);
        const right = Math.max(startX, endX);
        // Dim the unselected timeline so the chosen musical phrase remains the
        // only visually dominant part of the tab.
        ctx.fillStyle = isDragging ? 'rgba(2, 6, 10, 0.34)' : 'rgba(2, 6, 10, 0.48)';
        ctx.fillRect(0, 0, Math.max(0, left), rect.height);
        ctx.fillRect(Math.min(rect.width, right), 0, Math.max(0, rect.width - right), rect.height);
        ctx.fillStyle = isDragging ? '#b8a8e5' : '#8ecfb0';
        ctx.fillRect(Math.round(startX) - 2, 32, 4, rect.height - 58);
        // The right-hand vertical boundary makes the exact end of the loop
        // legible even when the final note has a long sustain.
        ctx.fillStyle = isDragging ? '#b8a8e5' : '#d9bd82';
        ctx.fillRect(Math.round(endX) - 2, 32, 4, rect.height - 58);
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
    const xAt = (time: number) => hitX + (time - view.current.playbackMs) / visibleWindowMs * (rect.width - hitX);
    const x = event.clientX - rect.left;
    const candidate = view.current.notes
      .filter((note) => xAt(note.timestampMs) >= 48 && xAt(note.timestampMs) <= rect.width + 24)
      // Snap by horizontal timeline position. This means the guitarist can
      // begin/end a drag in the empty space between strings and still select
      // the musically nearest note.
      .map((note) => ({ note, distance: Math.abs(xAt(note.timestampMs) - x) }))
      .sort((a, b) => a.distance - b.distance || a.note.string - b.note.string)[0];
    return candidate?.note || null;
  };

  const selecting = Boolean(selectingLoop);
  const startDrag = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!selecting || !view.current.onLoopSelect) return;
    const note = noteAtPointer(event);
    if (!note) return;
    draggedNote.current = note;
    draggedEndNote.current = note;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };
  const finishDrag = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!draggedNote.current || !view.current.onLoopSelect) return;
    const start = draggedNote.current;
    const end = noteAtPointer(event) || draggedEndNote.current;
    draggedNote.current = null;
    draggedEndNote.current = null;
    if (end) view.current.onLoopSelect(start, end);
    event.preventDefault();
  };
  const previewDrag = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!draggedNote.current) return;
    draggedEndNote.current = noteAtPointer(event);
  };
  const cancelDrag = () => {
    draggedNote.current = null;
    draggedEndNote.current = null;
  };
  return <div className={selecting ? 'tab-surface is-selecting-loop' : 'tab-surface'}>
    <canvas ref={canvasRef} onPointerDown={startDrag} onPointerMove={previewDrag} onPointerUp={finishDrag} onPointerCancel={cancelDrag} role="img" aria-label={selecting ? 'Drag from the first note to the last note to set the loop' : 'Scrolling guitar tablature. Fret numbers appear on six strings; correct notes turn green and missed notes turn red.'} />
  </div>;
}
