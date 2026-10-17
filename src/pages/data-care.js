/* ==========================================================================
   data-care.js — صيانة البيانات  [v3.3.30]
   ==========================================================================
   ثلاثة أقسام:
   1) ترقية VIP تلقائية (ترقية فقط، لا تُنزِّل VIP يدوياً).
   2) فحص سلامة البيانات + إصلاح آمن (لا يمسّ أي مبلغ مالي).
   3) دمج العملاء المكررين (يعيد نسبة الطلبات والدفعات والمواعيد للسجل الباقي).
   4) تشخيص حجم الصور والتوقيعات داخل الطلبات (v3.3.72) — للقراءة فقط وعند الضغط فقط.
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { formatEGP } from '../core/utils.js';
import { customers } from '../data/repos/customers.js';
import { orders } from '../data/repos/orders.js';
import { payments } from '../data/repos/payments.js';
import { appointments } from '../data/repos/appointments.js';
import { portfolio } from '../data/repos/portfolio.js';
import { quotes } from '../data/repos/quotes.js';
import { trash } from '../data/repos/trash.js';
import { modal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { scanIntegrity, ISSUE_LABELS } from '../services/data-integrity.js';
import { findDuplicateGroups, pickPrimary, mergeFields, CUSTOMER_LINKED_STORES } from '../services/customer-merge.js';
import { loadVipRules, saveVipRules, computeVipPromotions } from '../services/vip-rules.js';
import { listBackups, verifyBackup, getLastVerification } from '../services/auto-backup.js';
import { formatDate } from '../core/utils.js';
import { buildSystemStatusCard } from '../ui/system-status-card.js';
import { diagnoseOrderMedia, assessMedia, formatKB } from '../services/media-diagnostic.js';
import { getStorageStatus, formatBytes } from '../services/storage-health.js';

const REPOS = { orders, payments, appointments, portfolio, quotes, customers };
/** حالة الصفحة (تُعاد كاملة عند الفتح والإغلاق). حقول media* لأداة تشخيص الوسائط. */
const freshState = (container = null) => ({
  container, data: null, scan: null, backups: null, verifyResult: null,
  media: null, mediaRunning: false, mediaCancel: false, mediaScanned: 0, mediaTotal: null,
  mediaError: '', mediaUsage: null, mediaProgressNode: null,
});
let state = freshState();

async function loadData() {
  const [cus, ord, pay, apt, qts] = await Promise.all([customers.list(), orders.list(), payments.list(), appointments.list(), quotes.list()]);
  state.data = { customers: cus, orders: ord, payments: pay, appointments: apt, quotes: qts };
}

const section = (title, children) => el('div', { className: 'card', style: { padding: '14px', marginBottom: '14px' } },
  [el('h3', { style: { margin: '0 0 10px', fontSize: '15px' } }, title), ...children]);
const btn = (txt, fn, cls = 'primary', extra = {}) => el('button', { className: 'btn btn--' + cls, type: 'button', style: { fontSize: '13px', padding: '6px 12px', ...extra }, onClick: fn }, txt);

/* ---------- 1) VIP ---------- */
function vipSection() {
  const rules = loadVipRules();
  const promos = computeVipPromotions(state.data.customers, state.data.orders, rules);
  const minO = el('input', { className: 'input', type: 'number', min: '0', value: rules.minOrders, style: { width: '90px' } });
  const minS = el('input', { className: 'input', type: 'number', min: '0', value: rules.minSpent, style: { width: '110px' } });
  const auto = el('input', { type: 'checkbox' }); auto.checked = rules.enabled;
  const save = () => { saveVipRules({ enabled: auto.checked, minOrders: minO.value, minSpent: minS.value }); draw(); };
  [minO, minS].forEach((i) => i.addEventListener('change', save));
  auto.addEventListener('change', save);
  return section('⭐ ترقية VIP تلقائية', [
    el('div', { style: { fontSize: '12px', color: '#666', marginBottom: '8px' } },
      'يصير العميل VIP عند بلوغ أحد المعيارين (من الطلبات المسلَّمة). لا يُنزَّل أي VIP يدوي. اجعل المعيار 0 لتعطيله.'),
    el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '8px' } }, [
      el('span', {}, 'طلبات ≥'), minO, el('span', {}, 'أو إنفاق ≥'), minS,
    ]),
    el('label', { style: { display: 'flex', gap: '6px', alignItems: 'center', fontSize: '13px', marginBottom: '8px' } },
      [auto, 'تطبيق تلقائي عند فتح صفحة العملاء']),
    promos.length === 0
      ? el('div', { style: { color: '#2E7D32', fontSize: '13px' } }, '✅ لا يوجد عملاء مؤهلون للترقية حالياً')
      : el('div', {}, [
        el('div', { style: { fontSize: '13px', marginBottom: '6px' } }, promos.length + ' عميل مؤهل: ' + promos.slice(0, 6).map((p) => p.name).join('، ') + (promos.length > 6 ? '…' : '')),
        btn('رقِّهم الآن', async () => {
          for (const p of promos) await customers.update(p.id, { vip: true });
          toast.success('تمت ترقية ' + promos.length + ' عميل'); await loadData(); draw();
        }),
      ]),
  ]);
}

