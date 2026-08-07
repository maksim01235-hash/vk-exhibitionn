/**
 * Router — маршрутизация приложения.
 * 
 * НАЗНАЧЕНИЕ:
 *   Определяет начальный экран при запуске и обрабатывает навигацию
 *   по хешу URL в течение работы приложения.
 * 
 * КАК ЭТО РАБОТАЕТ:
 *   1. Проверяет параметры запуска от VK Bridge (для QR-кодов извне)
 *   2. Проверяет хеш URL (/#id) — сразу и с задержками (VK может добавить позже)
 *   3. Слушает изменения хеша при работе (ручной ввод, свайпы)
 *   4. Извлекает ID фото и отправляет событие router:openPhoto
 * 
 * ФОРМАТЫ QR-ССЫЛОК:
 *   - https://vk.com/app54708970/#1
 *   - https://vk.com/app54708970/#/1
 *   - Просто число в QR: 1
 * 
 * РАСШИРЕНИЕ:
 *   — Добавить маршруты: router:openAnnouncement, router:openAchievement
 *   — Поддержка внешних deep-link (приглашения, шаринг)
 *   — Восстановление состояния после перезагрузки
 */

import EventBus from './EventBus.js';

// ═══════════════════════════════════════
// КОНСТАНТЫ
// ═══════════════════════════════════════

/**
 * Время ожидания ответа от VK Bridge (мс).
 * Если VK не ответит за это время — считаем что мы не в VK.
 */
const VK_BRIDGE_TIMEOUT = 2000;

/**
 * Задержки проверки хеша при инициализации (мс).
 * VK может добавить хеш в URL с опозданием после загрузки приложения.
 * Проверяем несколько раз с этими интервалами.
 */
const HASH_CHECK_DELAYS = [300, 800];

class Router {
  constructor() {
    /** @type {boolean} Маршрут уже определён — игнорируем повторные срабатывания */
    this._done = false;
  }

  // ═══════════════════════════════════════
  // ИНИЦИАЛИЗАЦИЯ
  // ═══════════════════════════════════════

  /**
   * Определить начальный экран при запуске приложения.
   * Вызывается после загрузки данных.
   */
  async init() {
    // 1. Параметры от VK Bridge (QR-код из камеры телефона)
    await this._checkVKLaunchParams();
    if (this._done) return;

    // 2. Хеш URL — сразу и с задержками
    this._checkHash();
    HASH_CHECK_DELAYS.forEach(delay => {
      setTimeout(() => this._checkHash(), delay);
    });

    // 3. Слушаем изменения хеша во время работы приложения
    window.addEventListener('hashchange', () => this._checkHash());
  }

  // ═══════════════════════════════════════
  // VK BRIDGE
  // ═══════════════════════════════════════

  /**
   * Проверить параметры запуска от VK Bridge.
   * Если приложение открыто через QR-код, VK передаст vk_connect_args.
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
      // Локально VK Bridge недоступен — это нормально
      console.log('Router: VK Bridge недоступен (локально — нормально):', e.message);
    }
  }

  // ═══════════════════════════════════════
  // ХЕШ URL
  // ═══════════════════════════════════════

  /**
   * Проверить хеш текущего URL.
   * Вызывается при старте и при изменении хеша.
   */
  _checkHash() {
    if (this._done) return;

    const hash = window.location.hash;
    if (!hash || hash.length <= 1) return;

    const id = this._extractPhotoId(hash);
    if (id) this._navigateToPhoto(id);
  }

  // ═══════════════════════════════════════
  // НАВИГАЦИЯ
  // ═══════════════════════════════════════

  /**
   * Отправить событие перехода к фото.
   * @param {string} id — ID фотографии
   */
  _navigateToPhoto(id) {
    if (this._done) return;
    this._done = true;
    EventBus.emit('router:openPhoto', id);
  }

  // ═══════════════════════════════════════
  // РАСПОЗНАВАНИЕ ID
  // ═══════════════════════════════════════

  /**
   * Извлечь ID фотографии из строки.
   * Поддерживаемые форматы:
   *   - "5" — просто число
   *   - "#5", "/#5" — хеш URL
   *   - "https://vk.com/app54708970/#5" — полный URL VK
   * 
   * @param {string} data — содержимое QR-кода или хеша
   * @returns {string|null} ID фото или null
   */
  _extractPhotoId(data) {
    if (!data) return null;

    let str = String(data).trim();

    // Очищаем от # и / в начале
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

  // ═══════════════════════════════════════
  // УТИЛИТЫ
  // ═══════════════════════════════════════

  /**
   * Выполнить промис с таймаутом.
   * Если промис не разрешился за ms — реджектит с ошибкой.
   * 
   * @param {Promise} promise
   * @param {number} ms — таймаут в миллисекундах
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