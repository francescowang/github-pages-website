'use strict';

(function () {
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

  const urlParams = new URLSearchParams(window.location.search);
  const postSlug = urlParams.get('post');

  if (!postSlug) {
    document.getElementById('post-content').innerHTML = '<p>No post specified.</p>';
  } else {
    fetch(`./posts/${postSlug}.md`, { cache: 'no-store' })
      .then(function (response) {
        if (!response.ok) throw new Error('Post not found');
        return response.text();
      })
      .then(function (raw) {
        const { meta, content } = parseFrontmatter(raw);

        document.title = `${meta.title || postSlug} | Francesco Wang`;
        document.getElementById('post-category').textContent = meta.category || '';
        document.getElementById('post-title').textContent = meta.title || postSlug;

        if (meta.date) {
          document.getElementById('post-date').textContent = new Date(meta.date).toLocaleDateString('en-GB', {
            day: '2-digit', month: 'short', year: 'numeric'
          });
          document.getElementById('post-date').setAttribute('datetime', meta.date);
        }

        if (meta.tags) {
          const tagsArr = meta.tags.split(',').map(t => t.trim());
          document.getElementById('post-tags').innerHTML = tagsArr.map(tag => `<span class="post-tag">${tag}</span>`).join('');
        }

        document.getElementById('post-content').innerHTML = marked.parse(content);

        const wordCount = content.split(/\s+/).length;
        document.getElementById('post-reading-time').textContent = `${Math.ceil(wordCount / 200)} min read`;
      })
      .catch(function (error) {
        console.error('Error loading post:', error);
        document.getElementById('post-content').innerHTML = '<p>Error loading post. Please try again.</p>';
      });
  }
})();
