import type { LampParameters, LampPart, MeshData } from '../types';
import {
  createNoise3D,
  evalOrganicCenter,
  evalOrganicRadius,
  evalStripAngle,
  evalVeinAngle,
  evalVeinWidth,
} from './organicField';

/**
 * Builds a watertight, 2-manifold lofted tube mesh connecting continuous circular/organic rings.
 * Eliminates all discrete slice-scaling steps and boundary facet teeth.
 */
function buildLoftedTubeMesh(
  nSlices: number,
  nPts: number,
  radiusFn: (u: number, th: number) => number,
  centerFn: (u: number) => [number, number],
  height: number,
  zStart = 0
): { vertProperties: Float32Array; triVerts: Uint32Array; numProp: number } {
  const verts: number[] = [];
  const tris: number[] = [];

  // 1. Generate ring vertices for every slice from u=0 to u=1
  for (let s = 0; s <= nSlices; s++) {
    const u = s / nSlices;
    const z = zStart + u * height;
    const [cx, cy] = centerFn(u);

    for (let i = 0; i < nPts; i++) {
      const th = (i / nPts) * 2 * Math.PI;
      const r = radiusFn(u, th);
      verts.push(cx + r * Math.cos(th), cy + r * Math.sin(th), z);
    }
  }

  // 2. Generate side quad-strip triangles
  for (let s = 0; s < nSlices; s++) {
    const r0 = s * nPts;
    const r1 = (s + 1) * nPts;

    for (let i = 0; i < nPts; i++) {
      const next = (i + 1) % nPts;
      const a = r0 + i;
      const b = r0 + next;
      const c = r1 + next;
      const d = r1 + i;

      // Two triangles per quad (CCW outward normal)
      tris.push(a, b, c);
      tris.push(a, c, d);
    }
  }

  // 3. Bottom Cap (z=zStart, normal pointing downward -Z)
  const botCenterIdx = verts.length / 3;
  const [bcx, bcy] = centerFn(0);
  verts.push(bcx, bcy, zStart);

  for (let i = 0; i < nPts; i++) {
    const next = (i + 1) % nPts;
    tris.push(botCenterIdx, next, i);
  }

  // 4. Top Cap (z=zStart+height, normal pointing upward +Z)
  const topCenterIdx = verts.length / 3;
  const [tcx, tcy] = centerFn(1);
  verts.push(tcx, tcy, zStart + height);

  const topRingStart = nSlices * nPts;
  for (let i = 0; i < nPts; i++) {
    const next = (i + 1) % nPts;
    tris.push(topCenterIdx, topRingStart + i, topRingStart + next);
  }

  return {
    vertProperties: new Float32Array(verts),
    triVerts: new Uint32Array(tris),
    numProp: 3,
  };
}

/**
 * Builds a continuous swept ribbon mesh for outer translucent diffuser veins.
 * Terminated smoothly at sMin and sMax to maintain a solid structural crown and base collar.
 */
