/* ==========================================================================
   insights.js — حسابات التحليل الخفيفة للإصدار 3.13.0 (دوال نقية، بلا DOM ولا قاعدة بيانات)
   ==========================================================================
   1) compareCategories   — مصروف البيت: كل فئة هذا الشهر مقابل الشهر الماضي.
   2) breakdownByCategory — توزيع مصروفات الورشة على الفئات.
   3) pickupStats         — أداء الاستلام: كم ينتظر العميل بعد جاهزية طلبه.
   4) passwordStrength    — قوة كلمة المرور (إرشاد لا منع، ويبقى حد التسجيل كما هو).
   5) highValueThreshold  — حدّ «الطلب الكبير» من توزيع طلباتك أنت (لا رقم ثابت).
   6) referrerInsights    — أفضل المُرشِّحين ومن يستحق مكافأة.
   7) annualMap           — خريطة الالتزامات للأشهر الـ12 القادمة.
   كل المدخلات الفاسدة تُهمَل بلا انهيار.
   ========================================================================== */

const n = (v) => { const x = Number(v); return isFinite(x) ? x : 0; };
const r2 = (v) => Math.round(n(v) * 100) / 100;
const DAY = 86400000;
const ymIndex = (ts) => { const d = new Date(ts); return d.getFullYear() * 12 + d.getMonth(); };
const list = (x) => (Array.isArray(x) ? x : []);

export const MONTH_NAMES_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

/* ---------- 1) مقارنة فئات مصروف البيت ---------- */
export function compareCategories(expenses, now = new Date(), cats = []) {
  const meta = new Map(list(cats).filter((c) => c && c.id).map((c) => [c.id, c]));
  const cur = now.getFullYear() * 12 + now.getMonth();
  const by = new Map();
  for (const e of list(expenses)) {
    if (!e || !e.date) continue;
    const idx = ymIndex(e.date);
    if (idx !== cur && idx !== cur - 1) continue;
    const id = e.category || 'other';
    if (!by.has(id)) by.set(id, { thisMonth: 0, lastMonth: 0 });
    by.get(id)[idx === cur ? 'thisMonth' : 'lastMonth'] += n(e.amount);
  }
  const rows = [...by].map(([id, v]) => {
    const m = meta.get(id) || meta.get('other') || { label: 'أخرى', icon: '📌' };
    const thisMonth = r2(v.thisMonth), lastMonth = r2(v.lastMonth), delta = r2(thisMonth - lastMonth);
    return { id, label: m.label, icon: m.icon, thisMonth, lastMonth, delta, pct: lastMonth > 0 ? Math.round((delta / lastMonth) * 100) : null };
  }).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || String(a.label).localeCompare(String(b.label), 'ar'));
  const t = rows.reduce((s, r) => ({ thisMonth: s.thisMonth + r.thisMonth, lastMonth: s.lastMonth + r.lastMonth }), { thisMonth: 0, lastMonth: 0 });
  return { rows, totals: { thisMonth: r2(t.thisMonth), lastMonth: r2(t.lastMonth), delta: r2(t.thisMonth - t.lastMonth) } };
}

/* ---------- 2) توزيع مصروفات الورشة ---------- */
export function breakdownByCategory(expenses, labelOf = (id) => id, limit = 6) {
  const by = new Map();
  let total = 0;
  for (const e of list(expenses)) {
    const a = n(e && e.amount);
    if (!(a > 0)) continue;
    const id = (e && e.category) || 'other';
    by.set(id, (by.get(id) || 0) + a);
    total += a;
  }
  if (total <= 0) return { total: 0, rows: [] };
  let rows = [...by].map(([id, t]) => ({ id, label: labelOf(id), total: r2(t), pct: Math.round((t / total) * 100) })).sort((a, b) => b.total - a.total);
  const max = Math.max(2, Math.round(n(limit)) || 6);
  if (rows.length > max) {
    const rest = rows.slice(max - 1);
    const t = rest.reduce((s, r) => s + r.total, 0);
    rows = rows.slice(0, max - 1).concat([{ id: '_rest', label: 'أخرى', total: r2(t), pct: Math.round((t / total) * 100) }]);
  }
  return { total: r2(total), rows };
}

/* ---------- 3) أداء الاستلام ---------- */
export function pickupStats(orders, now = new Date(), windowDays = 90) {
  const since = now.getTime() - Math.max(1, n(windowDays)) * DAY;
  const waits = [];
  for (const o of list(orders)) {
    if (!o || o.status !== 'delivered') continue;
    const d = n(o.deliveredAt), r = n(o.readyAt);
    if (!(d >= since) || !(r > 0) || d < r) continue;
    waits.push((d - r) / DAY);
  }
  if (!waits.length) return null;
  const avg = waits.reduce((s, x) => s + x, 0) / waits.length;
  return {
    sample: waits.length,
    avgWaitDays: Math.round(avg * 10) / 10,
    within3Pct: Math.round((waits.filter((w) => w <= 3).length / waits.length) * 100),
    over7Count: waits.filter((w) => w > 7).length,
    longestDays: Math.round(Math.max(...waits)),
  };
}

