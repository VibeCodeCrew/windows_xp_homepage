// ==================== STORAGE KEYS ====================
const STORAGE = {
    tiles:      'edge_tiles',
    addBtnPos:  'edge_addbtn_pos',
    cols:       'edge_cols',
    tileWidth:  'edge_tile_width',
    tileHeight: 'edge_tile_height',
    opacity:    'edge_tile_opacity',
    blur:       'edge_tile_blur',
    bg:         'edge_custom_bg',
    trash:      'edge_trash',
    username:   'edge_username',
    notepad:    'edge_notepad',
    viewMode:   'edge_view_mode',
    snapToGrid: 'edge_snap_grid',
    posGlass:       'edge_pos_glass',
    iconSize:       'edge_icon_size',
    glassTileWidth: 'edge_glass_tile_width',
    glassTileHeight:'edge_glass_tile_height',
    glassGap:       'edge_glass_gap',
    glassSnap:      'edge_glass_snap',
    glassPreset:    'edge_glass_preset',
    glassCols:      'edge_glass_cols',
    glassBlur:      'edge_glass_blur',
};

const SNAP_TILE = 10;  // tile/window mode: fine-grid snap (px)
const ICON_W    = 80;  // icon mode: rendered icon width  (px)
const ICON_H    = 88;  // icon mode: rendered icon height (px)
const ICON_CELL = 96;  // icon mode: grid cell = icon + gap (px)
const TITLEBAR_H = 19; // tile titlebar height in px

// Mode-specific position key: posIcon (icon mode), posGlass (glass mode) or posTile (tile mode)
function getPosKey() {
  if (settings.viewMode === 'icon') return 'posIcon';
  if (settings.viewMode === 'glass') return 'posGlass';
  return 'posTile';
}
// Snap size: icon-cell-sized in icon mode, 16px in glass mode, fine in tile mode
function getSnap() { return settings.snapToGrid ? (settings.viewMode === 'icon' ? (settings.iconSize + 16) : (settings.viewMode === 'glass' ? 16 : SNAP_TILE)) : 1; }

// ==================== STATE ====================
let links = JSON.parse(localStorage.getItem(STORAGE.tiles)) || [
    { name: 'Яндекс',  url: 'https://ya.ru' },
    { name: 'YouTube', url: 'https://youtube.com' },
];
let trashedLinks = JSON.parse(localStorage.getItem(STORAGE.trash)) || [];
let username     = localStorage.getItem(STORAGE.username) || 'User';
let selectedIndices = new Set();
let minimizedTiles  = new Set(); // indices of tiles minimized to taskbar
let minesweeperLosses = 0;

let settings = {
    tileWidth:  parseInt(localStorage.getItem(STORAGE.tileWidth))  || 130,
    tileHeight: parseInt(localStorage.getItem(STORAGE.tileHeight)) || 90,
    opacity:    parseFloat(localStorage.getItem(STORAGE.opacity))  || 0.9,
    blur:       localStorage.getItem(STORAGE.blur) === 'true',
    viewMode:   localStorage.getItem(STORAGE.viewMode)  || 'glass', // 'glass' | 'window' | 'icon'
    snapToGrid:     localStorage.getItem(STORAGE.snapToGrid) !== 'false',
    iconSize:       parseInt(localStorage.getItem(STORAGE.iconSize))       || 80,
    glassTileWidth: parseInt(localStorage.getItem(STORAGE.glassTileWidth)) || 120,
    glassTileHeight:parseInt(localStorage.getItem(STORAGE.glassTileHeight))|| 89,
    glassGap:       parseInt(localStorage.getItem(STORAGE.glassGap))       || 16,
    glassSnap:      localStorage.getItem(STORAGE.glassSnap) !== 'false',
    glassPreset:    localStorage.getItem(STORAGE.glassPreset) || 'medium',
    glassCols:      parseInt(localStorage.getItem(STORAGE.glassCols)) || 5,
    glassBlur:      localStorage.getItem(STORAGE.glassBlur) === 'true',
    glassScreenshotBg: localStorage.getItem('edge_glass_screenshot_bg') === 'true',
};
// Resolve tile size from preset if not manually set (or migrating from old horizontal defaults)
(function() {
    function computePresetSize(preset, gap) {
        var dw = window.innerWidth, g = gap || 16;
        var cols = {large:3, medium:5, small:7}[preset] || 5;
        return Math.max(70, Math.min(300, Math.floor((dw - 32 + g) / cols - g)));
    }
    var needReset = !settings.glassTileWidth || settings.glassTileHeight <= 60;
    if (needReset) {
        var sz = computePresetSize(settings.glassPreset, settings.glassGap);
        settings.glassTileWidth = sz; settings.glassTileHeight = sz;
        localStorage.setItem(STORAGE.glassTileWidth, sz);
        localStorage.setItem(STORAGE.glassTileHeight, sz);
    }
}());

function saveLinks() {
    function strip(item) {
        const c = Object.assign({}, item);
        delete c.screenshot;
        if (c.items) c.items = c.items.map(strip);
        return c;
    }
    localStorage.setItem(STORAGE.tiles, JSON.stringify(links.map(strip)));
}
function saveAndRender() {
    saveLinks(); renderDesktop();
    if (typeof clippySay === 'function' && typeof _clippyPrevLinksLen !== 'undefined') {
        if (links.length > _clippyPrevLinksLen) {
            if (links.length === 1) setTimeout(function(){ clippySay(CLIPPY_MSGS.react_created, 'wave'); }, 500);
            else if (links.length > 5) setTimeout(function(){ clippySay(CLIPPY_MSGS.tip_general, 'think'); }, 600);
        }
        _clippyPrevLinksLen = links.length;
    }
}

// ==================== SCREENSHOT STORAGE ====================
const SS_PREFIX = 'ss_';
function screenshotKey(url) { return SS_PREFIX + url; }
function saveScreenshot(url, dataUrl) {
    if (typeof chrome !== 'undefined' && chrome.storage) chrome.storage.local.set({ [screenshotKey(url)]: dataUrl });
}
function deleteScreenshot(url) {
    if (typeof chrome !== 'undefined' && chrome.storage) chrome.storage.local.remove(screenshotKey(url));
}
// Loads screenshots from chrome.storage.local into in-memory links items.
// Also migrates any old base64 screenshots found in localStorage.
function initScreenshots(callback) {
    if (typeof chrome === 'undefined' || !chrome.storage) { callback(); return; }
    // Collect screenshots already in memory (old localStorage format) for migration
    const toMigrate = {};
    function collectOld(items) {
        items.forEach(function(item) {
            if (item.url && item.screenshot) toMigrate[screenshotKey(item.url)] = item.screenshot;
            if (item.isFolder && item.items) collectOld(item.items);
        });
    }
    collectOld(links);
    function doLoad() {
        const urlMap = {};
        links.forEach(function(item) {
            if (!item.isFolder && item.url) urlMap[screenshotKey(item.url)] = item;
            if (item.isFolder && item.items) item.items.forEach(function(child) { if (child.url) urlMap[screenshotKey(child.url)] = child; });
        });
        const keys = Object.keys(urlMap);
        if (!keys.length) { callback(); return; }
        chrome.storage.local.get(keys, function(result) {
            keys.forEach(function(k) { if (result[k]) urlMap[k].screenshot = result[k]; });
            callback();
        });
    }
    if (Object.keys(toMigrate).length > 0) {
        chrome.storage.local.set(toMigrate, function() { saveLinks(); doLoad(); });
    } else {
        doLoad();
    }
}

// ==================== SELECTION ====================
function selectIcon(index, ctrlKey) {
    if (ctrlKey) {
        if (selectedIndices.has(index)) selectedIndices.delete(index);
        else selectedIndices.add(index);
    } else {
        selectedIndices.clear();
        selectedIndices.add(index);
    }
    updateSelectionUI();
}

function clearSelection() {
    selectedIndices.clear();
    updateSelectionUI();
}

function updateSelectionUI() {
    document.querySelectorAll('.desktop-icon[data-index]').forEach(function(el) {
        const idx = parseInt(el.dataset.index);
        const sel = !isNaN(idx) && selectedIndices.has(idx);
        el.classList.toggle('selected', sel);
        const xi = el.querySelector('.xp-icon');
        if (xi) xi.classList.toggle('selected', sel);
    });
}

// ==================== UTILITIES ====================
function escapeHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}
function getFaviconUrl(url) {
    try {
        const urlObj = new URL(url);
        // Используем внутренний сервис Chrome для фавиконок
        return `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(urlObj.href)}&size=32`;
    } catch (e) {
        return '';
    }
}

const pageLoadTime = Date.now();

// ==================== BSOD ====================
function triggerBSOD() {
    const bsod = document.createElement('div');
    bsod.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#0000aa;color:#fff;font-family:"Lucida Console","Courier New",monospace;font-size:14px;line-height:1.6;z-index:99999;padding:48px 60px;box-sizing:border-box;white-space:pre-wrap;';
    bsod.textContent = [
        'A problem has been detected and Windows has been shut down to prevent damage',
        'to your computer.',
        '',
        'IRQL_NOT_LESS_OR_EQUAL',
        '',
        'If this is the first time you\'ve seen this Stop error screen,',
        'restart your computer. If this screen appears again, follow',
        'these steps:',
        '',
        'Check to make sure any new hardware or software is properly installed.',
        'If this is a new installation, ask your hardware or software manufacturer',
        'for any Windows updates you might need.',
        '',
        'If problems continue, disable or remove any newly installed hardware',
        'or software. Disable BIOS memory options such as caching or shadowing.',
        'If you need to use Safe Mode to remove or disable components, restart',
        'your computer, press F8 to select Advanced Startup Options, and',
        'then select Safe Mode.',
        '',
        'Technical information:',
        '',
        '*** STOP: 0x0000000A (0x00000000, 0x00000002, 0x00000001, 0x804E5BD5)',
        '',
        'Beginning dump of physical memory',
        'Physical memory dump complete.',
        'Contact your system administrator or technical support group for further',
        'assistance.',
    ].join('\n');
    document.body.appendChild(bsod);
    playSound('error');
    minesweeperLosses = 0;
    // После BSOD — экран загрузки XP, затем звук запуска
    setTimeout(function() {
        bsod.style.transition = 'opacity 0.3s';
        bsod.style.opacity = '0';
        setTimeout(function() {
            bsod.remove();
            setTimeout(function(){ if (typeof clippySay === 'function') clippySay(CLIPPY_MSGS.react_bsod, 'alert'); }, 3000);
            showXPBoot(function() {
                playSound('startup');
            });
        }, 300);
    }, 8000);
}

function showXPBoot(onDone) {
    const boot = document.createElement('div');
    boot.id = 'xp-boot-screen';
    boot.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#000;z-index:99998;display:flex;flex-direction:column;align-items:center;justify-content:center;';
    boot.innerHTML =
        '<div style="display:flex;align-items:center;gap:18px;margin-bottom:40px;">' +
        '<svg width="48" height="48" viewBox="0 0 48 48"><rect x="0" y="0" width="22" height="22" fill="#f35325"/><rect x="26" y="0" width="22" height="22" fill="#81bc06"/><rect x="0" y="26" width="22" height="22" fill="#05a6f0"/><rect x="26" y="26" width="22" height="22" fill="#ffba08"/></svg>' +
        '<div><div style="color:#fff;font-family:\'Franklin Gothic Medium\',\'Arial Narrow\',Arial,sans-serif;font-size:36px;font-weight:300;letter-spacing:1px;">Windows<span style="font-style:italic;"> XP</span></div>' +
        '<div style="color:#ccc;font-family:Tahoma,sans-serif;font-size:11px;letter-spacing:2px;">Professional</div></div>' +
        '</div>' +
        '<div id="xp-boot-bar" style="width:180px;height:14px;background:#111;border:1px solid #333;border-radius:2px;overflow:hidden;position:relative;">' +
        '<div id="xp-boot-progress" style="height:100%;width:0;background:linear-gradient(180deg,#3a8cf4 0%,#0555ee 100%);transition:none;"></div>' +
        '</div>' +
        '<div style="color:#aaa;font-family:Tahoma,sans-serif;font-size:10px;margin-top:10px;">Microsoft Corporation</div>';
    document.body.appendChild(boot);

    // Анимация progress bar — блоки двигаются справа налево как в XP
    let step = 0;
    const totalSteps = 18;
    const barEl = boot.querySelector('#xp-boot-progress');
    const barTimer = setInterval(function() {
        step++;
        // Бегущий блок: ширина ~30%, смещение по синусу
        const pos = (step / totalSteps) * 100;
        barEl.style.width = Math.min(pos, 100) + '%';
        if (step >= totalSteps) clearInterval(barTimer);
    }, 160);

    setTimeout(function() {
        clearInterval(barTimer);
        boot.style.transition = 'opacity 0.5s';
        boot.style.opacity = '0';
        if (onDone) onDone();
        setTimeout(function() { boot.remove(); }, 500);
    }, totalSteps * 160 + 400);
}

// ==================== CLOCK ====================
function updateClock() {
    const now = new Date();
    const te = document.getElementById('tray-time'), de = document.getElementById('tray-date');
    if (te) te.textContent = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    if (de) de.textContent = now.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

// ==================== SOUNDS ====================
let _xpAudioCtx = null, _xpGain = null;
function _getAudio() {
    if (!_xpAudioCtx) {
        try {
            _xpAudioCtx = new AudioContext();
            _xpGain = _xpAudioCtx.createGain();
            _xpGain.gain.value = parseFloat(localStorage.getItem('edge_volume') || '0.7');
            _xpGain.connect(_xpAudioCtx.destination);
        } catch(e) { return null; }
    }
    if (_xpAudioCtx.state === 'suspended') _xpAudioCtx.resume();
    return { ctx: _xpAudioCtx, gain: _xpGain };
}
function playSound(type) {
    const a = _getAudio(); if (!a) return;
    const ctx = a.ctx, master = a.gain;
    const t = ctx.currentTime;
    function tone(freq, startT, dur, wave, vol) {
        const og = ctx.createGain(); og.connect(master);
        const oo = ctx.createOscillator(); oo.connect(og);
        oo.type = wave || 'sine';
        oo.frequency.setValueAtTime(freq, t + startT);
        og.gain.setValueAtTime(vol || 0.18, t + startT);
        og.gain.exponentialRampToValueAtTime(0.0001, t + startT + dur);
        oo.start(t + startT); oo.stop(t + startT + dur + 0.02);
    }
    switch(type) {
        case 'open':     tone(523, 0, 0.07); tone(659, 0.06, 0.07); break;
        case 'close':    tone(659, 0, 0.07); tone(440, 0.06, 0.09); break;
        case 'minimize': tone(440, 0, 0.05); tone(330, 0.04, 0.08); break;
        case 'restore':  tone(330, 0, 0.05); tone(523, 0.04, 0.08); break;
        case 'error':    tone(180, 0, 0.12, 'sawtooth', 0.22); tone(150, 0.1, 0.15, 'sawtooth', 0.2); break;
        case 'notify':   tone(880, 0, 0.08); tone(1047, 0.07, 0.1); break;
        case 'startup':
            tone(523, 0, 0.15); tone(659, 0.12, 0.15); tone(784, 0.24, 0.2); tone(1047, 0.36, 0.3);
            break;
    }
}

// ==================== NOTIFICATIONS ====================
let _balloonOffset = 0;
function showNotification(title, text, icon, duration) {
    icon = icon || '💬'; duration = duration || 4000;
    playSound('notify');
    const el = document.createElement('div');
    el.className = 'xp-balloon';
    el.style.bottom = (44 + _balloonOffset) + 'px';
    _balloonOffset += 72;
    el.innerHTML =
        '<div class="xp-balloon-head">' +
        '<span class="xp-balloon-icon">' + icon + '</span>' +
        '<span class="xp-balloon-title">' + escapeHtml(title) + '</span>' +
        '</div>' +
        '<div class="xp-balloon-text">' + escapeHtml(text) + '</div>' +
        '<span class="xp-balloon-close">\u2715</span>';
    document.body.appendChild(el);
    let _removed = false;
    function remove() {
        if (_removed) return; _removed = true;
        _balloonOffset = Math.max(0, _balloonOffset - 72);
        el.style.opacity = '0'; el.style.transition = 'opacity 0.2s';
        setTimeout(function() { if (el.parentNode) el.remove(); }, 220);
    }
    el.querySelector('.xp-balloon-close').addEventListener('click', remove);
    setTimeout(remove, duration);
}

// ==================== PROPORTIONAL POSITIONING ====================
// Each item stores posIcon / posTile: {x, y, dw, dh} — one per view mode.
// x/y are pixels at save time; dw/dh are the desktop size at that moment.
// On render, positions are scaled → icons return proportionally after resize.
function getDisplayPos(item) {
    const desktop = document.getElementById('desktop');
    const cw = desktop ? desktop.offsetWidth  : window.innerWidth;
    const ch = desktop ? desktop.offsetHeight : (window.innerHeight - 44);
    const pos  = item ? item[getPosKey()] : null;
    const refW = (pos && pos.dw) ? pos.dw : cw;
    const refH = (pos && pos.dh) ? pos.dh : ch;
    return {
        x: (pos && pos.x !== undefined) ? pos.x * (cw / refW) : 0,
        y: (pos && pos.y !== undefined) ? pos.y * (ch / refH) : 0,
    };
}

// ==================== ICON DIMENSIONS ====================
function getIconDim(item) {
  if (settings.viewMode === 'icon') { const sz = settings.iconSize; return { w: sz, h: Math.round(sz * 1.1) }; }
  if (settings.viewMode === 'glass') return { w: settings.glassTileWidth, h: settings.glassTileHeight };
  const w = (item && item.w) ? item.w : settings.tileWidth;
  const h = (item && item.h) ? item.h : settings.tileHeight;
  return { w: w, h: h + TITLEBAR_H };
}

// ==================== AUTO-ARRANGE (assign positions) ====================
// Glass grid constants
var GLASS_MARGIN = 16, GLASS_TOP = 90;

function getGlassGrid(dw, dh) {
    var gap   = settings.glassGap || 16;
    var cellW = settings.glassTileWidth  + gap;
    var cellH = settings.glassTileHeight + gap;
    var cols  = Math.max(1, Math.floor((dw - GLASS_MARGIN * 2 + gap) / cellW));
    var startX = Math.max(GLASS_MARGIN, Math.floor((dw - cols * cellW + gap) / 2));
    // Vertical centering
    var startY = GLASS_TOP;
    if (dh) {
        var rows = Math.ceil((window._glassItemCount || 1) / cols);
        var totalH = rows * cellH - gap;
        var availH = dh - GLASS_TOP;
        if (availH > totalH) startY = GLASS_TOP + Math.floor((availH - totalH) / 2);
    }
    return { cellW: cellW, cellH: cellH, cols: cols, startX: startX, startY: startY, gap: gap };
}

function glassPresetSize(preset) {
    var dw = window.innerWidth, g = settings.glassGap || 16;
    var cols = {large:3, medium:5, small:7}[preset] || 5;
    return Math.max(70, Math.min(300, Math.floor((dw - 32 + g) / cols - g)));
}

function glassCapacity(size, gap) {
    var g = (gap != null) ? gap : (settings.glassGap || 16);
    var dw = window.innerWidth, dh = window.innerHeight - 40 - GLASS_TOP;
    var cols = Math.max(1, Math.floor((dw - 32 + g) / (size + g)));
    var rows = Math.max(1, Math.floor((dh + g) / (size + g)));
    return { cols: cols, rows: rows, total: cols * rows };
}

function assignPositions(forceAll) {
    const GAP = 8, MARGIN = 10;
    const desktopEl = document.getElementById('desktop');
    const dw = desktopEl ? desktopEl.offsetWidth  : window.innerWidth;
    const dh = (desktopEl ? desktopEl.offsetHeight : (window.innerHeight - 44)) - GAP;
    const pk = getPosKey();

    if (settings.viewMode === 'glass') {
        window._glassItemCount = links.length;
        var g = getGlassGrid(dw, dh);
        var col = 0, row = 0;
        links.forEach(function(item) {
            if (forceAll || !item[pk]) {
                item[pk] = {
                    x: g.startX + col * g.cellW,
                    y: g.startY + row * g.cellH,
                    dw: dw, dh: dh + GAP
                };
            }
            col++;
            if (col >= g.cols) { col = 0; row++; }
        });
    } else {
        let x = MARGIN, y = MARGIN;
        links.forEach(function(item) {
            if (forceAll || !item[pk]) {
                item[pk] = { x: x, y: y, dw: dw, dh: dh + GAP };
            }
            const dim = getIconDim(item);
            y += dim.h + GAP;
            if (y + dim.h > dh) { y = MARGIN; x += dim.w + GAP; }
        });
    }
}

function autoArrange() {
    assignPositions(true);
    saveAndRender();
}

// ==================== ANTI-OVERLAP: find nearest free position ====================
// Returns {x, y} at or near (x, y) that doesn't overlap any desktop icon.
// excludeEls: Set of DOM elements to ignore (the ones being placed).
function findFreePosition(x, y, w, h, excludeEls) {
    var container = document.getElementById('desktop');
    if (!container) return { x: x, y: y };
    var dw = container.offsetWidth, dh = container.offsetHeight;
    var pad = 4;
    var occupied = [];
    document.querySelectorAll('.desktop-icon').forEach(function(el) {
        if (excludeEls && excludeEls.has(el)) return;
        var l = parseFloat(el.style.left) || 0;
        var t = parseFloat(el.style.top)  || 0;
        occupied.push({ l: l - pad, t: t - pad, r: l + el.offsetWidth + pad, b: t + el.offsetHeight + pad });
    });
    function collides(cx, cy) {
        return occupied.some(function(r) { return cx < r.r && cx + w > r.l && cy < r.b && cy + h > r.t; });
    }
    if (!collides(x, y)) return { x: x, y: y };
    var step = Math.max(SNAP_TILE, 10);
    for (var dist = step; dist < Math.max(dw, dh) * 2; dist += step) {
        for (var ox = -dist; ox <= dist; ox += step) {
            for (var oy = -dist; oy <= dist; oy += step) {
                if (Math.abs(ox) < dist && Math.abs(oy) < dist) continue;
                var nx = Math.max(0, Math.min(x + ox, dw - w));
                var ny = Math.max(0, Math.min(y + oy, dh - h));
                if (!collides(nx, ny)) {
                    var _fs = getSnap(); if (settings.snapToGrid) { nx = Math.round(nx / _fs) * _fs; ny = Math.round(ny / _fs) * _fs; }
                    return { x: nx, y: ny };
                }
            }
        }
    }
    return { x: x, y: y };
}

// ==================== DRAG (mouse-based free positioning) ====================
let dragData = null;

function initIconDrag(icon, item, index) {
    icon.addEventListener('mousedown', function(e) {
        if (e.button !== 0) return;
        if (e.target.closest('.tile-btns') || e.target.closest('.tile-resize-handle')) return;
        if (icon.classList.contains('add-btn-tile') || icon.classList.contains('add-btn-icon')) return;
        e.preventDefault();

        // If clicking an unselected icon, update selection
        if (!selectedIndices.has(index)) {
            if (!e.ctrlKey) { selectedIndices.clear(); selectedIndices.add(index); }
            else { selectedIndices.add(index); }
            updateSelectionUI();
        }

        if (selectedIndices.size > 1) {
            // Multi-drag: use VISUAL (scaled) positions as drag start
            const items = [];
            document.querySelectorAll('.desktop-icon[data-index]').forEach(function(el) {
                const idx = parseInt(el.dataset.index);
                if (selectedIndices.has(idx) && links[idx]) {
                    items.push({
                        icon: el, item: links[idx], index: idx,
                        iconX: parseFloat(el.style.left) || 0,
                        iconY: parseFloat(el.style.top)  || 0,
                    });
                }
            });
            dragData = { multi: true, items: items, startX: e.clientX, startY: e.clientY, moved: false };
        } else {
            dragData = {
                multi: false, icon: icon, item: item, index: index,
                startX: e.clientX, startY: e.clientY,
                // Use VISUAL (scaled) position, not raw stored coords
                iconX: parseFloat(icon.style.left) || 0,
                iconY: parseFloat(icon.style.top)  || 0,
                moved: false,
            };
        }
        // Cache desktop dimensions and folder icons for use in mousemove (avoids layout thrashing)
        const _desk = document.getElementById('desktop');
        dragData._dw = _desk ? _desk.offsetWidth : 1200;
        dragData._dh = _desk ? _desk.offsetHeight : 800;
        dragData._folderIcons = Array.from(document.querySelectorAll('.desktop-icon.folder-icon'));
        icon.style.zIndex = 999;
    });
}

document.addEventListener('mousemove', function(e) {
    if (!dragData) return;
    const dx = e.clientX - dragData.startX, dy = e.clientY - dragData.startY;
    if (!dragData.moved && Math.abs(dx) + Math.abs(dy) < 5) return;
    dragData.moved = true;

    const dw = dragData._dw || 1200;
    const dh = dragData._dh || 800;

    if (dragData.multi) {
        dragData.items.forEach(function(d) {
            d.icon.classList.add('dragging');
            let x = d.iconX + dx, y = d.iconY + dy;
            x = Math.max(0, Math.min(x, dw - d.icon.offsetWidth));
            y = Math.max(0, Math.min(y, dh - d.icon.offsetHeight));
            d.icon.style.left = x + 'px';
            d.icon.style.top  = y + 'px';
        });
        // Folder hover feedback for multi-drag
        const selectedIds = new Set(dragData.items.map(function(d) { return parseInt(d.icon.dataset.index); }));
        (dragData._folderIcons || []).forEach(function(fi) {
            const fIdx = parseInt(fi.dataset.index);
            if (selectedIds.has(fIdx)) { fi.classList.remove('drag-over'); return; }
            const fr = fi.getBoundingClientRect();
            fi.classList.toggle('drag-over', e.clientX >= fr.left && e.clientX <= fr.right && e.clientY >= fr.top && e.clientY <= fr.bottom);
        });
    } else {
        dragData.icon.classList.add('dragging');
        let x = dragData.iconX + dx, y = dragData.iconY + dy;
        x = Math.max(0, Math.min(x, dw - dragData.icon.offsetWidth));
        y = Math.max(0, Math.min(y, dh - dragData.icon.offsetHeight));
        dragData.icon.style.left = x + 'px';
        dragData.icon.style.top  = y + 'px';
        // folder hover feedback (single drag only)
        (dragData._folderIcons || []).forEach(function(fi) {
            const fIdx = parseInt(fi.dataset.index);
            if (fIdx === dragData.index || dragData.item.isFolder) { fi.classList.remove('drag-over'); return; }
            const fr = fi.getBoundingClientRect();
            fi.classList.toggle('drag-over', e.clientX >= fr.left && e.clientX <= fr.right && e.clientY >= fr.top && e.clientY <= fr.bottom);
        });
    }
});

document.addEventListener('mouseup', function(e) {
    if (!dragData) return;
    const dd = dragData; dragData = null;

    if (!dd.moved) {
        if (dd.multi) dd.items.forEach(function(d) { d.icon.style.zIndex = ''; });
        else dd.icon.style.zIndex = '';
        return;
    }

    const dw = dd._dw || 1200;
    const dh = dd._dh || 800;
    const dx = e.clientX - dd.startX, dy = e.clientY - dd.startY;

    if (dd.multi) {
        dd.items.forEach(function(d) { d.icon.classList.remove('dragging'); d.icon.style.zIndex = ''; });

        const selectedIds = new Set(dd.items.map(function(d) { return parseInt(d.icon.dataset.index); }));
        let intoFolder = false;

        // Helper: move all non-folder selected items into folder at fIdx
        function dropMultiIntoFolder(fIdx) {
            const toMove = dd.items.filter(function(d) { return !d.item.isFolder; })
                .sort(function(a, b) { return b.index - a.index; });
            let adjFIdx = fIdx;
            toMove.forEach(function(d) {
                if (d.index < adjFIdx) adjFIdx--;
                const moved = links.splice(d.index, 1)[0];
                if (moved) links[adjFIdx].items.push(moved);
            });
            // Refresh open folder window content (folder object reference is stable)
            const wEntry = wmWindows['folder-' + fIdx];
            if (wEntry && wEntry.el && wEntry.el._renderFolderContent) wEntry.el._renderFolderContent();
            intoFolder = true;
            selectedIndices.clear();
            saveAndRender();
        }

        // Check folder icons
        (dd._folderIcons || []).forEach(function(fi) {
            fi.classList.remove('drag-over');
            if (intoFolder) return;
            const fIdx = parseInt(fi.dataset.index);
            if (selectedIds.has(fIdx)) return;
            const fr = fi.getBoundingClientRect();
            if (e.clientX >= fr.left && e.clientX <= fr.right && e.clientY >= fr.top && e.clientY <= fr.bottom) {
                dropMultiIntoFolder(fIdx);
            }
        });

        // Check open folder windows
        if (!intoFolder) {
            Object.keys(wmWindows).forEach(function(wid) {
                if (intoFolder || !wid.startsWith('folder-')) return;
                const win = wmWindows[wid];
                if (!win || win.minimized) return;
                const rect = win.el.getBoundingClientRect();
                if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
                    const fIdx = parseInt(wid.replace('folder-', ''));
                    if (!isNaN(fIdx) && links[fIdx] && links[fIdx].isFolder && !selectedIds.has(fIdx)) {
                        dropMultiIntoFolder(fIdx);
                    }
                }
            });
        }

        if (!intoFolder) {
            const _gg = (settings.viewMode === 'glass' && settings.glassSnap) ? getGlassGrid(dw, dh) : null;
            dd.items.forEach(function(d) {
                let x = d.iconX + dx, y = d.iconY + dy;
                x = Math.max(0, Math.min(x, dw - d.icon.offsetWidth));
                y = Math.max(0, Math.min(y, dh - d.icon.offsetHeight));
                if (_gg) {
                    x = _gg.startX + Math.max(0, Math.round((x - _gg.startX) / _gg.cellW)) * _gg.cellW;
                    y = _gg.startY + Math.max(0, Math.round((y - _gg.startY) / _gg.cellH)) * _gg.cellH;
                } else if (settings.snapToGrid) { const _s1 = getSnap(); x = Math.round(x / _s1) * _s1; y = Math.round(y / _s1) * _s1; }
                d.item[getPosKey()] = { x: x, y: y, dw: dw, dh: dh };
                d.icon.style.left = x + 'px'; d.icon.style.top = y + 'px';
                d.icon._wasDragged = true;
            });
            saveLinks();
        }
        return;
    }

    // Single drag
    dd.icon.classList.remove('dragging');
    let x = dd.iconX + dx, y = dd.iconY + dy;
    x = Math.max(0, Math.min(x, dw - dd.icon.offsetWidth));
    y = Math.max(0, Math.min(y, dh - dd.icon.offsetHeight));
    if (settings.viewMode === 'glass' && settings.glassSnap) {
        const _gg = getGlassGrid(dw, dh);
        x = _gg.startX + Math.max(0, Math.round((x - _gg.startX) / _gg.cellW)) * _gg.cellW;
        y = _gg.startY + Math.max(0, Math.round((y - _gg.startY) / _gg.cellH)) * _gg.cellH;
    } else { const _snap = getSnap(); if (settings.snapToGrid) { x = Math.round(x / _snap) * _snap; y = Math.round(y / _snap) * _snap; } }

    // check folder drop (icon + open window)
    let intoFolder = false;
    if (!dd.item.isFolder) {
        (dd._folderIcons || []).forEach(function(fi) {
            fi.classList.remove('drag-over');
            if (intoFolder) return;
            const fIdx = parseInt(fi.dataset.index);
            const fr = fi.getBoundingClientRect();
            if (e.clientX >= fr.left && e.clientX <= fr.right && e.clientY >= fr.top && e.clientY <= fr.bottom) {
                const moved  = links.splice(dd.index, 1)[0];
                const adjIdx = dd.index < fIdx ? fIdx - 1 : fIdx;
                links[adjIdx].items.push(moved);
                // Refresh open folder window content
                const wEntry = wmWindows['folder-' + fIdx];
                if (wEntry && wEntry.el && wEntry.el._renderFolderContent) wEntry.el._renderFolderContent();
                intoFolder = true;
                saveAndRender();
            }
        });
        if (!intoFolder) {
            (dd._folderIcons || []).forEach(function(fi) { fi.classList.remove('drag-over'); });
            Object.keys(wmWindows).forEach(function(wid) {
                if (intoFolder || !wid.startsWith('folder-')) return;
                const win = wmWindows[wid];
                if (!win || win.minimized) return;
                const rect = win.el.getBoundingClientRect();
                if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
                    const fIdx = parseInt(wid.replace('folder-', ''));
                    if (!isNaN(fIdx) && links[fIdx] && links[fIdx].isFolder && fIdx !== dd.index) {
                        const moved  = links.splice(dd.index, 1)[0];
                        const adjIdx = dd.index < fIdx ? fIdx - 1 : fIdx;
                        links[adjIdx].items.push(moved);
                        const wEntry = wmWindows['folder-' + fIdx];
                        if (wEntry && wEntry.el && wEntry.el._renderFolderContent) wEntry.el._renderFolderContent();
                        intoFolder = true;
                        saveAndRender();
                    }
                }
            });
        }
    } else {
        document.querySelectorAll('.desktop-icon.folder-icon').forEach(function(fi) { fi.classList.remove('drag-over'); });
    }

    if (!intoFolder) {
        const fp = findFreePosition(x, y, dd.icon.offsetWidth, dd.icon.offsetHeight, new Set([dd.icon]));
        x = fp.x; y = fp.y;
        dd.item[getPosKey()] = { x: x, y: y, dw: dw, dh: dh };
        dd.icon.style.left = x + 'px'; dd.icon.style.top = y + 'px';
        dd.icon.style.zIndex = '';
        dd.icon._wasDragged = true;
        saveLinks();
    }
});

// ==================== GLASS OPACITY ====================
function applyGlassOpacity() {
    document.documentElement.style.setProperty('--glass-opacity', settings.opacity);
    document.documentElement.style.setProperty('--glass-tile-w', settings.glassTileWidth + 'px');
    document.documentElement.style.setProperty('--glass-tile-h', settings.glassTileHeight + 'px');
    const sz = settings.iconSize;
    document.documentElement.style.setProperty('--icon-w', sz + 'px');
    document.documentElement.style.setProperty('--icon-h', Math.round(sz * 1.1) + 'px');
    document.documentElement.style.setProperty('--icon-img', Math.round(sz * 0.4) + 'px');
}

// ==================== BACKGROUND ====================
var DEFAULT_BG = 'wprs/WiXP.jpg';

function applyBackground() {
    const bg = localStorage.getItem(STORAGE.bg) || DEFAULT_BG;
    const d = document.getElementById('desktop');
    d.style.backgroundImage = 'url(\'' + bg + '\')';
    d.style.backgroundSize = 'cover';
    d.style.backgroundPosition = 'center';
}

// ==================== DESKTOP RENDERING ====================
var glassDragIndex = null; // index of tile being dragged in glass grid

function renderDesktop() {
    // Glass grid mode — completely different rendering path
    if (settings.viewMode === 'glass') {
        renderGlassGrid();
        return;
    }

    assignPositions(false);

    // Migration: items with old flat x/y/dw/dh → mode-specific posIcon/posTile
    const desktopEl = document.getElementById('desktop');
    if (desktopEl) {
        const cw = desktopEl.offsetWidth, ch = desktopEl.offsetHeight;
        const pk = getPosKey();
        let migrated = false;
        links.forEach(function(item) {
            if (item.x !== undefined && !item[pk]) {
                item[pk] = { x: item.x, y: item.y, dw: item.dw || cw, dh: item.dh || ch };
                migrated = true;
            }
        });
        if (migrated) saveLinks();
    }

    const container = document.getElementById('desktop-icons');
    container.innerHTML = '';

    // Hide glass wrapper if switching away
    var gw = document.getElementById('glass-grid-wrapper');
    if (gw) gw.style.display = 'none';

    links.forEach(function(item, index) {
        const icon = settings.viewMode === 'window'
            ? (item.isFolder ? createFolderIconWindow(item, index) : createLinkIconWindow(item, index))
            : (item.isFolder ? createFolderIconXP(item, index)    : createLinkIconXP(item, index));
        placeIcon(icon, item);
        initIconDrag(icon, item, index);
        container.appendChild(icon);
    });

    var _addBtnEl = createAddButton(); if (_addBtnEl) container.appendChild(_addBtnEl);
    SYSTEM_ICONS_DEF.forEach(function(def, i) { container.appendChild(createSystemIcon(def, i)); });

    // Hide glass search bar
    var gsb = document.getElementById('glass-search-bar');
    if (gsb) gsb.style.display = 'none';

    // Re-apply minimized tile state; clean stale indices
    const staleMin = [];
    minimizedTiles.forEach(function(idx) {
        const el = container.querySelector('.desktop-icon[data-index="' + idx + '"]');
        if (el) { el.style.display = 'none'; addTileTaskbarBtn(idx); }
        else staleMin.push(idx);
    });
    staleMin.forEach(function(idx) { minimizedTiles.delete(idx); });
    document.querySelectorAll('.taskbar-tile-btn').forEach(function(btn) {
        const idx = parseInt(btn.dataset.tileIndex);
        if (isNaN(idx) || !links[idx]) btn.remove();
    });

    updateSelectionUI();
    applyGlassOpacity();
}

