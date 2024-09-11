// Copyright (c) 2024, Aravind Mandala and contributors
// For license information, please see license.txt
/* eslint-disable */

frappe.query_reports["Renewals Based On Timespam"] = {
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
			default: "this year",
			reqd: 1
		},
		{
			"fieldname":"from_date",
			"label": __("From Date"),
			"fieldtype": "Date",
			"default": frappe.datetime.add_days(frappe.datetime.get_today(), -7),
			"depends_on": "eval:doc.timespan == 'custom'",
			"reqd": 1
		},
		{
			"fieldname":"to_date",
			"label": __("To Date"),
			"fieldtype": "Date",
			"default": frappe.datetime.get_today(),
			"depends_on": "eval:doc.timespan == 'custom'",
			"reqd": 1
		},
		
		{
			"fieldname":"item_code",
			"label": __("Item Code"),
			"fieldtype": "Link",
			"options": "Item"
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
			"fieldname":"renewal_id",
			"label": __("Renewal ID"),
			"fieldtype": "Link",
			"options": "Renewal List"
		},
		
		{
			"fieldname":"customer_name",
			"label": __("Party"),
			"fieldtype": "MultiSelectList",
			"options": "Customer",
                        get_data: function(txt) {
				return frappe.db.get_link_options('Customer', txt);
			},	 

		},
		{
			"fieldname":"sales_person",
			"label": __("Sales Person"),
			"fieldtype": "MultiSelectList",
	       	"options": "Sales Person",
                        get_data: function(txt) {
				return frappe.db.get_link_options('Sales Person', txt);
			},
		},
		{
			"fieldname":"opportunity_type",
			"label": __("Opportunity Type"),
			"fieldtype": "MultiSelectList",
			get_data: function() {
				return [
					{ "value": "New", "description": "Opportunity Type" },
					{ "value": "Renewal", "description": "Opportunity Type" },
					{ "value": "Additional", "description": "Opportunity Type" }
					
				]
			}
		},
		{	"fieldname":"sales_stage",
			"label": __("Sales Stage"),
			"fieldtype": "MultiSelectList",
			"options": "Sales Stage",
			get_data: function(txt) {
				return frappe.db.get_link_options('Sales Stage', txt);
			},
			
		},

	],
	"formatter": function(value, row, column, data, default_formatter) {
		console.log("hello")
		
		value = default_formatter(value, row, column, data);
		// console.log(value)
		return value;
	},


	onload: function(report) {
        const user_id = frappe.session.user;
        const storage_key = `hidden_columns_${report.report_name}_${user_id}`;
        
        // Fetch hidden columns from UserReportSettings
        frappe.call({
            method: 'frappe.client.get_value',
            args: {
                doctype: 'UserReportSettings',
                filters: {
                    user: user_id,
                    key: storage_key,
                },
                fieldname: 'hidden_columns'
            },
            callback: function(response) {
                const savedHiddenColumns = response.message && response.message.hidden_columns ? JSON.parse(response.message.hidden_columns) : [];
                report.hidden_columns = savedHiddenColumns;
                update_column_visibility(report); // Apply the hidden columns immediately
            }
        });

        const listSettingsButton = report.page.add_inner_button('List Settings', function() {
            open_list_settings_dialog(report);
        });

        style_button(listSettingsButton);

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
}

