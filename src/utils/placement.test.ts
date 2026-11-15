import { describe, expect, it } from 'vitest';
import type { LabEquipment, LabZone } from '../types/lab';
import {
  aabbOverlap,
  clampToRoom,
  findOverlaps,
  getFootprint,
  resolveZoneId,
  snapToGrid,
} from './placement';

function makeEquip(overrides: Partial<LabEquipment> & { id: string }): LabEquipment {
  return {
    type: 'bench',
    label: 'Test',
    labelTh: 'ทดสอบ',
    zoneId: 'zone-1',
    x: 0,
    z: 0,
    width: 2,
    depth: 1,
    height: 0.55,
    baseY: 0,
    rotationDeg: 0,
    ...overrides,
  };
}

describe('placement utilities', () => {
  it('getFootprint handles 0/90/180/270 and arbitrary angles', () => {
    expect(getFootprint({ width: 3.0, depth: 0.85, rotationDeg: 0 })).toEqual({
      width: 3.0,
      depth: 0.85,
      halfW: 1.5,
      halfD: 0.425,
    });
    expect(getFootprint({ width: 3.0, depth: 0.85, rotationDeg: 90 })).toEqual({
      width: 0.85,
      depth: 3.0,
      halfW: 0.425,
      halfD: 1.5,
    });
    expect(getFootprint({ width: 3.0, depth: 0.85, rotationDeg: 180 })).toEqual({
      width: 3.0,
      depth: 0.85,
      halfW: 1.5,
      halfD: 0.425,
    });
    expect(getFootprint({ width: 3.0, depth: 0.85, rotationDeg: -90 })).toEqual({
      width: 0.85,
      depth: 3.0,
      halfW: 0.425,
      halfD: 1.5,
    });

    // 45 degrees bounding box for a 2x2 square = 2*sqrt(2)
    const rot45 = getFootprint({ width: 2, depth: 2, rotationDeg: 45 });
    expect(rot45.width).toBeCloseTo(Math.SQRT2 * 2, 5);
    expect(rot45.depth).toBeCloseTo(Math.SQRT2 * 2, 5);
  });

  it('clampToRoom clamps using rotated footprint so rotated items sit flush against walls', () => {
    const fp90 = getFootprint({ width: 3.0, depth: 0.85, rotationDeg: 90 });
    const clamped = clampToRoom({ x: 20, z: 20 }, fp90, 23.7, 11.6);

    // Room halfW = 11.85, item halfW after 90° = 0.425 -> maxX = 11.425
    expect(clamped.x).toBeCloseTo(11.425, 4);
    // Room halfD = 5.8, item halfD after 90° = 1.5 -> maxZ = 4.3
    expect(clamped.z).toBeCloseTo(4.3, 4);
  });

  it('snapToGrid snaps cleanly to arbitrary grid steps', () => {
    expect(snapToGrid(1.24, 0.1)).toBe(1.2);
    expect(snapToGrid(1.26, 0.1)).toBe(1.3);
    expect(snapToGrid(1.37, 0.25)).toBe(1.25);
    expect(snapToGrid(1.38, 0.25)).toBe(1.5);
    expect(snapToGrid(-0.01, 0.25)).toBe(0);
  });

  it('aabbOverlap returns false when edges merely touch and true when intersecting', () => {
    const a = { minX: 0, maxX: 2, minZ: 0, maxZ: 2 };
    const touching = { minX: 2, maxX: 4, minZ: 0, maxZ: 2 };
    const overlapping = { minX: 1.5, maxX: 3.5, minZ: 1.5, maxZ: 3.5 };

    expect(aabbOverlap(a, touching)).toBe(false);
    expect(aabbOverlap(a, overlapping)).toBe(true);
  });

  it('findOverlaps checks both rotated XZ footprint and vertical [baseY, baseY + height] range', () => {
    const bench = makeEquip({
      id: 'bench-1',
      x: 0,
      z: 0,
      width: 3,
      depth: 1,
      height: 0.55,
      baseY: 0,
    });
    const centrifugeOnBench = makeEquip({
      id: 'centrifuge-1',
      type: 'centrifuge',
      x: -0.5,
      z: 0,
      width: 0.8,
      depth: 0.6,
      height: 0.35,
      baseY: 0.55,
    });
    const microscopeOnBench = makeEquip({
      id: 'microscope-1',
      type: 'microscope',
      x: -0.3, // overlaps centrifuge-1 in XZ AND same Y elevation [0.55, 0.90]
      z: 0,
      width: 0.6,
      depth: 0.5,
      height: 0.36,
      baseY: 0.55,
    });
    const cabinetOnFloor = makeEquip({
      id: 'cabinet-1',
      type: 'cabinet',
      x: 0.8, // overlaps bench-1 in XZ AND Y [0, 1.3] overlaps [0, 0.55]
      z: 0,
      width: 1,
      depth: 0.8,
      height: 1.3,
      baseY: 0,
    });

    const others = [bench, centrifugeOnBench, microscopeOnBench, cabinetOnFloor];

    // Centrifuge sitting on bench must NOT collide with bench, but MUST collide with microscope
    const centOverlaps = findOverlaps(centrifugeOnBench, others);
    expect(centOverlaps.map((o) => o.id)).toEqual(['microscope-1']);

    // Respects ignoreIds
    const ignored = findOverlaps(centrifugeOnBench, others, ['microscope-1']);
    expect(ignored).toHaveLength(0);

    // Floor cabinet collides with bench
    const cabOverlaps = findOverlaps(cabinetOnFloor, others);
    expect(cabOverlaps.map((o) => o.id)).toEqual(['bench-1']);
  });

  it('resolveZoneId returns containing zone (closest center on overlap) and null outside', () => {
    const zones: LabZone[] = [
      {
        id: 'zone-a',
        name: 'A',
        nameTh: 'โซน A',
        category: 'clean',
        x: -4,
        z: 0,
        width: 4,
        depth: 4,
        color: '#5DCAA5',
        description: '',
      },
      {
        id: 'zone-b',
        name: 'B',
        nameTh: 'โซน B',
        category: 'dirty',
        x: 4,
        z: 0,
        width: 4,
        depth: 4,
        color: '#F0997B',
        description: '',
      },
    ];

    expect(resolveZoneId({ x: -3.5, z: 0.5 }, zones)).toBe('zone-a');
    expect(resolveZoneId({ x: 4.5, z: -1 }, zones)).toBe('zone-b');
    expect(resolveZoneId({ x: 0, z: 0 }, zones)).toBeNull();
    expect(resolveZoneId({ x: 2.5, z: 0 }, zones, { fallbackToNearest: true })).toBe('zone-b');
  });
});
