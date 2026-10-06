# Kit Builder: eligible-items RESTlet

`GET /restlet/kit-builder/eligible-items?vendorId={id}` returns the items a winery can put in a kit, plus the rules for a valid kit.

Files:
- `atr_kb_eligible_items_rl.js`: the RESTlet (SuiteScript 2.1)
- `custom-record-spec.md`: custom records and fields

I have not run this. There was no sandbox. Things I would check first on a real account are listed at the end.

## Response shape

```json
{
  "vendor":  { "id": "123", "name": "Example Estate" },
  "season":  { "label": "Spring 2026" },
  "kit": {
    "allowedSizes": [6, 12],
    "naming": { "template": "{winery} {season} {size}-Pack", "maxLength": 60 }
  },
  "categories": [
    { "id": "11", "name": "Reds", "minQty": 2, "maxQty": null },
    { "id": "12", "name": "Sparkling", "minQty": 0, "maxQty": 4 }
  ],
  "items": [
    {
      "id": "501", "sku": "EE-SHZ-21", "name": "Estate Shiraz 2021",
      "varietal": "Shiraz", "vintage": 2021,
      "description": "Dark fruit, soft tannins.",
      "imageUrl": "https://.../core/media/media.nl?id=...",
      "price": { "amount": 32.0, "currency": "AUD" },
      "categoryId": "11", "maxPerKit": 2,
      "stock": { "available": 140, "inStock": true }
    }
  ],
  "meta": { "itemCount": 1, "currency": "AUD", "generatedAt": "...", "warnings": [] }
}
```

## Key decisions

**Flat items, separate categories.** Items carry a `categoryId`. Rules sit once on the category. The UI groups by id, and the write side can validate by the same ids. Item order is the vendor's sort order.

**Three custom records, one per concept.** Config (sizes, season, naming), Category (min/max), Item Setting (category and per-item max). Per-item and per-category settings are the vendor's choice, so they do not belong on the item record. A winery's settings do not leak onto a shared item.

**Two switches on purpose.** `custentity_atr_kb_enabled` on the vendor is ATR's decision. The Config record is the vendor's own setup. This gives two different errors: "not enabled" and "no kit configuration".

**Eligible but uncategorised items are left out**, with a warning in `meta.warnings` and a log line. A kit member with no category would sit outside the category rules. I preferred a visible warning over a silent hole.

**Out-of-stock items are returned** with `inStock: false`. The UI decides how to show them. Stock is `quantityavailable` (on hand minus committed).

**Performance.** Six searches at most, no per-item loads: vendor, config, categories, item settings, items, and one search for all image URLs. Results are paged. A vendor with 40 to 200 items is one page. If the vendor has no item settings, we stop before the item search.

**HTTP status codes.** A SuiteScript RESTlet cannot set its own status code. A thrown error comes back as HTTP 400 (or 500 if unexpected) with `{ "error": { "code", "message" } }`. So `error.code` is the contract, and the intended status is a documented mapping. A gateway in front of the RESTlet can apply it:

| error.code | Meaning | Intended status |
| --- | --- | --- |
| `KB_INVALID_VENDOR_ID` | Missing or non-numeric id | 400 |
| `KB_VENDOR_NOT_FOUND` | No such vendor | 404 |
| `KB_VENDOR_NOT_ENABLED` | Vendor inactive or not in programme | 403 |
| `KB_NO_KIT_CONFIG` | No config, no sizes, or no categories | 409 |
| `KB_NO_ELIGIBLE_ITEMS` | Nothing eligible and categorised | 409 |
| `KB_UNEXPECTED_ERROR` | Anything else (logged in full) | 500 |

Logging: one `audit` line per call, `warn` for data problems, `error` with the stack for unexpected failures.

**Where the rest would go**
- Auth: the vendor should come from the token's user, not the query parameter. There is a TODO in the handler. Otherwise one winery could read another's data by changing the id.
- Caching: the config, categories and settings change rarely. I would cache them per vendor with `N/cache` for a few minutes and clear on a user event on those records. Stock and price stay live.
- Rate limiting: at the gateway or in PIER, per vendor. NetSuite's own concurrency limit is the backstop.

## How the write side would use the same model

The finalise endpoint takes `vendorId`, `size`, `name`, and `[{itemId, qty}]`. It loads the same records, through a shared library module, and re-checks everything. It does not trust PIER. Checks: size is in `allowedSizes`, quantities add up to the size, each item is still eligible and belongs to the vendor, per-item max, per-category min/max, name length.

Then it creates a Kit/Package item (`kititem`) and sets:
- `itemid` and `displayname` from the naming template, and `storedisplayname` for Magento
- `salesdescription`, and `taxschedule` (GST)
- `member` sublist: `item` and `quantity` for each selection
- `price` sublist: base price line. Default is the sum of member base prices, unless ATR sets a kit price rule.
- `isinactive` = false, plus whichever flag the Magento connector uses to pick up the item
- `custitem_atr_kb_source_vendor`, `custitem_atr_kb_season`, `custitem_atr_kb_size`

I would send an idempotency key so a double click does not create two kits.

## What I would do differently with more time

- Tests for the search-to-JSON mapping, with stubbed `N/search`.
- Move the loaders into a library so the read and write sides share them.
- Category min/max per kit size (a 6-pack and a 12-pack may need different rules).
- A `configVersion` in the response, so the write side can detect that rules changed while the vendor was building.
- A Season record at programme level, with dates, instead of a text label per vendor.
- Validate config on save (min above max, minimums larger than the smallest kit).

## Things to check on a real account

- `othervendor` is the right item-search field for "any vendor on the item". Change `ITEM_VENDOR_FILTER` if not.
- A multi-select `getText` returns "6,12" as I expect.
- File `url` values work for PIER. This needs "Available without login" on the files.
- `quantityavailable` is populated in this account (it needs inventory features on).

## AI use

*Complete this section yourself, in your own words. It has to match what you actually did.*

- **Tools:** Claude (Anthropic) [add any others].
- **AI-assisted vs hand-written:** [State which parts. Be exact. For example: the RESTlet first draft, the response shape, the custom-record design, the README. Then say what you changed or wrote yourself.]
- **One suggestion I accepted:** [Describe one real suggestion and why you took it. A candidate from this draft: throwing coded errors with a documented status mapping, because RESTlets cannot set status codes.]
- **One suggestion I rejected:** [Describe one real suggestion you turned down, and why. A candidate: returning uncategorised items in an "Other" group instead of excluding them. Or returning errors with HTTP 200 and an error body.]
