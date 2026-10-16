/* ==========================================================================
   cloud-sync.js — صفحة المزامنة السحابية
   ==========================================================================
   - حالة Firebase + حالة الاتصال.
   - تسجيل دخول / خروج (Email + Password) مع استماع تلقائي للجلسة.
   - رفع / تنزيل البيانات.
   - آخر مزامنة.
   - يعتمد على: sync/firebase-config.js + sync/auth-sync.js + sync/sync-flow.js
   ========================================================================== */

import { el, clear } from '../core/dom.js';
import { modal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { STORAGE_KEYS } from '../core/config.js';
import * as authSync from '../sync/auth-sync.js';
import { pushFlow, pullFlow } from '../sync/sync-flow.js';
import * as autoSync from '../sync/auto-sync.js';
import { requestPersistence, getStorageStatus, formatBytes } from '../services/storage-health.js';
import { getConflicts, removeConflict, clearConflicts, restoreLosingValue, previewValue, fieldLabel, STORE_LABELS } from '../sync/conflict-log.js';

/* --- الحالة --- */
let state = {
  container: null,
  user: null,
  lastSyncAt: null,
  online: true,
  _unsubAuth: null,
  _unsubOnline: null,
  _unsubOffline: null,
  _unsubSync: null,
};

/* ==========================================================================
   1. أدوات
   ========================================================================== */

function readLastSync() {
  try {
    const v = localStorage.getItem(STORAGE_KEYS.V3_LAST_SYNC);
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}

function relativeTime(ts) {
  if (!ts) return '—';
  const mins = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (mins < 1) return 'الآن';
  if (mins < 60) return 'قبل ' + mins + ' دقيقة';
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return 'قبل ' + hrs + ' ساعة';
  return 'قبل ' + Math.round(hrs / 24) + ' يوم';
}

function formatDateTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  }).format(d);
}

/* ==========================================================================
   2. عمليات
   ========================================================================== */

async function doPush() {
  if (!state.user) return toast.warning('سجّل الدخول أولاً');
  /* المسار الآمن: يحمي السحابة من الاستبدال ويعرض خيار الدمج عند التعارض */
  const res = await pushFlow(state.user.uid);
  if (res.ok) {
    state.lastSyncAt = readLastSync();
    renderPage();
  }
}

async function doPull() {
  if (!state.user) return toast.warning('سجّل الدخول أولاً');
  /* المسار الآمن: دمج أو استبدال بقرارك + نسخة أمان قبل أي تغيير */
  const res = await pullFlow(state.user.uid);
  if (res.ok) {
    state.lastSyncAt = readLastSync();
    /* ⚠️ لا نُعيد تحميل الصفحة — لا حاجة، كل صفحة تُحدّث بياناتها عند فتحها */
    renderPage();
  }
}

async function doLogin(email, password) {
  if (!email || !password) return toast.warning('أدخل البريد وكلمة المرور');
  toast.info('جارٍ الدخول...');
  const res = await authSync.login(email, password);
  if (res.ok) {
    toast.success('تم تسجيل الدخول');
    /* onAuthChange سيُحدّث state.user تلقائياً */
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
    /* onAuthChange سيُحدّث state.user تلقائياً */
  } else {
    toast.danger(res.error || 'فشل الخروج');
  }
}

/* ==========================================================================
   3. الرسم
   ========================================================================== */

function buildStatusCards() {
  const wrap = el('div', {
    style: { display: 'grid', gridTemplateColumns: '1fr', gap: '8px', marginBottom: '16px' },
  });

  wrap.appendChild(el('div', { className: 'card', style: { padding: '12px' } }, [
    el('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } }, [
      el('span', { style: { fontSize: '24px' } }, state.online ? '🟢' : '🔴'),
      el('div', { style: { flex: '1' } }, [
        el('div', { style: { fontSize: '14px', fontWeight: '600', color: '#123C2F' } },
          state.online ? 'متصل بالإنترنت' : 'غير متصل'),
        el('div', { style: { fontSize: '11px', color: '#666', marginTop: '2px' } },
          state.online ? 'يمكنك المزامنة الآن' : 'المزامنة تحتاج اتصالاً'),
      ]),
    ]),
  ]));

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

