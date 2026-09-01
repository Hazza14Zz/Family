// ============================================================
// صفحة الإعداد — تعريف أفراد "عائلة الشجعان"
// ------------------------------------------------------------
// الاختيار تراكمي عبر المراحل الثلاث: تختار مرحلة، تعلّم من فيها،
// تنتقل لمرحلة أخرى — والتحديد السابق يبقى محفوظاً في الذاكرة حتى
// تضغط "حفظ العائلة"، فتُكتب القائمة كاملة في مستند واحد:
//     family_config/brave_family
// ============================================================

import { requireAuthorizedUser, wireLogout } from './guard.js';
import { LEVELS, LEVEL_NAMES } from './config.js';
import { listStudents, loadFamily, saveFamily, reconcileMembers, memberKey } from './data.js';
import { esc, toast, longDate, firestoreError } from './utils.js';

const $ = id => document.getElementById(id);

const levelSelect  = $('levelSelect');
const pickerBox    = $('pickerBox');
const currentBox   = $('currentBox');
const currentSub   = $('currentSub');
const saveBtn      = $('saveBtn');
const selectAllBtn = $('selectAllBtn');
const clearLevelBtn= $('clearLevelBtn');
const saveHint     = $('saveHint');

// المفتاح level_number → بيانات العضو المختار
const selected = new Map();
let roster = [];          // طلاب المرحلة المعروضة حالياً
let activeUser = null;
let dirty = false;

$('dateBar').textContent = longDate();

// ── تعبئة قائمة المراحل ─────────────────────────────────────
LEVELS.forEach(l => {
    const o = document.createElement('option');
    o.value = l.id;
    o.textContent = l.fullNameAr;
    levelSelect.appendChild(o);
});

// ============================================================
// العرض
// ============================================================
function renderCurrent() {
    const list = [...selected.values()].sort((a, b) =>
        a.level === b.level ? a.number - b.number : a.level.localeCompare(b.level));

    currentSub.textContent = list.length ? `${list.length} فرد` : '';

    if (!list.length) {
        currentBox.innerHTML = `<div class="state"><span class="ico">👥</span>
            لم يُحدَّد أي فرد بعد. اختر مرحلة بالأسفل وعلّم على أفراد العائلة.</div>`;
        return;
    }

    currentBox.innerHTML = `<div class="grid grid-auto">${
        list.map(m => `
            <div class="member">
                <div class="member-top">
                    <div class="avatar">${esc(String(m.number))}</div>
                    <div style="min-width:0">
                        <div class="member-name">${esc(m.name)}</div>
                        <div class="member-meta">${esc(LEVEL_NAMES[m.level] || m.level)} · رقم ${esc(String(m.number))}</div>
                    </div>
                </div>
                <button class="btn btn-ghost" style="padding:8px 14px;font-size:12px"
                        data-remove="${esc(memberKey(m))}">✕ إزالة من العائلة</button>
            </div>`).join('')
    }</div>`;

    currentBox.querySelectorAll('[data-remove]').forEach(b => {
        b.addEventListener('click', () => {
            selected.delete(b.dataset.remove);
            markDirty();
            renderCurrent();
            syncPickerChecks();
        });
    });
}

function renderPicker() {
    if (!roster.length) {
        pickerBox.innerHTML = `<div class="state"><span class="ico">📭</span>
            لا يوجد طلاب مسجّلون في هذه المرحلة.</div>`;
        selectAllBtn.disabled = clearLevelBtn.disabled = true;
        return;
    }

    selectAllBtn.disabled = clearLevelBtn.disabled = false;

    pickerBox.innerHTML = `<div class="picker">${
        roster.map(s => {
            const k = memberKey(s);
            const on = selected.has(k);
            return `
            <label class="pick ${on ? 'checked' : ''}" data-key="${esc(k)}">
                <input type="checkbox" ${on ? 'checked' : ''} data-num="${esc(String(s.number))}">
                <span class="n">${esc(String(s.number))}</span>
                <span class="nm">${esc(s.name)}</span>
            </label>`;
        }).join('')
    }</div>`;

    pickerBox.querySelectorAll('.pick input').forEach(cb => {
        cb.addEventListener('change', () => {
            const row = cb.closest('.pick');
            const num = Number(cb.dataset.num);
            const st  = roster.find(s => s.number === num);
            if (!st) return;
            if (cb.checked) selected.set(memberKey(st), { ...st });
            else selected.delete(memberKey(st));
            row.classList.toggle('checked', cb.checked);
            markDirty();
            renderCurrent();
        });
    });
}

