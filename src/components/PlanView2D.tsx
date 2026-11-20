import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Maximize2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type {
  EditorTool,
  LabEquipment,
  LabScenario,
} from '../types/lab';
import {
  clampToRoom,
  findOverlaps,
  getFootprint,
  getItemAABB,
  snapToGrid,
  type SpatialBoxInput,
} from '../utils/placement';
import type { SelectionState } from './LabViewport3D';

export interface PlanView2DHandle {
  exportSvg: () => void;
  fitToScreen: () => void;
}

export interface PlanView2DProps {
  scenario: LabScenario;
  isDark: boolean;
  tool: EditorTool;
  selection: SelectionState | null;
  onSelect: (sel: SelectionState | null) => void;
  onLiveDragCoords: (info: { label: string } | null) => void;
  onCommitMove: (
    kind: 'equipment' | 'zone' | 'opening',
    id: string,
    x: number,
    z: number,
    rotationDeg?: number,
  ) => void;
  onNotice?: (msg: string) => void;
  showLabels?: boolean;
}

interface DraggingState {
  item: LabEquipment;
  initialX: number;
  initialZ: number;
  initialRotDeg: number;
  currentX: number;
  currentZ: number;
  currentRotDeg: number;
  offsetX: number;
  offsetZ: number;
  isColliding: boolean;
  childMachines: {
    id: string;
    initialX: number;
    initialZ: number;
  }[];
}

interface ScreenRect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface ResolvedLabel2D {
  key: string;
  kind: 'zone' | 'equipment';
  text: string;
  sx: number;
  sy: number;
  pillW: number;
  pillH: number;
  fontSize: number;
  accentColor?: string;
  isHighlighted?: boolean;
}

const THAI_COMBINING_MARKS_RE = /[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/g;

function countSpacingChars(text: string): number {
  return text.replace(THAI_COMBINING_MARKS_RE, '').length;
}

function estimateLabelWidthPx(text: string, fontSizePx: number): number {
  return countSpacingChars(text) * fontSizePx * 0.62 + 10;
}

function fitLabelText(text: string, fontSizePx: number, maxWidthPx: number): string {
  const clean = text.trim();
  if (!clean) return '';
  if (estimateLabelWidthPx(clean, fontSizePx) <= maxWidthPx) return clean;
  const chars = Array.from(clean);
  let end = chars.length;
  while (end > 3) {
    end -= 1;
    while (end > 3 && /[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/.test(chars[end - 1])) {
      end -= 1;
    }
    const candidate = `${chars.slice(0, end).join('').trimEnd()}…`;
    if (estimateLabelWidthPx(candidate, fontSizePx) <= maxWidthPx) {
      return candidate;
    }
  }
  return '';
}

function rectsOverlap(a: ScreenRect, b: ScreenRect, pad = 3): boolean {
  return !(
    a.maxX + pad <= b.minX ||
    a.minX - pad >= b.maxX ||
    a.maxY + pad <= b.minY ||
    a.minY - pad >= b.maxY
  );
}

function rectOverlapArea(a: ScreenRect, b: ScreenRect): number {
  const ox = Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX));
  const oy = Math.max(0, Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY));
  return ox * oy;
}

