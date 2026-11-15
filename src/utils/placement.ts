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

export function normalizeRotationDeg(deg: number): number {
  const mod = ((deg % 360) + 360) % 360;
  return Object.is(mod, -0) ? 0 : Number(mod.toFixed(4));
}

/**
 * Rotate a 2D XZ offset `(dx, dz)` around +Y axis by `deltaDeg` degrees,
 * matching Three.js `Object3D.rotation.y = degToRad(deltaDeg)`.
 */
export function rotateOffsetAroundY(
  dx: number,
  dz: number,
  deltaDeg: number,
): { dx: number; dz: number } {
  const rad = (deltaDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    dx: Number((dx * cos + dz * sin).toFixed(4)),
    dz: Number((-dx * sin + dz * cos).toFixed(4)),
  };
}

/**
 * Test if a 2D point `(px, pz)` lies inside an equipment item's rotated rectangle on the XZ plane.
 */
export function isPointInRotatedBox(
  point: { x: number; z: number },
  box: Pick<LabEquipment, 'x' | 'z' | 'width' | 'depth' | 'rotationDeg'>,
  epsilon = 0.02,
): boolean {
  const rad = (-box.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = point.x - box.x;
  const dz = point.z - box.z;
  // Rotate world delta into box-local coordinates
  const lx = dx * cos + dz * sin;
  const lz = -dx * sin + dz * cos;
  return (
    Math.abs(lx) <= box.width / 2 + epsilon &&
    Math.abs(lz) <= box.depth / 2 + epsilon
  );
}

/**
 * Find the supporting surface item beneath an elevated point `{x, z}` (or matching baseY).
 * When `targetBaseY` is specified (e.g. during v2->v3 migration), matches surfaces whose top `baseY + height`
 * matches `targetBaseY` within `yTolerance`. When omitted (e.g. interactive drag-drop), matches benches
 * or low flat surfaces whose top can support tabletop gear.
 */
export function findSupportingSurface(
  point: { x: number; z: number },
  equipment: readonly LabEquipment[],
  options?: {
    excludeIds?: Iterable<string>;
    targetBaseY?: number;
    yTolerance?: number;
    eligibleTypes?: ReadonlySet<string>;
  },
): LabEquipment | null {
  const excluded = new Set(options?.excludeIds ?? []);
  const yTol = options?.yTolerance ?? 0.05;
  let best: LabEquipment | null = null;
  let bestDistSq = Infinity;

  for (const candidate of equipment) {
    if (excluded.has(candidate.id)) continue;
    if (candidate.height <= 0) continue;
    if (options?.eligibleTypes && !options.eligibleTypes.has(candidate.type)) {
      continue;
    }

    const topY = candidate.baseY + candidate.height;
    if (typeof options?.targetBaseY === 'number') {
      if (Math.abs(topY - options.targetBaseY) > yTol) continue;
    } else if (candidate.baseY !== 0) {
      // Interactive support detection defaults to floor-standing surfaces unless targetBaseY specified
      continue;
    }

    if (isPointInRotatedBox(point, candidate)) {
      const dx = point.x - candidate.x;
      const dz = point.z - candidate.z;
      const distSq = dx * dx + dz * dz;
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        best = candidate;
      }
    }
  }

  return best;
}

/**
 * Bind `supportId` for elevated items (`baseY > 0`) onto the supporting furniture underneath them.
 * Optionally calls `onOrphan` when an item with `baseY > 0` has no supporting furniture underneath.
 */
export function bindSupportIds(
  equipment: readonly LabEquipment[],
  options?: {
    preserveExisting?: boolean;
    onOrphan?: (item: LabEquipment) => void;
  },
): LabEquipment[] {
  const idSet = new Set(equipment.map((e) => e.id));

  return equipment.map((item) => {
    if (item.baseY <= 0) {
      if (item.supportId !== undefined) {
        const rest = { ...item };
        delete rest.supportId;
        return rest;
      }
      return item;
    }

    if (options?.preserveExisting && item.supportId && idSet.has(item.supportId)) {
      return item;
    }

    const parent = findSupportingSurface(
      { x: item.x, z: item.z },
      equipment,
      {
        excludeIds: [item.id],
        targetBaseY: item.baseY,
        yTolerance: 0.06,
      },
    );

    if (parent) {
      return { ...item, supportId: parent.id };
    }

    options?.onOrphan?.(item);
    if (item.supportId !== undefined) {
      const rest = { ...item };
      delete rest.supportId;
      return rest;
    }
    return item;
  });
}
