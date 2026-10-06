# Custom-record specification: Vendor Kit Builder

## ID convention

- Records: `customrecord_atr_kb_<name>`
- Record fields: `custrecord_atr_kb<abbr>_<field>` (`cfg` = config, `cat` = category, `itm` = item setting)
- Item fields: `custitem_atr_*`. Vendor fields: `custentity_atr_kb_*`. Custom lists: `customlist_atr_*`.
- `atr` = Australia Tasting Room, `kb` = kit builder.

## Relationships

```
Vendor (native) 1 ── 1 Kit Config (parent)
                        ├── * Kit Category      (child)
                        └── * Kit Item Setting  (child) ── 1 Item (native)
                                                       └── 1 Kit Category
```

Kit Config is the only parent. Kit Category and Kit Item Setting each have a config field with **Record is Parent** ticked, so they show as subtabs on the Kit Config. A Kit Item Setting also points at a Kit Category, but that is a normal list field, not a parent link.

## 1. Kit Config: `customrecord_atr_kb_config`

One active record per vendor. Holds the winery-level kit rules.

| Field ID | Type | Notes |
| --- | --- | --- |
| `name` | native | Readable label, e.g. winery plus season. |
| `custrecord_atr_kbcfg_vendor` | List/Record: Vendor | Required. One active config per vendor (enforce with a user event script). |
| `custrecord_atr_kbcfg_offers` | Multiple Select: `customlist_atr_kb_kit_size` | Kit sizes the winery offers. List values: 6, 12. |
| `custrecord_atr_kbcfg_season` | Free-Form Text | Current season label, e.g. "Spring 2026". |
| `custrecord_atr_kbcfg_name_template` | Free-Form Text | Kit naming pattern, e.g. `{winery} {season} {size}-Pack`. |
| `custrecord_atr_kbcfg_name_max_len` | Integer | Maximum kit name length. |
| `isinactive` | native | Retires a config. |

## 2. Kit Category: `customrecord_atr_kb_category`

A winery-defined group (Reds, Whites, Sparkling). Child of Kit Config.

| Field ID | Type | Notes |
| --- | --- | --- |
| `name` | native | Category label shown in PIER. |
| `custrecord_atr_kbcat_config` | List/Record: Kit Config | Required. **Record is Parent.** |
| `custrecord_atr_kbcat_sort` | Integer | Display order of categories. |
| `custrecord_atr_kbcat_min` | Integer | Minimum bottles of this category in a kit. Blank = 0. |
| `custrecord_atr_kbcat_max` | Integer | Maximum bottles. Blank = no limit. |
| `isinactive` | native | |

## 3. Kit Item Setting: `customrecord_atr_kb_item_setting`

Puts one item in one category and holds the per-item limit. Child of Kit Config.

| Field ID | Type | Notes |
| --- | --- | --- |
| `custrecord_atr_kbitm_config` | List/Record: Kit Config | Required. **Record is Parent.** |
| `custrecord_atr_kbitm_item` | List/Record: Item | Required. One active setting per item per config. |
| `custrecord_atr_kbitm_category` | List/Record: Kit Category | Required. Sourcing/filtering limits the list to categories of the same config. |
| `custrecord_atr_kbitm_max_per_kit` | Integer | Maximum of this item in one kit. Blank = no limit. |
| `isinactive` | native | |

## Native records read, and fields added

**Vendor**
- Read: `companyname`, `entityid`, `isinactive`.
- Added: `custentity_atr_kb_enabled` (Checkbox). ATR staff tick it to put a winery in the kit programme.

**Item** (inventory items)
- Read: `itemid`, `displayname`, `isinactive`. Price (`baseprice`) and stock (`quantityavailable`) are planned, not read yet.
- Added:
  - `custitem_atr_kb_eligible` (Checkbox): the item may be offered in kits.
  - `custitem_atr_varietal` (List/Record: `customlist_atr_varietal`).
  - `custitem_atr_vintage` (Integer).
  - `custitem_atr_kb_short_desc` (Free-Form Text).
  - `custitem_atr_kb_image` (Image): File Cabinet file.

**Kit/Package item** (created later by the finalise-kit endpoint)
- Added: `custitem_atr_kb_source_vendor` (List/Record: Vendor), `custitem_atr_kb_season` (Free-Form Text), `custitem_atr_kb_size` (Integer). These trace each kit back to its winery, season and size.
