// ============================================================
// اللوحة الرئيسية — عائلة الشجعان
// ------------------------------------------------------------
// تقرأ سجلات المراحل التي ينتمي إليها أفراد العائلة مرّة واحدة،
// ثم تحسب كل شيء محلياً: الأسبوع، الشهر، كل الوقت، اليوم، الغياب،
// وقائمة "بحاجة إلى دعم".
// ============================================================

import { requireAuthorizedUser, wireLogout } from './guard.js';
import { LEVEL_NAMES, ATT_ABSENT, ATT_LATE, ATT_EXCUSED } from './config.js';
import {
    loadFamily, reconcileMembers, fetchLevelData,
    aggregate, sumPoints, recordsOfDay, memberKey
} from './data.js';
import {
    esc, num, toast, longDate, todayStr, weekRange, monthRange, firestoreError
} from './utils.js';

const $ = id => document.getElementById(id);

// ── الحالة ──────────────────────────────────────────────────
let members = [];
let records = [];
let adjustments = [];
let ranges = {};
let activeRange = 'all';       // للبطاقات وقائمة الدعم

const RANGE_LABELS = { week: 'هذا الأسبوع', month: 'هذا الشهر', all: 'منذ البداية' };

$('dateBar').textContent = longDate();
$('todayLabel').textContent = todayStr();

// ============================================================
// أدوات عرض صغيرة
// ============================================================
function attendanceChip(att) {
    if (!att) return '<span class="mini">لا يوجد سجل</span>';
    if (att === ATT_ABSENT)  return '<span class="mini red">غائب</span>';
    if (att === ATT_LATE)    return '<span class="mini gold">متأخر</span>';
    if (att === ATT_EXCUSED) return '<span class="mini blue">معذور</span>';
    return '<span class="mini em">حاضر</span>';
}

function initials(name, number) {
    const t = String(name || '').trim();
    if (!t || /^طالب\s/.test(t)) return String(number);
    return t.charAt(0);
}

function noticeHTML(kind, html) {
    return `<div class="alert alert-${kind}" style="margin-bottom:20px">${html}</div>`;
}

function setEmptyEverywhere(msg) {
    ['weekTotal', 'monthTotal', 'allTotal'].forEach(id => $(id).textContent = '0');
    const s = `<div class="state"><span class="ico">👥</span>${esc(msg)}</div>`;
    $('membersBox').innerHTML = s;
    $('absenceBox').innerHTML = s;
    $('supportBox').innerHTML = s;
    $('todayBody').innerHTML  = `<tr><td colspan="6">${s}</td></tr>`;
    $('rankBody').innerHTML   = `<tr><td colspan="8">${s}</td></tr>`;
}

// ============================================================
// ١) مجاميع النقاط — أسبوع / شهر / كل الوقت
// ============================================================
function renderTotals() {
    const w = sumPoints(ranges.week);
    const m = sumPoints(ranges.month);
    const a = sumPoints(ranges.all);

    $('weekTotal').textContent  = num(w);
    $('monthTotal').textContent = num(m);
    $('allTotal').textContent   = num(a);

    const wr = weekRange(), mr = monthRange();
    $('weekNote').textContent  = `${wr.start} ← ${wr.end}`;
    $('monthNote').textContent = mr.label;
    $('allNote').textContent   = `${members.length} فرد · كل السجلات`;

    const avg = members.length ? Math.round((a / members.length) * 10) / 10 : 0;
    $('totalsSub').textContent = `${members.length} فرد · متوسط ${num(avg)} نقطة للفرد`;
}

