import { useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  BarChart3,
  Box,
  Camera,
  Cloud,
  CloudUpload,
  CopyPlus,
  Download,
  FileCode,
  Layers,
  Loader2,
  LogIn,
  LogOut,
  Moon,
  Redo2,
  RotateCcw,
  ShieldCheck,
  Sun,
  Upload,
} from 'lucide-react';
import { ENABLE_COMPLIANCE_ANALYSIS } from '../config/features';
import type { LabScenario } from '../types/lab';

interface TopBarProps {
  scenarios: LabScenario[];
  activeScenarioId: string;
  isDark: boolean;
  canUndo: boolean;
  canRedo: boolean;
  activeDrawerTab: 'inspector' | 'compliance' | 'compare' | 'catalog' | null;
  complianceSummary?: { passed: number; total: number };
  user: User | null;
  cloudSyncing: boolean;
  viewMode: '3d' | '2d';
  onToggleViewMode: (mode: '3d' | '2d') => void;
  onLogin: () => void;
  onLogout: () => void;
  onSaveToFirebase: () => void;
  onSelectScenario: (id: string) => void;
  onDuplicateScenario: () => void;
  onOpenDrawerTab: (tab: 'inspector' | 'compliance' | 'compare' | 'catalog' | null) => void;
  onToggleDark: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onExportJson: () => void;
  onImportJson: (file: File) => void;
  onExportPng: () => void;
  onExportSvg?: () => void;
  onResetCurrentScenario: () => void;
  onResetAll: () => void;
}

