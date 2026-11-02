/* ==========================================================================
   custom-fonts.js — خطوط يضيفها المستخدم (v3.5.30)
   ==========================================================================
   نوعان:
   - file   : ملف خط (ttf/otf/woff/woff2) يُرفع من الجوال ويُحفظ على الجهاز في IndexedDB
              مستقلة (jalabiya-fonts) فيعمل بدون إنترنت، ولا يدخل في النسخة الاحتياطية.
   - google : خط من Google Fonts بالاسم (يحتاج إنترنت أول مرة؛ بدونه يُستعمل الخط البديل).
   بيانات الوصف (id / name / kind) تُحفظ في settings.display.customFonts (محلية للجهاز).
   - لا يُستعمل innerHTML ولا eval؛ الأسماء تُنقّى قبل دخولها أي CSS أو رابط.
   - FontFace من ArrayBuffer لا يحتاج تعديل سياسة الأمان (لا طلب شبكة).
   ========================================================================== */

export const MAX_FONT_BYTES = 3 * 1024 * 1024;
export const MAX_CUSTOM_FONTS = 6;
export const FONT_EXTS = ['ttf', 'otf', 'woff', 'woff2'];
export const CUSTOM_PREFIX = 'custom:';

const DB_NAME = 'jalabiya-fonts';
const STORE = 'fonts';
const GOOGLE_TIMEOUT_MS = 8000;

/* ---------- منطق نقي ---------- */

export function isCustomId(v) { return typeof v === 'string' && v.startsWith(CUSTOM_PREFIX) && v.length > CUSTOM_PREFIX.length; }
export function customValue(id) { return CUSTOM_PREFIX + id; }
export function entryIdOf(v) { return isCustomId(v) ? v.slice(CUSTOM_PREFIX.length) : ''; }

/** تنقية اسم خط للعرض: بلا رموز CSS/HTML، مسافات مفردة، حد 40 حرفاً. */
export function sanitizeFontName(s) {
  const t = String(s == null ? '' : s).replace(/[<>"'`\;{}:()\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim();
  return t.slice(0, 40);
}

/** اسم خط Google: حروف لاتينية وأرقام ومسافات فقط (2–40). يعيد '' إن لم يصلح. */
export function sanitizeGoogleName(s) {
  const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return /^[A-Za-z0-9][A-Za-z0-9 ]{1,39}$/.test(t) ? t : '';
}

export function fontNameFromFile(fileName) {
  const base = String(fileName || '').replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
  return sanitizeFontName(base) || 'خط مخصص';
}

export function fileExt(fileName) {
  const m = /\.([A-Za-z0-9]+)$/.exec(String(fileName || ''));
  return m ? m[1].toLowerCase() : '';
}

/** @returns {{ok:boolean, reason?:string}} */
export function validateFontFile(file) {
  if (!file || typeof file.size !== 'number') return { ok: false, reason: 'لم يتم اختيار ملف' };
  if (!FONT_EXTS.includes(fileExt(file.name))) return { ok: false, reason: 'نوع الملف غير مدعوم (المسموح: ttf و otf و woff و woff2)' };
  if (file.size <= 0) return { ok: false, reason: 'الملف فارغ' };
  if (file.size > MAX_FONT_BYTES) return { ok: false, reason: 'حجم الخط أكبر من 3 ميجابايت' };
  return { ok: true };
}

export function makeFontId() {
  return 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6).replace(/[^a-z0-9]/g, 'x');
}

/** اسم العائلة في CSS: لخط الملف معرّف داخلي، ولخط Google اسمه. */
export function cssFamily(entry) {
  return entry.kind === 'google' ? entry.name : 'jf-' + entry.id;
}

/** قائمة الخطوط المحفوظة بعد التحقق (تُسقط التالف والمكرر وما فوق الحد). */
export function normalizeCustomFonts(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const e of list) {
    if (!e || typeof e !== 'object') continue;
    const id = typeof e.id === 'string' && /^[A-Za-z0-9]{1,40}$/.test(e.id) ? e.id : '';
    const kind = e.kind === 'google' || e.kind === 'file' ? e.kind : '';
    const name = kind === 'google' ? sanitizeGoogleName(e.name) : sanitizeFontName(e.name);
    if (!id || !kind || !name || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, kind, name });
    if (out.length >= MAX_CUSTOM_FONTS) break;
  }
  return out;
}

export function findEntry(list, id) {
  return normalizeCustomFonts(list).find((e) => e.id === id) || null;
}

export function googleCssUrl(name, withWeights = true) {
  const fam = encodeURIComponent(name).replace(/%20/g, '+');
  return 'https://fonts.googleapis.com/css2?family=' + fam + (withWeights ? ':wght@400;500;600;700' : '') + '&display=swap';
}

/* ---------- تخزين ملفات الخطوط (IndexedDB مستقلة) ---------- */

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('التخزين غير متاح في هذا المتصفح')); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('تعذّر فتح تخزين الخطوط'));
  });
}

async function withStore(mode, fn) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const r = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(r && 'result' in r ? r.result : undefined);
      tx.onerror = () => reject(tx.error || new Error('فشل حفظ الخط'));
      tx.onabort = () => reject(tx.error || new Error('فشل حفظ الخط (ربما المساحة ممتلئة)'));
    });
  } finally { db.close(); }
}

