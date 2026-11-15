import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import * as THREE from 'three';
import type { User } from 'firebase/auth';
import { BottomDock } from './components/BottomDock';
import {
  LabViewport3D,
  type LabViewportHandle,
  type SelectionState,
} from './components/LabViewport3D';
import { RightDrawer, type DrawerTab } from './components/RightDrawer';
import { SimsMoveHUD } from './components/SimsMoveHUD';
import { TopBar } from './components/TopBar';
import { DEFAULT_SCENARIOS } from './data/presets';
import {
  auth,
  deleteScenarioFromFirebase,
  loginWithGoogle,
  logoutUser,
  saveScenarioToFirebase,
  subscribeToAuth,
  subscribeToUserScenarios,
  testFirestoreConnection,
} from './services/firebase';
import {
  areScenarioContentsEqual,
  createInitialHistoryState,
  scenarioHistoryReducer,
} from './state/scenarioHistoryReducer';
import type {
  CameraPreset,
  EditorTool,
  EquipmentCatalogItem,
  FlowType,
  LabEquipment,
  LabScenario,
} from './types/lab';
import {
  computeExecutiveMetrics,
  computeFlowAnalysis,
  evaluateCompliance,
} from './utils/labAnalysis';
import {
  clearStoredData,
  CURRENT_SCHEMA_VERSION,
  loadInitialStore,
  migrateImportedJson,
  saveStoreToStorage,
} from './utils/migration';
import {
  clampToRoom,
  getFootprint,
  getItemAABB,
  resolveZoneId,
} from './utils/placement';

