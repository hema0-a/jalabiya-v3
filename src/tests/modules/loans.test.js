/* loans.test.js - data/repos/personal-loans + loan-payments + services/loans-calculator */
import { register } from '../registry.js';
import { personalLoans } from '../../data/repos/personal-loans.js';
import { loanPayments } from '../../data/repos/loan-payments.js';
import {
  computeLoanDetails,
  getLoansWithPayments,
  getLoansStats,
} from '../../services/loans-calculator.js';

register('loans.js', async (t) => {
  await personalLoans.clear();
  await loanPayments.clear();

  /* 1. create + list */
  const l1 = await personalLoans.create({
    type: 'given',
    personName: 'Ahmed',
    amount: 1000,
    date: Date.now(),
  });
  const l2 = await personalLoans.create({
    type: 'received',
    personName: 'Mohamed',
    amount: 500,
    date: Date.now(),
  });
  const list = await personalLoans.list();
  await t.test('1. create + list returns 2 loans',
    list.length === 2 && l1.id !== l2.id);

  /* 2. listByType */
  const givenList = await personalLoans.listByType('given');
  await t.test('2. listByType returns only given',
    givenList.length === 1 && givenList[0].id === l1.id);

  /* 3. searchByName */
  const search = await personalLoans.searchByName('Ahmed');
  await t.test('3. searchByName finds match',
    search.length === 1 && search[0].id === l1.id);

  /* 4. payments + sumByLoan */
  await loanPayments.create({ loanId: l1.id, amount: 300, date: Date.now() });
  await loanPayments.create({ loanId: l1.id, amount: 200, date: Date.now() });
  await loanPayments.create({ loanId: l2.id, amount: 100, date: Date.now() });
  const sumL1 = await loanPayments.sumByLoan(l1.id);
  await t.test('4. sumByLoan = 500', sumL1 === 500);

  /* 5. listByLoan */
  const paysL1 = await loanPayments.listByLoan(l1.id);
  await t.test('5. listByLoan returns 2 payments',
    paysL1.length === 2);

  /* 6. computeLoanDetails */
  const allPayments = await loanPayments.list();
  const details = computeLoanDetails(l1, allPayments);
  await t.test('6. computeLoanDetails computes remaining + percent',
    details.totalPaid === 500 &&
    details.remaining === 500 &&
    details.progressPercent === 50);

  /* 7. getLoansStats */
  const stats = await getLoansStats();
  await t.test('7. getLoansStats gives correct aggregates',
    stats.given.count === 1 &&
    stats.given.total === 1000 &&
    stats.given.paid === 500 &&
    stats.given.remaining === 500 &&
    stats.received.count === 1 &&
    stats.received.remaining === 400 &&
    stats.netBalance === 100);

  /* 8. getLoansWithPayments sorted */
  const withP = await getLoansWithPayments();
  await t.test('8. getLoansWithPayments returns array with details',
    Array.isArray(withP) && withP.length === 2 &&
    'totalPaid' in withP[0] && 'remaining' in withP[0]);

  /* cleanup */
  await personalLoans.clear();
  await loanPayments.clear();
});
