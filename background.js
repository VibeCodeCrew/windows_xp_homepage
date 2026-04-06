сchrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'capture_screenshot') {
        captureTab(message.url, sendResponse);
        return true;
    }
    if (message.action === 'fetch_page_title') {
        fetchPageTitle(message.url, sendResponse);
        return true;
    }
});

async function fetchPageTitle(url, sendResponse) {
    try {
        const resp = await fetch(url, { headers: { 'Accept': 'text/html' } });
        if (!resp.ok) { sendResponse({ success: false }); return; }
        const html = await resp.text();
        const match = html.match(/<title[^>]*>([^<]{1,200})<\/title>/i);
        if (!match) { sendResponse({ success: false }); return; }
        const title = match[1].trim()
            .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n));
        sendResponse({ success: true, title });
    } catch (e) {
        sendResponse({ success: false });
    }
}

// Проверяем, можно ли вообще делать скриншот/fetch для данного URL
function isCapturableUrl(url) {
    try {
        const u = new URL(url);
        // Только http/https
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
        // Магазины расширений — запрещено браузером
        if (u.hostname === 'chrome.google.com' && u.pathname.startsWith('/webstore')) return false;
        if (u.hostname === 'microsoftedge.microsoft.com' && u.pathname.startsWith('/addons')) return false;
        if (u.hostname === 'addons.mozilla.org') return false;
        return true;
    } catch (e) {
        return false;
    }
}

async function captureTab(url, sendResponse) {
    // Ранний выход для URL, которые браузер запрещает захватывать
    if (!isCapturableUrl(url)) {
        sendResponse({ success: false, error: 'URL не поддерживает захват миниатюры' });
        return;
    }

    // Скриншот через popup-окно
    try {
        const win = await chrome.windows.create({
            url: url,
            left: 0,
            top: 0,
            width: 1024,
            height: 768,
            type: 'popup',
            focused: false
        });

        const targetTabId = win.tabs[0].id;
        let captured = false;

        const doCapture = async () => {
            if (captured) return;
            captured = true;
            clearTimeout(fallbackTimer);
            chrome.tabs.onUpdated.removeListener(onUpdated);

            // Ждём рендеринг SPA-сайтов
            setTimeout(async () => {
                try {
                    await chrome.windows.update(win.id, { focused: true });
                    await new Promise(resolve => setTimeout(resolve, 500));

                    const dataUrl = await chrome.tabs.captureVisibleTab(win.id, { format: 'jpeg', quality: 50 });
                    const compressedBase64 = await resizeImage(dataUrl, 300, 218);

                    chrome.windows.remove(win.id).catch(() => {});
                    sendResponse({ success: true, dataUrl: compressedBase64 });
                } catch (e) {
                    chrome.windows.remove(win.id).catch(() => {});
                    sendResponse({ success: false, error: e.message });
                }
            }, 2500);
        };

        const fallbackTimer = setTimeout(() => {
            chrome.tabs.onUpdated.removeListener(onUpdated);
            if (!captured) {
                captured = true;
                chrome.windows.remove(win.id).catch(() => {});
                try { sendResponse({ success: false, error: 'Timeout' }); } catch (e) {}
            }
        }, 15000);

        const onUpdated = (tabId, info) => {
            if (tabId === targetTabId && info.status === 'complete') doCapture();
        };

        chrome.tabs.onUpdated.addListener(onUpdated);

        // Race condition fix: если таб уже загрузился до того, как мы повесили слушатель
        chrome.tabs.get(targetTabId).then(tab => {
            if (tab.status === 'complete') doCapture();
        }).catch(() => {});
    } catch (e) {
        sendResponse({ success: false, error: e.message });
    }
}

// Ресайз картинки в нужный размер и формат
async function resizeImage(src, width, height) {
    const response = await fetch(src);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Вписываем с сохранением пропорций (cover)
    const scale = Math.max(width / bitmap.width, height / bitmap.height);
    const sw = bitmap.width * scale;
    const sh = bitmap.height * scale;
    const sx = (width - sw) / 2;
    const sy = (height - sh) / 2;
    ctx.drawImage(bitmap, sx, sy, sw, sh);
    bitmap.close();

    const resultBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.7 });
    const buffer = await resultBlob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return 'data:image/jpeg;base64,' + btoa(binary);
}
