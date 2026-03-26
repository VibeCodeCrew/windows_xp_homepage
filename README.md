# Nostalgic Startpage — Windows XP New Tab

A Chrome / Edge extension that replaces the new tab page with a fully functional Windows XP-style desktop.

---

## English

### Description

Nostalgic Startpage turns every new browser tab into a nostalgic Windows XP desktop. Add shortcuts to your favourite sites, organise them into folders, and use the built-in XP-style apps — all without leaving the browser.

### Features

**Desktop & Shortcuts**
- Three view modes: **Tiles** (glass grid), **Thumbnails** (XP window tiles), **Icons** (classic desktop icons)
- Create, rename, move and delete shortcuts and folders
- Drag-and-drop reordering
- Custom icons and live-fetched page thumbnails (screenshots)
- Rubber-band multi-select
- Custom or solid-colour wallpaper

**Start Menu**
- Classic two-column XP Start Menu
- All Programs panel with collapsible folders: Games and Programs (mirrors desktop shortcuts)
- Shutdown dialog

**My Computer**
- Disk C: — extension shortcuts (opens Links Explorer)
- Disk D: — browser bookmarks via `chrome.bookmarks` API (XP Explorer tree view with folder navigation)
- Recycle Bin, Documents (WordPad), System Info

**Built-in Apps**
| App | Notes |
|-----|-------|
| Notepad | Auto-save drafts |
| WordPad | Rich text (bold, italic, lists) |
| Paint | Canvas drawing tool |
| Calculator | Standard mode |
| Command Prompt | Echo / help / ver / date commands |
| Minesweeper | Classic rules |
| Solitaire (Klondike) | Full card game |
| Hearts | 4-player AI |
| Pinball | Physics-based |

**Taskbar & System Tray**
- Quick Launch bar (New Tab, Search, My Computer, Notepad, Sticky Note)
- Taskbar window buttons with minimise / restore
- Clock with date; click → pop-up calendar
- Volume icon → slider popup
- Update notification bell (auto-checks GitHub on startup and every 2 hours)

**Extra**
- Sticky Notes (Post-it) — multiple colours, drag, resize, persist across sessions
- Screensaver — activates after configurable idle timeout; preview mode
- XP Boot Screen + startup sound after BSOD Easter egg
- Display Properties dialog (wallpaper, screensaver, theme, settings)
- Task Manager — live window list + process table
- Run Dialog — URL bar with history autocomplete
- Export / Import all data as JSON
- One-click update download from GitHub

### Installation

1. Download or clone this repository.
2. Open `chrome://extensions` (or `edge://extensions`).
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the folder containing `manifest.json`.
5. Open a new tab — the XP desktop will appear.

