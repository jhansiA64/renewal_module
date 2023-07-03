// Copyright (c) 2023, Aravind Mandala and contributors
// For license information, please see license.txt
/* eslint-disable */

frappe.query_reports["Active Renewals (After End Date)"] = {
	"filters": [{
			"fieldname":"company",
			"label": __("Company"),
			"fieldtype": "Link",
			"options": "Company",
			"default": frappe.defaults.get_user_default("Company"),
			"reqd": 1
		},
		
		{
			"fieldname":"end_date",
			"label": __("End Date"),
			"fieldtype": "Date",
			"default": frappe.datetime.get_today(),
			"reqd": 1
		},
		{
			"fieldname":"item_code",
			"label": __("Item Code"),
			"fieldtype": "Link",
			"options": "Item"
		},
		{
			"fieldname":"renewal_id",
			"label": __("Renewal ID"),
			"fieldtype": "Link",
			"options": "Renewal List"
		},
		
		{
			"fieldname":"customer",
			"label": __("Customer"),
			"fieldtype": "Link",
			"options": "Customer"
		},
		{
			"fieldname":"sales_person",
			"label": __("Sales Person"),
			"fieldtype": "Link",
			"options": "Sales Person"
		} 

	]
};
