import { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Move,
  PlusSquare,
  RotateCcw,
  RotateCw,
  Tag,
} from 'lucide-react';
import type { CameraPreset, EditorTool, FlowType } from '../types/lab';

interface BottomDockProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  cameraPreset: CameraPreset;
  autoRotate: boolean;
  tool: EditorTool;
  showLabels: boolean;
  activeFlows: Record<FlowType, boolean>;
  showCrossings: boolean;
  crossingsCount: number;
  catalogOpen: boolean;
  onSelectCamera: (preset: CameraPreset) => void;
  onToggleAutoRotate: () => void;
  onSelectTool: (tool: EditorTool) => void;
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
  tool,
  showLabels,
  activeFlows,
  showCrossings,
  crossingsCount,
  catalogOpen,
  onSelectCamera,
  onToggleAutoRotate,
  onSelectTool,
  onToggleLabels,
  onToggleFlow,
  onToggleCrossings,
  onToggleCatalog,
  onResetCurrentScenario,
}: BottomDockProps) {
  const [mobileCategory, setMobileCategory] = useState<'camera' | 'tools' | 'flows'>('camera');

  return (
    <div
      className={`pointer-events-none fixed z-20 flex flex-col items-center transition-transform duration-200
        bottom-2 inset-x-2 max-w-[calc(100vw-16px)]
        sm:bottom-4 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-[min(960px,calc(100vw-32px))] sm:max-w-4xl
        ${collapsed ? 'translate-y-[calc(100%-28px)]' : 'translate-y-0'}
      `}
    >
      {/* Collapse / Expand Handle */}
      <button
        type="button"
        onClick={onToggleCollapse}
        aria-expanded={!collapsed}
        title="ซ่อนหรือแสดงแถบเครื่องมือ (ปุ่ม H)"
        className="pointer-events-auto mb-1 inline-flex h-7 sm:h-8 items-center gap-1.5 rounded-t-lg border border-b-0 border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 shadow-sm hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-teal-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-white"
      >
        {collapsed ? (
          <>
            <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
            <span>แสดงแถบควบคุม</span>
          </>
        ) : (
          <>
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            <span>ซ่อนแถบควบคุม (H)</span>
          </>
        )}
      </button>

      {/* Main Unified Control Dock */}
      <div className="pointer-events-auto flex w-full flex-col md:flex-row md:flex-wrap items-center justify-between gap-1.5 sm:gap-2 rounded-xl border border-slate-200 bg-white p-1.5 sm:p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900 overflow-hidden">
        {/* Mobile Category Switcher (< md) */}
        <div className="flex md:hidden w-full items-center justify-between border-b border-slate-100 pb-1.5 dark:border-slate-800">
          <div className="flex items-center gap-1 w-full justify-around">
            <button
              type="button"
              onClick={() => setMobileCategory('camera')}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                mobileCategory === 'camera'
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
              }`}
            >
              มุมกล้อง
            </button>
            <button
              type="button"
              onClick={() => setMobileCategory('tools')}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                mobileCategory === 'tools'
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
              }`}
            >
              เครื่องมือผัง
            </button>
            <button
              type="button"
              onClick={() => setMobileCategory('flows')}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                mobileCategory === 'flows'
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
              }`}
            >
              เส้นทาง Flow {crossingsCount > 0 ? `(${crossingsCount})` : ''}
            </button>
          </div>
        </div>

        {/* Group 1: Camera Views */}
        <div
          className={`items-center gap-1 overflow-x-auto no-scrollbar py-0.5 ${
            mobileCategory === 'camera' ? 'flex w-full md:w-auto justify-center sm:justify-start' : 'hidden md:flex'
          }`}
          role="group"
          aria-label="มุมกล้อง"
        >
          {(
            [
              ['iso', 'มุมเอียง'],
              ['top', 'มองจากบน'],
              ['frontDoor', 'ประตูหน้า'],
              ['backDoor', 'ประตูหลัง'],
            ] as [CameraPreset, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => onSelectCamera(id)}
              aria-pressed={cameraPreset === id && !autoRotate}
              className={`h-8 sm:h-9 rounded-lg px-2 sm:px-2.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                cameraPreset === id && !autoRotate
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={onToggleAutoRotate}
            aria-pressed={autoRotate}
            className={`inline-flex h-8 sm:h-9 items-center gap-1 rounded-lg px-2 sm:px-2.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              autoRotate
                ? 'bg-teal-700 text-white dark:bg-teal-600'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
            }`}
          >
            <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden xs:inline">หมุนอัตโนมัติ</span>
            <span className="xs:hidden">หมุน</span>
          </button>
        </div>

        <div className="hidden h-6 w-px bg-slate-200 md:block dark:bg-slate-700" aria-hidden="true" />

        {/* Group 2: Interaction Tools */}
        <div
          className={`items-center gap-1 overflow-x-auto no-scrollbar py-0.5 ${
            mobileCategory === 'tools' ? 'flex w-full md:w-auto justify-center sm:justify-start' : 'hidden md:flex'
          }`}
          role="group"
          aria-label="เครื่องมือผัง"
        >
          <button
            type="button"
            onClick={() => onSelectTool('inspect')}
            aria-pressed={tool === 'inspect'}
            className={`inline-flex h-8 sm:h-9 items-center gap-1.5 rounded-lg px-2 sm:px-2.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              tool === 'inspect'
                ? 'bg-teal-700 text-white dark:bg-teal-600'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
            }`}
          >
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            <span>สำรวจ</span>
          </button>
          <button
            type="button"
            onClick={() => onSelectTool('move')}
            aria-pressed={tool === 'move'}
            className={`inline-flex h-8 sm:h-9 items-center gap-1.5 rounded-lg px-2 sm:px-2.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              tool === 'move'
                ? 'bg-teal-700 text-white dark:bg-teal-600'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
            }`}
          >
            <Move className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">ย้าย / จัดวาง</span>
            <span className="sm:hidden">ย้ายผัง</span>
          </button>
          <button
            type="button"
            onClick={onToggleCatalog}
            aria-pressed={catalogOpen}
            className={`inline-flex h-8 sm:h-9 items-center gap-1.5 rounded-lg border px-2 sm:px-2.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              catalogOpen
                ? 'border-teal-700 bg-teal-50 text-teal-800 dark:border-teal-500 dark:bg-teal-950/60 dark:text-teal-200'
                : 'border-slate-200 bg-white text-slate-700 hover:border-teal-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
            }`}
          >
            <PlusSquare className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">เพิ่มครุภัณฑ์</span>
            <span className="sm:hidden">เพิ่มของ</span>
          </button>
          {onResetCurrentScenario && (
            <button
              type="button"
              onClick={onResetCurrentScenario}
              title="คืนค่าผังนี้เป็นค่าเริ่มต้น (Reset to Default)"
              className="inline-flex h-8 sm:h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 sm:px-2.5 text-xs font-medium text-slate-700 transition-colors hover:border-rose-400 hover:text-rose-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:text-rose-400 whitespace-nowrap shrink-0"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">คืนค่าเดิม</span>
              <span className="sm:hidden">คืนค่า</span>
            </button>
          )}
        </div>

        <div className="hidden h-6 w-px bg-slate-200 md:block dark:bg-slate-700" aria-hidden="true" />

        {/* Group 3: Flow & IC Overlays */}
        <div
          className={`items-center gap-1 overflow-x-auto no-scrollbar py-0.5 ${
            mobileCategory === 'flows' ? 'flex w-full md:w-auto justify-start sm:justify-start px-0.5' : 'hidden md:flex'
          }`}
          role="group"
          aria-label="ชั้นข้อมูลเส้นทางและป้ายชื่อ"
        >
          <button
            type="button"
            onClick={onToggleLabels}
            aria-pressed={showLabels}
            className={`inline-flex h-8 sm:h-9 items-center gap-1 rounded-lg px-2 sm:px-2.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              showLabels
                ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'
            }`}
          >
            <Tag className="h-3.5 w-3.5" aria-hidden="true" />
            <span>ป้ายชื่อ</span>
          </button>
          <button
            type="button"
            onClick={() => onToggleFlow('specimen')}
            aria-pressed={activeFlows.specimen}
            title={activeFlows.specimen ? 'ซ่อนเส้นทาง Specimen Flow' : 'แสดงเส้นทาง Specimen Flow'}
            className={`inline-flex h-8 sm:h-9 items-center gap-1.5 rounded-lg px-2 sm:px-2.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              activeFlows.specimen
                ? 'bg-teal-700 text-white dark:bg-teal-600'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            {activeFlows.specimen ? (
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <EyeOff className="h-3.5 w-3.5 opacity-70" aria-hidden="true" />
            )}
            <span className="inline-block h-0.5 w-3.5 bg-teal-300" aria-hidden="true" />
            <span>Specimen</span>
          </button>
          <button
            type="button"
            onClick={() => onToggleFlow('waste')}
            aria-pressed={activeFlows.waste}
            title={activeFlows.waste ? 'ซ่อนเส้นทาง Infectious Waste Flow' : 'แสดงเส้นทาง Infectious Waste Flow'}
            className={`inline-flex h-8 sm:h-9 items-center gap-1.5 rounded-lg px-2 sm:px-2.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              activeFlows.waste
                ? 'bg-[#D85A30] text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            {activeFlows.waste ? (
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <EyeOff className="h-3.5 w-3.5 opacity-70" aria-hidden="true" />
            )}
            <span className="inline-block h-0 w-3.5 border-t-2 border-dashed border-orange-200" aria-hidden="true" />
            <span className="hidden sm:inline">Infectious Waste</span>
            <span className="sm:hidden">ขยะติดเชื้อ</span>
          </button>
          <button
            type="button"
            onClick={() => onToggleFlow('staff')}
            aria-pressed={activeFlows.staff}
            title={activeFlows.staff ? 'ซ่อนเส้นทางเดินเจ้าหน้าที่' : 'แสดงเส้นทางเดินเจ้าหน้าที่'}
            className={`inline-flex h-8 sm:h-9 items-center gap-1.5 rounded-lg px-2 sm:px-2.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              activeFlows.staff
                ? 'bg-violet-700 text-white dark:bg-violet-600'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            {activeFlows.staff ? (
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <EyeOff className="h-3.5 w-3.5 opacity-70" aria-hidden="true" />
            )}
            <span className="h-2 w-2 rounded-sm bg-violet-300" aria-hidden="true" />
            <span>เจ้าหน้าที่</span>
          </button>
          <button
            type="button"
            onClick={onToggleCrossings}
            aria-pressed={showCrossings}
            title={showCrossings ? 'ซ่อนจุดตัดเสี่ยง IC' : 'แสดงจุดตัดเสี่ยง IC'}
            className={`inline-flex h-8 sm:h-9 items-center gap-1 rounded-lg px-2 sm:px-2.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              showCrossings
                ? 'bg-rose-700 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            {showCrossings ? (
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <EyeOff className="h-3.5 w-3.5 opacity-70" aria-hidden="true" />
            )}
            <span className="hidden sm:inline">จุดตัด IC ({crossingsCount})</span>
            <span className="sm:hidden">จุดตัด ({crossingsCount})</span>
          </button>
        </div>
      </div>
    </div>
  );
}
