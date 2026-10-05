/* ==========================================================================
   config.js — ثوابت المشروع وإعداداته الافتراضية
   ========================================================================== */

/* --- 1. معلومات التطبيق --- */
export const APP_CONFIG = {
  name: 'ورشة تفصيل الجلابيب',
  nameEn: 'Jalabiya Workshop',
  version: '3.0.0',
  versionLabel: 'V3',
  buildDate: '2026',
  repo: 'https://github.com/hema0-a/jalabiya-v3',
  locale: 'ar-EG',
  timezone: 'Africa/Cairo',
  currency: 'EGP',
  currencySymbol: 'ج.م',
  phoneCountryCode: '+20',
};

/* --- 2. ثوابت التاريخ العربي --- */
export const DAY_NAMES_SHORT = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
export const DAY_NAMES_FULL  = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
export const MONTH_NAMES     = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

/* --- 3. إعدادات IndexedDB --- */
export const DB_CONFIG = {
  name: 'jalabiya_v3',
  version: 2,
};

/* --- 4. أسماء المخازن --- */
export const STORES = {
  CUSTOMERS:    'customers',
  ORDERS:       'orders',
  PAYMENTS:     'payments',
  INVENTORY:    'inventory',
  WORKERS:      'workers',
  EXPENSES:     'expenses',
  APPOINTMENTS: 'appointments',
  SETTINGS:     'settings',
  TRASH:        'trash',
  ACTIVITY:     'activity',
};

/* --- 5. المناسبات الافتراضية (7) --- */
export const DEFAULT_OCCASIONS = [
  { id: 'ramadan',      name: 'رمضان',                 month: 3, day: 1,  icon: '🌙', alertDays: 30, recurring: true, enabled: true },
  { id: 'eid-fitr',     name: 'عيد الفطر',             month: 4, day: 10, icon: '🎉', alertDays: 21, recurring: true, enabled: true },
  { id: 'eid-adha',     name: 'عيد الأضحى',            month: 6, day: 10, icon: '🐑', alertDays: 21, recurring: true, enabled: true },
  { id: 'mawlid',       name: 'المولد النبوي',          month: 9, day: 12, icon: '🕌', alertDays: 14, recurring: true, enabled: true },
  { id: 'school-start', name: 'بداية العام الدراسي',    month: 9, day: 1,  icon: '🎓', alertDays: 30, recurring: true, enabled: true },
  { id: 'new-year',     name: 'رأس السنة',             month: 1, day: 1,  icon: '🎊', alertDays: 14, recurring: true, enabled: true },
  { id: 'mothers-day',  name: 'عيد الأم',              month: 3, day: 21, icon: '💐', alertDays: 14, recurring: true, enabled: true },
];

/* --- 6. الخلفيات الإبداعية (5) --- */
export const BACKGROUNDS = [
  { id: 'none',      name: 'بدون' },
  { id: 'fabric',    name: 'قماش' },
  { id: 'sewing',    name: 'خياطة' },
  { id: 'geometric', name: 'هندسي' },
  { id: 'paper',     name: 'ورقي' },
];

/* --- 7. أنماط الأيقونات (3) --- */
export const ICON_STYLES = [
  { id: 'default',        name: 'افتراضي' },
  { id: 'colored-badges', name: 'شارات ملونة' },
  { id: 'line',           name: 'خطي بسيط' },
];

/* --- 8. الخطوط (5) --- */
export const FONT_FAMILIES = [
  { id: 'ibm-plex',   name: 'IBM Plex Sans Arabic', font: "'IBM Plex Sans Arabic', system-ui" },
  { id: 'cairo',      name: 'Cairo',                font: "'Cairo', system-ui" },
  { id: 'tajawal',    name: 'Tajawal',              font: "'Tajawal', system-ui" },
  { id: 'almarai',    name: 'Almarai',              font: "'Almarai', system-ui" },
  { id: 'noto-kufi',  name: 'Noto Kufi Arabic',     font: "'Noto Kufi Arabic', system-ui" },
];

