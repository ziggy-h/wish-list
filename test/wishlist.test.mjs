import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import YAML from 'yaml';
import {
  DEFAULT_INPUT,
  DEFAULT_OUTPUT,
  MOBILE_IMAGE_WIDTH,
  assignPriceTier,
  checkImageUrl,
  checkImages,
  computeStats,
  daysBetweenIsoDates,
  escapeHtmlAttr,
  formatColors,
  formatImageCheckReport,
  formatPrice,
  formatStats,
  isValidIsoDate,
  loadSchema,
  loadWishlist,
  renderMarkdown,
  runCli,
  slugifyHeading,
  validateWishlist,
} from '../scripts/wishlist.mjs';

function makeFixture(overrides = {}) {
  return {
    title: 'Test Wishlist',
    currency: 'USD',
    price_tiers: [
      { label: '$100+', min: 100 },
      { label: '$25+', min: 25 },
      { label: 'Under $25', min: 0 },
    ],
    categories: [
      {
        id: 'gear',
        name: 'Gear',
        items: [
          {
            id: 'cheap-item',
            name: 'Cheap Item',
            url: 'https://example.com/cheap',
            image: { alt: 'Cheap', url: 'https://example.com/cheap.jpg' },
            price: 10,
            retrieved: '2025-12-01',
            retailer: { name: 'Example', url: 'https://example.com/buy/cheap' },
            colors: ['Red', { name: 'Blue', purchased: true }, 'Green'],
            quantity: 2,
          },
          {
            id: 'expensive-item',
            name: 'Expensive Item',
            url: 'https://example.com/expensive',
            image: { alt: 'Expensive', url: 'https://example.com/expensive.jpg' },
            price: 125.5,
            retrieved: '2026-11-20',
            retailer: { name: 'Example', url: 'https://example.com/buy/expensive' },
            size: 'Large',
            weight: '1 lb',
            model: 'Pro',
            power: 'Medium',
            action: 'Fast',
            option: 'Deluxe',
            notes: 'Check holiday sale',
          },
          {
            id: 'bought-item',
            name: 'Bought Item',
            url: 'https://example.com/bought',
            image: { alt: 'Bought', url: 'https://example.com/bought.jpg' },
            price: 50,
            retrieved: '2025-01-01',
            retailer: { name: 'Example', url: 'https://example.com/buy/bought' },
            purchased: true,
            purchased_date: '2026-11-25',
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe('repository wishlist.yaml integrity', () => {
  it('validates against schemas/wishlist.schema.json and semantic rules', () => {
    const data = loadWishlist(DEFAULT_INPUT);
    const schema = loadSchema();
    const result = validateWishlist(data, schema);
    assert.deepEqual(result.errors, []);
    assert.equal(result.valid, true);
  });

  it('matches rendered README.md exactly', () => {
    const data = loadWishlist(DEFAULT_INPUT);
    const expected = renderMarkdown(data);
    const actual = fs.readFileSync(DEFAULT_OUTPUT, 'utf8');
    assert.equal(actual, expected);
  });
});

describe('date and formatting helpers', () => {
  it('validates real ISO calendar dates', () => {
    assert.equal(isValidIsoDate('2026-11-27'), true);
    assert.equal(isValidIsoDate('2024-02-29'), true);
    assert.equal(isValidIsoDate('2025-02-29'), false);
    assert.equal(isValidIsoDate('2026-02-30'), false);
    assert.equal(isValidIsoDate('11/27/2026'), false);
  });

  it('computes day differences between ISO dates', () => {
    assert.equal(daysBetweenIsoDates('2026-11-01', '2026-11-27'), 26);
    assert.equal(daysBetweenIsoDates('2026-11-27', '2026-11-27'), 0);
  });

  it('formats USD prices with commas and two decimals', () => {
    assert.equal(formatPrice(2199.99), '$2,199.99');
    assert.equal(formatPrice(52), '$52.00');
    assert.equal(formatPrice(1.99), '$1.99');
  });

  it('formats single, pair, and multi-item colors with per-color strikethroughs', () => {
    assert.deepEqual(formatColors(['Pink']), { label: 'Color', value: 'Pink' });
    assert.deepEqual(formatColors([{ name: 'Pink', purchased: true }]), {
      label: 'Color',
      value: '~~Pink~~',
    });
    assert.deepEqual(formatColors(['Red', 'Blue']), {
      label: 'Colors',
      value: 'Red and Blue',
    });
    assert.deepEqual(
      formatColors([
        'Pink clown',
        { name: 'yellow perch', purchased: true },
        { name: 'shad', purchased: true },
        'gold',
      ]),
      {
        label: 'Colors',
        value: 'Pink clown, ~~yellow perch~~, ~~shad~~, and gold',
      },
    );
  });

  it('assigns descending price tiers accurately on boundaries', () => {
    const tiers = [
      { label: '$100+', min: 100 },
      { label: '$50+', min: 50 },
      { label: 'Under $50', min: 0 },
    ];
    assert.equal(assignPriceTier(100, tiers).label, '$100+');
    assert.equal(assignPriceTier(99.99, tiers).label, '$50+');
    assert.equal(assignPriceTier(50, tiers).label, '$50+');
    assert.equal(assignPriceTier(49.99, tiers).label, 'Under $50');
    assert.equal(assignPriceTier(0, tiers).label, 'Under $50');
  });
});

describe('validateWishlist', () => {
  const schema = loadSchema();

  it('accepts a valid fixture', () => {
    const result = validateWishlist(makeFixture(), schema);
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
  });

  it('rejects non-descending price_tiers', () => {
    const data = makeFixture({
      price_tiers: [
        { label: '$25+', min: 25 },
        { label: '$100+', min: 100 },
        { label: 'Under $25', min: 0 },
      ],
    });
    const result = validateWishlist(data, schema);
    assert.equal(result.valid, false);
    assert.match(result.errors[0], /strictly descending/);
  });

  it('rejects price_tiers whose final tier min is not 0', () => {
    const data = makeFixture({
      price_tiers: [
        { label: '$100+', min: 100 },
        { label: '$10+', min: 10 },
      ],
    });
    const result = validateWishlist(data, schema);
    assert.equal(result.valid, false);
    assert.match(result.errors[0], /min: 0/);
  });

  it('rejects duplicate item ids across categories', () => {
    const data = makeFixture();
    data.categories.push({
      id: 'other',
      name: 'Other',
      items: [{ ...data.categories[0].items[0] }],
    });
    const result = validateWishlist(data, schema);
    assert.equal(result.valid, false);
    assert.match(result.errors.join('\n'), /Duplicate item id "cheap-item"/);
  });

  it('rejects purchased_date when purchased is not true', () => {
    const data = makeFixture();
    data.categories[0].items[0].purchased_date = '2026-11-25';
    const result = validateWishlist(data, schema);
    assert.equal(result.valid, false);
    assert.match(result.errors.join('\n'), /purchased_date without purchased: true/);
  });

  it('rejects broken image URLs with HTML entities or srcset descriptors', () => {
    const data = makeFixture();
    data.categories[0].items[0].image.url = 'https://example.com/img.jpg?a=1&amp;b=2';
    data.categories[0].items[1].image.url = 'https://example.com/img.jpg?c=1%201280w';
    const result = validateWishlist(data, schema);
    assert.equal(result.valid, false);
    assert.match(result.errors.join('\n'), /&amp;/);
    assert.match(result.errors.join('\n'), /srcset/);
  });

  it('rejects duplicate color entries within an item', () => {
    const data = makeFixture();
    data.categories[0].items[0].colors = ['Blue', { name: 'blue', purchased: true }];
    const result = validateWishlist(data, schema);
    assert.equal(result.valid, false);
    assert.match(result.errors.join('\n'), /duplicate color/i);
  });

  it('rejects unknown item fields via JSON Schema', () => {
    const data = makeFixture();
    data.categories[0].items[0].unexpected_field = 'nope';
    const result = validateWishlist(data, schema);
    assert.equal(result.valid, false);
  });
});

describe('renderMarkdown', () => {
  it('hides purchased items, omits empty tiers/categories, and sorts descending by price', () => {
    const data = makeFixture();
    data.categories[0].items.push({
      id: 'mid-tier-item',
      name: 'Mid Tier Item',
      url: 'https://example.com/mid',
      image: { alt: 'Mid', url: 'https://example.com/mid.jpg' },
      price: 20,
      retrieved: '2026-11-20',
      retailer: { name: 'Example', url: 'https://example.com/buy/mid' },
    });
    data.categories.push({
      id: 'all-bought',
      name: 'All Bought',
      items: [
        {
          id: 'done-1',
          name: 'Done',
          url: 'https://example.com/done',
          image: { alt: 'Done', url: 'https://example.com/done.jpg' },
          price: 15,
          retrieved: '2026-11-20',
          retailer: { name: 'Example', url: 'https://example.com/buy/done' },
          purchased: true,
        },
      ],
    });

    const md = renderMarkdown(data);
    assert.doesNotMatch(md, /Bought Item/);
    assert.doesNotMatch(md, /## All Bought/);
    assert.doesNotMatch(md, /### \$25\+/);

    // Mid Tier Item ($20) must come before Cheap Item ($10) inside "Under $25"
    const midPos = md.indexOf('#### 1. [Mid Tier Item]');
    const cheapPos = md.indexOf('#### 2. [Cheap Item]');
    assert.ok(midPos > 0 && cheapPos > midPos);

    // Check mobile-first quick-jump nav, bounded thumbnail, compact summary line, and back-to-top link
    assert.match(md, /\*\*Jump to:\*\* \[Gear \(3\)\]\(#gear\)/);
    assert.match(md, new RegExp(`<img src="https://example\\.com/expensive\\.jpg" alt="Expensive" width="${MOBILE_IMAGE_WIDTH}" />`));
    assert.match(md, /\*\*\$125\.50\*\* · \[Buy at Example\]\(https:\/\/example\.com\/buy\/expensive\) · _Checked 2026-11-20_/);
    assert.match(md, /\[↑ Back to top\]\(#test-wishlist\)/);

    // Check struck color and optional attributes
    assert.match(md, /- \*\*Colors:\*\* Red, ~~Blue~~, and Green/);
    assert.match(md, /- \*\*Quantity:\*\* 2/);
    assert.match(md, /- \*\*Notes:\*\* Check holiday sale/);
  });

  it('escapes HTML attributes safely and generates GitHub-compatible heading slugs', () => {
    assert.equal(escapeHtmlAttr('4" x 6" & <pro>'), '4&quot; x 6&quot; &amp; &lt;pro&gt;');
    assert.equal(slugifyHeading('2026 X-mas Wishlist'), '2026-x-mas-wishlist');
    assert.equal(slugifyHeading('Fishing tackle'), 'fishing-tackle');
  });
});

describe('computeStats and formatStats', () => {
  it('computes totals, quantity-weighted active value, and stale items', () => {
    const data = makeFixture();
    const stats = computeStats(data, { staleDays: 90, asOf: '2026-11-27' });

    assert.equal(stats.totals.totalItems, 3);
    assert.equal(stats.totals.activeItems, 2);
    assert.equal(stats.totals.purchasedItems, 1);
    assert.equal(stats.totals.activeUnitTotal, 135.5);
    assert.equal(stats.totals.activeTotal, 145.5); // 10*2 + 125.5
    assert.equal(stats.totals.staleItems, 1);
    assert.equal(stats.totals.oldestRetrieved, '2025-12-01');
    assert.equal(stats.staleList.length, 1);
    assert.equal(stats.staleList[0].id, 'cheap-item');

    const text = formatStats(stats, data.currency);
    assert.match(text, /Items: 2 active, 1 purchased \(3 total\)/);
    assert.match(text, /Active value: \$145\.50/);
    assert.match(text, /Stale active items: 1\/2/);
  });
});

describe('checkImageUrl and checkImages', () => {
  it('accepts live 200 image/* responses on HEAD and falls back to GET on 405', async () => {
    const calls = [];
    const mockFetch = async (url, init) => {
      calls.push({ url, method: init.method });
      if (url.includes('head-ok')) {
        return new Response(null, { status: 200, headers: { 'content-type': 'image/jpeg' } });
      }
      if (url.includes('head-405') && init.method === 'HEAD') {
        return new Response(null, { status: 405 });
      }
      return new Response('img', { status: 200, headers: { 'content-type': 'image/png; charset=utf-8' } });
    };

    const okHead = await checkImageUrl('https://example.com/head-ok.jpg', { fetchImpl: mockFetch });
    assert.equal(okHead.ok, true);
    assert.equal(okHead.method, 'HEAD');
    assert.equal(okHead.contentType, 'image/jpeg');

    const okFallback = await checkImageUrl('https://example.com/head-405.png', { fetchImpl: mockFetch });
    assert.equal(okFallback.ok, true);
    assert.equal(okFallback.method, 'GET');
    assert.equal(okFallback.contentType, 'image/png');
    assert.deepEqual(
      calls.filter((c) => c.url.includes('head-405')).map((c) => c.method),
      ['HEAD', 'GET'],
    );
  });

  it('flags 404s, soft-404 text/html responses, and network errors as dead', async () => {
    const mockFetch = async (url) => {
      if (url.includes('missing')) {
        return new Response(null, { status: 404 });
      }
      if (url.includes('soft404')) {
        return new Response('<html>not found</html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        });
      }
      throw new Error('ENOTFOUND');
    };

    const r404 = await checkImageUrl('https://example.com/missing.jpg', { fetchImpl: mockFetch });
    assert.equal(r404.ok, false);
    assert.equal(r404.reason, 'HTTP 404');

    const rHtml = await checkImageUrl('https://example.com/soft404.jpg', { fetchImpl: mockFetch });
    assert.equal(rHtml.ok, false);
    assert.match(rHtml.reason, /Non-image content-type: text\/html/);

    const rErr = await checkImageUrl('https://example.com/offline.jpg', { fetchImpl: mockFetch });
    assert.equal(rErr.ok, false);
    assert.match(rErr.reason, /ENOTFOUND/);
  });

  it('filters active items, excludes purchased by default, and reports manufacturer URLs for dead images', async () => {
    const data = makeFixture();
    const mockFetch = async (url) => {
      if (url.includes('cheap.jpg')) {
        return new Response(null, { status: 404 });
      }
      return new Response(null, { status: 200, headers: { 'content-type': 'image/jpeg' } });
    };

    const report = await checkImages(data, { fetchImpl: mockFetch });
    assert.equal(report.checked, 2); // excludes purchased item by default
    assert.equal(report.alive, 1);
    assert.equal(report.dead, 1);
    assert.equal(report.deadList[0].id, 'cheap-item');
    assert.equal(report.deadList[0].manufacturerUrl, 'https://example.com/cheap');

    const formatted = formatImageCheckReport(report);
    assert.match(formatted, /Image Check: 1\/2 alive, 1 dead/);
    assert.match(formatted, /Manufacturer page: https:\/\/example\.com\/cheap/);

    const scoped = await checkImages(data, { itemIds: ['expensive-item'], fetchImpl: mockFetch });
    assert.equal(scoped.checked, 1);
    assert.equal(scoped.dead, 0);
  });
});

describe('CLI workflow', () => {
  it('supports validate, render, render --check, and stats on temporary files', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wishlist-test-'));
    try {
      const yamlPath = path.join(tmpDir, 'wishlist.yaml');
      const mdPath = path.join(tmpDir, 'README.md');
      fs.writeFileSync(yamlPath, YAML.stringify(makeFixture()), 'utf8');

      assert.equal(await runCli(['validate', `--input=${yamlPath}`]), 0);
      assert.equal(await runCli(['render', `--input=${yamlPath}`, `--output=${mdPath}`]), 0);
      assert.equal(await runCli(['render', '--check', `--input=${yamlPath}`, `--output=${mdPath}`]), 0);

      // Drift README and confirm --check catches it
      fs.appendFileSync(mdPath, '\nmanual edit\n', 'utf8');
      assert.equal(await runCli(['render', '--check', `--input=${yamlPath}`, `--output=${mdPath}`]), 1);

      assert.equal(
        await runCli(['stats', `--input=${yamlPath}`, '--stale-days=30', '--as-of=2026-11-27', '--json']),
        0,
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
