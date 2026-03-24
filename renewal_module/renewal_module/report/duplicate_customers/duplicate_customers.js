// Copyright (c) 2025, Aravind Mandala and contributors
// For license information, please see license.txt

/*frappe.query_reports["Duplicate Customers"] = {
	"filters": [

	]
};*/

frappe.query_reports["Duplicate Customers"] = {
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
		{
			"fieldname": "party_name",
			"label": __("Party"),
			"fieldtype": "MultiSelectList",
			"options": "Customer",
			get_data: function (txt) {
				return frappe.db.get_link_options('Customer', txt);
			},
		},
	],

	formatter: function (value, row, column, data, default_formatter) {
		value = default_formatter(value, row, column, data);
		if (column.fieldname === "select_row") {
			const rowKey = frappe.utils.escape_html(data.duplicate_customer || "");  // Use duplicate_customer as unique key
			const checked = data.select_row ? 'checked' : '';
			return `<input type="checkbox" class="report-checkbox" data-rowkey="${rowKey}" ${checked}>`;
		}
		return value;
	},

	onload: function (report) {
		let mergeBtn;

		function setCheckboxes(checked = true) {
			const dt = report.datatable;
			if (!dt || !dt.wrapper) return;

			if (dt.datamanager?.data) {
				dt.datamanager.data.forEach(row => {
					row.select_row = checked ? 1 : 0;
				});
			}
			dt.refresh();
			updateButtonVisibility();
		}

		function updateButtonVisibility() {
			const anyChecked = !!document.querySelector('.report-checkbox:checked');
			if (mergeBtn) mergeBtn.toggle(anyChecked);
		}

		report.page.add_inner_button(__('Select All'), () => setCheckboxes(true));
		report.page.add_inner_button(__('Clear Selection'), () => setCheckboxes(false));

		mergeBtn = report.page.add_inner_button("Merge Selected", function () {
			let merges = [];

			const dt = report.datatable;
			if (dt?.datamanager?.data) {
				dt.datamanager.data.forEach(row => {
					if (row.select_row && row.main_customer && row.duplicate_customer) {
						let dupList = [];

						if (Array.isArray(row.duplicate_customer)) {
							dupList = row.duplicate_customer;
						} else {
							dupList = row.duplicate_customer
								.split(/<br\s*\/?>|\n|,/)
								.map(d => d.trim())
								.filter(Boolean);
						}

						if (dupList.length) {
							merges.push({
								main: row.main_customer,
								duplicates: dupList
							});
						}
					}
				});
			}

			if (!merges.length) {
				frappe.msgprint("Please select at least one row with duplicates to merge.");
				return;
			}

			frappe.confirm("Are you sure you want to merge the selected duplicate customers?", () => {
				function processMerge(index) {
					if (index >= merges.length) {
						frappe.msgprint("All selected customers have been processed.");
						report.refresh();
						return;
					}

					const m = merges[index];
					frappe.call({
						method: 'renewal_module.api.merge_customers',
						args: {
							main_customer: m.main,
							duplicate_customers: m.duplicates
						},
						callback: function (r) {
							if (!r.message || r.message.status !== "ok") {
								frappe.msgprint({
									title: "Merge Failed",
									message: `Merge failed for ${m.main}<br>${r.message?.message || "Unknown error"}`,
									indicator: "red"
								});
							} else {
								if (r.message.skipped?.length) {
									frappe.msgprint({
										title: "Partially Merged",
										message: `Merged ${m.duplicates.length - r.message.skipped.length} of ${m.duplicates.length} into ${m.main}.<br>Skipped: ${r.message.skipped.join(", ")}`,
										indicator: "orange"
									});
								} else {
									frappe.msgprint({
										title: "Merge Successful",
										message: `All customers successfully merged into <strong>${m.main}</strong>`,
										indicator: "green"
									});
								}
							}
						}

					});
				}
				processMerge(0);
			});
		});

		mergeBtn.hide();

		// When checkboxes change
		$(document).on('change', '.report-checkbox', function () {
			const rowKey = $(this).attr("data-rowkey");
			const isChecked = $(this).is(":checked");

			const dt = report.datatable;
			if (dt?.datamanager?.data) {
				const row = dt.datamanager.data.find(r => {
					if (!r.duplicate_customer) return false;

					let dupList = [];
					if (Array.isArray(r.duplicate_customer)) {
						dupList = r.duplicate_customer;
					} else {
						dupList = r.duplicate_customer
							.split(/<br\s*\/?>|\n|,/)
							.map(d => d.trim())
							.filter(Boolean);
					}

					return dupList.includes(rowKey);
				});

				if (row) {
					row.select_row = isChecked ? 1 : 0;
				}
			}
			updateButtonVisibility();
		});
	}
};