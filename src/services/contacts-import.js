/* ==========================================================================
   contacts-import.js — استيراد العملاء من جهات الاتصال (v3.3.66)
   ==========================================================================
   مصدران: منتقي جهات الاتصال في المتصفح (Contact Picker API — أندرويد/كروم)
   أو ملف vCard (.vcf) مُصدَّر من أي هاتف. حسابات نقية بلا DOM.
   ========================================================================== */

import { normalizePhone, toLatinDigits } from '../core/utils.js';
import { phoneKey, looseNameKey } from './customer-merge.js';

/** فكّ التفاف سطور vCard (السطر المُكمِّل يبدأ بمسافة/Tab). */
function unfold(text) {
  return String(text || '').replace(/\r\n|\r/g, '\n').replace(/\n[ \t]/g, '');
}

/** فكّ ترميز quoted-printable (UTF-8) إن وُجد. */
function decodeQP(v) {
  try {
    const bytes = [];
    const s = v.replace(/=\n/g, '');
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(s.substr(i + 1, 2))) { bytes.push(parseInt(s.substr(i + 1, 2), 16)); i += 2; }
      else bytes.push(s.charCodeAt(i));
    }
    return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
  } catch { return v; }
}

const unescapeV = (v) => String(v).replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();

/**
 * @param {string} text محتوى ملف .vcf
 * @returns {Array<{name:string, phones:string[]}>}
 */
export function parseVCards(text) {
  const out = [];
  let cur = null;
  for (const raw of unfold(text).split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (/^BEGIN:VCARD/i.test(line)) { cur = { name: '', n: '', phones: [] }; continue; }
    if (/^END:VCARD/i.test(line)) {
      if (cur) {
        const name = (cur.name || cur.n || '').replace(/\s+/g, ' ').trim();
        if (name || cur.phones.length) out.push({ name, phones: cur.phones });
      }
      cur = null; continue;
    }
    if (!cur) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const head = line.slice(0, idx);
    let val = line.slice(idx + 1);
    const prop = head.split(';')[0].toUpperCase().replace(/^ITEM\d+\./, '');
    if (/ENCODING=QUOTED-PRINTABLE/i.test(head)) val = decodeQP(val);
    if (prop === 'FN') cur.name = unescapeV(val);
    else if (prop === 'N') {
      const p = val.split(';').map((x) => unescapeV(x));
      cur.n = [p[1], p[2], p[0]].filter(Boolean).join(' ');   /* الاسم الأول + الأوسط + العائلة */
    } else if (prop === 'TEL') {
      const v = unescapeV(val);
      if (v) cur.phones.push(v);
    }
  }
  return out;
}

/** رقم محمول مصري بصيغة محلية 01xxxxxxxxx، أو '' إن لم يكن محمولاً مصرياً صالحاً. */
export function toLocalMobile(phone) {
  const n = normalizePhone(phone);                 /* +201012345678 أو النص كما هو */
  const m = /^\+20(1[0125]\d{8})$/.exec(toLatinDigits(n).replace(/\s/g, ''));
  return m ? '0' + m[1] : '';
}

/** أول رقم محمول مصري صالح من قائمة أرقام (وإلا ''). */
export function pickMobile(phones) {
  for (const p of phones || []) { const l = toLocalMobile(p); if (l) return l; }
  return '';
}

/**
 * يجهّز خطة الاستيراد: صف لكل جهة اتصال بحالتها.
 * status: new | dup-phone (نفس رقم عميل موجود) | dup-file (مكرر داخل الملف) | dup-name (نفس اسم عميل بلا تطابق رقم) | no-phone
 * selected الافتراضي: new فقط.
 * @param {Array<{name:string, phones:string[]}>} contacts
 * @param {Array} existing عملاء التطبيق الحاليون
 */
export function planImport(contacts, existing) {
  const byPhone = new Map();
  const byName = new Map();
  for (const c of Array.isArray(existing) ? existing : []) {
    const pk = phoneKey(c && c.phone);
    if (pk) byPhone.set(pk, c);
    const nk = looseNameKey(c && c.name);
    if (nk && !byName.has(nk)) byName.set(nk, c);
  }
  const seen = new Set();
  const rows = [];
  for (const raw of Array.isArray(contacts) ? contacts : []) {
    const name = String((raw && raw.name) || '').replace(/\s+/g, ' ').trim();
    const phone = pickMobile(raw && raw.phones);
    if (!name && !phone) continue;
    let status = 'new';
    let match = null;
    const pk = phoneKey(phone);
    if (!phone) status = 'no-phone';
    else if (byPhone.has(pk)) { status = 'dup-phone'; match = byPhone.get(pk); }
    else if (seen.has(pk)) status = 'dup-file';
    else if (byName.has(looseNameKey(name))) { status = 'dup-name'; match = byName.get(looseNameKey(name)); }
    if (!name) status = status === 'new' ? 'new' : status;
    if (pk) seen.add(pk);
    rows.push({ name: name || phone, phone, status, matchName: match ? match.name : '', selected: status === 'new' });
  }
  const counts = {};
  rows.forEach((r) => { counts[r.status] = (counts[r.status] || 0) + 1; });
  return { rows, counts, selectedCount: rows.filter((r) => r.selected).length };
}

/** يحوّل نتيجة Contact Picker ([{name:[],tel:[]}]) إلى الصيغة الموحّدة. */
export function fromPickerResult(list) {
  return (Array.isArray(list) ? list : []).map((c) => ({
    name: Array.isArray(c && c.name) ? String(c.name[0] || '') : String((c && c.name) || ''),
    phones: Array.isArray(c && c.tel) ? c.tel.map(String) : [],
  }));
}

export const STATUS_LABELS = {
  new: 'جديد',
  'dup-phone': 'مسجّل بنفس الرقم',
  'dup-file': 'مكرر في الملف',
  'dup-name': 'نفس الاسم (رقم مختلف)',
  'no-phone': 'بلا رقم محمول مصري',
};
