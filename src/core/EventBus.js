/**
 * EventBus — центральная шина событий (паттерн Observer).
 * 
 * Основа модульной архитектуры. Все компоненты общаются через события,
 * не связываясь напрямую. Это позволяет легко добавлять новые модули
 * (анонсы, достижения, уведомления) без переписывания существующих.
 * 
 * Используется как синглтон: import EventBus from './EventBus.js'
 * 
 * Стандартные события приложения:
 *   photos:loaded     — данные загружены
 *   photos:error      — ошибка загрузки данных
 *   photo:changed     — переключение фото в Store
 *   router:openGallery — переход на галерею
 *   router:openPhoto   — переход на фото (data: id)
 *   router:openQR      — открыть сканер QR
 */

class EventBus {
  constructor() {
    /** @type {Object<string, Function[]>} */
    this._listeners = {};
  }

  /**
   * Подписаться на событие.
   * @param {string} event - Имя события
   * @param {Function} callback - Обработчик
   * @returns {Function} Функция отписки
   */
  on(event, callback) {
    if (!this._listeners[event]) {
      this._listeners[event] = [];
    }
    this._listeners[event].push(callback);
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
  }

  /**
   * Вызвать событие с данными.
   * Ошибки в одном обработчике не прерывают остальные.
   * @param {string} event
   * @param {*} [data]
   */
  emit(event, data) {
    if (!this._listeners[event]) return;
    this._listeners[event].forEach(cb => {
      try {
        cb(data);
      } catch (e) {
        console.error(`EventBus: ошибка в "${event}":`, e);
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
    } else {
      this._listeners = {};
    }
  }
}

export default new EventBus();