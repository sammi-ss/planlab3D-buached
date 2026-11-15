import * as THREE from 'three';
import type { LabEquipment } from '../types/lab';

export function createFloorTileTexture(
  isDark: boolean,
  maxAnisotropy: number,
  labWidth = 23.7,
  labDepth = 11.6,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = isDark ? '#1a2220' : '#eceae3';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle clinical 1m x 1m tile grid lines (each tile = 256px -> repeat calibrated to meters)
  ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(29,42,42,0.07)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 512; i += 128) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 512);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(512, i);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(labWidth / 2, labDepth / 2);
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createSpriteLabel(
  text: string,
  subtext: string | undefined,
  isDark: boolean,
  maxAnisotropy: number,
  scaleFactor = 1,
): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, 512, 128);
  const bg = isDark ? 'rgba(20, 29, 26, 0.88)' : 'rgba(255, 255, 255, 0.94)';
  const border = isDark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(15, 23, 42, 0.14)';
  const ink = isDark ? '#f1f5f9' : '#1e293b';
  const inkMuted = isDark ? '#94a3b8' : '#64748b';

  // Rounded pill-free architectural card
  const x = 16;
  const y = 14;
  const w = 480;
  const h = 100;
  const r = 14;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = border;
  ctx.stroke();

  ctx.fillStyle = ink;
  ctx.font = '600 34px "IBM Plex Sans Thai", "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (subtext) {
    ctx.fillText(text, 256, 48);
    ctx.fillStyle = inkMuted;
    ctx.font = '500 22px "IBM Plex Sans Thai", "JetBrains Mono", monospace';
    ctx.fillText(subtext, 256, 86);
  } else {
    ctx.fillText(text, 256, 64);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;

  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      depthTest: false,
      transparent: true,
    }),
  );
  sprite.scale.set(2.8 * scaleFactor, 0.7 * scaleFactor, 1);
  sprite.renderOrder = 10;
  return sprite;
}

export function createMachineTagSprite(
  text: string,
  isDark: boolean,
  maxAnisotropy: number,
): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 104;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, 512, 104);
  const bg = isDark ? 'rgba(15, 23, 21, 0.92)' : 'rgba(255, 255, 255, 0.96)';
  const border = isDark ? '#2dd4bf' : '#0f766e';
  const ink = isDark ? '#f8fafc' : '#0f172a';

  const x = 14;
  const y = 12;
  const w = 484;
  const h = 76;
  const r = 10;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = border;
  ctx.stroke();

  ctx.fillStyle = ink;
  ctx.font = '600 32px "Plus Jakarta Sans", "IBM Plex Sans Thai", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 51);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;

  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      depthTest: false,
      transparent: true,
    }),
  );
  sprite.scale.set(2.15, 0.44, 1);
  sprite.renderOrder = 11;
  return sprite;
}

function addPart(
  group: THREE.Group,
  geometry: THREE.BufferGeometry,
  color: THREE.ColorRepresentation,
  px: number,
  py: number,
  pz: number,
  opts: {
    roughness?: number;
    metalness?: number;
    opacity?: number;
    emissive?: THREE.ColorRepresentation;
    emissiveIntensity?: number;
    castShadow?: boolean;
    receiveShadow?: boolean;
  } = {},
): THREE.Mesh {
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.55,
    metalness: opts.metalness ?? 0.05,
    transparent: opts.opacity !== undefined && opts.opacity < 1,
    opacity: opts.opacity ?? 1,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
  });
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.position.set(px, py, pz);
  mesh.castShadow = opts.castShadow ?? (opts.opacity === undefined || opts.opacity >= 0.9);
  mesh.receiveShadow = opts.receiveShadow ?? true;
  group.add(mesh);
  return mesh;
}

/**
 * Builds a composite multi-part procedural 3D group (pivot at bottom-center y=0)
 * scaled faithfully to item.width, item.depth, and item.height in meters.
 */
