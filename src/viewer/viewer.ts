import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { LampParameters, LampPart } from '../types';

export type ViewMode = 'night' | 'day' | 'cutaway';

export interface LampViewer {
  updateParts(parts: LampPart[], params: LampParameters): void;
  setViewMode(mode: ViewMode): void;
  setCutawayPlane(depth: number): void; // 0 to 1
  setLightColor(hex: string, intensity: number): void;
  resetCamera(): void;
  dispose(): void;
}

export function createLampViewer(container: HTMLElement): LampViewer {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0a0f18');

  const camera = new THREE.PerspectiveCamera(40, container.clientWidth / container.clientHeight, 1, 2000);
  camera.position.set(160, 140, 240);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.localClippingEnabled = true;
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.target.set(0, 0, 75);
  controls.maxPolarAngle = Math.PI / 2 + 0.15; // Allow slight under-angle viewing of base
  controls.minDistance = 60;
  controls.maxDistance = 600;

  // Clipping Plane for Cutaway Inspection Mode
  const clipPlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);

  // Lighting rigs
  // 1. Day / Studio Lights
  const studioGroup = new THREE.Group();
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
  keyLight.position.set(120, 200, 150);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.width = 2048;
  keyLight.shadow.mapSize.height = 2048;
  keyLight.shadow.bias = -0.0001;
  studioGroup.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0x90b0e0, 0.8);
  fillLight.position.set(-150, 100, -100);
  studioGroup.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0xffeedd, 0.9);
  rimLight.position.set(0, -150, 120);
  studioGroup.add(rimLight);

  const ambientLight = new THREE.AmbientLight(0x1a2638, 0.8);
  studioGroup.add(ambientLight);
  scene.add(studioGroup);

  // 2. Night Glow Lights
  const glowGroup = new THREE.Group();
  const lampCoreLight = new THREE.PointLight(0xffaa44, 2.5, 300, 1.2);
  lampCoreLight.position.set(0, 0, 70);
  glowGroup.add(lampCoreLight);

  const deskGlowLight = new THREE.PointLight(0xffaa44, 1.8, 150, 1.5);
  deskGlowLight.position.set(0, 0, 10);
  glowGroup.add(deskGlowLight);
  scene.add(glowGroup);

  // Circular Pedestal / Desk Ground Plane
  const floorGeo = new THREE.CircleGeometry(250, 64);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x090d14,
    roughness: 0.85,
    metalness: 0.1,
  });
  const floorMesh = new THREE.Mesh(floorGeo, floorMat);
  floorMesh.position.set(0, 0, -18);
  floorMesh.receiveShadow = true;
  scene.add(floorMesh);

  // Parts Mesh Storage
  const partMeshes: Map<string, THREE.Mesh> = new Map();
  let currentMode: ViewMode = 'night';
  let activeParams: LampParameters | null = null;

  function partToThreeGeometry(part: LampPart): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    const vp = part.mesh.vertProperties;
    const np = part.mesh.numProp;
    const count = vp.length / np;

    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = vp[i * np];
      positions[i * 3 + 1] = vp[i * np + 1];
      positions[i * 3 + 2] = vp[i * np + 2];
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setIndex(new THREE.BufferAttribute(part.mesh.triVerts, 1));
    return toCreasedNormals(geo, (38 * Math.PI) / 180);
  }

  function applyViewStyle() {
    const isNight = currentMode === 'night';
    const isCutaway = currentMode === 'cutaway';

    scene.background = new THREE.Color(isNight ? '#05080e' : '#0d131f');
    studioGroup.visible = !isNight || isCutaway;
    glowGroup.visible = isNight;

    renderer.clippingPlanes = isCutaway ? [clipPlane] : [];

    partMeshes.forEach((mesh, id) => {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.clippingPlanes = isCutaway ? [clipPlane] : [];
      mat.clipShadows = true;

      if (id === 'veins') {
        if (isNight) {
          mat.emissive = new THREE.Color(activeParams?.lightColor ?? '#ffaa44');
          mat.emissiveIntensity = (activeParams?.lightIntensity ?? 1.0) * 2.2;
          mat.roughness = 0.3;
        } else {
          mat.emissive = new THREE.Color('#000000');
          mat.emissiveIntensity = 0.0;
          mat.roughness = 0.6;
        }
      }
    });
  }

  function updateParts(parts: LampPart[], params: LampParameters) {
    activeParams = params;

    // Remove old meshes
    partMeshes.forEach((mesh) => {
      scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    });
    partMeshes.clear();

    // Create new meshes
    parts.forEach((p) => {
      const geo = partToThreeGeometry(p);
      let mat: THREE.MeshStandardMaterial;

      if (p.id === 'veins') {
        mat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(p.color),
          roughness: 0.4,
          metalness: 0.05,
          side: THREE.DoubleSide,
        });
      } else {
        // Dark opaque shell / base
        mat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(p.color),
          roughness: 0.75,
          metalness: 0.15,
          side: THREE.DoubleSide,
        });
      }

      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      partMeshes.set(p.id, mesh);
    });

    // Update light colors
    const lColor = new THREE.Color(params.lightColor);
    lampCoreLight.color = lColor;
    lampCoreLight.intensity = params.lightIntensity * 2.5;
    lampCoreLight.position.set(0, 0, params.height * 0.45);

    deskGlowLight.color = lColor;
    deskGlowLight.intensity = params.lightIntensity * 1.8;

    controls.target.set(0, 0, params.height * 0.45);
    applyViewStyle();
  }

  function setViewMode(mode: ViewMode) {
    currentMode = mode;
    applyViewStyle();
  }

  function setCutawayPlane(progress: number) {
    // Progress 0 to 1 maps to cutting along X axis from outer edge to center
    const maxRadius = (activeParams?.baseRadius ?? 50) + 10;
    const xPos = maxRadius * (1 - 2 * progress);
    clipPlane.constant = xPos;
  }

  function setLightColor(hex: string, intensity: number) {
    if (activeParams) {
      activeParams.lightColor = hex;
      activeParams.lightIntensity = intensity;
    }
    const color = new THREE.Color(hex);
    lampCoreLight.color = color;
    lampCoreLight.intensity = intensity * 2.5;
    deskGlowLight.color = color;
    deskGlowLight.intensity = intensity * 1.8;

    const veinMesh = partMeshes.get('veins');
    if (veinMesh && currentMode === 'night') {
      const mat = veinMesh.material as THREE.MeshStandardMaterial;
      mat.emissive = color;
      mat.emissiveIntensity = intensity * 2.2;
    }
  }

  function resetCamera() {
    const h = activeParams?.height ?? 180;
    camera.position.set(h * 0.9, h * 0.7, h * 1.3);
    controls.target.set(0, 0, h * 0.45);
    controls.update();
  }

  // Animation loop
  let reqId = 0;
  function animate() {
    reqId = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  // Resize listener
  const onResize = () => {
    if (!container) return;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  };
  window.addEventListener('resize', onResize);

  return {
    updateParts,
    setViewMode,
    setCutawayPlane,
    setLightColor,
    resetCamera,
    dispose() {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(reqId);
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement) {
        renderer.domElement.parentElement.removeChild(renderer.domElement);
      }
    },
  };
}
