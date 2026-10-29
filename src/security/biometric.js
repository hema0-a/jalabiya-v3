/* ==========================================================================
   biometric.js — فتح التطبيق بالبصمة / بصمة الوجه / قفل الجهاز (v3.3.30)
   ==========================================================================
   يعتمد WebAuthn (مصادق المنصّة: بصمة الجوال). ملاحظات صريحة:
   - هي «راحة» فوق الـ PIN وليست بديلاً عنه: الـ PIN يبقى الأساس والاحتياط دائماً.
   - لا خادم هنا للتحقق التشفيري من التوقيع، فالضمان أن نظام الجوال نفسه يفرض
     التحقق (userVerification: required) قبل أن يُرجع الاعتماد.
   - يُخزَّن معرّف الاعتماد فقط (لا بيانات بصمة) في هذا الجهاز.
   ========================================================================== */

const KEY = 'jalabiya_v3_bio_cred';
const TIMEOUT = 60000;

const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const rand = (n) => crypto.getRandomValues(new Uint8Array(n));

export async function isSupported() {
  try {
    return !!(window.PublicKeyCredential
      && typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function'
      && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch (e) { return false; }
}

export function isEnabled() {
  try { return !!localStorage.getItem(KEY); } catch (e) { return false; }
}

/** تفعيل: يطلب من الجوال التحقق ببصمتك ويحفظ معرّف الاعتماد */
export async function enable() {
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: rand(32),
      rp: { name: 'ورشة الجلابيب' },
      user: { id: rand(16), name: 'workshop', displayName: 'مالك الورشة' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      timeout: TIMEOUT, attestation: 'none',
    },
  });
  if (!cred || !cred.rawId) throw new Error('لم يتم إنشاء اعتماد البصمة');
  localStorage.setItem(KEY, toB64(cred.rawId));
  return true;
}

/** تحقق: true عند نجاح بصمة المستخدم، false عند الإلغاء/الفشل (لا يرمي) */
export async function verify() {
  try {
    const id = localStorage.getItem(KEY);
    if (!id) return false;
    const res = await navigator.credentials.get({
      publicKey: {
        challenge: rand(32), timeout: TIMEOUT, userVerification: 'required',
        allowCredentials: [{ type: 'public-key', id: fromB64(id), transports: ['internal'] }],
      },
    });
    return !!res;
  } catch (e) { return false; }
}

export function disable() {
  try { localStorage.removeItem(KEY); } catch (e) { /* لا شيء */ }
}
