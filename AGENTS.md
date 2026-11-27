# AGENTS.md

Instructions for AI coding agents maintaining `ziggy-h/wish-list`.

## Repository Architecture

- **`wishlist.yaml`** is the single source of truth for all wish list items, prices, retrieval dates, categories, and configurable descending `price_tiers`.
- **`README.md`** is generated deterministically from `wishlist.yaml` by `scripts/wishlist.mjs`. **Never edit `README.md` by hand** — edit `wishlist.yaml` and run `npm run render`.
- **`schemas/wishlist.schema.json`** defines the JSON Schema (Draft 2020-12) for `wishlist.yaml`.
- **`scripts/wishlist.mjs`** provides the CLI (`render`, `validate`, `stats`, `check-images`) and exportable library functions.
- **`test/wishlist.test.mjs`** runs unit and CLI integration tests with Node's built-in `node --test`.
- **`.agents/skills/`** contains repo-scoped workflow skills (`wishlist-add-item`, `wishlist-mark-purchased`, `wishlist-refresh-prices`).

## Data Conventions

- **IDs**: Concise, lowercase kebab-case `id` values, globally unique across all categories.
- **Price tiers**: Top-level `price_tiers` must be strictly descending by `min`, with unique `label` values and a final tier with `min: 0`. Rendering automatically assigns each active item to the highest matching tier and sorts descending by `price` (preserving YAML order on ties).
- **Dates**: ISO 8601 `YYYY-MM-DD` for `retrieved` and optional `purchased_date`.
- **Colors**: `colors` is a list where each entry is either a plain string (`"Pink clown"`) or an object (`{ name: "yellow perch", purchased: true }`) rendered with Markdown strikethrough (`~~yellow perch~~`).
- **Purchased items**: Set `purchased: true` (and optionally `purchased_date: "YYYY-MM-DD"`) to hide an item from `README.md` while keeping purchase history in `wishlist.yaml`. Empty tiers and categories are omitted automatically.
- **Clean URLs**: Strip tracking/referral query parameters (`msclkid`, `gclid`, `fbclid`, `utm_*`, `ref=`, `pd_rd_*`, `pf_rd_*`, `dib=`, `wmlspartner`, `gad_*`) on new or updated URLs while preserving functional variant parameters (`variant=`, `color=`, `childSku=`, `sku=`). Never store HTML-escaped `&amp;` or trailing `srcset` width descriptors (e.g., `%201280w`) in `image.url`.
- **Mobile-first README display**: `scripts/wishlist.mjs` renders `README.md` for narrow mobile screens using a wrapping category quick-jump bar, bounded `180px` `<img ... width="180" />` thumbnails (permitted by `MD033` allowlist in `.markdownlint-cli2.jsonc`), compact single-line price/buy/checked summaries, no wide tables, and back-to-top links. Prefer lightweight mobile-sized CDN image URLs (around 300–600px wide when available) and concise titles/notes.
- **Live images**: Use `npm run check:images` (optionally scoped with `-- --id=<id>` or `-- --category=<cat>`) when adding items or refreshing prices to detect dead images (non-2xx status, network errors, or soft-404 `text/html` responses). If an image is dead, look on the manufacturer's product page (`item.url`) first for a working replacement image before falling back to a retailer image.

## Commands

```bash
npm ci --no-audit --no-fund                # Install dependencies
npm run render                             # Regenerate README.md from wishlist.yaml
npm run validate                           # Validate wishlist.yaml (schema + semantic rules)
npm run lint:md                            # Lint all Markdown files with markdownlint-cli2
npm run check                              # validate + render --check + lint:md
npm run check:images                       # Test active image URLs for dead links
npm run check:images -- --category=kayak   # Test images in a single category
npm run check:images -- --id=<item-id>     # Test a single item's image URL
npm run stats                              # Summary totals and stale price report (>90d)
npm run stats -- --stale-days=60           # Custom staleness threshold
npm test                                   # Run node --test suite
```

## Repo Skills

Use the bundled skills under `.agents/skills/` when performing routine maintenance:

- **`.agents/skills/wishlist-add-item/SKILL.md`**: Add a new item from a product URL, name, or description.
- **`.agents/skills/wishlist-mark-purchased/SKILL.md`**: Cross off a color/variant or mark an entire item purchased (or remove it).
- **`.agents/skills/wishlist-refresh-prices/SKILL.md`**: Audit stale retrieval dates and refresh verified lowest prices.

## Workflow Rules

1. Always run `npm run render && npm run check && npm test` after editing `wishlist.yaml` or tooling.
2. Never bypass CAPTCHAs or anti-bot walls when checking retailer pages — fall back to another retailer/manufacturer source or report the item for manual verification.
3. Commit changes on a feature branch and open a pull request against `main` instead of pushing directly to `main`.