// ==================== GLASS GRID MODE ====================
function applyGlassGridVars() {
    document.documentElement.style.setProperty('--glass-cols', settings.glassCols);
    document.documentElement.style.setProperty('--glass-tile-w', settings.glassTileWidth + 'px');
    document.documentElement.style.setProperty('--glass-tile-h', settings.glassTileHeight + 'px');
    document.documentElement.style.setProperty('--glass-opacity', settings.opacity);
    document.documentElement.style.setProperty('--glass-blur', settings.glassBlur ? '12px' : '0px');
}

function renderGlassGrid() {
    applyGlassGridVars();

    // Hide desktop-icons (used by icon/window modes)
    var iconsContainer = document.getElementById('desktop-icons');
    if (iconsContainer) iconsContainer.innerHTML = '';

    var desktop = document.getElementById('desktop');

    // Create or reuse glass-grid-wrapper
    var wrapper = document.getElementById('glass-grid-wrapper');
    if (!wrapper) {
        wrapper = document.createElement('div');
        wrapper.id = 'glass-grid-wrapper';
        desktop.appendChild(wrapper);
    }
    wrapper.style.display = '';

    // Build search bar
    var gsb = document.getElementById('glass-search-bar');
    if (!gsb) {
        gsb = document.createElement('div');
        gsb.id = 'glass-search-bar';
        gsb.innerHTML =
            '<input id="gsb-input" type="text" placeholder="\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0437\u0430\u043f\u0440\u043e\u0441 \u0438\u043b\u0438 \u0430\u0434\u0440\u0435\u0441..." autocomplete="off" spellcheck="false">' +
            '<button class="gsb-btn gsb-ya">\u042f</button>' +
            '<button class="gsb-btn gsb-go">G</button>';
        wrapper.appendChild(gsb);
        var inp = gsb.querySelector('#gsb-input');
        function doSearch(engine) {
            var q = inp.value.trim(); if (!q) return;
            navToUrl(engine === 'ya'
                ? 'https://yandex.ru/search/?text=' + encodeURIComponent(q)
                : 'https://www.google.com/search?q='  + encodeURIComponent(q));
        }
        inp.addEventListener('keydown', function(e) { if (e.key === 'Enter') doSearch('ya'); });
        gsb.querySelector('.gsb-ya').addEventListener('click', function() { doSearch('ya'); });
        gsb.querySelector('.gsb-go').addEventListener('click', function() { doSearch('go'); });
    }
    gsb.style.display = '';

    // Create or reuse grid container
    var grid = document.getElementById('glass-grid-container');
    if (!grid) {
        grid = document.createElement('div');
        grid.id = 'glass-grid-container';
        grid.className = 'glass-grid-container';
        wrapper.appendChild(grid);
    }
    grid.innerHTML = '';

    // Render tiles
    links.forEach(function(item, index) {
        if (item.isFolder) {
            grid.appendChild(createGlassGridFolder(item, index));
        } else {
            grid.appendChild(createGlassGridLink(item, index));
        }
    });

    // Кнопка «Создать» в конце сетки
    var addBtn = document.createElement('div');
    addBtn.className = 'glass-grid-tile glass-grid-add';
    addBtn.innerHTML = '<span class="glass-grid-add-plus">+</span><span class="glass-grid-label">Создать</span>';
    addBtn.addEventListener('click', function() { openAddDialog(null); });
    addBtn.addEventListener('dragover',  function(e) { e.preventDefault(); addBtn.classList.add('glass-drag-over'); });
    addBtn.addEventListener('dragleave', function()  { addBtn.classList.remove('glass-drag-over'); });
    addBtn.addEventListener('drop', function(e) {
        e.preventDefault(); addBtn.classList.remove('glass-drag-over');
        if (glassDragIndex !== null) {
            e.stopPropagation();
            var moved = links.splice(glassDragIndex, 1)[0];
            links.push(moved);
            glassDragIndex = null;
            saveAndRender();
        }
    });
    grid.appendChild(addBtn);

}

function createGlassGridLink(item, index) {
    var favicon = item.customIcon || getFaviconUrl(item.url);
    var el = document.createElement('a');
    el.className = 'glass-grid-tile glass-grid-link';
    el.href = item.url;
    el.draggable = true;
    el.title = item.name;
    el.dataset.index = index;
    el.innerHTML =
        '<img class="glass-grid-favicon" src="' + escapeHtml(favicon) + '" alt="' + escapeHtml(item.name) + '">' +
        '<span class="glass-grid-label">' + escapeHtml(item.name) + '</span>';

    el.addEventListener('click', function(e) {
        if (el.classList.contains('glass-dragging')) { e.preventDefault(); return; }
        if (!/^https?:\/\//i.test(item.url)) {
            e.preventDefault();
            navToUrl(item.url);
        }
    });

    el.addEventListener('contextmenu', function(e) {
        e.preventDefault(); e.stopPropagation();
        selectedIndices.clear(); selectedIndices.add(index);
        showLinkIconContextMenu(e.clientX, e.clientY, index);
    });

    // Drag & drop for reorder
    el.addEventListener('dragstart', function(e) {
        glassDragIndex = index;
        setTimeout(function() { el.classList.add('glass-dragging'); }, 0);
    });
    el.addEventListener('dragend', function() { el.classList.remove('glass-dragging'); glassDragIndex = null; });
    el.addEventListener('dragover', function(e) { e.preventDefault(); el.classList.add('glass-drag-over'); });
    el.addEventListener('dragleave', function() { el.classList.remove('glass-drag-over'); });
    el.addEventListener('drop', function(e) {
        e.preventDefault(); el.classList.remove('glass-drag-over');
        if (glassDragIndex !== null) {
            e.stopPropagation();
            if (glassDragIndex === index) return;
            var moved = links.splice(glassDragIndex, 1)[0];
            links.splice(index, 0, moved);
            glassDragIndex = null;
            saveAndRender();
        }
        // External drops (bookmarks) bubble to #desktop handler
    });

    if (settings.glassScreenshotBg && item.screenshot) {
        // Добавляем полупрозрачный белый слой поверх скриншота, чтобы текст был читаем
        el.style.backgroundImage = `linear-gradient(rgba(255,255,255,0.7), rgba(255,255,255,0.7)), url('${item.screenshot}')`;
        el.style.backgroundSize = 'cover';
        el.style.backgroundPosition = 'center';
    } else {
        // Очищаем, если опция выключена
        el.style.backgroundImage = '';
    }

    return el;
}

function createGlassGridFolder(item, index) {
    var el = document.createElement('div');
    el.className = 'glass-grid-tile glass-grid-folder';
    el.draggable = true;
    el.dataset.index = index;

    if (item.colSpan) el.style.gridColumn = 'span ' + item.colSpan;
    if (item.rowSpan) el.style.gridRow = 'span ' + item.rowSpan;

    el.innerHTML = '<div class="glass-folder-title">' + escapeHtml(item.name) + '</div>';
    var listEl = document.createElement('div');
    listEl.className = 'glass-folder-items';

    item.items.forEach(function(child, childIdx) {
        var a = document.createElement('a');
        a.href = child.url;
        a.className = 'glass-mini-link';
        a.addEventListener('dragstart', function(e) { e.preventDefault(); e.stopPropagation(); });
        var cfav = child.customIcon || getFaviconUrl(child.url);
        a.innerHTML = '<img src="' + escapeHtml(cfav) + '" alt="' + escapeHtml(child.name) + '"><span>' + escapeHtml(child.name) + '</span>';
        a.addEventListener('click', function(e) {
            if (el.classList.contains('glass-dragging')) e.preventDefault();
        });
        a.addEventListener('contextmenu', function(e) {
            e.preventDefault(); e.stopPropagation();
            showFolderItemContextMenu(e.clientX, e.clientY, index, childIdx);
        });
        listEl.appendChild(a);
    });
    el.appendChild(listEl);

    // Resize handle
    var rh = document.createElement('div');
    rh.className = 'glass-resize-handle';
    rh.addEventListener('mousedown', function(e) {
        e.preventDefault(); e.stopPropagation();
        el.draggable = false;
        var startX = e.clientX, startY = e.clientY;
        var startCS = item.colSpan || 1, startRS = item.rowSpan || 1;
        var tw = settings.glassTileWidth, th = settings.glassTileHeight, gap = 12;
        var newCS = startCS, newRS = startRS;
        function onM(ev) {
            newCS = Math.max(1, startCS + Math.round((ev.clientX - startX) / (tw + gap)));
            newRS = Math.max(1, startRS + Math.round((ev.clientY - startY) / (th + gap)));
            el.style.gridColumn = 'span ' + newCS;
            el.style.gridRow = 'span ' + newRS;
        }
        function onU() {
            document.removeEventListener('mousemove', onM);
            document.removeEventListener('mouseup', onU);
            el.draggable = true;
            if (newCS !== startCS || newRS !== startRS) {
                item.colSpan = newCS; item.rowSpan = newRS;
                saveAndRender();
            }
        }
        document.addEventListener('mousemove', onM);
        document.addEventListener('mouseup', onU);
    });
    el.appendChild(rh);

    el.addEventListener('contextmenu', function(e) {
        e.preventDefault(); e.stopPropagation();
        selectedIndices.clear(); selectedIndices.add(index);
        showFolderIconContextMenu(e.clientX, e.clientY, index);
    });

    // Drag reorder
    el.addEventListener('dragstart', function() {
        glassDragIndex = index;
        setTimeout(function() { el.classList.add('glass-dragging'); }, 0);
    });
    el.addEventListener('dragend', function() { el.classList.remove('glass-dragging'); glassDragIndex = null; });
    el.addEventListener('dragover', function(e) {
        e.preventDefault();
        el.classList.add('glass-drag-over');
    });
    el.addEventListener('dragleave', function() { el.classList.remove('glass-drag-over'); });
    el.addEventListener('drop', function(e) {
        e.preventDefault(); el.classList.remove('glass-drag-over');
        if (glassDragIndex !== null) {
            e.stopPropagation();
            if (glassDragIndex === index) return;
            var draggedItem = links[glassDragIndex];
            if (!draggedItem.isFolder) {
                links.splice(glassDragIndex, 1);
                item.items.push(draggedItem);
            } else {
                var moved = links.splice(glassDragIndex, 1)[0];
                links.splice(index, 0, moved);
            }
            glassDragIndex = null;
            saveAndRender();
        } else {
            // External drop (bookmark from browser) — add to this folder
            e.stopPropagation();
            handleLinkDrop(e, index);
        }
    });

    return el;
}

function placeIcon(icon, item) {
    const pos = getDisplayPos(item);
    icon.style.left = pos.x + 'px';
    icon.style.top  = pos.y + 'px';
}

// ==================== TILE MINIMIZE / RESTORE / OPEN ====================
function tileMinimize(index, iconEl) {
    if (minimizedTiles.has(index)) return;
    iconEl.classList.add('tile-minimizing');
    setTimeout(function() {
        if (!document.body.contains(iconEl)) return;
        iconEl.style.display = 'none';
        iconEl.classList.remove('tile-minimizing');
        minimizedTiles.add(index);
        addTileTaskbarBtn(index);
    }, 190);
}

function addTileTaskbarBtn(index) {
    if (document.querySelector('.taskbar-tile-btn[data-tile-index="' + index + '"]')) return;
    const item = links[index]; if (!item) return;
    const bar = document.getElementById('taskbar-windows');
    const btn = document.createElement('button');
    btn.className = 'taskbar-win-btn taskbar-tile-btn';
    btn.dataset.tileIndex = index;
    const favicon = item.customIcon || getFaviconUrl(item.url);
    btn.innerHTML =
        '<img src="' + escapeHtml(favicon) + '" style="width:14px;height:14px;object-fit:contain;flex-shrink:0" alt="">' +
        '<span class="taskbar-btn-title">' + escapeHtml(item.name) + '</span>';
    btn.addEventListener('click', function() { tileRestore(index); });
    bar.appendChild(btn);
}

function tileRestore(index) {
    minimizedTiles.delete(index);
    const iconEl = document.querySelector('.desktop-icon[data-index="' + index + '"]');
    if (iconEl) {
        iconEl.style.display = '';
        iconEl.classList.add('tile-restoring');
        setTimeout(function() { iconEl.classList.remove('tile-restoring'); }, 210);
    }
    const btn = document.querySelector('.taskbar-tile-btn[data-tile-index="' + index + '"]');
    if (btn) btn.remove();
}

function tileMaxOpen(iconEl, url) {
    iconEl.classList.add('tile-opening');
    setTimeout(function() { navToUrl(url); }, 300);
}

// ---- Window mode: link tile ----
function createLinkIconWindow(item, index) {
    const dim = getIconDim(item);
    const favicon  = item.customIcon || getFaviconUrl(item.url);
    // Берем локальный скриншот. Если его пока нет, ставим фавиконку как заглушку
    const thumbSrc = item.screenshot || favicon;

    const icon = document.createElement('div');
    icon.className = 'desktop-icon link-icon xp-tile-window';
    icon.dataset.index = index;
    icon.style.width = dim.w + 'px';
    icon.style.position = 'absolute';

    // Titlebar
    const tb = document.createElement('div');
    tb.className = 'tile-titlebar';
    tb.innerHTML =
        '<img class="tile-favicon" src="' + escapeHtml(favicon) + '" alt="">' +
        '<span class="tile-name" title="' + escapeHtml(item.name) + '">' + escapeHtml(item.name) + '</span>' +
        '<div class="tile-btns">' +
          '<button class="tile-btn tile-btn-min" title="Свернуть">&#8211;</button>' +
          '<button class="tile-btn tile-btn-max" title="Открыть страницу">&#9633;</button>' +
          '<button class="tile-btn tile-btn-close" title="Убрать в корзину">&#x2715;</button>' +
        '</div>';

    // Thumbnail
    const tc = document.createElement('div');
    tc.className = 'tile-content';
    tc.style.height = (item.h || settings.tileHeight) + 'px';

    const thumb = document.createElement('img');
    thumb.className = 'icon-thumb';
    thumb.loading = 'lazy';
    thumb.src = thumbSrc;
    thumb.alt = '';
    thumb.onerror = function() {
        tc.innerHTML = '<div class="thumb-fallback"><img src="' + escapeHtml(favicon) + '" alt=""></div>';
    };
    tc.appendChild(thumb);

    // Per-tile resize handle
    const rh = document.createElement('div');
    rh.className = 'tile-resize-handle';
    rh.addEventListener('mousedown', function(e) {
        e.preventDefault(); e.stopPropagation();
        const sx = e.clientX, sy = e.clientY;
        const sw = icon.offsetWidth, sh = tc.offsetHeight;
        function onM(e) {
            const nw = Math.max(80,  sw + e.clientX - sx);
            const nh = Math.max(50,  sh + e.clientY - sy);
            icon.style.width  = nw + 'px';
            tc.style.height   = nh + 'px';
        }
        function onU() {
            document.removeEventListener('mousemove', onM);
            document.removeEventListener('mouseup', onU);
            item.w = icon.offsetWidth;
            item.h = tc.offsetHeight;
            saveLinks();
        }
        document.addEventListener('mousemove', onM);
        document.addEventListener('mouseup', onU);
    });

    icon.appendChild(tb);
    icon.appendChild(tc);
    icon.appendChild(rh);

    // Navigate: titlebar or thumbnail (not buttons, not resize)
    function navigate(e) {
        if (icon._wasDragged) { icon._wasDragged = false; return; }
        if (e.target.closest('.tile-btns') || e.target.closest('.tile-resize-handle')) return;
        if (e.ctrlKey) { selectIcon(index, true); return; }
        selectIcon(index, false);
        navToUrl(item.url);
    }
    tb.addEventListener('click', navigate);
    tc.addEventListener('click', navigate);

    // Close → trash
    tb.querySelector('.tile-btn-close').addEventListener('click', function(e) {
        e.stopPropagation();
        trashLink(index);
    });
    tb.querySelector('.tile-btn-min').addEventListener('click', function(e) { e.stopPropagation(); tileMinimize(index, icon); });
    tb.querySelector('.tile-btn-max').addEventListener('click', function(e) { e.stopPropagation(); tileMaxOpen(icon, item.url); });
    tb.querySelector('.tile-btns').addEventListener('mousedown', function(e) { e.stopPropagation(); });
    rh.addEventListener('mousedown', function(e) { e.stopPropagation(); }); // already done above

    return icon;
}

// ---- Window mode: folder ----
function createFolderIconWindow(item, index) {
    // In window mode folders still look like classic XP folder icons
    return createFolderIconXP(item, index);
}

// ---- Icon mode: link (classic XP shortcut) ----
function createLinkIconXP(item, index) {
    const favicon = item.customIcon || getFaviconUrl(item.url);
    const icon = document.createElement('div');
    icon.className = 'desktop-icon link-icon xp-icon';
    icon.dataset.index = index;
    icon.innerHTML =
        '<div class="xp-icon-img-wrapper">' +
          '<img class="xp-icon-favicon" src="' + escapeHtml(favicon) + '" alt="">' +
          '<div class="xp-shortcut-arrow">&#8599;</div>' +
        '</div>' +
        '<span class="xp-icon-label">' + escapeHtml(item.name) + '</span>';

    icon.addEventListener('click', function(e) {
        if (icon._wasDragged) { icon._wasDragged = false; return; }
        if (e.ctrlKey) { selectIcon(index, true); return; }
        selectIcon(index, false);
        navToUrl(item.url);
    });
    return icon;
}

// ---- Icon mode: folder ----
function createFolderIconXP(item, index) {
    const icon = document.createElement('div');
    icon.className = 'desktop-icon folder-icon xp-icon';
    icon.dataset.index = index;
    icon.innerHTML =
        '<div class="xp-icon-img-wrapper">' +
          '<svg width="48" height="40" viewBox="0 0 48 40" xmlns="http://www.w3.org/2000/svg">' +
            '<path d="M2 8 L2 37 L46 37 L46 13 L22 13 L18 8 Z" fill="#f0c040" stroke="#c89828" stroke-width="1"/>' +
            '<path d="M2 16 L46 16 L46 37 L2 37 Z" fill="#f8d860" stroke="#c89828" stroke-width="0.5"/>' +
            '<path d="M2 13 Q4 13 22 13 L18 8 L2 8 Z" fill="#d8a020"/>' +
          '</svg>' +
        '</div>' +
        '<span class="xp-icon-label">' + escapeHtml(item.name) + '</span>';

    icon.addEventListener('click', function(e) {
        if (icon._wasDragged) { icon._wasDragged = false; return; }
        if (e.ctrlKey) { selectIcon(index, true); return; }
        selectIcon(index, false);
        openFolder(index);
    });
    return icon;
}

// ---- Add button ----
// Кнопка «Создать» существует только в glass-grid (renderGlassGrid).
// В window-mode и icon-mode не отображается.
function createAddButton() { return null; }

// ==================== SYSTEM ICONS ====================
const SYSTEM_ICONS_DEF = [
    { id: 'mycomputer', name: 'Мой компьютер' },
    { id: 'recycle',    name: 'Корзина'        },
];

function getSysIconPos(id, slotIndex) {
    try {
        const s = localStorage.getItem('edge_sysicon_' + id);
        if (s) return JSON.parse(s);
    } catch(e) {}
    const desktop = document.getElementById('desktop');
    const dw = desktop ? desktop.offsetWidth  : (window.innerWidth  || 1200);
    const dh = desktop ? desktop.offsetHeight : (window.innerHeight - 44 || 800);
    return { x: Math.max(0, dw - 84), y: 10 + slotIndex * 90, dw: dw, dh: dh };
}

function getSysIconDisplayPos(id, slotIndex) {
    const pos = getSysIconPos(id, slotIndex);
    const desktop = document.getElementById('desktop');
    const cw = desktop ? desktop.offsetWidth  : (window.innerWidth  || 1200);
    const ch = desktop ? desktop.offsetHeight : (window.innerHeight - 44 || 800);
    const refW = pos.dw || cw;
    const refH = pos.dh || ch;
    return { x: pos.x * (cw / refW), y: pos.y * (ch / refH) };
}

function saveSysIconPos(id, x, y, dw, dh) {
    localStorage.setItem('edge_sysicon_' + id, JSON.stringify({ x: x, y: y, dw: dw, dh: dh }));
}

function getSysIconSVG(id) {
    if (id === 'mycomputer') {
        return '<svg width="42" height="40" viewBox="0 0 42 40" xmlns="http://www.w3.org/2000/svg">' +
            '<rect x="2" y="2" width="38" height="27" rx="3" fill="#c8d8ec" stroke="#5878a8" stroke-width="1.5"/>' +
            '<rect x="4" y="4" width="34" height="23" fill="#7aacd4"/>' +
            '<rect x="4" y="4" width="34" height="9" fill="rgba(255,255,255,0.18)"/>' +
            '<line x1="4" y1="27" x2="38" y2="27" stroke="#5878a8" stroke-width="1"/>' +
            '<rect x="15" y="29" width="12" height="4" fill="#b0b0a0" stroke="#888880" stroke-width="1"/>' +
            '<rect x="8" y="33" width="26" height="3" rx="1" fill="#b0b0a0" stroke="#888880" stroke-width="1"/>' +
        '</svg>';
    }
    if (id === 'recycle') {
        if (trashedLinks.length === 0) {
            // Empty bin
            return '<svg width="36" height="42" viewBox="0 0 36 42" xmlns="http://www.w3.org/2000/svg">' +
                '<rect x="11" y="1" width="14" height="7" rx="3.5" fill="none" stroke="#708070" stroke-width="1.5"/>' +
                '<rect x="1" y="7" width="34" height="5" rx="1.5" fill="#b8c0b0" stroke="#708070" stroke-width="1.5"/>' +
                '<path d="M5 12 L7 39 L29 39 L31 12 Z" fill="#d0d8c8" stroke="#708070" stroke-width="1.5"/>' +
                '<line x1="12" y1="16" x2="13" y2="36" stroke="#708070" stroke-width="1"/>' +
                '<line x1="18" y1="16" x2="18" y2="36" stroke="#708070" stroke-width="1"/>' +
                '<line x1="24" y1="16" x2="23" y2="36" stroke="#708070" stroke-width="1"/>' +
            '</svg>';
        } else {
            // Full bin — papers sticking out
            return '<svg width="36" height="42" viewBox="0 0 36 42" xmlns="http://www.w3.org/2000/svg">' +
                '<path d="M8 11 Q11 3 14 7 Q17 1 20 6 Q23 2 26 8 L26 12 L8 12 Z" fill="#f0f0d8" stroke="#a0a080" stroke-width="1"/>' +
                '<rect x="11" y="1" width="14" height="7" rx="3.5" fill="none" stroke="#708070" stroke-width="1.5"/>' +
                '<rect x="1" y="7" width="34" height="5" rx="1.5" fill="#b8c0b0" stroke="#708070" stroke-width="1.5"/>' +
                '<path d="M5 12 L7 39 L29 39 L31 12 Z" fill="#d0d8c8" stroke="#708070" stroke-width="1.5"/>' +
                '<line x1="12" y1="16" x2="13" y2="36" stroke="#708070" stroke-width="1"/>' +
                '<line x1="18" y1="16" x2="18" y2="36" stroke="#708070" stroke-width="1"/>' +
                '<line x1="24" y1="16" x2="23" y2="36" stroke="#708070" stroke-width="1"/>' +
            '</svg>';
        }
    }
    return '';
}

