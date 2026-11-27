#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import YAML from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

export const DEFAULT_INPUT = path.join(REPO_ROOT, 'wishlist.yaml');
export const DEFAULT_OUTPUT = path.join(REPO_ROOT, 'README.md');
export const DEFAULT_SCHEMA = path.join(REPO_ROOT, 'schemas', 'wishlist.schema.json');

/**
 * Load and parse a YAML wishlist file.
 * @param {string} inputPath
 * @returns {object}
 */
export function loadWishlist(inputPath = DEFAULT_INPUT) {
  const raw = fs.readFileSync(inputPath, 'utf8');
  return YAML.parse(raw);
}

/**
 * Load and parse the JSON Schema file.
 * @param {string} schemaPath
 * @returns {object}
 */
export function loadSchema(schemaPath = DEFAULT_SCHEMA) {
  const raw = fs.readFileSync(schemaPath, 'utf8');
  return JSON.parse(raw);
}

/**
 * Verify that an ISO YYYY-MM-DD string represents a real calendar date.
 * @param {string} value
 * @returns {boolean}
 */
export function isValidIsoDate(value) {
  if (typeof value !== 'string') return false;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/**
 * Validate wishlist data against the JSON Schema and semantic invariants.
 * @param {unknown} data
 * @param {object} [schema]
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateWishlist(data, schema = loadSchema()) {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);

  const errors = [];
  const schemaOk = validate(data);
  if (!schemaOk && validate.errors) {
    for (const err of validate.errors) {
      const location = err.instancePath || '/';
      errors.push(`Schema error at ${location}: ${err.message}`);
    }
    return { valid: false, errors };
  }

  // Semantic check 1: price_tiers must be strictly descending, unique labels, ending at min === 0.
  const seenTierLabels = new Set();
  for (let i = 0; i < data.price_tiers.length; i++) {
    const tier = data.price_tiers[i];
    if (seenTierLabels.has(tier.label)) {
      errors.push(`Duplicate price_tiers label: "${tier.label}"`);
    }
    seenTierLabels.add(tier.label);
    if (i > 0 && tier.min >= data.price_tiers[i - 1].min) {
      errors.push(
        `price_tiers must be strictly descending by min: "${tier.label}" (${tier.min}) is not less than "${data.price_tiers[i - 1].label}" (${data.price_tiers[i - 1].min})`,
      );
    }
  }
  const lastTier = data.price_tiers[data.price_tiers.length - 1];
  if (lastTier.min !== 0) {
    errors.push(`Final price tier "${lastTier.label}" must have min: 0 (got ${lastTier.min})`);
  }

  // Semantic check 2: unique category IDs/names and globally unique item IDs.
  const seenCategoryIds = new Set();
  const seenCategoryNames = new Set();
  const seenItemIds = new Map();

  for (const category of data.categories) {
    if (seenCategoryIds.has(category.id)) {
      errors.push(`Duplicate category id: "${category.id}"`);
    }
    seenCategoryIds.add(category.id);

    if (seenCategoryNames.has(category.name)) {
      errors.push(`Duplicate category name: "${category.name}"`);
    }
    seenCategoryNames.add(category.name);

    for (const item of category.items) {
      if (seenItemIds.has(item.id)) {
        errors.push(
          `Duplicate item id "${item.id}" in category "${category.id}" (already defined in "${seenItemIds.get(item.id)}")`,
        );
      } else {
        seenItemIds.set(item.id, category.id);
      }

      if (!isValidIsoDate(item.retrieved)) {
        errors.push(`Item "${item.id}" has invalid calendar date for retrieved: "${item.retrieved}"`);
      }

      if (item.purchased_date !== undefined) {
        if (!isValidIsoDate(item.purchased_date)) {
          errors.push(
            `Item "${item.id}" has invalid calendar date for purchased_date: "${item.purchased_date}"`,
          );
        }
        if (!item.purchased) {
          errors.push(`Item "${item.id}" sets purchased_date without purchased: true`);
        }
      }

      if (item.image.url.includes('&amp;')) {
        errors.push(`Item "${item.id}" image.url contains HTML-escaped "&amp;": ${item.image.url}`);
      }
      if (/%20\d+w$/i.test(item.image.url)) {
        errors.push(
          `Item "${item.id}" image.url contains trailing srcset width descriptor: ${item.image.url}`,
        );
      }

      if (item.colors) {
        const seenColors = new Set();
        for (const entry of item.colors) {
          const colorName = typeof entry === 'string' ? entry : entry.name;
          const normalized = colorName.trim().toLowerCase();
          if (seenColors.has(normalized)) {
            errors.push(`Item "${item.id}" has duplicate color "${colorName}"`);
          }
          seenColors.add(normalized);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Assign an item price to the first matching tier in a descending price_tiers array.
 * @param {number} price
 * @param {Array<{ label: string, min: number }>} priceTiers
 * @returns {{ label: string, min: number }}
 */
export function assignPriceTier(price, priceTiers) {
  for (const tier of priceTiers) {
    if (price >= tier.min) {
      return tier;
    }
  }
  throw new Error(`No price tier matched price ${price}`);
}

/**
 * Format a numeric price as localized currency (e.g. "$2,199.99").
 * @param {number} price
 * @param {string} [currency='USD']
 * @returns {string}
 */
export function formatPrice(price, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
}

/**
 * Format a single color entry, applying strikethrough if purchased.
 * @param {string | { name: string, purchased?: boolean }} entry
 * @returns {string}
 */
export function formatColorEntry(entry) {
  if (typeof entry === 'string') {
    return entry;
  }
  return entry.purchased ? `~~${entry.name}~~` : entry.name;
}

/**
 * Format an item's colors array into a human-readable bullet label and value.
 * @param {Array<string | { name: string, purchased?: boolean }>} colors
 * @returns {{ label: 'Color' | 'Colors', value: string }}
 */
export function formatColors(colors) {
  const formatted = colors.map(formatColorEntry);
  if (formatted.length === 1) {
    return { label: 'Color', value: formatted[0] };
  }
  if (formatted.length === 2) {
    return { label: 'Colors', value: `${formatted[0]} and ${formatted[1]}` };
  }
  const head = formatted.slice(0, -1).join(', ');
  const tail = formatted[formatted.length - 1];
  return { label: 'Colors', value: `${head}, and ${tail}` };
}

export const MOBILE_IMAGE_WIDTH = 180;

/**
 * Escape special characters for safe use inside an HTML attribute value.
 * @param {string} value
 * @returns {string}
 */
export function escapeHtmlAttr(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

/**
 * Compute GitHub-compatible heading anchor slug for quick-jump links.
 * @param {string} text
 * @returns {string}
 */
export function slugifyHeading(text) {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-');
}

/**
 * Render a validated wishlist object into deterministic, mobile-optimized Markdown.
 * @param {object} data
 * @param {{ imageWidth?: number }} [options]
 * @returns {string}
 */
export function renderMarkdown(data, { imageWidth = MOBILE_IMAGE_WIDTH } = {}) {
  const topAnchor = slugifyHeading(data.title);
  const lines = [
    `# ${data.title}`,
    '',
    '<!-- Generated from wishlist.yaml via "npm run render". Do not edit manually. -->',
  ];

  const activeCategories = data.categories
    .map((category) => ({
      ...category,
      activeItems: category.items.filter((item) => !item.purchased),
    }))
    .filter((category) => category.activeItems.length > 0);

  if (activeCategories.length > 0) {
    const jumpLinks = activeCategories.map(
      (cat) => `[${cat.name} (${cat.activeItems.length})](#${slugifyHeading(cat.name)})`,
    );
    lines.push('', `**Jump to:** ${jumpLinks.join(' · ')}`);
  }

  for (let catIdx = 0; catIdx < activeCategories.length; catIdx++) {
    const category = activeCategories[catIdx];
    lines.push('', '---', '', `## ${category.name}`);

    // Group items by descending price tier
    const tierBuckets = data.price_tiers.map((tier) => ({
      tier,
      items: [],
    }));

    for (const item of category.activeItems) {
      const matchedTier = assignPriceTier(item.price, data.price_tiers);
      const bucket = tierBuckets.find((b) => b.tier.label === matchedTier.label);
      bucket.items.push(item);
    }

    const nonEmptyTiers = tierBuckets.filter((b) => b.items.length > 0);

    for (let tierIdx = 0; tierIdx < nonEmptyTiers.length; tierIdx++) {
      const { tier, items } = nonEmptyTiers[tierIdx];
      // Stable sort descending by price; ties preserve wishlist.yaml declaration order.
      const sortedItems = [...items].sort((a, b) => b.price - a.price);

      if (tierIdx > 0) {
        lines.push('', '---');
      }
      lines.push('', `### ${tier.label}`);

      for (let itemIdx = 0; itemIdx < sortedItems.length; itemIdx++) {
        const item = sortedItems[itemIdx];
        const imgSrc = escapeHtmlAttr(item.image.url);
        const imgAlt = escapeHtmlAttr(item.image.alt);
        const formattedPrice = formatPrice(item.price, data.currency);

        lines.push(
          '',
          `#### ${itemIdx + 1}. [${item.name}](${item.url})`,
          '',
          `<img src="${imgSrc}" alt="${imgAlt}" width="${imageWidth}" />`,
          '',
          `**${formattedPrice}** · [Buy at ${item.retailer.name}](${item.retailer.url}) · _Checked ${item.retrieved}_`,
        );

        const detailLines = [];
        if (item.colors && item.colors.length > 0) {
          const { label, value } = formatColors(item.colors);
          detailLines.push(`- **${label}:** ${value}`);
        }
        if (item.size !== undefined) detailLines.push(`- **Size:** ${item.size}`);
        if (item.weight !== undefined) detailLines.push(`- **Weight:** ${item.weight}`);
        if (item.model !== undefined) detailLines.push(`- **Model:** ${item.model}`);
        if (item.power !== undefined) detailLines.push(`- **Power:** ${item.power}`);
        if (item.action !== undefined) detailLines.push(`- **Action:** ${item.action}`);
        if (item.option !== undefined) detailLines.push(`- **Option:** ${item.option}`);
        if (item.quantity !== undefined) detailLines.push(`- **Quantity:** ${item.quantity}`);
        if (item.notes !== undefined) detailLines.push(`- **Notes:** ${item.notes}`);

        if (detailLines.length > 0) {
          lines.push('', ...detailLines);
        }
      }
    }

    lines.push('', `[↑ Back to top](#${topAnchor})`);
  }

  return `${lines.join('\n')}\n`;
}

/**
 * Compute whole-day difference between two ISO YYYY-MM-DD dates (later - earlier).
 * @param {string} earlierIso
 * @param {string} laterIso
 * @returns {number}
 */
export function daysBetweenIsoDates(earlierIso, laterIso) {
  const [y1, m1, d1] = earlierIso.split('-').map(Number);
  const [y2, m2, d2] = laterIso.split('-').map(Number);
  const ms1 = Date.UTC(y1, m1 - 1, d1);
  const ms2 = Date.UTC(y2, m2 - 1, d2);
  return Math.floor((ms2 - ms1) / 86_400_000);
}

/**
 * Get today's date as ISO YYYY-MM-DD in local time.
 * @returns {string}
 */
export function getTodayIsoDate() {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Compute summary statistics and staleness audit for a wishlist.
 * @param {object} data
 * @param {{ staleDays?: number, asOf?: string }} [options]
 */
export function computeStats(data, { staleDays = 90, asOf = getTodayIsoDate() } = {}) {
  if (!Number.isInteger(staleDays) || staleDays < 0) {
    throw new Error(`--stale-days must be a non-negative integer (got ${staleDays})`);
  }
  if (!isValidIsoDate(asOf)) {
    throw new Error(`--as-of must be a valid YYYY-MM-DD date (got "${asOf}")`);
  }

  let totalItems = 0;
  let activeItems = 0;
  let purchasedItems = 0;
  let activeUnitTotal = 0;
  let activeTotal = 0;
  let staleItems = 0;
  let oldestRetrieved = null;

  const tierMap = new Map(
    data.price_tiers.map((t) => [t.label, { label: t.label, min: t.min, activeItems: 0, activeTotal: 0 }]),
  );

  const categories = [];
  const staleList = [];

  for (const category of data.categories) {
    let catActive = 0;
    let catPurchased = 0;
    let catActiveTotal = 0;
    let catStale = 0;
    let catOldest = null;

    for (const item of category.items) {
      totalItems++;
      if (item.purchased) {
        purchasedItems++;
        catPurchased++;
        continue;
      }

      const qty = item.quantity ?? 1;
      const lineTotal = item.price * qty;

      activeItems++;
      catActive++;
      activeUnitTotal += item.price;
      activeTotal += lineTotal;
      catActiveTotal += lineTotal;

      const tier = assignPriceTier(item.price, data.price_tiers);
      const tierEntry = tierMap.get(tier.label);
      tierEntry.activeItems++;
      tierEntry.activeTotal += lineTotal;

      if (oldestRetrieved === null || item.retrieved < oldestRetrieved) {
        oldestRetrieved = item.retrieved;
      }
      if (catOldest === null || item.retrieved < catOldest) {
        catOldest = item.retrieved;
      }

      const ageDays = daysBetweenIsoDates(item.retrieved, asOf);
      if (ageDays > staleDays) {
        staleItems++;
        catStale++;
        staleList.push({
          id: item.id,
          name: item.name,
          categoryId: category.id,
          categoryName: category.name,
          price: item.price,
          retrieved: item.retrieved,
          ageDays,
          retailer: item.retailer.name,
        });
      }
    }

    categories.push({
      id: category.id,
      name: category.name,
      totalItems: category.items.length,
      activeItems: catActive,
      purchasedItems: catPurchased,
      activeTotal: roundCents(catActiveTotal),
      staleItems: catStale,
      oldestRetrieved: catOldest,
    });
  }

  staleList.sort((a, b) => a.retrieved.localeCompare(b.retrieved) || a.id.localeCompare(b.id));

  return {
    asOf,
    staleDays,
    totals: {
      totalItems,
      activeItems,
      purchasedItems,
      activeUnitTotal: roundCents(activeUnitTotal),
      activeTotal: roundCents(activeTotal),
      staleItems,
      oldestRetrieved,
    },
    categories,
    tiers: [...tierMap.values()].map((t) => ({
      ...t,
      activeTotal: roundCents(t.activeTotal),
    })),
    staleList,
  };
}

function roundCents(value) {
  return Math.round(value * 100) / 100;
}

/**
 * Format stats output for terminal display.
 * @param {ReturnType<typeof computeStats>} stats
 * @param {string} [currency='USD']
 * @returns {string}
 */
export function formatStats(stats, currency = 'USD') {
  const { totals } = stats;
  const lines = [
    `Wishlist Statistics (as of ${stats.asOf}, stale threshold: >${stats.staleDays} days)`,
    '='.repeat(72),
    `Items: ${totals.activeItems} active, ${totals.purchasedItems} purchased (${totals.totalItems} total)`,
    `Active value: ${formatPrice(totals.activeTotal, currency)} (unit sum: ${formatPrice(totals.activeUnitTotal, currency)})`,
    `Stale active items: ${totals.staleItems}/${totals.activeItems}${totals.oldestRetrieved ? ` (oldest retrieved: ${totals.oldestRetrieved})` : ''}`,
    '',
    'By Category:',
  ];

  for (const cat of stats.categories) {
    lines.push(
      `  - ${cat.name} (${cat.id}): ${cat.activeItems} active, ${cat.purchasedItems} purchased, ${formatPrice(cat.activeTotal, currency)}, ${cat.staleItems} stale${cat.oldestRetrieved ? ` (oldest: ${cat.oldestRetrieved})` : ''}`,
    );
  }

  lines.push('', 'By Price Tier (active):');
  for (const tier of stats.tiers) {
    if (tier.activeItems === 0) continue;
    lines.push(`  - ${tier.label}: ${tier.activeItems} items (${formatPrice(tier.activeTotal, currency)})`);
  }

  if (stats.staleList.length > 0) {
    lines.push('', `Stale Items (${stats.staleList.length}):`);
    for (const item of stats.staleList) {
      lines.push(
        `  - [${item.categoryId}] ${item.id} — ${formatPrice(item.price, currency)} (${item.retailer}, retrieved ${item.retrieved}, ${item.ageDays}d old)`,
      );
    }
  }

  return `${lines.join('\n')}\n`;
}

function parseFlags(args) {
  const flags = {};
  for (const arg of args) {
    if (!arg.startsWith('--')) continue;
    const eqIndex = arg.indexOf('=');
    if (eqIndex === -1) {
      flags[arg.slice(2)] = true;
    } else {
      flags[arg.slice(2, eqIndex)] = arg.slice(eqIndex + 1);
    }
  }
  return flags;
}

function printHelp() {
  console.log(`Usage: node scripts/wishlist.mjs <command> [options]

Commands:
  validate [--input=wishlist.yaml] [--schema=schemas/wishlist.schema.json]
      Validate wishlist.yaml against JSON Schema and semantic rules.

  render [--check] [--input=wishlist.yaml] [--output=README.md]
      Regenerate README.md from wishlist.yaml. With --check, exit non-zero
      if README.md is out of date.

  stats [--stale-days=90] [--as-of=YYYY-MM-DD] [--input=wishlist.yaml] [--json]
      Print summary totals, per-category breakdown, and stale price report.
`);
}

export function runCli(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  if (!command || command === '--help' || command === '-h') {
    printHelp();
    return 0;
  }

  const flags = parseFlags(rest);
  const inputPath = flags.input ? path.resolve(flags.input) : DEFAULT_INPUT;
  const outputPath = flags.output ? path.resolve(flags.output) : DEFAULT_OUTPUT;
  const schemaPath = flags.schema ? path.resolve(flags.schema) : DEFAULT_SCHEMA;

  if (command === 'validate') {
    const data = loadWishlist(inputPath);
    const schema = loadSchema(schemaPath);
    const result = validateWishlist(data, schema);
    if (!result.valid) {
      console.error(`Validation failed with ${result.errors.length} error(s):`);
      for (const err of result.errors) {
        console.error(`  - ${err}`);
      }
      return 1;
    }
    const itemCount = data.categories.reduce((sum, c) => sum + c.items.length, 0);
    console.log(
      `Valid: ${path.relative(REPO_ROOT, inputPath) || inputPath} (${itemCount} items across ${data.categories.length} categories).`,
    );
    return 0;
  }

  if (command === 'render') {
    const data = loadWishlist(inputPath);
    const schema = loadSchema(schemaPath);
    const validation = validateWishlist(data, schema);
    if (!validation.valid) {
      console.error(`Cannot render invalid wishlist (${validation.errors.length} error(s)):`);
      for (const err of validation.errors) {
        console.error(`  - ${err}`);
      }
      return 1;
    }

    const rendered = renderMarkdown(data);
    if (flags.check) {
      const existing = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : '';
      if (existing !== rendered) {
        console.error(
          `${path.relative(REPO_ROOT, outputPath) || outputPath} is out of date with ${path.relative(REPO_ROOT, inputPath) || inputPath}. Run "npm run render".`,
        );
        return 1;
      }
      console.log(`Up to date: ${path.relative(REPO_ROOT, outputPath) || outputPath}`);
      return 0;
    }

    fs.writeFileSync(outputPath, rendered, 'utf8');
    const activeCount = data.categories.reduce(
      (sum, c) => sum + c.items.filter((i) => !i.purchased).length,
      0,
    );
    console.log(
      `Rendered ${activeCount} active items to ${path.relative(REPO_ROOT, outputPath) || outputPath}.`,
    );
    return 0;
  }

  if (command === 'stats') {
    const data = loadWishlist(inputPath);
    const staleDays = flags['stale-days'] !== undefined ? Number(flags['stale-days']) : 90;
    const asOf = typeof flags['as-of'] === 'string' ? flags['as-of'] : getTodayIsoDate();
    const stats = computeStats(data, { staleDays, asOf });
    if (flags.json) {
      console.log(JSON.stringify(stats, null, 2));
    } else {
      process.stdout.write(formatStats(stats, data.currency));
    }
    return 0;
  }

  console.error(`Unknown command: "${command}"`);
  printHelp();
  return 1;
}

const isMainModule =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isMainModule) {
  try {
    process.exitCode = runCli();
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  }
}
