/* ==========================================================================
   section-auto-messages.js — قسم الرسائل التلقائية + محررات القوالب (v3.5.26: مفصول عن sections-system.js دون تغيير سلوك)
   ==========================================================================
   يصدّر: autoMessagesSection
   لا يستورد sections-system.js (لا دورات استيراد).
   ========================================================================== */

import { el, clear } from '../../core/dom.js';
import { toast } from '../../ui/toast.js';
import { modal } from '../../ui/modal.js';
import { createToggle } from '../../ui/controls.js';
import {
  DEFAULT_TEMPLATES,
  VARIABLE_DEFS,
  MAX_TEMPLATE_LENGTH,
  MAX_CUSTOM_TEMPLATES,
  variablesFor,
  interpolate,
  findUnknownVariables,
  sampleVars,
  newCustomId,
  PROMPT_TEMPLATE_IDS,
  MAX_FRAME_LENGTH,
} from '../../services/message-templates.js';
import { setMessageFraming } from '../../services/auto-messages.js';

/* ==========================================================================
   3. الرسائل التلقائية
   ========================================================================== */

/* ⚠️ القوالب من الخدمة (مصدر واحد). كانت هنا نسخة مكرّرة بنصوص مختلفة
   عمّا يُرسَل فعلاً، فيرى المستخدم نصاً ويُرسَل غيره. */

/** يبني خريطة التخصيصات المحفوظة: يحفظ فقط ما يختلف عن الافتراضي. */
function buildOverride(tpl, state) {
  const o = {};
  if (tpl.toggleable !== false && state.enabled === false) o.enabled = false;
  const txt = (state.text || '').trim();
  if (txt && txt !== tpl.text) o.text = txt;
  return Object.keys(o).length ? o : null;
}

const MSG_GROUPS = [
  { title: '📋 رسائل الطلب', hint: 'تظهر في زر 📱 بصفحة الطلبات، وبعد تغيير الحالة', scopes: ['order'] },
  { title: '🔔 رسائل الصفحات', hint: 'أزرار واتساب في: جاهز للاستلام · المستحقات · عروض الأسعار · لوحة التحكم', scopes: ['pickup', 'debt', 'quote'] },
  { title: '🎉 العملاء والمناسبات', hint: 'تهاني المناسبات وحملات «📣 رسائل اليوم» + شكر مكافأة الإحالة', scopes: ['customer', 'referral'] },
];

