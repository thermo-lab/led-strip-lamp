import type { LampParameters, LampPart, MeshData } from '../types';

/**
 * Procedural CAD generator for the dual-material LED lamp using Manifold-3D WASM.
 */
export function generateLampGeometry(wasm: any, params: LampParameters): LampPart[] {
  const {
    height,
    baseRadius,
    topRadius,
    waistRatio,
    wallThickness,
    twistAngle,
    fluteCount,
    fluteDepth,
    veinCount,
    veinWidth,
    veinSwirl,
    waveAmplitude,
    waveFrequency,
    veinRelief,
    diffuserThickness,
    bodyColor,
    diffuserColor,
  } = params;

  const nSlices = 24;
  const dz = height / nSlices;
  const twistRad = (twistAngle * Math.PI) / 180;
  const swirlRad = veinSwirl * 2 * Math.PI;

  const outerSlices: any[] = [];
  const innerSlices: any[] = [];
  const veinDiffuserSlices: any[] = [];
  const stripTrackSlices: any[] = [];

  const nPts = 48; // Resolution around perimeter

  // Helper to calculate nominal radius at relative height u
  const getRNom = (u: number): number => {
    return (1 - u) * baseRadius + u * topRadius + 4 * u * (1 - u) * ((waistRatio - 1) * (baseRadius + topRadius) * 0.5);
  };

  const avgR = (baseRadius + topRadius) / 2;
  const dThVein = veinWidth / avgR;
  const dThStrip = 10.6 / avgR;

  for (let s = 0; s < nSlices; s++) {
    const u0 = s / nSlices;
    const u1 = (s + 1) / nSlices;
    const z0 = s * dz;

    const rNom0 = getRNom(u0);
    const rNom1 = getRNom(u1);
    const scale = rNom1 / rNom0;

    const twistSliceDeg = (twistAngle / nSlices);

    // 1. Build Outer Polygon (with continuous twisted fluting)
    const polyOuter: [number, number][] = [];
    for (let i = 0; i < nPts; i++) {
      const th = (i / nPts) * 2 * Math.PI;
      const thFlute = th - u0 * twistRad;
      const fluting = fluteCount > 0 ? fluteDepth * Math.cos(fluteCount * thFlute) : 0;
      const r = Math.max(15, rNom0 + fluting);
      polyOuter.push([r * Math.cos(th), r * Math.sin(th)]);
    }
    const csOuter = wasm.CrossSection.ofPolygons([polyOuter]);
    outerSlices.push(wasm.Manifold.extrude(csOuter, dz + 0.05, 1, twistSliceDeg, [scale, scale]).translate([0, 0, z0]));

    // 2. Build Inner Core Bore (Hollow Center for human assembly access)
    const rCore0 = Math.max(18, rNom0 - wallThickness);
    const rCore1 = Math.max(18, rNom1 - wallThickness);
    const scaleCore = rCore1 / rCore0;
    const polyCore: [number, number][] = [];
    for (let i = 0; i < nPts; i++) {
      const th = (i / nPts) * 2 * Math.PI;
      polyCore.push([rCore0 * Math.cos(th), rCore0 * Math.sin(th)]);
    }
    const csCore = wasm.CrossSection.ofPolygons([polyCore]);
    innerSlices.push(wasm.Manifold.extrude(csCore, dz + 0.1, 1, twistSliceDeg, [scaleCore, scaleCore]).translate([0, 0, z0 - 0.05]));

    // 3. Build Curved Veins & Strip Tracks
    for (let v = 0; v < veinCount; v++) {
      const baseTh = (v / veinCount) * 2 * Math.PI;

      // Vein angle at bottom and top of this slice
      const th0 = baseTh + u0 * twistRad + u0 * swirlRad + (waveAmplitude / avgR) * Math.sin(2 * Math.PI * waveFrequency * u0);
      const th1 = baseTh + u1 * twistRad + u1 * swirlRad + (waveAmplitude / avgR) * Math.sin(2 * Math.PI * waveFrequency * u1);
      const sliceTwistDeg = ((th1 - th0) * 180) / Math.PI;

      // Diffuser front radius adjustment based on relief
      let rFront = rNom0;
      if (veinRelief === 'recessed') rFront -= 1.2;
      else if (veinRelief === 'proud') rFront += 1.2;

      const rDiffuserBack = rNom0 - diffuserThickness;

      // Diffuser cross-section polygon (White PLA light window)
      const pDiffuser: [number, number][] = [
        [rDiffuserBack * Math.cos(th0 - dThVein / 2), rDiffuserBack * Math.sin(th0 - dThVein / 2)],
        [(rFront + 1.5) * Math.cos(th0 - dThVein / 2), (rFront + 1.5) * Math.sin(th0 - dThVein / 2)],
        [(rFront + 1.5) * Math.cos(th0 + dThVein / 2), (rFront + 1.5) * Math.sin(th0 + dThVein / 2)],
        [rDiffuserBack * Math.cos(th0 + dThVein / 2), rDiffuserBack * Math.sin(th0 + dThVein / 2)],
      ];
      const csDiff = wasm.CrossSection.ofPolygons([pDiffuser]);
      veinDiffuserSlices.push(wasm.Manifold.extrude(csDiff, dz + 0.05, 1, sliceTwistDeg, [scale, scale]).translate([0, 0, z0]));

      // 4. Strip Track Cavity (Behind diffuser, open to the hollow core)
      // Standard WS2812B width is 10mm; slot is 10.6mm wide
      const rTrackBack = rCore0 - 1.0; // Overlaps into hollow core so rear is open for strip insertion!
      const pTrack: [number, number][] = [
        [rTrackBack * Math.cos(th0 - dThStrip / 2), rTrackBack * Math.sin(th0 - dThStrip / 2)],
        [rDiffuserBack * Math.cos(th0 - dThStrip / 2), rDiffuserBack * Math.sin(th0 - dThStrip / 2)],
        [rDiffuserBack * Math.cos(th0 + dThStrip / 2), rDiffuserBack * Math.sin(th0 + dThStrip / 2)],
        [rTrackBack * Math.cos(th0 + dThStrip / 2), rTrackBack * Math.sin(th0 + dThStrip / 2)],
      ];
      const csTrack = wasm.CrossSection.ofPolygons([pTrack]);
      stripTrackSlices.push(wasm.Manifold.extrude(csTrack, dz + 0.05, 1, sliceTwistDeg, [scale, scale]).translate([0, 0, z0]));
    }
  }

  // Union individual component stacks
  const fullOuterSolid = wasm.Manifold.union(outerSlices);
  const hollowCore = wasm.Manifold.union(innerSlices);
  const allDiffuserVolumes = wasm.Manifold.union(veinDiffuserSlices);
  const allStripTracks = wasm.Manifold.union(stripTrackSlices);

  // 1. Monolithic Translucent Diffusers: intersection with the outer envelope
  const diffuserVeins = allDiffuserVolumes.intersect(fullOuterSolid);

  // 2. Monolithic Opaque Body: Outer solid minus hollow core minus diffusers minus rear strip tracks
  let opaqueBody = fullOuterSolid
    .subtract(hollowCore)
    .subtract(allDiffuserVolumes)
    .subtract(allStripTracks);

  // Add 3 Twist-Lock Bayonet Lugs to bottom rim of monolithic body
  const nLugs = 3;
  const lugSolids: any[] = [];
  const lugH = 5.0;
  const lugThick = 2.5;
  for (let i = 0; i < nLugs; i++) {
    const th = (i / nLugs) * 2 * Math.PI;
    const rLugIn = baseRadius - wallThickness - 0.5;
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

  // 3. Electronics Base Cradle (Part 3)
  // Desk stand with ESP32-C6 SuperMini pocket and flush USB-C aperture
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
    .translate([0, 0, -baseH - 2.0]); // Offset slightly below lamp for visual clarity

  // Helper to extract clean Three.js-compatible mesh data from Manifold solid
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
      extruder: 1, // Toolhead 1 / Dark PLA
    },
    {
      id: 'veins',
      name: 'Translucent Light Veins',
      color: diffuserColor,
      mesh: toMeshData(diffuserVeins),
      extruder: 2, // Toolhead 2 (or 3) / White PLA
    },
    {
      id: 'base',
      name: 'Electronics Base Cradle',
      color: bodyColor,
      mesh: toMeshData(baseCradle),
      extruder: 1, // Toolhead 1 / Dark PLA
    },
  ];
}
