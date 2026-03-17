// frappe.pages['non-billing-customer'].on_page_load = function(wrapper) {
// 	var page = frappe.ui.make_app_page({
// 		parent: wrapper,
// 		title: 'None',
// 		single_column: true
// 	});
// }

frappe.pages['non-billing-customer'].on_page_load = function (wrapper) {
	new nonbillingcustomerpage(wrapper);
};

frappe.pages['non-billing-customer'].on_page_show = function (wrapper) {
	//console.log("🔄 Tickets page showing", wrapper);
	console.log("🔄 non billing customer page showing");
	const pageWrapper = wrapper || $(".page")[0] || document.body;
	const ensureSupportLayoutLoaded = (cb) => {
		if (typeof loadSupportLayout === "function") return cb();
		frappe.require(["/assets/renewal_module/js/issue_themes/support_layout2.js"], () => {
			setTimeout(cb, 10);
		});
		frappe.require([
			"/assets/renewal_module/css/issue_themes/support_theme2.css",
		]);
	};
	ensureSupportLayoutLoaded(() => {
		loadSupportLayout(pageWrapper, () => {
			if (!frappe.non_billing_customer_page || frappe.non_billing_customer_page.wrapper !== pageWrapper) {
				frappe.non_billing_customer_page = new nonbillingcustomerpage(pageWrapper);
			}
			frappe.non_billing_customer_page.render();
		});
	});
};

