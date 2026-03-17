/*frappe.pages['contactss'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'None',
		single_column: true
	});
}*/

frappe.pages['contactss'].on_page_load = (wrapper) => {
	localStorage.removeItem('contacts_page_length');
	new contactsPage(wrapper);
};

frappe.pages['contactss'].on_page_show = (wrapper) => {
	console.log("🔄 contacts page showing");
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
			if (!frappe.contacts_page || frappe.contacts_page.wrapper !== pageWrapper) {
				frappe.contacts_page = new contactsPage(pageWrapper);
			}
			frappe.contacts_page.render();
		});
	});
};

class contactsPage {
	constructor(wrapper) {
		this.wrapper = wrapper;
		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: '',
			single_column: true
		});

		this.page_length = 20;
		this.visible_count = 0;
		this.all_contacts = [];
		this.total_records = 0;
		this.selected_contacts = new Set();
		this.saved_filters = [];
		this.active_filters = {
			status: "",
			name: "",
			fullname: "",
			company_name: "",
		}
	}

	render() {
		const waitForContent = () => {
			const $content = $("#support-page-content");
			if (!$content.length) {
				setTimeout(waitForContent, 50);
				return;
			}
			$content.empty().append(frappe.contacts_page_template.body);
			this.handleRoute();
			this.bindActionDropdown();
		};

		waitForContent();
	}

	handleRoute() {
		const route = frappe.get_route();
		console.log("handleRoute:", route);

		if (route.length === 1) {
			return this.show_list();
		}

		if (route.length === 2 && route[1] === "new-contacts") {
			return this.show_new();
		}

		if (route.length === 2) {
			const contact_id = route[1];
			return this.show_details(contact_id);
		}
	}

	show_list() {
		$(".contacts-list-view").removeClass("d-none");
		$(".contacts-details-view").addClass("d-none");
		$(".new-contacts").addClass("d-none");
		this.setPageTitle("Contacts");
		this.setActiveSidebar();

		setTimeout(() => {
			try {
				this.bindActionDropdown();
				this.bindContactRowClick();
				this.bindRowSelectionHandler();
				this.bindPaginationEvents();
				this.bindFilterEvents();
				this.applyRoleBasedActionVisibility();
				this.bindActionDropdownHandler();
				this.applyUrlFilters();
			} catch (err) {
				console.error("Error in show_list bindings:", err);
			}

		}, 200);
	}

	show_details(contact_id) {
		$(".contacts-list-view").addClass("d-none");
		$(".contacts-details-view").removeClass("d-none");
		$(".new-contacts").addClass("d-none");
		this.setPageTitle(`Contacts/${contact_id}`);
		this.setActiveSidebar();
		this.current_contact_id = contact_id;
		this.load_contact_details(contact_id);
	}

	show_new() {
		$(".contacts-list-view").addClass("d-none");
		$(".contacts-details-view").addClass("d-none");
		$(".new-contacts").removeClass("d-none");
		this.setPageTitle("New Contacts");
		this.setActiveSidebar();
		this.bind_contact_form_events();
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

	async fetch_list_data({ reset = false, saved_filters = [], override_filters = {} } = {}) {
		console.log("Fetching contacts list data...", { reset, saved_filters, override_filters });
		return new Promise(async (resolve, reject) => {
			if (!this.page_length) this.page_length = 20;
			if (this._fetch_in_progress) {
				console.log("Fetch already in progress, skipping new fetch.");
				return resolve();
			}
			this._fetch_in_progress = true;
			try {
				if (reset) {
					this.all_contacts = [];
					this.visible_count = 0;
					this.filtered_contacts = [];
				}
				const wrapper = this.page.wrapper[0] || this.page.wrapper;
				const nameVal = wrapper.querySelector('[data-table-filter="name"]');
				const fullnameVal = wrapper.querySelector('[data-table-filter="fullname"]');
				const companyNameVal = wrapper.querySelector('[data-table-filter="customer_name"]');
				const statusVal = wrapper.querySelector('[data-table-filter="status"]');

				this.active_filters.name = override_filters.name !== undefined ? override_filters.name : (nameVal?.value?.trim() || "");
				this.active_filters.fullname = override_filters.fullname !== undefined ? override_filters.fullname : (fullnameVal?.value?.trim() || "");
				this.active_filters.company_name = override_filters.company_name !== undefined ? override_filters.company_name : (companyNameVal?.value?.trim() || "");
				this.active_filters.status = override_filters.status !== undefined ? override_filters.status : (statusVal?.value || "");

				console.log("%c[debug]-> active_filters:", "color: blue;", this.active_filters);
				const normalizedFilters = (saved_filters || []).map(f => {
					if (Array.isArray(f)) {
						const arr = f.length >= 5 ? f.slice(1, 4) : f.slice(0, 3);
						const [field, operatorRaw, valueRaw] = arr;
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
					method: "renewal_module.custom_module.page.contactss.contactss.get_list_data",
					args: {
						start: reset ? 0 : (this.all_contacts ? this.all_contacts.length : 0),
						page_length: this.page_length,
						status: this.active_filters.status || "",
						name: this.active_filters.name || "",
						full_name: this.active_filters.fullname || "",
						company_name: this.active_filters.company_name || "",
						filters: JSON.stringify(filtersPayload)
					},
					callback: (r) => {
						try {
							if (!r || !r.message) {
								console.warn("[loadcontacts]empty response");
								if (reset) {
									this.all_contacts = [];
									this.visible_count = 0;
									this.total_records = 0;
								}
								this.render_rows(true);
								this._fetch_in_progress = false;
								return resolve();
							}
							const { data = [], total = 0 } = r?.message || {};
							console.log("data received:", data, "total:", total);
							this.total_records = Number.isFinite(total) ? parseInt(total, 10) : (data.length || 0);

							if (reset) {
								this.all_contacts = Array.isArray(data) ? data.slice() : [];
							} else if (Array.isArray(data) && data.length) {
								this.all_contacts = [...(this.all_contacts || []), ...data];
							}

							this.visible_count = Math.min((this.all_contacts || []).length, this.total_records || 0);
							if (this.total_records === 0) {
								this.all_contacts = [];
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
							this.filtered_contacts = this.all_contacts.slice();
							this.render_rows(true);
							resolve();
						} catch (err) {
							reject(err);
						}
						finally {
							this._fetch_in_progress = false;
						}
					},
					error: (err) => {
						this._fetch_in_progress = false;
						console.error("contacts fetch_list_data error", err);
						reject(err);
					}
				});
			} catch (err) {
				this._fetch_in_progress = false;
				console.error("contacts fetch_list_data error", err);
				reject(err);
			}
		});
	}

	render_rows(useFiltered = false) {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const tbody = wrapper.querySelector(".contacts-table tbody");
		if (!tbody) return;

		tbody.innerHTML = "";
		const data = useFiltered && this.filtered_contacts ? this.filtered_contacts : (this.all_contacts || []);

		if (!Array.isArray(data) || data.length === 0) {
			tbody.insertAdjacentHTML("beforeend", `
				<tr>
					<td colspan="9" class="text-center text-muted py-4">No contacts found.</td>
				</tr>
			`);
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
		const visible_contacts = data.slice(0, this.visible_count || data.length);
		visible_contacts.forEach((contact) => {
			const tr = document.createElement("tr");
			tr.innerHTML = `
				<td class="checkbox-cell">
					<input class="row-check form-check-input form-check-input-light fs-14 contact-item-check" type="checkbox" data-contact="${this.escapeHtml(contact.name)}">
				</td>
				<td class="contacts-name contact-row-link ellipsis"data-contact="${this.escapeHtml(contact.name)}" title="${this.escapeHtml(contact.full_name)}">${this.escapeHtml(contact.full_name)}</td>
				<td class="ellipsis" title="${this.escapeHtml(contact.email_id)}">${this.escapeHtml(contact.email_id)}</td>
				<td>${contact.status ? `<span class="pill text-white" title="${this.escapeHtml(contact.status)}">${this.escapeHtml(contact.status)}</span>` : "-"}</td>
				<td class="ellipsis" title="${this.escapeHtml(contact.phone || contact.mobile_no)}">${this.escapeHtml(contact.phone || contact.mobile_no)}</td>
				<td class="ellipsis" title="${this.escapeHtml(contact.company_name)}">${this.escapeHtml(contact.company_name)}</td>
				<td class="ellipsis" title="${this.escapeHtml(contact.user)}">${this.escapeHtml(contact.user)}</td>
				<td title="${this.escapeHtml(contact.name)}">${this.escapeHtml(contact.name)}</td>
				<td>
					<div class="d-flex align-items-center justify-content-center gap-1 contact-row-link" data-contact="${this.escapeHtml(contact.name)}"  style="cursor:pointer;">
						<span title="${escapeHtml(contact.modified || "")}">${formatModifiedDate(contact.modified)}</span>
						<span class="d-flex align-items-center gap-1 ml-1" title="${contact.comment_count || 0}">
							<i class="fa fa-comment fs-lg"></i>
							${contact.comment_count || 0}
						</span>
					</div>
				</td>
			`;
			tbody.appendChild(tr);
		});
		const visibleChecks = document.querySelectorAll(".contacts-table tbody .row-check");
		const visibleIds = new Set(Array.from(visibleChecks).map(chk => chk.dataset.contact));


		for (const id of Array.from(this.selected_contacts)) {
			if (!visibleIds.has(id)) {
				this.selected_contacts.delete(id);
			}
		}

		visibleChecks.forEach(chk => {
			const id = chk.dataset.contact;
			const shouldBeChecked = this.selected_contacts.has(id);
			if (chk.checked !== shouldBeChecked) chk.checked = shouldBeChecked;
		});

		function formatModifiedDate(dateString) {
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
		function escapeHtml(s) {
			if (s == null) return "";
			return String(s)
				.replace(/&/g, "&amp;")
				.replace(/</g, "&lt;")
				.replace(/>/g, "&gt;")
				.replace(/"/g, "&quot;")
				.replace(/'/g, "&#039;");
		}

		{
			const table = wrapper.querySelector(".contacts-table");
			const newContactsBtn = wrapper.querySelector("#new-contacts-btn");
			const actionsDropdownEl = wrapper.querySelector("#actions-dropdown");

			if (table) {
				const all = table.querySelectorAll('tbody input[type="checkbox"]').length;
				const checked = table.querySelectorAll('tbody input[type="checkbox"]:checked').length;
				const selectAll = table.querySelector('#contactscheckAll');
				if (selectAll) selectAll.checked = (all > 0 && all === checked);
				// update the action/new-ticket visibility
				this.updateActionBarState(table, newContactsBtn, actionsDropdownEl);
			}
		}
	}


	bindContactRowClick() {
		$(document)
			.off("click", ".contact-row-link")
			.on("click", ".contact-row-link", (e) => {
				const id = e.currentTarget.dataset.contact;

				if (!id) return;

				const qs = window.location.search || "";
				localStorage.setItem("contacts_list_url_filters", qs);
				localStorage.setItem("contacts_page_length", this.page_length);

				console.log("Opening contact:", id);
				frappe.set_route("contactss", id);
			});
	}


	bindFilterEvents() {
		const me = this;
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const nameFilter = wrapper.querySelector('[data-table-filter="name"]');
		const fullNameFilter = wrapper.querySelector('[data-table-filter="fullname"]');
		const companyNameFilter = wrapper.querySelector('[data-table-filter="customer_name"]');
		const statusFilter = wrapper.querySelector('[data-table-filter="status"]');
		const filterButton = wrapper.querySelector('.filter-button');

		if (statusFilter) {
			this.syncPlaceholder(statusFilter);
			statusFilter.onchange = () => {
				this.syncPlaceholder(statusFilter);
			};
		}

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

		me.clearBasicFilterUI = function () {
			const me = this;
			const statusFilter = wrapper.querySelector('#filterStatus');
			const nameFilter = wrapper.querySelector('#filtername');
			const fullNameFilter = wrapper.querySelector('#filterfullname');
			const companyNameFilter = wrapper.querySelector('[data-table-filter="customer_name"]');
			if (statusFilter) statusFilter.value = "";
			if (nameFilter) nameFilter.value = "";
			if (fullNameFilter) fullNameFilter.value = "";
			if (companyNameFilter) companyNameFilter.value = "";
			me.saved_filters = [];
			me.active_filters = {
				status: "",
				name: "",
				fullname: "",
				company_name: ""
			}
			if (statusFilter) {
				const sel = statusFilter;
				function updateSelectColor() {
					if (!sel.value) sel.classList.add("placeholder");
					else sel.classList.remove("placeholder");
				}
				updateSelectColor();
				sel.addEventListener("change", updateSelectColor);
			}
			if (filterButton) {
				const $btn = $(filterButton);
				const $label = $btn.find(".button-label");
				if ($label && $label.length) $label.text("Filter");
			}
		};

		if (statusFilter) statusFilter.addEventListener("change", () => {
			me.active_status = statusFilter.value || "";
			me.fetch_list_data({ reset: true, saved_filters: me.saved_filters });
			this.updateUrlWithFilters(me.saved_filters)
		});

		if (nameFilter) nameFilter.addEventListener("input", () => {
			me.active_name = nameFilter.value?.trim() || "";
			if (!me.active_name) {
				me.saved_filters = [];
			}
			me.fetch_list_data({ reset: true, saved_filters: me.saved_filters });
			updateUrlWithFilters(me.saved_filters);
		});

		if (fullNameFilter) fullNameFilter.addEventListener("input", () => {
			me.active_fullname = fullNameFilter.value?.trim() || "";
			if (!me.active_fullname) {
				me.saved_filters = [];
			}
			me.fetch_list_data({ reset: true, saved_filters: me.saved_filters });
			updateUrlWithFilters(me.saved_filters);
		});

		if (companyNameFilter) companyNameFilter.addEventListener("input", () => {
			me.active_filters.company_name = companyNameFilter.value?.trim() || "";
			if (!me.active_filters.company_name) {
				me.saved_filters = [];
			}
			me.fetch_list_data({ reset: true, saved_filters: me.saved_filters });
			updateUrlWithFilters(me.saved_filters);
		});

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
			await frappe.model.with_doctype("Contact");
			filter_group = new frappe.ui.FilterGroup({
				parent: popover_content,
				doctype: "Contact",
				on_change: function () {
					me.saved_filters = filter_group.get_filters();
					// immediate apply saved filters and reset list
					me.fetch_list_data({ reset: true, saved_filters: me.saved_filters });
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
					filter_group.add_filter("Contact", "name", "=", "", false);
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
			footer.find('.add-filter').off("click").on("click", () => filter_group.add_filter("Contact", "name", "=", "", false));

			// --- Popover: Clear button (explicitly reset UI + state + URL + fetch + close popover)
			footer.find('.clear-filters').off("click").on("click", () => {
				if (filter_group) filter_group.clear_filters();
				me.saved_filters = [];
				//me.clearBasicFilterUI();
				//me._fetch_in_process = false;
				me.fetch_list_data({ reset: true, saved_filters: [] });
				update_filter_button_count($btn, 0);
				updateUrlWithFilters([]);
				closePopover($btn, "clear-filters");
			});

			footer.find('.apply-filters').off("click").on("click", () => {
				if (filter_group) {
					me.saved_filters = filter_group.get_filters();
					me.fetch_list_data({ reset: true, saved_filters: me.saved_filters });
					update_filter_button_count($btn, me.saved_filters.length);
					updateUrlWithFilters(me.saved_filters);
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

		const clearFilterButton = document.querySelector('.filter-x-button');

		if (clearFilterButton) {
			clearFilterButton.addEventListener("click", (e) => {
				me.saved_filters = [];
				me.clearBasicFilterUI();
				me.fetch_list_data({ reset: true, saved_filters: [] });
				update_filter_button_count($(advancedFilterForm).find('.filter-button'), 0);
				localStorage.removeItem('contacts_list_url_filters');
				updateUrlWithFilters([]);
			});
		}
		function update_filter_button_count($btn, count) {
			let $label = $btn.find(".button-label");
			$label.text(count > 0 ? `Filter (${count})` : "Filter");
		}

		function updateUrlWithFilters(filters) {
			try {
				const newUrl = new URL(window.location.href);

				const statusFilter = document.querySelector('[data-table-filter="status"]')?.value || "";
				const nameFilter = document.querySelector('[data-table-filter="name"]')?.value?.trim() || "";
				const fullNameFilter = document.querySelector('[data-table-filter="fullname"]')?.value?.trim() || "";
				const companyNameFilter = document.querySelector('[data-table-filter="customer_name"]')?.value?.trim() || "";
				statusFilter ? newUrl.searchParams.set("status", statusFilter) : newUrl.searchParams.delete("status");
				nameFilter ? newUrl.searchParams.set("name", nameFilter) : newUrl.searchParams.delete("name");
				fullNameFilter ? newUrl.searchParams.set("fullname", fullNameFilter) : newUrl.searchParams.delete("fullname");
				companyNameFilter ? newUrl.searchParams.set("company_name", companyNameFilter) : newUrl.searchParams.delete("company_name");
				// Advanced filters (JSON-encoded)
				if (filters && filters.length) {
					newUrl.searchParams.set("filters", encodeURIComponent(JSON.stringify(filters)));
				} else {
					newUrl.searchParams.delete("filters");
				}
				window.history.replaceState({}, "", newUrl.toString());
			} catch (error) {
				console.error("Failed to update URL with filters:", error);
			}
		}

		setTimeout(() => {
			const filterBtn = $(wrapper).find(".filter-button");
			if (filterBtn.length && me.saved_filters && me.saved_filters.length > 0) {
				update_filter_button_count(filterBtn, me.saved_filters.length);
			}
		}, 50);
	}

	bindPaginationEvents() {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		let pageButtons = wrapper.querySelectorAll(".btn-paging");

		// Remove duplicate listeners
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
				btn.style.color = "white";

				this.page_length = parseInt(btn.dataset.value, 10);
				await this.fetch_list_data({ reset: true });
			});
		});

		// Restore page_length from localStorage or default to 20
		const savedPageLength = localStorage.getItem('contacts_page_length');
		this.page_length = savedPageLength ? parseInt(savedPageLength, 10) : 20;

		// Highlight the correct button based on saved/default page length
		const activeBtn = wrapper.querySelector(`.btn-paging[data-value="${this.page_length}"]`);
		if (activeBtn) {
			activeBtn.classList.add("btn-info", "active-pagination");
			activeBtn.style.backgroundColor = "#6C5CE7";
			activeBtn.style.color = "white";
		}


		// Load More button
		const loadMoreBtn = wrapper.querySelector(".btn-more");
		if (loadMoreBtn) {
			loadMoreBtn.addEventListener("click", async () => {
				loadMoreBtn.classList.add("active-pagination");
				loadMoreBtn.style.backgroundColor = "#E7E5F9";
				loadMoreBtn.style.color = "black";

				await this.fetch_list_data({ reset: false });

				setTimeout(() => {
					loadMoreBtn.classList.remove("active-pagination");
					loadMoreBtn.style.backgroundColor = "";
					loadMoreBtn.style.color = "";
				}, 500);
			});
		}
	}

	bindRowSelectionHandler() {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const table = wrapper.querySelector(".contacts-table");
		const newContactBtn = wrapper.querySelector("#new-contacts-btn");
		const actionsDropdown = wrapper.querySelector("#actions-dropdown");
		if (!table || !newContactBtn || !actionsDropdown) return;

		const selectAll = table.querySelector('#contactscheckAll');
		if (selectAll) {
			selectAll.onchange = (e) => {
				const rows = table.querySelectorAll('tbody input[type="checkbox"]');
				rows.forEach((cb) => {
					cb.checked = e.target.checked;
					const id = cb.dataset.contact;
					if (!id) return;

					if (e.target.checked) {
						this.selected_contacts.add(id);
					} else {
						this.selected_contacts.delete(id);
					}
				});
				this.updateActionBarState(table, newContactBtn, actionsDropdown);
			};
		}

		table.addEventListener('change', (e) => {
			if (!e.target.matches('tbody input[type="checkbox"]')) return;
			const id = e.target.dataset.contact;
			if (!id) return;

			if (e.target.checked) {
				this.selected_contacts.add(id);
			} else {
				this.selected_contacts.delete(id);
			}

			if (selectAll) {
				const total = table.querySelectorAll('tbody input[type="checkbox"]').length;
				const checked = table.querySelectorAll('tbody input[type="checkbox"]:checked').length;
				selectAll.checked = total > 0 && total === checked;
			}

			this.updateActionBarState(table, newContactBtn, actionsDropdown);
		});
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

	updateCounts(visible, total, wrapper) {
		const visibleEl = wrapper.querySelector("#visible-count");
		const totalEl = wrapper.querySelector("#total-count");
		const countHeader = wrapper.querySelector("#count-header");
		if (visibleEl) visibleEl.textContent = (visible || 0).toLocaleString();
		if (totalEl) totalEl.textContent = (total || 0).toLocaleString();
		if (countHeader) countHeader.setAttribute("title", `${(visible || 0).toLocaleString()} of ${(total || 0).toLocaleString()}`);
	}

	applyUrlFilters() {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		let qs = localStorage.getItem('contacts_list_url_filters') || '';
		if (!window.location.search && qs) {
			console.log('Applying saved URL filters to acontacts bar:', qs);
			window.history.replaceState({}, "", window.location.pathname + qs);
		}
		const params = new URLSearchParams(window.location.search);
		const nameVal = params.get("name") || "";
		const fullNameVal = params.get("fullname") || "";
		const statusVal = params.get("status") || "";
		const companyNameVal = params.get("company_name") || "";
		const filters_encoded = params.get("filters") || "";

		const statusSel = wrapper.querySelector('[data-table-filter="status"]');
		const nameSel = wrapper.querySelector('[data-table-filter="name"]');
		const fullNameSel = wrapper.querySelector('[data-table-filter="fullname"]');
		const companyNameSel = wrapper.querySelector('[data-table-filter="customer_name"]');

		if (statusSel) {
			statusSel.value = statusVal;
			this.syncPlaceholder(statusSel);
		}
		if (nameSel) nameSel.value = nameVal;
		if (fullNameSel) fullNameSel.value = fullNameVal;
		if (companyNameSel) companyNameSel.value = companyNameVal;

		if (!this.saved_filters) {
			this.saved_filters = [];
		}
		this.active_filters.status = statusVal;
		this.active_filters.name = nameVal;
		this.active_filters.fullname = fullNameVal;
		this.active_filters.company_name = companyNameVal;
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
				console.error("Failed to decode advanced filters:", e);
			}
		}
		this.saved_filters = restored_saved_filters;
		this.fetch_list_data({ reset: true, saved_filters: restored_saved_filters });
	}

	updateUrlWithFilters() {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		try {
			const newUrl = new URL(window.location.href);
			const nameVal = wrapper.querySelector('#filtername')?.value?.trim() || "";
			const fullNameVal = wrapper.querySelector('#filterfullname')?.value?.trim() || "";
			const statusVal = wrapper.querySelector('#filterStatus')?.value || "";
			const companyNameVal = wrapper.querySelector('[data-table-filter="customer_name"]')?.value?.trim() || "";

			if (nameVal) newUrl.searchParams.set("name", nameVal);
			else newUrl.searchParams.delete("name");

			if (fullNameVal) newUrl.searchParams.set("fullname", fullNameVal);
			else newUrl.searchParams.delete("fullname");

			if (statusVal) newUrl.searchParams.set("status", statusVal);
			else newUrl.searchParams.delete("status");

			if (companyNameVal) newUrl.searchParams.set("company_name", companyNameVal);
			else newUrl.searchParams.delete("company_name");

			window.history.replaceState({}, "", newUrl.toString());
		} catch (err) {
			console.error("Failed to update URL:", err);
		}
	}

	clearUrlFilters() {
		try {
			const newUrl = new URL(window.location.href);
			newUrl.searchParams.delete("name");
			newUrl.searchParams.delete("fullname");
			newUrl.searchParams.delete("status");
			newUrl.searchParams.delete("company_name");
			window.history.replaceState({}, "", newUrl.toString());
		} catch (err) {
			console.error("Failed to clear URL:", err);
		}
	}

	bindActionDropdown() {
		$(document).off("click.msgclose");
		$(document).on("click.msgclose", ".btn-modal-close", function (e) {
			e.preventDefault();
			e.stopPropagation();
			if (frappe.msg_dialog && frappe.msg_dialog.hide) {
				frappe.msg_dialog.hide();
			}
		});
	}

	syncPlaceholder(select) {
		if (!select) return;
		if (!select.value) select.classList.add("placeholder");
		else select.classList.remove("placeholder");
	}

	escapeHtml(value) {
		if (value == null) return "";
		return String(value)
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&#039;");
	}

	debounce(fn, wait = 200) {
		let t;
		return (...args) => {
			clearTimeout(t);
			t = setTimeout(() => fn.apply(this, args), wait);
		};
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
		// Fetch current logged-in user's roles
		const roles = frappe.user_roles || [];
		// Mapping: action → roles allowed
		const roleBasedRules = {
			"delete": ["Administrator", "System Manager"],
			"edit": ["Administrator", "Support Manager", "System Manager", "L1 - Tech Support", "Tech Support", "L2 - Tech Support", "L3 - Tech Support"],
			"assign_to": ["Administrator", "Support Manager", "System Manager", "L1 - Tech Support", "Tech Support", "L2 - Tech Support", "L3 - Tech Support"],
			"apply_rule": ["Administrator", "System Manager"],
			"add_tags": ["Administrator", "Support Manager", "System Manager", "L1 - Tech Support", "Tech Support", "L2 - Tech Support", "L3 - Tech Support"],
			"print": ["Administrator", "Support Manager", "System Manager", "L1 - Tech Support", "Tech Support", "L2 - Tech Support", "L3 - Tech Support"],
			"export": ["Administrator", "System Manager"]
		};

		// Loop & hide disallowed action items
		Object.keys(roleBasedRules).forEach(action => {
			const allowedRoles = roleBasedRules[action];
			const item = wrapper.querySelector(`.dropdown-item[data-action="${action}"]`);
			if (!item) return;
			// Check whether user has ANY allowed role
			const allowed = roles.some(r => allowedRoles.includes(r));
			if (!allowed) {
				item.style.display = "none";   // hide
			} else {
				item.style.display = "";       // show
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
			const checkedBoxes = document.querySelectorAll('.contacts-table tbody .row-check:checked');
			if (!checkedBoxes.length) {
				frappe.msgprint(__("Please select at least one Contact"));
				return;
			}
			// ✔ Extract contact IDs from selected checkboxes
			const contacts = Array.from(checkedBoxes)
				.map(cb => cb.dataset.contact)
				.filter(Boolean);

			if (!contacts.length) {
				frappe.msgprint(__("No valid Contact IDs found."));
				return;
			}

			const doctype = "Contact";
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
						primary_action_label: __("Update {0} Contacts", [contacts.length]),
						primary_action() {
							const fieldname = d.get_value("fieldname");
							if (!d.__value_control) {
								frappe.msgprint(__("Please enter a value"));
								return;
							}

							const value = d.__value_control.get_value();
							d.hide();

							me.bulkUpdate(contacts, { fieldname, value });
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
					__("Delete {0} selected Contacts?", [contacts.length]),
					() => {
						Promise.all(
							contacts.map(name =>
								frappe.call({
									method: "frappe.client.delete",
									args: { doctype, name }
								})
							)
						).then(() => {
							frappe.show_alert({ message: __("Contacts deleted"), indicator: "red" });
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
				let d = new frappe.ui.form.AssignToDialog({ doctype, docname: contacts[0] });

				d.dialog.set_primary_action(__("Assign"), () => {
					const values = d.dialog.get_values();
					if (!values) return;
					d.dialog.hide();

					const calls = contacts.map(name =>
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
						let promises = contacts.map(name =>
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

				const calls = contacts.map(name =>
					frappe.call({
						method: "renewal_module.custom_module.page.contactss.contactss.apply_assignment_rule",
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
		const newBtn = wrapper.querySelector("#new-contacts-btn");
		const actionsDropdown = wrapper.querySelector("#actions-dropdown");

		if (newBtn && actionsDropdown) {
			newBtn.classList.remove("d-none");
			actionsDropdown.classList.add("d-none");
		}

		// Clear contact selections
		this.selected_contacts.clear();

		// Uncheck everything in DOM
		const checkboxes = document.querySelectorAll('.contacts-table tbody .row-check');
		checkboxes.forEach(cb => (cb.checked = false));

		const selectAllCheckbox = document.querySelector("#contactscheckAll");
		if (selectAllCheckbox) selectAllCheckbox.checked = false;
	}


	bulkUpdate(contacts, updates) {
		return new Promise((resolve, reject) => {
			if (!contacts.length) return resolve();

			frappe.dom.freeze(__("Updating Contacts..."));

			const promises = contacts.map(name =>
				frappe.call({
					method: "frappe.client.set_value",
					args: {
						doctype: "Contact",
						name,
						fieldname: updates.fieldname,
						value: updates.value
					}
				})
			);

			Promise.allSettled(promises)
				.then(async () => {
					frappe.dom.unfreeze();
					frappe.show_alert({ message: __("Contacts updated successfully"), indicator: "green" });

					this.resetActionBar();

					// 👇 Refresh list once instead of twice
					await this.refreshAllData();

					resolve();
				})
				.catch((err) => {
					frappe.dom.unfreeze();
					console.error("Contact Bulk update failed:", err);
					reject(err);
				});
		});
	}

	async refreshAllData() {
		try {
			// Reset pagination + reload the list
			await this.fetch_list_data({
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

	openContactEditDialog({
		contactId,
		title = __("Edit Contact"),
		onAfterSave = null
	} = {}) {
		if (!contactId) {
			frappe.msgprint(__("Contact not found"));
			return;
		}

		const doctype = "Contact";
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
				primary_action_label: __("Update Contact"),
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
							name: contactId,
							fieldname,
							value
						},
						callback: () => {
							frappe.show_alert({ message: __("Contact updated successfully"), indicator: "green" });
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

	/***details view */

	load_contact_details(contact_name) {
		const me = this;
		frappe.call({
			method: "frappe.client.get",
			args: {
				doctype: "Contact",
				name: contact_name
			},
			error: function () {
				// frappe.call already shows the backend permission error
				// redirect back to list view
				frappe.set_route("contactss");
				if (me.show_list) me.show_list();
			},
			callback: function (r) {
				if (!r.message) {
					console.warn("Contact details not found for:", contact_name);
					frappe.set_route("contactss");
					if (me.show_list) me.show_list();
					return;
				}

				const profileSummaryWrapper = me.page.wrapper[0].querySelector('#contact-profile-summary');
				const contactdetailswrapper = me.page.wrapper[0].querySelector('#contact-details-contact-table');
				const contactemaildetailswrapper = me.page.wrapper[0].querySelector('#contact-email-details-table');
				const contactlinksdetailswrapper = me.page.wrapper[0].querySelector('#contact-links-details-table');

				if (!profileSummaryWrapper) {
					console.warn("Contact profile summary wrapper not found in DOM.");
					return;
				}

				const contact = r.message;
				console.log("Loaded contact details:", contact);
				$(me.page.wrapper)
					.off("click.contact-main-edit")
					.on("click.contact-main-edit", "#edit-contact-details-btn", function (e) {
						e.preventDefault();
						e.stopPropagation();
						me.openContactEditDialog({
							contactId: contact.name || contact_name,
							title: __("Edit Contact Details"),
							onAfterSave: () => me.load_contact_details(contact.name || contact_name)
						});
					});

				const ensureProtocol = (url) => {
					if (!url) return '';
					url = url.trim();
					if (!/^https?:\/\//i.test(url)) {
						return 'https://' + url;
					}
					return url;
				};

				if (profileSummaryWrapper) {
					profileSummaryWrapper.innerHTML = `
					<div class="corporate-card p-4 mb-2 h-100">
						<div class="text-center mb-2 pb-2">
							<div class="profile-avatar mb-3 mx-auto d-flex align-items-center justify-content-center bg-dark text-white rounded-circle fs-3 fw-bold shadow-sm" style="width: 72px; height: 72px;">
								${contact.first_name ? contact.first_name.charAt(0).toUpperCase() : (contact.name ? contact.name.charAt(0).toUpperCase() : 'C')}
							</div>
							<h5 class="fw-semibold mb-1 text-dark fs-5">${frappe.utils.escape_html(contact.full_name || contact.name)}</h5>
							${contact.company_name ? `<p class="text-primary fw-medium mb-2"><i class="fa fa-building-o mr-1"></i>${frappe.utils.escape_html(contact.company_name)}</p>` : ''}
							${contact.status ? `
								<div class="mt-2">
									<span class="badge ${contact.status === 'Open' ? 'bg-success' : 'bg-secondary'} rounded-pill px-3 py-1 fw-medium shadow-sm">${frappe.utils.escape_html(contact.status)}</span>
								</div>
							` : ''}
						</div>
						<div class="d-flex flex-column gap-1">
							${contact.email_id ? `
								<div class="d-flex align-items-center gap-1">
									<div class="contact-info-icon contact-info-icon--email flex-shrink-0">
										<i class="fa fa-envelope-o"></i>
									</div>
									<span class="text-dark fw-medium text-truncate fs-sm" title="${frappe.utils.escape_html(contact.email_id)}">${frappe.utils.escape_html(contact.email_id)}</span>
								</div>` : ''}
							${contact.phone ? `
								<div class="d-flex align-items-center gap-1">
									<div class="contact-info-icon contact-info-icon--phone flex-shrink-0">
										<i class="fa fa-phone"></i>
									</div>
									<span class="text-dark fw-medium text-truncate fs-sm" title="${frappe.utils.escape_html(contact.phone)}">${frappe.utils.escape_html(contact.phone)}</span>
								</div>` : ''}
							${contact.mobile_no && contact.mobile_no !== contact.phone ? `
								<div class="d-flex align-items-center gap-1">
									<div class="contact-info-icon contact-info-icon--phone flex-shrink-0">
										<i class="fa fa-mobile fs-4"></i>
									</div>
									<span class="text-dark fw-medium text-truncate fs-sm" title="${frappe.utils.escape_html(contact.mobile_no)}">${frappe.utils.escape_html(contact.mobile_no)}</span>
								</div>` : ''}
							${contact.user ? `
								<div class="d-flex align-items-center gap-1">
									<div class="contact-info-icon bg-light text-secondary flex-shrink-0" style="border-radius: 8px; width: 28px; height: 28px;">
										<i class="fa fa-user-o"></i>
									</div>
									<span class="text-dark fw-medium text-truncate fs-sm" title="${frappe.utils.escape_html(contact.user)}">${frappe.utils.escape_html(contact.user)}</span>
								</div>` : ''}
							${contact.salutation ? `
								<div class="d-flex align-items-center gap-1">
									<div class="contact-info-icon bg-light text-secondary flex-shrink-0" style="border-radius: 8px; width: 28px; height: 28px;">
										<i class="fa fa-id-badge"></i>
									</div>
									<span class="text-dark fw-medium text-truncate fs-sm" title="${frappe.utils.escape_html(contact.salutation)}">${frappe.utils.escape_html(contact.salutation)}</span>
								</div>` : ''}
							${contact.gender ? `
								<div class="d-flex align-items-center gap-1">
									<div class="contact-info-icon bg-light text-secondary flex-shrink-0" style="border-radius: 8px; width: 28px; height: 28px;">
										<i class="fa fa-venus-mars"></i>
									</div>
									<span class="text-dark fw-medium text-truncate fs-sm" title="${frappe.utils.escape_html(contact.gender)}">${frappe.utils.escape_html(contact.gender)}</span>
								</div>` : ''}
							${contact.address ? `
								<div class="d-flex align-items-center gap-1">
									<div class="contact-info-icon bg-light text-danger flex-shrink-0" style="border-radius: 8px; width: 28px; height: 28px;">
										<i class="fa fa-map-marker"></i>
									</div>
									<span class="text-dark fw-medium fs-sm" title="${frappe.utils.escape_html(contact.address)}">${frappe.utils.escape_html(contact.address).replace(/\n/g, '<br>')}</span>
								</div>` : ''}
							${contact.custom_linked_in ? `
								<div class="d-flex align-items-center gap-1">
									<div class="contact-info-icon contact-info-icon--link flex-shrink-0">
										<i class="fa fa-linkedin-square"></i>
									</div>
									<span class="text-dark fw-medium text-truncate fs-sm" title="${frappe.utils.escape_html(contact.custom_linked_in)}">
										<a href="${ensureProtocol((contact.custom_linked_in))}" class="text-decoration-none text-primary fw-semibold" target="_blank" rel="noopener noreferrer">View Profile</a>
									</span>
								</div>` : ''}
							${contact.is_primary_contact ? `
								<div class="d-flex align-items-center gap-1">
									<div class="contact-info-icon bg-success-subtle text-success flex-shrink-0">
										<i class="fa fa-check-circle"></i>
									</div>
									<span class="text-dark fw-medium text-truncate fs-sm">Primary Contact</span>
								</div>
								` : ''}
							${contact.is_billing_contact ? `
								<div class="d-flex align-items-center gap-1">
									<div class="contact-info-icon bg-info-subtle text-info flex-shrink-0">
										<i class="fa fa-file-text-o"></i>
									</div>
									<span class="text-dark fw-medium text-truncate fs-sm">Billing Contact</span>
								</div>
							`: ""}	
								
						</div>
					</div>
					`;
				}

				// detailsWrapper removed from template - no longer needed


				const phones = Array.isArray(contact.phone_nos) ? contact.phone_nos : [];

				contactdetailswrapper.innerHTML = `
					<div class="corporate-card p-4 h-100 w-100">
						<div class="d-flex align-items-center justify-content-between mb-3 border-bottom pb-2">
							<h6 class="mb-0 text-uppercase fw-bold text-muted fs-xs d-flex align-items-center"><i class="fa fa-phone mr-2"></i>Contact Numbers</h6>
							<button type="button" class="btn btn-xs btn-light text-primary contact-info-action-btn contact-phone-add shadow-sm rounded-pill px-3 d-flex align-items-center">
								<i class="fa fa-plus me-1"></i> Add
							</button>
						</div>

						${phones.length ? `
							<div class="d-flex flex-column gap-2 contact-info-list" style="max-height: 250px; overflow-y: auto;">
								${phones.map((p, index) => `
									<div class="contact-number-card p-2 rounded d-flex align-items-center justify-content-between transition-all border border-light bg-light hover-shadow-sm mb-1">
										<div class="d-flex flex-column gap-1">
											<div class="fw-semibold text-dark d-flex align-items-center gap-2" style="font-size: 13px;">
												${frappe.utils.escape_html(p.phone || "-")}
											</div>
											<div class="d-flex align-items-center gap-1">
												${p.is_primary_phone ? `<span class="badge bg-success-subtle text-success border border-success-subtle rounded-pill" style="font-size: 10px;">Primary Phone</span>` : ``}
												${p.is_primary_mobile_no ? `<span class="badge bg-info-subtle text-info border border-info-subtle rounded-pill" style="font-size: 10px;">Primary Mobile</span>` : ``}
											</div>
										</div>
										<div class="contact-info-actions transition-all">
											<button type="button" class="btn btn-xs btn-icon btn-white rounded-circle contact-info-action-btn contact-phone-edit text-muted me-1 shadow-sm" data-index="${index}" title="Edit"><i class="fa fa-pencil"></i></button>
											<button type="button" class="btn btn-xs btn-icon btn-white rounded-circle contact-info-action-btn contact-phone-delete text-danger shadow-sm" data-index="${index}" title="Delete">
												<i class="fa fa-trash-o"></i>
											</button>
										</div>
									</div>
								`).join("")}
							</div>
						` : `
							<div class="text-center py-4 bg-light rounded-3 border border-dashed border-secondary-subtle">
								<p class="text-muted fs-sm mb-0">No phone numbers available.</p>
							</div>
						`}
					</div>
				`;

				const emails = Array.isArray(contact.email_ids) ? contact.email_ids : [];

				contactemaildetailswrapper.innerHTML = `
					<div class="corporate-card p-4 h-100 w-100">
						<div class="d-flex align-items-center justify-content-between mb-3 border-bottom pb-2">
							<h6 class="mb-0 text-uppercase fw-bold text-muted fs-xs d-flex align-items-center"><i class="fa fa-envelope mr-2"></i>Email Addresses</h6>
							<button type="button" class="btn btn-xs btn-light text-primary contact-info-action-btn contact-email-add shadow-sm rounded-pill px-3 d-flex align-items-center">
								<i class="fa fa-plus me-1"></i> Add
							</button>
						</div>

						${emails.length ? `
							<div class="d-flex flex-column gap-2 contact-info-list" style="max-height: 250px; overflow-y: auto;">
								${emails.map((e, index) => `
									<div class="contact-email-card p-2 rounded d-flex align-items-center justify-content-between transition-all border border-light bg-light hover-shadow-sm mb-1">
										<div class="d-flex flex-column gap-1">
											<div class="fw-semibold text-dark d-flex align-items-center gap-2" style="font-size: 13px;">
												${frappe.utils.escape_html(e.email_id || "-")}
											</div>
											<div class="d-flex align-items-center gap-1">
												${e.is_primary ? `<span class="badge bg-success-subtle text-success border border-success-subtle rounded-pill" style="font-size: 10px;">Primary Email</span>` : ``}
											</div>
										</div>
										<div class="contact-info-actions transition-all">
											<button type="button" class="btn btn-xs btn-icon btn-white rounded-circle contact-info-action-btn contact-email-edit text-muted me-1 shadow-sm" data-index="${index}" title="Edit"><i class="fa fa-pencil"></i></button>
											<button type="button" class="btn btn-xs btn-icon btn-white rounded-circle contact-info-action-btn contact-email-delete text-danger shadow-sm" data-index="${index}" title="Delete">
												<i class="fa fa-trash-o"></i>
											</button>
										</div>
									</div>
								`).join("")}
							</div>
						` : `
							<div class="text-center py-4 bg-light rounded-3 border border-dashed border-secondary-subtle">
								<p class="text-muted fs-sm mb-0">No email addresses available.</p>
							</div>
						`}
					</div>
				`;

				const detailsRoot = me.page.wrapper[0] || me.page.wrapper;
				const saveContactDoc = (doc, successMessage) => {
					frappe.call({
						method: "frappe.client.save",
						args: { doc },
						callback: () => {
							if (successMessage) {
								frappe.show_alert({ message: successMessage, indicator: "green" });
							}
							me.load_contact_details(contact.name);
						},
						error: (err) => {
							frappe.msgprint({
								title: __("Error"),
								message: __(err?.message || err || "Failed to update contact."),
								indicator: "red"
							});
						}
					});
				};
				const waitForConfirmModal = (callback) => {
					let tries = 0;
					const maxTries = 20;

					const check = () => {
						const $modal = $(".modal:visible");
						if ($modal.length) {
							callback($modal);
						} else if (tries < maxTries) {
							tries += 1;
							setTimeout(check, 20);
						}
					};

					check();
				};

				$(detailsRoot).off("click.contact-detail-actions").on("click.contact-detail-actions", ".contact-phone-add", () => {
					const d = new frappe.ui.Dialog({
						title: "Add Phone",
						fields: [
							{ fieldtype: "Data", label: "Phone Number", fieldname: "phone", reqd: 1 },
							{ fieldtype: "Check", label: "Is Primary Phone", fieldname: "is_primary_phone", default: 0 },
							{ fieldtype: "Check", label: "Is Primary Mobile", fieldname: "is_primary_mobile_no", default: 0 }
						],
						primary_action_label: "Add",
						primary_action(values) {
							const number = (values.phone || "").trim();
							if (!number) {
								frappe.msgprint("Please enter a phone number.");
								return;
							}
							const updatedDoc = { ...contact };
							updatedDoc.phone_nos = Array.isArray(updatedDoc.phone_nos) ? updatedDoc.phone_nos.slice() : [];
							if (values.is_primary_phone) {
								updatedDoc.phone_nos = updatedDoc.phone_nos.map(row => ({
									...row, is_primary_phone: 0
								}));
							}
							if (values.is_primary_mobile_no) {
								updatedDoc.phone_nos = updatedDoc.phone_nos.map(row => ({
									...row, is_primary_mobile_no: 0
								}));
							}
							updatedDoc.phone_nos.push({
								phone: number,
								is_primary_phone: values.is_primary_phone ? 1 : 0,
								is_primary_mobile_no: values.is_primary_mobile_no ? 1 : 0
							});
							d.hide();
							saveContactDoc(updatedDoc, "Phone number added.");
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
				})
				$(detailsRoot).off("click.contact-detail-actions", ".contact-phone-edit").on("click.contact-detail-actions", ".contact-phone-edit", (e) => {
					const index = Number(e.currentTarget.dataset.index);
					const rows = Array.isArray(contact.phone_nos) ? contact.phone_nos : [];
					const row = rows[index];
					if (!row) return;
					const d = new frappe.ui.Dialog({
						title: "Edit Phone",
						fields: [
							{ fieldtype: "Data", label: "Phone Number", fieldname: "phone", reqd: 1, default: row.phone },
							{ fieldtype: "Check", label: "Is Primary Phone", fieldname: "is_primary_phone", default: row.is_primary_phone ? 1 : 0 },
							{ fieldtype: "Check", label: "Is Primary Mobile", fieldname: "is_primary_mobile_no", default: row.is_primary_mobile_no ? 1 : 0 }
						],
						primary_action_label: "Save",
						primary_action(values) {
							const number = (values.phone || "").trim();
							if (!number) {
								frappe.msgprint("Please enter a phone number.");
								return;
							}
							const updatedDoc = { ...contact };
							updatedDoc.phone_nos = Array.isArray(updatedDoc.phone_nos) ? updatedDoc.phone_nos.slice() : [];
							if (values.is_primary_phone) {
								updatedDoc.phone_nos = updatedDoc.phone_nos.map(item => ({
									...item,
									is_primary_phone: 0
								}));
							}
							if (values.is_primary_mobile_no) {
								updatedDoc.phone_nos = updatedDoc.phone_nos.map(item => ({
									...item,
									is_primary_mobile_no: 0
								}));
							}
							updatedDoc.phone_nos[index] = {
								...updatedDoc.phone_nos[index],
								phone: number,
								is_primary_phone: values.is_primary_phone ? 1 : 0,
								is_primary_mobile_no: values.is_primary_mobile_no ? 1 : 0
							};
							d.hide();
							saveContactDoc(updatedDoc, "Phone number updated.");
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
				})
				$(detailsRoot).off("click.contact-detail-actions", ".contact-phone-delete").on("click.contact-detail-actions", ".contact-phone-delete", (e) => {
					const index = Number(e.currentTarget.dataset.index);
					frappe.confirm("Delete this phone number?", () => {
						const updatedDoc = { ...contact };
						updatedDoc.phone_nos = Array.isArray(updatedDoc.phone_nos) ? updatedDoc.phone_nos.slice() : [];
						updatedDoc.phone_nos.splice(index, 1);
						saveContactDoc(updatedDoc, "Phone number deleted.");
					});
					waitForConfirmModal(($modal) => {
						const $close = $modal.find(".btn-modal-close");
						$close.off("click.contact-phone-delete").on("click.contact-phone-delete", function (ev) {
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
				})
				$(detailsRoot).off("click.contact-detail-actions", ".contact-email-add").on("click.contact-detail-actions", ".contact-email-add", () => {
					const d = new frappe.ui.Dialog({
						title: "Add Email",
						fields: [
							{ fieldtype: "Data", label: "Email Address", fieldname: "email_id", reqd: 1 },
							{ fieldtype: "Check", label: "Is Primary", fieldname: "is_primary", default: 0 }
						],
						primary_action_label: "Add",
						primary_action(values) {
							const email = (values.email_id || "").trim();
							if (!email) {
								frappe.msgprint("Please enter an email address.");
								return;
							}
							const updatedDoc = { ...contact };
							updatedDoc.email_ids = Array.isArray(updatedDoc.email_ids) ? updatedDoc.email_ids.slice() : [];
							if (values.is_primary) {
								updatedDoc.email_ids = updatedDoc.email_ids.map(row => ({
									...row,
									is_primary: 0
								}));
							}
							updatedDoc.email_ids.push({
								email_id: email,
								is_primary: values.is_primary ? 1 : 0
							});
							d.hide();
							saveContactDoc(updatedDoc, "Email added.");
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
				})
				$(detailsRoot).off("click.contact-detail-actions", ".contact-email-edit").on("click.contact-detail-actions", ".contact-email-edit", (e) => {
					const index = Number(e.currentTarget.dataset.index);
					const rows = Array.isArray(contact.email_ids) ? contact.email_ids : [];
					const row = rows[index];
					if (!row) return;
					const d = new frappe.ui.Dialog({
						title: "Edit Email",
						fields: [
							{ fieldtype: "Data", label: "Email Address", fieldname: "email_id", reqd: 1, default: row.email_id },
							{ fieldtype: "Check", label: "Is Primary", fieldname: "is_primary", default: row.is_primary ? 1 : 0 }
						],
						primary_action_label: "Save",
						primary_action(values) {
							const email = (values.email_id || "").trim();
							if (!email) {
								frappe.msgprint("Please enter an email address.");
								return;
							}
							const updatedDoc = { ...contact };
							updatedDoc.email_ids = Array.isArray(updatedDoc.email_ids) ? updatedDoc.email_ids.slice() : [];
							if (values.is_primary) {
								updatedDoc.email_ids = updatedDoc.email_ids.map(item => ({
									...item,
									is_primary: 0
								}));
							}
							updatedDoc.email_ids[index] = {
								...updatedDoc.email_ids[index],
								email_id: email,
								is_primary: values.is_primary ? 1 : 0
							};
							d.hide();
							saveContactDoc(updatedDoc, "Email updated.");
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
				})
				$(detailsRoot).off("click.contact-detail-actions", ".contact-email-delete").on("click.contact-detail-actions", ".contact-email-delete", (e) => {
					const index = Number(e.currentTarget.dataset.index);
					frappe.confirm("Delete this email address?", () => {
						const updatedDoc = { ...contact };
						updatedDoc.email_ids = Array.isArray(updatedDoc.email_ids) ? updatedDoc.email_ids.slice() : [];
						updatedDoc.email_ids.splice(index, 1);
						saveContactDoc(updatedDoc, "Email deleted.");
					});
					waitForConfirmModal(($modal) => {
						const $close = $modal.find(".btn-modal-close");
						$close.off("click.contact-email-delete").on("click.contact-email-delete", function (ev) {
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
				})
				$(detailsRoot).off("click.contact-detail-actions", ".contact-link-add").on("click.contact-detail-actions", ".contact-link-add", () => {
					const d = new frappe.ui.Dialog({
						title: "Add Linked Document",
						fields: [
							{ fieldtype: "Link", label: "Document Type", fieldname: "link_doctype", options: "DocType", reqd: 1 },
							{ fieldtype: "Dynamic Link", label: "Document Name", fieldname: "link_name", options: "link_doctype", reqd: 1 }
						],
						primary_action_label: "Add",
						primary_action(values) {
							if (!values.link_doctype || !values.link_name) {
								frappe.msgprint("Please select a document type and name.");
								return;
							}
							const updatedDoc = { ...contact };
							updatedDoc.links = Array.isArray(updatedDoc.links) ? updatedDoc.links.slice() : [];

							// Check if this is the first row being added
							const isFirstLink = updatedDoc.links.length === 0;

							updatedDoc.links.push({
								link_doctype: values.link_doctype,
								link_name: values.link_name,
								link_title: values.link_name
							});

							// Auto-populate company_name if first row and link_doctype is Customer
							if (isFirstLink && values.link_doctype === "Customer" && values.link_name) {
								console.log('First Customer link added:', values.link_name);
								if (!updatedDoc.company_name || updatedDoc.company_name.trim() === '') {
									updatedDoc.company_name = values.link_name;
									console.log('Company name auto-populated with:', values.link_name);
								}
							}

							d.hide();
							saveContactDoc(updatedDoc, "Linked document added.");
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
				})
				$(detailsRoot).off("click.contact-detail-actions", ".contact-link-edit").on("click.contact-detail-actions", ".contact-link-edit", (e) => {
					const index = Number(e.currentTarget.dataset.index);
					const rows = Array.isArray(contact.links) ? contact.links : [];
					const row = rows[index];
					if (!row) return;
					const d = new frappe.ui.Dialog({
						title: "Edit Linked Document",
						fields: [
							{ fieldtype: "Link", label: "Document Type", fieldname: "link_doctype", options: "DocType", reqd: 1, default: row.link_doctype },
							{ fieldtype: "Dynamic Link", label: "Document Name", fieldname: "link_name", options: "link_doctype", reqd: 1, default: row.link_name }
						],
						primary_action_label: "Save",
						primary_action(values) {
							if (!values.link_doctype || !values.link_name) {
								frappe.msgprint("Please select a document type and name.");
								return;
							}
							const updatedDoc = { ...contact };
							updatedDoc.links = Array.isArray(updatedDoc.links) ? updatedDoc.links.slice() : [];
							updatedDoc.links[index] = {
								...updatedDoc.links[index],
								link_doctype: values.link_doctype,
								link_name: values.link_name,
								link_title: values.link_name
							};

							// Auto-populate company_name if first row and link_doctype is Customer
							if (index === 0 && values.link_doctype === "Customer" && values.link_name) {
								updatedDoc.company_name = values.link_name;
							}

							d.hide();
							saveContactDoc(updatedDoc, "Linked document updated.");
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
				})
				$(detailsRoot).off("click.contact-detail-actions", ".contact-link-delete").on("click.contact-detail-actions", ".contact-link-delete", (e) => {
					const index = Number(e.currentTarget.dataset.index);
					frappe.confirm("Delete this linked document?", () => {
						const updatedDoc = { ...contact };
						updatedDoc.links = Array.isArray(updatedDoc.links) ? updatedDoc.links.slice() : [];
						const deletedRow = updatedDoc.links[index];

						// Remove company_name if deleting first row with Customer link
						if (index === 0 && deletedRow && deletedRow.link_doctype === "Customer") {
							console.log('Deleting first row Customer link:', deletedRow.link_name);
							updatedDoc.company_name = '';
							console.log('Company name cleared');
						}

						updatedDoc.links.splice(index, 1);
						saveContactDoc(updatedDoc, "Linked document deleted.");
					});
					waitForConfirmModal(($modal) => {
						const $close = $modal.find(".btn-modal-close");
						$close.off("click.contact-link-delete").on("click.contact-link-delete", function (ev) {
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

				});

				const links = Array.isArray(contact.links) ? contact.links : [];
				contactlinksdetailswrapper.innerHTML = `
					<div class="corporate-card p-4 h-100 w-100">
						<div class="d-flex align-items-center justify-content-between mb-3 border-bottom pb-2">
							<h6 class="mb-0 text-uppercase fw-bold text-muted fs-xs d-flex align-items-center"><i class="fa fa-link mr-2"></i>Linked Documents</h6>
							<button type="button" class="btn btn-xs btn-light text-primary contact-info-action-btn contact-link-add shadow-sm rounded-pill px-3 d-flex align-items-center">
								<i class="fa fa-plus me-1"></i> Add
							</button>
						</div>

						${links.length ? `
							<div class="d-flex flex-column gap-2 contact-info-list" style="max-height: 250px; overflow-y: auto;">
								${links.map((link, index) => `
									<div class="contact-link-card p-2 rounded d-flex align-items-center justify-content-between transition-all border border-light bg-light hover-shadow-sm mb-1">
										<div class="d-flex flex-column gap-1">
											<div class="fw-semibold text-dark d-flex align-items-center gap-2" style="font-size: 13px;">
												${frappe.utils.escape_html(link.link_doctype || "-")}
											</div>
											<div class="text-muted small">${frappe.utils.escape_html(link.link_name || "-")}</div>
										</div>
										<div class="contact-info-actions transition-all">
											<button type="button" class="btn btn-xs btn-icon btn-white rounded-circle contact-info-action-btn contact-link-edit text-muted me-1 shadow-sm" data-index="${index}" title="Edit"><i class="fa fa-pencil"></i></button>
											<button type="button" class="btn btn-xs btn-icon btn-white rounded-circle contact-info-action-btn contact-link-delete text-danger shadow-sm" data-index="${index}" title="Delete">
												<i class="fa fa-trash-o"></i>
											</button>
										</div>
									</div>
								`).join("")}
							</div>
						` : `
							<div class="text-center py-4 bg-light rounded-3 border border-dashed border-secondary-subtle">
								<p class="text-muted fs-sm mb-0">No linked documents available.</p>
							</div>
						`}
					</div>
				`;



				// ============================================
				// ACTIVITY TIMELINE AND COMMENTS HANDLING
				// ============================================
				me.loadContactActivityTimeline(contact_name);
				me.bindContactCommentEvents(contact_name);
				me.bindContactEmailHandler(contact_name);
			}
		});
	}

	// ============================================
	// HELPER FUNCTIONS FOR ACTIVITY TIMELINE
	// ============================================

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

	// ============================================
	// ACTIVITY TIMELINE RENDERING
	// ============================================

	loadContactActivityTimeline(contact_name) {
		const me = this;
		frappe.call({
			method: "renewal_module.custom_module.page.contactss.contactss.get_contact_activity",
			args: { contact_name: contact_name },
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

						// ensure any plaintext email addresses are converted into links (ticket timeline does this implicitly for comments)
						try {
							const plainText = $('<div>').html(descriptionHtml).text();
							descriptionHtml = me.linkifyEmails(descriptionHtml, plainText);
						} catch (e) {
							// ignore if jQuery isn't available or other errors
						}

						// append the rendered item and close loops (matches ticket page)
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
					html = `<p class="text-muted text-center">No activity found for this contact.</p>`;
				}

				container.html(html);
			}
		});
	}



	bindContactCommentEvents(contact_name) {
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
				method: "renewal_module.custom_module.page.contactss.contactss.add_contact_comment",
				args: {
					contact_name: contact_name,
					content: finalHtml
				},
				callback: function (r) {
					if (!r.exc) {
						frappe.show_alert({ message: "Comment added", indicator: "green" });
						$("#new-comment-input").html("<p><br></p>");
						me.loadContactActivityTimeline(contact_name);
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
			method: "renewal_module.custom_module.page.contactss.contactss.get_enabled_users",
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

	bindContactEmailHandler(contact_name) {
		const me = this;
		const $emailBtn = $("#email-send");

		if ($emailBtn.length === 0) return;

		$emailBtn.off("click").on("click", async function (e) {
			e.preventDefault();

			// ✅ Helper functions matching ticket.js pattern
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

			// Get contact details
			const contact = await frappe.db.get_doc("Contact", contact_name);
			let email_options = [];

			try {
				const res = await frappe.call({
					method: "renewal_module.custom_module.page.contactss.contactss.get_contact_emails",
					args: { contact_name: contact_name }
				});
				// Convert to email strings (not objects!)
				email_options = (res.message || []).map(normalizeOptionValue).filter(Boolean);
			} catch (err) {
				console.error("Error fetching contact emails:", err);
			}

			// Collect contact's own emails
			const contact_emails = normalizeEmails(
				(contact.contact_emails || []).map(row => row.email_id).concat(contact.email_id || [])
			);

			// Merge all options and deduplicate
			email_options = normalizeEmails([...email_options, ...contact_emails]);

			// Create email dialog with proper formatting
			const email_dialog = new frappe.ui.Dialog({
				title: __("Send Email"),
				fields: [
					{
						label: __("TO"),
						fieldname: "recipients",
						fieldtype: "MultiSelect",
						reqd: 1,
						options: email_options,  // ✅ Array of email strings
						default: contact_emails,  // ✅ Array (not comma-string)
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
						options: email_options  // ✅ Array of email strings
					},
					{
						label: __("BCC"),
						fieldname: "bcc",
						fieldtype: "MultiSelect",
						options: email_options,  // ✅ Array of email strings
						hidden: 1
					},
					{
						label: __("Subject"),
						fieldname: "subject",
						fieldtype: "Data",
						reqd: 1,
						default: ""
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
					// ✅ Proper MultiSelect value handling
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

					// ✅ Get attachments
					let attachments = Array.isArray(email_dialog.__attachments) ? email_dialog.__attachments : [];

					frappe.call({
						method: "renewal_module.custom_module.page.contactss.contactss.send_contact_email",
						args: {
							contact_name: contact_name,
							recipients: recipientsList.join(", "),
							cc: ccList.join(", "),
							bcc: bccList.join(", "),
							subject: values.subject,
							content: values.content,
							attachments: attachments,  // ✅ Pass attachments
							send_me_a_copy: values.send_me_a_copy || 0  // ✅ Pass send_me_a_copy
						},
						freeze_message: __("Sending email..."),
						callback: function (r) {
							if (!r.exc) {
								frappe.show_alert({ message: __("Email sent successfully"), indicator: "green" });
								email_dialog.hide();
								me.loadContactActivityTimeline(contact_name);
							} else {
								frappe.msgprint(__("Failed to send email."));
							}
						}
					});
				}
			});

			// ✅ Initialize attachments tracking
			email_dialog.__attachments = [];

			// ✅ Helper functions for attachment management
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

			// ✅ Add attachments button handler
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

			// ✅ Remove attachment handler
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

			// ✅ Add CC/BCC link handlers - MUST be after dialog.show() and MUST have e.preventDefault()
			email_dialog.$wrapper.find(".add-cc").on("click", function (e) {
				e.preventDefault();
				const cc_field = email_dialog.get_field("cc");
				cc_field.df.hidden = 0;  // make visible
				cc_field.refresh();
				$(this).hide();
			});

			email_dialog.$wrapper.find(".add-bcc").on("click", function (e) {
				e.preventDefault();
				const bcc_field = email_dialog.get_field("bcc");
				bcc_field.df.hidden = 0;  // make visible
				bcc_field.refresh();
				$(this).hide();
			});

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
			$(document).off("click.msgprintclose").on("click.msgprintclose", ".msgprint-dialog .btn-modal-close, .msgprint-dialog .modal-header .close", function (e) {
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


	/**new contact Form */
	bind_contact_form_events() {
		const me = this;
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const contactForm = wrapper.querySelector('#new-contacts-form');
		if (!contactForm) return;

		let firstnameControl = frappe.ui.form.make_control({
			parent: document.getElementById('first-name-field'),
			df: { fieldtype: 'Data', label: 'First Name', reqd: 1, fieldname: 'first_name' },
			render_input: true
		});
		firstnameControl.refresh();

		let middlenameControl = frappe.ui.form.make_control({
			parent: document.getElementById('middle-name-field'),
			df: { fieldtype: 'Data', label: 'Middle Name', fieldname: 'middle_name' },
			render_input: true
		});
		middlenameControl.refresh();

		let lastnameControl = frappe.ui.form.make_control({
			parent: document.getElementById('last-name-field'),
			df: { fieldtype: 'Data', label: 'Last Name', reqd: 1, fieldname: 'last_name' },
			render_input: true
		});
		lastnameControl.refresh();

		let designationControl = frappe.ui.form.make_control({
			parent: document.getElementById('designation-field'),
			df: { fieldtype: 'Data', label: 'Designation', fieldname: 'designation' },
			render_input: true
		});
		designationControl.refresh();

		let companyControl = "";

		let salutationControl = frappe.ui.form.make_control({
			parent: document.getElementById('salutation-field'),
			df: {
				fieldtype: 'Link',
				label: 'Salutation',
				fieldname: 'salutation',
				options: 'Salutation'
			},
			render_input: true
		});
		salutationControl.refresh();

		let genderControl = frappe.ui.form.make_control({
			parent: document.getElementById('gender-field'),
			df: {
				fieldtype: 'Link',
				label: ' Gender',
				fieldname: 'gender',
				options: 'Gender'
			},
			render_input: true
		});
		genderControl.refresh();

		let departmentControl = frappe.ui.form.make_control({
			parent: document.getElementById('department-field'),
			df: { fieldtype: 'Data', label: 'Department', fieldname: 'department' },
			render_input: true
		});
		departmentControl.refresh();

		let linkedInControl = frappe.ui.form.make_control({
			parent: document.getElementById('linked-in-field'),
			df: { fieldtype: 'Data', label: 'LinkedIn ID', fieldname: 'custom_linkedin_id' },
			render_input: true
		});
		linkedInControl.refresh();

		let addressControl = frappe.ui.form.make_control({
			parent: document.getElementById('address-field'),
			df: { fieldtype: 'Link', label: 'Address', fieldname: 'address', options: 'Address' },
			render_input: true
		});
		addressControl.refresh();

		let isPrimaryControl = frappe.ui.form.make_control({
			parent: document.getElementById('is-primary-contact-field'),
			df: { fieldtype: 'Check', label: 'Is Primary Contact', fieldname: 'is_primary_contact' },
			render_input: true
		});
		isPrimaryControl.refresh();

		let isBillingControl = frappe.ui.form.make_control({
			parent: document.getElementById('is-billing-contact-field'),
			df: { fieldtype: 'Check', label: 'Is Billing Contact', fieldname: 'is_billing_contact' },
			render_input: true
		});
		isBillingControl.refresh();

		function setupContactPersonSection(me) {
			const addButton = wrapper.querySelector('#add-contact-person');
			const contactEmailContainer = wrapper.querySelector('#contact-email-container');

			if (!addButton || !contactEmailContainer) return;

			let contactList = [];

			function renderContactPersons() {
				if (!contactList.length) {
					contactEmailContainer.innerHTML = '<p class="text-muted">No emails added.</p>';
					return;
				}
				let html = "";
				contactList.forEach((row, i) => {
					const email = (row.user_email || '');
					const isPrimary = row.is_primary ? 'badge-success' : 'badge-secondary';
					html += `
						<div class="contact-person-entry align-items-center mb-2 p-2 border rounded">
							<strong class="text-truncate">${email}</strong>
							<span class="badge ${isPrimary}">${row.is_primary ? 'Primary' : ''}</span>
							<button class="btn btn-sm btn-default2 remove-contact-person-btn" data-index="${i}">
								<i class="fa fa-trash-can text-danger"></i>
							</button>
						</div>
					`;
				});
				contactEmailContainer.innerHTML = html;
			}

			$(document).off('click.contact-person', '.remove-contact-person-btn');
			$(document).on('click.contact-person', '.remove-contact-person-btn', function (e) {
				e.preventDefault();
				const index = $(this).data('index');
				if (index >= 0 && index < contactList.length) {
					contactList.splice(index, 1);
					renderContactPersons();
				}
			});

			me.getcontactlist = () => contactList;
			me.resetContactList = function () {
				contactList = [];
				renderContactPersons();
			}
			me.setContactList = function (list) {
				contactList = list || [];
				renderContactPersons();
			}

			$(addButton).off('click.add-contact').on('click.add-contact', function (e) {
				e.preventDefault();
				const d = new frappe.ui.Dialog({
					title: 'Add Email',
					fields: [
						{ fieldtype: 'Data', label: 'Email Address', fieldname: 'email_id', reqd: 1 },
						{ fieldtype: 'Check', label: 'Is Primary', fieldname: 'is_primary', default: 0 }
					],
					primary_action_label: 'Add',
					primary_action(values) {
						if (!values.email_id) {
							frappe.msgprint('Please enter an email address.');
							return;
						}
						// Check if email already exists
						if (contactList.some(c => c.user_email === values.email_id)) {
							frappe.msgprint('This email already added.');
							return;
						}
						contactList.push({
							user_email: values.email_id,
							is_primary: values.is_primary ? 1 : 0
						});
						renderContactPersons();
						d.hide();
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
			// Initial render
			renderContactPersons();
		}

		// Phone section: add/list phones with type and primary flags
		function setupContactPhoneSection(me) {
			const addPhoneBtn = wrapper.querySelector('#add-contact-phone');
			const phoneContainer = wrapper.querySelector('#contact-phone-container');
			if (!addPhoneBtn || !phoneContainer) return;

			let phoneList = [];

			function renderPhones() {
				if (!phoneList.length) {
					phoneContainer.innerHTML = '<p class="text-muted">No phone numbers added.</p>';
					return;
				}
				let html = '';
				phoneList.forEach((row, i) => {
					const number = row.phone || '';
					const badges = [];
					if (row.is_primary_phone) badges.push('<span class="badge badge-success text-truncate">Primary Phone</span>');
					if (row.is_primary_mobile_no) badges.push('<span class="badge badge-success text-truncate">Primary Mobile</span>');

					html += `
						<div class="contact-phone-entry align-items-center mb-2 p-2 border rounded">
							<strong>${frappe.utils.escape_html(number)}</strong>
							${badges.join(' ')}
							<button class="btn btn-sm btn-default2 remove-contact-phone-btn" data-index="${i}">
								<i class="fa fa-trash-can text-danger"></i>
							</button>
						</div>
					`;
				});
				phoneContainer.innerHTML = html;
			}

			$(document).off('click.contact-phone', '.remove-contact-phone-btn');
			$(document).on('click.contact-phone', '.remove-contact-phone-btn', function (e) {
				e.preventDefault();
				const index = $(this).data('index');
				if (index >= 0 && index < phoneList.length) {
					phoneList.splice(index, 1);
					renderPhones();
				}
			});

			me.getphonelist = () => phoneList;
			me.resetPhoneList = function () {
				phoneList = [];
				renderPhones();
			}
			me.setPhoneList = function (list) {
				phoneList = Array.isArray(list) ? list.slice() : [];
				renderPhones();
			}

			$(addPhoneBtn).off('click.add-phone').on('click.add-phone', function (e) {
				e.preventDefault();

				const dialog = new frappe.ui.Dialog({
					title: 'Add Phone',
					fields: [
						{ fieldtype: 'Data', label: 'Phone Number', fieldname: 'phone', reqd: 1 },
						{ fieldtype: 'Check', label: 'Is Primary Phone', fieldname: 'is_primary_phone', default: 0 },
						{ fieldtype: 'Check', label: 'Is Primary Mobile', fieldname: 'is_primary_mobile_no', default: 0 }
					],
					primary_action_label: 'Add',
					primary_action(values) {
						const number = (values.phone || '').trim();
						const is_primary_phone = !!values.is_primary_phone ? 1 : 0;
						const is_primary_mobile_no = !!values.is_primary_mobile_no ? 1 : 0;

						if (!number) {
							frappe.msgprint('Please enter a phone number.');
							return;
						}

						// Basic phone validation: digits, spaces, +, -, (), starting optional +
						const phoneRegex = /^\+?[0-9\-()\s]{6,}$/;
						if (!phoneRegex.test(number)) {
							frappe.msgprint('Please enter a valid phone number.');
							return;
						}

						// Enforce single primary per type
						if (is_primary_phone) {
							phoneList = phoneList.map(p => ({
								...p,
								is_primary_phone: (p.type === 'Phone') ? 0 : p.is_primary_phone
							}));
						}
						if (is_primary_mobile_no) {
							phoneList = phoneList.map(p => ({
								...p,
								is_primary_mobile_no: (p.type === 'Mobile') ? 0 : p.is_primary_mobile_no
							}));
						}

						phoneList.push({ phone: number, is_primary_phone, is_primary_mobile_no });
						renderPhones();
						dialog.hide();
					}
				});

				dialog.show();
				setTimeout(() => {
					const closeBtn = dialog.get_close_btn();
					if (closeBtn && closeBtn.length) {
						closeBtn.off('click.dialog').on('click.dialog', function () { dialog.hide(); });
					}
				}, 50);
			});

			// Initial render
			renderPhones();
		}

		function setuprefrencelink() {
			const referenceLinkControl = wrapper.querySelector('#add-reference-link');
			const referenceLinkField = wrapper.querySelector('#reference-link-container');

			if (!referenceLinkControl || !referenceLinkField) return;

			let isLinkSet = [];

			function renderReferenceLink() {
				if (!isLinkSet.length) {
					referenceLinkField.innerHTML = '<p class="text-muted">No reference link set.</p>';
					return;
				}

				let html = "";
				isLinkSet.forEach((row, i) => {
					html += `
						<div class="reference-link-entry align-items-center mb-2 p-2 border rounded">
							<strong class="text-truncate">${frappe.utils.escape_html(row.link_doctype || "")}</strong>
							<small class="text-muted text-truncate">${frappe.utils.escape_html(row.link_name || "")}</small>
							<button class="btn btn-sm btn-default2 remove-reference-link-btn" data-index="${i}">
								<i class="fa fa-trash-can text-danger"></i>
							</button>
						</div>
					`;
				});

				referenceLinkField.innerHTML = html;
			}

			$(document).off('click.reference-link', '.remove-reference-link-btn');
			$(document).on('click.reference-link', '.remove-reference-link-btn', function (e) {
				e.preventDefault();
				const index = $(this).data('index');
				if (index >= 0 && index < isLinkSet.length) {
					isLinkSet.splice(index, 1);
					renderReferenceLink();
				}
			});

			// Public helpers
			/*referenceLinkControl.getreflinklist = () => isLinkSet;
			referenceLinkControl.resetreflinklist = () => {
				isLinkSet = [];
				renderReferenceLink();
			};
			referenceLinkControl.setreflinklist = (list) => {
				isLinkSet = Array.isArray(list) ? list : [];
				renderReferenceLink();
			};*/

			me.getreflinklist = () => isLinkSet;
			me.resetreflinklist = () => {
				isLinkSet = [];
				renderReferenceLink();
			};
			me.setreflinklist = (list) => {
				isLinkSet = Array.isArray(list) ? list : [];
				renderReferenceLink();
			};


			$(referenceLinkControl)
				.off('click.add-reference-link')
				.on('click.add-reference-link', function (e) {
					e.preventDefault();

					const d = new frappe.ui.Dialog({
						title: 'Add Reference Link',
						fields: [
							{
								fieldtype: 'Link',
								label: 'Link Document Type',
								fieldname: 'link_doctype',
								options: 'DocType',
								reqd: 1
							},
							{
								fieldtype: 'Dynamic Link',
								label: 'Link Name',
								fieldname: 'link_name',
								options: 'link_doctype',
								reqd: 1,
								onChange: function (field) {
									const link_name = field.get_value();
									if (link_name) {
										// Update read-only field directly by manipulating the DOM
										const titleField = d.fields_dict.link_title;
										if (titleField && titleField.$wrapper) {
											titleField.$wrapper.find('.static-area').text(link_name);
										}
									} else {
										// Clear the read-only field
										const titleField = d.fields_dict.link_title;
										if (titleField && titleField.$wrapper) {
											titleField.$wrapper.find('.static-area').text('');
										}
									}
								}
							},
							{
								fieldtype: 'Read Only',
								label: 'Link Title',
								fieldname: 'link_title',
								hidden: true // Hide this field as it's just for display and not meant to be edited
							}
						],
						primary_action_label: 'Add',
						primary_action(values) {
							if (!values.link_doctype || !values.link_name) {
								frappe.msgprint('Please enter all required fields.');
								return;
							}

							// ✅ Prevent duplicate links
							const exists = isLinkSet.some(
								r =>
									r.link_doctype === values.link_doctype &&
									r.link_name === values.link_name
							);

							if (exists) {
								frappe.msgprint('This reference link is already added.');
								return;
							}

							isLinkSet.push({
								link_doctype: values.link_doctype,
								link_name: values.link_name,
								link_title: values.link_name
							});

							renderReferenceLink();
							d.hide();
						}
					});

					d.show();
					setTimeout(() => {
						const closeBtn = d.get_close_btn();
						if (closeBtn && closeBtn.length) {
							closeBtn.off('click.dialog').on('click.dialog', function () { d.hide(); });
						}
					}, 50);
				});

			renderReferenceLink();
		}





		frappe.after_ajax(() => {
			setupContactPersonSection(me);
			setupContactPhoneSection(me);
			setuprefrencelink(me);
		});
		setupContactPersonSection(me);
		setupContactPhoneSection(me);
		setuprefrencelink(me);

		contactForm.addEventListener('submit', function (e) {
			e.preventDefault();
			const first_name = firstnameControl.get_value();
			const middle_name = middlenameControl.get_value();
			const last_name = lastnameControl.get_value();
			const designation = designationControl.get_value();
			const salutation = salutationControl.get_value();
			const gender = genderControl.get_value();
			const department = departmentControl.get_value();
			const address = addressControl.get_value();
			const custom_linkedin_id = linkedInControl.get_value();
			const is_primary_contact = isPrimaryControl.get_value();
			const is_billing_contact = isBillingControl.get_value();
			const company_name = companyControl ? companyControl.get_value() : '';

			// Basic validation
			if (!first_name || !last_name) {
				frappe.msgprint('Please fill in all required fields.');
				return;
			}

			// Get contact emails and phones from the lists
			const contact_emails = me.getcontactlist ? me.getcontactlist() : [];
			const contact_phones = me.getphonelist ? me.getphonelist() : [];
			const link_references = me.getreflinklist ? me.getreflinklist() : [];
			if (!contact_emails.length) {
				frappe.msgprint('Please add at least one email address.');
				return;
			}
			if (!contact_phones.length) {
				frappe.msgprint('Please add at least one phone number.');
				return;
			}

			// Auto-populate company_name from first reference link if not already set
			let final_company_name = company_name;
			if (link_references.length > 0 && link_references[0].link_name) {
				if (!final_company_name || final_company_name.trim() === "") {
					final_company_name = link_references[0].link_name;
				}
			}

			const new_contact_doc = {
				doctype: 'Contact',
				first_name,
				middle_name,
				last_name,
				email_ids: contact_emails.map(row => ({
					email_id: row.user_email,
					is_primary: row.is_primary
				})),
				phone_nos: contact_phones.map(row => ({
					phone: row.phone,
					is_primary_phone: row.is_primary_phone,
					is_primary_mobile_no: row.is_primary_mobile_no
				})),
				designation,
				company_name: final_company_name,
				salutation,
				gender,
				department,
				address,
				status: 'Open',
				custom_linkedin_id,
				is_primary_contact,
				is_billing_contact,
				links: link_references.map(row => ({
					link_doctype: row.link_doctype,
					link_name: row.link_name,
					link_title: row.link_name || row.link_title
				}))
			};

			console.log('New Contact Data:', new_contact_doc);

			frappe.call({
				method: "frappe.client.insert",
				args: {
					doc: new_contact_doc
				},
				callback: function (response) {
					if (response.message) {
						const contact_name = response.message.name;
						console.log('Contact created with name:', contact_name);
						frappe.show_alert({ message: 'Contact created successfully!', indicator: 'green' }, 5);
						setTimeout(() => {
							frappe.set_route('contactss', contact_name);
						}, 1000);
						contactForm.reset();
					} else {
						frappe.msgprint('Failed to create contact. Please try again.');

					}

				},
				error: (error) => {
					frappe.msgprint({
						title: __("Error"),
						message: __(error?.message || error || "An unexpected error occurred."),
						indicator: "red"
					});
					console.error('Error creating contact:', error);
				}
			})

		})

	}


}
frappe.contacts_page_template = {
	body: `
		<div class="wrapper contacts-wrapper">
			<div class="contacts-list-view d-none">
				<div class="row">
					<div class="col-12">
						<div class="page-title-head d-flex align-items-center">
							<div class="flex-grow-1">
								<h3 class="fs-xl fw-bold m-0">Contacts</h3>
							</div>

							<div class="text-end">
								<ol class="breadcrumb m-0 py-0" style="background-color: transparent;">
									<li class="breadcrumb-item"><a href="javascript: void(0);">CRM</a></li>
									<li class="breadcrumb-item active">Contacts</li>
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
									<input type="text" class="control-select" id="filtername" data-table-filter="name"
										placeholder="id"
										class="form-control" />
									<input type="text" class="control-select" id="filterfullname" data-table-filter="fullname"
										placeholder="Full Name"
										class="form-control" />
									<input type="text" class="control-select" id="filtercustomername" data-table-filter="customer_name"
										placeholder="Customer Name"
										class="form-control" />
								
									<select id="filterStatus" class="control-select placeholder" data-table-filter="status" aria-label="Status">
										<option value="">status</option>
										<option value="Open">Open</option>
										<option value="Passive">Passive</option>
										<option value="Replied">Replied</option>
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
										
									<a id="new-contacts-btn" href="/app/contactss/new-contacts" class="btn btn-sm btn-primary mr-2">
										<i class="fa fa-plus me-1"></i> New Contacts
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

							<div class="table-container mt-2">
								<table id="contactsTable" class="contacts-table">
									<thead>
										<tr>
											<th>
												<input type="checkbox" id="contactscheckAll" />
											</th>
											<th>Full Name</th>
											<th>Email</th>
											<th>Status</th>
											<th>Phone</th>
											<th>Customer</th>
											<th>User Id</th>
											<th>ID</th>
											<th class="text-center ellipsis" id="count-header" title="0 of 0" style="cursor: default;">
												<span id="visible-count">0</span> of <span id="total-count">0</span>
											</th>
										</tr>
									</thead>
									<tbody>
									</tbody>
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

						</div>
					</div>
				</div>

			</div>


			<div class="contacts-details-view d-none">
				<div class="page-title-head d-flex align-items-center">
					<div class="flex-grow-1">
						<h4 class="fs-xl fw-bold m-0">Contact</h4>
					</div>

					<div class="text-end">
						<ol class="breadcrumb m-0 py-0" style="background-color: transparent;">
							<li class="breadcrumb-item"><a href="javascript: void(0);">CRM</a></li>
							<li class="breadcrumb-item"><a href="/app/contactss">Contacts</a></li>
						</ol>
					</div>
				</div>
				<div class="row mt-3">
					<div class="card w-100" style="min-height:80vh;background-color:transparent;border:none;">
						<div class="card-body p-0">
							<div class="d-flex justify-content-between align-items-center mb-1 pl-2 pr-2">
								<h4 class="mb-0 fw-bold text-dark">Contact Details</h4>
								<button type="button" class="btn btn-primary shadow-sm px-3 rounded-pill d-inline-flex align-items-center justify-content-center gap-1" id="edit-contact-details-btn">
									<i class="fa fa-edit d-inline-flex align-items-center"></i>
									<span class="d-inline-flex align-items-center">Edit Profile</span>
								</button>
							</div>

							<div class="row align-items-stretch">
								<!-- Sidebar -->
								<div class="col-12 col-lg-4 col-xl-3 d-flex flex-column pb-4 contact-sidebar">
									<div class="w-100 h-100" id="contact-profile-summary"></div>
								</div>
								
								<!-- Main Content -->
								<div class="col-12 col-lg-8 col-xl-9 d-flex flex-column pb-4">
									<div class="row align-items-stretch mb-2">
										<div class="col-12 col-lg-6 col-xl-6 d-flex flex-column">
											<div id="contact-details-contact-table" class="h-100 w-100 d-flex flex-column"></div>
										</div>
										<div class="col-12 col-xl-6 col-lg-6 d-flex flex-column">
											<div id="contact-email-details-table" class="h-100 w-100 d-flex flex-column"></div>
										</div>
									</div>
									<div id="contact-links-details-table"></div>
									<div id="contact-more-details-container" class="mb-3"></div>

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
						</div>
					</div>
				</div>
			</div>
			<div class="new-contacts d-none">
				<div class="row">
					<div class="col-12">
						<div class="page-title-head d-flex align-items-center">
							<div class="flex-grow-1">
								<h4 class="fs-xl fw-bold m-0">Contacts</h4>
							</div>

							<div class="text-end">
								<ol class="breadcrumb m-0 py-0" style="background-color: transparent;">
									<li class="breadcrumb-item"><a href="javascript: void(0);">CRM</a></li>
									<li class="breadcrumb-item"><a href="/app/contactss">Contacts</a></li>
								</ol>
							</div>
						</div>
					</div>
				</div>
				
				<div class="row mt-3">
					<div class="card w-100" style="min-height:80vh;">
						<div class="card-body p-2" style="padding:5px;">
							<h5 class="mb-1">New Contacts</h5>
							<form id="new-contacts-form">
								<div class="row">
									<div class="col-12 col-md-6">
										<div class="mb-1">
											<div id="first-name-field"></div>
										</div>
									</div>
								</div>

								<div class="row">
									<div class="col-6">
										<div class="mb-1">
											<div id="last-name-field"></div>
										</div>
									</div>
									<div class="col-6">
										<div class="mb-1">
											<div id="middle-name-field"></div>
										</div>
									</div>
								</div>

								<div class="row mb-1">
									<div class="col-12 col-md-6">
										<label class="control-label">
											Email <span style="color:#eb9091">*</span>
											<i id="add-contact-person" class="fa fa-plus text-primary ml-1" style="cursor:pointer;" title="Add Contact"></i>
										</label>
										<div id="contact-email-container" class="ps-2"></div>
									</div>
									<div class="col-12 col-md-6">
										<label class="control-label">
											Phone <span style="color:#eb9091">*</span>
											<i id="add-contact-phone" class="fa fa-plus text-primary ml-1" style="cursor:pointer;" title="Add Phone"></i>
										</label>
										<div id="contact-phone-container" class="ps-2"></div>
									</div>
								</div>	

								<div class="row mb-1">
									<div class="col-6">
										<div class="mb-1">
											<div id="gender-field"></div>
										</div>
									</div>
									<div class="col-6">
										<div class="mb-1">
											<div id="salutation-field"></div>
										</div>
									</div>
								</div>

								<div class="row mb-1">
									<div class="col-6">
										<div class="mb-1">
											<div id="department-field"></div>
										</div>
									</div>
									<div class="col-6">
										<div class="mb-1">
											<div id="designation-field"></div>
										</div>
									</div>
								</div>

								<div class="row mb-1">
									<div class="col-6">
										<div class="mb-1">
											<div id="address-field"></div>
										</div>
									</div>
									<div class="col-6">	
										<div class="mb-1">
											<div id="linked-in-field"></div>
										</div>
									</div>
								</div>


								<div class="row mb-1">
									<h6 class="mb-2">Reference</h6>
									<div class="col-12">
										<label class="control-label">
											Links <span style="color:#eb9091">*</span>
											<i id="add-reference-link" class="fa fa-plus text-primary ml-1" style="cursor:pointer;" title="Add Link"></i>
										</label>
										<div id="reference-link-container" class="ps-2"></div>
									</div>
								</div>

								<div class="row mb-1">
									<div class="col-6">
										<div id="is-primary-contact-field" class="form-check">
										</div>
									</div>	
									<div class="col-6">
										<div id="is-billing-contact-field" class="form-check">
										</div>	
									</div>
								</div>	

								<div class="row">
									<div class="col-12 text-end">
										<button type="submit" class="btn btn-primary">Save Issue</button>
									</div>
								</div>
							</form>
						</div>
					</div>
				</div>

			</div>

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
};