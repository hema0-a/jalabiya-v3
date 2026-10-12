/* ==========================================================================
   messages.js — 📣 رسائل اليوم  [v3.3.44]
   ==========================================================================
   - «اليوم»: من يحتاج رسالة الآن؟ جاهز للاستلام + مستحقات + تهاني المناسبات
     القريبة للعملاء المميّزين. وضع «المرور واحداً واحداً»: رسالة جاهزة → واتساب → التالي.
   - «حملة»: قالب «عملاء» (عرض الموسم أو قالبك المخصّص) لجمهور (VIP / الكل).
   - سجل الإرسال محلي (message-log): يظهر «آخر إرسال» ويُخفي ما أُرسل مؤخراً.
   - واتساب يُفتح برسالة جاهزة والمستخدم يضغط «إرسال» (لا إرسال تلقائي).
   - الحساب في services/message-queue.js (نقي ومُختبَر).
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { createProgressiveList } from '../ui/progressive-list.js';
import { customers } from '../data/repos/customers.js';
import { orders } from '../data/repos/orders.js';
import { payments } from '../data/repos/payments.js';
import { settings } from '../data/repos/settings.js';
import { referrals } from '../data/repos/referrals.js';
import { toast } from '../ui/toast.js';
import { sendLogged } from '../services/auto-messages.js';
import { listTemplates, isEnabledCfg } from '../services/message-templates.js';
import { loadLog, sinceText } from '../services/message-log.js';
import { buildQueue, buildCampaign, countTasks, TYPE_LABELS } from '../services/message-queue.js';

const blank = () => ({
  container: null, raw: null, tab: 'today', filter: 'all', showSent: false,
  campaign: { templateId: '', audience: 'vip' }, tasks: [], template: null, stepper: null, lists: [],
});
let state = blank();

/* ==========================================================================
   1. البيانات
   ========================================================================== */

async function loadData() {
  const [ord, pay, cus, st, refs] = await Promise.all([orders.list(), payments.list(), customers.list(), settings.get(), referrals.list().catch(() => [])]);
  state.raw = { orders: ord, payments: pay, customers: cus, settings: st, referrals: refs };
}

function compute() {
  const r = state.raw;
  const cfg = r.settings.autoMessages || null;
  if (!isEnabledCfg(cfg)) { state.tasks = []; state.template = null; return; }
  const base = {
    orders: r.orders, payments: r.payments, customers: r.customers, occasions: r.settings.occasions || [], referrals: r.referrals || [],
    cfg, workshop: r.settings.workshop || {}, log: loadLog(), now: Date.now(),
  };
  if (state.tab === 'today') {
    state.tasks = buildQueue(base).tasks;
    state.template = null;
  } else {
    const tpls = listTemplates(cfg).filter((t) => t.scope === 'customer' && t.enabled);
    if (!tpls.some((t) => t.id === state.campaign.templateId)) state.campaign.templateId = tpls[0] ? tpls[0].id : '';
    const c = buildCampaign({ ...base, templateId: state.campaign.templateId, audience: state.campaign.audience });
    state.tasks = c.tasks;
    state.template = c.template;
  }
}

/* ==========================================================================
   2. الإرسال
   ========================================================================== */

function sendTask(task) {
  const ok = sendLogged(task.phone, task.text, { kind: task.kind, ref: task.ref, customerId: task.customerId });
  if (!ok) { toast.warning('رقم الهاتف غير صالح'); return false; }
  task.lastSentAt = Date.now();
  task.recentlySent = true;
  return true;
}

/* ==========================================================================
   3. مكوّنات
   ========================================================================== */

function chip(label, active, onClick) {
  return el('button', {
    className: 'btn btn--sm ' + (active ? 'btn--primary' : 'btn--secondary'), type: 'button',
    style: { fontSize: '12px', padding: '4px 10px' }, onClick,
  }, label);
}

function statCard(label, value, color) {
  return el('div', { className: 'card', style: { padding: '10px 6px', textAlign: 'center' } }, [
    el('div', { style: { fontSize: '11px', color: '#666' } }, label),
    el('div', { style: { fontSize: '16px', fontWeight: '700', color: color || 'inherit', marginTop: '2px' } }, value),
  ]);
}

