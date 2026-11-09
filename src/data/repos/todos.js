/* todos.js — مستودع المهام والمشتريات والملاحظات (v3.16.0)
   { id, kind:'task'|'shopping'|'note', title, ...حسب النوع (due/repeat/priority/done · qty/done · body) } */
import { createRepository } from '../repository.js';
import { STORES } from '../../core/config.js';

export const todos = createRepository(STORES.TODOS);
