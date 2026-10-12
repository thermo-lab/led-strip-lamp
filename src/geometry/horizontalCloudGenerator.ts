import type { LampParameters, LampPart, MeshData } from '../types';
import { createNoise3D } from './organicField';

export interface HorizontalCloudPuff {
  level: number;
  bankId: number;
  x: number;
  y: number;
  z: number;
  r: number;
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
 * Generates true 3D isotropic spheres for the horizontal cloud bank.
 * Based on the Clip Studio drawing guide:
 * "To paint some fluffy clouds, I use a cluster of spheres for guide."
 * - Lower overlapping baseline billows along the plinth
 * - Mid-tier convective bulging billows popping forward toward the viewer
 * - High-crest skyline towers forming the iconic cumulus silhouette
 * - Cauliflower companion child florets nestled in crevice saddles
 * - Trailing satellite puffs on the flank
 *
 * Every puff is a TRUE 3D SPHERE with scalar radius r (rX = rY = rZ = r).
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

  // Mirroring orientation so trailing satellites are placed on one flank
  const flipX = rand() > 0.5 ? 1 : -1;

  const puffs: HorizontalCloudPuff[] = [];

  // 1. Lower Baseline Front & Rear Billows (overlapping spheres spanning the plinth)
  const baseSlots = [-0.34, -0.17, 0.0, 0.17, 0.34];
  for (let i = 0; i < baseSlots.length; i++) {
    const x = baseSlots[i] * width + (rand() - 0.5) * 8.0;
    const yFront = (0.22 + rand() * 0.05) * depth;
    const z = height * (0.17 + rand() * 0.04);
    const r = (22.0 + rand() * 4.0) * (0.9 + 0.1 * ampScale);

    // Front billow
    puffs.push({
      level: 1,
      bankId: i % 4,
      x: x * flipX,
      y: yFront,
      z,
      r,
      amp: r,
      rX: r,
      rY: r,
      rZ: r,
      haloWeight: 0.9,
    });

    // Rear billow
    puffs.push({
      level: 1,
      bankId: i % 4,
      x: x * flipX,
      y: -yFront * (0.92 + rand() * 0.08),
      z,
      r: r * 0.94,
      amp: r * 0.94,
      rX: r * 0.94,
      rY: r * 0.94,
      rZ: r * 0.94,
      haloWeight: 0.8,
    });
  }

  // 2. Foreground Bulging Mid-Tier Billows (popping out forward toward viewer)
  const midSlots = [-0.23, -0.02, 0.19];
  for (let i = 0; i < midSlots.length; i++) {
    const x = midSlots[i] * width + (rand() - 0.5) * 8.0;
    const yFront = (0.27 + rand() * 0.05) * depth;
    const z = height * (0.37 + rand() * 0.06);
    const r = 23.0 + rand() * 4.0;

    puffs.push({
      level: 1,
      bankId: i % 4,
      x: x * flipX,
      y: yFront,
      z,
      r,
      amp: r,
      rX: r,
      rY: r,
      rZ: r,
      haloWeight: 0.95,
    });

    puffs.push({
      level: 1,
      bankId: i % 4,
      x: x * flipX,
      y: -yFront * 0.90,
      z,
      r: r * 0.92,
      amp: r * 0.92,
      rX: r * 0.92,
      rY: r * 0.92,
      rZ: r * 0.92,
      haloWeight: 0.85,
    });
  }

  // 3. Skyline Crest Summits (The iconic cumulus towers)
  const summitChoice = rand() > 0.5 ? 1 : 2;
  const crestSlots = [
    { slot: -0.27 + (rand() - 0.5) * 0.04, zRatio: 0.50 + rand() * 0.06, r: 26 + rand() * 3, id: 0 },
    { slot: -0.08 + (rand() - 0.5) * 0.04, zRatio: summitChoice === 1 ? 0.68 : 0.58, r: 34 + rand() * 4, id: 1 },
    { slot:  0.13 + (rand() - 0.5) * 0.04, zRatio: summitChoice === 2 ? 0.66 : 0.56, r: 30 + rand() * 3, id: 2 },
    { slot:  0.30 + (rand() - 0.5) * 0.04, zRatio: 0.44 + rand() * 0.06, r: 23 + rand() * 3, id: 3 },
  ];

