/* documents.js — مستودع المستندات وتواريخ تجديدها (v3.16.0)
   { id, title, category, expiresAt, remindDays, cost, notes, renewedAt?, renewals? } */
import { createRepository } from '../repository.js';
import { STORES } from '../../core/config.js';

export const documents = createRepository(STORES.DOCUMENTS);