function createSystemIcon(def, slotIndex) {
    const dispPos = getSysIconDisplayPos(def.id, slotIndex);

    const icon = document.createElement('div');
    icon.className = 'desktop-icon sys-icon xp-icon';
    icon.dataset.sysId = def.id;
    icon.style.cssText = 'position:absolute; left:' + dispPos.x + 'px; top:' + dispPos.y + 'px;';

    icon.innerHTML =
        '<div class="xp-icon-img-wrapper">' + getSysIconSVG(def.id) + '</div>' +
        '<span class="xp-icon-label">' + escapeHtml(def.name) + '</span>';

    icon.addEventListener('click', function(e) {
        if (icon._wasDragged) { icon._wasDragged = false; return; }
        if (def.id === 'mycomputer') openMyComputer();
        else if (def.id === 'recycle')  openRecycleBin();
    });

    // Drag (independent of links[] drag system)
    icon.addEventListener('mousedown', function(e) {
        if (e.button !== 0) return;
        e.preventDefault();
        const startX = e.clientX, startY = e.clientY;
        // Use current visual (scaled) position as drag start
        const iX = parseFloat(icon.style.left) || 0;
        const iY = parseFloat(icon.style.top)  || 0;
        let moved = false;

        function onMove(e) {
            const dx = e.clientX - startX, dy = e.clientY - startY;
            if (!moved && Math.abs(dx) + Math.abs(dy) < 5) return;
            moved = true; icon.classList.add('dragging');
            const desktop = document.getElementById('desktop');
            let x = iX + dx, y = iY + dy;
            x = Math.max(0, Math.min(x, (desktop ? desktop.offsetWidth  : 1200) - icon.offsetWidth));
            y = Math.max(0, Math.min(y, (desktop ? desktop.offsetHeight : 800)  - icon.offsetHeight));
            icon.style.left = x + 'px'; icon.style.top = y + 'px';
        }
        function onUp(e) {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            icon.classList.remove('dragging');
            if (moved) {
                const dx = e.clientX - startX, dy = e.clientY - startY;
                const desktop = document.getElementById('desktop');
                const dw = desktop ? desktop.offsetWidth  : 1200;
                const dh = desktop ? desktop.offsetHeight : 800;
                let x = iX + dx, y = iY + dy;
                x = Math.max(0, Math.min(x, dw - icon.offsetWidth));
                y = Math.max(0, Math.min(y, dh - icon.offsetHeight));
                if (settings.snapToGrid) { x = Math.round(x / SNAP_TILE) * SNAP_TILE; y = Math.round(y / SNAP_TILE) * SNAP_TILE; }
                saveSysIconPos(def.id, x, y, dw, dh);
                icon.style.left = x + 'px'; icon.style.top = y + 'px';
                icon._wasDragged = true;
            }
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });

    return icon;
}

function confirmEmptyTrash() {
    const winId = 'empty-trash-confirm';
    wmClose(winId);
    const c = document.createElement('div');
    c.style.cssText = 'padding:18px; display:flex; flex-direction:column; gap:14px; background:white;';
    const msg = document.createElement('div');
    msg.style.cssText = 'font-size:12px; color:#333;';
    msg.innerHTML = 'Вы уверены, что хотите очистить корзину?<br>Все удалённые элементы будут потеряны навсегда.';
    const bd = document.createElement('div');
    bd.style.cssText = 'display:flex; gap:8px; justify-content:flex-end;';
    const ok = document.createElement('button'); ok.className = 'xp-dialog-btn xp-dialog-btn-primary'; ok.textContent = 'Да';
    const cn = document.createElement('button'); cn.className = 'xp-dialog-btn'; cn.textContent = 'Нет';
    bd.appendChild(ok); bd.appendChild(cn); c.appendChild(msg); c.appendChild(bd);
    wmCreate(winId, 'Очистить корзину', c, 300, 145, '\uD83D\uDDD1\uFE0F');
    ok.addEventListener('click', function() {
        trashedLinks = []; localStorage.setItem(STORAGE.trash, JSON.stringify(trashedLinks));
        wmClose(winId); renderDesktop();
    });
    cn.addEventListener('click', function() { wmClose(winId); });
}

function navToUrl(url) {
    const isBrowserInternal = /^(edge|chrome|chrome-extension|brave|about|javascript):/i.test(url);
    const hasProtocol = /^[a-z][a-z0-9+\-.]*:\/\//i.test(url);
    if (isBrowserInternal || !hasProtocol) {
        if (typeof chrome !== 'undefined' && chrome.tabs) chrome.tabs.update({ url: url });
        else window.location.href = url;
    } else {
        window.location.href = url;
    }
}

function trashLink(index) {
    selectedIndices.delete(index);
    const newSel = new Set();
    selectedIndices.forEach(function(i) { newSel.add(i > index ? i - 1 : i); });
    selectedIndices = newSel;
    // Update minimizedTiles indices
    minimizedTiles.delete(index);
    const newMin = new Set();
    minimizedTiles.forEach(function(i) { newMin.add(i > index ? i - 1 : i); });
    minimizedTiles = newMin;
    // Update taskbar tile button dataset indices
    document.querySelectorAll('.taskbar-tile-btn').forEach(function(btn) {
        const i = parseInt(btn.dataset.tileIndex);
        if (i === index) btn.remove();
        else if (i > index) btn.dataset.tileIndex = i - 1;
    });
    const deleted = links.splice(index, 1)[0];
    if (deleted) {
        deleted.deletedAt = Date.now();
        trashedLinks.push(deleted);
        localStorage.setItem(STORAGE.trash, JSON.stringify(trashedLinks));
        if (deleted.url) deleteScreenshot(deleted.url);
        if (deleted.isFolder && deleted.items) deleted.items.forEach(function(ch) { if (ch.url) deleteScreenshot(ch.url); });
    }
    saveAndRender();
}

// ==================== FOLDER ITEM DRAG TO DESKTOP ====================
function initFolderItemDrag(itemEl, child, ci, folderIndex, getWin, selectedFolderItems) {
    itemEl.addEventListener('mousedown', function(e) {
        if (e.button !== 0) return;
        e.stopPropagation(); // don't trigger folder rubber-band

        const startX = e.clientX, startY = e.clientY;
        let moved = false, dragGhost = null;

        // Items to drag: all selected if this item is in selection, else just this one
        const dragCIs = (selectedFolderItems.has(ci) && selectedFolderItems.size > 1)
            ? Array.from(selectedFolderItems) : [ci];

        function onMove(e) {
            const dx = e.clientX - startX, dy = e.clientY - startY;
            if (!moved && Math.abs(dx) + Math.abs(dy) < 5) return;
            if (!moved) {
                moved = true;
                dragGhost = document.createElement('div');
                dragGhost.className = 'folder-drag-ghost';
                const fav = child.customIcon || getFaviconUrl(child.url);
                dragGhost.innerHTML =
                    '<img src="' + escapeHtml(fav) + '" style="width:14px;height:14px;object-fit:contain;flex-shrink:0">' +
                    '<span>' + escapeHtml(child.name) + (dragCIs.length > 1 ? ' +' + (dragCIs.length - 1) : '') + '</span>';
                document.body.appendChild(dragGhost);
            }
            if (dragGhost) {
                dragGhost.style.left = (e.clientX + 12) + 'px';
                dragGhost.style.top  = (e.clientY + 12) + 'px';
            }
        }

        function onUp(e) {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            if (dragGhost) { dragGhost.remove(); dragGhost = null; }
            if (!moved) return;

            itemEl._wasDragged = true;

            // Detect drop target (ghost is already removed so elementFromPoint works cleanly)
            const target = document.elementFromPoint(e.clientX, e.clientY);
            const myWin = getWin();
            const droppedInsideSameWin = target && myWin && !!target.closest('.xp-window') && target.closest('.xp-window') === myWin;

            if (!droppedInsideSameWin) {
                // Dropped on desktop — move items out of folder
                const desktop = document.getElementById('desktop');
                const dw = desktop ? desktop.offsetWidth  : 1200;
                const dh = desktop ? desktop.offsetHeight : 800;
                const dr = desktop ? desktop.getBoundingClientRect() : { left: 0, top: 0 };

                // Splice in descending order to keep indices valid
                const sorted = Array.from(dragCIs).sort(function(a, b) { return b - a; });
                const movedItems = [];
                sorted.forEach(function(idx) {
                    const m = links[folderIndex] && links[folderIndex].items.splice(idx, 1)[0];
                    if (m) movedItems.push(m);
                });

                // Place on desktop at drop coordinates (offset each item slightly)
                movedItems.reverse().forEach(function(m, i) {
                    let dropX = e.clientX - dr.left + i * SNAP_TILE;
                    let dropY = e.clientY - dr.top  + i * SNAP_TILE;
                    dropX = Math.max(0, Math.min(dropX, dw - 80));
                    dropY = Math.max(0, Math.min(dropY, dh - 80));
                    const _sf = getSnap(); if (settings.snapToGrid) { dropX = Math.round(dropX / _sf) * _sf; dropY = Math.round(dropY / _sf) * _sf; }
                    m[getPosKey()] = { x: dropX, y: dropY, dw: dw, dh: dh };
                    links.push(m);
                });

                selectedFolderItems.clear();
                refreshFolderWindow(folderIndex);
            }
        }

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });
}

// ==================== FOLDER WINDOW ====================
function openFolder(folderIndex) {
    const folder = links[folderIndex]; if (!folder) return;
    const winId  = 'folder-' + folderIndex;
    if (wmWindows[winId]) { wmRestore(winId); wmFocus(winId); return; }

    const contentEl = document.createElement('div');
    contentEl.className = 'folder-window-content';

    let selectedFolderItems = new Set();
    let folderWin = null; // set after wmCreate, used by drag handler

    function updateFolderItemSelection() {
        contentEl.querySelectorAll('.folder-item:not(.add-item)').forEach(function(el) {
            const ci = parseInt(el.dataset.childIndex);
            el.classList.toggle('selected', !isNaN(ci) && selectedFolderItems.has(ci));
        });
    }

    function renderFolderContent() {
        contentEl.innerHTML = '';
        folder.items.forEach(function(child, ci) {
            const item = document.createElement('div');
            item.className = 'folder-item';
            item.dataset.childIndex = ci;
            if (selectedFolderItems.has(ci)) item.classList.add('selected');
            const fav = child.customIcon || getFaviconUrl(child.url);
            item.innerHTML = '<img class="folder-item-icon" src="' + escapeHtml(fav) + '" alt=""><span class="folder-item-name">' + escapeHtml(child.name) + '</span>';
            item.addEventListener('click', function(e) {
                if (item._wasDragged) { item._wasDragged = false; return; }
                if (e.ctrlKey) {
                    if (selectedFolderItems.has(ci)) selectedFolderItems.delete(ci);
                    else selectedFolderItems.add(ci);
                    updateFolderItemSelection();
                    return;
                }
                selectedFolderItems.clear();
                updateFolderItemSelection();
                navToUrl(child.url);
            });
            initFolderItemDrag(item, child, ci, folderIndex, function() { return folderWin; }, selectedFolderItems);
            contentEl.appendChild(item);
        });
        const ab = document.createElement('div');
        ab.className = 'folder-item add-item';
        ab.innerHTML = '<span class="folder-add-plus">+</span><span class="folder-item-name">Добавить</span>';
        ab.addEventListener('click', function() { openAddDialog(folderIndex); });
        contentEl.appendChild(ab);
    }

    // Rubber-band selection inside folder content
    contentEl.addEventListener('mousedown', function(e) {
        if (e.button !== 0) return;
        if (e.target.closest('.folder-item')) return;
        e.preventDefault();
        if (!e.ctrlKey) { selectedFolderItems.clear(); updateFolderItemSelection(); }
        const preSelection = new Set(selectedFolderItems);
        const cRect = contentEl.getBoundingClientRect();
        const sx = e.clientX, sy = e.clientY;

        const rb = document.createElement('div');
        rb.className = 'folder-selection-rect';
        rb.style.cssText = 'left:' + (sx - cRect.left + contentEl.scrollLeft) + 'px;top:' + (sy - cRect.top + contentEl.scrollTop) + 'px;width:0;height:0;';
        contentEl.appendChild(rb);

        function onMove(e) {
            if (!rb.parentNode) return;
            const x1 = Math.min(sx, e.clientX), y1 = Math.min(sy, e.clientY);
            const x2 = Math.max(sx, e.clientX), y2 = Math.max(sy, e.clientY);
            rb.style.left   = (x1 - cRect.left + contentEl.scrollLeft) + 'px';
            rb.style.top    = (y1 - cRect.top  + contentEl.scrollTop)  + 'px';
            rb.style.width  = (x2 - x1) + 'px';
            rb.style.height = (y2 - y1) + 'px';
            selectedFolderItems.clear();
            preSelection.forEach(function(i) { selectedFolderItems.add(i); });
            contentEl.querySelectorAll('.folder-item:not(.add-item)').forEach(function(el) {
                const ci = parseInt(el.dataset.childIndex);
                if (isNaN(ci)) return;
                const r = el.getBoundingClientRect();
                if (r.left < x2 && r.right > x1 && r.top < y2 && r.bottom > y1) selectedFolderItems.add(ci);
            });
            updateFolderItemSelection();
        }
        function onUp() {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            if (rb.parentNode) rb.remove();
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });

    renderFolderContent();
    const win = wmCreate(winId, folder.name, contentEl, 480, 350, '\uD83D\uDCC1');
    folderWin = win; // expose for drag handler
    if (win) {
        win._renderFolderContent = renderFolderContent;
        win._folderIndex = folderIndex;
        win._selectedFolderItems = selectedFolderItems;
        win._updateFolderItemSelection = updateFolderItemSelection;
    }
}

function refreshFolderWindow(folderIndex) {
    saveLinks();
    const winId = 'folder-' + folderIndex;
    if (wmWindows[winId]) { wmClose(winId); openFolder(folderIndex); }
    renderDesktop();
}

// ==================== WINDOW MANAGER ====================
let wmZIndex = 200;
const wmWindows = {};
let activeWindowId = null;

function wmCreate(id, title, contentEl, width, height, icon) {
    width = width||400; height = height||300; icon = icon||'\u{1F5A5}';
    if (wmWindows[id]) { wmRestore(id); wmFocus(id); return wmWindows[id].el; }

    const win = document.createElement('div');
    win.className = 'xp-window'; win.id = 'win-' + id;
    win.style.cssText = 'width:' + width + 'px;height:' + height + 'px;left:' +
        Math.floor(Math.random() * Math.min(Math.max(0, window.innerWidth - width - 60), 200) + 40) + 'px;top:' +
        Math.floor(Math.random() * Math.min(Math.max(0, window.innerHeight - height - 80), 120) + 20) + 'px;z-index:' + (++wmZIndex);

    const tb = document.createElement('div'); tb.className = 'xp-titlebar';
    tb.innerHTML = '<span class="xp-titlebar-icon">' + icon + '</span><span class="xp-titlebar-title">' + escapeHtml(title) + '</span><div class="xp-win-btns"><button class="xp-btn xp-btn-min" title="Свернуть">&#8211;</button><button class="xp-btn xp-btn-max" title="Развернуть">&#9633;</button><button class="xp-btn xp-btn-close" title="Закрыть">&#x2715;</button></div>';

    const c = document.createElement('div'); c.className = 'xp-win-content';
    if (typeof contentEl === 'string') c.innerHTML = contentEl; else c.appendChild(contentEl);

    const rh = document.createElement('div'); rh.className = 'xp-resize-handle';
    win.appendChild(tb); win.appendChild(c); win.appendChild(rh);
    document.body.appendChild(win);
    // Appear animation
    win.classList.add('wm-appearing');
    setTimeout(function() { if (win.parentNode) win.classList.remove('wm-appearing'); }, 160);

    wmWindows[id] = { el: win, taskbarBtn: null, minimized: false, maximized: false, savedRect: null };
    wmMakeDraggable(win, tb); wmMakeResizable(win, rh);
    win.addEventListener('mousedown', function() { wmFocus(id); });
    tb.querySelector('.xp-btn-min').addEventListener('click', function(e) { e.stopPropagation(); wmMinimize(id); });
    tb.querySelector('.xp-btn-max').addEventListener('click', function(e) { e.stopPropagation(); wmMaximize(id); });
    tb.querySelector('.xp-btn-close').addEventListener('click', function(e) { e.stopPropagation(); wmClose(id); });
    tb.addEventListener('dblclick', function() { wmMaximize(id); });
    wmAddToTaskbar(id, title, icon); wmFocus(id);
    if (typeof clippySay === 'function') {
        if (CLIPPY_MSGS['app_' + id]) {
            setTimeout(function(){ clippySay(CLIPPY_MSGS['app_' + id], 'talk'); }, 800);
        } else if (Object.keys(wmWindows).length >= 5) {
            setTimeout(function(){ clippySay(CLIPPY_MSGS.react_many_windows, 'think'); }, 800);
        }
    }
    playSound('open');
    return win;
}

function wmFocus(id) {
    if (!wmWindows[id]) return;
    Object.keys(wmWindows).forEach(function(k) { wmWindows[k].el.classList.add('inactive'); if (wmWindows[k].taskbarBtn) wmWindows[k].taskbarBtn.classList.remove('active'); });
    activeWindowId = id;
    wmWindows[id].el.classList.remove('inactive');
    wmWindows[id].el.style.zIndex = ++wmZIndex;
    if (wmWindows[id].taskbarBtn) wmWindows[id].taskbarBtn.classList.add('active');
}
function wmMinimize(id) {
    if (!wmWindows[id]) return;
    const w = wmWindows[id];
    if (w.minimized) return;
    playSound('minimize');
    w.el.classList.add('wm-minimizing');
    if (w.taskbarBtn) w.taskbarBtn.classList.remove('active');
    activeWindowId = null;
    setTimeout(function() {
        if (!wmWindows[id]) return;
        w.el.style.display = 'none';
        w.el.classList.remove('wm-minimizing');
        w.minimized = true;
    }, 185);
}
function wmRestore(id) {
    if (!wmWindows[id]) return;
    const w = wmWindows[id];
    playSound('restore');
    w.el.style.display = 'flex';
    w.minimized = false;
    w.el.classList.add('wm-restoring');
    setTimeout(function() { if (wmWindows[id]) w.el.classList.remove('wm-restoring'); }, 210);
}
function wmMaximize(id) {
    if (!wmWindows[id]) return; const w = wmWindows[id];
    if (w.maximized) {
        if (w.savedRect) { w.el.style.left=w.savedRect.left; w.el.style.top=w.savedRect.top; w.el.style.width=w.savedRect.width; w.el.style.height=w.savedRect.height; }
        w.maximized=false; w.el.querySelector('.xp-btn-max').innerHTML='&#9633;';
    } else {
        w.savedRect={left:w.el.style.left,top:w.el.style.top,width:w.el.style.width,height:w.el.style.height};
        w.el.style.cssText += ';left:0;top:0;width:100vw;height:calc(100vh - 40px)';
        w.maximized=true; w.el.querySelector('.xp-btn-max').innerHTML='&#10064;';
    }
}
function wmClose(id) {
    if (!wmWindows[id]) return;
    const w = wmWindows[id];
    playSound('close');
    w.el.classList.add('wm-closing');
    if (w.taskbarBtn) w.taskbarBtn.remove();
    if (activeWindowId === id) activeWindowId = null;
    setTimeout(function() {
        if (!wmWindows[id]) return;
        w.el.remove();
        delete wmWindows[id];
    }, 125);
}
function wmAddToTaskbar(id, title, icon) {
    const bar = document.getElementById('taskbar-windows'), btn = document.createElement('button');
    btn.className = 'taskbar-win-btn';
    btn.innerHTML = '<span class="taskbar-btn-icon">' + icon + '</span><span class="taskbar-btn-title">' + escapeHtml(title) + '</span>';
    btn.addEventListener('click', function() { if (!wmWindows[id]) return; if (wmWindows[id].minimized) { wmRestore(id); wmFocus(id); } else if (activeWindowId===id) wmMinimize(id); else wmFocus(id); });
    bar.appendChild(btn); wmWindows[id].taskbarBtn = btn;
}
function wmMakeDraggable(win, handle) {
    handle.addEventListener('mousedown', function(e) {
        if (e.target.classList.contains('xp-btn')) return;
        const id = win.id.replace('win-',''); if (wmWindows[id] && wmWindows[id].maximized) return;
        e.preventDefault();
        const sx=e.clientX,sy=e.clientY,sl=win.offsetLeft,st=win.offsetTop;
        function onM(e) { win.style.left=(sl+e.clientX-sx)+'px'; win.style.top=Math.max(0,st+e.clientY-sy)+'px'; }
        function onU() { document.removeEventListener('mousemove',onM); document.removeEventListener('mouseup',onU); }
        document.addEventListener('mousemove',onM); document.addEventListener('mouseup',onU);
    });
}
function wmMakeResizable(win, handle) {
    handle.addEventListener('mousedown', function(e) {
        e.preventDefault(); e.stopPropagation();
        const sx=e.clientX,sy=e.clientY,sw=win.offsetWidth,sh=win.offsetHeight;
        function onM(e) { win.style.width=Math.max(200,sw+e.clientX-sx)+'px'; win.style.height=Math.max(120,sh+e.clientY-sy)+'px'; }
        function onU() { document.removeEventListener('mousemove',onM); document.removeEventListener('mouseup',onU); }
        document.addEventListener('mousemove',onM); document.addEventListener('mouseup',onU);
    });
}
function minimizeAll() { Object.keys(wmWindows).forEach(wmMinimize); }
function restoreAll()  { Object.keys(wmWindows).forEach(function(id) { if (wmWindows[id].minimized) { wmRestore(id); wmFocus(id); } }); }

// ==================== CONTEXT MENU ENGINE ====================
const ctxMenuEl = document.getElementById('context-menu');
function hideContextMenu() { ctxMenuEl.classList.add('hidden'); }

function showContextMenu(x, y, items) {
    ctxMenuEl.innerHTML = '';
    items.forEach(function(item) {
        if (item === 'sep') { const s=document.createElement('div'); s.className='xp-ctx-separator'; ctxMenuEl.appendChild(s); return; }
        if (item.submenu) {
            const el=document.createElement('div'); el.className='xp-ctx-item xp-ctx-has-submenu'; el.style.position='relative';
            el.innerHTML='<span class="ctx-icon">'+(item.icon||'')+'</span><span>'+item.label+'</span><span class="ctx-arrow">&#9658;</span>';
            const sub=document.createElement('div'); sub.className='xp-submenu hidden';
            item.submenu.forEach(function(si) {
                if (si==='sep'){const s=document.createElement('div');s.className='xp-ctx-separator';sub.appendChild(s);return;}
                const se=document.createElement('div'); se.className='xp-ctx-item'+(si.check?' ctx-check':'');
                se.innerHTML='<span class="ctx-icon">'+(si.icon||'')+'</span><span>'+si.label+'</span>';
                se.addEventListener('click',function(){hideContextMenu();si.action();});
                sub.appendChild(se);
            });
            el.appendChild(sub);
            el.addEventListener('mouseenter',function(){sub.classList.remove('hidden');const r=el.getBoundingClientRect();sub.style.left=r.width+'px';sub.style.top='0';});
            el.addEventListener('mouseleave',function(){sub.classList.add('hidden');});
            ctxMenuEl.appendChild(el); return;
        }
        const el=document.createElement('div');
        el.className='xp-ctx-item'+(item.danger?' ctx-danger':'')+(item.disabled?' ctx-disabled':'')+(item.check?' ctx-check':'');
        el.innerHTML='<span class="ctx-icon">'+(item.icon||'')+'</span><span>'+item.label+'</span>';
        if (!item.disabled) el.addEventListener('click',function(){hideContextMenu();item.action();});
        ctxMenuEl.appendChild(el);
    });
    ctxMenuEl.classList.remove('hidden');
    const mw=ctxMenuEl.offsetWidth||220, mh=ctxMenuEl.offsetHeight||160;
    let px=x, py=y;
    if (px+mw > window.innerWidth)       px = window.innerWidth  - mw - 4;
    if (py+mh > window.innerHeight - 44) py = window.innerHeight - mh - 44;
    if (px<0) px=0; if (py<0) py=0;
    ctxMenuEl.style.left=px+'px'; ctxMenuEl.style.top=py+'px';
}

// ==================== CONTEXT MENU DEFINITIONS ====================
function showDesktopContextMenu(x, y) {
    showContextMenu(x, y, [
        { label: 'Вид', icon: '\uD83D\uDC41', submenu: [
            { label: 'Плитки (стекло)',  icon: '', check: settings.viewMode==='glass',  action: function() { settings.viewMode='glass';  localStorage.setItem(STORAGE.viewMode,'glass');  renderDesktop(); } },
            { label: 'Окна с превью',   icon: '', check: settings.viewMode==='window', action: function() { settings.viewMode='window'; localStorage.setItem(STORAGE.viewMode,'window'); renderDesktop(); } },
            { label: 'Ярлыки XP',       icon: '', check: settings.viewMode==='icon',   action: function() { settings.viewMode='icon';   localStorage.setItem(STORAGE.viewMode,'icon');   renderDesktop(); } },
        ]},
        { label: 'Создать', icon: '\uD83D\uDCC4', submenu: [
            { label: 'Ярлык', icon: '\uD83D\uDD17', action: function() { openAddDialog(null); } },
            { label: 'Папку', icon: '\uD83D\uDCC1', action: function() { openAddFolderDialog(); } },
        ]},
        { label: 'Вставить ярлык', icon: '\uD83D\uDCCB', action: function() { pasteUrl(null); } },
        'sep',
        { label: (settings.snapToGrid ? '\u2713 ' : '') + 'Выровнять по сетке', icon: '\u22EE', action: function() {
            settings.snapToGrid = !settings.snapToGrid;
            localStorage.setItem(STORAGE.snapToGrid, settings.snapToGrid);
        }},
        { label: 'Упорядочить иконки', icon: '\u2630', action: function() { autoArrange(); } },
        { label: 'Обновить',           icon: '\uD83D\uDD04', action: function() { renderDesktop(); } },
        'sep',
        { label: 'Свойства экрана', icon: '\u2699\uFE0F', action: openSettings },
    ]);
}

function showSysIconContextMenu(x, y, id) {
    if (id === 'mycomputer') {
        showContextMenu(x, y, [
            { label: 'Открыть',     icon: '\uD83D\uDCBB', action: openSystemInfo },
            'sep',
            { label: 'Свойства',   icon: '\u2699\uFE0F', action: openSettings },
        ]);
    } else if (id === 'recycle') {
        showContextMenu(x, y, [
            { label: 'Открыть',         icon: '\uD83D\uDDD1\uFE0F', action: openRecycleBin },
            'sep',
            { label: 'Очистить корзину', icon: '\u2716', danger: true,
              disabled: trashedLinks.length === 0,
              action: confirmEmptyTrash },
        ]);
    }
}

function showMultiSelectContextMenu(x, y) {
    const n = selectedIndices.size;
    const indices = Array.from(selectedIndices);
    showContextMenu(x, y, [
        { label: 'Выбрано элементов: ' + n, disabled: true, action: function(){} },
        'sep',
        { label: 'Открыть все (' + n + ')', icon: '\u25B6', action: function() {
            indices.forEach(function(i) {
                const it = links[i];
                if (it && !it.isFolder) window.open(it.url, '_blank');
                else if (it && it.isFolder) openFolder(i);
            });
            clearSelection();
        }},
        'sep',
        { label: 'Удалить выбранные (' + n + ')', icon: '\uD83D\uDDD1\uFE0F', danger: true, action: function() {
            Array.from(selectedIndices).sort(function(a, b) { return b - a; }).forEach(function(i) {
                const deleted = links.splice(i, 1)[0];
                if (deleted) { deleted.deletedAt = Date.now(); trashedLinks.push(deleted); }
            });
            localStorage.setItem(STORAGE.trash, JSON.stringify(trashedLinks));
            selectedIndices.clear();
            saveAndRender();
        }},
    ]);
}

function showLinkIconContextMenu(x, y, idx) {
    const item = links[idx]; if (!item) return;
    if (!selectedIndices.has(idx)) { selectedIndices.clear(); selectedIndices.add(idx); updateSelectionUI(); }
    if (selectedIndices.size > 1) { showMultiSelectContextMenu(x, y); return; }
    showContextMenu(x, y, [
        { label: 'Открыть',                 icon: '\u25B6',       action: function() { navToUrl(item.url); } },
        { label: 'Открыть в новой вкладке', icon: '\u2197\uFE0F', action: function() { window.open(item.url,'_blank'); } },
        { label: 'Открыть в новом окне',    icon: '\uD83E\uDEDF', action: function() { if (typeof chrome!=='undefined'&&chrome.windows) chrome.windows.create({url:item.url}); else window.open(item.url,'_blank'); } },
        { label: 'Инкогнито',               icon: '\uD83D\uDD75\uFE0F', action: function() { if (typeof chrome!=='undefined'&&chrome.windows) chrome.windows.create({url:item.url,incognito:true}); else window.open(item.url,'_blank'); } },
        'sep',
        { label: 'Изменить', icon: '\u270F\uFE0F', action: function() { openEditDialog(idx, null); } },
        { label: 'Обновить миниатюру', icon: '📸', action: function() { requestScreenshot(item.url, item); } },
        { label: 'Удалить',  icon: '\uD83D\uDDD1\uFE0F', danger: true, action: function() { trashLink(idx); } },
    ]);
}

function showFolderIconContextMenu(x, y, idx) {
    if (!selectedIndices.has(idx)) { selectedIndices.clear(); selectedIndices.add(idx); updateSelectionUI(); }
    if (selectedIndices.size > 1) { showMultiSelectContextMenu(x, y); return; }
    showContextMenu(x, y, [
        { label: 'Открыть',          icon: '\uD83D\uDCC2', action: function() { openFolder(idx); } },
        'sep',
        { label: 'Добавить ярлык',   icon: '\uD83D\uDD17', action: function() { openAddDialog(idx); } },
        { label: 'Вставить ярлык',   icon: '\uD83D\uDCCB', action: function() { pasteUrl(idx); } },
        'sep',
        { label: 'Переименовать',    icon: '\u270F\uFE0F', action: function() { openEditDialog(idx, null); } },
        { label: 'Удалить',          icon: '\uD83D\uDDD1\uFE0F', danger: true, action: function() { trashLink(idx); } },
    ]);
}

function showFolderMultiSelectMenu(x, y, folderIdx, indices, onUpdate) {
    const n = indices.length;
    showContextMenu(x, y, [
        { label: 'Выбрано: ' + n, disabled: true, action: function(){} },
        'sep',
        { label: 'Открыть все (' + n + ')', icon: '\u25B6', action: function() {
            indices.forEach(function(ci) {
                const child = links[folderIdx] && links[folderIdx].items[ci];
                if (child) window.open(child.url, '_blank');
            });
        }},
        { label: 'На рабочий стол', icon: '\uD83D\uDCCB', action: function() {
            const moved = [];
            Array.from(indices).sort(function(a,b){return b-a;}).forEach(function(ci) {
                const m = links[folderIdx].items.splice(ci, 1)[0];
                if (m) moved.push(m);
            });
            moved.reverse().forEach(function(m) { links.push(m); });
            refreshFolderWindow(folderIdx);
        }},
        'sep',
        { label: 'Удалить выбранные (' + n + ')', icon: '\uD83D\uDDD1\uFE0F', danger: true, action: function() {
            Array.from(indices).sort(function(a,b){return b-a;}).forEach(function(ci) {
                const d = links[folderIdx].items.splice(ci, 1)[0];
                if (d) { d.deletedAt = Date.now(); trashedLinks.push(d); }
            });
            localStorage.setItem(STORAGE.trash, JSON.stringify(trashedLinks));
            refreshFolderWindow(folderIdx);
        }},
    ]);
}

function showFolderItemContextMenu(x, y, folderIdx, childIdx) {
    const child = links[folderIdx] && links[folderIdx].items[childIdx]; if (!child) return;
    showContextMenu(x, y, [
        { label: 'Открыть',                 icon: '\u25B6',       action: function() { navToUrl(child.url); } },
        { label: 'Открыть в новой вкладке', icon: '\u2197\uFE0F', action: function() { window.open(child.url,'_blank'); } },
        { label: 'Открыть в новом окне',    icon: '\uD83E\uDEDF', action: function() { if (typeof chrome!=='undefined'&&chrome.windows) chrome.windows.create({url:child.url}); else window.open(child.url,'_blank'); } },
        'sep',
        { label: 'На рабочий стол', icon: '\uD83D\uDCCB', action: function() { const m=links[folderIdx].items.splice(childIdx,1)[0]; links.push(m); refreshFolderWindow(folderIdx); } },
        'sep',
        { label: 'Изменить', icon: '\u270F\uFE0F', action: function() { openEditDialog(folderIdx, childIdx); } },
        { label: 'Удалить',  icon: '\uD83D\uDDD1\uFE0F', danger: true, action: function() { const d=links[folderIdx].items.splice(childIdx,1)[0]; if(d){d.deletedAt=Date.now();trashedLinks.push(d);localStorage.setItem(STORAGE.trash,JSON.stringify(trashedLinks));} refreshFolderWindow(folderIdx); } },
    ]);
}

function showWindowContextMenu(x, y, id) {
    if (!wmWindows[id]) return; const w = wmWindows[id];
    showContextMenu(x, y, [
        { label: w.minimized ? 'Восстановить' : 'Свернуть', icon: '_',  action: function() { if (w.minimized) { wmRestore(id); wmFocus(id); } else wmMinimize(id); } },
        { label: w.maximized ? 'Восстановить размер' : 'Развернуть', icon: '&#9633;', action: function() { wmMaximize(id); } },
        'sep',
        { label: 'Закрыть', icon: '\u2715', danger: true, action: function() { wmClose(id); } },
    ]);
}

function showTaskbarBtnContextMenu(x, y, btn) {
    const id = Object.keys(wmWindows).find(function(k) { return wmWindows[k].taskbarBtn===btn; });
    if (!id) return; const w = wmWindows[id];
    showContextMenu(x, y, [
        { label: w.minimized ? 'Восстановить' : 'Свернуть', action: function() { if (w.minimized) { wmRestore(id); wmFocus(id); } else wmMinimize(id); } },
        { label: 'Закрыть', danger: true, action: function() { wmClose(id); } },
    ]);
}

function showTaskbarContextMenu(x, y) {
    showContextMenu(x, y, [
        { label: 'Свернуть все окна',   icon: '\u25BC', action: minimizeAll },
        { label: 'Восстановить окна',   icon: '\u25B2', action: restoreAll },
        'sep',
        { label: 'Панель задач — свойства', icon: '\u2699\uFE0F', action: openSettings },
    ]);
}

function showSystrayContextMenu(x, y) {
    showContextMenu(x, y, [
        { label: new Date().toLocaleString('ru-RU'), icon: '\uD83D\uDD52', disabled: true, action: function(){} },
        'sep',
        { label: 'Настройки', icon: '\u2699\uFE0F', action: openSettings },
    ]);
}

// ==================== GLOBAL RIGHT-CLICK ROUTER ====================
document.addEventListener('contextmenu', function(e) {
    e.preventDefault();
    const x=e.clientX, y=e.clientY;
    if (e.target.closest('#context-menu') || e.target.closest('#start-menu')) return;

    const sysIcon    = e.target.closest('.sys-icon');
    const linkIcon   = e.target.closest('.desktop-icon.link-icon:not(.add-btn-tile)');
    const folderIcon = e.target.closest('.desktop-icon.folder-icon');
    const folderItem = e.target.closest('.folder-item:not(.add-item)');
    const titlebar   = e.target.closest('.xp-titlebar');
    const folderWinEl = e.target.closest('.xp-window[id^="win-folder-"]');
    const taskbarBtn = e.target.closest('.taskbar-win-btn');
    const systray    = e.target.closest('#systray');
    const taskbar    = e.target.closest('#taskbar');
    const desktop    = e.target.closest('#desktop');

    if (sysIcon) {
        showSysIconContextMenu(x, y, sysIcon.dataset.sysId);
    } else if (linkIcon) {
        showLinkIconContextMenu(x, y, parseInt(linkIcon.dataset.index));
    } else if (folderIcon) {
        showFolderIconContextMenu(x, y, parseInt(folderIcon.dataset.index));
    } else if (folderItem) {
        const win = folderItem.closest('.xp-window');
        if (win && win._folderIndex !== undefined) {
            const allItems = Array.from(win.querySelectorAll('.folder-item:not(.add-item)'));
            const ci = allItems.indexOf(folderItem);
            if (ci < 0) return;
            const sel = win._selectedFolderItems;
            // If right-clicked item is not in selection, reset selection to just this item
            if (sel && !sel.has(ci)) {
                sel.clear(); sel.add(ci);
                if (win._updateFolderItemSelection) win._updateFolderItemSelection();
            }
            if (sel && sel.size > 1) {
                showFolderMultiSelectMenu(x, y, win._folderIndex, Array.from(sel));
            } else {
                showFolderItemContextMenu(x, y, win._folderIndex, ci);
            }
        }
    } else if (folderWinEl && !titlebar) {
        const folderIdx = parseInt(folderWinEl.id.replace('win-folder-', ''));
        showContextMenu(x, y, [
            { label: 'Вставить ярлык',       icon: '\uD83D\uDCCB', action: function() { pasteUrl(folderIdx); } },
            'sep',
            { label: 'Добавить ярлык вручную', icon: '\uD83D\uDD17', action: function() { openAddDialog(folderIdx); } },
        ]);
    } else if (titlebar && !titlebar.closest('.desktop-icon')) {
        const win = titlebar.closest('.xp-window');
        if (win) showWindowContextMenu(x, y, win.id.replace('win-',''));
    } else if (taskbarBtn) {
        showTaskbarBtnContextMenu(x, y, taskbarBtn);
    } else if (systray) {
        showSystrayContextMenu(x, y);
    } else if (taskbar) {
        showTaskbarContextMenu(x, y);
    } else if (desktop) {
        showDesktopContextMenu(x, y);
    }
});

// ==================== ADD / EDIT DIALOG ====================
let editCtx = { tileIndex: null, childIndex: null, folderIndex: null };
function openAddDialog(folderIndex) { editCtx={tileIndex:null,childIndex:null,folderIndex:folderIndex}; showTileDialog(false,null); }

function handleLinkDrop(e, folderIndex) {
    e.preventDefault();
    const dt = e.dataTransfer;
    const types = Array.from(dt.types || []);
    if (!types.includes('text/uri-list') && !types.includes('text/plain')) return;

    // Extract URL — uri-list first, then plain
    let url = (dt.getData('text/uri-list') || dt.getData('text/plain') || '').trim().split('\n')[0].trim();
    if (!url || /^#/.test(url)) return;
    if (!/^https?:\/\//i.test(url)) {
        if (/^[\w.-]+\.[a-z]{2,}/i.test(url)) url = 'https://' + url; else return;
    }

    // Extract name from <a> title in text/html
    let name = '';
    const html = dt.getData('text/html') || '';
    const m = html.match(/<a[^>]*>([^<]+)<\/a>/i);
    if (m) name = m[1].trim();
    if (!name) { try { name = new URL(url).hostname.replace(/^www\./, ''); } catch(_) { name = url; } }

    const item = { name: name, url: url };
    if (folderIndex !== null && folderIndex !== undefined && links[folderIndex] && links[folderIndex].isFolder) {
        links[folderIndex].items.push(item);
        saveLinks();
        refreshFolderWindow(folderIndex);
    } else {
        links.push(item);
        saveLinks();
        renderDesktop();
    }
}

async function handleFolderDrop(e, destFolderIndex) {
    e.preventDefault();
    const folderName = (e.dataTransfer.getData('text/plain') || '').trim();
    if (!folderName || typeof chrome === 'undefined' || !chrome.bookmarks) return;
    let results;
    try { results = await chrome.bookmarks.search({ title: folderName }); } catch(_) { return; }
    const bmFolder = results.find(function(b) { return !b.url; });
    if (!bmFolder) return;
    let children;
    try { children = await chrome.bookmarks.getChildren(bmFolder.id); } catch(_) { return; }
    const items = children.filter(function(c) { return !!c.url; }).map(function(c) { return { name: c.title, url: c.url }; });
    if (!items.length) return;
    if (destFolderIndex !== null && destFolderIndex !== undefined && links[destFolderIndex] && links[destFolderIndex].isFolder) {
        items.forEach(function(it) { links[destFolderIndex].items.push(it); });
        saveLinks(); refreshFolderWindow(destFolderIndex);
    } else {
        links.push({ isFolder: true, name: bmFolder.title, items: items });
        saveLinks(); renderDesktop();
    }
}

async function pasteUrl(folderIndex) {
    let text;
    try { text = await navigator.clipboard.readText(); } catch(e) { return; }
    text = (text || '').trim();
    if (!text) return;
    let url = text;
    if (!/^https?:\/\//i.test(url)) {
        if (/^[\w.-]+\.[a-z]{2,}/i.test(url)) url = 'https://' + url;
        else return;
    }
    let name;
    try { name = new URL(url).hostname.replace(/^www\./, ''); } catch(e) { name = url; }
    const item = { name: name, url: url };
    if (folderIndex !== null && folderIndex !== undefined && links[folderIndex] && links[folderIndex].isFolder) {
        links[folderIndex].items.push(item);
        saveLinks();
        refreshFolderWindow(folderIndex);
    } else {
        links.push(item);
        saveLinks();
        renderDesktop();
    }
}
function openAddFolderDialog() { editCtx={tileIndex:null,childIndex:null,folderIndex:null}; showTileDialog(true,null); }
function openEditDialog(ti, ci) { editCtx={tileIndex:ti,childIndex:ci,folderIndex:null}; const item=(ci!==null)?links[ti].items[ci]:links[ti]; showTileDialog(item.isFolder,item); }

async function requestScreenshot(url, targetItem) {
    console.log('Запрос скриншота для:', url);
    chrome.runtime.sendMessage({ action: 'capture_screenshot', url: url }, (response) => {
        if (response && response.success) {
            targetItem.screenshot = response.dataUrl;
            saveScreenshot(url, response.dataUrl);
            saveAndRender();
            console.log('Скриншот успешно получен и сохранен');
        } else {
            console.error('Ошибка скриншота:', response ? response.error : 'нет ответа');
        }
    });
}
function showTileDialog(isFolder, item) {
    const winId = 'tile-dialog', isEdit = item!==null;
    wmClose(winId);
    const c = document.createElement('div'); c.className = 'dialog-form';
    const ng = document.createElement('div'); ng.className = 'form-group'; ng.innerHTML = '<label>Название:</label>';
    const ni = document.createElement('input'); ni.type='text'; ni.value=item?item.name:'';
    ni.placeholder = isFolder ? 'Название' : 'Оставьте пустым — возьмём с сайта';
    ng.appendChild(ni); c.appendChild(ng);

    let ui=null, ii=null, acEl=null;
    // Единственное определение acHide — работает даже если acEl=null
    let acItems=[], acFocused=-1;
    function acHide() { if(acEl){acEl.style.display='none';} acItems=[]; acFocused=-1; }

    if (!isFolder) {
        const ug=document.createElement('div'); ug.className='form-group';
        ug.innerHTML='<label>Ссылка:</label>';
        ui=document.createElement('input'); ui.type='text'; ui.value=(item&&item.url)?item.url:''; ui.placeholder='https://...';
        ug.appendChild(ui); c.appendChild(ug);

        // --- URL autocomplete dropdown ---
        acEl = document.createElement('div');
        acEl.className = 'xp-url-autocomplete';
        acEl.style.display = 'none';
        document.body.appendChild(acEl);

        function acPosition() {
            const r = ui.getBoundingClientRect();
            acEl.style.left  = r.left + 'px';
            acEl.style.top   = r.bottom + 'px';
            acEl.style.width = r.width + 'px';
        }
        function acRender(results) {
            acEl.innerHTML = '';
            acItems = results;
            acFocused = -1;
            results.forEach(function(h) {
                const row = document.createElement('div');
                row.className = 'xp-url-ac-item';
                const img = document.createElement('img');
                img.src = 'chrome-extension://' + chrome.runtime.id + '/_favicon/?pageUrl=' + encodeURIComponent(h.url) + '&size=16';
                img.onerror = function() { img.style.visibility='hidden'; };
                const span = document.createElement('span');
                span.textContent = h.title ? h.title + ' \u2014 ' + h.url : h.url;
                row.appendChild(img); row.appendChild(span);
                row.addEventListener('mousedown', function(e) {
                    e.preventDefault(); ui.value = h.url; acHide(); ui.focus();
                });
                acEl.appendChild(row);
            });
            if (results.length > 0) { acPosition(); acEl.style.display='block'; }
            else acHide();
        }
        function acSetFocus(idx) {
            const rows = acEl.querySelectorAll('.xp-url-ac-item');
            rows.forEach(function(r){ r.classList.remove('ac-focused'); });
            acFocused = Math.max(0, Math.min(idx, acItems.length-1));
            if (rows[acFocused]) rows[acFocused].classList.add('ac-focused');
        }
        ui.addEventListener('input', function() {
            const q = ui.value.trim();
            if (!q) { acHide(); return; }
            chrome.history.search({ text: q, maxResults: 8, startTime: 0 }, function(r) { acRender(r||[]); });
        });
        ui.addEventListener('keydown', function(e) {
            if (!acEl || acEl.style.display==='none') return;
            if (e.key==='ArrowDown') { e.preventDefault(); acSetFocus(acFocused<0?0:acFocused+1); }
            else if (e.key==='ArrowUp') { e.preventDefault(); acSetFocus(acFocused<=0?0:acFocused-1); }
            else if (e.key==='Enter' && acFocused>=0) { e.stopPropagation(); ui.value=acItems[acFocused].url; acHide(); }
            else if (e.key==='Escape') { acHide(); }
        });
        ui.addEventListener('blur', function() { setTimeout(acHide, 150); });
        ui.addEventListener('focus', function() { if(ui.value.trim()) ui.dispatchEvent(new Event('input')); });

        const ig=document.createElement('div'); ig.className='form-group'; ig.innerHTML='<label>Иконка (URL, необязательно):</label>';
        ii=document.createElement('input'); ii.type='text'; ii.value=(item&&item.customIcon)?item.customIcon:''; ii.placeholder='URL иконки';
        ig.appendChild(ii); c.appendChild(ig);
    }

    const bd=document.createElement('div'); bd.className='dialog-btns';
    const sv=document.createElement('button'); sv.className='xp-dialog-btn xp-dialog-btn-primary'; sv.textContent='OK';
    const cn=document.createElement('button'); cn.className='xp-dialog-btn'; cn.textContent='Отмена';
    bd.appendChild(sv); bd.appendChild(cn); c.appendChild(bd);
    wmCreate(winId, isEdit?'Изменить':(isFolder?'Создать папку':'Создать ярлык'), c, 320, isFolder?150:250, isFolder?'\uD83D\uDCC1':'\uD83D\uDD17');
    setTimeout(function(){ni.focus();},50);

    function doSave(resolvedName) {
        if(isFolder){
            if(isEdit){links[editCtx.tileIndex].name=resolvedName; const fw=wmWindows['folder-'+editCtx.tileIndex]; if(fw)fw.el.querySelector('.xp-titlebar-title').textContent=resolvedName;}
            else links.push({isFolder:true,name:resolvedName,items:[],x:undefined,y:undefined});
        } else {
            let url=ui?ui.value.trim():''; if(!url)return;
            if(!/^[a-z][a-z0-9+\-.]*:\/\//i.test(url))url='https://'+url;
            const ci_=ii?ii.value.trim():'';
            const newItem={name:resolvedName,url:url,x:undefined,y:undefined}; if(ci_)newItem.customIcon=ci_;
            if(isEdit){if(editCtx.childIndex!==null){links[editCtx.tileIndex].items[editCtx.childIndex]=newItem;refreshFolderWindow(editCtx.tileIndex);}else links[editCtx.tileIndex]=newItem;}
            else if(editCtx.folderIndex!==null){links[editCtx.folderIndex].items.push(newItem);refreshFolderWindow(editCtx.folderIndex);}
            else links.push(newItem);
            const targetIdx=(editCtx.folderIndex!==null)?editCtx.folderIndex:(isEdit?editCtx.tileIndex:links.length-1);
            const childIdxToUpdate=(editCtx.folderIndex!==null)?(links[editCtx.folderIndex].items.length-1):editCtx.childIndex;
            const finalItem=(childIdxToUpdate!==null)?links[targetIdx].items[childIdxToUpdate]:links[targetIdx];
            if(finalItem&&finalItem.url) requestScreenshot(finalItem.url, finalItem);
            if (!isEdit) showNotification('Ярлык создан', finalItem ? finalItem.name : '', '🔗');
        }
        saveAndRender(); wmClose(winId);
    }

    sv.addEventListener('click', function() {
        acHide();
        const name = ni.value.trim();
        if (isFolder) { if(!name)return; doSave(name); return; }
        let url = ui ? ui.value.trim() : ''; if(!url)return;
        if (name) { doSave(name); return; }
        // Имя пустое — тянем заголовок с сайта
        const fullUrl = /^[a-z][a-z0-9+\-.]*:\/\//i.test(url) ? url : 'https://'+url;
        sv.disabled=true; sv.textContent='…';
        chrome.runtime.sendMessage({action:'fetch_page_title', url:fullUrl}, function(resp) {
            const title = (resp&&resp.success&&resp.title) ? resp.title : (function(){try{return new URL(fullUrl).hostname;}catch(e){return fullUrl;}}());
            doSave(title);
        });
    });

    cn.addEventListener('click', function(){ acHide(); wmClose(winId); });
    const w=wmWindows[winId];
    if(w) w.el.addEventListener('keydown', function(e){
        if(e.key==='Enter' && !(acEl&&acEl.style.display!=='none'&&acFocused>=0)) sv.click();
        if(e.key==='Escape'){ acHide(); wmClose(winId); }
    });
}

// ==================== START MENU ====================
const startMenuEl = document.getElementById('start-menu');
let startMenuOpen = false;
function toggleStartMenu() { startMenuOpen=!startMenuOpen; if(startMenuOpen){startMenuEl.classList.remove('hidden');document.getElementById('start-btn').classList.add('active');}else closeStartMenu(); }
function closeStartMenu() {
    startMenuEl.classList.add('hidden');
    document.getElementById('start-btn').classList.remove('active');
    startMenuOpen = false;
    const ap = document.getElementById('sm-all-programs');
    if (ap) ap.classList.add('hidden');
}
function startMenuAction(a) {
    if (a === 'allprograms') { openAllPrograms(); return; }
    closeStartMenu();
    switch(a){
        case 'search':     openSearch();      break; case 'notepad':    openNotepad();    break;
        case 'calculator': openCalculator();  break; case 'minesweeper':openMinesweeper();break;
        case 'solitaire':  openSolitaire();   break; case 'hearts':     openHearts();     break;
        case 'pinball':    openPinball();     break;
        case 'paint':      openPaint();       break; case 'wordpad':    openWordPad();    break;
        case 'cmd':        openCmd();         break;
        case 'settings':   openSettings();    break; case 'mycomputer': openMyComputer(); break;
        case 'run':        openRun();         break; case 'taskmgr':   openTaskManager(); break;
        case 'stickies':   createSticky();    break;
        case 'recycle':    openRecycleBin();  break; case 'setbg':      document.getElementById('bg-upload').click(); break;
        case 'removebg':   localStorage.removeItem(STORAGE.bg); applyBackground(); break;
        case 'export':     exportData();      break; case 'import':     document.getElementById('import-upload').click(); break;
        case 'update':     checkForUpdates(false); break;
        case 'shutdown':   openShutdownDialog(); break;
    }
}

// ==================== ALL PROGRAMS ====================
function openAllPrograms() {
    const panel = document.getElementById('sm-all-programs');
    const list  = document.getElementById('sm-programs-list');
    if (!panel || !list) return;
    list.innerHTML = '';

    // Папка: Игры
    var gameItems = [
        { name:'Сапёр',   action: function(){ closeStartMenu(); openMinesweeper(); } },
        { name:'Косынка', action: function(){ closeStartMenu(); openSolitaire(); } },
        { name:'Червы',   action: function(){ closeStartMenu(); openHearts(); } },
        { name:'Пинбол',  action: function(){ closeStartMenu(); openPinball(); } },
    ];
    list.appendChild(makeFolderBlock('🎮 Игры', gameItems, true));

    // Папка: Программы — встроенные + ярлыки с рабочего стола
    var builtins = [
        { name:'Блокнот',          action: function(){ closeStartMenu(); openNotepad(); } },
        { name:'WordPad',          action: function(){ closeStartMenu(); openWordPad(); } },
        { name:'Paint',            action: function(){ closeStartMenu(); openPaint(); } },
        { name:'Калькулятор',      action: function(){ closeStartMenu(); openCalculator(); } },
        { name:'Командная строка', action: function(){ closeStartMenu(); openCmd(); } },
        { name:'Диспетчер задач',  action: function(){ closeStartMenu(); openTaskManager(); } },
    ];
    var progItems = links.filter(function(i){ return !i.isFolder; }).map(function(i){
        return { name: i.name, favicon: i.customIcon || getFaviconUrl(i.url),
                 action: function(){ closeStartMenu(); navToUrl(i.url); } };
    });
    list.appendChild(makeFolderBlock('📁 Программы', builtins.concat(progItems), false));

    panel.classList.remove('hidden');
}

function makeFolderBlock(title, items, openByDefault) {
    var wrap = document.createElement('div');
    wrap.className = 'sm-prog-folder-wrap';

    var hdr = document.createElement('div');
    hdr.className = 'sm-prog-folder-header';
    hdr.innerHTML =
        '<svg width="16" height="14" viewBox="0 0 48 40" style="flex-shrink:0">' +
        '<path d="M2 8 L2 37 L46 37 L46 13 L22 13 L18 8 Z" fill="#f0c040" stroke="#c89828" stroke-width="1"/>' +
        '<path d="M2 16 L46 16 L46 37 L2 37 Z" fill="#f8d860" stroke="#c89828" stroke-width="0.5"/>' +
        '</svg><span>' + escapeHtml(title) + '</span>' +
        '<span class="sm-prog-folder-arrow">' + (openByDefault ? '▾' : '▸') + '</span>';
    wrap.appendChild(hdr);

    var body = document.createElement('div');
    body.className = 'sm-prog-folder-body';
    if (!openByDefault) body.classList.add('hidden');

    items.forEach(function(item){
        var el = document.createElement('div');
        el.className = 'sm-prog-item sm-prog-item-indent';
        if (item.favicon) {
            el.innerHTML = '<img class="sm-prog-favicon" src="' + escapeHtml(item.favicon) + '" alt="" onerror="this.style.display=\'none\'"><span>' + escapeHtml(item.name) + '</span>';
        } else {
            el.innerHTML = '<span class="sm-prog-no-icon">📄</span><span>' + escapeHtml(item.name) + '</span>';
        }
        el.addEventListener('click', item.action);
        body.appendChild(el);
    });
    wrap.appendChild(body);

    hdr.addEventListener('click', function(){
        var isOpen = !body.classList.contains('hidden');
        body.classList.toggle('hidden', isOpen);
        wrap.querySelector('.sm-prog-folder-arrow').textContent = isOpen ? '▸' : '▾';
    });
    return wrap;
}

function makeProgItem(item, inFolder) {
    var el = document.createElement('div');
    el.className = 'sm-prog-item' + (inFolder ? ' sm-prog-item-indent' : '');
    var fav = item.customIcon || getFaviconUrl(item.url);
    el.innerHTML = '<img class="sm-prog-favicon" src="' + escapeHtml(fav) + '" alt=""><span>' + escapeHtml(item.name) + '</span>';
    el.addEventListener('click', function() { closeStartMenu(); navToUrl(item.url); });
    return el;
}

// ==================== SEARCH ====================
function openSearch() {
    if (wmWindows['search']) { wmRestore('search'); wmFocus('search'); return; }
    const c=document.createElement('div'); c.className='search-window';
    const f=document.createElement('div'); f.className='search-form'; f.innerHTML='<label>Поиск в интернете:</label>';
    const inp=document.createElement('input'); inp.type='text'; inp.placeholder='Введите запрос...'; inp.autocomplete='off';
    const bd=document.createElement('div'); bd.className='search-btns';
    const yB=document.createElement('button'); yB.className='xp-dialog-btn xp-dialog-btn-primary'; yB.textContent='Яндекс';
    const gB=document.createElement('button'); gB.className='xp-dialog-btn'; gB.textContent='Google';
    bd.appendChild(yB); bd.appendChild(gB); f.appendChild(inp); f.appendChild(bd); c.appendChild(f);
    wmCreate('search','Поиск',c,380,155,'\uD83D\uDD0D');
    function go(e){const q=inp.value.trim();if(!q)return;window.open((e==='y'?'https://yandex.ru/search/?text=':'https://www.google.com/search?q=')+encodeURIComponent(q),'_blank');}
    yB.addEventListener('click',function(){go('y');}); gB.addEventListener('click',function(){go('g');});
    inp.addEventListener('keydown',function(e){if(e.key==='Enter')go('y');}); setTimeout(function(){inp.focus();},50);
}

// ==================== CALENDAR ====================
function toggleCalendar() {
    const existing = document.getElementById('xp-calendar');
    if (existing) { existing.remove(); return; }
    let calYear, calMonth;
    const now = new Date();
    calYear = now.getFullYear(); calMonth = now.getMonth();
    const el = document.createElement('div');
    el.id = 'xp-calendar'; el.className = 'xp-calendar';
    document.body.appendChild(el);
    function renderCal() {
        const DAYS = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
        const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
        const today = new Date(); const td = today.getDate(), tm = today.getMonth(), ty = today.getFullYear();
        const first = new Date(calYear, calMonth, 1);
        let startDow = first.getDay(); if (startDow === 0) startDow = 7; // Mon=1
        const daysInMonth = new Date(calYear, calMonth+1, 0).getDate();
        const daysInPrev  = new Date(calYear, calMonth, 0).getDate();
        let html = '<div class="xp-cal-header">' +
            '<span class="xp-cal-nav" id="xp-cal-prev">&#9664;</span>' +
            '<span>' + MONTHS[calMonth] + ' ' + calYear + '</span>' +
            '<span class="xp-cal-nav" id="xp-cal-next">&#9654;</span>' +
            '</div><div class="xp-cal-grid">';
        DAYS.forEach(function(d){ html += '<div class="xp-cal-dow">'+d+'</div>'; });
        for (let i = 1; i < startDow; i++) {
            html += '<div class="xp-cal-day other-month">'+(daysInPrev - startDow + 1 + i)+'</div>';
        }
        for (let d = 1; d <= daysInMonth; d++) {
            const isToday = d===td && calMonth===tm && calYear===ty;
            html += '<div class="xp-cal-day'+(isToday?' today':'')+'">'+d+'</div>';
        }
        const total = startDow - 1 + daysInMonth;
        const remainder = total % 7 === 0 ? 0 : 7 - (total % 7);
        for (let i = 1; i <= remainder; i++) html += '<div class="xp-cal-day other-month">'+i+'</div>';
        html += '</div>';
        el.innerHTML = html;
        document.getElementById('xp-cal-prev').addEventListener('click', function(e){
            e.stopPropagation(); calMonth--; if(calMonth<0){calMonth=11;calYear--;} renderCal();
        });
        document.getElementById('xp-cal-next').addEventListener('click', function(e){
            e.stopPropagation(); calMonth++; if(calMonth>11){calMonth=0;calYear++;} renderCal();
        });
    }
    renderCal();
    const r = document.getElementById('tray-clock').getBoundingClientRect();
    el.style.bottom = (window.innerHeight - r.top + 2) + 'px';
    el.style.right = (window.innerWidth - r.right) + 'px';
    setTimeout(function() {
        document.addEventListener('click', function dismiss(ev) {
            if (!el.contains(ev.target) && ev.target !== document.getElementById('tray-clock')) {
                el.remove(); document.removeEventListener('click', dismiss);
            }
        });
    }, 10);
}

// ==================== VOLUME POPUP ====================
function toggleVolumePopup() {
    const existing = document.getElementById('xp-volume-popup');
    if (existing) { existing.remove(); return; }
    const popup = document.createElement('div');
    popup.id = 'xp-volume-popup'; popup.className = 'xp-volume-popup';
    const curVol = parseFloat(localStorage.getItem('edge_volume') || '0.7');
    const lbl = document.createElement('label'); lbl.textContent = '🔊';
    const slider = document.createElement('input'); slider.type='range'; slider.min='0'; slider.max='1'; slider.step='0.05'; slider.value=curVol;
    const valLbl = document.createElement('label'); valLbl.textContent = Math.round(curVol*100)+'%';
    popup.appendChild(lbl); popup.appendChild(slider); popup.appendChild(valLbl);
    document.body.appendChild(popup);
    const tvEl = document.getElementById('tray-volume');
    const r = tvEl.getBoundingClientRect();
    popup.style.bottom = (window.innerHeight - r.top + 2) + 'px';
    popup.style.left = r.left + 'px';
    function updateVolIcon(v) {
        tvEl.textContent = v === 0 ? '🔇' : v < 0.3 ? '🔈' : v < 0.7 ? '🔉' : '🔊';
    }
    slider.addEventListener('input', function() {
        const v = parseFloat(slider.value);
        localStorage.setItem('edge_volume', v);
        if (_xpGain) _xpGain.gain.value = v;
        valLbl.textContent = Math.round(v*100)+'%';
        updateVolIcon(v);
    });
    setTimeout(function() {
        document.addEventListener('click', function dismiss(ev) {
            if (!popup.contains(ev.target) && ev.target !== tvEl) {
                popup.remove(); document.removeEventListener('click', dismiss);
            }
        });
    }, 10);
}

// ==================== RUN DIALOG ====================
function openRun() {
    if (wmWindows['run']) { wmRestore('run'); wmFocus('run'); return; }
    const c = document.createElement('div'); c.className = 'dialog-form';
    c.innerHTML = '<div style="font-family:Tahoma,sans-serif;font-size:11px;color:#333;margin-bottom:8px;">Введите адрес интернет-ресурса или программы:</div>';
    const fg = document.createElement('div'); fg.className='form-group'; fg.innerHTML='<label>Открыть:</label>';
    const inp = document.createElement('input'); inp.type='text'; inp.placeholder='https://...';
    fg.appendChild(inp); c.appendChild(fg);

    // History autocomplete (reuse xp-url-autocomplete pattern)
    const acEl = document.createElement('div'); acEl.className='xp-url-autocomplete'; acEl.style.display='none';
    document.body.appendChild(acEl);
    let acItems=[], acFocused=-1;
    function acHide(){acEl.style.display='none';acItems=[];acFocused=-1;}
    function acDestroy(){acEl.remove();}
    function acPos(){const r=inp.getBoundingClientRect();acEl.style.left=r.left+'px';acEl.style.top=r.bottom+'px';acEl.style.width=r.width+'px';}
    inp.addEventListener('input',function(){
        const q=inp.value.trim(); if(!q){acHide();return;}
        chrome.history.search({text:q,maxResults:6,startTime:0},function(res){
            acEl.innerHTML=''; acItems=res||[]; acFocused=-1;
            acItems.forEach(function(h,i){
                const row=document.createElement('div'); row.className='xp-url-ac-item';
                const img=document.createElement('img'); img.src='chrome-extension://'+chrome.runtime.id+'/_favicon/?pageUrl='+encodeURIComponent(h.url)+'&size=16';
                img.onerror=function(){img.style.visibility='hidden';};
                const span=document.createElement('span'); span.textContent=h.url;
                row.appendChild(img); row.appendChild(span);
                row.addEventListener('mousedown',function(e){e.preventDefault();inp.value=h.url;acHide();inp.focus();});
                acEl.appendChild(row);
            });
            if(acItems.length){acPos();acEl.style.display='block';}else acHide();
        });
    });
    inp.addEventListener('keydown',function(e){
        if(acEl.style.display==='none')return;
        if(e.key==='ArrowDown'){e.preventDefault();const rows=acEl.querySelectorAll('.xp-url-ac-item');rows.forEach(r=>r.classList.remove('ac-focused'));acFocused=Math.min(acFocused+1,acItems.length-1);if(rows[acFocused])rows[acFocused].classList.add('ac-focused');}
        else if(e.key==='ArrowUp'){e.preventDefault();const rows=acEl.querySelectorAll('.xp-url-ac-item');rows.forEach(r=>r.classList.remove('ac-focused'));acFocused=Math.max(acFocused-1,0);if(rows[acFocused])rows[acFocused].classList.add('ac-focused');}
        else if(e.key==='Enter'&&acFocused>=0){inp.value=acItems[acFocused].url;acHide();}
        else if(e.key==='Escape'){acHide();}
    });
    inp.addEventListener('blur',function(){setTimeout(acHide,150);});

    const bd=document.createElement('div'); bd.className='dialog-btns';
    const ok=document.createElement('button'); ok.className='xp-dialog-btn xp-dialog-btn-primary'; ok.textContent='OK';
    const cn=document.createElement('button'); cn.className='xp-dialog-btn'; cn.textContent='Отмена';
    bd.appendChild(ok); bd.appendChild(cn); c.appendChild(bd);
    wmCreate('run','Выполнить',c,360,140,'\u25B6');
    setTimeout(function(){inp.focus();},50);
    ok.addEventListener('click',function(){
        acHide(); let url=inp.value.trim(); if(!url)return;
        if(!/^[a-z][a-z0-9+\-.]*:\/\//i.test(url))url='https://'+url;
        acDestroy(); window.open(url,'_blank'); wmClose('run');
    });
    cn.addEventListener('click',function(){acDestroy();wmClose('run');});
    const w=wmWindows['run']; if(w){
        const xBtn=w.el.querySelector('.xp-btn-close'); if(xBtn)xBtn.addEventListener('click',acDestroy);
        w.el.addEventListener('keydown',function(e){
            if(e.key==='Enter'&&!(acEl.style.display==='block'&&acFocused>=0))ok.click();
            if(e.key==='Escape'){acDestroy();wmClose('run');}
        });
    }
}

// ==================== TASK MANAGER ====================
function openTaskManager() {
    if (wmWindows['taskmgr']) { wmRestore('taskmgr'); wmFocus('taskmgr'); return; }
    const FAKE_PROCS = [
        {name:'System Idle Process',pid:0,mem:'24 КБ'},
        {name:'System',pid:4,mem:'244 КБ'},
        {name:'explorer.exe',pid:1452,mem:'22 560 КБ'},
        {name:'svchost.exe',pid:876,mem:'4 428 КБ'},
        {name:'svchost.exe',pid:944,mem:'3 816 КБ'},
        {name:'svchost.exe',pid:1024,mem:'7 240 КБ'},
        {name:'lsass.exe',pid:672,mem:'1 524 КБ'},
        {name:'winlogon.exe',pid:624,mem:'2 844 КБ'},
        {name:'taskmgr.exe',pid:2048,mem:'3 976 КБ'},
    ];
    const c = document.createElement('div');
    c.style.cssText = 'display:flex;flex-direction:column;height:100%;font-family:Tahoma,sans-serif;font-size:11px;';

    // Tabs
    const tabBar = document.createElement('div'); tabBar.className='settings-tabs'; tabBar.style.margin='0 0 6px 0';
    const tabs = [['apps','Приложения'],['procs','Процессы']];
    const panels = {};
    tabs.forEach(function(t){
        const btn=document.createElement('div'); btn.className='settings-tab'+(t[0]==='apps'?' active':'');
        btn.textContent=t[1]; btn.dataset.tab=t[0]; tabBar.appendChild(btn);
        const panel=document.createElement('div'); panel.className='settings-tab-content'+(t[0]==='apps'?' active':'');
        panel.style.cssText='flex:1;overflow-y:auto;'; panels[t[0]]=panel;
    });
    tabBar.querySelectorAll && tabBar.addEventListener('click',function(e){
        const btn=e.target.closest('.settings-tab'); if(!btn)return;
        tabBar.querySelectorAll('.settings-tab').forEach(function(b){b.classList.remove('active');});
        btn.classList.add('active');
        Object.keys(panels).forEach(function(k){panels[k].classList.remove('active');});
        panels[btn.dataset.tab].classList.add('active');
    });

    // Apps panel
    const appsPanel = panels['apps'];
    appsPanel.style.cssText = 'flex:1;overflow-y:auto;padding:4px;';
    function refreshApps() {
        appsPanel.innerHTML = '';
        const tbl = document.createElement('table'); tbl.style.cssText='width:100%;border-collapse:collapse;';
        tbl.innerHTML = '<tr style="background:#ECE9D8;font-weight:bold;"><td style="padding:3px 6px;border-bottom:1px solid #aca899;">Задача</td><td style="padding:3px 6px;border-bottom:1px solid #aca899;width:70px;">Статус</td><td style="padding:3px 6px;border-bottom:1px solid #aca899;width:80px;"></td></tr>';
        Object.keys(wmWindows).forEach(function(id) {
            const w=wmWindows[id]; if(!w)return;
            const titleEl=w.el.querySelector('.xp-titlebar-title'); const title=titleEl?titleEl.textContent:'(окно)';
            const tr=document.createElement('tr'); tr.style.cursor='default';
            tr.innerHTML='<td style="padding:2px 6px;">'+ escapeHtml(title) +'</td><td style="padding:2px 6px;color:#006600;">Работает</td><td style="padding:2px 6px;"></td>';
            const killBtn=document.createElement('button'); killBtn.className='xp-dialog-btn'; killBtn.textContent='Снять'; killBtn.style.cssText='min-width:0;padding:1px 6px;height:18px;font-size:10px;';
            killBtn.addEventListener('click',function(){wmClose(id);setTimeout(refreshApps,150);});
            tr.cells[2].appendChild(killBtn);
            tr.addEventListener('dblclick',function(){wmRestore(id);wmFocus(id);});
            tbl.appendChild(tr);
        });
        if(Object.keys(wmWindows).filter(function(k){return k!=='taskmgr';}).length===0){
            const tr=document.createElement('tr');tr.innerHTML='<td colspan="3" style="padding:6px;color:#999;text-align:center;">Нет открытых окон</td>';tbl.appendChild(tr);
        }
        appsPanel.appendChild(tbl);
    }
    refreshApps();

    // Processes panel
    const procsPanel = panels['procs'];
    procsPanel.style.cssText = 'flex:1;overflow-y:auto;padding:4px;';
    const pTbl = document.createElement('table'); pTbl.style.cssText='width:100%;border-collapse:collapse;';
    let pHtml='<tr style="background:#ECE9D8;font-weight:bold;"><td style="padding:3px 6px;border-bottom:1px solid #aca899;">Имя</td><td style="padding:3px 6px;border-bottom:1px solid #aca899;width:50px;">PID</td><td style="padding:3px 6px;border-bottom:1px solid #aca899;width:90px;">Память</td></tr>';
    FAKE_PROCS.forEach(function(p){pHtml+='<tr><td style="padding:2px 6px;">'+p.name+'</td><td style="padding:2px 6px;">'+p.pid+'</td><td style="padding:2px 6px;">'+p.mem+'</td></tr>';});
    // Add browser real info
    if(window.performance&&performance.memory){
        const mb=Math.round(performance.memory.usedJSHeapSize/1048576);
        pHtml+='<tr style="background:#f8f8e0;"><td style="padding:2px 6px;">chrome.exe</td><td style="padding:2px 6px;">–</td><td style="padding:2px 6px;">'+mb+' МБ</td></tr>';
    }
    pTbl.innerHTML=pHtml; procsPanel.appendChild(pTbl);

    // Status bar
    const statusBar=document.createElement('div');
    statusBar.style.cssText='display:flex;gap:16px;padding:4px 8px;background:#ECE9D8;border-top:1px solid #aca899;font-size:10px;color:#333;flex-shrink:0;';
    function updateStatus(){
        const cnt=Object.keys(wmWindows).length;
        statusBar.textContent='Процессы: '+(FAKE_PROCS.length+1)+'\u2002|\u2002Окон: '+cnt+'\u2002|\u2002ЦП: '+(Math.floor(Math.random()*8)+1)+'%';
    }
    updateStatus();

    c.appendChild(tabBar);
    Object.values(panels).forEach(function(p){c.appendChild(p);});
    c.appendChild(statusBar);

    wmCreate('taskmgr','Диспетчер задач',c,520,360,'📊');
    const tmRefresh = setInterval(function(){
        if(!wmWindows['taskmgr']){clearInterval(tmRefresh);return;}
        const activeTab=c.querySelector('.settings-tab.active');
        if(activeTab&&activeTab.dataset.tab==='apps') refreshApps();
        updateStatus();
    },2000);
}

// ==================== LINKS EXPLORER ====================
function openLinksExplorer() {
    if (wmWindows['links']) { wmRestore('links'); wmFocus('links'); return; }

    const c = document.createElement('div'); c.className = 'xp-explorer';
    let selectedIdx = -1;

    // --- Toolbar ---
    const tb = document.createElement('div'); tb.className = 'xp-explorer-toolbar';
    const backBtn = document.createElement('button'); backBtn.className = 'xp-explorer-tb-btn'; backBtn.title = 'Назад';
    backBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14"><path d="M9 2L4 7l5 5" stroke="#333" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Назад</span>';
    backBtn.disabled = true;
    const addrBar = document.createElement('div'); addrBar.className = 'xp-explorer-addr';
    addrBar.innerHTML = '<span class="xp-explorer-addr-icon">💾</span><span>Мои ярлыки (C:\\)</span>';
    tb.appendChild(backBtn); tb.appendChild(addrBar); c.appendChild(tb);

    // --- Separator ---
    const sep = document.createElement('div'); sep.className = 'xp-explorer-toolbar-sep'; c.appendChild(sep);

    // --- Body: sidebar + list ---
    const body = document.createElement('div'); body.className = 'xp-explorer-body'; c.appendChild(body);

    // Sidebar
    const sidebar = document.createElement('div'); sidebar.className = 'xp-explorer-sidebar';
    const sbTitle = document.createElement('div'); sbTitle.className = 'xp-explorer-sb-title';
    sbTitle.innerHTML = '<span>🔗</span> Действия';
    sidebar.appendChild(sbTitle);
    function mkSbBtn(label, fn) {
        const btn = document.createElement('div'); btn.className = 'xp-explorer-sb-item';
        btn.textContent = label;
        btn.addEventListener('click', fn);
        sidebar.appendChild(btn);
    }
    mkSbBtn('🌐 Открыть', function() {
        if (selectedIdx < 0 || !links[selectedIdx]) return;
        chrome.tabs.create({ url: links[selectedIdx].url });
    });
    mkSbBtn('✏️ Переименовать', function() {
        if (selectedIdx < 0 || !links[selectedIdx]) return;
        const item = links[selectedIdx];
        const newName = prompt('Новое название:', item.name);
        if (newName && newName.trim()) { item.name = newName.trim(); saveLinks(); renderList(); }
    });
    mkSbBtn('🗑️ Удалить', function() {
        if (selectedIdx < 0 || !links[selectedIdx]) return;
        const item = links[selectedIdx];
        item.deletedAt = Date.now();
        trashedLinks.push(item);
        localStorage.setItem(STORAGE.trash, JSON.stringify(trashedLinks));
        links.splice(selectedIdx, 1);
        selectedIdx = -1;
        saveAndRender(); renderList();
    });
    body.appendChild(sidebar);

    // File list
    const main = document.createElement('div'); main.className = 'xp-explorer-main';

    // Column headers
    const hdr = document.createElement('div'); hdr.className = 'xp-explorer-hdr';
    hdr.innerHTML = '<div class="xp-explorer-hdr-name">Имя</div><div class="xp-explorer-hdr-url">Адрес</div>';
    main.appendChild(hdr);

    const rows = document.createElement('div'); rows.className = 'xp-explorer-rows';

    function renderList() {
        rows.innerHTML = '';
        selectedIdx = -1;
        if (!links.length) {
            rows.innerHTML = '<div style="padding:16px;color:#666;font-family:Tahoma,sans-serif;font-size:11px;">Ярлыков нет. Добавьте их через рабочий стол.</div>';
            return;
        }
        links.forEach(function(item, i) {
            if (item.isFolder) return; // пропускаем папки
            const row = document.createElement('div'); row.className = 'xp-explorer-row';
            if (i % 2 === 0) row.classList.add('even');

            const ico = document.createElement('img');
            ico.className = 'xp-explorer-row-ico';
            ico.src = 'chrome-extension://'+chrome.runtime.id+'/_favicon/?pageUrl='+encodeURIComponent(item.url)+'&size=16';
            ico.onerror = function(){ ico.style.visibility='hidden'; };

            const nameCell = document.createElement('div'); nameCell.className = 'xp-explorer-row-name';
            nameCell.textContent = item.name || item.url;

            const urlCell = document.createElement('div'); urlCell.className = 'xp-explorer-row-url';
            urlCell.textContent = item.url;

            row.appendChild(ico); row.appendChild(nameCell); row.appendChild(urlCell);

            row.addEventListener('click', function() {
                rows.querySelectorAll('.xp-explorer-row').forEach(function(r){ r.classList.remove('selected'); });
                row.classList.add('selected');
                selectedIdx = i;
            });
            row.addEventListener('dblclick', function() {
                chrome.tabs.create({ url: item.url });
            });
            rows.appendChild(row);
        });
    }
    renderList();
    main.appendChild(rows);
    body.appendChild(main);

    // Status bar
    const status = document.createElement('div'); status.className = 'xp-explorer-status';
    status.textContent = 'Объектов: ' + links.filter(function(l){ return !l.isFolder; }).length;
    c.appendChild(status);

    wmCreate('links', 'Избранное', c, 560, 360, '💾');
}

// ==================== MY COMPUTER ====================
function openMyComputer() {
    if (wmWindows['mycomputer']) { wmRestore('mycomputer'); wmFocus('mycomputer'); return; }
    const wrap = document.createElement('div'); wrap.className = 'mycomputer-wrap';

    const sidebar = document.createElement('div'); sidebar.className = 'mycomputer-sidebar';
    sidebar.innerHTML = '<h4>Системные задачи</h4>';
    [['📝 Блокнот', function(){openNotepad();}],['🔍 Поиск', function(){openSearch();}],['♻️ Корзина', function(){openRecycleBin();}],['💻 Сведения', function(){openSystemInfo();}]].forEach(function(item){
        const d=document.createElement('div'); d.className='mycomputer-sidebar-item';
        d.textContent=item[0]; d.addEventListener('click',item[1]); sidebar.appendChild(d);
    });

    const main = document.createElement('div'); main.className = 'mycomputer-main';
    const addr = document.createElement('div'); addr.className = 'mycomputer-address';
    addr.innerHTML = '<span>💻</span><span>Мой компьютер</span>';
    main.appendChild(addr);

    const drives = document.createElement('div'); drives.className = 'mycomputer-drives';
    const driveItems = [
        {icon:'💾',name:'Мои ярлыки (C:)',info:links.length+' объектов',action:function(){openLinksExplorer();}},
        {icon:'📚',name:'Избранное (D:)',info:'Закладки браузера',action:function(){openBrowserBookmarks();}},
        {icon:'📝',name:'Документы',info:'WordPad',action:function(){openWordPad();}},
        {icon:'♻️',name:'Корзина',info:trashedLinks.length+' элементов',action:function(){openRecycleBin();}},
        {icon:'💻',name:'Сведения',info:'О системе',action:function(){openSystemInfo();}},
    ];
    driveItems.forEach(function(d){
        const el=document.createElement('div'); el.className='mycomputer-drive';
        el.innerHTML='<div class="mycomputer-drive-icon">'+d.icon+'</div><div class="mycomputer-drive-name">'+escapeHtml(d.name)+'</div><div class="mycomputer-drive-info">'+escapeHtml(d.info)+'</div>';
        el.addEventListener('dblclick',d.action); drives.appendChild(el);
    });
    main.appendChild(drives);
    wrap.appendChild(sidebar); wrap.appendChild(main);
    wmCreate('mycomputer','Мой компьютер',wrap,540,360,'💻');
}

// ==================== BROWSER BOOKMARKS ====================
function openBrowserBookmarks() {
    if (wmWindows['bkmarks']) { wmRestore('bkmarks'); wmFocus('bkmarks'); return; }

    var wrap = document.createElement('div'); wrap.className = 'xp-explorer';

    // Toolbar / address bar
    var tb = document.createElement('div'); tb.className = 'xp-explorer-toolbar';
    var addr = document.createElement('div'); addr.className = 'xp-explorer-addr';
    addr.innerHTML = '<span class="xp-explorer-addr-icon">📚</span><span id="bkmarks-addr-txt">D:\\Избранное</span>';
    tb.appendChild(addr);
    wrap.appendChild(tb);
    var tbSep = document.createElement('div'); tbSep.className = 'xp-explorer-toolbar-sep';
    wrap.appendChild(tbSep);

    // Body
    var body = document.createElement('div'); body.className = 'xp-explorer-body';

    // Sidebar — folder tree
    var sidebar = document.createElement('div'); sidebar.className = 'xp-explorer-sidebar';
    var sbTitle = document.createElement('div'); sbTitle.className = 'xp-explorer-sb-title';
    sbTitle.innerHTML = '📂 Папки';
    sidebar.appendChild(sbTitle);
    var treeEl = document.createElement('div'); treeEl.id = 'bkmarks-tree';
    sidebar.appendChild(treeEl);

    // Main — item list
    var main = document.createElement('div'); main.className = 'xp-explorer-main';
    var rowsEl = document.createElement('div'); rowsEl.className = 'xp-explorer-rows'; rowsEl.id = 'bkmarks-rows';
    main.appendChild(rowsEl);
    var statusEl = document.createElement('div'); statusEl.className = 'xp-explorer-status'; statusEl.id = 'bkmarks-status';
    statusEl.textContent = 'Загрузка...';
    main.appendChild(statusEl);

    body.appendChild(sidebar); body.appendChild(main);
    wrap.appendChild(body);

    wmCreate('bkmarks', 'Избранное (D:)', wrap, 580, 420, '📚');

    chrome.bookmarks.getTree(function(tree){
        var roots = (tree[0] && tree[0].children) ? tree[0].children : [];
        _renderBkmarksTree(treeEl, roots, rowsEl, statusEl);
        if (roots.length > 0) _showBkmarksFolder(roots[0], rowsEl, statusEl, treeEl);
    });
}

function _renderBkmarksTree(treeEl, nodes, rowsEl, statusEl) {
    treeEl.innerHTML = '';
    nodes.forEach(function(node){
        if (node.url) return;
        treeEl.appendChild(_makeBkmarksFolderRow(node, 0, treeEl, rowsEl, statusEl));
    });
}

function _makeBkmarksFolderRow(node, depth, treeEl, rowsEl, statusEl) {
    var wrap = document.createElement('div');

    var row = document.createElement('div');
    row.className = 'bkmarks-tree-item';
    row.style.paddingLeft = (8 + depth * 14) + 'px';
    row.innerHTML =
        '<svg width="16" height="14" viewBox="0 0 48 40" style="flex-shrink:0;margin-right:5px">' +
        '<path d="M2 8 L2 37 L46 37 L46 13 L22 13 L18 8 Z" fill="#f0c040" stroke="#c89828" stroke-width="1.5"/>' +
        '<path d="M2 16 L46 16 L46 37 L2 37 Z" fill="#f8d860" stroke="#c89828" stroke-width="0.5"/>' +
        '</svg><span>' + escapeHtml(node.title || '(без имени)') + '</span>';

    row.addEventListener('click', function(e){
        e.stopPropagation();
        treeEl.querySelectorAll('.bkmarks-tree-item').forEach(function(r){ r.classList.remove('selected'); });
        row.classList.add('selected');
        _showBkmarksFolder(node, rowsEl, statusEl, treeEl);
        var addrTxt = document.getElementById('bkmarks-addr-txt');
        if (addrTxt) addrTxt.textContent = 'D:\\' + (node.title || '');
    });
    wrap.appendChild(row);

    if (node.children) {
        node.children.forEach(function(child){
            if (!child.url) {
                wrap.appendChild(_makeBkmarksFolderRow(child, depth + 1, treeEl, rowsEl, statusEl));
            }
        });
    }
    return wrap;
}

function _showBkmarksFolder(node, rowsEl, statusEl, treeEl) {
    rowsEl.innerHTML = '';
    var children = node.children || [];
    var folders = children.filter(function(c){ return !c.url; });
    var items   = children.filter(function(c){ return  !!c.url; });
    var idx = 0;

    folders.forEach(function(folder){
        var row = document.createElement('div');
        row.className = 'xp-explorer-row' + (idx++ % 2 === 1 ? ' even' : '');
        row.innerHTML =
            '<svg width="16" height="14" viewBox="0 0 48 40" class="xp-explorer-row-ico" style="flex-shrink:0">' +
            '<path d="M2 8 L2 37 L46 37 L46 13 L22 13 L18 8 Z" fill="#f0c040" stroke="#c89828" stroke-width="1.5"/>' +
            '<path d="M2 16 L46 16 L46 37 L2 37 Z" fill="#f8d860" stroke="#c89828" stroke-width="0.5"/>' +
            '</svg>' +
            '<span class="xp-explorer-row-name">' + escapeHtml(folder.title || '(без имени)') + '</span>' +
            '<span class="xp-explorer-row-url" style="color:#888">Папка</span>';
        row.addEventListener('dblclick', function(){
            _showBkmarksFolder(folder, rowsEl, statusEl, treeEl);
            var addrTxt = document.getElementById('bkmarks-addr-txt');
            if (addrTxt) addrTxt.textContent = 'D:\\' + (folder.title || '');
            treeEl.querySelectorAll('.bkmarks-tree-item').forEach(function(r){ r.classList.remove('selected'); });
        });
        rowsEl.appendChild(row);
    });

    items.forEach(function(item){
        var row = document.createElement('div');
        row.className = 'xp-explorer-row' + (idx++ % 2 === 1 ? ' even' : '');
        var fav = getFaviconUrl(item.url);
        row.innerHTML =
            '<img class="xp-explorer-row-ico" src="' + escapeHtml(fav) + '" alt="" ' +
            'style="width:16px;height:16px;object-fit:contain;flex-shrink:0" ' +
            'onerror="this.replaceWith(Object.assign(document.createElement(\'span\'),{textContent:\'🌐\',style:\'font-size:13px;flex-shrink:0;width:16px\'}))">' +
            '<span class="xp-explorer-row-name">' + escapeHtml(item.title || item.url) + '</span>' +
            '<span class="xp-explorer-row-url">' + escapeHtml(item.url) + '</span>';
        row.addEventListener('click', function(){
            rowsEl.querySelectorAll('.xp-explorer-row').forEach(function(r){ r.classList.remove('selected'); });
            row.classList.add('selected');
        });
        row.addEventListener('dblclick', function(){ navToUrl(item.url); });
        rowsEl.appendChild(row);
    });

    if (statusEl) statusEl.textContent = 'Объектов: ' + (folders.length + items.length);
}

// ==================== STICKY NOTES ====================
let stickies = JSON.parse(localStorage.getItem('edge_stickies') || '[]');
function saveStickies() { localStorage.setItem('edge_stickies', JSON.stringify(stickies)); }
const STICKY_COLORS = [
    {bg:'#fff9a0',bar:'#d4b800',label:'Жёлтый'},
    {bg:'#b8f0b8',bar:'#3a9a3a',label:'Зелёный'},
    {bg:'#b8d8ff',bar:'#2060c0',label:'Синий'},
    {bg:'#ffb8d0',bar:'#c03060',label:'Розовый'},
];
function createSticky(opts) {
    const id = opts&&opts.id ? opts.id : 'sticky_'+Date.now();
    const x  = opts&&opts.x!=null ? opts.x : Math.floor(Math.random()*300+100);
    const y  = opts&&opts.y!=null ? opts.y : Math.floor(Math.random()*200+60);
    const w  = opts&&opts.w ? opts.w : 180;
    const h  = opts&&opts.h ? opts.h : 140;
    const text = opts&&opts.text ? opts.text : '';
    const colorIdx = opts&&opts.colorIdx!=null ? opts.colorIdx : 0;
    const color = STICKY_COLORS[colorIdx] || STICKY_COLORS[0];

    const el = document.createElement('div');
    el.className = 'xp-sticky'; el.dataset.stickyId = id;
    el.style.cssText = 'left:'+x+'px;top:'+y+'px;width:'+w+'px;height:'+h+'px;background:'+color.bg+';';

    const bar = document.createElement('div'); bar.className = 'xp-sticky-titlebar';
    bar.style.background = 'linear-gradient(180deg,'+color.bar+' 0%,'+color.bar+'cc 100%)';
    bar.style.color = '#fff';

    const colorBtns = document.createElement('div'); colorBtns.className = 'xp-sticky-colors';
    STICKY_COLORS.forEach(function(c,i){
        const cb=document.createElement('div'); cb.className='xp-sticky-color-btn';
        cb.style.background=c.bg; cb.title=c.label;
        cb.addEventListener('click',function(){
            const s=stickies.find(function(s){return s.id===id;});
            if(s){s.colorIdx=i;saveStickies();}
            // reapply colors
            el.style.background=STICKY_COLORS[i].bg;
            bar.style.background='linear-gradient(180deg,'+STICKY_COLORS[i].bar+' 0%,'+STICKY_COLORS[i].bar+'cc 100%)';
            body.style.background='transparent';
        });
        colorBtns.appendChild(cb);
    });
    const closeBtn = document.createElement('span'); closeBtn.className = 'xp-sticky-close'; closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', function(){
        stickies = stickies.filter(function(s){return s.id!==id;});
        saveStickies(); el.remove();
    });
    bar.appendChild(colorBtns); bar.appendChild(closeBtn);

    const body = document.createElement('textarea'); body.className = 'xp-sticky-body';
    body.value = text; body.placeholder = 'Заметка...';
    body.style.background = 'transparent';
    body.addEventListener('input', function(){
        const s=stickies.find(function(s){return s.id===id;}); if(s){s.text=body.value;saveStickies();}
    });

    const rh = document.createElement('div'); rh.className = 'xp-sticky-resize';

    el.appendChild(bar); el.appendChild(body); el.appendChild(rh);
    document.getElementById('desktop').appendChild(el);

    // Drag
    bar.addEventListener('mousedown', function(e){
        if(e.target===closeBtn||e.target.classList.contains('xp-sticky-color-btn'))return;
        e.preventDefault();
        const sx=e.clientX,sy=e.clientY,ox=el.offsetLeft,oy=el.offsetTop;
        el.style.zIndex=8600;
        function onM(e){el.style.left=(ox+e.clientX-sx)+'px';el.style.top=Math.max(0,oy+e.clientY-sy)+'px';}
        function onU(){
            document.removeEventListener('mousemove',onM);document.removeEventListener('mouseup',onU);
            el.style.zIndex=8500;
            const s=stickies.find(function(s){return s.id===id;});
            if(s){s.x=el.offsetLeft;s.y=el.offsetTop;saveStickies();}
        }
        document.addEventListener('mousemove',onM);document.addEventListener('mouseup',onU);
    });
    // Resize
    rh.addEventListener('mousedown',function(e){
        e.preventDefault(); e.stopPropagation();
        const sx=e.clientX,sy=e.clientY,sw=el.offsetWidth,sh=el.offsetHeight;
        function onM(e){
            el.style.width=Math.max(120,sw+e.clientX-sx)+'px';
            el.style.height=Math.max(80,sh+e.clientY-sy)+'px';
        }
        function onU(){
            document.removeEventListener('mousemove',onM);document.removeEventListener('mouseup',onU);
            const s=stickies.find(function(s){return s.id===id;});
            if(s){s.w=el.offsetWidth;s.h=el.offsetHeight;saveStickies();}
        }
        document.addEventListener('mousemove',onM);document.addEventListener('mouseup',onU);
    });

    if (!opts || !opts.id) {
        stickies.push({id,x,y,w,h,text,colorIdx});
        saveStickies();
    }
    return el;
}
function renderStickies() {
    stickies.forEach(function(s){ createSticky(s); });
}

// ==================== SETTINGS ====================
function openSettings() {
    if (wmWindows['settings']) { wmRestore('settings'); wmFocus('settings'); return; }
    const c = document.createElement('div');
    c.style.cssText = 'display:flex;flex-direction:column;height:100%;font-family:Tahoma,sans-serif;font-size:11px;padding:8px;box-sizing:border-box;overflow:auto;';

    // Tabs
    const tabBar = document.createElement('div'); tabBar.className = 'settings-tabs';
    const tabNames = [['theme','Тема'],['desktop','Рабочий стол'],['screensaver','Заставка'],['params','Параметры']];
    const tabPanels = {};
    tabNames.forEach(function(tn, i) {
        const btn = document.createElement('div'); btn.className = 'settings-tab' + (i===0?' active':'');
        btn.textContent = tn[1]; btn.dataset.tab = tn[0]; tabBar.appendChild(btn);
        const p = document.createElement('div'); p.className = 'settings-tab-content settings-form' + (i===0?' active':'');
        tabPanels[tn[0]] = p;
    });
    tabBar.addEventListener('click', function(e) {
        const btn = e.target.closest('.settings-tab'); if(!btn)return;
        tabBar.querySelectorAll('.settings-tab').forEach(function(b){b.classList.remove('active');});
        btn.classList.add('active');
        Object.values(tabPanels).forEach(function(p){p.classList.remove('active');});
        tabPanels[btn.dataset.tab].classList.add('active');
    });
    c.appendChild(tabBar);
    Object.values(tabPanels).forEach(function(p){c.appendChild(p);});

    // --- Tab: Тема ---
    const tP = tabPanels['theme'];
    const vg = document.createElement('div'); vg.className = 'form-group'; vg.innerHTML = '<label>Режим вида: </label>';
    const vs = document.createElement('select'); vs.style.cssText = 'margin-left:4px;font-size:11px;';
    [['glass','Плитки (стекло)'],['window','Окна с превью'],['icon','Ярлыки XP']].forEach(function(opt) {
        const o = document.createElement('option'); o.value = opt[0]; o.textContent = opt[1];
        if (settings.viewMode === opt[0]) o.selected = true;
        vs.appendChild(o);
    });
    vg.appendChild(vs); tP.appendChild(vg);
    const modeBlock = document.createElement('div'); modeBlock.className = 'settings-mode-block'; tP.appendChild(modeBlock);
    function mkR(label, key, min, max, sfx, step) {
        const g = document.createElement('div'); g.className = 'form-group';
        const l = document.createElement('label'); l.textContent = label + ': ';
        const inp = document.createElement('input'); inp.type='range'; inp.min=min; inp.max=max;
        inp.step = step || 1; inp.value = settings[key];
        const vl = document.createElement('span');
        vl.textContent = (key === 'opacity' ? Math.round(settings[key]*100) : settings[key]) + sfx;
        l.appendChild(inp); l.appendChild(vl); g.appendChild(l); modeBlock.appendChild(g);
        inp.addEventListener('input', function() {
            settings[key] = parseFloat(inp.value);
            vl.textContent = (key === 'opacity' ? Math.round(settings[key]*100) : settings[key]) + sfx;
            localStorage.setItem(STORAGE[key], settings[key]);
            renderDesktop();
        });
    }
    function buildModeControls() {
        modeBlock.innerHTML = '';
        if (settings.viewMode === 'window') {
            mkR('Ширина превью', 'tileWidth', 80, 300, 'px');
            mkR('Высота превью', 'tileHeight', 50, 300, 'px');
        } else if (settings.viewMode === 'glass') {
            var cg = document.createElement('div'); cg.className = 'form-group'; cg.innerHTML = '<label>Колонок в ряду </label>';
            var ci = document.createElement('input'); ci.type='number'; ci.min=2; ci.max=12; ci.value=settings.glassCols; ci.style.width='50px';
            cg.querySelector('label').appendChild(ci); modeBlock.appendChild(cg);
            ci.addEventListener('input', function() { settings.glassCols=parseInt(ci.value)||4; localStorage.setItem(STORAGE.glassCols,settings.glassCols); renderDesktop(); });
            mkR('Ширина плиток','glassTileWidth',50,300,'px'); mkR('Высота плиток','glassTileHeight',50,300,'px'); mkR('Прозрачность','opacity',0.1,1,'%',0.05);
            var sBgG=document.createElement('div'); sBgG.className='form-group';
            var sBgChk=document.createElement('input'); sBgChk.type='checkbox'; sBgChk.checked=settings.glassScreenshotBg;
            var sBgLbl=document.createElement('label'); sBgLbl.style.cursor='pointer';
            sBgLbl.appendChild(sBgChk); sBgLbl.append(' Скриншот как фон плитки'); sBgG.appendChild(sBgLbl); modeBlock.appendChild(sBgG);
            sBgChk.addEventListener('change',function(){settings.glassScreenshotBg=sBgChk.checked;localStorage.setItem('edge_glass_screenshot_bg',settings.glassScreenshotBg);renderDesktop();});
        } else if (settings.viewMode === 'icon') {
            mkR('Размер иконок','iconSize',40,120,'px');
        }
    }
    buildModeControls();
    vs.addEventListener('change', function() { settings.viewMode=vs.value; localStorage.setItem(STORAGE.viewMode,vs.value); buildModeControls(); renderDesktop(); });

    // --- Tab: Рабочий стол ---
    const dP = tabPanels['desktop'];
    const bgBtns = document.createElement('div'); bgBtns.style.cssText='display:flex;gap:6px;flex-wrap:wrap;margin-top:4px;';
    const setBgBtn = document.createElement('button'); setBgBtn.className='xp-dialog-btn'; setBgBtn.textContent='Выбрать фон...';
    const resetBgBtn = document.createElement('button'); resetBgBtn.className='xp-dialog-btn'; resetBgBtn.textContent='По умолчанию';
    bgBtns.appendChild(setBgBtn); bgBtns.appendChild(resetBgBtn); dP.appendChild(bgBtns);
    const ugD=document.createElement('div'); ugD.className='form-group'; ugD.style.marginTop='10px'; ugD.innerHTML='<label>Имя пользователя: </label>';
    const uI=document.createElement('input'); uI.type='text'; uI.value=username; uI.style.width='120px';
    ugD.querySelector('label').appendChild(uI); dP.appendChild(ugD);
    setBgBtn.addEventListener('click',function(){document.getElementById('bg-upload').click();});
    resetBgBtn.addEventListener('click',function(){localStorage.removeItem(STORAGE.bg);applyBackground();});
    uI.addEventListener('change',function(){username=uI.value.trim()||'User';localStorage.setItem(STORAGE.username,username);const s=document.querySelector('.sm-username');if(s)s.textContent=username;});

    // --- Tab: Заставка ---
    const sP = tabPanels['screensaver'];
    const ssEnabled = localStorage.getItem('edge_ss_enabled') !== 'false';
    const ssDelay   = parseInt(localStorage.getItem('edge_ss_delay') || '5');
    const ssChkG = document.createElement('div'); ssChkG.className='form-group';
    const ssChk = document.createElement('input'); ssChk.type='checkbox'; ssChk.checked=ssEnabled;
    const ssChkLbl = document.createElement('label'); ssChkLbl.style.cursor='pointer';
    ssChkLbl.appendChild(ssChk); ssChkLbl.append(' Включить заставку (трубы)');
    ssChkG.appendChild(ssChkLbl); sP.appendChild(ssChkG);
    const ssDelayG = document.createElement('div'); ssDelayG.className='form-group';
    ssDelayG.innerHTML='<label>Задержка: </label>';
    const ssDelayInp = document.createElement('input'); ssDelayInp.type='range'; ssDelayInp.min=1; ssDelayInp.max=30; ssDelayInp.value=ssDelay;
    const ssDelayLbl = document.createElement('span'); ssDelayLbl.textContent=ssDelay+' мин';
    ssDelayG.querySelector('label').appendChild(ssDelayInp); ssDelayG.querySelector('label').appendChild(ssDelayLbl); sP.appendChild(ssDelayG);
    const ssPrevBtn = document.createElement('button'); ssPrevBtn.className='xp-dialog-btn'; ssPrevBtn.textContent='Просмотр'; ssPrevBtn.style.marginTop='6px'; sP.appendChild(ssPrevBtn);
    ssChk.addEventListener('change',function(){localStorage.setItem('edge_ss_enabled',ssChk.checked);resetScreensaver();});
    ssDelayInp.addEventListener('input',function(){const v=parseInt(ssDelayInp.value);ssDelayLbl.textContent=v+' мин';localStorage.setItem('edge_ss_delay',v);resetScreensaver();});
    ssPrevBtn.addEventListener('click',function(){wmClose('settings');startScreensaver();});

    // --- Tab: Параметры ---
    const parP = tabPanels['params'];
    parP.innerHTML = '<div style="color:#666;font-size:11px;">Параметры режима отображения доступны во вкладке «Тема».</div>';
    const clRow = document.createElement('div'); clRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-top:10px;';
    const clChk = document.createElement('input'); clChk.type = 'checkbox'; clChk.id = 'settings-clippy-chk';
    clChk.checked = _clippyEnabled;
    clChk.addEventListener('change', function(){
        _clippyEnabled = clChk.checked;
        localStorage.setItem('edge_clippy_enabled', _clippyEnabled ? 'true' : 'false');
        const existWrap = document.getElementById('clippy-wrap');
        if (_clippyEnabled && !existWrap) { clippyInit(); }
        else if (!_clippyEnabled && existWrap) {
            clearTimeout(_clippyIdleTimer); clearTimeout(_clippyBlinkTimer);
            clearTimeout(_clippyLookTimer); clearTimeout(_clippyAnimTimer);
            existWrap.remove();
        }
    });
    const clLbl = document.createElement('label'); clLbl.htmlFor = 'settings-clippy-chk';
    clLbl.textContent = 'Показывать помощника Скрепку';
    clLbl.style.cssText = 'font-family:Tahoma,sans-serif;font-size:11px;cursor:pointer;';
    clRow.appendChild(clChk); clRow.appendChild(clLbl); parP.appendChild(clRow);

    wmCreate('settings', 'Свойства: Экран', c, 400, 340, '\u2699\uFE0F');
}

// ==================== RECYCLE BIN ====================
function openRecycleBin() {
    if (wmWindows['recycle']) { wmRestore('recycle'); wmFocus('recycle'); return; }
    const c=document.createElement('div'); c.className='recycle-window';
    function rend(){
        c.innerHTML=''; if(!trashedLinks.length){c.innerHTML='<div class="empty-bin">Корзина пуста</div>';return;}
        trashedLinks.forEach(function(item,i){
            const row=document.createElement('div'); row.className='recycle-item';
            row.innerHTML='<span class="recycle-name">'+escapeHtml(item.name)+'</span><span class="recycle-date">'+(item.deletedAt?new Date(item.deletedAt).toLocaleString('ru-RU'):'')+'</span>';
            const rb=document.createElement('button'); rb.className='xp-dialog-btn'; rb.textContent='Восстановить';
            rb.addEventListener('click',function(){const r=trashedLinks.splice(i,1)[0];delete r.deletedAt;links.push(r);localStorage.setItem(STORAGE.trash,JSON.stringify(trashedLinks));saveAndRender();rend();});
            const db=document.createElement('button'); db.className='xp-dialog-btn'; db.textContent='Удалить';
            db.addEventListener('click',function(){trashedLinks.splice(i,1);localStorage.setItem(STORAGE.trash,JSON.stringify(trashedLinks));rend();});
            row.appendChild(rb); row.appendChild(db); c.appendChild(row);
        });
        const cb=document.createElement('button'); cb.className='xp-dialog-btn'; cb.style.cssText='margin:8px;display:block'; cb.textContent='Очистить корзину';
        cb.addEventListener('click',function(){trashedLinks=[];localStorage.setItem(STORAGE.trash,JSON.stringify(trashedLinks));rend();});
        c.appendChild(cb);
    }
    rend(); wmCreate('recycle','Корзина',c,520,340,'\uD83D\uDDD1\uFE0F');
}

// ==================== SYSTEM INFO ====================
function openSystemInfo() {
    if (wmWindows['sysinfo']) { wmRestore('sysinfo'); wmFocus('sysinfo'); return; }
    const up=Math.floor((Date.now()-pageLoadTime)/1000);
    const c=document.createElement('div'); c.className='sysinfo-window';
    c.innerHTML='<div class="sysinfo-logo">\uD83E\uDE9F</div><div class="sysinfo-title">Microsoft Windows XP</div><div class="sysinfo-edition">Professional, Version 2002</div><hr class="sysinfo-hr">'+
        '<div class="sysinfo-row"><b>Браузер:</b> '+escapeHtml(navigator.userAgent.substring(0,100))+'</div>'+
        '<div class="sysinfo-row"><b>Разрешение:</b> '+screen.width+'\xD7'+screen.height+'</div>'+
        '<div class="sysinfo-row"><b>Окно:</b> '+window.innerWidth+'\xD7'+window.innerHeight+'</div>'+
        '<div class="sysinfo-row"><b>Аптайм страницы:</b> '+Math.floor(up/3600)+'ч '+Math.floor((up%3600)/60)+'м '+(up%60)+'с</div>'+
        '<div class="sysinfo-row"><b>Ярлыков:</b> '+links.length+'</div>';
    wmCreate('sysinfo','Свойства системы',c,430,290,'\uD83D\uDCBB');
}

// ==================== SHUTDOWN ====================
function openShutdownDialog() {
    wmClose('shutdown');
    const c=document.createElement('div'); c.className='shutdown-dialog';
    c.innerHTML='<div style="font-size:24px">\uD83E\uDE9F</div><div class="shutdown-text"><b>Завершение работы Windows</b><p>Выберите действие:</p><select id="shutdown-select"><option value="close">Закрыть вкладку</option><option value="reload">Перезагрузить страницу</option></select></div><div class="dialog-btns"><button id="shutdown-ok" class="xp-dialog-btn xp-dialog-btn-primary">OK</button><button id="shutdown-cancel" class="xp-dialog-btn">Отмена</button></div>';
    wmCreate('shutdown','Завершение работы Windows',c,320,200,'\u23FB');
    setTimeout(function(){
        document.getElementById('shutdown-ok').addEventListener('click',function(){const v=document.getElementById('shutdown-select').value;if(v==='close')window.close();else location.reload();});
        document.getElementById('shutdown-cancel').addEventListener('click',function(){wmClose('shutdown');});
    },0);
}

// ==================== NOTEPAD ====================
function openNotepad() {
    if (wmWindows['notepad']) { wmRestore('notepad'); wmFocus('notepad'); return; }
    const saved=localStorage.getItem(STORAGE.notepad)||'';
    const c=document.createElement('div'); c.className='notepad-window';
    const mb=document.createElement('div'); mb.className='notepad-menubar';
    const fb=document.createElement('div'); fb.className='notepad-menu-item'; fb.textContent='Файл';
    const fm=document.createElement('div'); fm.className='notepad-dropdown hidden'; fm.style.position='absolute';
    [['Новый',0],['Сохранить',1],['Открыть сохранённое',2]].forEach(function(p){const a=document.createElement('div');a.className='notepad-menu-action';a.textContent=p[0];a.dataset.action=p[1];fm.appendChild(a);});
    mb.appendChild(fb); mb.appendChild(fm);
    const ta=document.createElement('textarea'); ta.className='notepad-textarea'; ta.value=saved; ta.spellcheck=false;
    const sb=document.createElement('div'); sb.className='notepad-statusbar'; sb.textContent='Строка: 1 | Столбец: 1';
    c.appendChild(mb); c.appendChild(ta); c.appendChild(sb);
    wmCreate('notepad','Блокнот',c,560,400,'\uD83D\uDCDD');
    ta.addEventListener('keyup',function(){const b=ta.value.substr(0,ta.selectionStart).split('\n');sb.textContent='Строка: '+b.length+' | Столбец: '+(b[b.length-1].length+1);});
    fb.addEventListener('click',function(e){e.stopPropagation();fm.classList.toggle('hidden');});
    fm.addEventListener('click',function(e){const a=e.target.closest('.notepad-menu-action');if(!a)return;fm.classList.add('hidden');const act=parseInt(a.dataset.action);if(act===0)ta.value='';else if(act===1)localStorage.setItem(STORAGE.notepad,ta.value);else ta.value=localStorage.getItem(STORAGE.notepad)||'';});
    document.addEventListener('click',function handler(e){if(!wmWindows['notepad']){document.removeEventListener('click',handler);return;}if(!fm.contains(e.target)&&e.target!==fb)fm.classList.add('hidden');});
}

// ==================== CALCULATOR ====================
function openCalculator() {
    if (wmWindows['calculator']) { wmRestore('calculator'); wmFocus('calculator'); return; }
    const c=document.createElement('div'); c.className='calc-window';
    c.innerHTML='<div class="calc-display"><input type="text" id="calc-screen" value="0" readonly></div><div class="calc-buttons">'+
        '<button class="calc-btn calc-fn" data-fn="mc">MC</button><button class="calc-btn calc-fn" data-fn="mr">MR</button><button class="calc-btn calc-fn" data-fn="ms">MS</button><button class="calc-btn calc-fn" data-fn="m+">M+</button>'+
        '<button class="calc-btn calc-fn" data-fn="back">&#9003;</button><button class="calc-btn calc-fn" data-fn="ce">CE</button><button class="calc-btn calc-fn" data-fn="c">C</button><button class="calc-btn calc-op" data-op="/">&#247;</button>'+
        '<button class="calc-btn" data-d="7">7</button><button class="calc-btn" data-d="8">8</button><button class="calc-btn" data-d="9">9</button><button class="calc-btn calc-op" data-op="*">&#215;</button>'+
        '<button class="calc-btn" data-d="4">4</button><button class="calc-btn" data-d="5">5</button><button class="calc-btn" data-d="6">6</button><button class="calc-btn calc-op" data-op="-">&#8722;</button>'+
        '<button class="calc-btn" data-d="1">1</button><button class="calc-btn" data-d="2">2</button><button class="calc-btn" data-d="3">3</button><button class="calc-btn calc-op" data-op="+" style="grid-row:span 2">+</button>'+
        '<button class="calc-btn calc-wide" data-d="0">0</button><button class="calc-btn" data-fn="dot">.</button><button class="calc-btn calc-eq" data-fn="eq">=</button></div>';
    wmCreate('calculator','Калькулятор',c,260,300,'\uD83D\uDD22');
    let cs={disp:'0',prev:null,op:null,waitOp:false,mem:0};
    function fmt(n){const s=String(parseFloat(n.toFixed(10)));return s.length>14?n.toExponential(6):s;}
    function calc(a,b,op){if(op==='+')return a+b;if(op==='-')return a-b;if(op==='*')return a*b;if(op==='/')return b!==0?a/b:0;return b;}
    function upd(){const s=document.getElementById('calc-screen');if(s)s.value=cs.disp;}
    setTimeout(function(){
        const cb=document.querySelector('#win-calculator .calc-buttons');if(!cb)return;
        cb.addEventListener('click',function(e){
            const btn=e.target.closest('.calc-btn');if(!btn)return;
            if(btn.dataset.d!==undefined){if(cs.waitOp){cs.disp=btn.dataset.d;cs.waitOp=false;}else cs.disp=cs.disp==='0'?btn.dataset.d:cs.disp+btn.dataset.d;if(cs.disp.length>14)cs.disp=cs.disp.slice(0,14);}
            else if(btn.dataset.op){const v=parseFloat(cs.disp);if(cs.op&&!cs.waitOp){const r=calc(cs.prev,v,cs.op);cs.disp=fmt(r);cs.prev=r;}else cs.prev=v;cs.op=btn.dataset.op;cs.waitOp=true;}
            else if(btn.dataset.fn){const v=parseFloat(cs.disp);switch(btn.dataset.fn){case 'dot':if(!cs.disp.includes('.'))cs.disp+='.';break;case 'eq':if(cs.op&&!cs.waitOp){cs.disp=fmt(calc(cs.prev,v,cs.op));cs.op=null;cs.prev=null;cs.waitOp=false;}break;case 'c':cs={disp:'0',prev:null,op:null,waitOp:false,mem:cs.mem};break;case 'ce':cs.disp='0';break;case 'back':cs.disp=cs.disp.length>1?cs.disp.slice(0,-1):'0';break;case 'ms':cs.mem=v;break;case 'mr':cs.disp=fmt(cs.mem);break;case 'mc':cs.mem=0;break;case 'm+':cs.mem+=v;break;}}
            upd();
        });
    },0);
}

// ==================== MINESWEEPER ====================
function openMinesweeper() {
    if (wmWindows['minesweeper']) { wmRestore('minesweeper'); wmFocus('minesweeper'); return; }

    const DIFFS = [
        { label: 'Начинающий', R: 9,  C: 9,  M: 10 },
        { label: 'Средний',    R: 16, C: 16, M: 40 },
        { label: 'Эксперт',   R: 16, C: 30, M: 99 },
    ];
    let di = 0;
    let board, rev, flag, over, won, tint, secs, first;

    const c = document.createElement('div');
    c.className = 'mines-window';
    wmCreate('minesweeper', 'Сапёр', c, 250, 370, '\uD83D\uDCA3');

    function getD() { return DIFFS[di]; }

    function setCounter(n) { const e = c.querySelector('#mines-counter'); if(e) e.textContent = String(Math.max(0,n)).padStart(3,'0'); }
    function setTimer(n)   { const e = c.querySelector('#mines-timer');   if(e) e.textContent = String(Math.min(999,n)).padStart(3,'0'); }

    function nb(r, cc, R, C, fn) {
        for (let dr=-1;dr<=1;dr++) for (let dc=-1;dc<=1;dc++) {
            if (!dr && !dc) continue;
            const nr=r+dr, nc=cc+dc;
            if (nr>=0 && nr<R && nc>=0 && nc<C) fn(nr, nc);
        }
    }

    function place(ar, ac, R, C, M) {
        let p=0;
        while(p<M) {
            const r=Math.floor(Math.random()*R), cc=Math.floor(Math.random()*C);
            if (board[r][cc]!==-1 && !(r===ar && cc===ac)) { board[r][cc]=-1; p++; }
        }
        for (let r=0;r<R;r++) for (let cc=0;cc<C;cc++) {
            if (board[r][cc]===-1) continue;
            let n=0; nb(r,cc,R,C,function(nr,nc){if(board[nr][nc]===-1)n++;});
            board[r][cc]=n;
        }
    }

    function reveal(r, cc, R, C) {
        if (rev[r][cc] || flag[r][cc]) return;
        rev[r][cc]=true;
        if (board[r][cc]===0) nb(r,cc,R,C,function(nr,nc){reveal(nr,nc,R,C);});
    }

    function countFlags() { let f=0; flag.forEach(function(row){row.forEach(function(v){if(v)f++;})}); return f; }

    function checkWin(R, C) {
        for (let r=0;r<R;r++) for (let cc=0;cc<C;cc++) if (board[r][cc]!==-1 && !rev[r][cc]) return false;
        return true;
    }

    function rend(R, C) {
        const g = c.querySelector('#mines-grid'); if(!g) return;
        g.innerHTML = '';
        for (let r=0;r<R;r++) for (let cc=0;cc<C;cc++) {
            const el=document.createElement('div'); el.className='mines-cell'; el.dataset.r=r; el.dataset.c=cc;
            if (rev[r][cc]) {
                el.classList.add('revealed');
                if (board[r][cc]===-1) { el.classList.add('mine'); el.textContent='\uD83D\uDCA3'; }
                else if (board[r][cc]>0) { el.textContent=board[r][cc]; el.classList.add('num-'+board[r][cc]); }
            } else if (flag[r][cc]) { el.classList.add('flagged'); el.textContent='\uD83D\uDEA9'; }
            g.appendChild(el);
        }
    }

    function start() {
        const { R, C, M } = getD();
        clearInterval(tint); secs=0; over=false; won=false; first=true;
        board = Array.from({length:R},function(){return Array(C).fill(0);});
        rev   = Array.from({length:R},function(){return Array(C).fill(false);});
        flag  = Array.from({length:R},function(){return Array(C).fill(false);});
        setCounter(M); setTimer(0);
        const sm = c.querySelector('#mines-smiley'); if(sm) sm.textContent='\uD83D\uDE42';
        rend(R, C);
    }

    function buildUI() {
        const { R, C, M } = getD();
        const CS = 22; // cell size px
        const gridW = C * CS + 6;
        const winW = Math.max(240, gridW + 20);
        const winH = 44 + 52 + R * CS + 20; // diff bar + header + grid + padding
        const w = wmWindows['minesweeper'];
        if (w) { w.el.style.width = winW + 'px'; w.el.style.height = winH + 'px'; }

        c.innerHTML =
            '<div class="mines-diff-bar">' +
            DIFFS.map(function(d,i){ return '<button class="mines-diff-btn'+(i===di?' active':'')+'" data-di="'+i+'">'+d.label+'</button>'; }).join('') +
            '</div>' +
            '<div class="mines-header">' +
            '<div id="mines-counter" class="mines-lcd">'+String(M).padStart(3,'0')+'</div>' +
            '<button id="mines-smiley" class="mines-smiley">\uD83D\uDE42</button>' +
            '<div id="mines-timer" class="mines-lcd">000</div>' +
            '</div>' +
            '<div class="mines-grid-wrap">' +
            '<div id="mines-grid" class="mines-grid" style="grid-template-columns:repeat('+C+','+CS+'px)"></div>' +
            '</div>';

        c.querySelectorAll('.mines-diff-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                di = parseInt(btn.dataset.di);
                buildUI();
                start();
            });
        });

        c.querySelector('#mines-smiley').addEventListener('click', function() { buildUI(); start(); });

        const grid = c.querySelector('#mines-grid');

        grid.addEventListener('click', function(e) {
            const el = e.target.closest('.mines-cell'); if(!el||over||won) return;
            const r=parseInt(el.dataset.r), cc=parseInt(el.dataset.c);
            if (flag[r][cc] || rev[r][cc]) return;
            if (first) { first=false; place(r,cc,R,C,M); tint=setInterval(function(){secs++;setTimer(secs);},1000); }
            if (board[r][cc]===-1) {
                over=true; rev[r][cc]=true; clearInterval(tint);
                for(let rr=0;rr<R;rr++) for(let ccc=0;ccc<C;ccc++) if(board[rr][ccc]===-1) rev[rr][ccc]=true;
                rend(R,C); const sm=c.querySelector('#mines-smiley'); if(sm)sm.textContent='\uD83D\uDE35';
                minesweeperLosses++;
                setTimeout(function(){ if (typeof clippySay === 'function') clippySay(CLIPPY_MSGS.react_minesweeper_loss, 'sad'); }, 500);
                if (minesweeperLosses >= 3) { setTimeout(triggerBSOD, 1500); }
                return;
            }
            reveal(r,cc,R,C); rend(R,C);
            if (checkWin(R,C)) { won=true; clearInterval(tint); minesweeperLosses=0; const sm=c.querySelector('#mines-smiley'); if(sm)sm.textContent='\uD83D\uDE0E'; setTimeout(function(){ if (typeof clippySay === 'function') clippySay(CLIPPY_MSGS.react_minesweeper_win, 'excited'); }, 500); }
        });

        // Right-click: flag (prevent browser context menu)
        grid.addEventListener('contextmenu', function(e) {
            e.preventDefault(); e.stopPropagation();
            const el = e.target.closest('.mines-cell'); if(!el||over||won) return;
            const r=parseInt(el.dataset.r), cc=parseInt(el.dataset.c);
            if (rev[r][cc]) return;
            flag[r][cc] = !flag[r][cc];
            setCounter(M - countFlags());
            rend(R, C);
        });

        // Middle-click: chord (reveal neighbors if flag count matches number)
        grid.addEventListener('mousedown', function(e) {
            if (e.button !== 1) return;
            e.preventDefault();
            const el = e.target.closest('.mines-cell'); if(!el||over||won) return;
            const r=parseInt(el.dataset.r), cc=parseInt(el.dataset.c);
            if (!rev[r][cc] || board[r][cc] <= 0) return;
            let adjFlags = 0;
            nb(r, cc, R, C, function(nr,nc){ if(flag[nr][nc]) adjFlags++; });
            if (adjFlags !== board[r][cc]) return;
            let boom = false;
            nb(r, cc, R, C, function(nr,nc) {
                if (!rev[nr][nc] && !flag[nr][nc]) {
                    if (board[nr][nc]===-1) { boom=true; rev[nr][nc]=true; }
                    else reveal(nr, nc, R, C);
                }
            });
            if (boom) {
                over=true; clearInterval(tint);
                for(let rr=0;rr<R;rr++) for(let ccc=0;ccc<C;ccc++) if(board[rr][ccc]===-1) rev[rr][ccc]=true;
                const sm=c.querySelector('#mines-smiley'); if(sm)sm.textContent='\uD83D\uDE35';
                minesweeperLosses++;
                setTimeout(function(){ if (typeof clippySay === 'function') clippySay(CLIPPY_MSGS.react_minesweeper_loss, 'sad'); }, 500);
                if (minesweeperLosses >= 3) { setTimeout(triggerBSOD, 1500); }
            } else if (checkWin(R,C)) {
                won=true; clearInterval(tint); minesweeperLosses=0;
                const sm=c.querySelector('#mines-smiley'); if(sm)sm.textContent='\uD83D\uDE0E';
                setTimeout(function(){ if (typeof clippySay === 'function') clippySay(CLIPPY_MSGS.react_minesweeper_win, 'excited'); }, 500);
            }
            rend(R, C);
        });

        start();
    }

    setTimeout(function() { buildUI(); }, 0);
}

