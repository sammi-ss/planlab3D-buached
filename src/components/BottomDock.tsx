import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  PlusSquare,
  RotateCcw,
  RotateCw,
  Tag,
} from 'lucide-react';
import type { CameraPreset, FlowType } from '../types/lab';

interface BottomDockProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  cameraPreset: CameraPreset;
  autoRotate: boolean;
  showLabels: boolean;
  activeFlows: Record<FlowType, boolean>;
  showCrossings: boolean;
  crossingsCount: number;
  catalogOpen: boolean;
  onSelectCamera: (preset: CameraPreset) => void;
  onToggleAutoRotate: () => void;
  onToggleLabels: () => void;
  onToggleFlow: (type: FlowType) => void;
  onToggleCrossings: () => void;
  onToggleCatalog: () => void;
  onResetCurrentScenario?: () => void;
}

export function BottomDock({
  collapsed,
  onToggleCollapse,
  cameraPreset,
  autoRotate,
  showLabels,
  activeFlows,
  showCrossings,
  crossingsCount,
  catalogOpen,
  onSelectCamera,
  onToggleAutoRotate,
  onToggleLabels,
  onToggleFlow,
  onToggleCrossings,
  onToggleCatalog,
  onResetCurrentScenario,
}: BottomDockProps) {

  return (
    <div
      className={`pointer-events-none fixed z-20 flex items-start transition-transform duration-200
        top-[72px] left-3 max-h-[calc(100vh-90px)] w-[260px] max-w-[90vw] flex-col
        ${collapsed ? '-translate-x-[calc(100%+16px)]' : 'translate-x-0'}
      `}
    >
      {/* Collapse / Expand Handle */}
      <button
        type="button"
        onClick={onToggleCollapse}
        aria-expanded={!collapsed}
        title="ซ่อนหรือแสดงแถบเครื่องมือด้านข้าง (ปุ่ม H)"
        className="pointer-events-auto absolute -right-9 top-2 inline-flex h-8 w-8 items-center justify-center rounded-r-lg border border-l-0 border-slate-200 bg-white text-slate-600 shadow-sm hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-teal-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-white"
      >
        {collapsed ? (
          <ChevronUp className="h-4 w-4 rotate-90" aria-hidden="true" />
        ) : (
          <ChevronDown className="h-4 w-4 rotate-90" aria-hidden="true" />
        )}
      </button>

      {/* Main Unified Control Dock (Vertical Sidebar) */}
      <div className="pointer-events-auto flex w-full flex-col gap-3 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/95 overflow-y-auto max-h-[calc(100vh-100px)] no-scrollbar">
        {/* Group 1: Camera Views */}
        <div className="flex flex-col gap-1.5" role="group" aria-label="มุมกล้อง">
          <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-1">
            มุมมองกล้อง
          </p>
          {(
            [
              ['iso', 'มุมเอียง'],
              ['top', 'มองจากบน'],
              ['front', 'ด้านหน้า'],
              ['side', 'ด้านข้าง'],
              ['center', 'กึ่งกลาง'],
            ] as [CameraPreset, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => onSelectCamera(id)}
              aria-pressed={cameraPreset === id && !autoRotate}
              className={`w-full h-8.5 rounded-lg px-3 text-xs font-medium text-left transition-colors flex items-center justify-between ${
                cameraPreset === id && !autoRotate
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                  : 'bg-slate-50 text-slate-700 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              <span>{label}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={onToggleAutoRotate}
            aria-pressed={autoRotate}
            className={`w-full h-8.5 rounded-lg px-3 text-xs font-medium text-left transition-colors flex items-center gap-2 ${
              autoRotate
                ? 'bg-teal-700 text-white dark:bg-teal-600'
                : 'bg-slate-50 text-slate-700 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
            }`}
          >
            <RotateCw className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>หมุนอัตโนมัติ</span>
          </button>
        </div>

        <div className="h-px w-full bg-slate-200 dark:bg-slate-800" aria-hidden="true" />

        {/* Group 2: Layout Actions */}
        <div className="flex flex-col gap-1.5" role="group" aria-label="เครื่องมือผัง">
          <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-1">
            จัดการผัง
          </p>
          <button
            type="button"
            onClick={onToggleCatalog}
            aria-pressed={catalogOpen}
            className={`w-full h-8.5 rounded-lg px-3 text-xs font-medium text-left transition-colors flex items-center gap-2 border ${
              catalogOpen
                ? 'border-teal-700 bg-teal-50 text-teal-800 dark:border-teal-500 dark:bg-teal-950/60 dark:text-teal-200'
                : 'border-slate-200 bg-white text-slate-700 hover:border-teal-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
            }`}
          >
            <PlusSquare className="h-3.5 w-3.5 shrink-0 text-teal-700 dark:text-teal-400" aria-hidden="true" />
            <span>เพิ่มครุภัณฑ์</span>
          </button>
          {onResetCurrentScenario && (
            <button
              type="button"
              onClick={onResetCurrentScenario}
              title="คืนค่าผังนี้เป็นค่าเริ่มต้น"
              className="w-full h-8.5 rounded-lg px-3 text-xs font-medium text-left transition-colors flex items-center gap-2 border border-slate-200 bg-white text-slate-700 hover:border-rose-400 hover:text-rose-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:text-rose-400"
            >
              <RotateCcw className="h-3.5 w-3.5 shrink-0 text-rose-500" aria-hidden="true" />
              <span>คืนค่าเดิม</span>
            </button>
          )}
        </div>

        <div className="h-px w-full bg-slate-200 dark:bg-slate-800" aria-hidden="true" />

        {/* Group 3: Flow & Overlays */}
        <div className="flex flex-col gap-1.5" role="group" aria-label="ชั้นข้อมูลเส้นทางและป้ายชื่อ">
          <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-1">
            แนวการไหลและป้าย
          </p>
          <button
            type="button"
            onClick={onToggleLabels}
            aria-pressed={showLabels}
            className={`w-full h-8.5 rounded-lg px-3 text-xs font-medium text-left transition-colors flex items-center gap-2 ${
              showLabels
                ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900'
                : 'bg-slate-50 text-slate-700 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
            }`}
          >
            <Tag className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>แสดงป้ายชื่อ</span>
          </button>
          <button
            type="button"
            onClick={() => onToggleFlow('specimen')}
            aria-pressed={activeFlows.specimen}
            className={`w-full h-8.5 rounded-lg px-3 text-xs font-medium text-left transition-colors flex items-center gap-2 ${
              activeFlows.specimen
                ? 'bg-teal-700 text-white dark:bg-teal-600'
                : 'bg-slate-50 text-slate-700 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
            }`}
          >
            {activeFlows.specimen ? (
              <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <EyeOff className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />
            )}
            <span className="truncate">แนวการไหล (Specimen)</span>
          </button>
          <button
            type="button"
            onClick={() => onToggleFlow('waste')}
            aria-pressed={activeFlows.waste}
            className={`w-full h-8.5 rounded-lg px-3 text-xs font-medium text-left transition-colors flex items-center gap-2 ${
              activeFlows.waste
                ? 'bg-[#D85A30] text-white'
                : 'bg-slate-50 text-slate-700 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
            }`}
          >
            {activeFlows.waste ? (
              <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <EyeOff className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />
            )}
            <span className="truncate">แนวการไหล (Waste)</span>
          </button>
          <button
            type="button"
            onClick={() => onToggleFlow('staff')}
            aria-pressed={activeFlows.staff}
            className={`w-full h-8.5 rounded-lg px-3 text-xs font-medium text-left transition-colors flex items-center gap-2 ${
              activeFlows.staff
                ? 'bg-violet-700 text-white dark:bg-violet-600'
                : 'bg-slate-50 text-slate-700 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
            }`}
          >
            {activeFlows.staff ? (
              <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <EyeOff className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />
            )}
            <span className="truncate">แนวการไหล (Staff)</span>
          </button>
        </div>
      </div>
    </div>
  );
}
