import EventBus from './EventBus.js';

class Router {
  constructor() {
    this._done = false;
  }

  async init() {
    // 1. VK Bridge
    try {
      if (window.vkBridge) {
        const launchParams = await this._withTimeout(
          window.vkBridge.send('VKWebAppGetLaunchParams'),
          2000
        );
        console.log('VK Launch Params:', launchParams);
        
        if (launchParams && launchParams.vk_connect_args) {
          const id = this._extractPhotoId(launchParams.vk_connect_args);
          if (id) { this._openPhoto(id); return; }
        }
      }
    } catch (e) {
      console.log('VK Bridge:', e.message);
    }

    // 2. Проверяем хеш
    this._checkHash();
    setTimeout(() => this._checkHash(), 300);
    setTimeout(() => this._checkHash(), 800);
    
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
      if (id) this._openPhoto(id);
    }
  }

  _withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout')), ms);
      promise.then(r => { clearTimeout(timer); resolve(r); })
             .catch(e => { clearTimeout(timer); reject(e); });
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
    return null;
  }
}

export default new Router();