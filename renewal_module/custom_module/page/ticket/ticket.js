/*frappe.pages['ticket'].on_page_load = function (wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'None',
		single_column: true
	});
}*/

frappe.pages['ticket'].on_page_load = (wrapper) => {
	// 	console.log("on_page_load triggered");
	new ticketPage(wrapper);
};

frappe.router.on('change', () => {
	if (frappe.get_route()[0] !== "ticket") {
		location.reload();
	}
	if (frappe.ticket_page && frappe.ticket_page.handleRoute) {
		frappe.ticket_page.handleRoute();
	}
});

if (!window.MyticketPageDefined) {
	window.MyticketPageDefined = true;
	class ticketPage {
		constructor(wrapper) {
			this.wrapper = wrapper;
			this.page = frappe.ui.make_app_page({
				parent: wrapper,
				title: '',
				single_column: true
			});
			this.page_length = 20;       // default visible rows
			this.LOAD_MORE_SIZE = 50;    // +50 per Load More
			this.visible_count = 0;
			this.all_tickets = [];       // cached tickets
			this.selected_tickets = new Set();
			// cache for assets (if you use it)
			this._cache = {
				css: [],
				js: [],
				inlineScripts: [],
				rendered_html: null
			};
			this.make();
			frappe.ticket_page = this;
		}

		// ---- lifecycle / UI build ----
		make() {
			if (frappe.ticket_page && frappe.ticket_page.body) {
				$(this.page.main).append(frappe.ticket_page.body);
			}
			// load support page HTML + assets
			this.load_support_page();
			setTimeout(async () => {
				try {
					this.handleRoute();
				} catch (err) {
					console.error("ticketPage.make error:", err);
				}
			}, 200);
		}


		handleRoute() {
			const route = frappe.get_route();
			//console.log("handleRoute:", route);
			// ticket
			if (route.length === 1) {
				return this.show_list();
			}
			// ticket/new-ticket
			if (route.length === 2 && route[1] === "new-ticket") {
				return this.show_new();
			}
			// ticket/<issue_id>
			if (route.length === 2) {
				const issue_id = route[1];
				return this.show_details(issue_id);
			}
		}

		show_list() {
			$(".ticket-list-view").removeClass("d-none");
			$(".ticket-details-view").addClass("d-none");
			$(".new-ticket").addClass("d-none");

			this.bindPaginationEvents();
			// fetch counts and tickets (force fetch on first load)
			this.bindFilterEvents();
			this.bindRowSelectionHandler();
			this.bindActionDropdownHandler();

			const wrapper = this.page.wrapper[0] || this.page.wrapper;
			const statusFilter = wrapper.querySelector('[data-table-filter="status"]');
			// 🔹 Check for status query param
			const urlParams = new URLSearchParams(window.location.search);
			const statusFromURL = urlParams.get("status");
			if (statusFromURL && statusFilter) {
				// Set the status dropdown value
				statusFilter.value = statusFromURL;
				// Save and apply the status filter
				this.active_status = statusFromURL;
				//this.applyFilters([]);
			} else {
				// Default load (no prefilter)
				//this.applyFilters([]);
			}
			// ✅ Whenever filter changes or status is cleared, update URL
			if (statusFilter) {
				statusFilter.addEventListener("change", () => {
					const selectedStatus = statusFilter.value;
					// Update active status and apply filters
					this.active_status = selectedStatus;
					//this.applyFilters([]);

					// 🔹 Update browser URL dynamically
					const newUrl = new URL(window.location.href);

					if (selectedStatus) {
						newUrl.searchParams.set("status", selectedStatus);
					} else {
						newUrl.searchParams.delete("status");
					}
					// Replace current history entry (does not reload page)
					window.history.replaceState({}, "", newUrl.toString());
				});
			}
			// Wait a bit to ensure UI is ready before applying URL filters
			this.applyUrlFilters();
		}

		show_details(issue_id) {
			$(".ticket-list-view").addClass("d-none");
			$(".ticket-details-view").removeClass("d-none");
			$(".new-ticket").addClass("d-none");

			// Load issue
			if (issue_id) {
				this.load_issue_details?.(issue_id, this.page);
			}
			this.show_work_timer(issue_id);
			this.bindEvent(issue_id);
			this.bindTagEvents(issue_id, $(".leftcol"), $(".rightcol"));
			this.listedit(issue_id);
		}

		show_new() {
			$(".ticket-list-view").addClass("d-none");
			$(".ticket-details-view").addClass("d-none");
			$(".new-ticket").removeClass("d-none");
			this.bind_issue_form_events();
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

				if (!document.querySelector(`link[href="${href}"][data-ticket="true"]`)) {
					const css = document.createElement('link');
					css.rel = 'stylesheet';
					css.href = href;
					css.dataset.ticket = "true";
					document.head.appendChild(css);
				}
			});

			// --- JS injection ---
			const scriptPromises = [];
			temp.querySelectorAll('script[src]').forEach(script => {
				const src = script.getAttribute('src');
				if (!src) return;
				if (src.toLowerCase().includes("popper")) {
					//console.warn("Skipping Popper injection to avoid duplicate loading:", src);
					return;
				}
				if (!this._cache.js.includes(src)) this._cache.js.push(src);

				if (!document.querySelector(`script[src="${src}"][data-ticket="true"]`)) {
					const promise = new Promise((resolve, reject) => {
						const s = document.createElement('script');
						s.src = src;
						s.defer = true;
						s.dataset.ticket = "true";
						s.onload = () => {
							//console.log(`Loaded JS: ${src}`);
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
				styleTag.dataset.ticket = "true";
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


		////ticket list view methods

		fetch_list_data({ reset = false, saved_filters = [], override_filters = {} } = {}) {
			return new Promise((resolve, reject) => {
				if (!this.page_length) this.page_length = 20; // sensible default if missing
				// prevent overlapping requests
				if (this._fetch_in_progress) {
					console.warn("[fetch_list_data] fetch already in progress — skipping");
					return resolve;
				}
				this._fetch_in_progress = true;
				try {
					if (reset) {
						this.all_tickets = [];
						this.visible_count = 0;
					}
					const wrapper = this.page.wrapper[0] || this.page.wrapper;
					// Collect UI filter values (but allow override_filters)
					const statusEl = wrapper.querySelector('[data-table-filter="status"]');
					const priorityEl = wrapper.querySelector('[data-table-range-filter="priority"]');
					const searchInput = wrapper.querySelector('[data-table-search]');
					const searchText = searchInput ? searchInput.value.trim() : "";
					// If override provided use it, otherwise read from DOM or preserved active values
					this.active_status = override_filters.hasOwnProperty('status')
						? override_filters.status
						: (statusEl ? statusEl.value : (this.active_status || ""));
					this.active_priority = override_filters.hasOwnProperty('priority')
						? override_filters.priority
						: (priorityEl ? priorityEl.value : (this.active_priority || ""));
					this.active_search = override_filters.hasOwnProperty('search')
						? override_filters.search
						: (searchText || this.active_search || "");

					// Normalize saved_filters -> filtersPayload (kept your robust mapping)
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

					//console.log("%c[DEBUG] → filtersPayload:", "color: #4caf50;", filtersPayload);

					// Highlight active status card immediately (visual feedback)
					wrapper.querySelectorAll(".ticket-status-card").forEach(card => {
						const isActive = card.dataset.status === this.active_status && this.active_status;
						card.classList.toggle("active-status-card", isActive);
						card.style.boxShadow = isActive ? "0 0 0 3px rgba(102,119,229,0.3)" : "";
					});

					// Backend call
					frappe.call({
						method: "renewal_module.custom_module.page.ticket.ticket.get_list_data",
						args: {
							start: reset ? 0 : (this.all_tickets ? this.all_tickets.length : 0),
							page_length: this.page_length,
							status: this.active_status || "",
							priority: this.active_priority || "",
							search: this.active_search || "",
							filters: JSON.stringify(filtersPayload)
						},
						callback: (r) => {
							// Ensure we clear the in-progress flag at the end of callback
							try {
								if (!r || !r.message) {
									// if no message treat as empty response but keep total_records unchanged
									console.warn("[fetch_list_data] empty response");
									if (reset) {
										this.total_records = 0;
										this.all_tickets = [];
										this.visible_count = 0;
									}
									this.render_rows(true);
									this._fetch_in_progress = false;
									return resolve;
								}
								const { data = [], total = 0 } = r.message || {};
								//console.log("data,count", r.message);
								// Always trust the server-provided total for accurate counts
								this.total_records = Number.isFinite(total) ? parseInt(total, 10) : (data.length || 0);

								if (reset) {
									this.all_tickets = Array.isArray(data) ? data.slice() : [];
								} else if (Array.isArray(data) && data.length > 0) {
									this.all_tickets = [...(this.all_tickets || []), ...data];
								}
								// always set visible_count to current array length (authoritative)
								this.visible_count = Math.min((this.all_tickets || []).length, this.total_records);
								// If server says total is zero, clear everything
								if (this.total_records === 0) {
									this.all_tickets = [];
									this.visible_count = 0;
								}

								// filtered_tickets mirrors all_tickets unless additional client-side filters are applied
								this.filtered_tickets = this.all_tickets.slice();

								// Finally render rows
								this.render_rows(true);
								resolve();
							}
							catch (err) {
								reject(err);
							}
							finally {
								this._fetch_in_progress = false;
							}
						},
						error: (err) => {
							this._fetch_in_progress = false;
							console.error("%c[DEBUG] → frappe.call error:", "color: red;", err);
							reject(err);
						}
					});
				} catch (e) {
					this._fetch_in_progress = false;
					console.error(e);
					reject(e);
				}
			});
		}

		render_rows(useFiltered = false) {
			const wrapper = this.page.wrapper[0] || this.page.wrapper;

			const tbody = wrapper.querySelector(".table-custom tbody");
			if (!tbody) return;

			tbody.innerHTML = "";

			const data = useFiltered && this.filtered_tickets ? this.filtered_tickets : (this.all_tickets || []);

			// If there is zero total at server, show no tickets message
			if (!Array.isArray(data) || data.length === 0) {
				tbody.insertAdjacentHTML("beforeend", `
					<tr>
						<td colspan="10" class="text-center text-muted py-4">No tickets found.</td>
					</tr>
				`);
				// Update pagination info blocks to zero
				const infoBlocksEmpty = wrapper.querySelectorAll(".pagination-info");
				infoBlocksEmpty.forEach(info => {
					const visibleCountEl = info.querySelector(".visible-count");
					const totalCountEl = info.querySelector(".total-count");
					if (visibleCountEl) visibleCountEl.textContent = 0;
					if (totalCountEl) totalCountEl.textContent = this.total_records || 0;
				});

				// Hide load more if nothing to load
				const loadMoreBtnEmpty = wrapper.querySelector(".btn-more");
				if (loadMoreBtnEmpty) loadMoreBtnEmpty.style.display = "none";
				return;
			}

			// Ensure visible slice is consistent with current visible_count
			this.visible_count = Math.min(this.visible_count || 0, this.total_records || data.length);
			const visible_tickets = data.slice(0, this.visible_count);

			visible_tickets.forEach(ticket => {
				const tr = document.createElement("tr");
				const avatarHTML = ticket.assigned_to_image
					? `<img src="${ticket.assigned_to_image}" alt="${ticket.working_agent || 'User'}" 
					style="width: 32px; height: 32px; border-radius: 50%;object-fit: cover;border: 1px solid #ddd;">`
					: `<div style="width: 32px; height: 32px; border-radius: 50%; background-color: #6366f1; color: white; display: flex; align-items: center;justify-content: center;font-weight: 600;font-size: 13px;">
					${ticket.assigned_to_initials || '?'}
				</div>`;

				tr.innerHTML = `
					<td class="ps-3">
						<input class="form-check-input form-check-input-light fs-14 product-item-check mt-0" type="checkbox">
					</td>
					<td> <a href="#" class="fw-semibold link-reset issue-link" data-issue-name="${ticket.name}">${ticket.name}</a></td>

					<td class="ellipsis" style="max-width:200px;" title="${escapeHtml(ticket.subject)}">${escapeHtml(ticket.subject)}</td>
					<td><span class="badge ${getPriorityClass(ticket.priority)}">${escapeHtml(ticket.priority)}</span></td>
					<td>
						<div class="d-flex gap-2 align-items-center">
							<span class="ellipsis" style="max-width:200px;" title="${escapeHtml(ticket.customer)}">${escapeHtml(ticket.customer)}</span>
						</div>
					</td>
					<td class="ellipsis" style="max-width:200px;" title="">${formatDate(ticket.sla_resolution_by)} </td>
					<td><span class="badge ${getStatusClass(ticket.status)} badge-label">${escapeHtml(ticket.status)}</span></td>
					<td>${formatDate(ticket.creation)}</td>
					<td>
						<div class="d-flex gap-2 align-items-center">
							${avatarHTML}
							<span class="link-reset ellipsis" style="max-width:150px;" title="${ticket.working_agent}">${ticket.working_agent || 'Unassigned'}</span>
						</div>
					</td>
					<td>
						<div class="d-flex align-items-center justify-content-center gap-1">
							<a href="#" class="btn btn-default btn-icon btn-sm rounded issue-link" data-issue-name="${ticket.name}"><i class="ti ti-eye fs-lg"></i></a>
							<!--<a href="ticket-create.html?ticket=${ticket.name}" class="btn btn-default btn-icon btn-sm rounded"><i class="ti ti-edit fs-lg"></i></a>-->
						</div>
					</td>
				`;
				tbody.appendChild(tr);
				const issueCheckbox = tr.querySelector('input[type="checkbox"]');
				if (this.selected_tickets.has(ticket.name)) {
					issueCheckbox.checked = true;
				}
			});

			// Load More button visibility: authoritative check against total_records
			const loadMoreBtn = wrapper.querySelector(".btn-more");
			if (loadMoreBtn) {
				loadMoreBtn.style.display = (this.visible_count >= (this.total_records || 0)) ? "none" : "inline-block";
			}

			// Update visible / total count UI elements (authoritative from this.total_records)
			const infoBlocks = wrapper.querySelectorAll(".pagination-info");
			infoBlocks.forEach(info => {
				const visibleCountEl = info.querySelector(".visible-count");
				const totalCountEl = info.querySelector(".total-count");
				if (visibleCountEl) visibleCountEl.textContent = Math.min(this.visible_count || 0, this.total_records || 0);
				if (totalCountEl) totalCountEl.textContent = this.total_records || 0;
			});

			// ---- helper functions (kept local) ----
			function getPriorityClass(priority) {
				switch (priority) {
					case "Low": return "text-bg-success";
					case "Medium": return "text-bg-warning";
					case "High": return "text-bg-danger";
					case "Urgent": return "text-bg-dark";
					default: return "text-bg-secondary";
				}
			}
			function getStatusClass(status) {
				switch (status) {
					case "Open": return "bg-primary-subtle text-primary";
					case "Pending": return "bg-warning-subtle text-warning";
					case "Resolved": return "bg-success-subtle text-success";
					case "Closed": return "bg-secondary-subtle text-secondary";
					case "Escalated": return "bg-danger-subtle text-danger";
					default: return "bg-light";
				}
			}
			function formatDate(dateStr) {
				if (!dateStr) return "";
				const date = new Date(dateStr);
				if (isNaN(date.getTime())) return "";
				return `${date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} 
			<small class="text-muted">${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>`;
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

			// --- Handle click on Issue Links ---
			const me = this;
			$(wrapper)
				.off("click", ".issue-link")
				.on("click", ".issue-link", function (e) {
					e.preventDefault();
					const issueName = $(this).data("issue-name");
					if (!issueName) return;

					//Save current filters (query string) before navigation
					try {
						const qs = window.location.search || "";
						localStorage.setItem("issue_theme_last_filters", qs);
						//console.log("Saved filters before opening details:", qs);
					} catch (err) {
						console.error("Failed to save filters:", err);
					}

					// Navigate to the custom details page
					frappe.set_route("ticket", issueName);
				});

		}

		bindPaginationEvents() {
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
					btn.style.backgroundColor = "#E7E5F9";
					btn.style.color = "black";

					this.page_length = parseInt(btn.dataset.value, 10);

					await this.fetch_list_data({
						reset: true,
						saved_filters: this.saved_filters || [],
						override_filters: {
							status: this.active_status,
							priority: this.active_priority,
							search: this.active_search
						}
					});
				});
			});

			// --- Default highlight for "20" button on first load ---
			const defaultBtn = wrapper.querySelector('.btn-paging[data-value="20"]');
			if (defaultBtn && !wrapper.querySelector(".active-pagination")) {
				defaultBtn.classList.add("btn-info", "active-pagination");
				defaultBtn.style.backgroundColor = "#E7E5F9";
				defaultBtn.style.color = "black";
				this.page_length = 20;
			}

			// --- Load More button ---
			const loadMoreBtn = wrapper.querySelector(".btn-more");
			if (loadMoreBtn) {
				loadMoreBtn.addEventListener("click", async () => {
					loadMoreBtn.classList.add("active-pagination");
					loadMoreBtn.style.backgroundColor = "#E7E5F9";
					loadMoreBtn.style.color = "black";

					await this.fetch_list_data({
						reset: false,
						saved_filters: this.saved_filters || [],
						override_filters: {
							status: this.active_status,
							priority: this.active_priority,
							search: this.active_search
						}
					});

					setTimeout(() => {
						loadMoreBtn.classList.remove("active-pagination");
						loadMoreBtn.style.backgroundColor = "";
						loadMoreBtn.style.color = "";
					}, 500);
				});
			}
		}

		bindFilterEvents() {
			const wrapper = this.page.wrapper[0] || this.page.wrapper;
			const me = this;
			// --- Basic Filters ---
			const statusFilter = wrapper.querySelector('[data-table-filter="status"]');
			const priorityFilter = wrapper.querySelector('[data-table-range-filter="priority"]');
			const searchInput = wrapper.querySelector('[data-table-search]');
			const filterButton = wrapper.querySelector('.filter-button');
			const clearFilterButton = wrapper.querySelector('.filter-x-button');

			// Initialize advancedFilterForm wrapper
			const advancedFilterForm = $(wrapper).find('.advanced-filter-form, .filter-section, .filter-container').first().length
				? $(wrapper).find('.advanced-filter-form, .filter-section, .filter-container').first()
				: $(wrapper);

			let filter_group = null;
			//me.saved_filters = [];
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


			// Helper to clear UI basic filters
			function clearBasicFilterUI() {
				if (statusFilter) statusFilter.value = "";
				if (priorityFilter) priorityFilter.value = "";
				if (searchInput) searchInput.value = "";
				me.active_status = "";
				me.active_priority = "";
				me.active_search = "";
				// remove visual active from cards
				wrapper.querySelectorAll(".ticket-status-card").forEach(card => {
					card.classList.remove("active-status-card");
					card.style.boxShadow = "";
				});
				// update filter button label
				if (filterButton) {
					const $btn = $(filterButton);
					const $label = $btn.find(".button-label");
					if ($label && $label.length) $label.text("Filter");
				}
			}

			// --- Basic Filter Listeners ---
			if (statusFilter) statusFilter.addEventListener("change", () => {
				// update active_status from element
				me.active_status = statusFilter.value || "";
				// visually toggle cards
				wrapper.querySelectorAll(".ticket-status-card").forEach(card => {
					const isActive = (card.dataset.status && card.dataset.status === me.active_status && me.active_status);
					card.classList.toggle("active-status-card", isActive);
					card.style.boxShadow = isActive ? "0 0 0 3px rgba(102,119,229,0.3)" : "";
				});
				me.fetch_list_data({ reset: true, saved_filters: me.saved_filters });
				updateUrlWithFilters(me.saved_filters);
			});

			if (priorityFilter) priorityFilter.addEventListener("change", () => {
				me.active_priority = priorityFilter.value || "";
				me.fetch_list_data({ reset: true, saved_filters: me.saved_filters });
				updateUrlWithFilters(me.saved_filters);
			});

			if (searchInput) {
				let typingTimer = null;
				searchInput.addEventListener("input", () => {
					clearTimeout(typingTimer);
					typingTimer = setTimeout(() => {
						me.active_search = (searchInput.value || "").trim();
						me.fetch_list_data({ reset: true, saved_filters: me.saved_filters });
						updateUrlWithFilters(me.saved_filters);
					}, 250);
				});
			}

			// --- Advanced Filter Popover ---
			advancedFilterForm.find('.filter-button').on("click", async function (e) {
				e.preventDefault();
				e.stopPropagation();

				const $btn = $(this);
				if ($btn.data("bs.popover")) {
					teardownGuards($btn);
					$btn.popover("dispose");
					return;
				}

				let popover_content = $('<div class="filter-area">');
				await frappe.model.with_doctype("Issue");
				filter_group = new frappe.ui.FilterGroup({
					parent: popover_content,
					doctype: "Issue",
					on_change: function () {
						me.saved_filters = filter_group.get_filters();
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
					if (me.saved_filters.length) {
						filter_group.add_filters(me.saved_filters);
					} else {
						filter_group.add_filter("Issue", "name", "=", "", false);
					}
				}, 0);

				let footer = $(`
				<div class="filter-action-buttons mt-2 flex justify-between items-center">
					<button class="text-muted add-filter btn btn-xs">+ Add a Filter</button>
					<div>
						<button class="btn btn-secondary btn-xs clear-filters mr-2">Clear</button>
						<button class="btn btn-primary btn-xs apply-filters">Apply</button>
					</div>
				</div>
			`);

				popover_content.find(".filter-action-buttons").remove();
				popover_content.append(footer);

				footer.find('.add-filter').on("click", () => filter_group.add_filter("Issue", "name", "=", "", false));

				// --- Popover: Clear button (explicitly reset UI + state + URL + fetch + close popover)
				footer.find('.clear-filters').on("click", () => {
					if (filter_group) filter_group.clear_filters();
					me.saved_filters = [];
					clearBasicFilterUI();
					// ensure no in-progress flag prevents fetch
					me._fetch_in_progress = false;
					me.fetch_list_data({ reset: true, saved_filters: [] });
					update_filter_button_count($btn, 0);
					updateUrlWithFilters([]);
					closePopover($btn, "clear-filters");
				});

				footer.find('.apply-filters').on("click", () => {
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
			if (clearFilterButton) {
				clearFilterButton.addEventListener("click", () => {
					if (filter_group) filter_group.clear_filters();
					me.saved_filters = [];
					clearBasicFilterUI();
					me._fetch_in_progress = false;
					me.fetch_list_data({ reset: true, saved_filters: [] });
					update_filter_button_count($(advancedFilterForm).find('.filter-button'), 0);
					updateUrlWithFilters([]);
				});
			}

			// --- Helper ---
			function update_filter_button_count($btn, count) {
				let $label = $btn.find(".button-label");
				$label.text(count > 0 ? `Filter (${count})` : "Filter");
			}

			// --- URL Updater (enhanced version) ---
			function updateUrlWithFilters(filters) {
				try {
					const newUrl = new URL(window.location.href);
					const statusEl = wrapper.querySelector('[data-table-filter="status"]');
					const priorityEl = wrapper.querySelector('[data-table-range-filter="priority"]');
					const searchInput = wrapper.querySelector('[data-table-search]');

					const statusVal = statusEl ? statusEl.value : "";
					const priorityVal = priorityEl ? priorityEl.value : "";
					const searchVal = searchInput ? searchInput.value.trim() : "";

					// Basic filters
					if (statusVal) newUrl.searchParams.set("status", statusVal);
					else newUrl.searchParams.delete("status");

					if (priorityVal) newUrl.searchParams.set("priority", priorityVal);
					else newUrl.searchParams.delete("priority");

					if (searchVal) newUrl.searchParams.set("search", searchVal);
					else newUrl.searchParams.delete("search");

					// Advanced filters
					if (filters && filters.length) {
						const encoded = encodeURIComponent(JSON.stringify(filters));
						newUrl.searchParams.set("filters", encoded);
					} else {
						newUrl.searchParams.delete("filters");
					}

					window.history.replaceState({}, "", newUrl.toString());
					//console.log("🔄 URL updated:", newUrl.toString());
				} catch (err) {
					console.error("❌ Failed to update URL:", err);
				}
			}

		}

		applyUrlFilters() {
			const wrapper = this.page.wrapper[0] || this.page.wrapper;
			//Restore saved filters from localStorage ONLY if URL is empty
			let qs = localStorage.getItem("issue_theme_last_filters") || "";
			if (!window.location.search && qs) {
				//console.log("Restoring saved filters from localStorage:", qs);
				window.history.replaceState({}, "", window.location.pathname + qs);
			}
			//Read final URL params
			const params = new URLSearchParams(window.location.search);
			const status = params.get("status") || "";
			const priority = params.get("priority") || "";
			const search = params.get("search") || "";
			const filters_encoded = params.get("filters") || "";
			//Set UI filter elements
			const statusFilter = wrapper.querySelector('[data-table-filter="status"]');
			const priorityFilter = wrapper.querySelector('[data-table-range-filter="priority"]');
			const searchInput = wrapper.querySelector('[data-table-search]');
			if (statusFilter) statusFilter.value = status;
			if (priorityFilter) priorityFilter.value = priority;
			if (searchInput) searchInput.value = search;
			//Update active basic filters
			this.active_status = status;
			this.active_priority = priority;
			this.active_search = search;

			//Restore advanced filters (popover filters)
			let restored_saved_filters = [];
			if (filters_encoded) {
				try {
					restored_saved_filters = JSON.parse(decodeURIComponent(filters_encoded));
					//console.log("Restored advanced filters:", restored_saved_filters);
				} catch (e) {
					console.error("Failed to decode advanced filters:", e);
				}
			}
			//Store them back to this.saved_filters
			this.saved_filters = restored_saved_filters;
			//Fetch list with ALL restored filters
			this.fetch_list_data({
				reset: true,
				saved_filters: this.saved_filters
			});
		}

		//Handle row selection toggle (New Ticket ↔ Actions)
		bindRowSelectionHandler() {
			const wrapper = this.page.wrapper[0] || this.page.wrapper;
			const table = wrapper.querySelector(".table-custom");
			const newTicketBtn = wrapper.querySelector("#new-ticket-btn");
			const actionsDropdown = wrapper.querySelector("#actions-dropdown");
			const selectAllCheckbox = table.querySelector('[data-table-select-all]');

			if (!table || !newTicketBtn || !actionsDropdown) return;

			// ✅ "Select All" checkbox
			if (selectAllCheckbox) {
				selectAllCheckbox.addEventListener("change", (e) => {
					const allRowCheckboxes = table.querySelectorAll('tbody input[type="checkbox"]');
					allRowCheckboxes.forEach(cb => {
						cb.checked = e.target.checked;
						const row = cb.closest("tr");
						const issueName = row.querySelector(".issue-link")?.dataset.issueName;
						if (issueName) {
							if (e.target.checked) {
								this.selected_tickets.add(issueName);
							} else {
								this.selected_tickets.delete(issueName);
							}
						}
					});
					this.updateActionBarState(table, newTicketBtn, actionsDropdown);
				});
			}

			// ✅ Handle individual row checkbox changes
			table.addEventListener("change", (e) => {
				if (e.target.matches('tbody input[type="checkbox"]')) {
					const row = e.target.closest("tr");
					const issueName = row.querySelector(".issue-link")?.dataset.issueName;
					if (issueName) {
						if (e.target.checked) {
							this.selected_tickets.add(issueName);
						} else {
							this.selected_tickets.delete(issueName);
						}
					}

					// Update "Select All" checkbox
					if (selectAllCheckbox) {
						const all = table.querySelectorAll('tbody input[type="checkbox"]').length;
						const checked = table.querySelectorAll('tbody input[type="checkbox"]:checked').length;
						selectAllCheckbox.checked = (all === checked);
					}

					this.updateActionBarState(table, newTicketBtn, actionsDropdown);
				}
			});
		}


		//Helper method to update visibility and log count
		updateActionBarState(table, newTicketBtn, actionsDropdown) {
			const selectedCount = table.querySelectorAll('tbody input[type="checkbox"]:checked').length;
			//console.log("Selected count:", selectedCount);

			if (selectedCount > 0) {
				newTicketBtn.classList.add("d-none");
				actionsDropdown.classList.remove("d-none");
			} else {
				newTicketBtn.classList.remove("d-none");
				actionsDropdown.classList.add("d-none");
			}
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
				const table = wrapper.querySelector(".table-custom");
				const checkedBoxes = table.querySelectorAll('tbody input[type="checkbox"]:checked');

				if (!checkedBoxes.length) {
					frappe.msgprint(__("Please select at least one Issue"));
					return;
				}

				const issues = Array.from(checkedBoxes)
					.map(cb => cb.closest("tr")?.querySelector("a.fw-semibold")?.textContent?.trim())
					.filter(Boolean);

				if (!issues.length) {
					frappe.msgprint(__("No valid Issue IDs found."));
					return;
				}

				const doctype = "Issue";
				const me = this; // 🔹 Capture the reference for use in nested callbacks

				// ---------------------- ACTIONS ----------------------

				// ✅ Set Open / Closed
				if (action === "set_open" || action === "set_closed") {
					const newStatus = action === "set_open" ? "Open" : "Closed";
					me.bulkUpdate(issues, { fieldname: "status", value: newStatus });
				}

				// ✅ Delete
				else if (action === "delete") {
					frappe.confirm(__("Delete {0} selected Issues?", [issues.length]), () => {
						Promise.all(issues.map(name =>
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
				}

				// ✅ Assign To
				else if (action === "assign_to") {
					let d = new frappe.ui.form.AssignToDialog({ doctype, docname: issues[0] });

					d.dialog.set_primary_action(__("Assign"), () => {
						const values = d.dialog.get_values();
						if (!values) return;
						d.dialog.hide();

						const calls = issues.map(name =>
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
				}

				// ✅ Bulk Edit
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
							primary_action_label: __("Update {0} records", [issues.length]),
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
								me.bulkUpdate(issues, { fieldname, value }); // 🔹 Fixed `this` reference

							}
						});

						d.show();
					});
				}

				// ✅ Apply Assignment Rule
				else if (action === "apply_rule") {
					frappe.dom.freeze(__("Applying assignment rule..."));

					const calls = issues.map(name =>
						frappe.call({
							method: "renewal_module.custom_module.page.ticket.ticket.apply_assignment_rule",
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

				// ✅ Print
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
							primary_action_label: __("Open {0} Print Views", [issues.length]),
							primary_action(values) {
								d.hide();
								issues.forEach(name => {
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
					});
				}


				// ✅ Add Tags
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
							let promises = issues.map(name =>
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
				}

				// Unknown Action
				else {
					frappe.msgprint(__("Action '{0}' not implemented yet", [action]));
				}
			});
		}


		resetActionBar() {
			const wrapper = this.page.wrapper[0] || this.page.wrapper;
			const newTicketBtn = wrapper.querySelector("#new-ticket-btn");
			const actionsDropdown = wrapper.querySelector("#actions-dropdown");

			if (newTicketBtn && actionsDropdown) {
				newTicketBtn.classList.remove("d-none");
				actionsDropdown.classList.add("d-none");
			}

			// const checkboxes = wrapper.querySelectorAll('input[type="checkbox"]');
			// checkboxes.forEach(cb => (cb.checked = false));
			this.selected_tickets.clear();

			const table = wrapper.querySelector(".table-custom");
			if (table) {
				// Uncheck select-all if present
				const selectAllCheckbox = table.querySelector('[data-table-select-all]');
				if (selectAllCheckbox) {
					selectAllCheckbox.checked = false;
				}

				// Uncheck all row checkboxes
				const checkboxes = table.querySelectorAll('tbody input[type="checkbox"]');
				checkboxes.forEach(cb => (cb.checked = false));
			}
		}

		bulkUpdate(issues, updates) {
			return new Promise((resolve, reject) => {
				if (!issues.length) return resolve();

				frappe.dom.freeze(__("Updating..."));

				let promises = issues.map(name =>
					frappe.call({
						method: "frappe.client.set_value",
						args: {
							doctype: "Issue",
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
						resolve(); // ✅ signal that updates are finished
					})
					.catch((err) => {
						frappe.dom.unfreeze();
						console.error("Bulk update failed:", err);
						reject(err);
					});
			});
		}

		// async refreshAllData() {
		// 	await this.fetch_list_data(true);
		// 	this.fetch_ticket_counts();
		// }
		async refreshAllData() {
			try {
				//Get currently applied filters from URL or memory
				const saved_filters = this.get_current_filters();
				//Call fetch_list_data, keep filters but reset pagination
				await this.fetch_list_data({
					reset: true,
					saved_filters: saved_filters || [],
				});
				// ✅ Also refresh counts (these can depend on filtered data)
				this.fetch_ticket_counts();
			} catch (err) {
				console.error("[refreshAllData] Failed to refresh:", err);
			}
		}

		get_current_filters() {
			try {
				const params = new URLSearchParams(window.location.search);
				let filtersParam = params.get("filters");
				if (!filtersParam) return [];
				// URL-decode and parse JSON safely
				const decoded = decodeURIComponent(filtersParam);
				const parsed = JSON.parse(decoded);
				return Array.isArray(parsed) ? parsed : [];
			} catch (e) {
				console.warn("[get_current_filters] Error parsing filters from URL:", e);
				return [];
			}
		}


		///details view

		bindEvent(issue) {
			// Action button click
			const me = this;
			$(this.wrapper).on("click", "[data-action='set_working_agent']", async function (e) {
				e.preventDefault();
				if (!issue) return frappe.msgprint("No issue selected.");

				const users = await frappe.call({
					method: "renewal_module.custom_module.page.ticket.ticket.get_users_with_role",
					args: { role: "Tech Support" }
				});
				let user_list = users.message || [];
				// You can safely iterate over it
				user_list.forEach(u => {
					//console.log(u.name, u.full_name);
				});
				let dialog = new frappe.ui.Dialog({
					title: __("Set Working Agent"),
					fields: [
						{
							label: __("Select Agent"),
							fieldname: "working_agent",
							fieldtype: "Link",
							options: "User",
							reqd: 1,
							get_query: () => {
								return {
									query: "renewal_module.custom_module.page.ticket.ticket.get_users_with_role_query"
								};
							}
						}
					],
					primary_action_label: __("Assign"),
					primary_action(values) {
						//console.log("here i am defining name", issue)
						frappe.call({
							method: "frappe.client.set_value",
							args: {
								doctype: "Issue",
								name: issue,
								fieldname: "working_agent",
								value: values.working_agent
							},
							callback: function (r) {
								if (!r.exc) {
									frappe.msgprint(
										__("Working agent updated to {0}", [values.working_agent])
									);
									dialog.hide();
									me.load_issue_details(issue);
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

			$(document).on("click", "#change-status-btn", function () {
				if (!issue) {
					frappe.msgprint("No issue selected.");
					return;
				}

				// Open dialog to select new status
				let dialog = new frappe.ui.Dialog({
					title: "Change Issue Status",
					fields: [
						{
							label: "Select New Status",
							fieldname: "status",
							fieldtype: "Select",
							options: ["Open", "Working", "On Hold"],
							reqd: 1
						}
					],
					primary_action_label: "Update",
					primary_action(values) {
						frappe.call({
							method: "renewal_module.custom_module.page.ticket.ticket.change_status", // path to your python method
							args: {
								doctype: "Issue",   // Change as needed
								name: issue,   // Replace with your document name
								new_status: values.status
							},
							freeze: true,
							freeze_message: "Updating status...",
							callback: function (r) {
								if (!r.exc) {
									frappe.msgprint("Status updated successfully!");
									dialog.hide();
									me.load_issue_details(issue);
								} else {
									frappe.msgprint("Something went wrong!");
								}
							}
						});
					}
				});

				dialog.show();
				setTimeout(() => {
					const closeBtn = dialog.get_close_btn();

					if (!closeBtn || !closeBtn.length) {
						//console.warn("No close button found in the dialog.");
						return;
					}
					//console.log("✔ Close button found:", closeBtn);
					closeBtn.off("click.dialog").on("click.dialog", function () {
						//console.log("🖱 Close button clicked → closing dialog");
						dialog.hide();
					});
				}, 50);


			});

			// 📧 Email button click
			$(this.wrapper).on("click", ".ti-mail", async function (e) {
				e.preventDefault();

				if (!issue) {
					frappe.msgprint("No issue selected.");
					return;
				}

				// 🔹 Fetch Issue details
				let issue_doc = await frappe.db.get_doc("Issue", issue);
				let customer = issue_doc.customer || null;

				// 🔹 Fetch contact + user email options
				let email_options = [];
				try {
					const res = await frappe.call({
						method: "renewal_module.custom_module.page.ticket.ticket.get_contact_emails",
						args: { customer: customer }
					});
					email_options = res.message || [];
				} catch (err) {
					console.error("Error fetching contact emails:", err);
				}

				// Fallback email
				let default_email = issue_doc.raised_by || issue_doc.email_id || "";

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
							default: `Re: ${issue_doc.subject || issue_doc.name}`,
							reqd: 1
						},
						{
							label: __("Message"),
							fieldname: "content",
							fieldtype: "Text Editor",
							reqd: 1
						},
						{
							label: __("Attach Files"),
							fieldname: "attachments",
							fieldtype: "Attach",
							multiple: 1
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

						frappe.call({
							method: "frappe.core.doctype.communication.email.make",
							args: {
								recipients: recipients,
								cc: cc,
								bcc: bcc,
								subject: values.subject,
								content: values.content,
								doctype: "Issue",
								name: issue,
								send_email: 1
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
			});

		}

		listedit() {
			let originalDesc = "";
			//CLICK DESCRIPTION → ENTER EDIT MODE
			$(document).off("click", "#description").on("click", "#description", function () {
				const desc = $(this);
				if (desc.attr("contenteditable") === "true") return; // already editing
				originalDesc = desc.html().trim();

				desc.attr("contenteditable", "true").focus();
				$("#saveDescBtn").removeClass("d-none"); // show save button
			});

			//CLICK SAVE BUTTON → SAVE CHANGES
			$(document).off("click", "#saveDescBtn").on("click", "#saveDescBtn", function () {
				const desc = $("#description");
				const newDesc = desc.html().trim();

				// No changes — exit edit mode
				if (newDesc === originalDesc) {
					desc.removeAttr("contenteditable");
					$(this).addClass("d-none"); // hide save button
					return;
				}

				// Save to backend
				frappe.call({
					method: "frappe.client.set_value",
					args: {
						doctype: "Issue",
						name: frappe.get_route()[1],
						fieldname: { description: newDesc }
					},
					callback: function (r) {
						if (!r.exc) {
							frappe.show_alert({
								message: __("Description updated successfully."),
								indicator: "green"
							});
						} else {
							frappe.show_alert({
								message: __("Failed to update description."),
								indicator: "red"
							});
						}

						desc.removeAttr("contenteditable");
						$("#saveDescBtn").addClass("d-none"); // hide save btn
					}
				});
			});

			// CLICK OUTSIDE → EXIT EDIT MODE (FIXES YOUR ISSUE)
			$(document).on("click", function (e) {
				const desc = $("#description");
				const saveBtn = $("#saveDescBtn");

				if (desc.attr("contenteditable") !== "true") return;

				if ($(e.target).closest("#description").length || $(e.target).closest("#saveDescBtn").length) {
					return;
				}

				desc.removeAttr("contenteditable");
				saveBtn.addClass("d-none");
			});



			$(document).off("click", "#add-contact-btn").on("click", "#add-contact-btn", function () {
				const issueName = frappe.get_route()[1];
				if (!issueName) {
					frappe.msgprint("No issue found.");
					return;
				}

				// Fetch customer for contact filtering
				frappe.db.get_value("Issue", issueName, "customer", (r) => {
					const customer = r?.customer || "";

					const dialog = new frappe.ui.Dialog({
						title: __("Add Contact Person"),
						fields: [
							{
								label: "Contact",
								fieldname: "user_name",
								fieldtype: "Link",
								options: "Contact",
								reqd: 1,
								get_query: () => ({
									filters: { company_name: customer }
								})
							},
							{
								label: "Mobile No",
								fieldname: "mobile_no",
								fieldtype: "Data",
								read_only: 1
							},
							{
								label: "Email ID",
								fieldname: "email_id",
								fieldtype: "Data",
								read_only: 1
							},
							{
								label: "Designation",
								fieldname: "designation",
								fieldtype: "Data",
								read_only: 1
							}
						],
						primary_action_label: __("Add"),
						primary_action(values) {
							if (!values.user_name) return;

							frappe.call({
								method: "frappe.client.insert",
								args: {
									doc: {
										doctype: "Issue Contact List",
										parent: issueName,
										parentfield: "issue_contact_list",
										parenttype: "Issue",
										user_name: values.user_name,
										email_id: values.email_id,
										mobile_no: values.mobile_no,
										designation: values.designation
									}
								},
								callback: function (r) {
									if (!r.exc) {
										frappe.show_alert({
											message: __("✅ Contact added successfully."),
											indicator: "green"
										});
										dialog.hide();
										//window.preventRightPanelAutoHide = false;
										//load_issue_contacts(issueName); // refresh contact list UI
										load_issue_contacts(issueName, values.user_name);
									}
								}
							});
						}
					});

					// 🔹 Hide Mobile, Email, Designation fields properly
					dialog.fields_dict.mobile_no.df.hidden = 1;
					dialog.fields_dict.email_id.df.hidden = 1;
					dialog.fields_dict.designation.df.hidden = 1;
					dialog.refresh();

					// When contact selected → fetch full info
					dialog.fields_dict.user_name.df.onchange = async function () {
						const contact = dialog.get_value("user_name");
						if (!contact) return;

						const res = await frappe.db.get_doc("Contact", contact);
						if (res) {
							dialog.set_value("mobile_no", res.phone || "");
							dialog.set_value("email_id", res.email_id || "");
							dialog.set_value("designation", res.designation || "");
						}
					};

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
			});

			async function load_issue_contacts(issueName, autoOpenUser = null) {
				//console.log("render contact", issueName)
				const res = await frappe.db.get_doc("Issue", issueName);
				const issue = res || {};

				const contactContainer = $("#contact-list-details span.ellipsis");

				if (issue.issue_contact_list?.length) {
					let html = "";
					issue.issue_contact_list.forEach((row, i) => {
						const name = (row.user_name || "").split("-")[0].trim();
						if (name) {
							html += `
								<div class="d-flex align-items-center contact-item" style="margin-bottom: 4px;">
									<span class="contact-name me-1" data-index="${i}" style="cursor:pointer;">
										${name}
									</span>
									<i class="ti ti-trash text-danger delete-contact" 
									style="cursor:pointer; font-size: 14px;" 
									title="Remove Contact"
									data-rowname="${row.name}"></i>
								</div>
							`;
						}
					});

					contactContainer.html(html);
					if (autoOpenUser) {
						const autoIndex = issue.issue_contact_list.findIndex(
							r => r.user_name === autoOpenUser
						);
						if (autoIndex !== -1) {
							$(".contact-name[data-index='" + autoIndex + "']").trigger("click");
						}
					}

				} else {
					contactContainer.html("<span class='text-muted'>No contacts added.</span>");
				}
			}


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

			// 🔹 Remove contact from child table
			$(document).off("click", ".delete-contact").on("click", ".delete-contact", function () {
				const issueName = frappe.get_route()[1];
				const rowname = $(this).data("rowname");

				frappe.confirm(
					__("Are you sure you want to remove this contact?"),
					() => {
						frappe.call({
							method: "frappe.client.delete",
							args: { doctype: "Issue Contact List", name: rowname },
							callback: function (r) {
								if (!r.exc) {
									frappe.show_alert({
										message: __("🗑️ Contact removed successfully."),
										indicator: "green"
									});
									load_issue_contacts(issueName); // refresh list
								}
							}
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
			});
		}


		bindTagEvents(issue, leftCol, rightCol) {
			const issue_name = issue;
			const self = this;

			// Render lucide icons if available
			if (window.lucide) lucide.createIcons();

			// ---------------------------
			// 1) Task count badge
			frappe.call({
				method: "renewal_module.custom_module.page.ticket.ticket.get_tasks_with_children",
				args: { issue_name },
				callback: function (r) {
					const tasks = r.message || [];
					const count = tasks.length;

					const tag = $(".tag-item[data-doctype='Task']");
					tag.find(".task-count").remove();

					if (count > 0) {
						tag.find(".tag-text").after(`
							<span class="badge bg-light px-2 py-1 text-dark me-1 fw-semibold shadow-sm task-count"
								style="cursor:pointer;">
								${count}
							</span>
						`);
					}
				}
			});

			// ---------------------------
			// 2) Render Task panel
			// ---------------------------

			$(document).off("click", "#add-task-btn").on("click", "#add-task-btn", function (e) {
				e.preventDefault();
				e.stopPropagation();
				handleNewTaskClick();
			});

			$(document).off("click", ".task-open").on("click", ".task-open", function () {
				frappe.set_route("Form", "Task", $(this).data("name"));
			});


			// -------------------------
			// MAIN FUNCTION
			// -------------------------
			async function renderTaskPanel(issue_name) {
				// Fetch tasks
				const taskRes = await frappe.call({
					method: "renewal_module.custom_module.page.ticket.ticket.get_tasks_with_children",
					args: { issue_name },
					silent: true
				});
				const tasks = taskRes.message || [];
				const canCreateTask = frappe.model.can_create("Task");
				// No tasks
				if (!tasks.length) {
					renderRightCard("Tasks", `<p class="text-muted text-center">No tasks found.</p>`,
						canCreateTask ? taskButtonHTML() : ""
					);
					return;
				}
				// Collect unique user IDs
				const uniqueUsers = [...new Set(
					tasks.flatMap(t => (t.custom_users || []).map(u => u.user)).filter(Boolean)
				)];
				// Batch fetch user details
				const userMap = await fetchUserMap(uniqueUsers);
				// Build task cards HTML
				const html = tasks.map(t => buildTaskCardHTML(t, userMap)).join("");
				// Render card
				renderRightCard("Tasks", html, canCreateTask ? taskButtonHTML() : "");
				// Fill avatars AFTER DOM render
				fillTaskAvatars(tasks, userMap);
			}


			// -------------------------
			// HTML BUILDERS
			// -------------------------
			function taskButtonHTML() {
				return `<button class="btn btn-sm btn-primary" id="add-task-btn">+ New Task</button>`;
			}
			function buildTaskCardHTML(t, userMap) {
				const safeId = frappe.utils.escape_html(t.name.replace(/[^a-zA-Z0-9-_]/g, "_"));
				return `
					<div id="task-card-${safeId}" class="task-card p-1 mb-2 rounded-3 shadow-sm"
						style="background:#f8f9fa; border:1px solid #eee;">

						<div class="d-flex justify-content-between align-items-center">
							<div style="width:70%;">
								<div class="fw-bold text-primary mb-1" style="font-size:16px;">
									${frappe.utils.escape_html(t.subject || "")}
								</div>
							</div>
							<div style="width:30%; display:flex; justify-content:end;">
								<div class="avatar-holder" id="avatar-${safeId}"
									style="min-width:60px;text-align:right;"></div>
							</div>
						</div>

						<div class="d-flex justify-content-between align-items-center">
							<span class="task-open" data-name="${frappe.utils.escape_html(t.name)}" style="cursor:pointer;">
								${frappe.utils.escape_html(t.name)}
							</span>
							<span class="badge bg-warning text-dark">${t.status || ""}</span>
							<span class="badge bg-info text-dark">${t.priority || ""}</span>
						</div>

						${t.description ? `
							<div class="task-desc" style="width:100%;max-height:200px;overflow:auto;
								border:1px solid #efefef;margin-top:5px;padding:5px;">
								${t.description}
							</div>
						` : ""}
					</div>
				`;
			}


			// -------------------------
			// AVATAR LOGIC
			// -------------------------
			function fillTaskAvatars(tasks, userMap) {
				tasks.forEach(t => {
					const safeId = t.name.replace(/[^a-zA-Z0-9-_]/g, "_");
					const holder = document.getElementById(`avatar-${safeId}`);
					if (!holder) return;

					const assigned = (t.custom_users || [])
						.map(u => userMap[u.user])
						.filter(Boolean);

					holder.innerHTML = buildAvatarGroup(assigned);
				});
			}

			function buildAvatarGroup(users) {
				if (!users?.length) return "";
				const shown = users.slice(0, 2);
				const extra = users.length - shown.length;
				return `
					<div style="display:flex;justify-content:end;align-items:center;">
						${shown.map((u, i) =>
					`<div style="margin-left:${i === 0 ? "0" : "-8px"};">${buildAvatar(u)}</div>`
				).join("")}

						${extra > 0 ? `
							<div class="extra-count-avatar"
								title="${users.slice(2).map(u => u.full_name).join(", ")}"
								style="margin-left:-8px; width:22px; height:22px; border-radius:50%;
								background:#6c757d; color:white; font-size:10px; 
								display:flex; align-items:center; justify-content:center; font-weight:600;">
								+${extra}
							</div>
						` : ""}
					</div>
				`;
			}

			function buildAvatar(user) {
				if (user.image) {
					return `<img src="${user.image}" style="width:18px;height:18px;border-radius:50%;object-fit:cover;">`;
				}

				const initials = getInitials(user.full_name);
				return `
					<span style="display:flex;align-items:center;justify-content:center;
						width:18px;height:18px;border-radius:50%;background:#4A81D4;
						color:white;font-weight:600;font-size:10px;">
						${initials}
					</span>
				`;
			}

			function getInitials(name) {
				const p = (name || "User").trim().split(/\s+/);
				return ((p[0]?.[0] || "U") + (p[1]?.[0] || "")).toUpperCase();
			}


			// -------------------------
			// DATA HELPERS
			// -------------------------
			async function fetchUserMap(users) {
				if (!users.length) return {};

				const res = await frappe.call({
					method: "frappe.client.get_list",
					args: {
						doctype: "User",
						filters: { name: ["in", users] },
						fields: ["name", "full_name", "user_image"],
						limit_page_length: 200
					},
					silent: true
				});

				const map = {};
				(res.message || []).forEach(u => {
					map[u.name] = {
						full_name: u.full_name,
						image: u.user_image
					};
				});
				return map;
			}


			// -------------------------
			// NEW TASK DIALOG
			// -------------------------
			function handleNewTaskClick() {
				//console.log("New Task Clicked");

				frappe.call({
					method: "frappe.client.get_list",
					args: {
						doctype: "User",
						filters: { enabled: 1 },
						fields: ["name", "full_name"],
						order_by: "full_name",
						limit_page_length: 0
					},
					callback: function (res) {

						const users = res.message || [];

						const d = frappe.prompt([
							{ label: "Subject", fieldname: "subject", fieldtype: "Data", reqd: true },
							{
								label: "Assign To",
								fieldname: "assign_to",
								fieldtype: "MultiSelect",
								options: users.map(u => u.full_name).join(",\n")
							},
							{ label: "Description", fieldname: "description", fieldtype: "Small Text" }
						], function (values) {

							const selected = (values.assign_to || "")
								.split(",")
								.map(v => v.trim())
								.filter(Boolean);

							const map = {};
							users.forEach(u => map[u.full_name] = u.name);

							const childRows = selected.map(s => ({ user: map[s] }));

							frappe.call({
								method: "frappe.client.insert",
								args: {
									doc: {
										doctype: "Task",
										subject: values.subject,
										description: values.description || "",
										issue: issue_name,
										custom_users: childRows
									}
								},
								callback: function () {
									frappe.show_alert("Task created", "green");
									renderTaskPanel(issue_name);
									self.bindTagEvents(issue_name, leftCol, rightCol);
								}
							});

						}, "New Task");
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
					}

				});
			}

			// ---------------------------
			// 3) Render call panel
			// ---------------------------
			// ------- helper: get customer sales person (kept async) -------
			async function getCustomerSalesPerson(customer) {
				if (!customer) return "";

				const res = await frappe.call({
					method: "renewal_module.custom_module.page.ticket.ticket.get_customer_sales_person",
					args: { customer },
					silent: true
				});

				return res.message || "";
			}

			async function updateCallListCount(issue_name) {
				const tag = $(".tag-item[data-doctype='Call List']");
				tag.find(".call-list-count").remove();

				const canRead = frappe.model.can_read("Call List");
				if (!canRead) {
					tag.hide();
					return;
				}
				tag.show();
				const res = await frappe.call({
					method: "renewal_module.custom_module.page.ticket.ticket.get_permitted_call_list",
					args: { issue_name },
					silent: true
				});
				const list = res.message || [];
				if (list.length > 0) {
					tag.find(".tag-text").after(`
						<span class="badge bg-light px-2 py-1 text-dark me-1 fw-semibold shadow-sm call-list-count">
							${list.length}
						</span>
					`);
				}
			}

			updateCallListCount(issue_name);
			// OPEN CALL FORM
			$(document).off("click", ".call-open").on("click", ".call-open", function () {
				frappe.set_route("Form", "Call List", $(this).data("name"));
			});

			// ADD NEW CALL LIST
			$(document).off("click", "#add-call-btn").on("click", "#add-call-btn", function (e) {
				e.preventDefault();
				e.stopPropagation();
				openNewCallDialog(issue_name);
			});

			const esc = frappe.utils.escape_html;

			function safeId(v) {
				return String(v).replace(/[^a-zA-Z0-9-_]/g, "_");
			}

			function formatDate(dt) {
				if (!dt) return "";
				let s = String(dt);
				if (s.includes(" ")) s = s.split(" ")[0];
				if (s.includes("T")) s = s.split("T")[0];
				const [y, m, d] = s.split("-");
				return `${d}-${m}-${y}`;
			}

			function formatTime(t) {
				if (!t) return "";
				let s = String(t);
				if (s.includes(" ")) s = s.split(" ")[1];
				if (s.includes("T")) s = s.split("T")[1];
				if (s.includes(".")) s = s.split(".")[0];
				return s;
			}

			async function renderCallListPanel(issue_name) {
				// Permission check
				if (!frappe.model.can_read("Call List")) {
					renderRightCard(
						"Call List",
						`<p class="text-muted text-center mt-3">You do not have permission to view Call List.</p>`
					);
					return;
				}
				// 1 SERVER CALL ONLY
				const res = await frappe.call({
					method: "renewal_module.custom_module.page.ticket.ticket.get_permitted_call_list",
					args: { issue_name },
					silent: true
				});
				const list = res.message || [];
				const canCreate = frappe.model.can_create("Call List");
				// No items
				if (!list.length) {
					renderRightCard("Call List",
						`<p class="text-muted text-center mt-3">No Call Lists found.</p>`,
						canCreate ? callListButton() : ""
					);
					return;
				}
				// Build HTML
				const html = list.map(buildCallCard).join("");
				// Render card container
				renderRightCard("Call List", html, canCreate ? callListButton() : "");
				// Lazy-load avatars
				loadCallAvatars(list);
			}

			function callListButton() {
				return `<button class="btn btn-sm btn-primary" id="add-call-btn">+ New Call List</button>`;
			}

			function buildCallCard(c) {
				const id = safeId(c.name);

				return `
					<div class="call-card p-2 mb-2 rounded-3 shadow-sm"
						style="background:#f8f9fa; border:1px solid #e6e6e6;">

						<div class="d-flex justify-content-between align-items-center mb-1">
							<div class="fw-bold text-primary" style="font-size:16px;">
								${esc(c.subject)}
							</div>
							<div id="avatar-${id}">
								${simpleInitialAvatar(c.owner)}
							</div>
						</div>

						<div class="d-flex justify-content-between align-items-center mb-1">
							<span class="text-dark ellipsis" title="${esc(c.name1)}">${esc(c.name1 || "")}</span>

							<span class="call-open badge bg-light p-1"
								data-name="${esc(c.name)}"
								style="border:1px solid #dadada;cursor:pointer;font-size:12px;color:#4c4c5c;">
								${esc(c.name)}
							</span>
						</div>

						<div class="row g-2 small">
							<div class="col-6">
								${c.start_date ? `<div><i class="ti ti-calendar text-warning me-1"></i>${esc(formatDate(c.start_date))}</div>` : ""}
								${c.start_timing ? `<div><i class="ti ti-clock text-primary me-1"></i>${esc(formatTime(c.start_timing))}</div>` : ""}
							</div>

							<div class="col-6">
								${c.end_date ? `<div><i class="ti ti-calendar-event text-warning me-1"></i>${esc(formatDate(c.end_date))}</div>` : ""}
								${c.end_timing ? `<div><i class="ti ti-clock text-primary me-1"></i>${esc(formatTime(c.end_timing))}</div>` : ""}
							</div>
						</div>

						${c.description ? `
							<div class="p-2 mt-2 rounded" style="border:1px solid #eee;background:#fafafa;max-height:200px;overflow:auto;">
								${esc(c.description)}
							</div>
						` : ""}
					</div>
				`;
			}

			function simpleInitialAvatar(owner) {
				const init = (owner || "U").substring(0, 2).toUpperCase();
				return `
					<span class="avatar-wrapper"
						style="width:22px;height:22px;border-radius:50%;background:#4A81D4;color:#fff;
						display:flex;align-items:center;justify-content:center;font-size:11px;">
						${esc(init)}
					</span>`;
			}

			async function loadCallAvatars(list) {
				if (!frappe.model.can_read("User")) return;

				const owners = [...new Set(list.map(x => x.owner))];

				// Batch user fetch — ONE CALL
				const res = await frappe.call({
					method: "frappe.client.get_list",
					args: {
						doctype: "User",
						filters: { name: ["in", owners] },
						fields: ["name", "full_name", "user_image"],
						limit_page_length: owners.length
					},
					silent: true
				});

				const map = {};
				(res.message || []).forEach(u => (map[u.name] = u));

				// Apply avatars
				list.forEach(c => {
					const u = map[c.owner];
					const id = safeId(c.name);
					const holder = document.getElementById(`avatar-${id}`);
					if (!holder) return;

					if (u?.user_image) {
						holder.innerHTML = `
							<span class="avatar-wrapper" title="${esc(u.full_name)}"
								style="width:22px;height:22px;border-radius:50%;overflow:hidden;display:flex;">
								<img src="${u.user_image}" style="width:100%;height:100%;object-fit:cover;">
							</span>`;
					} else {
						const initials = (u?.full_name || c.owner).split(" ")
							.map(w => w[0]).join("").substring(0, 2).toUpperCase();

						holder.innerHTML = `
							<span class="avatar-wrapper" title="${esc(u?.full_name || c.owner)}"
								style="width:22px;height:22px;border-radius:50%;background:#4A81D4;color:#fff;
								display:flex;align-items:center;justify-content:center;font-size:11px;">
								${initials}
							</span>`;
					}
				});
			}

			async function openNewCallDialog(issue_name) {
				// Load default customer from the Issue
				const issue = await frappe.call({
					method: "frappe.client.get_value",
					args: {
						doctype: "Issue",
						filters: { name: issue_name },
						fieldname: ["customer"]
					},
					silent: true
				});
				const default_customer = issue.message?.customer || "";
				const d = frappe.prompt([
					{ label: "Subject", fieldname: "subject", fieldtype: "Data", reqd: true },
					{ fieldtype: "Section Break" },

					{ label: "Related To", fieldname: "related_to", fieldtype: "Select", options: ["Customer", "Contact"], default: "Customer" },
					{ fieldtype: "Column Break" },

					{ label: "Full Name", fieldname: "name1", fieldtype: "Dynamic Link", options: "related_to", reqd: true, default: default_customer },

					{ fieldtype: "Section Break" },
					{ label: "Start Date", fieldname: "start_date", fieldtype: "Date" },
					{ fieldtype: "Column Break" },
					{ label: "Start Time", fieldname: "start_timing", fieldtype: "Time" },

					{ fieldtype: "Section Break" },
					{ label: "End Date", fieldname: "end_date", fieldtype: "Date" },
					{ fieldtype: "Column Break" },
					{ label: "End Time", fieldname: "end_timing", fieldtype: "Time" },

					{ fieldtype: "Section Break" },
					{ label: "Description", fieldname: "description", fieldtype: "Small Text" }
				],
					async function (v) {

						// Find sales person for customer
						const sales_person = (v.related_to === "Customer" && v.name1)
							? await getCustomerSalesPerson(v.name1)
							: "";

						const doc = {
							doctype: "Call List",
							subject: v.subject,
							name1: v.name1,
							related_to: v.related_to,
							description: v.description,
							issue_id: issue_name,
							custom_date: frappe.datetime.get_today(),
							start_date: v.start_date,
							end_date: v.end_date,
							start_timing: v.start_timing,
							end_timing: v.end_timing,
							custom_sales_person: sales_person
						};

						// Insert call
						const insert = await frappe.call({
							method: "frappe.client.insert",
							args: { doc }
						});

						const callName = insert.message.name;

						// Add Sales Team child row
						const userInfo = await frappe.call({
							method: "frappe.client.get_value",
							args: {
								doctype: "User",
								filters: { name: frappe.session.user },
								fieldname: ["full_name", "email", "mobile_no", "phone"]
							}
						});

						const u = userInfo.message || {};

						await frappe.call({
							method: "frappe.client.insert",
							args: {
								doc: {
									parent: callName,
									parenttype: "Call List",
									parentfield: "sales_team",
									doctype: "Sales Team",
									sales_person: u.full_name || frappe.session.user,
									mobile_no: u.mobile_no || u.phone,
									email_id: u.email
								}
							}
						});

						frappe.show_alert("Call created", "green");
						renderCallListPanel(issue_name);
						self.bindTagEvents(issue_name, leftCol, rightCol);
					},
					"New Call List");
				setTimeout(() => {
					const related_to_field = d.fields_dict.related_to.$input;
					const name1_field = d.fields_dict.name1;

					related_to_field.on("change", function () {
						const val = related_to_field.val();

						if (val === "Customer") {
							// Set issue customer
							name1_field.set_value(default_customer);
						} else {
							// Clear for Contact
							name1_field.set_value("");
						}
					});
				}, 300);
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

			}



			// ---------------------------
			// 6) Tag click handler (Task, Call List, call-list-count, task-count)
			// ---------------------------
			$(document)
				.off("click", ".tag-item .tag-text, .tag-item .task-count, .tag-item .call-list-count")
				.on("click", ".tag-item .tag-text, .tag-item .task-count, .tag-item .call-list-count", function () {
					const doctype = $(this).closest(".tag-item").data("doctype");
					if (!doctype) return;

					if (doctype.toLowerCase() === "task") {
						renderTaskPanel(issue_name);
						return;
					}

					if (doctype.toLowerCase() === "call list") {
						renderCallListPanel(issue_name);
						return;
					}
				});

			$(document)
				.off("click", ".tag-item .tag-texts")
				.on("click", ".tag-item .tag-texts", function () {
					const html = `
						<div id="notes-panel">
							<div id="notes-list" class="mt-2"></div>
						</div>
					`;
					let noteBtn = `<button class="btn btn-sm btn-primary" id="add-note-btn">+ New Note</button>`;

					renderRightCard("Quick Notes", html, noteBtn);
					self.loadAndRenderNotes(issue_name, rightCol.find(".sla-body"));
				});


			rightCol
				.off("click", "#add-note-btn")
				.on("click", "#add-note-btn", function () {
					const d = frappe.prompt(
						[{ label: "Note", fieldname: "note", fieldtype: "Small Text", reqd: true }],
						function (values) {
							frappe.call({
								method: "renewal_module.custom_module.page.ticket.ticket.add_issue_note",
								args: { issue_name, note_text: values.note },
								callback: function (r) {
									if (r.message?.notes) self.renderNotesList(r.message.notes);
								}
							});
						},
						"Add Note"
					);
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

			rightCol
				.off("click", ".note-edit")
				.on("click", ".note-edit", function () {
					const idx = $(this).data("idx");
					const currentText = $(this).closest(".note-card").find(".note-text").text().trim();

					const d = frappe.prompt(
						[{ label: "Edit Note", fieldname: "note", fieldtype: "Small Text", default: currentText }],
						function (values) {
							frappe.call({
								method: "renewal_module.custom_module.page.ticket.ticket.update_issue_note",
								args: { issue_name, idx, note_text: values.note },
								callback: function (r) {
									if (r.message?.notes) self.renderNotesList(r.message.notes);
								}
							});
						},
						"Edit Note"
					);
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

			rightCol
				.off("click", ".note-delete")
				.on("click", ".note-delete", function (e) {
					e.preventDefault();
					e.stopPropagation();
					const idx = $(this).data("idx");
					frappe.confirm(
						"Delete this note?",
						() => {
							frappe.call({
								method: "renewal_module.custom_module.page.ticket.ticket.delete_issue_note",
								args: { issue_name, idx },
								callback: function (r) {
									if (r.message?.notes) self.renderNotesList(r.message.notes);
								}
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
				});


			function renderRightCard(title, content, titleButtonHTML = "") {
				rightCol.show();
				leftCol.removeClass("col-lg-12").addClass("col-lg-8");

				rightCol.html(`
					<div class="card sla-compare-card p-3 mb-3 rounded shadow-sm">
						<div class="sla-header mb-2 pb-2 border-bottom d-flex justify-content-between align-items-center">
							<h5 class="sla-title fw-bold text-primary mb-0">${title}</h5>
							${titleButtonHTML}
						</div>
						<div class="sla-body">
							${content}
						</div>
					</div>
				`);
			}


		}



		/* helper to load notes from server and render */
		loadAndRenderNotes(issue_name, rightBody) {
			// show loading
			rightBody.find("#notes-list").html('<div style="text-align:center;color:#666;padding:12px;">Loading notes...</div>');

			const self = this;
			frappe.call({
				method: "renewal_module.custom_module.page.ticket.ticket.get_issue_notes",
				args: { issue_name },
				callback: function (r) {
					const notes = (r.message && r.message.notes) || [];
					self.renderNotesList(notes);
				}
			});
		}

		/* render notes list into #notes-list */
		renderNotesList(notes) {
			const $list = $("#notes-list");
			$list.empty();

			if (!notes.length) {
				$list.html('<p style="color:#888;">No notes added yet.</p>');
				return;
			}

			// sort desc (newest first)
			notes.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

			notes.forEach((note) => {
				const initials = (note.created_by || note.owner || '').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
				const timestamp = note.timestamp ? frappe.datetime.str_to_user(note.timestamp) : '';
				const is_owner = frappe.session.user === note.owner;
				const is_admin = frappe.session.user === 'Administrator';

				// const action_buttons = `
				// 	${is_owner || is_admin ? `<a href="#" class="note-edit me-2" data-idx="${note.idx}">✏️</a>` : ''}
				// 	${is_admin ? `<a href="#" class="note-delete text-danger" data-idx="${note.idx}">🗑️</a>` : ''}
				// `;
				const action_buttons = `
            		${is_owner || is_admin ? `<button class="note-edit btn btn-sm btn-light me-2" data-idx="${note.idx}" style="border:none;background:none;">✏️</button>` : ''}
            		${is_admin ? `<button class="note-delete btn btn-sm btn-light text-danger" data-idx="${note.idx}" style="border:none;background:none;">🗑️</button>` : ''}
        		`;

				const user_avatar = `<div style="width:40px;height:40px;border-radius:50%;background:#007bff;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;margin-right:10px;">${initials}</div>`;

				const html = `
					<div class="note-card mb-2 p-2" style="border:1px solid #eee;border-radius:8px;background:#f8f9fa;	">
						<div style="display:flex;justify-content:space-between;align-items:start;">
							<div style="display:flex;align-items:center;flex:1;">
								${user_avatar}
								<div style="flex:1;">
									<div class="text-muted">${frappe.utils.escape_html(note.created_by || note.owner || '')}</div>
									<div style="font-size:12px;color:#4c4c5c;">${frappe.utils.escape_html(note.custom_role || '')}</div>
								</div>
							</div>
							<div style="margin-left:10px;">${action_buttons}</div>
						</div>
						<div style="margin-top:10px;color:#333;max-height:200px;width:100%;overflow:auto;border:1px solid #efefef;" class="note-text p-1">
							${frappe.utils.escape_html(note.note)}
						</div>
						<div class="mt-2" style="display:flex; justify-content:flex-end;">
							<div style="font-size:12px; color:#777;">
								${timestamp}
							</div>
						</div>

					</div>
				`;
				$list.append(html);
			});
		}




		load_issue_details(issueName, page) {
			// --- Ensure columns exist ---
			const rightCol = $(".rightcol");
			const leftCol = $(".leftcol");

			// --- If issueName is missing or null ---
			if (!issueName) {
				console.warn("No issue name provided, hiding right column.");

				// Hide right column properly
				// rightCol.css("display", "none");
				// leftCol.removeClass("col-lg-8").addClass("col-lg-12");
				rightCol.show();
				leftCol.removeClass("col-lg-12").addClass("col-lg-8");


				// Clear any previous content inside right panel
				rightCol.find(".card-title").text("");
				rightCol.find(".card-body").html(`
					<table class="table table-responsive">
						<thead></thead>
						<tbody></tbody>
					</table>
				`);

				//Force reflow (Bootstrap sometimes keeps hidden col space)
				leftCol.closest(".row").css("display", "flex");

				return; // stop here
			}

			// --- If issueName exists, continue normal flow ---
			frappe.call({
				method: "frappe.client.get",
				args: {
					doctype: "Issue",
					name: issueName
				},
				callback: function (r) {
					if (!r.message) {
						console.warn("Issue not found, hiding right column.");
						// rightCol.hide();
						// leftCol.removeClass("col-lg-8").addClass("col-lg-12");
						rightCol.show();
						leftCol.removeClass("col-lg-12").addClass("col-lg-8");

						return;
					}
					const displayContainer = $("#issuedatadisplay");
					let issue = r.message;
					//console.log("issue", issue);
					window.issue_data = issue;
					function setTextAndTitle(id, value) {
						const val = value || "";
						$(`#${id}`).text(val).attr("title", val);
					}
					//$("#name").text(issue.name).attr("title", issue.name)
					// --- Fill details ---
					setTextAndTitle("name", issue.name);
					setTextAndTitle("customer", issue.customer);
					setTextAndTitle("subject", issue.subject);
					setTextAndTitle("issue-status", issue.status);
					setTextAndTitle("priority", issue.priority);
					setTextAndTitle("raised_by", issue.raised_by);
					setTextAndTitle("creation", frappe.datetime.str_to_user(issue.creation));
					setTextAndTitle("due_date", frappe.datetime.str_to_user(issue.response_by));
					$("#description").html(issue.description || "");


					let html = `
						<div class="row mb-4">
							${issue.department ? `
								<div class="col-md-4 mb-2">
									<h6 class="text-uppercase text-muted">Department</h6>
									<div class="d-flex align-items-center gap-2">
										<span class="ellipsis" title="${issue.department}">${issue.department}</span>
									</div>
								</div>
							`: ""}
							
							${issue.active_subscription ? `
								<div class="col-md-4 mb-2" style="cursor: pointer;" id="active_subscription-details">
									<h6 class="text-uppercase text-muted">Active Subscription</h6>
									<div class="d-flex align-items-center gap-2">
										<span class="ellipsis" title="${issue.active_subscription}">${issue.active_subscription}</span>
									</div>
								</div>
							`: ""}
							
							${issue.working_agent ? `
								<div class="col-md-4 mb-2">
									<h6 class="text-uppercase text-muted">Working Agent</h6>
									<div class="d-flex align-items-center gap-1">
										<div id="working_agent_avatar" class="rounded-circle avatar-sm d-flex align-items-center justify-content-center bg-secondary text-white"></div>
										<span class="ellipsis" title="${issue.working_agent}">${issue.working_agent}</span>
									</div>
								</div>
							`: ""}
					
							${issue.custom_query_type ? `
								<div class="col-md-4 mb-2">
									<h6 class="text-uppercase text-muted">Query Type</h6>
									<div class="d-flex align-items-center gap-2">
										<span class="ellipsis" title="${issue.custom_query_type}">${issue.custom_query_type}</span>
									</div>
								</div>
							`: ""}
							${issue.custom_support_type ? `
								<div class="col-md-4 mb-2">
									<h6 class="text-uppercase text-muted">Support Type</h6>
									<div class="d-flex align-items-center gap-2">
										<span class="ellipsis" title="${issue.custom_support_type}">${issue.custom_support_type}</span>
									</div>
								</div>
							`: ""}
							${issue.issue_contact_list?.length ? `
								<div class="col-md-4 mb-2" id="contact-list-details">
									<div class="d-flex align-items-center mb-1" style="gap: 6px;">
										<h6 class="text-uppercase text-muted mb-0" style="font-weight: 600; letter-spacing: 0.3px;">
											Contact Person
										</h6>
										<i class="ti ti-plus text-warning" 
											id="add-contact-btn" 
											title="Add Contact" 
											style="cursor: pointer; font-size: 16px; font-weight: 700;">
										</i>
									</div>
									<div class="d-flex align-items-start">
										<span id="contact_person" class="ellipsis w-100"></span>
									</div>
								</div>
							`: ""}
						</div>	
						
						
					`;
					displayContainer.html(html);


					// --- Working Agent Avatar ---
					if (issue.working_agent) {
						setTextAndTitle("working_agent", issue.working_agent);
						frappe.db.get_value("User", issue.working_agent, "user_image").then((res) => {
							const avatarDiv = $("#working_agent_avatar");
							const imageUrl = res.message?.user_image;
							if (imageUrl) {
								avatarDiv.css({
									"background-image": `url(${imageUrl})`,
									"background-size": "cover",
									"background-position": "center",
									"color": "transparent",
									"font-size": "0"
								}).text("");
							} else {
								const initials = issue.working_agent.slice(0, 2).toUpperCase();
								avatarDiv.css({
									"background-image": "none",
									"background-color": "#6c757d",
									"color": "#fff",
									"font-size": "0.9rem"
								}).text(initials);
							}
						});
					} else {
						setTextAndTitle("working_agent", "");
						$("#working_agent_avatar").css({
							"background-image": "none",
							"background-color": "#6c757d",
							"color": "#fff",
							"font-size": "0.9rem"
						}).text("");
					}

					// --- Default Layout ---
					// rightCol.hide();
					// leftCol.removeClass("col-lg-8").addClass("col-lg-12");
					rightCol.show();
					leftCol.removeClass("col-lg-12").addClass("col-lg-8");


					$("#active_subscription-details").off("click").on("click", function () {
						if (!issue.active_subscription && (!issue.active_renewals || !issue.active_renewals.length)) {
							frappe.show_alert({ message: __("No active subscription found."), indicator: "orange" });
							return;
						}

						const isRightVisible = rightCol.is(":visible");
						const currentTitle = rightCol.find(".sla-title").text().trim();
						// if (isRightVisible && currentTitle.startsWith("Active Subscription")) {
						// 	rightCol.hide();
						// 	leftCol.removeClass("col-lg-8").addClass("col-lg-12");
						// 	return;
						// }


						const renderActiveRenewals = (rows) => {
							let html = "";
							let cardTitle = "";

							if (rows.length) {
								rows.forEach((row, idx) => {
									// Use the first item's name as the title
									if (idx === 0 && row.item) cardTitle = row.renewal_id || "";

									html += `
										<div class="subscription-item rounded mb-2">
											${row.item ? `
											<div class="detail-item p-2 mb-1">
												<i class="ti ti-package text-success"></i>
												<div class="detail-text">
													<label>Item</label>
													<span>${row.item}</span>
												</div>
											</div>` : ""}

											${row.end_date ? `
											<div class="detail-item p-2 mb-1">
												<i class="ti ti-calendar text-warning"></i>
												<div class="detail-text">
													<label>End Date</label>
													<span>${frappe.datetime.str_to_user(row.end_date)}</span>
												</div>
											</div>` : ""}
										</div>
									`;
								});
							} else {
								html = `<p class="text-muted text-center">No renewals found.</p>`;
							}

							renderRightCard(
								`<div class="sla-title pl-3 pr-3">
									<i class="ti ti-file-invoice text-primary me-1"></i>
									<div class="sla-title-text">
										<div class="sla-subtitle">Active Subscription</div>
										<div class="">${cardTitle}</div>
									</div>
								</div>`,
								html
							);

						};

						if (issue.active_renewals && issue.active_renewals.length) {
							renderActiveRenewals(issue.active_renewals);
						} else {
							frappe.call({
								method: "renewal_module.custom_module.page.ticket.ticket.get_active_subscription_for_issue",
								args: { issue_name: issue.name },
								callback: function (res) {
									const rows = res.message?.renewal_details || [];
									issue.active_renewals = rows;
									renderActiveRenewals(rows);
								}
							});
						}
					});


					if (issue.issue_contact_list?.length) {
						let html = "";
						issue.issue_contact_list.forEach((row, i) => {
							const name = (row.user_name || "").split("-")[0].trim();
							if (name) {
								html += `
									<div class="contact-entry" 
										style="display: flex; align-items: center; 
										width: 100%; padding: 0px 4px; margin-bottom: 1px;
										">
										
										<span class="contact-name text-primary" 
											style="cursor:pointer; display:inline-flex; align-items:center;"
											data-index="${i}">
											${frappe.utils.escape_html(name)}
										</span>

										<i class="ti ti-trash text-danger delete-contact" 
											style="cursor:pointer; font-size:13px; margin-left:3px;" 
											title="Remove Contact"
											data-rowname="${row.name}"></i>
									</div>`;

							}
						});

						$("#contact-list-details span.ellipsis").html(html);
						//Ensure the contact column is visible if data exists
						$("#contact-list-details").closest(".col-md-4").show();

						// 👇 CSS hover effect (icon only visible on hover)
						$(`<style>
							.contact-entry:hover .delete-contact {
								display: inline-block !important;
							}
						</style>`).appendTo("head");
					} else {
						$("#contact-list-details span.ellipsis").text("").attr("title", "");
					}

					// ---------------- CLICK HANDLER FOR INDIVIDUAL CONTACTS ----------------
					$("#contact-list-details").off("click", ".contact-name").on("click", ".contact-name", async function () {
						//if (window.preventRightPanelAutoHide) return;
						const index = $(this).data("index");
						const updatedIssue = await frappe.db.get_doc("Issue", issueName);
						const row = updatedIssue.issue_contact_list[index];
						//const row = issue.issue_contact_list[index];
						if (!row) return;

						const selectedName = (row.user_name || "").split("-")[0].trim();
						const isRightVisible = rightCol.is(":visible");
						const currentTitle = rightCol.find(".sla-title").text().trim();

						// if (isRightVisible && currentTitle === selectedName) {
						// if (isRightVisible && currentTitle.startsWith(selectedName)) {
						// 	rightCol.hide();
						// 	leftCol.removeClass("col-lg-8").addClass("col-lg-12");
						// 	return;
						// }
						let html = `
							<div class="contact-details-modern space-y-3">
								${row.email_id ? `
								<div class="detail-item">
									<i class="ti ti-mail text-primary"></i>
									<div class="detail-text">
										<label>Email</label>
										<span>${row.email_id}</span>
									</div>
								</div>` : ""}
								
								${row.mobile_no ? `
								<div class="detail-item">
									<i class="ti ti-phone text-success"></i>
									<div class="detail-text">
										<label>Mobile No</label>
										<span>${row.mobile_no}</span>
									</div>
								</div>` : ""}
								
								${row.designation ? `
								<div class="detail-item">
									<i class="ti ti-id text-warning"></i>
									<div class="detail-text">
										<label>Designation</label>
										<span>${row.designation}</span>
									</div>
								</div>` : ""}
							</div>
						`;

						renderRightCard(
							`<div class="sla-title pl-3 pr-3">
									<i class="ti ti-user text-primary me-1"></i>
									<div class="sla-title-text">
										<div class="">${selectedName}</div>
									</div>
								</div>`,
							html
						);


					});
					// ---- DEFAULT RIGHT PANEL CONTENT (Contact Person) ----
					function loadDefaultRightPanel() {
						// If contact exists, load first contact
						if (issue.issue_contact_list && issue.issue_contact_list.length > 0) {
							const first = issue.issue_contact_list[0];
							const name = (first.user_name || "").split("-")[0].trim();
							let html = `
								<div class="contact-details-modern space-y-3">
									${first.email_id ? `
									<div class="detail-item">
										<i class="ti ti-mail text-primary"></i>
										<div class="detail-text">
											<label>Email</label>
											<span>${first.email_id}</span>
										</div>
									</div>` : ""}
									
									${first.mobile_no ? `
									<div class="detail-item">
										<i class="ti ti-phone text-success"></i>
										<div class="detail-text">
											<label>Mobile No</label>
											<span>${first.mobile_no}</span>
										</div>
									</div>` : ""}
									
									${first.designation ? `
									<div class="detail-item">
										<i class="ti ti-id text-warning"></i>
										<div class="detail-text">
											<label>Designation</label>
											<span>${first.designation}</span>
										</div>
									</div>` : ""}
								</div>
							`;

							renderRightCard(
								`<i class="ti ti-user text-primary me-1"></i> <span>${name}</span>`,
								html
							);
						}
						else {
							renderRightCard(
								`<i class="ti ti-user-off text-danger"></i> No Contacts`,
								`<p class="text-muted">No contact details available.</p>`
							);
						}
					}

					loadDefaultRightPanel();



					// ------------------- ACTIVITY TIMELINE -------------------
					$("#add-comment-btn").off("click").on("click", function () {
						const text = $("#new-comment-input").val().trim();
						if (!text) {
							frappe.msgprint("Please enter a comment.");
							return;
						}
						frappe.call({
							method: "renewal_module.custom_module.page.ticket.ticket.add_custom_comment",
							args: {
								docname: issueName,
								content: text
							},
							callback: function (r) {
								if (!r.exc) {
									frappe.show_alert({ message: "Comment added", indicator: "green" });
									$("#new-comment-input").val("");
									loadActivityTimeline(issueName);
								}
							}
						});
					});

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
					function loadActivityTimeline(issueName) {
						frappe.call({
							method: "renewal_module.custom_module.page.ticket.ticket.get_issue_activity",
							args: { issue_name: issue.name },
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
									<div class="timeline-item d-flex align-items-stretch w-100">
										<div class="timeline-time pe-3 text-muted">${act.timestamp || ""}</div>
										<div class="timeline-dot bg-${act.color || "secondary"}"></div>
										<div class="timeline-content frappe-card ps-3 pb-4 mb-1 ml-1">
										<h6 class="mb-1 fs-sm text-muted">${act.title || ""}</h6>
										${descriptionHtml}
										<span class="text-primary d-block mt-2">By ${act.by || ""}</span>
										</div>
									</div>`;
									});
								} else {
									html = `<p class="text-muted text-center">No activity found for this issue.</p>`;
								}

								container.html(html);
							}
						});
					}
					loadActivityTimeline(issue.name);


					function renderRightCard(title, content) {
						rightCol.show();
						leftCol.removeClass("col-lg-12").addClass("col-lg-8");

						rightCol.html(`
							<div class="card sla-compare-card p-3 mb-3 rounded shadow-sm">
								<div class="sla-header mb-1 pb-1 border-bottom">
									<h5 class="sla-title fw-bold text-primary mb-0">${title}</h5>
								</div>
								
								<div class="sla-body">
									${content}
								</div>
							</div>
						`);
					}

					$("#sla-list-details").off("click").on("click", function () {
						const sla = issue.service_level_agreement;

						if (!sla) {
							frappe.show_alert({ message: __("No SLA details found."), indicator: "orange" });
							return;
						}

						const isRightVisible = rightCol.is(":visible");
						const currentTitle = rightCol.find(".sla-title").text().trim();

						const slaTitle = sla || "SLA Details";

						// if (isRightVisible && currentTitle === slaTitle) {
						// 	rightCol.hide();
						// 	leftCol.removeClass("col-lg-8").addClass("col-lg-12");
						// 	return;
						// }


						function formatDuration(seconds) {
							if (!seconds || isNaN(seconds)) return "";
							const days = Math.floor(seconds / (24 * 3600));
							seconds %= 24 * 3600;
							const hours = Math.floor(seconds / 3600);
							seconds %= 3600;
							const minutes = Math.floor(seconds / 60);
							const secs = Math.floor(seconds % 60);
							let parts = [];
							if (days) parts.push(`${days}d`);
							if (hours) parts.push(`${hours}h`);
							if (minutes) parts.push(`${minutes}m`);
							if (secs || parts.length === 0) parts.push(`${secs}s`);
							return parts.join(" ");
						}

						// --- Fetch first responder ---
						let first_responded_by = "";
						try {
							frappe.call({
								method: "renewal_module.custom_module.page.ticket.ticket.get_first_responder",
								args: { issue_name: issue.name },
								async: false,
								callback: function (r) {
									if (r.message) {
										first_responded_by = r.message.first_responded_by || "";
									}
								}
							});
						} catch (e) {
							console.warn("Error fetching first responder:", e);
						}

						// --- Fetch who closed the ticket ---
						let closed_by = "";
						if (issue.status === "Closed") {
							try {
								frappe.call({
									method: "renewal_module.custom_module.page.ticket.ticket.get_closed_by_for_issue",
									args: { issue_name: issue.name },
									async: false,
									callback: function (r) {
										if (r.message && r.message.closed_by) {
											closed_by = r.message.closed_by;
										}
									}
								});
							} catch (e) {
								console.warn("Error fetching Closed By user:", e);
							}
						}

						const data = {
							service_level_agreement: issue.service_level_agreement || "",
							response_by: issue.response_by ? frappe.datetime.str_to_user(issue.response_by) : "",
							sla_resolution_by: issue.sla_resolution_by ? frappe.datetime.str_to_user(issue.sla_resolution_by) : "",
							first_responded_by: first_responded_by || "",
							closed_by: closed_by || "",
							first_responded_on: issue.first_responded_on ? frappe.datetime.str_to_user(issue.first_responded_on) : "",
							first_response_time: issue.first_response_time ? formatDuration(issue.first_response_time) : "",
							sla_resolution_date: issue.sla_resolution_date ? frappe.datetime.str_to_user(issue.sla_resolution_date) : "",
							resolution_time: issue.resolution_time ? formatDuration(issue.resolution_time) : "",
							user_resolution_time: issue.user_resolution_time ? formatDuration(issue.user_resolution_time) : "",
						};

						let responded_within_sla = false;
						if (issue.first_responded_on && issue.response_by) {
							const responseBy = frappe.datetime.str_to_obj(issue.response_by);
							const firstRespondedOn = frappe.datetime.str_to_obj(issue.first_responded_on);
							responded_within_sla = firstRespondedOn <= responseBy;
						}

						let resolved_within_sla = false;
						if (issue.sla_resolution_date && issue.sla_resolution_by) {
							const resolutionBy = frappe.datetime.str_to_obj(issue.resolution_by);
							const resolvedOn = frappe.datetime.str_to_obj(issue.sla_resolution_date);
							resolved_within_sla = resolvedOn <= resolutionBy;
						}

						function splitDateTime(dtString) {
							if (!dtString) return "";
							let parts = dtString.split(" ");
							if (parts.length === 2) {
								return `<div class="sla-datetime"><div>${parts[0]}</div><div>${parts[1]}</div></div>`;
							} else {
								return `<div>${dtString}</div>`;
							}
						}

						let html = `
							<!-- Response Time -->
							${data.response_by && data.first_responded_on ? `
							<div class="sla-row">
								<div class="sla-label-row">
									<span>Response Due By</span>
									<span>Responded On
									${responded_within_sla
									? `<span class="sla-circle success" title="Within SLA"><i class="ti ti-check"></i></span>`
									: `<span class="sla-circle danger" title="Breached SLA"><i class="ti ti-x"></i></span>`}
									</span>
								</div>
								<div class="sla-value-row">
									${splitDateTime(data.response_by)}
									<span>${splitDateTime(data.first_responded_on)} <span>${data.first_responded_by}</span></span>
								</div>
							</div>` : ""}

							<!-- Resolution Time -->
							${data.sla_resolution_by && data.sla_resolution_date ? `
							<div class="sla-row">
								<div class="sla-label-row">
									<span>Resolution Due By</span>
									<span>Resolved On
									${resolved_within_sla
									? `<span class="sla-circle success" title="Within SLA"><i class="ti ti-check"></i></span>`
									: `<span class="sla-circle danger" title="Breached SLA"><i class="ti ti-x"></i></span>`}
									</span>
								</div>
								<div class="sla-value-row">
									<span>${splitDateTime(data.sla_resolution_by)}</span>
									<span>${splitDateTime(data.sla_resolution_date)} <span>${data.closed_by}</span></span>
								</div>
							</div>` : ""}

							<!-- Working Time -->
							${data.user_resolution_time ? `
							<div class="sla-row">
								<div class="sla-label-row single"><span>User Working Time</span></div>
								<div class="sla-value-row single"><span>${data.user_resolution_time}</span></div>
							</div>` : ""}
						`;

						//renderRightCard("SLA Details", html);
						renderRightCard(data.service_level_agreement || "SLA Details", html);

					});

					//more details
					$("#more-details-btn").off("click").on("click", function () {
						let html = ``;
						html += `
								<div class="contact-details-modern space-y-3">
									${issue.sales_person ? `
									<div class="detail-item">
										<i class="ti ti-user-check text-primary"></i>
										<div class="detail-text">
											<label>Salesperson</label>
											<span>${issue.sales_person}</span>
										</div>
									</div>` : ""}
									
									${issue.raised_by ? `
									<div class="detail-item">
										<i class="ti ti-user text-success"></i>
										<div class="detail-text">
											<label>Raised By</label>
											<span>${issue.raised_by}</span>
										</div>
									</div>` : ""}
								</div>
							`;
						renderRightCard("More Details", html);
					});


				}
			});
		}

		async show_work_timer(issue_name) {
			try {
				const res = await frappe.call({
					method: "renewal_module.custom_issue.get_issue_timer",
					args: { issue_id: issue_name }
				});

				if (!res || !res.message) return;

				//console.log("⏱️ Timer data:", res.message);

				const timerEl = document.getElementById("live-work-timer");
				if (!timerEl) return;

				// Clear existing interval
				if (window.issueLiveTimerInterval) clearInterval(window.issueLiveTimerInterval);

				// Get working seconds (if available)
				let seconds = res.message.working_seconds || 0;

				// Helper: format time HH:MM:SS
				function formatTime(secs) {
					const h = Math.floor(secs / 3600);
					const m = Math.floor((secs % 3600) / 60);
					const s = secs % 60;
					return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
				}

				timerEl.textContent = formatTime(seconds);

				const current_user = frappe.session.user;
				const issue_doc = await frappe.db.get_doc('Issue', issue_name);
				const working_agent = issue_doc.working_agent;

				const $timer = $(".custom-work-timer");
				const $startBtn = $(".custom-start-btn");

				// Hide all by default
				$startBtn.addClass("d-none");
				$timer.addClass("d-none");

				// Only proceed if current user = working_agent
				if (current_user !== working_agent) {
					//console.log("🚫 Current user not working agent");
					return;
				}

				const open_log_res = await frappe.call({
					method: "renewal_module.custom_issue.has_open_timelog",
					args: { issue_id: issue_name, user: current_user }
				});

				const has_open_log = open_log_res && open_log_res.message === true;

				if (has_open_log) {
					//console.log("🕒 Open time log found — starting live timer");
					$startBtn.addClass("d-none");
					$timer.removeClass("d-none");

					window.issueLiveTimerInterval = setInterval(() => {
						seconds++;
						timerEl.textContent = formatTime(seconds);
					}, 1000);
				} else {
					//console.log("▶️ No open time log — show Start button");
					$startBtn.removeClass("d-none");
				}


				// Start button click handler
				$startBtn.off("click").on("click", async () => {
					try {
						//console.log("🔘 Start clicked");
						$startBtn.addClass("d-none");
						$timer.removeClass("d-none");

						// Create new time log entry
						const start_time = frappe.datetime.now_datetime();

						await frappe.call({
							method: "renewal_module.issue_hooks.start_time_log",
							args: {
								issue: issue_name,

							}
						});

						// Start live timer
						seconds = 0;
						if (window.issueLiveTimerInterval) clearInterval(window.issueLiveTimerInterval);
						window.issueLiveTimerInterval = setInterval(() => {
							seconds++;
							timerEl.textContent = formatTime(seconds);
						}, 500);

						frappe.show_alert({ message: "Timer started", indicator: "green" });
					} catch (err) {
						console.error("Error creating time log:", err);
						frappe.msgprint("Failed to start timer.");
						$startBtn.removeClass("d-none");
						$timer.addClass("d-none");
					}
				});
			} catch (e) {
				console.error("Error fetching issue timer:", e);
			}
		}


		///new ticket methods

		bind_issue_form_events() {
			//console.log("Binding New Issue form events...");
			const me = this;
			const form = document.getElementById("new-issue-form");
			if (!form) return;

			const statusBox = document.createElement("div");
			form.appendChild(statusBox);
			// 🔹 Hide fields initially
			const activesubscriptionwrapper = document.getElementById("activesubscription-field");
			const querytypewrapper = document.getElementById("querytype-field");
			activesubscriptionwrapper.style.display = "none";
			querytypewrapper.style.display = "none";

			// Basic field controls
			let subjectControl = frappe.ui.form.make_control({
				parent: document.getElementById("subject-field"),
				df: { fieldtype: "Data", reqd: 1, label: "Subject" },
				render_input: true
			});

			let selectedSalesperson = "";
			// when customer changes, filter contact list users
			let customerControl = frappe.ui.form.make_control({
				parent: document.getElementById("customer-field"),
				df: {
					fieldtype: "Link",
					options: "Customer",
					reqd: 1,
					label: "Customer",
					onchange: function () {
						const cust = customerControl.get_value();
						//console.log("Customer onchange triggered. Selected Customer:", cust);
						toggleSubscriptionAndQueryType();
						if (cust && cust.trim() !== "") {
							//console.log("Customer selected. Applying filters and fetching account manager...");
							// 🧩 Fetch active subscriptions (Renewal List items) for this customer
							frappe.call({
								method: "frappe.client.get_list",
								args: {
									doctype: "Renewal List",
									fields: ["name", "product_name"],
									filters: {
										customer_name: cust,
										status: ["in", ["Active", "Cofed"]]
									},
									limit_page_length: 100
								},
								callback: function (r) {
									console.log("Fetched Renewal List:", r.message);
									if (r && r.message) {
										// Map product names to options
										let options = [""].concat(r.message.map(item => item.product_name));
										// let uniqueProducts = [...new Set(r.message.map(item => item.product_name))];
										// let options = [""].concat(uniqueProducts);
										activesubscriptionControl.df.options = options.join("\n");
										activesubscriptionControl.refresh();
									} else {
										activesubscriptionControl.df.options = [""];
										activesubscriptionControl.refresh();
									}
								}
							});
							frappe.db.get_value("Customer", cust, "account_manager", (r) => {
								if (r && r.account_manager) {
									selectedSalesperson = r.account_manager;
									//console.log("salesperson:", selectedSalesperson);
								} else {
									selectedSalesperson = "";
									//console.log("No account manager found for this customer.");
								}
							});

						} else {
							//console.log("No customer selected. Resetting salesperson and clearing filters.");
							selectedSalesperson = "";
						}
					}

				},
				render_input: true
			});

			let departmentControl = frappe.ui.form.make_control({
				parent: document.getElementById("department-field"),
				df: {
					fieldtype: "Select",
					options: ["", "Technical", "Accounts Team & Billing", "Sales", "Demo", "Other"],
					reqd: 1,
					label: "Department",
					onchange: function () {
						toggleSubscriptionAndQueryType();
					}
				},
				render_input: true
			});

			function toggleSubscriptionAndQueryType() {
				const cust = customerControl.get_value();
				const dept = departmentControl.get_value();

				if (cust && dept === "Technical") {
					// Show fields
					activesubscriptionwrapper.style.display = "block";
					querytypewrapper.style.display = "block";
				} else {
					// Hide fields
					activesubscriptionwrapper.style.display = "none";
					querytypewrapper.style.display = "none";
				}
			}

			let activesubscriptionControl = frappe.ui.form.make_control({
				parent: document.getElementById("activesubscription-field"),
				df: { fieldtype: "Select", options: "", label: "Active Subscription" },
				render_input: true
			});


			let descriptionControl = frappe.ui.form.make_control({
				parent: document.getElementById("description-field"),
				df: { fieldtype: "Text Editor", label: "Description" },
				render_input: true
			});

			let querytypeControl = frappe.ui.form.make_control({
				parent: document.getElementById("querytype-field"),
				df: { fieldtype: "Select", options: ["", "Installation", "Configuration", "Update", "Others"], label: "Query Type" },
				render_input: true
			});

			querytypeControl.$input.on("change", function () {
				const selectedQueryType = querytypeControl.get_value();
				//console.log("Query Type selected:", selectedQueryType);

				if (taskMetaMap[selectedQueryType]) {
					const meta = taskMetaMap[selectedQueryType];
					selectedPriority = meta.priority || "";
					selectedSupportType = meta.support_type || "";
					//console.log(`Auto-filled priority: ${selectedPriority}, support type: ${selectedSupportType}`);
				} else {
					selectedPriority = "";
					selectedSupportType = "";
				}
			});

			let selectedPriority = "";
			let selectedSupportType = "";
			let taskMetaMap = {}; // Store task metadata for each query type

			function setupContactPersonSection(me) {
				const contactContainer = $("#contact-list-container");
				const addButton = $("#add-contact-person");

				let contactList = [];

				//Render Contact List
				function renderContactList() {
					if (!contactList.length) {
						contactContainer.html(`<span class="text-muted">No contacts added.</span>`);
						return;
					}

					let html = "";
					contactList.forEach((row, i) => {
						const name = (row.user_name || "").split("-")[0].trim();
						html += `
							<div class="d-flex  align-items-center mb-1">
								<span class="contact-name text-primary me-1 ellipsis" style="cursor:pointer;">${name}</span>
								<i class="ti ti-trash text-danger delete-contact" 
									data-index="${i}" 
									style="cursor:pointer;" 
									title="Remove Contact"></i>
							</div>
						`;
					});
					contactContainer.html(html);
				}

				// Add Contact Popup
				addButton.off("click").on("click", function () {
					const selected_customer = customerControl?.get_value?.();

					if (!selected_customer) {
						frappe.msgprint("Please select a Customer first.");
						return;
					}

					const dialog = new frappe.ui.Dialog({
						title: __("Add Contact Person"),
						fields: [
							{
								label: "Contact",
								fieldname: "user_name",
								fieldtype: "Link",
								options: "Contact",
								reqd: 1,
								get_query: () => ({
									filters: { company_name: selected_customer }
								})
							},
							{
								label: "Mobile No",
								fieldname: "mobile_no",
								fieldtype: "Data",
								read_only: 1,
								hidden: 1
							},
							{
								label: "Email ID",
								fieldname: "email_id",
								fieldtype: "Data",
								read_only: 1,
								hidden: 1
							},
							{
								label: "Designation",
								fieldname: "designation",
								fieldtype: "Data",
								read_only: 1,
								hidden: 1
							}
						],
						primary_action_label: __("Add"),
						primary_action(values) {
							if (!values.user_name) return;

							// prevent duplicates
							if (contactList.some(c => c.user_name === values.user_name)) {
								frappe.show_alert({
									message: __("Contact already added."),
									indicator: "orange"
								});
								dialog.hide();
								return;
							}

							contactList.push({
								user_name: values.user_name,
								mobile_no: values.mobile_no || "",
								email_id: values.email_id || "",
								designation: values.designation || ""
							});

							renderContactList();
							dialog.hide();
						}
					});

					// Auto-fill on contact select
					dialog.fields_dict.user_name.df.onchange = async function () {
						const contact = dialog.get_value("user_name");
						if (!contact) return;

						const res = await frappe.db.get_doc("Contact", contact);
						if (res) {
							dialog.set_value("mobile_no", res.phone || "");
							dialog.set_value("email_id", res.email_id || "");
							dialog.set_value("designation", res.designation || "");
						}
					};

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

				// 🔹 Remove Contact
				$(document).off("click", ".delete-contact").on("click", ".delete-contact", function () {
					const index = $(this).data("index");
					contactList.splice(index, 1);
					renderContactList();
				});

				me.getContactList = () => contactList;
				me.resetContactList = function () {
					contactList = [];
					renderContactList();
				};

			}

			// Initialize contact section
			frappe.after_ajax(() => {
				setupContactPersonSection(me);
			});

			let activeRenewalsData = [];
			// When Active Subscription changes → fetch renewal list data + dynamic query type options
			activesubscriptionControl.$input.on("change", function () {
				const selected_item = activesubscriptionControl.get_value();
				const selected_customer = customerControl.get_value();
				//console.log("Active Subscription changed:", selected_item, "for customer:", selected_customer);
				if (!selected_item || !selected_customer) {
					console.warn("Customer or subscription not selected, skipping data load.");
					activeRenewalsData = []; // clear stored data
					// reset query type to default
					//querytypeControl.df.options = ["", "Installation", "Configuration", "Update", "Others"].join("\n");
					//querytypeControl.refresh();
					return;
				}

				// Fetch Renewal List entry for this customer + product
				frappe.call({
					method: "frappe.client.get_list",
					args: {
						doctype: "Renewal List",
						fields: ["name", "product_name", "start_date", "end_date", "total_quantity", "total_amount"],// "sla_product"],
						filters: {
							customer_name: selected_customer,
							product_name: selected_item,
							status: ["in", ["Active", "Cofed"]]
						},
						limit_page_length: 1
					},
					callback: function (r) {
						if (r && r.message && r.message.length > 0) {
							const renewal = r.message[0];
							//console.log("✅ Renewal List entry:", renewal);

							// Store active renewal data
							activeRenewalsData = [{
								item: renewal.product_name,
								start_date: renewal.start_date,
								end_date: renewal.end_date,
								quantity: renewal.total_quantity,
								amount: renewal.total_amount,
								renewal_id: renewal.name
							}];

							// 🔹 If Renewal List has an SLA Product, fetch its related Item (custom_tasks)
							/*if (renewal.sla_product) {
								frappe.call({
									method: "frappe.client.get",
									args: {
										doctype: "Item",
										name: renewal.sla_product
									},
									callback: function (res) {
										if (!res.message) {
											console.warn("⚠️ No Item found for SLA Product:", renewal.sla_product);
											return;
										}

										const itemDoc = res.message;
										const taskData = itemDoc.custom_sla_tasks || [];
										//console.log("custom_sla_tasks:", taskData);

										let tasks = [];
										taskMetaMap = {}; // reset map

										if (Array.isArray(taskData)) {
											taskData.forEach(t => {
												if (t.task && !tasks.includes(t.task)) {
													tasks.push(t.task);
													taskMetaMap[t.task] = {
														priority: t.priority || "",
														support_type: t.custom_support_type || ""
													};
												}
											});
										}

										if (tasks.length > 0) {
											//console.log("✅ Dynamic Query Type options:", tasks);
											querytypeControl.df.options = ["", ...tasks].join("\n");
											querytypeControl.refresh();
										} else {
											//console.log("⚠️ No tasks found, using defaults");
											querytypeControl.df.options = ["", "Installation", "Configuration", "Update", "Others"].join("\n");
											querytypeControl.refresh();
										}
									}
								});
							} else {
								//console.log("⚠️ No SLA Product linked. Using standard query types.");
								querytypeControl.df.options = ["", "Installation", "Configuration", "Update", "Others"].join("\n");
								querytypeControl.refresh();
							}*/
						} else {
							//console.log("No active renewals found for this selection.");
							activeRenewalsData = [];
							//querytypeControl.df.options = ["", "Installation", "Configuration", "Update", "Others"].join("\n");
							//querytypeControl.refresh();
						}
					}
				});
			});

			// Handle form submission
			form.addEventListener("submit", function (e) {
				e.preventDefault();
				const subject = subjectControl.get_value();
				const customer = customerControl.get_value();
				const department = departmentControl.get_value();
				const custom_query_type = querytypeControl.get_value();
				const description = descriptionControl.get_value();
				const activesubscription = activesubscriptionControl.get_value();
				const contact_list = me.getContactList?.() || [];
				const priority = selectedPriority || "Medium";
				const support_type = selectedSupportType || "Remote Type";

				if (!subject || !customer || !department) {

					frappe.msgprint({
						title: __("message"),
						message: __("Please fill required fields"),
						indicator: "red"
					});
					return;
				}

				if (contact_list.length < 2) {
					frappe.msgprint({
						title: __("Add Contact Persons"),
						message: __("Please add at least <b>two contact persons</b> before submitting the issue."),
						indicator: "red"
					});
					return;
				}

				//statusBox.innerHTML = `<div class="alert alert-info mt-2">Creating issue...</div>`;

				// Prepare Issue doc for insertion
				const new_issue_doc = {
					doctype: "Issue",
					subject,
					customer,
					department,
					description,
					custom_query_type,
					sales_person: selectedSalesperson || "",
					raised_by: frappe.session?.user || "",
					active_subscription: activesubscription,
					priority,
					support_type,
					// ✅ Include child tables
					issue_contact_list: contact_list.map(row => {
						return {
							user_name: row.user_name,
							email_id: row.email_id || "",
							mobile_no: row.mobile_no || "",
							designation: row.designation || ""
						};
					}),
					active_renewals: activeRenewalsData.map(row => ({
						item: row.item,
						start_date: row.start_date,
						end_date: row.end_date,
						quantity: row.quantity,
						amount: row.amount,
						renewal_id: row.renewal_id
					}))
				};

				//console.log("Submitting Issue doc:", new_issue_doc);

				// Insert Issue via frappe.client.insert
				frappe.call({
					method: "frappe.client.insert",
					args: {
						doc: new_issue_doc
					},
					callback: (r) => {
						if (r.message) {
							const issue_name = r.message.name;

							// statusBox.innerHTML = `
							// <div class="alert alert-success mt-2">
							// 	Issue <b>${issue_name}</b> created successfully.
							// </div>`;

							//console.log("✅ Issue created:", r.message);

							// ✅ Show success popup
							frappe.show_alert({
								message: __("Issue {0} created successfully.", [issue_name]),
								indicator: "green"
							}, 5);

							// ✅ Redirect to Issue Theme Details page after 1 second
							setTimeout(() => {
								window.location.href = `/app/ticket/${issue_name}`;
							}, 1000);

							// Reset form fields (optional if you redirect anyway)
							form.reset();
							subjectControl.set_value("");
							customerControl.set_value("");
							departmentControl.set_value("");
							querytypeControl.set_value("");
							descriptionControl.set_value("");
							selectedSalesperson = "";
							activesubscriptionControl.set_value("");
							activesubscriptionControl.df.options = "";
							if (me.resetContactList) me.resetContactList();
							activeRenewalsData = [];

							document.getElementById("activerenewals-field").style.display = "none";
							document.getElementById("activesubscription-field").style.display = "none";
							document.getElementById("salesperson-field").style.display = "none";

						} else {
							statusBox.innerHTML = `<div class="alert alert-danger mt-2">Failed to create issue.</div>`;
						}
					},
					// error: (err) => {
					// 	statusBox.innerHTML = `<div class="alert alert-danger mt-2">Error creating issue.</div>`;
					// 	console.error("Issue creation failed:", err);
					// }
					error: (err) => {
						frappe.msgprint({
							title: __("Error"),
							message: __(err?.message || err || "An unexpected error occurred."),
							indicator: "red"
						});
						console.error("Issue creation failed:", err);
					}

				});

			});
		}


	}

	window.ticketPage = ticketPage;
}

frappe.ticket_page = {
	body: `
		<div class="wrapper ticket-wrapper">
			<!-- ============================================================== -->
			<!-- Start Main Content -->
			<!-- ============================================================== -->
			<div class="content-page">
				<div class="container-fluid ticket-list-view d-none" style="background-color:#F3F4F6;">

					<div class="page-title-head d-flex align-items-center" style="padding:5px;">
						<div class="flex-grow-1">
							<h4 class="fs-xl fw-bold m-0">Tickets</h4>
						</div>
						<div class="text-end">
							<ol class="breadcrumb m-0 py-0">
								<li class="breadcrumb-item"><a href="javascript: void(0);">Support</a></li>
								<li class="breadcrumb-item active">Tickets</li>
							</ol>
						</div>
					</div>

					<div class="row row-cols-lg-5 row-cols-md-2 row-cols-1 align-items-stretch g-2 hidden">
						<!-- Open Tickets Widget -->
						<div class="col d-flex">
							<div class="card ticket-status-card h-100 flex-fill" data-status="Open" style="border-left:4px solid #6677E5;">
								<div class="card-body p-1">
									<div class="d-flex justify-content-between align-items-center">
										<div class="avatar fs-60 avatar-img-size flex-shrink-0">
											<span class="avatar-title bg-primary-subtle text-primary rounded-circle fss-24">
												<i class="ti ti-ticket"></i>
											</span>
										</div>
										<div class="text-end">
											<h3 class="mb-2 fw-semibold"><span class="f-24" id="open-tickets-count">0</span></h3>
											<p class="mb-0 text-muted"><span>Open Tickets</span></p>
										</div>
									</div>
								</div>
							</div>
						</div><!-- end col -->

						<!-- Resolved Tickets Widget -->
						<div class="col d-flex">
							<div class="card ticket-status-card h-100 flex-fill" data-status="Resolved" style="border-left:4px solid #1ABC9C;">
								<div class="card-body p-1">
									<div class="d-flex justify-content-between align-items-center">
										<div class="avatar fs-60 avatar-img-size flex-shrink-0">
											<span class="avatar-title bg-success-subtle text-success rounded-circle fss-24">
												<i class="ti ti-check"></i>
											</span>
										</div>
										<div class="text-end">
											<h3 class="mb-2 fw-semibold"><span class="f-24" id="resolved-tickets-count">0</span></h3>
											<p class="mb-0 text-muted"><span>Resolved Tickets</span></p>
										</div>
									</div>
								</div>
							</div>
						</div><!-- end col -->

						<!-- Pending Tickets Widget -->
						<div class="col d-flex">
							<div class="card ticket-status-card h-100 flex-fill" data-status="Pending" style="border-left:4px solid #F3576C;">
								<div class="card-body p-1">
									<div class="d-flex justify-content-between align-items-center">
										<div class="avatar fs-60 avatar-img-size flex-shrink-0">
											<span class="avatar-title bg-info-subtle text-info rounded-circle fss-24">
												<i class="ti ti-hourglass"></i>
											</span>
										</div>
										<div class="text-end">
											<h3 class="mb-2 fw-semibold"><span class="f-24" id="pending-tickets-count">0</span></h3>
											<p class="mb-0 text-muted"><span>Pending Tickets</span></p>
										</div>
									</div>
								</div>
							</div>
						</div><!-- end col -->

						<!-- Closed Tickets Widget -->
						<div class="col d-flex">
							<div class="card ticket-status-card h-100 flex-fill" data-status="Closed" style="border-left:4px solid #008000;">
								<div class="card-body p-1">
									<div class="d-flex justify-content-between align-items-center">
										<div class="avatar fs-60 avatar-img-size flex-shrink-0">
											<span class="avatar-title bg-danger-subtle text-danger rounded-circle fss-24">
												<i class="ti ti-alert-triangle"></i>
											</span>
										</div>
										<div class="text-end">
											<h3 class="mb-2 fw-semibold"><span class="f-24" id="closed-tickets-count">0</span></h3>
											<p class="mb-0 text-muted"><span>Closed Tickets</span></p>
										</div>
									</div>
								</div>
							</div>
						</div><!-- end col -->
						<!-- Escalated Tickets Widget -->
						<div class="col d-flex">
							<div class="card ticket-status-card h-100 flex-fill" data-status="Escalated" style="border-left:4px solid #6677E5;">
								<div class="card-body p-1">
									<div class="d-flex justify-content-between align-items-center">
										<div class="avatar fs-60 avatar-img-size flex-shrink-0">
											<span class="avatar-title bg-danger-subtle text-danger rounded-circle fss-24">
												<i class="ti ti-alert-triangle"></i>
											</span>
										</div>
										<div class="text-end">
											<h3 class="mb-2 fw-semibold"><span class="f-24" id="escalated-tickets-count">0</span></h3>
											<p class="mb-0 text-muted"><span>Escalated Tickets</span></p>
										</div>
									</div>
								</div>
							</div>
						</div><!-- end col -->
					</div>

					<div class="row mt-1">
						<div class="col-12">
							<div class="card">
								<div class="card-header border-light justify-content-between p-1" style="border-bottom:none;">
									<div class="page-form flex flex-wrap align-items-center gap-3 w-100" style="border-bottom:none;">
										<div class="standard-filter-section flex flex-wrap gap-2 align-items-center">

											<!-- Status Filter -->
											<div class="app-search">
												<select data-table-filter="status"
													class="form-select form-control my-1 my-md-0">
													<option value="">Status</option>
													<option value="Open">Open</option>
													<option value="Pending">Pending</option>
													<option value="Resolved">Resolved</option>
													<option value="Closed">Closed</option>
													<option value="Escalated">Escalated</option>
												</select>
												<i data-lucide="shuffle" class="app-search-icon text-muted"></i>
											</div>

											<!-- Priority Filter -->
											<div class="app-search">
												<select data-table-range-filter="priority"
													class="form-select form-control my-1 my-md-0">
													<option value="">Priority</option>
													<option value="Low">Low</option>
													<option value="Medium">Medium</option>
													<option value="High">High</option>
													<option value="Urgent">Urgent</option>
												</select>
												<i data-lucide="alert-triangle" class="app-search-icon text-muted"></i>
											</div>

										</div>
										<div class="action-buttons flex gap-3 flex-wrap">
											<div class="btn-group">
												<button class="btn btn-default btn-sm filter-button" title="Filters">
													<span class="filter-icon">
														<svg class="es-icon es-line icon-sm" aria-hidden="true">
															<use href="#es-line-filter"></use>
														</svg>
													</span>
													<span class="button-label hidden-xs">Filters</span>
												</button>
												<button class="btn btn-default btn-sm filter-x-button" title="Clear all filters">
													<span class="filter-icon">
														<svg class="es-icon es-line icon-sm" aria-hidden="true">
															<use href="#es-small-close"></use>
														</svg>
													</span>
												</button>
											</div>

											<a id="new-ticket-btn" href="/app/ticket/new-ticket" class="btn btn-primary">
												<i class="ti ti-plus me-1"></i> New Ticket
											</a>

											<div class="dropdown d-none" id="actions-dropdown">
												<button class="btn btn-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">
													Actions
												</button>
												<ul class="dropdown-menu">
													<li class="user-action"><a class="dropdown-item" href="#" data-action="set_open">Set as Open</a></li>
													<li class="user-action"><a class="dropdown-item" href="#" data-action="set_closed">Set as Closed</a></li>
													<li class="dropdown-divider"></li>
													<li><a class="dropdown-item" href="#" data-action="edit">Edit</a></li>
													<li><a class="dropdown-item" href="#" data-action="export">Export</a></li>
													<li><a class="dropdown-item" href="#" data-action="assign_to">Assign To</a></li>
													<li><a class="dropdown-item" href="#" data-action="apply_rule">Apply Assignment Rule</a></li>
													<li><a class="dropdown-item" href="#" data-action="add_tags">Add Tags</a></li>
													<li><a class="dropdown-item" href="#" data-action="print">Print</a></li>
													<li class="delete-action"><a class="dropdown-item" href="#" data-action="delete">Delete</a></li>
												</ul>
											</div>

										</div>
									</div>
								</div>

								<div class="card-body p-0">
									<div class="table-responsive p-1" style="min-height:50vh;">
										<table
											class="table table-custom table-centered table-select table-hover w-100 mb-0">
											<thead class="bg-light align-middle bg-opacity-25 thead-sm text-nowrap">
												<tr class="text-uppercase fs-xxs">
													<th class="ps-3" style="width: 1%;">
													<input data-table-select-all class="form-check-input form-check-input-light fs-14 mt-0" type="checkbox">
													</th>
													<th data-table-sort data-column="name">ID</th>
													<th data-table-sort data-column="subject">Subject</th>
													<th data-table-sort data-column="priority">Priority</th>
													<th data-table-sort data-column="customer">Customer</th>
													<th data-table-sort data-column="sla_due_time">SLA Due Time </th>
													<th data-table-sort data-column="status">Status</th>
													<th data-table-sort data-column="creation">Created On</th>
													<th data-table-sort data-column="working_agent">Working Agent</th>
													<th class="text-center" style="width: 1%;">Actions</th>
												</tr>
											</thead>

											<tbody class="text-nowrap">
												<tr class="loading-placeholder">
													<td colspan="10" class="text-center py-4">
														<div class="spinner-border text-primary" role="status">
															<span class="visually-hidden">Loading...</span>
														</div>
														<div class="mt-2 text-muted">Fetching tickets, please wait...</div>
													</td>
												</tr>
											</tbody>
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
											<!-- Visible Rows / Total Rows -->
											<div class="pagination-info d-none d-sm-block me-3">
												<span class="visible-count">0</span> / <span class="total-count">0</span>
											</div>
											<div class="p-2">
												<button class="btn btn-default btn-more btn-sm">Load More</button>
											</div>
										</div>
									</div>
									<!-- Visible Rows / Total Rows (show on mobile only) -->
									<div class="pagination-info d-block d-sm-none text-muted text-center mt-2">
										<span class="visible-count">0</span> / <span class="total-count">0</span>
									</div>
								</div>

							</div>
						</div>
					</div>

				</div>

				<div class="container-fluid ticket-details-view d-none" style="background-color:#F3F4F6;">
					
					<div class="page-title-head d-flex align-items-center" style="padding:5px;">
						<div class="flex-grow-1">
							<h4 class="fs-xl fw-bold m-0">Tickets</h4>
						</div>
						<div class="text-end">
							<ol class="breadcrumb m-0 py-0">
								<li class="breadcrumb-item"><a href="javascript: void(0);">Support</a></li>
								<li class="breadcrumb-item"><a href="/app/ticket">Tickets</a></li>
							</ol>
						</div>
					</div>

					<div class="page-title-head p-2 d-flex justify-content-between align-items-center flex-wrap">

						<div class="d-flex align-items-center flex-grow-1 mb-2 mb-md-0" style="min-width: 0;">
							<h5 class="mb-0 d-flex align-items-center gap-1" style="min-width:0; max-width:100%;">
								<span id="name">#SUP-2523</span>
								<span class="mx-1 text-muted">—</span>
								<span id="customer" class="text-ellipsis" style="flex-grow:1;" title="App freezes when uploading files">
									App freezes when uploading files
								</span>
							</h5>
						</div>

						
						<div class="right-actions d-flex align-items-center gap-2 flex-wrap text-end">
							<button id="sla-list-details" class="btn btn-primary btn-sm">
								SLA Details
							</button>
							<button id="change-status-btn" class="btn btn-success btn-sm">
								Change Status
							</button>
							<button id="custom-start-timer" class="btn btn-info btn-sm custom-start-btn d-none">
								Start
							</button>
							<div class="custom-work-timer d-none"
								style="background:#001f4d; color:white; padding:5px 5px; border-radius:5px; font-weight:bold; font-size:12px;">
								<span id="live-work-label">⏱️ Work Hrs:</span>
								<span id="live-work-timer">00:00:00</span>
							</div>
						</div>

					</div>

					<div class="row">
						<div class="leftcol">
							<div class="card">

								<div class="card-header d-flex justify-content-between align-items-center" style="border-bottom:none;">
									<div class="d-flex align-items-center">
										<h5 class="mb-0 d-flex align-items-center">
											<span class="text-muted ellipsis mr-1" id="subject" style="color:#4c4c5c !important;"></span>-
											<span class="badge bg-danger ms-1" id="priority"></span>
										</h5>
									</div>

									<div class="d-flex align-items-center gap-2">
										<span class="badge text-bg-warning me-1" id="issue-status" style="padding:3px;"></span>
										<span class="btn btn-secondary" style="cursor:pointer;font-size:12px;padding:5px;border:1px solid #ffffff;">
											<i class="ti ti-mail"></i>
										</span>
										<div class="dropdown" id="actions-dropdown">
											<button class="btn btn-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false" style="font-size:12px;border:1px solid #ffffff;">
												Actions
											</button>
											<ul class="dropdown-menu">
												<li class="user-action">
													<a class="dropdown-item" href="#" data-action="set_working_agent">Set working agent</a>
												</li>
											</ul>
										</div>
									</div>
								</div>



								<div class="card-body">

									<div id="issuedatadisplay"></div>

									<!-- Description -->
									<!--<div class="mb-4" id="description-section">
										<div class="d-flex align-items-center mb-1" style="gap: 6px;">
											<h6 class="text-uppercase text-muted mb-0" 
												style="font-weight: 600; letter-spacing: 0.3px;">
											Description
											</h6>
											<i class="ti ti-pencil text-warning" 
											id="editBtn"
											title="Edit Description"
											style="
												cursor: pointer; 
												font-size: 16px; 
												font-weight: 700;
												display: flex; 
												align-items: center; 
												justify-content: center;
												margin-top: 0px;
											">
											</i>
										</div>

										<div id="description-container" class="p-2 border rounded">
											<p class="mb-1" id="description"></p>
										</div>
									</div>-->

									<div class="mb-4" id="description-section">
										<div class="d-flex align-items-center justify-content-between mb-1" style="gap: 6px;">
											<h6 class="text-uppercase text-muted mb-0" 
												style="font-weight: 600; letter-spacing: 0.3px;">
											Description
											</h6>
											<button id="saveDescBtn" class="btn btn-success btn-sm d-none" title="Save Description" style="padding:0px 5px;">
												Save
											</button>


										</div>

										<div id="description-container" class="p-2" style="border:1px solid #E7E9EB; border-radius:5px;">
											<p class="mb-1" id="description"></p>
										</div>
									</div>

									<!--<i class="ti ti-check text-success d-none" id="saveDescBtn" title="Save Description" style="cursor: pointer; font-size: 16px; font-weight: 700;"></i>-->


									<!-- Tags -->
									<div class="mb-4">
										<h6 class="text-uppercase text-muted mb-2">Connections</h6>
										<div class="d-flex flex-wrap gap-2">
											<div class="tag-item d-flex align-items-center" data-doctype="Task">
												<span class="badge bg-light px-2 py-1 text-dark  me-1 fw-semibold shadow-sm tag-text" style="cursor:pointer;">
													Tasks
												</span>
												<!--<span class="badge bg-light px-2 py-1 text-dark shadow-sm tag-add d-flex align-items-center justify-content-center" style="cursor:pointer;">
													<i data-lucide="plus"></i>
												</span>-->
											</div>


											<div class="tag-item d-flex align-items-center" data-doctype="Call List">
												<span class="badge bg-light px-2 py-1 tag-text me-1 fw-semibold text-dark shadow-sm" style="cursor:pointer;">Call List</span>
												<!--<span class="badge bg-light px-2 py-1 text-dark shadow-sm tag-add d-flex align-items-center justify-content-center" style="cursor:pointer;">
													<i data-lucide="plus"></i>
												</span>-->
											</div>

											<div class="tag-item d-flex align-items-center" data-doctype="issue">
												<span class="tag-texts badge bg-light text-dark shadow-sm px-2 py-1 me-1 fw-semibold" style="cursor:pointer;">Quick Notes</span>
											</div>

											<div class="d-flex align-items-center" id="more-details-btn">
												<span class="badge bg-light text-dark shadow-sm px-2 py-1 me-1 fw-semibold" style="cursor:pointer;">More</span>
											</div>

										</div>
									</div>


									<div class="mb-4">
										<div class="comment-section mt-3">
											<textarea id="new-comment-input" placeholder="Write a comment..." class="form-control" style="min-height:40px;">
											</textarea>
											<button id="add-comment-btn" class="btn btn-primary mt-2" style="padding:0px 5px;font-size:11px;">Add Comment</button>
										</div>
									</div>


									<!-- Activity Section -->
									<div class="mb-4">
										<h6 class="text-uppercase text-muted mb-4">Activity:</h6>
										<div class="timeline" id="activity-timeline">
											<p class="text-muted">Loading activity...</p>
										</div>
									</div>

								</div>
							</div>
						</div> <!-- end col-->

						<div class="rightcol col-lg-4">
							<div class="card sla-compare-card p-3 mb-3 rounded shadow-sm">
							</div>
						</div>

						
					</div>


				</div>

				<div class="container-fluid new-ticket d-none" style="background-color: #F3F4F6;">
					<div class="row p-2">
						<div class="card">
							<div class="card-body" style="padding:5px;">
								<h4 class="mb-1">New Issue</h4>
								<form id="new-issue-form">
									<div class="row">
										<div class="col-12">
											<div class="mb-3">
												<div id="subject-field"></div>
											</div>
										</div>
									</div>

									<div class="row">
										<div class="col-6">
											<div class="mb-3">
												<div id="customer-field"></div>
											</div>
										</div>
										<div class="col-6">
											<div class="mb-3">
												<div id="department-field"></div>
											</div>
										</div>
									</div>

									<div class="row">
										<div class="col-6">
											<div class="mb-3">
												<div id="activesubscription-field"></div>
											</div>
										</div>
										<div class="col-6">
											<div class="mb-3">
												<div id="querytype-field"></div>
											</div>
										</div>
									</div>

									<div class="row">
										<div class="col-6">
											<div class="mb-3">
												<label class="control-label">
													Contact Person
													<i id="add-contact-person" class="fa fa-plus text-primary ms-1" style="cursor:pointer;" title="Add Contact"></i>
												</label>
												<div id="contact-list-container" class="ps-2"></div>
											</div>

										</div>
									</div>


									<div class="row">
										<div class="col-12">
											<div class="mb-3">
												<div id="description-field"></div>
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
								©<span class="fw-semibold">64 Network Security Pvt Ltd</span> 
							</div>
						</div>
					</div>
				</footer>

			</div>
		</div>
	`
}				