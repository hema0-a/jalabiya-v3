/* ==========================================================================
   signature-pad.js — لوحة التوقيع بالإصبع/الماوس
   ==========================================================================
   - Canvas يستقبل الرسم بالماوس + اللمس.
   - زر "مسح" + زر "حفظ".
   - يُرجع Promise<string|null> (base64 PNG أو null عند الإلغاء).
   - متوافق مع modal.js الحالي (variant: 'sheet').
   ========================================================================== */

import { el } from '../core/dom.js';
import { modal } from './modal.js';

/* --- الأبعاد الداخلية للـ canvas (resolution مستقل) --- */
const CANVAS_W = 800;
const CANVAS_H = 400;
const LINE_WIDTH = 3;
const LINE_COLOR = '#123C2F';

/**
 * فتح لوحة التوقيع وإرجاع base64 للصورة.
 * @param {Object} [options]
 * @param {string} [options.title='توقيع التسليم'] — عنوان النافذة
 * @param {string} [options.hint=''] — نص مساعد يظهر أسفل اللوحة
 * @returns {Promise<string|null>} — base64 PNG أو null إن ألغى المستخدم
 */
export function openSignaturePad(options = {}) {
  const {
    title = 'توقيع التسليم',
    hint = 'وقّع بإصبعك أو بالماوس في المساحة أدناه',
  } = options;

  return new Promise((resolve) => {
    let resolved = false;
    let hasDrawn = false;

    const finish = (value) => {
      if (resolved) return;
      resolved = true;
      resolve(value);
    };

    /* ---------- canvas ---------- */
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    canvas.style.cssText =
      'width:100%;height:auto;display:block;' +
      'background:#fff;border:2px dashed #B8CFC5;' +
      'border-radius:12px;touch-action:none;cursor:crosshair;';

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.lineWidth = LINE_WIDTH;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = LINE_COLOR;

    /* ---------- الحالة الداخلية ---------- */
    let drawing = false;
    let lastX = 0;
    let lastY = 0;

    /**
     * الحصول على إحداثيات النقطة داخل الـ canvas بناءً على حدث الماوس/اللمس.
     * @param {MouseEvent|TouchEvent} e
     * @returns {{x:number, y:number}}
     */
    function getPos(e) {
      const rect = canvas.getBoundingClientRect();
      const scaleX = CANVAS_W / rect.width;
      const scaleY = CANVAS_H / rect.height;

      let clientX, clientY;
      if (e.touches && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }
      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY,
      };
    }

    function startDraw(e) {
      e.preventDefault();
      drawing = true;
      const p = getPos(e);
      lastX = p.x;
      lastY = p.y;
    }

    function draw(e) {
      if (!drawing) return;
      e.preventDefault();
      const p = getPos(e);
      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      lastX = p.x;
      lastY = p.y;
      hasDrawn = true;
    }

    function endDraw(e) {
      if (e) e.preventDefault();
      drawing = false;
    }

    /* --- ربط الأحداث (ماوس + لمس) --- */
    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', endDraw);
    canvas.addEventListener('mouseleave', endDraw);

    canvas.addEventListener('touchstart', startDraw, { passive: false });
    canvas.addEventListener('touchmove', draw, { passive: false });
    canvas.addEventListener('touchend', endDraw, { passive: false });
    canvas.addEventListener('touchcancel', endDraw, { passive: false });

    /* ---------- أزرار التحكم ---------- */
    const clearBtn = el('button', {
      className: 'btn btn--ghost', type: 'button',
      onClick: () => {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        ctx.strokeStyle = LINE_COLOR;
        ctx.lineWidth = LINE_WIDTH;
        hasDrawn = false;
      },
    }, '🧹 مسح');

    const undoBtn = el('button', {
      className: 'btn btn--secondary', type: 'button',
      onClick: () => {
        /* مسح آخر نقطة (بسيط: يعيد الرسم الكامل — لا يوجد history) */
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        hasDrawn = false;
        hint_node.textContent = 'استخدم المسح ثم ارسم مرة أخرى';
      },
    }, '↩️ مسح الكل');
    /* زر undo مكرر — إزالة */
    undoBtn.style.display = 'none';

    const hint_node = el('div', {
      style: {
        fontSize: '12px', color: '#2E8B6F',
        textAlign: 'center', marginTop: '8px',
      },
    }, hint);

    const body = el('div', {}, [
      el('div', {
        style: { fontSize: '13px', color: '#123C2F', marginBottom: '10px', textAlign: 'center' },
      }, '✍️ ' + hint),
      canvas,
      el('div', {
        style: { display: 'flex', justifyContent: 'center', marginTop: '10px' },
      }, [clearBtn]),
    ]);

    /* ---------- النافذة ---------- */
    const handle = modal.open({
      title,
      body,
      closable: true,
      variant: 'sheet',
      onClose: () => {
        /* الإغلاق بدون حفظ = إلغاء */
        finish(null);
      },
      actions: [
        {
          text: 'إلغاء',
          variant: 'ghost',
          onClick: () => { finish(null); handle.close(); },
        },
        {
          text: '✅ حفظ التوقيع',
          variant: 'primary',
          onClick: () => {
            if (!hasDrawn) {
              /* لا توقيع → لا تحفظ */
              hint_node.textContent = '⚠️ من فضلك ارسم توقيعك أولاً';
              hint_node.style.color = '#C62828';
              return;
            }
            try {
              const dataUrl = canvas.toDataURL('image/png');
              finish(dataUrl);
            } catch (e) {
              console.error('[signature-pad] toDataURL failed:', e);
              finish(null);
            }
            handle.close();
          },
        },
      ],
    });
  });
}