/* ---------- 2) سلامة البيانات ---------- */
async function applyFixes(fixes) {
  let n = 0;
  for (const f of fixes) {
    try { await REPOS[f.store].update(f.id, f.patch); n++; } catch (e) { console.error('[data-care] fix', f, e); }
  }
  return n;
}

function integritySection() {
  const sc = state.scan;
  const kids = [el('div', { style: { fontSize: '12px', color: '#666', marginBottom: '8px' } },
    'يكشف سجلات يتيمة (دفعة بلا طلب، طلب لعميل محذوف…). الإصلاح الآمن لا يغيّر أي مبلغ مالي.')];
  kids.push(btn(sc ? '🔄 أعد الفحص' : '🔍 افحص الآن', async () => { await loadData(); state.scan = scanIntegrity(state.data); draw(); }));
  if (sc) {
    if (sc.total === 0) kids.push(el('div', { style: { color: '#2E7D32', margin: '10px 0' } }, '✅ البيانات سليمة'));
    else {
      Object.entries(sc.counts).forEach(([type, n]) => {
        const sample = sc.issues.find((i) => i.type === type);
        const color = sample.severity === 'error' ? '#C62828' : sample.severity === 'warn' ? '#E65100' : '#555';
        kids.push(el('div', { style: { display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '13px', borderBottom: '1px solid rgba(0,0,0,0.06)' } },
          [el('span', {}, ISSUE_LABELS[type] || type), el('strong', { style: { color } }, String(n))]));
      });
      const fixes = sc.issues.filter((i) => i.fix).map((i) => i.fix);
      if (fixes.length) {
        kids.push(btn('🛠️ إصلاح آمن (' + fixes.length + ')', async () => {
          const ok = await modal.confirm({ title: 'إصلاح آمن', message: 'سيُطبَّق ' + fixes.length + ' تعديل (فكّ ربط أو تصحيح عميل). لا مبالغ تتغير.', confirmText: 'طبّق', cancelText: 'إلغاء' });
          if (!ok) return;
          const n = await applyFixes(fixes);
          toast.success('تم إصلاح ' + n); await loadData(); state.scan = scanIntegrity(state.data); draw();
        }, 'primary', { marginTop: '10px' }));
      }
      kids.push(el('div', { style: { fontSize: '11px', color: '#888', marginTop: '8px' } },
        'الدفعات غير المربوطة تُربط من «مستحقات العملاء». ما يخص مبالغ أو عملاء محذوفين يُترك لقرارك.'));
    }
  }
  return section('🩺 سلامة البيانات', kids);
}

