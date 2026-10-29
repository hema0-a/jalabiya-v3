/* ==========================================================================
   orders-cards.js — بطاقات الطلب: الكاملة والمصغّرة وصفوف/بطاقات التجميع (v3.5.6)
   ==========================================================================
   مقتطع من orders.js دون تغيير منطق. الدوال تستلم ctx أولاً؛ فتح النموذج عبر ctx.openForm(order).
   تستورد orders-actions وorders-delivery وorders-logic فقط (لا تستورد orders.js ولا orders-views).
   ========================================================================== */

import { el } from '../core/dom.js';
import { formatEGP, formatDate } from '../core/utils.js';
import { previewOrder } from '../ui/quick-preview.js';
import { attachSwipe } from '../ui/swipe.js';
import { hasReferenceImage, hasOrderSignature } from '../services/order-media.js';
import { deliveryProgress, canPartialDeliver, deliveryBadgeText } from '../services/partial-delivery.js';
import { getDeadlineInfo, getPickupInfo, formatDuration, getTotalWorkTime, getActiveSession } from '../services/order-timing.js';
import { orderProfit } from '../services/order-profit.js';
import { STATUS_MAP, sessionsOf } from './orders-logic.js';
import { deleteOrder, advanceStatus, printInvoice, shareInvoiceImage, openMessageMenu, toggleTimer, openReferenceImage, openSignature } from './orders-actions.js';
import { deliverWithSignature, openPartialDelivery } from './orders-delivery.js';

/* ==========================================================================
   8. بطاقة الطلب
   ========================================================================== */

