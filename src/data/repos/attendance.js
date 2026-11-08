/* attendance.js — مستودع حضور العمال (v3.15.0)
   { id:'att_<workerId>_<YYYY-MM-DD>', workerId, day, status:'absent'|'half' } — الحاضر بلا سجل (الحضور افتراضي) */
import { createRepository } from '../repository.js';
import { STORES } from '../../core/config.js';
import { attendanceId, normalizeAttStatus, validDayKey } from '../../services/worker-accounts.js';

const base = createRepository(STORES.ATTENDANCE);

export const attendance = {
  ...base,
  /** يضبط حالة عامل في يوم: 'absent' أو 'half'، وnull = حاضر (يحذف السجل). المعرّف ثابت فلا تكرار. */
  async setStatus(workerId, day, status) {
    if (!workerId || !validDayKey(day)) throw new Error('بيانات حضور غير صالحة');
    const id = attendanceId(workerId, day);
    const st = normalizeAttStatus(status);
    if (!st) { await base.remove(id); return null; }
    return base.create({ id, workerId, day, status: st });
  },
};
