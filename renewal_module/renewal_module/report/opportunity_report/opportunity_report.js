// Copyright (c) 2024, Aravind Mandala and contributors
// For license information, please see license.txt
/* eslint-disable */

frappe.query_reports["Opportunity Report"] = {
	"filters": [
		{
			"fieldname":"company",
			"label": __("Company"),
			"fieldtype": "Link",
			"options": "Company",
			"default": frappe.defaults.get_user_default("Company"),
			"reqd": 1
		},
		{
			fieldname: "timespan",
			label: __("Timespan"),
			fieldtype: "Select",
			options: [
				{ "value": "last year", "label": __("Last Year") },
				{ "value": "last 6 months", "label": __("Last 6 Months") },
				{ "value": "last quarter", "label": __("Last Quarter") },
				{ "value": "last month", "label": __("Last Month") },
				{ "value": "last week", "label": __("Last Week") },
				{ "value": "this week", "label": __("This Week") },
				{ "value": "this month", "label": __("This Month") },
				{ "value": "this quarter", "label": __("This Quarter") },
				{ "value": "this year", "label": __("This Year") },
				{ "value": "next week", "label": __("Next Week") },
				{ "value": "next month", "label": __("Next Month") },
				{ "value": "next quarter", "label": __("Next Quarter") },
				{ "value": "next 6 months", "label": __("Next 6 Months") },
				{ "value": "custom", "label": __("Custom") },
			],
			default: "this month",
			reqd: 1
		},
		
		{
			"fieldname":"from_date",
			"label": __("From Date"),
			"fieldtype": "Date",
			default: frappe.defaults.get_user_default("year_start_date"),
			"depends_on": "eval:doc.timespan == 'custom'",
			reqd: 1,
		},
		{
			"fieldname":"to_date",
			"label": __("To Date"),
			"fieldtype": "Date",
			"default": frappe.defaults.get_user_default("year_end_date"),
			"depends_on": "eval:doc.timespan == 'custom'",
			"reqd": 1
		},
		// {
		// 	"fieldname": "opportunity",
		// 	"label": __("Opportunity"),
		// 	"fieldtype": "Link",
		// 	"options": "Opportunity"
		// },
		{
			"fieldname": "group_by",
			"label": __("Group By"),
			"fieldtype": "Select",
			"options": "Opportunity\nSales Person\nCustomer\nBrand\nTerritory\nMonthly",
			"default": "Opportunity"
		},
		{
			"fieldname": "based_on",
			"label": __("Based ON"),
			"fieldtype": "Select",
			"options": "Creation\nExpected Date",
			"default": "Creation"
		},
		{
			"fieldname":"sales_stage",
			"label": __("Sales Stage"),
			"fieldtype": "MultiSelectList",
			"options": "Sales Stage",
                        get_data: function(txt) {
				return frappe.db.get_link_options('Sales Stage', txt);
			},	 

		},
		{
			"fieldname":"item_code",
			"label": __("Item Code"),
			"fieldtype": "Link",
			"options": "Item"
		},
		{
			"fieldname":"forecast",
			"label": __("Forecast"),
			"fieldtype": "Select",
			"options": "\nInclude\nExclude",
		},
		{
			"fieldname":"opportunity_type",
			"label": __("Opportunity Type"),
			"fieldtype": "Select",
			"options": "\nNew\nRenewal\nAdditional",
			// get_data: function(txt) {
			// 	return frappe.db.get_options('New\nRenewal\nAdditional', txt);
			// },
		},
		{
			"fieldname":"item_group",
			"label": __("Item Group"),
			"fieldtype": "MultiSelectList",
			"options": "Item Group",
			get_data: function(txt) {
				return frappe.db.get_link_options('Item Group', txt);
			},	
			
			
		},
		{
			"fieldname":"brand",
			"label": __("Brand"),
			"fieldtype": "MultiSelectList",
			"options": "Brand",
			get_data: function(txt) {
				return frappe.db.get_link_options('Brand', txt);
			},	
			
			
		},
	
		{
			"fieldname":"customer",
			"label": __("Customer"),
			"fieldtype": "MultiSelectList",
			"options": "Customer",
                        get_data: function(txt) {
				return frappe.db.get_link_options('Customer', txt);
			},	 

		},
		// {
		// 	"fieldname":"supplier",
		// 	"label": __("Supplier"),
		// 	"fieldtype": "MultiSelectList",
		// 	"options": "Supplier",
        //                 get_data: function(txt) {
		// 		return frappe.db.get_link_options('Supplier', txt);
		// 	},	 

		// },
		{
			"fieldname":"sales_person",
			"label": __("Sales Person"),
			"fieldtype": "MultiSelectList",
	       	"options": "Sales Person",
                        get_data: function(txt) {
							// if(frappe.user_info().fullname === "Administrator"){
							// 	pass
							// }
							// else{
							// 	txt = frappe.user_info().fullname
							// }
				return frappe.db.get_link_options('Sales Person', txt);
			},
			
		},
		{
			"fieldname":"user",
			"label": __("User"),
			"fieldtype": "Data",
			"read_only":1,
			"default": frappe.user_info().fullname,
			"reqd": 0
		}

	],
	"tree": true,
	"name_field": "parent",
	"parent_field": "parent_renewal",
	"initial_depth": 3,
	"formatter": function(value, row, column, data, default_formatter) {
		console.log("hello")
		if (column.fieldname == "opportunity" && column.options == "Item" && data && data.indent == 0) {
			column._options = "Opportunity";
		} else {
			column._options = "";
		}
		value = default_formatter(value, row, column, data);

		// if (column.fieldname == "custom_committed_date" && data && data.indent === 1) {
		// // 	let date1 = ""
		// 	let date1 = frappe.db.get_value("Opportunity", custom_committed_date, "custom_committed_date")
		// 	console.log(date1)
		// 	// if (date1 !== " "){
		// 	// 	const button_html = `<button class="btn btn-default btn-xs" onclick="frappe.query_reports['Opportunity Report'].commited_date('${value}')"> date1</button>`;
		// 	// 	value = button_html;
		// 	// }
		// 	const button_html = `<button class="btn btn-default btn-xs" onclick="frappe.query_reports['Opportunity Report'].commited_date('${value}')">committed</button>`;
		// 	value = button_html;
			
		// }

		if (column.fieldname == "name1" &&  data ){
			if(data.indent === 0) {
			const button_html = `<button class="btn btn-default btn-xs" onclick="frappe.query_reports['Opportunity Report'].add_date('${value}')">Add Commited</button>`;
			value = button_html;
			}
					
		}

		if (data && (data.indent == 0.0 || (row[1] && row[1].content == "Total"))) {
			value = $(`<span>${value}</span>`);
			var $value = $(value).css("font-weight", "bold");
			value = $value.wrap("<p></p>").parent().html();
		}

		// Apply different formatting based on row type
		if (column.fieldname === 'parent') { // Replace 'your_fieldname' with the actual fieldname you want to format
            if (data.indent === 0) {
                // Parent row: apply numerical index
                value = (row.index + 1) + ". " + value;
            } else {
                // Child row: apply alphabetic index
                const alphabetIndex = getAlphabetIndex(row.index);
                value = alphabetIndex + ". " + value;
            }
        }

		return value;
	},


	add_date(name) {
		console.log(name)
		
		frappe.prompt({
			label: 'Committed Date',
			fieldname: 'custom_committed_date',
			fieldtype: 'Date'
		}, (values) => {
			console.log(values);
			frm = frappe.db.get_doc("Opportunity",name)
			// console.log(frm)
			frappe.db.set_value("Opportunity", name, "custom_committed_date", values.custom_committed_date).then(() => {
			// refresh this report and show alert
			frappe.query_report.refresh();
			})
			// doc.timeline.insert_comment("Comment",values.comment)
			// frm.comments.insert_comment("Committed",values.comment)

			console.log("success")
		})

	
		// frappe.db.set_value("Opportunity", name, "status", "Closed").then(() => {
		//   // refresh this report and show alert
		//   frappe.query_report.refresh();
		//   frappe.show_alert("ToDo Closed Successfully!");
		// });
	  },

	  onload: function(report) {
        const storage_key = `hidden_columns_${report.report_name}`;
        const savedHiddenColumns = JSON.parse(localStorage.getItem(storage_key)) || [];
        report.hidden_columns = savedHiddenColumns;

		const listSettingsButton = report.page.add_inner_button('List Settings', function() {
			open_list_settings_dialog(report);
		});
	
		listSettingsButton.css({
			'background-color': '#007bff',
			'color': 'white',
			'border': 'none',
			'border-radius': '4px',
			'padding': '6px 12px',
			'font-size': '14px',
			'font-weight': 'bold',
			'cursor': 'pointer'
		});

		listSettingsButton.on('mouseover', function() {
			listSettingsButton.css('background-color', '#092b4c');
		});
	
		listSettingsButton.on('mouseout', function() {
			listSettingsButton.css('background-color', '#007bff');
		});

        report.page.wrapper.on("data-loaded", function() {
            update_column_visibility(report);
        });
    },

    get_datatable_options: function(options) {
        const report = frappe.query_report;
        if (!report || !report.columns) {
            return options;
        }
        const visible_columns = report.columns.filter(col => !report.hidden_columns.includes(col.fieldname));
        return Object.assign(options, {
            columns: visible_columns
        });
    }
};

