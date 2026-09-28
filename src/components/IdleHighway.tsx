import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

const LANE_COUNT = 6;
const HIGHWAY_WIDTH = 15.2;
const HIGHWAY_LENGTH = 48;
const HIT_Z = -3.15;

// Tunables for the start-screen idle highway.
const PULSE_INTERVAL_SECONDS = [2.5, 3.25, 2.85, 3.7, 3.05, 3.45];
const PULSE_TRAVEL_SECONDS = 2.7;
const STRING_GLOW_INTENSITY = 0.72;
const RING_SIZE = 0.72;
const RING_GLOW_INTENSITY = 0.82;
const HAZE_AMOUNT = 0.24;
const DUST_COUNT = 84;

const STRING_COLORS = [0xe6a84f, 0x36c8bf, 0xe06d58, 0x8a9bff, 0x4acb89, 0xbc67df];
const laneX = (lane: number) => -HIGHWAY_WIDTH / 2 + (lane + 0.5) * (HIGHWAY_WIDTH / LANE_COUNT);
const easeInOutCubic = (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

export function IdleHighway() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch {
      setUnavailable(true);
      return;
    }

    setUnavailable(false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.84;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x050b12, 9.5, 42);
    const camera = new THREE.PerspectiveCamera(57, 1, 0.1, 90);
    camera.position.set(0, 3.18, 4.2);
    camera.lookAt(0, -0.62, -20);

    const composer = new EffectComposer(renderer);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.26, 0.12, 0.82);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(bloomPass);

    const geometries: THREE.BufferGeometry[] = [];
    const materials: THREE.Material[] = [];
    const textures: THREE.Texture[] = [];
    const rings: Array<{ rim: THREE.Mesh; glow: THREE.Mesh; fill: THREE.Mesh; light: THREE.PointLight; phase: number; hitUntil: number }> = [];
    const pulses: Array<{ mesh: THREE.Mesh; material: THREE.MeshBasicMaterial; lane: number; nextStart: number; active: boolean }> = [];

    const makeGradientTexture = (color: number, alphaNear: number, alphaFar: number, centerBoost = 0) => {
      const canvas = document.createElement('canvas');
      canvas.width = 32;
      canvas.height = 256;
      const context = canvas.getContext('2d')!;
      const c = new THREE.Color(color);
      const rgb = `${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}`;
      const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
      gradient.addColorStop(0, `rgba(${rgb}, ${alphaFar})`);
      gradient.addColorStop(0.46, `rgba(${rgb}, ${alphaFar + centerBoost})`);
      gradient.addColorStop(1, `rgba(${rgb}, ${alphaNear})`);
      context.fillStyle = gradient;
      context.fillRect(0, 0, canvas.width, canvas.height);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      textures.push(texture);
      return texture;
    };

    const plane = (width: number, depth: number, color: number, x: number, y: number, z: number, opacity: number, blending: THREE.Blending = THREE.NormalBlending, map?: THREE.Texture) => {
      const geometry = new THREE.PlaneGeometry(width, depth);
      const material = new THREE.MeshBasicMaterial({
        color,
        ...(map ? { map } : {}),
        transparent: true,
        opacity,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending,
      });
      geometries.push(geometry);
      materials.push(material);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, y, z);
      scene.add(mesh);
      return mesh;
    };

    const box = (width: number, height: number, depth: number, color: number, x: number, y: number, z: number) => {
      const geometry = new THREE.BoxGeometry(width, height, depth);
      const material = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.12, transparent: true, opacity: 0.98 });
      geometries.push(geometry);
      materials.push(material);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      scene.add(mesh);
      return mesh;
    };

    scene.add(new THREE.HemisphereLight(0x9bc8d5, 0x020409, 1.05));
    const stageLight = new THREE.PointLight(0x93d7ff, 3.2, 18, 2.4);
    stageLight.position.set(0, 2.2, -3.2);
    scene.add(stageLight);

    const floor = plane(24, 16, 0x02050a, 0, -0.38, -4.8, 0.42);
    floor.scale.x = 1.45;
    const bed = box(HIGHWAY_WIDTH + 0.5, 0.07, HIGHWAY_LENGTH, 0x050910, 0, -0.2, -HIGHWAY_LENGTH / 2 + 0.8);
    const bedMaterial = bed.material as THREE.MeshStandardMaterial;
    bedMaterial.emissive = new THREE.Color(0x02060b);
    bedMaterial.emissiveIntensity = 0.32;

    for (let lane = 0; lane < LANE_COUNT; lane++) {
      const color = STRING_COLORS[lane];
      const x = laneX(lane);
      const laneTexture = makeGradientTexture(color, 0.066, 0.004, 0.006);
      plane(1.5, HIGHWAY_LENGTH, 0x08101a, x, -0.118, -HIGHWAY_LENGTH / 2 + 0.8, 0.52);
      plane(1.34, HIGHWAY_LENGTH, 0xffffff, x, -0.112, -HIGHWAY_LENGTH / 2 + 0.8, 1, THREE.NormalBlending, laneTexture);
      plane(1.62, 18, color, x, -0.24, -7.3, 0.028, THREE.AdditiveBlending);
      plane(2.0, 3.4, color, x, -0.255, HIT_Z - 0.1, 0.046, THREE.AdditiveBlending);

      const core = box(0.026, 0.038, HIGHWAY_LENGTH, color, x, 0.034, -HIGHWAY_LENGTH / 2 + 0.8);
      const coreMaterial = core.material as THREE.MeshStandardMaterial;
      coreMaterial.emissive = new THREE.Color(color);
      coreMaterial.emissiveIntensity = 2.35;
      const filamentGlow = plane(0.34, HIGHWAY_LENGTH, color, x, -0.026, -HIGHWAY_LENGTH / 2 + 0.8, STRING_GLOW_INTENSITY, THREE.AdditiveBlending, makeGradientTexture(color, 0.48, 0.014, 0.022));
      filamentGlow.renderOrder = 1;
      const stringReflection = plane(0.5, HIGHWAY_LENGTH * 0.72, color, x, -0.315, -HIGHWAY_LENGTH * 0.32, 0.052, THREE.AdditiveBlending, makeGradientTexture(color, 0.2, 0.004, 0.01));
      stringReflection.scale.x = 1.25;

      const pulseGeometry = new THREE.PlaneGeometry(0.42, 2.7);
      const pulseMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
      geometries.push(pulseGeometry);
      materials.push(pulseMaterial);
      const pulse = new THREE.Mesh(pulseGeometry, pulseMaterial);
      pulse.rotation.x = -Math.PI / 2;
      pulse.position.set(x, 0.075, -42);
      scene.add(pulse);
      pulses.push({ mesh: pulse, material: pulseMaterial, lane, nextStart: lane * 0.42 + 0.6, active: false });
    }

    for (const x of [-HIGHWAY_WIDTH / 2, HIGHWAY_WIDTH / 2]) {
      const rail = box(0.036, 0.055, HIGHWAY_LENGTH, 0xd6f2ff, x, 0.018, -HIGHWAY_LENGTH / 2 + 0.8);
      const railMaterial = rail.material as THREE.MeshStandardMaterial;
      railMaterial.emissive = new THREE.Color(0xa9c7d0);
      railMaterial.emissiveIntensity = 0.24;
      plane(0.12, HIGHWAY_LENGTH, 0xd6f2ff, x, -0.18, -HIGHWAY_LENGTH / 2 + 0.8, 0.026, THREE.AdditiveBlending);
    }

    const hazeTexture = makeGradientTexture(0x89b9c6, HAZE_AMOUNT, 0.02);
    const farHaze = plane(HIGHWAY_WIDTH + 6.2, 18, 0xffffff, 0, 0.055, -32, 1, THREE.NormalBlending, hazeTexture);
    farHaze.rotation.x = -Math.PI / 2;
    const mistGeometry = new THREE.PlaneGeometry(HIGHWAY_WIDTH + 11, 8.5);
    const mistMaterial = new THREE.MeshBasicMaterial({ color: 0x86aebc, transparent: true, opacity: HAZE_AMOUNT * 0.56, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    geometries.push(mistGeometry);
    materials.push(mistMaterial);
    const mist = new THREE.Mesh(mistGeometry, mistMaterial);
    mist.position.set(0, 1.75, -32);
    scene.add(mist);

    const ringGeometry = new THREE.RingGeometry(RING_SIZE * 0.62, RING_SIZE * 0.78, 96);
    const fillGeometry = new THREE.CircleGeometry(RING_SIZE * 0.6, 96);
    const glowGeometry = new THREE.CircleGeometry(RING_SIZE * 1.05, 96);
    geometries.push(ringGeometry, fillGeometry, glowGeometry);
    for (let lane = 0; lane < LANE_COUNT; lane++) {
      const color = STRING_COLORS[lane];
      const x = laneX(lane);
      const fillMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
      const rimMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.88, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
      const glowMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
      materials.push(fillMaterial, rimMaterial, glowMaterial);
      const fill = new THREE.Mesh(fillGeometry, fillMaterial);
      const rim = new THREE.Mesh(ringGeometry, rimMaterial);
      const glow = new THREE.Mesh(glowGeometry, glowMaterial);
      for (const mesh of [fill, rim, glow]) {
        mesh.rotation.x = -Math.PI / 2;
        mesh.scale.set(1.06, 0.78, 1);
        mesh.position.set(x, mesh === glow ? -0.01 : 0.09, HIT_Z);
        scene.add(mesh);
      }
      const ringReflection = plane(RING_SIZE * 1.85, RING_SIZE * 1.0, color, x, -0.31, HIT_Z + 0.1, 0.09, THREE.AdditiveBlending);
      ringReflection.scale.x = 1.25;
      const light = new THREE.PointLight(color, lane === 3 ? 0.82 : 0.6, 3.4, 2.2);
      light.position.set(x, 0.38, HIT_Z + 0.1);
      scene.add(light);
      rings.push({ rim, glow, fill, light, phase: lane * 0.8, hitUntil: -10 });
    }

    const dustGeometry = new THREE.BufferGeometry();
    const dustPositions = new Float32Array(DUST_COUNT * 3);
    const dustSeeds = new Float32Array(DUST_COUNT);
    for (let i = 0; i < DUST_COUNT; i++) {
      dustPositions[i * 3] = (Math.random() - 0.5) * (HIGHWAY_WIDTH + 4);
      dustPositions[i * 3 + 1] = 0.5 + Math.random() * 2.2;
      dustPositions[i * 3 + 2] = -39 + Math.random() * 35;
      dustSeeds[i] = Math.random() * 10;
    }
    dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    const dustMaterial = new THREE.PointsMaterial({ color: 0xb9dce3, transparent: true, opacity: 0.12, size: 0.035, depthWrite: false, blending: THREE.AdditiveBlending });
    geometries.push(dustGeometry);
    materials.push(dustMaterial);
    const dust = new THREE.Points(dustGeometry, dustMaterial);
    scene.add(dust);

    let frame = 0;
    let running = !document.hidden;
    let lastTime = performance.now();
    let elapsed = 0;
    let lost = false;

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      renderer.setSize(width, height);
      composer.setSize(width, height);
      bloomPass.setSize(width, height);
      camera.aspect = width / height;
      camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.max(Math.tan(THREE.MathUtils.degToRad(28.5)), 0.82 / camera.aspect)));
      camera.updateProjectionMatrix();
    };

    const scheduleNextPulse = (pulse: typeof pulses[number], now: number) => {
      const jitter = 0.65 + ((pulse.lane * 41 + Math.floor(now * 3)) % 100) / 100 * 0.75;
      pulse.nextStart = now + PULSE_INTERVAL_SECONDS[pulse.lane] + jitter;
      pulse.active = false;
      pulse.material.opacity = 0;
    };

    const render = (nowMs: number) => {
      if (lost) return;
      if (!running) {
        frame = 0;
        return;
      }
      const delta = Math.min((nowMs - lastTime) / 1000, 0.05);
      lastTime = nowMs;
      if (!reducedMotion) elapsed += delta;

      for (const pulse of pulses) {
        if (!reducedMotion && !pulse.active && elapsed >= pulse.nextStart) pulse.active = true;
        if (!pulse.active) continue;
        const progress = THREE.MathUtils.clamp((elapsed - pulse.nextStart) / PULSE_TRAVEL_SECONDS, 0, 1);
        const eased = easeInOutCubic(progress);
        pulse.mesh.position.z = THREE.MathUtils.lerp(-42, HIT_Z, eased);
        pulse.material.opacity = Math.sin(progress * Math.PI) * 0.44;
        pulse.mesh.scale.z = 0.75 + (1 - progress) * 0.55;
        if (progress >= 1) {
          rings[pulse.lane].hitUntil = elapsed + 0.42;
          scheduleNextPulse(pulse, elapsed);
        }
      }

      rings.forEach((ring, lane) => {
        const breathe = reducedMotion ? 0.5 : (Math.sin(elapsed * (Math.PI * 2 / (4.6 + lane * 0.17)) + ring.phase) + 1) / 2;
        const hit = THREE.MathUtils.clamp((ring.hitUntil - elapsed) / 0.42, 0, 1);
        const hitEase = easeOutCubic(hit);
        const glow = RING_GLOW_INTENSITY * (0.82 + breathe * 0.18 + hitEase * 0.5);
        (ring.rim.material as THREE.MeshBasicMaterial).opacity = 0.72 + breathe * 0.12 + hitEase * 0.16;
        (ring.fill.material as THREE.MeshBasicMaterial).opacity = 0.1 + breathe * 0.035 + hitEase * 0.06;
        (ring.glow.material as THREE.MeshBasicMaterial).opacity = 0.16 + glow * 0.12;
        const scale = 1 + breathe * 0.025 + hitEase * 0.12;
        ring.rim.scale.set(1.06 * scale, 0.78 * scale, 1);
        ring.fill.scale.set(1.06 * scale, 0.78 * scale, 1);
        ring.glow.scale.set(1.06 * (1.08 + hitEase * 0.12), 0.78 * (1.08 + hitEase * 0.12), 1);
        ring.light.intensity = 0.35 + breathe * 0.16 + hitEase * 0.42;
      });

      if (!reducedMotion) {
        const position = dustGeometry.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < DUST_COUNT; i++) {
          const zIndex = i * 3 + 2;
          dustPositions[zIndex] += delta * (0.22 + (dustSeeds[i] % 1) * 0.16);
          dustPositions[i * 3] += Math.sin(elapsed * 0.2 + dustSeeds[i]) * delta * 0.015;
          if (dustPositions[zIndex] > 0.5) dustPositions[zIndex] = -39;
        }
        position.needsUpdate = true;
      }

      composer.render();
      frame = requestAnimationFrame(render);
    };

    const visibilityChange = () => {
      running = !document.hidden;
      lastTime = performance.now();
      if (!running) {
        cancelAnimationFrame(frame);
        frame = 0;
      } else if (!frame && !lost) {
        frame = requestAnimationFrame(render);
      }
    };
    const observer = new ResizeObserver(resize);
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
      frame = requestAnimationFrame(render);
    };

    observer.observe(host);
    document.addEventListener('visibilitychange', visibilityChange);
    renderer.domElement.addEventListener('webglcontextlost', contextLost);
    renderer.domElement.addEventListener('webglcontextrestored', contextRestored);
    resize();
    composer.render();
    frame = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener('visibilitychange', visibilityChange);
      renderer.domElement.removeEventListener('webglcontextlost', contextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', contextRestored);
      scene.clear();
      textures.forEach((texture) => texture.dispose());
      materials.forEach((material) => material.dispose());
      geometries.forEach((geometry) => geometry.dispose());
      composer.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={hostRef} className="start-idle-highway" aria-hidden="true">{unavailable && null}</div>;
}
