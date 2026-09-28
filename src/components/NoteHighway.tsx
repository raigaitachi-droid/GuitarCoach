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

const COLORS = [0xe6a84f, 0x36c8bf, 0xe06d58, 0x8a9bff, 0x4acb89, 0xbc67df];
const LANE_COUNT = 6;
const HIGHWAY_WIDTH = 14.2;
const HIT_Z = -2.75;
const TARGET_Z = HIT_Z - 0.72;
const HIT_WINDOW_MS = 90;
const STRING_PULSE_COUNT = 18;
const STRING_PULSE_TRAVEL_MS = 2300;
const STRING_PULSE_MIN_DELAY_MS = 260;
const STRING_PULSE_SPACING_MS = 420;
const PAD_BASE_SCALE = 1.18;
const FLOOR_REFLECTION_OPACITY = 0.18;
const PAD_REFLECTION_OPACITY = 0.34;
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
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.24, 0.1, 0.78);
    composer.addPass(renderPass);
    composer.addPass(bloomPass);
    camera.position.set(0, 3.48, 3.48);
    camera.lookAt(0, -0.24, -24);
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

    const makeFloorGlowMaterial = (color: number, opacity: number, elongated: boolean) => {
      const canvas = document.createElement('canvas');
      canvas.width = elongated ? 128 : 192;
      canvas.height = elongated ? 512 : 192;
      const context = canvas.getContext('2d')!;
      const cssColor = colorStyle(color);
      context.clearRect(0, 0, canvas.width, canvas.height);
      if (elongated) {
        const side = context.createLinearGradient(0, 0, canvas.width, 0);
        side.addColorStop(0, 'rgba(255,255,255,0)');
        side.addColorStop(0.5, `${cssColor}aa`);
        side.addColorStop(1, 'rgba(255,255,255,0)');
        context.fillStyle = side;
        context.fillRect(0, 0, canvas.width, canvas.height);
        const length = context.createLinearGradient(0, 0, 0, canvas.height);
        length.addColorStop(0, 'rgba(0,0,0,0)');
        length.addColorStop(0.28, 'rgba(0,0,0,.34)');
        length.addColorStop(0.7, 'rgba(0,0,0,.06)');
        length.addColorStop(1, 'rgba(0,0,0,.55)');
        context.globalCompositeOperation = 'destination-in';
        context.fillStyle = length;
        context.fillRect(0, 0, canvas.width, canvas.height);
      } else {
        const glow = context.createRadialGradient(canvas.width / 2, canvas.height / 2, 4, canvas.width / 2, canvas.height / 2, canvas.width * 0.48);
        glow.addColorStop(0, `${cssColor}dd`);
        glow.addColorStop(0.36, `${cssColor}66`);
        glow.addColorStop(1, 'rgba(255,255,255,0)');
        context.fillStyle = glow;
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 8;
      textures.push(texture);
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });
      materials.push(material);
      return material;
    };

    scene.add(new THREE.HemisphereLight(0xb6e8ff, 0x07030d, 1.7));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.8);
    keyLight.position.set(-4, 9, 5);
    scene.add(keyLight);
    const hitLight = new THREE.PointLight(0x88dfff, 18, 12, 2.2);
    hitLight.position.set(0, 1.4, 0.1);
    scene.add(hitLight);

    const floorGeometry = new THREE.PlaneGeometry(30, 16, 1, 1);
    geometries.push(floorGeometry);
    const floorMaterial = new THREE.MeshStandardMaterial({
      color: 0x030509,
      roughness: 0.24,
      metalness: 0.32,
      transparent: true,
      opacity: 0.96,
      emissive: new THREE.Color(0x010308),
      emissiveIntensity: 0.42,
      side: THREE.DoubleSide,
    });
    materials.push(floorMaterial);
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -0.46, 1.5);
    scene.add(floor);
    plane(28, 2.2, 0x00040a, 0, -0.452, 4.45, 0.48);
    const bed = box(HIGHWAY_WIDTH, 0.1, HIGHWAY_LENGTH + 9, 0x0a1018, 0, -0.2, -HIGHWAY_LENGTH / 2 + 1);
    bed.scale.x = 1.02;
    (bed.material as THREE.MeshStandardMaterial).emissive = new THREE.Color(0x04080d);
    for (let lane = 0; lane < LANE_COUNT; lane++) {
      const string = LANE_COUNT - lane;
      const x = highwayLaneX(string);
      const reflectionGeometry = new THREE.PlaneGeometry(0.94, HIGHWAY_LENGTH + 7);
      geometries.push(reflectionGeometry);
      const reflection = new THREE.Mesh(reflectionGeometry, makeFloorGlowMaterial(COLORS[lane], FLOOR_REFLECTION_OPACITY, true));
      reflection.rotation.x = -Math.PI / 2;
      reflection.position.set(x, -0.435, -HIGHWAY_LENGTH / 2 + 1.1);
      scene.add(reflection);
      plane(1.46, HIGHWAY_LENGTH + 5, COLORS[lane], x, -0.118, -HIGHWAY_LENGTH / 2 + 1, 0.16);
      plane(1.7, HIGHWAY_LENGTH + 5, COLORS[lane], x, -0.116, -HIGHWAY_LENGTH / 2 + 1, 0.06);
    }
    for (let i = 0; i <= 9; i++) {
      const z = -i * 4.2;
      plane(HIGHWAY_WIDTH - 3.3, 0.016, 0x5a7890, 0, -0.065, z, i === 0 ? 0.035 : 0.055);
    }
    for (let string = 6; string >= 1; string--) {
      const rail = box(0.055, 0.055, HIGHWAY_LENGTH + 5, COLORS[6 - string], highwayLaneX(string), 0.03, -HIGHWAY_LENGTH / 2 + 1);
      const railMaterial = rail.material as THREE.MeshStandardMaterial;
      railMaterial.emissive = new THREE.Color(COLORS[6 - string]);
      railMaterial.emissiveIntensity = 2.35;
      plane(0.34, HIGHWAY_LENGTH + 5, COLORS[6 - string], highwayLaneX(string), -0.04, -HIGHWAY_LENGTH / 2 + 1, 0.38);
    }
    for (const x of [-HIGHWAY_WIDTH / 2, HIGHWAY_WIDTH / 2]) {
      const rail = box(0.045, 0.085, HIGHWAY_LENGTH + 7, 0x4ca8c5, x, 0.025, -HIGHWAY_LENGTH / 2 + 1);
      const railMaterial = rail.material as THREE.MeshStandardMaterial;
      railMaterial.emissive = new THREE.Color(0x2ba6c9);
      railMaterial.emissiveIntensity = 0.55;
    }
    const hitLine = box(HIGHWAY_WIDTH - 2.8, 0.016, 0.032, 0x7eeaff, 0, 0.09, TARGET_Z);
    const hitMaterial = hitLine.material as THREE.MeshStandardMaterial;
    hitMaterial.transparent = true;
    hitMaterial.opacity = 0.34;
    hitMaterial.emissive = new THREE.Color(0x6feeff);
    hitMaterial.emissiveIntensity = 0.12;
    const farFadeGeometry = new THREE.PlaneGeometry(HIGHWAY_WIDTH + 4.8, 20);
    geometries.push(farFadeGeometry);
    const farFadeMaterial = new THREE.MeshBasicMaterial({
      color: 0x05070c,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    materials.push(farFadeMaterial);
    const farFade = new THREE.Mesh(farFadeGeometry, farFadeMaterial);
    farFade.rotation.x = -Math.PI / 2;
    farFade.position.set(0, 0.12, -42);
    scene.add(farFade);
    const horizonMistGeometry = new THREE.PlaneGeometry(HIGHWAY_WIDTH + 10, 8);
    geometries.push(horizonMistGeometry);
    const horizonMistMaterial = new THREE.MeshBasicMaterial({
      color: 0x071027,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    materials.push(horizonMistMaterial);
    const horizonMist = new THREE.Mesh(horizonMistGeometry, horizonMistMaterial);
    horizonMist.position.set(0, 3.6, -46);
    scene.add(horizonMist);

    const textMaterials = new Map<string, THREE.SpriteMaterial>();
    const makeBadgeMaterial = (text: string, color: number, shape: 'note' | 'pad') => {
      const key = shape === 'pad' ? `${shape}:${color}` : `${shape}:${color}:${text}`;
      const cached = textMaterials.get(key);
      if (cached) return cached;
      const canvas = document.createElement('canvas');
      const isPad = shape === 'pad';
      canvas.width = isPad ? 192 : 256;
      canvas.height = isPad ? 192 : 128;
      const context = canvas.getContext('2d')!;
      const cssColor = colorStyle(color);
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.shadowColor = cssColor;
      context.shadowBlur = isPad ? 28 : 26;
      context.fillStyle = cssColor;
      context.beginPath();
      if (isPad) context.arc(centerX, centerY, 47, 0, Math.PI * 2);
      else context.roundRect(58, 24, 140, 80, 40);
      context.fill();
      context.shadowBlur = 0;
      const centerGlow = context.createRadialGradient(centerX, centerY, 8, centerX, centerY, isPad ? 62 : 86);
      centerGlow.addColorStop(0, isPad ? 'rgba(255,255,255,.025)' : 'rgba(255,255,255,.14)');
      centerGlow.addColorStop(.5, isPad ? 'rgba(255,255,255,.012)' : 'rgba(255,255,255,.045)');
      centerGlow.addColorStop(1, 'rgba(0,0,0,.08)');
      context.fillStyle = centerGlow;
      context.beginPath();
      if (isPad) context.arc(centerX, centerY, 47, 0, Math.PI * 2);
      else context.roundRect(58, 24, 140, 80, 40);
      context.fill();
      if (isPad) {
        context.globalAlpha = 0.82;
        context.lineWidth = 4;
        context.strokeStyle = cssColor;
        context.shadowColor = cssColor;
        context.shadowBlur = 18;
        context.beginPath();
        context.arc(centerX, centerY, 47, 0, Math.PI * 2);
        context.stroke();
        context.shadowBlur = 0;
      }
      context.globalAlpha = isPad ? 0.08 : 0.13;
      context.fillStyle = cssColor;
      for (let i = 0; i < 26; i++) {
        const x = (isPad ? 48 : 58) + ((i * 47) % (isPad ? 96 : 140));
        const y = (isPad ? 48 : 34) + ((i * 29) % (isPad ? 96 : 62));
        context.fillRect(x, y, 1.5, 1.5);
      }
      context.globalAlpha = 1;
      context.shadowBlur = 0;
      if (!isPad) {
        context.font = 'bold ' + (text.length < 3 ? 64 : 46) + 'px monospace';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.lineJoin = 'round';
        context.lineWidth = text.length < 3 ? 9 : 7;
        context.strokeStyle = 'rgba(0,0,0,.82)';
        context.strokeText(text, centerX, centerY);
        context.fillStyle = '#ffffff';
        context.fillText(text, centerX, centerY);
      }
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 8;
      textures.push(texture);
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: shape === 'pad' ? 0.9 : 1,
        depthTest: false,
        fog: false,
        blending: shape === 'pad' ? THREE.NormalBlending : THREE.AdditiveBlending,
      });
      materials.push(material);
      textMaterials.set(key, material);
      return material;
    };

    const makePulseMaterial = (color: number) => {
      const canvas = document.createElement('canvas');
      canvas.width = 96;
      canvas.height = 256;
      const context = canvas.getContext('2d')!;
      const cssColor = colorStyle(color);
      const gradient = context.createLinearGradient(48, 0, 48, 256);
      gradient.addColorStop(0, 'rgba(255,255,255,0)');
      gradient.addColorStop(0.38, `${cssColor}22`);
      gradient.addColorStop(0.72, `${cssColor}cc`);
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      context.fillStyle = gradient;
      context.shadowColor = cssColor;
      context.shadowBlur = 22;
      context.beginPath();
      context.roundRect(34, 0, 28, 256, 14);
      context.fill();
      context.shadowBlur = 0;
      context.fillStyle = 'rgba(255,255,255,.58)';
      context.beginPath();
      context.roundRect(44, 150, 8, 62, 4);
      context.fill();
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 8;
      textures.push(texture);
      const material = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0, depthWrite: false, depthTest: false, fog: false, blending: THREE.AdditiveBlending });
      materials.push(material);
      return material;
    };

    const padLabels = new Map<number, THREE.Sprite>();
    const padReflections = new Map<number, THREE.MeshBasicMaterial>();
    for (let string = 6; string >= 1; string--) {
      const laneIndex = LANE_COUNT - string;
      const pad = new THREE.Sprite(makeBadgeMaterial('', COLORS[laneIndex], 'pad'));
      pad.position.set(highwayLaneX(string), 0.72, TARGET_Z);
      pad.scale.set(PAD_BASE_SCALE, PAD_BASE_SCALE, 1);
      scene.add(pad);
      padLabels.set(string, pad);
      const padGlowGeometry = new THREE.PlaneGeometry(2.2, 1.3);
      geometries.push(padGlowGeometry);
      const padGlowMaterial = makeFloorGlowMaterial(COLORS[laneIndex], PAD_REFLECTION_OPACITY, false);
      const padGlow = new THREE.Mesh(padGlowGeometry, padGlowMaterial);
      padGlow.rotation.x = -Math.PI / 2;
      padGlow.position.set(highwayLaneX(string), -0.425, TARGET_Z + 0.08);
      scene.add(padGlow);
      padReflections.set(string, padGlowMaterial);
    }

    const stringPulses = Array.from({ length: STRING_PULSE_COUNT }, (_, index) => {
      const laneIndex = index % LANE_COUNT;
      const string = LANE_COUNT - laneIndex;
      const sprite = new THREE.Sprite(makePulseMaterial(COLORS[laneIndex]));
      sprite.position.set(highwayLaneX(string), 0.52, -HIGHWAY_LENGTH - 8);
      sprite.scale.set(0.26, 2.15, 1);
      scene.add(sprite);
      return { sprite, laneIndex, string, offsetMs: laneIndex * 170 + Math.floor(index / LANE_COUNT) * STRING_PULSE_SPACING_MS };
    });

    // Share geometry and cache fret textures; create objects only in the visible
    // window. The existing tab clock owns pause, tempo, waiting and loop rewinds.
    const active = new Map<TabNote, THREE.Group>();
    const hitNotes = new Set<string>();
    const padHits = new Map<number, number>();
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
        padHits.clear();
      }
      const playbackAdvanced = current.playbackMs > previousPlaybackMs;
      const visible = new Set<TabNote>();
      const start = firstHighwayNote(current.notes, current.playbackMs - HIGHWAY_PAST_MS);
      for (let i = start; i < current.notes.length; i++) {
        const note = current.notes[i];
        if (note.timestampMs > current.playbackMs + HIGHWAY_LOOKAHEAD_MS) break;
        if (playbackAdvanced && note.timestampMs > previousPlaybackMs && note.timestampMs <= current.playbackMs + HIT_WINDOW_MS && !hitNotes.has(note.id)) {
          hitNotes.add(note.id);
          const pad = padLabels.get(note.string);
          if (pad) {
            pad.material.opacity = 1;
            padHits.set(note.string, current.playbackMs);
          }
        }
        visible.add(note);
        let group = active.get(note);
        if (!group) {
          group = new THREE.Group();
          const laneIndex = LANE_COUNT - note.string;
          const badge = new THREE.Sprite(makeBadgeMaterial(String(note.fret), COLORS[laneIndex], 'note'));
          badge.position.y = 0.55;
          badge.scale.set(1.36, 0.82, 1);
          group.add(badge);
          scene.add(group);
          active.set(note, group);
        }
        const noteZ = highwayNoteZ(note.timestampMs, current.playbackMs) + TARGET_Z;
        const depthLift = THREE.MathUtils.clamp((noteZ - TARGET_Z) / 34, 0, 1) * 0.54;
        group.position.set(highwayLaneX(note.string), 0.22 + depthLift, noteZ);
      }
      for (let string = 1; string <= 6; string++) {
        const label = padLabels.get(string);
        if (label) {
          const hitAge = current.playbackMs - (padHits.get(string) ?? -1000);
          const hitProgress = THREE.MathUtils.clamp(hitAge / 260, 0, 1);
          const hitPulse = hitAge >= 0 && hitAge < 260 ? Math.sin((1 - hitProgress) * Math.PI) : 0;
          const target = playbackAdvanced ? 0.9 + hitPulse * 0.1 : 0.82;
          label.material.opacity = THREE.MathUtils.lerp(label.material.opacity, target, 0.16);
          const reflectionMaterial = padReflections.get(string);
          if (reflectionMaterial) {
            reflectionMaterial.opacity = THREE.MathUtils.lerp(reflectionMaterial.opacity, PAD_REFLECTION_OPACITY + hitPulse * 0.22, 0.12);
          }
          const breathe = 1 + Math.sin(performance.now() * 0.0014 + string) * 0.025;
          const scalePulse = (1 + hitPulse * 0.32) * breathe;
          label.scale.set(PAD_BASE_SCALE * scalePulse, PAD_BASE_SCALE * scalePulse, 1);
        }
      }
      const now = performance.now();
      for (const pulse of stringPulses) {
        const cycleMs = STRING_PULSE_TRAVEL_MS + STRING_PULSE_MIN_DELAY_MS + pulse.laneIndex * 95;
        const progress = ((now + pulse.offsetMs) % cycleMs) / STRING_PULSE_TRAVEL_MS;
        const activePulse = progress <= 1;
        const eased = activePulse ? 1 - Math.pow(1 - progress, 2.7) : 0;
        pulse.sprite.position.z = THREE.MathUtils.lerp(-HIGHWAY_LENGTH - 5, TARGET_Z + 0.28, eased);
        pulse.sprite.position.x = highwayLaneX(pulse.string);
        pulse.sprite.position.y = THREE.MathUtils.lerp(0.36, 0.66, eased);
        const distanceGain = THREE.MathUtils.clamp(eased * 1.3, 0, 1);
        const comet = activePulse ? Math.sin(progress * Math.PI) : 0;
        (pulse.sprite.material as THREE.SpriteMaterial).opacity = comet * (0.18 + distanceGain * 0.68);
        const width = THREE.MathUtils.lerp(0.16, 0.34, distanceGain);
        const length = THREE.MathUtils.lerp(1.3, 2.65, distanceGain);
        pulse.sprite.scale.set(width, length, 1);
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