/* --- 9. أحجام الخطوط (4) --- */
export const FONT_SIZES = [
  { id: 'small',  name: 'صغير',       factor: 0.9  },
  { id: 'normal', name: 'متوسط',      factor: 1.0  },
  { id: 'large',  name: 'كبير',       factor: 1.12 },
  { id: 'xlarge', name: 'كبير جداً',  factor: 1.25 },
];

/* --- 10. أيام الأسبوع --- */
export const WEEKDAYS = [
  { id: 0, name: 'الأحد' },
  { id: 1, name: 'الاثنين' },
  { id: 2, name: 'الثلاثاء' },
  { id: 3, name: 'الأربعاء' },
  { id: 4, name: 'الخميس' },
  { id: 5, name: 'الجمعة' },
  { id: 6, name: 'السبت' },
];

/* --- 11. الإعدادات الافتراضية (22 قسماً) --- */
export const DEFAULT_SETTINGS = {
  /* 1. معلومات الورشة */
  workshop: { name: '', logo: '', address: '', phone: '', whatsapp: '' },

  /* 2. المظهر والتخصيص */
  appearance: {
    theme: 'classic',
    primaryColor: '#1F6D57',
    accentColor: '#B8863B',
    backgroundColor: '#F6F1E6',
    backgroundPattern: 'none',
    iconStyle: 'default',
  },

  /* 3. أوضاع العرض */
  display: {
    darkMode: false,
    highContrast: false,
    compactMode: false,
    clientMode: false,
    fontSize: 'normal',
    fontFamily: 'ibm-plex',
  },

  /* 4. حقول المقاسات */
  measurementFields: [
    { id: 'shoulder', name: 'الكتف',   enabled: true, unit: 'cm' },
    { id: 'chest',    name: 'الصدر',   enabled: true, unit: 'cm' },
    { id: 'waist',    name: 'الوسط',   enabled: true, unit: 'cm' },
    { id: 'hips',     name: 'الأرداف', enabled: true, unit: 'cm' },
    { id: 'length',   name: 'الطول',   enabled: true, unit: 'cm' },
    { id: 'sleeve',   name: 'الكم',    enabled: true, unit: 'cm' },
    { id: 'neck',     name: 'الرقبة',  enabled: true, unit: 'cm' },
  ],

  /* 5. أنواع الجلابيات */
  jalabiyaTypes: [],

  /* 6. المواسم والأعياد */
  occasions: DEFAULT_OCCASIONS,

  /* 7. التنبيهات */
  notifications: {
    seasons: true,
    appointments: true,
    inventory: true,
    debts: true,
    leadDays: 2,
  },

  /* 8. المخزون والحدود */
  inventory: {
    minThreshold: 5,
    alertOnFabricLow: true,
    alertOnProductLow: true,
  },

  /* 9. الحد اليومي + يوم الإجازة */
  dailyLimit: {
    dailyOrderLimit: 700,
    fabricPickupAlertDays: 2,
    dayOffWeekday: 0,
  },

  /* 10. تجميع الطلبات المتشابهة */
  grouping: {
    enabled: false,
    tolerance: 2,
    sameTypeOnly: true,
  },

  /* 11. حاسبة التسعير */
  pricingCalculator: {
    enableFabric: true,
    enableLabor: true,
    enableExtras: true,
    enableOverhead: true,
    defaultMargin: 30,
    marginPresets: [20, 30, 50, 100],
    saveHistory: true,
    enableCreateOrder: true,
    maxHistoryItems: 50,
  },

  /* 12. الرسائل التلقائية */
  autoMessages: {
    enabled: true,
    templates: {},
  },

  /* 13. النسخ الاحتياطي */
  backup: {
    autoBackup: true,
    intervalHours: 24,
  },

  /* 14. المزامنة السحابية */
  cloudSync: {
    enabled: false,
    lastSyncAt: null,
  },

  /* 15. ضغط الصور */
  imageCompression: {
    quality: 0.85,
    maxSizeKB: 500,
    maxDimensionPx: 1600,
  },

  /* 16. الأمان */
  security: {
    autoLock: true,
    lockAfterMinutes: 5,
    sessionDurationHours: 24,
    logLoginAttempts: true,
  },

  /* 17. شاشة القفل */
  lockScreen: {
    background: null,
    message: 'أدخل الرقم السري للدخول',
    showLogo: true,
  },
};

