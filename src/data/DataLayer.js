import CONFIG from '../config.js';
import Store from '../core/Store.js';

class DataLayer {
  constructor() {
    this._cacheKey = 'vk_exhibition_data';
    this._cacheTimeKey = 'vk_exhibition_cache_time';
  }

  // Загрузка данных
  async load() {
    // Проверяем кеш
    const cached = this._getFromCache();
    if (cached) {
      Store.setPhotos(cached);
      return;
    }

    // Загружаем из Google Sheets
    try {
      const photos = await this._fetchFromSheet();
      this._saveToCache(photos);
      Store.setPhotos(photos);
    } catch (error) {
      console.error('Ошибка загрузки данных:', error);
      // Пробуем отдать устаревший кеш
      const staleCache = this._getFromCache(true);
      if (staleCache) {
        Store.setPhotos(staleCache);
      } else {
        Store.setError(error.message || 'Не удалось загрузить данные');
      }
    }
  }

  // Загрузка из Google Sheets (CSV)
  async _fetchFromSheet() {
    const response = await fetch(CONFIG.SHEET_URL);
    if (!response.ok) {
      throw new Error(`Ошибка HTTP: ${response.status}`);
    }
    const csvText = await response.text();
    return this._parseCSV(csvText);
  }

  // Парсинг CSV
  _parseCSV(csvText) {
    const rows = csvText
      .split('\n')
      .map(row => this._parseCSVRow(row))
      .filter(row => row.length > 0);

    if (rows.length < 2) {
      return [];
    }

    const headers = rows[0].map(h => h.trim());
    const photos = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const photo = {};
      
      // Собираем объект фото из строки
      headers.forEach((header, index) => {
        photo[header] = index < row.length ? row[index].trim() : '';
      });

      // Тех.параметры собираем в отдельный объект для удобства
      photo.techInfo = {};
      if (photo.camera) photo.techInfo.camera = photo.camera;
      if (photo.lens) photo.techInfo.lens = photo.lens;
      if (photo.iso) photo.techInfo.iso = photo.iso;
      // Можно добавить любые другие параметры — aperture, shutterSpeed, focalLength и т.д.
      // они автоматически попадут в photo и photo.techInfo если добавить столбцы в таблицу

      if (photo.id) {
        photos.push(photo);
      }
    }

    // Сортируем по полю order, если есть, иначе по id
    photos.sort((a, b) => {
      if (a.order && b.order) return Number(a.order) - Number(b.order);
      return Number(a.id) - Number(b.id);
    });

    return photos;
  }

  // Парсинг одной строки CSV (учитывает кавычки)
  _parseCSVRow(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
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

  // Сохранение в кеш
  _saveToCache(photos) {
    try {
      localStorage.setItem(this._cacheKey, JSON.stringify(photos));
      localStorage.setItem(this._cacheTimeKey, Date.now().toString());
    } catch (e) {
      console.warn('Не удалось сохранить кеш:', e);
    }
  }

  // Чтение из кеша
  _getFromCache(ignoreExpiry = false) {
    try {
      const cached = localStorage.getItem(this._cacheKey);
      const cacheTime = localStorage.getItem(this._cacheTimeKey);
      
      if (!cached || !cacheTime) return null;
      
      if (!ignoreExpiry) {
        const age = (Date.now() - Number(cacheTime)) / 1000 / 60; // минуты
        if (age > CONFIG.CACHE_TTL) return null;
      }
      
      return JSON.parse(cached);
    } catch (e) {
      return null;
    }
  }
}

export default new DataLayer();