/* ---------- 4) قوة كلمة المرور ---------- */
const COMMON = ['123456', '12345678', '123456789', 'password', 'qwerty', '111111', '000000', 'abc123', '1q2w3e', 'iloveyou', 'admin', '123123'];
const LEVELS = [
  { label: 'فارغة', color: '#999' }, { label: 'ضعيفة', color: '#C62828' }, { label: 'مقبولة', color: '#E65100' },
  { label: 'جيدة', color: '#F9A825' }, { label: 'قوية', color: '#2E7D32' },
];
export function passwordStrength(pw) {
  const p = typeof pw === 'string' ? pw : '';
  if (!p) return { score: 0, ...LEVELS[0], tips: [] };
  const tips = [];
  let pts = 0;
  if (p.length >= 8) pts++; else tips.push('استخدم 8 أحرف على الأقل');
  if (p.length >= 12) pts++;
  const classes = [/[a-z]/.test(p), /[A-Z]/.test(p), /\d/.test(p), /[^A-Za-z0-9]/.test(p)].filter(Boolean).length;
  if (classes >= 2) pts++; else tips.push('امزج حروفاً وأرقاماً');
  if (classes >= 3) pts++; else if (classes >= 2) tips.push('أضف حرفاً كبيراً أو رمزاً');
  const lower = p.toLowerCase();
  const weak = COMMON.some((c) => lower === c || (lower.includes(c) && p.length <= c.length + 2)) || /^(.)\1+$/.test(p) || /^(?:0123456789|1234567890|abcdefgh)/i.test(p);
  if (weak) { pts = Math.min(pts, 1); tips.push('كلمة شائعة أو متسلسلة — تجنّبها'); }
  const score = Math.max(1, Math.min(4, pts));
  return { score, ...LEVELS[score], tips };
}

/* ---------- 5) الطلب الكبير ---------- */
export function highValueThreshold(orders, now = new Date(), windowDays = 180, minSample = 8) {
  const since = now.getTime() - windowDays * DAY;
  const amts = list(orders).filter((o) => o && o.status !== 'cancelled' && n(o.amount) > 0 && n(o.createdAt) >= since).map((o) => n(o.amount)).sort((a, b) => a - b);
  if (amts.length < minSample) return Infinity;
  const p90 = amts[Math.min(amts.length - 1, Math.floor(amts.length * 0.9))];
  const median = amts[Math.floor(amts.length / 2)];
  return Math.max(p90, median * 1.5);
}
export const isHighValue = (order, threshold) => !!order && Number.isFinite(threshold) && n(order.amount) >= threshold && n(order.amount) > 0;

/* ---------- 6) المُرشِّحون ---------- */
const normName = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
export function referrerInsights(referrals, minForReward = 3) {
  const by = new Map();
  for (const r of list(referrals)) {
    const key = normName(r && r.referrerName);
    if (!key) continue;
    if (!by.has(key)) by.set(key, { name: String(r.referrerName).trim(), count: 0, paid: 0, pending: 0, pendingAmount: 0 });
    const g = by.get(key);
    g.count++;
    if ((r.status || 'pending') === 'paid') g.paid++; else { g.pending++; g.pendingAmount += n(r.reward); }
  }
  const rows = [...by.values()].map((g) => ({ ...g, pendingAmount: r2(g.pendingAmount) })).sort((a, b) => b.count - a.count || b.pending - a.pending || a.name.localeCompare(b.name, 'ar'));
  const minN = Math.max(1, Math.round(n(minForReward)) || 3);
  return { rows, needReward: rows.filter((g) => g.count >= minN && g.paid === 0) };
}

/* ---------- 7) خريطة الالتزامات السنوية ---------- */
export function annualMap(commitments, now = new Date(), remainingOf = null) {
  const startIdx = now.getFullYear() * 12 + now.getMonth();
  const months = Array.from({ length: 12 }, (_, i) => {
    const idx = startIdx + i;
    return { offset: i, month: ((idx % 12) + 12) % 12, year: Math.floor(idx / 12), total: 0, items: [] };
  });
  for (const c of list(commitments)) {
    if (!c || c.active === false || !(n(c.amount) > 0)) continue;
    const freq = c.frequency || 'monthly';
    const dm = Math.round(n(c.dueMonth));
    const anchor = dm >= 1 && dm <= 12 ? dm - 1 : (c.createdAt ? new Date(c.createdAt).getMonth() : now.getMonth());
    const rem = typeof remainingOf === 'function' ? remainingOf(c, now) : null;
    months.forEach((m) => {
      if (rem !== null && rem !== undefined && Number.isFinite(rem) && m.offset >= rem) return;
      const diff = (((m.month - anchor) % 12) + 12) % 12;
      let amt = 0;
      if (freq === 'monthly') amt = n(c.amount);
      else if (freq === 'weekly') amt = n(c.amount) * 4.33;
      else if (freq === 'quarterly') amt = diff % 3 === 0 ? n(c.amount) : 0;
      else if (freq === 'semi_annual') amt = diff % 6 === 0 ? n(c.amount) : 0;
      else if (freq === 'annual') amt = diff === 0 ? n(c.amount) : 0;
      if (amt > 0) { m.total += amt; m.items.push(String(c.name || '').slice(0, 40)); }
    });
  }
  months.forEach((m) => { m.total = Math.round(m.total); });
  const total = months.reduce((s, m) => s + m.total, 0);
  const peak = months.reduce((b, m) => (m.total > b.total ? m : b), months[0]);
  return { months, total, average: Math.round(total / 12), peak: peak.total > 0 ? { month: peak.month, year: peak.year, total: peak.total } : null };
}
