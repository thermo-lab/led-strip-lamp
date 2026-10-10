import type { LampParameters, LampPart, MeshData } from '../types';
import { createNoise3D } from './organicField';

export interface CloudPuff {
  u: number;
  z: number;
  th: number;
  amp: number;
  rCirc: number;
  rZ: number;
}

/**
 * Precomputes procedural cumulus cloud puff clusters.
 * Each puff is an organic 3D rounded bubble dome with position (u_k, th_k),
 * radius, and bulge amplitude.
 */
export function generateCloudPuffCenters(
  seed = 42,
  height = 175,
  puffCount = 36,
  puffDepth = 8.5
): CloudPuff[] {
  let s = Math.abs(seed) % 2147483647;
  if (s === 0) s = 1;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };

  const puffs: CloudPuff[] = [];
  const phi = (Math.sqrt(5) - 1) / 2; // Fibonacci golden ratio spiral (~0.6180339887)

  // 1. Primary macro cumulus billows distributed uniformly around 360 degrees
  for (let i = 0; i < puffCount; i++) {
    const uNorm = 0.08 + (i / (puffCount - 1)) * 0.84;
    const uJitter = (rand() - 0.5) * 0.03;
    const u = Math.min(0.94, Math.max(0.07, uNorm + uJitter));

    // Fibonacci spiral ensures uniform 360 deg coverage with zero dead zones
    const th = (i * phi * 2 * Math.PI) % (2 * Math.PI);

    const isMajor = (i % 3 === 0);
    const ampScale = puffDepth / 8.5;
    const amp = (isMajor ? (8.0 + rand() * 4.0) : (5.0 + rand() * 3.5)) * ampScale;
    const rCirc = isMajor ? (24.0 + rand() * 6.0) : (16.0 + rand() * 5.0);
    const rZ = isMajor ? (19.0 + rand() * 5.0) : (13.0 + rand() * 4.0);

    const primaryPuff: CloudPuff = {
      u,
      z: u * height,
      th: (th + 2 * Math.PI) % (2 * Math.PI),
      amp,
      rCirc,
      rZ,
    };
    puffs.push(primaryPuff);

    // 2. Clustered daughter sub-puffs around each primary puff (fractal cumulus cauliflower lobes)
    const daughterCount = isMajor ? 3 : 2;
    for (let d = 0; d < daughterCount; d++) {
      const dAngle = (d / daughterCount) * 2 * Math.PI + rand() * 0.5;
      const dOffsetR = 0.65 * rCirc;
      const dTh = primaryPuff.th + (Math.cos(dAngle) * dOffsetR) / 45.0;
      const dZ = primaryPuff.z + Math.sin(dAngle) * (0.65 * rZ);
      const du = dZ / height;

      if (du >= 0.06 && du <= 0.95) {
        puffs.push({
          u: du,
          z: dZ,
          th: (dTh + 4 * Math.PI) % (2 * Math.PI),
          amp: amp * (0.42 + rand() * 0.22),
          rCirc: rCirc * (0.48 + rand() * 0.15),
          rZ: rZ * (0.48 + rand() * 0.15),
        });
      }
    }
  }

  return puffs;
}

/**
 * Evaluates the fluffy cloud radius and lithophane wall thickness at height u and azimuth th.
 * Features:
 * - Multi-scale cumulus billows + fractal cauliflower daughter lobes
 * - Truly isotropic 3D millimetre physical fractal noise (no directional stretching)
 * - Distinct Rim Lighting (silver lining halo at clump edges)
 */
