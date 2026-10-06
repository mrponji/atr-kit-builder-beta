/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 * @NModuleScope SameAccount
 *
 * ATR Vendor Kit Builder - read endpoint
 *
 * GET ...?vendorId={vendor internal id}
 *
 * Returns the items a winery can put in a "wine of the month" kit,
 * and the rules a valid kit must follow. PIER only renders this.
 * All logic lives here and in the custom records (see custom-record-spec.md).
 *
 * Reads:
 *   - Vendor (native) + custentity_atr_kb_enabled
 *   - customrecord_atr_kb_config, customrecord_atr_kb_category, customrecord_atr_kb_item
 *   - Inventory items (native) + custitem_atr_* fields
 *   - File records (image URLs)
 */
define(['N/search', 'N/error', 'N/log', 'N/url'], (search, error, log, url) => {

    // ---------------------------------------------------------------
    // Constants
    // ---------------------------------------------------------------

    // Error codes. These come back in the NetSuite error body as error.code.
    // The comment shows the HTTP status we intend (see README, "HTTP status codes").
    const ERR = Object.freeze({
        INVALID_VENDOR_ID: 'KB_INVALID_VENDOR_ID',     // 400
        VENDOR_NOT_FOUND: 'KB_VENDOR_NOT_FOUND',       // 404
        VENDOR_NOT_ENABLED: 'KB_VENDOR_NOT_ENABLED',   // 403
        NO_KIT_CONFIG: 'KB_NO_KIT_CONFIG',             // 409
        NO_ELIGIBLE_ITEMS: 'KB_NO_ELIGIBLE_ITEMS',     // 409
        UNEXPECTED: 'KB_UNEXPECTED_ERROR'              // 500
    });

    const VENDOR_ENABLED = 'custentity_atr_kb_enabled';

    const REC = Object.freeze({
        CONFIG: 'customrecord_atr_kb_config',
        CATEGORY: 'customrecord_atr_kb_category',
        ITEM: 'customrecord_atr_kb_item'
    });

    const CFG = Object.freeze({
        VENDOR: 'custrecord_atr_kbcfg_vendor',
        SIZES: 'custrecord_atr_kbcfg_sizes',
        SEASON: 'custrecord_atr_kbcfg_season',
        NAME_TEMPLATE: 'custrecord_atr_kbcfg_name_tpl',
        NAME_MAX: 'custrecord_atr_kbcfg_name_max'
    });

    const CAT = Object.freeze({
        CONFIG: 'custrecord_atr_kbcat_config',
        SORT: 'custrecord_atr_kbcat_sort',
        MIN: 'custrecord_atr_kbcat_min',
        MAX: 'custrecord_atr_kbcat_max'
    });

    const SET = Object.freeze({
        CONFIG: 'custrecord_atr_kbi_config',
        ITEM: 'custrecord_atr_kbi_item',
        CATEGORY: 'custrecord_atr_kbi_category',
        MAX: 'custrecord_atr_kbi_max',
        SORT: 'custrecord_atr_kbi_sort'
    });

    const ITM = Object.freeze({
        ELIGIBLE: 'custitem_atr_kb_eligible',
        VARIETAL: 'custitem_atr_varietal',
        VINTAGE: 'custitem_atr_vintage',
        IMAGE: 'custitem_atr_kb_image',
        SHORT_DESC: 'custitem_atr_kb_short_desc'
    });

    // "Vendor" filter on item search: matches any vendor on the item's Vendor sublist.
    // If ATR only wants the preferred vendor, change this field id (check the schema browser).
    const ITEM_VENDOR_FILTER = 'othervendor';

    const DEFAULT_NAME_TEMPLATE = '{winery} {season} {size}-Pack';
    const DEFAULT_NAME_MAX = 60; // item Name/Number length limit
    const PAGE_SIZE = 200;
    const LAST = 9999; // sort value for rows with no sort order

    // ---------------------------------------------------------------
    // Small helpers
    // ---------------------------------------------------------------

    const fail = (code, message) => {
        throw error.create({ name: code, message, notifyOff: true });
    };

    const isTrue = (v) => v === true || v === 'T';

    const toInt = (v) => {
        const n = parseInt(v, 10);
        return Number.isNaN(n) ? null : n;
    };

    const toNumber = (v) => {
        const n = parseFloat(v);
        return Number.isNaN(n) ? null : n;
    };

    /** Runs a search page by page and maps each row. */
    const fetchAll = (searchObj, mapRow) => {
        const out = [];
        const paged = searchObj.runPaged({ pageSize: PAGE_SIZE });
        paged.pageRanges.forEach((range) => {
            paged.fetch({ index: range.index }).data.forEach((row) => out.push(mapRow(row)));
        });
        return out;
    };

    // ---------------------------------------------------------------
    // Loaders - one search each
    // ---------------------------------------------------------------

    const loadVendor = (vendorId) => {
        const rows = fetchAll(
            search.create({
                type: search.Type.VENDOR,
                filters: [['internalid', 'anyof', vendorId]],
                columns: ['entityid', 'companyname', 'isinactive', VENDOR_ENABLED]
            }),
            (r) => ({
                name: r.getValue('companyname') || r.getValue('entityid'),
                inactive: isTrue(r.getValue('isinactive')),
                enabled: isTrue(r.getValue(VENDOR_ENABLED))
            })
        );
        return rows[0] || null;
    };

    const loadConfig = (vendorId) => {
        const rows = fetchAll(
            search.create({
                type: REC.CONFIG,
                filters: [[CFG.VENDOR, 'anyof', vendorId], 'AND', ['isinactive', 'is', 'F']],
                columns: [CFG.SIZES, CFG.SEASON, CFG.NAME_TEMPLATE, CFG.NAME_MAX]
            }),
            (r) => ({
                id: r.id,
                // multi-select comes back as "6,12" in text form
                sizes: [...new Set(
                    String(r.getText(CFG.SIZES) || '')
                        .split(',')
                        .map((s) => toInt(s.trim()))
                        .filter((n) => n && n > 0)
                )].sort((a, b) => a - b),
                season: r.getValue(CFG.SEASON) || null,
                nameTemplate: r.getValue(CFG.NAME_TEMPLATE) || DEFAULT_NAME_TEMPLATE,
                nameMax: toInt(r.getValue(CFG.NAME_MAX)) || DEFAULT_NAME_MAX
            })
        );
        if (rows.length > 1) {
            log.warn('Multiple active kit configs', `Vendor ${vendorId} has ${rows.length}; using the first.`);
        }
        return rows[0] || null;
    };

    const loadCategories = (configId) =>
        fetchAll(
            search.create({
                type: REC.CATEGORY,
                filters: [[CAT.CONFIG, 'anyof', configId], 'AND', ['isinactive', 'is', 'F']],
                columns: [
                    'name',
                    CAT.MIN,
                    CAT.MAX,
                    search.createColumn({ name: CAT.SORT, sort: search.Sort.ASC })
                ]
            }),
            (r) => ({
                id: r.id,
                name: r.getValue('name'),
                sortOrder: toInt(r.getValue(CAT.SORT)),
                minQty: toInt(r.getValue(CAT.MIN)) || 0,
                maxQty: toInt(r.getValue(CAT.MAX)) // null = no limit
            })
        );

    /** Item settings for this vendor's config, keyed by item id. */
    const loadItemSettings = (configId) => {
        const byItem = new Map();
        fetchAll(
            search.create({
                type: REC.ITEM,
                filters: [[SET.CONFIG, 'anyof', configId], 'AND', ['isinactive', 'is', 'F']],
                columns: [SET.ITEM, SET.CATEGORY, SET.MAX, SET.SORT]
            }),
            (r) => ({
                itemId: r.getValue(SET.ITEM),
                categoryId: r.getValue(SET.CATEGORY),
                maxPerKit: toInt(r.getValue(SET.MAX)),
                sortOrder: toInt(r.getValue(SET.SORT))
            })
        ).forEach((s) => byItem.set(s.itemId, s));
        return byItem;
    };

    /** Active inventory items this vendor supplies that are flagged eligible. */
    const loadEligibleItems = (vendorId) => {
        const seen = new Map(); // de-dupe in case the vendor sublist returns repeat rows
        fetchAll(
            search.create({
                type: search.Type.ITEM,
                filters: [
                    ['type', 'anyof', 'InvtPart'], 'AND',
                    ['isinactive', 'is', 'F'], 'AND',
                    [ITEM_VENDOR_FILTER, 'anyof', vendorId], 'AND',
                    [ITM.ELIGIBLE, 'is', 'T']
                ],
                columns: [
                    search.createColumn({ name: 'displayname', sort: search.Sort.ASC }),
                    'itemid',
                    'baseprice',
                    'quantityavailable',
                    ITM.VARIETAL,
                    ITM.VINTAGE,
                    ITM.IMAGE,
                    ITM.SHORT_DESC
                ]
            }),
            (r) => ({
                id: r.id,
                sku: r.getValue('itemid'),
                name: r.getValue('displayname') || r.getValue('itemid'),
                price: toNumber(r.getValue('baseprice')),
                available: toInt(r.getValue('quantityavailable')) || 0,
                varietal: r.getText(ITM.VARIETAL) || null,
                vintage: toInt(r.getValue(ITM.VINTAGE)),
                imageFileId: r.getValue(ITM.IMAGE) || null,
                description: r.getValue(ITM.SHORT_DESC) || null
            })
        ).forEach((row) => seen.set(row.id, row));
        return [...seen.values()];
    };

    /** One search for all image URLs, instead of loading each file. */
    const loadImageUrls = (fileIds) => {
        const urls = new Map();
        if (!fileIds.length) return urls;
        const host = url.resolveDomain({ hostType: url.HostType.APPLICATION });
        fetchAll(
            search.create({
                type: search.Type.FILE,
                filters: [['internalid', 'anyof', fileIds]],
                columns: ['url']
            }),
            (r) => urls.set(r.id, `https://${host}${r.getValue('url')}`)
        );
        return urls;
    };

    // ---------------------------------------------------------------
    // Building the response
    // ---------------------------------------------------------------

    const configWarnings = (config, categories) => {
        const warnings = [];
        categories.forEach((c) => {
            if (c.maxQty !== null && c.minQty > c.maxQty) {
                warnings.push(`Category "${c.name}" has a minimum (${c.minQty}) higher than its maximum (${c.maxQty}).`);
            }
        });
        const sumOfMins = categories.reduce((sum, c) => sum + c.minQty, 0);
        if (sumOfMins > config.sizes[0]) {
            warnings.push(`Category minimums add up to ${sumOfMins}, which is more than the smallest kit size (${config.sizes[0]}).`);
        }
        return warnings;
    };

    const buildItems = (itemRows, settings, categoryIds, imageUrls) => {
        const items = [];
        let skipped = 0;
        itemRows.forEach((row) => {
            const setting = settings.get(row.id);
            if (!setting || !categoryIds.has(setting.categoryId)) {
                skipped += 1; // eligible, but the vendor has not put it in a category
                return;
            }
            items.push({
                sort: setting.sortOrder === null ? LAST : setting.sortOrder,
                item: {
                    id: row.id,
                    sku: row.sku,
                    name: row.name,
                    varietal: row.varietal,
                    vintage: row.vintage,
                    description: row.description,
                    imageUrl: row.imageFileId ? (imageUrls.get(row.imageFileId) || null) : null,
                    price: row.price === null ? null : { amount: row.price, currency: 'AUD' },
                    categoryId: setting.categoryId,
                    maxPerKit: setting.maxPerKit, // null = no item limit
                    stock: { available: row.available, inStock: row.available > 0 }
                }
            });
        });
        items.sort((a, b) => a.sort - b.sort || a.item.name.localeCompare(b.item.name));
        return { items: items.map((x) => x.item), skipped };
    };

    // ---------------------------------------------------------------
    // GET handler
    // ---------------------------------------------------------------

    const get = (params) => {
        const started = Date.now();
        let vendorId = null;
        try {
            const raw = String((params && params.vendorId) || '').trim();
            if (!/^\d+$/.test(raw)) {
                fail(ERR.INVALID_VENDOR_ID, 'vendorId is required and must be a NetSuite internal id (digits only).');
            }
            vendorId = raw;

            // TODO(auth): in production, take the vendor from the OAuth token's user
            // (N/runtime getCurrentUser -> vendor mapping) and reject a vendorId that does not match.

            const vendor = loadVendor(vendorId);
            if (!vendor) {
                fail(ERR.VENDOR_NOT_FOUND, `No vendor found with internal id ${vendorId}.`);
            }
            if (vendor.inactive || !vendor.enabled) {
                fail(ERR.VENDOR_NOT_ENABLED, `Vendor ${vendorId} is not enabled for the kit builder programme.`);
            }

            const config = loadConfig(vendorId);
            if (!config) {
                fail(ERR.NO_KIT_CONFIG, `Vendor ${vendorId} has no active kit configuration.`);
            }
            if (!config.sizes.length) {
                fail(ERR.NO_KIT_CONFIG, `Vendor ${vendorId} has a kit configuration with no kit sizes set.`);
            }
            const categories = loadCategories(config.id);
            if (!categories.length) {
                fail(ERR.NO_KIT_CONFIG, `Vendor ${vendorId} has a kit configuration with no active categories.`);
            }

            const settings = loadItemSettings(config.id);
            if (!settings.size) {
                fail(ERR.NO_ELIGIBLE_ITEMS, `Vendor ${vendorId} has no items set up for kits.`);
            }

            const itemRows = loadEligibleItems(vendorId);
            const imageIds = [...new Set(itemRows.map((r) => r.imageFileId).filter(Boolean))];
            const { items, skipped } = buildItems(
                itemRows,
                settings,
                new Set(categories.map((c) => c.id)),
                loadImageUrls(imageIds)
            );
            if (!items.length) {
                fail(ERR.NO_ELIGIBLE_ITEMS, `Vendor ${vendorId} has no items that are eligible for kits.`);
            }

            const warnings = configWarnings(config, categories);
            if (skipped) {
                warnings.push(`${skipped} eligible item(s) are not in an active category and were left out.`);
                log.warn('Eligible items without a category', `Vendor ${vendorId}: ${skipped} item(s).`);
            }

            log.audit('kit-builder get ok',
                `vendor=${vendorId} items=${items.length} categories=${categories.length} ms=${Date.now() - started}`);

            return {
                vendor: { id: vendorId, name: vendor.name },
                season: { label: config.season },
                kit: {
                    allowedSizes: config.sizes,
                    naming: { template: config.nameTemplate, maxLength: config.nameMax }
                },
                categories: categories.map((c) => ({
                    id: c.id,
                    name: c.name,
                    minQty: c.minQty,
                    maxQty: c.maxQty
                })),
                items,
                meta: {
                    itemCount: items.length,
                    currency: 'AUD',
                    generatedAt: new Date().toISOString(),
                    warnings
                }
            };
        } catch (e) {
            if (Object.values(ERR).includes(e.name)) {
                log.audit('kit-builder get rejected', `vendor=${vendorId} code=${e.name}`);
                throw e;
            }
            log.error('kit-builder get failed', `vendor=${vendorId} ${e.name}: ${e.message}\n${e.stack || ''}`);
            throw error.create({
                name: ERR.UNEXPECTED,
                message: 'Unexpected error while loading kit builder data. Please contact ATR support.',
                notifyOff: false
            });
        }
    };

    return { get };
});
