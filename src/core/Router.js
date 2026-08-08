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
 * ФОРМАТЫ ССЫЛОК:
 *   - https://vk.com/app54708970/#1
 *   - Просто число в QR: 1
 */

import EventBus from './EventBus.js';
import { createLogger } from '../utils/Logger.js';

// ═══════════════════════════════════════
// КОНСТАНТЫ
// ═══════════════════════════════════════

/** Включить логирование */
const DEBUG = true;

/**
 * Время ожидания ответа от VK Bridge (мс).
 * Если VK не ответит — считаем что приложение открыто не в VK.
 */
const VK_BRIDGE_TIMEOUT = 2000;

/**
 * Задержки проверки хеша при инициализации (мс).
 * VK может добавить хеш в URL с опозданием после загрузки.
 */
const HASH_CHECK_DELAYS = [300, 800];

// ═══════════════════════════════════════
// ЛОГГЕР
// ═══════════════════════════════════════

const log = createLogger('Router', DEBUG);

class Router {
  constructor() {
    /** @type {boolean} Маршрут уже определён */
    this._done = false;
    log('синглтон создан');
  }

  // ═══════════════════════════════════════
  // ИНИЦИАЛИЗАЦИЯ
  // ═══════════════════════════════════════

  async init() {
    log('инициализация...');

    // 1. VK Bridge (QR-код)
    await this._checkVKLaunchParams();
    if (this._done) return;

    // 2. Хеш URL
    this._checkHash();
    HASH_CHECK_DELAYS.forEach(delay => {
      setTimeout(() => this._checkHash(), delay);
    });

    // 3. Слушаем изменения хеша
    window.addEventListener('hashchange', () => this._checkHash());
    log('инициализация завершена');
  }

  // ═══════════════════════════════════════
  // VK BRIDGE
  // ═══════════════════════════════════════

  async _checkVKLaunchParams() {
    try {
      if (!window.vkBridge) {
        log('VK Bridge не найден — не в VK');
        return;
      }

      const launchParams = await this._withTimeout(
        window.vkBridge.send('VKWebAppGetLaunchParams'),
        VK_BRIDGE_TIMEOUT
      );

      log(`параметры запуска: ${JSON.stringify(launchParams)}`);

      if (launchParams?.vk_connect_args) {
        const id = this._extractPhotoId(launchParams.vk_connect_args);
        if (id) this._navigateToPhoto(id);
      }
    } catch (e) {
      log(`VK Bridge недоступен (локально — нормально): ${e.message}`);
    }
  }

  // ═══════════════════════════════════════
  // ХЕШ URL
  // ═══════════════════════════════════════

  _checkHash() {
    if (this._done) return;

    const hash = window.location.hash;
    if (!hash || hash.length <= 1) return;

    log(`хеш найден: "${hash}"`);
    const id = this._extractPhotoId(hash);
    if (id) this._navigateToPhoto(id);
  }

  // ═══════════════════════════════════════
  // НАВИГАЦИЯ
  // ═══════════════════════════════════════

  _navigateToPhoto(id) {
    if (this._done) return;
    this._done = true;
    log(`переход к фото #${id}`);
    EventBus.emit('router:openPhoto', id);
  }

  // ═══════════════════════════════════════
  // ИЗВЛЕЧЕНИЕ ID
  // ═══════════════════════════════════════

  _extractPhotoId(data) {
    if (!data) return null;

    let str = String(data).trim();

    if (str.startsWith('#')) str = str.substring(1);
    if (str.startsWith('/')) str = str.substring(1);

    // Полный URL VK
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

    log(`не удалось извлечь ID из "${data}"`, 'warn');
    return null;
  }

  // ═══════════════════════════════════════
  // УТИЛИТЫ
  // ═══════════════════════════════════════

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