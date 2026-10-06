# Kit Builder: eligible-items RESTlet

`GET /restlet?vendorId={vendor internal id}` returns the items a winery can offer in a kit, and the rules a kit must follow: kit sizes, category min/max, per-item max, season and naming. PIER only draws the UI. The rules live in NetSuite.

## Custom records

Three custom records. Kit Config is the parent. Kit Category and Kit Item Setting are its children (on each child's config field, "Record is Parent" is ticked).

**Kit Config** (`customrecord_atr_kb_config`): one active record per winery.
- `custrecord_atr_kbcfg_vendor`: Vendor
- `custrecord_atr_kbcfg_offers`: multi-select of kit sizes (6, 12)
- `custrecord_atr_kbcfg_season`: season label
- `custrecord_atr_kbcfg_name_template`, `custrecord_atr_kbcfg_name_max_len`: kit naming rules

**Kit Category** (`customrecord_atr_kb_category`): the winery's groups (Reds, Sparkling...).
- `custrecord_atr_kbcat_config`: parent link
- `custrecord_atr_kbcat_sort`, `custrecord_atr_kbcat_min`, `custrecord_atr_kbcat_max`

**Kit Item Setting** (`customrecord_atr_kb_item_setting`): puts one item in one category.
- `custrecord_atr_kbitm_config`: parent link
- `custrecord_atr_kbitm_item`, `custrecord_atr_kbitm_category`, `custrecord_atr_kbitm_max_per_kit`

**Native records read, with fields added:**
- Vendor: `custentity_atr_kb_enabled` (ATR switches a winery into the programme).
- Item: `custitem_atr_kb_eligible`, `custitem_atr_varietal`, `custitem_atr_vintage`, `custitem_atr_kb_short_desc`, `custitem_atr_kb_image`.

## Response

An array. Each entry is one category with its items. The winery-level settings are repeated on each entry.

```json
[{
  "offers": ["6", "12"],
  "season": "Spring 2026",
  "naming": { "template": "{winery} {season} {size}-Pack", "maxLength": 60 },
  "vendor": { "id": 123, "name": "Example Estate" },
  "category": { "id": 11, "name": "Reds", "min": 2, "max": null },
  "items": [{
    "id": 501, "sku": "EE-SHZ-21", "displayName": "Estate Shiraz 2021",
    "varietal": "Shiraz", "vintage": 2021, "description": "...",
    "imageUrl": "4821", "categoryId": 11, "maxPerKit": 2
  }]
}]
```

## Key design decisions

- **One SuiteQL query through N/query.** One round trip, paged at 1,000 rows, with aliases. The joins run config, category, item setting, item, so each item appears on one row and nothing multiplies. The code then groups the rows into the JSON above.
- **Parent/child records, each rule stored once.** "Reds, at least 2" is written on the category, not copied onto every red wine. Staff can edit a winery's whole setup from the Kit Config record.
- **Two switches.** The vendor flag is ATR's decision. The Kit Config is the winery's own setup. Together they decide whether a winery can build kits.
- **An item is offered only if** it is active, flagged eligible, and has a Kit Item Setting under that winery's config.
- **Vendor ID is a bound parameter**, never added to the SQL text.
- **Errors are thrown with `error.create`.** A RESTlet cannot set its own HTTP status. A thrown error comes back as 400 (or 500 if unexpected) with `error.code` in the body, so the code is the contract.

## How the write side (finalise-kit) would use this

It would load the same data for the vendor and re-check everything, and not trust PIER: the size is in `offers`, quantities add up to the size, each item is still eligible and in the config, per-item max, per-category min/max, and name length. It then creates a Kit/Package item (`kititem`) and sets:
- `itemid` and `displayname` from the naming template
- `salesdescription` and `taxschedule` (GST), and `subsidiary` if OneWorld
- `member` sublist: `item` and `quantity` for each selected wine
- `price` sublist: the base price line, by default the sum of the member base prices
- `isinactive` = false, plus the flag the Magento connector uses
- custom fields for the source winery, season and kit size, so each kit can be traced

An idempotency key would stop a double click creating two kits.

## What I would do differently with more time

- Add distinct error codes for vendor not found, vendor not enabled, no kit config and no eligible items. Today an unknown vendor and an empty config both return `[]`.
- Return one object per winery instead of one entry per category.
- Add price and available stock to each item, and turn `imageUrl` from a file id into a real URL.
- Check that an item really belongs to the winery (the item's vendor list). Today the Kit Item Setting is the only link.
- Take the vendor from the OAuth token's user instead of the query string.
- Cache the config for a few minutes, and keep price and stock live.
- Tests with a stubbed `N/query`, and a manual run through the edge cases: no categories, empty categories, ineligible items, over 40 items.
- Confirm `BUILTIN.DF` returns the multi-select kit sizes cleanly. If not, use the map table or checkboxes.

## AI use

I used Claude (Anthropic).

- **What Claude did:** it proposed the initial design, including the three-record structure, a first draft of the RESTlet and an early draft of this README. It also reviewed my RESTlet and pointed out bugs, which I fixed.
- **What I decided differently:** Claude first suggested separate N/search searches, one for each record type. I preferred a single N/query for simplicity.
- **What I changed:** I restructured the returned JSON to make it simpler and more straightforward.
