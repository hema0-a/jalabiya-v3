/* ==========================================================================
   calendar-day.js — نافذة تفاصيل اليوم + قسم «القادم» (v3.5.24: مفصول عن calendar.js)
   ==========================================================================
   API: renderUpcoming(ctx) → Promise<HTMLElement|null> · openDayModal(ctx, ts)
   ctx = { state, ... }. لا يستورد calendar.js (لا دورات استيراد).
   ========================================================================== */

import { el } from '../core/dom.js';
import { modal } from '../ui/modal.js';
import { getCalendarEvents } from '../services/calendar-events.js';
import { formatEGP } from '../core/utils.js';
import { startOfDayMs, formatArabicDate, eventsForDay } from './calendar-utils.js';

export async function renderUpcoming(ctx) {
  const { state } = ctx;
  const now = Date.now();
  const monthEnd = now + 30 * 86400000;
  const upcoming = await getCalendarEvents(now, monthEnd, state.filter);

  const card = el('div', { className: 'card', style: { marginBottom: '16px' } });
  card.appendChild(el('div', { className: 'card__header' }, [
    el('h3', { className: 'card__title' }, '📌 المواعيد القادمة (30 يوماً)'),
  ]));

  if (upcoming.length === 0) {
    card.appendChild(el('p', {
      style: { fontSize: '13px', color: '#2E8B6F', margin: '0' },
    }, 'لا توجد مواعيد خلال 30 يوماً.'));
    return card;
  }

  /* تجميع حسب اليوم */
  const byDay = {};
  upcoming.forEach((e) => {
    const k = startOfDayMs(e.date);
    if (!byDay[k]) byDay[k] = [];
    byDay[k].push(e);
  });

  const sortedDays = Object.keys(byDay).map(Number).sort((a, b) => a - b).slice(0, 10);
  sortedDays.forEach((dayMs) => {
    const events = byDay[dayMs];
    const dayCard = el('div', {
      style: {
        padding: '8px 0',
        borderBottom: '1px solid #E5DDD0',
        cursor: 'pointer',
      },
      onClick: () => openDayModal(ctx, dayMs),
    });
    dayCard.appendChild(el('div', {
      style: { fontSize: '13px', fontWeight: '600', color: '#123C2F', marginBottom: '4px' },
    }, formatArabicDate(dayMs) + ' — ' + events.length + ' حدث'));

    events.slice(0, 3).forEach((e) => {
      dayCard.appendChild(el('div', {
        style: { fontSize: '12px', color: '#666', padding: '2px 0' },
      }, e.icon + ' ' + e.title + ' — ' + e.subtitle));
    });
    if (events.length > 3) {
      dayCard.appendChild(el('div', {
        style: { fontSize: '11px', color: '#2E8B6F', marginTop: '2px' },
      }, '+ ' + (events.length - 3) + ' حدث آخر'));
    }
    card.appendChild(dayCard);
  });

  return card;
}


export function openDayModal(ctx, ts) {
  const dayEvents = eventsForDay(ctx.state, ts);
  const orders = dayEvents.filter((e) => e.type === 'order');
  const appts = dayEvents.filter((e) => e.type === 'appointment');

  const body = el('div', {});

  if (dayEvents.length === 0) {
    body.appendChild(el('p', {
      style: { textAlign: 'center', color: '#2E8B6F', padding: '16px' },
    }, 'لا توجد أحداث في هذا اليوم'));
  }

  if (orders.length > 0) {
    body.appendChild(el('h4', {
      style: { fontSize: '14px', color: '#123C2F', margin: '0 0 8px 0' },
    }, '📋 الطلبات (' + orders.length + ')'));
    orders.forEach((o) => {
      body.appendChild(el('div', {
        style: {
          padding: '8px', background: '#F6F1E6',
          borderRadius: '6px', marginBottom: '6px', fontSize: '13px',
        },
      }, [
        el('div', { style: { fontWeight: '600', color: '#123C2F' } }, '👤 ' + o.title),
        el('div', { style: { fontSize: '12px', color: '#666', marginTop: '2px' } }, o.subtitle),
        el('div', { style: { fontSize: '12px', color: '#B8863B', marginTop: '2px' } },
          '💰 ' + formatEGP(o.metadata.amount)),
      ]));
    });
  }

  if (appts.length > 0) {
    body.appendChild(el('h4', {
      style: { fontSize: '14px', color: '#123C2F', margin: '12px 0 8px 0' },
    }, '📅 المواعيد (' + appts.length + ')'));
    appts.forEach((a) => {
      body.appendChild(el('div', {
        style: {
          padding: '8px', background: '#E3F2FD',
          borderRadius: '6px', marginBottom: '6px', fontSize: '13px',
        },
      }, [
        el('div', { style: { fontWeight: '600', color: '#123C2F' } }, '📅 ' + a.title),
        el('div', { style: { fontSize: '12px', color: '#666', marginTop: '2px' } }, a.subtitle),
      ]));
    });
  }

  modal.open({
    title: formatArabicDate(ts),
    body,
    closable: true,
    actions: [
      { text: 'إغلاق', variant: 'primary', action: 'close' },
    ],
  });
}

