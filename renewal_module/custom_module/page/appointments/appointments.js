frappe.pages['appointments'].on_page_load = function (wrapper) {
	localStorage.removeItem('apt_page_length');
	new appointmentspage(wrapper);
};

frappe.pages['appointments'].on_page_show = function (wrapper) {
	console.log("🔄 appointments page showing");
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
			if (!frappe.appointments_page || frappe.appointments_page.wrapper !== pageWrapper) {
				frappe.appointments_page = new appointmentspage(pageWrapper);
			}
			frappe.appointments_page.render();
		});
	});
};

class appointmentspage {
	constructor(wrapper) {
		this.wrapper = wrapper;

		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: '',
			single_column: true
		});
		const savedPageLength = localStorage.getItem('apt_page_length');
		this.page_length = savedPageLength ? parseInt(savedPageLength, 10) : 20;
		this.all_appointments = [];
		this.total_records = 0;
		this.visible_count = 0;
		this.selected_appointments = new Set();
		this._permission_cache = null;
		this._apt_enabled_users_cache = null;
		this._apt_panel_task_assign_control = null;
	}

	render() {
		const waitForContent = () => {
			const $content = $("#support-page-content");
			if (!$content.length) {
				setTimeout(waitForContent, 50);
				return;
			}
			$content.empty().append(frappe.appointments_page_template.body);
			this.handleRoute();
		};
		waitForContent();
	}

	handleRoute() {
		const route = frappe.get_route();
		console.log("handleRoute:", route);
		// appointments
		if (route.length === 1) {
			return this.show_list();
		}
		// appointments/new
		if (route.length === 2 && route[1] === "new") {
			return this.show_new();
		}
		// appointments/<appointment_id>
		if (route.length === 2) {
			const appointment_id = route[1];
			return this.show_details(appointment_id);
		}
	}

	setPageTitle(title) {
		document.title = title;
		this.page.set_title(title);
	}

	setActiveSidebar() {
		const route = frappe.get_route();
		const baseRoute = route[0];
		$(".side-nav-link").removeClass("active-menu");
		$(".side-nav-item").removeClass("active-menu-item");
		$(".menu-parent").removeClass("active");

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

	// ===================== LIST VIEW =====================
	show_list() {
		$(".appointment-list-view").removeClass("d-none");
		$(".appointment-details-view").addClass("d-none");
		$(".new-appointments").addClass("d-none");
		setTimeout(async () => {
			try {
				this.setPageTitle("Appointments");
				this.setActiveSidebar();
				this.bindPaginationEvents();
				this.bindFilterEvents();
				this.bindRowSelectionHandler();
				this.bindActionDropdownHandler();
				this.applyRoleBasedActionVisibility();
				// Restore filters from URL / localStorage, then fetch
				this.applyUrlFilters();
			} catch (err) {
				console.error("appointmentsPage.show_list error:", err);
			}
		}, 200);
	}

	async fetch_list_data({ reset = false } = {}) {
		if (this._fetch_in_progress) return;
		this._fetch_in_progress = true;

		try {
			if (reset) {
				this.all_appointments = [];
				this.visible_count = 0;
			}

			// Read filter values from instance vars (reliably set by filter events + applyUrlFilters)
			const status = this.active_status || "";
			const id = this.active_id || "";
			const advFiltersJson = (this.saved_filters && this.saved_filters.length > 0)
				? JSON.stringify(this.saved_filters)
				: "";

			const r = await frappe.call({
				method: "renewal_module.custom_module.page.appointments.appointments.get_list_data",
				args: {
					start: reset ? 0 : (this.all_appointments ? this.all_appointments.length : 0),
					page_length: this.page_length,
					status: status,
					id: id,
					filters: advFiltersJson
				}
			});
			console.log("response:", r.message);

			if (!r || !r.message) {
				if (reset) { this.all_appointments = []; this.visible_count = 0; this.total_records = 0; }
				this.render_rows();
				return;
			}

			const { data = [], total = 0 } = r.message || {};
			this.total_records = parseInt(total, 10) || 0;

			if (reset) {
				this.all_appointments = Array.isArray(data) ? data.slice() : [];
			} else if (Array.isArray(data) && data.length > 0) {
				this.all_appointments = [...(this.all_appointments || []), ...data];
			}

			this.visible_count = Math.min(this.all_appointments.length, this.total_records);

			const wrapper = this.page.wrapper[0] || this.page.wrapper;
			const visibleEl = wrapper.querySelector("#apt-visible-count");
			const totalEl = wrapper.querySelector("#apt-total-count");
			if (visibleEl) visibleEl.textContent = this.visible_count.toLocaleString();
			if (totalEl) totalEl.textContent = this.total_records.toLocaleString();

			this.render_rows();
		} catch (e) {
			console.error("fetch_list_data error:", e);
		} finally {
			this._fetch_in_progress = false;
		}
	}

	render_rows() {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const tbody = wrapper.querySelector(".appointments-table tbody");
		if (!tbody) return;
		tbody.innerHTML = "";

		const data = this.all_appointments || [];

		if (!Array.isArray(data) || data.length === 0) {
			tbody.insertAdjacentHTML("beforeend", `
				<tr><td colspan="7" class="text-center text-muted py-4">No appointments found.</td></tr>
			`);
			const loadMoreBtn = wrapper.querySelector(".apt-btn-more");
			if (loadMoreBtn) loadMoreBtn.style.display = "none";
			return;
		}

		const me = this;
		data.forEach(apt => {
			const tr = document.createElement("tr");
			tr.innerHTML = `
				<td class="checkbox-cell">
					<input class="form-check-input form-check-input-light fs-14 product-item-check" type="checkbox">
				</td>
				<td>
					<a href="/app/appointments/${apt.name}" class="apt-id-link link-reset apt-link"
					   data-apt-name="${apt.name}" title="${apt.name}">${apt.name}</a>
				</td>
				<td class="ellipsis" title="${escapeHtml(apt.customer_name)}">${escapeHtml(apt.customer_name)}</td>
				<td>
					<span class="pill ${getStatusPillClass(apt.status)}" title="${escapeHtml(apt.status)}">${escapeHtml(apt.status)}</span>
				</td>
				<td class="ellipsis" title="${escapeHtml(apt.custom_start_date)} ${escapeHtml(apt.custom_start_time)}">${formatCustomDate(apt.custom_start_date)} ${escapeHtml(apt.custom_start_time)}</td>
				<td class="ellipsis" title="${escapeHtml(apt.custom_end_date)} ${escapeHtml(apt.custom_end_time)}">${formatCustomDate(apt.custom_end_date)} ${escapeHtml(apt.custom_end_time)}</td>
				<td title="${escapeHtml(apt.scheduled_time || '')}">${formatDatetime(apt.scheduled_time)}</td>
				<td>
					<div class="d-flex align-items-center justify-content-center gap-1 apt-link"
					     data-apt-name="${apt.name}" style="cursor:pointer;">
						<span title="${escapeHtml(apt.modified || '')}">${formatRelativeDate(apt.modified)}</span>
						<span class="d-flex align-items-center gap-1 ml-1" title="${apt.comment_count || 0}">
								<i class="fa fa-comment fs-lg"></i>
								${apt.comment_count || 0}
							</span>
					</div>
				</td>
			`;
			tbody.appendChild(tr);

			// Restore checkbox if previously selected
			const aptCheckbox = tr.querySelector('input[type="checkbox"]');
			if (this.selected_appointments.has(apt.name)) {
				aptCheckbox.checked = true;
			}
		});

		// Load More button visibility
		const loadMoreBtn = wrapper.querySelector(".apt-btn-more");
		if (loadMoreBtn) {
			loadMoreBtn.style.display = (this.visible_count >= (this.total_records || 0)) ? "none" : "inline-block";
		}

		// Bind row click for navigation (stop propagation on checkbox click)
		$(wrapper).off("click", ".apt-link").on("click", ".apt-link", function (e) {
			e.preventDefault();
			const aptName = $(this).data("apt-name");
			if (!aptName) return;
			frappe.set_route("appointments", aptName);
		});

		function escapeHtml(s) {
			if (s == null) return "";
			return String(s)
				.replace(/&/g, "&amp;")
				.replace(/</g, "&lt;")
				.replace(/>/g, "&gt;")
				.replace(/"/g, "&quot;")
				.replace(/'/g, "&#039;");
		}

		function getStatusPillClass(status) {
			switch (status) {
				case "Open": return "apt-pill-open";
				case "Unverified": return "apt-pill-unverified";
				case "Closed": return "apt-pill-closed";
				default: return "text-bg-secondary";
			}
		}

		function formatDatetime(dateStr) {
			if (!dateStr) return "";
			const d = new Date(dateStr);
			if (isNaN(d.getTime())) return dateStr;
			return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
				` <small class="text-muted">${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>`;
		}

		function formatCustomDate(dateStr) {
			if (!dateStr) return "";
			const d = new Date(dateStr);
			if (isNaN(d.getTime())) return dateStr;
			// dd-mm-yy format
			const day = String(d.getDate()).padStart(2, '0');
			const month = String(d.getMonth() + 1).padStart(2, '0');
			const year = String(d.getFullYear()).slice(-2); // get last 2 digits
			return `${day}-${month}-${year}`;
		}

		function formatRelativeDate(dateString) {
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
			if (years > 0) return years + "Y";
			if (months > 0) return months + "M";
			if (days > 0) return days + "d";
			if (hours > 0) return hours + "h";
			if (minutes > 0) return minutes + "m";
			return seconds + "s";
		}

		{
			const table = wrapper.querySelector(".appointments-table");
			const newAppointmentBtn = wrapper.querySelector("#new-appointment-btn");
			const actionsDropdownEl = wrapper.querySelector("#apt-actions-dropdown");

			if (table) {
				const all = table.querySelectorAll('tbody input[type="checkbox"]').length;
				const checked = table.querySelectorAll('tbody input[type="checkbox"]:checked').length;
				const selectAll = table.querySelector('#selectAllAppointments');
				if (selectAll) selectAll.checked = (all > 0 && all === checked);
				// update the action/new-appointment visibility
				this.updateActionBarState(table, newAppointmentBtn, actionsDropdownEl);
			}
		}
	}

	// ---- Exact appointment.js row selection pattern ----
	bindRowSelectionHandler() {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const table = wrapper.querySelector(".appointments-table");
		const newAppointmentBtn = wrapper.querySelector("#new-appointment-btn");
		const actionsDropdown = wrapper.querySelector("#apt-actions-dropdown");

		if (!table || !newAppointmentBtn || !actionsDropdown) return;

		const selectAllCheckbox = table.querySelector("#selectAllAppointments");

		// Select-all checkbox
		if (selectAllCheckbox) {
			selectAllCheckbox.addEventListener("change", (e) => {
				const allRowCheckboxes = table.querySelectorAll('tbody input[type="checkbox"]');
				allRowCheckboxes.forEach(cb => {
					cb.checked = e.target.checked;
					const row = cb.closest("tr");
					const aptName = row.querySelector(".apt-id-link")?.dataset.aptName;
					if (aptName) {
						if (e.target.checked) {
							this.selected_appointments.add(aptName);
						} else {
							this.selected_appointments.delete(aptName);
						}
					}
				});
				this.updateActionBarState(table, newAppointmentBtn, actionsDropdown);
			});
		}

		// Individual row checkbox changes
		table.addEventListener("change", (e) => {
			if (e.target.matches('tbody input[type="checkbox"]')) {
				const row = e.target.closest("tr");
				const aptName = row.querySelector(".apt-id-link")?.dataset.aptName;
				if (aptName) {
					if (e.target.checked) {
						this.selected_appointments.add(aptName);
					} else {
						this.selected_appointments.delete(aptName);
					}
				}
				// Sync select-all state
				if (selectAllCheckbox) {
					const all = table.querySelectorAll('tbody input[type="checkbox"]').length;
					const checked = table.querySelectorAll('tbody input[type="checkbox"]:checked').length;
					selectAllCheckbox.checked = (all === checked);
				}
				this.updateActionBarState(table, newAppointmentBtn, actionsDropdown);
			}
		});
	}

	updateActionBarState(table, newBtn, actionsDropdown) {
		const selectedCount = table.querySelectorAll('tbody input[type="checkbox"]:checked').length;
		const hasVisibleActions = this.hasVisibleActionItems(actionsDropdown);
		if (selectedCount > 0 && hasVisibleActions) {
			newBtn.classList.add("d-none");
			actionsDropdown.classList.remove("d-none");
		} else {
			newBtn.classList.remove("d-none");
			actionsDropdown.classList.add("d-none");
		}
	}

	hasVisibleActionItems(dropdownEl) {
		if (!dropdownEl) return false;
		const actionItems = dropdownEl.querySelectorAll(".dropdown-item[data-apt-action]");
		for (const item of actionItems) {
			if (item.style.display !== "none") return true;
		}
		return false;
	}

	bindPaginationEvents() {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		let pageButtons = wrapper.querySelectorAll(".apt-btn-paging");

		pageButtons.forEach(btn => btn.replaceWith(btn.cloneNode(true)));
		pageButtons = wrapper.querySelectorAll(".apt-btn-paging");

		pageButtons.forEach(btn => {
			btn.addEventListener("click", async () => {
				pageButtons.forEach(b => {
					b.classList.remove("active-pagination");
					b.style.backgroundColor = "";
					b.style.color = "";
				});
				btn.classList.add("active-pagination");
				btn.style.backgroundColor = "#6C5CE7";
				btn.style.color = "white";
				this.page_length = parseInt(btn.dataset.value, 10);
				localStorage.setItem('apt_page_length', this.page_length);
				await this.fetch_list_data({ reset: true });
			});
		});

		// Set default active button
		const defaultBtn = wrapper.querySelector(`.apt-btn-paging[data-value="${this.page_length}"]`);
		if (defaultBtn && !wrapper.querySelector(".active-pagination")) {
			defaultBtn.classList.add("active-pagination");
			defaultBtn.style.backgroundColor = "#6C5CE7";
			defaultBtn.style.color = "white";
		}

		// Load More
		const loadMoreBtn = wrapper.querySelector(".apt-btn-more");
		if (loadMoreBtn) {
			loadMoreBtn.addEventListener("click", async () => {
				loadMoreBtn.style.backgroundColor = "#E7E5F9";
				await this.fetch_list_data({ reset: false });
				setTimeout(() => { loadMoreBtn.style.backgroundColor = ""; }, 500);
			});
		}
	}

	/**
	 * Write current filter values to URL params + localStorage.
	 * Called every time a filter changes.
	 */
	updateFilterUrl() {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const statusEl = wrapper.querySelector('[data-apt-filter="status"]');
		const idEl = wrapper.querySelector('[data-apt-filter="ID"]');

		const status = statusEl ? statusEl.value : "";
		const id = idEl ? idEl.value.trim() : "";

		const params = new URLSearchParams();
		if (status) params.set("status", status);
		if (id) params.set("id", id);

		const qs = params.toString() ? "?" + params.toString() : "";

		// Update browser URL without reload
		window.history.replaceState({}, "", window.location.pathname + window.location.hash.split("?")[0] + qs);

		// Persist to localStorage so navigation-away-and-back restores filters
		if (qs) {
			localStorage.setItem("apt_last_filters", qs);
		} else {
			localStorage.removeItem("apt_last_filters");
		}
	}


	applyUrlFilters() {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;

		// If URL has no params but localStorage has saved state, restore to URL first
		const savedQs = localStorage.getItem("apt_last_filters") || "";
		if (!window.location.search && savedQs) {
			window.history.replaceState({}, "", window.location.pathname + savedQs);
		}

		// Read URL params
		const params = new URLSearchParams(window.location.search);
		const status = params.get("status") || "";
		const id = params.get("id") || "";
		const filters_encoded = params.get("filters") || "";

		// Restore basic filter UI controls
		const statusEl = wrapper.querySelector('[data-apt-filter="status"]');
		const idEl = wrapper.querySelector('[data-apt-filter="ID"]');
		if (statusEl) statusEl.value = status;
		if (idEl) idEl.value = id;

		// Store active basic filter values in state
		this.active_status = status;
		this.active_id = id;

		// Restore advanced filters from URL
		let restored_saved_filters = [];
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
				console.warn("applyUrlFilters: failed to parse advanced filters:", e);
			}
		}
		this.saved_filters = restored_saved_filters;

		// Update filter button count if filter button exists
		const filterButton = wrapper.querySelector('.filter-button');
		if (filterButton && restored_saved_filters.length > 0) {
			const $label = $(filterButton).find(".button-label");
			if ($label.length) $label.text(`Filters (${restored_saved_filters.length})`);
		}

		// Fetch with all restored params
		this.fetch_list_data({ reset: true });
	}

	bindFilterEvents() {
		const me = this;
		const wrapper = this.page.wrapper[0] || this.page.wrapper;

		const statusFilter = wrapper.querySelector('[data-apt-filter="status"]');
		const idFilter = wrapper.querySelector('[data-apt-filter="ID"]');
		const filterButton = wrapper.querySelector('.filter-button');
		const clearFilterButton = wrapper.querySelector('.filter-x-button');

		me.saved_filters = me.saved_filters || [];

		// ------ Helper: update Filter button label count ------
		function update_filter_button_count($btn, count) {
			let $label = $btn.find(".button-label");
			$label.text(count > 0 ? `Filters (${count})` : "Filters");
		}

		// ------ Helper: write all active filter values to URL + localStorage ------
		function updateUrlWithFilters(advancedFilters) {
			try {
				const newUrl = new URL(window.location.href);
				const status = statusFilter ? statusFilter.value : "";
				const id = idFilter ? idFilter.value.trim() : "";

				if (status) newUrl.searchParams.set("status", status);
				else newUrl.searchParams.delete("status");

				if (id) newUrl.searchParams.set("id", id);
				else newUrl.searchParams.delete("id");

				if (advancedFilters && advancedFilters.length) {
					newUrl.searchParams.set("filters", encodeURIComponent(JSON.stringify(advancedFilters)));
				} else {
					newUrl.searchParams.delete("filters");
				}

				window.history.replaceState({}, "", newUrl.toString());
				const qs = newUrl.search;
				if (qs) localStorage.setItem("apt_last_filters", qs);
				else localStorage.removeItem("apt_last_filters");
			} catch (e) {
				console.warn("updateUrlWithFilters error:", e);
			}
		}

		// Show filter count badge on page load if saved_filters exist
		setTimeout(() => {
			if (filterButton) {
				update_filter_button_count($(filterButton), me.saved_filters.length);
			}
		}, 100);

		// ------ Status select ------
		if (statusFilter) {
			statusFilter.addEventListener("change", () => {
				me.active_status = statusFilter.value;
				updateUrlWithFilters(me.saved_filters);
				me.fetch_list_data({ reset: true });
			});
		}

		// ------ ID text filter (debounced 400ms) ------
		if (idFilter) {
			let debounceTimer;
			idFilter.addEventListener("input", () => {
				clearTimeout(debounceTimer);
				debounceTimer = setTimeout(() => {
					me.active_id = idFilter.value.trim();
					updateUrlWithFilters(me.saved_filters);
					me.fetch_list_data({ reset: true });
				}, 400);
			});
		}

		// ------ Clear-× button: resets all filters ------
		if (clearFilterButton) {
			clearFilterButton.addEventListener("click", () => {
				if (me._filter_group) me._filter_group.clear_filters();
				me.saved_filters = [];
				me.active_status = "";
				me.active_id = "";
				if (statusFilter) statusFilter.value = "";
				if (idFilter) idFilter.value = "";
				me._fetch_in_progress = false;
				localStorage.removeItem("apt_last_filters");
				updateUrlWithFilters([]);
				if (filterButton) update_filter_button_count($(filterButton), 0);
				me.fetch_list_data({ reset: true });
			});
		}

		// ------ Filters Button → Frappe FilterGroup popover  ------
		const advancedFilterForm = $(wrapper).find('.filter-section, .filter-container, .advanced-filter-form').first().length
			? $(wrapper).find('.filter-section, .filter-container, .advanced-filter-form').first()
			: $(wrapper);

		advancedFilterForm.find('.filter-button').on("click", async function (e) {
			me._suspend_on_change = true;
			e.preventDefault();
			e.stopPropagation();

			const $btn = $(this);

			// Toggle: dispose if already open
			if ($btn.data("bs.popover")) {
				teardownGuards($btn);
				$btn.popover("dispose");
				return;
			}

			// Build popover content with FilterGroup for Appointment doctype
			let popover_content = $('<div class="filter-area">');
			await frappe.model.with_doctype("Appointment");

			me._filter_group = new frappe.ui.FilterGroup({
				parent: popover_content,
				doctype: "Appointment",
				on_change: function () {
					if (me._suspend_on_change) return;
					me.saved_filters = me._filter_group.get_filters();
					me.fetch_list_data({ reset: true });
					update_filter_button_count($btn, me.saved_filters.length);
					updateUrlWithFilters(me.saved_filters);
				}
			});
			me._filter_group.update_filter_button = function () { };

			// Guards to keep popover open during datepicker interactions
			let lastDownInsidePopover = false;
			let lastDownOnRemove = false;

			function isDatepickerNode(node) {
				if (!node) return false;
				return !!node.closest && !!node.closest(
					'.flatpickr-calendar, .ui-datepicker, .datepicker, .pika-single, .daterangepicker'
				);
			}

			function onDocMouseDownCapture(ev) {
				const inside = !!ev.target.closest(".filter-popover");
				const onRemove = !!ev.target.closest(".filter-popover .filter-remove, .filter-popover .remove-filter");
				const clickedDatepicker = isDatepickerNode(ev.target) ||
					(ev.composedPath && ev.composedPath().some(n => n && n.classList && (
						n.classList.contains('flatpickr-calendar') ||
						n.classList.contains('ui-datepicker') ||
						n.classList.contains('datepicker') ||
						n.classList.contains('pika-single') ||
						n.classList.contains('daterangepicker')
					)));
				lastDownInsidePopover = inside || clickedDatepicker;
				lastDownOnRemove = onRemove;
			}
			function onDatepickerPointerDown(ev) {
				if (isDatepickerNode(ev.target)) lastDownInsidePopover = true;
			}
			document.addEventListener("mousedown", onDocMouseDownCapture, true);
			document.addEventListener("pointerdown", onDatepickerPointerDown, true);

			popover_content.on("pointerdown", ".filter-remove, .remove-filter", function (ev) {
				ev.stopPropagation();
				lastDownInsidePopover = true;
				lastDownOnRemove = true;
			});

			// Restore existing saved_filters or add default blank row
			setTimeout(() => {
				if (me.saved_filters.length) {
					me._filter_group.add_filters(me.saved_filters);
				} else {
					me._filter_group.add_filter("Appointment", "name", "=", "", false);
				}
			}, 0);

			// Footer: Add / Clear / Apply
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

			footer.find('.add-filter').on("click", () =>
				me._filter_group.add_filter("Appointment", "name", "=", "", false)
			);

			footer.find('.clear-filters').on("click", () => {
				if (me._filter_group) me._filter_group.clear_filters();
				me.saved_filters = [];
				me._suspend_on_change = false;
				me._fetch_in_progress = false;
				updateUrlWithFilters([]);
				update_filter_button_count($btn, 0);
				me.fetch_list_data({ reset: true });
				closePopover($btn);
			});

			footer.find('.apply-filters').on("click", () => {
				if (me._filter_group) {
					me.saved_filters = me._filter_group.get_filters();
					me._suspend_on_change = false;
					me._fetch_in_progress = false;
					updateUrlWithFilters(me.saved_filters);
					update_filter_button_count($btn, me.saved_filters.length);
					me.fetch_list_data({ reset: true });
				}
				closePopover($btn);
			});

			// Show popover
			$btn.popover({
				html: true,
				placement: "bottom",
				content: popover_content,
				trigger: "manual",
				container: document.body,
				template: `
					<div class="popover filter-popover fade bs-popover-bottom" role="tooltip">
						<div class="arrow"></div>
						<div class="popover-body popover-content"></div>
					</div>`,
				popperConfig: {
					modifiers: [
						{ name: 'offset', options: { offset: [0, 4] } },
						{ name: 'arrow', options: { element: '.arrow', padding: 6 } },
						{ name: 'preventOverflow', options: { padding: 10, altBoundary: true, tether: false } }
					]
				}
			}).popover("show");

			// Close on outside click
			const onDocClick = function (event) {
				const pathInside = $(event.target).closest(".filter-popover, .filter-button").length ||
					(event.composedPath && event.composedPath().some(n => n && n.classList &&
						(n.classList.contains('filter-popover') || n.classList.contains('filter-button') || n.classList.contains('flatpickr-calendar'))
					));
				if (lastDownOnRemove || lastDownInsidePopover || pathInside) {
					lastDownOnRemove = false;
					return;
				}
				closePopover($btn);
			};
			$(document).on("click.aptFilterPopover", onDocClick);
			$btn.data("guardHandlers", { onDocClick, onDocMouseDownCapture, onDatepickerPointerDown });

			function closePopover($btn) {
				teardownGuards($btn);
				$btn.popover("dispose");
			}
			function teardownGuards($btn) {
				const guards = $btn.data("guardHandlers");
				if (guards) {
					$(document).off("click.aptFilterPopover", guards.onDocClick);
					document.removeEventListener("mousedown", guards.onDocMouseDownCapture, true);
					document.removeEventListener("pointerdown", guards.onDatepickerPointerDown, true);
					$btn.removeData("guardHandlers");
				}
			}
		});

		// Store updateUrlWithFilters on instance so applyUrlFilters can call it
		this._updateUrlWithFilters = updateUrlWithFilters;
	}

	bindActionDropdownHandler() {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const actionsDropdown = wrapper.querySelector("#apt-actions-dropdown");

		if (!actionsDropdown) return;

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

		const $actionsDropdown = $(actionsDropdown);
		$actionsDropdown.off("click").on("click", async (e) => {
			const item = e.target.closest(".dropdown-item");
			if (!item) return;

			e.preventDefault();
			const action = item.dataset.aptAction || item.dataset.action;
			const table = wrapper.querySelector(".appointments-table");
			const checkedBoxes = table.querySelectorAll('tbody input[type="checkbox"]:checked');

			if (!checkedBoxes.length) {
				frappe.msgprint(__("Please select at least one Appointment"));
				return;
			}

			const apts = Array.from(checkedBoxes)
				.map(cb => cb.closest("tr")?.querySelector("a.apt-id-link")?.dataset.aptName)
				.filter(Boolean);

			if (!apts.length) {
				frappe.msgprint(__("No valid Appointment IDs found."));
				return;
			}

			const doctype = "Appointment";
			const me = this;

			if (action === "set_open" || action === "set_closed" || action === "set_unverified") {
				let status = action === "set_open" ? "Open" : (action === "set_closed" ? "Closed" : "Unverified");
				me.bulkUpdate(apts, { fieldname: "status", value: status });
			}
			else if (action === "delete") {
				frappe.confirm(__("Delete {0} selected Appointments?", [apts.length]), () => {
					Promise.all(apts.map(name =>
						frappe.call({
							method: "frappe.client.delete",
							args: { doctype, name }
						})
					)).then(() => {
						frappe.show_alert({ message: __("Deleted successfully"), indicator: "red" });
						me.resetActionBar();
						me.refreshAllData();
					});
				});
				waitForConfirmModal(($modal) => {
					const $close = $modal.find(".btn-modal-close");
					$close.off("click.delete-confirm").on("click.delete-confirm", function (ev) {
						ev.preventDefault();
						ev.stopPropagation();
						try { $modal.modal("hide"); } catch (err) { $modal.removeClass("show in").hide(); }
						$(".modal-backdrop").remove();
					});
				});
			}
			else if (action === "assign_to") {
				let d = new frappe.ui.form.AssignToDialog({ doctype, docname: apts[0] });

				d.dialog.set_primary_action(__("Assign"), () => {
					const values = d.dialog.get_values();
					if (!values) return;
					d.dialog.hide();

					const calls = apts.map(name =>
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
					if (!closeBtn || !closeBtn.length) return;
					closeBtn.off("click.dialog").on("click.dialog", function () {
						d.dialog.hide();
					});
				}, 50);
			}
			else if (action === "edit") {
				frappe.model.with_doctype(doctype, () => {
					const fields = frappe.meta.get_docfields(doctype)
						.filter(df => df.fieldname && df.label && !df.hidden && !df.read_only && df.fieldtype !== "Table");

					const d = new frappe.ui.Dialog({
						title: __("Bulk Edit"),
						fields: [
							{
								label: __("Field"),
								fieldname: "fieldname",
								fieldtype: "Select",
								options: fields.map(df => ({ label: `${df.label}`, value: df.fieldname })),
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
											fieldtype: df.fieldtype || "Data",
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
						primary_action_label: __("Update {0} records", [apts.length]),
						primary_action() {
							const fieldname = d.get_value("fieldname");
							if (!fieldname) {
								frappe.msgprint(__("Please select a field"));
								return;
							}
							if (!d.__value_control) {
								frappe.msgprint(__("Please enter a value"));
								return;
							}
							const value = d.__value_control.get_value();
							d.hide();
							me.bulkUpdate(apts, { fieldname, value });
						}
					});

					d.show();
					setTimeout(() => {
						const closeBtn = d.get_close_btn();
						if (!closeBtn || !closeBtn.length) return;
						closeBtn.off("click.dialog").on("click.dialog", function () {
							d.hide();
						});
					}, 50);
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
								options: print_formats.join("\\n"),
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
						primary_action_label: __("Open {0} Print Views", [apts.length]),
						primary_action(values) {
							d.hide();
							apts.forEach(name => {
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
						if (!closeBtn || !closeBtn.length) return;
						closeBtn.off("click.dialog").on("click.dialog", function () {
							d.hide();
						});
					}, 50);
				});
			}
			else {
				frappe.msgprint(__("Action '{0}' not implemented yet", [action]));
			}
		});
	}

	resetActionBar() {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const newAppointmentBtn = wrapper.querySelector("#new-appointment-btn");
		const actionsDropdown = wrapper.querySelector("#apt-actions-dropdown");

		if (newAppointmentBtn && actionsDropdown) {
			newAppointmentBtn.classList.remove("d-none");
			actionsDropdown.classList.add("d-none");
		}

		this.selected_appointments.clear();

		const table = wrapper.querySelector(".appointments-table");
		if (table) {
			const selectAllCheckbox = table.querySelector('#selectAllAppointments');
			if (selectAllCheckbox) selectAllCheckbox.checked = false;

			const checkboxes = table.querySelectorAll('tbody input[type="checkbox"]');
			checkboxes.forEach(cb => (cb.checked = false));
		}
	}

	bulkUpdate(apts, updates) {
		return new Promise((resolve, reject) => {
			if (!apts.length) return resolve();

			frappe.dom.freeze(__("Updating..."));

			let promises = apts.map(name =>
				frappe.call({
					method: "frappe.client.set_value",
					args: {
						doctype: "Appointment",
						name,
						fieldname: updates.fieldname,
						value: updates.value
					}
				})
			);

			Promise.all(promises)
				.then(async () => {
					frappe.dom.unfreeze();
					frappe.show_alert({ message: __("Updated successfully"), indicator: "green" });
					this.resetActionBar();
					await this.refreshAllData();
					resolve();
				})
				.catch((err) => {
					frappe.dom.unfreeze();
					console.error("Bulk update failed:", err);
					reject(err);
				});
		});
	}

	async refreshAllData() {
		try {
			await this.fetch_list_data({
				reset: true
			});
			setTimeout(() => {
				this.applyRoleBasedActionVisibility();
			}, 100);
		} catch (err) {
			console.error("[refreshAllData] Failed to refresh:", err);
		}
	}

	getAppointmentPermissions(forceRefresh = false) {
		if (!forceRefresh && this._permission_cache) {
			return Promise.resolve(this._permission_cache);
		}

		return new Promise((resolve) => {
			frappe.call({
				method: "renewal_module.custom_module.page.appointments.appointments.get_appointment_permissions",
				callback: (r) => {
					const permissions = {
						write: !!r?.message?.write,
						delete: !!r?.message?.delete,
						print: !!r?.message?.print,
						export: !!r?.message?.export
					};
					this._permission_cache = permissions;
					resolve(permissions);
				},
				error: () => {
					const fallback = { write: false, delete: false, print: false, export: false };
					this._permission_cache = fallback;
					resolve(fallback);
				}
			});
		});
	}

	cleanupDropdownDividers(dropdownMenu) {
		if (!dropdownMenu) return;
		const children = Array.from(dropdownMenu.children);
		let lastVisibleWasDivider = true;

		children.forEach((child) => {
			const divider = child.querySelector(".dropdown-divider");
			if (divider) {
				if (lastVisibleWasDivider) {
					child.style.display = "none";
				} else {
					child.style.display = "";
					lastVisibleWasDivider = true;
				}
				return;
			}

			const hasVisibleAction = !!Array.from(
				child.querySelectorAll(".dropdown-item[data-apt-action]")
			).find((item) => item.style.display !== "none");

			if (hasVisibleAction) {
				child.style.display = "";
				lastVisibleWasDivider = false;
			} else {
				child.style.display = "none";
			}
		});

		for (let i = children.length - 1; i >= 0; i--) {
			if (children[i].style.display === "none") continue;
			if (children[i].querySelector(".dropdown-divider")) {
				children[i].style.display = "none";
			}
			break;
		}
	}

	applyRoleBasedActionVisibility(view = "all") {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;

		this.getAppointmentPermissions().then((perm) => {
			const permissionMap = {
				"set_open": perm.write,
				"set_closed": perm.write,
				"set_unverified": perm.write,
				"edit": perm.write,
				"assign_to": perm.write,
				"print": perm.print,
				"delete": perm.delete,
				"export": perm.export
			};

			const rootSelector = view === "list"
				? "#apt-actions-dropdown"
				: view === "details"
					? "#apt-details-actions-dropdown"
					: "#apt-actions-dropdown, #apt-details-actions-dropdown";

			const dropdownRoots = wrapper.querySelectorAll(rootSelector);
			dropdownRoots.forEach((root) => {
				Object.keys(permissionMap).forEach((action) => {
					const isAllowed = permissionMap[action];
					const items = root.querySelectorAll(`.dropdown-item[data-apt-action="${action}"]`);
					items.forEach((item) => {
						item.style.display = isAllowed ? "" : "none";
					});
				});

				const menu = root.querySelector(".dropdown-menu");
				this.cleanupDropdownDividers(menu);
				if (!this.hasVisibleActionItems(root)) {
					root.classList.add("d-none");
				} else if (root.id === "apt-details-actions-dropdown") {
					root.classList.remove("d-none");
				}
			});

			if (view === "details" || view === "all") {
				const editButtons = wrapper.querySelectorAll("#edit-apt-details-btn, .edit-inline-btn");
				editButtons.forEach((btn) => {
					btn.style.display = perm.write ? "" : "none";
				});
			}

			if (view === "list" || view === "all") {
				const table = wrapper.querySelector(".appointments-table");
				const newAppointmentBtn = wrapper.querySelector("#new-appointment-btn");
				const actionsDropdown = wrapper.querySelector("#apt-actions-dropdown");
				if (table && newAppointmentBtn && actionsDropdown) {
					this.updateActionBarState(table, newAppointmentBtn, actionsDropdown);
				}
			}
		});
	}

	// ===================== DETAILS VIEW =====================
	show_details(appointment_id) {
		$(".appointment-list-view").addClass("d-none");
		$(".appointment-details-view").removeClass("d-none");
		$(".new-appointments").addClass("d-none");
		this.setPageTitle(`appointments/${appointment_id}`);
		this.setActiveSidebar();
		this.applyRoleBasedActionVisibility("details");
		this.load_appointment_details(appointment_id);
	}

	load_appointment_details(appointment_id) {
		frappe.call({
			method: "frappe.client.get",
			args: {
				doctype: "Appointment",
				name: appointment_id,
				fields: ["*"]
			},
			callback: (r) => {
				if (!r || !r.message) {
					frappe.show_alert({ message: __("Appointment not found."), indicator: "red" });
					return;
				}
				const apt = r.message;
				this.render_details(apt);
				this.bind_details_events(apt);
				this.applyRoleBasedActionVisibility("details");
			}
		});
	}

	render_details(apt) {
		function esc(s) {
			if (s == null) return "";
			return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
		}
		function fmtDt(dateStr) {
			if (!dateStr) return "-";
			const d = new Date(dateStr);
			if (isNaN(d.getTime())) return dateStr;
			return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
				" " + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
		}

		function getStatusColors(status) {
			switch (status) {
				case "Open": return { bg: "#0284c7", color: "#e0f2fe", border: "#bae6fd" };
				case "Closed": return { bg: "#16a34a", color: "#dcfce7", border: "#86efac" };
				case "Unverified": return { bg: "#ea580c", color: "#fff7ed", border: "#fed7aa" };
				default: return { bg: "#6b7280", color: "#f3f4f6", border: "#e5e7eb" };
			}
		}

		function fmtDateOnly(dateStr) {
			if (!dateStr) return "-";
			const parts = dateStr.split('-');
			if (parts.length === 3) {
				const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
				const day = parseInt(parts[2], 10);
				const month = months[parseInt(parts[1], 10) - 1];
				const year = parts[0];
				return `${day} ${month} ${year}`;
			}
			return dateStr;
		}

		function fmtTime(timeStr) {
			if (!timeStr) return "";
			return String(timeStr).substring(0, 5);
		}

		const detailsContainer = document.getElementById("apt-details-container");
		if (!detailsContainer) return;

		// Update header elements
		const nameEl = document.getElementById("apt-detail-name");
		const customerEl = document.getElementById("apt-detail-customer");
		const statusBadge = document.getElementById("apt-detail-status");
		const subjectEl = document.getElementById("apt-detail-subject");

		if (nameEl) nameEl.textContent = apt.name;
		if (customerEl) customerEl.textContent = apt.customer_name || "";
		if (subjectEl) subjectEl.textContent = apt.custom_subject || "";
		const sc = getStatusColors(apt.status);
		if (statusBadge) {
			statusBadge.textContent = apt.status || "";
			statusBadge.style.backgroundColor = sc.bg;
			statusBadge.style.color = sc.color;
			statusBadge.style.border = `1px solid ${sc.border}`;
		}

		const participantsList = (apt.custom_participants && apt.custom_participants.length > 0)
			? apt.custom_participants.map(p => esc(p.user || p.participant_name || "")).filter(Boolean)
			: [];

		detailsContainer.innerHTML = `
			<div class="row g-3">
				<!-- LEFT COLUMN: Information Cards -->
				<div class="col-lg-8 col-md-12">
					<div class="corporate-card p-3 mb-3 apt-section-card">
						<div class="apt-section-header mb-3 pb-2 border-bottom">
							<h6 class="mb-0 apt-section-title"><i class="fa fa-user-circle-o me-1"></i> Customer Profile</h6>
						</div>
						<div class="apt-grid-2">
							<div class="apt-info-item">
								<h6 class="text-uppercase text-muted1">Customer Name</h6>
								<span title="${esc(apt.customer_name || '')}">${esc(apt.customer_name || '—')}</span>
							</div>
							<div class="apt-info-item">
								<h6 class="text-uppercase text-muted1">Party / Company</h6>
								<span title="${esc(apt.party || '')}">${esc(apt.party || '—')}</span>
							</div>
							<div class="apt-info-item">
								<h6 class="text-uppercase text-muted1">Email Address</h6>
								<span class="text-truncate" title="${esc(apt.customer_email || '')}">${esc(apt.customer_email || '—')}</span>
							</div>
							<div class="apt-info-item">
								<h6 class="text-uppercase text-muted1">Phone Number</h6>
								<span class="text-truncate" title="${esc(apt.customer_phone_number || '')}">${esc(apt.customer_phone_number || '—')}</span>
							</div>
							<div class="apt-info-item apt-span-2">
								<h6 class="text-uppercase text-muted1">Skype ID</h6>
								<span class="text-truncate" title="${esc(apt.customer_skype || '')}">${esc(apt.customer_skype || '—')}</span>
							</div>
						</div>
					</div>

					<div class="corporate-card p-3 mb-3 apt-section-card">
						<div class="d-flex align-items-center justify-content-between mb-3 pb-2 border-bottom">
							<h6 class="mb-0 apt-section-title"><i class="fa fa-calendar-check-o me-1"></i> Schedule & Ownership</h6>
							
						</div>
						<div class="apt-grid-3">
							<div class="apt-info-item">
								<h6 class="text-uppercase text-muted1">Start Date & Time</h6>
								<span title="${apt.custom_start_date || ''} ${apt.custom_start_time || ''}">${apt.custom_start_date ? fmtDateOnly(apt.custom_start_date) : '—'} ${apt.custom_start_time ? `${fmtTime(apt.custom_start_time)}` : ''}</span>
							</div>
							<div class="apt-info-item">
								<h6 class="text-uppercase text-muted1">End Date & Time</h6>
								<span title="${apt.custom_end_date || ''} ${apt.custom_end_time || ''}">${apt.custom_end_date ? fmtDateOnly(apt.custom_end_date) : '—'} ${apt.custom_end_time ? `${fmtTime(apt.custom_end_time)}` : ''}</span>
							</div>
							<div class="apt-info-item">
								<h6 class="text-uppercase text-muted1">Scheduled For</h6>
								<span title="${apt.scheduled_time || ''}">${apt.scheduled_time ? fmtDt(apt.scheduled_time) : '—'}</span>
							</div>
							<div class="apt-info-item">
								<h6 class="text-uppercase text-muted1">Appointment With</h6>
								<span title="${esc(apt.appointment_with || '')}">${esc(apt.appointment_with || '—')}</span>
							</div>
							<div class="apt-info-item">
								<h6 class="text-uppercase text-muted1">Assigned Owner</h6>
								<span title="${esc(apt.owner || '')}">${esc(apt.owner || '—')}</span>
							</div>
						</div>
					</div>

					<div class="corporate-card p-3 mb-3 apt-section-card">
						<div class="d-flex align-items-center justify-content-between mb-2">
							<h6 class="mb-0 apt-section-title"><i class="fa fa-users me-1"></i> Participants</h6>
							<button type="button" class="btn btn-xs btn-light text-primary py-0 shadow-none edit-inline-btn" data-apt-edit="custom_participants" style="font-size:11px;"><i class="fa fa-pencil me-1"></i>Edit</button>
						</div>
						${participantsList.length > 0 ? `<div class="d-flex flex-wrap gap-1 mt-2">${participantsList.map(p => `<span class="apt-participant-chip">${p}</span>`).join('')}</div>` : '<div class="text-muted fst-italic" style="font-size:12px;">No participants added</div>'}
					</div>
				</div>
				<!-- RIGHT COLUMN -->
				<div class="col-lg-4 col-md-12 d-flex gap-3">
					<!-- Appointment Activity Panel -->
					<aside class="appointment-detail-panel flex-grow-1">
						<div class="panel__tabs">
							<button class="ptab is-active" data-type="Notes" title="Notes"><span class="ptab__icon">📝</span><span class="ptab__label">Notes</span></button>
							<button class="ptab" data-type="Calls" title="Calls"><span class="ptab__icon">📞</span><span class="ptab__label">Calls</span></button>
							<button class="ptab" data-type="Tasks" title="Tasks"><span class="ptab__icon">✅</span><span class="ptab__label">Tasks</span></button>
						</div>
						<div class="panel__header">
							<div class="panel__subtitle" id="appointment-panel-subtitle">Notes</div>
							<button class="btn-panel-create" id="appointment-btn-panel-add"><i class="fa fa-plus"></i> New Note</button>
						</div>
						<div id="appointment-panel-info-card" class="panel-person-card d-none">
							<div class="panel-person-head">
								<div class="panel-person-head-left">
									<div class="panel-person-title-wrap">
										<div class="panel-person-name" id="appointment-panel-info-title">Details</div>
									</div>
								</div>
								<button type="button" class="panel-person-close" id="appointment-panel-info-close">Close</button>
							</div>
							<div id="appointment-panel-info-content"></div>
						</div>
						<div class="panel__cards" id="appointment-panel-cards-section">
							<!-- Notes section (default visible) -->
							<div id="appointment-activity-notes-section" class="appointment-panel-section">
								<textarea id="quick-note-text" class="panel__input form-control mb-2" rows="2" placeholder="Write a quick note..."></textarea>
								<div class="d-flex justify-content-end mb-2">
									<button id="save-quick-note-btn" class="btn btn-sm btn-primary">Save Note</button>
								</div>
								<div id="main-notes-list">
									<div class="text-center p-3 text-muted small">Loading notes...</div>
								</div>
							</div>
							<!-- Tasks section -->
							<div id="appointment-activity-tasks-section" class="appointment-panel-section d-none">
								<div id="activity-tasks-container"></div>
							</div>
							<!-- Calls section -->
							<div id="appointment-activity-calls-section" class="appointment-panel-section d-none">
								<div id="activity-calls-container"></div>
							</div>
						</div>
						<div id="appointment-panel-form-section" class="panel__form d-none">
							<div class="panel__form-head d-flex justify-content-between align-items-center mb-2">
								<div class="panel__form-title" id="appointment-panel-form-title">New Activity</div>
								<button type="button" class="btn btn-sm btn-light" id="appointment-btn-panel-close"><i class="fa fa-times"></i></button>
							</div>
							<div id="appointment-panel-form-body"></div>
							<div class="d-flex justify-content-end gap-2 mt-2">
								<button type="button" class="btn btn-sm btn-primary" id="appointment-panel-save-btn">Save</button>
							</div>
						</div>
						<!-- Hidden cards preserve event bindings for tasks/calls/appointments -->
						<div id="hidden-activity-cards" class="d-none">
							<div id="tasks-card" class="card mb-0 flex-fill d-flex flex-column border-0">
								<div class="card-title card-header">
									<div class="mt-2">
										<div class="" role="group" id="tasks-card-tabs" aria-label="Task filters">
											<button type="button" class="btn btn-sm task-tab active" data-task-filter="all">All</button>
											<button type="button" class="btn btn-sm task-tab" data-task-filter="pending">Pending</button>
											<button type="button" class="btn btn-sm task-tab" data-task-filter="completed">Completed</button>
										</div>
									</div>
								</div>
								<div class="card-body flex-grow-1"></div>
								<div class="card-footer" id="tasks-card-load-more" style="cursor:pointer;text-align:center;">Load More</div>
							</div>
							
							<div id="calls-card" class="card h-100 w-100 d-flex flex-column border-0">
								<div class="card-title card-header">
									<div class="mt-2">
										<div class="" role="group" id="calls-card-tabs" aria-label="Call filters">
											<button type="button" class="btn btn-outline-secondary call-tab active" data-call-filter="all">All</button>
											<button type="button" class="btn btn-outline-secondary call-tab" data-call-filter="held">Held</button>
											<button type="button" class="btn btn-outline-secondary call-tab" data-call-filter="scheduled">Scheduled</button>
											<button type="button" class="btn btn-outline-secondary call-tab" data-call-filter="cancelled">Cancelled</button>
										</div>
									</div>
								</div>
								<div class="card-body flex-grow-1"></div>
								<div class="card-footer" id="calls-card-load-more" style="cursor:pointer;text-align:center;">Load More</div>
							</div>
						</div>
					</aside>
				</div>
					
			</div>

			<!-- customer notes card -->
			<div class="row mt-2">
				<div class="col-12">
					<div class="corporate-card p-3 mb-2">
						<div class="d-flex flex-column gap-3">
							<!-- Label section -->
							<div class="d-flex align-items-center justify-content-between pt-2 border-top">
								<h6 class="mb-0 fw-bold text-uppercase text-muted d-flex align-items-center gap-2" style="font-size:11px; letter-spacing:0.7px;">
									Details
								</h6>
								<button type="button"
									class="btn btn-xs btn-light text-primary contact-info-action-btn shadow-sm rounded-pill px-3 d-flex align-items-center gap-1 edit-inline-btn"
									data-apt-edit="customer_details">
									<i class="fa fa-pencil me-1"></i> Edit
								</button>
							</div>
							<!-- Value section -->
							<div class="apt-notes-container">
								${apt.customer_details ? `
									<div class="apt-notes-content text-dark" style="font-size: 14px; line-height: 1.6;">${esc(apt.customer_details).replace(/\n/g, '<br>')}</div>`
				: `<div class="text-muted fst-italic text-center py-3" style="font-size:13px;">
									<i class="fa fa-file-text-o me-1"></i> No notes provided</div>`
			}
							</div>
							
							
							
						</div>
					</div>
				</div>
			</div>
			</div>

			<!-- Comments & Activity -->
			<div class="row mt-2">
				<div class="col-12">
					<div class="comment-section mb-3">
						<div class="corporate-card comment-box p-3" style="border: none !important;">
							<div class="comment-input-wrapper">
								<div class="comment-input-header mb-3 pb-2">
									<span class="fw-bold text-dark"><i class="fa fa-comments-o me-2"></i>Comments</span>
								</div>
								<div class="comment-input-container w-100">
									<span class="avatar avatar-medium shadow-sm d-flex align-items-center justify-content-center bg-primary text-white rounded-circle fw-bold" style="width: 40px; height: 40px;" title="">
										<div class="avatar-frame standard-image" style="background-color: var(--dark-green-avatar-bg); color: var(--dark-green-avatar-color)" title=""></div>
									</span>
									<div class="frappe-control col" data-fieldtype="Comment" data-fieldname="comment">
										<span class="tooltip-content">comment</span>
										<div class="ql-container ql-bubble rounded-3 border border-light" style="position: relative; background: #fdfdfd;">
											<div id="new-comment-input" class="ql-editor ql-blank p-3" data-gramm="false" contenteditable="true" data-placeholder="Type a reply / comment..."><p><br></p></div>
											<div class="ql-mention-list-container shadow-sm rounded-3 border" style="display: none; position: absolute;"><ul class="ql-mention-list m-0 p-0"></ul></div>
										</div>
									</div>
								</div>
							</div>
							<div class="comment-actions d-flex justify-content-end mt-3 gap-2">
								<button id="add-comment-btn" class="btn btn-primary btn-default2 btn-comment btn-xs rounded-pill px-4 shadow-sm"><i class="fa fa-paper-plane me-1"></i> Comment</button>
								<button class="btn btn-sm btn-outline-primary btn-default2 btn-comment rounded-pill px-4" id="email-send"><i class="fa fa-envelope-o me-1"></i> New Email</button>
							</div>
						</div>
					</div>

					<div class="corporate-card p-4">
						<h6 class="text-uppercase text-muted mb-2 pb-2 activity fw-bold"><i class="fa fa-history mr-2"></i>Activity</h6>
						<div class="timeline" id="activity-timeline">
							<p class="text-muted text-center py-4 bg-light rounded">Loading activity...</p>
						</div>
					</div>
				</div>
			</div>
		`;

		// Bind edit button — button lives outside detailsContainer, query from page wrapper
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const editBtn = wrapper.querySelector('#edit-apt-details-btn');
		if (editBtn) {
			$(editBtn).off('click').on('click', (e) => {
				e.preventDefault();
				e.stopPropagation();
				this.openAptEditDialog(apt.name);
			});
		}

		// Bind inline edit buttons
		const inlineEditBtns = detailsContainer.querySelectorAll('.edit-inline-btn');
		inlineEditBtns.forEach(btn => {
			$(btn).off('click').on('click', (e) => {
				e.preventDefault();
				e.stopPropagation();
				const fieldname = $(e.currentTarget).attr('data-apt-edit');
				this.openSpecificEditDialog(apt.name, fieldname);
			});
		});
	}

	bind_details_events(apt) {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;

		// Back button
		const backBtn = wrapper.querySelector('#apt-back-btn');
		if (backBtn) {
			$(backBtn).off("click").on("click", function (e) {
				e.preventDefault();
				frappe.set_route("appointments");
			});
		}

		// Initialize timeline & comments & email
		this.loadAptActivityTimeline(apt.name);
		this.bindAptCommentEvents(apt.name);
		this.bindAptEmailHandler(apt.name);

		// Initialize detail panel tabs (Notes, Calls, Tasks)
		this.bindAptDetailPanelTabs(apt.name);

		// Actions dropdown
		$(wrapper).off("click", "[data-apt-action]").on("click", "[data-apt-action]", (e) => {
			e.preventDefault();
			const action = $(e.currentTarget).data("apt-action");
			if (action === "set_open") {
				this.update_status(apt.name, "Open");
			} else if (action === "set_closed") {
				this.update_status(apt.name, "Closed");
			} else if (action === "set_unverified") {
				this.update_status(apt.name, "Unverified");
			} else if (action === "delete") {
				frappe.confirm("Are you sure you want to delete this appointment?", () => {
					frappe.call({
						method: "frappe.client.delete",
						args: { doctype: "Appointment", name: apt.name },
						callback: (r) => {
							frappe.show_alert({ message: __("Appointment deleted."), indicator: "green" });
							frappe.set_route("appointments");
						}
					});
				});
			}
		});
	}

	update_status(apt_name, status) {
		frappe.call({
			method: "frappe.client.set_value",
			args: {
				doctype: "Appointment",
				name: apt_name,
				fieldname: "status",
				value: status
			},
			callback: (r) => {
				frappe.show_alert({ message: __("Status updated to {0}", [status]), indicator: "green" });
				this.load_appointment_details(apt_name);
			}
		});
	}

	bindAptEmailHandler(apt_name) {
		const me = this;
		const $emailBtn = $("#email-send");

		if ($emailBtn.length === 0) return;

		$emailBtn.off("click").on("click", async function (e) {
			e.preventDefault();

			// Helper functions
			const normalizeEmails = (items) => {
				const map = new Map();
				(items || []).forEach((email) => {
					if (!email) return;
					const value = String(email).trim();
					if (!value) return;
					const key = value.toLowerCase();
					if (!map.has(key)) map.set(key, value);
				});
				return Array.from(map.values());
			};

			const normalizeOptionValue = (option) => {
				if (!option) return null;
				if (typeof option === "string") return option;
				if (typeof option === "object") {
					return option.value || option.email || option.name || option.label || null;
				}
				return String(option);
			};

			// Get Appointment details
			const apt = await frappe.db.get_doc("Appointment", apt_name);

			// Fetch all enabled system users
			let enabledUsers = [];
			try {
				const usersRes = await frappe.call({
					method: "renewal_module.custom_module.page.appointments.appointments.get_enabled_users",
					silent: true
				});
				enabledUsers = Array.isArray(usersRes?.message) ? usersRes.message : [];
			} catch (err) {
				console.warn("Failed to load enabled users for email options", err);
			}

			// Build a map: lowercased user key (name/email) → canonical email
			const enabledUserEmailMap = new Map();
			enabledUsers.forEach((u) => {
				const keyName = (u?.name || "").trim().toLowerCase();
				const email = (u?.email || u?.name || "").trim();
				if (!email) return;
				enabledUserEmailMap.set(email.toLowerCase(), email);
				if (keyName) enabledUserEmailMap.set(keyName, email);
			});

			const getCurrentUserEmailSignature = async () => {
				try {
					const response = await frappe.db.get_value("User", frappe.session.user, "email_signature");
					return String(response?.message?.email_signature || "").trim();
				} catch (err) {
					console.warn("Unable to fetch current user email signature", err);
					return "";
				}
			};
			const userEmailSignature = await getCurrentUserEmailSignature();
			const defaultMessageContent = userEmailSignature
				? `${"<p><br></p>".repeat(5)}${userEmailSignature}`
				: "";

			// Collect appointment's own emails
			const apt_emails_raw = [];
			if (apt.customer_email) apt_emails_raw.push(apt.customer_email);
			if (apt.contact_email) apt_emails_raw.push(apt.contact_email);
			(apt.custom_participants || []).forEach(p => {
				if (p.user) apt_emails_raw.push(p.user);
			});

			// Normalize apt emails through the user map (resolves user IDs → proper emails)
			const apt_emails = normalizeEmails(
				apt_emails_raw.map((v) => {
					const key = String(v || "").trim().toLowerCase();
					return enabledUserEmailMap.get(key) || v;
				})
			);

			// All system user emails
			const systemUserEmails = normalizeEmails(
				enabledUsers.map((u) => (u?.email || u?.name || "").trim()).filter(Boolean)
			);

			// Merge all options and deduplicate
			const email_options = normalizeEmails([...apt_emails, ...systemUserEmails]);

			// Create email dialog
			const email_dialog = new frappe.ui.Dialog({
				title: __("Send Email"),
				fields: [
					{
						label: __("TO"),
						fieldname: "recipients",
						fieldtype: "MultiSelect",
						reqd: 1,
						options: email_options,
						default: normalizeEmails(apt_emails),
						description: __("Select one or more recipients")
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
						options: email_options
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
						reqd: 1,
						default: `Appointment: ${apt.name}`
					},
					{
						label: __("Message"),
						fieldname: "content",
						fieldtype: "TextEditor",
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
					const readMultiSelect = (fieldname) => {
						const value = email_dialog.get_value(fieldname);
						if (Array.isArray(value)) {
							return value
								.map((item) => (item && typeof item === "object")
									? (item.value || item.email || item.name || item.label || "")
									: item
								)
								.filter(Boolean);
						}
						if (typeof value === "string") {
							return value.split(",").map((item) => item.trim()).filter(Boolean);
						}
						return [];
					};

					const recipientsList = readMultiSelect("recipients");
					const ccList = readMultiSelect("cc");
					const bccList = readMultiSelect("bcc");

					if (!recipientsList.length || !values.subject || !values.content) {
						frappe.msgprint(__("Please fill in all required fields."));
						return;
					}

					let attachments = Array.isArray(email_dialog.__attachments) ? email_dialog.__attachments : [];

					frappe.call({
						method: "renewal_module.custom_module.page.appointments.appointments.send_appointment_email",
						args: {
							appointment_name: apt_name,
							recipients: recipientsList.join(", "),
							cc: ccList.join(", "),
							bcc: bccList.join(", "),
							subject: values.subject,
							content: values.content,
							attachments: attachments,
							send_me_a_copy: values.send_me_a_copy || 0
						},
						freeze_message: __("Sending email..."),
						callback: function (r) {
							if (!r.exc) {
								frappe.show_alert({ message: __("Email sent successfully"), indicator: "green" });
								email_dialog.hide();
								me.loadAptActivityTimeline(apt_name);
							} else {
								frappe.msgprint(__("Failed to send email."));
							}
						}
					});
				}
			});

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

			email_dialog.get_field("attachments_list").$wrapper.off("click.removeatt").on("click.removeatt", "a.remove-att", function (e) {
				e.preventDefault();
				const idx = Number($(this).data("idx"));
				if (Number.isInteger(idx) && email_dialog.__attachments[idx]) {
					email_dialog.__attachments.splice(idx, 1);
					renderAttachmentList();
				}
			});

			renderAttachmentList();
			email_dialog.show();

			email_dialog.$wrapper.find(".add-cc").on("click", function (e) {
				e.preventDefault();
				const cc_field = email_dialog.get_field("cc");
				cc_field.df.hidden = 0;
				cc_field.refresh();
				$(this).hide();
			});

			email_dialog.$wrapper.find(".add-bcc").on("click", function (e) {
				e.preventDefault();
				const bcc_field = email_dialog.get_field("bcc");
				bcc_field.df.hidden = 0;
				bcc_field.refresh();
				$(this).hide();
			});

			setTimeout(() => {
				const closeBtn = email_dialog.get_close_btn();
				if (!closeBtn || !closeBtn.length) {
					return;
				}
				closeBtn.off("click.email_dialog").on("click.email_dialog", function () {
					email_dialog.hide();
				});
			}, 50);

			$(document).off("click.msgprintclose").on("click.msgprintclose", ".msgprint-dialog .btn-modal-close, .msgprint-dialog .modal-header .close", function (e) {
				e.preventDefault();
				e.stopPropagation();

				if (frappe.msg_dialog && frappe.msg_dialog.hide) {
					frappe.msg_dialog.hide();
					return;
				}

				const $dialog = $(this).closest(".msgprint-dialog");
				$dialog.remove();
				$(".modal-backdrop").remove();
			});
		});
	}

	// ============================================
	// ACTIVITY TIMELINE RENDERING
	// ============================================
	getTimelineIcon(type) {
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

	linkifyEmails(html, plainText) {
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

	isFullHtml(content) {
		return /<html|<table|<body|<meta|<style|<head/i.test(content);
	}

	buildStyledContent(rawHtml) {
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
				table { border-collapse: collapse; width: 100%; }
				td, th { border: 1px solid #e5e7eb; padding: 8px; }
			</style>
		`;
		return injectedCSS + rawHtml;
	}

	loadAptActivityTimeline(apt_name) {
		const me = this;
		frappe.call({
			method: "renewal_module.custom_module.page.appointments.appointments.get_appointment_activity",
			args: { appointment_name: apt_name },
			callback: function (res) {
				const container = $("#activity-timeline");
				if (!container.length) return;

				const activities = res.message || [];
				let html = "";

				if (activities.length) {
					activities.forEach(act => {
						let descriptionContent = act.is_html
							? (act.description || "")
							: frappe.utils.escape_html(act.description || "");

						let descriptionHtml = "";

						if (me.isFullHtml(descriptionContent)) {
							// full HTML/email — inject a style into the srcdoc so iframe has our CSS
							const iframeId = "email-frame-" + (Math.random().toString(36).substr(2, 9));
							const styled = me.buildStyledContent(descriptionContent);
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
							const styledFragment = me.buildStyledContent(descriptionContent);
							descriptionHtml = `
							<div class="scrollable-description text-muted">
							${styledFragment}
							</div>
						`;
						}

						// ensure any plaintext email addresses are converted into links
						try {
							const plainText = $('<div>').html(descriptionHtml).text();
							descriptionHtml = me.linkifyEmails(descriptionHtml, plainText);
						} catch (e) {
							// ignore if jQuery isn't available or other errors
						}

						html += `
                        <div class="timeline-item d-block d-md-flex align-items-stretch w-100">
                            <div class="timeline-time pe-3 text-muted mb-1 mb-md-0">${act.timestamp || ""}</div>
                            <div class="timeline-dot bg-${act.color || "secondary"} mx-md-2 my-1 my-md-0 d-none d-md-flex align-items-center justify-content-center">
                                <i class="fa ${me.getTimelineIcon(act.type)} text-white"></i>
                            </div>
                            <div class="timeline-content frappe-card ps-md-3 pb-4 mb-1 ml-1">
                                <span class="mb-1 fs-sm text-muted">${act.title || ""}</span>
                                ${descriptionHtml}
                                <span class="text-primary fs-sm d-block mt-2">By ${act.by || ""}</span>
                            </div>
                        </div>`;
					});
				} else {
					html = `<p class="text-muted text-center">No activity found for this appointment.</p>`;
				}

				container.html(html);
			}
		});
	}

	bindAptCommentEvents(apt_name) {
		const me = this;
		const $commentBtn = $("#add-comment-btn");

		if ($commentBtn.length === 0) return;

		$commentBtn.off("click").on("click", function () {
			const $editor = $("#new-comment-input");
			const html = ($editor.html() || "").trim();
			const plain = $("<div>").html(html).text().trim();

			if (!plain) {
				frappe.msgprint("Please enter a comment.");
				return;
			}

			const finalHtml = me.linkifyEmails(html, plain);

			frappe.call({
				method: "renewal_module.custom_module.page.appointments.appointments.add_appointment_comment",
				args: {
					appointment_name: apt_name,
					content: finalHtml
				},
				callback: function (r) {
					if (!r.exc) {
						frappe.show_alert({ message: "Comment added", indicator: "green" });
						$("#new-comment-input").html("<p><br></p>");
						me.loadAptActivityTimeline(apt_name);
						hideMentionDropdown();
					}
				}
			});
		});

		// Update avatar for current user
		(function setCommentAvatar() {
			const fullName = (frappe.session && (frappe.session.user_fullname || frappe.session.user)) || "User";
			const initials = fullName.trim().split(/\s+/).map(s => s[0] || "").join("").toUpperCase().slice(0, 2) || "U";
			const $frame = $(".comment-section .avatar-frame");
			if ($frame.length) {
				$frame.attr("title", fullName).text(initials);
				$frame.closest(".avatar").attr("title", fullName);
			}
		})();

		// Placeholder toggle
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

		// ============================================
		// MENTIONS AUTOCOMPLETE SYSTEM
		// ============================================

		// Fetch active users once and keep in memory
		let _mention_users = [];
		frappe.call({
			method: "renewal_module.custom_module.page.appointments.appointments.get_enabled_users",
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
					// also respond to touchstart; keep selection safe
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
				$(items.get(mentionSelectionIndex)).addClass('active').scrollIntoView?.();
				return;
			}
			if (e.key === 'ArrowUp') {
				e.preventDefault();
				mentionSelectionIndex = Math.max(mentionSelectionIndex - 1, 0);
				items.removeClass('active');
				$(items.get(mentionSelectionIndex)).addClass('active').scrollIntoView?.();
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
			a.setAttribute('class', 'mention');
			a.setAttribute('data-mention-email', mentionEmail);
			range.deleteContents();
			range.insertNode(a);
			range.setStartAfter(a);
			range.setEndAfter(a);
			range.collapse(false);

			try {
				const sel = window.getSelection();
				sel.removeAllRanges();
				sel.addRange(range);
			} catch (err) {
				console.warn('mention range select failed', err);
			}

			// retrigger input to hide dropdown after mention inserted
			$editor.trigger('input');
		}
	}

	openSpecificEditDialog(apt_name, fieldname) {
		const doctype = "Appointment";
		const normalizeParticipantValue = (rawValue) => {
			if (!rawValue) return [];
			const list = Array.isArray(rawValue)
				? rawValue
				: String(rawValue).split(",");

			return [...new Set(list
				.map((item) => {
					if (!item) return "";
					if (typeof item === "string") return item.trim();
					if (typeof item === "object") {
						return (item.value || item.email || item.user || item.participant_name || item.name || item.label || "").trim();
					}
					return String(item).trim();
				})
				.filter(Boolean))];
		};

		frappe.call({
			method: "frappe.client.get",
			args: { doctype, name: apt_name },
			callback: (resp) => {
				if (!resp || !resp.message) {
					frappe.msgprint(__("Could not fetch appointment details."));
					return;
				}
				let doc = resp.message;

				frappe.model.with_doctype(doctype, async () => {
					if (fieldname === "custom_participants") {
						await frappe.model.with_doctype("Multiselect Users");
					}
					const df = frappe.meta.get_docfield(doctype, fieldname);
					if (!df) {
						frappe.msgprint(__("Field {0} not found.", [fieldname]));
						return;
					}

					let current_value = doc[fieldname];
					let is_child_table = (fieldname === "custom_participants");
					let participant_options = [];
					let participant_default = "";

					if (is_child_table && Array.isArray(current_value)) {
						const selected_participants = current_value
							.map((p) => p.user || p.participant_name || "")
							.filter(Boolean);
						participant_default = selected_participants.join(", ");

						try {
							const users_resp = await frappe.call({
								method: "renewal_module.custom_module.page.appointments.appointments.get_enabled_users"
							});
							const users = users_resp?.message || [];
							participant_options = users.map((u) => ({
								label: u.full_name || u.name || u.email,
								value: u.email || u.name,
								description: u.name || ""
							}));
						} catch (err) {
							console.warn("Failed to load participant options", err);
						}
					}

					let dialog_fields = [];
					if (is_child_table) {
						dialog_fields = [{
							label: df.label || fieldname,
							fieldname: "participants",
							fieldtype: "MultiSelect",
							options: participant_options,
							default: participant_default,
							reqd: df.reqd
						}];
					} else {
						dialog_fields = [
							{
								label: df.label || fieldname,
								fieldname: "value",
								fieldtype: df.fieldtype,
								options: df.options,
								reqd: df.reqd
							}
						];
					}

					const d = new frappe.ui.Dialog({
						title: __("Edit " + (df.label || fieldname)),
						fields: dialog_fields,
						primary_action_label: __("Update"),
						primary_action: () => {
							let value;

							if (is_child_table) {
								value = d.get_value("participants");
							} else {
								value = d.get_value("value");
							}

							if (value === undefined || value === null || value === "") {
								if (df.reqd) {
									frappe.msgprint(__("Value is required"));
									return;
								}
								value = "";
							}

							if (is_child_table) {
								const participants = normalizeParticipantValue(value);
								value = participants.map((user) => ({ user }));
							}

							d.hide();

							if (is_child_table) {
								frappe.call({
									method: "frappe.client.get",
									args: { doctype, name: apt_name },
									callback: (r2) => {
										if (r2 && r2.message) {
											let update_doc = r2.message;
											update_doc[fieldname] = value;
											frappe.call({
												method: "frappe.client.save",
												args: { doc: update_doc },
												callback: () => {
													frappe.show_alert({ message: __("Successfully updated {0}", [df.label]), indicator: "green" });
													this.load_appointment_details(apt_name);
												}
											});
										}
									}
								});
							} else {
								frappe.call({
									method: "frappe.client.set_value",
									args: { doctype, name: apt_name, fieldname, value },
									callback: () => {
										frappe.show_alert({ message: __("Successfully updated {0}", [df.label]), indicator: "green" });
										this.load_appointment_details(apt_name);
									}
								});
							}
						}
					});

					if (!is_child_table) {
						d.set_value("value", current_value);
					}

					d.show();
					if (is_child_table && participant_default) {
						d.set_value("participants", participant_default);
					}
					setTimeout(() => {
						const closeBtn = d.get_close_btn();
						if (!closeBtn || !closeBtn.length) {
							return;
						}
						closeBtn.off("click.d").on("click.d", function () {
							d.hide();
						});
					}, 50);
				});
			}
		});
	}

	openAptEditDialog(apt_name) {
		const doctype = "Appointment";
		frappe.model.with_doctype(doctype, () => {
			const fields = frappe.meta.get_docfields(doctype)
				.filter(df => df.fieldname && df.label && !df.hidden && !df.read_only && df.fieldtype !== "Table");

			const d = new frappe.ui.Dialog({
				title: __("Edit Appointment Details"),
				fields: [
					{
						label: __("Field"),
						fieldname: "fieldname",
						fieldtype: "Select",
						options: fields.map(df => ({ label: `${df.label}`, value: df.fieldname })),
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
									fieldtype: df.fieldtype || "Data",
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
				primary_action_label: __("Update"),
				primary_action: () => {
					const fieldname = d.get_value("fieldname");
					if (!fieldname) {
						frappe.msgprint(__("Please select a field"));
						return;
					}
					if (!d.__value_control) {
						frappe.msgprint(__("Please enter a value"));
						return;
					}
					const value = d.__value_control.get_value();
					d.hide();

					frappe.call({
						method: "frappe.client.set_value",
						args: {
							doctype,
							name: apt_name,
							fieldname,
							value
						},
						callback: () => {
							frappe.show_alert({ message: __("Appointment updated successfully"), indicator: "green" });
							this.load_appointment_details(apt_name);
						}
					});
				}
			});

			d.show();
			setTimeout(() => {
				const closeBtn = d.get_close_btn();
				if (!closeBtn || !closeBtn.length) return;
				closeBtn.off("click.dialog").on("click.dialog", function () {
					d.hide();
				});
			}, 50);
		});
	}

	// ===================== NEW FORM =====================
	show_new() {
		this.setPageTitle("New Appointment");
		this.setActiveSidebar();
		$(".appointment-list-view").addClass("d-none");
		$(".appointment-details-view").addClass("d-none");
		$(".new-appointments").removeClass("d-none");
		this._newAppointmentCurrentStep = 1;
		this.bind_new_form_events();
		this.gotoNewAppointmentWizardStep(1);
	}

	gotoNewAppointmentWizardStep(step) {
		const safeStep = Math.min(3, Math.max(1, cint(step) || 1));
		this._newAppointmentCurrentStep = safeStep;

		const $root = $(this.page.wrapper);
		$root.find(".new-apt-wizard-step").each(function () {
			const s = cint($(this).attr("data-step")) || 1;
			$(this).toggleClass("is-active", s === safeStep);
			$(this).toggleClass("is-done", s < safeStep);
		});

		$root.find(".new-apt-wizard-connector").each(function (idx) {
			$(this).toggleClass("is-done", (idx + 1) < safeStep);
		});

		$root.find(".new-apt-wizard-panel").addClass("d-none");
		$root.find(`.new-apt-wizard-panel[data-panel="${safeStep}"]`).removeClass("d-none");

		$root.find("#new-apt-back").toggleClass("d-none", safeStep === 1);
		$root.find("#new-apt-next").toggleClass("d-none", safeStep === 3);
		$root.find("#save-appointment-btn").toggleClass("d-none", safeStep !== 3);
	}

	validateNewAppointmentWizardStep(step, controls = {}) {
		if (step === 1) {
			const customerName = (controls.customer_name?.get_value?.() || "").trim();
			const customerEmail = (controls.customer_email?.get_value?.() || "").trim();
			if (!customerName || !customerEmail) {
				frappe.msgprint(__("Please fill customer name and email before continuing."));
				return false;
			}
		}

		if (step === 2) {
			const scheduledTime = controls.scheduled_time?.get_value?.();
			if (!scheduledTime) {
				frappe.msgprint(__("Please select Scheduled Time before continuing."));
				return false;
			}
		}

		return true;
	}

	async bind_new_form_events() {
		const me = this;
		const form = document.getElementById("new-appointment-form");
		if (!form) return;

		let appointmentWithControl = frappe.ui.form.make_control({
			df: { fieldtype: "Link", fieldname: "appointment_with", label: "Appointment With", options: "DocType" },
			parent: document.getElementById("appointment-with-field"),
			render_input: true
		});

		let partyControl = frappe.ui.form.make_control({
			df: { fieldtype: "Dynamic Link", fieldname: "party", label: "Party", options: "appointment_with" },
			parent: document.getElementById("party-field"),
			render_input: true
		});

		let customerNameControl = frappe.ui.form.make_control({
			df: { fieldtype: "Data", fieldname: "customer_name", label: "Name", reqd: 1 },
			parent: document.getElementById("customer-name-field"),
			render_input: true
		});

		let customerPhoneControl = frappe.ui.form.make_control({
			df: { fieldtype: "Data", fieldname: "customer_phone_number", label: "Phone Number" },
			parent: document.getElementById("customer-phone-field"),
			render_input: true
		});

		let customerEmailControl = frappe.ui.form.make_control({
			df: { fieldtype: "Data", fieldname: "customer_email", label: "Email", reqd: 1 },
			parent: document.getElementById("customer-email-field"),
			render_input: true
		});

		let customerSkypeControl = frappe.ui.form.make_control({
			df: { fieldtype: "Data", fieldname: "customer_skype", label: "Skype ID" },
			parent: document.getElementById("customer-skype-field"),
			render_input: true
		});

		let startDateControl = frappe.ui.form.make_control({
			df: { fieldtype: "Date", label: "Start Date", fieldname: "custom_start_date", reqd: 1 },
			parent: document.getElementById("start-date-field"),
			render_input: true
		});

		let endDateControl = frappe.ui.form.make_control({
			df: { fieldtype: "Date", label: "End Date", fieldname: "custom_end_date", reqd: 1 },
			parent: document.getElementById("end-date-field"),
			render_input: true
		});

		let startTimeControl = frappe.ui.form.make_control({
			df: { fieldtype: "Time", label: "Start Time", fieldname: "custom_start_time", reqd: 1 },
			parent: document.getElementById("start-time-field"),
			render_input: true
		});

		let endTimeControl = frappe.ui.form.make_control({
			df: { fieldtype: "Time", label: "End Time", fieldname: "custom_end_time", reqd: 1 },
			parent: document.getElementById("end-time-field"),
			render_input: true
		});

		let customerDetailsControl = frappe.ui.form.make_control({
			df: { fieldtype: "Long Text", label: "Details", fieldname: "customer_details" },
			parent: document.getElementById("customer-details-field"),
			render_input: true
		});

		let statusControl = frappe.ui.form.make_control({
			df: { fieldtype: "Select", fieldname: "status", label: "Status", options: "Open\nClosed\nUnverified", default: "Open" },
			parent: document.getElementById("status-field"),
			render_input: true
		});
		statusControl.set_value("Open");

		// Initialize frappe controls — all parent lookups use document.getElementById()
		let scheduledTimeControl = frappe.ui.form.make_control({
			df: { fieldtype: "Datetime", label: "Scheduled Time", fieldname: "scheduled_time", reqd: 1 },
			parent: document.getElementById("scheduled-time-field"),
			render_input: true
		});

		let participant_options = [];
		try {
			const usersResp = await frappe.call({
				method: "renewal_module.custom_module.page.appointments.appointments.get_enabled_users"
			});
			const users = usersResp?.message || [];
			participant_options = users.map((u) => ({
				label: u.full_name || u.name || u.email,
				value: u.email || u.name,
				description: u.name || ""
			}));
		} catch (err) {
			console.warn("Failed to load participant options", err);
		}

		let participantsControl = frappe.ui.form.make_control({
			df: {
				fieldtype: "MultiSelect",
				label: "Participants",
				fieldname: "participants",
				options: participant_options
			},
			parent: document.getElementById("participants-field"),
			render_input: true
		});

		const controls = {
			customer_name: customerNameControl,
			customer_email: customerEmailControl,
			scheduled_time: scheduledTimeControl
		};

		const $scope = $(this.page.wrapper[0] || this.page.wrapper);
		$scope.find("#new-apt-cancel").off("click").on("click", function () {
			frappe.set_route("appointments");
		});

		$scope.find("#new-apt-back").off("click").on("click", function () {
			me.gotoNewAppointmentWizardStep((me._newAppointmentCurrentStep || 1) - 1);
		});

		$scope.find("#new-apt-next").off("click").on("click", function () {
			const current = me._newAppointmentCurrentStep || 1;
			if (!me.validateNewAppointmentWizardStep(current, controls)) return;
			me.gotoNewAppointmentWizardStep(current + 1);
		});

		$scope.find(".new-apt-wizard-step").off("click").on("click", function () {
			const targetStep = cint($(this).attr("data-step")) || 1;
			const current = me._newAppointmentCurrentStep || 1;
			if (targetStep > current && !me.validateNewAppointmentWizardStep(current, controls)) return;
			me.gotoNewAppointmentWizardStep(targetStep);
		});



		// Prevent accidental form submission from nested buttons
		form.addEventListener("submit", function (e) {
			e.preventDefault();
		});

		// Bind save logic to the specific Save button
		const saveBtn = form.querySelector("#save-appointment-btn");
		saveBtn.addEventListener("click", function (e) {
			e.preventDefault();
			if (!me.validateNewAppointmentWizardStep(1, controls)) {
				me.gotoNewAppointmentWizardStep(1);
				return;
			}
			if (!me.validateNewAppointmentWizardStep(2, controls)) {
				me.gotoNewAppointmentWizardStep(2);
				return;
			}

			const customer_name = customerNameControl.get_value();
			const customer_email = customerEmailControl.get_value();
			const customer_phone_number = customerPhoneControl.get_value();
			const customer_skype = customerSkypeControl.get_value();
			const customer_details = customerDetailsControl.get_value();
			const status = statusControl.get_value();
			const scheduled_time = scheduledTimeControl.get_value();
			const appointment_with = appointmentWithControl.get_value();
			const party = partyControl.get_value();
			const custom_start_date = startDateControl.get_value();
			const custom_end_date = endDateControl.get_value();
			const custom_start_time = startTimeControl.get_value();
			const custom_end_time = endTimeControl.get_value();

			let participants = participantsControl.get_value();
			// Convert to array of child table dicts if it is a comma separated string
			if (participants && typeof participants === "string") {
				participants = participants.split(",").map(p => ({ user: p.trim() }));
			} else if (Array.isArray(participants)) {
				participants = participants.map(p => typeof p === "string" ? { user: p } : p);
			}

			if (!customer_name || !scheduled_time || !customer_email) {
				frappe.msgprint({
					title: __("Required Fields"),
					message: __("Please fill all required fields: Name, Email, Scheduled Time."),
					indicator: "red"
				});
				return;
			}

			const new_appointment = {
				doctype: "Appointment",
				customer_name,
				customer_email,
				customer_phone_number,
				customer_skype,
				customer_details,
				scheduled_time,
				appointment_with,
				party,
				status,
				custom_start_date,
				custom_end_date,
				custom_start_time,
				custom_end_time,
				custom_participants: participants
			}

			console.log("submitting appointment", new_appointment);

			frappe.call({
				method: "frappe.client.insert",
				args: {
					doc: new_appointment
				},
				callback: function (r) {
					if (r && r.message) {
						const apt_name = r.message.name;
						frappe.show_alert({ message: __("Appointment {0} created successfully.", [apt_name]), indicator: "green" }, 5);
						setTimeout(() => {
							frappe.set_route("appointments", apt_name);
						}, 1000);
						form.reset();
						participantsControl.refresh();
						customerNameControl.refresh();
						customerEmailControl.refresh();
						customerPhoneControl.refresh();
						customerSkypeControl.refresh();
						customerDetailsControl.refresh();
						statusControl.refresh();
						scheduledTimeControl.refresh();
						appointmentWithControl.refresh();
						partyControl.refresh();
						startDateControl.refresh();
						endDateControl.refresh();
						startTimeControl.refresh();
						endTimeControl.refresh();

					}
					else {
						frappe.msgprint({
							title: __("Error"),
							message: __(r?.message || "An unexpected error occurred."),
							indicator: "red"
						});
					}
				},
				error: function (r) {
					frappe.msgprint({
						title: __("Error"),
						message: __(r?.message || "An unexpected error occurred."),
						indicator: "red"
					});
				}
			});
		});
	}

	// ===================== DETAIL PANEL TABS =====================
	bindAptDetailPanelTabs(apt_name) {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const self = this;
		let activePanelType = "Notes";

		const moveContent = (sourceSelector, targetSelector) => {
			const sourceEl = $(wrapper).find(sourceSelector).first();
			const targetEl = $(wrapper).find(targetSelector).first();
			if (!sourceEl.length || !targetEl.length) return;
			targetEl.empty().append(sourceEl);
		};

		const updateAddBtnLabel = (type) => {
			const labels = {
				Notes: "New Note",
				Tasks: "New Task",
				Calls: "New Call"
			};
			$(wrapper).find("#appointment-btn-panel-add").html(`<i class="fa fa-plus"></i> ${labels[type] || "Add"}`);
		};

		moveContent("#tasks-card", "#activity-tasks-container");
		moveContent("#calls-card", "#activity-calls-container");
		$(wrapper).find("#activity-tasks-container #add-tasks-btn, #activity-calls-container #add-calls-btn").addClass("d-none");

		// Bind tab click events
		$(wrapper).off("click", ".appointment-detail-panel .ptab").on("click", ".appointment-detail-panel .ptab", function (e) {
			e.preventDefault();
			const tabType = $(this).data("type");
			activePanelType = tabType;
			self.switchAptPanelTab(tabType, apt_name, wrapper);
			updateAddBtnLabel(tabType);
		});

		// Bind panel "Add" button
		$(wrapper).off("click", "#appointment-btn-panel-add").on("click", "#appointment-btn-panel-add", async function (e) {
			e.preventDefault();
			if (activePanelType === "Notes") {
				$(wrapper).find("#quick-note-text").trigger("focus");
				return;
			}
			await self.showAptPanelForm(activePanelType, apt_name, wrapper);
		});

		$(wrapper).off("click", "#appointment-btn-panel-close").on("click", "#appointment-btn-panel-close", function (e) {
			e.preventDefault();
			self.hideAptPanelForm(wrapper);
		});

		$(wrapper).off("click", "#appointment-panel-save-btn").on("click", "#appointment-panel-save-btn", async function (e) {
			e.preventDefault();
			const $btn = $(this);
			$btn.prop("disabled", true).text("Saving...");
			try {
				await self.saveAptPanelData(activePanelType, apt_name, wrapper);
			} finally {
				$btn.prop("disabled", false).text("Save");
			}
		});

		// Bind quick note save
		$(wrapper).off("click", "#save-quick-note-btn").on("click", "#save-quick-note-btn", function (e) {
			e.preventDefault();
			const $btn = $(this);
			const text = $(wrapper).find("#quick-note-text").val().trim();

			if (!text) {
				frappe.msgprint(__("Please enter a note"));
				return;
			}

			$btn.prop("disabled", true).text("Saving...");

			frappe.call({
				method: "renewal_module.custom_module.page.appointments.appointments.add_appointment_note",
				args: {
					appointment_id: apt_name,
					note_text: text
				},
				callback: function (r) {
					$btn.prop("disabled", false).text("Save Note");
					if (!r.exc) {
						$(wrapper).find("#quick-note-text").val("");
						frappe.show_alert({ message: __("Note added"), indicator: "green" });
						self.loadAptNotes(apt_name, wrapper);
					}
				},
				error: function () {
					$btn.prop("disabled", false).text("Save Note");
				}
			});
		});

		// ---- Note Edit ----
		$(wrapper).off("click", ".note-edit").on("click", ".note-edit", function () {
			const noteName = $(this).data("idx");
			const currentText = $(this).closest(".note-card").find(".note-text").text().trim();

			const d = frappe.prompt(
				[{ label: __("Edit Note"), fieldname: "note", fieldtype: "Small Text", default: currentText }],
				function (values) {
					frappe.call({
						method: "renewal_module.custom_module.page.appointments.appointments.update_appointment_note",
						args: { appointment_id: apt_name, note_name: noteName, note_text: values.note },
						callback: function (r) {
							if (!r.exc) {
								frappe.show_alert({ message: __("Note updated"), indicator: "green" });
								self.loadAptNotes(apt_name, wrapper);
							}
						}
					});
				},
				__("Edit Note")
			);

			// Fix close button behaviour
			setTimeout(() => {
				try {
					if (d && d.get_close_btn) {
						d.get_close_btn().off("click").on("click", () => d.hide());
					} else {
						$(".modal:visible .btn-modal-close").off("click").on("click", () => {
							$(".modal:visible").modal("hide");
							$(".modal-backdrop").remove();
						});
					}
				} catch (err) {
					console.error("Failed to bind dialog close:", err);
				}
			}, 50);
		});

		// ---- Note Delete ----
		$(wrapper).off("click", ".note-delete").on("click", ".note-delete", function (e) {
			e.preventDefault();
			e.stopPropagation();
			const noteName = $(this).data("idx");

			frappe.confirm(
				__("Delete this note?"),
				() => {
					frappe.call({
						method: "renewal_module.custom_module.page.appointments.appointments.delete_appointment_note",
						args: { appointment_id: apt_name, note_name: noteName },
						callback: function (r) {
							if (!r.exc) {
								frappe.show_alert({ message: __("Note deleted"), indicator: "green" });
								self.loadAptNotes(apt_name, wrapper);
							}
						}
					});
				}
			);

			// Fix confirm modal close button
			let tries = 0;
			const check = () => {
				const $modal = $(".modal:visible");
				if ($modal.length) {
					const $close = $modal.find(".btn-modal-close");
					$close.off("click.note-confirm-apt").on("click.note-confirm-apt", function (ev) {
						ev.preventDefault();
						ev.stopPropagation();
						try { $modal.modal("hide"); } catch (err) { $modal.removeClass("show in").hide(); }
						$(".modal-backdrop").remove();
					});
				} else if (tries < 20) {
					tries++;
					setTimeout(check, 20);
				}
			};
			check();
		});

		// ---- Call card click → open Frappe form ----
		$(wrapper).off("click", ".apt-call-open").on("click", ".apt-call-open", function () {
			const name = $(this).data("name");
			if (name) {
				//frappe.set_route("Call Lists", name);
				const url = "/app/call-lists/" + name;
				window.open(url, "_blank");
			}

		});

		// ---- Task card click → open Frappe form ----
		$(wrapper).off("click", ".apt-task-open").on("click", ".apt-task-open", function () {
			const name = $(this).data("name");
			if (name) {
				const url = "/app/tasks/" + name;
				window.open(url, "_blank");
			}

		});

		$(wrapper).off("click", ".call-open").on("click", ".call-open", function () {
			const name = $(this).data("name");
			if (name) {
				const url = "/app/call-lists/" + name;
				window.open(url, "_blank");
			}
		});

		$(wrapper).off("click", ".task-open").on("click", ".task-open", function () {
			const name = $(this).data("name");
			if (name) {
				const url = "/app/tasks/" + name;
				window.open(url, "_blank");
			}
		});

		updateAddBtnLabel("Notes");

		// Load Notes by default
		this.switchAptPanelTab("Notes", apt_name, wrapper);
	}

	switchAptPanelTab(tabType, apt_name, wrapper) {
		const moveContent = (sourceSelector, targetSelector) => {
			const sourceEl = $(wrapper).find(sourceSelector).first();
			const targetEl = $(wrapper).find(targetSelector).first();
			if (!sourceEl.length || !targetEl.length) return;
			targetEl.empty().append(sourceEl);
		};

		// Close any open form first
		this.hideAptPanelForm(wrapper);

		// Update active tab styling
		$(wrapper).find(".appointment-detail-panel .ptab").removeClass("is-active");
		$(wrapper).find(`.appointment-detail-panel .ptab[data-type="${tabType}"]`).addClass("is-active");

		// Update panel header subtitle and "Add" button label
		const subtitleMap = { Notes: "Notes", Tasks: "Tasks", Calls: "Calls" };
		$(wrapper).find("#appointment-panel-subtitle").text(subtitleMap[tabType] || tabType);

		// Hide all sections and show selected one
		$(wrapper).find(".appointment-panel-section").addClass("d-none");
		$(wrapper).find(`#appointment-activity-${tabType.toLowerCase()}-section`).removeClass("d-none");

		// Load dynamic data based on tab type
		if (tabType === "Notes") {
			this.loadAptNotes(apt_name, wrapper);
		} else if (tabType === "Calls") {
			moveContent("#calls-card", "#activity-calls-container");
			$(wrapper).find("#activity-calls-container #add-calls-btn").addClass("d-none");
			this.loadAptCalls(apt_name, wrapper);
		} else if (tabType === "Tasks") {
			moveContent("#tasks-card", "#activity-tasks-container");
			$(wrapper).find("#activity-tasks-container #add-tasks-btn").addClass("d-none");
			this.loadAptTasks(apt_name, wrapper);
		}
	}

	hideAptPanelForm(wrapper) {
		$(wrapper).find("#appointment-panel-form-section").addClass("d-none");
		$(wrapper).find("#appointment-panel-cards-section").removeClass("d-none");
		$(wrapper).find("#appointment-btn-panel-add").show();
		$(wrapper).find(".appointment-detail-panel .panel__header").show();
		this._apt_panel_task_assign_control = null;
		this._apt_panel_call_name_control = null;
		this._apt_panel_call_selected_customer = "";
	}

	async showAptPanelForm(type, apt_name, wrapper) {
		$(wrapper).find("#appointment-panel-cards-section").addClass("d-none");
		$(wrapper).find("#appointment-panel-form-section").removeClass("d-none");
		$(wrapper).find("#appointment-btn-panel-add").hide();
		$(wrapper).find(".appointment-detail-panel .panel__header").hide();
		const esc = frappe.utils.escape_html;

		const apt = await frappe.db.get_doc("Appointment", apt_name);
		let enabledUsers = this._apt_enabled_users_cache || [];
		if (!enabledUsers.length) {
			try {
				const usersRes = await frappe.call({
					method: "renewal_module.custom_module.page.appointments.appointments.get_enabled_users",
					silent: true
				});
				enabledUsers = Array.isArray(usersRes?.message) ? usersRes.message : [];
			} catch (e) {
				enabledUsers = [];
			}
			this._apt_enabled_users_cache = enabledUsers;
		}

		// const usersOptions = enabledUsers.map((u) => {
		// 	const label = frappe.utils.escape_html(String(u.full_name || u.name || u.email || "User"));
		// 	const value = frappe.utils.escape_html(String(u.email || u.name || ""));
		// 	return `<option value="${value}">${label}</option>`;
		// }).join("");
		const usersOptionsHtml = () => enabledUsers.map((u) => {
			const label = esc(u.full_name || u.name || u.email || "User");
			const value = esc(u.email || u.name || "");
			return `<option value="${value}">${label}</option>`;
		}).join("");

		const usersOptions = usersOptionsHtml();

		const fetchCustomerSalesPerson = async (customer) => {
			const customerName = String(customer || "").trim();
			if (!customerName) return "";

			try {
				const salesRes = await frappe.call({
					method: "renewal_module.custom_module.page.appointments.appointments.get_customer_sales_person",
					args: { customer: customerName },
					silent: true,
				});
				return (salesRes?.message || "").trim();
			} catch (e) {
				return "";
			}
		};

		const getContactLinkedCustomer = async (contactName) => {
			const name = String(contactName || "").trim();
			if (!name) return "";
			try {
				const res = await frappe.call({
					method: "frappe.client.get",
					args: { doctype: "Contact", name },
					silent: true,
				});
				const links = res?.message?.links || [];
				const customerLink = links.find((l) => l.link_doctype === "Customer" && l.link_name);
				return customerLink?.link_name || "";
			} catch (e) {
				return "";
			}
		};

		const syncCallSalesPerson = async () => {
			const relatedTo = (($(wrapper).find("#apt-call-related-to").val() || "Customer") + "").trim();
			if (relatedTo !== "Customer") {
				$(wrapper).find("#apt-call-sales-person").val("");
				return;
			}

			const customerName = this._apt_panel_call_name_control?.get_value?.() || "";
			const salesPerson = await fetchCustomerSalesPerson(customerName);
			$(wrapper).find("#apt-call-sales-person").val(salesPerson || "");
		};

		if (type === "Calls") {
			const appointmentWith = String(apt.appointment_with || "").trim();
			const defaultCustomer = appointmentWith === "Customer"
				? (apt.party || apt.customer_name || "").trim()
				: "";
			const defaultContact = appointmentWith === "Contact"
				? (apt.party || "").trim()
				: "";
			const defaultRelatedTo = defaultContact ? "Contact" : "Customer";
			this._apt_panel_call_selected_customer = defaultCustomer || "";

			if (!this._apt_panel_call_selected_customer && defaultContact) {
				this._apt_panel_call_selected_customer = await getContactLinkedCustomer(defaultContact);
			}

			$(wrapper).find("#appointment-panel-form-title").text("New Call");
			$(wrapper).find("#appointment-panel-save-btn").text("Save Call");
			$(wrapper).find("#appointment-panel-form-body").html(`
				<div class="apt-form-grid">
					<div class="mb-2"><label class="form-label">Subject *</label><input type="text" id="apt-call-subject" class="form-control" /></div>
					<div class="mb-2"><label class="form-label">Status</label><select id="apt-call-status" class="form-control"><option value="Held">Held</option><option value="Scheduled">Scheduled</option><option value="Cancelled">Cancelled</option></select></div>
					<div class="row g-2">
						<div class="col-6 mb-2"><label class="form-label">Start Date</label><input type="date" id="apt-call-start-date" class="form-control" /></div>
						<div class="col-6 mb-2"><label class="form-label">Start Time</label><input type="time" id="apt-call-start-time" class="form-control" /></div>
					</div>
					<div class="row g-2">
						<div class="col-6 mb-2"><label class="form-label">End Date</label><input type="date" id="apt-call-end-date" class="form-control" /></div>
						<div class="col-6 mb-2"><label class="form-label">End Time</label><input type="time" id="apt-call-end-time" class="form-control" /></div>
					</div>
					<div class="row g-2">
						<div class="col-6 mb-2"><label class="form-label">Related To</label><select id="apt-call-related-to" class="form-control"><option value="Customer">Customer</option><option value="Contact">Contact</option></select></div>
						<div class="col-6 mb-2"><label class="form-label">Full Name *</label><div id="apt-call-name1-control"></div></div>
					</div>
					<div class="mb-2"><label class="form-label">Sales Person *</label><input type="text" id="apt-call-sales-person" class="form-control" placeholder="Auto-filled from Customer" /></div>
					<div class="mb-2"><label class="form-label">Description</label><textarea id="apt-call-description" class="form-control" rows="3"></textarea></div>
				</div>
			`);

			$(wrapper).find("#apt-call-related-to").val(defaultRelatedTo);

			const renderCallNameControl = async () => {
				const relatedTo = (($(wrapper).find("#apt-call-related-to").val() || "Customer") + "").trim();
				const host = $(wrapper).find("#apt-call-name1-control");
				host.empty();

				this._apt_panel_call_name_control = frappe.ui.form.make_control({
					parent: host[0],
					df: {
						fieldtype: "Link",
						fieldname: "apt_call_name1",
						label: "",
						options: relatedTo,
						reqd: 1,
						onchange: async () => {
							if (relatedTo === "Customer") {
								this._apt_panel_call_selected_customer = this._apt_panel_call_name_control?.get_value?.() || this._apt_panel_call_selected_customer;
								await syncCallSalesPerson();
							}
						}
					},
					render_input: true,
				});

				this._apt_panel_call_name_control.refresh();

				// Keep the Link field search/autocomplete, but disable the open-document arrow button.
				host.find(".link-btn")
					.addClass("d-none")
					.attr("tabindex", "-1")
					.attr("aria-hidden", "true");
				host.off("click.apt_call_name_link", ".link-btn").on("click.apt_call_name_link", ".link-btn", function (e) {
					e.preventDefault();
					e.stopPropagation();
					return false;
				});

				if (relatedTo === "Contact") {
					this._apt_panel_call_name_control.get_query = () => ({
						query: "frappe.contacts.doctype.contact.contact.contact_query",
						filters: {
							link_doctype: "Customer",
							link_name: this._apt_panel_call_selected_customer || "",
						},
					});
					this._apt_panel_call_name_control.set_value(defaultContact || "");
					$(wrapper).find("#apt-call-sales-person").val("");
				} else {
					this._apt_panel_call_name_control.set_value(this._apt_panel_call_selected_customer || defaultCustomer || "");
					await syncCallSalesPerson();
				}
			};

			const now = new Date();
			const end = new Date(now.getTime() + (10 * 60 * 1000));
			const pad2 = (value) => String(value).padStart(2, "0");
			const toDateInput = (dateObj) => `${dateObj.getFullYear()}-${pad2(dateObj.getMonth() + 1)}-${pad2(dateObj.getDate())}`;
			const toTimeInput = (dateObj) => `${pad2(dateObj.getHours())}:${pad2(dateObj.getMinutes())}`;
			$(wrapper).find("#apt-call-start-date").val(toDateInput(now));
			$(wrapper).find("#apt-call-start-time").val(toTimeInput(now));
			$(wrapper).find("#apt-call-end-date").val(toDateInput(end));
			$(wrapper).find("#apt-call-end-time").val(toTimeInput(end));

			$(wrapper).find("#apt-call-related-to").off("change").on("change", async () => {
				const relatedTo = (($(wrapper).find("#apt-call-related-to").val() || "Customer") + "").trim();
				if (relatedTo === "Contact") {
					const currentCustomer = this._apt_panel_call_name_control?.get_value?.();
					if (currentCustomer) this._apt_panel_call_selected_customer = currentCustomer;
				}
				await renderCallNameControl();
			});

			await renderCallNameControl();
		} else if (type === "Tasks") {
			$(wrapper).find("#appointment-panel-form-title").text("New Task");
			$(wrapper).find("#appointment-panel-save-btn").text("Save Task");
			$(wrapper).find("#appointment-panel-form-body").html(`
				<div class="apt-form-grid">
				<div class="mb-2"><label class="form-label">Subject *</label><input type="text" id="apt-task-subject" class="form-control" /></div>
				<div class="mb-2"><label class="form-label">Assign To</label><div id="apt-task-assign-control" class="apt-multi-control"></div><select id="apt-task-assign-to" class="form-control apt-task-assign-multi d-none" multiple>${usersOptions}</select></div>
				<div class="row g-2">
					<div class="col-6 mb-2"><label class="form-label">Expected End Date</label><input type="datetime-local" id="apt-task-end-date" class="form-control" /></div>
					<div class="col-6 mb-2"><label class="form-label">Priority</label><select id="apt-task-priority" class="form-control"><option value="Low" selected>Low</option><option value="Medium">Medium</option><option value="High">High</option></select></div>
				</div>
				<div class="mb-2"><label class="form-label">Description</label><textarea id="apt-task-description" class="form-control" rows="3"></textarea></div>
				</div>
			`);

			this._apt_panel_task_assign_control = null;
			const $host = $(wrapper).find("#apt-task-assign-control");
			if ($host.length && frappe?.ui?.form?.make_control) {
				const options = (enabledUsers || []).map((u) => {
					const value = String(u?.email || u?.name || "").trim();
					const label = String(u?.full_name || u?.name || u?.email || value).trim();
					if (!value) return null;
					return { label, value, description: u?.email || value };
				}).filter(Boolean);

				$host.empty();
				this._apt_panel_task_assign_control = frappe.ui.form.make_control({
					parent: $host,
					df: {
						fieldtype: "MultiSelect",
						fieldname: "apt_task_assign_to",
						label: "",
						options,
					},
					render_input: true,
				});

				if (this._apt_panel_task_assign_control?.refresh) {
					this._apt_panel_task_assign_control.refresh();
				}
			}

			if (!this._apt_panel_task_assign_control) {
				$(wrapper).find("#apt-task-assign-to").removeClass("d-none");
			}
		}
	}

	async saveAptPanelData(type, apt_name, wrapper) {
		try {
			if (type === "Calls") {
				const subject = ($(wrapper).find("#apt-call-subject").val() || "").trim();
				const relatedTo = ($(wrapper).find("#apt-call-related-to").val() || "Customer").trim();
				let name1 = this._apt_panel_call_name_control?.get_value?.() || "";
				name1 = String(name1 || "").trim();
				let customSalesPerson = ($(wrapper).find("#apt-call-sales-person").val() || "").trim();
				if (relatedTo === "Customer") {
					if (!name1) {
						name1 = String(this._apt_panel_call_selected_customer || "").trim();
					}
					if (!customSalesPerson) {
						try {
							const salesRes = await frappe.call({
								method: "renewal_module.custom_module.page.appointments.appointments.get_customer_sales_person",
								args: { customer: name1 },
								silent: true,
							});
							customSalesPerson = (salesRes?.message || "").trim();
						} catch (e) {
							customSalesPerson = "";
						}
					}
					if (!customSalesPerson) {
						frappe.msgprint(__("Sales Person is required for selected customer"));
						return;
					}
				}

				if (!subject || !name1) {
					frappe.msgprint(__("Please fill required call fields"));
					return;
				}

				await frappe.call({
					method: "frappe.client.insert",
					args: {
						doc: {
							doctype: "Call List",
							subject,
							name1,
							related_to: relatedTo,
							status: $(wrapper).find("#apt-call-status").val() || "Held",
							description: $(wrapper).find("#apt-call-description").val() || "",
							start_date: $(wrapper).find("#apt-call-start-date").val() || "",
							start_timing: $(wrapper).find("#apt-call-start-time").val() || "",
							end_date: $(wrapper).find("#apt-call-end-date").val() || "",
							end_timing: $(wrapper).find("#apt-call-end-time").val() || "",
							custom_date: frappe.datetime.get_today(),
							custom_sales_person: customSalesPerson,
							reference: "Appointment",
							reference_to: apt_name
						}
					}
				});

				frappe.show_alert({ message: __("Call created"), indicator: "green" });
				this.loadAptCalls(apt_name, wrapper);
				this.hideAptPanelForm(wrapper);
			} else if (type === "Tasks") {
				const subject = ($(wrapper).find("#apt-task-subject").val() || "").trim();
				let selectedUsers = [];
				if (this._apt_panel_task_assign_control && typeof this._apt_panel_task_assign_control.get_value === "function") {
					const raw = this._apt_panel_task_assign_control.get_value();
					if (Array.isArray(raw)) {
						selectedUsers = raw.map((v) => String(v || "").trim()).filter(Boolean);
					} else {
						selectedUsers = String(raw || "").split(",").map((v) => v.trim()).filter(Boolean);
					}
				} else {
					selectedUsers = $(wrapper).find("#apt-task-assign-to").val() || [];
				}
				const expEndRaw = ($(wrapper).find("#apt-task-end-date").val() || "").trim();
				let expEndDate = expEndRaw;
				if (expEndDate.includes("T")) {
					expEndDate = expEndDate.replace("T", " ");
					if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(expEndDate)) expEndDate += ":00";
				}

				if (!subject) {
					frappe.msgprint(__("Please enter task subject"));
					return;
				}

				await frappe.call({
					method: "frappe.client.insert",
					args: {
						doc: {
							doctype: "Task",
							subject,
							priority: $(wrapper).find("#apt-task-priority").val() || "Medium",
							description: $(wrapper).find("#apt-task-description").val() || "",
							exp_end_date: expEndDate,
							custom_users: (Array.isArray(selectedUsers) ? selectedUsers : [selectedUsers]).filter(Boolean).map((email) => ({ user: email })),
							reference: "Appointment",
							reference_to: apt_name
						}
					}
				});

				frappe.show_alert({ message: __("Task created"), indicator: "green" });
				this.loadAptTasks(apt_name, wrapper);
				this.hideAptPanelForm(wrapper);
			}
		} catch (err) {
			console.error("Error saving panel data:", err);
			frappe.msgprint(__("Error saving. Please try again."));
		}
	}

	loadAptNotes(apt_name, wrapper) {
		const notesContainer = $(wrapper).find("#main-notes-list");
		if (!notesContainer.length) return;

		notesContainer.html(`
			<div class="d-flex align-items-center text-muted small py-2">
				<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
				<span>Loading notes...</span>
			</div>
		`);

		frappe.call({
			method: "renewal_module.custom_module.page.appointments.appointments.get_appointment_notes",
			args: { appointment_id: apt_name },
			callback: (r) => {
				const notes = r.message || [];

				if (notes.length === 0) {
					notesContainer.html(`
						<div class="empty-state-list text-center py-4">
							<i class="fa fa-file-text-o text-muted mb-2" style="font-size: 24px;"></i>
							<p class="text-muted mb-0" style="font-size: 13px;">No notes found.</p>
						</div>
					`);
					return;
				}

				let notesHtml = "";
				const sortedNotes = [...notes].sort((a, b) => new Date(b.timestamp || b.creation) - new Date(a.timestamp || a.creation));

				sortedNotes.forEach(note => {
					const displayNameRaw = note.created_by || note.owner || '';
					const initials = displayNameRaw.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
					const timestampRaw = note.timestamp || note.creation;
					const timestamp = timestampRaw ? frappe.datetime.str_to_user(timestampRaw) : '';
					const is_owner = frappe.session.user === note.owner;
					const is_admin = frappe.session.user === 'Administrator';
					const creatorName = frappe.utils.escape_html(displayNameRaw);
					const customRole = frappe.utils.escape_html(note.custom_role || '');
					const noteBody = frappe.utils.escape_html(note.note || note.description || '').replace(/\n/g, '<br>');
					const avatarInitials = frappe.utils.escape_html(initials || 'NA');

					const action_buttons = `
						${is_owner || is_admin ? `<button class="note-edit btn btn-sm btn-light border me-1" data-idx="${note.name}" title="Edit note" aria-label="Edit note">✏️</button>` : ''}
						${is_admin ? `<button class="note-delete btn btn-sm btn-light border text-danger" data-idx="${note.name}" title="Delete note" aria-label="Delete note">🗑️</button>` : ''}
					`;

					const user_avatar = `<div class="rounded-circle bg-primary text-white d-flex align-items-center justify-content-center fw-bold me-2 flex-shrink-0" style="width:32px;height:32px;">${avatarInitials}</div>`;

					notesHtml += `
						<div class="note-card mb-2 p-2 border rounded bg-white">
							<div class="d-flex justify-content-between align-items-start gap-2">
								<div class="d-flex align-items-center flex-grow-1" style="min-width:0;">
									${user_avatar}
									<div class="flex-grow-1" style="min-width:0;">
										<div class="text-muted text-truncate" title="${creatorName}">${creatorName}</div>
										${customRole ? `<div class="small text-muted">${customRole}</div>` : ''}
									</div>
								</div>
								<div class="d-flex align-items-center">${action_buttons}</div>
							</div>
							<div class="note-text p-2 mt-2 border rounded bg-light" style="max-height:180px;overflow:auto;">
								${noteBody}
							</div>
							<div class="mt-2 d-flex justify-content-end">
								<div class="small text-muted">${timestamp}</div>
							</div>
						</div>
					`;
				});
				notesContainer.html(notesHtml);
			},
			error: (err) => {
				notesContainer.html(`
					<div class="alert alert-danger" role="alert">
						Failed to load notes. Please try again.
					</div>
				`);
			}
		});
	}

	loadAptCalls(apt_name, wrapper) {
		const cardBody = $(wrapper).find("#calls-card .card-body");
		const loadMoreBtn = $(wrapper).find("#calls-card-load-more");
		if (!cardBody.length) return;

		const MAX_VISIBLE_CALLS = 5;
		let activeCallFilter = "all";
		const esc = frappe.utils.escape_html;

		frappe.call({
			method: "renewal_module.custom_module.page.appointments.appointments.get_appointment_calls",
			args: { appointment_id: apt_name },
			callback: async (r) => {
				const calls = Array.isArray(r.message) ? r.message : [];
				const normalizeStatus = (status) => (status || "").toLowerCase();

				const getFilteredCalls = (filter) => {
					if (filter === "all") return calls;
					return calls.filter((c) => normalizeStatus(c.status) === filter);
				};

				const updateCallTabCounts = () => {
					const totalCount = calls.length;
					const heldCount = calls.filter((c) => normalizeStatus(c.status) === "held").length;
					const scheduledCount = calls.filter((c) => normalizeStatus(c.status) === "scheduled").length;
					const cancelledCount = calls.filter((c) => normalizeStatus(c.status) === "cancelled").length;

					$(wrapper).find("#calls-card-tabs .call-tab").each(function () {
						const $btn = $(this);
						switch ($btn.data("callFilter")) {
							case "held":
								$btn.text(`Held (${heldCount})`);
								break;
							case "scheduled":
								$btn.text(`Scheduled (${scheduledCount})`);
								break;
							case "cancelled":
								$btn.text(`Cancelled (${cancelledCount})`);
								break;
							default:
								$btn.text(`All (${totalCount})`);
								break;
						}
					});
				};

				const updateTabStyles = (filter) => {
					$(wrapper).find("#calls-card-tabs .call-tab").each(function () {
						const $btn = $(this);
						const isActive = $btn.data("callFilter") === filter;
						$btn.toggleClass("active", isActive);
						$btn.css("border", isActive ? "1px solid #007bff" : "");
						$btn.css("color", isActive ? "#007bff" : "");
						$btn.toggleClass("btn-outline-secondary", !isActive);
					});
				};

				const safeId = (v) => String(v).replace(/[^a-zA-Z0-9-_]/g, "_");
				const simpleInitialAvatar = (owner) => {
					const init = (owner || "U").substring(0, 2).toUpperCase();
					return `
					<span style="width:22px;height:22px;border-radius:50%;
						background:#4A81D4;color:#fff;
						display:flex;align-items:center;justify-content:center;font-size:11px;">
						${init}
					</span>`;
				};

				const statusBadgeClass = (status) => {
					switch (status) {
						case "Held": return "bg-warning text-white";
						case "Scheduled": return "bg-primary text-white";
						case "Cancelled": return "bg-danger text-white";
						default: return "bg-secondary text-white";
					}
				};

				const formatDate = (dt) => {
					if (!dt) return "";
					const [y, m, d] = String(dt).split(" ")[0].split("-");
					return `${d}-${m}-${y}`;
				};

				const formatTime = (t) => {
					if (!t) return "";
					return String(t).split(".")[0].split(" ")[1] || t;
				};

				const buildCallCard = (c, hidden = false) => {
					const id = safeId(c.name);
					return `
						<div class="call-card p-2 mb-2 rounded shadow-sm ${hidden ? "call-hidden" : ""}" style="background:#f8f9fa;border:1px solid #e6e6e6;">
							<div class="d-flex justify-content-between align-items-center mb-1 gap-1">
								<div class="fw-bold text-primary text-truncate" title="${esc(c.subject || "")}">${esc(c.subject || "")}</div>
								<div id="apt-call-avatar-${id}" title="${esc(c.owner || "")}">${simpleInitialAvatar(c.owner)}</div>
							</div>
							<div class="d-flex justify-content-between align-items-center mb-1 gap-1">
								<span class="text-dark text-truncate" title="${esc(c.name1 || "")}">${esc(c.name1 || "")}</span>
								<span class="text-truncate status-badge ${statusBadgeClass(c.status)} rounded" title="${esc(c.status || "")}">${esc(c.status || "")}</span>
								<span class="call-open badge bg-light p-1" data-name="${esc(c.name)}" title="${esc(c.name)}" style="cursor:pointer;border:1px solid #ddd;">${esc(c.name)}</span>
							</div>
							<div class="row small">
								<div class="col-6">
									${c.start_date ? `<div><i class="fa fa-calendar-days text-warning mr-1"></i>${esc(formatDate(c.start_date))}</div>` : ""}
									${c.start_timing ? `<div><i class="fa fa-clock text-primary mr-1"></i>${esc(formatTime(c.start_timing))}</div>` : ""}
								</div>
								<div class="col-6">
									${c.end_date ? `<div><i class="fa fa-calendar-days text-warning mr-1"></i>${esc(formatDate(c.end_date))}</div>` : ""}
									${c.end_timing ? `<div><i class="fa fa-clock text-primary mr-1"></i>${esc(formatTime(c.end_timing))}</div>` : ""}
								</div>
							</div>
						</div>
					`;
				};

				const loadCallAvatars = async (list) => {
					if (!frappe.model.can_read("User")) return;
					const owners = [...new Set(list.map((x) => x.owner).filter(Boolean))];
					if (!owners.length) return;

					const res = await frappe.call({
						method: "renewal_module.custom_module.page.appointments.appointments.get_users_basic_info",
						args: { users: owners }
					});

					const map = {};
					(res.message || []).forEach((u) => { map[u.name] = u; });

					list.forEach((c) => {
						const holder = $(wrapper).find(`#apt-call-avatar-${safeId(c.name)}`).get(0);
						const userInfo = map[c.owner];
						if (!holder || !userInfo?.user_image) return;
						holder.innerHTML = `<img src="${userInfo.user_image}" style="width:22px;height:22px;border-radius:50%;">`;
					});
				};

				const renderCalls = async (filter) => {
					const filteredCalls = getFilteredCalls(filter);
					loadMoreBtn.toggle(filteredCalls.length > MAX_VISIBLE_CALLS);
					cardBody.html("");
					if (!filteredCalls.length) {
						cardBody.html('<div class="empty-state-list text-center py-4"><i class="fa-solid fa-phone-slash text-muted mb-2" style="font-size: 24px;"></i><p class="text-muted mb-0" style="font-size: 13px;">No calls found.</p></div>');
						return;
					}

					filteredCalls.forEach((c, index) => {
						cardBody.append(buildCallCard(c, index >= MAX_VISIBLE_CALLS));
					});

					await loadCallAvatars(filteredCalls);
				};

				updateCallTabCounts();
				updateTabStyles(activeCallFilter);
				await renderCalls(activeCallFilter);

				$(wrapper).off("click", "#calls-card-tabs .call-tab").on("click", "#calls-card-tabs .call-tab", async function () {
					activeCallFilter = $(this).data("callFilter") || "all";
					updateTabStyles(activeCallFilter);
					await renderCalls(activeCallFilter);
				});

				$(wrapper).off("click", "#calls-card-load-more").on("click", "#calls-card-load-more", function () {
					const advancedFilters = [
						["Call List", "reference", "=", "Appointment"],
						["Call List", "reference_to", "=", apt_name],
					];
					const params = new URLSearchParams();
					params.set("filters", encodeURIComponent(JSON.stringify(advancedFilters)));

					if (activeCallFilter === "held") params.set("status", "Held");
					if (activeCallFilter === "scheduled") params.set("status", "Scheduled");
					if (activeCallFilter === "cancelled") params.set("status", "Cancelled");

					const url = `/app/call-lists?${params.toString()}`;
					window.open(url, "_blank");
				});
			},
			error: () => {
				cardBody.html('<div class="alert alert-danger">Failed to load calls.</div>');
			}
		});
	}

	loadAptTasks(apt_name, wrapper) {
		const taskCardBody = $(wrapper).find("#tasks-card .card-body");
		const loadMoreBtn = $(wrapper).find("#tasks-card-load-more");
		if (!taskCardBody.length) return;

		const MAX_VISIBLE_TASKS = 5;
		let activeTaskFilter = "all";

		frappe.call({
			method: "renewal_module.custom_module.page.appointments.appointments.get_appointment_tasks",
			args: { appointment_id: apt_name },
			callback: async (r) => {
				const tasks = Array.isArray(r.message) ? r.message : [];
				const normalizeStatus = (status) => (status || "").toLowerCase();
				const isCompleted = (task) => normalizeStatus(task.status) === "completed";

				const getFilteredTasks = (filter) => {
					switch (filter) {
						case "completed":
							return tasks.filter(isCompleted);
						case "pending":
							return tasks.filter((t) => !isCompleted(t));
						default:
							return tasks;
					}
				};

				const updateTabCounts = () => {
					const totalCount = tasks.length;
					const completedCount = tasks.filter(isCompleted).length;
					const pendingCount = totalCount - completedCount;

					$(wrapper).find("#tasks-card-tabs .task-tab").each(function () {
						const $btn = $(this);
						switch ($btn.data("taskFilter")) {
							case "completed":
								$btn.text(`Completed (${completedCount})`);
								break;
							case "pending":
								$btn.text(`Pending (${pendingCount})`);
								break;
							default:
								$btn.text(`All (${totalCount})`);
								break;
						}
					});
				};

				const updateTabStyles = (filter) => {
					$(wrapper).find("#tasks-card-tabs .task-tab").each(function () {
						const $btn = $(this);
						const isActive = $btn.data("taskFilter") === filter;
						$btn.toggleClass("active", isActive);
						$btn.css("border", isActive ? "1px solid #007bff" : "");
						$btn.css("color", isActive ? "#007bff" : "");
						$btn.toggleClass("btn-outline-secondary", !isActive);
					});
				};

				const statusBadgeClass = (status) => {
					switch (status) {
						case "Open": return "bg-warning text-white";
						case "Working": return "bg-primary text-white";
						case "Pending Review": return "bg-success text-white";
						case "Overdue": return "bg-secondary text-white";
						case "Templated": return "bg-info text-white";
						case "Cancelled": return "bg-danger text-white";
						default: return "bg-light text-dark";
					}
				};

				const formatDateTimeDisplay = (value) => {
					const val = String(value || "").trim();
					if (!val) return "";
					const dt = frappe.datetime?.str_to_obj ? frappe.datetime.str_to_obj(val) : new Date(val);
					if (!(dt instanceof Date) || Number.isNaN(dt.getTime())) return val;
					const dd = String(dt.getDate()).padStart(2, "0");
					const mm = String(dt.getMonth() + 1).padStart(2, "0");
					const yy = String(dt.getFullYear()).slice(-2);
					const hh = String(dt.getHours()).padStart(2, "0");
					const min = String(dt.getMinutes()).padStart(2, "0");
					return `${dd}-${mm}-${yy} ${hh}:${min}`;
				};

				const buildAvatar = (user) => {
					if (user.image) return `<img src="${user.image}">`;
					const p = (user.full_name || "User").trim().split(/\s+/);
					const initials = ((p[0]?.[0] || "U") + (p[1]?.[0] || "")).toUpperCase();
					return `<span class="tasks-avatar-initials" style="display:flex;align-items:center;justify-content:center;">${initials}</span>`;
				};

				const buildAvatarGroup = (users) => {
					if (!users?.length) return "";
					const shown = users.slice(0, 2);
					const extra = users.length - shown.length;
					return `
						<div style="display:flex;justify-content:end;align-items:center;">
							${shown.map((u, i) => `<div class="tasks-avatar-item" title="${frappe.utils.escape_html(u.full_name)}" style="margin-left:${i === 0 ? "0" : "-8px"};">${buildAvatar(u)}</div>`).join("")}
							${extra > 0 ? `<div class="extra-tasks-avatar" title="${frappe.utils.escape_html(users.slice(2).map((u) => u.full_name).join(", "))}">+${extra}</div>` : ""}
						</div>
					`;
				};

				const fetchUserMap = async (users) => {
					if (!users.length) return {};
					const res = await frappe.call({
						method: "renewal_module.custom_module.page.appointments.appointments.get_users_basic_info",
						args: { users }
					});
					const map = {};
					(res.message || []).forEach((u) => {
						const normalized = {
							full_name: u.full_name,
							image: u.user_image ? frappe.utils.get_file_link(u.user_image) : null
						};
						if (u.name) map[u.name] = normalized;
						if (u.email) map[u.email] = normalized;
					});
					return map;
				};

				const buildTaskCardHTML = (t, hidden = false) => {
					const safeId = frappe.utils.escape_html(String(t.name || "").replace(/[^a-zA-Z0-9-_]/g, "_"));
					return `
						<div id="tasks-card-${safeId}" class="task-card p-2 mb-2 rounded shadow-sm ${hidden ? "task-hidden" : ""}" style="background:#f8f9fa; border:1px solid #eee;">
							<div class="d-flex justify-content-between align-items-center gap-1 mb-1">
								<div style="width:70%;">
									<div class="fw-bold text-primary text-truncate mb-1" title="${frappe.utils.escape_html(t.subject || "")}">${frappe.utils.escape_html(t.subject || "")}</div>
								</div>
								<div style="width:30%; display:flex; justify-content:end;">
									<div class="avatar-holder" id="apt-task-avatars-${safeId}" style="min-width:60px;text-align:right;"></div>
								</div>
							</div>
							<div class="d-flex justify-content-between align-items-center gap-1 mb-1">
								<span class="task-open text-truncate" data-name="${frappe.utils.escape_html(t.name)}" style="cursor:pointer;" title="${frappe.utils.escape_html(t.name)}">${frappe.utils.escape_html(t.name)}</span>
								<span class="status-badge ${statusBadgeClass(t.status)} text-truncate rounded" title="${frappe.utils.escape_html(t.status || "")}">${t.status || ""}</span>
								<span class="priority-badge bg-info text-white text-truncate rounded" title="${frappe.utils.escape_html(t.priority || "")}">${t.priority || ""}</span>
							</div>
							<div class="mb-1">${t.exp_end_date ? `<span class="text-danger" title="${formatDateTimeDisplay(t.exp_end_date)}">${formatDateTimeDisplay(t.exp_end_date)}</span>` : ""}</div>
						</div>
					`;
				};

				const fillTaskAvatars = (visibleTasks, userMap) => {
					visibleTasks.forEach((t) => {
						const safeId = String(t.name || "").replace(/[^a-zA-Z0-9-_]/g, "_");
						const holder = $(wrapper).find(`#apt-task-avatars-${safeId}`).get(0);
						if (!holder) return;

						const assigned = (t.custom_users || []).map((u) => {
							const key = (typeof u === "string" ? u : (u?.user || u?.name || u?.email || "")).trim();
							if (!key) return null;
							return userMap[key] || { full_name: key, image: null };
						}).filter(Boolean);
						holder.innerHTML = buildAvatarGroup(assigned);
					});
				};

				const allUsers = [...new Set(tasks.flatMap((t) => (t.custom_users || []).map((u) => {
					const key = (typeof u === "string" ? u : (u?.user || u?.name || u?.email || "")).trim();
					return key || null;
				})).filter(Boolean))];
				const userMap = await fetchUserMap(allUsers);

				const renderTasks = (filter) => {
					const filteredTasks = getFilteredTasks(filter);
					loadMoreBtn.toggle(filteredTasks.length > MAX_VISIBLE_TASKS);
					taskCardBody.html("");

					if (!filteredTasks.length) {
						taskCardBody.html('<div class="empty-state-list text-center py-4"><i class="fa-regular fa-folder-open text-muted mb-2" style="font-size: 24px;"></i><p class="text-muted mb-0" style="font-size: 13px;">No tasks found.</p></div>');
						return;
					}

					filteredTasks.forEach((t, index) => {
						taskCardBody.append(buildTaskCardHTML(t, index >= MAX_VISIBLE_TASKS));
					});

					fillTaskAvatars(filteredTasks, userMap);
				};

				updateTabCounts();
				updateTabStyles(activeTaskFilter);
				renderTasks(activeTaskFilter);

				$(wrapper).off("click", "#tasks-card-tabs .task-tab").on("click", "#tasks-card-tabs .task-tab", function () {
					activeTaskFilter = $(this).data("taskFilter") || "all";
					updateTabStyles(activeTaskFilter);
					renderTasks(activeTaskFilter);
				});

				$(wrapper).off("click", "#tasks-card-load-more").on("click", "#tasks-card-load-more", function () {
					const advancedFilters = [
						["Task", "reference", "=", "Appointment"],
						["Task", "reference_to", "=", apt_name],
					];

					if (activeTaskFilter === "completed") {
						advancedFilters.push(["Task", "status", "=", "Completed"]);
					} else if (activeTaskFilter === "pending") {
						advancedFilters.push(["Task", "status", "!=", "Completed"]);
					}

					const params = new URLSearchParams();
					params.set("filters", encodeURIComponent(JSON.stringify(advancedFilters)));
					const url = `/app/tasks?${params.toString()}`;
					window.open(url, "_blank");
				});
			},
			error: () => {
				taskCardBody.html('<div class="alert alert-danger">Failed to load tasks.</div>');
			}
		});
	}

	formatAptDateTime(dateStr) {
		if (!dateStr) return "-";
		const d = new Date(dateStr);
		if (isNaN(d.getTime())) return dateStr;
		return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
			" " + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}

	formatDate(dateStr) {
		if (!dateStr) return "-";
		const parts = String(dateStr).split('-');
		if (parts.length === 3) {
			const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
			const day = parseInt(parts[2], 10);
			const month = months[parseInt(parts[1], 10) - 1];
			const year = parts[0];
			return `${day} ${month} ${year}`;
		}
		return dateStr;
	}
}

// ============================================================
// PAGE TEMPLATE
// ============================================================
frappe.appointments_page_template = {
	body: `
	<div class="wrapper">

		<!-- ==================== LIST VIEW ==================== -->
		<div class="appointment-list-view">

			<div class="row">
				<div class="col-12">
					<div class="page-title-head d-flex align-items-center">
						<div class="flex-grow-1">
							<h3 class="fs-xl fw-bold m-0">Appointments</h3>
						</div>
						<div class="text-end">
							<ol class="breadcrumb m-0 py-0" style="background-color: transparent;">
								<li class="breadcrumb-item"><a href="javascript: void(0);">Activity</a></li>
								<li class="breadcrumb-item active">Appointments</li>
							</ol>
						</div>
					</div>
				</div>
			</div>

			<div class="row">
				<div class="col-12">
					<div class="controls-wrapper">
						<div class="controls">
							<div class="left-controls">
								<!-- Status Filter -->
								<select class="control-select" data-apt-filter="status" style="min-width:130px;">
									<option value="">Status</option>
									<option value="Open">Open</option>
									<option value="Unverified">Unverified</option>
									<option value="Closed">Closed</option>
								</select>
								<input class="control-select" type="text" placeholder="ID" data-apt-filter="ID">
							</div>
							<div class="right-controls">
								<div class="btn-group filter-actions">
									<button class="btn btn-default btn-sm filter-button" title="Filters">
										<svg class="es-icon es-line icon-sm"><use href="#es-line-filter"></use></svg>
										<span class="button-label">Filters</span>
									</button>
									<button class="btn btn-default btn-sm filter-x-button" title="Clear filters">
										<svg class="es-icon es-line icon-sm"><use href="#es-small-close"></use></svg>
									</button>
								</div>

								<a id="new-appointment-btn" href="/app/appointments/new" class="btn btn-sm btn-primary1 mr-2">
									<i class="fa fa-plus me-1"></i> New Appointment
								</a>

								<div class="dropdown d-none" id="apt-actions-dropdown">
									<button class="btn btn-secondary1 dropdown-toggle btn-sm" type="button"
									        data-bs-toggle="dropdown" aria-expanded="false">
										Actions
									</button>
									<ul class="dropdown-menu">
										<li><a class="dropdown-item" href="#" data-apt-action="set_open">Set as Open</a></li>
										<li><a class="dropdown-item" href="#" data-apt-action="set_closed">Set as Closed</a></li>
										<li><a class="dropdown-item" href="#" data-apt-action="set_unverified">Set as Unverified</a></li>
										<li><hr class="dropdown-divider"></li>
										<li><a class="dropdown-item" href="#" data-apt-action="assign_to">Assign To</a></li>
										<li><a class="dropdown-item" href="#" data-apt-action="edit">Edit</a></li>
										<li><a class="dropdown-item" href="#" data-apt-action="print">Print</a></li>
										<li><hr class="dropdown-divider"></li>
										<li><a class="dropdown-item text-danger" href="#" data-apt-action="delete">Delete</a></li>
									</ul>
								</div>
							</div>
						</div>
					</div>

					<div class="table-container mt-2">
						<table class="appointments-table">
							<thead>
								<tr>
									<th>
										<input id="selectAllAppointments" type="checkbox" />
									</th>
									<th title="ID">ID</th>
									<th title="Name">Name</th>
									<th title="Status">Status</th>
									<th title="start DateTime">Start DateTime</th>
									<th title="end DateTime">End DateTime</th>
									<th title="scheduled Time">Scheduled Time</th>
									<th class="text-center" id="apt-count-header" title="0 of 0">
										<span id="apt-visible-count">0</span> of <span id="apt-total-count">0</span>
									</th>
								</tr>
							</thead>
							<tbody></tbody>
						</table>
					</div>

					<div class="d-flex justify-content-between align-items-center mt-2">
						<div class="list-paging-area d-flex justify-content-between align-items-center w-100">
							<div class="p-2">
								<div class="btn-group">
									<button type="button" class="btn btn-default1 btn-light btn-sm apt-btn-paging" data-value="20">20</button>
									<button type="button" class="btn btn-default1 btn-light btn-sm apt-btn-paging" data-value="100">100</button>
									<button type="button" class="btn btn-default1 btn-light btn-sm apt-btn-paging" data-value="500">500</button>
									<button type="button" class="btn btn-default1 btn-light btn-sm apt-btn-paging" data-value="1500">1500</button>
								</div>
							</div>
							<div class="p-2">
								<button class="btn btn-default1 btn-light apt-btn-more btn-sm">Load More</button>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- ==================== DETAILS VIEW ==================== -->
		<div class="appointment-details-view d-none">
			<div class="row">
				<div class="col-12">
					<div class="d-flex align-items-center">
						<div class="flex-grow-1">
							<h3 class="fs-xl fw-bold m-0">Appointment Details</h3>
						</div>
						<div class="text-end">
							<ol class="breadcrumb m-0 py-0" style="background-color: transparent;">
								<li class="breadcrumb-item"><a href="javascript: void(0);">Activity</a></li>
								<li class="breadcrumb-item"><a href="/app/appointments">Appointments</a></li>
							</ol>
						</div>
					</div>
				</div>
			</div>
			<div class="row mb-2">
				<div class="col-12">
					<div class="appointment-meta">
						<div class="appointment-title">
							<span id="apt-detail-name" class="appointment-id"></span>
							<span class="separator" style="white-space:nowrap;">—</span>
							<span id="apt-detail-subject" class="appointment-subject"></span>
						</div>

						<div class="d-flex align-items-center justify-content-between gap-2">
							<div id="apt-detail-status" class="btn btn-default2 text-white rounded"></div>
							<div id="edit-apt-details-btn" class="btn btn-default2 btn-light text-primary contact-info-action-btn d-flex align-items-center">
								<i class="fa fa-pencil me-1"></i> Edit
							</div>
							<div class="dropdown" id="apt-details-actions-dropdown">
								<button class="btn btn-default2 btn-navblue btn-sm dropdown-toggle"
										type="button" data-bs-toggle="dropdown">
									Actions
								</button>
								<ul class="dropdown-menu dropdown-menu-end">
									<li><a class="dropdown-item" href="#" data-apt-action="set_open">Set as Open</a></li>
									<li><a class="dropdown-item" href="#" data-apt-action="set_closed">Set as Closed</a></li>
									<li><a class="dropdown-item" href="#" data-apt-action="set_unverified">Set as Unverified</a></li>
									<li><hr class="dropdown-divider"></li>
									<li><a class="dropdown-item text-danger" href="#" data-apt-action="delete">Delete</a></li>
								</ul>
							</div>
						</div>
					</div>
				</div>
			</div>

			<div class="row mb-2">
				<div class="col-12">
					<div id="apt-details-container"></div>
				</div>
			</div>
		</div>

		<!-- ==================== NEW APPOINTMENT FORM ==================== -->
		<div class="new-appointments d-none">
			<div class="row">
				<div class="col-12">
					<div class="page-title-head d-flex align-items-center">
						<div class="flex-grow-1">
							<h3 class="fs-xl fw-bold m-0">New Appointment</h3>
						</div>
						<div class="text-end">
							<ol class="breadcrumb m-0 py-0" style="background-color: transparent;">
								<li class="breadcrumb-item"><a href="javascript: void(0);">Activity</a></li>
								<li class="breadcrumb-item"><a href="/app/appointments">Appointments</a></li>
							</ol>
						</div>
					</div>
				</div>
			</div>

			<div class="row">
				<div class="col-lg-12 col-12">
					<div class="rounded p-0 appointment-form-container" style="background-color: transparent;">
						<form id="new-appointment-form" autocomplete="off">
							<div class="new-apt-wrap">
								<div class="new-apt-wizard-bar">
									<button type="button" class="new-apt-wizard-step is-active" data-step="1">
										<div class="new-apt-wizard-circle">1</div>
										<div class="new-apt-wizard-label">Customer</div>
									</button>
									<div class="new-apt-wizard-connector"></div>
									<button type="button" class="new-apt-wizard-step" data-step="2">
										<div class="new-apt-wizard-circle">2</div>
										<div class="new-apt-wizard-label">Schedule</div>
									</button>
									<div class="new-apt-wizard-connector"></div>
									<button type="button" class="new-apt-wizard-step" data-step="3">
										<div class="new-apt-wizard-circle">3</div>
										<div class="new-apt-wizard-label">Participants &amp; Details</div>
									</button>
								</div>

								<div class="new-apt-wizard-panel" data-panel="1">
									<div class="card mb-3 border new-apt-card">
										<div class="card-body">
											<div class="new-apt-row two-col">
												<div class="new-apt-field" id="appointment-with-field"></div>
												<div class="new-apt-field" id="party-field"></div>
											</div>
											<div class="new-apt-row two-col">
												<div class="new-apt-field" id="customer-name-field"></div>
												<div class="new-apt-field" id="customer-phone-field"></div>
											</div>
											<div class="new-apt-row two-col">
												<div class="new-apt-field" id="customer-email-field"></div>
												<div class="new-apt-field" id="customer-skype-field"></div>
											</div>
										</div>
									</div>
								</div>

								<div class="new-apt-wizard-panel d-none" data-panel="2">
									<div class="card mb-3 border new-apt-card">
										<div class="card-body">
											<div class="new-apt-row two-col">
												<div class="new-apt-field" id="start-date-field"></div>
												<div class="new-apt-field" id="end-date-field"></div>
											</div>
											<div class="new-apt-row two-col">
												<div class="new-apt-field" id="start-time-field"></div>
												<div class="new-apt-field" id="end-time-field"></div>
											</div>
											<div class="new-apt-row two-col">
												<div class="new-apt-field" id="scheduled-time-field"></div>
												<div class="new-apt-field" id="status-field"></div>
											</div>
										</div>
									</div>
								</div>

								<div class="new-apt-wizard-panel d-none" data-panel="3">
									<div class="card mb-3 border new-apt-card">
										<div class="card-body">
											<div class="new-apt-row one-col">
												<div class="new-apt-field" id="participants-field"></div>
											</div>
										</div>
									</div>
									<div class="card mb-3 border new-apt-card">
										<div class="card-body">
											<div class="new-apt-row one-col">
												<div class="new-apt-field" id="customer-details-field"></div>
											</div>
										</div>
									</div>
								</div>

								<div class="new-apt-wizard-footer">
									<button type="button" id="new-apt-cancel" class="btn btn-default btn-sm">Cancel</button>
									<div class="new-apt-wizard-nav">
										<button type="button" id="new-apt-back" class="btn btn-default btn-sm d-none">&#8592; Back</button>
										<button type="button" id="new-apt-next" class="btn btn-primary1 btn-sm">Next</button>
										<button type="button" id="save-appointment-btn" class="btn btn-primary btn-sm rounded d-none">Save</button>
									</div>
								</div>
							</div>
						</form>
					</div>
				</div>
		    </div>
		</div>

		<!-- Footer -->
		<footer class="footer">
			<div class="container-fluid">
				<div class="row">
					<div class="col-12 text-center">
						©<span class="fw-semibold footer-text">64 Network Security Pvt Ltd</span> 
					</div>
				</div>
			</div>
		</footer>

	</div>
	`
}