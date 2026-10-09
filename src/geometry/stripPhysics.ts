import type { LampParameters } from '../types';

export interface PhysicalLEDPlacement {
  index: number;
  u: number;
  z: number;
  th: number;
  r: number;
  s: number; // Arc length along curve from start (mm)
}

export interface StripPhysicalMetrics {
  stripLengthMm: number;
  exactCutLengthMm: number;
  totalStripLengthMm: number;
  ledsPerVein: number;
  totalLeds: number;
  inPlaneStrainPct: number;
  minLateralRadiusMm: number;
  minNormalRadiusMm: number;
  stripFeasibility: 'optimal' | 'compliant' | 'buckling_risk';
  nominalCurrentAmps: number;
  maxCurrentAmps: number;
  maxPowerWatts: number;
  ledPositions: PhysicalLEDPlacement[];
  warnings: string[];
}

/**
 * Calculates physical developable ribbon mechanics for a standard WS2812B 5050 flex PCB strip:
 * - Width: 10.0 mm
 * - Pitch: 16.6667 mm (60 LEDs / meter)
 * - Minimum out-of-plane bend radius: 12.0 mm (weak axis)
 * - Critical in-plane lateral bend radius: 130.0 mm (strong axis / buckling threshold)
 *
 * Computes exact differential geometry (Frenet/Darboux frame, normal curvature kn,
 * geodesic curvature kg, in-plane strain delta_epsilon = w * kg).
 */
