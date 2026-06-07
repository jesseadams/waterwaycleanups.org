---
title: "Impact Map"
description: "See where our community cleanups have made a difference"
---

{{< brick_title >}}
# Our Impact Map
Every cleanup we've completed, mapped.
{{< /brick_title >}}

{{< brick_wide >}}

{{< impact_stats >}}

<div id="impact-public-map" style="height:500px;width:100%;border-radius:0.5rem;border:1px solid #e5e7eb;z-index:1;"></div>

<div class="impact-legend">
  <span class="legend-item"><span class="legend-line" style="background:#dc2626;"></span> Cleanup Path</span>
  <span class="legend-item"><span class="legend-dot" style="background:#dc2626;opacity:0.3;width:14px;height:14px;border:2px solid #dc2626;"></span> Focus Area</span>
</div>

<div class="impact-event-list" id="impact-event-list"></div>

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

{{< impact_data >}}

<style>
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
.impact-event-card .event-metrics { font-size: 0.8rem; color: #166534; font-weight: 600; margin-top: 0.25rem; }
.impact-event-card .event-miles { font-size: 0.8rem; color: #ea580c; font-weight: 600; }
</style>

<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
  integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
  crossorigin="" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
  integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo="
  crossorigin=""></script>
<script src="/js/impact-page.js"></script>

{{< /brick_wide >}}

{{< brick_cta >}}{{< /brick_cta >}}
