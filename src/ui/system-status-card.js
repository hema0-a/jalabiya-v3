/* ==========================================================================
   system-status-card.js — بطاقة «حالة النظام» (v3.3.66) — تظهر أعلى صيانة البيانات
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { APP_CONFIG } from '../core/config.js';
import { customers } from '../data/repos/customers.js';
import { orders } from '../data/repos/orders.js';
import { payments } from '../data/repos/payments.js';
import { appointments } from '../data/repos/appointments.js';
import { quotes } from '../data/repos/quotes.js';
import { scanIntegrity } from '../services/data-integrity.js';
import { getStorageStatus } from '../services/storage-health.js';
import { listBackups, getLastExternalBackupAt } from '../services/auto-backup.js';
import { getStatus as getSyncStatus } from '../sync/auto-sync.js';
import { countConflicts } from '../sync/conflict-log.js';
import { size as queueSize } from '../sync/offline-queue.js';
import { evaluateStatus } from '../services/system-status.js';

const part = async (fn, fallback = null) => { try { return await fn(); } catch { return fallback; } };

/**
 * يجمع اللقطة (كل جزء بمعزل).
 * @param {Object} [env]
 * @param {boolean} [env.integrity=true] — false يتخطى فحص سلامة البيانات (لأنه يقرأ كل الطلبات بصورها وتوقيعاتها).
 * @returns {Promise<Object>}
 */
export async function collectStatus(env = {}) {
  const nav = env.nav || (typeof navigator !== 'undefined' ? navigator : {});
  const snap = { online: nav.onLine !== false, version: APP_CONFIG.version };
  snap.sync = await part(() => {
    const st = getSyncStatus();
    return { configured: st.configured, loggedIn: st.loggedIn, auto: st.auto, dirtySince: st.dirtySince, lastPush: st.lastPush, blocked: st.blocked, conflicts: countConflicts() };
  }, {});
  snap.queueSize = await part(() => queueSize(), 0);
  snap.storage = await part(() => getStorageStatus(nav), {});
  if (env.integrity !== false) {
    snap.integrity = await part(async () => {
      const [c, o, p, a, q] = await Promise.all([customers.list(), orders.list(), payments.list(), appointments.list(), quotes.list()]);
      return scanIntegrity({ customers: c, orders: o, payments: p, appointments: a, quotes: q });
    }, null);
  }
  const backups = await part(() => listBackups(), []);
  const ext = await part(() => getLastExternalBackupAt(), 0);
  snap.lastBackupAt = Math.max((backups[0] && backups[0].createdAt) || 0, ext || 0);
  snap.lastExternalBackupAt = ext || 0;
  snap.serviceWorker = await part(async () => {
    if (!nav.serviceWorker) return { supported: false };
    return { supported: true, controlled: !!nav.serviceWorker.controller };
  }, null);
  return snap;
}

const ICON = { ok: '✅', info: 'ℹ️', warn: '⚠️', bad: '🔴' };
const HEAD = { ok: '🩺 النظام سليم', warn: '🩺 يحتاج انتباهاً', bad: '🩺 يحتاج إجراءً الآن' };

/**
 * يبني بطاقة «حالة النظام».
 * @param {Object} [opts]
 * @param {boolean} [opts.lazyIntegrity=false] — true: التحميل الأول لا يقرأ الطلبات (بند «سلامة البيانات» يغيب)،
 *   وزر «تحديث» (ضغطة صريحة من المستخدم) هو وحده الذي يشغّل فحص السلامة.
 * @returns {HTMLElement}
 */
export function buildSystemStatusCard(opts = {}) {
  const lazyIntegrity = !!opts.lazyIntegrity;
  let firstLoad = true;
  const body = el('div', { className: 'sysstat__body' }, el('div', { className: 'sysstat__loading' }, 'جارٍ الفحص…'));
  const title = el('h3', { className: 'sysstat__title' }, '🩺 حالة النظام');
  const refreshBtn = el('button', { className: 'btn btn--sm btn--secondary', type: 'button', 'data-action': 'sysstat-refresh', onClick: () => load() }, '🔄 تحديث');
  if (lazyIntegrity) refreshBtn.title = 'يشمل فحص سلامة البيانات (يقرأ الطلبات)';
  const card = el('div', { className: 'card sysstat', 'data-role': 'system-status' }, [
    el('div', { className: 'sysstat__head' }, [title, refreshBtn]), body,
  ]);

  async function load() {
    refreshBtn.disabled = true;
    try {
      /* الفحص الكسول: التحميل الأول بلا قراءة طلبات، وكل ضغطة «تحديث» بعدها تشمل السلامة */
      const withIntegrity = !(lazyIntegrity && firstLoad);
      firstLoad = false;
      const res = evaluateStatus(await collectStatus({ integrity: withIntegrity }));
      title.textContent = HEAD[res.level];
      card.setAttribute('data-level', res.level);
      clear(body);
      res.items.forEach((it) => body.appendChild(el('div', { className: 'sysstat__row sysstat__row--' + it.level, 'data-item': it.id }, [
        el('div', { className: 'sysstat__line' }, [
          el('span', { className: 'sysstat__label' }, ICON[it.level] + ' ' + it.label),
          el('span', { className: 'sysstat__value' }, it.value),
        ]),
        it.hint ? el('div', { className: 'sysstat__hint' }, it.hint) : null,
      ])));
    } catch (e) {
      clear(body);
      body.appendChild(el('div', { className: 'sysstat__hint' }, 'تعذّر الفحص: ' + (e && e.message ? e.message : e)));
    } finally { refreshBtn.disabled = false; }
  }
  load();
  return card;
}
