import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { TabNote } from '../types';
import { firstHighwayNote, HIGHWAY_LENGTH, HIGHWAY_LOOKAHEAD_MS, HIGHWAY_PAST_MS, highwayLaneX, highwayNotes, highwayNoteZ } from '../utils/noteHighway';

interface Props {
  notes: readonly TabNote[];
  playbackMs: number;
}

const COLORS = [0xff6f91, 0xffc15e, 0xa4df72, 0x55dbc7, 0x68b7ff, 0xbc8cff];
const LANE_COUNT = 6;
const HIGHWAY_WIDTH = 8.9;

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
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    } catch {
      setUnavailable(true);
      return;
    }
    setUnavailable(false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x070b0d);
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.setAttribute('aria-label', '3D guitar note highway. Six strings from string 6 on the left to string 1 on the right; fret numbers approach the hit line.');
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x070b0d, 18, 50);
    const camera = new THREE.PerspectiveCamera(44, 1, 0.1, 90);
    camera.position.set(0, 5.7, 7.3);
    camera.lookAt(0, 0, -12);
    const geometries: THREE.BufferGeometry[] = [];
    const materials: THREE.Material[] = [];
    const textures: THREE.Texture[] = [];
    const box = (width: number, height: number, depth: number, color: number, x: number, y: number, z: number) => {
      const geometry = new THREE.BoxGeometry(width, height, depth);
      const material = new THREE.MeshStandardMaterial({ color, roughness: 0.48, metalness: 0.08 });
      geometries.push(geometry);
      materials.push(material);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      scene.add(mesh);
      return mesh;
    };

    scene.add(new THREE.HemisphereLight(0xa9f7ff, 0x101012, 1.2));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(-3, 8, 4);
    scene.add(keyLight);
    const hitLight = new THREE.PointLight(0x9fffea, 18, 14, 2);
    hitLight.position.set(0, 1.1, 0.4);
    scene.add(hitLight);

    const bed = box(HIGHWAY_WIDTH, 0.12, HIGHWAY_LENGTH + 5, 0x111a20, 0, -0.18, -HIGHWAY_LENGTH / 2 + 1);
    bed.scale.x = 1.04;
    for (let i = 0; i <= 8; i++) {
      const z = -i * 4.5;
      box(HIGHWAY_WIDTH - 0.35, 0.026, 0.045, 0x2f454d, 0, -0.045, z);
    }
    for (let string = 6; string >= 1; string--) {
      const rail = box(0.045, 0.045, HIGHWAY_LENGTH + 3, COLORS[6 - string], highwayLaneX(string), 0.02, -HIGHWAY_LENGTH / 2 + 1);
      const railMaterial = rail.material as THREE.MeshStandardMaterial;
      railMaterial.emissive = new THREE.Color(COLORS[6 - string]);
      railMaterial.emissiveIntensity = 0.9;
    }
    for (const x of [-HIGHWAY_WIDTH / 2, HIGHWAY_WIDTH / 2]) {
      const rail = box(0.085, 0.12, HIGHWAY_LENGTH + 4, 0x5f808b, x, 0.02, -HIGHWAY_LENGTH / 2 + 1);
      (rail.material as THREE.MeshStandardMaterial).emissive = new THREE.Color(0x263d45);
    }
    const hitLine = box(HIGHWAY_WIDTH, 0.08, 0.18, 0xd8fff3, 0, 0.08, 0);
    const hitMaterial = hitLine.material as THREE.MeshStandardMaterial;
    hitMaterial.emissive = new THREE.Color(0x8ffff0);
    hitMaterial.emissiveIntensity = 1.8;
    const hitGlow = box(HIGHWAY_WIDTH + 0.3, 0.018, 0.52, 0x73fff0, 0, 0.03, 0);
    const hitGlowMaterial = hitGlow.material as THREE.MeshStandardMaterial;
    hitGlowMaterial.transparent = true;
    hitGlowMaterial.opacity = 0.48;
    hitGlowMaterial.emissive = new THREE.Color(0x73fff0);
    hitGlowMaterial.emissiveIntensity = 2.4;

    // Share geometry and cache fret textures; create objects only in the visible
    // window. The existing tab clock owns pause, tempo, waiting and loop rewinds.
    const noteGeometry = new THREE.BoxGeometry(1.02, 0.22, 0.58);
    geometries.push(noteGeometry);
    const laneMaterials = COLORS.map((color) => {
      const material = new THREE.MeshStandardMaterial({
        color,
        emissive: new THREE.Color(color),
        emissiveIntensity: 0.45,
        roughness: 0.32,
        metalness: 0.12,
      });
      materials.push(material);
      return material;
    });
    const noteHaloGeometry = new THREE.BoxGeometry(1.16, 0.04, 0.72);
    geometries.push(noteHaloGeometry);
    const haloMaterials = COLORS.map((color) => {
      const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false });
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
      context.shadowColor = 'rgba(143, 255, 240, 0.55)';
      context.shadowBlur = 12;
      context.fillStyle = '#081012';
      context.beginPath();
      context.roundRect(7, 13, 114, 102, 24);
      context.fill();
      context.shadowBlur = 0;
      context.strokeStyle = 'rgba(255,255,255,.44)';
      context.lineWidth = 4;
      context.stroke();
      context.fillStyle = '#ffffff';
      context.font = 'bold ' + (fret < 100 ? 76 : 52) + 'px monospace';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(String(fret), 64, 65);
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
      camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.max(Math.tan(THREE.MathUtils.degToRad(22)), 0.55 / camera.aspect)));
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
          const laneIndex = LANE_COUNT - note.string;
          const halo = new THREE.Mesh(noteHaloGeometry, haloMaterials[laneIndex]);
          halo.position.y = -0.11;
          group.add(halo);
          group.add(new THREE.Mesh(noteGeometry, laneMaterials[laneIndex]));
          const label = new THREE.Sprite(fretMaterial(note.fret));
          label.position.y = 0.55;
          label.scale.set(0.82, 0.82, 1);
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
