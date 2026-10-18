/* ==========================================================================
   ledger-shadow-card.js — بطاقة «مطابقة العدّادات للدفتر» في صيانة البيانات (v3.3.79)
   ==========================================================================
   تعرض: هل تتطابق عدّادات المحفظة والنقاط القديمة مع مجموع الدفتر الجديد؟ وإن اختلفت تعرض
   الفروق بوضوح (العميل، الوحدة، القديم، الدفتر، الفرق، السبب). الوضع الظلّي: العدّادات القديمة
   هي المرجع، والبطاقة للمراقبة فقط. لا innerHTML: كل النصوص عبر el().
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { modal } from './modal.js';
import { toast } from './toast.js';
import {
  loadShadowReport, ensureOpening, resetShadowLedger, KIND_LABELS, formatAmount,
} from '../services/ledger-report.js';
import { UNITS } from '../services/ledger.js';
import { resetShadowFailures } from '../services/ledger-shadow.js';

const MAX_ROWS = 25;

/**
 * @returns {HTMLElement}
 */
export function buildLedgerShadowCard() {
  const title = el('h3', { className: 'ledcard__title' }, '📒 مطابقة الدفتر الجديد (وضع المراقبة)');
  const body = el('div', { className: 'ledcard__body' }, 'جارٍ الفحص…');
  const btnRefresh = el('button', { className: 'btn btn--sm btn--secondary', type: 'button', 'data-action': 'ledger-refresh', onClick: () => load() }, '🔄 إعادة الفحص');
  const btnOpen = el('button', { className: 'btn btn--sm btn--secondary', type: 'button', 'data-action': 'ledger-opening', onClick: () => runOpening() }, '📒 اكتب الأسطر الافتتاحية');
  const btnReset = el('button', { className: 'btn btn--sm btn--secondary', type: 'button', 'data-action': 'ledger-reset', onClick: () => runReset() }, '♻️ إعادة ضبط الدفتر');
  const card = el('div', { className: 'card ledcard', 'data-role': 'ledger-shadow' }, [
    el('div', { className: 'ledcard__head' }, [title, btnRefresh]), body,
    el('div', { className: 'ledcard__actions' }, [btnOpen, btnReset]),
    el('div', { className: 'ledcard__hint' },
      'التطبيق يعمل بالعدّادات القديمة كالمعتاد، ويُسجَّل كل تغيير في الدفتر في الخلفية للمقارنة فقط. '
      + 'قد تظهر فروق إن كان لديك جهاز آخر لم يُحدَّث بعد، أو بعد استعادة نسخة احتياطية قديمة.'),
  ]);

  async function load() {
    btnRefresh.disabled = true;
    try {
      const r = await loadShadowReport();
      card.setAttribute('data-ok', r.ok ? '1' : '0');
      clear(body);
      title.textContent = (r.ok ? '✅' : '⚠️') + ' مطابقة الدفتر الجديد (وضع المراقبة)';
      body.appendChild(el('div', { className: 'ledcard__summary', 'data-role': 'ledger-summary' }, r.ok
        ? 'العدّادات القديمة تطابق مجموع الدفتر تماماً (' + r.customers + ' عميل · ' + r.entries + ' سطر).'
        : 'يوجد ' + r.mismatches + ' فرق بين العدّادات والدفتر (' + r.customers + ' عميل · ' + r.entries + ' سطر).'));
      if (r.failures > 0) {
        body.appendChild(el('div', { className: 'ledcard__warn', 'data-role': 'ledger-failures' },
          '⚠️ فشلت الكتابة في الدفتر ' + r.failures + ' مرة على هذا الجهاز (العمليات الأصلية سليمة). أعد الضبط أو راجع الفروق.'));
      }
      r.anomalies.filter((a) => a.severity === 'warn').slice(0, 5).forEach((a) => {
        body.appendChild(el('div', { className: 'ledcard__warn' }, '⚠️ ' + a.message));
      });
      if (r.rows.length) {
        const list = el('div', { className: 'ledcard__rows', 'data-role': 'ledger-rows' });
        r.rows.slice(0, MAX_ROWS).forEach((row) => list.appendChild(el('div', { className: 'ledcard__row', 'data-kind': row.kind }, [
          el('div', { className: 'ledcard__who' }, (row.name || 'عميل غير معروف') + ' — ' + UNITS[row.unit].label),
          el('div', { className: 'ledcard__nums' },
            'القديم: ' + formatAmount(row.unit, row.legacy) + ' · الدفتر: ' + formatAmount(row.unit, row.ledger)
            + ' · الفرق: ' + formatAmount(row.unit, row.diff)),
          el('div', { className: 'ledcard__why' }, KIND_LABELS[row.kind] || row.kind),
        ])));
        if (r.rows.length > MAX_ROWS) list.appendChild(el('div', { className: 'ledcard__more' }, 'و' + (r.rows.length - MAX_ROWS) + ' فرقاً آخر…'));
        body.appendChild(list);
      }
    } catch (e) {
      clear(body);
      body.appendChild(el('div', { className: 'ledcard__warn' }, 'تعذّر الفحص: ' + (e && e.message ? e.message : e)));
    } finally { btnRefresh.disabled = false; }
  }

  async function runOpening() {
    btnOpen.disabled = true;
    try {
      const r = await ensureOpening({});
      if (r.status === 'gated') toast.warning(r.reason);
      else toast.success(r.written ? 'كُتب ' + r.written + ' سطر افتتاحي' : 'لا أسطر افتتاحية ناقصة');
      await load();
    } catch (e) { toast.danger('تعذّر: ' + (e && e.message ? e.message : e)); }
    finally { btnOpen.disabled = false; }
  }

  async function runReset() {
    const ok = await modal.confirm({
      title: 'إعادة ضبط الدفتر',
      message: 'سيُمسح الدفتر الجديد وتُعاد كتابته من العدّادات الحالية. عدّاداتك وبياناتك الأصلية لا تتغيّر (الدفتر في وضع المراقبة فقط). متابعة؟',
      confirmText: 'أعد الضبط', cancelText: 'إلغاء', danger: true,
    });
    if (!ok) return;
    btnReset.disabled = true;
    try {
      const r = await resetShadowLedger();
      if (r.status === 'gated') toast.warning(r.reason);
      else { resetShadowFailures(); toast.success('أُعيد ضبط الدفتر (' + r.written + ' سطر افتتاحي)'); }
      await load();
    } catch (e) { toast.danger('تعذّر: ' + (e && e.message ? e.message : e)); }
    finally { btnReset.disabled = false; }
  }

  load();
  return card;
}
