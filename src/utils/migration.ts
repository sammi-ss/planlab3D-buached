import { DEFAULT_SCENARIOS } from '../data/presets';
import type { LabEquipment, LabScenario } from '../types/lab';

export const STORAGE_KEY = 'central_lab_digital_twin_v22';
export const LEGACY_STORAGE_KEYS = [
  'central_lab_digital_twin_v21',
  'central_lab_digital_twin_v20',
  'central_lab_digital_twin_v19',
  'central_lab_digital_twin_v18',
  'central_lab_digital_twin_v17',
  'central_lab_digital_twin_v16',
  'central_lab_digital_twin_v15',
  'central_lab_digital_twin_v14',
  'central_lab_digital_twin_v13',
  'central_lab_digital_twin_v12',
  'central_lab_digital_twin_v11',
  'central_lab_digital_twin_v10',
  'central_lab_digital_twin_v9',
  'central_lab_digital_twin_v8',
  'central_lab_digital_twin_v7',
  'central_lab_digital_twin_v6',
  'central_lab_digital_twin_v5',
  'central_lab_digital_twin_v4',
  'central_lab_digital_twin_v3',
  'central_lab_digital_twin_v2',
  'central_lab_digital_twin_v1',
];

export const CURRENT_SCHEMA_VERSION = 2;

export interface PersistedStore {
  schemaVersion: number;
  scenarios: LabScenario[];
  activeScenarioId: string;
  compareScenarioId: string;
}

function getDefaultStore(): PersistedStore {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    scenarios: DEFAULT_SCENARIOS,
    activeScenarioId: DEFAULT_SCENARIOS[0].id,
    compareScenarioId: DEFAULT_SCENARIOS[1]?.id ?? DEFAULT_SCENARIOS[0].id,
  };
}

/**
 * Legacy v0 -> v1 equipment patches previously scattered inside loadInitialStore().
 * Preserves exact behavior for user-saved custom scenarios from v1..v22 localStorage & old JSON exports.
 */
function patchLegacyEquipment(equipment: LabEquipment[]): LabEquipment[] {
  const defaultEquipMap = new Map(
    DEFAULT_SCENARIOS[0].equipment.map((item) => [item.id, item]),
  );

  const migratedEquip = equipment.map((eq) => {
    if (
      (eq.id === 'eq-cl-cab1' || eq.id === 'eq-cl-cab2' || eq.id === 'eq-cl-cab3') &&
      (eq.type === 'cabinet' || eq.rotationDeg === 0)
    ) {
      return { ...eq, type: 'docCabinet' as const, rotationDeg: 180 };
    }
    if (eq.id === 'eq-ra-sh' && (eq.width > 0.65 || eq.depth > 1.4)) {
      const def = defaultEquipMap.get('eq-ra-sh');
      if (def) return { ...eq, width: def.width, depth: def.depth, height: def.height };
    }
    if (eq.id === 'eq-he-line' && (eq.width > 1.0 || eq.depth > 1.0)) {
      const def = defaultEquipMap.get('eq-he-line');
      if (def) return { ...def };
    }
    if (eq.id === 'eq-st-fr') {
      const def = defaultEquipMap.get('eq-st-fr1');
      if (def) return { ...def };
    }
    if (eq.id === 'eq-st-fr1' || eq.id === 'eq-st-fr2') {
      const def = defaultEquipMap.get(eq.id);
      return {
        ...eq,
        type: 'doubleGlassFridge' as const,
        rotationDeg: 180,
        notes: def?.notes ?? eq.notes,
      };
    }
    if (eq.id === 'eq-st-cab' && eq.type === 'cabinet') {
      const def = defaultEquipMap.get('eq-st-cab');
      return {
        ...eq,
        type: 'shelf' as const,
        label: def?.label ?? 'Dry Supply Shelf',
        labelTh: def?.labelTh ?? 'ชั้นวางวัสดุปลอดเชื้อ',
        height: def?.height ?? 1.3,
        notes: def?.notes ?? eq.notes,
      };
    }
    return eq;
  });

  const hasHemoBench = migratedEquip.some((eq) => eq.id === 'eq-he-bench');
  const defHemoBench = defaultEquipMap.get('eq-he-bench');
  if (!hasHemoBench && defHemoBench) {
    migratedEquip.push({ ...defHemoBench });
  }

  const hasFridge2 = migratedEquip.some((eq) => eq.id === 'eq-st-fr2');
  const defFridge2 = defaultEquipMap.get('eq-st-fr2');
  if (!hasFridge2 && defFridge2) {
    migratedEquip.push({ ...defFridge2 });
  }

  return migratedEquip;
}

