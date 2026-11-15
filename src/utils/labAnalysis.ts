import type {
  ComplianceRuleResult,
  CrossingAlert,
  ExecutiveMetrics,
  FlowPoint,
  FlowRoute,
  LabEquipment,
  LabScenario,
  LabZone,
} from '../types/lab';

function dist2D(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(bx - ax, bz - az);
}

function polylineLength(points: FlowPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += dist2D(points[i - 1].x, points[i - 1].z, points[i].x, points[i].z);
  }
  return Number(total.toFixed(2));
}

function segmentsIntersect(
  p1: { x: number; z: number },
  p2: { x: number; z: number },
  q1: { x: number; z: number },
  q2: { x: number; z: number },
): { x: number; z: number } | null {
  const rX = p2.x - p1.x;
  const rZ = p2.z - p1.z;
  const sX = q2.x - q1.x;
  const sZ = q2.z - q1.z;

  const denom = rX * sZ - rZ * sX;
  if (Math.abs(denom) < 1e-6) return null;

  const u = ((q1.x - p1.x) * rZ - (q1.z - p1.z) * rX) / denom;
  const t = ((q1.x - p1.x) * sZ - (q1.z - p1.z) * sX) / denom;

  if (t > 0.05 && t < 0.95 && u > 0.05 && u < 0.95) {
    return {
      x: Number((p1.x + t * rX).toFixed(2)),
      z: Number((p1.z + t * rZ).toFixed(2)),
    };
  }
  return null;
}

function pointInZone(x: number, z: number, zone: LabZone, margin = 0): boolean {
  return (
    x >= zone.x - zone.width / 2 + margin &&
    x <= zone.x + zone.width / 2 - margin &&
    z >= zone.z - zone.depth / 2 + margin &&
    z <= zone.z + zone.depth / 2 - margin
  );
}

function findZone(scenario: LabScenario, id: string): LabZone | undefined {
  return scenario.zones.find((z) => z.id === id);
}

