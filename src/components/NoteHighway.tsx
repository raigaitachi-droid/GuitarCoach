import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { TabNote } from '../types';
import { firstHighwayNote, HIGHWAY_LENGTH, HIGHWAY_LOOKAHEAD_MS, HIGHWAY_PAST_MS, highwayLaneX, highwayNotes, highwayNoteZ } from '../utils/noteHighway';

interface Props {
  notes: readonly TabNote[];
  playbackMs: number;
}

const COLORS = [0x00ff74, 0xff2424, 0xffd41f, 0x1f70ff, 0xff6a00, 0xff00f5];
const LANE_COUNT = 6;
const HIGHWAY_WIDTH = 14.2;
const HIT_Z = -2.75;
const HIT_WINDOW_MS = 90;
const colorStyle = (color: number) => '#' + color.toString(16).padStart(6, '0');

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
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch {
      setUnavailable(true);
      return;
    }
    setUnavailable(false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.92;
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.setAttribute('aria-label', '3D guitar note highway. Six strings from string 6 on the left to string 1 on the right; fret numbers approach the hit line.');
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x03050a, 30, 64);
    const camera = new THREE.PerspectiveCamera(57, 1, 0.1, 90);
    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.28, 0.12, 0.72);
    composer.addPass(renderPass);
    composer.addPass(bloomPass);
    camera.position.set(0, 3.35, 3.2);
    camera.lookAt(0, -0.05, -12);
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
    const plane = (width: number, depth: number, color: number, x: number, y: number, z: number, opacity = 1) => {
      const geometry = new THREE.PlaneGeometry(width, depth);
      const material = new THREE.MeshBasicMaterial({
        color,
        transparent: opacity < 1,
        opacity,
        side: THREE.DoubleSide,
        depthWrite: opacity >= 0.7,
      });
      geometries.push(geometry);
      materials.push(material);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, y, z);
      scene.add(mesh);
      return mesh;
    };

    scene.add(new THREE.HemisphereLight(0xb6e8ff, 0x07030d, 1.7));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.8);
    keyLight.position.set(-4, 9, 5);
    scene.add(keyLight);
    const hitLight = new THREE.PointLight(0xffffff, 42, 16, 1.9);
    hitLight.position.set(0, 1.4, 0.1);
    scene.add(hitLight);

    plane(26, 9, 0x05070b, 0, -0.42, 2.9, 0.86);
    const bed = box(HIGHWAY_WIDTH, 0.1, HIGHWAY_LENGTH + 9, 0x0a1018, 0, -0.2, -HIGHWAY_LENGTH / 2 + 1);
    bed.scale.x = 1.02;
    (bed.material as THREE.MeshStandardMaterial).emissive = new THREE.Color(0x04080d);
    for (let lane = 0; lane < LANE_COUNT; lane++) {
      const string = LANE_COUNT - lane;
      const x = highwayLaneX(string);
      plane(1.46, HIGHWAY_LENGTH + 5, COLORS[lane], x, -0.118, -HIGHWAY_LENGTH / 2 + 1, 0.16);
      plane(1.7, HIGHWAY_LENGTH + 5, COLORS[lane], x, -0.116, -HIGHWAY_LENGTH / 2 + 1, 0.06);
    }
    for (let i = 0; i <= 9; i++) {
      const z = -i * 4.2;
      plane(HIGHWAY_WIDTH - 0.15, 0.035, 0x8fb8c9, 0, -0.06, z, 0.28);
    }
    for (let string = 6; string >= 1; string--) {
      const rail = box(0.055, 0.055, HIGHWAY_LENGTH + 5, COLORS[6 - string], highwayLaneX(string), 0.03, -HIGHWAY_LENGTH / 2 + 1);
      const railMaterial = rail.material as THREE.MeshStandardMaterial;
      railMaterial.emissive = new THREE.Color(COLORS[6 - string]);
      railMaterial.emissiveIntensity = 2.35;
      plane(0.34, HIGHWAY_LENGTH + 5, COLORS[6 - string], highwayLaneX(string), -0.04, -HIGHWAY_LENGTH / 2 + 1, 0.38);
    }
    for (const x of [-HIGHWAY_WIDTH / 2, HIGHWAY_WIDTH / 2]) {
      const rail = box(0.09, 0.16, HIGHWAY_LENGTH + 7, 0x77d8f7, x, 0.04, -HIGHWAY_LENGTH / 2 + 1);
      const railMaterial = rail.material as THREE.MeshStandardMaterial;
      railMaterial.emissive = new THREE.Color(0x2ba6c9);
      railMaterial.emissiveIntensity = 1.45;
    }
    const hitLine = box(HIGHWAY_WIDTH + 0.45, 0.08, 0.2, 0xffffff, 0, 0.1, HIT_Z);
    const hitMaterial = hitLine.material as THREE.MeshStandardMaterial;
    hitMaterial.emissive = new THREE.Color(0xffffff);
    hitMaterial.emissiveIntensity = 3.4;
    const hitGlow = box(HIGHWAY_WIDTH + 1.1, 0.018, 0.66, 0xafffff, 0, 0.045, HIT_Z);
    const hitGlowMaterial = hitGlow.material as THREE.MeshStandardMaterial;
    hitGlowMaterial.transparent = true;
    hitGlowMaterial.opacity = 0.62;
    hitGlowMaterial.emissive = new THREE.Color(0xffffff);
    hitGlowMaterial.emissiveIntensity = 4.2;

    const farFadeGeometry = new THREE.PlaneGeometry(HIGHWAY_WIDTH + 4.8, 20);
    geometries.push(farFadeGeometry);
    const farFadeMaterial = new THREE.MeshBasicMaterial({
      color: 0x05070c,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    materials.push(farFadeMaterial);
    const farFade = new THREE.Mesh(farFadeGeometry, farFadeMaterial);
    farFade.rotation.x = -Math.PI / 2;
    farFade.position.set(0, 0.28, -34);
    scene.add(farFade);
    const horizonMistGeometry = new THREE.PlaneGeometry(HIGHWAY_WIDTH + 10, 8);
    geometries.push(horizonMistGeometry);
    const horizonMistMaterial = new THREE.MeshBasicMaterial({
      color: 0x071027,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    materials.push(horizonMistMaterial);
    const horizonMist = new THREE.Mesh(horizonMistGeometry, horizonMistMaterial);
    horizonMist.position.set(0, 3.1, -38);
    scene.add(horizonMist);

    const makeBadgeMaterial = (text: string, color: number, shape: 'note' | 'pad') => {
      const key = `${shape}:${color}:${text}`;
      const cached = textMaterials.get(key);
      if (cached) return cached;
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 128;
      const context = canvas.getContext('2d')!;
      const cssColor = colorStyle(color);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.shadowColor = cssColor;
      context.shadowBlur = shape === 'pad' ? 34 : 28;
      context.fillStyle = cssColor;
      context.beginPath();
      if (shape === 'pad') context.ellipse(128, 66, 86, 50, 0, 0, Math.PI * 2);
      else context.roundRect(38, 28, 180, 68, 34);
      context.fill();
      context.shadowBlur = 0;
      const centerGlow = context.createRadialGradient(128, 66, 8, 128, 66, shape === 'pad' ? 92 : 96);
      centerGlow.addColorStop(0, 'rgba(255,255,255,.24)');
      centerGlow.addColorStop(.42, 'rgba(255,255,255,.08)');
      centerGlow.addColorStop(1, 'rgba(0,0,0,.10)');
      context.fillStyle = centerGlow;
      context.beginPath();
      if (shape === 'pad') context.ellipse(128, 66, 86, 50, 0, 0, Math.PI * 2);
      else context.roundRect(38, 28, 180, 68, 34);
      context.fill();
      context.globalAlpha = 0.16;
      context.fillStyle = cssColor;
      for (let i = 0; i < 26; i++) {
        const x = 58 + ((i * 47) % 140);
        const y = 34 + ((i * 29) % 62);
        context.fillRect(x, y, 1.5, 1.5);
      }
      context.globalAlpha = 1;
      context.shadowColor = 'rgba(0,0,0,.7)';
      context.shadowBlur = 3;
      context.fillStyle = '#ffffff';
      context.font = 'bold ' + (text.length < 3 ? 66 : 46) + 'px monospace';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(text, 128, 66);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 8;
      textures.push(texture);
      const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, fog: false, blending: THREE.AdditiveBlending });
      materials.push(material);
      textMaterials.set(key, material);
      return material;
    };
    const textMaterials = new Map<string, THREE.SpriteMaterial>();

    const pulseGeometry = new THREE.RingGeometry(0.68, 0.95, 56);
    geometries.push(pulseGeometry);
    const padLabels = new Map<number, THREE.Sprite>();
    for (let string = 6; string >= 1; string--) {
      const laneIndex = LANE_COUNT - string;
      const pad = new THREE.Sprite(makeBadgeMaterial('0', COLORS[laneIndex], 'pad'));
      pad.position.set(highwayLaneX(string), 0.48, HIT_Z + 0.38);
      pad.scale.set(1.8, 0.9, 1);
      scene.add(pad);
      padLabels.set(string, pad);
      plane(1.75, 1.75, COLORS[laneIndex], highwayLaneX(string), 0.02, HIT_Z + 0.38, 0.26);
    }

    // Share geometry and cache fret textures; create objects only in the visible
    // window. The existing tab clock owns pause, tempo, waiting and loop rewinds.
    const noteHaloGeometry = new THREE.BoxGeometry(1.78, 0.04, 1.02);
    const noteShadowGeometry = new THREE.PlaneGeometry(1.68, 0.74);
    geometries.push(noteHaloGeometry);
    geometries.push(noteShadowGeometry);
    const haloMaterials = COLORS.map((color) => {
      const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.42, depthWrite: false });
      materials.push(material);
      return material;
    });
    const shadowMaterials = COLORS.map((color) => {
      const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.34, depthWrite: false, side: THREE.DoubleSide });
      material.blending = THREE.AdditiveBlending;
      materials.push(material);
      return material;
    });
    const active = new Map<TabNote, THREE.Group>();
    const hitNotes = new Set<string>();
    const pulses: Array<{ mesh: THREE.Mesh; bornAt: number; string: number }> = [];
    let previousPlaybackMs = playbackMs;
    let frame = 0;
    let lost = false;
    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      renderer.setSize(width, height);
      composer.setSize(width, height);
      bloomPass.setSize(width, height);
      camera.aspect = width / height;
      // Keep all six lanes visible on narrow windows.
      camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.max(Math.tan(THREE.MathUtils.degToRad(29)), 0.84 / camera.aspect)));
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    const draw = () => {
      if (lost) return;
      const current = view.current;
      if (current.playbackMs < previousPlaybackMs - 100) {
        hitNotes.clear();
        pulses.splice(0).forEach(({ mesh }) => scene.remove(mesh));
      }
      const playbackAdvanced = current.playbackMs > previousPlaybackMs;
      const visible = new Set<TabNote>();
      const start = firstHighwayNote(current.notes, current.playbackMs - HIGHWAY_PAST_MS);
      const nextFrets = new Map<number, number>();
      for (let i = start; i < current.notes.length; i++) {
        const note = current.notes[i];
        if (note.timestampMs > current.playbackMs + HIGHWAY_LOOKAHEAD_MS) break;
        if (!nextFrets.has(note.string) && note.timestampMs >= current.playbackMs - HIT_WINDOW_MS) {
          nextFrets.set(note.string, note.fret);
        }
        if (playbackAdvanced && note.timestampMs > previousPlaybackMs && note.timestampMs <= current.playbackMs + HIT_WINDOW_MS && !hitNotes.has(note.id)) {
          hitNotes.add(note.id);
          const laneIndex = LANE_COUNT - note.string;
          const pulseMaterial = new THREE.MeshBasicMaterial({
            color: COLORS[laneIndex],
            transparent: true,
            opacity: 0.8,
            depthWrite: false,
            side: THREE.DoubleSide,
          });
          materials.push(pulseMaterial);
          const pulse = new THREE.Mesh(pulseGeometry, pulseMaterial);
          pulse.rotation.x = -Math.PI / 2;
          pulse.position.set(highwayLaneX(note.string), 0.26, HIT_Z + 0.38);
          scene.add(pulse);
          pulses.push({ mesh: pulse, bornAt: current.playbackMs, string: note.string });
          const pad = padLabels.get(note.string);
          if (pad) pad.material.opacity = 1;
        }
        visible.add(note);
        let group = active.get(note);
        if (!group) {
          group = new THREE.Group();
          const laneIndex = LANE_COUNT - note.string;
          const shadow = new THREE.Mesh(noteShadowGeometry, shadowMaterials[laneIndex]);
          shadow.rotation.x = -Math.PI / 2;
          shadow.position.y = -0.2;
          shadow.position.z = 0.18;
          shadow.scale.set(1.06, 1.18, 1);
          group.add(shadow);
          const halo = new THREE.Mesh(noteHaloGeometry, haloMaterials[laneIndex]);
          halo.position.y = -0.14;
          group.add(halo);
          const badge = new THREE.Sprite(makeBadgeMaterial(String(note.fret), COLORS[laneIndex], 'note'));
          badge.position.y = 0.55;
          badge.scale.set(1.68, 0.74, 1);
          group.add(badge);
          scene.add(group);
          active.set(note, group);
        }
        const noteZ = highwayNoteZ(note.timestampMs, current.playbackMs) + HIT_Z;
        const depthLift = THREE.MathUtils.clamp((noteZ - HIT_Z) / 34, 0, 1) * 0.54;
        group.position.set(highwayLaneX(note.string), 0.22 + depthLift, noteZ);
      }
      for (let string = 1; string <= 6; string++) {
        const label = padLabels.get(string);
        if (label) {
          label.material = makeBadgeMaterial(String(nextFrets.get(string) ?? 0), COLORS[LANE_COUNT - string], 'pad');
          const target = playbackAdvanced ? 1 : 0.95;
          label.material.opacity = THREE.MathUtils.lerp(label.material.opacity, target, 0.08);
        }
      }
      for (let i = pulses.length - 1; i >= 0; i--) {
        const pulse = pulses[i];
        const age = current.playbackMs - pulse.bornAt;
        const progress = age / 480;
        if (progress >= 1 || progress < -0.1) {
          scene.remove(pulse.mesh);
          (pulse.mesh.material as THREE.Material).dispose();
          pulses.splice(i, 1);
          continue;
        }
        const scale = 1 + progress * 1.8;
        pulse.mesh.scale.set(scale, scale, 1);
        const material = pulse.mesh.material as THREE.MeshBasicMaterial;
        material.opacity = (1 - progress) * 0.72;
        pulse.mesh.position.y = 0.26 + progress * 0.06;
      }
      for (const [note, group] of active) {
        if (!visible.has(note)) { scene.remove(group); active.delete(note); }
      }
      composer.render();
      previousPlaybackMs = current.playbackMs;
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
      composer.dispose();
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
