/**
 * InfoPanel — информационная панель на экране фотографии.
 * 
 * НАЗНАЧЕНИЕ:
 *   Рендерит название, автора, описание, интересный факт,
 *   технические параметры и ссылку на оригинал.
 *   Поддерживает рендер в произвольный контейнер (для боковых слайдов).
 * 
 * РАСШИРЕНИЕ:
 *   — Добавить дату и место съёмки
 *   — Сворачиваемые секции (аккордеон)
 *   — Теги / ключевые слова
 */

import { renderMarkdown } from '../utils/markdown.js';
import { createLogger } from '../utils/Logger.js';

// ═══════════════════════════════════════
// КОНСТАНТЫ
// ═══════════════════════════════════════

/** Включить логирование */
const DEBUG = true; // InfoPanel рендерится очень часто, логи лучше отключить

/**
 * Человекочитаемые названия техпараметров.
 * Если ключ не найден — форматируется автоматически: shutterSpeed → «ShutterSpeed».
 * Чтобы добавить новый параметр:
 *   — Добавьте столбец в Google Таблицу (например, «flash»)
 *   — Добавьте перевод сюда: 'flash': 'Вспышка'
 *   — Или оставьте как есть — отобразится «Flash»
 */
const TECH_LABELS = {
  'camera':       'Камера',
  'lens':         'Объектив',
  'iso':          'ISO',
  'aperture':     'Диафрагма',
  'shutterSpeed': 'Выдержка',
  'focalLength':  'Фокусное расстояние',
  'exposure':     'Экспозиция',
  'flash':        'Вспышка',
  'whiteBalance': 'Баланс белого',
};

/** Поля, исключаемые из техпараметров (URL-адреса) */
const EXCLUDED_TECH_KEYS = ['imagePreviewUrl'];

// ═══════════════════════════════════════
// ЛОГГЕР
// ═══════════════════════════════════════

const log = createLogger('InfoPanel', DEBUG);

class InfoPanel {
  constructor() {
    /** @type {HTMLElement} Контейнер по умолчанию */
    this._container = document.getElementById('info-content');
    log('создан');
  }

  // ═══════════════════════════════════════
  // ПУБЛИЧНЫЙ API
  // ═══════════════════════════════════════

  /**
   * Отрисовать информацию в контейнер по умолчанию (#info-content).
   * @param {Object} photo
   */
  render(photo) {
    if (this._container) {
      this._container.innerHTML = this._buildHTML(photo);
    }
  }

  /**
   * Отрисовать информацию в произвольный контейнер.
   * Используется слайдером для рендера в крайние слайды.
   * @param {HTMLElement} container
   * @param {Object} photo
   */
  renderInto(container, photo) {
    if (!container) return;
    container.innerHTML = this._buildHTML(photo);
  }

  // ═══════════════════════════════════════
  // СБОРКА HTML
  // ═══════════════════════════════════════

  _buildHTML(photo) {
    if (!photo) return '';
    return [
      this._renderTitle(photo),
      this._renderPhotographer(photo),
      this._renderDescription(photo),
      this._renderFunFact(photo),
      this._renderTechInfo(photo),
      this._renderOriginalLink(photo),
    ].filter(Boolean).join('');
  }

  // ═══════════════════════════════════════
  // РЕНДЕР СЕКЦИЙ
  // ═══════════════════════════════════════

  _renderTitle(photo) {
    if (!photo.title) return '';
    return `<h2 class="photo-title">${renderMarkdown(photo.title)}</h2>`;
  }

  _renderPhotographer(photo) {
    if (!photo.photographer) return '';
    return `<div class="photo-photographer">${renderMarkdown(photo.photographer)}</div>`;
  }

  _renderDescription(photo) {
    if (!photo.description) return '';
    return `<div class="photo-description">${renderMarkdown(photo.description)}</div>`;
  }

  _renderFunFact(photo) {
    if (!photo.funFact) return '';
    return `
      <div class="photo-funfact">
        <h3>Интересный факт</h3>
        <div class="funfact-content">${renderMarkdown(photo.funFact)}</div>
      </div>
    `;
  }

  _renderTechInfo(photo) {
    const techInfo = photo.techInfo || {};
    const keys = Object.keys(techInfo).filter(key => {
      return !key.endsWith('Url') && !EXCLUDED_TECH_KEYS.includes(key);
    });

    if (keys.length === 0) return '';

    const rows = keys.map(key => {
      const label = TECH_LABELS[key] || key.charAt(0).toUpperCase() + key.slice(1);
      return `
        <div class="tech-param">
          <span class="tech-param-label">${label}</span>
          <span class="tech-param-value">${techInfo[key]}</span>
        </div>
      `;
    }).join('');

    return `
      <div class="photo-techinfo">
        <h3>Технические параметры</h3>
        <div class="tech-params">${rows}</div>
      </div>
    `;
  }

  _renderOriginalLink(photo) {
    if (!photo.originalUrl) return '';
    return `
      <a href="${photo.originalUrl}" target="_blank" rel="noopener" class="original-link-btn">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
          <polyline points="15 3 21 3 21 9"/>
          <line x1="10" y1="14" x2="21" y2="3"/>
        </svg>
        Ссылка на оригинал
      </a>
    `;
  }
}

export default InfoPanel;