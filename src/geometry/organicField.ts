import type { LampParameters } from '../types';

export type NoiseFunction = (x: number, y: number, z: number) => number;

/**
 * Coherent 3D gradient noise generator initialized from seed.
 */
export function createNoise3D(seed = 42): NoiseFunction {
  const p = new Uint8Array(512);
  let s = Math.abs(seed) % 2147483647;
  if (s === 0) s = 1;

  const rand = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };

  const perm = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  for (let i = 0; i < 512; i++) {
    p[i] = perm[i & 255];
  }

  const grad3 = [
    [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
    [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
    [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
  ];

  const dot = (g: number[], x: number, y: number, z: number) => g[0] * x + g[1] * y + g[2] * z;
  const lerp = (a: number, b: number, t: number) => a + t * (b - a);

  return function noise3(x: number, y: number, z: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;

    x -= Math.floor(x);
    y -= Math.floor(y);
    z -= Math.floor(z);

    const u = x * x * x * (x * (x * 6 - 15) + 10);
    const v = y * y * y * (y * (y * 6 - 15) + 10);
    const w = z * z * z * (z * (z * 6 - 15) + 10);

    const A = p[X] + Y;
    const AA = p[A] + Z;
    const AB = p[A + 1] + Z;
    const B = p[X + 1] + Y;
    const BA = p[B] + Z;
    const BB = p[B + 1] + Z;

    const gAA = grad3[p[AA] % 12];
    const gBA = grad3[p[BA] % 12];
    const gAB = grad3[p[AB] % 12];
    const gBB = grad3[p[BB] % 12];
    const gAA1 = grad3[p[AA + 1] % 12];
    const gBA1 = grad3[p[BA + 1] % 12];
    const gAB1 = grad3[p[AB + 1] % 12];
    const gBB1 = grad3[p[BB + 1] % 12];

    return lerp(
      lerp(
        lerp(dot(gAA, x, y, z), dot(gBA, x - 1, y, z), u),
        lerp(dot(gAB, x, y - 1, z), dot(gBB, x - 1, y - 1, z), u),
        v
      ),
      lerp(
        lerp(dot(gAA1, x, y, z - 1), dot(gBA1, x - 1, y, z - 1), u),
        lerp(dot(gAB1, x, y - 1, z - 1), dot(gBB1, x - 1, y - 1, z - 1), u),
        v
      ),
      w
    );
  };
}

/**
 * Calculates evolved organic radius perturbation on the shell.
 */
export function evalOrganicRadius(
  u: number,
  th: number,
  rNom: number,
  params: LampParameters,
  noise: NoiseFunction
): number {
  const { growthMode, fluteCount, fluteDepth, twistAngle, surfaceNoise } = params;
  const twistRad = (twistAngle * Math.PI) / 180;
  const thTwisted = th - u * twistRad;

  // Base fluting (if requested)
  let fluting = 0;
  if (fluteCount > 0 && fluteDepth > 0) {
    fluting = fluteDepth * Math.cos(fluteCount * thTwisted);
  }

  if (growthMode === 'geometric' || surfaceNoise <= 0) {
    return Math.max(16, rNom + fluting);
  }

  // 3D Organic multi-scale tissue displacement
  const cosTh = Math.cos(thTwisted);
  const sinTh = Math.sin(thTwisted);

  let organicPerturbation = 0;
  if (growthMode === 'organic') {
    // Multi-octave natural tree bark / biomimetic bone lobes
    const n1 = noise(cosTh * 1.8, sinTh * 1.8, u * 2.2);
    const n2 = noise(cosTh * 3.6 + 5.2, sinTh * 3.6 + 2.1, u * 4.5);
    organicPerturbation = surfaceNoise * (n1 * 1.1 + n2 * 0.45);
  } else if (growthMode === 'vortex') {
    // Liquid whirlpool / tornado vortex striations
    const swirlAngle = thTwisted + u * Math.PI * 1.5;
    const nVortex = noise(Math.cos(swirlAngle) * 2.2, Math.sin(swirlAngle) * 2.2, u * 3.0);
    organicPerturbation = surfaceNoise * (nVortex * 1.25);
  } else if (growthMode === 'mycelium') {
    // Branching cord / fungal mycelium vein ribs
    const nCord1 = Math.abs(noise(cosTh * 3.0, sinTh * 3.0, u * 3.5));
    const nCord2 = noise(cosTh * 5.0 + 8.1, sinTh * 5.0 + 4.3, u * 6.0);
    organicPerturbation = surfaceNoise * ((1.0 - nCord1 * 2.0) * 0.9 + nCord2 * 0.35);
  }

  return Math.max(16, rNom + fluting + organicPerturbation);
}

/**
 * Calculates evolved particle streamline trajectory for a light vein.
 */
export function evalVeinAngle(
  veinIndex: number,
  veinCount: number,
  u: number,
  params: LampParameters,
  noise: NoiseFunction
): number {
  const { growthMode, veinSwirl, twistAngle, waveAmplitude, waveFrequency, curlStrength, baseRadius, topRadius } = params;

  const baseTh = (veinIndex / veinCount) * 2 * Math.PI;
  const twistRad = (twistAngle * Math.PI) / 180;
  const swirlRad = veinSwirl * 2 * Math.PI;
  const avgR = (baseRadius + topRadius) / 2;

  // Base geometric trajectory
  const baseTrajectory = baseTh + u * twistRad + u * swirlRad;

  if (growthMode === 'geometric') {
    // Classic trig wave
    return baseTrajectory + (waveAmplitude / avgR) * Math.sin(2 * Math.PI * waveFrequency * u);
  }

  // Organic Particle Streamline Integration (Curl field & fluid wander)
  const cosBase = Math.cos(baseTh);
  const sinBase = Math.sin(baseTh);

  // Divergence-free curl noise wander along particle ascent
  const curlSampleZ = u * (waveFrequency * 2.2);
  const nCurl = noise(cosBase * 1.6 + 12.3, sinBase * 1.6 + 7.8, curlSampleZ);
  const nCurlFine = noise(cosBase * 3.2 + 25.1, sinBase * 3.2 + 14.2, curlSampleZ * 2.0);

  // Particle drift grows naturally from base to top (smooth anchor at bottom)
  const anchorFactor = Math.sin(u * Math.PI * 0.5); // 0 at base, 1 at top
  const curlDrift = (curlStrength * 0.35) * (nCurl * 1.0 + nCurlFine * 0.4) * anchorFactor;

  // Additional subtle sine breathing
  const waveDrift = (waveAmplitude / avgR) * Math.sin(2 * Math.PI * waveFrequency * u) * 0.6;

  return baseTrajectory + curlDrift + waveDrift;
}
