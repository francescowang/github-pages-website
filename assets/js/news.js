'use strict';

(function () {
  const newsList = document.getElementById('news-list');
  const loadingMessage = document.getElementById('news-loading');
  const errorMessage = document.getElementById('news-error');

  if (!newsList) return;

  const HN_API = 'https://hacker-news.firebaseapp.com/v0';
  const STORIES_TO_FETCH = 10;

  async function fetchNews() {
    try {
      // Fetch top story IDs
      const topStoriesRes = await fetch(`${HN_API}/topstories.json`);
      if (!topStoriesRes.ok) throw new Error('Failed to fetch story IDs');
      
      const topStoryIds = await topStoriesRes.json();
      
      // Fetch first 10 stories
      const storyPromises = topStoryIds.slice(0, STORIES_TO_FETCH).map(id =>
        fetch(`${HN_API}/item/${id}.json`).then(res => res.json())
      );

      const stories = await Promise.all(storyPromises);
      
      // Filter out deleted/dead stories and render
      const validStories = stories.filter(s => s && s.title && s.url);
      renderStories(validStories);
      loadingMessage.style.display = 'none';
    } catch (error) {
      console.error('Error fetching news:', error);
      loadingMessage.style.display = 'none';
      errorMessage.style.display = 'block';
    }
  }

  function renderStories(stories) {
    newsList.innerHTML = stories.map(story => `
      <li class="news-item">
        <a href="${story.url}" class="news-link" target="_blank" rel="noopener noreferrer">
          <h3 class="news-title">${escapeHtml(story.title)}</h3>
          <div class="news-meta">
            <span class="news-score">⬆ ${story.score}</span>
            <span class="news-comments">💬 ${story.descendants || 0}</span>
            <span class="news-source">${extractDomain(story.url)}</span>
          </div>
        </a>
      </li>
    `).join('');
  }

  function extractDomain(url) {
    try {
      const domain = new URL(url).hostname;
      return domain.replace('www.', '');
    } catch {
      return 'Hacker News';
    }
  }

  function escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }

  // Fetch on page load
  fetchNews();

  // Refresh every 30 minutes
  setInterval(fetchNews, 30 * 60 * 1000);
})();
