import type { LampParameters, LampPart, MeshData } from '../types';
import { createNoise3D } from './organicField';
import type { CloudPuff } from './cloudGenerator';

/**
 * Generates horizontal cumulus puff formations for a panoramic landscape cloud bank.
 * Follows the 3-tier master cloud hierarchy:
 * - Macro Formations ("Mother Banks"): 4 towering cloud masses distributed horizontally
 * - Meso Convection Lobes ("Father Lobes"): 3 companion lobes per mother bank
 * - Micro Cauliflower Florets ("Child Florets"): clustered intermediate florets
 */
export function generateHorizontalCloudPuffs(
  seed = 77,
  width = 220,
  depth = 85,
  height = 105,
  puffDepth = 12.0,
  floretScale = 2.4
): CloudPuff[] {
  let s = Math.abs(seed) % 2147483647;
  if (s === 0) s = 1;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };

  const puffs: CloudPuff[] = [];
  const ampScale = puffDepth / 12.0;

  // 4 Grand Horizontal Formations ("Mother Banks") distributed along the panoramic X axis
  const bankXOffsets = [-0.62, -0.15, 0.35, 0.72];
  const bankYOffsets = [-0.10, 0.15, -0.12, 0.08];
  const bankZOffsets = [0.45, 0.65, 0.55, 0.40]; // Center tower rises highest

  for (let b = 0; b < bankXOffsets.length; b++) {
    const xBase = bankXOffsets[b] * (width * 0.42) + (rand() - 0.5) * 12.0;
    const yBase = bankYOffsets[b] * (depth * 0.35) + (rand() - 0.5) * 8.0;
    const zBase = bankZOffsets[b] * height + (rand() - 0.5) * 10.0;
    const u = Math.min(0.90, Math.max(0.12, zBase / height));
    const th = Math.atan2(yBase, xBase);

    // Primary macro head: bold, pillowy, towering
    const amp = (14.0 + rand() * 4.5) * ampScale;
    const rCirc = 38.0 + rand() * 10.0; // 38 to 48 mm wide
    const rZ = 28.0 + rand() * 8.0;     // 28 to 36 mm tall

    puffs.push({
      level: 0,
      bankId: b,
      u,
      z: zBase,
      th,
      amp,
      rCirc,
      rZ,
      haloWeight: 1.0,
    });

    // Companion Convection Sub-lobes (3 per mother bank)
    for (let j = 0; j < 3; j++) {
      const angle = (j * ((2 * Math.PI) / 3) + (rand() - 0.5) * 0.70) % (2 * Math.PI);
      const dist = 0.48 + rand() * 0.28;
      const xOff = Math.cos(angle) * (rCirc * dist);
      const yOff = Math.sin(angle) * (rCirc * dist * 0.60);
      const zOff = (rand() - 0.5) * (rZ * 0.60);

      const xSub = xBase + xOff;
      const ySub = yBase + yOff;
      const zSub = Math.min(height * 0.90, Math.max(height * 0.12, zBase + zOff));
      const uSub = zSub / height;
      const thSub = Math.atan2(ySub, xSub);

      const subAmp = amp * (0.55 + rand() * 0.20);
      const subRCirc = 22.0 + rand() * 8.0;
      const subRZ = 18.0 + rand() * 6.0;

      puffs.push({
        level: 1,
        bankId: b,
        u: uSub,
        z: zSub,
        th: thSub,
        amp: subAmp,
        rCirc: subRCirc,
        rZ: subRZ,
        haloWeight: 0.85,
      });

      // Micro Cauliflower Florets
      if (floretScale > 0.1) {
        for (let k = 0; k < 2; k++) {
          const fAngle = (k * Math.PI + (rand() - 0.5) * 1.0) % (2 * Math.PI);
          const fDist = 0.50 + rand() * 0.35;
          const fXOff = Math.cos(fAngle) * (subRCirc * fDist);
          const fYOff = Math.sin(fAngle) * (subRCirc * fDist * 0.50);
          const fZOff = (rand() - 0.5) * (subRZ * 0.50);

          const xFloret = xSub + fXOff;
          const yFloret = ySub + fYOff;
          const zFloret = Math.min(height * 0.92, Math.max(height * 0.10, zSub + fZOff));
          const uFloret = zFloret / height;
          const thFloret = Math.atan2(yFloret, xFloret);

          const fAmp = (floretScale / 2.4) * (1.8 + rand() * 1.2);
          const fRCirc = 9.5 + rand() * 3.5;
          const fRZ = 7.5 + rand() * 2.5;

          puffs.push({
            level: 2,
            bankId: b,
            u: uFloret,
            z: zFloret,
            th: thFloret,
            amp: fAmp,
            rCirc: fRCirc,
            rZ: fRZ,
            haloWeight: 0.70,
          });
        }
      }
    }
  }

  // Connecting valley rolls
  const rollCount = 8;
  for (let k = 0; k < rollCount; k++) {
    const xRoll = ((k / (rollCount - 1)) - 0.5) * (width * 0.80);
    const yRoll = (rand() - 0.5) * (depth * 0.40);
    const zRoll = 0.20 * height + rand() * (0.35 * height);
    puffs.push({
      level: 3,
      bankId: -1,
      u: zRoll / height,
      z: zRoll,
      th: Math.atan2(yRoll, xRoll),
      amp: (3.5 + rand() * 2.5) * ampScale,
      rCirc: 26.0 + rand() * 8.0,
      rZ: 18.0 + rand() * 6.0,
      haloWeight: 0.60,
    });
  }

  return puffs;
}