// ==================== PINBALL (SPACE CADET) ====================
function openPinball() {
    if (wmWindows['pinball']) { wmRestore('pinball'); wmFocus('pinball'); return; }
    const c = document.createElement('div');
    c.className = 'pinball-window';
    c.innerHTML =
        '<div class="pb-canvas-wrap"><canvas id="pb-cv" style="cursor:none"></canvas></div>' +
        '<div class="pinball-hud">' +
            '<div class="pb-hud-item"><div class="pb-hud-lbl">СЧЁТ</div><div id="pb-score">0</div></div>' +
            '<div id="pb-msg">Пробел — запуск</div>' +
            '<div class="pb-hud-item" style="display:flex;align-items:center;gap:3px;">' +
                '<button id="pb-spd-d" class="xp-dialog-btn" style="padding:1px 5px;font-size:11px;">−</button>' +
                '<span id="pb-spd-v" style="font-size:10px;min-width:60px;text-align:center;">Скорость 2</span>' +
                '<button id="pb-spd-u" class="xp-dialog-btn" style="padding:1px 5px;font-size:11px;">+</button>' +
            '</div>' +
            '<div class="pb-hud-item"><button id="pb-restart" class="xp-dialog-btn" style="padding:2px 6px; font-size:10px;">Рестарт</button></div>' +
            '<div class="pb-hud-item"><div class="pb-hud-lbl">МЯЧИ</div><div id="pb-balls">●●●</div></div>' +
        '</div>';
    wmCreate('pinball', 'Space Cadet Pinball', c, 380, 590, '⚪');

    setTimeout(function() {
        document.getElementById('pb-restart')?.addEventListener('click', function() {
            score = 0; ballsLeft = 3; mult = 1; gameOver = false; resetBall();
            tgA.forEach(function(t) { t.hit = false; });
            tgB.forEach(function(t) { t.hit = false; });
            rollovers.forEach(function(r) { r.lit = false; });
            updateHUD();
        });
        document.getElementById('pb-spd-d')?.addEventListener('click', function() {
            if (spdIdx > 0) { spdIdx--; SPDFAC = SPD_LEVELS[spdIdx]; }
            const sv = document.getElementById('pb-spd-v');
            if (sv) sv.textContent = 'Скорость ' + (spdIdx + 1);
        });
        document.getElementById('pb-spd-u')?.addEventListener('click', function() {
            if (spdIdx < SPD_LEVELS.length - 1) { spdIdx++; SPDFAC = SPD_LEVELS[spdIdx]; }
            const sv = document.getElementById('pb-spd-v');
            if (sv) sv.textContent = 'Скорость ' + (spdIdx + 1);
        });
        const cv = document.getElementById('pb-cv');
        if (!cv) return;
        const ctx = cv.getContext('2d');

        // ── Virtual table dimensions ──
        const VW=320, VH=480, BR=8;
        const WL=26, WR=254;
        const LANE_L=254, LANE_R=294;
        const LCX=(LANE_L+LANE_R)/2; // lane center x
        let scale=1;

        function resizeCanvas() {
            const wrap=cv.parentElement; if(!wrap) return;
            scale=Math.max(0.4,Math.min(wrap.clientWidth/VW,(wrap.clientHeight-2)/VH,3));
            cv.width=Math.round(VW*scale); cv.height=Math.round(VH*scale);
        }
        resizeCanvas();
        if(window.ResizeObserver){const ro=new ResizeObserver(resizeCanvas);ro.observe(cv.parentElement);}

        // ── Table layout ──
        const flippers=[
            {x:84, y:442,len:56,ang:0.42,           openAng:-0.52,          side:1, open:false,curAng:0.42,          dAng:0},
            {x:216,y:442,len:56,ang:Math.PI-0.42,   openAng:Math.PI+0.52,   side:-1,open:false,curAng:Math.PI-0.42,  dAng:0},
        ];
        const bumpers=[
            // top arch
            {x:130,y:90, r:19,pts:150,lit:0,col:'#ff1744'},
            {x:165,y:72, r:22,pts:200,lit:0,col:'#d500f9'},
            {x:200,y:90, r:19,pts:150,lit:0,col:'#ff1744'},
            // mid sides
            {x:86, y:152,r:15,pts:100,lit:0,col:'#ff6d00'},
            {x:244,y:152,r:15,pts:100,lit:0,col:'#ff6d00'},
            // center
            {x:165,y:172,r:18,pts:175,lit:0,col:'#00e5ff'},
            // lower cluster
            {x:108,y:238,r:14,pts:75, lit:0,col:'#76ff03'},
            {x:165,y:222,r:16,pts:125,lit:0,col:'#ffea00'},
            {x:222,y:238,r:14,pts:75, lit:0,col:'#76ff03'},
            // outer top corners
            {x:52, y:66, r:11,pts:50, lit:0,col:'#40c4ff'},
            {x:240,y:58, r:11,pts:50, lit:0,col:'#40c4ff'},
        ];
        const slings=[
            {ax:WL, ay:292,bx:74, by:366,lit:0,kick:1 },
            {ax:WR, ay:292,bx:214,by:366,lit:0,kick:-1},
        ];
        // Gutter guides (visual + physical — walls leading ball to flippers)
        const gutters=[
            {ax:WL, ay:358,bx:flippers[0].x-8,by:flippers[0].y},
            {ax:WR, ay:358,bx:flippers[1].x+8,by:flippers[1].y},
        ];
        const rollovers=[
            {x:62, y:44,r:7,lit:false,pts:1000,lbl:'1'},
            {x:103,y:36,r:7,lit:false,pts:1000,lbl:'2'},
            {x:150,y:32,r:7,lit:false,pts:1000,lbl:'3'},
            {x:197,y:36,r:7,lit:false,pts:1000,lbl:'4'},
        ];
        const TW=20,TH=10;
        let tgA=[86,110,134,158,182].map(function(x){return{x:x,y:278,hit:false};});
        let tgB=[98,122,146,170,194].map(function(x){return{x:x,y:310,hit:false};});
        // Spinner decoration (purely visual, rotates)
        let spinnerAngle=0;

        // ── Game state ──
        const SPD_LEVELS=[0.3,0.55,0.7,0.85,1.0];
        let spdIdx=1, SPDFAC=SPD_LEVELS[spdIdx];
        let ball={x:LCX,y:380-BR,vx:0,vy:0};
        let score=0,ballsLeft=3,gameOver=false,launched=false,inLane=false,dbg=false;
        let springCharge=0,charging=false,leftDown=false,rightDown=false,mult=1,frameN=0;

        // ── Helpers ──
        function psd(px,py,ax,ay,bx,by){
            const dx=bx-ax,dy=by-ay,l2=dx*dx+dy*dy;
            const t=l2?Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/l2)):0;
            const cx=ax+t*dx,cy=ay+t*dy,ex=px-cx,ey=py-cy,d=Math.hypot(ex,ey)||0.001;
            return{dist:d,nx:ex/d,ny:ey/d,t:t};
        }
        function capSpeed(){const cap=15*SPDFAC;const s=Math.hypot(ball.vx,ball.vy);if(s>cap){ball.vx*=cap/s;ball.vy*=cap/s;}}
        function addPts(p){score+=p*mult;updateHUD();}
        function resetBall(){ball.x=LCX;ball.y=380-BR;ball.vx=0;ball.vy=0;launched=false;inLane=false;springCharge=0;charging=false;}
        function launch(){ball.vx=0;ball.vy=-(4+springCharge*10)*SPDFAC;launched=true;inLane=true;}
        function flipTip(f){return{x:f.x+Math.cos(f.curAng)*f.len,y:f.y+Math.sin(f.curAng)*f.len};}

        // ── Physics ──
        function update() {
            if (gameOver) return;
            frameN++; spinnerAngle += 0.04;

            slings.forEach(function(sl) { if (sl.lit > 0) sl.lit--; });
            bumpers.forEach(function(b) { if (b.lit > 0) b.lit--; });

            if (!launched) {
                if (charging) springCharge = Math.min(1, springCharge + 0.022);
                ball.x = LCX;
                ball.y = 380 + springCharge * 24 - BR;
                return;
            }

            // inLane: ball travels up launch lane guided by arc at top, no gravity
            if (inLane) {
                ball.vx *= 0.999; ball.vy *= 0.999;
                ball.y += ball.vy;
                if (ball.y > 78) {
                    ball.x = LCX; ball.vx = 0;
                } else if (ball.y > 30) {
                    // Arc: redirect velocity from up to left (cos→0 only reached at y=18, exit before that)
                    const t = (78 - ball.y) / 48; // 48 = 78-30, t goes 0→1 over y:78→30
                    const spd = Math.hypot(ball.vx, ball.vy);
                    const ang = t * (Math.PI * 0.42); // max ~75.6° — cos(75°)≈0.26, never reaches 0
                    ball.vx = -spd * Math.sin(ang);
                    ball.vy = -spd * Math.cos(ang);
                    ball.x = LCX + (LANE_L - BR - 6 - LCX) * Math.sin(ang);
                } else {
                    // Exit inLane — ball already has leftward velocity from arc, let it fly
                    inLane = false;
                    if (ball.vx >= 0) {
                        const spd = Math.hypot(ball.vx, ball.vy) || 5 * SPDFAC;
                        ball.vx = -spd; ball.vy = 0;
                    }
                }
                return;
            }

            // ── Animate flippers & compute angular velocity (once per frame) ──
            const FLIP_SPEED = 0.38; // rad/frame (~2-3 frames for full swing)
            flippers[0].open = leftDown;
            flippers[1].open = rightDown;
            flippers.forEach(function(f) {
                const prevAng = f.curAng;
                const target = f.open ? f.openAng : f.ang;
                const diff = target - f.curAng;
                f.curAng += Math.sign(diff) * Math.min(Math.abs(diff), FLIP_SPEED);
                f.dAng = f.curAng - prevAng; // positive = opening (counterclockwise left / clockwise right)
            });

            const STEPS = 10;
            for (let step = 0; step < STEPS; step++) {
                ball.vy += 0.12 / STEPS;
                ball.vx *= 0.9998; ball.vy *= 0.9998;
                ball.x += ball.vx / STEPS; ball.y += ball.vy / STEPS;

                if (ball.y - BR < 18) { ball.y = 18 + BR; ball.vy = Math.abs(ball.vy) * 0.55; }
                if (ball.x - BR < WL) { ball.x = WL + BR; ball.vx = Math.abs(ball.vx) * 0.65; }
                if (ball.x + BR > WR) { ball.x = WR - BR; ball.vx = -Math.abs(ball.vx) * 0.65; }

                slings.forEach(function(sl) {
                    const {dist, nx, ny} = psd(ball.x, ball.y, sl.ax, sl.ay, sl.bx, sl.by);
                    if (dist < BR + 4) {
                        ball.x += nx * (BR + 4 - dist); ball.y += ny * (BR + 4 - dist);
                        const dot = ball.vx * nx + ball.vy * ny;
                        if (dot < 0) {
                            ball.vx = ball.vx - 2 * dot * nx;
                            ball.vy = ball.vy - 2 * dot * ny - 4.5 * SPDFAC;
                            ball.vy = Math.min(ball.vy, -2 * SPDFAC);
                            // Sling always kicks toward playfield center — prevents wall-trap oscillation
                            ball.vx = sl.kick * Math.max(Math.abs(ball.vx) + 2.8 * SPDFAC, 4.5 * SPDFAC);
                        }
                        sl.lit = 14; addPts(35);
                    }
                });

                gutters.forEach(function(g) {
                    const {dist, nx, ny} = psd(ball.x, ball.y, g.ax, g.ay, g.bx, g.by);
                    if (dist < BR + 3) {
                        ball.x += nx * (BR + 3 - dist); ball.y += ny * (BR + 3 - dist);
                        const dot = ball.vx * nx + ball.vy * ny;
                        if (dot < 0) { ball.vx -= 2 * dot * nx * 0.6; ball.vy -= 2 * dot * ny * 0.6; }
                    }
                });

                bumpers.forEach(function(b) {
                    const dx = ball.x - b.x, dy = ball.y - b.y, d = Math.hypot(dx, dy);
                    if (d < b.r + BR) {
                        const nx = dx / d, ny = dy / d;
                        ball.x = b.x + nx * (b.r + BR + 0.5); ball.y = b.y + ny * (b.r + BR + 0.5);
                        const spd = Math.max(Math.hypot(ball.vx, ball.vy), 5.5 * SPDFAC);
                        ball.vx = nx * (spd + 2.5); ball.vy = ny * (spd + 2.5);
                        b.lit = 16; addPts(b.pts);
                    }
                });

                [tgA, tgB].forEach(function(row) {
                    row.forEach(function(t) {
                        if (t.hit) return;
                        const dx = Math.max(0, Math.abs(ball.x - (t.x + TW / 2)) - TW / 2);
                        const dy = Math.max(0, Math.abs(ball.y - (t.y + TH / 2)) - TH / 2);
                        if (Math.hypot(dx, dy) < BR) {
                            t.hit = true; ball.vy = -Math.abs(ball.vy) * 0.75; addPts(250);
                            if ([...tgA, ...tgB].every(function(tt) { return tt.hit; })) {
                                mult = Math.min(mult + 1, 5);
                                tgA.forEach(function(tt) { tt.hit = false; });
                                tgB.forEach(function(tt) { tt.hit = false; });
                                addPts(15000);
                            }
                        }
                    });
                });

                rollovers.forEach(function(rv) {
                    if (!rv.lit && Math.hypot(ball.x - rv.x, ball.y - rv.y) < BR + rv.r) {
                        rv.lit = true; addPts(rv.pts);
                        if (rollovers.every(function(r) { return r.lit; })) {
                            mult = Math.min(mult + 1, 5);
                            rollovers.forEach(function(r) { r.lit = false; });
                            addPts(25000);
                        }
                    }
                });

                flippers.forEach(function(f) {
                    const tip = flipTip(f);
                    const {dist, nx, ny, t} = psd(ball.x, ball.y, f.x, f.y, tip.x, tip.y);
                    if (dist < BR + 5) {
                        ball.x += nx * (BR + 5 - dist); ball.y += ny * (BR + 5 - dist);
                        // Contact point on flipper
                        const cx = f.x + t * (tip.x - f.x);
                        const cy = f.y + t * (tip.y - f.y);
                        // Flipper tip linear velocity (pixels/frame) from angular velocity
                        const flipVx = -f.dAng * (cy - f.y);
                        const flipVy =  f.dAng * (cx - f.x);
                        // Relative velocity of ball w.r.t. flipper surface
                        const relVx = ball.vx - flipVx;
                        const relVy = ball.vy - flipVy;
                        const dot = relVx * nx + relVy * ny;
                        if (dot < 0) {
                            const e = 0.72;
                            const j = -(1 + e) * dot;
                            ball.vx += j * nx;
                            ball.vy += j * ny;
                        }
                        ball.vy = Math.min(ball.vy, -0.3);
                    }
                });
                capSpeed();
            }

            // Ball caught by plunger: returned to lane (inLane backtrack or lane zone entry)
            if (ball.vy > 0 && ball.y + BR >= 380 &&
                (inLane || (ball.x > LANE_L - BR && ball.x < LANE_R + BR))) {
                ball.x = LCX; ball.y = 380 - BR; ball.vx = 0; ball.vy = 0;
                launched = false; inLane = false; springCharge = 0; charging = false;
            }

            if (ball.y > VH + 20) {
                ballsLeft--; updateHUD();
                if (ballsLeft <= 0) {
                    gameOver = true;
                    const m = document.getElementById('pb-msg');
                    if (m) m.textContent = 'ИГРА ОКОНЧЕНА — Пробел для рестарта';
                } else {
                    resetBall();
                }
            }
        }
        // ── Color helpers ──
        function hex2rgb(h){return[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];}
        function lighten(h,f){const[r,g,b]=hex2rgb(h);return'rgb('+(r+Math.round((255-r)*f))+','+(g+Math.round((255-g)*f))+','+(b+Math.round((255-b)*f))+')';}
        function darken(h,f){const[r,g,b]=hex2rgb(h);return'rgb('+Math.round(r*f)+','+Math.round(g*f)+','+Math.round(b*f)+')';}

        // ── Draw ──
        function draw(){
            ctx.save();
            ctx.scale(scale,scale);
            ctx.clearRect(0,0,VW,VH);

            // ── Background with depth gradient ──
            const bgG=ctx.createLinearGradient(0,0,0,VH);
            bgG.addColorStop(0,'#020110');bgG.addColorStop(0.45,'#08042a');bgG.addColorStop(1,'#0d0635');
            ctx.fillStyle=bgG;ctx.fillRect(0,0,VW,VH);

            // Perspective grid (converging lines toward top vanishing point)
            const VP={x:VW/2,y:-60}; // vanishing point above table
            ctx.strokeStyle='rgba(30,20,65,0.7)';ctx.lineWidth=0.5;
            for(let x=WL;x<=LANE_L;x+=20){
                ctx.beginPath();ctx.moveTo(x,VH);
                ctx.lineTo(VP.x+(x-VP.x)*0.5,VP.y+(VH-VP.y)*0.5);
                ctx.stroke();
            }
            for(let y=0;y<VH;y+=22){
                const f=1-(y-VP.y)/(VH-VP.y);
                const lx=VP.x+(WL-VP.x)*(1-f);const rx=VP.x+(LANE_L-VP.x)*(1-f);
                ctx.beginPath();ctx.moveTo(lx,y);ctx.lineTo(rx,y);ctx.stroke();
            }

            // ── Left wall (3D bevel) ──
            const lwG=ctx.createLinearGradient(0,0,WL,0);
            lwG.addColorStop(0,'#0a0638');lwG.addColorStop(0.6,'#16107a');lwG.addColorStop(1,'#2520b0');
            ctx.fillStyle=lwG;ctx.fillRect(0,0,WL,VH);
            ctx.strokeStyle='rgba(110,90,240,0.9)';ctx.lineWidth=2;
            ctx.beginPath();ctx.moveTo(WL,0);ctx.lineTo(WL,VH);ctx.stroke();
            ctx.strokeStyle='rgba(200,180,255,0.25)';ctx.lineWidth=1;
            ctx.beginPath();ctx.moveTo(WL-1,0);ctx.lineTo(WL-1,VH);ctx.stroke();

            // ── Right wall ──
            const rwG=ctx.createLinearGradient(WR,0,LANE_L,0);
            rwG.addColorStop(0,'#2520b0');rwG.addColorStop(0.4,'#16107a');rwG.addColorStop(1,'#0a0638');
            ctx.fillStyle=rwG;ctx.fillRect(WR,0,LANE_L-WR,VH);
            ctx.strokeStyle='rgba(110,90,240,0.9)';ctx.lineWidth=2;
            ctx.beginPath();ctx.moveTo(WR,0);ctx.lineTo(WR,VH);ctx.stroke();

            // ── Launch lane ──
            const laG=ctx.createLinearGradient(LANE_L,0,LANE_R,0);
            laG.addColorStop(0,'#08052a');laG.addColorStop(1,'#04021a');
            ctx.fillStyle=laG;ctx.fillRect(LANE_L,0,LANE_R-LANE_L,VH);
            ctx.strokeStyle='rgba(55,45,150,0.8)';ctx.lineWidth=1.5;
            ctx.beginPath();ctx.moveTo(LANE_L,0);ctx.lineTo(LANE_L,VH);ctx.stroke();
            ctx.strokeStyle='rgba(40,30,100,0.5)';ctx.lineWidth=1;
            ctx.beginPath();ctx.moveTo(LANE_R,0);ctx.lineTo(LANE_R,VH);ctx.stroke();

            // Curved guide arc — connects lane top to playfield
            ctx.strokeStyle='rgba(80,60,200,0.75)';ctx.lineWidth=2;
            ctx.beginPath();ctx.moveTo(LANE_R,85);ctx.bezierCurveTo(LANE_R,20,255,16,210,16);ctx.stroke();
            ctx.strokeStyle='rgba(55,40,150,0.55)';ctx.lineWidth=1.5;
            ctx.beginPath();ctx.moveTo(LANE_L,85);ctx.bezierCurveTo(LANE_L,26,238,16,188,16);ctx.stroke();

            // Lane speed-lights (animated)
            for(let ly=36;ly<VH-50;ly+=26){
                const on=(frameN+ly)%38<7;
                ctx.fillStyle=on?'rgba(90,70,210,0.95)':'rgba(35,25,75,0.55)';
                ctx.beginPath();ctx.arc(LANE_L+4,ly,2.5,0,Math.PI*2);ctx.fill();
                ctx.beginPath();ctx.arc(LANE_R-4,ly,2.5,0,Math.PI*2);ctx.fill();
            }

            // Wall accent lights
            for(let wy=16;wy<VH-36;wy+=30){
                const on2=Math.floor(frameN/22)%5===Math.floor(wy/30)%5;
                ctx.fillStyle=on2?'rgba(140,100,255,0.9)':'rgba(45,30,95,0.5)';
                ctx.beginPath();ctx.arc(WL+4,wy,2,0,Math.PI*2);ctx.fill();
                ctx.beginPath();ctx.arc(WR-4,wy,2,0,Math.PI*2);ctx.fill();
            }

            // ── Top decorative arcs ──
            ctx.strokeStyle='rgba(70,50,190,0.5)';ctx.lineWidth=1.5;
            ctx.beginPath();ctx.arc(VW/2,-10,225,0.08,Math.PI-0.08);ctx.stroke();
            ctx.strokeStyle='rgba(110,80,255,0.25)';ctx.lineWidth=1;
            ctx.beginPath();ctx.arc(VW/2,-10,205,0.12,Math.PI-0.12);ctx.stroke();

            // ── Drain ──
            ctx.fillStyle='rgba(0,0,0,0.88)';
            ctx.beginPath();
            ctx.moveTo(flippers[0].x-2,flippers[0].y+8);ctx.lineTo(flippers[1].x+2,flippers[1].y+8);
            ctx.lineTo(flippers[1].x+2,VH);ctx.lineTo(flippers[0].x-2,VH);ctx.closePath();ctx.fill();

            // ── Gutter guides ──
            ctx.lineCap='round';
            [[WL,358,flippers[0].x-8,flippers[0].y],[WR,358,flippers[1].x+8,flippers[1].y]].forEach(function(g){
                ctx.strokeStyle='#10228a';ctx.lineWidth=7;
                ctx.beginPath();ctx.moveTo(g[0],g[1]);ctx.lineTo(g[2],g[3]);ctx.stroke();
                ctx.strokeStyle='#3858d8';ctx.lineWidth=3.5;
                ctx.beginPath();ctx.moveTo(g[0],g[1]);ctx.lineTo(g[2],g[3]);ctx.stroke();
                ctx.strokeStyle='rgba(170,155,255,0.3)';ctx.lineWidth=1;
                ctx.beginPath();ctx.moveTo(g[0]+1,g[1]);ctx.lineTo(g[2]+1,g[3]);ctx.stroke();
            });

            // ── Slingshots ──
            slings.forEach(function(sl){
                const lit=sl.lit>0,rx=sl.kick>0?WL:WR;
                ctx.fillStyle='rgba(0,0,0,0.4)';
                ctx.beginPath();ctx.moveTo(sl.ax+2,sl.ay+2);ctx.lineTo(sl.bx+2,sl.by+2);ctx.lineTo(rx+2,sl.by+2);ctx.closePath();ctx.fill();
                const sg=ctx.createLinearGradient(sl.ax,sl.ay,sl.bx,sl.by);
                sg.addColorStop(0,lit?'#ff8820':'#2828b8');sg.addColorStop(1,lit?'#ffe030':'#1010a8');
                ctx.fillStyle=sg;
                ctx.beginPath();ctx.moveTo(sl.ax,sl.ay);ctx.lineTo(sl.bx,sl.by);ctx.lineTo(rx,sl.by);ctx.closePath();ctx.fill();
                if(lit){ctx.shadowColor='#ffe060';ctx.shadowBlur=18;}
                ctx.strokeStyle=lit?'#ffff60':'#5858e0';ctx.lineWidth=2.5;
                ctx.beginPath();ctx.moveTo(sl.ax,sl.ay);ctx.lineTo(sl.bx,sl.by);ctx.stroke();
                ctx.strokeStyle=lit?'rgba(255,255,200,0.9)':'rgba(110,100,245,0.4)';ctx.lineWidth=1;
                ctx.beginPath();ctx.moveTo(sl.ax+1,sl.ay+1);ctx.lineTo(sl.bx+1,sl.by+1);ctx.stroke();
                ctx.shadowBlur=0;
            });

            // ── Rollovers ──
            rollovers.forEach(function(rv){
                if(rv.lit){ctx.shadowColor='#ffe060';ctx.shadowBlur=16;}
                ctx.fillStyle=rv.lit?'#ffe030':'#141050';
                ctx.beginPath();ctx.arc(rv.x,rv.y,rv.r,0,Math.PI*2);ctx.fill();
                ctx.strokeStyle=rv.lit?'#ffffa0':'#3838b0';ctx.lineWidth=1.5;
                ctx.beginPath();ctx.arc(rv.x,rv.y,rv.r,0,Math.PI*2);ctx.stroke();
                ctx.fillStyle=rv.lit?'#000':'rgba(200,185,255,0.9)';
                ctx.font='bold 7px Tahoma';ctx.textAlign='center';
                ctx.fillText(rv.lbl,rv.x,rv.y+2.5);ctx.shadowBlur=0;
            });

            // ── Targets A (pink) ──
            tgA.forEach(function(t){
                if(t.hit){ctx.fillStyle='rgba(15,10,45,0.7)';ctx.fillRect(t.x,t.y,TW,TH);return;}
                ctx.fillStyle='rgba(0,0,0,0.35)';ctx.fillRect(t.x+2,t.y+2,TW,TH);
                const g=ctx.createLinearGradient(t.x,t.y,t.x,t.y+TH);
                g.addColorStop(0,'#ff4080');g.addColorStop(1,'#880030');
                ctx.fillStyle=g;ctx.fillRect(t.x,t.y,TW,TH);
                ctx.fillStyle='rgba(255,255,255,0.4)';ctx.fillRect(t.x,t.y,TW,3);
                ctx.strokeStyle='#ff80a8';ctx.lineWidth=0.8;ctx.strokeRect(t.x,t.y,TW,TH);
            });

            // ── Targets B (orange) ──
            tgB.forEach(function(t){
                if(t.hit){ctx.fillStyle='rgba(15,10,45,0.7)';ctx.fillRect(t.x,t.y,TW,TH);return;}
                ctx.fillStyle='rgba(0,0,0,0.35)';ctx.fillRect(t.x+2,t.y+2,TW,TH);
                const g=ctx.createLinearGradient(t.x,t.y,t.x,t.y+TH);
                g.addColorStop(0,'#ff7020');g.addColorStop(1,'#7a3000');
                ctx.fillStyle=g;ctx.fillRect(t.x,t.y,TW,TH);
                ctx.fillStyle='rgba(255,255,255,0.35)';ctx.fillRect(t.x,t.y,TW,3);
                ctx.strokeStyle='#ffb060';ctx.lineWidth=0.8;ctx.strokeRect(t.x,t.y,TW,TH);
            });

            // ── Pop bumpers (3D raised) ──
            bumpers.forEach(function(b){
                const lit=b.lit>0;
                ctx.shadowColor='rgba(0,0,0,0.65)';ctx.shadowBlur=10;ctx.shadowOffsetX=3;ctx.shadowOffsetY=5;
                ctx.fillStyle='rgba(0,0,0,0.1)';ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.fill();
                ctx.shadowOffsetX=0;ctx.shadowOffsetY=0;ctx.shadowBlur=0;
                if(lit){ctx.shadowColor=b.col;ctx.shadowBlur=30;}
                const og=ctx.createRadialGradient(b.x,b.y,b.r*0.22,b.x,b.y,b.r);
                og.addColorStop(0,lit?'#ffffff':lighten(b.col,0.35));
                og.addColorStop(0.5,lit?lighten(b.col,0.55):'#120622');
                og.addColorStop(1,'#05021a');
                ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.fillStyle=og;ctx.fill();
                ctx.strokeStyle=lit?'#fff':lighten(b.col,0.45);ctx.lineWidth=2;ctx.stroke();
                ctx.shadowBlur=0;
                // Ring groove
                ctx.strokeStyle=darken(b.col,0.4);ctx.lineWidth=1.5;
                ctx.beginPath();ctx.arc(b.x,b.y,b.r*0.78,0,Math.PI*2);ctx.stroke();
                // Inner dome
                const ic=b.r*0.56;
                const ig=ctx.createRadialGradient(b.x-ic*0.38,b.y-ic*0.38,ic*0.04,b.x,b.y,ic);
                ig.addColorStop(0,lit?'#ffffff':lighten(b.col,0.75));
                ig.addColorStop(0.4,lit?lighten(b.col,0.4):b.col);
                ig.addColorStop(1,lit?b.col:darken(b.col,0.45));
                ctx.beginPath();ctx.arc(b.x,b.y,ic,0,Math.PI*2);ctx.fillStyle=ig;ctx.fill();
                ctx.fillStyle=lit?'#000':'rgba(255,255,255,0.95)';
                ctx.font='bold '+(b.r<14?'6':'7')+'px Tahoma';ctx.textAlign='center';
                ctx.fillText(b.pts,b.x,b.y+2.5);
            });

            // ── Spinning wheel decoration (center lower area) ──
            ctx.save();
            ctx.translate(150,338);ctx.rotate(spinnerAngle);
            const sFlash=(frameN%20<4);
            for(let i=0;i<8;i++){
                const a=i*Math.PI/4;
                ctx.strokeStyle=sFlash&&i%2===0?'rgba(180,140,255,0.85)':'rgba(65,50,145,0.45)';
                ctx.lineWidth=1.2;
                ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(Math.cos(a)*22,Math.sin(a)*22);ctx.stroke();
            }
            ctx.strokeStyle=sFlash?'rgba(200,160,255,0.7)':'rgba(80,60,160,0.4)';ctx.lineWidth=1.5;
            ctx.beginPath();ctx.arc(0,0,22,0,Math.PI*2);ctx.stroke();
            ctx.beginPath();ctx.arc(0,0,12,0,Math.PI*2);ctx.stroke();
            ctx.fillStyle=sFlash?'rgba(170,130,255,0.8)':'rgba(55,40,120,0.6)';
            ctx.beginPath();ctx.arc(0,0,4,0,Math.PI*2);ctx.fill();
            ctx.restore();

            // ── Flippers ──
            flippers.forEach(function(f){
                const tip=flipTip(f);ctx.lineCap='round';
                ctx.shadowColor='rgba(0,0,0,0.5)';ctx.shadowBlur=6;ctx.shadowOffsetX=2;ctx.shadowOffsetY=3;
                ctx.strokeStyle='#081890';ctx.lineWidth=15;
                ctx.beginPath();ctx.moveTo(f.x,f.y);ctx.lineTo(tip.x,tip.y);ctx.stroke();
                ctx.shadowBlur=0;ctx.shadowOffsetX=0;ctx.shadowOffsetY=0;
                ctx.strokeStyle=f.open?'#58b0ff':'#3870d0';ctx.lineWidth=12;
                ctx.beginPath();ctx.moveTo(f.x,f.y);ctx.lineTo(tip.x,tip.y);ctx.stroke();
                ctx.strokeStyle=f.open?'#98d8ff':'#76aae8';ctx.lineWidth=6;
                ctx.beginPath();ctx.moveTo(f.x,f.y);ctx.lineTo(tip.x,tip.y);ctx.stroke();
                ctx.strokeStyle='rgba(255,255,255,0.55)';ctx.lineWidth=2;
                ctx.beginPath();ctx.moveTo(f.x,f.y);ctx.lineTo(tip.x,tip.y);ctx.stroke();
                const pg=ctx.createRadialGradient(f.x-3,f.y-3,0,f.x,f.y,9);
                pg.addColorStop(0,'#d0e8ff');pg.addColorStop(1,'#203890');
                ctx.fillStyle=pg;ctx.beginPath();ctx.arc(f.x,f.y,9,0,Math.PI*2);ctx.fill();
            });

            // ── Plunger (always present) ──
            const PLUNGER_Y = launched ? 380 : ball.y + BR;
            if (!launched) {
                // Spring coils only visible while ball rests on plunger
                const coilStart = ball.y + BR;
                ctx.strokeStyle='rgba(95,75,145,0.65)'; ctx.lineWidth=1.5;
                for (let y=coilStart+8; y<VH-8; y+=7) {
                    ctx.beginPath(); ctx.moveTo(LANE_L+5,y); ctx.lineTo(LANE_R-5,y+4); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(LANE_R-5,y+4); ctx.lineTo(LANE_L+5,y+8); ctx.stroke();
                }
            }
            const pc = !launched
                ? (springCharge>0.65?'#ff3535':springCharge>0.3?'#ffaa00':'#c0c0c0')
                : '#4a4860';
            ctx.fillStyle=pc; ctx.fillRect(LANE_L+4,PLUNGER_Y,LANE_R-LANE_L-8,11);
            ctx.fillStyle='rgba(255,255,255,0.42)'; ctx.fillRect(LANE_L+4,PLUNGER_Y,LANE_R-LANE_L-8,3);
            ctx.strokeStyle='rgba(0,0,0,0.45)'; ctx.lineWidth=1; ctx.strokeRect(LANE_L+4,PLUNGER_Y,LANE_R-LANE_L-8,11);

            // ── Multiplier ──
            if(mult>1){
                ctx.fillStyle='rgba(255,210,0,0.12)';ctx.fillRect(WL+2,4,72,18);
                ctx.fillStyle='#ffd700';ctx.font='bold 8px Tahoma';ctx.textAlign='left';
                ctx.fillText('×'+mult+' МНОЖИТЕЛЬ',WL+4,16);
            }

            // ── Ball ──
            ctx.fillStyle='rgba(0,0,0,0.28)';
            ctx.beginPath();ctx.ellipse(ball.x+4,ball.y+6,BR*0.85,BR*0.42,0,0,Math.PI*2);ctx.fill();
            const bsg=ctx.createRadialGradient(ball.x-BR*0.35,ball.y-BR*0.35,BR*0.05,ball.x,ball.y,BR);
            bsg.addColorStop(0,'#ffffff');bsg.addColorStop(0.28,'#f0f0f0');
            bsg.addColorStop(0.62,'#a0a0a0');bsg.addColorStop(1,'#484848');
            ctx.beginPath();ctx.arc(ball.x,ball.y,BR,0,Math.PI*2);ctx.fillStyle=bsg;ctx.fill();
            ctx.fillStyle='rgba(255,255,255,0.72)';
            ctx.beginPath();ctx.ellipse(ball.x-BR*0.28,ball.y-BR*0.3,BR*0.22,BR*0.14,0,0,Math.PI*2);ctx.fill();

            // ── Debug overlay (press D to toggle) ──
            if(dbg){
                ctx.fillStyle='rgba(0,0,0,0.65)';ctx.fillRect(2,2,160,62);
                ctx.fillStyle='#00ff88';ctx.font='9px monospace';ctx.textAlign='left';
                const st=inLane?'inLane':(!launched?'plunger':'play');
                ctx.fillText('state: '+st,6,14);
                ctx.fillText('x:'+ball.x.toFixed(1)+' y:'+ball.y.toFixed(1),6,26);
                ctx.fillText('vx:'+ball.vx.toFixed(2)+' vy:'+ball.vy.toFixed(2),6,38);
                ctx.fillText('spd:'+Math.hypot(ball.vx,ball.vy).toFixed(2)+' SPDFAC:'+SPDFAC,6,50);
                ctx.fillText('WL:'+WL+' WR:'+WR+' LANE_L:'+LANE_L,6,62);
            }

            // ── Game over ──
            if(gameOver){
                ctx.fillStyle='rgba(3,1,18,0.82)';ctx.fillRect(0,0,VW,VH);
                ctx.textAlign='center';
                ctx.fillStyle='#ffd700';ctx.font='bold 20px Tahoma';ctx.fillText('ИГРА ОКОНЧЕНА',VW/2,VH/2-24);
                ctx.fillStyle='#fff';ctx.font='13px Tahoma';ctx.fillText('Счёт: '+score.toLocaleString('ru-RU'),VW/2,VH/2+2);
                ctx.fillStyle='#8080ff';ctx.font='10px Tahoma';ctx.fillText('Пробел — новая игра',VW/2,VH/2+22);
            }
            ctx.restore();
        }

        function updateHUD(){
            const sc=document.getElementById('pb-score'),ba=document.getElementById('pb-balls'),msg=document.getElementById('pb-msg');
            if(sc)sc.textContent=score.toLocaleString('ru-RU');
            if(ba)ba.textContent='●'.repeat(ballsLeft)+'○'.repeat(Math.max(0,3-ballsLeft));
            if(msg&&!gameOver)msg.textContent=mult>1?'×'+mult+' МНОЖИТЕЛЬ':'Z ← Лев.   Прав. → X';
        }

        function keyH(e,dn){
            if(!wmWindows['pinball'])return;
            if(e.key==='ArrowLeft'||e.key==='z'||e.key==='Z'){leftDown=dn;e.preventDefault();}
            if(e.key==='ArrowRight'||e.key==='x'||e.key==='X'){rightDown=dn;e.preventDefault();}
            if(dn&&(e.key==='d'||e.key==='D')){dbg=!dbg;}
            if(dn&&e.key===' '){
                e.preventDefault();
                if(gameOver){
                    score=0;ballsLeft=3;mult=1;gameOver=false;resetBall();
                    tgA.forEach(function(t){t.hit=false;});tgB.forEach(function(t){t.hit=false;});
                    rollovers.forEach(function(r){r.lit=false;});updateHUD();
                }else if(!launched)charging=true;
            }
            if(!dn&&e.key===' '&&charging){charging=false;launch();}
        }

        function kd(e){keyH(e,true);}
        function ku(e){keyH(e,false);}
        document.addEventListener('keydown',kd);
        document.addEventListener('keyup',ku);

        let raf;
        function loop(){
            if(!wmWindows['pinball']){
                cancelAnimationFrame(raf);
                document.removeEventListener('keydown',kd);
                document.removeEventListener('keyup',ku);
                return;
            }
            const wrap=cv.parentElement;
            if(wrap&&(Math.abs(wrap.clientWidth/VW-scale)>0.05||Math.abs(wrap.clientHeight/VH-scale)>0.05))resizeCanvas();
            update();draw();
            raf=requestAnimationFrame(loop);
        }
        resetBall();updateHUD();loop();
    }, 0);
}