/** بطاقة حماية التخزين المحلي (تُملأ بعد قراءة الحالة، فلا تعطّل رسم الصفحة). */
function buildStorageCard() {
  const card = el('div', { className: 'card', style: { padding: '12px', marginBottom: '16px' } });
  const line = el('div', { style: { fontSize: '14px', fontWeight: '600' } }, '💾 جارٍ فحص حماية التخزين...');
  const note = el('div', { style: { fontSize: '11px', color: '#666', marginTop: '4px', lineHeight: '1.7' } });
  const btnHolder = el('div', { style: { marginTop: '8px' } });
  card.append(line, note, btnHolder);

  const paint = async () => {
    const s = await getStorageStatus();
    /* \u2066…\u2069: عزل اتجاه الأرقام والوحدات داخل النص العربي (وإلا ظهرت «KB 32.2») */
    const ltr = (x) => '\u2066' + x + '\u2069';
    const usage = s.usage !== null ? 'المستخدم: ' + ltr(formatBytes(s.usage)) + (s.quota ? ' من ' + ltr(formatBytes(s.quota)) : '') : '';
    btnHolder.textContent = '';
    if (!s.supported) {
      line.textContent = '💾 هذا المتصفح لا يدعم حماية التخزين';
      line.style.color = '#E65100';
      note.textContent = 'اعتمد على المزامنة السحابية والنسخ الاحتياطي الخارجي. ' + usage;
    } else if (s.persisted) {
      line.textContent = '💾 التخزين المحلي محمي ✅';
      line.style.color = '#2E7D32';
      note.textContent = 'لن يحذف المتصفح بياناتك تلقائياً عند امتلاء الجهاز. ' + usage;
    } else {
      line.textContent = '💾 التخزين المحلي غير محمي ⚠️';
      line.style.color = '#E65100';
      note.textContent = 'قد يحذف المتصفح بيانات التطبيق عند امتلاء الجهاز. ثبّت التطبيق على الشاشة الرئيسية ثم اطلب الحماية، وحافظ على المزامنة والنسخ الخارجي. ' + usage;
      btnHolder.appendChild(el('button', {
        className: 'btn btn--secondary', type: 'button', style: { fontSize: '12px', padding: '4px 10px' },
        onClick: async () => {
          const r = await requestPersistence();
          if (r.persisted) toast.success('تم تفعيل حماية التخزين');
          else toast.warning('لم يمنح المتصفح الحماية — ثبّت التطبيق على الشاشة الرئيسية وجرّب لاحقاً');
          paint();
        },
      }, '🛡️ اطلب الحماية'));
    }
  };
  paint().catch(() => { line.textContent = '💾 تعذّر فحص حالة التخزين'; });
  return card;
}

