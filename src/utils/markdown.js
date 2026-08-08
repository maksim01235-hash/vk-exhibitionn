/**
 * Утилита для рендеринга Markdown в HTML.
 * 
 * НАЗНАЧЕНИЕ:
 *   Преобразует Markdown-строку в HTML через библиотеку marked.
 *   Если библиотека не загрузилась — fallback с экранированием HTML.
 * 
 * ПОДДЕРЖИВАЕМЫЙ СИНТАКСИС (GitHub Flavored Markdown):
 *   **жирный**, *курсив*, ~~зачёркнутый~~, `код`
 *   [ссылка](url), ![картинка](url)
 *   # Заголовок 1, ## Заголовок 2, ### Заголовок 3
 *   - маркированный список, 1. нумерованный список
 *   > цитата, --- горизонтальная линия
 * 
 * РАСШИРЕНИЕ:
 *   — Поддержка HTML-тегов в Markdown
 *   — Подсветка синтаксиса для блоков кода
 *   — Кастомные рендереры (вставка компонентов)
 */

// ═══════════════════════════════════════
// НАСТРОЙКИ MARKED
// ═══════════════════════════════════════

/**
 * Настройки для marked.parse().
 * 
 * breaks: true — одиночный перенос строки внутри абзаца → <br>
 *   Без: "строка1\nстрока2" → "строка1 строка2"
 *   С:   "строка1\nстрока2" → "строка1<br>строка2"
 * 
 * gfm: true — GitHub Flavored Markdown (таблицы, списки задач, зачёркнутый)
 */
const MARKED_OPTIONS = {
  breaks: true,
  gfm: true,
};

/**
 * Рендерит Markdown-строку в HTML.
 * @param {string} text — сырой Markdown
 * @returns {string} HTML
 * 
 * @example
 *   renderMarkdown('**Жирный** и *курсив*')
 *   // → '<strong>Жирный</strong> и <em>курсив</em>'
 */
export function renderMarkdown(text) {
  if (!text) return '';

  // marked доступен — используем полноценный рендер
  if (typeof marked !== 'undefined') {
    return marked.parse(text, MARKED_OPTIONS);
  }

  // Fallback: marked не загрузился (офлайн, блокировщик)
  // Экранируем HTML и сохраняем переносы строк
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}