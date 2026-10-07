/* ==========================================================================
   cloud-sync.js — صفحة المزامنة السحابية
   ==========================================================================
   - حالة Firebase + حالة الاتصال.
   - تسجيل دخول / خروج (Email + Password).
   - رفع / تنزيل البيانات.
   - آخر مزامنة.
   - يعتمد على: sync/firebase-config.js + sync/auth-sync.js + sync/firestore-sync.js
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { modal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { STORAGE_KEYS } from '../core/config.js';
import * as authSync from '../sync/auth-sync.js';
import * as firestoreSync from '../sync/firestore-sync.js';

/* --- الحالة --- */
let state = {
  container: null,
  user: null,
  lastSyncAt: null,
  online: true,
};

/* ==========================================================================
   1. أدوات
   ========================================================================== */

/**
 * قراءة آخر وقت مزامنة من localStorage.
 * @returns {number|null}
 */
function readLastSync() {
  try {
    const v = localStorage.getItem(STORAGE_KEYS.V3_LAST_SYNC);
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}

/**
 * حفظ آخر وقت مزامنة.
 */
function writeLastSync() {
  try {
    localStorage.setItem(STORAGE_KEYS.V3_LAST_SYNC, String(Date.now()));
  } catch (e) { /* ignore */ }
}

/**
 * تنسيق تاريخ عربي كامل.
 * @param {number} ts
 * @returns {string}
 */
function formatDateTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  }).format(d);
}

/* ==========================================================================
   2. تحميل الحالة
   ========================================================================== */

async function loadState() {
  state.online = navigator.onLine;
  state.lastSyncAt = readLastSync();
  try {
    state.user = await authSync.current();
  } catch {
    state.user = null;
  }
}

/* ==========================================================================
   3. عمليات
   ========================================================================== */

async function doPush() {
  if (!state.user) return toast.warning('سجّل الدخول أولاً');
  const ok = await modal.confirm({
    title: 'رفع إلى السحابة',
    message: 'سيتم رفع البيانات المحلية إلى السحابة. متابعة؟',
    confirmText: 'رفع', cancelText: 'إلغاء',
  });
  if (!ok) return;

  toast.info('جارٍ الرفع...');
  const res = await firestoreSync.push(state.user.uid);
  if (res.ok) {
    writeLastSync();
    toast.success('تم الرفع');
    await refreshAll();
  } else {
    toast.danger('فشل الرفع: ' + (res.error || 'خطأ غير معروف'));
  }
}

async function doPull() {
  if (!state.user) return toast.warning('سجّل الدخول أولاً');
  const ok = await modal.confirm({
    title: 'تنزيل من السحابة',
    message: 'سيتم استبدال البيانات المحلية بالبيانات السحابية. متابعة؟',
    confirmText: 'تنزيل', cancelText: 'إلغاء', danger: true,
  });
  if (!ok) return;

  toast.info('جارٍ التنزيل...');
  const res = await firestoreSync.pull(state.user.uid);
  if (!res.ok) {
    toast.danger('فشل التنزيل: ' + (res.error || 'خطأ غير معروف'));
    return;
  }
  if (!res.data) {
    toast.warning('لا توجد بيانات سحابية بعد');
    return;
  }
  const applyRes = await firestoreSync.apply(res.data);
  if (applyRes.ok) {
    writeLastSync();
    toast.success('تم التنزيل — إعادة تحميل الصفحة...');
    setTimeout(() => location.reload(), 1200);
  } else {
    toast.danger('فشل التطبيق: ' + (applyRes.error || 'خطأ غير معروف'));
  }
}

async function doLogin(email, password) {
  if (!email || !password) return toast.warning('أدخل البريد وكلمة المرور');
  toast.info('جارٍ الدخول...');
  const res = await authSync.login(email, password);
  if (res.ok) {
    toast.success('تم تسجيل الدخول');
    await refreshAll();
  } else {
    toast.danger(res.error || 'فشل الدخول');
  }
}

async function doLogout() {
  const ok = await modal.confirm({
    title: 'تسجيل الخروج',
    message: 'هل تريد تسجيل الخروج من الحساب السحابي؟',
    confirmText: 'خروج', cancelText: 'إلغاء',
  });
  if (!ok) return;
  const res = await authSync.logout();
  if (res.ok) {
    toast.info('تم تسجيل الخروج');
    await refreshAll();
  } else {
    toast.danger(res.error || 'فشل الخروج');
  }
}

/* ==========================================================================
   4. الرسم
   ========================================================================== */

function buildStatusCards() {
  const wrap = el('div', {
    style: { display: 'grid', gridTemplateColumns: '1fr', gap: '8px', marginBottom: '16px' },
  });

  /* الاتصال */
  wrap.appendChild(el('div', { className: 'card', style: { padding: '12px' } }, [
    el('div', {
      style: {
        display: 'flex', alignItems: 'center', gap: '10px',
      },
    }, [
      el('span', { style: { fontSize: '24px' } }, state.online ? '🟢' : '🔴'),
      el('div', { style: { flex: '1' } }, [
        el('div', { style: { fontSize: '14px', fontWeight: '600', color: '#123C2F' } },
          state.online ? 'متصل بالإنترنت' : 'غير متصل'),
        el('div', { style: { fontSize: '11px', color: '#666', marginTop: '2px' } },
          state.online ? 'يمكنك المزامنة الآن' : 'المزامنة تحتاج اتصالاً'),
      ]),
    ]),
  ]));

  /* Firebase */
  const configured = authSync.isConfigured();
  wrap.appendChild(el('div', { className: 'card', style: { padding: '12px' } }, [
    el('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } }, [
      el('span', { style: { fontSize: '24px' } }, configured ? '☁️' : '⚠️'),
      el('div', { style: { flex: '1' } }, [
        el('div', { style: { fontSize: '14px', fontWeight: '600', color: '#123C2F' } },
          configured ? 'Firebase مُهيّأ' : 'Firebase غير مُهيّأ'),
        el('div', { style: { fontSize: '11px', color: '#666', marginTop: '2px' } },
          configured ? 'جاهز للمزامنة' : 'أضف إعدادات Firebase في config.js'),
      ]),
    ]),
  ]));

  /* آخر مزامنة */
  wrap.appendChild(el('div', { className: 'card', style: { padding: '12px' } }, [
    el('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } }, [
      el('span', { style: { fontSize: '24px' } }, '🕐'),
      el('div', { style: { flex: '1' } }, [
        el('div', { style: { fontSize: '14px', fontWeight: '600', color: '#123C2F' } }, 'آخر مزامنة'),
        el('div', { style: { fontSize: '11px', color: '#666', marginTop: '2px' } },
          formatDateTime(state.lastSyncAt)),
      ]),
    ]),
  ]));

  return wrap;
}

