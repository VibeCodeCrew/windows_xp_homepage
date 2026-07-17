// ==================== DOOM — загрузчик WASM-порта ====================
// Движок: doom.wasm (doomgeneric, jacobenget/doom.wasm, GPL-2.0).
// Внутри модуля уже зашит shareware DOOM1.WAD, внешние WAD не нужны.
// Интерфейс модуля: 10 импортов / 4 экспорта (initGame, tickGame,
// reportKeyDown, reportKeyUp) + экспортируемая память и KEY_*-константы.
// Порт не поддерживает звук и сохранения — только клавиатуру.

(function () {
    var canvas  = document.getElementById('doom');
    var overlay = document.getElementById('doom-overlay');
    var ctx     = canvas.getContext('2d');

    var wasmMemory = null;   // WebAssembly.Memory модуля (заполняется после инстанцирования)
    var imageData  = null;   // переиспользуемый буфер кадра для putImageData

    // ---------------- Импорты, которые ожидает модуль ----------------

    // Doom сообщает размер своего кадрового буфера — подгоняем canvas 1:1
    function onGameInit(width, height) {
        canvas.width  = width;
        canvas.height = height;
        imageData = ctx.createImageData(width, height);
    }

    // Кадр готов: пиксели лежат в памяти модуля как BGRA (little-endian ARGB)
    function drawFrame(frameBufferPtr) {
        if (!imageData) return;
        var src = new Uint8Array(wasmMemory.buffer, frameBufferPtr, canvas.width * canvas.height * 4);
        var dst = imageData.data;
        for (var i = 0; i < src.length; i += 4) {
            dst[i]     = src[i + 2]; // R
            dst[i + 1] = src[i + 1]; // G
            dst[i + 2] = src[i];     // B
            dst[i + 3] = 255;        // A
        }
        ctx.putImageData(imageData, 0, 0);
    }

    // Игровое время отделено от реального: после восстановления снапшота
    // сдвигаем timeOffsetMs так, чтобы для движка время продолжилось с
    // сохранённого момента — иначе скачок реального времени заставил бы
    // игру «прокрутить» все пропущенные тики разом.
    var gameTimeMs   = 0; // последнее время, отданное движку
    var timeOffsetMs = 0; // performance.now() минус игровое время

    function timeInMilliseconds() {
        gameTimeMs = performance.now() - timeOffsetMs;
        return BigInt(Math.trunc(gameTimeMs));
    }

    function readUtf8(ptr, len) {
        var bytes = new Uint8Array(wasmMemory.buffer, ptr, len);
        return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    }

    var imports = {
        loading: {
            onGameInit: onGameInit,
            // WAD не передаём — модуль загрузит встроенный shareware DOOM1.WAD
            wadSizes: function () {},
            readWads: function () {}
        },
        ui: { drawFrame: drawFrame },
        runtimeControl: { timeInMilliseconds: timeInMilliseconds },
        console: {
            onInfoMessage:  function (ptr, len) { console.log('[DOOM]', readUtf8(ptr, len)); },
            onErrorMessage: function (ptr, len) { console.error('[DOOM]', readUtf8(ptr, len)); }
        },
        gameSaving: {
            // Сохранения не поддерживаются портом — заглушки по интерфейсу
            sizeOfSaveGame: function () { return 0; },
            readSaveGame:   function () { return 0; },
            writeSaveGame:  function () { return 0; }
        }
    };

    // ---------------- Клавиатура ----------------
    // Маппинг по event.code, а не event.key — раскладка (RU/EN) не влияет.

    var exportsRef = null;

    // Специальные клавиши → имена экспортируемых KEY_*-констант
    var CODE_TO_KEY_CONST = {
        ArrowLeft: 'KEY_LEFTARROW', ArrowRight: 'KEY_RIGHTARROW',
        ArrowUp: 'KEY_UPARROW',     ArrowDown: 'KEY_DOWNARROW',
        Comma: 'KEY_STRAFE_L',      Period: 'KEY_STRAFE_R',
        ControlLeft: 'KEY_FIRE',    ControlRight: 'KEY_FIRE',
        Space: 'KEY_USE',
        ShiftLeft: 'KEY_SHIFT',     ShiftRight: 'KEY_SHIFT',
        Tab: 'KEY_TAB',             Escape: 'KEY_ESCAPE',
        Enter: 'KEY_ENTER',         NumpadEnter: 'KEY_ENTER',
        Backspace: 'KEY_BACKSPACE',
        AltLeft: 'KEY_ALT',         AltRight: 'KEY_ALT'
    };

    // Код клавиши Doom: константа для спецклавиш, иначе ASCII для
    // цифр (оружие 1–7) и букв (Y/N в меню подтверждений и т.п.)
    function doomKeyFromEvent(e) {
        if (!exportsRef) return null;
        var constName = CODE_TO_KEY_CONST[e.code];
        if (constName) return exportsRef[constName];
        var m = /^Digit(\d)$/.exec(e.code);
        if (m) return m[1].charCodeAt(0);
        m = /^Key([A-Z])$/.exec(e.code);
        if (m) return m[1].toLowerCase().charCodeAt(0);
        return null;
    }

    var pressedKeys = new Set(); // doomKey'и, нажатые в данный момент

    function onKeyDown(e) {
        var doomKey = doomKeyFromEvent(e);
        if (doomKey === null) return;
        e.preventDefault();
        e.stopPropagation();
        if (pressedKeys.has(doomKey)) return; // игнорируем автоповтор
        pressedKeys.add(doomKey);
        exportsRef.reportKeyDown(doomKey);
    }

    function onKeyUp(e) {
        var doomKey = doomKeyFromEvent(e);
        if (doomKey === null) return;
        e.preventDefault();
        e.stopPropagation();
        pressedKeys.delete(doomKey);
        exportsRef.reportKeyUp(doomKey);
    }

    // Отпустить все клавиши (защита от «залипания» при потере фокуса)
    function releaseAllKeys() {
        if (!exportsRef) return;
        pressedKeys.forEach(function (k) { exportsRef.reportKeyUp(k); });
        pressedKeys.clear();
    }

    // ---------------- Автосохранение (savestate) ----------------
    // Снапшот всей линейной памяти WASM — точный «сейвстейт»: после
    // переоткрытия окна игра продолжается ровно с того же места, без меню.
    // Храним в chrome.storage.local (gzip + base64, как скриншоты сайтов).
    // Снимаем каждые SNAPSHOT_INTERVAL_MS игры и при потере фокуса: клик
    // по крестику XP-окна сначала отдаёт blur в iframe, поэтому финальный
    // снапшот успевает сохраниться до удаления окна из DOM.

    var SAVE_KEY = 'doom_savestate';
    var SNAPSHOT_INTERVAL_MS = 10000;
    var lastSnapshotAt = 0;

    function gzipBytes(u8) {
        return new Response(
            new Blob([u8]).stream().pipeThrough(new CompressionStream('gzip'))
        ).arrayBuffer();
    }

    function gunzipBytes(buf) {
        return new Response(
            new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))
        ).arrayBuffer();
    }

    function u8ToBase64(u8) {
        var s = '';
        for (var i = 0; i < u8.length; i += 0x8000) {
            s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
        }
        return btoa(s);
    }

    function base64ToU8(b64) {
        var s = atob(b64);
        var u8 = new Uint8Array(s.length);
        for (var i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
        return u8;
    }

    // Синхронно копируем память, дальше сжатие и запись — асинхронно
    function takeSnapshot() {
        if (!exportsRef || !wasmMemory) return;
        lastSnapshotAt = performance.now();
        var meta = { v: 1, w: canvas.width, h: canvas.height, gameTime: gameTimeMs };
        var copy = new Uint8Array(wasmMemory.buffer).slice();
        gzipBytes(copy).then(function (packed) {
            meta.data = u8ToBase64(new Uint8Array(packed));
            chrome.storage.local.set({ doom_savestate: meta });
        }).catch(function (err) {
            console.warn('[DOOM] Не удалось сохранить снапшот:', err);
        });
    }

    // Читаем снапшот из хранилища; нет или битый — null
    function loadSnapshot() {
        return new Promise(function (resolve) {
            try {
                chrome.storage.local.get(SAVE_KEY, function (res) {
                    var meta = res && res[SAVE_KEY];
                    if (!meta || !meta.data) { resolve(null); return; }
                    gunzipBytes(base64ToU8(meta.data).buffer)
                        .then(function (buf) { resolve({ w: meta.w, h: meta.h, gameTime: meta.gameTime, bytes: new Uint8Array(buf) }); })
                        .catch(function () { resolve(null); });
                });
            } catch (e) { resolve(null); }
        });
    }

    function clearSnapshot() {
        try { chrome.storage.local.remove(SAVE_KEY); } catch (e) {}
    }

    // ---------------- Автопауза ----------------
    // Игра крутится только пока iframe в фокусе: иначе Doom гонял бы
    // тики в фоне и жрал CPU, пока пользователь смотрит другие окна.

    var TICK_MS = 1000 / 35; // классические 35 fps Doom

    function tick() {
        if (!exportsRef || !document.hasFocus()) return;
        exportsRef.tickGame();
        // Периодический снапшот, пока игра идёт
        if (performance.now() - lastSnapshotAt > SNAPSHOT_INTERVAL_MS) takeSnapshot();
    }

    function showOverlay(text) { overlay.textContent = text; overlay.hidden = false; }
    function hideOverlay()     { overlay.hidden = true; }

    function handleBlur() {
        releaseAllKeys();
        takeSnapshot(); // финальный снапшот: клик по кнопкам окна = blur
        showOverlay('Пауза — кликните, чтобы продолжить');
    }

    function handleFocus() {
        releaseAllKeys(); // на всякий случай чистим рассинхрон состояний
        hideOverlay();
    }

    // ---------------- Запуск ----------------

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    // Клик по игре возвращает фокус (и снимает паузу)
    document.addEventListener('mousedown', function () { canvas.focus(); });
    document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    // Снапшот при сворачивании вкладки и при выгрузке iframe (best effort)
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') takeSnapshot();
    });
    window.addEventListener('pagehide', takeSnapshot);

    setInterval(tick, TICK_MS);

    WebAssembly.instantiateStreaming(fetch('assets/doom.wasm'), imports)
        .then(function (result) {
            var exports = result.instance.exports;
            wasmMemory = exports.memory;

            // Обычный запуск: инициализация игры с нуля
            function startFresh() {
                exports.initGame();
                exportsRef = exports;
                showOverlay('Кликните, чтобы играть');
            }

            return loadSnapshot().then(function (snap) {
                if (snap) {
                    try {
                        // Память могла вырасти сверх стартового минимума
                        var needPages = Math.ceil(snap.bytes.length / 65536);
                        var curPages  = wasmMemory.buffer.byteLength / 65536;
                        if (needPages > curPages) wasmMemory.grow(needPages - curPages);
                        new Uint8Array(wasmMemory.buffer).set(snap.bytes);

                        // initGame НЕ вызываем: снапшот уже содержит всё состояние,
                        // включая размер кадрового буфера и момент игрового времени
                        canvas.width = snap.w; canvas.height = snap.h;
                        imageData = ctx.createImageData(snap.w, snap.h);
                        timeOffsetMs = performance.now() - snap.gameTime;
                        gameTimeMs = snap.gameTime;
                        exportsRef = exports;
                        showOverlay('Сохранение восстановлено — кликните, чтобы играть');
                    } catch (e) {
                        console.warn('[DOOM] Снапшот повреждён, начинаем заново:', e);
                        clearSnapshot();
                        startFresh();
                    }
                } else {
                    startFresh();
                }
                canvas.focus();
                if (document.hasFocus()) hideOverlay();
            });
        })
        .catch(function (err) {
            console.error('[DOOM] Ошибка загрузки doom.wasm:', err);
            showOverlay('Не удалось загрузить DOOM :(');
        });
})();
