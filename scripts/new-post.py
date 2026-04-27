#!/usr/bin/env python3
"""
Creates a new blog post .md file and inserts its metadata into posts-meta.json.

Usage:
  python3 scripts/new-post.py

You will be prompted for:
  - Title
  - Folder  (e.g. kubernetes, aws)
  - Category  (e.g. Kubernetes, AWS)
  - Summary (one-line)
  - Tags   (comma-separated)

The script will:
  1. Derive a slug from the title
  2. Create blog/posts/<folder>/<slug>.md with a starter template
  3. Prepend the metadata entry to assets/data/posts-meta.json
  4. Open the new file in $EDITOR (or VS Code if EDITOR is unset)
"""

import json
import os
import re
import subprocess
import sys
from datetime import date

REPO_ROOT  = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
META_PATH  = os.path.join(REPO_ROOT, "assets", "data", "posts-meta.json")
POSTS_ROOT = os.path.join(REPO_ROOT, "blog", "posts")


def slugify(title: str) -> str:
    slug = title.lower()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_]+", "-", slug)
    slug = slug.strip("-")
    return slug


def prompt(label: str, required: bool = True) -> str:
    while True:
        value = input(f"  {label}: ").strip()
        if value or not required:
            return value
        print(f"  {label} is required.")


def main():
    print("\nnew-post — create a blog post\n")

    title    = prompt("Title")
    folder   = prompt("Folder (e.g. kubernetes, aws)").lower()
    category = prompt("Category (e.g. Kubernetes, AWS)")
    summary  = prompt("Summary (one sentence)")
    tags_raw = prompt("Tags (comma-separated, e.g. Kubernetes,Networking)")

    slug = slugify(title)
    tags = [t.strip() for t in tags_raw.split(",") if t.strip()]
    today = date.today().isoformat()

    # ── Create the .md file ──────────────────────────────────────────────────
    post_dir = os.path.join(POSTS_ROOT, folder)
    os.makedirs(post_dir, exist_ok=True)
    post_path = os.path.join(post_dir, slug + ".md")

    if os.path.exists(post_path):
        print(f"\nFile already exists: {os.path.relpath(post_path, REPO_ROOT)}")
        sys.exit(1)

    template = f"""{summary}

---

## Introduction

<!-- Write your introduction here -->

---

## Section 1

<!-- ... -->

---

## Summary

<!-- Key takeaways -->
"""
    with open(post_path, "w") as f:
        f.write(template)

    # ── Insert metadata at the top of posts-meta.json ───────────────────────
    with open(META_PATH, "r") as f:
        posts = json.load(f)

    entry = {
        "slug": slug,
        "folder": folder,
        "title": title,
        "category": category,
        "date": today,
        "summary": summary,
        "tags": tags,
    }
    posts.insert(0, entry)

    with open(META_PATH, "w") as f:
        json.dump(posts, f, indent=2)
        f.write("\n")

    rel_path = os.path.relpath(post_path, REPO_ROOT)
    print(f"\nCreated:  {rel_path}")
    print(f"Metadata: inserted as first entry in assets/data/posts-meta.json")
    print(f"Slug:     {slug}\n")

    # ── Open in editor ───────────────────────────────────────────────────────
    editor = os.environ.get("EDITOR", "")
    if editor:
        subprocess.run([editor, post_path])
    else:
        try:
            subprocess.run(["code", post_path])
        except FileNotFoundError:
            print(f"Open manually: {rel_path}")


if __name__ == "__main__":
    main()