// ==================== SOLITAIRE (KOSYNKA / KLONDIKE) ====================
function openSolitaire() {
    if (wmWindows['solitaire']) { wmRestore('solitaire'); wmFocus('solitaire'); return; }
    const c = document.createElement('div');
    c.className = 'solitaire-window';
    c.innerHTML = '<div class="sol-toolbar"><button id="sol-new" class="xp-dialog-btn">Новая игра</button><span id="sol-score" style="margin-left:12px;font-size:11px;color:#333">Счёт: 0</span></div><div id="sol-area" class="sol-area"></div>';
    wmCreate('solitaire', 'Косынка', c, 700, 520, '♠');
    setTimeout(function() { initSolitaire(); }, 0);
}

function initSolitaire() {
    const SOL_SUITS = ['♠','♥','♦','♣'];
    const SOL_VALS  = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
    const SOL_RED   = new Set(['♥','♦']);

    let deck, tableau, foundations, stock, waste, score, dragSrc;

    function newDeck() {
        const d = [];
        SOL_SUITS.forEach(function(s) { SOL_VALS.forEach(function(v) { d.push({s:s,v:v,face:false}); }); });
        for (let i=d.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[d[i],d[j]]=[d[j],d[i]];}
        return d;
    }
    function valIdx(v) { return SOL_VALS.indexOf(v); }
    function isRed(s)  { return SOL_RED.has(s); }

    function startGame() {
        deck        = newDeck();
        tableau     = Array.from({length:7}, function() { return []; });
        foundations = Array.from({length:4}, function() { return []; });
        stock = []; waste = []; score = 0;
        for (let i=0;i<7;i++) { for (let j=i;j<7;j++) { tableau[j].push(deck.pop()); } tableau[i][i].face=true; }
        stock = deck.splice(0); stock.forEach(function(c){c.face=false;});
        render();
    }

    function render() {
        const area = document.getElementById('sol-area');
        if (!area) return;
        area.innerHTML = '';
        // Score
        const sc = document.getElementById('sol-score');
        if (sc) sc.textContent = 'Счёт: ' + score;

        // Stock + Waste + Foundations row
        const topRow = document.createElement('div');
        topRow.className = 'sol-top-row';

        // Stock
        const stockEl = document.createElement('div');
        stockEl.className = 'sol-stock sol-card-place';
        stockEl.textContent = stock.length ? '🂠' : '↺';
        stockEl.style.cursor = 'pointer';
        stockEl.addEventListener('click', function() {
            if (stock.length) { const c=stock.pop(); c.face=true; waste.push(c); score=Math.max(0,score-2); }
            else { stock=waste.reverse(); waste=[]; stock.forEach(function(c){c.face=false;}); }
            render();
        });
        topRow.appendChild(stockEl);

        // Waste
        const wasteEl = document.createElement('div');
        wasteEl.className = 'sol-waste sol-card-place';
        if (waste.length) {
            const top = waste[waste.length-1];
            wasteEl.appendChild(makeCard(top, true));
            makeDraggable(wasteEl, top, 'waste', waste.length-1);
        }
        topRow.appendChild(wasteEl);

        // Spacer
        topRow.appendChild(document.createElement('div'));

        // Foundations
        foundations.forEach(function(f, fi) {
            const fe = document.createElement('div');
            fe.className = 'sol-foundation sol-card-place';
            fe.dataset.fi = fi;
            fe.textContent = f.length ? '' : SOL_SUITS[fi];
            if (f.length) fe.appendChild(makeCard(f[f.length-1], true));
            topRow.appendChild(fe);
        });

        area.appendChild(topRow);

        // Tableau
        const tabRow = document.createElement('div');
        tabRow.className = 'sol-tab-row';
        tableau.forEach(function(col, ci) {
            const colEl = document.createElement('div');
            colEl.className = 'sol-col';
            colEl.dataset.ci = ci;

            if (!col.length) {
                const empty = document.createElement('div');
                empty.className = 'sol-card-place sol-empty-col';
                colEl.appendChild(empty);
            }
            col.forEach(function(card, ri) {
                const cardEl = makeCard(card, card.face);
                cardEl.style.position = 'relative';
                cardEl.style.marginTop = ri === 0 ? '0' : '-80px';
                if (card.face && ri < col.length) {
                    cardEl.style.zIndex = ri + 1;
                }
                if (card.face) makeDraggable(cardEl, card, 'tableau', ci, ri);
                colEl.appendChild(cardEl);
            });
            tabRow.appendChild(colEl);
        });
        area.appendChild(tabRow);

        // Win check
        if (foundations.every(function(f){return f.length===13;})) {
            score += 500;
            const sc = document.getElementById('sol-score');
            if (sc) sc.textContent = 'Счёт: ' + score;
            setTimeout(function(){ if (typeof clippySay === 'function') clippySay(CLIPPY_MSGS.react_solitaire_win, 'excited'); }, 500);
            startWinAnimation();
        }
    } // закрывающая скобка render()

    // --- ЛЕГЕНДАРНАЯ АНИМАЦИЯ ПОБЕДЫ ---
    function startWinAnimation() {
        const area = document.getElementById('sol-area');
        if (!area) return;

        const cv = document.createElement('canvas');
        cv.style.cssText = 'position:absolute; top:0; left:0; width:100%; height:100%; z-index:100; cursor:pointer;';
        cv.width = area.offsetWidth;
        cv.height = area.offsetHeight;
        area.appendChild(cv);
        const ctx = cv.getContext('2d');

        cv.addEventListener('click', function() {
            cv.remove();
            startGame();
        });

        const CW = 68, CH = 96;
        let deckToDrop = [];

        const foundationEls = area.querySelectorAll('.sol-foundation');
        foundations.forEach(function(f, i) {
            if (!foundationEls[i]) return;
            const rect = foundationEls[i].getBoundingClientRect();
            const areaRect = area.getBoundingClientRect();
            const startX = rect.left - areaRect.left + area.scrollLeft;
            const startY = rect.top - areaRect.top + area.scrollTop;
            for (let j = f.length - 1; j >= 0; j--) {
                deckToDrop.push({ card: f[j], x: startX, y: startY });
            }
        });

        let currentCard = null;
        let cardTimer = 0;

        function drawCard(c, x, y) {
            ctx.fillStyle = '#fff';
            ctx.fillRect(x, y, CW, CH);
            ctx.strokeStyle = '#bbb';
            ctx.strokeRect(x, y, CW, CH);
            ctx.fillStyle = (c.s === '♥' || c.s === '♦') ? '#cc0000' : '#000';
            ctx.font = 'bold 13px Tahoma';
            ctx.textAlign = 'left';
            ctx.fillText(c.v + c.s, x + 4, y + 14);
            ctx.save();
            ctx.translate(x + CW, y + CH);
            ctx.rotate(Math.PI);
            ctx.fillText(c.v + c.s, 4, 14);
            ctx.restore();
        }

        function loop() {
            if (!document.body.contains(cv)) return;

            // Намеренно НЕ очищаем канвас — создаём шлейф как в оригинальном XP
            if (cardTimer <= 0 && deckToDrop.length > 0) {
                const next = deckToDrop.pop();
                currentCard = {
                    card: next.card,
                    x: next.x, y: next.y,
                    vx: (Math.random() > 0.5 ? 1 : -1) * (Math.random() * 4 + 2),
                    vy: Math.random() * -3 - 2
                };
                cardTimer = 40;
            }
            cardTimer--;

            if (currentCard) {
                currentCard.vy += 0.6;
                currentCard.x += currentCard.vx;
                currentCard.y += currentCard.vy;

                if (currentCard.y + CH > cv.height) {
                    currentCard.y = cv.height - CH;
                    currentCard.vy = -currentCard.vy * 0.82;
                }
                if (currentCard.x < 0) {
                    currentCard.x = 0; currentCard.vx = -currentCard.vx;
                } else if (currentCard.x + CW > cv.width) {
                    currentCard.x = cv.width - CW; currentCard.vx = -currentCard.vx;
                }

                drawCard(currentCard.card, currentCard.x, currentCard.y);
            }

            if (deckToDrop.length === 0 && cardTimer < -150) {
                ctx.fillStyle = 'rgba(0, 107, 0, 0.9)';
                ctx.fillRect(cv.width/2 - 110, cv.height/2 - 20, 220, 40);
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 12px Tahoma';
                ctx.textAlign = 'center';
                ctx.fillText('Кликните для новой игры', cv.width/2, cv.height/2 + 4);
                return;
            }

            requestAnimationFrame(loop);
        }
        loop();
    }

    function makeCard(card, faceUp) {
        const el = document.createElement('div');
        el.className = 'sol-card' + (faceUp ? (isRed(card.s) ? ' sol-red' : ' sol-black') : ' sol-back');
        if (faceUp) {
            el.innerHTML = '<span class="sol-val-top">' + card.v + card.s + '</span><span class="sol-val-bot">' + card.v + card.s + '</span>';
        }
        return el;
    }

    function makeDraggable(el, card, src, idx, rowIdx) {
        // Автоматический перенос в Дом по двойному клику
        el.addEventListener('dblclick', function(e) {
            if (e.button !== 0) return;
            e.stopPropagation();
            if (src === 'tableau' && rowIdx !== tableau[idx].length - 1) return; // Только нижнюю карту из колонки
            for (let fi = 0; fi < 4; fi++) {
                const f = foundations[fi];
                const topCard = f.length ? f[f.length-1] : null;
                const canPlace = (!topCard && card.v === 'A') || (topCard && topCard.s === card.s && valIdx(card.v) === valIdx(topCard.v) + 1);
                if (canPlace) {
                    dragSrc = { card: card, src: src, idx: idx, rowIdx: rowIdx };
                    handleDrop('foundation', fi, 0);
                    return;
                }
            }
        });

        // Кастомное визуальное перетаскивание
        el.addEventListener('mousedown', function(e) {
            if (e.button !== 0) return;
            e.stopPropagation();

            let moved = false;
            const startX = e.clientX, startY = e.clientY;
            const rect = el.getBoundingClientRect();
            const offsetX = startX - rect.left, offsetY = startY - rect.top;
            let ghost = null;

            function onMove(ev) {
                const dx = ev.clientX - startX, dy = ev.clientY - startY;
                if (!moved && Math.abs(dx) + Math.abs(dy) < 5) return;
                if (!moved) {
                    moved = true;
                    ghost = document.createElement('div');
                    ghost.style.cssText = 'position:fixed; pointer-events:none; z-index:10000; width:68px;';
                    
                    if (src === 'waste') {
                        ghost.appendChild(makeCard(card, true));
                        el.style.opacity = '0.3'; // Затемняем оригинал
                    } else if (src === 'tableau') {
                        const cardsToDrag = tableau[idx].slice(rowIdx);
                        cardsToDrag.forEach(function(c, i) {
                            const cEl = makeCard(c, true);
                            cEl.style.position = 'relative';
                            cEl.style.marginTop = i === 0 ? '0' : '-80px'; // Сохраняем отступы стопки
                            cEl.style.zIndex = i + 1;
                            ghost.appendChild(cEl);
                        });
                        // Затемняем все перетаскиваемые карты в колонке
                        let curr = el;
                        while(curr) { curr.style.opacity = '0.3'; curr = curr.nextElementSibling; }
                    }
                    document.body.appendChild(ghost);
                }
                if (ghost) {
                    ghost.style.left = (ev.clientX - offsetX) + 'px';
                    ghost.style.top = (ev.clientY - offsetY) + 'px';
                }
            }

            function onUp(ev) {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                if (ghost) { ghost.remove(); ghost = null; }
                if (!moved) return;

                const target = document.elementFromPoint(ev.clientX, ev.clientY);
                let dropTarget = target ? (target.closest('.sol-foundation') || target.closest('.sol-col')) : null;

                dragSrc = { card: card, src: src, idx: idx, rowIdx: rowIdx };

                let success = false;
                if (dropTarget) {
                    if (dropTarget.classList.contains('sol-foundation')) {
                        success = handleDrop('foundation', parseInt(dropTarget.dataset.fi), 0);
                    } else if (dropTarget.classList.contains('sol-col')) {
                        success = handleDrop('tableau', parseInt(dropTarget.dataset.ci), 0);
                    }
                }
                // Если не получилось сбросить в правильное место, перезапускаем рендер чтобы вернуть прозрачность (opacity) к норме
                if (!success) render();
            }

            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
    }

    function handleDrop(dest, destIdx, destRow) {
        if (!dragSrc) return false;
        const { card, src, idx, rowIdx } = dragSrc;
        dragSrc = null;

        if (dest === 'foundation') {
            const f = foundations[destIdx];
            const topCard = f.length ? f[f.length-1] : null;
            const canPlace = (!topCard && card.v === 'A') ||
                (topCard && topCard.s === card.s && valIdx(card.v) === valIdx(topCard.v) + 1);
            if (!canPlace) return false;
            // Only allow single card drops to foundation
            if (src === 'waste') { waste.pop(); f.push(card); score += 10; }
            else if (src === 'tableau') {
                if (rowIdx !== tableau[idx].length - 1) return false;
                tableau[idx].pop(); f.push(card); score += 10;
                if (tableau[idx].length && !tableau[idx][tableau[idx].length-1].face) { tableau[idx][tableau[idx].length-1].face=true; score+=5; }
            }
        } else if (dest === 'tableau') {
            const col = tableau[destIdx];
            const topCard = col.length ? col[col.length-1] : null;
            const canPlace = (!topCard && card.v === 'K') ||
                (topCard && topCard.face && isRed(topCard.s) !== isRed(card.s) && valIdx(topCard.v) === valIdx(card.v) + 1);
            if (!canPlace) return false;
            if (src === 'waste') { waste.pop(); col.push(card); score+=5; }
            else if (src === 'tableau') {
                // Move card and all face-up cards below it
                const movingCards = tableau[idx].slice(rowIdx);
                tableau[idx] = tableau[idx].slice(0, rowIdx);
                movingCards.forEach(function(mc) { col.push(mc); });
                score += 3;
                if (tableau[idx].length && !tableau[idx][tableau[idx].length-1].face) { tableau[idx][tableau[idx].length-1].face=true; score+=5; }
            }
        }
        render();
        return true;
    }

    const newBtn = document.getElementById('sol-new');
    if (newBtn) newBtn.addEventListener('click', startGame);
    startGame();
}

// ==================== HEARTS ====================
function openHearts() {
    if (wmWindows['hearts']) { wmRestore('hearts'); wmFocus('hearts'); return; }
    const c = document.createElement('div');
    c.className = 'hearts-window';
    c.innerHTML = '<div id="hearts-status" style="padding:6px 10px;font-size:11px;background:#c0d8c0;border-bottom:1px solid #8a8">Ваш ход. Разыграйте карту.</div><div id="hearts-table" class="hearts-table"></div><div id="hearts-hand" class="hearts-hand"></div><div style="padding:4px 8px;background:#e8f0e8;border-top:1px solid #cdc;display:flex;gap:16px" id="hearts-scores"></div>';
    wmCreate('hearts', 'Червы', c, 620, 480, '♥');
    setTimeout(initHearts, 0);
}

function initHearts() {
    const SUITS=['♠','♥','♦','♣'], VALS=['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
    function vi(v){return VALS.indexOf(v);}
    function isHeart(c){return c.s==='♥';}
    function isQS(c){return c.s==='♠'&&c.v==='Q';}
    function points(c){return isHeart(c)?1:isQS(c)?13:0;}

    let hands, trick, trickLead, trickSuit, scores, heartsBroken, trickCards, names, status;
    names = ['Вы','Бот 1','Бот 2','Бот 3'];

    function newGame() {
        let deck=[];
        SUITS.forEach(function(s){VALS.forEach(function(v){deck.push({s:s,v:v});});});
        for(let i=deck.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];}
        hands=[deck.slice(0,13),deck.slice(13,26),deck.slice(26,39),deck.slice(39,52)];
        scores=[0,0,0,0]; trick=0; heartsBroken=false; trickCards=null;
        // Find who has 2♣
        trickLead=hands.findIndex(function(h){return h.some(function(c){return c.s==='♣'&&c.v==='2';});});
        trickSuit=null; status='';
        renderHearts();
        setTimeout(continueHearts, 300);
    }

    function continueHearts() {
        if (!wmWindows['hearts']) return;
        // Bots play first if not player's turn
        while (trickLead !== 0 && trickCards && trickCards.length < 4) {
            botPlay(trickLead);
        }
        renderHearts();
        if (trickCards && trickCards.length === 4) {
            setTimeout(resolveTrick, 800);
        }
    }

    function botPlay(p) {
        if (!trickCards) trickCards = [];
        let hand = hands[p];
        let card;
        if (trickCards.length === 0) {
            // Lead: play lowest non-heart if possible
            const safe = hand.filter(function(c){return !isHeart(c)&&!isQS(c);});
            card = safe.length ? safe.reduce(function(a,b){return vi(a.v)<vi(b.v)?a:b;}) : hand[0];
            trickSuit = card.s;
        } else {
            const follow = hand.filter(function(c){return c.s===trickSuit;});
            if (follow.length) {
                card = follow.reduce(function(a,b){return vi(a.v)<vi(b.v)?a:b;});
            } else {
                // Dump points if possible
                const pts = hand.filter(function(c){return points(c)>0;});
                card = pts.length ? pts[0] : hand[0];
            }
        }
        hands[p] = hand.filter(function(c){return c!==card;});
        trickCards.push({player:p, card:card});
        if (isHeart(card)||isQS(card)) heartsBroken=true;
        // Next player
        trickLead = (trickLead+1)%4;
    }

    function playerPlay(card) {
        if (!trickCards) trickCards = [];
        const hand = hands[0];
        // Validate: must follow suit
        if (trickCards.length > 0) {
            const hasSuit = hand.some(function(c){return c.s===trickSuit;});
            if (hasSuit && card.s !== trickSuit) { setStatus('Нужно ходить в масть '+trickSuit+'!'); return; }
        } else {
            trickSuit = card.s;
            // Can't lead hearts unless broken
            if (isHeart(card) && !heartsBroken) {
                const hasNonHeart = hand.some(function(c){return !isHeart(c);});
                if (hasNonHeart) { setStatus('Червы ещё не разбиты!'); return; }
            }
        }
        if (isHeart(card)||isQS(card)) heartsBroken=true;
        hands[0] = hand.filter(function(c){return c!==card;});
        trickCards.push({player:0, card:card});
        trickLead = (trickLead+1)%4;
        renderHearts();
        setTimeout(function(){
            if (!wmWindows['hearts']) return;
            while (trickCards.length < 4) { botPlay(trickLead); }
            renderHearts();
            setTimeout(resolveTrick, 700);
        }, 200);
    }

    function resolveTrick() {
        if (!trickCards || !wmWindows['hearts']) return;
        // Find winner: highest card of lead suit
        let winner = trickCards[0];
        trickCards.forEach(function(tc) {
            if (tc.card.s === trickCards[0].card.s && vi(tc.card.v) > vi(winner.card.v)) winner = tc;
        });
        // Award points
        trickCards.forEach(function(tc){scores[winner.player]+=points(tc.card);});
        trick++;
        trickCards = null;
        trickLead = winner.player;
        trickSuit = null;
        setStatus(names[winner.player]+' берёт взятку.');

        // Check end of round
        if (hands[0].length === 0) {
            // Check shoot the moon
            const shootIdx = scores.findIndex(function(s,i){return s===26;});
            if (shootIdx >= 0) {
                scores = scores.map(function(s,i){return i===shootIdx?0:s+26;});
                setStatus(names[shootIdx]+' взял все штрафы! +26 всем остальным.');
            }
            renderHearts();
            setTimeout(function(){
                const msg = names.map(function(n,i){return n+': '+scores[i];}).join('\n');
                if (confirm('Раунд окончен!\n'+msg+'\nСыграть ещё?')) newGame();
            }, 500);
            return;
        }
        renderHearts();
        if (trickLead !== 0) setTimeout(function(){
            if (!wmWindows['hearts']) return;
            botPlay(trickLead); trickLead=(trickLead+1)%4;
            if (trickCards.length<4) { /* player's turn */ } else { setTimeout(resolveTrick,700); }
            renderHearts();
        }, 600);
    }

    function setStatus(msg) {
        status = msg;
        const el = document.getElementById('hearts-status');
        if (el) el.textContent = msg;
    }

    function renderHearts() {
        if (!wmWindows['hearts']) return;
        const table = document.getElementById('hearts-table');
        const handEl = document.getElementById('hearts-hand');
        const scEl = document.getElementById('hearts-scores');
        if (!table||!handEl||!scEl) return;

        // Table: show trick cards
        table.innerHTML = '';
        if (trickCards && trickCards.length) {
            trickCards.forEach(function(tc) {
                const pos = ['bottom','left','top','right'][tc.player];
                const cd = document.createElement('div');
                cd.className='hearts-trick-card hearts-card '+(tc.card.s==='♥'||tc.card.s==='♦'?'hearts-red':'hearts-black');
                cd.style.gridArea=pos;
                cd.textContent=tc.card.v+tc.card.s;
                table.appendChild(cd);
            });
        }
        // Bot hand sizes
        [1,2,3].forEach(function(p){
            const pc=document.createElement('div');
            pc.className='hearts-bot-count';
            pc.style.gridArea=['left','top','right'][p-1];
            pc.textContent=names[p]+': '+hands[p].length+' карт';
            table.appendChild(pc);
        });

        // Player hand
        handEl.innerHTML='';
        const myHand = hands[0];
        myHand.sort(function(a,b){if(a.s!==b.s)return SUITS.indexOf(a.s)-SUITS.indexOf(b.s);return vi(a.v)-vi(b.v);});
        myHand.forEach(function(card) {
            const cd=document.createElement('div');
            cd.className='hearts-card '+(isHeart(card)||card.s==='♦'?'hearts-red':'hearts-black');
            cd.textContent=card.v+card.s;
            cd.style.cursor=(trickLead===0||trickCards===null)?'pointer':'default';
            if (trickLead===0||trickCards===null) {
                cd.addEventListener('click',function(){playerPlay(card);});
            }
            handEl.appendChild(cd);
        });

        // Scores
        scEl.innerHTML=names.map(function(n,i){return '<span>'+n+': <b>'+scores[i]+'</b></span>';}).join('');
    }

    newGame();
}

// ==================== MS PAINT ====================
function openPaint() {
    if (wmWindows['paint']) { wmRestore('paint'); wmFocus('paint'); return; }
    const c = document.createElement('div');
    c.className = 'paint-window';
    c.innerHTML = '<div class="paint-toolbar"><div class="paint-tools"><button class="paint-tool active" data-tool="pencil" title="Карандаш">✏️</button><button class="paint-tool" data-tool="fill" title="Заливка">🪣</button><button class="paint-tool" data-tool="eraser" title="Ластик">🧹</button><button class="paint-tool" data-tool="rect" title="Прямоугольник">▭</button><button class="paint-tool" data-tool="circle" title="Эллипс">⬭</button><button class="paint-tool" data-tool="line" title="Линия">/</button><button class="paint-tool" data-tool="text" title="Текст">A</button></div><div class="paint-colors" id="paint-colors"></div><div class="paint-size-wrap"><label style="font-size:10px">Размер: <input type="range" id="paint-size" min="1" max="30" value="3"></label></div><button class="xp-dialog-btn" id="paint-clear" style="font-size:10px">Очистить</button><button class="xp-dialog-btn" id="paint-save" style="font-size:10px">Сохранить PNG</button></div><div class="paint-canvas-wrap"><canvas id="paint-canvas" width="680" height="420"></canvas></div>';
    wmCreate('paint', 'Paint', c, 720, 540, '🎨');
    setTimeout(function() {
        const canvas = document.getElementById('paint-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0,0,canvas.width,canvas.height);

        let tool='pencil', color='#000000', size=3, drawing=false, startX, startY, snapshot;

        const COLORS=['#000000','#7f7f7f','#880000','#ff0000','#ff7f00','#ffff00','#00a500','#00ff00','#003080','#0000ff','#4b0082','#8f00ff','#ff69b4','#ffffff','#c0c0c0','#d2691e'];
        const colorWrap = document.getElementById('paint-colors');
        COLORS.forEach(function(col) {
            const sw = document.createElement('div');
            sw.className = 'paint-swatch' + (col===color?' active':'');
            sw.style.background = col;
            sw.addEventListener('click', function() {
                color=col; document.querySelectorAll('.paint-swatch').forEach(function(s){s.classList.remove('active');});
                sw.classList.add('active');
            });
            colorWrap.appendChild(sw);
        });
        // Color picker
        const cp = document.createElement('input'); cp.type='color'; cp.value=color; cp.style.cssText='width:22px;height:22px;padding:0;border:1px solid #999;cursor:pointer;';
        cp.addEventListener('input', function(){color=cp.value;});
        colorWrap.appendChild(cp);

        document.querySelectorAll('.paint-tool').forEach(function(btn){
            btn.addEventListener('click',function(){
                document.querySelectorAll('.paint-tool').forEach(function(b){b.classList.remove('active');});
                btn.classList.add('active'); tool=btn.dataset.tool;
            });
        });

        const sizeInp=document.getElementById('paint-size');
        if(sizeInp)sizeInp.addEventListener('input',function(){size=parseInt(sizeInp.value);});

        document.getElementById('paint-clear').addEventListener('click',function(){ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);});
        document.getElementById('paint-save').addEventListener('click',function(){const a=document.createElement('a');a.href=canvas.toDataURL();a.download='paint.png';a.click();});

        function getPos(e){const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};}

        function floodFill(x,y,fillColor){
            const idata=ctx.getImageData(0,0,canvas.width,canvas.height);
            const data=idata.data;
            const w=canvas.width,h=canvas.height;
            const px=(Math.round(y)*w+Math.round(x))*4;
            const or=data[px],og=data[px+1],ob=data[px+2],oa=data[px+3];
            const fr=parseInt(fillColor.slice(1,3),16),fg=parseInt(fillColor.slice(3,5),16),fb=parseInt(fillColor.slice(5,7),16);
            if(or===fr&&og===fg&&ob===fb)return;
            const stack=[[Math.round(x),Math.round(y)]];
            function set(sx,sy){const i=(sy*w+sx)*4;data[i]=fr;data[i+1]=fg;data[i+2]=fb;data[i+3]=255;}
            function match(sx,sy){const i=(sy*w+sx)*4;return data[i]===or&&data[i+1]===og&&data[i+2]===ob&&data[i+3]===oa;}
            while(stack.length){const[cx,cy]=stack.pop();if(cx<0||cy<0||cx>=w||cy>=h)continue;if(!match(cx,cy))continue;set(cx,cy);stack.push([cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]);}
            ctx.putImageData(idata,0,0);
        }

        canvas.addEventListener('mousedown',function(e){
            const p=getPos(e); drawing=true; startX=p.x; startY=p.y;
            if(tool==='fill'){floodFill(p.x,p.y,color);return;}
            if(tool==='text'){const t=prompt('Текст:');if(t){ctx.font=(size*5)+'px Arial';ctx.fillStyle=color;ctx.fillText(t,p.x,p.y);}return;}
            snapshot=ctx.getImageData(0,0,canvas.width,canvas.height);
            if(tool==='pencil'||tool==='eraser'){ctx.beginPath();ctx.moveTo(p.x,p.y);}
        });
        canvas.addEventListener('mousemove',function(e){
            if(!drawing)return;
            const p=getPos(e);
            if(tool==='pencil'){ctx.strokeStyle=color;ctx.lineWidth=size;ctx.lineCap='round';ctx.lineTo(p.x,p.y);ctx.stroke();}
            else if(tool==='eraser'){ctx.strokeStyle='#fff';ctx.lineWidth=size*3;ctx.lineCap='round';ctx.lineTo(p.x,p.y);ctx.stroke();}
            else if(tool==='rect'||tool==='circle'||tool==='line'){
                ctx.putImageData(snapshot,0,0);
                ctx.strokeStyle=color;ctx.lineWidth=size;
                if(tool==='rect'){ctx.strokeRect(startX,startY,p.x-startX,p.y-startY);}
                else if(tool==='circle'){ctx.beginPath();ctx.ellipse(startX+(p.x-startX)/2,startY+(p.y-startY)/2,Math.abs(p.x-startX)/2,Math.abs(p.y-startY)/2,0,0,Math.PI*2);ctx.stroke();}
                else if(tool==='line'){ctx.beginPath();ctx.moveTo(startX,startY);ctx.lineTo(p.x,p.y);ctx.stroke();}
            }
        });
        canvas.addEventListener('mouseup',function(){drawing=false;snapshot=null;});
        canvas.addEventListener('mouseleave',function(){drawing=false;});
    }, 0);
}

// ==================== WORDPAD ====================
function openWordPad() {
    if (wmWindows['wordpad']) { wmRestore('wordpad'); wmFocus('wordpad'); return; }
    const c = document.createElement('div');
    c.className = 'wordpad-window';
    c.innerHTML = '<div class="wordpad-toolbar"><select id="wp-font" style="font-size:11px;width:100px"><option>Arial</option><option>Times New Roman</option><option>Courier New</option><option>Georgia</option><option>Verdana</option></select><select id="wp-size" style="font-size:11px;width:50px"><option>10</option><option>12</option><option selected>14</option><option>18</option><option>24</option><option>36</option></select><button class="wp-btn" data-cmd="bold" title="Жирный"><b>B</b></button><button class="wp-btn" data-cmd="italic" title="Курсив"><i>I</i></button><button class="wp-btn" data-cmd="underline" title="Подчеркнуть"><u>U</u></button><span style="width:8px;display:inline-block"></span><button class="wp-btn" data-cmd="justifyLeft" title="По левому краю">&#9776;</button><button class="wp-btn" data-cmd="justifyCenter" title="По центру">&#9783;</button><button class="wp-btn" data-cmd="justifyRight" title="По правому краю">&#9777;</button><span style="width:8px;display:inline-block"></span><input type="color" id="wp-color" value="#000000" style="width:22px;height:22px;padding:0;border:1px solid #999;cursor:pointer" title="Цвет текста"><button class="xp-dialog-btn" id="wp-save" style="font-size:10px;margin-left:4px">Сохранить</button><button class="xp-dialog-btn" id="wp-load" style="font-size:10px">Загрузить</button></div><div class="wordpad-ruler"><div style="flex:1;height:2px;background:linear-gradient(90deg,#aaa 0,#aaa 1px,transparent 0) 0 0/8px 2px repeat-x"></div></div><div id="wp-editor" class="wordpad-editor" contenteditable="true" spellcheck="false"></div>';
    wmCreate('wordpad','WordPad',c,640,480,'📝');
    setTimeout(function(){
        const editor=document.getElementById('wp-editor');
        const fontSel=document.getElementById('wp-font');
        const sizeSel=document.getElementById('wp-size');
        const colorInp=document.getElementById('wp-color');
        if(!editor)return;
        editor.style.fontFamily='Arial';
        editor.style.fontSize='14px';
        const saved=localStorage.getItem('edge_wordpad_content');
        if(saved)editor.innerHTML=saved;

        document.querySelectorAll('.wp-btn').forEach(function(btn){
            btn.addEventListener('mousedown',function(e){e.preventDefault();document.execCommand(btn.dataset.cmd,false,null);editor.focus();});
        });
        fontSel.addEventListener('change',function(){document.execCommand('fontName',false,fontSel.value);editor.focus();});
        sizeSel.addEventListener('change',function(){document.execCommand('fontSize',false,'3');
            editor.querySelectorAll('font[size="3"]').forEach(function(el){el.removeAttribute('size');el.style.fontSize=sizeSel.value+'px';});
            editor.focus();
        });
        colorInp.addEventListener('input',function(){document.execCommand('foreColor',false,colorInp.value);editor.focus();});
        document.getElementById('wp-save').addEventListener('click',function(){localStorage.setItem('edge_wordpad_content',editor.innerHTML);});
        document.getElementById('wp-load').addEventListener('click',function(){const s=localStorage.getItem('edge_wordpad_content');if(s)editor.innerHTML=s;});
    },0);
}

// ==================== CMD.EXE ====================
function openCmd() {
    if (wmWindows['cmd']) { wmRestore('cmd'); wmFocus('cmd'); return; }
    const c = document.createElement('div');
    c.className = 'cmd-window';
    c.innerHTML = '<div id="cmd-output" class="cmd-output"></div><div class="cmd-input-row"><span class="cmd-prompt">C:\\></span><input id="cmd-input" class="cmd-input" type="text" autocomplete="off" spellcheck="false"></div>';
    wmCreate('cmd','Командная строка',c,560,380,'⬛');
    setTimeout(function(){
        const out=document.getElementById('cmd-output');
        const inp=document.getElementById('cmd-input');
        if(!out||!inp)return;
        let cwd='C:\\Users\\User';
        const env={PATH:'C:\\Windows\\System32',WINDIR:'C:\\Windows',USERNAME:'User',OS:'Windows_NT'};
        let history=[], histIdx=-1;

        function print(text,cls){const l=document.createElement('div');if(cls)l.className=cls;l.textContent=text;out.appendChild(l);out.scrollTop=out.scrollHeight;}

        print('Microsoft Windows XP [Версия 5.1.2600]','cmd-header');
        print('(C) Корпорация Майкрософт, 1985-2001.','cmd-header');
        print('');

        const COMMANDS = {
            help: function(){['cls - очистить экран','dir - список файлов','echo [текст] - вывести текст','cd [путь] - сменить каталог','set - переменные среды','ver - версия Windows','color - цвет текста','time - текущее время','date - текущая дата','title [заголовок] - заголовок окна','ping [хост] - пинг','ipconfig - сетевые настройки','tasklist - список задач','taskkill - завершить задачу','chkdsk - проверка диска','format - форматировать диск','shutdown - завершение работы','exit - закрыть окно'].forEach(function(l){print(l);});},
            ver: function(){print('Microsoft Windows XP [Версия 5.1.2600]');},
            cls: function(){out.innerHTML='';},
            dir: function(){['  Volume in drive C is SYSTEM','  Volume Serial Number is DEAD-BEEF','','Directory of '+cwd,'','[.]   [..]   Program Files   Windows   Users','','               5 File(s)    0 bytes','               2 Dir(s)  80,523,321,344 bytes free'].forEach(function(l){print(l);});},
            cd: function(args){if(!args||args==='..'){cwd=cwd.split('\\').slice(0,-1).join('\\')||'C:\\';return;}cwd=cwd+'\\'+args;},
            echo: function(args){print(args||'');},
            time: function(){print('Текущее время: '+new Date().toLocaleTimeString('ru-RU'));},
            date: function(){print('Текущая дата: '+new Date().toLocaleDateString('ru-RU'));},
            set: function(args){if(!args){Object.keys(env).forEach(function(k){print(k+'='+env[k]);});}else{const parts=args.split('=');const k=parts[0];const v=parts.slice(1).join('=');if(v.length)env[k]=v;else print(env[k]||args+' не является внутренней или внешней');}},
            color: function(){print('Цвет изменён (это просто эмуляция).');},
            title: function(args){const w=wmWindows['cmd'];if(w)w.el.querySelector('.xp-titlebar-title').textContent=args||'Командная строка';},
            ping: function(args){const h=args||'ya.ru';print('Обмен пакетами с '+h+' [77.88.55.66]:');[1,2,3,4].forEach(function(i){setTimeout(function(){print('Ответ от 77.88.55.66: число байт=32 время='+(20+Math.round(Math.random()*30))+'мс TTL=55');},i*400);});},
            ipconfig: function(){['Windows IP Configuration','','Ethernet adapter Local Area Connection:','   Connection-specific DNS Suffix: local','   IP Address. . . . . . . . . : 192.168.1.'+Math.floor(Math.random()*200+2),'   Subnet Mask . . . . . . . . : 255.255.255.0','   Default Gateway . . . . . . : 192.168.1.1'].forEach(function(l){print(l);});},
            tasklist: function(){['Image Name      PID Session Name  Mem Usage','============  ===== ============ ==========','System Idle P.    0 Console       28 K','System            4 Console      216 K','explorer.exe    888 Console   18,452 K','iexplore.exe   1024 Console   32,768 K','notepad.exe    1337 Console    4,096 K'].forEach(function(l){print(l);});},
            taskkill: function(){print('УСПЕХ: процесс завершён.');},
            chkdsk: function(){['Тип файловой системы: NTFS','Серийный номер тома: 3A2F-87D1','CHKDSK проверяет файлы (этап 1 из 3)...','  100 percent of file verification complete.','CHKDSK проверяет индексы (этап 2 из 3)...','  100 percent completed.','CHKDSK проверяет дескрипторы безопасности (этап 3 из 3)...','Windows проверила файловую систему и не обнаружила проблем.','  20,971,520 КБ всего места на диске.','  11,534,336 КБ занято.','   9,437,184 КБ свободно.'].forEach(function(l){print(l);});},
            format: function(){print('Предупреждение: все данные будут потеряны!');print('Нажмите Y для продолжения или N для отмены...');setTimeout(function(){print('Форматирование... Ладно, пожалею ваши данные. :)');},1000);},
            shutdown: function(){openShutdownDialog();},
            exit: function(){wmClose('cmd');},
            tree: function(){['C:\\','├── Windows','│   ├── System32','│   └── SysWOW64','├── Program Files','│   ├── Internet Explorer','│   └── Windows Media Player','└── Users','    └── User','        ├── Desktop','        ├── Documents','        └── Downloads'].forEach(function(l){print(l);});},
            systeminfo: function(){['Имя узла:   USER-PC','ОС:         Microsoft Windows XP Professional','Версия ОС:  5.1.2600 Service Pack 3 Build 2600','ОС (доп.):  Standalone Workstation','ОЗУ:        1024 МБ','Пр. память: '+Math.floor(Math.random()*400+200)+' МБ'].forEach(function(l){print(l);}); },
            crash: function(){print('Инициирован критический сбой системы...'); setTimeout(triggerBSOD, 800);}
        };

        function prompt2(){return cwd+'>';}

        inp.addEventListener('keydown',function(e){
            if(e.key==='Enter'){
                const line=inp.value;
                print(prompt2()+line);
                if(line.trim()){history.unshift(line);histIdx=-1;}
                inp.value='';
                const parts=line.trim().toLowerCase().split(' ');
                const cmd=parts[0];
                const arg=parts.slice(1).join(' ');
                if(cmd===''){return;}
                if(COMMANDS[cmd]){COMMANDS[cmd](arg);}
                else if(cmd){print("'"+cmd+"' не является внутренней или внешней командой","cmd-error");print("исполняемой программой или пакетным файлом.","cmd-error");}
            }else if(e.key==='ArrowUp'){histIdx=Math.min(histIdx+1,history.length-1);inp.value=history[histIdx]||'';}
            else if(e.key==='ArrowDown'){histIdx=Math.max(histIdx-1,-1);inp.value=history[histIdx]||'';}
        });
        setTimeout(function(){inp.focus();},100);
    },0);
}

// ==================== IMPORT / EXPORT ====================
function exportData() {
    const data={edge_tiles:localStorage.getItem(STORAGE.tiles),edge_cols:localStorage.getItem(STORAGE.cols),edge_tile_width:localStorage.getItem(STORAGE.tileWidth),edge_tile_height:localStorage.getItem(STORAGE.tileHeight),edge_tile_opacity:localStorage.getItem(STORAGE.opacity),edge_tile_blur:localStorage.getItem(STORAGE.blur),edge_custom_bg:localStorage.getItem(STORAGE.bg)};
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='edge_startpage_backup.json';a.click();URL.revokeObjectURL(url);
}
document.getElementById('import-upload').addEventListener('change',function(e){
    const file=e.target.files[0];if(!file)return;
    const r=new FileReader();r.onload=function(ev){try{const d=JSON.parse(ev.target.result);if(d.edge_tiles)localStorage.setItem(STORAGE.tiles,d.edge_tiles);if(d.edge_cols)localStorage.setItem(STORAGE.cols,d.edge_cols);if(d.edge_tile_width)localStorage.setItem(STORAGE.tileWidth,d.edge_tile_width);if(d.edge_tile_height)localStorage.setItem(STORAGE.tileHeight,d.edge_tile_height);if(d.edge_tile_opacity)localStorage.setItem(STORAGE.opacity,d.edge_tile_opacity);if(d.edge_tile_blur)localStorage.setItem(STORAGE.blur,d.edge_tile_blur);if(d.edge_custom_bg)localStorage.setItem(STORAGE.bg,d.edge_custom_bg);location.reload();}catch(err){alert('Ошибка при чтении файла');}};
    r.readAsText(file);e.target.value='';
});
document.getElementById('bg-upload').addEventListener('change',function(e){
    const file=e.target.files[0];if(!file)return;
    const r=new FileReader();r.onload=function(ev){localStorage.setItem(STORAGE.bg,ev.target.result);applyBackground();};r.readAsDataURL(file);e.target.value='';
});

// ==================== UPDATER ====================
const _UPD_MANIFEST = 'https://raw.githubusercontent.com/VibeCodeCrew/windows_xp_homepage/main/manifest.json';
const _UPD_ZIP      = 'https://github.com/VibeCodeCrew/windows_xp_homepage/archive/refs/heads/main.zip';
let   _updateAvail  = null; // { current, remote } when update found

function _verGt(a, b) {
    const av = String(a).split('.').map(Number);
    const bv = String(b).split('.').map(Number);
    for (let i = 0; i < Math.max(av.length, bv.length); i++) {
        const d = (av[i]||0) - (bv[i]||0);
        if (d > 0) return true;
        if (d < 0) return false;
    }
    return false;
}

async function checkForUpdates(silent) {
    try {
        const resp = await fetch(_UPD_MANIFEST + '?_nc=' + Date.now());
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const remote = await resp.json();
        const local  = chrome.runtime.getManifest().version;
        const trayUpd = document.getElementById('tray-update');
        if (_verGt(remote.version, local)) {
            _updateAvail = { current: local, remote: remote.version };
            if (trayUpd) trayUpd.classList.remove('hidden');
            setTimeout(function(){ if (typeof clippySay === 'function') clippySay(CLIPPY_MSGS.react_update, 'excited'); }, 1000);
            if (silent) {
                showNotification('Windows Update', 'Доступна версия ' + remote.version + ' (сейчас ' + local + ')', '🔔', 7000);
            } else {
                openUpdateDialog(local, remote.version);
            }
        } else {
            _updateAvail = null;
            if (trayUpd) trayUpd.classList.add('hidden');
            if (!silent) {
                showNotification('Windows Update', 'Установлена последняя версия (' + local + ')', '✅', 4000);
            }
        }
    } catch(e) {
        if (!silent) showNotification('Windows Update', 'Ошибка проверки: ' + e.message, '⚠️', 5000);
    }
}

function openUpdateDialog(currentVer, newVer) {
    if (wmWindows['updater']) { wmRestore('updater'); wmFocus('updater'); return; }

    const c = document.createElement('div');
    c.style.cssText = 'display:flex;flex-direction:column;height:100%;font-family:Tahoma,sans-serif;font-size:11px;background:#fff;';

    // Синяя шапка как в Windows Update
    const hdr = document.createElement('div');
    hdr.style.cssText = 'background:linear-gradient(90deg,#0050cc 0%,#1874e8 55%,#00aaff 100%);padding:12px 16px;display:flex;align-items:center;gap:14px;flex-shrink:0;';
    hdr.innerHTML =
        '<svg width="36" height="36" viewBox="0 0 36 36"><rect x="0" y="0" width="16" height="16" fill="#f35325"/><rect x="20" y="0" width="16" height="16" fill="#81bc06"/><rect x="0" y="20" width="16" height="16" fill="#05a6f0"/><rect x="20" y="20" width="16" height="16" fill="#ffba08"/></svg>' +
        '<div>' +
          '<div style="color:#fff;font-size:14px;font-weight:bold;font-family:\'Franklin Gothic Medium\',Tahoma,sans-serif;">Windows Update</div>' +
          '<div style="color:#b8d8ff;font-size:11px;margin-top:2px;">Доступна новая версия Nostalgic Startpage</div>' +
        '</div>';
    c.appendChild(hdr);

    // Белая полоска-разделитель (желтая как в XP update)
    const strip = document.createElement('div');
    strip.style.cssText = 'background:#fff8c0;border-top:1px solid #e0c040;border-bottom:1px solid #e0c040;padding:5px 16px;font-size:11px;color:#604000;flex-shrink:0;';
    strip.innerHTML = '⚠️ &nbsp;Для завершения установки потребуется перезагрузить расширение вручную.';
    c.appendChild(strip);

    // Тело
    const body = document.createElement('div');
    body.style.cssText = 'flex:1;padding:14px 16px;overflow-y:auto;';
    body.innerHTML =
        '<table style="border-collapse:collapse;width:100%;margin-bottom:12px;">' +
          '<tr><td style="padding:3px 8px 3px 0;color:#666;white-space:nowrap;">Установленная версия:</td>' +
              '<td style="padding:3px 0;font-weight:bold;">' + escapeHtml(String(currentVer)) + '</td></tr>' +
          '<tr><td style="padding:3px 8px 3px 0;color:#666;white-space:nowrap;">Доступная версия:</td>' +
              '<td style="padding:3px 0;font-weight:bold;color:#0050cc;">' + escapeHtml(String(newVer)) + '</td></tr>' +
        '</table>' +
        '<div style="background:#eef4ff;border:1px solid #90b8f0;border-radius:2px;padding:10px 12px;">' +
          '<b style="display:block;margin-bottom:6px;">Как установить обновление:</b>' +
          '<ol style="margin:0;padding-left:18px;line-height:1.8;">' +
            '<li>Нажмите <b>«Скачать»</b> — загрузится ZIP-архив</li>' +
            '<li>Распакуйте архив <b>поверх</b> папки расширения</li>' +
            '<li>Откройте <b style="font-family:monospace;">chrome://extensions</b></li>' +
            '<li>Нажмите кнопку 🔄 «Обновить» рядом с расширением</li>' +
          '</ol>' +
        '</div>';
    c.appendChild(body);

    // Кнопки
    const btns = document.createElement('div');
    btns.style.cssText = 'display:flex;justify-content:flex-end;gap:6px;padding:8px 12px;background:#ECE9D8;border-top:1px solid #aca899;flex-shrink:0;';
    const dlBtn = document.createElement('button'); dlBtn.className = 'xp-dialog-btn xp-dialog-btn-primary';
    dlBtn.textContent = '⬇️ Скачать обновление';
    const laterBtn = document.createElement('button'); laterBtn.className = 'xp-dialog-btn';
    laterBtn.textContent = 'Позже';
    const extBtn = document.createElement('button'); extBtn.className = 'xp-dialog-btn';
    extBtn.textContent = '🔧 chrome://extensions';
    btns.appendChild(dlBtn); btns.appendChild(extBtn); btns.appendChild(laterBtn);
    c.appendChild(btns);

    wmCreate('updater', 'Windows Update', c, 420, 320, '🔄');

    dlBtn.addEventListener('click', function() {
        chrome.downloads.download({ url: _UPD_ZIP, filename: 'nostalgic-startpage-update.zip' });
        dlBtn.textContent = '✅ Загружается...'; dlBtn.disabled = true;
        showNotification('Windows Update', 'Загрузка начата. После завершения распакуйте поверх папки расширения.', '⬇️', 7000);
    });
    extBtn.addEventListener('click', function() {
        chrome.tabs.create({ url: 'chrome://extensions' });
    });
    laterBtn.addEventListener('click', function() { wmClose('updater'); });
}

// ==================== SCREENSAVER ====================
let ssTimer = null, ssActive = false, ssEl = null;

function resetScreensaver() {
    if (ssActive) stopScreensaver();
    clearTimeout(ssTimer);
    if (localStorage.getItem('edge_ss_enabled') === 'false') return;
    const delayMin = parseInt(localStorage.getItem('edge_ss_delay') || '5');
    ssTimer = setTimeout(startScreensaver, delayMin * 60 * 1000);
}

function startScreensaver() {
    if (ssActive) return;
    ssActive = true;
    ssEl = document.createElement('div');
    ssEl.id = 'screensaver';
    ssEl.style.cssText = 'position:fixed;inset:0;background:#000;z-index:99999;cursor:none;overflow:hidden;';

    // Animated pipes screensaver
    const cv = document.createElement('canvas');
    cv.style.cssText = 'width:100%;height:100%;';
    cv.width = window.innerWidth;
    cv.height = window.innerHeight;
    ssEl.appendChild(cv);
    document.body.appendChild(ssEl);

    const ctx = cv.getContext('2d');
    const PIPE_COLORS = ['#ff0000','#00ff00','#0000ff','#ffff00','#ff00ff','#00ffff','#ff8800'];
    const CELL = 20;
    const cols = Math.floor(cv.width / CELL);
    const rows = Math.floor(cv.height / CELL);

    let pipes = [];
    function newPipe() {
        return {
            x: Math.floor(Math.random()*cols),
            y: Math.floor(Math.random()*rows),
            dir: Math.floor(Math.random()*4), // 0=right,1=down,2=left,3=up
            color: PIPE_COLORS[Math.floor(Math.random()*PIPE_COLORS.length)],
            len: 0
        };
    }

    for (let i=0;i<6;i++) pipes.push(newPipe());

    function drawPipeSegment(p, fromX, fromY) {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = CELL * 0.55;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(fromX*CELL+CELL/2, fromY*CELL+CELL/2);
        ctx.lineTo(p.x*CELL+CELL/2, p.y*CELL+CELL/2);
        ctx.stroke();
        // Joint ball
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(fromX*CELL+CELL/2, fromY*CELL+CELL/2, CELL*0.3, 0, Math.PI*2);
        ctx.fill();
    }

    let frame = 0;
    const ssInterval = setInterval(function() {
        if (!ssActive) { clearInterval(ssInterval); return; }
        frame++;
        if (frame % 2 !== 0) return; // slow down

        pipes.forEach(function(p) {
            const ox = p.x, oy = p.y;
            const DX=[1,0,-1,0][p.dir], DY=[0,1,0,-1][p.dir];
            const nx=p.x+DX, ny=p.y+DY;
            if (nx<0||ny<0||nx>=cols||ny>=rows||p.len>60) {
                // Reset pipe
                const np = newPipe(); p.x=np.x;p.y=np.y;p.dir=np.dir;p.color=np.color;p.len=0; return;
            }
            // Maybe turn
            if (Math.random()<0.15) p.dir=(p.dir+[-1,1][Math.floor(Math.random()*2)]+4)%4;
            drawPipeSegment(p, ox, oy);
            p.x=p.x+DX; p.y=p.y+DY; p.len++;
        });

        // XP text
        ctx.fillStyle='rgba(255,255,255,0.08)';
        ctx.font='bold 48px Arial';
        ctx.textAlign='center';
        ctx.fillText('Windows XP', cv.width/2, cv.height/2);
    }, 50);

    ssEl._interval = ssInterval;
    ssEl.addEventListener('mousemove', stopScreensaver);
    ssEl.addEventListener('keydown', stopScreensaver);
    ssEl.addEventListener('click', stopScreensaver);
}

function stopScreensaver() {
    if (!ssActive) return;
    ssActive = false;
    if (ssEl) {
        if (ssEl._interval) clearInterval(ssEl._interval);
        ssEl.remove();
        ssEl = null;
    }
    resetScreensaver();
    setTimeout(function(){ if (typeof clippySay === 'function') clippySay(CLIPPY_MSGS.react_screensaver_off, 'wave'); }, 1000);
}

// ==================== CLIPPY ====================
var _clippyEnabled = localStorage.getItem('edge_clippy_enabled') !== 'false';
var _clippyIdleTimer = null;
var _clippyBlinkTimer = null;
var _clippyLookTimer = null;
var _clippyAnimTimer = null;
var _clippyCurAnim = 'idle';
var _clippyPrevLinksLen = links.length;

var CLIPPY_MSGS = {
    greet: [
        'Привет! Я Скрепка. Чем могу помочь?',
        'С возвращением! Готов помочь с новой вкладкой.',
        {text:'Добро пожаловать!', actions:[{label:'Что умеешь?', fn:'clippyShowHelp'}]}
    ],
    greet_morning: ['Доброе утро! Хорошего рабочего дня!', 'Доброе утро! Готов помочь.'],
    greet_evening: ['Добрый вечер! Работаете допоздна?', 'Вечер добрый! Чем занимаемся сегодня?'],
    tip_general: [
        'Совет: нажмите правой кнопкой на рабочий стол для контекстного меню.',
        'Совет: ярлыки можно группировать в папки.',
        'Совет: Ctrl+Alt+R открывает диалог «Выполнить».',
        'Совет: Ctrl+Shift+Esc — Диспетчер задач.',
        'Вы знали, что можно перетаскивать ярлыки прямо на рабочем столе?',
        'Совет: в Мой компьютер → диск D: находятся ваши закладки браузера.',
        'Кажется, ярлыков стало много. Попробуйте организовать их в папки!',
        'Совет: обои рабочего стола можно поменять в Пуск → Свой фон.',
        'Вы можете экспортировать все данные через Пуск → Экспорт данных.',
        'Скринсейвер настраивается в Свойства экрана → Заставка.',
    ],
    app_notepad: [
        'Кажется, вы пишете заметку! Черновики сохраняются автоматически.',
        'В блокноте можно открывать сохранённые черновики через меню Файл.',
    ],
    app_calculator: [
        'Подсказка: кнопки калькулятора работают с клавиатуры!',
        'Калькулятор поддерживает стандартные арифметические операции.',
    ],
    app_minesweeper: [
        'Удачи с сапёром! Первый ход никогда не взорвётся.',
        'Совет: правый клик ставит флажок на предполагаемую мину.',
    ],
    app_solitaire: [
        'Косынка! Цель — собрать все масти сверху по порядку.',
        'Удачи с картами! Иногда партия принципиально непроходима — не переживайте.',
    ],
    app_hearts: [
        'В Червах старайтесь не брать взятки с очками!',
        'Передать все черви противнику — это называется «Застрелить луну»!',
    ],
    app_pinball: [
        'Пинбол! Следите за бонусными мультипликаторами.',
        'Держите шарик в верхней части поля — там больше очков!',
    ],
    app_search: [
        'Поиск откроет новую вкладку. Можно искать в Яндексе или Google.',
    ],
    app_taskmgr: [
        {text:'В диспетчере задач можно закрыть зависшее окно кнопкой «Снять».', anim:'think'},
        'Совет: в диспетчере задач отображаются все открытые приложения.',
    ],
    app_settings: [
        'В настройках можно сменить режим отображения ярлыков и настроить заставку.',
        {text:'Меня можно отключить здесь, во вкладке «Параметры». Только не надо!', anim:'alert'},
    ],
    app_run: ['В диалоге «Выполнить» работает автодополнение из истории браузера.'],
    app_mycomputer: [
        'Мой компьютер: диск C: — ваши ярлыки, диск D: — закладки браузера.',
    ],
    app_paint: [
        'В Paint используйте правую кнопку для рисования фоновым цветом.',
        'Paint: Ctrl+Z отменяет последнее действие.',
    ],
    app_cmd: [
        'Попробуйте команды: help, ver, date, echo, cls.',
    ],
    app_wordpad: ['WordPad поддерживает жирный (Ctrl+B), курсив (Ctrl+I) и списки.'],
    app_recycle: ['В корзине хранятся удалённые ярлыки. Их можно восстановить!'],
    app_sysinfo: ['Системная информация: разрешение экрана, браузер и аптайм страницы.'],
    react_bsod: [
        {text:'Это было близко! Синий экран — классика Windows.', anim:'alert'},
        {text:'Не волнуйтесь, это просто пасхалка!', anim:'wave'},
        {text:'Я тоже испугался!', anim:'excited'},
    ],
    react_created: [
        {text:'Ярлык добавлен! Перетащите его в папку для организации.', anim:'wave'},
        'Отличный выбор! Ярлык появился на рабочем столе.',
        {text:'Готово! Двойной клик открывает ярлык.', anim:'wave'},
    ],
    react_update: [
        {text:'Доступно обновление! Нажмите на колокольчик 🔔 в трее.', anim:'excited'},
    ],
    react_minesweeper_win: [
        {text:'Поздравляю! Вы прошли сапёра!', anim:'excited'},
        {text:'Браво! Ни одной мины!', anim:'wave'},
    ],
    react_minesweeper_loss: [
        'Не повезло! Попробуйте снова.',
        {text:'Бывает! Главное — не угол.', anim:'think'},
        'Помните: правый клик ставит флажок, это помогает!',
    ],
    react_solitaire_win: [
        {text:'Косынка пройдена! Вы молодец!', anim:'excited'},
        {text:'Великолепно! Все масти на месте!', anim:'wave'},
    ],
    react_many_windows: [
        {text:'У вас открыто много окон! Может, свернёте лишние?', anim:'think'},
    ],
    react_screensaver_off: [
        'С возвращением! Давно вас не было.',
        {text:'Отдохнули? Я тут ждал.', anim:'wave'},
    ],
    idle_random: [
        'Кажется, ничего не происходит. Могу чем-нибудь помочь?',
        {text:'Скучаю... Может, сыграем в сапёра?', actions:[{label:'Играть!', fn:'clippyOpenMinesweeper'}]},
        'Вы знали, что ярлыки можно переупорядочить перетаскиванием?',
        {text:'Я умею: открывать приложения, давать советы и поднимать настроение!', anim:'wave'},
        'Если я мешаю — меня можно отключить в Настройках → Параметры.',
        {text:'Попробуйте диск D: в Мой компьютер — там ваши закладки браузера!', actions:[{label:'Открыть', fn:'clippyOpenMyComputer'}]},
        'Совет дня: экспортируйте ярлыки перед переустановкой браузера.',
        {text:'Нужен калькулятор?', actions:[{label:'Открыть', fn:'clippyOpenCalculator'}]},
        'Стикеры (📌 на панели быстрого запуска) отлично подходят для быстрых заметок.',
        {text:'Хотите узнать, что я умею?', actions:[{label:'Да!', fn:'clippyShowHelp'}]},
    ],
};

function clippyShowHelp() {
    clippySay({
        text: 'Я Скрепка! Открываю приложения, даю советы по играм и напоминаю о полезных функциях. Попробуйте!',
        anim: 'wave',
        actions: [{label:'Сапёр', fn:'clippyOpenMinesweeper'}, {label:'Блокнот', fn:'clippyOpenNotepad'}]
    });
}
function clippyOpenMinesweeper() { closeStartMenu(); openApp('minesweeper'); }
function clippyOpenMyComputer()  { closeStartMenu(); openMyComputer(); }
function clippyOpenCalculator()  { closeStartMenu(); openApp('calculator'); }
function clippyOpenNotepad()     { closeStartMenu(); openNotepad(); }

function clippyInit() {
    if (!_clippyEnabled) return;
    if (document.getElementById('clippy-wrap')) return;
    var wrap = document.createElement('div');
    wrap.id = 'clippy-wrap';
    wrap.innerHTML = [
        '<div id="clippy-bubble" class="hidden">',
        '  <button id="clippy-bubble-close" title="Закрыть">&#x2715;</button>',
        '  <div id="clippy-bubble-text"></div>',
        '  <div id="clippy-bubble-actions"></div>',
        '</div>',
        '<svg id="clippy-svg" viewBox="0 0 64 100" width="64" height="100"',
        '     xmlns="http://www.w3.org/2000/svg" class="clippy-anim-idle">',
        '  <defs>',
        '    <linearGradient id="cg-silver" x1="0" y1="0" x2="1" y2="1">',
        '      <stop offset="0%"   stop-color="#e8e8e8"/>',
        '      <stop offset="40%"  stop-color="#c0c0c0"/>',
        '      <stop offset="70%"  stop-color="#a0a0a0"/>',
        '      <stop offset="100%" stop-color="#888"/>',
        '    </linearGradient>',
        '    <linearGradient id="cg-silver2" x1="1" y1="0" x2="0" y2="1">',
        '      <stop offset="0%"   stop-color="#d8d8d8"/>',
        '      <stop offset="100%" stop-color="#909090"/>',
        '    </linearGradient>',
        '  </defs>',
        '  <path id="clippy-body-outer"',
        '    d="M32 4 C48 4 56 14 56 28 C56 60 44 88 32 92',
        '       C20 88 8 60 8 28 C8 14 16 4 32 4 Z"',
        '    fill="none" stroke="url(#cg-silver)" stroke-width="8"',
        '    stroke-linecap="round" stroke-linejoin="round"/>',
        '  <path id="clippy-body-inner"',
        '    d="M32 22 C42 22 48 30 48 40 C48 58 40 74 32 78',
        '       C24 74 16 58 16 40 C16 30 22 22 32 22 Z"',
        '    fill="none" stroke="url(#cg-silver2)" stroke-width="7"',
        '    stroke-linecap="round" stroke-linejoin="round"/>',
        '  <g id="clippy-face">',
        '    <path id="clippy-brow-l" d="M18 30 Q23 27 28 29"',
        '      fill="none" stroke="#555" stroke-width="2" stroke-linecap="round"/>',
        '    <path id="clippy-brow-r" d="M36 29 Q41 27 46 30"',
        '      fill="none" stroke="#555" stroke-width="2" stroke-linecap="round"/>',
        '    <g id="clippy-eye-l">',
        '      <ellipse cx="23" cy="36" rx="5" ry="6" fill="white" stroke="#bbb" stroke-width="0.8"/>',
        '      <circle id="clippy-pupil-l" cx="23" cy="37" r="3" fill="#222"/>',
        '      <circle cx="24.2" cy="35.5" r="1" fill="white"/>',
        '    </g>',
        '    <g id="clippy-eye-r">',
        '      <ellipse cx="41" cy="36" rx="5" ry="6" fill="white" stroke="#bbb" stroke-width="0.8"/>',
        '      <circle id="clippy-pupil-r" cx="41" cy="37" r="3" fill="#222"/>',
        '      <circle cx="42.2" cy="35.5" r="1" fill="white"/>',
        '    </g>',
        '    <path id="clippy-mouth" d="M25 47 Q32 51 39 47"',
        '      fill="none" stroke="#666" stroke-width="1.8" stroke-linecap="round"/>',
        '  </g>',
        '</svg>',
    ].join('\n');
    document.body.appendChild(wrap);
    _clippyInitDrag(wrap);
    _clippyRestorePos(wrap);
    document.getElementById('clippy-bubble-close').addEventListener('click', function(e){
        e.stopPropagation(); clippyDismiss();
    });
    _clippyStartBlink();
    _clippyStartLookAround();
    setTimeout(function(){
        var h = new Date().getHours();
        var msgs = h < 12 ? CLIPPY_MSGS.greet_morning
                 : h < 18 ? CLIPPY_MSGS.greet
                 :           CLIPPY_MSGS.greet_evening;
        clippySay(msgs, 'wave');
    }, 2000);
    _clippyScheduleIdle();
}

function clippySay(msgOrArray, anim, duration) {
    if (!_clippyEnabled) return;
    var bubble = document.getElementById('clippy-bubble');
    if (!bubble) return;
    duration = duration || 7000;
    var msg = Array.isArray(msgOrArray)
        ? msgOrArray[Math.floor(Math.random() * msgOrArray.length)]
        : msgOrArray;
    if (typeof msg === 'string') msg = {text: msg};
    var useAnim = msg.anim || anim || 'talk';
    clippySetAnim(useAnim);
    _clippyMouthExpr('talk');
    var textEl = document.getElementById('clippy-bubble-text');
    var actEl  = document.getElementById('clippy-bubble-actions');
    if (!textEl || !actEl) return;
    textEl.textContent = msg.text;
    actEl.innerHTML = '';
    (msg.actions || []).forEach(function(a){
        var btn = document.createElement('button');
        btn.className = 'clippy-action-btn';
        btn.textContent = a.label;
        btn.addEventListener('click', function(){
            if (window[a.fn]) window[a.fn]();
            clippyDismiss();
        });
        actEl.appendChild(btn);
    });
    bubble.classList.remove('hidden');
    clearTimeout(_clippyAnimTimer);
    _clippyAnimTimer = setTimeout(clippyDismiss, duration);
}

function clippyDismiss() {
    var bubble = document.getElementById('clippy-bubble');
    if (bubble) bubble.classList.add('hidden');
    clippySetAnim('idle');
    _clippyMouthExpr('neutral');
    _clippyScheduleIdle();
}

function clippySetAnim(state) {
    var svg = document.getElementById('clippy-svg');
    if (!svg) return;
    Array.from(svg.classList).forEach(function(cls) {
        if (/^clippy-anim-/.test(cls)) svg.classList.remove(cls);
    });
    _clippyCurAnim = state;
    svg.classList.add('clippy-anim-' + state);
    if (state !== 'idle') {
        clearTimeout(_clippyAnimTimer);
        _clippyAnimTimer = setTimeout(function(){
            if (_clippyCurAnim === state) clippySetAnim('idle');
        }, 3000);
    }
}

function _clippyMouthExpr(type) {
    var m = document.getElementById('clippy-mouth');
    if (!m) return;
    var paths = {
        neutral: 'M25 47 Q32 51 39 47',
        talk:    'M25 46 Q32 50 39 46',
        smile:   'M24 46 Q32 53 40 46',
        sad:     'M25 50 Q32 46 39 50',
    };
    if (paths[type]) m.setAttribute('d', paths[type]);
}

function _clippyStartBlink() {
    function doBlink() {
        var svg = document.getElementById('clippy-svg');
        if (!svg) return;
        svg.classList.add('clippy-blinking');
        setTimeout(function(){ if (svg) svg.classList.remove('clippy-blinking'); }, 200);
        _clippyBlinkTimer = setTimeout(doBlink, 2500 + Math.random() * 3000);
    }
    _clippyBlinkTimer = setTimeout(doBlink, 3000);
}

function _clippyStartLookAround() {
    var dirs = ['clippy-look-left', 'clippy-look-right', 'clippy-look-up', ''];
    function doLook() {
        var svg = document.getElementById('clippy-svg');
        if (!svg) return;
        svg.classList.remove('clippy-look-left', 'clippy-look-right', 'clippy-look-up');
        var d = dirs[Math.floor(Math.random() * dirs.length)];
        if (d) svg.classList.add(d);
        _clippyLookTimer = setTimeout(function(){
            if (svg) svg.classList.remove('clippy-look-left', 'clippy-look-right', 'clippy-look-up');
            _clippyLookTimer = setTimeout(doLook, 4000 + Math.random() * 5000);
        }, 1200);
    }
    _clippyLookTimer = setTimeout(doLook, 5000);
}

function _clippyScheduleIdle() {
    clearTimeout(_clippyIdleTimer);
    _clippyIdleTimer = setTimeout(function(){
        var bubble = document.getElementById('clippy-bubble');
        if (!bubble || bubble.classList.contains('hidden')) {
            clippySay(CLIPPY_MSGS.idle_random, 'think');
        }
    }, 4 * 60 * 1000 + Math.random() * 2 * 60 * 1000);
}

function _clippyInitDrag(wrap) {
    wrap.addEventListener('mousedown', function(e){
        if (e.target.closest('#clippy-bubble')) return;
        e.preventDefault();
        var sx = e.clientX, sy = e.clientY;
        // Compute current offset in left/top terms
        var rect = wrap.getBoundingClientRect();
        var ox = rect.left, oy = rect.top;
        wrap.style.right = ''; wrap.style.bottom = '';
        wrap.style.left = ox + 'px'; wrap.style.top = oy + 'px';
        function onM(e) {
            wrap.style.left = Math.max(0, Math.min(window.innerWidth  - 80,  ox + e.clientX - sx)) + 'px';
            wrap.style.top  = Math.max(0, Math.min(window.innerHeight - 120, oy + e.clientY - sy)) + 'px';
        }
        function onU() {
            document.removeEventListener('mousemove', onM);
            document.removeEventListener('mouseup',  onU);
            try { localStorage.setItem('edge_clippy_pos', JSON.stringify({x: wrap.offsetLeft, y: wrap.offsetTop})); } catch(ex){}
        }
        document.addEventListener('mousemove', onM);
        document.addEventListener('mouseup',   onU);
    });
}

function _clippyRestorePos(wrap) {
    try {
        var pos = JSON.parse(localStorage.getItem('edge_clippy_pos') || 'null');
        if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
            wrap.style.right = ''; wrap.style.bottom = '';
            wrap.style.left = pos.x + 'px'; wrap.style.top = pos.y + 'px';
        }
    } catch(e) {}
}

