/* ==========================================================================
   quotes.js — مستودع عروض الأسعار (v3.3.30)
   ========================================================================== */

import { createRepository } from '../repository.js';
import { STORES } from '../../core/config.js';

export const quotes = createRepository(STORES.QUOTES);
