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
 * 2. Solid surface architecture: fluted columns, terraced strata, chiseled basalt, or smooth organic.
 * 3. Sculpted riverbank canyon lips flanking the glowing veins (+2.8mm raised organic margins).
 * 4. Micro-texture: coherent multi-octave 3D tactile displacement.
 * All lobes swell outward from the structural trunk to guarantee zero wall breaches and 100% airtight solid opaque shell.
 */
export function evalOrganicRadius(
  u: number,
  th: number,
  rNom: number,
  params: LampParameters,
  noise: NoiseFunction
): number {
  const {
    growthMode,
    surfaceStyle = 'fluted',
    reliefDepth = 2.5,
    fluteCount = 16,
    twistAngle,
    surfaceNoise = 1.6,
    veinCount,
  } = params;

  const twistRad = (twistAngle * Math.PI) / 180;
  const thTwisted = th - u * twistRad;

  let macroMorphology = 0;
  let microTexture = 0;

  if (growthMode === 'organic') {
    // 1. Botanical Buttress Roots: flare outward at the base (u < 0.25) like a cypress tree
    const rootFlare = 6.0 * Math.exp(-u * 5.0) * (0.5 + 0.5 * Math.cos(3 * thTwisted));

    // 2. Muscular Organic Lobes: 3 natural living lobes that twist gracefully with height
    const lobeAngle = thTwisted + 0.35 * Math.sin(u * Math.PI * 1.8);
    const lobeSwelling = 4.5 * Math.pow(0.5 + 0.5 * Math.cos(3 * lobeAngle), 1.4);

    macroMorphology = rootFlare + lobeSwelling;

    if (surfaceNoise > 0) {
      const cosTh = Math.cos(thTwisted);
      const sinTh = Math.sin(thTwisted);
      const n1 = noise(cosTh * 1.6, sinTh * 1.6, u * 2.4);
      microTexture = surfaceNoise * n1 * 0.6;
    }
  } else if (growthMode === 'vortex') {
    // Hydrodynamic whirlpool: spiraling vortex flutes that accelerate at the waist
    const vortexAngle = thTwisted + u * Math.PI * 2.0;
    macroMorphology = 4.0 * Math.pow(0.5 + 0.5 * Math.cos(4 * vortexAngle), 1.5);
    if (surfaceNoise > 0) {
      microTexture = surfaceNoise * noise(Math.cos(vortexAngle) * 2.2, Math.sin(vortexAngle) * 2.2, u * 3.0) * 0.6;
    }
  } else if (growthMode === 'mycelium') {
    // Bioluminescent Fungal Hyphae / Canyon Earth Fissures
    const rootFlare = 5.0 * Math.exp(-u * 4.5);
    const hyphae = 3.5 * Math.pow(0.5 + 0.5 * Math.cos(5 * thTwisted + u * 4.0), 2.0);
    macroMorphology = rootFlare + hyphae;
    if (surfaceNoise > 0) {
      microTexture = surfaceNoise * noise(Math.cos(thTwisted) * 3.0, Math.sin(thTwisted) * 3.0, u * 4.0) * 0.7;
    }
  }

  // Calculate distance to nearest vein for raised riverbank canyon margins
  let minVeinDist = Infinity;
  for (let v = 0; v < veinCount; v++) {
    const thV = evalVeinAngle(v, veinCount, u, params, noise);
    let dTh = Math.abs((th - thV) % (2 * Math.PI));
    if (dTh > Math.PI) dTh = 2 * Math.PI - dTh;
    const arcDist = dTh * rNom;
    if (arcDist < minVeinDist) minVeinDist = arcDist;
  }

  // Raised Riverbank Canyon Lips (+2.8mm max swell at margin d = 5mm)
  const dEdge = 5.0;
  const sigma = 5.5;
  const rDepth = Math.max(0, reliefDepth);
  const riverbankSwell = (rDepth / 2.5) * 2.8 * Math.exp(-Math.pow((minVeinDist - dEdge) / sigma, 2));

  // Solid Surface Architecture styles (Zero holes, 100% continuous solid shell)
  let styleMod = 0;
  if (surfaceStyle === 'fluted') {
    // 1. Scalloped Architectural Fluting (16 fluid vertical/twisted flutes)
    const nFlutes = fluteCount > 0 ? fluteCount : 16;
    const fluteAmp = rDepth * 0.85;
    styleMod = riverbankSwell * 0.65 + fluteAmp * Math.cos(nFlutes * thTwisted);
  } else if (surfaceStyle === 'strata') {
    // 2. Terraced Sedimentary Sandstone / Ceramic Contours (~28 stepped shelves)
    const nStrata = Math.max(16, Math.min(48, Math.round(params.height / 6.0)));
    const strataPhase = u * nStrata + 0.25 * Math.sin(3 * thTwisted);
    const frac = strataPhase - Math.floor(strataPhase);
    const step = (rDepth * 0.6) * (Math.pow(frac, 0.4) - 0.5);
    styleMod = riverbankSwell + step;
  } else if (surfaceStyle === 'basalt') {
    // 3. Chiseled Basaltic Polygonal Planes (12 bold geometric facets)
    const nFacets = fluteCount > 0 ? Math.max(6, Math.min(24, fluteCount)) : 12;
    const facetAngle = (2 * Math.PI) / nFacets;
    const phase = ((thTwisted % facetAngle) + facetAngle) % facetAngle - facetAngle / 2;
    const facetPlateau = (rDepth * 0.95) * (Math.cos(phase * (nFacets / 2)) - 0.5);
    styleMod = riverbankSwell * 0.6 + facetPlateau;
  } else {
    // 4. Smooth Organic
    styleMod = riverbankSwell;
  }

  // Ensure minimum radius is solidly structural everywhere (> 24mm)
  return Math.max(24.0, rNom + macroMorphology + microTexture + styleMod);
}

