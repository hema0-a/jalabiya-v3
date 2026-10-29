/* ==========================================================================
   media-migration-card.js — بطاقة «ترحيل الوسائط القديمة» في صيانة البيانات (v3.4.1)
   ==========================================================================
   تنقل الصور والتوقيعات المضمَّنة في سجلات الطلبات القديمة إلى مخزن orderMedia لتسريع القوائم.
   التسلسل: 🔍 مسح (قراءة فقط) ← يظهر الحجم والمرشّح وشروط الجاهزية ← 🚀 بدء (نسخة احتياطية مفحوصة أولاً)
   ← تقدّم قابل للإيقاف ← ملخص بالمُرحَّل والمتروك والفاشل.
   الحالة على مستوى الوحدة (لا البطاقة): صفحة صيانة البيانات تُعيد بناء بطاقاتها عند أي تحديث، فلا يضيع
   التقدّم ولا يتوقف الترحيل بسبب إعادة الرسم. لا innerHTML: كل النصوص عبر el().
   الأسباب تبقى ظاهرة في البطاقة (لا تنبيه عابر).
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { modal } from './modal.js';
import { toast } from './toast.js';
import {
  scanInlineMedia, collectMigrationReadiness, startMigration, isMigrationRunning, REASON_LABELS,
} from '../services/media-migration.js';
import { formatKB } from '../services/media-diagnostic.js';

const MAX_ERROR_ROWS = 8;

const freshUi = () => ({
  phase: 'idle',          /* idle | scanning | scanned | running | done */
  step: '',               /* backup | migrate (أثناء running) */
  scan: null, readiness: null, progress: null, result: null,
  error: '', cancel: false, scanned: 0,
});
let ui = freshUi();
let current = null;        /* آخر بطاقة مبنية (تُحدَّث عند تغيّر الحالة) */
let progressRefs = { text: null, bar: null };

/** يوقف الترحيل/المسح الجاري بعد الطلب الحالي (تستدعيه الصفحة عند مغادرتها). */
export function cancelMediaMigration() { ui.cancel = true; }

/** للاختبار فقط: يعيد الحالة الابتدائية. */
export function _resetMigrationUiForTest() { ui = freshUi(); current = null; progressRefs = { text: null, bar: null }; }

function notify() { if (current) current.render(); }

function notifyProgress() {
  const p = ui.progress;
  if (!p || !progressRefs.text) return;
  progressRefs.text.textContent = 'رُحِّل ' + p.migrated + ' من ' + p.total + ' طلب' + (p.failed ? ' · فشل ' + p.failed : '') + ' · حُرِّر ' + formatKB(p.freedBytes);
  if (progressRefs.bar) progressRefs.bar.style.width = (p.total ? Math.round((p.done / p.total) * 100) : 0) + '%';
}

const row = (label, value) => el('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '13px', padding: '3px 0' } }, [
  el('span', { style: { color: '#555' } }, label), el('strong', {}, String(value)),
]);

function checkRows(readiness) {
  if (!readiness) return [];
  return readiness.checks.map((c) => {
    const isBackup = c.id === 'backup';
    const icon = c.ok ? '✅' : (isBackup ? 'ℹ️' : '❌');
    return el('div', { style: { fontSize: '13px', padding: '3px 0', color: c.ok || isBackup ? '#333' : '#B3261E' }, 'data-check': c.id }, [
      icon + ' ' + c.label + (c.detail ? ' — ' + c.detail : ''),
      !c.ok && !isBackup && c.hint ? el('div', { style: { fontSize: '12px', color: '#777', marginInlineStart: '22px' } }, '↳ ' + c.hint) : null,
    ]);
  });
}

/* ==========================================================================
   الإجراءات
   ========================================================================== */

async function runScan() {
  if (ui.phase === 'scanning' || ui.phase === 'running') return;
  ui = { ...freshUi(), phase: 'scanning' };
  notify();
  try {
    const scan = await scanInlineMedia({
      shouldCancel: () => ui.cancel,
      onProgress: (p) => { ui.scanned = p.scanned; if (progressRefs.text) progressRefs.text.textContent = 'جارٍ الفحص… ' + p.scanned + ' طلب'; },
    });
    if (scan.cancelled) { ui = freshUi(); notify(); return; }
    ui.scan = scan;
    ui.readiness = await collectMigrationReadiness({ scan });
    ui.phase = 'scanned';
  } catch (e) {
    console.error('[media-migration] scan:', e);
    ui.error = 'تعذّر الفحص: ' + ((e && e.message) || e);
    ui.phase = 'idle';
  }
  notify();
}

async function refreshReadiness() {
  if (!ui.scan) return;
  try { ui.readiness = await collectMigrationReadiness({ scan: ui.scan }); } catch (e) { ui.error = 'تعذّر فحص الجاهزية: ' + ((e && e.message) || e); }
  notify();
}