function isScenarioLike(value: unknown): value is Partial<LabScenario> & {
  zones: LabScenario['zones'];
  equipment: LabScenario['equipment'];
} {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return Array.isArray(obj.zones) && Array.isArray(obj.equipment);
}

function normalizeScenario(raw: Partial<LabScenario>, fallbackIndex: number): LabScenario {
  const base = DEFAULT_SCENARIOS[0];
  return {
    id: typeof raw.id === 'string' && raw.id.length > 0 ? raw.id : `scenario-migrated-${fallbackIndex}`,
    name: typeof raw.name === 'string' && raw.name.length > 0 ? raw.name : `ผังที่ ${fallbackIndex + 1}`,
    subtitle: typeof raw.subtitle === 'string' ? raw.subtitle : '',
    isBuiltIn: Boolean(raw.isBuiltIn),
    labWidth: typeof raw.labWidth === 'number' && raw.labWidth > 0 ? raw.labWidth : base.labWidth,
    labDepth: typeof raw.labDepth === 'number' && raw.labDepth > 0 ? raw.labDepth : base.labDepth,
    zones: Array.isArray(raw.zones) ? raw.zones : [],
    equipment: Array.isArray(raw.equipment) ? raw.equipment : [],
    walls: Array.isArray(raw.walls) ? raw.walls : base.walls.map((w) => ({ ...w })),
    openings: Array.isArray(raw.openings) ? raw.openings : base.openings.map((o) => ({ ...o })),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
  };
}

interface StoreDraft {
  schemaVersion: number;
  scenarios: LabScenario[];
  activeScenarioId?: string;
  compareScenarioId?: string;
}

/**
 * Step 0 -> 1:
 * Normalize legacy unversioned store or exported JSON (multi-scenario or single-scenario),
 * and apply legacy equipment ID patches to custom scenarios.
 */
function migrateV0ToV1(raw: Record<string, unknown>): StoreDraft {
  let rawScenarios: unknown[] = [];
  let activeScenarioId =
    typeof raw.activeScenarioId === 'string' ? raw.activeScenarioId : undefined;
  let compareScenarioId =
    typeof raw.compareScenarioId === 'string' ? raw.compareScenarioId : undefined;

  if (Array.isArray(raw.scenarios)) {
    rawScenarios = raw.scenarios;
  } else if (isScenarioLike(raw)) {
    // Legacy single-scenario JSON import format
    const single = normalizeScenario(raw, 0);
    single.isBuiltIn = false;
    rawScenarios = [single];
    activeScenarioId = single.id;
  }

  const normalized = rawScenarios
    .filter((item): item is Partial<LabScenario> & { zones: LabScenario['zones']; equipment: LabScenario['equipment'] } =>
      isScenarioLike(item),
    )
    .map((sc, idx) => {
      const norm = normalizeScenario(sc, idx);
      if (!norm.isBuiltIn) {
        return {
          ...norm,
          equipment: patchLegacyEquipment(norm.equipment),
        };
      }
      return norm;
    });

  return {
    schemaVersion: 1,
    scenarios: normalized,
    activeScenarioId,
    compareScenarioId,
  };
}

/**
 * Step 1 -> 2:
 * Always keep built-in scenarios authoritative from code (DEFAULT_SCENARIOS),
 * preserve all user scenarios (isBuiltIn: false), and validate active/compare IDs.
 */
function migrateV1ToV2(draft: StoreDraft): PersistedStore {
  const customScenarios = draft.scenarios
    .filter((s) => !s.isBuiltIn)
    .map((s, idx) => ({
      ...normalizeScenario(s, idx),
      isBuiltIn: false,
    }));

  // Deduplicate by id while preserving order
  const seenIds = new Set(DEFAULT_SCENARIOS.map((s) => s.id));
  const uniqueCustom: LabScenario[] = [];
  for (const sc of customScenarios) {
    if (!seenIds.has(sc.id)) {
      seenIds.add(sc.id);
      uniqueCustom.push(sc);
    }
  }

  const merged = [...DEFAULT_SCENARIOS, ...uniqueCustom];
  const activeValid =
    typeof draft.activeScenarioId === 'string' &&
    merged.some((s) => s.id === draft.activeScenarioId);
  const compareValid =
    typeof draft.compareScenarioId === 'string' &&
    merged.some((s) => s.id === draft.compareScenarioId);

  return {
    schemaVersion: 2,
    scenarios: merged,
    activeScenarioId: activeValid ? draft.activeScenarioId! : DEFAULT_SCENARIOS[0].id,
    compareScenarioId: compareValid
      ? draft.compareScenarioId!
      : (DEFAULT_SCENARIOS[1]?.id ?? DEFAULT_SCENARIOS[0].id),
  };
}

