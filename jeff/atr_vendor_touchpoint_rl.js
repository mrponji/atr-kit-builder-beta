/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 * @NModuleScope SameAccount
 */
define(['N/query', 'N/error'], (query, error) => {
	const MAX_PAGE_SIZE = 1000;

	/**
	 * 
	 * @returns {string}
	 */
	const getQueryBuilderSqlString = () => {
		return `
			SELECT
				kitConfig.id												AS config_id,
				kitConfig.name											 AS config_name,
				BUILTIN.DF(kitConfig.custrecord_atr_kbcfg_offers)			AS package_offers,
				kitConfig.custrecord_atr_kbcfg_season			  AS season,
				kitConfig.custrecord_atr_kbcfg_name_template	 AS name_template,
				kitConfig.custrecord_atr_kbcfg_name_max_len	  AS name_max_len,

				winery.id													AS vendor_id,
				COALESCE(winery.companyname, winery.entityid)	AS vendor_name,
				winery.custentity_atr_kb_enabled					 AS vendor_enabled,
				winery.isinactive										 AS vendor_inactive,

				kitCategory.id											 AS category_id,
				kitCategory.name										  AS category_name,
				kitCategory.custrecord_atr_kbcat_min				AS category_min,
				kitCategory.custrecord_atr_kbcat_max				AS category_max,

				kitItemSetting.id										 AS setting_id,
				kitItemSetting.custrecord_atr_kbitm_max_per_kit AS max_per_kit,

				item.id													  AS item_id,
				item.itemid												 AS item_sku,
				item.displayname										  AS item_name,
				BUILTIN.DF(item.custitem_atr_varietal)			 AS item_varietal,
				item.custitem_atr_vintage							  AS item_vintage,
				item.custitem_atr_kb_short_desc					  AS item_description,
				item.custitem_atr_kb_image							 AS item_image_file_id
			FROM customrecord_atr_kb_config AS kitConfig
			INNER JOIN vendor AS winery
				ON winery.id = kitConfig.custrecord_atr_kbcfg_vendor
			LEFT JOIN customrecord_atr_kb_category AS kitCategory
				ON  kitCategory.custrecord_atr_kbcat_config = kitConfig.id
				AND kitCategory.isinactive = 'F'
			LEFT JOIN customrecord_atr_kb_item_setting AS kitItemSetting
				ON  kitItemSetting.custrecord_atr_kbitm_category = kitCategory.id
				AND kitItemSetting.custrecord_atr_kbitm_config	= kitConfig.id
				AND kitItemSetting.isinactive = 'F'
			LEFT JOIN item
				ON  item.id = kitItemSetting.custrecord_atr_kbitm_item
				AND item.isinactive = 'F'
				AND item.custitem_atr_kb_eligible = 'T'
			WHERE kitConfig.isinactive = 'F' AND winery.id = ?
			ORDER BY kitConfig.id,
				kitCategory.custrecord_atr_kbcat_sort,
				kitCategory.name,
				item.displayname`;
	};

	/**
	 * 
	 * @param {object} params 
	*/
	const get = (params) => {
		try {
			log.debug('get STARTED params', params);

			if ( !(Number(params.vendorId) > 0) )
				throw error.create({ name: 'INVALID_VENDOR_ID', message: 'A valid vendor ID is required' });

			let results = [];

      	const pagedResults = query.runSuiteQLPaged({
				query: getQueryBuilderSqlString(params.vendorId),
				params: [Number(params.vendorId)],
				pageSize: MAX_PAGE_SIZE
			});

      	pagedResults.pageRanges.forEach((range) => {
            pagedResults.fetch({
					index: range.index
				}).data.asMappedResults().forEach((result) => {
					let category = results.find(r => r.category.id == result.category_id);

					if ( !category ) {
						results.push({
							offers: String(result.package_offers).split(',').map(id => String(id).trim()).filter(id => Number(id)), // Assumes 6, 12
							season: result.season,
							naming: {
								template: result.name_template,
								maxLength: result.name_max_len,
							},
							vendor: {
								id: result.vendor_id,
								name: result.vendor_name
							},
							category: {
								id: result.category_id,
								name: result.category_name,
								min: result.category_min,
								max: result.category_max
							},
							items: [],
						});

						category = results[results.length - 1];
					}

					if ( result.item_id ) {
						category.items.push({
							id: result.item_id,
							sku: result.item_sku,
							displayName: result.item_name,
							varietal: result.item_varietal,
							vintage: result.item_vintage,
							description: result.item_description,
							imageUrl: result.item_image_file_id,
							categoryId: result.category_id,
							maxPerKit: result.max_per_kit,
						});
					}
				});
			});

			log.debug(`get results(${results.length})`, results);

			return results;
		} catch(e) {
			log.error('get Error', e);

			throw error.create({
				name: e.name || 'UNEXPECTED_ERROR',
				message: (
					typeof e === 'string'
					? e
					: e.message || e.name || JSON.stringify(e)
				)
			});
		}
	};

	 return { get };
});