class nonbillingcustomerpage {
	constructor(wrapper) {
		this.wrapper = wrapper;
		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: 'Non Billing Customers',
			single_column: true
		});
		this.page_length = 20;
		this.LOAD_MORE_SIZE = 50;
		this.visible_count = 0;
		this.all_tickets = [];
		this.selected_tickets = new Set();
		this.selected_report_rows = new Set();
		this.last_filter_hash = "";
		this.reloadWithFilters = frappe.utils.debounce(() => this.loadReportPage(1, { filtersChanged: true }), 300);
		//this.render();
	}

	getSavedPageSize() {
		const savedPageSize = localStorage.getItem('report_page_size');
		const size = savedPageSize ? parseInt(savedPageSize, 10) : 20;
		return Number.isFinite(size) && size > 0 ? size : 20;
	}

	getRowKey(row) {
		return row?.customer || row?.name || '';
	}

	getCurrentFilters() {
		const filters = {};
		if (!this.filter_controls) return filters;

		Object.keys(this.filter_controls).forEach(fieldname => {
			const control = this.filter_controls[fieldname];
			if (!control) return;

			let val = typeof control.get_value === "function" ? control.get_value() : control.value;

			if (control.df?.fieldtype === "MultiSelectList") {
				if (Array.isArray(val)) {
					val = val.map(item => (item && item.value) || item).filter(Boolean);
				} else if (typeof val === "string") {
					val = val.split(",").map(v => v.trim()).filter(Boolean);
				}
			} else if (Array.isArray(val)) {
				val = val.filter(Boolean);
			}

			if (val === undefined || val === null || val === "" || (Array.isArray(val) && val.length === 0)) {
				return;
			}

			filters[fieldname] = val;
		});

		return filters;
	}

	restoreFiltersFromUrl() {
		if (!this.filter_controls) return;
		const params = new URLSearchParams(window.location.search);

		Object.keys(this.filter_controls).forEach(fieldname => {
			const control = this.filter_controls[fieldname];
			if (!control) return;

			// If URL has this parameter, use it
			if (params.has(fieldname)) {
				const raw = params.get(fieldname);
				let value = raw;
				if (control.df?.fieldtype === "MultiSelectList") {
					value = raw.split(",").map(v => v.trim()).filter(Boolean);
				}

				if (typeof control.set_value === "function") {
					control.set_value(value);
				} else {
					control.value = value;
				}
			}
			// Otherwise, apply default if specified and field is empty
			else if (control.df?.default && !control.get_value()) {
				if (typeof control.set_value === "function") {
					control.set_value(control.df.default);
				} else {
					control.value = control.df.default;
				}
			}
		});
	}

	updateUrlWithFilters(filters) {
		const url = new URL(window.location.href);
		const params = url.searchParams;

		if (this.filter_controls) {
			Object.keys(this.filter_controls).forEach(key => params.delete(key));
		}

		Object.keys(filters || {}).forEach(key => {
			const val = filters[key];
			if (val === undefined || val === null || val === "" || (Array.isArray(val) && val.length === 0)) {
				return;
			}
			if (Array.isArray(val)) {
				params.set(key, val.join(","));
			} else {
				params.set(key, val);
			}
		});

		const queryString = params.toString();
		const nextUrl = queryString ? `${url.pathname}?${queryString}` : url.pathname;
		window.history.replaceState({}, "", nextUrl);
	}

	onFilterChange() {
		this.reloadWithFilters();
	}

	updateActionVisibility() {
		const wrapper = this.page?.wrapper?.[0] || this.page?.wrapper || document;
		const actions = wrapper.querySelector("#actions-dropdown");
		if (!actions) return;
		actions.style.display = this.selected_report_rows && this.selected_report_rows.size > 0 ? "block" : "none";
	}

	pruneSelectionWithData(data) {
		if (!this.selected_report_rows || !Array.isArray(data)) return;
		const available = new Set(data.map(row => this.getRowKey(row)).filter(Boolean));
		this.selected_report_rows = new Set(Array.from(this.selected_report_rows).filter(key => available.has(key)));
	}
	render() {

		const waitForContent = () => {
			const $content = $("#support-page-content");
			if (!$content.length) {
				// wait until layout injects DOM
				setTimeout(waitForContent, 50);
				return;
			}
			$content.empty().append(frappe.non_billing_customer_page_template.body);
			this.setActiveSidebar();
			this.bindActionDropdown();
			this.renderFilters();
			this.restoreFiltersFromUrl();
			this.report_table_render();
			this.bindPaginationEvents();
			this.updateActionVisibility();
			this.bindevents();
		};

		waitForContent();
	}

	setActiveSidebar() {
		const route = frappe.get_route();
		const baseRoute = route[0]; // "tickets"
		// Reset states
		$(".side-nav-link").removeClass("active-menu");
		$(".side-nav-item").removeClass("active-menu-item");
		//$(".side-nav-item.has-submenu").removeClass("open");
		$(".menu-parent").removeClass("active");

		// Use data-page for reliable matching
		$(".side-nav-link[data-page]").each(function () {
			const linkPage = $(this).data("page");
			if (!linkPage) return;

			if (linkPage === baseRoute) {
				$(this).addClass("active-menu");
				const $item = $(this).closest(".side-nav-item");
				$item.addClass("active-menu-item");
				const $parent = $(this).closest(".menu-parent");
				if ($parent.length) {
					$parent.addClass("active");
					//$parent.children(".sub-menu").slideDown(0);
					$parent.closest(".sub-menu").each((idx, el) => {
						const $ancestor = $(el).closest(".menu-parent");
						if ($ancestor.length) {
							$ancestor.addClass("active");
						}
					});
				}
			}
		});
	}

	bindActionDropdown() {
		$(document).off("click.msgclose");

		$(document).on("click.msgclose", ".btn-modal-close", function (e) {
			e.preventDefault();
			e.stopPropagation();

			// Proper way to close msgprint
			if (frappe.msg_dialog && frappe.msg_dialog.hide) {
				frappe.msg_dialog.hide();
			}
		});
	}

	renderFilters() {

		let filters = [
			{
				fieldname: "sales_person",
				fieldtype: "MultiSelectList",
				get_data: function (txt) {
					return frappe.call({
						method: "renewal_module.api.get_salespersons_for_user"
					}).then(r => {
						return (r.message || []).map(item => ({
							value: item.name,
							description: item.parent_sales_person
						}));
					});
				},
				placeholder: "sales Person"
			},

			{
				fieldname: "based_on",
				fieldtype: "Select",
				options: "Customers",
				default: "Customers",
				placeholder: "based on"
			},

			{
				fieldname: "contacts",
				fieldtype: "Select",
				options: "\nCustomers With Contacts\nCustomers Without Contacts",
				placeholder: "contacts"
			},

			{
				fieldname: "billing_gap",
				fieldtype: "Select",
				options: "\n1 Year\n2 Years\n3 Years\n4 Years\n5 Years\n5+ Years",
				default: "1 Year",
				placeholder: "billing gap duration"
			},

			{
				fieldname: "renewals",
				fieldtype: "Select",
				options: "\nCustomers With Renewals\nCustomers Without Renewals",
				placeholder: "renewals"
			},

			{
				fieldname: "territory",
				fieldtype: "MultiSelectList",
				get_data: txt => frappe.db.get_link_options('Territory', txt),
				placeholder: "territory"
			},

			{
				fieldname: "industry",
				fieldtype: "MultiSelectList",
				get_data: txt => frappe.db.get_link_options('Industry Type', txt),
				placeholder: "industry type"
			},

			{
				fieldname: "created_by",
				fieldtype: "MultiSelectList",
				get_data: txt => frappe.db.get_link_options('User', txt),
				placeholder: "created by"
			},

			{
				fieldname: "starts_with",
				fieldtype: "MultiSelectList",
				options: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
					"N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"],
				placeholder: "starts with"
			}
		];

		this.filter_controls = {};

		/*filters.forEach(df => {
			df.onchange = () => this.onFilterChange();

			let div = $('<div class="control-selects"></div>').appendTo("#filter_section");

			let field = frappe.ui.form.make_control({
				df: df,
				parent: div,
				render_input: true
			});

			field.refresh();

			const tooltipText = df.placeholder || df.label || df.fieldname;
			// ✅ WORKS FOR ALL FIELD TYPES
			if (field.$wrapper) {
				field.$wrapper
					.attr("title", tooltipText)
					.attr("data-toggle", "tooltip")
					.attr("data-placement", "top");

				field.$wrapper.tooltip();
			}

			this.filter_controls[df.fieldname] = field;
		});*/

		filters.forEach(df => {

			let div = $('<div class="control-selects"></div>').appendTo("#filter_section");

			let field = frappe.ui.form.make_control({
				df: df,
				parent: div,
				render_input: true
			});

			field.refresh();

			// Set default value if specified
			if (df.default && !field.get_value()) {
				field.set_value(df.default);
			}

			const updateTooltip = () => {
				let value = field.get_value();
				let tooltipText = "";

				// ✅ MultiSelectList
				if (df.fieldtype === "MultiSelectList") {
					if (Array.isArray(value) && value.length > 0) {
						tooltipText = value.join(", ");
					} else if (typeof value === "string" && value.trim()) {
						tooltipText = value;
					} else {
						//EMPTY STATE FIX
						tooltipText = df.placeholder || df.label || df.fieldname;
					}
				}
				// Select
				else if (df.fieldtype === "Select") {
					tooltipText = value || df.placeholder || df.label || df.fieldname;
				}
				// Fallback
				else {
					tooltipText = value || df.placeholder || df.label || df.fieldname;
				}

				//Remove native tooltip (prevents double tooltip)
				if (field.$input) {
					field.$input.removeAttr("title");
				}

				// Always rebuild Bootstrap tooltip
				field.$wrapper
					.attr("data-toggle", "tooltip")
					.attr("data-placement", "top")
					.attr("data-original-title", tooltipText)
					.tooltip("dispose")
					.tooltip();
			};



			// Initial tooltip
			updateTooltip();

			//Update tooltip on change
			df.onchange = () => {
				updateTooltip();
				this.onFilterChange();
			};

			this.filter_controls[df.fieldname] = field;
		});


	}

	report_table_render() {
		const pageSize = this.getSavedPageSize();
		this.report_page_size = pageSize;
		this.loadReportPage(1, { filtersChanged: true });
	}

	renderReportTable(data, columns, total, page, pageSize) {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const container = wrapper.querySelector(".table-container");

		if (!container) return;

		// Clear existing table or create new one
		let table = container.querySelector(".report-table");
		if (!table) {
			table = document.createElement("table");
			table.className = "report-table";
			table.id = "reportTable";
			container.innerHTML = "";
			container.appendChild(table);
		}

		// Build table headers with checkbox
		let thead = table.querySelector("thead");
		if (!thead) {
			thead = document.createElement("thead");
			table.appendChild(thead);
		}

		const headerRow = document.createElement("tr");

		// Add checkbox header with proper styling
		const checkboxTh = document.createElement("th");
		checkboxTh.style.width = "50px";
		checkboxTh.className = "text-center";
		const selectAllCheckbox = document.createElement("input");
		selectAllCheckbox.type = "checkbox";
		selectAllCheckbox.id = "selectAllReportRows";
		selectAllCheckbox.className = "form-check-input";
		selectAllCheckbox.style.cursor = "pointer";
		checkboxTh.appendChild(selectAllCheckbox);
		headerRow.appendChild(checkboxTh);

		// Add column headers
		columns.forEach(col => {
			const th = document.createElement("th");
			th.textContent = col.label || col.fieldname || col;
			th.title = col.label || col.fieldname || col;
			headerRow.appendChild(th);
		});
		thead.innerHTML = "";
		thead.appendChild(headerRow);

		// Build table body
		let tbody = table.querySelector("tbody");
		if (!tbody) {
			tbody = document.createElement("tbody");
			table.appendChild(tbody);
		}
		tbody.innerHTML = "";

		if (!Array.isArray(data) || data.length === 0) {
			const emptyRow = document.createElement("tr");
			const emptyCell = document.createElement("td");
			emptyCell.colSpan = columns.length + 1;
			emptyCell.className = "text-center text-muted py-4";
			emptyCell.textContent = "No data found.";
			emptyRow.appendChild(emptyCell);
			tbody.appendChild(emptyRow);
			return;
		}

		// Add data rows with checkboxes
		data.forEach((row, index) => {
			const tr = document.createElement("tr");
			const rowKey = this.getRowKey(row) || `row_${index}`;
			tr.dataset.rowKey = rowKey;

			const checkboxTd = document.createElement("td");
			checkboxTd.className = "text-center checkbox-cell";
			const rowCheckbox = document.createElement("input");
			rowCheckbox.type = "checkbox";
			rowCheckbox.className = "form-check-input report-row-checkbox";
			rowCheckbox.style.cursor = "pointer";
			rowCheckbox.dataset.rowKey = rowKey;
			if (this.selected_report_rows && this.selected_report_rows.has(rowKey)) {
				rowCheckbox.checked = true;
			}
			checkboxTd.appendChild(rowCheckbox);
			tr.appendChild(checkboxTd);

			// Add data cells
			columns.forEach(col => {
				const td = document.createElement("td");
				const fieldname = col.fieldname || col;
				let value = row[fieldname] || "";

				// Escape HTML
				if (typeof value === "string") {
					value = this.escapeHtml(value);
				} else if (value === null || value === undefined) {
					value = "";
				}

				td.innerHTML = value;
				td.title = value;
				td.className = "ellipsis";
				tr.appendChild(td);
			});
			tbody.appendChild(tr);
		});

		const selectAllEl = wrapper.querySelector("#selectAllReportRows");
		if (selectAllEl && Array.isArray(data) && data.length) {
			const allVisibleSelected = data.every(row => this.selected_report_rows.has(this.getRowKey(row)));
			selectAllEl.checked = allVisibleSelected;
		}

		// Bind checkbox events
		this.bindReportCheckboxEvents(wrapper, data.length);

		// Update pagination info
		const visibleCount = Math.min(this.all_report_data.length, this.report_total_records);
		const paginationInfo = wrapper.querySelector(".pagination-info");
		if (paginationInfo) {
			const visibleCountEl = paginationInfo.querySelector(".visible-count");
			const totalCountEl = paginationInfo.querySelector(".total-count");
			const buttonEl = paginationInfo.querySelector("button");
			if (visibleCountEl) visibleCountEl.textContent = visibleCount;
			if (totalCountEl) totalCountEl.textContent = this.report_total_records;
			// Set hover title
			if (buttonEl) {
				buttonEl.title = `${visibleCount} of ${this.report_total_records} `;
			}
		}

		// Update Load More button visibility
		const loadMoreBtn = wrapper.querySelector(".btn-more");
		if (loadMoreBtn) {
			const currentVisibleCount = Math.min(this.all_report_data.length, this.report_total_records);
			loadMoreBtn.style.display = (currentVisibleCount >= this.report_total_records) ? "none" : "inline-block";
		}

		this.updateActionVisibility();
	}

	escapeHtml(s) {
		if (s == null) return "";
		return String(s)
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&#039;");
	}


	bindPaginationEvents() {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;

		// Restore page_size from localStorage or default to 20 FIRST
		const savedPageSize = localStorage.getItem('report_page_size');
		this.report_page_size = savedPageSize ? parseInt(savedPageSize, 10) : 20;

		let pageButtons = wrapper.querySelectorAll(".btn-paging");

		// --- Remove any duplicate listeners ---
		pageButtons.forEach(btn => btn.replaceWith(btn.cloneNode(true)));
		pageButtons = wrapper.querySelectorAll(".btn-paging");

		pageButtons.forEach(btn => {
			btn.addEventListener("click", async () => {
				// Clear old active state
				pageButtons.forEach(b => {
					b.classList.remove("btn-info", "active-pagination");
					b.style.backgroundColor = "";
					b.style.color = "";
				});

				// Set new active button
				btn.classList.add("btn-info", "active-pagination");
				btn.style.backgroundColor = "#6C5CE7";
				btn.style.color = "black";

				this.report_page_size = parseInt(btn.dataset.value, 10);

				// Reload report with new page size from page 1
				await this.loadReportPage(1);
			});
		});

		// Highlight the correct button based on saved/default page size
		const activeBtn = wrapper.querySelector(`.btn-paging[data-value="${this.report_page_size}"]`);
		if (activeBtn) {
			activeBtn.classList.add("btn-info", "active-pagination");
			activeBtn.style.backgroundColor = "#6C5CE7";
			activeBtn.style.color = "white";
		}

		// --- Load More button ---
		const loadMoreBtn = wrapper.querySelector(".btn-more");
		if (loadMoreBtn) {
			loadMoreBtn.replaceWith(loadMoreBtn.cloneNode(true));
			const newLoadMoreBtn = wrapper.querySelector(".btn-more");

			newLoadMoreBtn.addEventListener("click", async () => {
				newLoadMoreBtn.classList.add("active-pagination");
				newLoadMoreBtn.style.backgroundColor = "#E7E5F9";
				newLoadMoreBtn.style.color = "black";

				// Load next page of report data
				const nextPage = (this.report_current_page || 1) + 1;
				console.log("Loading page:", nextPage);
				await this.loadReportPage(nextPage);

				setTimeout(() => {
					newLoadMoreBtn.classList.remove("active-pagination");
					newLoadMoreBtn.style.backgroundColor = "";
					newLoadMoreBtn.style.color = "";
				}, 500);
			});
		}
	}

	loadReportPage(page, options = {}) {
		return new Promise((resolve, reject) => {
			const pageSize = this.report_page_size || this.getSavedPageSize();
			const filters = this.getCurrentFilters();
			const filterHash = JSON.stringify(filters || {});
			const filtersChanged = options.filtersChanged || filterHash !== this.last_filter_hash;
			const targetPage = filtersChanged ? 1 : page;

			console.log("Loading report page:", targetPage, "with page_size:", pageSize, "filters:", filters);
			this.updateUrlWithFilters(filters);

			frappe.call({
				method: "renewal_module.custom_module.page.non_billing_customer.non_billing_customer.get_non_billing_customers",
				args: {
					page: targetPage.toString(),
					page_size: pageSize.toString(),
					filters: JSON.stringify(filters)
				},
				callback: (r) => {
					if (!r.message) {
						console.warn("No data returned from server");
						resolve();
						return;
					}

					const response = r.message;
					const { columns = [], data = [], total = 0, page: responsePage = targetPage } = response;

					console.log("Report page data received:", { columns: columns.length, dataCount: data.length, total });

					this.report_current_page = responsePage;
					this.report_total_records = total;
					this.report_columns = columns;
					this.last_filter_hash = filterHash;

					if (responsePage === 1) {
						this.all_report_data = Array.isArray(data) ? data.slice() : [];
						if (filtersChanged) {
							this.selected_report_rows = new Set();
						}
					} else if (Array.isArray(data)) {
						this.all_report_data = [...(this.all_report_data || []), ...data];
					}

					this.pruneSelectionWithData(this.all_report_data);

					this.renderReportTable(this.all_report_data, this.report_columns, total, responsePage, pageSize);

					localStorage.setItem('report_page_size', pageSize.toString());
					this.updateActionVisibility();

					resolve();
				},
				error: (err) => {
					console.error("Error loading report page:", err);
					reject(err);
				}
			});
		});
	}

	bindReportCheckboxEvents(wrapper, dataLength) {
		const selectAllCheckbox = wrapper.querySelector("#selectAllReportRows");
		const rowCheckboxes = wrapper.querySelectorAll(".report-row-checkbox");

		if (!this.selected_report_rows) {
			this.selected_report_rows = new Set();
		}

		if (selectAllCheckbox) {
			const newSelectAll = selectAllCheckbox.cloneNode(true);
			selectAllCheckbox.replaceWith(newSelectAll);

			newSelectAll.addEventListener("change", () => {
				const isChecked = newSelectAll.checked;
				const currentRowCheckboxes = wrapper.querySelectorAll(".report-row-checkbox");

				currentRowCheckboxes.forEach(checkbox => {
					checkbox.checked = isChecked;
					const rowKey = checkbox.dataset.rowKey;
					if (rowKey) {
						if (isChecked) {
							this.selected_report_rows.add(rowKey);
						} else {
							this.selected_report_rows.delete(rowKey);
						}
					}
				});

				this.updateActionVisibility();
				console.log("Selected rows:", Array.from(this.selected_report_rows));
			});
		}

		rowCheckboxes.forEach(checkbox => {
			checkbox.addEventListener("change", () => {
				const rowKey = checkbox.dataset.rowKey;

				if (rowKey) {
					if (checkbox.checked) {
						this.selected_report_rows.add(rowKey);
					} else {
						this.selected_report_rows.delete(rowKey);
					}
				}

				const updatedSelectAll = wrapper.querySelector("#selectAllReportRows");
				if (updatedSelectAll) {
					const totalCheckboxes = wrapper.querySelectorAll(".report-row-checkbox").length;
					const checkedCheckboxes = wrapper.querySelectorAll(".report-row-checkbox:checked").length;
					updatedSelectAll.checked = totalCheckboxes > 0 && totalCheckboxes === checkedCheckboxes;
				}

				this.updateActionVisibility();
				console.log("Selected rows:", Array.from(this.selected_report_rows));
			});
		});
	}

	bindevents() {
		$("#actions-dropdown .btn").off("click").on("click", () => {
			// frappe.msgprint(`Assigning ${this.selected_report_rows.size} customers to selected Sales Person is not yet implemented.`);
			const customersToAssign = Array.from(this.selected_report_rows);
			console.log("assign customers list:", customersToAssign.length);
			let dialog = new frappe.ui.Dialog({
				title: 'Assign user',
				fields: [
					{
						label: 'User Email',
						fieldname: 'user_email',
						fieldtype: 'Link',
						options: 'User',
						reqd: 1
					}
				],
				primary_action_label: 'Assign',
				primary_action: (values) => {
					const customersToAssign = Array.from(this.selected_report_rows);
					if (customersToAssign.length === 0) {
						frappe.msgprint("No customers selected for assignment.");
						return;
					}
					console.log("assign customers list:", customersToAssign.length, customersToAssign);

					frappe.call({
						method: "renewal_module.api.bulk_assign_customer_to_salesperson_by_user",
						args: {
							customers: customersToAssign,
							user_email: values.user_email
						},
						callback: (r) => {
							if (r.message === "ok") {
								frappe.msgprint("User assigned successfully.");
								// Clear selected rows
								this.selected_report_rows.clear();
								// Reload the data from page 1
								this.loadReportPage(1, { filtersChanged: true });
								dialog.hide();
							}
						}
					});
				}
			});
			dialog.show();
			setTimeout(() => {
				const closeBtn = dialog.get_close_btn();
				if (!closeBtn || !closeBtn.length) {
					return;
				}
				closeBtn.off("click.dialog").on("click.dialog", function () {
					dialog.hide();
				});
			}, 50);
		});
	}

}