function taskCard(t) {
  return el('div', {
    className: 'card',
    style: { padding: '12px', marginBottom: '8px', opacity: t.recentlySent ? '0.6' : '1' },
  }, [
    el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' } }, [
      el('strong', {}, t.name),
      el('span', { style: { fontSize: '11px', color: t.badge === 'متأخر' ? '#C62828' : '#1F6D57', fontWeight: '700' } },
        (TYPE_LABELS[t.type] || '') + (t.badge ? ' · ' + t.badge : '')),
    ]),
    el('div', { style: { fontSize: '12px', color: '#666', margin: '4px 0 6px' } }, t.detail),
    el('div', {
      style: {
        fontSize: '12px', color: '#555', background: '#F6F1E6', borderRadius: '6px', padding: '8px',
        lineHeight: '1.6', whiteSpace: 'pre-wrap', maxHeight: '4.8em', overflow: 'hidden',
      },
    }, t.text),
    t.lastSentAt
      ? el('div', { style: { fontSize: '11px', color: '#E65100', marginTop: '6px' } }, '✔ فُتحت ' + sinceText(t.lastSentAt))
      : null,
    el('button', {
      className: 'btn btn--primary', type: 'button', disabled: t.hasPhone ? null : 'disabled',
      style: { fontSize: '13px', padding: '6px 12px', marginTop: '8px' },
      onClick: () => { if (sendTask(t)) draw(); },
    }, t.hasPhone ? (t.recentlySent ? '📱 إرسال مرة أخرى' : '📱 واتساب') : 'لا يوجد رقم هاتف'),
  ]);
}

/* ==========================================================================
   4. وضع المرور واحداً واحداً
   ========================================================================== */

function startStepper() {
  const list = state.tasks.filter((t) => t.hasPhone && !t.recentlySent && (state.filter === 'all' || t.type === state.filter));
  if (!list.length) { toast.info('لا توجد رسائل بانتظار الإرسال'); return; }
  state.stepper = { list, i: 0, sent: 0, skipped: 0 };
  draw();
}

function drawStepper(c) {
  const sp = state.stepper;
  const total = sp.list.length;

  if (sp.i >= total) {
    c.appendChild(el('div', { className: 'card', style: { padding: '24px', textAlign: 'center' } }, [
      el('div', { style: { fontSize: '32px' } }, '🎉'),
      el('h3', { style: { margin: '8px 0' } }, 'انتهيت!'),
      el('div', { style: { color: '#555', marginBottom: '12px' } },
        'فتحتَ ' + sp.sent + ' رسالة' + (sp.skipped ? ' · تخطّيت ' + sp.skipped : '')),
      el('button', { className: 'btn btn--primary', type: 'button', onClick: () => { state.stepper = null; compute(); draw(); } }, 'رجوع للقائمة'),
    ]));
    return;
  }

  const t = sp.list[sp.i];
  const next = () => { sp.i += 1; draw(); };
  c.appendChild(el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' } }, [
    el('strong', {}, (sp.i + 1) + ' / ' + total),
    el('button', { className: 'btn btn--ghost btn--sm', type: 'button', onClick: () => { state.stepper = null; compute(); draw(); } }, '✕ إنهاء'),
  ]));
  c.appendChild(el('div', { style: { height: '6px', background: '#E5DDD0', borderRadius: '3px', marginBottom: '12px', overflow: 'hidden' } }, [
    el('div', { style: { height: '100%', width: Math.round((sp.i / total) * 100) + '%', background: '#1F6D57' } }),
  ]));
  c.appendChild(el('div', { className: 'card', style: { padding: '16px' } }, [
    el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
      el('strong', { style: { fontSize: '18px' } }, t.name),
      el('span', { style: { fontSize: '12px', color: '#1F6D57', fontWeight: '700' } }, (TYPE_LABELS[t.type] || '') + (t.badge ? ' · ' + t.badge : '')),
    ]),
    el('div', { style: { fontSize: '12px', color: '#666', margin: '6px 0 10px' } }, t.detail),
    el('div', {
      style: { fontSize: '14px', color: '#333', background: '#F6F1E6', borderRadius: '8px', padding: '12px', lineHeight: '1.8', whiteSpace: 'pre-wrap' },
    }, t.text),
    el('button', {
      className: 'btn btn--primary', type: 'button',
      style: { width: '100%', marginTop: '12px', padding: '12px', fontSize: '15px' },
      onClick: () => { if (sendTask(t)) { sp.sent += 1; next(); } },
    }, '📱 فتح واتساب ثم التالي'),
    el('div', { style: { display: 'flex', gap: '8px', marginTop: '8px' } }, [
      el('button', {
        className: 'btn btn--secondary', type: 'button', style: { flex: '1' }, disabled: sp.i === 0 ? 'disabled' : null,
        onClick: () => { sp.i = Math.max(0, sp.i - 1); draw(); },
      }, '◀ السابق'),
      el('button', { className: 'btn btn--secondary', type: 'button', style: { flex: '1' }, onClick: () => { sp.skipped += 1; next(); } }, '⏭ تخطي'),
    ]),
  ]));
}

