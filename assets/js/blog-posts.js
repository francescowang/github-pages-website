'use strict';

// parse YAML-style frontmatter from a raw markdown string
const parseFrontmatter = function (raw) {
  if (!raw.startsWith('---')) return { meta: {}, content: raw };
  const end = raw.indexOf('\n---', 3);
  if (end === -1) return { meta: {}, content: raw };
  const block = raw.slice(4, end);
  const meta = {};
  for (const line of block.split('\n')) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    meta[line.slice(0, colon).trim()] = line.slice(colon + 1).trim().replace(/^"|"$/g, '');
  }
  return { meta, content: raw.slice(end + 4).trimStart() };
};

const blogPostsIndexSource = document.body.dataset.blogPostsSource;
const blogViewerPath = document.body.dataset.blogViewerPath || './blog/view.html';
const blogPostsBasePath = './blog/posts/';

if (blogPostsIndexSource) {
  fetch(blogPostsIndexSource, { cache: 'no-store' })
    .then(function (response) {
      if (!response.ok) throw new Error('Failed to load post index');
      return response.json();
    })
    .then(function (slugs) {
      return Promise.all(
        slugs.map(function (slug) {
          return fetch(`${blogPostsBasePath}${slug}.md`, { cache: 'no-store' })
            .then(function (r) {
              if (!r.ok) throw new Error(`Failed to load ${slug}.md`);
              return r.text();
            })
            .then(function (raw) {
              const { meta } = parseFrontmatter(raw);
              return { slug, title: meta.title || slug, category: meta.category || '', date: meta.date || '', summary: meta.summary || '' };
            })
            .catch(function () {
              // skip missing or unreadable posts without failing the whole list
              return null;
            });
        })
      );
    })
    .then(function (results) {
      const posts = results.filter(function (p) { return p !== null; });
      const sorted = posts.sort(function (a, b) {
        return new Date(b.date) - new Date(a.date);
      });
      renderBlogPosts(sorted);
    })
    .catch(function (error) {
      console.error('Error loading blog posts:', error);
      const blogPostsList = document.querySelector('[data-blog-posts-list]');
      if (blogPostsList) {
        blogPostsList.innerHTML = '<li class="blog-post-item"><div class="blog-content"><p class="blog-text">Unable to load blog posts. Run a local server or use GitHub Pages.</p></div></li>';
      }
    });
}

const renderBlogPosts = function (posts) {
  const blogPostsList = document.querySelector('[data-blog-posts-list]');
  if (!blogPostsList) return;

  if (posts.length === 0) {
    blogPostsList.innerHTML = '<li class="blog-post-item"><div class="blog-content"><p class="blog-text">No posts yet — check back soon.</p></div></li>';
    return;
  }

  blogPostsList.innerHTML = posts.map(function (post) {
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
          </div>
        </a>
      </li>
    `;
  }).join('');
};

const formatBlogPostDate = function (dateValue) {
  const parsedDate = new Date(dateValue);
  if (Number.isNaN(parsedDate.getTime())) return dateValue;
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(parsedDate);
};
