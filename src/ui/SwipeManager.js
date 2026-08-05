class SwipeManager {
  constructor(element, onSwipeLeft, onSwipeRight) {
    this._element = element;
    this._onSwipeLeft = onSwipeLeft;
    this._onSwipeRight = onSwipeRight;
    
    this._startX = 0;
    this._startY = 0;
    this._threshold = 50; // Минимальное расстояние для свайпа
    
    this._handleTouchStart = this._handleTouchStart.bind(this);
    this._handleTouchEnd = this._handleTouchEnd.bind(this);
    
    element.addEventListener('touchstart', this._handleTouchStart, { passive: true });
    element.addEventListener('touchend', this._handleTouchEnd, { passive: true });
  }

  _handleTouchStart(e) {
    const touch = e.touches[0];
    this._startX = touch.clientX;
    this._startY = touch.clientY;
  }

  _handleTouchEnd(e) {
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - this._startX;
    const deltaY = touch.clientY - this._startY;
    
    // Горизонтальный свайп должен быть больше вертикального
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > this._threshold) {
      if (deltaX < 0) {
        this._onSwipeLeft();
      } else {
        this._onSwipeRight();
      }
    }
  }

  destroy() {
    this._element.removeEventListener('touchstart', this._handleTouchStart);
    this._element.removeEventListener('touchend', this._handleTouchEnd);
  }
}

export default SwipeManager;