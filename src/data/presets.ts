import type {
  EquipmentCatalogItem,
  LabEquipment,
  LabOpening,
  LabScenario,
  LabWall,
  LabZone,
} from '../types/lab';

const U = 40;
const CX = 500;
const CZ = 289;

const pxBox = (x: number, y: number, w: number, d: number) => ({
  x: Number(((x + w / 2 - CX) / U).toFixed(3)),
  z: Number(((y + d / 2 - CZ) / U).toFixed(3)),
  width: Number((w / U).toFixed(3)),
  depth: Number((d / U).toFixed(3)),
});

const pxPoint = (px: number, py: number) => ({
  x: Number(((px - CX) / U).toFixed(3)),
  z: Number(((py - CZ) / U).toFixed(3)),
});

const TE = '#5DCAA5';
const CO = '#F0997B';
const GR = '#B4B2A9';
const PU = '#AFA9EC';

const BASELINE_ZONES: LabZone[] = [
  {
    id: 'zone-analyzers',
    name: 'Analyzers',
    nameTh: 'ห้องเครื่องตรวจอัตโนมัติ',
    category: 'clean',
    ...pxBox(42, 66, 460, 110),
    color: TE,
    description: 'โซนตรวจวิเคราะห์หลัก (Coagulation, Chem BS-430 + ISE, CBC Mindray Autoload, UA และอ่างล้างมือติดหน้าต่าง)',
  },
  {
    id: 'zone-micro',
    name: 'Micro',
    nameTh: 'ห้องจุลชีววิทยา (ความเสี่ยงติดเชื้อ)',
    category: 'dirty',
    ...pxBox(518, 66, 336, 110),
    color: CO,
    description: 'โซน Hood ย้อม, Hood เตรียม และตู้ชีวนิรภัย BSC ติดกำแพงฝั่งหน้าต่าง',
  },
  {
    id: 'zone-waste',
    name: 'Waste',
    nameTh: 'ห้องพักขยะติดเชื้อ',
    category: 'dirty',
    ...pxBox(872, 66, 86, 110),
    color: CO,
    description: 'จุดรวบรวมขยะติดเชื้อและอ่างล้างก่อนนำออกทางประตูหลัง',
  },
  {
    id: 'zone-reception',
    name: 'Reception',
    nameTh: 'จุดรับสิ่งส่งตรวจ',
    category: 'support',
    ...pxBox(42, 186, 190, 148),
    color: GR,
    description: 'จุดคัดกรอง ลงทะเบียนสิ่งส่งตรวจ บานเลื่อนรับบัตร และจุดคอมผล/กล้องข้าง Reception',
  },
  {
    id: 'zone-prep',
    name: 'Prep',
    nameTh: 'โซนปั่นแยกและเตรียมตัวอย่าง',
    category: 'clean',
    ...pxBox(248, 186, 230, 148),
    color: TE,
    description: 'จุดปั่นเหวี่ยงแยกซีรัม (Centrifuge) และเตรียมแจกจ่ายตัวอย่าง',
  },
  {
    id: 'zone-rapid',
    name: 'Rapid+POCT',
    nameTh: 'โซนตรวจด่วน & POCT',
    category: 'clean',
    ...pxBox(494, 186, 130, 148),
    color: TE,
    description: 'ตรวจวิเคราะห์เร่งด่วนข้างเตียง (Troponin I MQ60, HbA1c BioHermes)',
  },
  {
    id: 'zone-hemo',
    name: 'Hemoculture',
    nameTh: 'โซน Hemoculture (เพาะเชื้อในเลือด)',
    category: 'clean',
    ...pxBox(632, 186, 84, 148),
    color: TE,
    description: 'ตู้เพาะเชื้อในเลือดอัตโนมัติ (Blood Culture Incubator)',
  },
  {
    id: 'zone-storage',
    name: 'Storage',
    nameTh: 'คลังน้ำยาและวัสดุ',
    category: 'support',
    ...pxBox(724, 186, 130, 148),
    color: GR,
    description: 'ตู้แช่น้ำยากระจก 2 บาน (2 ตู้) ควบคุมอุณหภูมิ 2–8°C และตู้เก็บวัสดุสิ้นเปลือง',
  },
  {
    id: 'zone-blood-draw',
    name: 'Blood draw',
    nameTh: 'ห้องเจาะเลือดผู้ป่วย',
    category: 'support',
    ...pxBox(42, 348, 180, 154),
    color: GR,
    description: 'จุดบริการเจาะเลือดผู้ป่วยนอกพร้อมเก้าอี้เจาะเลือดและประตูเข้าห้อง',
  },
  {
    id: 'zone-blood-bank',
    name: 'Blood bank',
    nameTh: 'คลังเลือด',
    category: 'clean',
    ...pxBox(238, 348, 160, 154),
    color: TE,
    description: 'โซนแมทช์เลือด (Cross-match) และตู้แช่เก็บเลือดขนาดเล็ก (สูง 1 เมตร)',
  },
  {
    id: 'zone-clean',
    name: 'Clean zone',
    nameTh: 'โซนรายงานผล / งานเอกสาร',
    category: 'support',
    ...pxBox(438, 348, 416, 154),
    color: GR,
    description: 'พื้นที่สะอาดสำหรับออกผลคอมคู่กล้องจุลทรรศน์ (LIS + Microscope) พร้อมตู้เอกสารด้านหลังเก้าอี้เจ้าหน้าที่',
  },
  {
    id: 'zone-staff',
    name: 'Staff room',
    nameTh: 'ห้องพักเจ้าหน้าที่',
    category: 'staff',
    ...pxBox(872, 186, 86, 316),
    color: PU,
    description: 'พื้นที่พักผ่อน ทานน้ำ และห้องเปลี่ยนชุด PPE แยกจากพื้นที่ปฏิบัติการ',
  },
];

