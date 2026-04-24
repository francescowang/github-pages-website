'use strict';

(function() {
  const blogPostsMetaSource = document.body.dataset.blogPostsSource;
  const blogViewerPath = document.body.dataset.blogViewerPath || './blog/view.html';
  
  let allPosts = [];
  let activeTag = 'all';
  let searchQuery = '';

  const blogPostsList = document.querySelector('[data-blog-posts-list]');
  const filterList = document.querySelector('[data-filter-list]');
  const searchInput = document.querySelector('[data-blog-search]');

  if (blogPostsMetaSource) {
    fetch(blogPostsMetaSource, { cache: 'no-store' })
      .then(function (response) {
        if (!response.ok) throw new Error('Failed to load posts metadata');
        return response.json();
      })
      .then(function (posts) {
        allPosts = posts.slice().sort(function (a, b) {
          return new Date(b.date) - new Date(a.date);
        });
        
        renderTags(allPosts);
        renderBlogPosts(allPosts);
        setupEventListeners();
      })
      .catch(function (error) {
        console.error('Error loading blog posts:', error);
        if (blogPostsList) {
          blogPostsList.innerHTML = '<li class="blog-post-item"><div class="blog-content"><p class="blog-text">Unable to load blog posts. Run a local server or use GitHub Pages.</p></div></li>';
        }
      });
  }

  function renderTags(posts) {
    if (!filterList) return;
    
    const tags = new Set();
    posts.forEach(post => {
      if (post.tags) {
        post.tags.forEach(tag => tags.add(tag));
      }
    });

    const sortedTags = Array.from(tags).sort();
    
    // Keep "All" and add the others
    filterList.innerHTML = `
      <li class="filter-item">
        <button class="${activeTag === 'all' ? 'active' : ''}" data-filter-btn data-filter-tag="all">All</button>
      </li>
      ${sortedTags.map(tag => `
        <li class="filter-item">
          <button class="${activeTag === tag ? 'active' : ''}" data-filter-btn data-filter-tag="${tag}">${tag}</button>
        </li>
      `).join('')}
    `;
  }

  function renderBlogPosts(posts) {
    if (!blogPostsList) return;

    const filtered = posts.filter(post => {
      const matchesTag = activeTag === 'all' || (post.tags && post.tags.includes(activeTag));
      const matchesSearch = post.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            post.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            (post.tags && post.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase())));
      return matchesTag && matchesSearch;
    });

    if (filtered.length === 0) {
      blogPostsList.innerHTML = '<li class="blog-post-item"><div class="blog-content"><p class="blog-text">No posts found matching your criteria.</p></div></li>';
      return;
    }

    blogPostsList.innerHTML = filtered.map(function (post) {
      return `
        <li class="blog-post-item">
          <a href="${blogViewerPath}?post=${encodeURIComponent(post.slug)}">
            <div class="blog-content">
              <div class="blog-meta">
                <p class="blog-category">${post.category}</p>
                <span class="dot"></span>
                <time datetime="${post.date}">${formatBlogPostDate(post.date)}</time>
              </div>
              <h3 class="h3 blog-item-title">${post.title}</h3>
              <p class="blog-text">${post.summary}</p>
              ${post.tags ? `
                <div class="blog-post-tags">
                  ${post.tags.map(tag => `<span class="post-tag">${tag}</span>`).join('')}
                </div>
              ` : ''}
            </div>
          </a>
        </li>
      `;
    }).join('');
  }

  function formatBlogPostDate(dateValue) {
    const parsedDate = new Date(dateValue);
    if (Number.isNaN(parsedDate.getTime())) return dateValue;
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }).format(parsedDate);
  }

  function setupEventListeners() {
    if (filterList) {
      filterList.addEventListener('click', function(e) {
        const btn = e.target.closest('[data-filter-btn]');
        if (!btn) return;
        
        activeTag = btn.dataset.filterTag;
        
        // Update active class
        filterList.querySelectorAll('[data-filter-btn]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        renderBlogPosts(allPosts);
      });
    }

    if (searchInput) {
      searchInput.addEventListener('input', function(e) {
        searchQuery = e.target.value;
        renderBlogPosts(allPosts);
      });
    }
  }
})();
