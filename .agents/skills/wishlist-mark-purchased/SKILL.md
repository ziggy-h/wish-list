---
name: wishlist-mark-purchased
description: Mark an entire item or specific color/variant as purchased (or remove it) in the ziggy-h/wish-list repository, updating wishlist.yaml and regenerating README.md. Use when the user says an item or color was bought, received, or should be crossed off.
---

# Wishlist: Mark Purchased

Use this skill when crossing off a full item or specific color/variant in `ziggy-h/wish-list`.

## Steps

1. **Locate the matching item(s) in `wishlist.yaml`**:
   - Search `wishlist.yaml` by item `id`, `name`, or category.
   - If the request is ambiguous (multiple matching items or variants), ask the user to confirm which entry to update.

2. **Apply the purchase update**:
   - **Partial purchase (specific color/variant):**
     - Convert the matching entry in `colors` from a plain string to an object with `purchased: true`:

       ```yaml
       - name: yellow perch
         purchased: true
       ```

     - The renderer automatically formats it as `~~yellow perch~~` in `README.md`.
     - If **all** colors on an item are now purchased, ask whether to mark the entire item `purchased: true` as well (unless the user already asked to mark the whole item purchased).
   - **Full item purchase:**
     - By default, set `purchased: true` and `purchased_date: "<YYYY-MM-DD>"` on the item in `wishlist.yaml`. This removes it from the rendered `README.md` while preserving purchase history in `wishlist.yaml`.
     - If the user explicitly asks to delete/remove the item permanently, remove the entry from `wishlist.yaml` instead.
   - **Reduced quantity (e.g. bought 1 of 2):**
     - Decrement `quantity` (remove the `quantity` field if it becomes `1` and no longer needs explicit display, or keep as requested).

3. **Render and verify**:
   - Run:

     ```bash
     npm run render && npm run check && npm test
     ```

   - Summarize what was crossed off or hidden from `README.md`, and open a PR on a feature branch (or ask if they'd like a PR opened).