  for (const c of crestSlots) {
    const x = c.slot * width;
    const z = height * c.zRatio;
    puffs.push({
      level: 0,
      bankId: c.id,
      x: x * flipX,
      y: (rand() - 0.5) * 6.0,
      z,
      r: c.r,
      amp: c.r,
      rX: c.r,
      rY: c.r,
      rZ: c.r,
      haloWeight: 1.0,
    });

    // Companion cauliflower child florets on the tower crest slopes
    for (let k = 0; k < 2; k++) {
      const angle = (k === 0 ? -0.45 : 0.45) * Math.PI;
      const childR = c.r * (0.50 + (floretScale / 12.0));
      puffs.push({
        level: 2,
        bankId: c.id,
        x: (x + Math.sin(angle) * (c.r * 0.55)) * flipX,
        y: (0.10 + rand() * 0.06) * depth * (k === 0 ? 1 : -1),
        z: z * 0.88 + (rand() - 0.5) * 4.0,
        r: childR,
        amp: childR,
        rX: childR,
        rY: childR,
        rZ: childR,
        haloWeight: 0.85,
      });
    }
  }

  // 4. Trailing Satellite Puffs on Flank (Matching Clip Studio guide)
  const flankSign = flipX;
  const satDefs = [
    { xRatio: 0.42, zRatio: 0.24, baseR: 13.5 },
    { xRatio: 0.47, zRatio: 0.16, baseR: 9.5 },
    { xRatio: 0.51, zRatio: 0.11, baseR: 6.5 },
  ];

  for (let s = 0; s < satDefs.length; s++) {
    const sd = satDefs[s];
    const r = sd.baseR + rand() * 1.5;
    puffs.push({
      level: 2,
      bankId: 3,
      x: sd.xRatio * width * flankSign,
      y: (0.08 - s * 0.03 + rand() * 0.03) * depth,
      z: height * sd.zRatio,
      r,
      amp: r,
      rX: r,
      rY: r,
      rZ: r,
      haloWeight: 0.8 - s * 0.1,
    });
  }

  return puffs;
}

/**
 * Evaluates the cloud field thickness for Three.js viewer color shading.
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

  const aCollar = width * 0.46;
  const bCollar = depth * 0.46;
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

  // Find nearest sphere and crevice proximity
  let d1 = 999.0;
  let d2 = 999.0;
  let maxRimHalo = 0.0;

  for (const puff of puffs) {
    const dx = x0 - puff.x;
    const dy = y0 - puff.y;
    const dz = z - puff.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const dSphere = Math.abs(dist - puff.r);

    if (dSphere < d1) {
      d2 = d1;
      d1 = dSphere;
    } else if (dSphere < d2) {
      d2 = dSphere;
    }

    const normDist = dist / puff.r;
    if (normDist < 1.0) {
      const rimPeak = 0.76;
      const rimWidth = 0.18;
      const halo = Math.exp(-Math.pow(normDist - rimPeak, 2.0) / (2.0 * rimWidth * rimWidth)) * (puff.haloWeight || 0.8);
      if (halo > maxRimHalo) maxRimHalo = halo;
    }
  }

  // Crevice thinning between overlapping spheres
  const crevice = Math.exp(-Math.pow(d2 - d1, 2.0) / (2.0 * 5.0 * 5.0));
  let localT = tMax - crevice * (tMax - tMin) * 0.55 * rimLighting;
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
 * Builds the complete watertight 2-manifold hollow cloud shade in Manifold.
 * - Every puff is a true 3D mathematical isotropic sphere (rX = rY = rZ = r)
 * - Unions outer spheres
 * - Unions inner lithophane cavity spheres + central mandrel track clearance
 * - Adds 4.5mm base pocket skirt fitting flush into desktop plinth
 * - Warps outer surface with multi-scale cauliflower noise
 */