> To update manually: download the latest ZIP from the [Releases](https://github.com/VibeCodeCrew/windows_xp_homepage/releases) page, remove the old extension, and load the unpacked new version.

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl + Alt + R` | Open Run dialog |
| `Ctrl + Shift + Esc` | Open Task Manager |
| Click on clock digits | BSOD Easter egg |

### Permissions

| Permission | Why |
|-----------|-----|
| `tabs` | Open new tabs, capture thumbnails |
| `bookmarks` | Show browser bookmarks in Disk D: |
| `favicon` | Load site favicons |
| `storage` | Save shortcuts, settings, stickies |
| `windows` | Create popup window for thumbnail capture |
| `history` | URL autocomplete in Run dialog |
| `downloads` | Download update ZIP |

### Data & Privacy

All data (shortcuts, settings, screenshots) is stored **locally** in `chrome.storage.local`. Nothing is sent to any external server. The only outbound requests are:
- Favicon fetching from `chrome-extension://` API
- Screenshot capture of pages you explicitly add
- Version check against the public GitHub repository

---

## Русская версия

### Описание

Nostalgic Startpage заменяет каждую новую вкладку браузера на ностальгический рабочий стол Windows XP. Добавляйте ярлыки на любимые сайты, организуйте их в папки и пользуйтесь встроенными XP-приложениями — не выходя из браузера.

### Возможности

**Рабочий стол и ярлыки**
- Три режима отображения: **Плитки** (стеклянная сетка), **Миниатюры** (XP-окна с превью), **Ярлыки** (классические иконки)
- Создание, переименование, перемещение и удаление ярлыков и папок
- Перетаскивание для изменения порядка
- Пользовательские иконки и автоматически загружаемые скриншоты страниц
- Выделение группы иконок резиновой рамкой
- Пользовательские или одноцветные обои

**Меню «Пуск»**
- Классическое двухколоночное меню Windows XP
- Панель «Все программы» с сворачиваемыми папками: Игры и Программы (копия ярлыков с рабочего стола)
- Диалог завершения работы

**Мой компьютер**
- Диск C: — ярлыки расширения (открывает «Мои ярлыки»)
- Диск D: — закладки браузера через `chrome.bookmarks` API (дерево папок в стиле XP Проводника)
- Корзина, Документы (WordPad), Сведения о системе

**Встроенные приложения**
| Приложение | Описание |
|-----------|----------|
| Блокнот | Автосохранение черновиков |
| WordPad | Форматированный текст (жирный, курсив, списки) |
| Paint | Рисование на холсте |
| Калькулятор | Стандартный режим |
| Командная строка | Команды echo / help / ver / date |
| Сапёр | Классические правила |
| Косынка | Полноценная карточная игра |
| Червы | 4 игрока с ИИ |
| Пинбол | Физическая симуляция |

**Панель задач и системный трей**
- Панель быстрого запуска (Новая вкладка, Поиск, Мой компьютер, Блокнот, Стикер)
- Кнопки окон в панели задач с поддержкой свернуть / развернуть
- Часы с датой; клик → всплывающий календарь
- Иконка громкости → ползунок
- Колокольчик обновлений (проверяет GitHub при запуске и каждые 2 часа)

**Дополнительно**
- Стикеры (Post-it) — несколько цветов, перетаскивание, изменение размера, сохраняются между сессиями
- Скринсейвер — включается после настраиваемого времени бездействия; режим предпросмотра
- Загрузочный экран XP + звук запуска после пасхалки BSOD
- Диалог «Свойства экрана» (обои, скринсейвер, тема, настройки)
- Диспетчер задач — список открытых окон и таблица процессов
- Диалог «Выполнить» — адресная строка с историей URL
- Экспорт / Импорт всех данных в формате JSON
- Скачивание обновления с GitHub в один клик

### Установка

1. Скачайте или клонируйте этот репозиторий.
2. Откройте `chrome://extensions` (или `edge://extensions`).
3. Включите **Режим разработчика** (переключатель в правом верхнем углу).
4. Нажмите **Загрузить распакованное расширение** и выберите папку с файлом `manifest.json`.
5. Откройте новую вкладку — появится рабочий стол XP.

> Для обновления вручную: скачайте ZIP с [Releases](https://github.com/VibeCodeCrew/windows_xp_homepage/releases), удалите старое расширение и загрузите новую версию.

### Горячие клавиши

| Сочетание | Действие |
|-----------|----------|
| `Ctrl + Alt + R` | Открыть диалог «Выполнить» |
| `Ctrl + Shift + Esc` | Открыть Диспетчер задач |
| Клик по цифрам часов | Пасхалка BSOD |

### Разрешения

| Разрешение | Для чего |
|-----------|---------|
| `tabs` | Открытие новых вкладок, захват скриншотов |
| `bookmarks` | Показ закладок браузера на диске D: |
| `favicon` | Загрузка фавиконок сайтов |
| `storage` | Хранение ярлыков, настроек, стикеров |
| `windows` | Создание всплывающего окна для захвата скриншота |
| `history` | Автодополнение URL в диалоге «Выполнить» |
| `downloads` | Скачивание ZIP с обновлением |

### Данные и конфиденциальность

Все данные (ярлыки, настройки, скриншоты) хранятся **локально** в `chrome.storage.local`. Никакие данные не передаются на внешние серверы. Внешние запросы отправляются только:
- При загрузке фавиконок через `chrome-extension://` API
- При захвате скриншота страниц, добавленных вами вручную
- При проверке версии по публичному репозиторию GitHub