export function computeStripPhysicalMetrics(params: LampParameters): StripPhysicalMetrics {
  const {
    height,
    baseRadius,
    topRadius,
    waistRatio,
    veinCount,
    veinSwirl,
    twistAngle,
  } = params;

  const getRNom = (u: number): number => {
    return (1 - u) * baseRadius + u * topRadius + 4 * u * (1 - u) * ((waistRatio - 1) * (baseRadius + topRadius) * 0.5);
  };

  const getDRNom = (u: number): number => {
    const dNom_linear = topRadius - baseRadius;
    const dNom_waist = 4 * (1 - 2 * u) * ((waistRatio - 1) * (baseRadius + topRadius) * 0.5);
    return (dNom_linear + dNom_waist) / height;
  };

  const getRCore = (u: number): number => Math.max(22.0, getRNom(u) - 9.0);

  // Smooth helical strip carrier angle
  const twistRad = (twistAngle * Math.PI) / 180;
  const swirlRad = veinSwirl * 2 * Math.PI;
  const totalAscent = twistRad + swirlRad;

  // Slices from sMin to sMax matching CAD generator
  const sMin = 0.04;
  const sMax = 0.96;

  const nSteps = 150;
  const points: { t: number; u: number; z: number; rTrack: number; th: number; x: number; y: number }[] = [];

  for (let i = 0; i <= nSteps; i++) {
    const t = i / nSteps;
    const u = sMin + t * (sMax - sMin);
    const z = u * height;
    const rNom = getRNom(u);
    const rFront = rNom - params.diffuserThickness + 0.15;
    const rLip = rFront - 2.4;
    const rSlotTop = rLip - 1.0;
    const rTrack = rSlotTop - 1.4; // Seated on recessed channel bed floor
    const th = t * totalAscent;

    points.push({
      t,
      u,
      z,
      rTrack,
      th,
      x: rTrack * Math.cos(th),
      y: rTrack * Math.sin(th),
    });
  }

  // Calculate cumulative arc lengths
  const arcLengths = [0];
  for (let i = 1; i <= nSteps; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    const dz = points[i].z - points[i - 1].z;
    const ds = Math.sqrt(dx * dx + dy * dy + dz * dz);
    arcLengths.push(arcLengths[i - 1] + ds);
  }
  const stripLengthMm = arcLengths[nSteps];

  // Differential geometry: Darboux frame & curvatures
  let maxKg = 0;
  let maxKn = 0;

  for (let i = 1; i < nSteps; i++) {
    const p0 = points[i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];

    const ds1 = arcLengths[i] - arcLengths[i - 1];
    const ds2 = arcLengths[i + 1] - arcLengths[i];
    const dsAvg = (ds1 + ds2) / 2;

    const T1 = [(p1.x - p0.x) / ds1, (p1.y - p0.y) / ds1, (p1.z - p0.z) / ds1];
    const T2 = [(p2.x - p1.x) / ds2, (p2.y - p1.y) / ds2, (p2.z - p1.z) / ds2];

    const K = [(T2[0] - T1[0]) / dsAvg, (T2[1] - T1[1]) / dsAvg, (T2[2] - T1[2]) / dsAvg];

    // Radial surface normal on frustum/cylinder bed
    const dRdz = getDRNom(p1.u);
    const nLen = Math.sqrt(1 + dRdz * dRdz);
    const norm = [Math.cos(p1.th) / nLen, Math.sin(p1.th) / nLen, -dRdz / nLen];

    const T = [(T1[0] + T2[0]) / 2, (T1[1] + T2[1]) / 2, (T1[2] + T2[2]) / 2];

    // In-plane binormal u = norm x T (transverse across the 10mm tape width)
    const uBinorm = [
      norm[1] * T[2] - norm[2] * T[1],
      norm[2] * T[0] - norm[0] * T[2],
      norm[0] * T[1] - norm[1] * T[0],
    ];

    const kg = Math.abs(K[0] * uBinorm[0] + K[1] * uBinorm[1] + K[2] * uBinorm[2]);
    const kn = Math.abs(K[0] * norm[0] + K[1] * norm[1] + K[2] * norm[2]);

    if (kg > maxKg) maxKg = kg;
    if (kn > maxKn) maxKn = kn;
  }

  const stripWidthMm = 10.0;
  const inPlaneStrainPct = Math.round(stripWidthMm * maxKg * 100 * 100) / 100;
  const minLateralRadiusMm = maxKg > 1e-6 ? Math.round(1 / maxKg) : 9999;
  const minNormalRadiusMm = maxKn > 1e-6 ? Math.round(1 / maxKn) : 9999;

  // Discrete WS2812B 60 LEDs/m pitch
  const ledPitchMm = 16.6667;
  const ledsPerVein = Math.max(1, Math.floor(stripLengthMm / ledPitchMm));
  const exactCutLengthMm = Math.round(ledsPerVein * ledPitchMm);
  const totalLeds = ledsPerVein * veinCount;
  const totalStripLengthMm = exactCutLengthMm * veinCount;

  // Electrical metrics at 5V
  const maxCurrentAmps = Math.round(totalLeds * 0.06 * 10) / 10;
  const nominalCurrentAmps = Math.round(totalLeds * 0.02 * 10) / 10;
  const maxPowerWatts = Math.round(maxCurrentAmps * 5.0 * 10) / 10;

  // Feasibility status classification
  let stripFeasibility: 'optimal' | 'compliant' | 'buckling_risk' = 'optimal';
  const warnings: string[] = [];

  if (inPlaneStrainPct > 7.5 || minLateralRadiusMm < 130) {
    stripFeasibility = 'buckling_risk';
    warnings.push(`High lateral bending strain (${inPlaneStrainPct}%). 10mm copper tape may wrinkle or peel. Lower twist angle or swirl.`);
  } else if (inPlaneStrainPct > 3.5 || minLateralRadiusMm < 220) {
    stripFeasibility = 'compliant';
  }

  if (minNormalRadiusMm < 15.0) {
    warnings.push(`Tight out-of-plane radius (${minNormalRadiusMm}mm). Keep radius >= 12mm to avoid stress on 5050 solder joints.`);
  }

  // Exact LED positions parameterized strictly by arc length s
  const ledPositions: PhysicalLEDPlacement[] = [];
  const startMargin = (stripLengthMm - (ledsPerVein - 1) * ledPitchMm) / 2;

  for (let l = 0; l < ledsPerVein; l++) {
    const targetS = startMargin + l * ledPitchMm;

    let idx = 0;
    while (idx < nSteps && arcLengths[idx + 1] < targetS) {
      idx++;
    }
    const s0 = arcLengths[idx];
    const s1 = arcLengths[idx + 1];
    const alpha = (targetS - s0) / (s1 - s0);

    const pt0 = points[idx];
    const pt1 = points[idx + 1];

    const u = pt0.u + alpha * (pt1.u - pt0.u);
    const z = pt0.z + alpha * (pt1.z - pt0.z);
    const th = pt0.th + alpha * (pt1.th - pt0.th);
    const r = pt0.rTrack + alpha * (pt1.rTrack - pt0.rTrack);

    ledPositions.push({ index: l, u, z, th, r, s: targetS });
  }

  return {
    stripLengthMm: Math.round(stripLengthMm),
    exactCutLengthMm,
    totalStripLengthMm,
    ledsPerVein,
    totalLeds,
    inPlaneStrainPct,
    minLateralRadiusMm,
    minNormalRadiusMm,
    stripFeasibility,
    nominalCurrentAmps,
    maxCurrentAmps,
    maxPowerWatts,
    ledPositions,
    warnings,
  };
}