/* ==========================================================================
   5. الرسم
   ========================================================================== */

function draw() {
  const c = state.container;
  if (!c || !state.raw) return;
  /* تحرير مراقبات القوائم التدريجية القديمة قبل إعادة الرسم */
  state.lists.forEach((l) => { try { l.destroy(); } catch (e) { /* اختياري */ } });
  state.lists = [];
  clear(c);
  c.appendChild(el('h2', { style: { margin: '0 0 12px' } }, '📣 رسائل اليوم'));

  const cfg = state.raw.settings.autoMessages || null;
  if (!isEnabledCfg(cfg)) {
    c.appendChild(el('div', { className: 'card', style: { padding: '16px', textAlign: 'center' } }, [
      el('div', { style: { marginBottom: '10px' } }, 'الرسائل التلقائية معطّلة من الإعدادات.'),
      el('button', { className: 'btn btn--primary', type: 'button', onClick: () => { location.hash = '#/settings/auto-messages'; } }, '⚙️ فتح الإعدادات'),
    ]));
    return;
  }

  if (state.stepper) { drawStepper(c); return; }

  c.appendChild(el('div', { style: { display: 'flex', gap: '8px', marginBottom: '12px' } }, [
    chip('📅 اليوم', state.tab === 'today', () => { state.tab = 'today'; state.filter = 'all'; compute(); draw(); }),
    chip('📢 حملة', state.tab === 'campaign', () => { state.tab = 'campaign'; state.filter = 'all'; compute(); draw(); }),
  ]));

  const counts = countTasks(state.tasks);
  const get = (k) => (counts[k] || { total: 0, pending: 0 });

  if (state.tab === 'today') {
    c.appendChild(el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '12px' } }, [
      statCard('📦 استلام', String(get('pickup').pending), '#1F6D57'),
      statCard('🧾 مستحقات', String(get('debt').pending), '#E65100'),
      statCard('🎁 مكافآت', String(get('referral').pending), '#B8863B'),
      statCard('🎉 تهاني', String(get('greeting').pending), '#6A1B9A'),
    ]));
    c.appendChild(el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' } }, [
      chip('الكل', state.filter === 'all', () => { state.filter = 'all'; draw(); }),
      chip('📦 استلام', state.filter === 'pickup', () => { state.filter = 'pickup'; draw(); }),
      chip('🧾 مستحقات', state.filter === 'debt', () => { state.filter = 'debt'; draw(); }),
      chip('🎁 مكافآت', state.filter === 'referral', () => { state.filter = 'referral'; draw(); }),
      chip('🎉 تهاني', state.filter === 'greeting', () => { state.filter = 'greeting'; draw(); }),
    ]));
  } else {
    drawCampaignControls(c);
  }

  const visibleType = (t) => state.filter === 'all' || t.type === state.filter;
  const pendingList = state.tasks.filter((t) => visibleType(t) && t.hasPhone && !t.recentlySent);
  const sentList = state.tasks.filter((t) => visibleType(t) && t.recentlySent);
  const noPhone = state.tasks.filter((t) => visibleType(t) && !t.hasPhone && !t.recentlySent);

  if (pendingList.length) {
    c.appendChild(el('button', {
      className: 'btn btn--primary', type: 'button',
      style: { width: '100%', padding: '12px', fontSize: '15px', marginBottom: '12px' }, onClick: startStepper,
    }, '▶ ابدأ المرور (' + pendingList.length + ')'));
  }

  if (!pendingList.length && !sentList.length && !noPhone.length) {
    c.appendChild(el('div', { className: 'card', style: { padding: '24px', textAlign: 'center', color: '#2E7D32' } },
      state.tab === 'today' ? '✅ لا توجد رسائل تحتاج إرسالاً اليوم' : 'لا يوجد عملاء مطابقون لهذه الحملة'));
    return;
  }
  if (!pendingList.length) {
    c.appendChild(el('div', { className: 'card', style: { padding: '14px', textAlign: 'center', color: '#2E7D32', marginBottom: '10px' } },
      '✅ لا شيء بانتظار الإرسال'));
  }

  /* عرض تدريجي: بآلاف العملاء كانت الحملة ترسم كل البطاقات دفعة واحدة (~16 ألف عنصر وتجمّد ثانية) */
  const addList = (items) => {
    const pl = createProgressiveList({ items, pageSize: 25, render: (t) => taskCard(t), endText: '' });
    state.lists.push(pl);
    c.appendChild(pl.node);
  };
  addList(pendingList);

  if (noPhone.length) {
    c.appendChild(el('div', { style: { fontSize: '12px', color: '#C62828', margin: '10px 0 6px' } }, '⚠️ بلا رقم هاتف (' + noPhone.length + ')'));
    addList(noPhone);
  }

  if (sentList.length) {
    c.appendChild(el('button', {
      className: 'btn btn--ghost', type: 'button', style: { fontSize: '12px', margin: '8px 0' },
      onClick: () => { state.showSent = !state.showSent; draw(); },
    }, (state.showSent ? '▲ إخفاء' : '▼ إظهار') + ' ما أُرسل مؤخراً (' + sentList.length + ')'));
    if (state.showSent) addList(sentList);
  }
}

