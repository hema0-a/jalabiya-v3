/* ==========================================================================
   section-demo-data.js — قسم البيانات التجريبية (v3.5.26: مفصول عن sections-system.js دون تغيير سلوك)
   ==========================================================================
   يصدّر: demoDataSection
   لا يستورد sections-system.js (لا دورات استيراد).
   ========================================================================== */

import { el, clear } from '../../core/dom.js';
import { toast } from '../../ui/toast.js';
import { modal } from '../../ui/modal.js';
import * as autoSync from '../../sync/auto-sync.js';
import { seedDemoData, clearDemoData, countDemoData } from '../../services/demo-data.js';

/* ==========================================================================
   7. بيانات تجريبية (v3.3.40) — للتجربة السريعة بلا المساس ببياناتك
   ========================================================================== */

const DEMO_LABELS = {
  customers: 'عميل', orders: 'طلب', payments: 'دفعة', expenses: 'مصروف',
  inventory: 'صنف مخزون', workers: 'عامل', appointments: 'موعد', quotes: 'عرض سعر',
};

export const demoDataSection = {
  id: 'demo-data',
  icon: '🧪',
  title: 'بيانات تجريبية',
  async render(body) {
    async function draw() {
      clear(body);
      const info = await countDemoData();

      body.appendChild(el('p', { style: { fontSize: '13px', color: '#123C2F', lineHeight: '1.7', margin: '0 0 12px 0' } },
        'تملأ التطبيق بعملاء وطلبات (بكل الحالات) ودفعات ومخزون ناقص ومواعيد وعروض أسعار وهمية، لتجرّب الشاشات والأزرار بسرعة. ' +
        'كل سجل تجريبي مُعلَّم ولا يختلط ببياناتك: زر الحذف هنا يمسح التجريبي فقط ولا يلمس بياناتك الحقيقية.'));

      const syncSt = autoSync.getStatus();
      if (syncSt.loggedIn && syncSt.auto) {
        body.appendChild(el('div', {
          style: { fontSize: '12px', color: '#B8863B', background: '#FFF8E7', padding: '8px 10px', borderRadius: '8px', marginBottom: '12px', lineHeight: '1.6' },
        }, '⚠️ المزامنة السحابية التلقائية مفعّلة: قد تُرفع السجلات التجريبية إلى حسابك. الأسلم أن تحذفها بعد التجربة.'));
      }

      const status = el('div', {
        style: { fontSize: '13px', padding: '10px 12px', borderRadius: '8px', marginBottom: '12px',
          background: info.total ? '#FFF3E0' : '#F6F1E6', color: '#123C2F', lineHeight: '1.7' },
        role: 'status',
      });
      if (info.total) {
        status.appendChild(el('div', { style: { fontWeight: '600' } }, '🧪 توجد ' + info.total + ' سجلاً تجريبياً حالياً'));
        status.appendChild(el('div', { style: { fontSize: '12px' } },
          Object.entries(info.byStore).map(([k, n]) => n + ' ' + (DEMO_LABELS[k] || k)).join(' · ')));
      } else {
        status.textContent = 'لا توجد بيانات تجريبية الآن.';
      }
      body.appendChild(status);

      body.appendChild(el('button', {
        className: 'btn btn--primary btn--block', type: 'button', style: { marginBottom: '8px' },
        onClick: async (e) => {
          const ok = await modal.confirm({
            title: 'تحميل بيانات تجريبية',
            message: 'ستُضاف سجلات وهمية مُعلَّمة 🧪 بجانب بياناتك الحالية (لا يُغيَّر شيء من بياناتك). يمكنك حذفها كلها لاحقاً بضغطة من هذه الصفحة.',
            confirmText: 'حمّل', cancelText: 'إلغاء',
          });
          if (!ok) return;
          e.target.disabled = true;
          try {
            const res = await seedDemoData();
            toast.success('تم تحميل ' + res.total + ' سجلاً تجريبياً');
          } catch (err) { toast.danger('تعذّر التحميل: ' + err.message); }
          await draw();
        },
      }, info.total ? '🔄 إعادة تحميل البيانات التجريبية' : '🧪 تحميل بيانات تجريبية'));

      const delBtn = el('button', {
        className: 'btn btn--danger btn--block', type: 'button',
        onClick: async (e) => {
          const ok = await modal.confirm({
            title: 'حذف البيانات التجريبية',
            message: 'سيُحذف ' + info.total + ' سجلاً تجريبياً فقط. بياناتك الحقيقية لن تُمسّ.',
            confirmText: 'احذف التجريبي', cancelText: 'إلغاء', danger: true,
          });
          if (!ok) return;
          e.target.disabled = true;
          try {
            const n = await clearDemoData();
            toast.success('تم حذف ' + n + ' سجلاً تجريبياً');
          } catch (err) { toast.danger('تعذّر الحذف: ' + err.message); }
          await draw();
        },
      }, '🗑️ حذف البيانات التجريبية فقط');
      delBtn.disabled = !info.total;   /* بالخاصية لا بالسمة: disabled:false في el() يترك السمة فيبقى الزر معطّلاً */
      body.appendChild(delBtn);
    }
    await draw();
  },
};

/* --- تصدير --- */
/** 🛟 الدعم: تقرير مشكلة جاهز للإرسال (إصدار + جهاز + آخر الأخطاء + أعداد السجلات). */
