import { describe, expect, it } from 'vitest';
import { DEFAULT_SCENARIOS } from '../data/presets';
import {
  createInitialHistoryState,
  scenarioHistoryReducer,
} from '../state/scenarioHistoryReducer';
import {
  buildBuiltInForkPair,
  getUniqueCopyName,
  getUniqueDuplicateName,
  getUniqueScenarioId,
} from './scenarioCopy';

describe('scenarioCopy & auto-fork undo safety', () => {
  it('generates non-colliding copy names when multiple copies exist', () => {
    const base = 'ผังฐาน: แบบ ER เก่า (ต้นฉบับ)';
    const first = getUniqueCopyName(base, [base]);
    expect(first).toBe(`${base} (สำเนา)`);

    const second = getUniqueCopyName(base, [base, first]);
    expect(second).toBe(`${base} (สำเนา 2)`);

    const third = getUniqueCopyName(base, [base, first, second]);
    expect(third).toBe(`${base} (สำเนา 3)`);
  });

  it('generates non-colliding duplicate names and unique scenario IDs', () => {
    const dup1 = getUniqueDuplicateName('แผนกแลป A', ['แผนกแลป A']);
    const dup2 = getUniqueDuplicateName(dup1, ['แผนกแลป A', dup1]);
    expect(dup1).toBe('สำเนา: แผนกแลป A');
    expect(dup2).toBe('สำเนา 2: แผนกแลป A');

    const id1 = getUniqueScenarioId('scenario-copy', 1000, []);
    const id2 = getUniqueScenarioId('scenario-copy', 1000, [id1]);
    expect(id1).toBe('scenario-copy-1000');
    expect(id2).toBe('scenario-copy-1000-2');
  });

  it('keeps the forked copy alive and reverts only the edit when Undoing the first edit on a built-in scenario', () => {
    const baseline = DEFAULT_SCENARIOS[0];
    const editedCandidate = {
      ...JSON.parse(JSON.stringify(baseline)),
      equipment: baseline.equipment.map((eq) =>
        eq.id === 'eq-an-b1' ? { ...eq, x: eq.x + 1.5 } : eq,
      ),
    };

    let history = createInitialHistoryState([...DEFAULT_SCENARIOS]);
    const { unmodifiedCopy, editedCopy, copyId } = buildBuiltInForkPair(
      baseline,
      editedCandidate,
      history.present,
      5000,
    );

    // Step 1: Add unmodified fork without history
    history = scenarioHistoryReducer(history, {
      type: 'SET_PRESENT_NO_HISTORY',
      updater: (prev) => [...prev, unmodifiedCopy],
    });

    // Step 2: Commit the edit onto the fork
    history = scenarioHistoryReducer(history, {
      type: 'COMMIT',
      updater: (prev) => prev.map((s) => (s.id === copyId ? editedCopy : s)),
      timestamp: 5000,
    });

    const movedItem = history.present
      .find((s) => s.id === copyId)
      ?.equipment.find((e) => e.id === 'eq-an-b1');
    expect(movedItem?.x).toBeCloseTo(baseline.equipment[0].x + 1.5, 3);

    // Undo should keep copyId present, reverting ONLY the equipment move
    history = scenarioHistoryReducer(history, { type: 'UNDO' });
    const copyAfterUndo = history.present.find((s) => s.id === copyId);
    expect(copyAfterUndo).toBeDefined();
    expect(copyAfterUndo?.isBuiltIn).toBe(false);
    expect(copyAfterUndo?.equipment.find((e) => e.id === 'eq-an-b1')?.x).toBeCloseTo(
      baseline.equipment[0].x,
      3,
    );

    // Redo re-applies the move onto the same copy
    history = scenarioHistoryReducer(history, { type: 'REDO' });
    expect(
      history.present
        .find((s) => s.id === copyId)
        ?.equipment.find((e) => e.id === 'eq-an-b1')?.x,
    ).toBeCloseTo(baseline.equipment[0].x + 1.5, 3);
  });
});
