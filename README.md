# Francesco Wang - Personal Website

This repository contains a static personal website with dynamic content loading for portfolio data and blog posts. No build step, no runtime dependencies.

## How The Website Works

The UI shell is rendered from `index.html`, while content is loaded from JSON and Markdown files at runtime.

### JavaScript

| File | Purpose |
|---|---|
| `assets/js/theme.js` | Loaded before CSS — reads `localStorage`, respects `prefers-color-scheme`, sets `data-theme` to prevent flash of wrong theme. Provides theme toggle buttons. |
| `assets/js/utils.js` | Shared utilities: `formatDate`, `escapeHtml` |
| `assets/js/script.js` | Loads `portfolio.json`, renders About/CV placeholders, handles page navigation |
| `assets/js/blog-posts.js` | Fetches post/tutorial metadata, renders cards with tag filter and search via `PostEngine` class |
| `assets/js/view-post.js` | Fetches post metadata and markdown content, renders the full post in `blog/view.html` |
| `assets/js/news.js` | Loads cached news from `news-cache.json` and renders tech (Hacker News) and security (AWS Blog) news sections. Cache updated by CI workflow. |
| `assets/js/vendor/marked.min.js` | Vendored markdown parser (no CDN dependency) |

### Data Files

| File | Purpose |
|---|---|
| `assets/data/portfolio.json` | Source of truth for profile, CV, skills, and metadata |
| `assets/data/portfolio-about.md` | Long-form About section content (markdown, rendered at runtime) |
| `assets/data/posts-meta.json` | Metadata for all blog posts (slug, title, category, date, summary, tags) |
| `assets/data/tutorials-meta.json` | Metadata for all tutorials (same schema as posts) |
| `assets/data/news-cache.json` | Cached tech and security news, updated by CI |

### Pages

| File | Purpose |
|---|---|
| `index.html` | Main single-page app (About, CV, Portfolio, Blog, Tutorials, News tabs) |
| `blog/view.html` | Blog post and tutorial viewer shell |

## Data Flow

1. `index.html` declares all data sources via `<body>` attributes:
   - `data-portfolio-source`
   - `data-blog-posts-source`
   - `data-tutorials-source`
   - `data-blog-viewer-path`
2. `script.js` fetches `portfolio.json` (with `cache: 'no-store'` for freshness) and fills CV/About placeholders. If `profile.aboutFile` is set, it fetches and renders that markdown file.
3. `blog-posts.js` reads both source attributes and creates a `PostEngine` instance per section. Each engine fetches its metadata JSON with fresh cache, sorts by date descending, and renders cards with tag filters and live search.
4. `view.html` loads `view-post.js`, which reads the `post` query param, searches both metadata files for the matching slug, fetches the markdown file, and renders the full post with a reading progress bar and copy-to-clipboard buttons on code blocks.

## `portfolio.json` Schema

```json
{
  "profile": {
    "name": "string",
    "title": "string",
    "aboutFile": "path/to/about.md",
    "learning": ["string"],
    "languages": ["string"]
  },
  "contact": {
    "email": "string",
    "location": "string",
    "linkedin": "url",
    "github": "url"
  },
  "technologies": ["string"],
  "experience": {
    "work": [{ "title": "string", "period": "string" }],
    "education": [{ "institution": "string", "degree": "string" }],
    "certifications": [{ "title": "string", "description": "string" }],
    "volunteering": [{ "title": "string", "period": "string" }],
    "hobbies": ["string"],
    "soft_skills": ["string"]
  }
}
```

If you change schema keys, update `assets/js/script.js` accordingly.

## Run Locally

Do not open `index.html` directly from file explorer (`file://`) because `fetch()` for JSON/Markdown will fail in most browsers.

Run a static server from the repo root:

```bash
python -m http.server 4173
```

Open `http://127.0.0.1:4173/` and stop with `Ctrl+C`.

## Edit Portfolio Content

- **About text:** edit `assets/data/portfolio-about.md` directly — supports full markdown
- **Everything else:** edit `assets/data/portfolio.json`

Sections rendered from `portfolio.json`:

| Key | Rendered in |
|---|---|
| `profile.aboutFile` | About — fetched and rendered as markdown |
| `profile.learning` | About — "What I'm Learning" tag list |
| `profile.languages` | CV — Languages timeline section |
| `technologies` | About — Technical Skills tag list |
| `experience.work` | CV — Work Experience |
| `experience.certifications` | CV — Certifications |
| `experience.education` | CV — Education |
| `experience.volunteering` | CV — Volunteering & Internships |
| `experience.hobbies` | CV — Hobbies |
| `experience.soft_skills` | About — Soft Skills tag list |

## Add A New Blog Post

The fastest way is the helper script, which prompts for all required fields, creates the `.md` file in the right subfolder, inserts the metadata entry at the top of `posts-meta.json`, and opens the file in your editor:

```bash
python3 scripts/new-post.py
```

Or manually:

1. Add an entry to `assets/data/posts-meta.json`:

```json
{
  "slug": "your-post-slug",
  "folder": "aws",
  "title": "Your Post Title",
  "category": "AWS",
  "date": "2026-05-01",
  "summary": "One-line summary shown on the blog card.",
  "tags": ["AWS", "RDS"]
}
```

`folder` must match the subdirectory under `blog/posts/` (e.g. `kubernetes`, `aws`). Cards are sorted by `date` descending at runtime.

2. Create the markdown file with only the post content (no frontmatter):

```
blog/posts/<folder>/your-post-slug.md
```

3. Refresh browser at `http://127.0.0.1:4173/`.

**To remove a post:** delete the `.md` file and remove its entry from `posts-meta.json`.

## Add A New Tutorial

Same process as blog posts, but use `assets/data/tutorials-meta.json` and place the markdown file under `blog/posts/<folder>/`.

## Scripts & Hooks

| Script | Purpose |
|---|---|
| `python3 scripts/new-post.py` | Interactive helper — creates post file + metadata entry |
| `python3 scripts/validate-posts.py` | Checks every `posts-meta.json` slug has a matching `.md` file |
| `python3 scripts/check-links.py` | Checks internal `href` and `src` references in HTML files |
| `bash scripts/install-hooks.sh` | Installs git pre-commit hook — run once after cloning |

The pre-commit hook runs `validate-posts.py` automatically before every commit. Install it once:

```bash
bash scripts/install-hooks.sh
```

## CI

Three checks run on every PR and on pushes to `main`:

1. **validate-posts** (`.github/workflows/validate-posts.yaml`) — runs on posts or HTML changes:
   - JavaScript syntax validation with `node --check`
   - Every slug in `posts-meta.json` has a matching `.md` file
   - All internal `href`/`src` references in `index.html` and `blog/view.html` resolve
   - No unescaped HTML interpolations in `innerHTML` statements

2. **update-news** (`.github/workflows/update-news.yaml`) — runs on a schedule:
   - Fetches latest tech news from Hacker News API
   - Fetches latest security news from AWS Security Blog RSS
   - Commits updated `news-cache.json` to main branch

## Common Issues

- **Blog cards or CV sections not showing** — ensure you are running with a local server, not `file://` (due to CORS restrictions on `fetch()`)
- **New post not visible** — confirm:
  - An entry with the exact `slug` exists in `posts-meta.json`
  - The markdown file exists at `blog/posts/<folder>/<slug>.md`
  - The `folder` in metadata matches the subdirectory under `blog/posts/`
- **Viewer says "Error loading post"** — check the browser console (F12) for:
  - 404 on the markdown file path
  - 404 on the metadata JSON file
  - Check that the post `slug` matches exactly in metadata
- **About text not showing** — confirm:
  - `profile.aboutFile` in `portfolio.json` points to a valid markdown path
  - The file exists at that path
  - No CORS errors in browser console
- **Theme not persisting** — check that `localStorage` is not disabled in your browser

## Deployment

The site is static — deploy to GitHub Pages or any static host with no build step.

**Important:** ensure `.nojekyll` is present at the repo root. GitHub Pages runs Jekyll by default, which intercepts `.md` files and prevents them from being served raw to `fetch()`. The `.nojekyll` file disables Jekyll entirely.