// ============================================================
// ٢) مراقب الغياب — اليوم
// ============================================================
function renderAbsence() {
    const today = todayStr();
    const day = recordsOfDay(records, today);

    const absent  = [];
    const excused = [];
    const late    = [];
    const noEntry = [];

    for (const m of members) {
        const r = day.get(memberKey(m));
        if (!r) { noEntry.push(m); continue; }
        if (r.attendance === ATT_ABSENT)       absent.push(m);
        else if (r.attendance === ATT_EXCUSED) excused.push(m);
        else if (r.attendance === ATT_LATE)    late.push(m);
    }

    const chips = (list, cls, icon) => list.map(m =>
        `<span class="chip ${cls}">${icon} ${esc(m.name)}
            <small style="opacity:.7;font-weight:600">(${esc(LEVEL_NAMES[m.level] || m.level)})</small>
        </span>`).join('');

    if (absent.length) {
        $('absenceBox').innerHTML = `
            <div class="alert alert-danger">
                <div class="alert-title">⚠️ ${absent.length} من أفراد العائلة غائب اليوم</div>
                <div class="alert-body">${chips(absent, '', '🚫')}</div>
                ${(late.length || excused.length) ? `<div class="alert-body" style="border-top:1px dashed #fecaca;padding-top:10px;margin-top:12px">
                    ${chips(late, 'warn', '⏰')}${chips(excused, 'info', '📝')}
                </div>` : ''}
                ${noEntry.length ? `<div class="section-sub" style="margin-top:10px">
                    ${noEntry.length} فرد لم يُسجَّل له شيء اليوم بعد.</div>` : ''}
            </div>`;
    } else {
        $('absenceBox').innerHTML = `
            <div class="alert alert-ok">
                <div class="alert-title">✅ لا يوجد غياب اليوم — الحمد لله</div>
                ${(late.length || excused.length) ? `<div class="alert-body">
                    ${chips(late, 'warn', '⏰')}${chips(excused, 'info', '📝')}
                </div>` : ''}
                ${noEntry.length ? `<div class="section-sub" style="margin-top:10px">
                    ${noEntry.length} من ${members.length} لم يُسجَّل لهم شيء اليوم بعد.</div>` : ''}
            </div>`;
    }
}

// ============================================================
// ٣) نشاط اليوم لكل فرد
// ============================================================
function renderToday() {
    const today = todayStr();
    const day = recordsOfDay(records, today);
    const todayTotals = aggregate(members, records, adjustments, today, today);

    const rows = members
        .map(m => ({ m, r: day.get(memberKey(m)), t: todayTotals.get(memberKey(m)) }))
        .sort((a, b) => (b.t.points - a.t.points) || a.m.name.localeCompare(b.m.name, 'ar'));

    const totalToday = sumPoints(todayTotals);
    const recorded = rows.filter(x => x.r).length;
    $('todaySub').textContent = `${recorded} من ${members.length} لديه سجل اليوم · مجموع اليوم ${num(totalToday)} نقطة`;

    if (!rows.length) {
        $('todayBody').innerHTML = `<tr><td colspan="6"><div class="state">لا يوجد أفراد</div></td></tr>`;
        return;
    }

    $('todayBody').innerHTML = rows.map(({ m, r, t }) => {
        const flags = r
            ? `${r.hasQuran ? '<span class="mini em">📖 معه المصحف</span>' : '<span class="mini">📕 بلا مصحف</span>'}
               ${r.hasUniform ? '<span class="mini em">👕 الزي</span>' : '<span class="mini">👕 بلا زي</span>'}`
            : '<span class="mini">—</span>';
        return `
        <tr>
            <td>${esc(m.name)}</td>
            <td>${esc(LEVEL_NAMES[m.level] || m.level)}</td>
            <td>${attendanceChip(r && r.attendance)}</td>
            <td class="numcell" style="color:${t.points > 0 ? 'var(--em-700)' : t.points < 0 ? 'var(--red-600)' : 'var(--s-400)'}">${num(t.points)}</td>
            <td class="numcell">${r ? num(r.totalPages || 0) : '—'}</td>
            <td><div class="mini-row">${flags}</div></td>
        </tr>`;
    }).join('');
}

// ============================================================
// ٤) بطاقات الأفراد (حسب الفترة المختارة)
// ============================================================
function renderMembers() {
    const totals = ranges[activeRange];
    const list = members
        .map(m => ({ m, t: totals.get(memberKey(m)) }))
        .sort((a, b) => (b.t.points - a.t.points) || a.m.name.localeCompare(b.m.name, 'ar'));

    if (!list.length) return;

    $('membersBox').innerHTML = list.map(({ m, t }, i) => `
        <div class="member">
            <div class="member-top">
                <div class="avatar">${esc(initials(m.name, m.number))}</div>
                <div style="min-width:0">
                    <div class="member-name">${esc(m.name)}</div>
                    <div class="member-meta">${esc(LEVEL_NAMES[m.level] || m.level)} · رقم ${esc(String(m.number))}</div>
                </div>
            </div>
            <div class="member-points">
                <b>${num(t.points)}</b>
                <span>نقطة — ${esc(RANGE_LABELS[activeRange])}</span>
            </div>
            <div class="mini-row">
                <span class="mini ${i === 0 ? 'gold' : ''}">${i === 0 ? '🥇 الأعلى' : `المركز ${i + 1}`}</span>
                <span class="mini em">${t.days} يوم</span>
                ${t.absent ? `<span class="mini red">${t.absent} غياب</span>` : ''}
                ${t.pages ? `<span class="mini blue">${num(t.pages)} صفحة</span>` : ''}
                ${t.adjust ? `<span class="mini gold">${t.adjust > 0 ? '+' : ''}${num(t.adjust)} يدوي</span>` : ''}
            </div>
        </div>`).join('');
}

