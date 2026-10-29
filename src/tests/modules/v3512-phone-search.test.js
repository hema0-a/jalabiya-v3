/* ==========================================================================
   v3512-phone-search.test.js — بحث القروض بالهاتف (إصلاح StringphoneMatches، v3.5.12)
   ========================================================================== */

import { register } from '../registry.js';
import { applyFilters } from '../../pages/loans-logic.js';

register('v3.5.12 loans phone search (StringphoneMatches fix)', async (t) => {
  const loans = [
    { id: '1', type: 'given', personName: 'أحمد', phone: '01012345678' },
    { id: '2', type: 'taken', personName: 'محمود', phone: '01198765432' },
  ];
  const run = (q, f = 'all') => applyFilters({ loans, activeFilter: f, searchQuery: q }).map((l) => l.id).join(',');
  t.test('1. بحث بجزء من الهاتف لا يرمي ويُرجع القرض الصحيح', (() => { try { return run('0101234') === '1'; } catch (e) { return false; } })());
  t.test('2. بحث بالاسم ما زال يعمل', run('محمود') === '2');
  t.test('3. نص غير موجود ← قائمة فارغة بلا خطأ', (() => { try { return run('zzz') === ''; } catch (e) { return false; } })());
  t.test('4. فلتر النوع + بحث هاتف', run('0119', 'taken') === '2' && run('0119', 'given') === '');
  t.test('5. أرقام عربية-هندية تُطابق الهاتف', run('٠١٠١٢٣٤') === '1');
});
