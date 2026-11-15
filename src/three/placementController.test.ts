import { describe, expect, it } from 'vitest';
import { DEFAULT_SCENARIOS } from '../data/presets';
import type { LabScenario } from '../types/lab';
import {
  advancePointerMove,
  cancelPlacement,
  canDragEntity,
  computeChildTransforms,
  createIdlePlacementState,
  createSnapshotFromScenario,
  evaluateEquipmentPlacement,
  finishPlacement,
  getOpeningClearanceBoxes,
  pickPriorityHit,
  rotateLifted90,
  startPressing,
  startTapPickup,
} from './placementController';

function cloneBaseline(): LabScenario {
  return JSON.parse(JSON.stringify(DEFAULT_SCENARIOS[0]));
}

describe('placementController state machine & spatial rules', () => {
  it('enforces click threshold <= 5px (select only, zero commit -> fixes B4)', () => {
    const scenario = cloneBaseline();
    const snap = createSnapshotFromScenario('equipment', 'eq-an-b1', scenario)!;

    let state = startPressing({
      pointerId: 1,
      clientX: 200,
      clientY: 200,
      planeHitX: snap.x,
      planeHitZ: snap.z,
      pickupPlaneY: snap.baseY,
      snapshot: snap,
    });

    const step1 = advancePointerMove(state, {
      clientX: 203,
      clientY: 202,
      planeHitX: snap.x + 0.05,
      planeHitZ: snap.z + 0.05,
      scenario,
      gridStep: 0.1,
      altPressed: false,
    });
    expect(step1.justLifted).toBe(false);
    expect(step1.state.phase).toBe('pressing');

    const dropped = finishPlacement(step1.state);
    expect(dropped.state.phase).toBe('idle');
    expect(dropped.result?.outcome).toBe('select_only');
  });

  it('transitions pressing -> lifted after > 5px drag and commits valid drop to idle', () => {
    const scenario = cloneBaseline();
    const snap = createSnapshotFromScenario('equipment', 'eq-re-ch1', scenario)!;

    let state = startPressing({
      pointerId: 1,
      clientX: 100,
      clientY: 100,
      planeHitX: snap.x,
      planeHitZ: snap.z,
      pickupPlaneY: snap.baseY,
      snapshot: snap,
    });

    const step = advancePointerMove(state, {
      clientX: 120,
      clientY: 110,
      planeHitX: -1.5,
      planeHitZ: 1.3, // Open aisle between Prep and Blood bank/Clean zone (snaps to -1.5, 1.25)
      scenario,
      gridStep: 0.25,
      altPressed: false,
    });

    expect(step.justLifted).toBe(true);
    expect(step.state.phase).toBe('lifted');
    if (step.state.phase === 'lifted') {
      expect(step.state.isValid).toBe(true);
      expect(step.state.currentX).toBe(-1.5);
      expect(step.state.currentZ).toBe(1.25); // 1.3 snapped to 0.25 grid
    }

    const done = finishPlacement(step.state);
    expect(done.state.phase).toBe('idle');
    expect(done.result?.outcome).toBe('commit');
    if (done.result?.outcome === 'commit') {
      expect(done.result.x).toBe(-1.5);
      expect(done.result.z).toBe(1.25);
    }
  });

  it('cancels lifted drag on Esc / right-click / pointercancel, returning original transform with zero commit (fixes B5)', () => {
    const scenario = cloneBaseline();
    const snap = createSnapshotFromScenario('equipment', 'eq-an-tower', scenario)!;
    let state = startPressing({
      pointerId: 7,
      clientX: 100,
      clientY: 100,
      planeHitX: snap.x,
      planeHitZ: snap.z,
      pickupPlaneY: snap.baseY,
      snapshot: snap,
    });

    state = advancePointerMove(state, {
      clientX: 140,
      clientY: 140,
      planeHitX: 0.5,
      planeHitZ: 0.5,
      scenario,
      gridStep: 0.1,
      altPressed: false,
    }).state;
    expect(state.phase).toBe('lifted');

    const cancelled = cancelPlacement(state);
    expect(cancelled.state.phase).toBe('idle');
    expect(cancelled.result?.outcome).toBe('cancelled');
    if (cancelled.result?.outcome === 'cancelled') {
      expect(cancelled.result.revert.x).toBe(snap.x);
      expect(cancelled.result.revert.z).toBe(snap.z);
    }
  });

  it('flags red and reverts to origin with reason when dropped overlapping furniture, wall, or 0.9m door clearance (fixes B12)', () => {
    const scenario = cloneBaseline();
    const snap = createSnapshotFromScenario('equipment', 'eq-cl-cab1', scenario)!;
    let state = startTapPickup(snap, scenario);

    // Move onto LIS & Slide desk (overlap another equipment)
    const desk = scenario.equipment.find((e) => e.id === 'eq-cl-desk')!;
    state = advancePointerMove(state, {
      clientX: 0,
      clientY: 0,
      planeHitX: desk.x,
      planeHitZ: desk.z,
      scenario,
      gridStep: 0.1,
      altPressed: false,
    }).state;

    expect(state.phase).toBe('lifted');
    if (state.phase === 'lifted') {
      expect(state.isValid).toBe(false);
      expect(state.invalidReason).toBeTruthy();
    }

    const dropOverlap = finishPlacement(state);
    expect(dropOverlap.result?.outcome).toBe('invalid');
    if (dropOverlap.result?.outcome === 'invalid') {
      expect(dropOverlap.result.revert.x).toBe(snap.x);
      expect(dropOverlap.result.revert.z).toBe(snap.z);
    }

    // Move directly in front of op-front-door (0.9m clearance zone)
    const frontDoor = scenario.openings.find((o) => o.id === 'op-front-door')!;
    const clearance = getOpeningClearanceBoxes([frontDoor], scenario.labWidth, scenario.labDepth);
    expect(clearance).toHaveLength(1);
    const doorEval = evaluateEquipmentPlacement(
      scenario.equipment.find((e) => e.id === 'eq-mi-bin1')!,
      { x: clearance[0].x, z: clearance[0].z, rotationDeg: 0 },
      scenario,
    );
    expect(doorEval.isValid).toBe(false);
    expect(doorEval.invalidReason).toContain('0.9');

    // Collide with interior wall w-int-waste-l
    const wasteWall = scenario.walls.find((w) => w.id === 'w-int-waste-l')!;
    const wallEval = evaluateEquipmentPlacement(
      scenario.equipment.find((e) => e.id === 'eq-mi-bin1')!,
      { x: wasteWall.x, z: wasteWall.z, rotationDeg: 0 },
      scenario,
    );
    expect(wallEval.isValid).toBe(false);
    expect(wallEval.invalidReason).toContain('ผนัง');
  });

  it('rotates 90deg during drag and clamps using rotated footprint (fixes B3) and supports Alt grid bypass', () => {
    const scenario = cloneBaseline();
    const cab = scenario.equipment.find((e) => e.id === 'eq-cl-cab1')!; // 3.0 x 0.85
    const snap = createSnapshotFromScenario('equipment', cab.id, scenario)!;

    let state = startTapPickup(snap, scenario);
    // Drag near right wall cleanly, bypassing grid with Alt
    state = advancePointerMove(state, {
      clientX: 0,
      clientY: 0,
      planeHitX: 11.425,
      planeHitZ: 1.5,
      scenario,
      gridStep: 0.5,
      altPressed: true,
    }).state;
    expect(state.phase).toBe('lifted');
    if (state.phase === 'lifted') {
      expect(state.currentX).toBe(10.35); // at rot=180, width=3.0 => maxX = 11.85 - 1.5 = 10.35
    }

    // Rotate +90 while held -> swaps width & depth so right clamp extends to 11.85 - 0.425 = 11.425
    state = rotateLifted90(state, 90, scenario, { gridStep: 0.5, altPressed: true });
    // Now move to wall edge with rotated footprint
    state = advancePointerMove(state, {
      clientX: 0,
      clientY: 0,
      planeHitX: 13.0,
      planeHitZ: 1.53,
      scenario,
      gridStep: 0.5,
      altPressed: true, // Alt bypasses grid snap!
    }).state;

    if (state.phase === 'lifted') {
      expect(state.currentRotationDeg).toBe(270);
      expect(state.currentX).toBeCloseTo(11.425, 3); // Flush against 11.85m wall!
      expect(state.currentZ).toBe(1.53); // Exact un-snapped Z because Alt held
    }
  });

  it('attaches and detaches supportId & baseY automatically and moves/rotates bench children cleanly (fixes B7)', () => {
    const scenario = cloneBaseline();
    const centrifuge = scenario.equipment.find((e) => e.id === 'eq-pr-c1')!;
    const aliquotBench = scenario.equipment.find((e) => e.id === 'eq-pr-b2')!;
    expect(centrifuge.supportId).toBe('eq-pr-b1');
    expect(centrifuge.baseY).toBe(0.55);

    // 1. Move centrifuge onto another bench (eq-pr-b2) -> re-parents supportId
    const ontoOtherBench = evaluateEquipmentPlacement(
      centrifuge,
      { x: aliquotBench.x, z: aliquotBench.z, rotationDeg: 0 },
      scenario,
    );
    expect(ontoOtherBench.isValid).toBe(true);
    expect(ontoOtherBench.supportId).toBe('eq-pr-b2');
    expect(ontoOtherBench.baseY).toBe(0.55);

    // 2. Move centrifuge onto empty corridor floor -> detaches supportId & drops baseY to 0
    const ontoFloor = evaluateEquipmentPlacement(
      centrifuge,
      { x: -1.5, z: -2.7, rotationDeg: 0 },
      scenario,
    );
    expect(ontoFloor.supportId).toBeUndefined();
    expect(ontoFloor.baseY).toBe(0);

    // 3. Move & rotate parent bench eq-pr-b1 by +90deg -> children must rotate around parent & never block parent!
    const parentBench = scenario.equipment.find((e) => e.id === 'eq-pr-b1')!;
    const benchEval = evaluateEquipmentPlacement(
      parentBench,
      { x: 0.5, z: -0.5, rotationDeg: 90 },
      scenario,
    );
    const childUpdate = benchEval.childTransforms.find((c) => c.id === 'eq-pr-c1')!;
    expect(childUpdate).toBeDefined();
    expect(childUpdate.rotationDeg).toBe(90);
    // Relative dx = eq-pr-c1.x - parentBench.x (approx -1.75), rotated +90deg around +Y -> dz = -dx ≈ +1.75
    const expectedDx = centrifuge.x - parentBench.x;
    expect(childUpdate.z).toBeCloseTo(-0.5 - expectedDx, 1);

    // Verify computeChildTransforms matches pure translation when deltaDeg = 0
    const translated = computeChildTransforms(
      parentBench.id,
      { x: parentBench.x, z: parentBench.z, rotationDeg: 0 },
      { x: parentBench.x + 2, z: parentBench.z - 1, rotationDeg: 0, baseY: 0, height: 0.55 },
      scenario.equipment,
    );
    const c1Translated = translated.find((c) => c.id === 'eq-pr-c1')!;
    expect(c1Translated.x).toBeCloseTo(centrifuge.x + 2, 2);
    expect(c1Translated.z).toBeCloseTo(centrifuge.z - 1, 2);
  });

  it('prioritizes equipment > opening > zone and prevents dragging unselected zones (fixes B1)', () => {
    const picked = pickPriorityHit([
      { kind: 'zone', id: 'zone-clean' },
      { kind: 'opening', id: 'op-win-1' },
      { kind: 'equipment', id: 'eq-cl-pc1' },
    ]);
    expect(picked).toEqual({ kind: 'equipment', id: 'eq-cl-pc1' });

    expect(canDragEntity('zone', 'zone-clean', null)).toBe(false);
    expect(canDragEntity('zone', 'zone-clean', { kind: 'zone', id: 'zone-prep' })).toBe(false);
    expect(canDragEntity('zone', 'zone-clean', { kind: 'zone', id: 'zone-clean' })).toBe(true);
    expect(canDragEntity('equipment', 'eq-cl-pc1', null)).toBe(true);
  });
});
