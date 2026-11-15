export type ZoneCategory = 'clean' | 'dirty' | 'support' | 'staff';

export type EquipmentType =
  | 'bench'
  | 'sink'
  | 'analyzer'
  | 'bsc'
  | 'hood'
  | 'microscope'
  | 'centrifuge'
  | 'fridge'
  | 'doubleGlassFridge'
  | 'pc'
  | 'shelf'
  | 'cabinet'
  | 'docCabinet'
  | 'bin'
  | 'chair'
  | 'officeChair'
  | 'hemoLine'
  | 'glassPartition'
  | 'rack';

export type EditorTool = 'inspect' | 'move';

export type CameraPreset = 'iso' | 'top' | 'frontDoor' | 'backDoor';

export type FlowType = 'specimen' | 'waste' | 'staff';

export interface LabZone {
  id: string;
  name: string;
  nameTh: string;
  category: ZoneCategory;
  /** Center X in meters (lab center = 0) */
  x: number;
  /** Center Z in meters (lab center = 0) */
  z: number;
  width: number;
  depth: number;
  color: string;
  description: string;
}

export interface LabEquipment {
  id: string;
  type: EquipmentType;
  label: string;
  labelTh: string;
  zoneId: string;
  /** Center X in meters */
  x: number;
  /** Center Z in meters */
  z: number;
  width: number;
  depth: number;
  height: number;
  /** Elevation base in meters (0 = floor, 0.55 = benchtop) */
  baseY: number;
  rotationDeg: number;
  color?: string;
  notes?: string;
  showNameTag?: boolean;
}

export interface LabWall {
  id: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  opacity: number;
  isExterior?: boolean;
}

export interface LabOpening {
  id: string;
  kind: 'frontDoor' | 'backDoor' | 'window' | 'slidingWindow';
  label: string;
  labelTh: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  color: string;
}

export interface LabScenario {
  id: string;
  name: string;
  subtitle: string;
  isBuiltIn?: boolean;
  labWidth: number;
  labDepth: number;
  zones: LabZone[];
  equipment: LabEquipment[];
  walls: LabWall[];
  openings: LabOpening[];
  updatedAt: string;
}

export interface FlowPoint {
  x: number;
  z: number;
  label: string;
}

export interface FlowRoute {
  type: FlowType;
  labelTh: string;
  color: string;
  points: FlowPoint[];
  segments?: FlowPoint[][];
  dashed?: boolean;
  lengthMeters: number;
}

export interface CrossingAlert {
  id: string;
  x: number;
  z: number;
  description: string;
}

export type RuleStatus = 'pass' | 'warn' | 'fail';

export interface ComplianceRuleResult {
  id: string;
  code: string;
  title: string;
  status: RuleStatus;
  measuredValue: string;
  standardTarget: string;
  detail: string;
  focusPoint?: { x: number; z: number };
}

export interface ExecutiveMetrics {
  totalAreaSqm: number;
  cleanAreaSqm: number;
  dirtyAreaSqm: number;
  supportAreaSqm: number;
  staffAreaSqm: number;
  equipmentCount: number;
  sinkCount: number;
  specimenPathMeters: number;
  wastePathMeters: number;
  staffPathMeters: number;
  crossingsCount: number;
  minAisleClearanceM: number;
  maxSinkDistanceM: number;
  passedRules: number;
  totalRules: number;
  complianceScorePct: number;
}

export interface MeasureSegment {
  id: string;
  start: { x: number; y: number; z: number };
  end: { x: number; y: number; z: number };
  distanceMeters: number;
}

export interface EquipmentCatalogItem {
  type: EquipmentType;
  label: string;
  labelTh: string;
  width: number;
  depth: number;
  height: number;
  baseY: number;
  defaultColor?: string;
  summary: string;
  showNameTag?: boolean;
}
