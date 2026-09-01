// ============================================================
// حارس الوصول — حساب واحد فقط
// ------------------------------------------------------------
// القائمة البيضاء مطبَّقة داخل مراقب حالة المصادقة نفسه
// (onAuthStateChanged)، فأي حساب آخر يُسجَّل خروجه فوراً قبل أن
// يرى أي بيانات، وتظهر له رسالة "الوصول مرفوض".
// ============================================================

import { auth, onAuthStateChanged, signOut } from './firebase.js';
import { ALLOWED_EMAIL } from './config.js';

export const norm = e => String(e || '').trim().toLowerCase();
export const isAllowed = email => norm(email) === norm(ALLOWED_EMAIL);

export const ACCESS_DENIED_MSG =
    '⛔ الوصول مرفوض — هذه اللوحة مخصّصة لحساب واحد فقط. تم تسجيل خروجك.';

// ============================================================
// حارس الصفحات المحمية (اللوحة والإعدادات)
//   onReady(user)  — يُنادى عند دخول الحساب المصرّح له
// أي حالة أخرى → خروج + تحويل إلى صفحة الدخول مع سبب الرفض.
// ============================================================
export function requireAuthorizedUser(onReady) {
    return onAuthStateChanged(auth, async user => {
        if (!user) {
            window.location.replace('index.html');
            return;
        }

        if (!isAllowed(user.email)) {
            // خروج فوري قبل أي قراءة من قاعدة البيانات
            try { await signOut(auth); } catch (e) { console.warn(e); }
            try { sessionStorage.setItem('bf_denied', '1'); } catch (e) { /* وضع التصفح الخاص */ }
            window.location.replace('index.html?denied=1');
            return;
        }

        onReady(user);
    });
}

// زر تسجيل الخروج المشترك
export async function doLogout() {
    if (!confirm('تسجيل الخروج من لوحة العائلة؟')) return;
    try { await signOut(auth); } catch (e) { console.warn(e); }
    window.location.replace('index.html');
}

// يربط أي زر يحمل data-logout
export function wireLogout(root = document) {
    root.querySelectorAll('[data-logout]').forEach(b => b.addEventListener('click', doLogout));
}
