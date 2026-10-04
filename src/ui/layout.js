/* ==========================================================================
   layout.js — هيكل التطبيق (App Shell)
   ==========================================================================
   يربط: Sidebar + Topbar + منطقة المحتوى.
   API:
     const layout = createLayout({
       sidebar: {...},   // خيارات createSidebar
       topbar: {...},    // خيارات createTopbar (ما عدا onMenuClick)
       onPageSelect: (id) => {}   // يُستدعى عند اختيار صفحة من السايدبار
     });
     layout.node               → HTMLElement (App Shell كامل)
     layout.setContent(node)   → void
     layout.setTitle(str)      → void
     layout.setActivePage(id)  → void
     layout.toggleSidebar()    → void
     layout.openSidebar()      → void
     layout.closeSidebar()     → void
     layout.isSidebarOpen()    → boolean
     layout.sidebar            → كائن createSidebar
     layout.topbar             → كائن createTopbar
   ========================================================================== */

import { el } from '../core/dom.js';
import { events } from '../core/events.js';
import { createSidebar } from './sidebar.js';
import { createTopbar } from './topbar.js';

/**
 * إنشاء هيكل التطبيق الكامل.
 * @param {Object} [options]
 * @returns {Object}
 */
export function createLayout(options = {}) {
  const {
    sidebar: sidebarOptions = {},
    topbar: topbarOptions = {},
    onPageSelect = null,
  } = options;

  let sidebarOpen = false;

  /* --- 1. السايدبار --- */
  const sidebar = createSidebar({
    ...sidebarOptions,
    onSelect: (id) => {
      // على الموبايل: أغلق السايدبار بعد الاختيار
      if (window.matchMedia('(max-width: 767px)').matches) {
        closeSidebar();
      }
      if (typeof sidebarOptions.onSelect === 'function') {
        sidebarOptions.onSelect(id);
      }
      if (typeof onPageSelect === 'function') {
        onPageSelect(id);
      }
      events.emit('layout:page-changed', { id });
    },
  });

  /* --- 2. Topbar --- */
  const topbar = createTopbar({
    ...topbarOptions,
    onMenuClick: () => toggleSidebar(),
  });

  /* --- 3. Overlay (يظهر خلف السايدبار على الموبايل) --- */
  const overlay = el('div', {
    className: 'app-shell__overlay',
    onClick: () => closeSidebar(),
  });

  /* --- 4. منطقة المحتوى --- */
  const content = el('main', { className: 'app-shell__content' });

  /* --- 5. Main (Topbar + Content) --- */
  const main = el('div', { className: 'app-shell__main' }, [
    topbar.node,
    content,
  ]);

  /* --- 6. App Shell --- */
  const shell = el('div', { className: 'app-shell' }, [
    sidebar.node,
    main,
  ]);

  /* --- 7. Wrapper (Overlay + Shell) --- */
  const node = el('div', {}, [overlay, shell]);

  /* --- دوال التحكم بالسايدبار --- */

  function openSidebar() {
    if (sidebarOpen) return;
    sidebarOpen = true;
    shell.classList.add('app-shell--sidebar-open');
    events.emit('layout:sidebar-toggled', { open: true });
  }

  function closeSidebar() {
    if (!sidebarOpen) return;
    sidebarOpen = false;
    shell.classList.remove('app-shell--sidebar-open');
    events.emit('layout:sidebar-toggled', { open: false });
  }

  function toggleSidebar() {
    if (sidebarOpen) closeSidebar();
    else openSidebar();
  }

  /* --- ESC لإغلاق السايدبار على الموبايل --- */
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidebarOpen) closeSidebar();
  });

  /* --- إغلاق تلقائي عند تغيير حجم النافذة إلى ديسكتوب --- */
  window.addEventListener('resize', () => {
    if (sidebarOpen && window.innerWidth >= 768) {
      closeSidebar();
    }
  });

  /* --- API --- */

  /**
   * استبدال محتوى المنطقة الرئيسية.
   * @param {Node|Array<Node>} newNode
   */
  function setContent(newNode) {
    while (content.firstChild) content.removeChild(content.firstChild);
    if (Array.isArray(newNode)) {
      newNode.forEach((n) => { if (n) content.appendChild(n); });
    } else if (newNode) {
      content.appendChild(newNode);
    }
  }

  return {
    node,
    setContent,
    setTitle: (str) => topbar.setTitle(str),
    setActivePage: (id) => sidebar.setActive(id),
    toggleSidebar,
    openSidebar,
    closeSidebar,
    isSidebarOpen: () => sidebarOpen,
    sidebar,
    topbar,
  };
}