function style_button(button) {
    button.css({
        'background-color': '#007bff',
        'color': 'white',
        'border': 'none',
        'border-radius': '4px',
        'padding': '6px 12px',
        'font-size': '14px',
        'font-weight': 'bold',
        'cursor': 'pointer'
    });

    button.on('mouseover', function() {
        button.css('background-color', '#092b4c');
    });

    button.on('mouseout', function() {
        button.css('background-color', '#007bff');
    });
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

    const user_id = frappe.session.user;
    const storage_key = `hidden_columns_${report.report_name}_${user_id}`;
    const docname = `${user_id}-${storage_key}`;

    // Check if the record exists
    frappe.db.exists('UserReportSettings', docname).then(exists => {
        if (exists) {
            // Update the existing record
            frappe.call({
                method: 'frappe.client.set_value',
                args: {
                    doctype: 'UserReportSettings',
                    name: docname,
                    fieldname: 'hidden_columns',
                    value: JSON.stringify(report.hidden_columns)
                }
            });
        } else {
            // Create a new record
            frappe.call({
                method: 'frappe.client.insert',
                args: {
                    doc: {
                        doctype: 'UserReportSettings',
                        name: docname,
                        user: user_id,
                        key: storage_key,
                        hidden_columns: JSON.stringify(report.hidden_columns)
                    }
                },
                callback: function(response) {
                    if (response.message) {
                        console.log("New settings document created:", response.message.name);
                    } else {
                        console.error("Failed to create new settings document");
                    }
                }
            });
        }
    });

    // Update visibility without destroying the datatable
    update_column_visibility(report);
}

function update_column_visibility(report) {
    if (report && report.columns) {
        report.columns.forEach(col => {
            col.hidden = report.hidden_columns.includes(col.fieldname);
        });

        // Refresh datatable columns instead of full destroy
        if (report.datatable) {
            report.datatable.refresh();
        } else {
            frappe.query_report.refresh();
        }
    }
}
	
	



	//user wise filters
// 	onload: function(report) {
// 		const user_id = frappe.session.user;
// 		const storage_key = `hidden_columns_${report.report_name}_${user_id}`;
// 		const savedHiddenColumns = JSON.parse(localStorage.getItem(storage_key)) || [];
// 		report.hidden_columns = savedHiddenColumns;
	
// 		const listSettingsButton = report.page.add_inner_button('List Settings', function() {
// 			open_list_settings_dialog(report);
// 		});
	
// 		listSettingsButton.css({
// 			'background-color': '#007bff',
// 			'color': 'white',
// 			'border': 'none',
// 			'border-radius': '4px',
// 			'padding': '6px 12px',
// 			'font-size': '14px',
// 			'font-weight': 'bold',
// 			'cursor': 'pointer'
// 		});
	
// 		listSettingsButton.on('mouseover', function() {
// 			listSettingsButton.css('background-color', '#092b4c');
// 		});
	
// 		listSettingsButton.on('mouseout', function() {
// 			listSettingsButton.css('background-color', '#007bff');
// 		});
	
// 		report.page.wrapper.on("data-loaded", function() {
// 			update_column_visibility(report);
// 		});
// 	},
	
// 	get_datatable_options: function(options) {
// 		const report = frappe.query_report;
// 		if (!report || !report.columns) {
// 			return options;
// 		}
// 		const visible_columns = report.columns.filter(col => !report.hidden_columns.includes(col.fieldname));
// 		return Object.assign(options, {
// 			columns: visible_columns
// 		});
// 	}
// }	
	
// 	function open_list_settings_dialog(report) {
// 		let options = report.columns.map(col => ({
// 			label: col.label,
// 			value: col.fieldname,
// 			checked: !report.hidden_columns.includes(col.fieldname)
// 		}));
	
// 		frappe.prompt({
// 			label: 'Select Columns to Hide',
// 			fieldname: 'hidden_columns',
// 			fieldtype: 'MultiCheck',
// 			options: options,
// 		}, (values) => {
// 			apply_column_settings(report, values.hidden_columns);
// 		}, 'List Settings');
// 	}
	
// 	function apply_column_settings(report, columns_to_hide) {
// 		const all_fieldnames = report.columns.map(col => col.fieldname);
// 		report.hidden_columns = all_fieldnames.filter(fieldname => !columns_to_hide.includes(fieldname));
	