frappe.non_billing_customer_page_template = {
	body: `
		<div class="wrapper non-billing-customer-wrapper">
			<div class="row">
				<div class="col-12">
					<h3>Non Billing Customers Report</h3>
				</div>
			</div>
		
			<div class="row">
				<div class="col-12">
					<div class="controls-wrapper">
						<div class="controls">
							<div class="left-controls">
								<div id="filter_section" class="filters-container-cols"></div>
							</div>
							<div class="right-controls">
								<div id="actions-dropdown" style="display:none;">
									<button class="btn btn-sm btn-primary" type="button">
										Assign To
									</button>
								</div>
								<div class="pagination-info text-truncate">
									<button class="btn btn-sm text-white"><span class="visible-count">0</span> of <span class="total-count">0</span></button>
								</div>
							</div>
						</div>
					</div>
					

					<div class="table-container mt-2">
						<!-- Table will be dynamically created here -->
					</div>
					
					<div class="d-flex justify-content-between align-items-center mt-2">
						<div class="list-paging-area d-flex justify-content-between align-items-center w-100">
							<div class="p-2">
								<div class="btn-group">
									<button type="button" class="btn btn-default1 btn-light btn-sm btn-paging" data-value="20">20</button>
									<button type="button" class="btn btn-default1 btn-light btn-sm btn-paging" data-value="50">50</button>
									<button type="button" class="btn btn-default1 btn-light btn-sm btn-paging" data-value="100">100</button>
									<button type="button" class="btn btn-default1 btn-light btn-sm btn-paging" data-value="500">500</button>
									<button type="button" class="btn btn-default1 btn-light btn-sm btn-paging" data-value="1000">1000</button>
									<button type="button" class="btn btn-default1 btn-light btn-sm btn-paging" data-value="1500">1500</button>
								</div>
							</div>
						
							<div class="p-2">
								<button class="btn btn-default1 btn-light btn-more btn-sm">Load More</button>
							</div>
						</div>
					</div>
				</div>

			</div>
		</div>
	`,
};	