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
};

const SNAP = 10; // grid snap size in pixels
const TITLEBAR_H = 19; // tile titlebar height in px

// ==================== STATE ====================
let links = JSON.parse(localStorage.getItem(STORAGE.tiles)) || [
    { name: 'Яндекс',  url: 'https://ya.ru' },
    { name: 'YouTube', url: 'https://youtube.com' },
];
let trashedLinks = JSON.parse(localStorage.getItem(STORAGE.trash)) || [];
let username     = localStorage.getItem(STORAGE.username) || 'User';
let selectedIndices = new Set();

let settings = {
    tileWidth:  parseInt(localStorage.getItem(STORAGE.tileWidth))  || 130,
    tileHeight: parseInt(localStorage.getItem(STORAGE.tileHeight)) || 90,
    opacity:    parseFloat(localStorage.getItem(STORAGE.opacity))  || 0.9,
    blur:       localStorage.getItem(STORAGE.blur) === 'true',
    viewMode:   localStorage.getItem(STORAGE.viewMode)  || 'window', // 'window' | 'icon'
    snapToGrid: localStorage.getItem(STORAGE.snapToGrid) !== 'false',
};

function saveLinks() { localStorage.setItem(STORAGE.tiles, JSON.stringify(links)); }
function saveAndRender() { saveLinks(); renderDesktop(); }

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
    try { return 'https://favicon.yandex.net/favicon/' + new URL(url).hostname + '?size=32'; } catch { return ''; }
}
function getThumbUrl(url) { return 'https://image.thum.io/get/width/800/crop/500/' + url; }

const pageLoadTime = Date.now();

// ==================== CLOCK ====================
function updateClock() {
    const now = new Date();
    const te = document.getElementById('tray-time'), de = document.getElementById('tray-date');
    if (te) te.textContent = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    if (de) de.textContent = now.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

// ==================== PROPORTIONAL POSITIONING ====================
// Each item stores item.x/y (pixels at time of save) + item.dw/dh (desktop size at that moment).
// On render, positions are scaled to current desktop size → icons return to original place on expand.
function getDisplayPos(item) {
    const desktop = document.getElementById('desktop');
    const cw = desktop ? desktop.offsetWidth  : window.innerWidth;
    const ch = desktop ? desktop.offsetHeight : (window.innerHeight - 44);
    const refW = (item && item.dw) ? item.dw : cw;
    const refH = (item && item.dh) ? item.dh : ch;
    return {
        x: ((item && item.x) || 0) * (cw / refW),
        y: ((item && item.y) || 0) * (ch / refH),
    };
}

// ==================== ICON DIMENSIONS ====================
function getIconDim(item) {
    if (settings.viewMode === 'icon') return { w: 80, h: 80 };  // classic XP icon
    const w = (item && item.w) ? item.w : settings.tileWidth;
    const h = (item && item.h) ? item.h : settings.tileHeight;
    return { w: w, h: h + TITLEBAR_H };
}

// ==================== AUTO-ARRANGE (assign positions) ====================
function assignPositions(forceAll) {
    const GAP = 8, MARGIN = 10;
    const desktopEl = document.getElementById('desktop');
    const dw = desktopEl ? desktopEl.offsetWidth  : window.innerWidth;
    const dh = (desktopEl ? desktopEl.offsetHeight : (window.innerHeight - 44)) - GAP;
    let x = MARGIN, y = MARGIN;
    links.forEach(function(item) {
        if (forceAll || item.x === undefined) {
            item.x = x; item.y = y;
            item.dw = dw; item.dh = dh + GAP;
        }
        const dim = getIconDim(item);
        y += dim.h + GAP;
        if (y + dim.h > dh) { y = MARGIN; x += dim.w + GAP; }
    });
}

function autoArrange() {
    assignPositions(true);
    saveAndRender();
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
                        icon: el, item: links[idx],
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
        icon.style.zIndex = 999;
    });
}

