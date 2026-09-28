import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

const COLORS = [0x00ff74, 0xff2424, 0xffd41f, 0x1f70ff, 0xff6a00, 0xff00f5];
const LANE_COUNT = 6;
const HIGHWAY_WIDTH = 13.8;
const HIGHWAY_LENGTH = 48;
const laneX = (lane: number) => -HIGHWAY_WIDTH / 2 + (lane + 0.5) * (HIGHWAY_WIDTH / LANE_COUNT);

export function IdleHighway() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [unavailable, setUnavailable] = useState(false);

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
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x071427, 15, 54);
    const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 90);
    camera.position.set(0, 3.12, 4.35);
    camera.lookAt(0, -0.26, -28);
    const composer = new EffectComposer(renderer);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.26, 0.1, 0.78);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(bloomPass);

    const geometries: THREE.BufferGeometry[] = [];
    const materials: THREE.Material[] = [];
    const plane = (width: number, depth: number, color: number, x: number, y: number, z: number, opacity: number, blending: THREE.Blending = THREE.NormalBlending) => {
      const geometry = new THREE.PlaneGeometry(width, depth);
      const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false, blending });
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
      const material = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.08 });
      geometries.push(geometry);
      materials.push(material);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      scene.add(mesh);
      return mesh;
    };

    scene.add(new THREE.HemisphereLight(0x9ceaff, 0x04030a, 1.35));
    const floorGlow = plane(26, 20, 0x071426, 0, -0.34, -6, 0.42);
    floorGlow.scale.x = 1.4;
    const bed = box(HIGHWAY_WIDTH, 0.08, HIGHWAY_LENGTH, 0x070d16, 0, -0.18, -HIGHWAY_LENGTH / 2);
    (bed.material as THREE.MeshStandardMaterial).emissive = new THREE.Color(0x050a12);
    (bed.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.45;

    for (let lane = 0; lane < LANE_COUNT; lane++) {
      const x = laneX(lane);
      plane(1.5, HIGHWAY_LENGTH, COLORS[lane], x, -0.115, -HIGHWAY_LENGTH / 2, 0.13);
      plane(1.74, 18, COLORS[lane], x, -0.112, -8.5, 0.14, THREE.AdditiveBlending);
      plane(1.18, 16, COLORS[lane], x, -0.245, -7.5, 0.07, THREE.AdditiveBlending);
      const rail = box(0.052, 0.055, HIGHWAY_LENGTH, COLORS[lane], x, 0.025, -HIGHWAY_LENGTH / 2);
      const railMaterial = rail.material as THREE.MeshStandardMaterial;
      railMaterial.emissive = new THREE.Color(COLORS[lane]);
      railMaterial.emissiveIntensity = 2.45;
    }
    for (const x of [-HIGHWAY_WIDTH / 2, HIGHWAY_WIDTH / 2]) {
      const rail = box(0.052, 0.08, HIGHWAY_LENGTH, 0x6feeff, x, 0.02, -HIGHWAY_LENGTH / 2);
      const railMaterial = rail.material as THREE.MeshStandardMaterial;
      railMaterial.emissive = new THREE.Color(0x1b8fae);
      railMaterial.emissiveIntensity = 0.75;
      plane(0.24, HIGHWAY_LENGTH, 0x2fdfff, x, -0.18, -HIGHWAY_LENGTH / 2, 0.08, THREE.AdditiveBlending);
    }
    for (let lane = 0; lane < LANE_COUNT; lane++) {
      const geometry = new THREE.RingGeometry(0.44, 0.66, 64);
      const material = new THREE.MeshBasicMaterial({ color: COLORS[lane], transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
      geometries.push(geometry);
      materials.push(material);
      const marker = new THREE.Mesh(geometry, material);
      marker.rotation.x = -Math.PI / 2;
      marker.scale.set(1.52, 0.92, 1);
      marker.position.set(laneX(lane), 0.105, -3.2);
      scene.add(marker);
      plane(1.42, 0.96, COLORS[lane], laneX(lane), -0.16, -3.2, 0.24, THREE.AdditiveBlending);
    }

    let frame = 0;
    const startedAt = performance.now();
    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      renderer.setSize(width, height);
      composer.setSize(width, height);
      bloomPass.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    const draw = () => {
      const t = (performance.now() - startedAt) / 1000;
      bed.position.y = -0.19 + Math.sin(t * 0.6) * 0.01;
      composer.render();
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      scene.clear();
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      composer.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={hostRef} className="start-idle-highway" aria-hidden="true">{unavailable && null}</div>;
}