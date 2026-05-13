---
title: "Impact Map"
description: "See where our community cleanups have made a difference"
---

{{< brick_title >}}
# Our Impact Map
Every cleanup we've completed, mapped.
{{< /brick_title >}}

{{< brick_wide >}}
{{ $impact := .Site.Data.impact }}

<div class="impact-page" id="impact-map-root">

  <div class="impact-stats">
    <div class="stat">
      <div class="stat-value">{{ with $impact }}{{ .stats.cleanups }}{{ else }}—{{ end }}</div>
      <div class="stat-label">Cleanups</div>
    </div>
    <div class="stat">
      <div class="stat-value">{{ with $impact }}{{ .stats.miles }}{{ else }}—{{ end }}</div>
      <div class="stat-label">Miles Covered</div>
    </div>
    <div class="stat">
      <div class="stat-value">{{ with $impact }}{{ .stats.volunteers }}{{ else }}—{{ end }}</div>
      <div class="stat-label">Volunteer Check-ins</div>
    </div>
  </div>

  <div id="impact-public-map" style="height:500px;width:100%;border-radius:0.5rem;border:1px solid #e5e7eb;z-index:1;"></div>

  <div class="impact-legend">
    <span class="legend-item"><span class="legend-line" style="background:#ea580c;"></span> Cleanup Path</span>
    <span class="legend-item"><span class="legend-dot" style="background:#ea580c;opacity:0.3;width:14px;height:14px;border:2px solid #ea580c;"></span> Focus Area</span>
  </div>

  {{ with $impact }}
  <div class="impact-event-list">
    {{ range .events }}
    <div class="impact-event-card">
      <h3>{{ .title }}</h3>
      <div class="event-date">{{ dateFormat "Jan 2, 2006" .start_time }}</div>
      {{ $tmplKey := printf "%s:%v" .impact_template .impact_template_version }}
      {{ with index $impact.templates $tmplKey }}
      <div class="event-miles">{{ .estimated_miles }} miles</div>
      {{ end }}
    </div>
    {{ end }}
  </div>
  {{ end }}

  <!-- Impact Reports -->
  <div style="margin-top: 3rem;">
    <h2 style="font-size: 1.25rem; font-weight: 700; margin-bottom: 1rem;">📄 Impact Reports</h2>
    <div class="impact-event-list">
      <a href="/impact-report/" class="impact-event-card" style="text-decoration: none; color: inherit;">
        <h3>2025 Annual Impact Report</h3>
        <div class="event-date">Our inaugural year of community waterway cleanups</div>
        <div class="event-miles">View Report →</div>
      </a>
    </div>
  </div>
</div>

<style>
.impact-page { max-width: 1400px; margin: 0 auto; }
.impact-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
}
.impact-stats .stat {
  background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
  border-radius: 16px;
  padding: 2rem 1.5rem;
  text-align: center;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}
.impact-stats .stat:hover {
  transform: translateY(-3px);
  box-shadow: 0 15px 30px rgba(0, 0, 0, 0.12);
}
.impact-stats .stat-value {
  font-size: 3rem;
  font-weight: 900;
  line-height: 1;
  margin-bottom: 0.5rem;
  background: linear-gradient(135deg, #059669 0%, #047857 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.impact-stats .stat-label {
  font-size: 1rem;
  font-weight: 700;
  color: #1f2937;
}
.impact-legend {
  display: flex; gap: 1.5rem; flex-wrap: wrap; align-items: center;
  margin-top: 0.75rem; font-size: 0.8rem; color: #6b7280;
}
.impact-legend .legend-item { display: flex; align-items: center; gap: 0.3rem; }
.impact-legend .legend-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.impact-legend .legend-line { width: 16px; height: 3px; display: inline-block; border-radius: 2px; }
.impact-event-list {
  margin-top: 1.5rem; display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem;
}
.impact-event-card {
  padding: 1rem; border: 1px solid #e5e7eb; border-radius: 0.5rem;
  background: #fff; transition: box-shadow 0.2s;
}
.impact-event-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
.impact-event-card h3 { font-size: 0.95rem; font-weight: 600; margin: 0 0 0.25rem; }
.impact-event-card .event-date { font-size: 0.8rem; color: #6b7280; }
.impact-event-card .event-miles { font-size: 0.8rem; color: #ea580c; font-weight: 600; }
</style>

<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
  integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
  crossorigin="" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
  integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo="
  crossorigin=""></script>

<script>
(function() {
  var IMPACT_DATA = {{ $impact | jsonify | safeJS }};
  if (!IMPACT_DATA || !IMPACT_DATA.templates) return;

  var COLORS = { path: '#ea580c', zone: '#ea580c', zoneFill: '#ea580c' };
  var map = L.map('impact-public-map', { scrollWheelZoom: false }).setView([38.43, -77.40], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors', maxZoom: 19
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
          color: COLORS.zone, weight: 2, opacity: 0.6,
          fillColor: COLORS.zoneFill, fillOpacity: 0.1
        }).addTo(map).bindPopup('<strong>' + escapeHtml(ev.title) + '</strong><br>' + (zone.label || 'Focus Area'));
        zone.coordinates.forEach(function(c) { bounds.push(c); });
      });
    }
    if (features.paths) {
      features.paths.forEach(function(path) {
        L.polyline(path.coordinates, {
          color: COLORS.path, weight: 3, opacity: 0.7
        }).addTo(map).bindPopup('<strong>' + escapeHtml(ev.title) + '</strong><br>' + (path.label || 'Cleanup Path'));
        path.coordinates.forEach(function(c) { bounds.push(c); });
      });
    }
  });

  if (bounds.length > 1) { map.fitBounds(bounds, { padding: [40, 40] }); }
})();
</script>
{{< /brick_wide >}}

{{< brick_cta >}}{{< /brick_cta >}}