/* ---------- 4) فحص النسخ الاحتياطية (v3.3.51) ---------- */
function backupVerifySection() {
  const kids = [el('div', { style: { fontSize: '12px', color: '#666', marginBottom: '8px' } },
    'يفتح النسخة المحفوظة ويتأكد إنها كاملة وقابلة للتصدير وأرقامها سليمة، قبل ما تحتاجها. للقراءة فقط ولا يغيّر بياناتك.')];

  const last = getLastVerification();
  if (last && !state.verifyResult) {
    kids.push(el('div', { style: { fontSize: '12px', color: last.ok ? '#2E7D32' : '#C62828', marginBottom: '8px' } },
      (last.ok ? '✅ آخر فحص تلقائي: سليمة' : '❌ آخر فحص تلقائي: فيها مشكلة') + ' · ' + formatDate(last.at)));
  }

  const bks = state.backups;
  if (bks == null) {
    kids.push(btn('📂 عرض النسخ', async () => { state.backups = await listBackups(); draw(); }));
  } else if (bks.length === 0) {
    kids.push(el('div', { style: { color: '#E65100', fontSize: '13px' } },
      '⚠️ لا توجد نسخ احتياطية محفوظة. أنشئ نسخة من الإعدادات ← النسخ الاحتياطي.'));
  } else {
    bks.forEach((b, i) => {
      kids.push(el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px solid rgba(0,0,0,0.06)', fontSize: '13px' } }, [
        el('span', { style: { flex: '1' } }, (i === 0 ? '🆕 ' : '') + b.label + ' · ' + formatDate(b.createdAt) + ' · ' + b.sizeKB + ' KB'),
        btn('🧪 فحص', async () => {
          try { state.verifyResult = await verifyBackup(b.id); }
          catch (e) { state.verifyResult = { ok: false, errors: ['فشل الفحص: ' + (e && e.message || e)], warnings: [], counts: {}, backupId: b.id, createdAt: b.createdAt }; }
          draw();
        }, 'secondary'),
      ]));
    });
  }

  const r = state.verifyResult;
  if (r) {
    kids.push(el('div', { style: { marginTop: '10px', padding: '10px', borderRadius: '8px', background: r.ok ? '#E8F5E9' : '#FFEBEE' } }, [
      el('div', { style: { fontWeight: '700', color: r.ok ? '#2E7D32' : '#C62828', fontSize: '14px' } },
        r.ok ? '✅ النسخة سليمة وجاهزة للاستعادة' : '❌ النسخة فيها مشاكل — لا تعتمد عليها'),
      ...r.errors.map((e) => el('div', { style: { fontSize: '12px', color: '#C62828', marginTop: '4px' } }, '• ' + e)),
      ...r.warnings.map((w) => el('div', { style: { fontSize: '12px', color: '#E65100', marginTop: '4px' } }, '⚠️ ' + w)),
      r.counts && Object.keys(r.counts).length
        ? el('div', { style: { fontSize: '11px', color: '#666', marginTop: '6px' } },
          'تحتوي: ' + (r.counts.customers || 0) + ' عميل · ' + (r.counts.orders || 0) + ' طلب · ' + (r.counts.payments || 0) + ' دفعة')
        : null,
    ].filter(Boolean)));
    if (!r.ok) kids.push(el('div', { style: { fontSize: '11px', color: '#888', marginTop: '6px' } },
      'الحل: أنشئ نسخة جديدة الآن من الإعدادات ← النسخ الاحتياطي، وافحصها. ولو المشكلة استمرت ابعتلي النص اللي فوق.'));
  }
  return section('🧪 فحص النسخ الاحتياطية', kids);
}

/* ---------- 3) دمج المكررين ---------- */
async function mergeGroup(primary, dups) {
  const patch = mergeFields(primary, dups);
  if (Object.keys(patch).length) await customers.update(primary.id, patch);
  for (const d of dups) {
    for (const name of CUSTOMER_LINKED_STORES) {
      const rows = await REPOS[name].findByIndex('by_customerId', d.id);
      for (const r of rows) await REPOS[name].update(r.id, { customerId: primary.id });
    }
    await trash.addToTrash('customers', d);
    await customers.remove(d.id);
  }
}

function groupCard(g) {
  const count = (cid) => state.data.orders.filter((o) => o.customerId === cid).length;
  const def = pickPrimary(g.customers);
  let chosen = def.id;
  const radios = g.customers.map((c) => {
    const r = el('input', { type: 'radio', name: 'g-' + g.key, value: c.id });
    r.checked = c.id === chosen;
    r.addEventListener('change', () => { chosen = c.id; });
    return el('label', { style: { display: 'flex', gap: '6px', alignItems: 'center', padding: '4px 0', fontSize: '13px' } },
      [r, el('span', {}, c.name + (c.phone ? ' · ' + c.phone : ' · بلا هاتف') + ' · ' + count(c.id) + ' طلب' + (c.vip ? ' ⭐' : ''))]);
  });
  return el('div', { style: { padding: '8px 0', borderBottom: '1px solid rgba(0,0,0,0.08)' } }, [
    el('div', { style: { fontSize: '12px', fontWeight: '700', color: g.kind === 'phone' ? '#C62828' : '#E65100', marginBottom: '4px' } },
      g.kind === 'phone' ? 'نفس رقم الهاتف' : 'نفس الاسم (محتمل — تأكد أنهما شخص واحد)'),
    el('div', { style: { fontSize: '11px', color: '#888', marginBottom: '4px' } }, 'اختر السجل الذي يبقى:'),
    ...radios,
    btn('ادمج في المختار', async () => {
      const primary = g.customers.find((c) => c.id === chosen);
      const dups = g.customers.filter((c) => c.id !== chosen);
      const ok = await modal.confirm({
        title: 'دمج العملاء',
        message: 'ستُنقل كل طلبات ودفعات ومواعيد وعروض أسعار (' + dups.map((d) => d.name).join('، ') + ') إلى «' + primary.name + '»، ويُنقل المكرر لسلة المحذوفات.',
        confirmText: 'ادمج', cancelText: 'إلغاء', danger: true,
      });
      if (!ok) return;
      try { await mergeGroup(primary, dups); toast.success('تم الدمج'); await loadData(); draw(); }
      catch (err) { console.error('[data-care] merge:', err); toast.error('تعذّر الدمج: ' + (err && err.message || err)); }
    }, 'secondary', { marginTop: '6px' }),
  ]);
}