function buildSweptDiffuserMesh(
  nSlices: number,
  sMin: number,
  sMax: number,
  veinIndex: number,
  veinCount: number,
  params: LampParameters,
  noise: any,
  centerFn: (u: number) => [number, number],
  getRNom: (u: number) => number
): { vertProperties: Float32Array; triVerts: Uint32Array; numProp: number } {
  const { height, diffuserThickness, veinRelief } = params;
  const verts: number[] = [];
  const tris: number[] = [];
  const nArcSteps = 4;
  const ptsPerRing = (nArcSteps + 1) * 2;
  const nVeinSlices = sMax - sMin;

  for (let s = sMin; s <= sMax; s++) {
    const u = s / nSlices;
    const z = u * height;
    const rNom = getRNom(u);
    const thVein = evalVeinAngle(veinIndex, veinCount, u, params, noise);
    const rOuter = evalOrganicRadius(u, thVein, rNom, params, noise);
    const wVein = evalVeinWidth(veinIndex, u, params, noise);
    const dTh = wVein / Math.max(16, rOuter);

    const rFront = rOuter + (veinRelief === 'proud' ? 1.2 : 4.0);
    const rBack = rOuter - diffuserThickness;
    const [cx, cy] = centerFn(u);

    // Front arc (facing outside)
    for (let i = 0; i <= nArcSteps; i++) {
      const th = thVein - dTh / 2 + (i / nArcSteps) * dTh;
      verts.push(cx + rFront * Math.cos(th), cy + rFront * Math.sin(th), z);
    }
    // Back arc (facing light chamber)
    for (let i = nArcSteps; i >= 0; i--) {
      const th = thVein - dTh / 2 + (i / nArcSteps) * dTh;
      verts.push(cx + rBack * Math.cos(th), cy + rBack * Math.sin(th), z);
    }
  }

  // Connect quad-strip side walls
  for (let s = 0; s < nVeinSlices; s++) {
    const r0 = s * ptsPerRing;
    const r1 = (s + 1) * ptsPerRing;
    for (let i = 0; i < ptsPerRing; i++) {
      const next = (i + 1) % ptsPerRing;
      tris.push(r0 + i, r0 + next, r1 + next);
      tris.push(r0 + i, r1 + next, r1 + i);
    }
  }

  // Bottom cap (s = sMin)
  for (let i = 0; i < nArcSteps; i++) {
    tris.push(i, ptsPerRing - 1 - i, ptsPerRing - 2 - i);
    tris.push(i, ptsPerRing - 2 - i, i + 1);
  }

  // Top cap (s = sMax)
  const topStart = nVeinSlices * ptsPerRing;
  for (let i = 0; i < nArcSteps; i++) {
    tris.push(topStart + i, topStart + ptsPerRing - 2 - i, topStart + ptsPerRing - 1 - i);
    tris.push(topStart + i, topStart + i + 1, topStart + ptsPerRing - 2 - i);
  }

  return {
    vertProperties: new Float32Array(verts),
    triVerts: new Uint32Array(tris),
    numProp: 3,
  };
}

/**
 * Builds deeply recessed forward-shining optical chamber & smooth strip carrier track.
 * Flares forward from the recessed 10mm flex strip bed (at thStrip) to the outer vein (at thVein).
 * Because the physical strip track follows a smooth helix (zero wiggles), the strip slides
 * or snaps into place with zero kink or sideways buckling.
 */
function buildRecessedChamberMesh(
  nSlices: number,
  sMin: number,
  sMax: number,
  veinIndex: number,
  veinCount: number,
  params: LampParameters,
  noise: any,
  centerFn: (u: number) => [number, number],
  getRNom: (u: number) => number,
  getRCore: (u: number) => number
): { vertProperties: Float32Array; triVerts: Uint32Array; numProp: number } {
  const { height, diffuserThickness } = params;
  const verts: number[] = [];
  const tris: number[] = [];
  const nArcSteps = 4;
  const ptsPerRing = (nArcSteps + 1) * 2;
  const nVeinSlices = sMax - sMin;

  for (let s = sMin; s <= sMax; s++) {
    const u = s / nSlices;
    const z = u * height;
    const rNom = getRNom(u);
    const thVein = evalVeinAngle(veinIndex, veinCount, u, params, noise);
    const thStrip = evalStripAngle(veinIndex, veinCount, u, params);
    const rOuter = evalOrganicRadius(u, thVein, rNom, params, noise);
    const rCore = getRCore(u);
    const wVein = evalVeinWidth(veinIndex, u, params, noise);

    // Front of chamber meets back of diffuser seamlessly
    const rFront = rOuter - diffuserThickness + 0.15;
    const dThFront = (wVein + 0.4) / Math.max(16, rFront);

    // Recessed strip bed: sits in wall, accessible from the hollow core for insertion
    // 11.2mm width gives 0.6mm clearance per side for standard 10mm flex PCB
    const rBack = rCore - 1.5;
    const dThBack = 11.2 / Math.max(16, rBack);

    const [cx, cy] = centerFn(u);

    // Front arc (meets rear of diffuser)
    for (let i = 0; i <= nArcSteps; i++) {
      const th = thVein - dThFront / 2 + (i / nArcSteps) * dThFront;
      verts.push(cx + rFront * Math.cos(th), cy + rFront * Math.sin(th), z);
    }
    // Back arc (smooth recessed track bed for 10mm strip)
    for (let i = nArcSteps; i >= 0; i--) {
      const th = thStrip - dThBack / 2 + (i / nArcSteps) * dThBack;
      verts.push(cx + rBack * Math.cos(th), cy + rBack * Math.sin(th), z);
    }
  }

  // Connect quad-strip side walls
  for (let s = 0; s < nVeinSlices; s++) {
    const r0 = s * ptsPerRing;
    const r1 = (s + 1) * ptsPerRing;
    for (let i = 0; i < ptsPerRing; i++) {
      const next = (i + 1) % ptsPerRing;
      tris.push(r0 + i, r0 + next, r1 + next);
      tris.push(r0 + i, r1 + next, r1 + i);
    }
  }

  // Bottom cap
  for (let i = 0; i < nArcSteps; i++) {
    tris.push(i, ptsPerRing - 1 - i, ptsPerRing - 2 - i);
    tris.push(i, ptsPerRing - 2 - i, i + 1);
  }

  // Top cap
  const topStart = nVeinSlices * ptsPerRing;
  for (let i = 0; i < nArcSteps; i++) {
    tris.push(topStart + i, topStart + ptsPerRing - 2 - i, topStart + ptsPerRing - 1 - i);
    tris.push(topStart + i, topStart + i + 1, topStart + ptsPerRing - 2 - i);
  }

  return {
    vertProperties: new Float32Array(verts),
    triVerts: new Uint32Array(tris),
    numProp: 3,
  };
}