function drawCampaignControls(c) {
  const cfg = state.raw.settings.autoMessages || null;
  const tpls = listTemplates(cfg).filter((t) => t.scope === 'customer' && t.enabled);

  if (!tpls.length) {
    c.appendChild(el('div', { className: 'card', style: { padding: '16px', textAlign: 'center', marginBottom: '10px' } }, [
      el('div', { style: { marginBottom: '10px' } }, 'لا توجد قوالب «عملاء» مفعّلة. فعّل قالباً أو أضف قالباً مخصّصاً من الإعدادات.'),
      el('button', { className: 'btn btn--primary', type: 'button', onClick: () => { location.hash = '#/settings/auto-messages'; } }, '⚙️ الإعدادات'),
    ]));
    return;
  }

  const tplSel = el('select', { className: 'select', 'aria-label': 'القالب' });
  tpls.forEach((t) => {
    const o = el('option', { value: t.id }, t.icon + ' ' + t.name);
    if (t.id === state.campaign.templateId) o.selected = true;
    tplSel.appendChild(o);
  });
  tplSel.addEventListener('change', () => { state.campaign.templateId = tplSel.value; compute(); draw(); });

  const audSel = el('select', { className: 'select', 'aria-label': 'الجمهور' });
  [['vip', '⭐ العملاء المميّزون (VIP)'], ['all', '👥 كل العملاء (لهم هاتف)']].forEach(([v, l]) => {
    const o = el('option', { value: v }, l);
    if (v === state.campaign.audience) o.selected = true;
    audSel.appendChild(o);
  });
  audSel.addEventListener('change', () => { state.campaign.audience = audSel.value; compute(); draw(); });

  c.appendChild(el('div', { className: 'card', style: { padding: '12px', marginBottom: '12px', display: 'grid', gap: '8px' } }, [
    el('label', { style: { fontSize: '12px', color: '#666' } }, 'القالب'), tplSel,
    el('label', { style: { fontSize: '12px', color: '#666' } }, 'الجمهور'), audSel,
    el('div', { style: { fontSize: '11px', color: '#888' } }, 'كل عميل يظهر مرة واحدة في الشهر لكل قالب (بعد فتح رسالته يختفي).'),
  ]));
}

/* ==========================================================================
   6. الواجهة العامة
   ========================================================================== */

export const messagesPage = {
  async render(container) {
    state = blank();
    state.container = container;
    container.appendChild(el('div', { style: { padding: '24px', textAlign: 'center', color: '#888' } }, 'جارٍ التحميل...'));
    try { await loadData(); compute(); draw(); } catch (err) {
      console.error('[messages] render:', err);
      clear(container);
      container.appendChild(el('div', { className: 'card', style: { padding: '16px', color: '#C62828' } }, 'تعذّر التحميل: ' + (err && err.message || err)));
    }
  },
  destroy() {
    (state.lists || []).forEach((l) => { try { l.destroy(); } catch (e) { /* اختياري */ } });
    state = blank();
  },
};