const BASELINE_EQUIPMENT: LabEquipment[] = [
  // Analyzers + Top Wall Row (เอาแถวตู้โต๊ะกลางระหว่าง Analyzers-Reception ถึงหลังห้องออกทั้งหมด)
  { id: 'eq-an-b1', type: 'bench', label: 'Coagulation Bench', labelTh: 'โต๊ะวางเครื่อง Coagulation', zoneId: 'zone-analyzers', ...pxBox(52, 68, 122, 54), height: 0.55, baseY: 0, rotationDeg: 0 },
  { id: 'eq-an-b2', type: 'bench', label: 'CBC Analyzer Bench', labelTh: 'โต๊ะวางเครื่อง CBC Mindray', zoneId: 'zone-analyzers', ...pxBox(284, 68, 82, 54), height: 0.55, baseY: 0, rotationDeg: 0 },
  { id: 'eq-an-b3', type: 'bench', label: 'UA Analyzer Bench', labelTh: 'โต๊ะวางเครื่อง UA (ติดหน้าต่าง 2)', zoneId: 'zone-analyzers', ...pxBox(374, 68, 72, 54), height: 0.55, baseY: 0, rotationDeg: 0 },
  { id: 'eq-an-m1', type: 'analyzer', label: 'Coagulation analyzer', labelTh: 'Coagulation analyzer (ตรวจการแข็งตัวของเลือด)', zoneId: 'zone-analyzers', ...pxBox(62, 73, 86, 44), height: 0.36, baseY: 0.55, rotationDeg: 0, showNameTag: true },
  { id: 'eq-an-tower', type: 'analyzer', label: 'Chem BS-430 (ISE)', labelTh: 'Chem analyzer Mindray BS-430 (เคมีคลินิก + Electrolyte)', zoneId: 'zone-analyzers', ...pxBox(184, 68, 90, 52), height: 1.08, baseY: 0, rotationDeg: 0, showNameTag: true, notes: 'Mindray BS-430 ตรวจทั้งเคมีคลินิกและ Electrolyte (ISE) ในเครื่องเดียว' },
  { id: 'eq-an-cbc', type: 'analyzer', label: 'CBC Mindray (Autoload)', labelTh: 'CBC analyzer Mindray รุ่นเก่า (Autoload)', zoneId: 'zone-analyzers', ...pxBox(290, 73, 70, 44), height: 0.56, baseY: 0.55, rotationDeg: 0, showNameTag: true, notes: 'เครื่องตรวจ CBC อัตโนมัติ Mindray รุ่นเก่า รองรับชุด Autoloader วางในโซน Analyzers' },
  { id: 'eq-an-ua', type: 'analyzer', label: 'UA analyzer', labelTh: 'UA analyzer (ใกล้หน้าต่างระบายอากาศ)', zoneId: 'zone-analyzers', ...pxBox(380, 75, 60, 38), height: 0.24, baseY: 0.55, rotationDeg: 0, showNameTag: true, notes: 'ย้ายมาวางฝั่งหน้าต่างระบายอากาศ แยกออกจาก Clean Zone' },

  // Micro Zone (ชิดกำแพงฝั่งหน้าต่างด้านบน: UA -> อ่างล้างมือ -> Hood ย้อม -> Hood เตรียม -> BSC)
  { id: 'eq-mi-s1', type: 'sink', label: 'อ่างล้างมือ', labelTh: 'อ่างล้างมือ (ข้าง UA และ Hood ย้อม)', zoneId: 'zone-analyzers', ...pxBox(454, 68, 60, 38), height: 0.85, baseY: 0, rotationDeg: 0, showNameTag: true, notes: 'ตั้งชิดกำแพงฝั่งหน้าต่าง ถัดจาก UA และติดกับ Hood ย้อม' },
  { id: 'eq-mi-hood-stain', type: 'hood', label: 'Hood ย้อม', labelTh: 'Hood ย้อม (ข้างอ่างล้างมือ)', zoneId: 'zone-micro', ...pxBox(522, 68, 86, 38), height: 1.45, baseY: 0, rotationDeg: 0, showNameTag: true, notes: 'ตู้ดูดควันสำหรับงานย้อมสี ตั้งชิดกำแพงฝั่งหน้าต่างถัดจากอ่างล้างมือ' },
  { id: 'eq-mi-hood-prep', type: 'hood', label: 'Hood เตรียม', labelTh: 'Hood เตรียม (ชิดกำแพงหน้าต่าง)', zoneId: 'zone-micro', ...pxBox(618, 68, 86, 38), height: 1.45, baseY: 0, rotationDeg: 0, showNameTag: true, notes: 'ตู้ดูดควันสำหรับเตรียมตัวอย่าง/อาหารเลี้ยงเชื้อ ตั้งชิดกำแพงฝั่งหน้าต่าง' },
  { id: 'eq-mi-bsc', type: 'bsc', label: 'BSC (Class II)', labelTh: 'ตู้ชีวนิรภัย BSC (ชิดกำแพงหน้าต่าง)', zoneId: 'zone-micro', ...pxBox(714, 68, 90, 38), height: 1.47, baseY: 0, rotationDeg: 0, showNameTag: true, notes: 'ตู้ชีวนิรภัย Class II จำนวน 1 เครื่อง ตั้งชิดกำแพงฝั่งหน้าต่างด้านบน' },
  { id: 'eq-mi-bin1', type: 'bin', label: 'Biohazard Bin 1', labelTh: 'ถังขยะติดเชื้อ 1', zoneId: 'zone-micro', ...pxPoint(834, 82), width: 0.38, depth: 0.38, height: 0.48, baseY: 0, rotationDeg: 0, color: '#d13b3b' },
  { id: 'eq-mi-bin2', type: 'bin', label: 'Biohazard Bin 2', labelTh: 'ถังขยะติดเชื้อ 2', zoneId: 'zone-micro', ...pxPoint(834, 110), width: 0.38, depth: 0.38, height: 0.48, baseY: 0, rotationDeg: 0, color: '#d13b3b' },

  // Waste Zone (เว้นทางออกประตูหลังฝั่งหน้าต่าง)
  { id: 'eq-wa-bin1', type: 'bin', label: 'Infectious Drum 1', labelTh: 'ถังพักขยะติดเชื้อหลัก 1', zoneId: 'zone-waste', ...pxPoint(886, 86), width: 0.38, depth: 0.38, height: 0.48, baseY: 0, rotationDeg: 0, color: '#d13b3b' },
  { id: 'eq-wa-bin2', type: 'bin', label: 'Infectious Drum 2', labelTh: 'ถังพักขยะติดเชื้อหลัก 2', zoneId: 'zone-waste', ...pxPoint(886, 114), width: 0.38, depth: 0.38, height: 0.48, baseY: 0, rotationDeg: 0, color: '#d13b3b' },
  { id: 'eq-wa-sharp', type: 'cabinet', label: 'Sharps Container Box', labelTh: 'กล่องทิ้งของมีคม (Sharps)', zoneId: 'zone-waste', ...pxBox(914, 106, 40, 22), height: 0.3, baseY: 0, rotationDeg: 0, color: '#f2c14e' },
  { id: 'eq-wa-sink', type: 'sink', label: 'Waste Utility Sink', labelTh: 'อ่างล้างอุปกรณ์ขยะ', zoneId: 'zone-waste', ...pxBox(880, 140, 72, 28), height: 0.85, baseY: 0, rotationDeg: 0 },

  // Reception Zone (ขยับขึ้นมาชิดแนวทางเดินหลังเอาแถวตู้กลางออก)
  { id: 'eq-re-desk', type: 'bench', label: 'Reception Front Desk', labelTh: 'โต๊ะรับแลป (หันไปด้านหน้า)', zoneId: 'zone-reception', ...pxBox(54, 198, 46, 120), height: 0.55, baseY: 0, rotationDeg: 0, notes: 'หันหน้าเข้าหาหน้าต่างบานเลื่อนรับบัตรคนไข้และรับสิ่งส่งตรวจหน้าห้อง' },
  { id: 'eq-re-pc1', type: 'pc', label: 'LIS รับแลป 1', labelTh: 'คอมพิวเตอร์รับแลป 1', zoneId: 'zone-reception', ...pxBox(58, 208, 36, 44), height: 0.4, baseY: 0.55, rotationDeg: 90 },
  { id: 'eq-re-pc2', type: 'pc', label: 'LIS รับแลป 2', labelTh: 'คอมพิวเตอร์รับแลป 2', zoneId: 'zone-reception', ...pxBox(58, 264, 36, 44), height: 0.4, baseY: 0.55, rotationDeg: 90 },
  { id: 'eq-re-ch1', type: 'officeChair', label: 'เก้าอี้รับแลป 1', labelTh: 'เก้าอี้เจ้าหน้าที่รับแลป 1', zoneId: 'zone-reception', ...pxBox(108, 216, 28, 28), height: 0.72, baseY: 0, rotationDeg: -90 },
  { id: 'eq-re-ch2', type: 'officeChair', label: 'เก้าอี้รับแลป 2', labelTh: 'เก้าอี้เจ้าหน้าที่รับแลป 2', zoneId: 'zone-reception', ...pxBox(108, 272, 28, 28), height: 0.72, baseY: 0, rotationDeg: -90 },
  { id: 'eq-re-rack', type: 'rack', label: 'Specimen Triage Rack', labelTh: 'ชั้นแยกหลอดสิ่งส่งตรวจ', zoneId: 'zone-reception', ...pxBox(162, 196, 56, 44), height: 0.75, baseY: 0, rotationDeg: 0 },
  { id: 'eq-re-bar', type: 'bench', label: 'โต๊ะคอมผล/กล้อง', labelTh: 'โต๊ะคอมผลและกล้อง (ข้าง Reception)', zoneId: 'zone-reception', ...pxBox(162, 248, 58, 80), height: 0.55, baseY: 0, rotationDeg: 0, notes: 'จุดคอมพิวเตอร์ลงผลและกล้องจุลทรรศน์ข้างจุดรับแลป' },
  { id: 'eq-re-pc-res', type: 'pc', label: 'คอมผล (ข้าง Reception)', labelTh: 'คอมพิวเตอร์ออกผล (ข้าง Reception)', zoneId: 'zone-reception', ...pxBox(168, 252, 42, 34), height: 0.4, baseY: 0.55, rotationDeg: -90, showNameTag: true },
  { id: 'eq-re-scope', type: 'microscope', label: 'กล้องจุลทรรศน์ (Reception)', labelTh: 'กล้องจุลทรรศน์ (ข้างคอมผล Reception)', zoneId: 'zone-reception', ...pxBox(172, 290, 36, 30), height: 0.36, baseY: 0.55, rotationDeg: -90, showNameTag: true },

  // Prep Zone
  { id: 'eq-pr-b1', type: 'bench', label: 'Centrifuge Bench', labelTh: 'โต๊ะเครื่องปั่นเหวี่ยง', zoneId: 'zone-prep', ...pxBox(260, 210, 206, 40), height: 0.55, baseY: 0, rotationDeg: 0 },
  { id: 'eq-pr-c1', type: 'centrifuge', label: 'Centrifuge 1', labelTh: 'เครื่องปั่นเหวี่ยง 1', zoneId: 'zone-prep', ...pxBox(264, 214, 58, 34), height: 0.35, baseY: 0.55, rotationDeg: 0 },
  { id: 'eq-pr-c2', type: 'centrifuge', label: 'Centrifuge 2', labelTh: 'เครื่องปั่นเหวี่ยง 2', zoneId: 'zone-prep', ...pxBox(330, 214, 58, 34), height: 0.35, baseY: 0.55, rotationDeg: 0 },
  { id: 'eq-pr-b2', type: 'bench', label: 'Aliquot Bench', labelTh: 'โต๊ะแบ่งตัวอย่าง (Aliquot)', zoneId: 'zone-prep', ...pxBox(260, 262, 206, 28), height: 0.55, baseY: 0, rotationDeg: 0 },

  // Rapid + POCT
  { id: 'eq-ra-b1', type: 'bench', label: 'POCT Bench 1', labelTh: 'โต๊ะเครื่องตรวจ POCT 1', zoneId: 'zone-rapid', ...pxBox(504, 210, 48, 46), height: 0.55, baseY: 0, rotationDeg: 0 },
  { id: 'eq-ra-an', type: 'analyzer', label: 'Troponin I MQ60', labelTh: 'Troponin I analyzer MQ60 (POCT ตั้งโต๊ะ)', zoneId: 'zone-rapid', ...pxPoint(528, 233), width: 0.48, depth: 0.42, height: 0.28, baseY: 0.55, rotationDeg: 0, showNameTag: true, notes: 'เครื่องตรวจ Troponin I (MQ60) แบบ POCT ขนาดตั้งโต๊ะ' },
  { id: 'eq-ra-b2', type: 'bench', label: 'POCT Bench 2', labelTh: 'โต๊ะเครื่องตรวจ POCT 2', zoneId: 'zone-rapid', ...pxBox(504, 266, 48, 44), height: 0.55, baseY: 0, rotationDeg: 0 },
  { id: 'eq-ra-hba1c', type: 'analyzer', label: 'HbA1c BioHermes', labelTh: 'HbA1c analyzer BioHermes (POCT ตั้งโต๊ะ)', zoneId: 'zone-rapid', ...pxPoint(528, 288), width: 0.46, depth: 0.4, height: 0.26, baseY: 0.55, rotationDeg: 0, showNameTag: true, notes: 'เครื่องตรวจ HbA1c (BioHermes) แบบ POCT ขนาดตั้งโต๊ะ' },
  { id: 'eq-ra-sh', type: 'shelf', label: 'POCT Kit Shelf', labelTh: 'ชั้นเก็บชุดตรวจ POCT', zoneId: 'zone-rapid', ...pxBox(562, 226, 22, 48), height: 1.25, baseY: 0, rotationDeg: 0 },

  // Hemoculture (ตู้ขนาดเล็กเท่าตู้แช่คลังเลือด + โต๊ะเล็กด้านข้าง)
  { id: 'eq-he-line', type: 'hemoLine', label: 'Hemoculture', labelTh: 'ตู้ Hemoculture ขนาดเล็ก (สูง 1 ม.)', zoneId: 'zone-hemo', ...pxBox(638, 224, 34, 30), height: 1.0, baseY: 0, rotationDeg: -90, showNameTag: true, notes: 'ตู้เพาะเชื้อในเลือดอัตโนมัติขนาดเล็กเท่าตู้แช่คลังเลือด' },
  { id: 'eq-he-bench', type: 'bench', label: 'โต๊ะวางขวดเพาะเชื้อ', labelTh: 'โต๊ะเล็กข้าง Hemoculture', zoneId: 'zone-hemo', ...pxBox(676, 224, 26, 28), height: 0.55, baseY: 0, rotationDeg: 0 },

  // Storage (ตู้แช่น้ำยาเป็นตู้กระจกแบบประตูสองบาน 2 ตู้ หันหน้าออกหาโซนทำงาน + ชั้นวางของ 2 ตัว)
  { id: 'eq-st-fr1', type: 'doubleGlassFridge', label: 'Reagent Fridge 1', labelTh: 'ตู้แช่น้ำยากระจก 2 บาน 1', zoneId: 'zone-storage', ...pxBox(734, 196, 50, 32), height: 1.6, baseY: 0, rotationDeg: 180, showNameTag: true, notes: 'ตู้แช่เก็บน้ำยาบานประตูกระจกคู่ 2 บาน ควบคุมอุณหภูมิ 2–8°C (ตู้ที่ 1 หันออกหาโซนทำงาน)' },
  { id: 'eq-st-fr2', type: 'doubleGlassFridge', label: 'Reagent Fridge 2', labelTh: 'ตู้แช่น้ำยากระจก 2 บาน 2', zoneId: 'zone-storage', ...pxBox(792, 196, 50, 32), height: 1.6, baseY: 0, rotationDeg: 180, showNameTag: true, notes: 'ตู้แช่เก็บน้ำยาบานประตูกระจกคู่ 2 บาน ควบคุมอุณหภูมิ 2–8°C (ตู้ที่ 2 หันออกหาโซนทำงาน)' },
  { id: 'eq-st-cab', type: 'shelf', label: 'Dry Supply Shelf', labelTh: 'ชั้นวางวัสดุปลอดเชื้อ', zoneId: 'zone-storage', ...pxBox(734, 252, 48, 64), height: 1.3, baseY: 0, rotationDeg: 0, notes: 'ชั้นวางวัสดุปลอดเชื้อสำหรับเก็บเวชภัณฑ์และอุปกรณ์แลป' },
  { id: 'eq-st-sh', type: 'shelf', label: 'Bulk Storage Shelf', labelTh: 'ชั้นวางคลังพัสดุ', zoneId: 'zone-storage', ...pxBox(792, 252, 48, 64), height: 1.3, baseY: 0, rotationDeg: 0 },

  // Blood Draw (ไม่มีอ่างล้างมือในห้องเจาะเลือด)
  { id: 'eq-bd-ch', type: 'chair', label: 'Phlebotomy Chair', labelTh: 'เก้าอี้เจาะเลือดผู้ป่วย', zoneId: 'zone-blood-draw', ...pxBox(118, 368, 46, 36), height: 0.76, baseY: 0, rotationDeg: 0 },
  { id: 'eq-bd-b1', type: 'bench', label: 'Phlebotomy Supply Bench', labelTh: 'โต๊ะเตรียมอุปกรณ์เจาะเลือด', zoneId: 'zone-blood-draw', ...pxBox(112, 446, 100, 30), height: 0.55, baseY: 0, rotationDeg: 0 },

  // Blood Bank (มีแค่โซนแมทช์กับตู้แช่ขนาดเล็กสูง 1 เมตร ตั้งชิดกำแพงด้านล่าง)
  { id: 'eq-bb-b1', type: 'bench', label: 'โซนแมทช์ (Cross-match)', labelTh: 'โต๊ะแมทช์เลือด (Cross-match)', zoneId: 'zone-blood-bank', ...pxBox(242, 470, 102, 40), height: 0.55, baseY: 0, rotationDeg: 180, showNameTag: true },
  { id: 'eq-bb-fr', type: 'fridge', label: 'ตู้แช่ขนาดเล็ก (1 ม.)', labelTh: 'ตู้แช่คลังเลือดขนาดเล็ก (สูง 1 เมตร)', zoneId: 'zone-blood-bank', ...pxBox(348, 478, 36, 32), height: 1.0, baseY: 0, rotationDeg: 180, showNameTag: true },
  { id: 'eq-bb-clean-sink', type: 'sink', label: 'อ่างล้างมือ', labelTh: 'อ่างล้างมือ (ระหว่าง Clean Zone กับ Blood Bank)', zoneId: 'zone-clean', ...pxBox(392, 476, 54, 34), height: 0.85, baseY: 0, rotationDeg: 180, showNameTag: true, notes: 'อ่างล้างมือตั้งชิดผนังด้านล่างระหว่างโซน Blood Bank และ Clean Zone' },

  // Clean Zone: กล้องตั้งคู่คอมออกผล + เก้าอี้เจ้าหน้าที่ + ตู้เอกสารด้านหลังเก้าอี้
  { id: 'eq-cl-desk', type: 'bench', label: 'LIS & Slide Bench', labelTh: 'โต๊ะออกผลคอมคู่กล้องจุลทรรศน์', zoneId: 'zone-clean', ...pxBox(452, 362, 384, 42), height: 0.55, baseY: 0, rotationDeg: 0 },
  { id: 'eq-cl-pc1', type: 'pc', label: 'LIS ออกผล 1', labelTh: 'คอมพิวเตอร์ออกผล LIS 1 (คู่กล้อง 1)', zoneId: 'zone-clean', ...pxBox(468, 366, 74, 34), height: 0.4, baseY: 0.55, rotationDeg: 0, showNameTag: true },
  { id: 'eq-cl-sc1', type: 'microscope', label: 'ดูกล้อง (Microscope)', labelTh: 'กล้องจุลทรรศน์ 1 (ตั้งคู่คอมออกผล 1)', zoneId: 'zone-clean', ...pxBox(552, 366, 38, 32), height: 0.36, baseY: 0.55, rotationDeg: 0, showNameTag: true },
  { id: 'eq-cl-pc2', type: 'pc', label: 'LIS ออกผล 2', labelTh: 'คอมพิวเตอร์ออกผล LIS 2 (คู่กล้อง 2)', zoneId: 'zone-clean', ...pxBox(688, 366, 74, 34), height: 0.4, baseY: 0.55, rotationDeg: 0 },
  { id: 'eq-cl-sc2', type: 'microscope', label: 'Slide Microscope 2', labelTh: 'กล้องจุลทรรศน์ 2 (ตั้งคู่คอมออกผล 2)', zoneId: 'zone-clean', ...pxBox(772, 366, 38, 32), height: 0.36, baseY: 0.55, rotationDeg: 0 },
  { id: 'eq-cl-ch1', type: 'officeChair', label: 'เก้าอี้เจ้าหน้าที่ 1', labelTh: 'เก้าอี้เจ้าหน้าที่ชุดออกผล-กล้อง 1', zoneId: 'zone-clean', ...pxBox(514, 414, 30, 30), height: 0.72, baseY: 0, rotationDeg: 180 },
  { id: 'eq-cl-ch2', type: 'officeChair', label: 'เก้าอี้เจ้าหน้าที่ 2', labelTh: 'เก้าอี้เจ้าหน้าที่ชุดออกผล-กล้อง 2', zoneId: 'zone-clean', ...pxBox(734, 414, 30, 30), height: 0.72, baseY: 0, rotationDeg: 180 },
  { id: 'eq-cl-cab1', type: 'docCabinet', label: 'ตู้เอกสาร 1', labelTh: 'ตู้เอกสารกึ่งทึบกึ่งกระจก 1 (หันเข้าห้อง)', zoneId: 'zone-clean', ...pxBox(454, 472, 120, 34), height: 1.3, baseY: 0, rotationDeg: 180, color: '#b5bcc0' },
  { id: 'eq-cl-cab2', type: 'docCabinet', label: 'ตู้เอกสาร 2', labelTh: 'ตู้เอกสารกึ่งทึบกึ่งกระจก 2 (หันเข้าห้อง)', zoneId: 'zone-clean', ...pxBox(584, 472, 120, 34), height: 1.3, baseY: 0, rotationDeg: 180, color: '#b5bcc0' },
  { id: 'eq-cl-cab3', type: 'docCabinet', label: 'ตู้เอกสารคุณภาพ LA', labelTh: 'ตู้เอกสารคุณภาพ LA กึ่งทึบกึ่งกระจก (หันเข้าห้อง)', zoneId: 'zone-clean', ...pxBox(714, 472, 120, 34), height: 1.3, baseY: 0, rotationDeg: 180, color: '#b5bcc0', showNameTag: true },

  // Staff Room
  { id: 'eq-sf-b1', type: 'bench', label: 'Staff Break Table', labelTh: 'โต๊ะพักเจ้าหน้าที่', zoneId: 'zone-staff', ...pxBox(882, 220, 66, 56), height: 0.55, baseY: 0, rotationDeg: 0 },
  { id: 'eq-sf-cab', type: 'cabinet', label: 'Staff Lockers', labelTh: 'ตู้ล็อกเกอร์เจ้าหน้าที่', zoneId: 'zone-staff', ...pxBox(882, 284, 66, 48), height: 1.35, baseY: 0, rotationDeg: 0, color: '#7d98ad' },
  { id: 'eq-sf-b2', type: 'bench', label: 'Pantry Counter', labelTh: 'เคาน์เตอร์เตรียมเครื่องดื่ม', zoneId: 'zone-staff', ...pxBox(882, 340, 66, 48), height: 0.55, baseY: 0, rotationDeg: 0 },
  { id: 'eq-sf-sink', type: 'sink', label: 'Staff Room Sink', labelTh: 'อ่างล้างมือห้องพัก', zoneId: 'zone-staff', ...pxBox(882, 402, 66, 30), height: 0.85, baseY: 0, rotationDeg: 0 },
];

