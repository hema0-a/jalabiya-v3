/* ==========================================================================
   contacts-import-dialog.js — استيراد العملاء من جهات الاتصال (v3.3.66)
   ========================================================================== */

import { el } from '../core/dom.js';
import { modal } from './modal.js';
import { toast } from './toast.js';
import { customers } from '../data/repos/customers.js';
import { parseVCards, planImport, fromPickerResult, STATUS_LABELS } from '../services/contacts-import.js';

export const pickerSupported = () => typeof navigator !== 'undefined' && !!(navigator.contacts && navigator.contacts.select);

async function readFile(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(r.error || new Error('تعذّرت قراءة الملف'));
    r.readAsText(file, 'utf-8');
  });
}

/** يعرض قائمة المراجعة ويستورد المحدَّد. contacts = [{name, phones[]}] */
export async function reviewAndImport(contacts, { onDone } = {}) {
  let existing = [];
  try { existing = await customers.list(); } catch { /* ignore */ }
  const plan = planImport(contacts, existing);
  if (!plan.rows.length) { toast.warning('لا توجد جهات اتصال صالحة للاستيراد'); return null; }

  const countEl = el('div', { className: 'cimport__count' });
  const list = el('div', { className: 'cimport__list' });
  const boxes = plan.rows.map((r, i) => {
    const cb = el('input', { type: 'checkbox', 'data-i': String(i) });
    cb.checked = r.selected;
    cb.addEventListener('change', () => { r.selected = cb.checked; refresh(); });
    list.appendChild(el('label', { className: 'cimport__row cimport__row--' + r.status }, [
      cb,
      el('span', { className: 'cimport__main' }, [
        el('span', { className: 'cimport__name' }, r.name),
        el('span', { className: 'cimport__phone' }, r.phone || '—'),
      ]),
      r.status === 'new' ? null : el('span', { className: 'cimport__tag' },
        STATUS_LABELS[r.status] + (r.matchName ? ': ' + r.matchName : '')),
    ].filter(Boolean)));
    return cb;
  });
  const importBtnRef = { text: '' };
  function refresh() {
    const n = plan.rows.filter((r) => r.selected).length;
    countEl.textContent = 'المحدَّد ' + n + ' من ' + plan.rows.length +
      (plan.counts['dup-phone'] ? ' — ' + plan.counts['dup-phone'] + ' مسجّل مسبقاً' : '');
    const b = document.querySelector('.modal [data-action="do-import"]');
    if (b) { b.disabled = n === 0; b.textContent = 'استيراد (' + n + ')'; }
    importBtnRef.n = n;
  }
  const selectBtn = (txt, fn) => el('button', { className: 'btn btn--sm btn--ghost', type: 'button', onClick: fn }, txt);
  const body = el('div', { className: 'cimport' }, [
    countEl,
    el('div', { className: 'cimport__tools' }, [
      selectBtn('تحديد الجدد', () => { plan.rows.forEach((r, i) => { r.selected = r.status === 'new'; boxes[i].checked = r.selected; }); refresh(); }),
      selectBtn('تحديد الكل', () => { plan.rows.forEach((r, i) => { r.selected = true; boxes[i].checked = true; }); refresh(); }),
      selectBtn('إلغاء الكل', () => { plan.rows.forEach((r, i) => { r.selected = false; boxes[i].checked = false; }); refresh(); }),
    ]),
    list,
  ]);

  const handle = modal.open({
    title: '📇 استيراد العملاء', body, closable: true,
    actions: [
      { text: 'إلغاء', variant: 'ghost', action: 'cancel', onClick: () => handle.close() },
      {
        text: 'استيراد', variant: 'primary', action: 'do-import',
        onClick: async () => {
          const chosen = plan.rows.filter((r) => r.selected);
          if (!chosen.length) return;
          let ok = 0; let fail = 0;
          for (const r of chosen) {
            try { await customers.create({ name: r.name, phone: r.phone, address: '', notes: '', vip: false, image: '', measurements: {}, familyHeadId: '' }); ok++; }
            catch { fail++; }
          }
          handle.close();
          toast[fail ? 'warning' : 'success']('تم استيراد ' + ok + ' عميل' + (fail ? ' (فشل ' + fail + ')' : ''));
          if (typeof onDone === 'function') await onDone(ok);
        },
      },
    ],
  });
  setTimeout(refresh, 0);
  return { handle, plan };
}

/** نقطة الدخول: يختار المصدر (جهات اتصال الجهاز أو ملف vCard). */
export function openContactsImport(opts = {}) {
  const fileInput = el('input', { type: 'file', accept: '.vcf,text/vcard,text/x-vcard,text/directory', style: { display: 'none' }, 'data-role': 'vcf-input' });
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files && fileInput.files[0];
    if (!f) return;
    try {
      const contacts = parseVCards(await readFile(f));
      if (!contacts.length) { toast.warning('لم أجد جهات اتصال في الملف'); return; }
      h.close();
      await reviewAndImport(contacts, opts);
    } catch (e) { toast.danger('تعذّرت قراءة الملف: ' + (e && e.message ? e.message : e)); }
  });
  const choice = (icon, title, sub, onClick, attrs = {}) => el('button', { className: 'btn btn--secondary btn--block cimport__choice', type: 'button', onClick, ...attrs }, [
    el('span', { className: 'cimport__choice-title' }, icon + ' ' + title),
    el('span', { className: 'cimport__choice-sub' }, sub),
  ]);
  const body = el('div', { className: 'cimport-pick' }, [
    pickerSupported()
      ? choice('📱', 'اختيار من جهات اتصال الهاتف', 'يفتح قائمة جهات الاتصال لتحدّد منها', async () => {
        try {
          const picked = await navigator.contacts.select(['name', 'tel'], { multiple: true });
          if (!picked || !picked.length) return;
          h.close();
          await reviewAndImport(fromPickerResult(picked), opts);
        } catch (e) { if (!e || e.name !== 'AbortError') toast.warning('تعذّر فتح جهات الاتصال — جرّب ملف vCard'); }
      }, { 'data-action': 'import-picker' })
      : el('div', { className: 'cimport__note' }, 'متصفحك لا يدعم اختيار جهات الاتصال مباشرة (يعمل في كروم على أندرويد). استخدم ملف vCard أدناه.'),
    choice('📁', 'ملف جهات اتصال (.vcf)', 'صدّر جهات الاتصال من تطبيق الأسماء ثم اخترها هنا', () => fileInput.click(), { 'data-action': 'import-vcf' }),
    fileInput,
    el('div', { className: 'cimport__note' }, 'يُستورد الاسم والرقم المحمول المصري فقط، ولا يُكرَّر عميل مسجّل بنفس الرقم. تراجع قبل الحفظ من قائمة المراجعة.'),
  ]);
  const h = modal.open({ title: '📇 استيراد من جهات الاتصال', body, closable: true, actions: [{ text: 'إغلاق', variant: 'ghost', action: 'cancel', onClick: () => h.close() }] });
  return h;
}
