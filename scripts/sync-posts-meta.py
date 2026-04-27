#!/usr/bin/env python3
"""
Regenerates assets/data/posts-meta.json and assets/data/tutorials-meta.json
by scanning YAML front-matter in every .md file under blog/posts/.

Front-matter format (must appear at the very top of the file):
---
title:    "My Post Title"
slug:     my-post-slug
folder:   kubernetes
category: Kubernetes
date:     2026-04-27
summary:  "One sentence description."
tags:     ["Kubernetes", "Networking"]
type:     post        # "post" (default) or "tutorial"
---

Run directly:
  python3 scripts/sync-posts-meta.py

Called automatically by:
  - scripts/new-post.py  (after creating a new file)
  - scripts/hooks/pre-commit  (before every commit)

Files without valid front-matter are silently skipped.
"""

import json
import os
import re
import sys

REPO_ROOT  = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
POSTS_ROOT = os.path.join(REPO_ROOT, "blog", "posts")
POSTS_META = os.path.join(REPO_ROOT, "assets", "data", "posts-meta.json")
TUTS_META  = os.path.join(REPO_ROOT, "assets", "data", "tutorials-meta.json")

REQUIRED = {"title", "slug", "folder", "category", "date", "summary"}


def parse_front_matter(path: str) -> dict | None:
    """Return a dict of front-matter keys, or None if not present / invalid."""
    try:
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
    except OSError:
        return None

    if not content.startswith("---"):
        return None

    end = content.find("\n---", 3)
    if end == -1:
        return None

    fm_text = content[3:end].strip()
    data = {}

    for line in fm_text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        m = re.match(r'^(\w+)\s*:\s*(.+)$', line)
        if not m:
            continue
        key, val = m.group(1).strip(), m.group(2).strip()

        # Handle inline YAML lists:  ["a", "b"]  or  [a, b]
        if val.startswith("[") and val.endswith("]"):
            inner = val[1:-1]
            items = [re.sub(r'^["\']|["\']$', '', i.strip()) for i in inner.split(",") if i.strip()]
            data[key] = items
        else:
            # Strip surrounding quotes from scalar values
            data[key] = re.sub(r'^["\']|["\']$', '', val)

    if not REQUIRED.issubset(data.keys()):
        return None

    return data


def build_entry(fm: dict) -> dict:
    entry = {
        "slug":     fm["slug"],
        "folder":   fm["folder"],
        "title":    fm["title"],
        "category": fm["category"],
        "date":     fm["date"],
        "summary":  fm["summary"],
    }
    if "tags" in fm:
        entry["tags"] = fm["tags"] if isinstance(fm["tags"], list) else [fm["tags"]]
    return entry


def main() -> int:
    posts     = []
    tutorials = []
    skipped   = []

    for root, _dirs, files in os.walk(POSTS_ROOT):
        for fname in sorted(files):
            if not fname.endswith(".md"):
                continue
            path = os.path.join(root, fname)
            fm = parse_front_matter(path)
            if fm is None:
                skipped.append(os.path.relpath(path, REPO_ROOT))
                continue

            entry    = build_entry(fm)
            fm_type  = fm.get("type", "post").strip().lower()

            if fm_type == "tutorial":
                tutorials.append(entry)
            else:
                posts.append(entry)

    # Sort both lists newest-first
    posts.sort(key=lambda x: x["date"], reverse=True)
    tutorials.sort(key=lambda x: x["date"], reverse=True)

    with open(POSTS_META, "w", encoding="utf-8") as f:
        json.dump(posts, f, indent=2, ensure_ascii=False)
        f.write("\n")

    with open(TUTS_META, "w", encoding="utf-8") as f:
        json.dump(tutorials, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(f"sync-posts-meta: {len(posts)} post(s), {len(tutorials)} tutorial(s) written.")
    if skipped:
        print(f"  Skipped (no front-matter): {len(skipped)} file(s)")
        for s in skipped:
            print(f"    {s}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
