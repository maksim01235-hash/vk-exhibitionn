/**
 * EventBus — центральная шина событий (паттерн Observer).
 * 
 * НАЗНАЧЕНИЕ:
 *   Основа модульной архитектуры. Все компоненты общаются через события,
 *   не связываясь напрямую. Позволяет добавлять новые модули (анонсы,
 *   достижения, уведомления) без переписывания существующих.
 * 
 * ИСПОЛЬЗОВАНИЕ:
 *   import EventBus from './EventBus.js'
 *   EventBus.on('event', data => { ... });
 *   EventBus.emit('event', payload);
 * 
 * СТАНДАРТНЫЕ СОБЫТИЯ:
 *   photos:loaded      — данные загружены (data: массив фото)
 *   photos:error       — ошибка загрузки данных (data: сообщение)
 *   photo:changed      — переключение фото в Store (data: объект фото)
 *   router:openGallery — переход на галерею
 *   router:openPhoto   — переход на фото (data: id)
 *   router:openQR      — открыть сканер QR
 */

import { createLogger } from '../utils/Logger.js';

// ═══════════════════════════════════════
// КОНСТАНТЫ
// ═══════════════════════════════════════

/** Включить логирование событий */
const DEBUG = false;

// ═══════════════════════════════════════
// ЛОГГЕР
// ═══════════════════════════════════════

const log = createLogger('EventBus', DEBUG);

class EventBus {
  constructor() {
    /** @type {Object<string, Function[]>} Слушатели по событиям */
    this._listeners = {};
    log('синглтон создан');
  }

  /**
   * Подписаться на событие.
   * @param {string} event — имя события
   * @param {Function} callback — обработчик
   * @returns {Function} функция отписки
   */
  on(event, callback) {
    if (!this._listeners[event]) {
      this._listeners[event] = [];
    }
    this._listeners[event].push(callback);
    log(`подписка на "${event}", всего слушателей: ${this._listeners[event].length}`);
    return () => this.off(event, callback);
  }

  /**
   * Отписаться от события.
   * @param {string} event
   * @param {Function} callback
   */
  off(event, callback) {
    if (!this._listeners[event]) return;
    this._listeners[event] = this._listeners[event].filter(cb => cb !== callback);
    log(`отписка от "${event}", осталось: ${this._listeners[event].length}`);
  }

  /**
   * Вызвать событие с данными.
   * Ошибки в одном обработчике не прерывают остальные.
   * @param {string} event
   * @param {*} [data]
   */
  emit(event, data) {
    if (!this._listeners[event]) {
      log(`"${event}" — нет слушателей, пропущено`, 'warn');
      return;
    }
    log(`"${event}" → ${this._listeners[event].length} слушателей`);
    this._listeners[event].forEach(cb => {
      try {
        cb(data);
      } catch (e) {
        log(`ошибка в обработчике "${event}": ${e.message}`, 'error');
      }
    });
  }

  /**
   * Проверить, есть ли подписчики на событие.
   * @param {string} event
   * @returns {boolean}
   */
  hasListeners(event) {
    return !!(this._listeners[event] && this._listeners[event].length > 0);
  }

  /**
   * Удалить все обработчики события (или все события).
   * @param {string} [event] — если не указано, очищает всё
   */
  clear(event) {
    if (event) {
      delete this._listeners[event];
      log(`событие "${event}" очищено`);
    } else {
      this._listeners = {};
      log('все события очищены');
    }
  }
}

export default new EventBus();