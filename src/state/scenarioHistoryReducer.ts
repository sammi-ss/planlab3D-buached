import type { LabScenario } from '../types/lab';

export const MAX_HISTORY = 50;
export const DEFAULT_COALESCE_WINDOW_MS = 400;

export interface ScenarioHistoryState {
  past: LabScenario[][];
  present: LabScenario[];
  future: LabScenario[][];
  lastCommitKey: string | null;
  lastCommitAt: number | null;
}

export type ScenarioHistoryAction =
  | {
      type: 'COMMIT';
      updater: (prev: LabScenario[]) => LabScenario[];
      coalesceKey?: string;
      timestamp?: number;
      coalesceWindowMs?: number;
    }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'REPLACE_ALL'; scenarios: LabScenario[] }
  | { type: 'SET_PRESENT_NO_HISTORY'; updater: (prev: LabScenario[]) => LabScenario[] };

export function createInitialHistoryState(
  initialScenarios: LabScenario[],
): ScenarioHistoryState {
  return {
    past: [],
    present: initialScenarios,
    future: [],
    lastCommitKey: null,
    lastCommitAt: null,
  };
}

/**
 * Semantic equality check for a single scenario, ignoring `updatedAt`
 * so no-op edits (e.g., pointer down/up without moving) never create history entries.
 */
export function areScenarioContentsEqual(a: LabScenario, b: LabScenario): boolean {
  if (a === b) return true;
  if (
    a.id !== b.id ||
    a.name !== b.name ||
    a.subtitle !== b.subtitle ||
    Boolean(a.isBuiltIn) !== Boolean(b.isBuiltIn) ||
    a.labWidth !== b.labWidth ||
    a.labDepth !== b.labDepth
  ) {
    return false;
  }
  return (
    JSON.stringify(a.zones) === JSON.stringify(b.zones) &&
    JSON.stringify(a.equipment) === JSON.stringify(b.equipment) &&
    JSON.stringify(a.walls) === JSON.stringify(b.walls) &&
    JSON.stringify(a.openings) === JSON.stringify(b.openings)
  );
}

/**
 * Semantic equality check for scenario lists, ignoring `updatedAt`.
 */
export function areScenarioListsEqual(a: LabScenario[], b: LabScenario[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!areScenarioContentsEqual(a[i], b[i])) return false;
  }
  return true;
}

/**
 * Pure reducer managing { past, present, future } undo/redo history for scenarios.
 * - COMMIT with unchanged result does not push history
 * - COMMIT with matching coalesceKey within ~400ms merges into the active step
 * - History length capped at 50 entries
 * - UNDO / REDO / REPLACE_ALL clear active coalesce state
 * - SET_PRESENT_NO_HISTORY updates present without touching past/future (e.g., rename, cloud sync)
 */
export function scenarioHistoryReducer(
  state: ScenarioHistoryState,
  action: ScenarioHistoryAction,
): ScenarioHistoryState {
  switch (action.type) {
    case 'COMMIT': {
      const nextPresent = action.updater(state.present);

      if (areScenarioListsEqual(state.present, nextPresent)) {
        return state;
      }

      const key = action.coalesceKey ?? null;
      const ts = typeof action.timestamp === 'number' ? action.timestamp : null;
      const windowMs = action.coalesceWindowMs ?? DEFAULT_COALESCE_WINDOW_MS;

      const canCoalesce =
        key !== null &&
        ts !== null &&
        state.lastCommitKey === key &&
        state.lastCommitAt !== null &&
        ts - state.lastCommitAt >= 0 &&
        ts - state.lastCommitAt <= windowMs &&
        state.past.length > 0;

      if (canCoalesce) {
        const previousSnapshot = state.past[state.past.length - 1];
        // If coalesced changes end up returning exactly to the snapshot before this burst, pop it
        if (areScenarioListsEqual(previousSnapshot, nextPresent)) {
          return {
            past: state.past.slice(0, -1),
            present: nextPresent,
            future: [],
            lastCommitKey: null,
            lastCommitAt: null,
          };
        }
        return {
          past: state.past,
          present: nextPresent,
          future: [],
          lastCommitKey: key,
          lastCommitAt: ts,
        };
      }

      const nextPast = [...state.past, state.present].slice(-MAX_HISTORY);
      return {
        past: nextPast,
        present: nextPresent,
        future: [],
        lastCommitKey: key,
        lastCommitAt: ts,
      };
    }

    case 'UNDO': {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      const nextPast = state.past.slice(0, -1);
      const nextFuture = [state.present, ...state.future].slice(0, MAX_HISTORY);
      return {
        past: nextPast,
        present: previous,
        future: nextFuture,
        lastCommitKey: null,
        lastCommitAt: null,
      };
    }

    case 'REDO': {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      const nextFuture = state.future.slice(1);
      const nextPast = [...state.past, state.present].slice(-MAX_HISTORY);
      return {
        past: nextPast,
        present: next,
        future: nextFuture,
        lastCommitKey: null,
        lastCommitAt: null,
      };
    }

    case 'REPLACE_ALL': {
      return {
        past: [],
        present: action.scenarios,
        future: [],
        lastCommitKey: null,
        lastCommitAt: null,
      };
    }

    case 'SET_PRESENT_NO_HISTORY': {
      const nextPresent = action.updater(state.present);
      if (nextPresent === state.present) return state;
      return {
        ...state,
        present: nextPresent,
      };
    }

    default:
      return state;
  }
}