export function evalFluffyCloudField(
  u: number,
  th: number,
  params: LampParameters,
  puffs: CloudPuff[],
  noise: (x: number, y: number, z: number) => number
): { rOuter: number; rInner: number; thickness: number; totalPuffBulge: number; maxRimHalo: number } {
  const {
    height = 175,
    baseRadius = 45,
    topRadius = 38,
    waistRatio = 0.92,
    cloudMinThickness = 0.95,
    cloudMaxThickness = 4.8,
    cloudTurbulence = 1.3,
    cloudRimLighting = 1.6,
  } = params;

  // Base silhouette
  const rNom = (1 - u) * baseRadius + u * topRadius + 4 * u * (1 - u) * ((waistRatio - 1) * (baseRadius + topRadius) * 0.5);

  // Transition zones at very bottom and top to ensure a clean, sturdy seating collar
  const rimEaseBottom = Math.min(1.0, Math.max(0.0, (u - 0.035) / 0.045));
  const rimEaseTop = Math.min(1.0, Math.max(0.0, (0.97 - u) / 0.04));
  const rimEase = rimEaseBottom * rimEaseTop;

  const z = u * height;

  let totalPuffBulge = 0;
  let maxRimHalo = 0;

  for (const puff of puffs) {
    let dTh = Math.abs(th - puff.th);
    if (dTh > Math.PI) dTh = 2 * Math.PI - dTh;
    const arcDist = dTh * rNom;

    const dz = z - puff.z;
    // Stretch downward overhang slope so draft angle <= 42 deg from vertical (100% support-free FDM printable)
    const effectiveRz = dz < 0 ? puff.rZ * 1.25 : puff.rZ;

    const normDistSq = (arcDist * arcDist) / (puff.rCirc * puff.rCirc) + (dz * dz) / (effectiveRz * effectiveRz);

    if (normDistSq < 1.0) {
      const d = Math.sqrt(normDistSq);
      // C2 continuous smooth hemispherical dome profile: (1 - d^2)^2
      const domeProfile = Math.pow(1.0 - normDistSq, 2.0);
      totalPuffBulge += puff.amp * domeProfile;

      // RIM LIGHTING HALO:
      // In backlit clouds, the wispy outer perimeter/flank of the clump glows with a silver lining.
      // Gaussian halo peaked right at d = 0.72 (the outer contour of the clump)
      const rimPeak = 0.72;
      const rimWidth = 0.15;
      const halo = Math.exp(-Math.pow(d - rimPeak, 2.0) / (2.0 * rimWidth * rimWidth));
      if (halo > maxRimHalo) {
        maxRimHalo = halo;
      }
    }
  }

  // Truly ISOTROPIC 3D millimetre physical coordinates for noise:
  // Eliminates all vertical/azimuthal stretching artifacts!
  const xMm = rNom * Math.cos(th);
  const yMm = rNom * Math.sin(th);
  const zMm = z;

  // Domain warping for organic fluid curl advection
  const curlX = noise(xMm * 0.035, yMm * 0.035, zMm * 0.035);
  const curlY = noise(xMm * 0.035 + 12.3, yMm * 0.035 + 34.5, zMm * 0.035 + 56.7);
  const curlZ = noise(xMm * 0.035 + 78.9, yMm * 0.035 + 23.4, zMm * 0.035 + 89.1);

  const wx = xMm + curlX * 5.0;
  const wy = yMm + curlY * 5.0;
  const wz = zMm + curlZ * 5.0;

  // Octave 1: Macro swells (wavelength ~25mm)
  const n1 = noise(wx * 0.040, wy * 0.040, wz * 0.040);
  // Octave 2: Ridged billow crests (wavelength ~11mm)
  const n2Raw = noise(wx * 0.090 + 4.1, wy * 0.090 + 8.2, wz * 0.090 + 1.5);
  const n2Ridged = 1.0 - 2.0 * Math.abs(n2Raw);
  // Octave 3: High-frequency cotton fluff (wavelength ~5mm)
  const n3 = noise(wx * 0.200 + 7.3, wy * 0.200 + 2.7, wz * 0.200 + 9.8);
  // Octave 4: Micro vapor texture (wavelength ~2.5mm)
  const n4 = noise(wx * 0.400 + 3.9, wy * 0.400 + 6.1, wz * 0.400 + 4.4);

  const textureFractal = (n1 * 0.40 + n2Ridged * 0.35 + n3 * 0.18 + n4 * 0.07) * (cloudTurbulence ?? 1.3);

  // Outer radius with rich, isotropic cumulus texture
  const rOuter = rNom + (totalPuffBulge + textureFractal * 1.6) * rimEase;

  // LITHOPHANE WALL THICKNESS MODULATION WITH RIM LIGHTING:
  // 1. Deep valleys/crevices between clumps: thick wall (cloudMaxThickness, ~4.8mm) -> deep, soft cloud shadows!
  // 2. Clump body interior: moderate thickness (~2.6mm) -> warm soft internal glow
  // 3. Clump RIM / PERIMETER: thin wall (~0.95mm - 1.1mm) -> BRILLIANT GLOWING SILVER LINING!
  const puffDensityFactor = Math.min(1.0, Math.max(0.0, totalPuffBulge / 16.0));
  let thickness = cloudMaxThickness - puffDensityFactor * (cloudMaxThickness - 2.6);

  // Apply Rim Lighting Thinning:
  // At the perimeter of the cloud clumps (maxRimHalo -> 1), aggressively thin the wall!
  const rimThinning = (cloudRimLighting ?? 1.6) * maxRimHalo * 1.65;
  thickness -= rimThinning;

  // Modulate micro-texture ridges into thickness so fine billows also catch rim highlights
  thickness -= (n2Ridged * 0.22 + n3 * 0.12);

  // Clamp safely to printability bounds:
  // Minimum cloudMinThickness (~0.95mm for solid 3-4 perimeter strength on FDM)
  // Maximum cloudMaxThickness
  thickness = Math.max(cloudMinThickness, Math.min(cloudMaxThickness, thickness));

  // Bottom collar is solidly structural for seating in the base cradle
  if (u < 0.05) {
    thickness = 3.2;
  }

  const rInner = rOuter - thickness;

  return { rOuter, rInner, thickness, totalPuffBulge, maxRimHalo };
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
    height = 175,
    cloudPuffDensity = 36,
    cloudPuffDepth = 8.5,
    organicSeed = 42,
    bodyColor = '#2d3748',
  } = params;

  const puffs = generateCloudPuffCenters(organicSeed, height, cloudPuffDensity, cloudPuffDepth);
  const noise = createNoise3D(organicSeed);

  // 1. Build Watertight Cloud Shade Mesh (160 slices x 180 vertices for fine texture resolution)
  const shadeMesh = buildFluffyCloudShadeMesh(160, 180, height, params, puffs, noise);

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
