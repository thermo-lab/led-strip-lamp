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
 * Deterministic pseudo-random number generator from seed.
 */
function createPRNG(seed = 77) {
  let s = Math.abs(Math.floor(seed)) % 2147483647;
  if (s === 0) s = 1;
  return function rand() {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * Generates hierarchical cumulus puff centers for the panoramic landscape cloud bank:
 * - 4 Grand Mother Banks (towers) anchoring the skyline
 * - 3 Convective Father Lobes per bank with upward convection draft
 * - Lower roll billows rolling smoothly down toward the base
 * - Intermediate Broccoli Child Florets clustered in saddles
 * - Rear atmospheric billows
 */
export function generateHorizontalCloudPuffs(
  seed = 77,
  width = 220,
  depth = 85,
  height = 105,
  puffDepth = 14.0,
  floretScale = 2.6
): HorizontalCloudPuff[] {
  const rand = createPRNG(seed);
  const ampScale = puffDepth / 12.0;

  const puffs: HorizontalCloudPuff[] = [];

  // Tower slots along X: jittered procedurally by seed
  const towerSlots = [
    -0.31 + (rand() - 0.5) * 0.05,
    -0.08 + (rand() - 0.5) * 0.06,
     0.15 + (rand() - 0.5) * 0.06,
     0.34 + (rand() - 0.5) * 0.05,
  ];

  // Pick summit tower (1 or 2)
  const summitIdx = rand() > 0.5 ? 1 : 2;

  towerSlots.forEach((slot, bankId) => {
    const isSummit = bankId === summitIdx;
    const xCenter = slot * width;
    const topZ = isSummit ? height * 0.98 : height * (0.64 + rand() * 0.20);
    const rX = width * (0.16 + rand() * 0.03);
    const rY = depth * (0.38 + rand() * 0.05);

    // 1. Mother Bank Summit Mound
    puffs.push({
      level: 0,
      bankId,
      x: xCenter,
      y: 0,
      z: topZ * 0.88,
      rX: rX * 0.90,
      rY: rY * 0.90,
      rZ: topZ * 0.35,
      amp: (16.0 + rand() * 3.5) * ampScale,
      haloWeight: 1.0,
    });

    // 2. Mid Mother Body
    puffs.push({
      level: 0,
      bankId,
      x: xCenter + (rand() - 0.5) * 6.0,
      y: (rand() - 0.5) * 4.0,
      z: topZ * 0.50,
      rX: rX * 1.05,
      rY: rY * 1.05,
      rZ: topZ * 0.45,
      amp: (18.0 + rand() * 3.0) * ampScale,
      haloWeight: 1.0,
    });

    // 3. Lower condensation billow rolling near the base (+Y)
    puffs.push({
      level: 1,
      bankId,
      x: xCenter + (rand() - 0.5) * 8.0,
      y: (0.32 + rand() * 0.05) * depth,
      z: height * (0.15 + rand() * 0.04),
      rX: 22.0 + rand() * 3.0,
      rY: (18.0 + rand() * 3.0) * ampScale,
      rZ: 15.0 + rand() * 2.5,
      amp: (14.5 + rand() * 3.0) * ampScale,
      haloWeight: 0.90,
    });

    // 4. Convective Father Lobes on Front Face (+Y)
    const nFront = isSummit ? 3 : 2;
    for (let j = 0; j < nFront; j++) {
      const zFrac = 0.32 + (j / (nFront - 0.2)) * 0.48;
      const lobeZ = topZ * zFrac;
      const lobeY = (0.32 + rand() * 0.06) * depth;
      const lobeX = xCenter + (rand() - 0.5) * 16.0;
      const lobeAmp = (14.0 + rand() * 4.0) * ampScale;
      const lobeRx = 22.0 + rand() * 4.0;
      const lobeRy = (19.0 + rand() * 4.0) * ampScale;
      const lobeRz = 18.0 + rand() * 3.0;

      puffs.push({
        level: 1,
        bankId,
        x: lobeX,
        y: lobeY,
        z: lobeZ,
        rX: lobeRx,
        rY: lobeRy,
        rZ: lobeRz,
        amp: lobeAmp,
        haloWeight: 0.85,
      });

      // 5. Nested Child Florets around each front lobe
      if (floretScale > 0.1) {
        for (let k = 0; k < 2; k++) {
          const angle = k * Math.PI + (rand() - 0.5) * 1.2;
          const fDist = 0.55 + rand() * 0.30;
          const fx = lobeX + Math.cos(angle) * (lobeRx * fDist * 0.8);
          const fz = lobeZ + Math.sin(angle) * (lobeRz * fDist * 0.8);
          const fy = lobeY + (rand() - 0.5) * 4.0;

          puffs.push({
            level: 2,
            bankId,
            x: fx,
            y: fy,
            z: Math.max(12.0, Math.min(height * 0.94, fz)),
            rX: 11.0 + rand() * 3.0,
            rY: 10.0 + rand() * 3.0,
            rZ: 9.5 + rand() * 2.5,
            amp: (floretScale / 2.4) * (2.8 + rand() * 1.8),
            haloWeight: 0.70,
          });
        }
      }
    }

    // 6. Rear Roll Billows (-Y)
    puffs.push({
      level: 1,
      bankId,
      x: xCenter + (rand() - 0.5) * 12.0,
      y: -(0.28 + rand() * 0.05) * depth,
      z: topZ * 0.45,
      rX: 22.0 + rand() * 4.0,
      rY: (17.0 + rand() * 3.0) * ampScale,
      rZ: 18.0 + rand() * 3.0,
      amp: (12.0 + rand() * 3.0) * ampScale,
      haloWeight: 0.80,
    });
  });

  return puffs;
}

/**
 * Evaluates the 3D surface position and lithophane wall thickness for the horizontal cloud bank.
 * Used by viewer.ts for realtime nighttime transmittance shader evaluation.
 */
export function evalHorizontalCloudField(
  u: number,
  th: number,
  params: LampParameters,
  puffs: HorizontalCloudPuff[],
  _noise: (x: number, y: number, z: number) => number
): { xOuter: number; yOuter: number; xInner: number; yInner: number; z: number; thickness: number; maxRimHalo: number } {
  const width = params.horizonWidth ?? 220;
  const depth = params.horizonDepth ?? 85;
  const height = params.horizonHeight ?? 105;
  const tMin = params.cloudMinThickness ?? 0.9;
  const tMax = params.cloudMaxThickness ?? 5.4;
  const rimLighting = (params.cloudRimLighting ?? 2.0) / 2.0;

  const aCollar = width * 0.46; // 101.2 mm
  const bCollar = depth * 0.46; // 39.1 mm
  const hNominal = height * 0.74;

  const phi = Math.max(0, Math.min(Math.PI / 2, u * (Math.PI / 2)));
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const cosTh = Math.cos(th);
  const sinTh = Math.sin(th);

  const z = hNominal * sinPhi;
  const rimEase = Math.min(1.0, Math.max(0.0, (z - 3.5) / 10.0));

  const x0 = aCollar * cosPhi * cosTh;
  const y0 = bCollar * cosPhi * sinTh;

  if (z <= 4.0) {
    return {
      xOuter: x0,
      yOuter: y0,
      xInner: (aCollar - 2.0) * cosPhi * cosTh,
      yInner: (bCollar - 2.0) * cosPhi * sinTh,
      z,
      thickness: 2.0,
      maxRimHalo: 0.0,
    };
  }

  let maxBulge = 0;
  let sumBulge = 0;
  let maxRimHalo = 0;
  const bankBulges = [0, 0, 0, 0];

  for (const puff of puffs) {
    const dx = (x0 - puff.x) / puff.rX;
    const dy = (y0 - puff.y) / puff.rY;
    const rawDz = z - puff.z;
    const effectiveRz = rawDz < 0 ? puff.rZ * 1.35 : puff.rZ * 0.90;
    const dz = rawDz / effectiveRz;
    const distSq = dx * dx + dy * dy + dz * dz;

    if (distSq < 1.0) {
      const d = Math.sqrt(distSq);
      const dome = 0.5 * (1.0 + Math.cos(Math.PI * d));
      const bulge = puff.amp * dome;

      if (bulge > maxBulge) maxBulge = bulge;
      sumBulge += bulge;

      if (puff.bankId >= 0 && puff.bankId < 4) {
        bankBulges[puff.bankId] += bulge;
      }

      const rimPeak = 0.76;
      const rimWidth = 0.18;
      const halo = Math.exp(-Math.pow(d - rimPeak, 2.0) / (2.0 * rimWidth * rimWidth)) * (puff.haloWeight || 0.8);
      if (halo > maxRimHalo) maxRimHalo = halo;
    }
  }

  const compositeBulge = maxBulge + 0.24 * Math.max(0, sumBulge - maxBulge);

  // Canyon valley seams between banks
  let b1 = 0, b2 = 0;
  for (let k = 0; k < bankBulges.length; k++) {
    const val = bankBulges[k];
    if (val > b1) { b2 = b1; b1 = val; }
    else if (val > b2) { b2 = val; }
  }
  const interBankSeam = (b1 > 1.2 && b2 > 1.2) ? Math.min(1.0, (2.0 * b2) / (b1 + b2)) : 0.0;

  const normBulge = Math.min(1.0, Math.max(0.0, compositeBulge / 16.0));
  let localT = tMin + normBulge * (tMax - tMin);

  if (interBankSeam > 0.02) {
    localT -= interBankSeam * (tMax - tMin) * 0.45 * rimLighting;
  }
  if (maxRimHalo > 0.01) {
    localT -= maxRimHalo * (tMax - tMin) * 0.16 * rimLighting;
  }
  localT = Math.max(tMin, Math.min(tMax, localT));
  const thickness = 2.0 + (localT - 2.0) * rimEase;

  return {
    xOuter: x0,
    yOuter: y0,
    xInner: x0 * (1 - thickness / 60.0),
    yInner: y0 * (1 - thickness / 60.0),
    z,
    thickness,
    maxRimHalo,
  };
}

/**
 * Builds the watertight 2-manifold organic horizontal cloud shade mesh.
 * - Parameterized along continuous ellipsoidal dome elevation (latitude phi) and azimuth (th)
 * - Zero stepping artifacts (C2 continuous cosine-bell dome profile)
 * - Zero flat shelves (continuous rounding to zenith apex)
 * - Full multi-scale cauliflower florets, fluid waves, and micro-granule tooth
 * - Lithophane walls (0.9mm to 5.4mm) with glowing inter-bank canyon corridors
 */
function buildMasterDomeCloudMesh(
  params: LampParameters,
  puffs: HorizontalCloudPuff[],
  noise: (x: number, y: number, z: number) => number,
  nLat = 100,
  nLon = 160
): MeshData {
  const width = params.horizonWidth ?? 220;
  const depth = params.horizonDepth ?? 85;
  const height = params.horizonHeight ?? 105;
  const floretScale = params.cloudFloretScale ?? 2.6;
  const microTooth = params.cloudTurbulence ?? 0.38;
  const tMin = params.cloudMinThickness ?? 0.9;
  const tMax = params.cloudMaxThickness ?? 5.4;
  const rimLighting = (params.cloudRimLighting ?? 2.0) / 2.0;

  const aCollar = width * 0.46; // 101.2 mm
  const bCollar = depth * 0.46; // 39.1 mm
  const hNominal = height * 0.74;

  const verts: number[] = [];
  const tris: number[] = [];

  for (let lat = 0; lat <= nLat; lat++) {
    const v = lat / nLat; // 0 to 1
    // Latitude angle phi: 0 at base collar, PI/2 at zenith apex
    const phi = v * (Math.PI / 2);
    const cosPhi = Math.cos(phi);
    const sinPhi = Math.sin(phi);

    const zBase = hNominal * sinPhi;
    // Collar transition ease: bottom 4.5mm is vertical skirt fitting flush in plinth pocket
    const rimEase = Math.min(1.0, Math.max(0.0, (zBase - 3.5) / 10.0));

    for (let lon = 0; lon < nLon; lon++) {
      const th = (lon / nLon) * 2 * Math.PI;
      const cosTh = Math.cos(th);
      const sinTh = Math.sin(th);

      // Base unperturbed dome coordinate:
      const x0 = aCollar * cosPhi * cosTh;
      const y0 = bCollar * cosPhi * sinTh;
      const z0 = zBase;

      // Surface normal of base ellipsoid:
      let nx = (x0 / (aCollar * aCollar));
      let ny = (y0 / (bCollar * bCollar));
      let nz = (z0 / (hNominal * hNominal + 0.001));
      const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (nLen > 0.0001) {
        nx /= nLen; ny /= nLen; nz /= nLen;
      } else {
        nx = 0; ny = 0; nz = 1;
      }

      // Smooth Domain Warping (Wind drift, wavelength ~50mm)
      const warpScale = 0.018;
      const wX = noise(x0 * warpScale + 12.3, y0 * warpScale + 34.5, z0 * warpScale) * 3.8;
      const wY = noise(x0 * warpScale + 45.6, y0 * warpScale + 78.9, z0 * warpScale) * 2.8;
      const wZ = noise(x0 * warpScale + 78.1, y0 * warpScale + 12.4, z0 * warpScale) * 2.8;

      const px = x0 + wX;
      const py = y0 + wY;
      const pz = z0 + wZ;

      // 3D Hierarchical Cosine-Bell Puff Evaluation with Anisotropic Convection Draft
      let maxBulge = 0;
      let sumBulge = 0;
      let maxRimHalo = 0;
      const bankBulges = [0, 0, 0, 0];

      for (const puff of puffs) {
        const dx = (px - puff.x) / puff.rX;
        const dy = (py - puff.y) / puff.rY;
        const rawDz = pz - puff.z;
        // Anisotropic Convection Draft:
        // Flatter condensation base below (effectiveRz * 1.35), towering billowing dome above (effectiveRz * 0.90)
        // 100% support-free FDM overhang draft (<= 36 deg from vertical)
        const effectiveRz = rawDz < 0 ? puff.rZ * 1.35 : puff.rZ * 0.90;
        const dz = rawDz / effectiveRz;
        const distSq = dx * dx + dy * dy + dz * dz;

        if (distSq < 1.0) {
          const d = Math.sqrt(distSq);
          // C2 Cosine-bell dome profile: zero slope at crest, zero slope at boundary
          const dome = 0.5 * (1.0 + Math.cos(Math.PI * d));
          const bulge = puff.amp * dome;

          if (bulge > maxBulge) maxBulge = bulge;
          sumBulge += bulge;

          if (puff.bankId >= 0 && puff.bankId < 4) {
            bankBulges[puff.bankId] += bulge;
          }

          // Luminous rim halo outlining billow curves
          const rimPeak = 0.76;
          const rimWidth = 0.18;
          const halo = Math.exp(-Math.pow(d - rimPeak, 2.0) / (2.0 * rimWidth * rimWidth)) * (puff.haloWeight || 0.8);
          if (halo > maxRimHalo) maxRimHalo = halo;
        }
      }

      // Smooth-max blend: filleted valleys with continuous curvature
      const compositeBulge = maxBulge + 0.24 * Math.max(0, sumBulge - maxBulge);

      // Fluid Wave Harmonics (wavelength 20-35mm)
      const flowScale = 0.035;
      const fluidWave = (
        noise(x0 * flowScale + 12.3, y0 * flowScale + 55.7, z0 * flowScale + 31.9) * 1.5 +
        noise(x0 * flowScale * 1.8 + 77.1, y0 * flowScale * 1.8 + 18.4, z0 * flowScale * 1.8) * 0.75
      );

      // Level 2 Intermediate Broccoli Florets (~7-10mm wavelength)
      const floretWave = floretScale > 0.1 ? (
        noise(x0 * 0.10 + 42.1, y0 * 0.10 + 88.3, z0 * 0.10 + 17.5) * (floretScale * 0.60) +
        noise(x0 * 0.16 + 14.7, y0 * 0.16 + 33.2, z0 * 0.16 + 91.1) * (floretScale * 0.30)
      ) : 0;

      // Level 3 Physical Micro-Granule Floret Tooth (~3.5-5.5mm wavelength)
      const microWave = microTooth > 0.05 ? (
        noise(x0 * 0.26 + 61.3, y0 * 0.26 + 19.8, z0 * 0.26 + 84.2) * (microTooth * 0.95) +
        noise(x0 * 0.40 + 12.7, y0 * 0.40 + 93.1, z0 * 0.40 + 47.6) * (microTooth * 0.55)
      ) : 0;

      const totalDisplacement = (compositeBulge + fluidWave + floretWave + microWave) * rimEase;

      // Outer surface position
      const xOuter = x0 + nx * totalDisplacement;
      const yOuter = y0 + ny * totalDisplacement;
      const zOuter = Math.max(0, z0 + nz * totalDisplacement);

      // Master Cloud Shading - "Lost & Found" Canyon Seams
      let b1 = 0, b2 = 0;
      for (let k = 0; k < bankBulges.length; k++) {
        const val = bankBulges[k];
        if (val > b1) { b2 = b1; b1 = val; }
        else if (val > b2) { b2 = val; }
      }
      const interBankSeam = (b1 > 1.2 && b2 > 1.2) ? Math.min(1.0, (2.0 * b2) / (b1 + b2)) : 0.0;

      // Lithophane thickness:
      // Crests: thicker (milky white diffuse cloud mass)
      // Valleys & Seams: thinner (0.9mm radiant glowing light corridors!)
      const normBulge = Math.min(1.0, Math.max(0.0, compositeBulge / 16.0));
      let localT = tMin + normBulge * (tMax - tMin);

      // Thin the canyons between major cloud formations for brilliant light diffusion
      if (interBankSeam > 0.02) {
        localT -= interBankSeam * (tMax - tMin) * 0.45 * rimLighting;
      }
      if (maxRimHalo > 0.01) {
        localT -= maxRimHalo * (tMax - tMin) * 0.16 * rimLighting;
      }
      localT = Math.max(tMin, Math.min(tMax, localT));
      const thickness = 2.0 + (localT - 2.0) * rimEase;

      // Inner surface position
      const inDisplacement = totalDisplacement - thickness;
      const xInner = x0 + nx * inDisplacement;
      const yInner = y0 + ny * inDisplacement;
      const zInner = Math.max(0, z0 + nz * inDisplacement);

      verts.push(xOuter, yOuter, zOuter);
      verts.push(xInner, yInner, zInner);
    }
  }

  // Triangulate grid quads
  for (let lat = 0; lat < nLat; lat++) {
    const r0 = lat * nLon * 2;
    const r1 = (lat + 1) * nLon * 2;

    for (let lon = 0; lon < nLon; lon++) {
      const next = (lon + 1) % nLon;

      // Outer wall quad (outward CCW)
      const out_a = r0 + 2 * lon;
      const out_b = r0 + 2 * next;
      const out_c = r1 + 2 * next;
      const out_d = r1 + 2 * lon;
      tris.push(out_a, out_b, out_c);
      tris.push(out_a, out_c, out_d);

      // Inner wall quad (inward CCW)
      const in_a = r0 + 2 * lon + 1;
      const in_b = r0 + 2 * next + 1;
      const in_c = r1 + 2 * next + 1;
      const in_d = r1 + 2 * lon + 1;
      tris.push(in_a, in_c, in_b);
      tris.push(in_a, in_d, in_c);
    }
  }

  // Base rim closure at lat = 0 (Z = 0)
  for (let lon = 0; lon < nLon; lon++) {
    const next = (lon + 1) % nLon;
    const out_curr = 2 * lon;
    const out_next = 2 * next;
    const in_curr = 2 * lon + 1;
    const in_next = 2 * next + 1;
    tris.push(out_curr, in_curr, in_next);
    tris.push(out_curr, in_next, out_next);
  }

  // Zenith Apex Closure at lat = nLat:
  const topStart = nLat * nLon * 2;
  let avgOutX = 0, avgOutY = 0, avgOutZ = 0;
  let avgInX = 0, avgInY = 0, avgInZ = 0;
  for (let lon = 0; lon < nLon; lon++) {
    avgOutX += verts[(topStart + 2 * lon) * 3];
    avgOutY += verts[(topStart + 2 * lon) * 3 + 1];
    avgOutZ += verts[(topStart + 2 * lon) * 3 + 2];
    avgInX += verts[(topStart + 2 * lon + 1) * 3];
    avgInY += verts[(topStart + 2 * lon + 1) * 3 + 1];
    avgInZ += verts[(topStart + 2 * lon + 1) * 3 + 2];
  }
  avgOutX /= nLon; avgOutY /= nLon; avgOutZ /= nLon;
  avgInX /= nLon; avgInY /= nLon; avgInZ /= nLon;

  const apexOutIdx = verts.length / 3;
  verts.push(avgOutX, avgOutY, avgOutZ);
  const apexInIdx = apexOutIdx + 1;
  verts.push(avgInX, avgInY, avgInZ);

  for (let lon = 0; lon < nLon; lon++) {
    const next = (lon + 1) % nLon;
    const out_curr = topStart + 2 * lon;
    const out_next = topStart + 2 * next;
    const in_curr = topStart + 2 * lon + 1;
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
    .translate([0, 0, 0.0]);
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

  const nLat = 100;
  const nLon = 160;

  const cloudMesh = buildMasterDomeCloudMesh(params, puffs, noise, nLat, nLon);

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