export const autoMessagesSection = {
  id: 'auto-messages',
  icon: '💬',
  title: 'الرسائل التلقائية',
  async render(body, currentSettings, saveFn) {
    const am = currentSettings.autoMessages || {};

    /* حالة محلية حيّة: كل حفظ يرسل الخريطة كاملة (settings.update يدمج عمقاً مستوى واحداً فقط،
       فإرسال نسخة قديمة كان يمحو تعديل القالب السابق). */
    const live = {};
    DEFAULT_TEMPLATES.forEach((tpl) => {
      const o = (am.templates || {})[tpl.id] || {};
      live[tpl.id] = {
        enabled: tpl.toggleable === false ? true : o.enabled !== false,
        text: (typeof o.text === 'string' && o.text.trim()) ? o.text : tpl.text,
      };
    });
    let custom = (Array.isArray(am.custom) ? am.custom : [])
      .filter((t) => t && t.id && typeof t.text === 'string')
      .map((t) => ({
        id: String(t.id), name: String(t.name || 'قالب'), icon: String(t.icon || '💬'),
        scope: t.scope === 'customer' ? 'customer' : 'order', enabled: t.enabled !== false, text: t.text,
      }));
    let masterOn = am.enabled !== false;

    function persistTemplates() {
      const map = {};
      DEFAULT_TEMPLATES.forEach((tpl) => {
        const o = buildOverride(tpl, live[tpl.id]);
        if (o) map[tpl.id] = o;
      });
      saveFn({ autoMessages: { templates: map } });
    }
    function persistCustom() {
      saveFn({ autoMessages: { custom: custom.map((t) => ({ ...t })) } });
    }

    const cards = el('div', {});
    function applyMasterState() {
      cards.style.opacity = masterOn ? '1' : '0.5';
      cards.style.pointerEvents = masterOn ? '' : 'none';
    }

    /* --- المفاتيح الرئيسية --- */
    body.appendChild(el('div', { className: 'settings-row' }, [
      el('div', { style: { flex: '1' } }, [
        el('div', { className: 'settings-row__label' }, 'تفعيل الرسائل التلقائية'),
        el('div', { className: 'settings-row__hint' },
          'تفتح واتساب برسالة جاهزة ولا تُرسَل وحدها — المستخدم يضغط «إرسال»'),
      ]),
      createToggle({
        label: '', checked: masterOn,
        onChange: (v) => { masterOn = v; applyMasterState(); saveFn({ autoMessages: { enabled: v } }); },
      }),
    ]));
    body.appendChild(el('div', { className: 'settings-row' }, [
      el('div', { style: { flex: '1' } }, [
        el('div', { className: 'settings-row__label' }, 'اقتراح إشعار العميل بعد تغيير الحالة'),
        el('div', { className: 'settings-row__hint' },
          'زر «📱 إشعار العميل» يظهر في التنبيه بعد: طلب جديد · قيد التنفيذ · جاهز · تسليم'),
      ]),
      createToggle({
        label: '', checked: am.promptOnStatus !== false,
        onChange: (v) => { saveFn({ autoMessages: { promptOnStatus: v } }); },
      }),
    ]));
    /* --- v3.5.40: حالات الاقتراح المستقلة --- */
    const PROMPT_LABELS = { new_order: '🆕 طلب جديد', start_work: '🧵 قيد التنفيذ', ready: '✅ جاهز', thanks: '🎁 تسليم' };
    let chosen = Array.isArray(am.promptStatuses) ? am.promptStatuses.filter((x) => PROMPT_TEMPLATE_IDS.includes(x)) : PROMPT_TEMPLATE_IDS.slice();
    const chips = el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' } });
    function paintChips() {
      clear(chips);
      PROMPT_TEMPLATE_IDS.forEach((id) => {
        const on = chosen.includes(id);
        chips.appendChild(el('button', {
          type: 'button', className: 'btn btn--sm ' + (on ? 'btn--primary' : 'btn--ghost'),
          'data-prompt': id, 'aria-pressed': on ? 'true' : 'false',
          onClick: () => {
            chosen = on ? chosen.filter((x) => x !== id) : PROMPT_TEMPLATE_IDS.filter((x) => x === id || chosen.includes(x));
            /* كل الحالات مختارة = null (الافتراضي) */
            saveFn({ autoMessages: { promptStatuses: chosen.length === PROMPT_TEMPLATE_IDS.length ? null : chosen.slice() } });
            paintChips();
          },
        }, (on ? '✓ ' : '') + PROMPT_LABELS[id]));
      });
    }
    paintChips();
    body.appendChild(el('div', { className: 'settings-field' }, [
      el('label', { className: 'settings-field__label' }, 'الحالات التي يُقترح لها إشعار العميل'),
      el('div', { className: 'settings-row__hint' }, 'تعمل مع مفتاح الاقتراح أعلاه. إلغاء حالة = لا يظهر زر الإشعار بعدها'),
      chips,
    ]));

    /* --- v3.5.40: ترويسة وتذييل لكل رسالة (تُضاف عند الإرسال) --- */
    function frameField(label, key, placeholder) {
      const ta = el('textarea', { className: 'input', rows: '2', maxlength: String(MAX_FRAME_LENGTH), placeholder, 'data-frame': key });
      ta.value = typeof am[key] === 'string' ? am[key] : '';
      let last = ta.value;
      const save = () => {
        if (ta.value === last) return;
        last = ta.value;
        const v = ta.value.trim().slice(0, MAX_FRAME_LENGTH);
        saveFn({ autoMessages: { [key]: v } });
        setMessageFraming({ header: key === 'header' ? v : (am.header || ''), footer: key === 'footer' ? v : (am.footer || '') });
      };
      ta.addEventListener('blur', save);
      ta.addEventListener('change', save);
      return el('div', { className: 'settings-field' }, [
        el('label', { className: 'settings-field__label' }, label), ta,
      ]);
    }
    body.appendChild(frameField('ترويسة الرسائل (اختياري)', 'header', 'مثال: السلام عليكم ورحمة الله 🌸'));
    body.appendChild(frameField('تذييل الرسائل (اختياري)', 'footer', 'مثال: ورشة الأمل — للاستفسار 0100…'));
    body.appendChild(el('div', { className: 'settings-row__hint', style: { marginBottom: '8px' } },
      'تُضاف الترويسة قبل نص كل رسالة والتذييل بعده عند الإرسال عبر واتساب (حتى ' + MAX_FRAME_LENGTH + ' حرفاً)؛ المعاينات أدناه تعرض النص الأصلي فقط.'));

    body.appendChild(cards);

    /* --- بطاقة بطاقة قالب أساسي --- */
    function builtinCard(tpl) {
      const st = live[tpl.id];
      const vars = sampleVars(tpl.scope);
      const previewEl = el('div', {
        style: {
          fontSize: '12px', color: '#555', padding: '8px', background: '#F6F1E6',
          borderRadius: '6px', marginTop: '6px', lineHeight: '1.6', whiteSpace: 'pre-wrap',
        },
      });
      const badge = el('span', { className: 'badge badge--info', style: { marginInlineStart: '6px', fontSize: '10px' } }, 'مخصّص');
      let restoreBtn = null;
      function refresh() {
        previewEl.textContent = interpolate(st.text, vars);
        badge.style.display = st.text.trim() !== tpl.text ? '' : 'none';
        if (restoreBtn) restoreBtn.style.display = st.text.trim() !== tpl.text ? '' : 'none';
        previewEl.style.opacity = st.enabled ? '1' : '0.5';
      }
      const controls = [];
      if (tpl.toggleable !== false) {
        controls.push(createToggle({
          label: '', checked: st.enabled,
          onChange: (v) => { st.enabled = v; refresh(); persistTemplates(); },
        }));
      }
      controls.push(el('button', {
        className: 'btn btn--sm btn--ghost', type: 'button', 'data-action': 'restore-template',
        onClick: () => { st.text = tpl.text; refresh(); persistTemplates(); },
      }, '↩️ الأصلي'));
      restoreBtn = controls[controls.length - 1];
      controls.push(el('button', {
        className: 'btn btn--sm btn--ghost', type: 'button',
        onClick: () => openTemplateEditor(tpl, st.text, (newText) => { st.text = newText; refresh(); persistTemplates(); }),
      }, '✏️ تعديل'));

      const card = el('div', {
        style: { padding: '12px', background: '#FFF', border: '1px solid #E5DDD0', borderRadius: '8px', marginBottom: '8px' },
      }, [
        el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', gap: '8px' } }, [
          el('span', { style: { fontWeight: '500', fontSize: '14px' } }, [(tpl.icon || '') + ' ' + tpl.name, badge]),
          el('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } }, controls),
        ]),
        previewEl,
      ]);
      refresh();
      return card;
    }

    /* --- المجموعات الأساسية --- */
    MSG_GROUPS.forEach((g) => {
      cards.appendChild(el('div', { style: { margin: '14px 0 6px' } }, [
        el('div', { style: { fontWeight: '600', fontSize: '13px', color: '#123C2F' } }, g.title),
        el('div', { style: { fontSize: '11px', color: '#888' } }, g.hint),
      ]));
      DEFAULT_TEMPLATES.filter((t) => g.scopes.includes(t.scope)).forEach((tpl) => cards.appendChild(builtinCard(tpl)));
    });

    /* --- قوالبي المخصّصة --- */
    cards.appendChild(el('div', { style: { margin: '14px 0 6px' } }, [
      el('div', { style: { fontWeight: '600', fontSize: '13px', color: '#123C2F' } }, '✨ قوالبي'),
      el('div', { style: { fontSize: '11px', color: '#888' } },
        'قوالب تضيفها بنفسك: «رسالة طلب» تظهر في زر 📱 بالطلبات، و«رسالة عملاء» تظهر في الحملات'),
    ]));
    const customWrap = el('div', {});
    cards.appendChild(customWrap);

    function renderCustom() {
      clear(customWrap);
      custom.forEach((item) => {
        const previewEl = el('div', {
          style: {
            fontSize: '12px', color: '#555', padding: '8px', background: '#F6F1E6',
            borderRadius: '6px', marginTop: '6px', lineHeight: '1.6', whiteSpace: 'pre-wrap', opacity: item.enabled ? '1' : '0.5',
          },
        }, interpolate(item.text, sampleVars(item.scope)));
        customWrap.appendChild(el('div', {
          style: { padding: '12px', background: '#FFF', border: '1px solid #E5DDD0', borderRadius: '8px', marginBottom: '8px' },
        }, [
          el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' } }, [
            el('span', { style: { fontWeight: '500', fontSize: '14px' } }, [
              item.icon + ' ' + item.name,
              el('span', { className: 'badge badge--info', style: { marginInlineStart: '6px', fontSize: '10px' } },
                item.scope === 'customer' ? 'عملاء' : 'طلب'),
            ]),
            el('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } }, [
              createToggle({
                label: '', checked: item.enabled,
                onChange: (v) => { item.enabled = v; previewEl.style.opacity = v ? '1' : '0.5'; persistCustom(); },
              }),
              el('button', {
                className: 'btn btn--sm btn--ghost', type: 'button',
                onClick: () => openCustomEditor(item, (next) => { Object.assign(item, next); renderCustom(); persistCustom(); }),
              }, '✏️'),
              el('button', {
                className: 'btn btn--sm btn--ghost', type: 'button', 'aria-label': 'حذف',
                onClick: async () => {
                  const ok = await modal.confirm({
                    title: 'حذف القالب', message: 'حذف القالب «' + item.name + '»؟',
                    confirmText: 'حذف', cancelText: 'إلغاء', danger: true,
                  });
                  if (!ok) return;
                  custom = custom.filter((x) => x.id !== item.id);
                  renderCustom(); persistCustom();
                },
              }, '🗑️'),
            ]),
          ]),
          previewEl,
        ]));
      });
      if (!custom.length) {
        customWrap.appendChild(el('div', { style: { fontSize: '12px', color: '#888', padding: '4px 0 8px' } },
          'لا توجد قوالب مخصّصة بعد. أمثلة: «موعد الاستلام»، «عرض رمضان»، «اعتذار عن التأخير».'));
      }
      customWrap.appendChild(el('button', {
        className: 'btn btn--secondary', type: 'button', style: { marginTop: '4px' },
        onClick: () => {
          if (custom.length >= MAX_CUSTOM_TEMPLATES) return toast.warning('الحد الأقصى ' + MAX_CUSTOM_TEMPLATES + ' قالباً');
          openCustomEditor(null, (next) => { custom.push({ id: newCustomId(), enabled: true, ...next }); renderCustom(); persistCustom(); });
        },
      }, '➕ قالب جديد'));
    }
    renderCustom();
    applyMasterState();

    /* --- دليل المتغيرات --- */
    body.appendChild(el('div', {
      style: { fontSize: '12px', color: '#2E8B6F', padding: '10px', background: '#F1F8E9', borderRadius: '8px', lineHeight: '1.9', marginTop: '10px' },
    }, [
      el('div', { style: { fontWeight: '600', marginBottom: '2px' } }, '💡 المتغيرات'),
      ...Object.keys(VARIABLE_DEFS).map((k) => el('div', {}, '{' + k + '} — ' + VARIABLE_DEFS[k].label)),
      el('div', { style: { marginTop: '4px', color: '#666' } },
        'كل نوع قالب يقبل متغيراته فقط (يظهر في المحرّر). المعاينة ببيانات تجريبية. المبالغ تتضمّن «ج.م» تلقائياً. السطر الذي يحوي متغيراً فارغاً وحده يُحذف.'),
    ]));
  },
};