export function computeFlowAnalysis(scenario: LabScenario): {
  routes: FlowRoute[];
  crossings: CrossingAlert[];
} {
  const frontDoor =
    scenario.openings.find((o) => o.id === 'op-front-door') ??
    scenario.openings.find((o) => o.kind === 'frontDoor');
  const backDoor =
    scenario.openings.find((o) => o.id === 'op-back-door') ??
    scenario.openings.find((o) => o.kind === 'backDoor');
  const staffBackDoor = scenario.openings.find((o) => o.id === 'op-staff-back-door');

  const reception = findZone(scenario, 'zone-reception');
  const prep = findZone(scenario, 'zone-prep');
  const analyzers = findZone(scenario, 'zone-analyzers');
  const rapid = findZone(scenario, 'zone-rapid');
  const hemo = findZone(scenario, 'zone-hemo');
  const micro = findZone(scenario, 'zone-micro');
  const waste = findZone(scenario, 'zone-waste');
  const clean = findZone(scenario, 'zone-clean');
  const staff = findZone(scenario, 'zone-staff');
  const bloodDraw = findZone(scenario, 'zone-blood-draw');
  const bloodBank = findZone(scenario, 'zone-blood-bank');

  const frontSliding = scenario.openings.find((o) => o.id === 'op-front-sliding');

  // 1. Specimen Flow (Solid orthogonal arrows matching architectural floor diagram)
  const specimenSegments: FlowPoint[][] = [];
  if (reception && frontSliding) {
    specimenSegments.push([
      { x: frontSliding.x - 0.85, z: frontSliding.z, label: 'รับสิ่งส่งตรวจหน้าห้อง' },
      { x: reception.x - reception.width / 2 + 0.18, z: frontSliding.z, label: 'Reception' },
    ]);
  } else if (reception && frontDoor) {
    specimenSegments.push([
      { x: frontDoor.x - 0.75, z: frontDoor.z, label: 'ประตูหน้า' },
      { x: reception.x - reception.width / 2 + 0.18, z: frontDoor.z, label: 'Reception' },
    ]);
  }
  if (bloodDraw && reception) {
    const xBridge = Number((bloodDraw.x - 0.1).toFixed(2));
    specimenSegments.push([
      { x: xBridge, z: bloodDraw.z - bloodDraw.depth / 2 + 0.18, label: 'Blood draw' },
      { x: xBridge, z: reception.z + reception.depth / 2 - 0.18, label: 'Reception' },
    ]);
  }
  if (reception && bloodBank) {
    const startX = Number((reception.x + 1.5).toFixed(2));
    const corridorZ = Number((((reception.z + reception.depth / 2) + (bloodBank.z - bloodBank.depth / 2)) / 2).toFixed(2));
    const targetX = Number((bloodBank.x).toFixed(2));
    specimenSegments.push([
      { x: startX, z: reception.z + reception.depth / 2 - 0.18, label: 'Reception' },
      { x: startX, z: corridorZ, label: 'ทางเดินกลาง' },
      { x: targetX, z: corridorZ, label: 'หน้าคลังเลือด' },
      { x: targetX, z: bloodBank.z - bloodBank.depth / 2 + 0.18, label: 'Blood bank' },
    ]);
  }
  if (reception && prep) {
    const zBridge = Number((reception.z).toFixed(2));
    specimenSegments.push([
      { x: reception.x + reception.width / 2 - 0.18, z: zBridge, label: 'Reception' },
      { x: prep.x - prep.width / 2 + 0.18, z: zBridge, label: 'Specimen prep' },
    ]);
  }
  if (prep && analyzers) {
    const xBridge = Number((prep.x).toFixed(2));
    specimenSegments.push([
      { x: xBridge, z: prep.z - prep.depth / 2 + 0.18, label: 'Specimen prep' },
      { x: xBridge, z: analyzers.z + analyzers.depth / 2 - 0.18, label: 'Analyzer zone' },
    ]);
  }
  if (prep && rapid) {
    const zBridge = Number((prep.z).toFixed(2));
    specimenSegments.push([
      { x: prep.x + prep.width / 2 - 0.18, z: zBridge, label: 'Specimen prep' },
      { x: rapid.x - rapid.width / 2 + 0.18, z: zBridge, label: 'Rapid + POCT' },
    ]);
  }
  const specimenPoints: FlowPoint[] = specimenSegments.flat();

  // 2. Infectious Waste Flow (Dashed orthogonal arrows along top window wall -> Waste -> Back door)
  const wasteSegments: FlowPoint[][] = [];
  const topWasteZ = analyzers
    ? Number((analyzers.z - analyzers.depth / 2 - 0.04).toFixed(2))
    : -5.62;
  const wasteTargetX = waste ? Number((waste.x - 0.25).toFixed(2)) : 10.1;

  if (analyzers && waste) {
    const startX = Number((analyzers.x + 1.2).toFixed(2));
    const startZ = Number((analyzers.z - analyzers.depth / 2 + 0.12).toFixed(2));
    const intoWasteZ = Number((waste.z - waste.depth / 2 + 0.42).toFixed(2));
    wasteSegments.push([
      { x: startX, z: startZ, label: 'Analyzer zone' },
      { x: startX, z: topWasteZ, label: 'แนวผนังหน้าต่าง' },
      { x: wasteTargetX, z: topWasteZ, label: 'ลำเลียงขยะ' },
      { x: wasteTargetX, z: intoWasteZ, label: 'เข้าห้องพักขยะ' },
    ]);
  }
  if (micro && waste) {
    const mStartX = Number((micro.x).toFixed(2));
    const mStartZ = Number((micro.z - micro.depth / 2 + 0.12).toFixed(2));
    wasteSegments.push([
      { x: mStartX, z: mStartZ, label: 'Micro / BSC' },
      { x: mStartX, z: topWasteZ, label: 'ร่วมแนวลำเลียงขยะ' },
    ]);
  }
  if (waste && backDoor) {
    const isTopWallDoor = backDoor.width > backDoor.depth;
    if (isTopWallDoor) {
      wasteSegments.push([
        { x: backDoor.x, z: waste.z - waste.depth / 2 + 0.3, label: 'ห้องพักขยะ' },
        { x: backDoor.x, z: backDoor.z - 0.65, label: 'ออกประตูหลัง (ฝั่งหน้าต่าง)' },
      ]);
    } else {
      wasteSegments.push([
        { x: waste.x + 0.2, z: backDoor.z, label: 'ห้องพักขยะ' },
        { x: backDoor.x + 0.65, z: backDoor.z, label: 'ออกประตูหลัง' },
      ]);
    }
  }
  const wastePoints: FlowPoint[] = wasteSegments.flat();

  // 3. Staff Circulation Flow (Orthogonal paths)
  const staffSegments: FlowPoint[][] = [];
  if (staff && staffBackDoor) {
    staffSegments.push([
      { x: staffBackDoor.x + 0.55, z: staffBackDoor.z, label: 'ประตูหลังเจ้าหน้าที่' },
      { x: staff.x, z: staffBackDoor.z, label: 'เข้าห้องพักเจ้าหน้าที่' },
      { x: staff.x, z: staff.z, label: 'ห้องพักเจ้าหน้าที่' },
    ]);
  }
  if (staff && clean) {
    staffSegments.push([
      { x: staff.x - staff.width / 2 + 0.1, z: clean.z, label: 'ห้องพักเจ้าหน้าที่' },
      { x: clean.x + 1.5, z: clean.z, label: 'โซนรายงานผล' },
    ]);
  }
  if (clean && hemo) {
    staffSegments.push([
      { x: hemo.x, z: clean.z - clean.depth / 2 + 0.18, label: 'โซนรายงานผล' },
      { x: hemo.x, z: hemo.z + hemo.depth / 2 - 0.18, label: 'Hemoculture' },
    ]);
  }
  const staffPoints: FlowPoint[] = staffSegments.flat();

  const totalSegLength = (segs: FlowPoint[][]) =>
    Number(segs.reduce((sum, seg) => sum + polylineLength(seg), 0).toFixed(2));

  const routes: FlowRoute[] = [
    {
      type: 'specimen',
      labelTh: 'แนวการไหลเชิงแนวคิด (Specimen)',
      color: '#0F766E',
      points: specimenPoints,
      segments: specimenSegments,
      dashed: false,
      lengthMeters: totalSegLength(specimenSegments),
    },
    {
      type: 'waste',
      labelTh: 'แนวการไหลเชิงแนวคิด (Infectious waste)',
      color: '#D85A30',
      points: wastePoints,
      segments: wasteSegments,
      dashed: true,
      lengthMeters: totalSegLength(wasteSegments),
    },
    {
      type: 'staff',
      labelTh: 'แนวการไหลเชิงแนวคิด (Staff)',
      color: '#6D28D9',
      points: staffPoints,
      segments: staffSegments,
      dashed: true,
      lengthMeters: totalSegLength(staffSegments),
    },
  ];

  // Detect crossings between Waste flow branches and Specimen branches / Clean & Blood Bank zones
  const crossings: CrossingAlert[] = [];
  for (let b = 0; b < wasteSegments.length; b++) {
    const wSeg = wasteSegments[b];
    for (let i = 1; i < wSeg.length; i++) {
      const w1 = wSeg[i - 1];
      const w2 = wSeg[i];
      for (let sb = 0; sb < specimenSegments.length; sb++) {
        const sSeg = specimenSegments[sb];
        for (let j = 1; j < sSeg.length; j++) {
          const hit = segmentsIntersect(w1, w2, sSeg[j - 1], sSeg[j]);
          if (hit) {
            crossings.push({
              id: `cross-ws-${b}-${i}-${sb}-${j}`,
              x: hit.x,
              z: hit.z,
              description: 'เส้นทางขยะติดเชื้อตัดผ่านเส้นทางลำเลียงสิ่งส่งตรวจ (เสี่ยงปนเปื้อน)',
            });
          }
        }
      }
      if (clean && (pointInZone(w1.x, w1.z, clean, 0.3) || pointInZone(w2.x, w2.z, clean, 0.3))) {
        crossings.push({
          id: `cross-wc-${b}-${i}`,
          x: (w1.x + w2.x) / 2,
          z: (w1.z + w2.z) / 2,
          description: 'เส้นทางขยะติดเชื้อพาดผ่านพื้นที่ Clean Zone',
        });
      }
      if (bloodBank && (pointInZone(w1.x, w1.z, bloodBank, 0.3) || pointInZone(w2.x, w2.z, bloodBank, 0.3))) {
        crossings.push({
          id: `cross-wb-${b}-${i}`,
          x: (w1.x + w2.x) / 2,
          z: (w1.z + w2.z) / 2,
          description: 'เส้นทางขยะติดเชื้อพาดผ่านคลังเลือด (Blood Bank)',
        });
      }
    }
  }

  return { routes, crossings };
}

