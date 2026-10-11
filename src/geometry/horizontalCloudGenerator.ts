import type { LampParameters, LampPart, MeshData } from '../types';
import { createNoise3D } from './organicField';

export interface HorizontalCloudPuff {
  level: number;
  bankId: number;
  x: number;
  y: number;
  z: number;
  amp: number;
  rX: number;
  rY: number;
  rZ: number;
  haloWeight: number;
}

/**
 * Smooth union (smax) of two analytical radial distances.
 */
function smax(a: number, b: number, k = 8.0): number {
  const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (a - b)) / k));
  return (1 - h) * b + h * a + k * h * (1 - h);
}

/**
 * Generates horizontal cumulus puff formations for a panoramic landscape cloud bank.
 */
export function generateHorizontalCloudPuffs(
  seed = 77,
  width = 220,
  depth = 85,
  height = 105,
  puffDepth = 14.0,
  floretScale = 2.4
): HorizontalCloudPuff[] {
  let s = Math.abs(seed) % 2147483647;
  if (s === 0) s = 1;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };

  const puffs: HorizontalCloudPuff[] = [];
  const ampScale = puffDepth / 12.0;

  // 4 Grand Horizontal Formations ("Mother Banks") distributed along X
  const bankXOffsets = [-0.30, -0.07, 0.16, 0.35];
  const bankZOffsets = [0.45, 0.65, 0.54, 0.40];
  const bankRadii = [30.0, 38.0, 34.0, 28.0];

  for (let b = 0; b < bankXOffsets.length; b++) {
    const xBase = bankXOffsets[b] * width;
    const zBase = bankZOffsets[b] * height;
    const rCirc = bankRadii[b];

    puffs.push({
      level: 0,
      bankId: b,
      x: xBase,
      y: 0,
      z: zBase,
      amp: 18.0 * ampScale,
      rX: rCirc * 1.1,
      rY: depth * 0.40,
      rZ: rCirc * 0.85,
      haloWeight: 1.0,
    });

    // Front-facing convective lobes
    for (let j = 0; j < 3; j++) {
      const zFrac = (j - 1) * 0.22;
      puffs.push({
        level: 1,
        bankId: b,
        x: xBase + (j === 1 ? 0 : (j === 0 ? -12 : 12)),
        y: depth * 0.28,
        z: Math.max(16.0, zBase + zFrac * height),
        amp: 14.0 * ampScale,
        rX: rCirc * 0.65,
        rY: depth * 0.24,
        rZ: rCirc * 0.60,
        haloWeight: 0.85,
      });
    }
  }

  return puffs;
}

/**
 * Tower definition for cumulus skyline.
 */
interface CumulusTower {
  x: number;
  topZ: number;
  rX: number;
  rY: number;
  id: number;
}

interface FrontLobe {
  x: number;
  z: number;
  y: number;
  rX: number;
  rZ: number;
  rY: number;
}

/**
 * Evaluates the 3D surface position and lithophane wall thickness for the horizontal cloud bank.
 */
