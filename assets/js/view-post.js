'use strict';

(function () {

  // ── Reading progress bar ────────────────────────────────────────────────
  var progressBar = document.getElementById('reading-progress');
  if (progressBar) {
    window.addEventListener('scroll', function () {
      var scrollTop    = document.documentElement.scrollTop || document.body.scrollTop;
      var scrollHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      progressBar.style.width = (scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0) + '%';
    }, { passive: true });
  }

  // ── Copy code buttons ───────────────────────────────────────────────────
  function addCopyButtons(container) {
    container.querySelectorAll('pre').forEach(function (pre) {
      var code = pre.querySelector('code');
      if (!code) return;

      var btn = document.createElement('button');
      btn.className = 'copy-btn';
      btn.textContent = 'Copy';
      btn.setAttribute('aria-label', 'Copy code to clipboard');

      btn.addEventListener('click', function () {
        navigator.clipboard.writeText(code.textContent).then(function () {
          btn.textContent = 'Copied!';
          btn.classList.add('copied');
          setTimeout(function () {
            btn.textContent = 'Copy';
            btn.classList.remove('copied');
          }, 2000);
        }).catch(function () {
          btn.textContent = 'Error';
          setTimeout(function () { btn.textContent = 'Copy'; }, 2000);
        });
      });

      pre.appendChild(btn);
    });
  }

  // ── Post fetch + render ─────────────────────────────────────────────────
  const urlParams = new URLSearchParams(window.location.search);
  const postSlug = urlParams.get('post');

  if (!postSlug) {
    document.getElementById('post-content').innerHTML = '<p>No post specified.</p>';
    return;
  }

  fetch('../assets/data/posts-meta.json', { cache: 'no-store' })
    .then(function (r) {
      if (!r.ok) throw new Error('Failed to load post index');
      return r.json();
    })
    .then(function (allPosts) {
      const post = allPosts.find(function (p) { return p.slug === postSlug; });
      if (!post) throw new Error('Post metadata not found');

      const primaryPath = './posts/' + (post.folder ? post.folder + '/' : '') + postSlug + '.md';
      const fallbackPath = './posts/' + postSlug + '.md';
      return fetch(primaryPath, { cache: 'no-store' })
        .then(function (r) {
          if (r.ok) return r.text();
          // Metadata may be stale — try the flat legacy path before giving up.
          return fetch(fallbackPath, { cache: 'no-store' }).then(function (r2) {
            if (!r2.ok) throw new Error('Post not found');
            return r2.text();
          });
        })
        .then(function (content) { return { post: post, content: content }; });
    })
    .then(function (result) {
      const post = result.post;
      const content = result.content;

      document.title = post.title + ' | Francesco Wang';
      document.getElementById('post-category').textContent = post.category || '';
      document.getElementById('post-title').textContent = post.title;

      if (post.date) {
        const dateEl = document.getElementById('post-date');
        dateEl.textContent = new Date(post.date).toLocaleDateString('en-GB', {
          day: '2-digit', month: 'short', year: 'numeric'
        });
        dateEl.setAttribute('datetime', post.date);
      }

      if (post.tags && post.tags.length) {
        document.getElementById('post-tags').innerHTML = post.tags
          .map(function (tag) { return '<span class="post-tag">' + tag + '</span>'; })
          .join('');
      }

      document.getElementById('post-content').innerHTML = marked.parse(content);
      addCopyButtons(document.getElementById('post-content'));

      const wordCount = content.split(/\s+/).length;
      document.getElementById('post-reading-time').textContent = Math.ceil(wordCount / 200) + ' min read';
    })
    .catch(function (error) {
      console.error('Error loading post:', error);
      document.getElementById('post-content').innerHTML = '<p>Error loading post. Please try again.</p>';
    });
})();
