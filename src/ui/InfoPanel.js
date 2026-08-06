/**
 * InfoPanel — информационная панель на экране фотографии.
 * 
 * Отвечает за рендер:
 *   - Названия и автора (Markdown)
 *   - Описания (Markdown: абзацы, списки, цитаты, жирный/курсив)
 *   - Блока «Интересный факт» (Markdown)
 *   - Блока «Технические параметры» (автосбор из techInfo)
 *   - Кнопки «Ссылка на оригинал»
 * 
 * При расширении можно добавить:
 *   - Дату и место съёмки (отдельные поля)
 *   - Сворачиваемые секции (аккордеон)
 *   - Теги / ключевые слова
 */

import { renderMarkdown } from '../utils/markdown.js';

// ═══════════════════════════════════════
// КОНСТАНТЫ
// ═══════════════════════════════════════

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

/** Поля, которые не нужно показывать в техпараметрах (URL-адреса) */
const EXCLUDED_TECH_KEYS = ['imagePreviewUrl'];

class InfoPanel {
  constructor() {
    /** @type {HTMLElement} Контейнер для всей информации */
    this._container = document.getElementById('info-content');
  }

  // ═══════════════════════════════════════
  // ПУБЛИЧНЫЙ API
  // ═══════════════════════════════════════

  /**
   * Отрисовать информацию о фотографии.
   * Вызывается при каждом открытии/свайпе фото.
   * 
   * @param {Object} photo — объект фотографии из Store
   *   { title, photographer, description, funFact, techInfo, originalUrl }
   */
  render(photo) {
    const html = [
      this._renderTitle(photo),
      this._renderPhotographer(photo),
      this._renderDescription(photo),
      this._renderFunFact(photo),
      this._renderTechInfo(photo),
      this._renderOriginalLink(photo),
    ].filter(Boolean).join('');

    this._container.innerHTML = html;
  }

  // ═══════════════════════════════════════
  // РЕНДЕР СЕКЦИЙ
  // ═══════════════════════════════════════

  /**
   * Название фотографии (Markdown).
   * @param {Object} photo
   * @returns {string}
   */
  _renderTitle(photo) {
    if (!photo.title) return '';
    return `<h2 class="photo-title">${renderMarkdown(photo.title)}</h2>`;
  }

  /**
   * Автор (Markdown).
   * @param {Object} photo
   * @returns {string}
   */
  _renderPhotographer(photo) {
    if (!photo.photographer) return '';
    return `<div class="photo-photographer">${renderMarkdown(photo.photographer)}</div>`;
  }

  /**
   * Описание (Markdown). Поддерживает абзацы, списки, цитаты.
   * @param {Object} photo
   * @returns {string}
   */
  _renderDescription(photo) {
    if (!photo.description) return '';
    return `<div class="photo-description">${renderMarkdown(photo.description)}</div>`;
  }

  /**
   * Блок «Интересный факт» с заголовком (Markdown).
   * @param {Object} photo
   * @returns {string}
   */
  _renderFunFact(photo) {
    if (!photo.funFact) return '';
    return `
      <div class="photo-funfact">
        <h3>Интересный факт</h3>
        <div class="funfact-content">${renderMarkdown(photo.funFact)}</div>
      </div>
    `;
  }

  /**
   * Блок «Технические параметры».
   * Автоматически собирает все поля из techInfo, кроме URL.
   * @param {Object} photo
   * @returns {string}
   */
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

  /**
   * Кнопка «Ссылка на оригинал» с иконкой внешней ссылки.
   * @param {Object} photo
   * @returns {string}
   */
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