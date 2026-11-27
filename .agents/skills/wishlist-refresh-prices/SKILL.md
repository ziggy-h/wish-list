---
name: wishlist-refresh-prices
description: Audit stale prices and retrieval dates in ziggy-h/wish-list, check current lowest prices and availability, update wishlist.yaml, and regenerate README.md. Use when the user asks to refresh, update, or verify wish list prices.
---

# Wishlist: Refresh Prices

Use this skill when checking or refreshing item prices and retrieval dates in `ziggy-h/wish-list`.

## Steps

1. **Identify stale items**:
   - Run `npm run stats` (or `npm run stats -- --stale-days=90`) to see how many items are stale per category.
   - If the user asked to refresh a specific category or item, scope the refresh strictly to that subset. If they asked for a full refresh across many items, batch by category so progress is easy to review.

2. **Verify current prices and links**:
   - For each target item, check the current `retailer.url` (and `url` if different) and optionally search for a lower price from reputable retailers.
   - If a retailer page is gated by a CAPTCHA or anti-bot challenge, do not bypass it — note the item as skipped/manual-check-needed in your summary.
   - Watch for discontinued or out-of-stock products, broken links, or mismatched product URLs, and flag them clearly for the user rather than silently deleting items.

3. **Update `wishlist.yaml`**:
   - For each verified item:
     - Update `price` (numeric USD) to the lowest verified price.
     - Update `retrieved` to today's ISO date (`YYYY-MM-DD`).
     - Update `retailer.name` and `retailer.url` if a better retailer price was found (cleaning tracking query parameters).
   - Do not change `retrieved` on items whose price could not be verified.

4. **Render, validate, and summarize**:
   - Run:

     ```bash
     npm run render && npm run check && npm test
     ```

   - Notice that `npm run render` automatically moves items into updated price tiers and re-sorts them descending by price.
   - Present a concise Markdown table of price changes (item, old price -> new price, retailer change if any, tier change if any, plus any skipped/broken items) and open a PR on a feature branch (or ask if they'd like a PR opened).
