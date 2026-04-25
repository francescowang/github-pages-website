'use strict';

// Run immediately (before CSS renders) to prevent flash of wrong theme.
(function () {
  var saved = localStorage.getItem('theme');
  var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  var initial = saved || (prefersDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', initial);

  function syncButton(btn, theme) {
    var isDark = theme === 'dark';
    btn.textContent = isDark ? '☀' : '🌙';
    btn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    btn.setAttribute('title',      isDark ? 'Switch to light mode' : 'Switch to dark mode');
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
      syncButton(btn, document.documentElement.getAttribute('data-theme'));

      btn.addEventListener('click', function () {
        var current = document.documentElement.getAttribute('data-theme');
        var next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
        document.querySelectorAll('[data-theme-toggle]').forEach(function (b) {
          syncButton(b, next);
        });
      });
    });
  });
}());