// 		const user_id = frappe.session.user;
// 		console.log("Applying settings for User ID:", user_id); // Debugging: Log the user ID
//         const storage_key = `hidden_columns_${report.report_name}_${user_id}`;
// 		localStorage.setItem(storage_key, JSON.stringify(report.hidden_columns));
	
		// if (report.datatable) {
		// 	report.datatable.destroy(); // Destroy the current datatable instance
		// 	report.datatable = null; // Clear the datatable reference
		// }
	
// 		frappe.query_report.refresh(); // Trigger a full report refresh
// 	}
	
// 	function update_column_visibility(report) {
// 		if (report && report.columns) {
// 			report.columns.forEach(col => {
// 				col.hidden = report.hidden_columns.includes(col.fieldname);
// 			});
// 		}
// 	}
	//ending user wise filters










// 	onload: function(report) {
//         const storage_key = `hidden_columns_${report.report_name}`;
//         const savedHiddenColumns = JSON.parse(localStorage.getItem(storage_key)) || [];
//         report.hidden_columns = savedHiddenColumns;

// 		const listSettingsButton = report.page.add_inner_button('List Settings', function() {
// 			open_list_settings_dialog(report);
// 			// frappe.query_report.refresh();
// 		});
	
// 		listSettingsButton.css({
// 			'background-color': '#007bff',
// 			'color': 'white',
// 			'border': 'none',
// 			'border-radius': '4px',
// 			'padding': '6px 12px',
// 			'font-size': '14px',
// 			'font-weight': 'bold',
// 			'cursor': 'pointer'
// 		});

// 		listSettingsButton.on('mouseover', function() {
// 			listSettingsButton.css('background-color', '#092b4c');
// 		});
	
// 		listSettingsButton.on('mouseout', function() {
// 			listSettingsButton.css('background-color', '#007bff');
// 		});

//         report.page.wrapper.on("data-loaded", function() {
//             update_column_visibility(report);
//         });
//     },

//     get_datatable_options: function(options) {
//         const report = frappe.query_report;
//         if (!report || !report.columns) {
//             return options;
//         }
//         const visible_columns = report.columns.filter(col => !report.hidden_columns.includes(col.fieldname));
//         return Object.assign(options, {
//             columns: visible_columns
//         });
//     }
// };

// function getAlphabetIndex(index) {
//     let result = '';
//     while (index >= 0) {
//         result = String.fromCharCode((index % 26) + 65) + result;
//         index = Math.floor(index / 26) - 1;
//     }
//     return result;
// }

// function open_list_settings_dialog(report) {
//     let options = report.columns.map(col => ({
//         label: col.label,
//         value: col.fieldname,
//         checked: !report.hidden_columns.includes(col.fieldname)
//     }));

//     frappe.prompt({
//         label: 'Select Columns to Hide',
//         fieldname: 'hidden_columns',
//         fieldtype: 'MultiCheck',
//         options: options,
//     }, (values) => {
//         apply_column_settings(report, values.hidden_columns);
//     }, 'List Settings');
// }

// function apply_column_settings(report, columns_to_hide) {
//     const all_fieldnames = report.columns.map(col => col.fieldname);
//     report.hidden_columns = all_fieldnames.filter(fieldname => !columns_to_hide.includes(fieldname));

//     const storage_key = `hidden_columns_${report.report_name}`;
//     localStorage.setItem(storage_key, JSON.stringify(report.hidden_columns));

//     // report.refresh();
	
//     if (report.datatable) {
//         report.datatable.destroy(); // Destroy the current datatable instance
//         report.datatable = null; // Clear the datatable reference
//     }
    
//     frappe.query_report.refresh(); // Trigger a full report refresh

// 	// window.location.reload();
// }

// function update_column_visibility(report) {
// 	console.log("update triggered")
//     if (report && report.columns) {
//         report.columns.forEach(col => {
//             col.hidden = report.hidden_columns.includes(col.fieldname);
//         });
//     }
// 	// report.refresh();
// }







