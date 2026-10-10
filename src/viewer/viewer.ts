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
import { computeStripPhysicalMetrics } from '../geometry/stripPhysics';

export type ViewMode = 'night' | 'day' | 'cutaway';
export type DiffuserMode = 'ghost' | 'hidden' | 'solid';

export interface LampViewer {
  updateParts(parts: LampPart[], params: LampParameters): void;
  setViewMode(mode: ViewMode): void;
  setDiffuserMode(mode: DiffuserMode): void;
  focusRetentionDetail(): void;
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
  controls.minDistance = 30; // Allows macro close-up inspection
  controls.maxDistance = 650;
  controls.touches = {
    ONE: THREE.TOUCH.ROTATE,
    TWO: THREE.TOUCH.DOLLY_PAN,
  };

  // Clipping Plane for Cutaway Inspection Mode (cuts along X axis)
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

  // 2. Camera Headlight (pinned to camera: guarantees crisp zero-shadow illumination inside grooves and pockets)
  const cameraLight = new THREE.DirectionalLight(0xffffff, 1.8);
  cameraLight.position.set(0, 0, 1);
  camera.add(cameraLight);
  scene.add(camera);

  // 3. Glow Lighting Rig (placed physically along the light channels)
  const glowGroup = new THREE.Group();
  const deskGlowLight = new THREE.PointLight(0xff9d3b, 1.8, 180, 1.3);
  deskGlowLight.position.set(0, 0, 8);
  glowGroup.add(deskGlowLight);

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

  // 3D Inspection Blueprint Outline Helper Group
  const helperGroup = new THREE.Group();
  scene.add(helperGroup);

  // Mesh Storage & State
  const partMeshes: Map<string, THREE.Mesh> = new Map();
  let currentMode: ViewMode = 'night';
  let currentDiffuserMode: DiffuserMode = 'ghost';
  let activeParams: LampParameters | null = null;

  // Smooth camera animation tween state
  let cameraAnimation: {
    startPos: THREE.Vector3;
    endPos: THREE.Vector3;
    startTarget: THREE.Vector3;
    endTarget: THREE.Vector3;
    startTime: number;
    duration: number;
  } | null = null;

  function animateCameraTo(targetPos: THREE.Vector3, targetLookAt: THREE.Vector3, duration = 800) {
    cameraAnimation = {
      startPos: camera.position.clone(),
      endPos: targetPos.clone(),
      startTarget: controls.target.clone(),
      endTarget: targetLookAt.clone(),
      startTime: performance.now(),
      duration,
    };
  }

