'use strict';

class PostEngine {
  constructor(containerSelector, sourceUrl) {
    this.container = document.querySelector(containerSelector);
    if (!this.container) return;

    this.sourceUrl = sourceUrl;
    this.viewerPath = document.body.dataset.blogViewerPath || './blog/view.html';
    
    this.allPosts = [];
    this.activeTag = 'all';
    this.searchQuery = '';

    this.postsList = this.container.querySelector('[data-blog-posts-list]');
    this.filterList = this.container.querySelector('[data-filter-list]');
    this.searchInput = this.container.querySelector('[data-blog-search]');

    this.init();
  }

  async init() {
    try {
      const response = await fetch(this.sourceUrl, { cache: 'no-store' });
      if (!response.ok) throw new Error('Failed to load posts');
      
      const posts = await response.json();
      this.allPosts = posts.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
      
      this.renderTags();
      this.renderPosts();
      this.setupEventListeners();
    } catch (error) {
      console.error(`Error loading posts from ${this.sourceUrl}:`, error);
      if (this.postsList) {
        this.postsList.innerHTML = '<li class="blog-post-item"><div class="blog-content"><p class="blog-text">Unable to load content at this time.</p></div></li>';
      }
    }
  }

  renderTags() {
    if (!this.filterList) return;
    
    const tags = new Set();
    this.allPosts.forEach(post => {
      if (post.tags) post.tags.forEach(tag => tags.add(tag));
    });

    const sortedTags = Array.from(tags).sort();
    
    this.filterList.innerHTML = `
      <li class="filter-item">
        <button class="${this.activeTag === 'all' ? 'active' : ''}" data-filter-btn data-filter-tag="all">All</button>
      </li>
      ${sortedTags.map(tag => `
        <li class="filter-item">
          <button class="${this.activeTag === tag ? 'active' : ''}" data-filter-btn data-filter-tag="${Utils.escapeHtml(tag)}">${Utils.escapeHtml(tag)}</button>
        </li>
      `).join('')}
    `;
  }

  renderPosts() {
    if (!this.postsList) return;

    const filtered = this.allPosts.filter(post => {
      const matchesTag = this.activeTag === 'all' || (post.tags && post.tags.includes(this.activeTag));
      const matchesSearch = post.title.toLowerCase().includes(this.searchQuery.toLowerCase()) || 
                            post.summary.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
                            (post.tags && post.tags.some(t => t.toLowerCase().includes(this.searchQuery.toLowerCase())));
      return matchesTag && matchesSearch;
    });

    if (filtered.length === 0) {
      this.postsList.innerHTML = '<li class="blog-post-item"><div class="blog-content"><p class="blog-text">No items found matching your criteria.</p></div></li>';
      return;
    }

    this.postsList.innerHTML = filtered.map(post => `
      <li class="blog-post-item">
        <a href="${this.viewerPath}?post=${encodeURIComponent(post.slug)}">
          <div class="blog-content">
            <div class="blog-meta">
              <p class="blog-category">${Utils.escapeHtml(post.category)}</p>
              <span class="dot"></span>
              <time datetime="${post.date}">${Utils.formatDate(post.date)}</time>
            </div>
            <h3 class="h3 blog-item-title">${Utils.escapeHtml(post.title)}</h3>
            <p class="blog-text">${Utils.escapeHtml(post.summary)}</p>
            ${post.tags ? `
              <div class="blog-post-tags">
                ${post.tags.map(tag => `<span class="post-tag">${Utils.escapeHtml(tag)}</span>`).join('')}
              </div>
            ` : ''}
          </div>
        </a>
      </li>
    `).join('');
  }

  setupEventListeners() {
    if (this.filterList) {
      this.filterList.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-filter-btn]');
        if (!btn) return;
        
        const clickedTag = btn.dataset.filterTag;
        this.activeTag = (clickedTag !== 'all' && clickedTag === this.activeTag) ? 'all' : clickedTag;
        
        this.filterList.querySelectorAll('[data-filter-btn]').forEach(b => {
          b.classList.toggle('active', b.dataset.filterTag === this.activeTag);
        });
        
        this.renderPosts();
      });
    }

    if (this.searchInput) {
      this.searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value;
        this.renderPosts();
      });
    }
  }
}

// Initialize for both sections
document.addEventListener('DOMContentLoaded', () => {
  const blogSource = document.body.dataset.blogPostsSource;
  if (blogSource) new PostEngine('article.blog', blogSource);

  const tutorialsSource = document.body.dataset.tutorialsSource;
  if (tutorialsSource) new PostEngine('article.tutorials', tutorialsSource);
});