function getAlphabetIndex(index) {
    let result = '';
    while (index >= 0) {
        result = String.fromCharCode((index % 26) + 65) + result;
        index = Math.floor(index / 26) - 1;
    }
    return result;
}

function open_list_settings_dialog(report) {
    let options = report.columns.map(col => ({
        label: col.label,
        value: col.fieldname,
        checked: !report.hidden_columns.includes(col.fieldname)
    }));

    frappe.prompt({
        label: 'Select Columns to Hide',
        fieldname: 'hidden_columns',
        fieldtype: 'MultiCheck',
        options: options,
    }, (values) => {
        apply_column_settings(report, values.hidden_columns);
    }, 'List Settings');
}

function apply_column_settings(report, columns_to_hide) {
    const all_fieldnames = report.columns.map(col => col.fieldname);
    report.hidden_columns = all_fieldnames.filter(fieldname => !columns_to_hide.includes(fieldname));

    const storage_key = `hidden_columns_${report.report_name}`;
    localStorage.setItem(storage_key, JSON.stringify(report.hidden_columns));

    report.refresh();
}

function update_column_visibility(report) {
    if (report && report.columns) {
        report.columns.forEach(col => {
            col.hidden = report.hidden_columns.includes(col.fieldname);
        });
    }
}




















// 	  onload: function(report) {
//         // Load hidden columns from local storage or initialize if not set
//         const savedHiddenColumns = JSON.parse(localStorage.getItem('hidden_columns')) || [];
//         report.hidden_columns = savedHiddenColumns;