  let cloudFlouretteNormalMap: THREE.CanvasTexture | null = null;
  function getCloudFlouretteNormalMap(): THREE.CanvasTexture {
    if (cloudFlouretteNormalMap) return cloudFlouretteNormalMap;
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;

    const gridSize = 16;
    const cellSize = size / gridSize;

    interface FloretSeed {
      x: number;
      y: number;
      radius: number;
      amplitude: number;
    }
    const seeds: FloretSeed[] = [];
    let sRand = 42;
    const pseudoRand = () => {
      sRand = (sRand * 16807) % 2147483647;
      return (sRand - 1) / 2147483646;
    };

    for (let gy = 0; gy < gridSize; gy++) {
      for (let gx = 0; gx < gridSize; gx++) {
        const sx = (gx + 0.10 + 0.80 * pseudoRand()) * cellSize;
        const sy = (gy + 0.10 + 0.80 * pseudoRand()) * cellSize;
        // Non-uniform bud radius: coarse florets (up to 1.35x) and fine buds (down to 0.65x)
        const radius = cellSize * (0.62 + 0.50 * pseudoRand());
        const amplitude = 0.68 + 0.32 * pseudoRand();
        seeds.push({ x: sx, y: sy, radius, amplitude });
      }
    }

    const heightMap = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
      const vNorm = (y / size) * 2 * Math.PI;
      for (let x = 0; x < size; x++) {
        const uNorm = (x / size) * 2 * Math.PI;

        // 2D Domain Warping with periodic harmonics for seamless toroidal wrapping
        const warpX = 14.0 * Math.sin(3 * vNorm) + 7.0 * Math.cos(2 * uNorm);
        const warpY = 14.0 * Math.cos(3 * uNorm) + 7.0 * Math.sin(2 * vNorm);
        let wx = (x + warpX) % size;
        if (wx < 0) wx += size;
        let wy = (y + warpY) % size;
        if (wy < 0) wy += size;

        const gw = Math.floor(wx / cellSize);
        const gh = Math.floor(wy / cellSize);

        let bestDome = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const ny = (gh + dy + gridSize) % gridSize;
          for (let dx = -1; dx <= 1; dx++) {
            const nx = (gw + dx + gridSize) % gridSize;
            const seed = seeds[ny * gridSize + nx];
            let px = seed.x;
            let py = seed.y;
            if (dx === -1 && wx < cellSize) px -= size;
            if (dx === 1 && wx > size - cellSize) px += size;
            if (dy === -1 && wy < cellSize) py -= size;
            if (dy === 1 && wy > size - cellSize) py += size;

            const d = Math.hypot(wx - px, wy - py);
            const normD = Math.min(1.0, d / seed.radius);
            const dome = seed.amplitude * 0.5 * (1.0 + Math.cos(Math.PI * normD));
            if (dome > bestDome) bestDome = dome;
          }
        }

        // Macro relief patchiness across clusters (~25-30mm organic wavelength)
        const macroPatch = 0.65 + 0.35 * Math.sin(2 * uNorm + 0.6) * Math.cos(2 * vNorm - 0.4);
        const stipple = (pseudoRand() - 0.5) * 0.16;
        heightMap[y * size + x] = Math.max(0, Math.min(1, bestDome * macroPatch + stipple));
      }
    }

    for (let y = 0; y < size; y++) {
      const y0 = (y - 1 + size) % size;
      const y1 = (y + 1) % size;
      for (let x = 0; x < size; x++) {
        const x0 = (x - 1 + size) % size;
        const x1 = (x + 1) % size;

        const dhdx = (heightMap[y * size + x1] - heightMap[y * size + x0]) * 2.2;
        const dhdy = (heightMap[y1 * size + x] - heightMap[y0 * size + x]) * 2.2;

        const len = Math.hypot(dhdx, dhdy, 1.0);
        const nx = -dhdx / len;
        const ny = -dhdy / len;
        const nz = 1.0 / len;

        const idx = (y * size + x) * 4;
        data[idx] = Math.floor((nx * 0.5 + 0.5) * 255);
        data[idx + 1] = Math.floor((ny * 0.5 + 0.5) * 255);
        data[idx + 2] = Math.floor((nz * 0.5 + 0.5) * 255);
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imgData, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    cloudFlouretteNormalMap = texture;
    return texture;
  }

  function partToThreeGeometry(part: LampPart): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    const vp = part.mesh.vertProperties;
    const np = part.mesh.numProp;
    const count = vp.length / np;

    const positions = new Float32Array(count * 3);
    const uvs = new Float32Array(count * 2);
    const h = activeParams?.height ?? 180.0;

    for (let i = 0; i < count; i++) {
      const x = vp[i * np];
      const y = vp[i * np + 1];
      const z = vp[i * np + 2];
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      const angle = Math.atan2(y, x);
      uvs[i * 2] = (angle / (2 * Math.PI)) + 0.5;
      uvs[i * 2 + 1] = z / h;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(new THREE.BufferAttribute(part.mesh.triVerts, 1));
    geo.computeVertexNormals();
    return toCreasedNormals(geo, (50 * Math.PI) / 180);
  }

  // Build physical WS2812B strips & 5050 LEDs seated securely in the 10.8mm captive C-channel
  function rebuildElectronicsModels(params: LampParameters) {
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
      veinCount,
      diffuserThickness,
      lightColor,
      lightIntensity,
    } = params;

    const getRNom = (u: number): number => {
      return (1 - u) * baseRadius + u * topRadius + 4 * u * (1 - u) * ((waistRatio - 1) * (baseRadius + topRadius) * 0.5);
    };

    const lColor = new THREE.Color(lightColor);
    const stripTapeMat = new THREE.MeshStandardMaterial({
      color: 0xf4f4f5, // White flex PCB substrate
      roughness: 0.35,
      metalness: 0.15,
      side: THREE.DoubleSide,
    });
    const ledBodyMat = new THREE.MeshStandardMaterial({
      color: 0x18181b, // 5050 package matte black plastic
      roughness: 0.5,
      metalness: 0.1,
    });
    const ledDieMat = new THREE.MeshStandardMaterial({
      color: lColor,
      emissive: lColor,
      emissiveIntensity: lightIntensity * 2.8,
      roughness: 0.2,
    });

    // 5050 LED package: 5.0mm wide, 1.4mm tall (radial), 5.0mm long
    const ledBoxGeo = new THREE.BoxGeometry(4.8, 1.4, 4.8);
    const dieBoxGeo = new THREE.BoxGeometry(2.6, 0.4, 2.6);

    // Build strip segments based on archetype
    if (params.lampArchetype === 'clouds') {
      const nFacets = params.cloudColumnFacets ?? 3;
      const colRadius = nFacets === 3 ? 18.0 : 16.0;
      const colH = height - 10.0;
      const facetAngleStep = (2 * Math.PI) / nFacets;
      const apothem = colRadius * Math.cos(facetAngleStep / 2);

      for (let f = 0; f < nFacets; f++) {
        const thFacet = f * facetAngleStep + facetAngleStep / 2;
        const stripW = 10.0;
        const stripH = colH - 12.0;

        // Plane strip facing outwards
        const stripGeo = new THREE.PlaneGeometry(stripW, stripH);
        const stripMesh = new THREE.Mesh(stripGeo, stripTapeMat);
        stripMesh.position.set(
          (apothem + 0.15) * Math.cos(thFacet),
          (apothem + 0.15) * Math.sin(thFacet),
          colH / 2 + 2.0
        );
        stripMesh.rotation.z = thFacet - Math.PI / 2;
        stripMesh.rotation.x = Math.PI / 2;
        electronicsGroup.add(stripMesh);

        // Place LEDs at 16.6667mm pitch
        const nLeds = Math.max(1, Math.floor((colH - 16) / 16.67));
        for (let i = 0; i < nLeds; i++) {
          const zLed = 10.0 + i * 16.67;
          const ledMesh = new THREE.Mesh(ledBoxGeo, ledBodyMat);
          ledMesh.position.set(
            (apothem + 0.85) * Math.cos(thFacet),
            (apothem + 0.85) * Math.sin(thFacet),
            zLed
          );
          ledMesh.rotation.z = thFacet - Math.PI / 2;
          electronicsGroup.add(ledMesh);

          const dieMesh = new THREE.Mesh(dieBoxGeo, ledDieMat);
          dieMesh.position.set(
            (apothem + 1.55) * Math.cos(thFacet),
            (apothem + 1.55) * Math.sin(thFacet),
            zLed
          );
          dieMesh.rotation.z = thFacet - Math.PI / 2;
          electronicsGroup.add(dieMesh);
        }
      }
    } else {
      const noise = createNoise3D(params.organicSeed ?? 42);
      // Build strip segments for each vein along the 10.8mm captive channel bed
      const nSegments = 100;
      for (let v = 0; v < veinCount; v++) {
        const stripVerts: number[] = [];
        const stripIndices: number[] = [];

      for (let s = 0; s <= nSegments; s++) {
        const u = s / nSegments;
        const z = u * height;
        const rNom = getRNom(u);
        const rLip = (rNom - diffuserThickness) - 1.5;
        const rSlotTop = rLip - 1.0;
        const rBed = rSlotTop - 2.0; // 2.0mm deep pocket under retaining lips
        const rTrack = rBed + 0.15; // 0.15mm off channel bed floor for tape thickness

        const thStrip = evalStripAngle(v, veinCount, u, params);
        const [cx, cy] = evalOrganicCenter(u, params, noise);

        // 10.0mm wide WS2812B strip = 5.0mm half-width
        const dThHalf = 5.0 / Math.max(16, rTrack);

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

      // Place discrete 5050 LED chips strictly at 16.6667mm physical pitch
      const stripPhys = computeStripPhysicalMetrics(params);
      stripPhys.ledPositions.forEach((led) => {
        const u = led.u;
        const z = led.z;
        const [cx, cy] = evalOrganicCenter(u, params, noise);
        const thStrip = evalStripAngle(v, veinCount, u, params);
        const rTrack = led.r;

        // Seated on the strip tape: package center is at rTrack + 0.7
        const rPackageCenter = rTrack + 0.75;
        const ledMesh = new THREE.Mesh(ledBoxGeo, ledBodyMat);
        ledMesh.position.set(
          cx + rPackageCenter * Math.cos(thStrip),
          cy + rPackageCenter * Math.sin(thStrip),
          z
        );
        ledMesh.rotation.z = thStrip - Math.PI / 2;
        electronicsGroup.add(ledMesh);

        // Glowing LED die on outward face
        const rDieCenter = rTrack + 1.45;
        const dieMesh = new THREE.Mesh(dieBoxGeo, ledDieMat);
        dieMesh.position.set(
          cx + rDieCenter * Math.cos(thStrip),
          cy + rDieCenter * Math.sin(thStrip),
          z
        );
        dieMesh.rotation.z = thStrip - Math.PI / 2;
        electronicsGroup.add(dieMesh);
      });
    }
  }

  // Model ESP32-C6 SuperMini board nestled in dedicated compliant base cradle pocket
    const baseOuterR = baseRadius + 4.0;
    const boardGroup = new THREE.Group();
    boardGroup.position.set(baseOuterR - 16.75, 0, -11.6);

    const pcbGeo = new THREE.BoxGeometry(22.5, 18.0, 1.2);
    const pcbMat = new THREE.MeshStandardMaterial({ color: 0x081a30, roughness: 0.4 });
    const pcb = new THREE.Mesh(pcbGeo, pcbMat);
    boardGroup.add(pcb);

    const shieldGeo = new THREE.BoxGeometry(11.0, 13.0, 2.2);
    const shieldMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.85, roughness: 0.25 });
    const shield = new THREE.Mesh(shieldGeo, shieldMat);
    shield.position.set(-3.0, 0, 1.7);
    boardGroup.add(shield);

    const usbGeo = new THREE.BoxGeometry(7.5, 9.0, 3.2);
    const usbMat = new THREE.MeshStandardMaterial({ color: 0xd4d4d8, metalness: 0.9, roughness: 0.2 });
    const usb = new THREE.Mesh(usbGeo, usbMat);
    usb.position.set(10.5, 0, 2.2);
    boardGroup.add(usb);

    // Gold header pin rows along left and right PCB edges
    const pinGeo = new THREE.BoxGeometry(16.0, 1.4, 1.8);
    const pinMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.85, roughness: 0.2 });
    const pinRowL = new THREE.Mesh(pinGeo, pinMat);
    pinRowL.position.set(-1.0, 7.2, 1.3);
    boardGroup.add(pinRowL);

    const pinRowR = new THREE.Mesh(pinGeo, pinMat);
    pinRowR.position.set(-1.0, -7.2, 1.3);
    boardGroup.add(pinRowR);

    electronicsGroup.add(boardGroup);

    // 3D Physical Wiring Harness: 3-conductor colored wire ribbons (Red +5V, Black GND, Green DATA)
    // Connecting each of the 3 strip funnels through the floor raceways directly into the ESP32 pin headers
    const redWireMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.35 });
    const blackWireMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.4 });
    const greenWireMat = new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.35 });

    const wireMaterials = [redWireMat, blackWireMat, greenWireMat];
    const wireOffsets = [-0.65, 0, 0.65];

    const bx = baseOuterR - 16.75;
    const bz = -10.4;

    if (params.lampArchetype === 'clouds') {
      // Connect wires from center column socket to ESP32 board
      for (let w = 0; w < 3; w++) {
        const off = wireOffsets[w];
        const p0 = new THREE.Vector3(0, off, -2.5);
        const p1 = new THREE.Vector3(8.0, off * 0.8, -11.4);
        const p2 = new THREE.Vector3(18.0, off * 0.5, -11.4);
        const p3 = new THREE.Vector3(bx - 6.0, off * 0.5, bz);
        const curve = new THREE.CatmullRomCurve3([p0, p1, p2, p3]);
        const wireGeo = new THREE.TubeGeometry(curve, 24, 0.35, 8, false);
        const wireMesh = new THREE.Mesh(wireGeo, wireMaterials[w]);
        electronicsGroup.add(wireMesh);
      }
    } else {
      const noise = createNoise3D(params.organicSeed ?? 42);
      const rSlotTop0 = (baseRadius - diffuserThickness) - 1.5 - 1.0;
      const rTrack0 = (rSlotTop0 - 2.0) + 0.15;

      for (let v = 0; v < veinCount; v++) {
        const th0 = evalStripAngle(v, veinCount, 0, params);
        const [fcx, fcy] = evalOrganicCenter(0, params, noise);
        const startX = fcx + rTrack0 * Math.cos(th0);
        const startY = fcy + rTrack0 * Math.sin(th0);

        // Target pin header connection point on ESP32 board for this vein
        let targetX = bx - 6.0;
        let targetY = 0;
        if (v === 0) {
          targetY = 6.8; // +Y header row
        } else if (v === 2) {
          targetY = -6.8; // -Y header row
        } else {
          targetX = bx - 10.5; // Rear center notch
          targetY = 0;
        }

        // Generate 3 parallel individual conductor tubes per vein
        for (let w = 0; w < 3; w++) {
          const off = wireOffsets[w];
          // Perpendicular lateral normal in XY
          const nx = -Math.sin(th0) * off;
          const ny = Math.cos(th0) * off;

          const p0 = new THREE.Vector3(startX + nx, startY + ny, 0.2);
          // Drops through flared funnel mouth at Z=0 down to Z=-5.0mm
          const p1 = new THREE.Vector3(
            fcx + (rTrack0 - 3.5) * Math.cos(th0) + nx,
            fcy + (rTrack0 - 3.5) * Math.sin(th0) + ny,
            -5.0
          );
          // Follows the floor raceway at Z=-11.4mm
          const p2 = new THREE.Vector3(
            20.0 * Math.cos(th0) + nx * 0.7,
            20.0 * Math.sin(th0) + ny * 0.7,
            -11.4
          );
          // Merges into central wiring hub basin
          const p3 = new THREE.Vector3(
            7.0 * Math.cos(th0),
            7.0 * Math.sin(th0),
            -11.4
          );
          // Routes through forward conduit trunk toward board
          const p4 = new THREE.Vector3(
            16.0,
            targetY * 0.45,
            -11.4
          );
          // Plugs securely into ESP32 board header pin
          const p5 = new THREE.Vector3(
            targetX,
            targetY + off * 0.5,
            bz
          );

          const curve = new THREE.CatmullRomCurve3([p0, p1, p2, p3, p4, p5]);
          const wireGeo = new THREE.TubeGeometry(curve, 36, 0.32, 8, false);
          const wireMesh = new THREE.Mesh(wireGeo, wireMaterials[w]);
          electronicsGroup.add(wireMesh);
        }
      }
    }

    applyClippingToGroup(electronicsGroup);
    rebuildRetentionHelper(params);
  }

  // Build 3D cross-section outline helper at the cut plane X=0
  function rebuildRetentionHelper(params: LampParameters) {
    while (helperGroup.children.length > 0) {
      const child = helperGroup.children[0] as any;
      helperGroup.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    }

    const h = params.height;
    // Find the vein and elevation u where a channel intersects the cut plane X=0 on the +Y side (mid-height)
    let bestU = 0.478;
    let minDiff = 999;
    for (let v = 0; v < params.veinCount; v++) {
      for (let s = 20; s <= 80; s++) {
        const u = s / 100;
        const th = evalStripAngle(v, params.veinCount, u, params);
        const x = Math.cos(th);
        const y = Math.sin(th);
        if (y > 0 && Math.abs(x) < minDiff) {
          minDiff = Math.abs(x);
          bestU = u;
        }
      }
    }

    const zMid = bestU * h;
    const rNom = (1 - bestU) * params.baseRadius + bestU * params.topRadius +
      4 * bestU * (1 - bestU) * ((params.waistRatio - 1) * (params.baseRadius + params.topRadius) * 0.5);
    const rFront = rNom - params.diffuserThickness + 0.15;
    const rLip = (rNom - params.diffuserThickness) - 1.5;
    const rSlotTop = rLip - 1.0;
    const rBed = rSlotTop - 2.0; // 2.0mm deep pocket under retaining lips

    const wFrontHalf = 5.2;
    const wLipHalf = 3.8; // 7.6mm aperture
    const wSlotHalf = 5.8; // 11.6mm wide bed (+0.8mm clearance per side)

    // Glowing cyan line outline of the C-channel profile
    const contourPoints = [
      new THREE.Vector3(0, rFront, zMid - wFrontHalf),
      new THREE.Vector3(0, rFront, zMid + wFrontHalf),
      new THREE.Vector3(0, rLip, zMid + wLipHalf),
      new THREE.Vector3(0, rSlotTop, zMid + wSlotHalf),
      new THREE.Vector3(0, rBed, zMid + wSlotHalf),
      new THREE.Vector3(0, rBed, zMid - wSlotHalf),
      new THREE.Vector3(0, rSlotTop, zMid - wSlotHalf),
      new THREE.Vector3(0, rLip, zMid - wLipHalf),
      new THREE.Vector3(0, rFront, zMid - wFrontHalf),
    ];

    const contourGeo = new THREE.BufferGeometry().setFromPoints(contourPoints);
    const contourMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      linewidth: 3,
      depthTest: false,
    });
    const contourLine = new THREE.Line(contourGeo, contourMat);
    contourLine.renderOrder = 999;
    helperGroup.add(contourLine);

    // White outline of the seated 10mm flex strip (0.35mm thickness seated at rBed + 0.15)
    const stripPoints = [
      new THREE.Vector3(0, rBed + 0.15, zMid - 5.0),
      new THREE.Vector3(0, rBed + 0.15, zMid + 5.0),
      new THREE.Vector3(0, rBed + 0.50, zMid + 5.0),
      new THREE.Vector3(0, rBed + 0.50, zMid - 5.0),
      new THREE.Vector3(0, rBed + 0.15, zMid - 5.0),
    ];
    const stripGeo = new THREE.BufferGeometry().setFromPoints(stripPoints);
    const stripMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      linewidth: 2,
      depthTest: false,
    });
    const stripLine = new THREE.Line(stripGeo, stripMat);
    stripLine.renderOrder = 999;
    helperGroup.add(stripLine);

    helperGroup.visible = false;
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
    cameraLight.intensity = isCutaway ? 2.4 : 0.9;

    renderer.clippingPlanes = isCutaway ? [clipPlane] : [];

    const lColor = new THREE.Color(activeParams?.lightColor ?? '#ff9d3b');
    const intensity = activeParams?.lightIntensity ?? 1.2;

    partMeshes.forEach((mesh, id) => {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.clippingPlanes = isCutaway ? [clipPlane] : [];
      mat.clipShadows = true;
      mat.normalMap = null;

      if (activeParams?.lampArchetype === 'clouds') {
        if (id === 'body') {
          // Cloud shade with broccoli flourette micro-texture
          const normalTex = getCloudFlouretteNormalMap();
          const h = activeParams?.height ?? 180.0;
          const rMean = (((activeParams?.baseRadius ?? 44) + (activeParams?.topRadius ?? 38)) / 2) + 5.0;
          const circ = 2 * Math.PI * rMean;
          const beadSizeMm = 1.85; // 1.85mm flourette bud diameter
          const tileSizeMm = 16 * beadSizeMm; // 16 beads per texture tile = ~29.6mm

          const vRepeat = h / tileSizeMm;
          const uRepeat = circ / tileSizeMm;
          normalTex.repeat.set(uRepeat, vRepeat);

          const microTooth = activeParams?.cloudTurbulence ?? 0.35;
          const normalStrength = Math.max(0.0, Math.min(1.8, microTooth * 2.2));
          mat.normalMap = normalStrength > 0.01 ? normalTex : null;
          mat.normalScale.set(normalStrength, normalStrength);
          if (isCutaway) {
            mesh.visible = currentDiffuserMode !== 'hidden';
            mat.transparent = currentDiffuserMode === 'ghost';
            mat.opacity = currentDiffuserMode === 'ghost' ? 0.35 : 1.0;
            mat.depthWrite = currentDiffuserMode !== 'ghost';
            mat.color = new THREE.Color('#ffffff');
            mat.emissive = lColor;
            mat.emissiveIntensity = 0.45;
          } else {
            mesh.visible = true;
            mat.transparent = false;
            mat.opacity = 1.0;
            mat.depthWrite = true;
            mat.color = new THREE.Color('#ffffff');
            mat.emissive = isNight ? lColor : new THREE.Color(0x000000);
            mat.emissiveIntensity = isNight ? intensity * 0.75 : 0.0;
            mat.roughness = 0.70; // Matte, powdery velvety finish
            mat.metalness = 0.0;
          }
          mat.needsUpdate = true;
        } else if (id === 'veins') {
          mat.normalMap = null;
          // Central LED Column Spine
          mesh.visible = true;
          mat.transparent = false;
          mat.opacity = 1.0;
          mat.color = new THREE.Color(0x242830);
          mat.emissive = new THREE.Color(0x000000);
          mat.emissiveIntensity = 0;
          mat.roughness = 0.5;
          mat.needsUpdate = true;
        }
      } else {
        if (id === 'veins') {
          if (isCutaway) {
            if (currentDiffuserMode === 'hidden') {
              mesh.visible = false;
            } else if (currentDiffuserMode === 'ghost') {
              mesh.visible = true;
              mat.transparent = true;
              mat.opacity = 0.35;
              mat.roughness = 0.15;
              mat.depthWrite = false;
              mat.color = lColor.clone().lerp(new THREE.Color('#ffffff'), 0.3);
              mat.emissive = lColor;
              mat.emissiveIntensity = 0.8;
            } else {
              // solid
              mesh.visible = true;
              mat.transparent = false;
              mat.opacity = 1.0;
              mat.depthWrite = true;
              mat.color = lColor.clone().lerp(new THREE.Color('#ffffff'), 0.25);
              mat.emissive = lColor;
              mat.emissiveIntensity = 1.5;
            }
          } else {
            mesh.visible = true;
            mat.transparent = false;
            mat.opacity = 1.0;
            mat.depthWrite = true;
            mat.color = lColor.clone().lerp(new THREE.Color('#ffffff'), 0.25);
            mat.emissive = lColor;
            mat.emissiveIntensity = isNight ? intensity * 2.2 : 0.8;
            mat.roughness = isNight ? 0.25 : 0.45;
          }
          mat.needsUpdate = true;
        }
      }
    });

    applyClippingToGroup(electronicsGroup);
  }

  function updateParts(parts: LampPart[], params: LampParameters) {
    activeParams = params;

    partMeshes.forEach((mesh) => {
      scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    });
    partMeshes.clear();

    const lColor = new THREE.Color(params.lightColor);

    parts.forEach((p) => {
      const geo = partToThreeGeometry(p);
      let mat: THREE.MeshStandardMaterial;

      if (params.lampArchetype === 'clouds') {
        if (p.id === 'body') {
          mat = new THREE.MeshStandardMaterial({
            color: new THREE.Color('#ffffff'),
            roughness: 0.70,
            metalness: 0.0,
            side: THREE.DoubleSide,
          });
        } else if (p.id === 'veins') {
          mat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(0x242830),
            roughness: 0.5,
            metalness: 0.1,
            side: THREE.DoubleSide,
          });
        } else {
          mat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(p.color),
            roughness: 0.45,
            metalness: 0.08,
            side: THREE.DoubleSide,
          });
        }
      } else {
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
      }

      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      partMeshes.set(p.id, mesh);
    });

    rebuildElectronicsModels(params);

    if (params.lampArchetype === 'clouds') {
      veinLights.forEach((vl, idx) => {
        const zLight = (idx / veinLights.length) * (params.height - 24) + 18;
        vl.color = lColor;
        vl.intensity = params.lightIntensity * 2.2;
        vl.position.set(0, 0, zLight);
      });
    } else {
      const rMid = (params.baseRadius + params.topRadius) * 0.45;
      veinLights.forEach((vl, idx) => {
        const th = (idx / veinLights.length) * 2 * Math.PI + 0.3;
        const zLight = (idx / veinLights.length) * params.height * 0.8 + 20;
        vl.color = lColor;
        vl.intensity = params.lightIntensity * 1.6;
        vl.position.set(rMid * Math.cos(th), rMid * Math.sin(th), zLight);
      });
    }

    deskGlowLight.color = lColor;
    deskGlowLight.intensity = params.lightIntensity * 1.6;

    controls.target.set(0, 0, params.height * 0.45);
    applyViewStyle();
  }

  function setViewMode(mode: ViewMode) {
    currentMode = mode;
    if (mode !== 'cutaway') {
      helperGroup.visible = false;
    }
    applyViewStyle();
  }

  function setDiffuserMode(mode: DiffuserMode) {
    currentDiffuserMode = mode;
    applyViewStyle();
  }

  function focusRetentionDetail() {
    currentMode = 'cutaway';
    currentDiffuserMode = 'ghost';
    clipPlane.constant = 0;

    applyViewStyle();
    helperGroup.visible = true;

    if (activeParams) {
      const h = activeParams.height;
      let bestU = 0.478;
      let minDiff = 999;
      for (let v = 0; v < activeParams.veinCount; v++) {
        for (let s = 20; s <= 80; s++) {
          const u = s / 100;
          const th = evalStripAngle(v, activeParams.veinCount, u, activeParams);
          const x = Math.cos(th);
          const y = Math.sin(th);
          if (y > 0 && Math.abs(x) < minDiff) {
            minDiff = Math.abs(x);
            bestU = u;
          }
        }
      }

      const zMid = bestU * h;
      const rNom = (1 - bestU) * activeParams.baseRadius + bestU * activeParams.topRadius +
        4 * bestU * (1 - bestU) * ((activeParams.waistRatio - 1) * (activeParams.baseRadius + activeParams.topRadius) * 0.5);
      const rLip = (rNom - activeParams.diffuserThickness) - 1.5;
      const rSlotTop = rLip - 1.0;
      const rBed = rSlotTop - 2.0; // 2.0mm deep pocket under retaining lips

      // Target directly on C-channel cross-section at the cut plane X=0
      const target = new THREE.Vector3(0, rBed + 1.5, zMid);
      // Camera positioned directly on -X side facing the exposed cut face, slightly elevated
      const camPos = new THREE.Vector3(-45, rBed - 1.0, zMid + 6.0);
      animateCameraTo(camPos, target, 800);
    }
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

    electronicsGroup.traverse((obj: any) => {
      if (obj.isMesh && obj.material && obj.material.emissive) {
        obj.material.color = color;
        obj.material.emissive = color;
        obj.material.emissiveIntensity = intensity * 2.5;
      }
    });
  }

  function resetCamera() {
    helperGroup.visible = false;
    const h = activeParams?.height ?? 180;
    const endPos = new THREE.Vector3(h * 0.9, -h * 1.1, h * 0.7);
    const endTarget = new THREE.Vector3(0, 0, h * 0.45);
    animateCameraTo(endPos, endTarget, 650);
  }

  // Animation loop with smooth camera easing
  let reqId = 0;
  function animate() {
    reqId = requestAnimationFrame(animate);

    if (cameraAnimation) {
      const elapsed = performance.now() - cameraAnimation.startTime;
      const t = Math.min(1, elapsed / cameraAnimation.duration);
      // Smooth cubic ease-in-out
      const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      camera.position.lerpVectors(cameraAnimation.startPos, cameraAnimation.endPos, ease);
      controls.target.lerpVectors(cameraAnimation.startTarget, cameraAnimation.endTarget, ease);
      controls.update();
      if (t >= 1) cameraAnimation = null;
    } else {
      controls.update();
    }

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
    setDiffuserMode,
    focusRetentionDetail,
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
