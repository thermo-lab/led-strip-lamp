import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { LampParameters, LampPart } from '../types';
import {
  createNoise3D,
  evalOrganicCenter,
  evalOrganicRadius,
  evalStripAngle,
  evalVeinAngle,
} from '../geometry/organicField';

export type ViewMode = 'night' | 'day' | 'cutaway';

export interface LampViewer {
  updateParts(parts: LampPart[], params: LampParameters): void;
  setViewMode(mode: ViewMode): void;
  setCutawayPlane(depth: number): void;
  setLightColor(hex: string, intensity: number): void;
  resetCamera(): void;
  dispose(): void;
}

export function createLampViewer(container: HTMLElement): LampViewer {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0a0f18');

  // Camera with Z-UP coordinate basis to eliminate gimbal lock with CAD geometry
  const camera = new THREE.PerspectiveCamera(40, container.clientWidth / container.clientHeight, 1, 2500);
  camera.up.set(0, 0, 1);
  camera.position.set(180, -220, 130);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.localClippingEnabled = true;
  container.appendChild(renderer.domElement);

  // OrbitControls with Z-UP orientation & smooth touch interaction
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.object.up.set(0, 0, 1);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.8;
  controls.target.set(0, 0, 75);
  controls.minPolarAngle = 0.05;
  controls.maxPolarAngle = Math.PI / 2 + 0.12; // Prevent flipping beneath floor
  controls.minDistance = 60;
  controls.maxDistance = 650;
  controls.touches = {
    ONE: THREE.TOUCH.ROTATE,
    TWO: THREE.TOUCH.DOLLY_PAN,
  };

  // Clipping Plane for Cutaway Inspection Mode
  const clipPlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);

  // Lighting rigs
  // 1. Studio Lights
  const studioGroup = new THREE.Group();
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
  keyLight.position.set(160, -200, 220);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.width = 2048;
  keyLight.shadow.mapSize.height = 2048;
  keyLight.shadow.bias = -0.0001;
  studioGroup.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0x90b0e0, 0.7);
  fillLight.position.set(-160, 120, 150);
  studioGroup.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0xffeedd, 0.8);
  rimLight.position.set(0, 180, 160);
  studioGroup.add(rimLight);

  const ambientLight = new THREE.AmbientLight(0x223045, 0.7);
  studioGroup.add(ambientLight);
  scene.add(studioGroup);

  // 2. Glow Lighting Rig (placed physically along the light channels)
  const glowGroup = new THREE.Group();
  const deskGlowLight = new THREE.PointLight(0xff9d3b, 1.8, 180, 1.3);
  deskGlowLight.position.set(0, 0, 8);
  glowGroup.add(deskGlowLight);

  // Multiple distributed point lights for realistic physical light emission
  const veinLights: THREE.PointLight[] = [];
  for (let i = 0; i < 4; i++) {
    const pl = new THREE.PointLight(0xff9d3b, 1.5, 160, 1.2);
    glowGroup.add(pl);
    veinLights.push(pl);
  }
  scene.add(glowGroup);

  // Circular Desk Pedestal
  const floorGeo = new THREE.CircleGeometry(260, 64);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x090d14,
    roughness: 0.85,
    metalness: 0.15,
  });
  const floorMesh = new THREE.Mesh(floorGeo, floorMat);
  floorMesh.position.set(0, 0, -18);
  floorMesh.receiveShadow = true;
  scene.add(floorMesh);

  // Internal LED Strips & Electronics Visualization Group
  const electronicsGroup = new THREE.Group();
  scene.add(electronicsGroup);

  // Mesh Storage
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
    geo.computeVertexNormals();
    return toCreasedNormals(geo, (50 * Math.PI) / 180);
  }

  // Build physical WS2812B strips & 5050 LEDs in 3D to match physical geometry
  function rebuildElectronicsModels(params: LampParameters) {
    // Clear previous electronics models
    while (electronicsGroup.children.length > 0) {
      const child = electronicsGroup.children[0] as any;
      electronicsGroup.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach((m: any) => m.dispose());
        else child.material.dispose();
      }
    }

    const {
      height,
      baseRadius,
      topRadius,
      waistRatio,
      wallThickness,
      twistAngle,
      veinCount,
      veinSwirl,
      waveAmplitude,
      waveFrequency,
      lightColor,
      lightIntensity,
    } = params;

    const getRNom = (u: number): number => {
      return (1 - u) * baseRadius + u * topRadius + 4 * u * (1 - u) * ((waistRatio - 1) * (baseRadius + topRadius) * 0.5);
    };

    const twistRad = (twistAngle * Math.PI) / 180;
    const swirlRad = veinSwirl * 2 * Math.PI;
    const avgR = (baseRadius + topRadius) / 2;

    const lColor = new THREE.Color(lightColor);
    const stripTapeMat = new THREE.MeshStandardMaterial({
      color: 0xefefef, // White flex PCB
      roughness: 0.5,
      metalness: 0.1,
      side: THREE.DoubleSide,
    });
    const ledBodyMat = new THREE.MeshStandardMaterial({
      color: 0x111111, // 5050 package plastic
      roughness: 0.6,
    });
    const ledDieMat = new THREE.MeshStandardMaterial({
      color: lColor,
      emissive: lColor,
      emissiveIntensity: lightIntensity * 2.5,
      roughness: 0.2,
    });

    const ledBoxGeo = new THREE.BoxGeometry(4.5, 4.5, 1.4);
    const dieBoxGeo = new THREE.BoxGeometry(2.5, 2.5, 0.4);

    const noise = createNoise3D(params.organicSeed ?? 42);

    // Build strip segments for each vein along the smooth recessed carrier path
    const nSegments = 32;
    for (let v = 0; v < veinCount; v++) {
      // Generate flexible strip ribbon geometry
      const stripVerts: number[] = [];
      const stripIndices: number[] = [];

      for (let s = 0; s <= nSegments; s++) {
        const u = s / nSegments;
        const z = u * height;
        const rNom = getRNom(u);
        const rCore = Math.max(22.0, rNom - 9.0);
        const thStrip = evalStripAngle(v, veinCount, u, params);
        const [cx, cy] = evalOrganicCenter(u, params, noise);
        const rTrack = rCore - 0.5; // Seated in recessed track bed

        const dThHalf = 5.0 / Math.max(16, rTrack); // 10mm wide strip = 5mm half-width

        const xL = cx + rTrack * Math.cos(thStrip - dThHalf);
        const yL = cy + rTrack * Math.sin(thStrip - dThHalf);
        const xR = cx + rTrack * Math.cos(thStrip + dThHalf);
        const yR = cy + rTrack * Math.sin(thStrip + dThHalf);

        stripVerts.push(xL, yL, z);
        stripVerts.push(xR, yR, z);

        if (s > 0) {
          const i0 = (s - 1) * 2;
          const i1 = i0 + 1;
          const i2 = s * 2;
          const i3 = i2 + 1;
          stripIndices.push(i0, i1, i3);
          stripIndices.push(i0, i3, i2);
        }
      }

      const stripGeo = new THREE.BufferGeometry();
      stripGeo.setAttribute('position', new THREE.Float32BufferAttribute(stripVerts, 3));
      stripGeo.setIndex(stripIndices);
      stripGeo.computeVertexNormals();

      const stripMesh = new THREE.Mesh(stripGeo, stripTapeMat);
      electronicsGroup.add(stripMesh);

      // Place discrete 5050 LED chips every ~16.67mm
      const nLeds = Math.max(3, Math.round(height / 16.67));
      for (let l = 1; l < nLeds; l++) {
        const u = l / nLeds;
        const z = u * height;
        const rNom = getRNom(u);
        const rCore = Math.max(22.0, rNom - 9.0);
        const thStrip = evalStripAngle(v, veinCount, u, params);
        const [cx, cy] = evalOrganicCenter(u, params, noise);
        const rTrack = rCore - 0.5;

        const ledMesh = new THREE.Mesh(ledBoxGeo, ledBodyMat);
        ledMesh.position.set(cx + rTrack * Math.cos(thStrip), cy + rTrack * Math.sin(thStrip), z);
        ledMesh.rotation.z = thStrip + Math.PI / 2;
        electronicsGroup.add(ledMesh);

        const dieMesh = new THREE.Mesh(dieBoxGeo, ledDieMat);
        dieMesh.position.set(
          cx + (rTrack + 0.6) * Math.cos(thStrip),
          cy + (rTrack + 0.6) * Math.sin(thStrip),
          z
        );
        dieMesh.rotation.z = thStrip + Math.PI / 2;
        electronicsGroup.add(dieMesh);
      }
    }

    // Model the ESP32-C6 SuperMini board in the base cradle
    const baseOuterR = baseRadius + 4.0;
    const boardGroup = new THREE.Group();
    boardGroup.position.set(baseOuterR - 15.0, 0, -9.0);

    // PCB substrate (Deep blue/black)
    const pcbGeo = new THREE.BoxGeometry(22.5, 18.0, 1.2);
    const pcbMat = new THREE.MeshStandardMaterial({ color: 0x081a30, roughness: 0.4 });
    const pcb = new THREE.Mesh(pcbGeo, pcbMat);
    boardGroup.add(pcb);

    // Metal RF Shield
    const shieldGeo = new THREE.BoxGeometry(11.0, 13.0, 2.2);
    const shieldMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.85, roughness: 0.25 });
    const shield = new THREE.Mesh(shieldGeo, shieldMat);
    shield.position.set(-3.0, 0, 1.3);
    boardGroup.add(shield);

    // Type-C Receptacle
    const usbGeo = new THREE.BoxGeometry(7.5, 9.0, 3.2);
    const usbMat = new THREE.MeshStandardMaterial({ color: 0xd4d4d8, metalness: 0.9, roughness: 0.2 });
    const usb = new THREE.Mesh(usbGeo, usbMat);
    usb.position.set(11.0, 0, 1.2);
    boardGroup.add(usb);

    electronicsGroup.add(boardGroup);

    // Update clipping plane on all electronics meshes
    applyClippingToGroup(electronicsGroup);
  }

  function applyClippingToGroup(group: THREE.Group) {
    const isCutaway = currentMode === 'cutaway';
    group.traverse((obj: any) => {
      if (obj.isMesh && obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m: any) => {
            m.clippingPlanes = isCutaway ? [clipPlane] : [];
            m.clipShadows = true;
          });
        } else {
          obj.material.clippingPlanes = isCutaway ? [clipPlane] : [];
          obj.material.clipShadows = true;
        }
      }
    });
  }

  function applyViewStyle() {
    const isNight = currentMode === 'night';
    const isCutaway = currentMode === 'cutaway';

    scene.background = new THREE.Color(isNight ? '#05080e' : '#0d131f');
    studioGroup.visible = !isNight || isCutaway;
    glowGroup.visible = isNight || isCutaway;
    electronicsGroup.visible = isCutaway;

    renderer.clippingPlanes = isCutaway ? [clipPlane] : [];

    const lColor = new THREE.Color(activeParams?.lightColor ?? '#ff9d3b');
    const intensity = activeParams?.lightIntensity ?? 1.2;

    // Apply material emissive & diffuse colors to veins in ALL modes
    partMeshes.forEach((mesh, id) => {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.clippingPlanes = isCutaway ? [clipPlane] : [];
      mat.clipShadows = true;

      if (id === 'veins') {
        // Vein material radiates the chosen light color in all modes
        mat.color = lColor.clone().lerp(new THREE.Color('#ffffff'), 0.25);
        mat.emissive = lColor;
        mat.emissiveIntensity = isNight ? intensity * 2.2 : (isCutaway ? intensity * 1.5 : 0.8);
        mat.roughness = isNight ? 0.25 : 0.45;
      }
    });

    applyClippingToGroup(electronicsGroup);
  }

  function updateParts(parts: LampPart[], params: LampParameters) {
    activeParams = params;

    // Remove old part meshes
    partMeshes.forEach((mesh) => {
      scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    });
    partMeshes.clear();

    const lColor = new THREE.Color(params.lightColor);

    // Create new meshes
    parts.forEach((p) => {
      const geo = partToThreeGeometry(p);
      let mat: THREE.MeshStandardMaterial;

      if (p.id === 'veins') {
        mat = new THREE.MeshStandardMaterial({
          color: lColor.clone().lerp(new THREE.Color('#ffffff'), 0.25),
          emissive: lColor,
          emissiveIntensity: params.lightIntensity * 2.2,
          roughness: 0.3,
          metalness: 0.05,
          side: THREE.DoubleSide,
          polygonOffset: true,
          polygonOffsetFactor: -1.0,
          polygonOffsetUnits: -1.0,
        });
      } else {
        mat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(p.color),
          roughness: 0.45,
          metalness: 0.08,
          side: THREE.DoubleSide,
        });
      }

      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      partMeshes.set(p.id, mesh);
    });

    // Rebuild internal LED strips & electronics models
    rebuildElectronicsModels(params);

    // Position distributed lights along actual vein curves
    const rMid = (params.baseRadius + params.topRadius) * 0.45;
    veinLights.forEach((vl, idx) => {
      const th = (idx / veinLights.length) * 2 * Math.PI + 0.3;
      const zLight = (idx / veinLights.length) * params.height * 0.8 + 20;
      vl.color = lColor;
      vl.intensity = params.lightIntensity * 1.6;
      vl.position.set(rMid * Math.cos(th), rMid * Math.sin(th), zLight);
    });

    deskGlowLight.color = lColor;
    deskGlowLight.intensity = params.lightIntensity * 1.6;

    controls.target.set(0, 0, params.height * 0.45);
    applyViewStyle();
  }

  function setViewMode(mode: ViewMode) {
    currentMode = mode;
    applyViewStyle();
  }

  function setCutawayPlane(progress: number) {
    const maxRadius = (activeParams?.baseRadius ?? 50) + 12;
    const xPos = maxRadius * (1 - 2 * progress);
    clipPlane.constant = xPos;
  }

  function setLightColor(hex: string, intensity: number) {
    if (activeParams) {
      activeParams.lightColor = hex;
      activeParams.lightIntensity = intensity;
    }
    const color = new THREE.Color(hex);

    veinLights.forEach((vl) => {
      vl.color = color;
      vl.intensity = intensity * 1.6;
    });
    deskGlowLight.color = color;
    deskGlowLight.intensity = intensity * 1.6;

    const veinMesh = partMeshes.get('veins');
    if (veinMesh) {
      const mat = veinMesh.material as THREE.MeshStandardMaterial;
      mat.color = color.clone().lerp(new THREE.Color('#ffffff'), 0.25);
      mat.emissive = color;
      mat.emissiveIntensity = currentMode === 'night' ? intensity * 2.2 : (currentMode === 'cutaway' ? intensity * 1.5 : 0.8);
    }

    // Update LED dies inside strip
    electronicsGroup.traverse((obj: any) => {
      if (obj.isMesh && obj.material && obj.material.emissive) {
        obj.material.color = color;
        obj.material.emissive = color;
        obj.material.emissiveIntensity = intensity * 2.5;
      }
    });
  }

  function resetCamera() {
    const h = activeParams?.height ?? 180;
    camera.up.set(0, 0, 1);
    camera.position.set(h * 0.9, -h * 1.1, h * 0.7);
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