export function computeMinAisleClearance(scenario: LabScenario): number {
  // Measure vertical corridor gaps between zone rows and critical equipment aisles
  const topZones = scenario.zones.filter((z) => z.z < -2.2);
  const midZones = scenario.zones.filter((z) => z.z >= -2.2 && z.z <= 2.2 && z.id !== 'zone-staff');
  const botZones = scenario.zones.filter((z) => z.z > 2.2 && z.id !== 'zone-staff');

  let minCorridor = 4.0;
  for (const tz of topZones) {
    const tBottom = tz.z + tz.depth / 2;
    for (const mz of midZones) {
      const mTop = mz.z - mz.depth / 2;
      if (Math.abs(tz.x - mz.x) < (tz.width + mz.width) / 2) {
        // Calculate distance between nearest equipment inside adjacent zones
        const tEquip = scenario.equipment.filter((e) => e.zoneId === tz.id);
        const mEquip = scenario.equipment.filter((e) => e.zoneId === mz.id);
        for (const te of tEquip) {
          for (const me of mEquip) {
            const overlapX =
              Math.min(te.x + te.width / 2, me.x + me.width / 2) -
              Math.max(te.x - te.width / 2, me.x - me.width / 2);
            if (overlapX > 0.2) {
              const gap = (me.z - me.depth / 2) - (te.z + te.depth / 2);
              if (gap > 0.2 && gap < minCorridor) minCorridor = gap;
            }
          }
        }
        const zoneGap = mTop - tBottom;
        if (zoneGap > 0 && zoneGap < 0.3) {
          // Zone gap itself is narrow walkway strip, rely on equipment gap
        }
      }
    }
  }

  for (const mz of midZones) {
    for (const bz of botZones) {
      if (Math.abs(mz.x - bz.x) < (mz.width + bz.width) / 2) {
        const mEquip = scenario.equipment.filter((e) => e.zoneId === mz.id);
        const bEquip = scenario.equipment.filter((e) => e.zoneId === bz.id);
        for (const me of mEquip) {
          for (const be of bEquip) {
            const overlapX =
              Math.min(me.x + me.width / 2, be.x + be.width / 2) -
              Math.max(me.x - me.width / 2, be.x - be.width / 2);
            if (overlapX > 0.2) {
              const gap = (be.z - be.depth / 2) - (me.z + me.depth / 2);
              if (gap > 0.2 && gap < minCorridor) minCorridor = gap;
            }
          }
        }
      }
    }
  }

  return Number(minCorridor.toFixed(2));
}

