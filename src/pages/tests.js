/* ==========================================================================
   tests.js — صفحة الاختبارات (Entry Point للواجهة)
   ==========================================================================
   ⚠️ static imports ONLY — dynamic imports تفشل في Safari (القاعدة 14).
   - تستدعي runAll من registry.js.
   - تعرض النتائج في <pre> + ملخص نهائي.
   - لا تربط نفسها بـ main.js — الربط في الخطوة 3.
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { runAll } from '../tests/registry.js';
import * as idb from '../data/idb.js';
import '../tests/index.js';  // ← يُشغّل كل register() في modules/

/* ==========================================================================
   1. الحالة الداخلية
   ========================================================================== */

let state = {
  container: null,
  isRunning: false,
  outputEl: null,
  summaryEl: null,
  runBtn: null,
};

/* ==========================================================================
   2. بناء الواجهة
   ========================================================================== */

function buildHeader() {
  return el('div', { style: { marginBottom: '16px' } }, [
    el('h1', {
      style: { fontSize: '22px', color: '#123C2F', margin: '0 0 4px 0' },
    }, '🧪 الاختبارات'),
    el('p', {
      style: { fontSize: '13px', color: '#2E8B6F', margin: '0' },
    }, 'تشغيل كل الاختبارات في المتصفح — Chrome + Safari'),
  ]);
}

function buildControls() {
  const runBtn = el('button', {
    className: 'btn btn--primary btn--block',
    type: 'button',
    style: { marginBottom: '16px' },
    onClick: () => runTests(),
  }, '▶️ تشغيل الاختبارات');

  state.runBtn = runBtn;
  return runBtn;
}

function buildOutput() {
  const outputEl = el('pre', {
    id: 'tests-output',
    style: {
      background: '#1a1a1a',
      color: '#e0e0e0',
      padding: '12px',
      borderRadius: '8px',
      fontSize: '12px',
      lineHeight: '1.6',
      overflow: 'auto',
      maxHeight: '60vh',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      direction: 'ltr',
      textAlign: 'left',
      fontFamily: 'monospace',
      margin: '0 0 16px 0',
    },
  }, 'اضغط "▶️ تشغيل الاختبارات" للبدء...');

  state.outputEl = outputEl;
  return outputEl;
}

function buildSummary() {
  const summaryEl = el('div', {
    id: 'tests-summary',
    style: {
      padding: '12px',
      borderRadius: '8px',
      fontSize: '14px',
      fontWeight: '600',
      textAlign: 'center',
      background: '#F6F1E6',
      color: '#123C2F',
      display: 'none',
    },
  });

  state.summaryEl = summaryEl;
  return summaryEl;
}

/* ==========================================================================
   3. منطق التشغيل
   ========================================================================== */

async function runTests() {
  if (state.isRunning) return;

  /* 🛡️ حماية: الاختبارات تمسح المخازن (customers.clear() ...) فلا تعمل على بيانات حقيقية */
  try {
    const guarded = ['customers', 'orders', 'payments', 'inventory', 'workers',
      'expenses', 'appointments', 'portfolio', 'commitments', 'houseExpenses',
      'personalLoans', 'referrals'];
    let real = 0;
    for (const sn of guarded) real += await idb.count(sn).catch(() => 0);
    if (real > 0) {
      state.outputEl.textContent =
        '🛑 تم إيقاف الاختبارات لحماية بياناتك.\n' +
        'الاختبارات تمسح الجداول قبل تجربتها، وفي التطبيق ' + real + ' سجل حقيقي.\n' +
        'شغّلها فقط على نسخة تجريبية فارغة (متصفح آخر أو بعد مسح بيانات الموقع).';
      return;
    }
  } catch (e) { /* إن تعذّر الفحص نكمل كما كان */ }

  state.isRunning = true;
  state.runBtn.disabled = true;
  state.runBtn.textContent = '⏳ جارٍ التشغيل...';
  state.outputEl.textContent = '';
  state.summaryEl.style.display = 'none';

  const startedAt = Date.now();

  try {
    const result = await runAll((header, body) => {
      state.outputEl.textContent += header + '\n' + (body ? body + '\n' : '') + '\n';
    });

    const elapsedMs = Date.now() - startedAt;
    const allPassed = result.totalPassed === result.totalTests;
    const color = allPassed ? '#2E7D32' : '#C62828';

    state.summaryEl.style.display = 'block';
    state.summaryEl.style.background = allPassed ? '#E8F5E9' : '#FFEBEE';
    state.summaryEl.style.color = color;
    state.summaryEl.textContent = (allPassed ? '✅' : '❌') + ' ' +
      result.totalPassed + ' / ' + result.totalTests +
      ' اختبار · ' + elapsedMs + ' ms';

    state.outputEl.textContent += '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    state.outputEl.textContent += (allPassed ? '✅ كل الاختبارات نجحت' : '❌ بعض الاختبارات فشلت') + '\n';
    state.outputEl.textContent += '⏱️ الوقت: ' + elapsedMs + ' ms\n';
  } catch (e) {
    state.outputEl.textContent += '\n❌ فشل التشغيل: ' + (e.message || String(e)) + '\n';
    state.summaryEl.style.display = 'block';
    state.summaryEl.style.background = '#FFEBEE';
    state.summaryEl.style.color = '#C62828';
    state.summaryEl.textContent = '❌ فشل التشغيل';
  } finally {
    state.isRunning = false;
    state.runBtn.disabled = false;
    state.runBtn.textContent = '🔄 إعادة التشغيل';
  }
}

/* ==========================================================================
   4. API عام (متوافق مع MODULE_EXPORT_MAP)
   ========================================================================== */

export const testsPage = {
  /**
   * رسم الصفحة.
   * @param {HTMLElement} container
   */
  async render(container) {
    clear(container);
    state.container = container;

    container.appendChild(buildHeader());
    container.appendChild(buildControls());
    container.appendChild(buildOutput());
    container.appendChild(buildSummary());
  },

  /**
   * تنظيف الصفحة.
   */
  destroy() {
    state = {
      container: null,
      isRunning: false,
      outputEl: null,
      summaryEl: null,
      runBtn: null,
    };
  },
};
