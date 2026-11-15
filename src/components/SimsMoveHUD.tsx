import { useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  Compass,
  CornerDownLeft,
  Minimize2,
  Maximize2,
  RotateCw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type { LabEquipment, LabScenario } from '../types/lab';

interface SimsMoveHUDProps {
  item: LabEquipment;
  scenario: LabScenario;
  onNudge: (dx: number, dz: number) => void;
  onRotate90: () => void;
  onResetItemToPreset: () => void;
  hasPresetPosition: boolean;
  onDelete: () => void;
  onClose: () => void;
}

export function SimsMoveHUD({
  item,
  scenario,
  onNudge,
  onRotate90,
  onResetItemToPreset,
  hasPresetPosition,
  onDelete,
  onClose,
}: SimsMoveHUDProps) {
  const [step, setStep] = useState<0.1 | 0.25 | 0.5>(0.25);
  const [minimized, setMinimized] = useState(false);

  const zone = scenario.zones.find((z) => z.id === item.zoneId);

  return (
    <div
      role="region"
      aria-label="แผงควบคุมการจัดวางสไตล์เดอะซิมส์"
      className="pointer-events-auto fixed z-30 bottom-16 right-3 sm:bottom-20 sm:right-5 w-[min(360px,calc(100vw-24px))] transition-all duration-200 animate-in fade-in slide-in-from-bottom-3"
    >
      <div className="overflow-hidden rounded-2xl border border-teal-500/40 bg-white/95 p-2.5 sm:p-3 shadow-xl backdrop-blur-md dark:border-teal-500/30 dark:bg-slate-900/95 text-slate-800 dark:text-slate-100">
        {/* Header Bar */}
        <div className="flex items-center justify-between gap-1.5 border-b border-slate-100 pb-2 dark:border-slate-800">
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-teal-600 text-white shadow-xs">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h4 className="truncate text-xs font-bold tracking-tight text-slate-900 dark:text-white">
                {item.labelTh}
              </h4>
              <p className="font-mono-tabular text-[10px] text-slate-500 dark:text-slate-400">
                X:{item.x.toFixed(1)}m · Z:{item.z.toFixed(1)}m · {item.rotationDeg}°
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setMinimized((v) => !v)}
              className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              title={minimized ? 'ขยาย' : 'ย่อ'}
              aria-label={minimized ? 'ขยาย' : 'ย่อ'}
            >
              {minimized ? <Maximize2 className="h-3.5 w-3.5" /> : <Minimize2 className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              title="ปิด (Esc)"
              aria-label="ปิด"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {!minimized && (
          <div className="mt-2.5 space-y-2">
            {/* Control Center: Compact D-Pad & Action Buttons */}
            <div className="flex items-center justify-between gap-2.5">
              {/* Compact 4-Way D-Pad */}
              <div className="flex items-center gap-2">
                <div className="grid grid-cols-3 gap-1 w-[96px] h-[96px] shrink-0">
                  <div />
                  <button
                    type="button"
                    onClick={() => onNudge(0, -step)}
                    title="เลื่อนขึ้น (-Z)"
                    className="flex items-center justify-center rounded-xl bg-slate-100 font-bold text-slate-700 active:scale-95 hover:bg-teal-100 hover:text-teal-900 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-teal-950 dark:hover:text-teal-200 shadow-xs"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <div />

                  <button
                    type="button"
                    onClick={() => onNudge(-step, 0)}
                    title="เลื่อนซ้าย (-X)"
                    className="flex items-center justify-center rounded-xl bg-slate-100 font-bold text-slate-700 active:scale-95 hover:bg-teal-100 hover:text-teal-900 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-teal-950 dark:hover:text-teal-200 shadow-xs"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <div className="flex items-center justify-center rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300">
                    <Compass className="h-3.5 w-3.5" />
                  </div>
                  <button
                    type="button"
                    onClick={() => onNudge(step, 0)}
                    title="เลื่อนขวา (+X)"
                    className="flex items-center justify-center rounded-xl bg-slate-100 font-bold text-slate-700 active:scale-95 hover:bg-teal-100 hover:text-teal-900 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-teal-950 dark:hover:text-teal-200 shadow-xs"
                  >
                    <ArrowRight className="h-4 w-4" />
                  </button>

                  <div />
                  <button
                    type="button"
                    onClick={() => onNudge(0, step)}
                    title="เลื่อนลง (+Z)"
                    className="flex items-center justify-center rounded-xl bg-slate-100 font-bold text-slate-700 active:scale-95 hover:bg-teal-100 hover:text-teal-900 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-teal-950 dark:hover:text-teal-200 shadow-xs"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <div />
                </div>

                {/* Step Size Selector */}
                <div className="flex flex-col gap-1 text-[10px]">
                  <span className="text-slate-500 font-medium dark:text-slate-400">ก้าว:</span>
                  {([0.1, 0.25, 0.5] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStep(s)}
                      className={`rounded px-1.5 py-0.5 font-mono-tabular font-medium transition-colors ${
                        step === s
                          ? 'bg-teal-700 text-white dark:bg-teal-600'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'
                      }`}
                    >
                      {s}m
                    </button>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col gap-1.5 flex-1">
                <button
                  type="button"
                  onClick={onRotate90}
                  className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-teal-600/30 bg-teal-50 px-2.5 text-xs font-semibold text-teal-800 hover:bg-teal-100 dark:border-teal-500/30 dark:bg-teal-950/60 dark:text-teal-200"
                >
                  <RotateCw className="h-3.5 w-3.5" />
                  <span>หมุน 90° (R)</span>
                </button>

                {hasPresetPosition && (
                  <button
                    type="button"
                    onClick={onResetItemToPreset}
                    className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:border-teal-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <CornerDownLeft className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
                    <span>คืนค่าเดิม</span>
                  </button>
                )}

                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={onDelete}
                    className="inline-flex flex-1 h-7 items-center justify-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 text-[11px] font-medium text-rose-700 hover:bg-rose-100 dark:border-rose-900/50 dark:bg-rose-950/60 dark:text-rose-300"
                  >
                    <Trash2 className="h-3 w-3" />
                    <span>ลบ</span>
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="inline-flex flex-1 h-7 items-center justify-center gap-1 rounded-lg bg-slate-900 px-2 text-[11px] font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
                  >
                    <Check className="h-3 w-3" />
                    <span>เสร็จ</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Tip */}
            <p className="text-[10px] text-slate-500 dark:text-slate-400 text-center">
              💡 ลากเพื่อจัดตำแหน่ง (กด R หมุน, Alt ปิดสแน็ป) หรือกดลูกศรปรับตำแหน่ง
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