export function buildOrderCard(ctx, o) {
  const { state } = ctx;
  const c = state.customerMap[o.customerId];
  const name = c ? c.name : 'عميل محذوف';
  const phone = c ? c.phone : '';
  const statusInfo = STATUS_MAP[o.status] || { label: o.status, badge: 'badge--info' };
  const itemsCount = Array.isArray(o.items) ? o.items.length : 0;
  const hasImage = hasReferenceImage(o);

  const isDelivered = o.status === 'delivered' || o.status === 'cancelled';
  const canDeliver = o.status === 'ready' || o.status === 'in_progress';
  const deadline = getDeadlineInfo(o.dueDate);
  const pickup = getPickupInfo(o.receivedDate);
  const sessions = sessionsOf(o);
  const isRunning = getActiveSession(sessions);
  const totalMs = getTotalWorkTime(sessions);

  /* --- الصورة المصغّرة (إن وُجدت) --- */
  /* المصغّر المحفوظ (refThumb) أو الصورة المضمَّنة القديمة؛ مفصولة بلا مصغّر ⟵ رمز بديل. الضغط يفتح الأصل. */
  const thumbSrc = o.refThumb || o.referenceImage || '';
  const thumbStyle = {
    width: '56px', height: '56px', borderRadius: '8px',
    objectFit: 'cover', flexShrink: '0', cursor: 'pointer',
    border: '1px solid #E5DDD0',
  };
  const thumbClick = (e) => { e.stopPropagation(); openReferenceImage(o, 'صورة مرجعية — ' + name); };
  const thumb = hasImage ? (thumbSrc
    ? el('img', { src: thumbSrc, alt: 'مرجع', style: thumbStyle, onClick: thumbClick })
    : el('div', { style: { ...thumbStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F6F1E6', fontSize: '22px' }, onClick: thumbClick }, '🖼️')) : null;

  const headerChildren = [
    thumb,
    el('div', { style: { flex: '1', minWidth: '0' } }, [
      el('div', { 'data-customer-id': o.customerId || null, style: { fontWeight: '600', color: '#123C2F', fontSize: '15px' } }, name),
      phone ? el('div', { style: { fontSize: '12px', color: '#2E8B6F' } }, phone) : null,
    ]),
    el('span', { className: 'badge ' + statusInfo.badge }, statusInfo.label),
  ].filter(Boolean);

  const badgesRow = el('div', {
    style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' },
  });

  if (o.urgent && o.status !== 'delivered' && o.status !== 'cancelled') {
    badgesRow.appendChild(el('span', {
      style: { fontSize: '11px', fontWeight: '700', padding: '3px 8px', borderRadius: '10px',
        color: '#fff', background: '#C62828' },
    }, '⚡ عاجل'));
  }

  if (!isDelivered) {
    badgesRow.appendChild(el('span', {
      style: { fontSize: '11px', fontWeight: '600', padding: '3px 8px',
        borderRadius: '10px', color: deadline.color, background: deadline.bg },
    }, deadline.icon + ' ' + deadline.label));
    badgesRow.appendChild(el('span', {
      style: { fontSize: '11px', fontWeight: '600', padding: '3px 8px',
        borderRadius: '10px', color: pickup.color, background: pickup.bg },
    }, pickup.icon + ' ' + pickup.label));
    const partialText = deliveryBadgeText(o);
    if (partialText) {
      badgesRow.appendChild(el('span', {
        style: { fontSize: '11px', fontWeight: '700', padding: '3px 8px', borderRadius: '10px',
          color: '#0B5A8A', background: '#E3F2FD' },
      }, partialText));
    }
    const risk = state.riskMap && state.riskMap.get(o.id);
    if (risk) {
      const danger = risk.level === 'danger';
      badgesRow.appendChild(el('span', {
        title: risk.reasons.map((r) => r.text).join(' — '),
        style: { fontSize: '11px', fontWeight: '700', padding: '3px 8px', borderRadius: '10px',
          color: danger ? '#B3261E' : '#8A5A00', background: danger ? '#FDECEA' : '#FFF3D6' },
      }, '⚠️ ' + risk.reasons[0].text));
    }
  }

  if (totalMs > 0 || isRunning) {
    badgesRow.appendChild(el('span', {
      'data-timer-id': o.id,
      style: { fontSize: '11px', fontWeight: '600', padding: '3px 8px',
        borderRadius: '10px', color: isRunning ? '#2E7D32' : '#1565C0',
        background: isRunning ? '#E8F5E9' : '#E3F2FD' },
    }, (isRunning ? '⏱️ يعمل · ' : '⏱️ ') + formatDuration(totalMs)));
  }

  if (hasOrderSignature(o)) {
    badgesRow.appendChild(el('span', {
      style: { fontSize: '11px', fontWeight: '600', padding: '3px 8px',
        borderRadius: '10px', color: '#2E7D32', background: '#E8F5E9', cursor: 'pointer' },
      onClick: (e) => { e.stopPropagation(); openSignature(o); },
    }, '✍️ موقّع'));
  }

  const metaChildren = [];
  if (o.dueDate) metaChildren.push(el('span', {}, '📅 ' + formatDate(o.dueDate)));
  if (o.amount) metaChildren.push(el('span', {}, '💰 ' + formatEGP(o.amount)));
  { const pr = orderProfit(o);
    if (pr.hasCost) metaChildren.push(el('span', { style: { color: pr.profit < 0 ? '#C62828' : '#2E7D32' } },
      '📈 ربح ' + formatEGP(pr.profit))); }
  if (itemsCount > 0) metaChildren.push(el('span', {}, '📦 ' + itemsCount + ' بند'));

  const card = el('div', {
    className: 'card',
    style: { marginBottom: '8px', cursor: 'pointer' },
    'data-id': o.id,
    onClick: () => previewOrder(o, c, () => ctx.openForm(o)),
  }, [
    el('div', {
      style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: '8px', marginBottom: '8px' },
    }, headerChildren),
    badgesRow.children.length > 0 ? badgesRow : null,
    el('div', {
      style: { display: 'flex', gap: '12px', flexWrap: 'wrap',
        fontSize: '12px', color: '#666', marginBottom: '8px' },
    }, metaChildren),
  ]);

  if (o.notes) {
    card.appendChild(el('div', {
      style: { fontSize: '12px', color: '#666', marginBottom: '8px', lineHeight: '1.4' },
    }, o.notes));
  }

  const actionChildren = [
    el('button', { className: 'btn btn--sm btn--secondary',
      onClick: () => ctx.openForm(o) }, '✏️'),
    el('button', { className: 'btn btn--sm btn--ghost',
      title: 'طباعة', onClick: () => printInvoice(ctx, o) }, '🖨️'),
    el('button', { className: 'btn btn--sm btn--ghost',
      title: 'مشاركة الفاتورة كصورة', 'aria-label': 'مشاركة الفاتورة كصورة', onClick: () => shareInvoiceImage(ctx, o) }, '🖼️'),
    phone ? el('button', { className: 'btn btn--sm btn--ghost',
      title: 'رسالة', onClick: () => openMessageMenu(ctx, o) }, '📱') : null,
  ].filter(Boolean);

  if (!isDelivered) {
    actionChildren.push(el('button', {
      className: 'btn btn--sm ' + (isRunning ? 'btn--danger' : 'btn--ghost'),
      title: isRunning ? 'إيقاف المؤقت' : 'بدء المؤقت',
      onClick: () => toggleTimer(ctx, o),
    }, isRunning ? '⏸️' : '⏱️'));
  }

  if (canPartialDeliver(o)) {
    actionChildren.push(el('button', {
      className: 'btn btn--sm btn--secondary',
      title: 'تسليم جزء من الطلب للعميل',
      onClick: () => openPartialDelivery(ctx, o),
    }, '🚚 جزئي'));
  }

  if (canDeliver) {
    actionChildren.push(el('button', {
      className: 'btn btn--sm btn--primary',
      onClick: () => deliverWithSignature(ctx, o),
    }, deliveryProgress(o).state === 'partial' ? '✅ تسليم المتبقي' : '✅ تسليم'));
  }

  if (!isDelivered) {
    actionChildren.push(el('button', {
      className: 'btn btn--sm btn--primary',
      onClick: () => advanceStatus(ctx, o),
    }, '▶️'));
  }

  actionChildren.push(el('button', {
    className: 'btn btn--sm btn--danger',
    onClick: () => deleteOrder(ctx, o),
  }, '🗑️'));

  card.appendChild(el('div', {
    style: { display: 'flex', gap: '6px', flexWrap: 'wrap' },
    onClick: (e) => e.stopPropagation(),
  }, actionChildren));

  /* سحب البطاقة (v3.3.58): يساراً ⟵ تقدّم الحالة، يميناً ⟵ رسائل العميل (يتطلب هاتفاً) */
  attachSwipe(card, {
    onLeft: isDelivered ? null : () => advanceStatus(ctx, o),
    onRight: phone ? () => openMessageMenu(ctx, o) : null,
  });

  return card;
}

/* ==========================================================================
   9. بطاقة مصغّرة (كانبان/تجميع)
   ========================================================================== */

export function buildMiniCard(ctx, o, opts = {}) {
  const { state } = ctx;
  const c = state.customerMap[o.customerId];
  const name = c ? c.name : 'عميل محذوف';
  const itemsCount = Array.isArray(o.items) ? o.items.length : 0;
  const isRunning = getActiveSession(sessionsOf(o));

  const card = el('div', {
    className: 'card',
    style: {
      marginBottom: '6px', cursor: 'pointer', padding: '8px 10px',
      borderRight: '3px solid ' + (opts.color || '#1F6D57'),
      display: 'flex', gap: '8px', alignItems: 'center',
    },
    onClick: () => previewOrder(o, c, () => ctx.openForm(o)),
  });

  /* صورة مصغّرة */
  if (o.refThumb || o.referenceImage) {
    card.appendChild(el('img', {
      src: o.refThumb || o.referenceImage, alt: 'مرجع',
      style: {
        width: '36px', height: '36px', borderRadius: '6px',
        objectFit: 'cover', flexShrink: '0',
      },
    }));
  }

  const content = el('div', { style: { flex: '1', minWidth: '0' } });
  content.appendChild(el('div', {
    style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      gap: '6px', marginBottom: '4px' },
  }, [
    el('div', { style: { fontSize: '13px', fontWeight: '600', color: '#123C2F',
      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: '1' } },
      name),
    isRunning ? el('span', { style: { fontSize: '11px', color: '#2E7D32' } }, '⏱️') : null,
  ]));

  content.appendChild(el('div', {
    style: { fontSize: '11px', color: '#666', display: 'flex', gap: '8px', flexWrap: 'wrap' },
  }, [
    o.amount ? el('span', {}, formatEGP(o.amount)) : null,
    o.dueDate ? el('span', {}, '📅 ' + formatDate(o.dueDate)) : null,
    itemsCount > 0 ? el('span', {}, '📦 ' + itemsCount) : null,
  ].filter(Boolean)));

  card.appendChild(content);
  return card;
}

export function groupOrderRow(ctx, o, c) {
  const sInfo = STATUS_MAP[o.status] || STATUS_MAP.pending;
  return el('div', {
    style: { padding: '8px 10px', background: '#F9F6EF', borderRadius: '8px', marginBottom: '6px', cursor: 'pointer' },
    onClick: () => previewOrder(o, c, () => ctx.openForm(o)),
  }, [
    el('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '4px' } }, [
      el('span', { style: { fontSize: '12px', fontWeight: '500', color: '#123C2F' } },
        '#' + String(o.id).slice(-6) + (c ? ' · ' + c.name : '')),
      el('span', { className: 'badge ' + sInfo.badge }, sInfo.label),
    ]),
    el('div', { style: { fontSize: '11px', color: '#666', display: 'flex', gap: '8px', flexWrap: 'wrap' } }, [
      o.amount ? el('span', {}, formatEGP(o.amount)) : null,
      o.dueDate ? el('span', {}, '📅 ' + formatDate(o.dueDate)) : null,
    ].filter(Boolean)),
  ]);
}

export function groupCard(title, subtitle, total, orderRows, accent) {
  const card = el('div', { className: 'card', style: { marginBottom: '12px', borderRight: '4px solid ' + accent } });
  card.appendChild(el('div', {
    style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px',
      marginBottom: '10px', paddingBottom: '8px', borderBottom: '1px solid #E5DDD0' },
  }, [
    el('div', { style: { flex: '1' } }, [
      el('div', { style: { fontWeight: '600', color: '#123C2F', fontSize: '15px' } }, title),
      el('div', { style: { fontSize: '12px', color: '#666', marginTop: '2px' } }, subtitle),
    ]),
    el('div', { style: { fontSize: '14px', fontWeight: '700', color: '#2E7D32' } }, formatEGP(total)),
  ]));
  orderRows.forEach((r) => card.appendChild(r));
  return card;
}
