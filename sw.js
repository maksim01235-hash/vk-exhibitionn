/**
 * Service Worker — офлайн-кеширование приложения «Выставка».
 * 
 * Стратегии кеширования:
 *   — Статические файлы: кешируются при установке (install)
 *   — Данные Google Sheets: сеть → кеш (при ошибке — кеш)
 *   — Изображения: кеш → сеть, с ограничением размера (10MB)
 *   — Всё остальное: кеш → сеть → обновление кеша в фоне
 * 
 * При обновлении версии приложения:
 *   Увеличьте CACHE_VERSION (например, 'v3').
 *   Старый кеш будет автоматически удалён при активации.
 * 
 * При расширении можно добавить:
 *   — Фоновую синхронизацию (Background Sync)
 *   — Push-уведомления
 *   — Стратегию «сеть-first» для критичных запросов
 */

// ═══════════════════════════════════════
// НАСТРОЙКИ
// ═══════════════════════════════════════

/**
 * Версия кеша. Менять при каждом деплое с изменениями статики.
 * Старые версии кеша удаляются автоматически.
 * Пример: 'vk-exhibition-v2' → 'vk-exhibition-v3'
 */
const CACHE_NAME = 'vk-exhibition-v2';

/**
 * Максимальный размер кешируемого изображения (байт).
 * Изображения больше этого размера не сохраняются в кеш.
 * 10 * 1024 * 1024 = 10 MB.
 * Увеличьте, если хотите кешировать более тяжёлые фото.
 */
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB

/**
 * Статические файлы, кешируемые при установке SW.
 * 
 * ВАЖНО: При добавлении новых файлов в проект —
 * добавьте их пути в этот массив, иначе они не будут работать офлайн.
 * 
 * Для внешних CDN-зависимостей указывайте полный URL.
 * Для локальных файлов — путь относительно корня сайта.
 */
const STATIC_ASSETS = [
  // HTML
  '/',
  '/index.html',

  // CSS
  '/styles/main.css',

  // JS — ядро
  '/src/app.js',
  '/src/config.js',

  // JS — core
  '/src/core/EventBus.js',
  '/src/core/Store.js',
  '/src/core/Router.js',

  // JS — data
  '/src/data/DataLayer.js',

  // JS — ui
  '/src/ui/UIManager.js',
  '/src/ui/GalleryView.js',
  '/src/ui/PhotoView.js',
  '/src/ui/InfoPanel.js',
  '/src/ui/SwipeManager.js',
  '/src/ui/QRScanner.js',

  // JS — utils
  '/src/utils/markdown.js',
  '/src/utils/ImagePreloader.js',
  '/src/utils/FeedbackPrompt.js',

  // Статика
  '/assets/placeholder.jpg',

  // CDN-зависимости
  'https://unpkg.com/@vkontakte/vk-bridge/dist/browser.min.js',
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
  'https://cdn.jsdelivr.net/npm/marked/marked.min.js',
  'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js',
  'https://unpkg.com/lucide@latest',
];

// ═══════════════════════════════════════
// УТИЛИТЫ
// ═══════════════════════════════════════

/**
 * Проверить, можно ли кешировать ответ.
 * @param {Response} response
 * @returns {boolean}
 */
function isCacheable(response) {
  return response && response.ok && response.status === 200;
}

// ═══════════════════════════════════════
// ЖИЗНЕННЫЙ ЦИКЛ: УСТАНОВКА
// ═══════════════════════════════════════

self.addEventListener('install', (event) => {
  console.log('SW: установка...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('SW: кеширую статику...');
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        // Не падаем если какой-то CDN недоступен
        console.warn('SW: не все ассеты закешированы:', err.message);
      });
    })
  );
});

// ═══════════════════════════════════════
// ЖИЗНЕННЫЙ ЦИКЛ: АКТИВАЦИЯ
// ═══════════════════════════════════════

self.addEventListener('activate', (event) => {
  console.log('SW: активация...');
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME) // Удаляем старые версии кеша
          .map((key) => {
            console.log('SW: удаляю старый кеш:', key);
            return caches.delete(key);
          })
      );
    })
  );
});

// ═══════════════════════════════════════
// ПЕРЕХВАТ ЗАПРОСОВ
// ═══════════════════════════════════════

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // ── Данные Google Sheets и EmailJS: сеть → кеш ──
  if (url.hostname === 'docs.google.com' || url.hostname === 'api.emailjs.com') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (isCacheable(response)) {
            const cloned = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
          }
          return response;
        })
        .catch(() => caches.match(event.request)) // Офлайн — отдаём кеш
    );
    return;
  }

  // ── Изображения: кеш → сеть, с лимитом размера ──
  if (event.request.destination === 'image') {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached; // Отдаём из кеша мгновенно

        // Грузим из сети
        return fetch(event.request)
          .then((response) => {
            if (isCacheable(response)) {
              const contentLength = response.headers.get('content-length');
              // Кешируем только если размер известен и не превышает лимит
              if (!contentLength || parseInt(contentLength) <= MAX_IMAGE_SIZE) {
                const cloned = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
              }
            }
            return response;
          })
          .catch(() => {
            // Ошибка сети — заглушка (если есть в кеше)
            return cached || caches.match('/assets/placeholder.jpg');
          });
      })
    );
    return;
  }

  // ── Всё остальное: кеш → сеть → фоновое обновление кеша ──
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Отдаём из кеша, а в фоне обновляем
        fetch(event.request)
          .then((response) => {
            if (isCacheable(response)) {
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response));
            }
          })
          .catch(() => {}); // Сеть недоступна — ничего не делаем
        return cachedResponse;
      }

      // В кеше нет — грузим из сети и кешируем
      return fetch(event.request).then((response) => {
        if (isCacheable(response)) {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
        }
        return response;
      });
    })
  );
});