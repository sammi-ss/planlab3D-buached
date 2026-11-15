import type {
  GridStep,
  LabEquipment,
  LabOpening,
  LabScenario,
} from '../types/lab';
import {
  clampToRoom,
  findOverlaps,
  findSupportingSurface,
  getFootprint,
  normalizeRotationDeg,
  resolveZoneId,
  rotateOffsetAroundY,
  snapToGrid,
  type SpatialBoxInput,
} from '../utils/placement';

export const PICKUP_DRAG_THRESHOLD_PX = 5;
export const DOOR_CLEARANCE_METERS = 0.9;

export type EntityKind = 'equipment' | 'zone' | 'opening';

export interface RaycastHitCandidate {
  kind: EntityKind;
  id: string;
}

const KIND_PRIORITY: Record<EntityKind, number> = {
  equipment: 3,
  opening: 2,
  zone: 1,
};

const TABLETOP_CAPABLE_TYPES = new Set<string>([
  'centrifuge',
  'microscope',
  'pc',
]);

const SUPPORT_SURFACE_TYPES = new Set<string>(['bench']);

export function isEquipmentTabletopCapable(item: LabEquipment): boolean {
  if (item.baseY > 0 || Boolean(item.supportId)) return true;
  if (TABLETOP_CAPABLE_TYPES.has(item.type)) return true;
  if (item.type === 'analyzer' && item.height <= 0.65) return true;
  return false;
}

/**
 * Resolve raycast hit priority: equipment > opening > zone.
 * Preserves distance order (first hit in hits array) within the highest-priority kind.
 */
export function pickPriorityHit<T extends RaycastHitCandidate>(
  hits: readonly T[],
): T | null {
  if (hits.length === 0) return null;
  let best = hits[0];
  let bestRank = KIND_PRIORITY[best.kind];
  for (let i = 1; i < hits.length; i++) {
    const rank = KIND_PRIORITY[hits[i].kind];
    if (rank > bestRank) {
      best = hits[i];
      bestRank = rank;
    }
  }
  return best;
}

/**
 * Zones can only be dragged when already selected, preventing accidental drags when clicking floor.
 */
export function canDragEntity(
  kind: EntityKind,
  id: string,
  currentSelection: { kind: EntityKind; id: string } | null,
): boolean {
  if (kind !== 'zone') return true;
  return currentSelection?.kind === 'zone' && currentSelection.id === id;
}

export interface OpeningClearanceBox extends SpatialBoxInput {
  id: string;
  openingId: string;
  labelTh: string;
  x: number;
  z: number;
}

/**
 * Compute 0.9m clearance boxes in front of every door and slidingWindow.
 * Heuristic for open side:
 * - Exterior openings near room boundary extend 0.9m inward into the room.
 * - Interior openings extend 0.9m on both perpendicular sides.
 * - Regular non-sliding windows do not restrict floor furniture placement.
 */
