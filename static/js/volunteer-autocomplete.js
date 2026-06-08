/**
 * Volunteer Autocomplete
 *
 * Attaches a name/email search dropdown to a text input. As the user types, it
 * filters the volunteer directory (fetched once from the Events API and cached)
 * and shows matches. Selecting a match invokes onSelect with the volunteer.
 * If no match is found, the typed value is still usable to add a new volunteer.
 *
 * Framework-agnostic (vanilla DOM), so it works in both the React-createElement
 * admin dashboard and the vanilla-JS kiosk check-in page.
 *
 * Usage:
 *   const ac = window.VolunteerAutocomplete.attach(inputEl, {
 *     onSelect: (vol) => { ... },   // called when a directory match is chosen
 *     onInput:  (value) => { ... }, // optional: called on every keystroke
 *     getApi:   () => window.eventsAPI, // optional override
 *   });
 *   // later: ac.destroy();
 */
(function () {
  'use strict';

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function matches(directory, query) {
    var q = (query || '').trim().toLowerCase();
    if (!q) return [];
    var out = [];
    for (var i = 0; i < directory.length; i++) {
      var v = directory[i];
      var hay = (v.full_name + ' ' + v.email).toLowerCase();
      if (hay.indexOf(q) !== -1) {
        out.push(v);
        if (out.length >= 8) break;
      }
    }
    return out;
  }

  function attach(input, options) {
    options = options || {};
    var getApi = options.getApi || function () { return window.eventsAPI; };
    var directory = [];
    var loaded = false;
    var activeIndex = -1;
    var currentMatches = [];

    // Position the dropdown relative to a wrapper. If the input's parent is
    // already a positioned, single-purpose container we reuse it (avoids
    // restructuring DOM that a framework like React may be managing).
    var wrapper;
    var createdWrapper = false;
    var parent = input.parentNode;
    if (parent && parent.getAttribute && parent.getAttribute('data-vac-wrapper') === '1') {
      wrapper = parent;
    } else if (parent && parent.children.length === 1) {
      // Sole child — safe to position the parent itself rather than restructure.
      wrapper = parent;
      var pos = window.getComputedStyle(wrapper).position;
      if (pos === 'static') wrapper.style.position = 'relative';
    } else {
      wrapper = document.createElement('div');
      wrapper.setAttribute('data-vac-wrapper', '1');
      wrapper.style.position = 'relative';
      parent.insertBefore(wrapper, input);
      wrapper.appendChild(input);
      createdWrapper = true;
    }

    var dropdown = document.createElement('div');
    dropdown.className = 'volunteer-ac-dropdown';
    dropdown.style.cssText =
      'position:absolute;left:0;right:0;top:100%;z-index:60;background:#fff;' +
      'border:1px solid #d1d5db;border-top:none;border-radius:0 0 0.375rem 0.375rem;' +
      'max-height:240px;overflow-y:auto;box-shadow:0 4px 12px rgba(0,0,0,0.08);display:none;';
    wrapper.appendChild(dropdown);

    function loadDirectory() {
      if (loaded) return Promise.resolve(directory);
      var api = getApi();
      if (!api || typeof api.getVolunteerDirectory !== 'function') {
        return Promise.resolve([]);
      }
      return api.getVolunteerDirectory().then(function (list) {
        directory = list || [];
        loaded = true;
        return directory;
      }).catch(function (err) {
        console.warn('Volunteer directory load failed:', err && err.message);
        directory = [];
        loaded = true;
        return directory;
      });
    }

    function hide() {
      dropdown.style.display = 'none';
      activeIndex = -1;
    }

    function render(list) {
      currentMatches = list;
      if (!list.length) { hide(); return; }
      dropdown.innerHTML = '';
      list.forEach(function (v, idx) {
        var item = document.createElement('div');
        item.className = 'volunteer-ac-item';
        item.style.cssText = 'padding:8px 12px;cursor:pointer;font-size:0.875rem;' +
          (idx === activeIndex ? 'background:#eff6ff;' : 'background:#fff;');
        var name = v.full_name || '(no name)';
        var isMinor = v.type === 'minor';
        var badge = isMinor
          ? '<span style="font-size:0.65rem;font-weight:600;text-transform:uppercase;color:#3730a3;background:#e0e7ff;border-radius:0.25rem;padding:0.05rem 0.35rem;margin-left:0.4rem;">Minor</span>'
          : '';
        var sub = isMinor
          ? (v.guardian_email ? 'Guardian: ' + escapeHtml(v.guardian_email) : 'Minor')
          : (v.email ? escapeHtml(v.email) : '');
        item.innerHTML = '<div style="font-weight:600;color:#111827;">' + escapeHtml(name) + badge + '</div>' +
          (sub ? '<div style="color:#6b7280;font-size:0.8rem;">' + sub + '</div>' : '');
        item.addEventListener('mousedown', function (e) {
          // mousedown (not click) so it fires before input blur
          e.preventDefault();
          choose(v);
        });
        item.addEventListener('mouseenter', function () {
          activeIndex = idx;
          highlight();
        });
        dropdown.appendChild(item);
      });
      dropdown.style.display = 'block';
    }

    function highlight() {
      var items = dropdown.querySelectorAll('.volunteer-ac-item');
      for (var i = 0; i < items.length; i++) {
        items[i].style.background = (i === activeIndex) ? '#eff6ff' : '#fff';
      }
    }

    function choose(v) {
      hide();
      if (typeof options.onSelect === 'function') options.onSelect(v, directory);
    }

    function onInput() {
      var val = input.value;
      if (typeof options.onInput === 'function') options.onInput(val);
      loadDirectory().then(function () {
        activeIndex = -1;
        render(matches(directory, val));
      });
    }

    function onKeydown(e) {
      if (dropdown.style.display === 'none') return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIndex = Math.min(activeIndex + 1, currentMatches.length - 1);
        highlight();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIndex = Math.max(activeIndex - 1, 0);
        highlight();
      } else if (e.key === 'Enter') {
        if (activeIndex >= 0 && currentMatches[activeIndex]) {
          e.preventDefault();
          choose(currentMatches[activeIndex]);
        }
      } else if (e.key === 'Escape') {
        hide();
      }
    }

    function onBlur() {
      // Delay so a mousedown selection can complete first.
      setTimeout(hide, 150);
    }

    input.addEventListener('input', onInput);
    input.addEventListener('keydown', onKeydown);
    input.addEventListener('blur', onBlur);
    input.addEventListener('focus', function () { if (input.value) onInput(); });

    // Warm the cache so the first keystroke is instant.
    loadDirectory();

    return {
      destroy: function () {
        input.removeEventListener('input', onInput);
        input.removeEventListener('keydown', onKeydown);
        input.removeEventListener('blur', onBlur);
        hide();
      },
      refresh: function () { loaded = false; return loadDirectory(); }
    };
  }

  window.VolunteerAutocomplete = { attach: attach };
})();