// ==================== GLOBAL CLICK / KEY LISTENERS ====================
document.getElementById('start-btn').addEventListener('click', function(e) { e.stopPropagation(); toggleStartMenu(); });
document.querySelectorAll('.sm-item').forEach(function(el) { el.addEventListener('click', function() { startMenuAction(el.dataset.action); }); });
document.querySelector('.sm-shutdown-btn').addEventListener('click', function() { startMenuAction('shutdown'); });
document.addEventListener('click', function(e) {
    if (!e.target.closest('#context-menu')) hideContextMenu();
    if (!e.target.closest('#start-menu') && !e.target.closest('#start-btn')) closeStartMenu();
});
function showDeleteConfirm(msg, onConfirm) {
    const winId = 'delete-confirm';
    wmClose(winId);
    const c = document.createElement('div');
    c.style.cssText = 'padding:18px;display:flex;flex-direction:column;gap:14px;background:white;';
    const msgEl = document.createElement('div');
    msgEl.style.cssText = 'font-size:12px;color:#333;';
    msgEl.textContent = msg;
    const bd = document.createElement('div');
    bd.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';
    const ok = document.createElement('button'); ok.className = 'xp-dialog-btn xp-dialog-btn-primary'; ok.textContent = 'Да';
    const cn = document.createElement('button'); cn.className = 'xp-dialog-btn'; cn.textContent = 'Нет';
    bd.appendChild(ok); bd.appendChild(cn); c.appendChild(msgEl); c.appendChild(bd);
    wmCreate(winId, 'Подтверждение удаления', c, 320, 130, '\uD83D\uDDD1\uFE0F');
    ok.addEventListener('click', function() { wmClose(winId); onConfirm(); });
    cn.addEventListener('click', function() { wmClose(winId); });
}

