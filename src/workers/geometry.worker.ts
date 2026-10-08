import Module from 'manifold-3d';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import { generateLampGeometry } from '../geometry/lampGenerator';
import { calculateMetrics } from '../geometry/metrics';
import type { GeometryRequest, GeometryResponse } from '../types';

type Wasm = Awaited<ReturnType<typeof Module>>;
let modulePromise: Promise<Wasm> | null = null;

async function getModule(): Promise<Wasm> {
  if (!modulePromise) {
    modulePromise = (async () => {
      const wasm = await (Module as any)({ locateFile: () => wasmUrl });
      wasm.setup();
      return wasm;
    })();
  }
  return modulePromise;
}

self.onmessage = async (e: MessageEvent<GeometryRequest>) => {
  const t0 = performance.now();
  try {
    const wasm = await getModule();
    const msg = e.data;

    if (msg.type === 'generate') {
      const parts = generateLampGeometry(wasm, msg.params);
      const metrics = calculateMetrics(msg.params);

      // Collect typed array buffers to transfer zero-copy to UI thread
      const transferables: Transferable[] = [];
      for (const part of parts) {
        if (part.mesh.vertProperties.buffer) {
          transferables.push(part.mesh.vertProperties.buffer);
        }
        if (part.mesh.triVerts.buffer) {
          transferables.push(part.mesh.triVerts.buffer);
        }
      }

      const res: GeometryResponse = {
        type: 'success',
        parts,
        metrics,
        durationMs: Math.round(performance.now() - t0),
      };

      (self as unknown as Worker).postMessage(res, transferables);
    }
  } catch (err: any) {
    console.error('Geometry Worker error:', err);
    const errRes: GeometryResponse = {
      type: 'error',
      error: err?.message || String(err),
      durationMs: Math.round(performance.now() - t0),
    };
    (self as unknown as Worker).postMessage(errRes);
  }
};