export function computeMaxSinkDistance(scenario: LabScenario): {
  maxDist: number;
  worstZone: LabZone | null;
} {
  const sinks = scenario.equipment.filter((e) => e.type === 'sink');
  const activeZones = scenario.zones.filter(
    (z) => z.id !== 'zone-storage' && z.id !== 'zone-waste',
  );

  if (sinks.length === 0) {
    return { maxDist: 99, worstZone: activeZones[0] ?? null };
  }

  let maxDist = 0;
  let worstZone: LabZone | null = null;

  for (const zone of activeZones) {
    let nearest = Infinity;
    for (const sink of sinks) {
      const d = dist2D(zone.x, zone.z, sink.x, sink.z);
      if (d < nearest) nearest = d;
    }
    if (nearest > maxDist) {
      maxDist = nearest;
      worstZone = zone;
    }
  }

  return { maxDist: Number(maxDist.toFixed(2)), worstZone };
}

export function nearestSinkForEquipment(
  item: LabEquipment,
  scenario: LabScenario,
): { sink: LabEquipment | null; distance: number } {
  const sinks = scenario.equipment.filter((e) => e.type === 'sink' && e.id !== item.id);
  let best: LabEquipment | null = null;
  let minD = Infinity;
  for (const s of sinks) {
    const d = dist2D(item.x, item.z, s.x, s.z);
    if (d < minD) {
      minD = d;
      best = s;
    }
  }
  return { sink: best, distance: Number((minD === Infinity ? 0 : minD).toFixed(2)) };
}

