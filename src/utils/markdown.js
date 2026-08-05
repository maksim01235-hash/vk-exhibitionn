// Утилита для рендеринга Markdown
// Использует библиотеку marked (подключена в index.html)

export function renderMarkdown(text) {
  if (!text) return '';
  
  // Если marked доступен глобально
  if (typeof marked !== 'undefined') {
    return marked.parse(text, { 
      breaks: true,  // Переносы строк как <br>
      gfm: true,     // GitHub Flavored Markdown
    });
  }
  
  // Запасной вариант: простой escape HTML и перевод строк
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}