function mergeSection() {
  const groups = findDuplicateGroups(state.data.customers);
  return section('👥 العملاء المكررون', groups.length === 0
    ? [el('div', { style: { color: '#2E7D32', fontSize: '13px' } }, '✅ لا يوجد عملاء مكررون')]
    : [el('div', { style: { fontSize: '12px', color: '#666', marginBottom: '6px' } }, groups.length + ' مجموعة'), ...groups.map(groupCard)]);
}

/* ---------- 4) تشخيص حجم الصور والتوقيعات (للقراءة فقط) ---------- */

/** نص تقدم الفحص. */
function mediaProgressText() {
  return 'جارٍ الفحص… ' + state.mediaScanned + (state.mediaTotal !== null ? ' / ' + state.mediaTotal : '') + ' طلب';
}

/**
 * يشغّل الفحص عند ضغط المستخدم فقط. لا يكتب شيئاً: يقرأ الطلبات على دفعات ويحسب الأحجام.
 * إغلاق الصفحة أو زر الإيقاف يوقفانه.
 */
async function runMediaScan() {
  if (state.mediaRunning) return;
  const mine = state;                                     /* إن غادر المستخدم الصفحة يتغير state فنتوقف */
  mine.mediaRunning = true; mine.mediaCancel = false; mine.mediaScanned = 0;
  mine.mediaTotal = null; mine.mediaError = ''; mine.media = null; mine.mediaUsage = null;
  draw();
  try {
    mine.mediaTotal = await orders.count();
    const report = await diagnoseOrderMedia({
      shouldCancel: () => mine.mediaCancel || state !== mine,
      onProgress: (p) => {
        mine.mediaScanned = p.scanned;
        if (state === mine && mine.mediaProgressNode) mine.mediaProgressNode.textContent = mediaProgressText();
      },
    });
    mine.media = report;
    try { mine.mediaUsage = (await getStorageStatus()).usage; } catch (e) { mine.mediaUsage = null; }
  } catch (err) {
    console.error('[data-care] media scan:', err);
    mine.mediaError = 'تعذّر الفحص: ' + (err && err.message || err);
  } finally {
    mine.mediaRunning = false;
    if (state === mine) draw();
  }
}

/** صف «عنوان: قيمة». */
const statRow = (label, value) => el('div', {
  style: { display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '5px 0', borderBottom: '1px solid #F0EAE0', fontSize: '13px' },
}, [el('span', { style: { color: '#555' } }, label), el('strong', {}, String(value))]);