export function evaluateCompliance(scenario: LabScenario): ComplianceRuleResult[] {
  const frontDoor =
    scenario.openings.find((o) => o.id === 'op-front-door') ??
    scenario.openings.find((o) => o.kind === 'frontDoor');
  const backDoor =
    scenario.openings.find((o) => o.id === 'op-back-door') ??
    scenario.openings.find((o) => o.kind === 'backDoor');
  const micro = findZone(scenario, 'zone-micro');
  const waste = findZone(scenario, 'zone-waste');
  const bloodDraw = findZone(scenario, 'zone-blood-draw');
  const bsc = scenario.equipment.find((e) => e.type === 'bsc');

  const { crossings } = computeFlowAnalysis(scenario);
  const minAisle = computeMinAisleClearance(scenario);
  const { maxDist: maxSinkDist, worstZone } = computeMaxSinkDistance(scenario);

  const rules: ComplianceRuleResult[] = [];

  // IC-01: One-way door separation
  const doorDist =
    frontDoor && backDoor ? Number(dist2D(frontDoor.x, frontDoor.z, backDoor.x, backDoor.z).toFixed(2)) : 0;
  const oppositeSides = frontDoor && backDoor ? Math.abs(frontDoor.x - backDoor.x) >= 15 : false;
  rules.push({
    id: 'rule-ic-01',
    code: 'IC-01',
    title: 'แยกประตูรับสิ่งส่งตรวจและประตูออกขยะติดเชื้อ',
    status: oppositeSides && doorDist >= 15 ? 'pass' : 'fail',
    measuredValue: `${doorDist.toFixed(1)} ม.`,
    standardTarget: 'คนละฝั่งอาคาร (≥ 15.0 ม.)',
    detail: oppositeSides
      ? 'ประตูหน้า (รับตัวอย่าง) และประตูหลัง (นำขยะออก) อยู่คนละฝั่ง ลดการปะปนทางเดิน'
      : 'ประตูหน้าและหลังอยู่ฝั่งเดียวกัน ต้องออกแบบผนังกั้นและกำหนดเวลาลำเลียงขยะแยกต่างหาก',
    focusPoint: backDoor ? { x: backDoor.x, z: backDoor.z } : undefined,
  });

  // IC-02: Micro & Waste physical partition enclosure
  const microLeftBoundary = micro ? micro.x - micro.width / 2 : 0;
  const hasLeftMicroWall = scenario.walls.some(
    (w) => !w.isExterior && w.depth >= 2.2 && Math.abs(w.x - microLeftBoundary) < 0.8 && w.z < -1.5,
  );
  const hasBottomMicroWall = scenario.walls.some(
    (w) => !w.isExterior && w.width >= 4.0 && micro && Math.abs(w.z - (micro.z + micro.depth / 2)) < 0.8,
  );
  rules.push({
    id: 'rule-ic-02',
    code: 'IC-02',
    title: 'ผนังกั้นห้องจุลชีววิทยา (Micro) แยกจากโซนสะอาด',
    status: hasLeftMicroWall && hasBottomMicroWall ? 'pass' : hasBottomMicroWall ? 'warn' : 'fail',
    measuredValue: hasLeftMicroWall && hasBottomMicroWall ? 'ปิดล้อมครบ 2 ด้าน' : 'เปิดเชื่อมด้าน Analyzers',
    standardTarget: 'ปิดล้อมแยกความดันลบ',
    detail:
      hasLeftMicroWall && hasBottomMicroWall
        ? 'มีผนังกั้นแยกโซน Micro ออกจาก Analyzers และทางเดินกลางครบถ้วน'
        : 'ฝั่งซ้ายและด้านล่างของโซน Micro ยังเปิดโล่งติดกับพื้นที่อื่น ควรเพิ่มผนังกั้นหากต้องการแยกความดันลบ',
    focusPoint: micro ? { x: micro.x - micro.width / 2, z: micro.z } : undefined,
  });

  // IC-03: BSC draft clearance from corridor & doorways
  let bscClearance = 0;
  if (bsc && micro) {
    const corridorZ = micro.z + micro.depth / 2; // bottom boundary of Micro facing main aisle
    bscClearance = Number(Math.abs(bsc.z - corridorZ).toFixed(2));
  }
  rules.push({
    id: 'rule-ic-03',
    code: 'IC-03',
    title: 'ตำแหน่งตู้ชีวนิรภัย BSC พ้นแนวกระแสลมและทางเดิน',
    status: !bsc ? 'fail' : bscClearance >= 1.5 ? 'pass' : bscClearance >= 0.9 ? 'warn' : 'fail',
    measuredValue: bsc ? `ห่างทางเดิน ${bscClearance.toFixed(2)} ม.` : 'ไม่พบตู้ BSC',
    standardTarget: '≥ 1.50 ม. จากทางเดิน/ประตู',
    detail: !bsc
      ? 'ยังไม่มีตู้ชีวนิรภัย BSC ในผัง'
      : bscClearance >= 1.5
        ? 'ตู้ BSC ตั้งอยู่ด้านในห่างจากแนวทางเดินหลัก ลดการรบกวนม่านอากาศ Laminar Flow'
        : 'ตู้ BSC ตั้งชิดแนวผนังด้านล่างใกล้ทางเดิน อาจถูกรบกวนกระแสลมเมื่อมีคนเดินผ่าน',
    focusPoint: bsc ? { x: bsc.x, z: bsc.z } : undefined,
  });

  // IC-04: Handwash sink proximity
  rules.push({
    id: 'rule-ic-04',
    code: 'IC-04',
    title: 'ระยะเข้าถึงอ่างล้างมือจากทุกโซนปฏิบัติการ',
    status: maxSinkDist <= 4.5 ? 'pass' : maxSinkDist <= 6.2 ? 'warn' : 'fail',
    measuredValue: `ไกลสุด ${maxSinkDist.toFixed(1)} ม.${worstZone ? ` (${worstZone.name})` : ''}`,
    standardTarget: '≤ 4.5 ม.',
    detail:
      maxSinkDist <= 4.5
        ? 'ทุกโซนปฏิบัติการมีอ่างล้างมืออยู่ในระยะเข้าถึงสะดวกตามเกณฑ์ IC'
        : `โซน ${worstZone?.name ?? ''} อยู่ห่างจากอ่างล้างมือเกินเกณฑ์ ควรเพิ่มอ่างล้างมือบริเวณรอยต่อโซน`,
    focusPoint: worstZone ? { x: worstZone.x, z: worstZone.z } : undefined,
  });

  // IC-05: Aisle clearance
  rules.push({
    id: 'rule-ic-05',
    code: 'LA-01',
    title: 'ความกว้างทางเดินและระยะห่างระหว่างโต๊ะเครื่องมือ',
    status: minAisle >= 1.2 ? 'pass' : minAisle >= 0.95 ? 'warn' : 'fail',
    measuredValue: `แคบสุด ${minAisle.toFixed(2)} ม.`,
    standardTarget: '≥ 1.20 ม.',
    detail:
      minAisle >= 1.2
        ? 'ความกว้างทางเดินหลักและระยะถอยหลังปฏิบัติงานผ่านเกณฑ์มาตรฐานห้องแลป LA'
        : 'พบช่วงทางเดินระหว่างแถวโต๊ะแคบกว่า 1.20 ม. ควรขยับโต๊ะเพื่อความสะดวกในการเข็นรถตัวอย่างและกรณีฉุกเฉิน',
  });

  // IC-06: Clean vs Waste path crossing
  rules.push({
    id: 'rule-ic-06',
    code: 'IC-05',
    title: 'เส้นทางขยะติดเชื้อไม่ตัดข้ามโซนสะอาดและสิ่งส่งตรวจ',
    status: crossings.length === 0 ? 'pass' : 'fail',
    measuredValue: crossings.length === 0 ? '0 จุดตัด' : `${crossings.length} จุดตัดเสี่ยง`,
    standardTarget: '0 จุดตัด (One-Way)',
    detail:
      crossings.length === 0
        ? 'การลำเลียงขยะติดเชื้อแยกไหลออกทางโซน Micro → Waste → ประตูหลัง โดยไม่ตัดผ่านโซนสะอาด'
        : crossings[0].description,
    focusPoint: crossings[0] ? { x: crossings[0].x, z: crossings[0].z } : undefined,
  });

  // IC-07: Phlebotomy patient isolation
  const bdToFront = bloodDraw && frontDoor ? dist2D(bloodDraw.x, bloodDraw.z, frontDoor.x, frontDoor.z) : 99;
  const bdToWaste = bloodDraw && waste ? dist2D(bloodDraw.x, bloodDraw.z, waste.x, waste.z) : 0;
  rules.push({
    id: 'rule-ic-07',
    code: 'LA-02',
    title: 'จุดเจาะเลือดผู้ป่วยใกล้ประตูหน้าและห่างโซนติดเชื้อ',
    status: bdToFront <= 5.5 && bdToWaste >= 14.0 ? 'pass' : 'warn',
    measuredValue: `ห่างห้องขยะ ${bdToWaste.toFixed(1)} ม.`,
    standardTarget: 'ใกล้ประตูหน้า & ห่างขยะ ≥ 14 ม.',
    detail:
      bdToFront <= 5.5 && bdToWaste >= 14.0
        ? 'ผู้ป่วยนอกเข้าห้องเจาะเลือดจากประตูหน้าได้ทันทีโดยไม่เดินลึกเข้าพื้นที่ตรวจวิเคราะห์'
        : 'ตำแหน่งห้องเจาะเลือดอยู่ห่างประตูหน้าหรือใกล้โซนติดเชื้อมากเกินไป',
    focusPoint: bloodDraw ? { x: bloodDraw.x, z: bloodDraw.z } : undefined,
  });

  return rules;
}

