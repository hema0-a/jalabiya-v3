/* aftercare.js — مستودع التعديلات والمرتجعات بعد التسليم (v3.14.0)
   { id, orderId, customerId, kind, reason, cost, refund, status:'open'|'done', notes, closedAt? } */
import { createRepository } from '../repository.js';
import { STORES } from '../../core/config.js';

export const aftercare = createRepository(STORES.AFTERCARE);
