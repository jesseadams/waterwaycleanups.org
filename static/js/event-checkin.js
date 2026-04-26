/**
 * Event Check-In Kiosk
 * Self-service check-in for Raspberry Pi 7" touch display (1280x720)
 * 
 * Flow: Admin Login → Event Selection → Attendee Check-In
 * Uses existing EventsAPIClient + AuthClient for all API calls.
 */

(function () {
  'use strict';

  // ===== State =====
  let currentScreen = 'login';
  let selectedEvent = null;
  let attendees = [];
  let searchQuery = '';
  let successTimeout = null;
  let refreshInterval = null;

  // ===== DOM Helpers =====
  const $ = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));

  function show(el) { if (el) el.classList.add('active'); }
  function hide(el) { if (el) el.classList.remove('active'); }

  function showScreen(name) {
    $$('.checkin-screen').forEach(s => s.classList.remove('active'));
    const screen = $(`#screen-${name}`);
    if (screen) screen.classList.add('active');
    currentScreen = name;
  }

  function showMessage(text, type) {
    const el = $('#checkin-message');
    if (!el) return;
    el.textContent = text;
    el.className = `checkin-message checkin-message-${type}`;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 5000);
  }

  // ===== Screen: Admin Login =====
  function initLoginScreen() {
    const emailInput = $('#login-email');
    const codeInput = $('#login-code');
    const sendBtn = $('#login-send-code');
    const verifyBtn = $('#login-verify');
    const codeGroup = $('#login-code-group');

    // Check if already authenticated
    if (window.authClient && window.authClient.isAuthenticated()) {
      goToEventSelect();
      return;
    }

    sendBtn.addEventListener('click', async () => {
      const email = emailInput.value.trim().toLowerCase();
      if (!email) return;
      sendBtn.disabled = true;
      sendBtn.textContent = 'Sending...';
      try {
        await window.authClient.sendValidationCode(email);
        codeGroup.style.display = 'flex';
        codeInput.focus();
        showMessage('Code sent to your email', 'info');
      } catch (err) {
        showMessage(err.message || 'Failed to send code', 'error');
      } finally {
        sendBtn.disabled = false;
        sendBtn.textContent = 'Send Code';
      }
    });

    verifyBtn.addEventListener('click', async () => {
      const email = emailInput.value.trim().toLowerCase();
      const code = codeInput.value.trim();
      if (!email || !code) return;
      verifyBtn.disabled = true;
      verifyBtn.textContent = 'Verifying...';
      try {
        const result = await window.authClient.verifyCode(email, code);
        // Sync session token to EventsAPIClient
        if (window.eventsAPI && result.session_token) {
          window.eventsAPI.setSessionToken(result.session_token);
        }
        goToEventSelect();
      } catch (err) {
        showMessage(err.message || 'Invalid code', 'error');
      } finally {
        verifyBtn.disabled = false;
        verifyBtn.textContent = 'Verify & Continue';
      }
    });

    // Allow Enter key
    emailInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') sendBtn.click();
    });
    codeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') verifyBtn.click();
    });
  }

  // ===== Screen: Event Selection =====
  async function goToEventSelect() {
    showScreen('event-select');
    const list = $('#event-list');
    list.innerHTML = '<div style="text-align:center;padding:40px;"><div class="checkin-spinner" style="margin:0 auto;"></div><p style="margin-top:12px;color:#a0c080;">Loading events...</p></div>';

    try {
      // Initialize Events API if needed
      if (!window.eventsAPI && window.API_CONFIG) {
        window.eventsAPI = window.initializeEventsAPI(window.API_CONFIG.EVENTS_API_URL, null);
      }
      // Always sync the auth token to eventsAPI (AuthClient stores as 'auth_session_token')
      const token = localStorage.getItem('auth_session_token');
      if (token && window.eventsAPI) {
        window.eventsAPI.setSessionToken(token);
      }

      const data = await window.eventsAPI.getEvents({ status: 'active' });
      const events = (data.events || data || []);

      // Filter to today's and upcoming events, sorted by start_time
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const relevantEvents = events
        .filter(e => {
          if (!e.start_time) return false;
          const eventDate = new Date(e.start_time);
          // Show events from today onward (within next 7 days for relevance)
          const weekFromNow = new Date(todayStart);
          weekFromNow.setDate(weekFromNow.getDate() + 7);
          return eventDate >= todayStart && eventDate <= weekFromNow;
        })
        .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

      if (relevantEvents.length === 0) {
        list.innerHTML = '<div class="checkin-empty"><div class="checkin-empty-icon">📋</div><p>No upcoming events found in the next 7 days.</p></div>';
        return;
      }

      list.innerHTML = '';
      relevantEvents.forEach(event => {
        const card = document.createElement('button');
        card.className = 'event-select-card';
        const eventDate = new Date(event.start_time);
        const dateStr = eventDate.toLocaleDateString('en-US', {
          weekday: 'short', month: 'short', day: 'numeric'
        });
        const timeStr = eventDate.toLocaleTimeString('en-US', {
          hour: 'numeric', minute: '2-digit'
        });
        card.innerHTML = `
          <div class="event-icon">🌊</div>
          <div class="event-info">
            <div class="event-name">${escapeHtml(event.title || event.event_id)}</div>
            <div class="event-date">${dateStr} at ${timeStr}</div>
          </div>
          <div class="event-count">${event.rsvp_count || 0} RSVPs</div>
        `;
        card.addEventListener('click', () => selectEvent(event));
        list.appendChild(card);
      });
    } catch (err) {
      list.innerHTML = `<div class="checkin-empty"><div class="checkin-empty-icon">⚠️</div><p>Failed to load events: ${escapeHtml(err.message)}</p></div>`;
    }
  }

  // ===== Screen: Check-In =====
  async function selectEvent(event) {
    selectedEvent = event;
    showScreen('checkin');

    // Update header
    $('#checkin-event-name').textContent = event.title || event.event_id;

    // Set up search
    const searchInput = $('#checkin-search');
    searchInput.value = '';
    searchQuery = '';
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.trim().toLowerCase();
      renderAttendees();
    });

    // Walk-in button
    $('#walkin-btn').addEventListener('click', showWalkInForm);

    // Minor walk-in button
    $('#walkin-minor-btn').addEventListener('click', showMinorWalkInForm);

    // Back button
    $('#checkin-back-btn').addEventListener('click', () => {
      clearInterval(refreshInterval);
      goToEventSelect();
    });

    // Load attendees
    await loadAttendees();

    // Auto-refresh every 30 seconds
    refreshInterval = setInterval(loadAttendees, 30000);

    // Focus search
    searchInput.focus();
  }

  async function loadAttendees() {
    try {
      const data = await window.eventsAPI.getEventRSVPs(selectedEvent.event_id);
      attendees = (data.rsvps || data.attendees || []).map(a => ({
        id: a.attendee_id || a.email,
        firstName: a.first_name || '',
        lastName: a.last_name || '',
        email: a.email || '',
        guardianEmail: a.guardian_email || a.email || '',
        status: a.attendance_status || a.status || 'active',
        type: a.attendee_type || 'volunteer',
        age: a.age || null
      }));

      // Sort: pending first, then checked-in, then no-show
      const order = { active: 0, attended: 1, no_show: 2, cancelled: 3 };
      attendees.sort((a, b) => (order[a.status] || 0) - (order[b.status] || 0));

      updateStats();
      renderAttendees();
    } catch (err) {
      console.error('Failed to load attendees:', err);
      showMessage('Failed to load attendees', 'error');
    }
  }

  /**
   * Get minors linked to a guardian email for this event.
   */
  function getMinorsForGuardian(guardianEmail) {
    return attendees.filter(a =>
      a.type === 'minor' &&
      a.guardianEmail.toLowerCase() === guardianEmail.toLowerCase()
    );
  }

  function updateStats() {
    const total = attendees.filter(a => a.status !== 'cancelled').length;
    const checkedIn = attendees.filter(a => a.status === 'attended').length;
    $('#stat-checked-in').textContent = checkedIn;
    $('#stat-total').textContent = total;
  }

  function renderAttendees() {
    const list = $('#attendee-list');
    let filtered = attendees.filter(a => a.status !== 'cancelled');

    if (searchQuery) {
      filtered = filtered.filter(a => {
        const full = `${a.firstName} ${a.lastName} ${a.email}`.toLowerCase();
        return full.includes(searchQuery);
      });
    }

    if (filtered.length === 0) {
      list.innerHTML = searchQuery
        ? '<div class="checkin-empty"><div class="checkin-empty-icon">🔍</div><p>No matching attendees found</p></div>'
        : '<div class="checkin-empty"><div class="checkin-empty-icon">📋</div><p>No RSVPs yet</p></div>';
      return;
    }

    // Collect minor IDs that belong to a guardian in the list so we can
    // render them nested instead of as standalone cards.
    const nestedMinorIds = new Set();
    if (!searchQuery) {
      filtered.forEach(a => {
        if (a.type !== 'minor') {
          getMinorsForGuardian(a.email).forEach(m => nestedMinorIds.add(m.id));
        }
      });
    }

    list.innerHTML = '';
    filtered.forEach(a => {
      // Skip minors that will be shown nested under their guardian
      if (nestedMinorIds.has(a.id)) return;

      const card = document.createElement('div');
      const statusClass = a.status === 'attended' ? 'status-checked-in'
        : a.status === 'no_show' ? 'status-no-show'
        : 'status-pending';
      card.className = `checkin-attendee-card ${statusClass}`;

      const initials = ((a.firstName[0] || '') + (a.lastName[0] || '')).toUpperCase() || '?';
      const badgeClass = a.status === 'attended' ? 'badge-checked-in'
        : a.status === 'no_show' ? 'badge-no-show'
        : 'badge-pending';
      const badgeText = a.status === 'attended' ? '✓ Checked In'
        : a.status === 'no_show' ? 'No Show'
        : 'Tap to Check In';

      const typeLabel = a.type === 'minor' ? ` <span class="attendee-type-badge">Minor${a.age ? ', ' + a.age : ''}</span>` : '';

      card.innerHTML = `
        <div class="attendee-avatar">${initials}</div>
        <div class="attendee-info">
          <div class="attendee-name">${escapeHtml(a.firstName)} ${escapeHtml(a.lastName)}${typeLabel}</div>
          <div class="attendee-email">${escapeHtml(a.email)}</div>
        </div>
        <div class="attendee-status-badge ${badgeClass}">${badgeText}</div>
      `;

      if (a.status === 'active') {
        card.addEventListener('click', () => confirmCheckIn(a));
      }

      list.appendChild(card);

      // Render nested minors under this guardian (only when not searching)
      if (a.type !== 'minor' && !searchQuery) {
        const minors = getMinorsForGuardian(a.email).filter(m => m.status !== 'cancelled');
        minors.forEach(m => {
          const mCard = document.createElement('div');
          const mStatusClass = m.status === 'attended' ? 'status-checked-in'
            : m.status === 'no_show' ? 'status-no-show'
            : 'status-pending';
          mCard.className = `checkin-attendee-card checkin-minor-card ${mStatusClass}`;

          const mInitials = ((m.firstName[0] || '') + (m.lastName[0] || '')).toUpperCase() || '?';
          const mBadgeClass = m.status === 'attended' ? 'badge-checked-in'
            : m.status === 'no_show' ? 'badge-no-show'
            : 'badge-pending';
          const mBadgeText = m.status === 'attended' ? '✓ Checked In'
            : m.status === 'no_show' ? 'No Show'
            : 'Included';

          mCard.innerHTML = `
            <div class="minor-indent">↳</div>
            <div class="attendee-avatar minor-avatar">${mInitials}</div>
            <div class="attendee-info">
              <div class="attendee-name">${escapeHtml(m.firstName)} ${escapeHtml(m.lastName)} <span class="attendee-type-badge">Minor${m.age ? ', ' + m.age : ''}</span></div>
            </div>
            <div class="attendee-status-badge ${mBadgeClass}">${mBadgeText}</div>
          `;
          list.appendChild(mCard);
        });

        // Add minor button for this guardian
        const addMinorBtn = document.createElement('button');
        addMinorBtn.className = 'checkin-add-minor-btn';
        addMinorBtn.innerHTML = '↳ + Add Minor';
        addMinorBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          showMinorWalkInForm(a.email);
        });
        list.appendChild(addMinorBtn);
      }
    });
  }

  // ===== Confirm Check-In =====
  function confirmCheckIn(attendee) {
    const overlay = $('#confirm-overlay');

    // Find active minors linked to this guardian
    const activeMinors = attendee.type !== 'minor'
      ? getMinorsForGuardian(attendee.email).filter(m => m.status === 'active')
      : [];

    // Build confirmation message
    let nameHtml = `${escapeHtml(attendee.firstName)} ${escapeHtml(attendee.lastName)}`;
    if (activeMinors.length > 0) {
      const minorNames = activeMinors.map(m => escapeHtml(`${m.firstName} ${m.lastName}`));
      nameHtml += `<div class="confirm-minors">+ ${minorNames.join(', ')}</div>`;
    }
    $('#confirm-name').innerHTML = nameHtml;

    show(overlay);

    const confirmBtn = $('#confirm-yes');
    const cancelBtn = $('#confirm-no');

    // Remove old listeners by cloning
    const newConfirm = confirmBtn.cloneNode(true);
    const newCancel = cancelBtn.cloneNode(true);
    confirmBtn.replaceWith(newConfirm);
    cancelBtn.replaceWith(newCancel);

    newCancel.addEventListener('click', () => hide(overlay));
    newConfirm.addEventListener('click', async () => {
      newConfirm.disabled = true;
      newConfirm.textContent = 'Checking in...';
      try {
        // Check in the guardian/volunteer
        await window.eventsAPI.confirmAttendance(selectedEvent.event_id, attendee.id);

        // Check in all their active minors too
        for (const minor of activeMinors) {
          try {
            await window.eventsAPI.confirmAttendance(selectedEvent.event_id, minor.id);
          } catch (err) {
            console.error(`Failed to check in minor ${minor.firstName}:`, err);
          }
        }

        hide(overlay);
        const successLabel = activeMinors.length > 0
          ? `${attendee.firstName} + ${activeMinors.length} minor${activeMinors.length > 1 ? 's' : ''}`
          : attendee.firstName;
        showSuccess(successLabel, attendee.lastName);
        await loadAttendees();
      } catch (err) {
        showMessage(err.message || 'Check-in failed', 'error');
        hide(overlay);
      } finally {
        newConfirm.disabled = false;
        newConfirm.textContent = 'Check In';
      }
    });
  }

  // ===== Success Animation =====
  function showSuccess(firstName, lastName) {
    const screen = $('#success-screen');
    $('#success-name').textContent = `${firstName} ${lastName}`;
    show(screen);

    // Clear search
    const searchInput = $('#checkin-search');
    if (searchInput) {
      searchInput.value = '';
      searchQuery = '';
    }

    // Auto-dismiss after 3 seconds
    clearTimeout(successTimeout);
    successTimeout = setTimeout(() => {
      hide(screen);
      if (searchInput) searchInput.focus();
    }, 3000);

    // Tap to dismiss early
    screen.onclick = () => {
      clearTimeout(successTimeout);
      hide(screen);
      if (searchInput) searchInput.focus();
    };
  }

  // ===== Walk-In Form =====
  function showWalkInForm() {
    const overlay = $('#walkin-overlay');
    show(overlay);
    $('#walkin-first').value = '';
    $('#walkin-last').value = '';
    $('#walkin-email').value = '';
    $('#walkin-first').focus();

    const submitBtn = $('#walkin-submit');
    const cancelBtn = $('#walkin-cancel');

    const newSubmit = submitBtn.cloneNode(true);
    const newCancel = cancelBtn.cloneNode(true);
    submitBtn.replaceWith(newSubmit);
    cancelBtn.replaceWith(newCancel);

    newCancel.addEventListener('click', () => hide(overlay));
    newSubmit.addEventListener('click', async () => {
      const firstName = $('#walkin-first').value.trim();
      const lastName = $('#walkin-last').value.trim();
      const email = $('#walkin-email').value.trim();
      if (!firstName || !lastName) {
        showMessage('First and last name are required', 'error');
        return;
      }
      newSubmit.disabled = true;
      newSubmit.textContent = 'Adding...';
      try {
        await window.eventsAPI.addWalkIn(selectedEvent.event_id, firstName, lastName, email);
        hide(overlay);
        showSuccess(firstName, lastName);
        await loadAttendees();
      } catch (err) {
        showMessage(err.message || 'Failed to add walk-in', 'error');
      } finally {
        newSubmit.disabled = false;
        newSubmit.textContent = 'Add & Check In';
      }
    });
  }

  // ===== Minor Walk-In Form =====
  function showMinorWalkInForm(prefillGuardianEmail) {
    const overlay = $('#walkin-minor-overlay');
    show(overlay);
    $('#walkin-minor-first').value = '';
    $('#walkin-minor-last').value = '';
    $('#walkin-minor-dob').value = '';
    $('#walkin-minor-guardian').value = prefillGuardianEmail || '';
    $('#walkin-minor-first').focus();

    const submitBtn = $('#walkin-minor-submit');
    const cancelBtn = $('#walkin-minor-cancel');

    const newSubmit = submitBtn.cloneNode(true);
    const newCancel = cancelBtn.cloneNode(true);
    submitBtn.replaceWith(newSubmit);
    cancelBtn.replaceWith(newCancel);

    newCancel.addEventListener('click', () => hide(overlay));
    newSubmit.addEventListener('click', async () => {
      const firstName = $('#walkin-minor-first').value.trim();
      const lastName = $('#walkin-minor-last').value.trim();
      const dob = $('#walkin-minor-dob').value.trim();
      const guardianEmail = $('#walkin-minor-guardian').value.trim().toLowerCase();

      if (!firstName || !lastName) {
        showMessage('First and last name are required', 'error');
        return;
      }
      if (!dob) {
        showMessage('Date of birth is required', 'error');
        return;
      }
      // Validate age is under 18
      const dobDate = new Date(dob + 'T00:00:00');
      const today = new Date();
      let age = today.getFullYear() - dobDate.getFullYear();
      const monthDiff = today.getMonth() - dobDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dobDate.getDate())) {
        age--;
      }
      if (age < 0 || age >= 18) {
        showMessage('Minor must be under 18', 'error');
        return;
      }
      if (!guardianEmail) {
        showMessage("Guardian's email is required", 'error');
        return;
      }

      newSubmit.disabled = true;
      newSubmit.textContent = 'Adding...';
      try {
        const result = await window.eventsAPI.addMinor(selectedEvent.event_id, firstName, lastName, guardianEmail, dob);

        // If the guardian is already checked in, auto-check in the minor too
        const guardian = attendees.find(a => a.email.toLowerCase() === guardianEmail && a.type !== 'minor');
        if (guardian && guardian.status === 'attended' && result.attendee_id) {
          try {
            await window.eventsAPI.confirmAttendance(selectedEvent.event_id, result.attendee_id);
          } catch (err) {
            console.error('Failed to auto-check-in minor:', err);
          }
        }

        hide(overlay);
        showSuccess(firstName, `${lastName} (minor)`);
        await loadAttendees();
      } catch (err) {
        showMessage(err.message || 'Failed to add minor walk-in', 'error');
      } finally {
        newSubmit.disabled = false;
        newSubmit.textContent = 'Add Minor';
      }
    });
  }

  // ===== Utility =====
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  // ===== Kiosk Mode Toggle =====
  function enableKioskMode() {
    document.body.classList.add('kiosk-mode');
  }

  // Check URL param for kiosk mode
  function checkKioskParam() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('kiosk') === 'true') {
      enableKioskMode();
    }
  }

  // ===== Init =====
  document.addEventListener('DOMContentLoaded', () => {
    checkKioskParam();
    initLoginScreen();

    // Kiosk mode toggle button
    const kioskToggle = $('#kiosk-toggle');
    if (kioskToggle) {
      kioskToggle.addEventListener('click', () => {
        document.body.classList.toggle('kiosk-mode');
      });
    }

    // Prevent screen sleep on touch devices
    if ('wakeLock' in navigator) {
      navigator.wakeLock.request('screen').catch(() => {});
    }
  });
})();
