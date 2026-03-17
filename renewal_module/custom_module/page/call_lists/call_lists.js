frappe.pages['call-lists'].on_page_load = function (wrapper) {
	localStorage.removeItem('call_list_page_length');
	new calllistspage(wrapper);
};

frappe.pages['call-lists'].on_page_show = function (wrapper) {
	console.log("🔄 call_lists page showing");
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
			if (!frappe.call_lists_page || frappe.call_lists_page.wrapper !== pageWrapper) {
				frappe.call_lists_page = new calllistspage(pageWrapper);
			}
			frappe.call_lists_page.render();
		});
	});
};

class calllistspage {
	constructor(wrapper) {
		this.wrapper = wrapper;

		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: '',
			single_column: true
		});
		const savedPageLength = localStorage.getItem('call_list_page_length');
		this.page_length = savedPageLength ? parseInt(savedPageLength, 10) : 20;
		this.all_call_lists = [];
		this.total_records = 0;
		this.visible_count = 0;
		this.selected_call_lists = new Set();
		this._permission_cache = null;
		this._cl_enabled_users_cache = null;
		this._cl_panel_task_assign_control = null;
		this._cl_panel_apt_participants_control = null;
	}

	render() {
		const waitForContent = () => {
			const $content = $("#support-page-content");
			if (!$content.length) {
				setTimeout(waitForContent, 50);
				return;
			}
			$content.empty().append(frappe.call_lists_page_template.body);
			this.handleRoute();
		};
		waitForContent();
	}

	handleRoute() {
		const route = frappe.get_route();
		console.log("handleRoute:", route);
		// call_lists
		if (route.length === 1) {
			return this.show_list();
		}
		// call-lists/new-call_lists
		if (route.length === 2 && route[1] === "new-call_lists") {
			return this.show_new();
		}
		// call-lists/<call_list_id>
		if (route.length === 2) {
			const call_list_id = route[1];
			return this.show_details(call_list_id);
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
		$(".call_list-list-view").removeClass("d-none");
		$(".call_list-details-view").addClass("d-none");
		$(".new-call_lists").addClass("d-none");
		setTimeout(async () => {
			try {
				this.setPageTitle("Call Lists");
				this.setActiveSidebar();
				this.bindPaginationEvents();
				this.bindFilterEvents();
				this.bindRowSelectionHandler();
				this.bindActionDropdownHandler();
				this.applyRoleBasedActionVisibility();
				// Restore filters from URL / localStorage, then fetch
				this.applyUrlFilters();
			} catch (err) {
				console.error("callListsPage.show_list error:", err);
			}
		}, 200);
	}

	async fetch_list_data({ reset = false } = {}) {
		if (this._fetch_in_progress) return;
		this._fetch_in_progress = true;

		try {
			if (reset) {
				this.all_call_lists = [];
				this.visible_count = 0;
			}

			// Read filter values from instance vars (reliably set by filter events + applyUrlFilters)
			const status = this.active_status || "";
			const id = this.active_id || "";
			const advFiltersJson = (this.saved_filters && this.saved_filters.length > 0)
				? JSON.stringify(this.saved_filters)
				: "";

			const r = await frappe.call({
				method: "renewal_module.custom_module.page.call_lists.call_lists.get_list_data",
				args: {
					start: reset ? 0 : (this.all_call_lists ? this.all_call_lists.length : 0),
					page_length: this.page_length,
					status: status,
					id: id,
					filters: advFiltersJson
				}
			});
			console.log("response:", r.message);

			if (!r || !r.message) {
				if (reset) { this.all_call_lists = []; this.visible_count = 0; this.total_records = 0; }
				this.render_rows();
				return;
			}

			const { data = [], total = 0 } = r.message || {};
			this.total_records = parseInt(total, 10) || 0;

			if (reset) {
				this.all_call_lists = Array.isArray(data) ? data.slice() : [];
			} else if (Array.isArray(data) && data.length > 0) {
				this.all_call_lists = [...(this.all_call_lists || []), ...data];
			}

			this.visible_count = Math.min(this.all_call_lists.length, this.total_records);

			const wrapper = this.page.wrapper[0] || this.page.wrapper;
			const visibleEl = wrapper.querySelector("#call-list-visible-count");
			const totalEl = wrapper.querySelector("#call-list-total-count");
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
		const tbody = wrapper.querySelector(".call_lists-table tbody");
		if (!tbody) return;
		tbody.innerHTML = "";

		const data = this.all_call_lists || [];

		if (!Array.isArray(data) || data.length === 0) {
			tbody.insertAdjacentHTML("beforeend", `
				<tr><td colspan="7" class="text-center text-muted py-4">No call_lists found.</td></tr>
			`);
			const loadMoreBtn = wrapper.querySelector(".call-list-btn-more");
			if (loadMoreBtn) loadMoreBtn.style.display = "none";
			return;
		}

		const me = this;
		data.forEach(callList => {
			const tr = document.createElement("tr");
			tr.innerHTML = `
				<td class="checkbox-cell">
					<input class="form-check-input form-check-input-light fs-14 product-item-check" type="checkbox">
				</td>
				<td>
					<a href="/app/call-lists/${callList.name}" class="call-list-id-link link-reset call-list-link"
					   data-call-list-name="${callList.name}" title="${callList.name}">${callList.name}</a>
				</td>
				<td class="ellipsis" title="${escapeHtml(callList.name1)}">${escapeHtml(callList.name1)}</td>
				<td title="${escapeHtml(callList.subject || '')}">${escapeHtml(callList.subject || '')}</td>
				<td>
					<span class="pill ${getStatusPillClass(callList.status)}" title="${escapeHtml(callList.status)}">${escapeHtml(callList.status)}</span>
				</td>
				<td class="ellipsis" title="${escapeHtml(callList.start_date)} ${escapeHtml(callList.start_timing)}">${formatCustomDate(callList.start_date)} ${escapeHtml(callList.start_timing)}</td>
				<td class="ellipsis" title="${escapeHtml(callList.end_date)} ${escapeHtml(callList.end_timing)}">${formatCustomDate(callList.end_date)} ${escapeHtml(callList.end_timing)}</td>
				<td>
					<div class="d-flex align-items-center justify-content-center gap-1 call-list-link"
					     data-call-list-name="${callList.name}" style="cursor:pointer;">
						<span title="${escapeHtml(callList.modified || '')}">${formatRelativeDate(callList.modified)}</span>
						<span class="d-flex align-items-center gap-1 ml-1" title="${callList.comment_count || 0}">
								<i class="fa fa-comment fs-lg"></i>
								${callList.comment_count || 0}
							</span>
					</div>
				</td>
			`;
			tbody.appendChild(tr);

			// Restore checkbox if previously selected
			const callListCheckbox = tr.querySelector('input[type="checkbox"]');
			if (this.selected_call_lists.has(callList.name)) {
				callListCheckbox.checked = true;
			}
		});

		// Load More button visibility
		const loadMoreBtn = wrapper.querySelector(".call-list-btn-more");
		if (loadMoreBtn) {
			loadMoreBtn.style.display = (this.visible_count >= (this.total_records || 0)) ? "none" : "inline-block";
		}

		// Bind row click for navigation (stop propagation on checkbox click)
		$(wrapper).off("click", ".call-list-link").on("click", ".call-list-link", function (e) {
			e.preventDefault();
			const callListName = $(this).data("call-list-name");
			if (!callListName) return;
			frappe.set_route("call-lists", callListName);
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
				case "Held": return "call-list-pill-held";
				case "Scheduled": return "call-list-pill-scheduled";
				case "Cancelled": return "call-list-pill-cancelled";
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
			const table = wrapper.querySelector(".call_lists-table");
			const newCallListBtn = wrapper.querySelector("#new-call_list-btn");
			const actionsDropdownEl = wrapper.querySelector("#call-list-actions-dropdown");

			if (table) {
				const all = table.querySelectorAll('tbody input[type="checkbox"]').length;
				const checked = table.querySelectorAll('tbody input[type="checkbox"]:checked').length;
				const selectAll = table.querySelector('#selectAllCallLists');
				if (selectAll) selectAll.checked = (all > 0 && all === checked);
				// update the action/new-call_list visibility
				this.updateActionBarState(table, newCallListBtn, actionsDropdownEl);
			}
		}
	}

	// ---- Exact call_list.js row selection pattern ----
	bindRowSelectionHandler() {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const table = wrapper.querySelector(".call_lists-table");
		const newCallListBtn = wrapper.querySelector("#new-call_list-btn");
		const actionsDropdown = wrapper.querySelector("#call-list-actions-dropdown");

		if (!table || !newCallListBtn || !actionsDropdown) return;

		const selectAllCheckbox = table.querySelector("#selectAllCallLists");

		// Select-all checkbox
		if (selectAllCheckbox) {
			selectAllCheckbox.addEventListener("change", (e) => {
				const allRowCheckboxes = table.querySelectorAll('tbody input[type="checkbox"]');
				allRowCheckboxes.forEach(cb => {
					cb.checked = e.target.checked;
					const row = cb.closest("tr");
					const callListName = row.querySelector(".call-list-id-link")?.dataset.callListName;
					if (callListName) {
						if (e.target.checked) {
							this.selected_call_lists.add(callListName);
						} else {
							this.selected_call_lists.delete(callListName);
						}
					}
				});
				this.updateActionBarState(table, newCallListBtn, actionsDropdown);
			});
		}

		// Individual row checkbox changes
		table.addEventListener("change", (e) => {
			if (e.target.matches('tbody input[type="checkbox"]')) {
				const row = e.target.closest("tr");
				const callListName = row.querySelector(".call-list-id-link")?.dataset.callListName;
				if (callListName) {
					if (e.target.checked) {
						this.selected_call_lists.add(callListName);
					} else {
						this.selected_call_lists.delete(callListName);
					}
				}
				// Sync select-all state
				if (selectAllCheckbox) {
					const all = table.querySelectorAll('tbody input[type="checkbox"]').length;
					const checked = table.querySelectorAll('tbody input[type="checkbox"]:checked').length;
					selectAllCheckbox.checked = (all === checked);
				}
				this.updateActionBarState(table, newCallListBtn, actionsDropdown);
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
		const actionItems = dropdownEl.querySelectorAll(".dropdown-item[data-call-list-action]");
		for (const item of actionItems) {
			if (item.style.display !== "none") return true;
		}
		return false;
	}

	bindPaginationEvents() {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		let pageButtons = wrapper.querySelectorAll(".call-list-btn-paging");

		pageButtons.forEach(btn => btn.replaceWith(btn.cloneNode(true)));
		pageButtons = wrapper.querySelectorAll(".call-list-btn-paging");

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
				localStorage.setItem('call_list_page_length', this.page_length);
				await this.fetch_list_data({ reset: true });
			});
		});

		// Set default active button
		const defaultBtn = wrapper.querySelector(`.call-list-btn-paging[data-value="${this.page_length}"]`);
		if (defaultBtn && !wrapper.querySelector(".active-pagination")) {
			defaultBtn.classList.add("active-pagination");
			defaultBtn.style.backgroundColor = "#6C5CE7";
			defaultBtn.style.color = "white";
		}

		// Load More
		const loadMoreBtn = wrapper.querySelector(".call-list-btn-more");
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
		const statusEl = wrapper.querySelector('[data-call-list-filter="status"]');
		const idEl = wrapper.querySelector('[data-call-list-filter="ID"]');

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
			localStorage.setItem("call_list_last_filters", qs);
		} else {
			localStorage.removeItem("call_list_last_filters");
		}
	}


	applyUrlFilters() {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;

		// If URL has no params but localStorage has saved state, restore to URL first
		const savedQs = localStorage.getItem("call_list_last_filters") || "";
		if (!window.location.search && savedQs) {
			window.history.replaceState({}, "", window.location.pathname + savedQs);
		}

		// Read URL params
		const params = new URLSearchParams(window.location.search);
		const status = params.get("status") || "";
		const id = params.get("id") || "";
		const filters_encoded = params.get("filters") || "";

		// Restore basic filter UI controls
		const statusEl = wrapper.querySelector('[data-call-list-filter="status"]');
		const idEl = wrapper.querySelector('[data-call-list-filter="ID"]');
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

		const statusFilter = wrapper.querySelector('[data-call-list-filter="status"]');
		const idFilter = wrapper.querySelector('[data-call-list-filter="ID"]');
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
				if (qs) localStorage.setItem("call_list_last_filters", qs);
				else localStorage.removeItem("call_list_last_filters");
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
				localStorage.removeItem("call_list_last_filters");
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

			// Build popover content with FilterGroup for Call List doctype
			let popover_content = $('<div class="filter-area">');
			await frappe.model.with_doctype("Call List");

			me._filter_group = new frappe.ui.FilterGroup({
				parent: popover_content,
				doctype: "Call List",
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
					me._filter_group.add_filter("Call List", "name", "=", "", false);
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
				me._filter_group.add_filter("Call List", "name", "=", "", false)
			);

			footer.find('.clear-filters').on("click", () => {
				if (me._filter_group) me._filter_group.clear_filters();
				me.saved_filters = [];
				me._suspend_on_change = false;
				me.fetch_list_data({ reset: true });
				update_filter_button_count($btn, 0);
				updateUrlWithFilters([]);
				closePopover($btn);
			});

			footer.find('.apply-filters').on("click", () => {
				if (me._filter_group) {
					me.saved_filters = me._filter_group.get_filters();
					me._suspend_on_change = false;
					me.fetch_list_data({ reset: true });
					update_filter_button_count($btn, me.saved_filters.length);
					updateUrlWithFilters(me.saved_filters);
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
		const actionsDropdown = wrapper.querySelector("#call-list-actions-dropdown");

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
			const action = item.dataset.callListAction || item.dataset.action;
			const table = wrapper.querySelector(".call_lists-table");
			const checkedBoxes = table.querySelectorAll('tbody input[type="checkbox"]:checked');

			if (!checkedBoxes.length) {
				frappe.msgprint(__("Please select at least one Call List"));
				return;
			}

			const callListNames = Array.from(checkedBoxes)
				.map(cb => cb.closest("tr")?.querySelector("a.call-list-id-link")?.dataset.callListName)
				.filter(Boolean);

			if (!callListNames.length) {
				frappe.msgprint(__("No valid Call List IDs found."));
				return;
			}

			const doctype = "Call List";
			const me = this;

			if (action === "set_held" || action === "set_scheduled" || action === "set_cancelled") {
				let status = action === "set_held" ? "Held" : (action === "set_scheduled" ? "Scheduled" : "Cancelled");
				me.bulkUpdate(callListNames, { fieldname: "status", value: status });
			}
			else if (action === "delete") {
				frappe.confirm(__("Delete {0} selected Call Lists?", [callListNames.length]), () => {
					Promise.all(callListNames.map(name =>
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
				let d = new frappe.ui.form.AssignToDialog({ doctype, docname: callListNames[0] });

				d.dialog.set_primary_action(__("Assign"), () => {
					const values = d.dialog.get_values();
					if (!values) return;
					d.dialog.hide();

					const calls = callListNames.map(name =>
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
						primary_action_label: __("Update {0} records", [callListNames.length]),
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
							me.bulkUpdate(callListNames, { fieldname, value });
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
						primary_action_label: __("Open {0} Print Views", [callListNames.length]),
						primary_action(values) {
							d.hide();
							callListNames.forEach(name => {
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
		const newCallListBtn = wrapper.querySelector("#new-call_list-btn");
		const actionsDropdown = wrapper.querySelector("#call-list-actions-dropdown");

		if (newCallListBtn && actionsDropdown) {
			newCallListBtn.classList.remove("d-none");
			actionsDropdown.classList.add("d-none");
		}

		this.selected_call_lists.clear();

		const table = wrapper.querySelector(".call_lists-table");
		if (table) {
			const selectAllCheckbox = table.querySelector('#selectAllCallLists');
			if (selectAllCheckbox) selectAllCheckbox.checked = false;

			const checkboxes = table.querySelectorAll('tbody input[type="checkbox"]');
			checkboxes.forEach(cb => (cb.checked = false));
		}
	}

	bulkUpdate(callListNames, updates) {
		return new Promise((resolve, reject) => {
			if (!callListNames.length) return resolve();

			frappe.dom.freeze(__("Updating..."));

			let promises = callListNames.map(name =>
				frappe.call({
					method: "frappe.client.set_value",
					args: {
						doctype: "Call List",
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

	getCallListPermissions(forceRefresh = false) {
		if (!forceRefresh && this._permission_cache) {
			return Promise.resolve(this._permission_cache);
		}

		return new Promise((resolve) => {
			frappe.call({
				method: "renewal_module.custom_module.page.call_lists.call_lists.get_call_list_permissions",
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
				child.querySelectorAll(".dropdown-item[data-call-list-action]")
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

		this.getCallListPermissions().then((perm) => {
			const permissionMap = {
				"set_held": perm.write,
				"set_scheduled": perm.write,
				"set_cancelled": perm.write,
				"edit": perm.write,
				"assign_to": perm.write,
				"print": perm.print,
				"delete": perm.delete,
				"export": perm.export
			};

			const rootSelector = view === "list"
				? "#call-list-actions-dropdown"
				: view === "details"
					? "#call-list-details-actions-dropdown"
					: "#call-list-actions-dropdown, #call-list-details-actions-dropdown";

			const dropdownRoots = wrapper.querySelectorAll(rootSelector);
			dropdownRoots.forEach((root) => {
				Object.keys(permissionMap).forEach((action) => {
					const isAllowed = permissionMap[action];
					const items = root.querySelectorAll(`.dropdown-item[data-call-list-action="${action}"]`);
					items.forEach((item) => {
						item.style.display = isAllowed ? "" : "none";
					});
				});

				const menu = root.querySelector(".dropdown-menu");
				this.cleanupDropdownDividers(menu);
				if (!this.hasVisibleActionItems(root)) {
					root.classList.add("d-none");
				} else if (root.id === "call-list-details-actions-dropdown") {
					root.classList.remove("d-none");
				}
			});

			if (view === "details" || view === "all") {
				const editButtons = wrapper.querySelectorAll("#edit-call-list-details-btn, .edit-inline-btn");
				editButtons.forEach((btn) => {
					btn.style.display = perm.write ? "" : "none";
				});
			}

			if (view === "list" || view === "all") {
				const table = wrapper.querySelector(".call_lists-table");
				const newCallListBtn = wrapper.querySelector("#new-call_list-btn");
				const actionsDropdown = wrapper.querySelector("#call-list-actions-dropdown");
				if (table && newCallListBtn && actionsDropdown) {
					this.updateActionBarState(table, newCallListBtn, actionsDropdown);
				}
			}
		});
	}

	// ===================== DETAILS VIEW =====================
	show_details(call_list_id) {
		$(".call_list-list-view").addClass("d-none");
		$(".call_list-details-view").removeClass("d-none");
		$(".new-call_lists").addClass("d-none");
		this.setPageTitle(`call-lists/${call_list_id}`);
		this.setActiveSidebar();
		this.applyRoleBasedActionVisibility("details");
		this.load_call_list_details(call_list_id);
	}

	load_call_list_details(call_list_id) {
		frappe.call({
			method: "renewal_module.custom_module.page.call_lists.call_lists.get_call_list_details",
			args: {
				call_list_name: call_list_id
			},
			callback: (r) => {
				if (!r || !r.message) {
					frappe.show_alert({ message: __("Call List not found."), indicator: "red" });
					return;
				}
				const callList = r.message;
				this.render_details(callList);
				this.bind_details_events(callList);
				this.applyRoleBasedActionVisibility("details");
			}
		});
	}

	render_details(callList) {
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

		function fmtDateOnly(dateStr) {
			if (!dateStr) return "";
			const parts = dateStr.split('-');
			if (parts.length === 3) {
				return `${parts[2]}-${parts[1]}-${parts[0].slice(2)}`;
			}
			return dateStr;
		}

		function getStatusColor(status) {
			switch (status) {
				case "Held": return "#3b82f6";
				case "Scheduled": return "#10b981";
				case "Cancelled": return "#f59e0b";
				default: return "#6c757d";
			}
		}

		const detailsContainer = document.getElementById("call-list-details-container");
		if (!detailsContainer) return;

		// Update header
		const nameEl = document.getElementById("call-list-detail-name");
		const customerEl = document.getElementById("call-list-detail-customer");
		const statusBadge = document.getElementById("call-list-detail-status");
		const subjectEl = document.getElementById("call-list-detail-subject");

		if (nameEl) nameEl.textContent = callList.name;
		if (customerEl) customerEl.textContent = callList.subject || "";
		if (statusBadge) {
			statusBadge.textContent = callList.status || "";
			statusBadge.style.backgroundColor = getStatusColor(callList.status);
		}
		if (subjectEl) subjectEl.textContent = callList.subject || "";


		detailsContainer.innerHTML = `
			<div class="row g-3 align-items-stretch call-list-details-top-row">
				<div class="col-lg-8 col-md-12 mb-2">
					<div class="corporate-card p-3 mb-3 cl-section-card">
						<div class="cl-section-header mb-3 pb-2 border-bottom">
							<h6 class="mb-0 cl-section-title"><i class="fa fa-phone me-1"></i> Call Context</h6>
						</div>
						<div class="cl-grid-2">
							<div class="cl-info-item">
								<h6 class="text-uppercase text-muted1">Contact Name</h6>
								<span title="${esc(callList.name1 || '')}">${esc(callList.name1 || '—')}</span>
							</div>
							<div class="cl-info-item">
								<h6 class="text-uppercase text-muted1">Subject</h6>
								<span title="${esc(callList.subject || '')}">${esc(callList.subject || '—')}</span>
							</div>
							<div class="cl-info-item">
								<h6 class="text-uppercase text-muted1">Direction</h6>
								<span title="${esc(callList.direction || '')}">${esc(callList.direction || '—')}</span>
							</div>
							<div class="cl-info-item">
								<h6 class="text-uppercase text-muted1">Related To</h6>
								<span title="${esc(callList.related_to || '')}">${esc(callList.related_to || '—')}</span>
							</div>
						</div>
					</div>

					<div class="corporate-card p-3 mb-3 cl-section-card">
						<div class="d-flex align-items-center justify-content-between mb-3 pb-2 border-bottom">
							<h6 class="mb-0 cl-section-title"><i class="fa fa-calendar me-1"></i> Schedule & Status</h6>
							
						</div>
						<div class="cl-grid-3">
							<div class="cl-info-item">
								<h6 class="text-uppercase text-muted1">Start</h6>
								<span title="${esc(callList.start_date || '')} ${esc(callList.start_timing || '')}">${callList.start_date ? esc(fmtDateOnly(callList.start_date)) : '—'} ${esc(callList.start_timing || '')}</span>
							</div>
							<div class="cl-info-item">
								<h6 class="text-uppercase text-muted1">End</h6>
								<span title="${esc(callList.end_date || '')} ${esc(callList.end_timing || '')}">${callList.end_date ? esc(fmtDateOnly(callList.end_date)) : '—'} ${esc(callList.end_timing || '')}</span>
							</div>
							<div class="cl-info-item">
								<h6 class="text-uppercase text-muted1">Status</h6>
								<span title="${esc(callList.status || '')}">${esc(callList.status || '—')}</span>
							</div>
							
						</div>
					</div>

					<div class="corporate-card p-3 mb-3 cl-section-card">
						<div class="cl-section-header mb-2">
							<h6 class="mb-0 cl-section-title"><i class="fa fa-users me-1"></i> Ownership</h6>
						</div>
						<div class="cl-grid-2">
							<div class="cl-info-item">
								<h6 class="text-uppercase text-muted1">Sales Person</h6>
								<span title="${esc(callList.custom_sales_person || '')}">${esc(callList.custom_sales_person || '—')}</span>
							</div>
							<div class="cl-info-item">
								<h6 class="text-uppercase text-muted1">Owner</h6>
								<span title="${esc(callList.owner_full_name || callList.owner || '')}">${esc(callList.owner_full_name || callList.owner || '—')}</span>
							</div>
						</div>
					</div>
				</div>

				<div class="col-lg-4 col-md-12 d-flex gap-3 mb-2">
					<aside class="call-list-detail-panel flex-grow-1">
						<div class="panel__tabs">
							<button class="ptab is-active" data-type="Notes" title="Notes"><span class="ptab__icon">📝</span><span class="ptab__label">Notes</span></button>
							<button class="ptab" data-type="Appointments" title="Appointments"><span class="ptab__icon">📅</span><span class="ptab__label">Appointments</span></button>
							<button class="ptab" data-type="Tasks" title="Tasks"><span class="ptab__icon">✅</span><span class="ptab__label">Tasks</span></button>
						</div>
						<div class="panel__header">
							<div class="panel__subtitle" id="call-list-panel-subtitle">Notes</div>
							<button class="btn-panel-create" id="call-list-btn-panel-add"><i class="fa fa-plus"></i> Add</button>
						</div>
						<div id="call-list-panel-info-card" class="panel-person-card d-none">
							<div class="panel-person-head">
								<div class="panel-person-head-left">
									<div class="panel-person-title-wrap">
										<div class="panel-person-name" id="call-list-panel-info-title">Details</div>
									</div>
								</div>
								<button type="button" class="panel-person-close" id="call-list-panel-info-close">Close</button>
							</div>
							<div id="call-list-panel-info-content"></div>
						</div>
						<div class="panel__cards" id="call-list-panel-cards-section">
							<!-- Notes section (default visible) -->
							<div id="call-list-activity-notes-section" class="call-list-panel-section">
								<textarea id="quick-note-text" class="panel__input form-control mb-2" rows="2" placeholder="Write a quick note..."></textarea>
								<div class="d-flex justify-content-end mb-2">
									<button id="save-quick-note-btn" class="btn btn-sm btn-primary">Save Note</button>
								</div>
								<div id="main-notes-list">
									<div class="text-center p-3 text-muted small">Loading notes...</div>
								</div>
							</div>
							<!-- Tasks section -->
							<div id="call-list-activity-tasks-section" class="call-list-panel-section d-none">
								<div class="mb-2" role="group" id="call-list-tasks-card-tabs" aria-label="Task filters">
									<button type="button" class="btn btn-sm task-tab active" data-task-filter="all">All</button>
									<button type="button" class="btn btn-sm task-tab" data-task-filter="pending">Pending</button>
									<button type="button" class="btn btn-sm task-tab" data-task-filter="completed">Completed</button>
								</div>
								<div id="activity-tasks-container"></div>
								<div id="tasks-card-load-more" class="text-center mt-2" style="cursor:pointer; display:none;">Load More</div>
							</div>
							<!-- Appointments section -->
							<div id="call-list-activity-appointments-section" class="call-list-panel-section d-none">
								<div class="mb-2" role="group" id="call-list-appointments-card-tabs" aria-label="Appointment filters">
									<button type="button" class="btn btn-sm appointment-tab active" data-appointment-filter="all">All</button>
									<button type="button" class="btn btn-sm appointment-tab" data-appointment-filter="open">Open</button>
									<button type="button" class="btn btn-sm appointment-tab" data-appointment-filter="unverified">Unverified</button>
									<button type="button" class="btn btn-sm appointment-tab" data-appointment-filter="closed">Closed</button>
								</div>
								<div id="activity-appointments-container"></div>
								<div id="appointments-card-load-more" class="text-center mt-2" style="cursor:pointer; display:none;">Load More</div>
							</div>
						</div>
						<div id="call-list-panel-form-section" class="panel__form d-none">
							<div class="panel__form-head d-flex justify-content-between align-items-center mb-2">
								<div class="panel__form-title" id="call-list-panel-form-title">New Activity</div>
								<button type="button" class="btn btn-sm btn-light" id="call-list-btn-panel-close"><i class="fa fa-times"></i></button>
							</div>
							<div id="call-list-panel-form-body"></div>
							<div class="d-flex justify-content-end gap-2 mt-2">
								<button type="button" class="btn btn-sm btn-primary" id="call-list-panel-save-btn">Save</button>
							</div>
						</div>
					</aside>
				</div>

				
			</div>

			<div class="row">
				<div class="col-12 mb-2 call-list-details-top-col">
					<div class="corporate-card call-list-top-card call-list-description-card p-4 mb-2 position-relative h-100 d-flex flex-column">
						<div class="d-flex justify-content-between align-items-center mb-3 pb-2 border-bottom">
							<h6 class="mb-0 text-uppercase fw-bold text-muted fs-xs">Description</h6>
							<button type="button" class="btn btn-xs btn-light text-primary contact-info-action-btn shadow-sm rounded-pill px-3 d-flex align-items-center edit-inline-btn" data-call-list-edit="description">
								<i class="fa fa-pencil me-1"></i> Edit
							</button>
						</div>
						${callList.description ? `
							<div class="calllist-description-content">${esc(callList.description).replace(/\n/g, '<br>')}</div>`
				: `<div class="text-muted fst-italic text-center py-3" style="font-size:13px;">
								<i class="fa fa-file-text-o me-1"></i> No notes provided</div>`
			}
					</div>
				</div>
			</div>
			
			<div class="row">
				<div class="col-12">
					

					<!-- Comments Section -->
					<div class="comment-section mb-3 mt-3">
						<div class="corporate-card comment-box p-3" style="border: none !important;">
							<div class="comment-input-wrapper">
								<div class="comment-input-header mb-3 pb-2 border-bottom">
									<span class="fw-bold text-dark"><i class="fa fa-comments-o me-2"></i>Comments</span>
								</div>
								<div class="comment-input-container w-100">
									<span class="avatar avatar-medium shadow-sm d-flex align-items-center justify-content-center bg-primary text-white rounded-circle fw-bold" style="width: 40px; height: 40px;" title="">
										<div class="avatar-frame standard-image" style="background-color: var(--dark-green-avatar-bg); color: var(--dark-green-avatar-color)" title="">
											${frappe.session.user ? frappe.session.user.charAt(0).toUpperCase() : 'U'}
										</div>
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
					
					<!-- Activity Section -->
					<div class="corporate-card p-4">
						<h6 class="text-uppercase text-muted mb-2 pb-2 border-bottom activity fw-bold"><i class="fa fa-history mr-2"></i>Activity</h6>
						<div class="timeline" id="activity-timeline">
							<p class="text-muted text-center py-4 bg-light rounded">Loading activity...</p>
						</div>
					</div>
				</div>
			</div>
		`;

		// Bind edit button
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const editBtn = wrapper.querySelector('#edit-call-list-details-btn');
		if (editBtn) {
			$(editBtn).off('click').on('click', (e) => {
				e.preventDefault();
				e.stopPropagation();
				this.openCallListEditDialog(callList.name);
			});
		}

		// Bind specific inline edit buttons
		const inlineEditBtns = detailsContainer.querySelectorAll('.edit-inline-btn');
		inlineEditBtns.forEach(btn => {
			$(btn).off('click').on('click', (e) => {
				e.preventDefault();
				e.stopPropagation();
				const fieldname = $(e.currentTarget).attr('data-call-list-edit');
				this.openSpecificEditDialog(callList.name, fieldname);
			});
		});
	}

	bind_details_events(callList) {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;

		// Back button
		const backBtn = wrapper.querySelector('#call-list-back-btn');
		if (backBtn) {
			$(backBtn).off("click").on("click", function (e) {
				e.preventDefault();
				frappe.set_route("call-lists");
			});
		}

		// Initialize timeline & comments & email
		this.loadCallListActivityTimeline(callList.name);
		this.bindCallListCommentEvents(callList.name);
		this.bindCallListEmailHandler(callList.name);
		this.bindCallListPanelTabs(wrapper, callList.name);
		this.bindCallListNotesPanel(callList.name);

		$(wrapper).off("click", "#add-sales-team-member").on("click", "#add-sales-team-member", (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.openAddSalesTeamMemberDialog(callList.name);
		});

		$(wrapper).off("click", "#sales-team-list .sales-team-header").on("click", "#sales-team-list .sales-team-header", function () {
			const index = $(this).data("index");
			const $details = $(wrapper).find(`#sales-team-list .sales-team-details[data-index='${index}']`);
			const isVisible = !$details.hasClass("d-none");
			$(wrapper).find("#sales-team-list .sales-team-details").addClass("d-none");
			if (!isVisible) {
				$details.removeClass("d-none");
			}
		});

		$(wrapper).off("click", ".delete-sales-team").on("click", ".delete-sales-team", (e) => {
			e.preventDefault();
			e.stopPropagation();

			const rowname = $(e.currentTarget).attr("data-rowname");
			if (!rowname) return;

			frappe.confirm(
				__("Are you sure you want to remove this sales member?"),
				() => {
					frappe.call({
						method: "frappe.client.delete",
						args: { doctype: "Sales Team", name: rowname },
						callback: (r) => {
							if (!r.exc) {
								frappe.show_alert({ message: __("Sales member removed successfully."), indicator: "green" });
								this.load_call_list_details(callList.name);
							}
						}
					});
				}
			);
		});

		// Actions dropdown
		$(wrapper).off("click", "[data-call-list-action]").on("click", "[data-call-list-action]", (e) => {
			e.preventDefault();
			const action = $(e.currentTarget).data("call-list-action");
			if (action === "set_held") {
				this.update_status(callList.name, "Held");
			} else if (action === "set_scheduled") {
				this.update_status(callList.name, "Scheduled");
			} else if (action === "set_cancelled") {
				this.update_status(callList.name, "Cancelled");
			} else if (action === "delete") {
				frappe.confirm("Are you sure you want to delete this call_list?", () => {
					frappe.call({
						method: "frappe.client.delete",
						args: { doctype: "Call List", name: callList.name },
						callback: (r) => {
							frappe.show_alert({ message: __("Call List deleted."), indicator: "green" });
							frappe.set_route("call-lists");
						}
					});
				});
			}
		});
	}

	bindCallListPanelTabs(wrapper, callListName) {
		const $wrapper = $(wrapper);

		const updateAddBtnLabel = (tabType) => {
			const labels = {
				Notes: "New Note",
				Tasks: "New Task",
				Appointments: "New Appointment"
			};
			$wrapper.find("#call-list-btn-panel-add").html(`<i class="fa fa-plus"></i> ${labels[tabType] || "Add"}`);
		};

		const switchTab = (tabType) => {
			this.hideCallListPanelForm(wrapper);
			this._active_call_list_tab = tabType;

			$wrapper.find(".call-list-detail-panel .ptab").removeClass("is-active");
			$wrapper.find(`.call-list-detail-panel .ptab[data-type="${tabType}"]`).addClass("is-active");

			const subtitleMap = {
				Notes: "Notes",
				Tasks: "Tasks",
				Appointments: "Appointments"
			};
			$wrapper.find("#call-list-panel-subtitle").text(subtitleMap[tabType] || tabType);

			$wrapper.find(".call-list-panel-section").addClass("d-none");
			$wrapper.find(`#call-list-activity-${String(tabType).toLowerCase()}-section`).removeClass("d-none");

			if (tabType === "Notes") {
				this.loadCallListNotes(callListName, wrapper);
			} else if (tabType === "Tasks") {
				this.loadCallListTasks(callListName, wrapper);
			} else if (tabType === "Appointments") {
				this.loadCallListAppointments(callListName, wrapper);
			}

			updateAddBtnLabel(tabType);
		};

		$wrapper.off("click", ".call-list-detail-panel .ptab").on("click", ".call-list-detail-panel .ptab", function (e) {
			e.preventDefault();
			const tabType = $(this).data("type");
			switchTab(tabType);
		});

		$wrapper.off("click", "#call-list-btn-panel-add").on("click", "#call-list-btn-panel-add", async (e) => {
			e.preventDefault();
			const activeTab = this._active_call_list_tab || "Notes";
			if (activeTab === "Notes") {
				$wrapper.find("#quick-note-text").trigger("focus");
				return;
			}
			await this.showCallListPanelForm(activeTab, callListName, wrapper);
		});

		$wrapper.off("click", "#call-list-btn-panel-close").on("click", "#call-list-btn-panel-close", (e) => {
			e.preventDefault();
			this.hideCallListPanelForm(wrapper);
		});

		$wrapper.off("click", "#call-list-panel-save-btn").on("click", "#call-list-panel-save-btn", async (e) => {
			e.preventDefault();
			const $btn = $(e.currentTarget);
			$btn.prop("disabled", true).text("Saving...");
			try {
				await this.saveCallListPanelData(this._active_call_list_tab, callListName, wrapper);
			} finally {
				$btn.prop("disabled", false).text("Save");
			}
		});

		// Ensure default state is Notes on every details render.
		switchTab("Notes");

		$wrapper.off("click", ".cl-task-open").on("click", ".cl-task-open", function () {
			const name = $(this).data("name");
			if (name) {
				const url = "/app/tasks/" + name;
				window.open(url, "_blank");
			}
		});


		$wrapper.off("click", ".cl-apt-open").on("click", ".cl-apt-open", function () {
			const name = $(this).data("name");
			if (name) {
				//frappe.set_route("appointments", name);
				const url = "/app/appointments/" + name;
				window.open(url, "_blank");
			}
		});
	}

	bindCallListNotesPanel(callListName) {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const self = this;

		self.loadCallListNotes(callListName, wrapper);

		$(wrapper).off("click", "#save-quick-note-btn").on("click", "#save-quick-note-btn", function (e) {
			e.preventDefault();
			const $btn = $(this);
			const text = ($(wrapper).find("#quick-note-text").val() || "").trim();

			if (!text) {
				frappe.msgprint(__("Please enter a note"));
				return;
			}

			$btn.prop("disabled", true).text("Saving...");

			frappe.call({
				method: "renewal_module.custom_module.page.call_lists.call_lists.add_call_list_note",
				args: {
					call_list_name: callListName,
					note_text: text
				},
				callback: function (r) {
					$btn.prop("disabled", false).text("Save Note");
					if (!r.exc) {
						$(wrapper).find("#quick-note-text").val("");
						frappe.show_alert({ message: __("Note added"), indicator: "green" });
						self.loadCallListNotes(callListName, wrapper);
					}
				},
				error: function () {
					$btn.prop("disabled", false).text("Save Note");
				}
			});
		});
	}

	hideCallListPanelForm(wrapper) {
		$(wrapper).find("#call-list-panel-form-section").addClass("d-none");
		$(wrapper).find("#call-list-panel-cards-section").removeClass("d-none");
		$(wrapper).find("#call-list-btn-panel-add").show();
		$(wrapper).find(".call-list-detail-panel .panel__header").show();
		this._cl_panel_task_assign_control = null;
		this._cl_panel_apt_participants_control = null;
	}

	async showCallListPanelForm(type, callListName, wrapper) {
		$(wrapper).find("#call-list-panel-cards-section").addClass("d-none");
		$(wrapper).find("#call-list-panel-form-section").removeClass("d-none");
		$(wrapper).find("#call-list-btn-panel-add").hide();
		$(wrapper).find(".call-list-detail-panel .panel__header").hide();

		let enabledUsers = this._cl_enabled_users_cache || [];
		if (!enabledUsers.length) {
			try {
				const usersRes = await frappe.call({
					method: "renewal_module.custom_module.page.call_lists.call_lists.get_enabled_users",
					silent: true
				});
				enabledUsers = Array.isArray(usersRes?.message) ? usersRes.message : [];
			} catch (e) {
				enabledUsers = [];
			}
			this._cl_enabled_users_cache = enabledUsers;
		}

		const usersOptions = enabledUsers.map((u) => {
			const label = frappe.utils.escape_html(String(u.full_name || u.name || u.email || "User"));
			const value = frappe.utils.escape_html(String(u.email || u.name || ""));
			return `<option value="${value}">${label}</option>`;
		}).join("");

		if (type === "Tasks") {
			$(wrapper).find("#call-list-panel-form-title").text("New Task");
			$(wrapper).find("#call-list-panel-save-btn").text("Save Task");
			$(wrapper).find("#call-list-panel-form-body").html(`
				<div class="cl-form-grid">
				<div class="mb-2"><label class="form-label">Subject *</label><input type="text" id="cl-task-subject" class="form-control" /></div>
				<div class="mb-2"><label class="form-label">Assign To</label><div id="cl-task-assign-control" class="cl-multi-control"></div><select id="cl-task-assign-to" class="form-control d-none" multiple>${usersOptions}</select></div>
				<div class="row g-2">	
					<div class="col-6 mb-2"><label class="form-label">Expected End Date</label><input type="datetime-local" id="cl-task-end-date" class="form-control" /></div>
					<div class=" col-6 mb-2"><label class="form-label">Priority</label><select id="cl-task-priority" class="form-control"><option value="Low">Low</option><option value="Medium" selected>Medium</option><option value="High">High</option></select></div>
				</div>
				<div class="mb-2"><label class="form-label">Description</label><textarea id="cl-task-description" class="form-control" rows="3"></textarea></div>
				</div>
			`);

			this._cl_panel_task_assign_control = null;
			const $host = $(wrapper).find("#cl-task-assign-control");
			if ($host.length && frappe?.ui?.form?.make_control) {
				const options = (enabledUsers || []).map((u) => {
					const value = String(u?.email || u?.name || "").trim();
					const label = String(u?.full_name || u?.name || u?.email || value).trim();
					if (!value) return null;
					return { label, value, description: u?.email || value };
				}).filter(Boolean);

				$host.empty();
				this._cl_panel_task_assign_control = frappe.ui.form.make_control({
					parent: $host,
					df: {
						fieldtype: "MultiSelect",
						fieldname: "cl_task_assign_to",
						label: "",
						options,
					},
					render_input: true,
				});

				if (this._cl_panel_task_assign_control?.refresh) {
					this._cl_panel_task_assign_control.refresh();
				}
			}

			if (!this._cl_panel_task_assign_control) {
				$(wrapper).find("#cl-task-assign-to").removeClass("d-none");
			}
		} else if (type === "Appointments") {
			const nowDate = frappe.datetime.now_date ? frappe.datetime.now_date() : new Date().toISOString().slice(0, 10);
			$(wrapper).find("#call-list-panel-form-title").text("New Appointment");
			$(wrapper).find("#call-list-panel-save-btn").text("Save Appointment");
			$(wrapper).find("#call-list-panel-form-body").html(`
				<div class="cl-form-grid">
					<div class="mb-2"><label class="form-label">Appointment With</label><select id="cl-apt-with" class="form-control"><option value="Customer" selected>Customer</option><option value="Lead">Lead</option></select></div>
					<div class="mb-2"><label class="form-label">Party</label><input type="text" id="cl-apt-party" class="form-control" /></div>
					<div class="mb-2"><label class="form-label">Subject *</label><input type="text" id="cl-apt-subject" class="form-control" /></div>
					<div class="mb-2"><label class="form-label">Name *</label><input type="text" id="cl-apt-name" class="form-control" /></div>
					<div class="mb-2"><label class="form-label">Email</label><input type="email" id="cl-apt-email" class="form-control" /></div>
					<div class="mb-2"><label class="form-label">Phone Number</label><input type="text" id="cl-apt-phone" class="form-control" /></div>
					<div class="row g-2">
						<div class="col-6 mb-2"><label class="form-label">Start Date *</label><input type="date" id="cl-apt-start-date" class="form-control" value="${nowDate}" /></div>
						<div class="col-6 mb-2"><label class="form-label">Start Time</label><input type="time" id="cl-apt-start-time" class="form-control" /></div>
					</div>
					<div class="row g-2">
						<div class="col-6 mb-2"><label class="form-label">End Date</label><input type="date" id="cl-apt-end-date" class="form-control" /></div>
						<div class="col-6 mb-2"><label class="form-label">End Time</label><input type="time" id="cl-apt-end-time" class="form-control" /></div>
					</div>
					<div class="mb-2"><label class="form-label">Participants *</label><div id="cl-apt-participants-control" class="call-list-multi-control"></div><select id="cl-apt-participants" class="form-control d-none" multiple>${usersOptions}</select></div>
					<div class="row g-2">
						<div class="col-6 mb-2"><label class="form-label">Scheduled Time</label><input type="datetime-local" id="cl-apt-scheduled-time" class="form-control" /></div>
					</div>	
					<div class="mb-2"><label class="form-label">Details</label><textarea id="cl-apt-details" class="form-control" rows="3"></textarea></div>
				</div>
			`);

			this._cl_panel_apt_participants_control = null;
			const $participantsHost = $(wrapper).find("#cl-apt-participants-control");
			if ($participantsHost.length && frappe?.ui?.form?.make_control) {
				const participantOptions = (enabledUsers || []).map((u) => {
					const value = String(u?.email || u?.name || "").trim();
					const label = String(u?.full_name || u?.name || u?.email || value).trim();
					if (!value) return null;
					return { label, value, description: u?.email || value };
				}).filter(Boolean);

				$participantsHost.empty();
				this._cl_panel_apt_participants_control = frappe.ui.form.make_control({
					parent: $participantsHost,
					df: {
						fieldtype: "MultiSelect",
						fieldname: "cl_apt_participants",
						label: "",
						options: participantOptions,
					},
					render_input: true,
				});

				if (this._cl_panel_apt_participants_control?.refresh) {
					this._cl_panel_apt_participants_control.refresh();
				}
			}

			if (!this._cl_panel_apt_participants_control) {
				$(wrapper).find("#cl-apt-participants").removeClass("d-none");
			}
		}
	}

	async saveCallListPanelData(type, callListName, wrapper) {
		try {
			if (type === "Tasks") {
				const subject = ($(wrapper).find("#cl-task-subject").val() || "").trim();
				let selectedUsers = [];
				if (this._cl_panel_task_assign_control && typeof this._cl_panel_task_assign_control.get_value === "function") {
					const raw = this._cl_panel_task_assign_control.get_value();
					if (Array.isArray(raw)) {
						selectedUsers = raw.map((v) => String(v || "").trim()).filter(Boolean);
					} else {
						selectedUsers = String(raw || "").split(",").map((v) => v.trim()).filter(Boolean);
					}
				} else {
					selectedUsers = $(wrapper).find("#cl-task-assign-to").val() || [];
				}
				const expEndRaw = ($(wrapper).find("#cl-task-end-date").val() || "").trim();
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
							priority: $(wrapper).find("#cl-task-priority").val() || "Medium",
							description: $(wrapper).find("#cl-task-description").val() || "",
							exp_end_date: expEndDate,
							custom_users: (Array.isArray(selectedUsers) ? selectedUsers : [selectedUsers]).filter(Boolean).map((email) => ({ user: email })),
							reference: "Call List",
							reference_to: callListName
						}
					}
				});

				frappe.show_alert({ message: __("Task created"), indicator: "green" });
				this.loadCallListTasks(callListName, wrapper);
				this.hideCallListPanelForm(wrapper);
			} else if (type === "Appointments") {
				const customer_name = ($(wrapper).find("#cl-apt-name").val() || "").trim();
				const subject = ($(wrapper).find("#cl-apt-subject").val() || "").trim();
				const appointment_with = ($(wrapper).find("#cl-apt-with").val() || "Customer").trim();
				const party = ($(wrapper).find("#cl-apt-party").val() || "").trim();
				const start_time = ($(wrapper).find("#cl-apt-start-time").val() || "").trim();
				const end_time = ($(wrapper).find("#cl-apt-end-time").val() || "").trim();
				const scheduled_time_raw = ($(wrapper).find("#cl-apt-scheduled-time").val() || "").trim();
				let scheduled_time = scheduled_time_raw;
				if (scheduled_time.includes("T")) {
					scheduled_time = scheduled_time.replace("T", " ");
					if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(scheduled_time)) scheduled_time += ":00";
				}
				if (!customer_name) {
					frappe.msgprint(__("Please enter customer name (Name field)"));
					return;
				}

				const participantsControl = this._cl_panel_apt_participants_control;
				let participants = [];
				if (participantsControl && typeof participantsControl.get_value === "function") {
					const raw = participantsControl.get_value();
					if (Array.isArray(raw)) {
						participants = raw.map((v) => String(v || "").trim()).filter(Boolean);
					} else {
						participants = String(raw || "").split(",").map((v) => v.trim()).filter(Boolean);
					}
				} else {
					participants = $(wrapper).find("#cl-apt-participants").val() || [];
				}

				await frappe.call({
					method: "frappe.client.insert",
					args: {
						doc: {
							doctype: "Appointment",
							appointment_with,
							party,
							custom_subject: subject,
							customer_name,
							customer_email: $(wrapper).find("#cl-apt-email").val() || "",
							customer_phone_number: $(wrapper).find("#cl-apt-phone").val() || "",
							custom_start_date: $(wrapper).find("#cl-apt-start-date").val() || "",
							custom_start_time: start_time,
							custom_end_date: $(wrapper).find("#cl-apt-end-date").val() || "",
							custom_end_time: end_time,
							customer_details: $(wrapper).find("#cl-apt-details").val() || "",
							scheduled_time,
							custom_participants: (Array.isArray(participants) ? participants : [participants]).filter(Boolean).map((email) => ({ user: email })),
							reference: "Call List",
							reference_to: callListName
						}
					}
				});

				frappe.show_alert({ message: __("Appointment created"), indicator: "green" });
				this.loadCallListAppointments(callListName, wrapper);
				this.hideCallListPanelForm(wrapper);
			}
		} catch (err) {
			console.error("Error saving call list panel data:", err);
			frappe.msgprint(__("Error saving. Please check required fields and try again."));
		}
	}

	loadCallListTasks(callListName, wrapper) {
		const tasksContainer = $(wrapper).find("#activity-tasks-container");
		const loadMoreBtn = $(wrapper).find("#tasks-card-load-more");
		if (!tasksContainer.length) return;

		tasksContainer.html('<div class="text-center p-3 text-muted small">Loading tasks...</div>');
		const MAX_VISIBLE_TASKS = 5;
		let activeTaskFilter = this._cl_active_task_filter || "all";
		let expandedTasks = false;
		const esc = frappe.utils.escape_html;
		const normalizeStatus = (status) => (status || "").toLowerCase();
		const isCompleted = (task) => normalizeStatus(task.status) === "completed";

		const statusBadgeClass = (status) => {
			switch (status) {
				case "Open":
					return "bg-warning text-white";
				case "Working":
					return "bg-primary text-white";
				case "Pending Review":
					return "bg-success text-white";
				case "Overdue":
					return "bg-secondary text-white";
				case "Templated":
					return "bg-info text-white";
				case "Cancelled":
					return "bg-danger text-white";
				default:
					return "bg-light text-dark";
			}
		};

		const formatDateTimeDisplay = (value) => {
			if (!value) return "";
			const dt = value instanceof Date ? value : new Date(value);
			if (Number.isNaN(dt.getTime())) return "";
			const dd = String(dt.getDate()).padStart(2, "0");
			const mm = String(dt.getMonth() + 1).padStart(2, "0");
			const yy = String(dt.getFullYear()).slice(-2);
			const hh = String(dt.getHours()).padStart(2, "0");
			const min = String(dt.getMinutes()).padStart(2, "0");
			return `${dd}-${mm}-${yy} ${hh}:${min}`;
		};

		frappe.call({
			method: "renewal_module.custom_module.page.call_lists.call_lists.get_call_list_tasks",
			args: { call_list_name: callListName },
			callback: (r) => {
				const tasks = r.message || [];
				if (!tasks.length) {
					tasksContainer.html(`
						<div class="empty-state-list text-center py-4">
							<i class="fa fa-tasks text-muted mb-2" style="font-size: 24px;"></i>
							<p class="text-muted mb-0" style="font-size: 13px;">No tasks found.</p>
						</div>
					`);
					loadMoreBtn.hide();
					return;
				}

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
					$(wrapper).find("#call-list-tasks-card-tabs .task-tab").each(function () {
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
					$(wrapper).find("#call-list-tasks-card-tabs .task-tab").each(function () {
						const $btn = $(this);
						const isActive = $btn.data("taskFilter") === filter;
						$btn.toggleClass("active", isActive);
					});
				};

				const safeId = (v) => String(v || "").replace(/[^a-zA-Z0-9-_]/g, "_");

				const getInitials = (name) => {
					const parts = (name || "User").trim().split(/\s+/);
					return ((parts[0]?.[0] || "U") + (parts[1]?.[0] || "")).toUpperCase();
				};

				const buildAvatar = (user) => {
					if (user.image) {
						return `<img src="${user.image}" alt="${esc(user.full_name || "User")}" class="cl-task-avatar-img">`;
					}
					return `<span class="cl-task-avatar-initials">${getInitials(user.full_name)}</span>`;
				};

				const buildAvatarGroup = (users) => {
					if (!users?.length) return "";
					const shown = users.slice(0, 2);
					const extra = users.length - shown.length;
					return `
						<div class="cl-task-avatar-group">
							${shown.map((u, i) => `
								<div class="cl-task-avatar-item" title="${esc(u.full_name || "")}" style="margin-left:${i === 0 ? "0" : "-8px"};">
									${buildAvatar(u)}
								</div>
							`).join("")}
							${extra > 0 ? `
								<div class="cl-task-avatar-extra" title="${esc(users.slice(2).map((u) => u.full_name).join(", "))}">
									+${extra}
								</div>
							` : ""}
						</div>
					`;
				};

				const fillTaskAvatars = (taskList, userMap) => {
					taskList.forEach((t) => {
						const holder = document.getElementById(`cl-task-avatars-${safeId(t.name)}`);
						if (!holder) return;

						const assigned = (t.custom_users || [])
							.map((u) => userMap[u.user])
							.filter(Boolean);

						holder.innerHTML = buildAvatarGroup(assigned);
					});
				};

				const fetchUserMap = async (users) => {
					if (!users.length) return {};
					const res = await frappe.call({
						method: "renewal_module.custom_module.page.call_lists.call_lists.get_users_basic_info",
						args: { users },
						silent: true,
					});

					const map = {};
					(res.message || []).forEach((u) => {
						map[u.name] = {
							full_name: u.full_name || u.name,
							image: u.user_image ? frappe.utils.get_file_link(u.user_image) : null,
						};
					});
					return map;
				};

				const buildHtml = (filteredTasks) => filteredTasks.map((t) => `
					<div class="task-card p-2 mb-2 rounded shadow-sm" style="background:#f8f9fa; border:1px solid #eee;">
						<div class="d-flex justify-content-between align-items-center gap-1 mb-1">
							<div style="width:70%;">
								<div class="fw-bold text-primary text-truncate mb-1" title="${esc(t.subject || "")}">
									${esc(t.subject || "")}
								</div>
							</div>
							<div style="width:30%; display:flex; justify-content:end;">
								<div class="cl-task-avatar-holder" id="cl-task-avatars-${safeId(t.name)}"></div>
							</div>
						</div>

						<div class="d-flex justify-content-between align-items-center gap-1 mb-1">
							<span class="cl-task-open text-truncate" data-name="${esc(t.name || "")}" style="cursor:pointer;" title="${esc(t.name || "")}">
								${esc(t.name || "")}
							</span>
							<span class="status-badge ${statusBadgeClass(t.status)} text-truncate rounded" title="${esc(t.status || "")}">${esc(t.status || "")}</span>
							<span class="priority-badge bg-info text-white text-truncate rounded" title="${esc(t.priority || "")}">${esc(t.priority || "")}</span>
						</div>

						<div class="mb-1">
							${t.exp_end_date ? `<span class="text-danger" title="${esc(formatDateTimeDisplay(t.exp_end_date))}">${esc(formatDateTimeDisplay(t.exp_end_date))}</span>` : ""}
						</div>
					</div>
				`).join("");

				const allUsers = [
					...new Set(
						tasks.flatMap((t) => (t.custom_users || []).map((u) => u.user)).filter(Boolean)
					)
				];
				const userMapPromise = fetchUserMap(allUsers).catch(() => ({}));

				const renderTasks = async (filter, userMap) => {
					const filteredTasks = getFilteredTasks(filter);
					if (!filteredTasks.length) {
						tasksContainer.html('<div class="empty-state-list text-center py-4"><i class="fa fa-folder-open text-muted mb-2" style="font-size: 24px;"></i><p class="text-muted mb-0" style="font-size: 13px;">No tasks found.</p></div>');
						loadMoreBtn.hide();
						return;
					}
					const listToRender = expandedTasks ? filteredTasks : filteredTasks.slice(0, MAX_VISIBLE_TASKS);
					tasksContainer.html(buildHtml(listToRender));
					fillTaskAvatars(listToRender, userMap);
					loadMoreBtn.toggle(!expandedTasks && filteredTasks.length > MAX_VISIBLE_TASKS);
				};

				updateTabCounts();
				updateTabStyles(activeTaskFilter);
				userMapPromise.then((userMap) => renderTasks(activeTaskFilter, userMap));

				$(wrapper).off("click", "#call-list-tasks-card-tabs .task-tab").on("click", "#call-list-tasks-card-tabs .task-tab", (e) => {
					activeTaskFilter = $(e.currentTarget).data("taskFilter") || "all";
					this._cl_active_task_filter = activeTaskFilter;
					expandedTasks = false;
					updateTabStyles(activeTaskFilter);
					userMapPromise.then((userMap) => renderTasks(activeTaskFilter, userMap));
				});

				$(wrapper).off("click", "#tasks-card-load-more").on("click", "#tasks-card-load-more", () => {
					const advancedFilters = [
						["Task", "reference", "=", "Call List"],
						["Task", "reference_to", "=", callListName]
					];
					const params = new URLSearchParams();
					params.set("filters", encodeURIComponent(JSON.stringify(advancedFilters)));

					if (activeTaskFilter === "completed") {
						params.set("status", "Completed");
					} else if (activeTaskFilter === "pending") {
						const pendingFilters = [...advancedFilters, ["Task", "status", "!=", "Completed"]];
						params.set("filters", encodeURIComponent(JSON.stringify(pendingFilters)));
					}

					const url = `/app/tasks?${params.toString()}`;
					window.open(url, "_blank");
				});
			}
		});
	}

	loadCallListAppointments(callListName, wrapper) {
		const appointmentsContainer = $(wrapper).find("#activity-appointments-container");
		const loadMoreBtn = $(wrapper).find("#appointments-card-load-more");
		if (!appointmentsContainer.length) return;

		appointmentsContainer.html('<div class="text-center p-3 text-muted small">Loading appointments...</div>');
		const MAX_VISIBLE_APPTS = 5;
		let activeAppointmentFilter = this._cl_active_appointment_filter || "all";
		let expandedAppointments = false;
		const esc = frappe.utils.escape_html;
		const normalizeStatus = (status) => (status || "").toLowerCase();
		const formatDate = (dt) => {
			if (!dt) return "";
			const [y, m, d] = String(dt).split(" ")[0].split("-");
			return `${d}-${m}-${y}`;
		};
		const appointmentStatusBadgeClass = (status) => {
			switch (status) {
				case "Open":
					return "bg-success text-white";
				case "Closed":
					return "bg-secondary text-white";
				case "Unverified":
					return "bg-warning text-white";
				default:
					return "bg-light text-dark";
			}
		};
		const simpleInitialAvatar = (label) => {
			const init = (label || "U").substring(0, 2).toUpperCase();
			return `<span class="cl-avatar cl-avatar-initials">${init}</span>`;
		};

		frappe.call({
			method: "renewal_module.custom_module.page.call_lists.call_lists.get_call_list_appointments",
			args: { call_list_name: callListName },
			callback: async (r) => {
				let appts = r.message || [];
				if (!appts.length) {
					appointmentsContainer.html(`
						<div class="empty-state-list text-center py-4">
							<i class="fa fa-calendar text-muted mb-2" style="font-size: 24px;"></i>
							<p class="text-muted mb-0" style="font-size: 13px;">No appointments found.</p>
						</div>
					`);
					loadMoreBtn.hide();
					return;
				}

				const participantIds = [...new Set(
					appts.flatMap((a) => a.custom_participants || []).filter(Boolean)
				)];
				let participantMap = {};

				if (participantIds.length && frappe.model.can_read("User")) {
					try {
						const usersRes = await frappe.call({
							method: "renewal_module.custom_module.page.call_lists.call_lists.get_users_basic_info",
							args: { users: participantIds },
							silent: true
						});
						(usersRes.message || []).forEach((u) => {
							participantMap[u.name] = {
								full_name: u.full_name || u.name,
								image: u.user_image ? frappe.utils.get_file_link(u.user_image) : null
							};
						});
					} catch (err) {
						console.error("Failed to load appointment participants:", err);
					}
				}

				appts = appts.map((a) => ({
					...a,
					participant_info: (a.custom_participants || [])
						.map((id) => participantMap[id])
						.filter(Boolean)
				}));

				const getFilteredAppointments = (filter) => {
					if (filter === "all") return appts;
					return appts.filter((a) => normalizeStatus(a.status) === filter);
				};

				const updateTabCounts = () => {
					const totalCount = appts.length;
					const openCount = appts.filter((a) => normalizeStatus(a.status) === "open").length;
					const unverifiedCount = appts.filter((a) => normalizeStatus(a.status) === "unverified").length;
					const closedCount = appts.filter((a) => normalizeStatus(a.status) === "closed").length;
					$(wrapper).find("#call-list-appointments-card-tabs .appointment-tab").each(function () {
						const $btn = $(this);
						switch ($btn.data("appointmentFilter")) {
							case "open":
								$btn.text(`Open (${openCount})`);
								break;
							case "unverified":
								$btn.text(`Unverified (${unverifiedCount})`);
								break;
							case "closed":
								$btn.text(`Closed (${closedCount})`);
								break;
							default:
								$btn.text(`All (${totalCount})`);
								break;
						}
					});
				};

				const updateTabStyles = (filter) => {
					$(wrapper).find("#call-list-appointments-card-tabs .appointment-tab").each(function () {
						const $btn = $(this);
						const isActive = $btn.data("appointmentFilter") === filter;
						$btn.toggleClass("active", isActive);
					});
				};

				const getAppointmentInitials = (name) => {
					const parts = (name || "User").trim().split(/\s+/);
					return ((parts[0]?.[0] || "U") + (parts[1]?.[0] || "")).toUpperCase();
				};

				const buildAppointmentAvatar = (user) => {
					if (user.image) {
						return `<img src="${user.image}" alt="${esc(user.full_name || "User")}" class="cl-avatar cl-avatar-img">`;
					}
					return `<span class="avatar-initials cl-avatar cl-avatar-initials">${getAppointmentInitials(user.full_name)}</span>`;
				};

				const buildAppointmentAvatarGroup = (users) => {
					const visible = users.slice(0, 3);
					const extra = users.length - visible.length;
					return `
						<div class="cl-avatar-group">
							${visible.map((u, i) => `
								<div class="avatar-item cl-avatar-item" title="${esc(u.full_name || "")}" style="margin-left:${i === 0 ? 0 : "-6px"};">
									${buildAppointmentAvatar(u)}
								</div>
							`).join("")}
							${extra > 0 ? `<div class="extra-avatar cl-avatar-extra" title="${esc(users.slice(3).map((u) => u.full_name).join(", "))}" style="margin-left:-6px;">+${extra}</div>` : ""}
						</div>
					`;
				};

				const buildHtml = (filteredAppts) => filteredAppts.map((a) => `
					<div class="call-card p-2 mb-2 rounded shadow-sm" style="background:#f8f9fa;border:1px solid #e6e6e6;">
						<div class="d-flex justify-content-between align-items-center mb-1 gap-1">
							<div class="fw-bold text-primary text-truncate" title="${esc(a.customer_name || "")}">${esc(a.customer_name || a.name || "Appointment")}</div>
							<div>
								${(a.participant_info || []).length ? buildAppointmentAvatarGroup(a.participant_info) : simpleInitialAvatar(a.owner)}
							</div>
						</div>
						${a.custom_subject ? `<div class="text-truncate text-dark mb-1" title="${esc(a.custom_subject)}">${esc(a.custom_subject)}</div>` : ""}
						<div class="d-flex justify-content-between align-items-center mb-1 gap-1">
							<span class="text-dark text-truncate" title="${esc(a.customer_phone_number || "")}">${esc(a.customer_phone_number || "")}</span>
							<span class="text-truncate status-badge ${appointmentStatusBadgeClass(a.status)} rounded" title="${esc(a.status || "")}">${esc(a.status || "")}</span>
							<span class="cl-apt-open badge bg-light p-1" data-name="${esc(a.name)}" title="${esc(a.name)}" style="cursor:pointer;border:1px solid #ddd;">${esc(a.name || "")}</span>
						</div>
						<div class="row small">
							<div class="col-12">
								${a.customer_email ? `<div title="${esc(a.customer_email)}"><i class="fa fa-envelope text-primary mr-1"></i>${esc(a.customer_email)}</div>` : ""}
							</div>
						</div>
						<div class="d-flex justify-content-between align-items-center mb-1 gap-1">
							<div>
								${a.custom_start_date ? `<div><i class="fa fa-calendar-days text-warning mr-1"></i>${esc(formatDate(a.custom_start_date))}</div>` : ""}
								${a.custom_start_time ? `<div><i class="fa fa-clock text-primary mr-1"></i>${esc(a.custom_start_time)}</div>` : ""}
							</div>
							<div>
								${a.custom_end_date ? `<div><i class="fa fa-calendar-days text-warning mr-1"></i>${esc(formatDate(a.custom_end_date))}</div>` : ""}
								${a.custom_end_time ? `<div><i class="fa fa-clock text-primary mr-1"></i>${esc(a.custom_end_time)}</div>` : ""}
							</div>
						</div>
					</div>
				`).join("");

				const renderAppointments = (filter) => {
					const filteredAppts = getFilteredAppointments(filter);
					if (!filteredAppts.length) {
						appointmentsContainer.html('<div class="empty-state-list text-center py-4"><i class="fa fa-calendar text-muted mb-2" style="font-size: 24px;"></i><p class="text-muted mb-0" style="font-size: 13px;">No appointments found.</p></div>');
						loadMoreBtn.hide();
						return;
					}
					const listToRender = expandedAppointments ? filteredAppts : filteredAppts.slice(0, MAX_VISIBLE_APPTS);
					appointmentsContainer.html(buildHtml(listToRender));
					loadMoreBtn.toggle(!expandedAppointments && filteredAppts.length > MAX_VISIBLE_APPTS);
				};

				updateTabCounts();
				updateTabStyles(activeAppointmentFilter);
				renderAppointments(activeAppointmentFilter);

				$(wrapper).off("click", "#call-list-appointments-card-tabs .appointment-tab").on("click", "#call-list-appointments-card-tabs .appointment-tab", (e) => {
					activeAppointmentFilter = $(e.currentTarget).data("appointmentFilter") || "all";
					this._cl_active_appointment_filter = activeAppointmentFilter;
					expandedAppointments = false;
					updateTabStyles(activeAppointmentFilter);
					renderAppointments(activeAppointmentFilter);
				});

				$(wrapper).off("click", "#appointments-card-load-more").on("click", "#appointments-card-load-more", () => {
					const advancedFilters = [
						["Appointment", "reference", "=", "Call List"],
						["Appointment", "reference_to", "=", callListName]
					];
					const params = new URLSearchParams();
					params.set("filters", encodeURIComponent(JSON.stringify(advancedFilters)));

					if (activeAppointmentFilter === "open") {
						params.set("status", "Open");
					} else if (activeAppointmentFilter === "unverified") {
						params.set("status", "Unverified");
					} else if (activeAppointmentFilter === "closed") {
						params.set("status", "Closed");
					}

					const url = `/app/appointments?${params.toString()}`;
					window.open(url, "_blank");
				});
			}
		});
	}

	loadCallListNotes(callListName, wrapper) {
		const notesContainer = $(wrapper).find("#main-notes-list");
		if (!notesContainer.length) return;

		notesContainer.html('<div class="text-center p-3 text-muted small">Loading notes...</div>');

		frappe.call({
			method: "renewal_module.custom_module.page.call_lists.call_lists.get_call_list_notes",
			args: { call_list_name: callListName },
			callback: (r) => {
				const notes = Array.isArray(r.message)
					? r.message
					: (r.message?.notes || []);

				if (!notes.length) {
					notesContainer.html(`
						<div class="empty-state-list text-center py-4">
							<i class="fa fa-file-text-o text-muted mb-2" style="font-size: 24px;"></i>
							<p class="text-muted mb-0" style="font-size: 13px;">No notes found.</p>
						</div>
					`);
					return;
				}

				const sortedNotes = [...notes].sort((a, b) => new Date(b.creation) - new Date(a.creation));
				const notesHtml = sortedNotes.map((note) => {
					const displayNameRaw = note.created_by || note.owner || "";
					const initials = displayNameRaw.split(" ").map((n) => n[0]).join("").substring(0, 2).toUpperCase();
					const timestampRaw = note.timestamp || note.creation;
					const timestamp = timestampRaw ? frappe.datetime.str_to_user(timestampRaw) : "";
					const creatorName = frappe.utils.escape_html(displayNameRaw);
					const customRole = frappe.utils.escape_html(note.custom_role || "");
					const noteBody = frappe.utils.escape_html(note.note || note.description || "").replace(/\n/g, "<br>");
					const avatarInitials = frappe.utils.escape_html(initials || "NA");

					return `
						<div class="note-card mb-3 p-3 border rounded bg-white">
							<div class="d-flex justify-content-between align-items-start gap-2">
								<div class="d-flex align-items-center flex-grow-1" style="min-width:0;">
									<div class="rounded-circle bg-primary text-white d-flex align-items-center justify-content-center fw-bold me-2 flex-shrink-0" style="width:32px;height:32px;">${avatarInitials}</div>
									<div class="flex-grow-1" style="min-width:0;">
										<div class="text-dark fw-500 text-truncate" title="${creatorName}">${creatorName}</div>
										${customRole ? `<div class="small text-muted">${customRole}</div>` : `<div class="small text-muted">${frappe.utils.escape_html(note.note_type || "Internal")}</div>`}
									</div>
								</div>
							</div>
							<div class="note-text p-2 mt-3 border rounded bg-light" style="max-height:180px;overflow:auto;">
								${noteBody}
							</div>
							<div class="mt-2 d-flex justify-content-end">
								<div class="small text-muted">${timestamp}</div>
							</div>
						</div>
					`;
				}).join("");

				notesContainer.html(notesHtml);
			},
			error: () => {
				notesContainer.html(`
					<div class="alert alert-danger" role="alert">
						Failed to load notes. Please check server logs for call list notes query.
					</div>
				`);
			}
		});
	}

	openAddSalesTeamMemberDialog(call_list_name) {
		const resolveUserData = async (selectedUser) => {
			if (!selectedUser) {
				return {};
			}

			try {
				const r = await frappe.call({
					method: "renewal_module.custom_module.page.call_lists.call_lists.get_user_contact_meta",
					args: { user: selectedUser }
				});
				if (r && r.message && Object.keys(r.message).length) {
					return r.message;
				}
			} catch (err) {
				console.warn("resolveUserData failed:", err);
			}

			return {};
		};

		const dialog = new frappe.ui.Dialog({
			title: __("Add Sales Team Member"),
			fields: [
				{
					label: "Sales Person",
					fieldname: "sales_person",
					fieldtype: "Link",
					options: "User",
					reqd: 1,
					get_query: () => ({
						filters: { enabled: 1 },
						ignore_user_permissions: 1
					})
				},
				{
					label: "Mobile No",
					fieldname: "mobile_no",
					fieldtype: "Data",
					read_only: 1,
					//hidden: 1
				},
				{
					label: "Email ID",
					fieldname: "email_id",
					fieldtype: "Data",
					read_only: 1,
					// hidden: 1
				}
			],
			primary_action_label: __("Add"),
			primary_action: async (values) => {
				const selectedSalesPerson = dialog.get_value("sales_person") || values.sales_person;
				if (!selectedSalesPerson) return;

				try {
					const userData = await resolveUserData(selectedSalesPerson);
					const resolvedSalesPerson = (userData.full_name || selectedSalesPerson || "").trim();
					const resolvedMobile = (
						dialog.get_value("mobile_no") || values.mobile_no || userData.mobile_no || userData.phone || ""
					).trim();
					const resolvedEmail = (
						dialog.get_value("email_id") || values.email_id || userData.email || userData.name || ""
					).trim();

					const callListDoc = await frappe.db.get_doc("Call List", call_list_name);
					const exists = (callListDoc.sales_team || []).some(
						(row) => {
							const existing = String(row.sales_person || "").trim().toLowerCase();
							const selectedRaw = String(selectedSalesPerson || "").trim().toLowerCase();
							const selectedResolved = String(resolvedSalesPerson || "").trim().toLowerCase();
							return existing === selectedRaw || (selectedResolved && existing === selectedResolved);
						}
					);
					if (exists) {
						frappe.show_alert({ message: __("Sales member already added."), indicator: "orange" });
						dialog.hide();
						return;
					}

					await frappe.call({
						method: "frappe.client.insert",
						args: {
							doc: {
								doctype: "Sales Team",
								parent: call_list_name,
								parentfield: "sales_team",
								parenttype: "Call List",
								sales_person: resolvedSalesPerson,
								mobile_no: resolvedMobile,
								email_id: resolvedEmail,
								allocated_percentage: 100
							}
						}
					});

					frappe.show_alert({ message: __("Sales member added successfully."), indicator: "green" });
					dialog.hide();
					this.load_call_list_details(call_list_name);
				} catch (err) {
					console.error("openAddSalesTeamMemberDialog error:", err);
					frappe.msgprint(__("Failed to add sales member."));
				}
			}
		});

		const fillSalesPersonMeta = async () => {
			const user = dialog.get_value("sales_person");
			if (!user) {
				dialog.set_value("mobile_no", "");
				dialog.set_value("email_id", "");
				return;
			}

			try {
				const info = await resolveUserData(user);
				dialog.set_value("mobile_no", info.mobile_no || info.phone || "");
				dialog.set_value("email_id", info.email || "");
			} catch (err) {
				console.warn("sales person auto-fill failed:", err);
			}
		};

		dialog.fields_dict.sales_person.df.onchange = fillSalesPersonMeta;

		dialog.show();
		const salesPersonField = dialog.get_field("sales_person");
		if (salesPersonField && salesPersonField.$input) {
			salesPersonField.$input.off("change.salesperson blur.salesperson");
			salesPersonField.$input.on("change.salesperson blur.salesperson", fillSalesPersonMeta);
		}
		setTimeout(() => {
			const closeBtn = dialog.get_close_btn();
			if (!closeBtn || !closeBtn.length) {
				return;
			}
			closeBtn.off("click.add-sales").on("click.add-sales", function () {
				dialog.hide();
			});
		}, 50);
	}

	update_status(call_list_name, status) {
		frappe.call({
			method: "frappe.client.set_value",
			args: {
				doctype: "Call List",
				name: call_list_name,
				fieldname: "status",
				value: status
			},
			callback: (r) => {
				frappe.show_alert({ message: __("Status updated to {0}", [status]), indicator: "green" });
				this.load_call_list_details(call_list_name);
			}
		});
	}

	bindCallListEmailHandler(call_list_name) {
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

			// Get Call List details
			const callList = await frappe.db.get_doc("Call List", call_list_name);

			// Fetch all enabled system users
			let enabledUsers = [];
			try {
				const usersRes = await frappe.call({
					method: "renewal_module.custom_module.page.call_lists.call_lists.get_enabled_users",
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

			// Collect call_list's own emails
			const call_list_emails_raw = [];
			if (callList.customer_email) call_list_emails_raw.push(callList.customer_email);
			if (callList.contact_email) call_list_emails_raw.push(callList.contact_email);
			(callList.sales_team || []).forEach(p => {
				if (p.email_id) call_list_emails_raw.push(p.email_id);
			});

			// Normalize call list emails through the user map (to resolve user IDs → emails)
			const call_list_emails = normalizeEmails(
				call_list_emails_raw.map((v) => {
					const key = String(v || "").trim().toLowerCase();
					return enabledUserEmailMap.get(key) || v;
				})
			);

			// All system user emails
			const systemUserEmails = normalizeEmails(
				enabledUsers.map((u) => (u?.email || u?.name || "").trim()).filter(Boolean)
			);

			// Merge all options and deduplicate
			const email_options = normalizeEmails([...call_list_emails, ...systemUserEmails]);

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
						default: normalizeEmails(call_list_emails),
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
						default: `Call List: ${callList.name}`
					},
					{
						label: __("Message"),
						fieldname: "content",
						fieldtype: "TextEditor",
						reqd: 1
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
						method: "renewal_module.custom_module.page.call_lists.call_lists.send_call_list_email",
						args: {
							call_list_name: call_list_name,
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
								me.loadCallListActivityTimeline(call_list_name);
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

	loadCallListActivityTimeline(call_list_name) {
		const me = this;
		frappe.call({
			method: "renewal_module.custom_module.page.call_lists.call_lists.get_call_list_activity",
			args: { call_list_name: call_list_name },
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
					html = `<p class="text-muted text-center">No activity found for this call_list.</p>`;
				}

				container.html(html);
			}
		});
	}

	bindCallListCommentEvents(call_list_name) {
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
				method: "renewal_module.custom_module.page.call_lists.call_lists.add_call_list_comment",
				args: {
					call_list_name: call_list_name,
					content: finalHtml
				},
				callback: function (r) {
					if (!r.exc) {
						frappe.show_alert({ message: "Comment added", indicator: "green" });
						$("#new-comment-input").html("<p><br></p>");
						me.loadCallListActivityTimeline(call_list_name);
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
			method: "renewal_module.custom_module.page.call_lists.call_lists.get_enabled_users",
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

	openSpecificEditDialog(call_list_name, fieldname) {
		const doctype = "Call List";
		frappe.call({
			method: "frappe.client.get",
			args: { doctype, name: call_list_name },
			callback: (resp) => {
				if (!resp || !resp.message) {
					frappe.msgprint(__("Could not fetch call_list details."));
					return;
				}
				let doc = resp.message;

				frappe.model.with_doctype(doctype, async () => {
					await frappe.model.with_doctype("Sales Team");
					const df = frappe.meta.get_docfield(doctype, fieldname);
					if (!df) {
						frappe.msgprint(__("Field {0} not found.", [fieldname]));
						return;
					}

					let current_value = doc[fieldname];
					let is_table = (fieldname === "sales_team");

					let dialog_fields = [];
					if (is_table) {
						dialog_fields = [{
							label: df.label || fieldname,
							fieldname: "sales_team",
							fieldtype: "Table",
							options: "Sales Team",
							reqd: df.reqd,
							cannot_add_rows: false,
							in_place_edit: true
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

							if (is_table) {
								value = d.get_value("sales_team");
							} else {
								value = d.get_value("value");
							}

							if (value === undefined || value === null || value === "") {
								if (df.reqd) {
									frappe.msgprint(__("Value is required"));
									return;
								}
								value = is_table ? [] : "";
							}

							d.hide();

							frappe.call({
								method: "frappe.client.get",
								args: { doctype, name: call_list_name },
								callback: (r2) => {
									if (r2 && r2.message) {
										let update_doc = r2.message;
										update_doc[fieldname] = value;
										frappe.call({
											method: "frappe.client.save",
											args: { doc: update_doc },
											callback: () => {
												frappe.show_alert({ message: __("Successfully updated {0}", [df.label || fieldname]), indicator: "green" });
												this.load_call_list_details(call_list_name);
											}
										});
									}
								}
							});
						}
					});

					if (!is_table) {
						d.set_value("value", current_value);
					} else {
						d.set_value("sales_team", current_value || []);
					}

					d.show();
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

	openCallListEditDialog(call_list_name) {
		const doctype = "Call List";
		frappe.model.with_doctype(doctype, () => {
			const fields = frappe.meta.get_docfields(doctype)
				.filter(df => df.fieldname && df.label && !df.hidden && !df.read_only && df.fieldtype !== "Table");

			const d = new frappe.ui.Dialog({
				title: __("Edit Call List Details"),
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
							name: call_list_name,
							fieldname,
							value
						},
						callback: () => {
							frappe.show_alert({ message: __("Call List updated successfully"), indicator: "green" });
							this.load_call_list_details(call_list_name);
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
		this.setPageTitle("New Call List");
		this.setActiveSidebar();
		$(".call_list-list-view").addClass("d-none");
		$(".call_list-details-view").addClass("d-none");
		$(".new-call_lists").removeClass("d-none");
		this.bind_new_form_events();
	}

	async bind_new_form_events() {
		const me = this;
		const form = document.getElementById("new-call_list-form");
		if (!form) return;

		let seriesControl = frappe.ui.form.make_control({
			df: { fieldtype: "Select", fieldname: "series", label: "Series", options: "CL-2425-.####" },
			parent: document.getElementById("series-field"),
			render_input: true
		});
		seriesControl.set_value("CL-2425-.####");

		let subjectControl = frappe.ui.form.make_control({
			df: { fieldtype: "Data", fieldname: "subject", label: "Subject" },
			parent: document.getElementById("subject-field"),
			render_input: true
		});

		let statusControl = frappe.ui.form.make_control({
			df: { fieldtype: "Select", fieldname: "status", label: "Status", options: ["", "Scheduled", "Held", "Cancelled"] },
			parent: document.getElementById("status-field"),
			render_input: true
		});
		statusControl.set_value("Held");

		let startDateControl = frappe.ui.form.make_control({
			df: { fieldtype: "Date", fieldname: "start_date", label: "Start Date" },
			parent: document.getElementById("start-date-field"),
			render_input: true
		});

		let startTimingControl = frappe.ui.form.make_control({
			df: { fieldtype: "Time", fieldname: "start_timing", label: "Start Timing" },
			parent: document.getElementById("start-time-field"),
			render_input: true
		});

		let endDateControl = frappe.ui.form.make_control({
			df: { fieldtype: "Date", fieldname: "end_date", label: "End Date" },
			parent: document.getElementById("end-date-field"),
			render_input: true
		});

		let endTimingControl = frappe.ui.form.make_control({
			df: { fieldtype: "Time", fieldname: "end_timing", label: "End Timing" },
			parent: document.getElementById("end-time-field"),
			render_input: true
		});

		let directionControl = frappe.ui.form.make_control({
			df: { fieldtype: "Select", label: "Direction", fieldname: "direction", options: ["", "Inbound", "Outbound"] },
			parent: document.getElementById("direction-field"),
			render_input: true
		});
		directionControl.set_value("Outbound");

		// Hidden variables that get sent to the backend without displaying in the UI
		let custom_sales_person_value = "";

		let fullnameControl = frappe.ui.form.make_control({
			df: {
				fieldtype: "Link",
				label: "Full Name",
				fieldname: "name1",
				options: "Customer",
				onchange: () => {
					let related_to = relatedtoControl ? relatedtoControl.get_value() : "";
					let name1 = fullnameControl.get_value();
					if (related_to === "Customer" && name1) {
						frappe.db.get_value("Customer", name1, "sales_person")
							.then(r => {
								if (r && r.message && r.message.sales_person) {
									custom_sales_person_value = r.message.sales_person;
								} else {
									custom_sales_person_value = "";
								}
							});
					} else {
						custom_sales_person_value = "";
					}
				}
			},
			parent: document.getElementById("full-name-field"),
			render_input: true
		});

		let relatedtoControl = frappe.ui.form.make_control({
			df: {
				fieldtype: "Select",
				label: "Related To",
				fieldname: "related_to",
				options: ["", "Customer", "Contact"],
				onchange: () => {
					let val = relatedtoControl.get_value();
					if (fullnameControl && val) {
						fullnameControl.df.options = val;
						fullnameControl.set_value("");
					}
				}
			},
			parent: document.getElementById("related-to-field"),
			render_input: true
		});
		relatedtoControl.set_value("Customer");

		let descriptionControl = frappe.ui.form.make_control({
			df: { fieldtype: "Long Text", label: "Description", fieldname: "description" },
			parent: document.getElementById("description-field"),
			render_input: true
		});

		let custom_date_value = frappe.datetime.get_today();

		// Initialize sales_team data (done during save)

		// Prevent accidental form submission from nested buttons
		form.addEventListener("submit", function (e) {
			e.preventDefault();
		});

		// Bind save logic to the specific Save button
		const saveBtn = form.querySelector("#save-call_list-btn");
		saveBtn.addEventListener("click", async function (e) {
			e.preventDefault();

			const series = seriesControl.get_value();
			const subject = subjectControl.get_value();
			const status = statusControl.get_value();
			const start_date = startDateControl.get_value();
			const start_timing = startTimingControl.get_value();
			const end_date = endDateControl.get_value();
			const end_timing = endTimingControl.get_value();
			const direction = directionControl.get_value();
			const related_to = relatedtoControl.get_value();
			const name1 = fullnameControl.get_value();
			const custom_sales_person = custom_sales_person_value;
			const custom_date = custom_date_value;
			const description = descriptionControl.get_value();


			if (!series) {
				frappe.msgprint({
					title: __("Required Fields"),
					message: __("Please fill all required fields: Name, Email, Scheduled Time."),
					indicator: "red"
				});
				return;
			}

			const new_call_list = {
				doctype: "Call List",
				series,
				subject,
				status,
				start_date,
				start_timing,
				end_date,
				end_timing,
				direction,
				related_to,
				name1,
				custom_sales_person,
				custom_date,
				description
			};

			console.log("submitting call_list", new_call_list);

			try {
				// Insert Call List
				const insert = await frappe.call({
					method: "frappe.client.insert",
					args: {
						doc: new_call_list
					}
				});

				const call_list_name = insert.message.name;

				// Fetch User Info
				const userInfo = await frappe.call({
					method: "frappe.client.get_value",
					args: {
						doctype: "User",
						filters: { name: frappe.session.user },
						fieldname: ["full_name", "email", "mobile_no", "phone"]
					}
				});

				const u = userInfo.message || {};

				// Insert Sales Team row
				await frappe.call({
					method: "frappe.client.insert",
					args: {
						doc: {
							parent: call_list_name,
							parenttype: "Call List",
							parentfield: "sales_team",
							doctype: "Sales Team",
							sales_person: u.full_name || frappe.session.user,
							mobile_no: u.mobile_no || u.phone,
							email_id: u.email,
							allocated_percentage: 100
						}
					}
				});

				frappe.show_alert({ message: __("Call List {0} created successfully.", [call_list_name]), indicator: "green" }, 5);
				setTimeout(() => {
					frappe.set_route("call-lists", call_list_name);
				}, 1000);

				form.reset();
				seriesControl.refresh();
				subjectControl.refresh();
				statusControl.refresh();
				directionControl.refresh();
				relatedtoControl.refresh();
				fullnameControl.refresh();
				custom_sales_person_value = "";
				descriptionControl.refresh();
				startDateControl.refresh();
				endDateControl.refresh();
				startTimingControl.refresh();
				endTimingControl.refresh();

			} catch (err) {
				frappe.msgprint({
					title: __("Error"),
					message: __(err?.message || "An unexpected error occurred."),
					indicator: "red"
				});
			}
		});
	}
}

// ============================================================
// PAGE TEMPLATE
// ============================================================
frappe.call_lists_page_template = {
	body: `
	<div class="wrapper">

		<!-- ==================== LIST VIEW ==================== -->
		<div class="call_list-list-view">

			<div class="row">
				<div class="col-12">
					<div class="page-title-head d-flex align-items-center">
						<div class="flex-grow-1">
							<h3 class="fs-xl fw-bold m-0">Call Lists</h3>
						</div>
						<div class="text-end">
							<ol class="breadcrumb m-0 py-0" style="background-color: transparent;">
								<li class="breadcrumb-item"><a href="javascript: void(0);">Activity</a></li>
								<li class="breadcrumb-item active">Call Lists</li>
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
								<select class="control-select" data-call-list-filter="status" style="min-width:130px;">
									<option value="">Status</option>
									<option value="Held">Held</option>
									<option value="Scheduled">Scheduled</option>
									<option value="Cancelled">Cancelled</option>
								</select>
								<input class="control-select" type="text" placeholder="ID" data-call-list-filter="ID">
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

								<a id="new-call_list-btn" href="/app/call-lists/new-call_lists" class="btn btn-sm btn-primary1 mr-2">
									<i class="fa fa-plus me-1"></i> New Call List
								</a>

								<div class="dropdown d-none" id="call-list-actions-dropdown">
									<button class="btn btn-secondary1 dropdown-toggle btn-sm" type="button"
									        data-bs-toggle="dropdown" aria-expanded="false">
										Actions
									</button>
									<ul class="dropdown-menu">
										<li><a class="dropdown-item" href="#" data-call-list-action="set_held">Set as Held</a></li>
										<li><a class="dropdown-item" href="#" data-call-list-action="set_scheduled">Set as Scheduled</a></li>
										<li><a class="dropdown-item" href="#" data-call-list-action="set_cancelled">Set as Cancelled</a></li>
										<li><a class="dropdown-item" href="#" data-call-list-action="assign_to">Assign To</a></li>
										<li><a class="dropdown-item" href="#" data-call-list-action="edit">Edit</a></li>
										<li><a class="dropdown-item" href="#" data-call-list-action="print">Print</a></li>
										<li><a class="dropdown-item text-danger" href="#" data-call-list-action="delete">Delete</a></li>
									</ul>
								</div>
							</div>
						</div>
					</div>

					<div class="table-container mt-2">
						<table class="call_lists-table">
							<thead>
								<tr>
									<th>
										<input id="selectAllCallLists" type="checkbox"/>
									</th>
									<th title="ID">ID</th>
									<th title="Name">Name</th>
									<th title="Subject">Subject</th>
									<th title="Status">Status</th>
									<th title="start DateTime">Start DateTime</th>
									<th title="end DateTime">End DateTime</th>
									<th class="text-center" id="call-list-count-header" title="0 of 0">
										<span id="call-list-visible-count">0</span> of <span id="call-list-total-count">0</span>
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
									<button type="button" class="btn btn-default1 btn-light btn-sm call-list-btn-paging" data-value="20">20</button>
									<button type="button" class="btn btn-default1 btn-light btn-sm call-list-btn-paging" data-value="100">100</button>
									<button type="button" class="btn btn-default1 btn-light btn-sm call-list-btn-paging" data-value="500">500</button>
									<button type="button" class="btn btn-default1 btn-light btn-sm call-list-btn-paging" data-value="1500">1500</button>
								</div>
							</div>
							<div class="p-2">
								<button class="btn btn-default1 btn-light call-list-btn-more btn-sm">Load More</button>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- ==================== DETAILS VIEW ==================== -->
		<div class="call_list-details-view d-none">
			<div class="row">
				<div class="col-12">
					<div class="d-flex align-items-center">
						<div class="flex-grow-1">
							<h3 class="fs-xl fw-bold m-0">Call List Details</h3>
						</div>
						<div class="text-end">
							<ol class="breadcrumb m-0 py-0" style="background-color: transparent;">
								<li class="breadcrumb-item"><a href="javascript: void(0);">Activity</a></li>
								<li class="breadcrumb-item"><a href="/app/call-lists">Call Lists</a></li>
							</ol>
						</div>
					</div>
				</div>
			</div>
			<div class="row mb-2">
				<div class="col-12">
					<div class="call-list-meta">
						<div class="call-list-title">
							<span id="call-list-detail-name" class="call-list-id"></span>
							<span class="separator">—</span>
							<span id="call-list-detail-subject" class="call-list-subject"></span>
							
						</div>

						<div class="d-flex align-items-center justify-content-between gap-1">
							<div id="call-list-detail-status" class="btn btn-default2"></div>
							
							<div id="edit-call-list-details-btn" class="btn btn-default2 btn-light contact-info-action-btn d-flex align-items-center">
								<i class="fa fa-pencil me-1"></i> Edit
							</div>
							
							<div class="dropdown" id="call-list-details-actions-dropdown">
								<button class="btn btn-default2 btn-navblue btn-sm dropdown-toggle"
										type="button" data-bs-toggle="dropdown">
									Actions
								</button>
								<ul class="dropdown-menu dropdown-menu-end">
									<li><a class="dropdown-item" href="#" data-call-list-action="set_held">Set as Held</a></li>
									<li><a class="dropdown-item" href="#" data-call-list-action="set_scheduled">Set as Scheduled</a></li>
									<li><a class="dropdown-item" href="#" data-call-list-action="set_cancelled">Set as Cancelled</a></li>
									<li><a class="dropdown-item text-danger" href="#" data-call-list-action="delete">Delete</a></li>
								</ul>
							</div>
						</div>
					</div>
				</div>
			</div>

			<div class="row mb-2">
				<div class="col-12">
					<div id="call-list-details-container"></div>
				</div>
			</div>
		</div>

		<!-- ==================== NEW APPOINTMENT FORM ==================== -->
		<div class="new-call_lists d-none">
			<div class="row">
				<div class="col-12">
					<div class="page-title-head d-flex align-items-center">
						<div class="flex-grow-1">
							<h3 class="fs-xl fw-bold m-0">New Call List</h3>
						</div>
						<div class="text-end">
							<ol class="breadcrumb m-0 py-0" style="background-color: transparent;">
								<li class="breadcrumb-item"><a href="javascript: void(0);">Activity</a></li>
								<li class="breadcrumb-item"><a href="/app/call-lists">Call Lists</a></li>
							</ol>
						</div>
					</div>
				</div>
			</div>

			<div class="row">
				<div class="col-lg-12 col-12">
					<div class="rounded p-0 call_list-form-container" style="background-color: transparent;">
						<form id="new-call_list-form" autocomplete="off">
							<!-- Customer Details Card -->
							<div class="card mb-4 border">
								<div class="card-header bg-white border-bottom-0 pb-0 pt-3">
									<h6 class="fw-bold mb-0 text-dark" style="font-size: 15px;">Customer Details</h6>
								</div>
								<div class="card-body">
									<div class="row">
										<div class="col-md-6">
											<div id="series-field"></div>
										</div>
									</div>
									<div class="row">
										<div class="col-md-6">
											<div id="subject-field"></div>
										</div>
										<div class="col-md-6">
											<div id="status-field"></div>
										</div>
									</div>

									<div class="row">
										<div class="col-md-6">
											<div id="start-date-field"></div>
										</div>
										<div class="col-md-6">
											<div id="start-time-field"></div>
										</div>
									</div>

									<div class="row">
										<div class="col-md-6">
											<div id="end-date-field"></div>
										</div>
										<div class="col-md-6">
											<div id="end-time-field"></div>
										</div>
									</div>

									<div class="row">
										<div class="col-md-6">
											<div id="direction-field"></div>
										</div>
									</div>

									<div class="row">
										<div class="col-md-6">
											<div id="related-to-field"></div>
										</div>
										<div class="col-md-6">
											<div id="full-name-field"></div>
										</div>
									</div>

									<div class="row">
										<div class="col-md-6">
											<div id="sales-person-field"></div>
										</div>
									</div>
                                    
									<div class="row">
										<div class="col-12">
											<div id="description-field"></div>
										</div>
									</div>
								
									<div class="row">
										<div class="col-12">	
											<div class="d-flex gap-2 justify-content-between align-items-center mb-2">
												<button type="button" id="save-call_list-btn" class="btn btn-primary btn-sm rounded">
													Save
												</button>
											</div>
										</div>
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