const BASELINE_WALLS: LabWall[] = [
  // Top window wall with waste exit door on the same side as windows
  { id: 'w-top-1', ...pxBox(28, 58, 870, 4), height: 1.7, opacity: 0.16, isExterior: true },
  { id: 'w-top-2', ...pxBox(944, 58, 28, 4), height: 1.7, opacity: 0.16, isExterior: true },
  { id: 'w-bottom', ...pxBox(28, 516, 944, 4), height: 1.7, opacity: 0.16, isExterior: true },
  // Left wall with staff front door, sliding ticket/specimen window at Reception + door at Blood draw
  { id: 'w-left-1a', ...pxBox(28, 60, 4, 80), height: 1.7, opacity: 0.16, isExterior: true },
  { id: 'w-left-1b', ...pxBox(28, 186, 4, 18), height: 1.7, opacity: 0.16, isExterior: true },
  { id: 'w-left-2', ...pxBox(28, 298, 4, 94), height: 1.7, opacity: 0.16, isExterior: true },
  { id: 'w-left-3', ...pxBox(28, 438, 4, 80), height: 1.7, opacity: 0.16, isExterior: true },
  // Right wall with rear exit door for Staff room
  { id: 'w-right-1', ...pxBox(968, 60, 4, 386), height: 1.7, opacity: 0.16, isExterior: true },
  { id: 'w-right-2', ...pxBox(968, 492, 4, 26), height: 1.7, opacity: 0.16, isExterior: true },
  // Interior partitions (โซน Micro ไม่ได้กั้นห้องล่างในผังฐาน)
  { id: 'w-int-bd-rec-1', ...pxBox(42, 340, 52, 4), height: 1.7, opacity: 0.28 },
  { id: 'w-int-bd-rec-2', ...pxBox(174, 340, 52, 4), height: 1.7, opacity: 0.28 },
  { id: 'w-int-waste-l', ...pxBox(868, 66, 4, 110), height: 1.7, opacity: 0.3 },
  { id: 'w-int-waste-b', ...pxBox(868, 176, 92, 4), height: 1.7, opacity: 0.3 },
  { id: 'w-int-staff-l', ...pxBox(868, 184, 4, 318), height: 1.7, opacity: 0.3 },
  { id: 'w-int-staff-t', ...pxBox(868, 184, 92, 4), height: 1.7, opacity: 0.3 },
];

