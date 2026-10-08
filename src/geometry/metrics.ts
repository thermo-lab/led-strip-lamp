import type { AssemblyMetrics, LampParameters } from '../types';
import { createNoise3D, evalVeinAngle } from './organicField';

/**
 * Calculates arc length, LED count, power requirements, and assembly clearance checks.
 */
export function calculateMetrics(params: LampParameters): AssemblyMetrics {
  const {
    height,
    baseRadius,
    topRadius,
    waistRatio,
    veinCount,
    wallThickness,
    organicSeed,
  } = params;

  const noise = createNoise3D(organicSeed ?? 42);

  // Numerical integration along height for 3D vein space curve
  const steps = 100;
  const dh = height / steps;
  let arcLength = 0;

  let minCoreRadius = Infinity;
  let maxOverhangDeg = 0;

  for (let i = 0; i < steps; i++) {
    const u0 = i / steps;
    const u1 = (i + 1) / steps;
    const z0 = u0 * height;
    const z1 = u1 * height;

    // Radius function with waist curvature
    const rNom0 = (1 - u0) * baseRadius + u0 * topRadius + 4 * u0 * (1 - u0) * ((waistRatio - 1) * (baseRadius + topRadius) * 0.5);
    const rNom1 = (1 - u1) * baseRadius + u1 * topRadius + 4 * u1 * (1 - u1) * ((waistRatio - 1) * (baseRadius + topRadius) * 0.5);

    // Track minimum core bore radius
    const rCore0 = rNom0 - wallThickness;
    if (rCore0 < minCoreRadius) minCoreRadius = rCore0;

    // Vein angle theta via particle streamline integration
    const th0 = evalVeinAngle(0, veinCount, u0, params, noise);
    const th1 = evalVeinAngle(0, veinCount, u1, params, noise);

    const x0 = rNom0 * Math.cos(th0);
    const y0 = rNom0 * Math.sin(th0);
    const x1 = rNom1 * Math.cos(th1);
    const y1 = rNom1 * Math.sin(th1);

    const ds = Math.sqrt((x1 - x0) ** 2 + (y1 - y0) ** 2 + (z1 - z0) ** 2);
    arcLength += ds;

    // Local slope angle for overhang check
    const dr = Math.abs(rNom1 - rNom0);
    const localSlopeDeg = (Math.atan2(dr, dh) * 180) / Math.PI;
    if (localSlopeDeg > maxOverhangDeg) maxOverhangDeg = localSlopeDeg;
  }

  // WS2812B 60 LEDs/meter pitch is 16.667 mm per LED segment
  const ledPitchMm = 1000 / 60; // 16.667 mm
  const ledsPerVein = Math.max(1, Math.round(arcLength / ledPitchMm));
  const totalLeds = ledsPerVein * veinCount;
  const stripSegmentLengthMm = Math.round(ledsPerVein * ledPitchMm);
  const totalStripLengthMm = stripSegmentLengthMm * veinCount;

  // Typical realistic current per LED at 60-70% brightness / warm white ambiance is ~20mA
  const estCurrentAmps = Math.round(totalLeds * 0.02 * 100) / 100;
  const estPowerWatts = Math.round(estCurrentAmps * 5.0 * 10) / 10;

  const minCoreBoreDiameterMm = Math.round(minCoreRadius * 2 * 10) / 10;

  const warnings: string[] = [];
  let isAssemblable = true;

  if (minCoreBoreDiameterMm < 45) {
    warnings.push(`Internal core bore is narrow (${minCoreBoreDiameterMm}mm). Hand insertion may be tight; consider increasing base or waist radius.`);
  }

  if (maxOverhangDeg > 45) {
    warnings.push(`Maximum wall slope is ${Math.round(maxOverhangDeg)}° (exceeds standard 45° FDM limit). Reduce waist curvature to avoid sag.`);
  }

  if (totalLeds > 80) {
    warnings.push(`High LED count (${totalLeds} LEDs, ~${estCurrentAmps}A). Ensure your USB power adapter provides at least 2.0A.`);
  }

  return {
    veinCount,
    veinArcLengthMm: Math.round(arcLength),
    ledsPerVein,
    totalLeds,
    stripSegmentLengthMm,
    totalStripLengthMm,
    estCurrentAmps,
    estPowerWatts,
    minCoreBoreDiameterMm,
    maxOverhangAngleDeg: Math.round(maxOverhangDeg),
    isAssemblable,
    warnings,
  };
}
