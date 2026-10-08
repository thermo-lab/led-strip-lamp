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
    [0, 1, 1], [0, -1, 1], [0, 1, -1], [-0, -1, -1],
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
 * Organic posture/center offset (subtle natural lean as the form grows).
 */
export function evalOrganicCenter(
  u: number,
  params: LampParameters,
  noise: NoiseFunction
): [number, number] {
  const { growthMode } = params;
  if (growthMode === 'geometric') return [0, 0];

  // Natural organic gesture: gentle parabolic curve (0 at base, max ~3.5mm near top)
  const leanAmp = growthMode === 'organic' ? 3.5 : (growthMode === 'vortex' ? 2.0 : 4.0);
  const seedAngle = noise(1.4, 7.8, 3.2) * Math.PI * 2;
  const factor = u * u;

  const dx = leanAmp * factor * Math.cos(seedAngle + u * 0.6);
  const dy = leanAmp * factor * Math.sin(seedAngle + u * 0.6);
  return [dx, dy];
}

/**
 * Calculates evolved organic radius on the shell, combining:
 * 1. Macro-anatomy: botanical buttress root flaring and muscular organic lobes.
 * 2. Meso-fluting: fluid organic valleys where veins nestle.
 * 3. Micro-texture: coherent multi-octave 3D tactile displacement.
 */
export function evalOrganicRadius(
  u: number,
  th: number,
  rNom: number,
  params: LampParameters,
  noise: NoiseFunction
): number {
  const { growthMode, fluteCount, fluteDepth, twistAngle, surfaceNoise, veinCount } = params;
  const twistRad = (twistAngle * Math.PI) / 180;
  const thTwisted = th - u * twistRad;

  // Base subtle fluting ribs (if user enabled fluting)
  let fluting = 0;
  if (fluteCount > 0 && fluteDepth > 0) {
    fluting = fluteDepth * Math.cos(fluteCount * thTwisted);
  }

  if (growthMode === 'geometric' || surfaceNoise <= 0) {
    return Math.max(18, rNom + fluting);
  }

  const cosTh = Math.cos(thTwisted);
  const sinTh = Math.sin(thTwisted);

  let macroMorphology = 0;
  let microTexture = 0;

  if (growthMode === 'organic') {
    // 1. Botanical Buttress Roots: flare outward at the base (u < 0.25) like a rainforest cypress
    const rootFlare = 7.5 * Math.exp(-u * 5.0) * (0.5 + 0.5 * Math.cos(3 * thTwisted));

    // 2. Muscular Organic Lobes: 3 natural living lobes that twist gracefully with height
    // Lobes create deep sculpted bays for the veins to flow through!
    const lobeAngle = thTwisted + 0.35 * Math.sin(u * Math.PI * 1.8);
    const lobeMod = 6.2 * Math.cos(3 * lobeAngle) + 2.0 * Math.cos(6 * lobeAngle + 1.1);

    macroMorphology = rootFlare + lobeMod * (0.9 + 0.2 * (1.0 - u));

    // 3. Multi-octave coherent bark/cellular tissue displacement
    const n1 = noise(cosTh * 1.6, sinTh * 1.6, u * 2.4);
    const n2 = noise(cosTh * 3.4 + 4.1, sinTh * 3.4 + 2.7, u * 4.8);
    const n3 = noise(cosTh * 6.0 + 9.3, sinTh * 6.0 + 5.1, u * 8.5);
    microTexture = surfaceNoise * (n1 * 1.1 + n2 * 0.4 + n3 * 0.15);

  } else if (growthMode === 'vortex') {
    // Hydrodynamic whirlpool: spiraling vortex flutes that accelerate at the waist
    const vortexTwist = thTwisted + u * Math.PI * 2.2;
    const hydroRibs = 5.2 * Math.cos(4 * vortexTwist) + 1.8 * Math.cos(8 * vortexTwist);
    macroMorphology = hydroRibs;

    const nVortex = noise(Math.cos(vortexTwist) * 2.4, Math.sin(vortexTwist) * 2.4, u * 3.6);
    microTexture = surfaceNoise * (nVortex * 1.3);

  } else if (growthMode === 'mycelium') {
    // Bioluminescent Fungal Hyphae / Canyon Earth Fissures: irregular organic facets
    const rootFlare = 6.0 * Math.exp(-u * 4.5);
    const cord1 = Math.abs(noise(cosTh * 2.8, sinTh * 2.8, u * 3.2));
    const cord2 = noise(cosTh * 4.8 + 6.2, sinTh * 4.8 + 3.9, u * 5.5);
    macroMorphology = rootFlare + 3.5 * (1.0 - cord1 * 2.2);
    microTexture = surfaceNoise * (cord2 * 1.2);
  }

  // Ensure minimum radius never pinches below central clearance
  return Math.max(22, rNom + fluting + macroMorphology + microTexture);
}