/* --- 12. الثيمات الجاهزة (9) --- */
export const THEMES = [
  { id: 'classic',  name: 'كلاسيكي',   emoji: '🟢', primary: '#1F6D57', accent: '#B8863B', bg: '#F6F1E6' },
  { id: 'modern',   name: 'عصري',      emoji: '🔵', primary: '#1565C0', accent: '#4FC3F7', bg: '#F5F8FC' },
  { id: 'purple',   name: 'بنفسجي',    emoji: '🟣', primary: '#6A1B9A', accent: '#EC407A', bg: '#F8F2FA' },
  { id: 'warm',     name: 'دافئ',      emoji: '🔴', primary: '#C62828', accent: '#F57C00', bg: '#FBF3EF' },
  { id: 'simple',   name: 'بسيط',      emoji: '⚫', primary: '#424242', accent: '#757575', bg: '#F5F5F5' },
  { id: 'pink',     name: 'وردي',      emoji: '🌸', primary: '#AD1457', accent: '#F06292', bg: '#FDF2F6' },
  { id: 'nature',   name: 'طبيعي',     emoji: '🌿', primary: '#2E7D32', accent: '#9CCC65', bg: '#F1F8E9' },
  { id: 'luxury',   name: 'أسود فاخر', emoji: '🖤', primary: '#111111', accent: '#D4AF37', bg: '#1A1A1A' },
  { id: 'ocean',    name: 'أزرق بحري', emoji: '🌊', primary: '#0D47A1', accent: '#26C6DA', bg: '#E8F4F8' },
];

/* --- 13. إعدادات Firebase --- */
export const FIREBASE_CONFIG = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
};

/* --- 14. مسار بيانات V3 --- */
export const FIRESTORE_PATHS = {
  base: 'users_v3',
  dataMain: 'data/main',
};

/* --- 15. مفاتيح localStorage --- */
export const STORAGE_KEYS = {
  V2_DB:              'jalabiya_v2_db',
  V2_SETTINGS:        'jalabiya_v2_settings',
  V2_SESSION:         'jalabiya_v2_session',
  V2_FAILED_ATTEMPTS: 'jalabiya_v2_failed_attempts',
  V2_AUTO_BACKUPS:    'jalabiya_v2_auto_backups',

  V3_THEME:           'jalabiya_v3_theme',
  V3_SESSION:         'jalabiya_v3_session',
  V3_PIN_HASH:        'jalabiya_v3_pin_hash',
  V3_PIN_SALT:        'jalabiya_v3_pin_salt',
  V3_LAST_SYNC:       'jalabiya_v3_last_sync',
  V3_MIGRATED:        'jalabiya_v3_migrated',
  V3_FAILED_ATTEMPTS: 'jalabiya_v3_failed_attempts',
  V3_LOCK_UNTIL:      'jalabiya_v3_lock_until',
  V3_OFFLINE_QUEUE:   'jalabiya_v3_offline_queue',
  V3_PRICING_HISTORY: 'jalabiya_v3_pricing_history',
  V3_CALENDAR_FILTER: 'jalabiya_v3_calendar_filter',
};

/* --- 16. الحدود القصوى --- */
export const LIMITS = {
  maxActivityLog:  500,
  maxTrashItems:   200,
  maxBackups:      7,
  maxPinAttempts:  5,
  pinLockSeconds:  30,
  maxImageSizeKB:  500,
  maxCustomers:    10000,
  maxOrders:       50000,
  saveDebounceMs:  300,
};

/* --- 17. إعدادات المزامنة --- */
export const SYNC_CONFIG = {
  debounceMs:     30000,
  maxRetries:     3,
  retryDelayMs:   2000,
  offlineCheckMs: 30000,
};
