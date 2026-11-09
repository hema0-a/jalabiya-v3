/* circles.js — مستودع الجمعيات (v3.16.0)
   { id, name, installment, members, myTurn, startYm:'YYYY-MM', payDay?, paid:{'YYYY-MM':true}, collected, active, notes } */
import { createRepository } from '../repository.js';
import { STORES } from '../../core/config.js';

export const circles = createRepository(STORES.CIRCLES);
