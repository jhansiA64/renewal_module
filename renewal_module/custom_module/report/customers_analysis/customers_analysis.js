// Copyright (c) 2026, Aravind Mandala and contributors
// For license information, please see license.txt

frappe.query_reports["Customers Analysis"] = {
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

		
		// {

		// 	"fieldname": "based_on",
		// 	"label": __("Based On"),
		// 	"fieldtype": "Select",
		// 	"options": "Customers",
		// 	"default": "Customers"
		// },
		{

			"fieldname": "contacts",
			"label": __("Contacts"),
			"fieldtype": "Select",
			"options": "\nCustomers With Contacts\nCustomers Without Contacts",
			"default": ""
		},
		// {

		// 	"fieldname": "opportunity",
		// 	"label": __("Opportunity"),
		// 	"fieldtype": "Select",
		// 	"options": "\nCustomers With Opps\nCustomers Without Opps",
		// 	"default": ""
		// },
		{

			"fieldname": "invoice",
			"label": __("Sales Invoice"),
			"fieldtype": "Select",
			"options": "\nCustomers With Invoice\nCustomers Without Invoice",
			"default": ""
		},
//         {
//     "fieldname": "billing_gap",
//     "label": __("Billing Gap Duration"),
//     "fieldtype": "Select",
//     "options": "\n1 Year\n2 Years\n3 Years\n4 Years\n5 Years\n5+ Years",
//     "default": ""
// },
{
    fieldname: "amount_range",
    label: __("Amount Range"),
    fieldtype: "Select",
    options: "\n0-50K\n50K-1L\n1L-5L\n5L+\nCustom",
    default: ""
}
,
{
    fieldname: "from_amount",
    label: __("From Amount"),
    fieldtype: "Currency",
    depends_on: "eval:doc.amount_range == 'Custom'"
},
{
    fieldname: "to_amount",
    label: __("To Amount"),
    fieldtype: "Currency",
    depends_on: "eval:doc.amount_range == 'Custom'"
}
,

		{

			"fieldname": "renewals",
			"label": __("Renewals"),
			"fieldtype": "Select",
			"options": "\nCustomers With Renewals\nCustomers Without Renewals",
			"default": ""
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
		{
			"fieldname": "created_by",
			"label": __("Created By"),
			"fieldtype": "MultiSelectList",
			"options": "User",
			get_data: function (txt) {
				return frappe.db.get_link_options('User', txt);
			}
		},
		{
			fieldname: "starts_with",
			label: __("Starts With"),
			fieldtype: "MultiSelectList",
			options: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"],
			multiple: 1
		},


	],
};
