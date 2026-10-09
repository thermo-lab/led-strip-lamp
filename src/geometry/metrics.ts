import type { AssemblyMetrics, LampParameters } from '../types';
import { createNoise3D, evalVeinAngle } from './organicField';
import { computeStripPhysicalMetrics } from './stripPhysics';

/**
 * Calculates physical ribbon mechanics, arc length, LED count, power requirements,
 * overhang angles, and assembly clearance checks.
 */
export function calculateMetrics(params: LampParameters): AssemblyMetrics {
  const {
    height,
    baseRadius,
    topRadius,
    waistRatio,
    veinCount,
    organicSeed,
  } = params;

  const noise = createNoise3D(organicSeed ?? 42);

  // 1. Evaluate physical WS2812B ribbon mechanics & discrete LED placements
  const stripPhys = computeStripPhysicalMetrics(params);

  // 2. Numerical integration along height for 3D vein space curve and overhang
  const steps = 100;
  const dh = height / steps;
  let veinArcLength = 0;
  let minCoreRadius = Infinity;
  let maxOverhangDeg = 0;

  const getRNom = (u: number): number => {
    return (1 - u) * baseRadius + u * topRadius + 4 * u * (1 - u) * ((waistRatio - 1) * (baseRadius + topRadius) * 0.5);
  };
  const getRCore = (u: number): number => Math.max(22.0, getRNom(u) - 9.0);

  for (let i = 0; i < steps; i++) {
    const u0 = i / steps;
    const u1 = (i + 1) / steps;
    const z0 = u0 * height;
    const z1 = u1 * height;

    const rNom0 = getRNom(u0);
    const rNom1 = getRNom(u1);

    const rCore0 = getRCore(u0);
    if (rCore0 < minCoreRadius) minCoreRadius = rCore0;

    const th0 = evalVeinAngle(0, veinCount, u0, params, noise);
    const th1 = evalVeinAngle(0, veinCount, u1, params, noise);

    const x0 = rNom0 * Math.cos(th0);
    const y0 = rNom0 * Math.sin(th0);
    const x1 = rNom1 * Math.cos(th1);
    const y1 = rNom1 * Math.sin(th1);

    const ds = Math.sqrt((x1 - x0) ** 2 + (y1 - y0) ** 2 + (z1 - z0) ** 2);
    veinArcLength += ds;

    const dr = Math.abs(rNom1 - rNom0);
    const localSlopeDeg = (Math.atan2(dr, dh) * 180) / Math.PI;
    if (localSlopeDeg > maxOverhangDeg) maxOverhangDeg = localSlopeDeg;
  }

  const minCoreBoreDiameterMm = Math.round(minCoreRadius * 2 * 10) / 10;
  const warnings: string[] = [...stripPhys.warnings];

  if (minCoreBoreDiameterMm < 44.0) {
    warnings.push(`Internal core bore is narrow (${minCoreBoreDiameterMm}mm). Hand insertion may be tight.`);
  }

  if (maxOverhangDeg > 48.0) {
    warnings.push(`Maximum wall slope is ${Math.round(maxOverhangDeg)}° (exceeds standard 45° FDM limit). Reduce waist curvature to avoid sag.`);
  }

  if (stripPhys.totalLeds > 80) {
    warnings.push(`High LED count (${stripPhys.totalLeds} LEDs, ~${stripPhys.maxCurrentAmps}A max). Ensure USB power supply provides >= 2.4A.`);
  }

  return {
    veinCount,
    veinArcLengthMm: Math.round(veinArcLength),
    ledsPerVein: stripPhys.ledsPerVein,
    totalLeds: stripPhys.totalLeds,
    stripSegmentLengthMm: stripPhys.exactCutLengthMm,
    totalStripLengthMm: stripPhys.totalStripLengthMm,
    estCurrentAmps: stripPhys.nominalCurrentAmps,
    estPowerWatts: Math.round(stripPhys.nominalCurrentAmps * 5.0 * 10) / 10,
    minCoreBoreDiameterMm,
    maxOverhangAngleDeg: Math.round(maxOverhangDeg),
    isAssemblable: stripPhys.stripFeasibility !== 'buckling_risk',
    warnings,

    // Physical WS2812B Ribbon Mechanics
    inPlaneStrainPct: stripPhys.inPlaneStrainPct,
    minLateralRadiusMm: stripPhys.minLateralRadiusMm,
    minNormalRadiusMm: stripPhys.minNormalRadiusMm,
    stripFeasibility: stripPhys.stripFeasibility,
  };
}