export default function App() {
  const initial = useMemo(() => loadInitialStore(), []);
  const [historyState, dispatchHistory] = useReducer(
    scenarioHistoryReducer,
    initial.scenarios,
    createInitialHistoryState,
  );
  const scenarios = historyState.present;
  const canUndo = historyState.past.length > 0;
  const canRedo = historyState.future.length > 0;

  const [activeScenarioId, setActiveScenarioId] = useState<string>(initial.activeScenarioId);
  const [compareScenarioId, setCompareScenarioId] = useState<string>(initial.compareScenarioId);

  const [isDark, setIsDark] = useState<boolean>(false);
  const [tool, setTool] = useState<EditorTool>('inspect');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('iso');
  const [cameraPresetTick, setCameraPresetTick] = useState<number>(0);
  const [autoRotate, setAutoRotate] = useState<boolean>(false);
  const [showLabels, setShowLabels] = useState<boolean>(true);
  const [dockCollapsed, setDockCollapsed] = useState<boolean>(false);
  const [mobileLegendOpen, setMobileLegendOpen] = useState<boolean>(false);

  const [activeFlows, setActiveFlows] = useState<Record<FlowType, boolean>>({
    specimen: true,
    waste: true,
    staff: false,
  });
  const [showCrossings, setShowCrossings] = useState<boolean>(true);

  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [drawerTab, setDrawerTab] = useState<DrawerTab | null>(null);
  const [dragHud, setDragHud] = useState<{ label: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [cloudSyncing, setCloudSyncing] = useState<boolean>(false);

  const viewportRef = useRef<LabViewportHandle | null>(null);

  const showNotice = useCallback((msg: string) => {
    setNotice(msg);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 3200);
    return () => window.clearTimeout(t);
  }, [notice]);

  // Sync dark mode class on <html>
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  // Test Firebase connection & monitor auth state
  useEffect(() => {
    testFirestoreConnection().catch((err) =>
      console.warn('Firebase test connection:', err),
    );
    const unsubAuth = subscribeToAuth((u) => {
      setCurrentUser(u);
    });
    return () => unsubAuth();
  }, []);

  // Real-time synchronization of user scenarios from Firestore
  useEffect(() => {
    if (!currentUser) return;
    setCloudSyncing(true);
    const unsubScenarios = subscribeToUserScenarios(
      currentUser.uid,
      (cloudScenarios) => {
        setCloudSyncing(false);
        if (cloudScenarios.length > 0) {
          dispatchHistory({
            type: 'SET_PRESENT_NO_HISTORY',
            updater: (prev) => {
              const cloudIds = new Set(cloudScenarios.map((s) => s.id));
              const remainingLocal = prev.filter(
                (s) => !s.isBuiltIn && !cloudIds.has(s.id),
              );
              return [...DEFAULT_SCENARIOS, ...cloudScenarios, ...remainingLocal];
            },
          });
        }
      },
      (err) => {
        setCloudSyncing(false);
        console.error('Error syncing cloud scenarios:', err);
      },
    );
    return () => unsubScenarios();
  }, [currentUser]);

  // Keep active/compare IDs valid when scenarios change (e.g. after undo/delete/import)
  useEffect(() => {
    if (!scenarios.some((s) => s.id === activeScenarioId)) {
      setActiveScenarioId(scenarios[0]?.id ?? DEFAULT_SCENARIOS[0].id);
    }
    if (!scenarios.some((s) => s.id === compareScenarioId)) {
      setCompareScenarioId(
        scenarios[1]?.id ?? scenarios[0]?.id ?? DEFAULT_SCENARIOS[0].id,
      );
    }
  }, [scenarios, activeScenarioId, compareScenarioId]);

  // Auto-save to localStorage with schemaVersion
  useEffect(() => {
    saveStoreToStorage({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      scenarios,
      activeScenarioId,
      compareScenarioId,
    });
  }, [scenarios, activeScenarioId, compareScenarioId]);

  const activeScenario = useMemo(
    () => scenarios.find((s) => s.id === activeScenarioId) ?? scenarios[0],
    [scenarios, activeScenarioId],
  );

  const compareScenario = useMemo(
    () => scenarios.find((s) => s.id === compareScenarioId) ?? null,
    [scenarios, compareScenarioId],
  );

  const { routes, crossings } = useMemo(
    () => computeFlowAnalysis(activeScenario),
    [activeScenario],
  );

  const complianceRules = useMemo(
    () => evaluateCompliance(activeScenario),
    [activeScenario],
  );

  const activeMetrics = useMemo(
    () => computeExecutiveMetrics(activeScenario),
    [activeScenario],
  );

  const compareMetrics = useMemo(
    () => (compareScenario ? computeExecutiveMetrics(compareScenario) : null),
    [compareScenario],
  );

  // Mutation helper via single Undo/Redo reducer
  const mutateScenarios = useCallback(
    (
      updater: (prev: LabScenario[]) => LabScenario[],
      options?: { coalesceKey?: string; timestamp?: number },
    ) => {
      dispatchHistory({
        type: 'COMMIT',
        updater,
        coalesceKey: options?.coalesceKey,
        timestamp: options?.timestamp,
      });
    },
    [],
  );

  const updateActiveScenario = useCallback(
    (
      updater: (sc: LabScenario) => LabScenario,
      options?: { coalesceKey?: string; timestamp?: number },
    ) => {
      const candidate = updater(activeScenario);
      if (areScenarioContentsEqual(activeScenario, candidate)) {
        return;
      }

      const nowIso = new Date().toISOString();
      if (activeScenario.isBuiltIn) {
        const copyId = `scenario-copy-${Date.now()}`;
        const copy: LabScenario = {
          ...JSON.parse(JSON.stringify(candidate)),
          id: copyId,
          name: `${activeScenario.name} (สำเนา)`,
          isBuiltIn: false,
          updatedAt: nowIso,
        };
        mutateScenarios((prev) => [...prev, copy], options);
        setCompareScenarioId(activeScenario.id);
        setActiveScenarioId(copyId);
        showNotice(`สร้างสำเนา "${copy.name}" อัตโนมัติเพื่อไม่ให้ทับผังต้นฉบับ`);
        return;
      }

      const nextScenario: LabScenario = {
        ...candidate,
        updatedAt: nowIso,
      };
      mutateScenarios(
        (prev) => prev.map((s) => (s.id === activeScenario.id ? nextScenario : s)),
        options,
      );
    },
    [activeScenario, mutateScenarios, showNotice],
  );

  const handleUndo = useCallback(() => {
    if (!canUndo) return;
    dispatchHistory({ type: 'UNDO' });
    showNotice('ย้อนกลับการแก้ไขล่าสุดแล้ว');
  }, [canUndo, showNotice]);

  const handleRedo = useCallback(() => {
    if (!canRedo) return;
    dispatchHistory({ type: 'REDO' });
    showNotice('ทำซ้ำการแก้ไขแล้ว');
  }, [canRedo, showNotice]);

  const handleSelectEntity = useCallback((sel: SelectionState | null) => {
    setSelection(sel);
    if (sel) {
      setDrawerTab('inspector');
    }
  }, []);

  const handleCommitMove = useCallback(
    (
      kind: 'equipment' | 'zone' | 'opening',
      id: string,
      x: number,
      z: number,
      rotationDeg?: number,
    ) => {
      updateActiveScenario((sc) => {
        if (kind === 'equipment') {
          const target = sc.equipment.find((e) => e.id === id);
          if (!target) return sc;
          const dx = x - target.x;
          const dz = z - target.z;
          const newRot = rotationDeg !== undefined ? rotationDeg : target.rotationDeg;
          const targetAabb = getItemAABB(target);
          const childrenOnTop = sc.equipment.filter(
            (other) =>
              other.id !== target.id &&
              other.baseY > 0 &&
              other.x >= targetAabb.minX &&
              other.x <= targetAabb.maxX &&
              other.z >= targetAabb.minZ &&
              other.z <= targetAabb.maxZ &&
              other.baseY >= target.baseY + target.height * 0.7,
          );
          const childIds = new Set(childrenOnTop.map((c) => c.id));
          const newParentZone =
            resolveZoneId({ x, z }, sc.zones, { fallbackToNearest: true }) ?? target.zoneId;

          return {
            ...sc,
            equipment: sc.equipment.map((e) => {
              if (e.id === id) {
                return { ...e, x, z, rotationDeg: newRot, zoneId: newParentZone };
              }
              if (childIds.has(e.id)) {
                const cx = Number((e.x + dx).toFixed(2));
                const cz = Number((e.z + dz).toFixed(2));
                const czone =
                  resolveZoneId({ x: cx, z: cz }, sc.zones, { fallbackToNearest: true }) ??
                  newParentZone;
                return { ...e, x: cx, z: cz, zoneId: czone };
              }
              return e;
            }),
          };
        }
        if (kind === 'zone') {
          const prevZone = sc.zones.find((zItem) => zItem.id === id);
          const dx = prevZone ? x - prevZone.x : 0;
          const dz = prevZone ? z - prevZone.z : 0;
          return {
            ...sc,
            zones: sc.zones.map((zItem) => (zItem.id === id ? { ...zItem, x, z } : zItem)),
            // Move child equipment along with zone for intuitive zone relocation
            equipment: sc.equipment.map((eq) =>
              eq.zoneId === id
                ? {
                    ...eq,
                    x: Number((eq.x + dx).toFixed(2)),
                    z: Number((eq.z + dz).toFixed(2)),
                  }
                : eq,
            ),
          };
        }
        return {
          ...sc,
          openings: sc.openings.map((op) => (op.id === id ? { ...op, x, z } : op)),
        };
      });
    },
    [updateActiveScenario],
  );

  const handleUpdateEquipment = useCallback(
    (id: string, patch: Partial<LabEquipment>, coalesceKey?: string) => {
      const autoKey =
        coalesceKey ??
        ('labelTh' in patch || 'label' in patch
          ? `edit:${id}:${Object.keys(patch).sort().join(',')}`
          : undefined);
      updateActiveScenario(
        (sc) => ({
          ...sc,
          equipment: sc.equipment.map((e) => (e.id === id ? { ...e, ...patch } : e)),
        }),
        autoKey ? { coalesceKey: autoKey, timestamp: Date.now() } : undefined,
      );
    },
    [updateActiveScenario],
  );

  const handleDeleteEquipment = useCallback(
    (id: string) => {
      updateActiveScenario((sc) => ({
        ...sc,
        equipment: sc.equipment.filter((e) => e.id !== id),
      }));
      setSelection(null);
      showNotice('ลบครุภัณฑ์ออกจากผังแล้ว');
    },
    [updateActiveScenario, showNotice],
  );

  const handleAddEquipment = useCallback(
    (cat: EquipmentCatalogItem, targetZoneId?: string) => {
      const targetZone =
        activeScenario.zones.find((z) => z.id === targetZoneId) ??
        activeScenario.zones.find((z) => z.id === 'zone-prep') ??
        activeScenario.zones[0];
      const newId = `eq-custom-${Date.now()}`;
      const newItem: LabEquipment = {
        id: newId,
        type: cat.type,
        label: cat.label,
        labelTh: cat.labelTh,
        zoneId: targetZone.id,
        x: targetZone.x,
        z: targetZone.z,
        width: cat.width,
        depth: cat.depth,
        height: cat.height,
        baseY: cat.baseY,
        rotationDeg: 0,
        color: cat.defaultColor,
        showNameTag: cat.showNameTag,
      };
      updateActiveScenario((sc) => ({
        ...sc,
        equipment: [...sc.equipment, newItem],
      }));
      setSelection({ kind: 'equipment', id: newId });
      setTool('move');
      setDrawerTab('inspector');
      showNotice(`เพิ่ม "${cat.labelTh}" แล้ว — ลากเพื่อจัดวางใน 3D ได้เลย`);
    },
    [activeScenario.zones, updateActiveScenario, showNotice],
  );

  const handleDuplicateScenario = useCallback(() => {
    const newId = `scenario-custom-${Date.now()}`;
    const copy: LabScenario = {
      ...JSON.parse(JSON.stringify(activeScenario)),
      id: newId,
      name: `สำเนา: ${activeScenario.name.replace(/^สำเนา:\s*/, '')}`,
      isBuiltIn: false,
      updatedAt: new Date().toISOString(),
    };
    mutateScenarios((prev) => [...prev, copy]);
    setCompareScenarioId(activeScenario.id);
    setActiveScenarioId(newId);
    setSelection(null);
    showNotice('สร้างสำเนาผังใหม่เรียบร้อยแล้ว');
  }, [activeScenario, mutateScenarios, showNotice]);

  const handleRenameScenario = useCallback((id: string, name: string) => {
    dispatchHistory({
      type: 'SET_PRESENT_NO_HISTORY',
      updater: (prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)),
    });
  }, []);

  const handleDeleteScenario = useCallback(
    async (id: string) => {
      if (scenarios.length <= 1) return;
      const target = scenarios.find((s) => s.id === id);
      if (target?.isBuiltIn) return;
      const remaining = scenarios.filter((s) => s.id !== id);
      dispatchHistory({
        type: 'SET_PRESENT_NO_HISTORY',
        updater: (prev) => prev.filter((s) => s.id !== id),
      });
      if (activeScenarioId === id) {
        setActiveScenarioId(remaining[0].id);
      }
      if (compareScenarioId === id) {
        setCompareScenarioId(remaining[0].id);
      }
      if (currentUser) {
        try {
          await deleteScenarioFromFirebase(id);
        } catch (err) {
          console.error('Delete from Firebase error:', err);
        }
      }
      showNotice('ลบทางเลือกผังแล้ว');
    },
    [scenarios, activeScenarioId, compareScenarioId, currentUser, showNotice],
  );

  const handleLogin = useCallback(async () => {
    try {
      const u = await loginWithGoogle();
      if (!u) return;
      showNotice(`เข้าสู่ระบบสำเร็จ: ${u.displayName || u.email || ''}`);
    } catch {
      showNotice('เข้าสู่ระบบไม่สำเร็จ โปรดลองใหม่อีกครั้ง');
    }
  }, [showNotice]);

  const handleLogout = useCallback(async () => {
    try {
      await logoutUser();
      showNotice('ออกจากระบบแล้ว (บันทึกเฉพาะในเครื่อง)');
    } catch (err) {
      console.error('Logout error:', err);
    }
  }, [showNotice]);

  const handleSaveToFirebase = useCallback(async () => {
    let targetUser = currentUser;
    if (!targetUser) {
      try {
        targetUser = await loginWithGoogle();
        if (!targetUser) return;
      } catch {
        showNotice('โปรดเข้าสู่ระบบเพื่อบันทึกผังลง Firebase');
        return;
      }
    }
    if (!targetUser) return;

    setCloudSyncing(true);
    try {
      let scenarioToSave = activeScenario;
      if (scenarioToSave.isBuiltIn) {
        const newId = `scenario-custom-${Date.now()}`;
        scenarioToSave = {
          ...scenarioToSave,
          id: newId,
          name: `${scenarioToSave.name} (คลาวด์)`,
          isBuiltIn: false,
          updatedAt: new Date().toISOString(),
        };
        dispatchHistory({
          type: 'SET_PRESENT_NO_HISTORY',
          updater: (prev) => [...prev, scenarioToSave],
        });
        setActiveScenarioId(newId);
      }
      await saveScenarioToFirebase(scenarioToSave, targetUser);
      showNotice(`บันทึกผัง "${scenarioToSave.name}" ลง Firebase สำเร็จแล้ว ☁️`);
    } catch (err) {
      console.error('Failed to save scenario to Firebase:', err);
      showNotice('บันทึกลง Firebase ไม่สำเร็จ โปรดตรวจสอบการเชื่อมต่อ');
    } finally {
      setCloudSyncing(false);
    }
  }, [currentUser, activeScenario, showNotice]);

  const handleExportJson = useCallback(() => {
    const payload = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      activeScenarioId,
      scenarios,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `central-lab-digital-twin-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showNotice('ส่งออกไฟล์ JSON เรียบร้อยแล้ว');
  }, [activeScenarioId, scenarios, showNotice]);

  const handleImportJson = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        const data: unknown = JSON.parse(text);
        const migrated = migrateImportedJson(data);
        if (!migrated) {
          showNotice('รูปแบบไฟล์ JSON ไม่ถูกต้อง');
          return;
        }

        if (migrated.importedSingleName) {
          const importedCustom = migrated.store.scenarios.filter((s) => !s.isBuiltIn);
          const existingCustom = scenarios.filter((s) => !s.isBuiltIn);
          const combined = [...DEFAULT_SCENARIOS, ...existingCustom, ...importedCustom];
          const importedScenario = importedCustom[0];
          dispatchHistory({ type: 'REPLACE_ALL', scenarios: combined });
          if (importedScenario) {
            setActiveScenarioId(importedScenario.id);
          }
          setSelection(null);
          showNotice(`นำเข้าผัง "${migrated.importedSingleName}" สำเร็จ`);
        } else {
          dispatchHistory({ type: 'REPLACE_ALL', scenarios: migrated.store.scenarios });
          setActiveScenarioId(migrated.store.activeScenarioId);
          setCompareScenarioId(migrated.store.compareScenarioId);
          setSelection(null);
          showNotice(`นำเข้า ${migrated.importedCount} ทางเลือกผังสำเร็จ`);
        }
      } catch {
        showNotice('ไม่สามารถอ่านไฟล์ JSON ได้');
      }
    },
    [scenarios, showNotice],
  );

  const handleExportPng = useCallback(() => {
    const dataUrl = viewportRef.current?.capturePng();
    if (!dataUrl) {
      showNotice('ไม่สามารถจับภาพโมเดล 3 มิติได้');
      return;
    }
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `lab-plan-3d-${new Date().toISOString().slice(0, 10)}.png`;
    a.click();
    showNotice('บันทึกภาพโมเดล (.PNG) แล้ว');
  }, [showNotice]);

  const handleResetAll = useCallback(() => {
    clearStoredData();
    dispatchHistory({ type: 'REPLACE_ALL', scenarios: DEFAULT_SCENARIOS });
    setActiveScenarioId(DEFAULT_SCENARIOS[0].id);
    setCompareScenarioId(DEFAULT_SCENARIOS[1].id);
    setSelection(null);
    showNotice('รีเซ็ตกลับเป็นผังตั้งต้นแล้ว');
  }, [showNotice]);

  const handleResetCurrentScenario = useCallback(() => {
    const pristine =
      DEFAULT_SCENARIOS.find((s) => s.id === activeScenario.id) ?? DEFAULT_SCENARIOS[0];
    updateActiveScenario((sc) => ({
      ...sc,
      labWidth: pristine.labWidth,
      labDepth: pristine.labDepth,
      zones: JSON.parse(JSON.stringify(pristine.zones)),
      equipment: JSON.parse(JSON.stringify(pristine.equipment)),
      walls: JSON.parse(JSON.stringify(pristine.walls)),
      openings: JSON.parse(JSON.stringify(pristine.openings)),
    }));
    showNotice(`คืนค่าผัง "${activeScenario.name}" เป็นค่าเริ่มต้นแล้ว`);
  }, [activeScenario.id, activeScenario.name, updateActiveScenario, showNotice]);

  const handleResetEquipmentToPreset = useCallback(
    (eqId: string) => {
      const pristine =
        DEFAULT_SCENARIOS.find((s) => s.id === activeScenario.id) ?? DEFAULT_SCENARIOS[0];
      const pristineEq = pristine.equipment.find((e) => e.id === eqId);
      if (!pristineEq) {
        showNotice('ไม่พบค่าตั้งต้นของครุภัณฑ์นี้');
        return;
      }
      updateActiveScenario((sc) => ({
        ...sc,
        equipment: sc.equipment.map((eq) =>
          eq.id === eqId ? { ...JSON.parse(JSON.stringify(pristineEq)) } : eq,
        ),
      }));
      showNotice(`คืนค่าตำแหน่งเดิมของ "${pristineEq.labelTh}" แล้ว`);
    },
    [activeScenario.id, updateActiveScenario, showNotice],
  );

  const handleNudgeEquipment = useCallback(
    (dx: number, dz: number) => {
      if (selection?.kind !== 'equipment') return;
      const eq = activeScenario.equipment.find((item) => item.id === selection.id);
      if (!eq) return;
      const fp = getFootprint(eq);
      const clamped = clampToRoom(
        { x: eq.x + dx, z: eq.z + dz },
        fp,
        activeScenario.labWidth,
        activeScenario.labDepth,
      );
      const nx = Number(clamped.x.toFixed(2));
      const nz = Number(clamped.z.toFixed(2));
      const actualDx = nx - eq.x;
      const actualDz = nz - eq.z;
      if (actualDx === 0 && actualDz === 0) return;

      const parentAabb = getItemAABB(eq);
      const childrenOnTop = activeScenario.equipment.filter(
        (other) =>
          other.id !== eq.id &&
          other.baseY > 0 &&
          other.x >= parentAabb.minX &&
          other.x <= parentAabb.maxX &&
          other.z >= parentAabb.minZ &&
          other.z <= parentAabb.maxZ &&
          other.baseY >= eq.baseY + eq.height * 0.7,
      );
      const childIds = new Set(childrenOnTop.map((c) => c.id));
      const newZoneId =
        resolveZoneId({ x: nx, z: nz }, activeScenario.zones, { fallbackToNearest: true }) ??
        eq.zoneId;

      updateActiveScenario(
        (sc) => ({
          ...sc,
          equipment: sc.equipment.map((e) => {
            if (e.id === eq.id) {
              return { ...e, x: nx, z: nz, zoneId: newZoneId };
            }
            if (childIds.has(e.id)) {
              const cx = Number((e.x + actualDx).toFixed(2));
              const cz = Number((e.z + actualDz).toFixed(2));
              const czone =
                resolveZoneId({ x: cx, z: cz }, sc.zones, { fallbackToNearest: true }) ??
                newZoneId;
              return { ...e, x: cx, z: cz, zoneId: czone };
            }
            return e;
          }),
        }),
        { coalesceKey: `nudge:${eq.id}`, timestamp: Date.now() },
      );
    },
    [selection, activeScenario, updateActiveScenario],
  );

  const handleRotate90Selection = useCallback(() => {
    if (selection?.kind !== 'equipment') return;
    const eq = activeScenario.equipment.find((item) => item.id === selection.id);
    if (!eq) return;
    const newRot = (eq.rotationDeg + 90) % 360;
    const fp = getFootprint({ width: eq.width, depth: eq.depth, rotationDeg: newRot });
    const clamped = clampToRoom(
      { x: eq.x, z: eq.z },
      fp,
      activeScenario.labWidth,
      activeScenario.labDepth,
    );
    const nx = Number(clamped.x.toFixed(2));
    const nz = Number(clamped.z.toFixed(2));
    const newZoneId =
      resolveZoneId({ x: nx, z: nz }, activeScenario.zones, { fallbackToNearest: true }) ??
      eq.zoneId;

    handleUpdateEquipment(eq.id, { rotationDeg: newRot, x: nx, z: nz, zoneId: newZoneId });
  }, [selection, activeScenario, handleUpdateEquipment]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inInput =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT';
      if (inInput) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
        return;
      }
      if (e.key.toLowerCase() === 'h') {
        setDockCollapsed((v) => !v);
        return;
      }
      if (e.key.toLowerCase() === 'r' && selection?.kind === 'equipment') {
        handleRotate90Selection();
        return;
      }
      if (e.key === 'Escape') {
        setSelection(null);
        setDrawerTab(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    handleUndo,
    handleRedo,
    selection,
    handleRotate90Selection,
  ]);

  return (
    <div className="flex h-[100dvh] w-full max-w-full flex-col overflow-hidden bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <TopBar
          scenarios={scenarios}
          activeScenarioId={activeScenario.id}
          isDark={isDark}
          canUndo={canUndo}
          canRedo={canRedo}
          activeDrawerTab={drawerTab}
          complianceSummary={{
            passed: activeMetrics.passedRules,
            total: activeMetrics.totalRules,
          }}
          user={currentUser}
          cloudSyncing={cloudSyncing}
          onLogin={handleLogin}
          onLogout={handleLogout}
          onSaveToFirebase={handleSaveToFirebase}
          onSelectScenario={(id) => {
            setActiveScenarioId(id);
            setSelection(null);
          }}
          onDuplicateScenario={handleDuplicateScenario}
          onOpenDrawerTab={(tab) => setDrawerTab(tab)}
          onToggleDark={() => setIsDark((v) => !v)}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onExportJson={handleExportJson}
          onImportJson={handleImportJson}
          onExportPng={handleExportPng}
          onResetCurrentScenario={handleResetCurrentScenario}
          onResetAll={handleResetAll}
        />

        {/* Main Unobstructed 3D Viewport Stage */}
        <main className="relative flex-1 overflow-hidden">
          <LabViewport3D
            ref={viewportRef}
            scenario={activeScenario}
            isDark={isDark}
            tool={tool}
            cameraPreset={cameraPreset}
            cameraPresetTick={cameraPresetTick}
            autoRotate={autoRotate}
            showLabels={showLabels}
            activeFlows={activeFlows}
            showCrossings={showCrossings}
            routes={routes}
            crossings={crossings}
            selection={selection}
            onSelect={handleSelectEntity}
            onUserOrbitStart={() => setAutoRotate(false)}
            onLiveDragCoords={setDragHud}
            onCommitMove={handleCommitMove}
            onNotice={showNotice}
          />

          {/* Sims-style Floating Move HUD when equipment is selected */}
          {selection?.kind === 'equipment' && (
            <SimsMoveHUD
              item={activeScenario.equipment.find((e) => e.id === selection.id)!}
              scenario={activeScenario}
              onNudge={handleNudgeEquipment}
              onRotate90={handleRotate90Selection}
              onResetItemToPreset={() => handleResetEquipmentToPreset(selection.id)}
              hasPresetPosition={Boolean(
                DEFAULT_SCENARIOS.find((s) => s.id === activeScenario.id)?.equipment.some(
                  (e) => e.id === selection.id,
                ),
              )}
              onDelete={() => handleDeleteEquipment(selection.id)}
              onClose={() => setSelection(null)}
            />
          )}

          {/* Subtle Top-Left Legend & Context Hint (no backdrop-filter over WebGL) */}
          <div className="pointer-events-none fixed left-2.5 top-[60px] sm:left-3 sm:top-[68px] z-10 flex flex-col gap-1.5">
            {/* Desktop full legend */}
            <div className="hidden md:flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-slate-200 bg-white/95 px-3 py-1.5 text-xs text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-300">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-[#5DCAA5]" aria-hidden="true" />
                โซนสะอาด
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-[#F0997B]" aria-hidden="true" />
                โซนสกปรก / ขยะ
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-[#B4B2A9]" aria-hidden="true" />
                สนับสนุน
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-[#AFA9EC]" aria-hidden="true" />
                พักเจ้าหน้าที่
              </span>
              <span className="text-slate-400" aria-hidden="true">·</span>
              <span className="text-slate-500 dark:text-slate-400">
                ภาพประมาณการสัดส่วน
              </span>
            </div>

            {/* Mobile collapsible legend chip */}
            <button
              type="button"
              onClick={() => setMobileLegendOpen((v) => !v)}
              className="pointer-events-auto flex md:hidden items-center gap-1.5 rounded-lg border border-slate-200 bg-white/95 px-2.5 py-1 text-[11px] font-medium text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-300"
            >
              <span className="flex items-center gap-1" aria-hidden="true">
                <span className="h-2 w-2 rounded-full bg-[#5DCAA5]" />
                <span className="h-2 w-2 rounded-full bg-[#F0997B]" />
                <span className="h-2 w-2 rounded-full bg-[#B4B2A9]" />
                <span className="h-2 w-2 rounded-full bg-[#AFA9EC]" />
              </span>
              <span>ผังสีโซน {mobileLegendOpen ? '▲' : '▼'}</span>
            </button>

            {mobileLegendOpen && (
              <div className="pointer-events-auto flex md:hidden flex-col gap-1 rounded-lg border border-slate-200 bg-white/95 p-2 text-xs text-slate-700 shadow-md dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-300">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-[#5DCAA5]" aria-hidden="true" />
                  โซนสะอาด
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-[#F0997B]" aria-hidden="true" />
                  โซนสกปรก / ขยะ
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-[#B4B2A9]" aria-hidden="true" />
                  สนับสนุน
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-[#AFA9EC]" aria-hidden="true" />
                  พักเจ้าหน้าที่
                </span>
              </div>
            )}

            {tool === 'move' && !dragHud && (
              <div className="w-fit max-w-[280px] sm:max-w-none rounded-lg border border-teal-600/30 bg-teal-50 px-2.5 py-1 text-[11px] sm:text-xs font-medium text-teal-800 dark:border-teal-500/30 dark:bg-teal-950/90 dark:text-teal-200">
                โหมดย้าย/จัดวาง: ลากเพื่อจัดตำแหน่ง (กด R หมุน, Alt ปิดสแน็ป, Esc ยกเลิก)
              </div>
            )}

            {dragHud && (
              <div className="w-fit rounded-lg border border-slate-300 bg-slate-900 px-2.5 py-1 text-[11px] sm:text-xs font-medium text-white shadow-sm">
                กำลังย้าย: {dragHud.label}
              </div>
            )}
          </div>

          {/* Transient Notice Toast */}
          {notice && (
            <div
              role="status"
              className="pointer-events-none fixed left-1/2 top-[60px] sm:top-[68px] z-35 -translate-x-1/2 rounded-lg border border-slate-200 bg-slate-900 px-3 py-1.5 sm:px-3.5 sm:py-2 text-xs font-medium text-white shadow-md dark:border-slate-700 dark:bg-slate-100 dark:text-slate-900"
            >
              {notice}
            </div>
          )}

          <RightDrawer
            activeTab={drawerTab}
            scenario={activeScenario}
            scenarios={scenarios}
            compareScenarioId={compareScenarioId}
            selection={selection}
            complianceRules={complianceRules}
            routes={routes}
            crossings={crossings}
            activeMetrics={activeMetrics}
            compareMetrics={compareMetrics}
            activeFlows={activeFlows}
            onToggleFlow={(type) =>
              setActiveFlows((prev) => ({ ...prev, [type]: !prev[type] }))
            }
            onToggleSpecimenAndWaste={() =>
              setActiveFlows((prev) => {
                const bothOn = prev.specimen && prev.waste;
                return { ...prev, specimen: !bothOn, waste: !bothOn };
              })
            }
            onClose={() => setDrawerTab(null)}
            onChangeTab={(tab) => setDrawerTab(tab)}
            onUpdateEquipment={handleUpdateEquipment}
            onDeleteEquipment={handleDeleteEquipment}
            onResetEquipmentToPreset={handleResetEquipmentToPreset}
            onFocusPoint={(x, z) => viewportRef.current?.focusPoint(x, z)}
            onSelectCompareScenario={(id) => setCompareScenarioId(id)}
            onSwitchActiveScenario={(id) => {
              setActiveScenarioId(id);
              setSelection(null);
            }}
            onRenameScenario={handleRenameScenario}
            onDeleteScenario={handleDeleteScenario}
            onAddEquipment={handleAddEquipment}
          />

          <BottomDock
            collapsed={dockCollapsed}
            onToggleCollapse={() => setDockCollapsed((v) => !v)}
            cameraPreset={cameraPreset}
            autoRotate={autoRotate}
            showLabels={showLabels}
            activeFlows={activeFlows}
            showCrossings={showCrossings}
            crossingsCount={crossings.length}
            catalogOpen={drawerTab === 'catalog'}
            onSelectCamera={(preset) => {
              setAutoRotate(false);
              setCameraPreset(preset);
              setCameraPresetTick((t) => t + 1);
            }}
            onToggleAutoRotate={() => setAutoRotate((v) => !v)}
            onToggleLabels={() => setShowLabels((v) => !v)}
            onToggleFlow={(type) =>
              setActiveFlows((prev) => ({ ...prev, [type]: !prev[type] }))
            }
            onToggleCrossings={() => setShowCrossings((v) => !v)}
            onToggleCatalog={() =>
              setDrawerTab((prev) => (prev === 'catalog' ? null : 'catalog'))
            }
            onResetCurrentScenario={handleResetCurrentScenario}
          />
        </main>
    </div>
  );
}
