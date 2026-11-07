/* ==========================================================================
   suppliers.js — مستودعا الموردين وحركاتهم (v3.12.0)
   ==========================================================================
   suppliers:       { id, name, phone, notes }
   supplierEntries: { id, supplierId, kind:'purchase'|'payment', amount, date, item?, meters?, notes, expenseId? }
   ========================================================================== */

import { createRepository } from '../repository.js';
import { STORES } from '../../core/config.js';

export const suppliers = createRepository(STORES.SUPPLIERS);

const entriesBase = createRepository(STORES.SUPPLIER_ENTRIES);

export const supplierEntries = {
  ...entriesBase,
  /** حركات مورد واحد (غير مرتّبة). */
  async listBySupplier(supplierId) {
    return entriesBase.findByIndex('by_supplierId', supplierId);
  },
};
