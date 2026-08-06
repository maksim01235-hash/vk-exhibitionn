/**
 * Store — центральное хранилище состояния приложения.
 * 
 * Содержит:
 *   - Список всех фотографий
 *   - Индекс текущей открытой фотографии
 *   - Состояние загрузки
 * 
 * При изменении данных оповещает подписчиков через EventBus.
 * При расширении можно добавить хранилища для:
 *   - достижений пользователя
 *   - анонсов выставок
 *   - статуса уведомлений
 */

import EventBus from './EventBus.js';

class Store {
  constructor() {
    /** @type {Object[]} */
    this._photos = [];

    /** @type {number} Индекс текущей фотографии */
    this._currentIndex = -1;

    /** @type {boolean} Идёт ли первичная загрузка */
    this._isLoading = true;

    /** @type {string|null} Сообщение об ошибке */
    this._error = null;
  }

  // ═══════════════════════════════════════
  // ЗАГРУЗКА ДАННЫХ
  // ═══════════════════════════════════════

  /**
   * Сохранить список фотографий и оповестить подписчиков.
   * @param {Object[]} photos
   */
  setPhotos(photos) {
    this._photos = photos || [];
    this._isLoading = false;
    this._error = null;
    EventBus.emit('photos:loaded', this._photos);
  }

  /**
   * Зафиксировать ошибку загрузки.
   * @param {string} error
   */
  setError(error) {
    this._isLoading = false;
    this._error = error;
    EventBus.emit('photos:error', error);
  }

  // ═══════════════════════════════════════
  // НАВИГАЦИЯ
  // ═══════════════════════════════════════

  /**
   * Текущая фотография или null.
   * @returns {Object|null}
   */
  getCurrentPhoto() {
    if (this._currentIndex < 0 || this._currentIndex >= this._photos.length) {
      return null;
    }
    return this._photos[this._currentIndex];
  }

  /**
   * Перейти к фото по ID.
   * @param {string|number} id
   * @returns {boolean} найдено ли фото
   */
  navigateToId(id) {
    const index = this._photos.findIndex(p => String(p.id) === String(id));
    if (index === -1) return false;

    this._currentIndex = index;
    EventBus.emit('photo:changed', this.getCurrentPhoto());
    return true;
  }

  /**
   * Перейти к следующему фото (циклично).
   * @returns {Object|null}
   */
  next() {
    if (this._photos.length === 0) return null;
    this._currentIndex = (this._currentIndex + 1) % this._photos.length;
    const photo = this.getCurrentPhoto();
    EventBus.emit('photo:changed', photo);
    return photo;
  }

  /**
   * Перейти к предыдущему фото (циклично).
   * @returns {Object|null}
   */
  prev() {
    if (this._photos.length === 0) return null;
    this._currentIndex = (this._currentIndex - 1 + this._photos.length) % this._photos.length;
    const photo = this.getCurrentPhoto();
    EventBus.emit('photo:changed', photo);
    return photo;
  }

  // ═══════════════════════════════════════
  // ГЕТТЕРЫ
  // ═══════════════════════════════════════

  /**
   * Копия массива всех фотографий.
   * @returns {Object[]}
   */
  getAllPhotos() {
    return [...this._photos];
  }

  /**
   * Количество фотографий.
   * @returns {number}
   */
  getCount() {
    return this._photos.length;
  }

  /**
   * Индекс текущей фотографии.
   * @returns {number}
   */
  getCurrentIndex() {
    return this._currentIndex;
  }

  /**
   * Идёт ли загрузка данных.
   * @returns {boolean}
   */
  isLoading() {
    return this._isLoading;
  }

  /**
   * Сообщение об ошибке или null.
   * @returns {string|null}
   */
  getError() {
    return this._error;
  }
}

export default new Store();