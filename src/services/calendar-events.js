/* ==========================================================================
   calendar-events.js — موحّد الأحداث (Adapter Pattern)
   ==========================================================================
   يحوّل الطلبات + المواعيد → نموذج موحّد (CalendarEvent).
   calendar.js لا يعرف مصادر البيانات — فقط يستقبل CalendarEvent[].
   ========================================================================== */

import { orders } from '../data/repos/orders.js';
import { appointments } from '../data/repos/appointments.js';
import { customers } from '../data/repos/customers.js';

/* --- ألوان حالات الطلبات --- */
export const ORDER_STATUS_COLORS = {
  pending:     '#F57C00',
  in_progress: '#1565C0',
  ready:       '#6A1B9A',
  delivered:   '#2E7D32',
  cancelled:   '#C62828',
};

export const APPT_COLOR = '#1565C0';

/* ==========================================================================
   getCalendarEvents — الأحداث الموحّدة لنطاق زمني
   ==========================================================================
   @param {number} startMs - بداية النطاق (شامل)
   @param {number} endMs   - نهاية النطاق (غير شامل)
   @param {'all'|'orders'|'appointments'} filter
   @returns {Promise<CalendarEvent[]>}
   ========================================================================== */
export async function getCalendarEvents(startMs, endMs, filter = 'all') {
  const wantOrders = filter === 'all' || filter === 'orders';
  const wantAppts  = filter === 'all' || filter === 'appointments';

  const [ordersList, apptsList, customersList] = await Promise.all([
    wantOrders ? orders.list() : Promise.resolve([]),
    wantAppts  ? appointments.list() : Promise.resolve([]),
    customers.list(),
  ]);

  const cMap = {};
  customersList.forEach((c) => { cMap[c.id] = c; });

  const events = [];

  /* --- الطلبات --- */
  ordersList.forEach((o) => {
    if (!o.dueDate || o.dueDate < startMs || o.dueDate >= endMs) return;
    const c = cMap[o.customerId];
    events.push({
      id: 'order_' + o.id,
      type: 'order',
      date: o.dueDate,
      title: c ? c.name : 'عميل محذوف',
      subtitle: o.notes ? String(o.notes).slice(0, 40) : 'طلب',
      status: o.status,
      amount: Number(o.amount) || 0,
      customerPhone: c ? (c.phone || '') : '',
      color: ORDER_STATUS_COLORS[o.status] || '#666',
      icon: '📋',
      metadata: {
        orderId: o.id,
        customerId: o.customerId,
        status: o.status,
        amount: Number(o.amount) || 0,
      },
    });
  });

  /* --- المواعيد --- */
  apptsList.forEach((a) => {
    if (!a.date || a.date < startMs || a.date >= endMs) return;
    const c = cMap[a.customerId];
    events.push({
      id: 'appt_' + a.id,
      type: 'appointment',
      date: a.date,
      title: a.title || 'موعد',
      subtitle: c ? c.name : 'عميل محذوف',
      status: a.status,
      amount: 0,
      customerPhone: c ? (c.phone || '') : '',
      color: APPT_COLOR,
      icon: '📅',
      metadata: {
        appointmentId: a.id,
        customerId: a.customerId,
        status: a.status,
      },
    });
  });

  events.sort((a, b) => a.date - b.date);
  return events;
}

/* ==========================================================================
   getOverdueOrdersCount — عدد الطلبات المتأخرة (كل الطلبات)
   ========================================================================== */
export async function getOverdueOrdersCount() {
  const all = await orders.list();
  const now = Date.now();
  return all.filter((o) =>
    o.dueDate &&
    o.dueDate < now &&
    o.status !== 'delivered' &&
    o.status !== 'cancelled'
  ).length;
}