// ============================================================
// ٥) الترتيب التفصيلي
// ============================================================
function renderRankTable() {
    const totals = ranges[activeRange];
    const list = members
        .map(m => ({ m, t: totals.get(memberKey(m)) }))
        .sort((a, b) => (b.t.points - a.t.points) || a.m.name.localeCompare(b.m.name, 'ar'));

    const max = Math.max(1, ...list.map(x => x.t.points));
    $('tableSub').textContent = RANGE_LABELS[activeRange];

    if (!list.length) return;

    $('rankBody').innerHTML = list.map(({ m, t }, i) => {
        const pct = Math.max(0, Math.min(100, (t.points / max) * 100));
        return `
        <tr>
            <td><span class="rank ${i === 0 ? 'top' : ''}">${i + 1}</span></td>
            <td>${esc(m.name)}</td>
            <td>${esc(LEVEL_NAMES[m.level] || m.level)}</td>
            <td class="numcell">${num(t.points)}</td>
            <td><div class="bar"><i style="width:${pct.toFixed(1)}%"></i></div></td>
            <td class="numcell">${t.days}</td>
            <td class="numcell" style="color:${t.absent ? 'var(--red-600)' : 'var(--s-400)'}">${t.absent}</td>
            <td class="numcell">${num(t.pages)}</td>
        </tr>`;
    }).join('');
}

