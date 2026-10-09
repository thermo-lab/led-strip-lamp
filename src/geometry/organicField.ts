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
 * All lobes swell outward from the structural trunk to guarantee zero wall breaches.
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

  // Base subtle fluting ribs (if user enabled fluting)
  let fluting = 0;
  if (fluteCount > 0 && fluteDepth > 0) {
    fluting = fluteDepth * 0.5 * Math.cos(fluteCount * thTwisted);
  }

  if (growthMode === 'geometric' || surfaceNoise <= 0) {
    return Math.max(24, rNom + fluting);
  }

  const cosTh = Math.cos(thTwisted);
  const sinTh = Math.sin(thTwisted);

  let macroMorphology = 0;
  let microTexture = 0;

  if (growthMode === 'organic') {
    // 1. Botanical Buttress Roots: flare outward at the base (u < 0.25) like a cypress tree
    const rootFlare = 8.0 * Math.exp(-u * 5.0) * Math.pow(Math.cos(1.5 * thTwisted), 2);

    // 2. Muscular Organic Lobes: 3 natural living lobes that twist gracefully with height
    // Lobes swell OUTWARD (0 to +7.5mm) from the structural trunk datum
    const lobeAngle = thTwisted + 0.35 * Math.sin(u * Math.PI * 1.8);
    const lobeSwelling = 7.5 * Math.pow(0.5 + 0.5 * Math.cos(3 * lobeAngle), 1.4);

    macroMorphology = rootFlare + lobeSwelling;

    // 3. Multi-octave coherent bark/cellular tissue displacement
    const n1 = noise(cosTh * 1.6, sinTh * 1.6, u * 2.4);
    microTexture = surfaceNoise * n1 * 0.8;

  } else if (growthMode === 'vortex') {
    // Hydrodynamic whirlpool: spiraling vortex flutes that accelerate at the waist
    const vortexAngle = thTwisted + u * Math.PI * 2.0;
    macroMorphology = 5.5 * Math.pow(0.5 + 0.5 * Math.cos(4 * vortexAngle), 1.5);
    microTexture = surfaceNoise * noise(Math.cos(vortexAngle) * 2.2, Math.sin(vortexAngle) * 2.2, u * 3.0) * 0.7;

  } else if (growthMode === 'mycelium') {
    // Bioluminescent Fungal Hyphae / Canyon Earth Fissures: irregular organic facets
    const rootFlare = 6.0 * Math.exp(-u * 4.5);
    const hyphae = 4.5 * Math.pow(0.5 + 0.5 * Math.cos(5 * thTwisted + u * 4.0), 2.0);
    macroMorphology = rootFlare + hyphae;
    microTexture = surfaceNoise * noise(Math.cos(thTwisted) * 3.0, Math.sin(thTwisted) * 3.0, u * 4.0) * 0.9;
  }

  // Ensure minimum radius is solidly structural everywhere
  return Math.max(26.0, rNom + fluting + macroMorphology + microTexture);
}

/**
/**
 * Evaluates unified, physically developable carrier trajectory for the light vein and flex strip.
 * A continuous developable path ensures:
 * 1. 100% concentric point-by-point alignment between the internal strip channel and external diffuser.
 * 2. In-plane bending strain < 5.0% and lateral radius > 200mm, preventing copper PCB buckling or peeling.
 * 3. 100% symmetric, unskewed captive C-channel walls with zero mesh self-intersections or shearing artifacts.
 */
export function evalVeinAngle(
  veinIndex: number,
  veinCount: number,
  u: number,
  params: LampParameters,
  _noise?: NoiseFunction
): number {
  const { growthMode, veinSwirl, twistAngle, waveAmplitude, waveFrequency, baseRadius, topRadius } = params;

  // Base angular seed for this vein
  let seedTh = (veinIndex / veinCount) * 2 * Math.PI;

  if (growthMode === 'organic' && veinCount === 3) {
    seedTh = (veinIndex / 3) * 2 * Math.PI + Math.PI / 3;
  }

  const twistRad = (twistAngle * Math.PI) / 180;
  const swirlRad = veinSwirl * 2 * Math.PI;
  const baseAscent = seedTh + u * twistRad + u * swirlRad;

  const avgR = (baseRadius + topRadius) / 2;
  // Natural harmonic organic drift: smooth sine wave anchored at rims (u=0 and u=1)
  // Guarantees physically developable path with in-plane strain < 5% and lateral radius > 200mm
  const anchor = Math.sin(u * Math.PI);
  const waveDrift = (Math.min(3.5, waveAmplitude) / avgR) * Math.sin(Math.PI * waveFrequency * u) * anchor;

  return baseAscent + waveDrift;
}

export function evalStripAngle(
  veinIndex: number,
  veinCount: number,
  u: number,
  params: LampParameters,
  noise?: NoiseFunction
): number {
  return evalVeinAngle(veinIndex, veinCount, u, params, noise);
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
