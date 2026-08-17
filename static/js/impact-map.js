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

  // Colors used on a combined multi-location map, where a location's route
  // is either "selected" (the volunteer picked it to RSVP for) or in its
  // default/unselected state.
  const COMBINED_COLORS = {
    default: {
      path: '#94a3b8',      // slate-400 (muted)
      zone: '#94a3b8',
      zoneFill: '#94a3b8',
      parking: '#64748b',
      meetingSpot: '#a8a29e'
    },
    selected: {
      path: '#ea580c',      // orange-600 (same accent as the single-map view)
      zone: '#ea580c',
      zoneFill: '#ea580c',
      parking: '#2563eb',
      meetingSpot: '#eab308'
    }
  };

  /**
   * Format a label for display in popups.
   * If the label is a URL, render it as a clickable "Link" hyperlink.
   */
  function formatLabel(label) {
    if (!label) return '';
    var trimmed = label.trim();
    if (/^https?:\/\//i.test(trimmed)) {
      return '<a href="' + trimmed + '" target="_blank" rel="noopener noreferrer" style="color:#2563eb;text-decoration:underline;">Link</a>';
    }
    return label;
  }

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

    // Guard against double-initialization: a page can render this widget
    // more than once (e.g. an event with multiple locations sharing the
    // same template), and Leaflet throws if L.map() is called twice on the
    // same container element.
    if (mapEl._leaflet_id) return;

    var map = L.map(mapEl, {
      scrollWheelZoom: false
    }).setView(templateData.center, templateData.zoom || 14);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(map);

    var features = templateData.features;
    var bounds = [];

    // Render zones first (bottom layer)
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
          formatLabel(zone.label) + '<br>' +
          '<span class="impact-popup-miles">~' + perim.toFixed(2) + ' mi perimeter</span>' +
          '</div>'
        );

        zone.coordinates.forEach(function (c) { bounds.push(c); });
      });
    }

    // Render paths (above zones)
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
          formatLabel(path.label) + '<br>' +
          '<span class="impact-popup-miles">' + miles.toFixed(2) + ' miles</span>' +
          '</div>'
        );

        path.coordinates.forEach(function (c) { bounds.push(c); });
      });
    }

    // Render parking areas as blue circle markers (above paths/zones)
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
          '<strong>Parking</strong><br>' + formatLabel(spot.label) +
          '</div>'
        );

        bounds.push(spot.coordinates);
      });
    }

    // Render meeting spots as yellow star markers (top layer)
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
          '<strong>Meeting Spot</strong><br>' + formatLabel(spot.label) +
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
   * Render every location's impact map features onto a single shared
   * Leaflet map. Each location's path/zone/parking/meetingSpot layers are
   * grouped so they can be recolored and zoomed to when that location is
   * "selected" (e.g. the volunteer picks it to RSVP for).
   *
   * @param {HTMLElement} container - the .impact-map-widget element
   * @param {Array} locationTemplates - array of { location_id, name, templateData }
   * @returns {Object} controller with `select(locationId)` and `reset()` methods
   */
  function renderCombinedMap(container, locationTemplates) {
    var mapEl = container.querySelector('.impact-map-canvas');
    if (!mapEl || !locationTemplates || locationTemplates.length === 0) return null;

    // Guard against double-initialization (see renderImpactMap for why).
    if (mapEl._leaflet_id) return mapEl._impactMapController || null;

    var map = L.map(mapEl, {
      scrollWheelZoom: false
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(map);

    // locationId -> { layers: [L.Layer, ...], bounds: [[lat,lng], ...], milesTotal }
    var locationLayers = {};
    var allBounds = [];
    var currentSelection = null;

    // With only one location there's no picker to select it (the RSVP
    // widget only renders a location picker when there's more than one),
    // so there's nothing that would ever call select() to un-gray the
    // route. Render it in full "selected" color from the start instead of
    // the muted default used to distinguish locations from each other.
    var isSingleLocation = locationTemplates.length <= 1;

    function styleFor(kind, isSelected) {
      var palette = isSelected ? COMBINED_COLORS.selected : COMBINED_COLORS.default;
      if (kind === 'zone') {
        return { color: palette.zone, weight: isSelected ? 3 : 2, opacity: isSelected ? 0.85 : 0.5, fillColor: palette.zoneFill, fillOpacity: isSelected ? 0.2 : 0.08 };
      }
      if (kind === 'path') {
        return { color: palette.path, weight: isSelected ? 5 : 3, opacity: isSelected ? 0.9 : 0.55 };
      }
      return {};
    }

    locationTemplates.forEach(function (loc) {
      var templateData = loc.templateData;
      if (!templateData || !templateData.features) return;

      var features = templateData.features;
      var layers = [];
      var bounds = [];
      var name = loc.name || templateData.name || 'Location';

      if (features.zones) {
        features.zones.forEach(function (zone) {
          var polygon = L.polygon(zone.coordinates, styleFor('zone', isSingleLocation)).addTo(map);
          var perim = calculatePolygonPerimeter(zone.coordinates);
          polygon.bindPopup(
            '<div class="impact-popup">' +
            '<strong>' + name + ' — Focus Area</strong><br>' +
            formatLabel(zone.label) + '<br>' +
            '<span class="impact-popup-miles">~' + perim.toFixed(2) + ' mi perimeter</span>' +
            '</div>'
          );
          layers.push(polygon);
          zone.coordinates.forEach(function (c) { bounds.push(c); allBounds.push(c); });
        });
      }

      if (features.paths) {
        features.paths.forEach(function (path) {
          var polyline = L.polyline(path.coordinates, styleFor('path', isSingleLocation)).addTo(map);
          var miles = calculatePathMiles(path.coordinates);
          polyline.bindPopup(
            '<div class="impact-popup">' +
            '<strong>' + name + ' — Cleanup Path</strong><br>' +
            formatLabel(path.label) + '<br>' +
            '<span class="impact-popup-miles">' + miles.toFixed(2) + ' miles</span>' +
            '</div>'
          );
          layers.push(polyline);
          path.coordinates.forEach(function (c) { bounds.push(c); allBounds.push(c); });
        });
      }

      if (features.parking) {
        features.parking.forEach(function (spot) {
          var marker = L.circleMarker(spot.coordinates, {
            radius: 9,
            fillColor: isSingleLocation ? COMBINED_COLORS.selected.parking : COMBINED_COLORS.default.parking,
            color: isSingleLocation ? '#1e40af' : '#334155',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.75
          }).addTo(map);
          marker.bindPopup(
            '<div class="impact-popup">' +
            '<strong>' + name + ' — Parking</strong><br>' + formatLabel(spot.label) +
            '</div>'
          );
          layers.push(marker);
          bounds.push(spot.coordinates);
          allBounds.push(spot.coordinates);
        });
      }

      if (features.meetingSpots) {
        var starIcon = L.divIcon({
          html: '<svg viewBox="0 0 24 24" width="24" height="24" style="filter: drop-shadow(0 1px 2px rgba(0,0,0,0.4));"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" fill="#a8a29e" stroke="#78716c" stroke-width="1.5"/></svg>',
          className: 'meeting-spot-icon',
          iconSize: [24, 24],
          iconAnchor: [12, 12],
          popupAnchor: [0, -12]
        });
        features.meetingSpots.forEach(function (spot) {
          var marker = L.marker(spot.coordinates, { icon: starIcon }).addTo(map);
          marker.bindPopup(
            '<div class="impact-popup">' +
            '<strong>' + name + ' — Meeting Spot</strong><br>' + formatLabel(spot.label) +
            '</div>'
          );
          layers.push(marker);
          bounds.push(spot.coordinates);
          allBounds.push(spot.coordinates);
        });
      }

      var miles = templateData.estimated_miles || calculateEstimatedMiles(features);
      locationLayers[loc.location_id] = { layers: layers, bounds: bounds, miles: miles };
    });

    // Initial view: fit everything so all locations are visible.
    if (allBounds.length > 1) {
      map.fitBounds(allBounds, { padding: [30, 30] });
    } else if (allBounds.length === 1) {
      map.setView(allBounds[0], 15);
    } else {
      map.setView([38.8, -77.3], 10); // fallback view
    }

    function restyleLayer(layer, kind, isSelected) {
      if (typeof layer.setStyle === 'function' && (kind === 'path' || kind === 'zone')) {
        layer.setStyle(styleFor(kind, isSelected));
      } else if (typeof layer.setStyle === 'function') {
        // circle markers (parking)
        layer.setStyle({
          fillColor: isSelected ? COMBINED_COLORS.selected.parking : COMBINED_COLORS.default.parking,
          color: isSelected ? '#1e40af' : '#334155'
        });
      }
      // Bring selected layers to front so they render above unselected ones.
      if (isSelected && typeof layer.bringToFront === 'function') {
        layer.bringToFront();
      }
    }

    function layerKind(layer) {
      if (layer instanceof L.Polygon) return 'zone';
      if (layer instanceof L.Polyline) return 'path';
      return 'other';
    }

    /**
     * Highlight a location's route/zone/parking as "selected" and zoom the
     * map to fit that location's features. Passing a falsy locationId
     * clears the selection and restyles everything back to default.
     */
    function select(locationId) {
      currentSelection = locationId || null;
      Object.keys(locationLayers).forEach(function (id) {
        var isSelected = id === currentSelection;
        locationLayers[id].layers.forEach(function (layer) {
          restyleLayer(layer, layerKind(layer), isSelected);
        });
      });

      if (currentSelection && locationLayers[currentSelection] && locationLayers[currentSelection].bounds.length > 0) {
        var b = locationLayers[currentSelection].bounds;
        if (b.length > 1) {
          map.fitBounds(b, { padding: [40, 40], maxZoom: 17 });
        } else {
          map.setView(b[0], 16);
        }
      } else if (!currentSelection && allBounds.length > 1) {
        map.fitBounds(allBounds, { padding: [30, 30] });
      }

      // Update the miles metric to reflect the selected location, or the
      // combined total when nothing is selected.
      var milesEl = container.querySelector('.impact-miles-value');
      if (milesEl) {
        if (currentSelection && locationLayers[currentSelection]) {
          milesEl.textContent = locationLayers[currentSelection].miles.toFixed(1);
        } else {
          var total = Object.keys(locationLayers).reduce(function (sum, id) {
            return sum + (locationLayers[id].miles || 0);
          }, 0);
          milesEl.textContent = total.toFixed(1);
        }
      }
    }

    function reset() {
      select(null);
    }

    setTimeout(function () { map.invalidateSize(); }, 200);

    // Show the combined total miles across all locations until a specific
    // location is selected.
    var milesEl = container.querySelector('.impact-miles-value');
    if (milesEl) {
      var initialTotal = Object.keys(locationLayers).reduce(function (sum, id) {
        return sum + (locationLayers[id].miles || 0);
      }, 0);
      milesEl.textContent = initialTotal.toFixed(1);
    }

    var controller = { map: map, select: select, reset: reset };
    mapEl._impactMapController = controller;
    return controller;
  }

  /**
   * Initialize all impact maps on the page.
   */
  function initImpactMaps() {
    var widgets = document.querySelectorAll('.impact-map-widget');
    widgets.forEach(function (widget) {
      // Skip widgets that have inline data (rendered by Hugo shortcode)
      if (widget.hasAttribute('data-inline')) return;
      // Skip widgets already rendered (guards against duplicate init if
      // this script runs more than once on the page)
      if (widget.dataset.rendered) return;

      var templateId = widget.getAttribute('data-template-id');
      var templateVersion = widget.getAttribute('data-template-version');
      var templateSrc = widget.getAttribute('data-template');

      if (templateId) {
        // Mark as rendered synchronously (before the fetch starts) so a
        // second initImpactMaps() call — e.g. from another impact_map
        // shortcode's <script> tag also running on this page — doesn't
        // race and start a duplicate fetch/render for the same widget.
        widget.dataset.rendered = 'true';
        // Load from API by template ID (and optionally version)
        var apiBase = (window.API_CONFIG && window.API_CONFIG.BASE_URL) || '';
        var url = apiBase + '/impact-templates?id=' + encodeURIComponent(templateId);
        if (templateVersion) {
          url += '&version=' + encodeURIComponent(templateVersion);
        }
        fetch(url)
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
        widget.dataset.rendered = 'true';
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
    renderCombined: renderCombinedMap,
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