//         // // Add the "List Settings" button
//         // report.page.add_inner_button('List Settings', function() {
//         //     open_list_settings_dialog(report);
//         // });

// 		// Add the "List Settings" button
// 		const listSettingsButton = report.page.add_inner_button('List Settings', function() {
// 			open_list_settings_dialog(report);
// 		});
	
// 		// Apply inline styles to the button
// 		listSettingsButton.css({
// 			'background-color': '#007bff', // Blue color, adjust as needed
// 			'color': 'white',
// 			'border': 'none',
// 			'border-radius': '4px',
// 			'padding': '6px 12px',
// 			'font-size': '14px',
// 			'font-weight': 'bold',
// 			'cursor': 'pointer'
// 		});
	
// 		listSettingsButton.on('mouseover', function() {
// 			listSettingsButton.css('background-color', '#092b4c'); // Darker blue for hover
// 		});
	
// 		listSettingsButton.on('mouseout', function() {
// 			listSettingsButton.css('background-color', '#007bff'); // Original blue
// 		});
	

//         // Hook into the report rendering to apply column visibility settings
//         report.page.wrapper.on("data-loaded", function() {
// 			console.log("update")
//             update_column_visibility(report);
//         });
//     },

//     get_datatable_options: function(options) {
//         const report = frappe.query_report;
//         if (!report || !report.columns) {
//             return options;
//         }
//         // Filter out the columns marked as hidden
//         const visible_columns = report.columns.filter(col => !report.hidden_columns.includes(col.fieldname));
//         return Object.assign(options, {
//             columns: visible_columns
//         });
//     }
// };


// // Function to get alphabetic index
// function getAlphabetIndex(index) {
//     let result = '';
//     while (index >= 0) {
//         result = String.fromCharCode((index % 26) + 65) + result;
//         index = Math.floor(index / 26) - 1;
//     }
//     return result;
// }

// function open_list_settings_dialog(report) {
//     // Create options for the dialog
//     let options = report.columns.map(col => ({
//         label: col.label,
//         value: col.fieldname,
//         checked: !report.hidden_columns.includes(col.fieldname) // Check if the column is currently visible
//     }));

//     // Create and show the settings dialog
//     let dialog = new frappe.ui.Dialog({
//         title: 'List Settings',
//         fields: [
//             {
//                 label: 'Select Columns to Hide',
//                 fieldname: 'columns_to_hide',
//                 fieldtype: 'MultiCheck',
//                 options: options
//             }
//         ],
//         primary_action_label: 'Apply',
//         primary_action(values) {
//             apply_column_settings(report, values.columns_to_hide);
// 			// console.log(apply_column_settings(report, values.columns_to_hide))
//             dialog.hide();
//         }
//     });

//     dialog.show();
// }

// function apply_column_settings(report, columns_to_hide) {
//     // Update hidden columns based on user selection
//     const all_fieldnames = report.columns.map(col => col.fieldname);
//     report.hidden_columns = all_fieldnames.filter(fieldname => !columns_to_hide.includes(fieldname));
// 	// console.log(report.hidden_columns)

//     // Save hidden columns to local storage
//     localStorage.setItem('hidden_columns', JSON.stringify(report.hidden_columns));

//     // Refresh the report to apply the new settings
//     report.refresh();
// }

// function update_column_visibility(report) {
//     // Update the columns based on the hidden_columns state
// 	console.log("updated1")
//     if (report && report.columns) {
// 		console.log("hidded update")
//         report.columns.forEach(col => {
//             col.hidden = report.hidden_columns.includes(col.fieldname);
//         });
//     }
// }