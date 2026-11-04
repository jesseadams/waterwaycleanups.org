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
    yellow: '#facc15', // 4-5 months
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

  // All templates for an event (one per location). Falls back to the legacy
  // single-template fields for data generated before template_keys existed.
  function getTemplates(ev) {
    var keys = ev.template_keys;
    if (!keys || !keys.length) {
      if (!ev.impact_template) return [];
      keys = [ev.impact_template + ':' + (ev.impact_template_version || 1)];
    }
    return keys.map(function(k) { return IMPACT_DATA.templates[k]; })
      .filter(Boolean);
  }

  // Cleaned locations for an event as {name, template}. Uses the per-location
  // list from newer data (already limited to locations that had RSVPs);
  // otherwise falls back to the bare templates with no location name.
  function getLocationEntries(ev) {
    if (ev.locations && ev.locations.length) {
      return ev.locations.map(function(l) {
        return { name: l.name, template: IMPACT_DATA.templates[l.template_key] };
      }).filter(function(e) { return e.template; });
    }
    return getTemplates(ev).map(function(t) { return { name: '', template: t }; });
  }

  // Heading for an event card: the location name(s), falling back to the
  // event title when no location has a name.
  function eventHeading(ev) {
    var names = getLocationEntries(ev).map(function(e) { return e.name; })
      .filter(Boolean);
    return names.length ? names.join(' & ') : ev.title;
  }

  function eventMiles(ev) {
    return getLocationEntries(ev).reduce(function(sum, e) {
      var t = e.template;
      return sum + (parseFloat(t.estimated_miles) || 0);
    }, 0);
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

  // Draw order priority when cleanups overlap on the map: green (most
  // recent) should render on top of yellow, which renders on top of
  // orange, which renders on top of red (oldest). Layers added to Leaflet
  // later appear on top, so this is the ascending "add" order.
  var COLOR_DRAW_PRIORITY = {};
  COLOR_DRAW_PRIORITY[RECENCY_COLORS.unknown] = 0;
  COLOR_DRAW_PRIORITY[RECENCY_COLORS.red] = 1;
  COLOR_DRAW_PRIORITY[RECENCY_COLORS.orange] = 2;
  COLOR_DRAW_PRIORITY[RECENCY_COLORS.yellow] = 3;
  COLOR_DRAW_PRIORITY[RECENCY_COLORS.green] = 4;

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

    // Draw oldest (red) first and most recent (green) last so overlapping
    // paths/areas always show the freshest cleanup on top.
    var drawOrder = events.slice().sort(function(a, b) {
      return COLOR_DRAW_PRIORITY[recencyColor(a)] - COLOR_DRAW_PRIORITY[recencyColor(b)];
    });

    var bounds = [];
    drawOrder.forEach(function(ev) {
      var color = recencyColor(ev);
      var recency = recencyLabel(ev);
      var popupSuffix = recency ? '<br><span style="color:' + color + ';font-weight:600;">' + recency + '</span>' : '';

      getLocationEntries(ev).forEach(function(entry) {
      var tmpl = entry.template;
      if (!tmpl.features) return;
      var features = tmpl.features;
      var placeName = entry.name || ev.title;
      if (features.zones) {
        features.zones.forEach(function(zone) {
          var layer = L.polygon(zone.coordinates, {
            color: color, weight: 3, opacity: 0.9,
            fillColor: color, fillOpacity: 0.2
          }).addTo(map).bindPopup('<strong>' + escapeHtml(placeName) + '</strong><br>' + (zone.label || 'Focus Area') + popupSuffix);
          mapLayers.push(layer);
          zone.coordinates.forEach(function(c) { bounds.push(c); });
        });
      }
      if (features.paths) {
        features.paths.forEach(function(path) {
          var layer = L.polyline(path.coordinates, {
            color: color, weight: 5, opacity: 0.9
          }).addTo(map).bindPopup('<strong>' + escapeHtml(placeName) + '</strong><br>' + (path.label || 'Cleanup Path') + popupSuffix);
          mapLayers.push(layer);
          path.coordinates.forEach(function(c) { bounds.push(c); });
        });
      }
      });
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
      var evMiles = eventMiles(ev);
      var miles = evMiles > 0 ? evMiles.toFixed(1) + ' miles' : '';
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
      var titleHtml = '<h3>' + escapeHtml(eventHeading(ev))
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
    var uniqueVolunteerHashes = {};
    var uniqueVolunteerCount = 0;
    var hasHashData = false;
    events.forEach(function(ev) {
      var cm = ev.cleanup_metrics || {};
      totals.cleanups += 1;
      totals.miles += eventMiles(ev);
      totals.volunteers += ev.attended_count || 0;
      totals.bags_of_trash += Number(cm.bags_of_trash) || 0;
      totals.tires += Number(cm.number_of_tires) || 0;
      totals.litter_lbs += Number(cm.total_litter_lbs) || 0;

      // Unique volunteers are deduped by hashed email (no PII in the data
      // file). Events without hashes (older/ad hoc) can't be deduped, so
      // their attended count is added on top as a best-effort fallback.
      if (ev.volunteer_hashes && ev.volunteer_hashes.length) {
        hasHashData = true;
        ev.volunteer_hashes.forEach(function(hash) {
          if (!uniqueVolunteerHashes[hash]) {
            uniqueVolunteerHashes[hash] = true;
            uniqueVolunteerCount++;
          }
        });
        // A manually adjusted count can exceed the hashed RSVP attendees
        // (e.g. a scout event); count the untracked remainder as unique.
        if ((ev.attended_count || 0) > ev.volunteer_hashes.length) {
          uniqueVolunteerCount += ev.attended_count - ev.volunteer_hashes.length;
        }
      } else if (ev.attended_count) {
        uniqueVolunteerCount += ev.attended_count;
      }
    });
    totals.miles = Math.round(totals.miles * 10) / 10;
    totals.litter_lbs = Math.round(totals.litter_lbs * 10) / 10;

    setStat('impact-stat-cleanups', totals.cleanups);
    setStat('impact-stat-miles', totals.miles);
    setStat('impact-stat-volunteers', totals.volunteers);
    setStat('impact-stat-unique-volunteers', hasHashData ? uniqueVolunteerCount : totals.volunteers);
    setStat('impact-stat-bags', totals.bags_of_trash);
    setStat('impact-stat-tires', totals.tires);
    setStat('impact-stat-litter', totals.litter_lbs);
  }

  // ---- Graph: selected metric over time, for the filtered events ----
  var GRAPH_METRICS = [
    { key: 'cleanups', label: 'Cleanups', value: function() { return 1; } },
    { key: 'volunteers', label: 'Volunteers', value: function(ev) { return ev.attended_count || 0; } },
    { key: 'miles', label: 'Miles', value: function(ev) { return eventMiles(ev); }, decimals: 1 },
    { key: 'bags', label: 'Bags of trash', value: function(ev) { return Number((ev.cleanup_metrics || {}).bags_of_trash) || 0; } },
    { key: 'tires', label: 'Tires', value: function(ev) { return Number((ev.cleanup_metrics || {}).number_of_tires) || 0; } },
    { key: 'litter', label: 'Litter (lbs)', value: function(ev) { return Number((ev.cleanup_metrics || {}).total_litter_lbs) || 0; }, decimals: 1 }
  ];
  var MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var SVG_NS = 'http://www.w3.org/2000/svg';

  var graphToggle = document.getElementById('impact-graph-toggle');
  var graphPanel = document.getElementById('impact-graph-panel');
  var graphMetricsEl = document.getElementById('impact-graph-metrics');
  var graphChartEl = document.getElementById('impact-graph-chart');
  var graphNoteEl = document.getElementById('impact-graph-note');
  var graphCumulative = document.getElementById('impact-graph-cumulative');
  var graphOpen = false;
  var graphMetricKey = 'cleanups';
  var lastFilteredEvents = [];

  function roundTo(n, decimals) {
    var f = Math.pow(10, decimals || 0);
    return Math.round(n * f) / f;
  }

  function svgEl(name, attrs) {
    var el = document.createElementNS(SVG_NS, name);
    Object.keys(attrs || {}).forEach(function(k) { el.setAttribute(k, attrs[k]); });
    return el;
  }

  // Bucket events by month (or quarter when the span is longer than two
  // years) from the first to the last event, filling empty periods with 0.
  function buildBuckets(events, metric) {
    var dated = events.filter(function(ev) {
      return ev.start_time && !isNaN(new Date(ev.start_time).getTime());
    });
    if (!dated.length) return [];
    var times = dated.map(function(ev) { return new Date(ev.start_time); });
    var first = new Date(Math.min.apply(null, times));
    var last = new Date(Math.max.apply(null, times));
    var totalMonths = (last.getFullYear() - first.getFullYear()) * 12 + last.getMonth() - first.getMonth() + 1;
    var step = totalMonths > 24 ? 3 : 1;

    // Align the start to the beginning of a period
    var startMonth = step === 3 ? Math.floor(first.getMonth() / 3) * 3 : first.getMonth();
    var cursorYear = first.getFullYear();
    var cursor = startMonth;
    var buckets = [];
    var lastIndex = last.getFullYear() * 12 + last.getMonth();
    while (cursorYear * 12 + cursor <= lastIndex) {
      var label = step === 3
        ? 'Q' + (cursor / 3 + 1) + ' ' + cursorYear
        : MONTH_NAMES[cursor] + ' ' + cursorYear;
      buckets.push({ year: cursorYear, month: cursor, step: step, label: label, value: 0 });
      cursor += step;
      if (cursor >= 12) { cursor -= 12; cursorYear++; }
    }

    dated.forEach(function(ev) {
      var d = new Date(ev.start_time);
      var idx = d.getFullYear() * 12 + d.getMonth();
      for (var i = buckets.length - 1; i >= 0; i--) {
        var start = buckets[i].year * 12 + buckets[i].month;
        if (idx >= start) { buckets[i].value += metric.value(ev); break; }
      }
    });
    return buckets;
  }

  function renderGraph(events) {
    if (!graphChartEl) return;
    var metric = GRAPH_METRICS.filter(function(m) { return m.key === graphMetricKey; })[0] || GRAPH_METRICS[0];
    var buckets = buildBuckets(events, metric);
    graphChartEl.innerHTML = '';
    if (graphNoteEl) graphNoteEl.textContent = '';

    if (!buckets.length) {
      graphChartEl.textContent = 'No cleanups in the selected years.';
      return;
    }

    var cumulative = graphCumulative && graphCumulative.checked;
    var running = 0;
    var points = buckets.map(function(b) {
      running += b.value;
      return { label: b.label, value: roundTo(cumulative ? running : b.value, metric.decimals) };
    });

    var W = 720, H = 300, padL = 48, padR = 16, padT = 16, padB = 44;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    var maxVal = Math.max.apply(null, points.map(function(p) { return p.value; })) || 1;

    // Round the axis max up to a "nice" number
    var mag = Math.pow(10, Math.floor(Math.log(maxVal) / Math.LN10));
    var norm = maxVal / mag;
    var niceMax = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;

    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img',
      'aria-label': metric.label + ' over time' });

    for (var t = 0; t <= 4; t++) {
      var y = padT + plotH - (t / 4) * plotH;
      svg.appendChild(svgEl('line', { class: 'grid', x1: padL, x2: W - padR, y1: y, y2: y }));
      var tickText = svgEl('text', { x: padL - 6, y: y + 4, 'text-anchor': 'end' });
      tickText.textContent = roundTo((t / 4) * niceMax, niceMax < 10 ? 1 : 0);
      svg.appendChild(tickText);
    }

    var slot = plotW / points.length;
    var labelEvery = Math.ceil(points.length / 10);
    var linePts = [];

    points.forEach(function(p, i) {
      var h = (p.value / niceMax) * plotH;
      var x = padL + i * slot;
      var cx = x + slot / 2;
      var cy = padT + plotH - h;

      if (cumulative) {
        linePts.push(cx + ',' + cy);
        var dot = svgEl('circle', { class: 'dot', cx: cx, cy: cy, r: 3.5 });
        var dt = svgEl('title'); dt.textContent = p.label + ': ' + p.value;
        dot.appendChild(dt);
        svg.appendChild(dot);
      } else {
        var barW = Math.max(2, slot * 0.7);
        var bar = svgEl('rect', { class: 'bar', x: cx - barW / 2, y: cy, width: barW, height: Math.max(h, 0) });
        var bt = svgEl('title'); bt.textContent = p.label + ': ' + p.value;
        bar.appendChild(bt);
        svg.appendChild(bar);
      }

      if (i % labelEvery === 0) {
        var lbl = svgEl('text', { x: cx, y: H - padB + 16, 'text-anchor': 'middle' });
        lbl.textContent = p.label;
        svg.appendChild(lbl);
      }
    });

    if (cumulative && linePts.length > 1) {
      svg.insertBefore(svgEl('polyline', { class: 'line', points: linePts.join(' ') }),
        svg.querySelector('.dot'));
    }

    graphChartEl.appendChild(svg);
    if (graphNoteEl) {
      graphNoteEl.textContent = (buckets[0].step === 3 ? 'Grouped by quarter' : 'Grouped by month')
        + ', for the years selected above.';
    }
  }

  function setGraphOpen(open) {
    graphOpen = open;
    if (graphPanel) graphPanel.hidden = !open;
    if (graphToggle) {
      graphToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      graphToggle.textContent = open ? 'Hide graph' : 'See graph';
    }
    if (open) renderGraph(lastFilteredEvents);
  }

  function initGraph() {
    if (!graphToggle || !graphPanel || !graphMetricsEl) return;
    GRAPH_METRICS.forEach(function(m) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = m.label;
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', m.key === graphMetricKey ? 'true' : 'false');
      btn.addEventListener('click', function() {
        graphMetricKey = m.key;
        Array.prototype.forEach.call(graphMetricsEl.children, function(b) {
          b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
        });
        renderGraph(lastFilteredEvents);
      });
      graphMetricsEl.appendChild(btn);
    });
    graphToggle.addEventListener('click', function() { setGraphOpen(!graphOpen); });
    if (graphCumulative) {
      graphCumulative.addEventListener('change', function() { renderGraph(lastFilteredEvents); });
    }
  }

  function renderAll(events) {
    lastFilteredEvents = events;
    renderStats(events);
    renderMap(events);
    renderList(events);
    if (graphOpen) renderGraph(events);
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
      // Only one year of data: hide the slider controls (nothing to filter)
      // but keep the filter box so the graph toggle stays available.
      Array.prototype.forEach.call(filterEl.children, function(child) {
        if (child.id !== 'impact-graph-toggle' && child.id !== 'impact-graph-panel') {
          child.style.display = 'none';
        }
      });
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

  initGraph();

  // Initial render shows all years.
  renderAll(allEvents);
})();