export function buildEquipmentGroup(item: LabEquipment): THREE.Group {
  const group = new THREE.Group();
  const w = Math.max(0.25, item.width);
  const d = Math.max(0.25, item.depth);
  const h = Math.max(0.15, item.height);

  switch (item.type) {
    case 'bench': {
      const bodyH = Math.max(0.1, h - 0.05);
      // Base cabinet plinth + body + epoxy worktop + backsplash
      addPart(group, new THREE.BoxGeometry(w * 0.96, 0.06, d * 0.92), 0x475569, 0, 0.03, 0, { roughness: 0.78 });
      addPart(group, new THREE.BoxGeometry(w, bodyH - 0.06, d), 0xd8d4c8, 0, 0.06 + (bodyH - 0.06) / 2, 0, { roughness: 0.68 });
      // Drawer seam accents
      addPart(group, new THREE.BoxGeometry(w * 0.94, 0.015, 0.02), 0x94a3b8, 0, bodyH * 0.65, d / 2 + 0.005, { roughness: 0.4, metalness: 0.4 });
      // Epoxy chemical-resistant top
      addPart(group, new THREE.BoxGeometry(w + 0.05, 0.05, d + 0.05), 0x718c99, 0, bodyH + 0.025, 0, { roughness: 0.3, metalness: 0.08 });
      // Subtle rear lip
      addPart(group, new THREE.BoxGeometry(w + 0.04, 0.06, 0.03), 0x5c7480, 0, bodyH + 0.08, -d / 2, { roughness: 0.35 });
      break;
    }

    case 'sink': {
      const baseH = 0.5;
      addPart(group, new THREE.BoxGeometry(w, baseH, d), 0xd6d2c6, 0, baseH / 2, 0, { roughness: 0.68 });
      addPart(group, new THREE.BoxGeometry(w + 0.04, 0.05, d + 0.04), 0x85b7eb, 0, baseH + 0.025, 0, { roughness: 0.25, metalness: 0.1 });
      // Stainless steel basin recess
      addPart(group, new THREE.BoxGeometry(w * 0.62, 0.03, d * 0.56), 0x1e293b, 0, baseH + 0.045, d * 0.06, { roughness: 0.28, metalness: 0.65 });
      // Chrome faucet riser & gooseneck spout
      addPart(group, new THREE.CylinderGeometry(0.03, 0.035, 0.26, 16), 0xe2e8f0, 0, baseH + 0.18, -d * 0.32, { roughness: 0.18, metalness: 0.88 });
      addPart(group, new THREE.BoxGeometry(0.05, 0.035, d * 0.24), 0xe2e8f0, 0, baseH + 0.3, -d * 0.22, { roughness: 0.18, metalness: 0.88 });
      // Lever handle
      addPart(group, new THREE.BoxGeometry(0.1, 0.02, 0.02), 0x38bdf8, 0.06, baseH + 0.12, -d * 0.32, { roughness: 0.3, metalness: 0.5 });
      break;
    }

    case 'analyzer': {
      const col = item.color ?? 0xeeeeea;
      // Lower chassis
      addPart(group, new THREE.BoxGeometry(w, h * 0.68, d), col, 0, h * 0.34, 0, { roughness: 0.42, metalness: 0.12 });
      // Sample carousel / upper cover
      addPart(group, new THREE.BoxGeometry(w * 0.94, h * 0.28, d * 0.86), 0xf8fafc, 0, h * 0.82, -d * 0.04, { roughness: 0.32, metalness: 0.1 });
      // Dark touchscreen display
      addPart(group, new THREE.BoxGeometry(w * 0.38, h * 0.38, 0.04), 0x0f172a, -w * 0.22, h * 0.68, d / 2 + 0.015, { roughness: 0.18, metalness: 0.2 });
      // Teal/cyan status accent bar
      addPart(group, new THREE.BoxGeometry(w * 0.88, 0.025, 0.02), 0x14b8a6, 0, h * 0.56, d / 2 + 0.01, { roughness: 0.3 });
      // Reagent intake bay
      addPart(group, new THREE.CylinderGeometry(Math.min(w, d) * 0.14, Math.min(w, d) * 0.14, 0.05, 16), 0x334155, w * 0.22, h * 0.97, 0, { roughness: 0.35, metalness: 0.6 });
      break;
    }

    case 'bsc': {
      // Base stand legs + lower frame
      addPart(group, new THREE.BoxGeometry(w, 0.48, d), 0xdad6ca, 0, 0.24, 0, { roughness: 0.68 });
      // Stainless work deck
      addPart(group, new THREE.BoxGeometry(w * 0.94, 0.05, d * 0.9), 0x334155, 0, 0.505, 0, { roughness: 0.3, metalness: 0.6 });
      // Main cabinet body
      addPart(group, new THREE.BoxGeometry(w, h - 0.58, d * 0.86), 0xeceff1, 0, 0.53 + (h - 0.58) / 2, -d * 0.06, { roughness: 0.42, metalness: 0.15 });
      // Front transparent sliding glass sash
      addPart(group, new THREE.BoxGeometry(w * 0.9, (h - 0.68) * 0.72, 0.03), 0x93c5fd, 0, 0.88, d * 0.42, { roughness: 0.12, metalness: 0.1, opacity: 0.52 });
      // HEPA top plenum header
      addPart(group, new THREE.BoxGeometry(w + 0.02, 0.1, d + 0.02), 0xcfd5d8, 0, h - 0.05, 0, { roughness: 0.35, metalness: 0.35 });
      // Control panel strip
      addPart(group, new THREE.BoxGeometry(w * 0.5, 0.06, 0.03), 0x0f172a, 0, h - 0.12, d / 2 + 0.01, { roughness: 0.2 });
      break;
    }

    case 'hood': {
      // Lower chemical storage cabinet
      addPart(group, new THREE.BoxGeometry(w, 0.52, d), 0xd8dce0, 0, 0.26, 0, { roughness: 0.55 });
      // Dark chemical-resistant epoxy deck
      addPart(group, new THREE.BoxGeometry(w * 0.96, 0.04, d * 0.96), 0x1e293b, 0, 0.54, 0, { roughness: 0.35 });
      // Back & side fume hood chamber walls
      addPart(group, new THREE.BoxGeometry(w, h - 0.62, d * 0.2), 0xe2e8f0, 0, 0.56 + (h - 0.62) / 2, -d * 0.4, { roughness: 0.45 });
      addPart(group, new THREE.BoxGeometry(0.06, h - 0.62, d * 0.8), 0xe2e8f0, -w / 2 + 0.03, 0.56 + (h - 0.62) / 2, 0, { roughness: 0.45 });
      addPart(group, new THREE.BoxGeometry(0.06, h - 0.62, d * 0.8), 0xe2e8f0, w / 2 - 0.03, 0.56 + (h - 0.62) / 2, 0, { roughness: 0.45 });
      // Front transparent glass sash
      addPart(group, new THREE.BoxGeometry(w * 0.88, (h - 0.7) * 0.7, 0.025), 0xbae6fd, 0, 0.92, d * 0.38, { roughness: 0.12, opacity: 0.48 });
      // Upper exhaust canopy + amber/slate fascia + top duct collar
      addPart(group, new THREE.BoxGeometry(w + 0.02, 0.14, d + 0.02), 0x94a3b8, 0, h - 0.07, 0, { roughness: 0.38, metalness: 0.35 });
      addPart(group, new THREE.CylinderGeometry(0.14, 0.16, 0.18, 18), 0x64748b, 0, h + 0.09, -d * 0.12, { roughness: 0.35, metalness: 0.55 });
      break;
    }

    case 'microscope': {
      addPart(group, new THREE.BoxGeometry(w * 0.75, 0.04, d * 0.75), 0x334155, 0, 0.02, 0, { roughness: 0.45, metalness: 0.4 });
      addPart(group, new THREE.BoxGeometry(w * 0.26, h * 0.68, d * 0.32), 0x1e293b, 0, h * 0.36, -d * 0.16, { roughness: 0.4, metalness: 0.3 });
      // Stage
      addPart(group, new THREE.BoxGeometry(w * 0.5, 0.02, d * 0.42), 0x0f172a, 0, h * 0.38, d * 0.06, { roughness: 0.25, metalness: 0.7 });
      // Objective turret & binocular head
      addPart(group, new THREE.CylinderGeometry(0.05, 0.06, 0.1, 14), 0x94a3b8, 0, h * 0.58, d * 0.05, { roughness: 0.22, metalness: 0.85 });
      addPart(group, new THREE.CylinderGeometry(0.035, 0.04, 0.14, 14), 0x1e293b, 0, h * 0.82, d * 0.14, { roughness: 0.35 });
      break;
    }

    case 'centrifuge': {
      addPart(group, new THREE.BoxGeometry(w, h * 0.75, d), 0xe9e9e6, 0, h * 0.375, 0, { roughness: 0.42 });
      addPart(group, new THREE.CylinderGeometry(Math.min(w, d) * 0.38, Math.min(w, d) * 0.4, h * 0.22, 22), 0xc6cacd, 0, h * 0.85, 0, { roughness: 0.3, metalness: 0.5 });
      // Digital RPM panel
      addPart(group, new THREE.BoxGeometry(w * 0.56, h * 0.24, 0.03), 0x0f172a, 0, h * 0.35, d / 2 + 0.01, { roughness: 0.2 });
      break;
    }

    case 'doubleGlassFridge':
    case 'fridge': {
      const isDoubleDoor = item.type === 'doubleGlassFridge' || w >= 1.05 || item.label.includes('2 บาน') || item.label.includes('2 ประตู');
      addPart(group, new THREE.BoxGeometry(w, h, d), 0xf8fafc, 0, h / 2, 0, { roughness: 0.35, metalness: 0.1 });

      if (isDoubleDoor) {
        // Top illuminated canopy / header lightbox
        const canopyH = 0.18;
        addPart(group, new THREE.BoxGeometry(w * 0.99, canopyH, 0.04), 0x0f172a, 0, h - canopyH / 2 - 0.02, d / 2 + 0.015, { roughness: 0.25, metalness: 0.2 });
        // Digital temperature readout LED badge (+4.0°C)
        addPart(group, new THREE.BoxGeometry(0.26, 0.07, 0.02), 0x06b6d4, 0, h - canopyH / 2 - 0.02, d / 2 + 0.028, { roughness: 0.1, emissive: 0x06b6d4, emissiveIntensity: 0.6 });
        // Illuminated brand/accent strip
        addPart(group, new THREE.BoxGeometry(w * 0.72, 0.02, 0.015), 0x38bdf8, 0, h - 0.04, d / 2 + 0.028, { roughness: 0.2 });

        // Bottom compressor / ventilation kickplate
        const kickH = 0.16;
        addPart(group, new THREE.BoxGeometry(w * 0.98, kickH, 0.04), 0x334155, 0, kickH / 2 + 0.02, d / 2 + 0.012, { roughness: 0.5, metalness: 0.3 });
        for (let k = 0; k < 3; k++) {
          addPart(group, new THREE.BoxGeometry(w * 0.88, 0.015, 0.012), 0x1e293b, 0, 0.05 + k * 0.038, d / 2 + 0.025, { roughness: 0.6 });
        }

        // Middle double-door glass section
        const doorH = h - canopyH - kickH - 0.08;
        const doorCenterY = kickH + 0.04 + doorH / 2;
        const doorW = w * 0.44;

        // Internal wire shelves visible through glass
        const shelfLevels = [0.45, 0.75, 1.05];
        shelfLevels.forEach((lvl, sIdx) => {
          if (lvl < h - 0.3) {
            addPart(group, new THREE.BoxGeometry(w * 0.88, 0.02, d * 0.65), 0xd1d5db, 0, lvl, 0, { roughness: 0.4, metalness: 0.4 });
            const packCols = [0x0f766e, 0x2563eb, 0xd97706];
            [-w * 0.24, w * 0.24].forEach((px, pIdx) => {
              addPart(group, new THREE.BoxGeometry(0.16, 0.12, 0.22), packCols[(sIdx + pIdx) % packCols.length], px, lvl + 0.07, -0.05, { roughness: 0.6 });
            });
          }
        });

        // Center dividing mullion post
        addPart(group, new THREE.BoxGeometry(0.035, doorH, 0.04), 0x64748b, 0, doorCenterY, d / 2 + 0.015, { roughness: 0.3, metalness: 0.6 });

        // Left glass door (frame + glass pane + vertical handle on right edge)
        addPart(group, new THREE.BoxGeometry(doorW, doorH, 0.03), 0xe2e8f0, -w * 0.24, doorCenterY, d / 2 + 0.012, { roughness: 0.3, metalness: 0.5 });
        addPart(group, new THREE.BoxGeometry(doorW - 0.06, doorH - 0.06, 0.015), 0xbfdbfe, -w * 0.24, doorCenterY, d / 2 + 0.022, { roughness: 0.12, opacity: 0.45 });
        addPart(group, new THREE.BoxGeometry(0.022, doorH * 0.42, 0.03), 0x1e293b, -0.045, doorCenterY, d / 2 + 0.038, { roughness: 0.25, metalness: 0.75 });

        // Right glass door (frame + glass pane + vertical handle on left edge)
        addPart(group, new THREE.BoxGeometry(doorW, doorH, 0.03), 0xe2e8f0, w * 0.24, doorCenterY, d / 2 + 0.012, { roughness: 0.3, metalness: 0.5 });
        addPart(group, new THREE.BoxGeometry(doorW - 0.06, doorH - 0.06, 0.015), 0xbfdbfe, w * 0.24, doorCenterY, d / 2 + 0.022, { roughness: 0.12, opacity: 0.45 });
        addPart(group, new THREE.BoxGeometry(0.022, doorH * 0.42, 0.03), 0x1e293b, 0.045, doorCenterY, d / 2 + 0.038, { roughness: 0.25, metalness: 0.75 });
      } else {
        // Compact single-door refrigerator (e.g. Blood bank fridge)
        addPart(group, new THREE.BoxGeometry(w * 0.72, h * 0.62, 0.03), 0xbfdbfe, -w * 0.04, h * 0.56, d / 2 + 0.01, { roughness: 0.15, opacity: 0.58 });
        addPart(group, new THREE.BoxGeometry(0.04, h * 0.45, 0.04), 0x475569, w * 0.38, h * 0.52, d / 2 + 0.03, { roughness: 0.25, metalness: 0.7 });
        addPart(group, new THREE.BoxGeometry(w * 0.84, 0.09, 0.03), 0x0f172a, 0, h - 0.08, d / 2 + 0.01, { roughness: 0.2 });
      }
      break;
    }

    case 'pc': {
      // Stand + base + monitor + keyboard
      addPart(group, new THREE.BoxGeometry(w * 0.22, h * 0.35, d * 0.18), 0x334155, 0, h * 0.175, -d * 0.15, { roughness: 0.5 });
      addPart(group, new THREE.BoxGeometry(w * 0.74, h * 0.65, 0.04), 0x1e293b, 0, h * 0.62, -d * 0.15, { roughness: 0.28 });
      // Screen glow surface
      addPart(group, new THREE.BoxGeometry(w * 0.68, h * 0.54, 0.015), 0x0ea5e9, 0, h * 0.62, -d * 0.125, { roughness: 0.15, metalness: 0.1 });
      // Keyboard + mouse pad
      addPart(group, new THREE.BoxGeometry(w * 0.62, 0.025, d * 0.28), 0xdcdcdc, 0, 0.015, d * 0.22, { roughness: 0.65 });
      break;
    }

    case 'shelf': {
      // 4 corner posts
      const postGeo = new THREE.BoxGeometry(0.045, h, 0.045);
      const corners = [
        [-w / 2 + 0.03, -d / 2 + 0.03],
        [w / 2 - 0.03, -d / 2 + 0.03],
        [-w / 2 + 0.03, d / 2 - 0.03],
        [w / 2 - 0.03, d / 2 - 0.03],
      ];
      for (const [cx, cz] of corners) {
        addPart(group, postGeo, 0x8d979d, cx, h / 2, cz, { roughness: 0.4, metalness: 0.55 });
      }
      // 4 shelf levels + color-coded supply bins
      const boxColors = [0xe0a29a, 0x9bc8b6, 0xe9d28b];
      [0.2, 0.52, 0.86, 1.2].forEach((lvl, idx) => {
        if (lvl <= h) {
          addPart(group, new THREE.BoxGeometry(w, 0.03, d), 0xb9c0c4, 0, lvl, 0, { roughness: 0.5, metalness: 0.3 });
          if (lvl < h - 0.15) {
            addPart(group, new THREE.BoxGeometry(w * 0.42, 0.16, d * 0.55), boxColors[idx % boxColors.length], -w * 0.18, lvl + 0.095, 0, { roughness: 0.72 });
          }
        }
      });
      break;
    }

    case 'cabinet': {
      const col = item.color ?? 0xdde3e6;
      addPart(group, new THREE.BoxGeometry(w, h, d), col, 0, h / 2, 0, { roughness: 0.52, metalness: 0.12 });
      // Center seam + handles
      addPart(group, new THREE.BoxGeometry(0.015, h * 0.88, 0.02), 0x64748b, 0, h / 2, d / 2 + 0.006, { roughness: 0.4 });
      addPart(group, new THREE.BoxGeometry(0.025, 0.14, 0.025), 0x334155, -0.05, h * 0.55, d / 2 + 0.015, { roughness: 0.3, metalness: 0.65 });
      addPart(group, new THREE.BoxGeometry(0.025, 0.14, 0.025), 0x334155, 0.05, h * 0.55, d / 2 + 0.015, { roughness: 0.3, metalness: 0.65 });
      break;
    }

    case 'docCabinet': {
      const col = item.color ?? 0xb5bcc0;
      const lowerH = h * 0.46;
      const upperH = h - lowerH;

      // Solid lower cabinet section + double door seam + handles
      addPart(group, new THREE.BoxGeometry(w, lowerH, d), col, 0, lowerH / 2, 0, { roughness: 0.52, metalness: 0.15 });
      addPart(group, new THREE.BoxGeometry(0.015, lowerH * 0.9, 0.018), 0x64748b, 0, lowerH / 2, d / 2 + 0.004, { roughness: 0.4 });
      addPart(group, new THREE.BoxGeometry(0.024, 0.11, 0.024), 0x334155, -0.05, lowerH * 0.72, d / 2 + 0.015, { roughness: 0.3, metalness: 0.65 });
      addPart(group, new THREE.BoxGeometry(0.024, 0.11, 0.024), 0x334155, 0.05, lowerH * 0.72, d / 2 + 0.015, { roughness: 0.3, metalness: 0.65 });

      // Upper open frame (back, sides, top, inner shelf)
      addPart(group, new THREE.BoxGeometry(w, upperH, 0.04), col, 0, lowerH + upperH / 2, -d / 2 + 0.02, { roughness: 0.52, metalness: 0.15 });
      addPart(group, new THREE.BoxGeometry(0.04, upperH, d), col, -w / 2 + 0.02, lowerH + upperH / 2, 0, { roughness: 0.52, metalness: 0.15 });
      addPart(group, new THREE.BoxGeometry(0.04, upperH, d), col, w / 2 - 0.02, lowerH + upperH / 2, 0, { roughness: 0.52, metalness: 0.15 });
      addPart(group, new THREE.BoxGeometry(w, 0.04, d), col, 0, h - 0.02, 0, { roughness: 0.52, metalness: 0.15 });
      addPart(group, new THREE.BoxGeometry(w - 0.06, 0.025, d - 0.06), 0xcbd5e1, 0, lowerH + upperH * 0.5, 0, { roughness: 0.5 });

      // Document binders inside upper glass shelves
      const binderColors = [0x0f766e, 0x1d4ed8, 0x475569, 0xd97706, 0x0f766e];
      for (let row = 0; row < 2; row++) {
        const shelfBaseY = lowerH + row * (upperH * 0.5) + 0.02;
        for (let b = 0; b < 5; b++) {
          const bx = -w * 0.34 + b * (w * 0.14);
          addPart(
            group,
            new THREE.BoxGeometry(w * 0.09, upperH * 0.36, d * 0.55),
            binderColors[(b + row) % binderColors.length],
            bx,
            shelfBaseY + upperH * 0.18,
            -0.02,
            { roughness: 0.65 },
          );
        }
      }

      // Upper glass doors + center frame & handles (+Z front)
      addPart(group, new THREE.BoxGeometry(w * 0.45, upperH - 0.06, 0.02), 0xbae6fd, -w * 0.24, lowerH + upperH / 2, d / 2 - 0.015, { roughness: 0.12, metalness: 0.08, opacity: 0.42 });
      addPart(group, new THREE.BoxGeometry(w * 0.45, upperH - 0.06, 0.02), 0xbae6fd, w * 0.24, lowerH + upperH / 2, d / 2 - 0.015, { roughness: 0.12, metalness: 0.08, opacity: 0.42 });
      addPart(group, new THREE.BoxGeometry(0.03, upperH - 0.04, 0.028), col, 0, lowerH + upperH / 2, d / 2 - 0.012, { roughness: 0.4, metalness: 0.25 });
      addPart(group, new THREE.BoxGeometry(0.022, 0.09, 0.022), 0x334155, -0.045, lowerH + upperH * 0.26, d / 2 + 0.01, { roughness: 0.3, metalness: 0.65 });
      addPart(group, new THREE.BoxGeometry(0.022, 0.09, 0.022), 0x334155, 0.045, lowerH + upperH * 0.26, d / 2 + 0.01, { roughness: 0.3, metalness: 0.65 });
      break;
    }

    case 'bin': {
      const radius = Math.min(w, d) / 2;
      addPart(group, new THREE.CylinderGeometry(radius * 0.9, radius * 0.8, h * 0.85, 20), 0xd9d9d6, 0, h * 0.425, 0, { roughness: 0.62 });
      addPart(group, new THREE.CylinderGeometry(radius, radius * 0.96, h * 0.15, 20), item.color ?? 0xd13b3b, 0, h * 0.925, 0, { roughness: 0.4 });
      break;
    }

    case 'chair': {
      // Base cylinder + seat + backrest + phlebotomy armrest
      addPart(group, new THREE.CylinderGeometry(0.05, 0.18, 0.3, 16), 0x475569, 0, 0.15, 0, { roughness: 0.35, metalness: 0.7 });
      addPart(group, new THREE.BoxGeometry(w * 0.7, 0.07, d * 0.8), 0x2f5584, -w * 0.1, 0.34, 0, { roughness: 0.75 });
      addPart(group, new THREE.BoxGeometry(w * 0.7, 0.4, 0.08), 0x2f5584, -w * 0.1, 0.56, -d * 0.36, { roughness: 0.75 });
      addPart(group, new THREE.BoxGeometry(w * 0.26, 0.06, d * 0.65), 0x1e3a5f, w * 0.34, 0.56, 0, { roughness: 0.65 });
      break;
    }

    case 'officeChair': {
      // 5-star wheel base + gas lift + seat + ergonomic backrest
      addPart(group, new THREE.CylinderGeometry(0.2, 0.22, 0.05, 16), 0x334155, 0, 0.025, 0, { roughness: 0.45, metalness: 0.5 });
      addPart(group, new THREE.CylinderGeometry(0.035, 0.04, 0.28, 12), 0x475569, 0, 0.18, 0, { roughness: 0.3, metalness: 0.75 });
      addPart(group, new THREE.BoxGeometry(w * 0.76, 0.06, d * 0.74), 0x1e293b, 0, 0.34, 0, { roughness: 0.78 });
      addPart(group, new THREE.BoxGeometry(w * 0.7, 0.36, 0.06), 0x0f766e, 0, 0.54, -d * 0.34, { roughness: 0.72 });
      break;
    }

    case 'hemoLine': {
      addPart(group, new THREE.BoxGeometry(w, h, d), 0xcfd3d6, 0, h / 2, 0, { roughness: 0.36, metalness: 0.48 });
      addPart(group, new THREE.BoxGeometry(0.05, h * 0.82, d * 0.88), 0x93c5fd, w / 2 + 0.015, h * 0.5, 0, { roughness: 0.18, opacity: 0.55 });
      addPart(group, new THREE.BoxGeometry(w * 0.75, 0.06, 0.1), 0x0f172a, 0, h - 0.08, -d * 0.4, { roughness: 0.2 });
      break;
    }

    case 'rack': {
      addPart(group, new THREE.BoxGeometry(w, 0.55, d), 0xd6d2c6, 0, 0.275, 0, { roughness: 0.65 });
      addPart(group, new THREE.BoxGeometry(w + 0.02, 0.04, d + 0.02), 0x718c99, 0, 0.57, 0, { roughness: 0.35 });
      const tubeColors = [0xe0a29a, 0x9bc8b6, 0xe9d28b];
      for (let i = 0; i < 6; i++) {
        const px = -w * 0.38 + (i / 5) * (w * 0.76);
        addPart(group, new THREE.BoxGeometry(w * 0.1, 0.18, d * 0.48), tubeColors[i % 3], px, 0.68, 0, { roughness: 0.45 });
      }
      break;
    }

    default: {
      addPart(group, new THREE.BoxGeometry(w, h, d), item.color ?? 0xcfd5d8, 0, h / 2, 0, { roughness: 0.5 });
      break;
    }
  }

  return group;
}

export function disposeObject3D(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      mesh.geometry?.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((m) => {
        if (!m) return;
        const std = m as THREE.MeshStandardMaterial;
        std.map?.dispose();
        m.dispose();
      });
    } else if ((child as THREE.Sprite).isSprite) {
      const spr = child as THREE.Sprite;
      spr.material.map?.dispose();
      spr.material.dispose();
    }
  });
}