async function runStart() {
  if (ui.phase !== 'scanned' || !ui.scan) return;
  const n = ui.scan.candidates.length;
  const ok = await modal.confirm({
    title: 'ترحيل الوسائط القديمة',
    message: 'سيُنقل ما في ' + n + ' طلب (' + formatKB(ui.scan.inlineBytes) + ') إلى مخزن الوسائط.\n'
      + '١) تُؤخذ نسخة احتياطية وتُفحص أولاً، فإن فشلت لا يُمسّ شيء.\n'
      + '٢) كل طلب يُنقل ويُتحقَّق منه بمعاملة واحدة؛ أي خلل يُبقي الطلب كما كان.\n'
      + '٣) يمكنك الإيقاف في أي لحظة، ويُستأنف لاحقاً من حيث توقف.\n'
      + 'أبقِ هذه الصفحة مفتوحة حتى ينتهي.',
    confirmText: 'ابدأ الترحيل', cancelText: 'إلغاء',
  });
  if (!ok) return;
  ui.phase = 'running'; ui.step = 'backup'; ui.cancel = false; ui.error = ''; ui.progress = { done: 0, total: n, migrated: 0, skipped: 0, raced: 0, failed: 0, freedBytes: 0 };
  notify();
  const res = await startMigration({
    scan: ui.scan,
    shouldCancel: () => ui.cancel,
    onPhase: (ph) => { ui.step = ph; notify(); },
    onProgress: (p) => { ui.progress = p; notifyProgress(); },
  });
  if (res.status === 'done' || res.status === 'cancelled') {
    ui.result = res; ui.phase = 'done';
    toast[res.summary.failed ? 'warning' : 'success'](res.status === 'cancelled' ? 'أُوقف الترحيل — يمكنك الاستئناف لاحقاً' : 'اكتمل ترحيل الوسائط');
  } else {
    ui.error = res.reason || 'تعذّر بدء الترحيل';
    ui.phase = 'scanned';
    if (res.readiness) ui.readiness = res.readiness; else await refreshReadiness();
  }
  notify();
}

/* ==========================================================================
   الرسم
   ========================================================================== */

function button(text, action, onClick, opts = {}) {
  return el('button', {
    className: 'btn btn--sm ' + (opts.primary ? 'btn--primary' : 'btn--secondary'), type: 'button',
    'data-action': action, disabled: opts.disabled ? 'disabled' : null, onClick,
  }, text);
}

function resultNodes(res) {
  const s = res.summary;
  const nodes = [
    el('div', { style: { fontWeight: '700', margin: '8px 0', color: s.failed ? '#B3261E' : '#1B7F3B' } },
      res.status === 'cancelled' ? '⏹️ أُوقف قبل الانتهاء' : (s.failed ? '⚠️ انتهى مع إخفاقات' : '✅ اكتمل الترحيل')),
    row('طلبات رُحِّلت', s.migrated), row('طلبات تُركت كما هي', s.skipped), row('تأجّلت (عُدِّلت أثناء الترحيل)', s.raced),
    row('أخفقت (لم تُمسّ)', s.failed), row('مساحة محرَّرة من السجلات', formatKB(s.freedBytes)),
  ];
  if (s.thumbFailed > 0) nodes.push(row('صور بلا مصغّر (تظهر برمز بديل في القائمة)', s.thumbFailed));
  Object.keys(s.skippedByReason).forEach((k) => nodes.push(row('· ' + (REASON_LABELS[k] || k), s.skippedByReason[k])));
  if (s.errors.length > 0) {
    nodes.push(el('div', { style: { fontSize: '12px', color: '#B3261E', marginTop: '6px' } }, 'تفاصيل (آخر 6 خانات من المعرّف):'));
    s.errors.slice(0, MAX_ERROR_ROWS).forEach((e) => nodes.push(el('div', { style: { fontSize: '12px', color: '#B3261E' } }, '#' + String(e.orderId).slice(-6) + ' — ' + e.status + (e.reason ? ': ' + e.reason : ''))));
  }
  nodes.push(el('div', { style: { fontSize: '12px', color: '#555', marginTop: '8px' } },
    'النسخة الاحتياطية السابقة للترحيل محفوظة. ارفع التغييرات الآن من «المزامنة السحابية»، ثم أعد «تشخيص حجم الصور والتوقيعات» لترى الفرق.'));
  return nodes;
}

/**
 * بطاقة ترحيل الوسائط القديمة.
 * @returns {HTMLElement}
 */
