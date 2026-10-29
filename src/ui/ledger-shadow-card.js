/* ==========================================================================
   ledger-shadow-card.js — بطاقة «مطابقة العدّادات للدفتر» في صيانة البيانات (v3.3.79)
   ==========================================================================
   تعرض: هل تتطابق عدّادات المحفظة والنقاط وكميات المخزون القديمة مع مجموع الدفتر الجديد؟ وإن اختلفت تعرض
   الفروق بوضوح (العميل، الوحدة، القديم، الدفتر، الفرق، السبب). الوضع الظلّي: العدّادات القديمة
   هي المرجع، والبطاقة للمراقبة فقط. لا innerHTML: كل النصوص عبر el().

   v3.3.81 (الخطوة 2أ): «لوحة التفعيل» أسفل البطاقة: تعرض شروط الجاهزية (مزامنة نظيفة، صفر فروق، نسخة
   احتياطية جديدة)، وتمنع التفعيل مع بيان السبب إن لم تتحقق، وعند التفعيل تأخذ نسخة جديدة وتفحصها أولاً.
   تجهيز فقط: المفتاح لا يغيّر أي سلوك مالي بعد.

   v3.3.82 (الخطوة 2ب): التفعيل صار حقيقياً — المحفظة والنقاط تُكتب عبر الدفتر (ledger-apply.js)
   والعدّادات القديمة مشتقة منه. اللوحة تصف ذلك بوضوح وتخفي «إعادة ضبط الدفتر» أثناء التفعيل.
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { modal } from './modal.js';
import { toast } from './toast.js';
import {
  loadShadowReport, ensureOpening, resetShadowLedger, KIND_LABELS, formatAmount,
} from '../services/ledger-report.js';
import { UNITS } from '../services/ledger.js';
import { resetShadowFailures } from '../services/ledger-shadow.js';
import { collectReadiness, activateLedgerAuthority, deactivateLedgerAuthority } from '../services/ledger-authority.js';
import { formatDate } from '../core/utils.js';
import { clearDivergences } from '../services/ledger-union.js';
import { describeConflicts, keepStoredConflict, recordDroppedConflict } from '../services/ledger-conflicts.js';

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
  /* مراجعة بلاغات المزامنة (cache_diverged/id_conflict): يمسح السجل المحلي فقط، لا الدفتر (v3.3.83) */
  const btnAck = el('button', { className: 'btn btn--sm btn--secondary', type: 'button', hidden: true, 'data-action': 'ledger-ack-issues', onClick: () => { clearDivergences(); load(); } }, '✔️ راجعتُ انحرافات العدّادات');
  const authBox = el('div', { className: 'ledauth', 'data-role': 'ledger-authority' });
  const conflictsBox = el('div', { className: 'ledconf', 'data-role': 'ledger-conflicts', hidden: true });
  const card = el('div', { className: 'card ledcard', 'data-role': 'ledger-shadow' }, [
    el('div', { className: 'ledcard__head' }, [title, btnRefresh]), body,
    el('div', { className: 'ledcard__actions' }, [btnOpen, btnReset, btnAck]),
    conflictsBox,
    authBox,
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
        ? 'العدّادات والكميات القديمة تطابق مجموع الدفتر تماماً (' + r.customers + ' عميل · ' + r.items + ' صنف · ' + r.entries + ' سطر).'
        : 'يوجد ' + r.mismatches + ' فرق بين العدّادات والدفتر (' + r.customers + ' عميل · ' + r.items + ' صنف · ' + r.entries + ' سطر).'));
      if (r.failures > 0) {
        body.appendChild(el('div', { className: 'ledcard__warn', 'data-role': 'ledger-failures' },
          '⚠️ فشلت الكتابة في الدفتر ' + r.failures + ' مرة على هذا الجهاز (العمليات الأصلية سليمة). أعد الضبط أو راجع الفروق.'));
      }
      btnAck.hidden = !r.anomalies.some((a) => a.kind === 'cache_diverged');
      r.anomalies.filter((a) => a.severity === 'warn' && a.kind !== 'id_conflict').slice(0, 5).forEach((a) => {
        body.appendChild(el('div', { className: 'ledcard__warn' }, '⚠️ ' + a.message));
      });
      if (r.rows.length) {
        const list = el('div', { className: 'ledcard__rows', 'data-role': 'ledger-rows' });
        r.rows.slice(0, MAX_ROWS).forEach((row) => list.appendChild(el('div', { className: 'ledcard__row', 'data-kind': row.kind }, [
          el('div', { className: 'ledcard__who' }, (row.name || (row.unit === 'stock' ? 'صنف غير معروف' : 'عميل غير معروف')) + ' — ' + UNITS[row.unit].label),
          el('div', { className: 'ledcard__nums' },
            'القديم: ' + formatAmount(row.unit, row.legacy) + ' · الدفتر: ' + formatAmount(row.unit, row.ledger)
            + ' · الفرق: ' + formatAmount(row.unit, row.diff)),
          el('div', { className: 'ledcard__why' }, KIND_LABELS[row.kind] || row.kind),
        ])));
        if (r.rows.length > MAX_ROWS) list.appendChild(el('div', { className: 'ledcard__more' }, 'و' + (r.rows.length - MAX_ROWS) + ' فرقاً آخر…'));
        body.appendChild(list);
      }
      await renderConflicts();
      await renderAuthority(r);
    } catch (e) {
      clear(body);
      body.appendChild(el('div', { className: 'ledcard__warn' }, 'تعذّر الفحص: ' + (e && e.message ? e.message : e)));
    } finally { btnRefresh.disabled = false; }
  }

  /** سطر وصف جانب من التعارض: «+250 ج.م (شحن) — 12/10 · جهاز abc». */
  const sideText = (unit, s) => formatAmount(unit, s.delta) + (s.type ? ' (' + s.type + ')' : '')
    + (s.at ? ' — ' + formatDate(s.at) : '') + (s.dev ? ' · جهاز ' + s.dev.slice(0, 6) : '');

  /** تعارضات معرّفات الدفتر المعلّقة (id_conflict): اعتماد المحفوظ أو تسجيل المُسقَط كتسوية. فشلها لا يُسقط البطاقة. */
  async function renderConflicts() {
    try {
      const list = await describeConflicts();
      clear(conflictsBox);
      conflictsBox.hidden = list.length === 0;
      if (list.length === 0) return;
      conflictsBox.appendChild(el('div', { className: 'ledconf__title' }, '⚖️ تعارضات معرّفات الدفتر (' + list.length + ')'));
      conflictsBox.appendChild(el('div', { className: 'ledconf__note' },
        'حركتان بالمعرّف نفسه وبمبلغين مختلفين (من مزامنة أو استعادة). أُبقي المحفوظ ولم يُكتب فوقه شيء. اختر لكل تعارض: '
        + 'اعتماد المحفوظ (الوارد خطأ/مكرر)، أو تسجيل المُسقَطة كتسوية جديدة بمعرّف جديد (إن كانت حركة حقيقية).'));
      list.slice(0, 10).forEach((c) => {
        const btnKeep = el('button', { className: 'btn btn--sm btn--secondary', type: 'button', 'data-action': 'ledger-conflict-keep', 'data-id': c.id, onClick: () => runKeep(c) }, '✅ اعتمد المحفوظ');
        const btnRec = el('button', { className: 'btn btn--sm btn--primary', type: 'button', 'data-action': 'ledger-conflict-record', 'data-id': c.id, title: c.canRecord.reason, onClick: () => runRecord(c) }, '➕ سجّل المُسقَطة كتسوية جديدة');
        btnRec.disabled = !c.canRecord.ok;
        conflictsBox.appendChild(el('div', { className: 'ledconf__item', 'data-id': c.id }, [
          el('div', { className: 'ledconf__who' }, c.title + ' — ' + (UNITS[c.unit] ? UNITS[c.unit].label : c.unit)),
          el('div', { className: 'ledconf__side' }, '📌 المحفوظة: ' + sideText(c.unit, c.kept)),
          el('div', { className: 'ledconf__side' }, '↩️ المُسقَطة: ' + sideText(c.unit, c.dropped)),
          c.canRecord.ok ? null : el('div', { className: 'ledconf__why' }, '⛔ ' + c.canRecord.reason),
          el('div', { className: 'ledcard__actions' }, [btnKeep, btnRec]),
        ]));
      });
      if (list.length > 10) conflictsBox.appendChild(el('div', { className: 'ledcard__more' }, 'و' + (list.length - 10) + ' تعارضاً آخر بعد حسم هذه…'));
    } catch (e) {
      clear(conflictsBox);
      conflictsBox.hidden = false;
      conflictsBox.appendChild(el('div', { className: 'ledcard__warn' }, 'تعذّر عرض التعارضات: ' + (e && e.message ? e.message : e)));
    }
  }

  async function runKeep(c) {
    const ok = await modal.confirm({
      title: 'اعتماد المحفوظ',
      message: 'ستبقى الحركة المحفوظة (' + sideText(c.unit, c.kept) + ') وتُهمَل المُسقَطة (' + sideText(c.unit, c.dropped)
        + ') نهائياً. لا يتغيّر شيء في الدفتر. متابعة؟',
      confirmText: 'اعتمد المحفوظ', cancelText: 'إلغاء',
    });
    if (!ok) return;
    const r = await keepStoredConflict(c.id);
    if (r.status === 'resolved') toast.success('حُسم التعارض: اعتُمد المحفوظ'); else toast.warning(r.reason);
    await load();
  }

  async function runRecord(c) {
    const ok = await modal.confirm({
      title: 'تسجيل المُسقَطة كتسوية',
      message: 'سيُضاف سطر جديد بمعرّف جديد: ' + sideText(c.unit, c.dropped) + ' لحساب «' + c.title + '»، فيتغيّر رصيده. '
        + 'لا يُكتب فوق أي سطر موجود. متابعة؟',
      confirmText: 'سجّل التسوية', cancelText: 'إلغاء',
    });
    if (!ok) return;
    const r = await recordDroppedConflict(c.id);
    if (r.status === 'recorded') toast.success('سُجّلت التسوية بمعرّف جديد');
    else if (r.status === 'exists') toast.info('التسوية مسجّلة سابقاً — حُسم التعارض');
    else if (r.status === 'failed') toast.danger('تعذّر التسجيل: ' + r.reason);
    else toast.warning(r.reason);
    await load();
  }

  /** لوحة التفعيل: شروط الجاهزية + زر التفعيل/الإلغاء. فشلها لا يُسقط البطاقة. */
  async function renderAuthority(report) {
    try {
      const res = await collectReadiness({ report });
      clear(authBox);
      authBox.setAttribute('data-state', res.alreadyEnabled ? 'enabled' : (res.canAttempt ? 'ready' : 'blocked'));
      authBox.appendChild(el('div', { className: 'ledauth__title' }, '🔐 تفعيل الدفتر كمرجع أساسي'));
      btnReset.hidden = res.alreadyEnabled;   /* لا إعادة ضبط للدفتر وهو مرجع */
      authBox.appendChild(el('div', { className: 'ledauth__note' }, res.alreadyEnabled
        ? 'الدفتر هو المرجع الآن لحركات المحفظة والنقاط على هذا الجهاز: تُكتب فيه أولاً (معاملة واحدة مع العدّادات؛ فشل الدفتر = فشل العملية)، والعدّادات القديمة مشتقة منه ولا تُكتب مباشرة. المخزون ما زال ظلّياً.'
        : 'عند التفعيل: كل حركة محفظة/نقاط على هذا الجهاز تُكتب في الدفتر أولاً (معاملة واحدة مع العدّادات؛ فشل الدفتر = فشل العملية)، وتصير العدّادات القديمة مشتقة منه ولا تُكتب مباشرة. المخزون يبقى ظلّياً. الإلغاء متاح دائماً.'));

      if (res.alreadyEnabled) {
        const cur = res.current;
        authBox.appendChild(el('div', { className: 'ledauth__state', 'data-role': 'authority-state' },
          '✅ مفعَّل على هذا الجهاز' + (cur.enabledAt ? ' منذ ' + formatDate(cur.enabledAt) : '')
          + (cur.backupId ? ' — نسخة ما قبل التفعيل: ' + String(cur.backupId).slice(0, 8) : '')));
        authBox.appendChild(el('div', { className: 'ledcard__actions' }, [
          el('button', { className: 'btn btn--sm btn--secondary', type: 'button', 'data-action': 'ledger-authority-deactivate', onClick: () => runDeactivate() }, '↩️ ألغِ التفعيل'),
        ]));
        return;
      }

      res.checks.forEach((c) => {
        const icon = c.ok ? '✅' : (c.id === 'backup' && res.canAttempt ? '⏳' : '❌');
        authBox.appendChild(el('div', { className: 'ledauth__check', 'data-check': c.id, 'data-ok': c.ok ? '1' : '0' }, [
          el('div', { className: 'ledauth__label' }, icon + ' ' + c.label),
          el('div', { className: 'ledauth__detail' }, c.detail),
          !c.ok && c.hint ? el('div', { className: 'ledauth__hint' }, c.hint) : null,
        ]));
      });
      if (!res.canAttempt) {
        authBox.appendChild(el('div', { className: 'ledauth__reason', 'data-role': 'authority-reason' }, '⛔ ' + res.reason));
      }
      const btnActivate = el('button', {
        className: 'btn btn--sm btn--primary', type: 'button', 'data-action': 'ledger-authority-activate',
        onClick: () => runActivate(btnActivate),
      }, '🔒 فعّل الدفتر كمرجع (مع نسخة احتياطية تلقائية)');
      btnActivate.disabled = !res.canAttempt;
      authBox.appendChild(el('div', { className: 'ledcard__actions' }, [btnActivate]));
    } catch (e) {
      clear(authBox);
      authBox.appendChild(el('div', { className: 'ledcard__warn' }, 'تعذّر فحص جاهزية التفعيل: ' + (e && e.message ? e.message : e)));
    }
  }

  async function runActivate(btn) {
    const ok = await modal.confirm({
      title: 'تفعيل الدفتر كمرجع',
      message: 'سيُؤخذ الآن نسخة احتياطية جديدة وتُفحص، ثم يُفعَّل الدفتر كمرجع على هذا الجهاز: كل حركة محفظة أو نقاط '
        + 'ستُكتب في الدفتر أولاً، والرصيد والنقاط الظاهران يُشتقّان منه، ولن يُسمح بحذف عميل له رصيد. متابعة؟',
      confirmText: 'خذ نسخة وفعّل', cancelText: 'إلغاء',
    });
    if (!ok) return;
    if (btn) btn.disabled = true;
    try {
      const r = await activateLedgerAuthority();
      if (r.status === 'activated') toast.success('فُعّل الدفتر كمرجع بعد نسخة احتياطية سليمة');
      else if (r.status === 'failed') toast.danger(r.reason);
      else toast.warning(r.reason || 'تعذّر التفعيل');
    } catch (e) { toast.danger('تعذّر: ' + (e && e.message ? e.message : e)); }
    await load();
  }

  async function runDeactivate() {
    const ok = await modal.confirm({
      title: 'إلغاء التفعيل',
      message: 'يعود التطبيق للعمل بالعدّادات القديمة كمرجع، ويستمر الدفتر ظلّياً. لا تتغيّر أي بيانات الآن. متابعة؟',
      confirmText: 'ألغِ التفعيل', cancelText: 'إلغاء',
    });
    if (!ok) return;
    try {
      const r = await deactivateLedgerAuthority();
      if (r.status === 'failed') toast.danger(r.reason); else toast.success('أُلغي التفعيل');
    } catch (e) { toast.danger('تعذّر: ' + (e && e.message ? e.message : e)); }
    await load();
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
