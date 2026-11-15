import type { LabEquipment, LabZone } from '../types/lab';

export interface Footprint {
  width: number;
  depth: number;
  halfW: number;
  halfD: number;
}

export interface AABB2D {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface AABB3D extends AABB2D {
  minY: number;
  maxY: number;
}

export interface SpatialBoxInput {
  id?: string;
  x?: number;
  z?: number;
  width: number;
  depth: number;
  height?: number;
  baseY?: number;
  rotationDeg?: number;
}

const DEFAULT_EPSILON = 1e-6;

function round6(val: number): number {
  return Number(val.toFixed(6));
}

/**
 * Compute axis-aligned bounding footprint on XZ plane after rotating around Y by rotationDeg.
 * Exact for 0/90/180/270 and tight bounding box for arbitrary angles.
 */
export function getFootprint(
  item: Pick<LabEquipment, 'width' | 'depth'> & { rotationDeg?: number },
): Footprint {
  const width = Math.max(0, item.width);
  const depth = Math.max(0, item.depth);
  const rawDeg = item.rotationDeg ?? 0;
  const normDeg = ((rawDeg % 360) + 360) % 360;

  let rotW: number;
  let rotD: number;

  if (Math.abs(normDeg) < 1e-9 || Math.abs(normDeg - 180) < 1e-9 || Math.abs(normDeg - 360) < 1e-9) {
    rotW = width;
    rotD = depth;
  } else if (Math.abs(normDeg - 90) < 1e-9 || Math.abs(normDeg - 270) < 1e-9) {
    rotW = depth;
    rotD = width;
  } else {
    const rad = (normDeg * Math.PI) / 180;
    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));
    rotW = width * cos + depth * sin;
    rotD = width * sin + depth * cos;
  }

  return {
    width: round6(rotW),
    depth: round6(rotD),
    halfW: round6(rotW / 2),
    halfD: round6(rotD / 2),
  };
}

/**
 * Clamp a center point {x, z} so the footprint stays fully inside the room [-labWidth/2, labWidth/2] x [-labDepth/2, labDepth/2].
 */
export function clampToRoom(
  center: { x: number; z: number },
  footprint: Footprint | { width: number; depth: number } | { halfW: number; halfD: number },
  labWidth: number,
  labDepth: number,
): { x: number; z: number } {
  const halfW = 'halfW' in footprint ? footprint.halfW : footprint.width / 2;
  const halfD = 'halfD' in footprint ? footprint.halfD : footprint.depth / 2;

  const maxX = Math.max(0, labWidth / 2 - halfW);
  const maxZ = Math.max(0, labDepth / 2 - halfD);

  return {
    x: Math.min(maxX, Math.max(-maxX, center.x)),
    z: Math.min(maxZ, Math.max(-maxZ, center.z)),
  };
}

/**
 * Snap a scalar coordinate value to the nearest grid step.
 */
export function snapToGrid(value: number, step = 0.1): number {
  if (!Number.isFinite(step) || step <= 0) return value;
  const snapped = Math.round(value / step) * step;
  return Object.is(snapped, -0) ? 0 : round6(snapped);
}

/**
 * Build a 3D AABB for any spatial item (equipment, wall, opening).
 */
export function getItemAABB(item: SpatialBoxInput): AABB3D {
  const fp = getFootprint(item);
  const cx = item.x ?? 0;
  const cz = item.z ?? 0;
  const minY = item.baseY ?? 0;
  const maxY = typeof item.height === 'number' ? minY + Math.max(0, item.height) : Infinity;

  return {
    minX: round6(cx - fp.halfW),
    maxX: round6(cx + fp.halfW),
    minZ: round6(cz - fp.halfD),
    maxZ: round6(cz + fp.halfD),
    minY: round6(minY),
    maxY: maxY === Infinity ? Infinity : round6(maxY),
  };
}

/**
 * Check whether two 2D AABBs strictly overlap on the XZ plane (touching edges do NOT count).
 */
export function aabbOverlap(a: AABB2D, b: AABB2D, epsilon = DEFAULT_EPSILON): boolean {
  return (
    a.minX < b.maxX - epsilon &&
    a.maxX > b.minX + epsilon &&
    a.minZ < b.maxZ - epsilon &&
    a.maxZ > b.minZ + epsilon
  );
}

/**
 * Check whether two vertical [minY, maxY] intervals strictly overlap (touching surfaces like benchtop at 0.55 and machine baseY=0.55 do NOT count).
 */
export function verticalOverlap(
  a: { minY: number; maxY: number },
  b: { minY: number; maxY: number },
  epsilon = DEFAULT_EPSILON,
): boolean {
  return a.minY < b.maxY - epsilon && a.maxY > b.minY + epsilon;
}

/**
 * Find all items in `others` whose 3D bounding volume overlaps `item`,
 * considering rotated XZ footprint AND vertical [baseY, baseY + height] range.
 * Benchtop items (e.g. baseY=0.55) resting on a bench (height=0.55) do not collide with the bench.
 */
export function findOverlaps<T extends SpatialBoxInput & { id: string }>(
  item: SpatialBoxInput,
  others: readonly T[],
  ignoreIds?: Iterable<string> | null,
): T[] {
  const ignore = new Set<string>(ignoreIds ?? []);
  if (item.id) {
    ignore.add(item.id);
  }

  const itemBox = getItemAABB(item);
  const result: T[] = [];

  for (const other of others) {
    if (ignore.has(other.id)) continue;
    const otherBox = getItemAABB(other);
    if (aabbOverlap(itemBox, otherBox) && verticalOverlap(itemBox, otherBox)) {
      result.push(other);
    }
  }

  return result;
}

export interface ResolveZoneOptions {
  fallbackToNearest?: boolean;
}

/**
 * Resolve which zoneId contains the given 2D point {x, z}.
 * If multiple zones contain the point, picks the one whose center is closest.
 * Returns null if outside all zones (unless fallbackToNearest is true).
 */
export function resolveZoneId(
  point: { x: number; z: number },
  zones: readonly LabZone[],
  options?: ResolveZoneOptions,
): string | null {
  if (zones.length === 0) return null;

  let bestContaining: LabZone | null = null;
  let bestContainingDistSq = Infinity;

  for (const zone of zones) {
    const halfW = zone.width / 2;
    const halfD = zone.depth / 2;
    const inside =
      point.x >= zone.x - halfW &&
      point.x <= zone.x + halfW &&
      point.z >= zone.z - halfD &&
      point.z <= zone.z + halfD;

    if (inside) {
      const dx = point.x - zone.x;
      const dz = point.z - zone.z;
      const distSq = dx * dx + dz * dz;
      if (distSq < bestContainingDistSq) {
        bestContainingDistSq = distSq;
        bestContaining = zone;
      }
    }
  }

  if (bestContaining) {
    return bestContaining.id;
  }

  if (!options?.fallbackToNearest) {
    return null;
  }

  let nearest = zones[0];
  let nearestDistSq = Infinity;
  for (const zone of zones) {
    const dx = point.x - zone.x;
    const dz = point.z - zone.z;
    const distSq = dx * dx + dz * dz;
    if (distSq < nearestDistSq) {
      nearestDistSq = distSq;
      nearest = zone;
    }
  }
  return nearest.id;
}
