import Store from './Store.js';
import EventBus from './EventBus.js';

class Router {
  constructor() {
    this._currentScreen = null;
  }

  // Инициализация: проверить, запущено ли приложение из QR-кода
  async init() {
    // Пытаемся получить параметры запуска через VK Bridge
    try {
      if (window.vkBridge) {
        const launchParams = await window.vkBridge.send('VKWebAppGetLaunchParams');
        // Если есть параметр от QR-кода
        if (launchParams && launchParams.vk_connect_args) {
          const qrData = launchParams.vk_connect_args;
          // Предполагаем, что в QR зашит ID фотографии
          const id = this._extractPhotoId(qrData);
          if (id) {
            EventBus.emit('router:openPhoto', id);
            return;
          }
        }
      }
    } catch (e) {
      console.log('Не удалось получить параметры запуска:', e);
    }
    // По умолчанию — главный экран
    EventBus.emit('router:openGallery');
  }

  // Извлечь ID фото из данных QR-кода
  _extractPhotoId(data) {
    // Поддерживаем несколько форматов:
    // 1. Просто число: "5"
    // 2. URL с параметром: "https://...?photo=5"
    // 3. JSON: '{"photoId": 5}'
    
    if (/^\d+$/.test(data.trim())) {
      return data.trim();
    }
    
    try {
      const json = JSON.parse(data);
      if (json.photoId) return String(json.photoId);
      if (json.id) return String(json.id);
    } catch (e) {
      // не JSON
    }
    
    try {
      const url = new URL(data);
      const id = url.searchParams.get('photo') || url.searchParams.get('id');
      if (id) return id;
    } catch (e) {
      // не URL
    }
    
    return null;
  }
}

export default new Router();