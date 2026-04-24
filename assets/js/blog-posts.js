'use strict';

const blogPostsSource = document.body.dataset.blogPostsSource;
const blogViewerPath = document.body.dataset.blogViewerPath || "./blog/view.html";

// fetch blog posts metadata from JSON
if (blogPostsSource) {
  fetch(blogPostsSource, { cache: "no-store" })
    .then(function (response) {
      if (!response.ok) {
        throw new Error("Failed to load blog posts");
      }
      return response.json();
    })
    .then(function (data) {
      renderBlogPosts(data.posts);
    })
    .catch(function (error) {
      console.error("Error loading blog posts:", error);
      const blogPostsList = document.querySelector("[data-blog-posts-list]");
      if (blogPostsList) {
        blogPostsList.innerHTML = '<li class="blog-post-item"><div class="blog-content"><p class="blog-text">Unable to load blog posts. If you are opening files directly, run a local server or use GitHub Pages.</p></div></li>';
      }
    });
}

const renderBlogPosts = function (posts) {
  const blogPostsList = document.querySelector("[data-blog-posts-list]");
  if (!blogPostsList) return;

  const sortedPosts = [...posts].sort(function (a, b) {
    return new Date(b.date) - new Date(a.date);
  });

  blogPostsList.innerHTML = sortedPosts.map(function (post) {
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

            <p class="blog-text">
              ${post.summary}
            </p>

          </div>

        </a>
      </li>
    `;
  }).join("");
};

const formatBlogPostDate = function (dateValue) {
  const parsedDate = new Date(dateValue);

  if (Number.isNaN(parsedDate.getTime())) {
    return dateValue;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(parsedDate);
};