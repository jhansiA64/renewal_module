
frappe.pages['ticket'].on_page_load = function (wrapper) {
	localStorage.removeItem('tickets_page_length');
	new ticketspage(wrapper);
};

frappe.pages['ticket'].on_page_show = function (wrapper) {
	//console.log("🔄 Tickets page showing", wrapper);
	console.log("🔄 Ticket page showing");
	const pageWrapper = wrapper || $(".page")[0] || document.body;
	const ensureSupportLayoutLoaded = (cb) => {
		if (typeof loadSupportLayout === "function") return cb();
		frappe.require(["/assets/renewal_module/js/issue_themes/support_layout.js"], () => {
			setTimeout(cb, 10);
		});
		frappe.require([
			"/assets/renewal_module/css/issue_themes/support_nav.css",
		]);
	};
	ensureSupportLayoutLoaded(() => {
		loadSupportLayout(pageWrapper, () => {
			if (!frappe.tickets_page || frappe.tickets_page.wrapper !== pageWrapper) {
				frappe.tickets_page = new ticketspage(pageWrapper);
			}
			frappe.tickets_page.render();
		});
	});
};

// Keep the right panel content reachable on small screens by mirroring it into a modal
function showRightPanelModal(title, cardHtml, titleButtonHTML = "") {
	const modal = $("#mobile-sla-modal");
	if (!modal.length) return;

	const isDesktop = window.matchMedia("(min-width: 992px)").matches;
	if (isDesktop) {
		if (window.bootstrap?.Modal) {
			bootstrap.Modal.getInstance(modal[0])?.hide();
		} else if (modal.modal) {
			modal.modal("hide");
		}
		return;
	}

	// modal.find(".modal-title").html(title || "");
	modal.find(".modal-actions").html("");
	modal.find(".modal-body").html(cardHtml || "");

	if (window.bootstrap?.Modal) {
		bootstrap.Modal.getOrCreateInstance(modal[0]).show();
	} else if (modal.modal) {
		modal.modal("show");
	}
}




