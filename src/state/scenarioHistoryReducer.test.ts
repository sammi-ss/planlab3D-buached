import { describe, expect, it } from 'vitest';
import { DEFAULT_SCENARIOS } from '../data/presets';
import {
  areScenarioContentsEqual,
  createInitialHistoryState,
  MAX_HISTORY,
  scenarioHistoryReducer,
} from './scenarioHistoryReducer';
import type { LabScenario } from '../types/lab';

function makeScenario(id: string, xOffset = 0, name = `Scenario ${id}`): LabScenario {
  const base = DEFAULT_SCENARIOS[0];
  return {
    ...JSON.parse(JSON.stringify(base)),
    id,
    name,
    isBuiltIn: false,
    equipment: base.equipment.map((eq, idx) =>
      idx === 0 ? { ...eq, x: Number((eq.x + xOffset).toFixed(2)) } : eq,
    ),
  };
}

describe('scenarioHistoryReducer', () => {
  it('commits changes and supports 10 consecutive undo/redo steps accurately', () => {
    let state = createInitialHistoryState([makeScenario('sc-1', 0)]);

    for (let i = 1; i <= 10; i++) {
      state = scenarioHistoryReducer(state, {
        type: 'COMMIT',
        updater: (prev) => prev.map((s) => makeScenario(s.id, i)),
      });
    }

    expect(state.past).toHaveLength(10);
    expect(state.future).toHaveLength(0);
    expect(state.present[0].equipment[0].x).toBeCloseTo(
      DEFAULT_SCENARIOS[0].equipment[0].x + 10,
      2,
    );

    // Undo 10 times step-by-step
    for (let i = 9; i >= 0; i--) {
      state = scenarioHistoryReducer(state, { type: 'UNDO' });
      expect(state.present[0].equipment[0].x).toBeCloseTo(
        DEFAULT_SCENARIOS[0].equipment[0].x + i,
        2,
      );
    }
    expect(state.past).toHaveLength(0);
    expect(state.future).toHaveLength(10);

    // Redo 10 times step-by-step
    for (let i = 1; i <= 10; i++) {
      state = scenarioHistoryReducer(state, { type: 'REDO' });
      expect(state.present[0].equipment[0].x).toBeCloseTo(
        DEFAULT_SCENARIOS[0].equipment[0].x + i,
        2,
      );
    }
    expect(state.past).toHaveLength(10);
    expect(state.future).toHaveLength(0);
  });

  it('does not push history when commit produces identical content (even if updatedAt differs)', () => {
    const initial = makeScenario('sc-1', 0);
    const state = createInitialHistoryState([initial]);

    const nextState = scenarioHistoryReducer(state, {
      type: 'COMMIT',
      updater: (prev) =>
        prev.map((s) => ({
          ...s,
          updatedAt: '2099-01-01T00:00:00.000Z',
        })),
    });

    expect(nextState).toBe(state);
    expect(nextState.past).toHaveLength(0);
    expect(areScenarioContentsEqual(initial, nextState.present[0])).toBe(true);
  });

  it('coalesces consecutive commits with the same coalesceKey within 400ms into one undo step', () => {
    let state = createInitialHistoryState([makeScenario('sc-1', 0)]);

    // Simulate 5 rapid nudges 100ms apart
    for (let i = 1; i <= 5; i++) {
      state = scenarioHistoryReducer(state, {
        type: 'COMMIT',
        coalesceKey: 'nudge:eq-an-b1',
        timestamp: 1000 + i * 100,
        updater: (prev) => prev.map((s) => makeScenario(s.id, i * 0.25)),
      });
    }

    expect(state.past).toHaveLength(1);
    expect(state.present[0].equipment[0].x).toBeCloseTo(
      DEFAULT_SCENARIOS[0].equipment[0].x + 1.25,
      2,
    );

    // Another nudge after > 400ms gap creates a second history entry
    state = scenarioHistoryReducer(state, {
      type: 'COMMIT',
      coalesceKey: 'nudge:eq-an-b1',
      timestamp: 2000,
      updater: (prev) => prev.map((s) => makeScenario(s.id, 1.5)),
    });
    expect(state.past).toHaveLength(2);

    // Different coalesceKey within 400ms does NOT coalesce
    state = scenarioHistoryReducer(state, {
      type: 'COMMIT',
      coalesceKey: 'nudge:eq-other',
      timestamp: 2100,
      updater: (prev) => prev.map((s) => makeScenario(s.id, 2.0)),
    });
    expect(state.past).toHaveLength(3);

    // Undo reverses only the latest distinct step
    state = scenarioHistoryReducer(state, { type: 'UNDO' });
    expect(state.present[0].equipment[0].x).toBeCloseTo(
      DEFAULT_SCENARIOS[0].equipment[0].x + 1.5,
      2,
    );
  });

  it('pops the coalesced snapshot if rapid burst returns back to original state', () => {
    let state = createInitialHistoryState([makeScenario('sc-1', 0)]);

    state = scenarioHistoryReducer(state, {
      type: 'COMMIT',
      coalesceKey: 'nudge:eq-1',
      timestamp: 1000,
      updater: (prev) => prev.map((s) => makeScenario(s.id, 0.25)),
    });
    expect(state.past).toHaveLength(1);

    state = scenarioHistoryReducer(state, {
      type: 'COMMIT',
      coalesceKey: 'nudge:eq-1',
      timestamp: 1150,
      updater: (prev) => prev.map((s) => makeScenario(s.id, 0)),
    });
    expect(state.past).toHaveLength(0);
  });

  it('caps history length at MAX_HISTORY (50)', () => {
    let state = createInitialHistoryState([makeScenario('sc-1', 0)]);

    for (let i = 1; i <= 65; i++) {
      state = scenarioHistoryReducer(state, {
        type: 'COMMIT',
        updater: (prev) => prev.map((s) => makeScenario(s.id, i)),
      });
    }

    expect(state.past).toHaveLength(MAX_HISTORY);
    expect(state.past[0][0].equipment[0].x).toBeCloseTo(
      DEFAULT_SCENARIOS[0].equipment[0].x + 15,
      2,
    );
  });

  it('clears future on new COMMIT after UNDO and clears all history on REPLACE_ALL', () => {
    let state = createInitialHistoryState([makeScenario('sc-1', 0)]);
    state = scenarioHistoryReducer(state, {
      type: 'COMMIT',
      updater: (prev) => prev.map((s) => makeScenario(s.id, 1)),
    });
    state = scenarioHistoryReducer(state, {
      type: 'COMMIT',
      updater: (prev) => prev.map((s) => makeScenario(s.id, 2)),
    });
    state = scenarioHistoryReducer(state, { type: 'UNDO' });
    expect(state.future).toHaveLength(1);

    state = scenarioHistoryReducer(state, {
      type: 'COMMIT',
      updater: (prev) => prev.map((s) => makeScenario(s.id, 3)),
    });
    expect(state.future).toHaveLength(0);

    state = scenarioHistoryReducer(state, {
      type: 'REPLACE_ALL',
      scenarios: [makeScenario('imported', 5)],
    });
    expect(state.past).toHaveLength(0);
    expect(state.future).toHaveLength(0);
    expect(state.present[0].id).toBe('imported');
  });

  it('supports SET_PRESENT_NO_HISTORY without modifying past or future (e.g. rename scenario)', () => {
    let state = createInitialHistoryState([makeScenario('sc-1', 0, 'Original Name')]);
    state = scenarioHistoryReducer(state, {
      type: 'COMMIT',
      updater: (prev) => prev.map((s) => makeScenario(s.id, 1, 'Original Name')),
    });
    expect(state.past).toHaveLength(1);

    state = scenarioHistoryReducer(state, {
      type: 'SET_PRESENT_NO_HISTORY',
      updater: (prev) => prev.map((s) => ({ ...s, name: 'Renamed Scenario' })),
    });

    expect(state.past).toHaveLength(1);
    expect(state.future).toHaveLength(0);
    expect(state.present[0].name).toBe('Renamed Scenario');
  });
});