document.addEventListener('mousemove', function(e) {
    if (!dragData) return;
    const dx = e.clientX - dragData.startX, dy = e.clientY - dragData.startY;
    if (!dragData.moved && Math.abs(dx) + Math.abs(dy) < 5) return;
    dragData.moved = true;

    const desktop = document.getElementById('desktop');
    const dw = desktop ? desktop.offsetWidth  : 1200;
    const dh = desktop ? desktop.offsetHeight : 800;

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
        document.querySelectorAll('.desktop-icon.folder-icon').forEach(function(fi) {
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
        document.querySelectorAll('.desktop-icon.folder-icon').forEach(function(fi) {
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

    const desktop = document.getElementById('desktop');
    const dw = desktop ? desktop.offsetWidth  : 1200;
    const dh = desktop ? desktop.offsetHeight : 800;
    const dx = e.clientX - dd.startX, dy = e.clientY - dd.startY;

    if (dd.multi) {
        dd.items.forEach(function(d) { d.icon.classList.remove('dragging'); d.icon.style.zIndex = ''; });

        // Check if dropped on a folder
        const selectedIds = new Set(dd.items.map(function(d) { return parseInt(d.icon.dataset.index); }));
        let intoFolder = false;
        document.querySelectorAll('.desktop-icon.folder-icon').forEach(function(fi) {
            fi.classList.remove('drag-over');
            const fIdx = parseInt(fi.dataset.index);
            if (selectedIds.has(fIdx)) return; // can't drop folder into itself
            const fr = fi.getBoundingClientRect();
            if (e.clientX >= fr.left && e.clientX <= fr.right && e.clientY >= fr.top && e.clientY <= fr.bottom) {
                // Move all non-folder selected items into this folder (descending splice, adjusted index)
                const toMove = dd.items.filter(function(d) { return !d.item.isFolder; })
                    .sort(function(a, b) { return b.index - a.index; });
                let adjFIdx = fIdx;
                toMove.forEach(function(d) {
                    if (d.index < adjFIdx) adjFIdx--;
                    const moved = links.splice(d.index, 1)[0];
                    if (moved) links[adjFIdx].items.push(moved);
                });
                intoFolder = true;
                selectedIndices.clear();
                saveAndRender();
            }
        });

        if (!intoFolder) {
            dd.items.forEach(function(d) {
                let x = d.iconX + dx, y = d.iconY + dy;
                x = Math.max(0, Math.min(x, dw - d.icon.offsetWidth));
                y = Math.max(0, Math.min(y, dh - d.icon.offsetHeight));
                if (settings.snapToGrid) { x = Math.round(x / SNAP) * SNAP; y = Math.round(y / SNAP) * SNAP; }
                d.item.x = x; d.item.y = y; d.item.dw = dw; d.item.dh = dh;
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
    if (settings.snapToGrid) { x = Math.round(x / SNAP) * SNAP; y = Math.round(y / SNAP) * SNAP; }

    // check folder drop
    let intoFolder = false;
    document.querySelectorAll('.desktop-icon.folder-icon').forEach(function(fi) {
        fi.classList.remove('drag-over');
        if (dd.item.isFolder) return;
        const fIdx = parseInt(fi.dataset.index);
        const fr = fi.getBoundingClientRect();
        if (e.clientX >= fr.left && e.clientX <= fr.right && e.clientY >= fr.top && e.clientY <= fr.bottom) {
            const moved  = links.splice(dd.index, 1)[0];
            const adjIdx = dd.index < fIdx ? fIdx - 1 : fIdx;
            links[adjIdx].items.push(moved);
            intoFolder = true;
            saveAndRender();
        }
    });

    if (!intoFolder) {
        dd.item.x = x; dd.item.y = y; dd.item.dw = dw; dd.item.dh = dh;
        dd.icon.style.left = x + 'px'; dd.icon.style.top = y + 'px';
        dd.icon.style.zIndex = '';
        dd.icon._wasDragged = true;
        saveLinks();
    }
});

// ==================== BACKGROUND ====================
function applyBackground() {
    const bg = localStorage.getItem(STORAGE.bg), d = document.getElementById('desktop');
    if (bg) { d.style.backgroundImage = 'url(\'' + bg + '\')'; d.style.backgroundSize = 'cover'; d.style.backgroundPosition = 'center'; }
    else { d.style.backgroundImage = d.style.backgroundSize = d.style.backgroundPosition = ''; }
}

// ==================== DESKTOP RENDERING ====================
function renderDesktop() {
    assignPositions(false);

    // One-time migration: items saved without dw/dh get current desktop size as reference
    const desktopEl = document.getElementById('desktop');
    if (desktopEl) {
        const cw = desktopEl.offsetWidth, ch = desktopEl.offsetHeight;
        let migrated = false;
        links.forEach(function(item) {
            if (item.x !== undefined && !item.dw) {
                item.dw = cw; item.dh = ch; migrated = true;
            }
        });
        if (migrated) saveLinks();
    }

    const container = document.getElementById('desktop-icons');
    container.innerHTML = '';

    links.forEach(function(item, index) {
        const icon = settings.viewMode === 'window'
            ? (item.isFolder ? createFolderIconWindow(item, index) : createLinkIconWindow(item, index))
            : (item.isFolder ? createFolderIconXP(item, index)    : createLinkIconXP(item, index));
        placeIcon(icon, item);
        initIconDrag(icon, item, index);
        container.appendChild(icon);
    });

    container.appendChild(createAddButton());
    SYSTEM_ICONS_DEF.forEach(function(def, i) { container.appendChild(createSystemIcon(def, i)); });
    updateSelectionUI();
}

function placeIcon(icon, item) {
    const pos = getDisplayPos(item);
    icon.style.left = pos.x + 'px';
    icon.style.top  = pos.y + 'px';
}

// ---- Window mode: link tile ----
function createLinkIconWindow(item, index) {
    const dim = getIconDim(item);
    const favicon  = item.customIcon || getFaviconUrl(item.url);
    const thumbUrl = getThumbUrl(item.url);

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
          '<button class="tile-btn tile-btn-min" title="Свернуть (не активно)">&#8211;</button>' +
          '<button class="tile-btn tile-btn-max" title="Развернуть (не активно)">&#9633;</button>' +
          '<button class="tile-btn tile-btn-close" title="Убрать в корзину">&#x2715;</button>' +
        '</div>';

    // Thumbnail
    const tc = document.createElement('div');
    tc.className = 'tile-content';
    tc.style.height = (item.h || settings.tileHeight) + 'px';

    const thumb = document.createElement('img');
    thumb.className = 'icon-thumb';
    thumb.loading = 'lazy';
    thumb.src = thumbUrl;
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
    tb.querySelector('.tile-btn-min').addEventListener('click', function(e) { e.stopPropagation(); });
    tb.querySelector('.tile-btn-max').addEventListener('click', function(e) { e.stopPropagation(); });
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
function createAddButton() {
    const dim = getIconDim(null);
    const savedPos = (function() {
        try { return JSON.parse(localStorage.getItem(STORAGE.addBtnPos)); } catch(e) { return null; }
    })();

    let btn;
    if (settings.viewMode === 'window') {
        btn = document.createElement('div');
        btn.className = 'desktop-icon xp-tile-window add-btn-tile';

        const tb = document.createElement('div');
        tb.className = 'tile-titlebar';
        tb.innerHTML =
            '<span style="font-size:12px;line-height:1;flex-shrink:0">+</span>' +
            '<span class="tile-name">Создать</span>' +
            '<div class="tile-btns">' +
              '<button class="tile-btn tile-btn-min" style="opacity:.4;cursor:default">&#8211;</button>' +
              '<button class="tile-btn tile-btn-max" style="opacity:.4;cursor:default">&#9633;</button>' +
            '</div>';

        const tc = document.createElement('div');
        tc.className = 'tile-content add-btn-content';
        tc.style.height = (settings.tileHeight) + 'px';
        tc.innerHTML =
            '<div class="add-btn-plus">+</div>' +
            '<div class="add-btn-hint">Ярлык или папку</div>';

        btn.appendChild(tb);
        btn.appendChild(tc);
        btn.style.cssText = 'position:absolute; width:' + dim.w + 'px;';

        function openCreate(e) {
            if (btn._wasDragged) { btn._wasDragged = false; return; }
            openAddDialog(null);
        }
        tb.addEventListener('click', openCreate);
        tc.addEventListener('click', openCreate);
        tb.querySelector('.tile-btn-min').addEventListener('click', function(e) { e.stopPropagation(); });
        tb.querySelector('.tile-btn-max').addEventListener('click', function(e) { e.stopPropagation(); });
        tb.querySelector('.tile-btns').addEventListener('mousedown', function(e) { e.stopPropagation(); });
    } else {
        btn = document.createElement('div');
        btn.className = 'desktop-icon add-btn-icon';
        btn.style.cssText = 'position:absolute;';
        btn.innerHTML =
            '<div class="add-btn-icon-plus">+</div>' +
            '<div class="add-btn-label">Создать</div>';
        btn.addEventListener('click', function() {
            if (btn._wasDragged) { btn._wasDragged = false; return; }
            openAddDialog(null);
        });
    }

    // Place: use saved position (with proportional scaling) or bottom-right corner
    if (savedPos) {
        const desktop = document.getElementById('desktop');
        const cw = desktop ? desktop.offsetWidth  : 1200;
        const ch = desktop ? desktop.offsetHeight : 800;
        const refW = savedPos.dw || cw;
        const refH = savedPos.dh || ch;
        btn.style.left = (savedPos.x * (cw / refW)) + 'px';
        btn.style.top  = (savedPos.y * (ch / refH)) + 'px';
    } else {
        btn.style.right  = '12px';
        btn.style.bottom = '12px';
    }

    // Draggable
    btn.addEventListener('mousedown', function(e) {
        if (e.button !== 0) return;
        if (e.target.closest('.tile-btns')) return;
        e.preventDefault();
        const iX = btn.offsetLeft, iY = btn.offsetTop;
        const startX = e.clientX, startY = e.clientY;
        let moved = false;

        function onMove(e) {
            const dx = e.clientX - startX, dy = e.clientY - startY;
            if (!moved && Math.abs(dx) + Math.abs(dy) < 5) return;
            if (!moved) { btn.style.right = ''; btn.style.bottom = ''; moved = true; }
            btn.classList.add('dragging');
            const desktop = document.getElementById('desktop');
            let x = iX + dx, y = iY + dy;
            x = Math.max(0, Math.min(x, (desktop ? desktop.offsetWidth  : 1200) - btn.offsetWidth));
            y = Math.max(0, Math.min(y, (desktop ? desktop.offsetHeight : 800)  - btn.offsetHeight));
            btn.style.left = x + 'px'; btn.style.top = y + 'px';
        }
        function onUp(e) {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            btn.classList.remove('dragging');
            if (moved) {
                const dx = e.clientX - startX, dy = e.clientY - startY;
                const desktop = document.getElementById('desktop');
                const dw = desktop ? desktop.offsetWidth  : 1200;
                const dh = desktop ? desktop.offsetHeight : 800;
                let x = iX + dx, y = iY + dy;
                x = Math.max(0, Math.min(x, dw - btn.offsetWidth));
                y = Math.max(0, Math.min(y, dh - btn.offsetHeight));
                if (settings.snapToGrid) { x = Math.round(x / SNAP) * SNAP; y = Math.round(y / SNAP) * SNAP; }
                localStorage.setItem(STORAGE.addBtnPos, JSON.stringify({ x: x, y: y, dw: dw, dh: dh }));
                btn.style.left = x + 'px'; btn.style.top = y + 'px';
                btn._wasDragged = true;
            }
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });

    return btn;
}

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
        if (def.id === 'mycomputer') openSystemInfo();
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
                if (settings.snapToGrid) { x = Math.round(x / SNAP) * SNAP; y = Math.round(y / SNAP) * SNAP; }
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
    const deleted = links.splice(index, 1)[0];
    if (deleted) { deleted.deletedAt = Date.now(); trashedLinks.push(deleted); localStorage.setItem(STORAGE.trash, JSON.stringify(trashedLinks)); }
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
                    let dropX = e.clientX - dr.left + i * SNAP;
                    let dropY = e.clientY - dr.top  + i * SNAP;
                    dropX = Math.max(0, Math.min(dropX, dw - 80));
                    dropY = Math.max(0, Math.min(dropY, dh - 80));
                    if (settings.snapToGrid) { dropX = Math.round(dropX / SNAP) * SNAP; dropY = Math.round(dropY / SNAP) * SNAP; }
                    m.x = dropX; m.y = dropY; m.dw = dw; m.dh = dh;
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

    wmWindows[id] = { el: win, taskbarBtn: null, minimized: false, maximized: false, savedRect: null };
    wmMakeDraggable(win, tb); wmMakeResizable(win, rh);
    win.addEventListener('mousedown', function() { wmFocus(id); });
    tb.querySelector('.xp-btn-min').addEventListener('click', function(e) { e.stopPropagation(); wmMinimize(id); });
    tb.querySelector('.xp-btn-max').addEventListener('click', function(e) { e.stopPropagation(); wmMaximize(id); });
    tb.querySelector('.xp-btn-close').addEventListener('click', function(e) { e.stopPropagation(); wmClose(id); });
    tb.addEventListener('dblclick', function() { wmMaximize(id); });
    wmAddToTaskbar(id, title, icon); wmFocus(id);
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
function wmMinimize(id) { if (!wmWindows[id]) return; wmWindows[id].el.style.display='none'; wmWindows[id].minimized=true; if (wmWindows[id].taskbarBtn) wmWindows[id].taskbarBtn.classList.remove('active'); activeWindowId=null; }
function wmRestore(id)  { if (!wmWindows[id]) return; wmWindows[id].el.style.display='flex'; wmWindows[id].minimized=false; }
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
function wmClose(id) { if (!wmWindows[id]) return; wmWindows[id].el.remove(); if (wmWindows[id].taskbarBtn) wmWindows[id].taskbarBtn.remove(); delete wmWindows[id]; if (activeWindowId===id) activeWindowId=null; }
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
            { label: 'Окна с превью', icon: '', check: settings.viewMode==='window', action: function() { settings.viewMode='window'; localStorage.setItem(STORAGE.viewMode,'window'); renderDesktop(); } },
            { label: 'Ярлыки XP',    icon: '', check: settings.viewMode==='icon',   action: function() { settings.viewMode='icon';   localStorage.setItem(STORAGE.viewMode,'icon');   renderDesktop(); } },
        ]},
        { label: 'Создать', icon: '\uD83D\uDCC4', submenu: [
            { label: 'Ярлык', icon: '\uD83D\uDD17', action: function() { openAddDialog(null); } },
            { label: 'Папку', icon: '\uD83D\uDCC1', action: function() { openAddFolderDialog(); } },
        ]},
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
function openAddFolderDialog() { editCtx={tileIndex:null,childIndex:null,folderIndex:null}; showTileDialog(true,null); }
function openEditDialog(ti, ci) { editCtx={tileIndex:ti,childIndex:ci,folderIndex:null}; const item=(ci!==null)?links[ti].items[ci]:links[ti]; showTileDialog(item.isFolder,item); }

function showTileDialog(isFolder, item) {
    const winId = 'tile-dialog', isEdit = item!==null;
    wmClose(winId);
    const c = document.createElement('div'); c.className = 'dialog-form';
    const ng = document.createElement('div'); ng.className = 'form-group'; ng.innerHTML = '<label>Название:</label>';
    const ni = document.createElement('input'); ni.type='text'; ni.value=item?item.name:''; ni.placeholder='Название';
    ng.appendChild(ni); c.appendChild(ng);
    let ui=null, ii=null;
    if (!isFolder) {
        const ug=document.createElement('div'); ug.className='form-group'; ug.innerHTML='<label>Ссылка:</label>';
        ui=document.createElement('input'); ui.type='text'; ui.value=(item&&item.url)?item.url:''; ui.placeholder='https://...';
        ug.appendChild(ui); c.appendChild(ug);
        const ig=document.createElement('div'); ig.className='form-group'; ig.innerHTML='<label>Иконка (URL, необязательно):</label>';
        ii=document.createElement('input'); ii.type='text'; ii.value=(item&&item.customIcon)?item.customIcon:''; ii.placeholder='URL иконки';
        ig.appendChild(ii); c.appendChild(ig);
    }
    const bd=document.createElement('div'); bd.className='dialog-btns';
    const sv=document.createElement('button'); sv.className='xp-dialog-btn xp-dialog-btn-primary'; sv.textContent='OK';
    const cn=document.createElement('button'); cn.className='xp-dialog-btn'; cn.textContent='Отмена';
    bd.appendChild(sv); bd.appendChild(cn); c.appendChild(bd);
    wmCreate(winId, isEdit?'Изменить':(isFolder?'Создать папку':'Создать ярлык'), c, 320, isFolder?150:235, isFolder?'\uD83D\uDCC1':'\uD83D\uDD17');
    setTimeout(function(){ni.focus();},50);
    sv.addEventListener('click',function(){
        const name=ni.value.trim(); if(!name)return;
        if(isFolder){
            if(isEdit){links[editCtx.tileIndex].name=name; const fw=wmWindows['folder-'+editCtx.tileIndex]; if(fw)fw.el.querySelector('.xp-titlebar-title').textContent=name;}
            else links.push({isFolder:true,name:name,items:[],x:undefined,y:undefined});
        } else {
            let url=ui?ui.value.trim():''; if(!url)return;
            if(!/^[a-z][a-z0-9+\-.]*:\/\//i.test(url))url='https://'+url;
            const ci_=ii?ii.value.trim():'';
            const newItem={name:name,url:url,x:undefined,y:undefined}; if(ci_)newItem.customIcon=ci_;
            if(isEdit){if(editCtx.childIndex!==null){links[editCtx.tileIndex].items[editCtx.childIndex]=newItem;refreshFolderWindow(editCtx.tileIndex);}else links[editCtx.tileIndex]=newItem;}
            else if(editCtx.folderIndex!==null){links[editCtx.folderIndex].items.push(newItem);refreshFolderWindow(editCtx.folderIndex);}
            else links.push(newItem);
        }
        saveAndRender(); wmClose(winId);
    });
    cn.addEventListener('click',function(){wmClose(winId);});
    const w=wmWindows[winId]; if(w)w.el.addEventListener('keydown',function(e){if(e.key==='Enter')sv.click();if(e.key==='Escape')wmClose(winId);});
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
        case 'search':     openSearch();     break; case 'notepad':    openNotepad();    break;
        case 'calculator': openCalculator(); break; case 'minesweeper':openMinesweeper();break;
        case 'settings':   openSettings();   break; case 'mycomputer': openSystemInfo(); break;
        case 'recycle':    openRecycleBin(); break; case 'setbg':      document.getElementById('bg-upload').click(); break;
        case 'removebg':   localStorage.removeItem(STORAGE.bg); applyBackground(); break;
        case 'export':     exportData();     break; case 'import':     document.getElementById('import-upload').click(); break;
        case 'shutdown':   openShutdownDialog(); break;
    }
}

// ==================== ALL PROGRAMS ====================
function openAllPrograms() {
    const panel = document.getElementById('sm-all-programs');
    const list  = document.getElementById('sm-programs-list');
    if (!panel || !list) return;
    list.innerHTML = '';
    links.forEach(function(item) {
        if (item.isFolder) {
            const hdr = document.createElement('div');
            hdr.className = 'sm-prog-folder-header';
            hdr.innerHTML =
                '<svg width="16" height="14" viewBox="0 0 48 40" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0">' +
                  '<path d="M2 8 L2 37 L46 37 L46 13 L22 13 L18 8 Z" fill="#f0c040" stroke="#c89828" stroke-width="1"/>' +
                  '<path d="M2 16 L46 16 L46 37 L2 37 Z" fill="#f8d860" stroke="#c89828" stroke-width="0.5"/>' +
                '</svg>' +
                '<span>' + escapeHtml(item.name) + '</span>';
            list.appendChild(hdr);
            (item.items || []).forEach(function(child) {
                list.appendChild(makeProgItem(child, true));
            });
        } else {
            list.appendChild(makeProgItem(item, false));
        }
    });
    panel.classList.remove('hidden');
}

function makeProgItem(item, inFolder) {
    const el = document.createElement('div');
    el.className = 'sm-prog-item' + (inFolder ? ' sm-prog-item-indent' : '');
    const fav = item.customIcon || getFaviconUrl(item.url);
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

// ==================== SETTINGS ====================
function openSettings() {
    if (wmWindows['settings']) { wmRestore('settings'); wmFocus('settings'); return; }
    const c=document.createElement('div'); c.className='settings-form';
    function mkR(label, key, min, max, sfx) {
        const g=document.createElement('div'); g.className='form-group';
        const l=document.createElement('label'); l.textContent=label+': ';
        const inp=document.createElement('input'); inp.type='range'; inp.min=min; inp.max=max; inp.step=(key==='opacity'?0.05:1); inp.value=settings[key];
        const vl=document.createElement('span'); vl.textContent=settings[key]+sfx;
        l.appendChild(inp); l.appendChild(vl); g.appendChild(l); c.appendChild(g);
        inp.addEventListener('input',function(){
            settings[key]=parseFloat(inp.value);
            vl.textContent=(key==='opacity'?Math.round(settings[key]*100):settings[key])+sfx;
            localStorage.setItem(STORAGE[key],settings[key]); renderDesktop();
        });
    }
    mkR('Ширина превью','tileWidth',80,300,'px'); mkR('Высота превью','tileHeight',50,300,'px'); mkR('Прозрачность','opacity',0,1,'%');
    const ug=document.createElement('div'); ug.className='form-group'; ug.innerHTML='<label>Имя пользователя: </label>';
    const uI=document.createElement('input'); uI.type='text'; uI.value=username; uI.style.width='120px';
    ug.querySelector('label').appendChild(uI); c.appendChild(ug);
    const rb=document.createElement('button'); rb.className='xp-dialog-btn'; rb.textContent='Сбросить фон'; rb.style.marginTop='8px'; c.appendChild(rb);
    wmCreate('settings','Свойства экрана',c,360,260,'\u2699\uFE0F');
    uI.addEventListener('change',function(){username=uI.value.trim()||'User';localStorage.setItem(STORAGE.username,username);const s=document.querySelector('.sm-username');if(s)s.textContent=username;});
    rb.addEventListener('click',function(){localStorage.removeItem(STORAGE.bg);applyBackground();});
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
    const c=document.createElement('div'); c.className='mines-window';
    c.innerHTML='<div class="mines-header"><div id="mines-counter" class="mines-lcd">010</div><button id="mines-smiley" class="mines-smiley">\uD83D\uDE42</button><div id="mines-timer" class="mines-lcd">000</div></div><div id="mines-grid" class="mines-grid"></div>';
    wmCreate('minesweeper','Сапёр',c,230,310,'\uD83D\uDCA3');
    setTimeout(function(){
        const R=9,C=9,M=10; let board,rev,flag,over,won,tint,secs,first;
        function setC(n){const e=document.getElementById('mines-counter');if(e)e.textContent=String(Math.max(0,n)).padStart(3,'0');}
        function setT(n){const e=document.getElementById('mines-timer');if(e)e.textContent=String(Math.min(999,n)).padStart(3,'0');}
        function start(){clearInterval(tint);secs=0;over=false;won=false;first=true;board=Array.from({length:R},function(){return Array(C).fill(0);});rev=Array.from({length:R},function(){return Array(C).fill(false);});flag=Array.from({length:R},function(){return Array(C).fill(false);});setC(M);setT(0);const sm=document.getElementById('mines-smiley');if(sm)sm.textContent='\uD83D\uDE42';rend();}
        function nb(r,c,fn){for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){if(!dr&&!dc)continue;const nr=r+dr,nc=c+dc;if(nr>=0&&nr<R&&nc>=0&&nc<C)fn(nr,nc);}}
        function place(ar,ac){let p=0;while(p<M){const r=Math.floor(Math.random()*R),c=Math.floor(Math.random()*C);if(board[r][c]!==-1&&!(r===ar&&c===ac)){board[r][c]=-1;p++;}}for(let r=0;r<R;r++)for(let c=0;c<C;c++){if(board[r][c]===-1)continue;let n=0;nb(r,c,function(nr,nc){if(board[nr][nc]===-1)n++;});board[r][c]=n;}}
        function reveal(r,c){if(rev[r][c]||flag[r][c])return;rev[r][c]=true;if(board[r][c]===0)nb(r,c,reveal);}
        function countF(){let f=0;flag.forEach(function(row){row.forEach(function(v){if(v)f++;});});return f;}
        function checkW(){for(let r=0;r<R;r++)for(let c=0;c<C;c++)if(board[r][c]!==-1&&!rev[r][c])return false;return true;}
        function rend(){const g=document.getElementById('mines-grid');if(!g)return;g.innerHTML='';for(let r=0;r<R;r++)for(let c=0;c<C;c++){const el=document.createElement('div');el.className='mines-cell';el.dataset.r=r;el.dataset.c=c;if(rev[r][c]){el.classList.add('revealed');if(board[r][c]===-1){el.classList.add('mine');el.textContent='\uD83D\uDCA3';}else if(board[r][c]>0){el.textContent=board[r][c];el.classList.add('num-'+board[r][c]);}}else if(flag[r][c]){el.classList.add('flagged');el.textContent='\uD83D\uDEA9';}g.appendChild(el);}}
        document.getElementById('mines-smiley').addEventListener('click',start);
        document.getElementById('mines-grid').addEventListener('click',function(e){const el=e.target.closest('.mines-cell');if(!el||over||won)return;const r=parseInt(el.dataset.r),c=parseInt(el.dataset.c);if(flag[r][c]||rev[r][c])return;if(first){first=false;place(r,c);tint=setInterval(function(){secs++;setT(secs);},1000);}if(board[r][c]===-1){over=true;rev[r][c]=true;clearInterval(tint);for(let rr=0;rr<R;rr++)for(let cc=0;cc<C;cc++)if(board[rr][cc]===-1)rev[rr][cc]=true;rend();const sm=document.getElementById('mines-smiley');if(sm)sm.textContent='\uD83D\uDE35';return;}reveal(r,c);rend();if(checkW()){won=true;clearInterval(tint);const sm=document.getElementById('mines-smiley');if(sm)sm.textContent='\uD83D\uDE0E';}});
        document.getElementById('mines-grid').addEventListener('contextmenu',function(e){e.stopPropagation();const el=e.target.closest('.mines-cell');if(!el||over||won)return;const r=parseInt(el.dataset.r),c=parseInt(el.dataset.c);if(rev[r][c])return;flag[r][c]=!flag[r][c];setC(M-countF());rend();});
        start();
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

// ==================== GLOBAL CLICK / KEY LISTENERS ====================
document.getElementById('start-btn').addEventListener('click', function(e) { e.stopPropagation(); toggleStartMenu(); });
document.querySelectorAll('.sm-item').forEach(function(el) { el.addEventListener('click', function() { startMenuAction(el.dataset.action); }); });
document.querySelector('.sm-shutdown-btn').addEventListener('click', function() { startMenuAction('shutdown'); });
document.addEventListener('click', function(e) {
    if (!e.target.closest('#context-menu')) hideContextMenu();
    if (!e.target.closest('#start-menu') && !e.target.closest('#start-btn')) closeStartMenu();
});
document.addEventListener('keydown', function(e) { if (e.key==='Escape') { hideContextMenu(); closeStartMenu(); } });

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
    renderDesktop();
    updateClock();
    setInterval(updateClock, 1000);
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