export function buildMediaMigrationCard() {
  const body = el('div', {});
  const card = el('div', { className: 'card', 'data-role': 'media-migration', style: { padding: '16px', marginBottom: '12px' } }, [
    el('h3', { style: { margin: '0 0 6px' } }, '🗜️ ترحيل الوسائط القديمة'),
    el('div', { style: { fontSize: '12px', color: '#555', marginBottom: '10px', lineHeight: '1.6' } },
      'الطلبات القديمة تحمل صورها وتوقيعاتها داخل السجل نفسه فتبطّئ القوائم. هذا الإجراء ينقلها إلى مخزن الوسائط بأمان '
      + '(نسخة احتياطية أولاً، ثم نقل وتحقق لكل طلب على حدة).'),
    body,
  ]);

  function render() {
    clear(body);
    progressRefs = { text: null, bar: null };
    const kids = [];
    if (ui.error) kids.push(el('div', { role: 'alert', style: { color: '#B3261E', fontSize: '13px', marginBottom: '8px' } }, '⚠️ ' + ui.error));

    if (ui.phase === 'idle') {
      kids.push(button('🔍 افحص الطلبات القديمة', 'mm-scan', runScan, { primary: true }));
      kids.push(el('div', { style: { fontSize: '12px', color: '#777', marginTop: '6px' } }, 'الفحص للقراءة فقط ولا يغيّر شيئاً.'));
    } else if (ui.phase === 'scanning') {
      const t = el('div', { role: 'status', style: { fontSize: '13px', fontWeight: '600', color: '#0B5A8A', marginBottom: '8px' } }, 'جارٍ الفحص… ' + ui.scanned + ' طلب');
      progressRefs.text = t;
      kids.push(t, button('⏹️ إيقاف', 'mm-cancel-scan', () => { ui.cancel = true; }));
    } else if (ui.phase === 'scanned') {
      const sc = ui.scan;
      kids.push(row('طلبات فُحصت', sc.scanned), row('طلبات فيها وسائط مضمَّنة', sc.candidates.length), row('حجمها المضمَّن', formatKB(sc.inlineBytes)));
      Object.keys(sc.byReason).forEach((k) => kids.push(row('· ' + (REASON_LABELS[k] || k), sc.byReason[k])));
      if (sc.candidates.length === 0) {
        kids.push(el('div', { style: { color: '#1B7F3B', fontWeight: '600', margin: '8px 0' } }, '✅ لا توجد وسائط مضمَّنة — لا شيء للترحيل.'));
        kids.push(button('🔄 فحص من جديد', 'mm-scan', runScan));
      } else {
        kids.push(el('div', { style: { fontWeight: '600', margin: '10px 0 4px', fontSize: '13px' } }, 'شروط الجاهزية'));
        kids.push(...checkRows(ui.readiness));
        const can = !!(ui.readiness && ui.readiness.canAttempt);
        kids.push(el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' } }, [
          button('🚀 ابدأ الترحيل (' + sc.candidates.length + ' طلب)', 'mm-start', runStart, { primary: true, disabled: !can }),
          button('🔄 إعادة فحص الجاهزية', 'mm-recheck', refreshReadiness),
          button('🔍 مسح من جديد', 'mm-scan', runScan),
        ]));
      }
    } else if (ui.phase === 'running') {
      const txt = el('div', { role: 'status', style: { fontSize: '13px', fontWeight: '600', color: '#0B5A8A', marginBottom: '6px' } },
        ui.step === 'backup' ? 'جارٍ أخذ نسخة احتياطية وفحصها…' : 'جارٍ الترحيل…');
      const bar = el('div', { style: { height: '8px', width: '0%', background: '#1F6D57', borderRadius: '4px', transition: 'width .2s' } });
      progressRefs = { text: txt, bar };
      kids.push(txt, el('div', { style: { height: '8px', background: '#E5DDD0', borderRadius: '4px', marginBottom: '8px', overflow: 'hidden' } }, [bar]),
        button('⏹️ إيقاف بعد الطلب الحالي', 'mm-cancel', () => { ui.cancel = true; toast.info('سيتوقف بعد الطلب الحالي'); }));
      if (ui.step === 'migrate') notifyProgress();
    } else if (ui.phase === 'done' && ui.result) {
      kids.push(...resultNodes(ui.result), el('div', { style: { marginTop: '10px' } }, [button('🔍 فحص من جديد', 'mm-scan', runScan)]));
    }
    kids.forEach((k) => { if (k) body.appendChild(k); });
  }

  current = { render, node: card };
  /* ترحيل يعمل في تبويب آخر: نُبلّغ بدل خطأ لاحق (القفل في localStorage) */
  if (ui.phase === 'idle' && !ui.error && isMigrationRunning()) ui.error = 'يوجد ترحيل يعمل في تبويب آخر — انتظر انتهاءه.';
  render();
  return card;
}
