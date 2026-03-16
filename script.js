function updateClock() {
    const now = new Date();
    document.getElementById('time').textContent = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    document.getElementById('date').textContent = now.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
}
setInterval(updateClock, 1000);
updateClock();

document.getElementById('search-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const query = document.getElementById('search-input').value;
    if (query) window.location.href = `https://yandex.ru/search/?text=${encodeURIComponent(query)}`;
});

function applyBackground() {
    const customBg = localStorage.getItem('edge_custom_bg');
    if (customBg) {
        document.body.style.backgroundImage = `url('${customBg}')`;
    } else {
        document.body.style.backgroundImage = 'none';
    }
}

document.getElementById('upload-bg-btn').addEventListener('click', () => document.getElementById('bg-upload').click());

document.getElementById('bg-upload').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = event => {
            localStorage.setItem('edge_custom_bg', event.target.result);
            applyBackground();
        };
        reader.readAsDataURL(file);
    }
});
applyBackground();

let cols = localStorage.getItem('edge_cols') || 4;
let tileWidth = localStorage.getItem('edge_tile_width') || 120;
let tileHeight = localStorage.getItem('edge_tile_height') || 100;
let tileOpacity = localStorage.getItem('edge_tile_opacity') || 0.9;
let tileBlur = localStorage.getItem('edge_tile_blur') === 'true';

function applyGridSettings() {
    document.documentElement.style.setProperty('--cols', cols);
    document.documentElement.style.setProperty('--tile-width', `${tileWidth}px`);
    document.documentElement.style.setProperty('--tile-height', `${tileHeight}px`);
    document.documentElement.style.setProperty('--tile-opacity', tileOpacity);
    document.documentElement.style.setProperty('--tile-blur', tileBlur ? '10px' : '0px');
    
    document.getElementById('grid-cols-input').value = cols;
    document.getElementById('tile-width-input').value = tileWidth;
    document.getElementById('tile-height-input').value = tileHeight;
    document.getElementById('tile-opacity-input').value = tileOpacity;
    document.getElementById('tile-blur-input').checked = tileBlur;
}
applyGridSettings();

const settingsModal = document.getElementById('settings-modal');
document.getElementById('settings-btn').addEventListener('click', () => settingsModal.classList.remove('hidden'));
document.getElementById('close-settings-btn').addEventListener('click', () => settingsModal.classList.add('hidden'));

document.getElementById('grid-cols-input').addEventListener('input', (e) => {
    cols = e.target.value;
    localStorage.setItem('edge_cols', cols);
    applyGridSettings();
});

document.getElementById('tile-width-input').addEventListener('input', (e) => {
    tileWidth = e.target.value;
    localStorage.setItem('edge_tile_width', tileWidth);
    applyGridSettings();
});

document.getElementById('tile-height-input').addEventListener('input', (e) => {
    tileHeight = e.target.value;
    localStorage.setItem('edge_tile_height', tileHeight);
    applyGridSettings();
});

document.getElementById('tile-opacity-input').addEventListener('input', (e) => {
    tileOpacity = e.target.value;
    localStorage.setItem('edge_tile_opacity', tileOpacity);
    applyGridSettings();
});

document.getElementById('tile-blur-input').addEventListener('change', (e) => {
    tileBlur = e.target.checked;
    localStorage.setItem('edge_tile_blur', tileBlur);
    applyGridSettings();
});

document.getElementById('export-btn').addEventListener('click', () => {
    const data = {
        edge_tiles: localStorage.getItem('edge_tiles'),
        edge_cols: localStorage.getItem('edge_cols'),
        edge_tile_width: localStorage.getItem('edge_tile_width'),
        edge_tile_height: localStorage.getItem('edge_tile_height'),
        edge_tile_opacity: localStorage.getItem('edge_tile_opacity'),
        edge_tile_blur: localStorage.getItem('edge_tile_blur'),
        edge_custom_bg: localStorage.getItem('edge_custom_bg')
    };
    
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'edge_startpage_backup.json';
    a.click();
    URL.revokeObjectURL(url);
});

document.getElementById('import-btn').addEventListener('click', () => {
    document.getElementById('import-upload').click();
});

