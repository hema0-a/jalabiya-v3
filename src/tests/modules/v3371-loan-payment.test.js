/* ==========================================================================
   v3371-loan-payment.test.js — دفعة القرض لا تتجاوز المتبقي (v3.3.71)
   ========================================================================== */

import { register } from '../registry.js';
import { loansPage } from '../../pages/loans.js';
import { personalLoans } from '../../data/repos/personal-loans.js';
import { loanPayments } from '../../data/repos/loan-payments.js';
import { validateLoanPayment, defaultPaymentValue, getLoanRemaining } from '../../services/loans-calculator.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fire = (node, type) => node.dispatchEvent(new Event(type, { bubbles: true }));
const findBtn = (root, text) => [...root.querySelectorAll('button')].find((b) => b.textContent.includes(text));

register('v3.3.71 loan payment validation (pure)', async (t) => {
  t.test('1. مبلغ ضمن المتبقي مقبول', validateLoanPayment(100, 400).ok === true);
  t.test('2. يساوي المتبقي تماماً مقبول', validateLoanPayment(400, 400).ok === true);
  t.test('3. أكبر بمليم واحد مرفوض ويحمل المتبقي', (() => { const v = validateLoanPayment(400.01, 400); return !v.ok && v.code === 'exceeds' && v.remaining === 400; })());
  t.test('4. قرض مسدَّد ← settled', validateLoanPayment(10, 0).code === 'settled');
  t.test('5. صفر/سالب/NaN ← invalid', ['0', -5, NaN, 'abc', undefined].every((x) => validateLoanPayment(x, 100).code === 'invalid'));
  t.test('6. الفاصلة العائمة: 0.1 + 0.2 ضمن متبقي 0.3', validateLoanPayment(0.1 + 0.2, 0.3).ok === true);
  t.test('7. الافتراضي = المتبقي بمليمين (لا تقريب لأقرب جنيه)', defaultPaymentValue({ remaining: 100.5, amount: 900 }) === '100.5');
  t.test('8. الافتراضي فارغ عند السداد (لا يرجع لمبلغ القرض)', defaultPaymentValue({ remaining: 0, amount: 900 }) === '');
  t.test('9. الافتراضي يرجع للمبلغ فقط إن لم يُحسب المتبقي', defaultPaymentValue({ amount: 250 }) === '250');
});

register('v3.3.71 loan payment form (UI + fresh remaining)', async (t) => {
  const loan = await personalLoans.create({ type: 'given', personName: 't3371-loan', phone: '', amount: 1000, date: Date.now(), dueDate: null, note: '' });
  const made = [await loanPayments.create({ loanId: loan.id, amount: 600, date: Date.now(), note: '' })];
  const box = document.createElement('div');
  document.body.appendChild(box);
  const sum = () => loanPayments.sumByLoan(loan.id);
  try {
    await loansPage.render(box);
    const card = box.querySelector('[data-id="' + loan.id + '"]');
    findBtn(card, 'دفعة').click();
    await sleep(120);
    const input = document.querySelector('input[type="number"][max]');
    t.test('1. الافتراضي = المتبقي 400 والحد الأقصى 400', input.value === '400' && input.max === '400');

    input.value = '400.01'; fire(input, 'input');
    findBtn(document.body, 'حفظ الدفعة').click();
    await sleep(200);
    t.test('2. 400.01 (أكبر من المتبقي) لا تُحفظ', (await sum()) === 600);

    /* دفعة 100 تصل من جهاز آخر بعد فتح النافذة ⟵ المتبقي الفعلي صار 300 */
    made.push(await loanPayments.create({ loanId: loan.id, amount: 100, date: Date.now(), note: '' }));
    t.test('3. getLoanRemaining يقرأ القاعدة (300)', (await getLoanRemaining(loan)) === 300);
    input.value = '400'; fire(input, 'input');
    findBtn(document.body, 'حفظ الدفعة').click();
    await sleep(200);
    t.test('4. 400 (كان صحيحاً وقت الفتح) تُرفض الآن', (await sum()) === 700);

    input.value = '300'; fire(input, 'input');
    findBtn(document.body, 'حفظ الدفعة').click();
    await sleep(350);
    t.test('5. 300 (= المتبقي الفعلي) تُحفظ ويسدَّد القرض', (await sum()) === 1000);
    for (const p of await loanPayments.listByLoan(loan.id)) { if (!made.some((m) => m.id === p.id)) made.push(p); }

    const card2 = box.querySelector('[data-id="' + loan.id + '"]');
    t.test('6. زر «دفعة» يتعطّل بعد السداد الكامل', !!card2 && findBtn(card2, 'دفعة').disabled === true);
  } finally {
    document.querySelectorAll('.modal, .modal-overlay').forEach((n) => n.remove());
    loansPage.destroy();
    box.remove();
    try { for (const p of await loanPayments.listByLoan(loan.id)) await loanPayments.remove(p.id); } catch (e) { /* ignore */ }
    try { await personalLoans.remove(loan.id); } catch (e) { /* ignore */ }
  }
});