export function computeExecutiveMetrics(scenario: LabScenario): ExecutiveMetrics {
  const sumArea = (cat: LabZone['category']) =>
    Number(
      scenario.zones
        .filter((z) => z.category === cat)
        .reduce((acc, z) => acc + z.width * z.depth, 0)
        .toFixed(1),
    );

  const totalAreaSqm = Number((scenario.labWidth * scenario.labDepth).toFixed(1));
  const cleanAreaSqm = sumArea('clean');
  const dirtyAreaSqm = sumArea('dirty');
  const supportAreaSqm = sumArea('support');
  const staffAreaSqm = sumArea('staff');

  const { routes, crossings } = computeFlowAnalysis(scenario);
  const specimenRoute = routes.find((r) => r.type === 'specimen');
  const wasteRoute = routes.find((r) => r.type === 'waste');
  const staffRoute = routes.find((r) => r.type === 'staff');

  const rules = evaluateCompliance(scenario);
  const passedRules = rules.filter((r) => r.status === 'pass').length;
  const warnRules = rules.filter((r) => r.status === 'warn').length;
  const totalRules = rules.length;
  const complianceScorePct = Math.round(((passedRules + warnRules * 0.5) / totalRules) * 100);

  return {
    totalAreaSqm,
    cleanAreaSqm,
    dirtyAreaSqm,
    supportAreaSqm,
    staffAreaSqm,
    equipmentCount: scenario.equipment.length,
    sinkCount: scenario.equipment.filter((e) => e.type === 'sink').length,
    specimenPathMeters: specimenRoute?.lengthMeters ?? 0,
    wastePathMeters: wasteRoute?.lengthMeters ?? 0,
    staffPathMeters: staffRoute?.lengthMeters ?? 0,
    crossingsCount: crossings.length,
    minAisleClearanceM: computeMinAisleClearance(scenario),
    maxSinkDistanceM: computeMaxSinkDistance(scenario).maxDist,
    passedRules,
    totalRules,
    complianceScorePct,
  };
}
