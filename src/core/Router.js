/**
 * Router — маршрутизация приложения.
 * 
 * Определяет начальный экран при запуске:
 *   1. Параметры от VK Bridge (vk_connect_args из QR-кода)
 *   2. Хеш URL (/index.html#id)
 *   3. По умолчанию — галерея
 * 
 * Также слушает изменения хеша при работе приложения.
 * При расширении можно добавить маршруты для анонсов, достижений и т.д.
 */

import EventBus from './EventBus.js';

/** Время ожидания ответа от VK Bridge (мс) */
const VK_BRIDGE_TIMEOUT = 2000;

/** Задержки проверки хеша при инициализации — VK может добавить хеш с опозданием */
const HASH_CHECK_DELAYS = [300, 800];

class Router {
  constructor() {
    /** Флаг: маршрут уже определён */
    this._done = false;
  }

  /**
   * Инициализация: определить начальный экран.
   */
  async init() {
    // 1. Параметры запуска от VK (QR-код)
    await this._checkVKLaunchParams();
    if (this._done) return;

    // 2. Хеш URL
    this._checkHash();
    HASH_CHECK_DELAYS.forEach(delay => {
      setTimeout(() => this._checkHash(), delay);
    });

    // 3. Слушаем изменения хеша во время работы
    window.addEventListener('hashchange', () => this._checkHash());
  }

  /**
   * Проверить параметры запуска VK Bridge.
   */
  async _checkVKLaunchParams() {
    try {
      if (!window.vkBridge) return;

      const launchParams = await this._withTimeout(
        window.vkBridge.send('VKWebAppGetLaunchParams'),
        VK_BRIDGE_TIMEOUT
      );

      if (launchParams?.vk_connect_args) {
        const id = this._extractPhotoId(launchParams.vk_connect_args);
        if (id) this._navigateToPhoto(id);
      }
    } catch (e) {
      console.log('Router: VK Bridge недоступен (локально — нормально):', e.message);
    }
  }

  /**
   * Проверить хеш текущего URL.
   */
  _checkHash() {
    if (this._done) return;

    const hash = window.location.hash;
    if (!hash || hash.length <= 1) return;

    const id = this._extractPhotoId(hash);
    if (id) this._navigateToPhoto(id);
  }

  /**
   * Перейти к фотографии.
   * @param {string} id
   */
  _navigateToPhoto(id) {
    if (this._done) return;
    this._done = true;
    console.log('Router: открываю фото', id);
    EventBus.emit('router:openPhoto', id);
  }

  /**
   * Извлечь ID фотографии из строки.
   * Поддерживает форматы:
   *   - Просто число: "5"
   *   - Хеш: "#5", "/#5"
   *   - Полный URL VK: "https://vk.com/app54708970/#5"
   * 
   * @param {string} data
   * @returns {string|null}
   */
  _extractPhotoId(data) {
    if (!data) return null;

    let str = String(data).trim();

    // Очищаем от # и /
    if (str.startsWith('#')) str = str.substring(1);
    if (str.startsWith('/')) str = str.substring(1);

    // Полный URL VK: https://vk.com/appXXXXXXX/#id
    if (str.includes('vk.com/app')) {
      const match = str.match(/\/#\/?(\d+)/);
      if (match) return match[1];

      try {
        const url = new URL(str);
        return url.searchParams.get('photo') || url.searchParams.get('id');
      } catch (e) { /* не URL */ }
    }

    // Просто число
    if (/^\d+$/.test(str)) return str;

    return null;
  }

  /**
   * Выполнить промис с таймаутом.
   * @param {Promise} promise
   * @param {number} ms
   * @returns {Promise}
   */
  _withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout')), ms);
      promise
        .then(r => { clearTimeout(timer); resolve(r); })
        .catch(e => { clearTimeout(timer); reject(e); });
    });
  }
}

export default new Router();