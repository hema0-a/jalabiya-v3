/* ==========================================================================
   config.js — ثوابت المشروع وإعداداته الافتراضية
   ==========================================================================
   لا يحتوي على أي منطق تنفيذي — فقط كائنات ثابتة (Constants).
   يُستورَد من كل ملفات المشروع.
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

/* --- 2. إعدادات IndexedDB --- */
export const DB_CONFIG = {
  name: 'jalabiya_v3',
  version: 1,
};

/* --- 3. أسماء المخازن (Stores) --- */
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

/* --- 4. الإعدادات الافتراضية --- */
export const DEFAULT_SETTINGS = {
  workshop: { name: '', logo: '', address: '', phone: '', whatsapp: '' },

  appearance: {
    theme: 'classic',
    primaryColor: '#1F6D57',
    accentColor: '#B8863B',
    backgroundColor: '#F6F1E6',
    backgroundPattern: 'none',
    iconStyle: 'default',
  },

  display: {
    darkMode: false,
    highContrast: false,
    compactMode: false,
    clientMode: false,
    fontSize: 'medium',
    fontFamily: 'ibm-plex',
  },

  measurementFields: [
    { id: 'shoulder', name: 'الكتف',   enabled: true, unit: 'cm' },
    { id: 'chest',    name: 'الصدر',   enabled: true, unit: 'cm' },
    { id: 'waist',    name: 'الوسط',   enabled: true, unit: 'cm' },
    { id: 'hips',     name: 'الأرداف', enabled: true, unit: 'cm' },
    { id: 'length',   name: 'الطول',   enabled: true, unit: 'cm' },
    { id: 'sleeve',   name: 'الكم',    enabled: true, unit: 'cm' },
    { id: 'neck',     name: 'الرقبة',  enabled: true, unit: 'cm' },
  ],

  notifications: {
    seasons: true,
    appointments: true,
    inventory: true,
    debts: true,
    leadDays: 2,
  },

  inventory: {
    minThreshold: 5,
    alertOnFabricLow: true,
    alertOnProductLow: true,
  },

  backup: {
    autoBackup: true,
    intervalHours: 24,
  },

  security: {
    autoLock: true,
    lockAfterMinutes: 5,
    sessionDurationHours: 24,
    logLoginAttempts: true,
  },

  imageCompression: {
    quality: 0.85,
    maxSizeKB: 500,
    maxDimensionPx: 1600,
  },
};

/* --- 5. الثيمات الجاهزة (9) --- */
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

/* --- 6. إعدادات Firebase (تُملأ لاحقاً) --- */
export const FIREBASE_CONFIG = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
};

/* --- 7. مسار بيانات V3 في Firestore --- */
export const FIRESTORE_PATHS = {
  base: 'users_v3',
  dataMain: 'data/main',
};

/* --- 8. مفاتيح localStorage --- */
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
};

/* --- 9. الحدود القصوى (MAX limits) --- */
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

/* --- 10. إعدادات المزامنة (Sync) --- */
export const SYNC_CONFIG = {
  debounceMs:     30000,
  maxRetries:     3,
  retryDelayMs:   2000,
  offlineCheckMs: 30000,
};
