// Copyright (c) 2025, Aravind Mandala and contributors
// For license information, please see license.txt

frappe.query_reports["Non-Billing Customers Report"] = {
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
		// {

		// 	"fieldname": "invoice",
		// 	"label": __("Sales Invoice"),
		// 	"fieldtype": "Select",
		// 	"options": "\nCustomers With Invoice\nCustomers Without Invoice",
		// 	"default": ""
		// },
        {
    "fieldname": "billing_gap",
    "label": __("Billing Gap Duration"),
    "fieldtype": "Select",
    "options": "\n1 Year\n2 Years\n3 Years\n4 Years\n5 Years\n5+ Years",
    "default": ""
},

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
	page_length: 50,  // 10, 20, 50, 100

	formatter: function (value, row, column, data, default_formatter) {
		value = default_formatter(value, row, column, data);

		if (column.fieldname === "select_row") {
			const checked = data.select_row ? 'checked' : '';
			const customer_id = frappe.utils.escape_html(data.customer || "");
			return `<input type="checkbox" class="report-checkbox" data-row='${customer_id}' ${checked}>`;
		}
		return value;
	},

	

	onload: function (report) {

    const user = frappe.session.user;
    const roles = frappe.user_roles || [];

    if (user !== "Administrator" && !roles.includes("System Manager")) {
        frappe.call({
            method: "renewal_module.api.get_salespersons_for_user",
            callback: function (r) {
                const options = r.message || [];
                if (options.length > 0) {
                    const firstSalesPerson = options[0].name;
                    report.set_filter_value("sales_person", [firstSalesPerson]);
                }
            }
        });
    }

    let assignBtn;

    function setCheckboxes(checked = true) {
        const dt = report.datatable;
        if (!dt || !dt.wrapper) {
            frappe.msgprint("No data available.");
            return;
        }

        if (dt.datamanager?.data) {
            dt.datamanager.data.forEach(row => {
                row.select_row = checked ? 1 : 0;
            });
        }

        dt.refresh();
        updateAssignButtonVisibility();
    }
// 	function setCheckboxes(checked = true) {
//     const dt = report.datatable;
//     if (!dt || !dt.datamanager?.data) return;

//     // Update data model
//     dt.datamanager.data.forEach(row => {
//         row.select_row = checked ? 1 : 0;
//     });

//     // Update DOM directly (IMPORTANT)
//     $('.report-checkbox').prop('checked', checked);

//     updateAssignButtonVisibility();
//     updateSelectedCount();
// }
// let selectedCountEl = report.page.add_inner_html(`
//     <div id="selected-count"
//          style="margin-left:15px;
//                 font-weight:600;
//                 color:#1f2937;">
//         Selected: 0
//     </div>
// `);
// function updateSelectedCount() {
//     const dt = report.datatable;
//     if (!dt?.datamanager?.data) return;

//     const count = dt.datamanager.data.filter(r => r.select_row).length;
//     $('#selected-count').text(`Selected: ${count}`);
// }


    function updateAssignButtonVisibility() {
        const anyChecked = !!document.querySelector('.report-checkbox:checked');
        if (assignBtn) {
            assignBtn.toggle(anyChecked);
        }
    }

    report.page.add_inner_button(__('Select All'), () => {
        setCheckboxes(true);
    });

    report.page.add_inner_button(__('Clear Selection'), () => {
        setCheckboxes(false);
    });

    assignBtn = report.page.add_inner_button("Assign User", function () {

        let selected = [];
        const dt = report.datatable;

        if (dt?.datamanager?.data) {
            dt.datamanager.data.forEach(row => {
                if (row.select_row) {
                    selected.push(row.customer);
                }
            });
        }

        if (!selected.length) {
            frappe.msgprint("Please select at least one customer.");
            return;
        }

        frappe.prompt([
            {
                label: 'User Email',
                fieldname: 'user_email',
                fieldtype: 'Link',
                options: 'User',
                reqd: 1
            }
        ], function (values) {
            frappe.call({
                method: 'renewal_module.api.bulk_assign_customer_to_salesperson_by_user',
                args: {
                    customers: selected,
                    user_email: values.user_email
                },
                callback: function (r) {
                    if (r.message === "ok") {
                        frappe.msgprint("User assigned successfully.");
                        report.refresh();
                    } else {
                        frappe.msgprint("Something went wrong: " + (r.message || "No response."));
                    }
                }
            });
        }, 'Assign User', 'Assign');
    });

    assignBtn.hide();

    // $(document).on('change', '.report-checkbox', function () {
    //     const rowKey = $(this).attr("data-row");
    //     const isChecked = $(this).is(":checked");

    //     const dt = report.datatable;
    //     if (dt?.datamanager?.data) {
    //         let row = dt.datamanager.data.find(r => r.customer === rowKey);
    //         if (row) {
    //             row.select_row = isChecked ? 1 : 0;
    //         }
    //     }

    //     updateAssignButtonVisibility();
    // });
	$(document).on('change', '.report-checkbox', function () {
    const rowKey = $(this).attr("data-row");
    const isChecked = $(this).is(":checked");

    const dt = report.datatable;
    if (dt?.datamanager?.data) {
        const row = dt.datamanager.data.find(r => r.customer === rowKey);
        if (row) {
            row.select_row = isChecked ? 1 : 0;
        }
    }

    updateAssignButtonVisibility();
    updateSelectedCount();
});

},






};

