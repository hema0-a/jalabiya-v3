/* ==========================================================================
   customers-cards.js — بطاقة العميل (v3.5.8)
   ==========================================================================
   buildCustomerCard(ctx, c) — منقولة حرفياً؛ الإجراءات من customers-actions والتعديل عبر ctx.openForm.
   ========================================================================== */

import { el } from '../core/dom.js';
import { walletOf } from '../data/repos/customers.js';
import { previewCustomer } from '../ui/quick-preview.js';
import { formatEGP } from '../core/utils.js';
import { hasMeasurements } from './customers-logic.js';
import { deleteCustomer, toggleVIP, printStatement, shareStatementImage, showCustomerImage } from './customers-actions.js';

export function buildCustomerCard(ctx, c) {
  const { state } = ctx;
  const initial = String(c.name || '?').trim().charAt(0) || '?';
  const withMeasurements = hasMeasurements(c);
  const totalPaid = Number(c._totalPaid) || 0;
  const ordersCount = Number(c._ordersCount) || 0;
  const hasImage = !!c.image;

  /* --- الأفاتار: صورة أو حرف --- */
  const avatar = hasImage
    ? el('img', {
        src: c.image, alt: c.name || '', decoding: 'async',
        style: {
          width: '44px', height: '44px', borderRadius: '50%',
          objectFit: 'cover', flexShrink: '0', cursor: 'pointer',
          border: '2px solid #1F6D57',
        },
        onClick: (e) => {
          e.stopPropagation();
          showCustomerImage(c.image, c.name);
        },
      })
    : el('div', {
        style: {
          width: '40px', height: '40px', borderRadius: '50%',
          background: 'linear-gradient(135deg, #2E8B6F, #1F6D57)',
          color: '#fff', display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: '18px', fontWeight: '600',
          flexShrink: '0',
        },
      }, initial);

  const headerChildren = [
    avatar,
    el('div', { style: { flex: '1', minWidth: '0' } }, [
      el('div', { style: { fontWeight: '600', color: '#123C2F', fontSize: '15px' } },
        c.name || 'بدون اسم'),
      c.phone ? el('div', { style: { fontSize: '12px', color: '#2E8B6F' } }, c.phone) : null,
    ]),
  ];
  if (c.vip) {
    headerChildren.push(el('span', { className: 'badge badge--accent' }, '⭐ VIP'));
  }

  const header = el('div', {
    style: {
      display: 'flex', alignItems: 'center', gap: '8px',
      marginBottom: (c.notes || withMeasurements || totalPaid > 0) ? '8px' : '12px',
    },
  }, headerChildren);

  const card = el('div', {
    className: 'card',
    style: { marginBottom: '8px', cursor: 'pointer' },
    'data-id': c.id,
    onClick: () => previewCustomer(c, () => ctx.openForm(c)),
  }, [header]);

  /* شارات */
  const badges = el('div', {
    style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' },
  });

  if (withMeasurements) {
    badges.appendChild(el('span', {
      style: {
        fontSize: '11px', color: '#1F6D57', background: '#E8F5E9',
        padding: '3px 8px', borderRadius: '6px', fontWeight: '600',
      },
    }, '📏 مقاسات'));
  }

  /* شارة العيلة */
  const headOf = c.familyHeadId ? state.customers.find((x) => x.id === c.familyHeadId) : null;
  const membersCount = state.customers.filter((x) => x.familyHeadId === c.id).length;
  if (headOf || membersCount > 0) {
    badges.appendChild(el('span', {
      style: {
        fontSize: '11px', color: '#6A1B9A', background: '#F3E5F5',
        padding: '3px 8px', borderRadius: '6px', fontWeight: '600',
      },
    }, headOf ? '👨‍👩‍👧 تابع لـ ' + headOf.name : '👨‍👩‍👧 عيلة (' + membersCount + ')'));
  }

  /* شارة الرصيد/النقاط */
  const wal = walletOf(c);
  if (wal.balance > 0 || wal.points > 0) {
    badges.appendChild(el('span', {
      style: {
        fontSize: '11px', color: '#1F6D57', background: '#E3F4EC',
        padding: '3px 8px', borderRadius: '6px', fontWeight: '600',
      },
    }, [wal.balance > 0 ? '💳 ' + Math.round(wal.balance) + ' ج.م' : null, wal.points > 0 ? '⭐ ' + wal.points : null]
      .filter(Boolean).join(' · ')));
  }

  if (ordersCount > 0) {
    badges.appendChild(el('span', {
      style: {
        fontSize: '11px', color: '#1565C0', background: '#E3F2FD',
        padding: '3px 8px', borderRadius: '6px', fontWeight: '600',
      },
    }, '📦 ' + ordersCount + ' طلب'));
  }

  if (totalPaid > 0) {
    badges.appendChild(el('span', {
      style: {
        fontSize: '11px', color: '#2E7D32', background: '#E8F5E9',
        padding: '3px 8px', borderRadius: '6px', fontWeight: '600',
      },
    }, '💰 ' + formatEGP(totalPaid)));
  }

  if (badges.children.length > 0) card.appendChild(badges);

  if (c.notes) {
    card.appendChild(el('div', {
      style: { fontSize: '12px', color: '#666', marginBottom: '12px', lineHeight: '1.4' },
    }, c.notes));
  }

  card.appendChild(el('div', {
    style: { display: 'flex', gap: '6px', flexWrap: 'wrap' },
    onClick: (e) => e.stopPropagation(),
  }, [
    el('button', {
      className: 'btn btn--sm btn--secondary',
      onClick: () => ctx.openForm(c),
    }, '✏️'),
    el('button', {
      className: 'btn btn--sm btn--ghost',
      title: 'كشف حساب',
      onClick: () => printStatement(c),
    }, '📄'),
    el('button', {
      className: 'btn btn--sm btn--ghost',
      title: 'مشاركة كشف الحساب كصورة', 'aria-label': 'مشاركة كشف الحساب كصورة',
      onClick: () => shareStatementImage(c),
    }, '🖼️'),
    el('button', {
      className: 'btn btn--sm btn--ghost',
      onClick: () => toggleVIP(ctx, c),
    }, c.vip ? '⭐ إزالة' : '⭐ VIP'),
    el('button', {
      className: 'btn btn--sm btn--danger',
      onClick: () => deleteCustomer(ctx, c),
    }, '🗑️'),
  ]));

  return card;
}
