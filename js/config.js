// ============================================================
// إعدادات المشروع — لوحة عائلة الشجعان
// ------------------------------------------------------------
// نفس مشروع Firebase المستخدم في "سجل متابعة الحلقات"، فقاعدة
// البيانات واحدة تماماً. هذه القيم عامة بطبيعتها (Google تصممها
// لتُنشر في الواجهة)، والحماية الحقيقية في firestore.rules.
// ============================================================

export const FIREBASE_CONFIG = {
    apiKey:            "AIzaSyCdzF1zwILRz7NfFijnysRlrvdNJequtWM",
    authDomain:        "quran-halaqa-tracker.firebaseapp.com",
    projectId:         "quran-halaqa-tracker",
    storageBucket:     "quran-halaqa-tracker.firebasestorage.app",
    messagingSenderId: "267409194006",
    appId:             "1:267409194006:web:0071ab29578228d366c937"
};

// ============================================================
// القائمة البيضاء — حساب واحد فقط مصرّح له بدخول هذه اللوحة.
// أي بريد آخر يُسجَّل خروجه فوراً وتظهر رسالة "الوصول مرفوض".
// ------------------------------------------------------------
// ملاحظة: هذا فحص في المتصفح لتحسين التجربة فقط. المنع الحقيقي
// موجود في firestore.rules (انظر ملف firestore.rules في المجلد).
// ============================================================
export const ALLOWED_EMAIL = 'hazzatiger2023@gmail.com';

// ── المراحل الثلاث (مطابقة لسجل متابعة الحلقات) ──────────────
export const LEVELS = [
    { id: 'highschool',   nameAr: 'ثانوي',   fullNameAr: 'المرحلة الثانوية' },
    { id: 'middleschool', nameAr: 'متوسط',   fullNameAr: 'المرحلة المتوسطة' },
    { id: 'elementary',   nameAr: 'ابتدائي', fullNameAr: 'المرحلة الابتدائية' }
];

export const LEVEL_NAMES = LEVELS.reduce((a, l) => (a[l.id] = l.nameAr, a), {});

// ── أسماء المجموعات في Firestore ────────────────────────────
export const COL_LEVELS   = 'levels';
export const COL_STUDENTS = 'students';
export const COL_RECORDS  = 'records';
export const COL_ADJUST   = 'pointsAdjustments';
export const COL_FAMILY   = 'family_config';
export const FAMILY_DOC   = 'brave_family';

export const FAMILY_NAME  = 'عائلة الشجعان';

// قيم الحضور كما تكتبها لوحة المعلّم
export const ATT_PRESENT = 'حاضر';
export const ATT_LATE    = 'متأخر';
export const ATT_ABSENT  = 'غائب';
export const ATT_EXCUSED = 'معذور';
