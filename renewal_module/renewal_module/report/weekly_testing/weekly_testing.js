// Copyright (c) 2023, Aravind Mandala and contributors
// For license information, please see license.txt
/* eslint-disable */

frappe.query_reports["Weekly Testing"] = {
	"filters": [
		{
			fieldname:"company",
			label: __("Company"),
			fieldtype: "Link",
			options: "Company",
			default: frappe.defaults.get_user_default("Company")
		},
		
		{
			fieldname: "doctype",
			label: __("Document Type"),
			fieldtype: "Select",
			options: "Sales Order",
			default: "Opportunity"
		},
		{
			fieldname: "from_date",
			label: __("From Date"),
			fieldtype: "Date",
			default: frappe.datetime.add_days(frappe.datetime.get_today(), -31),
			reqd: 1
		},
		{
			"fieldname":"to_date",
			"label": __("To Date"),
			"fieldtype": "Date",
			"default": frappe.datetime.get_today(),
			"reqd": 1
		},
		
		
		{
			fieldname: "fiscal_year",
			label: __("Fiscal Year"),
			fieldtype: "Link",
			options: "Fiscal Year",
			"default":"2023-2024"
					
		},
		

	],
	get_datatable_options(options) {
		return Object.assign(options, {
			checkboxColumn: true,
			events: {
				onCheckRow: function (data) {
					if (!data) return;
					const data_doctype = $(
						data[2].html
					)[0].attributes.getNamedItem("data-doctype").value;
					const tree_type = frappe.query_report.filters[0].value;
					if (data_doctype != tree_type) return;

					const row_name = data[2].content;
					const raw_data = frappe.query_report.chart.data;
					const new_datasets = raw_data.datasets;
					const element_found = new_datasets.some(
						(element, index, array) => {
							if (element.name == row_name) {
								array.splice(index, 1);
								return true;
							}
							return false;
						}
					);
					const slice_at = { Customer: 4, Item: 5 }[tree_type] || 3;

					if (!element_found) {
						new_datasets.push({
							name: row_name,
							values: data
								.slice(slice_at, data.length - 1)
								.map(column => column.content),
						});
					}

					const new_data = {
						labels: raw_data.labels,
						datasets: new_datasets,
					};
					const new_options = Object.assign({}, frappe.query_report.chart_options, {data: new_data});
					frappe.query_report.render_chart(new_options);

					frappe.query_report.raw_chart_data = new_data;
				},
			},
		});
	},

	"formatter": function(value, row, column, data, default_formatter) {
		// console.log(value, row, column, data, default_formatter);
		if ((data && column.fieldname=="brand" && data.brand && value)) {
			value = data.brand || value;

			column.link_onclick =
				"frappe.query_reports['Weekly Testing'].open_overall_sales_report(" + JSON.stringify(data) + ")";
		}
		if ((data && column.fieldname=="item_group" && data.item_group && value)) {
			value = data.item_group || value;

			column.link_onclick =
				"frappe.query_reports['Weekly Testing'].open_overall_sales_report(" + JSON.stringify(data) + ")";
		}
		if ((data && column.fieldname=="sales_person" && data.sales_person&& value)) {
			value = data.sales_person || value;

		}
		value = default_formatter(value, row, column, data);
		if (data && !data.parent) {
			value = $(`<span>${value}</span>`);
			var $value = $(value).css("font-weight", "bold");
			if (data.warn_if_negative && data[column.fieldname] < 0) {
				$value.addClass("text-danger");
			}
		value = $value.wrap("<p></p>").parent().html();
		}

		return value;
	},

	"open_overall_sales_report": function(data) {
		if (!data.sales_person) return;
		// var project = $.grep(frappe.query_report.filters, function(e){ return e.df.fieldname == 'project'; })

		frappe.route_options = {
			"sales_person": data.sales_person,
			"company": frappe.query_report.get_filter_value('company'),
			"from_date": frappe.query_report.get_filter_value('from_date'),
			"to_date": frappe.query_report.get_filter_value('to_date'),
			"brand":data.brand
		};
		frappe.set_route("query-report", "Overall Sales Report");
	},
};