document.getElementById('import-upload').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const data = JSON.parse(event.target.result);
            if (data.edge_tiles) localStorage.setItem('edge_tiles', data.edge_tiles);
            if (data.edge_cols) localStorage.setItem('edge_cols', data.edge_cols);
            if (data.edge_tile_width) localStorage.setItem('edge_tile_width', data.edge_tile_width);
            if (data.edge_tile_height) localStorage.setItem('edge_tile_height', data.edge_tile_height);
            if (data.edge_tile_opacity) localStorage.setItem('edge_tile_opacity', data.edge_tile_opacity);
            if (data.edge_tile_blur) localStorage.setItem('edge_tile_blur', data.edge_tile_blur);
            if (data.edge_custom_bg) localStorage.setItem('edge_custom_bg', data.edge_custom_bg);
            
            location.reload();
        } catch (err) {
            alert('ошибка при чтении файла');
        }
    };
    reader.readAsText(file);
    e.target.value = '';
});

let links = JSON.parse(localStorage.getItem('edge_tiles')) || [
    { name: 'Яндекс', url: 'https://ya.ru' },
    { name: 'YouTube', url: 'https://youtube.com' }
];

let targetTileIndex = null;
let targetChildIndex = null;
let editContext = { tileIndex: null, childIndex: null };

const modal = document.getElementById('modal');
const contextMenu = document.getElementById('context-menu');
const isFolderCb = document.getElementById('is-folder-checkbox');
const urlContainer = document.getElementById('url-container');

function saveAndRender() {
    localStorage.setItem('edge_tiles', JSON.stringify(links));
    renderTiles();
}

isFolderCb.addEventListener('change', (e) => {
    urlContainer.style.display = e.target.checked ? 'none' : 'flex';
});

document.addEventListener('click', (e) => {
    if (!e.target.closest('#context-menu')) contextMenu.classList.add('hidden');
});

function showContextMenu(e, isFolder, isChild) {
    document.querySelectorAll('.link-only').forEach(node => {
        node.style.display = (isFolder && !isChild) ? 'none' : 'block';
    });
    
    document.getElementById('menu-move-root').style.display = isChild ? 'block' : 'none';

    let x = e.pageX;
    let y = e.pageY;
    if (x + 240 > window.innerWidth) x = window.innerWidth - 240;
    if (y + 250 > window.innerHeight) y = window.innerHeight - 250;
    
    contextMenu.style.left = `${x}px`;
    contextMenu.style.top = `${y}px`;
    contextMenu.classList.remove('hidden');
}

