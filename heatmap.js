// ═══════════════════════════════════════════════════════════════════════════
//  heatmap.js  ·  Kernel Density Estimation — Kernel Cuártico (Biweight)
//  Bolivia 2026 · Habilitados por recinto
//
//  Kernel cuártico SIG estándar:
//    K(d) = (3/π) × (1 − d²)²   para d = dist/radio ∈ [0,1]
//  Ponderado por campo `h` (habilitados) de cada recinto.
//  Renderizado sobre un <canvas> como Leaflet Layer custom.
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

// ── Estado global ──────────────────────────────────────────────────────────
let recintos           = [];
let map                = null;
let kdePainter         = null;
let markersLayer       = null;
let zonasLayer         = null;
let macrosLayer        = null;
let neonGlowLayer      = null;
let selectedZonaLayer  = null;
let selectedMacroLayer = null;
let searchTimeout      = null;
let maxH               = 1;

// ── Colores macrodistritos ─────────────────────────────────────────────────
const MACRO_COLORS = {
  'CENTRO':      '#E11D48',
  'COTAHUMA':    '#2563EB',
  'HAMPATURI':   '#059669',
  'MALLASA':     '#EA580C',
  'MAX PAREDES': '#7C3AED',
  'PERIFERICA':  '#CA8A04',
  'SAN ANTONIO': '#0891B2',
  'SUR':         '#BE185D'
};