function syncPickerChecks() {
    pickerBox.querySelectorAll('.pick').forEach(row => {
        const on = selected.has(row.dataset.key);
        row.classList.toggle('checked', on);
        const cb = row.querySelector('input');
        if (cb) cb.checked = on;
    });
}

function markDirty() {
    dirty = true;
    saveBtn.disabled = false;
    saveHint.textContent = '● تغييرات غير محفوظة';
    saveHint.style.color = 'var(--gold-600)';
}

function markClean(when) {
    dirty = false;
    saveBtn.disabled = true;
    saveHint.textContent = when ? `✓ محفوظ — ${when}` : '✓ محفوظ';
    saveHint.style.color = 'var(--em-700)';
}

// ============================================================
// الأحداث
// ============================================================
levelSelect.addEventListener('change', async () => {
    const level = levelSelect.value;
    roster = [];
    if (!level) {
        pickerBox.innerHTML = `<div class="state"><span class="ico">🎓</span>اختر مرحلة لعرض طلابها</div>`;
        selectAllBtn.disabled = clearLevelBtn.disabled = true;
        return;
    }

    pickerBox.innerHTML = `<div class="state"><span class="ico">⏳</span>جاري تحميل طلاب ${esc(LEVEL_NAMES[level])}...</div>`;
    try {
        roster = await listStudents(level);
        renderPicker();
    } catch (e) {
        console.error(e);
        pickerBox.innerHTML = `<div class="state error">تعذّر تحميل الطلاب<br>${esc(firestoreError(e))}</div>`;
    }
});

selectAllBtn.addEventListener('click', () => {
    roster.forEach(s => selected.set(memberKey(s), { ...s }));
    markDirty(); renderCurrent(); syncPickerChecks();
});

clearLevelBtn.addEventListener('click', () => {
    roster.forEach(s => selected.delete(memberKey(s)));
    markDirty(); renderCurrent(); syncPickerChecks();
});

saveBtn.addEventListener('click', async () => {
    const members = [...selected.values()];
    if (!members.length && !confirm('لم تختر أي فرد. هل تريد حفظ عائلة فارغة؟')) return;

    saveBtn.disabled = true;
    saveBtn.textContent = '⏳ جاري الحفظ...';
    try {
        await saveFamily(members, activeUser);
        markClean(new Date().toLocaleTimeString('ar-SA'));
        toast(`تم حفظ العائلة — ${members.length} فرد`);
    } catch (e) {
        console.error(e);
        saveBtn.disabled = false;
        toast(firestoreError(e), 6000, 'err');
    } finally {
        saveBtn.textContent = '💾 حفظ العائلة';
    }
});

window.addEventListener('beforeunload', e => {
    if (!dirty) return;
    e.preventDefault();
    e.returnValue = '';
});

// ============================================================
// الإقلاع — بعد التأكد من هوية الحساب
// ============================================================
wireLogout();

requireAuthorizedUser(async user => {
    activeUser = user;
    $('whoAmI').textContent = user.email;

    try {
        const fam = await loadFamily();
        if (fam && fam.members.length) {
            // نطابق الأرقام مع الواقع (قد يكون طالب حُذف وأُعيد الترقيم)
            const { members, renumbered, missing } = await reconcileMembers(fam.members);
            members.forEach(m => selected.set(memberKey(m), m));
            markClean();
            if (renumbered) {
                toast(`تم تحديث أرقام ${renumbered} فرد بعد إعادة الترقيم — اضغط حفظ للتثبيت`, 6000, 'warn');
                markDirty();
            }
            if (missing.length) {
                toast(`${missing.length} فرد لم يعد موجوداً في الحلقة وأُزيل من القائمة`, 6000, 'warn');
                markDirty();
            }
        } else {
            markClean();
            saveHint.textContent = '';
        }
    } catch (e) {
        console.error(e);
        currentBox.innerHTML = `<div class="state error">تعذّر قراءة إعداد العائلة<br>${esc(firestoreError(e))}</div>`;
        return;
    }

    renderCurrent();
});
