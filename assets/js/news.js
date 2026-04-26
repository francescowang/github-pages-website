'use strict';

(function () {
  const newsList = document.getElementById('news-list');
  const securityList = document.getElementById('security-list');
  const CACHE_PATH = './assets/data/news-cache.json';

  function createNewsItemHtml({ title, url, metaContent }) {
    return `
      <li class="news-item">
        <a href="${Utils.escapeHtml(url)}" class="news-link has-bezel" target="_blank" rel="noopener noreferrer">
          <h3 class="news-title">${Utils.escapeHtml(title)}</h3>
          <div class="news-meta">${metaContent}</div>
        </a>
      </li>
    `;
  }

  async function loadCachedNews() {
    try {
      const res = await fetch(CACHE_PATH);
      if (!res.ok) throw new Error('Cache not found');
      const data = await res.json();

      if (newsList && data.tech) {
        newsList.innerHTML = data.tech.map(s => createNewsItemHtml({
          title: s.title,
          url: s.url,
          metaContent: `
            <span class="news-score">⬆ ${s.score}</span>
            <span class="news-comments">💬 ${s.comments}</span>
            <span class="news-source">${s.source}</span>
          `
        })).join('');
        document.getElementById('news-loading').classList.add('hidden');
      }

      if (securityList && data.security) {
        securityList.innerHTML = data.security.map(s => createNewsItemHtml({
          title: s.title,
          url: s.url,
          metaContent: `
            <span class="news-date">📅 ${formatDate(s.date)}</span>
            <span class="news-author">✍️ ${s.author}</span>
            <span class="news-source">AWS Security Blog</span>
          `
        })).join('');
        document.getElementById('security-loading').classList.add('hidden');
      }
    } catch (error) {
      console.error('Cache load error:', error);
      document.getElementById('news-loading')?.classList.add('hidden');
      document.getElementById('security-loading')?.classList.add('hidden');
      document.getElementById('news-error')?.classList.remove('hidden');
      document.getElementById('security-error')?.classList.remove('hidden');
    }
  }

  function formatDate(dateStr) {
    try {
      return new Date(dateStr).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return dateStr;
    }
  }

  loadCachedNews();
})();
