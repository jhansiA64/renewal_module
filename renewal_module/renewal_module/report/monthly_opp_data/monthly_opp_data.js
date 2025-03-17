// Copyright (c) 2025, Aravind Mandala and contributors
// For license information, please see license.txt

frappe.query_reports["Monthly Opp Data"] = {
	"filters": [
		{
			"fieldname": "sales_person",
			"label": __("Sales Person"),
			"fieldtype": "MultiSelectList",
			"options": "Sales Person",
			get_data: function (txt) {
				return frappe.db.get_link_options('Sales Person', txt);
			},
		},


	]
};