export function evalHorizontalCloudField(
  u: number, // 0 at base (Z=0), 1 at crown (Z=height)
  th: number, // 0 to 2*PI perimeter polar angle
  params: LampParameters,
  _puffs: HorizontalCloudPuff[],
  noise: (x: number, y: number, z: number) => number
): { xOuter: number; yOuter: number; xInner: number; yInner: number; z: number; thickness: number; maxRimHalo: number } {
  const width = params.horizonWidth ?? 220;
  const depth = params.horizonDepth ?? 85;
  const height = params.horizonHeight ?? 105;
  const puffDepth = params.cloudPuffDepth ?? 14.0;
  const floretScale = params.cloudFloretScale ?? 2.6;
  const ampScale = puffDepth / 12.0;

  const cosTh = Math.cos(th);
  const sinTh = Math.sin(th);
  const z = u * height;

  // Base collar: matches exact plinth pocket stadium/ellipse
  const aCollar = width * 0.46; // e.g. 101.2 mm
  const bCollar = depth * 0.46; // e.g. 39.1 mm
  const denomCollar = Math.sqrt((bCollar * cosTh) * (bCollar * cosTh) + (aCollar * sinTh) * (aCollar * sinTh));
  const rCollar = denomCollar > 0.001 ? (aCollar * bCollar) / denomCollar : bCollar;

  if (z <= 4.0) {
    // Bottom 4mm is vertical seating collar
    const xCollar = rCollar * cosTh;
    const yCollar = rCollar * sinTh;
    const rCollarInner = Math.max(1.5, rCollar - 2.0);
    return {
      xOuter: xCollar,
      yOuter: yCollar,
      xInner: rCollarInner * cosTh,
      yInner: rCollarInner * sinTh,
      z,
      thickness: 2.0,
      maxRimHalo: 0.0,
    };
  }

  // 4 Grand Cumulus Towers forming the Skyline
  const towers: CumulusTower[] = [
    { x: -0.30 * width, topZ: 0.68 * height, rX: 0.136 * width, rY: 0.33 * depth, id: 0 },
    { x: -0.07 * width, topZ: 1.00 * height, rX: 0.172 * width, rY: 0.40 * depth, id: 1 },
    { x:  0.16 * width, topZ: 0.83 * height, rX: 0.155 * width, rY: 0.35 * depth, id: 2 },
    { x:  0.35 * width, topZ: 0.60 * height, rX: 0.127 * width, rY: 0.31 * depth, id: 3 },
  ];

  let rMax = 0;
  let dominantTowerId = -1;
  let secondTowerId = -1;
  let maxTowerVal = 0;
  let secondTowerVal = 0;

  for (const t of towers) {
    if (z >= t.topZ) continue;

    const zFrac = z / t.topZ;
    const domeScale = Math.sqrt(Math.max(0.001, 1.0 - zFrac * zFrac));
    const currRx = t.rX * (0.45 + 0.55 * domeScale);
    const currRy = t.rY * (0.45 + 0.55 * domeScale);

    const dx = -t.x;
    const A = (cosTh * cosTh) / (currRx * currRx) + (sinTh * sinTh) / (currRy * currRy);
    const B = (2 * cosTh * dx) / (currRx * currRx);
    const C = (dx * dx) / (currRx * currRx) - 1.0;
    const discr = B * B - 4 * A * C;

    if (discr > 0) {
      const rHit = (-B + Math.sqrt(discr)) / (2 * A);
      if (rHit > 0) {
        rMax = smax(rMax, rHit, 10.0);
        if (rHit > maxTowerVal) {
          secondTowerVal = maxTowerVal;
          secondTowerId = dominantTowerId;
          maxTowerVal = rHit;
          dominantTowerId = t.id;
        } else if (rHit > secondTowerVal) {
          secondTowerVal = rHit;
          secondTowerId = t.id;
        }
      }
    }
  }

  if (rMax <= 1.0) {
    rMax = 2.0;
  }

  // Front & lower convective lobes (bulging in +Y facing viewer!)
  const frontLobes: FrontLobe[] = [
    // Lower tier billows (rolling all the way down toward the base!)
    { x: -0.31 * width, z: 0.17 * height, y: 0.28 * depth, rX: 18.0, rZ: 13.0, rY: 16.0 * ampScale },
    { x: -0.17 * width, z: 0.19 * height, y: 0.33 * depth, rX: 20.0, rZ: 14.0, rY: 18.0 * ampScale },
    { x: -0.02 * width, z: 0.21 * height, y: 0.35 * depth, rX: 22.0, rZ: 15.0, rY: 20.0 * ampScale },
    { x:  0.15 * width, z: 0.19 * height, y: 0.33 * depth, rX: 20.0, rZ: 14.0, rY: 18.0 * ampScale },
    { x:  0.29 * width, z: 0.17 * height, y: 0.28 * depth, rX: 18.0, rZ: 13.0, rY: 16.0 * ampScale },

    // Mid & upper frontal billows on Left Tower
    { x: -0.34 * width, z: 0.33 * height, y: 0.28 * depth, rX: 18.0, rZ: 18.0, rY: 16.0 * ampScale },
    { x: -0.25 * width, z: 0.46 * height, y: 0.33 * depth, rX: 20.0, rZ: 20.0, rY: 18.0 * ampScale },

    // Summit Tower frontal billows
    { x: -0.12 * width, z: 0.36 * height, y: 0.35 * depth, rX: 22.0, rZ: 20.0, rY: 20.0 * ampScale },
    { x: -0.04 * width, z: 0.56 * height, y: 0.40 * depth, rX: 24.0, rZ: 22.0, rY: 22.0 * ampScale },
    { x: -0.09 * width, z: 0.75 * height, y: 0.33 * depth, rX: 20.0, rZ: 18.0, rY: 18.0 * ampScale },
    { x:  0.01 * width, z: 0.81 * height, y: 0.31 * depth, rX: 18.0, rZ: 16.0, rY: 16.0 * ampScale },

    // Anvil Tower frontal billows
    { x:  0.11 * width, z: 0.40 * height, y: 0.35 * depth, rX: 22.0, rZ: 20.0, rY: 19.0 * ampScale },
    { x:  0.21 * width, z: 0.60 * height, y: 0.38 * depth, rX: 22.0, rZ: 20.0, rY: 20.0 * ampScale },
    { x:  0.15 * width, z: 0.71 * height, y: 0.31 * depth, rX: 18.0, rZ: 16.0, rY: 16.0 * ampScale },

    // Right Shoulder frontal billows
    { x:  0.32 * width, z: 0.31 * height, y: 0.28 * depth, rX: 18.0, rZ: 16.0, rY: 16.0 * ampScale },
    { x:  0.37 * width, z: 0.44 * height, y: 0.31 * depth, rX: 16.0, rZ: 16.0, rY: 15.0 * ampScale },
  ];

  let maxLobeBulge = 0;
  for (const lobe of frontLobes) {
    const dz = z - lobe.z;
    if (Math.abs(dz) >= lobe.rZ) continue;
    if (sinTh < 0.1) continue; // Front facing

    const zFrac = dz / lobe.rZ;
    const hScale = Math.sqrt(Math.max(0.001, 1.0 - zFrac * zFrac));
    const effRx = lobe.rX * hScale;
    const effRy = lobe.rY * hScale;

    const dx = -lobe.x;
    const dy = -lobe.y;
    const A = (cosTh * cosTh) / (effRx * effRx) + (sinTh * sinTh) / (effRy * effRy);
    const B = 2 * ((cosTh * dx) / (effRx * effRx) + (sinTh * dy) / (effRy * effRy));
    const C = (dx * dx) / (effRx * effRx) + (dy * dy) / (effRy * effRy) - 1.0;
    const discr = B * B - 4 * A * C;

    if (discr > 0) {
      const rHit = (-B + Math.sqrt(discr)) / (2 * A);
      if (rHit > rMax) {
        const bulge = rHit - rMax;
        if (bulge > maxLobeBulge) maxLobeBulge = bulge;
      }
    }
  }

  rMax += maxLobeBulge * 0.85;

  // Inter-tower saddle canyon detection
  const isSaddle = (maxTowerVal > 15 && secondTowerVal > 15 && dominantTowerId !== secondTowerId && (maxTowerVal - secondTowerVal) < 8.0);
  const saddleIntensity = isSaddle ? (1.0 - (maxTowerVal - secondTowerVal) / 8.0) : 0.0;

  // Broccoli floret micro-texture
  const xNom = rMax * cosTh;
  const yNom = rMax * sinTh;
  const floretWave = (
    noise(xNom * 0.08 + 12.3, yNom * 0.08 + 45.6, z * 0.08) * (floretScale * 0.70) +
    noise(xNom * 0.15 + 78.1, yNom * 0.15 + 21.4, z * 0.15) * (floretScale * 0.35)
  );

  // Smooth collar ease at bottom
  const collarEase = Math.min(1.0, (z - 4.0) / 12.0);
  const rFinal = (1.0 - collarEase) * rCollar + collarEase * (rMax + floretWave);

  // Lithophane wall thickness:
  // Canyon valleys: thin (0.8mm - 0.9mm) -> radiant glowing light corridors
  // Billow crowns: thick (5.2mm - 5.4mm) -> soft milky white diffusion
  const tMin = params.cloudMinThickness ?? 0.9;
  const tMax = params.cloudMaxThickness ?? 5.4;
  let localT = 2.4;

  const normBulge = Math.min(1.0, Math.max(0.0, (rFinal - 25.0) / 35.0));
  let tCalc = tMin + normBulge * (tMax - tMin);
  if (saddleIntensity > 0.02) {
    tCalc -= saddleIntensity * (tMax - tMin) * 0.55; // Brilliant glowing canyon!
  }
  tCalc = Math.max(tMin, Math.min(tMax, tCalc));
  localT = 2.0 + (tCalc - 2.0) * collarEase;

  const rInner = Math.max(1.5, rFinal - localT);

  return {
    xOuter: rFinal * cosTh,
    yOuter: rFinal * sinTh,
    xInner: rInner * cosTh,
    yInner: rInner * sinTh,
    z,
    thickness: localT,
    maxRimHalo: saddleIntensity,
  };
}

