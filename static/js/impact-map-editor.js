/**
 * Impact Map Editor
 * 
 * Admin tool for creating and editing impact map templates.
 * Uses Leaflet.draw for interactive drawing of parking spots,
 * cleanup paths, and focus area polygons.
 */

(function () {
  'use strict';

  var COLORS = {
    parking: '#2563eb',
    path: '#ea580c',
    zone: '#ea580c',
    meetingSpot: '#eab308'
  };

  var editor = {
    map: null,
    drawnItems: null,
    template: null,
    mode: null, // 'parking' | 'path' | 'zone'
    idCounter: 0,
    currentDrawHandler: null
  };

  function generateId(prefix) {
    editor.idCounter++;
    return prefix + '-' + editor.idCounter;
  }

  /**
   * Initialize the editor on a given container element.
   */
  function initEditor(container, existingTemplate) {
    var mapEl = container.querySelector('.impact-editor-canvas');
    if (!mapEl) return;

    // Default center: Stafford, VA area
    var center = [38.42, -77.41];
    var zoom = 13;

    editor.template = existingTemplate || {
      id: '',
      name: '',
      description: '',
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      center: center,
      zoom: zoom,
      reusable: true,
      estimated_miles: 0,
      features: { parking: [], paths: [], zones: [] }
    };

    if (existingTemplate) {
      center = existingTemplate.center || center;
      zoom = existingTemplate.zoom || zoom;
    }

    editor.map = L.map(mapEl).setView(center, zoom);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19
    }).addTo(editor.map);

    editor.drawnItems = new L.FeatureGroup();
    editor.map.addLayer(editor.drawnItems);

    // Load existing features onto the map
    if (existingTemplate && existingTemplate.features) {
      loadExistingFeatures(existingTemplate.features);
    }

    // Wire up toolbar buttons
    bindToolbarEvents(container);

    // Wire up form fields
    bindFormEvents(container);

    // Update metrics
    updateMetrics(container);

    setTimeout(function () { editor.map.invalidateSize(); }, 200);
  }

  function loadExistingFeatures(features) {
    if (features.parking) {
      features.parking.forEach(function (spot) {
        var marker = L.circleMarker(spot.coordinates, {
          radius: 10,
          fillColor: COLORS.parking,
          color: '#1e40af',
          weight: 2,
          fillOpacity: 0.8
        });
        marker.featureType = 'parking';
        marker.featureId = spot.id;
        marker.featureLabel = spot.label;
        marker.bindPopup('<strong>Parking:</strong> ' + spot.label);
        editor.drawnItems.addLayer(marker);
      });
    }

    if (features.paths) {
      features.paths.forEach(function (path) {
        var polyline = L.polyline(path.coordinates, {
          color: COLORS.path,
          weight: 4,
          opacity: 0.85
        });
        polyline.featureType = 'path';
        polyline.featureId = path.id;
        polyline.featureLabel = path.label;
        polyline.bindPopup('<strong>Path:</strong> ' + path.label);
        editor.drawnItems.addLayer(polyline);
      });
    }

    if (features.zones) {
      features.zones.forEach(function (zone) {
        var polygon = L.polygon(zone.coordinates, {
          color: COLORS.zone,
          weight: 3,
          fillColor: COLORS.zone,
          fillOpacity: 0.2
        });
        polygon.featureType = 'zone';
        polygon.featureId = zone.id;
        polygon.featureLabel = zone.label;
        polygon.bindPopup('<strong>Zone:</strong> ' + zone.label);
        editor.drawnItems.addLayer(polygon);
      });
    }

    if (features.meetingSpots) {
      features.meetingSpots.forEach(function (spot) {
        var icon = L.divIcon({
          html: '<svg viewBox="0 0 24 24" width="28" height="28"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" fill="#eab308" stroke="#a16207" stroke-width="1.5"/></svg>',
          className: 'meeting-spot-icon',
          iconSize: [28, 28],
          iconAnchor: [14, 14]
        });
        var marker = L.marker(spot.coordinates, { icon: icon });
        marker.featureType = 'meetingSpot';
        marker.featureId = spot.id;
        marker.featureLabel = spot.label;
        marker.bindPopup('<strong>Meeting Spot:</strong> ' + spot.label);
        editor.drawnItems.addLayer(marker);
      });
    }
  }

  function bindToolbarEvents(container) {
    var btnParking = container.querySelector('[data-tool="parking"]');
    var btnPath = container.querySelector('[data-tool="path"]');
    var btnZone = container.querySelector('[data-tool="zone"]');
    var btnDelete = container.querySelector('[data-tool="delete"]');
    var btnMeeting = container.querySelector('[data-tool="meeting"]');

    if (btnParking) {
      btnParking.addEventListener('click', function () {
        cancelCurrentDraw();
        setActiveButton(container, 'parking');
        startParkingDraw(container);
      });
    }

    if (btnMeeting) {
      btnMeeting.addEventListener('click', function () {
        cancelCurrentDraw();
        setActiveButton(container, 'meeting');
        startMeetingSpotDraw(container);
      });
    }

    if (btnPath) {
      btnPath.addEventListener('click', function () {
        cancelCurrentDraw();
        setActiveButton(container, 'path');
        startPathDraw(container);
      });
    }

    if (btnZone) {
      btnZone.addEventListener('click', function () {
        cancelCurrentDraw();
        setActiveButton(container, 'zone');
        startZoneDraw(container);
      });
    }

    if (btnDelete) {
      btnDelete.addEventListener('click', function () {
        cancelCurrentDraw();
        setActiveButton(container, 'delete');
        enableDeleteMode(container);
      });
    }
  }

  function setActiveButton(container, tool) {
    var buttons = container.querySelectorAll('.impact-toolbar button');
    buttons.forEach(function (btn) {
      btn.classList.remove('active', 'bg-eden-green', 'text-white');
      btn.classList.add('bg-gray-200');
    });
    var active = container.querySelector('[data-tool="' + tool + '"]');
    if (active) {
      active.classList.add('active', 'bg-eden-green', 'text-white');
      active.classList.remove('bg-gray-200');
    }
    editor.mode = tool;
  }

  function cancelCurrentDraw() {
    if (editor.currentDrawHandler) {
      editor.currentDrawHandler.disable();
      editor.currentDrawHandler = null;
    }
    // Remove parking click listener
    if (editor.parkingClickHandler) {
      editor.map.off('click', editor.parkingClickHandler);
      editor.parkingClickHandler = null;
    }
    // Remove meeting spot click listener
    if (editor.meetingClickHandler) {
      editor.map.off('click', editor.meetingClickHandler);
      editor.meetingClickHandler = null;
    }
    // Remove any pending draw:created listener
    if (editor.drawCreatedHandler) {
      editor.map.off(L.Draw.Event.CREATED, editor.drawCreatedHandler);
      editor.drawCreatedHandler = null;
    }
    // Remove delete click listeners
    if (editor.deleteMode) {
      editor.drawnItems.eachLayer(function (layer) {
        if (layer._deleteHandler) {
          layer.off('click', layer._deleteHandler);
          delete layer._deleteHandler;
        }
      });
      editor.deleteMode = false;
    }
  }

  function startParkingDraw(container) {
    editor.parkingClickHandler = function (e) {
      if (editor.mode !== 'parking') return;

      var label = prompt('Parking area label:', 'Parking Area');
      if (!label) return;

      var marker = L.circleMarker(e.latlng, {
        radius: 10,
        fillColor: COLORS.parking,
        color: '#1e40af',
        weight: 2,
        fillOpacity: 0.8
      });
      marker.featureType = 'parking';
      marker.featureId = generateId('parking');
      marker.featureLabel = label;
      marker.bindPopup('<strong>Parking:</strong> ' + label);
      editor.drawnItems.addLayer(marker);
      updateMetrics(container);
    };
    editor.map.on('click', editor.parkingClickHandler);
  }

  function startMeetingSpotDraw(container) {
    editor.meetingClickHandler = function (e) {
      if (editor.mode !== 'meeting') return;

      var label = prompt('Meeting spot label:', 'Meeting Point');
      if (!label) return;

      var icon = L.divIcon({
        html: '<svg viewBox="0 0 24 24" width="28" height="28"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" fill="#eab308" stroke="#a16207" stroke-width="1.5"/></svg>',
        className: 'meeting-spot-icon',
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });
      var marker = L.marker(e.latlng, { icon: icon });
      marker.featureType = 'meetingSpot';
      marker.featureId = generateId('meeting');
      marker.featureLabel = label;
      marker.bindPopup('<strong>Meeting Spot:</strong> ' + label);
      editor.drawnItems.addLayer(marker);
      updateMetrics(container);
    };
    editor.map.on('click', editor.meetingClickHandler);
  }

  function startPathDraw(container) {
    if (!L.Draw) {
      alert('Leaflet.draw is required for path drawing.');
      return;
    }
    var handler = new L.Draw.Polyline(editor.map, {
      shapeOptions: {
        color: COLORS.path,
        weight: 4,
        opacity: 0.85
      }
    });
    handler.enable();
    editor.currentDrawHandler = handler;

    editor.drawCreatedHandler = function (e) {
      var label = prompt('Cleanup path label:', 'Cleanup Path');
      if (!label) label = 'Cleanup Path';

      var layer = e.layer;
      layer.featureType = 'path';
      layer.featureId = generateId('path');
      layer.featureLabel = label;
      layer.bindPopup('<strong>Path:</strong> ' + label);
      editor.drawnItems.addLayer(layer);
      editor.currentDrawHandler = null;
      editor.map.off(L.Draw.Event.CREATED, editor.drawCreatedHandler);
      editor.drawCreatedHandler = null;
      updateMetrics(container);
    };
    editor.map.on(L.Draw.Event.CREATED, editor.drawCreatedHandler);
  }

  function startZoneDraw(container) {
    if (!L.Draw) {
      alert('Leaflet.draw is required for zone drawing.');
      return;
    }
    var handler = new L.Draw.Polygon(editor.map, {
      shapeOptions: {
        color: COLORS.zone,
        weight: 3,
        fillColor: COLORS.zone,
        fillOpacity: 0.2
      }
    });
    handler.enable();
    editor.currentDrawHandler = handler;

    editor.drawCreatedHandler = function (e) {
      var label = prompt('Focus area label:', 'Focus Area');
      if (!label) label = 'Focus Area';

      var layer = e.layer;
      layer.featureType = 'zone';
      layer.featureId = generateId('zone');
      layer.featureLabel = label;
      layer.bindPopup('<strong>Zone:</strong> ' + label);
      editor.drawnItems.addLayer(layer);
      editor.currentDrawHandler = null;
      editor.map.off(L.Draw.Event.CREATED, editor.drawCreatedHandler);
      editor.drawCreatedHandler = null;
      updateMetrics(container);
    };
    editor.map.on(L.Draw.Event.CREATED, editor.drawCreatedHandler);
  }

  function enableDeleteMode(container) {
    editor.deleteMode = true;
    editor.drawnItems.eachLayer(function (layer) {
      // Only add handler if not already attached
      if (layer._deleteHandler) return;
      layer._deleteHandler = function () {
        if (editor.mode !== 'delete') return;
        if (confirm('Delete this feature?')) {
          editor.drawnItems.removeLayer(layer);
          updateMetrics(container);
        }
      };
      layer.on('click', layer._deleteHandler);
    });
  }

  function bindFormEvents(container) {
    var nameInput = container.querySelector('[name="template-name"]');
    var descInput = container.querySelector('[name="template-description"]');
    var reusableInput = container.querySelector('[name="template-reusable"]');
    var idInput = container.querySelector('[name="template-id"]');

    if (nameInput && editor.template.name) nameInput.value = editor.template.name;
    if (descInput && editor.template.description) descInput.value = editor.template.description;
    if (idInput && editor.template.id) idInput.value = editor.template.id;
    if (reusableInput) reusableInput.checked = editor.template.reusable !== false;
  }

  function updateMetrics(container) {
    var features = extractFeatures();
    var miles = window.ImpactMap ? window.ImpactMap.calculateMiles(features) : 0;

    var milesEl = container.querySelector('.editor-miles-value');
    if (milesEl) milesEl.textContent = miles.toFixed(1);

    var countEl = container.querySelector('.editor-feature-count');
    if (countEl) {
      var count = (features.parking ? features.parking.length : 0) +
                  (features.paths ? features.paths.length : 0) +
                  (features.zones ? features.zones.length : 0) +
                  (features.meetingSpots ? features.meetingSpots.length : 0);
      countEl.textContent = count;
    }
  }

  /**
   * Extract features from drawn layers into template format.
   */
  function extractFeatures() {
    var features = { parking: [], paths: [], zones: [], meetingSpots: [] };

    editor.drawnItems.eachLayer(function (layer) {
      if (layer.featureType === 'parking') {
        var latlng = layer.getLatLng();
        features.parking.push({
          id: layer.featureId,
          label: layer.featureLabel || 'Parking',
          coordinates: [
            Math.round(latlng.lat * 1000000) / 1000000,
            Math.round(latlng.lng * 1000000) / 1000000
          ]
        });
      } else if (layer.featureType === 'meetingSpot') {
        var latlng = layer.getLatLng();
        features.meetingSpots.push({
          id: layer.featureId,
          label: layer.featureLabel || 'Meeting Point',
          coordinates: [
            Math.round(latlng.lat * 1000000) / 1000000,
            Math.round(latlng.lng * 1000000) / 1000000
          ]
        });
      } else if (layer.featureType === 'path') {
        var coords = layer.getLatLngs().map(function (ll) {
          return [
            Math.round(ll.lat * 1000000) / 1000000,
            Math.round(ll.lng * 1000000) / 1000000
          ];
        });
        features.paths.push({
          id: layer.featureId,
          label: layer.featureLabel || 'Cleanup Path',
          coordinates: coords
        });
      } else if (layer.featureType === 'zone') {
        var zoneCoords = layer.getLatLngs()[0].map(function (ll) {
          return [
            Math.round(ll.lat * 1000000) / 1000000,
            Math.round(ll.lng * 1000000) / 1000000
          ];
        });
        features.zones.push({
          id: layer.featureId,
          label: layer.featureLabel || 'Focus Area',
          coordinates: zoneCoords
        });
      }
    });

    return features;
  }

  /**
   * Export the current editor state as a template JSON object.
   */
  function exportTemplate(container) {
    var nameInput = container.querySelector('[name="template-name"]');
    var descInput = container.querySelector('[name="template-description"]');
    var reusableInput = container.querySelector('[name="template-reusable"]');
    var idInput = container.querySelector('[name="template-id"]');

    var features = extractFeatures();
    var miles = window.ImpactMap ? window.ImpactMap.calculateMiles(features) : 0;
    var mapCenter = editor.map.getCenter();
    var mapZoom = editor.map.getZoom();

    var isNew = !editor.template.version || editor.template.version === 0;
    var newVersion = isNew ? 1 : editor.template.version + 1;

    return {
      id: idInput ? idInput.value : editor.template.id || '',
      name: nameInput ? nameInput.value : editor.template.name || '',
      description: descInput ? descInput.value : editor.template.description || '',
      version: newVersion,
      created_at: editor.template.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      center: [
        Math.round(mapCenter.lat * 1000000) / 1000000,
        Math.round(mapCenter.lng * 1000000) / 1000000
      ],
      zoom: mapZoom,
      reusable: reusableInput ? reusableInput.checked : true,
      estimated_miles: Math.round(miles * 100) / 100,
      features: features
    };
  }

  // Expose editor API
  window.ImpactMapEditor = {
    init: initEditor,
    exportTemplate: exportTemplate,
    getEditor: function () { return editor; }
  };
})();