export const PlanView2D = React.forwardRef<PlanView2DHandle, PlanView2DProps>(
  function PlanView2D(
    {
      scenario,
      isDark,
      selection,
      onSelect,
      onLiveDragCoords,
      onCommitMove,
      onNotice,
      showLabels = true,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const svgRef = useRef<SVGSVGElement | null>(null);
    const hoverTooltipRef = useRef<HTMLDivElement | null>(null);
    const hoverTitleRef = useRef<HTMLDivElement | null>(null);
    const hoverHintRef = useRef<HTMLDivElement | null>(null);

    // Viewport transform state: pan (in pixels from top-left) and zoom (pixels per meter)
    const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const [zoom, setZoom] = useState<number>(36);
    const panRef = useRef<{ x: number; y: number }>(pan);
    const zoomRef = useRef<number>(zoom);
    panRef.current = pan;
    zoomRef.current = zoom;

    const [containerSize, setContainerSize] = useState<{ w: number; h: number }>({
      w: 800,
      h: 600,
    });
    const [isPanning, setIsPanning] = useState(false);
    const [hoveredEquipId, setHoveredEquipId] = useState<string | null>(null);

    // Dragging state
    const [dragging, setDragging] = useState<DraggingState | null>(null);
    const dragRef = useRef<DraggingState | null>(null);
    dragRef.current = dragging;

    // Track pointer movement for 5px drag threshold
    const pointerDownRef = useRef<{
      startX: number;
      startY: number;
      candidateItem: LabEquipment | null;
      isPan: boolean;
      initialPan: { x: number; y: number };
      pointerId: number;
      hasMovedPastThreshold: boolean;
    } | null>(null);

    // Touch gesture tracking for pinch zoom
    const touchStartRef = useRef<{
      initialDist: number;
      initialZoom: number;
      centerWorldX: number;
      centerWorldZ: number;
    } | null>(null);

    const minZoom = 12;
    const maxZoom = 130;

    const applyTransform = useCallback((nextZoom: number, nextPan: { x: number; y: number }) => {
      zoomRef.current = nextZoom;
      panRef.current = nextPan;
      setZoom(nextZoom);
      setPan(nextPan);
    }, []);

    // Center and fit scenario in container
    const fitToScreen = useCallback(() => {
      const container = containerRef.current;
      if (!container) return;
      const w = container.clientWidth || 800;
      const h = container.clientHeight || 600;
      setContainerSize({ w, h });

      const padding = Math.min(64, Math.max(20, Math.round(Math.min(w, h) * 0.08)));
      const fitScaleW = (w - padding * 2) / Math.max(1, scenario.labWidth);
      const fitScaleH = (h - padding * 2) / Math.max(1, scenario.labDepth);
      const nextZoom = Math.min(Math.max(Math.min(fitScaleW, fitScaleH), minZoom), maxZoom);

      applyTransform(nextZoom, { x: w / 2, y: h / 2 });
    }, [scenario.labWidth, scenario.labDepth, minZoom, maxZoom, applyTransform]);

    // Initial fit on mount and scenario dimensions change
    useEffect(() => {
      fitToScreen();
    }, [fitToScreen]);

    // Resize observer
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;
      const ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          if (width > 0 && height > 0) {
            setContainerSize({ w: width, h: height });
          }
        }
      });
      ro.observe(container);
      return () => ro.disconnect();
    }, []);

    // Export SVG
    const exportSvg = useCallback(() => {
      const svg = svgRef.current;
      if (!svg) return;
      const serializer = new XMLSerializer();
      let source = serializer.serializeToString(svg);
      if (!source.match(/^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)) {
        source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
      }
      const svgHeader = '<?xml version="1.0" standalone="no"?>\r\n';
      const blob = new Blob([svgHeader + source], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `plan-2d-${scenario.id}-${new Date().toISOString().slice(0, 10)}.svg`;
      a.click();
      URL.revokeObjectURL(url);
      onNotice?.('ส่งออกแปลน 2 มิติ (.SVG) เรียบร้อยแล้ว');
    }, [scenario.id, onNotice]);

    useImperativeHandle(ref, () => ({
      exportSvg,
      fitToScreen,
    }));

    // Zoom centered at viewport-local coordinates (pixels from top-left of SVG)
    const zoomAtLocalPoint = useCallback(
      (localX: number, localY: number, factor: number) => {
        const prevZoom = zoomRef.current;
        const prevPan = panRef.current;
        const nextZoom = Math.min(Math.max(prevZoom * factor, minZoom), maxZoom);
        if (nextZoom === prevZoom) return;

        // Keep world point under anchor invariant
        const worldX = (localX - prevPan.x) / prevZoom;
        const worldZ = (localY - prevPan.y) / prevZoom;
        applyTransform(nextZoom, {
          x: localX - worldX * nextZoom,
          y: localY - worldZ * nextZoom,
        });
      },
      [minZoom, maxZoom, applyTransform],
    );

    // Zoom centered at cursor point (screen client coordinates)
    const zoomAtScreenPoint = useCallback(
      (screenX: number, screenY: number, factor: number) => {
        const svg = svgRef.current ?? containerRef.current;
        if (!svg) return;
        const rect = svg.getBoundingClientRect();
        zoomAtLocalPoint(screenX - rect.left, screenY - rect.top, factor);
      },
      [zoomAtLocalPoint],
    );

    // Wheel zoom handler
    const onWheel = useCallback(
      (e: React.WheelEvent) => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.15 : 0.87;
        zoomAtScreenPoint(e.clientX, e.clientY, factor);
      },
      [zoomAtScreenPoint],
    );

    // Cancel current drag operation
    const cancelDrag = useCallback(() => {
      if (!dragRef.current) return;
      setDragging(null);
      dragRef.current = null;
      pointerDownRef.current = null;
      onLiveDragCoords(null);
      onNotice?.('ยกเลิกการย้ายครุภัณฑ์แล้ว');
    }, [onLiveDragCoords, onNotice]);

    // Rotate held item by 90 degrees
    const rotateHeldItem = useCallback(() => {
      const cur = dragRef.current;
      if (!cur) return;
      const nextRot = (cur.currentRotDeg + 90) % 360;
      const fp = getFootprint({
        width: cur.item.width,
        depth: cur.item.depth,
        rotationDeg: nextRot,
      });
      const clamped = clampToRoom(
        { x: cur.currentX, z: cur.currentZ },
        fp,
        scenario.labWidth,
        scenario.labDepth,
      );
      const nx = Number(clamped.x.toFixed(2));
      const nz = Number(clamped.z.toFixed(2));

      const candidate: SpatialBoxInput = {
        id: cur.item.id,
        x: nx,
        z: nz,
        width: cur.item.width,
        depth: cur.item.depth,
        height: cur.item.height,
        baseY: cur.item.baseY,
        rotationDeg: nextRot,
      };
      const ignoreIds = new Set<string>([
        cur.item.id,
        ...cur.childMachines.map((c) => c.id),
      ]);
      const isColliding = findOverlaps(candidate, scenario.equipment, ignoreIds).length > 0;

      const updated = {
        ...cur,
        currentX: nx,
        currentZ: nz,
        currentRotDeg: nextRot,
        isColliding,
      };
      setDragging(updated);
      dragRef.current = updated;
      onLiveDragCoords({
        label: isColliding ? `${cur.item.labelTh} (ชนครุภัณฑ์อื่น)` : cur.item.labelTh,
      });
    }, [scenario.equipment, scenario.labWidth, scenario.labDepth, onLiveDragCoords]);

    // Keyboard shortcuts (Escape to cancel drag, R to rotate)
    useEffect(() => {
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          if (dragRef.current) {
            e.preventDefault();
            cancelDrag();
          }
        } else if ((e.key === 'r' || e.key === 'R') && dragRef.current) {
          e.preventDefault();
          rotateHeldItem();
        }
      };
      window.addEventListener('keydown', onKeyDown);
      return () => window.removeEventListener('keydown', onKeyDown);
    }, [cancelDrag, rotateHeldItem]);

    const hideHoverTooltip = useCallback(() => {
      if (hoverTooltipRef.current) {
        hoverTooltipRef.current.style.opacity = '0';
      }
    }, []);

    // Mouse pointer down on background (pan) or equipment (drag candidate)
    const handlePointerDown = (e: React.PointerEvent, item?: LabEquipment) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const curPan = panRef.current;
      const curZoom = zoomRef.current;

      // Right click or middle click always pans
      const isPanClick = e.button === 1 || e.button === 2 || !item;
      hideHoverTooltip();
      if (isPanClick) setIsPanning(true);

      pointerDownRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        candidateItem: item ?? null,
        isPan: isPanClick,
        initialPan: { ...curPan },
        pointerId: e.pointerId,
        hasMovedPastThreshold: false,
      };

      try {
        svg.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }

      if (!isPanClick && item) {
        // Find child machines on top of this equipment
        const parentAabb = getItemAABB(item);
        const childMachines = scenario.equipment
          .filter(
            (other) =>
              other.id !== item.id &&
              other.baseY > 0 &&
              other.x >= parentAabb.minX &&
              other.x <= parentAabb.maxX &&
              other.z >= parentAabb.minZ &&
              other.z <= parentAabb.maxZ &&
              other.baseY >= item.baseY + item.height * 0.7,
          )
          .map((m) => ({ id: m.id, initialX: m.x, initialZ: m.z }));

        const worldX = (mouseX - curPan.x) / curZoom;
        const worldZ = (mouseY - curPan.y) / curZoom;

        dragRef.current = {
          item,
          initialX: item.x,
          initialZ: item.z,
          initialRotDeg: item.rotationDeg,
          currentX: item.x,
          currentZ: item.z,
          currentRotDeg: item.rotationDeg,
          offsetX: item.x - worldX,
          offsetZ: item.z - worldZ,
          isColliding: false,
          childMachines,
        };
      }
    };

    const handlePointerMove = (e: React.PointerEvent) => {
      const pt = pointerDownRef.current;
      if (!pt) {
        // Desktop pointer hover feedback (equipment or zone tooltip)
        if (e.pointerType === 'touch') return;
        const svg = svgRef.current;
        if (!svg) return;
        const targetEl = e.target as Element | null;
        const eqGroup = targetEl?.closest('[data-equipment-id]');
        const eqId = eqGroup?.getAttribute('data-equipment-id') ?? null;
        setHoveredEquipId((prev) => (prev === eqId ? prev : eqId));

        let title = '';
        let hint = '';
        if (eqId) {
          const item = scenario.equipment.find((eq) => eq.id === eqId);
          if (item) {
            title = item.labelTh;
            hint = 'คลิกเลือก · ลากย้ายตำแหน่ง · กด R หมุน 90°';
          }
        } else {
          const rect = svg.getBoundingClientRect();
          const worldX = (e.clientX - rect.left - panRef.current.x) / zoomRef.current;
          const worldZ = (e.clientY - rect.top - panRef.current.y) / zoomRef.current;
          const hoveredZone = scenario.zones.find(
            (z) =>
              worldX >= z.x - z.width / 2 &&
              worldX <= z.x + z.width / 2 &&
              worldZ >= z.z - z.depth / 2 &&
              worldZ <= z.z + z.depth / 2,
          );
          if (hoveredZone) {
            title = hoveredZone.nameTh;
            hint = 'ลากเพื่อเลื่อนผัง · ล้อเมาส์ซูมที่เคอร์เซอร์';
          }
        }

        if (title && hoverTooltipRef.current && hoverTitleRef.current && hoverHintRef.current) {
          hoverTitleRef.current.textContent = title;
          hoverHintRef.current.textContent = hint;
          const tipX = Math.min(e.clientX + 16, window.innerWidth - 230);
          const tipY = Math.min(e.clientY + 18, window.innerHeight - 68);
          hoverTooltipRef.current.style.transform = `translate3d(${tipX}px, ${tipY}px, 0)`;
          hoverTooltipRef.current.style.opacity = '1';
        } else {
          hideHoverTooltip();
        }
        return;
      }

      const dx = e.clientX - pt.startX;
      const dy = e.clientY - pt.startY;
      const dist = Math.hypot(dx, dy);

      if (!pt.hasMovedPastThreshold) {
        if (dist > 5) {
          pt.hasMovedPastThreshold = true;
          if (pt.candidateItem) {
            onSelect({ kind: 'equipment', id: pt.candidateItem.id });
          }
        } else {
          return;
        }
      }

      if (pt.isPan) {
        const nextPan = {
          x: pt.initialPan.x + dx,
          y: pt.initialPan.y + dy,
        };
        panRef.current = nextPan;
        setPan(nextPan);
        return;
      }

      // Dragging equipment item
      const cur = dragRef.current;
      const svg = svgRef.current;
      if (!cur || !svg) return;

      const rect = svg.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const curPan = panRef.current;
      const curZoom = zoomRef.current;

      const rawWorldX = (mouseX - curPan.x) / curZoom + cur.offsetX;
      const rawWorldZ = (mouseY - curPan.y) / curZoom + cur.offsetZ;

      // Snap to 0.1m grid unless Alt key is held
      const useSnap = !e.altKey;
      const targetX = useSnap ? snapToGrid(rawWorldX, 0.1) : rawWorldX;
      const targetZ = useSnap ? snapToGrid(rawWorldZ, 0.1) : rawWorldZ;

      const fp = getFootprint({
        width: cur.item.width,
        depth: cur.item.depth,
        rotationDeg: cur.currentRotDeg,
      });
      const clamped = clampToRoom(
        { x: targetX, z: targetZ },
        fp,
        scenario.labWidth,
        scenario.labDepth,
      );
      const nx = Number(clamped.x.toFixed(2));
      const nz = Number(clamped.z.toFixed(2));

      // Overlap collision detection
      const candidate: SpatialBoxInput = {
        id: cur.item.id,
        x: nx,
        z: nz,
        width: cur.item.width,
        depth: cur.item.depth,
        height: cur.item.height,
        baseY: cur.item.baseY,
        rotationDeg: cur.currentRotDeg,
      };
      const ignoreIds = new Set<string>([
        cur.item.id,
        ...cur.childMachines.map((c) => c.id),
      ]);
      const overlaps = findOverlaps(candidate, scenario.equipment, ignoreIds);
      const isColliding = overlaps.length > 0;

      const updated = {
        ...cur,
        currentX: nx,
        currentZ: nz,
        isColliding,
      };
      setDragging(updated);
      dragRef.current = updated;

      onLiveDragCoords({
        label: isColliding ? `${cur.item.labelTh} (ชนครุภัณฑ์อื่น)` : cur.item.labelTh,
      });
    };

    const handlePointerUp = (e: React.PointerEvent) => {
      setIsPanning(false);
      const pt = pointerDownRef.current;
      const svg = svgRef.current;
      if (svg && pt) {
        try {
          svg.releasePointerCapture(e.pointerId);
        } catch {
          // ignore
        }
      }

      if (!pt) return;
      pointerDownRef.current = null;

      // Click without drag (>5px)
      if (!pt.hasMovedPastThreshold) {
        setDragging(null);
        dragRef.current = null;
        onLiveDragCoords(null);
        if (pt.candidateItem) {
          onSelect({ kind: 'equipment', id: pt.candidateItem.id });
        } else {
          onSelect(null);
        }
        return;
      }

      // Drag commit
      const cur = dragRef.current;
      setDragging(null);
      dragRef.current = null;
      onLiveDragCoords(null);

      if (!cur) return;

      if (cur.isColliding) {
        onNotice?.('วางไม่สำเร็จ: ตำแหน่งชนกับครุภัณฑ์อื่น');
        return;
      }

      const returnedSame =
        Math.abs(cur.currentX - cur.initialX) < 0.001 &&
        Math.abs(cur.currentZ - cur.initialZ) < 0.001 &&
        cur.currentRotDeg === cur.initialRotDeg;

      if (!returnedSame) {
        onCommitMove('equipment', cur.item.id, cur.currentX, cur.currentZ, cur.currentRotDeg);
      }
    };

    // Mobile touch pinch-zoom handling
    const onTouchStart = (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        const svg = svgRef.current ?? containerRef.current;
        if (!svg) return;
        const rect = svg.getBoundingClientRect();
        const midX = (t1.clientX + t2.clientX) / 2 - rect.left;
        const midY = (t1.clientY + t2.clientY) / 2 - rect.top;
        const curPan = panRef.current;
        const curZoom = zoomRef.current;
        const worldX = (midX - curPan.x) / curZoom;
        const worldZ = (midY - curPan.y) / curZoom;
        touchStartRef.current = {
          initialDist: dist,
          initialZoom: curZoom,
          centerWorldX: worldX,
          centerWorldZ: worldZ,
        };
      }
    };

    const onTouchMove = (e: React.TouchEvent) => {
      if (e.touches.length === 2 && touchStartRef.current) {
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        const ratio = dist / Math.max(1, touchStartRef.current.initialDist);
        const nextZoom = Math.min(
          Math.max(touchStartRef.current.initialZoom * ratio, minZoom),
          maxZoom,
        );
        const svg = svgRef.current ?? containerRef.current;
        if (!svg) return;
        const rect = svg.getBoundingClientRect();
        const midX = (t1.clientX + t2.clientX) / 2 - rect.left;
        const midY = (t1.clientY + t2.clientY) / 2 - rect.top;

        applyTransform(nextZoom, {
          x: midX - touchStartRef.current.centerWorldX * nextZoom,
          y: midY - touchStartRef.current.centerWorldZ * nextZoom,
        });
      }
    };

    const onTouchEnd = () => {
      touchStartRef.current = null;
    };

    // Double click background to fit screen
    const handleDoubleClick = (e: React.MouseEvent) => {
      // Check if target is not equipment
      const target = e.target as HTMLElement;
      if (target.closest('[data-equipment-id]')) return;
      fitToScreen();
    };

    // Separate floor items and countertop machines so machines always render on top
    const { floorEquipment, countertopEquipment } = useMemo(() => {
      const floor: LabEquipment[] = [];
      const counter: LabEquipment[] = [];
      for (const eq of scenario.equipment) {
        if (eq.baseY > 0) counter.push(eq);
        else floor.push(eq);
      }
      return { floorEquipment: floor, countertopEquipment: counter };
    }, [scenario.equipment]);

    // Identify floor tables/benches that already hold countertop equipment
    const parentEquipmentIds = useMemo(() => {
      const ids = new Set<string>();
      for (const child of countertopEquipment) {
        if (child.supportId) {
          ids.add(child.supportId);
          continue;
        }
        for (const floorItem of floorEquipment) {
          const aabb = getItemAABB(floorItem);
          if (
            child.x >= aabb.minX &&
            child.x <= aabb.maxX &&
            child.z >= aabb.minZ &&
            child.z <= aabb.maxZ &&
            child.baseY >= floorItem.baseY + floorItem.height * 0.7
          ) {
            ids.add(floorItem.id);
          }
        }
      }
      return ids;
    }, [countertopEquipment, floorEquipment]);

    // Compute upright, non-overlapping screen-space labels for equipment and zones
    const resolvedLabels = useMemo<ResolvedLabel2D[]>(() => {
      if (!showLabels) return [];

      const placedBoxes: ScreenRect[] = [];
      const zoneLabels: ResolvedLabel2D[] = [];
      const equipmentLabels: ResolvedLabel2D[] = [];

      const resolveCoords = (item: LabEquipment) => {
        const isBeingDragged = dragging?.item.id === item.id;
        const isChildBeingMoved = dragging?.childMachines.some((c) => c.id === item.id);
        let x = item.x;
        let z = item.z;
        let rot = item.rotationDeg;

        if (isBeingDragged && dragging) {
          x = dragging.currentX;
          z = dragging.currentZ;
          rot = dragging.currentRotDeg;
        } else if (isChildBeingMoved && dragging) {
          const dx = dragging.currentX - dragging.initialX;
          const dz = dragging.currentZ - dragging.initialZ;
          const childInitial = dragging.childMachines.find((c) => c.id === item.id);
          if (childInitial) {
            x = Number((childInitial.initialX + dx).toFixed(2));
            z = Number((childInitial.initialZ + dz).toFixed(2));
          }
        }
        return { x, z, rot, isBeingDragged };
      };

      const equipmentScreenBoxes: ScreenRect[] = [];
      const candidates = scenario.equipment.map((item) => {
        const { x, z, rot, isBeingDragged } = resolveCoords(item);
        const isSelected = selection?.kind === 'equipment' && selection.id === item.id;
        const fp = getFootprint({ width: item.width, depth: item.depth, rotationDeg: rot });
        const sx = pan.x + x * zoom;
        const sy = pan.y + z * zoom;
        const boxWpx = fp.halfW * 2 * zoom;
        const boxHpx = fp.halfD * 2 * zoom;

        equipmentScreenBoxes.push({
          minX: sx - boxWpx / 2,
          minY: sy - boxHpx / 2,
          maxX: sx + boxWpx / 2,
          maxY: sy + boxHpx / 2,
        });

        let priority = 10;
        if (isSelected || isBeingDragged) priority = 100;
        else if (item.showNameTag && item.baseY > 0) priority = 80;
        else if (item.showNameTag) priority = 65;
        else if (item.baseY > 0) priority = 45;
        else if (parentEquipmentIds.has(item.id)) priority = 5;
        else if (item.type === 'bench' || item.type === 'cabinet' || item.type === 'docCabinet' || item.type === 'shelf') priority = 30;
        else if (item.type === 'chair' || item.type === 'officeChair' || item.type === 'bin') priority = 15;

        return {
          item,
          sx,
          sy,
          boxWpx,
          boxHpx,
          isSelected,
          isBeingDragged,
          priority,
        };
      });

      candidates.sort((a, b) => b.priority - a.priority || (b.boxWpx * b.boxHpx - a.boxWpx * a.boxHpx));

      // Step 1: Place equipment labels without colliding with higher-priority labels
      for (const c of candidates) {
        const isHighlighted = c.isSelected || c.isBeingDragged;
        const hasChildren = parentEquipmentIds.has(c.item.id);
        if (!isHighlighted && hasChildren) continue;
        if (!isHighlighted && Math.max(c.boxWpx, c.boxHpx) < 22) continue;

        const fontSize = isHighlighted ? 11 : 10;
        const pillH = fontSize + 6;
        const rawText = (c.item.label || c.item.labelTh).trim();
        const maxAllowedW = isHighlighted
          ? 200
          : Math.max(c.boxWpx + 26, Math.min(108, zoom * 2.7));
        const text = fitLabelText(rawText, fontSize, maxAllowedW);
        if (!text) continue;

        const pillW = estimateLabelWidthPx(text, fontSize);
        const rect: ScreenRect = {
          minX: c.sx - pillW / 2,
          minY: c.sy - pillH / 2,
          maxX: c.sx + pillW / 2,
          maxY: c.sy + pillH / 2,
        };

        if (!isHighlighted && placedBoxes.some((b) => rectsOverlap(rect, b, 4))) {
          continue;
        }

        placedBoxes.push(rect);
        equipmentLabels.push({
          key: `lbl-eq-${c.item.id}`,
          kind: 'equipment',
          text,
          sx: c.sx,
          sy: c.sy,
          pillW,
          pillH,
          fontSize,
          isHighlighted,
        });
      }

      // Step 2: Place zone labels on clear open space inside each zone avoiding equipment & text
      const anchorFractions: [number, number][] = [
        [0.5, 0.82],
        [0.5, 0.5],
        [0.5, 0.18],
        [0.26, 0.82],
        [0.74, 0.82],
        [0.26, 0.5],
        [0.74, 0.5],
        [0.26, 0.18],
        [0.74, 0.18],
      ];

      for (const zone of scenario.zones) {
        const zMinX = pan.x + (zone.x - zone.width / 2) * zoom;
        const zMaxX = pan.x + (zone.x + zone.width / 2) * zoom;
        const zMinY = pan.y + (zone.z - zone.depth / 2) * zoom;
        const zMaxY = pan.y + (zone.z + zone.depth / 2) * zoom;
        const zoneWpx = zMaxX - zMinX;
        const zoneDpx = zMaxY - zMinY;

        if (zoneWpx < 40 || zoneDpx < 24) continue;

        const fontSize = 10.5;
        const pillH = fontSize + 6;
        const rawZoneText = (zone.name || zone.nameTh).trim();
        const text = fitLabelText(rawZoneText, fontSize, Math.max(40, zoneWpx - 10));
        if (!text) continue;

        const pillW = estimateLabelWidthPx(text, fontSize);
        if (pillW > zoneWpx + 12) continue;

        let bestCandidate: { sx: number; sy: number; rect: ScreenRect; eqOverlap: number } | null = null;

        for (const [fx, fz] of anchorFractions) {
          let sx = zMinX + zoneWpx * fx;
          let sy = zMinY + zoneDpx * fz;

          const minAllowedX = zMinX + pillW / 2 + 4;
          const maxAllowedX = zMaxX - pillW / 2 - 4;
          if (minAllowedX <= maxAllowedX) {
            sx = Math.min(Math.max(sx, minAllowedX), maxAllowedX);
          } else {
            sx = (zMinX + zMaxX) / 2;
          }

          const minAllowedY = zMinY + pillH / 2 + 4;
          const maxAllowedY = zMaxY - pillH / 2 - 4;
          if (minAllowedY <= maxAllowedY) {
            sy = Math.min(Math.max(sy, minAllowedY), maxAllowedY);
          } else {
            sy = (zMinY + zMaxY) / 2;
          }

          const rect: ScreenRect = {
            minX: sx - pillW / 2,
            minY: sy - pillH / 2,
            maxX: sx + pillW / 2,
            maxY: sy + pillH / 2,
          };

          // Strictly avoid colliding with any already placed label
          if (placedBoxes.some((b) => rectsOverlap(rect, b, 5))) {
            continue;
          }

          let eqOverlap = 0;
          for (const eqBox of equipmentScreenBoxes) {
            eqOverlap += rectOverlapArea(rect, eqBox);
          }

          if (!bestCandidate || eqOverlap < bestCandidate.eqOverlap) {
            bestCandidate = { sx, sy, rect, eqOverlap };
            if (eqOverlap === 0) break;
          }
        }

        if (bestCandidate) {
          placedBoxes.push(bestCandidate.rect);
          zoneLabels.push({
            key: `lbl-zone-${zone.id}`,
            kind: 'zone',
            text,
            sx: bestCandidate.sx,
            sy: bestCandidate.sy,
            pillW,
            pillH,
            fontSize,
            accentColor: zone.color,
          });
        }
      }

      return [...zoneLabels, ...equipmentLabels];
    }, [
      showLabels,
      dragging,
      scenario.equipment,
      scenario.zones,
      selection,
      pan.x,
      pan.y,
      zoom,
      parentEquipmentIds,
    ]);

    // Grid coordinates
    const grid1mLines = useMemo(() => {
      const lines: { x1: number; y1: number; x2: number; y2: number; is5m: boolean }[] = [];
      const halfW = scenario.labWidth / 2;
      const halfD = scenario.labDepth / 2;

      // Vertical lines along X
      const minX = Math.floor(-halfW);
      const maxX = Math.ceil(halfW);
      for (let x = minX; x <= maxX; x += 1) {
        const is5m = Math.abs(x) % 5 === 0;
        lines.push({ x1: x, y1: -halfD, x2: x, y2: halfD, is5m });
      }

      // Horizontal lines along Z
      const minZ = Math.floor(-halfD);
      const maxZ = Math.ceil(halfD);
      for (let z = minZ; z <= maxZ; z += 1) {
        const is5m = Math.abs(z) % 5 === 0;
        lines.push({ x1: -halfW, y1: z, x2: halfW, y2: z, is5m });
      }
      return lines;
    }, [scenario.labWidth, scenario.labDepth]);

    // Render single equipment element
    const renderEquipment = (item: LabEquipment) => {
      const isSelected = selection?.kind === 'equipment' && selection.id === item.id;
      const isHovered = hoveredEquipId === item.id && !dragging;
      const isBeingDragged = dragging?.item.id === item.id;
      const isChildBeingMoved = dragging?.childMachines.some((c) => c.id === item.id);

      let currentX = item.x;
      let currentZ = item.z;
      let currentRot = item.rotationDeg;
      let isColliding = false;

      if (isBeingDragged && dragging) {
        currentX = dragging.currentX;
        currentZ = dragging.currentZ;
        currentRot = dragging.currentRotDeg;
        isColliding = dragging.isColliding;
      } else if (isChildBeingMoved && dragging) {
        const dx = dragging.currentX - dragging.initialX;
        const dz = dragging.currentZ - dragging.initialZ;
        const childInitial = dragging.childMachines.find((c) => c.id === item.id);
        if (childInitial) {
          currentX = Number((childInitial.initialX + dx).toFixed(2));
          currentZ = Number((childInitial.initialZ + dz).toFixed(2));
        }
      }

      // Fill color
      const isCountertop = item.baseY > 0;
      let fillColor = isDark ? '#334155' : '#f8fafc';
      let strokeColor = isDark ? '#64748b' : '#94a3b8';

      if (item.type === 'analyzer') {
        fillColor = isDark ? '#1e293b' : '#f0fdf4';
        strokeColor = '#10b981';
      } else if (item.type === 'sink') {
        fillColor = isDark ? '#0c4a6e' : '#e0f2fe';
        strokeColor = '#0284c7';
      } else if (item.type === 'bin') {
        fillColor = '#fee2e2';
        strokeColor = '#ef4444';
      } else if (item.type === 'bsc' || item.type === 'hood') {
        fillColor = isDark ? '#2e1065' : '#f5f3ff';
        strokeColor = '#8b5cf6';
      } else if (item.type === 'doubleGlassFridge' || item.type === 'fridge') {
        fillColor = isDark ? '#1e293b' : '#f1f5f9';
        strokeColor = '#3b82f6';
      }

      if (isColliding) {
        fillColor = 'rgba(239, 68, 68, 0.35)';
        strokeColor = '#ef4444';
      } else if (isSelected) {
        strokeColor = '#0f766e';
      } else if (isHovered) {
        strokeColor = '#0284c7';
      }

      return (
        <g
          key={item.id}
          data-equipment-id={item.id}
          transform={`translate(${currentX}, ${currentZ}) rotate(${currentRot})`}
          className="cursor-grab active:cursor-grabbing transition-transform duration-75 select-none"
          onPointerDown={(e) => {
            e.stopPropagation();
            handlePointerDown(e, item);
          }}
        >
          {/* Drop shadow or collision halo */}
          {isBeingDragged && (
            <rect
              x={-item.width / 2 - 0.08}
              y={-item.depth / 2 - 0.08}
              width={item.width + 0.16}
              height={item.depth + 0.16}
              rx={0.06}
              fill={isColliding ? 'rgba(239, 68, 68, 0.4)' : 'rgba(16, 185, 129, 0.3)'}
              stroke={isColliding ? '#b91c1c' : '#059669'}
              strokeWidth={0.05}
              strokeDasharray={isColliding ? '0.2 0.1' : undefined}
            />
          )}

          {/* Main equipment rectangle */}
          <rect
            x={-item.width / 2}
            y={-item.depth / 2}
            width={item.width}
            height={item.depth}
            rx={item.type === 'chair' || item.type === 'officeChair' ? Math.min(item.width, item.depth) / 2 : 0.04}
            fill={fillColor}
            stroke={strokeColor}
            strokeWidth={isSelected ? 0.08 : isCountertop ? 0.05 : 0.035}
            strokeDasharray={isCountertop && !isSelected ? '0.15 0.06' : undefined}
          />

          {/* Specific architectural icons inside equipment */}
          {item.type === 'sink' && (
            <ellipse
              cx={0}
              cy={0}
              rx={item.width * 0.28}
              ry={item.depth * 0.28}
              fill="none"
              stroke="#0284c7"
              strokeWidth={0.03}
            />
          )}

          {/* Front orientation notch */}
          <line
            x1={-item.width * 0.25}
            y1={-item.depth / 2 + 0.04}
            x2={item.width * 0.25}
            y2={-item.depth / 2 + 0.04}
            stroke={isColliding ? '#ef4444' : isSelected ? '#0f766e' : '#64748b'}
            strokeWidth={0.04}
          />

          {/* Selection indicator border */}
          {isSelected && !isBeingDragged && (
            <rect
              x={-item.width / 2 - 0.05}
              y={-item.depth / 2 - 0.05}
              width={item.width + 0.1}
              height={item.depth + 0.1}
              rx={0.06}
              fill="none"
              stroke="#0f766e"
              strokeWidth={0.05}
              strokeDasharray="0.25 0.12"
            />
          )}
        </g>
      );
    };

    return (
      <div
        ref={containerRef}
        className="relative h-full w-full overflow-hidden select-none bg-slate-50 dark:bg-slate-950"
      >
        {/* Main 2D SVG canvas */}
        <svg
          ref={svgRef}
          width={containerSize.w}
          height={containerSize.h}
          className={`absolute inset-0 block h-full w-full touch-none ${
            isPanning ? 'cursor-grabbing' : 'cursor-grab'
          }`}
          style={{ touchAction: 'none' }}
          onWheel={onWheel}
          onPointerDown={(e) => handlePointerDown(e)}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => {
            setIsPanning(false);
            cancelDrag();
          }}
          onPointerLeave={() => {
            setHoveredEquipId(null);
            hideHoverTooltip();
          }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onDoubleClick={handleDoubleClick}
          onContextMenu={(e) => e.preventDefault()}
        >
          {/* Main viewport group with pan & zoom scale */}
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            {/* Background Lab Slab Floor */}
            <rect
              x={-scenario.labWidth / 2}
              y={-scenario.labDepth / 2}
              width={scenario.labWidth}
              height={scenario.labDepth}
              fill={isDark ? '#0f172a' : '#ffffff'}
              stroke={isDark ? '#334155' : '#94a3b8'}
              strokeWidth={0.12}
              rx={0.08}
            />

            {/* 1m and 5m Grid lines */}
            {grid1mLines.map((line, idx) => (
              <line
                key={`grid-${idx}`}
                x1={line.x1}
                y1={line.y1}
                x2={line.x2}
                y2={line.y2}
                stroke={isDark ? (line.is5m ? '#334155' : '#1e293b') : line.is5m ? '#cbd5e1' : '#f1f5f9'}
                strokeWidth={line.is5m ? 0.04 : 0.018}
              />
            ))}

            {/* Zones */}
            {scenario.zones.map((zone) => {
              const zx = zone.x - zone.width / 2;
              const zz = zone.z - zone.depth / 2;
              return (
                <rect
                  key={zone.id}
                  x={zx}
                  y={zz}
                  width={zone.width}
                  height={zone.depth}
                  fill={zone.color}
                  fillOpacity={isDark ? 0.22 : 0.28}
                  stroke={zone.color}
                  strokeWidth={0.04}
                />
              );
            })}

            {/* Floor Equipment (Tables, cabinets, sinks, chairs) */}
            {floorEquipment.map(renderEquipment)}

            {/* Countertop Equipment on Tables (Analyzers, microscopes, POCT) */}
            {countertopEquipment.map(renderEquipment)}

            {/* Interior & Exterior Walls */}
            {scenario.walls.map((wall) => {
              const wx = wall.x - wall.width / 2;
              const wz = wall.z - wall.depth / 2;
              return (
                <rect
                  key={wall.id}
                  x={wx}
                  y={wz}
                  width={wall.width}
                  height={wall.depth}
                  fill={isDark ? '#475569' : '#64748b'}
                  stroke={isDark ? '#334155' : '#475569'}
                  strokeWidth={0.02}
                  rx={0.02}
                />
              );
            })}

            {/* Openings (Doors & Windows) */}
            {scenario.openings.map((op) => {
              const ox = op.x - op.width / 2;
              const oz = op.z - op.depth / 2;
              const isDoor = op.kind === 'frontDoor' || op.kind === 'backDoor';
              const isWindow = op.kind === 'window' || op.kind === 'slidingWindow';

              return (
                <g key={op.id}>
                  {/* Opening opening base rect */}
                  <rect
                    x={ox}
                    y={oz}
                    width={op.width}
                    height={op.depth}
                    fill={op.color}
                    fillOpacity={0.7}
                    stroke={op.color}
                    strokeWidth={0.04}
                  />

                  {/* Door swing arc if door */}
                  {isDoor && (
                    <path
                      d={`M ${op.x} ${op.z} A ${Math.max(op.width, op.depth)} ${Math.max(op.width, op.depth)} 0 0 1 ${op.x + (op.width > op.depth ? op.width / 2 : 0)} ${op.z + (op.depth > op.width ? op.depth / 2 : 0)}`}
                      fill="none"
                      stroke={op.color}
                      strokeWidth={0.03}
                      strokeDasharray="0.1 0.05"
                    />
                  )}

                  {/* Window double glass line */}
                  {isWindow && (
                    <line
                      x1={op.x - op.width / 2}
                      y1={op.z}
                      x2={op.x + op.width / 2}
                      y2={op.z}
                      stroke="#ffffff"
                      strokeWidth={0.02}
                    />
                  )}
                </g>
              );
            })}

          </g>

          {/* Upright, collision-free screen-space labels */}
          {resolvedLabels.length > 0 && (
            <g pointerEvents="none" className="select-none">
              {resolvedLabels.map((lbl) => (
                <g key={lbl.key} transform={`translate(${lbl.sx}, ${lbl.sy})`}>
                  <rect
                    x={-lbl.pillW / 2}
                    y={-lbl.pillH / 2}
                    width={lbl.pillW}
                    height={lbl.pillH}
                    rx={lbl.kind === 'zone' ? 5 : 4}
                    fill={
                      lbl.kind === 'zone'
                        ? isDark
                          ? 'rgba(15, 23, 42, 0.78)'
                          : 'rgba(255, 255, 255, 0.85)'
                        : isDark
                          ? 'rgba(15, 23, 42, 0.84)'
                          : 'rgba(255, 255, 255, 0.88)'
                    }
                    stroke={
                      lbl.isHighlighted
                        ? '#0f766e'
                        : lbl.kind === 'zone'
                          ? lbl.accentColor
                          : isDark
                            ? 'rgba(100, 116, 139, 0.4)'
                            : 'rgba(148, 163, 184, 0.45)'
                    }
                    strokeWidth={lbl.isHighlighted ? 1.5 : 0.9}
                  />
                  <text
                    x={0}
                    y={0.5}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={
                      lbl.isHighlighted
                        ? isDark
                          ? '#5eead4'
                          : '#0f766e'
                        : isDark
                          ? '#f1f5f9'
                          : '#0f172a'
                    }
                    fontSize={lbl.fontSize}
                    fontWeight={lbl.kind === 'zone' ? 700 : 600}
                    style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
                  >
                    {lbl.text}
                  </text>
                </g>
              ))}
            </g>
          )}
        </svg>

        {/* Desktop Hover Tooltip (follows pointermove cleanly without re-renders) */}
        <div
          ref={hoverTooltipRef}
          aria-hidden="true"
          style={{ opacity: 0, transform: 'translate3d(-999px, -999px, 0)' }}
          className="pointer-events-none fixed left-0 top-0 z-30 hidden sm:block max-w-[240px] rounded-lg border border-slate-200/90 bg-white/95 px-2.5 py-1.5 shadow-lg backdrop-blur-sm transition-opacity duration-100 dark:border-slate-700 dark:bg-slate-900/95"
        >
          <div ref={hoverTitleRef} className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100" />
          <div ref={hoverHintRef} className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400" />
        </div>

        {/* Desktop Mouse Hint (bottom-center on wide desktop screens) */}
        <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 z-10 hidden lg:flex items-center gap-2 rounded-lg border border-slate-200/80 bg-white/90 px-3 py-1.5 text-[11px] font-medium text-slate-600 shadow-sm backdrop-blur-sm dark:border-slate-700/80 dark:bg-slate-900/90 dark:text-slate-300">
          <span>ลากพื้นว่าง / คลิกขวา: เลื่อนผัง</span>
          <span className="text-slate-300 dark:text-slate-600">·</span>
          <span>ล้อเมาส์: ซูมที่เคอร์เซอร์</span>
          <span className="text-slate-300 dark:text-slate-600">·</span>
          <span>ดับเบิลคลิก: พอดีจอ</span>
        </div>

        {/* Bottom-right Zoom & Fit Controls (shared appearance & position with 3D) */}
        <div
          role="group"
          aria-label="ควบคุมการซูมมุมมอง"
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
          className="pointer-events-auto absolute bottom-2 right-3 sm:bottom-4 sm:right-4 z-10 flex items-center gap-1 rounded-xl border border-slate-200 bg-white/95 p-1 shadow-lg backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/95"
        >
          <button
            type="button"
            onClick={() => zoomAtLocalPoint(containerSize.w / 2, containerSize.h / 2, 1.25)}
            title="ซูมเข้า (+)"
            aria-label="ซูมเข้า (+)"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-700 transition-colors hover:bg-slate-100 active:bg-slate-200 dark:text-slate-200 dark:hover:bg-slate-800 dark:active:bg-slate-700"
          >
            <ZoomIn className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => zoomAtLocalPoint(containerSize.w / 2, containerSize.h / 2, 1 / 1.25)}
            title="ซูมออก (−)"
            aria-label="ซูมออก (−)"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-700 transition-colors hover:bg-slate-100 active:bg-slate-200 dark:text-slate-200 dark:hover:bg-slate-800 dark:active:bg-slate-700"
          >
            <ZoomOut className="h-4 w-4" aria-hidden="true" />
          </button>
          <div className="h-5 w-px bg-slate-200 dark:bg-slate-700 mx-0.5" aria-hidden="true" />
          <button
            type="button"
            onClick={fitToScreen}
            title="จัดผังพอดีจอ (ดับเบิลคลิกบนพื้นว่าง)"
            className="flex h-11 min-w-[44px] items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 active:bg-slate-200 dark:text-slate-200 dark:hover:bg-slate-800 dark:active:bg-slate-700"
          >
            <Maximize2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>พอดีจอ</span>
          </button>
        </div>
      </div>
    );
  },
);
