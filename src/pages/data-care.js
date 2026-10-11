/* ==========================================================================
   data-care.js — صيانة البيانات  [v3.3.30]
   ==========================================================================
   ثلاثة أقسام:
   1) ترقية VIP تلقائية (ترقية فقط، لا تُنزِّل VIP يدوياً).
   2) فحص سلامة البيانات + إصلاح آمن (لا يمسّ أي مبلغ مالي).
   3) دمج العملاء المكررين (يعيد نسبة الطلبات والدفعات والمواعيد للسجل الباقي).
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { formatEGP } from '../core/utils.js';
import { customers } from '../data/repos/customers.js';
import { orders } from '../data/repos/orders.js';
import { payments } from '../data/repos/payments.js';
import { appointments } from '../data/repos/appointments.js';
import { portfolio } from '../data/repos/portfolio.js';
import { trash } from '../data/repos/trash.js';
import { modal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { scanIntegrity, ISSUE_LABELS } from '../services/data-integrity.js';
import { findDuplicateGroups, pickPrimary, mergeFields } from '../services/customer-merge.js';
import { loadVipRules, saveVipRules, computeVipPromotions } from '../services/vip-rules.js';

const REPOS = { orders, payments, appointments, portfolio, customers };
let state = { container: null, data: null, scan: null };

async function loadData() {
  const [cus, ord, pay, apt] = await Promise.all([customers.list(), orders.list(), payments.list(), appointments.list()]);
  state.data = { customers: cus, orders: ord, payments: pay, appointments: apt };
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

/* ---------- 3) دمج المكررين ---------- */
async function mergeGroup(primary, dups) {
  const patch = mergeFields(primary, dups);
  if (Object.keys(patch).length) await customers.update(primary.id, patch);
  for (const d of dups) {
    for (const name of ['orders', 'payments', 'appointments', 'portfolio']) {
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
        message: 'ستُنقل كل طلبات ودفعات ومواعيد (' + dups.map((d) => d.name).join('، ') + ') إلى «' + primary.name + '»، ويُنقل المكرر لسلة المحذوفات.',
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

function draw() {
  const c = state.container;
  if (!c || !state.data) return;
  clear(c);
  c.appendChild(el('h2', { style: { margin: '0 0 12px' } }, '🧰 صيانة البيانات'));
  c.appendChild(vipSection());
  c.appendChild(integritySection());
  c.appendChild(mergeSection());
}

export const dataCarePage = {
  async render(container) {
    state = { container, data: null, scan: null };
    container.appendChild(el('div', { style: { padding: '24px', textAlign: 'center', color: '#888' } }, 'جارٍ التحميل...'));
    try { await loadData(); draw(); } catch (err) {
      console.error('[data-care] render:', err);
      clear(container);
      container.appendChild(el('div', { className: 'card', style: { padding: '16px', color: '#C62828' } }, 'تعذّر التحميل: ' + (err && err.message || err)));
    }
  },
  destroy() { state = { container: null, data: null, scan: null }; },
};
