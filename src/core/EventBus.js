// Простая шина событий (паттерн Observer)
// Позволяет модулям общаться друг с другом, не зная друг о друге

class EventBus {
  constructor() {
    this._listeners = {};
  }

  on(event, callback) {
    if (!this._listeners[event]) {
      this._listeners[event] = [];
    }
    this._listeners[event].push(callback);

    // Возвращаем функцию отписки
    return () => this.off(event, callback);
  }

  off(event, callback) {
    if (!this._listeners[event]) return;
    this._listeners[event] = this._listeners[event].filter(cb => cb !== callback);
  }

  emit(event, data) {
    if (!this._listeners[event]) return;
    this._listeners[event].forEach(cb => {
      try {
        cb(data);
      } catch (e) {
        console.error(`Error in event listener for "${event}":`, e);
      }
    });
  }
}

// Экспортируем единственный экземпляр
export default new EventBus();