const BASELINE_OPENINGS: LabOpening[] = [
  { id: 'op-staff-front-door', kind: 'frontDoor', label: 'ประตูหน้า (เจ้าหน้าที่)', labelTh: 'ประตูหน้าสำหรับเจ้าหน้าที่', ...pxBox(28, 140, 4, 46), color: '#6D28D9' },
  { id: 'op-front-door', kind: 'frontDoor', label: 'ประตูเข้า (เจาะเลือด)', labelTh: 'ประตูเข้าห้อง (ฝั่งเจาะเลือด)', ...pxBox(28, 392, 4, 46), color: '#1D9E75' },
  { id: 'op-front-sliding', kind: 'slidingWindow', label: 'บานเลื่อนรับบัตร/แลป', labelTh: 'หน้าต่างบานเลื่อนรับบัตรคนไข้/รับแลปหน้าห้อง', ...pxBox(28, 204, 6, 94), color: '#38BDF8' },
  { id: 'op-bd-rec-sliding', kind: 'slidingWindow', label: 'บานเลื่อน เจาะเลือด↔รับแลป', labelTh: 'หน้าต่างบานเลื่อนระหว่างห้องเจาะเลือดกับห้องรับแลป', ...pxBox(94, 339, 80, 6), color: '#38BDF8' },
  { id: 'op-back-door', kind: 'backDoor', label: 'ประตูหลัง (flow ขยะ)', labelTh: 'ประตูหลัง flow ขยะติดเชื้อ (ฝั่งหน้าต่าง)', ...pxBox(898, 58, 46, 4), color: '#D85A30' },
  { id: 'op-staff-back-door', kind: 'backDoor', label: 'ประตูหลัง (ห้องพักเจ้าหน้าที่)', labelTh: 'ประตูออกด้านหลังสำหรับห้องพักเจ้าหน้าที่', ...pxBox(968, 446, 4, 46), color: '#6D28D9' },
  { id: 'op-win-1', kind: 'window', label: 'Window 1', labelTh: 'หน้าต่างระบายอากาศ 1', ...pxBox(120, 58, 240, 4), color: '#85B7EB' },
  { id: 'op-win-2', kind: 'window', label: 'Window 2', labelTh: 'หน้าต่างระบายอากาศ 2', ...pxBox(380, 58, 240, 4), color: '#85B7EB' },
  { id: 'op-win-3', kind: 'window', label: 'Window 3', labelTh: 'หน้าต่างระบายอากาศ 3', ...pxBox(640, 58, 220, 4), color: '#85B7EB' },
];

