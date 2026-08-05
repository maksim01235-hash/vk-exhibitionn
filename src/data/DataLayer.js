import CONFIG from '../config.js';
import Store from '../core/Store.js';

class DataLayer {
  constructor() {
    this._cacheKey = 'vk_exhibition_data_backup';
  }

  async load() {
    try {
      // Всегда грузим свежие данные из таблицы
      const photos = await this._fetchFromSheet();
      Store.setPhotos(photos);
      // Сохраняем в кеш как резервную копию
      this._saveBackup(photos);
    } catch (error) {
      console.log('Ошибка загрузки, пробуем резервную копию:', error.message);
      // Если не удалось — достаём последнюю удачную копию
      const backup = this._getBackup();
      if (backup) {
        Store.setPhotos(backup);
      } else {
        Store.setError('Не удалось загрузить данные');
      }
    }
  }

  async _fetchFromSheet() {
    const response = await fetch(CONFIG.SHEET_URL);
    if (!response.ok) throw new Error(`Ошибка HTTP: ${response.status}`);
    const csvText = await response.text();
    return this._parseCSV(csvText);
  }

  _parseCSV(csvText) {
    const rows = csvText
      .split('\n')
      .map(row => this._parseCSVRow(row))
      .filter(row => row.length > 0);

    if (rows.length < 2) return [];

    const headers = rows[0].map(h => h.trim());
    const photos = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const photo = {};
      
      headers.forEach((header, index) => {
        photo[header] = index < row.length ? row[index].trim() : '';
      });

      photo.techInfo = {};
      if (photo.camera) photo.techInfo.camera = photo.camera;
      if (photo.lens) photo.techInfo.lens = photo.lens;
      if (photo.iso) photo.techInfo.iso = photo.iso;
      if (photo.aperture) photo.techInfo.aperture = photo.aperture;
      if (photo.shutterSpeed) photo.techInfo.shutterSpeed = photo.shutterSpeed;
      if (photo.focalLength) photo.techInfo.focalLength = photo.focalLength;

      if (photo.id) photos.push(photo);
    }

    photos.sort((a, b) => {
      if (a.order && b.order) return Number(a.order) - Number(b.order);
      return Number(a.id) - Number(b.id);
    });

    return photos;
  }

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

  _saveBackup(photos) {
    try {
      localStorage.setItem(this._cacheKey, JSON.stringify(photos));
    } catch (e) {}
  }

  _getBackup() {
    try {
      const raw = localStorage.getItem(this._cacheKey);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }
}

export default new DataLayer();