function buildCompleteCloudShadeManifold(wasm: any, params: LampParameters, puffs: HorizontalCloudPuff[]): MeshData {
  const seed = params.organicSeed ?? 77;
  const wallThickness = (params.cloudMinThickness ?? 0.9) + 1.3; // ~2.2mm nominal lithophane thickness

  const outerObjs: any[] = [];
  const innerObjs: any[] = [];

  for (const s of puffs) {
    const segs = s.r > 22 ? 52 : 36;
    const sphOuter = wasm.Manifold.sphere(s.r, segs).translate([s.x, s.y, s.z]);
    outerObjs.push(sphOuter);

    const rIn = s.r - wallThickness;
    if (rIn > 3.0) {
      const sphInner = wasm.Manifold.sphere(rIn, Math.max(20, segs - 16)).translate([s.x, s.y, s.z]);
      innerObjs.push(sphInner);
    }
  }

  // 4.5mm base pocket skirt fitting inside the plinth pocket
  const baseSkirtOuter = wasm.Manifold.cylinder(4.5, 98, 98, 64)
    .scale([1.0, 36.0 / 98.0, 1.0])
    .translate([0, 0, 0]);
  outerObjs.push(baseSkirtOuter);

  const outerSolid = wasm.Manifold.union(outerObjs);
  const innerSolid = wasm.Manifold.union(innerObjs);

  // Mandrel cavity clearing the central LED reflector track
  const mandrelPocket = wasm.Manifold.cylinder(75, 85, 85, 48)
    .scale([1.0, 16.0 / 85.0, 1.0])
    .translate([0, 0, 0]);

  const fullInnerCavity = wasm.Manifold.union([innerSolid, mandrelPocket]);

  let hollowCloud = outerSolid.subtract(fullInnerCavity);

  // Multi-scale cauliflower floret micro-tooth warp
  const noise = createNoise3D(seed);
  hollowCloud = hollowCloud.warp((vert: any) => {
    const x = vert[0], y = vert[1], z = vert[2];
    if (z > 4.5) {
      const ease = Math.min(1.0, (z - 4.5) / 8.0);
      const flowScale = 0.035;
      const n = (
        noise(x * flowScale + 12.3, y * flowScale + 55.7, z * flowScale + 31.9) * 1.3 +
        noise(x * 0.10 + 42.1, y * 0.10 + 88.3, z * 0.10 + 17.5) * 0.75 +
        noise(x * 0.25 + 61.3, y * 0.25 + 19.8, z * 0.25 + 84.2) * 0.38
      ) * ease;

      const len = Math.sqrt(x * x + y * y + (z - 20) * (z - 20));
      if (len > 0.001) {
        vert[0] += (x / len) * n;
        vert[1] += (y / len) * n;
        vert[2] += ((z - 20) / len) * n;
      }
    }
  });

  const mesh = hollowCloud.getMesh();
  return {
    vertProperties: mesh.vertProperties,
    triVerts: mesh.triVerts,
    numProp: mesh.numProp ?? 3,
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

  // Lift plinth so top surface sits at Z = 0
  plinthBase = plinthBase.translate([0, 0, -plinthH / 2]);

  // Recessed seating collar pocket (depth: 4.5mm)
  const pocketCyl = wasm.Manifold.cylinder(6.0, 1.0, 1.0, 64, true)
    .scale([aCollar + 0.35, bCollar + 0.35, 1.0])
    .translate([0, 0, -2.25]);

  plinthBase = plinthBase.subtract(pocketCyl);

  // Central light well aperture: lets uplight bounce into cloud canopy
  const lightAperture = wasm.Manifold.cube([width - 40.0, 28.0, 16.0], true)
    .translate([0, 0, -7.0]);
  plinthBase = plinthBase.subtract(lightAperture);

  // ESP32 Electronics Pocket in base plinth underside
  const pcbLength = 52.0;
  const pcbWidth = 22.0;
  const espBay = wasm.Manifold.cube([pcbLength + 4.0, pcbWidth + 4.0, 14.0], true)
    .translate([0, 0, -plinthH + 7.0]);
  plinthBase = plinthBase.subtract(espBay);

  // USB-C Portal on rear wall of plinth
  const usbCutout = wasm.Manifold.cube([12.5, 24.0, 6.5], true)
    .translate([0, -plinthD / 2 + 10.0, -plinthH + 7.0]);
  plinthBase = plinthBase.subtract(usbCutout);

  // 2. Linear LED Reflector Mandrel (`veins`)
  const trackW = width - 48.0;
  const trackD = 22.0;
  const trackH = 14.0;

  let reflectorTrack = wasm.Manifold.cube([trackW, trackD, trackH], true)
    .translate([0, 0, trackH / 2]);

  // LED Strip channel: 10.6mm wide, 2.5mm deep
  const stripBed = wasm.Manifold.cube([trackW - 6.0, 10.6, 2.5], true)
    .translate([0, 0, trackH - 1.25]);
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

  const cloudMesh = buildCompleteCloudShadeManifold(wasm, params, puffs);

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
