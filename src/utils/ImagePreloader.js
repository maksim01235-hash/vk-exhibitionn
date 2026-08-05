// Предзагрузчик изображений
// Загружает изображения в фоне, чтобы они попали в сетевой кеш браузера

class ImagePreloader {
  constructor() {
    this._pending = new Map();
  }

  // Предзагрузить одно изображение
  preload(url) {
    if (!url) return Promise.resolve(null);
    if (this._pending.has(url)) return this._pending.get(url);

    const promise = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        this._pending.delete(url);
        resolve(img);
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

  // Предзагрузка с приоритетом: сначала первые N, потом остальные
  async preloadWithPriority(urls, firstN = 10) {
    const first = urls.slice(0, firstN);
    const rest = urls.slice(firstN);
    
    // Сначала загружаем приоритетные
    await this.preloadAll(first);
    
    // Потом остальные в фоне
    if (rest.length > 0) {
      setTimeout(() => this.preloadAll(rest), 100);
    }
  }
}

export default new ImagePreloader();