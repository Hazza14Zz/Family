// ============================================================
// أدوات مشتركة — تواريخ، تهريب نصوص، تنبيهات
// ------------------------------------------------------------
// كل التواريخ بالتوقيت المحلي (لا toISOString) حتى لا يُحسب ما بعد
// منتصف الليل على اليوم السابق — نفس المعالجة في السجل الأصلي.
// ============================================================

export const WEEKDAYS_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
export const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
                          'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

export function dateToStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function todayStr() {
    return dateToStr(new Date());
}

// الأسبوع يبدأ الأحد وينتهي السبت — نفس تعريف السجل الأصلي
export function weekRange(ref = new Date()) {
    const start = new Date(ref);
    start.setDate(ref.getDate() - ref.getDay());
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start: dateToStr(start), end: dateToStr(end) };
}

export function monthRange(ref = new Date()) {
    const y = ref.getFullYear(), m = ref.getMonth();
    const last = new Date(y, m + 1, 0).getDate();
    return {
        start: `${y}-${String(m + 1).padStart(2, '0')}-01`,
        end:   `${y}-${String(m + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`,
        label: `${MONTHS_AR[m]} ${y}`
    };
}

export function longDate(d = new Date()) {
    return `${WEEKDAYS_AR[d.getDay()]}، ${d.getDate()} ${MONTHS_AR[d.getMonth()]} ${d.getFullYear()}`;
}

// تهريب النصوص قبل إدراجها في innerHTML — أسماء الطلاب إدخال مستخدم
export function esc(v) {
    return String(v == null ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// أرقام بفواصل عربية-إنجليزية موحّدة
export function num(n) {
    const v = Math.round((Number(n) || 0) * 100) / 100;
    return v.toLocaleString('en-US');
}

export function toast(message, ms = 2800, kind = 'ok') {
    let host = document.getElementById('toastHost');
    if (!host) {
        host = document.createElement('div');
        host.id = 'toastHost';
        host.className = 'toast-host';
        document.body.appendChild(host);
    }
    const el = document.createElement('div');
    el.className = `toast toast-${kind}`;
    el.textContent = message;
    host.appendChild(el);
    setTimeout(() => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(-8px)';
        setTimeout(() => el.remove(), 300);
    }, ms);
}

// ============================================================
// رسائل أخطاء Firestore بلغة مفهومة بدل أكواد إنجليزية
// ============================================================
export function firestoreError(e) {
    const code = (e && e.code) || '';
    if (code === 'permission-denied') {
        return 'الوصول مرفوض من قواعد الأمان. تأكد من نشر ملف firestore.rules المرفق ومن أن هذا الحساب له صلاحية في مجموعة users.';
    }
    if (code === 'failed-precondition' && String(e.message || '').includes('index')) {
        return 'ينقص فهرس في Firestore. افتح الرابط الظاهر في وحدة التحكم (Console) لإنشائه.';
    }
    if (code === 'unavailable') {
        return 'تعذّر الاتصال بالخادم. تحقّق من الإنترنت وأعد المحاولة.';
    }
    return (e && e.message) || 'حدث خطأ غير متوقع.';
}
