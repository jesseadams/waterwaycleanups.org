/**
 * Impact Page Map Renderer
 * Reads pre-generated impact data from a hidden DOM element, sorts cleanups
 * most-recent-first, and renders cleanup paths/zones on a Leaflet map along
 * with an event list and aggregate stats. A year range slider lets visitors
 * filter which cleanups are reflected in the map, list, and stats. Map lines
 * and areas are color-coded by how long ago the cleanup happened.
 */
(function() {
  'use strict';

  var IMPACT_DATA = window.IMPACT_DATA;
  if (!IMPACT_DATA || !IMPACT_DATA.templates) return;

  // Recency color scale: how long ago a cleanup happened determines the
  // color of its path/area on the map.
  var RECENCY_COLORS = {
    green: '#16a34a',  // < 4 months
    yellow: '#eab308', // 4-5 months
    orange: '#f97316', // 6-9 months
    red: '#dc2626',    // 9+ months
    unknown: '#9ca3af' // no date available
  };
  var MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30.4368;
  var now = new Date();

  var mapEl = document.getElementById('impact-public-map');
  var listEl = document.getElementById('impact-event-list');

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function getTemplate(ev) {
    var cacheKey = ev.impact_template + ':' + (ev.impact_template_version || 1);
    return IMPACT_DATA.templates[cacheKey];
  }

  function getYear(ev) {
    if (!ev.start_time) return null;
    var d = new Date(ev.start_time);
    if (isNaN(d.getTime())) return null;
    return d.getFullYear();
  }

  function monthsSince(ev) {
    if (!ev.start_time) return null;
    var d = new Date(ev.start_time);
    if (isNaN(d.getTime())) return null;
    return (now - d) / MS_PER_MONTH;
  }

  function recencyColor(ev) {
    var months = monthsSince(ev);
    if (months === null) return RECENCY_COLORS.unknown;
    if (months >= 9) return RECENCY_COLORS.red;
    if (months >= 6) return RECENCY_COLORS.orange;
    if (months >= 4) return RECENCY_COLORS.yellow;
    return RECENCY_COLORS.green;
  }

  function recencyLabel(ev) {
    var months = monthsSince(ev);
    if (months === null) return '';
    if (months >= 9) return 'Cleaned 9+ months ago';
    if (months >= 6) return 'Cleaned 6-9 months ago';
    if (months >= 4) return 'Cleaned 4-5 months ago';
    return 'Cleaned within the last 4 months';
  }

  // All events, sorted most-recent cleanup first.
  var allEvents = (IMPACT_DATA.events || []).slice().sort(function(a, b) {
    return new Date(b.start_time) - new Date(a.start_time);
  });

  // ---- Map setup (created once, layers redrawn on filter change) ----
  var map = null;
  var mapLayers = [];
  if (mapEl && window.L) {
    map = L.map('impact-public-map', { scrollWheelZoom: false }).setView([38.43, -77.40], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors', maxZoom: 19
    }).addTo(map);
  }

  function renderMap(events) {
    if (!map) return;
    mapLayers.forEach(function(layer) { map.removeLayer(layer); });
    mapLayers = [];

    var bounds = [];
    events.forEach(function(ev) {
      var tmpl = getTemplate(ev);
      if (!tmpl || !tmpl.features) return;

      var color = recencyColor(ev);
      var recency = recencyLabel(ev);
      var popupSuffix = recency ? '<br><span style="color:' + color + ';font-weight:600;">' + recency + '</span>' : '';

      var features = tmpl.features;
      if (features.zones) {
        features.zones.forEach(function(zone) {
          var layer = L.polygon(zone.coordinates, {
            color: color, weight: 3, opacity: 0.9,
            fillColor: color, fillOpacity: 0.2
          }).addTo(map).bindPopup('<strong>' + escapeHtml(ev.title) + '</strong><br>' + (zone.label || 'Focus Area') + popupSuffix);
          mapLayers.push(layer);
          zone.coordinates.forEach(function(c) { bounds.push(c); });
        });
      }
      if (features.paths) {
        features.paths.forEach(function(path) {
          var layer = L.polyline(path.coordinates, {
            color: color, weight: 5, opacity: 0.9
          }).addTo(map).bindPopup('<strong>' + escapeHtml(ev.title) + '</strong><br>' + (path.label || 'Cleanup Path') + popupSuffix);
          mapLayers.push(layer);
          path.coordinates.forEach(function(c) { bounds.push(c); });
        });
      }
    });

    if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [40, 40] });
    } else {
      map.setView([38.43, -77.40], 12);
    }
  }

  function renderList(events) {
    if (!listEl) return;
    listEl.innerHTML = '';
    events.forEach(function(ev) {
      var tmpl = getTemplate(ev);
      var miles = tmpl ? tmpl.estimated_miles.toFixed(1) + ' miles' : '';
      var date = ev.start_time ? new Date(ev.start_time).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric'
      }) : '';
      var cm = ev.cleanup_metrics || {};
      var metricBits = [];
      if (ev.attended_count) { metricBits.push(ev.attended_count + (ev.attended_count === 1 ? ' volunteer' : ' volunteers')); }
      if (cm.bags_of_trash) { metricBits.push(cm.bags_of_trash + ' bags'); }
      if (cm.number_of_tires) { metricBits.push(cm.number_of_tires + ' tires'); }
      if (cm.total_litter_lbs) { metricBits.push(cm.total_litter_lbs + ' lbs litter'); }
      var metricsHtml = metricBits.length
        ? '<div class="event-metrics">' + escapeHtml(metricBits.join(' • ')) + '</div>'
        : '';
      var milesHtml = miles ? '<div class="event-miles">' + miles + '</div>' : '';

      // Ad hoc events have no event page, so render a non-linking card with a
      // small badge rather than a link to a 404.
      var titleHtml = '<h3>' + escapeHtml(ev.title)
        + (ev.ad_hoc ? ' <span class="event-adhoc-badge">Community Cleanup</span>' : '')
        + '</h3>';
      var innerHtml = titleHtml
        + '<div class="event-date">' + date + '</div>'
        + metricsHtml
        + milesHtml;

      var card;
      if (ev.ad_hoc) {
        card = document.createElement('div');
        card.className = 'impact-event-card impact-event-card-adhoc';
      } else {
        var slug = ev.hugo_slug || ev.event_id;
        card = document.createElement('a');
        card.className = 'impact-event-card';
        card.href = '/events/' + slug + '/';
        card.style.textDecoration = 'none';
        card.style.color = 'inherit';
      }
      card.innerHTML = innerHtml;
      listEl.appendChild(card);
    });
  }

  function setStat(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function renderStats(events) {
    var totals = { cleanups: 0, miles: 0, volunteers: 0, bags_of_trash: 0, tires: 0, litter_lbs: 0 };
    events.forEach(function(ev) {
      var tmpl = getTemplate(ev);
      var cm = ev.cleanup_metrics || {};
      totals.cleanups += 1;
      totals.miles += tmpl ? (tmpl.estimated_miles || 0) : 0;
      totals.volunteers += ev.attended_count || 0;
      totals.bags_of_trash += Number(cm.bags_of_trash) || 0;
      totals.tires += Number(cm.number_of_tires) || 0;
      totals.litter_lbs += Number(cm.total_litter_lbs) || 0;
    });
    totals.miles = Math.round(totals.miles * 10) / 10;
    totals.litter_lbs = Math.round(totals.litter_lbs * 10) / 10;

    setStat('impact-stat-cleanups', totals.cleanups);
    setStat('impact-stat-miles', totals.miles);
    setStat('impact-stat-volunteers', totals.volunteers);
    setStat('impact-stat-bags', totals.bags_of_trash);
    setStat('impact-stat-tires', totals.tires);
    setStat('impact-stat-litter', totals.litter_lbs);
  }

  function renderAll(events) {
    renderStats(events);
    renderMap(events);
    renderList(events);
  }

  // ---- Year range slider ----
  var years = allEvents.map(getYear).filter(function(y) { return y !== null; });
  var minYear = years.length ? Math.min.apply(null, years) : new Date().getFullYear();
  var maxYear = years.length ? Math.max.apply(null, years) : new Date().getFullYear();

  var filterEl = document.getElementById('impact-year-filter');
  var minInput = document.getElementById('impact-year-slider-min');
  var maxInput = document.getElementById('impact-year-slider-max');
  var rangeEl = document.getElementById('impact-year-slider-range');
  var ticksEl = document.getElementById('impact-year-slider-ticks');
  var labelEl = document.getElementById('impact-year-range-label');
  var resetBtn = document.getElementById('impact-year-filter-reset');

  function eventsInRange(lo, hi) {
    return allEvents.filter(function(ev) {
      var y = getYear(ev);
      return y !== null && y >= lo && y <= hi;
    });
  }

  function updateRangeVisual(lo, hi) {
    if (!rangeEl) return;
    var span = maxYear - minYear;
    if (span <= 0) {
      rangeEl.style.left = '0%';
      rangeEl.style.right = '0%';
      return;
    }
    var leftPct = ((lo - minYear) / span) * 100;
    var rightPct = ((maxYear - hi) / span) * 100;
    rangeEl.style.left = leftPct + '%';
    rangeEl.style.right = rightPct + '%';
  }

  function updateLabel(lo, hi) {
    if (!labelEl) return;
    var isAllYears = (lo === minYear && hi === maxYear);
    labelEl.textContent = isAllYears
      ? 'All years'
      : (lo === hi ? String(lo) : lo + ' – ' + hi);
    if (resetBtn) resetBtn.disabled = isAllYears;
  }

  function applyRange(lo, hi) {
    updateRangeVisual(lo, hi);
    updateLabel(lo, hi);
    renderAll(eventsInRange(lo, hi));
  }

  function handleSliderChange() {
    var lo = parseInt(minInput.value, 10);
    var hi = parseInt(maxInput.value, 10);
    if (lo > hi) {
      // Keep the two thumbs from crossing by clamping whichever moved.
      if (this === minInput) { lo = hi; minInput.value = String(lo); }
      else { hi = lo; maxInput.value = String(hi); }
    }
    applyRange(lo, hi);
  }

  function handleReset() {
    minInput.value = String(minYear);
    maxInput.value = String(maxYear);
    applyRange(minYear, maxYear);
  }

  if (minInput && maxInput && filterEl) {
    if (minYear === maxYear) {
      // Only one year of data: hide the slider, nothing to filter.
      filterEl.style.display = 'none';
    } else {
      minInput.min = String(minYear);
      minInput.max = String(maxYear);
      minInput.value = String(minYear);
      maxInput.min = String(minYear);
      maxInput.max = String(maxYear);
      maxInput.value = String(maxYear);

      if (ticksEl) {
        ticksEl.innerHTML = '';
        for (var y = minYear; y <= maxYear; y++) {
          var tick = document.createElement('span');
          tick.textContent = String(y);
          ticksEl.appendChild(tick);
        }
      }

      updateRangeVisual(minYear, maxYear);
      updateLabel(minYear, maxYear);

      minInput.addEventListener('input', handleSliderChange);
      maxInput.addEventListener('input', handleSliderChange);
      if (resetBtn) resetBtn.addEventListener('click', handleReset);
    }
  }

  // Initial render shows all years.
  renderAll(allEvents);
})();
