export type VeinRelief = 'flush' | 'recessed' | 'proud';
export type VeinPattern = 'continuous' | 'segmented';
export type SurfaceStyle = 'fluted' | 'strata' | 'basalt' | 'organic';

export interface LampParameters {
  // Overall Dimensions
  height: number;             // Total height of monolithic shade (mm), 120 - 240
  baseRadius: number;         // Outer radius at base (mm), 35 - 65
  topRadius: number;          // Outer radius at top (mm), 25 - 60
  waistRatio: number;         // Waist curvature ratio (0.65 - 1.35)
  wallThickness: number;      // Nominal wall thickness (mm), 3.5 - 6.0
  twistAngle: number;         // Total helical twist from base to top (degrees), -180 to 180

  // Surface Texture & Organic Growth
  growthMode: 'organic' | 'geometric' | 'vortex' | 'mycelium';
  surfaceStyle: SurfaceStyle; // Opaque surface treatment: fluted, strata, basalt, or organic
  reliefDepth: number;        // Depth of sculpted surface relief (mm), 0.0 to 5.0
  organicSeed: number;        // Mutation seed (1 to 999)
  curlStrength: number;       // Particle streamline curl flow (0.0 to 5.0)
  surfaceNoise: number;       // Biomimetic surface displacement (mm), 0 to 4.0
  fluteCount: number;         // Outer fluted ribs (0 to 32)
  fluteDepth: number;         // Depth of fluted ridges (mm), 0 to 4.0

  // Light Vein Dynamics
  veinCount: number;          // Number of graceful light-emitting curves (2 to 8)
  veinWidth: number;          // Width of white light channel (mm), 6 to 14
  veinSwirl: number;          // Helical swirl revolutions (0.2 to 1.5)
  waveAmplitude: number;      // Sine wave meander amplitude (mm), 0 to 8
  waveFrequency: number;      // Sine wave cycles over height (0.5 to 3.0)
  veinRelief: VeinRelief;     // Profile style: flush, recessed (-1.2mm), or proud (+1.2mm)
  diffuserThickness: number;  // Translucent wall thickness (mm), 0.8 - 1.6
  veinPattern: VeinPattern;   // 'continuous' or 'segmented' (broken-up light windows)
  veinSegments: number;       // Number of discrete light windows when segmented (3 to 8)

  // Aesthetics & Lighting Preview
  lightColor: string;         // Emissive glow color (hex)
  lightIntensity: number;     // 0.0 (off) to 2.0 (bright)
  bodyColor: string;          // Opaque shell filament color (hex)
  diffuserColor: string;      // Translucent diffuser filament color (hex)
}

export interface MeshData {
  vertProperties: Float32Array;
  triVerts: Uint32Array;
  numProp: number;
}

export interface LampPart {
  id: 'body' | 'veins' | 'base';
  name: string;
  color: string;
  mesh: MeshData;
  extruder: number; // 1-based toolhead index
}

export interface AssemblyMetrics {
  veinCount: number;
  veinArcLengthMm: number;
  ledsPerVein: number;
  totalLeds: number;
  stripSegmentLengthMm: number;
  totalStripLengthMm: number;
  estCurrentAmps: number;
  estPowerWatts: number;
  minCoreBoreDiameterMm: number;
  maxOverhangAngleDeg: number;
  isAssemblable: boolean;
  warnings: string[];

  // Physical WS2812B Ribbon Mechanics
  inPlaneStrainPct: number;
  minLateralRadiusMm: number;
  minNormalRadiusMm: number;
  stripFeasibility: 'optimal' | 'compliant' | 'buckling_risk';
}

export interface GeometryRequest {
  type: 'generate';
  params: LampParameters;
}

export interface GeometryResponse {
  type: 'success' | 'error';
  parts?: LampPart[];
  metrics?: AssemblyMetrics;
  error?: string;
  durationMs?: number;
}
