/*
 * The Skin Den — shared public-site behaviour (v1.1 refresh).
 * Mobile drawer focus handling and the visibility of the floating booking controls.
 * Pages stay fully usable without this file.
 */
(function () {
  'use strict';

  var body = document.body;

  // Smooth anchor scrolling only after the first paint settles (see site.css)
  window.addEventListener('load', function () { document.documentElement.classList.add('smooth-scroll'); });

  // ── Mobile drawer: move focus in, trap it, return it ──────────────────
  var drawer = document.getElementById('mobile-drawer');
  var burger = document.getElementById('burger');
  if (drawer && burger) {
    var focusables = function () {
      return Array.prototype.slice.call(drawer.querySelectorAll('a[href], button:not([disabled])'));
    };
    var openDrawer = function () {
      drawer.classList.add('is-open');
      drawer.removeAttribute('aria-hidden');
      burger.setAttribute('aria-expanded', 'true');
      body.style.overflow = 'hidden';
      var close = drawer.querySelector('.mobile-drawer__close');
      if (close) close.focus();
    };
    var closeDrawer = function (returnFocus) {
      drawer.classList.remove('is-open');
      drawer.setAttribute('aria-hidden', 'true');
      burger.setAttribute('aria-expanded', 'false');
      body.style.overflow = '';
      if (returnFocus) burger.focus();
    };
    burger.addEventListener('click', openDrawer);
    drawer.querySelectorAll('[data-drawer-close]').forEach(function (el) {
      // Links navigate; the close button and backdrop hand focus back to the menu button.
      el.addEventListener('click', function () { closeDrawer(el.tagName !== 'A'); });
    });
    drawer.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); closeDrawer(true); return; }
      if (e.key !== 'Tab') return;
      var items = focusables();
      if (!items.length) return;
      var first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }

  // ── Floating booking controls ─────────────────────────────────────────
  var hasIO = 'IntersectionObserver' in window;
  var watch = function (el, className, invert, threshold) {
    if (!el || !hasIO) return false;
    new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        body.classList.toggle(className, invert ? !entry.isIntersecting : entry.isIntersecting);
      });
    }, { threshold: threshold }).observe(el);
    return true;
  };
  // The bottom bar appears once the hero has scrolled away (pages without a hero show it straight away).
  if (!watch(document.getElementById('top'), 'past-hero', true, 0.05)) body.classList.add('past-hero');
  // Hide floating controls where the booking choices or the footer are already on screen.
  watch(document.getElementById('book'), 'at-booking', false, 0.08);
  watch(document.querySelector('.footer'), 'at-footer', false, 0.01);
})();