/**
 * محرّر نص القالب (مشترك بين القالب الأساسي والمخصّص):
 * عدّاد · تحذير متغير خاطئ · شرائح إدراج المتغير · معاينة حيّة · استعادة الافتراضي.
 */
function createTextEditor({ scope, text, defaultText }) {
  let curScope = scope;
  const textarea = el('textarea', { className: 'textarea' });
  textarea.value = text;
  textarea.style.minHeight = '120px';
  textarea.maxLength = MAX_TEMPLATE_LENGTH + 200; /* هامش؛ التحقق الفعلي عند الحفظ */

  const counter = el('div', { style: { fontSize: '11px', color: '#888', textAlign: 'left' } });
  const warn = el('div', { style: { fontSize: '12px', color: '#C62828', marginTop: '4px', display: 'none' } });
  const preview = el('div', {
    style: {
      fontSize: '12px', color: '#555', padding: '8px', background: '#F6F1E6',
      borderRadius: '6px', lineHeight: '1.6', whiteSpace: 'pre-wrap', marginTop: '6px',
    },
  });
  const chips = el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px', margin: '8px 0' } });

  function update() {
    const txt = textarea.value;
    counter.textContent = txt.length + ' / ' + MAX_TEMPLATE_LENGTH;
    counter.style.color = txt.length > MAX_TEMPLATE_LENGTH ? '#C62828' : '#888';
    preview.textContent = interpolate(txt, sampleVars(curScope));
    const unknown = findUnknownVariables(txt, curScope);
    if (unknown.length) {
      warn.style.display = '';
      warn.textContent = '⚠️ متغير غير معروف سيُرسَل كما هو: ' + unknown.map((u) => '{' + u + '}').join(' ');
    } else {
      warn.style.display = 'none';
    }
  }
  textarea.addEventListener('input', update);

  function insertVar(key) {
    const token = '{' + key + '}';
    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? start;
    textarea.value = textarea.value.slice(0, start) + token + textarea.value.slice(end);
    const pos = start + token.length;
    textarea.focus();
    try { textarea.setSelectionRange(pos, pos); } catch (e) { /* ignore */ }
    update();
  }
  function drawChips() {
    clear(chips);
    variablesFor(curScope).forEach((v) => chips.appendChild(el('button', {
      type: 'button', className: 'btn btn--sm btn--ghost', title: '{' + v.key + '}', onClick: () => insertVar(v.key),
    }, v.label)));
  }

  const node = el('div', {}, [
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'نص القالب'), textarea, counter, warn]),
    el('div', { style: { fontSize: '12px', color: '#2E8B6F' } }, 'اضغط لإدراج متغير:'),
    chips,
    el('div', { style: { fontSize: '12px', color: '#2E8B6F' } }, 'معاينة:'),
    preview,
    defaultText
      ? el('div', { style: { marginTop: '8px' } }, [el('button', {
        type: 'button', className: 'btn btn--sm btn--ghost',
        onClick: () => { textarea.value = defaultText; update(); },
      }, '↺ استعادة النص الافتراضي')])
      : null,
  ]);
  drawChips();
  update();

  return {
    node,
    setScope(next) { curScope = next; drawChips(); update(); },
    /** يرجع {ok, text} أو يعرض تنبيهاً ويرجع ok=false. */
    validate() {
      const txt = textarea.value.trim();
      if (!txt) { toast.warning('النص مطلوب'); return { ok: false }; }
      if (txt.length > MAX_TEMPLATE_LENGTH) { toast.warning('النص أطول من ' + MAX_TEMPLATE_LENGTH + ' حرفاً'); return { ok: false }; }
      const unknown = findUnknownVariables(txt, curScope);
      if (unknown.length) { toast.warning('متغير غير معروف: ' + unknown.map((u) => '{' + u + '}').join(' ')); return { ok: false }; }
      return { ok: true, text: txt };
    },
  };
}