/**
 * Evaluates the 3D surface position and lithophane wall thickness for the horizontal cloud bank.
 */
export function evalHorizontalCloudField(
  u: number, // 0 at base (Z=0), 1 at crown (Z=height)
  th: number, // 0 to 2*PI perimeter polar angle
  params: LampParameters,
  puffs: CloudPuff[],
  noise: (x: number, y: number, z: number) => number
): { xOuter: number; yOuter: number; xInner: number; yInner: number; z: number; thickness: number; maxRimHalo: number } {
  const width = params.horizonWidth ?? 220;
  const depth = params.horizonDepth ?? 85;
  const height = params.horizonHeight ?? 105;

  const aBase = width * 0.48; // Semi-major axis in X
  const bBase = depth * 0.48; // Semi-minor axis in Y

  const cosTh = Math.cos(th);
  const sinTh = Math.sin(th);

  // Stadium base profile
  const denom = Math.sqrt((bBase * cosTh) * (bBase * cosTh) + (aBase * sinTh) * (aBase * sinTh));
  const rStadium = denom > 0.001 ? (aBase * bBase) / denom : bBase;

  // Elevation Z
  const z = u * height;

  // Dome taper as elevation approaches summit crown
  // Flat open base at u=0, soaring billows through u=0.15-0.85, converging crown towards u=1.0
  const domeTaper = Math.sqrt(Math.max(0.0001, 1.0 - Math.pow(Math.max(0.0, (u - 0.06) / 0.94), 2.2)));
  const rNom = rStadium * (u < 0.06 ? 1.0 : domeTaper);

  const xNom = rNom * cosTh;
  const yNom = rNom * sinTh;

  // Domain warping for natural fluid flow
  const warpScale = 0.022;
  const warpX = noise(xNom * warpScale + 11.2, yNom * warpScale, z * warpScale) * 3.5;
  const warpY = noise(xNom * warpScale, yNom * warpScale + 44.5, z * warpScale) * 2.5;
  const warpZ = noise(xNom * warpScale + 77.1, yNom * warpScale + 19.3, z * warpScale) * 2.8;

  const xW = xNom + warpX;
  const yW = yNom + warpY;
  const zW = z + warpZ;

  let maxBulge = 0;
  let sumBulge = 0;
  let maxRimHalo = 0;
  const bankBulges = [0, 0, 0, 0, 0, 0];

  for (const puff of puffs) {
    const puffX = Math.cos(puff.th) * (puff.level === 0 ? aBase * 0.60 : aBase * 0.70);
    const puffY = Math.sin(puff.th) * (puff.level === 0 ? bBase * 0.60 : bBase * 0.70);
    const puffZ = puff.z;

    const dx = xW - puffX;
    const dy = yW - puffY;
    const dz = zW - puffZ;

    // Anisotropic Convection Draft:
    // Gentle flat/broad condensation base below (effectiveRz * 1.45), soaring billowing dome above (effectiveRz * 0.92)
    // 100% support-free FDM overhang draft (<= 36 deg from vertical)
    const effectiveRz = dz < 0 ? puff.rZ * 1.45 : puff.rZ * 0.92;

    const normDist = Math.sqrt(
      (dx * dx) / (puff.rCirc * puff.rCirc) +
      (dy * dy) / (puff.rCirc * puff.rCirc * 0.75) +
      (dz * dz) / (effectiveRz * effectiveRz)
    );

    if (normDist < 1.0) {
      const domeProfile = 0.5 * (1.0 + Math.cos(Math.PI * normDist));
      const bulge = puff.amp * domeProfile;

      if (bulge > maxBulge) maxBulge = bulge;
      sumBulge += bulge;

      if (puff.bankId >= 0 && puff.bankId < bankBulges.length) {
        bankBulges[puff.bankId] += bulge;
      }

      // Smooth silhouette halo along outer boundary slopes
      const rimPeak = 0.76;
      const rimWidth = 0.18;
      const halo = Math.exp(-Math.pow(normDist - rimPeak, 2.0) / (2.0 * rimWidth * rimWidth)) * puff.haloWeight;
      if (halo > maxRimHalo) {
        maxRimHalo = halo;
      }
    }
  }

  // Smooth-max blend: filleted saddles with zero boundary step discontinuities
  const compositeBulge = maxBulge + 0.22 * Math.max(0, sumBulge - maxBulge);

  // Band-limited organic waves
  const flowScale = 0.035;
  const fluidWave = (
    noise(xNom * flowScale + 12.3, yNom * flowScale + 55.7, z * flowScale + 31.9) * 1.4 +
    noise(xNom * flowScale * 1.8 + 77.1, yNom * flowScale * 1.8 + 18.4, z * flowScale * 1.8) * 0.7
  );

  // Intermediate Broccoli Floret Harmonics (~7-10mm wavelength)
  const floretScale = params.cloudFloretScale ?? 2.4;
  const floretWave = floretScale > 0.1 ? (
    noise(xNom * 0.10 + 42.1, yNom * 0.10 + 88.3, z * 0.10 + 17.5) * (floretScale * 0.55) +
    noise(xNom * 0.16 + 14.7, yNom * 0.16 + 33.2, z * 0.16 + 91.1) * (floretScale * 0.28)
  ) : 0;

  // Physical Micro-Granule Tooth
  const microTooth = params.cloudTurbulence ?? 0.35;
  const microWave = microTooth > 0.05 ? (
    noise(xNom * 0.26 + 61.3, yNom * 0.26 + 19.8, z * 0.26 + 84.2) * (microTooth * 0.95) +
    noise(xNom * 0.40 + 12.7, yNom * 0.40 + 93.1, z * 0.40 + 47.6) * (microTooth * 0.55)
  ) : 0;

  // Bottom collar ease (seats flush into desk plinth at z=0)
  const rimEaseBottom = Math.min(1.0, Math.max(0.0, (u - 0.025) / 0.045));
  const totalBulge = (compositeBulge + fluidWave + floretWave + microWave) * rimEaseBottom;

  const rOuter = Math.max(1.5, rNom + totalBulge);

  // Master Cloud Shading - "Lost & Found" Edges:
  let b1 = 0;
  let b2 = 0;
  for (let k = 0; k < bankBulges.length; k++) {
    const val = bankBulges[k];
    if (val > b1) {
      b2 = b1;
      b1 = val;
    } else if (val > b2) {
      b2 = val;
    }
  }
  const interBankSeam = (b1 > 1.2 && b2 > 1.2) ? Math.min(1.0, (2.0 * b2) / (b1 + b2)) : 0.0;

  // Physical lithophane wall thickness
  const tMin = params.cloudMinThickness ?? 0.8;
  const tMax = params.cloudMaxThickness ?? 6.4;
  const rimWeight = (params.cloudRimLighting ?? 2.0) / 2.0;

  const maxDepth = params.cloudPuffDepth ?? 12.0;
  const normBulge = Math.min(1.0, Math.max(0.0, compositeBulge / Math.max(4.0, maxDepth * 0.85)));

  let localT = tMin + normBulge * (tMax - tMin);

  // Found Edges: Grand inter-bank seams are carved thin for glowing light corridors
  if (interBankSeam > 0.02) {
    localT -= interBankSeam * (tMax - tMin) * 0.40 * rimWeight;
  }
  if (maxRimHalo > 0.01) {
    localT -= maxRimHalo * (tMax - tMin) * 0.16 * rimWeight;
  }
  localT = Math.max(tMin, Math.min(tMax, localT));

  // Base plinth collar blend
  const tCollar = 2.2;
  const thickness = tCollar + (localT - tCollar) * rimEaseBottom;

  const rInner = Math.max(1.0, rOuter - thickness);

  const xOuter = rOuter * cosTh;
  const yOuter = rOuter * sinTh;
  const xInner = rInner * cosTh;
  const yInner = rInner * sinTh;

  return { xOuter, yOuter, xInner, yInner, z, thickness, maxRimHalo };
}

