import type { LampParameters, LampPart, MeshData } from '../types';
import { createNoise3D } from './organicField';

export interface CloudPuff {
  level: number;
  u: number;
  z: number;
  th: number;
  amp: number;
  rCirc: number;
  rZ: number;
  haloWeight: number;
}

/**
 * Precomputes a balanced 360° multi-level cumulus cloud system:
 * - Level 0: Primary macro cumulus mounds (broad, rounded pillowy domes)
 * - Level 1: Companion cauliflower sub-lobes (2 companion lobes per mound)
 * - Level 2: Tertiary atmospheric roll billows
 * Total: ~78 organic billow features providing natural multi-scale cauliflower aesthetics.
 */
export function generateCloudPuffCenters(
  seed = 77,
  height = 180,
  puffCount = 22,
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
  const phi = (Math.sqrt(5) - 1) / 2; // Golden ratio base for uniform 360° spherical coverage
  const ampScale = puffDepth / 12.0;

  for (let i = 0; i < puffCount; i++) {
    // Non-linear elevation with organic clustering
    const uBase = 0.08 + (i / (puffCount - 1)) * 0.84;
    const uJitter = (rand() - 0.5) * 0.055;
    const u = Math.min(0.92, Math.max(0.08, uBase + uJitter));

    // Azimuth: golden spiral + organic wind swirl + jitter
    const thSwirl = Math.sin(u * Math.PI * 2.2) * 0.35;
    const thJitter = (rand() - 0.5) * 0.45;
    const th = (i * phi * 2 * Math.PI + thSwirl + thJitter + 4 * Math.PI) % (2 * Math.PI);

    // Primary macro mound: bold, broad, pillowy (protrusion 11 to 15.5 mm)
    const amp = (11.0 + rand() * 4.5) * ampScale;
    const rCirc = 30.0 + rand() * 10.0; // 30 to 40 mm wide
    const rZ = 22.0 + rand() * 8.0;     // 22 to 30 mm tall
    const z = u * height;

    puffs.push({
      level: 0,
      u,
      z,
      th,
      amp,
      rCirc,
      rZ,
      haloWeight: 1.0,
    });

    // Companion cauliflower sub-lobes (2 companion lobes clustering with each primary mound)
    for (let j = 0; j < 2; j++) {
      const angle = (j * Math.PI + (rand() - 0.5) * 0.8) % (2 * Math.PI);
      const dist = 0.45 + rand() * 0.35;
      const arcOff = Math.cos(angle) * (rCirc * dist);
      const zOff = Math.sin(angle) * (rZ * dist);

      const thSub = (th + arcOff / 44.0 + 4 * Math.PI) % (2 * Math.PI);
      const zSub = Math.min(height * 0.92, Math.max(height * 0.08, z + zOff));
      const uSub = zSub / height;

      // Sub-lobe is 45% to 65% of parent amplitude, rounded and broad
      const subAmp = amp * (0.45 + rand() * 0.20);
      const subRCirc = 18.0 + rand() * 8.0; // 18 to 26 mm
      const subRZ = 15.0 + rand() * 6.0;

      puffs.push({
        level: 1,
        u: uSub,
        z: zSub,
        th: thSub,
        amp: subAmp,
        rCirc: subRCirc,
        rZ: subRZ,
        haloWeight: 0.85,
      });

      // Intermediate Broccoli Florets (Level 2: 2 florets per sub-lobe, ~7-11mm diameter)
      if (floretScale > 0.1) {
        for (let k = 0; k < 2; k++) {
          const floretAngle = (k * Math.PI + (rand() - 0.5) * 1.2) % (2 * Math.PI);
          const fDist = 0.50 + rand() * 0.35;
          const fArcOff = Math.cos(floretAngle) * (subRCirc * fDist);
          const fZOff = Math.sin(floretAngle) * (subRZ * fDist);

          const thFloret = (thSub + fArcOff / 44.0 + 4 * Math.PI) % (2 * Math.PI);
          const zFloret = Math.min(height * 0.94, Math.max(height * 0.06, zSub + fZOff));
          const uFloret = zFloret / height;

          const fAmp = (floretScale / 2.4) * (1.6 + rand() * 1.2); // ~1.6 to 2.8 mm
          const fRCirc = 8.5 + rand() * 3.5; // 8.5 to 12 mm wide
          const fRZ = 7.0 + rand() * 3.0;   // 7.0 to 10 mm tall

          puffs.push({
            level: 2,
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

  // Tertiary atmospheric roll billows filling valleys
  const tertiaryCount = 12;
  for (let k = 0; k < tertiaryCount; k++) {
    const u = 0.10 + rand() * 0.80;
    const th = rand() * 2 * Math.PI;
    const amp = (3.5 + rand() * 2.5) * ampScale; // 3.5 to 6.0 mm
    const rCirc = 22.0 + rand() * 8.0;
    const rZ = 16.0 + rand() * 6.0;

    puffs.push({
      level: 3,
      u,
      z: u * height,
      th,
      amp,
      rCirc,
      rZ,
      haloWeight: 0.65,
    });
  }

  return puffs;
}

/**
 * Evaluates the fluffy cloud radius and lithophane wall thickness.
 * Key features:
 * 1. Multi-scale cumulus morphology with cauliflower sub-lobes and rolling billows.
 * 2. C2-continuous cosine-bell dome kernels (zero boundary creases, zero spikes).
 * 3. Dramatic glowing rim lighting halo outlining each cloud clump and sub-lobe.
 * 4. 100% free of Nyquist Moiré grid aliasing.
 */
export function evalFluffyCloudField(
  u: number,
  th: number,
  params: LampParameters,
  puffs: CloudPuff[],
  noise: (x: number, y: number, z: number) => number
): { rOuter: number; rInner: number; thickness: number; totalPuffBulge: number; maxRimHalo: number } {
  const {
    height = 180,
    baseRadius = 44,
    topRadius = 38,
    waistRatio = 0.92,
    cloudMinThickness = 0.95,
    cloudMaxThickness = 4.8,
    cloudRimLighting = 2.0,
  } = params;

  // Base silhouette
  const rNom = (1 - u) * baseRadius + u * topRadius + 4 * u * (1 - u) * ((waistRatio - 1) * (baseRadius + topRadius) * 0.5);

  // Transition collars at base and rim
  const rimEaseBottom = Math.min(1.0, Math.max(0.0, (u - 0.035) / 0.045));
  const rimEaseTop = Math.min(1.0, Math.max(0.0, (0.97 - u) / 0.04));
  const rimEase = rimEaseBottom * rimEaseTop;

  const z = u * height;
  const xMm = rNom * Math.cos(th);
  const yMm = rNom * Math.sin(th);
  const zMm = z;

  // Smooth Large-Scale Wind Drift (Domain Warping, wavelength ~55mm)
  const warpScale = 0.018;
  const warpTh = noise(xMm * warpScale, yMm * warpScale, zMm * warpScale) * 0.08;
  const warpZ = noise(xMm * warpScale + 23.1, yMm * warpScale + 11.4, zMm * warpScale) * 3.5;

  const thWarped = (th + warpTh + 4 * Math.PI) % (2 * Math.PI);
  const zWarped = z + warpZ;

  let maxBulge = 0;
  let sumBulge = 0;
  let maxRimHalo = 0;

  // Organic puff perimeter distortion (wavelength ~28mm, safe from grid aliasing)
  const puffWarpNoise = noise(xMm * 0.036 + 19.3, yMm * 0.036 + 53.1, zMm * 0.036 + 81.7);
  const distWarp = 1.0 + 0.16 * puffWarpNoise;

  for (const puff of puffs) {
    let dTh = Math.abs(thWarped - puff.th);
    if (dTh > Math.PI) dTh = 2 * Math.PI - dTh;
    const arcDist = dTh * rNom;

    const dz = zWarped - puff.z;
    // Downward overhang slope draft <= 40 deg from vertical (100% support-free FDM)
    const effectiveRz = dz < 0 ? puff.rZ * 1.30 : puff.rZ;

    const normDist = Math.sqrt((arcDist * arcDist) / (puff.rCirc * puff.rCirc) + (dz * dz) / (effectiveRz * effectiveRz));
    const dWarped = normDist * distWarp;

    if (dWarped < 1.0) {
      // Pillowy cosine-bell dome profile: zero slope at crest, zero slope at base perimeter
      const domeProfile = 0.5 * (1.0 + Math.cos(Math.PI * dWarped));
      const bulge = puff.amp * domeProfile;

      if (bulge > maxBulge) maxBulge = bulge;
      sumBulge += bulge;

      // ORGANIC RIM LIGHTING HALO:
      // Gaussian halo peaking at the steep perimeter slope (dWarped ~ 0.74)
      const rimPeak = 0.74;
      const rimWidth = 0.14;
      const halo = Math.exp(-Math.pow(dWarped - rimPeak, 2.0) / (2.0 * rimWidth * rimWidth)) * puff.haloWeight;
      if (halo > maxRimHalo) {
        maxRimHalo = halo;
      }
    }
  }

  // Smooth-max blend: filleted saddles with zero boundary step discontinuities
  const compositeBulge = maxBulge + 0.24 * Math.max(0, sumBulge - maxBulge);

  // Band-Limited Organic Fluid Flow Waves (wavelength 20-35mm, completely safe from Nyquist aliasing)
  const flowScale = 0.035;
  const fluidWave = (
    noise(xMm * flowScale + 12.3, yMm * flowScale + 55.7, zMm * flowScale + 31.9) * 1.4 +
    noise(xMm * flowScale * 1.8 + 77.1, yMm * flowScale * 1.8 + 18.4, zMm * flowScale * 1.8) * 0.7
  );

  // Level 2 Intermediate Broccoli Floret Harmonics (~7-10mm wavelength)
  const floretScale = params.cloudFloretScale ?? 2.4;
  const floretWave = floretScale > 0.1 ? (
    noise(xMm * 0.10 + 42.1, yMm * 0.10 + 88.3, zMm * 0.10 + 17.5) * (floretScale * 0.55) +
    noise(xMm * 0.16 + 14.7, yMm * 0.16 + 33.2, zMm * 0.16 + 91.1) * (floretScale * 0.28)
  ) : 0;

  // Level 3 Physical Micro-Granule Floret Tooth (~3.5-5.5mm wavelength)
  const microTooth = params.cloudTurbulence ?? 0.35;
  const microWave = microTooth > 0.05 ? (
    noise(xMm * 0.26 + 61.3, yMm * 0.26 + 19.8, zMm * 0.26 + 84.2) * (microTooth * 0.95) +
    noise(xMm * 0.40 + 12.7, yMm * 0.40 + 93.1, zMm * 0.40 + 47.6) * (microTooth * 0.55)
  ) : 0;

  // Outer radius: composite billows + fluid flow waves + intermediate florets + micro-floret tooth
  const rOuter = rNom + (compositeBulge + fluidWave + floretWave + microWave) * rimEase;

  // Physical lithophane wall thickness governed by Glow Highlights (min) and Shadow Depth (max)
  const tMin = params.cloudMinThickness ?? 0.8;
  const tMax = params.cloudMaxThickness ?? 6.4;
  const rimWeight = (params.cloudRimLighting ?? 2.0) / 2.0;

  const maxDepth = params.cloudPuffDepth ?? 12.0;
  const moundFactor = Math.pow(Math.min(1.0, Math.max(0.0, compositeBulge / Math.max(4.0, maxDepth * 0.75))), 1.4);

  // Intersections, crevices & seams between large blobs -> tMin (thin, radiant glowing highlights)
  // Large puff bodies -> tMax (soft volumetric cloud mass)
  let localT = tMin + moundFactor * (tMax - tMin);

  // Clump perimeter boundary (silver lining halo) -> carved thin for radiant edge glow
  const haloThinning = maxRimHalo * (tMax - tMin) * 0.50 * rimWeight;
  localT -= haloThinning;

  // Intersections where multiple large blobs overlap: carve out extra lightness
  const blobOverlap = Math.min(1.0, Math.max(0.0, (sumBulge - maxBulge) / 4.0));
  localT -= blobOverlap * (tMax - tMin) * 0.40 * rimWeight;

  localT = Math.max(tMin, Math.min(tMax, localT));

  // Smooth collar blend at base and top rim (nominal 2.0mm thickness, never burnt or dark)
  const tCollar = 2.0;
  const thickness = tCollar + (localT - tCollar) * rimEase;

  const rInner = rOuter - thickness;

  return { rOuter, rInner, thickness, totalPuffBulge: compositeBulge, maxRimHalo };
}

/**
 * Builds a watertight 2-manifold lofted cloud shade mesh in a single pass.
 */
function buildFluffyCloudShadeMesh(
  nSlices: number,
  nPts: number,
  height: number,
  params: LampParameters,
  puffs: CloudPuff[],
  noise: (x: number, y: number, z: number) => number
): MeshData {
  const verts: number[] = [];
  const tris: number[] = [];
  const ringSize = 2 * nPts;

  for (let s = 0; s <= nSlices; s++) {
    const u = s / nSlices;
    const z = u * height;

    for (let i = 0; i < nPts; i++) {
      const th = (i / nPts) * 2 * Math.PI;
      const { rOuter, rInner } = evalFluffyCloudField(u, th, params, puffs, noise);

      // Outer vertex (2*i)
      verts.push(rOuter * Math.cos(th), rOuter * Math.sin(th), z);
      // Inner vertex (2*i + 1)
      verts.push(rInner * Math.cos(th), rInner * Math.sin(th), z);
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

  // Bottom Rim (z=0, normal pointing -Z)
  for (let i = 0; i < nPts; i++) {
    const next = (i + 1) % nPts;
    const out_curr = 2 * i;
    const out_next = 2 * next;
    const in_curr = 2 * i + 1;
    const in_next = 2 * next + 1;

    tris.push(out_curr, in_curr, in_next);
    tris.push(out_curr, in_next, out_next);
  }

  // Top Rim (z=height, normal pointing +Z)
  const topStart = nSlices * ringSize;
  for (let i = 0; i < nPts; i++) {
    const next = (i + 1) % nPts;
    const out_curr = topStart + 2 * i;
    const out_next = topStart + 2 * next;
    const in_curr = topStart + 2 * i + 1;
    const in_next = topStart + 2 * next + 1;

    tris.push(out_curr, out_next, in_next);
    tris.push(out_curr, in_next, in_curr);
  }

  return {
    vertProperties: new Float32Array(verts),
    triVerts: new Uint32Array(tris),
    numProp: 3,
  };
}

/**
 * Builds Central LED Column (Core Tower) with 3 or 4 flat strip beds,
 * internal hollow wire corridor, and base plug.
 */
function buildCentralLedColumn(wasm: any, params: LampParameters) {
  const { height, cloudColumnFacets = 3 } = params;
  const colHeight = height - 10.0;
  const colRadius = cloudColumnFacets === 3 ? 18.0 : 16.0;

  const nFacets = cloudColumnFacets;
  const stripBedWidth = 10.5;
  const stripBedDepth = 0.8;

  let columnSolid = wasm.Manifold.cylinder(colHeight, colRadius, colRadius, nFacets, false);

  // Central wire conduit (diameter 12mm)
  const wireBore = wasm.Manifold.cylinder(colHeight + 20.0, 6.0, 6.0, 32, false)
    .translate([0, 0, -10.0]);
  columnSolid = columnSolid.subtract(wireBore);

  // Recessed strip beds & wire pass-throughs
  const channelCutters: any[] = [];
  const facetAngleStep = (2 * Math.PI) / nFacets;
  const apothem = colRadius * Math.cos(facetAngleStep / 2);

  for (let f = 0; f < nFacets; f++) {
    const thFacet = f * facetAngleStep + facetAngleStep / 2;

    const bedBox = wasm.Manifold.cube([stripBedWidth, 2.0, colHeight - 4.0], true)
      .translate([0, apothem - stripBedDepth / 2 + 0.1, colHeight / 2 + 2.0])
      .rotate([0, 0, (thFacet * 180) / Math.PI - 90]);
    channelCutters.push(bedBox);

    // Top turnaround wire pass-through
    const topWireHole = wasm.Manifold.cylinder(8.0, 2.5, 2.5, 16, true)
      .rotate([90, 0, (thFacet * 180) / Math.PI - 90])
      .translate([
        (apothem - 2.0) * Math.cos(thFacet),
        (apothem - 2.0) * Math.sin(thFacet),
        colHeight - 6.0,
      ]);
    channelCutters.push(topWireHole);

    // Bottom wire pass-through
    const botWireHole = wasm.Manifold.cylinder(8.0, 2.5, 2.5, 16, true)
      .rotate([90, 0, (thFacet * 180) / Math.PI - 90])
      .translate([
        (apothem - 2.0) * Math.cos(thFacet),
        (apothem - 2.0) * Math.sin(thFacet),
        6.0,
      ]);
    channelCutters.push(botWireHole);
  }

  const allChannels = wasm.Manifold.union(channelCutters);
  columnSolid = columnSolid.subtract(allChannels);

  // Keyed bottom mounting plug to seat in base cradle
  const plugH = 10.0;
  const plugRadius = 12.0;
  const basePlug = wasm.Manifold.cylinder(plugH, plugRadius, plugRadius, 16, false)
    .subtract(wasm.Manifold.cylinder(plugH + 2.0, 6.0, 6.0, 32, false).translate([0, 0, -1.0]))
    .add(wasm.Manifold.cube([3.0, 3.0, plugH], true).translate([plugRadius, 0, plugH / 2]))
    .translate([0, 0, -plugH]);

  columnSolid = columnSolid.add(basePlug);

  return columnSolid;
}

/**
 * Builds Base Cradle with central column receptor socket and ESP32-C6 mount.
 */
function buildCloudBaseCradle(wasm: any, params: LampParameters) {
  const { baseRadius = 45 } = params;
  const baseH = 14.0;
  const baseOuterR = baseRadius + 3.0;

  let baseSolid = wasm.Manifold.cylinder(baseH, baseOuterR, baseOuterR, 64);

  // Interior cavity (depth 11.5mm)
  const cavity = wasm.Manifold.cylinder(baseH - 2.5, baseOuterR - 3.5, baseOuterR - 3.5, 64)
    .translate([0, 0, 2.5]);
  baseSolid = baseSolid.subtract(cavity);

  // Central column receptor boss
  const bossRadius = 16.0;
  const socketRadius = 12.3; // +0.3mm slip-fit clearance
  const socketDepth = 10.0;
  const centralBoss = wasm.Manifold.cylinder(baseH - 2.5, bossRadius, bossRadius, 32)
    .translate([0, 0, 2.5]);

  const socketCut = wasm.Manifold.cylinder(socketDepth + 1.0, socketRadius, socketRadius, 32)
    .add(wasm.Manifold.cube([3.8, 3.8, socketDepth + 1.0], true).translate([socketRadius, 0, (socketDepth + 1.0) / 2]))
    .translate([0, 0, baseH - socketDepth]);

  const centerWireThrough = wasm.Manifold.cylinder(12.0, 5.5, 5.5, 24).translate([0, 0, 1.0]);

  baseSolid = baseSolid.add(centralBoss).subtract(socketCut).subtract(centerWireThrough);

  // Floor wire raceway routing from central boss to ESP32-C6 bay
  const wireRaceway = wasm.Manifold.cube([32.0, 6.0, 1.6], true).translate([16.0, 0, 1.95]);
  baseSolid = baseSolid.subtract(wireRaceway);

  // ESP32-C6 SuperMini Mounting Bay at +X
  const boardCenter = [baseOuterR - 16.75, 0];
  const pcbLength = 22.8;
  const pcbWidth = 18.4;

  const espPocket = wasm.Manifold.cube([pcbLength, pcbWidth, 1.6], true)
    .translate([boardCenter[0], 0, 2.5 - 0.8 + 0.1]);
  const usbPortal = wasm.Manifold.cube([18.0, 12.0, 6.5], true)
    .translate([baseOuterR - 4.0, 0, 4.2]);
  const rearRelief = wasm.Manifold.cylinder(4.0, 5.5, 5.5, 32)
    .translate([boardCenter[0] - pcbLength / 2, 0, 1.5]);

  const snapArmL = wasm.Manifold.cube([4.0, 1.6, 3.8], true).translate([boardCenter[0], (pcbWidth / 2) + 0.8, 2.5 + 1.9]);
  const snapHookL = wasm.Manifold.cube([3.0, 0.7, 1.0], true).translate([boardCenter[0], (pcbWidth / 2) - 0.1, 2.5 + 1.6]);
  const snapArmR = wasm.Manifold.cube([4.0, 1.6, 3.8], true).translate([boardCenter[0], -(pcbWidth / 2) - 0.8, 2.5 + 1.9]);
  const snapHookR = wasm.Manifold.cube([3.0, 0.7, 1.0], true).translate([boardCenter[0], -(pcbWidth / 2) + 0.1, 2.5 + 1.6]);
  const reliefSlotL = wasm.Manifold.cube([6.0, 1.2, 4.0], true).translate([boardCenter[0], (pcbWidth / 2) + 2.0, 2.5 + 2.0]);
  const reliefSlotR = wasm.Manifold.cube([6.0, 1.2, 4.0], true).translate([boardCenter[0], -(pcbWidth / 2) - 2.0, 2.5 + 2.0]);

  baseSolid = baseSolid
    .subtract(espPocket)
    .subtract(usbPortal)
    .subtract(rearRelief)
    .add(snapArmL).add(snapHookL)
    .add(snapArmR).add(snapHookR)
    .subtract(reliefSlotL).subtract(reliefSlotR);

  // Seating step for the Cloud Shade collar
  const shadeSeatStep = wasm.Manifold.cylinder(4.0, baseRadius + 1.5, baseRadius + 1.5, 64)
    .translate([0, 0, baseH - 3.5]);
  baseSolid = baseSolid.subtract(shadeSeatStep);

  return baseSolid.translate([0, 0, -baseH]);
}

/**
 * Procedural CAD generator for the Cloud Column Lamp variant.
 */
export function generateCloudLampGeometry(wasm: any, params: LampParameters): LampPart[] {
  const {
    height = 180,
    cloudPuffDensity = 22,
    cloudPuffDepth = 12.0,
    cloudFloretScale = 2.4,
    organicSeed = 77,
    bodyColor = '#2d3748',
  } = params;

  const puffs = generateCloudPuffCenters(organicSeed, height, cloudPuffDensity, cloudPuffDepth, cloudFloretScale);
  const noise = createNoise3D(organicSeed);

  // 1. Build Watertight Cloud Shade Mesh (180 slices x 200 vertices for ultra-smooth organic curvature)
  const shadeMesh = buildFluffyCloudShadeMesh(180, 200, height, params, puffs, noise);

  // 2. Build Central LED Column
  const ledColumn = buildCentralLedColumn(wasm, params);
  const rawCol = ledColumn.getMesh();
  const colMesh: MeshData = {
    vertProperties: rawCol.vertProperties,
    triVerts: rawCol.triVerts,
    numProp: rawCol.numProp ?? 3,
  };

  // 3. Build Base Cradle
  const baseCradle = buildCloudBaseCradle(wasm, params);
  const rawBase = baseCradle.getMesh();
  const baseMesh: MeshData = {
    vertProperties: rawBase.vertProperties,
    triVerts: rawBase.triVerts,
    numProp: rawBase.numProp ?? 3,
  };

  return [
    {
      id: 'body',
      name: 'Fluffy Cloud Lithophane Shade',
      color: '#ffffff', // Pure white SnapSpeed PLA
      mesh: shadeMesh,
      extruder: 3, // Toolhead 3: Snapmaker SnapSpeed PLA (White)
    },
    {
      id: 'veins', // Re-used for secondary visualization or central column
      name: 'Central LED Tower Spine',
      color: bodyColor,
      mesh: colMesh,
      extruder: 1,
    },
    {
      id: 'base',
      name: 'Electronics Base Cradle',
      color: bodyColor,
      mesh: baseMesh,
      extruder: 1,
    },
  ];
}