/**
 * Builds the watertight 2-manifold horizontal cloud shade mesh.
 */
function buildHorizontalCloudShadeMesh(
  nSlices: number,
  nPts: number,
  params: LampParameters,
  puffs: HorizontalCloudPuff[],
  noise: (x: number, y: number, z: number) => number
): MeshData {
  const verts: number[] = [];
  const tris: number[] = [];
  const height = params.horizonHeight ?? 105;
  const width = params.horizonWidth ?? 220;
  const tMin = params.cloudMinThickness ?? 0.9;

  for (let s = 0; s <= nSlices; s++) {
    // Slices span u from 0.0 to 0.995, converging smoothly to the summit peak
    const u = (s / nSlices) * 0.995;

    for (let i = 0; i < nPts; i++) {
      const th = (i / nPts) * 2 * Math.PI;
      const { xOuter, yOuter, xInner, yInner, z } = evalHorizontalCloudField(u, th, params, puffs, noise);

      verts.push(xOuter, yOuter, z);
      verts.push(xInner, yInner, z);
    }
  }

  // Triangulate quad walls
  for (let s = 0; s < nSlices; s++) {
    const s0 = s * nPts * 2;
    const s1 = (s + 1) * nPts * 2;

    for (let i = 0; i < nPts; i++) {
      const next = (i + 1) % nPts;

      // Outer wall quad
      const out_a = s0 + 2 * i;
      const out_b = s0 + 2 * next;
      const out_c = s1 + 2 * next;
      const out_d = s1 + 2 * i;
      tris.push(out_a, out_b, out_c);
      tris.push(out_a, out_c, out_d);

      // Inner wall quad
      const in_a = s0 + 2 * i + 1;
      const in_b = s0 + 2 * next + 1;
      const in_c = s1 + 2 * next + 1;
      const in_d = s1 + 2 * i + 1;
      tris.push(in_a, in_c, in_b);
      tris.push(in_a, in_d, in_c);
    }
  }

  // Base rim closure at Z = 0
  for (let i = 0; i < nPts; i++) {
    const next = (i + 1) % nPts;
    const out_curr = 2 * i;
    const out_next = 2 * next;
    const in_curr = 2 * i + 1;
    const in_next = 2 * next + 1;
    tris.push(out_curr, in_curr, in_next);
    tris.push(out_curr, in_next, out_next);
  }

  // Top Summit Apex Closure at Summit Tower Peak: (-0.07 * width, 0, height)
  const summitX = -0.07 * width;
  const apexOutIdx = verts.length / 3;
  verts.push(summitX, 0, height);

  const apexInIdx = apexOutIdx + 1;
  verts.push(summitX, 0, height - tMin);

  const topStart = nSlices * nPts * 2;
  for (let i = 0; i < nPts; i++) {
    const next = (i + 1) % nPts;
    const out_curr = topStart + 2 * i;
    const out_next = topStart + 2 * next;
    const in_curr = topStart + 2 * i + 1;
    const in_next = topStart + 2 * next + 1;

    tris.push(out_curr, out_next, apexOutIdx);
    tris.push(in_curr, apexInIdx, in_next);
  }

  return {
    vertProperties: new Float32Array(verts),
    triVerts: new Uint32Array(tris),
    numProp: 3,
  };
}