export function getOpeningClearanceBoxes(
  openings: readonly LabOpening[],
  labWidth: number,
  labDepth: number,
  clearanceMeters = DOOR_CLEARANCE_METERS,
): OpeningClearanceBox[] {
  const halfLabW = labWidth / 2;
  const halfLabD = labDepth / 2;
  const edgeTol = 0.8;
  const boxes: OpeningClearanceBox[] = [];

  for (const op of openings) {
    if (op.kind === 'window') continue;

    if (op.width > op.depth + 0.02) {
      // Wall runs along X, opening faces +/- Z
      const nearTop = op.z <= -halfLabD + edgeTol;
      const nearBottom = op.z >= halfLabD - edgeTol;

      if (nearTop) {
        const minZ = op.z + op.depth / 2;
        const maxZ = minZ + clearanceMeters;
        boxes.push({
          id: `clearance:${op.id}`,
          openingId: op.id,
          labelTh: op.labelTh,
          x: op.x,
          z: Number(((minZ + maxZ) / 2).toFixed(4)),
          width: op.width,
          depth: clearanceMeters,
          baseY: 0,
          height: 2.0,
        });
      } else if (nearBottom) {
        const maxZ = op.z - op.depth / 2;
        const minZ = maxZ - clearanceMeters;
        boxes.push({
          id: `clearance:${op.id}`,
          openingId: op.id,
          labelTh: op.labelTh,
          x: op.x,
          z: Number(((minZ + maxZ) / 2).toFixed(4)),
          width: op.width,
          depth: clearanceMeters,
          baseY: 0,
          height: 2.0,
        });
      } else {
        // Interior opening: keep both sides clear
        boxes.push({
          id: `clearance:${op.id}`,
          openingId: op.id,
          labelTh: op.labelTh,
          x: op.x,
          z: op.z,
          width: op.width,
          depth: Number((op.depth + clearanceMeters * 2).toFixed(4)),
          baseY: 0,
          height: 2.0,
        });
      }
    } else if (op.depth > op.width + 0.02) {
      // Wall runs along Z, opening faces +/- X
      const nearLeft = op.x <= -halfLabW + edgeTol;
      const nearRight = op.x >= halfLabW - edgeTol;

      if (nearLeft) {
        const minX = op.x + op.width / 2;
        const maxX = minX + clearanceMeters;
        boxes.push({
          id: `clearance:${op.id}`,
          openingId: op.id,
          labelTh: op.labelTh,
          x: Number(((minX + maxX) / 2).toFixed(4)),
          z: op.z,
          width: clearanceMeters,
          depth: op.depth,
          baseY: 0,
          height: 2.0,
        });
      } else if (nearRight) {
        const maxX = op.x - op.width / 2;
        const minX = maxX - clearanceMeters;
        boxes.push({
          id: `clearance:${op.id}`,
          openingId: op.id,
          labelTh: op.labelTh,
          x: Number(((minX + maxX) / 2).toFixed(4)),
          z: op.z,
          width: clearanceMeters,
          depth: op.depth,
          baseY: 0,
          height: 2.0,
        });
      } else {
        boxes.push({
          id: `clearance:${op.id}`,
          openingId: op.id,
          labelTh: op.labelTh,
          x: op.x,
          z: op.z,
          width: Number((op.width + clearanceMeters * 2).toFixed(4)),
          depth: op.depth,
          baseY: 0,
          height: 2.0,
        });
      }
    } else {
      // Ambiguous square opening fallback: pad radially on XZ
      boxes.push({
        id: `clearance:${op.id}`,
        openingId: op.id,
        labelTh: op.labelTh,
        x: op.x,
        z: op.z,
        width: Number((op.width + clearanceMeters * 2).toFixed(4)),
        depth: Number((op.depth + clearanceMeters * 2).toFixed(4)),
        baseY: 0,
        height: 2.0,
      });
    }
  }

  return boxes;
}

export interface ChildTransform {
  id: string;
  x: number;
  z: number;
  baseY: number;
  rotationDeg: number;
}

/**
 * Compute updated transforms for all child items (`supportId === parentId`)
 * when their parent bench translates and/or rotates.
 */
export function computeChildTransforms(
  parentId: string,
  oldParent: { x: number; z: number; rotationDeg: number },
  newParent: { x: number; z: number; rotationDeg: number; baseY: number; height: number },
  equipment: readonly LabEquipment[],
): ChildTransform[] {
  const deltaDeg = normalizeRotationDeg(newParent.rotationDeg - oldParent.rotationDeg);
  const topY = Number((newParent.baseY + newParent.height).toFixed(3));
  const updates: ChildTransform[] = [];

  for (const child of equipment) {
    if (child.supportId !== parentId) continue;
    const rotated = rotateOffsetAroundY(
      child.x - oldParent.x,
      child.z - oldParent.z,
      deltaDeg,
    );
    updates.push({
      id: child.id,
      x: Number((newParent.x + rotated.dx).toFixed(3)),
      z: Number((newParent.z + rotated.dz).toFixed(3)),
      baseY: topY,
      rotationDeg: normalizeRotationDeg(child.rotationDeg + deltaDeg),
    });
  }

  return updates;
}

export interface EvaluatedPlacement {
  x: number;
  z: number;
  rotationDeg: number;
  baseY: number;
  supportId?: string;
  zoneId: string;
  isValid: boolean;
  invalidReason: string | null;
  childTransforms: ChildTransform[];
}

/**
 * Clamp to room using rotated footprint, resolve bench support attach/detach,
 * check equipment/wall/door-clearance collisions, and compute child transforms.
 */
