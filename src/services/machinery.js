/* ==========================================================================
   machinery.js — صيانة الماكينات بساعات التشغيل (v3.19.0) — دوال نقية بلا DOM ولا قاعدة بيانات
   ==========================================================================
   ماكينة = { id, name, hours (إجمالي التشغيل), lastServiceHours, lastServiceAt, intervalHours }.
   الإنذار يعتمد «الساعات منذ آخر صيانة»:
     ok   : أقل من 90% من الدورة      soon : من 90% إلى أقل من 100%      due : 100% فأكثر (متجاوِز).
   (لا نختبر «hours % 100 === 0» لأنه يفوّت الإنذار إن قفزت الساعات من 98 إلى 103، أو أُدخلت أجزاء عشرية.)
   تُحفظ القائمة في settings.machines.list فتتزامن بين الأجهزة وتدخل «مركز العمل».
   ========================================================================== */

export const DEFAULT_INTERVAL_H = 100;
export const SOON_RATIO = 0.9;
export const MAX_HOURS_PER_ENTRY = 24;
export const MAX_MACHINES = 20;

const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const r2 = (v) => Math.round(v * 100) / 100;

export function newMachine({ name = 'Daimoku AE-1410', intervalHours = DEFAULT_INTERVAL_H, now = Date.now() } = {}) {
  const iv = n(intervalHours) > 0 ? Math.min(5000, n(intervalHours)) : DEFAULT_INTERVAL_H;
  return { id: 'mc_' + now.toString(36) + Math.floor(Math.random() * 1296).toString(36), name: String(name || 'ماكينة').slice(0, 40), hours: 0, lastServiceHours: 0, lastServiceAt: now, intervalHours: iv };
}

/** يضيف ساعات تشغيل (موجبة فقط، حتى 24 ساعة للإدخال الواحد). غير الصالح ⟵ الماكينة كما هي. */
export function addHours(m, hours) {
  const h = n(hours);
  if (!m || !(h > 0)) return m;
  return { ...m, hours: r2(n(m.hours) + Math.min(MAX_HOURS_PER_ENTRY, h)) };
}

/** تمّت الصيانة الآن: تبدأ دورة جديدة من الساعات الحالية. */
export function serviceDone(m, now = Date.now()) {
  return m ? { ...m, lastServiceHours: n(m.hours), lastServiceAt: now } : m;
}

export function machineStatus(m) {
  const iv = n(m && m.intervalHours) > 0 ? n(m.intervalHours) : DEFAULT_INTERVAL_H;
  const since = r2(Math.max(0, n(m && m.hours) - n(m && m.lastServiceHours)));
  const pct = since / iv;
  return { sinceService: since, intervalHours: iv, remaining: r2(Math.max(0, iv - since)), overBy: r2(Math.max(0, since - iv)), pct: r2(pct), state: pct >= 1 ? 'due' : pct >= SOON_RATIO ? 'soon' : 'ok' };
}

/** بنود التنبيه (لمركز العمل): الماكينات القريبة من الصيانة أو المتجاوِزة فقط. */
export function machineAlerts(list) {
  const out = [];
  for (const m of Array.isArray(list) ? list : []) {
    if (!m || !m.id) continue;
    const s = machineStatus(m);
    if (s.state === 'ok') continue;
    out.push({ id: String(m.id), name: String(m.name || 'ماكينة'), state: s.state, sinceService: s.sinceService, remaining: s.remaining, overBy: s.overBy,
      subtitle: s.state === 'due' ? 'حان موعد الصيانة (الزيت والتشحيم): ' + s.sinceService + ' ساعة منذ آخر صيانة' + (s.overBy > 0 ? ' (+' + s.overBy + ')' : '') : 'يقترب موعد الصيانة: متبقٍّ ≈ ' + s.remaining + ' ساعة' });
  }
  return out.sort((a, b) => (a.state === 'due' ? 0 : 1) - (b.state === 'due' ? 0 : 1) || b.sinceService - a.sinceService);
}

/** تنظيف قائمة محفوظة (حذف الفاسد، حد أقصى للعدد). */
export function sanitizeMachines(list) {
  return (Array.isArray(list) ? list : []).filter((m) => m && typeof m === 'object' && m.id).slice(0, MAX_MACHINES)
    .map((m) => ({ id: String(m.id), name: String(m.name || 'ماكينة').slice(0, 40), hours: Math.max(0, r2(n(m.hours))), lastServiceHours: Math.max(0, r2(n(m.lastServiceHours))), lastServiceAt: n(m.lastServiceAt), intervalHours: n(m.intervalHours) > 0 ? n(m.intervalHours) : DEFAULT_INTERVAL_H }));
}