function renderTiles() {
    const grid = document.getElementById('grid-container');
    grid.innerHTML = '';
    
    links.forEach((item, index) => {
        if (item.isFolder) {
            const folderEl = document.createElement('div');
            folderEl.className = 'tile folder-widget';
            folderEl.draggable = true;
            
            if (item.colSpan) folderEl.style.gridColumn = `span ${item.colSpan}`;
            if (item.rowSpan) folderEl.style.gridRow = `span ${item.rowSpan}`;
            
            folderEl.innerHTML = `<div class="folder-title">${item.name}</div>`;
            const listEl = document.createElement('div');
            listEl.className = 'folder-items-container';
            
            item.items.forEach((child, childIndex) => {
                const a = document.createElement('a');
                a.href = child.url;
                a.className = 'mini-link';
                
                a.addEventListener('dragstart', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                });
                
                try {
                    const domain = new URL(child.url).hostname;
                    const iconUrl = child.customIcon || `https://favicon.yandex.net/favicon/${domain}?size=32`;
                    a.innerHTML = `<img src="${iconUrl}" alt="${child.name}"><span>${child.name}</span>`;
                } catch (e) {
                    a.innerHTML = `<img src="" alt="${child.name}"><span>${child.name}</span>`;
                }
                
                a.addEventListener('click', (e) => {
                    if (folderEl.classList.contains('dragging')) e.preventDefault();
                });

                a.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    targetTileIndex = index;
                    targetChildIndex = childIndex;
                    showContextMenu(e, false, true);
                });
                
                listEl.appendChild(a);
            });
            
            folderEl.appendChild(listEl);
            
            const resizer = document.createElement('div');
            resizer.className = 'resize-handle';
            
            resizer.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                folderEl.draggable = false;
                
                const startX = e.clientX;
                const startY = e.clientY;
                const startColSpan = item.colSpan || 1;
                const startRowSpan = item.rowSpan || 1;
                
                const baseW = parseInt(tileWidth);
                const baseH = parseInt(tileHeight);
                const gap = 12;
                
                let newColSpan = startColSpan;
                let newRowSpan = startRowSpan;
                
                const mouseMoveHandler = (moveEvent) => {
                    const dx = moveEvent.clientX - startX;
                    const dy = moveEvent.clientY - startY;
                    
                    newColSpan = Math.max(1, startColSpan + Math.round(dx / (baseW + gap)));
                    newRowSpan = Math.max(1, startRowSpan + Math.round(dy / (baseH + gap)));
                    
                    folderEl.style.gridColumn = `span ${newColSpan}`;
                    folderEl.style.gridRow = `span ${newRowSpan}`;
                };
                
                const mouseUpHandler = () => {
                    document.removeEventListener('mousemove', mouseMoveHandler);
                    document.removeEventListener('mouseup', mouseUpHandler);
                    folderEl.draggable = true;

                    if (newColSpan !== startColSpan || newRowSpan !== startRowSpan) {
                        item.colSpan = newColSpan;
                        item.rowSpan = newRowSpan;
                        saveAndRender();
                    }
                };
                
                document.addEventListener('mousemove', mouseMoveHandler);
                document.addEventListener('mouseup', mouseUpHandler);
            });
            
            folderEl.appendChild(resizer);

            folderEl.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                targetTileIndex = index;
                targetChildIndex = null;
                showContextMenu(e, true, false);
            });
            
            folderEl.addEventListener('dragstart', () => {
                targetTileIndex = index;
                targetChildIndex = null;
                setTimeout(() => folderEl.classList.add('dragging'), 0);
            });
            
            folderEl.addEventListener('dragend', () => folderEl.classList.remove('dragging'));
            folderEl.addEventListener('dragover', (e) => {
                if (targetChildIndex !== null) return;
                e.preventDefault();
                folderEl.classList.add('drag-over');
            });
            folderEl.addEventListener('dragleave', () => folderEl.classList.remove('drag-over'));
            
            folderEl.addEventListener('drop', (e) => {
                e.preventDefault();
                folderEl.classList.remove('drag-over');
                
                if (targetTileIndex === null || targetTileIndex === index || targetChildIndex !== null) return;
                
                const draggedItem = links[targetTileIndex];
                
                if (!draggedItem.isFolder) {
                    links.splice(targetTileIndex, 1);
                    item.items.push(draggedItem);
                } else {
                    const itemToMove = links.splice(targetTileIndex, 1)[0];
                    links.splice(index, 0, itemToMove);
                }
                saveAndRender();
            });

            grid.appendChild(folderEl);
            
        } else {
            const el = document.createElement('a');
            el.className = 'tile';
            el.href = item.url;
            el.draggable = true;
            el.title = item.name;
            
            try {
                const domain = new URL(item.url).hostname;
                const iconUrl = item.customIcon || `https://favicon.yandex.net/favicon/${domain}?size=120`;
                el.innerHTML = `<img src="${iconUrl}" alt="${item.name}"><span>${item.name}</span>`;
            } catch (e) {
                el.innerHTML = `<img src="" alt="${item.name}"><span>${item.name}</span>`;
            }
            
            el.addEventListener('click', (e) => {
                if (el.classList.contains('dragging')) {
                    e.preventDefault();
                    return;
                }
                if (!/^https?:\/\//i.test(item.url)) {
                    e.preventDefault();
                    if (typeof chrome !== 'undefined' && chrome.tabs) {
                        chrome.tabs.update({ url: item.url });
                    }
                }
            });
            
            el.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                targetTileIndex = index;
                targetChildIndex = null;
                showContextMenu(e, false, false);
            });

            el.addEventListener('dragstart', () => {
                targetTileIndex = index;
                targetChildIndex = null;
                setTimeout(() => el.classList.add('dragging'), 0);
            });
            
            el.addEventListener('dragend', () => el.classList.remove('dragging'));
            el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('drag-over'); });
            el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
            
            el.addEventListener('drop', (e) => {
                e.preventDefault();
                el.classList.remove('drag-over');
                
                if (targetTileIndex === null || targetTileIndex === index || targetChildIndex !== null) return;
                
                const itemToMove = links.splice(targetTileIndex, 1)[0];
                links.splice(index, 0, itemToMove);
                saveAndRender();
            });

            grid.appendChild(el);
        }
    });
    
    const addBtn = document.createElement('div');
    addBtn.className = 'tile add-tile';
    addBtn.textContent = '+';
    addBtn.addEventListener('click', () => {
        editContext = { tileIndex: null, childIndex: null };
        document.getElementById('tile-name').value = '';
        document.getElementById('tile-url').value = '';
        document.getElementById('tile-icon').value = '';
        
        isFolderCb.checked = false;
        isFolderCb.disabled = false;
        urlContainer.style.display = 'flex';
        document.getElementById('folder-checkbox-wrapper').style.display = 'flex';
            
        modal.classList.remove('hidden');
    });
    grid.appendChild(addBtn);
}
renderTiles();