export function evaluateEquipmentPlacement(
  item: LabEquipment,
  target: { x: number; z: number; rotationDeg: number },
  scenario: LabScenario,
  options?: { tabletopCapable?: boolean },
): EvaluatedPlacement {
  const rotDeg = normalizeRotationDeg(target.rotationDeg);
  const fp = getFootprint({
    width: item.width,
    depth: item.depth,
    rotationDeg: rotDeg,
  });
  const clamped = clampToRoom(
    { x: target.x, z: target.z },
    fp,
    scenario.labWidth,
    scenario.labDepth,
  );
  const cx = Number(clamped.x.toFixed(3));
  const cz = Number(clamped.z.toFixed(3));

  const children = scenario.equipment.filter((e) => e.supportId === item.id);
  const familyIds = new Set<string>([item.id, ...children.map((c) => c.id)]);

  const tabletop = options?.tabletopCapable ?? isEquipmentTabletopCapable(item);
  let nextSupportId: string | undefined = item.supportId;
  let nextBaseY = item.baseY;

  if (tabletop) {
    const surface = findSupportingSurface(
      { x: cx, z: cz },
      scenario.equipment,
      {
        excludeIds: familyIds,
        eligibleTypes: SUPPORT_SURFACE_TYPES,
      },
    );
    if (surface) {
      nextSupportId = surface.id;
      nextBaseY = Number((surface.baseY + surface.height).toFixed(3));
    } else {
      nextSupportId = undefined;
      nextBaseY = 0;
    }
  }

  const childTransforms = computeChildTransforms(
    item.id,
    { x: item.x, z: item.z, rotationDeg: item.rotationDeg },
    {
      x: cx,
      z: cz,
      rotationDeg: rotDeg,
      baseY: nextBaseY,
      height: item.height,
    },
    scenario.equipment,
  );

  const resolvedZoneId =
    resolveZoneId({ x: cx, z: cz }, scenario.zones) ?? item.zoneId;

  const probeBox: SpatialBoxInput & { id: string } = {
    id: item.id,
    x: cx,
    z: cz,
    width: item.width,
    depth: item.depth,
    height: item.height,
    baseY: nextBaseY,
    rotationDeg: rotDeg,
  };

  let isValid = true;
  let invalidReason: string | null = null;

  const wallBoxes = scenario.walls.map((w) => ({
    id: w.id,
    x: w.x,
    z: w.z,
    width: w.width,
    depth: w.depth,
    height: w.height,
    baseY: 0,
    rotationDeg: 0,
  }));

  const clearanceBoxes = getOpeningClearanceBoxes(
    scenario.openings,
    scenario.labWidth,
    scenario.labDepth,
  );

  // 1. Collisions against other equipment (ignoring self & own children)
  const eqHits = findOverlaps(probeBox, scenario.equipment, familyIds);
  if (eqHits.length > 0) {
    isValid = false;
    invalidReason = `ทับซ้อนกับ "${eqHits[0].labelTh}"`;
  }

  // 2. Collisions against walls
  if (isValid) {
    const wallHits = findOverlaps(probeBox, wallBoxes);
    if (wallHits.length > 0) {
      isValid = false;
      invalidReason = 'ชนกับผนังกั้นห้อง';
    }
  }

  // 3. Collisions against 0.9m door/sliding-window clearance
  if (isValid) {
    const doorHits = findOverlaps(probeBox, clearanceBoxes);
    if (doorHits.length > 0) {
      isValid = false;
      invalidReason = `ขวางระยะเปิด ${doorHits[0].labelTh} (0.9 ม.)`;
    }
  }

  // 4. Child equipment collision checks (e.g. tall analyzer on bench hitting adjacent furniture/wall)
  if (isValid && childTransforms.length > 0) {
    for (const ct of childTransforms) {
      const childOrig = scenario.equipment.find((e) => e.id === ct.id);
      if (!childOrig) continue;
      const childProbe: SpatialBoxInput & { id: string } = {
        id: childOrig.id,
        x: ct.x,
        z: ct.z,
        width: childOrig.width,
        depth: childOrig.depth,
        height: childOrig.height,
        baseY: ct.baseY,
        rotationDeg: ct.rotationDeg,
      };
      const childEqHits = findOverlaps(childProbe, scenario.equipment, familyIds);
      if (childEqHits.length > 0) {
        isValid = false;
        invalidReason = `"${childOrig.labelTh}" บนโต๊ะทับกับ "${childEqHits[0].labelTh}"`;
        break;
      }
      const childWallHits = findOverlaps(childProbe, wallBoxes);
      if (childWallHits.length > 0) {
        isValid = false;
        invalidReason = `"${childOrig.labelTh}" บนโต๊ะชนกับผนัง`;
        break;
      }
      const childDoorHits = findOverlaps(childProbe, clearanceBoxes);
      if (childDoorHits.length > 0) {
        isValid = false;
        invalidReason = `"${childOrig.labelTh}" บนโต๊ะขวางประตู (0.9 ม.)`;
        break;
      }
    }
  }

  return {
    x: cx,
    z: cz,
    rotationDeg: rotDeg,
    baseY: nextBaseY,
    supportId: nextSupportId,
    zoneId: resolvedZoneId,
    isValid,
    invalidReason,
    childTransforms,
  };
}

