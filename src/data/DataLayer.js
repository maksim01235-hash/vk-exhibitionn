/**
 * DataLayer — загрузка и парсинг данных из Google Таблицы.
 * 
 * НАЗНАЧЕНИЕ:
 *   Загружает CSV из опубликованной Google Sheet, парсит в массив объектов,
 *   передаёт в Store. При ошибке сети восстанавливает из localStorage.
 * 
 * ПРИ РАСШИРЕНИИ ДОБАВИТЬ:
 *   — DataLayer для анонсов (отдельная таблица)
 *   — DataLayer для достижений (Firebase/свой API)
 *   — Кеширование изображений в IndexedDB
 */

import CONFIG from '../config.js';
import Store from '../core/Store.js';
import { createLogger } from '../utils/Logger.js';

// ═══════════════════════════════════════
// КОНСТАНТЫ
// ═══════════════════════════════════════

/** Включить логирование */
const DEBUG = false;

/**
 * Поля, которые НЕ попадают в блок «Технические параметры».
 * Всё, что не в этом списке — автоматически отображается в техпараметрах.
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
  'id',              // Уникальный ID фото (для QR-кодов: /#id)
  'order',           // Порядок сортировки в галерее
  'title',           // Название (Markdown)
  'photographer',    // Автор (Markdown)
  'description',     // Описание (Markdown, многострочный)
  'funFact',         // Интересный факт (Markdown)
  'imageUrl',        // Прямая ссылка на полноразмерное изображение
  'imagePreviewUrl', // Прямая ссылка на превью (~400px, ~200 КБ)
  'originalUrl',     // Ссылка на внешний ресурс
  'category',        // Категория (для будущей группировки)
];

/** Ключ для резервной копии в localStorage */
const BACKUP_KEY = 'vk_exhibition_data_backup';

// ═══════════════════════════════════════
// ЛОГГЕР
// ═══════════════════════════════════════

const log = createLogger('DataLayer', DEBUG);

class DataLayer {
  // ═══════════════════════════════════════
  // ПУБЛИЧНЫЙ API
  // ═══════════════════════════════════════

  async load() {
    log('начало загрузки...');
    try {
      const photos = await this._fetchFromSheet();
      Store.setPhotos(photos);
      this._saveBackup(photos);
      log(`загружено ${photos.length} фото, резервная копия сохранена`);
    } catch (error) {
      log(`ошибка загрузки: ${error.message}, пробую кеш`, 'warn');
      const backup = this._getBackup();
      if (backup) {
        Store.setPhotos(backup);
        log(`восстановлено ${backup.length} фото из кеша`);
      } else {
        Store.setError('Нет подключения к интернету');
        log('кеш пуст — показываю ошибку', 'error');
      }
    }
  }

  // ═══════════════════════════════════════
  // ЗАГРУЗКА CSV
  // ═══════════════════════════════════════

  async _fetchFromSheet() {
    const url = CONFIG.EXHIBITION.SHEET_URL;
    log(`запрос к Google Sheets: ${url.substring(0, 60)}...`);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const csvText = await response.text();
    log(`получено ${csvText.length} байт CSV`);

    const photos = this._parseCSV(csvText);
    log(`распаршено ${photos.length} фото`);

    if (DEBUG) {
      photos.forEach(p => log(`  #${p.id}: ${p.title?.substring(0, 50)}`));
    }

    return photos;
  }

  _parseCSV(csvText) {
    const lines = this._splitCSVLines(csvText);
    if (lines.length < 2) {
      log('CSV пуст или содержит только заголовки', 'warn');
      return [];
    }

    const headers = this._parseCSVRow(lines[0]).map(h => h.trim());
    log(`заголовки (${headers.length}): ${headers.join(', ')}`);

    const photos = [];
    let skipped = 0;

    for (let i = 1; i < lines.length; i++) {
      const row = this._parseCSVRow(lines[i]);
      if (row.length === 0) { skipped++; continue; }

      const photo = {};

      headers.forEach((header, index) => {
        photo[header] = index < row.length ? row[index].trim() : '';
      });

      // Автосбор техпараметров
      photo.techInfo = {};
      headers.forEach(header => {
        if (!BASE_FIELDS.includes(header) && photo[header]) {
          photo.techInfo[header] = photo[header];
        }
      });

      if (photo.id && (photo.title || photo.imageUrl)) {
        photos.push(photo);
      } else {
        skipped++;
      }
    }

    if (skipped > 0) log(`пропущено ${skipped} пустых строк`);

    // Сортировка: order → id
    photos.sort((a, b) => {
      if (a.order && b.order) return Number(a.order) - Number(b.order);
      return Number(a.id) - Number(b.id);
    });

    return photos;
  }

  // ═══════════════════════════════════════
  // CSV-ПАРСЕР
  // ═══════════════════════════════════════

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

  _saveBackup(photos) {
    try {
      localStorage.setItem(BACKUP_KEY, JSON.stringify(photos));
      log(`резервная копия сохранена (${photos.length} фото)`);
    } catch (e) {
      log('не удалось сохранить резервную копию', 'warn');
    }
  }

  _getBackup() {
    try {
      const raw = localStorage.getItem(BACKUP_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        log(`резервная копия найдена (${data.length} фото)`);
        return data;
      }
      log('резервная копия отсутствует');
      return null;
    } catch (e) {
      log('ошибка чтения резервной копии', 'error');
      return null;
    }
  }
}

export default new DataLayer();