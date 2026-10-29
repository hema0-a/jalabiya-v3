/* ==========================================================================
   dashboard.js — لوحة التحكم (إجراءات سريعة + «يحتاج إجراءك» + KPIs + رسوم بيانية)
   ==========================================================================
   API:
     dashboardPage.render(container)  → Promise<void>
     dashboardPage.destroy()          → void

   v3.3.39: لوحة تحكم فعلية لا عرض فقط:
   - أزرار سريعة تفتح نماذج (طلب/دفعة/عميل/موعد) مباشرة، وبطاقات KPI تفتح صفحاتها.
   - «يحتاج إجراءك»: طلبات جاهزة لم تُستلم، طلبات متأخرة، مستحقات — اتصال/واتساب/تسليم/تقدّم حالة/تسجيل دفعة من اللوحة نفسها.
   - المواعيد: «تم» واتصال. أحدث العملاء: اتصال وواتساب.

   ⚠️ v3.3.2:
   - يقرأ settings.workshop.name للترحيب + settings.workshop.logo للشعار.
   - يعرض 3 رسوم بيانية: مبيعات 7 أيام، توزيع الطلبات، ملخص مالي.

   v3.5.5: تقسيم صيانة بلا تغيير سلوك — الملف يحتفظ بالحالة والرأس وتنبيه النسخة والبانر التجريبي والواجهة العامة،
   وانتقل الباقي إلى: dashboard-kpis.js (الحسابات والتحميل) · dashboard-actions.js (الإجراءات)
   · dashboard-sections.js (بناء الأقسام) · dashboard-customize.js (التخصيص).
   ========================================================================== */