function buildAutoSyncCard() {
  const st = autoSync.getStatus();
  const card = el('div', { className: 'card', style: { padding: '12px', marginBottom: '16px' } });

  let line1, color;
  if (st.blocked) { line1 = '🔴 الرفع التلقائي متوقف — يحتاج قرارك'; color = '#C62828'; }
  else if (st.dirtySince) { line1 = '🟠 تعديلات غير مرفوعة منذ ' + relativeTime(st.dirtySince).replace('قبل ', ''); color = '#E65100'; }
  else { line1 = '✅ كل بياناتك مرفوعة'; color = '#2E7D32'; }

  card.appendChild(el('div', { style: { fontSize: '14px', fontWeight: '600', color } }, line1));
  card.appendChild(el('div', { style: { fontSize: '11px', color: '#666', marginTop: '4px' } },
    'آخر رفع: ' + relativeTime(st.lastPush)));
  if (st.blocked) {
    card.appendChild(el('div', { style: { fontSize: '12px', color: '#C62828', marginTop: '6px', lineHeight: '1.6' } },
      'السحابة فيها بيانات من جهاز آخر. اضغط «رفع إلى السحابة» واختر «دمج ثم رفع» — لن يُرفع شيء تلقائياً قبل ذلك.'));
  }

  const cb = el('input', { type: 'checkbox' });
  cb.checked = st.auto;
  cb.addEventListener('change', () => autoSync.setAutoEnabled(cb.checked));
  card.appendChild(el('label', {
    style: { display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', fontSize: '13px', cursor: 'pointer' },
  }, [cb, el('span', {}, 'رفع تلقائي هادئ (بعد 3 دقائق من آخر تعديل وعند إغلاق التطبيق)')]));
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

/** قسم «تعارضات المزامنة»: حقول عُدّلت على جهازين فاخترنا الأحدث — مع زر استرجاع القيمة الأخرى. */
function buildConflictsCard() {
  const list = getConflicts();
  if (list.length === 0) return null;
  const card = el('div', { className: 'card', id: 'sync-conflicts', style: { padding: '12px', marginBottom: '16px' } });
  card.appendChild(el('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' } }, [
    el('div', { style: { fontSize: '14px', fontWeight: '600', color: '#E65100' } }, '🔀 تعارضات المزامنة (' + list.length + ')'),
    el('button', {
      className: 'btn btn--sm btn--ghost', type: 'button',
      onClick: () => { clearConflicts(); renderPage(); },
    }, 'تجاهل الكل'),
  ]));
  card.appendChild(el('div', { style: { fontSize: '11px', color: '#666', marginBottom: '8px', lineHeight: '1.6' } },
    'عُدّلت هذه الحقول على جهازين بقيمتين مختلفتين. اخترنا الأحدث تلقائياً — استرجع القيمة الأخرى إن كانت هي الصحيحة.'));

  list.forEach((e) => {
    const winnerVal = e.winner === 'local' ? e.localValue : e.cloudValue;
    const otherVal = e.winner === 'local' ? e.cloudValue : e.localValue;
    const row = el('div', { className: 'sync-conflict', dataset: { conflictId: e.id }, style: { padding: '8px 0', borderTop: '1px solid #eee' } }, [
      el('div', { style: { fontSize: '13px', fontWeight: '600' } },
        (STORE_LABELS[e.store] || e.store) + ' ' + e.label + ' — ' + fieldLabel(e.field)),
      el('div', { style: { fontSize: '12px', marginTop: '3px', lineHeight: '1.7' } }, [
        el('span', { style: { color: '#2E7D32' } }, '✔ المعتمد: ' + previewValue(winnerVal)),
        el('br'),
        el('span', { style: { color: '#999' } }, '↩ القيمة الأخرى: ' + previewValue(otherVal)),
      ]),
      el('div', { style: { display: 'flex', gap: '6px', marginTop: '6px' } }, [
        e.restorable ? el('button', {
          className: 'btn btn--sm btn--secondary', type: 'button', dataset: { action: 'restore' },
          onClick: async () => {
            const r = await restoreLosingValue(e.id);
            if (r.ok) toast.success('تم استرجاع القيمة — ارفع لتحديث السحابة'); else toast.warning(r.error || 'تعذّر الاسترجاع');
            renderPage();
          },
        }, 'استرجاع القيمة الأخرى') : null,
        el('button', {
          className: 'btn btn--sm btn--ghost', type: 'button', dataset: { action: 'dismiss' },
          onClick: () => { removeConflict(e.id); renderPage(); },
        }, 'تجاهل'),
      ].filter(Boolean)),
    ]);
    card.appendChild(row);
  });
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

  c.appendChild(buildStatusCards());
  c.appendChild(buildStorageCard());
  const conflictsCard = buildConflictsCard();
  if (conflictsCard) c.appendChild(conflictsCard);

  if (!authSync.isConfigured()) {
    c.appendChild(el('div', {
      style: {
        padding: '14px', background: '#FFF3E0', color: '#E65100',
        borderRadius: '8px', fontSize: '13px', lineHeight: '1.6',
      },
    }, '⚠️ Firebase غير مُهيّأ — راجع config.js لإضافة مفاتيح Firebase.'));
    return;
  }

  if (!state.user) {
    c.appendChild(buildLoginCard());
  } else {
    c.appendChild(buildUserCard());
    c.appendChild(buildAutoSyncCard());
    c.appendChild(buildActionsCard());
  }
}

/* ==========================================================================
   4. API
   ========================================================================== */

export const cloudSyncPage = {
  async render(container) {
    clear(container);
    state.container = container;
    state.online = navigator.onLine;
    state.lastSyncAt = readLastSync();

    /* ⚠️ لا نستدعي current() — onAuthChange يُحدّث state.user تلقائياً */
    /* (يُستدعى فوراً بـ null، ثم يُستدعى بـ user عند استعادة الجلسة) */
    state._unsubAuth = authSync.onAuthChange((user) => {
      autoSync.setUser(user);
      if (!state.container) return;
      state.user = user;
      renderPage();
    });
    state._unsubSync = autoSync.subscribe(() => { if (state.container && state.user) renderPage(); });

    /* تحديث تلقائي عند تغير حالة الاتصال */
    const onOnline = () => { state.online = true; if (state.container) renderPage(); };
    const onOffline = () => { state.online = false; if (state.container) renderPage(); };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    state._unsubOnline = onOnline;
    state._unsubOffline = onOffline;

    /* أول رسم فوري */
    renderPage();
  },

  destroy() {
    if (state._unsubAuth) {
      try { state._unsubAuth(); } catch (e) { /* ignore */ }
    }
    if (state._unsubSync) { try { state._unsubSync(); } catch (e) { /* ignore */ } }
    if (state._unsubOnline) {
      try { window.removeEventListener('online', state._unsubOnline); } catch (e) { /* ignore */ }
    }
    if (state._unsubOffline) {
      try { window.removeEventListener('offline', state._unsubOffline); } catch (e) { /* ignore */ }
    }
    state = {
      container: null,
      user: null,
      lastSyncAt: null,
      online: true,
      _unsubAuth: null,
      _unsubOnline: null,
      _unsubOffline: null,
      _unsubSync: null,
    };
  },
};
