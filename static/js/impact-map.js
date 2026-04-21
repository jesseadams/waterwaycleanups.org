/**
 * Impact Map Viewer
 * 
 * Renders cleanup impact maps using Leaflet.js.
 * Displays parking areas (blue dots), cleanup paths (orange lines),
 * and focus zones (orange polygons) from impact template data.
 */

(function () {
  'use strict';

  const COLORS = {
    parking: '#2563eb',    // blue-600
    path: '#ea580c',       // orange-600
    zone: '#ea580c',       // orange-600
    zoneFill: '#ea580c',
    meetingSpot: '#eab308'  // yellow-500
  };

  /**
   * Calculate distance between two [lat, lng] points using Haversine formula.
   * Returns distance in miles.
   */
  function haversineDistance(coord1, coord2) {
    const R = 3958.8; // Earth radius in miles
    const lat1 = coord1[0] * Math.PI / 180;
    const lat2 = coord2[0] * Math.PI / 180;
    const dLat = (coord2[0] - coord1[0]) * Math.PI / 180;
    const dLng = (coord2[1] - coord1[1]) * Math.PI / 180;

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1) * Math.cos(lat2) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Calculate total path length in miles from an array of coordinates.
   */
  function calculatePathMiles(coordinates) {
    let total = 0;
    for (let i = 1; i < coordinates.length; i++) {
      total += haversineDistance(coordinates[i - 1], coordinates[i]);
    }
    return total;
  }

  /**
   * Calculate the perimeter of a polygon in miles.
   */
  function calculatePolygonPerimeter(coordinates) {
    let total = 0;
    for (let i = 1; i < coordinates.length; i++) {
      total += haversineDistance(coordinates[i - 1], coordinates[i]);
    }
    // Close the polygon
    if (coordinates.length > 2) {
      total += haversineDistance(coordinates[coordinates.length - 1], coordinates[0]);
    }
    return total;
  }

  /**
   * Calculate estimated impact miles from template features.
   * Sums path lengths + polygon perimeters.
   */
  function calculateEstimatedMiles(features) {
    let total = 0;
    if (features.paths) {
      features.paths.forEach(function (path) {
        total += calculatePathMiles(path.coordinates);
      });
    }
    if (features.zones) {
      features.zones.forEach(function (zone) {
        total += calculatePolygonPerimeter(zone.coordinates);
      });
    }
    return Math.round(total * 100) / 100;
  }

  /**
   * Render an impact map into a container element.
   */
  function renderImpactMap(container, templateData) {
    var mapEl = container.querySelector('.impact-map-canvas');
    if (!mapEl || !templateData) return;

    var map = L.map(mapEl, {
      scrollWheelZoom: false
    }).setView(templateData.center, templateData.zoom || 14);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(map);

    var features = templateData.features;
    var bounds = [];

    // Render parking areas as blue circle markers
    if (features.parking) {
      features.parking.forEach(function (spot) {
        var marker = L.circleMarker(spot.coordinates, {
          radius: 10,
          fillColor: COLORS.parking,
          color: '#1e40af',
          weight: 2,
          opacity: 1,
          fillOpacity: 0.8
        }).addTo(map);

        marker.bindPopup(
          '<div class="impact-popup">' +
          '<span class="impact-popup-icon" style="color:' + COLORS.parking + '">&#9679;</span> ' +
          '<strong>Parking</strong><br>' + spot.label +
          '</div>'
        );

        bounds.push(spot.coordinates);
      });
    }

    // Render cleanup paths as orange polylines
    if (features.paths) {
      features.paths.forEach(function (path) {
        var polyline = L.polyline(path.coordinates, {
          color: COLORS.path,
          weight: 4,
          opacity: 0.85,
          dashArray: null
        }).addTo(map);

        var miles = calculatePathMiles(path.coordinates);
        polyline.bindPopup(
          '<div class="impact-popup">' +
          '<strong>Cleanup Path</strong><br>' +
          path.label + '<br>' +
          '<span class="impact-popup-miles">' + miles.toFixed(2) + ' miles</span>' +
          '</div>'
        );

        path.coordinates.forEach(function (c) { bounds.push(c); });
      });
    }

    // Render focus zones as orange polygons
    if (features.zones) {
      features.zones.forEach(function (zone) {
        var polygon = L.polygon(zone.coordinates, {
          color: COLORS.zone,
          weight: 3,
          opacity: 0.8,
          fillColor: COLORS.zoneFill,
          fillOpacity: 0.2
        }).addTo(map);

        var perim = calculatePolygonPerimeter(zone.coordinates);
        polygon.bindPopup(
          '<div class="impact-popup">' +
          '<strong>Focus Area</strong><br>' +
          zone.label + '<br>' +
          '<span class="impact-popup-miles">~' + perim.toFixed(2) + ' mi perimeter</span>' +
          '</div>'
        );

        zone.coordinates.forEach(function (c) { bounds.push(c); });
      });
    }

    // Render meeting spots as yellow star markers
    if (features.meetingSpots) {
      var starIcon = L.divIcon({
        html: '<svg viewBox="0 0 24 24" width="28" height="28" style="filter: drop-shadow(0 1px 2px rgba(0,0,0,0.4));"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" fill="#eab308" stroke="#a16207" stroke-width="1.5"/></svg>',
        className: 'meeting-spot-icon',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        popupAnchor: [0, -14]
      });

      features.meetingSpots.forEach(function (spot) {
        var marker = L.marker(spot.coordinates, { icon: starIcon }).addTo(map);

        marker.bindPopup(
          '<div class="impact-popup">' +
          '<span style="color:' + COLORS.meetingSpot + '; font-size: 1.2em;">★</span> ' +
          '<strong>Meeting Spot</strong><br>' + spot.label +
          '</div>'
        );

        bounds.push(spot.coordinates);
      });
    }

    // Fit map to show all features
    if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [30, 30] });
    }

    // Update metrics display
    var milesEl = container.querySelector('.impact-miles-value');
    if (milesEl) {
      var miles = templateData.estimated_miles || calculateEstimatedMiles(features);
      milesEl.textContent = miles.toFixed(1);
    }

    var versionEl = container.querySelector('.impact-template-version');
    if (versionEl) {
      versionEl.textContent = 'v' + templateData.version;
    }

    // Invalidate size after a short delay (handles hidden containers)
    setTimeout(function () { map.invalidateSize(); }, 200);

    return map;
  }

  /**
   * Initialize all impact maps on the page.
   */
  function initImpactMaps() {
    var widgets = document.querySelectorAll('.impact-map-widget');
    widgets.forEach(function (widget) {
      // Skip widgets that have inline data (rendered by Hugo shortcode)
      if (widget.hasAttribute('data-inline')) return;

      var templateId = widget.getAttribute('data-template-id');
      var templateSrc = widget.getAttribute('data-template');

      if (templateId) {
        // Load from API by template ID
        var apiBase = (window.API_CONFIG && window.API_CONFIG.BASE_URL) || '';
        fetch(apiBase + '/impact-templates?id=' + encodeURIComponent(templateId))
          .then(function (res) {
            if (!res.ok) throw new Error('Failed to load impact template');
            return res.json();
          })
          .then(function (data) {
            if (data.success && data.template) {
              renderImpactMap(widget, data.template);
            } else {
              throw new Error('Template not found');
            }
          })
          .catch(function (err) {
            console.error('Impact map error:', err);
            var canvas = widget.querySelector('.impact-map-canvas');
            if (canvas) {
              canvas.innerHTML = '<p class="text-center text-gray-500 py-8">Unable to load impact map.</p>';
            }
          });
      } else if (templateSrc) {
        // Load from static URL (legacy fallback)
        fetch(templateSrc)
          .then(function (res) {
            if (!res.ok) throw new Error('Failed to load impact template');
            return res.json();
          })
          .then(function (data) {
            renderImpactMap(widget, data);
          })
          .catch(function (err) {
            console.error('Impact map error:', err);
            var canvas = widget.querySelector('.impact-map-canvas');
            if (canvas) {
              canvas.innerHTML = '<p class="text-center text-gray-500 py-8">Unable to load impact map.</p>';
            }
          });
      }
    });
  }

  // Also support inline template data (for editor preview)
  window.ImpactMap = {
    render: renderImpactMap,
    calculateMiles: calculateEstimatedMiles,
    calculatePathMiles: calculatePathMiles,
    haversineDistance: haversineDistance
  };

  // Auto-init on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initImpactMaps);
  } else {
    initImpactMaps();
  }
})();
