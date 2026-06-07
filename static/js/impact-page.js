/**
 * Impact Page Map Renderer
 * Reads pre-generated impact data from a hidden DOM element and renders
 * cleanup paths and zones on a Leaflet map.
 */
(function() {
  'use strict';

  var IMPACT_DATA = window.IMPACT_DATA;
  if (!IMPACT_DATA || !IMPACT_DATA.templates) return;

  var COLORS = { path: '#dc2626', zone: '#dc2626', zoneFill: '#dc2626' };
  var mapEl = document.getElementById('impact-public-map');
  if (!mapEl) return;

  var map = L.map('impact-public-map', { scrollWheelZoom: false }).setView([38.43, -77.40], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors', maxZoom: 19
  }).addTo(map);

  var bounds = [];

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  IMPACT_DATA.events.forEach(function(ev) {
    var cacheKey = ev.impact_template + ':' + (ev.impact_template_version || 1);
    var tmpl = IMPACT_DATA.templates[cacheKey];
    if (!tmpl || !tmpl.features) return;

    var features = tmpl.features;
    if (features.zones) {
      features.zones.forEach(function(zone) {
        L.polygon(zone.coordinates, {
          color: COLORS.zone, weight: 3, opacity: 0.9,
          fillColor: COLORS.zoneFill, fillOpacity: 0.2
        }).addTo(map).bindPopup('<strong>' + escapeHtml(ev.title) + '</strong><br>' + (zone.label || 'Focus Area'));
        zone.coordinates.forEach(function(c) { bounds.push(c); });
      });
    }
    if (features.paths) {
      features.paths.forEach(function(path) {
        L.polyline(path.coordinates, {
          color: COLORS.path, weight: 5, opacity: 0.9
        }).addTo(map).bindPopup('<strong>' + escapeHtml(ev.title) + '</strong><br>' + (path.label || 'Cleanup Path'));
        path.coordinates.forEach(function(c) { bounds.push(c); });
      });
    }
  });

  if (bounds.length > 1) { map.fitBounds(bounds, { padding: [40, 40] }); }

  // Render event cards
  var listEl = document.getElementById('impact-event-list');
  if (listEl) {
    IMPACT_DATA.events.forEach(function(ev) {
      var cacheKey = ev.impact_template + ':' + (ev.impact_template_version || 1);
      var tmpl = IMPACT_DATA.templates[cacheKey];
      var miles = tmpl ? tmpl.estimated_miles.toFixed(1) + ' miles' : '';
      var date = ev.start_time ? new Date(ev.start_time).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric'
      }) : '';
      var cm = ev.cleanup_metrics || {};
      var metricBits = [];
      if (cm.bags_of_trash) { metricBits.push(cm.bags_of_trash + ' bags'); }
      if (cm.number_of_tires) { metricBits.push(cm.number_of_tires + ' tires'); }
      if (cm.total_litter_lbs) { metricBits.push(cm.total_litter_lbs + ' lbs litter'); }
      var metricsHtml = metricBits.length
        ? '<div class="event-metrics">' + escapeHtml(metricBits.join(' • ')) + '</div>'
        : '';
      var milesHtml = miles ? '<div class="event-miles">' + miles + '</div>' : '';
      var slug = ev.hugo_slug || ev.event_id;
      var card = document.createElement('a');
      card.className = 'impact-event-card';
      card.href = '/events/' + slug + '/';
      card.style.textDecoration = 'none';
      card.style.color = 'inherit';
      card.innerHTML = '<h3>' + escapeHtml(ev.title) + '</h3>'
        + '<div class="event-date">' + date + '</div>'
        + metricsHtml
        + milesHtml;
      listEl.appendChild(card);
    });
  }
})();
