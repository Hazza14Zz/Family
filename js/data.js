// ============================================================
// طبقة البيانات — قراءة من نفس قاعدة بيانات سجل متابعة الحلقات
// ------------------------------------------------------------
// البنية المستخدمة (كما هي في المشروع الأصلي):
//
//   levels/{levelId}              { studentCount, nameAr, ... }
//   students/{levelId}_{number}   { level, number, name, uid }
//   records/{levelId}_{number}_{YYYY-MM-DD}
//                                 { level, number, date, attendance,
//                                   points, hasQuran, hasUniform,
//                                   totalPages, studentUid, ... }
//   pointsAdjustments/{autoId}    { level, number, date, delta, ... }
//
//   family_config/brave_family    ← مستند هذا المشروع وحده
//                                 { members: [{level, number, uid, name}] }
//
// نقاط اليوم = record.points + مجموع delta لنفس اليوم — نفس القاعدة
// المتبعة في السجل الأصلي، فالرقمان يتطابقان في الموقعين.
//
// كل الاستعلامات هنا مبنية على شرط واحد (level ==) فلا تحتاج أي
// فهرس مركّب في Firestore.
// ============================================================

import {
    db, collection, doc, getDoc, setDoc, getDocs, query, where
} from './firebase.js';
import {
    COL_LEVELS, COL_STUDENTS, COL_RECORDS, COL_ADJUST,
    COL_FAMILY, FAMILY_DOC, FAMILY_NAME
} from './config.js';

// ============================================================
// الطلاب
// ============================================================
export async function getStudentCount(level) {
    const snap = await getDoc(doc(db, COL_LEVELS, level));
    const d = snap.exists() ? snap.data() : null;
    return d && typeof d.studentCount === 'number' ? d.studentCount : 0;
}

// قائمة الطلاب مرتّبة ١..N، مع الأسماء والمعرّفات الثابتة
export async function listStudents(level) {
    const [count, snap] = await Promise.all([
        getStudentCount(level),
        getDocs(query(collection(db, COL_STUDENTS), where('level', '==', level)))
    ]);

    const byNumber = new Map();
    snap.forEach(s => {
        const d = s.data();
        if (d && d.number) byNumber.set(d.number, { name: d.name || '', uid: d.uid || null });
    });

    // إن كان studentCount غير مضبوط، اعتمد على أكبر رقم موجود فعلاً
    const maxSeen = byNumber.size ? Math.max(...byNumber.keys()) : 0;
    const total = Math.max(count, maxSeen);

    const out = [];
    for (let i = 1; i <= total; i++) {
        const d = byNumber.get(i);
        out.push({
            level,
            number: i,
            name: (d && d.name) || `طالب ${i}`,
            uid:  (d && d.uid)  || null
        });
    }
    return out;
}

// ============================================================
// إعداد العائلة
// ============================================================
export const memberKey = m => `${m.level}_${m.number}`;

export async function loadFamily() {
    const snap = await getDoc(doc(db, COL_FAMILY, FAMILY_DOC));
    if (!snap.exists()) return null;
    const d = snap.data() || {};
    return {
        familyName: d.familyName || FAMILY_NAME,
        members: Array.isArray(d.members) ? d.members : [],
        updatedAt: d.updatedAt || null,
        updatedByEmail: d.updatedByEmail || ''
    };
}

export async function saveFamily(members, user) {
    await setDoc(doc(db, COL_FAMILY, FAMILY_DOC), {
        familyName: FAMILY_NAME,
        members: members.map(m => ({
            level:  m.level,
            number: m.number,
            uid:    m.uid || null,
            name:   m.name || ''
        })),
        memberCount: members.length,
        updatedAt: new Date().toISOString(),
        updatedBy: user ? user.uid : null,
        updatedByEmail: user ? user.email : ''
    });
}

