frappe.pages['contacts'].on_page_load = function (wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'None',
		single_column: true
	});
}

frappe.pages['contacts'].on_page_load = (wrapper) => {
	// 	console.log("on_page_load triggered");
	new contactsPage(wrapper);
};

frappe.router.on('change', () => {
	const route = frappe.get_route();
	const current_page = route[0];
	console.log("Route changed:", route.join("/"));

	if (current_page !== "contacts") {
		console.log("Cleaning up new-issue assets...");
		frappe.contacts_page.cleanup();
	}
	// coming back to issue-theme-details
	if (current_page === "contacts") {
		console.log("Re-initializing new-issue assets...");
		//frappe.issue_theme_details_page.reapply();
		setTimeout(() => {
			frappe.contacts_page.reapply();
		}, 300);

	}
});

if (!window.MycontactsPageDefined) {
	window.MycontactsPageDefined = true;

	class contactsPage {
		constructor(wrapper) {
			this.wrapper = wrapper;
			this.page = frappe.ui.make_app_page({
				parent: wrapper,
				title: '',
				single_column: true
			});

			// paging and state
			this.page_length = 20;
			this.LOAD_MORE_SIZE = 50;
			this.visible_count = 0;
			this.all_contacts = [];
			this.start = 0;
			this.total = 0;
			this.selected_contacts = new Set();
			this.initSelectAll();
			// saved/active filters
			this.saved_filters = [];
			this.active_filters = {
				status: "",
				email_id: "",
				customer_name: "",
				contact_person: "",
				search: ""
			};

			setTimeout(() => {
				this.bindCustomerNameFilter();   // ✅ NOW input exists
			}, 50);
			// internal flags
			this._fetch_in_progress = false;
			// lifecycle flags for filters
			this._filtersPopulated = false;     // true when selects are populated with options
			this._filtersApplied = false;       // true when URL values applied + active_filters synced
			this._filtersInitialized = false;  // true when listeners attached and safe to trigger reloads

			// cache for assets (if you use it)
			this._cache = {
				css: [],
				js: [],
				inlineScripts: [],
				rendered_html: null
			};

			this.make();
			// convenience reference (matches your previous usage)
			frappe.contacts_page = this.createAssetManager ? this.createAssetManager(this, "contacts") : this;
		}

		// ---- lifecycle / UI build ----
		make() {
			if (frappe.contacts_page && frappe.contacts_page.body) {
				$(this.page.main).append(frappe.contacts_page.body);
			}
			// load support page HTML + assets
			this.load_support_page();

			// Controlled startup: populate filters -> apply URL -> attach listeners -> initial load
			setTimeout(async () => {
				try {
					await this.loadFilters();             // populate selects
					this.applyURLFiltersToUI();           // apply URL params into selects & search
					this._filtersPopulated = true;
					this._filtersApplied = true;
					this.bindFilterEvents();              // attach advanced filter popover & clear handlers
					this.bindevents();                    // attach basic listeners (safe now)
					this.attachClearFilterButton();
					this._filtersInitialized = true;      // it's now safe for listeners to call reloadList()
					this.bindActionDropdownHandler();
					// initial load (once)
					this.reloadList();

				} catch (err) {
					console.error("contactsPage.make error:", err);
				}
			}, 200);
		}

		load_support_page() {
			return new Promise((resolve, reject) => {
				frappe.call({
					method: "renewal_module.api.get_support_page",
					callback: (r) => {
						if (r.message && r.message.rendered_html) {
							this.process_and_render_html(r.message.rendered_html);
							resolve();
						} else {
							reject("Support page HTML missing");
						}
					},
					error: (err) => reject(err)
				});
			});
		}

		// main injection function
		async process_and_render_html(html) {
			const temp = document.createElement("div");
			temp.innerHTML = html;

			// --- CSS injection ---
			temp.querySelectorAll('link[href]').forEach(link => {
				const href = link.getAttribute('href');
				if (!href) return;
				if (!this._cache.css.includes(href)) this._cache.css.push(href);

				if (!document.querySelector(`link[href="${href}"][data-contacts="true"]`)) {
					const css = document.createElement('link');
					css.rel = 'stylesheet';
					css.href = href;
					css.dataset.contacts = "true";
					document.head.appendChild(css);
				}
			});

			// --- JS injection ---
			const scriptPromises = [];
			temp.querySelectorAll('script[src]').forEach(script => {
				const src = script.getAttribute('src');
				if (!src) return;
				if (src.toLowerCase().includes("popper")) {
					console.warn("Skipping Popper injection to avoid duplicate loading:", src);
					return;
				}
				if (!this._cache.js.includes(src)) this._cache.js.push(src);

				if (!document.querySelector(`script[src="${src}"][data-contacts="true"]`)) {
					const promise = new Promise((resolve, reject) => {
						const s = document.createElement('script');
						s.src = src;
						s.defer = true;
						s.dataset.contacts = "true";
						s.onload = () => {
							console.log(`Loaded JS: ${src}`);
							resolve(src);
						};
						s.onerror = () => {
							reject(src);
						};
						document.body.appendChild(s);
					});
					scriptPromises.push(promise);
				}
			});

			// --- Inline script collection ---
			this._cache.inlineScripts = this._cache.inlineScripts || [];
			temp.querySelectorAll('script:not([src])').forEach(script => {
				const code = script.textContent?.trim();
				if (code) this._cache.inlineScripts.push(code);
				script.remove();
			});

			this._cache.rendered_html = temp.innerHTML;
			temp.querySelectorAll('style').forEach(styleTag => {
				styleTag.dataset.contacts = "true";
			});

			temp.querySelectorAll('link, script').forEach(tag => tag.remove());

			const $wrapper = $(this.page.main).find('.wrapper');
			const $contentPage = $wrapper.find('.content-page').first();

			if ($contentPage.length) {
				$contentPage.before(temp.innerHTML);
			} else if ($wrapper.length) {
				$wrapper.prepend(temp.innerHTML);
			} else {
				$(this.page.main).prepend(temp.innerHTML);
				console.warn(".wrapper not found, HTML inserted in page.main");
			}

			try {
				await Promise.allSettled(scriptPromises);
				this._cache.inlineScripts.forEach(code => {
					try { new Function(code)(); } catch (err) { console.error("Inline script error:", err); }
				});
				setTimeout(() => {
					this.initialize_theme_scripts();
				}, 800);

			} catch (err) {
				console.error("Script load error:", err);
				this.initialize_theme_scripts();
				setTimeout(() => this.reinit_bootstrap_ui(), 300);
			}
		}

		initialize_theme_scripts() {
			try {
				if (typeof App !== "undefined") new App().init();
				if (typeof LayoutCustomizer !== "undefined") new LayoutCustomizer().init();
				if (typeof Plugins !== "undefined") new Plugins().init();
				if (typeof I18nManager !== "undefined") new I18nManager().init();
			} catch (err) {
				console.error("Theme init failed:", err);
			}
		}

		async loadcontact(opts = false) {
			// normalize opts
			let reset = false;
			let saved_filters = null;
			if (typeof opts === "boolean") {
				reset = opts;
			} else if (typeof opts === "object" && opts !== null) {
				reset = !!opts.reset;
				saved_filters = opts.saved_filters ?? null;
			}

			// if advanced saved_filters passed, store them locally
			if (Array.isArray(saved_filters)) {
				this.saved_filters = saved_filters;
			}

			if (reset) {
				this.start = 0;
				const tbody = document.querySelector("#contact-table-body");
				if (tbody) tbody.innerHTML = "";
			}

			// ensure active_filters reflect the current UI before fetching
			this.updateActiveFilters();

			// Prevent concurrent fetches
			if (this._fetch_in_progress) return;
			this._fetch_in_progress = true;

			try {
				// Always send JSON-encoded string for filters and saved_filters
				const filters_to_send = JSON.stringify(this.active_filters || {});
				const saved_filters_to_send = this.saved_filters && this.saved_filters.length ? JSON.stringify(this.saved_filters) : "";

				const res = await frappe.call({
					method: "renewal_module.custom_module.page.contacts.contacts.get_contact_list",
					args: {
						start: this.start,
						page_length: this.page_length,
						filters: filters_to_send,
						saved_filters: saved_filters_to_send
					}
				});

				const rows = (res && res.message && res.message.rows) ? res.message.rows : [];
				this.total = (res && res.message && res.message.total) ? res.message.total : 0;
				console.log("data received:", rows, "Total:", this.total);

				// append rows to table
				this.renderCustomerRows(rows);

				// Update counts
				const visible = document.querySelectorAll("#contact-table-body tr").length;
				document.getElementById("visible-count").innerHTML = visible.toLocaleString();
				document.getElementById("total-count").innerHTML = this.total.toLocaleString();
				// advance pointer for next load-more call
				this.start += this.page_length;
			} catch (err) {
				console.error("loadcontact error:", err);
			} finally {
				this._fetch_in_progress = false;
			}
		}

		// ---- apply URL params to UI selects / search
		// Called only once after populateFilter() has populated <option> elements
		applyURLFiltersToUI() {
			try {
				const url = new URL(window.location.href);

				// basic filters...
				const email_id = url.searchParams.get("email_id") || "";
				const status = url.searchParams.get("status") || "";
				const customer = url.searchParams.get("customer_name") || "";
				const contact_person = url.searchParams.get("contact_person") || "";
				const search = url.searchParams.get("search") || "";

				// apply basic UI values
				const t = document.querySelector('[data-table-filter="email_id"]');
				if (t && [...t.options].some(o => o.value === email_id)) t.value = email_id;

				const am = document.querySelector('[data-table-filter="status"]');
				if (am && [...am.options].some(o => o.value === status)) am.value = status;

				const cg = document.querySelector('[data-table-filter="customer_name"]');
				if (cg && [...cg.options].some(o => o.value === customer)) cg.value = customer;

				const cn = document.querySelector('[data-table-filter="contact_person"]');
				if (cn) cn.value = contact_person;

				const si = document.querySelector('[data-table-search]');
				if (si) si.value = search;

				// update active filters
				this.active_filters = {
					status: status,
					email_id,
					customer_name: customer,
					contact_person,
					search
				};

				// ---------- RESTORE SAVED FILTERS ----------
				const filterParam = url.searchParams.get("filters");
				if (filterParam) {
					try {
						const decoded = decodeURIComponent(filterParam);
						this.saved_filters = JSON.parse(decoded);
					} catch (e) {
						console.error("Failed to parse saved filters", e);
					}
				}

			} catch (err) {
				console.error("applyURLFiltersToUI error:", err);
			}
		}

		renderCustomerRows(list) {
			if (!list || !Array.isArray(list)) {
				console.warn("renderCustomerRows() received invalid list:", list);
				return;
			}

			const tbody = document.querySelector("#contact-table-body");
			if (!tbody) return;
			//console.log("%c[renderCustomerRows] Adding rows:", "color: green", list.length);

			// build a fragment for performance
			const frag = document.createDocumentFragment();
			list.forEach(c => {
				const tr = document.createElement("tr");
				const checked = this.selected_contacts.has(c.name) ? "checked" : "";

				const avatarHtml = c.image
					? `<img src="${c.image}" class="img-fluid rounded-circle" alt="">`
					: `<span class="avatar-title rounded-circle bg-primary text-white">${this.escapeHtml((c.contact_person || "?").substring(0, 1))}</span>`;

				tr.innerHTML = `
					<td>
						<input class="row-check form-check-input form-check-input-light fs-14 mt-0" type="checkbox" data-id="${c.name}" ${checked}>
					</td>
					<td>
						<div class="d-flex align-items-center gap-2">
							<div class="avatar avatar-sm">${avatarHtml}</div>
							<div>
								<h5 class="mb-0 lh-base fs-base ellipsis" title="${this.escapeHtml(c.contact_person || "")}" style="width:150px;">
									${this.escapeHtml(c.contact_person || "")}
								</h5>
								<p class="text-muted fs-xs mb-0 ellipsis" title="${this.escapeHtml(c.email_id || "")}" style="width:150px;">
									${this.escapeHtml(c.email_id || "")}
								</p>
							</div>
						</div>
					</td>
					<td><span class="badge bg-info-subtle text-info badge-label">${this.escapeHtml(c.status || "Active")}</span></td>
					<td>${this.escapeHtml(c.mobile_no || "")}</td>
					<td>${this.escapeHtml(c.email_id || "")}</td>
					<td>${this.escapeHtml(c.employees || "")}</td>
					<td>${this.escapeHtml(c.status || "")}</td>
					<td>
						<div class="d-flex align-items-center justify-content-center gap-1">
							<span title="${this.escapeHtml(c.modified || "")}">${this.formatModifiedDate(c.modified)}</span>
							<span class="d-flex align-items-center gap-1">
								<i class="ti ti-message-circle fs-lg"></i>
								${c.comment_count || 0}
							</span>
						</div>
					</td>
				`;
				frag.appendChild(tr);
			});

			// Append rows
			tbody.appendChild(frag);

			// --- SYNC / PRUNE against actual visible DOM rows ---
			// Gather visible ids from DOM (this includes any existing rows in the table)
			const visibleChecks = document.querySelectorAll("#contact-table-body .row-check");
			const visibleIds = new Set(Array.from(visibleChecks).map(chk => chk.dataset.id));

			// Remove any selected ids that are no longer visible
			for (const id of Array.from(this.selected_contacts)) {
				if (!visibleIds.has(id)) {
					this.selected_contacts.delete(id);
				}
			}

			// Ensure the DOM checkboxes reflect selected_contacts (important after prune)
			visibleChecks.forEach(chk => {
				const id = chk.dataset.id;
				const shouldBeChecked = this.selected_contacts.has(id);
				// only set property if different to avoid triggering change listeners unnecessarily
				if (chk.checked !== shouldBeChecked) chk.checked = shouldBeChecked;
			});

			this.bindRowCheckboxEvents();
			this.updateSelectAllState();
			this.updateActionBar();
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


		bindRowCheckboxEvents() {
			// select all visible row checkboxes
			const checkboxes = document.querySelectorAll("#contact-table-body .row-check");

			//console.log("%c[bindRowCheckboxEvents] Found row checkboxes:", "color: purple", checkboxes.length);

			checkboxes.forEach(chk => {
				// Avoid attaching multiple listeners to the same element
				if (chk.dataset.listenerAttached === "1") return;

				const handler = (e) => {
					const id = e.target.dataset.id;

					if (e.target.checked) {
						this.selected_contacts.add(id);
						console.log("%c[Row Selected] →", "color: lime", id);
					} else {
						this.selected_contacts.delete(id);
						console.log("%c[Row Unselected] →", "color: orange", id);
					}

					console.log("[Selected Contacts Set]", Array.from(this.selected_contacts));

					// After any single-row change, ensure Select-All reflects the visible rows
					this.updateSelectAllState();
					this.updateActionBar();
				};

				chk.addEventListener("change", handler);
				chk.dataset.listenerAttached = "1";
			});
		}

		updateActionBar() {
			const wrapper = this.page.wrapper[0] || this.page.wrapper;
			const newBtn = wrapper.querySelector("#new-contact-btn");
			const actionsDropdown = wrapper.querySelector("#actions-dropdown");

			if (!newBtn || !actionsDropdown) return;

			if (this.selected_contacts.size > 0) {
				newBtn.classList.add("d-none");
				actionsDropdown.classList.remove("d-none");
			} else {
				newBtn.classList.remove("d-none");
				actionsDropdown.classList.add("d-none");
			}
		}


		initSelectAll() {
			const selectAll = document.querySelector("#checkAll");

			// If not found, retry quietly
			if (!selectAll) {
				setTimeout(() => this.initSelectAll(), 150);
				return;
			}

			// Prevent multiple listeners
			if (selectAll.dataset.listenerAttached === "1") return;
			selectAll.dataset.listenerAttached = "1";

			// Bind event
			selectAll.addEventListener("change", (e) => {
				const checked = e.target.checked;

				const visibleRows = document.querySelectorAll("#contact-table-body .row-check");

				visibleRows.forEach(chk => {
					chk.checked = checked;
					const id = chk.dataset.id;
					if (checked) this.selected_contacts.add(id);
					else this.selected_contacts.delete(id);
				});

				// Prune any stale selections
				const visibleIds = new Set(Array.from(visibleRows).map(chk => chk.dataset.id));
				for (const id of Array.from(this.selected_contacts)) {
					if (!visibleIds.has(id)) this.selected_contacts.delete(id);
				}

				this.updateSelectAllState();
				this.updateActionBar();
			});
		}


		updateSelectAllState() {
			const selectAll = document.querySelector("#checkAll");
			if (!selectAll) return;

			const rows = document.querySelectorAll("#contact-table-body .row-check");

			// NEW FIX 👇
			if (rows.length === 0) {
				selectAll.checked = false;
				return;
			}

			const allSelected = Array.from(rows).every(chk =>
				this.selected_contacts.has(chk.dataset.id)
			);

			//console.log("%c[updateSelectAllState] allSelected =", "color: yellow", allSelected);
			selectAll.checked = allSelected;
		}


		// ---- fetch filter options and populate selects ----
		async loadFilters() {
			try {
				const res = await frappe.call({
					method: "renewal_module.custom_module.page.contacts.contacts.get_contact_filters"
				});
				const filters = (res && res.message) ? res.message : {};

				this.populateFilter("status", filters.status);
				this.populateFilter("email_id", filters.email_id);
				this.populateFilter("customer_name", filters.customer_name);

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
			const wrapper = this.page.wrapper[0] || this.page.wrapper;
			const me = this;
			// only proceed if DOM exists
			if (!wrapper) return;
			// Initialize advancedFilterForm wrapper
			const advancedFilterForm = $(wrapper).find('.advanced-filter-form, .filter-section, .filter-container').first().length
				? $(wrapper).find('.advanced-filter-form, .filter-section, .filter-container').first()
				: $(wrapper);

			me.saved_filters = me.saved_filters || [];

			// Setup the popover handler (keeps most of your original logic)
			advancedFilterForm.find('.filter-button').off('click').on("click", async function (e) {
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
				const filter_group = new frappe.ui.FilterGroup({
					parent: popover_content,
					doctype: "Customer",
					on_change: function () {
						me.saved_filters = filter_group.get_filters();
						// immediate apply saved filters and reset list
						me.loadcontact({ reset: true, saved_filters: me.saved_filters });
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
				footer.find('.add-filter').on("click", () => filter_group.add_filter("Customer", "name", "=", "", false));

				// --- Popover: Clear button (explicitly reset UI + state + URL + fetch + close popover)
				footer.find('.clear-filters').on("click", () => {
					if (filter_group) filter_group.clear_filters();
					me.saved_filters = [];
					me.clearBasicFilterUI();
					me._fetch_in_progress = false;
					me.active_filters = {
						status: "",
						contact_person: "",
						email_id: "",
						customer_name: "",
						search: ""
					};
					me.loadcontact({ reset: true, saved_filters: [] });
					update_filter_button_count($btn, 0);
					updateUrlWithFilters([]);
					closePopover($btn, "clear-filters");
				});

				footer.find('.apply-filters').on("click", () => {
					if (filter_group) {
						me.saved_filters = filter_group.get_filters();
						me.loadcontact({ reset: true, saved_filters: me.saved_filters });
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
					container: "body",
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
				clearFilterButton.removeEventListener("click", this._clearFilterListener);
				clearFilterButton.addEventListener("click", () => {
					this.saved_filters = [];
					this.clearBasicFilterUI();
					this._fetch_in_progress = false;
					this.loadcontact({ reset: true, saved_filters: [] });
					update_filter_button_count($(advancedFilterForm).find('.filter-button'), 0);
					this.updateUrlWithFilters([]);
				});
			}

			// --- Helper ---
			function update_filter_button_count($btn, count) {
				let $label = $btn.find(".button-label");
				$label.text(count > 0 ? `Filter (${count})` : "Filter");
			}

			function updateUrlWithFilters(filters) {
				// re-use instance method for consistent behavior
				me.updateUrlWithFilters(filters || []);
			}
			// --- FIX: Update filter button count on page load ---
			setTimeout(() => {
				const filterBtn = $(wrapper).find(".filter-button");
				if (filterBtn.length && me.saved_filters && me.saved_filters.length > 0) {
					update_filter_button_count(filterBtn, me.saved_filters.length);
				}
			}, 50);
		}

		attachClearFilterButton() {
			const me = this;
			const btn = document.querySelector(".filter-x-button");
			if (!btn) return;

			btn.addEventListener("click", function () {
				const email_idSel = document.querySelector('[data-table-filter="email_id"]');
				const accountSel = document.querySelector('[data-table-filter="status"]');
				const groupSel = document.querySelector('[data-table-filter="customer_name"]');
				const contactNameInput = document.querySelector('input[data-table-filter="contact_person"]');
				const searchInput = document.querySelector('[data-table-search]');

				if (email_idSel) email_idSel.value = "";
				if (accountSel) accountSel.value = "";
				if (groupSel) groupSel.value = "";
				if (contactNameInput) contactNameInput.value = "";
				if (searchInput) searchInput.value = "";

				me.saved_filters = [];
				me.active_filters = {
					email_id: "",
					status: "",
					contact_person: "",
					customer_name: "",
					search: ""
				};

				me.updateUrlWithFilters([]);
				// reload safely (listeners may trigger if initialized)
				if (me._filtersInitialized) me.reloadList();
				else me.loadcontact({ reset: true });

				const filterBtnLabel = document.querySelector(".filter-button .button-label");
				if (filterBtnLabel) filterBtnLabel.textContent = "Filters";
			});
		}

		// Convenience: clear basic UI and internal state
		clearBasicFilterUI() {
			const statusFilter = document.querySelector('[data-table-filter="status"]');
			const emailidFilter = document.querySelector('[data-table-filter="email_id"]');
			const customernameFilter = document.querySelector('[data-table-filter="customer_name"]');
			const contactNameFilter = document.querySelector('input[data-table-filter="contact_person"]');
			const searchInput = document.querySelector('[data-table-search]');

			if (statusFilter) statusFilter.value = "";
			if (emailidFilter) emailidFilter.value = "";
			if (customernameFilter) customernameFilter.value = "";
			if (contactNameFilter) contactNameFilter.value = "";
			if (searchInput) searchInput.value = "";

			this.active_filters = {
				status: "",
				email_id: "",
				customer_name: "",
				contact_person: "",
				search: ""
			};
		}

		// ---- apply filters (programmatic) ----
		async applyFilters() {
			this.start = 0;
			this.active_filters = {
				status: document.querySelector('select[data-table-filter="status"]')?.value || "",
				email_id: document.querySelector('select[data-table-filter="email_id"]')?.value || "",
				customer_name: document.querySelector('select[data-table-filter="customer_name"]')?.value || "",
				contact_person: document.querySelector('input[data-table-filter="contact_person"]')?.value?.trim() || "",
				search: document.querySelector('[data-table-search]')?.value?.trim() || ""
			};

			const tbody = document.querySelector("#contact-table-body");
			if (tbody) tbody.innerHTML = "";
			await this.loadcontact({ reset: true });
		}

		// ---- bind basic events (no initial reload here) ----
		bindCustomerNameFilter() {
			const me = this;
			const input = document.querySelector('input[data-table-filter="contact_name"]');

			if (!input) return;

			// Debounce – prevents too many backend calls while typing
			let timer = null;

			input.addEventListener("input", () => {
				clearTimeout(timer);
				timer = setTimeout(() => {
					me.applyFilters();   // 🔥 Trigger backend refresh
				}, 350);
			});

			// Also trigger on Enter key
			input.addEventListener("keydown", (e) => {
				if (e.key === "Enter") {
					e.preventDefault();
					me.applyFilters();
				}
			});
		}


		// ---- bind basic events (no initial reload here) ----
		bindevents() {
			const me = this;
			// PAGE SIZE SWITCH
			document.querySelectorAll(".btn-paging").forEach(btn => {
				btn.removeEventListener("click", btn._pagingHandler);
				const handler = () => {
					// 1. Update page size
					me.page_length = parseInt(btn.dataset.value, 10) || 20;
					// 2. Highlight clicked button
					document.querySelectorAll(".btn-paging").forEach(b => b.classList.remove("active"));
					btn.classList.add("active");
					// 3. Load data
					if (me._filtersInitialized) me.reloadList();
					else me.loadcontact({ reset: true });
				};
				btn._pagingHandler = handler;
				btn.addEventListener("click", handler);
			});

			// LOAD MORE
			const moreBtn = document.querySelector(".btn-more");
			if (moreBtn) {
				moreBtn.removeEventListener("click", moreBtn._moreHandler);
				const moreHandler = () => {
					// load next page without interfering with initialization state
					me.loadcontact(false);
				};
				moreBtn._moreHandler = moreHandler;
				moreBtn.addEventListener("click", moreHandler);
			}

			// Set default highlight for 20 rows on first load
			const defaultBtn = document.querySelector('.btn-paging[data-value="20"]');
			if (defaultBtn) {
				document.querySelectorAll(".btn-paging").forEach(b => b.classList.remove("active"));
				defaultBtn.classList.add("active");
			}


			// BASIC FILTER DROPDOWNS - change triggers new fetch (only if initialized)
			document.querySelectorAll("select[data-table-filter]").forEach(sel => {
				sel.removeEventListener("change", sel._selHandler);
				const selHandler = () => {
					me.updateActiveFilters();
					if (me._filtersInitialized) me.reloadList();
				};
				sel._selHandler = selHandler;
				sel.addEventListener("change", selHandler);
			});

			// SEARCH typing debounce
			const searchInput = document.querySelector("[data-table-search]");
			if (searchInput) {
				if (searchInput._inputHandler) {
					searchInput.removeEventListener("input", searchInput._inputHandler);
				}
				let typingTimer = null;
				const inputHandler = () => {
					clearTimeout(typingTimer);
					typingTimer = setTimeout(() => {
						me.updateActiveFilters();
						if (me._filtersInitialized) me.reloadList();
					}, 250);
				};
				searchInput._inputHandler = inputHandler;
				searchInput.addEventListener("input", inputHandler);
			}
		}

		// ---- update active_filters object from UI and update URL
		updateActiveFilters() {
			this.active_filters = {
				status: document.querySelector('select[data-table-filter="status"]')?.value || "",
				email_id: document.querySelector('select[data-table-filter="email_id"]')?.value || "",
				customer_name: document.querySelector('select[data-table-filter="customer_name"]')?.value || "",
				contact_person: document.querySelector('input[data-table-filter="contact_person"]')?.value?.trim() || "",
				search: document.querySelector("[data-table-search]")?.value?.trim() || ""
			};

			// persist to URL using unified method
			this.updateUrlWithFilters(this.saved_filters || []);
		}

		// ---- update URL with current basic + advanced filters
		updateUrlWithFilters(filters = []) {
			try {
				const url = new URL(window.location.href);

				const email_id = document.querySelector('[data-table-filter="email_id"]')?.value || "";
				const status = document.querySelector('[data-table-filter="status"]')?.value || "";
				const customer = document.querySelector('[data-table-filter="customer_name"]')?.value || "";
				const contact_person = document.querySelector('[data-table-filter="contact_person"]')?.value?.trim() || "";
				const search = document.querySelector('[data-table-search]')?.value.trim() || "";

				// Basic filters
				email_id ? url.searchParams.set("email_id", email_id) : url.searchParams.delete("email_id");
				status ? url.searchParams.set("status", status) : url.searchParams.delete("status");
				customer ? url.searchParams.set("customer_name", customer) : url.searchParams.delete("customer_name");
				contact_person ? url.searchParams.set("contact_person", contact_person) : url.searchParams.delete("contact_person");
				search ? url.searchParams.set("search", search) : url.searchParams.delete("search");

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

		// ---- reloadList: reset and load (one-time) ----
		reloadList() {
			this.start = 0;
			const tbody = document.querySelector("#contact-table-body");
			if (tbody) tbody.innerHTML = "";
			// loadcontact will update active_filters from UI and call backend
			this.loadcontact(true);
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
				const checkedBoxes = document.querySelectorAll('#contact-table-body .row-check:checked');

				if (!checkedBoxes.length) {
					frappe.msgprint(__("Please select at least one Customer"));
					return;
				}

				// ✔ Extract contact IDs from selected checkboxes
				const contacts = Array.from(checkedBoxes)
					.map(cb => cb.dataset.id)
					.filter(Boolean);

				if (!contacts.length) {
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
							title: __("Bulk Edit Contacts"),
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
				// DELETE Contacts
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
							method: "renewal_module.custom_module.page.contacts.contacts.apply_assignment_rule",
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
							primary_action_label: __("Open {0} Print Views", [contacts.length]),
							primary_action(values) {
								d.hide();
								contacts.forEach(name => {
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
			const newBtn = wrapper.querySelector("#new-contact-btn");
			const actionsDropdown = wrapper.querySelector("#actions-dropdown");

			if (newBtn && actionsDropdown) {
				newBtn.classList.remove("d-none");
				actionsDropdown.classList.add("d-none");
			}

			// Clear contact selections
			this.selected_contacts.clear();

			// Uncheck everything in DOM
			const checkboxes = document.querySelectorAll('#contact-table-body .row-check');
			checkboxes.forEach(cb => (cb.checked = false));

			const selectAllCheckbox = document.querySelector("#checkAll");
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
						frappe.show_alert({ message: __("Contacts updated successfully"), indicator: "green" });

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

		async refreshAllData() {
			try {
				// Reset pagination + reload the list
				await this.loadcontact({
					reset: true
				});

			} catch (err) {
				console.error("[refreshAllData] Failed to refresh:", err);
			}
		}


		createAssetManager(instance) {
			const pageWrapperSelector = () => {
				const pageMain = instance.page && instance.page.main ? instance.page.main : document;
				return $(pageMain).find('.wrapper').get(0);
			};

			return {
				cleanup() {
					console.group("🧹 Cleaning up new-issue assets");
					let removed_css = 0, removed_js = 0, removed_style = 0;

					if (!frappe.contacts_page) frappe.contacts_page = {};
					frappe.contacts_page._inline_styles_backup = [];

					const cache = instance._cache || { css: [], js: [] };
					cache.css.forEach(href => {
						const el = document.querySelector(`link[href="${href}"][data-contacts="true"]`);
						if (el) {
							el.remove();
							removed_css++;
						}
					});

					// fallback: if any leftover support_dashboard.css without tag
					document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
						const href = link.getAttribute('href') || "";
						if (href.includes("contacts.css")) {
							link.remove();
							removed_css++;
						}
					});

					cache.js.forEach(src => {
						const el = document.querySelector(`script[src="${src}"]`);
						const lower_src = src.toLowerCase();
						// Do NOT remove Popper — critical bootstrap dependency
						if (lower_src.includes("popper")) {
							console.warn("Skipping Popper REMOVE — global dependency:", src);
							return;
						}
						if (el) {
							el.remove();
							removed_js++;
						}
					});

					// --- 3. Remove inline <style> tags added dynamically ---
					document.querySelectorAll('style').forEach(el => {
						const text = el.textContent.trim();
						if (text.includes('.contacts') || text.includes('#contacts') || el.dataset.contacts === "true") {
							try {
								frappe.contacts_page._inline_styles_backup.push(text);
							} catch (err) { /* ignore */ }
							el.remove();
							removed_style++;
						}
					});

					// --- 4. Remove injected HTML inside wrapper except .content-page ---
					const wrapperEl = pageWrapperSelector();
					if (wrapperEl) {
						Array.from(wrapperEl.children).forEach(child => {
							if (!child.classList.contains('content-page')) child.remove();
						});
					}

					console.log(`Cleanup completed — removed ${removed_css} CSS, ${removed_js} JS, ${removed_style} inline styles.`);
					console.groupEnd();
				},

				reapply() {
					console.group("Reapplying new-issue assets");
					(instance._cache.css || []).forEach(href => {
						if (!document.querySelector(`link[href="${href}"]`)) {
							const css = document.createElement('link');
							css.rel = 'stylesheet';
							css.href = href;
							css.dataset.contacts = "true";
							document.head.appendChild(css);
						}
					});

					const jsPromises = (instance._cache.js || []).map(src => {
						return new Promise((resolve) => {
							if (document.querySelector(`script[src="${src}"]`)) {
								return resolve();
							}
							const s = document.createElement('script');
							s.src = src;
							s.defer = true;
							s.dataset.contactView = "true";
							s.onload = () => { console.log("Re-loaded JS:", src); resolve(); };
							s.onerror = () => { console.warn("Failed to reload JS:", src); resolve(); };
							document.body.appendChild(s);
						});
					});

					Promise.allSettled(jsPromises).then(() => {
						const wrapperEl = pageWrapperSelector();
						if (wrapperEl) {
							Array.from(wrapperEl.children).forEach(child => {
								if (!child.classList.contains('content-page')) child.remove();
							});

							if (instance._cache.rendered_html) {
								const frag = document.createRange().createContextualFragment(instance._cache.rendered_html);
								const contentEl = wrapperEl.querySelector('.content-page');
								if (contentEl) wrapperEl.insertBefore(frag, contentEl);
								else wrapperEl.prepend(frag);
							}
						}

						(instance._cache.inlineScripts || []).forEach(code => {
							try {
								const fn = new Function(code);
								fn();
							} catch (err) {
								console.error("Inline script re-exec error:", err);
							}
						});

						try {
							instance.initialize_theme_scripts();
						} catch (err) {
							console.error("Error during re-initialize theme scripts:", err);
						}
						setTimeout(() => instance.reinit_bootstrap_ui(), 500);

						console.groupEnd();
					});
				}
			};
		}
	}

	window.contactsPage = contactsPage;
}


frappe.contacts_page = {
	body: `
        <div class="wrapper contacts-wrapper">
			<!-- ============================================================== -->
        	<!-- Start Main Content -->
        	<!-- ============================================================== -->
			<div class="content-page">
				<div class="container-fluid" style="background-color:#F3F4F6;">
					<div class="page-title-head d-flex align-items-center">
						<div class="flex-grow-1">
							<h4 class="fs-xl fw-bold m-0">Contacts</h4>
						</div>

						<div class="text-end">
							<ol class="breadcrumb m-0 py-0">
								<li class="breadcrumb-item"><a href="javascript: void(0);">CRM</a></li>
								<li class="breadcrumb-item active">Contacts</li>
							</ol>
						</div>
					</div>
					
					<div class="row">
						<div class="col-12">
							<div class="card">
								<div class="card-header border-light p-1  filters-wrapper" style="border-bottom:none;">
									<div class="page-form flex flex-wrap align-items-center gap-3 w-100">
										<div class="standard-filter-section flex flex-wrap gap-2 align-items-center">
											<div class="app-search">
												<input type="text" data-table-filter="contact_name"
													placeholder="Contact Person"
													class="form-control" />
											</div>
											<div class="app-search">
												<select data-table-filter="status" class="form-select form-control">
													<option value="">Status</option>
												</select>
											</div>
											<div class="app-search">
												<select data-table-filter="email_id" class="form-select form-control">
													<option value="">Email</option>
												</select>
											</div>
											<div class="app-search">
												<select data-table-filter="customer_name" class="form-select form-control">
													<option value="">Customer</option>
												</select>
											</div>
										</div>
										<div class="action-buttons flex gap-2 flex-wrap ml-auto">
											
											<div class="btn-group">
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
											
											<button class="btn btn-primary" id="new-contact-btn" data-bs-toggle="modal"
												data-bs-target="#addCustomerModal">
												<i class="ti ti-plus me-1"></i> <span class="hidden-xs">New Customer</span>
											</button>
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
								<div class="card-body p-0">
									<div class="table-responsive" style="min-height:50vh;">
										<table class="table table-custom table-centered table-select table-hover w-100 mb-0">
											<thead class="bg-light align-middle bg-opacity-25 thead-sm text-nowrap">
												<tr class="text-uppercase fs-xxs">
													<th scope="col" style="width: 1%;">
														<input data-table-select-all class="form-check-input form-check-input-light fs-14 mt-0" type="checkbox" id="checkAll" value="option">
													</th>
													<th data-table-sort="name">Contact Person</th>
													<th data-table-sort data-column="status">Status</th>
													<th data-table-sort>Mobile No</th>
													<th data-table-sort data-column="Email ID">Email ID</th>
													<th data-table-sort>Employees</th>
													<th class="text-center" id="count" style="cursor: default;">
														<span id="visible-count">0</span> of <span id="total-count">0</span>
													</th>

												</tr>
											</thead>
											<tbody class="text-nowrap" id="contact-table-body"></tbody>
										</table>
									</div>
								</div>	
								<div class="card-footer border-0">
									<div class="d-flex justify-content-between align-items-center">
										<div class="list-paging-area d-flex justify-content-between align-items-center w-100">
											<div class="p-2">
												<div class="btn-group">
													<button type="button" class="btn btn-default btn-sm btn-paging" data-value="20">20</button>
													<button type="button" class="btn btn-default btn-sm btn-paging" data-value="100">100</button>
													<button type="button" class="btn btn-default btn-sm btn-paging" data-value="500">500</button>
													<button type="button" class="btn btn-default btn-sm btn-paging" data-value="2500">2500</button>
												</div>
											</div>
											
											<div class="p-2">
												<button class="btn btn-default btn-more btn-sm">Load More</button>
											</div>
										</div>
									</div>
								</div>
								
								
							</div>
						</div><!-- end col -->
					</div><!-- end row -->

					<!-- Add Customer Modal -->
					<div class="modal fade" id="addCustomerModal" tabindex="-1" aria-labelledby="addCustomerModalLabel" aria-hidden="true">
						<div class="modal-dialog modal-lg">
							<div class="modal-content">

								<div class="modal-header">
									<h5 class="modal-title" id="addCustomerModalLabel">Add New Customer</h5>
									<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
								</div>

								<form id="addCustomerForm">
									<div class="modal-body">
										<div class="row g-3">

											<div class="col-md-6">
												<label for="contactName" class="form-label">Contact Person</label>
												<input type="text" class="form-control" id="contactName" placeholder="Enter full name" required>
											</div>

											<div class="col-md-6">
												<label for="email" class="form-label">Email Address</label>
												<input type="email" class="form-control" id="email" placeholder="Enter email" required>
											</div>

											<div class="col-md-6">
												<label for="phone" class="form-label">Phone Number</label>
												<input type="text" class="form-control" id="phone" placeholder="e.g. +1 234 567 8900" required>
											</div>

											<div class="col-md-6">
												<label for="company" class="form-label">Company</label>
												<input type="text" class="form-control" id="company" placeholder="Company name">
											</div>

											<div class="col-md-6">
												<label for="country" class="form-label">Country</label>
												<select class="form-select" id="country" required>
													<option value="">Select country</option>
													<option value="US">United States</option>
													<option value="UK">United Kingdom</option>
													<option value="IN">India</option>
													<option value="CA">Canada</option>
													<option value="DE">Germany</option>
													<option value="FR">France</option>
													<option value="JP">Japan</option>
													<option value="BR">Brazil</option>
													<option value="EG">Egypt</option>
												</select>
											</div>

											<div class="col-md-6">
												<label for="contactType" class="form-label">Customer Type</label>
												<select class="form-select" id="contactType" required>
													<option value="">Select type</option>
													<option value="Lead">Lead</option>
													<option value="Prospect">Prospect</option>
													<option value="Client">Client</option>
												</select>
											</div>

											<div class="col-md-6">
												<label for="Accostatus" class="form-label">Account Status</label>
												<select class="form-select" id="Accostatus" required>
													<option value="">Select status</option>
													<option value="Active">Active</option>
													<option value="Verification Pending">Verification Pending</option>
													<option value="Inactive">Inactive</option>
													<option value="Blocked">Blocked</option>
												</select>
											</div>

											<div class="col-md-6">
												<label for="joinedDate" class="form-label">Joined Date</label>
												<input type="date" class="form-control" data-provider="flatpickr" data-date-format="d M, Y" id="joinedDate" required>
											</div>

										</div>
									</div>

									<div class="modal-footer">
										<button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancel</button>
										<button type="submit" class="btn btn-primary">Add Customer</button>
									</div>
								</form>

							</div>
						</div>
					</div>


				</div>
				<!-- container -->

				<!-- Footer Start -->
				<footer class="footer">
					<div class="container-fluid">
						<div class="row">
							<div class="col-12 text-center">
								©<span class="fw-semibold">64 Network Security Pvt Ltd</span> 
							</div>
						</div>
					</div>
				</footer>
				<!-- end Footer -->

			</div>
		</div>
	`
};