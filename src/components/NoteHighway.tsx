import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { TabNote } from '../types';
import stagePoster from '../assets/start-bg-poster.jpg';
import { firstHighwayNote, HIGHWAY_LENGTH, HIGHWAY_LOOKAHEAD_MS, HIGHWAY_PAST_MS, highwayLaneX, highwayNotes, highwayNoteZ } from '../utils/noteHighway';

interface Props {
  notes: readonly TabNote[];
  playbackMs: number;
}

type BadgeJudgement = 'pending' | 'hit' | 'wrong';
type PadFeedbackKind = 'hit' | 'wrong';

const COLORS = [0xe6a84f, 0x36c8bf, 0xe06d58, 0x8a9bff, 0x4acb89, 0xbc67df];
const LANE_COUNT = 6;
const HIGHWAY_WIDTH = 14.2;
const HIT_Z = -2.75;
const TARGET_Z = HIT_Z - 2.35;
const HIT_WINDOW_MS = 90;
const STRING_PULSE_COUNT = 18;
const STRING_PULSE_TRAVEL_MS = 2300;
const STRING_PULSE_MIN_DELAY_MS = 260;
const STRING_PULSE_SPACING_MS = 420;
const PAD_BASE_SCALE = 1.28;
const FLOOR_REFLECTION_OPACITY = 0.18;
const PAD_REFLECTION_OPACITY = 0.2;
const NOTE_CONTACT_OPACITY = 0.22;
const DUST_PARTICLE_COUNT = 28;
// Keep the fret badges in focus; the road is a supporting light source.
const ROAD_LANE_TINT = 0.10;
const STRING_FILAMENT_WIDTH = 0.48;
const ROAD_BLOOM_STRENGTH = 0.24;
const colorStyle = (color: number) => '#' + color.toString(16).padStart(6, '0');
const colorRgba = (color: number, alpha: number) => {
  const red = (color >> 16) & 255;
  const green = (color >> 8) & 255;
  const blue = color & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
};
const FRET_DIGIT_FONT = '"Inter", "Manrope", "Space Grotesk", "Aptos", "Segoe UI", system-ui, sans-serif';
const TABULAR_DIGITS = '0123456789';
const drawCenteredTabularText = (context: CanvasRenderingContext2D, text: string, x: number, y: number) => {
  context.save();
  // Bounding-box metrics are relative to the current baseline. Measure using
  // the same alphabetic baseline that will be used to paint the digits.
  context.textBaseline = 'alphabetic';
  const fontSize = Number(context.font.match(/(\d+(?:\.\d+)?)px/)?.[1] || 72);
  const advance = Math.max(...Array.from(TABULAR_DIGITS, (digit) => context.measureText(digit).width));
  const ascent = Math.max(...Array.from(TABULAR_DIGITS, (digit) => context.measureText(digit).actualBoundingBoxAscent ?? fontSize * 0.75));
  const descent = Math.max(...Array.from(TABULAR_DIGITS, (digit) => context.measureText(digit).actualBoundingBoxDescent ?? fontSize * 0.2));
  const baselineY = y + (ascent - descent) / 2;
  const totalWidth = advance * text.length;
  context.textAlign = 'center';
  context.textBaseline = 'alphabetic';
  for (let index = 0; index < text.length; index++) {
    const slotCenter = x - totalWidth / 2 + advance * (index + 0.5);
    context.strokeText(text[index], slotCenter, baselineY);
    context.fillText(text[index], slotCenter, baselineY);
  }
  context.restore();
};

const badgeDigitOffset = (color: number, shape: 'note' | 'pad') => {
  if (color === COLORS[0]) {
    return { x: shape === 'pad' ? 4 : 3, y: 0 };
  }

  if (color === COLORS[1]) {
    return { x: shape === 'pad' ? 4 : 3, y: 0 };
  }

  return { x: 0, y: 0 };
};