function cloneScenarioData(): Pick<LabScenario, 'zones' | 'equipment' | 'walls' | 'openings'> {
  return {
    zones: BASELINE_ZONES.map((z) => ({ ...z })),
    equipment: BASELINE_EQUIPMENT.map((e) => ({ ...e })),
    walls: BASELINE_WALLS.map((w) => ({ ...w })),
    openings: BASELINE_OPENINGS.map((o) => ({ ...o })),
  };
}

function buildIcOptimizedScenario(): LabScenario {
  const base = cloneScenarioData();
  // 1. Widen main corridor spacing by compacting Prep aliquot bench slightly downward
  const prBench2 = base.equipment.find((e) => e.id === 'eq-pr-b2');
  if (prBench2) {
    prBench2.z = Number((prBench2.z + 0.15).toFixed(3));
  }
  // 2. Add negative-pressure partition walls for Micro enclosure proposal
  base.walls.push(
    {
      id: 'w-int-micro-b',
      ...pxBox(516, 178, 340, 4),
      height: 1.7,
      opacity: 0.35,
    },
    {
      id: 'w-int-micro-l',
      ...pxBox(516, 66, 4, 114),
      height: 1.7,
      opacity: 0.35,
    },
  );

  return {
    id: 'scenario-ic-optimized',
    name: 'ทางเลือก B: IC-Optimized (One-Way Flow)',
    subtitle: 'แยกผนังกั้นห้อง Micro 100% ปรับทางเดินโซน Prep และคงตำแหน่ง BSC ชิดกำแพง',
    isBuiltIn: true,
    labWidth: 23.7,
    labDepth: 11.6,
    ...base,
    updatedAt: new Date().toISOString(),
  };
}

