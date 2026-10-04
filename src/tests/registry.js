/* ==========================================================================
   registry.js — سجل اختبارات موحّد (Registry Pattern)
   ==========================================================================
   يوفر API بسيط:
     register(name, fn)     — تسجيل مجموعة اختبارات
     runAll(outputFn)       — تشغيل الكل وإرجاع النتائج
   
   كل مجموعة تُستدعى بدالة (t) توفر:
     t.test(label, fnOrValue)  — اختبار (sync أو async)، ينجح إن كان truthy
     t.log(message)            — طبع سطر مساعد
   ========================================================================== */

const registered = [];

/**
 * تسجيل مجموعة اختبارات جديدة.
 * @param {string} name — اسم الوحدة (مثل 'events.js')
 * @param {Function} fn — دالة async تتلقى كائن t
 */
export function register(name, fn) {
  if (typeof name !== 'string' || typeof fn !== 'function') {
    throw new TypeError('[registry] register requires (string, function)');
  }
  registered.push({ name, fn });
}

/**
 * إرجاع قائمة الوحدات المسجّلة (نسخة).
 */
export function getRegistered() {
  return registered.slice();
}

/**
 * إنشاء سياق اختبار (test context) لمجموعة واحدة.
 * @returns {{passed:number, total:number, output:string[], test:Function, log:Function}}
 */
function createTestContext() {
  const ctx = {
    passed: 0,
    total: 0,
    output: [],

    /**
     * تشغيل اختبار واحد.
     * @param {string} label
     * @param {Function|*} fnOrValue — دالة (sync/async) أو قيمة مباشرة
     */
    async test(label, fnOrValue) {
      ctx.total++;
      try {
        const value = (typeof fnOrValue === 'function')
          ? await fnOrValue()
          : fnOrValue;
        if (value) {
          ctx.output.push('  ✅ ' + label);
          ctx.passed++;
        } else {
          ctx.output.push('  ❌ ' + label);
        }
      } catch (e) {
        const msg = (e && e.message) ? e.message : String(e);
        ctx.output.push('  ❌ ' + label + ' → ' + msg);
      }
    },

    /** طباعة سطر مساعد */
    log(msg) { ctx.output.push(msg); },
  };
  return ctx;
}

/**
 * تشغيل كل الوحدات المسجّلة.
 * @param {Function} outputFn — (header, body) => void — يُستدعى بعد كل وحدة
 * @returns {Promise<{totalPassed:number, totalTests:number, results:Array}>}
 */
export async function runAll(outputFn) {
  let totalPassed = 0;
  let totalTests = 0;
  const results = [];

  for (const mod of registered) {
    const t = createTestContext();
    try {
      await mod.fn(t);
    } catch (e) {
      const msg = (e && e.message) ? e.message : String(e);
      t.output.push('  ❌ MODULE FAILED: ' + msg);
    }

    if (typeof outputFn === 'function') {
      outputFn('▶ ' + mod.name, t.output.join('\n'));
      outputFn('📊 ' + mod.name + ': ' + t.passed + '/' + t.total, '');
    }

    totalPassed += t.passed;
    totalTests += t.total;
    results.push({ name: mod.name, passed: t.passed, total: t.total });
  }

  return { totalPassed, totalTests, results };
}