function buildLoginCard() {
  const card = el('div', { className: 'card', style: { padding: '16px', marginBottom: '16px' } });

  card.appendChild(el('div', { style: { fontSize: '14px', fontWeight: '600', color: '#123C2F', marginBottom: '12px' } },
    '🔓 تسجيل الدخول'));

  const emailInput = el('input', {
    className: 'input', type: 'email', placeholder: 'example@mail.com',
    style: { marginBottom: '8px' },
  });

  const passInput = el('input', {
    className: 'input', type: 'password', placeholder: '••••••••',
    style: { marginBottom: '12px' },
  });

  const btn = el('button', {
    className: 'btn btn--primary btn--block', type: 'button',
  }, '🔓 دخول');

  btn.addEventListener('click', () => doLogin(emailInput.value.trim(), passInput.value));

  card.appendChild(emailInput);
  card.appendChild(passInput);
  card.appendChild(btn);

  card.appendChild(el('div', {
    style: { fontSize: '11px', color: '#999', marginTop: '12px', textAlign: 'center', lineHeight: '1.5' },
  }, 'الحسابات تُنشأ من Firebase Console'));

  return card;
}

function buildUserCard() {
  const card = el('div', { className: 'card', style: { padding: '12px', marginBottom: '16px' } });

  card.appendChild(el('div', {
    style: { display: 'flex', alignItems: 'center', gap: '10px' },
  }, [
    el('span', { style: { fontSize: '24px' } }, '✅'),
    el('div', { style: { flex: '1', minWidth: '0' } }, [
      el('div', { style: { fontSize: '14px', fontWeight: '600', color: '#2E7D32' } }, 'مسجل الدخول'),
      el('div', {
        style: { fontSize: '11px', color: '#666', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis' },
      }, state.user.email || state.user.uid || '—'),
    ]),
  ]));

  return card;
}

function buildActionsCard() {
  const card = el('div', {
    style: { display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' },
  });

  card.appendChild(el('button', {
    className: 'btn btn--primary btn--block', type: 'button',
    onClick: () => doPush(),
  }, '⬆️ رفع إلى السحابة'));

  card.appendChild(el('button', {
    className: 'btn btn--secondary btn--block', type: 'button',
    onClick: () => doPull(),
  }, '⬇️ تنزيل من السحابة'));

  card.appendChild(el('button', {
    className: 'btn btn--ghost btn--block', type: 'button',
    style: { color: '#C62828' },
    onClick: () => doLogout(),
  }, '🚪 تسجيل الخروج'));

  return card;
}

function renderPage() {
  const c = state.container;
  if (!c) return;
  clear(c);

  /* الرأس */
  c.appendChild(el('div', { style: { marginBottom: '12px' } }, [
    el('h1', { style: { fontSize: '22px', color: '#123C2F', margin: '0 0 4px 0' } }, '☁️ المزامنة السحابية'),
    el('p', { style: { fontSize: '13px', color: '#2E8B6F', margin: '0' } }, 'احفظ بياناتك في السحابة'),
  ]));

  /* الحالة */
  c.appendChild(buildStatusCards());

  /* Firebase غير مُهيّأ → توقف هنا */
  if (!authSync.isConfigured()) {
    c.appendChild(el('div', {
      style: {
        padding: '14px', background: '#FFF3E0', color: '#E65100',
        borderRadius: '8px', fontSize: '13px', lineHeight: '1.6',
      },
    }, '⚠️ Firebase غير مُهيّأ — راجع config.js لإضافة مفاتيح Firebase.'));
    return;
  }

  /* تسجيل الدخول أو الأزرار */
  if (!state.user) {
    c.appendChild(buildLoginCard());
  } else {
    c.appendChild(buildUserCard());
    c.appendChild(buildActionsCard());
  }
}

/* ==========================================================================
   5. API
   ========================================================================== */

async function refreshAll() {
  await loadState();
  renderPage();
}

export const cloudSyncPage = {
  async render(container) {
    clear(container);
    state.container = container;
    await refreshAll();

    /* تحديث تلقائي عند تغير حالة الاتصال */
    const onOnline = () => { state.online = true; renderPage(); };
    const onOffline = () => { state.online = false; renderPage(); };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    /* تخزين المراجع لإزالتها في destroy */
    state._cleanup = () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  },

  destroy() {
    if (state._cleanup) {
      try { state._cleanup(); } catch (e) { /* ignore */ }
    }
    state = {
      container: null,
      user: null,
      lastSyncAt: null,
      online: true,
    };
  },
};
