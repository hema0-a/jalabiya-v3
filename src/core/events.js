/* ==========================================================================
   events.js — ناقل الأحداث (EventBus)
   ==========================================================================
   نظام نشر/اشتراك (Pub/Sub) للتواصل بين الوحدات دون ربط مباشر.
   نسخة واحدة مشتركة (Singleton) عبر التطبيق كله.
   ========================================================================== */

/**
 * ناقل الأحداث — يُدير تسجيل المستمعين وبث الأحداث.
 * يعتمد على Map<string, Set<Function>> لضمان عدم تكرار المستمع.
 */
class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this.listeners = new Map();
  }

  /**
   * تسجيل مستمع لحدث معيّن.
   * @param {string} event - اسم الحدث
   * @param {Function} handler - الدالة المستدعاة عند بث الحدث
   * @returns {Function} دالة لإلغاء التسجيل (unsubscribe)
   */
  on(event, handler) {
    if (typeof handler !== 'function') {
      throw new TypeError('[EventBus] handler must be a function');
    }
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(handler);
    // إرجاع دالة إلغاء التسجيل
    return () => this.off(event, handler);
  }

  /**
   * إلغاء تسجيل مستمع معيّن.
   * @param {string} event
   * @param {Function} handler
   * @returns {boolean} true إن أُلغي، false إن لم يوجد
   */
  off(event, handler) {
    const set = this.listeners.get(event);
    if (!set) return false;
    const removed = set.delete(handler);
    // تنظيف المجموعة الفارغة
    if (set.size === 0) this.listeners.delete(event);
    return removed;
  }

  /**
   * بث حدث لكل المستمعين المسجّلين.
   * يستخدم نسخة من المجموعة لتفادي مشاكل التعديل أثناء التنفيذ.
   * أي خطأ في مستمع لا يوقف بقية المستمعين.
   * @param {string} event
   * @param {*} [data] - بيانات تُمرَّر للمستمعين
   */
  emit(event, data) {
    const set = this.listeners.get(event);
    if (!set || set.size === 0) return;

    // نسخة من المجموعة — التعديلات أثناء التنفيذ تُطبَّق على البث التالي
    [...set].forEach((handler) => {
      try {
        handler(data);
      } catch (err) {
        console.error(`[EventBus] Error in handler for "${event}":`, err);
      }
    });
  }

  /**
   * تسجيل مستمع يُنفَّذ مرة واحدة فقط ثم يُلغى تلقائياً.
   * @param {string} event
   * @param {Function} handler
   * @returns {Function} دالة إلغاء التسجيل
   */
  once(event, handler) {
    const wrapper = (data) => {
      // نُلغي أولاً لضمان عدم التكرار حتى لو رمى المستمع خطأً
      this.off(event, wrapper);
      handler(data);
    };
    return this.on(event, wrapper);
  }

  /**
   * مسح المستمعين — حدث واحد أو الكل.
   * @param {string} [event] - إن أُهمل، يُمسح كل شيء
   */
  clear(event) {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  /**
   * عدد المستمعين المسجّلين (لحدث معيّن أو للكل).
   * @param {string} [event]
   * @returns {number}
   */
  count(event) {
    if (event) {
      return this.listeners.get(event)?.size ?? 0;
    }
    let total = 0;
    this.listeners.forEach((set) => { total += set.size; });
    return total;
  }
}

/* --- نسخة وحيدة مشتركة في التطبيق (Singleton) --- */
export const events = new EventBus();

/* --- تصدير الكلاس لأغراض الاختبار --- */
export { EventBus };
