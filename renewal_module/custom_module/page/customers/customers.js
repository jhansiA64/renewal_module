
frappe.pages['customers'].on_page_load = (wrapper) => {
	// 	console.log("on_page_load triggered");
	localStorage.removeItem('customers_page_length');
	new customersPage(wrapper);
};
frappe.pages['customers'].on_page_show = function (wrapper) {
	//console.log("🔄 Tickets page showing", wrapper);
	console.log("🔄 customers page showing");
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
			if (!frappe.customers_page || frappe.customers_page.wrapper !== pageWrapper) {
				frappe.customers_page = new customersPage(pageWrapper);
			}
			frappe.customers_page.render();
		});
	});
};

class customersPage {
	constructor(wrapper) {
		this.wrapper = wrapper;
		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: '',
			single_column: true
		});

		// expose this instance so route changes can call handleRoute()
		//frappe.customers_page = this; // <-- important for router 'change' handler to work

		// paging and state
		this.page_length = 20;
		this.LOAD_MORE_SIZE = 50;
		this.visible_count = 0;
		this.all_customers = [];
		this.start = 0;
		this.total = 0;
		this.selected_customers = new Set();
		//this.initSelectAll();
		// saved/active filters
		this.saved_filters = [];
		this.active_filters = {
			account_manager: "",
			territory: "",
			customer_group: "",
			customer_name: "",
		};
		// internal flags
		// this._fetch_in_process = false;
		// this._filtersPopulated = false;
		// this._filtersApplied = false;
		// this._filtersInitialized = false;
	}

	render() {
		const waitForContent = () => {
			const $content = $("#support-page-content");
			if (!$content.length) {
				// wait until layout injects DOM
				setTimeout(waitForContent, 50);
				return;
			}
			$content.empty().append(frappe.customers_page_template.body);
			this.handleRoute();
			this.bindActionDropdown();
		};

		waitForContent();
	}

	handleRoute() {
		const route = frappe.get_route();

		console.log("handleRoute:", route);

		if (route.length === 1) {
			this.show_list();
		}
		// customers/new
		if (route.length === 2 && route[1] === "new") {
			return this.show_new();
		}
		else if (route.length === 2) {
			const customer_id = route[1];
			this.show_details(customer_id);
		}
	}

	show_list() {
		$(".customers-list-view").removeClass("d-none");
		$(".customers-details-view").addClass("d-none");
		$(".new-customers").addClass("d-none");
		this.setPageTitle("Customers");
		this.setActiveSidebar();

		this.all_customers = [];
		this.filtered_customers = [];
		this.visible_count = 0;
		this._fetch_in_process = false;

		setTimeout(async () => {
			try {
				await this.loadFilters();
				this.bindFilterEvents();
				this.bindevents();
				this.bindActionDropdownHandler();
				this.bindRowSelectionHandler();
				this.bindCustomerRowClick();
				this.applyUrlFilters();
				this.applyRoleBasedActionVisibility();

			} catch (err) {
				console.error("customersPage.make error:", err);
			}
		}, 200);
	}



	show_details(customer_id) {
		console.log("SHOW DETAILS for:", customer_id);
		$(".customers-list-view").addClass("d-none");
		$(".customers-details-view").removeClass("d-none");
		$(".new-customers").addClass("d-none");
		this.setPageTitle(`Customers/${customer_id}`);
		this.setActiveSidebar();
		this.current_customer_id = customer_id;
		this.bindCustomerRenameButton(customer_id);
		this.bindProfileTabs();
		this.bindOthersTabs();
		this.bindServicesToggle();
		this.bindStatsSection(customer_id);
		this.loadRenewalDashboard(customer_id);
		this.loadRecentActivities(customer_id);
		this.bindConnectionItems(customer_id);
		this.toggleSalesAnalyticsSection(customer_id);
		this.load_customer_details(customer_id);
	}

	// Duplicate show_details() removed. The parameterized version
	// show_details(customer_id) defined later is used to display details.

	show_new() {
		$(".customers-list-view").addClass("d-none");
		$(".customers-details-view").addClass("d-none");
		$(".new-customers").removeClass("d-none");
		this.setPageTitle("New Customers");
		this.setActiveSidebar();
		this._newCustomerCurrentStep = 1;
		this.bind_customer_form_events();
		this.gotoNewCustomerWizardStep(1);

	}

	setPageTitle(title) {
		document.title = title; // Browser tab title
		this.page.set_title(title); // ERPNext body title
	}

	setActiveSidebar() {
		const route = frappe.get_route();
		const baseRoute = route[0]; // "customers"
		// Reset states
		$(".side-nav-link").removeClass("active-menu");
		$(".side-nav-item").removeClass("active-menu-item");
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

		if (window.syncSupportSidebarArrows) {
			window.syncSupportSidebarArrows();
		}
	}

	bindActionDropdown() {
		$(document).off("click.msgclose");

		$(document).on(
			"click.msgclose",
			".msgprint-dialog .btn-modal-close, .msgprint-dialog .modal-header .close",
			function (e) {
				e.preventDefault();
				e.stopPropagation();

				if (frappe.msg_dialog && frappe.msg_dialog.hide) {
					frappe.msg_dialog.hide();
				}
			}
		);
	}

	async loadcustomer({ reset = false, saved_filters = [], override_filters = {} } = {}) {
		console.log("loadcustomer called:", { reset, saved_filters, override_filters });
		return new Promise((resolve, reject) => {
			if (!this.page_length) this.page_length = 20;
			if (this._fetch_in_process) {
				console.warn("[fetch_list_data] fetch already in progress — skipping");
				return resolve();
			}

			this._fetch_in_process = true

			try {
				if (reset) {
					this.all_customers = [];
					this.filtered_customers = [];
					this.visible_count = 0;
				}
				const wrapper = this.page.wrapper[0] || this.page.wrapper;

				// ✅ FIX: Get current values from DOM
				const accountManagerSelect = wrapper.querySelector('[data-table-filter="account_manager"]');
				const territorySelect = wrapper.querySelector('[data-table-filter="territory"]');
				const customerGroupSelect = wrapper.querySelector('[data-table-filter="customer_group"]');
				const customerNameInput = wrapper.querySelector('[data-table-filter="customer_name"]');

				// ✅ Update active_filters from DOM (or use override)
				this.active_filters.account_manager = override_filters.account_manager !== undefined
					? override_filters.account_manager
					: (accountManagerSelect?.value || "");

				this.active_filters.territory = override_filters.territory !== undefined
					? override_filters.territory
					: (territorySelect?.value || "");

				this.active_filters.customer_group = override_filters.customer_group !== undefined
					? override_filters.customer_group
					: (customerGroupSelect?.value || "");

				this.active_filters.customer_name = override_filters.customer_name !== undefined
					? override_filters.customer_name
					: (customerNameInput?.value?.trim() || "");

				console.log("%c[DEBUG] → active_filters:", "color: #ff6b6b;", this.active_filters);

				const normalizedFilters = (saved_filters || []).map(f => {
					if (Array.isArray(f)) {
						let field = "";
						let operatorRaw = "=";
						let valueRaw = "";

						if (f.length >= 4) {
							[, field, operatorRaw, valueRaw] = f;
						} else if (f.length === 3) {
							[field, operatorRaw, valueRaw] = f;
						}
						const operator = (operatorRaw || "=").toLowerCase();
						let value = valueRaw;
						if (operator === "between" && typeof value === "string" && value.includes(",")) {
							value = value.split(",").map(v => v.trim());
						}
						return { field, operator, value };
					}
					if (typeof f === "object" && f !== null) {
						const field = f.fieldname || f.field || "";
						const operator = (f.operator || "=").toLowerCase();
						let value = f.value;
						if (operator === "between" && typeof value === "string" && value.includes(",")) {
							value = value.split(",").map(v => v.trim());
						}
						return { field, operator, value };
					}
					return {};
				});

				const filtersPayload = normalizedFilters.map(f => {
					if (f.field && f.operator) {
						let val = f.value;
						if (f.operator === "between") {
							if (typeof val === "string" && val.includes(",")) {
								val = val.split(",").map(v => v.trim());
							} else if (!Array.isArray(val)) {
								val = [val, val];
							}
						}
						return [f.field, f.operator, val];
					}
					return f;
				});

				console.log("%c[DEBUG] → filtersPayload:", "color: #4caf50;", filtersPayload);
				frappe.call({
					method: "renewal_module.custom_module.page.customers.customers.get_customer_list",
					args: {
						start: reset ? 0 : (this.all_customers ? this.all_customers.length : 0),
						page_length: this.page_length,
						account_manager: this.active_filters.account_manager,
						territory: this.active_filters.territory,
						customer_name: this.active_filters.customer_name,
						customer_group: this.active_filters.customer_group,
						filters: JSON.stringify(filtersPayload)
					},
					callback: (r) => {
						try {
							if (!r || !r.message) {
								console.warn("[loadcustomer]empty response");
								if (reset) {
									this.all_customers = [];
									this.total_records = 0;
									this.visible_count = 0;
								}
								this.renderCustomerRows(true);
								this._fetch_in_process = false;
								return resolve();
							}
							const { rows = [], total = 0 } = r.message || {};
							console.log("Data received:", rows, "Total:", total);
							this.total_records = Number.isFinite(total) ? parseInt(total, 10) : (rows.length || 0);
							if (reset) {
								this.all_customers = Array.isArray(rows) ? rows.slice() : [];
							} else if (Array.isArray(rows) && rows.length > 0) {
								this.all_customers = [...(this.all_customers || []), ...rows];
							}
							this.visible_count = Math.min((this.all_customers || []).length, this.total_records);

							if (this.total_records === 0) {
								this.all_customers = [];
								this.visible_count = 0;
							}

							document.getElementById("visible-count").innerHTML = this.visible_count.toLocaleString();
							document.getElementById("total-count").innerHTML = this.total_records.toLocaleString();
							const countHeader = document.getElementById("count-header");
							if (countHeader) {
								countHeader.setAttribute(
									"title",
									`${this.visible_count.toLocaleString()} of ${this.total_records.toLocaleString()}`
								);
							}
							this.filtered_customers = this.all_customers.slice();

							// Finally render rows
							this.renderCustomerRows(true);
							resolve();
						}
						catch (err) {
							reject(err);
						}
						finally {
							this._fetch_in_process = false;
						}
					},
					error: (err) => {
						this._fetch_in_process = false;
						console.error("%c[DEBUG] → frappe.call error:", "color: red;", err);
						reject(err);
					}
				});
			} catch (err) {
				this._fetch_in_process = false;
				console.error(err);
				reject(err);

			}
		});
	}

	renderCustomerRows(useFiltered = false) {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const tbody = wrapper.querySelector(".customers-table tbody");
		if (!tbody) return;

		tbody.innerHTML = ""; // clear existing rows

		const rows = useFiltered && this.filtered_customers
			? this.filtered_customers
			: (this.all_customers || []);

		// ✅ FIXED HERE
		if (!Array.isArray(rows) || rows.length === 0) {
			tbody.insertAdjacentHTML("beforeend", `
				<tr>
					<td colspan="8" class="text-center text-muted py-4">
						No customers found.
					</td>
				</tr>
			`);

			// Update pagination info blocks
			const infoBlocksEmpty = wrapper.querySelectorAll(".pagination-info");
			infoBlocksEmpty.forEach(info => {
				const visibleCountEl = info.querySelector(".visible-count");
				const totalCountEl = info.querySelector(".total-count");
				if (visibleCountEl) visibleCountEl.textContent = 0;
				if (totalCountEl) totalCountEl.textContent = this.total_records || 0;
			});

			// Hide load more button
			const loadMoreBtnEmpty = wrapper.querySelector(".btn-more");
			if (loadMoreBtnEmpty) loadMoreBtnEmpty.style.display = "none";
			return;
		}

		this.visible_count = Math.min(
			this.visible_count || rows.length,
			this.total_records || rows.length
		);

		const visible_customers = rows.slice(0, this.visible_count);

		visible_customers.forEach(c => {
			const tr = document.createElement("tr");
			const avatarHtml = c.image
				? `<img src="${c.image}" class="img-fluid rounded-circle" alt="">`
				: `<span class="avatar-title text-white">
					${this.escapeHtml((c.customer_name || "?").substring(0, 1))}
			   </span>`;

			tr.innerHTML = `
			<td>
				<input class="row-check form-check-input form-check-input-light fs-14 mt-0" type="checkbox" data-id="${c.name}" />
			</td>
			<td>
				<div class="customer-cell">
					<div class="customer-avatar">${avatarHtml}</div>
					<div class="customer-info">
						<div class="customer-link customer-name text-truncate"
							 title="${this.escapeHtml(c.customer_name || "")}"
							 data-customer="${c.name}">
							${this.escapeHtml(c.customer_name || "")}
						</div>
						<div class="customer-email ellipsis"
							 title="${this.escapeHtml(c.email_id || "")}">
							${this.escapeHtml(c.email_id || "")}
						</div>
					</div>
				</div>
			</td>
			<td><span class="badge1 text-info" title="${this.escapeHtml(c.custom_customer_status || "Active")}">
				${this.escapeHtml(c.custom_customer_status || "Active")}
			</span></td>
			<td title="${this.escapeHtml(c.industry || "")}">${this.escapeHtml(c.industry || "")}</td>
			<td title="${this.escapeHtml(c.territory || "")}">${this.escapeHtml(c.territory || "")}</td>
			<td title="${this.escapeHtml(c.employees || "")}">${this.escapeHtml(c.employees || "")}</td>
			<td title="${this.escapeHtml(c.account_manager || "")}">${this.escapeHtml(c.account_manager || "")}</td>
			<td>
				<div class="d-flex align-items-center justify-content-center gap-1 customer-link" data-customer="${this.escapeHtml(c.name)}" style="cursor:pointer;">
					<span title="${this.escapeHtml(c.modified || "")}">
						${this.formatModifiedDate(c.modified)}
					</span>
					<span class="d-flex align-items-center gap-1" title="${c.comment_count || 0}">
						<i class="fa fa-comment fs-lg"></i>
						${c.comment_count || 0}
					</span>
				</div>
			</td>
		`;
			tbody.appendChild(tr);
		});

		// Sync selected checkboxes
		const visibleChecks = document.querySelectorAll(".customers-table tbody .row-check");
		const visibleIds = new Set(Array.from(visibleChecks).map(chk => chk.dataset.id));

		for (const id of Array.from(this.selected_customers)) {
			if (!visibleIds.has(id)) {
				this.selected_customers.delete(id);
			}
		}

		visibleChecks.forEach(chk => {
			const id = chk.dataset.id;
			const shouldBeChecked = this.selected_customers.has(id);
			if (chk.checked !== shouldBeChecked) chk.checked = shouldBeChecked;
		});


		{
			const table = wrapper.querySelector(".customers-table");
			const newCustomersBtn = wrapper.querySelector("#new-customers-btn");
			const actionsDropdownEl = wrapper.querySelector("#actions-dropdown");

			if (table) {
				const all = table.querySelectorAll('tbody input[type="checkbox"]').length;
				const checked = table.querySelectorAll('tbody input[type="checkbox"]:checked').length;
				const selectAll = table.querySelector('#customercheckAll');
				if (selectAll) selectAll.checked = (all > 0 && all === checked);
				// update the action/new-customer visibility
				this.updateActionBarState(table, newCustomersBtn, actionsDropdownEl);
			}
		}

	}


	bindCustomerRowClick() {
		$(document).off("click", "div.customer-link").on("click", "div.customer-link", (e) => {
			const id = e.currentTarget.dataset.customer;
			if (id) {
				const qs = window.location.search || "";
				localStorage.setItem("customer_list_url_filters", qs);
				localStorage.setItem('customers_page_length', this.page_length);
				console.log("Saved filters before opening details:", qs);
				frappe.set_route("customers", id);
			}
		});
	}


	formatModifiedDate(dateString) {
		if (!dateString) return "";

		const modifiedDate = new Date(dateString);
		const now = new Date();
		const diffMs = now - modifiedDate;

		const seconds = Math.floor(diffMs / 1000);
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);
		const days = Math.floor(hours / 24);
		const months = Math.floor(days / 30);
		const years = Math.floor(days / 365);

		if (years > 0) return years + "y";
		if (months > 0) return months + "m";
		if (days > 0) return days + "d";
		if (hours > 0) return hours + "h";
		if (minutes > 0) return minutes + "m";
		return seconds + "s";
	}

	updateActionBarState(table, newContactBtn, actionsDropdown) {
		if (!table || !newContactBtn || !actionsDropdown) return;
		const selectedCount = table.querySelectorAll('tbody input[type="checkbox"]:checked').length;
		console.log("Selected count:", selectedCount);
		if (selectedCount > 0) {
			newContactBtn.classList.add("d-none");
			actionsDropdown.classList.remove("d-none");
		} else {
			newContactBtn.classList.remove("d-none");
			actionsDropdown.classList.add("d-none");
		}
	}

	bindRowSelectionHandler() {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const table = wrapper.querySelector(".customers-table");
		const newCustomerBtn = wrapper.querySelector("#new-customers-btn");
		const actionsDropdown = wrapper.querySelector("#actions-dropdown");
		if (!table) return;

		const selectAll = table.querySelector('#customercheckAll');

		// ✅ Select All (VISIBLE rows only)
		if (selectAll) {
			selectAll.onchange = (e) => {
				const rows = table.querySelectorAll('tbody .row-check');
				rows.forEach(cb => {
					cb.checked = e.target.checked;
					const id = cb.dataset.id;
					if (!id) return;

					if (e.target.checked) {
						this.selected_customers.add(id);
					} else {
						this.selected_customers.delete(id);
					}
				});
				this.updateActionBarState(table, newCustomerBtn, actionsDropdown);
			};
		}

		// ✅ Individual row selection
		table.addEventListener('change', (e) => {
			if (!e.target.matches('.row-check')) return;

			const id = e.target.dataset.id;
			if (!id) return;

			if (e.target.checked) {
				this.selected_customers.add(id);
			} else {
				this.selected_customers.delete(id);
			}

			// Update Select All state
			if (selectAll) {
				const total = table.querySelectorAll('tbody .row-check').length;
				const checked = table.querySelectorAll('tbody .row-check:checked').length;
				selectAll.checked = total > 0 && total === checked;
			}

			this.updateActionBarState(table, newCustomerBtn, actionsDropdown);
		});
	}




	// ---- fetch filter options and populate selects ----
	async loadFilters() {
		try {
			const res = await frappe.call({
				method: "renewal_module.custom_module.page.customers.customers.get_customer_filters"
			});
			const filters = (res && res.message) ? res.message : {};

			this.populateFilter("account_manager", filters.account_manager);
			this.populateFilter("territory", filters.territory);
			this.populateFilter("customer_group", filters.customer_group);

		} catch (err) {
			console.error("loadFilters error:", err);
		}
	}

	//safe populate: avoids direct innerHTML append for whole doc (but keeps simple)
	populateFilter(fieldname, list) {
		let select = document.querySelector(`select[data-table-filter="${fieldname}"]`);
		if (!select) return;

		// Store previously selected value
		const oldValue = select.value || "";

		// Reset the select with its placeholder
		const label = select.getAttribute("data-table-filter").replace("_", " ");
		select.innerHTML = `<option value="">${this.escapeHtml(label)}</option>`;

		// Append new options
		(list || []).forEach(item => {
			const val = typeof item === "string" ? item : (item.value ?? "");
			const lbl = typeof item === "string" ? item : (item.label ?? val);

			const opt = document.createElement("option");
			opt.value = val;
			opt.textContent = lbl;
			select.appendChild(opt);
		});

		// Restore selected value ONLY if it exists in the new options
		if ([...select.options].some(o => o.value === oldValue)) {
			select.value = oldValue;
		}
		this.setupFilterTooltip(select);
	}

	// safe tooltip setup — fallback to native title if bootstrap.js is absent
	setupFilterTooltip(select) {
		if (!select) return;
		// avoid duplicating listeners / tooltip instances
		if (select.dataset.tooltipInitialized === "1") return;
		select.dataset.tooltipInitialized = "1";
		// helper to compute label text
		const getLabelText = () => {
			const opt = select.options[select.selectedIndex];
			return opt ? (opt.textContent || "").trim() : "";
		};
		const text = getLabelText();
		// If bootstrap tooltip JS is present, use it safely
		if (window.bootstrap && typeof window.bootstrap.Tooltip === "function") {
			// dispose any previous instance (defensive)
			try {
				const old = window.bootstrap.Tooltip.getInstance(select);
				if (old) old.dispose();
			} catch (e) {
				// ignore - some bootstrap versions may not implement getInstance on the prototype
			}
			// ensure no native title to avoid double tooltip
			select.removeAttribute("title");
			// set bootstrap tooltip source text
			select.setAttribute("data-bs-original-title", text);
			// create new tooltip
			try {
				new window.bootstrap.Tooltip(select, {
					placement: "bottom",
					trigger: "hover",
					container: "body"
				});
			} catch (e) {
				// If initialization fails, fall back to native title
				select.setAttribute("title", text);
			}

			// update tooltip text on change
			select.addEventListener("change", () => {
				const updated = getLabelText();
				select.setAttribute("data-bs-original-title", updated);

				// update bootstrap tooltip instance content if available
				try {
					const t = window.bootstrap.Tooltip.getInstance(select);
					if (t && typeof t.setContent === "function") {
						t.setContent({ '.tooltip-inner': updated });
					} else if (t) {
						// older bootstrap versions - dispose & re-create to update text
						t.dispose();
						new window.bootstrap.Tooltip(select, {
							placement: "bottom",
							trigger: "hover",
							container: "body"
						});
					}
				} catch (e) {
					// ignore, fallback to title attribute
				}

				// also keep native title in sync (good fallback for non-bootstrap)
				select.setAttribute("title", updated);
			});

			return;
		}
		// Use native title attribute to show a tooltip (browser default)
		select.removeAttribute("data-bs-original-title");
		select.setAttribute("title", text);
		// keep native title updated on change
		select.addEventListener("change", () => {
			const updated = getLabelText();
			select.setAttribute("title", updated);
		});
	}


	// ---- filter popover + basic filter events
	bindFilterEvents() {
		const me = this;
		const wrapper = this.page.wrapper[0] || this.page.wrapper;

		const accountmanagerFilter = wrapper.querySelector('[data-table-filter="account_manager"]');
		const territoryFilter = wrapper.querySelector('[data-table-filter="territory"]');
		const customerGroupFilter = wrapper.querySelector('[data-table-filter="customer_group"]');
		const customerNameFilter = wrapper.querySelector('[data-table-filter="customer_name"]');
		const filterButton = wrapper.querySelector('.filter-button');

		if (accountmanagerFilter) {
			this.syncPlaceholder(accountmanagerFilter);
			accountmanagerFilter.addEventListener("change", () => this.syncPlaceholder(accountmanagerFilter));
		}

		if (territoryFilter) {
			this.syncPlaceholder(territoryFilter);
			territoryFilter.addEventListener("change", () => this.syncPlaceholder(territoryFilter));
		}

		if (customerGroupFilter) {
			this.syncPlaceholder(customerGroupFilter);
			customerGroupFilter.addEventListener("change", () => this.syncPlaceholder(customerGroupFilter));
		}

		if (customerNameFilter) {
			this.syncPlaceholder(customerNameFilter);
			customerNameFilter.addEventListener("input", () => this.syncPlaceholder(customerNameFilter));
		}

		// only proceed if DOM exists
		//if (!wrapper) return;
		// Initialize advancedFilterForm wrapper
		const advancedFilterForm = $(wrapper).find('.advanced-filter-form, .filter-section, .filter-container').first().length
			? $(wrapper).find('.advanced-filter-form, .filter-section, .filter-container').first()
			: $(wrapper);

		let filter_group = null;
		me.saved_filters = me.saved_filters || [];
		setTimeout(() => {
			if (filterButton && me.saved_filters && me.saved_filters.length > 0) {
				const $btn = $(filterButton);
				update_filter_button_count($btn, me.saved_filters.length);
			} else if (filterButton) {
				const $btn = $(filterButton);
				update_filter_button_count($btn, 0);
			}
		}, 100);

		// Convenience: clear basic UI and internal state
		me.clearBasicFilterUI = function () {
			const me = this;
			const accountmanagerFilter = document.querySelector('[data-table-filter="account_manager"]');
			const territoryFilter = document.querySelector('[data-table-filter="territory"]');
			const customerGroupFilter = document.querySelector('[data-table-filter="customer_group"]');
			const customerNameFilter = document.querySelector('input[data-table-filter="customer_name"]');

			if (accountmanagerFilter) accountmanagerFilter.value = "";
			if (territoryFilter) territoryFilter.value = "";
			if (customerGroupFilter) customerGroupFilter.value = "";
			if (customerNameFilter) customerNameFilter.value = "";
			me.saved_filters = [];
			me.active_filters = {
				account_manager: "",
				territory: "",
				customer_group: "",
				customer_name: "",
			};
			if (accountmanagerFilter) {
				const sel = accountmanagerFilter;
				function updateSelectColor() {
					if (!sel.value) sel.classList.add("placeholder");
					else sel.classList.remove("placeholder");
				}
				updateSelectColor();
				sel.addEventListener("change", updateSelectColor);
			}
			if (territoryFilter) {
				const sel = territoryFilter;
				function updateSelectColor() {
					if (!sel.value) sel.classList.add("placeholder");
					else sel.classList.remove("placeholder");
				}
				updateSelectColor();
				sel.addEventListener("change", updateSelectColor);
			}
			if (customerGroupFilter) {
				const sel = customerGroupFilter;
				function updateSelectColor() {
					if (!sel.value) sel.classList.add("placeholder");
					else sel.classList.remove("placeholder");
				}
				updateSelectColor();
				sel.addEventListener("change", updateSelectColor);
			}
			if (customerNameFilter) {
				const sel = customerNameFilter;
				function updateSelectColor() {
					if (!sel.value) sel.classList.add("placeholder");
					else sel.classList.remove("placeholder");
				}
				updateSelectColor();
				sel.addEventListener("input", updateSelectColor);
			}
			// update filter button label
			if (filterButton) {
				const $btn = $(filterButton);
				const $label = $btn.find(".button-label");
				if ($label && $label.length) $label.text("Filter");
			}
		}

		if (accountmanagerFilter) accountmanagerFilter.addEventListener("change", () => {
			// update active_status from element
			me.active_status = accountmanagerFilter.value || "";
			me.loadcustomer({ reset: true, saved_filters: me.saved_filters });
			updateUrlWithFilters(me.saved_filters);
		});
		if (territoryFilter) territoryFilter.addEventListener("change", () => {
			// update active_status from element
			me.active_status = territoryFilter.value || "";
			me.loadcustomer({ reset: true, saved_filters: me.saved_filters });
			updateUrlWithFilters(me.saved_filters);
		});
		if (customerGroupFilter) customerGroupFilter.addEventListener("change", () => {
			// update active_status from element
			me.active_status = customerGroupFilter.value || "";
			me.loadcustomer({ reset: true, saved_filters: me.saved_filters });
			updateUrlWithFilters(me.saved_filters);
		});

		if (customerNameFilter) customerNameFilter.addEventListener("input", () => {
			// update active_status from element
			me.active_status = customerNameFilter.value || "";
			me.loadcustomer({ reset: true, saved_filters: me.saved_filters });
			updateUrlWithFilters(me.saved_filters);
		});



		// Setup the popover handler (keeps most of your original logic)
		advancedFilterForm.find('.filter-button').on("click", async function (e) {
			me._suspend_on_change = true;
			e.preventDefault();
			e.stopPropagation();

			const $btn = $(this);
			if ($btn.data("bs.popover")) {
				teardownGuards($btn);
				$btn.popover("dispose");
				return;
			}

			let popover_content = $('<div class="filter-area">');
			await frappe.model.with_doctype("Customer");
			filter_group = new frappe.ui.FilterGroup({
				parent: popover_content,
				doctype: "Customer",
				on_change: function () {
					me.saved_filters = filter_group.get_filters();
					// immediate apply saved filters and reset list
					me.loadcustomer({ reset: true, saved_filters: me.saved_filters });
					update_filter_button_count($btn, me.saved_filters.length);
					updateUrlWithFilters(me.saved_filters);
				}
			});

			filter_group.update_filter_button = function () { };
			let lastDownInsidePopover = false;
			let lastDownOnRemove = false;

			function isDatepickerNode(node) {
				if (!node) return false;
				return !!node.closest && !!node.closest(
					'.flatpickr-calendar, .ui-datepicker, .datepicker, .bootstrap-datetimepicker-widget, .pika-single, .daterangepicker'
				);
			}

			function onDocMouseDownCapture(ev) {
				const inside = !!ev.target.closest(".filter-popover");
				const onRemove = !!ev.target.closest(".filter-popover .filter-remove, .filter-popover .remove-filter");
				const clickedDatepicker =
					isDatepickerNode(ev.target) ||
					(ev.composedPath && ev.composedPath().some(n => n && n.classList && (
						n.classList.contains('flatpickr-calendar') ||
						n.classList.contains('ui-datepicker') ||
						n.classList.contains('datepicker') ||
						n.classList.contains('bootstrap-datetimepicker-widget') ||
						n.classList.contains('pika-single') ||
						n.classList.contains('daterangepicker')
					)));

				lastDownInsidePopover = inside || clickedDatepicker;
				lastDownOnRemove = onRemove;
			}

			function onDatepickerPointerDown(ev) {
				if (isDatepickerNode(ev.target)) {
					lastDownInsidePopover = true;
				}
			}

			document.addEventListener("mousedown", onDocMouseDownCapture, true);
			document.addEventListener("pointerdown", onDatepickerPointerDown, true);

			popover_content.on("pointerdown", ".filter-remove, .remove-filter", function (ev) {
				ev.stopPropagation();
				lastDownInsidePopover = true;
				lastDownOnRemove = true;
			});

			setTimeout(() => {
				if (me.saved_filters && me.saved_filters.length) {
					filter_group.add_filters(me.saved_filters);
				} else {
					filter_group.add_filter("Customer", "name", "=", "", false);
				}
			}, 0);

			let footer = $(` 
					<div class="filter-action-buttons mt-1 flex justify-between items-center">
						<button class="text-muted add-filter btn btn-xs">+ Add a Filter</button>
						<div>
							<button class="btn btn-secondary btn-xs clear-filters mr-2">Clear</button>
							<button class="btn btn-primary btn-xs apply-filters">Apply</button>
						</div>
					</div>
				`);

			popover_content.find(".filter-action-buttons").remove();
			popover_content.append(footer);
			footer.find('.add-filter').off("click").on("click", () => filter_group.add_filter("Customer", "name", "=", "", false));

			// --- Popover: Clear button (explicitly reset UI + state + URL + fetch + close popover)
			footer.find('.clear-filters').off("click").on("click", () => {
				if (filter_group) filter_group.clear_filters();
				me.saved_filters = [];
				// me.clearBasicFilterUI();
				me._fetch_in_process = false;
				update_filter_button_count($btn, 0);
				updateUrlWithFilters([]);
				me.loadcustomer({ reset: true, saved_filters: [] });
				closePopover($btn, "clear-filters");
			});

			footer.find('.apply-filters').off("click").on("click", () => {
				if (filter_group) {
					me.saved_filters = filter_group.get_filters();
					me._fetch_in_process = false;
					updateUrlWithFilters(me.saved_filters);
					update_filter_button_count($btn, me.saved_filters.length);
					me.loadcustomer({ reset: true, saved_filters: me.saved_filters });
				}
				closePopover($btn, "apply-filters");
			});

			$btn.popover({
				html: true,
				placement: "bottom",
				content: popover_content,
				trigger: "manual",
				//container: "body",
				container: document.body,
				template: `
						<div class="popover filter-popover fade bs-popover-bottom" role="tooltip">
							<div class="arrow"></div>
							<div class="popover-body popover-content"></div>
						</div>
					`,
				popperConfig: {
					modifiers: [
						{ name: 'offset', options: { offset: [0, 4] } },
						{ name: 'arrow', options: { element: '.arrow', padding: 6 } },
						{ name: 'preventOverflow', options: { padding: 10, altBoundary: true, tether: false } }
					]
				}
			}).popover("show");

			setTimeout(() => {
				const calendars = document.querySelectorAll(".filter-popover .flatpickr-input");
				calendars.forEach(input => {
					if (input._flatpickr) input._flatpickr.destroy();
					flatpickr(input, { appendTo: document.body });
				});
			}, 300);

			function isInsidePopoverOrBtn(event) {
				if ($(event.target).closest(".filter-popover, .filter-button").length) return true;

				const oe = event.originalEvent || event;
				if (oe && typeof oe.composedPath === "function") {
					const path = oe.composedPath();
					if (path.some(node => node && node.classList && (
						node.classList.contains('filter-popover') ||
						node.classList.contains('filter-button') ||
						node.classList.contains('flatpickr-calendar') ||
						node.classList.contains('ui-datepicker') ||
						node.classList.contains('datepicker') ||
						node.classList.contains('bootstrap-datetimepicker-widget') ||
						node.classList.contains('pika-single') ||
						node.classList.contains('daterangepicker')
					))) {
						return true;
					}
				}
				if (isDatepickerNode(event.target)) return true;
				return false;
			}

			const onDocClick = function (event) {
				const pathInside = isInsidePopoverOrBtn(event);
				if (lastDownOnRemove || lastDownInsidePopover || pathInside) {
					lastDownOnRemove = false;
					return;
				}
				closePopover($btn, "outside-click");
			};

			$(document).on("click.filterPopover", onDocClick);
			$btn.data("guardHandlers", { onDocClick, onDocMouseDownCapture, onDatepickerPointerDown });

			function closePopover($btn, reason) {
				teardownGuards($btn);
				$btn.popover("dispose");
			}

			function teardownGuards($btn) {
				const guards = $btn.data("guardHandlers");
				if (guards) {
					$(document).off("click.filterPopover", guards.onDocClick);
					document.removeEventListener("mousedown", guards.onDocMouseDownCapture, true);
					document.removeEventListener("pointerdown", guards.onDatepickerPointerDown, true);
					$btn.removeData("guardHandlers");
				}
			}
		});

		// --- External Clear (top X) Button ---
		const clearFilterButton = document.querySelector('.filter-x-button');
		if (clearFilterButton) {
			clearFilterButton.addEventListener("click", () => {
				me.saved_filters = [];
				me.clearBasicFilterUI();
				me._fetch_in_process = false;
				me.loadcustomer({ reset: true, saved_filters: [] });
				localStorage.removeItem("customer_list_url_filters");
				update_filter_button_count(
					$(advancedFilterForm).find('.filter-button'),
					0
				);
				// ✅ FIX: call local function
				updateUrlWithFilters([]);
			});
		}


		// --- Helper ---
		function update_filter_button_count($btn, count) {
			let $label = $btn.find(".button-label");
			$label.text(count > 0 ? `Filter (${count})` : "Filter");
		}

		function updateUrlWithFilters(filters) {
			// re-use instance method for consistent behavior
			//me.updateUrlWithFilters(filters || []);
			try {
				const url = new URL(window.location.href);

				const territory = document.querySelector('[data-table-filter="territory"]')?.value || "";
				const account_mgr = document.querySelector('[data-table-filter="account_manager"]')?.value || "";
				const customer_grp = document.querySelector('[data-table-filter="customer_group"]')?.value || "";
				const customer_name = document.querySelector('[data-table-filter="customer_name"]')?.value?.trim() || "";

				// Basic filters
				territory ? url.searchParams.set("territory", territory) : url.searchParams.delete("territory");
				account_mgr ? url.searchParams.set("account_manager", account_mgr) : url.searchParams.delete("account_manager");
				customer_grp ? url.searchParams.set("customer_group", customer_grp) : url.searchParams.delete("customer_group");
				customer_name ? url.searchParams.set("customer_name", customer_name) : url.searchParams.delete("customer_name");

				// Advanced filters (JSON-encoded)
				if (filters && filters.length) {
					url.searchParams.set("filters", encodeURIComponent(JSON.stringify(filters)));
				} else {
					url.searchParams.delete("filters");
				}

				window.history.replaceState({}, "", url.toString());
			} catch (err) {
				console.error("updateUrlWithFilters error:", err);
			}
		}
		// --- FIX: Update filter button count on page load ---
		setTimeout(() => {
			const filterBtn = $(wrapper).find(".filter-button");
			if (filterBtn.length && me.saved_filters && me.saved_filters.length > 0) {
				update_filter_button_count(filterBtn, me.saved_filters.length);
			}
		}, 50);

	}


	applyUrlFilters() {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;

		// First, try to get filters from localStorage
		let qs = localStorage.getItem('customer_list_url_filters') || '';
		if (!window.location.search && qs) {
			console.log('Applying saved URL filters to address bar:', qs);
			window.history.replaceState({}, "", window.location.pathname + qs);
		}

		const param = new URLSearchParams(window.location.search);

		const territory = param.get("territory") || "";
		const account_mgr = param.get("account_manager") || "";
		const customer_grp = param.get("customer_group") || "";
		const customer_name = param.get("customer_name") || "";
		const filters_encoded = param.get("filters") || "";

		// Set basic filters in UI
		const territorySel = wrapper.querySelector('[data-table-filter="territory"]');
		const accountMgrSel = wrapper.querySelector('[data-table-filter="account_manager"]');
		const customerGrpSel = wrapper.querySelector('[data-table-filter="customer_group"]');
		const customerNameInput = wrapper.querySelector('input[data-table-filter="customer_name"]');

		if (territorySel) {
			territorySel.value = territory;
			this.syncPlaceholder(territorySel);
		}
		if (accountMgrSel) {
			accountMgrSel.value = account_mgr;
			this.syncPlaceholder(accountMgrSel);
		}
		if (customerGrpSel) {
			customerGrpSel.value = customer_grp;
			this.syncPlaceholder(customerGrpSel);
		}
		if (customerNameInput) {
			customerNameInput.value = customer_name;
			this.syncPlaceholder(customerNameInput);
		}

		this.active_filters.territory = territory;
		this.active_filters.account_manager = account_mgr;
		this.active_filters.customer_group = customer_grp;
		this.active_filters.customer_name = customer_name;

		let restored_saved_filters = [];

		// Decode advanced filters if present
		if (filters_encoded) {
			try {
				let decoded = decodeURIComponent(filters_encoded);
				let parsed = JSON.parse(decoded);

				restored_saved_filters = parsed.map(f => {
					if (f[2] === "Equals") f[2] = "=";
					if (f[2] === "Not Equal") f[2] = "!=";
					return [f[0], f[1], f[2], f[3], f[4] ?? false];
				});
			} catch (e) {
				console.error("Failed to decode advanced filters:", e);
			}
		}

		if (!this.saved_filters) {
			this.saved_filters = [];
		}

		this.saved_filters = restored_saved_filters;

		// ✅ FIX: Don't call loadcustomer here - it will be called by reloadList
		// Remove this line:
		this.loadcustomer({ reset: true, saved_filters: restored_saved_filters });
	}

	bindevents() {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
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

				this.page_length = parseInt(btn.dataset.value, 10);
				await this.loadcustomer({ reset: true });
			});
		});

		// Restore page_length from localStorage or default to 20
		const savedPageLength = localStorage.getItem('customers_page_length');
		this.page_length = savedPageLength ? parseInt(savedPageLength, 10) : 20;

		// Highlight the correct button based on saved/default page length
		const activeBtn = wrapper.querySelector(`.btn-paging[data-value="${this.page_length}"]`);
		if (activeBtn) {
			activeBtn.classList.add("btn-info", "active-pagination");
			activeBtn.style.backgroundColor = "#6C5CE7";
			activeBtn.style.color = "white";
		}

		// --- Load More button ---
		const loadMoreBtn = wrapper.querySelector(".btn-more");
		if (loadMoreBtn) {
			loadMoreBtn.addEventListener("click", async () => {
				loadMoreBtn.classList.add("active-pagination");
				loadMoreBtn.style.backgroundColor = "#E7E5F9";
				loadMoreBtn.style.color = "black";
				await this.loadcustomer({ reset: false });

				setTimeout(() => {
					loadMoreBtn.classList.remove("active-pagination");
					loadMoreBtn.style.backgroundColor = "";
					loadMoreBtn.style.color = "";
				}, 500);
			});
		}
	}

	syncPlaceholder(select) {
		if (!select) return;

		if (!select.value) {
			select.classList.add("placeholder");
		} else {
			select.classList.remove("placeholder");
		}
	}

	// ---- small utility: escape HTML for safety ----
	escapeHtml(str) {
		if (!str && str !== 0) return "";
		return String(str)
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&#039;");
	}

	applyActionPermissions(retries = 6, interval = 100) {
		const wrapper = this.page?.wrapper?.[0] || this.page?.wrapper;
		const actionsDropdown = wrapper?.querySelector("#actions-dropdown");
		if (!actionsDropdown) return;

		// Helper to compute effective perms from perm array
		const computePerms = (permArr) => {
			const effective = {
				read: false,
				write: false,
				create: false,
				delete: false,
				export: false,
				print: false
			};
			if (!Array.isArray(permArr)) return effective;
			permArr.forEach(p => {
				// p keys may be 1/0 or true/false; normalize with Boolean()
				for (const key of Object.keys(effective)) {
					if (p.hasOwnProperty(key) && Boolean(p[key])) {
						effective[key] = true;
					}
				}
			});
			return effective;
		};

		const apply = (permArr) => {
			const perm = computePerms(permArr);
			console.debug("applyActionPermissions - Issue perms:", permArr, "=> effective:", perm);

			// If user is Administrator always show (optional)
			if ((frappe?.user_roles || []).includes("Administrator")) {
				$(actionsDropdown).show();
			}

			// If user cannot read at all, hide dropdown completely
			if (!perm.read) {
				$(actionsDropdown).hide();
				return;
			} else {
				$(actionsDropdown).show();
			}

			// Write Permission → Assign + Apply Rule
			$(actionsDropdown).find('[data-action="assign_to"]').toggle(!!perm.write);
			$(actionsDropdown).find('[data-action="apply_rule"]').toggle(!!perm.write);

			// Create Permission → Edit & Add Tags
			$(actionsDropdown).find('[data-action="edit"]').toggle(!!perm.create);
			$(actionsDropdown).find('[data-action="add_tags"]').toggle(!!perm.create);

			// Delete Permission
			$(actionsDropdown).find('[data-action="delete"]').toggle(!!perm.delete);

			// Export Permission
			$(actionsDropdown).find('[data-action="export"]').toggle(!!perm.export);

			// Print Permission
			$(actionsDropdown).find('[data-action="print"]').toggle(!!perm.print);

			// If nothing visible, show tooltip or small info
			const visibleCount = $(actionsDropdown).find('.dropdown-item:visible').length;
			if (!visibleCount) {
				// you can hide entire dropdown or show a disabled message
				// here we keep dropdown visible but disable button
				$(actionsDropdown).find('.dropdown-toggle').prop('disabled', true);
				$(actionsDropdown).attr('title', 'No actions available for your permissions');
			} else {
				$(actionsDropdown).find('.dropdown-toggle').prop('disabled', false);
				$(actionsDropdown).removeAttr('title');
			}
		};

		// Try to get perms; if empty, retry a few times (permissions may load later)
		const permArr = frappe.perm.get_perm?.("Issue") || [];
		if (permArr && permArr.length) {
			apply(permArr);
		} else if (retries > 0) {
			// small retry loop
			setTimeout(() => this.applyActionPermissions(retries - 1, interval), interval);
		} else {
			// final fallback: try to use frappe.boot.perm (if available) or show nothing
			const bootPerm = (frappe.boot && frappe.boot.user && frappe.boot.user.can_read) ? frappe.boot.user : null;
			console.warn("applyActionPermissions: no perm rows returned for Issue after retries. fallback:", bootPerm);
			// safest fallback: hide restricted actions and show basic ones (read)
			apply(permArr);
		}
	}

	applyRoleBasedActionVisibility() {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;

		frappe.call({
			method: "renewal_module.custom_module.page.customers.customers.get_customer_permissions",
			callback: (r) => {
				if (r.message) {
					const has_write = r.message.write;
					const has_delete = r.message.delete;
					const has_export = r.message.export;
					const has_print = r.message.print;

					// Define which action requires which doctype-level permission
					const permissionMap = {
						"apply_rule": has_write,
						"edit": has_write,
						"assign_to": has_write,
						"export": has_export,
						"delete": has_delete,
						"add_tags": has_write,
						"print": has_print,
					};

					Object.keys(permissionMap).forEach(action => {
						const isAllowed = permissionMap[action];
						const item = wrapper.querySelector(`.dropdown-item[data-action="${action}"]`);
						if (!item) return;

						if (!isAllowed) {
							item.style.display = "none";
						} else {
							item.style.display = "";
						}
					});
				}
			}
		});
	}

	// ---- action dropdown handler ----
	bindActionDropdownHandler() {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const actionsDropdown = wrapper.querySelector("#actions-dropdown");

		if (!actionsDropdown) return;

		actionsDropdown.addEventListener("click", async (e) => {

			const item = e.target.closest(".dropdown-item");
			if (!item) return;
			e.preventDefault();
			const action = item.dataset.action;

			// ✔ Find selected row checkboxes (your table already uses row-check)
			const checkedBoxes = document.querySelectorAll('.customers-table tbody .row-check:checked');

			if (!checkedBoxes.length) {
				frappe.msgprint(__("Please select at least one Customer"));
				return;
			}

			// ✔ Extract customer IDs from selected checkboxes
			const customers = Array.from(checkedBoxes)
				.map(cb => cb.dataset.id)
				.filter(Boolean);

			if (!customers.length) {
				frappe.msgprint(__("No valid Customer IDs found."));
				return;
			}

			const doctype = "Customer";
			const me = this;
			function waitForConfirmModal(callback) {
				let tries = 0;
				const maxTries = 20;

				const check = () => {
					const $modal = $(".modal:visible");
					if ($modal.length) {
						callback($modal);
					} else if (tries < maxTries) {
						tries++;
						setTimeout(check, 20);
					}
				};

				check();
			}

			// ---------------------- ACTIONS ----------------------

			// ✅ Bulk Edit
			if (action === "edit") {
				frappe.model.with_doctype(doctype, () => {
					const fields = frappe.meta.get_docfields(doctype)
						.filter(df =>
							df.fieldname &&
							df.label &&
							!df.hidden &&
							!df.read_only &&
							df.fieldtype !== "Table"
						);

					const d = new frappe.ui.Dialog({
						title: __("Bulk Edit Customers"),
						fields: [
							{
								label: __("Field"),
								fieldname: "fieldname",
								fieldtype: "Select",
								options: fields.map(df => ({
									label: df.label,
									value: df.fieldname
								})),
								reqd: 1,
								onchange() {
									const fieldname = d.get_value("fieldname");
									if (!fieldname) return;
									const df = frappe.meta.get_docfield(doctype, fieldname);
									const wrapper = d.get_field("value_wrapper").$wrapper;
									wrapper.empty();

									d.__value_control = frappe.ui.form.make_control({
										df: {
											label: __("Value"),
											fieldname: "value",
											fieldtype: df.fieldtype,
											options: df.options || "",
											reqd: 1
										},
										parent: wrapper,
										render_input: true
									});
									d.__value_control.refresh();
								}
							},
							{ fieldtype: "HTML", fieldname: "value_wrapper" }
						],
						primary_action_label: __("Update {0} Customers", [customers.length]),
						primary_action() {
							const fieldname = d.get_value("fieldname");
							if (!d.__value_control) {
								frappe.msgprint(__("Please enter a value"));
								return;
							}

							const value = d.__value_control.get_value();
							d.hide();

							me.bulkUpdate(customers, { fieldname, value });
						}
					});

					d.show();
					setTimeout(() => {
						const closeBtn = d.get_close_btn();
						if (!closeBtn || !closeBtn.length) {
							return;
						}
						closeBtn.off("click.dialog").on("click.dialog", function () {
							d.hide();
						});
					}, 50);
				});
			}


			// -----------------------------------
			// DELETE CUSTOMERS
			// -----------------------------------
			else if (action === "delete") {
				frappe.confirm(
					__("Delete {0} selected Customers?", [customers.length]),
					() => {
						Promise.all(
							customers.map(name =>
								frappe.call({
									method: "frappe.client.delete",
									args: { doctype, name }
								})
							)
						).then(() => {
							frappe.show_alert({ message: __("Customers deleted"), indicator: "red" });
							me.resetActionBar();
							me.refreshAllData();
						});
					}
				);
				waitForConfirmModal(($modal) => {
					const $close = $modal.find(".btn-modal-close");
					$close.off("click.note-confirm").on("click.note-confirm", function (ev) {
						ev.preventDefault();
						ev.stopPropagation();
						try {
							$modal.modal("hide");
						} catch (err) {
							$modal.removeClass("show in").hide();
						}
						$(".modal-backdrop").remove();
					});
				});
			}

			else if (action === "assign_to") {
				let d = new frappe.ui.form.AssignToDialog({ doctype, docname: customers[0] });

				d.dialog.set_primary_action(__("Assign"), () => {
					const values = d.dialog.get_values();
					if (!values) return;
					d.dialog.hide();

					const calls = customers.map(name =>
						frappe.call({
							method: "frappe.desk.form.assign_to.add",
							args: {
								doctype,
								name,
								assign_to: values.assign_to,
								assign_to_me: values.assign_to_me,
								assign_to_user_group: values.assign_to_user_group,
								description: values.description,
								due_date: values.due_date,
								priority: values.priority,
								notify: values.notify || 0
							}
						})
					);

					Promise.allSettled(calls).then(() => {
						frappe.show_alert({ message: __("Assigned successfully"), indicator: "green" });
						me.resetActionBar();
						me.refreshAllData();
					});
				});

				d.dialog.show();
				setTimeout(() => {
					const closeBtn = d.dialog.get_close_btn();
					if (!closeBtn || !closeBtn.length) {
						return;
					}
					closeBtn.off("click.dialog").on("click.dialog", function () {
						d.dialog.hide();
					});
				}, 50);
			}
			else if (action === "add_tags") {
				const dialog = new frappe.ui.Dialog({
					title: __("Add Tags"),
					fields: [
						{
							fieldtype: "Link",
							fieldname: "tag",
							label: __("Tag"),
							options: "Tag",
							reqd: 1
						}
					],
					primary_action_label: __("Add"),
					primary_action(values) {
						dialog.hide();
						let promises = customers.map(name =>
							frappe.call({
								method: "frappe.desk.doctype.tag.tag.add_tag",
								args: { tag: values.tag, dt: doctype, dn: name }
							})
						);

						Promise.all(promises).then(() => {
							frappe.show_alert({ message: __("Tag added"), indicator: "green" });
							me.resetActionBar(); // 🔹 Fixed `this` reference
							me.refreshAllData();

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
			}
			else if (action === "apply_rule") {
				frappe.dom.freeze(__("Applying assignment rule..."));

				const calls = customers.map(name =>
					frappe.call({
						method: "renewal_module.custom_module.page.customers.customers.apply_assignment_rule",
						args: { doctype, name }
					})
				);

				Promise.allSettled(calls).then((res) => {
					frappe.dom.unfreeze();
					const failed = res.filter(r => r.status === "rejected" || r.value?.exc).length;
					if (failed) {
						frappe.msgprint(__("{0} records failed to apply assignment rule.", [failed]));
					} else {
						frappe.show_alert({ message: __("Assignment Rule applied"), indicator: "green" });
					}
					me.resetActionBar();
					me.refreshAllData();



				});
			}
			else if (action === "print") {
				frappe.model.with_doctype(doctype, () => {
					const print_formats = frappe.meta.get_print_formats
						? frappe.meta.get_print_formats(doctype)
						: ["Standard"];

					const d = new frappe.ui.Dialog({
						title: __("Bulk Print"),
						fields: [
							{
								label: __("Print Format"),
								fieldname: "print_format",
								fieldtype: "Select",
								options: print_formats.join("\n"),
								default: print_formats[0]
							},
							{
								label: __("With Letterhead"),
								fieldname: "with_letterhead",
								fieldtype: "Check",
								default: 1
							},
							{
								label: __("Letterhead (optional)"),
								fieldname: "letterhead",
								fieldtype: "Link",
								options: "Letter Head"
							}
						],
						primary_action_label: __("Open {0} Print Views", [customers.length]),
						primary_action(values) {
							d.hide();
							customers.forEach(name => {
								const params = new URLSearchParams({
									doctype,
									name,
									format: values.print_format || "Standard",
									no_letterhead: values.with_letterhead ? "0" : "1"
								});
								if (values.letterhead) params.set("letterhead", values.letterhead);
								window.open(`/printview?${params.toString()}`, "_blank");
							});
						}
					});

					d.show();
					setTimeout(() => {
						const closeBtn = d.get_close_btn();
						if (!closeBtn || !closeBtn.length) {
							return;
						}
						closeBtn.off("click.dialog").on("click.dialog", function () {
							d.hide();
						});
					}, 50);
				});
			}


			// Unknown action
			else {
				frappe.msgprint(__("Action '{0}' not implemented for Customer", [action]));
			}
		});
	}



	resetActionBar() {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const newBtn = wrapper.querySelector("#new-customers-btn");
		const actionsDropdown = wrapper.querySelector("#actions-dropdown");

		if (newBtn && actionsDropdown) {
			newBtn.classList.remove("d-none");
			actionsDropdown.classList.add("d-none");
		}

		// Clear customer selections
		this.selected_customers.clear();

		// Uncheck everything in DOM
		const checkboxes = document.querySelectorAll('.customers-table tbody .row-check');
		checkboxes.forEach(cb => (cb.checked = false));

		const selectAllCheckbox = document.querySelector("#customercheckAll");
		if (selectAllCheckbox) selectAllCheckbox.checked = false;
	}


	bulkUpdate(customers, updates) {
		return new Promise((resolve, reject) => {
			if (!customers.length) return resolve();

			frappe.dom.freeze(__("Updating Customers..."));

			const promises = customers.map(name =>
				frappe.call({
					method: "frappe.client.set_value",
					args: {
						doctype: "Customer",
						name,
						fieldname: updates.fieldname,
						value: updates.value
					}
				})
			);

			Promise.allSettled(promises)
				.then(async () => {
					frappe.dom.unfreeze();
					frappe.show_alert({ message: __("Customers updated successfully"), indicator: "green" });

					this.resetActionBar();

					// 👇 Refresh list once instead of twice
					await this.refreshAllData();

					resolve();
				})
				.catch((err) => {
					frappe.dom.unfreeze();
					console.error("Customer Bulk update failed:", err);
					reject(err);
				});
		});
	}

	openCustomerEditDialog({
		customerId,
		title = __("Edit Customer"),
		onAfterSave = null
	} = {}) {
		if (!customerId) {
			frappe.msgprint(__("Customer not found"));
			return;
		}

		const doctype = "Customer";
		frappe.model.with_doctype(doctype, () => {
			const fields = frappe.meta.get_docfields(doctype)
				.filter(df =>
					df.fieldname &&
					df.label &&
					!df.hidden &&
					!df.read_only &&
					df.fieldtype !== "Table"
				);

			const d = new frappe.ui.Dialog({
				title,
				fields: [
					{
						label: __("Field"),
						fieldname: "fieldname",
						fieldtype: "Select",
						options: fields.map(df => ({
							label: df.label,
							value: df.fieldname
						})),
						reqd: 1,
						onchange() {
							const fieldname = d.get_value("fieldname");
							if (!fieldname) return;
							const df = frappe.meta.get_docfield(doctype, fieldname);
							const wrapper = d.get_field("value_wrapper").$wrapper;
							wrapper.empty();

							d.__value_control = frappe.ui.form.make_control({
								df: {
									label: __("Value"),
									fieldname: "value",
									fieldtype: df.fieldtype,
									options: df.options || "",
									reqd: 1
								},
								parent: wrapper,
								render_input: true
							});
							d.__value_control.refresh();
						}
					},
					{ fieldtype: "HTML", fieldname: "value_wrapper" }
				],
				primary_action_label: __("Update Customer"),
				primary_action: () => {
					const fieldname = d.get_value("fieldname");
					if (!fieldname || !d.__value_control) {
						frappe.msgprint(__("Please select a field and enter a value"));
						return;
					}

					const value = d.__value_control.get_value();
					d.hide();

					frappe.call({
						method: "frappe.client.set_value",
						args: {
							doctype,
							name: customerId,
							fieldname,
							value
						},
						callback: () => {
							frappe.show_alert({ message: __("Customer updated successfully"), indicator: "green" });
							if (typeof onAfterSave === "function") {
								onAfterSave();
							}
						}
					});
				}
			});

			d.show();
			setTimeout(() => {
				const closeBtn = d.get_close_btn();
				if (!closeBtn || !closeBtn.length) {
					return;
				}
				closeBtn.off("click.dialog").on("click.dialog", function () {
					d.hide();
				});
			}, 50);
		});
	}

	async refreshAllData() {
		try {
			// Reset pagination + reload the list
			await this.loadcustomer({
				reset: true,
				saved_filters: this.saved_filters || []
			});
			setTimeout(() => {
				this.applyRoleBasedActionVisibility();
			}, 100);

		} catch (err) {
			console.error("[refreshAllData] Failed to refresh:", err);
		}
	}

	/**Customer Details */

	bindProfileTabs() {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const tabs = Array.from(wrapper.querySelectorAll(".profile-main-tabs > .tab-link"));
		const panels = Array.from(wrapper.querySelectorAll(".profile-main-tab-panels > [data-tab-panel]"));

		if (!tabs.length || !panels.length) return;

		const showTab = (tabName) => {
			tabs.forEach((tab) => {
				const isActive = tab.dataset.tab === tabName;
				tab.classList.toggle("active", isActive);
			});

			panels.forEach((panel) => {
				const isMatch = panel.dataset.tabPanel === tabName;
				panel.classList.toggle("d-none", !isMatch);
			});
		};

		tabs.forEach((tab) => {
			if (tab.dataset.bound === "1") return;
			tab.dataset.bound = "1";
			tab.addEventListener("click", (e) => {
				e.preventDefault();
				showTab(tab.dataset.tab);
			});
			tab.addEventListener("keydown", (e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					showTab(tab.dataset.tab);
				}
			});
		});

		const defaultTab = tabs.find((tab) => tab.classList.contains("active"))?.dataset.tab || tabs[0].dataset.tab;
		showTab(defaultTab);
	}

	bindOthersTabs() {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const othersPanel = wrapper.querySelector('[data-tab-panel="others"]');
		if (!othersPanel) return;

		const tabs = Array.from(othersPanel.querySelectorAll(".others-tabs .tab-link"));
		const panels = Array.from(othersPanel.querySelectorAll(".others-tab-panels > [data-tab-panel]"));
		if (!tabs.length || !panels.length) return;

		const showSubTab = (tabName) => {
			tabs.forEach((tab) => {
				const isActive = tab.dataset.tab === tabName;
				tab.classList.toggle("active", isActive);
			});

			panels.forEach((panel) => {
				const isMatch = panel.dataset.tabPanel === tabName;
				panel.classList.toggle("d-none", !isMatch);
			});
		};

		tabs.forEach((tab) => {
			if (tab.dataset.bound === "1") return;
			tab.dataset.bound = "1";
			tab.addEventListener("click", (e) => {
				e.preventDefault();
				showSubTab(tab.dataset.tab);
			});
			tab.addEventListener("keydown", (e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					showSubTab(tab.dataset.tab);
				}
			});
		});

		const defaultSubTab = tabs.find((tab) => tab.classList.contains("active"))?.dataset.tab || tabs[0].dataset.tab;
		showSubTab(defaultSubTab);
	}


	bindServicesToggle() {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const servicesPanel = wrapper.querySelector('[data-tab-panel="services"]');
		if (!servicesPanel) return;

		const activeBtn = servicesPanel.querySelector('[data-toggle-renewal="active"]');
		const newBtn = servicesPanel.querySelector('[data-toggle-renewal="new"]');
		const activeSection = servicesPanel.querySelector("#active-renewals-container");
		const newSection = servicesPanel.querySelector("#new-renewals-container");

		if (!activeBtn || !newBtn || !activeSection || !newSection) return;

		const toggleView = (view) => {
			if (view === "active") {
				const isActiveShown = !activeSection.classList.contains("d-none");
				if (isActiveShown) {
					// Hide active if already visible
					activeSection.classList.add("d-none");
					activeBtn.classList.remove("active");
				} else {
					// Show active and hide new
					activeSection.classList.remove("d-none");
					newSection.classList.add("d-none");
					activeBtn.classList.add("active");
					newBtn.classList.remove("active");
				}
			} else if (view === "new") {
				const isNewShown = !newSection.classList.contains("d-none");
				if (isNewShown) {
					// Hide new if already visible
					newSection.classList.add("d-none");
					newBtn.classList.remove("active");
				} else {
					// Show new and hide active
					newSection.classList.remove("d-none");
					activeSection.classList.add("d-none");
					newBtn.classList.add("active");
					activeBtn.classList.remove("active");
				}
			}
		};

		if (!activeBtn.dataset.bound) {
			activeBtn.dataset.bound = "1";
			activeBtn.addEventListener("click", () => toggleView("active"));
		}

		if (!newBtn.dataset.bound) {
			newBtn.dataset.bound = "1";
			newBtn.addEventListener("click", () => toggleView("new"));
		}

		// Hide both sections by default
		activeSection.classList.remove("d-none");
		newSection.classList.add("d-none");
		activeBtn.classList.add("active");
		newBtn.classList.remove("active");
	}

	bindStatsSection(customer_id) {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const statsSection = wrapper.querySelector(".stats-section");
		if (!statsSection) return;

		// Fetch and display stats
		this.loadCustomerStats(customer_id);
		this.loadFiscalYearFinancials(customer_id);

		// Bind collapse/expand functionality
		const statsHeader = statsSection.querySelector(".stats-header");
		const statsContent = statsSection.querySelector(".stats-content");
		const toggleIcon = statsSection.querySelector(".toggle-icon");

		// 🔹 Set default state: EXPANDED
		if (statsContent && toggleIcon) {
			statsContent.classList.remove("d-none");
			toggleIcon.classList.remove("fa-chevron-down");
			toggleIcon.classList.add("fa-chevron-up");
			toggleIcon.style.transform = "rotate(180deg)";
			toggleIcon.dataset.rotated = "180";
			toggleIcon.style.cursor = "pointer";
			toggleIcon.setAttribute("role", "button");
			toggleIcon.setAttribute("tabindex", "0");
		}

		if (statsHeader && statsContent && toggleIcon) {
			// Prevent double binding
			if (statsHeader.dataset.bound === "1") return;
			statsHeader.dataset.bound = "1";

			const toggleStats = () => {
				const isCollapsed = statsContent.classList.contains("d-none");

				if (isCollapsed) {
					// EXPAND
					statsContent.classList.remove("d-none");
					toggleIcon.classList.remove("fa-chevron-down");
					toggleIcon.classList.add("fa-chevron-up");
					// Force rotation update (180 degrees - pointing up)
					toggleIcon.style.transform = "rotate(180deg)";
					toggleIcon.dataset.rotated = "180";
				} else {
					// COLLAPSE
					statsContent.classList.add("d-none");
					toggleIcon.classList.remove("fa-chevron-up");
					toggleIcon.classList.add("fa-chevron-down");
					// Force rotation update (0 degrees - pointing down)
					toggleIcon.style.transform = "rotate(0deg)";
					toggleIcon.dataset.rotated = "0";
				}
			};

			toggleIcon.addEventListener("click", (e) => {
				e.preventDefault();
				e.stopPropagation();
				toggleStats();
			});

			statsHeader.style.cursor = "pointer";
			statsHeader.addEventListener("click", (e) => {
				if (e.target.closest("a, button")) return;
				toggleStats();
			});

			toggleIcon.addEventListener("keydown", (e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					toggleStats();
				}
			});
		}
	}

	loadCustomerStats(customer_id) {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const annualBillingEl = wrapper.querySelector(".annual-billing-value");
		const totalUnpaidEl = wrapper.querySelector(".total-unpaid-value");

		if (!annualBillingEl || !totalUnpaidEl) return;

		// Show loading state
		annualBillingEl.innerHTML = '<i class="fa fa-spinner fa-spin"></i>';
		totalUnpaidEl.innerHTML = '<i class="fa fa-spinner fa-spin"></i>';

		// Fetch customer stats
		frappe.call({
			method: "renewal_module.custom_module.page.customers.customers.get_customer_stats",
			args: {
				customer_id: customer_id
			},
			callback: (r) => {
				if (r.message) {
					const stats = r.message;
					const currency = frappe.defaults.get_default("currency") || "INR";
					const currencySymbol = this.getCurrencySymbol(currency);

					// Format and display annual billing
					const annualBilling = stats.annual_billing || 0;
					annualBillingEl.textContent = currencySymbol + this.formatCurrency(annualBilling);

					// Format and display total unpaid
					const totalUnpaid = stats.total_unpaid || 0;
					totalUnpaidEl.textContent = currencySymbol + this.formatCurrency(totalUnpaid);

					// Add color styling based on amount
					if (totalUnpaid > 0) {
						totalUnpaidEl.classList.add("text-danger");
					} else {
						totalUnpaidEl.classList.add("text-success");
					}

					if (annualBilling > 0) {
						annualBillingEl.classList.add("text-primary");
					}
				} else {
					annualBillingEl.textContent = "₹0.00";
					totalUnpaidEl.textContent = "₹0.00";
				}
			},
			error: (err) => {
				console.error("Error fetching customer stats:", err);
				annualBillingEl.textContent = "Error";
				totalUnpaidEl.textContent = "Error";
			}
		});
	}

	loadFiscalYearFinancials(customer_id) {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const filter = wrapper.querySelector(".fiscal-year-select");
		const container = wrapper.querySelector(".fiscal-financials-body");
		const ALL_FY_VALUE = "__all__";
		if (!container) return;

		container.innerHTML = '<div class="text-center py-3 text-muted"><i class="fa fa-spinner fa-spin"></i> Loading fiscal year summary...</div>';

		frappe.call({
			method: "renewal_module.custom_module.page.customers.customers.get_customer_fiscal_year_financials",
			args: {
				customer_id: customer_id
			},
			callback: (r) => {
				const payload = r && r.message ? r.message : {};
				const rows = Array.isArray(payload.rows) ? payload.rows : [];
				const currency = payload.currency || frappe.defaults.get_default("currency") || "INR";

				if (!rows.length) {
					if (filter) {
						filter.innerHTML = '<option value="">No Fiscal Year</option>';
						filter.disabled = true;
					}
					container.innerHTML = '<div class="text-center py-3 text-muted"><i class="fa fa-inbox"></i> No fiscal year financial data found.</div>';
					return;
				}

				this.fiscalFinancialsState = {
					rows,
					currency,
					selectedFiscalYear: rows[0]?.fiscal_year || ALL_FY_VALUE,
					allValue: ALL_FY_VALUE,
				};

				if (frappe?.datetime?.get_today) {
					const today = frappe.datetime.get_today();
					const todayDate = new Date(today);
					const currentFY = rows.find((row) => {
						if (!row?.year_start_date || !row?.year_end_date) return false;
						const start = new Date(row.year_start_date);
						const end = new Date(row.year_end_date);
						return todayDate >= start && todayDate <= end;
					});
					if (currentFY?.fiscal_year) {
						this.fiscalFinancialsState.selectedFiscalYear = currentFY.fiscal_year;
					}
				}

				if (filter) {
					const options = rows.map((row) => {
						const fy = this.escapeHtml(row.fiscal_year || "");
						return `<option value="${fy}">${fy}</option>`;
					}).join("");

					filter.innerHTML = `<option value="${ALL_FY_VALUE}">All</option>${options}`;
					filter.disabled = false;
					filter.value = this.fiscalFinancialsState.selectedFiscalYear;

					if (filter.dataset.bound !== "1") {
						filter.dataset.bound = "1";
						filter.addEventListener("change", (e) => {
							if (!this.fiscalFinancialsState) return;
							this.fiscalFinancialsState.selectedFiscalYear = e.target.value || ALL_FY_VALUE;
							this.renderFiscalYearFinancialModel();
						});
					}
				}

				this.renderFiscalYearFinancialModel();
			},
			error: (err) => {
				console.error("Error loading fiscal year financial summary:", err);
				if (filter) {
					filter.innerHTML = '<option value="">Error</option>';
					filter.disabled = true;
				}
				container.innerHTML = '<div class="text-center py-3 text-danger"><i class="fa fa-exclamation-triangle"></i> Failed to load fiscal year summary.</div>';
			}
		});
	}

	renderFiscalYearFinancialModel() {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const container = wrapper.querySelector(".fiscal-financials-body");
		const state = this.fiscalFinancialsState || {};
		const rows = Array.isArray(state.rows) ? state.rows : [];
		const allValue = state.allValue || "__all__";
		if (!container || !rows.length) return;

		const isAllSelected = state.selectedFiscalYear === allValue;
		const selected = isAllSelected
			? {
				fiscal_year: "All Fiscal Years",
				year_start_date: rows
					.map((row) => row.year_start_date)
					.filter(Boolean)
					.sort()[0] || null,
				year_end_date: rows
					.map((row) => row.year_end_date)
					.filter(Boolean)
					.sort()
					.slice(-1)[0] || null,
				billing_amount: rows.reduce((acc, row) => acc + (parseFloat(row.billing_amount || 0) || 0), 0),
				payment_amount: rows.reduce((acc, row) => acc + (parseFloat(row.payment_amount || 0) || 0), 0),
				outstanding_amount: rows.reduce((acc, row) => acc + (parseFloat((row.unpaid_amount ?? row.outstanding_amount) || 0) || 0), 0),
				unpaid_amount: rows.reduce((acc, row) => acc + (parseFloat((row.unpaid_amount ?? row.outstanding_amount) || 0) || 0), 0),
			}
			: rows.find((row) => row.fiscal_year === state.selectedFiscalYear) || rows[0];
		if (!selected) return;

		const symbol = this.getCurrencySymbol(state.currency || "INR");
		const billingNum = parseFloat(selected.billing_amount || 0) || 0;
		const paymentNum = parseFloat(selected.payment_amount || 0) || 0;
		const outstandingNum = parseFloat((selected.unpaid_amount ?? selected.outstanding_amount) || 0) || 0;

		const billing = this.formatCurrency(billingNum);
		const payment = this.formatCurrency(paymentNum);
		const outstanding = this.formatCurrency(outstandingNum);
		const fyLabel = this.escapeHtml(selected.fiscal_year || "-");

		const formatDate = (dateVal) => {
			if (!dateVal) return "-";
			if (frappe?.datetime?.str_to_user) return frappe.datetime.str_to_user(String(dateVal));
			return this.escapeHtml(String(dateVal));
		};

		container.innerHTML = `
			<!--<div class="fy-model-title">Selected FY: ${fyLabel}</div>-->
			<div class="fy-model-grid">
				<div class="fy-model-cell billing">
					<span class="label">Billing</span>
					<span class="value">${symbol}${billing}</span>
				</div>
				<div class="fy-model-cell payment">
					<span class="label">Payment</span>
					<span class="value">${symbol}${payment}</span>
				</div>
				<div class="fy-model-cell outstanding">
					<span class="label">Balance (Unpaid)</span>
					<span class="value">${symbol}${outstanding}</span>
				</div>
				
			</div>
		`;
	}

	getCurrencySymbol(currency) {
		const symbols = {
			"INR": "₹",
			"USD": "$",
			"EUR": "€",
			"GBP": "£",
			"JPY": "¥"
		};
		return symbols[currency] || currency + " ";
	}

	formatCurrency(amount) {
		if (typeof amount !== "number") {
			amount = parseFloat(amount) || 0;
		}
		return amount.toLocaleString("en-IN", {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		});
	}

	loadRenewalDashboard(customer_id) {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const renewalSection = wrapper.querySelector(".renewal-dashboard-section");
		if (!renewalSection) return;

		// Bind toggle functionality
		this.bindRenewalDashboardToggle(renewalSection);

		// Fetch renewal summary data
		frappe.call({
			method: "renewal_module.custom_module.page.customers.customers.get_renewal_summary",
			args: {
				customer_id: customer_id
			},
			callback: (r) => {
				if (r.message) {
					this.renderRenewalDashboard(renewalSection, r.message, customer_id);
				}
			},
			error: (err) => {
				console.error("Error loading renewal dashboard:", err);
				const container = wrapper.querySelector("#renewal-summary-container");
				if (container) {
					container.innerHTML = '<div class="renewal-empty-state"><i class="fa fa-exclamation-triangle"></i><p>Unable to load renewal data</p></div>';
				}
			}
		});
	}

	bindRenewalDashboardToggle(section) {
		if (section.dataset.bound === "1") return;
		section.dataset.bound = "1";

		const header = section.querySelector(".renewal-dashboard-header");
		const content = section.querySelector(".renewal-dashboard-content");
		const toggleIcon = section.querySelector(".renewal-dashboard-header .toggle-icon");

		if (!header || !content || !toggleIcon) return;

		// Set default state: EXPANDED
		content.classList.remove("d-none");
		toggleIcon.classList.add("fa-chevron-up");
		toggleIcon.classList.remove("fa-chevron-down");

		const toggle = () => {
			const isCollapsed = content.classList.contains("d-none");

			if (isCollapsed) {
				content.classList.remove("d-none");
				toggleIcon.classList.add("fa-chevron-up");
				toggleIcon.classList.remove("fa-chevron-down");
				toggleIcon.style.transform = "rotate(0deg)";
			} else {
				content.classList.add("d-none");
				toggleIcon.classList.remove("fa-chevron-up");
				toggleIcon.classList.add("fa-chevron-down");
				toggleIcon.style.transform = "rotate(180deg)";
			}
		};

		header.style.cursor = "pointer";
		header.addEventListener("click", (e) => {
			e.preventDefault();
			toggle();
		});

		toggleIcon.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();
			toggle();
		});

		toggleIcon.addEventListener("keydown", (e) => {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault();
				toggle();
			}
		});
	}

	renderRenewalDashboard(section, data, customer_id) {
		// Get status counts from new data structure
		const statusCounts = data.status_counts || {};
		const expiringSoonCount = data.expiring_soon_count || 0;
		const totalCount = data.total_count || 0;
		
		// Update metric counts at the top
		section.querySelector(".active-renewals-count").textContent = statusCounts["Active"] || 0;
		section.querySelector(".expiring-soon-count").textContent = expiringSoonCount;
		section.querySelector(".new-opp-count").textContent = statusCounts["New Opp"] || 0;

		// Get the content container
		const content = section.querySelector(".renewal-dashboard-content");
		if (!content) return;

		// Get all renewals from new data structure
		const allRenewalsData = data.all_renewals || [];
		
		// Status configuration with colors and labels
		const statusConfig = {
			"New Opp": { label: "New Opportunity", color: "#3498db", bg: "#d1ecf1" },
			"Active": { label: "Active", color: "#27ae60", bg: "#d4edda" },
			"Draft": { label: "Draft", color: "#6c757d", bg: "#e9ecef" },
			"Awaiting Response": { label: "Awaiting Response", color: "#f39c12", bg: "#fef3cd" },
			"Cofed": { label: "Cofed", color: "#9b59b6", bg: "#e8daef" },
			"Duplicate": { label: "Duplicate", color: "#95a5a6", bg: "#f5f5f5" },
			"Renewed": { label: "Renewed", color: "#16a085", bg: "#d0ece8" },
			"Upgraded": { label: "Upgraded", color: "#8e44ad", bg: "#e8daef" },
			"Void": { label: "Void", color: "#7f8c8d", bg: "#d5d8dc" },
			"Lost": { label: "Lost", color: "#c0392b", bg: "#fadbd8" },
			"Cancelled": { label: "Cancelled", color: "#e74c3c", bg: "#fadbd8" },
			"Competitor Sales": { label: "Competitor Sales", color: "#d35400", bg: "#fdebd0" },
			"Auto Created": { label: "Auto Created", color: "#1abc9c", bg: "#d4efdf" },
			"Out Of Business": { label: "Out Of Business", color: "#34495e", bg: "#d5d8dc" },
			"Product Changed": { label: "Product Changed", color: "#e67e22", bg: "#fdebd0" }
		};
		
		// Process all renewals with computed status
		let allRenewals = allRenewalsData.map(r => {
			const config = statusConfig[r.status] || { label: r.status, color: "#6c757d", bg: "#e9ecef" };
			let displayStatus = r.status;
			let statusColor = config.color;
			
			// Override for computed expiring/expired status
			if (r.computed_status === "expiring") {
				displayStatus = "Expiring Soon";
				statusColor = "#f39c12";
			} else if (r.computed_status === "expired") {
				displayStatus = "Expired";
				statusColor = "#e74c3c";
			}
			
			return {
				...r,
				status_label: displayStatus,
				status_color: statusColor,
				days_left: r.days_left
			};
		});

		// Sort: Expiring first, then Active, then by status
		allRenewals.sort((a, b) => {
			if (a.computed_status === 'expiring' && b.computed_status !== 'expiring') return -1;
			if (b.computed_status === 'expiring' && a.computed_status !== 'expiring') return 1;
			if (a.status === 'Active' && b.status !== 'Active') return -1;
			if (b.status === 'Active' && a.status !== 'Active') return 1;
			if (a.status === 'New Opp' && b.status !== 'New Opp') return -1;
			if (b.status === 'New Opp' && a.status !== 'New Opp') return 1;
			return 0;
		});

		// Calculate filter counts
		const expiringRenewals = allRenewals.filter(r => r.computed_status === 'expiring');
		const activeOnlyRenewals = allRenewals.filter(r => r.status === 'Active' && r.computed_status !== 'expiring');
		const newOppRenewals = allRenewals.filter(r => r.status === 'New Opp');
		const renewedRenewals = allRenewals.filter(r => r.status === 'Renewed');
		const otherRenewals = allRenewals.filter(r => !['Active', 'New Opp', 'Renewed'].includes(r.status) && r.computed_status !== 'expiring');
		
		// Build status cards HTML for all statuses with count > 0
		let statusCardsHtml = '';
		const activeStatuses = Object.entries(statusCounts)
			.filter(([status, count]) => count > 0)
			.sort((a, b) => b[1] - a[1]); // Sort by count descending
		
		// Create status filter buttons
		let filterTabsHtml = `
			<button class="renewal-filter-btn active" data-filter="all" style="padding: 6px 14px; border: 1px solid #e9ecef; background: #667eea; color: white; border-radius: 20px; cursor: pointer; font-size: 12px; font-weight: 500;">
				All (${totalCount})
			</button>
			<button class="renewal-filter-btn" data-filter="expiring" style="padding: 6px 14px; border: 1px solid #e9ecef; background: white; color: #856404; border-radius: 20px; cursor: pointer; font-size: 12px; font-weight: 500;">
				Expiring Soon (${expiringRenewals.length})
			</button>
			<button class="renewal-filter-btn" data-filter="Active" style="padding: 6px 14px; border: 1px solid #e9ecef; background: white; color: #155724; border-radius: 20px; cursor: pointer; font-size: 12px; font-weight: 500;">
				Active (${statusCounts["Active"] || 0})
			</button>
			<button class="renewal-filter-btn" data-filter="New Opp" style="padding: 6px 14px; border: 1px solid #e9ecef; background: white; color: #0c5460; border-radius: 20px; cursor: pointer; font-size: 12px; font-weight: 500;">
				New Opp (${statusCounts["New Opp"] || 0})
			</button>
			<button class="renewal-filter-btn" data-filter="Renewed" style="padding: 6px 14px; border: 1px solid #e9ecef; background: white; color: #16a085; border-radius: 20px; cursor: pointer; font-size: 12px; font-weight: 500;">
				Renewed (${statusCounts["Renewed"] || 0})
			</button>
			<button class="renewal-filter-btn" data-filter="others" style="padding: 6px 14px; border: 1px solid #e9ecef; background: white; color: #6c757d; border-radius: 20px; cursor: pointer; font-size: 12px; font-weight: 500;">
				Others (${otherRenewals.length})
			</button>
		`;
		
		// Build the HTML
		let renewalsHtml = '';
		
		if (totalCount === 0) {
			renewalsHtml = `
				<div class="renewal-empty-state" style="text-align: center; padding: 30px; color: #6c757d;">
					<i class="fa fa-inbox" style="font-size: 48px; margin-bottom: 10px;"></i>
					<p style="font-size: 16px;">No renewals found for this customer</p>
				</div>
			`;
		} else {
			// Build a compact table view for all renewals
			renewalsHtml = `
				<div class="renewal-summary-header hidden" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; padding: 10px 15px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px; color: white;">
					<div style="display: flex; align-items: center; gap: 10px;">
						<i class="fa fa-list" style="font-size: 18px;"></i>
						<span style="font-weight: 600; font-size: 15px;">All Renewals (${totalCount})</span>
					</div>
					
				</div>
				
				<!-- Filter tabs -->
				<div class="renewal-filter-tabs" style="display: flex; gap: 8px; margin-bottom: 15px; flex-wrap: wrap;">
					${filterTabsHtml}
				</div>
				
				<!-- Renewal table shell -->
				<div class="renewal-table-shell">
					<div class="renewal-table-header">
						<div><i class="fa fa-cube"></i> Product</div>
						<div><i class="fa fa-tag"></i> Status</div>
						<div><i class="fa fa-calendar-plus-o"></i> Start</div>
						<div><i class="fa fa-calendar-check-o"></i> End</div>
						<div><i class="fa fa-hourglass-half"></i> Days Left</div>
					</div>
					
					<div class="renewal-list-container">
						${allRenewals.map(r => this.getRenewalTableRowHtml(r, customer_id)).join('')}
					</div>
				</div>
			`;
		}

		// View all link
		let viewAllHtml = '';
		if (totalCount > 0) {
			viewAllHtml = `
				<div class="renewal-view-all" style="text-align: center; margin-top: 15px; padding-top: 15px; border-top: 1px solid #e9ecef;">
					<a href="/app/renewal-list?customer=${encodeURIComponent(customer_id)}" 
					   target="_blank"
					   style="color: #667eea; font-weight: 600; text-decoration: none; display: inline-flex; align-items: center; gap: 5px; padding: 8px 16px; border: 1px solid #667eea; border-radius: 6px;">
						<i class="fa fa-external-link"></i> View All Renewals in List
					</a>
				</div>
			`;
		}

		// Build status cards for key statuses
		const keyStatuses = [
			{ key: "Active", label: "Active Renewals", icon: "fa-check-circle", color: "#27ae60", bg: "#d4edda" },
			{ key: "New Opp", label: "New Opportunities", icon: "fa-lightbulb-o", color: "#3498db", bg: "#d1ecf1" },
			{ key: "Renewed", label: "Renewed", icon: "fa-refresh", color: "#16a085", bg: "#d0ece8" },
			{ key: "Others", label: "Others", icon: "fa-ellipsis-h", color: "#6c757d", bg: "#f1f3f5" },
			{ key: "Expired", label: "Expired", icon: "fa-calendar-times-o", color: "#e74c3c", bg: "#fadbd8" }
		];
		
		let metricsCardsHtml = '';
		keyStatuses.forEach(ks => {
			const count = ks.key === "Expired" ? expiringRenewals.filter(r => r.computed_status === 'expired').length : ks.key === "Others" ? otherRenewals.length : statusCounts[ks.key] || 0;
			if (count > 0 || ["Active", "New Opp", "Renewed", "Others"].includes(ks.key)) {
				metricsCardsHtml += `
					<div class="renewal-metric-card" style="background: linear-gradient(135deg, ${ks.bg} 0%, ${ks.bg}100%); padding: 15px; border-radius: 10px; border-left: 4px solid ${ks.color};">
						<div class="metric-header" style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
							<i class="fa ${ks.icon}" style="color: ${ks.color}; font-size: 18px;"></i>
							<span class="metric-label" style="font-weight: 600; color: ${ks.color};">${ks.label}</span>
						</div>
						<div class="metric-value" style="font-size: 28px; font-weight: 700; color: ${ks.color};">${count}</div>
					</div>
				`;
			}
		});
		
		// Add expiring soon card
		metricsCardsHtml += `
			<div class="renewal-metric-card" style="background: linear-gradient(135deg, #fef3cd 0%, #fff3cd 100%); padding: 15px; border-radius: 10px; border-left: 4px solid #f39c12;">
				<div class="metric-header" style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
					<i class="fa fa-calendar" style="color: #f39c12; font-size: 18px;"></i>
					<span class="metric-label" style="font-weight: 600; color: #856404;">Expiring Soon</span>
				</div>
				<div class="metric-value" style="font-size: 28px; font-weight: 700; color: #856404;">${expiringSoonCount}</div>
			</div>
		`;

		// Update the content
		content.innerHTML = `
			<div class="renewal-metrics-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 15px; margin-bottom: 20px;">
				${metricsCardsHtml}
			</div>
			<div class="renewal-detailed-list">
				${renewalsHtml}
				${viewAllHtml}
			</div>
		`;

		// Add click handlers for filter tabs
		this.bindRenewalFilterEvents(content, allRenewals, customer_id);
		
		// Add click handlers for renewal items
		content.querySelectorAll(".renewal-table-row").forEach(row => {
			row.addEventListener("click", (e) => {
				if (e.target.closest(".renewal-action-btn")) return;
				const renewalId = row.dataset.renewalId;
				if (renewalId) {
					frappe.route_options = { customer: customer_id };
					frappe.set_route("Form", "Renewal List", renewalId);
				}
			});
			row.style.cursor = "pointer";
		});
	}

	// Helper method for table row HTML
	getRenewalTableRowHtml(renewal, customer_id) {
		const daysLeftText = renewal.days_left !== null 
			? (renewal.days_left <= 0 ? 'Expired' : `${renewal.days_left}`)
			: '-';
		
		const daysLeftClass = renewal.days_left !== null
			? (renewal.days_left <= 0 ? 'text-danger' : renewal.days_left <= 30 ? 'text-warning' : 'text-success')
			: '';
		
		const startDate = renewal.start_date ? this.formatDate(renewal.start_date) : '-';
		const endDate = renewal.end_date ? this.formatDate(renewal.end_date) : '-';
		const statusText = renewal.status_label || renewal.status || '-';
		
		return `
			<div class="renewal-table-row" data-renewal-id="${renewal.renewal_id}" 
				 style="display: grid; grid-template-columns: minmax(220px, 2.2fr) minmax(140px, 1.1fr) minmax(120px, 1fr) minmax(120px, 1fr) minmax(110px, 0.9fr); gap: 10px; padding: 12px; border-bottom: 1px solid #f0f0f0; align-items: center; transition: background 0.2s;"
				 onmouseover="this.style.background='#f8f9fa';"
				 onmouseout="this.style.background='white';">
				<div class="renewal-product-cell" title="${this.escapeHtml(renewal.product_name || 'N/A')}">${this.escapeHtml(renewal.product_name || 'N/A')}</div>
				<div style="display: flex; align-items: center;">
					<span class="badge" style="background: ${renewal.status_color}; color: white; font-size: 10px; padding: 2px 8px; border-radius: 999px; min-width: 58px; text-align: center;">${this.escapeHtml(statusText)}</span>
				</div>
				<div style="font-size: 12px; color: #6c757d;">${startDate}</div>
				<div style="font-size: 12px; color: #6c757d;">${endDate}</div>
				<div style="font-size: 13px; font-weight: 600; color: ${renewal.days_left !== null ? (renewal.days_left <= 0 ? '#e74c3c' : renewal.days_left <= 30 ? '#f39c12' : '#27ae60') : '#6c757d'};">
					${daysLeftText} ${renewal.days_left !== null && renewal.days_left > 0 ? 'days' : ''}
				</div>
			</div>
		`;
	}

	// Bind filter tab events
	bindRenewalFilterEvents(content, allRenewals, customer_id) {
		const filterBtns = content.querySelectorAll(".renewal-filter-btn");
		const listContainer = content.querySelector(".renewal-list-container");
		if (!listContainer) return;
		const tableShell = content.querySelector(".renewal-table-shell");
		if (tableShell) {
			tableShell.classList.add("renewal-table-scroll");
		}
		
		filterBtns.forEach(btn => {
			btn.addEventListener("click", () => {
				// Update active state
				filterBtns.forEach(b => {
					b.classList.remove("active");
					b.style.background = "white";
					b.style.color = "#495057";
				});
				btn.classList.add("active");
				btn.style.background = "#667eea";
				btn.style.color = "white";
				
				// Filter renewals
				const filter = btn.dataset.filter;
				let filteredRenewals = allRenewals;
				
				if (filter === 'expiring') {
					filteredRenewals = allRenewals.filter(r => r.computed_status === 'expiring');
				} else if (filter === 'Active') {
					filteredRenewals = allRenewals.filter(r => r.status === 'Active' && r.computed_status !== 'expiring');
				} else if (filter === 'New Opp') {
					filteredRenewals = allRenewals.filter(r => r.status === 'New Opp');
				} else if (filter === 'Renewed') {
					filteredRenewals = allRenewals.filter(r => r.status === 'Renewed');
				} else if (filter === 'others') {
					filteredRenewals = allRenewals.filter(r => !['Active', 'New Opp', 'Renewed'].includes(r.status) && r.computed_status !== 'expiring');
				} else if (filter === 'all') {
					filteredRenewals = allRenewals;
				} else {
					// Filter by other status values
					filteredRenewals = allRenewals.filter(r => r.status === filter);
				}
				
				// Re-render list
				listContainer.innerHTML = filteredRenewals.map(r => this.getRenewalTableRowHtml(r, customer_id)).join('');
				
				// Add click handlers to new rows
				listContainer.querySelectorAll(".renewal-table-row").forEach(row => {
					row.addEventListener("click", (e) => {
						const renewalId = row.dataset.renewalId;
						if (renewalId) {
							frappe.route_options = { customer: customer_id };
							frappe.set_route("Form", "Renewal List", renewalId);
						}
					});
					row.style.cursor = "pointer";
				});
			});
		});
	}

	formatDate(dateString) {
		if (!dateString) return "N/A";
		if (frappe?.datetime?.str_to_user) {
			return frappe.datetime.str_to_user(dateString);
		}
		const date = new Date(dateString);
		return date.toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" });
	}

	loadRecentActivities(customer_id) {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const activityCard = wrapper.querySelector(".recent-activity-card");
		if (!activityCard) return;

		const activityBody = activityCard.querySelector(".card-body");
		if (!activityBody) return;

		// Initialize pagination state
		if (!this.recentActivitiesState) {
			this.recentActivitiesState = {
				allActivities: [],
				displayedCount: 0,
				itemsPerPage: 20
			};
		}

		// Show loading state
		activityBody.innerHTML = '<div class="text-center py-3"><i class="fa fa-spinner fa-spin"></i> Loading Audit Logs...</div>';

		frappe.call({
			method: "renewal_module.custom_module.page.customers.customers.get_recent_activities",
			args: { customer_id: customer_id },
			callback: (r) => {
				if (r.message && r.message.length > 0) {
					// Store all activities
					this.recentActivitiesState.allActivities = r.message;
					this.recentActivitiesState.displayedCount = 0;

					// Render initial 20 activities
					this.renderRecentActivities(activityBody);
				} else {
					activityBody.innerHTML = '<div class="text-center py-3 text-muted"><i class="fa fa-inbox"></i> No Audit Logs found</div>';
				}
			},
			error: (err) => {
				console.error("Error loading Audit Logs:", err);
				activityBody.innerHTML = '<div class="text-center py-3 text-danger"><i class="fa fa-exclamation-triangle"></i> Error loading Audit Logs</div>';
			}
		});
	}

	renderRecentActivities(activityBody) {
		const state = this.recentActivitiesState;
		const startIdx = state.displayedCount;
		const endIdx = Math.min(startIdx + state.itemsPerPage, state.allActivities.length);
		const activitiesToShow = state.allActivities.slice(startIdx, endIdx);

		// Check if this is initial load or load more
		const isInitialLoad = state.displayedCount === 0;

		let activitiesContainer;
		if (isInitialLoad) {
			// Create new container with scrollable area
			activityBody.innerHTML = '<div class="activities-container"></div>';
			activitiesContainer = activityBody.querySelector('.activities-container');
		} else {
			// Get existing container
			activitiesContainer = activityBody.querySelector('.activities-container');
		}

		// Add new activities
		activitiesToShow.forEach((activity, index) => {
			const details = activity.details;
			const doctype = activity.doctype;

			// Determine which date field to use based on doctype
			let dateField = activity.creation;
			if (doctype === "Opportunity") {
				dateField = details.creation;
			}
			else if (doctype === "Quotation" || doctype === "Customer Order Form" || doctype === "Sales Order") {
				dateField = details.delivery_date || activity.creation;
			}
			else if (doctype === "Sales Invoice" || doctype === "Payment Entry") {
				dateField = details.posting_date || activity.creation;
			}
			else if (doctype === "Issue" || doctype === "Call List") {
				dateField = details.creation;
			}
			else if (doctype === "Renewal List") {
				dateField = activity.creation;
			}

			const modifiedDate = moment(dateField).fromNow();

			let extraInfo = '';

			// Doctype-specific field display logic
			if (doctype === "Opportunity") {
				if (details.total) {
					extraInfo = `<span class="activity-amount">₹${this.formatCurrency(details.total)}</span>`;
				}
			}
			else if (doctype === "Quotation" || doctype === "Customer Order Form" || doctype === "Sales Order" || doctype === "Sales Invoice") {
				if (details.grand_total) {
					extraInfo = `<span class="activity-amount">₹${this.formatCurrency(details.grand_total)}</span>`;
				}
			}
			else if (doctype === "Renewal List") {
				if (details.total_amount) {
					extraInfo = `<span class="activity-amount">₹${this.formatCurrency(details.total_amount)}</span>`;
				}
			}
			else if (doctype === "Payment Entry") {
				if (details.total_allocated_amount) {
					extraInfo = `<span class="activity-amount">₹${this.formatCurrency(details.total_allocated_amount)}</span>`;
				}
			}
			else if (doctype === "Issue") {
				const priorityColor = this.getPriorityColor(details.priority);
				extraInfo = `<span class="activity-priority" style="color: ${priorityColor}; font-weight: 600;">${details.priority}</span>`;
				if (details.subject) {
					extraInfo += ` <span class="activity-subject">${details.subject}</span>`;
				}
			}
			else if (doctype === "Call List") {
				if (details.subject) {
					extraInfo = `<span class="activity-subject">${details.subject}</span>`;
				}
				if (details.start_date) {
					extraInfo += ` <span class="activity-date" style="margin-left: 8px;"><i class="fa fa-calendar"></i> ${moment(details.start_date).format('DD MMM YYYY')}</span>`;
				}
			}

			const statusColor = this.getStatusColor(activity.status);
			const animationDelay = isInitialLoad ? index * 0.1 : 0;

			// Determine the correct URL for the doctype
			let doctypeUrl = doctype.toLowerCase().replace(/ /g, '-');
			if (doctype === "Opportunity") {
				doctypeUrl = "opportunity-list";
			}
			if (doctype === "Quotation") {
				doctypeUrl = "quotation-list";
			}
			if (doctype === "Call List") {
				doctypeUrl = "cal-lists";
			}
			if (doctype === "Issue") {
				doctypeUrl = "ticketss";
			}

			const activityItemHTML = `
				<div class="activity-item" style="animation: fadeIn 0.3s ease-out ${animationDelay}s both;">
					<div class="activity-icon" style="background-color: ${activity.color}20; color: ${activity.color};">
						<i class="fa ${activity.icon}"></i>
					</div>
					<div class="activity-content" style="flex: 1;">
						<div class="activity-header">
							<a href="/app/${doctypeUrl}/${activity.name}" class="activity-title">
								${doctype} - ${activity.name}
							</a>
							${activity.status ? `<span class="activity-status" style="background-color: ${statusColor};">${activity.status}</span>` : ''}
						</div>
						<div class="activity-meta">
							<span class="activity-time"><i class="fa fa-clock-o"></i> ${modifiedDate}</span>
							${extraInfo}
						</div>
					</div>
				</div>
			`;

			// Append to container
			activitiesContainer.insertAdjacentHTML('beforeend', activityItemHTML);
		});

		// Update displayed count
		state.displayedCount = endIdx;

		// Remove existing load more button if present
		const existingLoadMoreBtn = activityBody.querySelector('.load-more-btn-wrapper');
		if (existingLoadMoreBtn) {
			existingLoadMoreBtn.remove();
		}

		// Add Load More button if there are more activities
		const hasMore = state.displayedCount < state.allActivities.length;
		if (hasMore) {
			const loadMoreHTML = `
				<div class="text-center mt-3 load-more-btn-wrapper">
					<button class="btn btn-sm btn-default load-more-activities" style="border: 1px solid #ddd;">
						<i class="fa fa-arrow-down me-1"></i> Load More (${state.allActivities.length - state.displayedCount} remaining)
					</button>
				</div>
			`;
			activityBody.insertAdjacentHTML('beforeend', loadMoreHTML);

			// Bind Load More button
			const loadMoreBtn = activityBody.querySelector('.load-more-activities');
			if (loadMoreBtn) {
				loadMoreBtn.addEventListener('click', () => {
					// Show loading on button
					loadMoreBtn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Loading...';
					loadMoreBtn.disabled = true;

					// Render more activities after a short delay
					setTimeout(() => {
						this.renderRecentActivities(activityBody);

						// Scroll to the newly loaded content
						const container = activityBody.querySelector('.activities-container');
						if (container) {
							// Scroll to show the new content
							container.scrollTop = container.scrollHeight - container.clientHeight;
						}
					}, 300);
				});
			}
		}
	}


	bindConnectionItems(customer_id) {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const connectionSection = wrapper.querySelector(".connection-section");
		if (!connectionSection) return;

		const canReadDoctype = (doctype) => this.canReadDoctype(doctype);

		// Store connection data for managing state
		this.connectionState = this.connectionState || {};

		// Get all connection items
		const connectionItems = connectionSection.querySelectorAll(".connection-item");
		let visibleItems = 0;

		connectionItems.forEach((item) => {
			const badge = item.querySelector("[data-type]");
			if (!badge) return;

			const dataType = badge.dataset.type;
			if (!canReadDoctype(dataType)) {
				item.classList.add("d-none");
				return;
			}

			item.classList.remove("d-none");
			visibleItems += 1;

			// Fetch and display count for this data type
			this.fetchConnectionCount(dataType, customer_id, (count) => {
				let countBadge = badge.querySelector(".connection-badge-count");
				if (countBadge) {
					countBadge.textContent = count;
					countBadge.dataset.count = count;
					countBadge.title = count;
				}
			});

			// Prevent double binding
			if (badge.dataset.connectionBound === "1") return;
			badge.dataset.connectionBound = "1";

			// Add + icon if not present
			if (!item.querySelector('.connection-add-btn')) {
				const addBtn = document.createElement('button');
				addBtn.className = 'btn btn-xs btn-link connection-add-btn';
				addBtn.title = 'Add New ' + dataType;
				addBtn.innerHTML = '<i class="fa fa-plus"></i>';
				addBtn.style.marginLeft = '6px';
				badge.appendChild(addBtn);

				addBtn.addEventListener('click', (e) => {
					e.stopPropagation();
					// Use customRoute if available
					// if (dataType === "Opportunity" && customer_id) {
					// 	const customerName = String(customer_id || "").trim();
					// 	frappe.route_options = {
					// 		opportunity_from: "Customer",
					// 		party_name: customerName,
					// 		customer_name: customerName
					// 	};
					// 	frappe.new_doc("Opportunity");

					// 	// Some custom Opportunity scripts run on refresh and can override early defaults.
					// 	// Re-apply a few times until the new form is fully ready.
					// 	let attempts = 0;
					// 	const maxAttempts = 30;
					// 	const intervalId = setInterval(() => {
					// 		attempts += 1;
					// 		const frm = cur_frm;
					// 		if (!frm || frm.doc?.doctype !== "Opportunity" || !frm.doc?.__islocal) {
					// 			if (attempts >= maxAttempts) clearInterval(intervalId);
					// 			return;
					// 		}

					// 		frm.set_value("opportunity_from", "Customer");
					// 		frm.set_value("party_name", customerName);
					// 		frm.set_value("customer_name", customerName);
					// 		frm.trigger("party_name");

					// 		if (String(frm.doc.party_name || "").trim() === customerName) {
					// 			clearInterval(intervalId);
					// 		} else if (attempts >= maxAttempts) {
					// 			clearInterval(intervalId);
					// 		}
					// 	}, 200);
					// 	return;
					// }
					const filterConfig = {
						"Opportunity": { customRoute: "opportunity-list" },
						"Quotation": { customRoute: "quotation-list" },
						// "Opportunity": { customRoute: "opportunity" },
						// "Quotation": { customRoute: "quotation" },
						"Customer Order Form": { customRoute: "cof-list" },
						"Sales Order": { customRoute: "sales-order" },
						"Sales Invoice": { customRoute: "sales-invoice" },
						"Renewal List": { customRoute: "renewal-list" },
						"Issue": { customRoute: "ticketss" },
						"Call List": { customRoute: "call-lists" },
						"Payment Entry": { customRoute: "payment-entry" }
					};
					const config = filterConfig[dataType];
					if (config && config.customRoute) {
						let url = `/app/${config.customRoute}/new`;
						// Pass customer context to supported new forms
						if (["Issue", "Opportunity", "Quotation", "Call List", "Sales Order", "Sales Invoice", "Customer Order Form", "Renewal List"].includes(dataType) && customer_id) {
						//if (["Issue", "Quotation", "Call List", "Sales Order", "Sales Invoice", "Customer Order Form", "Renewal List"].includes(dataType) && customer_id) {
							const encodedCustomer = encodeURIComponent(customer_id);
							const params = [
								`customer=${encodedCustomer}`,
								`customer_name=${encodedCustomer}`,
								`party_name=${encodedCustomer}`,
								`name1=${encodedCustomer}`
							];
							url += `?${params.join("&")}`;
						}
						//window.open(url, '_blank');
						window.location.assign(url);
					} else {
						frappe.msgprint(`No custom route configured for ${dataType}`);
					}
				});
			}

			// Add click handler to show connection details inline
			badge.addEventListener("click", () => {
				this.toggleInlineConnectionDetails(item, dataType, customer_id);
			});
		});

		if (!visibleItems) {
			connectionSection.classList.add("d-none");
		} else {
			connectionSection.classList.remove("d-none");
		}
	}

	loadSalesCharts(customer_id) {
		const fiscalYear = this.getSelectedSalesFiscalYear();
		this.loadItemGroupChart(customer_id, fiscalYear);
		this.loadBrandChart(customer_id, fiscalYear);
	}

	canReadDoctype(doctype) {
		if (!doctype) return false;

		if ((frappe?.user_roles || []).includes("Administrator")) return true;

		if (frappe.model && typeof frappe.model.can_read === "function") {
			const val = frappe.model.can_read(doctype);
			if (typeof val === "boolean") return val;
		}

		const permRows = frappe.perm?.get_perm?.(doctype) || [];
		if (Array.isArray(permRows) && permRows.length) {
			return permRows.some((p) => !!p?.read);
		}

		const canReadList = frappe.boot?.user?.can_read;
		if (Array.isArray(canReadList)) {
			return canReadList.includes(doctype);
		}

		if (frappe.perm?.has_perm) {
			return Boolean(
				frappe.perm.has_perm(doctype, 0, "read") ||
				frappe.perm.has_perm(doctype, "read")
			);
		}

		return false;
	}

	hasSalesInvoiceReadPermission() {
		return this.canReadDoctype("Sales Invoice");
	}

	toggleSalesAnalyticsSection(customer_id, retries = 4) {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const salesAnalyticsSection = wrapper.querySelector('[data-tab-panel="connections"] .mt-4');
		if (!salesAnalyticsSection) return;

		const hasRead = this.hasSalesInvoiceReadPermission();
		salesAnalyticsSection.style.display = hasRead ? "" : "none";

		if (hasRead) {
			this.initSalesFiscalYearFilter(customer_id);
			return;
		}

		if (retries > 0) {
			setTimeout(() => {
				this.toggleSalesAnalyticsSection(customer_id, retries - 1);
			}, 120);
		}
	}

	getSelectedSalesFiscalYear() {
		const filter = document.getElementById('sales-fiscal-year-filter');
		return filter && filter.value ? filter.value : null;
	}

	initSalesFiscalYearFilter(customer_id) {
		const filter = document.getElementById('sales-fiscal-year-filter');
		if (!filter) {
			this.loadSalesCharts(customer_id);
			return;
		}

		if (filter.dataset.bound === "1") {
			this.loadSalesCharts(customer_id);
			return;
		}

		filter.dataset.bound = "1";
		filter.addEventListener("change", () => {
			const activeCustomer = this.current_customer_id || customer_id;
			if (activeCustomer) {
				this.loadSalesCharts(activeCustomer);
			}
		});

		this.populateSalesFiscalYearOptions(filter).then(() => {
			this.loadSalesCharts(customer_id);
		});
	}

	populateSalesFiscalYearOptions(filter) {
		return new Promise((resolve) => {
			frappe.call({
				method: "frappe.client.get_list",
				args: {
					doctype: "Fiscal Year",
					fields: ["name", "year_start_date", "year_end_date"],
					order_by: "year_start_date desc",
					limit_page_length: 0
				},
				callback: (r) => {
					const fiscalYears = (r.message || []).map((fy) => fy.name).filter(Boolean);

					// Add "All Years" option at the beginning
					let htmlOptions = '<option value="">All</option>';
					htmlOptions += fiscalYears
						.map((fy) => `<option value="${fy}">${fy}</option>`)
						.join("");

					filter.innerHTML = htmlOptions;

					let defaultFy = "";
					// First try to get the current fiscal year
					if (window.erpnext && erpnext.utils && erpnext.utils.get_fiscal_year) {
						defaultFy = erpnext.utils.get_fiscal_year(frappe.datetime.get_today());
					}

					// Set default selection - prefer current fiscal year
					if (defaultFy && fiscalYears.includes(defaultFy)) {
						filter.value = defaultFy;
					} else if (fiscalYears.length > 0) {
						filter.value = fiscalYears[0];
					} else {
						// If no fiscal years exist, use "Show All Years"
						filter.value = "";
					}
					resolve();
				},
				error: () => {
					filter.innerHTML = '';
					resolve();
				}
			});
		});
	}

	loadItemGroupChart(customer_id, fiscalYear) {
		const chartContainer = document.getElementById('item-group-chart');
		if (!chartContainer) return;

		frappe.call({
			method: "renewal_module.custom_module.page.customers.customers.get_sales_by_item_group",
			args: { customer_id: customer_id, fiscal_year: fiscalYear },
			callback: (r) => {
				if (r.message && r.message.length > 0) {
					this.renderBarChart(chartContainer, r.message, 'item_group', 'amount', '#667eea');
				} else {
					chartContainer.innerHTML = '<div class="text-center py-5 text-muted"><i class="fa fa-info-circle"></i> No data available</div>';
				}
			},
			error: (err) => {
				console.error("Error loading item group chart:", err);
				chartContainer.innerHTML = '<div class="text-center py-5 text-danger"><i class="fa fa-exclamation-triangle"></i> Error loading chart</div>';
			}
		});
	}

	loadBrandChart(customer_id, fiscalYear) {
		const chartContainer = document.getElementById('brand-chart');
		if (!chartContainer) return;

		frappe.call({
			method: "renewal_module.custom_module.page.customers.customers.get_sales_by_brand",
			args: { customer_id: customer_id, fiscal_year: fiscalYear },
			callback: (r) => {
				if (r.message && r.message.length > 0) {
					this.renderBarChart(chartContainer, r.message, 'brand', 'amount', '#f093fb');
				} else {
					chartContainer.innerHTML = '<div class="text-center py-5 text-muted"><i class="fa fa-info-circle"></i> No data available</div>';
				}
			},
			error: (err) => {
				console.error("Error loading brand chart:", err);
				chartContainer.innerHTML = '<div class="text-center py-5 text-danger"><i class="fa fa-exclamation-triangle"></i> Error loading chart</div>';
			}
		});
	}

	renderBarChart(container, data, labelKey, valueKey, color) {
		// Sort data by amount in descending order
		data.sort((a, b) => (b[valueKey] || 0) - (a[valueKey] || 0));

		// Use all data points
		const topData = data;

		// Extract labels and values
		const labels = topData.map(item => item[labelKey] || 'Unknown');
		const values = topData.map(item => item[valueKey] || 0);

		// Find max value for scaling
		const maxValue = Math.max(...values);

		// Clear container
		container.innerHTML = '';

		// Create chart HTML
		let chartHTML = '<div style="padding: 8px 6px;">';

		topData.forEach((item, index) => {
			const label = item[labelKey] || 'Unknown';
			const value = item[valueKey] || 0;
			const percentage = maxValue > 0 ? (value / maxValue) * 100 : 0;
			const formattedValue = this.formatCurrency(value);
			const safeLabel = this.escapeHtml(String(label));
			const tooltipText = this.escapeHtml(`${label}: ₹${formattedValue}`);

			chartHTML += `
				<div style="margin-bottom: 5px;">
					<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
						<div style="display: flex; align-items: center; gap: 8px; min-width: 0;">
							<span style="width: 8px; height: 8px; border-radius: 999px; background: ${color}; flex-shrink: 0;"></span>
							<span style="font-weight: 600; color: #2c3e50; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${safeLabel}">${safeLabel}</span>

						</div>
						<span style="font-weight: 700; color: ${color}; background: ${color}1a; padding: 2px 8px; border-radius: 999px; font-size: 12px;">₹${formattedValue}</span>
					</div>
					<div title="${tooltipText}" style="background: #f4f6fb; border-radius: 999px; height: 10px; position: relative; overflow: hidden; cursor: pointer;">
						<div title="${tooltipText}" style="background: linear-gradient(90deg, ${color}, ${color}dd); height: 100%; width: ${percentage}%; border-radius: 999px; transition: width 0.3s ease;"></div>
					</div>
				</div>
			`;
		});

		chartHTML += '</div>';
		container.innerHTML = chartHTML;
	}

	renderSalesTeamTab(customerId, salesTeam = [], customerData = null) {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const panel = wrapper?.querySelector('[data-tab-panel="sales-team"]');
		const container = panel?.querySelector(".post-container");
		if (!container) return;

		this.current_sales_team = Array.isArray(salesTeam) ? salesTeam.slice() : [];
		const customerInfo = customerData || this.current_customer_details || {};
		const salesPersonLabel = this.escapeHtml(customerInfo.sales_person || "-");
		const reportToLabel = this.escapeHtml(customerInfo.report_to || "-");

		const cardsHtml = this.current_sales_team.length
			? `
				<div class="row">
					${this.current_sales_team
				.map((row, idx) => {
					const name = this.escapeHtml(row.sales_person || "Sales Person");
					const teamName = row.team_name
						? `<div class="text-muted fs-sm">${this.escapeHtml(row.team_name)}</div>`
						: "";
					const emailLine = row.email_id
						? `<div class="text-muted fs-sm"><i class="fa fa-envelope mr-1"></i>${this.escapeHtml(row.email_id)}</div>`
						: "";
					const mobileLine = row.mobile_no
						? `<div class="text-muted fs-sm"><i class="fa fa-phone mr-1"></i>${this.escapeHtml(row.mobile_no)}</div>`
						: "";
					const allocatedValue = Number(row.allocated_percentage);
					const allocatedLine = Number.isFinite(allocatedValue)
						? `<div class="text-muted fs-sm">Allocated: ${allocatedValue}%</div>`
						: "";

					return `
						<div class="col-12 col-md-6 mb-2">
							<div class="card h-100 sales-team-card">
								<div class="card-body">
									<div class="d-flex justify-content-between align-items-start">
										<div class="fw-semibold">${name}</div>
										<button class="btn btn-xs btn-default1 sales-team-edit-btn" data-row-index="${idx}">
											<i class="fa fa-pencil"></i>
										</button>
									</div>
									${teamName}
									${allocatedLine}
									${emailLine}
									${mobileLine}
								</div>
							</div>
						</div>
					`;
				})
				.join("")}
				</div>
			`
			: `<p class="text-muted fs-sm mb-0">No sales team members added.</p>`;

		container.innerHTML = `
			<div class="d-flex justify-content-between align-items-center mb-2">
				<div class="fw-semibold">Sales Team</div>
				<button class="btn btn-sm btn-primary1 sales-team-add-btn" data-customer-id="${this.escapeHtml(customerId)}">
					<i class="fa fa-plus me-1"></i> Add 
				</button>
			</div>
			${cardsHtml}
			
		`;

		this.bindSalesTeamEvents(customerId);
	}

	bindSalesTeamEvents(customerId) {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const $wrapper = $(wrapper);

		$wrapper.off("click.sales-team-add").on("click.sales-team-add", ".sales-team-add-btn", (e) => {
			e.preventDefault();
			this.openSalesTeamDialog(customerId);
		});

		$wrapper.off("click.sales-team-edit").on("click.sales-team-edit", ".sales-team-edit-btn", (e) => {
			e.preventDefault();
			const rowIndex = parseInt($(e.currentTarget).data("row-index"), 10);
			if (Number.isNaN(rowIndex)) return;
			this.openSalesTeamDialog(customerId, rowIndex);
		});
	}

	openSalesTeamDialog(customerId, rowIndex = null) {
		const isEdit = Number.isInteger(rowIndex);
		const row = isEdit ? (this.current_sales_team[rowIndex] || {}) : {};

		const dialog = new frappe.ui.Dialog({
			title: isEdit ? __("Edit Sales Team") : __("Add Sales Team"),
			fields: [
				{
					fieldtype: "Link",
					options: "Sales Person",
					fieldname: "sales_person",
					label: "Sales Person",
					reqd: 1
				},
				{
					fieldtype: "Data",
					fieldname: "team_name",
					label: "Team Name"
				},
				{
					fieldtype: "Data",
					fieldname: "email_id",
					label: "Email"
				},
				{
					fieldtype: "Data",
					fieldname: "mobile_no",
					label: "Mobile"
				},
				{
					fieldtype: "Float",
					fieldname: "allocated_percentage",
					label: "Allocated Percentage",
					default: 100
				}
			],
			primary_action_label: __("Save"),
			primary_action: (values) => {
				if (!values) return;
				const allocated = parseFloat(values.allocated_percentage);
				if (!Number.isFinite(allocated) || allocated < 0 || allocated > 100) {
					frappe.msgprint("Allocated Percentage must be between 0 and 100.");
					return;
				}

				const updatedRow = {
					...row,
					...values,
					allocated_percentage: allocated
				};

				let updatedSalesTeam = [];
				if (isEdit) {
					updatedSalesTeam = this.current_sales_team.map((item, idx) =>
						idx === rowIndex ? updatedRow : item
					);
				} else {
					updatedSalesTeam = [...this.current_sales_team, updatedRow];
				}

				this.saveSalesTeam(customerId, updatedSalesTeam, dialog);
			}
		});

		dialog.show();
		dialog.set_values({
			sales_person: row.sales_person || "",
			team_name: row.team_name || "",
			email_id: row.email_id || "",
			mobile_no: row.mobile_no || "",
			allocated_percentage: row.allocated_percentage ?? 100
		});

		setTimeout(() => {
			const closeBtn = dialog.get_close_btn();
			if (!closeBtn || !closeBtn.length) return;
			closeBtn.off("click.dialog").on("click.dialog", () => dialog.hide());
		}, 50);
	}

	saveSalesTeam(customerId, salesTeam, dialog) {
		frappe.call({
			method: "renewal_module.custom_module.page.customers.customers.update_customer_sales_team",
			args: {
				customer_id: customerId,
				sales_team: JSON.stringify(salesTeam || [])
			},
			callback: (r) => {
				const updated = r && r.message && Array.isArray(r.message.sales_team)
					? r.message.sales_team
					: salesTeam;
				this.current_sales_team = updated;
				this.renderSalesTeamTab(customerId, updated, this.current_customer_details);
				if (dialog) dialog.hide();
				frappe.show_alert({ message: "Sales team updated", indicator: "green" });
			},
			error: (err) => {
				console.error("Sales team update failed", err);
				frappe.msgprint("Failed to update sales team.");
			}
		});
	}

	renderSettingsTab(customerId, customerData = null) {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const panel = wrapper?.querySelector('[data-tab-panel="settings"]');
		const container = panel?.querySelector(".post-container");
		if (!container) return;

		const customerInfo = customerData || this.current_customer_details || {};
		container.innerHTML = `
			<div class="settings-form">
				<div class="row">
					<div class="col-12 col-md-6 mb-2">
						<div id="customer-so-required"></div>
					</div>
					<div class="col-12 col-md-6 mb-2">
						<div id="customer-dn-required"></div>
					</div>
					<div class="col-12 col-md-6 mb-2">
						<div id="customer-is-frozen"></div>
					</div>
					<div class="col-12 col-md-6 mb-2">
						<div id="customer-disabled"></div>
					</div>
				</div>
				<div class="d-flex align-items-center gap-2 mt-2">
					<button class="btn btn-sm btn-primary1 settings-save-btn" data-customer-id="${this.escapeHtml(customerId)}">
						Save
					</button>
					<span class="text-muted fs-sm settings-save-status"></span>
				</div>
			</div>
		`;

		const buildCheck = (parentId, label, fieldname) => {
			const control = frappe.ui.form.make_control({
				parent: document.getElementById(parentId),
				df: { fieldtype: "Check", label, fieldname },
				render_input: true
			});
			control.refresh();
			control.set_value(customerInfo[fieldname] ? 1 : 0);
			return control;
		};

		this.settings_controls = {
			so_required: buildCheck("customer-so-required", "Allow Sales Invoice Creation Without Sales Order", "so_required"),
			dn_required: buildCheck("customer-dn-required", "Allow Sales Invoice Creation Without Delivery Note", "dn_required"),
			is_frozen: buildCheck("customer-is-frozen", "Is Frozen", "is_frozen"),
			disabled: buildCheck("customer-disabled", "Disabled", "disabled")
		};
		this.settings_input_map = {};
		Object.entries(this.settings_controls).forEach(([field, control]) => {
			const input = control && control.$wrapper ? control.$wrapper.find('input[type="checkbox"]').get(0) : null;
			if (input) this.settings_input_map[field] = input;
		});
		this.settings_customer_id = customerId;
		const normalizeInitial = (value) => (value === 1 || value === "1" || value === true ? 1 : 0);
		this.settings_initial_values = {
			so_required: normalizeInitial(customerInfo.so_required),
			dn_required: normalizeInitial(customerInfo.dn_required),
			is_frozen: normalizeInitial(customerInfo.is_frozen),
			disabled: normalizeInitial(customerInfo.disabled)
		};

		const saveBtn = panel.querySelector(".settings-save-btn");
		if (saveBtn) saveBtn.classList.add("d-none");
		const statusEl = panel.querySelector(".settings-save-status");
		if (statusEl) statusEl.textContent = "";

		const hasChanges = () => {
			const current = this.getSettingsValues();
			return Object.keys(current).some((key) => current[key] !== this.settings_initial_values[key]);
		};

		const updateSaveVisibility = () => {
			if (!saveBtn) return;
			saveBtn.classList.toggle("d-none", !hasChanges());
			if (!hasChanges() && statusEl) statusEl.textContent = "";
		};

		container.removeEventListener("change", updateSaveVisibility);
		container.removeEventListener("click", updateSaveVisibility);
		container.addEventListener("change", (e) => {
			if (e.target && e.target.matches('input[type="checkbox"]')) {
				setTimeout(updateSaveVisibility, 0);
			}
		});
		container.addEventListener("click", (e) => {
			if (e.target && e.target.matches('input[type="checkbox"]')) {
				setTimeout(updateSaveVisibility, 0);
			}
		});

		const $wrapper = $(wrapper);
		$wrapper.off("click.settings-save").on("click.settings-save", ".settings-save-btn", (e) => {
			e.preventDefault();
			const currentId = this.settings_customer_id || $(e.currentTarget).data("customer-id");
			const values = this.getSettingsValues();
			if (statusEl) statusEl.textContent = "Saving...";
			this.saveCustomerSettings(currentId, values, statusEl);
		});

		setTimeout(() => {
			this.settings_initial_values = this.getSettingsValues();
			updateSaveVisibility();
		}, 0);
	}

	getSettingsValues() {
		const controls = this.settings_controls || {};
		const normalizeCheck = (value) => (value === 1 || value === "1" || value === true ? 1 : 0);
		const inputs = this.settings_input_map || {};
		const readFromInput = (field) => {
			const input = inputs[field];
			return input ? (input.checked ? 1 : 0) : null;
		};
		return {
			so_required: readFromInput("so_required") ?? normalizeCheck(controls.so_required?.get_value()),
			dn_required: readFromInput("dn_required") ?? normalizeCheck(controls.dn_required?.get_value()),
			is_frozen: readFromInput("is_frozen") ?? normalizeCheck(controls.is_frozen?.get_value()),
			disabled: readFromInput("disabled") ?? normalizeCheck(controls.disabled?.get_value())
		};
	}

	saveCustomerSettings(customerId, values, statusEl = null) {
		if (!customerId) return;
		frappe.call({
			method: "renewal_module.custom_module.page.customers.customers.update_customer_settings",
			args: {
				customer_id: customerId,
				settings: JSON.stringify(values || {})
			},
			callback: (r) => {
				const updated = r && r.message ? r.message : values;
				this.current_customer_details = {
					...(this.current_customer_details || {}),
					...updated
				};
				if (this.settings_controls) {
					Object.keys(this.settings_controls).forEach((field) => {
						if (Object.prototype.hasOwnProperty.call(updated, field)) {
							this.settings_controls[field].set_value(updated[field] ? 1 : 0);
						}
					});
				}
				this.settings_initial_values = this.getSettingsValues();
				const saveBtn = statusEl ? statusEl.parentElement?.querySelector(".settings-save-btn") : null;
				if (saveBtn) saveBtn.classList.add("d-none");
				if (statusEl) statusEl.textContent = "Saved";
				frappe.show_alert({ message: "Settings updated", indicator: "green" });
			},
			error: (err) => {
				console.error("Settings update failed", err);
				if (statusEl) statusEl.textContent = "Failed to save";
				frappe.msgprint("Failed to update settings.");
			}
		});
	}

	renderTaxesTab(customerId, customerData = null) {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const panel = wrapper?.querySelector('[data-tab-panel="taxes"]');
		const container = panel?.querySelector("#customer-taxes");
		if (!container) return;

		const customerInfo = customerData || this.current_customer_details || {};
		container.innerHTML = `
			<div class="taxes-form">
				<div class="row">
					<div class="col-12 col-md-6 mb-3">
						<div id="customer-gstin"></div>
						<div id="customer-gstin-status" class="mt-1"></div>
					</div>
					<div class="col-12 col-md-6 mb-3">
						<div id="customer-gst-category"></div>
					</div>
					<div class="col-12 col-md-6 mb-3">
						<div id="customer-pan"></div>
						<div id="customer-pan-status" class="mt-1"></div>
					</div>
					<div class="col-12 col-md-6 mb-3">
						<div id="customer-tax-territory"></div>
					</div>
					<div class="col-12 col-md-6 mb-3">
						<div id="customer-tax-category"></div>
					</div>
				</div>
				<div class="d-flex align-items-center gap-2 mt-2">
					<button class="btn btn-sm btn-primary1 taxes-save-btn d-none">Save</button>
					<span class="text-muted fs-sm taxes-save-status"></span>
				</div>
			</div>
		`;

		const getStatusMarkup = (status, updatedOn, fallbackStatus = __("Not Available")) => {
			return this.getTaxStatusMarkup(status, updatedOn, fallbackStatus);
		};

		frappe.call({
			method: "renewal_module.custom_module.page.customers.customers.get_customer_tax_options",
			callback: (r) => {
				const options = r.message || {
					gst_categories: [],
					tax_categories: []
				};

				const gstinControl = frappe.ui.form.make_control({
					parent: document.getElementById("customer-gstin"),
					df: {
						fieldtype: "Data",
						label: "GSTIN / UIN",
						fieldname: "gstin"
					},
					render_input: true
				});
				gstinControl.refresh();
				gstinControl.set_value(customerInfo.gstin || customerInfo.tax_id || "");

				const gstCategoryControl = frappe.ui.form.make_control({
					parent: document.getElementById("customer-gst-category"),
					df: {
						fieldtype: "Select",
						label: "GST Category",
						fieldname: "gst_category",
						reqd: 1,
						options: (options.gst_categories || []).join("\n")
					},
					render_input: true
				});
				gstCategoryControl.refresh();
				gstCategoryControl.set_value(customerInfo.gst_category || "");

				const panControl = frappe.ui.form.make_control({
					parent: document.getElementById("customer-pan"),
					df: {
						fieldtype: "Data",
						label: "PAN",
						fieldname: "pan"
					},
					render_input: true
				});
				panControl.refresh();
				panControl.set_value(customerInfo.pan || "");

				const territoryControl = frappe.ui.form.make_control({
					parent: document.getElementById("customer-tax-territory"),
					df: {
						fieldtype: "Link",
						options: "Territory",
						label: "Territory",
						fieldname: "territory"
					},
					render_input: true
				});
				territoryControl.refresh();
				territoryControl.set_value(customerInfo.territory || "");

				const taxCategoryControl = frappe.ui.form.make_control({
					parent: document.getElementById("customer-tax-category"),
					df: {
						fieldtype: "Autocomplete",
						label: "Tax Category",
						fieldname: "tax_category",
						options: options.tax_categories || []
					},
					render_input: true
				});
				taxCategoryControl.refresh();
				taxCategoryControl.set_value(customerInfo.tax_category || "");

				const gstinStatusTarget = container.querySelector("#customer-gstin-status");
				if (gstinStatusTarget) {
					gstinStatusTarget.innerHTML = getStatusMarkup(
						customerInfo.gstin_status,
						customerInfo.gstin_last_updated_on,
						__("Not Available")
					);
				}

				const panStatusTarget = container.querySelector("#customer-pan-status");
				if (panStatusTarget) {
					const derivedPanStatus = customerInfo.pan_status
						|| (/^[A-Z]{5}[0-9]{4}[A-Z]$/i.test(String(customerInfo.pan || "").trim()) ? __("Valid") : __("Not Available"));
					panStatusTarget.innerHTML = getStatusMarkup(
						derivedPanStatus,
						customerInfo.pan_last_updated_on,
						__("Not Available")
					);
				}

				this.taxes_controls = {
					gstin: gstinControl,
					gst_category: gstCategoryControl,
					pan: panControl,
					territory: territoryControl,
					tax_category: taxCategoryControl
				};

				this.taxes_initial_values = this.getCustomerTaxValues();

				const saveBtn = panel.querySelector(".taxes-save-btn");
				const statusEl = panel.querySelector(".taxes-save-status");

				const updateSaveVisibility = () => {
					const current = this.getCustomerTaxValues();
					const hasChange = Object.keys(current).some(
						(key) => current[key] !== this.taxes_initial_values[key]
					);
					if (saveBtn) saveBtn.classList.toggle("d-none", !hasChange);
					if (!hasChange && statusEl) statusEl.textContent = "";
				};

				const bindControlEvents = (control, namespace) => {
					if (!control || !control.$input) return;
					control.$input
						.off(`change.${namespace} blur.${namespace} input.${namespace} keyup.${namespace} awesomplete-selectcomplete.${namespace}`)
						.on(`change.${namespace} blur.${namespace} input.${namespace} keyup.${namespace} awesomplete-selectcomplete.${namespace}`, () => {
							setTimeout(updateSaveVisibility, 0);
						});
				};

				bindControlEvents(gstinControl, "gstin");
				bindControlEvents(gstCategoryControl, "gst-category");
				bindControlEvents(panControl, "pan");
				bindControlEvents(territoryControl, "tax-territory");
				bindControlEvents(taxCategoryControl, "tax-category");

				if (territoryControl?.$input) {
					territoryControl.$input
						.off("change.tax-territory-sync")
						.on("change.tax-territory-sync", () => {
							this.syncTaxCategoryWithTerritory(territoryControl, taxCategoryControl);
							setTimeout(updateSaveVisibility, 0);
						});
				}

				if (gstinControl?.$input) {
					gstinControl.$input
						.off("change.gstin-autofill blur.gstin-autofill")
						.on("change.gstin-autofill blur.gstin-autofill", () => {
							this.autoFillTaxFieldsFromGSTIN({
								gstinControl,
								panControl,
								gstCategoryControl,
								territoryControl,
								taxCategoryControl,
								statusTarget: gstinStatusTarget,
								onComplete: () => setTimeout(updateSaveVisibility, 0)
							});
						});
				}

				if (territoryControl?.get_value()) {
					this.syncTaxCategoryWithTerritory(territoryControl, taxCategoryControl);
				}

				if (saveBtn) {
					saveBtn.addEventListener("click", (e) => {
						e.preventDefault();
						if (statusEl) statusEl.textContent = "Saving...";
						this.saveCustomerTaxFields(customerId, this.getCustomerTaxValues(), statusEl, saveBtn);
					});
				}

				setTimeout(() => {
					this.taxes_initial_values = this.getCustomerTaxValues();
					updateSaveVisibility();
				}, 0);
			}
		});
	}

	getTaxCategoryForTerritory(territory) {
		const normalizedTerritory = String(territory || "").trim();
		if (!normalizedTerritory) return "";
		if (normalizedTerritory === "Telangana") return "In-State - TG";
		if (normalizedTerritory === "Tamil Nadu") return "In-State - TN";
		return "Out-State - TG";
	}

	syncTaxCategoryWithTerritory(territoryControl, taxCategoryControl) {
		if (!territoryControl || !taxCategoryControl) return;
		const nextTaxCategory = this.getTaxCategoryForTerritory(territoryControl.get_value());
		if (nextTaxCategory && taxCategoryControl.get_value() !== nextTaxCategory) {
			taxCategoryControl.set_value(nextTaxCategory);
		}
	}

	autoFillTaxFieldsFromGSTIN({
		gstinControl,
		panControl,
		gstCategoryControl,
		territoryControl = null,
		taxCategoryControl = null,
		statusTarget = null,
		onComplete = null
	} = {}) {
		const normalizedGstin = String(gstinControl?.get_value?.() || "").trim().toUpperCase();
		if (!normalizedGstin) {
			if (panControl) panControl.set_value("");
			if (gstCategoryControl && !gstCategoryControl.get_value()) {
				gstCategoryControl.set_value("Unregistered");
			}
			if (typeof onComplete === "function") onComplete(null);
			return;
		}

		if (normalizedGstin.length < 15) {
			if (typeof onComplete === "function") onComplete(null);
			return;
		}

		frappe.call({
			method: "renewal_module.custom_module.page.customers.customers.get_gstin_autofill_details",
			args: {
				gstin: normalizedGstin,
				current_territory: territoryControl?.get_value?.() || "",
				current_gst_category: gstCategoryControl?.get_value?.() || ""
			},
			callback: (r) => {
				const details = r?.message || {};

				if (details.gstin && gstinControl?.get_value?.() !== details.gstin) {
					gstinControl.set_value(details.gstin);
				}
				if (panControl && Object.prototype.hasOwnProperty.call(details, "pan")) {
					panControl.set_value(details.pan || "");
				}
				if (gstCategoryControl && Object.prototype.hasOwnProperty.call(details, "gst_category")) {
					gstCategoryControl.set_value(details.gst_category || "");
				}
				if (territoryControl && details.territory) {
					territoryControl.set_value(details.territory || "");
				}
				if (taxCategoryControl) {
					if (details.tax_category) {
						taxCategoryControl.set_value(details.tax_category || "");
					} else {
						this.syncTaxCategoryWithTerritory(territoryControl, taxCategoryControl);
					}
				}
				if (statusTarget) {
					statusTarget.innerHTML = this.getTaxStatusMarkup(
						details.gstin_status,
						details.gstin_last_updated_on,
						__("Not Available")
					);
				}
				if (typeof onComplete === "function") onComplete(details);
			},
			error: () => {
				if (typeof onComplete === "function") onComplete(null);
			}
		});
	}

	getTaxStatusMarkup(status, updatedOn, fallbackStatus = __("Not Available")) {
		const resolvedStatus = String(status || fallbackStatus || "").trim() || fallbackStatus;
		const normalizedStatus = resolvedStatus.toLowerCase();
		let dotColor = "#6c757d";
		if (["valid", "active", "registered"].some((value) => normalizedStatus.includes(value))) {
			dotColor = "#198754";
		} else if (["invalid", "cancelled", "blocked", "inactive"].some((value) => normalizedStatus.includes(value))) {
			dotColor = "#dc3545";
		}

		let updatedLabel = "";
		if (updatedOn) {
			try {
				if (frappe.datetime?.comment_when) {
					updatedLabel = `${__("updated")} ${frappe.datetime.comment_when(updatedOn)}`;
				} else {
					updatedLabel = `${__("updated")} ${frappe.utils.escape_html(String(updatedOn))}`;
				}
			} catch (e) {
				updatedLabel = "";
			}
		}

		return `
			<div class="d-flex align-items-center justify-content-between flex-wrap gap-2 text-muted fs-sm">
				<span class="d-inline-flex align-items-center gap-2">
					<span style="width:8px;height:8px;border-radius:999px;background:${dotColor};display:inline-block;"></span>
					<span>${__("Status")}: <strong>${frappe.utils.escape_html(resolvedStatus)}</strong></span>
				</span>
				${updatedLabel ? `<span>${updatedLabel} <i class="fa fa-refresh"></i></span>` : ""}
			</div>
		`;
	}

	getCustomerTaxValues() {
		const controls = this.taxes_controls || {};
		const getValue = (field) => {
			const control = controls[field];
			if (!control) return "";
			if (control.get_value) {
				return control.get_value() || "";
			}
			return control.$input ? (control.$input.val() || "") : "";
		};

		return {
			gstin: getValue("gstin"),
			gst_category: getValue("gst_category"),
			pan: getValue("pan"),
			territory: getValue("territory"),
			tax_category: getValue("tax_category")
		};
	}

	saveCustomerTaxFields(customerId, fields, statusEl, saveBtn) {
		if (!customerId) return;
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const panel = wrapper?.querySelector('[data-tab-panel="taxes"]');
		const container = panel?.querySelector("#customer-taxes");

		frappe.call({
			method: "renewal_module.custom_module.page.customers.customers.update_customer_tax_fields",
			args: {
				customer_id: customerId,
				fields: JSON.stringify(fields || {})
			},
			callback: (r) => {
				const updated = r && r.message ? r.message : fields;
				this.current_customer_details = {
					...(this.current_customer_details || {}),
					...updated
				};

				if (this.taxes_controls) {
					if (Object.prototype.hasOwnProperty.call(updated, "gstin")) {
						this.taxes_controls.gstin.set_value(updated.gstin || "");
					}
					if (Object.prototype.hasOwnProperty.call(updated, "gst_category")) {
						this.taxes_controls.gst_category.set_value(updated.gst_category || "");
					}
					if (Object.prototype.hasOwnProperty.call(updated, "pan")) {
						this.taxes_controls.pan.set_value(updated.pan || "");
					}
					if (Object.prototype.hasOwnProperty.call(updated, "territory") && this.taxes_controls.territory) {
						this.taxes_controls.territory.set_value(updated.territory || "");
					}
					if (Object.prototype.hasOwnProperty.call(updated, "tax_category")) {
						this.taxes_controls.tax_category.set_value(updated.tax_category || "");
					}
				}

				const gstinStatusTarget = container?.querySelector("#customer-gstin-status");
				if (gstinStatusTarget) {
					gstinStatusTarget.innerHTML = this.getTaxStatusMarkup(
						updated.gstin_status,
						updated.gstin_last_updated_on,
						__("Not Available")
					);
				}

				const panStatusTarget = container?.querySelector("#customer-pan-status");
				if (panStatusTarget) {
					const derivedPanStatus = updated.pan_status
						|| (/^[A-Z]{5}[0-9]{4}[A-Z]$/i.test(String(updated.pan || "").trim()) ? __("Valid") : __("Not Available"));
					panStatusTarget.innerHTML = this.getTaxStatusMarkup(
						derivedPanStatus,
						updated.pan_last_updated_on,
						__("Not Available")
					);
				}

				this.taxes_initial_values = this.getCustomerTaxValues();
				if (saveBtn) saveBtn.classList.add("d-none");
				if (statusEl) statusEl.textContent = "Saved";
				frappe.show_alert({ message: "Tax details updated", indicator: "green" });
			},
			error: (err) => {
				console.error("Tax fields update failed", err);
				if (statusEl) statusEl.textContent = "Failed to save";
				frappe.msgprint("Failed to update tax details.");
			}
		});
	}

	renderAccountsTab(customerId, customerData = null) {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const panel = wrapper?.querySelector('[data-tab-panel="Accounts"]');
		const container = panel?.querySelector(".post-container");
		if (!container) return;

		const customerInfo = customerData || this.current_customer_details || {};
		this.current_credit_limits = Array.isArray(customerInfo.credit_limits)
			? customerInfo.credit_limits.slice()
			: [];
		this.current_party_accounts = Array.isArray(customerInfo.accounts)
			? customerInfo.accounts.slice()
			: [];

		container.innerHTML = `
			<div class="account-section mb-3">
				<div class="fw-semibold mb-2">Default Payment Terms Template</div>
				<div id="customer-payment-terms"></div>
				<div class="d-flex align-items-center gap-2 mt-2">
					<button class="btn btn-sm btn-primary1 account-payment-save-btn d-none">Save</button>
					<span class="text-muted fs-sm account-payment-status"></span>
				</div>
			</div>
			
			<div class="account-section mb-3" id="customer-credit-limits"></div>
			
			<div class="account-section mb-3" id="customer-party-accounts"></div>
			
			<div class="account-section mb-3">
				<div class="fw-semibold mb-2">Loyalty Program</div>
				<div class="row">
					<div class="col-12 col-md-6 mb-2">
						<div id="customer-loyalty-program"></div>
					</div>
					<div class="col-12 col-md-6 mb-2">
						<div id="customer-loyalty-tier"></div>
					</div>
				</div>
				<div class="d-flex align-items-center gap-2 mt-2">
					<button class="btn btn-sm btn-primary1 account-loyalty-save-btn d-none">Save</button>
					<span class="text-muted fs-sm account-loyalty-status"></span>
				</div>
			</div>
		`;

		// Fetch available payment terms and loyalty programs
		frappe.call({
			method: "renewal_module.custom_module.page.customers.customers.get_payment_terms_and_loyalty_options",
			callback: (r) => {
				const options = r.message || { payment_terms: [], loyalty_programs: [] };

				const paymentTermsControl = frappe.ui.form.make_control({
					parent: document.getElementById("customer-payment-terms"),
					df: {
						fieldtype: "Autocomplete",
						label: "Payment Terms",
						fieldname: "payment_terms",
						options: options.payment_terms.map(p => p.value)
					},
					render_input: true
				});
				paymentTermsControl.refresh();
				paymentTermsControl.set_value(customerInfo.payment_terms || "");

				const loyaltyProgramControl = frappe.ui.form.make_control({
					parent: document.getElementById("customer-loyalty-program"),
					df: {
						fieldtype: "Autocomplete",
						label: "Loyalty Program",
						fieldname: "loyalty_program",
						options: options.loyalty_programs.map(l => l.value)
					},
					render_input: true
				});
				loyaltyProgramControl.refresh();
				loyaltyProgramControl.set_value(customerInfo.loyalty_program || "");

				const loyaltyTierControl = frappe.ui.form.make_control({
					parent: document.getElementById("customer-loyalty-tier"),
					df: {
						fieldtype: "Data",
						label: "Loyalty Program Tier",
						fieldname: "loyalty_program_tier",
						read_only: 1
					},
					render_input: true
				});
				loyaltyTierControl.refresh();
				loyaltyTierControl.set_value(customerInfo.loyalty_program_tier || "");

				this.accounts_controls = {
					payment_terms: paymentTermsControl,
					loyalty_program: loyaltyProgramControl,
					loyalty_program_tier: loyaltyTierControl
				};

				const normalizeLinkValue = (value) => (value == null ? "" : String(value));
				this.accounts_initial_values = {
					payment_terms: paymentTermsControl ? normalizeLinkValue(customerInfo.payment_terms) : "",
					loyalty_program: normalizeLinkValue(customerInfo.loyalty_program)
				};

				const paymentSaveBtn = panel.querySelector(".account-payment-save-btn");
				const paymentStatus = panel.querySelector(".account-payment-status");

				const loyaltySaveBtn = panel.querySelector(".account-loyalty-save-btn");
				const loyaltyStatus = panel.querySelector(".account-loyalty-status");

				const getLinkCurrent = (control) => {
					const raw = control && control.$input ? (control.$input.val() || "") : "";
					if (!raw) {
						if (control && control.get_value && control.get_value()) {
							control.set_value("");
						}
						return "";
					}
					const value = control && control.get_value ? (control.get_value() || "") : "";
					return value || raw;
				};

				const getLinkInitial = (control) => {
					const value = control && control.get_value ? (control.get_value() || "") : "";
					const raw = control && control.$input ? (control.$input.val() || "") : "";
					return value || raw || "";
				};

				const updatePaymentSave = () => {
					const current = getLinkCurrent(paymentTermsControl);
					const hasChange = current !== this.accounts_initial_values.payment_terms;
					if (paymentSaveBtn) paymentSaveBtn.classList.toggle("d-none", !hasChange);
					if (!hasChange && paymentStatus) paymentStatus.textContent = "";
				};

				const updateLoyaltySave = () => {
					const current = getLinkCurrent(loyaltyProgramControl);
					const hasChange = current !== this.accounts_initial_values.loyalty_program;
					if (loyaltySaveBtn) loyaltySaveBtn.classList.toggle("d-none", !hasChange);
					if (!hasChange && loyaltyStatus) loyaltyStatus.textContent = "";
				};

				if (paymentTermsControl && paymentTermsControl.$input) {
					paymentTermsControl.$input
						.off("change.accounts-payment input.accounts-payment blur.accounts-payment keyup.accounts-payment awesomplete-selectcomplete.accounts-payment")
						.on("change.accounts-payment input.accounts-payment blur.accounts-payment keyup.accounts-payment awesomplete-selectcomplete.accounts-payment", updatePaymentSave);
				}
				if (loyaltyProgramControl.$input) {
					loyaltyProgramControl.$input
						.off("change.accounts-loyalty input.accounts-loyalty blur.accounts-loyalty keyup.accounts-loyalty awesomplete-selectcomplete.accounts-loyalty")
						.on("change.accounts-loyalty input.accounts-loyalty blur.accounts-loyalty keyup.accounts-loyalty awesomplete-selectcomplete.accounts-loyalty", updateLoyaltySave);
				}

				const bindLinkEvents = (control, handler, ns) => {
					if (!control || !control.$input) return;
					control.$input
						.off(`change.${ns} blur.${ns} input.${ns} keyup.${ns} awesomplete-selectcomplete.${ns}`)
						.on(`change.${ns} blur.${ns} input.${ns} keyup.${ns} awesomplete-selectcomplete.${ns}`, () => {
							setTimeout(handler, 0);
						});
					if (control.$wrapper) {
						control.$wrapper
							.off(`click.${ns}`)
							.on(`click.${ns}`, ".btn-clear", () => {
								setTimeout(handler, 0);
							});
					}
				};
				bindLinkEvents(paymentTermsControl, updatePaymentSave, "accounts-payment");
				bindLinkEvents(loyaltyProgramControl, updateLoyaltySave, "accounts-loyalty");

				if (paymentSaveBtn) {
					paymentSaveBtn.addEventListener("click", (e) => {
						e.preventDefault();
						if (paymentStatus) paymentStatus.textContent = "Saving...";
						this.saveCustomerAccountsFields(
							customerId,
							{ payment_terms: paymentTermsControl.get_value() || "" },
							paymentStatus,
							paymentSaveBtn
						);
					});
				}

				if (loyaltySaveBtn) {
					loyaltySaveBtn.addEventListener("click", (e) => {
						e.preventDefault();
						if (loyaltyStatus) loyaltyStatus.textContent = "Saving...";
						this.saveCustomerAccountsFields(
							customerId,
							{ loyalty_program: loyaltyProgramControl.get_value() || "" },
							loyaltyStatus,
							loyaltySaveBtn
						);
					});
				}

				this.renderCreditLimitsSection(customerId);
				this.renderPartyAccountsSection(customerId);

				setTimeout(() => {
					this.accounts_initial_values = {
						payment_terms: getLinkInitial(paymentTermsControl),
						loyalty_program: getLinkInitial(loyaltyProgramControl)
					};
					updatePaymentSave();
					updateLoyaltySave();
				}, 200);
			}
		});
	}

	renderCreditLimitsSection(customerId) {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const panel = wrapper?.querySelector('[data-tab-panel="Accounts"]');
		const container = panel?.querySelector("#customer-credit-limits");
		if (!container) return;

		const rows = Array.isArray(this.current_credit_limits) ? this.current_credit_limits : [];
		const cardsHtml = rows.length
			? `
				<div class="row">
					${rows
				.map((row, idx) => {
					const company = this.escapeHtml(row.company || "-");
					const credit = row.credit_limit ?? 0;
					const bypass = row.bypass_credit_limit_check ? "Yes" : "No";
					return `
								<div class="col-12 col-md-6 mb-2">
									<div class="card h-100">
										<div class="card-body">
											<div class="d-flex justify-content-between align-items-start">
												<div class="fw-semibold">${company}</div>
												<button class="btn btn-xs btn-default1 credit-limit-edit-btn" data-row-index="${idx}">
													<i class="fa fa-pencil"></i>
												</button>
											</div>
											<div class="text-muted fs-sm">Credit Limit: ${credit}</div>
											<div class="text-muted fs-sm">Bypass Check: ${bypass}</div>
										</div>
									</div>
								</div>
							`;
				})
				.join("")}
				</div>
			`
			: `<p class="text-muted fs-sm mb-0">No credit limits added.</p>`;

		container.innerHTML = `
			<div class="d-flex justify-content-between align-items-center mb-2">
				<div class="fw-semibold">Credit Limits</div>
				<button class="btn btn-sm credit-limit-add-btn" data-customer-id="${this.escapeHtml(customerId)}">
					<i class="fa fa-plus me-1"></i> Add
				</button>
			</div>
			${cardsHtml}
		`;

		const $wrapper = $(wrapper);
		$wrapper.off("click.credit-limit-add").on("click.credit-limit-add", ".credit-limit-add-btn", (e) => {
			e.preventDefault();
			this.openCreditLimitDialog(customerId);
		});
		$wrapper.off("click.credit-limit-edit").on("click.credit-limit-edit", ".credit-limit-edit-btn", (e) => {
			e.preventDefault();
			const rowIndex = parseInt($(e.currentTarget).data("row-index"), 10);
			if (Number.isNaN(rowIndex)) return;
			this.openCreditLimitDialog(customerId, rowIndex);
		});
	}

	renderPartyAccountsSection(customerId) {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const panel = wrapper?.querySelector('[data-tab-panel="Accounts"]');
		const container = panel?.querySelector("#customer-party-accounts");
		if (!container) return;

		const rows = Array.isArray(this.current_party_accounts) ? this.current_party_accounts : [];
		const cardsHtml = rows.length
			? `
				<div class="row">
					${rows
				.map((row, idx) => {
					const company = this.escapeHtml(row.company || "-");
					const account = this.escapeHtml(row.account || "-");
					const currency = this.escapeHtml(row.account_currency || "-");
					const isDefault = row.default_account ? "Yes" : "No";
					return `
								<div class="col-12 col-md-6 mb-2">
									<div class="card h-100">
										<div class="card-body">
											<div class="d-flex justify-content-between align-items-start">
												<div class="fw-semibold">${company}</div>
												<button class="btn btn-xs btn-default1 party-account-edit-btn" data-row-index="${idx}">
													<i class="fa fa-pencil"></i>
												</button>
											</div>
											<div class="text-muted fs-sm">Account: ${account}</div>
											<div class="text-muted fs-sm">Currency: ${currency}</div>
											<div class="text-muted fs-sm">Default: ${isDefault}</div>
										</div>
									</div>
								</div>
							`;
				})
				.join("")}
				</div>
			`
			: `<p class="text-muted fs-sm mb-0">No accounts added.</p>`;

		container.innerHTML = `
			<div class="d-flex justify-content-between align-items-center mb-2">
				<div class="fw-semibold">Party Accounts</div>
				<button class="btn btn-sm party-account-add-btn" data-customer-id="${this.escapeHtml(customerId)}">
					<i class="fa fa-plus me-1"></i> Add
				</button>
			</div>
			${cardsHtml}
		`;

		const $wrapper = $(wrapper);
		$wrapper.off("click.party-account-add").on("click.party-account-add", ".party-account-add-btn", (e) => {
			e.preventDefault();
			this.openPartyAccountDialog(customerId);
		});
		$wrapper.off("click.party-account-edit").on("click.party-account-edit", ".party-account-edit-btn", (e) => {
			e.preventDefault();
			const rowIndex = parseInt($(e.currentTarget).data("row-index"), 10);
			if (Number.isNaN(rowIndex)) return;
			this.openPartyAccountDialog(customerId, rowIndex);
		});
	}

	openCreditLimitDialog(customerId, rowIndex = null) {
		const isEdit = Number.isInteger(rowIndex);
		const row = isEdit ? (this.current_credit_limits[rowIndex] || {}) : {};
		const defaultCompany = "64 Network Security Pvt Ltd - TG";

		const dialog = new frappe.ui.Dialog({
			title: isEdit ? __("Edit Credit Limit") : __("Add Credit Limit"),
			fields: [
				{
					fieldtype: "Link",
					options: "Company",
					fieldname: "company",
					label: "Company",
					reqd: 1
				},
				{
					fieldtype: "Currency",
					fieldname: "credit_limit",
					label: "Credit Limit"
				},
				{
					fieldtype: "Check",
					fieldname: "bypass_credit_limit_check",
					label: "Bypass Credit Limit Check"
				}
			],
			primary_action_label: __("Save"),
			primary_action: (values) => {
				if (!values) return;
				const updatedRow = {
					...row,
					...values,
					credit_limit: values.credit_limit ? parseFloat(values.credit_limit) : 0,
					bypass_credit_limit_check: values.bypass_credit_limit_check ? 1 : 0
				};

				let updatedRows = [];
				if (isEdit) {
					updatedRows = this.current_credit_limits.map((item, idx) =>
						idx === rowIndex ? updatedRow : item
					);
				} else {
					updatedRows = [...this.current_credit_limits, updatedRow];
				}

				this.saveCustomerCreditLimits(customerId, updatedRows, dialog);
			}
		});

		dialog.show();
		dialog.set_values({
			company: row.company || (!isEdit ? defaultCompany : ""),
			credit_limit: row.credit_limit ?? 0,
			bypass_credit_limit_check: row.bypass_credit_limit_check ? 1 : 0
		});
		setTimeout(() => {
			const closeBtn = dialog.get_close_btn();
			if (!closeBtn || !closeBtn.length) {
				return;
			}
			closeBtn.off("click.dialog").on("click.dialog", function () {
				dialog.hide();
			});
		}, 50);
	}

	saveCustomerCreditLimits(customerId, creditLimits, dialog) {
		frappe.call({
			method: "renewal_module.custom_module.page.customers.customers.update_customer_credit_limits",
			args: {
				customer_id: customerId,
				credit_limits: JSON.stringify(creditLimits || [])
			},
			callback: (r) => {
				const updated = r && r.message && Array.isArray(r.message) ? r.message : creditLimits;
				this.current_credit_limits = updated;
				this.renderCreditLimitsSection(customerId);
				if (dialog) dialog.hide();
				frappe.show_alert({ message: "Credit limits updated", indicator: "green" });
			},
			error: (err) => {
				console.error("Credit limit update failed", err);
				frappe.msgprint("Failed to update credit limits.");
			}
		});
	}

	openPartyAccountDialog(customerId, rowIndex = null) {
		const isEdit = Number.isInteger(rowIndex);
		const row = isEdit ? (this.current_party_accounts[rowIndex] || {}) : {};
		const defaultCompany = "64 Network Security Pvt Ltd - TG";

		const dialog = new frappe.ui.Dialog({
			title: isEdit ? __("Edit Party Account") : __("Add Party Account"),
			fields: [
				{
					fieldtype: "Link",
					options: "Company",
					fieldname: "company",
					label: "Company",
					reqd: 1
				},
				{
					fieldtype: "Link",
					options: "Account",
					fieldname: "account",
					label: "Account",
					reqd: 1
				},
				{
					fieldtype: "Data",
					fieldname: "account_currency",
					label: "Account Currency"
				},
				{
					fieldtype: "Check",
					fieldname: "default_account",
					label: "Default Account"
				}
			],
			primary_action_label: __("Save"),
			primary_action: (values) => {
				if (!values) return;
				const updatedRow = {
					...row,
					...values,
					default_account: values.default_account ? 1 : 0
				};

				let updatedRows = [];
				if (isEdit) {
					updatedRows = this.current_party_accounts.map((item, idx) =>
						idx === rowIndex ? updatedRow : item
					);
				} else {
					updatedRows = [...this.current_party_accounts, updatedRow];
				}

				this.saveCustomerPartyAccounts(customerId, updatedRows, dialog);
			}
		});

		dialog.show();
		dialog.set_values({
			company: row.company || (!isEdit ? defaultCompany : ""),
			account: row.account || "",
			account_currency: row.account_currency || "",
			default_account: row.default_account ? 1 : 0
		});

		const accountField = dialog.fields_dict.account;
		if (accountField) {
			accountField.get_query = () => {
				const company = dialog.get_value("company");
				return {
					filters: {
						account_type: "Receivable",
						root_type: "Asset",
						company,
						is_group: 0
					}
				};
			};
		}

		const companyField = dialog.fields_dict.company;
		if (companyField && companyField.$input) {
			companyField.$input.off("change.party-account-company").on("change.party-account-company", () => {
				const company = dialog.get_value("company");
				if (!company) return;
				const account = dialog.get_value("account");
				if (isEdit || account) return;
				frappe.call({
					method: "frappe.client.get",
					args: {
						doctype: "Company",
						name: company
					},
					callback: (r) => {
						const defaultAccount = r && r.message ? r.message.default_receivable_account : "";
						if (defaultAccount) {
							dialog.set_value("account", defaultAccount);
						}
					}
				});
				if (accountField && accountField.refresh) {
					accountField.refresh();
				}
			});
		}
		setTimeout(() => {
			const closeBtn = dialog.get_close_btn();
			if (!closeBtn || !closeBtn.length) {
				return;
			}
			closeBtn.off("click.dialog").on("click.dialog", function () {
				dialog.hide();
			});
		}, 50);
	}


	saveCustomerPartyAccounts(customerId, accounts, dialog) {
		frappe.call({
			method: "renewal_module.custom_module.page.customers.customers.update_customer_party_accounts",
			args: {
				customer_id: customerId,
				accounts: JSON.stringify(accounts || [])
			},
			callback: (r) => {
				const updated = r && r.message && Array.isArray(r.message) ? r.message : accounts;
				this.current_party_accounts = updated;
				this.renderPartyAccountsSection(customerId);
				if (dialog) dialog.hide();
				frappe.show_alert({ message: "Party accounts updated", indicator: "green" });
			},
			error: (err) => {
				console.error("Party account update failed", err);
				frappe.msgprint("Failed to update party accounts.");
			}
		});
	}

	saveCustomerAccountsFields(customerId, fields, statusEl, saveBtn) {
		if (!customerId) return;
		frappe.call({
			method: "renewal_module.custom_module.page.customers.customers.update_customer_accounts_fields",
			args: {
				customer_id: customerId,
				fields: JSON.stringify(fields || {})
			},
			callback: (r) => {
				const updated = r && r.message ? r.message : fields;
				this.current_customer_details = {
					...(this.current_customer_details || {}),
					...updated
				};

				if (this.accounts_controls) {
					if (Object.prototype.hasOwnProperty.call(updated, "payment_terms")) {
						this.accounts_controls.payment_terms.set_value(updated.payment_terms || "");
						this.accounts_initial_values.payment_terms = updated.payment_terms || "";
					}
					if (Object.prototype.hasOwnProperty.call(updated, "loyalty_program")) {
						this.accounts_controls.loyalty_program.set_value(updated.loyalty_program || "");
						this.accounts_initial_values.loyalty_program = updated.loyalty_program || "";
					}
					if (Object.prototype.hasOwnProperty.call(updated, "loyalty_program_tier")) {
						this.accounts_controls.loyalty_program_tier.set_value(updated.loyalty_program_tier || "");
					}
				}

				if (saveBtn) saveBtn.classList.add("d-none");
				if (statusEl) statusEl.textContent = "Saved";
				frappe.show_alert({ message: "Account fields updated", indicator: "green" });
			},
			error: (err) => {
				console.error("Account field update failed", err);
				if (statusEl) statusEl.textContent = "Failed to save";
				frappe.msgprint("Failed to update account fields.");
			}
		});
	}

	renderPortalUsersTab(customerId, customerData = null) {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const panel = wrapper?.querySelector('[data-tab-panel="portal-users"]');
		const container = panel?.querySelector(".post-container");
		if (!container) return;

		const customerInfo = customerData || this.current_customer_details || {};
		this.current_portal_users = Array.isArray(customerInfo.portal_users)
			? customerInfo.portal_users.slice()
			: [];

		container.innerHTML = `
			<div class="d-flex justify-content-between align-items-center mb-2">
				<div class="fw-semibold">Portal Users</div>
				<button class="btn btn-sm portal-user-add-btn" data-customer-id="${this.escapeHtml(customerId)}">
					<i class="fa fa-plus me-1"></i> Add
				</button>
			</div>
			<div id="portal-users-list"></div>
		`;

		this.renderPortalUsersSection(customerId);

		const $wrapper = $(wrapper);
		$wrapper.off("click.portal-user-add").on("click.portal-user-add", ".portal-user-add-btn", (e) => {
			e.preventDefault();
			this.openPortalUserDialog(customerId);
		});
		$wrapper.off("click.portal-user-edit").on("click.portal-user-edit", ".portal-user-edit-btn", (e) => {
			e.preventDefault();
			const rowIndex = parseInt($(e.currentTarget).data("row-index"), 10);
			if (Number.isNaN(rowIndex)) return;
			this.openPortalUserDialog(customerId, rowIndex);
		});
	}

	renderPortalUsersSection(customerId) {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const panel = wrapper?.querySelector('[data-tab-panel="portal-users"]');
		const container = panel?.querySelector("#portal-users-list");
		if (!container) return;

		const rows = Array.isArray(this.current_portal_users) ? this.current_portal_users : [];
		const cardsHtml = rows.length
			? `
				<div class="row">
					${rows
				.map((row, idx) => {
					const user = this.escapeHtml(row.user || "-");
					return `
								<div class="col-12 col-md-6 mb-2">
									<div class="card h-100">
										<div class="card-body">
											<div class="d-flex justify-content-between align-items-start">
												<div class="fw-semibold">${user}</div>
												<button class="btn btn-xs btn-default1 portal-user-edit-btn" data-row-index="${idx}">
													<i class="fa fa-pencil"></i>
												</button>
											</div>
											<div class="text-muted fs-sm">User</div>
										</div>
									</div>
								</div>
							`;
				})
				.join("")}
				</div>
			`
			: `<p class="text-muted fs-sm mb-0">No portal users added.</p>`;

		container.innerHTML = cardsHtml;
	}

	openPortalUserDialog(customerId, rowIndex = null) {
		const isEdit = Number.isInteger(rowIndex);
		const row = isEdit ? (this.current_portal_users[rowIndex] || {}) : {};

		const dialog = new frappe.ui.Dialog({
			title: isEdit ? __("Edit Portal User") : __("Add Portal User"),
			fields: [
				{
					fieldtype: "Link",
					options: "User",
					fieldname: "user",
					label: "User",
					reqd: 1
				}
			],
			primary_action_label: __("Save"),
			primary_action: (values) => {
				if (!values) return;
				const updatedRow = {
					...row,
					...values
				};

				let updatedRows = [];
				if (isEdit) {
					updatedRows = this.current_portal_users.map((item, idx) =>
						idx === rowIndex ? updatedRow : item
					);
				} else {
					updatedRows = [...this.current_portal_users, updatedRow];
				}

				this.saveCustomerPortalUsers(customerId, updatedRows, dialog);
			}
		});

		dialog.show();
		dialog.set_values({
			user: row.user || ""
		});
		setTimeout(() => {
			const closeBtn = dialog.get_close_btn();
			if (!closeBtn || !closeBtn.length) {
				return;
			}
			closeBtn.off("click.dialog").on("click.dialog", function () {
				dialog.hide();
			});
		}, 50);
	}

	saveCustomerPortalUsers(customerId, portalUsers, dialog) {
		frappe.call({
			method: "renewal_module.custom_module.page.customers.customers.update_customer_portal_users",
			args: {
				customer_id: customerId,
				portal_users: JSON.stringify(portalUsers || [])
			},
			callback: (r) => {
				const updated = r && r.message && Array.isArray(r.message) ? r.message : portalUsers;
				this.current_portal_users = updated;
				this.renderPortalUsersSection(customerId);
				if (dialog) dialog.hide();
				frappe.show_alert({ message: "Portal users updated", indicator: "green" });
			},
			error: (err) => {
				console.error("Portal users update failed", err);
				frappe.msgprint("Failed to update portal users.");
			}
		});
	}

	fetchConnectionCount(dataType, customerId, callback) {
		// Map doctypes to their customer field names
		const customerFieldMap = {
			"Opportunity": "party_name",
			"Quotation": "party_name",
			"Customer Order Form": "customer",
			"Sales Order": "customer",
			"Sales Invoice": "customer",
			"Renewal List": "customer_name",
			"Call List": "name1",
			"Issue": "customer",
			"Payment Entry": "party_name"
		};

		const customerField = customerFieldMap[dataType] || "customer";

		frappe.call({
			method: "renewal_module.custom_module.page.customers.customers.get_connection_count",
			args: {
				doctype: dataType,
				customer_id: customerId,
				customer_field: customerField
			},
			callback: (r) => {
				const count = r.message || 0;
				callback(count);
			},
			error: (err) => {
				console.error(`Error fetching ${dataType} count:`, err);
				callback(0);
			}
		});
	}

	toggleInlineConnectionDetails(item, dataType, customerId) {
		// Navigate to the appropriate page with filters based on connection type
		const filterConfig = {
			"Opportunity": {
				doctype: "Opportunity",
				fieldname: "party_name",
				customRoute: "opportunity-list"
				//customRoute: "opportunity"
			},
			"Quotation": {
				doctype: "Quotation",
				fieldname: "party_name",
				customRoute: "quotation-list"
				//customRoute: "quotation"
			},
			"Customer Order Form": {
				doctype: "Customer Order Form",
				fieldname: "customer",
				customRoute: "cof-list"
			},
			"Sales Order": {
				doctype: "Sales Order",
				fieldname: "customer",
				customRoute: "sales-order"
			},
			"Sales Invoice": {
				doctype: "Sales Invoice",
				fieldname: "customer",
				customRoute: "sales-invoice"
			},
			"Renewal List": {
				doctype: "Renewal List",
				fieldname: "customer_name",
				customRoute: "renewal-list"
			},
			"Issue": {
				doctype: "Issue",
				fieldname: "customer",
				customRoute: "ticketss"
			},
			"Call List": {
				doctype: "Call List",
				fieldname: "name1",
				customRoute: "call-lists"
			},
			"Payment Entry": {
				doctype: "Payment Entry",
				fieldname: "party_name",
				customRoute: "payment-entry"
			}
		};

		const config = filterConfig[dataType];
		if (!config) {
			frappe.msgprint(`No navigation configured for ${dataType}`);
			return;
		}

		// For Issue, Opportunity, Quotation, and Call List, use customRoute base with filters param
		const customRouteTypes = ["Issue", "Opportunity", "Quotation", "Call List", "Customer Order Form"];
		//const customRouteTypes = ["Issue", "Call List"];
		if (customRouteTypes.includes(dataType) && config.customRoute) {
			// Always use filters param as expected by custom page
			const filters = [[config.doctype, config.fieldname, "=", customerId, false]];
			const encodedFilters = encodeURIComponent(JSON.stringify(filters));
			const customUrl = `/app/${config.customRoute}?filters=${encodedFilters}`;
			// window.open(customUrl, '_blank');
			window.location.assign(customUrl);
			return;
		}

		// For other doctypes, use standard list route with filter
		const routeName = frappe.router.slug(config.doctype);
		const listUrl = `/app/list/${routeName}?${config.fieldname}=%5B%22%3D%22%2C%22${encodeURIComponent(customerId)}%22%5D`;
		//window.open(listUrl, '_blank');
		window.location.assign(listUrl);
	}

	getPriorityColor(priority) {
		const priorityColors = {
			'High': '#dc3545',
			'Medium': '#ffc107',
			'Low': '#28a745'
		};
		return priorityColors[priority] || '#6c757d';
	}

	getStatusColor(status) {
		if (!status) return '#6c757d';

		const statusColors = {
			'Open': '#007bff',
			'Replied': '#17a2b8',
			'Closed': '#28a745',
			'Draft': '#6c757d',
			'Submitted': '#007bff',
			'Cancelled': '#dc3545',
			'Active': '#28a745',
			'Inactive': '#6c757d',
			'To Deliver and Bill': '#ffc107',
			'To Bill': '#fd7e14',
			'To Deliver': '#20c997',
			'Completed': '#28a745',
			'Unpaid': '#dc3545',
			'Paid': '#28a745',
			'Overdue': '#dc3545',
			'Partially Paid': '#ffc107'
		};

		return statusColors[status] || '#6c757d';
	}

	bindevent(customer_id) {
		const me = this;
		$(this.wrapper).off("click", "#email-send").on("click", "#email-send", async function (e) {
			e.preventDefault();

			if (!customer_id) {
				frappe.msgprint("No customer selected.");
				return;
			}
			const getCurrentUserEmailSignature = async () => {
				try {
					const response = await frappe.db.get_value("User", frappe.session.user, "email_signature");
					return String(response?.message?.email_signature || "").trim();
				} catch (err) {
					console.warn("Unable to fetch current user email signature", err);
					return "";
				}
			};
			// 🔹 Fetch Customer details
			let customer_doc = await frappe.db.get_doc("Customer", customer_id);
			let customer = customer_id;

			// 🔹 Fetch contact + user email options
			let email_options = [];
			try {
				const res = await frappe.call({
					method: "renewal_module.custom_module.page.customers.customers.get_contact_emails",
					args: { customer: customer }
				});
				email_options = res.message || [];
			} catch (err) {
				console.error("Error fetching contact emails:", err);
			}
			const userEmailSignature = await getCurrentUserEmailSignature();
			const defaultMessageContent = userEmailSignature
				? `${"<p><br></p>".repeat(5)}${userEmailSignature}`
				: "";

			// Fallback email
			let default_email = customer_doc.email_id || customer_doc.contact_email || "";

			// 🔹 Create dialog
			let email_dialog = new frappe.ui.Dialog({
				title: __("Send Email"),
				fields: [
					{
						label: __("To"),
						fieldname: "recipients",
						fieldtype: "MultiSelect",
						reqd: 1,
						options: email_options,
						default: default_email,
						description: "Select one or more recipients"
					},
					{
						fieldtype: "HTML",
						fieldname: "cc_bcc_links",
						options: `
								<div style="margin-top:-10px; font-size:12px;">
									<a href="#" class="add-cc">${__("Add CC")}</a> |
									<a href="#" class="add-bcc">${__("Add BCC")}</a>
								</div>
							`
					},
					{
						label: __("CC"),
						fieldname: "cc",
						fieldtype: "MultiSelect",
						options: email_options,
						hidden: 1
					},
					{
						label: __("BCC"),
						fieldname: "bcc",
						fieldtype: "MultiSelect",
						options: email_options,
						hidden: 1
					},
					{
						label: __("Subject"),
						fieldname: "subject",
						fieldtype: "Data",
						default: `Customer: ${customer_id}`,
						reqd: 1
					},
					{
						label: __("Message"),
						fieldname: "content",
						fieldtype: "Text Editor",
						reqd: 1,
						default: defaultMessageContent

					},
					{
						fieldtype: "Section Break",
						label: __("Attachments")
					},
					{
						fieldtype: "HTML",
						fieldname: "attachments_list",
						options: `<div id="email-attachments-list" class="text-muted small">${__("No attachments")}</div>`
					},
					{
						label: __("Add Attachments"),
						fieldname: "add_attachments_btn",
						fieldtype: "Button"
					},
					{
						label: __("Send me a copy"),
						fieldname: "send_me_a_copy",
						fieldtype: "Check",
						default: 1
					}
				],
				primary_action_label: __("Send"),
				primary_action: function (values) {
					if (!values.recipients || !values.subject || !values.content) {
						frappe.msgprint("Please fill in all required fields.");
						return;
					}

					let recipients = Array.isArray(values.recipients)
						? values.recipients.join(", ")
						: values.recipients;
					let cc = Array.isArray(values.cc) ? values.cc.join(", ") : values.cc;
					let bcc = Array.isArray(values.bcc) ? values.bcc.join(", ") : values.bcc;

					let attachments = Array.isArray(email_dialog.__attachments) ? email_dialog.__attachments : [];
					// fallback to any single attach value if user didn't use the button
					if (!attachments.length && values.attachments) {
						attachments = [{
							file_url: values.attachments.file_url || values.attachments,
							file_name: values.attachments.file_name || null
						}];
					}


					frappe.call({
						method: "renewal_module.custom_module.page.customers.customers.send_issue_email",
						args: {
							recipients: recipients,
							cc: cc,
							bcc: bcc,
							subject: values.subject,
							content: values.content,
							customer: customer_id,
							attachments: attachments,
							send_me_a_copy: values.send_me_a_copy || 0
						},
						freeze: true,
						freeze_message: "Sending email...",
						callback: function (r) {
							if (!r.exc) {
								frappe.show_alert({
									message: __("✅ Email sent successfully!"),
									indicator: "green"
								});
								email_dialog.hide();
							} else {
								frappe.msgprint("Failed to send email.");
							}
						}
					});
				}
			});

			// Track attachments added via the button
			email_dialog.__attachments = [];

			const getAttachmentsList = () => email_dialog.get_field("attachments_list")?.$wrapper.find("#email-attachments-list");

			function renderAttachmentList() {
				const $list = getAttachmentsList();
				if (!$list || !$list.length) return;
				const items = email_dialog.__attachments || [];
				if (!items.length) {
					$list.html(__("No attachments"));
					return;
				}
				const html = items.map((att, idx) => {
					const name = att.file_name || att.file_url || att.name || `File ${idx + 1}`;
					return `<div class="d-flex align-items-center gap-1 mb-1">
						<i class="fa fa-paperclip text-muted"></i>
						<span class="text-truncate" title="${frappe.utils.escape_html(name)}">${frappe.utils.escape_html(name)}</span>
						<a href="#" data-idx="${idx}" class="text-danger remove-att" title="${__("Remove")}">&times;</a>
					</div>`;
				}).join("");
				$list.html(html);
			}

			// Add attachments button
			const addBtn = email_dialog.get_field("add_attachments_btn");
			if (addBtn) {
				addBtn.$input.off("click.addatt").on("click.addatt", () => {
					new frappe.ui.FileUploader({
						allow_multiple: true,
						on_success(file) {
							email_dialog.__attachments.push({
								file_url: file.file_url,
								file_name: file.file_name || file.name || null
							});
							renderAttachmentList();
						}
					});
				});
			}

			// Remove attachment from list
			email_dialog.get_field("attachments_list").$wrapper.off("click.removeatt").on("click.removeatt", "a.remove-att", function (e) {
				e.preventDefault();
				const idx = Number($(this).data("idx"));
				if (Number.isInteger(idx) && email_dialog.__attachments[idx]) {
					email_dialog.__attachments.splice(idx, 1);
					renderAttachmentList();
				}
			});

			renderAttachmentList();

			// 🔹 Handle CC/BCC show/hide (ERPNext style)
			email_dialog.$wrapper.find(".add-cc").on("click", function (e) {
				e.preventDefault();
				const cc_field = email_dialog.get_field("cc");
				cc_field.df.hidden = 0; // make visible
				cc_field.refresh(); // re-render field
				$(this).hide();
			});

			email_dialog.$wrapper.find(".add-bcc").on("click", function (e) {
				e.preventDefault();
				const bcc_field = email_dialog.get_field("bcc");
				bcc_field.df.hidden = 0;
				bcc_field.refresh();
				$(this).hide();
			});

			email_dialog.show();
			setTimeout(() => {
				const closeBtn = email_dialog.get_close_btn();
				if (!closeBtn || !closeBtn.length) {
					return;
				}
				closeBtn.off("click.email_dialog").on("click.email_dialog", function () {
					email_dialog.hide();   // ✅ FIXED
				});
			}, 50);
			// FIX: Make all frappe.msgprint dialogs close correctly
			$(document).off("click.msgprintclose")
				.on("click.msgprintclose",
					".msgprint-dialog .btn-modal-close, .msgprint-dialog .modal-header .close",
					function (e) {
						e.preventDefault();
						e.stopPropagation();

						// Use Frappe’s official msgprint dialog object
						if (frappe.msg_dialog && frappe.msg_dialog.hide) {
							frappe.msg_dialog.hide();
							return;
						}

						// Fallback if object missing
						const $dialog = $(this).closest(".msgprint-dialog");
						$dialog.remove();
						$(".modal-backdrop").remove();
					});

		});
	}

	bindCustomerRenameButton(customer_id) {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const nameText = wrapper?.querySelector("#customer-name-text");
		if (!nameText) return;

		const meta = frappe.get_meta("Customer") || {};
		const allowRename = Object.prototype.hasOwnProperty.call(meta, "allow_rename")
			? !!meta.allow_rename
			: true;
		const hasWrite = frappe.model?.can_write
			? frappe.model.can_write("Customer")
			: frappe.perm.has_perm("Customer", 0, "write");
		const canRename = allowRename && hasWrite;

		nameText.dataset.customerId = String(customer_id || this.current_customer_id || "").trim();
		nameText.style.cursor = canRename ? "pointer" : "default";
		nameText.title = canRename
			? __("Click to rename customer")
			: __("You do not have permission to rename this customer");

		nameText.onclick = (e) => {
			e.preventDefault();
			e.stopPropagation();

			if (!canRename) {
				frappe.msgprint(__("You do not have permission to rename this Customer."));
				return;
			}

			const targetCustomer = nameText.dataset.customerId || customer_id || this.current_customer_id;
			this.openCustomerRenamePopup(targetCustomer);
		};
	}

	handleCustomerRenameResult(oldName, newName, isMerge = false) {
		const updatedName = String(newName || oldName || "").trim();
		if (!updatedName) return;

		if (locals.Customer && oldName && oldName !== updatedName && locals.Customer[oldName]) {
			delete locals.Customer[oldName];
		}

		this.current_customer_id = updatedName;
		this.setPageTitle(`Customers/${updatedName}`);
		frappe.show_alert({
			message: isMerge
				? __("Customer merged into {0}", [updatedName])
				: __("Customer renamed to {0}", [updatedName]),
			indicator: "green",
		});

		if (frappe.get_route()[0] === "customers" && frappe.get_route()[1] === updatedName) {
			this.bindCustomerRenameButton(updatedName);
			this.load_customer_details(updatedName);
		} else {
			frappe.set_route("customers", updatedName);
		}
	}

	openCustomerRenamePopup(customer_id) {
		const currentName = String(customer_id || this.current_customer_id || "").trim();
		if (!currentName) {
			frappe.msgprint(__("Customer name is missing."));
			return;
		}

		const canMerge = frappe.model?.can_write
			? frappe.model.can_write("Customer")
			: frappe.perm.has_perm("Customer", 0, "write");
		const mergeWarning = __("This cannot be undone");

		const dialog = new frappe.ui.Dialog({
			title: __("Rename {0}", [currentName]),
			fields: [
				{
					label: __("Current Name"),
					fieldname: "old_name_display",
					fieldtype: "Data",
					default: currentName,
					read_only: 1,
				},
				{
					label: __("New Name"),
					fieldname: "new_name",
					fieldtype: "Data",
					reqd: 1,
					default: currentName,
				},
				{
					label: __("Merge with existing") + " <b>(" + mergeWarning + ")</b>",
					fieldname: "merge",
					fieldtype: "Check",
					default: 0,
					read_only: canMerge ? 0 : 1,
					description: canMerge
						? __("Choose this only when merging into an existing Customer.")
						: __("You need Customer write access to use merge."),
				},
			],
		});

		const forceHideDialog = () => {
			try {
				dialog.hide();
			} catch (e) {
				console.warn("Unable to hide rename dialog via dialog.hide()", e);
			}

			const $wrapper = dialog.$wrapper || $(dialog.wrapper);
			if ($wrapper && $wrapper.length) {
				if (typeof $wrapper.modal === "function") {
					$wrapper.modal("hide");
				}
				$wrapper.removeClass("show").hide();
			}

			$(".modal-backdrop").remove();
			$("body").removeClass("modal-open");
		};

		const showRenameError = (error, attemptedMerge = false) => {
			let serverMessage = "";
			const rawMessages = error?._server_messages;

			if (rawMessages) {
				try {
					const parsedMessages = JSON.parse(rawMessages);
					serverMessage = (parsedMessages || [])
						.map((msg) => {
							try {
								const parsed = JSON.parse(msg);
								return parsed.message || parsed;
							} catch (e) {
								return msg;
							}
						})
						.filter(Boolean)
						.join("<br>");
				} catch (e) {
					serverMessage = "";
				}
			}

			const fallbackMessage = attemptedMerge
				? __("You do not have permission to merge these customer records.")
				: error?.message || __("Unable to rename customer.");

			frappe.msgprint({
				title: attemptedMerge ? __("Merge not allowed") : __("Rename failed"),
				indicator: "red",
				message: serverMessage || fallbackMessage,
			});
		};

		const executeRename = (newName, merge = false) => {
			dialog.disable_primary_action();

			return frappe.call({
				method: "renewal_module.custom_module.page.customers.customers.rename_or_merge_customer",
				freeze: true,
				freeze_message: merge ? __("Merging customer...") : __("Updating related fields..."),
				args: {
					old_name: currentName,
					new_name: newName,
					merge: merge ? 1 : 0,
				},
			})
				.then((r) => {
					if (r.exc) return;
					forceHideDialog();
					this.handleCustomerRenameResult(currentName, r.message || newName, merge);
				})
				.catch((error) => {
					dialog.enable_primary_action();
					showRenameError(error, merge);
				});
		};

		dialog.set_primary_action(__("Rename"), () => {
			const values = dialog.get_values();
			const newName = String(values?.new_name || "").trim();
			const shouldMerge = !!values?.merge;

			if (!newName) return;

			if (!shouldMerge && newName === currentName) {
				frappe.show_alert({
					indicator: "info",
					message: __("Unchanged"),
				});
				return;
			}

			if (shouldMerge && newName === currentName) {
				frappe.msgprint(__("Please select another existing Customer to merge into."));
				return;
			}

			if (shouldMerge && !canMerge) {
				showRenameError(null, true);
				return;
			}

			if (shouldMerge) {
				const confirmMessage = `${__("Are you sure you want to merge {0} with {1}?", [
					currentName.bold(),
					newName.bold(),
				])}<br><b>${mergeWarning}</b>`;

				frappe.confirm(confirmMessage, () => executeRename(newName, true));
				return;
			}

			executeRename(newName, false);
		});

		dialog.show();
		setTimeout(() => {
			const $wrapper = dialog.$wrapper || $(dialog.wrapper);
			const closeBtn = dialog.get_close_btn();
			if (closeBtn && closeBtn.length) {
				closeBtn.off("click.customerRenameDialog").on("click.customerRenameDialog", function (e) {
					e.preventDefault();
					e.stopImmediatePropagation();
					forceHideDialog();
				});
			}

			if ($wrapper && $wrapper.length) {
				$wrapper
					.off("click.customerRenameDialogDismiss", ".btn-modal-close, .modal-header .close")
					.on("click.customerRenameDialogDismiss", ".btn-modal-close, .modal-header .close", function (e) {
						e.preventDefault();
						e.stopImmediatePropagation();
						forceHideDialog();
					});
			}
		}, 50);
	}

	bindAccountManagerPicker(customerId, customerData = {}) {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const accountManagerEl = wrapper?.querySelector("#customer-account-manager");
		if (!accountManagerEl || !customerId) return;

		const currentUser = String(customerData.account_manager || "").trim();

		const setPickerEnabled = (enabled) => {
			accountManagerEl.onclick = null;
			accountManagerEl.onkeydown = null;

			if (enabled) {
				accountManagerEl.classList.add("customer-account-manager-link");
				accountManagerEl.setAttribute("role", "button");
				accountManagerEl.setAttribute("tabindex", "0");
				accountManagerEl.setAttribute("title", __("Click to change Account Manager and share linked documents"));
				accountManagerEl.style.cursor = "pointer";
				return;
			}

			accountManagerEl.classList.remove("customer-account-manager-link");
			accountManagerEl.removeAttribute("role");
			accountManagerEl.removeAttribute("tabindex");
			accountManagerEl.removeAttribute("title");
			accountManagerEl.style.cursor = "default";
		};

		setPickerEnabled(false);

		const openPicker = async () => {
			let userOptions = [];
			try {
				const filtersResp = await frappe.call({
					method: "renewal_module.custom_module.page.customers.customers.get_customer_filters"
				});
				const managerRows = filtersResp?.message?.account_manager || [];
				let userIds = managerRows
					.map(row => (typeof row === "string" ? row : row?.value))
					.filter(Boolean);

				if (currentUser && !userIds.includes(currentUser)) {
					userIds.push(currentUser);
				}

				if (userIds.length) {
					const infoResp = await frappe.call({
						method: "renewal_module.custom_module.page.customers.customers.get_users_basic_info",
						args: { users: JSON.stringify(userIds) }
					});

					const infoRows = Array.isArray(infoResp?.message) ? infoResp.message : [];
					userOptions = infoRows.map(u => {
						const userId = String(u.name || u.email || "").trim();
						const label = String(u.full_name || userId).trim();
						return {
							value: userId,
							label: label
						};
					}).filter(u => u.value);
				}
			} catch (err) {
				console.warn("Failed loading account manager user options", err);
			}

			if (!userOptions.length && currentUser) {
				userOptions = [{ value: currentUser, label: currentUser }];
			}

			const optionsString = userOptions
				.map(opt => `${opt.value}`)
				.join("\n");

			const dialog = new frappe.ui.Dialog({
				title: __("Set Account Manager and Share Linked Documents"),
				fields: [
					{
						fieldtype: "Select",
						fieldname: "user",
						label: __("User"),
						options: optionsString,
						reqd: 1,
						default: currentUser
					}
				],
				primary_action_label: __("Save"),
				primary_action: (values) => {
					if (!values?.user) return;
					dialog.disable_primary_action();
					frappe.call({
						method: "renewal_module.custom_module.page.customers.customers.assign_account_manager_and_share",
						args: {
							customer_id: customerId,
							user_email: values.user
						},
						callback: (r) => {
							dialog.hide();
							const result = r?.message || {};
							const updatedUser = result.account_manager || values.user;
							const sharesCount = Number(result.shared_doc_count || 0);
							$("#customer-account-manager").text(updatedUser || "");
							this.load_customer_details(customerId);
							frappe.show_alert({
								indicator: "green",
								message: __("Account Manager updated and {0} linked documents shared", [sharesCount])
							});
						},
						error: (err) => {
							console.error("Failed to update account manager", err);
							dialog.enable_primary_action();
							frappe.msgprint(__("Failed to update Account Manager."));
						}
					});
				}
			});

			dialog.show();
			setTimeout(() => {
				const closeBtn = dialog.get_close_btn();
				if (!closeBtn || !closeBtn.length) return;
				closeBtn.off("click.dialog").on("click.dialog", () => dialog.hide());
			}, 50);
		};

		const bindPickerHandlers = () => {
			setPickerEnabled(true);
			accountManagerEl.onclick = (e) => {
				e.preventDefault();
				e.stopPropagation();
				openPicker();
			};

			accountManagerEl.onkeydown = (e) => {
				if (e.key !== "Enter" && e.key !== " ") return;
				e.preventDefault();
				openPicker();
			};
		};

		const userRoles = frappe?.user_roles || [];
		const isPrivilegedUser =
			userRoles.includes("System Manager") ||
			userRoles.includes("Administrator") ||
			frappe?.session?.user === "Administrator";

		if (isPrivilegedUser) {
			bindPickerHandlers();
			return;
		}

		frappe.call({
			method: "renewal_module.custom_module.page.customers.customers.can_change_account_manager",
			args: { customer_id: customerId },
			callback: (r) => {
				const allowed = !!(r?.message?.allowed);
				if (!allowed) {
					setPickerEnabled(false);
					return;
				}

				bindPickerHandlers();
			},
			error: () => {
				setPickerEnabled(false);
			}
		});
	}



	async load_customer_details(customer_id) {

		try {
			const r = await frappe.call({
				method: "renewal_module.custom_module.page.customers.customers.get_customer_details",
				args: { name: customer_id }
			});

			const c = r.message || {};
			this.current_customer_details = c;
			console.log("showing customer data", r.message);
			const wrapper = this.page.wrapper[0] || this.page.wrapper;
			this.bindCustomerRenameButton(customer_id);
			const container = wrapper.querySelector(".profile-card");
			if (!container) return;
			container.innerHTML = "";
			const displayCustomerName = String(customer_id || c.name || c.customer_name || "").trim();
			$("#customer-name-text")
				.text(displayCustomerName)
				.attr("title", displayCustomerName);
			$("#customer-status").text(c.custom_customer_status || "");
			$("#customer-account-manager").text(c.account_manager || "");
			this.bindAccountManagerPicker(customer_id, c);


			$(this.wrapper).off("click", ".customer-status").on("click", ".customer-status", function () {
				const dialog = new frappe.ui.Dialog({
					title: __("Customer Status History"),
					fields: [
						{
							fieldtype: "Select",
							fieldname: "custom_customer_status",
							label: __("Customer Status"),
							options: ["Enabled", "Disabled", "Duplicate"],
						}
					],
					primary_action_label: __("Change status"),
					primary_action(values) {
						dialog.hide();
						frappe.call({
							method: "renewal_module.custom_module.page.customers.customers.update_customer_status",
							args: {
								customer_id: customer_id,
								status: values.custom_customer_status
							},
							callback: function (response) {
								if (response.message) {
									frappe.show_alert({ message: __("Customer status updated to {0}", [values.custom_customer_status]), indicator: "green" });
									$("#customer-status").text(values.custom_customer_status || "");
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


			const avatar = c.image
				? `<img src="${c.image}" class="rounded-circle avatar" width="72" height="72">`
				: `<div class="avatar avatar-fallback rounded-circle bg-primary d-flex align-items-center justify-content-center text-white fs-3">
                ${c.customer_name ? c.customer_name.charAt(0).toUpperCase() : "?"}
               </div>`;

			// Helper function to ensure URL has protocol
			const ensureProtocol = (url) => {
				if (!url) return '';
				url = url.trim();
				if (!/^https?:\/\//i.test(url)) {
					return 'https://' + url;
				}
				return url;
			};

			const linkedCustomerContext = {
				link_doctype: "Customer",
				link_name: String(customer_id || "").trim(),
				link_title: String(c.customer_name || customer_id || "").trim(),
				customer: String(customer_id || "").trim(),
				customer_name: String(c.customer_name || customer_id || "").trim()
			};

			const linkedQuery = new URLSearchParams(linkedCustomerContext).toString();

			const openLinkedForm = (routeParts) => {
				const context = { ...linkedCustomerContext };
				try {
					localStorage.setItem("renewal_module_new_link_context", JSON.stringify(context));
				} catch (e) {
					console.warn("Unable to persist linked customer context", e);
				}
				frappe.route_options = context;
				frappe.set_route(...routeParts);
			};

			function renderCustomerAddresses(addresses = []) {
				const esc = (v) => (v == null ? "" : frappe.utils.escape_html(String(v)));
				if (!addresses.length) {
					return `<p class="text-muted small">${__("No address added yet.")}</p>`;
				}

				return addresses.map(addr => {
					let displayHtml = addr.display || "";
					if (!displayHtml) {
						const addressParts = [];
						if (addr.address_line1) addressParts.push(esc(addr.address_line1));
						if (addr.address_line2) addressParts.push(esc(addr.address_line2));

						let cityState = "";
						if (addr.city) cityState += esc(addr.city);
						if (addr.city && addr.state) cityState += ", ";
						if (addr.state) cityState += esc(addr.state);
						if (cityState) addressParts.push(cityState);

						if (addr.pincode) addressParts.push(`Postal Code: ${esc(addr.pincode)}`);
						if (addr.country) addressParts.push(esc(addr.country));
						displayHtml = addressParts.join("<br>");
					}

					const labels = [];
					// if (addr.address_type && addr.address_type !== "Other") labels.push(__(addr.address_type));
					if (addr.is_primary_address) labels.push(__("Primary Address"));
					if (addr.is_shipping_address) labels.push(__("Shipping Address"));
					if (addr.disabled) labels.push(__("Disabled"));

					const title = esc(addr.name || addr.address_title || "Address");
					const dotSep = `<span class="text-muted" style="display:inline-flex;align-items:center;justify-content:center;font-size:16px;line-height:1;vertical-align:middle;margin:0 4px;">&middot;</span>`;
					const labelText = labels.length ? `${dotSep}<span class="text-muted">${labels.map(esc).join(`</span>${dotSep}<span class="text-muted">`)}</span>` : "";
					const addressLink = `/app/addresses/${encodeURIComponent(addr.name || "")}`;

					return `
						<div class="address-box customer-address-card">
							<p class="">
								<span><a href="${addressLink}" target="_blank" class="text-decoration-none"><b>${title}</b></a></span>${labelText}
							</p>
							<p class="address-body mb-0">${displayHtml}</p>
						</div>
					`;
				}).join("");
			}



			container.innerHTML = `
				<div class="profile-avatar-wrapper">
					<div class="profile-avatar-media">${avatar}</div>
					<button type="button" class="avatar-overlay customer-profile-edit-trigger" data-customer-id="${frappe.utils.escape_html(customer_id || "")}" title="Edit Customer">
						<i class="fa fa-edit"></i>
					</button>
				</div>	

				<ul class="info">
					${c.gstin ?
					`<li title="Tax ID: ${this.escapeHtml(c.gstin)}">
							<i class="fa fa-id-card"></i>
							<span>${this.escapeHtml(c.gstin)}</span>
						</li>`
					: ""}
					${c.territory ?
					`<li title="Territory: ${this.escapeHtml(c.territory)}">
							<i class="fa fa-map-marker-alt"></i>
							<span>${this.escapeHtml(c.territory)}</span>
						</li>`
					: ""}
					${c.employees ?
					`<li title="Employees: ${c.employees}">
							<i class="fa fa-users"></i>
							<span>${c.employees} Employees</span>
						</li>`
					: ""} 
					${c.website ?
					`<li title="Website: ${this.escapeHtml(c.website)}">
							<i class="fa fa-globe"></i>
							<a href="${ensureProtocol(this.escapeHtml(c.website))}" class="text-decoration-none" target="_blank" rel="noopener noreferrer">${this.escapeHtml(c.website)}</a>
						</li>`
					: ""}
					${c.customer_type ?
					`<li title="Customer Type: ${this.escapeHtml(c.customer_type)}">
							<i class="fa fa-briefcase"></i>
							<span>${this.escapeHtml(c.customer_type)}</span>
						</li>`
					: ""}
					${c.industry ?
					`<li title="Industry: ${this.escapeHtml(c.industry)}">
							<i class="fa fa-industry"></i>
							<span>${this.escapeHtml(c.industry)}</span>
						</li>`
					: ""}
					${c.custom_phone_number ?
					`<li title="Custom Phone: ${this.escapeHtml(c.custom_phone_number)}"> 
						<i class="fa fa-phone"></i>
						<span>${this.escapeHtml(c.custom_phone_number)}</span> </li>`
					: ""}
					${c.member_of ?
					`<li title="Member Of: ${this.escapeHtml(c.member_of)}"> 
						<i class="fa fa-sitemap"></i>
						<span>${this.escapeHtml(c.member_of)}</span> </li>`
					: ""}
					${c.custom_linked_in ?
					`<li title="LinkedIn: ${this.escapeHtml(c.custom_linked_in)}">
						<i class="fa-brands fa-linkedin"></i>
						<a href="${ensureProtocol(this.escapeHtml(c.custom_linked_in))}" class="text-decoration-none" target="_blank" rel="noopener noreferrer">${this.escapeHtml(c.custom_linked_in)}</a>
					</li>`
					: ""}
				
				</ul>
				<div class="customer-address-section">
					<div class="d-flex align-items-center justify-content-between mb-2">
						<div class="fw-semibold">Addresses</div>
						<a href="/app/addresses/new-addresses?${linkedQuery}" class="btn btn-sm btn-primary1 customer-new-address-btn" title="Add Address">
							<i class="fa fa-plus me-1"></i> New Address
						</a>
					</div>
					<div id="customer-address">
						${renderCustomerAddresses(c.addresses || [])}
					</div>
				</div>

				
			`;

			const editProfileBtn = container.querySelector(".customer-profile-edit-trigger");
			if (editProfileBtn) {
				editProfileBtn.onclick = (e) => {
					e.preventDefault();
					e.stopPropagation();
					this.openCustomerEditDialog({
						customerId: customer_id,
						title: __("Edit Customer Details"),
						onAfterSave: () => this.load_customer_details(customer_id)
					});
				};

				editProfileBtn.onkeydown = (e) => {
					if (e.key !== "Enter" && e.key !== " ") return;
					e.preventDefault();
					this.openCustomerEditDialog({
						customerId: customer_id,
						title: __("Edit Customer Details"),
						onAfterSave: () => this.load_customer_details(customer_id)
					});
				};
			}

			const newAddressBtn = container.querySelector(".customer-new-address-btn");
			if (newAddressBtn) {
				newAddressBtn.onclick = (e) => {
					e.preventDefault();
					e.stopPropagation();
					openLinkedForm(["addresses", "new-addresses"]);
				};
			}

			// -------------------- CONTACTS --------------------
			const timelinePanel = wrapper.querySelector('[data-tab-panel="contacts"]');
			const customer_contact_container = timelinePanel?.querySelector("#customer-contacts");

			if (customer_contact_container) {
				customer_contact_container.innerHTML = "";
				customer_contact_container.insertAdjacentHTML("beforeend", `
					<div class="d-flex align-items-center justify-content-end mb-2">
						<a href="/app/contactss/new?${linkedQuery}" class="btn btn-sm btn-primary1 customer-new-contact-btn" title="Add Contact">
							<i class="fa fa-plus me-1"></i> New Contact
						</a>
					</div>
				`);

				const newContactBtn = customer_contact_container.querySelector(".customer-new-contact-btn");
				if (newContactBtn) {
					newContactBtn.onclick = (e) => {
						e.preventDefault();
						e.stopPropagation();
						openLinkedForm(["contactss", "new"]);
					};
				}

				if (c.contacts && c.contacts.length > 0) {
					// Create a row container for columns
					const rowContainer = document.createElement('div');
					rowContainer.className = 'row row-cols-md-2 row-cols-1 align-items-stretch';

					// Helper function to normalize phone numbers (remove spaces, dashes, etc.)
					const normalizePhone = (phone) => {
						return phone.toString().trim().replace(/[\s\-\(\)]/g, '');
					};

					// Helper function to normalize emails
					const normalizeEmail = (email) => {
						return email.toString().trim().toLowerCase();
					};

					c.contacts.forEach((ct) => {

						const full_name = ct.full_name || `${ct.first_name || ""} ${ct.last_name || ""}`.trim();
						const designation = ct.designation ? ` · ${ct.designation}` : "";

						// Track displayed phones and emails within THIS CONTACT ONLY
						const displayedPhones = new Set();
						const displayedEmails = new Set();

						// -----------------------
						// Emails
						// -----------------------
						let emailHtml = "";
						if (Array.isArray(ct.emails) && ct.emails.length > 0) {
							ct.emails.forEach((em) => {
								// Only display if email hasn't been shown in THIS contact before
								const normalizedEmail = normalizeEmail(em.email_id);
								if (!displayedEmails.has(normalizedEmail)) {
									displayedEmails.add(normalizedEmail);
									const iconColor = em.is_primary ? "#2563eb" : "#000000"; // Blue for primary, black otherwise
									emailHtml += `
										<div class="contact-row text-truncate">
											<i class="fa fa-envelope" style="color: ${iconColor}; margin-right: 8px;"></i>
											<span class="contact-email" title="${em.email_id}">${em.email_id}</span>
										</div>
									`;
								}
							});
						}

						// -----------------------
						// Phones
						// -----------------------
						let phoneHtml = "";
						if (Array.isArray(ct.phones) && ct.phones.length > 0) {
							ct.phones.forEach((ph) => {
								// Normalize phone for comparison
								const normalizedPhone = normalizePhone(ph.phone);
								// Only display if phone hasn't been shown in THIS contact before
								if (!displayedPhones.has(normalizedPhone)) {
									displayedPhones.add(normalizedPhone);
									// If both primary phone and mobile are true, show only once with mobile icon
									if (ph.is_primary_phone && ph.is_primary_mobile_no) {
										const iconColor = "#2563eb"; // Blue for primary
										phoneHtml += `
											<div class="contact-row text-truncate">
												<i class="fa fa-mobile" style="color: ${iconColor}; margin-right: 8px; font-size: 1.2em;"></i>
												<span title="${ph.phone}">${ph.phone}</span>
											</div>
										`;
									}
									else if (ph.is_primary_phone) {
										const iconColor = "#2563eb"; // Blue for primary
										phoneHtml += `
											<div class="contact-row text-truncate">
												<i class="fa fa-phone" style="color: ${iconColor}; margin-right: 8px;"></i>
												<span title="${ph.phone}">${ph.phone}</span>
											</div>
										`;
									}
									else if (ph.is_primary_mobile_no) {
										const iconColor = "#2563eb"; // Blue for primary
										phoneHtml += `
											<div class="contact-row text-truncate">
												<i class="fa fa-mobile" style="color: ${iconColor}; margin-right: 8px; font-size: 1.2em;"></i>
												<span title="${ph.phone}">${ph.phone}</span>
											</div>
										`;
									}
									else if (!ph.is_primary_mobile_no && !ph.is_primary_phone) {
										const iconColor = "#000000"; // Black for non-primary
										phoneHtml += `
											<div class="contact-row text-truncate">
												<i class="fa fa-phone" style="color: ${iconColor}; margin-right: 8px;"></i>
												<span title="${ph.phone}">${ph.phone}</span>
											</div>
										`;
									}
								}
							});
						}

						// -----------------------
						// Badges
						// -----------------------
						const badges = [];
						if (ct.is_primary_contact) {
							badges.push(`<span class="badge2 bg-light text-dark mb-2">Primary Contact</span>`);
						}
						if (ct.is_billing_contact) {
							badges.push(`<span class="badge2 bg-light text-dark ml-2 mb-2">Billing Contact</span>`);
						}
						const socialHandles = [];

						if (ct.department) {
							socialHandles.push(`
								<div class="contact-row text-truncate"> 
								<i class="fa fa-building"></i>
								<span class="text-dark ml-2 mb-2" title="${this.escapeHtml(ct.department)}">${this.escapeHtml(ct.department)}</span> </div>
							`);
						}

						if (ct.custom_linked_in) {
							socialHandles.push(`
								<div class="contact-row text-truncate">
									<i class="fa-brands fa-linkedin"></i>
									<a href="${ensureProtocol(this.escapeHtml(ct.custom_linked_in))}" class="text-decoration-none" target="_blank" rel="noopener noreferrer" class="text-dark ml-2 mb-2" title="${this.escapeHtml(ct.custom_linked_in)}">${this.escapeHtml(ct.custom_linked_in)}</a>
								</div>
							`);
						}

						// -----------------------
						// Render Card in Column
						// -----------------------
						rowContainer.insertAdjacentHTML("beforeend", `
							<div class="col mb-2 d-flex">
								<div class="customer-contact-card h-100 w-100">
									<div class="contact-header">
										<div class="contact-name">
											<a href="/app/contactss/${ct.name}"target="_blank" class="text-decoration-none"> ${full_name}</a>${designation}
										</div>
										<i class="fa fa-pencil edit-icon hidden"></i>
									</div>

									<div class="contact-badges mb-2">
										${badges.join("")}
									</div>

									<div class="contact-details">
										${phoneHtml}
										${emailHtml}
										${socialHandles.join("")}
									</div>
								</div>
							</div>
						`);
					});

					// Append the row container to the main container
					customer_contact_container.appendChild(rowContainer);
				} else {
					customer_contact_container.insertAdjacentHTML("beforeend", `
						<p class="text-muted fs-sm mt-2">No contact available</p>
					`);
				}
			}

			// ================= SERVICES TAB =================
			const servicesPanel = wrapper.querySelector('[data-tab-panel="services"]');
			if (servicesPanel) {
				//--------- ACTIVE RENEWALS------------------
				const activeContainer = servicesPanel.querySelector("#active-renewals-container");
				const renewals = Array.isArray(c.renewals) ? c.renewals : [];
				function formatDateDMY(dateStr) {
					if (!dateStr) return "-";

					const date = new Date(dateStr);
					if (isNaN(date)) return dateStr; // fallback if invalid

					const day = String(date.getDate()).padStart(2, "0");
					const month = String(date.getMonth() + 1).padStart(2, "0");
					const year = date.getFullYear();

					return `${day}-${month}-${year}`;
				}


				if (activeContainer) {
					activeContainer.innerHTML = `
						${renewals.length ? `
							<div class="renewals-table-wrapper">
								<table class="renewals-table">
									<thead>
										<tr>
											<th>Renewal ID</th>
											<th>Item</th>
											<th>Qty</th>
											<th>Start Date</th>
											<th>End Date</th>
										</tr>
									</thead>
									<tbody>
										${renewals.map((ren) => `
											<tr>
												<td data-label="Renewal ID" class="fw-semibold"><a class="text-decoration-none" href="/app/renewal-list/${frappe.utils.escape_html(ren.renewal_id)}" target="_blank">${frappe.utils.escape_html(ren.renewal_id || "-")}</a></td>
												<td data-label="Item" title="${frappe.utils.escape_html(ren.item || '')}">${frappe.utils.escape_html(ren.item || "-")}</td>
												<td data-label="Qty">${ren.quantity ?? "-"}</td>
												<td data-label="Start Date" class="text-blue">${formatDateDMY(ren.start_date) ?? "-"}</td>
												<td data-label="End Date" class="text-orange">${formatDateDMY(ren.end_date) ?? "-"}</td>
											</tr>
										`).join("")}
									</tbody>
								</table>
							</div>
						` : `
							<p class="text-muted fs-sm mb-0">
								No active renewals available.
							</p>
						`}	
					`;
				}
				//--------- NEW RENEWALS------------------
				const newContainer = servicesPanel.querySelector("#new-renewals-container");
				const new_renewals = Array.isArray(c.new_renewals) ? c.new_renewals : [];
				if (newContainer) {
					newContainer.innerHTML = `
						${new_renewals.length ? `
							<div class="renewals-table-wrapper">
								<table class="renewals-table new-renewals-table">
									<thead>
										<tr>
											<th>Renewal ID</th>
											<th>Item</th>
											<th>Qty</th>
											<th>Start Date</th>
											<th>End Date</th>
										</tr>
									</thead>
									<tbody>
										${new_renewals.map((ren) => `
											<tr>
												<td data-label="Renewal ID" class="fw-semibold"><a class="text-decoration-none" href="/app/renewal-list/${frappe.utils.escape_html(ren.renewal_id)}" target="_blank">${frappe.utils.escape_html(ren.renewal_id || "-")}</a></td>
												<td data-label="Item" title="${frappe.utils.escape_html(ren.item || '')}">${frappe.utils.escape_html(ren.item || "-")}</td>
												<td data-label="Qty">${ren.quantity ?? "-"}</td>
												<td data-label="Start Date" class="text-blue">${formatDateDMY(ren.start_date) ?? "-"}</td>
												<td data-label="End Date" class="text-orange">${formatDateDMY(ren.end_date) ?? "-"}</td>
											</tr>
										`).join("")}
									</tbody>
								</table>
							</div>
						` : `
							<p class="text-muted fs-sm mb-0">No new renewals available.</p>
						`}
					`;

				}
			}

			// ================= SALES TEAM / TAX / SETTINGS TABS =================
			this.renderSalesTeamTab(customer_id, c.sales_team || [], c);
			this.renderTaxesTab(customer_id, c);
			this.renderSettingsTab(customer_id, c);
			this.renderAccountsTab(customer_id, c);
			this.renderPortalUsersTab(customer_id, c);
			this.bindevent(customer_id);





			//-----comments and activity timeline -----
			$("#add-comment-btn").off("click").on("click", function () {
				const $editor = $("#new-comment-input");
				const html = ($editor.html() || "").trim();
				const plain = $("<div>").html(html).text().trim();
				if (!plain) {
					frappe.msgprint("Please enter a comment.");
					return;
				}
				const finalHtml = linkifyEmails(html, plain);
				frappe.call({
					method: "renewal_module.custom_module.page.customers.customers.add_custom_comment",
					args: {
						docname: customer_id,
						content: finalHtml
					},
					callback: function (r) {
						if (!r.exc) {
							frappe.show_alert({ message: "Comment added", indicator: "green" });
							$("#new-comment-input").html("<p><br></p>");
							loadActivityTimeline(customer_id);
						}
					}
				});
			});

			// Ensure the comment avatar reflects the current user (fallbacks to session user)
			(function setCommentAvatar() {
				const fullName = (frappe.session && (frappe.session.user_fullname || frappe.session.user)) || "User";
				const initials = fullName.trim().split(/\s+/).map(s => s[0] || "").join("").toUpperCase().slice(0, 2) || "U";
				const $frame = $(".comment-section .avatar-frame");
				$frame.attr("title", fullName).text(initials);
				$frame.closest(".avatar").attr("title", fullName);
			})();

			// Keep the placeholder hidden when content exists
			(function bindPlaceholderToggle() {
				const $editor = $("#new-comment-input");
				const toggle = () => {
					const text = ($editor.text() || "").trim();
					if (text) {
						$editor.removeClass("ql-blank");
					} else {
						$editor.addClass("ql-blank");
					}
				};
				["input", "keyup", "paste", "blur", "change"].forEach(evt => {
					$editor.off(`${evt}.placeholder`).on(`${evt}.placeholder`, toggle);
				});
				toggle();
			})();

			// ------------------- MENTIONS AUTOCOMPLETE -------------------
			// Fetch active users once and keep in memory
			let _mention_users = [];
			frappe.call({
				method: "frappe.client.get_list",
				args: {
					doctype: "User",
					fields: ["name", "email", "full_name"],
					filters: { enabled: 1 },
					limit_page_length: 250
				},
				callback: (r) => {
					_mention_users = (r.message || [])
						.map(u => ({
							email: u.email || u.name,
							name: u.full_name || u.name
						}))
						.filter(u => !!u.email);
				}
			});

			// Create dropdown element
			const $mentionDropdown = $(
				'<div id="mention-dropdown" class="mention-dropdown d-none card shadow-sm" style="position:absolute;z-index:10000;min-width:220px;max-height:220px;overflow:auto;padding:4px;"></div>'
			);
			$(document.body).append($mentionDropdown);
			// simple active item style
			$('head').append(`
				<style>
					.mention-item.active{background:#f1f3f5;border-radius:4px;}
					a.mention{background:#eaf4ff;color:#0366d6;padding:2px 6px;border-radius:4px;text-decoration:none;margin-right:2px;}
					a.mention:hover{background:#d6ecff}
				</style>
			`);

			function hideMentionDropdown() {
				$mentionDropdown.addClass('d-none').empty();
			}

			function positionDropdown(rect) {
				if (!rect) return hideMentionDropdown();
				const scrollTop = $(window).scrollTop() || 0;
				$mentionDropdown.css({
					top: (rect.bottom + scrollTop) + 'px',
					left: rect.left + 'px'
				}).removeClass('d-none');
			}

			function getCaretCharacterOffsetWithin(element) {
				let caretOffset = 0;
				const sel = window.getSelection();
				if (sel.rangeCount > 0) {
					const range = sel.getRangeAt(0);
					const preRange = range.cloneRange();
					preRange.selectNodeContents(element);
					preRange.setEnd(range.endContainer, range.endOffset);
					caretOffset = preRange.toString().length;
				}
				return caretOffset;
			}

			function createRangeFromCharacterOffsets(root, start, end) {
				const nodeIterator = document.createNodeIterator(root, NodeFilter.SHOW_TEXT, null);
				let currentNode, count = 0, range = null;
				while ((currentNode = nodeIterator.nextNode())) {
					const nextCount = count + currentNode.textContent.length;
					if (start >= count && start <= nextCount) {
						const rangeStart = { node: currentNode, offset: start - count };
						if (end >= count && end <= nextCount) {
							const rangeEnd = { node: currentNode, offset: end - count };
							range = document.createRange();
							range.setStart(rangeStart.node, rangeStart.offset);
							range.setEnd(rangeEnd.node, rangeEnd.offset);
							return range;
						} else {
							// end is in a later node
							const rangeEndNode = (function () {
								let it2 = document.createNodeIterator(root, NodeFilter.SHOW_TEXT, null);
								let cur2, c2 = 0;
								while ((cur2 = it2.nextNode())) {
									const nc = c2 + cur2.textContent.length;
									if (end <= nc) return { node: cur2, offset: end - c2 };
									c2 = nc;
								}
								return null;
							})();
							if (rangeEndNode) {
								range = document.createRange();
								range.setStart(rangeStart.node, rangeStart.offset);
								range.setEnd(rangeEndNode.node, rangeEndNode.offset);
								return range;
							}
						}
					}
					count = nextCount;
				}
				return null;
			}

			function getMentionQuery($editor) {
				const caret = getCaretCharacterOffsetWithin($editor[0]);
				const text = $editor.text();
				const lastAt = text.lastIndexOf('@', caret - 1);
				if (lastAt === -1) return null;
				// ensure '@' is not part of an email already (simple heuristic)
				if (lastAt > 0 && /\S@\S/.test(text.substring(lastAt - 1, lastAt + 2))) return null;
				const query = text.substring(lastAt + 1, caret);
				// if whitespace in query it's invalid
				if (/\s/.test(query)) return null;
				return { start: lastAt, end: caret, query };
			}

			let mentionSelectionIndex = -1;

			const $editor = $('#new-comment-input');
			$editor.on('keyup paste input', function (e) {
				const mention = getMentionQuery($editor);
				if (!mention) return hideMentionDropdown();
				const q = (mention.query || '').toLowerCase();
				const matches = _mention_users.filter(u => (u.email && u.email.toLowerCase().includes(q)) || (u.name && u.name.toLowerCase().includes(q)));
				if (!matches.length) return hideMentionDropdown();

				// compute caret rect
				let rect = null;
				try {
					const sel = window.getSelection();
					if (sel.rangeCount) {
						const r = sel.getRangeAt(0).cloneRange();
						r.collapse(false);
						const clientRects = r.getClientRects();
						rect = clientRects[clientRects.length - 1] || r.getBoundingClientRect();
					}
				} catch (err) {
					console.warn('mention rect failed', err);
				}
				positionDropdown(rect);

				$mentionDropdown.empty();
				matches.slice(0, 10).forEach((m, idx) => {
					const $item = $(`<div class="mention-item p-1" data-idx="${idx}" data-email="${frappe.utils.escape_html(m.email)}" style="cursor:pointer;border-radius:4px;padding:6px;font-size:13px;">${frappe.utils.escape_html(m.name)}</div>`);
					$item.on('mousedown touchstart', function (ev) {
						ev.preventDefault(); // prevent blur
						$(this).attr('data-start', mention.start).attr('data-end', mention.end);
						const start = parseInt($(this).attr('data-start'), 10);
						const end = parseInt($(this).attr('data-end'), 10);
						insertMentionAtRange(start, end, m);
						hideMentionDropdown();
					});
					$mentionDropdown.append($item);
				});
				mentionSelectionIndex = -1;
			});

			$editor.on('keydown', function (e) {
				if ($mentionDropdown.hasClass('d-none')) return;
				const items = $mentionDropdown.children();
				if (!items.length) return;
				if (e.key === 'ArrowDown') {
					e.preventDefault();
					mentionSelectionIndex = Math.min(mentionSelectionIndex + 1, items.length - 1);
					items.removeClass('active');
					$(items.get(mentionSelectionIndex)).addClass('active').scrollIntoViewIfNeeded?.();
					return;
				}
				if (e.key === 'ArrowUp') {
					e.preventDefault();
					mentionSelectionIndex = Math.max(mentionSelectionIndex - 1, 0);
					items.removeClass('active');
					$(items.get(mentionSelectionIndex)).addClass('active').scrollIntoViewIfNeeded?.();
					return;
				}
				if (e.key === 'Enter') {
					if (mentionSelectionIndex >= 0 && mentionSelectionIndex < items.length) {
						e.preventDefault();
						$(items.get(mentionSelectionIndex)).trigger('mousedown');
					}
				}
				if (e.key === 'Escape') {
					hideMentionDropdown();
				}
			});

			$(document).on('mousedown.mention', function (e) {
				if (!$(e.target).closest('#mention-dropdown, #new-comment-input').length) hideMentionDropdown();
			});

			function insertMentionAtRange(start, end, user) {
				const editor = $editor[0];
				const range = createRangeFromCharacterOffsets(editor, start, end);
				if (!range) return;
				const mentionEmail = user.email || user.name || "";
				const mentionName = user.name || mentionEmail;
				const a = document.createElement('a');
				a.href = mentionEmail ? `mailto:${mentionEmail}` : "#";
				a.textContent = `@${mentionName}`;
				a.setAttribute('data-id', mentionEmail);
				a.setAttribute('data-mention-email', mentionEmail);
				a.setAttribute('data-mention-name', mentionName);
				a.className = 'mention';
				a.setAttribute('contenteditable', 'false');
				const sel = window.getSelection();
				// Insert the mention anchor followed by a single space and move caret after the space
				const frag = document.createDocumentFragment();
				const spaceNode = document.createTextNode(' ');
				frag.appendChild(a);
				frag.appendChild(spaceNode);
				// replace range contents with the fragment
				range.deleteContents();
				range.insertNode(frag);
				// place caret after the inserted space
				const newRange = document.createRange();
				newRange.setStartAfter(spaceNode);
				newRange.collapse(true);
				sel.removeAllRanges();
				sel.addRange(newRange);
				$editor.trigger('input');
				$editor.focus();
			}
			// ------------------- END MENTIONS -------------------

			function linkifyEmails(html, plainText) {
				// Safely linkify only plain-text email occurrences inside text nodes
				if (!html) return html;
				const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
				// Quick reject when plainText has no email
				if (!emailRegex.test(plainText)) return html;
				const wrapper = document.createElement('div');
				wrapper.innerHTML = html;
				const walker = document.createTreeWalker(wrapper, NodeFilter.SHOW_TEXT, null);
				const textNodes = [];
				let node;
				while ((node = walker.nextNode())) {
					// skip empty or nodes inside anchors (we don't want to disturb existing links/mentions)
					if (!node.nodeValue || !node.nodeValue.trim()) continue;
					if (node.parentNode && node.parentNode.nodeName.toLowerCase() === 'a') continue;
					textNodes.push(node);
				}

				textNodes.forEach(tn => {
					const txt = tn.nodeValue;
					let lastIndex = 0;
					const frag = document.createDocumentFragment();
					txt.replace(emailRegex, (match, offset) => {
						if (offset > lastIndex) {
							frag.appendChild(document.createTextNode(txt.slice(lastIndex, offset)));
						}
						const a = document.createElement('a');
						a.href = `mailto:${match}`;
						a.textContent = match;
						frag.appendChild(a);
						lastIndex = offset + match.length;
						return match;
					});
					if (lastIndex < txt.length) frag.appendChild(document.createTextNode(txt.slice(lastIndex)));
					tn.parentNode.replaceChild(frag, tn);
				});

				return wrapper.innerHTML;
			}

			// helper to decide whether content is "full html/email"
			function isFullHtml(content) {
				return /<html|<table|<body|<meta|<style|<head/i.test(content);
			}

			function buildStyledContent(rawHtml) {
				const injectedCSS = `
					<style>
						html, body {
							font-family: 'intervariable', 'inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif !important;
							color: #4c4c5c;
						}
						p, b, strong {
							font-size: 14px;
							color: #4c4c5c;
						}
						b {
							font-weight: 600;
						}
						
					</style>
				`;
				return injectedCSS + rawHtml;
			}

			function getTimelineIcon(type) {
				const key = (type || "").toLowerCase();
				const map = {
					"comment": "fa-comment-dots",
					"like": "fa-thumbs-up",
					"communication": "fa-envelope-open-text",
					"status change": "fa-arrows-rotate",
					"created": "fa-star",
					"assigned": "fa-user-check",
					"assignment completed": "fa-check-double",
					"attachment": "fa-paperclip",
					"attachment removed": "fa-paperclip",
					"workflow": "fa-diagram-project",
					"label": "fa-tag",
					"info": "fa-info-circle",
					"shared": "fa-share-square",
					"unshared": "fa-share-square",
					"bot": "fa-robot",
					"deleted": "fa-trash-can",
					"updated": "fa-pen",
				};
				return map[key] || "fa-circle";
			}

			function loadActivityTimeline(customer_id) {
				frappe.call({
					method: "renewal_module.custom_module.page.customers.customers.get_issue_activity",
					args: { name: customer_id },
					callback: function (res) {
						const container = $("#activity-timeline");
						const activities = res.message || [];
						let html = "";

						if (activities.length) {
							activities.forEach(act => {
								// is_html flag says whether content contains HTML (email / full HTML)
								let descriptionContent = act.is_html
									? (act.description || "")
									: frappe.utils.escape_html(act.description || "");

								let descriptionHtml = "";

								if (isFullHtml(descriptionContent)) {
									// full HTML/email — inject a style into the srcdoc so iframe has our CSS
									const iframeId = "email-frame-" + (Math.random().toString(36).substr(2, 9));
									const styled = buildStyledContent(descriptionContent);
									// use JSON.stringify here to safely serialize srcdoc content
									descriptionHtml = `
									<div class="scrollable-description text-muted iframe-wrapper">
									<iframe id="${iframeId}" class="email-iframe" sandbox="allow-popups allow-scripts"></iframe>
									</div>
									<script>
									(function(){
										const ifr = document.getElementById("${iframeId}");
										if (!ifr) return;
										// set srcdoc with injected css
										ifr.srcdoc = ${JSON.stringify(styled)};
										ifr.onload = function () {
										try {
											const doc = ifr.contentDocument || ifr.contentWindow.document;
											const height = Math.min(doc.body.scrollHeight + 10, 400); // cap height
											ifr.style.height = height + "px";
										} catch (e) {
											// cross-origin or other issues — leave default height
										}
										};
									})();
									</script>
								`;
								} else {
									// plain/html fragment — inject the same style at the start of the fragment
									const styledFragment = buildStyledContent(descriptionContent);
									descriptionHtml = `
									<div class="scrollable-description text-muted">
									${styledFragment}
									</div>
								`;
								}

								html += `
								<div class="timeline-item d-block d-md-flex align-items-stretch w-100">
									<div class="timeline-time pe-3 text-muted mb-1 mb-md-0">${act.timestamp || ""}</div>
									<div class="timeline-dot bg-${act.color || "secondary"} mx-md-2 my-1 my-md-0 d-none d-md-flex align-items-center justify-content-center">
										<i class="fa ${getTimelineIcon(act.type)} text-white"></i>
									</div>
									<div class="timeline-content frappe-card ps-md-3 pb-4 mb-1 ml-1">
									<span class="mb-1 fs-sm text-muted">${act.title || ""}</span>
									${descriptionHtml}
									<span class="text-primary fs-sm d-block mt-2">By ${act.by || ""}</span>
									</div>
								</div>`;
							});
						} else {
							html = `<p class="text-muted text-center">No activity found for this customer.</p>`;
						}

						container.html(html);
					}
				});
			}
			loadActivityTimeline(customer_id);




		}
		catch (err) {
			console.error(err);
			// frappe.call already shows the backend permission error message
			// redirect back to the list view
			frappe.set_route("customers");
			if (this.show_list) {
				this.show_list();
			}
		}
	}



	/***New customer Form */

	gotoNewCustomerWizardStep(step) {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const $scope = $(wrapper);
		const totalSteps = 4;
		this._newCustomerCurrentStep = step;

		$scope.find(".new-customer-wizard-step").each(function () {
			const currentStep = parseInt($(this).data("step"), 10);
			$(this).removeClass("is-active is-done");
			if (currentStep < step) $(this).addClass("is-done");
			else if (currentStep === step) $(this).addClass("is-active");
		});

		$scope.find(".new-customer-wizard-connector").each(function (idx) {
			$(this).toggleClass("is-done", idx + 1 < step);
		});

		$scope.find(".new-customer-wizard-panel").each(function () {
			const panelStep = parseInt($(this).data("panel"), 10);
			$(this).toggleClass("d-none", panelStep !== step);
		});

		$scope.find("#new-customer-back").toggleClass("d-none", step === 1);
		$scope.find("#new-customer-next").toggleClass("d-none", step === totalSteps);
		$scope.find("#new-customer-save").toggleClass("d-none", step !== totalSteps);
	}

	validateNewCustomerWizardStep(step, controls = {}) {
		const requiredFieldsByStep = {
			1: [
				{ control: controls.customerNameControl, label: "Customer Name" },
				{ control: controls.customertypeControl, label: "Customer Type" },
				{ control: controls.territoryControl, label: "Territory" }
			],
			2: [
				{ control: controls.industryControl, label: "Industry" },
				{ control: controls.employeesControl, label: "Employees" }
			]
		};

		const fields = requiredFieldsByStep[step] || [];
		for (const field of fields) {
			const value = field.control?.get_value ? String(field.control.get_value() || "").trim() : "";
			if (!value) {
				frappe.show_alert({ message: __(`Please fill ${field.label} before proceeding.`), indicator: "red" }, 4);
				return false;
			}
		}

		return true;
	}

	async bind_customer_form_events() {
		const me = this;
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const $scope = $(wrapper);
		const customerForm = wrapper.querySelector("#new-customers-form");
		if (!customerForm) return;

		await frappe.model.with_doctype("Customer");
		const statusFieldname = frappe.meta.has_field("Customer", "custom_customer_status")
			? "custom_customer_status"
			: (frappe.meta.has_field("Customer", "customer_status") ? "customer_status" : "custom_customer_status");
		const statusDf = frappe.meta.get_docfield("Customer", statusFieldname);
		const statusOptions = (statusDf && statusDf.options) ? statusDf.options : "\nDuplicate\nEnabled\nDisabled";
		const customerTypeDf = frappe.meta.get_docfield("Customer", "customer_type");
		const customerTypeOptions = (customerTypeDf && customerTypeDf.options)
			? customerTypeDf.options
			: "\nIndividual\nCompany\nPartner";
		const gstCategoryDf = frappe.meta.get_docfield("Customer", "gst_category");
		const gstCategoryOptions = (gstCategoryDf && gstCategoryDf.options)
			? gstCategoryDf.options
			: "\nRegistered Regular\nRegistered Composition\nUnregistered\nSEZ\nOverseas\nDeemed Export\nUIN Holders\nTax Deductor";
		let newCustomerDoc = frappe.model.get_new_doc("Customer");

		let customerNameControl = frappe.ui.form.make_control({
			parent: document.getElementById("customer-name-field"),
			df: { fieldtype: "Data", reqd: 1, label: "Customer Name", fieldname: "customer_name" },
			render_input: true
		});
		customerNameControl.refresh();

		let customcustomerStatusControl = frappe.ui.form.make_control({
			parent: document.getElementById("customer-status-field"),
			df: {
				fieldtype: "Select",
				options: statusOptions,
				label: "Customer Status",
				default: (statusDf && statusDf.default) ? statusDf.default : "Enabled",
				fieldname: statusFieldname
			},
			render_input: true
		});
		customcustomerStatusControl.refresh();

		let customertypeControl = frappe.ui.form.make_control({
			parent: document.getElementById("customer-type-field"),
			df: {
				fieldtype: "Select",
				options: customerTypeOptions,
				label: "Customer Type",
				reqd: 1,
				default: (customerTypeDf && customerTypeDf.default) ? customerTypeDf.default : "Company",
				fieldname: "customer_type"
			},
			render_input: true
		});
		customertypeControl.refresh();

		let territoryControl = frappe.ui.form.make_control({
			parent: document.getElementById("territory-field"),
			df: {
				fieldtype: "Link",
				options: "Territory",
				label: "Territory",
				reqd: 1,
				fieldname: "territory"
			},
			render_input: true
		});
		territoryControl.refresh();

		let industryControl = frappe.ui.form.make_control({
			parent: document.getElementById("industry-field"),
			df: {
				fieldtype: "Link",
				options: "Industry Type",
				label: "Industry",
				reqd: 1,
				fieldname: "industry"
			},
			render_input: true
		});
		industryControl.refresh();


		let employeesControl = frappe.ui.form.make_control({
			parent: document.getElementById("employees-field"),
			df: {
				fieldtype: "Int",
				label: "Employees",
				reqd: 1,
				fieldname: "employees"
			},
			render_input: true
		});
		employeesControl.refresh();

		let accountManagerControl = frappe.ui.form.make_control({
			parent: document.getElementById("account-manager-field"),
			df: {
				fieldtype: "Link",
				options: "User",
				label: "Account Manager",
				fieldname: "account_manager"
			},
			render_input: true
		});
		accountManagerControl.refresh();

		let taxcategoryControl = frappe.ui.form.make_control({
			parent: document.getElementById("tax-category-field"),
			df: {
				fieldtype: "Link",
				options: "Tax Category",
				label: "Tax Category",
				fieldname: "tax_category"
			},
			render_input: true
		});
		taxcategoryControl.refresh();

		let gstinControl = frappe.ui.form.make_control({
			parent: document.getElementById("gstin-field"),
			df: {
				fieldtype: "Data",
				label: "GSTIN / UIN",
				fieldname: "gstin"
			},
			render_input: true
		});
		gstinControl.refresh();

		let gstCategoryControl = frappe.ui.form.make_control({
			parent: document.getElementById("gst-category-field"),
			df: {
				fieldtype: "Select",
				options: gstCategoryOptions,
				label: "GST Category",
				fieldname: "gst_category"
			},
			render_input: true
		});
		gstCategoryControl.refresh();

		let panControl = frappe.ui.form.make_control({
			parent: document.getElementById("pan-field"),
			df: {
				fieldtype: "Data",
				label: "PAN",
				fieldname: "pan"
			},
			render_input: true
		});
		panControl.refresh();

		let customerGroupControl = frappe.ui.form.make_control({
			parent: document.getElementById("customer-group-field"),
			df: {
				fieldtype: "Link",
				options: "Customer Group",
				label: "Customer Group",
				fieldname: "customer_group"
			},
			render_input: true
		});
		customerGroupControl.refresh();

		let customphoneControl = frappe.ui.form.make_control({
			parent: document.getElementById("phone-number-field"),
			df: {
				fieldtype: "Data",
				label: "Phone",
				fieldname: "custom_phone_number"
			},
			render_input: true
		});
		customphoneControl.refresh();

		let customphoneverifiedControl = frappe.ui.form.make_control({
			parent: document.getElementById("verified-phone-field"),
			df: {
				fieldtype: "Check",
				label: "Verified",
				fieldname: "custom_verified"
			},
			render_input: true
		});
		customphoneverifiedControl.refresh();

		let customlinkedinControl = frappe.ui.form.make_control({
			parent: document.getElementById("customer-linked-in-field"),
			df: {
				fieldtype: "Data",
				label: "LinkedIn",
				fieldname: "custom_linked_in"
			},
			render_input: true
		});
		customlinkedinControl.refresh();

		let memberoffcontrol = frappe.ui.form.make_control({
			parent: document.getElementById("member-of-field"),
			df: {
				fieldtype: "Link",
				options: "Customer",
				label: "Member Of",
				fieldname: "member_of"
			},
			render_input: true
		});
		memberoffcontrol.refresh();

		let mxrecordControl = frappe.ui.form.make_control({
			parent: document.getElementById("mxrecord-field"),
			df: {
				fieldtype: "Data",
				label: "MX Record",
				fieldname: "mx_record"
			},
			render_input: true
		});
		mxrecordControl.refresh();

		let websiteControl = frappe.ui.form.make_control({
			parent: document.getElementById("website-field"),
			df: {
				fieldtype: "Data",
				label: "Website",
				fieldname: "website"
			},
			render_input: true
		});
		websiteControl.refresh();

		const getValue = (doctype, filters, fieldname) => new Promise((resolve) => {
			frappe.call({
				method: "frappe.client.get_value",
				args: {
					doctype,
					filters,
					fieldname
				},
				callback: (r) => resolve(r && r.message ? r.message : null),
				error: () => resolve(null)
			});
		});

		const updateSalesTeamFromAccountManager = async (userEmail) => {
			if (!userEmail) return;
			const employee = await getValue("Employee", { user_id: userEmail }, ["name", "employee_name", "cell_number"]);
			if (!employee || !employee.name) return;
			const salesPerson = await getValue("Sales Person", { employee: employee.name }, ["parent_sales_person"]);
			const teamName = salesPerson ? (salesPerson.parent_sales_person || "") : "";

			newCustomerDoc.sales_person = employee.employee_name || "";
			newCustomerDoc.team_name = teamName;
			newCustomerDoc.sales_team = [];
			if (employee.employee_name) {
				newCustomerDoc.sales_team.push({
					sales_person: employee.employee_name,
					team_name: teamName,
					mobile_no: employee.cell_number || "",
					email_id: userEmail,
					allocated_percentage: 100
				});
			}
		};

		const updateTaxCategoryFromTerritory = () => {
			const nextTaxCategory = this.getTaxCategoryForTerritory(territoryControl.get_value());
			if (nextTaxCategory && taxcategoryControl.get_value() !== nextTaxCategory) {
				taxcategoryControl.set_value(nextTaxCategory);
			}
			newCustomerDoc.tax_category = taxcategoryControl.get_value() || nextTaxCategory || "";
		};

		const syncTaxDetailsFromGSTIN = () => {
			this.autoFillTaxFieldsFromGSTIN({
				gstinControl,
				panControl,
				gstCategoryControl,
				territoryControl,
				taxCategoryControl: taxcategoryControl,
				onComplete: () => {
					newCustomerDoc.gstin = gstinControl.get_value() || "";
					newCustomerDoc.tax_id = newCustomerDoc.gstin || "";
					newCustomerDoc.pan = panControl.get_value() || "";
					newCustomerDoc.gst_category = gstCategoryControl.get_value() || "";
					newCustomerDoc.territory = territoryControl.get_value() || "";
					newCustomerDoc.tax_category = taxcategoryControl.get_value() || "";
				}
			});
		};

		const applyDefaults = () => {
			customerNameControl.set_value(newCustomerDoc.customer_name || "");
			customcustomerStatusControl.set_value(newCustomerDoc[statusFieldname] || customcustomerStatusControl.get_value() || "");
			customertypeControl.set_value(newCustomerDoc.customer_type || customertypeControl.get_value() || "");
			territoryControl.set_value(newCustomerDoc.territory || "");
			industryControl.set_value(newCustomerDoc.industry || "");
			employeesControl.set_value(newCustomerDoc.employees || "");
			accountManagerControl.set_value(newCustomerDoc.account_manager || "");
			taxcategoryControl.set_value(newCustomerDoc.tax_category || "");
			gstinControl.set_value(newCustomerDoc.gstin || newCustomerDoc.tax_id || "");
			gstCategoryControl.set_value(newCustomerDoc.gst_category || "");
			panControl.set_value(newCustomerDoc.pan || "");
			customerGroupControl.set_value(newCustomerDoc.customer_group || "");
			customphoneControl.set_value(newCustomerDoc.custom_phone_number || "");
			customphoneverifiedControl.set_value(newCustomerDoc.custom_verified || 0);
			customlinkedinControl.set_value(newCustomerDoc.custom_linked_in || "");
			memberoffcontrol.set_value(newCustomerDoc.member_of || "");
			mxrecordControl.set_value(newCustomerDoc.mx_record || "");
			websiteControl.set_value(newCustomerDoc.website || "");
		};

		const resetCustomerDoc = () => {
			newCustomerDoc = frappe.model.get_new_doc("Customer");
		};

		const ensureAccountManagerDefaults = async () => {
			const userEmail = (frappe.user_info && frappe.user_info().email) ? frappe.user_info().email : frappe.session.user;
			if (!newCustomerDoc.account_manager) {
				newCustomerDoc.account_manager = userEmail;
				accountManagerControl.set_value(userEmail);
			}
			await updateSalesTeamFromAccountManager(newCustomerDoc.account_manager);
		};

		const bindValueChange = (control, fieldname, onChange) => {
			if (!control || !control.$input) return;
			control.$input.on("change", () => {
				const value = control.get_value();
				newCustomerDoc[fieldname] = value;
				if (onChange) onChange(value);
			});
		};

		bindValueChange(customerNameControl, "customer_name");
		bindValueChange(customcustomerStatusControl, statusFieldname);
		bindValueChange(customertypeControl, "customer_type");
		bindValueChange(territoryControl, "territory", updateTaxCategoryFromTerritory);
		bindValueChange(industryControl, "industry");
		bindValueChange(employeesControl, "employees");
		bindValueChange(accountManagerControl, "account_manager", updateSalesTeamFromAccountManager);
		bindValueChange(gstinControl, "gstin", () => {
			newCustomerDoc.tax_id = gstinControl.get_value() || "";
			syncTaxDetailsFromGSTIN();
		});
		bindValueChange(gstCategoryControl, "gst_category");
		bindValueChange(panControl, "pan");
		bindValueChange(taxcategoryControl, "tax_category");
		bindValueChange(customerGroupControl, "customer_group");
		bindValueChange(customphoneControl, "custom_phone_number");
		bindValueChange(customphoneverifiedControl, "custom_verified");
		bindValueChange(customlinkedinControl, "custom_linked_in");
		bindValueChange(memberoffcontrol, "member_of");
		bindValueChange(mxrecordControl, "mx_record");
		bindValueChange(websiteControl, "website");

		$scope
			.off("click", "#new-customer-cancel")
			.on("click", "#new-customer-cancel", function (e) {
				e.preventDefault();
				frappe.set_route("customers");
			});

		$scope
			.off("click", "#new-customer-back")
			.on("click", "#new-customer-back", function (e) {
				e.preventDefault();
				const current = me._newCustomerCurrentStep || 1;
				if (current > 1) me.gotoNewCustomerWizardStep(current - 1);
			});

		$scope
			.off("click", "#new-customer-next")
			.on("click", "#new-customer-next", function (e) {
				e.preventDefault();
				const current = me._newCustomerCurrentStep || 1;
				const isValid = me.validateNewCustomerWizardStep(current, {
					customerNameControl,
					customertypeControl,
					territoryControl,
					industryControl,
					employeesControl
				});
				if (!isValid) return;
				me.gotoNewCustomerWizardStep(current + 1);
			});

		$scope
			.off("click", ".new-customer-wizard-step")
			.on("click", ".new-customer-wizard-step", function (e) {
				e.preventDefault();
				const targetStep = parseInt($(this).data("step"), 10);
				if (!Number.isFinite(targetStep) || targetStep < 1) return;

				const current = me._newCustomerCurrentStep || 1;
				if (targetStep > current) {
					const isValid = me.validateNewCustomerWizardStep(current, {
						customerNameControl,
						customertypeControl,
						territoryControl,
						industryControl,
						employeesControl
					});
					if (!isValid) return;
				}

				me.gotoNewCustomerWizardStep(Math.min(Math.max(targetStep, 1), 4));
			});

		applyDefaults();
		if (territoryControl.get_value()) {
			updateTaxCategoryFromTerritory();
		}
		await ensureAccountManagerDefaults();

		customerForm.addEventListener("submit", async (e) => {
			e.preventDefault();

			const customer_name = customerNameControl.get_value();
			const customer_status = customcustomerStatusControl.get_value();
			const customer_type = customertypeControl.get_value();
			const territory = territoryControl.get_value();
			const industry = industryControl.get_value();
			const employees = employeesControl.get_value();
			const account_manager = accountManagerControl.get_value();
			const gstin = gstinControl.get_value();
			const gst_category = gstCategoryControl.get_value();
			const pan = panControl.get_value();
			const tax_category = taxcategoryControl.get_value();
			const customer_group = customerGroupControl.get_value();
			const custom_phone_number = customphoneControl.get_value();
			const custom_verified = customphoneverifiedControl.get_value();
			const custom_linked_in = customlinkedinControl.get_value();
			const member_of = memberoffcontrol.get_value();
			const mx_record = mxrecordControl.get_value();
			const website = websiteControl.get_value();

			const new_customer_data = {
				doctype: "Customer",
				customer_name,
				customer_type,
				territory,
				industry,
				employees,
				account_manager,
				gstin,
				tax_id: gstin,
				gst_category,
				pan,
				tax_category,
				customer_group,
				custom_phone_number,
				custom_verified,
				custom_linked_in,
				mx_record,
				member_of,
				website,
				sales_person: newCustomerDoc.sales_person || "",
				team_name: newCustomerDoc.team_name || "",
				sales_team: newCustomerDoc.sales_team || []
			};

			new_customer_data[statusFieldname] = customer_status;

			frappe.call({
				method: "frappe.client.insert",
				args: { doc: new_customer_data },
				callback: async function (r) {
					if (r.message) {
						frappe.show_alert({ message: "Customer created successfully", indicator: "green" });
						setTimeout(() => {
							frappe.set_route("customers", r.message.name);
						}, 1000);
						customerForm.reset();
						resetCustomerDoc();
						applyDefaults();
						await ensureAccountManagerDefaults();
					}
					else {
						frappe.show_alert({ message: "Failed to create customer", indicator: "red" });
					}
				},
				error: function (err) {
					frappe.msgprint({
						title: "Error",
						message: "An error occurred while creating the customer. Please try again.",
						indicator: "red"
					})
					console.error("Customer creation failed", err);
				}
			})
		});
	}

}


frappe.customers_page_template = {
	body: `
		<div class="wrapper customers-wrapper">
			
			<div class="customers-list-view d-none">
				<div class="row">
					<div class="col-12">
						<div class="page-title-head d-flex align-items-center">
							<div class="flex-grow-1">
								<h3 class="fs-xl fw-bold m-0">Customers</h3>
							</div>

							<div class="text-end">
								<ol class="breadcrumb m-0 py-0" style="background-color: transparent;">
									<li class="breadcrumb-item"><a href="javascript: void(0);">CRM</a></li>
									<li class="breadcrumb-item active">Customers</li>
								</ol>
							</div>
						</div>
					</div>
				</div>
				
				<div class="row mt-3">
					<div class="col-12">
						
						<div class="controls-wrapper">
							<div class="controls">
								<div class="left-controls">
									
									<input type="text" class="control-select" id="filtercustomername" data-table-filter="customer_name"
										placeholder="Customer Name"
										class="form-control" />
								
									<select data-table-filter="account_manager" class="control-select placeholder">
										<option value="">Account Manager</option>
									</select>
								
									<select data-table-filter="territory" class="control-select placeholder">
										<option value="">Territory</option>
									</select>
								
									<select data-table-filter="customer_group" class="control-select placeholder">
										<option value="">Customer Group</option>
									</select>
									
								</div>
								<div class="right-controls">
									<div class="btn-group filter-actions">
										<button class="btn btn-default btn-sm filter-button" title="Filters">
											<span class="filter-icon">
												<svg class="es-icon es-line icon-sm" aria-hidden="true">
													<use href="#es-line-filter"></use>
												</svg>
											</span>
											<span class="button-label hidden-xs">Filters</span>
										</button>
										<button class="btn btn-default btn-sm filter-x-button" title="Clear Filters">
											<span class="filter-icon">
												<svg class="es-icon es-line icon-sm" aria-hidden="true">
													<use href="#es-small-close"></use>
												</svg>
											</span>
										</button>
									</div>
										
									<a id="new-customers-btn" href="/app/customers/new" class="btn btn-sm btn-primary1 mr-2">
										<i class="fa fa-plus me-1"></i> New Customers
									</a>
									<div class="dropdown d-none" id="actions-dropdown">
										<button class="btn btn-secondary dropdown-toggle" type="button"
											data-bs-toggle="dropdown">
											Actions
										</button>
										<ul class="dropdown-menu">
											<li><a class="dropdown-item" href="#" data-action="edit">Edit</a></li>
											<li><a class="dropdown-item" href="#" data-action="assign_to">Assign To</a></li>
											<li><a class="dropdown-item" href="#" data-action="apply_rule">Apply Rule</a></li>
											<li><a class="dropdown-item" href="#" data-action="add_tags">Add Tags</a></li>
											<li><a class="dropdown-item" href="#" data-action="print">Print</a></li>
											<li><a class="dropdown-item" href="#" data-action="delete">Delete</a></li>
										</ul>
									</div>
								</div>

							</div>

						</div>

							
						<div class="table-container mt-2">
							<table id="customersTable" class="customers-table">
								<thead>
									<tr>
										<th>
											<input type="checkbox" id="customercheckAll" />
										</th>
										<th>Customer Name</th>
										<th>Status</th>
										<th>Industry</th>
										<th>Territory</th>
										<th>Employees</th>
										<th>Account Manager</th>
										<th class="text-center ellipsis" id="count-header" title="0 of 0" style="cursor: default;">
											<span id="visible-count">0</span> of <span id="total-count">0</span>
										</th>
									</tr>
								</thead>
								<tbody></tbody>
							</table>
						</div>
							
						
						<div class="d-flex justify-content-between align-items-center">
							<div class="list-paging-area d-flex justify-content-between align-items-center w-100">
								<div class="p-2">
									<div class="btn-group">
										<button type="button" class="btn btn-default1 btn-sm btn-paging" data-value="20">20</button>
										<button type="button" class="btn btn-default1 btn-sm btn-paging" data-value="100">100</button>
										<button type="button" class="btn btn-default1 btn-sm btn-paging" data-value="500">500</button>
										<button type="button" class="btn btn-default1 btn-sm btn-paging" data-value="2500">2500</button>
									</div>
								</div>
								
								<div class="p-2">
									<button class="btn btn-default1 btn-more btn-sm">Load More</button>
								</div>
							</div>
						</div>
						
							
							
						
					</div><!-- end col -->
				</div><!-- end row -->
			</div>
				
			<div class="customers-details-view d-none">
				<div class="page-title-head d-flex align-items-center">
					<div class="flex-grow-1">
						<h4 class="fs-xl fw-bold m-0">Customer</h4>
					</div>

					<div class="text-end">
						<ol class="breadcrumb m-0 py-0" style="background-color: transparent;">
							<li class="breadcrumb-item"><a href="javascript: void(0);">CRM</a></li>
							<li class="breadcrumb-item"><a href="/app/customers">Customers</a></li>
						</ol>
					</div>
				</div>

				<div class="row">
					<div class="col-12">
						<!-- Cover -->
						<section class="profile-cover">
							<div class="d-flex align-items-center flex-wrap" style="gap: 10px;">
								<div class="d-flex align-items-center flex-wrap" style="gap: 10px;">
									<span id="customer-name-text" class="customer-names"></span>
								</div>
								<div style="margin: 0 4px;">-</div>
								<div class="customer-badges">
									<span id="customer-status" class="customer-status badge bg-secondary text-white me-1"></span>
								</div>
							</div>
							<span id="customer-account-manager"></span>
						</section>
					</div>
				</div>

				<!-- Main -->
				<div class="px-3 mt-n4">
					<div class="row d-flex align-items-stretch">
						<div class="col-12 col-lg-4 col-xl-3 d-flex">
							<div class=" card w-100">
								<!-- Left -->
								<aside class="profile-card">
								</aside>
							</div>
						</div>

						<div class="col-12 col-lg-8 col-xl-9 d-flex">
							<div class="card w-100" style="background:transparent;border:none">
							<!-- Right -->
								<section class="timeline-card">
									<!-- Tabs -->
									<div class="tabs profile-main-tabs">
										<span class="tab-link active" data-tab="dashboard" role="button" tabindex="0">Dashboard</span>
										<span class="tab-link" data-tab="connections" role="button" tabindex="0">Connections</span>
										<span class="tab-link" data-tab="contacts" role="button" tabindex="0">Contacts</span>
										<span class="tab-link" data-tab="services" role="button" tabindex="0">Services</span>
										<span class="tab-link" data-tab="logs" role="button" tabindex="0">Logs</span>
										<span class="tab-link" data-tab="others" role="button" tabindex="0">Others</span>
									</div>

									<div class="tab-panels profile-main-tab-panels">

										<section class="tab-panel" data-tab-panel="contacts">
											<div class="post">
												<div class="post-container">
													<div id="customer-contacts" class="mt-2"></div>
												</div>
											</div>
										</section>

										<section class="tab-panel d-none" data-tab-panel="services">
											<div class="post">
												<div class="btn-group mb-2" role="group" aria-label="Renewal view switcher">
													<button class="btn btn-secondary btn-default2 btn-sm active" data-toggle-renewal="active">Active Renewals</button>
													<button class="btn btn-secondary btn-sm btn-default2" data-toggle-renewal="new">New Renewals</button>
												</div>
												<div class="post-container">
													<!-- Active Renewals -->
													<div id="active-renewals-container"></div>
													<!-- New Renewals -->
													<div id="new-renewals-container" class="mt-3"></div>
												</div>
											</div>
										</section>

										<section class="tab-panel d-none" data-tab-panel="dashboard">
											<div class="post">
												<div class="mb-3 stats-section">
													<div class="stats-header">
														<div style="display: flex; align-items: center; gap: 8px;">
															<i class="fa fa-chart-line" style="color: #667eea;"></i>
															<span style="font-weight: 600; color: #2c3e50; font-size: 15px;">Stats</span>
														</div>
														<i class="fa fa-chevron-up toggle-icon" style="color: #667eea; transition: transform 0.3s ease;"></i>
													</div>
													<div class="stats-content" style="margin-top: 12px;">
														<div class="d-flex justify-content-between gap-1">	
															<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
																<span><b>Annual Billing :</b></span>
																<span class="annual-billing-value">₹0.00</span>
															</div>
															<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
																<span><b>Total Unpaid :</b></span>
																<span class="total-unpaid-value">₹0.00</span>
															</div>
														</div>
													</div>
												</div>	

												<div class="mt-2 fiscal-financials-section">
															<div class="fiscal-financials-header d-flex align-items-center justify-content-between" style="gap: 8px;">
																<div class="d-flex align-items-center" style="gap: 8px;">
														<i class="fa fa-calendar" style="color: #667eea;"></i>
														<span style="font-weight: 600; color: #2c3e50; font-size: 15px;">Fiscal Year Financials</span>
																</div>
																<select class="form-control form-control-sm fiscal-year-select" style="min-width: 180px; border-radius: 8px;" title="Select Fiscal Year" disabled>
																	<option value="">Loading...</option>
																</select>
													</div>
													<div class="fiscal-financials-body mt-2">
														<div class="text-center py-3 text-muted"><i class="fa fa-spinner fa-spin"></i> Loading fiscal year summary...</div>
													</div>
												</div>

												<div class="mt-3 renewal-dashboard-section">
													<div class="renewal-dashboard-header">
														<div style="display: flex; align-items: center; gap: 8px;">
															<i class="fa fa-refresh" style="color: #27ae60;"></i>
															<span style="font-weight: 600; color: #2c3e50; font-size: 15px;">Renewal Overview</span>
														</div>
														<i class="fa fa-chevron-up toggle-icon" style="color: #27ae60; transition: transform 0.3s ease; cursor: pointer;" role="button" tabindex="0"></i>
													</div>
													<div class="renewal-dashboard-content" style="margin-top: 12px;">
														<div class="renewal-metrics-grid">
															<div class="renewal-metric-card">
																<div class="metric-header">
																	<i class="fa fa-check-circle" style="color: #27ae60;"></i>
																	<span class="metric-label">Active Renewals</span>
																</div>
																<div class="metric-value"><span class="active-renewals-count">0</span></div>
															</div>
															<div class="renewal-metric-card">
																<div class="metric-header">
																	<i class="fa fa-calendar" style="color: #f39c12;"></i>
																	<span class="metric-label">Expiring Soon</span>
																</div>
																<div class="metric-value"><span class="expiring-soon-count">0</span></div>
															</div>
															<div class="renewal-metric-card">
																<div class="metric-header">
																	<i class="fa fa-lightbulb-o" style="color: #3498db;"></i>
																	<span class="metric-label">New Opportunities</span>
																</div>
																<div class="metric-value"><span class="new-opp-count">0</span></div>
															</div>
														</div>
														<!--<div id="renewal-summary-container" class="mt-3"></div>-->
													</div>
												</div>
													
											</div>
										</section>

										<section class="tab-panel d-none" data-tab-panel="logs">
											<div class="post">
												<div class="mb-3">
													<div class="card recent-activity-card">
														<div class="card-header" style="gap:8px;">
															<i class="fa fa-clock-o me-2"></i>Audit Logs
														</div>
														<div class="card-body">
															<div class="text-center py-3"><i class="fa fa-spinner fa-spin"></i> Loading...</div>
														</div>
													</div>
												</div>
											</div>
										</section>

										<section class="tab-panel" data-tab-panel="connections">
											<div class="post">
												<div class="mb-3 connection-section">
													<div class="connection-section-header">
														<i class="fa fa-link"></i> Connections
													</div>
												
													<div class="connection-items-wrapper">
														<div class="connection-item">
															<div class="connection-badge" data-type="Opportunity">
																<div class="connection-badge-icon-wrapper">
																	<i class="fa fa-handshake-o connection-badge-icon"></i>
																</div>
																<div class="connection-badge-content">
																	<div class="connection-badge-text">
																		<span class="connection-badge-label" title="Opportunity">Opportunity</span>
																		<span class="connection-badge-count" data-count="0">0</span>
																	</div>
																</div>
															</div>
														</div>

														<div class="connection-item">
															<div class="connection-badge" data-type="Quotation">
																<div class="connection-badge-icon-wrapper">
																	<i class="fa fa-file-text-o connection-badge-icon"></i>
																</div>
																<div class="connection-badge-content">
																	<div class="connection-badge-text">
																		<span class="connection-badge-label" title="Quotation">Quotation</span>
																		<span class="connection-badge-count" data-count="0">0</span>
																	</div>
																</div>
															</div>
														</div>

														<div class="connection-item">
															<div class="connection-badge" data-type="Customer Order Form">
																<div class="connection-badge-icon-wrapper">
																	<i class="fa-brands fa-wpforms connection-badge-icon"></i>
																</div>
																<div class="connection-badge-content">
																	<div class="connection-badge-text">
																		<span class="connection-badge-label" title="Customer Order Form">Customer Order Form</span>
																		<span class="connection-badge-count" data-count="0">0</span>
																	</div>
																</div>
															</div>
														</div>

														<div class="connection-item">
															<div class="connection-badge" data-type="Sales Order">
																<div class="connection-badge-icon-wrapper">
																	<i class="fa fa-shopping-cart connection-badge-icon"></i>
																</div>
																<div class="connection-badge-content">
																	<div class="connection-badge-text">
																		<span class="connection-badge-label" title="Sales Order">Sales Order</span>
																		<span class="connection-badge-count" data-count="0">0</span>
																	</div>
																</div>
															</div>
														</div>

														<div class="connection-item">
															<div class="connection-badge" data-type="Sales Invoice">
																<div class="connection-badge-icon-wrapper">
																	<i class="fa fa-file-invoice connection-badge-icon"></i>
																</div>
																<div class="connection-badge-content">
																	<div class="connection-badge-text">
																		<span class="connection-badge-label" title="Invoice">Sales Invoice</span>
																		<span class="connection-badge-count" data-count="0">0</span>
																	</div>
																</div>
															</div>
														</div>

														<div class="connection-item">
															<div class="connection-badge" data-type="Renewal List">
																<div class="connection-badge-icon-wrapper">
																	<i class="fa fa-refresh connection-badge-icon"></i>
																</div>
																<div class="connection-badge-content">
																	<div class="connection-badge-text">
																		<span class="connection-badge-label" title="Renewal List">Renewal</span>
																		<span class="connection-badge-count" data-count="0">0</span>
																	</div>
																</div>
															</div>
														</div>

														<div class="connection-item">
															<div class="connection-badge" data-type="Issue">
																<div class="connection-badge-icon-wrapper">
																	<i class="fa fa-exclamation-circle connection-badge-icon"></i>
																</div>
																<div class="connection-badge-content">
																	<div class="connection-badge-text">
																		<span class="connection-badge-label" title="Issue">Issue</span>
																		<span class="connection-badge-count" data-count="0">0</span>
																	</div>
																</div>
															</div>
														</div>

														<div class="connection-item">
															<div class="connection-badge" data-type="Call List">
																<div class="connection-badge-icon-wrapper">
																	<i class="fa fa-phone connection-badge-icon"></i>
																</div>
																<div class="connection-badge-content">
																	<div class="connection-badge-text">
																		<span class="connection-badge-label" title="Calls">Calls</span>
																		<span class="connection-badge-count" data-count="0">0</span>
																	</div>
																</div>
															</div>
														</div>

														<div class="connection-item">
															<div class="connection-badge" data-type="Payment Entry">
																<div class="connection-badge-icon-wrapper">
																	<i class="fa fa-credit-card connection-badge-icon"></i>
																</div>
																<div class="connection-badge-content">
																	<div class="connection-badge-text">
																		<span class="connection-badge-label" title="Payment Entry">Payment Entry</span>
																		<span class="connection-badge-count" data-count="0">0</span>
																	</div>
																</div>
															</div>
														</div>
													</div>
												</div>
												
												<!-- Sales Analytics Charts -->
												<div class="mt-4" style="background: linear-gradient(180deg, #f6f8ff 0%, #ffffff 70%); border: 1px solid #eef0f6; border-radius: 14px; padding: 16px;">
													<div class="d-flex flex-wrap justify-content-between align-items-center mb-3" style="gap: 12px;">
														
														<div style="display: flex; align-items: center; gap: 10px; font-size: 16px; font-weight: 700; color: #2c3e50;">
															<span style="width: 30px; height: 30px; border-radius: 9px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: inline-flex; align-items: center; justify-content: center; color: #fff;">
																<i class="fa fa-chart-bar"></i>
															</span>
															<span>Sales Analytics</span>
														</div>
														
														<div class="form-group mb-0 d-flex gap-2 align-items-center" >
															<select id="sales-fiscal-year-filter" class="form-control form-control-sm" style="min-width: 180px; border-radius: 8px;"></select>
														</div>
													</div>
													<div class="row row-cols-1 row-cols-md-2 row-cols-lg-2">
														<div class="col mb-3">
															<div class="card h-100 shadow-sm border-0" style="border-radius: 12px; overflow: hidden;">
																<div class="card-header" style="background: #ffffff;">
																	<span><i class="fa fa-sitemap mr-2"></i>Sales by Item Group</span>
																</div>
																<div class="card-body p-1" style="background: #ffffff;">
																	<div id="item-group-chart">
																		<div class="text-center py-5">
																			<i class="fa fa-spinner fa-spin"></i> Loading...
																		</div>
																	</div>
																</div>
															</div>
														</div>
														<div class="col h-100 mb-3">
															<div class="card shadow-sm border-0" style="border-radius: 12px; overflow: hidden;">
																<div class="card-header" style="background: #ffffff;">
																	<span><i class="fa fa-tag mr-2"></i>Sales by Brand</span>
																</div>
																<div class="card-body p-1" style="background: #ffffff;">
																	<div id="brand-chart">
																		<div class="text-center py-5">
																			<i class="fa fa-spinner fa-spin"></i> Loading...
																		</div>
																	</div>
																</div>
															</div>
														</div>
													</div>
												</div>
											</div>
										</section>	

										<section class="tab-panel d-none" data-tab-panel="others">
											<div class="tabs others-tabs mb-2">
												<span class="tab-link active" data-tab="taxes" role="button" tabindex="0">Taxes</span>
												<span class="tab-link" data-tab="sales-team" role="button" tabindex="0">Sales Team</span>
												<span class="tab-link" data-tab="settings" role="button" tabindex="0">Settings</span>
												<span class="tab-link" data-tab="Accounts" role="button" tabindex="0">Accounts</span>
												<span class="tab-link" data-tab="portal-users" role="button" tabindex="0">Portal Users</span>
											</div>

											<div class="tab-panels others-tab-panels">
												<section class="tab-panel" data-tab-panel="taxes">
													<div class="post">
														<div class="post-container">
															<div id="customer-taxes" class="mt-2"></div>
														</div>
													</div>
												</section>

												<section class="tab-panel d-none" data-tab-panel="sales-team">
													<div class="post">
														<div class="post-container"></div>
													</div>
												</section>

												<section class="tab-panel d-none" data-tab-panel="settings">
													<div class="post">
														<div class="post-container"></div>
													</div>
												</section>

												<section class="tab-panel d-none" data-tab-panel="Accounts">
													<div class="post">
														<div class="post-container"></div>
													</div>
												</section>

												<section class="tab-panel d-none" data-tab-panel="portal-users">
													<div class="post">
														<div class="post-container"></div>
													</div>
												</section>
											</div>
										</section>


									</div>
								</section>

								<section>	
									<div class="comment-section mt-3 border rounded">
										<div class="comment-box">
											<div class="comment-input-wrapper">
												<div class="comment-input-header">
													<span>Comments</span>
												</div>
												<div class="comment-input-container">
													<span class="avatar avatar-medium" title="">
														<div class="avatar-frame standard-image" style="background-color: var(--dark-green-avatar-bg); color: var(--dark-green-avatar-color)" title="">
															
														</div>
													</span>
													<div class="frappe-control col" data-fieldtype="Comment" data-fieldname="comment">
														<span class="tooltip-content">comment</span>
														<div class="ql-container ql-bubble" style="position: relative;">
															<div id="new-comment-input" class="ql-editor ql-blank" data-gramm="false" contenteditable="true" data-placeholder="Type a reply / comment"><p><br></p></div>
															
															<div class="ql-mention-list-container" style="display: none; position: absolute;"><ul class="ql-mention-list"></ul></div>
														</div>
													</div>
												</div>
											</div>
											
											<div class="comment-actions d-flex justify-content-between gap-2 mt-2">
												<button id="add-comment-btn" class="btn btn-primary btn-default2 btn-comment btn-xs">Comment</button>
												
												<button class="btn btn-sm btn-primary btn-default2 btn-comment" id="email-send">+ New Email</button>
												
											</div>
										</div>
									</div>

									<!-- Timeline post -->
									<div class="bg-white rounded p-2">
										<h6 class="text-uppercase text-muted mb-4 activity">Activity:</h6>
										<div class="timeline" id="activity-timeline">
											<p class="text-muted">Loading activity...</p>
										</div>
									</div>
								</section>
							</div>
						</div>
					</div>
				</div>
			</div>

			<div class="new-customers d-none">
				<div class="row">
					<div class="col-12">
						<div class="customer-header">
							<div class="customer-breadcrumb">
								<h3 class="page-title">Customers</h3>
								<ol class="breadcrumb">
									<li class="breadcrumb-item">
										<a href="javascript:void(0)">CRM</a>
									</li>
									<li class="breadcrumb-item">
										<a href="/app/customers">Customers</a>
									</li>
								</ol>
							</div>
						</div>	
					</div>
				</div>

				<div class="row mt-3">
					<div class="card w-100" style="background:transparent;border:none">
						<div class="card-body p-2" style="padding:5px;">
							<form id="new-customers-form">
								<div class="new-customer-wrap">
									<div class="new-customer-wizard-bar">
										<button type="button" class="new-customer-wizard-step is-active" data-step="1">
											<div class="new-customer-wizard-circle">1</div>
											<div class="new-customer-wizard-label">Basic Info</div>
										</button>
										<div class="new-customer-wizard-connector"></div>
										<button type="button" class="new-customer-wizard-step" data-step="2">
											<div class="new-customer-wizard-circle">2</div>
											<div class="new-customer-wizard-label">Business</div>
										</button>
										<div class="new-customer-wizard-connector"></div>
										<button type="button" class="new-customer-wizard-step" data-step="3">
											<div class="new-customer-wizard-circle">3</div>
											<div class="new-customer-wizard-label">Tax Info</div>
										</button>
										<div class="new-customer-wizard-connector"></div>
										<button type="button" class="new-customer-wizard-step" data-step="4">
											<div class="new-customer-wizard-circle">4</div>
											<div class="new-customer-wizard-label">Contact</div>
										</button>
									</div>

									<div class="new-customer-wizard-panel" data-panel="1">
										<div class="new-customer-card">
											<div class="new-customer-card-title">Basic Information</div>
											<div class="new-customer-form">
												<div class="new-customer-row two-col">
													<div class="new-customer-field"><div id="customer-name-field"></div></div>
													<div class="new-customer-field"><div id="customer-status-field"></div></div>
												</div>
												<div class="new-customer-row two-col">
													<div class="new-customer-field"><div id="customer-type-field"></div></div>
													<div class="new-customer-field"><div id="territory-field"></div></div>
												</div>
												<div class="new-customer-row two-col">
													<div class="new-customer-field"><div id="account-manager-field"></div></div>
												</div>
											</div>
										</div>
									</div>

									<div class="new-customer-wizard-panel d-none" data-panel="2">
										<div class="new-customer-card">
											<div class="new-customer-card-title">Business Information</div>
											<div class="new-customer-form">
												<div class="new-customer-row two-col">
													<div class="new-customer-field"><div id="industry-field"></div></div>
													<div class="new-customer-field"><div id="employees-field"></div></div>
												</div>
												<div class="new-customer-row two-col">
													<div class="new-customer-field"><div id="customer-group-field"></div></div>
													<div class="new-customer-field"><div id="member-of-field"></div></div>
												</div>
											</div>
										</div>
									</div>

									<div class="new-customer-wizard-panel d-none" data-panel="3">
										<div class="new-customer-card">
											<div class="new-customer-card-title">Tax Information</div>
											<div class="new-customer-form">
												<div class="new-customer-row two-col">
													<div class="new-customer-field"><div id="gstin-field"></div></div>
													<div class="new-customer-field"><div id="gst-category-field"></div></div>
												</div>
												<div class="new-customer-row two-col">
													<div class="new-customer-field"><div id="pan-field"></div></div>
													<div class="new-customer-field"><div id="tax-category-field"></div></div>
												</div>
											</div>
										</div>
									</div>

									<div class="new-customer-wizard-panel d-none" data-panel="4">
										<div class="new-customer-card">
											<div class="new-customer-card-title">Contact &amp; Web Presence</div>
											<div class="new-customer-form">
												<div class="new-customer-row two-col">
													<div class="new-customer-field"><div id="phone-number-field"></div></div>
													<div class="new-customer-field"><div id="verified-phone-field"></div></div>
												</div>
												<div class="new-customer-row two-col">
													<div class="new-customer-field"><div id="website-field"></div></div>
													<div class="new-customer-field"><div id="customer-linked-in-field"></div></div>
												</div>
												<div class="new-customer-row one-col">
													<div class="new-customer-field"><div id="mxrecord-field"></div></div>
												</div>
											</div>
										</div>
									</div>

									<div class="new-customer-wizard-footer">
										<button class="btn btn-default" id="new-customer-cancel" type="button">Cancel</button>
										<div class="new-customer-wizard-nav">
											<button class="btn btn-default d-none" id="new-customer-back" type="button">&#8592; Back</button>
											<button class="btn btn-primary1" id="new-customer-next" type="button">Next</button>
											<button type="submit" class="btn btn-primary d-none" id="new-customer-save">Save Customer</button>
										</div>
									</div>
								</div>
							</form>
						</div>
					</div>
				</div>
				
			</div>

			<!-- Footer Start -->
			<footer class="footer">
				<div class="container-fluid">
					<div class="row">
						<div class="col-12 text-center">
							©<span class="fw-semibold footer-text">64 Network Security Pvt Ltd</span> 
						</div>
					</div>
				</div>
			</footer>
			<!-- end Footer -->
			
		</div>
	`
};