function openTemplateEditor(tpl, currentText, onSave) {
  const editor = createTextEditor({ scope: tpl.scope, text: currentText, defaultText: tpl.text });
  const handle = modal.open({
    title: 'تعديل: ' + tpl.name,
    body: editor.node,
    actions: [
      { text: 'إلغاء', variant: 'ghost', action: 'cancel', onClick: () => handle.close() },
      {
        text: 'حفظ', variant: 'primary', action: 'save',
        onClick: () => {
          const v = editor.validate();
          if (!v.ok) return;
          onSave(v.text);
          handle.close();
        },
      },
    ],
  });
}

/** محرّر قالب مخصّص (جديد أو موجود): الاسم + الأيقونة + النوع + النص. */
function openCustomEditor(existing, onSave) {
  const scopeSel = el('select', { className: 'select', 'aria-label': 'النوع' });
  [['order', 'رسالة طلب — تظهر في زر 📱 بالطلبات'], ['customer', 'رسالة عملاء — تظهر في الحملات']].forEach(([v, l]) => {
    const o = el('option', { value: v }, l);
    if ((existing ? existing.scope : 'order') === v) o.selected = true;
    scopeSel.appendChild(o);
  });
  const nameIn = el('input', { className: 'input', type: 'text', maxlength: '40', placeholder: 'اسم القالب' });
  nameIn.value = existing ? existing.name : '';
  const iconIn = el('input', { className: 'input', type: 'text', maxlength: '4', placeholder: '💬', style: { width: '70px' } });
  iconIn.value = existing ? existing.icon : '💬';

  const editor = createTextEditor({ scope: existing ? existing.scope : 'order', text: existing ? existing.text : '', defaultText: '' });
  scopeSel.addEventListener('change', () => editor.setScope(scopeSel.value));

  const body = el('div', {}, [
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'الاسم والأيقونة'),
      el('div', { style: { display: 'flex', gap: '8px' } }, [iconIn, nameIn])]),
    el('div', { className: 'field' }, [el('label', { className: 'field__label' }, 'النوع'), scopeSel]),
    editor.node,
  ]);

  const handle = modal.open({
    title: existing ? 'تعديل: ' + existing.name : 'قالب جديد',
    body,
    actions: [
      { text: 'إلغاء', variant: 'ghost', action: 'cancel', onClick: () => handle.close() },
      {
        text: 'حفظ', variant: 'primary', action: 'save',
        onClick: () => {
          const name = nameIn.value.trim();
          if (!name) return toast.warning('الاسم مطلوب');
          const v = editor.validate();
          if (!v.ok) return;
          onSave({ name, icon: iconIn.value.trim() || '💬', scope: scopeSel.value, text: v.text });
          handle.close();
        },
      },
    ],
  });
}
