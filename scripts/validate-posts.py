import json
import os
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
POSTS_ROOT = os.path.join(REPO_ROOT, "blog", "posts")

def validate_source(meta_filename):
    meta_path = os.path.join(REPO_ROOT, "assets", "data", meta_filename)
    if not os.path.exists(meta_path):
        print(f"SKIPPING: {meta_filename} (not found)")
        return True

    with open(meta_path, "r") as f:
        posts = json.load(f)

    missing = []
    for post in posts:
        slug = post.get("slug", "")
        folder = post.get("folder", "")
        path = os.path.join(POSTS_ROOT, folder, slug + ".md")

        if not os.path.isfile(path):
            rel = os.path.relpath(path, REPO_ROOT)
            missing.append(f"  MISSING  {rel}  (slug: {slug!r})")

    if missing:
        print(f"validation failure for {meta_filename}: {len(missing)} missing file(s):\n")
        print("\n".join(missing))
        return False

    print(f"validate-posts: all {len(posts)} items in {meta_filename} OK")
    return True

if __name__ == "__main__":
    blog_ok = validate_source("posts-meta.json")
    tutorial_ok = validate_source("tutorials-meta.json")
    
    if not blog_ok or not tutorial_ok:
        sys.exit(1)
    sys.exit(0)
