/* ==========================================================================
   integrity-scan-default.js — تشغيل فحص السلامة الافتراضي على بياناتك (v3.20.1)
   ==========================================================================
   كان defaultScan داخل integrity-weekly.js يستعمل import() الديناميكي، وهذا ممنوع خارج main.js وملفات Firebase
   (القاعدة: static imports). فُصل هنا بـ static imports، ويحمّله main.js كسولاً عند حلول موعد الفحص فقط،
   فيبقى integrity-weekly.js خفيفاً (قرارات نقية) تستورده بطاقة مركز العمل دون جرّ المستودعات.
   قراءة فقط — نفس ما تفعله بطاقة حالة النظام.
   ========================================================================== */

import { customers } from '../data/repos/customers.js';
import { orders } from '../data/repos/orders.js';
import { payments } from '../data/repos/payments.js';
import { appointments } from '../data/repos/appointments.js';
import { quotes } from '../data/repos/quotes.js';
import { scanIntegrity } from './data-integrity.js';
import { loadMediaScanInputs } from './order-media-scan.js';
import { loadRelationInputs } from './relation-inputs.js';

export async function defaultScan() {
  const [c, o, p, a, q, mi, ri] = await Promise.all([
    customers.list(), orders.list(), payments.list(), appointments.list(), quotes.list(),
    loadMediaScanInputs(), loadRelationInputs(),
  ]);
  return scanIntegrity({ customers: c, orders: o, payments: p, appointments: a, quotes: q, ...mi, ...ri });
}
