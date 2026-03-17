// Copyright (c) 2025, Aravind Mandala and contributors
// For license information, please see license.txt
let headerState = false;  // remember checked state
// debugging helpers
function log(...args) {
    console.log("[SelectDebug]", ...args);
}

let headerChecked = false;








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
		// Add the header placeholder if it does not exist
        console.log("[SelectDebug] Report onload triggered");
		console.log("report",report)

        // Locate the filter container
        let filter_area = getFilterArea(report);

        if (!filter_area) {
            console.error("[SelectDebug] Filter area not found. Checking again in 300ms...");
            setTimeout(() => {
                filter_area = getFilterArea(report);
                if (!filter_area) {
                    console.error("[SelectDebug] STILL no filter area. Stopping.");
                } else {
                    console.log("[SelectDebug] Filter area found on retry!");
                    injectSelectAll(report, filter_area);
                }
            }, 300);
            return;
        }

        injectSelectAll(report, filter_area);



		let mergeBtn;

		// function setCheckboxes(checked = true) {
		// 	const dt = report.datatable;
		// 	if (!dt || !dt.wrapper) return;

		// 	if (dt.datamanager?.data) {
		// 		dt.datamanager.data.forEach(row => {
		// 			row.select_row = checked ? 1 : 0;
		// 		});
		// 	}
		// 	dt.refresh();
		// 	updateButtonVisibility();
		// }

		function updateButtonVisibility() {
			const anyChecked = !!document.querySelector('.report-checkbox:checked');
			if (mergeBtn) mergeBtn.toggle(anyChecked);
		}

		report.page.add_inner_button(__('Select All'), () => setCheckboxes(true));
		report.page.add_inner_button(__('Clear Selection'), () => setCheckboxes(false));

// Wait for datatable to load
    //  try {
    //         log("Report onload triggered");
    //         // store in global for debugging convenience (optional)
    //         window.report = report;

    //         // initial insert
    //         setTimeout(() => {
    //             injectHeaderCheckbox(report);
    //         }, 300);

    //         // hook into datatable render if available
    //         setTimeout(() => {
    //             if (report.datatable && report.datatable.on) {
    //                 try {
    //                     report.datatable.on("onRender", () => {
    //                         log("datatable onRender fired");
    //                         injectHeaderCheckbox(report);
    //                     });
    //                     log("Attached onRender hook");
    //                 } catch (e) {
    //                     console.error("[SelectDebug] failed to attach onRender hook:", e);
    //                 }
    //             } else {
    //                 log("datatable.on not available yet");
    //             }
    //         }, 500);
    //     } catch (e) {
    //         console.error("[SelectDebug] onload error:", e);
    //     }

// Inject header checkbox (safe-insert)
function injectHeaderCheckbox(report) {
    console.log("[SelectDebug] injectHeaderCheckbox called.");

    const placeholder = document.getElementById("header-select-placeholder");
    console.log("[SelectDebug] placeholder found?", !!placeholder);

    if (!placeholder) return;

    // Avoid duplication
    if (document.getElementById("header-select-checkbox")) {
        return;
    }

    // Insert checkbox
    placeholder.innerHTML = `
        <input type="checkbox" id="header-select-checkbox" style="margin-right:4px;">
        <label>Select</label>
    `;

    const master = document.getElementById("header-select-checkbox");
    console.log("[SelectDebug] master element created, checked =", master.checked);

    // Attach event listener PROPERLY
    master.addEventListener("change", function () {
        console.log("[SelectDebug] Master checkbox clicked! Checked =", this.checked);
        setCheckboxes(this.checked);
    });
}


// setCheckboxes with verbose logs





// function bindHeaderCheckbox(report) {
//     setTimeout(() => {
//         const headerCheckbox = document.getElementById("select-header-checkbox");
//         if (headerCheckbox) {
//             headerCheckbox.addEventListener("change", function () {
//                 setCheckboxes(this.checked);
//             });
//         }
//     }, 100);
// }

// bindHeaderCheckbox(report);

// let headerChecked = false;



// function restoreHeaderCheckbox(report) {
//     setTimeout(() => {
//         const cb = document.getElementById("select-header-checkbox");
//         if (cb) {
//             cb.checked = headerSelectState;   // <-- restore checked state
//             cb.addEventListener("change", function () {
//                 setCheckboxes(this.checked);
//             });
//         }
//     }, 80); // wait for datatable to re-render
// }
// restoreHeaderCheckbox(report);

	


		 // Wait for datatable to render
        setTimeout(() => {
            const headerCheckbox = document.getElementById("select-header-checkbox");
            if (headerCheckbox) {
                headerCheckbox.addEventListener("change", function() {
                    setCheckboxes(this.checked); // call your function
                });
            }
        }, 600); // wait for datatable render

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
	},
	
};

// ------------------------------
// ✅ FUNCTION: Select/Unselect all
// ------------------------------
function getFilterArea(report) {
    const wrapper = report.page.wrapper;

    return (
        wrapper.find('.report-filters').get(0) ||
        wrapper.find('.query-report-filters').get(0) ||
        wrapper.find('.frappe-control[data-fieldname]').get(0) ||
        wrapper.find('.form-inline').get(0) ||
        null
    );
}

function injectSelectAll(report, filter_area) {
    console.log("[SelectDebug] Injecting select-all checkbox");

    let chk = document.createElement("input");
    chk.type = "checkbox";
    chk.id = "select_all_rows";
    chk.style.marginLeft = "10px";

    let lbl = document.createElement("label");
    lbl.innerText = " Select All";
    lbl.style.marginLeft = "5px";
    lbl.htmlFor = "select_all_rows";

    filter_area.appendChild(chk);
    filter_area.appendChild(lbl);

    chk.addEventListener("change", async function () {
        console.log("[SelectDebug] Header checkbox clicked:", chk.checked);
        await setCheckboxes(chk.checked);
    });
}

async function setCheckboxes(status) {
    console.log("[SelectDebug] setCheckboxes:", status);

    let attempts = 0;
    let dt = null;

    while (attempts < 10) {
        dt = frappe.query_report.datatable;
        if (dt && dt.data) break;

        console.log("[SelectDebug] Waiting for DataTable...", attempts);
        await new Promise(r => setTimeout(r, 200));
        attempts++;
    }

    if (!dt || !dt.data) {
        console.error("[SelectDebug] DataTable not ready.");
        return;
    }

    dt.data.forEach((row, idx) => {
        let cell = dt.rowmanager.getCell(idx, 0);
        if (!cell) return;

        let cb = cell.getElementsByTagName("input")[0];
        if (cb) cb.checked = status;
    });

    console.log("[SelectDebug] Rows updated");
}