export const DEFAULT_SCENARIOS: LabScenario[] = [
  {
    id: 'scenario-baseline',
    name: 'ผังฐาน: แบบ ER เก่า (ต้นฉบับ)',
    subtitle: 'ผังห้องแลปกลาง 12 โซน ปรับพื้นที่กระชับตามขนาดห้องจริงและเอาแถวตู้กลางออก',
    isBuiltIn: true,
    labWidth: 23.7,
    labDepth: 11.6,
    ...cloneScenarioData(),
    updatedAt: new Date().toISOString(),
  },
  buildIcOptimizedScenario(),
];

export const EQUIPMENT_CATALOG: EquipmentCatalogItem[] = [
  {
    type: 'sink',
    label: 'Handwash Sink',
    labelTh: 'อ่างล้างมือ IC',
    width: 1.6,
    depth: 0.75,
    height: 0.85,
    baseY: 0,
    summary: 'อ่างล้างมือมาตรฐาน IC พร้อมก๊อกน้ำสแตนเลส',
  },
  {
    type: 'bench',
    label: 'Lab Work Bench',
    labelTh: 'โต๊ะปฏิบัติการเคมีทนกรด',
    width: 2.4,
    depth: 0.85,
    height: 0.55,
    baseY: 0,
    summary: 'โต๊ะปฏิบัติการหน้าท็อปอีพ็อกซี่',
  },
  {
    type: 'analyzer',
    label: 'Chem BS-430 (ISE)',
    labelTh: 'Chem analyzer Mindray BS-430',
    width: 2.3,
    depth: 1.3,
    height: 1.08,
    baseY: 0,
    summary: 'ตรวจเคมีคลินิกและ Electrolyte (ISE) ในเครื่องเดียว',
    showNameTag: true,
  },
  {
    type: 'analyzer',
    label: 'CBC Mindray (Autoload)',
    labelTh: 'CBC analyzer Mindray (Autoload)',
    width: 1.75,
    depth: 1.1,
    height: 0.56,
    baseY: 0.55,
    summary: 'เครื่องตรวจ CBC รุ่นเก่าพร้อมชุด Autoloader (ตั้งโต๊ะ)',
    showNameTag: true,
  },
  {
    type: 'hemoLine',
    label: 'Hemoculture',
    labelTh: 'เครื่อง Hemoculture (เพาะเชื้อในเลือด)',
    width: 0.9,
    depth: 0.8,
    height: 1.0,
    baseY: 0,
    summary: 'ตู้เพาะเชื้อในเลือดอัตโนมัติขนาดเล็ก',
    showNameTag: true,
  },
  {
    type: 'analyzer',
    label: 'UA analyzer',
    labelTh: 'UA analyzer (ตั้งโต๊ะ)',
    width: 1.5,
    depth: 0.65,
    height: 0.24,
    baseY: 0.55,
    summary: 'เครื่องตรวจปัสสาวะอัตโนมัติวางบนโต๊ะ',
    showNameTag: true,
  },
  {
    type: 'analyzer',
    label: 'Coagulation analyzer',
    labelTh: 'Coagulation analyzer (ตั้งโต๊ะ)',
    width: 1.6,
    depth: 0.9,
    height: 0.36,
    baseY: 0.55,
    summary: 'เครื่องตรวจการแข็งตัวของเลือดวางบนโต๊ะ',
    showNameTag: true,
  },
  {
    type: 'analyzer',
    label: 'Troponin I MQ60',
    labelTh: 'Troponin I MQ60 (POCT ตั้งโต๊ะ)',
    width: 0.48,
    depth: 0.42,
    height: 0.28,
    baseY: 0.55,
    summary: 'เครื่องตรวจ Troponin I MQ60 ขนาดตั้งโต๊ะ',
    showNameTag: true,
  },
  {
    type: 'analyzer',
    label: 'HbA1c BioHermes',
    labelTh: 'HbA1c BioHermes (POCT ตั้งโต๊ะ)',
    width: 0.46,
    depth: 0.4,
    height: 0.26,
    baseY: 0.55,
    summary: 'เครื่องตรวจ HbA1c BioHermes ขนาดตั้งโต๊ะ',
    showNameTag: true,
  },
  {
    type: 'bsc',
    label: 'BSC (Class II)',
    labelTh: 'ตู้ชีวนิรภัย BSC Class II',
    width: 2.1,
    depth: 0.9,
    height: 1.47,
    baseY: 0,
    summary: 'ตู้กรองอากาศ HEPA ป้องกันเชื้อแพร่กระจาย (วางชิดกำแพง)',
    showNameTag: true,
  },
  {
    type: 'hood',
    label: 'Fume Hood',
    labelTh: 'ตู้ดูดควัน (Hood ย้อม / Hood เตรียม)',
    width: 2.1,
    depth: 0.9,
    height: 1.45,
    baseY: 0,
    summary: 'ตู้ดูดไอสารเคมีและกลิ่นสำหรับงานย้อมสีหรือเตรียมตัวอย่าง',
    showNameTag: true,
  },
  {
    type: 'bin',
    label: 'Biohazard Bin',
    labelTh: 'ถังขยะติดเชื้อ (แดง)',
    width: 0.42,
    depth: 0.42,
    height: 0.5,
    baseY: 0,
    defaultColor: '#d13b3b',
    summary: 'ถังแยกขยะติดเชื้อฝาปิดมิดชิด',
  },
  {
    type: 'doubleGlassFridge',
    label: 'Double-Door Glass Refrigerator',
    labelTh: 'ตู้แช่น้ำยากระจก 2 บาน (2–8°C)',
    width: 1.25,
    depth: 0.8,
    height: 1.6,
    baseY: 0,
    defaultColor: '#f8fafc',
    summary: 'ตู้แช่เก็บน้ำยาบานประตูกระจกคู่ 2 บาน ควบคุมอุณหภูมิ 2–8°C',
    showNameTag: true,
  },
  {
    type: 'fridge',
    label: 'Lab Refrigerator',
    labelTh: 'ตู้เย็นเก็บเลือด/น้ำยา',
    width: 1.2,
    depth: 0.9,
    height: 1.25,
    baseY: 0,
    summary: 'ตู้เย็นควบคุมอุณหภูมิ 2–8°C',
  },
  {
    type: 'centrifuge',
    label: 'Benchtop Centrifuge',
    labelTh: 'เครื่องปั่นเหวี่ยงแยกตัวอย่าง',
    width: 0.9,
    depth: 0.75,
    height: 0.35,
    baseY: 0.55,
    summary: 'เครื่องปั่นเหวี่ยงชนิดวางบนโต๊ะปฏิบัติการ',
  },
  {
    type: 'microscope',
    label: 'Binocular Microscope',
    labelTh: 'กล้องจุลทรรศน์',
    width: 0.7,
    depth: 0.55,
    height: 0.36,
    baseY: 0.55,
    summary: 'กล้องจุลทรรศน์ชนิดวางบนโต๊ะปฏิบัติการ',
  },
  {
    type: 'pc',
    label: 'LIS Workstation',
    labelTh: 'ชุดคอมพิวเตอร์ LIS',
    width: 1.2,
    depth: 0.65,
    height: 0.4,
    baseY: 0.55,
    summary: 'สถานีบันทึกและรายงานผล LIS',
  },
  {
    type: 'docCabinet',
    label: 'Document Cabinet (Half-Glass)',
    labelTh: 'ตู้เอกสารกึ่งทึบกึ่งกระจก',
    width: 3.0,
    depth: 0.85,
    height: 1.3,
    baseY: 0,
    defaultColor: '#b5bcc0',
    summary: 'ตู้เอกสารท่อนล่างบานทึบ ท่อนบนบานกระจกใสเห็นแฟ้มด้านใน',
  },
  {
    type: 'shelf',
    label: 'Storage Rack',
    labelTh: 'ชั้นวางวัสดุ 4 ชั้น',
    width: 1.2,
    depth: 0.75,
    height: 1.35,
    baseY: 0,
    summary: 'ชั้นวางเหล็กเก็บกล่องน้ำยาและวัสดุ',
  },
  {
    type: 'chair',
    label: 'Phlebotomy Chair',
    labelTh: 'เก้าอี้เจาะเลือด',
    width: 1.0,
    depth: 0.85,
    height: 0.75,
    baseY: 0,
    summary: 'เก้าอี้เจาะเลือดพร้อมที่วางแขน',
  },
];
