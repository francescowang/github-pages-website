'use strict';

(async function () {

  // reading progress bar
  const progressBar = document.getElementById('reading-progress');
  if (progressBar) {
    window.addEventListener('scroll', () => {
      const scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
      const scrollHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      progressBar.style.width = (scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0) + '%';
    }, { passive: true });
  }

  function addCopyButtons(container) {
    container.querySelectorAll('pre').forEach(pre => {
      const code = pre.querySelector('code');
      if (!code) return;

      const btn = document.createElement('button');
      btn.className = 'copy-btn';
      btn.textContent = 'Copy';
      btn.setAttribute('aria-label', 'Copy code to clipboard');

      btn.addEventListener('click', () => {
        navigator.clipboard.writeText(code.textContent)
          .then(() => {
            btn.textContent = 'Copied!';
            btn.classList.add('copied');
            setTimeout(() => {
              btn.textContent = 'Copy';
              btn.classList.remove('copied');
            }, 2000);
          })
          .catch(() => {
            btn.textContent = 'Error';
            setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
          });
      });

      pre.appendChild(btn);
    });
  }

  const postSlug = new URLSearchParams(window.location.search).get('post');
  const contentEl = document.getElementById('post-content');

  if (!postSlug) {
    if (contentEl) contentEl.innerHTML = '<p>No post specified.</p>';
    return;
  }

  try {
    const metaSources = [
      '../assets/data/posts-meta.json',
      '../assets/data/tutorials-meta.json'
    ];

    const metaResults = await Promise.all(
      metaSources.map(url =>
        fetch(url, { cache: 'no-store' })
          .then(res => res.ok ? res.json() : [])
          .catch(() => [])
      )
    );

    const allPosts = metaResults.flat();
    const post = allPosts.find(p => p.slug === postSlug);

    if (!post) throw new Error('Post not found: ' + postSlug);

    const primaryPath = './posts/' + (post.folder ? post.folder + '/' : '') + postSlug + '.md';
    const fallbackPath = './posts/' + postSlug + '.md';

    let mdRes = await fetch(primaryPath, { cache: 'no-store' });
    if (!mdRes.ok) {
      mdRes = await fetch(fallbackPath, { cache: 'no-store' });
      if (!mdRes.ok) throw new Error('Markdown file not found');
    }
    const content = await mdRes.text();

    document.title = post.title + ' | Francesco Wang';

    const categoryEl = document.getElementById('post-category');
    if (categoryEl) categoryEl.textContent = post.category || '';

    const titleEl = document.getElementById('post-title');
    if (titleEl) titleEl.textContent = post.title;

    const dateEl = document.getElementById('post-date');
    if (dateEl && post.date) {
      dateEl.textContent = Utils.formatDate(post.date);
      dateEl.setAttribute('datetime', post.date);
    }

    const tagsEl = document.getElementById('post-tags');
    if (tagsEl && post.tags?.length) {
      tagsEl.innerHTML = post.tags.map(tag => `<span class="post-tag">${Utils.escapeHtml(tag)}</span>`).join('');
    }

    if (contentEl) {
      contentEl.innerHTML = marked.parse(content);
      addCopyButtons(contentEl);

      const timeEl = document.getElementById('post-reading-time');
      if (timeEl) timeEl.textContent = Math.ceil(content.split(/\s+/).length / 200) + ' min read';
    }
  } catch (error) {
    console.error('Error loading post:', error);
    if (contentEl) {
      contentEl.innerHTML = `
        <div class="error-container">
          <p>Error loading post. Please try again.</p>
          <p style="font-size: var(--fs-8); color: var(--light-gray-70); margin-top: 10px;">Details: ${error.message}</p>
        </div>
      `;
    }
  }

}());
