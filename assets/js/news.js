'use strict';

(function () {
  // Elements for Hacker News
  const newsList = document.getElementById('news-list');
  const loadingMessage = document.getElementById('news-loading');
  const errorMessage = document.getElementById('news-error');

  // Elements for Security News
  const securityList = document.getElementById('security-list');
  const securityLoading = document.getElementById('security-loading');
  const securityError = document.getElementById('security-error');

  const HN_API = 'https://hacker-news.firebaseio.com/v0';
  const AWS_SECURITY_RSS = 'https://aws.amazon.com/blogs/security/feed/';
  const RSS2JSON_API = 'https://api.rss2json.com/v1/api.json';
  
  const STORIES_TO_FETCH = 10;

  /**
   * Hacker News Fetching
   */
  async function fetchHN() {
    if (!newsList) return;
    try {
      const topStoriesRes = await fetch(`${HN_API}/topstories.json`);
      if (!topStoriesRes.ok) throw new Error('Failed to fetch story IDs');
      
      const topStoryIds = await topStoriesRes.json();
      if (!Array.isArray(topStoryIds)) throw new Error('Invalid story IDs format');
      
      const storyPromises = topStoryIds.slice(0, STORIES_TO_FETCH).map(id =>
        fetch(`${HN_API}/item/${id}.json`)
          .then(res => res.ok ? res.json() : null)
          .catch(() => null)
      );

      const stories = await Promise.all(storyPromises);
      const validStories = stories.filter(s => s && s.title && s.url);
      
      renderHN(validStories);
      loadingMessage.style.display = 'none';
    } catch (error) {
      console.error('Error fetching tech news:', error);
      loadingMessage.style.display = 'none';
      errorMessage.style.display = 'block';
    }
  }

  function renderHN(stories) {
    newsList.innerHTML = stories.map(story => `
      <li class="news-item">
        <a href="${escapeHtml(story.url)}" class="news-link" target="_blank" rel="noopener noreferrer">
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

  /**
   * AWS Security News Fetching
   */
  async function fetchSecurity() {
    if (!securityList) return;
    try {
      const response = await fetch(`${RSS2JSON_API}?rss_url=${encodeURIComponent(AWS_SECURITY_RSS)}&count=${STORIES_TO_FETCH}`);
      if (!response.ok) throw new Error('Failed to fetch security news');
      
      const data = await response.json();
      if (data.status !== 'ok') throw new Error(data.message || 'Failed to parse RSS');

      renderSecurity(data.items);
      securityLoading.style.display = 'none';
    } catch (error) {
      console.error('Error fetching security news:', error);
      securityLoading.style.display = 'none';
      securityError.style.display = 'block';
    }
  }

  function renderSecurity(items) {
    securityList.innerHTML = items.map(item => `
      <li class="news-item">
        <a href="${escapeHtml(item.link)}" class="news-link" target="_blank" rel="noopener noreferrer">
          <h3 class="news-title">${escapeHtml(item.title)}</h3>
          <div class="news-meta">
            <span class="news-date">📅 ${formatDate(item.pubDate)}</span>
            <span class="news-author">✍️ ${escapeHtml(item.author || 'AWS Security')}</span>
            <span class="news-source">AWS Security Blog</span>
          </div>
        </a>
      </li>
    `).join('');
  }

  /**
   * Helpers
   */
  function extractDomain(url) {
    try {
      const domain = new URL(url).hostname;
      return domain.replace('www.', '');
    } catch {
      return 'Hacker News';
    }
  }

  function escapeHtml(text) {
    if (!text) return '';
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }

  function formatDate(dateStr) {
    if (!dateStr) return 'Recent';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString(undefined, { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
      });
    } catch {
      return dateStr;
    }
  }

  // Initial fetches
  fetchHN();
  fetchSecurity();

  // Refresh every 30 minutes
  setInterval(() => {
    fetchHN();
    fetchSecurity();
  }, 30 * 60 * 1000);
})();
