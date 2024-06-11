// Copyright (c) 2024, Aravind Mandala and contributors
// For license information, please see license.txt
/* eslint-disable */

frappe.query_reports["Sales Order And SQ"] = {
	"filters": [
		{
			"fieldname":"name",
			"label":"Sales order",
			"fieldtype":"MultiSelectList",
			'get_data':function(){return frappe.db.get_link_options('Sales Order')},
			"width":100
		},
		{
			"fieldname":"from",
			"label":"Form Date",
			"fieldtype":"Date",
			"width":100,
			"redg":1,
			"deault":dateutil.year_start()
		},
		{
			"fieldname":"to",
			"label":"To Date",
			"fieldtype":"Date",
			"width":100,
			'redg':1,
			"deault":dateutil.year_end()
		},
		{
			"fieldname":"item",
			"label":"Item",
			"fieldtype":"MultiSelectList",
			'get_data':function(){return frappe.db.get_link_options('Item')},
			"width":100
		},
		{
			"fieldname":"item_group",
			"label":"Item Groups",
			"fieldtype":"MultiSelectList",
			'get_data':function(){return frappe.db.get_link_options('Item Group')},
			"width":100
		},
		{
			"fieldname":"brand",
			"label":"Brand",
			"fieldtype":"MultiSelectList",
			'get_data':function(){return frappe.db.get_link_options('Brand')},
			"width":100
		}
	]
};