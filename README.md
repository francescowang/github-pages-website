# Francesco Wang - Personal Website

This repository contains a static personal website with dynamic content loading for portfolio data and blog posts.

## How The Website Works

The UI shell is rendered from `index.html`, while content is loaded from JSON and Markdown files at runtime.

- `index.html`: Main single-page app (About, CV, Portfolio, Blog tabs).
- `assets/js/script.js`: Loads and renders profile/CV data from JSON.
- `assets/js/blog-posts.js`: Fetches `posts-meta.json` in a single request and renders blog cards.
- `assets/data/portfolio.json`: Source of truth for About/CV/skills content.
- `assets/data/posts-meta.json`: Source of truth for blog card metadata (slug, title, category, date, summary). One entry per post.
- `blog/posts/*.md`: Markdown files — the full body of each post. Frontmatter is optional (only needed by the viewer for rendering the post title/date).
- `blog/view.html`: Blog post viewer. Fetches the markdown file directly, parses frontmatter, and renders the post.

## Data Flow

1. `index.html` declares data sources via body attributes:
	 - `data-portfolio-source`
	 - `data-blog-posts-source`
	 - `data-blog-viewer-path`
2. On load, `script.js` fetches `portfolio.json` and fills CV/About placeholders.
3. `blog-posts.js` fetches `posts-meta.json` (a single JSON request), sorts by date, and renders all blog cards. Each card links to:
	 - `./blog/view.html?post=<slug>`
4. `view.html` uses the `post` query param, fetches `blog/posts/<slug>.md`, parses the frontmatter, and renders the post body via `marked.js`.

## Run Locally

Do not open `index.html` directly from file explorer (`file://...`) because `fetch()` for JSON/Markdown will fail in most browsers.

Run a static server from the repo root:

```bash
cd /Users/frankie/Desktop/github-pages-website
/Users/frankie/Desktop/github-pages-website/.venv/bin/python -m http.server 4173
```

Open:

- `http://127.0.0.1:4173/`

Stop server with `Ctrl+C`.

## Edit Portfolio Content

Update this file:

- `assets/data/portfolio.json`

Sections currently rendered from it:

- `profile.about`
- `technologies`
- `experience.work`
- `experience.certifications`
- `experience.education`
- `experience.volunteering`
- `experience.hobbies`

If you change schema keys, update `assets/js/script.js` accordingly.

## Add A New Blog Post

1. Add an entry to `assets/data/posts-meta.json`:

```json
{
  "slug": "your-post-slug",
  "title": "Your Post Title",
  "category": "Kubernetes",
  "date": "2026-05-01",
  "summary": "One-line summary shown on the blog card."
}
```

Order in the array controls display order (newest first by convention). Cards are also sorted by `date` descending at runtime.

2. Create the markdown file:

- `blog/posts/your-post-slug.md`

The viewer expects the following frontmatter at the top of the file:

```markdown
---
title: Your Post Title
category: Kubernetes
date: 2026-05-01
summary: One-line summary shown on the blog card.
---

# Your Post Title

Post body starts here...
```

3. Refresh browser at `http://127.0.0.1:4173/`.

The post card will appear in Blog and open in the viewer.

**To remove a post:** delete the `.md` file and remove its entry from `posts-meta.json`. Remaining posts are unaffected.

## Common Issues

- Blog cards or CV sections not showing:
	- Ensure you are running with a local server (not `file://`).
- New post not visible:
	- Confirm an entry with the correct `slug` exists in `assets/data/posts-meta.json`.
	- Confirm the markdown file exists at `blog/posts/<slug>.md` (slug must match exactly).
- Viewer says "Error loading post":
	- Confirm the markdown file exists at `blog/posts/<slug>.md`.
	- Confirm the frontmatter block is valid (starts and ends with `---`).

## Deployment

The site is static and can be hosted on GitHub Pages or any static host.

No build step is required for the current setup.
