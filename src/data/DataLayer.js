/**
 * DataLayer — загрузка и парсинг данных из Google Таблицы.
 * 
 * Источник данных — опубликованная Google Sheet (CSV).
 * При ошибке сети используется резервная копия из localStorage.
 * 
 * При расширении можно добавить:
 *   - DataLayer для анонсов (отдельная таблица)
 *   - DataLayer для достижений (Firebase/свой API)
 *   - Кеширование изображений в IndexedDB
 */

import CONFIG from '../config.js';
import Store from '../core/Store.js';

// ═══════════════════════════════════════
// КОНСТАНТЫ
// ═══════════════════════════════════════

/**
 * Поля, которые НЕ попадают в блок «Технические параметры».
 * Всё, что не в этом списке, автоматически отображается в техпараметрах.
 * 
 * Чтобы добавить новый техпараметр (например, «вспышка»):
 *   — Добавьте столбец «flash» в Google Таблицу
 *   — Здесь ничего менять не нужно — он подхватится автоматически
 * 
 * Чтобы добавить новое поле контента (например, «дата съёмки»):
 *   — Добавьте столбец «date» в таблицу
 *   — Добавьте 'date' в этот массив
 *   — Отобразите в InfoPanel.render()
 */
const BASE_FIELDS = [
  'id',              // Уникальный ID фотографии (для QR-кодов: /#id)
  'order',           // Порядок сортировки в галерее (число)
  'title',           // Название работы (поддерживает Markdown)
  'photographer',    // Автор (поддерживает Markdown)
  'description',     // Описание (поддерживает Markdown, абзацы, списки)
  'funFact',         // Интересный факт (Markdown)
  'imageUrl',        // Прямая ссылка на полноразмерное изображение (JPEG/PNG)
  'imagePreviewUrl', // Прямая ссылка на превью (~400px ширина, ~200 КБ)
  'originalUrl',     // Ссылка на оригинал (внешний ресурс, например astrobin)
  'category',        // Категория (для будущей группировки в галерее)
];

/** Ключ для резервной копии данных в localStorage */
const BACKUP_KEY = 'vk_exhibition_data_backup';

class DataLayer {
  // ═══════════════════════════════════════
  // ПУБЛИЧНЫЙ API
  // ═══════════════════════════════════════

  /**
   * Загрузить данные и передать в Store.
   * При ошибке сети — восстановить из резервной копии.
   */
  async load() {
    try {
      const photos = await this._fetchFromSheet();
      Store.setPhotos(photos);
      this._saveBackup(photos);
    } catch (error) {
      console.warn('DataLayer: ошибка загрузки, пробуем кеш:', error.message);
      const backup = this._getBackup();
      if (backup) {
        Store.setPhotos(backup);
      } else {
        Store.setError('Нет подключения к интернету');
      }
    }
  }

  // ═══════════════════════════════════════
  // ЗАГРУЗКА CSV
  // ═══════════════════════════════════════

  /**
   * Загрузить CSV из Google Sheets.
   * @returns {Promise<Object[]>}
   */
  async _fetchFromSheet() {
    const response = await fetch(CONFIG.EXHIBITION.SHEET_URL);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const csvText = await response.text();
    console.log('CSV: первые 500 символов:', csvText.substring(0, 500));

    const photos = this._parseCSV(csvText);
    console.log(`DataLayer: загружено ${photos.length} фото`);
    photos.forEach(p => console.log(`  #${p.id}: ${p.title?.substring(0, 40)}`));

    return photos;
  }

  /**
   * Разобрать CSV-текст в массив объектов фотографий.
   * 
   * Каждая фотография получает все поля из заголовков таблицы.
   * Поля, не входящие в BASE_FIELDS, попадают в объект techInfo.
   * 
   * @param {string} csvText
   * @returns {Object[]} Массив фото с полями:
   *   { id, order, title, photographer, description, funFact,
   *     imageUrl, imagePreviewUrl, originalUrl, category,
   *     techInfo: { camera, lens, iso, aperture, ... } }
   */
  _parseCSV(csvText) {
    const lines = this._splitCSVLines(csvText);
    if (lines.length < 2) return [];

    const headers = this._parseCSVRow(lines[0]).map(h => h.trim());
    const photos = [];

    for (let i = 1; i < lines.length; i++) {
      const row = this._parseCSVRow(lines[i]);
      if (row.length === 0) continue;

      const photo = {};

      // Заполняем поля из строки CSV
      headers.forEach((header, index) => {
        photo[header] = index < row.length ? row[index].trim() : '';
      });

      // Автосбор техпараметров: всё, что не в BASE_FIELDS
      photo.techInfo = {};
      headers.forEach(header => {
        if (!BASE_FIELDS.includes(header) && photo[header]) {
          photo.techInfo[header] = photo[header];
        }
      });

      // Пропускаем пустые строки (нет id и нет контента)
      if (photo.id && (photo.title || photo.imageUrl)) {
        photos.push(photo);
      }
    }

    // Сортировка: сначала по order (если есть), затем по id
    photos.sort((a, b) => {
      if (a.order && b.order) return Number(a.order) - Number(b.order);
      return Number(a.id) - Number(b.id);
    });

    return photos;
  }

  // ═══════════════════════════════════════
  // CSV-ПАРСЕР
  // ═══════════════════════════════════════

  /**
   * Разбить CSV-текст на строки с учётом кавычек.
   * Многострочные ячейки (с переносами) остаются целыми.
   * 
   * @param {string} text
   * @returns {string[]}
   */
  _splitCSVLines(text) {
    const lines = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      if (char === '"') {
        inQuotes = !inQuotes;
        current += char;
      } else if ((char === '\n' || char === '\r') && !inQuotes) {
        if (char === '\r' && i + 1 < text.length && text[i + 1] === '\n') i++;
        if (current.trim().length > 0) lines.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    if (current.trim().length > 0) lines.push(current);
    return lines;
  }

  /**
   * Разобрать одну строку CSV на массив значений.
   * Поддерживает экранированные кавычки "".
   * 
   * @param {string} line
   * @returns {string[]}
   */
  _parseCSVRow(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    result.push(current);
    return result;
  }

  // ═══════════════════════════════════════
  // РЕЗЕРВНОЕ КОПИРОВАНИЕ
  // ═══════════════════════════════════════

  /**
   * Сохранить данные в localStorage.
   * @param {Object[]} photos
   */
  _saveBackup(photos) {
    try {
      localStorage.setItem(BACKUP_KEY, JSON.stringify(photos));
    } catch (e) {
      console.warn('DataLayer: не удалось сохранить резервную копию');
    }
  }

  /**
   * Восстановить данные из localStorage.
   * @returns {Object[]|null}
   */
  _getBackup() {
    try {
      const raw = localStorage.getItem(BACKUP_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }
}

export default new DataLayer();