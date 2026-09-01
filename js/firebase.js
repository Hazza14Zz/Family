// ============================================================
// تهيئة Firebase — الإصدار المعياري (Modular SDK v10 / v9+)
// ------------------------------------------------------------
// لا يوجد أي ملف مشترك مع مشروع "سجل متابعة الحلقات"؛ هذا الموقع
// مستقل ١٠٠٪ ويشترك معه في قاعدة البيانات فقط.
// ============================================================

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
    getAuth, setPersistence, browserLocalPersistence,
    signInWithEmailAndPassword, signOut, onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
    getFirestore, collection, doc, getDoc, setDoc, getDocs, query, where
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

import { FIREBASE_CONFIG } from './config.js';

export const app  = initializeApp(FIREBASE_CONFIG);
export const auth = getAuth(app);
export const db   = getFirestore(app);

// الجلسة تبقى بعد إغلاق التبويب — لوحة عائلية شخصية على جهاز واحد
setPersistence(auth, browserLocalPersistence)
    .catch(e => console.warn('تعذّر ضبط نوع الجلسة:', e));

// نُعيد تصدير ما تحتاجه بقية الملفات، فلا تستورد أي صفحة من CDN مرّتين
export {
    signInWithEmailAndPassword, signOut, onAuthStateChanged,
    collection, doc, getDoc, setDoc, getDocs, query, where
};
