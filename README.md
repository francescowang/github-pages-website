# Francesco Wang - Personal Website

This repository contains a static personal website with dynamic content loading for portfolio data and blog posts.

## How The Website Works

The UI shell is rendered from `index.html`, while content is loaded from JSON and Markdown files at runtime.

- `index.html`: Main single-page app (About, CV, Portfolio, Blog tabs).
- `assets/js/script.js`: Loads and renders profile/CV data from JSON.
- `assets/js/blog-posts.js`: Loads blog post metadata and renders blog cards.
- `assets/data/portfolio.json`: Source of truth for About/CV/skills content.
- `assets/data/blog-posts.json`: Source of truth for blog card metadata.
- `blog/posts/*.md`: Markdown files for full blog post content.
- `blog/view.html`: Blog post viewer page that fetches metadata + markdown and renders the post.

## Data Flow

1. `index.html` declares data sources via body attributes:
	 - `data-portfolio-source`
	 - `data-blog-posts-source`
	 - `data-blog-viewer-path`
2. On load, `script.js` fetches `portfolio.json` and fills CV/About placeholders.
3. `blog-posts.js` fetches `blog-posts.json`, builds blog cards, and links each card to:
	 - `./blog/view.html?post=<slug>`
4. `view.html` uses the `post` query param, loads matching metadata, fetches markdown from `blog/posts/<slug>.md`, and renders it.

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

1. Add metadata entry in `assets/data/blog-posts.json`:

```json
{
	"id": 5,
	"title": "Your Title",
	"category": "Kubernetes",
	"date": "2026-04-24",
	"summary": "One-line summary for the card.",
	"slug": "your-title-slug"
}
```

2. Create markdown file:

- `blog/posts/your-title-slug.md`

3. Refresh browser at `http://127.0.0.1:4173/`.

Your post should appear in Blog and open through the viewer page.

## Common Issues

- Blog cards or CV sections not showing:
	- Ensure you are running with a local server (not `file://`).
- New post not visible:
	- Confirm the slug in `blog-posts.json` exactly matches the markdown filename.
- Viewer says “Post not found”:
	- Confirm query string slug and JSON slug match.
- Viewer says “Error loading post content”:
	- Confirm markdown file exists at `blog/posts/<slug>.md`.

## Deployment

The site is static and can be hosted on GitHub Pages or any static host.

No build step is required for the current setup.
