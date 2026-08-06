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
        console.log('VK Launch Params:', JSON.stringify(launchParams));
        
        if (launchParams && launchParams.vk_connect_args) {
          const id = this._extractPhotoId(launchParams.vk_connect_args);
          if (id) { this._openPhoto(id); return; }
        }
      }
    } catch (e) {
      console.log('VK Bridge:', e.message);
    }

    // 2. Хеш из URL
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
      const id = this._extractPhotoId(hash);
      if (id) this._openPhoto(id);
    }
  }

  _extractPhotoId(data) {
    if (!data) return null;
    
    // Убираем # и /
    let str = String(data).trim();
    if (str.startsWith('#')) str = str.substring(1);
    if (str.startsWith('/')) str = str.substring(1);
    
    // Если это URL вида https://vk.com/app54708970/#1
    if (str.includes('vk.com/app')) {
      const match = str.match(/\/#\/?(\d+)/);
      if (match) return match[1];
      // Может быть ?photo=1
      const url = new URL(str);
      const id = url.searchParams.get('photo') || url.searchParams.get('id');
      if (id) return id;
      return null;
    }
    
    // Если просто число
    if (/^\d+$/.test(str)) return str;
    
    return null;
  }

  _withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout')), ms);
      promise.then(r => { clearTimeout(timer); resolve(r); })
             .catch(e => { clearTimeout(timer); reject(e); });
    });
  }
}

export default new Router();