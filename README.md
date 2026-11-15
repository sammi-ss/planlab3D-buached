# Central Lab Digital Twin Planner · แบบห้องแลปกลาง (ER เก่า)

เว็บแอปพลิเคชัน 3D Digital Twin สำหรับจำลองและวางแผนย้ายห้องปฏิบัติการกลาง (Central Laboratory) พร้อมการตรวจสอบมาตรฐาน IC/LA (Infection Control & Laboratory Accreditation), ระบบจำลองเส้นทางสิ่งส่งตรวจ/ขยะ/บุคลากร และเครื่องมือจัดวางครุภัณฑ์

---

## 🚀 การ Deploy ขึ้น GitHub Pages (อัตโนมัติ)

โปรเจกต์นี้ได้รับการตั้งค่าพร้อม Deploy บน GitHub Pages ทันทีเมื่อ Push โค้ดขึ้น GitHub:

### ขั้นตอนการเปิดใช้งานบน GitHub:
1. เข้าไปที่คลังข้อมูล (Repository) ของคุณบน GitHub: `Settings` > `Pages`
2. ในหัวข้อ **Build and deployment**:
   - **Source**: เลือก `GitHub Actions`
3. เมื่อคุณ Push หรือ Merge โค้ดเข้าสู่สาขา `main` เวิร์กโฟลว์ใน `.github/workflows/deploy.yml` จะทำการ:
   - ตรวจสอบ Unit Test (`npm test`)
   - คอมไพล์และสร้าง Production Bundle (`npm run build`)
   - อัปโหลดและเผยแพร่ไปยัง GitHub Pages อัตโนมัติ

---

## 🛠 คำสั่งพัฒนาในเครื่อง (Local Development)

```bash
# ติดตั้ง dependencies
npm install

# รัน Development Server (พอร์ต 3000)
npm run dev

# รันการทดสอบ Unit Test (Vitest)
npm test

# ตรวจสอบ TypeScript Types & Linter
npm run lint

# สร้าง Production Build (ไฟล์จะถูกสร้างในโฟลเดอร์ dist/)
npm run build
```

---

## 📁 โครงสร้างโปรเจกต์

```text
├── .github/workflows/deploy.yml   # ระบบ CI/CD อัตโนมัติสำหรับ GitHub Pages
├── public/
│   ├── .nojekyll                  # ป้องกัน Jekyll ขัดขวางการโหลดไฟล์ assets
│   ├── 404.html                   # หน้าสำรองสำหรับ SPA บน GitHub Pages
│   └── favicon.svg                # ไอคอนเว็บไซต์
├── src/
│   ├── components/                # คอมโพเนนต์ UI (LabViewport3D, TopBar, BottomDock, ฯลฯ)
│   ├── data/                      # ข้อมูลตั้งต้นและ Presets ของห้องแลป
│   ├── services/                  # การเชื่อมต่อ Firebase (Auth & Firestore)
│   ├── state/                     # State Management & Reducer สำหรับ Undo/Redo
│   ├── three/                     # โมเดล 3D และ Equipment Factory (Three.js)
│   ├── types/                     # TypeScript Interfaces
│   └── utils/                     # ฟังก์ชันคำนวณตำแหน่ง (placement.ts), วิเคราะห์ (labAnalysis.ts), และ migration
├── index.html                     # HTML Entry Point
├── package.json                   # การกำหนด Dependencies และ Scripts
├── tsconfig.json                  # การตั้งค่า TypeScript
└── vite.config.ts                 # การตั้งค่า Vite (base: './' สำหรับ GitHub Pages)
```
