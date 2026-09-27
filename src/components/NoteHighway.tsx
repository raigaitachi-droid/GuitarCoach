import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { TabNote } from '../types';
import { firstHighwayNote, HIGHWAY_LENGTH, HIGHWAY_LOOKAHEAD_MS, HIGHWAY_PAST_MS, highwayLaneX, highwayNotes, highwayNoteZ } from '../utils/noteHighway';

interface Props {
  notes: readonly TabNote[];
  playbackMs: number;
}

const COLORS = [0xed7492, 0xe9ba65, 0x9bce75, 0x62cbb8, 0x72a9eb, 0xb49aeb];

export function NoteHighway({ notes, playbackMs }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sortedNotes = useMemo(() => highwayNotes(notes), [notes]);
  const view = useRef({ notes: sortedNotes, playbackMs });
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => { view.current = { notes: sortedNotes, playbackMs }; }, [sortedNotes, playbackMs]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      setUnavailable(true);
      return;
    }
    setUnavailable(false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x101719);
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.setAttribute('aria-label', '3D guitar note highway. Six strings from string 6 on the left to string 1 on the right; fret numbers approach the hit line.');
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x101719, 24, 53);
    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 90);
    camera.position.set(0, 7.5, 10);
    camera.lookAt(0, 0, -11);
    const geometries: THREE.BufferGeometry[] = [];
    const materials: THREE.Material[] = [];
    const textures: THREE.Texture[] = [];
    const box = (width: number, height: number, depth: number, color: number, x: number, y: number, z: number) => {
      const geometry = new THREE.BoxGeometry(width, height, depth);
      const material = new THREE.MeshBasicMaterial({ color });
      geometries.push(geometry);
      materials.push(material);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      scene.add(mesh);
    };
    box(7.7, 0.12, HIGHWAY_LENGTH + 4, 0x1b252b, 0, -0.12, -HIGHWAY_LENGTH / 2 + 1);
    for (let string = 6; string >= 1; string--) {
      box(0.035, 0.025, HIGHWAY_LENGTH + 3, COLORS[6 - string], highwayLaneX(string), 0, -HIGHWAY_LENGTH / 2 + 1);
    }
    for (const x of [-3.85, 3.85]) box(0.06, 0.08, HIGHWAY_LENGTH + 4, 0x536d79, x, 0, -HIGHWAY_LENGTH / 2 + 1);
    box(7.7, 0.06, 0.15, 0xd4f8eb, 0, 0.04, 0);

    // Share geometry and cache fret textures; create objects only in the visible
    // window. The existing tab clock owns pause, tempo, waiting and loop rewinds.
    const noteGeometry = new THREE.BoxGeometry(0.88, 0.16, 0.46);
    geometries.push(noteGeometry);
    const laneMaterials = COLORS.map((color) => {
      const material = new THREE.MeshBasicMaterial({ color });
      materials.push(material);
      return material;
    });
    const fretMaterials = new Map<number, THREE.SpriteMaterial>();
    const fretMaterial = (fret: number) => {
      const cached = fretMaterials.get(fret);
      if (cached) return cached;
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#101719';
      context.beginPath();
      context.roundRect(6, 12, 116, 104, 22);
      context.fill();
      context.fillStyle = '#ffffff';
      context.font = 'bold ' + (fret < 100 ? 74 : 52) + 'px monospace';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(String(fret), 64, 66);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      textures.push(texture);
      const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, fog: true });
      materials.push(material);
      fretMaterials.set(fret, material);
      return material;
    };
    const active = new Map<TabNote, THREE.Group>();
    let frame = 0;
    let lost = false;
    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      renderer.setSize(width, height);
      camera.aspect = width / height;
      // Keep all six lanes visible on narrow windows.
      camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.max(Math.tan(THREE.MathUtils.degToRad(24)), 0.48 / camera.aspect)));
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    const draw = () => {
      if (lost) return;
      const current = view.current;
      const visible = new Set<TabNote>();
      const start = firstHighwayNote(current.notes, current.playbackMs - HIGHWAY_PAST_MS);
      for (let i = start; i < current.notes.length; i++) {
        const note = current.notes[i];
        if (note.timestampMs > current.playbackMs + HIGHWAY_LOOKAHEAD_MS) break;
        visible.add(note);
        let group = active.get(note);
        if (!group) {
          group = new THREE.Group();
          group.add(new THREE.Mesh(noteGeometry, laneMaterials[6 - note.string]));
          const label = new THREE.Sprite(fretMaterial(note.fret));
          label.position.y = 0.44;
          label.scale.set(0.72, 0.72, 1);
          group.add(label);
          scene.add(group);
          active.set(note, group);
        }
        group.position.set(highwayLaneX(note.string), 0.14, highwayNoteZ(note.timestampMs, current.playbackMs));
      }
      for (const [note, group] of active) {
        if (!visible.has(note)) { scene.remove(group); active.delete(note); }
      }
      renderer.render(scene, camera);
      frame = requestAnimationFrame(draw);
    };
    const contextLost = (event: Event) => {
      event.preventDefault();
      lost = true;
      cancelAnimationFrame(frame);
      setUnavailable(true);
    };
    const contextRestored = () => {
      lost = false;
      setUnavailable(false);
      resize();
      frame = requestAnimationFrame(draw);
    };
    renderer.domElement.addEventListener('webglcontextlost', contextLost);
    renderer.domElement.addEventListener('webglcontextrestored', contextRestored);
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener('webglcontextlost', contextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', contextRestored);
      scene.clear();
      active.clear();
      textures.forEach((texture) => texture.dispose());
      materials.forEach((material) => material.dispose());
      geometries.forEach((geometry) => geometry.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, []);

  return <section className="note-highway" aria-label="3D guitar highway">
    <div ref={hostRef} className="note-highway-canvas" />
    {unavailable
      ? <p className="note-highway-fallback">3D view is unavailable. Continue with the tablature below.</p>
      : <><p className="note-highway-caption">Play at the bright hit line</p><p className="note-highway-strings">String 6 <span>String 1</span></p></>}
  </section>;
}
