---
name: wishlist-refresh-prices
description: Audit stale prices and dead images in ziggy-h/wish-list, check current lowest prices and availability, replace dead images from manufacturer pages, update wishlist.yaml, and regenerate a mobile-optimized README.md. Use when the user asks to refresh, update, or verify wish list prices.
---

# Wishlist: Refresh Prices

Use this skill when checking or refreshing item prices, retrieval dates, and product images in `ziggy-h/wish-list`.

## Steps

1. **Identify stale items and dead images**:
   - Run `npm run stats` (or `npm run stats -- --stale-days=90`) to see how many items are stale per category.
   - Test target items for dead images (non-2xx HTTP status, network/DNS errors, or soft-404 non-image responses):

     ```bash
     npm run check:images                           # all active items
     npm run check:images -- --category=<cat-id>    # scoped to one category
     npm run check:images -- --id=<item-id>         # scoped to one item
     ```

   - If the user asked to refresh a specific category or item, scope both the price refresh and image check strictly to that subset. If they asked for a full refresh across many items, batch by category so progress is easy to review.

2. **Verify current prices, links, and replace dead images**:
   - For each target item, check the current `retailer.url` (and `url` if different) and optionally search for a lower price from reputable retailers.
   - If a retailer page is gated by a CAPTCHA or anti-bot challenge, do not bypass it — note the item as skipped/manual-check-needed in your summary.
   - Watch for discontinued or out-of-stock products, broken links, or mismatched product URLs, and flag them clearly for the user rather than silently deleting items.
   - **Dead image recovery**: For every item reported dead by `npm run check:images`:
     1. Visit the **manufacturer's official product page** (`item.url` from the report, or search for the official manufacturer page if `item.url` points to a retailer or mismatched URL) and find a working, clean, mobile-friendly product image URL (roughly 300–600px wide when available; no `&amp;` HTML entities or trailing `srcset` descriptors).
     2. Never bypass CAPTCHAs or anti-bot walls — if the manufacturer page is blocked or no longer lists the product, fall back to a working image from `retailer.url` or another reputable retailer, or flag the item for manual image verification.
   - If a live `image.url` is unnecessarily huge (e.g., 3000px+ multi-megabyte originals) and a clean 300–600px CDN variant is available, prefer updating to the lighter mobile-friendly URL.

3. **Update `wishlist.yaml` and re-verify images**:
   - For each verified item:
     - Update `price` (numeric USD) to the lowest verified price.
     - Update `retrieved` to today's ISO date (`YYYY-MM-DD`).
     - Update `retailer.name` and `retailer.url` if a better retailer price was found (cleaning tracking query parameters).
     - Update `image.url` for any dead or oversized image replaced in Step 2.
     - Keep any updated titles or `notes` concise for easy reading on small mobile screens.
   - Do not change `retrieved` on items whose price could not be verified.
   - Re-run `npm run check:images` on all updated item IDs (e.g., `npm run check:images -- --id=id1,id2`) to confirm every replacement image returns a live `2xx` `image/*` response.

4. **Render mobile-optimized `README.md`, validate, and summarize**:
   - Run:

     ```bash
     npm run render && npm run check && npm test
     ```

   - Notice that `npm run render` automatically moves items into updated price tiers, re-sorts them descending by price, and regenerates the mobile-optimized `README.md` layout (wrapping category quick-jump links, bounded `180px` thumbnails via `<img>`, compact price/buy/checked summary lines without wide horizontal tables, and back-to-top links).
   - Present a concise summary of price changes and image repairs (item, old price -> new price, retailer/tier changes, dead images replaced from manufacturer pages, plus any skipped/broken items) and open a PR on a feature branch (or ask if they'd like a PR opened).
