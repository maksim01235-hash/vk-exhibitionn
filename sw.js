/**
 * Service Worker — офлайн-кеширование приложения «Выставка».
 * 
 * Стратегии:
 *   - Статические файлы: кешируются при установке
 *   - Google Sheets / EmailJS: сеть → кеш (при ошибке — кеш)
 *   - Изображения: кеш → сеть (мгновенная отдача из кеша, фоновое обновление)
 *   - Всё остальное: кеш → сеть → фоновое обновление кеша
 * 
 * Чтобы сбросить кеш при обновлении — увеличьте CACHE_VERSION.
 */

// ═══════════════════════════════════════
// НАСТРОЙКИ
// ═══════════════════════════════════════

/** Версия кеша — менять при обновлении статики */
// Версия кеша импортируется из config (нельзя, SW отдельный)
const CACHE_NAME = 'vk-exhibition-v5';

/** Максимальный размер кешируемого изображения (10 MB) */
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

/** Статические файлы для предкеширования */
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

function isCacheable(response) {
  return response && response.ok && response.status === 200;
}

// ═══════════════════════════════════════
// УСТАНОВКА
// ═══════════════════════════════════════

self.addEventListener('install', (event) => {
  console.log('SW: установка...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('SW: кеширую статику...');
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('SW: не все ассеты закешированы:', err.message);
      });
    })
  );
});

// ═══════════════════════════════════════
// АКТИВАЦИЯ
// ═══════════════════════════════════════

self.addEventListener('activate', (event) => {
  console.log('SW: активация...');
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
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

  // ── Google Sheets / EmailJS: сеть → кеш ──
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

  // ── Изображения: кеш → сеть (фон) ──
  if (event.request.destination === 'image') {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) {
          // Отдаём из кеша мгновенно, в фоне обновляем
          fetch(event.request)
            .then((response) => {
              if (isCacheable(response)) {
                const contentLength = response.headers.get('content-length');
                if (!contentLength || parseInt(contentLength) <= MAX_IMAGE_SIZE) {
                  caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response));
                }
              }
            })
            .catch(() => {});
          return cached;
        }

        // В кеше нет — грузим из сети и кешируем
        return fetch(event.request)
          .then((response) => {
            if (isCacheable(response)) {
              const contentLength = response.headers.get('content-length');
              if (!contentLength || parseInt(contentLength) <= MAX_IMAGE_SIZE) {
                const cloned = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
              }
            }
            return response;
          })
          .catch(() => caches.match('/assets/placeholder.jpg'));
      })
    );
    return;
  }

  // ── Всё остальное: кеш → сеть → фон ──
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