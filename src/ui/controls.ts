import type { AssemblyMetrics, LampParameters, VeinRelief } from '../types';
import type { ViewMode } from '../viewer/viewer';

export interface UIHandlers {
  onParamChange: (params: LampParameters) => void;
  onViewModeChange: (mode: ViewMode) => void;
  onCutawayChange: (progress: number) => void;
  onLightLiveChange: (hex: string, intensity: number) => void;
  onExport3MF: () => void;
  onExportSTL: (partId: 'body' | 'veins' | 'base') => void;
  onResetCamera: () => void;
}

export function setupUI(
  initialParams: LampParameters,
  handlers: UIHandlers
): {
  updateMetrics: (m: AssemblyMetrics) => void;
  setGenerating: (generating: boolean) => void;
} {
  const current = { ...initialParams };

  // Helper to bind numeric slider
  const bindSlider = (id: string, key: keyof LampParameters, valFormat = (v: number) => String(v)) => {
    const input = document.getElementById(id) as HTMLInputElement;
    const badge = document.getElementById(`${id}-val`);
    if (!input) return;

    input.value = String(current[key]);
    if (badge) badge.textContent = valFormat(Number(input.value));

    input.addEventListener('input', () => {
      const val = parseFloat(input.value);
      (current as any)[key] = val;
      if (badge) badge.textContent = valFormat(val);
      handlers.onParamChange(current);
    });
  };

  // Bind Dimension Sliders
  bindSlider('param-height', 'height', (v) => `${v} mm`);
  bindSlider('param-base-radius', 'baseRadius', (v) => `${v} mm`);
  bindSlider('param-top-radius', 'topRadius', (v) => `${v} mm`);
  bindSlider('param-waist-ratio', 'waistRatio', (v) => `${v.toFixed(2)}x`);
  bindSlider('param-twist-angle', 'twistAngle', (v) => `${v}°`);

  // Bind Fluting Sliders
  bindSlider('param-flute-count', 'fluteCount', (v) => `${v} ribs`);
  bindSlider('param-flute-depth', 'fluteDepth', (v) => `${v.toFixed(1)} mm`);

  // Bind Vein Dynamics Sliders
  bindSlider('param-vein-count', 'veinCount', (v) => `${v} veins`);
  bindSlider('param-vein-width', 'veinWidth', (v) => `${v} mm`);
  bindSlider('param-vein-swirl', 'veinSwirl', (v) => `${v.toFixed(2)} turns`);
  bindSlider('param-wave-amp', 'waveAmplitude', (v) => `${v.toFixed(1)} mm`);
  bindSlider('param-wave-freq', 'waveFrequency', (v) => `${v.toFixed(1)} cyc`);

  // Vein Relief Selectors
  const reliefButtons = document.querySelectorAll<HTMLButtonElement>('.relief-btn');
  reliefButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      reliefButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      current.veinRelief = btn.dataset.relief as VeinRelief;
      handlers.onParamChange(current);
    });
  });

  // Light Color Presets & Picker
  const lightColorInput = document.getElementById('param-light-color') as HTMLInputElement;
  const lightIntensityInput = document.getElementById('param-light-intensity') as HTMLInputElement;

  if (lightColorInput) {
    lightColorInput.value = current.lightColor;
    lightColorInput.addEventListener('input', () => {
      current.lightColor = lightColorInput.value;
      handlers.onLightLiveChange(current.lightColor, current.lightIntensity);
    });
  }

  if (lightIntensityInput) {
    lightIntensityInput.value = String(current.lightIntensity);
    lightIntensityInput.addEventListener('input', () => {
      current.lightIntensity = parseFloat(lightIntensityInput.value);
      handlers.onLightLiveChange(current.lightColor, current.lightIntensity);
    });
  }

  const presetSwatches = document.querySelectorAll<HTMLButtonElement>('.color-swatch');
  presetSwatches.forEach((swatch) => {
    swatch.addEventListener('click', () => {
      const color = swatch.dataset.color;
      if (color && lightColorInput) {
        lightColorInput.value = color;
        current.lightColor = color;
        handlers.onLightLiveChange(color, current.lightIntensity);
      }
    });
  });

  // Shell Filament Color
  const bodyColorInput = document.getElementById('param-body-color') as HTMLInputElement;
  if (bodyColorInput) {
    bodyColorInput.value = current.bodyColor;
    bodyColorInput.addEventListener('input', () => {
      current.bodyColor = bodyColorInput.value;
      handlers.onParamChange(current);
    });
  }

  // View Mode Toggles
  const viewModeButtons = document.querySelectorAll<HTMLButtonElement>('.view-mode-btn');
  const cutawayContainer = document.getElementById('cutaway-slider-container');
  const cutawaySlider = document.getElementById('cutaway-slider') as HTMLInputElement;

  viewModeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      viewModeButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const mode = btn.dataset.mode as ViewMode;
      handlers.onViewModeChange(mode);

      if (cutawayContainer) {
        cutawayContainer.style.display = mode === 'cutaway' ? 'flex' : 'none';
      }
    });
  });

  if (cutawaySlider) {
    cutawaySlider.addEventListener('input', () => {
      handlers.onCutawayChange(parseFloat(cutawaySlider.value));
    });
  }

  // Camera Reset
  const resetCamBtn = document.getElementById('btn-reset-cam');
  if (resetCamBtn) {
    resetCamBtn.addEventListener('click', handlers.onResetCamera);
  }

  // Export Buttons
  const export3mfBtn = document.getElementById('btn-export-3mf');
  if (export3mfBtn) {
    export3mfBtn.addEventListener('click', handlers.onExport3MF);
  }

  const exportStlBodyBtn = document.getElementById('btn-export-stl-body');
  if (exportStlBodyBtn) {
    exportStlBodyBtn.addEventListener('click', () => handlers.onExportSTL('body'));
  }

  const exportStlVeinsBtn = document.getElementById('btn-export-stl-veins');
  if (exportStlVeinsBtn) {
    exportStlVeinsBtn.addEventListener('click', () => handlers.onExportSTL('veins'));
  }

  const exportStlBaseBtn = document.getElementById('btn-export-stl-base');
  if (exportStlBaseBtn) {
    exportStlBaseBtn.addEventListener('click', () => handlers.onExportSTL('base'));
  }

  // Metrics Display
  const statusIndicator = document.getElementById('generation-status');
  const metricLeds = document.getElementById('metric-leds');
  const metricLength = document.getElementById('metric-length');
  const metricPower = document.getElementById('metric-power');
  const metricBore = document.getElementById('metric-bore');
  const metricOverhang = document.getElementById('metric-overhang');
  const warningsList = document.getElementById('metrics-warnings');

  return {
    setGenerating(generating: boolean) {
      if (statusIndicator) {
        statusIndicator.textContent = generating ? 'Computing Manifold CSG...' : 'Ready';
        statusIndicator.className = generating ? 'status-badge computing' : 'status-badge ready';
      }
    },
    updateMetrics(m: AssemblyMetrics) {
      if (metricLeds) metricLeds.textContent = `${m.totalLeds} LEDs (${m.veinCount ?? current.veinCount}×${m.ledsPerVein})`;
      if (metricLength) metricLength.textContent = `${m.totalStripLengthMm} mm (${m.stripSegmentLengthMm}mm ea)`;
      if (metricPower) metricPower.textContent = `${m.estCurrentAmps}A / ${m.estPowerWatts}W (USB 5V)`;
      if (metricBore) metricBore.textContent = `${m.minCoreBoreDiameterMm} mm ID`;
      if (metricOverhang) metricOverhang.textContent = `${m.maxOverhangAngleDeg}°`;

      if (warningsList) {
        if (m.warnings.length === 0) {
          warningsList.innerHTML = '<li class="warning-ok">✓ 100% Assemblable & Print-Ready</li>';
        } else {
          warningsList.innerHTML = m.warnings.map((w) => `<li class="warning-alert">⚠ ${w}</li>`).join('');
        }
      }
    },
  };
}