/** نتائج الفحص. */
function mediaResultNodes(r) {
  const verdict = assessMedia(r, state.mediaUsage);
  const palette = { ok: ['#2E7D32', '#E8F5E9'], info: ['#8A5A00', '#FFF3D6'], warn: ['#B3261E', '#FDECEA'] }[verdict.level];
  const names = new Map((state.data ? state.data.customers : []).map((c) => [c.id, c.name]));
  const rows = [
    statRow('إجمالي الطلبات', r.totalOrders),
    statRow('طلبات تحتوي صورة مرجعية', r.ordersWithImage),
    statRow('طلبات تحتوي توقيعاً', r.ordersWithSignature),
    statRow('طلبات تحتوي أيّاً منهما', r.ordersWithMedia),
    statRow('حجم الصور', formatKB(r.imageBytes)),
    statRow('حجم التوقيعات', formatKB(r.signatureBytes)),
    statRow('الإجمالي', formatKB(r.totalBytes) + (r.totalBytes >= 1048576 ? ' (' + formatBytes(r.totalBytes) + ')' : '')),
    r.ordersWithMedia > 0 ? statRow('متوسط الوسائط للطلب الواحد (ممّن له وسائط)', formatKB(r.avgBytesPerMediaOrder)) : null,
    verdict.sharePercent !== null ? statRow('نسبتها من تخزين التطبيق', verdict.sharePercent + '%') : null,
    statRow('مدة الفحص', r.durationMs + ' ms'),
  ].filter(Boolean);
  const out = [];
  if (r.cancelled) {
    out.push(el('div', { style: { color: '#8A5A00', fontSize: '13px', margin: '8px 0' } }, '⚠️ أُوقف الفحص قبل الانتهاء — الأرقام جزئية.'));
  }
  out.push(el('div', { style: { marginTop: '10px' } }, rows));
  out.push(el('div', {
    style: { marginTop: '10px', padding: '8px 10px', borderRadius: '8px', fontSize: '13px', lineHeight: '1.6', color: palette[0], background: palette[1] },
  }, verdict.text));
  if (r.topOrders.length > 0) {
    out.push(el('div', { style: { fontWeight: '600', fontSize: '13px', margin: '12px 0 4px' } }, '🏷️ أكبر الطلبات حجماً'));
    r.topOrders.forEach((t) => out.push(el('div', { style: { fontSize: '12px', color: '#555', padding: '3px 0' } },
      (names.get(t.customerId) || 'عميل غير معروف') + ' — ' + formatKB(t.totalBytes) +
      ' (صورة ' + formatKB(t.imageBytes) + ' · توقيع ' + formatKB(t.signatureBytes) + ')')));
  }
  return out;
}

function mediaDiagSection() {
  const kids = [
    el('div', { style: { fontSize: '12px', color: '#666', marginBottom: '8px', lineHeight: '1.7' } },
      'يحسب حجم الصور المرجعية والتوقيعات المخزّنة داخل سجلات الطلبات — وهي سبب بطء قراءة قائمة الطلبات. ' +
      'للقراءة فقط: لا يعدّل أي بيانات، ولا يعمل إلا عند الضغط، ويقرأ على دفعات صغيرة دون تجميد التطبيق.'),
  ];
  if (state.mediaRunning) {
    const prog = el('div', { role: 'status', style: { fontSize: '13px', fontWeight: '600', color: '#0B5A8A', marginBottom: '8px' } }, mediaProgressText());
    state.mediaProgressNode = prog;
    kids.push(prog, btn('⏹️ إيقاف', () => { state.mediaCancel = true; }, 'secondary'));
  } else {
    state.mediaProgressNode = null;
    kids.push(btn(state.media ? '🔄 إعادة الفحص' : '📊 افحص حجم الصور والتوقيعات', runMediaScan));
  }
  if (state.mediaError) kids.push(el('div', { style: { color: '#B3261E', fontSize: '13px', marginTop: '8px' } }, state.mediaError));
  if (state.media) kids.push(...mediaResultNodes(state.media));
  return section('📊 تشخيص حجم الصور والتوقيعات', kids);
}

function draw() {
  const c = state.container;
  if (!c || !state.data) return;
  clear(c);
  c.appendChild(el('h2', { style: { margin: '0 0 12px' } }, '🧰 صيانة البيانات'));
  c.appendChild(buildSystemStatusCard());
  c.appendChild(mediaDiagSection());
  c.appendChild(vipSection());
  c.appendChild(integritySection());
  c.appendChild(mergeSection());
  c.appendChild(backupVerifySection());
}

export const dataCarePage = {
  async render(container) {
    state = freshState(container);
    container.appendChild(el('div', { style: { padding: '24px', textAlign: 'center', color: '#888' } }, 'جارٍ التحميل...'));
    try { await loadData(); draw(); } catch (err) {
      console.error('[data-care] render:', err);
      clear(container);
      container.appendChild(el('div', { className: 'card', style: { padding: '16px', color: '#C62828' } }, 'تعذّر التحميل: ' + (err && err.message || err)));
    }
  },
  destroy() { state.mediaCancel = true; state = freshState(); },
};
