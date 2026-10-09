import type { AssemblyMetrics, LampParameters, VeinRelief } from '../types';
import type { DiffuserMode, ViewMode } from '../viewer/viewer';

export interface UIHandlers {
  onParamChange: (params: LampParameters) => void;
  onViewModeChange: (mode: ViewMode) => void;
  onDiffuserModeChange: (mode: DiffuserMode) => void;
  onInspectRetentionDetail: () => void;
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

  // Bind Organic Growth & Evolution Sliders
  bindSlider('param-curl-strength', 'curlStrength', (v) => v.toFixed(1));
  bindSlider('param-surface-noise', 'surfaceNoise', (v) => `${v.toFixed(1)} mm`);
  bindSlider('param-organic-seed', 'organicSeed', (v) => String(Math.round(v)));

  // Growth Mode Selectors
  const growthButtons = document.querySelectorAll<HTMLButtonElement>('.growth-btn');
  growthButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      growthButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      current.growthMode = btn.dataset.growth as any;
      handlers.onParamChange(current);
    });
  });

  const syncAllUIInputs = () => {
    const updateInput = (id: string, val: any, format?: (v: any) => string) => {
      const el = document.getElementById(id) as HTMLInputElement;
      const valBadge = document.getElementById(`${id}-val`);
      if (el) el.value = String(val);
      if (valBadge && format) valBadge.textContent = format(val);
    };

    updateInput('param-height', current.height, (v) => `${v} mm`);
    updateInput('param-base-radius', current.baseRadius, (v) => `${v} mm`);
    updateInput('param-top-radius', current.topRadius, (v) => `${v} mm`);
    updateInput('param-waist-ratio', current.waistRatio, (v) => `${v.toFixed(2)}x`);
    updateInput('param-twist-angle', current.twistAngle, (v) => `${v}°`);
    updateInput('param-curl-strength', current.curlStrength, (v) => v.toFixed(1));
    updateInput('param-surface-noise', current.surfaceNoise, (v) => `${v.toFixed(1)} mm`);
    updateInput('param-organic-seed', current.organicSeed, (v) => String(Math.round(v)));
    updateInput('param-flute-count', current.fluteCount, (v) => `${v} ribs`);
    updateInput('param-flute-depth', current.fluteDepth, (v) => `${v.toFixed(1)} mm`);
    updateInput('param-vein-count', current.veinCount, (v) => `${v} veins`);
    updateInput('param-vein-width', current.veinWidth, (v) => `${v} mm`);
    updateInput('param-vein-swirl', current.veinSwirl, (v) => `${v.toFixed(2)} turns`);
    updateInput('param-wave-amp', current.waveAmplitude, (v) => `${v.toFixed(1)} mm`);
    updateInput('param-wave-freq', current.waveFrequency, (v) => `${v.toFixed(1)} cyc`);

    growthButtons.forEach((b) => b.classList.toggle('active', b.dataset.growth === current.growthMode));
  };

  // Sculptural Presets
  const presetButtons = document.querySelectorAll<HTMLButtonElement>('.preset-btn');
  presetButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      presetButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const preset = btn.dataset.preset;

      if (preset === 'calla') {
        current.growthMode = 'organic';
        current.veinCount = 3;
        current.baseRadius = 48;
        current.topRadius = 38;
        current.waistRatio = 0.78;
        current.twistAngle = 85;
        current.curlStrength = 2.4;
        current.surfaceNoise = 1.6;
        current.lightColor = '#ff9d3b';
        current.bodyColor = '#5a6578';
      } else if (preset === 'basalt') {
        current.growthMode = 'mycelium';
        current.veinCount = 4;
        current.baseRadius = 50;
        current.topRadius = 34;
        current.waistRatio = 0.88;
        current.twistAngle = 60;
        current.curlStrength = 3.2;
        current.surfaceNoise = 2.4;
        current.lightColor = '#00f2fe';
        current.bodyColor = '#475569';
      } else if (preset === 'vortex') {
        current.growthMode = 'vortex';
        current.veinCount = 4;
        current.baseRadius = 46;
        current.topRadius = 36;
        current.waistRatio = 0.72;
        current.twistAngle = 120;
        current.curlStrength = 3.0;
        current.surfaceNoise = 1.4;
        current.lightColor = '#a855f7';
        current.bodyColor = '#64748b';
      } else if (preset === 'nordic') {
        current.growthMode = 'geometric';
        current.veinCount = 4;
        current.baseRadius = 46;
        current.topRadius = 36;
        current.waistRatio = 0.82;
        current.twistAngle = 45;
        current.curlStrength = 0.0;
        current.surfaceNoise = 0.0;
        current.fluteCount = 16;
        current.fluteDepth = 1.8;
        current.lightColor = '#ffbe76';
        current.bodyColor = '#52525b';
      }

      syncAllUIInputs();
      handlers.onParamChange(current);
      handlers.onLightLiveChange(current.lightColor, current.lightIntensity);
    });
  });

  // Mutate Seed & Evolve Button
  const btnMutate = document.getElementById('btn-mutate-seed');
  if (btnMutate) {
    btnMutate.addEventListener('click', () => {
      current.organicSeed = Math.floor(Math.random() * 999) + 1;
      current.curlStrength = parseFloat((1.4 + Math.random() * 2.4).toFixed(1));
      current.surfaceNoise = parseFloat((1.2 + Math.random() * 1.6).toFixed(1));
      current.waistRatio = parseFloat((0.74 + Math.random() * 0.20).toFixed(2));
      current.twistAngle = Math.round(55 + Math.random() * 65);
      syncAllUIInputs();
      handlers.onParamChange(current);
    });
  }

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
  const btnInspectChannel = document.getElementById('btn-inspect-channel');
  const retentionCallout = document.getElementById('retention-callout');
  const btnCloseCallout = document.getElementById('btn-close-callout');

  viewModeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode as ViewMode;
      if (!mode) return; // Specialized buttons like inspect-channel handled separately

      viewModeButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      handlers.onViewModeChange(mode);

      if (cutawayContainer) {
        cutawayContainer.style.display = mode === 'cutaway' ? 'flex' : 'none';
      }
      if (retentionCallout) {
        retentionCallout.style.display = 'none';
      }
    });
  });

  // Dedicated "Retention Detail" Macro Zoom
  if (btnInspectChannel) {
    btnInspectChannel.addEventListener('click', () => {
      viewModeButtons.forEach((b) => b.classList.remove('active'));
      btnInspectChannel.classList.add('active');

      if (cutawayContainer) {
        cutawayContainer.style.display = 'flex';
      }
      if (cutawaySlider) {
        cutawaySlider.value = '0.5';
      }
      if (retentionCallout) {
        retentionCallout.style.display = 'block';
      }

      // Sync diffuser pill to ghost
      diffuserPills.forEach((p) => p.classList.toggle('active', p.id === 'btn-diffuser-ghost'));

      handlers.onInspectRetentionDetail();
    });
  }

  // Diffuser Mode Toggle Pills (Ghost / Hide / Solid)
  const diffuserPills = [
    document.getElementById('btn-diffuser-ghost'),
    document.getElementById('btn-diffuser-hide'),
    document.getElementById('btn-diffuser-solid'),
  ].filter(Boolean) as HTMLButtonElement[];

  diffuserPills.forEach((pill) => {
    pill.addEventListener('click', () => {
      diffuserPills.forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');

      if (pill.id === 'btn-diffuser-ghost') handlers.onDiffuserModeChange('ghost');
      else if (pill.id === 'btn-diffuser-hide') handlers.onDiffuserModeChange('hidden');
      else handlers.onDiffuserModeChange('solid');
    });
  });

  // Dismiss Blueprint Callout
  if (btnCloseCallout && retentionCallout) {
    btnCloseCallout.addEventListener('click', () => {
      retentionCallout.style.display = 'none';
    });
  }

  if (cutawaySlider) {
    cutawaySlider.addEventListener('input', () => {
      handlers.onCutawayChange(parseFloat(cutawaySlider.value));
    });
  }

  // Camera Reset
  const resetCamBtn = document.getElementById('btn-reset-cam');
  if (resetCamBtn) {
    resetCamBtn.addEventListener('click', () => {
      if (retentionCallout) retentionCallout.style.display = 'none';
      handlers.onResetCamera();
    });
  }

  // Mobile Sidebar Collapse / Expand Handlers
  const sidebar = document.getElementById('sidebar-panel');
  const btnCloseSidebar = document.getElementById('btn-close-sidebar');
  const btnFloatingControls = document.getElementById('btn-floating-controls');
  const btnHeaderToggle = document.getElementById('btn-header-toggle');

  const setSidebarCollapsed = (collapsed: boolean) => {
    if (!sidebar) return;
    if (collapsed) {
      sidebar.classList.add('collapsed');
    } else {
      sidebar.classList.remove('collapsed');
    }
    // Trigger canvas resize so Three.js camera/renderer fills available space
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 320);
  };

  if (btnCloseSidebar) {
    btnCloseSidebar.addEventListener('click', () => setSidebarCollapsed(true));
  }

  if (btnFloatingControls) {
    btnFloatingControls.addEventListener('click', () => setSidebarCollapsed(false));
  }

  if (btnHeaderToggle) {
    btnHeaderToggle.addEventListener('click', () => {
      if (!sidebar) return;
      const isCollapsed = sidebar.classList.contains('collapsed');
      setSidebarCollapsed(!isCollapsed);
    });
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

  // Metrics Display & Physical Ribbon Feasibility
  const statusIndicator = document.getElementById('generation-status');
  const metricLeds = document.getElementById('metric-leds');
  const metricLength = document.getElementById('metric-length');
  const metricStrain = document.getElementById('metric-strain');
  const metricRadius = document.getElementById('metric-radius');
  const metricPower = document.getElementById('metric-power');
  const metricBore = document.getElementById('metric-bore');
  const warningsList = document.getElementById('metrics-warnings');

  const btnOptimizeGeodesic = document.getElementById('btn-optimize-geodesic');
  if (btnOptimizeGeodesic) {
    btnOptimizeGeodesic.addEventListener('click', () => {
      // Physically optimal minimum-strain twist for developable ribbon on current profile
      // Balances helical ascent with waist taper to minimize in-plane lateral curvature
      current.twistAngle = Math.round(Math.min(90, Math.max(30, 45 + (1.0 - current.waistRatio) * 60)));
      current.veinSwirl = 0.35;
      current.waveAmplitude = 0.0; // Smooth geodesic path with zero S-curve wiggles
      syncAllUIInputs();
      handlers.onParamChange(current);
    });
  }

  return {
    setGenerating(generating: boolean) {
      if (statusIndicator) {
        statusIndicator.textContent = generating ? 'Computing Manifold CSG...' : 'Ready';
        statusIndicator.className = generating ? 'status-badge computing' : 'status-badge ready';
      }
    },
    updateMetrics(m: AssemblyMetrics) {
      if (metricLeds) metricLeds.textContent = `${m.totalLeds} LEDs (${m.veinCount ?? current.veinCount}×${m.ledsPerVein})`;
      if (metricLength) metricLength.textContent = `${m.stripSegmentLengthMm} mm ea (${m.totalStripLengthMm}mm tot)`;
      if (metricPower) metricPower.textContent = `${m.estCurrentAmps}A / ${m.estPowerWatts}W (USB 5V)`;
      if (metricBore) metricBore.textContent = `${m.minCoreBoreDiameterMm} mm ID`;

      if (metricStrain) {
        const strain = m.inPlaneStrainPct ?? 0;
        if (m.stripFeasibility === 'optimal' || strain <= 3.5) {
          metricStrain.style.color = '#4ade80';
          metricStrain.textContent = `${strain}% (Optimal)`;
        } else if (m.stripFeasibility === 'compliant' || strain <= 7.5) {
          metricStrain.style.color = '#fbbf24';
          metricStrain.textContent = `${strain}% (Compliant)`;
        } else {
          metricStrain.style.color = '#f87171';
          metricStrain.textContent = `${strain}% (Wrinkle Risk)`;
        }
      }

      if (metricRadius) {
        const rad = m.minLateralRadiusMm ?? 9999;
        const isSafe = rad >= 160;
        metricRadius.style.color = isSafe ? 'var(--text-main)' : '#fbbf24';
        metricRadius.textContent = `${rad} mm (${isSafe ? 'Safe' : 'Tight'})`;
      }

      if (warningsList) {
        if (m.warnings.length === 0) {
          warningsList.innerHTML = '<li class="warning-ok">✓ 100% Physically Assemblable (No Wrinkling)</li>';
        } else {
          warningsList.innerHTML = m.warnings.map((w) => `<li class="warning-alert">⚠ ${w}</li>`).join('');
        }
      }
    },
  };
}
