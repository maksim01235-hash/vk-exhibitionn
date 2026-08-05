import EventBus from './EventBus.js';

class Store {
  constructor() {
    this._photos = [];
    this._currentIndex = -1;
    this._isLoading = true;
    this._error = null;
  }

  // Загрузить все фотографии
  setPhotos(photos) {
    this._photos = photos || [];
    this._isLoading = false;
    this._error = null;
    EventBus.emit('photos:loaded', this._photos);
  }

  // Ошибка загрузки
  setError(error) {
    this._isLoading = false;
    this._error = error;
    EventBus.emit('photos:error', error);
  }

  // Получить текущую фотографию
  getCurrentPhoto() {
    if (this._currentIndex < 0 || this._currentIndex >= this._photos.length) {
      return null;
    }
    return this._photos[this._currentIndex];
  }

  // Найти фото по ID и перейти к нему
  navigateToId(id) {
    const index = this._photos.findIndex(p => String(p.id) === String(id));
    if (index >= 0) {
      this._currentIndex = index;
      EventBus.emit('photo:changed', this.getCurrentPhoto());
      return true;
    }
    return false;
  }

  // Следующее фото
  next() {
    if (this._photos.length === 0) return null;
    this._currentIndex = (this._currentIndex + 1) % this._photos.length;
    const photo = this.getCurrentPhoto();
    EventBus.emit('photo:changed', photo);
    return photo;
  }

  // Предыдущее фото
  prev() {
    if (this._photos.length === 0) return null;
    this._currentIndex = (this._currentIndex - 1 + this._photos.length) % this._photos.length;
    const photo = this.getCurrentPhoto();
    EventBus.emit('photo:changed', photo);
    return photo;
  }

  // Получить все фото
  getAllPhotos() {
    return [...this._photos];
  }

  // Количество фото
  getCount() {
    return this._photos.length;
  }

  // Текущий индекс (для отображения "3 из 30")
  getCurrentIndex() {
    return this._currentIndex;
  }

  // Состояние загрузки
  isLoading() {
    return this._isLoading;
  }

  getError() {
    return this._error;
  }
}

export default new Store();