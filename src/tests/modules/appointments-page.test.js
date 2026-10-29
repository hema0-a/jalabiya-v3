/* ==========================================================================
   appointments-page.test.js — اختبارات صفحة المواعيد
   ==========================================================================
   6 اختبارات: pages/appointments
   ========================================================================== */

import { register } from '../registry.js';
import {
  appointmentsPage,
  filterAppointments,
  getTodayRange,
} from '../../pages/appointments.js';
import { appointments as appointmentsRepo } from '../../data/repos/appointments.js';
import { customers as customersRepo } from '../../data/repos/customers.js';

register('pages/appointments.js', async (t) => {
  /* تنظيف المخازن */
  await appointmentsRepo.clear();
  await customersRepo.clear();

  /* 1. getTodayRange يُرجع نطاقاً صحيحاً */
  const range = getTodayRange();
  await t.test('1. getTodayRange returns valid range',
    typeof range.start === 'number' &&
    typeof range.end === 'number' &&
    range.end - range.start === 24 * 60 * 60 * 1000);

  /* 2. filterAppointments: 'all' → كل المواعيد مرتّبة */
  const now = Date.now();
  const day = 86400000;
  const list = [
    { id: '1', date: now + day,      status: 'scheduled' },
    { id: '2', date: now + 5 * day,  status: 'scheduled' },
    { id: '3', date: now - day,      status: 'done'      },
    { id: '4', date: now - 5 * day,  status: 'cancelled' },
  ];
  await t.test('2. filterAppointments all → sorted desc',
    filterAppointments(list, 'all').length === 4 &&
    filterAppointments(list, 'all')[0].id === '2');

  /* 3. filterAppointments: 'upcoming' → القادمة المجدولة فقط */
  const upcoming = filterAppointments(list, 'upcoming');
  await t.test('3. filterAppointments upcoming → scheduled + future only',
    upcoming.length === 2 &&
    upcoming[0].id === '1' &&
    upcoming[1].id === '2');

  /* 4. filterAppointments: 'week' → خلال 7 أيام فقط */
  const week = filterAppointments(list, 'week');
  await t.test('4. filterAppointments week → within 7 days',
    week.length === 2 &&
    week[0].id === '1' &&
    week[1].id === '2');

  /* 5. render يبني هيكل الصفحة */
  const container = document.createElement('div');
  await appointmentsPage.render(container);
  await t.test('5. render builds page structure',
    container.querySelector('#appointments-stats') !== null &&
    container.querySelector('#appointments-filters') !== null &&
    container.querySelector('#appointments-list') !== null &&
    container.querySelector('button.btn--primary') !== null);

  /* 6. render مع بيانات → بطاقات + فلترة تفاعلية */
  const cust = await customersRepo.create({ name: 'أحمد', phone: '0101' });
  await appointmentsRepo.create({
    customerId: cust.id,
    title: 'قياس',
    date: now + 2 * day,
    status: 'scheduled',
  });
  await appointmentsRepo.create({
    customerId: cust.id,
    title: 'تسليم',
    date: now - day,
    status: 'done',
  });

  const c6 = document.createElement('div');
  await appointmentsPage.render(c6);
  const cards6 = c6.querySelectorAll('.card[data-id]');
  /* الفلتر الافتراضي "upcoming" → موعد واحد فقط */
  await t.test('6. render with data shows filtered cards',
    cards6.length === 1 &&
    cards6[0].textContent.includes('قياس'));

  /* تنظيف */
  appointmentsPage.destroy();
  await appointmentsRepo.clear();
  await customersRepo.clear();
});
