import {
  AlertTriangle,
  CheckCircle2,
  Crosshair,
  Eye,
  EyeOff,
  Plus,
  RotateCcw,
  RotateCw,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { EQUIPMENT_CATALOG } from '../data/presets';
import type {
  ComplianceRuleResult,
  CrossingAlert,
  EquipmentCatalogItem,
  ExecutiveMetrics,
  FlowRoute,
  FlowType,
  LabEquipment,
  LabScenario,
  LabZone,
} from '../types/lab';
import type { SelectionState } from './LabViewport3D';

export type DrawerTab = 'inspector' | 'compliance' | 'compare' | 'catalog';

interface RightDrawerProps {
  activeTab: DrawerTab | null;
  scenario: LabScenario;
  scenarios: LabScenario[];
  compareScenarioId: string;
  selection: SelectionState | null;
  complianceRules: ComplianceRuleResult[];
  routes: FlowRoute[];
  crossings: CrossingAlert[];
  activeMetrics: ExecutiveMetrics;
  compareMetrics: ExecutiveMetrics | null;
  activeFlows: Record<FlowType, boolean>;
  onToggleFlow: (type: FlowType) => void;
  onToggleSpecimenAndWaste: () => void;
  onClose: () => void;
  onChangeTab: (tab: DrawerTab) => void;
  onUpdateEquipment: (id: string, patch: Partial<LabEquipment>) => void;
  onDeleteEquipment: (id: string) => void;
  onResetEquipmentToPreset?: (id: string) => void;
  onFocusPoint: (x: number, z: number) => void;
  onSelectCompareScenario: (id: string) => void;
  onSwitchActiveScenario: (id: string) => void;
  onRenameScenario: (id: string, name: string) => void;
  onDeleteScenario: (id: string) => void;
  onAddEquipment: (item: EquipmentCatalogItem, targetZoneId?: string) => void;
}

const STATUS_BADGE = {
  pass: {
    label: 'ผ่านเกณฑ์',
    className: 'text-emerald-700 dark:text-emerald-400',
    Icon: CheckCircle2,
  },
  warn: {
    label: 'ควรปรับปรุง',
    className: 'text-amber-700 dark:text-amber-400',
    Icon: AlertTriangle,
  },
  fail: {
    label: 'เสี่ยงสูง',
    className: 'text-rose-700 dark:text-rose-400',
    Icon: XCircle,
  },
};

export function RightDrawer({
  activeTab,
  scenario,
  scenarios,
  compareScenarioId,
  selection,
  complianceRules,
  routes,
  crossings,
  activeMetrics,
  compareMetrics,
  activeFlows,
  onToggleFlow,
  onToggleSpecimenAndWaste,
  onClose,
  onChangeTab,
  onUpdateEquipment,
  onDeleteEquipment,
  onResetEquipmentToPreset,
  onFocusPoint,
  onSelectCompareScenario,
  onSwitchActiveScenario,
  onRenameScenario,
  onDeleteScenario,
  onAddEquipment,
}: RightDrawerProps) {
  if (!activeTab) return null;

  const selectedEquipment =
    selection?.kind === 'equipment'
      ? scenario.equipment.find((e) => e.id === selection.id) ?? null
      : null;
  const selectedZone =
    selection?.kind === 'zone'
      ? scenario.zones.find((z) => z.id === selection.id) ?? null
      : null;
  const selectedOpening =
    selection?.kind === 'opening'
      ? scenario.openings.find((o) => o.id === selection.id) ?? null
      : null;

  const compareScenario = scenarios.find((s) => s.id === compareScenarioId) ?? null;

  return (
    <>
      {/* Mobile backdrop overlay */}
      <div
        className="fixed inset-0 z-20 bg-slate-950/40 backdrop-blur-[2px] transition-opacity sm:hidden"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        aria-label="แผงข้อมูลและการวิเคราะห์"
        className="fixed inset-x-0 bottom-0 z-30 flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-2xl border-t border-slate-200 bg-white text-slate-900 shadow-2xl transition-all sm:inset-x-auto sm:right-3 sm:top-[68px] sm:bottom-auto sm:max-h-[calc(100vh-165px)] sm:w-[380px] sm:max-w-[92vw] sm:rounded-xl sm:border dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      >
        {/* Mobile drag handle */}
        <div className="flex justify-center pt-2 pb-1 sm:hidden" aria-hidden="true">
          <div className="h-1.5 w-12 rounded-full bg-slate-300 dark:bg-slate-700" />
        </div>

        {/* Drawer Tab Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 dark:border-slate-800">
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar" role="tablist">
          {(
            [
              ['inspector', 'รายละเอียด'],
              ['compliance', 'IC / LA'],
              ['compare', 'เปรียบเทียบ'],
              ['catalog', 'เพิ่มของ'],
            ] as [DrawerTab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={activeTab === id}
              onClick={() => onChangeTab(id)}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                activeTab === id
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="ปิดแผงข้อมูล"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* Drawer Content */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4 text-sm">
        {/* TAB 1: INSPECTOR */}
        {activeTab === 'inspector' && (
          <>
            {!selectedEquipment && !selectedZone && !selectedOpening && (
              <div className="space-y-4 py-2">
                <div className="space-y-1.5 text-center">
                  <p className="font-medium text-slate-800 dark:text-slate-200">
                    คลิกเลือกโซน โต๊ะ หรือเครื่องตรวจในโมเดล 3 มิติ
                  </p>
                  <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                    เพื่อดูรายละเอียด แก้ไขชื่อ หมุนทิศทาง หรือสลับเป็นโหมด "ย้าย / จัดวาง" เพื่อลากจัดผัง
                  </p>
                </div>

                <div className="border-t border-slate-200 pt-3 text-left dark:border-slate-800">
                  <p className="mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    โซนทั้งหมด ({scenario.zones.length} โซน)
                  </p>
                  <div className="space-y-1">
                    {scenario.zones.map((z) => (
                      <button
                        key={z.id}
                        type="button"
                        onClick={() => onFocusPoint(z.x, z.z)}
                        className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <span className="flex items-center gap-2 font-medium">
                          <span
                            className="h-2.5 w-2.5 rounded-sm"
                            style={{ backgroundColor: z.color }}
                            aria-hidden="true"
                          />
                          <span>{z.name}</span>
                        </span>
                        <span className="truncate pl-2 text-slate-500 dark:text-slate-400">
                          {z.nameTh}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {selectedEquipment && (
              <EquipmentInspector
                item={selectedEquipment}
                scenario={scenario}
                onUpdate={(patch) => onUpdateEquipment(selectedEquipment.id, patch)}
                onDelete={() => onDeleteEquipment(selectedEquipment.id)}
                onResetToPreset={
                  onResetEquipmentToPreset
                    ? () => onResetEquipmentToPreset(selectedEquipment.id)
                    : undefined
                }
              />
            )}

            {selectedZone && (
              <ZoneInspector zone={selectedZone} scenario={scenario} />
            )}

            {selectedOpening && (
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    จุดเข้า-ออกอาคาร · {selectedOpening.label}
                  </p>
                  <h3 className="mt-0.5 text-base font-semibold">{selectedOpening.labelTh}</h3>
                </div>
                <p className="border-t border-slate-200 pt-3 text-xs leading-relaxed text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  สามารถสลับเป็นโหมด "ย้าย / จัดวาง" ด้านล่างเพื่อลากเปลี่ยนตำแหน่งประตูหรือหน้าต่างบานเลื่อนบนผังได้ทันที
                </p>
              </div>
            )}
          </>
        )}

        {/* TAB 2: IC / LA COMPLIANCE */}
        {activeTab === 'compliance' && (
          <div className="space-y-4">
            <div className="flex items-baseline justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">ผลประเมินผังปัจจุบัน</p>
                <p className="mt-0.5 text-2xl font-bold font-mono-tabular">
                  {activeMetrics.complianceScorePct}%
                  <span className="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400">
                    ({activeMetrics.passedRules}/{activeMetrics.totalRules} เกณฑ์ผ่าน)
                  </span>
                </p>
              </div>
              <div className="text-right text-xs font-mono-tabular text-slate-600 dark:text-slate-400">
                <div>จุดตัดเสี่ยง {crossings.length} จุด</div>
              </div>
            </div>

            {/* Workflow Path Summary */}
            <div className="space-y-2 border-b border-slate-200 pb-3 dark:border-slate-800">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  เส้นทาง Flow (แสดง / ซ่อน)
                </p>
                <button
                  type="button"
                  onClick={onToggleSpecimenAndWaste}
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                    activeFlows.specimen && activeFlows.waste
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                  }`}
                >
                  {activeFlows.specimen && activeFlows.waste ? (
                    <>
                      <EyeOff className="h-3 w-3" aria-hidden="true" />
                      <span>ซ่อน Specimen & Waste</span>
                    </>
                  ) : (
                    <>
                      <Eye className="h-3 w-3" aria-hidden="true" />
                      <span>แสดง Specimen & Waste</span>
                    </>
                  )}
                </button>
              </div>
              {routes.map((r) => {
                const isVisible = activeFlows[r.type];
                return (
                  <div key={r.type} className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-2">
                      {r.dashed ? (
                        <span
                          className="inline-block h-0 w-4 border-t-2 border-dashed"
                          style={{ borderColor: r.color }}
                          aria-hidden="true"
                        />
                      ) : (
                        <span
                          className="inline-block h-0.5 w-4"
                          style={{ backgroundColor: r.color }}
                          aria-hidden="true"
                        />
                      )}
                      <span>{r.labelTh}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => onToggleFlow(r.type)}
                      aria-pressed={isVisible}
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors ${
                        isVisible
                          ? 'bg-teal-700 text-white dark:bg-teal-600'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
                      }`}
                    >
                      {isVisible ? (
                        <>
                          <Eye className="h-3 w-3" aria-hidden="true" />
                          <span>แสดงอยู่</span>
                        </>
                      ) : (
                        <>
                          <EyeOff className="h-3 w-3" aria-hidden="true" />
                          <span>ซ่อนอยู่</span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Rules List */}
            <div className="space-y-2.5">
              {complianceRules.map((rule) => {
                const st = STATUS_BADGE[rule.status];
                const Icon = st.Icon;
                return (
                  <div
                    key={rule.id}
                    className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                        {rule.code} · {rule.title}
                      </span>
                      <span
                        className={`inline-flex shrink-0 items-center gap-1 text-xs font-medium whitespace-nowrap ${st.className}`}
                      >
                        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{st.label}</span>
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                      {rule.detail}
                    </p>
                    {rule.focusPoint && (
                      <button
                        type="button"
                        onClick={() => onFocusPoint(rule.focusPoint!.x, rule.focusPoint!.z)}
                        className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:underline dark:text-teal-400"
                      >
                        <Crosshair className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>ซูมดูตำแหน่งนี้บน 3 มิติ</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 3: EXECUTIVE COMPARE */}
        {activeTab === 'compare' && (
          <div className="space-y-4">
            <div className="space-y-2 border-b border-slate-200 pb-3 dark:border-slate-800">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  ผังหลัก (กำลังแสดงใน 3D)
                </span>
                {!scenario.isBuiltIn && (
                  <button
                    type="button"
                    onClick={() => onDeleteScenario(scenario.id)}
                    className="text-xs text-rose-600 hover:underline dark:text-rose-400"
                  >
                    ลบผังนี้
                  </button>
                )}
              </div>
              {scenario.isBuiltIn ? (
                <p className="text-sm font-semibold">{scenario.name}</p>
              ) : (
                <input
                  type="text"
                  value={scenario.name}
                  onChange={(e) => onRenameScenario(scenario.id, e.target.value)}
                  aria-label="ชื่อทางเลือกผัง"
                  className="h-8 w-full rounded-md border border-slate-200 bg-slate-50 px-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-800"
                />
              )}

              <div className="pt-1">
                <label
                  htmlFor="compare-select"
                  className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400"
                >
                  เปรียบเทียบกับทางเลือก
                </label>
                <div className="flex items-center gap-2">
                  <select
                    id="compare-select"
                    value={compareScenarioId}
                    onChange={(e) => onSelectCompareScenario(e.target.value)}
                    className="h-8 flex-1 rounded-md border border-slate-200 bg-slate-50 px-2 text-xs font-medium dark:border-slate-700 dark:bg-slate-800"
                  >
                    {scenarios.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  {compareScenario && compareScenario.id !== scenario.id && (
                    <button
                      type="button"
                      onClick={() => onSwitchActiveScenario(compareScenario.id)}
                      className="h-8 shrink-0 rounded-md border border-teal-700 px-2.5 text-xs font-medium text-teal-700 hover:bg-teal-50 dark:border-teal-500 dark:text-teal-300 dark:hover:bg-teal-950/50"
                    >
                      สลับดู 3D
                    </button>
                  )}
                </div>
              </div>
            </div>

            {compareMetrics && (
              <div className="space-y-1">
                <div className="grid grid-cols-12 border-b border-slate-200 pb-1.5 text-[11px] font-semibold text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <div className="col-span-6">ตัวชี้วัดสำคัญ</div>
                  <div className="col-span-3 text-right">ผังปัจจุบัน</div>
                  <div className="col-span-3 text-right">คู่เทียบ</div>
                </div>

                <CompareRow
                  label="ความพร้อม IC / LA"
                  valA={`${activeMetrics.complianceScorePct}%`}
                  valB={`${compareMetrics.complianceScorePct}%`}
                  better={
                    activeMetrics.complianceScorePct === compareMetrics.complianceScorePct
                      ? 'equal'
                      : activeMetrics.complianceScorePct > compareMetrics.complianceScorePct
                        ? 'A'
                        : 'B'
                  }
                />
                <CompareRow
                  label="จุดตัดปนเปื้อน"
                  valA={`${activeMetrics.crossingsCount} จุด`}
                  valB={`${compareMetrics.crossingsCount} จุด`}
                  better={
                    activeMetrics.crossingsCount === compareMetrics.crossingsCount
                      ? 'equal'
                      : activeMetrics.crossingsCount < compareMetrics.crossingsCount
                        ? 'A'
                        : 'B'
                  }
                />
                <CompareRow
                  label="จำนวนอ่างล้างมือ"
                  valA={`${activeMetrics.sinkCount} จุด`}
                  valB={`${compareMetrics.sinkCount} จุด`}
                  better="equal"
                />
                <CompareRow
                  label="จำนวนครุภัณฑ์"
                  valA={`${activeMetrics.equipmentCount} ชิ้น`}
                  valB={`${compareMetrics.equipmentCount} ชิ้น`}
                  better="equal"
                />
              </div>
            )}
          </div>
        )}

        {/* TAB 4: ADD EQUIPMENT CATALOG */}
        {activeTab === 'catalog' && (
          <div className="space-y-3">
            <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              คลิกเลือกรายการเพื่อวางลงบนผัง 3 มิติ จากนั้นสามารถลากย้ายตำแหน่งและหมุนทิศทางได้ทันที
            </p>
            <div className="space-y-2">
              {EQUIPMENT_CATALOG.map((cat) => (
                <button
                  key={cat.label}
                  type="button"
                  onClick={() => onAddEquipment(cat, selectedZone?.id)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 p-2.5 text-left transition-colors hover:border-teal-600 hover:bg-teal-50/40 dark:border-slate-800 dark:hover:border-teal-500 dark:hover:bg-teal-950/30"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {cat.labelTh}
                    </p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                      {cat.summary}
                    </p>
                  </div>
                  <Plus className="h-4 w-4 shrink-0 text-teal-700 dark:text-teal-400" aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  </>
  );
}

function EquipmentInspector({
  item,
  scenario,
  onUpdate,
  onDelete,
  onResetToPreset,
}: {
  item: LabEquipment;
  scenario: LabScenario;
  onUpdate: (patch: Partial<LabEquipment>) => void;
  onDelete: () => void;
  onResetToPreset?: () => void;
}) {
  const zone = scenario.zones.find((z) => z.id === item.zoneId);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {zone?.name ?? 'อุปกรณ์'}
          </p>
          <input
            type="text"
            value={item.labelTh}
            onChange={(e) => onUpdate({ labelTh: e.target.value })}
            aria-label="ชื่อแสดงในรายละเอียด"
            className="h-8 w-full rounded-md border border-slate-200 bg-slate-50 px-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-800"
          />
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={item.label}
              onChange={(e) => onUpdate({ label: e.target.value })}
              aria-label="ป้ายชื่อบนโมเดล 3 มิติ"
              placeholder="ป้ายชื่อ 3 มิติ"
              className="h-7 flex-1 rounded-md border border-slate-200 bg-slate-50 px-2 font-mono-tabular text-xs dark:border-slate-700 dark:bg-slate-800"
            />
            <label className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={Boolean(item.showNameTag)}
                onChange={(e) => onUpdate({ showNameTag: e.target.checked })}
                className="h-3.5 w-3.5 accent-teal-700"
              />
              <span>โชว์ป้าย 3D</span>
            </label>
          </div>
        </div>
        <button
          type="button"
          onClick={onDelete}
          title="ลบอุปกรณ์นี้"
          aria-label="ลบอุปกรณ์นี้"
          className="mt-5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-rose-600 hover:bg-rose-50 dark:border-slate-700 dark:text-rose-400 dark:hover:bg-rose-950/50"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* Rotation & Reset Preset */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
        <span className="text-xs text-slate-600 dark:text-slate-400">
          มุมหมุน: <strong className="font-mono-tabular">{item.rotationDeg}°</strong>
        </span>
        <div className="flex items-center gap-1.5">
          {onResetToPreset && (
            <button
              type="button"
              onClick={onResetToPreset}
              title="คืนตำแหน่งและมุมตั้งต้นของครุภัณฑ์ชิ้นนี้"
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-medium hover:border-teal-600 dark:border-slate-700"
            >
              <RotateCcw className="h-3 w-3 text-teal-600 dark:text-teal-400" />
              <span>คืนค่าเดิม</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => onUpdate({ rotationDeg: (item.rotationDeg + 90) % 360 })}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-xs font-medium hover:border-teal-600 dark:border-slate-700"
          >
            <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>หมุน 90° (R)</span>
          </button>
        </div>
      </div>

      {item.notes && (
        <p className="rounded-lg bg-slate-50 p-2.5 text-xs leading-relaxed text-slate-600 dark:bg-slate-800/80 dark:text-slate-300">
          {item.notes}
        </p>
      )}
    </div>
  );
}

function ZoneInspector({
  zone,
  scenario,
}: {
  zone: LabZone;
  scenario: LabScenario;
}) {
  const categoryLabel: Record<LabZone['category'], string> = {
    clean: 'โซนสะอาด (Clean)',
    dirty: 'โซนสกปรก / ติดเชื้อ (Dirty)',
    support: 'โซนสนับสนุน (Support)',
    staff: 'พักเจ้าหน้าที่ (Staff)',
  };

  const itemsInZone = scenario.equipment.filter((e) => e.zoneId === zone.id);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {categoryLabel[zone.category]} · {zone.name}
        </p>
        <h3 className="mt-0.5 text-base font-semibold">{zone.nameTh}</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
          {zone.description}
        </p>
      </div>

      <div className="border-t border-slate-200 pt-3 text-xs dark:border-slate-800">
        <span className="text-slate-500 dark:text-slate-400">จำนวนครุภัณฑ์ในโซน</span>
        <p className="font-mono-tabular text-sm font-semibold">{itemsInZone.length} รายการ</p>
      </div>
    </div>
  );
}

function CompareRow({
  label,
  valA,
  valB,
  better,
}: {
  label: string;
  valA: string;
  valB: string;
  better: 'A' | 'B' | 'equal';
}) {
  return (
    <div className="grid grid-cols-12 items-center border-b border-slate-100 py-2 text-xs dark:border-slate-800/80">
      <div className="col-span-6 text-slate-700 dark:text-slate-300">{label}</div>
      <div
        className={`col-span-3 text-right font-mono-tabular font-medium ${
          better === 'A' ? 'text-emerald-700 dark:text-emerald-400' : ''
        }`}
      >
        {valA}
      </div>
      <div
        className={`col-span-3 text-right font-mono-tabular font-medium ${
          better === 'B' ? 'text-emerald-700 dark:text-emerald-400' : ''
        }`}
      >
        {valB}
      </div>
    </div>
  );
}

