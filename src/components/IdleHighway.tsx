import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

const COLORS = [0x00ff74, 0xff2424, 0xffd41f, 0x1f70ff, 0xff6a00, 0xff00f5];
const LANE_COUNT = 6;
const HIGHWAY_WIDTH = 13.6;
const HIGHWAY_LENGTH = 46;
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
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x02050b, 22, 58);
    const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 80);
    camera.position.set(0, 3.0, 4.4);
    camera.lookAt(0, -0.22, -26);

    const geometries: THREE.BufferGeometry[] = [];
    const materials: THREE.Material[] = [];
    const plane = (width: number, depth: number, color: number, x: number, y: number, z: number, opacity: number) => {
      const geometry = new THREE.PlaneGeometry(width, depth);
      const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false });
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
      const material = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.06 });
      geometries.push(geometry);
      materials.push(material);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      scene.add(mesh);
      return mesh;
    };

    scene.add(new THREE.HemisphereLight(0x8adfff, 0x05030b, 1.2));
    const bed = box(HIGHWAY_WIDTH, 0.08, HIGHWAY_LENGTH, 0x060b12, 0, -0.18, -HIGHWAY_LENGTH / 2);
    (bed.material as THREE.MeshStandardMaterial).emissive = new THREE.Color(0x02060a);
    for (let lane = 0; lane < LANE_COUNT; lane++) {
      const x = laneX(lane);
      plane(1.36, HIGHWAY_LENGTH, COLORS[lane], x, -0.12, -HIGHWAY_LENGTH / 2, 0.12);
      const rail = box(0.05, 0.05, HIGHWAY_LENGTH, COLORS[lane], x, 0.02, -HIGHWAY_LENGTH / 2);
      const railMaterial = rail.material as THREE.MeshStandardMaterial;
      railMaterial.emissive = new THREE.Color(COLORS[lane]);
      railMaterial.emissiveIntensity = 2.1;
    }
    for (const x of [-HIGHWAY_WIDTH / 2, HIGHWAY_WIDTH / 2]) {
      const rail = box(0.05, 0.08, HIGHWAY_LENGTH, 0x6feeff, x, 0.02, -HIGHWAY_LENGTH / 2);
      const railMaterial = rail.material as THREE.MeshStandardMaterial;
      railMaterial.emissive = new THREE.Color(0x1b8fae);
      railMaterial.emissiveIntensity = 0.65;
    }
    for (let lane = 0; lane < LANE_COUNT; lane++) {
      const geometry = new THREE.RingGeometry(0.36, 0.5, 48);
      const material = new THREE.MeshBasicMaterial({ color: COLORS[lane], transparent: true, opacity: 0.82, side: THREE.DoubleSide, depthWrite: false });
      geometries.push(geometry);
      materials.push(material);
      const marker = new THREE.Mesh(geometry, material);
      marker.rotation.x = -Math.PI / 2;
      marker.scale.set(1.28, 0.78, 1);
      marker.position.set(laneX(lane), 0.09, -3.25);
      scene.add(marker);
    }

    let frame = 0;
    const startedAt = performance.now();
    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    const draw = () => {
      const t = (performance.now() - startedAt) / 1000;
      bed.position.y = -0.2 + Math.sin(t * 0.6) * 0.012;
      renderer.render(scene, camera);
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      scene.clear();
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={hostRef} className="start-idle-highway" aria-hidden="true">{unavailable && null}</div>;
}