/**
 * Builds the horizontal LED Reflector Mandrel (`veins`) and Desktop Plinth (`base`) in Manifold.
 */
function buildHorizontalBaseAndReflector(wasm: any, params: LampParameters) {
  const width = params.horizonWidth ?? 220;
  const depth = params.horizonDepth ?? 85;

  const aCollar = width * 0.46;
  const bCollar = depth * 0.46;

  const plinthW = width + 14.0;
  const plinthD = depth + 14.0;
  const plinthH = 22.0;
  const cornerR = 8.0;

  // 1. Sleek rounded desktop plinth
  const boxX = wasm.Manifold.cube([plinthW, plinthD - 2 * cornerR, plinthH], true);
  const boxY = wasm.Manifold.cube([plinthW - 2 * cornerR, plinthD, plinthH], true);
  const cornerCyl = wasm.Manifold.cylinder(plinthH, cornerR, cornerR, 32, true);

  const cx = (plinthW - 2 * cornerR) / 2;
  const cy = (plinthD - 2 * cornerR) / 2;
  const cornerPositions = [
    [ cx,  cy, 0],
    [-cx,  cy, 0],
    [ cx, -cy, 0],
    [-cx, -cy, 0],
  ];

  let plinthBase = boxX.add(boxY);
  for (const pos of cornerPositions) {
    plinthBase = plinthBase.add(cornerCyl.translate(pos));
  }

  // Translate plinth so its top surface rests at Z = 0
  plinthBase = plinthBase.translate([0, 0, -plinthH / 2]);

  // Seating pocket: Ellipse matching base collar with +0.8mm clearance, 4.5mm deep
  const pocketA = aCollar + 0.8;
  const pocketB = bCollar + 0.8;
  const pocketCyl = wasm.Manifold.cylinder(6.0, 1.0, 1.0, 64, true)
    .scale([pocketA, pocketB, 1.0])
    .translate([0, 0, 0.0]); // Cuts into plinth top down to -4.5mm
  plinthBase = plinthBase.subtract(pocketCyl);

  // Central light aperture
  const lightAperture = wasm.Manifold.cube([width - 40.0, 28.0, 16.0], true)
    .translate([0, 0, -8.0]);
  plinthBase = plinthBase.subtract(lightAperture);

  // Internal ESP32-C6 electronics bay at rear (-Y)
  const espBay = wasm.Manifold.cube([52.0, 26.0, 14.0], true)
    .translate([0, -plinthD / 2 + 22.0, -plinthH / 2]);
  plinthBase = plinthBase.subtract(espBay);

  // Rear flush USB-C port
  const usbCutout = wasm.Manifold.cube([12.5, 24.0, 6.5], true)
    .translate([0, -plinthD / 2 + 6.0, -plinthH / 2]);
  plinthBase = plinthBase.subtract(usbCutout);

  // 2. Horizontal LED Reflector Mandrel (`veins`)
  const trackW = width - 44.0;
  const trackD = 24.0;
  const trackH = 12.0;

  let reflectorTrack = wasm.Manifold.cube([trackW, trackD, trackH], true)
    .translate([0, 0, -2.0 - trackH / 2]);

  // Recessed straight LED strip bed (10.6mm wide, 2.5mm deep)
  const stripBed = wasm.Manifold.cube([trackW - 6.0, 10.6, 2.5], true)
    .translate([0, 0, -2.0 - 1.25]);
  reflectorTrack = reflectorTrack.subtract(stripBed);

  return {
    plinth: plinthBase,
    reflector: reflectorTrack,
  };
}

