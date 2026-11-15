import type { LabScenario } from '../types/lab';

/**
 * Generate a collision-free auto-copy name:
 * `<baseName> (สำเนา)`, `<baseName> (สำเนา 2)`, `<baseName> (สำเนา 3)`, ...
 */
export function getUniqueCopyName(
  sourceName: string,
  existingNames: Iterable<string>,
): string {
  const taken = new Set(existingNames);
  const cleanBase = sourceName.replace(/\s*\(สำเนา(?:\s+\d+)?\)\s*$/, '').trim();
  const firstCandidate = `${cleanBase} (สำเนา)`;
  if (!taken.has(firstCandidate)) {
    return firstCandidate;
  }

  let index = 2;
  while (taken.has(`${cleanBase} (สำเนา ${index})`)) {
    index += 1;
  }
  return `${cleanBase} (สำเนา ${index})`;
}

/**
 * Generate a collision-free duplicate name:
 * `สำเนา: <base>`, `สำเนา 2: <base>`, ...
 */
export function getUniqueDuplicateName(
  sourceName: string,
  existingNames: Iterable<string>,
): string {
  const taken = new Set(existingNames);
  const cleanBase = sourceName.replace(/^สำเนา(?:\s+\d+)?:\s*/, '').trim();
  const firstCandidate = `สำเนา: ${cleanBase}`;
  if (!taken.has(firstCandidate)) {
    return firstCandidate;
  }

  let index = 2;
  while (taken.has(`สำเนา ${index}: ${cleanBase}`)) {
    index += 1;
  }
  return `สำเนา ${index}: ${cleanBase}`;
}

/**
 * Generate a unique scenario ID guaranteed not to collide with existing IDs.
 */
export function getUniqueScenarioId(
  prefix: string,
  timestampMs: number,
  existingIds: Iterable<string>,
): string {
  const taken = new Set(existingIds);
  const base = `${prefix}-${timestampMs}`;
  if (!taken.has(base)) return base;

  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) {
    suffix += 1;
  }
  return `${base}-${suffix}`;
}

/**
 * Create an unmodified custom clone of a built-in scenario with unique ID and copy name,
 * plus an edited version ready for a separate COMMIT step so Undo reverts ONLY the edit
 * without deleting the forked copy.
 */
export function buildBuiltInForkPair(
  builtInSource: LabScenario,
  editedCandidate: LabScenario,
  existingScenarios: readonly LabScenario[],
  timestampMs: number,
): {
  unmodifiedCopy: LabScenario;
  editedCopy: LabScenario;
  copyId: string;
} {
  const existingNames = existingScenarios.map((s) => s.name);
  const existingIds = existingScenarios.map((s) => s.id);
  const copyName = getUniqueCopyName(builtInSource.name, existingNames);
  const copyId = getUniqueScenarioId('scenario-copy', timestampMs, existingIds);
  const nowIso = new Date(timestampMs).toISOString();

  const unmodifiedCopy: LabScenario = {
    ...JSON.parse(JSON.stringify(builtInSource)),
    id: copyId,
    name: copyName,
    isBuiltIn: false,
    updatedAt: builtInSource.updatedAt,
  };

  const editedCopy: LabScenario = {
    ...JSON.parse(JSON.stringify(editedCandidate)),
    id: copyId,
    name: copyName,
    isBuiltIn: false,
    updatedAt: nowIso,
  };

  return { unmodifiedCopy, editedCopy, copyId };
}