export const fontStore = {
  put: (id, buf) => withStore('readwrite', (s) => s.put(buf, id)),
  get: (id) => withStore('readonly', (s) => s.get(id)),
  del: (id) => withStore('readwrite', (s) => s.delete(id)),
  clear: () => withStore('readwrite', (s) => s.clear()),
};

/* ---------- التحميل في الصفحة ---------- */

const pending = new Map();   /* id → Promise<boolean> */

function loadFileFace(entry, buf) {
  const face = new FontFace(cssFamily(entry), buf);
  return face.load().then(() => { document.fonts.add(face); return face; });
}

function addGoogleLink(name, withWeights) {
  return new Promise((resolve) => {
    let done = false;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = googleCssUrl(name, withWeights);
    link.setAttribute('data-font-link', 'g:' + name);
    const finish = (ok) => { if (done) return; done = true; if (!ok) link.remove(); resolve(ok); };
    link.onload = () => finish(true);
    link.onerror = () => finish(false);
    setTimeout(() => finish(false), GOOGLE_TIMEOUT_MS);
    document.head.appendChild(link);
  });
}

/** يضمن تحميل خط مضاف (مرة واحدة). لا يرمي؛ يعيد true عند النجاح. */
export function ensureCustomFont(entry) {
  if (!entry) return Promise.resolve(false);
  if (pending.has(entry.id)) return pending.get(entry.id);
  const p = (async () => {
    try {
      if (entry.kind === 'google') {
        if (document.head.querySelector('link[data-font-link="g:' + entry.name + '"]')) return true;
        if (await addGoogleLink(entry.name, true)) return true;
        return await addGoogleLink(entry.name, false);
      }
      const buf = await fontStore.get(entry.id);
      if (!buf) return false;
      await loadFileFace(entry, buf);
      return true;
    } catch (e) { return false; }
  })();
  pending.set(entry.id, p);
  p.then((ok) => { if (!ok) pending.delete(entry.id); });
  return p;
}

/**
 * إضافة خط من ملف: يتحقق منه بتحميله فعلياً ثم يحفظه.
 * @returns {Promise<{entry:Object}|{error:string}>}
 */
export async function addFontFile(file, existing = []) {
  if (normalizeCustomFonts(existing).length >= MAX_CUSTOM_FONTS) return { error: 'وصلت للحد الأقصى (' + MAX_CUSTOM_FONTS + ' خطوط). احذف خطاً أولاً.' };
  const v = validateFontFile(file);
  if (!v.ok) return { error: v.reason };
  const entry = { id: makeFontId(), kind: 'file', name: fontNameFromFile(file.name) };
  let buf;
  try { buf = await file.arrayBuffer(); } catch (e) { return { error: 'تعذّر قراءة الملف' }; }
  try { await loadFileFace(entry, buf); } catch (e) { return { error: 'الملف ليس خطاً صالحاً' }; }
  try { await fontStore.put(entry.id, buf); } catch (e) { return { error: 'تعذّر حفظ الخط على الجهاز: ' + (e && e.message ? e.message : '') }; }
  pending.set(entry.id, Promise.resolve(true));
  return { entry };
}

/** إضافة خط من Google Fonts بالاسم. */
export async function addGoogleFont(rawName, existing = []) {
  const list = normalizeCustomFonts(existing);
  if (list.length >= MAX_CUSTOM_FONTS) return { error: 'وصلت للحد الأقصى (' + MAX_CUSTOM_FONTS + ' خطوط). احذف خطاً أولاً.' };
  const name = sanitizeGoogleName(rawName);
  if (!name) return { error: 'اكتب اسم الخط بالإنجليزية كما في Google Fonts (مثل: Amiri أو Reem Kufi)' };
  if (list.some((e) => e.kind === 'google' && e.name.toLowerCase() === name.toLowerCase())) return { error: 'هذا الخط مضاف بالفعل' };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { error: 'تحتاج اتصالاً بالإنترنت لإضافة خط من Google' };
  const entry = { id: makeFontId(), kind: 'google', name };
  const ok = (await addGoogleLink(name, true)) || (await addGoogleLink(name, false));
  if (!ok) return { error: 'لم نجد خطاً بهذا الاسم في Google Fonts (تأكد من الإملاء)' };
  pending.set(entry.id, Promise.resolve(true));
  return { entry };
}

/** حذف خط مضاف (ملفه من الجهاز، أو رابطه من الصفحة). */
export async function removeCustomFont(entry) {
  if (!entry) return;
  pending.delete(entry.id);
  try {
    if (entry.kind === 'google') {
      document.head.querySelectorAll('link[data-font-link="g:' + entry.name + '"]').forEach((l) => l.remove());
    } else {
      try { for (const f of Array.from(document.fonts)) if (f.family.replace(/["']/g, '') === cssFamily(entry)) document.fonts.delete(f); } catch (e) { /* لا شيء */ }
      await fontStore.del(entry.id);
    }
  } catch (e) { /* الحذف من الإعدادات يكفي */ }
}