// ── Mapas base ────────────────────────────────────────────────────────────
const BASEMAPS = {
  'Oscuro':        { url: 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png',   labels: 'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png' },
  'Claro':         { url: 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png',  labels: 'https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png' },
  'Sin color':     { url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png', labels: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png' },
  'Satélite':      { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', labels: null },
  'Relieve':       { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', labels: null },
  'OpenStreetMap': { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', labels: null }
};

let baseTileLayer  = null;
let labelTileLayer = null;

// ── Paletas de color RGBA stops [R,G,B,A] ────────────────────────────────
const PALETTES = {
  'Fuego':    [[0,0,0,0],[30,0,10,80],[80,0,50,180],[180,20,80,220],[230,80,20,240],[255,160,0,255],[255,235,59,255],[255,255,255,255]],
  'Plasma':   [[0,0,0,0],[13,8,135,80],[84,2,163,180],[139,10,165,220],[185,50,137,240],[219,92,104,255],[244,136,73,255],[252,253,191,255]],
  'Viridis':  [[0,0,0,0],[68,1,84,80],[72,40,120,180],[62,83,160,220],[49,104,142,240],[38,130,142,255],[31,158,137,255],[105,190,40,255],[253,231,37,255]],
  'Inferno':  [[0,0,0,0],[0,0,4,80],[40,11,84,180],[101,21,110,220],[159,42,99,240],[212,72,66,255],[245,125,21,255],[252,255,164,255]],
  'Turbo':    [[0,0,0,0],[48,18,59,80],[70,96,209,180],[48,176,200,220],[53,231,157,240],[180,243,75,255],[253,186,39,255],[122,0,0,255]],
  'Magma':    [[0,0,0,0],[0,0,4,80],[28,16,68,160],[79,18,123,200],[136,34,106,230],[185,55,84,245],[229,80,100,255],[252,253,191,255]],
  'Cividis':  [[0,0,0,0],[0,32,76,80],[0,60,110,160],[46,88,130,200],[93,118,143,230],[150,152,149,245],[205,189,142,255],[253,231,37,255]],
  'Cool':     [[0,0,0,0],[0,255,255,80],[0,200,255,160],[50,150,255,200],[100,100,255,230],[180,50,255,245],[255,0,255,255],[255,200,255,255]],
  'Sunset':   [[0,0,0,0],[0,0,80,80],[60,0,120,150],[140,20,100,200],[210,60,60,230],[255,120,20,250],[255,200,0,255],[255,255,200,255]],
  'RdYlGn':   [[0,0,0,0],[165,0,38,80],[215,48,39,160],[244,109,67,200],[253,174,97,230],[255,255,191,245],[166,217,106,255],[26,152,80,255]],
  'Ocean':    [[0,0,0,0],[0,10,40,80],[0,30,80,150],[0,70,130,200],[0,120,180,230],[20,170,200,245],[100,210,220,255],[220,250,255,255]],
  'Neon':     [[0,0,0,0],[30,0,60,80],[80,0,180,160],[20,100,255,200],[0,220,200,230],[100,255,100,245],[255,230,0,255],[255,255,255,255]],
  'Anghy':    [[0,0,0,0],[60,0,30,70],[120,10,80,150],[195,20,120,200],[230,60,140,225],[255,100,160,240],[255,170,200,252],[255,230,240,255]],
};

let currentPalette = 'Fuego';

// ── Quintiles dinámicos — se recalculan sobre los datos filtrados visibles ──
// Método: interpolación lineal estándar (R type=7 / Excel PERCENTIL / NumPy default)
let POINT_BREAKS     = [0, 500, 1500, 3000, 6000];
let POINT_N_PER_CLASS = [0, 0, 0, 0, 0];

function calcularQuintiles(recintosFiltrados) {
  const vals = recintosFiltrados.map(r => r.h || 0).filter(h => h > 0).sort((a, b) => a - b);
  if (vals.length < 5) return;

  // Interpolación lineal estándar para percentil p ∈ [0,1]
  function percentil(p) {
    const pos  = p * (vals.length - 1);
    const lo   = Math.floor(pos);
    const hi   = Math.min(lo + 1, vals.length - 1);
    return vals[lo] + (pos - lo) * (vals[hi] - vals[lo]);
  }

  const p20 = percentil(0.20);
  const p40 = percentil(0.40);
  const p60 = percentil(0.60);
  const p80 = percentil(0.80);

  // POINT_BREAKS[0] = mínimo − 1  →  clase 0: mín ≤ h ≤ p20
  POINT_BREAKS = [vals[0] - 1, p20, p40, p60, p80];

  // Contar recintos por clase
  POINT_N_PER_CLASS = [0, 0, 0, 0, 0];
  vals.forEach(h => { POINT_N_PER_CLASS[clasePunto(h)]++; });
}

function clasePunto(h) {
  if (h <= POINT_BREAKS[1]) return 0;
  if (h <= POINT_BREAKS[2]) return 1;
  if (h <= POINT_BREAKS[3]) return 2;
  if (h <= POINT_BREAKS[4]) return 3;
  return 4;
}

function colorClasePunto(clase) {
  // Mapea las 5 clases a t=0.1, 0.3, 0.5, 0.7, 0.9 en la paleta activa
  const tValues = [0.1, 0.3, 0.5, 0.72, 0.92];
  const [R, G, B] = paletteColor(tValues[clase], currentPalette);
  return `rgb(${R},${G},${B})`;
}
function paletteColor(t, palName) {
  const stops = PALETTES[palName] || PALETTES['Fuego'];
  const n   = stops.length - 1;
  const idx = Math.min(t * n, n);
  const lo  = Math.floor(idx);
  const hi  = Math.min(lo + 1, n);
  const f   = idx - lo;
  const a   = stops[lo], b = stops[hi];
  return [
    Math.round(a[0] + (b[0]-a[0])*f),
    Math.round(a[1] + (b[1]-a[1])*f),
    Math.round(a[2] + (b[2]-a[2])*f),
    Math.round(a[3] + (b[3]-a[3])*f)
  ];
}

function colorPorIntensidad(h) {
  const r = h / maxH;
  const [R,G,B] = paletteColor(Math.min(r * 1.05, 1), currentPalette);
  return `rgb(${R},${G},${B})`;
}

// ═══════════════════════════════════════════════════════════════════════════
//  CAPA CANVAS — KDE KERNEL CUÁRTICO
//  K(d) = (3/π)(1−d²)²   d ∈ [0,1]  (Epanechnikov cuártico / biweight)
// ═══════════════════════════════════════════════════════════════════════════
const KdeLayer = L.Layer.extend({

  initialize() {
    this._recintos = [];
    this._radioM   = 500;
    this._opacity  = 0.85;
    this._paleta   = 'Fuego';
    this._canvas   = null;
    this._ctx      = null;
  },

  onAdd(map) {
    this._map = map;
    this._canvas = L.DomUtil.create('canvas', 'kde-canvas', map.getPanes().overlayPane);
    this._canvas.style.cssText = 'position:absolute;pointer-events:none;';
    this._ctx = this._canvas.getContext('2d');
    map.on('moveend zoomend', this._redraw, this);
    this._redraw();
  },

  onRemove(map) {
    map.off('moveend zoomend', this._redraw, this);
    L.DomUtil.remove(this._canvas);
    this._canvas = null;
  },

  setData(recintos, radioM, opacity, paleta) {
    this._recintos = recintos;
    this._radioM   = radioM;
    this._opacity  = opacity;
    this._paleta   = paleta;
    if (this._canvas) this._redraw();
  },

  _redraw() {
    if (!this._map || !this._canvas) return;

    const map    = this._map;
    const size   = map.getSize();

    this._canvas.width  = size.x;
    this._canvas.height = size.y;
    L.DomUtil.setPosition(this._canvas, map.containerPointToLayerPoint([0, 0]));

    const ctx     = this._ctx;
    const radioM  = this._radioM;
    const paleta  = this._paleta;
    const zoom    = map.getZoom();

    // Metros → pixels (corrección por latitud de Bolivia ~−16.5°)
    const mPx    = 156543.03 * Math.cos(-16.5 * Math.PI / 180) / Math.pow(2, zoom);
    const radioPx = Math.max(radioM / mPx, 4);

    // Proyectar puntos a coordenadas de contenedor
    const pts = this._recintos.map(r => {
      const cp = map.latLngToContainerPoint([r.la, r.lo]);
      return { x: cp.x, y: cp.y, w: (r.h || 0) / maxH };
    }).filter(p => p.w > 0);

    if (!pts.length) { ctx.clearRect(0, 0, size.x, size.y); return; }

    // ── Grid KDE reducido (factor 2 para rendimiento) ──────────────────
    const factor = 2;
    const gw     = Math.ceil(size.x / factor);
    const gh     = Math.ceil(size.y / factor);
    const grid   = new Float32Array(gw * gh);
    const rG     = radioPx / factor;
    const rG2    = rG * rG;
    const K      = 3 / Math.PI;   // constante kernel cuártico

    for (const p of pts) {
      const gx = p.x / factor;
      const gy = p.y / factor;
      const x0 = Math.max(0,  Math.floor(gx - rG));
      const x1 = Math.min(gw, Math.ceil (gx + rG));
      const y0 = Math.max(0,  Math.floor(gy - rG));
      const y1 = Math.min(gh, Math.ceil (gy + rG));

      for (let iy = y0; iy < y1; iy++) {
        const dy2 = (iy - gy) * (iy - gy);
        for (let ix = x0; ix < x1; ix++) {
          const d2 = ((ix - gx) * (ix - gx) + dy2) / rG2;  // dist² normalizada
          if (d2 >= 1) continue;
          // Kernel cuártico: K(d) = (3/π)(1−d²)²
          grid[iy * gw + ix] += K * (1 - d2) * (1 - d2) * p.w;
        }
      }
    }

    // Normalizar
    let maxVal = 0;
    for (let i = 0; i < grid.length; i++) if (grid[i] > maxVal) maxVal = grid[i];
    if (maxVal === 0) { ctx.clearRect(0, 0, size.x, size.y); return; }

    // Construir ImageData en grid reducido
    const off    = document.createElement('canvas');
    off.width    = gw;
    off.height   = gh;
    const offCtx = off.getContext('2d');
    const img    = offCtx.createImageData(gw, gh);
    const d      = img.data;
    const opac   = this._opacity;

    for (let i = 0; i < grid.length; i++) {
      const t = grid[i] / maxVal;
      if (t < 0.004) { d[i*4+3] = 0; continue; }
      const [R,G,B,A] = paletteColor(t, paleta);
      d[i*4]   = R;
      d[i*4+1] = G;
      d[i*4+2] = B;
      d[i*4+3] = Math.round(A * opac);
    }

    offCtx.putImageData(img, 0, 0);

    // Escalar al canvas real (interpolación bicúbica del navegador)
    ctx.clearRect(0, 0, size.x, size.y);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(off, 0, 0, size.x, size.y);
  }
});

// ═══════════════════ MAPA BASE ════════════════════════════════════════════
function inicializarMapa() {
  map = L.map('map', { zoomControl: true, attributionControl: false }).setView([-16.5, -64.5], 6);
  aplicarMapaBase('Sin color');
  markersLayer = L.layerGroup().addTo(map);
  let zt = null;
  map.on('zoomend moveend', () => { if (zt) clearTimeout(zt); zt = setTimeout(renderMapa, 130); });
  inicializarCapas();
}

function aplicarMapaBase(nombre) {
  if (baseTileLayer)  { map.removeLayer(baseTileLayer);  baseTileLayer  = null; }
  if (labelTileLayer) { map.removeLayer(labelTileLayer); labelTileLayer = null; }
  const bm = BASEMAPS[nombre];
  if (!bm) return;
  baseTileLayer = L.tileLayer(bm.url, { maxZoom: 19, pane: 'tilePane' }).addTo(map);
  baseTileLayer.bringToBack();
  if (bm.labels) {
    labelTileLayer = L.tileLayer(bm.labels, { maxZoom: 19, pane: 'shadowPane' }).addTo(map);
  }
  // Re-render KDE encima del nuevo basemap
  if (kdePainter) { map.removeLayer(kdePainter); kdePainter.addTo(map); }
  if (markersLayer) markersLayer.bringToFront();
}

// ═══════════════════ CAPAS GEO ════════════════════════════════════════════
function inicializarCapas() {
  neonGlowLayer = L.layerGroup();

  if (typeof ZONAS_LPZ !== 'undefined') {
    zonasLayer = L.geoJSON(ZONAS_LPZ, {
      style: f => { const c = f.properties.color || '#7C3AED'; return { color: c, weight: 1, opacity: 0.45, fillColor: c, fillOpacity: 0.04 }; },
      onEachFeature: (f, layer) => {
        layer.on('click',     e => { L.DomEvent.stopPropagation(e); seleccionarZona(layer, f, e.latlng); });
        layer.on('mouseover', () => { if (layer !== selectedZonaLayer) layer.setStyle({ weight: 2, opacity: 0.75 }); });
        layer.on('mouseout',  () => { if (layer !== selectedZonaLayer) layer.setStyle({ weight: 1, opacity: 0.45, color: f.properties.color || '#7C3AED' }); });
        layer.on('add',       () => { if (layer._path) { layer._path.setAttribute('tabindex', '-1'); layer._path.style.outline = 'none'; } });
      }
    });
  }

  if (typeof MACROS_LPZ !== 'undefined') {
    macrosLayer = L.geoJSON(MACROS_LPZ, {
      style: f => { const c = MACRO_COLORS[f.properties.macrodistrito] || '#6B7280'; return { color: c, weight: 2, opacity: 0.6, fillColor: c, fillOpacity: 0.05 }; },
      onEachFeature: (f, layer) => {
        layer.on('click',     e => { L.DomEvent.stopPropagation(e); seleccionarMacro(layer, f, e.latlng); });
        layer.on('mouseover', () => { if (layer !== selectedMacroLayer) layer.setStyle({ weight: 3, opacity: 0.9 }); });
        layer.on('mouseout',  () => { if (layer !== selectedMacroLayer) layer.setStyle({ weight: 2, opacity: 0.6 }); });
        layer.on('add',       () => { if (layer._path) { layer._path.setAttribute('tabindex', '-1'); layer._path.style.outline = 'none'; } });
      }
    });
  }
  map.on('click', limpiarSeleccion);
}

function seleccionarZona(layer, feature, latlng) {
  limpiarSeleccion();
  selectedZonaLayer = layer;
  const c = feature.properties.color || '#7C3AED';
  crearNeon(feature.geometry, c);
  const rec = recintosEnPoligono(feature.geometry);
  const totalH = rec.reduce((s, r) => s + (r.h||0), 0);
  L.popup({ className: 'pp-popup', maxWidth: 300, minWidth: 220, closeButton: true, autoPan: true })
    .setLatLng(latlng).setContent(buildZonaPopup(feature, rec, totalH, c)).openOn(map);
}

function seleccionarMacro(layer, feature, latlng) {
  limpiarSeleccion();
  selectedMacroLayer = layer;
  const c = MACRO_COLORS[feature.properties.macrodistrito] || '#6B7280';
  crearNeon(feature.geometry, c);
  const rec = recintosEnPoligono(feature.geometry);
  const totalH = rec.reduce((s, r) => s + (r.h||0), 0);
  L.popup({ className: 'pp-popup', maxWidth: 320, minWidth: 240, closeButton: true, autoPan: true })
    .setLatLng(latlng).setContent(buildMacroPopup(feature, rec, totalH, c)).openOn(map);
}

function crearNeon(geometry, color) {
  if (neonGlowLayer) neonGlowLayer.clearLayers();
  const coords = geometry.type === 'MultiPolygon' ? geometry.coordinates : [geometry.coordinates];
  coords.forEach(poly => {
    const ring = poly[0].map(c => [c[1], c[0]]);
    L.polyline(ring, { color, weight: 10, opacity: 0.12, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(neonGlowLayer);
    L.polyline(ring, { color, weight:  6, opacity: 0.28, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(neonGlowLayer);
    L.polyline(ring, { color, weight:  3, opacity: 0.55, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(neonGlowLayer);
    L.polyline(ring, { color:'#fff', weight: 1.2, opacity: 0.7, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(neonGlowLayer);
  });
  neonGlowLayer.addTo(map);
}

function limpiarSeleccion() {
  if (neonGlowLayer) neonGlowLayer.clearLayers();
  map.closePopup();
  if (selectedZonaLayer)  { selectedZonaLayer.setStyle({ weight: 1, opacity: 0.45, color: selectedZonaLayer.feature.properties.color || '#7C3AED' }); selectedZonaLayer = null; }
  if (selectedMacroLayer) { selectedMacroLayer.setStyle({ weight: 2, opacity: 0.6, color: MACRO_COLORS[selectedMacroLayer.feature.properties.macrodistrito] || '#6B7280' }); selectedMacroLayer = null; }
}

function toggleZonas(on)  { if (!zonasLayer)  return; on ? (zonasLayer.addTo(map),  zonasLayer.bringToBack())  : (limpiarSeleccion(), map.removeLayer(zonasLayer)); }
function toggleMacros(on) { if (!macrosLayer) return; on ? (macrosLayer.addTo(map), macrosLayer.bringToBack()) : (limpiarSeleccion(), map.removeLayer(macrosLayer)); }

function puntoEnPoligono(lat, lon, coords) {
  let inside = false;
  for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    const xi = coords[i][0], yi = coords[i][1], xj = coords[j][0], yj = coords[j][1];
    if ((yi > lat) !== (yj > lat) && lon < (xj-xi)*(lat-yi)/(yj-yi)+xi) inside = !inside;
  }
  return inside;
}
function recintosEnPoligono(geometry) {
  const found = [], polys = geometry.type === 'MultiPolygon' ? geometry.coordinates : [geometry.coordinates];
  recintos.forEach(r => {
    if (!r.la || !r.lo) return;
    for (const poly of polys) if (puntoEnPoligono(r.la, r.lo, poly[0])) { found.push(r); return; }
  });
  return found;
}

// ═══════════════════ POPUPS ════════════════════════════════════════════
function recRow(r) { return `<div class="pp-rec-row"><span class="pp-rec-name">${r.r}</span><span class="pp-rec-mesas" style="background:rgba(255,154,92,.12);color:#ff9a5c">${(r.h||0).toLocaleString('es')}</span></div>`; }

function buildZonaPopup(feature, recs, totalH, color) {
  const p = feature.properties;
  const pctMax = maxH > 0 ? (totalH/maxH*100).toFixed(0) : 0;
  const avg    = recs.length ? Math.round(totalH/recs.length) : 0;
  const top    = recs.slice().sort((a,b)=>(b.h||0)-(a.h||0)).slice(0,5);
  let recHtml  = top.map(recRow).join('');
  if (recs.length > 5) recHtml += `<div class="pp-rec-more">+${recs.length-5} recintos más</div>`;
  return `<div class="pp-card">
    <div class="pp-header" style="border-left:4px solid ${color}">
      <div class="pp-title">${p.zona}</div>
      <div class="pp-subtitle">Macrodistrito ${p.macrodistrito} · Zona ${p.codigozona||''}</div>
    </div>
    <div class="pp-stats">
      <div class="pp-stat"><div class="pp-stat-val">${recs.length}</div><div class="pp-stat-lbl">Recintos</div></div>
      <div class="pp-stat"><div class="pp-stat-val">${totalH.toLocaleString('es')}</div><div class="pp-stat-lbl">Habilitados</div></div>
      <div class="pp-stat"><div class="pp-stat-val">${avg.toLocaleString('es')}</div><div class="pp-stat-lbl">Promedio</div></div>
    </div>
    <div class="pp-hab-section">
      <div class="pp-hab-bar-bg"><div class="pp-hab-bar-fill" style="width:${pctMax}%;background:${color}"></div></div>
      <span class="pp-hab-pct">${pctMax}% del máximo nacional</span>
    </div>
    ${recs.length > 0 ? `<div style="padding:0 14px 10px"><div class="pp-subtitle" style="margin-bottom:5px;text-transform:uppercase;letter-spacing:.05em">Top recintos</div><div class="pp-recs">${recHtml}</div></div>` : ''}
  </div>`;
}

function buildMacroPopup(feature, recs, totalH, color) {
  const p = feature.properties;
  const pctMax = maxH > 0 ? (totalH/maxH*100).toFixed(0) : 0;
  const avg    = recs.length ? Math.round(totalH/recs.length) : 0;
  const top    = recs.slice().sort((a,b)=>(b.h||0)-(a.h||0)).slice(0,6);
  let recHtml  = top.map(recRow).join('');
  if (recs.length > 6) recHtml += `<div class="pp-rec-more">+${recs.length-6} recintos más</div>`;
  return `<div class="pp-card pp-macro">
    <div class="pp-header" style="border-left:4px solid ${color}">
      <div class="pp-title" style="color:${color}">📍 ${p.macrodistrito}</div>
      <div class="pp-subtitle">Macrodistrito de La Paz · ${p.zonas_count||''} zonas</div>
    </div>
    <div class="pp-stats">
      <div class="pp-stat"><div class="pp-stat-val">${recs.length}</div><div class="pp-stat-lbl">Recintos</div></div>
      <div class="pp-stat"><div class="pp-stat-val">${totalH.toLocaleString('es')}</div><div class="pp-stat-lbl">Habilitados</div></div>
      <div class="pp-stat"><div class="pp-stat-val">${avg.toLocaleString('es')}</div><div class="pp-stat-lbl">Promedio</div></div>
    </div>
    <div class="pp-hab-section">
      <div class="pp-hab-bar-bg"><div class="pp-hab-bar-fill" style="width:${pctMax}%;background:${color}"></div></div>
      <span class="pp-hab-pct">${pctMax}% del máximo nacional</span>
    </div>
    ${recs.length > 0 ? `<div style="padding:0 14px 10px"><div class="pp-subtitle" style="margin-bottom:5px;text-transform:uppercase;letter-spacing:.05em">Top recintos</div><div class="pp-recs">${recHtml}</div></div>` : ''}
  </div>`;
}

// ═══════════════════ RENDER ═══════════════════════════════════════════════
function filtrarRecintos() {
  const dep  = document.getElementById('selDep').value;
  const muni = document.getElementById('selMuni').value;
  return recintos.filter(r => {
    if (dep  !== 'Todos' && r.d !== dep)  return false;
    if (muni !== 'Todos' && r.m !== muni) return false;
    return r.h > 0;
  });
}

function renderMapa() {
  if (!map) return;
  const filtered = filtrarRecintos();
  const radioM        = parseInt(document.getElementById('sliderRadio').value);
  const opacity       = parseFloat(document.getElementById('sliderOpacity').value);
  const paleta        = document.getElementById('selPaleta').value;
  const puntosOpacity = parseFloat(document.getElementById('sliderPuntosOpacity').value);

  currentPalette = paleta;
  calcularQuintiles(filtered);   // quintiles sobre los datos visibles actualmente

  // KDE canvas
  if (!kdePainter) { kdePainter = new KdeLayer(); kdePainter.addTo(map); }
  kdePainter.setData(filtered, radioM, opacity, paleta);

  // Markers
  markersLayer.clearLayers();
  if (document.getElementById('layerPuntos').checked && puntosOpacity > 0) {
    const zoom   = map.getZoom();
    const radius = zoom <= 6 ? 0.8 : zoom <= 8 ? 1.2 : zoom <= 10 ? 1.8 : zoom <= 12 ? 2.2 : 2.8;
    filtered.forEach(r => {
      const clase = clasePunto(r.h||0);
      const col   = colorClasePunto(clase);
      const m = L.circleMarker([r.la, r.lo], {
        radius,
        fillColor: col,
        color: 'rgba(0,0,0,0.3)',
        weight: 0.6,
        fillOpacity: puntosOpacity,
        bubblingMouseEvents: false
      });
      m.on('click', e => { L.DomEvent.stopPropagation(e); abrirModal(r); });
      m.addTo(markersLayer);
    });
  }

  actualizarStats(filtered);
  actualizarLeyenda(paleta);
  actualizarLeyendaPuntos();
}

function actualizarStats(filtered) {
  const total  = filtered.length;
  const totalH = filtered.reduce((s, r) => s + (r.h||0), 0);
  const habArr = filtered.map(r => r.h||0).filter(h => h > 0);
  const maxRec = filtered.reduce((a, b) => (a.h||0) > (b.h||0) ? a : b, {});
  const minH   = habArr.length ? Math.min(...habArr) : 0;
  const avg    = total ? Math.round(totalH / total) : 0;

  document.getElementById('stRecintos').textContent = total.toLocaleString('es');
  document.getElementById('stHab').textContent      = totalH.toLocaleString('es');
  document.getElementById('stMax').textContent      = `${(maxRec.h||0).toLocaleString('es')} hab`;
  document.getElementById('stAvg').textContent      = `${avg.toLocaleString('es')} hab`;
  document.getElementById('stMin').textContent      = `${minH.toLocaleString('es')} hab`;
  document.querySelector('#statRecintos .stat-num').textContent = total.toLocaleString('es');
  document.querySelector('#statHab .stat-num').textContent      = totalH.toLocaleString('es');
  document.querySelector('#statMax .stat-num').textContent      = (maxRec.h||0).toLocaleString('es');
}

function actualizarLeyenda(paleta) {
  const stops = PALETTES[paleta] || PALETTES['Fuego'];
  const parts = stops.map((s, i) => `rgb(${s[0]},${s[1]},${s[2]}) ${Math.round(i/(stops.length-1)*100)}%`);
  const grad  = `linear-gradient(to right, ${parts.join(',')})`;
  // Panel (si existe el elemento viejo)
  const elOld = document.querySelector('.legend-gradient');
  if (elOld) elOld.style.background = grad;
  // Widget flotante
  const mlBar = document.getElementById('mlKdeBar');
  if (mlBar) mlBar.style.background = grad;
}

function actualizarLeyendaPuntos() {
  const el = document.getElementById('mlPtRows');
  if (!el) return;
  const tValues = [0.1, 0.3, 0.5, 0.72, 0.92];
  const fmt = n => Math.round(n).toLocaleString('es');

  // Rangos exactos derivados de los cortes nacionales
  const ranges = [
    `${fmt(POINT_BREAKS[0] + 1)} – ${fmt(POINT_BREAKS[1])}`,
    `${fmt(POINT_BREAKS[1] + 1)} – ${fmt(POINT_BREAKS[2])}`,
    `${fmt(POINT_BREAKS[2] + 1)} – ${fmt(POINT_BREAKS[3])}`,
    `${fmt(POINT_BREAKS[3] + 1)} – ${fmt(POINT_BREAKS[4])}`,
    `> ${fmt(POINT_BREAKS[4])}`
  ];

  el.innerHTML = tValues.map((t, i) => {
    const [R, G, B] = paletteColor(t, currentPalette);
    const col = `rgb(${R},${G},${B})`;
    const n   = POINT_N_PER_CLASS[i] ? POINT_N_PER_CLASS[i].toLocaleString('es') : '—';
    return `<div class="ml-row">
      <span class="ml-dot" style="background:${col};box-shadow:0 0 5px ${col}88"></span>
      <span class="ml-lbl">${ranges[i]}</span>
      <span class="ml-q">Q${i+1} · ${n}</span>
    </div>`;
  }).join('');
}

// ═══════════════════ MODAL ═══════════════════════════════════════════════
function abrirModal(rec) {
  document.getElementById('modalTitle').textContent = rec.r;
  document.getElementById('modalSub').textContent   = `${rec.c} · ${rec.m}, ${rec.d} · ${rec.ms||1} mesa(s)`;

  const ratio = maxH > 0 ? (rec.h||0) / maxH : 0;
  const pct   = (ratio * 100).toFixed(1);
  const color = colorPorIntensidad(rec.h||0);

  const filtrados = filtrarRecintos();
  const sorted    = filtrados.slice().sort((a, b) => (b.h||0) - (a.h||0));
  const rankPos   = sorted.findIndex(r => r.c === rec.c) + 1;
  const mismaMuni = filtrados.filter(r => r.m === rec.m && r.d === rec.d).sort((a, b) => (b.h||0) - (a.h||0));

  const rankHtml = mismaMuni.slice(0, 5).map((r, i) => {
    const es = r.c === rec.c;
    return `<div class="m-rank-row" style="${es ? 'background:rgba(255,154,92,.07);border-radius:4px;padding-left:4px' : ''}">
      <span class="m-rank-pos">#${i+1}</span>
      <span class="m-rank-name" style="${es ? 'color:#ff9a5c;font-weight:700' : ''}">${r.r}</span>
      <span class="m-rank-val">${(r.h||0).toLocaleString('es')}</span>
    </div>`;
  }).join('');

  document.getElementById('modalBody').innerHTML = `
    <div class="m-stats">
      <div class="m-stat highlight"><span class="m-stat-v" style="color:${color}">${(rec.h||0).toLocaleString('es')}</span><span class="m-stat-l">habilitados</span></div>
      <div class="m-stat"><span class="m-stat-v">${rec.ms||1}</span><span class="m-stat-l">mesas</span></div>
      <div class="m-stat"><span class="m-stat-v">#${rankPos}</span><span class="m-stat-l">de ${filtrados.length.toLocaleString('es')}</span></div>
    </div>
    <div class="m-hab-section">
      <div class="m-hab-label"><span>% del máximo nacional</span><span class="m-hab-pct-txt">${pct}%</span></div>
      <div class="m-hab-bg"><div class="m-hab-fill" id="mHabFill" style="width:0%;background:${color}"></div></div>
    </div>
    ${mismaMuni.length > 1 ? `<div class="m-rank-section"><span class="m-rank-label">Top recintos en ${rec.m}</span>${rankHtml}</div>` : ''}
  `;

  document.getElementById('modalOverlay').classList.add('open');
  setTimeout(() => { const f = document.getElementById('mHabFill'); if (f) f.style.width = `${pct}%`; }, 60);
}

function cerrarModal() { document.getElementById('modalOverlay').classList.remove('open'); }

// ═══════════════════ BÚSQUEDA ════════════════════════════════════════════
function buscar(t, cid) {
  const c = document.getElementById(cid);
  if (!c) return;
  if (searchTimeout) clearTimeout(searchTimeout);
  const q = t.trim().toLowerCase();
  if (!q) { c.innerHTML = ''; c.classList.remove('show'); return; }
  searchTimeout = setTimeout(() => {
    const res = recintos.filter(r =>
      r.c.toLowerCase().includes(q) || r.r.toLowerCase().includes(q) ||
      r.m.toLowerCase().includes(q) || r.d.toLowerCase().includes(q)
    ).sort((a, b) => (b.h||0) - (a.h||0)).slice(0, 12);
    if (!res.length) { c.innerHTML = '<div class="sr-empty">Sin resultados</div>'; c.classList.add('show'); return; }
    c.innerHTML = res.map(r => `<div class="sr-item" onclick="irA('${r.c}','${cid}')">
      <span class="sr-icon">🔥</span>
      <div class="sr-info">
        <div class="sr-name">${hl(r.r, q)}</div>
        <div class="sr-detail">${hl(r.c, q)} · ${r.m} · <strong style="color:#ff9a5c">${(r.h||0).toLocaleString('es')} hab</strong></div>
      </div>
    </div>`).join('');
    c.classList.add('show');
  }, 100);
}

function hl(t, q) { return t.replace(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '<mark>$1</mark>'); }

function irA(cod, cid) {
  const r = recintos.find(x => x.c === cod);
  if (!r) return;
  document.getElementById(cid).classList.remove('show');
  document.getElementById('floatSearch')?.classList.remove('show');
  if (window.innerWidth <= 768) { document.getElementById('panel').classList.add('collapsed'); const fab=document.getElementById('panelFab'); if(fab) fab.classList.remove('open'); }
  map.setView([r.la, r.lo], 14, { animate: true });
  setTimeout(() => abrirModal(r), 350);
}

// ═══════════════════ FILTROS ════════════════════════════════════════════
function fitMapToFiltered(filtered) {
  if (!map || !filtered.length) return;
  const lats = filtered.map(r => r.la);
  const lons = filtered.map(r => r.lo);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLon = Math.min(...lons), maxLon = Math.max(...lons);
  // Pequeño padding para que los puntos del borde no queden cortados
  const padLat = (maxLat - minLat) * 0.08 || 0.05;
  const padLon = (maxLon - minLon) * 0.08 || 0.05;
  map.fitBounds(
    [[minLat - padLat, minLon - padLon], [maxLat + padLat, maxLon + padLon]],
    { animate: true, duration: 0.6 }
  );
}

function llenarFiltros() {
  const deps = [...new Set(recintos.map(r => r.d).filter(Boolean))].sort();
  const s = document.getElementById('selDep');
  s.innerHTML = '<option value="Todos">Todos</option>';
  deps.forEach(d => { s.innerHTML += `<option value="${d}">${d}</option>`; });
}

function actualizarMunicipios() {
  const dep = document.getElementById('selDep').value;
  const s   = document.getElementById('selMuni');
  s.innerHTML = '<option value="Todos">Todos</option>';
  if (dep === 'Todos') return;
  [...new Set(recintos.filter(r => r.d === dep).map(r => r.m))].sort()
    .forEach(m => { s.innerHTML += `<option value="${m}">${m}</option>`; });
}

// ═══════════════════ UI HELPERS ══════════════════════════════════════════
function showLoader(t) { document.getElementById('loaderText').textContent = t; document.getElementById('loader').classList.add('show'); }
function hideLoader()  { document.getElementById('loader').classList.remove('show'); }
function showToast(m, type) {
  const t = document.getElementById('toast');
  document.getElementById('toastIcon').textContent = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
  document.getElementById('toastMsg').textContent  = m;
  t.className = 'toast show ' + (type||'');
  setTimeout(() => t.classList.remove('show'), 3500);
}

// ═══════════════════ INIT ════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', function () {

  inicializarMapa();

  if (typeof R !== 'undefined' && R.length > 0) {
    recintos = R.filter(r => r.la && r.lo && r.h > 0);
    maxH     = Math.max(...recintos.map(r => r.h||0), 1);
    llenarFiltros();
    renderMapa();
    showToast(`${recintos.length.toLocaleString('es')} recintos · KDE cuártico`, 'success');
  } else {
    showToast('No se encontraron datos', 'error');
  }

  document.getElementById('modalClose').addEventListener('click', cerrarModal);
  document.getElementById('modalOverlay').addEventListener('click', e => { if (e.target.id === 'modalOverlay') cerrarModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { cerrarModal(); document.getElementById('legendPanel')?.classList.remove('open'); document.getElementById('legendBtn')?.classList.remove('active'); } });

  // Créditos
  document.getElementById('mapCredit').addEventListener('click', () => {
    document.getElementById('creditsOverlay').classList.add('open');
  });
  document.getElementById('creditsClose').addEventListener('click', () => {
    document.getElementById('creditsOverlay').classList.remove('open');
  });
  document.getElementById('creditsOverlay').addEventListener('click', e => {
    if (e.target.id === 'creditsOverlay') document.getElementById('creditsOverlay').classList.remove('open');
  });
  document.getElementById('legendBtn').addEventListener('click', () => {
    const panel = document.getElementById('legendPanel');
    const btn   = document.getElementById('legendBtn');
    panel.classList.toggle('open');
    btn.classList.toggle('active');
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('#legendFab')) {
      document.getElementById('legendPanel')?.classList.remove('open');
      document.getElementById('legendBtn')?.classList.remove('active');
    }
  });

  document.getElementById('selDep').addEventListener('change', () => {
    actualizarMunicipios();
    document.getElementById('selMuni').value = 'Todos';
    renderMapa();
    fitMapToFiltered(filtrarRecintos());
  });
  document.getElementById('selMuni').addEventListener('change', () => {
    renderMapa();
    fitMapToFiltered(filtrarRecintos());
  });

  document.getElementById('sliderRadio').addEventListener('input', function () {
    document.getElementById('valRadio').textContent = `${this.value} m`;
    renderMapa();
  });
  document.getElementById('sliderOpacity').addEventListener('input', function () {
    document.getElementById('valOpacity').textContent = parseFloat(this.value).toFixed(2);
    renderMapa();
  });

  document.getElementById('sliderPuntosOpacity').addEventListener('input', function () {
    const val = Math.round(parseFloat(this.value) * 100);
    document.getElementById('valPuntosOpacity').textContent = `${val}%`;
    renderMapa();
  });

  document.getElementById('selPaleta').addEventListener('change', renderMapa);
  document.getElementById('selBasemap').addEventListener('change', function () { aplicarMapaBase(this.value); });

  document.getElementById('searchInput').addEventListener('input', function () { buscar(this.value, 'searchResults'); });
  document.getElementById('floatSearchInput').addEventListener('input', function () { buscar(this.value, 'floatResults'); });

  document.getElementById('btnSearch').addEventListener('click', () => {
    const f = document.getElementById('floatSearch');
    f.classList.toggle('show');
    if (f.classList.contains('show')) document.getElementById('floatSearchInput').focus();
  });
  document.getElementById('floatClose').addEventListener('click', () => { document.getElementById('floatSearch').classList.remove('show'); });

  document.addEventListener('click', e => {
    if (!e.target.closest('.search-box') && !e.target.closest('.search-results') && !e.target.closest('.float-search')) {
      document.getElementById('searchResults').classList.remove('show');
      document.getElementById('floatResults').classList.remove('show');
    }
  });

  function togglePanel() {
    const panel = document.getElementById('panel');
    const fab   = document.getElementById('panelFab');
    const isCollapsed = panel.classList.toggle('collapsed');
    fab.classList.toggle('open', !isCollapsed);
  }

  // Panel: colapsado por defecto en móvil
  if (window.innerWidth <= 768) {
    document.getElementById('panel').classList.add('collapsed');
    document.getElementById('panelFab').classList.remove('open');
  }

  document.getElementById('btnPanel').addEventListener('click', togglePanel);
  document.getElementById('panelFab').addEventListener('click', togglePanel);

  document.addEventListener('click', e => {
    if (window.innerWidth <= 768 && !e.target.closest('.panel') && !e.target.closest('#btnPanel') && !e.target.closest('#panelFab'))
      document.getElementById('panel').classList.add('collapsed');
  });

  document.getElementById('layerZonas').addEventListener('change',  function () { toggleZonas(this.checked); });
  document.getElementById('layerMacros').addEventListener('change', function () { toggleMacros(this.checked); });
  document.getElementById('layerPuntos').addEventListener('change', renderMapa);
});