function getTargetUrl() {
    return targetChildIndex !== null ? 
        links[targetTileIndex].items[targetChildIndex].url : 
        links[targetTileIndex].url;
}

document.getElementById('menu-new-tab').addEventListener('click', () => {
    window.open(getTargetUrl(), '_blank');
    contextMenu.classList.add('hidden');
});

document.getElementById('menu-new-window').addEventListener('click', () => {
    if (typeof chrome !== 'undefined' && chrome.windows) {
        chrome.windows.create({ url: getTargetUrl() });
    } else {
        window.open(getTargetUrl(), '_blank');
    }
    contextMenu.classList.add('hidden');
});

document.getElementById('menu-incognito').addEventListener('click', () => {
    if (typeof chrome !== 'undefined' && chrome.windows) {
        chrome.windows.create({ url: getTargetUrl(), incognito: true });
    } else {
        window.open(getTargetUrl(), '_blank');
    }
    contextMenu.classList.add('hidden');
});

document.getElementById('menu-edit').addEventListener('click', () => {
    editContext.tileIndex = targetTileIndex;
    editContext.childIndex = targetChildIndex;
    
    let item;
    if (targetChildIndex !== null) {
        item = links[targetTileIndex].items[targetChildIndex];
        isFolderCb.checked = false;
    } else {
        item = links[targetTileIndex];
        isFolderCb.checked = !!item.isFolder;
    }
    
    document.getElementById('tile-name').value = item.name;
    
    if (item.isFolder) {
        urlContainer.style.display = 'none';
    } else {
        urlContainer.style.display = 'flex';
        document.getElementById('tile-url').value = item.url;
        document.getElementById('tile-icon').value = item.customIcon || '';
    }
    
    isFolderCb.disabled = true;
    document.getElementById('folder-checkbox-wrapper').style.display = 'flex';
    
    modal.classList.remove('hidden');
    contextMenu.classList.add('hidden');
});

document.getElementById('menu-move-root').addEventListener('click', () => {
    const item = links[targetTileIndex].items.splice(targetChildIndex, 1)[0];
    links.push(item);
    saveAndRender();
    contextMenu.classList.add('hidden');
});

document.getElementById('menu-delete').addEventListener('click', () => {
    if (targetChildIndex !== null) {
        links[targetTileIndex].items.splice(targetChildIndex, 1);
    } else {
        links.splice(targetTileIndex, 1);
    }
    saveAndRender();
    contextMenu.classList.add('hidden');
});

document.getElementById('close-modal-btn').addEventListener('click', () => modal.classList.add('hidden'));

document.getElementById('save-tile-btn').addEventListener('click', () => {
    const name = document.getElementById('tile-name').value;
    let url = document.getElementById('tile-url').value;
    const customIcon = document.getElementById('tile-icon').value;
    const isFolder = isFolderCb.checked;
    
    if (!name) return;
    
    let newItem;
    if (isFolder) {
        newItem = { isFolder: true, name, items: [] };
    } else {
        if (!url) return;
        if (!/^[a-z][a-z0-9+\-.]*:\/\//i.test(url)) url = 'https://' + url;
        newItem = { name, url };
        if (customIcon) newItem.customIcon = customIcon;
    }

    if (editContext.tileIndex !== null) {
        if (editContext.childIndex !== null) {
            links[editContext.tileIndex].items[editContext.childIndex] = newItem;
        } else {
            if (isFolder) newItem.items = links[editContext.tileIndex].items;
            links[editContext.tileIndex] = newItem;
        }
    } else {
        links.push(newItem);
    }
    
    saveAndRender();
    modal.classList.add('hidden');
});