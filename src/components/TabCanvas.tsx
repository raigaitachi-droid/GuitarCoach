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
  const draggedEndNote = useRef<TabNote | null>(null);
  const transitions = useRef(new Map<string, { state: TabNote['hitState']; at: number }>());
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
        ctx.strokeStyle = string === 1 || string === 6 ? '#3b4847' : '#354140';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(44, y); ctx.lineTo(rect.width - 24, y); ctx.stroke();
        ctx.fillStyle = '#a9bcb5';
        ctx.font = '600 14px ui-monospace, monospace';
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
        // Fill a snapped pixel column instead of stroking a fractional canvas
        // coordinate; this keeps the bar boundary visibly solid on every DPR.
        ctx.fillStyle = '#465152';
        ctx.fillRect(Math.round(x) - 1, 36, 3, rect.height - 66);
      }
      // The fixed play position stays distinct from the moving loop brackets.
      ctx.fillStyle = 'rgba(137, 217, 168, 0.07)';
      ctx.fillRect(Math.round(hitX) - 9, 36, 18, rect.height - 66);
      ctx.fillStyle = '#8fbba6';
      ctx.fillRect(Math.round(hitX) - 1, 36, 2, rect.height - 66);
      const visible = notes.filter((note) => xAt(note.timestampMs) >= 32 && xAt(note.timestampMs) <= rect.width + 32);
      const frameTime = performance.now();
      for (const note of visible) {
        const x = xAt(note.timestampMs);
        const y = yAt(note.string);
        const next = notes.find((candidate) => candidate.string === note.string && candidate.timestampMs > note.timestampMs);
        const radius = note.fret >= 10 ? 20 : 17;
        const successful = note.hitState === 'hit' || note.hitState === 'close';
        const missed = note.hitState === 'miss' || note.hitState === 'wrong';
        const previousTransition = transitions.current.get(note.id);
        if (previousTransition?.state !== note.hitState) {
          transitions.current.set(note.id, { state: note.hitState, at: frameTime });
        }
        const transition = transitions.current.get(note.id);
        const response = transition && (successful || missed) ? Math.max(0, 1 - (frameTime - transition.at) / 520) : 0;
        const waiting = note.id === waitingId;
        const approaching = !note.hitState && Math.abs(note.timestampMs - now) <= 160;
        const pulse = waiting ? 0.5 + 0.5 * Math.sin(frameTime / 340) : 0;
        const foreground = successful ? '#a9e4ba' : missed ? '#eeaaa2' : '#f0f4ef';
        const background = successful ? '#20362b' : missed ? '#392a29' : waiting ? '#244037' : '#222c2b';
        const sustainEnd = Math.min(note.timestampMs + note.durationMs, next?.timestampMs ?? Infinity);
        const sustainX = xAt(sustainEnd);
        if (sustainX - x > radius + 10) {
          ctx.strokeStyle = successful ? '#6eaa83' : missed ? '#9e6660' : '#758e85';
          ctx.lineWidth = 3;
          ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(x + radius - 1, y); ctx.lineTo(sustainX, y); ctx.stroke();
          ctx.lineCap = 'butt';
          ctx.lineWidth = 1;
        }
        if (response > 0 || waiting || approaching) {
          ctx.fillStyle = successful ? `rgba(137, 217, 168, ${0.16 * response})`
            : missed ? `rgba(242, 147, 147, ${0.13 * response})`
            : `rgba(137, 217, 168, ${waiting ? 0.07 + 0.08 * pulse : 0.07})`;
          ctx.beginPath(); ctx.arc(x, y, radius + 9 + 4 * response, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = background;
        ctx.strokeStyle = successful ? '#89d9a8' : missed ? '#c47e79' : waiting ? '#a9e4ba' : approaching ? '#96c5a8' : '#66827a';
        ctx.lineWidth = waiting ? 2.5 : 1.5;
        ctx.beginPath(); ctx.roundRect(x - radius, y - 17, radius * 2, 34, 7); ctx.fill(); ctx.stroke();
        ctx.lineWidth = 1;
        if (note.id === waitingId) {
          ctx.strokeStyle = `rgba(169, 228, 186, ${0.28 + 0.28 * pulse})`;
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.roundRect(x - radius - 4, y - 21, radius * 2 + 8, 42, 9); ctx.stroke();
          ctx.lineWidth = 1;
        }
        if (note.id === loopStartId || note.id === loopEndId) {
          ctx.strokeStyle = note.id === loopStartId ? '#8ecfb0' : '#d9bd82';
          ctx.lineWidth = 2;
          ctx.strokeRect(x - radius - 7, y - 22, radius * 2 + 14, 44);
          ctx.lineWidth = 1;
        }
        ctx.fillStyle = foreground;
        ctx.font = '700 23px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(String(note.fret), x, y);
        if (response > 0) {
          ctx.globalAlpha = response;
          ctx.font = '700 13px system-ui, sans-serif';
          ctx.fillText(successful ? '✓' : '×', x, y + 29);
          ctx.globalAlpha = 1;
        }
        if (successful && response > 0 && Math.abs(note.timingOffsetMs ?? 0) > 80) {
          ctx.globalAlpha = response;
          ctx.fillStyle = '#b9c9bd';
          ctx.font = '600 10px system-ui, sans-serif';
          ctx.fillText((note.timingOffsetMs ?? 0) < 0 ? 'EARLY' : 'LATE', x, y + 43);
          ctx.globalAlpha = 1;
        }
        const technique = note.isHarmonic ? '◇' : note.isHammerOn ? 'H' : note.isPullOff ? 'P' : note.technique === 'slide' ? '/' : note.technique === 'bend' ? '↗' : null;
        if (technique) {
          ctx.font = '700 12px system-ui, sans-serif';
          ctx.fillStyle = '#b3c7bb';
          ctx.fillText(technique, x, y - 30);
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
        ctx.fillStyle = isDragging ? 'rgba(5, 8, 9, 0.44)' : 'rgba(5, 8, 9, 0.56)';
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
