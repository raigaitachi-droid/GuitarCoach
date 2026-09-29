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
  const fontSize = Number(context.font.match(/(\d+(?:\.\d+)?)px/)?.[1] || 72);
  const advance = Math.max(...Array.from(TABULAR_DIGITS, (digit) => context.measureText(digit).width));
  const ascent = Math.max(...Array.from(TABULAR_DIGITS, (digit) => context.measureText(digit).actualBoundingBoxAscent || fontSize * 0.75));
  const descent = Math.max(...Array.from(TABULAR_DIGITS, (digit) => context.measureText(digit).actualBoundingBoxDescent || fontSize * 0.2));
  const baselineY = y + (ascent - descent) / 2;
  const totalWidth = advance * text.length;
  context.save();
  context.textAlign = 'center';
  context.textBaseline = 'alphabetic';
  for (let index = 0; index < text.length; index++) {
    const slotCenter = x - totalWidth / 2 + advance * (index + 0.5);
    context.strokeText(text[index], slotCenter, baselineY);
    context.fillText(text[index], slotCenter, baselineY);
  }
  context.restore();
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
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.3, 0.12, 0.8);
    composer.addPass(renderPass);
    composer.addPass(bloomPass);
    camera.position.set(0, 3.12, 4.72);
    camera.lookAt(0, -0.18, -25.5);
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

    const makeBeamMaterial = (color: number, opacity: number) => {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 768;
      const context = canvas.getContext('2d')!;
      const cssColor = colorStyle(color);
      const verticalGlow = context.createLinearGradient(0, 0, 0, canvas.height);
      verticalGlow.addColorStop(0, `${cssColor}55`);
      verticalGlow.addColorStop(0.22, `${cssColor}2e`);
      verticalGlow.addColorStop(0.72, `${cssColor}10`);
      verticalGlow.addColorStop(1, 'rgba(255,255,255,0)');
      context.fillStyle = verticalGlow;
      context.fillRect(0, 0, canvas.width, canvas.height);

      const softCore = context.createRadialGradient(canvas.width / 2, canvas.height * 0.08, 8, canvas.width / 2, canvas.height * 0.5, canvas.width * 0.74);
      softCore.addColorStop(0, 'rgba(255,255,255,.22)');
      softCore.addColorStop(0.24, `${cssColor}38`);
      softCore.addColorStop(0.72, `${cssColor}0d`);
      softCore.addColorStop(1, 'rgba(255,255,255,0)');
      context.globalCompositeOperation = 'screen';
      context.fillStyle = softCore;
      context.fillRect(0, 0, canvas.width, canvas.height);

      const softMask = context.createLinearGradient(0, 0, canvas.width, 0);
      softMask.addColorStop(0, 'rgba(0,0,0,0)');
      softMask.addColorStop(0.22, 'rgba(0,0,0,.34)');
      softMask.addColorStop(0.5, 'rgba(0,0,0,.78)');
      softMask.addColorStop(0.78, 'rgba(0,0,0,.34)');
      softMask.addColorStop(1, 'rgba(0,0,0,0)');
      context.globalCompositeOperation = 'destination-in';
      context.fillStyle = softMask;
      context.fillRect(0, 0, canvas.width, canvas.height);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 8;
      textures.push(texture);
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity,
        depthWrite: false,
        depthTest: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });
      materials.push(material);
      return material;
    };

    const makeBackdropGradientMaterial = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 512;
      const context = canvas.getContext('2d')!;
      const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
      gradient.addColorStop(0, '#02040a');
      gradient.addColorStop(0.34, '#061122');
      gradient.addColorStop(0.72, '#080817');
      gradient.addColorStop(1, '#020307');
      context.fillStyle = gradient;
      context.fillRect(0, 0, canvas.width, canvas.height);
      const center = context.createRadialGradient(canvas.width / 2, canvas.height * 0.58, 36, canvas.width / 2, canvas.height * 0.58, 430);
      center.addColorStop(0, 'rgba(54,200,191,.34)');
      center.addColorStop(0.24, 'rgba(72,130,215,.22)');
      center.addColorStop(0.56, 'rgba(33,69,126,.14)');
      center.addColorStop(1, 'rgba(0,0,0,0)');
      context.fillStyle = center;
      context.fillRect(0, 0, canvas.width, canvas.height);

      context.globalCompositeOperation = 'screen';
      const risingGlow = context.createRadialGradient(canvas.width / 2, canvas.height * 0.7, 20, canvas.width / 2, canvas.height * 0.34, 360);
      risingGlow.addColorStop(0, 'rgba(84,220,220,.28)');
      risingGlow.addColorStop(0.22, 'rgba(138,155,255,.18)');
      risingGlow.addColorStop(0.46, 'rgba(188,103,223,.1)');
      risingGlow.addColorStop(0.72, 'rgba(230,168,79,.055)');
      risingGlow.addColorStop(1, 'rgba(0,0,0,0)');
      context.fillStyle = risingGlow;
      context.fillRect(0, 0, canvas.width, canvas.height);

      const centerColumn = context.createLinearGradient(0, canvas.height * 0.18, 0, canvas.height * 0.72);
      centerColumn.addColorStop(0, 'rgba(90,145,255,0)');
      centerColumn.addColorStop(0.34, 'rgba(74,203,137,.055)');
      centerColumn.addColorStop(0.62, 'rgba(54,200,191,.145)');
      centerColumn.addColorStop(1, 'rgba(224,109,88,.05)');
      context.fillStyle = centerColumn;
      context.fillRect(canvas.width * 0.33, canvas.height * 0.18, canvas.width * 0.34, canvas.height * 0.58);
      context.globalCompositeOperation = 'source-over';
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 8;
      textures.push(texture);
      const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.92, depthWrite: false, side: THREE.DoubleSide });
      materials.push(material);
      return material;
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

    const backdropGeometry = new THREE.PlaneGeometry(58, 24);
    geometries.push(backdropGeometry);
    const backdrop = new THREE.Mesh(backdropGeometry, makeBackdropGradientMaterial());
    backdrop.position.set(0, 5.4, -54);
    scene.add(backdrop);

    const silhouetteMaterial = new THREE.MeshBasicMaterial({ color: 0x02050a, transparent: true, opacity: 0.58, depthWrite: false });
    materials.push(silhouetteMaterial);
    const addSilhouette = (width: number, height: number, x: number, y: number, z: number) => {
      const geometry = new THREE.BoxGeometry(width, height, 0.18);
      geometries.push(geometry);
      const mesh = new THREE.Mesh(geometry, silhouetteMaterial);
      mesh.position.set(x, y, z);
      scene.add(mesh);
      return mesh;
    };
    const addAmp = (x: number, y: number, z: number, scale = 1) => {
      addSilhouette(3.4 * scale, 3.8 * scale, x, y, z);
      addSilhouette(3.1 * scale, 0.18 * scale, x, y + 1.1 * scale, z - 0.03);
      addSilhouette(2.7 * scale, 0.16 * scale, x, y + 0.18 * scale, z - 0.03);
      addSilhouette(0.16 * scale, 3.2 * scale, x - 1.15 * scale, y, z - 0.04);
      addSilhouette(0.16 * scale, 3.2 * scale, x + 1.15 * scale, y, z - 0.04);
    };
    const addTruss = (x: number, z: number) => {
      addSilhouette(0.16, 9.6, x, 3.35, z);
      addSilhouette(0.16, 9.6, x + 0.72, 3.35, z);
      for (let i = 0; i < 5; i++) {
        const brace = addSilhouette(0.13, 1.05, x + 0.36, -0.5 + i * 1.75, z - 0.02);
        brace.rotation.z = i % 2 === 0 ? 0.58 : -0.58;
      }
    };
    const addDrumKit = () => {
      const drumMaterial = silhouetteMaterial;
      const kickGeometry = new THREE.CircleGeometry(1.0, 32);
      geometries.push(kickGeometry);
      const kick = new THREE.Mesh(kickGeometry, drumMaterial);
      kick.position.set(0, 1.05, -47.5);
      scene.add(kick);
      const tomGeometry = new THREE.CircleGeometry(0.42, 24);
      geometries.push(tomGeometry);
      const leftTom = new THREE.Mesh(tomGeometry, drumMaterial);
      leftTom.position.set(-0.9, 1.78, -47.3);
      scene.add(leftTom);
      const rightTom = new THREE.Mesh(tomGeometry, drumMaterial);
      rightTom.position.set(0.92, 1.78, -47.3);
      scene.add(rightTom);
      addSilhouette(2.8, 0.1, 0, 2.42, -47.4);
      addSilhouette(0.08, 1.2, -1.7, 1.85, -47.4);
      addSilhouette(0.08, 1.2, 1.7, 1.85, -47.4);
    };
    addAmp(-13.0, 1.35, -38, 1.08);
    addAmp(-9.4, 1.0, -44, 0.78);
    addAmp(12.2, 1.3, -39, 0.98);
    addAmp(8.4, 0.95, -45, 0.72);
    addTruss(-16.4, -42);
    addTruss(15.6, -42);
    addDrumKit();

    const beamSpecs = [
      { color: 0x4ce7ff, opacity: 0.065, x: -8.7, y: 7.1, z: -35, rotation: 0.3, width: 7.8, height: 16.8 },
      { color: 0x74e6ff, opacity: 0.082, x: -1.6, y: 8.2, z: -44, rotation: 0.06, width: 9.4, height: 21.0 },
      { color: 0x7e65ff, opacity: 0.078, x: 7.3, y: 7.5, z: -36, rotation: -0.31, width: 8.8, height: 18.8 },
      { color: 0xe6a84f, opacity: 0.032, x: 13.0, y: 5.8, z: -34, rotation: -0.48, width: 6.5, height: 13.8 },
    ];
    const lightBeams = beamSpecs.map((spec) => {
      const geometry = new THREE.PlaneGeometry(spec.width, spec.height);
      geometries.push(geometry);
      const beam = new THREE.Mesh(geometry, makeBeamMaterial(spec.color, spec.opacity));
      beam.position.set(spec.x, spec.y, spec.z);
      beam.rotation.z = spec.rotation;
      scene.add(beam);
      return { beam, baseOpacity: spec.opacity, phase: spec.x * 0.37 };
    });

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
      plane(1.46, HIGHWAY_LENGTH + 5, COLORS[lane], x, -0.118, -HIGHWAY_LENGTH / 2 + 1, 0.16);
      plane(1.7, HIGHWAY_LENGTH + 5, COLORS[lane], x, -0.116, -HIGHWAY_LENGTH / 2 + 1, 0.06);
    }
    for (let i = 0; i <= 9; i++) {
      const z = -i * 4.2;
      plane(HIGHWAY_WIDTH - 3.3, 0.016, 0x5a7890, 0, -0.065, z, i === 0 ? 0.035 : 0.055);
    }
    for (let string = 6; string >= 1; string--) {
      const laneIndex = 6 - string;
      const x = highwayLaneX(string);
      const railGlow = box(0.13, 0.045, HIGHWAY_LENGTH + 5, COLORS[laneIndex], x, 0.018, -HIGHWAY_LENGTH / 2 + 1);
      const railGlowMaterial = railGlow.material as THREE.MeshStandardMaterial;
      railGlowMaterial.transparent = true;
      railGlowMaterial.opacity = 0.42;
      railGlowMaterial.emissive = new THREE.Color(COLORS[laneIndex]);
      railGlowMaterial.emissiveIntensity = 1.3;
      const rail = box(0.032, 0.032, HIGHWAY_LENGTH + 5, 0xf4fbff, x, 0.055, -HIGHWAY_LENGTH / 2 + 1);
      const railMaterial = rail.material as THREE.MeshStandardMaterial;
      railMaterial.color = new THREE.Color(0xf4fbff).lerp(new THREE.Color(COLORS[laneIndex]), 0.42);
      railMaterial.emissive = new THREE.Color(COLORS[laneIndex]);
      railMaterial.emissiveIntensity = 3.15;
      plane(0.34, HIGHWAY_LENGTH + 5, COLORS[laneIndex], x, -0.04, -HIGHWAY_LENGTH / 2 + 1, 0.3);
    }
    for (const x of [-HIGHWAY_WIDTH / 2, HIGHWAY_WIDTH / 2]) {
      const rail = box(0.045, 0.085, HIGHWAY_LENGTH + 7, 0x4ca8c5, x, 0.025, -HIGHWAY_LENGTH / 2 + 1);
      const railMaterial = rail.material as THREE.MeshStandardMaterial;
      railMaterial.emissive = new THREE.Color(0x2ba6c9);
      railMaterial.emissiveIntensity = 0.55;
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
    const makeBadgeMaterial = (text: string, color: number, shape: 'note' | 'pad') => {
      const key = `${shape}:${color}:${text}`;
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
        context.roundRect(66, 28, 156, 88, 44);
      };
      const drawPadPath = (radius: number) => {
        context.beginPath();
        context.arc(centerX, centerY, radius, 0, Math.PI * 2);
      };
      const noiseSeed = (color % 997) + text.length * 29 + (isPad ? 83 : 0);

      if (isPad) {
        const innerTint = context.createRadialGradient(centerX - 5, centerY - 7, 8, centerX, centerY, 68);
        innerTint.addColorStop(0, colorRgba(color, 0.16));
        innerTint.addColorStop(0.52, colorRgba(color, 0.07));
        innerTint.addColorStop(1, 'rgba(255,255,255,0)');
        context.fillStyle = innerTint;
        drawPadPath(62);
        context.fill();

        for (const layer of [
          { width: 24, alpha: 0.12, blur: 36, radius: 55 },
          { width: 16, alpha: 0.28, blur: 22, radius: 55 },
          { width: 9, alpha: 0.58, blur: 10, radius: 55 },
        ]) {
          context.save();
          context.globalAlpha = layer.alpha;
          context.strokeStyle = cssColor;
          context.lineWidth = layer.width;
          context.shadowColor = cssColor;
          context.shadowBlur = layer.blur;
          drawPadPath(layer.radius);
          context.stroke();
          context.restore();
        }

        context.save();
        context.lineCap = 'round';
        context.lineWidth = 4;
        context.shadowColor = cssColor;
        context.shadowBlur = 8;
        for (let i = 0; i < 9; i++) {
          const start = ((noiseSeed + i * 37) % 360) * Math.PI / 180;
          const length = (18 + ((noiseSeed + i * 19) % 32)) * Math.PI / 180;
          context.globalAlpha = 0.12 + ((i % 3) * 0.04);
          context.strokeStyle = i % 4 === 0 ? 'rgba(255,255,255,.68)' : cssColor;
          context.beginPath();
          context.arc(centerX, centerY, 55 + (i % 2) * 1.6, start, start + length);
          context.stroke();
        }
        context.restore();

        context.save();
        context.globalAlpha = 0.18;
        context.fillStyle = cssColor;
        drawPadPath(50);
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
          { alpha: 0.52, blur: 12 },
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
        body.addColorStop(0, colorRgba(color, 0.95));
        body.addColorStop(0.42, colorRgba(color, 0.82));
        body.addColorStop(0.76, colorRgba(color, 0.72));
        body.addColorStop(1, colorRgba(color, 0.58));
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
      drawCenteredTabularText(context, text, centerX, centerY);

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
      const material = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0, depthWrite: false, depthTest: false, fog: false, blending: THREE.AdditiveBlending });
      materials.push(material);
      return material;
    };

    const padLabels = new Map<number, THREE.Sprite>();
    const padReflections = new Map<number, THREE.MeshBasicMaterial>();
    const noteContacts = new Map<TabNote, THREE.MeshBasicMaterial>();
    for (let string = 6; string >= 1; string--) {
      const laneIndex = LANE_COUNT - string;
      const pad = new THREE.Sprite(makeBadgeMaterial('0', COLORS[laneIndex], 'pad'));
      pad.position.set(highwayLaneX(string), 0.72, TARGET_Z);
      pad.scale.set(PAD_BASE_SCALE, PAD_BASE_SCALE, 1);
      scene.add(pad);
      padLabels.set(string, pad);
      const padGlowGeometry = new THREE.PlaneGeometry(1.72, 1.02);
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
      const nextPadFrets = new Map<number, number>();
      const start = firstHighwayNote(current.notes, current.playbackMs - HIGHWAY_PAST_MS);
      for (let i = start; i < current.notes.length; i++) {
        const note = current.notes[i];
        if (note.timestampMs > current.playbackMs + HIGHWAY_LOOKAHEAD_MS) break;
        if (!nextPadFrets.has(note.string) && note.timestampMs >= current.playbackMs - HIT_WINDOW_MS) {
          nextPadFrets.set(note.string, note.fret);
        }
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
          badge.position.y = 0.62;
          badge.scale.set(1.42, 0.9, 1);
          group.add(badge);
          const contactGeometry = new THREE.PlaneGeometry(1.42, 0.72);
          geometries.push(contactGeometry);
          const contactMaterial = makeFloorGlowMaterial(COLORS[laneIndex], NOTE_CONTACT_OPACITY, false);
          const contact = new THREE.Mesh(contactGeometry, contactMaterial);
          contact.rotation.x = -Math.PI / 2;
          group.add(contact);
          noteContacts.set(note, contactMaterial);
          scene.add(group);
          active.set(note, group);
        }
        const noteZ = highwayNoteZ(note.timestampMs, current.playbackMs) + TARGET_Z;
        const depthLift = THREE.MathUtils.clamp((noteZ - TARGET_Z) / 34, 0, 1) * 0.54;
        const noteY = 0.22 + depthLift;
        group.position.set(highwayLaneX(note.string), noteY, noteZ);
        const contact = group.children[1];
        if (contact) contact.position.y = -noteY - 0.355;
        const contactMaterial = noteContacts.get(note);
        if (contactMaterial) {
          const near = 1 - THREE.MathUtils.clamp((TARGET_Z - noteZ) / HIGHWAY_LENGTH, 0, 1);
          contactMaterial.opacity = NOTE_CONTACT_OPACITY * THREE.MathUtils.clamp(near, 0.16, 1);
        }
      }
      for (let string = 1; string <= 6; string++) {
        const label = padLabels.get(string);
        if (label) {
          const hitAge = current.playbackMs - (padHits.get(string) ?? -1000);
          const hitProgress = THREE.MathUtils.clamp(hitAge / 260, 0, 1);
          const hitPulse = hitAge >= 0 && hitAge < 260 ? Math.sin((1 - hitProgress) * Math.PI) : 0;
          const target = playbackAdvanced ? 0.9 + hitPulse * 0.1 : 0.82;
          label.material = makeBadgeMaterial(String(nextPadFrets.get(string) ?? 0), COLORS[LANE_COUNT - string], 'pad');
          label.material.opacity = THREE.MathUtils.lerp(label.material.opacity, target, 0.16);
          const reflectionMaterial = padReflections.get(string);
          if (reflectionMaterial) {
            reflectionMaterial.opacity = THREE.MathUtils.lerp(reflectionMaterial.opacity, PAD_REFLECTION_OPACITY + hitPulse * 0.16, 0.12);
          }
          const breathe = 1 + Math.sin(performance.now() * 0.0014 + string) * 0.025;
          const scalePulse = (1 + hitPulse * 0.32) * breathe;
          label.scale.set(PAD_BASE_SCALE * scalePulse, PAD_BASE_SCALE * scalePulse, 1);
        }
      }
      const now = performance.now();
      const dustAttribute = dustGeometry.getAttribute('position') as THREE.BufferAttribute;
      const dustArray = dustAttribute.array as Float32Array;
      for (let i = 0; i < DUST_PARTICLE_COUNT; i++) {
        dustArray[i * 3] += Math.sin(now * 0.00018 + dustPhases[i]) * 0.0018;
        dustArray[i * 3 + 1] += Math.cos(now * 0.00014 + dustPhases[i]) * 0.0012;
      }
      dustAttribute.needsUpdate = true;
      dustMaterial.opacity = 0.04 + Math.sin(now * 0.0006) * 0.012;
      for (const lightBeam of lightBeams) {
        (lightBeam.beam.material as THREE.MeshBasicMaterial).opacity = lightBeam.baseOpacity + Math.sin(now * 0.00042 + lightBeam.phase) * 0.012;
      }
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
        if (!visible.has(note)) { scene.remove(group); active.delete(note); noteContacts.delete(note); }
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
