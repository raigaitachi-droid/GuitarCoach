import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { TabNote } from '../types';

interface Props {
  notes: TabNote[];
  playbackMs: number;
  waitingId?: string;
}

const STRING_COLORS = [
  '#b16cff',
  '#ff7b2f',
  '#4f7cff',
  '#ffd447',
  '#ff4b48',
  '#3ee68a',
];

const LANE_X = [-2.9, -1.74, -0.58, 0.58, 1.74, 2.9];
const HIT_Z = 4.6;
const LOOKAHEAD_MS = 7200;
const TRAIL_MS = 900;
const UNITS_PER_MS = 0.0042;

function roundedRectTexture(fret: number, color: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.shadowColor = color;
  ctx.shadowBlur = 28;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(18, 18, 220, 92, 30);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(8, 12, 20, 0.28)';
  ctx.beginPath();
  ctx.roundRect(25, 25, 206, 78, 24);
  ctx.fill();

  ctx.font = '700 60px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(String(fret), 128, 66);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

export function NoteHighway3D({ notes, playbackMs, waitingId }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const playbackRef = useRef(playbackMs);
  const waitingRef = useRef(waitingId);
  const noteStateRef = useRef(notes);

  useEffect(() => { playbackRef.current = playbackMs; }, [playbackMs]);
  useEffect(() => { waitingRef.current = waitingId; }, [waitingId]);
  useEffect(() => { noteStateRef.current = notes; }, [notes]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#080b12');
    scene.fog = new THREE.FogExp2('#080b12', 0.03);

    const camera = new THREE.PerspectiveCamera(56, 1, 0.1, 120);
    camera.position.set(0, 5.1, 11.3);
    camera.lookAt(0, 0.2, -17);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    mount.appendChild(renderer.domElement);

    const ambient = new THREE.HemisphereLight('#7aa7ff', '#160719', 1.15);
    scene.add(ambient);

    const key = new THREE.DirectionalLight('#d8ecff', 2.4);
    key.position.set(0, 9, 5);
    scene.add(key);

    const cyan = new THREE.PointLight('#26d9ff', 22, 34, 2);
    cyan.position.set(-5, 3, -11);
    scene.add(cyan);

    const magenta = new THREE.PointLight('#c33cff', 20, 30, 2);
    magenta.position.set(5, 3, -15);
    scene.add(magenta);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(8.3, 48),
      new THREE.MeshStandardMaterial({
        color: '#090d18',
        roughness: 0.42,
        metalness: 0.55,
        transparent: true,
        opacity: 0.94,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -0.08, -13);
    scene.add(floor);

    const sideGlowMaterial = new THREE.MeshBasicMaterial({
      color: '#243e68',
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
    });
    for (const x of [-4.15, 4.15]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.035, 48), sideGlowMaterial.clone());
      rail.position.set(x, 0.015, -13);
      scene.add(rail);
    }

    for (let i = 0; i < 6; i += 1) {
      const color = new THREE.Color(STRING_COLORS[5 - i]);
      const lane = new THREE.Mesh(
        new THREE.BoxGeometry(0.025, 0.018, 48),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.82,
        }),
      );
      lane.position.set(LANE_X[i], 0.02, -13);
      scene.add(lane);

      const laneGlow = new THREE.PointLight(color, 3.7, 7.2, 2);
      laneGlow.position.set(LANE_X[i], 0.7, HIT_Z - 0.4);
      scene.add(laneGlow);
    }

    const beatMaterial = new THREE.MeshBasicMaterial({
      color: '#60718d',
      transparent: true,
      opacity: 0.14,
    });
    for (let z = HIT_Z - 3.2; z > -40; z -= 3.2) {
      const marker = new THREE.Mesh(new THREE.BoxGeometry(8.15, 0.012, 0.018), beatMaterial);
      marker.position.set(0, 0.025, z);
      scene.add(marker);
    }

    const hitLine = new THREE.Mesh(
      new THREE.BoxGeometry(8.15, 0.045, 0.11),
      new THREE.MeshBasicMaterial({
        color: '#ffffff',
        transparent: true,
        opacity: 0.92,
      }),
    );
    hitLine.position.set(0, 0.08, HIT_Z);
    scene.add(hitLine);

    const hitGlow = new THREE.PointLight('#ffffff', 16, 8, 2);
    hitGlow.position.set(0, 1, HIT_Z + 0.1);
    scene.add(hitGlow);

    const noteGroup = new THREE.Group();
    scene.add(noteGroup);

    const noteObjects = new Map<string, {
      mesh: THREE.Mesh;
      label: THREE.Sprite;
      baseColor: THREE.Color;
      material: THREE.MeshStandardMaterial;
    }>();

    const createNote = (note: TabNote) => {
      const laneIndex = 6 - note.string;
      const color = new THREE.Color(STRING_COLORS[laneIndex]);
      const geometry = new THREE.BoxGeometry(0.86, 0.18, 0.58);
      geometry.translate(0, 0.12, 0);

      const material = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 1.7,
        roughness: 0.24,
        metalness: 0.38,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.x = LANE_X[laneIndex];
      mesh.castShadow = false;
      mesh.receiveShadow = false;

      const spriteMaterial = new THREE.SpriteMaterial({
        map: roundedRectTexture(note.fret, STRING_COLORS[laneIndex]),
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      });
      const label = new THREE.Sprite(spriteMaterial);
      label.scale.set(0.92, 0.46, 1);
      label.position.set(0, 0.31, -0.02);
      mesh.add(label);

      noteGroup.add(mesh);
      noteObjects.set(note.id, { mesh, label, baseColor: color, material });
    };

    notes.forEach(createNote);

    const resize = () => {
      const rect = mount.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();

    let frame = 0;
    const clock = new THREE.Clock();
    const animate = () => {
      frame = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();
      const nowMs = playbackRef.current;
      const stateById = new Map(noteStateRef.current.map((note) => [note.id, note]));

      for (const source of notes) {
        const object = noteObjects.get(source.id);
        if (!object) continue;

        const relativeMs = source.timestampMs - nowMs;
        const visible = relativeMs <= LOOKAHEAD_MS && relativeMs >= -TRAIL_MS;
        object.mesh.visible = visible;
        if (!visible) continue;

        object.mesh.position.z = HIT_Z - relativeMs * UNITS_PER_MS;
        const live = stateById.get(source.id) || source;
        const isWaiting = waitingRef.current === source.id;
        const nearHit = Math.abs(relativeMs) < 170;
        const pulse = 1 + (nearHit || isWaiting ? Math.sin(elapsed * 12) * 0.08 : 0);
        object.mesh.scale.setScalar(pulse);

        if (live.hitState === 'hit') {
          object.material.emissiveIntensity = 3.7;
          object.material.opacity = 0.95;
          object.material.transparent = true;
        } else if (live.hitState === 'miss' || live.hitState === 'wrong') {
          object.material.color.set('#6c2631');
          object.material.emissive.set('#9b2536');
          object.material.emissiveIntensity = 0.55;
          object.material.opacity = 0.52;
          object.material.transparent = true;
        } else {
          object.material.color.copy(object.baseColor);
          object.material.emissive.copy(object.baseColor);
          object.material.emissiveIntensity = isWaiting ? 3.4 : nearHit ? 2.8 : 1.7;
          object.material.opacity = 1;
          object.material.transparent = false;
        }
      }

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      noteObjects.forEach(({ mesh, label }) => {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        label.material.map?.dispose();
        label.material.dispose();
      });
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
          else object.material.dispose();
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [notes]);

  return (
    <section className="note-highway-shell" aria-label="3D note highway">
      <div className="note-highway-stage" ref={mountRef} />
      <div className="note-highway-vignette" aria-hidden="true" />
      <div className="note-highway-hint" aria-hidden="true">
        <span>FUTURE</span>
        <span>HIT LINE</span>
      </div>
    </section>
  );
}
