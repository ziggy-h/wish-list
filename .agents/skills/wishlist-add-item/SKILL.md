---
name: wishlist-add-item
description: Add a new item to the ziggy-h/wish-list repository from a product URL, product name, or description, updating wishlist.yaml and regenerating a mobile-optimized README.md. Use when the user asks to add an item to their wish list.
---

# Wishlist: Add Item

Use this skill when adding one or more new items to `ziggy-h/wish-list`.

## Steps

1. **Gather product details**:
   - If the user provides a URL, fetch the page (or search if blocked) to confirm the canonical product title, manufacturer/product URL, clean direct image URL, current lowest USD price, retailer name + clean buy URL, and any relevant attributes (`colors`, `size`, `weight`, `model`, `power`, `action`, `option`, `quantity`, `notes`).
   - If the user provides only a product name or rough description, search for the exact product and verify the best retailer price, image URL, and specs before editing.
   - If a retailer page is gated by a CAPTCHA or anti-bot wall, do not bypass it — use another retailer/manufacturer source or ask the user for the missing detail.

2. **Clean URLs and optimize for mobile display**:
   - Strip tracking/referral query parameters (`msclkid`, `gclid`, `fbclid`, `utm_*`, `ref=`, `pd_rd_*`, `pf_rd_*`, `dib=`, `wmlspartner`, `gad_*`, etc.).
   - For Amazon, prefer canonical `https://www.amazon.com/dp/<ASIN>`.
   - Preserve functional variant query parameters (`variant=`, `color=`, `childSku=`, `sku=`).
   - Ensure `image.url` is a clean direct image URL (no `&amp;` HTML entities, no trailing `%201280w` `srcset` descriptors). When the retailer or CDN provides resized image variants, prefer a lightweight mobile-friendly size (roughly 300–600px wide) instead of multi-megabyte full-resolution files so `README.md` loads fast on cellular connections.
   - Keep `name`, `image.alt`, and optional `notes` concise and scannable on narrow mobile screens (trim SEO keyword stuffing while keeping essential model/size/color clarity).

3. **Choose category and unique ID**:
   - Inspect `wishlist.yaml` to pick the matching category (`kayak`, `fishing-tackle`, `grilling`, `guitar`, `trucking`, `decorations`), or create a new category if the user requests one.
   - Create a concise, lowercase kebab-case `id` that is globally unique across `wishlist.yaml`.
   - Set `retrieved` to today's date in ISO `YYYY-MM-DD` format.

4. **Update, render mobile-optimized `README.md`, and verify**:
   - Append the new item to the chosen category in `wishlist.yaml` (order in YAML does not affect `README.md`; rendering automatically assigns the price tier and sorts descending by price).
   - Run:

     ```bash
     npm run render && npm run check && npm test
     ```

   - Confirm `README.md` maintains its mobile-optimized layout from `scripts/wishlist.mjs`:
     - Wrapping category quick-jump navigation bar at the top with updated item counts.
     - Bounded mobile thumbnails (`<img ... width="180" />`) instead of oversized full-width images.
     - Compact single-line price, buy link, and checked date summary (no wide Markdown tables that force horizontal scrolling on phones).
     - Back-to-top anchor links at the end of each category.
   - Report the added item's category, assigned price tier, price, and retailer back to the user, and offer to commit on a branch and open a PR (or open the PR directly if requested).
