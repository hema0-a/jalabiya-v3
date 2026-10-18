/* ==========================================================================
   customer-merge-exec.js — تنفيذ دمج العملاء (v3.3.80)
   ==========================================================================
   كان الدمج في صفحة صيانة البيانات ينقل الطلبات والدفعات والمواعيد فقط، فتضيع محفظة العميل المدموج
   (الرصيد والنقاط) مع نقله لسلة المحذوفات. الآن:
     1) تُكمَّل حقول الباقي.
     2) تُنقل محفظة كل مدموج إلى الباقي (walletTransfer) قبل أي نقل أو حذف؛ فإن فشل النقل يتوقف
        الدمج لذلك العميل ولا يُحذف.
     3) تُنقل السجلات المرتبطة.
     4) يُحفظ في السلة سجل المدموج **بعد تفريغ محفظته** (وإلا أعاد الاسترجاع رصيده القديم فيتضاعف المال).
   ========================================================================== */

import { customers } from '../data/repos/customers.js';
import { orders } from '../data/repos/orders.js';
import { payments } from '../data/repos/payments.js';
import { appointments } from '../data/repos/appointments.js';
import { portfolio } from '../data/repos/portfolio.js';
import { quotes } from '../data/repos/quotes.js';
import { trash } from '../data/repos/trash.js';
import { mergeFields, CUSTOMER_LINKED_STORES } from './customer-merge.js';

const LINKED = { orders, payments, appointments, portfolio, quotes };

/**
 * يدمج عملاء في سجل باقٍ.
 * @param {Object} primary — السجل الباقي
 * @param {Array<Object>} dups — المكررات (تُنقل للسلة)
 * @returns {Promise<{moved:Array<{id:string,name:string,balance:number,points:number}>}>} ما نُقل من محافظ
 * @throws {Error} إن تعذّر نقل محفظة (لا يُحذف العميل المعني ولا يُكمَل ما بعده)
 */
export async function mergeCustomers(primary, dups) {
  const patch = mergeFields(primary, dups);
  if (Object.keys(patch).length) await customers.update(primary.id, patch);
  const moved = [];
  for (const d of dups) {
    const r = await customers.walletTransfer(d.id, primary.id, { fromName: d.name, toName: primary.name });
    if (r.moved) moved.push({ id: d.id, name: d.name || '', balance: r.balance, points: r.points });
    for (const name of CUSTOMER_LINKED_STORES) {
      const rows = await LINKED[name].findByIndex('by_customerId', d.id);
      for (const row of rows) await LINKED[name].update(row.id, { customerId: primary.id });
    }
    const fresh = (await customers.find(d.id)) || d;   /* بعد تفريغ المحفظة */
    await trash.addToTrash('customers', fresh);
    await customers.remove(d.id);
  }
  return { moved };
}
