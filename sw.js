/**
 * Service Worker — офлайн-кеширование приложения «Выставка».
 * 
 * СТРАТЕГИИ КЕШИРОВАНИЯ:
 *   - Статические файлы: кешируются при установке (install)
 *   - Google Sheets (GET): сеть → кеш, при ошибке — кеш
 *   - EmailJS (POST): не кешируется — проходит напрямую
 *   - Изображения: кеш → сеть (мгновенная отдача, фоновое обновление)
 *   - Всё остальное: кеш → сеть → фоновое обновление
 * 
 * ОБНОВЛЕНИЕ КЕША:
 *   Увеличьте CACHE_NAME (v9 → v10) при изменении статических файлов.
 *   Старый кеш удалится автоматически при активации.
 * 
 * ОТЛАДКА:
 *   DEBUG = true — подробные логи в консоли SW (Application → Service Workers → inspect)
 *   DEBUG = false — только критические ошибки
 */

// ═══════════════════════════════════════
// НАСТРОЙКИ
// ═══════════════════════════════════════

/** Включить подробное логирование */
const DEBUG = true;

/** Версия кеша — менять при обновлении статики */
const CACHE_NAME = 'vk-exhibition-v10';

/** Максимальный размер кешируемого изображения (10 MB) */
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

/**
 * Статические файлы для предкеширования при установке.
 * При добавлении новых файлов в проект — добавьте их сюда.
 * Локальные файлы начинаются с './', CDN — полные URL.
 */
const STATIC_ASSETS = [
  './',
  './index.html',
  './styles/main.css',
  './src/app.js',
  './src/config.js',
  './src/core/EventBus.js',
  './src/core/Store.js',
  './src/core/Router.js',
  './src/data/DataLayer.js',
  './src/ui/UIManager.js',
  './src/ui/GalleryView.js',
  './src/ui/PhotoView.js',
  './src/ui/InfoPanel.js',
  './src/ui/SwipeManager.js',
  './src/ui/QRScanner.js',
  './src/utils/Logger.js',
  './src/utils/markdown.js',
  './src/utils/ImagePreloader.js',
  './src/utils/FeedbackPrompt.js',
  './assets/placeholder.jpg',
  'https://unpkg.com/@vkontakte/vk-bridge/dist/browser.min.js',
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
  'https://cdn.jsdelivr.net/npm/marked/marked.min.js',
  'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js',
  'https://unpkg.com/lucide@latest',
];

// ═══════════════════════════════════════
// УТИЛИТЫ
// ═══════════════════════════════════════

function log(...args) { if (DEBUG) console.log('[SW]', ...args); }
function warn(...args) { if (DEBUG) console.warn('[SW]', ...args); }

function isCacheable(response) {
  return response && response.ok && response.status === 200;
}

// ═══════════════════════════════════════
// УСТАНОВКА
// ═══════════════════════════════════════

self.addEventListener('install', (event) => {
  log('установка, кеширую статику...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).then(() => {
        log('статика закеширована успешно');
      }).catch((err) => {
        warn('не все ассеты закешированы:', err.message);
        if (DEBUG) {
          STATIC_ASSETS.forEach(url => {
            fetch(url).then(r => {
              if (!r.ok) warn(`404 — ${url}`);
            }).catch(() => warn(`ошибка сети — ${url}`));
          });
        }
      });
    })
  );
});

// ═══════════════════════════════════════
// АКТИВАЦИЯ
// ═══════════════════════════════════════

self.addEventListener('activate', (event) => {
  log('активация, чищу старые кеши...');
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => {
          log('удаляю старый кеш:', key);
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
  const dest = event.request.destination;
  const method = event.request.method;

  // ── EmailJS (POST): не кешируем, пропускаем напрямую ──
  if (url.hostname === 'api.emailjs.com') {
    return; // SW не вмешивается
  }

  // ── Google Sheets (GET): сеть → кеш ──
  if (url.hostname === 'docs.google.com') {
    log(`${url.hostname} — сеть → кеш`);
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (isCacheable(response)) {
            const cloned = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
          }
          return response;
        })
        .catch((err) => {
          warn(`${url.hostname} — ошибка сети, пробую кеш:`, err.message);
          return caches.match(event.request);
        })
    );
    return;
  }

  // ── Изображения: кеш → сеть (фон) ──
  if (dest === 'image') {
    log(`image — ${url.hostname}${url.pathname.substring(0, 40)}`);
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) {
          log('image — найдено в кеше, отдаю + фоновое обновление');
          fetch(event.request)
            .then((response) => {
              if (isCacheable(response)) {
                const contentLength = response.headers.get('content-length');
                const size = contentLength ? parseInt(contentLength) : 'неизвестно';
                if (!contentLength || parseInt(contentLength) <= MAX_IMAGE_SIZE) {
                  caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response));
                  log(`image — обновлено (${size} байт)`);
                } else {
                  log(`image — слишком большое (${size} байт), не кеширую`);
                }
              }
            })
            .catch((err) => warn('image — ошибка фонового обновления:', err.message));
          return cached;
        }

        log('image — нет в кеше, гружу из сети');
        return fetch(event.request)
          .then((response) => {
            if (isCacheable(response)) {
              const contentLength = response.headers.get('content-length');
              const size = contentLength ? parseInt(contentLength) : 'неизвестно';
              if (!contentLength || parseInt(contentLength) <= MAX_IMAGE_SIZE) {
                const cloned = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
                log(`image — закешировано (${size} байт)`);
              } else {
                log(`image — слишком большое (${size} байт)`);
              }
            } else {
              log('image — статус ' + (response ? response.status : 'нет ответа'));
            }
            return response;
          })
          .catch((err) => {
            warn('image — ошибка сети:', err.message);
            return caches.match('./assets/placeholder.jpg');
          });
      })
    );
    return;
  }

  // ── Всё остальное: кеш → сеть → фон ──
  log(`static — ${url.pathname}`);
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        log('static — найдено в кеше, отдаю + фоновое обновление');
        fetch(event.request)
          .then((response) => {
            if (isCacheable(response)) {
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response));
            }
          })
          .catch(() => {});
        return cachedResponse;
      }

      log('static — нет в кеше, гружу из сети');
      return fetch(event.request).then((response) => {
        if (isCacheable(response)) {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
        }
        return response;
      }).catch((err) => {
        warn('static — ошибка сети:', err.message);
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        throw err;
      });
    })
  );
});