export interface PlacementSnapshot {
  kind: EntityKind;
  id: string;
  label: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  baseY: number;
  rotationDeg: number;
  supportId?: string;
  tabletopCapable: boolean;
  childOrigins: ChildTransform[];
}

export type PlacementControllerState =
  | { phase: 'idle' }
  | {
      phase: 'pressing';
      pointerId: number;
      downClientX: number;
      downClientY: number;
      offsetX: number;
      offsetZ: number;
      pickupPlaneY: number;
      origin: PlacementSnapshot;
    }
  | {
      phase: 'lifted';
      mode: 'hold' | 'tapPickup';
      pointerId: number | null;
      offsetX: number;
      offsetZ: number;
      pickupPlaneY: number;
      origin: PlacementSnapshot;
      currentX: number;
      currentZ: number;
      currentBaseY: number;
      currentRotationDeg: number;
      currentSupportId?: string;
      isValid: boolean;
      invalidReason: string | null;
      childTransforms: ChildTransform[];
    };

export function createIdlePlacementState(): PlacementControllerState {
  return { phase: 'idle' };
}

export function createSnapshotFromScenario(
  kind: EntityKind,
  id: string,
  scenario: LabScenario,
): PlacementSnapshot | null {
  if (kind === 'equipment') {
    const eq = scenario.equipment.find((e) => e.id === id);
    if (!eq) return null;
    const childOrigins: ChildTransform[] = scenario.equipment
      .filter((c) => c.supportId === eq.id)
      .map((c) => ({
        id: c.id,
        x: c.x,
        z: c.z,
        baseY: c.baseY,
        rotationDeg: c.rotationDeg,
      }));
    return {
      kind: 'equipment',
      id: eq.id,
      label: eq.labelTh,
      x: eq.x,
      z: eq.z,
      width: eq.width,
      depth: eq.depth,
      height: eq.height,
      baseY: eq.baseY,
      rotationDeg: normalizeRotationDeg(eq.rotationDeg),
      supportId: eq.supportId,
      tabletopCapable: isEquipmentTabletopCapable(eq),
      childOrigins,
    };
  }
  if (kind === 'zone') {
    const z = scenario.zones.find((item) => item.id === id);
    if (!z) return null;
    return {
      kind: 'zone',
      id: z.id,
      label: z.nameTh,
      x: z.x,
      z: z.z,
      width: z.width,
      depth: z.depth,
      height: 0.03,
      baseY: 0,
      rotationDeg: 0,
      tabletopCapable: false,
      childOrigins: [],
    };
  }
  const op = scenario.openings.find((o) => o.id === id);
  if (!op) return null;
  return {
    kind: 'opening',
    id: op.id,
    label: op.labelTh,
    x: op.x,
    z: op.z,
    width: Math.max(0.4, op.width),
    depth: Math.max(0.4, op.depth),
    height: 1.5,
    baseY: 0,
    rotationDeg: 0,
    tabletopCapable: false,
    childOrigins: [],
  };
}

export function startPressing(params: {
  pointerId: number;
  clientX: number;
  clientY: number;
  planeHitX: number;
  planeHitZ: number;
  pickupPlaneY: number;
  snapshot: PlacementSnapshot;
}): PlacementControllerState {
  return {
    phase: 'pressing',
    pointerId: params.pointerId,
    downClientX: params.clientX,
    downClientY: params.clientY,
    offsetX: params.snapshot.x - params.planeHitX,
    offsetZ: params.snapshot.z - params.planeHitZ,
    pickupPlaneY: params.pickupPlaneY,
    origin: params.snapshot,
  };
}

