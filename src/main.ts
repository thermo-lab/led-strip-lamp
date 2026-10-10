import type { GeometryRequest, GeometryResponse, LampParameters, LampPart } from './types';
import { createLampViewer } from './viewer/viewer';
import { setupUI } from './ui/controls';
import { export3MF } from './export/threemfExport';
import { exportSTL } from './export/stlExport';

const defaultParams: LampParameters = {
  lampArchetype: 'clouds', // Default to the new Fluffy Cloud Column variant
  height: 180,
  baseRadius: 44,
  topRadius: 38,
  waistRatio: 0.92,
  wallThickness: 4.8,
  twistAngle: 0,

  // Cloud Column Parameters
  cloudPuffDensity: 24,
  cloudPuffDepth: 12.0,
  cloudMinThickness: 0.95,
  cloudMaxThickness: 4.8,
  cloudTurbulence: 0.20,
  cloudRimLighting: 2.0,
  cloudColumnFacets: 3,

  // Organic Veined Lamp Parameters
  growthMode: 'organic',
  surfaceStyle: 'fluted',
  reliefDepth: 2.8,
  organicSeed: 77,
  curlStrength: 2.2,
  surfaceNoise: 1.6,

  fluteCount: 16,
  fluteDepth: 1.0,

  veinCount: 3,
  veinWidth: 10,
  veinSwirl: 0.65,
  waveAmplitude: 2.2,
  waveFrequency: 1.5,
  veinRelief: 'flush',
  diffuserThickness: 1.8,
  veinPattern: 'continuous',
  veinSegments: 5,

  lightColor: '#ff9d3b', // Warm amber / candlelight 2400K
  lightIntensity: 1.3,
  bodyColor: '#2d3748',  // Tech anthracite for base and central spine
  diffuserColor: '#ffffff', // Pure white SnapSpeed PLA
};

// Application state
let currentParts: LampPart[] = [];
let latestParams = { ...defaultParams };
let isWorkerBusy = false;
let queuedParams: LampParameters | null = null;

// Initialize 3D Viewer
const container = document.getElementById('viewport-canvas') as HTMLElement;
const viewer = createLampViewer(container);

// Initialize Geometry Worker
const worker = new Worker(new URL('./workers/geometry.worker.ts', import.meta.url), {
  type: 'module',
});

function dispatchWorker(params: LampParameters) {
  if (isWorkerBusy) {
    queuedParams = { ...params };
    return;
  }
  isWorkerBusy = true;
  ui.setGenerating(true);

  const req: GeometryRequest = {
    type: 'generate',
    params: { ...params },
  };
  worker.postMessage(req);
}

// Bind UI
const ui = setupUI(defaultParams, {
  onParamChange(params) {
    latestParams = { ...params };
    dispatchWorker(latestParams);
  },
  onViewModeChange(mode) {
    viewer.setViewMode(mode);
  },
  onDiffuserModeChange(mode) {
    viewer.setDiffuserMode(mode);
  },
  onInspectRetentionDetail() {
    viewer.focusRetentionDetail();
  },
  onCutawayChange(progress) {
    viewer.setCutawayPlane(progress);
  },
  onLightLiveChange(hex, intensity) {
    viewer.setLightColor(hex, intensity);
  },
  onExport3MF() {
    if (currentParts.length === 0) return;
    const filename = latestParams.lampArchetype === 'clouds'
      ? `fluffy_cloud_column_lamp_${latestParams.cloudColumnFacets ?? 3}strips.3mf`
      : `assembled_led_lamp_${latestParams.veinCount}veins.3mf`;
    export3MF(currentParts, filename);
  },
  onExportSTL(partId) {
    const part = currentParts.find((p) => p.id === partId);
    if (part) {
      exportSTL(part);
    }
  },
  onResetCamera() {
    viewer.resetCamera();
  },
});

// Worker Message Handling
worker.onmessage = (e: MessageEvent<GeometryResponse>) => {
  isWorkerBusy = false;
  ui.setGenerating(false);

  const res = e.data;
  if (res.type === 'success' && res.parts && res.metrics) {
    currentParts = res.parts;
    viewer.updateParts(currentParts, latestParams);
    ui.updateMetrics(res.metrics);
  } else if (res.type === 'error') {
    console.error('Geometry computation failed:', res.error);
  }

  // If parameters changed while worker was computing, run the latest
  if (queuedParams) {
    const next = queuedParams;
    queuedParams = null;
    dispatchWorker(next);
  }
};

// Initial Generation
dispatchWorker(defaultParams);
