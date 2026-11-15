import { describe, expect, it } from 'vitest';
import { DEFAULT_SCENARIOS } from '../data/presets';
import { CURRENT_SCHEMA_VERSION, migrate, migrateImportedJson } from './migration';

describe('schemaVersion & migrate()', () => {
  it('migrates legacy v0 unversioned localStorage store with old equipment IDs & shapes', () => {
    const legacyV0 = {
      // No schemaVersion field (v1..v22 legacy format)
      activeScenarioId: 'user-custom-1',
      compareScenarioId: 'scenario-baseline',
      scenarios: [
        // Stale built-in that should always be refreshed from code
        {
          ...DEFAULT_SCENARIOS[0],
          name: 'Stale Built-in Name',
        },
        // User custom scenario with old equipment definitions
        {
          id: 'user-custom-1',
          name: 'My Custom Lab v1',
          subtitle: 'Saved long ago',
          isBuiltIn: false,
          labWidth: 23.7,
          labDepth: 11.6,
          zones: DEFAULT_SCENARIOS[0].zones,
          walls: DEFAULT_SCENARIOS[0].walls,
          openings: DEFAULT_SCENARIOS[0].openings,
          updatedAt: '2025-01-01T00:00:00.000Z',
          equipment: [
            {
              id: 'eq-cl-cab1',
              type: 'cabinet',
              label: 'Doc 1',
              labelTh: 'ตู้เอกสาร 1',
              zoneId: 'zone-clean',
              x: 0,
              z: 4,
              width: 3,
              depth: 0.85,
              height: 1.3,
              baseY: 0,
              rotationDeg: 0,
            },
            {
              id: 'eq-ra-sh',
              type: 'shelf',
              label: 'POCT Kit Shelf',
              labelTh: 'ชั้นเก็บชุดตรวจ POCT',
              zoneId: 'zone-rapid',
              x: 2,
              z: 0,
              width: 1.2,
              depth: 1.8,
              height: 1.5,
              baseY: 0,
              rotationDeg: 0,
            },
            {
              id: 'eq-st-fr',
              type: 'fridge',
              label: 'Old Fridge',
              labelTh: 'ตู้แช่เก่า',
              zoneId: 'zone-storage',
              x: 6,
              z: -1,
              width: 1.2,
              depth: 0.8,
              height: 1.6,
              baseY: 0,
              rotationDeg: 0,
            },
            {
              id: 'eq-st-cab',
              type: 'cabinet',
              label: 'Old Cab',
              labelTh: 'ตู้เก่า',
              zoneId: 'zone-storage',
              x: 6,
              z: 0.5,
              width: 1.2,
              depth: 1.6,
              height: 1.5,
              baseY: 0,
              rotationDeg: 0,
            },
          ],
        },
      ],
    };

    const migrated = migrate(legacyV0);

    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.activeScenarioId).toBe('user-custom-1');
    expect(migrated.compareScenarioId).toBe('scenario-baseline');

    // Built-in scenarios refreshed from code
    const baseline = migrated.scenarios.find((s) => s.id === 'scenario-baseline');
    expect(baseline?.name).toBe(DEFAULT_SCENARIOS[0].name);
    expect(baseline?.isBuiltIn).toBe(true);

    // Custom scenario preserved & equipment patched
    const custom = migrated.scenarios.find((s) => s.id === 'user-custom-1');
    expect(custom).toBeDefined();
    expect(custom?.isBuiltIn).toBe(false);

    const docCab = custom?.equipment.find((e) => e.id === 'eq-cl-cab1');
    expect(docCab?.type).toBe('docCabinet');
    expect(docCab?.rotationDeg).toBe(180);

    const raSh = custom?.equipment.find((e) => e.id === 'eq-ra-sh');
    const defRaSh = DEFAULT_SCENARIOS[0].equipment.find((e) => e.id === 'eq-ra-sh');
    expect(raSh?.width).toBe(defRaSh?.width);
    expect(raSh?.depth).toBe(defRaSh?.depth);

    // eq-st-fr upgraded to eq-st-fr1 doubleGlassFridge & eq-st-fr2 + eq-he-bench added
    expect(custom?.equipment.some((e) => e.id === 'eq-st-fr1')).toBe(true);
    expect(custom?.equipment.find((e) => e.id === 'eq-st-fr1')?.type).toBe('doubleGlassFridge');
    expect(custom?.equipment.some((e) => e.id === 'eq-st-fr2')).toBe(true);
    expect(custom?.equipment.some((e) => e.id === 'eq-he-bench')).toBe(true);

    const stCab = custom?.equipment.find((e) => e.id === 'eq-st-cab');
    expect(stCab?.type).toBe('shelf');
  });

  it('migrates schemaVersion: 1 store to schemaVersion: 2 and validates invalid activeScenarioId', () => {
    const v1Store = {
      schemaVersion: 1,
      activeScenarioId: 'non-existent-id',
      compareScenarioId: 'also-missing',
      scenarios: [
        {
          id: 'user-v1-copy',
          name: 'User V1 Copy',
          isBuiltIn: false,
          zones: DEFAULT_SCENARIOS[0].zones,
          equipment: DEFAULT_SCENARIOS[0].equipment,
          // Missing subtitle, walls, openings -> should be filled gracefully
        },
      ],
    };

    const migrated = migrate(v1Store);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.activeScenarioId).toBe(DEFAULT_SCENARIOS[0].id);
    expect(migrated.compareScenarioId).toBe(migrated.scenarios[1]?.id ?? DEFAULT_SCENARIOS[0].id);

    const userCopy = migrated.scenarios.find((s) => s.id === 'user-v1-copy');
    expect(userCopy).toBeDefined();
    expect(userCopy?.subtitle).toBe('');
    expect(userCopy?.walls.length).toBeGreaterThan(0);
    expect(userCopy?.openings.length).toBeGreaterThan(0);
  });

  it('imports legacy exported JSON bundles and single-scenario JSON files', () => {
    const oldMultiExport = {
      exportedAt: '2026-01-10T10:00:00.000Z',
      activeScenarioId: 'user-exported-1',
      scenarios: [
        DEFAULT_SCENARIOS[0],
        {
          ...DEFAULT_SCENARIOS[0],
          id: 'user-exported-1',
          name: 'Exported Layout',
          isBuiltIn: false,
        },
      ],
    };

    const multiResult = migrateImportedJson(oldMultiExport);
    expect(multiResult).not.toBeNull();
    expect(multiResult?.store.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(multiResult?.store.activeScenarioId).toBe('user-exported-1');
    expect(multiResult?.store.scenarios.some((s) => s.id === 'user-exported-1')).toBe(true);

    const oldSingleExport = {
      name: 'Single Imported Plan',
      labWidth: 23.7,
      labDepth: 11.6,
      zones: DEFAULT_SCENARIOS[0].zones,
      equipment: DEFAULT_SCENARIOS[0].equipment,
    };

    const singleResult = migrateImportedJson(oldSingleExport);
    expect(singleResult).not.toBeNull();
    expect(singleResult?.importedSingleName).toBe('Single Imported Plan');
    expect(singleResult?.store.scenarios.some((s) => s.name === 'Single Imported Plan')).toBe(true);
  });

  it('migrates schemaVersion: 2 -> 3 by binding supportId for rotated benchtop gear and warning on orphans', async () => {
    const { vi } = await import('vitest');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const v2Store = {
      schemaVersion: 2,
      activeScenarioId: 'custom-v2',
      compareScenarioId: 'scenario-baseline',
      scenarios: [
        {
          id: 'custom-v2',
          name: 'Custom V2',
          subtitle: '',
          isBuiltIn: false,
          labWidth: 23.7,
          labDepth: 11.6,
          zones: DEFAULT_SCENARIOS[0].zones,
          walls: DEFAULT_SCENARIOS[0].walls,
          openings: DEFAULT_SCENARIOS[0].openings,
          updatedAt: '2026-01-01T00:00:00.000Z',
          equipment: [
            {
              id: 'bench-rot',
              type: 'bench',
              label: 'Rotated Bench',
              labelTh: 'โต๊ะหมุน 90 องศา',
              zoneId: 'zone-prep',
              x: 0,
              z: 0,
              width: 3.0,
              depth: 1.0,
              height: 0.55,
              baseY: 0,
              rotationDeg: 90, // spans X: [-0.5, 0.5], Z: [-1.5, 1.5]
            },
            {
              id: 'centrifuge-top',
              type: 'centrifuge',
              label: 'Centrifuge',
              labelTh: 'เครื่องปั่น',
              zoneId: 'zone-prep',
              x: 0.1,
              z: 1.2, // inside rotated 3.0m depth!
              width: 0.6,
              depth: 0.5,
              height: 0.35,
              baseY: 0.55,
              rotationDeg: 90,
            },
            {
              id: 'orphan-pc',
              type: 'pc',
              label: 'Floating PC',
              labelTh: 'คอมลอย',
              zoneId: 'zone-clean',
              x: 5,
              z: 3,
              width: 0.8,
              depth: 0.5,
              height: 0.4,
              baseY: 0.55,
              rotationDeg: 0,
            },
          ],
        },
      ],
    };

    const migrated = migrate(v2Store);
    expect(migrated.schemaVersion).toBe(3);

    const custom = migrated.scenarios.find((s) => s.id === 'custom-v2');
    const cent = custom?.equipment.find((e) => e.id === 'centrifuge-top');
    const orphan = custom?.equipment.find((e) => e.id === 'orphan-pc');

    expect(cent?.supportId).toBe('bench-rot');
    expect(orphan?.supportId).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledTimes(1);

    // Also verify built-in scenarios have supportId attached on elevated items
    const baseline = migrated.scenarios.find((s) => s.id === 'scenario-baseline');
    expect(baseline?.equipment.find((e) => e.id === 'eq-pr-c1')?.supportId).toBe('eq-pr-b1');
    expect(baseline?.equipment.find((e) => e.id === 'eq-an-m1')?.supportId).toBe('eq-an-b1');

    warnSpy.mockRestore();
  });
});
