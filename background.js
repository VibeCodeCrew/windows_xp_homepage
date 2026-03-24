chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'capture_screenshot') {
        captureTab(message.url, sendResponse);
        return true; 
    }
});

async function captureTab(url, sendResponse) {
    try {
        // Создаем невидимое окно за пределами экрана
        const win = await chrome.windows.create({
            url: url,
            left: -10000,
            top: -10000,
            width: 1024,
            height: 768,
            type: 'popup',
            focused: false // Не отбираем фокус у пользователя
        });

        const targetTabId = win.tabs[0].id;

        let captureStarted = false;
        async function doCapture() {
            if (captureStarted) return;
            captureStarted = true;
            try {
                // Ждем 2.5 секунды, чтобы тяжелые сайты (SPA) точно отрендерились
                await new Promise(resolve => setTimeout(resolve, 2500));

                // Переносим окно в видимую зону, чтобы заставить Chrome отрисовать страницу
                await chrome.windows.update(win.id, { left: 0, top: 0, focused: true });
                await new Promise(resolve => setTimeout(resolve, 500)); // Даем время на рендеринг

                const dataUrl = await chrome.tabs.captureVisibleTab(win.id, { format: 'jpeg', quality: 50 });

                // Сжимаем картинку
                const compressedBase64 = await resizeImage(dataUrl, 300, 218);

                // Убираем следы
                chrome.windows.remove(win.id).catch(() => {});
                sendResponse({ success: true, dataUrl: compressedBase64 });
            } catch (e) {
                chrome.windows.remove(win.id).catch(() => {});
                sendResponse({ success: false, error: e.message });
            }
        }

        // Предохранитель: если страница грузится слишком долго (более 15 секунд)
        const fallbackTimer = setTimeout(() => {
            chrome.tabs.onUpdated.removeListener(onUpdated);
            chrome.windows.remove(win.id).catch(() => {});
            try {
                sendResponse({ success: false, error: 'Timeout: страница грузилась слишком долго' });
            } catch (e) {} // Игнорируем ошибку, если порт уже закрыт
        }, 15000);

        const onUpdated = (tabId, info) => {
            if (tabId === targetTabId && info.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(onUpdated);
                clearTimeout(fallbackTimer);
                doCapture();
            }
        };

        chrome.tabs.onUpdated.addListener(onUpdated);

        // Проверяем, не загрузилась ли страница ДО регистрации слушателя (race condition fix)
        const tab = await chrome.tabs.get(targetTabId);
        if (tab.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(onUpdated);
            clearTimeout(fallbackTimer);
            doCapture();
        }
    } catch (e) {
        sendResponse({ success: false, error: e.message });
    }
}

// Вспомогательная функция для ресайза
async function resizeImage(base64, width, height) {
    const response = await fetch(base64);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, width, height);
    
    const resultBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.7 });
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(resultBlob);
    });
}