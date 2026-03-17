/*frappe.pages['issue-theme'].on_page_load = (wrapper) => {
	//console.log("on_page_load triggered");
	new issueThemePage(wrapper);
};**/

frappe.pages['issue-theme'].on_page_load = (wrapper) => {
	//console.log("on_page_load triggered");
	new issueThemePage(wrapper);
};

frappe.router.on('change', () => {
	const route = frappe.get_route();
	if (frappe.issue_theme_page && route[0] !== "issue-theme") {
		location.reload(); // Reload the page
	} else if (frappe.issue_theme_page && route[0] === "issue-theme") {
		// Safely attempt to re-initialize assets or fall back to reload
		try {
			if (frappe.issue_theme_page && typeof frappe.issue_theme_page.load_assets === "function") {
				frappe.issue_theme_page.load_assets(() => {
					if (typeof frappe.issue_theme_page.make === "function") {
						frappe.issue_theme_page.make();
					}
				});
			} else {
				// Fallback to ensure a consistent state
				location.reload();
			}
			setTimeout(() => {
				if (typeof frappe.issue_theme_page.initDropdowns === "function") {
					frappe.issue_theme_page.initDropdowns();
				}
			}, 800);
		} catch (err) {
			console.error("Failed to re-initialize issue theme page on route change:", err);
			location.reload();
		}
	}
});

