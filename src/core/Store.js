/**
 * Store — центральное хранилище состояния приложения.
 * 
 * НАЗНАЧЕНИЕ:
 *   Хранит массив фотографий, индекс текущей, состояние загрузки.
 *   При изменениях оповещает подписчиков через EventBus.
 * 
 * ПРИ РАСШИРЕНИИ ДОБАВИТЬ:
 *   — Хранилище достижений пользователя
 *   — Хранилище анонсов выставок
 *   — Статус уведомлений
 */

import EventBus from './EventBus.js';
import { createLogger } from '../utils/Logger.js';

// ═══════════════════════════════════════
// КОНСТАНТЫ
// ═══════════════════════════════════════

/** Включить логирование */
const DEBUG = true;

// ═══════════════════════════════════════
// ЛОГГЕР
// ═══════════════════════════════════════

const log = createLogger('Store', DEBUG);

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

    log('синглтон создан');
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
    log(`загружено ${this._photos.length} фото`);
    EventBus.emit('photos:loaded', this._photos);
  }

  /**
   * Зафиксировать ошибку загрузки.
   * @param {string} error
   */
  setError(error) {
    this._isLoading = false;
    this._error = error;
    log(`ошибка загрузки: ${error}`, 'error');
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
    if (index === -1) {
      log(`фото #${id} не найдено`, 'warn');
      return false;
    }

    this._currentIndex = index;
    log(`переход к фото #${id} (индекс ${index})`);
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
    if (EventBus.hasListeners('photo:changed')) {
      EventBus.emit('photo:changed', photo);
    }
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
    log(`предыдущее фото #${photo?.id} (индекс ${this._currentIndex})`);
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