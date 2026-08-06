// Service Worker для кеширования приложения

const CACHE_NAME = 'vk-exhibition-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/styles/main.css',
  '/src/app.js',
  '/src/config.js',
  '/src/core/EventBus.js',
  '/src/core/Store.js',
  '/src/core/Router.js',
  '/src/data/DataLayer.js',
  '/src/ui/UIManager.js',
  '/src/ui/GalleryView.js',
  '/src/ui/PhotoView.js',
  '/src/ui/InfoPanel.js',
  '/src/ui/SwipeManager.js',
  '/src/ui/QRScanner.js',
  '/src/utils/markdown.js',
  '/src/utils/ImagePreloader.js',
  '/assets/placeholder.jpg',
  'https://unpkg.com/@vkontakte/vk-bridge/dist/browser.min.js',
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
  'https://cdn.jsdelivr.net/npm/marked/marked.min.js',
  'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js',
];

// Установка: кешируем статику
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.log('SW: не все ассеты закешированы, продолжаем', err);
      });
    })
  );
});

// Активация: чистим старые кеши
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
});

// Перехват запросов: кеш → сеть
self.addEventListener('fetch', (event) => {
  // Пропускаем запросы к API и Google Sheets
  const url = new URL(event.request.url);
  if (url.hostname === 'docs.google.com' || url.hostname === 'api.emailjs.com') {
    // Для данных таблицы: сеть → кеш
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Для всего остального: кеш → сеть → кеш
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // В фоне обновляем кеш
        fetch(event.request).then((response) => {
          if (response.ok) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response));
          }
        }).catch(() => {});
        return cachedResponse;
      }

      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200) return response;
        const cloned = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
        return response;
      });
    })
  );
});