if (!window.MyissuethemePageDefined) {
	window.MyissuethemePageDefined = true;
	class issueThemePage {
		constructor(wrapper) {
			this.wrapper = wrapper;

			this.page = frappe.ui.make_app_page({
				parent: wrapper,
				title: '',
				single_column: true
			});
			// paging config
			this.page_length = 20;       // default visible rows
			this.LOAD_MORE_SIZE = 50;    // +50 per Load More
			this.visible_count = 0;
			this.all_tickets = [];       // cached tickets
			this.selected_tickets = new Set();
			//this.load_assets(() => this.make());
			this._cache = {
				css: [],         // href strings
				js: [],          // src strings
				inlineScripts: [], // strings
				rendered_html: null
			};
			this.make();
			//frappe.my_issue_theme_assets = this.createAssetManager(this);
			frappe.my_issue_theme_assets = this.createAssetManager(this, "issue-theme");

		}

		make() {
			// Append HTML body (ensure `frappe.issue_theme_page.body` is defined)
			if (frappe.issue_theme_page && frappe.issue_theme_page.body) {
				$(this.page.main).append(frappe.issue_theme_page.body);
			} else {
				console.warn("frappe.issue_theme_page.body is not defined");
			}
			// initialize theme scripts (safe)
			this.initialize_theme_scripts();
			this.load_support_page();
			// bind pagination buttons early (they may exist in the appended body)
			this.bindPaginationEvents();
			// fetch counts and tickets (force fetch on first load)
			this.fetch_ticket_counts();
			this.setup_status_card_clicks();
			this.bindFilterEvents();
			this.bindRowSelectionHandler();
			this.bindActionDropdownHandler();

			// ✅ Define statusFilter once
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


		initialize_theme_scripts() {
			try {
				if (typeof App !== "undefined") new App().init();
				if (typeof LayoutCustomizer !== "undefined") new LayoutCustomizer().init();
				if (typeof Plugins !== "undefined") new Plugins().init();
				if (typeof I18nManager !== "undefined") new I18nManager().init();
				// if your custom_table needs manual init, do it here AFTER DOM append
				if (typeof CustomTable !== "undefined") {
					// new CustomTable(); // uncomment if required
				}
			} catch (err) {
				console.error("Theme init failed:", err);
			}
		}

		load_support_page() {
			//console.log("📄 Loading support page...");
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

		async process_and_render_html(html) {
			//console.group("Asset Injection & HTML Rendering");
			const temp = document.createElement("div");
			temp.innerHTML = html;

			// --- collect CSS hrefs and inject them (tagged) ---
			temp.querySelectorAll('link[href]').forEach(link => {
				const href = link.getAttribute('href');
				if (!href) return;
				// record in cache if not already
				if (this._cache.css.indexOf(href) === -1) this._cache.css.push(href);

				// only inject if not present
				if (!document.querySelector(`link[href="${href}"][data-issue-theme="true"]`) &&
					!document.querySelector(`link[href="${href}"]`)) {
					const css = document.createElement('link');
					css.rel = 'stylesheet';
					css.href = href;
					css.dataset.issueTheme = "true";
					document.head.appendChild(css);
					//console.log(`CSS injected: ${href}`);
				} else {
					//console.log(`CSS exists or tagged already: ${href}`);
				}
			});

			// --- collect external JS srcs and prepare load promises ---
			const scriptPromises = [];
			temp.querySelectorAll('script[src]').forEach(script => {
				const src = script.getAttribute('src');
				if (!src) return;
				if (src.toLowerCase().includes("popper")) {
					//console.warn("Skipping Popper injection to avoid duplicate loading:", src);
					return;
				}
				if (this._cache.js.indexOf(src) === -1) this._cache.js.push(src);

				// only add and load if no script with same src is present
				if (!document.querySelector(`script[src="${src}"][data-issue-theme="true"]`) &&
					!document.querySelector(`script[src="${src}"]`)) {
					const promise = new Promise((resolve, reject) => {
						const s = document.createElement('script');
						s.src = src;
						s.defer = true;
						s.dataset.issueTheme = "true";
						s.onload = () => {
							//console.log(`Loaded JS: ${src}`);
							resolve(src);
						};
						s.onerror = () => { console.warn(`Failed to load JS: ${src}`); reject(src); };
						document.body.appendChild(s);
					});
					scriptPromises.push(promise);
				} else {
					//console.log(`JS exists or tagged already: ${src}`);
				}
			});

			// --- collect inline script text ---
			this._cache.inlineScripts = this._cache.inlineScripts || [];
			temp.querySelectorAll('script:not([src])').forEach(script => {
				const code = script.textContent && script.textContent.trim();
				if (code) {
					this._cache.inlineScripts.push(code);
					//console.log("Found inline script block (cached).");
				}
				script.remove();
			});

			// --- store rendered html (as fragment) into cache ---
			this._cache.rendered_html = temp.innerHTML;

			temp.querySelectorAll('style').forEach(styleTag => {
				styleTag.dataset.issueTheme = "true";
			});


			// --- remove leftover link/script tags from temp (we already handled them) ---
			temp.querySelectorAll('link, script').forEach(tag => tag.remove());

			// --- inject HTML into wrapper BEFORE .content-page ---
			const $wrapper = $(this.page.main).find('.wrapper');
			const $contentPage = $wrapper.find('.content-page').first();

			if ($contentPage.length) {
				$contentPage.before(temp.innerHTML);
				//console.log("Inserted rendered HTML before .content-page");
			} else if ($wrapper.length) {
				$wrapper.prepend(temp.innerHTML);
				//console.log("Prepended rendered HTML to .wrapper (no .content-page)");
			} else {
				$(this.page.main).prepend(temp.innerHTML);
				console.warn(".wrapper not found, HTML inserted in page.main");
			}

			//console.groupEnd();

			// --- wait for externals to load, then run inline code and initialize theme/ui ---
			try {
				await Promise.allSettled(scriptPromises);
				//console.log("External scripts settled — running inline scripts (cached).");

				// run only newly cached inline scripts (execute all cached ensures behavior same on reapply)
				(this._cache.inlineScripts || []).forEach(code => {
					try {
						const fn = new Function(code);
						fn();
						//console.log("Inline script executed successfully");
					} catch (err) {
						console.error("Inline script execution error:", err);
					}
				});
				this.initialize_theme_scripts();
				// reinit bootstrap UI after a short delay
				setTimeout(() => this.reinit_bootstrap_ui(), 300);
			} catch (err) {
				console.warn("Some scripts failed:", err);
				this.initialize_theme_scripts();
				setTimeout(() => this.reinit_bootstrap_ui(), 300);
			}

		}

		reinit_bootstrap_ui() {
			try {
				//console.group("Reinitializing Bootstrap UI components");
				// bootstrap v5 detection
				if (window.bootstrap && bootstrap.Dropdown) {
					document.querySelectorAll('[data-bs-toggle="dropdown"]').forEach(el => {
						try { new bootstrap.Dropdown(el); } catch (_) { }
					});
					document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(el => {
						try { new bootstrap.Tooltip(el); } catch (_) { }
					});
					document.querySelectorAll('[data-bs-toggle="popover"]').forEach(el => {
						try { new bootstrap.Popover(el); } catch (_) { }
					});
				} else if (window.jQuery && $.fn.dropdown) {
					$('[data-toggle="dropdown"]').dropdown();
					$('[data-toggle="tooltip"]').tooltip();
					$('[data-toggle="popover"]').popover();
				}
				//console.log("Dropdowns, tooltips, popovers reinitialized");
				//console.groupEnd();
			} catch (err) {
				console.error("Failed to reinitialize Bootstrap UI:", err);
			}
		}

		//asset manager uses instance cache and wrapper to cleanup/reapply everything
		createAssetManager(instance) {
			const pageWrapperSelector = () => {
				// try to find same wrapper inside current page DOM
				const pageMain = instance.page && instance.page.main ? instance.page.main : document;
				return $(pageMain).find('.wrapper').get(0);
			};

			return {
				cleanup() {
					console.group("🧹 Cleaning up new-issue assets");
					let removed_css = 0, removed_js = 0, removed_style = 0;

					if (!frappe.issue_theme_page) frappe.issue_theme_page = {};
					frappe.issue_theme_page._inline_styles_backup = [];

					// Use instance._cache instead of undefined global variable
					const cache = instance._cache || { css: [], js: [] };

					// --- 1. Remove CSS files we injected or matching support_dashboard.css ---
					cache.css.forEach(href => {
						const el = document.querySelector(`link[href="${href}"]`);
						if (el) {
							el.remove();
							removed_css++;
							//console.log(" Removed CSS:", href);
						}
					});
					// fallback: if any leftover support_dashboard.css without tag
					document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
						const href = link.getAttribute('href') || "";
						if (href.includes("issue_theme.css")) {
							link.remove();
							removed_css++;
							//console.log("Removed leftover support_dashboard.css");
						}
					});

					// --- 3. Remove inline <style> tags added dynamically ---
					document.querySelectorAll('style').forEach(el => {
						const text = el.textContent.trim();
						if (text.includes('.issue-theme') || text.includes('#issue-theme') || el.dataset.issueTheme === "true") {
							frappe.issue_theme_page._inline_styles_backup.push(text);
							el.remove();
							removed_style++;
							//console.log('Removed inline <style> tag.');
							//console.log('Removing inline <style>:', text.substring(0, 2500) + '...');
						}
					});

					// --- 4. Remove injected HTML inside wrapper except .content-page ---
					const wrapperEl = (() => {
						const pageMain = instance.page && instance.page.main ? instance.page.main : document;
						return $(pageMain).find('.wrapper').get(0);
					})();
					if (wrapperEl) {
						Array.from(wrapperEl.children).forEach(child => {
							if (!child.classList.contains('content-page')) child.remove();
						});
						//console.log("Removed injected HTML from .wrapper");
					}

					//console.log(`Cleanup completed — removed ${removed_css} CSS, ${removed_js} JS, ${removed_style} inline styles.`);
					//console.groupEnd();
				},

				reapply() {
					console.group("Reapplying new-issue assets");
					// re-inject CSS files from cache (avoid duplicates)
					(instance._cache.css || []).forEach(href => {
						if (!document.querySelector(`link[href="${href}"]`)) {
							const css = document.createElement('link');
							css.rel = 'stylesheet';
							css.href = href;
							css.dataset.issueTheme = "true";
							document.head.appendChild(css);
							//console.log("Re-injected CSS:", href);
						}
					});

					// re-inject JS files from cache (add new script tags)
					const jsPromises = (instance._cache.js || []).map(src => {
						return new Promise((resolve) => {
							// if script already exists, skip
							if (document.querySelector(`script[src="${src}"]`)) {
								//console.log("JS already present, skipping re-inject:", src);
								return resolve();
							}
							const s = document.createElement('script');
							s.src = src;
							s.defer = true;
							s.dataset.issueTheme = "true";
							s.onload = () => {
								//console.log("Re-loaded JS:", src); 
								resolve();
							};
							s.onerror = () => { console.warn("Failed to reload JS:", src); resolve(); };
							document.body.appendChild(s);
						});
					});

					// after scripts reloaded, reinsert HTML + run inline scripts + init
					Promise.allSettled(jsPromises).then(() => {
						// reinsert rendered html BEFORE .content-page
						const wrapperEl = pageWrapperSelector();
						if (wrapperEl) {
							// make sure no duplicate: remove injected children (except .content-page) then insert
							Array.from(wrapperEl.children).forEach(child => {
								if (!child.classList.contains('content-page')) child.remove();
							});

							// insert cached HTML
							if (instance._cache.rendered_html) {
								// insert as DOM nodes
								const frag = document.createRange().createContextualFragment(instance._cache.rendered_html);
								// place before .content-page if exists
								const contentEl = wrapperEl.querySelector('.content-page');
								if (contentEl) wrapperEl.insertBefore(frag, contentEl);
								else wrapperEl.prepend(frag);
								//console.log("Reinserted cached rendered HTML into .wrapper");
							}
						}

						// run cached inline scripts
						(instance._cache.inlineScripts || []).forEach(code => {
							try {
								const fn = new Function(code);
								fn();
								//console.log("Re-executed inline script");
							} catch (err) {
								console.error("Inline script re-exec error:", err);
							}
						});

						// reinitialize theme and UI
						try {
							instance.initialize_theme_scripts();
						} catch (err) {
							console.error("Error during re-initialize theme scripts:", err);
						}
						// and reinit bootstrap UI
						setTimeout(() => instance.reinit_bootstrap_ui(), 500);

						console.groupEnd();
					});
				}
			};
		}

		initDropdownHandlers() {
			const wrapper = this.page.wrapper[0] || this.page.wrapper;

			// Rebind EVERY bootstrap dropdown manually
			wrapper.querySelectorAll('[data-bs-toggle="dropdown"]').forEach(el => {
				try {
					// Dispose old one if exists
					const instance = bootstrap.Dropdown.getInstance(el);
					if (instance) instance.dispose();

					// Reattach
					new bootstrap.Dropdown(el);
				} catch (e) {
					console.error("Dropdown init failed:", e);
				}
			});

			//console.log("✔ Dropdowns re-initialized successfully");
		}

		fetch_ticket_counts() {
			frappe.call({
				method: "renewal_module.custom_module.page.issue_theme.issue_theme.get_ticket_counts",
				callback: (r) => {
					if (r.message) {
						const data = r.message;
						$("#open-tickets-count").text(data["Open"] || 0);
						$("#resolved-tickets-count").text(data["Resolved"] || 0);
						$("#pending-tickets-count").text(data["Pending"] || 0);
						$("#closed-tickets-count").text(data["Closed"] || 0);
					}
				}
			});
		}

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
						method: "renewal_module.custom_module.page.issue_theme.issue_theme.get_list_data",
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
							<span class="link-reset">${ticket.working_agent || 'Unassigned'}</span>
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

					// 💾 Save current filters (query string) before navigation
					try {
						const qs = window.location.search || "";
						localStorage.setItem("issue_theme_last_filters", qs);
						//console.log("Saved filters before opening details:", qs);
					} catch (err) {
						console.error("Failed to save filters:", err);
					}

					// Navigate to the custom details page
					frappe.set_route("issue-theme-details", issueName);
				});

		}

		setup_status_card_clicks() {
			const wrapper = this.page.wrapper[0] || this.page.wrapper;
			const me = this;
			// Prevent rapid double-clicks creating duplicate fetches
			let lastClickTime = 0;
			const clickDebounceMs = 250;
			wrapper.querySelectorAll(".ticket-status-card").forEach(card => {
				card.removeEventListener?.("click", card._issueClickHandler); // in case of re-init
				const handler = (ev) => {
					const now = Date.now();
					if (now - lastClickTime < clickDebounceMs) return;
					lastClickTime = now;
					const clickedStatus = card.dataset.status || "";
					// Toggle: if clicking same status, clear filter
					if (this.active_status && this.active_status === clickedStatus) {
						this.active_status = "";
						// clear status UI element if present
						const statusEl = wrapper.querySelector('[data-table-filter="status"]');
						if (statusEl) statusEl.value = "";
					} else {
						this.active_status = clickedStatus || "";
						const statusEl = wrapper.querySelector('[data-table-filter="status"]');
						if (statusEl) statusEl.value = this.active_status;
					}
					// update card visuals
					wrapper.querySelectorAll(".ticket-status-card").forEach(c => {
						const isActive = (c.dataset.status && c.dataset.status === this.active_status && this.active_status);
						c.classList.toggle("active-status-card", isActive);
						c.style.boxShadow = isActive ? "0 0 0 3px rgba(102,119,229,0.3)" : "";
					});
					// reset pagination and fetch fresh data
					me.fetch_list_data({ reset: true, saved_filters: me.saved_filters });
					// update URL param
					const newUrl = new URL(window.location.href);
					if (this.active_status) newUrl.searchParams.set("status", this.active_status);
					else newUrl.searchParams.delete("status");
					window.history.replaceState({}, "", newUrl.toString());
				};
				card.addEventListener("click", handler);
				// keep ref so we can remove it later if needed
				card._issueClickHandler = handler;
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
							method: "renewal_module.custom_module.page.issue_theme.issue_theme.apply_assignment_rule",
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
	}
	window.issueThemePage = issueThemePage;



}


frappe.issue_theme_page = {
	body: `
		<div class="wrapper">

			<div class="content-page">

				<div class="container-fluid" style="background-color:#F3F4F6;">

					<div class="page-title-head d-flex align-items-center">
						<div class="flex-grow-1">
							<h4 class="fs-xl fw-bold m-0">Tickets</h4>
						</div>
						<div class="text-end">
							<ol class="breadcrumb m-0 py-0">
								<!--<li class="breadcrumb-item"><a href="javascript: void(0);">UBold</a></li>-->
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
					</div><!-- end row -->

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

											<a id="new-ticket-btn" href="/app/new-issue" class="btn btn-primary">
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

			<!-- ============================================================== -->
			<!-- End of Main Content -->
			<!-- ============================================================== -->


		</div>
		
	`
}
