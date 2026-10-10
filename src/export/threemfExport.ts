import { zipSync, strToU8 } from 'fflate';
import type { LampPart } from '../types';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const f = (n: number): string => String(Math.round(n * 1e4) / 1e4);

/**
 * Builds a multi-material 3MF project archive compatible with
 * Snapmaker Orca, Bambu Studio, PrusaSlicer, and Cura.
 */
export function export3MF(parts: LampPart[], filename = 'custom_led_lamp.3mf'): void {
  // Extract unique colors for color group
  const colorMap = new Map<string, number>();
  const colorXmls: string[] = [];

  for (const p of parts) {
    const hex = (p.color.startsWith('#') ? p.color : '#' + p.color).toUpperCase();
    const cleanHex = hex.length === 7 ? hex + 'FF' : hex;
    if (!colorMap.has(cleanHex)) {
      colorMap.set(cleanHex, colorMap.size);
      colorXmls.push(`<m:color color="${cleanHex}"/>`);
    }
  }

  // Find minimum Z to align model flat on the print bed (Z = 0)
  let minZ = Infinity;
  for (const p of parts) {
    const vp = p.mesh.vertProperties;
    const np = p.mesh.numProp;
    for (let i = 2; i < vp.length; i += np) {
      if (vp[i] < minZ) minZ = vp[i];
    }
  }
  if (!isFinite(minZ)) minZ = 0;

  // Build mesh objects
  const objectXmls: string[] = [];
  const componentXmls: string[] = [];

  parts.forEach((p, idx) => {
    const objId = idx + 10;
    const colorHex = (p.color.startsWith('#') ? p.color : '#' + p.color).toUpperCase() + 'FF';
    const colorIndex = colorMap.get(colorHex) ?? 0;

    const vp = p.mesh.vertProperties;
    const np = p.mesh.numProp;
    const tv = p.mesh.triVerts;

    const vertXml: string[] = [];
    for (let i = 0; i < vp.length; i += np) {
      vertXml.push(`<vertex x="${f(vp[i])}" y="${f(vp[i + 1])}" z="${f(vp[i + 2] - minZ)}"/>`);
    }

    const triXml: string[] = [];
    for (let i = 0; i < tv.length; i += 3) {
      triXml.push(`<triangle v1="${tv[i]}" v2="${tv[i + 1]}" v3="${tv[i + 2]}"/>`);
    }

    objectXmls.push(`
    <object id="${objId}" type="model" pid="1" pindex="${colorIndex}" name="${esc(p.name)}">
      <mesh>
        <vertices>
          ${vertXml.join('\n          ')}
        </vertices>
        <triangles>
          ${triXml.join('\n          ')}
        </triangles>
      </mesh>
    </object>`);

    componentXmls.push(`<component objectid="${objId}"/>`);
  });

  const modelXml = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US"
  xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"
  xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02">
  <metadata name="Title">Custom Multi-Material LED Lamp</metadata>
  <metadata name="Designer">LED Strip Lamp Studio</metadata>
  <metadata name="Application">Hugo Clicker Framework 3MF Engine</metadata>
  <resources>
    <m:colorgroup id="1">
      ${colorXmls.join('\n      ')}
    </m:colorgroup>
    ${objectXmls.join('\n')}
    <object id="1" type="model" name="Lamp_Assembly">
      <components>
        ${componentXmls.join('\n        ')}
      </components>
    </object>
  </resources>
  <build>
    <item objectid="1"/>
  </build>
</model>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>`;

  const relsXml = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`;

  // Orca / Bambu Slicer per-object config
  const isCloudLamp = parts.some((p) => p.name.toLowerCase().includes('cloud'));
  let modelSettingsXml = '';
  if (isCloudLamp) {
    modelSettingsXml = `<?xml version="1.0" encoding="UTF-8"?>
<config>
  <object id="10">
    <metadata key="fuzzy_skin" value="contour"/>
    <metadata key="fuzzy_skin_point_distance" value="0.8"/>
    <metadata key="fuzzy_skin_thickness" value="0.3"/>
    <metadata key="wall_loops" value="999"/>
  </object>
</config>`;
  }

  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(contentTypesXml),
    '_rels/.rels': strToU8(relsXml),
    '3D/3dmodel.model': strToU8(modelXml),
  };

  if (modelSettingsXml) {
    files['Metadata/model_settings.config'] = strToU8(modelSettingsXml);
  }

  const zipData = zipSync(files);
  const blob = new Blob([zipData], { type: 'application/vnd.ms-package.3dmanufacturing-3dmodel+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