/**
 * Main export: Generates all parts for the Horizontal Cloud Bank Lamp.
 */
export function generateHorizontalCloudLampGeometry(wasm: any, params: LampParameters): LampPart[] {
  const seed = params.organicSeed ?? 77;
  const width = params.horizonWidth ?? 220;
  const depth = params.horizonDepth ?? 85;
  const height = params.horizonHeight ?? 105;
  const puffDepth = params.cloudPuffDepth ?? 14.0;
  const floretScale = params.cloudFloretScale ?? 2.6;

  const puffs = generateHorizontalCloudPuffs(seed, width, depth, height, puffDepth, floretScale);
  const noise = createNoise3D(seed);

  const nSlices = 96;
  const nPts = 160;

  const cloudMesh = buildHorizontalCloudShadeMesh(nSlices, nPts, params, puffs, noise);

  const { plinth, reflector } = buildHorizontalBaseAndReflector(wasm, params);
  const plinthMesh = plinth.getMesh();
  const reflectorMesh = reflector.getMesh();

  return [
    {
      id: 'body',
      name: 'Horizontal Cloud Shade',
      color: '#ffffff',
      mesh: cloudMesh,
      extruder: 3,
    },
    {
      id: 'veins',
      name: 'LED Reflector Mandrel',
      color: '#1a1d24',
      mesh: {
        vertProperties: reflectorMesh.vertProperties,
        triVerts: reflectorMesh.triVerts,
        numProp: reflectorMesh.numProp ?? 3,
      },
      extruder: 1,
    },
    {
      id: 'base',
      name: 'Desktop Plinth Base',
      color: params.bodyColor || '#242830',
      mesh: {
        vertProperties: plinthMesh.vertProperties,
        triVerts: plinthMesh.triVerts,
        numProp: plinthMesh.numProp ?? 3,
      },
      extruder: 1,
    },
  ];
}