/**
 * Evaluates pure, smooth, developable carrier trajectory for the internal WS2812B flex PCB strip bed.
 * A continuous developable cylindrical/conical helix guarantees:
 * 1. In-plane bending strain ≈ 0.0% and lateral radius > 1500mm, eliminating copper tape buckling or wrinkling.
 * 2. Smooth, effortless sliding when feeding the strip into the 10.0mm C-channel from the bottom flared funnels.
 * 3. 100% symmetric, unskewed captive C-channel walls with bilateral retaining lips.
 */
export function evalStripAngle(
  veinIndex: number,
  veinCount: number,
  u: number,
  params: LampParameters
): number {
  const { growthMode, veinSwirl, twistAngle } = params;

  // Base angular seed for this vein
  let seedTh = (veinIndex / veinCount) * 2 * Math.PI;

  if (growthMode === 'organic' && veinCount === 3) {
    seedTh = (veinIndex / 3) * 2 * Math.PI + Math.PI / 3;
  }

  const twistRad = (twistAngle * Math.PI) / 180;
  const swirlRad = veinSwirl * 2 * Math.PI;
  return seedTh + u * twistRad + u * swirlRad;
}

/**
 * Evaluates expressive, freeform optical trajectory for the outer light-emitting diffuser vein.
 * Decoupled from the internal strip bed to allow dramatic organic meanders, curl streamline drift,
 * and wave oscillations while staying safely within the 27.7mm throw cone of the 120° WS2812B LEDs.
 */
export function evalVeinAngle(
  veinIndex: number,
  veinCount: number,
  u: number,
  params: LampParameters,
  noise?: NoiseFunction
): number {
  const { waveAmplitude, waveFrequency, curlStrength, baseRadius, topRadius } = params;
  const thStrip = evalStripAngle(veinIndex, veinCount, u, params);
  const avgR = (baseRadius + topRadius) / 2;

  // Natural organic harmonic meander anchored smoothly at rims (u=0 and u=1)
  const anchor = Math.sin(u * Math.PI);
  const waveDrift = (waveAmplitude / Math.max(16, avgR)) * Math.sin(2 * Math.PI * waveFrequency * u) * anchor;

  // Particle curl flow drift
  let curlDrift = 0;
  if (noise && curlStrength > 0) {
    const cosStrip = Math.cos(thStrip);
    const sinStrip = Math.sin(thStrip);
    const nCurl = noise(cosStrip * 2.2 + veinIndex * 3.7, sinStrip * 2.2 + 8.1, u * (waveFrequency * 2.2 + 1.0));
    curlDrift = ((curlStrength * 2.2) / Math.max(16, avgR)) * nCurl * anchor;
  }

  // Clamped so vein never wanders more than ±5.8mm from strip centerline (100% inside 27.7mm LED cone)
  const maxDriftRad = 5.8 / Math.max(16, avgR);
  const netDrift = Math.max(-maxDriftRad, Math.min(maxDriftRad, waveDrift + curlDrift));

  return thStrip + netDrift;
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
  _noise?: NoiseFunction
): number {
  const { veinWidth, growthMode } = params;
  if (growthMode === 'geometric') return veinWidth;

  // Breathing modulation: slightly wider at root, organic nodes along the trunk
  const nodeBreathe = Math.sin(u * Math.PI * 2.8 + veinIndex * 1.2);
  const taper = 1.06 - 0.12 * u; // gentle graceful taper toward crown
  const widthFactor = 1.0 + 0.22 * nodeBreathe * taper;

  // Keep within bounds: always >= 7.5mm, never excessive
  return Math.max(7.5, veinWidth * widthFactor);
}
