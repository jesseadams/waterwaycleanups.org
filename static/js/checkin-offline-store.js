/**
 * Check-In Offline Store
 *
 * Gives the /checkin kiosk an offline-first data layer:
 *   - On first load, the volunteer/minor directory and each event's RSVP
 *     list are cached to localStorage as they're fetched.
 *   - If a fetch fails (slow/no connection), cached data is served instead
 *     so search and the attendee list keep working.
 *   - Mutating actions (check-in, walk-in, add minor) are attempted over
 *     the network first. If that fails for a connectivity reason, the
 *     change is applied optimistically to the local cache and queued for
 *     background sync, instead of being lost or blocking the volunteer.
 *   - The queue is retried automatically (on an interval and when the
 *     browser comes back online) and is exposed via onChange()/getStatus()
 *     so the UI can show the volunteer what's queued and what's syncing.
 *
 * This module works by wrapping specific methods on an EventsAPIClient
 * instance (see init()), so the rest of event-checkin.js can keep calling
 * window.eventsAPI.confirmAttendance(...) etc. as before and transparently
 * get offline support.
 */
(function () {
  'use strict';

  const STORAGE_PREFIX = 'checkin_offline_v1_';
  const KEYS = {
    directory: STORAGE_PREFIX + 'directory',
    events: STORAGE_PREFIX + 'events', // { savedAt, data }
    attendees: STORAGE_PREFIX + 'attendees', // { [eventId]: { savedAt, data } }
    localRecords: STORAGE_PREFIX + 'local_records', // { [eventId]: [record] }
    statusPatches: STORAGE_PREFIX + 'status_patches', // { [eventId]: { [attendeeId]: patch } }
    queue: STORAGE_PREFIX + 'queue',
    localIdMap: STORAGE_PREFIX + 'local_id_map', // { [localId]: realId }
    meta: STORAGE_PREFIX + 'meta' // { lastSyncedAt }
  };

  // ===== Storage helpers =====
  function safeGet(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function safeSet(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn('CheckinOfflineStore: failed to persist', key, e);
      return false;
    }
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function genId(prefix) {
    const rand = Math.random().toString(36).slice(2, 8);
    return `${prefix}-${Date.now()}-${rand}`;
  }

  function computeAge(dob) {
    try {
      const dobDate = new Date(dob + 'T00:00:00');
      const today = new Date();
      let age = today.getFullYear() - dobDate.getFullYear();
      const monthDiff = today.getMonth() - dobDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dobDate.getDate())) age--;
      return age;
    } catch (e) {
      return null;
    }
  }

  // ===== Directory cache =====
  function saveDirectory(data) {
    safeSet(KEYS.directory, { savedAt: nowIso(), data: data || [] });
  }

  function loadDirectory() {
    const entry = safeGet(KEYS.directory, null);
    return entry ? entry.data : null;
  }

  // ===== Event list cache (so event selection works offline too) =====
  function saveEventsSnapshot(data) {
    safeSet(KEYS.events, { savedAt: nowIso(), data: data || null });
  }

  function loadEventsSnapshot() {
    const entry = safeGet(KEYS.events, null);
    return entry ? entry.data : null;
  }

  // ===== Attendee snapshot cache (per event, server-confirmed) =====
  function saveAttendeesSnapshot(eventId, list) {
    const all = safeGet(KEYS.attendees, {});
    all[eventId] = { savedAt: nowIso(), data: list || [] };
    safeSet(KEYS.attendees, all);
  }

  function loadAttendeesSnapshot(eventId) {
    const all = safeGet(KEYS.attendees, {});
    const entry = all[eventId];
    return entry ? entry.data : null;
  }

  // ===== Local (offline-created) records, pending sync =====
  function loadLocalRecords(eventId) {
    const all = safeGet(KEYS.localRecords, {});
    return all[eventId] || [];
  }

  function addLocalRecord(eventId, record) {
    const all = safeGet(KEYS.localRecords, {});
    all[eventId] = (all[eventId] || []).concat([record]);
    safeSet(KEYS.localRecords, all);
  }

  function updateLocalRecord(eventId, attendeeId, patch) {
    const all = safeGet(KEYS.localRecords, {});
    const list = all[eventId] || [];
    let changed = false;
    const next = list.map(r => {
      if (r.attendee_id === attendeeId) {
        changed = true;
        return Object.assign({}, r, patch);
      }
      return r;
    });
    if (changed) {
      all[eventId] = next;
      safeSet(KEYS.localRecords, all);
    }
  }

  function removeLocalRecord(eventId, attendeeId) {
    const all = safeGet(KEYS.localRecords, {});
    const list = all[eventId] || [];
    all[eventId] = list.filter(r => r.attendee_id !== attendeeId);
    safeSet(KEYS.localRecords, all);
  }

  function pruneSyncedLocalRecords(eventId) {
    const all = safeGet(KEYS.localRecords, {});
    const list = all[eventId] || [];
    all[eventId] = list.filter(r => r._pendingSync);
    safeSet(KEYS.localRecords, all);
  }

  // ===== Status patches (offline edits to pre-existing server records) =====
  function loadStatusPatches(eventId) {
    const all = safeGet(KEYS.statusPatches, {});
    return all[eventId] || {};
  }

  function setStatusPatch(eventId, attendeeId, patch) {
    const all = safeGet(KEYS.statusPatches, {});
    all[eventId] = all[eventId] || {};
    all[eventId][attendeeId] = patch;
    safeSet(KEYS.statusPatches, all);
  }

  function clearStatusPatch(eventId, attendeeId) {
    const all = safeGet(KEYS.statusPatches, {});
    if (all[eventId] && all[eventId][attendeeId]) {
      delete all[eventId][attendeeId];
      safeSet(KEYS.statusPatches, all);
    }
  }

  // ===== Local id -> real id map (for records created offline) =====
  function getRealId(localId) {
    const map = safeGet(KEYS.localIdMap, {});
    return map[localId] || null;
  }

  function setRealId(localId, realId) {
    const map = safeGet(KEYS.localIdMap, {});
    map[localId] = realId;
    safeSet(KEYS.localIdMap, map);
  }

  // ===== Merged read (snapshot + local records + status patch overlay) =====
  function getMergedAttendees(eventId) {
    const snapshot = loadAttendeesSnapshot(eventId);
    const localRecs = loadLocalRecords(eventId);
    if (!snapshot && localRecs.length === 0) return null;
    const patches = loadStatusPatches(eventId);
    const base = (snapshot || []).map(item => {
      const patch = patches[item.attendee_id];
      return patch ? Object.assign({}, item, patch) : item;
    });
    return base.concat(localRecs);
  }

  // ===== Queue persistence =====
  function loadQueue() {
    return safeGet(KEYS.queue, []);
  }

  function saveQueue(queue) {
    safeSet(KEYS.queue, queue);
  }

  function loadMeta() {
    return safeGet(KEYS.meta, { lastSyncedAt: null });
  }

  function saveMeta(meta) {
    safeSet(KEYS.meta, meta);
  }

  // Number of automatic retries a mutation gets (via backoff) before it's
  // parked as 'failed' and needs a human to retry/discard it. This matters
  // because a "definitive-looking" error on the first attempt is often not
  // actually permanent — e.g. DynamoDB GSI lookups used both by the
  // duplicate-check on write and by our own reconciliation read are
  // eventually consistent, so a record that was *just* written can briefly
  // fail to show up. Without a real retry budget, a single unlucky
  // eventual-consistency lag would strand the item until a manual click.
  const MAX_AUTO_RETRIES = 6;

  // ===== Error classification =====
  function isNetworkish(err) {
    if (!err) return true;
    const code = err.statusCode;
    if (code === undefined || code === null) return true;
    if (code === 0) return true; // NETWORK_ERROR from EventsAPIClient.makeRequest
    if (code >= 500) return true;
    if (code === 429) return true;
    return false;
  }

  // ===== The store =====
  function createStore() {
    let listeners = [];
    let syncing = false;
    let initialized = false;
    let flushTimer = null;
    let meta = loadMeta();
    let lastError = null;

    function notify() {
      const status = getStatus();
      listeners.forEach(cb => {
        try {
          cb(status);
        } catch (e) {
          console.error('CheckinOfflineStore listener error:', e);
        }
      });
    }

    function onChange(cb) {
      listeners.push(cb);
      return function unsubscribe() {
        listeners = listeners.filter(l => l !== cb);
      };
    }

    function getStatus() {
      const queue = loadQueue();
      return {
        online: navigator.onLine,
        syncing,
        pendingCount: queue.filter(i => i.status === 'pending' || i.status === 'syncing').length,
        failedCount: queue.filter(i => i.status === 'failed').length,
        totalCount: queue.length,
        lastSyncedAt: meta.lastSyncedAt,
        lastError
      };
    }

    function getQueueItems() {
      return loadQueue()
        .slice()
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    }

    function enqueue(item) {
      const queue = loadQueue();
      const full = Object.assign(
        {
          id: genId('q'),
          createdAt: nowIso(),
          attempts: 0,
          nextAttemptAt: nowIso(),
          status: 'pending',
          lastError: null
        },
        item
      );
      queue.push(full);
      saveQueue(queue);
      notify();
      return full;
    }

    function removeFromQueue(id) {
      saveQueue(loadQueue().filter(i => i.id !== id));
    }

    function patchQueueItem(id, patch) {
      const queue = loadQueue();
      const next = queue.map(i => (i.id === id ? Object.assign({}, i, patch) : i));
      saveQueue(next);
    }

    function backoffMs(attempts) {
      return Math.min(30000, 2000 * Math.pow(2, attempts));
    }

    function isBlockedByDependency(item) {
      if (item.type !== 'confirmAttendance') return false;
      const id = item.payload.attendeeId;
      if (!id || !id.startsWith('local-')) return false;
      return !getRealId(id);
    }

    function resolveDependencies(item) {
      if (item.type === 'confirmAttendance' && item.payload.attendeeId && item.payload.attendeeId.startsWith('local-')) {
        const real = getRealId(item.payload.attendeeId);
        if (real) {
          item.payload = Object.assign({}, item.payload, { attendeeId: real });
        }
      }
      return item;
    }

    function onItemSynced(api, item, result) {
      if (item.type === 'addWalkIn' || item.type === 'addMinor') {
        const realId = result && result.attendee_id;
        if (realId && item.localAttendeeId) {
          setRealId(item.localAttendeeId, realId);
          updateLocalRecord(item.eventId, item.localAttendeeId, {
            attendee_id: realId,
            _pendingSync: false
          });
        }
      } else if (item.type === 'confirmAttendance') {
        clearStatusPatch(item.eventId, item.payload.attendeeId);
        updateLocalRecord(item.eventId, item.payload.attendeeId, {
          status: 'attended',
          no_show: false,
          _pendingSync: false
        });
      }
      removeFromQueue(item.id);
      meta = { lastSyncedAt: nowIso() };
      saveMeta(meta);
      lastError = null;
    }

    /**
     * Check whether the change this queue item represents is already
     * reflected on the server. This handles the "lost response" case: the
     * mutation actually succeeded (e.g. right as the connection was
     * flickering back on), but the browser never received the success
     * response and treated it as a failure. Retrying the identical request
     * then fails a second time for a *different*, deterministic reason
     * (a duplicate/conflict check, or a validation error that happens to
     * also match "already exists") — which otherwise looks like a
     * permanently stuck sync item that "mysteriously" resolves on reload,
     * because reload re-fetches real server state while the stuck queue
     * item never did.
     *
     * Returns { checked: false } if a fresh read of the server couldn't be
     * obtained (e.g. the connection is still flaky right now) — this is
     * NOT the same as "not found", and must not be treated as a real
     * failure, or a merely-inconclusive check would wrongly discard a
     * change that actually did succeed.
     *
     * Otherwise returns { checked: true, found: <attendee_id> | true | null },
     * where `found` is the matching server attendee_id (or `true` for
     * confirmAttendance, which doesn't need one), or null if a fresh read
     * was obtained but genuinely contains no matching record.
     */
    async function reconcileAgainstServer(api, item) {
      if (!api || typeof api.getEventRSVPs !== 'function' || !api.getEventRSVPs.__original) {
        return { checked: false };
      }
      let rows;
      try {
        const data = await api.getEventRSVPs.__original(item.eventId);
        rows = data.rsvps || data.attendees || [];
      } catch (e) {
        return { checked: false }; // Can't reconcile without a fresh read.
      }

      if (item.type === 'confirmAttendance') {
        const id = item.payload.attendeeId;
        const match = rows.find(r => r.attendee_id === id);
        return { checked: true, found: match && match.status === 'attended' ? true : null };
      }

      if (item.type === 'addWalkIn') {
        const email = (item.payload.email || '').toLowerCase();
        if (email) {
          const match = rows.find(r => (r.email || '').toLowerCase() === email && r.walk_in);
          return { checked: true, found: match ? match.attendee_id : null };
        }
        // No email was provided, so the server generates a non-deterministic
        // id — match on name + walk-in flag + recent creation as a best effort.
        const first = item.payload.firstName.toLowerCase();
        const last = item.payload.lastName.toLowerCase();
        const cutoff = new Date(item.createdAt).getTime() - 60000;
        const match = rows.find(r =>
          r.walk_in &&
          !r.email &&
          (r.first_name || '').toLowerCase() === first &&
          (r.last_name || '').toLowerCase() === last &&
          r.created_at && new Date(r.created_at).getTime() >= cutoff
        );
        return { checked: true, found: match ? match.attendee_id : null };
      }

      if (item.type === 'addMinor') {
        const guardianEmail = (item.payload.guardianEmail || '').toLowerCase();
        const first = item.payload.firstName.toLowerCase();
        const last = item.payload.lastName.toLowerCase();
        const match = rows.find(r =>
          r.attendee_type === 'minor' &&
          (r.guardian_email || '').toLowerCase() === guardianEmail &&
          (r.first_name || '').toLowerCase() === first &&
          (r.last_name || '').toLowerCase() === last
        );
        return { checked: true, found: match ? match.attendee_id : null };
      }

      return { checked: true, found: null };
    }

    async function onItemFailed(api, item, err) {
      item.attempts += 1;
      item.lastError = (err && err.message) || 'Sync failed';

      // Benign duplicate: someone already has an RSVP for this event.
      // Drop the queued item and its local placeholder rather than
      // surfacing a scary permanent error for something harmless.
      if (item.type === 'addWalkIn' && err && err.statusCode === 409) {
        removeFromQueue(item.id);
        if (item.localAttendeeId) removeLocalRecord(item.eventId, item.localAttendeeId);
        return { stop: false };
      }

      if (isNetworkish(err)) {
        patchQueueItem(item.id, {
          status: 'pending',
          attempts: item.attempts,
          lastError: item.lastError,
          nextAttemptAt: new Date(Date.now() + backoffMs(item.attempts)).toISOString()
        });
        lastError = item.lastError;
        return { stop: true };
      }

      // Before declaring this a real failure, check whether the change
      // already made it to the server (the request succeeded but its
      // response was lost). If so, treat it as synced instead of stuck.
      const reconcileResult = await reconcileAgainstServer(api, item);

      if (reconcileResult.checked && reconcileResult.found) {
        onItemSynced(api, item, { attendee_id: reconcileResult.found === true ? undefined : reconcileResult.found });
        return { stop: false };
      }

      // Either the reconciliation read itself couldn't complete (network
      // still unsettled), or it completed but found nothing yet. Neither
      // is trustworthy as a *permanent* failure on the first few tries:
      // the read may be hitting an eventually-consistent index that just
      // hasn't caught up, or the connection may still be flaky. Keep
      // retrying automatically (with backoff) up to MAX_AUTO_RETRIES
      // before parking it as 'failed' for a human to look at.
      if (item.attempts < MAX_AUTO_RETRIES) {
        patchQueueItem(item.id, {
          status: 'pending',
          attempts: item.attempts,
          lastError: item.lastError,
          nextAttemptAt: new Date(Date.now() + backoffMs(item.attempts)).toISOString()
        });
        lastError = item.lastError;
        return { stop: !reconcileResult.checked };
      }

      // Retry budget exhausted with no confirmation the change ever
      // landed — this needs a human to look at it.
      patchQueueItem(item.id, {
        status: 'failed',
        attempts: item.attempts,
        lastError: item.lastError
      });
      return { stop: false };
    }

    async function processItem(api, item) {
      resolveDependencies(item);
      patchQueueItem(item.id, { status: 'syncing' });
      notify();
      try {
        let result;
        if (item.type === 'confirmAttendance') {
          result = await api.confirmAttendance.__original(item.eventId, item.payload.attendeeId);
        } else if (item.type === 'addWalkIn') {
          result = await api.addWalkIn.__original(
            item.eventId,
            item.payload.firstName,
            item.payload.lastName,
            item.payload.email
          );
        } else if (item.type === 'addMinor') {
          result = await api.addMinor.__original(
            item.eventId,
            item.payload.firstName,
            item.payload.lastName,
            item.payload.guardianEmail,
            item.payload.dateOfBirth
          );
        } else {
          removeFromQueue(item.id);
          return { stop: false };
        }
        onItemSynced(api, item, result);
        return { stop: false };
      } catch (err) {
        return await onItemFailed(api, item, err);
      } finally {
        notify();
      }
    }

    async function flushQueue(api) {
      if (!api || syncing) return;
      if (!navigator.onLine) {
        notify();
        return;
      }
      syncing = true;
      notify();
      try {
        const items = loadQueue().filter(i => i.status === 'pending');
        for (const item of items) {
          if (item.nextAttemptAt && new Date(item.nextAttemptAt) > new Date()) continue;
          if (isBlockedByDependency(item)) continue;
          const outcome = await processItem(api, item);
          if (outcome && outcome.stop) break;
        }
      } finally {
        syncing = false;
        notify();
      }
    }

    function retryQueueItem(api, id) {
      // Reset the attempt count too, so a manual retry gets a full fresh
      // auto-retry budget afterward instead of being re-parked as 'failed'
      // after a single additional try.
      patchQueueItem(id, { status: 'pending', attempts: 0, nextAttemptAt: nowIso(), lastError: null });
      notify();
      flushQueue(api);
    }

    function dismissQueueItem(id) {
      const queue = loadQueue();
      const item = queue.find(i => i.id === id);
      if (!item) return;

      if ((item.type === 'addWalkIn' || item.type === 'addMinor') && item.localAttendeeId) {
        removeLocalRecord(item.eventId, item.localAttendeeId);
        // Also drop any queued confirmAttendance depending on this same
        // local record (e.g. auto-check-in of a minor whose walk-in add
        // just got discarded) — it can never resolve without a real id.
        const dependents = queue.filter(
          q => q.type === 'confirmAttendance' && q.payload && q.payload.attendeeId === item.localAttendeeId
        );
        dependents.forEach(dep => removeFromQueue(dep.id));
      }
      removeFromQueue(id);
      notify();
    }

    // ===== Wrapped API methods =====
    function wrapMethod(api, name, factory) {
      const original = api[name].bind(api);
      const wrapped = factory(original);
      wrapped.__original = original;
      api[name] = wrapped;
    }

    function wrapGetVolunteerDirectory(original) {
      return async function (force) {
        try {
          const data = await original(force);
          saveDirectory(data);
          lastError = null;
          notify();
          return data;
        } catch (err) {
          const cached = loadDirectory();
          if (cached) {
            lastError = 'Showing cached volunteer directory (offline)';
            notify();
            return cached;
          }
          throw err;
        }
      };
    }

    function wrapGetEvents(original) {
      return async function (filters) {
        try {
          const data = await original(filters);
          saveEventsSnapshot(data);
          lastError = null;
          notify();
          return data;
        } catch (err) {
          const cached = loadEventsSnapshot();
          if (cached) {
            lastError = 'Showing cached event list (offline)';
            notify();
            return cached;
          }
          throw err;
        }
      };
    }

    function wrapGetEventRSVPs(api) {
      return function (original) {
        return async function (eventId) {
          try {
            const data = await original(eventId);
            const list = data.rsvps || data.attendees || [];
            saveAttendeesSnapshot(eventId, list);
            pruneSyncedLocalRecords(eventId);
            lastError = null;
            notify();
            return data;
          } catch (err) {
            const merged = getMergedAttendees(eventId);
            if (merged) {
              lastError = 'Showing cached attendee list (offline)';
              notify();
              return { rsvps: merged, _offline: true };
            }
            throw err;
          }
        };
      };
    }

    function wrapConfirmAttendance(original) {
      return async function (eventId, attendeeId, label) {
        // A local-* id was created offline and hasn't been assigned a real
        // server id yet — there's no point attempting the network call.
        const isLocalId = typeof attendeeId === 'string' && attendeeId.startsWith('local-');
        if (navigator.onLine && !isLocalId) {
          try {
            const result = await original(eventId, attendeeId);
            clearStatusPatch(eventId, attendeeId);
            updateLocalRecord(eventId, attendeeId, { status: 'attended', no_show: false, _pendingSync: false });
            notify();
            return result;
          } catch (err) {
            if (!isNetworkish(err)) throw err;
          }
        }
        setStatusPatch(eventId, attendeeId, { status: 'attended', no_show: false, updated_at: nowIso() });
        updateLocalRecord(eventId, attendeeId, { status: 'attended', no_show: false });
        const item = enqueue({
          type: 'confirmAttendance',
          eventId,
          payload: { attendeeId },
          description: label ? `Check in ${label}` : 'Check in attendee'
        });
        return { success: true, queued: true, attendee_id: attendeeId, queueId: item.id };
      };
    }

    function wrapAddWalkIn(original) {
      return async function (eventId, firstName, lastName, email) {
        if (navigator.onLine) {
          try {
            const result = await original(eventId, firstName, lastName, email);
            notify();
            return result;
          } catch (err) {
            if (!isNetworkish(err)) throw err;
          }
        }
        const localId = genId('local-walkin');
        addLocalRecord(eventId, {
          attendee_id: localId,
          attendee_type: 'volunteer',
          status: 'attended',
          first_name: firstName,
          last_name: lastName,
          email: email || '',
          guardian_email: email || '',
          no_show: false,
          walk_in: true,
          _pendingSync: true,
          created_at: nowIso(),
          updated_at: nowIso()
        });
        const item = enqueue({
          type: 'addWalkIn',
          eventId,
          payload: { firstName, lastName, email: email || '' },
          localAttendeeId: localId,
          description: `Add walk-in ${firstName} ${lastName}`.trim()
        });
        return { success: true, queued: true, attendee_id: localId, queueId: item.id };
      };
    }

    function wrapAddMinor(original) {
      return async function (eventId, firstName, lastName, guardianEmail, dateOfBirth) {
        if (navigator.onLine) {
          try {
            const result = await original(eventId, firstName, lastName, guardianEmail, dateOfBirth);
            notify();
            return result;
          } catch (err) {
            if (!isNetworkish(err)) throw err;
          }
        }
        const localId = genId('local-minor');
        addLocalRecord(eventId, {
          attendee_id: localId,
          attendee_type: 'minor',
          status: 'active',
          first_name: firstName,
          last_name: lastName,
          email: guardianEmail,
          guardian_email: guardianEmail,
          date_of_birth: dateOfBirth,
          age: computeAge(dateOfBirth),
          no_show: false,
          walk_in: true,
          _pendingSync: true,
          created_at: nowIso(),
          updated_at: nowIso()
        });
        const item = enqueue({
          type: 'addMinor',
          eventId,
          payload: { firstName, lastName, guardianEmail, dateOfBirth },
          localAttendeeId: localId,
          description: `Add minor ${firstName} ${lastName}`.trim()
        });
        return { success: true, queued: true, attendee_id: localId, queueId: item.id };
      };
    }

    function init(api) {
      if (initialized || !api) return self;
      initialized = true;

      wrapMethod(api, 'getEvents', wrapGetEvents);
      wrapMethod(api, 'getVolunteerDirectory', wrapGetVolunteerDirectory);
      wrapMethod(api, 'getEventRSVPs', wrapGetEventRSVPs(api));
      wrapMethod(api, 'confirmAttendance', wrapConfirmAttendance);
      wrapMethod(api, 'addWalkIn', wrapAddWalkIn);
      wrapMethod(api, 'addMinor', wrapAddMinor);

      window.addEventListener('online', () => {
        notify();
        flushQueue(api);
      });
      window.addEventListener('offline', () => notify());

      flushTimer = setInterval(() => flushQueue(api), 20000);
      // Pick up any queue left over from a previous session shortly after load.
      setTimeout(() => flushQueue(api), 2000);

      return self;
    }

    function primeCaches(api) {
      if (!api) return;
      // Fire-and-forget: warms the local cache so search/lookup works even
      // if connectivity drops moments later. Failures are ignored here —
      // the wrapped methods already fall back to whatever is cached.
      if (typeof api.getVolunteerDirectory === 'function') {
        api.getVolunteerDirectory().catch(() => {});
      }
      if (typeof api.getEvents === 'function') {
        api.getEvents({ status: 'active' }).catch(() => {});
      }
    }

    function primeEventAttendees(api, eventId) {
      if (!api || !eventId) return;
      if (typeof api.getEventRSVPs === 'function') {
        api.getEventRSVPs(eventId).catch(() => {});
      }
    }

    const self = {
      init,
      primeCaches,
      primeEventAttendees,
      onChange,
      getStatus,
      getQueueItems,
      flushQueue,
      retryQueueItem,
      dismissQueueItem
    };

    return self;
  }

  window.CheckinOfflineStore = createStore();
})();