/**
 * Builds the watertight 2-manifold horizontal cloud shade mesh.
 * Capped seamlessly at the summit (no open holes/chimneys).
 */
function buildHorizontalCloudShadeMesh(
  nSlices: number,
  nPts: number,
  params: LampParameters,
  puffs: CloudPuff[],
  noise: (x: number, y: number, z: number) => number
): MeshData {
  const verts: number[] = [];
  const tris: number[] = [];
  const ringSize = 2 * nPts;
  const height = params.horizonHeight ?? 105;
  const tMin = params.cloudMinThickness ?? 0.8;

  for (let s = 0; s <= nSlices; s++) {
    // Slices span u from 0.0 to 0.96. The final 0.04 cap converges to the smooth apex points.
    const u = (s / nSlices) * 0.96;

    for (let i = 0; i < nPts; i++) {
      const th = (i / nPts) * 2 * Math.PI;
      const { xOuter, yOuter, xInner, yInner, z } = evalHorizontalCloudField(u, th, params, puffs, noise);

      // Outer vertex (2*i)
      verts.push(xOuter, yOuter, z);
      // Inner vertex (2*i + 1)
      verts.push(xInner, yInner, z);
    }
  }

  // Connect quad strip sides
  for (let s = 0; s < nSlices; s++) {
    const s0 = s * ringSize;
    const s1 = (s + 1) * ringSize;

    for (let i = 0; i < nPts; i++) {
      const next = (i + 1) % nPts;

      // Outer wall quad (pointing outward CCW)
      const out_a = s0 + 2 * i;
      const out_b = s0 + 2 * next;
      const out_c = s1 + 2 * next;
      const out_d = s1 + 2 * i;

      tris.push(out_a, out_b, out_c);
      tris.push(out_a, out_c, out_d);

      // Inner wall quad (pointing inward CCW)
      const in_a = s0 + 2 * i + 1;
      const in_b = s0 + 2 * next + 1;
      const in_c = s1 + 2 * next + 1;
      const in_d = s1 + 2 * i + 1;

      tris.push(in_a, in_c, in_b);
      tris.push(in_a, in_d, in_c);
    }
  }

  // Bottom Rim at z=0 (flat seating lip normal pointing -Z)
  for (let i = 0; i < nPts; i++) {
    const next = (i + 1) % nPts;
    const out_curr = 2 * i;
    const out_next = 2 * next;
    const in_curr = 2 * i + 1;
    const in_next = 2 * next + 1;

    tris.push(out_curr, in_curr, in_next);
    tris.push(out_curr, in_next, out_next);
  }

  // Seamless Top Summit Crown Closure:
  // Outer apex point at (0, 0, height)
  // Inner apex point at (0, 0, height - tMin)
  const apexOutIdx = verts.length / 3;
  verts.push(0, 0, height);

  const apexInIdx = verts.length / 3;
  verts.push(0, 0, height - tMin);

  const topStart = nSlices * ringSize;
  for (let i = 0; i < nPts; i++) {
    const next = (i + 1) % nPts;
    const out_curr = topStart + 2 * i;
    const out_next = topStart + 2 * next;
    const in_curr = topStart + 2 * i + 1;
    const in_next = topStart + 2 * next + 1;

    // Outer apex fan (pointing upward/outward +Z)
    tris.push(out_curr, out_next, apexOutIdx);

    // Inner apex fan (pointing downward/inward into hollow cavity -Z)
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

  const plinthW = width + 14.0;
  const plinthD = depth + 14.0;
  const plinthH = 22.0;
  const cornerR = 8.0;

  // 1. Sleek rounded desktop plinth (Union of BoxX + BoxY + 4 corner cylinders)
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

  // Recessed seating pocket for cloud shade bottom collar at Z = 0
  const seatPocket = wasm.Manifold.cube([width + 1.8, depth + 1.8, 4.0], true)
    .translate([0, 0, -1.5]);
  plinthBase = plinthBase.subtract(seatPocket);

  // Central light aperture
  const lightAperture = wasm.Manifold.cube([width - 32.0, 32.0, 16.0], true)
    .translate([0, 0, -8.0]);
  plinthBase = plinthBase.subtract(lightAperture);

  // Internal ESP32-C6 electronics bay at rear (-Y)
  const espBay = wasm.Manifold.cube([52.0, 26.0, 14.0], true)
    .translate([0, -plinthD / 2 + 22.0, -plinthH / 2]);
  plinthBase = plinthBase.subtract(espBay);

  // Rear flush USB-C port (12.5 x 6.5 mm)
  const usbCutout = wasm.Manifold.cube([12.5, 24.0, 6.5], true)
    .translate([0, -plinthD / 2 + 6.0, -plinthH / 2]);
  plinthBase = plinthBase.subtract(usbCutout);

  // 2. Horizontal LED Reflector Mandrel (`veins`)
  // Holds a straight 10.5mm WS2812B strip facing straight UP into the cloud hollow
  const trackW = width - 36.0;
  const trackD = 28.0;
  const trackH = 12.0;

  let reflectorTrack = wasm.Manifold.cube([trackW, trackD, trackH], true)
    .translate([0, 0, -2.0 - trackH / 2]);

  // Recessed straight LED strip bed (10.5mm wide, 1.8mm deep)
  const stripBed = wasm.Manifold.cube([trackW - 6.0, 10.6, 2.5], true)
    .translate([0, 0, -2.0 - 0.8]);
  reflectorTrack = reflectorTrack.subtract(stripBed);

  // Angled 45° reflective diffuser flare walls
  const flareCut = wasm.Manifold.cube([trackW - 6.0, 22.0, 5.0], true)
    .translate([0, 0, -2.0 + 1.5]);
  reflectorTrack = reflectorTrack.subtract(flareCut);

  // Wire drop hole into ESP32 chamber
  const wireDrop = wasm.Manifold.cylinder(trackH + 4.0, 3.5, 3.5, 16, true)
    .translate([0, 0, -2.0 - trackH / 2]);
  reflectorTrack = reflectorTrack.subtract(wireDrop);

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
  const puffDepth = params.cloudPuffDepth ?? 12.0;
  const floretScale = params.cloudFloretScale ?? 2.4;

  const puffs = generateHorizontalCloudPuffs(seed, width, depth, height, puffDepth, floretScale);
  const noise = createNoise3D(seed);

  const nSlices = 96;
  const nPts = 160;

  // 1. Build the watertight cloud shade mesh
  const cloudMesh = buildHorizontalCloudShadeMesh(nSlices, nPts, params, puffs, noise);

  // 2. Build the desktop plinth and horizontal LED reflector track in Manifold
  const { plinth, reflector } = buildHorizontalBaseAndReflector(wasm, params);
  const plinthMesh = plinth.getMesh();
  const reflectorMesh = reflector.getMesh();

  return [
    {
      id: 'body',
      name: 'Horizontal Cloud Shade',
      color: '#ffffff', // Snapmaker SnapSpeed PLA (White)
      mesh: cloudMesh,
      extruder: 3, // Toolhead 3: Snapmaker SnapSpeed PLA (White)
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