// ============================================================
// ٦) قائمة "بحاجة إلى دعم" — ترتيب تصاعدي (الأقل أولاً)
// ============================================================
function renderSupport() {
    const totals = ranges[activeRange];
    const list = members
        .map(m => ({ m, t: totals.get(memberKey(m)) }))
        .sort((a, b) => (a.t.points - b.t.points) || a.m.name.localeCompare(b.m.name, 'ar'));

    // نعرض النصف الأقل نقاطاً (٥ كحد أقصى) — ولا نُدرج المتصدّر أبداً
    // في قائمة الدعم، فذلك يفرغ القائمة من معناها.
    const cap  = Math.max(1, Math.min(5, Math.ceil(list.length / 2)));
    const show = list.slice(0, Math.min(cap, Math.max(1, list.length - 1)));
    const top  = list.length ? list[list.length - 1].t.points : 0;

    if (!show.length) {
        $('supportSub').textContent = '';
        $('supportBox').innerHTML = '<div class="state">لا يوجد أفراد لعرضهم</div>';
        return;
    }

    $('supportSub').textContent =
        `${RANGE_LABELS[activeRange]} · الأقل نقاطاً أولاً (${show.length} من ${list.length})`;

    $('supportBox').innerHTML = show.map(({ m, t }, i) => {
        const gap = Math.max(0, top - t.points);
        return `
        <div class="support-row">
            <div class="avatar">${esc(initials(m.name, m.number))}</div>
            <div class="grow">
                <div class="member-name">${esc(m.name)}</div>
                <div class="member-meta">
                    ${esc(LEVEL_NAMES[m.level] || m.level)}
                    ${gap > 0 ? ` · يفصله ${num(gap)} نقطة عن الأعلى` : ' · متساوٍ مع الأعلى'}
                    ${t.absent ? ` · ${t.absent} غياب` : ''}
                </div>
            </div>
            <div style="text-align:center">
                <div class="pts">${num(t.points)}</div>
                <div class="member-meta">نقطة</div>
            </div>
            <div class="mini ${i === 0 ? 'gold' : ''}">${i === 0 ? '🤲 الأولى بالدعم' : `#${i + 1}`}</div>
        </div>`;
    }).join('');
}

// ============================================================
// إعادة الحساب والعرض
// ============================================================
function computeRanges() {
    const wr = weekRange(), mr = monthRange();
    ranges = {
        week:  aggregate(members, records, adjustments, wr.start, wr.end),
        month: aggregate(members, records, adjustments, mr.start, mr.end),
        all:   aggregate(members, records, adjustments, null, null)
    };
}

function renderAll() {
    renderTotals();
    renderAbsence();
    renderToday();
    renderMembers();
    renderRankTable();
    renderSupport();
}

// أزرار الفترة
$('rangeTabs').addEventListener('click', e => {
    const btn = e.target.closest('[data-range]');
    if (!btn || !ranges.all) return;
    activeRange = btn.dataset.range;
    $('rangeTabs').querySelectorAll('[data-range]').forEach(b => {
        const on = b.dataset.range === activeRange;
        b.className = `btn ${on ? 'btn-primary' : 'btn-ghost'}`;
        b.style.padding = '9px 18px';
        b.style.fontSize = '12px';
    });
    renderMembers();
    renderRankTable();
    renderSupport();
});

// ============================================================
// تحميل البيانات
// ============================================================
async function load(showToast) {
    $('notice').innerHTML = '';

    let fam;
    try {
        fam = await loadFamily();
    } catch (e) {
        console.error(e);
        $('notice').innerHTML = noticeHTML('danger',
            `<div class="alert-title">تعذّر قراءة إعداد العائلة</div>
             <div style="margin-top:8px;font-size:13px;line-height:1.9">${esc(firestoreError(e))}</div>`);
        setEmptyEverywhere('لم تُقرأ بيانات العائلة');
        return;
    }

    if (!fam || !fam.members.length) {
        $('notice').innerHTML = noticeHTML('danger',
            `<div class="alert-title">لم تُعرَّف العائلة بعد</div>
             <div style="margin-top:8px;font-size:13px;line-height:1.9">
                افتح صفحة <a href="setup.html"><b>الإعداد</b></a> واختر المرحلة ثم علّم على أفراد عائلة الشجعان.
             </div>`);
        setEmptyEverywhere('لا يوجد أفراد معرّفون');
        $('familyMeta').textContent = 'العائلة غير معرّفة بعد';
        return;
    }

    // مطابقة الأرقام مع الواقع قبل أي حساب
    let missing = [];
    try {
        const rec = await reconcileMembers(fam.members);
        members = rec.members;
        missing = rec.missing;
    } catch (e) {
        console.warn('تعذّرت المطابقة، سنستخدم القائمة كما هي:', e);
        members = fam.members;
    }

    $('familyMeta').textContent = `${members.length} فرد` +
        (fam.updatedByEmail ? ` · آخر تعديل بواسطة ${fam.updatedByEmail}` : '');

    if (missing.length) {
        $('notice').innerHTML = noticeHTML('danger',
            `<div class="alert-title">⚠️ ${missing.length} فرد لم يعد موجوداً في الحلقة</div>
             <div style="margin-top:8px;font-size:13px">افتح <a href="setup.html"><b>الإعداد</b></a> لتحديث القائمة.</div>`);
    }

    if (!members.length) {
        setEmptyEverywhere('لم يعد أي من أفراد العائلة المحفوظين موجوداً في الحلقة');
        return;
    }

    const levels = [...new Set(members.map(m => m.level))];
    try {
        const data = await fetchLevelData(levels);
        records = data.records;
        adjustments = data.adjustments;
    } catch (e) {
        console.error(e);
        $('notice').innerHTML = noticeHTML('danger',
            `<div class="alert-title">تعذّر تحميل السجلات</div>
             <div style="margin-top:8px;font-size:13px;line-height:1.9">${esc(firestoreError(e))}</div>`);
        setEmptyEverywhere('لم تُحمَّل السجلات');
        return;
    }

    computeRanges();
    renderAll();
    if (showToast) toast('تم تحديث البيانات');
}

$('refreshBtn').addEventListener('click', async () => {
    const b = $('refreshBtn');
    b.disabled = true;
    b.textContent = '⏳ تحديث...';
    try { await load(true); }
    finally { b.disabled = false; b.textContent = '🔄 تحديث'; }
});

// ============================================================
// الإقلاع
// ============================================================
wireLogout();

requireAuthorizedUser(user => {
    $('whoAmI').textContent = user.email;
    load(false);
});
