const CACHE_NAME = 'vk-exhibition-images-v1';

// Кешируем только изображения
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Кешируем только изображения
  if (event.request.destination === 'image' || 
      url.pathname.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)) {
    
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.match(event.request).then((cached) => {
          // Параллельно обновляем кеш свежей версией
          const fetchPromise = fetch(event.request).then((response) => {
            if (response.ok) {
              cache.put(event.request, response.clone());
            }
            return response;
          }).catch(() => cached);
          
          // Отдаём кеш, если есть, иначе ждём сеть
          return cached || fetchPromise;
        });
      })
    );
  }
});

// При активации чистим старые кеши
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME)
            .map(key => caches.delete(key))
      );
    })
  );
});