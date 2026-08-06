import { renderMarkdown } from '../utils/markdown.js';

class InfoPanel {
  constructor() {
    this._container = document.getElementById('info-content');
  }

  render(photo) {
    let html = '';

    if (photo.title) {
      html += `<h2 class="photo-title">${renderMarkdown(photo.title)}</h2>`;
    }

    if (photo.photographer) {
      html += `<div class="photo-photographer">${renderMarkdown(photo.photographer)}</div>`;
    }

    if (photo.description) {
      html += `<div class="photo-description">${renderMarkdown(photo.description)}</div>`;
    }

    if (photo.funFact) {
      html += `
        <div class="photo-funfact">
          <h3>Интересный факт</h3>
          <div class="funfact-content">${renderMarkdown(photo.funFact)}</div>
        </div>
      `;
    }

    const techKeys = Object.keys(photo.techInfo || {}).filter(key => {
      return !key.endsWith('Url') && key !== 'imagePreviewUrl';
    });
    
    if (techKeys.length > 0) {
      html += `
        <div class="photo-techinfo">
          <h3>Технические параметры</h3>
          <div class="tech-params">
            ${techKeys.map(key => {
              const label = this._formatLabel(key);
              if (!label) return '';
              return `
                <div class="tech-param">
                  <span class="tech-param-label">${label}</span>
                  <span class="tech-param-value">${photo.techInfo[key]}</span>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }

    if (photo.originalUrl) {
      html += `
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

    this._container.innerHTML = html;
  }

  _formatLabel(key) {
    if (key.endsWith('Url') || key === 'imagePreviewUrl') return null;
    
    const labels = {
      'camera': 'Камера',
      'lens': 'Объектив',
      'iso': 'ISO',
      'aperture': 'Диафрагма',
      'shutterSpeed': 'Выдержка',
      'focalLength': 'Фокусное расстояние',
      'exposure': 'Экспозиция',
      'flash': 'Вспышка',
      'whiteBalance': 'Баланс белого',
    };
    return labels[key] || key.charAt(0).toUpperCase() + key.slice(1);
  }
}

export default InfoPanel;