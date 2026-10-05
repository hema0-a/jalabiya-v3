/* ==========================================================================
   portfolio.test.js — اختبارات معرض الأعمال
   ==========================================================================
   8 اختبارات: repo + page filter
   ========================================================================== */

import { register } from '../registry.js';
import { filterPortfolio } from '../../pages/portfolio.js';
import { portfolio } from '../../data/repos/portfolio.js';

register('pages/portfolio.js', async (t) => {
  /* تنظيف المخزن قبل البدء */
  await portfolio.clear();

  /* 1. filterPortfolio - all + no query */
  const list = [
    { id: '1', title: 'جلابية رجالي', category: 'men' },
    { id: '2', title: 'جلابية نسائي', category: 'women' },
    { id: '3', title: 'جلابية أطفال', category: 'kids' },
  ];
  await t.test('1. filterPortfolio all → all items',
    filterPortfolio(list, 'all', '').length === 3);

  /* 2. filterPortfolio by category */
  await t.test('2. filterPortfolio by category',
    filterPortfolio(list, 'men', '').length === 1 &&
    filterPortfolio(list, 'men', '')[0].id === '1');

  /* 3. filterPortfolio by query */
  await t.test('3. filterPortfolio by query (substring)',
    filterPortfolio(list, 'all', 'نسائي').length === 1 &&
    filterPortfolio(list, 'all', 'نسائي')[0].id === '2');

  /* 4. filterPortfolio case-insensitive */
  const enList = [{ id: '4', title: 'Fancy Dress', category: 'other' }];
  await t.test('4. filterPortfolio case-insensitive',
    filterPortfolio(enList, 'all', 'fancy').length === 1 &&
    filterPortfolio(enList, 'all', 'FANCY').length === 1);

  /* 5. filterPortfolio combined (category + query) */
  await t.test('5. filterPortfolio combined',
    filterPortfolio(list, 'men', 'نسائي').length === 0);

  /* 6. portfolio.create + list */
  const item = await portfolio.create({
    title: 'جلابية تجريبية',
    category: 'men',
    image: 'data:image/jpeg;base64,fake',
    thumbnail: 'data:image/jpeg;base64,thumb',
  });
  const all = await portfolio.list();
  await t.test('6. create + list returns item',
    all.length === 1 && all[0].id === item.id);

  /* 7. portfolio.searchByTitle */
  const search = await portfolio.searchByTitle('تجريبية');
  await t.test('7. searchByTitle works',
    search.length === 1 && search[0].id === item.id);

  /* 8. portfolio.listByCategory */
  const byCat = await portfolio.listByCategory('men');
  await t.test('8. listByCategory works',
    byCat.length === 1 && byCat[0].category === 'men');

  /* تنظيف */
  await portfolio.clear();
});
