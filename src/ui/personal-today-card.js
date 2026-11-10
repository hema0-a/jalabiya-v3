/* ==========================================================================
   personal-today-card.js — بطاقة «ملخصك الشخصي» في اللوحة الرئيسية (v3.17.0)
   ==========================================================================
   تقرأ المهام والمستندات والجمعيات (قراءة فقط) وتعرض ما يحتاج انتباهك اليوم؛ لا شيء ⟵ لا بطاقة.
   تُرسم داخل خانة «يومك في لمحة» فتُخفى معها من تخصيص اللوحة. كل صف يفتح صفحته.
   ========================================================================== */

import { el } from '../core/dom.js';
import { todos } from '../data/repos/todos.js';
import { documents } from '../data/repos/documents.js';
import { circles } from '../data/repos/circles.js';
import { formatEGP } from '../core/utils.js';
import { personalToday } from '../services/personal-today.js';

const row = (icon, text, route) => el('a', {
  href: route, 'data-route': route,
  style: { display: 'block', padding: '6px 0', borderTop: '1px dashed #E5DDD0', fontSize: '13.5px', lineHeight: '1.8', color: 'inherit', textDecoration: 'none' },
}, icon + ' ' + text);

/** بطاقة من نموذج جاهز (للاختبار)؛ null إن لم يوجد ما يستحق. */
export function buildPersonalTodayCard(m) {
  if (!m || m.total <= 0) return null;
  const card = el('div', { className: 'card', 'data-role': 'personal-today', style: { marginBottom: '12px' } }, [
    el('div', { className: 'card__header' }, [el('h3', { className: 'card__title' }, '📌 ملخصك الشخصي'), el('b', { style: { color: '#C62828' } }, String(m.total))]),
  ]);
  if (m.tasks.overdue + m.tasks.today > 0) {
    const head = (m.tasks.today ? m.tasks.today + ' مهمة اليوم' : '') + (m.tasks.today && m.tasks.overdue ? ' · ' : '') + (m.tasks.overdue ? m.tasks.overdue + ' متأخرة' : '');
    card.appendChild(row('✅', head + (m.tasks.items.length ? ' — ' + m.tasks.items.map((t) => t.title).join('، ') : ''), '#/todos'));
  }
  if (m.docs.count > 0) {
    card.appendChild(row('🗂️', m.docs.count + ' مستند ' + (m.docs.expired ? 'منتهٍ أو ينتهي قريباً' : 'ينتهي قريباً') + ' — ' + m.docs.items.map((x) => x.d.title + (x.status === 'expired' ? ' (منتهٍ)' : ' (' + x.daysLeft + ' يوم)')).join('، '), '#/documents'));
  }
  if (m.circles.pay.length) card.appendChild(row('🪙', m.circles.pay.length + ' قسط جمعية مستحق — ' + m.circles.pay.slice(0, 2).map((x) => x.name + ' (' + formatEGP(x.amount) + ')').join('، '), '#/circles'));
  if (m.circles.collect.length) card.appendChild(row('💰', 'قبض جمعية هذا الشهر — ' + m.circles.collect.slice(0, 2).map((x) => x.name + ' (' + formatEGP(x.amount) + ')').join('، '), '#/circles'));
  return card;
}

export async function loadPersonalToday(now = new Date()) {
  const [t, d, c] = await Promise.all([todos.list().catch(() => []), documents.list().catch(() => []), circles.list().catch(() => [])]);
  return personalToday({ tasks: t, documents: d, circles: c, now });
}