export function startTapPickup(
  snapshot: PlacementSnapshot,
  scenario: LabScenario,
): PlacementControllerState {
  let isValid = true;
  let invalidReason: string | null = null;
  let childTransforms = snapshot.childOrigins;

  if (snapshot.kind === 'equipment') {
    const eq = scenario.equipment.find((e) => e.id === snapshot.id);
    if (eq) {
      const evaluated = evaluateEquipmentPlacement(
        eq,
        { x: eq.x, z: eq.z, rotationDeg: eq.rotationDeg },
        scenario,
        { tabletopCapable: snapshot.tabletopCapable },
      );
      isValid = evaluated.isValid;
      invalidReason = evaluated.invalidReason;
      childTransforms = evaluated.childTransforms;
    }
  }

  return {
    phase: 'lifted',
    mode: 'tapPickup',
    pointerId: null,
    offsetX: 0,
    offsetZ: 0,
    pickupPlaneY: snapshot.baseY,
    origin: snapshot,
    currentX: snapshot.x,
    currentZ: snapshot.z,
    currentBaseY: snapshot.baseY,
    currentRotationDeg: snapshot.rotationDeg,
    currentSupportId: snapshot.supportId,
    isValid,
    invalidReason,
    childTransforms,
  };
}

export function computeLiftedPlacement(
  lifted: Extract<PlacementControllerState, { phase: 'lifted' }>,
  rawWorldX: number,
  rawWorldZ: number,
  nextRotationDeg: number,
  scenario: LabScenario,
  options: { gridStep: GridStep; altPressed: boolean },
): Extract<PlacementControllerState, { phase: 'lifted' }> {
  const step = options.gridStep;
  const candidateX = options.altPressed ? rawWorldX : snapToGrid(rawWorldX, step);
  const candidateZ = options.altPressed ? rawWorldZ : snapToGrid(rawWorldZ, step);

  if (lifted.origin.kind === 'equipment') {
    const eq = scenario.equipment.find((e) => e.id === lifted.origin.id);
    if (eq) {
      const evaluated = evaluateEquipmentPlacement(
        eq,
        {
          x: candidateX,
          z: candidateZ,
          rotationDeg: nextRotationDeg,
        },
        scenario,
        { tabletopCapable: lifted.origin.tabletopCapable },
      );
      return {
        ...lifted,
        currentX: evaluated.x,
        currentZ: evaluated.z,
        currentBaseY: evaluated.baseY,
        currentRotationDeg: evaluated.rotationDeg,
        currentSupportId: evaluated.supportId,
        isValid: evaluated.isValid,
        invalidReason: evaluated.invalidReason,
        childTransforms: evaluated.childTransforms,
      };
    }
  }

  // Zones & openings clamp cleanly to room bounds
  const fp = getFootprint({
    width: lifted.origin.width,
    depth: lifted.origin.depth,
    rotationDeg: 0,
  });
  const clamped = clampToRoom(
    { x: candidateX, z: candidateZ },
    fp,
    scenario.labWidth,
    scenario.labDepth,
  );
  return {
    ...lifted,
    currentX: Number(clamped.x.toFixed(3)),
    currentZ: Number(clamped.z.toFixed(3)),
    currentBaseY: 0,
    currentRotationDeg: 0,
    isValid: true,
    invalidReason: null,
    childTransforms: [],
  };
}