/**
 * Pure version-by-version schema migration function.
 * Accepts parsed JSON from localStorage (v1..v22+) or exported JSON files (any version).
 */
export function migrate(raw: unknown): PersistedStore {
  if (!raw || typeof raw !== 'object') {
    return getDefaultStore();
  }

  const obj = raw as Record<string, unknown>;
  const rawVersion =
    typeof obj.schemaVersion === 'number' && Number.isFinite(obj.schemaVersion)
      ? obj.schemaVersion
      : 0;

  // Guard against empty or completely invalid objects
  if (rawVersion === 0 && !Array.isArray(obj.scenarios) && !isScenarioLike(obj)) {
    return getDefaultStore();
  }

  const record = raw as Record<string, unknown>;
  const rawScenarios = record.scenarios;
  let version = rawVersion;
  let draft: StoreDraft = {
    schemaVersion: version,
    scenarios: Array.isArray(rawScenarios)
      ? rawScenarios.filter(isScenarioLike).map((s, idx) => normalizeScenario(s, idx))
      : [],
    activeScenarioId: typeof record.activeScenarioId === 'string' ? record.activeScenarioId : undefined,
    compareScenarioId: typeof record.compareScenarioId === 'string' ? record.compareScenarioId : undefined,
  };

  if (version < 1) {
    draft = migrateV0ToV1(obj);
    version = 1;
  }

  if (version < 2) {
    const v2 = migrateV1ToV2(draft);
    return v2;
  }

  // Already at CURRENT_SCHEMA_VERSION (or higher): ensure built-in scenarios stay fresh from code
  return migrateV1ToV2(draft);
}

/**
 * Migrate an imported JSON file payload.
 * Returns null if the JSON does not resemble a valid scenario or scenario bundle.
 */
export function migrateImportedJson(raw: unknown): {
  store: PersistedStore;
  importedCount: number;
  importedSingleName?: string;
} | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  if (Array.isArray(obj.scenarios) && obj.scenarios.length > 0) {
    const validCount = obj.scenarios.filter(isScenarioLike).length;
    if (validCount === 0) return null;
    const store = migrate(obj);
    return {
      store,
      importedCount: obj.scenarios.length,
    };
  }

  if (isScenarioLike(obj)) {
    const singleRaw = {
      ...obj,
      id:
        typeof obj.id === 'string' && !DEFAULT_SCENARIOS.some((d) => d.id === obj.id)
          ? obj.id
          : `scenario-imp-${Date.now()}`,
      isBuiltIn: false,
    };
    const store = migrate(singleRaw);
    const imported = store.scenarios.find((s) => !s.isBuiltIn);
    return {
      store,
      importedCount: 1,
      importedSingleName: imported?.name ?? (typeof obj.name === 'string' ? obj.name : undefined),
    };
  }

  return null;
}

export function loadInitialStore(): PersistedStore {
  try {
    const rawString =
      localStorage.getItem(STORAGE_KEY) ||
      LEGACY_STORAGE_KEYS.map((k) => localStorage.getItem(k)).find(Boolean) ||
      null;
    if (rawString) {
      const parsed: unknown = JSON.parse(rawString);
      return migrate(parsed);
    }
  } catch {
    // fallback to defaults
  }
  return getDefaultStore();
}

export function saveStoreToStorage(store: PersistedStore): void {
  try {
    const payload: PersistedStore = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      scenarios: store.scenarios,
      activeScenarioId: store.activeScenarioId,
      compareScenarioId: store.compareScenarioId,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore quota errors
  }
}

export function clearStoredData(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    for (const key of LEGACY_STORAGE_KEYS) {
      localStorage.removeItem(key);
    }
  } catch {
    // ignore storage errors
  }
}
