// Copyright (c) 2024, Aravind Mandala and contributors
// For license information, please see license.txt
/* eslint-disable */

frappe.query_reports["Renewals Analytics With PIM"] = {
	"filters": [
		{
			"fieldname": "company",
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
		{
			"fieldname":"customer",
			"label": __("Customer"),
			"fieldtype": "MultiSelectList",
			"options": "Customer",
                        get_data: function(txt) {
				return frappe.db.get_link_options('Customer', txt);
			},	 

		},
		{
			"fieldname":"renewal_list",
			"label": __("Renewal List"),
			"fieldtype": "MultiSelectList",
			"options": "Renewal List",
                        get_data: function(txt) {
				return frappe.db.get_link_options('Renewal List', txt);
			},	 

		},
		{
			"fieldname": "status",
			"label": __("Status"),
			"fieldtype": "Select",
			"options": "\nActive\nAwaiting Response\nCancelled\nCofed\nDraft\nDuplicate\nLost\nNew Opp\nOut Of Business\nProduct Changed\nRenewed\nUpgraded\nVoid\nX-Renewal\nX-Opp",
		},
		{
			"fieldname": "based_on",
			"label": __("Based ON"),
			"fieldtype": "Select",
			"options": "Creation\nEnd Date",
			"default": "End Date"
		},
		{
			"fieldname": "renewal_type",
			"label": __("Renewal Type"),
			"fieldtype": "Select",
			"options": "\nNew\nRenewal",
			"default": "End Date"
		},
		{
			"fieldname": "group_by",
			"label": __("Group By"),
			"fieldtype": "Select",
			"options": "Renewals",
			"default": "Renewals"
		},
		{
			"fieldname": "item_group",
			"label": __("Item Group"),
			"fieldtype": "Link",
			"options": "Item Group"
		},
		{
			"fieldname": "sales_person",
			"label": __("Sales Person"),
			"fieldtype": "Link",
			"options": "Sales Person"
		},
		

	],
	"tree": true,
	"name_field": "parent",
	"parent_field": "parent_renewal",
	"initial_depth": 3,
	"formatter": function(value, row, column, data, default_formatter) {
		if (column.fieldname == "renewal_list" && column.options == "Renewal Item" && data && data.indent == 0) {
			column._options = "Renewal List";
		} else {
			column._options = "";
		}
		if (column.fieldname === "view_button" &&  data && data.indent === 1) {
			// console.log(value)			
			const button_view = `<button class="btn btn-default btn-xs" onclick="frappe.query_reports['Renewals Analytics With PIM'].view_data('${value}')">View</button>`;
			value = button_view;
		}
		value = default_formatter(value, row, column, data);

		if (data && (data.indent == 0.0 || (row[1] && row[1].content == "Total"))) {
			value = $(`<span>${value}</span>`);
			var $value = $(value).css("font-weight", "bold");
			value = $value.wrap("<p></p>").parent().html();
		}

		return value;
	},
	view_data(name){
		// console.log(name)
		frappe.db.get_value("Renewal List", name,["note","start_date"])
		.then(r => {
			let values = r.message;
			// console.log(values.note)
			if (values.note){
				frappe.msgprint({
					title: __('Note'),
					indicator: 'blue',
					message: values.note
				});

			}
			else{
				frappe.msgprint("No Data Available")
			}
			
		})
		// console.log("data")
		// frappe.msgprint(data)
		
	},
	onload: function(report) {
        const storage_key = `hidden_columns_${report.report_name}`;
        const savedHiddenColumns = JSON.parse(localStorage.getItem(storage_key)) || [];
        report.hidden_columns = savedHiddenColumns;

		const userFilters = getUserFilters(report);
        apply_filters(report, userFilters);

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

function getUserFilters(report) {
    const userFilters = JSON.parse(localStorage.getItem('user_filters')) || {};
    return userFilters[frappe.session.user] && userFilters[frappe.session.user][report.report_name] || {};
}

function saveUserFilters(report, filters) {
    let userFilters = JSON.parse(localStorage.getItem('user_filters')) || {};
    if (!userFilters[frappe.session.user]) {
        userFilters[frappe.session.user] = {};
    }
    userFilters[frappe.session.user][report.report_name] = filters;
    localStorage.setItem('user_filters', JSON.stringify(userFilters));
}


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
function open_list_settings_dialog(report) {
	console.log("open-list-settings")
    const userFilters = getUserFilters(report);

    let columnOptions = report.columns.map(col => ({
        label: col.label,
        value: col.fieldname,
        checked: !report.hidden_columns.includes(col.fieldname)
    }));

    let filterOptions = report.filters.map(filter => ({
        fieldname: filter.fieldname,
        label: filter.label,
        fieldtype: filter.fieldtype,
        value: userFilters[filter.fieldname] || ''
    }));

    frappe.prompt([
        {
            label: 'Select Columns to Hide',
            fieldname: 'hidden_columns',
            fieldtype: 'MultiCheck',
            options: columnOptions,
        },
        {
            label: 'Filters',
            fieldname: 'filters',
            fieldtype: 'Table',
            fields: filterOptions.map(f => ({
                label: f.label,
                fieldname: f.fieldname,
                fieldtype: f.fieldtype,
                default: f.value
            })),
            data: filterOptions.map(f => ({ [f.fieldname]: f.value }))
        }
    ], 
    (values) => {
        apply_column_settings(report, values.hidden_columns);
        apply_filters(report, values.filters);
    }, 
    'List Settings');
}

function apply_filters(report, filters) {
	console.log("apply_filters")
    let filterSettings = {};
    filters.forEach(filter => {
        if (filter.fieldname && filter.value) {
            filterSettings[filter.fieldname] = filter.value;
        }
    });

    // Save user filters
    saveUserFilters(report, filterSettings);

    // Apply filters to the report
    frappe.query_report.filters.forEach(f => {
        let filter = filterSettings[f.fieldname];
        if (filter !== undefined) {
            f.set_value(filter);
        }
    });
}



function apply_column_settings(report, columns_to_hide) {
	console.log("applu_col_setting")
    const all_fieldnames = report.columns.map(col => col.fieldname);
    report.hidden_columns = all_fieldnames.filter(fieldname => !columns_to_hide.includes(fieldname));

    const storage_key = `hidden_columns_${report.report_name}`;
    localStorage.setItem(storage_key, JSON.stringify(report.hidden_columns));

    // report.refresh();
	
    if (report.datatable) {
        report.datatable.destroy(); // Destroy the current datatable instance
        report.datatable = null; // Clear the datatable reference
    }
    
    frappe.query_report.refresh(); // Trigger a full report refresh

	// window.location.reload();
}

function update_column_visibility(report) {
	console.log("update triggered")
    if (report && report.columns) {
        report.columns.forEach(col => {
            col.hidden = report.hidden_columns.includes(col.fieldname);
        });
    }
	// report.refresh();
}










































// 	onload: function(report) {
//         const reportName = "Renewals Analytics With PIM";

//         // Load hidden columns from local storage or initialize if not set
//         const savedHiddenColumns = JSON.parse(localStorage.getItem(`${reportName}_hidden_columns`)) || [];
//         report.hidden_columns = savedHiddenColumns;

//         // Add the "List Settings" button
//         const listSettingsButton = report.page.add_inner_button('List Settings', function() {
//             open_list_settings_dialog(report, reportName);
//         });

//         // Apply inline styles to the button
//         listSettingsButton.css({
//             'background-color': '#007bff',
//             'color': 'white',
//             'border': 'none',
//             'border-radius': '4px',
//             'padding': '6px 12px',
//             'font-size': '14px',
//             'font-weight': 'bold',
//             'cursor': 'pointer'
//         });

//         listSettingsButton.on('mouseover', function() {
//             listSettingsButton.css('background-color', '#092b4c');
//         });

//         listSettingsButton.on('mouseout', function() {
//             listSettingsButton.css('background-color', '#007bff');
//         });

//         // Hook into the report rendering to apply column visibility settings
//         report.page.wrapper.on("data-loaded", function() {
//             update_column_visibility(report);
//         });

//         // Ensure column visibility is updated when the filters are applied
//         report.page.wrapper.on("filter-applied", function() {
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

// function open_list_settings_dialog(report, reportName) {
//     // Retrieve saved hidden columns from localStorage
//     const savedHiddenColumns = JSON.parse(localStorage.getItem(`${reportName}_hidden_columns`)) || [];

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
//             apply_column_settings(report, values.columns_to_hide, reportName);
//             dialog.hide();
//         }
//     });

//     dialog.show();
// }

// function apply_column_settings(report, columns_to_hide, reportName) {
//     // Update hidden columns based on user selection
//     const all_fieldnames = report.columns.map(col => col.fieldname);
//     report.hidden_columns = all_fieldnames.filter(fieldname => !columns_to_hide.includes(fieldname));

//     // Save hidden columns to local storage
//     localStorage.setItem(`${reportName}_hidden_columns`, JSON.stringify(report.hidden_columns));

//     // Refresh the report to apply the new settings
//     report.refresh();
// }

// function update_column_visibility(report) {
//     // Update the columns based on the hidden_columns state
//     if (report && report.columns) {
//         report.columns.forEach(col => {
//             col.hidden = report.hidden_columns.includes(col.fieldname);
//         });

//         // Update DataTable columns visibility
//         refresh_datatable_columns(report);
//     }
// }

// function refresh_datatable_columns(report) {
//     // Ensure DataTable instance is refreshed
//     report.page.wrapper.find('.dataTable').each(function() {
//         const table = $(this);
//         const dataTableInstance = table.DataTable();

//         if (dataTableInstance) {
//             // Update columns visibility
//             dataTableInstance.columns().every(function() {
//                 const column = this;
//                 const columnName = dataTableInstance.settings().aoColumns[column.index()].name;
//                 const isVisible = !report.hidden_columns.includes(columnName);

//                 column.visible(isVisible);
//             });

//             // Adjust columns and redraw the DataTable
//             dataTableInstance.columns.adjust().draw();
//         }
//     });
// }