class ticketspage {
	constructor(wrapper) {
		this.wrapper = wrapper;

		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: '',
			single_column: true
		});
		this.page_length = 20;
		this.LOAD_MORE_SIZE = 50;
		this.visible_count = 0;
		this.all_tickets = [];
		this.selected_tickets = new Set();
		this.active_working_agent = [];
		this.workTimerInterval = null;
	}

	render() {

		const waitForContent = () => {
			const $content = $("#support-page-content");
			if (!$content.length) {
				// wait until layout injects DOM
				setTimeout(waitForContent, 50);
				return;
			}
			$content.empty().append(frappe.tickets_page_template.body);
			this.handleRoute();
		};

		waitForContent();
	}


	handleRoute() {
		const route = frappe.get_route();
		console.log("handleRoute:", route);
		// ticket
		if (route.length === 1) {
			return this.show_list();
		}
		// ticket/new-tickets
		if (route.length === 2 && route[1] === "new-tickets") {
			return this.show_new();
		}
		// ticket/<issue_id>
		if (route.length === 2) {
			const issue_id = route[1];
			return this.show_details(issue_id);
		}
	}

	setPageTitle(title) {
		document.title = title; // Browser tab title
		this.page.set_title(title); // ERPNext body title
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

	// ...sidebar active code...
	setActiveSidebar() {
		const route = frappe.get_route();
		const baseRoute = route[0]; // "ticket"
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


	show_list() {
		this.reset_work_timer_ui();
		$(".ticket-list-view").removeClass("d-none");
		$(".ticket-details-view").addClass("d-none");
		$(".new-tickets").addClass("d-none");
		setTimeout(async () => {
			try {
				this.setPageTitle("Ticket");
				this.setActiveSidebar();

				this.bindPaginationEvents();
				// fetch counts and tickets (force fetch on first load)
				this.bindFilterEvents();
				this.bindStatusSummaryEvents();
				this.bindRowSelectionHandler();
				this.bindActionDropdownHandler();
				this.applyRoleBasedActionVisibility();
				this.bindActionDropdown();
				await this.loadFilters();
				this.initializeFilterTooltips();
				//Wait a bit to ensure UI is ready before applying URL filters
				this.applyUrlFilters();
			} catch (err) {
				console.error("ticketPage.make error:", err);
			}
		}, 200);

	}

	show_details(issue_id) {
		$(".ticket-list-view").addClass("d-none");
		$(".ticket-details-view").removeClass("d-none");
		$(".new-tickets").addClass("d-none");
		this.setPageTitle(`tickets/${issue_id}`)
		this.setActiveSidebar();

		// Load issue
		if (issue_id) {
			this.load_issue_details(issue_id, this.page);
		}
		this.bindEvent(issue_id);
		this.bindTagEvents(issue_id, $(".leftcol"), $(".rightcol"));
		this.bindcallcardsEvents(issue_id);
		this.bindAppointmentCardsEvents(issue_id);
		this.bindTaskCardsEvents(issue_id);
		this.bindIssuesActivitiesEvents(issue_id);
		this.listedit(issue_id);
		this.bindResolutionEdit(issue_id);
		this.bindCustomerDescriptionEdit(issue_id);
		this.bindActionDropdown();
	}

	show_new() {
		this.reset_work_timer_ui();
		this.setPageTitle("New Ticket");
		this.setActiveSidebar();
		$(".ticket-list-view").addClass("d-none");
		$(".ticket-details-view").addClass("d-none");
		$(".new-tickets").removeClass("d-none");
		this.bind_issue_form_events();
		this.bindActionDropdown();

	}


	//list view methods

	fetch_list_data({ reset = false, saved_filters = [], override_filters = {} } = {}) {
		//console.log("calling fetch list data");
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
				const workingAgentEl = wrapper.querySelector('[data-table-range-filter="working_agents"]')
				const normalizeAgents = (val) => {
					if (!val) return [];
					if (Array.isArray(val)) return val.filter(Boolean);
					return String(val)
						.split(',')
						.map(v => v.trim())
						.filter(Boolean);
				};
				const normalizeStatus = (val) => {
					if (!val) return [];
					if (Array.isArray(val)) return val.filter(Boolean);
					return String(val)
						.split(',')
						.map(v => v.trim())
						.filter(Boolean);
				};

				// If override provided use it, otherwise read from DOM or preserved active values
				this.active_status = override_filters.hasOwnProperty('status')
					? normalizeStatus(override_filters.status)
					: (statusEl ? this.getSelectValues(statusEl) : (this.active_status || []));
				this.active_priority = override_filters.hasOwnProperty('priority')
					? override_filters.priority
					: (priorityEl ? priorityEl.value : (this.active_priority || ""));
				this.active_working_agent = override_filters.hasOwnProperty('working_agent')
					? normalizeAgents(override_filters.working_agent)
					: this.getSelectValues(workingAgentEl);

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

				// Backend call
				frappe.call({
					method: "renewal_module.custom_module.page.ticket.ticket.get_list_data",
					args: {
						start: reset ? 0 : (this.all_tickets ? this.all_tickets.length : 0),
						page_length: this.page_length,
						status: this.active_status || [],
						priority: this.active_priority || "",
						working_agent: this.active_working_agent || [],
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
							const { data = [], total = 0, status_counts = {} } = r.message || {};
							console.log("data,count", r.message);
							// Always trust the server-provided total for accurate counts
							this.total_records = Number.isFinite(total) ? parseInt(total, 10) : (data.length || 0);
							this.status_counts = status_counts || {};

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

							document.getElementById("visible-count").innerHTML = this.visible_count.toLocaleString();
							document.getElementById("total-count").innerHTML = this.total_records.toLocaleString();
							const countHeader = document.getElementById("count-header");
							if (countHeader) {
								countHeader.setAttribute(
									"title",
									`${this.visible_count.toLocaleString()} of ${this.total_records.toLocaleString()}`
								);
							}


							// filtered_tickets mirrors all_tickets unless additional client-side filters are applied
							this.filtered_tickets = this.all_tickets.slice();

							// Update status summary using full filtered totals
							this.update_status_summary(null, this.status_counts, this.total_records);

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

		const tbody = wrapper.querySelector(".tickets-table tbody");
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
			const avatarHTML = `
				<div class="avatar-wrappers">
					${ticket.assigned_to_image
					? `<img src="${ticket.assigned_to_image}" alt="${ticket.working_agent || 'User'}" />`
					: `<span class="avatar-initials">${ticket.assigned_to_initials || '?'}</span>`
				}
				</div>
			`;


			tr.innerHTML = `
					<td class="checkbox-cell">
						<input class="form-check-input form-check-input-light fs-14 product-item-check" type="checkbox">
					</td>

					<td> <a href="/app/ticket/${ticket.name}" class="ids link-reset issue-link" data-issue-name="${ticket.name}" title="${ticket.name} ">${ticket.name}</a></td>

					<td class="ellipsis" title="${escapeHtml(ticket.subject)}">${escapeHtml(ticket.subject)}</td>
					<td><span class="pill ${getPriorityClass(ticket.priority)}" title="${ticket.priority}">${escapeHtml(ticket.priority)}</span></td>
					<td>
						<div class="d-flex gap-2 align-items-center">
							<span class="ellipsis" title="${escapeHtml(ticket.customer)}">${escapeHtml(ticket.customer)}</span>
						</div>
					</td>
					<td>
						<span class="text-truncate" title="${escapeHtml(ticket.custom_query_type)}">${escapeHtml(ticket.custom_query_type || "")}</span>
					</td>
					
					<td>
						<span class="pill ${getStatusClass(ticket.status)}" title="${ticket.status}">${escapeHtml(ticket.status)}</span>
					</td>
					<td class="ellipsis" title="${ticket.creation}">
						${formatDate(ticket.creation)}
					</td>
					
					<td>
						<div class="agent-cell">
							${avatarHTML}
							<span class="agent-name ellipsis" title="${ticket.working_agent}">
								${ticket.working_agent || 'Unassigned'}
							</span>
						</div>
					</td>


					<td>
						<div class="d-flex align-items-center"
							id="assigned_to_container_${ticket.name.replace(/[^a-zA-Z0-9]/g, "_")}">
						</div>
					</td>

					<td class="ellipsis" title="${ticket.resolution_by} ">
						${formatDate(ticket.resolution_by)} 
					</td>

					<td>
						<div class="d-flex align-items-center justify-content-center gap-1 issue-link" data-issue-name="${ticket.name}"  style="cursor:pointer;">
							<span title="${escapeHtml(ticket.modified || "")}">${formatModifiedDate(ticket.modified)}</span>
							<span class="d-flex align-items-center gap-1 ml-1" title="${ticket.comment_count || 0}">
								<i class="fa fa-comment fs-lg"></i>
								${ticket.comment_count || 0}
							</span>
						</div>
					</td>
				`;
			tbody.appendChild(tr);
			const issueCheckbox = tr.querySelector('input[type="checkbox"]');
			if (this.selected_tickets.has(ticket.name)) {
				issueCheckbox.checked = true;
			}
			if (ticket._assign) {
				const containerId = `assigned_to_container_${ticket.name.replace(/[^a-zA-Z0-9]/g, "_")}`;
				renderAssignedAvatars(containerId, ticket._assign);
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

			if (years > 0) return years + "Y";
			if (months > 0) return months + "M";
			if (days > 0) return days + "d";
			if (hours > 0) return hours + "h";
			if (minutes > 0) return minutes + "m";
			return seconds + "s";
		}

		// ---- helper functions (kept local) ----
		function getPriorityClass(priority) {
			switch (priority) {
				case "Low": return "text-bg-success";
				case "Medium": return "text-bg-warning";
				case "High": return "text-bg-danger";
				default: return "text-bg-secondary";
			}
		}
		function getStatusClass(status) {
			switch (status) {
				case "Open": return "open1";
				case "Pending": return "pending";
				case "Resolved": return "resolved";
				case "Closed": return "closed1";
				case "On Hold": return "on_hold";
				case "Escalated": return "escalated";
				case "Client Input Pending": return "client_input_pending";
				case "Created": return "created";
				case "Assigned": return "assigned";
				case "Resolved": return "resolved";
				case "Duplicate": return "duplicate";
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
					localStorage.setItem("tickets_page_length", me.page_length);
					console.log("Saved filters before opening details:", qs);
				} catch (err) {
					console.error("Failed to save filters:", err);
				}

				// Navigate to the custom details page
				frappe.set_route("ticket", issueName);
			});

		{
			const table = wrapper.querySelector(".tickets-table");
			const newTicketBtn = wrapper.querySelector("#new-ticket-btn");
			const actionsDropdownEl = wrapper.querySelector("#actions-dropdown");

			if (table) {
				const all = table.querySelectorAll('tbody input[type="checkbox"]').length;
				const checked = table.querySelectorAll('tbody input[type="checkbox"]:checked').length;
				const selectAll = table.querySelector('#selectAllTickets');
				if (selectAll) selectAll.checked = (all > 0 && all === checked);
				// update the action/new-ticket visibility
				this.updateActionBarState(table, newTicketBtn, actionsDropdownEl);
			}
		}

		async function renderAssignedAvatars(containerId, assignJson) {
			const container = document.getElementById(containerId);
			if (!container || !assignJson) return;

			let users = [];
			try {
				users = JSON.parse(assignJson);
			} catch {
				return;
			}

			if (!users.length) return;

			// const userDocs = res.message || [];
			const res = await frappe.call({
				method: "renewal_module.custom_module.page.ticket.ticket.get_users_basic_info",
				args: {
					users: users   // array of emails
				}
			});

			const userDocs = res.message || [];
			//console.log("userDocs", userDocs);

			//console.log("userDocs", userDocs);

			const visible = userDocs.slice(0, 3);
			const extra = userDocs.length - visible.length;

			container.innerHTML = `
				${visible.map((u, i) => `
					<div class="assign-avatar"
						title="${escapeHtml(u.full_name || u.name)}"
						style="margin-left:${i === 0 ? 0 : "-8px"}">
						${u.user_image
					? `<img src="${frappe.utils.get_file_link(u.user_image)}">`
					: `<div class="assign-avatar assign-initials">
								${getInitials(u.full_name || u.name)}
							</div>`
				}
					</div>
				`).join("")}

				${extra > 0 ? `
					<div class="assign-avatar"
						title="${userDocs.slice(3).map(u => u.full_name).join(", ")}"
						style="margin-left:-8px;background:#6c757d;color:#fff;
								display:flex;align-items:center;justify-content:center;
								font-size:10px;font-weight:600;">
						+${extra}
					</div>
				` : ""}
			`;
		}

		function getInitials(name) {
			const p = (name || "User").trim().split(/\s+/);
			return ((p[0]?.[0] || "U") + (p[p.length - 1]?.[0] || "")).toUpperCase();
		}



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
				btn.style.backgroundColor = "#6C5CE7";
				btn.style.color = "black";

				this.page_length = parseInt(btn.dataset.value, 10);

				await this.fetch_list_data({
					reset: true,
					saved_filters: this.saved_filters || [],
					override_filters: {
						status: this.active_status,
						priority: this.active_priority,
						working_agent: this.active_working_agent
					}
				});
			});
		});

		// --- Default highlight for "20" button on first load ---
		// const defaultBtn = wrapper.querySelector('.btn-paging[data-value="20"]');
		// if (defaultBtn && !wrapper.querySelector(".active-pagination")) {
		// 	defaultBtn.classList.add("btn-info", "active-pagination");
		// 	defaultBtn.style.backgroundColor = "#6C5CE7";
		// 	defaultBtn.style.color = "black";
		// 	this.page_length = 20;
		// }

		// Restore page_length from localStorage or default to 20
		const savedPageLength = localStorage.getItem('tickets_page_length');
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

				await this.fetch_list_data({
					reset: false,
					saved_filters: this.saved_filters || [],
					override_filters: {
						status: this.active_status,
						priority: this.active_priority,
						working_agent: this.active_working_agent
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



	update_status_summary(data, statusCounts, totalOverride) {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const container = wrapper.querySelector("#status-summary");
		if (!container) return;

		const statusList = [
			"Created",
			"Open",
			"Assigned",
			"Client Input Pending",
			"Overdue",
			"Resolved",
			"OEM Escalated",
			"Duplicate",
			"Closed"
		];
		const colorMap = {
			Created: "#5f6b7a",
			Open: "#3b82f6",
			Assigned: "#f59e0b",
			"Client Input Pending": "#a855f7",
			Overdue: "#ef4444",
			Resolved: "#10b981",
			"OEM Escalated": "#f97316",
			Duplicate: "#8b5cf6",
			Closed: "#0f766e"
		};
		const counts = statusList.reduce((acc, status) => {
			acc[status] = 0;
			return acc;
		}, {});

		if (statusCounts && typeof statusCounts === "object") {
			Object.keys(statusCounts).forEach(status => {
				counts[status] = parseInt(statusCounts[status], 10) || 0;
			});
		} else {
			(data || []).forEach(ticket => {
				const status = ticket?.status || "";
				if (counts.hasOwnProperty(status)) {
					counts[status] += 1;
				} else if (status) {
					counts[status] = (counts[status] || 0) + 1;
				}
			});
		}

		const total = Number.isFinite(totalOverride)
			? totalOverride
			: Object.values(counts).reduce((sum, val) => sum + val, 0);

		// const barsHtml = statusList.filter(status => (counts[status] || 0) > 0).map(status => {
		const activeStatus = Array.isArray(this.active_status) && this.active_status.length === 1
			? this.active_status[0]
			: "";

		const barsHtml = statusList.map(status => {
			const count = counts[status] || 0;
			let percent = total > 0 ? Math.round((count / total) * 100) : 0;
			if (count > 0 && percent === 0) {
				percent = 1;
			}
			const color = colorMap[status] || "#64748b";
			const isActive = activeStatus === status;
			return `
				<div class="status-summary-item ${isActive ? "active-summary-item" : ""}" data-status="${status}" title="${status}: ${count}" style="--status-accent: ${color}; ${isActive ? "box-shadow: 0 0 0 2px " + color + "40; border-color: " + color + ";" : ""}">
					<div class="status-summary-top">
						<div class="status-summary-label-wrap">
							<span class="status-summary-dot"></span>
							<div class="status-summary-label">${status}</div>
						</div>
						<div class="status-summary-count">${count}</div>
					</div>
					<div class="status-summary-bar">
						<span style="width: ${percent}%; background: ${color};"></span>
					</div>
					<div class="status-summary-meta">${percent}% of total</div>
				</div>
			`;
		}).join("");

		container.innerHTML = `
			<div class="status-summary-header">
				
				<div class="status-summary-title">Status Overview</div>
				
				<div class="status-summary-total">Total Tickets: ${total}</div>
			</div>
			<div class="status-summary-bars">
				${barsHtml}
			</div>
		`;
	}

	bindStatusSummaryEvents() {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		if (!wrapper) return;

		$(wrapper)
			.off("click.statusSummary", "#status-summary .status-summary-item")
			.on("click.statusSummary", "#status-summary .status-summary-item", async (e) => {
				const status = String($(e.currentTarget).data("status") || "").trim();
				if (!status) return;

				const statusFilter = wrapper.querySelector('[data-table-filter="status"]');
				const priorityEl = wrapper.querySelector('[data-table-range-filter="priority"]');
				const workingAgentEl = wrapper.querySelector('[data-table-range-filter="working_agents"]');

				const currentlySingle = Array.isArray(this.active_status) && this.active_status.length === 1
					? this.active_status[0]
					: "";
				const shouldClear = currentlySingle === status;

				if (statusFilter) {
					if (statusFilter.tagName === "SELECT") {
						statusFilter.value = shouldClear ? "" : status;
						this.syncPlaceholder(statusFilter);
						this.updateStatusTooltip(statusFilter);
						this.active_status = statusFilter.value ? [statusFilter.value] : [];
					} else {
						this.selectedStatuses = shouldClear ? [] : [status];
						this.updateStatusDisplay();
						this.updateStatusTooltip(statusFilter);
						this.active_status = [...this.selectedStatuses];

						// Keep modal options visually in sync if dropdown is open.
						if (document.getElementById("status-options-dropdown")) {
							this.renderStatusOptions((document.getElementById("status-search-dropdown") || {}).value || "");
						}
					}
				} else {
					this.active_status = shouldClear ? [] : [status];
				}

				await this.fetch_list_data({
					reset: true,
					saved_filters: this.saved_filters || [],
					override_filters: {
						status: this.active_status,
						priority: priorityEl ? (priorityEl.value || "") : (this.active_priority || ""),
						working_agent: workingAgentEl ? this.getSelectValues(workingAgentEl) : (this.active_working_agent || [])
					}
				});

				const newUrl = new URL(window.location.href);
				const currentPriority = priorityEl ? (priorityEl.value || "") : "";
				const currentWorkingAgent = workingAgentEl ? this.getSelectValues(workingAgentEl) : [];
				if (this.active_status && this.active_status.length) {
					newUrl.searchParams.set("status", this.active_status.join(","));
				} else {
					newUrl.searchParams.delete("status");
				}
				if (currentPriority) newUrl.searchParams.set("priority", currentPriority);
				else newUrl.searchParams.delete("priority");

				if (currentWorkingAgent.length) {
					newUrl.searchParams.set("working_agent", currentWorkingAgent.join(","));
				} else {
					newUrl.searchParams.delete("working_agent");
				}

				if (this.saved_filters && this.saved_filters.length) {
					newUrl.searchParams.set("filters", encodeURIComponent(JSON.stringify(this.saved_filters)));
				} else {
					newUrl.searchParams.delete("filters");
				}

				window.history.replaceState({}, "", newUrl.toString());
			});
	}

	bindFilterEvents() {
		const me = this;
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		// --- Basic Filters ---
		const statusFilter = wrapper.querySelector('[data-table-filter="status"]');
		const priorityFilter = wrapper.querySelector('[data-table-range-filter="priority"]');
		const workingAgentFilter = wrapper.querySelector('[data-table-range-filter="working_agents"]');
		const filterButton = wrapper.querySelector('.filter-button');
		const clearFilterButton = wrapper.querySelector('.filter-x-button');
		// Helper to update select placeholder style
		if (statusFilter) {
			if (statusFilter.tagName === "SELECT") {
				this.syncPlaceholder(statusFilter);
				statusFilter.addEventListener("change", () => this.syncPlaceholder(statusFilter));
			} else {
				this.updateStatusDisplay();
			}
		}

		if (priorityFilter) {
			this.syncPlaceholder(priorityFilter);
			priorityFilter.addEventListener("change", () => this.syncPlaceholder(priorityFilter));
		}

		if (workingAgentFilter) {
			// Custom multi-select is initialized via populateCustomMultiSelect
		}


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
			if (statusFilter) {
				if (statusFilter.tagName === "SELECT") {
					statusFilter.value = "";
				} else {
					me.selectedStatuses = [];
					me.updateStatusDisplay();
				}
			}
			if (priorityFilter) priorityFilter.value = "";
			if (workingAgentFilter) {
				me.selectedAgents = [];
				me.updateWorkingAgentDisplay();
			}
			me.active_status = [];
			me.active_priority = "";
			me.active_working_agent = [];
			if (statusFilter && statusFilter.tagName === "SELECT") {
				const sel = statusFilter;
				function updateSelectColor() {
					if (!sel.value) sel.classList.add("placeholder");
					else sel.classList.remove("placeholder");
				}
				updateSelectColor();
				sel.addEventListener("change", updateSelectColor);
			}
			if (priorityFilter) {
				const sel = priorityFilter;
				function updateSelectColor() {
					if (!sel.value) sel.classList.add("placeholder");
					else sel.classList.remove("placeholder");
				}
				updateSelectColor();
				sel.addEventListener("change", updateSelectColor);
			}
			if (workingAgentFilter && !workingAgentFilter.classList.contains('custom-multi-select')) {
				const sel = workingAgentFilter;
				function updateSelectColor() {
					const hasSelection = Array.from(sel.selectedOptions || []).some(o => o.value);
					if (!hasSelection) sel.classList.add("placeholder");
					else sel.classList.remove("placeholder");
				}
				updateSelectColor();
				sel.addEventListener("change", updateSelectColor);
			}
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

			// Update tooltips after clearing filters
			if (statusFilter) me.updateStatusTooltip(statusFilter);
			if (priorityFilter) me.updatePriorityTooltip(priorityFilter);
			if (workingAgentFilter) me.updateWorkingAgentTooltip();
		}

		// --- Basic Filter Listeners ---
		if (statusFilter && statusFilter.tagName === "SELECT") {
			statusFilter.addEventListener("change", () => {
				me.active_status = statusFilter.value ? [statusFilter.value] : [];
				me.fetch_list_data({ reset: true, saved_filters: me.saved_filters });
				updateUrlWithFilters(me.saved_filters);
			});
		}

		if (priorityFilter) priorityFilter.addEventListener("change", () => {
			me.active_priority = priorityFilter.value || "";
			me.fetch_list_data({ reset: true, saved_filters: me.saved_filters });
			updateUrlWithFilters(me.saved_filters);
		});

		if (workingAgentFilter) workingAgentFilter.addEventListener("change", () => {
			me.active_working_agent = me.getSelectValues(workingAgentFilter);
			me.fetch_list_data({ reset: true, saved_filters: me.saved_filters });
			updateUrlWithFilters(me.saved_filters);
		});

		// --- Advanced Filter Popover ---
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
			await frappe.model.with_doctype("Issue");
			filter_group = new frappe.ui.FilterGroup({
				parent: popover_content,
				doctype: "Issue",
				on_change: function () {
					if (me._suspend_on_change) return;
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

			footer.find('.add-filter').on("click", () => filter_group.add_filter("Issue", "name", "=", "", false));

			// --- Popover: Clear button (explicitly reset UI + state + URL + fetch + close popover)
			footer.find('.clear-filters').on("click", () => {
				if (filter_group) {
					filter_group.clear_filters();
				}
				me.saved_filters = [];
				me._suspend_on_change = false;
				me.fetch_list_data({
					reset: true,
					saved_filters: []
				});
				update_filter_button_count($btn, 0);
				updateUrlWithFilters([]);
				closePopover($btn, "clear-filters");
			});


			footer.find('.apply-filters').on("click", () => {
				if (filter_group) {
					me.saved_filters = filter_group.get_filters();
					me._suspend_on_change = false;
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

		// --- External Clear (top X) Button ---
		if (clearFilterButton) {
			clearFilterButton.addEventListener("click", () => {
				if (filter_group) filter_group.clear_filters();
				me.saved_filters = [];
				clearBasicFilterUI();
				me._fetch_in_progress = false;
				me.fetch_list_data({ reset: true, saved_filters: [] });
				localStorage.removeItem("issue_theme_last_filters");
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
				const workingAgentEl = wrapper.querySelector('[data-table-range-filter="working_agents"]')

				const statusVals = statusEl ? me.getSelectValues(statusEl) : [];
				const priorityVal = priorityEl ? priorityEl.value : "";
				const workingAgentVals = workingAgentEl ? me.getSelectValues(workingAgentEl) : [];

				// Basic filters
				if (statusVals.length) newUrl.searchParams.set("status", statusVals.join(","));
				else newUrl.searchParams.delete("status");

				if (priorityVal) newUrl.searchParams.set("priority", priorityVal);
				else newUrl.searchParams.delete("priority");

				if (workingAgentVals.length) {
					newUrl.searchParams.set("working_agent", workingAgentVals.join(","));
				} else {
					newUrl.searchParams.delete("working_agent");
				}

				// Advanced filters
				if (filters && filters.length) {
					const encoded = encodeURIComponent(JSON.stringify(filters));
					newUrl.searchParams.set("filters", encoded);
				} else {
					newUrl.searchParams.delete("filters");
				}

				window.history.replaceState({}, "", newUrl.toString());
				console.log("🔄 URL updated:", newUrl.toString());
			} catch (err) {
				console.error("❌ Failed to update URL:", err);
			}
		}

	}

	initializeFilterTooltips() {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;

		// Status filter tooltip
		const statusFilter = wrapper.querySelector('[data-table-filter="status"]');
		if (statusFilter) {
			this.updateStatusTooltip(statusFilter);
			statusFilter.setAttribute('data-toggle', 'tooltip');

			// Update tooltip on change
			statusFilter.addEventListener('change', () => {
				this.updateStatusTooltip(statusFilter);
			});
		}

		// Priority filter tooltip
		const priorityFilter = wrapper.querySelector('[data-table-range-filter="priority"]');
		if (priorityFilter) {
			this.updatePriorityTooltip(priorityFilter);
			priorityFilter.setAttribute('data-toggle', 'tooltip');

			// Update tooltip on change
			priorityFilter.addEventListener('change', () => {
				this.updatePriorityTooltip(priorityFilter);
			});
		}

		// Working Agent filter tooltip
		const workingAgentFilter = wrapper.querySelector('[data-table-range-filter="working_agents"]');
		if (workingAgentFilter) {
			this.updateWorkingAgentTooltip();
			workingAgentFilter.setAttribute('data-toggle', 'tooltip');
		}

		// Initialize Bootstrap tooltips if available
		if (typeof $ !== 'undefined' && $.fn.tooltip) {
			$(wrapper).find('[data-toggle="tooltip"]').tooltip({
				placement: 'top',
				trigger: 'hover',
				container: 'body',
				delay: { show: 300, hide: 100 }
			});
		}
	}

	updateStatusTooltip(statusFilter) {
		if (!statusFilter) return;

		let tooltipText = "status";
		if (statusFilter.tagName === "SELECT") {
			const selectedValue = statusFilter.value;
			if (selectedValue) {
				const selectedOption = statusFilter.querySelector(`option[value="${selectedValue}"]`);
				tooltipText = selectedOption ? selectedOption.textContent.trim() : selectedValue;
			}
		} else {
			const selected = this.selectedStatuses || [];
			tooltipText = selected.length ? selected.join(", ") : "status";
		}

		statusFilter.setAttribute('title', tooltipText);

		// Update Bootstrap tooltip if it's initialized
		if (typeof $ !== 'undefined' && $.fn.tooltip) {
			$(statusFilter).tooltip('dispose').tooltip({
				placement: 'top',
				trigger: 'hover',
				container: 'body',
				delay: { show: 300, hide: 100 },
				title: tooltipText
			});
		}
	}

	updatePriorityTooltip(priorityFilter) {
		if (!priorityFilter) return;

		const selectedValue = priorityFilter.value;
		let tooltipText;

		if (selectedValue) {
			const selectedOption = priorityFilter.querySelector(`option[value="${selectedValue}"]`);
			tooltipText = selectedOption ? selectedOption.textContent.trim() : selectedValue;
		} else {
			tooltipText = 'priority';
		}

		priorityFilter.setAttribute('title', tooltipText);

		// Update Bootstrap tooltip if it's initialized
		if (typeof $ !== 'undefined' && $.fn.tooltip) {
			$(priorityFilter).tooltip('dispose').tooltip({
				placement: 'top',
				trigger: 'hover',
				container: 'body',
				delay: { show: 300, hide: 100 },
				title: tooltipText
			});
		}
	}

	async loadFilters() {
		try {
			const res = await frappe.call({
				method: "renewal_module.custom_module.page.ticket.ticket.get_customer_filters"
			});
			const filters = (res && res.message) ? res.message : {};
			console.log("filters", filters);

			this.initializeStatusModal(this.getStatusOptions());
			this.initializeWorkingAgentModal(filters.working_agent || []);

		} catch (err) {
			console.error("loadFilters error:", err);
		}
	}

	getStatusOptions() {
		return [
			"Created",
			"Open",
			"Assigned",
			"Client Input Pending",
			"Overdue",
			"Resolved",
			"OEM Escalated",
			"Duplicate",
			"Closed"
		];
	}

	initializeStatusModal(statusList) {
		const me = this;
		const container = document.getElementById("filterstatus");
		const dropdown = document.getElementById("status-dropdown");
		if (!container || !dropdown) return;

		this.allStatuses = statusList || [];
		this.selectedStatuses = this.selectedStatuses || [];

		container.addEventListener("click", (e) => {
			e.stopPropagation();
			const isVisible = dropdown.style.display === "block";
			if (isVisible) {
				me.closeStatusDropdown();
			} else {
				me.openStatusDropdown();
			}
		});

		document.addEventListener("click", (e) => {
			if (!dropdown.contains(e.target) && e.target !== container && !container.contains(e.target)) {
				me.closeStatusDropdown();
			}
		});

		const searchInput = document.getElementById("status-search-dropdown");
		if (searchInput) {
			searchInput.addEventListener("input", (e) => {
				e.stopPropagation();
				me.renderStatusOptions(e.target.value);
			});
			searchInput.addEventListener("click", (e) => e.stopPropagation());
		}

		this.updateStatusDisplay();
	}

	openStatusDropdown() {
		const dropdown = document.getElementById("status-dropdown");
		const searchInput = document.getElementById("status-search-dropdown");
		if (!dropdown) return;

		dropdown.style.display = "block";

		if (searchInput) {
			searchInput.value = "";
			setTimeout(() => searchInput.focus(), 50);
		}
		this.renderStatusOptions();
	}

	closeStatusDropdown() {
		const dropdown = document.getElementById("status-dropdown");
		if (dropdown) {
			dropdown.style.display = "none";
		}
	}

	renderStatusOptions(filterText = "") {
		const optionsList = document.getElementById("status-options-dropdown");
		if (!optionsList) return;

		const term = (filterText || "").toLowerCase();
		optionsList.innerHTML = "";

		const statusList = this.allStatuses || [];
		let hasResults = false;

		statusList.forEach(status => {
			const lbl = status || "";
			if (term && !lbl.toLowerCase().includes(term)) return;

			hasResults = true;
			const isSelected = this.selectedStatuses.includes(lbl);

			const statusDiv = document.createElement("div");
			statusDiv.className = "working-agent-option";
			statusDiv.style.cssText = `
				background-color: ${isSelected ? "#e8f4fd" : "white"};
			`;

			const label = document.createElement("span");
			label.style.cssText = "flex: 1; font-size: 12.25px; color: #36414c; user-select: none;";
			label.textContent = this.escapeHtml(lbl);

			statusDiv.appendChild(label);

			statusDiv.addEventListener("mouseenter", () => {
				const nowSelected = this.selectedStatuses.includes(lbl);
				statusDiv.style.backgroundColor = nowSelected ? "#d1e7f7" : "#f8f9fa";
			});
			statusDiv.addEventListener("mouseleave", () => {
				const nowSelected = this.selectedStatuses.includes(lbl);
				statusDiv.style.backgroundColor = nowSelected ? "#e8f4fd" : "white";
			});

			statusDiv.addEventListener("click", (e) => {
				e.stopPropagation();
				if (this.selectedStatuses.includes(lbl)) {
					this.selectedStatuses = this.selectedStatuses.filter(s => s !== lbl);
				} else {
					this.selectedStatuses.push(lbl);
				}

				const nowSelected = this.selectedStatuses.includes(lbl);
				statusDiv.style.backgroundColor = nowSelected ? "#e8f4fd" : "white";

				this.applyStatusFilterImmediately();
			});

			optionsList.appendChild(statusDiv);
		});

		if (!hasResults) {
			const emptyDiv = document.createElement("div");
			emptyDiv.textContent = "No status found";
			emptyDiv.style.cssText = "padding: 20px 12px; text-align: center; color: #999; font-size: 13px;";
			optionsList.appendChild(emptyDiv);
		}
	}

	applyStatusFilterImmediately() {
		this.updateStatusDisplay();
		this.updateStatusTooltip(document.getElementById("filterstatus"));

		this.active_status = this.selectedStatuses;
		this.fetch_list_data({ reset: true, saved_filters: this.saved_filters });

		const newUrl = new URL(window.location.href);
		const priorityEl = document.querySelector('[data-table-range-filter="priority"]');
		const workingAgentEl = document.querySelector('[data-table-range-filter="working_agents"]');
		const priorityVal = priorityEl ? priorityEl.value : "";
		const workingAgentVals = workingAgentEl ? this.getSelectValues(workingAgentEl) : [];
		const filtersEncoded = newUrl.searchParams.get("filters") || "";

		if (this.selectedStatuses.length) {
			newUrl.searchParams.set("status", this.selectedStatuses.join(","));
		} else {
			newUrl.searchParams.delete("status");
		}
		if (priorityVal) newUrl.searchParams.set("priority", priorityVal);
		else newUrl.searchParams.delete("priority");
		if (workingAgentVals.length) newUrl.searchParams.set("working_agent", workingAgentVals.join(","));
		else newUrl.searchParams.delete("working_agent");
		if (filtersEncoded) newUrl.searchParams.set("filters", filtersEncoded);
		window.history.replaceState({}, "", newUrl.toString());
	}

	updateStatusDisplay() {
		const display = document.getElementById("status-display");
		if (!display) return;

		const selected = this.selectedStatuses || [];
		if (selected.length === 0) {
			display.textContent = "status";
			const container = document.getElementById("filterstatus");
			if (container) container.classList.add("placeholder");
		} else if (selected.length === 1) {
			display.textContent = selected[0];
			const container = document.getElementById("filterstatus");
			if (container) container.classList.remove("placeholder");
		} else {
			display.textContent = `${selected.length} status selected`;
			const container = document.getElementById("filterstatus");
			if (container) container.classList.remove("placeholder");
		}
	}

	initializeWorkingAgentModal(agentList) {
		const me = this;
		const container = document.getElementById("filterworkingagent");
		const dropdown = document.getElementById("working-agent-dropdown");
		if (!container || !dropdown) return;

		// Store agents data
		this.allAgents = agentList || [];
		this.selectedAgents = [];

		// Toggle dropdown on container click
		container.addEventListener("click", (e) => {
			e.stopPropagation();
			const isVisible = dropdown.style.display === "block";
			if (isVisible) {
				me.closeWorkingAgentDropdown();
			} else {
				me.openWorkingAgentDropdown();
			}
		});

		// Close dropdown when clicking outside
		document.addEventListener("click", (e) => {
			if (!dropdown.contains(e.target) && e.target !== container && !container.contains(e.target)) {
				me.closeWorkingAgentDropdown();
			}
		});

		// Setup search input
		const searchInput = document.getElementById("agent-search-dropdown");
		if (searchInput) {
			searchInput.addEventListener("input", (e) => {
				e.stopPropagation();
				me.renderWorkingAgents(e.target.value);
			});
			searchInput.addEventListener("click", (e) => e.stopPropagation());
		}

		// Update display
		this.updateWorkingAgentDisplay();
	}

	openWorkingAgentDropdown() {
		const dropdown = document.getElementById("working-agent-dropdown");
		const searchInput = document.getElementById("agent-search-dropdown");
		if (!dropdown) return;

		// Show dropdown
		dropdown.style.display = "block";

		// Clear search and render
		if (searchInput) {
			searchInput.value = "";
			setTimeout(() => searchInput.focus(), 50);
		}
		this.renderWorkingAgents();
	}

	closeWorkingAgentDropdown() {
		const dropdown = document.getElementById("working-agent-dropdown");
		if (dropdown) {
			dropdown.style.display = "none";
		}
	}

	renderWorkingAgents(filterText = "") {
		const optionsList = document.getElementById("agent-options-dropdown");
		if (!optionsList) return;

		const me = this;
		const term = (filterText || "").toLowerCase();
		optionsList.innerHTML = "";

		const agentList = this.allAgents || [];
		let hasResults = false;

		agentList.forEach(agent => {
			const val = typeof agent === "string" ? agent : (agent.value ?? "");
			const lbl = typeof agent === "string" ? agent : (agent.label ?? val);

			if (term && !lbl.toLowerCase().includes(term)) return;

			hasResults = true;
			const isSelected = me.selectedAgents.includes(val);

			const agentDiv = document.createElement("div");
			agentDiv.className = "working-agent-option";
			agentDiv.style.cssText = `
				background-color: ${isSelected ? "#e8f4fd" : "white"};
			`;

			const label = document.createElement("span");
			label.style.cssText = "flex: 1; font-size: 12.25px; color: #36414c; user-select: none;";
			label.textContent = me.escapeHtml(lbl);

			agentDiv.appendChild(label);

			// Hover effect
			agentDiv.addEventListener("mouseenter", () => {
				const nowSelected = me.selectedAgents.includes(val);
				agentDiv.style.backgroundColor = nowSelected ? "#d1e7f7" : "#f8f9fa";
			});
			agentDiv.addEventListener("mouseleave", () => {
				const nowSelected = me.selectedAgents.includes(val);
				agentDiv.style.backgroundColor = nowSelected ? "#e8f4fd" : "white";
			});

			// Click to toggle and apply immediately
			agentDiv.addEventListener("click", (e) => {
				e.stopPropagation();

				// Toggle selection
				if (me.selectedAgents.includes(val)) {
					me.selectedAgents = me.selectedAgents.filter(a => a !== val);
				} else {
					me.selectedAgents.push(val);
				}

				// Update background immediately
				const nowSelected = me.selectedAgents.includes(val);
				agentDiv.style.backgroundColor = nowSelected ? "#e8f4fd" : "white";

				// Apply filter immediately
				me.applyWorkingAgentFilterImmediately();
			});

			optionsList.appendChild(agentDiv);
		});

		if (!hasResults) {
			const emptyDiv = document.createElement("div");
			emptyDiv.textContent = "No agents found";
			emptyDiv.style.cssText = "padding: 20px 12px; text-align: center; color: #999; font-size: 13px;";
			optionsList.appendChild(emptyDiv);
		}
	}

	applyWorkingAgentFilterImmediately() {
		const me = this;
		me.updateWorkingAgentDisplay();
		me.updateWorkingAgentTooltip();

		// Apply filter
		me.active_working_agent = me.selectedAgents;
		me.fetch_list_data({ reset: true, saved_filters: me.saved_filters });

		// Update URL
		const params = new URLSearchParams(window.location.search);
		const statusEl = document.querySelector('[data-table-filter="status"]');
		const statusVals = statusEl ? this.getSelectValues(statusEl) : [];
		const priorityVal = params.get("priority") || "";
		const filtersEncoded = params.get("filters") || "";
		const newUrl = new URL(window.location.href);
		if (statusVals.length) newUrl.searchParams.set("status", statusVals.join(","));
		else newUrl.searchParams.delete("status");
		if (priorityVal) newUrl.searchParams.set("priority", priorityVal);
		else newUrl.searchParams.delete("priority");
		if (me.selectedAgents.length) {
			newUrl.searchParams.set("working_agent", me.selectedAgents.join(","));
		} else {
			newUrl.searchParams.delete("working_agent");
		}
		if (filtersEncoded) {
			newUrl.searchParams.set("filters", filtersEncoded);
		}
		window.history.replaceState({}, "", newUrl.toString());
	}

	updateWorkingAgentDisplay() {
		const display = document.getElementById("working-agent-display");
		if (!display) return;

		const selected = this.selectedAgents || [];
		const allAgents = this.allAgents || [];

		if (selected.length === 0) {
			display.textContent = "working agents";
			const container = document.getElementById("filterworkingagent");
			if (container) container.classList.add("placeholder");
		} else if (selected.length === 1) {
			const agent = allAgents.find(a => (a.value || a) === selected[0]);
			const label = typeof agent === "string" ? agent : (agent?.label || agent?.value || selected[0]);
			display.textContent = label;
			const container = document.getElementById("filterworkingagent");
			if (container) container.classList.remove("placeholder");
		} else {
			display.textContent = `${selected.length} agents selected`;
			const container = document.getElementById("filterworkingagent");
			if (container) container.classList.remove("placeholder");
		}
	}

	updateWorkingAgentTooltip() {
		const workingAgentFilter = document.getElementById("filterworkingagent");
		if (!workingAgentFilter) return;

		const selected = this.selectedAgents || [];
		const allAgents = this.allAgents || [];

		let tooltipText;
		if (selected.length === 0) {
			tooltipText = 'working agent';
		} else {
			const agentNames = selected.map(val => {
				const agent = allAgents.find(a => (a.value || a) === val);
				return typeof agent === "string" ? agent : (agent?.label || agent?.value || val);
			});
			tooltipText = agentNames.join(', ');
		}

		workingAgentFilter.setAttribute('title', tooltipText);

		// Update Bootstrap tooltip if it's initialized
		if (typeof $ !== 'undefined' && $.fn.tooltip) {
			$(workingAgentFilter).tooltip('dispose').tooltip({
				placement: 'top',
				trigger: 'hover',
				container: 'body',
				delay: { show: 300, hide: 100 },
				title: tooltipText
			});
		}
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

	populateFilter(fieldname, list) {
		let select = document.querySelector(`select[data-table-range-filter="${fieldname}"]`);
		if (!select) return;
		const summaryEl = document.querySelector(`[data-summary-for="${fieldname}"]`);

		// Store previously selected values
		const oldValues = this.getSelectValues(select);

		// Reset the select with its placeholder
		const label = select.getAttribute("data-placeholder") || select.getAttribute("data-table-range-filter").replace("_", " ");
		const placeholderOption = select.multiple
			? `<option value="" disabled>${this.escapeHtml(label)}</option>`
			: `<option value="">${this.escapeHtml(label)}</option>`;
		select.innerHTML = placeholderOption;

		// Append new options
		(list || []).forEach(item => {
			const val = typeof item === "string" ? item : (item.value ?? "");
			const lbl = typeof item === "string" ? item : (item.label ?? val);

			const opt = document.createElement("option");
			opt.value = val;
			opt.textContent = lbl;
			select.appendChild(opt);
		});

		// Restore selected values ONLY if they exist in the new options
		if (select.multiple) {
			const opts = Array.from(select.options || []);
			opts.forEach(opt => {
				opt.selected = oldValues.includes(opt.value);
			});
		} else if ([...select.options].some(o => o.value === (oldValues[0] || ""))) {
			select.value = oldValues[0] || "";
		}

		this.syncPlaceholder(select);
		this.updateMultiSelectSummary(select, summaryEl, label);
		this.setupFilterTooltip(select);
	}

	setupFilterTooltip(select) {
		if (!select) return;
		// avoid duplicating listeners / tooltip instances
		if (select.dataset.tooltipInitialized === "1") return;
		select.dataset.tooltipInitialized = "1";
		// helper to compute label text
		const getLabelText = () => {
			const labels = this.getSelectLabels(select);
			if (!labels.length) return "";
			if (labels.length === 1) return labels[0];
			return `${labels.length} selected: ${labels.join(", ")}`;
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

	syncPlaceholder(select) {
		if (!select) return;

		const hasSelection = select.multiple
			? Array.from(select.selectedOptions || []).some(opt => opt.value)
			: !!select.value;

		if (!hasSelection) {
			select.classList.add("placeholder");
		} else {
			select.classList.remove("placeholder");
		}
	}

	getSelectValues(select) {
		if (!select) return [];

		// For working agents modal
		if (select.id === "filterworkingagent") {
			return this.selectedAgents || [];
		}

		// For status modal
		if (select.id === "filterstatus" || (select.getAttribute("data-table-filter") === "status" && select.tagName !== "SELECT")) {
			return this.selectedStatuses || [];
		}

		if (select.classList && select.classList.contains('custom-multi-select')) {
			return this.getCustomMultiSelectValues(select);
		}
		if (!select.multiple) return select.value ? [select.value] : [];
		return Array.from(select.selectedOptions || [])
			.map(opt => opt.value)
			.filter(v => v);
	}

	getSelectLabels(select) {
		if (!select) return [];
		const opts = select.multiple ? Array.from(select.selectedOptions || []) : [select.options[select.selectedIndex]];
		return (opts || [])
			.filter(Boolean)
			.map(opt => (opt && opt.textContent ? opt.textContent.trim() : ""))
			.filter(Boolean);
	}

	getCustomMultiSelectValues(container) {
		// Legacy - no longer used
		return [];
	}

	updateMultiSelectSummary(select, summaryEl, placeholderText = "") {
		if (!select || !summaryEl) return;
		const labels = this.getSelectLabels(select);
		let summary = placeholderText || "";
		if (labels.length === 1) summary = labels[0];
		else if (labels.length > 1) summary = `${labels.length} agents selected`;
		if (!summary) summary = placeholderText;
		summaryEl.textContent = summary || "";
		summaryEl.setAttribute("title", labels.join(", ") || placeholderText || "");
	}


	applyUrlFilters() {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		//Restore saved filters from localStorage ONLY if URL is empty
		let qs = localStorage.getItem("issue_theme_last_filters") || "";
		if (!window.location.search && qs) {
			console.log("Restoring saved filters from localStorage:", qs);
			window.history.replaceState({}, "", window.location.pathname + qs);
		}

		//Read final URL params
		const params = new URLSearchParams(window.location.search);
		const statusRaw = params.get("status") || "";
		const statusList = statusRaw
			? statusRaw.split(",").map(v => v.trim()).filter(v => v)
			: [];
		const priority = params.get("priority") || "";
		const working_agent_raw = params.get("working_agent") || "";
		const working_agent = working_agent_raw
			? working_agent_raw.split(",").map(v => v.trim()).filter(v => v)
			: [];
		const filters_encoded = params.get("filters") || "";
		const statusFilter = wrapper.querySelector('[data-table-filter="status"]');
		const priorityFilter = wrapper.querySelector('[data-table-range-filter="priority"]');
		const workingAgentFilter = wrapper.querySelector('[data-table-range-filter="working_agents"]');
		//if (statusFilter) statusFilter.value = status;
		//if (priorityFilter) priorityFilter.value = priority;
		//if (workingAgentFilter) workingAgentFilter.value = working_agent;
		if (statusFilter) {
			if (statusFilter.tagName === "SELECT") {
				statusFilter.value = statusList[0] || "";
				this.syncPlaceholder(statusFilter);
			} else {
				this.selectedStatuses = statusList;
				this.updateStatusDisplay();
			}
		}
		if (priorityFilter) {
			priorityFilter.value = priority;
			this.syncPlaceholder(priorityFilter);
		}

		if (workingAgentFilter) {
			this.selectedAgents = working_agent;
			this.updateWorkingAgentDisplay();
		}
		//Update active basic filters
		this.active_status = statusList;
		this.active_priority = priority;
		this.active_working_agent = working_agent;
		//Restore advanced filters (popover filters)
		let restored_saved_filters = [];

		if (filters_encoded) {
			try {
				let decoded = decodeURIComponent(filters_encoded);
				let parsed = JSON.parse(decoded);

				restored_saved_filters = parsed.map(f => {
					// Normalize operators
					if (f[2] === "Equals") f[2] = "=";
					if (f[2] === "Not Equal") f[2] = "!=";

					// Ensure consistent 5-item format
					return [
						f[0],             // Doctype
						f[1],             // Fieldname
						f[2],             // Operator
						f[3],             // Value
						f[4] ?? false     // default
					];
				});

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

		// Update tooltips after applying URL filters
		setTimeout(() => {
			if (statusFilter) this.updateStatusTooltip(statusFilter);
			if (priorityFilter) this.updatePriorityTooltip(priorityFilter);
			if (workingAgentFilter) this.updateWorkingAgentTooltip();
		}, 200);
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

			// Write Permission → Status Change + Assign + Apply Rule
			$(actionsDropdown).find('[data-action="set_open"]').toggle(!!perm.write);
			$(actionsDropdown).find('[data-action="set_closed"]').toggle(!!perm.write);
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




	//Handle row selection toggle (New Ticket ↔ Actions)
	bindRowSelectionHandler() {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const table = wrapper.querySelector(".tickets-table");
		const newTicketBtn = wrapper.querySelector("#new-ticket-btn");
		const actionsDropdown = wrapper.querySelector("#actions-dropdown");


		//this.applyActionPermissions();
		if (!table || !newTicketBtn || !actionsDropdown) return;

		const selectAllCheckbox = table.querySelector("#selectAllTickets");

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

	applyRoleBasedActionVisibility() {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;

		frappe.call({
			method: "renewal_module.custom_module.page.ticket.ticket.get_ticket_permissions",
			callback: (r) => {
				if (r.message) {
					const has_write = r.message.write;
					const has_delete = r.message.delete;
					const has_export = r.message.export;
					const has_print = r.message.print;

					// Define which action requires which doctype-level permission
					const permissionMap = {
						"set_open": has_write,
						"set_closed": has_write,
						"apply_rule": has_write,
						"edit": has_write,
						"assign_to": has_write,
						"print": has_print,
						"add_tags": has_write,
						"export": has_export,
						"delete": has_delete
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

	bindActionDropdownHandler() {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const actionsDropdown = wrapper.querySelector("#actions-dropdown");

		if (!actionsDropdown) return;
		//const $actionsDropdown = $(actionsDropdown);
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
		//$actionsDropdown.dropdown();
		$actionsDropdown.off("click").on("click", async (e) => {
			// actionsDropdown.addEventListener("click", async (e) => {
			const item = e.target.closest(".dropdown-item");
			if (!item) return;

			e.preventDefault();
			const action = item.dataset.action;
			const table = wrapper.querySelector(".tickets-table");
			const checkedBoxes = table.querySelectorAll('tbody input[type="checkbox"]:checked');

			if (!checkedBoxes.length) {
				frappe.msgprint(__("Please select at least one Issue"));
				return;
			}

			const issues = Array.from(checkedBoxes)
				.map(cb => cb.closest("tr")?.querySelector("a.ids")?.textContent?.trim())
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
				waitForConfirmModal(($modal) => {
					const $close = $modal.find(".btn-modal-close");
					$close.off("click.delet-confirm").on("click.delete-confirm", function (ev) {
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

		const table = wrapper.querySelector(".tickets-table");
		if (table) {
			// Uncheck select-all if present
			const selectAllCheckbox = table.querySelector('#selectAllTickets');
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
			//this.fetch_ticket_counts();
			setTimeout(() => {
				this.applyRoleBasedActionVisibility();
			}, 100);
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

	//details view 


	bindEvent(issue) {
		// Action button click
		const me = this;
		// ✅ ADD THIS FIRST
		$(this.wrapper)
			.off("click.dropdownfix")
			.on("click.dropdownfix", ".dropdown-toggle", function (e) {
				e.stopPropagation();
			});

		$(this.wrapper).off("", "[data-action='set_working_agent']").on("click", "[data-action='set_working_agent']", async function (e) {
			e.preventDefault();
			if (!issue) return frappe.msgprint("No issue selected.");

			const previousAgent = window.issue_data?.working_agent || null;

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
								const finalize = () => {
									frappe.msgprint(
										__("Working agent updated to {0}", [values.working_agent])
									);
									dialog.hide();
									me.load_issue_details(issue);
								};

								if (previousAgent && previousAgent !== values.working_agent) {
									frappe.call({
										method: "renewal_module.custom_issue.update_last_time_log",
										args: {
											user: previousAgent,
											issue: issue
										},
										callback: () => finalize(),
										error: () => finalize()
									});
									return;
								}

								finalize();
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

		$(this.wrapper).off("click", "[data-action='set_assign_user']").on("click", "[data-action='set_assign_user']", async function (e) {
			e.preventDefault();

			let doctype = "Issue";

			// issue is a single string (one ID)
			let docname = issue;

			// Open Assign Dialog
			let d = new frappe.ui.form.AssignToDialog({
				doctype: doctype,
				docname: docname
			});
			const issueSubject = (window.issue_data && window.issue_data.name === issue)
				? (window.issue_data.subject || "")
				: "";

			d.dialog.set_primary_action(__("Assign"), () => {
				const values = d.dialog.get_values();
				if (!values) return;

				d.dialog.hide();

				// Single call only
				frappe.call({
					method: "frappe.desk.form.assign_to.add",
					args: {
						doctype: doctype,
						name: docname,
						assign_to: values.assign_to,
						assign_to_me: values.assign_to_me,
						assign_to_user_group: values.assign_to_user_group,
						description: values.description,
						due_date: values.due_date,
						priority: values.priority,
						notify: values.notify || 0
					},
					callback: () => {
						frappe.show_alert({
							message: __("Assigned successfully"),
							indicator: "green"
						});
						me.load_issue_details(issue);
						me.resetActionBar();
						me.refreshAllData();
					}
				});
			});

			d.dialog.show();
			if (issueSubject) {
				setTimeout(() => {
					if (!d.dialog.get_value("description")) {
						d.dialog.set_value("description", issueSubject);
					}
				}, 0);
			}

			// Close button fix
			setTimeout(() => {
				const closeBtn = d.dialog.get_close_btn();
				if (closeBtn && closeBtn.length) {
					closeBtn.off("click.dialog").on("click.dialog", function () {
						d.dialog.hide();
					});
				}
			}, 50);
		});

		/**change status */

		$(this.wrapper).off("click.ticketstatus", "#ticket-status-actions-dropdown a")
			.on("click.ticketstatus", "#ticket-status-actions-dropdown a", function (e) {

				e.preventDefault();
				e.stopPropagation();

				if (!issue) {
					frappe.msgprint("No issue selected.");
					return;
				}

				// read action from <a>
				let action = $(this).data("action");

				console.log("🟠 Raw action read =", action);  // should now match clicked item

				// Special handling for OEM Escalated - Show popup to add OEM details FIRST
				if (action === "set_oem_escalated") {
					// const new_status = "OEM Escalated"; // Define new_status for OEM escalation
					const oem_dialog = new frappe.ui.Dialog({
						title: __("OEM Escalation Details"),
						fields: [
							{
								fieldtype: "Data",
								fieldname: "custom_oem_id",
								label: __("OEM ID"),
							},
							{
								fieldtype: "Data",
								fieldname: "custom_oem_url",
								label: __("OEM URL")
							},
							{
								fieldtype: "Text",
								fieldname: "custom_oem_description",
								label: __("OEM Description"),
							}
						],
						primary_action_label: __("Save & Escalate"),
						primary_action(values) {
							// Update status and save OEM details - make sequential calls
							// ✅ VALIDATION: OEM details must be entered
							if (!values.custom_oem_id || !values.custom_oem_id.trim()) {
								frappe.msgprint({
									title: __("Missing OEM ID"),
									message: __("Please enter OEM ID before escalating."),
									indicator: "red"
								});
								return; // ⛔ stop execution
							}
							const new_status = "OEM Escalated"; // Define new_status for OEM escalation
							frappe.call({
								method: "frappe.client.set_value",
								args: {
									doctype: "Issue",
									name: issue,
									fieldname: "status",
									value: new_status
								},
								freeze: true,
								freeze_message: "Updating OEM escalation...",
								callback: function (r) {
									console.log("🟢 Status Update response:", r);
									if (!r.exc) {
										// After status update, update OEM details field
										frappe.call({
											method: "frappe.client.set_value",
											args: {
												doctype: "Issue",
												name: issue,
												// Save all OEM fields together
												fieldname: {
													custom_oem_id: values.custom_oem_id || "",
													custom_oem_url: values.custom_oem_url || "",
													custom_oem_description: values.custom_oem_description || ""
												}
											},
											callback: function (r2) {
												console.log("🟢 OEM Details Update response:", r2);
												if (!r2.exc) {
													frappe.show_alert({
														message: __("Issue escalated to OEM with status {0}", [new_status]),
														indicator: "green"
													});
													oem_dialog.hide();
													if (me.load_issue_details) me.load_issue_details(issue);
													me.resetActionBar();
													me.refreshAllData();
												} else {
													frappe.msgprint(__("Error saving OEM details: {0}", [r2.exc]));
												}
											}
										});
									} else {
										frappe.msgprint(__("Error updating status: {0}", [r.exc]));
									}
								}
							});
						}
					});
					oem_dialog.show();
					setTimeout(() => {
						const closeBtn = oem_dialog.get_close_btn();
						if (!closeBtn || !closeBtn.length) {
							return;
						}
						closeBtn.off("click.dialog").on("click.dialog", function () {
							oem_dialog.hide();
						});
					}, 50);
					return;
				}

				// For other status changes, proceed normally
				let new_status = null;
				if (action === "set_client_input_pending") new_status = "Client Input Pending";
				//else if (action === "set_resolved") new_status = "Resolved";

				if (action === "set_resolved") {
					// First, fetch existing resolution details
					frappe.call({
						method: "frappe.client.get_value",
						args: {
							doctype: "Issue",
							filters: { name: issue },
							fieldname: ["resolution_details"]
						},
						callback: function (response) {
							const existing_resolution = response.message?.resolution_details || "";

							const resolved_dialog = new frappe.ui.Dialog({
								title: __("Resolve Issue"),
								fields: [
									{
										fieldtype: "Text Editor",
										fieldname: "resolution_details",
										label: __("Resolution Details"),
										default: existing_resolution
									}
								],
								primary_action_label: __("Save & Resolve"),
								primary_action(values) {
									const rawResolution = values.resolution_details || "";
									const stripHtml = (html) => {
										if (frappe?.utils?.strip_html) {
											return frappe.utils.strip_html(html);
										}
										const tmp = document.createElement("div");
										tmp.innerHTML = html;
										return tmp.textContent || tmp.innerText || "";
									};
									const normalizedResolution = stripHtml(rawResolution)
										.replace(/\u00a0/g, " ")
										.trim();
									if (!normalizedResolution) {
										frappe.msgprint({
											title: __("Missing Resolution Details"),
											message: __("Please enter resolution details before marking as Resolved."),
											indicator: "red"
										});
										return; // ⛔ stop execution
									}
									// Enforce minimum length for resolution details (plain text)
									if (normalizedResolution.length < 50) {
										frappe.msgprint({
											title: __("Resolution Details Too Short"),
											message: __("Please provide at least 50 characters in the resolution details before marking as Resolved."),
											indicator: "red"
										});
										return; // ⛔ stop execution
									}
									const new_status = "Resolved";
									frappe.call({
										method: "frappe.client.set_value",
										args: {
											doctype: "Issue",
											name: issue,
											fieldname: "status",
											value: new_status
										},
										freeze: true,
										freeze_message: "Updating Resolved status ...",
										callback: function (r) {
											//console.log("🟢 Status Update response:", r);
											if (!r.exc) {
												frappe.call({
													method: "frappe.client.set_value",
													args: {
														doctype: "Issue",
														name: issue,
														fieldname: "resolution_details",
														value: values.resolution_details
													},
													callback: function (r2) {
														//console.log("🟢 Resolution Details Update response:", r2);
														if (!r2.exc) {
															frappe.show_alert({
																message: __("Issue marked as Resolved with status {0}", [new_status]),
																indicator: "green"
															});
															resolved_dialog.hide();
															if (me.load_issue_details) me.load_issue_details(issue);
															me.bindResolutionEdit(issue);
															me.resetActionBar();
															me.refreshAllData();
														} else {
															frappe.msgprint(__("Error saving resolution details: {0}", [r2.exc]));
														}
													}
												})
											} else {
												frappe.msgprint(__("Error updating status: {0}", [r.exc]));
											}
										}
									});
								}
							});
							resolved_dialog.show();
							setTimeout(() => {
								const closeBtn = resolved_dialog.get_close_btn();
								if (!closeBtn || !closeBtn.length) {
									return;
								}
								closeBtn.off("click.dialog").on("click.dialog", function () {
									resolved_dialog.hide();
								});
							}, 50);
						}
					});
					return;
				}

				console.log("🟡 Status change clicked:", action, "→", new_status);

				if (!new_status) return;

				frappe.call({
					method: "frappe.client.set_value",
					args: {
						doctype: "Issue",
						name: issue,
						fieldname: "status",
						value: new_status
					},
					freeze: true,
					freeze_message: "Updating status...",
					callback: function (r) {
						console.log("🟢 API callback response:", r);
						if (!r.exc) {
							frappe.show_alert({
								message: __("Status updated to {0}", [new_status]),
								indicator: "green"
							});
							if (me.load_issue_details) me.load_issue_details(issue);
						}
					}
				});
			});

		// 📧 Email button click
		$(this.wrapper).off("click", "#email-send").on("click", "#email-send", async function (e) {
			e.preventDefault();

			if (!issue) {
				frappe.msgprint("No issue selected.");
				return;
			}

			// 🔹 Fetch Issue details
			let issue_doc = await frappe.db.get_doc("Issue", issue);
			let customer = issue_doc.customer || null;

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

			const buildDefaultCc = async () => {
				try {
					const res = await frappe.call({
						method: "renewal_module.custom_module.page.ticket.ticket.get_cc_emails",
						args: { issue }
					});
					const ccEmails = Array.isArray(res?.message) ? res.message : [];
					return normalizeEmails(ccEmails);
				} catch (err) {
					console.warn("[email] server cc lookup failed, falling back to client logic.", err);
					return [];
				}
			};

			// 🔹 Fetch contact + user email options
			let email_options = [];
			try {
				const res = await frappe.call({
					method: "renewal_module.custom_module.page.ticket.ticket.get_contact_emails",
					args: { customer: customer }
				});
				email_options = (res.message || []).map(normalizeOptionValue).filter(Boolean);
			} catch (err) {
				console.error("Error fetching contact emails:", err);
			}

			const issueContactEmails = normalizeEmails(
				(issue_doc.issue_contact_list || []).map((row) => row.email_id)
			);
			const defaultRecipients = issueContactEmails;
			const defaultCcList = await buildDefaultCc();
			const ccDefaults = normalizeEmails(defaultCcList);
			email_options = normalizeEmails([...email_options, ...defaultRecipients, ...ccDefaults]);

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
						default: defaultRecipients,
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
						default: ccDefaults,
						hidden: ccDefaults.length ? 0 : 1
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
						default: ` ${issue_doc.subject || issue_doc.name}`,
						reqd: 1
					},
					{
						label: __("Message"),
						fieldname: "content",
						fieldtype: "Text Editor",
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

					if (!values.recipients || !values.subject || !values.content) {
						frappe.msgprint("Please fill in all required fields.");
						return;
					}

					const recipients = recipientsList.join(", ");
					const cc = ccList.join(", ");
					const bcc = bccList.join(", ");

					let attachments = Array.isArray(email_dialog.__attachments) ? email_dialog.__attachments : [];
					// fallback to any single attach value if user didn't use the button
					if (!attachments.length && values.attachments) {
						attachments = [{
							file_url: values.attachments.file_url || values.attachments,
							file_name: values.attachments.file_name || null
						}];
					}


					frappe.call({
						method: "renewal_module.custom_module.page.ticket.ticket.send_issue_email",
						args: {
							recipients: recipients,
							cc: cc,
							bcc: bcc,
							subject: values.subject,
							content: values.content,
							issue: issue,
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
			if (ccDefaults.length) {
				const cc_field = email_dialog.get_field("cc");
				cc_field.df.options = email_options;
				cc_field.refresh();
				cc_field.set_value(ccDefaults.join(", "));
				cc_field.df.hidden = 0;
				cc_field.refresh();
				email_dialog.$wrapper.find(".add-cc").hide();
				setTimeout(() => {
					cc_field.df.options = email_options;
					cc_field.refresh();
					cc_field.set_value(ccDefaults.join(", "));
					cc_field.df.hidden = 0;
					cc_field.refresh();
				}, 50);
			}
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

	listedit() {
		const me = this;
		$(document).off("click", "#add-contact-btn").on("click", "#add-contact-btn", function () {
			const issueName = frappe.get_route()[1];
			if (!issueName) {
				frappe.msgprint("No issue found.");
				return;
			}

			const normalizeEmail = (email) => String(email || "").trim().toLowerCase();
			const normalizeMobile = (mobile) => String(mobile || "").replace(/\D/g, "");

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
								filters: { company_name: customer },
								ignore_user_permissions: 1
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
						},
						{
							label: "TPOC",
							fieldname: "tpoc",
							fieldtype: "Check",
							default: 0
						}
					],
					primary_action_label: __("Add"),
					primary_action: async function (values) {
						if (!values.user_name) return;
						const incomingName = String(values.user_name || "").trim();
						const incomingEmail = normalizeEmail(values.email_id);
						const incomingMobile = normalizeMobile(values.mobile_no);

						// Check for duplicate contact and update only if fields are different
						try {
							const issueDoc = await frappe.db.get_doc("Issue", issueName);
							const contactRows = issueDoc?.issue_contact_list || [];
							const existingRow = contactRows.find(r => String(r.user_name || "").trim() === incomingName);

							// Different contact name but same email/mobile should be rejected.
							const conflictRow = contactRows.find((row) => {
								const rowName = String(row.user_name || "").trim();
								if (rowName === incomingName) return false;
								const sameEmail = incomingEmail && normalizeEmail(row.email_id) === incomingEmail;
								const sameMobile = incomingMobile && normalizeMobile(row.mobile_no) === incomingMobile;
								return sameEmail || sameMobile;
							});

							if (conflictRow) {
								frappe.msgprint({
									title: __("Duplicate Contact"),
									message: __("Another contact already exists with the same Email or Mobile No."),
									indicator: "orange"
								});
								return;
							}

							if (existingRow) {
								// Compare all fields to check if they're identical
								const isIdentical =
									normalizeEmail(existingRow.email_id) === incomingEmail &&
									normalizeMobile(existingRow.mobile_no) === incomingMobile &&
									existingRow.designation === values.designation &&
									(existingRow.tpoc || 0) === (values.tpoc || 0);

								if (isIdentical) {
									// All fields are same, show duplicate message
									frappe.msgprint({
										title: __("Duplicate Contact"),
										message: __("This contact is already added with the same details."),
										indicator: "orange"
									});
									return;
								}

								// Fields are different, update the existing contact
								frappe.call({
									method: "frappe.client.set_value",
									args: {
										doctype: "Issue Contact List",
										name: existingRow.name,
										fieldname: {
											email_id: values.email_id,
											mobile_no: values.mobile_no,
											designation: values.designation,
											tpoc: values.tpoc || 0
										}
									},
									callback: function (r) {
										if (!r.exc) {
											frappe.show_alert({
												message: __("✅ Contact updated successfully."),
												indicator: "green"
											});
											dialog.hide();
											load_issue_contacts(issueName, values.user_name);
										}
									}
								});
								return;
							}
						} catch (err) {
							console.error("Failed to check existing contacts:", err);
						}

						frappe.call({
							method: "frappe.client.insert",
							args: {
								doc: {
									doctype: "Issue Contact List",
									parent: issueName,
									parentfield: "issue_contact_list",
									parenttype: "Issue",
									user_name: incomingName,
									email_id: values.email_id,
									mobile_no: values.mobile_no,
									designation: values.designation,
									tpoc: values.tpoc || 0
								}
							},
							callback: function (r) {
								if (!r.exc) {
									frappe.show_alert({
										message: __("✅ Contact added successfully."),
										indicator: "green"
									});
									dialog.hide();
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
			console.log("render contact", issueName)
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
									<i class="fa fa-check-circle contact-tpoc-icon
										${row.tpoc ? "text-success" : "text-muted invisible"}">
									</i>
									<span class="contact-name text-truncate" data-index="${i}" style="cursor:pointer;" title="${name}">
										${name}
									</span>
									<i class="fa fa-trash-can text-danger delete-contact" 
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

		$(document).off("click", "#change-support-type-btn").on("click", "#change-support-type-btn", function () {
			const issueName = frappe.get_route()[1];
			if (!issueName) {
				frappe.msgprint("No issue found.");
				return;
			}
			frappe.db.get_value("Issue", issueName, "custom_support_type", (r) => {
				const currentSupportType = r?.custom_support_type || "";
				const dialog = new frappe.ui.Dialog({
					title: __("Change Support Type"),
					fields: [
						{
							label: "Support Type",
							fieldname: "custom_support_type",
							fieldtype: "Select",
							options: "\nRemote Support\nPhysical Support",
							default: currentSupportType,
						}
					],
					primary_action_label: __("Update"),
					primary_action: function (values) {
						if (!values.custom_support_type) return;
						frappe.call({
							method: "frappe.client.set_value",
							args: {
								doctype: "Issue",
								name: issueName,
								fieldname: "custom_support_type",
								value: values.custom_support_type
							},
							callback: function (r) {
								if (!r.exc) {
									frappe.show_alert({
										message: __("Support Type updated successfully."),
										indicator: "green"
									});
									dialog.hide();
									load_issue_contacts(issueName, values.user_name);
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
		});

	}


	bindTagEvents(issue, leftCol, rightCol) {
		const issue_name = issue;
		const self = this;

		const getQuickViewPanelHtml = () => `
			<div id="quick-view-panel" class="d-flex flex-column gap-2">
				<div class="card border-0 bg-light mb-0">
					<div class="card-body p-2">
						<div class="d-flex align-items-center justify-content-between mb-1">
							<span class="mb-0 text-muted fw-semibold" style="font-size:12px;">Pending Tasks</span>
						</div>
						<div id="quick-pending-tasks-list" class="mt-1" style="max-height: 150px; overflow-y: auto;">
							<div class="text-center p-2 text-muted small">Loading...</div>
						</div>
					</div>
				</div>
				<div class="card border-0 bg-light mb-0">
					<div class="card-body p-2">
						<div class="d-flex align-items-center justify-content-between mb-1">
							<span class="mb-0 text-muted fw-semibold" style="font-size:12px;">Today & Upcoming Calls</span>
						</div>
						<div id="quick-open-calls-list" class="mt-1" style="max-height: 150px; overflow-y: auto;">
							<div class="text-center p-2 text-muted small">Loading...</div>
						</div>
					</div>
				</div>
				<div class="card border-0 bg-light mb-0">
					<div class="card-body p-2">
						<div class="d-flex align-items-center justify-content-between mb-1">
							<span class="mb-0 text-muted fw-semibold" style="font-size:12px;">Today & Upcoming Appointments</span>
						</div>
						<div id="quick-open-appointments-list" class="mt-1" style="max-height: 150px; overflow-y: auto;">
							<div class="text-center p-2 text-muted small">Loading...</div>
						</div>
					</div>
				</div>
				<div class="card border-0 bg-light mb-0">
					<div class="card-body p-2">
						<div class="d-flex align-items-center justify-content-between mb-1">
							<span class="mb-0 text-muted fw-semibold" style="font-size:12px;">Latest Note</span>
						</div>
						<div id="quick-latest-note" class="mt-1" style="max-height: 150px; overflow-y: auto;">
							<div class="text-center p-2 text-muted small">Loading...</div>
						</div>
					</div>
				</div>
			</div>
		`;

		// Render lucide icons if available
		if (window.lucide) lucide.createIcons();

		$(document)
			.off("click", ".tag-item .tag-texts")
			.on("click", ".tag-item .tag-texts", function (e) {
				e.preventDefault();
				e.stopPropagation();

				const isDesktop = window.matchMedia("(min-width: 992px)").matches;
				if (isDesktop) {
					return;
				}

				const $sourcePanel = rightCol.find(".ticket-detail-panel").first();
				if (!$sourcePanel.length) return;

				const getSectionHtml = (selector, options = {}) => {
					const $clone = $sourcePanel.find(selector).first().clone();
					if (!$clone.length) return `<div class="text-muted small">No data</div>`;
					if (options.removeNoteInput) {
						$clone.find("#quick-note-text, #save-quick-note-btn").remove();
					}
					$clone.find("#hidden-activity-cards").remove();
					$clone.find("[id]").removeAttr("id");
					return $clone.html() || `<div class="text-muted small">No data</div>`;
				};

				const notesHtml = getSectionHtml("#ticket-activity-notes-section", { removeNoteInput: true });
				const tasksHtml = getSectionHtml("#ticket-activity-tasks-section");
				const callsHtml = getSectionHtml("#ticket-activity-calls-section");
				const appointmentsHtml = getSectionHtml("#ticket-activity-appointments-section");

				const mobilePanelHtml = `
					<div class="ticket-detail-panel mobile-ticket-panel">
						<div class="panel__tabs">
							<button class="ptab is-active" data-type="Notes" title="Notes"><span class="ptab__icon">📝</span><span class="ptab__label">Notes</span></button>
							<button class="ptab" data-type="Tasks" title="Tasks"><span class="ptab__icon">✅</span><span class="ptab__label">Tasks</span></button>
							<button class="ptab" data-type="Calls" title="Calls"><span class="ptab__icon">📞</span><span class="ptab__label">Calls</span></button>
							<button class="ptab" data-type="Appointments" title="Appointments"><span class="ptab__icon">📅</span><span class="ptab__label">Appointments</span></button>
							
						</div>
						<div class="panel__header">
							<div class="panel__subtitle" id="mobile-ticket-panel-subtitle">Notes</div>
							<button class="btn-panel-create" id="mobile-ticket-btn-panel-add"><i class="fa fa-plus"></i> New Note</button>
						</div>
						<div class="panel__cards">
							<div class="mobile-ticket-section" data-type="Notes">${notesHtml}</div>
							<div class="mobile-ticket-section d-none" data-type="Tasks">${tasksHtml}</div>
							<div class="mobile-ticket-section d-none" data-type="Calls">${callsHtml}</div>
							<div class="mobile-ticket-section d-none" data-type="Appointments">${appointmentsHtml}</div>
						</div>
						<div class="panel__form d-none" id="mobile-ticket-panel-form">
							<div class="panel__form-head d-flex justify-content-between align-items-center mb-2">
								<div class="panel__form-title" id="mobile-ticket-panel-form-title">New Activity</div>
								<button type="button" class="btn btn-sm btn-light" id="mobile-ticket-btn-form-close"><i class="fa fa-times"></i></button>
							</div>
							<div id="mobile-ticket-panel-form-body"></div>
							<div class="d-flex justify-content-end gap-2 mt-2">
								<button type="button" class="btn btn-sm btn-primary" id="mobile-ticket-panel-save-btn">Save</button>
							</div>
						</div>
					</div>
				`;

				showRightPanelModal("Ticket Panel", mobilePanelHtml, "");

				setTimeout(() => {
					const $modal = $("#mobile-sla-modal");
					let mobileUsers = [];
					let mobileCustomer = "";
					const subtitleByType = {
						Notes: "Notes",
						Tasks: "Tasks",
						Calls: "Recent Calls",
						Appointments: "Recent Appointments",
					};
					const createLabelByType = {
						Notes: "New Note",
						Tasks: "New Task",
						Calls: "Create",
						Appointments: "Create",
					};

					const getActiveType = () => (
						$modal.find(".mobile-ticket-panel .ptab.is-active").data("type") || "Notes"
					).toString();

					const usersOptionsHtml = () => mobileUsers.map((u) => {
						const label = frappe.utils.escape_html(String(u.full_name || u.name || u.email || "User"));
						const value = frappe.utils.escape_html(String(u.email || u.name || ""));
						return `<option value="${value}">${label}</option>`;
					}).join("");

					const ensureMobileContext = async () => {
						if (!mobileCustomer) {
							try {
								const issueRes = await frappe.call({
									method: "frappe.client.get_value",
									args: {
										doctype: "Issue",
										filters: { name: issue_name },
										fieldname: ["customer"],
									},
									silent: true,
								});
								mobileCustomer = issueRes?.message?.customer || "";
							} catch (e) {
								mobileCustomer = "";
							}
						}

						if (!mobileUsers.length) {
							try {
								const usersRes = await frappe.call({
									method: "renewal_module.custom_module.page.ticket.ticket.get_enabled_users",
									silent: true,
								});
								mobileUsers = Array.isArray(usersRes?.message) ? usersRes.message : [];
							} catch (e) {
								mobileUsers = [];
							}
						}
					};

					const showMobileForm = async (type) => {
						await ensureMobileContext();
						const $panel = $modal.find(".mobile-ticket-panel");
						$panel.find(".panel__cards").addClass("d-none");
						$panel.find("#mobile-ticket-panel-form").removeClass("d-none");
						$panel.find("#mobile-ticket-btn-panel-add").hide();
						$panel.find(".panel__subtitle").text(type === "Calls" ? "New Call" : type === "Tasks" ? "New Task" : type === "Appointments" ? "New Appointment" : "New Note");
						$panel.find("#mobile-ticket-panel-form-title").text(type === "Calls" ? "New Call" : type === "Tasks" ? "New Task" : type === "Appointments" ? "New Appointment" : "New Note");

						if (type === "Notes") {
							$panel.find("#mobile-ticket-panel-save-btn").text("Save Note");
							$panel.find("#mobile-ticket-panel-form-body").html(`
								<div class="panel__field">
									<label>Note</label>
									<textarea class="panel__input" id="mobile-note-text" rows="4" placeholder="Write a note"></textarea>
								</div>
							`);
							return;
						}

						if (type === "Tasks") {
							$panel.find("#mobile-ticket-panel-save-btn").text("Save Task");
							$panel.find("#mobile-ticket-panel-form-body").html(`
								<div class="panel__field"><label>Subject *</label><input type="text" class="panel__input" id="mobile-task-subject" /></div>
								<div class="panel__field"><label>Assign To</label><select class="panel__input" id="mobile-task-assign" multiple>${usersOptionsHtml()}</select></div>
								<div class="panel__field"><label>Expected End Date</label><input type="date" class="panel__input" id="mobile-task-end-date" /></div>
								<div class="panel__field"><label>Description</label><textarea class="panel__input" id="mobile-task-desc" rows="3"></textarea></div>
							`);
							return;
						}

						if (type === "Calls") {
							$panel.find("#mobile-ticket-panel-save-btn").text("Save Call");
							$panel.find("#mobile-ticket-panel-form-body").html(`
								<div class="panel__field"><label>Subject *</label><input type="text" class="panel__input" id="mobile-call-subject" /></div>
								<div class="panel__field"><label>Related To</label><select class="panel__input" id="mobile-call-related-to"><option value="Customer" selected>Customer</option><option value="Contact">Contact</option></select></div>
								<div class="panel__field"><label>Full Name *</label><input type="text" class="panel__input" id="mobile-call-name" value="${frappe.utils.escape_html(mobileCustomer)}" /></div>
								<div class="panel__field"><label>Status</label><select class="panel__input" id="mobile-call-status"><option value="Held">Held</option><option value="Scheduled">Scheduled</option><option value="Cancelled">Cancelled</option></select></div>
								<div class="panel__field"><label>Start Date</label><input type="date" class="panel__input" id="mobile-call-start-date" /></div>
								<div class="panel__field"><label>Start Time</label><input type="time" class="panel__input" id="mobile-call-start-time" /></div>
								<div class="panel__field"><label>End Date</label><input type="date" class="panel__input" id="mobile-call-end-date" /></div>
								<div class="panel__field"><label>End Time</label><input type="time" class="panel__input" id="mobile-call-end-time" /></div>
								<div class="panel__field"><label>Description</label><textarea class="panel__input" id="mobile-call-desc" rows="3"></textarea></div>
							`);

							const callDefaults = getActivityDateTimeDefaults("Calls");
							$panel.find("#mobile-call-start-date").val(callDefaults.start_date);
							$panel.find("#mobile-call-start-time").val(callDefaults.start_time);
							$panel.find("#mobile-call-end-date").val(callDefaults.end_date);
							$panel.find("#mobile-call-end-time").val(callDefaults.end_time);

							$panel.find("#mobile-call-related-to")
								.off("change.mobileTicketCallRelated")
								.on("change.mobileTicketCallRelated", function () {
									const relatedTo = ($(this).val() || "").toString();
									if (relatedTo === "Customer") {
										$panel.find("#mobile-call-name").val(mobileCustomer || "");
									} else {
										$panel.find("#mobile-call-name").val("");
									}
								});
							return;
						}

						$panel.find("#mobile-ticket-panel-save-btn").text("Schedule Appointment");
						$panel.find("#mobile-ticket-panel-form-body").html(`
							<div class="panel__field"><label>Appointment With</label><select class="panel__input" id="mobile-apt-with"><option value="Customer" selected>Customer</option><option value="Lead">Lead</option></select></div>
							<div class="panel__field"><label>Party</label><input type="text" class="panel__input" id="mobile-apt-party" value="${frappe.utils.escape_html(mobileCustomer)}" /></div>
							<div class="panel__field"><label>Name *</label><input type="text" class="panel__input" id="mobile-apt-name" /></div>
							<div class="panel__field"><label>Email *</label><input type="email" class="panel__input" id="mobile-apt-email" /></div>
							<div class="panel__field"><label>Phone Number</label><input type="text" class="panel__input" id="mobile-apt-phone" /></div>
							<div class="panel__field"><label>Participants *</label><select class="panel__input" id="mobile-apt-participants" multiple>${usersOptionsHtml()}</select></div>
							<div class="panel__field"><label>Start Date *</label><input type="date" class="panel__input" id="mobile-apt-start-date" /></div>
							<div class="panel__field"><label>Start Time *</label><input type="time" class="panel__input" id="mobile-apt-start-time" /></div>
							<div class="panel__field"><label>End Date *</label><input type="date" class="panel__input" id="mobile-apt-end-date" /></div>
							<div class="panel__field"><label>End Time *</label><input type="time" class="panel__input" id="mobile-apt-end-time" /></div>
							<div class="panel__field"><label>Details</label><textarea class="panel__input" id="mobile-apt-details" rows="3"></textarea></div>
						`);

						const appointmentDefaults = getActivityDateTimeDefaults("Appointments");
						$panel.find("#mobile-apt-start-date").val(appointmentDefaults.start_date);
						$panel.find("#mobile-apt-start-time").val(appointmentDefaults.start_time);
						$panel.find("#mobile-apt-end-date").val(appointmentDefaults.end_date);
						$panel.find("#mobile-apt-end-time").val(appointmentDefaults.end_time);

						$panel.find("#mobile-apt-with")
							.off("change.mobileTicketAppointmentWith")
							.on("change.mobileTicketAppointmentWith", function () {
								const appointmentWith = ($(this).val() || "").toString();
								if (appointmentWith === "Customer") {
									$panel.find("#mobile-apt-party").val(mobileCustomer || "");
								} else {
									$panel.find("#mobile-apt-party").val("");
								}
							});
					};

					const hideMobileForm = () => {
						const $panel = $modal.find(".mobile-ticket-panel");
						$panel.find("#mobile-ticket-panel-form").addClass("d-none");
						$panel.find(".panel__cards").removeClass("d-none");
						$panel.find("#mobile-ticket-btn-panel-add").show();
						updateMobileHeader(getActiveType());
					};

					const updateMobileHeader = (type) => {
						$modal.find("#mobile-ticket-panel-subtitle").text(subtitleByType[type] || type);
						$modal.find("#mobile-ticket-btn-panel-add").html(`<i class="fa fa-plus"></i> ${createLabelByType[type] || "Create"}`);
					};

					$modal.off("click.mobileTicketTabs", ".mobile-ticket-panel .ptab");
					$modal.on("click.mobileTicketTabs", ".mobile-ticket-panel .ptab", function () {
						const type = ($(this).data("type") || "Notes").toString();
						const $panel = $modal.find(".mobile-ticket-panel");
						$panel.find(".ptab").removeClass("is-active");
						$(this).addClass("is-active");
						$panel.find(".mobile-ticket-section").addClass("d-none");
						$panel.find(`.mobile-ticket-section[data-type='${type}']`).removeClass("d-none");
						hideMobileForm();
						updateMobileHeader(type);
					});

					$modal.off("click.mobileTicketCreate", "#mobile-ticket-btn-panel-add");
					$modal.on("click.mobileTicketCreate", "#mobile-ticket-btn-panel-add", async function () {
						const activeType = getActiveType();
						await showMobileForm(activeType);
					});

					$modal.off("click.mobileTicketFormClose", "#mobile-ticket-btn-form-close");
					$modal.on("click.mobileTicketFormClose", "#mobile-ticket-btn-form-close", function () {
						hideMobileForm();
					});

					$modal.off("click.mobileTicketFormSave", "#mobile-ticket-panel-save-btn");
					$modal.on("click.mobileTicketFormSave", "#mobile-ticket-panel-save-btn", async function () {
						const activeType = getActiveType();
						const $saveBtn = $(this);
						$saveBtn.prop("disabled", true).text("Saving...");

						try {
							if (activeType === "Notes") {
								const noteText = ($modal.find("#mobile-note-text").val() || "").trim();
								if (!noteText) {
									frappe.msgprint(__("Please enter note"));
									return;
								}
								await frappe.call({
									method: "renewal_module.custom_module.page.ticket.ticket.add_issue_note",
									args: { issue_name, note_text: noteText },
								});
								frappe.show_alert({ message: __("Note added"), indicator: "green" });
								self.loadAndRenderNotes(issue_name);
								hideMobileForm();
								return;
							}

							if (activeType === "Tasks") {
								const subject = ($modal.find("#mobile-task-subject").val() || "").trim();
								if (!subject) {
									frappe.msgprint(__("Please enter subject"));
									return;
								}
								const desc = ($modal.find("#mobile-task-desc").val() || "").trim();
								const expEnd = ($modal.find("#mobile-task-end-date").val() || "").trim();
								const selectedUsers = $modal.find("#mobile-task-assign").val() || [];
								await frappe.call({
									method: "frappe.client.insert",
									args: {
										doc: {
											doctype: "Task",
											subject,
											description: desc,
											exp_end_date: expEnd,
											issue: issue_name,
											custom_users: (Array.isArray(selectedUsers) ? selectedUsers : [selectedUsers]).filter(Boolean).map((email) => ({ user: email })),
										}
									}
								});
								frappe.show_alert({ message: __("Task created"), indicator: "green" });
								self.bindTaskCardsEvents(issue_name);
								hideMobileForm();
								return;
							}

							if (activeType === "Calls") {
								const subject = ($modal.find("#mobile-call-subject").val() || "").trim();
								const name1 = ($modal.find("#mobile-call-name").val() || "").trim();
								if (!subject || !name1) {
									frappe.msgprint(__("Please fill required call fields"));
									return;
								}
								const related_to = ($modal.find("#mobile-call-related-to").val() || "Customer").trim();
								let custom_sales_person = "";
								if (related_to === "Customer") {
									try {
										const salesRes = await frappe.call({
											method: "renewal_module.custom_module.page.ticket.ticket.get_customer_sales_person",
											args: { customer: name1 },
											silent: true,
										});
										custom_sales_person = salesRes?.message || "";
									} catch (e) {
										custom_sales_person = "";
									}
								}
								await frappe.call({
									method: "frappe.client.insert",
									args: {
										doc: {
											doctype: "Call List",
											subject,
											name1,
											related_to,
											status: ($modal.find("#mobile-call-status").val() || "Held").trim(),
											description: ($modal.find("#mobile-call-desc").val() || "").trim(),
											issue_id: issue_name,
											custom_date: frappe.datetime.get_today(),
											start_date: ($modal.find("#mobile-call-start-date").val() || "").trim(),
											end_date: ($modal.find("#mobile-call-end-date").val() || "").trim(),
											start_timing: ($modal.find("#mobile-call-start-time").val() || "").trim(),
											end_timing: ($modal.find("#mobile-call-end-time").val() || "").trim(),
											custom_sales_person,
										}
									}
								});
								frappe.show_alert({ message: __("Call created"), indicator: "green" });
								self.bindcallcardsEvents(issue_name);
								hideMobileForm();
								return;
							}

							const customer_name = ($modal.find("#mobile-apt-name").val() || "").trim();
							const customer_email = ($modal.find("#mobile-apt-email").val() || "").trim();
							const startDate = ($modal.find("#mobile-apt-start-date").val() || "").trim();
							const startTime = ($modal.find("#mobile-apt-start-time").val() || "").trim();
							const endDate = ($modal.find("#mobile-apt-end-date").val() || "").trim();
							const endTime = ($modal.find("#mobile-apt-end-time").val() || "").trim();
							const participants = $modal.find("#mobile-apt-participants").val() || [];
							if (!customer_name || !customer_email || !startDate || !startTime || !endDate || !endTime || !participants.length) {
								frappe.msgprint(__("Please fill all required appointment fields"));
								return;
							}
							await frappe.call({
								method: "frappe.client.insert",
								args: {
									doc: {
										doctype: "Appointment",
										appointment_with: ($modal.find("#mobile-apt-with").val() || "Customer").trim(),
										party: ($modal.find("#mobile-apt-party").val() || "").trim(),
										customer_name,
										customer_phone_number: ($modal.find("#mobile-apt-phone").val() || "").trim(),
										customer_email,
										scheduled_time: frappe.datetime?.now_datetime ? frappe.datetime.now_datetime() : "",
										custom_participants: participants.map((user) => ({ user })),
										customer_details: ($modal.find("#mobile-apt-details").val() || "").trim(),
										custom_start_date: startDate,
										custom_start_time: startTime,
										custom_end_date: endDate,
										custom_end_time: endTime,
										custom_issue_id: issue_name,
									}
								}
							});
							frappe.show_alert({ message: __("Appointment created"), indicator: "green" });
							self.bindAppointmentCardsEvents(issue_name);
							self.bindcallcardsEvents(issue_name);
							hideMobileForm();
						} finally {
							$saveBtn.prop("disabled", false).text(activeType === "Appointments" ? "Schedule Appointment" : activeType === "Calls" ? "Save Call" : activeType === "Tasks" ? "Save Task" : "Save Note");
						}
					});

					updateMobileHeader("Notes");
				}, 0);
			});


		$(document)
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

		$(document)
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

		$(document)
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

			const $infoCard = rightCol.find("#ticket-info-card");
			if ($infoCard.length) {
				// Update title
				$infoCard.find(".sla-title").html(title);
				// Update optional extra button (preserve quick-view and time-logs buttons)
				$infoCard.find(".sla-extra-btn").remove();
				if (titleButtonHTML) {
					$infoCard.find(".sla-header .d-flex.align-items-center.gap-1.flex-shrink-0").append(`<span class="sla-extra-btn">${titleButtonHTML}</span>`);
				}
				$infoCard.find(".sla-body").html(content);
			} else {
				const $panel = rightCol.find(".ticket-detail-panel").first();
				const $panelInfoCard = $panel.find("#ticket-panel-info-card");
				if ($panel.length && $panelInfoCard.length) {
					const prevState = {
						tabsHidden: $panel.find(".panel__tabs").hasClass("d-none"),
						headerHidden: $panel.find(".panel__header").hasClass("d-none"),
						cardsHidden: $panel.find("#ticket-panel-cards-section").hasClass("d-none"),
						formHidden: $panel.find("#ticket-panel-form-section").hasClass("d-none"),
					};
					if ($panelInfoCard.hasClass("d-none") || !$panel.data("ticketPanelPrevState")) {
						$panel.data("ticketPanelPrevState", prevState);
					}

					$panel.find("#ticket-panel-info-title").html(title || "Details");
					$panel.find("#ticket-panel-info-content").html(content || "");

					$panel.find(".panel__tabs, .panel__header, #ticket-panel-cards-section, #ticket-panel-form-section").addClass("d-none");
					$panelInfoCard.removeClass("d-none");

					$panel.off("click.ticketPanelInfo", "#ticket-panel-info-close").on("click.ticketPanelInfo", "#ticket-panel-info-close", function () {
						const saved = $panel.data("ticketPanelPrevState") || {};
						$panelInfoCard.addClass("d-none");
						if (saved.tabsHidden) $panel.find(".panel__tabs").addClass("d-none"); else $panel.find(".panel__tabs").removeClass("d-none");
						if (saved.headerHidden) $panel.find(".panel__header").addClass("d-none"); else $panel.find(".panel__header").removeClass("d-none");
						if (saved.cardsHidden) $panel.find("#ticket-panel-cards-section").addClass("d-none"); else $panel.find("#ticket-panel-cards-section").removeClass("d-none");
						if (saved.formHidden) $panel.find("#ticket-panel-form-section").addClass("d-none"); else $panel.find("#ticket-panel-form-section").removeClass("d-none");
						$panel.removeData("ticketPanelPrevState");
					});
				}
			}
			showRightPanelModal(title, `<div class="card sla-compare-card p-2"><div class="sla-body">${content}</div></div>`, titleButtonHTML);
		}

		$(document).off("click", ".quick-view-btn");


	}

	/* helper to load notes from server and render */
	loadAndRenderNotes(issue_name) {
		// show loading placeholder in notes list
		$("#main-notes-list").html(`
			<div class="d-flex align-items-center text-muted small py-2">
				<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
				<span>Loading notes...</span>
			</div>
		`);

		const self = this;
		frappe.call({
			method: "renewal_module.custom_module.page.ticket.ticket.get_issue_notes",
			args: { issue_name },
			callback: function (r) {
				const notes = (r.message && r.message.notes) || [];
				self.renderNotesList(notes);

				// Update pipeline notes count
				const notesCount = notes.length || 0;
				$("#pipeline-notes-count").text(notesCount);
				if (typeof self.updatePipelineAllCount === "function") {
					self.updatePipelineAllCount();
				}
			}
		});
	}

	loadQuickViewData(issue_name) {
		const self = this;

		// Re-use logic for tasks, calls, and appointments since it populates the specific ID we provided
		self.loadAndRenderPendingTasks(issue_name);
		self.loadAndRenderUpcomingNonHeldCalls(issue_name);
		self.loadAndRenderTodayOpenAppointments(issue_name);

		// Custom logic just to fetch and display the ONE latest note in the Quick View panel
		frappe.call({
			method: "renewal_module.custom_module.page.ticket.ticket.get_issue_notes",
			args: { issue_name },
			callback: function (r) {
				const $latestNoteContainer = $(".rightcol #quick-latest-note, #mobile-sla-modal #quick-latest-note");
				if (!$latestNoteContainer.length) return;

				const notes = (r.message && r.message.notes) || [];
				if (!notes.length) {
					$latestNoteContainer.closest(".card").addClass("d-none");
					return;
				}
				$latestNoteContainer.closest(".card").removeClass("d-none");

				// Get latest note
				const sortedNotes = [...notes].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
				const latestNote = sortedNotes[0];

				const creatorName = frappe.utils.escape_html(latestNote.created_by || latestNote.owner || '');
				const noteBody = frappe.utils.escape_html(latestNote.note || '').replace(/\n/g, '<br>');
				const timestamp = latestNote.timestamp ? frappe.datetime.str_to_user(latestNote.timestamp) : '';

				const noteHtml = `
					<div class="note-card border rounded bg-white p-2">
						<div class="d-flex justify-content-between">
							<div class="fw-semibold" style="font-size:12px;">${creatorName}</div>
							<div class="text-muted" style="font-size:11px;">${timestamp}</div>
						</div>
						<div class="mt-1 text-muted" style="font-size: 13px;">${noteBody}</div>
					</div>
				`;
				$latestNoteContainer.html(noteHtml);
			}
		});
	}

	loadAndRenderUpcomingNonHeldCalls(issue_name) {
		const $lists = $(".rightcol #quick-open-calls-list, #mobile-sla-modal #quick-open-calls-list");
		if (!$lists.length) return;

		const esc = frappe.utils.escape_html;
		const today = frappe.datetime.get_today();

		const toDateOnly = (value) => {
			if (!value) return "";
			return String(value).split(" ")[0];
		};

		const toDisplayDate = (value) => {
			if (!value) return "";
			if (frappe.datetime?.str_to_user) {
				return frappe.datetime.str_to_user(String(value));
			}
			return String(value);
		};

		frappe.call({
			method: "renewal_module.custom_module.page.ticket.ticket.get_permitted_call_list",
			args: { issue_name },
			callback: function (r) {
				const calls = Array.isArray(r.message) ? r.message : [];
				const matchedCalls = calls.filter((callRow) => {
					const status = (callRow?.status || "").toLowerCase();
					const startDate = toDateOnly(callRow?.start_date);
					return status !== "held" && startDate && startDate >= today;
				}).sort((a, b) => {
					const aDate = toDateOnly(a?.start_date) || "9999-12-31";
					const bDate = toDateOnly(b?.start_date) || "9999-12-31";
					if (aDate !== bDate) return aDate.localeCompare(bDate);
					const aTime = String(a?.start_timing || "");
					const bTime = String(b?.start_timing || "");
					return aTime.localeCompare(bTime);
				});

				if (!matchedCalls.length) {
					$lists.closest(".card").addClass("d-none");
					return;
				}
				$lists.closest(".card").removeClass("d-none");

				const html = matchedCalls.slice(0, 10).map((callRow) => {
					const callName = esc(callRow.name || "");
					const subject = esc(callRow.subject || callRow.name1 || "Call");
					const startDate = esc(toDisplayDate(callRow.start_date || ""));
					const startTime = esc(callRow.start_timing || "");
					const status = esc(callRow.status || "-");
					return `
						<div class="border rounded bg-white p-2">
							<div class="d-flex justify-content-between align-items-center mb-2 gap-2">
								<span class="text-truncate" title="${callName}" style="max-width:68%;"><a href="/app/call-list/${callName}" class="text-decoration-none fw-medium text-dark">${callName}</a></span>
								<span class="badge bg-light text-dark border" title="${status}">${status}</span>
							</div>
							<div class="d-flex justify-content-between align-items-center mb-2 gap-2">
								<span class="text-truncate" title="${subject}" style="max-width:68%;"><a href="/app/call-list/${callName}" class="text-decoration-none fw-medium text-dark">${subject}</a></span>
								<span class="badge bg-light text-dark border" title="${startDate}${startTime}">${startDate}${startTime ? ` ${startTime}` : ""}</span>
							</div>
						</div>
						
					`;
				}).join("");

				$lists.html(html);
			}
		});
	}

	loadAndRenderPendingTasks(issue_name) {
		const $lists = $(".rightcol #quick-pending-tasks-list, #mobile-sla-modal #quick-pending-tasks-list");
		if (!$lists.length) return;

		const esc = frappe.utils.escape_html;
		frappe.call({
			method: "renewal_module.custom_module.page.ticket.ticket.get_tasks_with_children",
			args: { issue_name },
			callback: function (r) {
				const tasks = Array.isArray(r.message) ? r.message : [];
				const pendingTasks = tasks.filter((task) => (task?.status || "").toLowerCase() !== "completed");

				if (!pendingTasks.length) {
					$lists.closest(".card").addClass("d-none");
					return;
				}
				$lists.closest(".card").removeClass("d-none");

				const html = pendingTasks.slice(0, 10).map((task) => {
					const taskName = esc(task.name || "");
					const subject = esc(task.subject || task.name || "Untitled Task");
					const status = esc(task.status || "-");
					return `
						<div class="border rounded bg-white p-2 mb-2">
							<div class="small text-muted mb-1 text-truncate" title="${subject}">${subject}</div>
							<div class="d-flex justify-content-between align-items-center" style="box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
								<span class="text-truncate" title="${taskName}" style="max-width:70%;"><a href="/app/task/${taskName}" class="text-decoration-none fw-medium text-dark">${taskName}</a></span>
								<span class="badge bg-light text-dark border">${status}</span>
							</div>
						</div>
					`;
				}).join("");

				$lists.html(html);
			}
		});
	}

	loadAndRenderTodayOpenAppointments(issue_name) {
		const $lists = $(".rightcol #quick-open-appointments-list, #mobile-sla-modal #quick-open-appointments-list");
		if (!$lists.length) return;

		const esc = frappe.utils.escape_html;
		const today = frappe.datetime.get_today();

		const toDateOnly = (value) => {
			if (!value) return "";
			return String(value).split(" ")[0];
		};

		frappe.call({
			method: "renewal_module.custom_module.page.ticket.ticket.get_permitted_appointments",
			args: { issue_name },
			callback: function (r) {
				const appointments = Array.isArray(r.message) ? r.message : [];
				const matchedAppointments = appointments.filter((appointment) => {
					const status = (appointment?.status || "").toLowerCase();
					const startDate = toDateOnly(appointment?.custom_start_date || appointment?.scheduled_time);
					return status === "open" && startDate && startDate >= today;
				}).sort((a, b) => {
					const aDate = toDateOnly(a?.custom_start_date || a?.scheduled_time) || "9999-12-31";
					const bDate = toDateOnly(b?.custom_start_date || b?.scheduled_time) || "9999-12-31";
					if (aDate !== bDate) return aDate.localeCompare(bDate);
					const aTime = String(a?.custom_start_time || "");
					const bTime = String(b?.custom_start_time || "");
					return aTime.localeCompare(bTime);
				});

				if (!matchedAppointments.length) {
					$lists.closest(".card").addClass("d-none");
					return;
				}
				$lists.closest(".card").removeClass("d-none");

				const html = matchedAppointments.slice(0, 10).map((appointment) => {
					const name = esc(appointment.name || "");
					const party = esc(appointment.party || "");
					const startDate = esc(frappe.datetime.str_to_user(appointment.custom_start_date || ""));
					const startTime = esc(appointment.custom_start_time || "");
					const customer_name = esc(appointment.customer_name || "");
					return `
						<div class="border rounded bg-white p-2 mb-2">
							<div class="d-flex justify-content-between align-items-center gap-2">
								<span class="text-truncate" title="${party}" style="max-width:70%;">${party}</span>
								<span class="badge bg-light text-dark border" title="${name}"><a href="/app/appointment/${name}" class="text-decoration-none fw-medium text-dark">${name}</a></span>
							</div>
							<div class="d-flex justify-content-between align-items-center gap-2">
								<span class="text-truncate" title="${customer_name}" style="max-width:70%;">${customer_name}</span>
								<span class="badge bg-light text-dark border" title="${name}">${startDate} ${startTime}</span>
							</div>
						</div>
					`;
				}).join("");

				$lists.html(html);
			}
		});
	}

	/* render notes list into #notes-list */
	renderNotesList(notes) {
		const $lists = $(".rightcol #notes-list, #mobile-sla-modal #notes-list, #main-notes-list");
		if (!$lists.length) return;

		if (!notes.length) {
			$lists.html('<p class="mb-0 text-muted small">No notes added yet.</p>');
			return;
		}

		const sortedNotes = [...notes].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
		const cardsHtml = sortedNotes.map((note) => {
			const initials = (note.created_by || note.owner || '').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
			const timestamp = note.timestamp ? frappe.datetime.str_to_user(note.timestamp) : '';
			const is_owner = frappe.session.user === note.owner;
			const is_admin = frappe.session.user === 'Administrator';
			const creatorName = frappe.utils.escape_html(note.created_by || note.owner || '');
			const customRole = frappe.utils.escape_html(note.custom_role || '');
			const noteBody = frappe.utils.escape_html(note.note || '').replace(/\n/g, '<br>');
			const avatarInitials = frappe.utils.escape_html(initials || 'NA');
			const action_buttons = `
	            		${is_owner || is_admin ? `<button class="note-edit btn btn-sm btn-light border me-1" data-idx="${note.idx}" title="Edit note" aria-label="Edit note">✏️</button>` : ''}
	            		${is_admin ? `<button class="note-delete btn btn-sm btn-light border text-danger" data-idx="${note.idx}" title="Delete note" aria-label="Delete note">🗑️</button>` : ''}
        		`;
			const user_avatar = `<div class="rounded-circle bg-primary text-white d-flex align-items-center justify-content-center fw-bold me-2 flex-shrink-0" style="width:32px;height:32px;">${avatarInitials}</div>`;

			return `
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
		}).join("");

		$lists.html(cardsHtml);
	}

	init_attachment_section(issueName) {
		const me = this;
		const $btn = $("#add-attachment-btn");
		const MAX_ATTACHMENT_SIZE_BYTES = 2 * 1024 * 1024;

		const bindUploaderClose = () => {
			let tries = 0;
			const maxTries = 20;
			const check = () => {
				const $modal = $(".modal:visible").filter(function () {
					return $(this).find(".file-uploader, .file-upload").length;
				});
				if ($modal.length) {
					const $close = $modal.find(".btn-modal-close, .modal-close, .btn-close");
					$close.off("click.uploaderClose").on("click.uploaderClose", function (ev) {
						ev.preventDefault();
						ev.stopPropagation();
						try {
							if (window.bootstrap?.Modal) {
								const inst = bootstrap.Modal.getInstance($modal[0]) || bootstrap.Modal.getOrCreateInstance($modal[0]);
								inst.hide();
							} else {
								$modal.modal("hide");
							}
						} catch (err) {
							$modal.removeClass("show in").hide();
						}
						$(".modal-backdrop").remove();
					});
				} else if (tries < maxTries) {
					tries++;
					setTimeout(check, 25);
				}
			};
			check();
		};
		if ($btn.length) {
			$btn.off("click.addAttachment").on("click.addAttachment", () => {
				if (!issueName) {
					frappe.msgprint(__("No issue selected."));
					return;
				}

				// Open uploader without enforcing a hard per-issue attachment limit.
				// We still enforce per-file size.
				frappe.db.count("File", {
					filters: {
						attached_to_doctype: "Issue",
						attached_to_name: issueName,
						is_folder: 0
					}
				}).then((count) => {
					new frappe.ui.FileUploader({
						doctype: "Issue",
						docname: issueName,
						allow_multiple: true,
						make_attachments_public: true,
						restrictions: {
							max_file_size: MAX_ATTACHMENT_SIZE_BYTES
						},
						upload_notes: __("Max file size: 2 MB."),
						on_success(file) {
							frappe.show_alert({ message: __("Attachment added"), indicator: "green" });
							me.render_issue_attachments(issueName);
						}
					});
					bindUploaderClose();
				}).catch((err) => {
					console.error("Failed to open uploader", err);
					frappe.msgprint(__("Unable to open uploader."));
				});
			});
		}

		this.render_issue_attachments(issueName);
	}

	render_issue_attachments(issueName) {
		const $list = $("#issue-attachments-list");
		if (!$list.length) return;
		// Check if current user is Administrator
		const isAdmin = frappe.user_roles.includes("Administrator");
		// Local helper: wait for the frappe.confirm modal to render, then hand back the jQuery element
		const waitForConfirmModal = (callback) => {
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
		};

		if (!issueName) {
			$list.html(`<span class="text-muted">${__("No attachments to show")}</span>`);
			return;
		}

		$list.html(`<span class="text-muted">${__("Loading attachments")}...</span>`);

		frappe.db.get_list("File", {
			fields: ["name", "file_name", "file_url", "creation", "owner"],
			filters: {
				attached_to_doctype: "Issue",
				attached_to_name: issueName,
				is_folder: 0
			},
			order_by: "creation desc",
			limit: 50
		}).then((files) => {
			if (!files || !files.length) {
				$list.html(`<span class="text-muted">${__("No attachments yet")}</span>`);
				return;
			}

			const visibleFiles = files;
			const hiddenFiles = [];

			const html = visibleFiles.map((file) => {
				const label = frappe.utils.escape_html(file.file_name || file.file_url || file.name);
				const url = file.file_url ? encodeURI(file.file_url) : "";
				const link = url
					? `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-decoration-none text-truncate" title="${label}">${label}</a>`
					: `<span class="text-muted text-truncate" title="${label}">${label}</span>`;

				// Only show delete button for administrators
				const deleteButton = isAdmin
					? `<button class="btn btn-link btn-sm text-danger p-0 attachment-delete" 
							data-file-name="${frappe.utils.escape_html(file.name)}" 
							title="${__("Delete attachment")}">
							<i class="fa fa-trash-can"></i>
						</button>`
					: '';

				return `
					<div class="d-flex align-items-center gap-1 px-2 py-1 border rounded bg-light attachment-chip" title="${label}">
						<i class="fa fa-paperclip text-muted"></i>
						${link}
						${deleteButton}
					</div>
				`;
			}).join("");

			$list.html(html);

			if (isAdmin) {

				$list.off("click.deleteAttachment").on("click.deleteAttachment", ".attachment-delete", (e) => {
					e.preventDefault();
					const fileName = $(e.currentTarget).data("file-name");
					if (!fileName) return;

					const refreshList = () => this.render_issue_attachments(issueName);

					frappe.confirm(
						__("Delete this attachment?"),
						() => {
							// show temporary state
							$list.html(`<span class="text-muted">${__("Removing attachment")}...</span>`);
							frappe.call({
								method: "frappe.client.delete",
								args: {
									doctype: "File",
									name: fileName
								},
								callback: () => {
									frappe.show_alert({ message: __("Attachment removed"), indicator: "green" });
									refreshList();
								},
								error: (err) => {
									console.error("Attachment delete failed", err);
									frappe.msgprint({ message: __("Unable to delete attachment"), indicator: "red" });
									refreshList();
								}
							});
						}
					);
					waitForConfirmModal(($modal) => {
						const $close = $modal.find(".btn-modal-close, .modal-close, .btn-close");
						$close.off("click.deleteAttachment").on("click.deleteAttachment", function (ev) {
							ev.preventDefault();
							ev.stopPropagation();
							try {
								if (window.bootstrap?.Modal) {
									const inst = bootstrap.Modal.getInstance($modal[0]) || bootstrap.Modal.getOrCreateInstance($modal[0]);
									inst.hide();
								} else {
									$modal.modal("hide");
								}
							} catch (err) {
								$modal.removeClass("show in").hide();
							}
							$(".modal-backdrop").remove();
						});
					});
				});
			}
		}).catch((err) => {
			console.error("Failed to load attachments", err);
			$list.html(`<span class="text-danger">${__("Unable to load attachments")}</span>`);
		});
	}

	bindTaskCardsEvents(issueName) {
		const self = this;
		const issue_name = issueName;
		const taskCardBody = document.querySelector("#tasks-card .card-body");
		const loadMoreBtn = document.querySelector("#tasks-card-load-more");


		const MAX_VISIBLE_TASKS = 5;
		let activeTaskFilter = "all";
		frappe.call({
			method: "renewal_module.custom_module.page.ticket.ticket.get_tasks_with_children",
			args: { issue_name },
			callback: async function (r) {
				const tasks = r.message || [];
				const normalizeStatus = (status) => (status || "").toLowerCase();
				const isCompleted = (task) => normalizeStatus(task.status) === "completed";
				const getFilteredTasks = (filter) => {
					switch (filter) {
						case "completed":
							return tasks.filter(isCompleted);
						case "pending":
							return tasks.filter(t => !isCompleted(t));
						default:
							return tasks;
					}
				};

				const updateTitleAndTabCounts = () => {
					const totalCount = tasks.length;
					const completedCount = tasks.filter(isCompleted).length;
					const pendingCount = totalCount - completedCount;

					$("#tasks-card-title").text(
						totalCount ? `Tasks (${totalCount})` : "Tasks"
					);

					// Update pipeline task count
					$("#pipeline-tasks-count").text(totalCount);
					if (self.updatePipelineAllCount) self.updatePipelineAllCount();

					$("#tasks-card-tabs .task-tab").each(function () {
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
					$("#tasks-card-tabs .task-tab").each(function () {
						const $btn = $(this);
						const isActive = $btn.data("taskFilter") === filter;
						$btn.toggleClass("active", isActive);
						$btn.css("border", isActive ? "1px solid #007bff" : "");
						$btn.css("color", isActive ? "#007bff" : "");
						$btn.toggleClass("btn-outline-secondary", !isActive);
					});
				};

				const renderTasks = (filter) => {
					const filteredTasks = getFilteredTasks(filter);
					const filteredCount = filteredTasks.length;

					if (filteredCount > MAX_VISIBLE_TASKS) {
						loadMoreBtn.style.display = "block";
					} else {
						loadMoreBtn.style.display = "none";
					}

					taskCardBody.innerHTML = "";
					const $section = $("#activity-tasks-section");
					if (!filteredTasks.length) {
						taskCardBody.innerHTML =
							`<div class="empty-state-list text-center py-4"><i class="fa-regular fa-folder-open text-muted mb-2" style="font-size: 24px;"></i><p class="text-muted mb-0" style="font-size: 13px;">No tasks found.</p></div>`;
						$section.addClass("is-empty");
						return;
					}
					$section.removeClass("is-empty");

					filteredTasks.forEach((t, index) => {
						const html = buildTaskCardHTML(t, userMap, index >= MAX_VISIBLE_TASKS);
						taskCardBody.insertAdjacentHTML("beforeend", html);
					});
					fillTaskAvatars(filteredTasks, userMap);
				};

				const allUsers = [
					...new Set(
						tasks.flatMap(t => (t.custom_users || []).map(u => u.user))
					)
				];
				const userMap = await fetchUserMap(allUsers);

				updateTitleAndTabCounts();
				updateTabStyles(activeTaskFilter);
				renderTasks(activeTaskFilter);

				$(document)
					.off("click", "#tasks-card-tabs .task-tab")
					.on("click", "#tasks-card-tabs .task-tab", function () {
						const filter = $(this).data("taskFilter") || "all";
						activeTaskFilter = filter;
						updateTabStyles(activeTaskFilter);
						renderTasks(activeTaskFilter);
					});
			}
		});

		function pad2(value) {
			return String(value).padStart(2, "0");
		}

		function parseDateTime(value) {
			if (!value) return null;
			if (value instanceof Date) {
				return Number.isNaN(value.getTime()) ? null : value;
			}
			if (frappe?.datetime?.str_to_obj) {
				const parsed = frappe.datetime.str_to_obj(value);
				if (parsed instanceof Date && !Number.isNaN(parsed.getTime())) {
					return parsed;
				}
			}
			const fallback = new Date(value);
			return Number.isNaN(fallback.getTime()) ? null : fallback;
		}

		function formatDateTimeDisplay(value) {
			const dt = parseDateTime(value);
			if (!dt) return "";

			const dd = pad2(dt.getDate());
			const mm = pad2(dt.getMonth() + 1);
			const yy = String(dt.getFullYear()).slice(-2);
			const hh = pad2(dt.getHours());
			const min = pad2(dt.getMinutes());

			return `${dd}-${mm}-${yy} ${hh}:${min}`;
		}


		function statusBadgeClass(status) {
			switch (status) {
				case "Open": return "bg-warning text-white";
				case "Working": return "bg-primary text-white";
				case "Pending Review": return "bg-success text-white";
				case "Overdue": return "bg-secondary text-white";
				case "Templated": return "bg-info text-white";
				case "Cancelled": return "bg-danger text-white";
				default: return "bg-light text-dark";
			}
		}

		function buildTaskCardHTML(t, userMap, hidden = false) {
			//const safeId = frappe.utils.escape_html(t.name.replace(/[^a-zA-Z0-9-_]/g, "_"));
			const safeId = frappe.utils.escape_html(
				t.name.replace(/[^a-zA-Z0-9-_]/g, "_")
			);
			return `
					<div id="tasks-card-${safeId}" class="task-card p-2 mb-2 rounded shadow-sm ${hidden ? "task-hidden" : ""}"
						style="background:#f8f9fa; border:1px solid #eee;">

						<div class="d-flex justify-content-between align-items-center gap-1 mb-1">
							<div style="width:70%;">
								<div class="fw-bold text-primary text-truncate mb-1" title="${frappe.utils.escape_html(t.subject || "")}">
									${frappe.utils.escape_html(t.subject || "")}
								</div>
							</div>
							<div style="width:30%; display:flex; justify-content:end;">
								<div class="avatar-holder" id="avatars-${safeId}"
									style="min-width:60px;text-align:right;"></div>
							</div>
						</div>

						<div class="d-flex justify-content-between align-items-center gap-1 mb-1">
							<span class="task-open text-truncate" data-name="${frappe.utils.escape_html(t.name)}" style="cursor:pointer;" title="${frappe.utils.escape_html(t.name)}">
								${frappe.utils.escape_html(t.name)}
							</span>
							<span class="status-badge ${statusBadgeClass(t.status)} text-truncate rounded" title="${frappe.utils.escape_html(t.status || "")}">${t.status || ""}</span>
							<span class="priority-badge bg-info text-white text-truncate rounded" title="${frappe.utils.escape_html(t.priority || "")}">${t.priority || ""}</span>
						</div>
						<div class="mb-1">
						${t.exp_end_date ? `<span class="text-danger" title="${formatDateTimeDisplay(t.exp_end_date)}">${formatDateTimeDisplay(t.exp_end_date)}</span>` : ""}
						</div>

					</div>
				`;
		}

		$(document).off("click", ".task-open").on("click", ".task-open", function () {
			frappe.set_route("Form", "Task", $(this).data("name"));
		});


		$(document)
			.off("click", "#tasks-card-load-more ,#tasks-card-title")
			.on("click", "#tasks-card-load-more ,#tasks-card-title", function () {
				const params = new URLSearchParams({ issue: issue_name });
				if (activeTaskFilter === "completed") {
					params.set("status", JSON.stringify(["=", "Completed"]));
				} else if (activeTaskFilter === "pending") {
					params.set("status", JSON.stringify(["!=", "Completed"]));
				}

				window.location.href = `/app/task?${params.toString()}`;
			});




		function fillTaskAvatars(tasks, userMap) {
			tasks.forEach(t => {
				const safeId = t.name.replace(/[^a-zA-Z0-9-_]/g, "_");
				const holder = document.getElementById(`avatars-${safeId}`);
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
					${shown.map((u, i) => `
						<div class="tasks-avatar-item"
							title="${u.full_name}"
							style="margin-left:${i === 0 ? "0" : "-8px"};">
							${buildAvatar(u)}
						</div>`)
					.join("")}
						${extra > 0 ? `
							<div class="extra-tasks-avatar"
								title="${users.slice(2).map(u => u.full_name).join(", ")}"
								>
								+${extra}
							</div>
						` : ""}
				</div>
			`;
		}

		function buildAvatar(user) {
			if (user.image) {
				return `<img src="${user.image}">`;
			}

			const initials = getInitials(user.full_name);
			return `
					<span class="tasks-avatar-initials" style="display:flex;align-items:center;justify-content:center;">
						${initials}
					</span>
				`;
		}

		function getInitials(name) {
			const p = (name || "User").trim().split(/\s+/);
			return ((p[0]?.[0] || "U") + (p[1]?.[0] || "")).toUpperCase();
		}

		async function fetchUserMap(users) {
			if (!users.length) return {};
			const res = await frappe.call({
				method: "renewal_module.custom_module.page.ticket.ticket.get_users_basic_info",
				args: {
					users: users   // array of emails
				}
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

		$(document).off("click", "#add-tasks-btn").on("click", "#add-tasks-btn", function (e) {
			e.preventDefault();
			e.stopPropagation();
			handleNewTaskClick();
		});

		function handleNewTaskClick() {
			console.log("New Task Clicked");

			frappe.call({
				method: "renewal_module.custom_module.page.ticket.ticket.get_enabled_users",
				callback: function (res) {

					const users = res.message || [];
					const d = frappe.prompt([
						{ label: "Subject", fieldname: "subject", fieldtype: "Data", reqd: true },

						{
							label: "Assign To",
							fieldname: "assign_to",
							fieldtype: "MultiSelect",
							options: users.map(u => ({
								label: u.full_name,
								value: u.email,
								description: u.name
							}))
						},

						{ label: "Description", fieldname: "description", fieldtype: "Small Text" },
						{
							label: "Expected End Date",
							fieldname: "exp_end_date",
							fieldtype: "Date"
						}

					], function (values) {
						let selected = values.assign_to || [];

						if (typeof selected === "string") {
							selected = selected
								.split(",")
								.map(v => v.trim())
								.filter(Boolean);
						}

						// Create child table rows
						const childRows = selected.map(email => ({
							user: email
						}));


						frappe.call({
							method: "frappe.client.insert",
							args: {
								doc: {
									doctype: "Task",
									subject: values.subject,
									description: values.description || "",
									exp_end_date: values.exp_end_date || "",
									issue: issue_name,
									custom_users: childRows
								}
							},
							callback: function () {
								frappe.show_alert("Task created", "green");
								self.bindTaskCardsEvents(issue_name);
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
	}


	bindcallcardsEvents(issueName) {
		const self = this;
		const issue_name = issueName;

		const callsCardBody = document.querySelector("#calls-card .card-body");
		const loadMoreBtn = document.querySelector("#calls-card-load-more");
		const MAX_VISIBLE_CALLS = 5;
		let activeCallFilter = "all";

		// ================= FETCH CALLS =================
		frappe.call({
			method: "renewal_module.custom_module.page.ticket.ticket.get_permitted_call_list",
			args: { issue_name },
			callback: async function (r) {
				const calls = r.message || [];
				const normalizeStatus = (status) => (status || "").toLowerCase();
				const getFilteredCalls = (filter) => {
					if (filter === "all") return calls;
					return calls.filter(c => normalizeStatus(c.status) === filter);
				};

				const updateCallTabCounts = () => {
					const totalCount = calls.length;
					const heldCount = calls.filter(c => normalizeStatus(c.status) === "held").length;
					const scheduledCount = calls.filter(c => normalizeStatus(c.status) === "scheduled").length;
					const cancelledCount = calls.filter(c => normalizeStatus(c.status) === "cancelled").length;

					$("#calls-card-tabs .call-tab").each(function () {
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

				const updateTitle = () => {
					const count = calls.length;
					$("#calls-card-title").text(
						count ? `Calls (${count})` : "Calls"
					);
					// Update pipeline call count
					$("#pipeline-calls-count").text(count);
					if (self.updatePipelineAllCount) self.updatePipelineAllCount();
				};

				const updateTabStyles = (filter) => {
					$("#calls-card-tabs .call-tab").each(function () {
						const $btn = $(this);
						const isActive = $btn.data("callFilter") === filter;
						$btn.toggleClass("active", isActive);
						$btn.css("border", isActive ? "1px solid #007bff" : "");
						$btn.css("color", isActive ? "#007bff" : "");
						$btn.toggleClass("btn-outline-secondary", !isActive);
					});
				};

				const renderCalls = async (filter) => {
					const filteredCalls = getFilteredCalls(filter);
					const filteredCount = filteredCalls.length;

					loadMoreBtn.style.display = filteredCount > MAX_VISIBLE_CALLS ? "block" : "none";

					callsCardBody.innerHTML = "";
					const $section = $("#activity-calls-section");
					if (!filteredCalls.length) {
						callsCardBody.innerHTML =
							`<div class="empty-state-list text-center py-4"><i class="fa-solid fa-phone-slash text-muted mb-2" style="font-size: 24px;"></i><p class="text-muted mb-0" style="font-size: 13px;">No calls found.</p></div>`;
						$section.addClass("is-empty");
						return;
					}
					$section.removeClass("is-empty");

					filteredCalls.forEach((c, index) => {
						const html = buildCallCard(c, index >= MAX_VISIBLE_CALLS);
						callsCardBody.insertAdjacentHTML("beforeend", html);
					});

					await loadCallAvatars(filteredCalls);
				};
				updateCallTabCounts();
				updateTitle();
				updateTabStyles(activeCallFilter);
				await renderCalls(activeCallFilter);

				$(document)
					.off("click", "#calls-card-tabs .call-tab")
					.on("click", "#calls-card-tabs .call-tab", async function () {
						const filter = $(this).data("callFilter") || "all";
						activeCallFilter = filter;
						updateTabStyles(activeCallFilter);
						await renderCalls(activeCallFilter);
					});
			}
		});

		// ================= HELPERS =================
		const esc = frappe.utils.escape_html;

		function safeId(v) {
			return String(v).replace(/[^a-zA-Z0-9-_]/g, "_");
		}

		function formatDate(dt) {
			if (!dt) return "";
			const [y, m, d] = String(dt).split(" ")[0].split("-");
			return `${d}-${m}-${y}`;
		}

		function pad2(value) {
			return String(value).padStart(2, "0");
		}

		function parseDateTime(value) {
			if (!value) return null;
			if (value instanceof Date) {
				return Number.isNaN(value.getTime()) ? null : value;
			}
			if (frappe?.datetime?.str_to_obj) {
				const parsed = frappe.datetime.str_to_obj(value);
				if (parsed instanceof Date && !Number.isNaN(parsed.getTime())) {
					return parsed;
				}
			}
			const fallback = new Date(value);
			return Number.isNaN(fallback.getTime()) ? null : fallback;
		}

		function formatDateTimeDisplay(value) {
			const dt = parseDateTime(value);
			if (!dt) return "";
			const dd = pad2(dt.getDate());
			const mm = pad2(dt.getMonth() + 1);
			const yy = String(dt.getFullYear()).slice(-2);
			const hh = pad2(dt.getHours());
			const min = pad2(dt.getMinutes());
			return `${dd}-${mm}-${yy} ${hh}:${min}`;
		}

		function formatTime(t) {
			if (!t) return "";
			return String(t).split(".")[0].split(" ")[1] || t;
		}

		function statusBadgeClass(status) {
			switch (status) {
				case "Held":
					return "bg-warning text-white";
				case "Scheduled":
					return "bg-primary text-white";
				case "Cancelled":
					return "bg-danger text-white";
				default:
					return "bg-secondary text-white";
			}
		}

		function appointmentStatusBadgeClass(status) {
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
		}

		// ================= CARD HTML =================
		function buildCallCard(c, hidden = false) {
			const id = safeId(c.name);

			return `
			<div class="call-card p-2 mb-2 rounded shadow-sm ${hidden ? "call-hidden" : ""}"
				style="background:#f8f9fa;border:1px solid #e6e6e6;">

				<div class="d-flex justify-content-between align-items-center mb-1 gap-1">
					<div class="fw-bold text-primary text-truncate" title="${esc(c.subject || "")}">
						${esc(c.subject || "")}
					</div>
					<div id="avatar-${id}" title="${esc(c.owner || "")}">
						${simpleInitialAvatar(c.owner)}
					</div>
				</div>

				<div class="d-flex justify-content-between align-items-center mb-1 gap-1">
					<span class="text-dark text-truncate" title="${esc(c.name1 || "")}">${esc(c.name1 || "")}</span>
					<span class=" text-truncate status-badge ${statusBadgeClass(c.status)} rounded" title="${esc(c.status || "")}">${esc(c.status || "")}</span>
					<span class="call-open badge bg-light p-1"
						data-name="${esc(c.name)}" title="${esc(c.name)}"
						style="cursor:pointer;border:1px solid #ddd;">
						${esc(c.name)}
					</span>
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
		}

		function buildAppointmentCard(a, hidden = false) {
			const id = safeId(a.name);
			const startDate = a.custom_start_date ? formatDate(a.custom_start_date) : "";
			const startTime = a.custom_start_time || "";
			const endDate = a.custom_end_date ? formatDate(a.custom_end_date) : "";
			const endTime = a.custom_end_time || "";
			const participantInfo = a.participant_info || [];
			const avatarHtml = participantInfo.length
				? buildAppointmentAvatarGroup(participantInfo)
				: simpleInitialAvatar(a.owner);
			return `
				<div class="call-card p-2 mb-2 rounded shadow-sm ${hidden ? "call-hidden" : ""}"
					style="background:#f8f9fa;border:1px solid #e6e6e6;">

					<div class="d-flex justify-content-between align-items-center mb-1 gap-1">
						<div class="fw-bold text-primary text-truncate" title="${esc(a.customer_name || "")}">
							${esc(a.customer_name || "")}
						</div>
						<div>
							${avatarHtml}
						</div>
					</div>

					<div class="d-flex justify-content-between align-items-center mb-1 gap-1">
						<span class="text-dark text-truncate" title="${esc(a.customer_phone_number || "")}">
							${esc(a.customer_phone_number || "")}
						</span>
						<span class="text-truncate status-badge ${appointmentStatusBadgeClass(a.status)} rounded" title="${esc(a.status || "")}">
							${esc(a.status || "")}
						</span>
						<span class="appointment-open badge bg-light p-1"
							data-name="${esc(a.name)}" title="${esc(a.name)}"
							style="cursor:pointer;border:1px solid #ddd;">
							${esc(a.name)}
						</span>
					</div>
					<div class="row small">
						<div class="col-12">
							${a.customer_email ? `<div title="${esc(a.customer_email)}"><i class="fa fa-envelope text-primary mr-1"></i>${esc(a.customer_email)}</div>` : ""}
						</div>
					</div>

					<div class="d-flex justify-content-between align-items-center mb-1 gap-1">
						<div class="">
							${startDate ? `<div><i class="fa fa-calendar-days text-warning mr-1"></i>${esc(startDate)}</div>` : ""}
							${startTime ? `<div><i class="fa fa-clock text-primary mr-1"></i>${esc(startTime)}</div>` : ""}
						</div>
						<div class="">
							${endDate ? `<div><i class="fa fa-calendar-days text-warning mr-1"></i>${esc(endDate)}</div>` : ""}
							${endTime ? `<div><i class="fa fa-clock text-primary mr-1"></i>${esc(endTime)}</div>` : ""}
						</div>
					</div>
				</div>
			`;
		}

		function buildAppointmentAvatarGroup(users) {
			const visible = users.slice(0, 3);
			const extra = users.length - visible.length;
			return `
					<div style="display:flex;align-items:center;justify-content:end;">
						${visible.map((u, i) => `
							<div class="avatar-item"
								title="${esc(u.full_name || "")}" 
								style="margin-left:${i === 0 ? 0 : "-6px"};">
								${buildAppointmentAvatar(u)}
							</div>
						`).join("")}
						${extra > 0 ? `
							<div class="extra-avatar"
								title="${esc(users.slice(3).map(u => u.full_name).join(", "))}">
								+${extra}
							</div>
						` : ""}
					</div>
				`;
		}

		function buildAppointmentAvatar(user) {
			if (user.image) {
				return `<img src="${user.image}">`;
			}
			return `
					<span class="avatar-initials">
						${getAppointmentInitials(user.full_name)}
					</span>
				`;
		}

		function getAppointmentInitials(name) {
			const parts = (name || "User").trim().split(/\s+/);
			return ((parts[0]?.[0] || "U") + (parts[1]?.[0] || "")).toUpperCase();
		}

		function simpleInitialAvatar(owner) {
			const init = (owner || "U").substring(0, 2).toUpperCase();
			return `
			<span style="width:22px;height:22px;border-radius:50%;
				background:#4A81D4;color:#fff;
				display:flex;align-items:center;justify-content:center;font-size:11px;">
				${init}
			</span>`;
		}

		// ================= AVATARS =================
		async function loadCallAvatars(list) {
			if (!frappe.model.can_read("User")) return;

			const owners = [...new Set(list.map(x => x.owner))];

			const res = await frappe.call({
				method: "renewal_module.custom_module.page.ticket.ticket.get_users_basic_info",
				args: {
					users: owners   // array of emails
				}
			});

			const map = {};
			(res.message || []).forEach(u => map[u.name] = u);

			list.forEach(c => {
				const u = map[c.owner];
				const holder = document.getElementById(`avatar-${safeId(c.name)}`);
				if (!holder) return;

				if (u?.user_image) {
					holder.innerHTML = `<img src="${u.user_image}"
					style="width:22px;height:22px;border-radius:50%;">`;
				}
			});
		}

		// ================= EVENTS =================
		$(document)
			.off("click", ".call-open")
			.on("click", ".call-open", function () {
				frappe.set_route("Form", "Call List", $(this).data("name"));
			});

		$(document)
			.off("click", ".appointment-open")
			.on("click", ".appointment-open", function () {
				frappe.set_route("Form", "Appointment", $(this).data("name"));
			});

		$(document)
			.off("click", "#calls-card-load-more, #calls-card-title")
			.on("click", "#calls-card-load-more, #calls-card-title", function () {
				const params = new URLSearchParams({
					issue_id: issue_name
				});
				if (activeCallFilter === "held") {
					params.set("status", "Held");
				} else if (activeCallFilter === "scheduled") {
					params.set("status", "Scheduled");
				} else if (activeCallFilter === "cancelled") {
					params.set("status", "Cancelled");
				}
				window.location.href = `/app/call-list?${params.toString()}`;
			});

		$(document).off("click", "#add-calls-btn").on("click", "#add-calls-btn", function (e) {
			e.preventDefault();
			e.stopPropagation();
			openNewCallDialog(issue_name);
		});

		$(document).off("click", "#add-appointments-btn").on("click", "#add-appointments-btn", function (e) {
			e.preventDefault();
			e.stopPropagation();
			openNewAppointmentDialog(issue_name);
			//frappe.new_doc("Appointment", { custom_issue_id: issue_name });
		});

		async function getCustomerSalesPerson(customer) {
			if (!customer) return "";

			const res = await frappe.call({
				method: "renewal_module.custom_module.page.ticket.ticket.get_customer_sales_person",
				args: { customer },
				silent: true
			});

			return res.message || "";
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
				{ label: "Status", fieldname: "status", fieldtype: "Select", options: ["Held", "Scheduled", "Cancelled"], default: "Held" },

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
						status: v.status,
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
					self.bindcallcardsEvents(issue_name);
				},
				"New Call List");

			setTimeout(() => {
				const callDefaults = getActivityDateTimeDefaults("Calls");
				d?.set_value?.("start_date", callDefaults.start_date);
				d?.set_value?.("start_timing", callDefaults.start_time);
				d?.set_value?.("end_date", callDefaults.end_date);
				d?.set_value?.("end_timing", callDefaults.end_time);
			}, 50);

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

		async function openNewAppointmentDialog(issue_name) {
			const issue = await frappe.call({
				method: "frappe.client.get_value",
				args: {
					doctype: "Issue",
					filters: { name: issue_name },
					fieldname: ["customer"]
				},
				silent: true
			});
			let users = [];
			try {
				const res = await frappe.call({
					method: "renewal_module.custom_module.page.ticket.ticket.get_enabled_users",
					silent: true
				});
				users = res.message || [];
			} catch (err) {
				console.error("Failed to load users for participants:", err);
			}
			const default_customer = issue.message?.customer || "";
			const default_scheduled_time = frappe.datetime?.now_datetime
				? frappe.datetime.now_datetime()
				: "";
			const d = frappe.prompt([
				{ label: "Appointment With", fieldname: "appointment_with", fieldtype: "Select", options: ["Customer", "Lead"], "default": "Customer" },
				{ fieldtype: "Column Break" },
				{ label: "Party", fieldname: "party", fieldtype: "Dynamic Link", options: "appointment_with", "default": default_customer },
				{ fieldtype: "Section Break" },
				{ label: "Name", fieldname: "customer_name", fieldtype: "Data", reqd: true },
				{ label: "Email", fieldname: "customer_email", fieldtype: "Data", reqd: true },
				{ fieldtype: "Column Break" },
				{ label: "Phone Number", fieldname: "customer_phone_number", fieldtype: "Data" },
				{ fieldtype: "Section Break" },
				{ label: "Start Date", fieldname: "custom_start_date", fieldtype: "Date", reqd: true },
				{ fieldtype: "Column Break" },
				{ label: "Start Time", fieldname: "custom_start_time", fieldtype: "Time", reqd: true },
				{ fieldtype: "Section Break" },
				{ label: "End Date", fieldname: "custom_end_date", fieldtype: "Date", reqd: true },
				{ fieldtype: "Column Break" },
				{ label: "End Time", fieldname: "custom_end_time", fieldtype: "Time", reqd: true },
				{ fieldtype: "Section Break" },
				{
					label: "Participants", fieldname: "custom_participants", fieldtype: "MultiSelect", options: users.map((u) => ({ label: u.full_name, value: u.email, description: u.name })), reqd: true
				},
				{ fieldtype: "Section Break" },
				{ label: "Scheduled Time", fieldname: "scheduled_time", fieldtype: "Datetime", reqd: true, "default": default_scheduled_time, hidden: true },
				{ label: "Details", fieldname: "customer_details", fieldtype: "Long Text" }
			], function (values) {
				const participants = (() => {
					if (!values.custom_participants) return [];
					const raw = Array.isArray(values.custom_participants)
						? values.custom_participants
						: String(values.custom_participants)
							.split(",")
							.map((val) => val.trim())
							.filter(Boolean);
					return raw.map((user) => ({ user }));
				})();

				const doc = {
					doctype: "Appointment",
					appointment_with: values.appointment_with,
					party: values.party,
					customer_name: values.customer_name,
					customer_phone_number: values.customer_phone_number,
					customer_email: values.customer_email,
					scheduled_time: values.scheduled_time,
					custom_participants: participants,
					customer_details: values.customer_details,
					custom_start_date: values.custom_start_date,
					custom_start_time: values.custom_start_time,
					custom_end_date: values.custom_end_date,
					custom_end_time: values.custom_end_time,
					custom_issue_id: issue_name
				};

				frappe.call({
					method: "frappe.client.insert",
					args: { doc },
					callback: function () {
						frappe.show_alert("Appointment created", "green");
						self.bindcallcardsEvents(issue_name);
						self.bindAppointmentCardsEvents(issue_name);
						self.load_issue_details(issue_name);
					}
				});
			});

			setTimeout(() => {
				const appointment_with_field = d.fields_dict.appointment_with?.$input;
				const party_field = d.fields_dict.party;
				const scheduled_time_field = d.fields_dict.scheduled_time;
				const appointmentDefaults = getActivityDateTimeDefaults("Appointments");

				d?.set_value?.("custom_start_date", appointmentDefaults.start_date);
				d?.set_value?.("custom_start_time", appointmentDefaults.start_time);
				d?.set_value?.("custom_end_date", appointmentDefaults.end_date);
				d?.set_value?.("custom_end_time", appointmentDefaults.end_time);

				if (default_customer && party_field && party_field.get_value && !party_field.get_value()) {
					party_field.set_value(default_customer);
				}
				if (scheduled_time_field && scheduled_time_field.get_value && !scheduled_time_field.get_value()) {
					scheduled_time_field.set_value(appointmentDefaults.scheduled_time || default_scheduled_time);
				}

				if (appointment_with_field) {
					appointment_with_field.on("change", function () {
						const val = appointment_with_field.val();
						if (val === "Customer") {
							party_field?.set_value(default_customer);
						} else {
							party_field?.set_value("");
						}
					});
				}
			}, 200);

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
	}

	bindAppointmentCardsEvents(issueName) {
		const issue_name = issueName;
		const appointmentsCardBody = document.querySelector("#appointments-card .card-body");
		const loadMoreBtn = document.querySelector("#appointments-card-load-more");
		if (!appointmentsCardBody || !loadMoreBtn) return;

		const MAX_VISIBLE_APPOINTMENTS = 5;
		let activeAppointmentFilter = "all";

		frappe.call({
			method: "renewal_module.custom_module.page.ticket.ticket.get_permitted_appointments",
			args: { issue_name },
			callback: async function (r) {
				let appointments = r.message || [];

				const participantIds = [...new Set(
					appointments.flatMap(a => a.custom_participants || []).filter(Boolean)
				)];
				let participantMap = {};

				if (participantIds.length && frappe.model.can_read("User")) {
					try {
						const usersRes = await frappe.call({
							method: "renewal_module.custom_module.page.ticket.ticket.get_users_basic_info",
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

				appointments = appointments.map((a) => ({
					...a,
					participant_info: (a.custom_participants || [])
						.map((id) => participantMap[id])
						.filter(Boolean)
				}));

				const normalizeStatus = (status) => (status || "").toLowerCase();

				const getFilteredAppointments = (filter) => {
					const status = normalizeStatus(filter);
					if (status === "all") return appointments;
					return appointments.filter(a => normalizeStatus(a.status) === status);
				};

				const updateTitle = () => {
					const count = appointments.length;
					$("#appointments-card-title").text(count ? `Appointments (${count})` : "Appointments");

					// Update pipeline appointment count
					$("#pipeline-appointments-count").text(count);
					if (self.updatePipelineAllCount) self.updatePipelineAllCount();
				};

				const updateAppointmentTabCounts = () => {
					const totalCount = appointments.length;
					const openCount = appointments.filter(a => normalizeStatus(a.status) === "open").length;
					const unverifiedCount = appointments.filter(a => normalizeStatus(a.status) === "unverified").length;
					const closedCount = appointments.filter(a => normalizeStatus(a.status) === "closed").length;
					$("#appointments-card-tabs .appointment-tab").each(function () {
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

				const updateAppointmentTabStyles = (filter) => {
					$("#appointments-card-tabs .appointment-tab").each(function () {
						const $btn = $(this);
						const isActive = $btn.data("appointmentFilter") === filter;
						$btn.toggleClass("active", isActive);
						$btn.css("border", isActive ? "1px solid #007bff" : "");
						$btn.css("color", isActive ? "#007bff" : "");
						$btn.toggleClass("btn-outline-secondary", !isActive);
					});
				};

				const esc = frappe.utils.escape_html;
				const safeId = (v) => String(v).replace(/[^a-zA-Z0-9-_]/g, "_");
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

				const getAppointmentInitials = (name) => {
					const parts = (name || "User").trim().split(/\s+/);
					return ((parts[0]?.[0] || "U") + (parts[1]?.[0] || "")).toUpperCase();
				};

				const buildAppointmentAvatar = (user) => {
					if (user.image) return `<img src="${user.image}">`;
					return `<span class="avatar-initials">${getAppointmentInitials(user.full_name)}</span>`;
				};

				const buildAppointmentAvatarGroup = (users) => {
					const visible = users.slice(0, 3);
					const extra = users.length - visible.length;
					return `
						<div style="display:flex;align-items:center;justify-content:end;">
							${visible.map((u, i) => `
								<div class="avatar-item" title="${esc(u.full_name || "")}" style="margin-left:${i === 0 ? 0 : "-6px"};">
									${buildAppointmentAvatar(u)}
								</div>
							`).join("")}
							${extra > 0 ? `<div class="extra-avatar" title="${esc(users.slice(3).map(u => u.full_name).join(", "))}">+${extra}</div>` : ""}
						</div>
					`;
				};

				const simpleInitialAvatar = (owner) => {
					const init = (owner || "U").substring(0, 2).toUpperCase();
					return `<span style="width:22px;height:22px;border-radius:50%;background:#4A81D4;color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;">${init}</span>`;
				};

				const buildAppointmentCard = (a, hidden = false) => {
					const startDate = a.custom_start_date ? formatDate(a.custom_start_date) : "";
					const startTime = a.custom_start_time || "";
					const endDate = a.custom_end_date ? formatDate(a.custom_end_date) : "";
					const endTime = a.custom_end_time || "";
					const participantInfo = a.participant_info || [];
					const avatarHtml = participantInfo.length
						? buildAppointmentAvatarGroup(participantInfo)
						: simpleInitialAvatar(a.owner);

					return `
						<div class="call-card p-2 mb-2 rounded shadow-sm ${hidden ? "call-hidden" : ""}" style="background:#f8f9fa;border:1px solid #e6e6e6;">
							<div class="d-flex justify-content-between align-items-center mb-1 gap-1">
								<div class="fw-bold text-primary text-truncate" title="${esc(a.customer_name || "")}">${esc(a.customer_name || "")}</div>
								<div>${avatarHtml}</div>
							</div>
							<div class="d-flex justify-content-between align-items-center mb-1 gap-1">
								<span class="text-dark text-truncate" title="${esc(a.customer_phone_number || "")}">${esc(a.customer_phone_number || "")}</span>
								<span class="text-truncate status-badge ${appointmentStatusBadgeClass(a.status)} rounded" title="${esc(a.status || "")}">${esc(a.status || "")}</span>
								<span class="appointment-open badge bg-light p-1" data-name="${esc(a.name)}" title="${esc(a.name)}" style="cursor:pointer;border:1px solid #ddd;">${esc(a.name)}</span>
							</div>
							<div class="row small">
								<div class="col-12">
									${a.customer_email ? `<div title="${esc(a.customer_email)}"><i class="fa fa-envelope text-primary mr-1"></i>${esc(a.customer_email)}</div>` : ""}
								</div>
							</div>
							<div class="d-flex justify-content-between align-items-center mb-1 gap-1">
								<div>
									${startDate ? `<div><i class="fa fa-calendar-days text-warning mr-1"></i>${esc(startDate)}</div>` : ""}
									${startTime ? `<div><i class="fa fa-clock text-primary mr-1"></i>${esc(startTime)}</div>` : ""}
								</div>
								<div>
									${endDate ? `<div><i class="fa fa-calendar-days text-warning mr-1"></i>${esc(endDate)}</div>` : ""}
									${endTime ? `<div><i class="fa fa-clock text-primary mr-1"></i>${esc(endTime)}</div>` : ""}
								</div>
							</div>
						</div>
					`;
				};

				const renderAppointments = (filter) => {
					const filteredAppointments = getFilteredAppointments(filter);
					loadMoreBtn.style.display = filteredAppointments.length > MAX_VISIBLE_APPOINTMENTS ? "block" : "none";
					appointmentsCardBody.innerHTML = "";
					const $section = $("#activity-appointments-section");
					if (!filteredAppointments.length) {
						appointmentsCardBody.innerHTML = `<div class="empty-state-list text-center py-4"><i class="fa-regular fa-calendar-xmark text-muted mb-2" style="font-size: 24px;"></i><p class="text-muted mb-0" style="font-size: 13px;">No appointments found.</p></div>`;
						$section.addClass("is-empty");
						return;
					}
					$section.removeClass("is-empty");
					filteredAppointments.forEach((a, index) => {
						appointmentsCardBody.insertAdjacentHTML("beforeend", buildAppointmentCard(a, index >= MAX_VISIBLE_APPOINTMENTS));
					});
				};

				updateTitle();
				updateAppointmentTabCounts();
				updateAppointmentTabStyles(activeAppointmentFilter);
				renderAppointments(activeAppointmentFilter);

				$(document)
					.off("click", "#appointments-card-tabs .appointment-tab")
					.on("click", "#appointments-card-tabs .appointment-tab", function () {
						const filter = $(this).data("appointmentFilter") || "all";
						activeAppointmentFilter = filter;
						updateAppointmentTabStyles(activeAppointmentFilter);
						renderAppointments(activeAppointmentFilter);
					});

				$(document)
					.off("click", "#appointments-card-load-more, #appointments-card-title")
					.on("click", "#appointments-card-load-more, #appointments-card-title", function () {
						const params = new URLSearchParams({
							custom_issue_id: issue_name
						});
						if (activeAppointmentFilter === "open") {
							params.set("status", "Open");
						} else if (activeAppointmentFilter === "unverified") {
							params.set("status", "Unverified");
						} else if (activeAppointmentFilter === "closed") {
							params.set("status", "Closed");
						}
						window.location.href = `/app/appointment?${params.toString()}`;
					});
			}
		});
	}

	bindIssuesActivitiesEvents(issueName) {
		const self = this;
		let activeType = "Notes";
		let enabledUsers = [];
		let defaultCustomer = "";
		let panelTaskAssignControl = null;
		let panelAppointmentParticipantsControl = null;

		const callApi = (options) => new Promise((resolve, reject) => {
			frappe.call({
				...options,
				callback: (r) => resolve(r),
				error: (err) => reject(err),
			});
		});

		const esc = (val) => frappe.utils.escape_html(String(val || ""));

		// Move rendered content from hidden cards to activity sections
		const moveContent = (sourceSelector, targetSelector) => {
			const $source = $(sourceSelector);
			const $target = $(targetSelector);
			if ($source.length && $target.length) {
				$target.empty().append($source);
			}
		};

		// Move cards into their respective display containers (right panel)
		moveContent('#tasks-card', '#activity-tasks-container');
		moveContent('#calls-card', '#activity-calls-container');
		moveContent('#appointments-card', '#activity-appointments-container');
		$("#activity-tasks-container #add-tasks-btn, #activity-calls-container #add-calls-btn, #activity-appointments-container #add-appointments-btn").addClass("d-none");

		const ensurePanelContext = async () => {
			if (!defaultCustomer) {
				try {
					const issueRes = await callApi({
						method: "frappe.client.get_value",
						args: {
							doctype: "Issue",
							filters: { name: issueName },
							fieldname: ["customer"],
						},
						silent: true,
					});
					defaultCustomer = issueRes?.message?.customer || "";
				} catch (e) {
					defaultCustomer = "";
				}
			}

			if (!enabledUsers.length) {
				try {
					const usersRes = await callApi({
						method: "renewal_module.custom_module.page.ticket.ticket.get_enabled_users",
						silent: true,
					});
					enabledUsers = Array.isArray(usersRes?.message) ? usersRes.message : [];
				} catch (e) {
					enabledUsers = [];
				}
			}
		};

		const usersOptionsHtml = () => enabledUsers.map((u) => {
			const label = esc(u.full_name || u.name || u.email || "User");
			const value = esc(u.email || u.name || "");
			return `<option value="${value}">${label}</option>`;
		}).join("");

		const getActivityDateTimeDefaults = (activityType) => {
			const now = new Date();
			const durationMinutes = activityType === "Appointments" ? 60 : activityType === "Calls" ? 10 : 0;
			const end = new Date(now.getTime() + (durationMinutes * 60 * 1000));

			const pad2 = (value) => String(value).padStart(2, "0");
			const toDateInput = (dateObj) => `${dateObj.getFullYear()}-${pad2(dateObj.getMonth() + 1)}-${pad2(dateObj.getDate())}`;
			const toTimeInput = (dateObj) => `${pad2(dateObj.getHours())}:${pad2(dateObj.getMinutes())}`;

			return {
				start_date: toDateInput(now),
				start_time: toTimeInput(now),
				end_date: toDateInput(end),
				end_time: toTimeInput(end),
				scheduled_time: frappe.datetime?.now_datetime ? frappe.datetime.now_datetime() : "",
			};
		};

		const getPanelUserOptions = () => (enabledUsers || []).map((u) => {
			const value = String(u?.email || u?.name || "").trim();
			const label = String(u?.full_name || u?.name || u?.email || value).trim();
			if (!value) return null;
			return { label, value, description: u?.email || value };
		}).filter(Boolean);

		const getMultiControlValues = (control) => {
			if (!control || typeof control.get_value !== "function") return [];

			const raw = control.get_value();
			if (Array.isArray(raw)) {
				return raw.map((v) => String(v || "").trim()).filter(Boolean);
			}

			return String(raw || "")
				.split(",")
				.map((v) => v.trim())
				.filter(Boolean);
		};

		const renderUserMultiControl = (hostSelector, fieldname) => {
			const $host = $(hostSelector);
			if (!$host.length || !frappe?.ui?.form?.make_control) {
				return null;
			}

			$host.empty();
			const control = frappe.ui.form.make_control({
				parent: $host,
				df: {
					fieldtype: "MultiSelect",
					fieldname,
					label: "",
					options: getPanelUserOptions(),
				},
				render_input: true,
			});

			if (control?.refresh) {
				control.refresh();
			}

			return control;
		};

		const hidePanelForm = () => {
			$("#ticket-panel-form-section").addClass("d-none");
			$("#ticket-panel-cards-section").removeClass("d-none");
			$("#ticket-btn-panel-add").show();
			$(".ticket-detail-panel .panel__header").show();
			panelTaskAssignControl = null;
			panelAppointmentParticipantsControl = null;
		};

		const showPanelForm = async (type) => {
			await ensurePanelContext();
			$("#ticket-panel-cards-section").addClass("d-none");
			$("#ticket-panel-form-section").removeClass("d-none");
			$("#ticket-btn-panel-add").hide();
			$(".ticket-detail-panel .panel__header").hide();

			const defaultNow = frappe.datetime?.now_datetime ? frappe.datetime.now_datetime() : "";
			const usersOptions = usersOptionsHtml();

			if (type === "Tasks") {
				$("#ticket-panel-form-title").text("New Task");
				$("#ticket-panel-save-btn").text("Save Task");
				$("#ticket-panel-form-body").html(`
					<div class="ticket-form-grid">
						<div class="mb-2"><label class="form-label">Subject *</label><input type="text" id="ticket-task-subject" class="form-control" /></div>
						<div class="mb-2"><label class="form-label">Assign To</label><div id="ticket-task-assign-control" class="ticket-multi-control"></div><select id="ticket-task-assign-to" class="form-control d-none" multiple>${usersOptions}</select></div>
						<div class="mb-2"><label class="form-label">Expected End Date</label><input type="date" id="ticket-task-end-date" class="form-control" /></div>
						<div class="mb-2"><label class="form-label">Description</label><textarea id="ticket-task-description" class="form-control" rows="4"></textarea></div>
					</div>
				`);

				panelTaskAssignControl = renderUserMultiControl("#ticket-task-assign-control", "ticket_task_assign_to");
				if (!panelTaskAssignControl) {
					$("#ticket-task-assign-to").removeClass("d-none");
				}
				return;
			}

			if (type === "Calls") {
				$("#ticket-panel-form-title").text("New Call");
				$("#ticket-panel-save-btn").text("Save Call");
				$("#ticket-panel-form-body").html(`
					<div class="ticket-form-grid">
						<div class="mb-2"><label class="form-label">Subject *</label><input type="text" id="ticket-call-subject" class="form-control" /></div>
						<div class="mb-2"><label class="form-label">Related To</label><select id="ticket-call-related-to" class="form-control"><option value="Customer" selected>Customer</option><option value="Contact">Contact</option></select></div>
						<div class="mb-2"><label class="form-label">Full Name *</label><input type="text" id="ticket-call-name1" class="form-control" value="${esc(defaultCustomer)}" /></div>
						<div class="row g-2">
							<div class="col-6 mb-2"><label class="form-label">Start Date</label><input type="date" id="ticket-call-start-date" class="form-control" /></div>
							<div class="col-6 mb-2"><label class="form-label">Start Time</label><input type="time" id="ticket-call-start-time" class="form-control" /></div>
						</div>
						<div class="row g-2">
							<div class="col-6 mb-2"><label class="form-label">End Date</label><input type="date" id="ticket-call-end-date" class="form-control" /></div>
							<div class="col-6 mb-2"><label class="form-label">End Time</label><input type="time" id="ticket-call-end-time" class="form-control" /></div>
						</div>
						<div class="mb-2"><label class="form-label">Status</label><select id="ticket-call-status" class="form-control"><option value="Held">Held</option><option value="Scheduled">Scheduled</option><option value="Cancelled">Cancelled</option></select></div>
						<div class="mb-2"><label class="form-label">Description</label><textarea id="ticket-call-description" class="form-control" rows="4"></textarea></div>
					</div>
				`);

				const callDefaults = getActivityDateTimeDefaults("Calls");
				$("#ticket-call-start-date").val(callDefaults.start_date);
				$("#ticket-call-start-time").val(callDefaults.start_time);
				$("#ticket-call-end-date").val(callDefaults.end_date);
				$("#ticket-call-end-time").val(callDefaults.end_time);

				$("#ticket-call-related-to")
					.off("change.ticketPanelCallRelated")
					.on("change.ticketPanelCallRelated", function () {
						const relatedTo = ($(this).val() || "").toString();
						if (relatedTo === "Customer") {
							$("#ticket-call-name1").val(defaultCustomer || "");
						} else {
							$("#ticket-call-name1").val("");
						}
					});
				return;
			}

			if (type === "Appointments") {
				$("#ticket-panel-form-title").text("New Appointment");
				$("#ticket-panel-save-btn").text("Schedule Appointment");
				$("#ticket-panel-form-body").html(`
					<div class="ticket-form-grid">
						<div class="mb-2"><label class="form-label">Appointment With</label><select id="ticket-appointment-with" class="form-control"><option value="Customer" selected>Customer</option><option value="Lead">Lead</option></select></div>
						<div class="mb-2"><label class="form-label">Party</label><input type="text" id="ticket-appointment-party" class="form-control" value="${esc(defaultCustomer)}" /></div>
						<div class="mb-2"><label class="form-label">Name *</label><input type="text" id="ticket-appointment-name" class="form-control" /></div>
						<div class="mb-2"><label class="form-label">Email *</label><input type="email" id="ticket-appointment-email" class="form-control" /></div>
						<div class="mb-2"><label class="form-label">Phone Number</label><input type="text" id="ticket-appointment-phone" class="form-control" /></div>
						<div class="mb-2"><label class="form-label">Participants *</label><div id="ticket-appointment-participants-control" class="ticket-multi-control"></div><select id="ticket-appointment-participants" class="form-control d-none" multiple>${usersOptions}</select></div>
						<div class="row g-2">
							<div class="col-6 mb-2"><label class="form-label">Start Date *</label><input type="date" id="ticket-appointment-start-date" class="form-control" /></div>
							<div class="col-6 mb-2"><label class="form-label">Start Time *</label><input type="time" id="ticket-appointment-start-time" class="form-control" /></div>
						</div>
						<div class="row g-2">
							<div class="col-6 mb-2"><label class="form-label">End Date *</label><input type="date" id="ticket-appointment-end-date" class="form-control" /></div>
							<div class="col-6 mb-2"><label class="form-label">End Time *</label><input type="time" id="ticket-appointment-end-time" class="form-control" /></div>
						</div>
						<input type="hidden" id="ticket-appointment-scheduled-time" value="${esc(defaultNow)}" />
						<div class="mb-2"><label class="form-label">Details</label><textarea id="ticket-appointment-details" class="form-control" rows="3"></textarea></div>
					</div>
				`);

				panelAppointmentParticipantsControl = renderUserMultiControl("#ticket-appointment-participants-control", "ticket_appointment_participants");
				if (!panelAppointmentParticipantsControl) {
					$("#ticket-appointment-participants").removeClass("d-none");
				}

				const appointmentDefaults = getActivityDateTimeDefaults("Appointments");
				$("#ticket-appointment-start-date").val(appointmentDefaults.start_date);
				$("#ticket-appointment-start-time").val(appointmentDefaults.start_time);
				$("#ticket-appointment-end-date").val(appointmentDefaults.end_date);
				$("#ticket-appointment-end-time").val(appointmentDefaults.end_time);
				$("#ticket-appointment-scheduled-time").val(appointmentDefaults.scheduled_time);

				$("#ticket-appointment-with")
					.off("change.ticketPanelAppointmentWith")
					.on("change.ticketPanelAppointmentWith", function () {
						const appointmentWith = ($(this).val() || "").toString();
						if (appointmentWith === "Customer") {
							$("#ticket-appointment-party").val(defaultCustomer || "");
						} else {
							$("#ticket-appointment-party").val("");
						}
					});
			}
		};

		// Helper to update the "Add" button label based on active type
		const updateAddBtnLabel = (type) => {
			const labels = { Notes: "New Note", Tasks: "New Task", Calls: "Create", Appointments: "Create" };
			$('#ticket-btn-panel-add').html(`<i class="fa fa-plus"></i> ${labels[type] || 'Add'}`);
		};

		// Wire up the "Add" button to trigger the appropriate create flow
		$('#ticket-btn-panel-add').off('click').on('click', async function () {
			if (activeType === 'Notes') {
				$('#quick-note-text').trigger('focus');
				return;
			}
			await showPanelForm(activeType);
		});

		$('#ticket-btn-panel-close').off('click').on('click', function () {
			hidePanelForm();
		});

		$('#ticket-panel-save-btn').off('click').on('click', async function () {
			const $saveBtn = $(this);
			$saveBtn.prop('disabled', true).text('Saving...');

			try {
				if (activeType === 'Tasks') {
					const subject = ($('#ticket-task-subject').val() || '').trim();
					const description = ($('#ticket-task-description').val() || '').trim();
					const exp_end_date = ($('#ticket-task-end-date').val() || '').trim();
					const selectedUsers = panelTaskAssignControl
						? getMultiControlValues(panelTaskAssignControl)
						: ($('#ticket-task-assign-to').val() || []);

					if (!subject) {
						frappe.msgprint(__('Please enter subject'));
						return;
					}

					await callApi({
						method: 'frappe.client.insert',
						args: {
							doc: {
								doctype: 'Task',
								subject,
								description,
								exp_end_date,
								issue: issueName,
								custom_users: (Array.isArray(selectedUsers) ? selectedUsers : [selectedUsers]).filter(Boolean).map((email) => ({ user: email })),
							}
						}
					});

					frappe.show_alert({ message: __('Task created'), indicator: 'green' });
					self.bindTaskCardsEvents(issueName);
					hidePanelForm();
					return;
				}

				if (activeType === 'Calls') {
					const subject = ($('#ticket-call-subject').val() || '').trim();
					const related_to = ($('#ticket-call-related-to').val() || 'Customer').trim();
					const name1 = ($('#ticket-call-name1').val() || '').trim();
					const start_date = ($('#ticket-call-start-date').val() || '').trim();
					const start_timing = ($('#ticket-call-start-time').val() || '').trim();
					const end_date = ($('#ticket-call-end-date').val() || '').trim();
					const end_timing = ($('#ticket-call-end-time').val() || '').trim();
					const status = ($('#ticket-call-status').val() || 'Held').trim();
					const description = ($('#ticket-call-description').val() || '').trim();

					if (!subject || !name1) {
						frappe.msgprint(__('Please fill required call fields'));
						return;
					}

					let custom_sales_person = '';
					if (related_to === 'Customer' && name1) {
						try {
							const salesRes = await callApi({
								method: 'renewal_module.custom_module.page.ticket.ticket.get_customer_sales_person',
								args: { customer: name1 },
								silent: true,
							});
							custom_sales_person = salesRes?.message || '';
						} catch (e) {
							custom_sales_person = '';
						}
					}

					const insertRes = await callApi({
						method: 'frappe.client.insert',
						args: {
							doc: {
								doctype: 'Call List',
								subject,
								name1,
								related_to,
								status,
								description,
								issue_id: issueName,
								custom_date: frappe.datetime.get_today(),
								start_date,
								end_date,
								start_timing,
								end_timing,
								custom_sales_person,
							}
						}
					});

					const callName = insertRes?.message?.name;
					if (callName) {
						try {
							const userInfo = await callApi({
								method: 'frappe.client.get_value',
								args: {
									doctype: 'User',
									filters: { name: frappe.session.user },
									fieldname: ['full_name', 'email', 'mobile_no', 'phone'],
								}
							});
							const u = userInfo?.message || {};
							await callApi({
								method: 'frappe.client.insert',
								args: {
									doc: {
										parent: callName,
										parenttype: 'Call List',
										parentfield: 'sales_team',
										doctype: 'Sales Team',
										sales_person: u.full_name || frappe.session.user,
										mobile_no: u.mobile_no || u.phone,
										email_id: u.email,
									}
								}
							});
						} catch (e) {
							// Optional enrichment failed, call is already created.
						}
					}

					frappe.show_alert({ message: __('Call created'), indicator: 'green' });
					self.bindcallcardsEvents(issueName);
					hidePanelForm();
					return;
				}

				if (activeType === 'Appointments') {
					const appointment_with = ($('#ticket-appointment-with').val() || 'Customer').trim();
					const party = ($('#ticket-appointment-party').val() || '').trim();
					const customer_name = ($('#ticket-appointment-name').val() || '').trim();
					const customer_email = ($('#ticket-appointment-email').val() || '').trim();
					const customer_phone_number = ($('#ticket-appointment-phone').val() || '').trim();
					const custom_start_date = ($('#ticket-appointment-start-date').val() || '').trim();
					const custom_start_time = ($('#ticket-appointment-start-time').val() || '').trim();
					const custom_end_date = ($('#ticket-appointment-end-date').val() || '').trim();
					const custom_end_time = ($('#ticket-appointment-end-time').val() || '').trim();
					const scheduled_time = ($('#ticket-appointment-scheduled-time').val() || '').trim();
					const customer_details = ($('#ticket-appointment-details').val() || '').trim();
					const participants = panelAppointmentParticipantsControl
						? getMultiControlValues(panelAppointmentParticipantsControl)
						: ($('#ticket-appointment-participants').val() || []);

					if (!customer_name || !customer_email || !custom_start_date || !custom_start_time || !custom_end_date || !custom_end_time || !participants.length) {
						frappe.msgprint(__('Please fill all required appointment fields'));
						return;
					}

					await callApi({
						method: 'frappe.client.insert',
						args: {
							doc: {
								doctype: 'Appointment',
								appointment_with,
								party,
								customer_name,
								customer_phone_number,
								customer_email,
								scheduled_time,
								custom_participants: participants.map((user) => ({ user })),
								customer_details,
								custom_start_date,
								custom_start_time,
								custom_end_date,
								custom_end_time,
								custom_issue_id: issueName,
							}
						}
					});

					frappe.show_alert({ message: __('Appointment created'), indicator: 'green' });
					self.bindcallcardsEvents(issueName);
					self.bindAppointmentCardsEvents(issueName);
					hidePanelForm();
				}
			} finally {
				$saveBtn.prop('disabled', false).text(activeType === 'Appointments' ? 'Schedule Appointment' : activeType === 'Calls' ? 'Save Call' : activeType === 'Tasks' ? 'Save Task' : 'Save');
			}
		});

		// Tab switching for the right-side panel
		$('.ticket-detail-panel .ptab').off('click').on('click', function () {
			$('.ticket-detail-panel .ptab').removeClass('is-active');
			$(this).addClass('is-active');

			const type = $(this).data('type');
			activeType = type || 'Notes';
			const subtitleMap = { Notes: 'Notes', Tasks: 'Tasks', Calls: 'Recent Calls', Appointments: 'Recent Appointments' };
			$('#ticket-panel-subtitle').text(subtitleMap[activeType] || activeType);
			updateAddBtnLabel(activeType);
			hidePanelForm();

			// Hide all panel sections
			$('.ticket-panel-section').addClass('d-none');

			if (activeType === 'Notes') {
				$('#ticket-activity-notes-section').removeClass('d-none');
			} else if (activeType === 'Tasks') {
				$('#ticket-activity-tasks-section').removeClass('d-none');
				moveContent('#tasks-card', '#activity-tasks-container');
				$("#activity-tasks-container #add-tasks-btn").addClass("d-none");
			} else if (activeType === 'Calls') {
				$('#ticket-activity-calls-section').removeClass('d-none');
				moveContent('#calls-card', '#activity-calls-container');
				$("#activity-calls-container #add-calls-btn").addClass("d-none");
			} else if (activeType === 'Appointments') {
				$('#ticket-activity-appointments-section').removeClass('d-none');
				moveContent('#appointments-card', '#activity-appointments-container');
				$("#activity-appointments-container #add-appointments-btn").addClass("d-none");
			}
		});

		// Initialize subtitle and add-button for the default (Notes) tab
		updateAddBtnLabel('Notes');

		// Load notes on initial render
		self.loadAndRenderNotes(issueName);

		// Quick Note Save
		$('#save-quick-note-btn').off('click').on('click', function () {
			const $btn = $(this);
			const text = $('#quick-note-text').val().trim();

			if (!text) {
				frappe.msgprint('Please enter a note');
				return;
			}

			$btn.prop('disabled', true).text('Saving...');

			frappe.call({
				method: "renewal_module.custom_module.page.ticket.ticket.add_issue_note",
				args: {
					issue_name: issueName,
					note_text: text
				},
				callback: function (r) {
					$btn.prop('disabled', false).text('Save Note');
					if (!r.exc) {
						$('#quick-note-text').val('');
						frappe.show_alert({ message: "Note added", indicator: "green" });
						self.loadAndRenderNotes(issueName);
					}
				},
				error: function () {
					$btn.prop('disabled', false).text('Save Note');
				}
			});
		});
	}

	bindResolutionEdit(issue_name) {
		const me = this;
		let resolution_field = null;
		let original_value = "";
		let isInitializing = true;
		let has_changed = false;
		let isProcessing = false;
		let $editorElement = null;

		// Fetch existing resolution details and initialize editor
		frappe.call({
			method: "frappe.client.get_value",
			args: {
				doctype: "Issue",
				filters: { name: issue_name },
				fieldname: ["resolution_details", "opening_date", "opening_time", "resolution_date", "resolution_time", "user_resolution_time"]
			},
			callback: function (response) {
				const existing_resolution = response.message?.resolution_details || "";
				original_value = existing_resolution;

				// Populate resolution date/time fields
				const fmtDate = (v) => v ? frappe.datetime.str_to_user(v) : '-';
				const fmtTime = (v) => v ? String(v).substring(0, 5) : '-';
				const fmtDuration = (seconds) => {
					if (!seconds && seconds !== 0) return '-';
					const totalSeconds = parseInt(seconds) || 0;
					if (totalSeconds === 0) return '0m';
					const d = Math.floor(totalSeconds / 86400);
					const h = Math.floor((totalSeconds % 86400) / 3600);
					const m = Math.floor((totalSeconds % 3600) / 60);
					const s = totalSeconds % 60;
					const parts = [];
					if (d) parts.push(`${d}d`);
					if (h) parts.push(`${h}h`);
					if (m) parts.push(`${m}m`);
					if (s && !d && !h) parts.push(`${s}s`);
					return parts.join(' ') || '0m';
				};
				const setField = (colId, valueId, value) => {
					if (value && value !== '-') {
						$("#" + valueId).text(value);
						$("#" + colId).removeClass('d-none');
					} else {
						$("#" + colId).addClass('d-none');
					}
				};
				setField('col-opening-date', 'res-opening-date', fmtDate(response.message?.opening_date));
				setField('col-opening-time', 'res-opening-time', fmtTime(response.message?.opening_time));
				setField('col-resolution-date', 'res-resolution-date', fmtDate(response.message?.resolution_date));
				setField('col-resolution-time', 'res-resolution-time', fmtDuration(response.message?.resolution_time));
				setField('col-user-resolution-time', 'res-user-resolution-time', fmtDuration(response.message?.user_resolution_time));

				// Remove any existing editor container first
				$("#resolution-editor-container").remove();

				// If resolution_details is empty, hide the entire resolution section
				if (!existing_resolution || existing_resolution.trim() === "") {
					$("#resolution-description").closest('.row').hide();
					return;
				}

				// Show the row and hide the display div and edit button (always show editor)
				$("#resolution-description").closest('.row').show();
				$("#resolution-description").hide();
				$("#edit-resolution-btn").hide();

				// Create inline editor container with save/cancel buttons (hidden by default)
				const editorHtml = `
					<div id="resolution-editor-container" class="resolution-editor-container">
						<div id="resolution-editor-field"></div>
						<div id="resolution-buttons" class="mt-2 gap-2 d-none">
							<button id="save-resolution-btn" class="btn btn-sm btn-primary" type="button">
								<i class="fa fa-save"></i> Save
							</button>
							<button id="cancel-resolution-btn" class="btn btn-sm btn-secondary" type="button">
								<i class="fa fa-times"></i> Undo
							</button>
						</div>
					</div>
				`;

				// Insert editor after the resolution description
				$("#resolution-description").after(editorHtml);

				// Create Frappe Text Editor field
				resolution_field = frappe.ui.form.make_control({
					parent: $("#resolution-editor-field"),
					df: {
						fieldtype: "Text Editor",
						fieldname: "resolution_details",
						label: __("Resolution Details")
					},
					render_input: true
				});

				// Set the value
				resolution_field.set_value(existing_resolution);

				// Helper function to show/hide buttons reliably
				const setButtonsVisible = function (visible) {
					const $buttons = $("#resolution-buttons");
					if (visible) {
						$buttons.removeClass("d-none").addClass("d-flex");
					} else {
						$buttons.removeClass("d-flex").addClass("d-none");
					}
				};

				// Helper function to detach all event listeners
				const detachListeners = function () {
					if ($editorElement) {
						$editorElement.off('.resolution');
					}
					// Detach Quill editor listeners if exists
					if (resolution_field && resolution_field.quill) {
						resolution_field.quill.off('text-change');
					}
				};

				// Helper function to reattach all event listeners
				const reattachListeners = function () {
					if (!$editorElement) return;
					$editorElement
						.on('change.resolution', function () {
							if (!isInitializing && !isProcessing) checkForChanges();
						})
						.on('keyup.resolution', function () {
							if (!isInitializing && !isProcessing) checkForChanges();
						})
						.on('paste.resolution', function () {
							setTimeout(() => {
								if (!isInitializing && !isProcessing) checkForChanges();
							}, 50);
						})
						.on('input.resolution', function () {
							if (!isInitializing && !isProcessing) checkForChanges();
						})
						.on('blur.resolution', function () {
							if (!isInitializing && !isProcessing) checkForChanges();
						});

					// Attach Quill editor specific event listeners for image insertion
					if (resolution_field && resolution_field.quill) {
						resolution_field.quill.on('text-change', function (delta, oldDelta, source) {
							if (!isInitializing && !isProcessing && source === 'user') {
								setTimeout(() => checkForChanges(), 100);
							}
						});
					}
				};

				// Helper function to check if data has changed
				const checkForChanges = function () {

					// Skip if processing (save/undo in progress)
					if (isProcessing || isInitializing) {
						return;
					}

					const current_value = resolution_field.get_value() || "";
					// Normalize HTML content for comparison - this preserves images and formatting
					const normalizeHtml = (html) => {
						if (!html) return "";
						// Remove empty paragraphs and normalize whitespace between tags
						return html.trim()
							.replace(/<p><\/p>/g, '')
							.replace(/<p><br><\/p>/g, '')
							.replace(/>\s+</g, '><');
					};

					const normalized_current = normalizeHtml(current_value);
					const normalized_original = normalizeHtml(original_value || "");

					// Update change flag - compare full HTML content (includes text, images, formatting)
					has_changed = normalized_current !== normalized_original;


					// Show/hide buttons based on change status
					if (has_changed) {
						setButtonsVisible(true);
					} else {
						setButtonsVisible(false);
					}
				};

				// Wait for editor to fully initialize before enabling change detection
				setTimeout(function () {
					// Update original_value after editor is fully initialized
					original_value = resolution_field.get_value() || "";
					has_changed = false;
					isProcessing = false;

					// Make sure buttons are hidden after initialization
					setButtonsVisible(false);

					// Now enable change detection
					isInitializing = false;

					// Get the contenteditable div or textarea
					$editorElement = resolution_field.$input || resolution_field.$wrapper.find('.ql-editor, textarea, [contenteditable]');

					if (!$editorElement) {
						console.error('Could not find editor element');
						return;
					}

					// Attach event listeners
					reattachListeners();

					// Also listen to the field's set_value method
					if (resolution_field) {
						const originalSetValue = resolution_field.set_value;
						resolution_field.set_value = function (value) {
							originalSetValue.call(this, value);
							if (!isInitializing && !isProcessing) {
								setTimeout(() => checkForChanges(), 50);
							}
						};
					}

				}, 800);

				// Save button handler
				$(document).off("click", "#save-resolution-btn").on("click", "#save-resolution-btn", function (e) {
					e.preventDefault();

					// Set processing flag and detach listeners
					isProcessing = true;
					detachListeners();

					const new_value = resolution_field.get_value();

					// Disable button during save
					$(this).prop('disabled', true);

					// Save the resolution details
					frappe.call({
						method: "frappe.client.set_value",
						args: {
							doctype: "Issue",
							name: issue_name,
							fieldname: "resolution_details",
							value: new_value
						},
						freeze: true,
						freeze_message: __("Saving resolution details..."),
						callback: function (r) {
							if (!r.exc) {
								frappe.show_alert({
									message: __("Resolution details saved successfully"),
									indicator: "green"
								}, 3);

								// Update the original value after successful save
								original_value = new_value || "";
								has_changed = false;

								// Update the hidden display div with new content
								$("#resolution-description p").html(new_value || '<span class="text-muted">No resolution details...</span>');

								// FORCE HIDE buttons and keep them hidden
								setButtonsVisible(false);

								$("#save-resolution-btn").prop('disabled', false);

								// Wait before re-enabling to let all events settle
								setTimeout(() => {
									isProcessing = false;
									reattachListeners();
								}, 500);
							} else {
								frappe.msgprint(__("Error saving resolution details"));
								$("#save-resolution-btn").prop('disabled', false);
								isProcessing = false;
								reattachListeners();
							}
						}
					});
				});

				// Cancel/Undo button handler
				$(document).off("click", "#cancel-resolution-btn").on("click", "#cancel-resolution-btn", function (e) {
					e.preventDefault();

					// Set processing flag and detach listeners
					isProcessing = true;
					detachListeners();

					// Reset to original value
					resolution_field.set_value(original_value);
					has_changed = false;

					// FORCE HIDE buttons and keep them hidden
					setButtonsVisible(false);

					frappe.show_alert({
						message: __("Changes cancelled"),
						indicator: "orange"
					}, 2);

					// Wait before re-enabling to let all events settle
					setTimeout(() => {
						isProcessing = false;
						reattachListeners();
					}, 500);
				});
			}
		});
	}

	bindCustomerDescriptionEdit(issue_name) {
		let cust_field = null;
		let original_value = "";
		let isInitializing = true;
		let has_changed = false;
		let isProcessing = false;
		let $editorElement = null;

		frappe.call({
			method: "frappe.client.get_value",
			args: {
				doctype: "Issue",
				filters: { name: issue_name },
				fieldname: ["customer_description"]
			},
			callback: function (response) {
				const existing = response.message?.customer_description || "";
				original_value = existing;

				$("#customer-editor-container").remove();

				// Always show the row
				$("#customer-description").closest('.row').show();
				$("#customer-description").hide();

				const editorHtml = `
					<div id="customer-editor-container" class="customer-editor-container">
						<div id="customer-editor-field"></div>
						<div id="customer-editor-buttons" class="mt-2 gap-2 d-none">
							<button id="save-customer-desc-btn" class="btn btn-sm btn-primary" type="button">
								<i class="fa fa-save"></i> Save
							</button>
							<button id="cancel-customer-desc-btn" class="btn btn-sm btn-secondary" type="button">
								<i class="fa fa-times"></i> Undo
							</button>
						</div>
					</div>
				`;

				$("#customer-description").after(editorHtml);

				cust_field = frappe.ui.form.make_control({
					parent: $("#customer-editor-field"),
					df: {
						fieldtype: "Text Editor",
						fieldname: "customer_description",
						label: __("Customer Description")
					},
					render_input: true
				});

				cust_field.set_value(existing);

				const setButtonsVisible = (visible) => {
					const $b = $("#customer-editor-buttons");
					if (visible) $b.removeClass("d-none").addClass("d-flex");
					else $b.removeClass("d-flex").addClass("d-none");
				};

				const detachListeners = () => {
					if ($editorElement) $editorElement.off('.custdesc');
					if (cust_field && cust_field.quill) cust_field.quill.off('text-change');
				};

				const normalizeHtml = (html) => {
					if (!html) return "";
					return html.trim()
						.replace(/<p><\/p>/g, '')
						.replace(/<p><br><\/p>/g, '')
						.replace(/>\s+</g, '><');
				};

				const checkForChanges = () => {
					if (isProcessing || isInitializing) return;
					const cur = normalizeHtml(cust_field.get_value() || "");
					const orig = normalizeHtml(original_value || "");
					has_changed = cur !== orig;
					setButtonsVisible(has_changed);
				};

				const reattachListeners = () => {
					if (!$editorElement) return;
					$editorElement
						.on('change.custdesc keyup.custdesc input.custdesc blur.custdesc', () => {
							if (!isInitializing && !isProcessing) checkForChanges();
						})
						.on('paste.custdesc', () => setTimeout(() => { if (!isInitializing && !isProcessing) checkForChanges(); }, 50));
					if (cust_field && cust_field.quill) {
						cust_field.quill.on('text-change', (delta, old, source) => {
							if (!isInitializing && !isProcessing && source === 'user') setTimeout(() => checkForChanges(), 100);
						});
					}
				};

				setTimeout(() => {
					original_value = cust_field.get_value() || "";
					has_changed = false;
					isProcessing = false;
					setButtonsVisible(false);
					isInitializing = false;
					$editorElement = cust_field.$input || cust_field.$wrapper.find('.ql-editor, textarea, [contenteditable]');
					reattachListeners();
				}, 800);

				// Save handler
				$(document).off("click", "#save-customer-desc-btn").on("click", "#save-customer-desc-btn", function (e) {
					e.preventDefault();
					isProcessing = true;
					detachListeners();
					const new_value = cust_field.get_value();
					$(this).prop('disabled', true);
					frappe.call({
						method: "frappe.client.set_value",
						args: { doctype: "Issue", name: issue_name, fieldname: "customer_description", value: new_value },
						freeze: true,
						freeze_message: __("Saving customer description..."),
						callback: function (r) {
							if (!r.exc) {
								frappe.show_alert({ message: __("Customer description saved"), indicator: "green" }, 3);
								original_value = new_value || "";
								has_changed = false;
								$("#customer-description p").html(new_value || '<span class="text-muted">No description...</span>');
								setButtonsVisible(false);
								$("#save-customer-desc-btn").prop('disabled', false);
								setTimeout(() => { isProcessing = false; reattachListeners(); }, 500);
							} else {
								frappe.msgprint(__("Error saving customer description"));
								$("#save-customer-desc-btn").prop('disabled', false);
								isProcessing = false;
								reattachListeners();
							}
						}
					});
				});

				// Cancel/Undo handler
				$(document).off("click", "#cancel-customer-desc-btn").on("click", "#cancel-customer-desc-btn", function (e) {
					e.preventDefault();
					isProcessing = true;
					detachListeners();
					cust_field.set_value(original_value);
					has_changed = false;
					setButtonsVisible(false);
					frappe.show_alert({ message: __("Changes cancelled"), indicator: "orange" }, 2);
					setTimeout(() => { isProcessing = false; reattachListeners(); }, 500);
				});
			}
		});
	}

	reset_work_timer_ui() {
		this.stop_work_timer_interval();
		this.stop_shift_monitor_interval();
		this.stop_approval_poll_interval();
		this.stop_auto_shift_resume_interval();
		const $headerRight = $(".ticket-meta");
		if (!$headerRight.length) return;
		$headerRight.find(".custom-start-btn").addClass("d-none");
		$headerRight.find(".custom-stop-btn").addClass("d-none");
		$headerRight.find(".custom-work-timer").addClass("d-none");
		$headerRight.find(".overtime-request-btn").addClass("d-none");
		$headerRight.find(".overtime-approve-btn").addClass("d-none");
		$headerRight.find(".overtime-reject-btn").addClass("d-none");
	}

	get_work_timer_elements() {
		const $headerRight = $(".ticket-meta");
		return {
			$headerRight,
			$timer: $headerRight.find(".custom-work-timer"),
			$timerLabel: $headerRight.find("#live-work-label"),
			$timerValue: $headerRight.find("#live-work-timer"),
			$startBtn: $headerRight.find(".custom-start-btn"),
			$stopBtn: $headerRight.find(".custom-stop-btn"),
			$overtimeBtn: $headerRight.find(".overtime-request-btn"),
			$overtimeApproveBtn: $headerRight.find(".overtime-approve-btn"),
			$overtimeRejectBtn: $headerRight.find(".overtime-reject-btn")
		};
	}

	get_auto_resume_storage_key(issueName) {
		return `ticket_auto_resume_shift::${frappe.session.user}::${issueName}`;
	}

	get_manual_resume_storage_key(issueName) {
		return `ticket_manual_resume_required::${frappe.session.user}::${issueName}`;
	}

	get_stopped_until_shift_key(issueName) {
		return `ticket_stopped_until_shift::${frappe.session.user}::${issueName}`;
	}

	set_auto_resume_after_shift(issueName, enabled = true) {
		const key = this.get_auto_resume_storage_key(issueName);
		if (enabled) {
			localStorage.setItem(key, "1");
		} else {
			localStorage.removeItem(key);
		}
	}

	has_auto_resume_after_shift(issueName) {
		const key = this.get_auto_resume_storage_key(issueName);
		return localStorage.getItem(key) === "1";
	}

	set_manual_resume_required(issueName, enabled = true) {
		const key = this.get_manual_resume_storage_key(issueName);
		if (enabled) {
			localStorage.setItem(key, "1");
		} else {
			localStorage.removeItem(key);
		}
	}

	has_manual_resume_required(issueName) {
		const key = this.get_manual_resume_storage_key(issueName);
		return localStorage.getItem(key) === "1";
	}

	set_stopped_until_next_shift(issueName, enabled = true) {
		const key = this.get_stopped_until_shift_key(issueName);
		if (enabled) {
			localStorage.setItem(key, "1");
		} else {
			localStorage.removeItem(key);
		}
	}

	has_stopped_until_next_shift(issueName) {
		const key = this.get_stopped_until_shift_key(issueName);
		return localStorage.getItem(key) === "1";
	}

	stop_work_timer_interval() {
		if (this.workTimerInterval) {
			clearInterval(this.workTimerInterval);
			this.workTimerInterval = null;
		}
	}

	stop_shift_monitor_interval() {
		if (this.shiftMonitorInterval) {
			clearInterval(this.shiftMonitorInterval);
			this.shiftMonitorInterval = null;
		}
	}

	stop_approval_poll_interval() {
		if (this.approvalPollInterval) {
			clearInterval(this.approvalPollInterval);
			this.approvalPollInterval = null;
		}
	}

	stop_auto_shift_resume_interval() {
		if (this.autoShiftResumeInterval) {
			clearInterval(this.autoShiftResumeInterval);
			this.autoShiftResumeInterval = null;
		}
	}

	start_auto_shift_resume_interval(issueName) {
		this.stop_auto_shift_resume_interval();
		this.autoShiftResumeInterval = setInterval(() => {
			if (!this.has_auto_resume_after_shift(issueName)) {
				this.stop_auto_shift_resume_interval();
				return;
			}

			frappe.call({
				method: "renewal_module.custom_issue.get_timer_permission_status",
				args: { issue_name: issueName },
				callback: (r) => {
					const perm = r?.message || {};
					if (perm.status !== "within_shift") return;

					this.stop_auto_shift_resume_interval();
					this.set_auto_resume_after_shift(issueName, false);
					this.set_stopped_until_next_shift(issueName, false);
					frappe.call({
						method: "renewal_module.custom_issue.start_time_log",
						args: { issue: issueName },
						callback: (res) => {
							const status = res?.message?.status;
							if (status === "started" || status === "resumed") {
								frappe.show_alert({ message: __("New shift started. Timer resumed automatically."), indicator: "green" }, 5);
							}
							this.load_issue_details(issueName, this.page);
						}
					});
				}
			});
		}, 60000);
	}

	poll_overtime_approval(issueName) {
		this.stop_approval_poll_interval();
		this.approvalPollInterval = setInterval(() => {
			frappe.call({
				method: "renewal_module.custom_issue.get_overtime_approval_status",
				args: { issue_name: issueName },
				callback: (r) => {
					const status = r?.message?.status;
					if (status === "approved") {
						this.stop_approval_poll_interval();
						this.set_manual_resume_required(issueName, true);
						frappe.show_alert({ message: __("Overtime approved. Click Start Work to continue."), indicator: "green" }, 5);
						this.load_issue_details(issueName, this.page);
					} else if (status === "not_requested") {
						// e.g. rejected
						this.stop_approval_poll_interval();
						this.set_manual_resume_required(issueName, false);
						this.load_issue_details(issueName, this.page);
					}
				}
			});
		}, 3000);
	}

	format_work_time(seconds) {
		const hrs = String(Math.floor(seconds / 3600)).padStart(2, "0");
		const mins = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
		const secs = String(seconds % 60).padStart(2, "0");
		return `${hrs}:${mins}:${secs}`;
	}

	set_paused_timer_ui(fromTimeStr, countedSeconds = null) {
		const { $timerLabel, $timerValue } = this.get_work_timer_elements();
		if (!$timerValue.length) return;

		let formattedTime = "00:00:00";
		if (Number.isFinite(countedSeconds) && countedSeconds >= 0) {
			formattedTime = this.format_work_time(Math.floor(countedSeconds));
		} else if (fromTimeStr) {
			const cleaned = fromTimeStr.split(".")[0].replace(" ", "T");
			const startTime = new Date(cleaned);
			if (!isNaN(startTime.getTime())) {
				const diffSeconds = Math.floor((new Date() - startTime) / 1000);
				formattedTime = this.format_work_time(diffSeconds);
			}
		}

		$timerLabel.text("Paused:");
		$timerValue.text(formattedTime);
		$timerValue.css({
			color: "orange",
			fontWeight: "bold"
		});
	}

	start_live_work_timer(fromTimeStr, issueName) {
		const { $timerLabel, $timerValue, $startBtn, $stopBtn, $overtimeBtn } = this.get_work_timer_elements();
		if (!$timerValue.length) return;

		// Store initial state for monitoring changes
		let lastKnownIssueData = null;
		let isFirstUpdate = true;
		let lastApprovalState = null;
		let shiftEndHandled = false;

		const updateTimer = () => {
			frappe.call({
				method: "renewal_module.custom_issue.get_elapsed_working_seconds",
				args: {
					user: frappe.session.user,
					from_time_str: fromTimeStr,
					issue_name: issueName
				},
				callback: (r) => {
					const requiresApproval = r?.message?.requires_approval || false;
					const isWithinShift = !!r?.message?.is_within_shift;
					const countedSeconds = Number(r?.message?.seconds || 0);
					const approvalStatus = r?.message?.approval_status;

					if (!isWithinShift) {
						// Hard stop timer when shift ends.
						this.set_paused_timer_ui(fromTimeStr, countedSeconds);
						$stopBtn.addClass("d-none");
						$startBtn.addClass("d-none");

						// Use server-authoritative status if available, fallback to local data
						const isPendingServer = approvalStatus === "pending";
						const isPendingLocal =
							$overtimeBtn.data("otPending") === 1
							|| $overtimeBtn.data("otPending") === true
							|| $overtimeBtn.data("otPending") === "1";
						const isWaitingApproval = isPendingServer || isPendingLocal;
						const isApprovedServer = approvalStatus === "approved";

						if (isWaitingApproval) {
							$overtimeBtn.text("OT Pending").removeClass("d-none").prop("disabled", true);
							$startBtn.addClass("d-none");
							// Start polling if not already polling
							if (!this.approvalPollInterval) {
								this.poll_overtime_approval(issueName);
							}
						} else {
							// Outside shift: show OT Request whenever approval is not already approved.
							if (!isApprovedServer || requiresApproval) {
								$overtimeBtn.text("OT Request").removeClass("d-none").prop("disabled", false).removeData("otPending");
								$startBtn.addClass("d-none");
							} else {
								// OT already approved: allow manual resume from the same open log.
								$overtimeBtn.addClass("d-none").removeData("otPending");
								$startBtn.text("Start").removeClass("d-none");
							}
							this.stop_approval_poll_interval();
						}

						const { $timer } = this.get_work_timer_elements();
						$timer.removeClass("d-none");
						if (!shiftEndHandled) {
							frappe.show_alert({
								message: __("Shift time completed. Timer paused."),
								indicator: "orange"
							}, 5);
							shiftEndHandled = true;
						}
						this.stop_work_timer_interval();
						this.stop_shift_monitor_interval();
						lastApprovalState = true;
						isFirstUpdate = false;
						return;
					}

					const seconds = r?.message?.seconds;
					if (typeof seconds === "number" && !isNaN(seconds)) {
						shiftEndHandled = false;
						$timerLabel.text("Work:");
						$timerValue.text(this.format_work_time(seconds));
						$timerValue.css({ color: "#ffffff", fontWeight: "bold" });
						$overtimeBtn.addClass("d-none").removeData("otPending");
						$stopBtn.addClass("d-none");
						lastApprovalState = false;
						isFirstUpdate = false;
						return;
					}

					this.stop_work_timer_interval();
					this.set_paused_timer_ui(fromTimeStr);
					lastApprovalState = false;
					isFirstUpdate = false;
				},
				error: (err) => {
					console.error("Timer update error:", err);
					isFirstUpdate = false;
				}
			});
		};

		// Monitor for issue changes (working_agent, status, shift type changes)
		const monitorIssueChanges = () => {
			frappe.call({
				method: "frappe.client.get",
				args: {
					doctype: "Issue",
					name: issueName,
					fields: ["name", "status", "working_agent", "default_shift"]
				},
				callback: (r) => {
					if (!r.message) return;

					const currentIssue = r.message;
					const currentUser = frappe.session.user;

					// Check if status changed to Closed
					if (currentIssue.status === "Closed") {
						this.stop_work_timer_interval();
						this.set_paused_timer_ui(fromTimeStr);
						$overtimeBtn.removeClass("d-none");
						frappe.show_alert({
							message: __("Issue status changed to Closed. Timer paused."),
							indicator: "red"
						}, 5);
						return;
					}

					// Check if working agent changed
					if (currentIssue.working_agent && currentIssue.working_agent !== currentUser) {
						this.stop_work_timer_interval();
						this.set_paused_timer_ui(fromTimeStr);
						frappe.show_alert({
							message: __("Working agent changed. Timer paused."),
							indicator: "orange"
						}, 5);
						return;
					}

					// Store data for next iteration
					lastKnownIssueData = currentIssue;
				}
			});
		};

		updateTimer();
		this.workTimerInterval = setInterval(updateTimer, 1000);

		// Monitor issue changes every 5 seconds
		this.shiftMonitorInterval = setInterval(monitorIssueChanges, 5000);
	}

	stop_work_timer_interval() {
		if (this.workTimerInterval) {
			clearInterval(this.workTimerInterval);
			this.workTimerInterval = null;
		}
	}

	stop_shift_monitor_interval() {
		if (this.shiftMonitorInterval) {
			clearInterval(this.shiftMonitorInterval);
			this.shiftMonitorInterval = null;
		}
	}

	bind_work_timer_controls(issue) {
		const { $timer, $startBtn, $stopBtn, $overtimeBtn } = this.get_work_timer_elements();
		if (!$timer.length || !$startBtn.length) return;

		this.stop_work_timer_interval();
		this.stop_shift_monitor_interval();
		this.stop_auto_shift_resume_interval();
		$timer.addClass("d-none");
		$startBtn.addClass("d-none");
		$stopBtn.addClass("d-none");
		$overtimeBtn.addClass("d-none").removeData("otPending").prop("disabled", false).text("OT Request");

		const currentUser = frappe.session.user;

		// Only show timer controls if:
		// 1. Working agent is set and equals current user
		// 2. Issue is not closed
		if (!issue?.working_agent || issue.working_agent !== currentUser || issue?.status === "Closed") {
			return;
		}

		const openLog = (issue.custom_issue_time_log || []).find((log) => {
			return log.user === currentUser && !log.to_time;
		});

		if (openLog?.from_time) {
			if (this.has_stopped_until_next_shift(issue.name)) {
				// Only keep hidden state while auto-resume is actively waiting for next shift.
				if (!this.has_auto_resume_after_shift(issue.name)) {
					this.set_stopped_until_next_shift(issue.name, false);
				} else {
				$timer.addClass("d-none");
				$startBtn.addClass("d-none");
				$stopBtn.addClass("d-none");
				$overtimeBtn.addClass("d-none").removeData("otPending");
				if (this.has_auto_resume_after_shift(issue.name)) {
					this.start_auto_shift_resume_interval(issue.name);
				}
				return;
				}
			}

			if (this.has_manual_resume_required(issue.name)) {
				// Approval is done, but keep manual resume as requested while preserving same log continuity.
				$timer.removeClass("d-none");
				$stopBtn.addClass("d-none");
				$overtimeBtn.addClass("d-none").removeData("otPending");
				$startBtn.text("Start").removeClass("d-none");
				this.set_paused_timer_ui(openLog.from_time);
				return;
			}

			// Timer is running/paused
			$timer.removeClass("d-none");
			$stopBtn.addClass("d-none");
			this.start_live_work_timer(openLog.from_time, issue.name);
		} else {
			this.set_manual_resume_required(issue.name, false);
			this.set_stopped_until_next_shift(issue.name, false);
			// No open log, correctly determine state before showing Start or Request buttons
			frappe.call({
				method: "renewal_module.custom_issue.get_timer_permission_status",
				args: { issue_name: issue.name },
				callback: (r) => {
					const perm = r?.message || {};
					if (perm.status === "within_shift" && this.has_auto_resume_after_shift(issue.name)) {
						this.set_auto_resume_after_shift(issue.name, false);
						frappe.call({
							method: "renewal_module.custom_issue.start_time_log",
							args: { issue: issue.name },
							callback: (res) => {
								const status = res?.message?.status;
								const fromTime = res?.message?.from_time;
								if ((status === "started" || status === "resumed") && fromTime) {
									$startBtn.addClass("d-none");
									$timer.removeClass("d-none");
									$stopBtn.addClass("d-none");
									$overtimeBtn.addClass("d-none").removeData("otPending");
									this.start_live_work_timer(fromTime, issue.name);
									return;
								}
								this.load_issue_details(issue.name, this.page);
							}
						});
						return;
					}

					if (perm.status === "pending") {
						$startBtn.addClass("d-none");
						$overtimeBtn
							.text("OT Pending")
							.removeClass("d-none")
							.prop("disabled", true)
							.data("otPending", 1);
						this.poll_overtime_approval(issue.name);
					} else if (perm.status === "not_requested" && perm.requires_approval) {
						$startBtn.addClass("d-none");
						$overtimeBtn
							.text("OT Request")
							.removeClass("d-none")
							.prop("disabled", false)
							.removeData("otPending");
					} else {
						// Explicitly within shift or explicitly approved, they can just click Start
						$startBtn.text("Start");
						$startBtn.removeClass("d-none");
						$stopBtn.addClass("d-none");
						if (this.has_auto_resume_after_shift(issue.name)) {
							this.start_auto_shift_resume_interval(issue.name);
						}
					}
				}
			});
		}

		// Start button click handler
		$startBtn.off("click.worktimer").on("click.worktimer", () => {
			$startBtn.prop("disabled", true);
			frappe.call({
				method: "renewal_module.custom_issue.start_time_log",
				args: { issue: issue.name },
				callback: (r) => {
					$startBtn.prop("disabled", false);
					const status = r?.message?.status;
					const message = r?.message?.message;
					const fromTime = r?.message?.from_time;

					if (status === "approval_requested") {
						$startBtn.addClass("d-none");
						$overtimeBtn
							.text("OT Pending")
							.removeClass("d-none")
							.prop("disabled", true)
							.data("otPending", 1);
						frappe.msgprint(message || __("Approval request sent to manager."));
						this.poll_overtime_approval(issue.name);
						return;
					}

					if (status === "approval_required") {
						$startBtn.addClass("d-none");
						$overtimeBtn
							.text("OT Request")
							.removeClass("d-none")
							.prop("disabled", false)
							.removeData("otPending");
						frappe.msgprint(message || __("Overtime approval is required to start the timer."));
						return;
					}

					if (status === "blocked") {
						frappe.msgprint(message || __("Unable to start timer."));
						return;
					}

					if ((status === "started" || status === "resumed") && fromTime) {
						$startBtn.addClass("d-none");
						$timer.removeClass("d-none");
						$stopBtn.addClass("d-none");
						$overtimeBtn.addClass("d-none").removeData("otPending");
						this.set_manual_resume_required(issue.name, false);
						this.set_stopped_until_next_shift(issue.name, false);
						this.set_auto_resume_after_shift(issue.name, false);
						this.start_live_work_timer(fromTime, issue.name);
						return;
					}

					this.load_issue_details(issue.name, this.page);
				},
				error: (err) => {
					$startBtn.prop("disabled", false);
					frappe.msgprint(err?.message || "Failed to start work timer.");
				}
			});
		});

		$stopBtn.off("click.worktimerstop").on("click.worktimerstop", () => {
			$stopBtn.prop("disabled", true);

			this.stop_work_timer_interval();
			this.stop_shift_monitor_interval();
			this.stop_approval_poll_interval();
			$timer.addClass("d-none");
			$stopBtn.addClass("d-none");
			$startBtn.addClass("d-none");
			$overtimeBtn.addClass("d-none").removeData("otPending");

			// Keep current open log intact and auto-resume it in next shift window.
			this.set_manual_resume_required(issue.name, false);
			this.set_stopped_until_next_shift(issue.name, true);
			this.set_auto_resume_after_shift(issue.name, true);
			this.start_auto_shift_resume_interval(issue.name);
			$stopBtn.prop("disabled", false);
			frappe.show_alert({ message: __("Timer paused. It will auto-resume at next shift start."), indicator: "orange" }, 6);
		});

		// Overtime request button click handler
		$overtimeBtn.off("click.overtimerequest").on("click.overtimerequest", () => {
			$overtimeBtn.prop("disabled", true);

			frappe.call({
				method: "renewal_module.custom_issue.request_overtime_approval",
				args: { issue_name: issue.name },
				callback: (r) => {
					$overtimeBtn.prop("disabled", false);
					const response = r?.message || {};
					const status = response.status;
					const email_status = response.email_status;
					const email_message = response.email_message;

					if (status === "approval_requested") {
						if (email_status === "sent" || email_status === "queued") {
							frappe.msgprint(__("Overtime approval request sent to manager."));
							$overtimeBtn.text("OT Pending").prop("disabled", true).data("otPending", 1);
							this.poll_overtime_approval(issue.name);
						} else {
							frappe.msgprint(__("Request created but failed to send email:") + " " + (email_message || __("Unknown email error.")));
							// keep button enabled so user can retry
							$overtimeBtn.text("Request Failed - Retry").prop("disabled", false).removeData("otPending");
						}
					} else if (status === "approved") {
						frappe.msgprint(__("Overtime already approved."));
						$overtimeBtn.text("Approved").prop("disabled", true).removeData("otPending");
					} else if (status === "blocked") {
						$overtimeBtn.removeData("otPending");
						frappe.msgprint(response.message || __("Failed to send overtime request."));
					} else {
						$overtimeBtn.removeData("otPending");
						frappe.msgprint(response.message || __("Failed to send overtime request."));
					}
				},
				error: (err) => {
					$overtimeBtn.prop("disabled", false).removeData("otPending");
					frappe.msgprint(err?.message || "Error requesting overtime approval.");
				}
			});
		});
	}

	bind_overtime_approval_controls(issue) {
		const { $overtimeApproveBtn, $overtimeRejectBtn } = this.get_work_timer_elements();
		if (!$overtimeApproveBtn.length || !$overtimeRejectBtn.length || !issue?.name) return;

		$overtimeApproveBtn.addClass("d-none").prop("disabled", false).removeData("ot-token");
		$overtimeRejectBtn.addClass("d-none").prop("disabled", false).removeData("ot-token");

		frappe.call({
			method: "renewal_module.custom_issue.get_my_pending_overtime_request",
			args: { issue_name: issue.name },
			callback: (r) => {
				const data = r?.message || {};
				if (data.status !== "pending" || !data.token) return;

				$overtimeApproveBtn
					.removeClass("d-none")
					.data("ot-token", data.token)
					.attr("title", __("Approve overtime request"));

				$overtimeRejectBtn
					.removeClass("d-none")
					.data("ot-token", data.token)
					.attr("title", __("Reject overtime request"));

				const processAction = (action) => {
					const token = data.token;
					$overtimeApproveBtn.prop("disabled", true);
					$overtimeRejectBtn.prop("disabled", true);

					frappe.call({
						method: "renewal_module.custom_issue.process_overtime_approval_action",
						args: { token, action },
						callback: (res) => {
							const out = res?.message || {};
							if (out.status === "approved") {
								frappe.msgprint(out.message || __("Overtime request approved."));
							} else if (out.status === "rejected") {
								frappe.msgprint(out.message || __("Overtime request rejected."));
							} else {
								frappe.msgprint(out.message || __("Unable to process overtime action."));
							}

							$overtimeApproveBtn.addClass("d-none").prop("disabled", false).removeData("ot-token");
							$overtimeRejectBtn.addClass("d-none").prop("disabled", false).removeData("ot-token");
							this.load_issue_details(issue.name, this.page);
						},
						error: (err) => {
							$overtimeApproveBtn.prop("disabled", false);
							$overtimeRejectBtn.prop("disabled", false);
							frappe.msgprint(err?.message || __("Error processing overtime action."));
						}
					});
				};

				$overtimeApproveBtn
					.off("click.overtimeapprove")
					.on("click.overtimeapprove", () => processAction("approve"));

				$overtimeRejectBtn
					.off("click.overtimereject")
					.on("click.overtimereject", () => processAction("reject"));
			}
		});
	}

	load_issue_details(issueName, page) {
		const me = this;

		// Handle email approval actions from URL
		const urlParams = new URLSearchParams(window.location.search);
		const overtimeAction = urlParams.get('overtime_action');
		const token = urlParams.get('token');

		if (overtimeAction && token) {
			frappe.call({
				method: "renewal_module.custom_issue.process_overtime_approval_action",
				args: {
					token: token,
					action: overtimeAction
				},
				callback: (r) => {
					const result = r?.message || {};
					if (result.status === "approved") {
						frappe.msgprint(__("Overtime approved! Timer can now resume."));
						// Reload to refresh timer state
						setTimeout(() => {
							me.load_issue_details(issueName, page);
						}, 1000);
					} else if (result.status === "rejected") {
						frappe.msgprint(__("Overtime request was rejected."), "red");
					}
					// Clean up URL
					window.history.replaceState({}, document.title, window.location.pathname);
				},
				error: (err) => {
					frappe.msgprint(err?.message || __("Error processing overtime action."));
					window.history.replaceState({}, document.title, window.location.pathname);
				}
			});
		}

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

			me.render_issue_attachments(null);

			return; // stop here
		}

		// --- If issueName exists, continue normal flow ---
		frappe.call({
			method: "frappe.client.get",
			args: {
				doctype: "Issue",
				name: issueName,
				fields: ["*"]
			},
			callback: function (r) {
				if (!r.message) {
					console.warn("Issue not found, hiding right column.");
					// rightCol.hide();
					// leftCol.removeClass("col-lg-8").addClass("col-lg-12");
					rightCol.show();
					leftCol.removeClass("col-lg-12").addClass("col-lg-8");

					me.render_issue_attachments(null);

					return;
				}
				const displayContainer = $("#issuedatadisplay");
				let issue = r.message;
				console.log("issue", issue);
				window.issue_data = issue;
				me.init_attachment_section(issue.name);
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
				setTextAndTitle("custom_oem_id", issue.oem_details);

				function setPriorityBadge(priority) {
					const $badge = $("#priority");

					if (!priority) {
						$badge.text("");
						return;
					}

					let bgColor = "";

					switch (priority) {
						case "High":
							bgColor = "#F1556c";
							break;
						case "Medium":
							bgColor = "#f7b848";
							break;
						case "Low":
							bgColor = "#6658DD";
							break;
						default:
							bgColor = "#6c757d"; // fallback
					}

					$badge
						.text(priority)
						.css("background-color", bgColor)
						.attr("title", priority);
				}
				setPriorityBadge(issue.priority);

				function setStatusBadge(status) {
					const $badge = $("#issue-status");

					if (!status) {
						$badge.text("");
						return;
					}

					let bgColor = "";

					switch (status) {
						case "Open":
							bgColor = "#06B6D4";
							break;
						case "Closed":
							bgColor = "#6366F1";
							break;
						case "Resolved":
							bgColor = "#16A34A";
							break;
						case "On Hold":
							bgColor = "#2563EB";
							break;
						case "Pending":
							bgColor = "#f97316";
							break;
						default:
							bgColor = "#6c757d"; // fallback
					}

					$badge
						.text(status)
						.css("background-color", bgColor)
						.attr("title", status);
				}
				setStatusBadge(issue.status);
				me.bind_work_timer_controls(issue);
				me.bind_overtime_approval_controls(issue);

				let html = `
					<div class="bg-white rounded shadow-sm p-3 mb-3">
						<div class="row">
							${issue.department ? `
								<div class="col-md-4 mb-1">
									<div class=" border rounded p-2 h-100">
										<h6 class="text-uppercase text-muted1">Department</h6>
										<div class="d-flex align-items-center gap-2">
											<span class="ellipsis" title="${issue.department}">${issue.department}</span>
										</div>
									</div>
								</div>
							`: ""}
							
							${issue.active_subscription ? `
								<div class="col-md-8 mb-1" style="cursor: pointer;" id="active_subscription-details">
									<div class=" border rounded p-2 h-100">
										<h6 class="text-uppercase text-muted1">Active Subscription</h6>
										<div class="d-flex align-items-center gap-2">
											<span class="" title="${issue.active_subscription}">${issue.active_subscription}</span>
										</div>
									</div>
								</div>
							`: ""}
					
							${issue.custom_query_type ? `
								<div class="col-md-4 mb-1">
									<div class=" border rounded p-2 h-100">
										<h6 class="text-uppercase text-muted1">Query Type</h6>
										<div class="d-flex align-items-center gap-2">
											<span class="ellipsis" title="${issue.custom_query_type}">${issue.custom_query_type}</span>
										</div>
									</div>
								</div>
							`: ""}
							${issue.custom_other_query_data ? `
								<div class="col-md-4 mb-1">
									<div class=" border rounded p-2 h-100">
										<h6 class="text-uppercase text-muted1">Other Query Data</h6>
										<div class="d-flex align-items-center gap-2">
											<span class="ellipsis" title="${issue.custom_other_query_data}">${issue.custom_other_query_data}</span>
										</div>
									</div>	
								</div>
							`: ""}
							${issue.custom_support_type ? `
								<div class="col-md-4 mb-1">
									<div class=" border rounded p-2 h-100">
										<div class="d-flex align-items-center mb-1 gap-1">
											<h6 class="text-uppercase text-muted1 mb-0" style="font-weight: 600; letter-spacing: 0.3px;">Support Type</h6>
											<i class="fa fa-edit" 
												id="change-support-type-btn" 
												title="Change Support Type" 
												style="cursor: pointer; font-size: 13px; font-weight: 700;">
											</i>
										</div>	
										<div class="d-flex align-items-center gap-2">
											<span class="ellipsis" title="${issue.custom_support_type}">${issue.custom_support_type}</span>
											
										</div>
									</div>	
								</div>
							`: ""}
							${issue.issue_contact_list?.length ? `
								<div class="col-md-4 mb-1 h-100" id="contact-list-details">
									<div class=" border rounded p-2 h-100">
										<div class="d-flex align-items-center mb-1 gap-1">
											<h6 class="text-uppercase text-muted1 mb-0" style="font-weight: 600; letter-spacing: 0.3px;">
												Contact Person
											</h6>
											<i class="fa fa-plus text-warning" 
												id="add-contact-btn" 
												title="Add Contact" 
												style="cursor: pointer; font-size: 16px; font-weight: 700;">
											</i>
										</div>
										<div class="d-flex align-items-start">
											<span id="contact_person" class="ellipsis w-100"></span>
										</div>
									</div>
								</div>
							`: ""}
							${issue.sales_person ? `
								<div class="col-md-4 mb-1">
								    <div class=" border rounded p-2 h-100">
										<h6 class="text-uppercase text-muted1">Sales Person</h6>
										<div class="d-flex align-items-center gap-2">
											<span class="ellipsis" title="${issue.sales_person}">${issue.sales_person}</span>
										</div>
									</div>	
								</div>
							`: ""}
							${issue.custom_oem_id ? `
								<div class="col-md-4 mb-1" id="oem-details" style="cursor: pointer;">
									<div class=" border rounded p-2 h-100">
										<h6 class="text-uppercase text-muted1">OEM ID</h6>
										<div class="d-flex align-items-center gap-2">
											<span class="ellipsis" title="${issue.custom_oem_id}">${issue.custom_oem_id}</span>
										</div>
									</div>	
								</div>
							`: ""}
							
						</div>	
					</div>

					<div class="bg-white rounded shadow-sm p-3 mb-3">	
						<div class="row">
							${issue.working_agent ? `
								<div class="col-md-4 mb-1">
									<div class=" border rounded p-2 h-100">
										<h6 class="text-uppercase text-muted1">Assign Agent</h6>
										<div class="d-flex align-items-center gap-1">
											<div id="working_agent_avatar" class="rounded-circle1 avatar1-sm d-flex align-items-center justify-content-center bg-secondary text-white"></div>
											<span class="ellipsis" title="${issue.working_agent}">${issue.working_agent}</span>
										</div>
									</div>
								</div>
							`: ""}
							${issue.raised_by ? `
								<div class="col-md-4 mb-1">
									<div class=" border rounded p-2 h-100">
										<h6 class="text-uppercase text-muted1">Raised By</h6>
										<div class="d-flex align-items-center gap-2">
											<span class="ellipsis" title="${issue.raised_by}">${issue.raised_by}</span>
										</div>
									</div>
								</div>
							`: ""}

						</div>
					</div>	
						
						
				`;
				displayContainer.html(html);





				// --- Working Agent Avatar ---
				if (issue.working_agent) {
					setTextAndTitle("working_agent", issue.working_agent);
					frappe.db.get_value("User", issue.working_agent, ["user_image", "full_name"]).then((res) => {
						const avatarDiv = $("#working_agent_avatar");
						const fullName = res.message?.full_name || issue.working_agent;
						//const imageUrl = res.message?.user_image;
						const rawUrl = res.message?.user_image;
						let imageUrl = rawUrl ? encodeURI(rawUrl) : null;
						//console.log("image url", imageUrl);
						if (imageUrl) {
							avatarDiv.css({
								"background-image": `url(${imageUrl})`,
								"background-size": "cover",
								"background-position": "center",
								"color": "transparent",
								"font-size": "0"
							}).text("");
						} else {
							// const initials = issue.working_agent.slice(0, 2).toUpperCase();
							const initials = getInitialsFromName(fullName);
							avatarDiv.css({
								"background-image": "none",
								"background-color": "#6c757d",
								"color": "#fff",
								"font-size": "12.25px"
							}).text(initials);
						}
					});
				} else {
					setTextAndTitle("working_agent", "");
					$("#working_agent_avatar").css({
						"background-image": "none",
						"background-color": "#6c757d",
						"color": "#fff",
						"font-size": "12.25px"
					}).text("");
				}

				function getInitialsFromName(name) {
					if (!name) return "";
					const parts = name.trim().split(/\s+/);
					// First + Last word initials
					if (parts.length >= 2) {
						return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
					}
					// Single word
					return parts[0].slice(0, 2).toUpperCase();
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
												<i class="fa fa-box text-success"></i>
												<div class="detail-text">
													<label>Item</label>
													<span>${row.item}</span>
												</div>
											</div>` : ""}

											${row.end_date ? `
											<div class="detail-item p-2 mb-1">
												<i class="fa fa-calendar text-warning"></i>
												<div class="detail-text">
													<label>End Date</label>
													<span>${frappe.datetime.str_to_user(row.end_date)}</span>
												</div>
											</div>` : ""}
											${row.quantity ? `
											<div class="detail-item p-2 mb-1">
												<i class="fa fa-hashtag text-info"></i>
												<div class="detail-text">
													<label>Quantity</label>
													<span>${row.quantity}</span>
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
									<i class="fa fa-receipt text-primary me-1"></i>
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
						if (!name) return;

						if (name) {
							html += `
								<div class="contact-entry gap-1" 
									style="display: flex; align-items: center; 
									width: 100%; margin-bottom: 1px;
									">
									<span class="contact-name text-truncate" 
										style="cursor:pointer;"
										data-index="${i}" title="${name}">
										${frappe.utils.escape_html(name)}
									</span>
									${row.tpoc ? `<i class="fa fa-check-circle text-success"></i>` : ""}
									<i class="fa fa-trash-can text-danger delete-contact" 
										style="cursor:pointer; font-size:13px; margin-left:3px;" 
										title="Remove Contact"
										data-rowname="${row.name}">
									</i>
								</div>
							`;
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
									<i class="fa fa-message text-primary"></i>
									<div class="detail-text">
										<label>Email</label>
										<span class="ellipsis" title="${row.email_id}">${row.email_id}</span>
									</div>
								</div>` : ""}
								
								${row.mobile_no ? `
								<div class="detail-item">
									<i class="fa fa-mobile text-success"></i>
									<div class="detail-text">
										<label>Mobile No</label>
										<span title="${row.mobile_no}">${row.mobile_no}</span>
									</div>
								</div>` : ""}
								
								${row.designation ? `
								<div class="detail-item">
									<i class="fa fa-circle-info text-warning"></i>
									<div class="detail-text">
										<label>Designation</label>
										<span class="ellipsis" title="${row.designation}">${row.designation}</span>
									</div>
								</div>` : ""}
								${row.tpoc ? `
								<div class="detail-item">
									<i class="fa fa-check text-info"></i>
									<div class="detail-text">
										<label>Technical Point of Contact</label>
									</div>
								</div>` : ""}
							</div>
						`;

					renderRightCard(
						`<div class="sla-title pl-3 pr-3">
									<i class="fa fa-user-tie me-1" style="color: #0d6efd;"></i>
									<div class="sla-title-text">
										<div class="">${selectedName}</div>
									</div>
								</div>`,
						html
					);


				});

				$(document).off("click", "#time-logs-btn, .time-logs-btn").on("click", "#time-logs-btn, .time-logs-btn", function () {
					const esc = (val) => frappe.utils.escape_html(val || "");
					const logs = Array.isArray(issue.custom_issue_time_log)
						? issue.custom_issue_time_log.slice()
						: [];

					logs.sort((a, b) => {
						const aTime = a.from_time ? new Date(a.from_time.replace(" ", "T")).getTime() : 0;
						const bTime = b.from_time ? new Date(b.from_time.replace(" ", "T")).getTime() : 0;
						return bTime - aTime;
					});

					const formatStamp = (value) => {
						if (!value) return "-";
						return frappe.datetime.str_to_user(value);
					};

					const formatDuration = (log) => {
						const parseStamp = (value) => {
							if (!value) return null;
							const parsed = new Date(value.replace(" ", "T"));
							return Number.isNaN(parsed.getTime()) ? null : parsed;
						};

						const formatParts = (parts) => {
							const output = [];
							if (parts.months) output.push(`${parts.months}mo`);
							if (parts.days) output.push(`${parts.days}d`);
							if (parts.hours) output.push(`${parts.hours}h`);
							if (parts.minutes) output.push(`${parts.minutes}m`);
							if (parts.seconds || !output.length) output.push(`${parts.seconds}s`);
							return output.join(" ");
						};

						const formatHumanDuration = (totalSeconds) => {
							if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return "-";
							let remaining = Math.floor(totalSeconds);
							const secondsInMinute = 60;
							const secondsInHour = 60 * secondsInMinute;
							const secondsInDay = 24 * secondsInHour;
							const days = Math.floor(remaining / secondsInDay);
							remaining %= secondsInDay;
							const hours = Math.floor(remaining / secondsInHour);
							remaining %= secondsInHour;
							const minutes = Math.floor(remaining / secondsInMinute);
							const seconds = remaining % secondsInMinute;
							return formatParts({ months: 0, days, hours, minutes, seconds });
						};

						const formatCalendarDuration = (startDate, endDate) => {
							if (!startDate || !endDate || endDate <= startDate) return "-";
							let current = new Date(startDate.getTime());
							let months = 0;
							while (true) {
								const next = new Date(current.getTime());
								next.setMonth(next.getMonth() + 1);
								if (next <= endDate) {
									months += 1;
									current = next;
								} else {
									break;
								}
							}

							let remaining = Math.floor((endDate - current) / 1000);
							const secondsInMinute = 60;
							const secondsInHour = 60 * secondsInMinute;
							const secondsInDay = 24 * secondsInHour;
							const days = Math.floor(remaining / secondsInDay);
							remaining %= secondsInDay;
							const hours = Math.floor(remaining / secondsInHour);
							remaining %= secondsInHour;
							const minutes = Math.floor(remaining / secondsInMinute);
							const seconds = remaining % secondsInMinute;
							return formatParts({ months, days, hours, minutes, seconds });
						};

						// const startDate = parseStamp(log.from_time);
						// const endDate = parseStamp(log.to_time);
						// if (startDate && endDate) {
						// 	return formatCalendarDuration(startDate, endDate);
						// }

						if (log.time_duration) {
							if (typeof log.time_duration === "number") {
								return formatHumanDuration(log.time_duration);
							}
							// const raw = String(log.time_duration).trim();
							// if (/^\d+(\.\d+)?$/.test(raw)) {
							// 	return formatHumanDuration(Number(raw));
							// }
							// return raw;
						}

						return "-";
					};

					let html = `<div class="contact-details-modern space-y-3">`;

					if (logs.length) {
						logs.forEach((log) => {
							html += `
								<div class="time-log-entry p-3 mb-3 border rounded">
									<div class="d-flex align-items-center mb-2 gap-2">
										${log.user ? `
										<div class="avatar avatar-medium flex-shrink-0" title="${esc(log.user)}">
											<div class="avatar-frame standard-image" style="background-color: var(--dark-green-avatar-bg, #e2f2e6); color: var(--dark-green-avatar-color, #1b5e20)">
												${esc(log.user).charAt(0).toUpperCase()}
											</div>
										</div>
										` : ""}
										<div class="d-flex flex-column text-truncate" style="min-width: 0;">
											${log.user ? `<span class="fw-semibold text-dark text-truncate" title="${esc(log.user)}">${esc(log.user)}</span>` : ""}
											${log.time_duration ? `
											<span class="text-muted text-truncate" style="margin-top: 2px;">
												<i class="fa fa-hourglass-half text-primary me-1"></i> ${esc(formatDuration(log))}
											</span>` : ""}
										</div>
									</div>
									<div class="row">
										${log.from_time ? `
										<div class="col-12 col-md-12 col-xl-6 col-lg-6 mb-2 mb-md-0 text-truncate">
											<span class="text-muted text-uppercase d-block mb-1">From Time</span>
											<span class="text-dark fw-medium" title="${esc(formatStamp(log.from_time))}"><i class="fa fa-clock text-info me-1"></i>${esc(formatStamp(log.from_time))}</span>
										</div>` : ""}
										${log.to_time ? `
										<div class="col-12 col-md-12 col-xl-6 col-lg-6 text-truncate">
											<span class="text-muted text-uppercase d-block mb-1">Till Time</span>
											<span class="text-dark fw-medium" title="${esc(formatStamp(log.to_time))}"><i class="fa fa-stop-circle text-warning me-1"></i>${esc(formatStamp(log.to_time))}</span>
										</div>` : ""}
									</div>
								</div>
							`;
						});
					} else {
						html += `<p class="text-muted text-center mb-0">No time logs found.</p>`;
					}

					html += `</div>`;

					renderRightCard("Time Logs", html);
				});

				// ---------------- CLICK HANDLER FOR OEM DETAILS ----------------
				$("#oem-details").off("click").on("click", function () {
					if (!issue.custom_oem_id && !issue.custom_oem_url && !issue.custom_oem_description) {
						frappe.show_alert({ message: __("No OEM details found."), indicator: "orange" });
						return;
					}
					const oemUrl = issue.custom_oem_url || "";
					const oemDesc = issue.custom_oem_description || "";
					const oemId = issue.custom_oem_id || "";

					const html = `
						<div class="detail-item mb-2">
							<i class="fa fa-id-card text-primary"></i>
							<div class="detail-text">
								<label>OEM ID</label>
								<span class="ellipsis" title="${frappe.utils.escape_html(oemId)}">${frappe.utils.escape_html(oemId)}</span>
							</div>
						</div>
						${oemUrl ? `
						<div class="detail-item mb-2">
							<i class="fa fa-link text-success"></i>
							<div class="detail-text">
								<label>OEM URL</label>
								<a href="${frappe.utils.escape_html(oemUrl)}" target="_blank" rel="noopener noreferrer" title="${frappe.utils.escape_html(oemUrl)}">${frappe.utils.escape_html(oemUrl)}</a>
							</div>
						</div>` : ""}
						${oemDesc ? `
						<div class="detail-item">
							<i class="fa fa-file-lines text-warning"></i>
							<div class="detail-text">
								<label>OEM Description</label>
								<span class="ellipsis" title="${frappe.utils.escape_html(oemDesc)}">${frappe.utils.escape_html(oemDesc)}</span>
							</div>
						</div>` : ""}
					`;

					renderRightCard(
						`<div class="sla-title pl-3 pr-3">
							<i class="fa fa-industry me-1" style="color: #0d6efd;"></i>
							<div class="sla-title-text">
								<div class="">OEM Details</div>
							</div>
						</div>`,
						html
					);
				});

				// ------------------- ACTIVITY TIMELINE -------------------
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
						method: "renewal_module.custom_module.page.ticket.ticket.add_custom_comment",
						args: {
							docname: issueName,
							content: finalHtml
						},
						callback: function (r) {
							if (!r.exc) {
								frappe.show_alert({ message: "Comment added", indicator: "green" });
								$("#new-comment-input").html("<p><br></p>");
								loadActivityTimeline(issueName);
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

				// Keep the placeholder hidden when content exists (since we are not initializing full Quill here)
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
					method: "renewal_module.custom_module.page.ticket.ticket.get_enabled_users",
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
								html = `<p class="text-muted text-center">No activity found for this issue.</p>`;
							}

							container.html(html);
						}
					});
				}
				loadActivityTimeline(issue.name);


				function renderRightCard(title, content, titleButtonHTML = "") {
					rightCol.show();
					leftCol.removeClass("col-lg-12").addClass("col-lg-8");

					const $infoCard = rightCol.find("#ticket-info-card");
					if ($infoCard.length) {
						$infoCard.find(".sla-title").html(title);
						$infoCard.find(".sla-extra-btn").remove();
						if (titleButtonHTML) {
							$infoCard.find(".sla-header .d-flex.align-items-center.gap-1.flex-shrink-0").append(`<span class="sla-extra-btn">${titleButtonHTML}</span>`);
						}
						$infoCard.find(".sla-body").html(content);
					} else {
						const $panel = rightCol.find(".ticket-detail-panel").first();
						const $panelInfoCard = $panel.find("#ticket-panel-info-card");
						if ($panel.length && $panelInfoCard.length) {
							const prevState = {
								tabsHidden: $panel.find(".panel__tabs").hasClass("d-none"),
								headerHidden: $panel.find(".panel__header").hasClass("d-none"),
								cardsHidden: $panel.find("#ticket-panel-cards-section").hasClass("d-none"),
								formHidden: $panel.find("#ticket-panel-form-section").hasClass("d-none"),
							};
							if ($panelInfoCard.hasClass("d-none") || !$panel.data("ticketPanelPrevState")) {
								$panel.data("ticketPanelPrevState", prevState);
							}

							$panel.find("#ticket-panel-info-title").html(title || "Details");
							$panel.find("#ticket-panel-info-content").html(content || "");

							$panel.find(".panel__tabs, .panel__header, #ticket-panel-cards-section, #ticket-panel-form-section").addClass("d-none");
							$panelInfoCard.removeClass("d-none");

							$panel.off("click.ticketPanelInfo", "#ticket-panel-info-close").on("click.ticketPanelInfo", "#ticket-panel-info-close", function () {
								const saved = $panel.data("ticketPanelPrevState") || {};
								$panelInfoCard.addClass("d-none");
								if (saved.tabsHidden) $panel.find(".panel__tabs").addClass("d-none"); else $panel.find(".panel__tabs").removeClass("d-none");
								if (saved.headerHidden) $panel.find(".panel__header").addClass("d-none"); else $panel.find(".panel__header").removeClass("d-none");
								if (saved.cardsHidden) $panel.find("#ticket-panel-cards-section").addClass("d-none"); else $panel.find("#ticket-panel-cards-section").removeClass("d-none");
								if (saved.formHidden) $panel.find("#ticket-panel-form-section").addClass("d-none"); else $panel.find("#ticket-panel-form-section").removeClass("d-none");
								$panel.removeData("ticketPanelPrevState");
							});
						}
					}
					showRightPanelModal(title, `<div class="card sla-compare-card p-2"><div class="sla-body">${content}</div></div>`, titleButtonHTML);
				}

				//time logs button click handler
				$(document).off("click", "#time-logs-btn, .time-logs-btn").on("click", "#time-logs-btn, .time-logs-btn", function () {
					const esc = (val) => frappe.utils.escape_html(val || "");
					const logs = Array.isArray(issue.custom_issue_time_log)
						? issue.custom_issue_time_log.slice()
						: [];

					logs.sort((a, b) => {
						const aTime = a.from_time ? new Date(a.from_time.replace(" ", "T")).getTime() : 0;
						const bTime = b.from_time ? new Date(b.from_time.replace(" ", "T")).getTime() : 0;
						return bTime - aTime;
					});

					const formatStamp = (value) => {
						if (!value) return "-";
						return frappe.datetime.str_to_user(value);
					};

					const formatDuration = (log) => {
						const parseStamp = (value) => {
							if (!value) return null;
							const parsed = new Date(value.replace(" ", "T"));
							return Number.isNaN(parsed.getTime()) ? null : parsed;
						};

						const formatParts = (parts) => {
							const output = [];
							if (parts.months) output.push(`${parts.months}mo`);
							if (parts.days) output.push(`${parts.days}d`);
							if (parts.hours) output.push(`${parts.hours}h`);
							if (parts.minutes) output.push(`${parts.minutes}m`);
							if (parts.seconds || !output.length) output.push(`${parts.seconds}s`);
							return output.join(" ");
						};

						const formatHumanDuration = (totalSeconds) => {
							if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return "-";
							let remaining = Math.floor(totalSeconds);
							const secondsInMinute = 60;
							const secondsInHour = 60 * secondsInMinute;
							const secondsInDay = 24 * secondsInHour;
							const days = Math.floor(remaining / secondsInDay);
							remaining %= secondsInDay;
							const hours = Math.floor(remaining / secondsInHour);
							remaining %= secondsInHour;
							const minutes = Math.floor(remaining / secondsInMinute);
							const seconds = remaining % secondsInMinute;
							return formatParts({ months: 0, days, hours, minutes, seconds });
						};

						const formatCalendarDuration = (startDate, endDate) => {
							if (!startDate || !endDate || endDate <= startDate) return "-";
							let current = new Date(startDate.getTime());
							let months = 0;
							while (true) {
								const next = new Date(current.getTime());
								next.setMonth(next.getMonth() + 1);
								if (next <= endDate) {
									months += 1;
									current = next;
								} else {
									break;
								}
							}

							let remaining = Math.floor((endDate - current) / 1000);
							const secondsInMinute = 60;
							const secondsInHour = 60 * secondsInMinute;
							const secondsInDay = 24 * secondsInHour;
							const days = Math.floor(remaining / secondsInDay);
							remaining %= secondsInDay;
							const hours = Math.floor(remaining / secondsInHour);
							remaining %= secondsInHour;
							const minutes = Math.floor(remaining / secondsInMinute);
							const seconds = remaining % secondsInMinute;
							return formatParts({ months, days, hours, minutes, seconds });
						};

						// const startDate = parseStamp(log.from_time);
						// const endDate = parseStamp(log.to_time);
						// if (startDate && endDate) {
						// 	return formatCalendarDuration(startDate, endDate);
						// }

						if (log.time_duration) {
							if (typeof log.time_duration === "number") {
								return formatHumanDuration(log.time_duration);
							}
							// const raw = String(log.time_duration).trim();
							// if (/^\d+(\.\d+)?$/.test(raw)) {
							// 	return formatHumanDuration(Number(raw));
							// }
							// return raw;
						}

						return "-";
					};

					let html = `<div class="contact-details-modern space-y-3">`;

					if (logs.length) {
						logs.forEach((log) => {
							html += `
								<div class="time-log-entry p-3 mb-3 border rounded">
									<div class="d-flex align-items-center mb-2 gap-2">
										${log.user ? `
										<div class="avatar avatar-medium flex-shrink-0" title="${esc(log.user)}">
											<div class="avatar-frame standard-image" style="background-color: var(--dark-green-avatar-bg, #e2f2e6); color: var(--dark-green-avatar-color, #1b5e20)">
												${esc(log.user).charAt(0).toUpperCase()}
											</div>
										</div>
										` : ""}
										<div class="d-flex flex-column text-truncate" style="min-width: 0;">
											${log.user ? `<span class="fw-semibold text-dark text-truncate" title="${esc(log.user)}">${esc(log.user)}</span>` : ""}
											${log.time_duration ? `
											<span class="text-muted text-truncate" style="margin-top: 2px;">
												<i class="fa fa-hourglass-half text-primary me-1"></i> ${esc(formatDuration(log))}
											</span>` : ""}
										</div>
									</div>
									<div class="row">
										${log.from_time ? `
										<div class="col-12 col-md-12 col-xl-6 col-lg-6 mb-2 mb-md-0 text-truncate">
											<span class="text-muted text-uppercase d-block mb-1">From Time</span>
											<span class="text-dark fw-medium" title="${esc(formatStamp(log.from_time))}"><i class="fa fa-clock text-info me-1"></i>${esc(formatStamp(log.from_time))}</span>
										</div>` : ""}
										${log.to_time ? `
										<div class="col-12 col-md-12 col-xl-6 col-lg-6 text-truncate">
											<span class="text-muted text-uppercase d-block mb-1">Till Time</span>
											<span class="text-dark fw-medium" title="${esc(formatStamp(log.to_time))}"><i class="fa fa-stop-circle text-warning me-1"></i>${esc(formatStamp(log.to_time))}</span>
										</div>` : ""}
									</div>
								</div>
							`;
						});
					} else {
						html += `<p class="text-muted text-center mb-0">No time logs found.</p>`;
					}

					html += `</div>`;

					renderRightCard("Time Logs", html);
				});
				// --- Assigned Users Avatars ---
				async function loadAssignUsers(issue) {
					const res = await frappe.call({
						method: "renewal_module.custom_module.page.ticket.ticket.get_assignable_users",
						args: { issue_name: issue.name }
					});

					let users = [];
					const raw = res.message || [];

					raw.forEach(r => {
						r.user?.forEach(u => {
							if (u._assign) {
								users.push(...JSON.parse(u._assign));
							}
						});
					});
					// remove duplicates
					users = [...new Set(users)];
					// fetch user details
					const userMap = await fetchUserDetails(users);
					renderAssignUserAvatars(userMap);
				}

				async function fetchUserDetails(userIds) {
					if (!userIds.length) return [];

					const res = await frappe.call({
						method: "renewal_module.custom_module.page.ticket.ticket.get_users_basic_info",
						args: {
							users: userIds
						}
					});

					return (res.message || []).map(u => ({
						id: u.name,
						full_name: u.full_name || u.name,
						image: u.user_image ? frappe.utils.get_file_link(u.user_image) : null
					}));
				}


				function renderAssignUserAvatars(users) {
					const container = document.getElementById("ticket-details-assign-users");
					if (!container) return;

					container.innerHTML = buildAvatarGroup(users);
				}

				function buildAvatarGroup(users) {
					if (!users.length) return "";

					const visible = users.slice(0, 3);
					const extra = users.length - visible.length;

					return `
						<div style="display:flex;align-items:center;">
							${visible.map((u, i) => `
								<div class="avatar-item"
									title="${frappe.utils.escape_html(u.full_name)}"
									style="margin-left:${i === 0 ? 0 : "0px"}">
									${buildAvatar(u)}
								</div>
							`).join("")}

							${extra > 0 ? `
								<div class="extra-avatar"
									title="${users.slice(3).map(u => u.full_name).join(", ")}">
									+${extra}
								</div>
							` : ""}
						</div>
					`;
				}

				function buildAvatar(user) {
					if (user.image) {
						return `
							<img src="${user.image}">
						`;
					}

					return `
						<span style="display:flex;align-items:center;justify-content:center;
							width:32px;height:32px;border-radius:50%;
							background:#4A81D4;color:#fff;font-size:10px;font-weight:600;">
							${getInitials(user.full_name)}
						</span>
					`;
				}

				function getInitials(name) {
					const parts = (name || "User").trim().split(/\s+/);
					return ((parts[0]?.[0] || "U") + (parts[1]?.[0] || "")).toUpperCase();
				}
				loadAssignUsers(issue);



			}
		});
	}


	//new ticket methods

	bind_issue_form_events() {
		// if (window.issue_form_initialized) {
		// 	console.log("Issue form already initialized — skipping duplicate init");
		// 	return;
		// }
		// window.issue_form_initialized = true;
		//const STORAGE_KEY = "support_issue_form";
		console.log("Binding New Issue form events...");
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
		//document.getElementById("subject-field").innerHTML = "";
		let subjectControl = frappe.ui.form.make_control({
			parent: document.getElementById("subject-field"),
			df: { fieldtype: "Data", reqd: 1, label: "Subject" },
			render_input: true
		});

		let selectedSalesperson = "";
		// when customer changes, filter contact list users
		//document.getElementById("customer-field").innerHTML = "";
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
									status: ["in", ["Active", "Cofed"]],

								},
								ignore_user_permissions: 1,
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
								console.log("salesperson:", selectedSalesperson);
							} else {
								selectedSalesperson = "";
								console.log("No account manager found for this customer.");
							}
						});

					} else {
						console.log("No customer selected. Resetting salesperson and clearing filters.");
						selectedSalesperson = "";
					}
					//saveFormState();
				}

			},
			render_input: true
		});

		//document.getElementById("department-field").innerHTML = "";
		let departmentControl = frappe.ui.form.make_control({
			parent: document.getElementById("department-field"),
			df: {
				fieldtype: "Select",
				options: ["", "Technical", "Accounts Team & Billing", "Sales", "Demo", "Other", "Licence Activation"],
				reqd: 1,
				label: "Department",
				onchange: function () {
					toggleSubscriptionAndQueryType();
					//saveFormState();
				}
			},
			render_input: true
		});

		function setControlRequired(control, required) {
			if (!control) return;
			control.df.reqd = required ? 1 : 0;
			if (control.refresh) control.refresh();
			if (control.$wrapper) {
				control.$wrapper.find(".control-label").toggleClass("reqd", !!required);
			}
		}

		function toggleSubscriptionAndQueryType() {
			const cust = customerControl.get_value();
			const dept = departmentControl.get_value();

			if (cust && dept === "Technical") {
				// Show fields
				activesubscriptionwrapper.style.display = "block";
				querytypewrapper.style.display = "block";
				setControlRequired(activesubscriptionControl, true);
				setControlRequired(querytypeControl, true);
			} else {
				// Hide fields
				activesubscriptionwrapper.style.display = "none";
				querytypewrapper.style.display = "none";
				setControlRequired(activesubscriptionControl, false);
				setControlRequired(querytypeControl, false);
			}
		}

		document.getElementById("activesubscription-field").innerHTML = "";
		let activesubscriptionControl = frappe.ui.form.make_control({
			parent: document.getElementById("activesubscription-field"),
			df: { fieldtype: "Select", options: "", label: "Active Subscription" },
			render_input: true
		});


		let descriptionControl = frappe.ui.form.make_control({
			parent: document.getElementById("description-field"),
			df: { fieldtype: "Text Editor", label: "Description", reqd: 1 },
			render_input: true
		});

		let querytypeControl = frappe.ui.form.make_control({
			parent: document.getElementById("querytype-field"),
			df: { fieldtype: "Select", options: ["", "Installation", "Configuration", "Update", "Others"], label: "Query Type" },
			render_input: true
		});
		const otherQueryWrapper = document.getElementById("other-query-field");

		function toggleQueryTypeFields() {
			const selectedQueryType = querytypeControl.get_value();
			const isOther = selectedQueryType === "Others";

			if (otherQueryWrapper) {
				otherQueryWrapper.style.display = isOther ? "block" : "none";
			}
			if (!isOther && otherquerytypeControl) {
				otherquerytypeControl.set_value("");
			}
		}

		querytypeControl.$input.on("change", function () {
			const selectedQueryType = querytypeControl.get_value();
			console.log("Query Type selected:", selectedQueryType);
			toggleQueryTypeFields();

			if (taskMetaMap[selectedQueryType]) {
				const meta = taskMetaMap[selectedQueryType];
				selectedPriority = meta.priority || "";
				selectedSupportType = meta.support_type || "";
				console.log(`Auto-filled priority: ${selectedPriority}, support type: ${selectedSupportType}`);
			} else {
				selectedPriority = "";
				selectedSupportType = "";
			}
		});

		let otherquerytypeControl = frappe.ui.form.make_control({
			parent: document.getElementById("other-query-field"),
			df: { fieldtype: "Data", label: "Please specify query type" },
			render_input: true
		});

		if (otherQueryWrapper) {
			otherQueryWrapper.style.display = "none";
		}
		toggleQueryTypeFields();

		let selectedPriority = "";
		let selectedSupportType = "";
		let taskMetaMap = {}; // Store task metadata for each query type
		// querytypeControl.$input.on("change", saveFormState);
		// activesubscriptionControl.$input.on("change", saveFormState);
		// subjectControl.$input.on("change input", saveFormState);
		// descriptionControl.editor?.on("input", saveFormState);

		function setupContactPersonSection(me) {
			const contactContainer = $("#contact-list-container");
			const addButton = $("#add-contact-person");

			let contactList = [];


			function renderContactList() {
				if (!contactList.length) {
					contactContainer.html(`<span class="text-muted">No contacts added.</span>`);
					return;
				}

				let html = "";
				contactList.forEach((row, i) => {
					const name = (row.user_name || "").split("-")[0].trim();
					const email = row.email_id || "";
					const mobile = row.mobile_no || "";
					const designation = row.designation || "";
					const nameEsc = frappe.utils.escape_html(name);
					const emailEsc = frappe.utils.escape_html(email);
					const mobileEsc = frappe.utils.escape_html(mobile);
					const designationEsc = frappe.utils.escape_html(designation);
					html += `
					<div class="contact-row" data-index="${i}">
						<div class="d-flex align-items-center mb-1 gap-1 contact-header" data-index="${i}" style="cursor:pointer;">
							<i class="fa fa-check-circle contact-tpoc-icon
								${row.tpoc ? "text-success" : "text-muted invisible"}">
							</i>
							<span class="contact-name me-1 text-truncate" title="${nameEsc}">${nameEsc}</span>
							<i class="fa fa-trash-can text-danger delete-contact" data-index="${i}" style="cursor:pointer;"></i>
						</div>
						<div class="contact-details ms-4 mb-2 d-none" data-index="${i}">
							${email ? `<div class="contact-detail-line"><span class="text-muted">Email:</span> <span class="ellipsis" title="${emailEsc}">${emailEsc}</span></div>` : ""}
							${mobile ? `<div class="contact-detail-line"><span class="text-muted">Mobile:</span> <span class="ellipsis" title="${mobileEsc}">${mobileEsc}</span></div>` : ""}
							${designation ? `<div class="contact-detail-line"><span class="text-muted">Designation:</span> <span class="ellipsis" title="${designationEsc}">${designationEsc}</span></div>` : ""}
						</div>
					</div>`;
				});
				contactContainer.html(html);
			}

			$(document).off("click", ".delete-contact").on("click", ".delete-contact", function (e) {
				e.preventDefault();
				e.stopPropagation();
				const index = $(this).data("index");
				contactList.splice(index, 1);
				renderContactList();
				saveFormState();
			});

			$(document).off("click", "#contact-list-container .contact-header").on("click", "#contact-list-container .contact-header", function () {
				const index = $(this).data("index");
				const $details = contactContainer.find(`.contact-details[data-index='${index}']`);
				const isVisible = !$details.hasClass("d-none");
				contactContainer.find(".contact-details").addClass("d-none");
				if (!isVisible) {
					$details.removeClass("d-none");
				}
			});

			me.getContactList = () => contactList;

			me.resetContactList = function () {
				contactList = [];
				renderContactList();
			};

			me.setContactList = function (list) {
				contactList = list || [];
				renderContactList();
			};

			addButton.off("click").on("click", function () {
				const selected_customer = customerControl.get_value();
				if (!selected_customer) {
					frappe.msgprint("Please select a Customer first.");
					return;
				}

				const normalizeEmail = (email) => String(email || "").trim().toLowerCase();
				const normalizeMobile = (mobile) => String(mobile || "").replace(/\D/g, "");

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
						},
						{
							label: "TPOC",
							fieldname: "tpoc",
							fieldtype: "Check",
							description: "Is this contact a Technical Point of Contact?",
							default: 0
						}
					],
					primary_action_label: __("Add"),
					primary_action(values) {
						if (!values.user_name) return;
						const incomingName = String(values.user_name || "").trim();
						const incomingEmail = normalizeEmail(values.email_id);
						const incomingMobile = normalizeMobile(values.mobile_no);

						if (contactList.some(c => String(c.user_name || "").trim() === incomingName)) {
							frappe.show_alert({ message: "Contact already added.", indicator: "orange" });
							dialog.hide();
							return;
						}

						if (incomingEmail && contactList.some(c => normalizeEmail(c.email_id) === incomingEmail)) {
							frappe.show_alert({ message: "A contact with the same Email is already added.", indicator: "orange" });
							dialog.hide();
							return;
						}

						if (incomingMobile && contactList.some(c => normalizeMobile(c.mobile_no) === incomingMobile)) {
							frappe.show_alert({ message: "A contact with the same Mobile No is already added.", indicator: "orange" });
							dialog.hide();
							return;
						}

						contactList.push({
							user_name: incomingName, mobile_no: values.mobile_no || "",
							email_id: values.email_id || "",
							designation: values.designation || "",
							tpoc: values.tpoc || 0
						});
						renderContactList();
						//saveFormState();
						dialog.hide();
					}
				});

				// Auto-fill on contact select
				dialog.fields_dict.user_name.df.onchange = async function () {
					const contact = dialog.get_value("user_name");
					if (!contact) return;

					const res = await frappe.db.get_doc("Contact", contact);
					if (res) {
						dialog.set_value("mobile_no", res.phone || res.mobile_no);
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
		}

		// Initialize contact section
		frappe.after_ajax(() => {
			setupContactPersonSection(me);
			//restoreFormState();
		});

		let activeRenewalsData = [];
		// When Active Subscription changes → fetch renewal list data + dynamic query type options
		activesubscriptionControl.$input.on("change", function () {
			const selected_item = activesubscriptionControl.get_value();
			const selected_customer = customerControl.get_value();
			console.log("Active Subscription changed:", selected_item, "for customer:", selected_customer);
			if (!selected_item || !selected_customer) {
				console.warn("Customer or subscription not selected, skipping data load.");
				activeRenewalsData = []; // clear stored data
				// reset query type to default
				//querytypeControl.df.options = ["", "Installation", "Configuration", "Update", "Others","Licence Activation"].join("\n");
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
						console.log("✅ Renewal List entry:", renewal);

						// Store active renewal data
						activeRenewalsData = [{
							item: renewal.product_name,
							start_date: renewal.start_date,
							end_date: renewal.end_date,
							quantity: renewal.total_quantity,
							amount: renewal.total_amount,
							renewal_id: renewal.name
						}];


					} else {
						console.log("No active renewals found for this selection.");
						activeRenewalsData = [];

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
			const custom_other_query_data = otherquerytypeControl.get_value();

			if (!subject || !customer || !department || !description || (department === "Technical" && (!custom_query_type || !activesubscription))) {

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
				custom_other_query_data,
				// ✅ Include child tables
				issue_contact_list: contact_list.map(row => {
					return {
						user_name: row.user_name,
						email_id: row.email_id || "",
						mobile_no: row.mobile_no || "",
						designation: row.designation || "",
						tpoc: row.tpoc || 0
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

			console.log("Submitting Issue doc:", new_issue_doc);

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

						console.log("✅ Issue created:", r.message);

						// ✅ Show success popup
						frappe.show_alert({
							message: __("Issue {0} created successfully.", [issue_name]),
							indicator: "green"
						}, 5);
						//localStorage.removeItem(STORAGE_KEY);

						// ✅ Redirect to Issue Theme Details page after 1 second
						setTimeout(() => {
							//window.location.href = `/app/ticket/${issue_name}`;
							frappe.set_route('ticket', issue_name);
						}, 1000);

						// Reset form fields (optional if you redirect anyway)
						form.reset();
						subjectControl.set_value("");
						customerControl.set_value("");
						departmentControl.set_value("");
						querytypeControl.set_value("");
						provisonalcontrol.set_value("");
						otherquerytypeControl.set_value("");
						descriptionControl.set_value("");
						selectedSalesperson = "";
						activesubscriptionControl.set_value("");
						activesubscriptionControl.df.options = "";
						if (me.resetContactList) me.resetContactList();
						activeRenewalsData = [];

					} else {
						statusBox.innerHTML = `<div class="alert alert-danger mt-2">Failed to create issue.</div>`;
					}
				},

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


frappe.tickets_page_template = {
	body: `
		<div class="wrapper ticket-wrapper">
			<div class="ticket-list-view d-none">

				<div class="row">
					<div class="col-12">
						<div class="page-title-head d-flex align-items-center">
							<div class="flex-grow-1">
								<h3 class="fs-xl fw-bold m-0">Ticket</h3>
							</div>
							<div class="text-end">
								<ol class="breadcrumb m-0 py-0" style="background-color: transparent;">
									<li class="breadcrumb-item"><a href="javascript: void(0);">Support</a></li>
									<li class="breadcrumb-item active">Ticket</li>
								</ol>
							</div>
						</div>
					</div>
				</div>	
				
				<div class="row mt-3">
					<div class="col-12">

						<div id="status-summary" class="status-summary mb-3"></div>

						<div class="controls-wrapper">
							<div class="controls">
									<div class="left-controls">
										<div class="working-agent-dropdown-wrapper">
											<div class="control-select placeholder" id="filterstatus" data-table-filter="status" data-placeholder="status">
												<span id="status-display">status</span>
											</div>
											<div id="status-dropdown" class="working-agent-dropdown">
												<div class="working-agent-search-box">
													<input type="text" id="status-search-dropdown" placeholder="Search status..." />
												</div>
												<div id="status-options-dropdown">
													<!-- Status options will be populated here -->
												</div>
											</div>
										</div>

										<select id="filterPriority" class="control-select placeholder" data-table-range-filter="priority">
										<option value="">priority</option>
										<option value="Low">Low</option>
										<option value="Medium">Medium</option>
										<option value="High">High</option>
									</select>

									<div class="working-agent-dropdown-wrapper">
										<div class="control-select placeholder" id="filterworkingagent" data-table-range-filter="working_agents" data-placeholder="working agents">
											<span id="working-agent-display">working agents</span>
										</div>
										<div id="working-agent-dropdown" class="working-agent-dropdown">
											<div class="working-agent-search-box">
												<input type="text" id="agent-search-dropdown" placeholder="Search agents..." />
											</div>
											<div id="agent-options-dropdown">
												<!-- Agent options will be populated here -->
											</div>
										</div>
									</div>
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

									<a id="new-ticket-btn" href="/app/ticket/new-tickets" class="btn btn-sm btn-primary1 mr-2">
										<i class="fa fa-plus me-1"></i> New Ticket
									</a>
									
									<div class="dropdown d-none" id="actions-dropdown">
										<button class="btn btn-secondary1 dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">
											Actions
										</button>
										<ul class="dropdown-menu">
											<li class="user-action"><a class="dropdown-item" href="#" data-action="set_open">Set as Open</a></li>
											<li class="user-action"><a class="dropdown-item" href="#" data-action="set_closed">Set as Closed</a></li>
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

						<div class="table-container mt-2">
							<table id="ticketsTable" class="tickets-table">
								<thead>
									<tr>
										<th>
										<input id="selectAllTickets" type="checkbox" />
										</th>
										<th>ID</th>
										<th title="Subject">Subject</th>
										<th title="Priority">Priority</th>
										<th title="Customer">Customer</th>
										<th title="Query Type">Query Type</th>
										<th title="Status">Status</th>
										<th title="Created On">Created On</th>
										<th title="Assign Agent">Assign Agent</th>
										<th title="Assigned To">Assigned To</th>
										<th title="SLA Due Time">SLA Due Time</th>
										<th class="text-center ellipsis" id="count-header" title="0 of 0">
											<span id="visible-count">0</span> of <span id="total-count">0</span>
										</th>
									</tr>
								</thead>
								<tbody>
								</tbody>
							</table>
						</div>
						

						<div class="d-flex justify-content-between align-items-center mt-2">
							<div class="list-paging-area d-flex justify-content-between align-items-center w-100">
								<div class="p-2">
									<div class="btn-group">
										<button type="button" class="btn btn-default1 btn-light btn-sm btn-paging" data-value="20">20</button>
										<button type="button" class="btn btn-default1 btn-light btn-sm btn-paging" data-value="100">100</button>
										<button type="button" class="btn btn-default1 btn-light btn-sm btn-paging" data-value="500">500</button>
										<button type="button" class="btn btn-default1 btn-light btn-sm btn-paging" data-value="2500">2500</button>
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

			<div class="ticket-details-view d-none">
				<div classs="row">
					<div class="col-12">
						<div class="ticket-header">
							<div class="ticket-breadcrumb">
								<h3 class="page-title">Ticket</h3>
								<ol class="breadcrumb">
									<li class="breadcrumb-item">
										<a href="javascript:void(0)">Support</a>
									</li>
									<li class="breadcrumb-item">
										<a href="/app/ticket">Ticket</a>
									</li>
								</ol>
							</div>
						</div>
					</div>
				</div>
				<div class="row">
					<div class="col-12">	
						<div class="ticket-meta mt-3">
							<div class="ticket-title d-flex align-items-center gap-2" style="min-width:0;">
								<span id="name" class="ticket-id" style="white-space:nowrap;">#SUP-2523</span>
								<span class="separator" style="white-space:nowrap;">—</span>
								<span
									class="ticket-subject" id="customer"
									style="display:inline-block; min-width:0; max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"
									title="App freezes when uploading files">
									App freezes when uploading files
								</span>
							</div>

							<div class="d-flex align-items-center flex-wrap gap-2 mt-2" style="row-gap:8px;">
								

								<div class="d-flex align-items-center gap-2 ms-auto" style="min-width:max-content;">
									<div id="ticket-details-assign-users"></div>
									
									<div class="dropdown" id="ticket-status-actions-dropdown">
										<button class="btn btn-default2 btn-navblue btn-sm dropdown-toggle" type="button" data-bs-toggle="dropdown">
											Actions
										</button>
										<ul class="dropdown-menu dropdown-menu-end">
											<li>
												<a class="dropdown-item" href="#" data-action="set_assign_user">Assign ToDo</a>
											</li>
											<li>
												<a class="dropdown-item" href="#" data-action="set_working_agent">Set Assign agent</a>
											</li>
											<li>
												<a class="dropdown-item" href="#" data-action="set_client_input_pending">Set Client Input Pending</a>
											</li>
											<li>
												<a class="dropdown-item" href="#" data-action="set_oem_escalated">Set OEM Escalated</a>
											</li>
											<li>
												<a class="dropdown-item" href="#" data-action="set_resolved">Set Resolved</a>
											</li>
										</ul>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>	

					

				<div class="row">
					<div class="leftcol">
						<div class="card" style="border:none;background:transparent;">
							<div class="ticket-card-header mb-3">
								<!-- Left : Subject + Priority -->
								<div class="ticket-header-left">
									<h5 class="ticket-subject-line">
										<span
											id="subject"
											class="ticket-subject"
											title=""
										></span>
										<span class="mx-1">–</span>
										<span id="priority" class="priority-badge"></span>
									</h5>
								</div>

								<!-- Right : Status + Actions -->
								<div class="ticket-header-right d-flex align-items-center gap-2">
									<span id="issue-status" class="status-badge"></span>
								</div>

							</div>


							<div class="">

								<div id="issuedatadisplay"></div>

								<div class="row bg-white rounded p-3 mb-3" id="attachments-section">
									<div class="col-12">
										<div class="d-flex align-items-center gap-1">
											<h6 class="text-uppercase text-muted1 mb-0">Attachments</h6>
											<button id="add-attachment-btn" class="btn btn-sm btn-outline-primary btn-default2" title="Add attachment">
												<i class="fa fa-plus"></i>
											</button>
										</div>
										<div id="issue-attachments-list" class="d-flex flex-wrap gap-1 mt-2 small text-muted">
											<span class="text-muted">No attachments yet</span>
										</div>
									</div>
								</div>

								<!-- Description -->
								
								<div class=" bg-white rounded p-3 mb-3" id="description-section">
									<div class="d-flex align-items-center justify-content-between mb-1" style="gap: 6px;">
										<h6 class="text-uppercase text-muted mb-0" 
											style="font-weight: 600; letter-spacing: 0.3px;">
										Description
										</h6>
										<button id="saveDescBtn" class="btn btn-success btn-sm d-none" title="Save Description" style="padding:0px 5px;">
											Save
										</button>


									</div>

									<div id="description-container" class="p-2 mb-3" style="border:1px solid #E7E9EB; border-radius:5px;">
										<p class="mb-1" id="description"></p>
									</div>

									
								</div>

								<div class="row d-flex d-lg-none">
									<div class="col-12 bg-white rounded p-3 mb-3">
										<h6 class="text-uppercase text-muted mb-2 connections">Connections</h6>
										<div class="d-flex flex-wrap gap-2">
											<div class="tag-item d-flex align-items-center" data-doctype="issue">
												<span class="tag-texts fs-12 badge1 bg-light shadow-sm px-2 py-1 me-1 fw-semibold" style="cursor:pointer;">Quick view</span>
											</div>

											<div class="d-flex align-items-center" id="time-logs-btn">
												<span class="badge1 fs-12 bg-light shadow-sm px-2 py-1 me-1 fw-semibold" style="cursor:pointer;">Time logs</span>
											</div>

										</div>
									</div>
								</div>

	

								<div class="row bg-white rounded p-3 mb-3">
									<div class="col-12">
										<div id="resolution-description" class="p-2" style="border:1px solid #E7E9EB; border-radius:5px; min-height:50px; cursor:pointer; transition: background-color 0.2s;" 
											onmouseover="this.style.backgroundColor='#f8f9fa'" 
											onmouseout="this.style.backgroundColor='transparent'">
											<p class="mb-1"></p>
										</div>
									</div>
								</div>
								<div class="row bg-white rounded p-3 mb-3 hidden">

									<!-- Resolution Date/Time Info -->
									<div id="resolution-time-fields" class="d-flex flex-wrap gap-2 mt-1">
										<div id="col-opening-date" style="flex: 1 1 auto; min-width: 120px;">
											<div class="border rounded p-2 bg-light h-100 d-flex flex-column" style="font-size:12px;">
												<div class="text-muted mb-1" style="font-size:11px; font-weight:600; text-transform:uppercase;">Opening Date</div>
												<div id="res-opening-date" class="fw-semibold text-dark mt-auto">-</div>
											</div>
										</div>
										<div id="col-opening-time" style="flex: 1 1 auto; min-width: 120px;">
											<div class="border rounded p-2 bg-light h-100 d-flex flex-column" style="font-size:12px;">
												<div class="text-muted mb-1" style="font-size:11px; font-weight:600; text-transform:uppercase;">Opening Time</div>
												<div id="res-opening-time" class="fw-semibold text-dark mt-auto">-</div>
											</div>
										</div>
										<div id="col-resolution-date" style="flex: 1 1 auto; min-width: 120px;">
											<div class="border rounded p-2 bg-light h-100 d-flex flex-column" style="font-size:12px;">
												<div class="text-muted mb-1" style="font-size:11px; font-weight:600; text-transform:uppercase;">Resolution Date</div>
												<div id="res-resolution-date" class="fw-semibold text-dark mt-auto">-</div>
											</div>
										</div>
										<div id="col-resolution-time" style="flex: 1 1 auto; min-width: 120px;">
											<div class="border rounded p-2 bg-light h-100 d-flex flex-column" style="font-size:12px;">
												<div class="text-muted mb-1" style="font-size:11px; font-weight:600; text-transform:uppercase;">Resolution Time</div>
												<div id="res-resolution-time" class="fw-semibold text-dark mt-auto">-</div>
											</div>
										</div>
										<div id="col-user-resolution-time" style="flex: 1 1 auto; min-width: 120px;">
											<div class="border rounded p-2 bg-light h-100 d-flex flex-column" style="font-size:12px;">
												<div class="text-muted mb-1" style="font-size:11px; font-weight:600; text-transform:uppercase;">User Resolution Time</div>
												<div id="res-user-resolution-time" class="fw-semibold text-dark mt-auto">-</div>
											</div>
										</div>
									</div>
								</div>

								<div class="row bg-white rounded p-3 mb-3">
									<div class="col-12">
										<div id="customer-description" class="p-2" style="border:1px solid #E7E9EB; border-radius:5px; min-height:50px; cursor:pointer; transition: background-color 0.2s;" 
											onmouseover="this.style.backgroundColor='#f8f9fa'" 
											onmouseout="this.style.backgroundColor='transparent'">
											<p class="mb-1"></p>
										</div>
									</div>
								</div>

								<div class="bg-white rounded p-3 mb-3">
									<div class="comment-section">
										<div class="comment-box mt-0">
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
								</div>

								<!-- Activity Section -->
								<div class="bg-white rounded p-3 mb-3">
									<h6 class="text-uppercase text-muted mb-4 activity">Activity:</h6>
									<div class="timeline" id="activity-timeline">
										<p class="text-muted">Loading activity...</p>
									</div>
								</div>

							</div>
						</div>
					</div> <!-- end col-->

					<div class="rightcol col-lg-4 d-none d-lg-flex flex-column">
						<!-- Activity panel: Notes, Tasks, Calls, Appointments tabs -->
						<aside class="ticket-detail-panel flex-grow-1">
							<div class="panel__tabs">
								<button class="ptab is-active" data-type="Notes" title="Notes"><span class="ptab__icon">📝</span><span class="ptab__label">Notes</span></button>
								<button class="ptab" data-type="Calls" title="Calls"><span class="ptab__icon">📞</span><span class="ptab__label">Calls</span></button>
								<button class="ptab" data-type="Appointments" title="Appointments"><span class="ptab__icon">📅</span><span class="ptab__label">Appointments</span></button>
								<button class="ptab" data-type="Tasks" title="Tasks"><span class="ptab__icon">✅</span><span class="ptab__label">Tasks</span></button>
							</div>
							<div class="panel__header">
								<div class="panel__subtitle" id="ticket-panel-subtitle">Notes</div>
								<button class="btn-panel-create" id="ticket-btn-panel-add"><i class="fa fa-plus"></i> Add</button>
							</div>
							<div id="ticket-panel-info-card" class="panel-person-card d-none">
								<div class="panel-person-head">
									<div class="panel-person-head-left">
										<div class="panel-person-title-wrap">
											<div class="panel-person-name" id="ticket-panel-info-title">Details</div>
										</div>
									</div>
									<button type="button" class="panel-person-close" id="ticket-panel-info-close">Close</button>
								</div>
								<div id="ticket-panel-info-content"></div>
							</div>
							<div class="panel__cards" id="ticket-panel-cards-section">
								<!-- Notes section (default visible) -->
								<div id="ticket-activity-notes-section" class="ticket-panel-section">
									<textarea id="quick-note-text" class="panel__input form-control mb-2" rows="2" placeholder="Write a quick note..."></textarea>
									<div class="d-flex justify-content-end mb-2">
										<button id="save-quick-note-btn" class="btn btn-sm btn-primary">Save Note</button>
									</div>
									<div id="main-notes-list">
										<div class="text-center p-3 text-muted small">Loading notes...</div>
									</div>
								</div>
								<!-- Tasks section -->
								<div id="ticket-activity-tasks-section" class="ticket-panel-section d-none">
									<div id="activity-tasks-container"></div>
								</div>
								<!-- Calls section -->
								<div id="ticket-activity-calls-section" class="ticket-panel-section d-none">
									<div id="activity-calls-container"></div>
								</div>
								<!-- Appointments section -->
								<div id="ticket-activity-appointments-section" class="ticket-panel-section d-none">
									<div id="activity-appointments-container"></div>
								</div>
							</div>
							<div id="ticket-panel-form-section" class="panel__form d-none">
								<div class="panel__form-head d-flex justify-content-between align-items-center mb-2">
									<div class="panel__form-title" id="ticket-panel-form-title">New Activity</div>
									<button type="button" class="btn btn-sm btn-light" id="ticket-btn-panel-close"><i class="fa fa-times"></i></button>
								</div>
								<div id="ticket-panel-form-body"></div>
								<div class="d-flex justify-content-end gap-2 mt-2">
									<button type="button" class="btn btn-sm btn-primary" id="ticket-panel-save-btn">Save</button>
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
								<div id="appointments-card" class="card mb-0 flex-fill d-flex flex-column border-0">
									<div class="card-title card-header">
										<div class="mt-2">
											<div class="" role="group" id="appointments-card-tabs" aria-label="Appointment filters">
												<button type="button" class="btn btn-outline-secondary appointment-tab active" data-appointment-filter="all">All</button>
												<button type="button" class="btn btn-outline-secondary appointment-tab" data-appointment-filter="open">Open</button>
												<button type="button" class="btn btn-outline-secondary appointment-tab" data-appointment-filter="unverified">Unverified</button>
												<button type="button" class="btn btn-outline-secondary appointment-tab" data-appointment-filter="closed">Closed</button>
											</div>
										</div>
									</div>
									<div class="card-body flex-grow-1"></div>
									<div class="card-footer" id="appointments-card-load-more" style="cursor:pointer;text-align:center;">Load More</div>
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

					<div class="modal fade" id="mobile-sla-modal" tabindex="-1" aria-hidden="true">
						<div class="modal-dialog modal-dialog-centered modal-lg">
							<div class="modal-content">
								<div class="modal-header p-3">
									<h5 class="modal-title"></h5>
									<div class="modal-actions ms-auto d-flex align-items-center gap-2"></div>
									<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close">
										<i class="fa fa-close"></i>
									</button>
								</div>
								<div class="modal-body p-0"></div>
							</div>
						</div>
					</div>

					
				</div>


			</div>

			<div class="new-tickets d-none">
				<div class="row">
					<div class="col-12">
						<div class="ticket-header">
							<div class="ticket-breadcrumb">
								<h3 class="page-title">Ticket</h3>
								<ol class="breadcrumb">
									<li class="breadcrumb-item">
										<a href="javascript:void(0)">Support</a>
									</li>
									<li class="breadcrumb-item">
										<a href="/app/ticket">Ticket</a>
									</li>
								</ol>
							</div>
						</div>	
					</div>
				</div>

				<div class="row mt-3">
					<div class="card w-100" style="min-height:80vh;">
						<div class="card-body p-2" style="padding:5px;">
							<h5 class="mb-1">New Issue</h5>
							<form id="new-issue-form">
								<div class="row">
									<div class="col-12 col-md-6">
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
										<div class="mb-3" id="other-query-field"></div>
									</div>
								</div>

								<div class="row">
									<div class="col-6">
										<div class="mb-3">
											<label class="control-label reqd">
												Contact Person <span style="color:#eb9091">*</span>
												<i id="add-contact-person" class="fa fa-plus text-primary ms-1" style="cursor:pointer;" title="Add Contact"></i>
											</label>
											<div id="contact-list-container" class="ps-2 gap-2"></div>
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
							©<span class="fw-semibold footer-text">64 Network Security Pvt Ltd</span> 
						</div>
					</div>
				</div>
			</footer>
		</div>	
		
	`
}