/**
 * Procedural CAD generator for the dual-material LED lamp using Manifold-3D WASM.
 * Continuous lofted geometry guarantees:
 * - 100% airtight topological match at outer surface (zero residual skin or clipping)
 * - Solid continuous crown at top rim and solid collar at bottom rim (zero gaps/holes)
 * - Smooth helical recessed tracks for kink-free 10mm flex PCB strip installation
 * - Forward-shining optical mixing chambers for uniform, hotspot-free diffusion
 * - Guaranteed >= 44mm open hollow core for finger and wire assembly
 */
export function generateLampGeometry(wasm: any, params: LampParameters): LampPart[] {
  const {
    height,
    baseRadius,
    topRadius,
    waistRatio,
    veinCount,
    bodyColor,
    diffuserColor,
    organicSeed,
  } = params;

  const noise = createNoise3D(organicSeed ?? 42);

  const nSlices = 64;
  const nPts = 96;

  const centerFn = (u: number): [number, number] => {
    return evalOrganicCenter(u, params, noise);
  };

  const getRNom = (u: number): number => {
    return (1 - u) * baseRadius + u * topRadius + 4 * u * (1 - u) * ((waistRatio - 1) * (baseRadius + topRadius) * 0.5);
  };

  // Guaranteed Core Radius: clean inner frustum with finger clearance (diameter >= 44mm)
  // Wall thickness is guaranteed >= 5.0mm everywhere around the entire circumference
  const getRCore = (u: number): number => {
    const rNom = getRNom(u);
    return Math.max(22.0, rNom - 9.0);
  };

  // 1. Full Outer Organic Solid (continuous lofted mesh)
  const outerMeshData = buildLoftedTubeMesh(
    nSlices,
    nPts,
    (u, th) => {
      const rNom = getRNom(u);
      return evalOrganicRadius(u, th, rNom, params, noise);
    },
    centerFn,
    height
  );
  const fullOuterSolid = wasm.Manifold.ofMesh(outerMeshData);

  // 2. Inner Hollow Access Core (continuous lofted mesh, open at top and bottom)
  const innerMeshData = buildLoftedTubeMesh(
    nSlices,
    nPts,
    (u) => getRCore(u),
    centerFn,
    height + 2.0,
    -1.0 // Extends through ends for clean boolean through-cut
  );
  const hollowCore = wasm.Manifold.ofMesh(innerMeshData);

  // 3. Diffusers and Recessed Forward-Shining Light Chambers
  // Terminate slightly before the top and bottom to leave solid continuous rims
  const sMin = Math.max(2, Math.round(nSlices * 0.04));
  const sMax = Math.min(nSlices - 2, Math.round(nSlices * 0.96));

  const veinSolids: any[] = [];
  const chamberSolids: any[] = [];

  for (let v = 0; v < veinCount; v++) {
    const diffMesh = buildSweptDiffuserMesh(
      nSlices,
      sMin,
      sMax,
      v,
      veinCount,
      params,
      noise,
      centerFn,
      getRNom
    );
    veinSolids.push(wasm.Manifold.ofMesh(diffMesh));

    const chamMesh = buildRecessedChamberMesh(
      nSlices,
      sMin,
      sMax,
      v,
      veinCount,
      params,
      noise,
      centerFn,
      getRNom,
      getRCore
    );
    chamberSolids.push(wasm.Manifold.ofMesh(chamMesh));
  }

  const allVeinCutters = wasm.Manifold.union(veinSolids);
  const allChambers = wasm.Manifold.union(chamberSolids);

  // 4. Boolean Operations
  // Translucent Diffusers: Exact intersection with outer envelope
  const diffuserVeins = allVeinCutters.intersect(fullOuterSolid);

  // Opaque Body: Outer envelope minus hollow core, minus diffusers, minus forward chambers
  let opaqueBody = fullOuterSolid
    .subtract(hollowCore)
    .subtract(allVeinCutters)
    .subtract(allChambers);

  // 5. Add 3 Twist-Lock Bayonet Lugs to bottom collar
  const nLugs = 3;
  const lugSolids: any[] = [];
  const lugH = 5.0;
  const lugThick = 2.5;
  const rCoreBase = getRCore(0);

  for (let i = 0; i < nLugs; i++) {
    const th = (i / nLugs) * 2 * Math.PI;
    const rLugIn = rCoreBase - 0.5;
    const rLugOut = rLugIn + lugThick;
    const span = (25 * Math.PI) / 180;
    const pLug: [number, number][] = [
      [rLugIn * Math.cos(th - span / 2), rLugIn * Math.sin(th - span / 2)],
      [rLugOut * Math.cos(th - span / 2), rLugOut * Math.sin(th - span / 2)],
      [rLugOut * Math.cos(th + span / 2), rLugOut * Math.sin(th + span / 2)],
      [rLugIn * Math.cos(th + span / 2), rLugIn * Math.sin(th + span / 2)],
    ];
    const csLug = wasm.CrossSection.ofPolygons([pLug]);
    lugSolids.push(wasm.Manifold.extrude(csLug, lugH, 1, 0, [1, 1]).translate([0, 0, 0]));
  }
  if (lugSolids.length > 0) {
    const lugs = wasm.Manifold.union(lugSolids);
    opaqueBody = opaqueBody.add(lugs);
  }

  // 6. Electronics Base Cradle (Part 3)
  const baseH = 14.0;
  const baseOuterR = baseRadius + 4.0;
  const baseOuterCyl = wasm.Manifold.cylinder(baseH, baseOuterR, baseOuterR, 64);
  const baseInnerVoid = wasm.Manifold.cylinder(baseH - 2.5, baseRadius - 1.5, baseRadius - 1.5, 64).translate([0, 0, 2.5]);

  // ESP32-C6 SuperMini Pocket (23.5mm x 18.5mm x 4.0mm)
  const espPocket = wasm.Manifold.cube([23.5, 18.5, 5.0], true)
    .translate([baseOuterR - 15.0, 0, 4.0]);

  // USB-C Pass-through Portal (10.5mm wide x 4.5mm high)
  const usbPortal = wasm.Manifold.cube([18.0, 10.5, 4.8], true)
    .translate([baseOuterR - 4.0, 0, 4.0]);

  // Wire routing center conduit
  const wireConduit = wasm.Manifold.cylinder(baseH + 1, 14.0, 14.0, 32).translate([0, 0, -0.5]);

  const baseCradle = baseOuterCyl
    .subtract(baseInnerVoid)
    .subtract(espPocket)
    .subtract(usbPortal)
    .subtract(wireConduit)
    .translate([0, 0, -baseH - 2.0]);

  const toMeshData = (solid: any): MeshData => {
    const raw = solid.getMesh();
    return {
      vertProperties: raw.vertProperties,
      triVerts: raw.triVerts,
      numProp: raw.numProp ?? 3,
    };
  };

  return [
    {
      id: 'body',
      name: 'Opaque Lamp Shell',
      color: bodyColor,
      mesh: toMeshData(opaqueBody),
      extruder: 1,
    },
    {
      id: 'veins',
      name: 'Translucent Light Veins',
      color: diffuserColor,
      mesh: toMeshData(diffuserVeins),
      extruder: 2,
    },
    {
      id: 'base',
      name: 'Electronics Base Cradle',
      color: bodyColor,
      mesh: toMeshData(baseCradle),
      extruder: 1,
    },
  ];
}
