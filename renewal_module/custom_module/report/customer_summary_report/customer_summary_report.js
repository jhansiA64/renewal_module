// Copyright (c) 2026, Aravind Mandala and contributors
// For license information, please see license.txt

frappe.query_reports["Customer Summary Report"] = {
	"filters": [
		 {
			fieldname: "sales_person",
			label: __("Sales Person"),
			fieldtype: "MultiSelectList",
			default: [],
			get_data: function (txt) {
				return frappe.call({
					method: "renewal_module.api.get_salespersons_for_user"
				}).then(r => {
					const results = (r.message || []).filter(item =>
						item.name.toLowerCase().includes(txt.toLowerCase())
					);
					return results.map(item => ({
						value: item.name,
						description: item.parent_sales_person
					}));
				});
			}

		},
		  {
            fieldname: "customer_group",
            label: __("Customer Group"),
            fieldtype: "Link",
            options: "Customer Group"
        },
		{
			"fieldname": "territory",
			"label": __("Territory"),
			"fieldtype": "MultiSelectList",
			"options": "Territory",
			get_data: function (txt) {
				return frappe.db.get_link_options('Territory', txt);
			},
		},
		{
			"fieldname": "industry",
			"label": __("Industry Type"),
			"fieldtype": "MultiSelectList",
			"options": "Industry",
			get_data: function (txt) {
				return frappe.db.get_link_options('Industry Type', txt);
			},
		},
       
    ],

    onload: function(report) {
        report.page.add_inner_button(__("Non Billing Customers"), function () {
            report.set_filter_value("billing_status", "Non-Billing");
        });
		},

		formatter: function(value, row, column, data, default_formatter) {
			// Style child rows (indented rows)
			if (data.indent === 1) {
				value = "<div style='margin-left: 30px; color: #666;'>" + value + "</div>";
			}
			return value;
		},

		after_datatable_render: function(datatable) {
			// Add visual styling for hierarchy
			datatable.wrapper.querySelectorAll('[data-row-index]').forEach((row, idx) => {
				let data = datatable.datamanager.data[idx];
				if (data && data.indent === 1) {
					row.style.backgroundColor = '#f9f9f9';
					row.style.borderLeft = '3px solid #d3d3d3';
				}
			});
		}
};
