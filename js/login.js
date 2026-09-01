// ============================================================
// صفحة تسجيل الدخول
// ------------------------------------------------------------
// يُرفض أي بريد خارج القائمة البيضاء مرّتين:
//   ١) قبل إرسال الطلب أصلاً (توفيراً للوقت وللمحاولات)
//   ٢) داخل مراقب حالة المصادقة، وهو الفحص الملزم
// ============================================================

import { auth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from './firebase.js';
import { isAllowed, ACCESS_DENIED_MSG } from './guard.js';

const form    = document.getElementById('loginForm');
const emailEl = document.getElementById('email');
const passEl  = document.getElementById('password');
const btn     = document.getElementById('submitBtn');
const errBox  = document.getElementById('errorBox');
const card    = document.getElementById('card');

let submitting = false;

function showError(msg) {
    errBox.textContent = msg;
    errBox.classList.add('show');
    card.classList.remove('shake');
    void card.offsetWidth;          // إعادة تشغيل الحركة
    card.classList.add('shake');
}

function clearError() {
    errBox.classList.remove('show');
    errBox.textContent = '';
}

// رسالة الرفض القادمة من صفحة محمية
(function showDenialIfAny() {
    const denied = new URLSearchParams(location.search).has('denied');
    let stored = false;
    try { stored = sessionStorage.getItem('bf_denied') === '1'; } catch (e) { /* تجاهل */ }
    if (denied || stored) {
        showError(ACCESS_DENIED_MSG);
        try { sessionStorage.removeItem('bf_denied'); } catch (e) { /* تجاهل */ }
        history.replaceState(null, '', location.pathname);
    }
})();

// ============================================================
// المراقب: إن كانت هناك جلسة قائمة، ادخل مباشرة — أو اطرد الدخيل
// ============================================================
onAuthStateChanged(auth, async user => {
    if (!user) return;

    if (!isAllowed(user.email)) {
        try { await signOut(auth); } catch (e) { console.warn(e); }
        submitting = false;
        btn.disabled = false;
        btn.textContent = '🚪 دخول';
        showError(ACCESS_DENIED_MSG);
        return;
    }

    window.location.replace('dashboard.html');
});

function authErrorMessage(code) {
    switch (code) {
        case 'auth/invalid-email':        return 'صيغة البريد الإلكتروني غير صحيحة.';
        case 'auth/user-disabled':        return 'هذا الحساب معطّل.';
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':   return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
        case 'auth/too-many-requests':    return 'محاولات كثيرة متتالية. انتظر قليلاً ثم أعد المحاولة.';
        case 'auth/network-request-failed': return 'تعذّر الاتصال بالخادم. تحقّق من الإنترنت.';
        default:                          return 'تعذّر تسجيل الدخول. حاول مرة أخرى.';
    }
}

form.addEventListener('submit', async e => {
    e.preventDefault();
    if (submitting) return;
    clearError();

    const email = emailEl.value.trim();
    const pass  = passEl.value;

    if (!email || !pass) {
        showError('أدخل البريد الإلكتروني وكلمة المرور.');
        return;
    }

    // الفحص المبكر — نفس القائمة البيضاء
    if (!isAllowed(email)) {
        showError('⛔ الوصول مرفوض — هذا الحساب غير مصرّح له بدخول لوحة العائلة.');
        passEl.value = '';
        return;
    }

    submitting = true;
    btn.disabled = true;
    btn.textContent = '⏳ جاري التحقق...';

    try {
        await signInWithEmailAndPassword(auth, email, pass);
        // التحويل يتم من المراقب أعلاه
    } catch (err) {
        submitting = false;
        btn.disabled = false;
        btn.textContent = '🚪 دخول';
        showError(authErrorMessage(err && err.code));
        passEl.value = '';
        passEl.focus();
    }
});

// إظهار/إخفاء كلمة المرور
document.getElementById('togglePass').addEventListener('click', () => {
    const showing = passEl.type === 'text';
    passEl.type = showing ? 'password' : 'text';
    document.getElementById('togglePass').textContent = showing ? '👁' : '🙈';
    passEl.focus();
});