function deleteSelectedIcons() {
    if (!selectedIndices.size) return;
    const indices = Array.from(selectedIndices);
    const folderCount = indices.filter(function(i) { return links[i] && links[i].isFolder; }).length;
    const linkCount   = indices.length - folderCount;
    function doDelete() {
        indices.sort(function(a,b){return b-a;}).forEach(function(i){ trashLink(i); });
        clearSelection(); renderDesktop();
    }
    if (folderCount > 0) {
        let msg = 'Удалить в корзину: ';
        if (folderCount) msg += folderCount + ' папк' + (folderCount === 1 ? 'у' : 'и');
        if (folderCount && linkCount) msg += ' и ';
        if (linkCount)   msg += linkCount   + ' ярлык' + (linkCount   === 1 ? '' : 'а');
        msg += '?';
        showDeleteConfirm(msg, doDelete);
    } else {
        doDelete();
    }
}

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') { hideContextMenu(); closeStartMenu(); }
    if (e.ctrlKey && e.altKey && (e.key === 'r' || e.key === 'к')) { e.preventDefault(); openRun(); return; }
    if (e.ctrlKey && e.shiftKey && e.key === 'Escape') { e.preventDefault(); openTaskManager(); return; }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyV') {
        const tag = document.activeElement && document.activeElement.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement.isContentEditable) return;
        e.preventDefault();
        let folderIdx = null;
        if (activeWindowId && activeWindowId.startsWith('folder-')) {
            folderIdx = parseInt(activeWindowId.replace('folder-', ''));
        }
        pasteUrl(folderIdx);
    }
    if (e.key === 'Delete') {
        const tag = document.activeElement && document.activeElement.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement.isContentEditable) return;
        deleteSelectedIcons();
    }
});