const noteJudgement = (note: TabNote): BadgeJudgement => {
  if (note.hitState === 'hit' || note.hitState === 'close') return 'hit';
  if (note.hitState === 'miss' || note.hitState === 'wrong' || (note.mistakeCount ?? 0) > 0) return 'wrong';
  return 'pending';
};

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
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), ROAD_BLOOM_STRENGTH, 0.12, 0.88);
    composer.addPass(renderPass);
    composer.addPass(bloomPass);
    camera.position.set(0, 3.12, 4.72);
    camera.lookAt(0, -0.18, -25.5);
    const geometries: THREE.BufferGeometry[] = [];
    const materials: THREE.Material[] = [];
    const textures: THREE.Texture[] = [];
    let stageDisposed = false;
    const stageTexture = new THREE.TextureLoader().load(stagePoster, texture => {
      if (stageDisposed) return;
      // Use the stage above the baked start-screen road; the game road stays live.
      texture.repeat.set(1, 0.60);
      texture.offset.set(0, 0.40);
      scene.background = texture;
    });
    stageTexture.colorSpace = THREE.SRGBColorSpace;
    textures.push(stageTexture);
    scene.backgroundIntensity = 0.72;
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

    const dustGeometry = new THREE.BufferGeometry();
    const dustPositions = new Float32Array(DUST_PARTICLE_COUNT * 3);
    const dustPhases = new Float32Array(DUST_PARTICLE_COUNT);
    for (let i = 0; i < DUST_PARTICLE_COUNT; i++) {
      dustPositions[i * 3] = (Math.random() - 0.5) * 25;
      dustPositions[i * 3 + 1] = 1.2 + Math.random() * 7.2;
      dustPositions[i * 3 + 2] = -12 - Math.random() * 36;
      dustPhases[i] = Math.random() * Math.PI * 2;
    }
    dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    geometries.push(dustGeometry);
    const dustMaterial = new THREE.PointsMaterial({ color: 0xc7f4ff, size: 0.032, transparent: true, opacity: 0.055, depthWrite: false, blending: THREE.AdditiveBlending });
    materials.push(dustMaterial);
    const dust = new THREE.Points(dustGeometry, dustMaterial);
    scene.add(dust);

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
      plane(1.46, HIGHWAY_LENGTH + 5, COLORS[lane], x, -0.118, -HIGHWAY_LENGTH / 2 + 1, ROAD_LANE_TINT);
      plane(1.7, HIGHWAY_LENGTH + 5, COLORS[lane], x, -0.116, -HIGHWAY_LENGTH / 2 + 1, 0.035);
    }
    for (let i = 0; i <= 9; i++) {
      const z = -i * 4.2;
      plane(HIGHWAY_WIDTH - 3.3, 0.016, 0x5a7890, 0, -0.065, z, i === 0 ? 0.035 : 0.055);
    }
    // Bake the fine core and layered halo once, shared across each string's length.
    const filamentGeometry = new THREE.PlaneGeometry(STRING_FILAMENT_WIDTH, HIGHWAY_LENGTH + 5);
    geometries.push(filamentGeometry);
    for (let string = 6; string >= 1; string--) {
      const laneIndex = 6 - string;
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 512;
      const context = canvas.getContext('2d')!;
      const pixels = context.createImageData(canvas.width, canvas.height);
      const color = COLORS[laneIndex];
      const channels = [(color >> 16) & 255, (color >> 8) & 255, color & 255];
      for (let row = 0; row < canvas.height; row++) {
        const distance = row / (canvas.height - 1);
        const fade = THREE.MathUtils.smoothstep(distance, 0, 0.22);
        const brightness = fade * (0.28 + 0.68 * Math.sqrt(distance));
        for (let column = 0; column < canvas.width; column++) {
          const offset = column / (canvas.width - 1) - 0.5;
          const core = Math.exp(-offset * offset * 2600);
          const light = Math.min(1, core + Math.exp(-offset * offset * 180) * 0.26 + Math.exp(-offset * offset * 24) * 0.075);
          const pixel = (row * canvas.width + column) * 4;
          for (let channel = 0; channel < 3; channel++) {
            pixels.data[pixel + channel] = channels[channel] + (255 - channels[channel]) * core * 0.52;
          }
          pixels.data[pixel + 3] = light * brightness * 255;
        }
      }
      context.putImageData(pixels, 0, 0);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      textures.push(texture);
      const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
      materials.push(material);
      const filament = new THREE.Mesh(filamentGeometry, material);
      filament.rotation.x = -Math.PI / 2;
      filament.position.set(highwayLaneX(string), 0.055, -HIGHWAY_LENGTH / 2 + 1);
      scene.add(filament);
    }
    for (const x of [-HIGHWAY_WIDTH / 2, HIGHWAY_WIDTH / 2]) {
      const rail = box(0.045, 0.085, HIGHWAY_LENGTH + 7, 0x657684, x, 0.025, -HIGHWAY_LENGTH / 2 + 1);
      const railMaterial = rail.material as THREE.MeshStandardMaterial;
      railMaterial.emissive = new THREE.Color(0x657684);
      railMaterial.emissiveIntensity = 0.28;
    }
    const farFadeGeometry = new THREE.PlaneGeometry(HIGHWAY_WIDTH + 4.8, 20);
    geometries.push(farFadeGeometry);
    const farFadeMaterial = new THREE.MeshBasicMaterial({
      color: 0x071226,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    materials.push(farFadeMaterial);
    const farFade = new THREE.Mesh(farFadeGeometry, farFadeMaterial);
    farFade.rotation.x = -Math.PI / 2;
    farFade.position.set(0, 0.12, -42);
    scene.add(farFade);
    const horizonMistGeometry = new THREE.PlaneGeometry(HIGHWAY_WIDTH + 18, 10);
    geometries.push(horizonMistGeometry);
    const horizonMistMaterial = new THREE.MeshBasicMaterial({
      color: 0x0b1e3a,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    materials.push(horizonMistMaterial);
    const horizonMist = new THREE.Mesh(horizonMistGeometry, horizonMistMaterial);
    horizonMist.position.set(0, 2.9, -43);
    scene.add(horizonMist);

    const textMaterials = new Map<string, THREE.SpriteMaterial>();
    const makeBadgeMaterial = (text: string, color: number, shape: 'note' | 'pad', isBend = false, judgement: BadgeJudgement = 'pending') => {
      const key = `${shape}:${color}:${text}:${isBend ? 'bend' : 'plain'}:${judgement}`;
      const cached = textMaterials.get(key);
      if (cached) return cached;
      const canvas = document.createElement('canvas');
      const isPad = shape === 'pad';
      canvas.width = isPad ? 220 : 288;
      canvas.height = isPad ? 220 : 144;
      const context = canvas.getContext('2d')!;
      const cssColor = colorStyle(color);
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      context.clearRect(0, 0, canvas.width, canvas.height);

      const drawNotePath = () => {
        context.beginPath();
        context.roundRect(66, 28, 156, 88, 12);
      };
      const drawPadPath = () => {
        context.beginPath();
        context.roundRect(centerX - 61, centerY - 42, 122, 84, 12);
      };
      const noiseSeed = (color % 997) + text.length * 29 + (isPad ? 83 : 0);

      if (isPad) {
        for (const layer of [
          { alpha: 0.14, blur: 26 },
          { alpha: 0.20, blur: 12 },
        ]) {
          context.save();
          context.globalAlpha = layer.alpha;
          context.fillStyle = cssColor;
          context.shadowColor = cssColor;
          context.shadowBlur = layer.blur;
          drawPadPath();
          context.fill();
          context.restore();
        }

        context.fillStyle = 'rgba(5,12,20,.88)';
        drawPadPath();
        context.fill();
        context.fillStyle = colorRgba(color, 0.12);
        drawPadPath();
        context.fill();
        // A short lit base marks the fixed target without a circular halo.
        context.save();
        context.strokeStyle = colorRgba(color, 0.85);
        context.lineWidth = 3;
        context.lineCap = 'round';
        context.shadowColor = cssColor;
        context.shadowBlur = 8;
        context.beginPath();
        context.moveTo(centerX - 42, centerY + 40);
        context.lineTo(centerX + 42, centerY + 40);
        context.stroke();
        context.restore();

        context.save();
        context.globalAlpha = 0.18;
        context.fillStyle = cssColor;
        drawPadPath();
        context.clip();
        for (let i = 0; i < 34; i++) {
          const x = centerX - 48 + ((noiseSeed + i * 47) % 96);
          const y = centerY - 48 + ((noiseSeed + i * 31) % 96);
          context.globalAlpha = 0.025 + (i % 4) * 0.012;
          context.fillRect(x, y, 1 + (i % 3) * 0.35, 1 + (i % 2) * 0.35);
        }
        context.restore();
      } else {
        for (const layer of [
          { alpha: 0.16, blur: 42 },
          { alpha: 0.25, blur: 25 },
          { alpha: 0.38, blur: 12 },
        ]) {
          context.save();
          context.globalAlpha = layer.alpha;
          context.shadowColor = cssColor;
          context.shadowBlur = layer.blur;
          context.fillStyle = cssColor;
          drawNotePath();
          context.fill();
          context.restore();
        }

        const body = context.createRadialGradient(centerX - 10, centerY - 10, 12, centerX, centerY, 95);
        body.addColorStop(0, colorRgba(color, 0.88));
        body.addColorStop(0.42, colorRgba(color, 0.82));
        body.addColorStop(0.76, colorRgba(color, 0.76));
        body.addColorStop(1, colorRgba(color, 0.66));
        context.fillStyle = body;
        drawNotePath();
        context.fill();

        context.save();
        drawNotePath();
        context.clip();
        const unevenLight = context.createLinearGradient(66, 28, 222, 116);
        unevenLight.addColorStop(0, 'rgba(255,255,255,.13)');
        unevenLight.addColorStop(0.36, 'rgba(255,255,255,.045)');
        unevenLight.addColorStop(0.62, 'rgba(0,0,0,.03)');
        unevenLight.addColorStop(1, 'rgba(0,0,0,.13)');
        context.fillStyle = unevenLight;
        context.fillRect(66, 28, 156, 88);
        context.fillStyle = cssColor;
        for (let i = 0; i < 42; i++) {
          const x = 72 + ((noiseSeed + i * 41) % 144);
          const y = 34 + ((noiseSeed + i * 23) % 76);
          context.globalAlpha = 0.025 + (i % 5) * 0.009;
          context.fillRect(x, y, 1 + (i % 3) * 0.45, 1 + (i % 2) * 0.4);
        }
        context.restore();

        for (const rim of [
          { width: 8, alpha: 0.2, blur: 9, color: cssColor },
          { width: 3, alpha: 0.35, blur: 5, color: 'rgba(255,255,255,.72)' },
        ]) {
          context.save();
          context.globalAlpha = rim.alpha;
          context.strokeStyle = rim.color;
          context.lineWidth = rim.width;
          context.shadowColor = cssColor;
          context.shadowBlur = rim.blur;
          drawNotePath();
          context.stroke();
          context.restore();
        }
      }

      context.globalAlpha = 1;

      context.font = '750 ' + (isPad ? 72 : (text.length < 3 ? 68 : 50)) + 'px ' + FRET_DIGIT_FONT;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.lineJoin = 'round';
      context.shadowBlur = 0;
      context.lineWidth = isPad ? 12 : (text.length < 3 ? 12 : 9);
      context.strokeStyle = 'rgba(0,0,0,.94)';
      context.fillStyle = '#ffffff';
      const digitOffset = badgeDigitOffset(color, shape);
      drawCenteredTabularText(context, text, centerX + digitOffset.x, centerY + digitOffset.y);
      if (isBend) {
        const markerX = centerX + (isPad ? 48 : 58);
        const markerY = centerY - (isPad ? 48 : 36);
        context.save();
        context.font = '800 ' + (isPad ? 38 : 32) + 'px ' + FRET_DIGIT_FONT;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.lineWidth = isPad ? 8 : 7;
        context.strokeStyle = 'rgba(0,0,0,.94)';
        context.fillStyle = 'rgba(255,255,255,.94)';
        context.shadowColor = cssColor;
        context.shadowBlur = isPad ? 10 : 8;
        context.strokeText('↑', markerX, markerY);
        context.fillText('↑', markerX, markerY);
        context.restore();
      }
      if (shape === 'note' && judgement !== 'pending') {
        const isHit = judgement === 'hit';
        context.save();
        context.font = '900 30px ' + FRET_DIGIT_FONT;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.lineWidth = 7;
        context.strokeStyle = 'rgba(0,0,0,.9)';
        context.fillStyle = isHit ? 'rgba(165, 255, 203, .96)' : 'rgba(255, 139, 139, .96)';
        context.shadowColor = isHit ? 'rgba(79, 255, 170, .72)' : 'rgba(255, 76, 94, .7)';
        context.shadowBlur = 10;
        const glyph = isHit ? '✓' : '×';
        context.strokeText(glyph, centerX - 62, centerY - 35);
        context.fillText(glyph, centerX - 62, centerY - 35);
        context.restore();
      }

      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 8;
      textures.push(texture);
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: shape === 'pad' ? 0.96 : 1,
        depthTest: false,
        fog: false,
        blending: THREE.NormalBlending,
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
      const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
      materials.push(material);
      return material;
    };

    const makePadFeedbackMaterial = (kind: PadFeedbackKind) => {
      const canvas = document.createElement('canvas');
      canvas.width = 220;
      canvas.height = 220;
      const context = canvas.getContext('2d')!;
      const color = kind === 'hit' ? '#79ffb0' : '#ff5f73';
      const center = canvas.width / 2;
      const gradient = context.createRadialGradient(center, center, 28, center, center, 108);
      gradient.addColorStop(0, kind === 'hit' ? 'rgba(121,255,176,.18)' : 'rgba(255,95,115,.18)');
      gradient.addColorStop(0.46, kind === 'hit' ? 'rgba(121,255,176,.08)' : 'rgba(255,95,115,.08)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      context.fillStyle = gradient;
      context.beginPath();
      context.roundRect(center - 78, center - 55, 156, 110, 16);
      context.fill();
      for (const layer of [
        { width: 8, alpha: 0.16, blur: 24 },
        { width: 3, alpha: 0.42, blur: 10 },
      ]) {
        context.save();
        context.globalAlpha = layer.alpha;
        context.strokeStyle = color;
        context.lineWidth = layer.width;
        context.shadowColor = color;
        context.shadowBlur = layer.blur;
        context.beginPath();
        context.roundRect(center - 61, center - 42, 122, 84, 12);
        context.stroke();
        context.restore();
      }
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 8;
      textures.push(texture);
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: false,
        fog: false,
        blending: THREE.AdditiveBlending,
      });
      materials.push(material);
      return material;
    };

    const padLabels = new Map<number, THREE.Sprite>();
    const padFeedbackSprites = new Map<number, { sprite: THREE.Sprite; hitMaterial: THREE.SpriteMaterial; wrongMaterial: THREE.SpriteMaterial }>();
    const padReflections = new Map<number, THREE.MeshBasicMaterial>();
    const contactGeometry = new THREE.PlaneGeometry(1.42, 0.72);
    geometries.push(contactGeometry);
    const contactMaterials = new Map<number, THREE.MeshBasicMaterial>();
    const contactMaterialFor = (color: number) => {
      let material = contactMaterials.get(color);
      if (!material) {
        material = makeFloorGlowMaterial(color, NOTE_CONTACT_OPACITY, false);
        contactMaterials.set(color, material);
      }
      return material;
    };
    for (let string = 6; string >= 1; string--) {
      const laneIndex = LANE_COUNT - string;
      const pad = new THREE.Sprite(makeBadgeMaterial('0', COLORS[laneIndex], 'pad'));
      pad.position.set(highwayLaneX(string), 0.72, TARGET_Z);
      pad.scale.set(PAD_BASE_SCALE, PAD_BASE_SCALE, 1);
      scene.add(pad);
      padLabels.set(string, pad);
      const hitMaterial = makePadFeedbackMaterial('hit');
      const wrongMaterial = makePadFeedbackMaterial('wrong');
      const feedbackSprite = new THREE.Sprite(hitMaterial);
      feedbackSprite.position.set(highwayLaneX(string), 0.74, TARGET_Z + 0.04);
      feedbackSprite.scale.set(PAD_BASE_SCALE * 1.28, PAD_BASE_SCALE * 1.28, 1);
      scene.add(feedbackSprite);
      padFeedbackSprites.set(string, { sprite: feedbackSprite, hitMaterial, wrongMaterial });
      const padGlowGeometry = new THREE.PlaneGeometry(1.72, 1.02);
      geometries.push(padGlowGeometry);
      const padGlowMaterial = makeFloorGlowMaterial(COLORS[laneIndex], PAD_REFLECTION_OPACITY, false);
      const padGlow = new THREE.Mesh(padGlowGeometry, padGlowMaterial);
      padGlow.rotation.x = -Math.PI / 2;
      padGlow.position.set(highwayLaneX(string), -0.425, TARGET_Z + 0.08);
      scene.add(padGlow);
      padReflections.set(string, padGlowMaterial);
    }

    const pulseGeometry = new THREE.PlaneGeometry(1, 1);
    geometries.push(pulseGeometry);
    const stringPulses = Array.from({ length: STRING_PULSE_COUNT }, (_, index) => {
      const laneIndex = index % LANE_COUNT;
      const string = LANE_COUNT - laneIndex;
      const sprite = new THREE.Mesh(pulseGeometry, makePulseMaterial(COLORS[laneIndex]));
      sprite.rotation.x = -Math.PI / 2;
      sprite.position.set(highwayLaneX(string), 0.52, -HIGHWAY_LENGTH - 8);
      sprite.scale.set(0.26, 2.15, 1);
      scene.add(sprite);
      return { sprite, laneIndex, string, offsetMs: laneIndex * 170 + Math.floor(index / LANE_COUNT) * STRING_PULSE_SPACING_MS };
    });

    // Share geometry and cache fret textures; create objects only in the visible
    // window. The existing tab clock owns pause, tempo, waiting and loop rewinds.
    const active = new Map<string, THREE.Group>();
    const hitNotes = new Set<string>();
    const judgedNotes = new Map<string, string>();
    const padHits = new Map<number, number>();
    const padFeedbacks = new Map<number, { at: number; kind: PadFeedbackKind }>();
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
      const now = performance.now();
      const current = view.current;
      if (current.playbackMs < previousPlaybackMs - 100) {
        hitNotes.clear();
        judgedNotes.clear();
        padHits.clear();
        padFeedbacks.clear();
      }
      const playbackAdvanced = current.playbackMs > previousPlaybackMs;
      const visible = new Set<string>();
      const nextPadLabels = new Map<number, { fret: number; isBend: boolean }>();
      const start = firstHighwayNote(current.notes, current.playbackMs - HIGHWAY_PAST_MS);
      for (let i = start; i < current.notes.length; i++) {
        const note = current.notes[i];
        if (note.timestampMs > current.playbackMs + HIGHWAY_LOOKAHEAD_MS) break;
        if (!nextPadLabels.has(note.string) && note.timestampMs >= current.playbackMs - HIT_WINDOW_MS) {
          nextPadLabels.set(note.string, { fret: note.fret, isBend: Boolean(note.isBend) });
        }
        if (playbackAdvanced && note.timestampMs > previousPlaybackMs && note.timestampMs <= current.playbackMs + HIT_WINDOW_MS && !hitNotes.has(note.id)) {
          hitNotes.add(note.id);
          const pad = padLabels.get(note.string);
          if (pad) {
            pad.material.opacity = 1;
            padHits.set(note.string, current.playbackMs);
          }
        }
        const judgement = noteJudgement(note);
        const judgementKey = `${judgement}:${note.mistakeCount ?? 0}`;
        if (judgement === 'pending') judgedNotes.delete(note.id);
        else if (judgedNotes.get(note.id) !== judgementKey) {
          judgedNotes.set(note.id, judgementKey);
          const kind = judgement === 'hit' ? 'hit' : 'wrong';
          padFeedbacks.set(note.string, { at: now, kind });
          const padFeedback = padFeedbackSprites.get(note.string);
          if (padFeedback) {
            padFeedback.sprite.material = kind === 'hit' ? padFeedback.hitMaterial : padFeedback.wrongMaterial;
          }
        }
        visible.add(note.id);
        const laneIndex = LANE_COUNT - note.string;
        let group = active.get(note.id);
        if (!group) {
          group = new THREE.Group();
          const badge = new THREE.Sprite(makeBadgeMaterial(String(note.fret), COLORS[laneIndex], 'note', Boolean(note.isBend), noteJudgement(note)));
          badge.position.y = 0.62;
          badge.scale.set(1.42, 0.9, 1);
          group.add(badge);
          const contactMaterial = contactMaterialFor(COLORS[laneIndex]).clone();
          const contact = new THREE.Mesh(contactGeometry, contactMaterial);
          contact.rotation.x = -Math.PI / 2;
          group.add(contact);
          scene.add(group);
          active.set(note.id, group);
        }
        (group.children[0] as THREE.Sprite).material = makeBadgeMaterial(String(note.fret), COLORS[laneIndex], 'note', Boolean(note.isBend), judgement);
        const noteZ = highwayNoteZ(note.timestampMs, current.playbackMs) + TARGET_Z;
        const depthLift = THREE.MathUtils.clamp((noteZ - TARGET_Z) / 34, 0, 1) * 0.54;
        const noteY = 0.22 + depthLift;
        group.position.set(highwayLaneX(note.string), noteY, noteZ);
        const contact = group.children[1];
        if (contact) contact.position.y = -noteY - 0.355;
        const contactMaterial = (contact as THREE.Mesh).material as THREE.MeshBasicMaterial;
        if (contactMaterial) {
          const near = 1 - THREE.MathUtils.clamp((TARGET_Z - noteZ) / HIGHWAY_LENGTH, 0, 1);
          const judgement = noteJudgement(note);
          contactMaterial.color.set(judgement === 'hit' ? 0x8ff0b3 : judgement === 'wrong' ? 0xff6377 : COLORS[laneIndex]);
          contactMaterial.opacity = NOTE_CONTACT_OPACITY * THREE.MathUtils.clamp(near, 0.16, 1) * (judgement === 'pending' ? 1 : 1.45);
        }
      }
      for (let string = 1; string <= 6; string++) {
        const label = padLabels.get(string);
        if (label) {
          const hitAge = current.playbackMs - (padHits.get(string) ?? -1000);
          const hitProgress = THREE.MathUtils.clamp(hitAge / 260, 0, 1);
          const hitPulse = hitAge >= 0 && hitAge < 260 ? Math.sin((1 - hitProgress) * Math.PI) : 0;
          const feedback = padFeedbacks.get(string);
          const feedbackAge = feedback ? now - feedback.at : Infinity;
          const feedbackProgress = THREE.MathUtils.clamp(feedbackAge / 560, 0, 1);
          const feedbackPulse = feedbackAge < 560 ? Math.sin((1 - feedbackProgress) * Math.PI) : 0;
          const target = playbackAdvanced ? 0.9 + hitPulse * 0.1 : 0.82;
          const padLabel = nextPadLabels.get(string);
          label.material = makeBadgeMaterial(String(padLabel?.fret ?? 0), COLORS[LANE_COUNT - string], 'pad', Boolean(padLabel?.isBend));
          label.material.opacity = THREE.MathUtils.lerp(label.material.opacity, target, 0.16);
          const reflectionMaterial = padReflections.get(string);
          if (reflectionMaterial) {
            const feedbackColor = feedback?.kind === 'hit' ? 0x79ffb0 : feedback?.kind === 'wrong' ? 0xff5f73 : COLORS[LANE_COUNT - string];
            reflectionMaterial.color.set(feedbackPulse > 0 ? feedbackColor : COLORS[LANE_COUNT - string]);
            reflectionMaterial.opacity = THREE.MathUtils.lerp(reflectionMaterial.opacity, PAD_REFLECTION_OPACITY + hitPulse * 0.16 + feedbackPulse * 0.22, 0.12);
          }
          const breathe = 1 + Math.sin(performance.now() * 0.0014 + string) * 0.025;
          const scalePulse = (1 + hitPulse * 0.24 + feedbackPulse * 0.42) * breathe;
          label.scale.set(PAD_BASE_SCALE * scalePulse, PAD_BASE_SCALE * scalePulse, 1);
          const feedbackSprite = padFeedbackSprites.get(string)?.sprite;
          if (feedbackSprite) {
            (feedbackSprite.material as THREE.SpriteMaterial).opacity = feedbackPulse * 0.95;
            const feedbackScale = PAD_BASE_SCALE * (1.12 + feedbackProgress * 0.72);
            feedbackSprite.scale.set(feedbackScale, feedbackScale, 1);
          }
        }
      }
      const dustAttribute = dustGeometry.getAttribute('position') as THREE.BufferAttribute;
      const dustArray = dustAttribute.array as Float32Array;
      for (let i = 0; i < DUST_PARTICLE_COUNT; i++) {
        dustArray[i * 3] += Math.sin(now * 0.00018 + dustPhases[i]) * 0.0018;
        dustArray[i * 3 + 1] += Math.cos(now * 0.00014 + dustPhases[i]) * 0.0012;
      }
      dustAttribute.needsUpdate = true;
      dustMaterial.opacity = 0.04 + Math.sin(now * 0.0006) * 0.012;

      for (const pulse of stringPulses) {
        const cycleMs = STRING_PULSE_TRAVEL_MS + STRING_PULSE_MIN_DELAY_MS + pulse.laneIndex * 95;
        const progress = ((now + pulse.offsetMs) % cycleMs) / STRING_PULSE_TRAVEL_MS;
        const activePulse = progress <= 1;
        const eased = activePulse ? 1 - Math.pow(1 - progress, 2.7) : 0;
        pulse.sprite.position.z = THREE.MathUtils.lerp(-HIGHWAY_LENGTH - 5, TARGET_Z + 0.28, eased);
        pulse.sprite.position.x = highwayLaneX(pulse.string);
        pulse.sprite.position.y = 0.075;
        const distanceGain = THREE.MathUtils.clamp(eased * 1.3, 0, 1);
        const comet = activePulse ? Math.sin(progress * Math.PI) : 0;
        pulse.sprite.material.opacity = comet * (0.18 + distanceGain * 0.68);
        const width = THREE.MathUtils.lerp(0.16, 0.34, distanceGain);
        const length = THREE.MathUtils.lerp(1.3, 2.65, distanceGain);
        pulse.sprite.scale.set(width, length, 1);
      }
      for (const [noteId, group] of active) {
        if (!visible.has(noteId)) {
          ((group.children[1] as THREE.Mesh).material as THREE.Material).dispose();
          scene.remove(group);
          active.delete(noteId);
        }
      }
      composer.render();
      previousPlaybackMs = current.playbackMs;
      if (!document.hidden) frame = requestAnimationFrame(draw);
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
      if (!document.hidden) frame = requestAnimationFrame(draw);
    };
    const onVisibility = () => {
      cancelAnimationFrame(frame);
      if (!document.hidden && !lost) frame = requestAnimationFrame(draw);
    };
    document.addEventListener('visibilitychange', onVisibility);
    renderer.domElement.addEventListener('webglcontextlost', contextLost);
    renderer.domElement.addEventListener('webglcontextrestored', contextRestored);
    frame = requestAnimationFrame(draw);
    return () => {
      stageDisposed = true;
      scene.background = null;
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', onVisibility);
      observer.disconnect();
      renderer.domElement.removeEventListener('webglcontextlost', contextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', contextRestored);
      scene.clear();
      for (const group of active.values()) {
        ((group.children[1] as THREE.Mesh).material as THREE.Material).dispose();
      }
      active.clear();
      textures.forEach((texture) => texture.dispose());
      materials.forEach((material) => material.dispose());
      geometries.forEach((geometry) => geometry.dispose());
      bloomPass.dispose();
      renderPass.dispose();
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
