# บอท Discord ระบบขอรับยศ (ปุ่ม + Modal + อนุมัติอัตโนมัติ)

บอทนี้ทำงานตามลำดับ:
1. แอดมินพิมพ์คำสั่ง `/setup` ในช่องที่ต้องการ → บอทจะส่ง Embed พร้อมปุ่ม **"🎖️ รับยศ"**
2. ผู้ใช้กดปุ่ม → เด้งกล่อง (Modal) ให้กรอกรหัส/เหตุผล
3. ผู้ใช้กด Submit → บอทเช็คข้อมูลทันที
   - ถ้าตรงกับรหัสที่ตั้งไว้ → **มอบยศให้ทันที** + แจ้งว่าอนุมัติแล้ว
   - ถ้าไม่ตรง → เด้งข้อความ **"คำขอของคุณ ไม่ผ่านการอนุมัติจากแอดมิน"** ตามรูปตัวอย่าง

มีเว็บเซิร์ฟเวอร์เล็กๆ ในตัว (Express) สำหรับโฮสต์ที่ต้องการ URL ให้ ping (เช่น Replit, Railway, Render, UptimeRobot)

---

## ขั้นตอนติดตั้ง

### 1. สร้างบอทใน Discord Developer Portal
1. ไปที่ https://discord.com/developers/applications → กด **New Application**
2. ไปที่แท็บ **Bot** → กด **Reset Token** เพื่อคัดลอกโทเคน (เก็บไว้ใช้ในขั้นตอนถัดไป)
3. เปิดสวิตช์ **Privileged Gateway Intents** ตามต้องการ (ระบบนี้ไม่จำเป็นต้องเปิด Intent พิเศษ)
4. ไปที่แท็บ **OAuth2 > URL Generator**
   - เลือก scope: `bot`, `applications.commands`
   - เลือก permission: `Manage Roles`, `Send Messages`, `Use Slash Commands`
   - คัดลอกลิงก์ที่ได้ไปเปิดเพื่อเชิญบอทเข้าเซิร์ฟเวอร์
5. **สำคัญ:** ยศของบอท (Role ของบอทเอง) ต้องอยู่ **สูงกว่า** ยศที่จะมอบให้ผู้ใช้ ไม่งั้นบอทจะมอบยศไม่ได้

### 2. ติดตั้งโปรเจกต์
```bash
npm install
```

### 3. ตั้งค่าไฟล์ .env
1. คัดลอกไฟล์ `.env.example` เป็น `.env`
2. กรอกค่าต่างๆ ให้ครบ:
   - `BOT_TOKEN` = โทเคนบอท
   - `CLIENT_ID` = Application ID (อยู่หน้า General Information)
   - `GUILD_ID` = ไอดีเซิร์ฟเวอร์ (เปิด Developer Mode ใน Discord ก่อน แล้วคลิกขวาที่เซิร์ฟเวอร์ > Copy Server ID)
   - `ROLE_ID` = ไอดียศที่จะมอบ (คลิกขวาที่ยศใน Server Settings > Roles > Copy Role ID)
   - `VERIFY_CODE` = รหัส/คำที่ต้องกรอกให้ถูกต้องจึงจะได้ยศ ตั้งเองได้เลย

### 4. ลงทะเบียนคำสั่ง /setup
```bash
node deploy-commands.js
```

### 5. รันบอท
```bash
npm start
```

จากนั้นในเซิร์ฟเวอร์ พิมพ์ `/setup` ในช่องที่ต้องการ ก็จะขึ้นปุ่ม "รับยศ" ให้กดได้ทันที

---

## การเอาไปรันบนเว็บ (ฟรีโฮสต์)

โปรเจกต์นี้มี Express server ในตัว (ดูใน `index.js`) ทำให้เอาไปรันบนบริการที่ต้องการ HTTP endpoint ได้ เช่น:
- **Railway.app** — อัปโหลดโปรเจกต์ ตั้งค่า Environment Variables ตาม `.env.example` แล้ว deploy ได้เลย (แนะนำ เพราะรันตลอด 24 ชม. ไม่ต้อง ping)
- **Replit** — นำเข้าโปรเจกต์ ตั้งค่า Secrets ตาม `.env.example` แล้วกด Run จากนั้นใช้บริการอย่าง UptimeRobot ping URL ของ Repl ทุก 5 นาทีเพื่อกันบอทหลับ
- **Render.com** — สร้าง Web Service ใหม่ ตั้งค่า Build Command เป็น `npm install` และ Start Command เป็น `npm start`

**หมายเหตุ:** ห้าม commit ไฟล์ `.env` ขึ้น GitHub เด็ดขาด เพราะมีโทเคนบอทอยู่ในนั้น ให้ตั้งค่าเป็น Environment Variables ในหน้าเว็บโฮสต์แทน

---

## ปรับแต่งเพิ่มเติม

- อยากเปลี่ยนข้อความ/สี Embed → แก้ไขได้ใน `index.js` ที่ตัวแปร `successEmbed` และ `denyEmbed`
- อยากเปลี่ยนหัวข้อ/คำอธิบายในกล่องกรอกข้อมูล (Modal) → แก้ไขที่ `TextInputBuilder` ใน `index.js`
- อยากให้แอดมินเป็นคนกดอนุมัติ/ปฏิเสธเองแทนการเช็ครหัสอัตโนมัติ (ระบบขอสิทธิ์แบบมีคนตรวจ) → บอกมาได้เลย จะทำเวอร์ชันที่ส่งคำขอไปให้แอดมินกด Approve/Deny ในช่องแอดมินแทน