export function TopBar({
  scenarios,
  activeScenarioId,
  isDark,
  canUndo,
  canRedo,
  activeDrawerTab,
  complianceSummary,
  user,
  cloudSyncing,
  viewMode,
  onToggleViewMode,
  onLogin,
  onLogout,
  onSaveToFirebase,
  onSelectScenario,
  onDuplicateScenario,
  onOpenDrawerTab,
  onToggleDark,
  onUndo,
  onRedo,
  onExportJson,
  onImportJson,
  onExportPng,
  onExportSvg,
  onResetCurrentScenario,
  onResetAll,
}: TopBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <header className="relative z-20 flex h-14 w-full max-w-full shrink-0 items-center justify-between gap-1.5 sm:gap-3 border-b border-slate-200 bg-white px-2 sm:px-4 text-slate-900 overflow-hidden dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
      {/* Zone 1: Brand Title & 2D/3D Mode Switcher */}
      <div className="flex min-w-0 items-center gap-2 sm:gap-3 shrink-0">
        <span className="truncate text-sm sm:text-base font-semibold tracking-tight whitespace-nowrap">
          แผนผัง LAB
        </span>

        {/* 2D / 3D Switcher */}
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs dark:border-slate-700 dark:bg-slate-800 shrink-0">
          <button
            type="button"
            onClick={() => onToggleViewMode('3d')}
            aria-pressed={viewMode === '3d'}
            className={`flex items-center gap-1.5 rounded-md px-2 sm:px-2.5 py-1 text-xs font-semibold transition-colors ${
              viewMode === '3d'
                ? 'bg-white text-teal-700 shadow-xs dark:bg-slate-700 dark:text-teal-300'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <Box className="h-3.5 w-3.5" aria-hidden="true" />
            <span>3D</span>
          </button>
          <button
            type="button"
            onClick={() => onToggleViewMode('2d')}
            aria-pressed={viewMode === '2d'}
            className={`flex items-center gap-1.5 rounded-md px-2 sm:px-2.5 py-1 text-xs font-semibold transition-colors ${
              viewMode === '2d'
                ? 'bg-white text-teal-700 shadow-xs dark:bg-slate-700 dark:text-teal-300'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <Layers className="h-3.5 w-3.5" aria-hidden="true" />
            <span>2D แปลน</span>
          </button>
        </div>
      </div>

      {/* Zone 2: Scenario Switcher & Workspace Views */}
      <div className="flex items-center gap-1 sm:gap-2 min-w-0 overflow-x-auto no-scrollbar">
        {scenarios.length > 1 && (
          <>
            <label htmlFor="scenario-select" className="sr-only">
              เลือกทางเลือกผัง
            </label>
            <select
              id="scenario-select"
              value={activeScenarioId}
              onChange={(e) => onSelectScenario(e.target.value)}
              className="h-9 max-w-[115px] sm:max-w-[200px] md:max-w-[240px] rounded-lg border border-slate-200 bg-slate-50 px-2 sm:px-2.5 text-xs sm:text-sm font-medium text-slate-800 focus-visible:outline-2 focus-visible:outline-teal-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              {scenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </>
        )}

        <button
          type="button"
          onClick={onDuplicateScenario}
          disabled={!user}
          title={
            user
              ? 'คัดลอกผังปัจจุบันเป็นทางเลือกใหม่เพื่อทดลองแก้ไข'
              : 'กรุณาเข้าสู่ระบบ (Login) ก่อนจึงจะสร้างสำเนาผังได้'
          }
          className="hidden sm:inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 sm:px-3 text-xs sm:text-sm font-medium text-slate-700 transition-colors hover:border-teal-600 hover:text-teal-700 focus-visible:outline-2 focus-visible:outline-teal-600 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-slate-200 disabled:hover:text-slate-700 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-teal-400 dark:hover:text-teal-300 dark:disabled:hover:border-slate-700 dark:disabled:hover:text-slate-200"
        >
          <CopyPlus className="h-4 w-4" aria-hidden="true" />
          <span className="hidden md:inline">สร้างสำเนาผัง</span>
        </button>

        {ENABLE_COMPLIANCE_ANALYSIS && (
          <>
            <button
              type="button"
              onClick={() =>
                onOpenDrawerTab(activeDrawerTab === 'compliance' ? null : 'compliance')
              }
              aria-pressed={activeDrawerTab === 'compliance'}
              title="ตรวจสอบเกณฑ์มาตรฐาน IC และ LA สภาเทคนิคการแพทย์"
              className={`inline-flex h-9 shrink-0 items-center gap-1 sm:gap-1.5 rounded-lg border px-2 sm:px-3 text-xs sm:text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-teal-600 whitespace-nowrap ${
                activeDrawerTab === 'compliance'
                  ? 'border-teal-700 bg-teal-700 text-white dark:border-teal-500 dark:bg-teal-600'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-teal-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
              }`}
            >
              <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="hidden sm:inline">มาตรฐาน IC/LA</span>
              <span className="sm:hidden">IC/LA</span>
              {complianceSummary && (
                <span className="font-mono-tabular text-xs opacity-85">
                  ({complianceSummary.passed}/{complianceSummary.total})
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() =>
                onOpenDrawerTab(activeDrawerTab === 'compare' ? null : 'compare')
              }
              aria-pressed={activeDrawerTab === 'compare'}
              title="เปรียบเทียบทางเลือกสำหรับผู้บริหาร"
              className={`inline-flex h-9 shrink-0 items-center gap-1 sm:gap-1.5 rounded-lg border px-2 sm:px-3 text-xs sm:text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-teal-600 whitespace-nowrap ${
                activeDrawerTab === 'compare'
                  ? 'border-teal-700 bg-teal-700 text-white dark:border-teal-500 dark:bg-teal-600'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-teal-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
              }`}
            >
              <BarChart3 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="hidden md:inline">เทียบทางเลือกผู้บริหาร</span>
              <span className="hidden sm:inline md:hidden">เปรียบเทียบ</span>
            </button>
          </>
        )}
      </div>

      {/* Zone 3: Undo/Redo, Theme & Primary Export */}
      <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          title="ย้อนกลับ (Ctrl+Z)"
          aria-label="ย้อนกลับ"
          className="hidden sm:inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition-colors hover:border-slate-300 disabled:opacity-35 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        >
          <UndoIcon />
        </button>
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          title="ทำซ้ำ (Ctrl+Y)"
          aria-label="ทำซ้ำ"
          className="hidden sm:inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition-colors hover:border-slate-300 disabled:opacity-35 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        >
          <Redo2 className="h-4 w-4" aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={onResetCurrentScenario}
          title="คืนค่าผังนี้เป็นค่าเริ่มต้น (Reset to Default)"
          className="inline-flex h-9 shrink-0 items-center gap-1 sm:gap-1.5 rounded-lg border border-slate-200 bg-white px-2 sm:px-2.5 text-xs font-medium text-slate-700 transition-colors hover:border-rose-400 hover:text-rose-600 focus-visible:outline-2 focus-visible:outline-rose-500 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:text-rose-400"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">คืนค่าเดิม</span>
          <span className="sm:hidden">คืนค่า</span>
        </button>

        <button
          type="button"
          onClick={onToggleDark}
          title={isDark ? 'สลับเป็นโหมดสว่าง' : 'สลับเป็นโหมดมืด'}
          aria-label={isDark ? 'สลับเป็นโหมดสว่าง' : 'สลับเป็นโหมดมืด'}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition-colors hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        >
          {isDark ? (
            <Sun className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Moon className="h-4 w-4" aria-hidden="true" />
          )}
        </button>

        {/* Firebase User Cloud Button */}
        {user ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => setUserMenuOpen((v) => !v)}
              aria-expanded={userMenuOpen}
              title={`เข้าสู่ระบบแล้ว: ${user.email}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-teal-600/30 bg-teal-50 px-2 py-1 text-xs font-medium text-teal-900 transition-colors hover:bg-teal-100 dark:border-teal-500/40 dark:bg-teal-950/60 dark:text-teal-200"
            >
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName ?? 'User'}
                  className="h-5 w-5 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-700 text-[10px] font-bold text-white">
                  {(user.displayName ?? user.email ?? 'U')[0].toUpperCase()}
                </div>
              )}
              {cloudSyncing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-teal-600 dark:text-teal-400" />
              ) : (
                <Cloud className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
              )}
              <span className="hidden md:inline max-w-[90px] truncate text-xs">
                {user.displayName?.split(' ')[0] ?? 'Cloud'}
              </span>
            </button>

            {userMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-20"
                  onClick={() => setUserMenuOpen(false)}
                  aria-hidden="true"
                />
                <div className="absolute right-0 top-11 z-30 w-60 rounded-xl border border-slate-200 bg-white p-2 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-800">
                  <div className="border-b border-slate-100 pb-2 mb-1.5 px-2 dark:border-slate-700">
                    <p className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                      {user.displayName ?? 'ผู้ใช้งาน'}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {user.email}
                    </p>
                    <div className="mt-1 flex items-center gap-1 text-[11px] text-teal-700 dark:text-teal-400">
                      <Cloud className="h-3 w-3" />
                      <span>ซิงก์ฐานข้อมูล Firebase แล้ว</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setUserMenuOpen(false);
                      onSaveToFirebase();
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    <CloudUpload className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
                    <span>บันทึกผังปัจจุบันลง Firebase</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setUserMenuOpen(false);
                      onLogout();
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    <span>ออกจากระบบ</span>
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={onLogin}
            title="เข้าสู่ระบบด้วย Google เพื่อบันทึกและซิงก์ข้อมูล Firebase"
            className="inline-flex h-9 shrink-0 items-center gap-1 sm:gap-1.5 rounded-lg border border-teal-600/30 bg-teal-50 px-2 sm:px-2.5 text-xs font-medium text-teal-800 transition-colors hover:bg-teal-100 dark:border-teal-500/30 dark:bg-teal-950/60 dark:text-teal-200"
          >
            <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">เข้าสู่ระบบ</span>
            <span className="sm:hidden">Login</span>
          </button>
        )}

        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            className="inline-flex h-9 shrink-0 items-center gap-1 sm:gap-1.5 rounded-lg bg-teal-700 px-2.5 sm:px-3.5 text-xs sm:text-sm font-medium text-white transition-colors hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-teal-500 whitespace-nowrap dark:bg-teal-600 dark:hover:bg-teal-500"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">บันทึก / ส่งออก</span>
            <span className="sm:hidden">ส่งออก</span>
          </button>

          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-20"
                onClick={() => setMenuOpen(false)}
                aria-hidden="true"
              />
              <div className="absolute right-0 top-11 z-30 w-60 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg dark:border-slate-700 dark:bg-slate-800">
                {/* Firebase Cloud Save in Menu */}
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onSaveToFirebase();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg bg-teal-50 px-3 py-2 text-left text-sm font-medium text-teal-800 hover:bg-teal-100 dark:bg-teal-950/60 dark:text-teal-200 dark:hover:bg-teal-900/60"
                >
                  <CloudUpload className="h-4 w-4 text-teal-600 dark:text-teal-400" aria-hidden="true" />
                  <span>{user ? 'บันทึกลง Firebase (Cloud)' : 'เข้าสู่ระบบเพื่อบันทึก Firebase'}</span>
                </button>
                <div className="my-1 border-t border-slate-200 dark:border-slate-700" />

                {/* Mobile-only actions in menu */}
                <button
                  type="button"
                  disabled={!user}
                  onClick={() => {
                    setMenuOpen(false);
                    onDuplicateScenario();
                  }}
                  className="flex sm:hidden w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-45 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <CopyPlus className="h-4 w-4 text-teal-600 dark:text-teal-400" aria-hidden="true" />
                  <span>{user ? 'สร้างสำเนาผังใหม่' : 'สร้างสำเนาผังใหม่ (ต้อง Login)'}</span>
                </button>
                {canUndo && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onUndo();
                    }}
                    className="flex sm:hidden w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    <UndoIcon />
                    <span>ย้อนกลับ (Undo)</span>
                  </button>
                )}
                {canRedo && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onRedo();
                    }}
                    className="flex sm:hidden w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    <Redo2 className="h-4 w-4" aria-hidden="true" />
                    <span>ทำซ้ำ (Redo)</span>
                  </button>
                )}
                <div className="my-1 border-t border-slate-200 sm:hidden dark:border-slate-700" />
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onExportPng();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <Camera className="h-4 w-4 text-teal-600 dark:text-teal-400" aria-hidden="true" />
                  <span>บันทึกภาพโมเดล (.PNG)</span>
                </button>
                {onExportSvg && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onExportSvg();
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    <FileCode className="h-4 w-4 text-teal-600 dark:text-teal-400" aria-hidden="true" />
                    <span>ส่งออกแปลน 2 มิติ (.SVG)</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onExportJson();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <Download className="h-4 w-4 text-teal-600 dark:text-teal-400" aria-hidden="true" />
                  <span>ส่งออกข้อมูลผัง (.JSON)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    fileInputRef.current?.click();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <Upload className="h-4 w-4 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                  <span>นำเข้าไฟล์ผัง (.JSON)</span>
                </button>
                <div className="my-1 border-t border-slate-200 dark:border-slate-700" />
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onResetAll();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/50"
                >
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  <span>รีเซ็ตกลับผังตั้งต้น</span>
                </button>
              </div>
            </>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onImportJson(f);
            e.target.value = '';
          }}
        />
      </div>
    </header>
  );
}

function UndoIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 7v6h6" />
      <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
    </svg>
  );
}
