import EventBus from './EventBus.js';

class Router {
  constructor() {
    this._currentScreen = null;
  }

  async init() {
    // 1. Пробуем VK Bridge с таймаутом
    try {
      if (window.vkBridge) {
        const launchParams = await this._withTimeout(
          window.vkBridge.send('VKWebAppGetLaunchParams'),
          2000
        );
        console.log('VK Launch Params:', launchParams);
        
        if (launchParams && launchParams.vk_connect_args) {
          const id = this._extractPhotoId(launchParams.vk_connect_args);
          if (id) {
            EventBus.emit('router:openPhoto', id);
            return;
          }
        }
      }
    } catch (e) {
      console.log('VK Bridge не ответил:', e.message);
    }

    // 2. Проверяем хеш сейчас
    this._checkHash();

    // 3. Проверяем хеш ещё раз с задержкой (VK может обрезать и восстановить)
    setTimeout(() => this._checkHash(), 500);
    setTimeout(() => this._checkHash(), 1500);

    // 4. Слушаем изменения хеша
    window.addEventListener('hashchange', () => this._checkHash());
  }

  _checkHash() {
    const hash = window.location.hash;
    console.log('Router: хеш =', hash);
    
    if (hash && hash.length > 1) {
      const id = this._extractPhotoId(hash.substring(1));
      console.log('Router: ID =', id);
      if (id) {
        EventBus.emit('router:openPhoto', id);
        return;
      }
    }
  }

  _withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout')), ms);
      promise
        .then(result => { clearTimeout(timer); resolve(result); })
        .catch(err => { clearTimeout(timer); reject(err); });
    });
  }

  _extractPhotoId(data) {
    if (!data) return null;
    
    if (/^\d+$/.test(data.trim())) {
      return data.trim();
    }
    
    try {
      const json = JSON.parse(data);
      if (json.photoId) return String(json.photoId);
      if (json.id) return String(json.id);
    } catch (e) { /* не JSON */ }
    
    try {
      const url = new URL(data);
      const id = url.searchParams.get('photo') || url.searchParams.get('id');
      if (id) return id;
    } catch (e) { /* не URL */ }
    
    return null;
  }
}

export default new Router();