// ============================================================
// مطابقة الأعضاء مع الواقع الحالي
// ------------------------------------------------------------
// رقم الطالب يتغيّر عند حذف طالب قبله وإعادة الترقيم، بينما uid
// ثابت مدى الحياة. لذلك نُحدِّث الرقم والاسم من مجموعة students
// اعتماداً على uid قبل أي حساب، فلا تُنسب نقاط طالب إلى آخر.
// ============================================================
export async function reconcileMembers(members) {
    const levels = [...new Set(members.map(m => m.level))];
    const rosters = await Promise.all(levels.map(l => listStudents(l)));

    const byUid = new Map();     // uid → student
    const byKey = new Map();     // level_number → student
    levels.forEach((lv, i) => {
        rosters[i].forEach(s => {
            if (s.uid) byUid.set(s.uid, s);
            byKey.set(`${lv}_${s.number}`, s);
        });
    });

    let changed = 0;
    const resolved = [];
    const missing  = [];

    for (const m of members) {
        const hit = (m.uid && byUid.get(m.uid)) || byKey.get(`${m.level}_${m.number}`);
        if (!hit) { missing.push(m); continue; }
        if (hit.number !== m.number) changed++;
        resolved.push({
            level:  hit.level,
            number: hit.number,
            uid:    hit.uid || m.uid || null,
            name:   hit.name || m.name || `طالب ${hit.number}`
        });
    }

    return { members: resolved, renumbered: changed, missing };
}

// ============================================================
// السجلات والنقاط
// ------------------------------------------------------------
// نجلب كل سجلات المراحل المعنية مرّة واحدة، ثم نصفّي محلياً حسب
// الفترة (اليوم / الأسبوع / الشهر / كل الوقت). هذا استعلام واحد
// لكل مرحلة بدل أربعة، ويعمل بلا فهارس مركّبة.
// ============================================================
export async function fetchLevelData(levels) {
    const results = await Promise.all(levels.map(async level => {
        const [recSnap, adjSnap] = await Promise.all([
            getDocs(query(collection(db, COL_RECORDS), where('level', '==', level))),
            getDocs(query(collection(db, COL_ADJUST),  where('level', '==', level)))
        ]);
        const records = [];
        recSnap.forEach(s => records.push(s.data()));
        const adjustments = [];
        adjSnap.forEach(s => adjustments.push(s.data()));
        return { level, records, adjustments };
    }));

    const records = [];
    const adjustments = [];
    results.forEach(r => { records.push(...r.records); adjustments.push(...r.adjustments); });
    return { records, adjustments };
}

// ============================================================
// حساب مجاميع الأعضاء داخل نطاق تاريخي
//   start / end فارغان = كل الوقت
// يعيد Map: level_number → { points, days, present, absent, late,
//                            excused, pages, adjust }
// ============================================================
export function aggregate(members, records, adjustments, start, end) {
    const keys = new Set(members.map(memberKey));
    const inRange = d => (!start || d >= start) && (!end || d <= end);

    const totals = new Map();
    const blank = () => ({
        points: 0, adjust: 0, days: 0, pages: 0,
        present: 0, absent: 0, late: 0, excused: 0
    });
    members.forEach(m => totals.set(memberKey(m), blank()));

    for (const r of records) {
        const k = `${r.level}_${r.number}`;
        if (!keys.has(k) || !inRange(r.date)) continue;
        const t = totals.get(k);
        t.points += Number(r.points) || 0;
        t.pages  += Number(r.totalPages) || 0;
        t.days   += 1;
        const a = r.attendance;
        if (a === 'غائب')       t.absent  += 1;
        else if (a === 'متأخر') { t.late += 1; t.present += 1; }
        else if (a === 'معذور') t.excused += 1;
        else                    t.present += 1;
    }

    for (const a of adjustments) {
        const k = `${a.level}_${a.number}`;
        if (!keys.has(k) || !inRange(a.date)) continue;
        const t = totals.get(k);
        const delta = Number(a.delta) || 0;
        t.points += delta;
        t.adjust += delta;
    }

    return totals;
}

// مجموع نقاط العائلة كلها في نطاق
export function sumPoints(totals) {
    let s = 0;
    totals.forEach(t => { s += t.points; });
    return Math.round(s * 100) / 100;
}

// سجلات يوم واحد مفهرسة بالمفتاح
export function recordsOfDay(records, date) {
    const map = new Map();
    for (const r of records) {
        if (r.date === date) map.set(`${r.level}_${r.number}`, r);
    }
    return map;
}
