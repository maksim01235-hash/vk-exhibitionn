// Предзагрузчик изображений с поддержкой preview и full

class ImagePreloader {
  constructor() {
    this._pending = new Map();
    this._loaded = new Set();
  }

  // Предзагрузить одно изображение
  preload(url) {
    if (!url) return Promise.resolve(null);
    if (this._loaded.has(url)) return Promise.resolve(url);
    if (this._pending.has(url)) return this._pending.get(url);

    const promise = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        this._loaded.add(url);
        this._pending.delete(url);
        resolve(url);
      };
      img.onerror = () => {
        this._pending.delete(url);
        resolve(null);
      };
      img.src = url;
    });

    this._pending.set(url, promise);
    return promise;
  }

  // Предзагрузить массив изображений
  preloadAll(urls) {
    return Promise.all(urls.filter(Boolean).map(url => this.preload(url)));
  }

  // Предзагрузка с приоритетом: сначала urgent, потом остальные
  async preloadWithPriority(urgentUrls, backgroundUrls = []) {
    // Срочные — немедленно
    const urgentPromise = this.preloadAll(urgentUrls);
    
    // Фоновые — с задержкой, чтобы не мешать текущим
    if (backgroundUrls.length > 0) {
      setTimeout(() => this.preloadAll(backgroundUrls), 500);
    }
    
    return urgentPromise;
  }

  // Проверить, загружено ли
  isLoaded(url) {
    return this._loaded.has(url);
  }
}

export default new ImagePreloader();