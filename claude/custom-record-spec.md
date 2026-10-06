# Custom-record specification: Vendor Kit Builder

ID convention: `customrecord_atr_kb_<name>` for records, `custrecord_atr_kb<abbr>_<field>` for their fields, `custitem_atr_*` for item fields, `custentity_atr_kb_*` for vendor fields. `atr` = Australia Tasting Room, `kb` = kit builder.

## 1. Kit Config: `customrecord_atr_kb_config`

One active record per vendor. Holds the vendor's kit rules.

| Field ID | Type | Notes |
| --- | --- | --- |
| `custrecord_atr_kbcfg_vendor` | List/Record: Vendor | Required. Must be unique among active records (enforce with a user event script). |
| `custrecord_atr_kbcfg_sizes` | Multiple Select: `customlist_atr_kb_kit_size` | List values are the text "6" and "12". Vendor picks the sizes they offer. |
| `custrecord_atr_kbcfg_season` | Free-Form Text (40) | Current season label, e.g. "Spring 2026". |
| `custrecord_atr_kbcfg_name_tpl` | Free-Form Text (100) | Naming pattern, e.g. `{winery} {season} {size}-Pack`. |
| `custrecord_atr_kbcfg_name_max` | Integer | Max kit name length. Defaults to 60 in code. |
| `isinactive` | native | Used to retire a config. |

## 2. Kit Category: `customrecord_atr_kb_category`

A vendor-defined group (Reds, Whites, Sparkling, Rosé). Child of Kit Config.

| Field ID | Type | Notes |
| --- | --- | --- |
| `name` | native | Category label shown in PIER. |
| `custrecord_atr_kbcat_config` | List/Record: Kit Config | Required. Parent link. |
| `custrecord_atr_kbcat_sort` | Integer | Display order. |
| `custrecord_atr_kbcat_min` | Integer | Minimum bottles of this category in a kit. Blank = 0. |
| `custrecord_atr_kbcat_max` | Integer | Maximum bottles. Blank = no limit. |

## 3. Kit Item Setting: `customrecord_atr_kb_item`

Links one item to one category, with the vendor's per-item limit. Child of Kit Config.

| Field ID | Type | Notes |
| --- | --- | --- |
| `custrecord_atr_kbi_config` | List/Record: Kit Config | Required. |
| `custrecord_atr_kbi_item` | List/Record: Item | Required. One active record per item per config. |
| `custrecord_atr_kbi_category` | List/Record: Kit Category | Required. Must belong to the same config. |
| `custrecord_atr_kbi_max` | Integer | Max of this item in one kit. Blank = no item limit. |
| `custrecord_atr_kbi_sort` | Integer | Order inside the category. |

## Relationships

```
Vendor (native) 1 ── 1 Kit Config 1 ── * Kit Category
                          │
                          └── * Kit Item Setting * ── 1 Inventory Item (native)
                                      └── 1 Kit Category
```

## Native records read, and fields added

**Vendor** (read: `companyname`, `entityid`, `isinactive`)
- `custentity_atr_kb_enabled` (Checkbox). Set by ATR staff. Means "this winery is in the kit programme". It is separate from the Kit Config so "not enabled" and "not set up yet" stay different errors.

**Inventory Item** (read: `displayname`, `itemid`, `baseprice`, `quantityavailable`, `isinactive`, vendor sublist)
- `custitem_atr_kb_eligible` (Checkbox). Item may be offered in kits.
- `custitem_atr_varietal` (List/Record: `customlist_atr_varietal`).
- `custitem_atr_vintage` (Integer).
- `custitem_atr_kb_image` (Image). File Cabinet file, available without login.
- `custitem_atr_kb_short_desc` (Free-Form Text, 300).

**Kit/Package item** (written by the finalise endpoint, not this task)
- `custitem_atr_kb_source_vendor` (List/Record: Vendor), `custitem_atr_kb_season` (Free-Form Text), `custitem_atr_kb_size` (Integer). These let us trace a kit back to the winery and season.