import { clearDemoData } from '../services/demo-data.js';
import { modal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { el, clear } from '../core/dom.js';
import { readLayout, isVisible, visibleSectionIds } from '../services/dashboard-layout.js'; /* v3.5.1 */
import { backupNudge } from '../services/backup-nudge.js';
import { getLastExternalBackupAt } from '../services/auto-backup.js';
import { formatDate } from '../core/utils.js';
import { loadKPIs } from './dashboard-kpis.js';
import { createDashActions, go } from './dashboard-actions.js';
import {
  buildKPICards, buildAttention, buildDueSoonSection, buildTodayAppointmentsSection,
  buildWeekVisitsSection, buildRecentCustomersSection, buildChartSections,
} from './dashboard-sections.js';
import { buildSectionsBar, openCustomize } from './dashboard-customize.js';

let state = {
  container: null,
  data: null,
};

/** إعادة رسم اللوحة مع الإبقاء على موضع التمرير. */
async function refresh() {
  const c = state.container;
  if (!c) return;
  const y = window.scrollY;
  await dashboardPage.render(c);
  window.scrollTo(0, y);
}

/* إجراءات اللوحة (تقدّم حالة/دفعة/موعد) مربوطة بإعادة الرسم أعلاه */
const actions = createDashActions(refresh);

/** بعد إغلاق نافذة التخصيص بتغيير فعلي: إعادة رسم اللوحة إن كانت ما زالت معروضة. */
function rerenderAfterCustomize() {
  if (!state.container) return;
  Promise.resolve(dashboardPage.render(state.container)).catch((e) => console.error('[Dashboard] re-render after customize failed:', e));
}

/* ==========================================================================
   3. بناء المكونات
   ========================================================================== */

function buildHeader(data, extra = null) {
  const hour = new Date().getHours();
  let greeting = 'أهلاً';
  if (hour < 12) greeting = 'صباح الخير';
  else if (hour < 18) greeting = 'مساء الخير';
  else greeting = 'مساء الخير';

  const name = data && data.workshopName ? data.workshopName : 'صاحب الورشة';

  const logoEl = (data && data.workshopLogo)
    ? el('div', {
        style: {
          width: '44px', height: '44px', borderRadius: '50%',
          background: 'url(' + data.workshopLogo + ') center/cover',
          flexShrink: '0',
          border: '2px solid #1F6D57',
        },
        'aria-label': 'شعار الورشة',
      })
    : null;

  const nameEl = el('div', {
    style: { fontSize: '20px', fontWeight: '600', color: '#123C2F' },
  }, '🧵 ' + greeting + '، ' + name);

  const subEl = el('div', {
    style: { fontSize: '13px', color: '#2E8B6F', marginTop: '4px' },
  }, formatDate(new Date()));

  const textWrap = el('div', { style: { flex: '1', minWidth: '0' } }, [nameEl, subEl]);

  /* v3.5.2: بطاقة واحدة = الترحيب + الإجراءات السريعة (كانا بطاقتين منفصلتين تستهلكان ارتفاعاً على الجوال) */
  const row = el('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } }, [logoEl, textWrap]);
  return el('div', { className: 'card dash-hero', style: { marginBottom: '16px' } }, [row, extra]);
}


/** شريط تنبيه: توجد بيانات تجريبية (تدخل في الأرقام والتقارير حتى تُحذف). */
/* تذكير بنسخة خارج الجهاز: يظهر بعد الرسم الأول ولا يؤخّره، ويُسكَت 3 أيام بزر «لاحقاً» */
const NUDGE_SNOOZE_KEY = 'jalabiya_v3_backup_nudge_snoozed';
async function buildBackupNudge(data) {
  try {
    let snoozedAt = 0;
    try { snoozedAt = Number(localStorage.getItem(NUDGE_SNOOZE_KEY)) || 0; } catch (_) { /* اختياري */ }
    const recordCount = data.realRecords || 0;
    const n = backupNudge({ externalAt: getLastExternalBackupAt(), recordCount, snoozedAt });
    if (!n.show) return null;
    const box = el('div', { className: 'dash-demo', role: 'status', 'data-role': 'backup-nudge' }, [
      el('span', {}, n.text),
      el('a', { className: 'btn btn--sm btn--primary', href: '#/data-care', 'data-action': 'nudge-open' }, 'احفظ نسخة'),
      el('button', {
        className: 'btn btn--sm btn--secondary', type: 'button', 'data-action': 'nudge-snooze',
        onClick: () => {
          try { localStorage.setItem(NUDGE_SNOOZE_KEY, String(Date.now())); } catch (_) { /* اختياري */ }
          box.remove();
        },
      }, 'لاحقاً'),
    ]);
    return box;
  } catch (e) { return null; }
}

function buildDemoBanner() {
  return el('div', { className: 'dash-demo', role: 'status' }, [
    el('span', {}, '🧪 تعرض بيانات تجريبية — تدخل في الأرقام والتقارير حتى تحذفها'),
    el('button', {
      className: 'btn btn--sm btn--secondary', type: 'button',
      onClick: async () => {
        const ok = await modal.confirm({
          title: 'حذف البيانات التجريبية',
          message: 'سيُحذف التجريبي فقط (المُعلَّم 🧪). بياناتك الحقيقية لن تُمسّ.',
          confirmText: 'احذف التجريبي', cancelText: 'إلغاء', danger: true,
        });
        if (!ok) return;
        try { const n = await clearDemoData(); toast.success('تم حذف ' + n + ' سجلاً تجريبياً'); await refresh(); }
        catch (e) { toast.danger('تعذّر الحذف: ' + e.message); }
      },
    }, 'حذفها'),
  ]);
}

function buildQuickActions() {
  const items = [
    { icon: '📋', label: 'طلب جديد', hash: '#/orders/new' },
    { icon: '💰', label: 'دفعة', hash: '#/payments/new' },
    { icon: '👤', label: 'عميل جديد', hash: '#/customers/new' },
    { icon: '📅', label: 'موعد', hash: '#/appointments/new' },
  ];
  return el('div', { className: 'dash-quick', role: 'group', 'aria-label': 'إجراءات سريعة' },
    items.map((it) => el('button', { className: 'dash-quick__btn', type: 'button', onClick: () => go(it.hash) }, [
      el('span', { className: 'dash-quick__icon', 'aria-hidden': 'true' }, it.icon),
      el('span', {}, it.label),
    ])));
}

/* ==========================================================================
   4. API عام
   ========================================================================== */

export const dashboardPage = {
  async render(container) {
    clear(container);
    state.container = container;

    /* تحميل */
    const data = await loadKPIs();
    state.data = data;

    /* بناء */
    const layout = readLayout();   /* v3.5.1: الافتراضي = اللوحة كما كانت */
    container.appendChild(buildHeader(data, isVisible(layout, 'quick') ? buildQuickActions() : null));
    if (data.hasDemo) container.appendChild(buildDemoBanner());
    const nudgeSlot = el('div', { 'data-role': 'nudge-slot' });
    container.appendChild(nudgeSlot);
    buildBackupNudge(data).then((n) => { if (n && nudgeSlot.isConnected) nudgeSlot.appendChild(n); });
    if (isVisible(layout, 'kpis')) container.appendChild(buildKPICards(data));
    container.appendChild(buildAttention(data, actions));

    /* أقسام قابلة للطي: مواعيد · عملاء الأسبوع · مستحقة · رسوم · أحدث العملاء */
    const sections = el('div', { className: 'dash-sections' });
    const bar = buildSectionsBar(sections, () => openCustomize(rerenderAfterCustomize));
    sections.appendChild(bar);
    const shownIds = visibleSectionIds(layout);
    const want = (id) => shownIds.includes(id);
    const built = new Map();
    const keep = (n) => { if (n) built.set(n.getAttribute('data-collapsible-id'), n); };
    if (want('dash-appts')) keep(buildTodayAppointmentsSection(data.todayApptsRows, actions));
    if (want('dash-week')) keep(buildWeekVisitsSection(data.weekVisits, data.workshopNameRaw));
    if (want('dash-due')) keep(buildDueSoonSection(data.dueSoonRows, actions));
    if (want('dash-sales') || want('dash-finance') || want('dash-orders')) buildChartSections(data).forEach(keep);
    if (want('dash-recent')) keep(buildRecentCustomersSection(data.recentCustomers, data.workshopName));
    shownIds.forEach((id) => { const n = built.get(id); if (n) sections.appendChild(n); });
    bar.update();
    container.appendChild(sections);
  },

  destroy() {
    state = { container: null, data: null };
  },
};