/**
 * Calculates evolved particle streamline trajectory for a light vein.
 * In organic mode, veins nestle inside the natural valleys between trunk lobes.
 */
export function evalVeinAngle(
  veinIndex: number,
  veinCount: number,
  u: number,
  params: LampParameters,
  noise: NoiseFunction
): number {
  const { growthMode, veinSwirl, twistAngle, waveAmplitude, waveFrequency, curlStrength, baseRadius, topRadius } = params;

  // Base angular seed for this vein
  let seedTh = (veinIndex / veinCount) * 2 * Math.PI;

  if (growthMode === 'geometric') {
    const twistRad = (twistAngle * Math.PI) / 180;
    const swirlRad = veinSwirl * 2 * Math.PI;
    const avgR = (baseRadius + topRadius) / 2;
    return seedTh + u * twistRad + u * swirlRad + (waveAmplitude / avgR) * Math.sin(2 * Math.PI * waveFrequency * u);
  }

  // In organic mode with 3 veins, nestle in the 3 valleys between the 3 lobes (offset by pi/3)
  if (growthMode === 'organic' && veinCount === 3) {
    seedTh = (veinIndex / 3) * 2 * Math.PI + Math.PI / 3;
  } else {
    // Subtle natural organic spacing offset at root (breaks robotic equidistant symmetry)
    const rootJitter = (noise(veinIndex * 3.7 + 1.1, 4.3, 8.9) - 0.5) * 0.25;
    seedTh += rootJitter;
  }

  const twistRad = (twistAngle * Math.PI) / 180;
  const swirlRad = veinSwirl * 2 * Math.PI;
  const avgR = (baseRadius + topRadius) / 2;

  // Base natural spiral ascent
  const baseAscent = seedTh + u * twistRad + u * swirlRad;

  // Individual 3D Curl-Field Wander:
  // Each vein evaluates the curl vector field at its own 3D position in space!
  const curlX = Math.cos(seedTh + u * twistRad);
  const curlY = Math.sin(seedTh + u * twistRad);
  const curlZ = u * (waveFrequency * 2.4 + 1.0);

  // Low-frequency organic meandering drift (individual for each vein)
  const nCurlMacro = noise(curlX * 1.6 + veinIndex * 3.4, curlY * 1.6 + 6.2, curlZ);
  const nCurlDetail = noise(curlX * 3.2 + 14.1, curlY * 3.2 + veinIndex * 2.1, curlZ * 1.8);

  // Smoothly anchor at base (u=0) so wires plug into base cradle cleanly
  // Flourishes into organic wandering as it ascends through the body
  const anchorFactor = Math.sin(u * Math.PI * 0.5); // 0.0 at base -> 1.0 at top
  const curlDrift = (curlStrength * 0.42) * (nCurlMacro * 1.1 + nCurlDetail * 0.35) * anchorFactor;

  // Gentle wave breath
  const waveDrift = (waveAmplitude / avgR) * Math.sin(2 * Math.PI * waveFrequency * u + veinIndex * 0.6) * 0.6;

  return baseAscent + curlDrift + waveDrift;
}

/**
 * Calculates dynamic organic breathing of vein width along its ascent.
 * In nature, fissures and luminous channels breathe organically rather than
 * maintaining a robotic constant width.
 */
export function evalVeinWidth(
  veinIndex: number,
  u: number,
  params: LampParameters,
  noise: NoiseFunction
): number {
  const { veinWidth, growthMode } = params;
  if (growthMode === 'geometric') return veinWidth;

  // Breathing modulation: slightly wider at root, organic nodes along the trunk
  const nodeBreathe = Math.sin(u * Math.PI * 2.8 + veinIndex * 1.2);
  const taper = 1.08 - 0.16 * u; // gentle graceful taper toward crown
  const widthFactor = 1.0 + 0.20 * nodeBreathe * taper;

  // Keep within bounds: always >= 8.5mm, never excessive
  return Math.max(8.5, veinWidth * widthFactor);
}
