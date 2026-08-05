import EventBus from './EventBus.js';

class Router {
  constructor() {
    this._currentScreen = null;
    this._done = false;
  }

  async init() {
    // 1. Пробуем VK Bridge
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
            this._openPhoto(id);
            return;
          }
        }
      }
    } catch (e) {
      console.log('VK Bridge не ответил:', e.message);
    }

    // 2. Проверяем query-параметр ?photo=
    const params = new URLSearchParams(window.location.search);
    const photoParam = params.get('photo');
    console.log('Router: ?photo =', photoParam);
    
    if (photoParam) {
      this._openPhoto(photoParam);
      return;
    }

    // 3. Проверяем хеш (на случай, если сработает)
    this._checkHash();
    setTimeout(() => this._checkHash(), 500);
    setTimeout(() => this._checkHash(), 1500);
    
    // 4. Слушаем хеш
    window.addEventListener('hashchange', () => this._checkHash());
  }

  _openPhoto(id) {
    if (this._done) return;
    this._done = true;
    console.log('Router: открываю фото', id);
    EventBus.emit('router:openPhoto', id);
  }

  _checkHash() {
    if (this._done) return;
    const hash = window.location.hash;
    console.log('Router: хеш =', hash);
    
    if (hash && hash.length > 1) {
      const id = this._extractPhotoId(hash.substring(1));
      if (id) {
        this._openPhoto(id);
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
    if (/^\d+$/.test(data.trim())) return data.trim();
    
    try {
      const json = JSON.parse(data);
      if (json.photoId) return String(json.photoId);
      if (json.id) return String(json.id);
    } catch (e) {}
    
    try {
      const url = new URL(data);
      const id = url.searchParams.get('photo') || url.searchParams.get('id');
      if (id) return id;
    } catch (e) {}
    
    return null;
  }
}

export default new Router();