// ==================== BOOKMARK DRAG & DROP ====================
(function() {
    function canAccept(dt) {
        const t = Array.from(dt.types || []);
        return t.includes('text/uri-list') || (t.includes('text/plain') && !t.includes('Files'));
    }
    function dispatch(e, folderIndex) {
        if (e.target.closest('.desktop-icon')) return;
        e.preventDefault();
        const types = Array.from(e.dataTransfer.types || []);
        if (types.includes('text/uri-list')) {
            handleLinkDrop(e, folderIndex);
        } else if (types.includes('text/plain')) {
            const text = (e.dataTransfer.getData('text/plain') || '').trim();
            if (/^https?:\/\//i.test(text) || /^[\w.-]+\.[a-z]{2,}/i.test(text)) handleLinkDrop(e, folderIndex);
            else if (text) handleFolderDrop(e, folderIndex);
        }
    }
    const desk = document.getElementById('desktop');
    desk.addEventListener('dragover', function(e) {
        if (e.target.closest('.desktop-icon') || !canAccept(e.dataTransfer)) return;
        e.preventDefault(); e.dataTransfer.dropEffect = 'link';
    });
    desk.addEventListener('drop', function(e) { dispatch(e, null); });
    document.addEventListener('dragover', function(e) {
        const fc = e.target.closest('.folder-window-content');
        if (!fc || !canAccept(e.dataTransfer)) return;
        e.preventDefault(); e.dataTransfer.dropEffect = 'link';
    });
    document.addEventListener('drop', function(e) {
        const fc = e.target.closest('.folder-window-content');
        if (!fc) return;
        const win = fc.closest('.xp-window[id^="win-folder-"]');
        if (win) dispatch(e, parseInt(win.id.replace('win-folder-', '')));
    });
}());

// ==================== RESPONSIVE RESIZE ====================
let resizeTimer = null;
window.addEventListener('resize', function() {
    clearTimeout(resizeTimer);
    // Only re-render visually — never modify saved positions on resize
    resizeTimer = setTimeout(renderDesktop, 150);
});

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', function() {
    applyBackground();
    const smUser = document.querySelector('.sm-username');
    if (smUser) smUser.textContent = username;
    initScreenshots(function() { renderDesktop(); renderStickies(); });
    clippyInit();
    updateClock();
    setInterval(updateClock, 1000);

    // Quick Launch bindings (CSP-safe: no inline onclick)
    [['ql-newtab', function(){chrome.tabs.create({});}],
     ['ql-search', openSearch],
     ['ql-mycomputer', openMyComputer],
     ['ql-notepad', openNotepad],
     ['ql-sticky', function(){ createSticky(); }]
    ].forEach(function(b){ const el=document.getElementById(b[0]); if(el)el.addEventListener('click',b[1]); });

    // Calendar: click on tray-clock
    const trayClock = document.getElementById('tray-clock');
    if (trayClock) { trayClock.style.cursor = 'pointer'; trayClock.addEventListener('click', function(e){ e.stopPropagation(); toggleCalendar(); }); }

    // Volume icon click
    const trayVol = document.getElementById('tray-volume');
    if (trayVol) trayVol.addEventListener('click', function(e){ e.stopPropagation(); toggleVolumePopup(); });

    // Update tray icon click
    const trayUpd = document.getElementById('tray-update');
    if (trayUpd) trayUpd.addEventListener('click', function(e) {
        e.stopPropagation();
        if (_updateAvail) openUpdateDialog(_updateAvail.current, _updateAvail.remote);
        else checkForUpdates(false);
    });
    // Проверка обновлений при старте (тихая) и раз в 2 часа
    setTimeout(function(){ checkForUpdates(true); }, 5000);
    setInterval(function(){ checkForUpdates(true); }, 2 * 60 * 60 * 1000);

    // 5 быстрых кликов по часам = BSOD
    let clockClicks = 0, clockTimer = null;
    const trayTime = document.getElementById('tray-time');
    if (trayTime) {
        trayTime.style.cursor = 'default';
        trayTime.addEventListener('click', function(e) {
            e.stopPropagation(); // не триггерим toggleCalendar
            clockClicks++;
            clearTimeout(clockTimer);
            if (clockClicks >= 5) { clockClicks = 0; triggerBSOD(); return; }
            clockTimer = setTimeout(function() { clockClicks = 0; }, 1000);
        });
    }
    // Screensaver
    ['mousemove','mousedown','keydown','wheel'].forEach(function(ev){document.addEventListener(ev,resetScreensaver);});
    resetScreensaver();
    const smBack = document.querySelector('.sm-back-btn');
    if (smBack) smBack.addEventListener('click', function() {
        document.getElementById('sm-all-programs').classList.add('hidden');
    });

    // Rubber-band (marquee) selection on empty desktop area
    const iconsContainer = document.getElementById('desktop-icons');
    iconsContainer.addEventListener('mousedown', function(e) {
        if (e.button !== 0) return;
        if (e.target.closest('.desktop-icon')) return; // icons handle their own mousedown
        e.preventDefault();
        if (!e.ctrlKey) clearSelection();

        const cRect = iconsContainer.getBoundingClientRect();
        const sx = e.clientX, sy = e.clientY;
        const preSelection = new Set(selectedIndices);

        const rb = document.createElement('div');
        rb.id = 'selection-rect';
        rb.style.cssText = 'left:' + (sx - cRect.left) + 'px; top:' + (sy - cRect.top) + 'px; width:0; height:0;';
        iconsContainer.appendChild(rb);

        function onMove(e) {
            if (!rb.parentNode) return;
            const x1 = Math.min(sx, e.clientX), y1 = Math.min(sy, e.clientY);
            const x2 = Math.max(sx, e.clientX), y2 = Math.max(sy, e.clientY);
            rb.style.left   = (x1 - cRect.left) + 'px';
            rb.style.top    = (y1 - cRect.top)  + 'px';
            rb.style.width  = (x2 - x1) + 'px';
            rb.style.height = (y2 - y1) + 'px';

            selectedIndices.clear();
            preSelection.forEach(function(i) { selectedIndices.add(i); });
            document.querySelectorAll('.desktop-icon[data-index]').forEach(function(el) {
                const idx = parseInt(el.dataset.index);
                if (isNaN(idx)) return;
                const r = el.getBoundingClientRect();
                if (r.left < x2 && r.right > x1 && r.top < y2 && r.bottom > y1) selectedIndices.add(idx);
            });
            updateSelectionUI();
        }

        function onUp() {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            if (rb.parentNode) rb.remove();
        }

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });
});