export function advancePointerMove(
  state: PlacementControllerState,
  params: {
    clientX: number;
    clientY: number;
    planeHitX: number;
    planeHitZ: number;
    scenario: LabScenario;
    gridStep: GridStep;
    altPressed: boolean;
  },
): {
  state: PlacementControllerState;
  justLifted: boolean;
} {
  if (state.phase === 'idle') {
    return { state, justLifted: false };
  }

  if (state.phase === 'pressing') {
    const dist = Math.hypot(
      params.clientX - state.downClientX,
      params.clientY - state.downClientY,
    );
    if (dist <= PICKUP_DRAG_THRESHOLD_PX) {
      return { state, justLifted: false };
    }

    const liftedBase: Extract<PlacementControllerState, { phase: 'lifted' }> = {
      phase: 'lifted',
      mode: 'hold',
      pointerId: state.pointerId,
      offsetX: state.offsetX,
      offsetZ: state.offsetZ,
      pickupPlaneY: state.pickupPlaneY,
      origin: state.origin,
      currentX: state.origin.x,
      currentZ: state.origin.z,
      currentBaseY: state.origin.baseY,
      currentRotationDeg: state.origin.rotationDeg,
      currentSupportId: state.origin.supportId,
      isValid: true,
      invalidReason: null,
      childTransforms: state.origin.childOrigins,
    };

    const next = computeLiftedPlacement(
      liftedBase,
      params.planeHitX + state.offsetX,
      params.planeHitZ + state.offsetZ,
      state.origin.rotationDeg,
      params.scenario,
      { gridStep: params.gridStep, altPressed: params.altPressed },
    );
    return { state: next, justLifted: true };
  }

  // Already lifted
  const next = computeLiftedPlacement(
    state,
    params.planeHitX + state.offsetX,
    params.planeHitZ + state.offsetZ,
    state.currentRotationDeg,
    params.scenario,
    { gridStep: params.gridStep, altPressed: params.altPressed },
  );
  return { state: next, justLifted: false };
}

export function rotateLifted90(
  state: PlacementControllerState,
  deltaDeg: number,
  scenario: LabScenario,
  options: { gridStep: GridStep; altPressed: boolean },
): PlacementControllerState {
  if (state.phase !== 'lifted' || state.origin.kind !== 'equipment') {
    return state;
  }
  const nextRot = normalizeRotationDeg(state.currentRotationDeg + deltaDeg);
  return computeLiftedPlacement(
    state,
    state.currentX,
    state.currentZ,
    nextRot,
    scenario,
    { gridStep: options.gridStep, altPressed: true },
  );
}

export type DropResult =
  | {
      outcome: 'select_only';
      kind: EntityKind;
      id: string;
    }
  | {
      outcome: 'commit';
      kind: EntityKind;
      id: string;
      x: number;
      z: number;
      baseY: number;
      rotationDeg: number;
      supportId?: string;
    }
  | {
      outcome: 'invalid';
      reason: string;
      revert: PlacementSnapshot;
    }
  | {
      outcome: 'noop';
      revert: PlacementSnapshot;
    }
  | {
      outcome: 'cancelled';
      revert: PlacementSnapshot;
    };

export function finishPlacement(
  state: PlacementControllerState,
): { state: PlacementControllerState; result: DropResult | null } {
  if (state.phase === 'idle') {
    return { state, result: null };
  }

  if (state.phase === 'pressing') {
    return {
      state: createIdlePlacementState(),
      result: {
        outcome: 'select_only',
        kind: state.origin.kind,
        id: state.origin.id,
      },
    };
  }

  if (!state.isValid) {
    return {
      state: createIdlePlacementState(),
      result: {
        outcome: 'invalid',
        reason: state.invalidReason ?? 'ไม่สามารถวางในตำแหน่งนี้ได้',
        revert: state.origin,
      },
    };
  }

  const unchanged =
    Math.abs(state.currentX - state.origin.x) < 1e-4 &&
    Math.abs(state.currentZ - state.origin.z) < 1e-4 &&
    Math.abs(state.currentBaseY - state.origin.baseY) < 1e-4 &&
    normalizeRotationDeg(state.currentRotationDeg) ===
      normalizeRotationDeg(state.origin.rotationDeg) &&
    state.currentSupportId === state.origin.supportId;

  if (unchanged) {
    return {
      state: createIdlePlacementState(),
      result: {
        outcome: 'noop',
        revert: state.origin,
      },
    };
  }

  return {
    state: createIdlePlacementState(),
    result: {
      outcome: 'commit',
      kind: state.origin.kind,
      id: state.origin.id,
      x: state.currentX,
      z: state.currentZ,
      baseY: state.currentBaseY,
      rotationDeg: state.currentRotationDeg,
      supportId: state.currentSupportId,
    },
  };
}

export function cancelPlacement(
  state: PlacementControllerState,
): { state: PlacementControllerState; result: DropResult | null } {
  if (state.phase === 'idle') {
    return { state, result: null };
  }
  if (state.phase === 'pressing') {
    return { state: createIdlePlacementState(), result: null };
  }
  return {
    state: createIdlePlacementState(),
    result: {
      outcome: 'cancelled',
      revert: state.origin,
    },
  };
}
