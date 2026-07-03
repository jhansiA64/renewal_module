frappe.pages['opp-list'].on_page_load = function (wrapper) {
	new OppListPage(wrapper);
};

frappe.pages['opp-list'].on_page_show = function (wrapper) {

	if (!frappe._olFilterPopoverCleanup) {
	frappe._olFilterPopoverCleanup = true;
		const sweep = () => {
			$("body > .popover.filter-popover, body > .popover.show").remove();
			try { $("#olOpenFilters, #qlOpenFilters, #sqOpenFilters").popover("dispose"); } catch (e) {}
		};
		if (frappe.router && frappe.router.on) frappe.router.on("change", sweep);
		$(window).on("popstate.filterSweep", sweep);
	}
	const pageWrapper = wrapper || $(".page")[0] || document.body;
	$("body").attr("data-route", "opp-list");
	ensureOppListAssets();

	const ensureSupportLayoutLoaded = (cb) => {
		if (typeof loadSupportLayout === "function") return cb();
		frappe.require(["/assets/renewal_module/js/issue_themes/support_layout2.js"], () => {
			setTimeout(cb, 10);
		});
		frappe.require(["/assets/renewal_module/css/issue_themes/support_theme2.css"]);
	};

	ensureSupportLayoutLoaded(() => {
		loadSupportLayout(pageWrapper, () => {
			if (!frappe.opp_list_page || frappe.opp_list_page.wrapper !== pageWrapper) {
				frappe.opp_list_page = new OppListPage(pageWrapper);
			}
			frappe.opp_list_page.render();
		});
	});
};

function ensureOppListAssets() {
	const stylesheets = [
		"https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700&family=DM+Sans:wght@300;400;500&display=swap",
		"https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css",
	];
	stylesheets.forEach((href) => {
		if (document.querySelector(`link[href="${href}"]`)) return;
		const link = document.createElement("link");
		link.rel = "stylesheet";
		link.href = href;
		document.head.appendChild(link);
	});
}


class OppListPage {
	constructor(wrapper) {
		this.wrapper = wrapper;
		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: "",
			single_column: true,
		});

		// List state
		this.hasFetched = false;
		this.hasFetchedOwners = false;
		this.isLoading = false;
		this.statusFilter = "";
		this.selectedCustomers = [];
		this.selectedOwners = [];
		this.ownerOptions = [];
		this.saved_filters = [];
		this.filterDoctype = "Opportunity";
		this.activeFilterPopoverButton = null;
		this.amountSortDir = "";
		this.pageSize = 20;
		this.pageStep = 20;
		this.records = [];

		// Detail state
		this.selectedRecord = null;
		this.detailRecord = null;
		this.detailActivities = [];
		this.detailAttachments = [];
		this.isLoadingDetail = false;
		this.detailItems = [];
		this.activeTab = "notes";
		this.activeFilter = "scheduled";
		this.currentStage = 0;

		this.tabConfig = {
			notes: { label: "+ Add Note", icon: "ti-notes", inputId: "inputNotes" },
			calls: { label: "+ Log Call", icon: "ti-phone", inputId: "inputCalls" },
			tasks: { label: "+ Add Task", icon: "ti-checklist", inputId: "inputTasks" },
			appointments: { label: "+ Appointment", icon: "ti-calendar-event", inputId: "inputAppointments" },
			comments: { label: "+ Comment", icon: "ti-message-circle", inputId: "inputComments" },
			attachments: { label: null, icon: null, inputId: null },
		};

		// No workflow for opp-list
	}

	// ─── RENDER ENTRY ─────────────────────────────────────────────
	render() {
		const waitForContent = () => {
			const $content = $("#support-page-content");
			if (!$content.length) { setTimeout(waitForContent, 50); return; }
			this.$content = $content;
			const route = (frappe.get_route && frappe.get_route()) || [];
			const routeName = route.length > 1 ? String(route[1] || "").trim() : "";
			this.loadDataAndRender(routeName);
			this.setActiveSidebar();
		};
		waitForContent();
	}

	setActiveSidebar() {
		const route = frappe.get_route();
		const baseRoute = route[0]; // ""
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

	loadDataAndRender(routeName = "") {
		if (this.isLoading) return;
		this.isLoading = true;
		this.renderListLoading();

		Promise.all([this.fetchRecords(), this.fetchOwnerOptions()])
			.then(() => {
				if (routeName && routeName !== "new") {
					this.selectedRecord = this.records.find((r) => r.id === routeName) || null;
					this.detailRecord = null;
				} else {
					this.selectedRecord = null;
					this.detailRecord = null;
				}
				if (routeName === "new") return this.renderNewView();
				if (this.selectedRecord) return this.renderDetailView();
				this.applyUrlFilters();
				this.renderListView();

			})
			.finally(() => { this.isLoading = false; });
	}

	// ─── DATA FETCH ───────────────────────────────────────────────
	fetchOwnerOptions() {
		if (this.hasFetchedOwners) return Promise.resolve();
		return new Promise((resolve) => {
			frappe.call({
				method: "frappe.client.get_list",
				args: { doctype: "User", fields: ["name", "full_name"], filters: { enabled: 1 }, limit_page_length: 2000, order_by: "full_name asc" },
				callback: (r) => {
					this.ownerOptions = ((r && r.message) || []).map((row) => ({
						value: row.name,
						label: row.full_name ? `${row.full_name} (${row.name})` : row.name,
					}));
					this.hasFetchedOwners = true;
					resolve();
				},
				error: () => { this.ownerOptions = []; resolve(); },
			});
		});
	}

	fetchRecords() {
		if (this.hasFetched) return Promise.resolve();
		const callGetList = (limitStart, limitPageLength) => new Promise((resolve, reject) => {
			frappe.call({
				method: "frappe.client.get_list",
				args: {
					doctype: "Opportunity",
					fields: ["name", "title", "status", "customer_name", "owner", "opportunity_amount", "creation", "expected_closing"],
					limit_start: limitStart, limit_page_length: limitPageLength, order_by: "modified desc",
				},
				callback: (r) => resolve((r && r.message) || []),
				error: reject,
			});
		});

		let start = 0, allRows = [];
		const fetchNextPage = () => callGetList(start, 500).then((rows) => {
			allRows = allRows.concat(rows);
			if (rows.length < 500) return;
			start += 500;
			return fetchNextPage();
		});

		return fetchNextPage().then(() => {
			this.records = allRows.map((doc) => ({
				id: doc.name,
				subject: doc.title || doc.name,
				party: doc.customer_name || "-",
				status: doc.status || "Open",
				amount: Number(doc.opportunity_amount || 0),
				owner: doc.owner || "-",
				creation: this.formatDate(doc.creation),
				expected_date: doc.expected_closing ? this.formatDate(doc.expected_closing) : "—",
			}));
			this.hasFetched = true;
		}).catch(() => { this.records = []; });
	}

	fetchDetailRecord(recordId) {
		return new Promise((resolve) => {
			frappe.call({
				method: "frappe.client.get",
				args: { doctype: "Opportunity", name: recordId },
				callback: (r) => { this.detailRecord = (r && r.message) || null; resolve(this.detailRecord); },
				error: () => { this.detailRecord = null; resolve(null); },
			});
		});
	}

	fetchDetailActivities(recordId) {
		return new Promise((resolve) => {
			Promise.all([

				// CRM Note — child table, read from detailRecord.notes
				// CRM Note — fetch as standalone docs for stable per-note timestamps
				new Promise(res => {

					const oppName = this.detailRecord?.name || this.selectedRecord?.id;

					if (!oppName) { res([]); return; }

					frappe.call({

						method: "renewal_module.custom_module.page.opp_list.opp_list.get_crm_notes",

						args: { parent: oppName },

						callback: r => {

							const docs = r.message || [];

							res(docs.map(c => {

								let when = "—";

								if (c.added_on) {

									try {

										when = frappe.datetime.str_to_obj(c.added_on).toLocaleString("en-IN", {

											day: "2-digit", month: "short", year: "numeric",

											hour: "2-digit", minute: "2-digit"

										});

									} catch (e) { when = String(c.added_on).slice(0, 16); }

								}

								return {

									id: c.name,

									title: this._htmlToText(c.note || ""),

									type: "Note", tab: "notes",

									owner: c.added_by || "",

									created: when,

									status: "completed", meta: ""

								};

							}));

						},

						error: () => res([]),

					});

				}),


				// Call List — get names first, then fetch each doc for subject
				new Promise(res => frappe.call({
					method: "frappe.client.get_list",
					args: {
						doctype: "Call List",
						fields: ["name", "owner", "creation"],
						filters: [
							["Call List", "reference", "=", "Opportunity"],
							["Call List", "reference_to", "=", recordId],
						],
						limit_page_length: 100,
						order_by: "creation desc",
					},
					callback: r => {
						const rows = r.message || [];
						if (!rows.length) { res([]); return; }

						// Fetch each doc to get subject
						Promise.all(rows.map(row =>
							new Promise(resDoc => frappe.call({
								method: "frappe.client.get",
								args: { doctype: "Call List", name: row.name },
								callback: rd => resDoc(rd.message || row),
								error: () => resDoc(row),
							}))
						)).then(docs => {
							res(docs.map(c => ({
								id: c.name,
								title: c.subject || c.name,
								type: "Call", tab: "calls",
								owner: c.owner || "",
								created: this.formatActivityTime(c.creation),
								status: (c.status === "Scheduled" ? "scheduled" : "completed"),
								meta: c.start_date
									? `${c.start_date}${c.start_timing ? " " + c.start_timing : ""}`
									: ""
							})));
						});
					},
					error: () => res([])
				})),

				// Appointment — get names first, then fetch each doc for subject
				new Promise(res => frappe.call({
					method: "frappe.client.get_list",
					args: {
						doctype: "Appointment",
						fields: ["name", "owner", "creation"],
						filters: [
							["Appointment", "reference", "=", "Opportunity"],
							["Appointment", "reference_to", "=", recordId],
						],
						limit_page_length: 100,
						order_by: "creation desc",
					},
					callback: r => {
						const rows = r.message || [];
						if (!rows.length) { res([]); return; }

						Promise.all(rows.map(row =>
							new Promise(resDoc => frappe.call({
								method: "frappe.client.get",
								args: { doctype: "Appointment", name: row.name },
								callback: rd => resDoc(rd.message || row),
								error: () => resDoc(row),
							}))
						)).then(docs => {
							res(docs.map(c => ({
								id: c.name,
								title: c.subject || c.name,
								type: "Appointment", tab: "appointments",
								owner: c.owner || "",
								created: this.formatActivityTime(c.scheduled_time || c.creation),
								status: c.status === "Closed" ? "completed" : "scheduled",
								meta: c.scheduled_time
									? new Date(c.scheduled_time).toLocaleString("en-IN", {
										day: "2-digit", month: "short",
										hour: "2-digit", minute: "2-digit"
									}) : ""
							})));
						});
					},
					error: () => res([])
				})),

				// Task — get names first, then fetch each doc
				new Promise(res => frappe.call({
					method: "frappe.client.get_list",
					args: {
						doctype: "Task",
						fields: ["name", "owner", "creation"],
						filters: [
							["Task", "reference", "=", "Opportunity"],
							["Task", "reference_to", "=", recordId],
						],
						limit_page_length: 100,
						order_by: "creation desc",
					},
					callback: r => {
						const rows = r.message || [];
						if (!rows.length) { res([]); return; }
						const today = frappe.datetime.get_today();
						Promise.all(rows.map(row =>
							new Promise(resDoc => frappe.call({
								method: "frappe.client.get",
								args: { doctype: "Task", name: row.name },
								callback: rd => resDoc(rd.message || row),
								error: () => resDoc(row),
							}))
						)).then(docs => {
							res(docs.map(c => {
								const endDay = c.exp_end_date ? String(c.exp_end_date).slice(0, 10) : "";
								return {
									id: c.name,
									title: c.subject || c.name,
									type: "Task", tab: "tasks",
									owner: c.owner || "",
									created: this.formatActivityTime(c.creation),
									status: (endDay && endDay >= today) ? "scheduled" : "completed",
									meta: [c.priority, c.exp_end_date ? this.formatDate(c.exp_end_date) : ""].filter(Boolean).join(" · "),
								};
							}));
						});
					},
					error: () => res([])
				})),

				// Comment — standard, known fields
				new Promise(res => frappe.call({
					method: "frappe.client.get_list",
					args: {
						doctype: "Comment",
						fields: ["name", "content", "comment_type", "owner", "creation"],
						filters: [
							["Comment", "reference_doctype", "=", "Opportunity"],
							["Comment", "reference_name", "=", recordId],
							["Comment", "comment_type", "=", "Comment"],
						],
						limit_page_length: 100,
						order_by: "creation desc",
					},
					callback: r => res((r.message || []).map(c => ({
						id: c.name,
						title: this._htmlToText(c.content || ""),
						type: "Comment", tab: "comments",
						owner: c.owner || "",
						created: this.formatActivityTime(c.creation),
						status: "completed", meta: ""
					}))),
					error: () => res([])
				})),

			]).then(([notes, calls, appointments, tasks, comments]) => {
				this.detailActivities = [...notes, ...calls, ...appointments, ...tasks, ...comments];
				resolve(this.detailActivities);
			});
		});
	}



	fetchDetailAttachments(recordId) {
		return new Promise((resolve) => {
			frappe.call({
				method: "frappe.client.get_list",
				args: {
					doctype: "File",
					fields: ["name", "file_name", "file_url", "file_size", "creation", "owner"],
					filters: {
						attached_to_doctype: "Opportunity",
						attached_to_name: recordId,
					},
					limit_page_length: 100,
					order_by: "creation desc",
				},
				callback: (r) => {
					const files = ((r && r.message) || []).map(f => ({
						id: f.name,
						name: f.file_name || f.name,
						url: f.file_url || "",
						size: f.file_size || 0,
						owner: f.owner || "",
						created: this.formatActivityTime(f.creation),
						description: "",   // filled below
					}));

					this.detailAttachments = files;

					if (!files.length) { resolve(files); return; }

					// Fetch Info comments for all file names to get descriptions
					const fileNames = files.map(f => f.id);
					frappe.call({
						method: "frappe.client.get_list",
						args: {
							doctype: "Comment",
							fields: ["name", "reference_name", "content"],
							filters: [
								["Comment", "comment_type", "=", "Info"],
								["Comment", "reference_doctype", "=", "File"],
								["Comment", "reference_name", "in", fileNames],
							],
							limit_page_length: 100,
						},
						callback: (rc) => {
							const descMap = {};
							(rc.message || []).forEach(c => {
								descMap[c.reference_name] = c.content || "";
							});
							this.detailAttachments.forEach(f => {
								f.description = descMap[f.id] || "";
							});
							resolve(this.detailAttachments);
						},
						error: () => resolve(this.detailAttachments),
					});
				},
				error: () => { this.detailAttachments = []; resolve([]); },
			});
		});
	}


	// ─── HELPERS ──────────────────────────────────────────────────
	mapActivityTypeToTab(type) { return { Note: "notes", Call: "calls", Appointment: "appointments", Comment: "comments" }[type] || "notes"; }
	getActivityIcon(type) { return { Note: "notes", Call: "phone", Appointment: "calendar-event", Comment: "message-circle" }[type] || "notes"; }

	formatActivityTime(timestamp) {
		if (!timestamp) return "Just now";
		try {
			const created = frappe.datetime ? frappe.datetime.str_to_obj(timestamp) : new Date(timestamp);
			if (!created) return "Just now";
			const s = Math.floor((Date.now() - created.getTime()) / 1000);
			const m = Math.floor(s / 60), h = Math.floor(m / 60), d = Math.floor(h / 24);
			if (s < 60) return "Just now"; if (m < 60) return `${m}m ago`; if (h < 24) return `${h}h ago`; if (d < 7) return `${d}d ago`;
			return created.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
		} catch (e) { return "Just now"; }
	}

	formatAge(value) {
		if (!value) return "-";
		try {
			const created = frappe.datetime ? frappe.datetime.str_to_obj(value) : new Date(value);
			if (!created) return "-";
			return `${Math.max(0, Math.floor((Date.now() - created.getTime()) / 86400000))}d`;
		} catch (e) { return "-"; }
	}

	formatDate(value) {
		if (!value) return "—";
		try {
			// frappe date strings: "YYYY-MM-DD" or "YYYY-MM-DD HH:MM:SS"
			const d = frappe.datetime ? frappe.datetime.str_to_obj(value) : new Date(value);
			if (!d) return "—";
			return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
		} catch (e) { return "—"; }
	}

	formatCurrency(value) {
		return `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
	}

	getStatusClass(status) {
		return { "Open": "ol-status-open", "Quotation": "ol-status-quotation", "Closed Won": "ol-status-won", "Closed Lost": "ol-status-lost", "Converted": "ol-status-converted" }[status] || "ol-status-open";
	}

	escapeAttr(value) {
		return String(value || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
	}

	getCustomerAvatarText(name) {
		const raw = String(name || "").trim();
		if (!raw || raw === "-") return "NA";
		const parts = raw.split(/\s+/).map((p) => p.replace(/[^A-Za-z0-9]/g, "")).filter(Boolean);
		if (!parts.length) return "NA";
		if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
		return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
	}

	// ─── LIST LOADING PLACEHOLDER ─────────────────────────────────
	renderListLoading() {
		this.page.set_title("Opportunities");
		document.title = "Opportunities";
		$("#support-page-content").removeClass("ol-content-scroll").addClass("ol-content-fixed");
		this.$content.html(`<div class="ol-list-view"><div class="card ql-list-card"><div class="ol-loading">Loading opportunities...</div></div></div>`);
	}

	// ─── LIST VIEW ────────────────────────────────────────────────
	renderListView() {
		this.page.set_title("Opportunities");
		document.title = "Opportunities";
		// List mode: content area must NOT scroll (inner table handles scroll)
		$("#support-page-content").removeClass("ol-content-scroll").addClass("ol-content-fixed");


		const customerOptions = Array.from(new Set(this.records.map((r) => String(r.party || "").trim()).filter((n) => n && n !== "-"))).sort();
		const ownerOptions = this.ownerOptions.length ? this.ownerOptions : Array.from(new Set(this.records.map((r) => String(r.owner || "").trim()).filter(Boolean))).sort().map((o) => ({ value: o, label: o }));
		const rows = this.getFilteredRows();
		const visibleRows = rows.slice(0, this.pageSize);
		const appliedCount = (this.saved_filters || []).length;
		const amountSortIcon = this.amountSortDir === "asc" ? "ti-sort-ascending" : this.amountSortDir === "desc" ? "ti-sort-descending" : "ti-arrows-sort";
		const statusOptions = ["", ...Array.from(new Set(this.records.map((r) => r.status).filter(Boolean)))];

		const tableRows = visibleRows.map((row) => {
			const safeParty = this.escapeAttr(row.party || "-");
			const safeOwner = this.escapeAttr(row.owner || "-");
			const safeSubject = this.escapeAttr(row.subject || "-");
			return `
			<tr class="ol-list-row" data-name="${row.id}">
				<td class="ol-cell-id-subject">
					<div class="ol-cell-subject" title="${safeSubject}">${safeSubject}</div>
					<div class="ol-cell-id" title="${row.id}">${row.id}</div>
				</td>
				<td><span class="ol-customer-text" title="${safeParty}">${safeParty}</span></td>
				<td><span class="ol-status ${this.getStatusClass(row.status)}">${row.status}</span></td>
				<td class="ol-cell-amt">${this.formatCurrency(row.amount)}</td>
				<td class="ol-cell-owner" title="${safeOwner}">${safeOwner}</td>
				<td class="ol-cell-dates">
					<div class="ol-date-created" title="Created">${row.creation}</div>
					<div class="ol-date-close" title="Expected Close">${row.expected_date}</div>
				</td>
			</tr>`;
		}).join("");

		this.$content.html(`
		<div class="ol-list-view">
			<div class="card ql-list-card">
				<div class="ol-list-toolbar">
					${this.renderMultiFilter("customer", customerOptions.map((c) => ({ value: c, label: c })), this.selectedCustomers, "Customer")}
					${this.renderMultiFilter("owner", ownerOptions, this.selectedOwners, "Owner")}
					<select id="olStatusFilter" class="ol-input ql-select">
						${statusOptions.map((s) => `<option value="${s}" ${this.statusFilter === s ? "selected" : ""}>${s || "Status"}</option>`).join("")}
					</select>
					<div class="ol-list-toolbar-right">
						<div class="ol-filter-wrap">
							<button id="olOpenFilters" class="btn ql-filter-trigger" type="button" style="white-space:nowrap;padding:0;overflow:hidden;">
								<span class="ol-filter-btn-label" style="display:inline-flex;align-items:center;gap:6px;padding:7px 12px;"><i class="ti ti-filter"></i> Filters${appliedCount ? ` (${appliedCount})` : ""}</span>
								<span class="ol-filter-btn-close" style="display:none;align-items:center;justify-content:center;min-width:28px;padding:7px 10px;border-left:1px solid rgba(15,23,42,0.12);cursor:pointer;">x</span>
							</button>
						</div>
						<button id="olClearFilters" class="btn" type="button"><i class="ti ti-filter-off"></i> Clear</button>
						<button id="olNewDoc" class="btn btn-primary" type="button"><i class="ti ti-plus"></i> New Opportunity</button>
					</div>
				</div>

				<div class="table-wrap ql-list-table-wrap">
					<table class="ol-list-table">
						<colgroup>
							<col class="col-id-subject">
							<col class="col-customer">
							<col class="col-status">
							<col class="col-amount">
							<col class="col-owner">
							<col class="col-dates">
						</colgroup>
						<thead>
							<tr>
								<th>Subject</th>
								<th>Customer</th>
								<th>Status</th>
								<th id="olSortAmount" class="ol-sortable ${this.amountSortDir ? "ol-sort-active" : ""}">Amount <i class="ti ${amountSortIcon}"></i></th>
								<th>Owner</th>
								<th>Created / Closing</th>
							</tr>
						</thead>
						<tbody>${tableRows || '<tr><td colspan="6" class="ol-empty">No records found</td></tr>'}</tbody>
					</table>
				</div>

				<div class="ol-list-footer">
					<div class="page-size-btns">
						${[20, 100, 500, 2500].map((s) => `<button class="ps-btn ${this.pageSize === s ? "active" : ""}" data-size="${s}" type="button">${s}</button>`).join("")}
					</div>
					<div class="record-count">${visibleRows.length} of ${rows.length}</div>
					<button id="olLoadMore" class="load-more-btn" type="button" ${visibleRows.length >= rows.length ? "disabled" : ""}>Load More</button>
				</div>
			</div>
		</div>`);

		this.bindListActions();
	}

	renderMultiFilter(key, options, selectedValues, placeholder) {
		const selectedSet = new Set(selectedValues || []);
		const selectedCount = selectedSet.size;
		const triggerText = selectedCount ? `${placeholder} (${selectedCount})` : placeholder;
		const sortedOptions = [...(options || [])].sort((a, b) => {
			const aS = selectedSet.has(String(a?.value || "").trim()) ? 0 : 1;
			const bS = selectedSet.has(String(b?.value || "").trim()) ? 0 : 1;
			if (aS !== bS) return aS - bS;
			return String(a?.label || "").localeCompare(String(b?.label || ""));
		});

		return `
		<div class="ol-multi-wrap">
			<div class="ol-multi" data-filter="${key}">
				<button type="button" class="ol-multi-trigger" data-filter-trigger="${key}">
					<span>${this.escapeAttr(triggerText)}</span><i class="ti ti-chevron-down"></i>
				</button>
				<div class="ol-multi-menu" data-filter-menu="${key}">
					<div class="ol-multi-search-wrap">
						<input type="text" class="ol-multi-search" data-filter-search="${key}" placeholder="Search ${placeholder.toLowerCase()}..."/>
					</div>
					<div class="ol-multi-options">
						${sortedOptions.map((opt) => {
			const value = String(opt.value || "").trim();
			const label = String(opt.label || value).trim();
			if (!value) return "";
			return `
							<label class="ol-multi-option" data-filter-option="${key}" data-label="${this.escapeAttr(label.toLowerCase())}">
								<input type="checkbox" class="ol-multi-checkbox" data-filter-check="${key}" value="${this.escapeAttr(value)}" ${selectedSet.has(value) ? "checked" : ""}>
								<span>${this.escapeAttr(label)}</span>
							</label>`;
		}).join("")}
					</div>
				</div>
			</div>
		</div>`;
	}

	// ─── FILTER POPOVER ───────────────────────────────────────────
	closeStandardFilterPopover(button) {
		const candidates = [];
		if (button) candidates.push($(button));
		if (this.activeFilterPopoverButton?.length) candidates.push(this.activeFilterPopoverButton);
		candidates.push(this.$content ? this.$content.find("#olOpenFilters") : $("#olOpenFilters"));
		candidates.forEach(($btn) => {
			if (!$btn?.length) return;
			try { $btn.popover("hide"); } catch (e) { }
			try { $btn.popover("dispose"); } catch (e) { }
			$btn.find(".ol-filter-btn-close").css("display", "none");
		});
		$("body > .popover.filter-popover, body > .popover.show").remove();
		this.activeFilterPopoverButton = null;
		$(document).off("mousedown.olStandardFilter");
	}

	openStandardFilterPopover(button) {
		const me = this;
		const DOCTYPE = this.filterDoctype || "Opportunity";
		const $btn = $(button);

		if (this.activeFilterPopoverButton?.length && this.activeFilterPopoverButton[0] !== $btn[0]) {
			this.closeStandardFilterPopover(this.activeFilterPopoverButton);
		}

		const setFilterButtonState = (isOpen) => $btn.find(".ol-filter-btn-close").css("display", isOpen ? "inline-flex" : "none");
		const safeClose = () => { me.closeStandardFilterPopover($btn); setFilterButtonState(false); };

		// If popover already open (close-span visible), toggle it closed
		const isAlreadyOpen = $btn.find(".ol-filter-btn-close").css("display") !== "none";
		if (isAlreadyOpen) { safeClose(); return; }

		frappe.model.with_doctype(DOCTYPE, () => {
			if (!$btn.length || !document.body.contains($btn[0])) return;
			// Dispose any stale instance before creating a fresh one
			try { $btn.popover("dispose"); } catch (e) { }

			const popover_content = $('<div class="filter-area">');
			const FG = new frappe.ui.FilterGroup({ parent: popover_content, doctype: DOCTYPE, on_change: function () { } });
			FG.update_filter_button = function () { };
			setTimeout(() => {
				if ((me.saved_filters || []).length) FG.add_filters(me.saved_filters);
				else FG.add_filter(DOCTYPE, "name", "=", "", false);
			}, 0);

			const footer = $(`
			<div class="filter-action-buttons ql-std-filter-footer mt-1 d-flex justify-content-between align-items-center">
				<button type="button" class="text-muted add-filter btn btn-xs ql-std-btn ql-std-btn-add">+ Add a Filter</button>
				<div class="filter-action-right">
					<button type="button" class="btn btn-secondary btn-xs clear-filters mr-2 ql-std-btn ql-std-btn-clear">Clear</button>
					<button type="button" class="btn btn-primary btn-xs apply-filters ql-std-btn ql-std-btn-apply">Apply</button>
				</div>
			</div>`);

			popover_content.find(".filter-action-buttons").remove();
			popover_content.append(footer);
			footer.css({ marginTop: "2px", paddingTop: "3px", borderTop: "none", gap: "4px" });
			footer.find(".filter-action-right").css({ display: "inline-flex", alignItems: "center", gap: "8px" });
			footer.find(".ol-std-btn").css({ height: "26px", padding: "0 9px", borderRadius: "8px", fontSize: "11px", fontWeight: "600", boxShadow: "none" });
			footer.find(".ol-std-btn-add").css({ background: "#f8fafc", color: "#334155", border: "1px solid rgba(15,23,42,0.14)" });
			footer.find(".ol-std-btn-clear").css({ background: "#fff", color: "#0f172a", border: "1px solid rgba(15,23,42,0.2)", marginRight: "0" });
			footer.find(".ol-std-btn-apply").css({ background: "#2f6fe5", color: "#fff", border: "1px solid #2f6fe5" });

			footer.find(".add-filter").on("click", () => FG.add_filter(DOCTYPE, "name", "=", "", false));
			footer.find(".clear-filters").on("click", () => { FG.clear_filters(); me.saved_filters = []; me.pageSize = 20; safeClose(); me.renderListView(); });
			footer.find(".apply-filters").on("click", () => { me.saved_filters = FG.get_filters() || []; me.pageSize = 20; safeClose(); me.renderListView(); });

			try {
				$btn.popover({ html: true, placement: "bottom", content: popover_content[0], trigger: "manual", container: document.body });
				if (!document.body.contains($btn[0])) { safeClose(); return; }
				$btn.popover("show");
				this.activeFilterPopoverButton = $btn;
				setFilterButtonState(true);
				const tipInstance = $btn.data("bs.popover");
				const tipElement = tipInstance?.getTipElement?.() || null;
				if (tipElement) {
					$(tipElement).addClass("filter-popover");
					const pw = Math.min(920, Math.max(620, window.innerWidth - 24));
					$(tipElement).css({ maxWidth: `${pw}px`, width: `${pw}px` });
					$(tipElement).find(".popover-body").css({ padding: "6px 8px", maxHeight: "260px", overflowY: "auto", overflowX: "hidden" });
					$(tipElement).find(".filter-area").css({ lineHeight: "1.15", width: "100%" });
					$(tipElement).find(".filter-group .form-control, .filter-group input, .filter-group select").css({ height: "26px", minHeight: "26px", paddingTop: "2px", paddingBottom: "2px", fontSize: "11px" });
					$(tipElement).find(".filter-group .filter-row, .filter-group .filter-field").css({ marginBottom: "2px" });
					$(tipElement).find(".filter-group .text-muted, .filter-group small").css({ display: "none" });
					$(tipElement).find("hr, .filter-group hr").css({ display: "none" });
				}
			} catch (err) { console.error("Filter popover error", err); safeClose(); return; }

			$(document).off("mousedown.olStandardFilter").on("mousedown.olStandardFilter", (e) => {
				// Also exclude .popover and all its children (inputs inside the filter popover)
				if (!$(e.target).closest(".popover, .filter-popover, #olOpenFilters").length) safeClose();
			});
		});
	}

	applyUrlFilters() {
		const urlParams = new URLSearchParams(window.location.search);
		const filters_encoded = urlParams.get("filters") || "";
		if (filters_encoded) {
			try {
				const parsed = JSON.parse(filters_encoded);
				this.saved_filters = Array.isArray(parsed) ? parsed : [];
			} catch (e) {
				try {
					const decoded = decodeURIComponent(filters_encoded);
					const parsed = JSON.parse(decoded);
					this.saved_filters = Array.isArray(parsed) ? parsed : [];
				} catch (err) {
					console.warn("Failed to parse adv filters:", err);
				}
			}
		}
	}

	// ─── FILTER LOGIC ─────────────────────────────────────────────
	getFilteredRows() {
		const sc = new Set(this.selectedCustomers), so = new Set(this.selectedOwners);
		const filtered = this.records.filter((row) => {
			if (this.statusFilter && row.status !== this.statusFilter) return false;
			if (sc.size && !sc.has(String(row.party || ""))) return false;
			if (so.size && !so.has(String(row.owner || ""))) return false;
			if ((this.saved_filters || []).length && !this.saved_filters.every((f) => this.matchStandardFilter(row, f))) return false;
			return true;
		});
		if (!this.amountSortDir) return filtered;
		return filtered.sort((a, b) => { const d = Number(a.amount) - Number(b.amount); return this.amountSortDir === "asc" ? d : -d; });
	}

	getFilterFieldValue(row, field) {
		if (field === "name" || field === "id") return row.id;
		if (field === "title") return row.subject;
		//if (field === "customer_name") return row.party;
		if (field === "customer_name" || field === "party_name") return row.party;
		if (field === "status") return row.status;
		if (field === "owner") return row.owner;
		if (field === "opportunity_amount" || field === "amount") return row.amount;
		return "";
	}

	normalizeStandardFilter(rawFilter) {
		if (Array.isArray(rawFilter)) {
			if (rawFilter.length >= 4) return { field: String(rawFilter[1] || "").trim(), op: String(rawFilter[2] || "=").trim().toLowerCase(), value: rawFilter[3] };
			if (rawFilter.length >= 3) return { field: String(rawFilter[0] || "").trim(), op: String(rawFilter[1] || "=").trim().toLowerCase(), value: rawFilter[2] };
		}
		if (rawFilter && typeof rawFilter === "object") return { field: String(rawFilter.fieldname || rawFilter.field || "").trim(), op: String(rawFilter.operator || rawFilter.op || "=").trim().toLowerCase(), value: rawFilter.value };
		return { field: "", op: "=", value: "" };
	}

	matchStandardFilter(row, rawFilter) {
		const { field, op, value } = this.normalizeStandardFilter(rawFilter);
		if (!field) return true;
		const left = this.getFilterFieldValue(row, field);
		const isAmt = field === "amount" || field === "opportunity_amount";
		const lt = String(left || "").toLowerCase();
		const normArr = (v) => Array.isArray(v) ? v.map((i) => String(i || "").trim()).filter(Boolean) : String(v || "").split(",").map((i) => i.trim()).filter(Boolean);
		if (op === "set") return left !== null && left !== undefined && String(left).trim() !== "";
		if (op === "not set") return !left || String(left).trim() === "";
		if (op === "in") return normArr(value).map((i) => i.toLowerCase()).includes(lt);
		if (op === "not in") return !normArr(value).map((i) => i.toLowerCase()).includes(lt);
		if (isAmt && [">", ">=", "<", "<=", "=", "!="].includes(op)) {
			const lhs = Number(left || 0), rhs = Number(value);
			if (!Number.isFinite(rhs)) return true;
			if (op === ">") return lhs > rhs; if (op === ">=") return lhs >= rhs;
			if (op === "<") return lhs < rhs; if (op === "<=") return lhs <= rhs;
			if (op === "=") return lhs === rhs; if (op === "!=") return lhs !== rhs;
		}
		const rt = String(value || "").toLowerCase();
		if (op === "=") return lt === rt;
		if (op === "!=") return lt !== rt;
		if (op === "like") { const p = rt.replace(/%/g, "").trim(); return !p || lt.includes(p); }
		if (op === "not like") { const p = rt.replace(/%/g, "").trim(); return !p || !lt.includes(p); }
		if (op === ">") return lt > rt; if (op === ">=") return lt >= rt;
		if (op === "<") return lt < rt; if (op === "<=") return lt <= rt;
		return true;
	}

	// ─── LIST BINDINGS ────────────────────────────────────────────
	bindListActions() {
		this.$content
			.off("click.ol", "[data-filter-trigger]")
			.on("click.ol", "[data-filter-trigger]", (e) => {
				e.preventDefault(); e.stopPropagation();
				const key = String($(e.currentTarget).data("filterTrigger") || "");
				const $menu = this.$content.find(`[data-filter-menu='${key}']`);
				const open = !$menu.hasClass("open");
				this.$content.find("[data-filter-menu]").removeClass("open");
				if (open) $menu.addClass("open");
			});

		this.$content
			.off("change.ol", ".ol-multi-checkbox")
			.on("change.ol", ".ol-multi-checkbox", (e) => {
				const key = String($(e.currentTarget).data("filterCheck") || "");
				const values = this.$content.find(`.ol-multi-checkbox[data-filter-check='${key}']:checked`).map((_, el) => String(el.value || "").trim()).get().filter(Boolean);
				if (key === "customer") this.selectedCustomers = values;
				if (key === "owner") this.selectedOwners = values;
				this.pageSize = 20; this.renderListView();
			});

		this.$content
			.off("input.ol", ".ol-multi-search")
			.on("input.ol", ".ol-multi-search", (e) => {
				const key = String($(e.currentTarget).data("filterSearch") || "");
				const query = String($(e.currentTarget).val() || "").trim().toLowerCase();
				this.$content.find(`[data-filter-option='${key}']`).each((_, item) => $(item).toggle(!query || String($(item).data("label") || "").toLowerCase().includes(query)));
			});

		this.$content
			.off("click.ol", "#olOpenFilters .ql-filter-btn-close")
			.on("click.ol", "#olOpenFilters .ql-filter-btn-close", (e) => { e.preventDefault(); e.stopPropagation(); this.closeStandardFilterPopover(this.$content.find("#olOpenFilters")); });

		this.$content
			.off("click.ol", "#olOpenFilters")
			.on("click.ol", "#olOpenFilters", (e) => {
				e.preventDefault(); e.stopPropagation();
				if ($(e.target).closest(".ol-filter-btn-close").length) { this.closeStandardFilterPopover(e.currentTarget); return; }
				this.openStandardFilterPopover(e.currentTarget);
			});

		this.$content
			.off("change.ol", "#olStatusFilter")
			.on("change.ol", "#olStatusFilter", (e) => { this.statusFilter = String($(e.currentTarget).val() || "").trim(); this.renderListView(); });

		this.$content
			.off("click.ol", "#olClearFilters")
			.on("click.ol", "#olClearFilters", () => { this.selectedCustomers = []; this.selectedOwners = []; this.statusFilter = ""; this.saved_filters = []; this.pageSize = 20; this.renderListView(); });

		this.$content
			.off("click.ol", "#olSortAmount")
			.on("click.ol", "#olSortAmount", (e) => { e.preventDefault(); this.amountSortDir = !this.amountSortDir ? "asc" : this.amountSortDir === "asc" ? "desc" : ""; this.renderListView(); });

		this.$content
			.off("click.ol", ".ps-btn")
			.on("click.ol", ".ps-btn", (e) => { const s = Number($(e.currentTarget).data("size") || 20); if (!Number.isFinite(s) || s <= 0) return; this.pageSize = s; this.renderListView(); });

		this.$content
			.off("click.ol", "#olLoadMore")
			.on("click.ol", "#olLoadMore", () => { this.pageSize += this.pageStep; this.renderListView(); });

		this.$content
			.off("click.ol", "#olNewDoc")
			.on("click.ol", "#olNewDoc", () => frappe.set_route("opp-list", "new"));

		this.$content
			.off("click.ol", ".ol-list-row")
			.on("click.ol", ".ol-list-row", (e) => {
				const name = String($(e.currentTarget).data("name") || "");
				const selected = this.records.find((r) => r.id === name);
				if (!selected) return;
				this.selectedRecord = selected;
				this.currentStage = 0;
				frappe.set_route("opp-list", name);
			});

		$(document).off("click.olListFilters").on("click.olListFilters", (e) => {
			if (!$(e.target).closest(".ol-multi").length) this.$content.find("[data-filter-menu]").removeClass("open");
		});
	}

	// ─── DETAIL VIEW ──────────────────────────────────────────────
	renderDetailView() {
		if (!this.selectedRecord) { this.$content.html('<div style="padding:20px;text-align:center;">Record not found</div>'); return; }
		if (this.isLoadingDetail) return;
		this.isLoadingDetail = true;
		// Detail/form mode: content area should scroll normally
		$("#support-page-content").removeClass("ol-content-fixed").addClass("ol-content-scroll");


		this.$content.html('<div style="padding:40px;text-align:center;"><div class="spinner-border" role="status"></div><p style="margin-top:15px;">Loading...</p></div>');

		this.fetchDetailRecord(this.selectedRecord.id)
			.then(() => Promise.all([
				this.fetchDetailActivities(this.selectedRecord.id),
				this.fetchDetailAttachments(this.selectedRecord.id),
			]))
			.then(() => {
				this.$content.empty().html(frappe.opp_list_page_template.detail);
				this.injectSelectedRecordInDetail();
				this.injectDetailActivities();
				this.injectDetailAttachments();
				this.setPageTitle();
				this.bindActivityFilters();
				this.bindDetailActions();
				this.bindCreateDropdown();
			}).then(() => {
				const fixHeights = () => {
					const ids = ["support-layout", "support-layout-row", "support-sidebar", "support-main", "support-page-content"];
					ids.forEach(id => {
						const el = document.getElementById(id);
						if (!el) return;
						el.style.height = "auto";
						el.style.minHeight = "unset";
						el.style.alignSelf = "flex-start";
					});
					const row = document.getElementById("support-layout-row") || document.querySelector(".support-layout-row");
					if (row) row.style.alignItems = "flex-start";
				};
				fixHeights();
				setTimeout(fixHeights, 100);
			}).finally(() => { this.isLoadingDetail = false; });





		// Register ORC handler once — survives expand/collapse re-renders
		this.$content.off("change.olORC").on("change.olORC", ".ol-di-orc", function () {
			const me = frappe.opp_list_page;   // always fresh reference
			const $cb = $(this);
			const checked = $cb.prop("checked");
			const $wizRow = $cb.closest(".ol-di-wiz-row");
			const idx = Number($wizRow.data("idx"));

			// Show/hide conditional fields
			$wizRow.find(".ol-orc-conditional").toggle(checked);

			// Write to detailItems
			if (Number.isFinite(idx) && me.detailItems && me.detailItems[idx]) {
				me.detailItems[idx].orc = checked;
				me.detailItems[idx].commission_type = $wizRow.find(".ol-di-commission-type").val() || "";
				me.detailItems[idx].rate_value = parseFloat($wizRow.find(".ol-di-ratevalue").val()) || 0;
				console.log("[ORC] idx:", idx, "orc:", checked, "detailItems:", me.detailItems[idx]);
			} else {
				console.warn("[ORC] idx not found:", idx, "$wizRow len:", $wizRow.length);
			}

			// Show save bar
			me.$content.find("#olItemsSaveBar").css("display", "flex");
		});

	}

	injectSelectedRecordInDetail() {
		if (!this.selectedRecord) return;
		const record = this.detailRecord || this.selectedRecord;
		const customerName = record.customer_name || this.selectedRecord.party || "-";
		const status = record.status || this.selectedRecord.status || "Open";

		this.$content.find(".subject-label").text(`Opportunity · ${record.name || this.selectedRecord.id}`);
		this.$content.find(".customer-avatar").text(this.getCustomerAvatarText(customerName)).attr("title", customerName);
		// this.$content.find(".customer-name").text(customerName).attr("title", customerName);
		this.$content.find(".customer-sub").text(`Owner · ${record.owner || this.selectedRecord.owner}`);
		this.$content.find("#statusBadge").html(`<i class="ti ti-circle-dot"></i> ${status}`);

		this.injectDetailMeta(record);
		this.injectItemsTable(record);
		this.injectDetailFinancials(record);
		this.fetchAndInjectContact(record);
		this.injectDetailContacts(record);

	}

	injectDetailMeta(record) {
		const me = this;
		const first = (...vals) => {
			for (const v of vals) { const t = String(v ?? "").trim(); if (t) return t; }
			return "";
		};
		const getUserLabel = (userId) => {
			const u = String(userId || "").trim(); if (!u) return "";
			const opt = (this.ownerOptions || []).find(o =>
				String(o?.value || "").trim().toLowerCase() === u.toLowerCase()
			);
			if (opt) {
				const lbl = String(opt.label || "").trim();
				const suf = ` (${u})`;
				return lbl.endsWith(suf) ? lbl.slice(0, -suf.length).trim() : lbl;
			}
			return u;
		};

		// Breadcrumb + subject
		const oppId = first(record.name, this.selectedRecord?.id);
		const subject = first(record.title, record.subject, record.name, this.selectedRecord?.subject);
		this.$content.find("#olBreadcrumbId").text(oppId);
		this.$content.find("#olSubjectLabel").text(subject).attr("title", subject);

		// Status badge
		const displayStatus = first(record.custom_status, record.status, this.selectedRecord?.status) || "Open";
		this.$content.find("#statusBadge").html(`<i class="ti ti-circle-dot"></i> ${displayStatus}`);

		// Company — set value and bind live search
		// Company — set value and bind live search
		const companyVal = first(record.company);
		this.$content.find("#olCompanyInput").val(companyVal);
		this._bindCompanySearch();

		// Customer — rebuild the whole view block so nothing can leave it as plain text
		const customerVal = first(record.party_name, record.customer_name);
		const $custView = this.$content.find("#olCustomerView");
		const pencilSvg = `<svg id="olCustomerEdit" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#3b7ef8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="cursor:pointer;flex-shrink:0;margin-left:8px;vertical-align:middle;"><path d="M4 20h4L18.5 9.5a2.121 2.121 0 0 0-3-3L5 17v3z"/><path d="M13.5 6.5l3 3"/></svg>`;
		if (customerVal && customerVal !== "-") {
			$custView.html(
				`<a id="olCustomerLink" href="/app/customers/${encodeURIComponent(customerVal)}" title="${this.escapeAttr(customerVal)}" style="color:inherit;text-decoration:none;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1;">${this.escapeAttr(customerVal)}</a>` + pencilSvg
			);
		} else {
			$custView.html(`<a id="olCustomerLink" href="javascript:void(0)" style="color:inherit;text-decoration:none;flex:1;">—</a>` + pencilSvg);
		}
		this._bindCustomerField();

		const $customerOpen = this.$content.find("#olCustomerOpen");
		if (customerVal && customerVal !== "-") {
			$customerOpen.attr("href", `/app/customers/${encodeURIComponent(customerVal)}`)
				.attr("title", `Open ${customerVal}`)
				.css("display", "inline-flex");
		} else {
			$customerOpen.css("display", "none");
		}

		// Make the "Company" label a link to the Company document
		// Show an "open" link beside the company value (links to the Company doc)
		// Show an "open" link beside the company value (links to the Company doc)
		const $companyOpen = this.$content.find("#olCompanyOpen");
		if (companyVal && companyVal !== "-") {
			$companyOpen.attr("href", `/app/company/${encodeURIComponent(companyVal)}`)
				.attr("title", `Open ${companyVal}`)
				.css("display", "inline-flex");
		} else {
			$companyOpen.css("display", "none");
		}

		// Salesperson — read from sales_team child, NOT owner
		const team = Array.isArray(record.sales_team) ? record.sales_team : [];
		const spFromTeam = team.length ? (team[0].sales_person_name || team[0].sales_person) : "";
		this.$content.find("#olSalesperson").val(spFromTeam);
	}




	_bindCompanySearch() {
		const me = this;
		const $input = this.$content.find("#olCompanyInput");
		const $dd = this.$content.find("#olCompanyDD");
		if (!$input.length || $input.data("companyBound")) return;
		$input.data("companyBound", true);

		let timer = null;

		const positionDD = () => {
			const rect = $input[0].getBoundingClientRect();
			$dd.css({
				position: "fixed",
				top: rect.bottom + 4,
				left: rect.left,
				width: Math.max(rect.width, 220),
				zIndex: 9999,
			});
		};

		$input.on("input.olCompany focus.olCompany", function () {
			const q = ($input.val() || "").trim();
			clearTimeout(timer);
			timer = setTimeout(() => {
				frappe.call({
					method: "frappe.client.get_list",
					args: {
						doctype: "Company",
						fields: ["name"],
						filters: q ? [["Company", "name", "like", `%${q}%`]] : [],
						limit_page_length: 10,
						order_by: "name asc",
					},
					callback: (r) => {
						const rows = r.message || [];
						if (!rows.length) { $dd.hide(); return; }
						$dd.html(rows.map(row => `
							<div class="ol-company-opt"
								data-val="${me.escapeAttr(row.name)}"
								style="padding:9px 12px;cursor:pointer;font-size:13px;color:#111827;
									border-bottom:1px solid rgba(0,0,0,0.05);transition:background .1s;
									display:flex;align-items:center;gap:8px;">
								<i class="ti ti-building" style="font-size:12px;color:#9ca3af;flex-shrink:0;"></i>
								<span>${me.escapeAttr(row.name)}</span>
							</div>`).join(""));
						positionDD();
						$dd.show();
					}
				});
			}, 220);
			me.$content.find("#olDetailMetaSaveBar").css("display", "flex");
		});

		$dd.on("mouseenter", ".ol-company-opt", function () {
			$(this).css("background", "rgba(59,126,248,0.06)");
		}).on("mouseleave", ".ol-company-opt", function () {
			$(this).css("background", "");
		});

		$dd.on("mousedown", ".ol-company-opt", function (e) {
			e.preventDefault();
			$input.val($(this).data("val"));
			$dd.hide();
			me.$content.find("#olDetailMetaSaveBar").css("display", "flex");
		});

		$(document).on("click.olCompanyDD", (e) => {
			if (!$(e.target).closest("#olCompanyInput, #olCompanyDD").length) $dd.hide();
		});
	}

	_bindCustomerField() {
		const me = this;
		const $view = this.$content.find("#olCustomerView");
		const $editWrap = this.$content.find("#olCustomerEditWrap");
		const $input = this.$content.find("#olCustomerInput");
		const $dd = this.$content.find("#olCustomerDD");
		const $link = this.$content.find("#olCustomerLink");
		if (!$input.length || $input.data("custBound")) return;
		$input.data("custBound", true);

		let timer = null;

		const positionDD = () => {
			const rect = $input[0].getBoundingClientRect();
			$dd.css({ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 220), zIndex: 9999 });
		};

		// click name → open customer record (same tab)
		this.$content.off("click.olCustLink", "#olCustomerLink").on("click.olCustLink", "#olCustomerLink", (e) => {
			const href = $link.attr("href");
			if (href && href !== "javascript:void(0)") { e.preventDefault(); window.location.href = href; }
		});

		// pencil → switch to edit mode
		this.$content.off("click.olCustEdit", "#olCustomerEdit").on("click.olCustEdit", "#olCustomerEdit", () => {
			$view.hide(); $editWrap.show();
			$input.val("").focus();
		});

		// search — reuse the new-form rich search; force-show since #olCustomerDD has no .open CSS
		$input.off("input.olCust focus.olCust").on("input.olCust focus.olCust", function () {
			me.searchLiveLink($input, "#olCustomerDD", "Customer", "customer_name", ".ol-cust-opt", "ti-user");
			positionDD();
			$dd.css("display", "block");           // override inline display:none
			// keep it visible as searchLiveLink replaces innerHTML (it only toggles .open class)
			const keepOpen = setInterval(() => {
				if ($dd.is(":visible") || !$input.is(":focus")) { clearInterval(keepOpen); }
				$dd.css("display", "block");
			}, 50);
			setTimeout(() => clearInterval(keepOpen), 1000);
		});

		$dd.off("mouseenter mouseleave", ".ol-cust-opt")
			.on("mouseenter", ".ol-cust-opt", function () { $(this).css("background", "rgba(59,126,248,0.06)"); })
			.on("mouseleave", ".ol-cust-opt", function () { $(this).css("background", ""); });

		// pick a customer → save it + refresh contacts
		$dd.off("mousedown.olCust", ".ol-cust-opt").on("mousedown.olCust", ".ol-cust-opt", function (e) {
			e.preventDefault();
			const newCust = $(this).data("docname");
			$dd.hide();
			$editWrap.hide(); $view.show();
			me._saveDetailCustomer(newCust);
		});

		// click outside edit → cancel back to view
		$(document).off("click.olCustDD").on("click.olCustDD", (e) => {
			if (!$(e.target).closest("#olCustomerField").length) {
				$dd.hide();
				$editWrap.hide(); $view.show();
			}
		});
	}

	_saveDetailCustomer(newCust) {
	const me = this;
	const record = me.detailRecord || me.selectedRecord;
	if (!record?.name || !newCust) return;

	// Fetch new customer's sales team + display name — held in memory, saved later with contacts
	frappe.call({
		method: "frappe.client.get",
		args: { doctype: "Customer", name: newCust },
		callback: (rc) => {
			const cust = rc.message || {};
			const team = Array.isArray(cust.sales_team) ? cust.sales_team : [];
			const salesTeam = team.map(t => ({
				sales_person: t.sales_person,
				allocated_percentage: t.allocated_percentage || (team.length === 1 ? 100 : 0),
			}));
			const spName = team.length ? (team[0].sales_person_name || team[0].sales_person) : "";

			// Stash the pending change — NOT saved until a contact is added
			me._pendingCustomer = {
				party_name: newCust,
				customer_name: cust.customer_name || newCust,
				sales_team: salesTeam,
				sp_name: spName,
			};

			// Update in-memory record so the UI reflects the new customer + empty contacts
			me.detailRecord = me.detailRecord || record;
			me.detailRecord.party_name    = newCust;
			me.detailRecord.customer_name = cust.customer_name || newCust;
			me.detailRecord.contact_list  = [];
			me._detailContacts   = [];
			me._detailPrimaryIdx = 0;

			me.injectDetailMeta(me.detailRecord);
			me.injectDetailContacts(me.detailRecord);   // empty list + Add Contact scoped to new customer
			me.$content.find("#olSalesperson").val(spName);
			frappe.show_alert({ message: "Customer changed. Add a contact to save.", indicator: "blue" });
		},
		error: () => frappe.show_alert({ message: "Failed to load customer.", indicator: "red" }),
	});
}

	_loadCustomerSalesPerson(customerName) {
		const me = this;
		if (!customerName) return;
		frappe.call({
			method: "frappe.client.get",
			args: { doctype: "Customer", name: customerName },
			callback: (r) => {
				const cust = r.message;
				const team = (cust && Array.isArray(cust.sales_team)) ? cust.sales_team : [];
				if (!team.length) {
					me.$content.find("#olSalesperson").val("");
					return;
				}
				const spId = team[0].sales_person || "";
				// show the sales person name in the field
				me.$content.find("#olSalesperson").val(team[0].sales_person_name || spId);
				// persist the sales_team onto the opportunity
				const salesTeam = team.map(t => ({
					sales_person: t.sales_person,
					allocated_percentage: t.allocated_percentage || (team.length === 1 ? 100 : 0),
				}));
				frappe.call({
					method: "frappe.client.get",
					args: { doctype: "Opportunity", name: me.detailRecord.name },
					callback: (r2) => {
						const doc = r2.message;
						if (!doc) return;
						doc.sales_team = salesTeam;
						frappe.call({
							method: "frappe.client.save",
							args: { doc },
							callback: (r3) => { if (r3.message) me.detailRecord = r3.message; },
						});
					},
				});
			},
		});
	}

	_loadCustomerContacts(customerName) {
		const me = this;
		if (!customerName) return;
		// find Contacts linked to this Customer via Dynamic Link
		frappe.call({
			method: "frappe.client.get_list",
			args: {
				doctype: "Contact",
				fields: ["name", "first_name", "last_name", "email_id", "mobile_no", "designation"],
				filters: [["Dynamic Link", "link_doctype", "=", "Customer"], ["Dynamic Link", "link_name", "=", customerName]],
				limit_page_length: 50,
				order_by: "creation asc",
			},
			callback: (r) => {
				const rows = r.message || [];
				me._detailContacts = rows.map(c => ({
					docname: c.name,
					name: [c.first_name, c.last_name].filter(Boolean).join(" ") || c.name,
					email: c.email_id || "",
					phone: c.mobile_no || "",
					role: c.designation || "",
					poc: 0,
				}));
				if (me._detailContacts.length) me._detailContacts[0].poc = 1;
				me._detailPrimaryIdx = 0;
				// render directly from _detailContacts, then persist to the opportunity
				me._renderDetailContactsFromState();
				me._saveDetailContacts(me.detailRecord || {});
			},
			error: () => {
				me._detailContacts = [];
				if (typeof me.injectDetailContacts === "function") me.injectDetailContacts(me.detailRecord || {});
			},
		});
	}


	_renderDetailContactsFromState() {
		const me = this;
		const $list = me.$content.find("#olDetailContactsList");
		const $count = me.$content.find("#olContactCount");
		if (!$list.length) return;
		const colors = ["#3b7ef8", "#16a34a", "#d97706", "#7c3aed", "#dc2626", "#0891b2"];
		$count.text(me._detailContacts.length);
		if (!me._detailContacts.length) {
			$list.html(`<div style="font-size:12px;color:#9ca3af;padding:4px 0;grid-column:1/-1;">No contacts linked to this customer</div>`);
			return;
		}
		if (me._detailPrimaryIdx === undefined) me._detailPrimaryIdx = 0;
		$list.html(me._detailContacts.map((c, i) => {
			const av = (c.name && c.name !== "—" ? c.name : "?").substring(0, 2).toUpperCase();
			const color = colors[i % colors.length];
			const isPrimary = (i === me._detailPrimaryIdx);
			const docname = c.docname || c.user_name || "";
			// name: link to Contact page if we have a docname, else plain text
			const nameHtml = docname
				? `<a href="/app/contact/${encodeURIComponent(docname)}" style="font-size:13px;font-weight:600;color:#3b7ef8;text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;">${me.escapeAttr(c.name || "—")}</a>`
				: `<div style="font-size:13px;font-weight:600;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${me.escapeAttr(c.name || "—")}</div>`;
			return `
			<div style="background:${isPrimary ? "rgba(59,126,248,0.05)" : "#f8fafc"};border:${isPrimary ? "2px solid #3b7ef8" : "1px solid rgba(0,0,0,0.08)"};border-radius:10px;padding:12px 14px;position:relative;display:flex;flex-direction:column;gap:8px;">
				<div style="display:flex;align-items:flex-start;gap:10px;">
					<div style="width:34px;height:34px;border-radius:50%;background:${color}18;color:${color};display:flex;align-items:center;justify-content:center;font-family:Syne,sans-serif;font-size:13px;font-weight:700;flex-shrink:0;">${me.escapeAttr(av)}</div>
					<div style="flex:1;min-width:0;padding-right:26px;">
						${nameHtml}
						${c.role ? `<div style="font-size:10px;color:#9ca3af;margin-top:1px;">${me.escapeAttr(c.role)}</div>` : ""}
						${c.email ? `<div style="font-size:11px;color:#3b7ef8;margin-top:4px;display:flex;align-items:center;gap:4px;"><i class="ti ti-mail" style="font-size:10px;color:#9ca3af;"></i><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${me.escapeAttr(c.email)}</span><button class="ol-copy-btn" data-copy="${me.escapeAttr(c.email)}" title="Copy email" style="border:none;background:transparent;cursor:pointer;color:#9ca3af;padding:0 2px;display:inline-flex;flex-shrink:0;"><i class="ti ti-copy" style="font-size:12px;"></i></button></div>` : ""}
						${c.phone ? `<div style="font-size:11px;color:#374151;margin-top:2px;display:flex;align-items:center;gap:4px;"><i class="ti ti-device-mobile" style="font-size:10px;color:#9ca3af;"></i><span>${me.escapeAttr(c.phone)}</span><button class="ol-copy-btn" data-copy="${me.escapeAttr(c.phone)}" title="Copy mobile" style="border:none;background:transparent;cursor:pointer;color:#9ca3af;padding:0 2px;display:inline-flex;flex-shrink:0;"><i class="ti ti-copy" style="font-size:12px;"></i></button></div>` : ""}
						<div style="margin-top:8px;">
							<button class="ol-set-primary-btn" data-pri-idx="${i}" type="button" style="border:1px solid ${isPrimary ? "#3b7ef8" : "rgba(0,0,0,0.12)"};background:${isPrimary ? "#3b7ef8" : "transparent"};color:${isPrimary ? "#fff" : "#6b7280"};font-size:10px;font-weight:600;border-radius:20px;padding:3px 10px;cursor:pointer;display:inline-flex;align-items:center;gap:4px;">
								<i class="ti ${isPrimary ? "ti-star-filled" : "ti-star"}" style="font-size:11px;"></i>${isPrimary ? "Primary" : "Set as primary"}
							</button>
						</div>
					</div>
				</div>
			</div>`;
		}).join(""));

		// copy email / phone
		me.$content.off("click.olCopy", ".ol-copy-btn")
			.on("click.olCopy", ".ol-copy-btn", function (e) {
				e.preventDefault();
				e.stopPropagation();
				const val = String($(this).data("copy") || "");
				navigator.clipboard.writeText(val).then(() => {
					frappe.show_alert({ message: "Copied to clipboard", indicator: "green" });
				}).catch(() => {
					frappe.show_alert({ message: "Copy failed", indicator: "red" });
				});
			});

		// set as primary → update index, re-render, and SAVE to backend
		me.$content.off("click.olPri", ".ol-set-primary-btn")
			.on("click.olPri", ".ol-set-primary-btn", function (e) {
				e.preventDefault();
				e.stopPropagation();
				const idx = parseInt($(this).data("priIdx"));
				if (!Number.isFinite(idx)) return;
				me._detailPrimaryIdx = idx;
				me._renderDetailContactsFromState();
				me._saveDetailPrimaryContact(idx);
			});
	}

	_saveDetailPrimaryContact(idx) {
		const me = this;
		const record = me.detailRecord || {};
		if (!record.name) return;
		const c = (me._detailContacts || [])[idx];
		if (!c) return;
		const docname = c.docname || c.user_name || "";
		if (!docname) {
			frappe.show_alert({ message: "This contact isn't a saved Contact record, so it can't be set as primary.", indicator: "orange" });
			return;
		}
		frappe.call({
			method: "frappe.client.get",
			args: { doctype: "Opportunity", name: record.name },
			callback: (r) => {
				const doc = r.message;
				if (!doc) return;
				doc.contact_person = docname;
				doc.contact_email = c.email || "";
				doc.contact_mobile = c.phone || "";
				frappe.call({
					method: "frappe.client.save",
					args: { doc },
					callback: (r2) => {
						if (r2.message) {
							me.detailRecord = r2.message;
							frappe.show_alert({ message: "Primary contact updated.", indicator: "green" });
						}
					},
					error: () => frappe.show_alert({ message: "Failed to save primary contact.", indicator: "red" }),
				});
			},
		});
	}




	injectDetailContacts(record) {
		const me = this;
		const $list = this.$content.find("#olDetailContactsList");
		const $count = this.$content.find("#olContactCount");
		if (!$list.length) return;
		me._detailPrimaryIdx = undefined;

		const partyName = record.party_name || record.customer_name || "";
		const colors = ["#3b7ef8", "#16a34a", "#d97706", "#7c3aed", "#dc2626", "#0891b2"];

		// Map contact_list child table rows
		me._detailContacts = (Array.isArray(record.contact_list) ? record.contact_list : [])
			.map(c => ({
				docname: c.user_name || "",        // user_name IS the Contact docname (Link field)
				name: c.user_name || "—",
				email: c.email_id || "",
				phone: c.mobile_no || "",
				role: c.designation || "",
				poc: Number(c.poc) || 0,
			}));

		// primary = the row whose poc === 1, else match contact_person, else first
		me._detailPrimaryIdx = me._detailContacts.findIndex(c => c.poc === 1);
		if (me._detailPrimaryIdx < 0) {
			const primaryRef = String(record.contact_person || "").trim();
			me._detailPrimaryIdx = me._detailContacts.findIndex(c =>
				primaryRef && String(c.docname).trim() === primaryRef
			);
		}
		if (me._detailPrimaryIdx < 0) me._detailPrimaryIdx = 0;

		const renderContacts = () => {
			$count.text(me._detailContacts.length);
			if (!me._detailContacts.length) {
				$list.html(`<div style="font-size:12px;color:#9ca3af;padding:4px 0;
					grid-column:1/-1;">No contacts linked to this opportunity</div>`);
				return;
			}
			$list.html(me._detailContacts.map((c, i) => {
				const av = (c.name !== "—" ? c.name : c.docname || "?").substring(0, 2).toUpperCase();
				const color = colors[i % colors.length];
				const isPrimary = (i === me._detailPrimaryIdx);
				const dispName = c.name || c.docname || "—";
				// name links to the Contact record when we have a docname
				const nameHtml = c.docname
					? `<a href="/app/contact/${encodeURIComponent(c.docname)}" style="font-size:13px;font-weight:600;color:#3b7ef8;text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;" title="Open ${me.escapeAttr(dispName)}">${me.escapeAttr(dispName)}</a>`
					: `<div style="font-size:13px;font-weight:600;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${me.escapeAttr(dispName)}</div>`;
				return `
				<div style="background:${isPrimary ? "rgba(59,126,248,0.05)" : "#f8fafc"};
					border:${isPrimary ? "2px solid #3b7ef8" : "1px solid rgba(0,0,0,0.08)"};
					border-radius:10px;padding:12px 14px;position:relative;display:flex;flex-direction:column;gap:8px;">

					<div style="display:flex;align-items:flex-start;gap:10px;">
						<div style="position:relative;width:34px;height:34px;border-radius:50%;
							background:${color}18;color:${color};
							display:flex;align-items:center;justify-content:center;
							font-family:Syne,sans-serif;font-size:13px;font-weight:700;flex-shrink:0;">
							${me.escapeAttr(av)}
							${isPrimary ? `<span style="position:absolute;bottom:-1px;right:-1px;width:11px;height:11px;
								border-radius:50%;background:#3b7ef8;border:2px solid #fff;"></span>` : ""}
						</div>
						<div style="flex:1;min-width:0;padding-right:${isPrimary ? "72px" : "26px"};">
							${nameHtml}
							${c.role ? `<div style="font-size:10px;color:#9ca3af;margin-top:1px;">${me.escapeAttr(c.role)}</div>` : ""}
							${c.email ? `<div style="font-size:11px;color:#3b7ef8;margin-top:4px;
								display:flex;align-items:center;gap:4px;">
								<i class="ti ti-mail" style="font-size:10px;color:#9ca3af;flex-shrink:0;"></i>
								<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${me.escapeAttr(c.email)}</span>
								<button class="ol-copy-btn" data-copy="${me.escapeAttr(c.email)}" title="Copy email" style="border:none;background:transparent;cursor:pointer;color:#9ca3af;padding:0 2px;display:inline-flex;flex-shrink:0;"><i class="ti ti-copy" style="font-size:12px;"></i></button>
								</div>` : ""}
							${c.phone ? `<div style="font-size:11px;color:#374151;margin-top:2px;
								display:flex;align-items:center;gap:4px;">
								<i class="ti ti-device-mobile" style="font-size:10px;color:#9ca3af;flex-shrink:0;"></i>
								<span>${me.escapeAttr(c.phone)}</span>
								<button class="ol-copy-btn" data-copy="${me.escapeAttr(c.phone)}" title="Copy mobile" style="border:none;background:transparent;cursor:pointer;color:#9ca3af;padding:0 2px;display:inline-flex;flex-shrink:0;"><i class="ti ti-copy" style="font-size:12px;"></i></button>
								</div>` : ""}
						</div>
					</div>

					${isPrimary ? `<span style="position:absolute;top:12px;right:12px;display:inline-flex;align-items:center;gap:4px;
						background:#3b7ef8;color:#fff;font-size:9px;font-weight:700;padding:2px 8px;border-radius:10px;
						text-transform:uppercase;letter-spacing:.04em;">
						<span style="width:6px;height:6px;border-radius:50%;background:#fff;display:inline-block;"></span>Primary
					</span>` : ""}

					<button class="ol-contact-remove" data-ci="${i}"
						style="position:absolute;top:12px;right:12px;width:22px;height:22px;border-radius:50%;
							border:1px solid rgba(220,38,38,0.2);background:rgba(220,38,38,0.06);
							color:#dc2626;cursor:pointer;display:${isPrimary ? "none" : "flex"};
							align-items:center;justify-content:center;font-size:11px;" title="Remove">
						<i class="ti ti-x"></i>
					</button>

					${!isPrimary && c.docname ? `
					<button class="ol-set-primary" data-ci="${i}"
						style="width:100%;padding:5px;border-radius:6px;border:1px solid rgba(59,126,248,0.3);
							background:rgba(59,126,248,0.04);color:#3b7ef8;font-size:11px;font-weight:600;cursor:pointer;
							display:flex;align-items:center;justify-content:center;gap:4px;">
						<i class="ti ti-star" style="font-size:12px;"></i> Set as Primary
					</button>` : ""}
				</div>`;
			}).join(""));
		};

		renderContacts();

		// ── Delegated handlers (bound to $list once; survive re-renders) ──

		// Set as Primary → update index + poc flags, re-render, SAVE
		$list.off("click.olPrimary", ".ol-set-primary")
			.on("click.olPrimary", ".ol-set-primary", function (e) {
				e.preventDefault();
				e.stopPropagation();
				const i = parseInt($(this).data("ci"));
				if (!Number.isFinite(i) || !me._detailContacts[i]) return;
				me._detailPrimaryIdx = i;
				me._detailContacts.forEach((c, j) => { c.poc = (j === i) ? 1 : 0; });
				renderContacts();
				// me._saveDetailPrimaryContact(record, i);
				me._saveDetailContacts(record);
			});

		// Remove contact
		$list.off("click.olRemove", ".ol-contact-remove")
			.on("click.olRemove", ".ol-contact-remove", function (e) {
				e.preventDefault();
				e.stopPropagation();
				const i = parseInt($(this).data("ci"));
				me._showDeleteConfirm(
					me._detailContacts[i]?.name || "this contact",
					() => {
						me._detailContacts.splice(i, 1);
						if (me._detailPrimaryIdx >= me._detailContacts.length) me._detailPrimaryIdx = 0;
						renderContacts();
						me._saveDetailContacts(record);
					}
				);
			});

		// Copy email / mobile
		$list.off("click.olCopy", ".ol-copy-btn")
			.on("click.olCopy", ".ol-copy-btn", function (e) {
				e.preventDefault();
				e.stopPropagation();
				const val = String($(this).data("copy") || "");
				navigator.clipboard.writeText(val)
					.then(() => frappe.show_alert({ message: "Copied to clipboard", indicator: "green" }))
					.catch(() => frappe.show_alert({ message: "Copy failed", indicator: "red" }));
			});

		// Add Contact button
		this.$content.off("click.olDCon", "#olAddContactDetailBtn")
			.on("click.olDCon", "#olAddContactDetailBtn", () => {
				me._openDetailContactPicker(partyName, record, renderContacts);
			});
	}

	_saveDetailPrimaryContact(record, idx) {
		const me = this;
		const rec = record || me.detailRecord || {};
		if (!rec.name) return;
		const c = (me._detailContacts || [])[idx];
		if (!c) return;
		const docname = c.docname || "";
		frappe.call({
			method: "frappe.client.get",
			args: { doctype: "Opportunity", name: rec.name },
			callback: (r) => {
				const doc = r.message;
				if (!doc) return;
				// set contact_person + email/mobile
				if (docname) doc.contact_person = docname;
				doc.contact_email = c.email || "";
				doc.contact_mobile = c.phone || "";
				// mirror poc flags into the contact_list child rows
				if (Array.isArray(doc.contact_list)) {
					doc.contact_list.forEach(row => {
						row.poc = (String(row.user_name || "").trim() === String(docname).trim()) ? 1 : 0;
					});
				}
				frappe.call({
					method: "frappe.client.save",
					args: { doc },
					callback: (r2) => {
						if (r2.message) {
							me.detailRecord = r2.message;
							frappe.show_alert({ message: "Primary contact updated.", indicator: "green" });
						}
					},
					error: () => frappe.show_alert({ message: "Failed to save primary contact.", indicator: "red" }),
				});
			},
		});
	}


	_saveDetailContacts(record) {
	const me = this;
	if (!record?.name) return;

	const contacts = me._detailContacts || [];
	const primaryIdx = (me._detailPrimaryIdx >= 0 && me._detailPrimaryIdx < contacts.length) ? me._detailPrimaryIdx : 0;
	const primary = contacts[primaryIdx] || {};

	const contactList = contacts.map((c, i) => ({
		user_name: c.docname || "",          // ← Contact docname (Link target), NOT display name
		mobile_no: c.phone || "",
		email_id: c.email || "",
		designation: c.role || "",
		poc: (i === primaryIdx) ? 1 : 0,
	}));

	const pending = me._pendingCustomer;

	// Fetch latest to avoid modified conflict
	frappe.call({
		method: "frappe.client.get",
		args: { doctype: "Opportunity", name: record.name },
		callback: (r) => {
			if (!r.message) return;
			const doc = { ...r.message };
			doc.contact_list   = contactList;
			// mandatory scalar fields — populate from the primary contact
			doc.contact_person = primary.docname || "";
			doc.contact_email  = primary.email || "";
			doc.contact_mobile = primary.phone || "";
			// apply the pending customer change (if the customer was changed since last save)
			if (pending) {
				doc.party_name    = pending.party_name;
				doc.customer_name = pending.customer_name;
				doc.sales_team    = pending.sales_team;
			}
			frappe.call({
				method: "frappe.client.save",
				args: { doc },
				callback: (r2) => {
					if (r2.message) {
						me.detailRecord = r2.message;
						me._pendingCustomer = null;   // change is now persisted
						frappe.show_alert({ message: "Contacts saved!", indicator: "green" });
					} else {
						frappe.show_alert({ message: "Failed to save contacts.", indicator: "red" });
					}
				},
				error: () => frappe.show_alert({ message: "Error saving contacts.", indicator: "red" })
			});
		}
	});
}

	_saveDetailPrimary(record, contact) {
		const me = this;
		if (!record?.name || !contact?.docname) return;
		frappe.call({
			method: "frappe.client.get",
			args: { doctype: "Opportunity", name: record.name },
			callback: (r) => {
				if (!r.message) return;
				frappe.call({
					method: "frappe.client.save",
					args: {
						doc: {
							...r.message,
							contact_person: contact.docname,
							contact_email: contact.email || "",
							contact_mobile: contact.phone || "",
						}
					},
					callback: (r2) => {
						if (r2.message) {
							me.detailRecord = r2.message;
							frappe.show_alert({ message: `Primary contact set to ${contact.name}`, indicator: "green" });
						} else {
							frappe.show_alert({ message: "Failed to update primary contact.", indicator: "red" });
						}
					},
					error: () => frappe.show_alert({ message: "Error updating primary contact.", indicator: "red" }),
				});
			},
		});
	}


	_openDetailContactPicker(partyName, record, onAdded) {
		const me = this;
		$("#olDConPickerOverlay").remove();

		frappe.call({
			method: "frappe.client.get_list",
			args: {
				doctype: "Contact",
				fields: ["name", "first_name", "last_name", "email_id", "mobile_no", "designation"],
				filters: [
					["Dynamic Link", "link_doctype", "=", "Customer"],
					["Dynamic Link", "link_name", "=", partyName],
				],
				limit_page_length: 50,
			},
			callback: (r) => {
				const all = (r.message || []).map(c => ({
					docname: c.name,
					name: [c.first_name, c.last_name].filter(Boolean).join(" ") || c.name,
					email: c.email_id || "",
					phone: c.mobile_no || "",
					role: c.designation || "",
				}));

				const addedDocnames = new Set((me._detailContacts || []).map(c => c.docname));
				const available = all.filter(c => !addedDocnames.has(c.docname));

				const $overlay = $(`
				<div id="olDConPickerOverlay"
					style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9000;
						display:flex;align-items:center;justify-content:center;padding:20px;">
					<div style="background:#fff;border-radius:14px;width:100%;max-width:480px;
						max-height:85vh;display:flex;flex-direction:column;
						box-shadow:0 24px 64px rgba(0,0,0,0.18);">
 
						<!-- Header -->
						<div style="padding:16px 20px 12px;border-bottom:1px solid rgba(0,0,0,0.08);
							display:flex;align-items:center;justify-content:space-between;">
							<div>
								<div style="font-family:Syne,sans-serif;font-size:15px;font-weight:700;color:#111827;">
									Add Contact
								</div>
								<div style="font-size:11px;color:#9ca3af;margin-top:2px;">
									${me.escapeAttr(partyName || "Customer")}
								</div>
							</div>
							<button id="olDConClose"
								style="width:28px;height:28px;border-radius:50%;
									border:1px solid rgba(0,0,0,0.1);background:transparent;
									color:#9ca3af;cursor:pointer;font-size:14px;
									display:flex;align-items:center;justify-content:center;">
								<i class="ti ti-x"></i>
							</button>
						</div>
 
						<!-- Tabs -->
						<div style="display:flex;gap:4px;padding:10px 20px;
							border-bottom:1px solid rgba(0,0,0,0.08);background:#f8fafc;">
							<button class="ol-dcon-tab active" data-tab="existing"
								style="padding:6px 14px;border-radius:6px;border:1.5px solid rgba(59,126,248,0.3);
									background:#fff;font-size:12px;font-weight:600;cursor:pointer;
									color:#3b7ef8;">Existing Contacts</button>
							<button class="ol-dcon-tab" data-tab="new"
								style="padding:6px 14px;border-radius:6px;border:1px solid transparent;
									background:transparent;font-size:12px;font-weight:500;cursor:pointer;
									color:#6b7280;">+ Create New</button>
						</div>
 
						<!-- Existing contacts list -->
						<div id="olDConExisting" style="flex:1;overflow-y:auto;padding:14px 20px;
							display:flex;flex-direction:column;gap:8px;">
							${available.length ? available.map((c, i) => `
							<div class="ol-dcon-pick" data-ci="${i}"
								style="display:flex;align-items:center;gap:10px;padding:10px 12px;
									border:1.5px solid rgba(0,0,0,0.08);border-radius:10px;
									cursor:pointer;transition:all .12s;">
								<div style="width:32px;height:32px;border-radius:50%;
									background:rgba(59,126,248,0.1);color:#3b7ef8;
									display:flex;align-items:center;justify-content:center;
									font-family:Syne,sans-serif;font-size:12px;font-weight:700;flex-shrink:0;">
									${me.escapeAttr((c.name || "?").substring(0, 2).toUpperCase())}
								</div>
								<div style="flex:1;min-width:0;">
									<div style="font-size:13px;font-weight:600;color:#111827;">
										${me.escapeAttr(c.name)}</div>
									${c.role ? `<div style="font-size:10px;color:#9ca3af;">${me.escapeAttr(c.role)}</div>` : ""}
									${c.email ? `<div style="font-size:11px;color:#3b7ef8;">${me.escapeAttr(c.email)}</div>` : ""}
									${c.phone ? `<div style="font-size:11px;color:#374151;">${me.escapeAttr(c.phone)}</div>` : ""}
								</div>
								<i class="ti ti-plus" style="font-size:15px;color:#3b7ef8;flex-shrink:0;"></i>
							</div>`).join("") : `
							<div style="text-align:center;padding:24px;color:#9ca3af;font-size:12px;">
								<i class="ti ti-user-off" style="font-size:24px;display:block;
									margin-bottom:8px;color:#d1d5db;"></i>
								All contacts already added, or none found.<br>
								Use <strong>+ Create New</strong> to add a new one.
							</div>`}
						</div>
 
						<!-- Create new contact form -->
						<div id="olDConNew" style="display:none;flex:1;overflow-y:auto;padding:16px 20px;">
							<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
								<div>
									<label style="font-size:11px;font-weight:600;color:#6b7280;
										text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:4px;">
										First Name <span style="color:#dc2626;">*</span>
									</label>
									<input id="olDConFirstName" type="text" class="act-input"
										placeholder="First name" style="height:34px;">
								</div>
								<div>
									<label style="font-size:11px;font-weight:600;color:#6b7280;
										text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:4px;">
										Last Name
									</label>
									<input id="olDConLastName" type="text" class="act-input"
										placeholder="Last name" style="height:34px;">
								</div>
								<div style="grid-column:1/-1;">
									<label style="font-size:11px;font-weight:600;color:#6b7280;
										text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:4px;">
										Designation / Role
									</label>
									<input id="olDConRole" type="text" class="act-input"
										placeholder="e.g. IT Manager" style="height:34px;">
								</div>
								<div style="grid-column:1/-1;">
									<label style="font-size:11px;font-weight:600;color:#6b7280;
										text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:4px;">
										Email
									</label>
									<input id="olDConEmail" type="email" class="act-input"
										placeholder="email@company.com" style="height:34px;">
								</div>
								<div style="grid-column:1/-1;">
									<label style="font-size:11px;font-weight:600;color:#6b7280;
										text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:4px;">
										Mobile
									</label>
									<input id="olDConPhone" type="tel" class="act-input"
										placeholder="+91 XXXXX XXXXX" style="height:34px;">
								</div>
							</div>
						</div>
 
						<!-- Footer -->
						<div style="padding:12px 20px;border-top:1px solid rgba(0,0,0,0.08);
							background:#f8fafc;display:flex;justify-content:flex-end;gap:8px;">
							<button id="olDConCancel"
								style="padding:7px 16px;border-radius:6px;
									border:1px solid rgba(0,0,0,0.1);background:#fff;
									font-size:13px;cursor:pointer;color:#374151;">Cancel</button>
							<button id="olDConSaveNew" style="display:none;padding:7px 16px;
								border-radius:6px;border:none;background:#3b7ef8;color:#fff;
								font-size:13px;font-weight:600;cursor:pointer;">
								<i class="ti ti-check" style="margin-right:4px;"></i> Save & Add
							</button>
						</div>
					</div>
				</div>`);

				$("body").append($overlay);

				// Tab switching
				$overlay.on("click", ".ol-dcon-tab", function () {
					const tab = $(this).data("tab");
					$overlay.find(".ol-dcon-tab").css({
						border: "1px solid transparent",
						background: "transparent",
						color: "#6b7280",
						fontWeight: "500",
					});
					$(this).css({
						border: "1.5px solid rgba(59,126,248,0.3)",
						background: "#fff",
						color: "#3b7ef8",
						fontWeight: "600",
					});
					if (tab === "existing") {
						$overlay.find("#olDConExisting").show();
						$overlay.find("#olDConNew").hide();
						$overlay.find("#olDConSaveNew").hide();
					} else {
						$overlay.find("#olDConExisting").hide();
						$overlay.find("#olDConNew").show();
						$overlay.find("#olDConSaveNew").show();
					}
				});

				// Hover on existing
				$overlay.on("mouseenter", ".ol-dcon-pick", function () {
					$(this).css({ "border-color": "#3b7ef8", background: "rgba(59,126,248,0.04)" });
				}).on("mouseleave", ".ol-dcon-pick", function () {
					$(this).css({ "border-color": "rgba(0,0,0,0.08)", background: "" });
				});

				// Pick existing
				$overlay.on("click", ".ol-dcon-pick", function () {
					const i = parseInt($(this).data("ci"));
					if (!me._detailContacts) me._detailContacts = [];
					me._detailContacts.push(available[i]);
					onAdded();
					me._saveDetailContacts(record);
					$overlay.remove();
				});

				// Save new contact → create in Frappe then add
				$overlay.on("click", "#olDConSaveNew", () => {
					const firstName = $overlay.find("#olDConFirstName").val().trim();
					if (!firstName) {
						frappe.show_alert({ message: "First name is required.", indicator: "orange" });
						return;
					}
					const lastName = $overlay.find("#olDConLastName").val().trim();
					const role = $overlay.find("#olDConRole").val().trim();
					const email = $overlay.find("#olDConEmail").val().trim();
					const phone = $overlay.find("#olDConPhone").val().trim();
					const fullName = [firstName, lastName].filter(Boolean).join(" ");

					const $btn = $overlay.find("#olDConSaveNew");
					$btn.html('<i class="ti ti-loader"></i> Saving…').prop("disabled", true);

					frappe.call({
						method: "frappe.client.insert",
						args: {
							doc: {
								doctype: "Contact",
								first_name: firstName,
								last_name: lastName,
								designation: role,
								email_ids: email ? [{ email_id: email, is_primary: 1 }] : [],
								phone_nos: phone ? [{ phone: phone, is_primary_mobile_no: 1 }] : [],
								links: partyName ? [{
									link_doctype: "Customer",
									link_name: partyName,
								}] : [],
							}
						},
						callback: (r) => {
							if (r.message) {
								const newContact = {
									docname: r.message.name,
									name: fullName,
									email,
									phone,
									role,
								};
								if (!me._detailContacts) me._detailContacts = [];
								me._detailContacts.push(newContact);
								onAdded();
								me._saveDetailContacts(record);
								frappe.show_alert({ message: `Contact "${fullName}" created!`, indicator: "green" });
								$overlay.remove();
							} else {
								$btn.html('<i class="ti ti-check"></i> Save & Add').prop("disabled", false);
								frappe.show_alert({ message: "Failed to create contact.", indicator: "red" });
							}
						},
						error: () => {
							$btn.html('<i class="ti ti-check"></i> Save & Add').prop("disabled", false);
							frappe.show_alert({ message: "Error creating contact.", indicator: "red" });
						}
					});
				});

				// Close
				$overlay.on("click", "#olDConClose, #olDConCancel", () => $overlay.remove());
				$overlay.on("click", e => { if ($(e.target).is($overlay)) $overlay.remove(); });
			},
			error: () => {
				// If fetch fails, open with just the create new form
				frappe.show_alert({ message: "Could not load contacts. Use Create New.", indicator: "orange" });
			}
		});
	}








	fetchAndInjectContact(record) {
		const me = this;
		const contactId = record.contact_person || "";
		if (!contactId) return;

		// If contact name already resolved, skip fetch
		if (record.contact_person_name || record.contact_display) return;

		frappe.call({
			method: "frappe.client.get",
			args: { doctype: "Contact", name: contactId },
			callback: (r) => {
				if (!r.message) return;
				const c = r.message;
				const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || c.name;
				const email = c.email_id || (Array.isArray(c.email_ids) && c.email_ids[0]?.email_id) || "";
				const phone = c.mobile_no || c.phone || (Array.isArray(c.phone_nos) && c.phone_nos[0]?.phone) || "";
				const av = name ? name.substring(0, 2).toUpperCase() : "—";

				me.$content.find("#olContactAv").text(av);
				me.$content.find("#olContactName").text(name || "—");
				me.$content.find("#olContactEmail").text(email || "—");
				me.$content.find("#olContactPhone").text(phone || "—");
			}
		});
	}






	injectDetailFinancials(record) {
		// Primary: compute from detailItems (already parsed in injectItemsTable)
		if (this.detailItems && this.detailItems.length) {
			let sellTotal = 0, buyTotal = 0;
			this.detailItems.forEach(it => {
				const disc = Number(it.discount || 0);
				const effSP = Number(it.sp || 0) * (1 - disc / 100);
				if (it.forecast === "Include" && it.sales_stage !== "Closed Lost" && it.sales_stage !== "Dead") {
					sellTotal += Number(it.qty || 0) * effSP;
					buyTotal += Number(it.qty || 0) * Number(it.bp || 0);
				}
			});
			const profit = sellTotal - buyTotal;
			this.$content.find("#olSellingAmt").text(this.formatCurrency(sellTotal));
			this.$content.find("#olBuyingAmt").text(this.formatCurrency(buyTotal));
			this.$content.find("#olProfitAmt").text(this.formatCurrency(profit));
			return;
		}

		// Fallback: read from record fields
		const toNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
		const pickNum = (src, keys) => {
			if (!src || !Array.isArray(keys)) return null;
			for (const k of keys) {
				if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
				const v = src[k]; if (v === null || v === undefined || v === "") continue;
				const n = Number(v); if (Number.isFinite(n)) return n;
			}
			return null;
		};
		const items = Array.isArray(record?.items) ? record.items : [];
		const sumItems = (keys) => items.reduce((s, it) => s + toNum(pickNum(it, keys)), 0);

		const selling = pickNum(record, ["total", "net_total", "rounded_total", "grand_total", "opportunity_amount"]) ?? this.selectedRecord?.amount ?? 0;
		const expProfit = pickNum(record, ["profit", "total_profit", "gross_profit", "margin_amount"]);
		const profit = expProfit !== null ? expProfit : sumItems(["margin_amount", "gross_profit"]);
		const expBuying = pickNum(record, ["buying_amount", "buying_amt", "cost_amount"]);
		const buying = expBuying !== null ? expBuying : Math.max(0, toNum(selling) - toNum(profit));

		this.$content.find("#olSellingAmt").text(this.formatCurrency(selling));
		this.$content.find("#olBuyingAmt").text(this.formatCurrency(buying));
		this.$content.find("#olProfitAmt").text(this.formatCurrency(profit));
	}

	injectItemsTable(record) {
		const items = Array.isArray(record?.items) ? record.items : [];
		const getVal = (item, keys) => {
			for (const k of keys) {
				if (Object.prototype.hasOwnProperty.call(item, k)) {
					const n = Number(item[k]);
					if (Number.isFinite(n)) return n;
				}
			}
			return 0;
		};

		const normalizeType = (v) => {
			const t = String(v || "").trim().toLowerCase();
			if (!t) return "new";
			if (t.includes("renew")) return "renewal";
			if (t.includes("add")) return "additional";
			return "new";
		};

		this.detailItems = items.map((item, i) => {
			const qty = getVal(item, ["qty", "quantity"]) || 1;
			const sp = getVal(item, ["rate", "price_list_rate", "net_rate"]);
			const bp = getVal(item, ["spq_rate", "buying_rate", "buying_price", "base_rate"]);
			return {
				id: item.name || item.item_code || `row-${i + 1}`,
				name: item.item_name || item.item_code || "-",
				code: item.item_code || "",
				brand: item.brand || "",
				type: normalizeType(item.opportunity_type || item.type),
				qty,
				sp,
				bp,
				uom: item.uom || item.stock_uom || "Nos",
				discount: Number(item.discount_percentage || item.discount || 0) || 0,
				sales_stage: String(item.sales_stage || "Initial Analysis").trim() || "Initial Analysis",
				expected_date: item.expected_date || "",
				description: item.description || "",
				renewId: item.renewal_id || "",
				orc: !!(item.orc),
				commission_type: item.commission_type || "",
				rate_value: Number(item.rate_value || 0),
				forecast: item.forecast || "",
				expanded: false,
			};
		});
		this._savedItemStages = (this.detailItems || []).map(it => it.sales_stage || "");

		this.renderDetailItemsTable();
		this.bindDetailItemCards();
	}


	renderDetailItemsTable() {
		const me = this;
		const $wrap = me.$content.find("#olItemsTableBody");
		const typeCls = { new: "ol-type-new", renewal: "ol-type-renewal", additional: "ol-type-additional" };
		const typeLabel = { new: "New", renewal: "Renewal", additional: "Additional" };
		const typeColor = { new: "#3b7ef8", renewal: "#16a34a", additional: "#d97706" };
		const fmtINR = n => Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
		const stageList = ["Initial Analysis", "POC/Demos/Webinar/Session", "Proposal", "Negotiation", "Order Expected", "Closed Won", "Closed Lost", "Dead"];

		if (!this.detailItems || !this.detailItems.length) {
			$wrap.html(`<div style="text-align:center;padding:36px;color:#9ca3af;font-size:12px;">
				<i class="ti ti-inbox" style="font-size:28px;display:block;margin-bottom:8px;"></i>
				No items yet. Click <strong>+ Add Item</strong> to get started.
			</div>`);
			this.calcDetailItemsSummary();
			return;
		}

		let cards = "";
		this.detailItems.forEach((item, idx) => {
			const disc = Number(item.discount || 0);
			const effSP = Number(item.sp || 0) * (1 - disc / 100);
			const sa = Number(item.qty || 0) * effSP;
			const rawSP = Number(item.sp || 0);
			const marginPct = rawSP > 0 ? (((rawSP - Number(item.bp || 0)) / rawSP) * 100) : 0;
			const marginColor = marginPct > 20 ? "#16a34a" : marginPct > 5 ? "#d97706" : "#dc2626";
			const marginAmt = (rawSP - Number(item.bp || 0)) * Number(item.qty || 0);
			const hasDesc = item.description && String(item.description).replace(/<[^>]*>/g, "").trim().length > 0;
			const orcOn = !!item.orc;

			const stageOpts = stageList.map(v =>
				`<option value="${v}" ${item.sales_stage === v ? "selected" : ""}>${v}</option>`).join("");
			const forecastOpts = ["", "Include", "Exclude"].map(v =>
				`<option value="${v}" ${(item.forecast || "") === v ? "selected" : ""}>${v || "—"}</option>`).join("");

			cards += `
				<div class="ol-di-card ol-di-row" data-idx="${idx}" draggable="true">
				
					<!-- ROW 1: identity + type + renewal id + pricing + delete -->
					<div class="ol-ic-row1">
						<div class="ol-ic-grip" title="Drag to reorder"><i class="ti ti-grip-vertical"></i></div>
						<div class="ol-ic-num">${idx + 1}</div>
				
						<div class="ol-ic-item ol-di-replace" data-idx="${idx}" title="Click to change item">
							<div class="ol-ic-name">${me.escapeAttr(item.name || "—")}</div>
							<div class="ol-ic-sub">
								${item.code ? me.escapeAttr(item.code) : ""}${item.code && item.brand && item.brand !== "—" ? "  ·  " : ""}${item.brand && item.brand !== "—" ? me.escapeAttr(item.brand) : ""}${(item.code || (item.brand && item.brand !== "—")) ? "  ·  " : ""}<span style="color:${typeColor[item.type] || "#3b7ef8"};font-weight:700;">${typeLabel[item.type] || "New"}</span>${item.renewId ? `<span class="ol-ic-renewid"><i class="ti ti-refresh"></i> ${me.escapeAttr(item.renewId)}</span>` : ""}
							</div>
						</div>
				
						<div class="ol-ic-field" style="width:60px;">
							<label class="ol-ic-label">Qty</label>
							<input class="ol-di-qty ol-ic-input" type="number" min="1" step="1" value="${item.qty}" style="text-align:right;">
						</div>
						<div class="ol-ic-field" style="width:110px;">
							<label class="ol-ic-label">SP (₹)</label>
							<input class="ol-di-sp ol-ic-input" type="number" min="0" step="0.01" value="${item.sp}" style="text-align:right;">
						</div>
						<div class="ol-ic-field" style="width:150px;">
							<label class="ol-ic-label">Sell Amt</label>
							<div class="ol-di-sa ol-sa-cell" style="white-space:nowrap;background:#eef3ff;color:#3b7ef8;font-weight:700;border-radius:6px;height:30px;display:flex;align-items:center;justify-content:flex-end;padding:0 8px;">₹${fmtINR(sa)}</div>
						</div>
						<div class="ol-ic-field" style="width:110px;">
							<label class="ol-ic-label">BP (₹)</label>
							<input class="ol-di-bp ol-ic-input" type="number" min="0" step="0.01" value="${item.bp || ""}" placeholder="0" style="text-align:right;">
						</div>
						<div class="ol-ic-field" style="width:140px;">
							<label class="ol-ic-label">Margin</label>
							<div class="ol-di-margin ol-margin-cell" style="white-space:nowrap;font-weight:700;border-radius:6px;height:30px;display:flex;align-items:center;justify-content:flex-end;padding:0 8px;color:${marginColor};background:${marginPct > 20 ? "rgba(22,163,74,0.08)" : marginPct > 5 ? "rgba(217,119,6,0.08)" : "rgba(220,38,38,0.08)"};">₹${fmtINR(marginAmt)}</div>
						</div>
				
						<div class="ol-ic-field" style="width:34px;align-items:center;margin-left:auto;">
							<label class="ol-ic-label">&nbsp;</label>
							<button class="ol-di-delete ol-ic-del" data-idx="${idx}" type="button" title="Remove item">
								<i class="ti ti-trash"></i>
							</button>
						</div>
					</div>
				
					<!-- ROW 2: ORC + forecast + stage + date + description (right aligned) -->
					<div class="ol-ic-row2">
					    ${(item.type === "renewal" || item.type === "additional") && item.renewId ? `
						<div class="ol-ic-field" style="width:130px;">
							<label class="ol-ic-label">Renewal ID</label>
							<div class="ol-ic-input" style="display:flex;align-items:center;background:rgba(22,163,74,0.06);border-color:rgba(22,163,74,0.3);color:#16a34a;font-weight:700;cursor:default;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
								<i class="ti ti-refresh" style="font-size:11px;margin-right:4px;flex-shrink:0;"></i>${me.escapeAttr(item.renewId)}
							</div>
						</div>` : ""}
						<div class="ol-ic-field" style="width:auto;align-items:flex-start;">
							<label class="ol-ic-label">ORC</label>
							<label class="ol-ic-orc-toggle">
								<input type="checkbox" class="ol-di-orc" ${orcOn ? "checked" : ""} style="position:absolute;opacity:0;width:0;height:0;">
								<span class="ol-ic-orc-slider"></span>
							</label>
						</div>
						<div class="ol-ic-field ol-di-orc-cond" style="width:148px;${orcOn ? "" : "display:none;"}">
							<label class="ol-ic-label">Commission Type</label>
							<select class="ol-di-commission-type ol-ic-input">
								<option value=""          ${!item.commission_type ? "selected" : ""}>— Select —</option>
								<option value="Unit Rate" ${item.commission_type === "Unit Rate" ? "selected" : ""}>Unit Rate</option>
								<option value="Value"     ${item.commission_type === "Value" ? "selected" : ""}>Value</option>
							</select>
						</div>
						<div class="ol-ic-field ol-di-orc-cond" style="width:130px;${orcOn ? "" : "display:none;"}">
							<label class="ol-ic-label">Rate / Value (₹)</label>
							<input class="ol-di-ratevalue ol-ic-input" type="number" step="0.01" value="${item.rate_value || ""}" placeholder="0.00" style="text-align:right;">
						</div>
				
						<div class="ol-ic-field" style="width:118px;">
							<label class="ol-ic-label">Forecast</label>
							<select class="ol-di-forecast ol-ic-input">${forecastOpts}</select>
						</div>
						<div class="ol-ic-field" style="width:158px;">
							<label class="ol-ic-label">Sales Stage</label>
							<select class="ol-di-stage ol-ic-input">${stageOpts}</select>
						</div>
						<div class="ol-ic-field" style="width:138px;">
							<label class="ol-ic-label">Exp. Close</label>
							<input class="ol-di-expected ol-ic-input" type="date" value="${item.expected_date || ""}">
						</div>
						<div class="ol-ic-field" style="width:34px;align-items:center;">
							<label class="ol-ic-label">Desc</label>
							<button class="ol-di-desc-btn ${hasDesc ? "has-desc" : ""}" data-idx="${idx}" type="button" title="Edit description">
								<i class="ti ${hasDesc ? "ti-file-check" : "ti-file-text"}"></i>
							</button>
						</div>
					</div>
				
				</div>`;
		});

		$wrap.html(cards);
		this.calcDetailItemsSummary();
		this.bindDetailItemCards();
		this.initDetailItemsDragDrop();
	}


	calcDetailItemsSummary() {
		const fmt = (v, d = 0) => Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
		const totalQty = (this.detailItems || []).reduce((s, it) => s + Number(it.qty || 0), 0);
		const totalAmt = (this.detailItems || []).reduce((s, it) => {
			const effSp = Number(it.sp || 0) * (1 - (Number(it.discount || 0) / 100));
			return s + Number(it.qty || 0) * effSp;
		}, 0);
		this.$content.find("#olItemsTotalQty").text(fmt(totalQty));
		this.$content.find("#olItemsSellAmt").text(`₹${fmt(totalAmt, 2)}`);
	}

	bindDetailItemCards() {
		const me = this;

		const markDirty = () => me.$content.find("#olItemsSaveBar").css("display", "flex");

		const recompute = ($card, idx) => {
			const qty = parseFloat($card.find(".ol-di-qty").val()) || 0;
			const sp = parseFloat($card.find(".ol-di-sp").val()) || 0;
			const bp = parseFloat($card.find(".ol-di-bp").val()) || 0;
			const disc = Number(me.detailItems[idx].discount || 0);
			const effSp = sp * (1 - disc / 100);
			const sa = qty * effSp;
			const marginAmt = (sp - bp) * qty;
			const marginPct = sp > 0 ? (((sp - bp) / sp) * 100) : 0;
			const fmt = v => "₹" + Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
			$card.find(".ol-di-sa").text(fmt(sa));
			$card.find(".ol-di-margin").text(fmt(marginAmt))
				.css("color", marginPct > 20 ? "#16a34a" : marginPct > 5 ? "#d97706" : "#dc2626");
		};

		// qty / sp / bp
		me.$content.off("input.olDICard change.olDICard", "#olItemsTableBody .ol-di-qty, #olItemsTableBody .ol-di-sp, #olItemsTableBody .ol-di-bp")
			.on("input.olDICard change.olDICard", "#olItemsTableBody .ol-di-qty, #olItemsTableBody .ol-di-sp, #olItemsTableBody .ol-di-bp", (e) => {
				const $card = $(e.currentTarget).closest(".ol-di-card");
				const idx = parseInt($card.data("idx"));
				if (!Number.isFinite(idx) || !me.detailItems[idx]) return;
				me.detailItems[idx].qty = parseFloat($card.find(".ol-di-qty").val()) || 1;
				me.detailItems[idx].sp = parseFloat($card.find(".ol-di-sp").val()) || 0;
				me.detailItems[idx].bp = parseFloat($card.find(".ol-di-bp").val()) || 0;
				recompute($card, idx);
				me.calcDetailItemsSummary();
				markDirty();
			});

		// stage / forecast / date
		me.$content.off("change.olDICard", "#olItemsTableBody .ol-di-stage, #olItemsTableBody .ol-di-forecast, #olItemsTableBody .ol-di-expected")
			.on("change.olDICard", "#olItemsTableBody .ol-di-stage, #olItemsTableBody .ol-di-forecast, #olItemsTableBody .ol-di-expected", (e) => {
				const $card = $(e.currentTarget).closest(".ol-di-card");
				const idx = parseInt($card.data("idx"));
				if (!Number.isFinite(idx) || !me.detailItems[idx]) return;
				me.detailItems[idx].sales_stage = $card.find(".ol-di-stage").val() || "Initial Analysis";
				me.detailItems[idx].forecast = $card.find(".ol-di-forecast").val() || "";
				me.detailItems[idx].expected_date = $card.find(".ol-di-expected").val() || "";
				markDirty();
			});

		// ORC toggle → show/hide inline commission fields
		me.$content.off("change.olDICard", "#olItemsTableBody .ol-di-orc")
			.on("change.olDICard", "#olItemsTableBody .ol-di-orc", (e) => {
				const $card = $(e.currentTarget).closest(".ol-di-card");
				const idx = parseInt($card.data("idx"));
				if (!Number.isFinite(idx) || !me.detailItems[idx]) return;
				const checked = $(e.currentTarget).prop("checked");
				me.detailItems[idx].orc = checked;
				$card.find(".ol-di-orc-cond").toggle(checked);
				if (!checked) {
					me.detailItems[idx].commission_type = "";
					me.detailItems[idx].rate_value = 0;
				}
				markDirty();
			});

		// commission / rate
		me.$content.off("input.olDICard change.olDICard", "#olItemsTableBody .ol-di-commission-type, #olItemsTableBody .ol-di-ratevalue")
			.on("input.olDICard change.olDICard", "#olItemsTableBody .ol-di-commission-type, #olItemsTableBody .ol-di-ratevalue", (e) => {
				const $card = $(e.currentTarget).closest(".ol-di-card");
				const idx = parseInt($card.data("idx"));
				if (!Number.isFinite(idx) || !me.detailItems[idx]) return;
				me.detailItems[idx].commission_type = $card.find(".ol-di-commission-type").val() || "";
				me.detailItems[idx].rate_value = parseFloat($card.find(".ol-di-ratevalue").val()) || 0;
				markDirty();
			});

		// click item → replace
		me.$content.off("click.olDICard", "#olItemsTableBody .ol-di-replace")
			.on("click.olDICard", "#olItemsTableBody .ol-di-replace", (e) => {
				const idx = parseInt($(e.currentTarget).data("idx"));
				if (!Number.isFinite(idx) || !me.detailItems[idx]) return;
				me.openDetailItemPopup(me.detailItems[idx].type || "new");
				// (replace-in-place can be added later; this opens the picker)
			});

		// description button → modal
		me.$content.off("click.olDICard", "#olItemsTableBody .ol-di-desc-btn")
			.on("click.olDICard", "#olItemsTableBody .ol-di-desc-btn", (e) => {
				e.stopPropagation();
				const idx = parseInt($(e.currentTarget).data("idx"));
				if (!Number.isFinite(idx) || !me.detailItems[idx]) return;
				me.openDetailDescModal(idx);
			});

		// delete
		me.$content.off("click.olDICard", "#olItemsTableBody .ol-di-delete")
			.on("click.olDICard", "#olItemsTableBody .ol-di-delete", (e) => {
				e.stopPropagation();
				const idx = parseInt($(e.currentTarget).data("idx"));
				if (!Number.isFinite(idx) || !me.detailItems[idx]) return;
				const nm = me.detailItems[idx].name || `Item ${idx + 1}`;
				me._showDeleteConfirm(nm, () => {
					me.detailItems.splice(idx, 1);
					me.renderDetailItemsTable();
					markDirty();
				});
			});
	}

	openDetailDescModal(idx) {
		const me = this;
		if (!me.detailItems[idx]) return;
		$("#olDIDescOverlay").remove();
		const itemName = me.detailItems[idx].name || `Item ${idx + 1}`;

		const $overlay = $(`
		<div id="olDIDescOverlay" style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9000;display:flex;align-items:center;justify-content:center;padding:20px;">
			<div style="background:#fff;border-radius:16px;width:100%;max-width:640px;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 24px 64px rgba(0,0,0,0.18);">
				<div style="padding:16px 20px 12px;border-bottom:1px solid rgba(0,0,0,0.08);display:flex;align-items:center;justify-content:space-between;">
					<div>
						<div style="font-family:Syne,sans-serif;font-size:15px;font-weight:700;color:#111827;display:flex;align-items:center;gap:8px;"><i class="ti ti-align-left" style="color:#3b7ef8;"></i> Description</div>
						<div style="font-size:11px;color:#9ca3af;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:560px;">${me.escapeAttr(itemName)}</div>
					</div>
					<button id="olDIDescClose" style="width:28px;height:28px;border-radius:50%;border:1px solid rgba(0,0,0,0.1);background:transparent;color:#9ca3af;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;"><i class="ti ti-x"></i></button>
				</div>
				<div style="flex:1;overflow-y:auto;padding:16px 20px;">
					<div id="olDIDescEditorHost"></div>
				</div>
				<div style="padding:12px 20px;border-top:1px solid rgba(0,0,0,0.08);background:#f8fafc;display:flex;justify-content:flex-end;gap:8px;">
					<button id="olDIDescCancel" style="padding:7px 16px;border-radius:6px;border:1px solid rgba(0,0,0,0.1);background:#fff;font-size:13px;cursor:pointer;color:#374151;">Cancel</button>
					<button id="olDIDescSave" style="padding:7px 18px;border-radius:6px;border:none;background:#3b7ef8;color:#fff;font-size:13px;font-weight:600;cursor:pointer;"><i class="ti ti-check" style="margin-right:4px;"></i> Save</button>
				</div>
			</div>
		</div>`);

		$("body").append($overlay);

		const ctrl = frappe.ui.form.make_control({
			parent: $overlay.find("#olDIDescEditorHost").get(0),
			df: { fieldname: "ol_di_desc_modal", fieldtype: "Text Editor", label: "" },
			render_input: true,
		});
		ctrl.set_value(me.detailItems[idx].description || "");

		const close = () => $overlay.remove();
		$overlay.on("click", "#olDIDescClose, #olDIDescCancel", close);
		$overlay.on("click", (e) => { if ($(e.target).is($overlay)) close(); });
		$overlay.on("click", "#olDIDescSave", () => {
			me.detailItems[idx].description = ctrl.get_value() || "";
			const hasDesc = String(me.detailItems[idx].description).replace(/<[^>]*>/g, "").trim().length > 0;
			const $btn = me.$content.find(`#olItemsTableBody .ol-di-desc-btn[data-idx="${idx}"]`);
			$btn.toggleClass("has-desc", hasDesc);
			$btn.find("i").attr("class", `ti ${hasDesc ? "ti-file-check" : "ti-file-text"}`);
			me.$content.find("#olItemsSaveBar").css("display", "flex");  // mark dirty
			close();
		});
	}


	_bindCommentMentions() {
		const me = this;
		const $ta = me.$content.find("#commentText");
		const $dd = me.$content.find("#mentionDropdown");
		if (!$ta.length || !$dd.length) return;
		if (!me._mentionMap) me._mentionMap = {};

		me._loadMentionUsers();   // warm the cache

		const renderItems = (list) => {
			if (!list.length) { $dd.addClass("hidden").hide(); return; }
			$dd.html(list.slice(0, 8).map(u => {
				const initials = (u.label || "?").split(" ").map(w => w[0]).join("").substring(0, 2).toUpperCase();
				return `<div class="mention-item" data-email="${me.escapeAttr(u.email)}" data-name="${me.escapeAttr(u.label)}">
					<div class="mention-avatar">${me.escapeAttr(initials)}</div>
					<div><div class="mention-name">${me.escapeAttr(u.label)}</div><div class="mention-role">${me.escapeAttr(u.email)}</div></div>
				</div>`;
			}).join("")).removeClass("hidden").show();
		};

		// detect "@query" at the caret
		$ta.off("input.olMention keyup.olMention").on("input.olMention keyup.olMention", function () {
			const val = this.value;
			const caret = this.selectionStart;
			const before = val.slice(0, caret);
			const m = before.match(/@([^\s@]*)$/);   // @ followed by non-space, at caret
			if (!m) { $dd.addClass("hidden").hide(); return; }
			const q = (m[1] || "").toLowerCase();
			const users = me._mentionUsers || [];
			const filtered = q ? users.filter(u => u.label.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) : users;
			renderItems(filtered);
		});

		// pick a mention
		$dd.off("click.olMention", ".mention-item").on("click.olMention", ".mention-item", function () {
			const email = $(this).data("email");
			const name = $(this).data("name");
			if (!email || !name) { $dd.addClass("hidden").hide(); return; }
			const ta = $ta[0];
			const val = ta.value;
			const caret = ta.selectionStart;
			const before = val.slice(0, caret);
			const after = val.slice(caret);
			// replace the trailing "@query" with "@Full Name "
			const newBefore = before.replace(/@([^\s@]*)$/, "@" + name + " ");
			ta.value = newBefore + after;
			// record for the save handler → drives the email
			me._mentionMap[name] = email;
			$dd.addClass("hidden").hide();
			ta.focus();
			const pos = newBefore.length;
			ta.setSelectionRange(pos, pos);
		});

		// hide dropdown on outside click
		me.$content.off("click.olMentionHide").on("click.olMentionHide", (e) => {
			if (!$(e.target).closest("#mentionDropdown, #commentText").length) $dd.addClass("hidden").hide();
		});
	}
	_loadMentionUsers() {
		const me = this;
		if (me._mentionUsers) return Promise.resolve(me._mentionUsers);
		return new Promise((resolve) => {
			frappe.call({
				method: "frappe.client.get_list",
				args: {
					doctype: "User",
					filters: { enabled: 1, user_type: "System User" },
					fields: ["name", "full_name"],
					limit_page_length: 0,
					order_by: "full_name asc",
				},
				callback: (r) => {
					me._mentionUsers = (r.message || [])
						.filter(u => u.name && !["Administrator", "Guest"].includes(u.name))
						.map(u => ({ email: u.name, label: u.full_name || u.name }));
					resolve(me._mentionUsers);
				},
				error: () => { me._mentionUsers = []; resolve([]); },
			});
		});
	}


	_goDIWizStep($row, targetStep) {
		if (!$row || !$row.length || !Number.isFinite(targetStep)) return;

		// Update stepper buttons
		$row.find(".ol-exp-wiz-step").each(function () {
			const sn = parseInt($(this).data("wizStep"));
			$(this).removeClass("active done");
			if (sn === targetStep) $(this).addClass("active");
			else if (sn < targetStep) $(this).addClass("done");
		});

		// Update connector lines
		$row.find(".ol-exp-wiz-connector").each(function (i) {
			$(this).toggleClass("done", (i + 1) < targetStep);
		});

		// Animate panel switch
		const $panels = $row.find(".ol-exp-wiz-panel");
		$panels.removeClass("active");
		const $target = $row.find(`.ol-exp-wiz-panel[data-wiz-panel="${targetStep}"]`);
		if ($target.length) {
			const el = $target.get(0);
			el.style.animation = "none";
			requestAnimationFrame(() => {
				el.style.animation = "";
				$target.addClass("active");
			});
		}
	}

	initDetailItemsDragDrop() {
		const me = this;
		const $wrap = me.$content.find("#olItemsTableBody");
		if (!$wrap.length) return;
		let dragIdx = null;

		$wrap.find(".ol-di-card").each(function () {
			const el = this;
			const idx = parseInt($(el).data("idx"));
			el.addEventListener("dragstart", (e) => {
				dragIdx = idx;
				e.dataTransfer.effectAllowed = "move";
				$(el).css("opacity", "0.45");
			});
			el.addEventListener("dragend", () => {
				$(el).css("opacity", "1");
				$wrap.find(".ol-di-card").css("border-top", "");
			});
			el.addEventListener("dragover", (e) => {
				e.preventDefault();
				if (!Number.isFinite(dragIdx)) return;
				$wrap.find(".ol-di-card").css("border-top", "");
				if (parseInt($(el).data("idx")) !== dragIdx) $(el).css("border-top", "2px solid #3b7ef8");
			});
			el.addEventListener("drop", (e) => {
				e.preventDefault();
				const dropIdx = parseInt($(el).data("idx"));
				if (dragIdx === null || dragIdx === dropIdx) return;
				const moved = me.detailItems.splice(dragIdx, 1)[0];
				me.detailItems.splice(dropIdx, 0, moved);
				dragIdx = null;
				me.renderDetailItemsTable();
				me.$content.find("#olItemsSaveBar").css("display", "flex");
			});
		});
	}


	injectDetailActivities() {
		const me = this;
		const $list = this.$content.find("#activityList");
		if (!$list.length) return;
		$list.empty();

		if (!this.detailActivities.length) {
			$list.html('<div style="padding:20px;text-align:center;color:#9ca3af;font-size:12px;">No activities yet</div>');
			return;
		}

		const iconMap = { Note: "ti-notes", Call: "ti-phone", Appointment: "ti-calendar-event", Task: "ti-checklist", Comment: "ti-message-circle" };
		const colorMap = { Note: "#3b7ef8", Call: "#16a34a", Appointment: "#d97706", Task: "#dc2626", Comment: "#7c3aed" };

		// this.detailActivities.forEach((a) => {
		// 	const icon = iconMap[a.type] || "ti-notes";
		// 	const color = colorMap[a.type] || "#9ca3af";
		// 	$list.append(`
		// 	<div class="act-item" data-tab="${a.tab}" data-status="${a.status}"
		// 		style="display:flex;align-items:flex-start;gap:12px;
		// 			padding:12px 16px;border-bottom:1px solid rgba(0,0,0,0.05);">
		// 		<div style="width:30px;height:30px;border-radius:8px;
		// 			background:${color}15;color:${color};
		// 			display:flex;align-items:center;justify-content:center;
		// 			font-size:14px;flex-shrink:0;margin-top:1px;">
		// 			<i class="ti ${icon}"></i>
		// 		</div>
		// 		<div style="flex:1;min-width:0;">
		// 			<div style="font-size:13px;color:#111827;line-height:1.5;word-break:break-word;text-align:left;white-space:pre-wrap;">${me.escapeAttr(a.title)}</div>
		// 			<div style="font-size:11px;color:#9ca3af;margin-top:3px;
		// 				display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
		// 				<span>${me.escapeAttr(a.owner)}</span>
		// 				<span>·</span>
		// 				<span>${a.created}</span>
		// 				${a.meta ? `<span>·</span><span style="color:#374151;">${me.escapeAttr(a.meta)}</span>` : ""}
		// 			</div>
		// 		</div>
		// 		<div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0;margin-top:2px;">
		// 			<span style="font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;
		// 				background:${color}15;color:${color};white-space:nowrap;">
		// 				${me.escapeAttr(a.type)}
		// 			</span>
		// 			${["Note","Call","Appointment","Task"].includes(a.type) ? `
		// 			<button class="ol-act-edit" data-act-type="${a.type}" data-act-id="${me.escapeAttr(a.id)}"
		// 				title="Edit" style="border:none;background:transparent;color:#9ca3af;cursor:pointer;padding:2px;display:inline-flex;">
		// 				<i class="ti ti-pencil" style="font-size:13px;"></i>
		// 			</button>` : ""}
		// 		</div>
		// 	</div>`);
		// });

		this.detailActivities.forEach((a) => {
			const icon = iconMap[a.type] || "ti-notes";
			const color = colorMap[a.type] || "#9ca3af";
			const hasEdit = ["Note", "Call", "Appointment", "Task"].includes(a.type);
			$list.append(`
			<div class="act-item" data-tab="${a.tab}" data-status="${a.status}"
				style="display:flex;align-items:flex-start;gap:12px;
					padding:12px 16px;border-bottom:1px solid rgba(0,0,0,0.05);">
				<div style="width:30px;height:30px;border-radius:8px;
					background:${color}15;color:${color};
					display:flex;align-items:center;justify-content:center;
					font-size:14px;flex-shrink:0;margin-top:1px;">
					<i class="ti ${icon}"></i>
				</div>
				<div style="flex:1;min-width:0;">
					<div style="font-size:13px;color:#111827;line-height:1.5;word-break:break-word;text-align:left;white-space:pre-wrap;display:flex;align-items:flex-start;"><span>${me.escapeAttr(a.title)}</span>${hasEdit ? `<span style="display:inline-flex;align-items:center;gap:4px;margin-left:6px;vertical-align:middle;"><button class="ol-act-edit" data-act-type="${a.type}" data-act-id="${me.escapeAttr(a.id)}" title="Edit" style="border:none;background:transparent;color:#2f4de0;cursor:pointer;padding:2px;display:inline-flex;"><i class="ti ti-pencil" style="font-size:13px;"></i></button></span>` : ""}</div>
					<div style="font-size:11px;color:#9ca3af;margin-top:3px;
						display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
						<span>${me.escapeAttr(a.owner)}</span>
						<span>·</span>
						<span>${a.created}</span>
						${a.meta ? `<span>·</span><span style="color:#374151;">${me.escapeAttr(a.meta)}</span>` : ""}
					</div>
				</div>
				<div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0;margin-top:2px;">
					<span style="font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;
						background:${color}15;color:${color};white-space:nowrap;">
						${me.escapeAttr(a.type)}
					</span>
				</div>
			</div>`);
		});


		$list.off("click.olActEdit", ".ol-act-edit").on("click.olActEdit", ".ol-act-edit", function (e) {
			e.preventDefault();
			e.stopPropagation();
			const type = $(this).data("actType");
			const id = $(this).data("actId");
			me._openActivityEditModal(type, id);
		});

		this.applyFilter();


	}



	_openActivityEditModal(type, docname) {
		const me = this;
		if (!type || !docname) return;
		const dtMap = { Note: "CRM Note", Call: "Call List", Appointment: "Appointment", Task: "Task" };
		const doctype = dtMap[type];
		if (!doctype) return;

		frappe.call({
			method: "frappe.client.get",
			args: { doctype, name: docname },
			callback: (r) => {
				const doc = r.message;
				if (!doc) { frappe.show_alert({ message: "Could not load record.", indicator: "red" }); return; }
				me._renderActivityEditModal(type, doctype, doc);
			},
			error: () => frappe.show_alert({ message: "Could not load record.", indicator: "red" }),
		});
	}

	_renderActivityEditModal(type, doctype, doc) {
		const me = this;
		$("#olActEditOverlay").remove();

		// build the body fields per type
		const esc = (v) => me.escapeAttr(v == null ? "" : String(v));
		let body = "";
		if (type === "Note") {
			body = `
				<div class="ol-field">
					<label class="ol-field-label">Note</label>
					<textarea class="ol-field-input" id="aeNote" rows="5" style="resize:vertical;">${esc(me._htmlToText(doc.note))}</textarea>
				</div>`;
		} else if (type === "Call") {
			const opts = ["Scheduled", "Held", "Cancelled", "Not Responding"];
			body = `
				<div class="ol-field"><label class="ol-field-label">Subject</label>
					<input class="ol-field-input" id="aeSubject" value="${esc(doc.subject)}"></div>
				<div class="ol-field" style="margin-top:10px;"><label class="ol-field-label">Status</label>
					<select class="ol-field-input" id="aeStatus">
						${opts.map(o => `<option value="${o}" ${doc.status === o ? "selected" : ""}>${o}</option>`).join("")}
					</select></div>
				<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px;">
					<div class="ol-field"><label class="ol-field-label">Start Date</label>
						<input type="date" class="ol-field-input" id="aeStartDate" value="${esc(doc.start_date)}"></div>
					<div class="ol-field"><label class="ol-field-label">Start Time</label>
						<input type="time" class="ol-field-input" id="aeStartTime" value="${esc(doc.start_timing)}"></div>
					<div class="ol-field"><label class="ol-field-label">End Date</label>
						<input type="date" class="ol-field-input" id="aeEndDate" value="${esc(doc.end_date)}"></div>
					<div class="ol-field"><label class="ol-field-label">End Time</label>
						<input type="time" class="ol-field-input" id="aeEndTime" value="${esc(doc.end_timing)}"></div>
				</div>
				<div class="ol-field" style="margin-top:10px;"><label class="ol-field-label">Description</label>
					<textarea class="ol-field-input" id="aeDesc" rows="3" style="resize:vertical;">${esc(doc.description)}</textarea></div>`;
		} else if (type === "Appointment") {
			const dt = (doc.scheduled_time || "").replace(" ", "T").slice(0, 16);
			body = `
				<div class="ol-field"><label class="ol-field-label">Subject</label>
					<input class="ol-field-input" id="aeSubject" value="${esc(doc.subject || doc.custom_subject)}"></div>
				<div class="ol-field" style="margin-top:10px;"><label class="ol-field-label">Scheduled Time</label>
					<input type="datetime-local" class="ol-field-input" id="aeSched" value="${esc(dt)}"></div>
				<div class="ol-field" style="margin-top:10px;"><label class="ol-field-label">Details</label>
				
					<textarea class="ol-field-input" id="aeDetails" rows="3" style="resize:vertical;">${esc(doc.customer_details)}</textarea>
					</div>
					<div class="ol-field" style="margin-top:10px;">
					<label class="ol-field-label">Participants</label>
					<div style="position:relative;">
						<div id="aePartTrigger" style="border:1px solid rgba(0,0,0,0.12);border-radius:8px;padding:8px 12px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;background:#fff;">
							<span id="aePartLabel" style="font-size:12px;color:#9ca3af;">Search & select participants…</span>
							<i class="ti ti-chevron-down" style="font-size:13px;color:#9ca3af;"></i>
						</div>
						<div id="aePartMenu" style="display:none;position:absolute;top:calc(100% + 4px);left:0;right:0;max-height:240px;overflow-y:auto;background:#fff;border:1px solid rgba(0,0,0,0.1);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.12);z-index:9300;padding:6px;"></div>
					</div>
					<div id="aePartChips" style="margin-top:8px;display:flex;flex-wrap:wrap;"></div>
				</div>`;
		} else if (type === "Task") {
			const prio = ["Low", "Medium", "High"];
			const end = (doc.exp_end_date || "").replace(" ", "T").slice(0, 16);
			body = `
				<div class="ol-field"><label class="ol-field-label">Subject</label>
					<input class="ol-field-input" id="aeSubject" value="${esc(doc.subject)}"></div>
				<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px;">
					<div class="ol-field"><label class="ol-field-label">Priority</label>
						<select class="ol-field-input" id="aePriority">
							${prio.map(p => `<option value="${p}" ${doc.priority === p ? "selected" : ""}>${p}</option>`).join("")}
						</select></div>
					<div class="ol-field"><label class="ol-field-label">Expected End</label>
						<input type="datetime-local" class="ol-field-input" id="aeEnd" value="${esc(end)}"></div>
				</div>
				<div class="ol-field" style="margin-top:10px;"><label class="ol-field-label">Description</label>
					<textarea class="ol-field-input" id="aeDesc" rows="3" style="resize:vertical;">${esc(me._stripHtml(doc.description))}</textarea></div>
					<div class="ol-field" style="margin-top:10px;">
					<label class="ol-field-label">Assign To</label>
					<div style="position:relative;">
						<div id="aeTaskAssignTrigger" style="border:1px solid rgba(0,0,0,0.12);border-radius:8px;padding:8px 12px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;background:#fff;">
							<span id="aeTaskAssignLabel" style="font-size:12px;color:#9ca3af;">Search & select users…</span>
							<i class="ti ti-chevron-down" style="font-size:13px;color:#9ca3af;"></i>
						</div>
						<div id="aeTaskAssignMenu" style="display:none;position:absolute;top:calc(100% + 4px);left:0;right:0;max-height:240px;overflow-y:auto;background:#fff;border:1px solid rgba(0,0,0,0.1);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.12);z-index:9300;padding:6px;"></div>
					</div>
					<div id="aeTaskAssignChips" style="margin-top:8px;display:flex;flex-wrap:wrap;"></div>
				</div>`;
		}

		const $ov = $(`
		<div id="olActEditOverlay" style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9200;display:flex;align-items:center;justify-content:center;padding:20px;">
			<div style="background:#fff;border-radius:16px;width:100%;max-width:520px;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 24px 64px rgba(0,0,0,0.18);">
				<div style="padding:16px 22px;border-bottom:1px solid rgba(0,0,0,0.08);display:flex;align-items:center;justify-content:space-between;">
					<div style="font-family:Syne,sans-serif;font-size:15px;font-weight:700;color:#111827;">Edit ${esc(type)}</div>
					<button id="aeClose" style="width:30px;height:30px;border-radius:50%;border:1px solid rgba(0,0,0,0.1);background:transparent;color:#9ca3af;cursor:pointer;display:flex;align-items:center;justify-content:center;"><i class="ti ti-x"></i></button>
				</div>
				<div style="flex:1;overflow-y:auto;padding:18px 22px;">${body}</div>
				<div style="padding:12px 22px;border-top:1px solid rgba(0,0,0,0.08);display:flex;justify-content:flex-end;gap:8px;background:#f8fafc;">
					<button id="aeCancel" style="padding:8px 16px;border-radius:6px;border:1px solid rgba(0,0,0,0.1);background:#fff;font-size:13px;cursor:pointer;color:#374151;">Cancel</button>
					<button id="aeSave" class="btn btn-primary" style="padding:8px 20px;"><i class="ti ti-device-floppy" style="margin-right:4px;"></i>Save</button>
				</div>
			</div>
		</div>`);
		me.$content.append($ov);

		if (type === "Appointment") {
			const pre = (Array.isArray(doc.custom_participants) ? doc.custom_participants : [])
				.map(r => r.user).filter(Boolean);
			me._buildParticipantsPicker({
				triggerSel: "#aePartTrigger",
				menuSel: "#aePartMenu",
				labelSel: "#aePartLabel",
				chipsSel: "#aePartChips",
				preselected: pre,
				ns: "aeApptPart",
			});
		}
		if (type === "Task") {
			const pre = (Array.isArray(doc.custom_users) ? doc.custom_users : [])
				.map(r => r.user).filter(Boolean);
			me._buildParticipantsPicker({
				triggerSel: "#aeTaskAssignTrigger",
				menuSel: "#aeTaskAssignMenu",
				labelSel: "#aeTaskAssignLabel",
				chipsSel: "#aeTaskAssignChips",
				preselected: pre,
				ns: "aeTaskAssign",
			});
		}

		const close = () => $ov.remove();
		$ov.on("click", "#aeClose, #aeCancel", close);
		$ov.on("click", (e) => { if ($(e.target).is($ov)) close(); });

		$ov.on("click", "#aeSave", () => {
			const updates = {};
			if (type === "Note") {

				updates.note = $ov.find("#aeNote").val().trim().replace(/\n/g, "<br>");
			} else if (type === "Call") {
				updates.subject = $ov.find("#aeSubject").val().trim();
				updates.status = $ov.find("#aeStatus").val();
				updates.start_date = $ov.find("#aeStartDate").val();
				updates.start_timing = $ov.find("#aeStartTime").val();
				updates.end_date = $ov.find("#aeEndDate").val();
				updates.end_timing = $ov.find("#aeEndTime").val();
				updates.description = $ov.find("#aeDesc").val().trim();
			} else if (type === "Appointment") {
				updates.subject = $ov.find("#aeSubject").val().trim();
				updates.scheduled_time = ($ov.find("#aeSched").val() || "").replace("T", " ");
				updates.customer_details = $ov.find("#aeDetails").val().trim();
			} else if (type === "Task") {
				updates.subject = $ov.find("#aeSubject").val().trim();
				updates.priority = $ov.find("#aePriority").val();
				const end = $ov.find("#aeEnd").val();
				updates.exp_end_date = end ? end.replace("T", " ") + ":00" : "";
				updates.description = $ov.find("#aeDesc").val().trim();
			}



			const afterSave = () => {
				frappe.show_alert({ message: `${type} updated.`, indicator: "green" });
				close();
				const oppName = me.detailRecord?.name || me.selectedRecord?.id;
				// for Note, re-fetch the opportunity first (notes are a child table on it)
				const reload = () => me.fetchDetailActivities(oppName).then(() => me.injectDetailActivities());
				if (type === "Note") {
					frappe.call({
						method: "frappe.client.get",
						args: { doctype: "Opportunity", name: oppName },
						callback: (r2) => { if (r2.message) me.detailRecord = r2.message; reload(); },
						error: reload,
					});
				} else {
					reload();
				}
			};

			if (type === "Note") {
				// Update ONLY the single CRM Note row — do NOT save the parent Opportunity,
				// or every note's timestamp gets re-stamped to the parent's save time.
				frappe.call({
					method: "frappe.client.get",
					args: { doctype: "CRM Note", name: doc.name },
					callback: (r) => {
						const noteDoc = r.message;
						if (!noteDoc) { frappe.show_alert({ message: "Could not load note.", indicator: "red" }); return; }
						noteDoc.note = updates.note;
						frappe.call({
							method: "frappe.client.save",
							args: { doc: noteDoc },
							callback: (r2) => { if (r2.message) afterSave(); },
							error: () => frappe.show_alert({ message: "Failed to update Note.", indicator: "red" }),
						});
					},
					error: () => frappe.show_alert({ message: "Could not load note.", indicator: "red" }),
				});
			} else if (type === "Appointment") {
				// participants is a child table → get + save the whole Appointment
				const partSet = me.$content.find("#aePartMenu").data("selected") || new Set();
				frappe.call({
					method: "frappe.client.get",
					args: { doctype: "Appointment", name: doc.name },
					callback: (r) => {
						const ap = r.message;
						if (!ap) { frappe.show_alert({ message: "Could not load appointment.", indicator: "red" }); return; }
						ap.subject = updates.subject;
						ap.scheduled_time = updates.scheduled_time;
						ap.customer_details = updates.customer_details;
						ap.custom_participants = [...partSet].map(id => ({ user: id }));
						frappe.call({
							method: "frappe.client.save",
							args: { doc: ap },
							callback: (r2) => { if (r2.message) afterSave(); },
							error: () => frappe.show_alert({ message: "Failed to update Appointment.", indicator: "red" }),
						});
					},
					error: () => frappe.show_alert({ message: "Could not load appointment.", indicator: "red" }),
				});
			} else if (type === "Task") {
				const assignSet = me.$content.find("#aeTaskAssignMenu").data("selected") || new Set();
				frappe.call({
					method: "frappe.client.get",
					args: { doctype: "Task", name: doc.name },
					callback: (r) => {
						const tk = r.message;
						if (!tk) { frappe.show_alert({ message: "Could not load task.", indicator: "red" }); return; }
						tk.subject = updates.subject;
						tk.priority = updates.priority;
						tk.exp_end_date = updates.exp_end_date;
						tk.description = updates.description;
						tk.custom_users = [...assignSet].map(id => ({ user: id }));
						frappe.call({
							method: "frappe.client.save",
							args: { doc: tk },
							callback: (r2) => { if (r2.message) afterSave(); },
							error: () => frappe.show_alert({ message: "Failed to update Task.", indicator: "red" }),
						});
					},
					error: () => frappe.show_alert({ message: "Could not load task.", indicator: "red" }),
				});
			} else {
				frappe.call({
					method: "frappe.client.set_value",
					args: { doctype, name: doc.name, fieldname: updates },
					callback: (r) => { if (r.message) afterSave(); },
					error: () => frappe.show_alert({ message: `Failed to update ${type}.`, indicator: "red" }),
				});
			}




		});
	}

	_stripHtml(html) {
		if (!html) return "";
		const tmp = document.createElement("div");
		tmp.innerHTML = String(html);
		return (tmp.textContent || tmp.innerText || "").trim();
	}
	_htmlToText(html) {
		if (!html) return "";
		let s = String(html).replace(/<br\s*\/?>/gi, "\n");   // <br> → newline
		const tmp = document.createElement("div");
		tmp.innerHTML = s;
		return (tmp.textContent || tmp.innerText || "").trim();
	}

	injectDetailAttachments() {
		const me = this;
		const $list = this.$content.find("#olAttFileList");
		if (!$list.length) return;

		const extIcon = (name) => {
			const ext = (name || "").split(".").pop().toLowerCase();
			return {
				pdf: "ti-file-type-pdf", doc: "ti-file-type-doc", docx: "ti-file-type-doc",
				xls: "ti-file-spreadsheet", xlsx: "ti-file-spreadsheet",
				png: "ti-photo", jpg: "ti-photo", jpeg: "ti-photo"
			}[ext] || "ti-file";
		};
		const fmtSize = (b) => {
			if (!b) return "";
			if (b < 1024) return `${b} B`;
			if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
			return `${(b / 1048576).toFixed(1)} MB`;
		};

		const renderFiles = () => {
			if (!me.detailAttachments.length) {
				$list.html(`<div style="text-align:center;padding:8px;font-size:12px;color:#9ca3af;">
					No attachments yet</div>`);
				return;
			}
			$list.html(me.detailAttachments.map(f => `
				<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;
					background:#f8fafc;border:1px solid rgba(0,0,0,0.07);border-radius:8px;">
					<i class="ti ${extIcon(f.name)}"
						style="font-size:20px;color:#3b7ef8;flex-shrink:0;"></i>
					<div style="flex:1;min-width:0;">
						<a href="${me.escapeAttr(f.url)}" target="_blank"
							style="font-size:12px;font-weight:600;color:#111827;
								white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
								display:block;text-decoration:none;"
							onmouseenter="this.style.color='#3b7ef8'"
							onmouseleave="this.style.color='#111827'">
							${me.escapeAttr(f.name)}
						</a>
						<div style="font-size:10px;color:#9ca3af;margin-top:1px;">
							${fmtSize(f.size)}${f.size ? " · " : ""}${me.escapeAttr(f.owner)} · ${f.created}
						</div>
						${f.description ? `<div style="font-size:11px;color:#374151;margin-top:3px;
							font-style:italic;">${me.escapeAttr(f.description)}</div>` : ""}
					</div>
					<a href="${me.escapeAttr(f.url)}" download="${me.escapeAttr(f.name)}"
						style="width:26px;height:26px;border-radius:6px;
							border:1px solid rgba(0,0,0,0.1);background:#fff;
							display:flex;align-items:center;justify-content:center;
							color:#6b7280;text-decoration:none;flex-shrink:0;"
						title="Download">
						<i class="ti ti-download" style="font-size:13px;"></i>
					</a>
				</div>`).join(""));
		};

		renderFiles();

		// Upload zone click
		this.$content.off("click.olAtt", "#olAttUploadZone")
			.on("click.olAtt", "#olAttUploadZone", () => {
				const record = me.detailRecord || me.selectedRecord;
				if (!record?.name) return;

				const description = me.$content.find("#olAttDescription").val().trim();

				new frappe.ui.FileUploader({
					doctype: "Opportunity",
					docname: record.name,
					on_success: (file) => {
						// Save description as a comment on the file if provided
						if (description && file.name) {
							frappe.call({
								method: "frappe.client.insert",
								args: {
									doc: {
										doctype: "Comment",
										comment_type: "Info",
										reference_doctype: "File",
										reference_name: file.name,
										content: description,
									}
								},
							});
						}

						me.detailAttachments.unshift({
							id: file.name,
							name: file.file_name || file.name,
							url: file.file_url || "",
							size: file.file_size || 0,
							owner: frappe.session.user,
							created: "Just now",
							description: description,
						});

						// Clear description after upload
						me.$content.find("#olAttDescription").val("");

						renderFiles();
						frappe.show_alert({ message: "File uploaded!", indicator: "green" });
					},
				});
			});
	}

	setPageTitle() {
		if (!this.selectedRecord) {
			document.title = "Opportunities";
			this.page.set_title("Opportunities");
			return;
		}
		const name = this.$content.find(".customer-name").text().trim();
		const title = name ? `Opportunity — ${name}` : "Opportunity Detail";
		document.title = title;
		this.page.set_title("");
		// Hide Frappe's page head which shows "CUSTOM PAGE OPPORTUNITY"
		$(this.wrapper).find(".page-head").css("display", "none");
	}

	// ─── ACTIVITY FILTERS ─────────────────────────────────────────
	// bindActivityFilters() {
	// 	const me = this;
	// 	const $tabs = this.$content.find("#actTabs");
	// 	const $filter = this.$content.find("#actFilter");

	// 	// catch every .act-tab in the activity card (heading + the tab strip)
	// 	const $actHeader = $tabs.closest(".card");
	// 	$actHeader.off("click.olTab", ".act-tab").on("click.olTab", ".act-tab", (e) => {
	// 		const $t  = $(e.currentTarget);
	// 		const tab = String($t.data("tab") || "notes");



	// 		// sync tab styling to the active tab on render (don't trust template classes)
	// 		$actHeader.find(".act-tab").each(function () {
	// 			const $x = $(this);
	// 			const isActive  = String($x.data("tab")) === me.activeTab;
	// 			const isHeading = $x.data("tab") === "activity";
	// 			$x.css({
	// 				color: isActive ? "#3b7ef8" : "#9ca3af",
	// 				borderBottom: isActive ? "2px solid #3b7ef8" : "2px solid transparent",
	// 			});
	// 			if (isHeading) $x.css({ "font-weight": "700", "font-size": "14px" });
	// 		});
	// 		$actHeader.find(".act-tab").removeClass("active");
	// 		$t.addClass("active");

	// 		// this.applyFilter();

	// 		// activate the clicked one
	// 		$t.css({ color: "#3b7ef8", borderBottom: "2px solid #3b7ef8" });

	// 		me.activeTab = tab;
	// 		$filter.toggle(tab !== "attachments");
	// 		me.applyFilter();
	// 	});

	// 	$filter.off("click.ol", ".act-filter").on("click.ol", ".act-filter", (e) => {
	// 		const $f = $(e.currentTarget);
	// 		$filter.find(".act-filter").css({
	// 			background: "#f1f5f9", color: "#6b7280", border: "1px solid rgba(0,0,0,0.08)"
	// 		});
	// 		$f.css({
	// 			background: "rgba(59,126,248,0.1)", color: "#3b7ef8",
	// 			border: "1px solid rgba(59,126,248,0.2)"
	// 		});
	// 		me.activeFilter = String($f.data("filter") || "all");
	// 		me.applyFilter();
	// 	});

	// 	this.applyFilter();
	// }

	// ─── ACTIVITY FILTERS ─────────────────────────────────────────
	bindActivityFilters() {
		const me = this;
		const $tabs = this.$content.find("#actTabs");
		const $filter = this.$content.find("#actFilter");
		const $actHeader = $tabs.closest(".card");

		$actHeader.off("click.olTab", ".act-tab").on("click.olTab", ".act-tab", (e) => {
			const tab = String($(e.currentTarget).data("tab") || "notes");
			$actHeader.find(".act-tab").removeClass("active");
			$(e.currentTarget).addClass("active");
			me.activeTab = tab;
			me.applyFilter();
		});

		$filter.off("click.ol", ".act-filter").on("click.ol", ".act-filter", (e) => {
			const $f = $(e.currentTarget);
			$filter.find(".act-filter").css({ background: "#f1f5f9", color: "#6b7280", border: "1px solid rgba(0,0,0,0.08)" });
			$f.css({ background: "rgba(59,126,248,0.1)", color: "#3b7ef8", border: "1px solid rgba(59,126,248,0.2)" });
			me.activeFilter = String($f.data("filter") || "scheduled");
			me.applyFilter();
		});

		// sync the active CLASS to activeTab on render (no inline styles)
		$actHeader.find(".act-tab").removeClass("active");
		$actHeader.find(`.act-tab[data-tab="${me.activeTab}"]`).addClass("active");

		// highlight the pill matching the active filter (Scheduled by default)
		$filter.find(".act-filter").css({ background: "#f1f5f9", color: "#6b7280", border: "1px solid rgba(0,0,0,0.08)" });
		$filter.find(`.act-filter[data-filter="${me.activeFilter}"]`)
			.css({ background: "rgba(59,126,248,0.1)", color: "#3b7ef8", border: "1px solid rgba(59,126,248,0.2)" });



		this.applyFilter();
	}


	applyFilter() {
		if (!this.activeFilter) this.activeFilter = "scheduled";
		const isAttach = this.activeTab === "attachments";
		const isNotes = this.activeTab === "notes";
		const isActivity = this.activeTab === "activity";
		this.$content.find("#activityList").toggle(!isAttach);
		this.$content.find("#attachmentsPanel").toggleClass("hidden", !isAttach).toggle(isAttach);
		this.$content.find("#actFilter").toggle(isActivity || this.activeTab === "calls" || this.activeTab === "appointments" || this.activeTab === "tasks");
		this.$content.find("#actBottom").toggle(!isAttach);

		if (!isAttach) {
			this.$content.find("#activityList .act-item").each((_, item) => {
				const $item = $(item);
				const tabOk = isActivity || $item.data("tab") === this.activeTab;
				const isNoteOrComment = (this.activeTab === "notes" || this.activeTab === "comments");
				const filtOk = isNoteOrComment || this.activeFilter === "all" || $item.data("status") === this.activeFilter;
				$item.css("display", tabOk && filtOk ? "flex" : "none");
			});
		}

		this.closeAllInputs();
		this.renderBottomBtn();
	}

	renderBottomBtn() {
		const cfg = this.tabConfig[this.activeTab];
		const $bottom = this.$content.find("#actBottom");
		if (!cfg || !cfg.label) { $bottom.empty(); return; }
		$bottom.html(`<button class="add-btn" type="button" data-toggle-input="${this.activeTab}"><i class="ti ${cfg.icon}"></i> ${cfg.label}</button>`);
	}

	closeAllInputs() { this.$content.find(".act-input-area").addClass("hidden").hide(); }

	// ─── DETAIL BINDINGS ──────────────────────────────────────────
	bindDetailActions() {
		// this.$content.off("click.olD");
		this.$content.off("click.olD").off("input.olD").off("keyup.olD").off("change.olD");

		this.$content.on("click.olD", ".ol-back-btn", () => frappe.set_route("opp-list"));

		this.$content.on("click.olD", "[data-toggle-input]", (e) => {
			const me = this;
			const tab = String($(e.currentTarget).data("toggleInput") || "");
			const cfg = this.tabConfig[tab]; if (!cfg?.inputId) return;
			const $el = this.$content.find(`#${cfg.inputId}`);
			const open = $el.is(":visible");
			this.closeAllInputs();
			if (!open) {
				$el.removeClass("hidden").show();
				$el.find("textarea,input:not([readonly])").first().focus();

				// Pre-fill call form with record data

				if (tab === "calls") {
					const record = this.detailRecord || this.selectedRecord;
					const today = new Date().toISOString().split("T")[0];
					const now = new Date().toTimeString().slice(0, 5);
					this.$content.find("#callDescription").val("");
					this.$content.find("#callStatus").val("Scheduled");

					if (!this.$content.find("#callStartDate").val())
						this.$content.find("#callStartDate").val(today);
					if (!this.$content.find("#callStartTime").val())
						this.$content.find("#callStartTime").val(now);
					if (!this.$content.find("#callEndDate").val())
						this.$content.find("#callEndDate").val(today);

					// Customer name
					const custName = record?.party_name || record?.customer_name ||
						this.selectedRecord?.party || "";
					this.$content.find("#callRelatedTo").val(custName);

					// Salesperson — get from grid input
					const spName = this.$content.find("#olSalesperson").val().trim() ||
						record?.sales_person_name || record?.sales_person || "";
					this.$content.find("#callSalesTeam").val(spName);

					// Fetch SP email + mobile from Sales Person → Employee chain
					// Store on instance for use in save
					this._callSP = { name: spName, email: "", mobile: "" };
					if (spName) {
						frappe.call({
							method: "frappe.client.get_list",
							args: {
								doctype: "Sales Person",
								fields: ["name", "employee"],
								filters: [["Sales Person", "sales_person_name", "=", spName]],
								limit_page_length: 1,
							},
							callback: (r) => {
								const sp = (r.message || [])[0];
								if (!sp?.employee) return;
								frappe.call({
									method: "frappe.client.get",
									args: { doctype: "Employee", name: sp.employee },
									callback: (r2) => {
										const emp = r2.message || {};
										this._callSP.email = emp.company_email || emp.personal_email || "";
										this._callSP.mobile = emp.cell_number || emp.mobile_no || "";
									}
								});
							}
						});
					}
				}


				if (tab === "tasks" && !this.$content.find("#taskDescHost").data("built")) {
					this._taskDescCtrl = frappe.ui.form.make_control({
						parent: this.$content.find("#taskDescHost").get(0),
						df: { fieldname: "ol_task_desc", fieldtype: "Text Editor", label: "" },
						render_input: true,
					});
					this.$content.find("#taskDescHost").data("built", true);

					me._buildParticipantsPicker({
						triggerSel: "#taskAssignTrigger",
						menuSel: "#taskAssignMenu",
						labelSel: "#taskAssignLabel",
						chipsSel: "#taskAssignChips",
						preselected: [],
						ns: "olTaskAssign",
					});
				}


				if (tab === "appointments") {
					const record = this.detailRecord || this.selectedRecord;

					// Pre-fill customer name
					const custName = record?.party_name || record?.customer_name ||
						this.selectedRecord?.party || "";
					this.$content.find("#apptCustomerName").val(custName);

					// Pre-fill scheduled time with next hour
					const now = new Date();
					now.setHours(now.getHours() + 1, 0, 0, 0);
					const pad = n => String(n).padStart(2, "0");
					const dt = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:00`;
					if (!this.$content.find("#apptScheduledTime").val())
						this.$content.find("#apptScheduledTime").val(dt);

					// Try to pre-fill contact email/phone from detailContacts
					const contact = (me._detailContacts || [])[0];
					if (contact) {
						if (!this.$content.find("#apptCustomerEmail").val())
							this.$content.find("#apptCustomerEmail").val(contact.email || "");
						if (!this.$content.find("#apptCustomerPhone").val())
							this.$content.find("#apptCustomerPhone").val(contact.phone || "");
					}


					// Participants checkbox-dropdown (mirrors Task assign picker)
					// const $partMenu = this.$content.find("#apptPartMenu");
					// this.$content.off("click.olAppt", "#apptPartTrigger").on("click.olAppt", "#apptPartTrigger", (ev) => {
					// 	ev.stopPropagation();
					// 	const open = $partMenu.is(":visible");
					// 	$partMenu.toggle(!open);
					// 	if (!open && !$partMenu.data("loaded")) {
					// 		frappe.call({
					// 			method: "frappe.client.get_list",
					// 			args: { doctype: "User", fields: ["name", "full_name"], filters: { enabled: 1, user_type: "System User" }, limit_page_length: 0, order_by: "full_name asc" },
					// 			callback: (r) => {
					// 				const rows = (r.message || []).filter(u => !["Administrator", "Guest"].includes(u.name));
					// 				$partMenu.html(rows.map(u => `
					// 					<label style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:6px;cursor:pointer;font-size:12px;color:#374151;">
					// 						<input type="checkbox" class="ol-appt-part" value="${this.escapeAttr(u.name)}" style="accent-color:#3b7ef8;width:14px;height:14px;cursor:pointer;">
					// 						<span>${this.escapeAttr(u.full_name ? u.full_name + " (" + u.name + ")" : u.name)}</span>
					// 					</label>`).join("")).data("loaded", true);
					// 			},
					// 		});
					// 	}
					// });

					me._buildParticipantsPicker({
						triggerSel: "#apptPartTrigger",
						menuSel: "#apptPartMenu",
						labelSel: "#apptPartLabel",
						chipsSel: "#apptPartChips",
						preselected: [],
						ns: "olApptPart",
					});
					this.$content.off("change.olAppt", ".ol-appt-part").on("change.olAppt", ".ol-appt-part", () => {
						const n = this.$content.find(".ol-appt-part:checked").length;
						this.$content.find("#apptPartLabel")
							.text(n ? `${n} participant(s) selected` : "Select participants…")
							.css("color", n ? "#111827" : "#9ca3af");
					});
					this.$content.off("click.olApptHide").on("click.olApptHide", (ev) => {
						if (!$(ev.target).closest("#apptPartWrap").length) this.$content.find("#apptPartMenu").hide();

					});
				}
			}
		});

		this.$content.on("click.olD", "[data-close-tab]", (e) => {
			const tab = String($(e.currentTarget).data("closeTab") || "");
			const cfg = this.tabConfig[tab]; if (cfg?.inputId) this.$content.find(`#${cfg.inputId}`).addClass("hidden").hide();
		});

		// ── Save Note → CRM Note ────────────────────────────────
		this.$content.on("click.olD", "[data-action='save-note']", () => {
			const me = this;
			const record = me.detailRecord || me.selectedRecord;
			const $note = me.$content.find("#noteText");
			const txt = ($note.val() || "").trim();
			const txtHtml = txt.replace(/\n/g, "<br>");
			if (!txt) return;
			frappe.call({
				method: "frappe.client.insert",
				args: {
					doc: {
						doctype: "CRM Note",
						note: txt,
						added_by: frappe.session.user,
						added_on: frappe.datetime.now_datetime(),
						parenttype: "Opportunity",
						parentfield: "notes",
						parent: record?.name || "",
					}
				},
				callback: (r) => {
					if (r.message) {
						me.detailActivities.unshift({
							id: r.message.name, title: txt, type: "Note",
							tab: "notes", owner: frappe.session.user,
							created: "Just now", status: "completed", meta: ""
						});
						me.injectDetailActivities();
						frappe.show_alert({ message: "Note saved!", indicator: "green" });
					}
					$note.val("");
					me.$content.find("#inputNotes").addClass("hidden").hide();
					me.applyFilter();
				},
				error: () => frappe.show_alert({ message: "Failed to save note.", indicator: "red" })
			});
		});

		// ── Save Call → Call List ───────────────────────────────
		this.$content.on("click.olD", "[data-action='save-call']", () => {
			const me = this;
			const record = me.detailRecord || me.selectedRecord;
			const subject = me.$content.find("#callSubject").val().trim();
			const startDate = me.$content.find("#callStartDate").val().trim();
			const startTime = me.$content.find("#callStartTime").val().trim();
			const endDate = me.$content.find("#callEndDate").val().trim();
			const endTime = me.$content.find("#callEndTime").val().trim();
			const relatedTo = me.$content.find("#callRelatedTo").val().trim();
			const spName = me.$content.find("#callSalesTeam").val().trim();
			const status = me.$content.find("#callStatus").val() || "Scheduled";
			const description = me.$content.find("#callDescription").val().trim();


			if (!subject) {
				frappe.show_alert({ message: "Subject is required.", indicator: "orange" });
				return;
			}

			// Build sales_team child table row
			const sp = me._callSP || {};
			const salesTeamRow = spName ? [{
				doctype: "sales_team",   // child doctype name
				sales_person: spName,
				team_name: spName,
				allocated_percentage: 100,
				mobile_no: sp.mobile || "",
				email: sp.email || "",
			}] : [];

			frappe.call({
				method: "frappe.client.insert",
				args: {
					doc: {
						doctype: "Call List",
						custom_date: new Date().toISOString().split("T")[0],  // ← ADD THIS LINE
						subject: subject,
						start_date: startDate,
						start_timing: startTime,
						end_date: endDate,
						end_timing: endTime,
						related_to: "Customer",
						name1: relatedTo,
						status: status,
						description: description,
						sales_team: salesTeamRow,
						reference: "Opportunity",
						reference_to: record?.name || "",
					}
				},
				callback: (r) => {
					if (r.message) {
						me.detailActivities.unshift({
							id: r.message.name,
							title: subject,
							type: "Call", tab: "calls",
							owner: frappe.session.user,
							created: "Just now", status: (status === "Scheduled" ? "scheduled" : "completed"),
							meta: startDate ? `${startDate}${startTime ? " " + startTime : ""}` : ""
						});
						me.injectDetailActivities();
						frappe.show_alert({ message: "Call logged!", indicator: "green" });
					}
					me.$content.find("#callSubject, #callStartDate, #callStartTime, #callEndDate, #callEndTime, #callDescription").val("");
					me.$content.find("#callStatus").val("Scheduled");
					me._callSP = null;
					me.$content.find("#inputCalls").addClass("hidden").hide();
					me.applyFilter();
				},
				error: () => frappe.show_alert({ message: "Failed to log call.", indicator: "red" })
			});
		});


		// ── Save Appointment → Appointment ──────────────────────
		this.$content.on("click.olD", "[data-action='save-appointment']", () => {
			const me = this;
			const record = me.detailRecord || me.selectedRecord;
			const subject = me.$content.find("#apptSubject").val().trim();
			const scheduledTime = me.$content.find("#apptScheduledTime").val().trim();
			const custName = me.$content.find("#apptCustomerName").val().trim();
			const custPhone = me.$content.find("#apptCustomerPhone").val().trim();
			const custEmail = me.$content.find("#apptCustomerEmail").val().trim();
			const partSet = me.$content.find("#apptPartMenu").data("selected") || new Set();
			const participants = [...partSet].map(id => ({ user: id }));
			const details = me.$content.find("#apptDetails").val().trim();

			if (!subject) {
				frappe.show_alert({ message: "Subject is required.", indicator: "orange" });
				return;
			}
			if (!scheduledTime) {
				frappe.show_alert({ message: "Scheduled time is required.", indicator: "orange" });
				return;
			}

			frappe.call({
				method: "frappe.client.insert",
				args: {
					doc: {
						doctype: "Appointment",
						appointment_with: "Customer",
						party: custName,
						subject: subject,
						customer_name: custName,
						customer_phone_number: custPhone,
						customer_email: custEmail,
						custom_participants: participants,
						customer_details: details,
						scheduled_time: scheduledTime.replace("T", " "),
						reference: "Opportunity",
						reference_to: record?.name || "",
					}
				},
				callback: (r) => {
					if (r.message) {
						const displayTime = scheduledTime
							? new Date(scheduledTime).toLocaleString("en-IN", {
								day: "2-digit", month: "short",
								hour: "2-digit", minute: "2-digit"
							}) : "";
						me.detailActivities.unshift({
							id: r.message.name,
							title: subject,
							type: "Appointment", tab: "appointments",
							owner: frappe.session.user,
							created: "Just now", status: "scheduled",
							meta: displayTime
						});
						me.injectDetailActivities();
						frappe.show_alert({ message: "Appointment scheduled!", indicator: "green" });
					}
					me.$content.find("#apptSubject, #apptScheduledTime, #apptCustomerPhone, #apptCustomerEmail").val("");
					me.$content.find("#inputAppointments").addClass("hidden").hide();
					me.$content.find("#apptDetails").val("");
					me.$content.find(".ol-appt-part").prop("checked", false);
					me.$content.find("#apptPartMenu").data("selected", new Set());
					me.$content.find("#apptPartChips").html("");
					me.$content.find("#apptPartLabel").text("Search & select participants…").css("color", "#9ca3af");
					me.applyFilter();
				},
				error: () => frappe.show_alert({ message: "Failed to schedule appointment.", indicator: "red" })
			});
		});


		// Task: open the form → load users into the multiselect + build editor
		this.$content.on("click.olD", "[data-toggle-input='tasks'], #inputTasks", () => { });  // placeholder so the existing toggle still works

		// Task: toggle assign-user dropdown
		this.$content.on("click.olD", "#taskAssignTrigger", (e) => {
			e.stopPropagation();
			const $menu = this.$content.find("#taskAssignMenu");
			const open = $menu.is(":visible");
			$menu.toggle(!open);
			if (!open && !$menu.data("loaded")) {
				frappe.call({
					method: "frappe.client.get_list",
					args: { doctype: "User", fields: ["name", "full_name"], filters: { enabled: 1 }, limit_page_length: 500, order_by: "full_name asc" },
					callback: (r) => {
						const rows = r.message || [];
						$menu.html(rows.map(u => `
							<label style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:6px;cursor:pointer;font-size:12px;color:#374151;">
								<input type="checkbox" class="ol-task-user" value="${this.escapeAttr(u.name)}" style="accent-color:#3b7ef8;width:14px;height:14px;cursor:pointer;">
								<span>${this.escapeAttr(u.full_name ? u.full_name + " (" + u.name + ")" : u.name)}</span>
							</label>`).join("")).data("loaded", true);
					},
				});
			}
		});

		// Task: update the assign label as users are checked
		this.$content.on("change.olD", ".ol-task-user", () => {
			const n = this.$content.find(".ol-task-user:checked").length;
			const $lbl = this.$content.find("#taskAssignLabel");
			$lbl.text(n ? `${n} user(s) selected` : "Select users…").css("color", n ? "#111827" : "#9ca3af");
		});

		// Task: close assign menu on outside click
		this.$content.on("click.olD", (e) => {
			if (!$(e.target).closest("#taskAssignWrap").length) this.$content.find("#taskAssignMenu").hide();
		});

		// Task: save
		this.$content.on("click.olD", "[data-action='save-task']", () => {
			const me = this;
			const record = me.detailRecord || me.selectedRecord;
			const subject = me.$content.find("#taskSubject").val().trim();
			if (!subject) { frappe.show_alert({ message: "Subject is required.", indicator: "orange" }); return; }
			const priority = me.$content.find("#taskPriority").val() || "Medium";
			const endRaw = me.$content.find("#taskEndDate").val();
			const endVal = endRaw ? endRaw.replace("T", " ") + ":00" : "";
			const desc = me._taskDescCtrl ? (me._taskDescCtrl.get_value() || "") : "";
			const assignSet = me.$content.find("#taskAssignMenu").data("selected") || new Set();
			const users = [...assignSet].map(id => ({ user: id }));

			frappe.call({
				method: "frappe.client.insert",
				args: {
					doc: {
						doctype: "Task",
						subject,
						priority,
						exp_end_date: endVal,
						description: desc,
						reference: "Opportunity",
						reference_to: record?.name || "",
						custom_users: users,
						status: "Open",
					}
				},
				callback: (r) => {
					if (r.message) {
						const today = frappe.datetime.get_today();
						const endDay = endVal ? endVal.slice(0, 10) : "";
						me.detailActivities.unshift({
							id: r.message.name, title: subject, type: "Task", tab: "tasks",
							owner: frappe.session.user, created: "Just now",
							status: (endDay && endDay >= today) ? "scheduled" : "completed",
							meta: [priority, endVal ? me.formatDate(endVal) : ""].filter(Boolean).join(" · "),
						});
						me.injectDetailActivities();
						frappe.show_alert({ message: "Task created!", indicator: "green" });
					}
					me.$content.find("#taskSubject,#taskEndDate").val("");
					me.$content.find("#taskAssignMenu").data("selected", new Set());
					me.$content.find("#taskAssignChips").html("");
					me.$content.find("#taskAssignLabel").text("Search & select users…").css("color", "#9ca3af");
					if (me._taskDescCtrl) me._taskDescCtrl.set_value("");
					me.$content.find("#inputTasks").addClass("hidden").hide();
					me.applyFilter();
				},
				error: () => frappe.show_alert({ message: "Failed to create task.", indicator: "red" }),
			});
		});

		// ── Save Comment → Comment ──────────────────────────────
		this.$content.on("click.olD", "[data-action='save-comment']", () => {
			const me = this;
			const record = me.detailRecord || me.selectedRecord;
			const $comment = me.$content.find("#commentText");
			const raw = ($comment.val() || "").trim();
			if (!raw) return;

			// Convert "@Full Name" tokens into Frappe mention spans.
			// me._mentionMap maps inserted display names → user email (built by the autocomplete).
			const mentionMap = me._mentionMap || {};
			let html = frappe.utils.escape_html ? frappe.utils.escape_html(raw) : raw;
			Object.keys(mentionMap).forEach(nameKey => {
				const email = mentionMap[nameKey];
				const span = `<span class="mention" data-id="${email}" data-value="${frappe.utils.escape_html(nameKey)}" data-denotation-char="@">@${frappe.utils.escape_html(nameKey)}</span>`;
				// replace the literal "@Name" with the span
				html = html.split("@" + nameKey).join(span);
			});

			frappe.call({
				method: "frappe.desk.form.utils.add_comment",
				args: {
					reference_doctype: "Opportunity",
					reference_name: record?.name || "",
					content: html,
					comment_email: frappe.session.user,
					comment_by: frappe.session.user_fullname || frappe.session.user,
				},
				callback: (r) => {
					if (r.message) {
						me.detailActivities.unshift({
							id: r.message.name, title: raw, type: "Comment",
							tab: "comments", owner: frappe.session.user,
							created: "Just now", status: "completed", meta: ""
						});
						me.injectDetailActivities();
						frappe.show_alert({ message: "Comment posted!", indicator: "green" });
					}
					$comment.val("");
					me._mentionMap = {};
					me.$content.find("#mentionDropdown").addClass("hidden").hide();
					me.$content.find("#inputComments").addClass("hidden").hide();
					me.applyFilter();
				},
				error: () => frappe.show_alert({ message: "Failed to post comment.", indicator: "red" })
			});
		});

		// ── @-mention autocomplete (live users → _mentionMap drives the email) ──
		this.$content.on("input.olD keyup.olD", "#commentText", (e) => {
			const me = this;
			if (!me._mentionMap) me._mentionMap = {};
			const $dd = me.$content.find("#mentionDropdown");
			const ta = e.currentTarget;
			const before = (ta.value || "").slice(0, ta.selectionStart);
			const m = before.match(/@([^\s@]*)$/);
			if (!m) { $dd.addClass("hidden").hide(); return; }
			const q = (m[1] || "").toLowerCase();

			const paint = (list) => {
				if (!list.length) { $dd.addClass("hidden").hide(); return; }
				$dd.html(list.slice(0, 8).map(u => {
					const initials = (u.label || "?").split(" ").map(w => w[0]).join("").substring(0, 2).toUpperCase();
					return `<div class="mention-item" data-email="${me.escapeAttr(u.email)}" data-name="${me.escapeAttr(u.label)}">
						<div class="mention-avatar">${me.escapeAttr(initials)}</div>
						<div><div class="mention-name">${me.escapeAttr(u.label)}</div><div class="mention-role">${me.escapeAttr(u.email)}</div></div>
					</div>`;
				}).join("")).removeClass("hidden").show();
			};

			const filterAndPaint = () => {
				const users = me._mentionUsers || [];
				const filtered = q ? users.filter(u => u.label.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) : users;
				paint(filtered);
			};

			if (me._mentionUsers) { filterAndPaint(); }
			else {
				frappe.call({
					method: "frappe.client.get_list",
					args: { doctype: "User", filters: { enabled: 1, user_type: "System User" }, fields: ["name", "full_name"], limit_page_length: 0, order_by: "full_name asc" },
					callback: (r) => {
						me._mentionUsers = (r.message || [])
							.filter(u => u.name && !["Administrator", "Guest"].includes(u.name))
							.map(u => ({ email: u.name, label: u.full_name || u.name }));
						filterAndPaint();
					},
				});
			}
		});

		// pick a mention → insert "@Full Name " and record email for the save handler
		this.$content.on("click.olD", ".mention-item", (e) => {
			const me = this;
			const $item = $(e.currentTarget);
			const email = $item.data("email");
			const name = $item.data("name");
			const $dd = me.$content.find("#mentionDropdown");
			if (!email || !name) { $dd.addClass("hidden").hide(); return; }
			const ta = me.$content.find("#commentText")[0];
			const caret = ta.selectionStart;
			const before = ta.value.slice(0, caret).replace(/@([^\s@]*)$/, "@" + name + " ");
			const after = ta.value.slice(caret);
			ta.value = before + after;
			if (!me._mentionMap) me._mentionMap = {};
			me._mentionMap[name] = email;
			$dd.addClass("hidden").hide();
			ta.focus();
			ta.setSelectionRange(before.length, before.length);
		});

		this.$content.on("click.olD", "#olBtnEdit", () => frappe.set_route("opp-list", "new"));


		this.$content.on("click.olD", "#olSaveMetaBtn", () => this.saveMetaSection());
		this.$content.on("click.olD", "#olDiscardMetaBtn", () => this.discardMetaSection());
		this.$content.on("click.olD", "#olSaveItemsBtn", () => this.saveItemsSection());
		this.$content.on("click.olD", "#olDiscardItemsBtn", () => this.discardItemsSection());

		// Show meta save bar when any editable meta field changes
		this.$content.on("input.olMetaSave change.olMetaSave", ".ol-meta-input",
			() => this.$content.find("#olDetailMetaSaveBar").css("display", "flex")
		);

		$(document).off("click.olD").on("click.olD", (e) => {
			// Close create dropdown when clicking outside
			const createWrap = this.$content.find("#olCreateWrap").get(0);
			if (!createWrap || !createWrap.contains(e.target)) this.$content.find("#olCreateDropdown").removeClass("open");
			// Close connections dropdown when clicking outside
			const connWrap = this.$content.find("#olConnWrap").get(0);
			if (!connWrap || !connWrap.contains(e.target)) this.$content.find("#olConnDropdown").removeClass("open");
			// Close mention dropdown
			const $dd = this.$content.find("#mentionDropdown").get(0);
			if ((!$dd || !$dd.contains(e.target)) && e.target.id !== "commentText") this.$content.find("#mentionDropdown").addClass("hidden").hide();
		});

		// ── Detail view Add Item dropdown ──────────────────────
		this.$content
			.off("click.olDIAddBtn")
			.on("click.olDIAddBtn", "#olDetailAddItemBtn", (e) => {
				e.stopPropagation();
				const $m = this.$content.find("#olDetailAddItemMenu");
				$m.css("display", $m.css("display") === "none" ? "block" : "none");
			});

		this.$content
			.off("click.olDIAddPop")
			.on("click.olDIAddPop", "[data-detail-item-popup]", (e) => {
				e.stopPropagation();
				const type = String($(e.currentTarget).data("detailItemPopup") || "");
				if (!type) return;
				this.$content.find("#olDetailAddItemMenu").css("display", "none");
				this.openDetailItemPopup(type);
			});

		$(document).off("click.olDetailItemMenu")
			.on("click.olDetailItemMenu", (e) => {
				if (!$(e.target).closest("#olDetailAddItemWrap").length)
					this.$content.find("#olDetailAddItemMenu").css("display", "none");
			});
	}

	_buildParticipantsPicker(opts) {
		// opts: { menuSel, triggerSel, labelSel, chipsSel, preselected:[ids], ns }
		const me = this;
		const ns = opts.ns || "olPart";
		const $menu = me.$content.find(opts.menuSel);
		const $trigger = me.$content.find(opts.triggerSel);
		const $label = me.$content.find(opts.labelSel);
		const $chips = me.$content.find(opts.chipsSel);
		if (!$menu.length) return;

		// state lives on the menu element
		const selected = new Set(opts.preselected || []);
		$menu.data("selected", selected);

		const loadUsers = () => {
			if (me._mentionUsers) return Promise.resolve(me._mentionUsers);
			return new Promise(res => frappe.call({
				method: "frappe.client.get_list",
				args: { doctype: "User", fields: ["name", "full_name"], filters: { enabled: 1, user_type: "System User" }, limit_page_length: 0, order_by: "full_name asc" },
				callback: r => {
					me._mentionUsers = (r.message || [])
						.filter(u => !["Administrator", "Guest"].includes(u.name))
						.map(u => ({ email: u.name, label: u.full_name || u.name }));
					res(me._mentionUsers);
				},
				error: () => { me._mentionUsers = []; res([]); },
			}));
		};

		const nameFor = (id) => {
			const u = (me._mentionUsers || []).find(x => x.email === id);
			return u ? u.label : id;
		};

		const renderChips = () => {
			if (!$chips.length) return;
			if (!selected.size) { $chips.html(`<span style="font-size:11px;color:#9ca3af;">No participants selected</span>`); }
			else {
				$chips.html([...selected].map(id => `
					<span style="display:inline-flex;align-items:center;gap:5px;background:rgba(59,126,248,0.1);color:#3b7ef8;font-size:11px;font-weight:600;padding:3px 8px;border-radius:14px;margin:2px 4px 2px 0;">
						${me.escapeAttr(nameFor(id))}
						<i class="ti ti-x ${ns}-chip-x" data-id="${me.escapeAttr(id)}" style="cursor:pointer;font-size:12px;"></i>
					</span>`).join(""));
			}
		};

		const updateLabel = () => {
			const n = selected.size;
			$label.text(n ? `${n} participant(s) selected` : "Search & select participants…")
				.css("color", n ? "#111827" : "#9ca3af");
		};

		const renderMenu = (filter) => {
			const q = (filter || "").toLowerCase();
			const users = (me._mentionUsers || []).filter(u =>
				!q || u.label.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
			const list = users.map(u => `
				<label style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:6px;cursor:pointer;font-size:12px;color:#374151;">
					<input type="checkbox" class="${ns}-cb" value="${me.escapeAttr(u.email)}" ${selected.has(u.email) ? "checked" : ""} style="accent-color:#3b7ef8;width:14px;height:14px;cursor:pointer;">
					<span>${me.escapeAttr(u.label)} <span style="color:#9ca3af;">(${me.escapeAttr(u.email)})</span></span>
				</label>`).join("");
			$menu.html(`
				<div style="position:sticky;top:0;background:#fff;padding:4px 4px 8px;">
					<input type="text" class="${ns}-search ol-field-input" placeholder="Search users…" style="height:32px;font-size:12px;">
				</div>
				<div class="${ns}-list">${list || `<div style="padding:10px;color:#9ca3af;font-size:12px;">No users found</div>`}</div>`);
		};

		// open/close
		$trigger.off("click." + ns).on("click." + ns, (ev) => {
			ev.stopPropagation();
			const open = $menu.is(":visible");
			$menu.toggle(!open);
			if (!open) loadUsers().then(() => { renderMenu(""); });
		});

		// search (delegated)
		// search — re-render ONLY the list, keep the search box (so focus isn't lost)
		$menu.off("input." + ns, "." + ns + "-search").on("input." + ns, "." + ns + "-search", function () {
			const q = (this.value || "").toLowerCase();
			const users = (me._mentionUsers || []).filter(u =>
				!q || u.label.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
			$menu.find("." + ns + "-list").html(
				users.length
					? users.map(u => `
						<label style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:6px;cursor:pointer;font-size:12px;color:#374151;">
							<input type="checkbox" class="${ns}-cb" value="${me.escapeAttr(u.email)}" ${selected.has(u.email) ? "checked" : ""} style="accent-color:#3b7ef8;width:14px;height:14px;cursor:pointer;">
							<span>${me.escapeAttr(u.label)} <span style="color:#9ca3af;">(${me.escapeAttr(u.email)})</span></span>
						</label>`).join("")
					: `<div style="padding:10px;color:#9ca3af;font-size:12px;">No users found</div>`
			);
		});

		// check / uncheck (delegated)
		$menu.off("change." + ns, "." + ns + "-cb").on("change." + ns, "." + ns + "-cb", function () {
			if (this.checked) selected.add(this.value); else selected.delete(this.value);
			updateLabel(); renderChips();
		});

		// remove chip
		me.$content.off("click." + ns + "chip", "." + ns + "-chip-x").on("click." + ns + "chip", "." + ns + "-chip-x", function (ev) {
			ev.stopPropagation();
			selected.delete($(this).data("id"));
			updateLabel(); renderChips();
			// uncheck in menu if open
			$menu.find("." + ns + "-cb[value='" + $.escapeSelector($(this).data("id")) + "']").prop("checked", false);
		});

		// outside click closes menu
		me.$content.off("click." + ns + "hide").on("click." + ns + "hide", (ev) => {
			if (!$(ev.target).closest(opts.menuSel + "," + opts.triggerSel).length) $menu.hide();
		});

		// initial paint (names need users loaded for chips)
		loadUsers().then(() => { updateLabel(); renderChips(); });
	}




	openDetailItemPopup(type) {
		const me = this;
		const isRenewal = type !== "new";
		const title = type === "new" ? "Add Item" : type === "renewal" ? "Renewal Items" : "Additional Items";
		const icon = type === "new" ? "ti-box" : type === "renewal" ? "ti-refresh" : "ti-stack-2";
		const iconColor = type === "new" ? "#3b7ef8" : type === "renewal" ? "#16a34a" : "#d97706";

		const loadAndOpen = (catalogue, renewals) => {
			const data = isRenewal ? renewals : catalogue;
			const selected = new Set();
			const groups = [...new Set(catalogue.map(i => i.group).filter(Boolean))].sort();
			const brands = [...new Set(catalogue.map(i => i.brand).filter(g => g && g !== "—"))].sort();
			const toNum = v => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };
			// a number matches an item if: (n in 1..5 → years==n OR months==n) ; (n>5 → months==n only)
			const periodMatch = (i, n) => {
				const y = toNum(i.years), m = toNum(i.months);
				return n <= 5 ? (y === n || m === n) : (m === n);
			};
			const tenures = [...new Set(catalogue.map(i => i.tenure).filter(Boolean))].sort();
			const periodNums = [...new Set(catalogue.flatMap(i => [toNum(i.years), toNum(i.months)]).filter(n => n !== null))].sort((a, b) => a - b);
			const selTenures = new Set();
			const selPeriods = new Set();   // holds numbers as strings


			const groupOpts = groups.map(g => `<option value="${me.escapeAttr(g)}">${me.escapeAttr(g)}</option>`).join("");
			const brandOpts = brands.map(b => `<option value="${me.escapeAttr(b)}">${me.escapeAttr(b)}</option>`).join("");

			const buildChecks = (arr, key) => arr.length
				? arr.map(v => `
					<label class="ol-di-multi-opt" style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:6px;cursor:pointer;font-size:12px;color:#374151;">
						<input type="checkbox" class="ol-di-mf-check" data-mf-check="${key}" value="${me.escapeAttr(v)}" style="accent-color:#3b7ef8;width:14px;height:14px;cursor:pointer;">
						<span>${me.escapeAttr(v)}</span>
					</label>`).join("")
				: `<div style="padding:8px 10px;font-size:11px;color:#9ca3af;">No values</div>`;
			const tenureChecks = buildChecks(tenures, "tenure");
			const periodChecks = periodNums.length
				? periodNums.map(n => {
					const label = n <= 5 ? `${n} (Yr/Mo)` : `${n} Mo`;
					return `
					<label class="ol-di-multi-opt" style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:6px;cursor:pointer;font-size:12px;color:#374151;">
						<input type="checkbox" class="ol-di-mf-check" data-mf-check="period" value="${n}" style="accent-color:#3b7ef8;width:14px;height:14px;cursor:pointer;">
						<span>${label}</span>
					</label>`;
				}).join("")
				: `<div style="padding:8px 10px;font-size:11px;color:#9ca3af;">No values</div>`;

			const renderGrid = (filtered) => {
				if (!isRenewal) {
					return filtered.length
						? filtered.map(item => `
							<div class="ol-item-card ${selected.has(item.id) ? "selected" : ""}" data-iid="${item.id}"
								style="cursor:pointer;display:flex;align-items:center;gap:16px;width:100%;
									padding:12px 18px;border:1.5px solid ${selected.has(item.id) ? "#3b7ef8" : "rgba(0,0,0,0.08)"};
									border-radius:10px;background:${selected.has(item.id) ? "rgba(59,126,248,0.04)" : "#fff"};
									transition:all .12s;box-sizing:border-box;">
								<div class="ol-item-card-check" style="width:20px;height:20px;border-radius:5px;flex-shrink:0;position:static;opacity:1;
									border:1.5px solid ${selected.has(item.id) ? "#3b7ef8" : "rgba(0,0,0,0.2)"};
									background:${selected.has(item.id) ? "#3b7ef8" : "transparent"};
									display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;">
									${selected.has(item.id) ? '<i class="ti ti-check"></i>' : ""}
								</div>
								<div style="width:38px;height:38px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:#3b7ef8;border:2px solid ${selected.has(item.id) ? "#2563eb" : "rgba(59,126,248,0.25)"};transition:all .12s;">
									<span style="font-family:Syne,sans-serif;font-size:13px;font-weight:700;color:#fff;">${me.escapeAttr((item.name || "?").substring(0, 2).toUpperCase())}</span>
								</div>
								<div style="flex:1;min-width:0;">
									<div style="font-size:13px;font-weight:600;color:#111827;white-space:normal;word-break:break-word;line-height:1.35;">${me.escapeAttr(item.name)}</div>
									<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:5px;font-size:11px;">
										${item.code ? `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:20px;background:rgba(107,114,128,0.1);color:#6b7280;font-weight:600;"><i class="ti ti-barcode" style="font-size:11px;"></i>${me.escapeAttr(item.code)}</span>` : ""}
										${item.brand && item.brand !== "—" ? `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:20px;background:rgba(124,58,237,0.1);color:#7c3aed;font-weight:600;"><i class="ti ti-tag" style="font-size:11px;"></i>${me.escapeAttr(item.brand)}</span>` : ""}
										${item.group ? `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:20px;background:rgba(59,126,248,0.1);color:#3b7ef8;font-weight:600;"><i class="ti ti-category" style="font-size:11px;"></i>${me.escapeAttr(item.group)}</span>` : ""}
										${item.tenure ? `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:20px;background:rgba(22,163,74,0.1);color:#16a34a;font-weight:600;"><i class="ti ti-clock" style="font-size:11px;"></i>${me.escapeAttr(item.tenure)}</span>` : ""}
										${item.tenure_period ? `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:20px;background:rgba(217,119,6,0.1);color:#d97706;font-weight:600;"><i class="ti ti-calendar" style="font-size:11px;"></i>${me.escapeAttr(item.years)}</span>` : ""}
									</div>
								</div>
							</div>`).join("")
						: '<div style="text-align:center;padding:32px;color:#9ca3af;font-size:12px;"><i class="ti ti-search-off" style="font-size:28px;display:block;margin-bottom:8px;"></i>No items found</div>';
				}
				if (!filtered.length) return '<div style="text-align:center;padding:32px;color:#9ca3af;font-size:12px;"><i class="ti ti-search-off" style="font-size:28px;display:block;margin-bottom:8px;"></i>No renewals found for this customer.</div>';
				return `<table style="width:100%;border-collapse:collapse;font-size:13px;">
					<thead><tr style="background:#f1f5f9;position:sticky;top:0;z-index:1;">
						<th style="padding:10px 12px;width:40px;border-bottom:1px solid rgba(0,0,0,0.08);"></th>
						<th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#9ca3af;border-bottom:1px solid rgba(0,0,0,0.08);">Renewal ID</th>
						<th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#9ca3af;border-bottom:1px solid rgba(0,0,0,0.08);">Product</th>
						<th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#9ca3af;border-bottom:1px solid rgba(0,0,0,0.08);">End Date</th>
					</tr></thead>
					<tbody>${filtered.map(item => `
						<tr data-rid="${item.id}" class="${selected.has(item.id) ? "ol-r-selected" : ""}" style="cursor:pointer;border-bottom:1px solid rgba(0,0,0,0.06);transition:background 0.12s;">
							<td style="padding:12px;"><input type="checkbox" ${selected.has(item.id) ? "checked" : ""} style="accent-color:#3b7ef8;width:15px;height:15px;cursor:pointer;"></td>
							<td style="padding:12px;"><span style="font-size:12px;font-weight:700;color:#3b7ef8;font-family:Syne,sans-serif;">${me.escapeAttr(item.renewId || item.name)}</span></td>
							<td style="padding:12px;"><span style="font-size:13px;font-weight:600;color:#111827;">${me.escapeAttr(item.product_name || item.name)}</span></td>
							<td style="padding:12px;"><span style="display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;color:#d97706;background:rgba(217,119,6,0.1);padding:4px 10px;border-radius:20px;"><i class="ti ti-calendar-due" style="font-size:11px;"></i>${item.end_date || "—"}</span></td>
						</tr>`).join("")}
					</tbody>
				</table>`;
			};

			$("#olDIItemOverlay").remove();
			const $overlay = $(`
				<div id="olDIItemOverlay" style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9000;display:flex;align-items:center;justify-content:center;padding:20px;">
					<div style="background:#fff;border-radius:16px;width:100%;max-width:800px;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 24px 64px rgba(0,0,0,0.18);">
						<div style="padding:18px 22px 14px;border-bottom:1px solid rgba(0,0,0,0.08);display:flex;align-items:flex-start;justify-content:space-between;">
							<div>
								<div style="font-family:Syne,sans-serif;font-size:16px;font-weight:700;color:#111827;display:flex;align-items:center;gap:8px;"><i class="ti ${icon}" style="color:${iconColor};"></i>${title}</div>
								<div style="font-size:11px;color:#9ca3af;margin-top:3px;">${isRenewal ? "Select from customer renewals" : "Search and select from item catalogue"}</div>
							</div>
							<button id="olDIPopupClose" style="width:30px;height:30px;border-radius:50%;border:1px solid rgba(0,0,0,0.1);background:transparent;color:#9ca3af;cursor:pointer;font-size:15px;display:flex;align-items:center;justify-content:center;"><i class="ti ti-x"></i></button>
						</div>
						<div style="display:flex;gap:8px;padding:10px 22px;border-bottom:1px solid rgba(0,0,0,0.08);background:#f8fafc;flex-wrap:wrap;">
							<div style="display:flex;align-items:center;gap:8px;flex:1;min-width:180px;background:#fff;border:1px solid rgba(0,0,0,0.1);border-radius:6px;padding:0 10px;height:32px;">
								<i class="ti ti-search" style="font-size:14px;color:#9ca3af;flex-shrink:0;"></i>
								<input id="olDISearch" placeholder="Search..." style="flex:1;border:none;background:transparent;outline:none;font-family:'DM Sans',sans-serif;font-size:12px;color:#111827;">
							</div>
							<select id="olDIGroup" style="height:32px;padding:0 10px;border:1px solid rgba(0,0,0,0.1);border-radius:6px;background:#fff;font-size:12px;min-width:120px;outline:none;">
								<option value="">All Groups</option>${groupOpts}
							</select>
							<select id="olDIBrand" style="height:32px;padding:0 10px;border:1px solid rgba(0,0,0,0.1);border-radius:6px;background:#fff;font-size:12px;min-width:120px;outline:none;">
								<option value="">All Brands</option>${brandOpts}
							</select>

							<div class="ol-di-multi" data-mf="tenure" style="position:relative;">
								<button type="button" class="ol-di-multi-trigger" data-mf-trigger="tenure" style="height:32px;padding:0 10px;border:1px solid rgba(0,0,0,0.1);border-radius:6px;background:#fff;font-size:12px;min-width:120px;outline:none;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:6px;color:#111827;">
									<span data-mf-label="tenure">All Tenure</span><i class="ti ti-chevron-down" style="font-size:13px;color:#9ca3af;"></i>
								</button>
								<div class="ol-di-multi-menu" data-mf-menu="tenure" style="display:none;position:absolute;top:calc(100% + 4px);left:0;min-width:160px;max-height:220px;overflow-y:auto;background:#fff;border:1px solid rgba(0,0,0,0.1);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.12);z-index:300;padding:4px;">${tenureChecks}</div>
							</div>
							<div class="ol-di-multi" data-mf="period" style="position:relative;">
								<button type="button" class="ol-di-multi-trigger" data-mf-trigger="period" style="height:32px;padding:0 10px;border:1px solid rgba(0,0,0,0.1);border-radius:6px;background:#fff;font-size:12px;min-width:130px;outline:none;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:6px;color:#111827;">
									<span data-mf-label="period">All Year/Months</span><i class="ti ti-chevron-down" style="font-size:13px;color:#9ca3af;"></i>
								</button>
								<div class="ol-di-multi-menu" data-mf-menu="period" style="display:none;position:absolute;top:calc(100% + 4px);left:0;min-width:160px;max-height:220px;overflow-y:auto;background:#fff;border:1px solid rgba(0,0,0,0.1);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.12);z-index:300;padding:4px;">${periodChecks}</div>
							</div>


						</div>
						<div id="olDIItemBody" style="flex:1;overflow-y:auto;padding:16px 22px;"></div>
						<div style="padding:14px 22px;border-top:1px solid rgba(0,0,0,0.08);display:flex;align-items:center;justify-content:space-between;background:#f8fafc;">
							<span id="olDISelCount" style="font-size:12px;font-weight:500;color:#6b7280;">0 items selected</span>
							<div style="display:flex;gap:8px;">
								<button id="olDICancel" style="padding:8px 16px;border-radius:6px;border:1px solid rgba(0,0,0,0.1);background:#fff;font-family:'DM Sans',sans-serif;font-size:13px;cursor:pointer;">Cancel</button>
								<button id="olDIConfirm" style="padding:8px 20px;border-radius:6px;border:none;background:#3b7ef8;color:#fff;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;cursor:pointer;"><i class="ti ti-check" style="margin-right:4px;"></i> Add Selected</button>
							</div>
						</div>
					</div>
				</div>`);

			$("body").append($overlay);
			const $body = $overlay.find("#olDIItemBody");
			const updateSel = () => $overlay.find("#olDISelCount").text(selected.size + " item(s) selected");

			const renderBody = () => {
				const q = ($overlay.find("#olDISearch").val() || "").toLowerCase();
				const group = $overlay.find("#olDIGroup").val();
				const brand = $overlay.find("#olDIBrand").val();
				const filtered = data.filter((i) =>
					(!q || (i.name || "").toLowerCase().includes(q) || (i.code || "").toLowerCase().includes(q)) &&
					(!group || i.group === group) &&
					(!brand || i.brand === brand) &&
					(!selTenures.size || selTenures.has(i.tenure)) &&
					(!selPeriods.size || [...selPeriods].some(n => periodMatch(i, parseInt(n, 10))))
				);
				if (!isRenewal) $body.css({ display: "flex", "flex-direction": "column", gap: "8px", "grid-template-columns": "" });
				else $body.css({ display: "block" });
				$body.html(renderGrid(filtered));

				$body.find(".ol-item-card").off("click").on("click", function () {
					const id = parseInt($(this).data("iid"));
					selected.has(id) ? selected.delete(id) : selected.add(id);
					updateSel();
					renderBody();
				});
				$body.find("[data-rid]").off("click").on("click", function (e) {
					if ($(e.target).is("input")) return;
					const id = parseInt($(this).data("rid"));
					selected.has(id) ? selected.delete(id) : selected.add(id);
					$(this).toggleClass("ol-r-selected", selected.has(id));
					$(this).find("input[type=checkbox]").prop("checked", selected.has(id));
					updateSel();
				});
				$body.find("input[type=checkbox]").off("change").on("change", function () {
					const id = parseInt($(this).closest("[data-rid]").data("rid"));
					$(this).prop("checked") ? selected.add(id) : selected.delete(id);
					$(this).closest("[data-rid]").toggleClass("ol-r-selected", selected.has(id));
					updateSel();
				});
			};

			renderBody();
			$overlay.on("input change", "#olDISearch, #olDIGroup, #olDIBrand", renderBody);

			$overlay.on("click", "[data-mf-trigger]", function (e) {
				e.stopPropagation();
				const key = $(this).data("mfTrigger");
				const $menu = $overlay.find(`[data-mf-menu='${key}']`);
				const isOpen = $menu.is(":visible");
				$overlay.find(".ol-di-multi-menu").hide();
				if (!isOpen) $menu.show();
			});
			$overlay.on("change", ".ol-di-mf-check", function () {
				const key = $(this).data("mfCheck");
				const val = String($(this).val());
				const set = key === "tenure" ? selTenures : selPeriods;
				this.checked ? set.add(val) : set.delete(val);
				const base = key === "tenure" ? "Tenure" : "Year/Months";
				$overlay.find(`[data-mf-label='${key}']`).text(set.size ? `${base} (${set.size})` : `All ${base}`);
				renderBody();
			});
			$overlay.on("click", function (e) {
				if (!$(e.target).closest(".ol-di-multi").length) $overlay.find(".ol-di-multi-menu").hide();
			});

			const closeIt = () => $overlay.remove();
			$overlay.on("click", "#olDIPopupClose, #olDICancel", closeIt);
			$overlay.on("click", (e) => { if ($(e.target).is($overlay)) closeIt(); });

			$overlay.on("click", "#olDIConfirm", async () => {
				const rows = data.filter((i) => selected.has(i.id));
				if (!Array.isArray(me.detailItems)) me.detailItems = [];
				for (const item of rows) {
					let resolvedItem = null;
					if (type !== "new") {
						const lookupKey = item.code || item.item_code || item.product_name || item.name || "";
						resolvedItem = await me.fetchERPItemByKey(lookupKey);
					}
					const resolvedCode =
						(resolvedItem && (resolvedItem.item_code || resolvedItem.name))
						|| item.code
						|| item.item_code
						|| "";
					const resolvedName =
						(resolvedItem && (resolvedItem.item_name || resolvedItem.name))
						|| item.product_name
						|| item.name
						|| "";
					const resolvedBrand =
						(resolvedItem && resolvedItem.brand)
						|| item.brand
						|| "—";
					const resolvedDesc =
						(resolvedItem && resolvedItem.description)
						|| item.description
						|| "";
					const resolvedUom =
						(resolvedItem && resolvedItem.stock_uom)
						|| item.uom
						|| "Nos";
					const resolvedSP =
						Number((resolvedItem && resolvedItem.standard_rate) || item.sp || 0) || 0;
					const resolvedGroup =
						(resolvedItem && resolvedItem.item_group)
						|| item.group
						|| "General";

					me.detailItems.push({
						id: `new-${Date.now()}-${Math.random()}`,
						name: resolvedName,
						code: resolvedCode,
						brand: resolvedBrand,
						group: resolvedGroup,
						type,
						qty: Number(item.qty || 1),
						sp: resolvedSP,
						bp: Number(item.bp || 0),
						uom: resolvedUom,
						discount: 0,
						sales_stage: "Initial Analysis",
						expected_date: item.end_date || "",
						description: resolvedDesc,
						renewId: item.renewId || "",
						start_date: item.start_date || "",
						end_date: item.end_date || "",
						is_orc: false,
						commission_type: "",
						rate_value: 0,
						forecast: "",
						expanded: false,
					});
				}
				me.renderDetailItemsTable();
				me.bindDetailItemCards();
				closeIt();
			});
		};

		const catalogue = (me.wizardERP_Items && me.wizardERP_Items.length) ? me.wizardERP_Items : [];

		const customerName = (me.detailRecord && me.detailRecord.party_name)
			|| (me.detailRecord && me.detailRecord.customer_name)
			|| (me.selectedRecord && me.selectedRecord.party)
			|| "";

		const getAndOpen = (cat) => {
			const existingRenewals = (me.selectedCustomerDoc && me.selectedCustomerDoc.renewals) || [];
			if (existingRenewals.length || !customerName || !isRenewal) {
				loadAndOpen(cat, existingRenewals);
				return;
			}
			frappe.call({
				method: "frappe.client.get_list",
				args: {
					doctype: "Renewal List",
					fields: ["name", "customer_name", "start_date", "end_date",
						"product_name", "description", "total_amount", "total_quantity"],
					filters: [["Renewal List", "customer_name", "=", customerName]],
					limit_page_length: 100,
					order_by: "end_date asc",
				},
				callback: (r) => {
					const renewals = (r.message || []).map((s, i) => ({
						id: 1000 + i,
						renewId: s.name,
						name: s.product_name || s.name,
						product_name: s.product_name || "",
						customer: s.customer_name || "",
						start_date: s.start_date || "",
						end_date: s.end_date || "",
						brand: "—",
						group: "Renewal",
						qty: Number(s.total_quantity) || 1,
						sp: Number(s.total_amount) || 0,
						bp: 0,
						description: s.description || "",
						expiry: s.end_date || "",
					}));
					loadAndOpen(cat, renewals);
				},
				error: () => loadAndOpen(cat, []),
			});
		};

		if (!catalogue.length) {
			frappe.call({
				method: "frappe.client.get_list",
				args: {
					doctype: "Item",
					fields: ["name", "item_name", "item_code", "item_group", "brand",
						"description", "stock_uom", "standard_rate", "tenure", "years", "months"],
					filters: { disabled: 0 },
					limit_page_length: 1200,
					order_by: "item_name asc",
				},
				callback: (r) => {
					me.wizardERP_Items = (r.message || []).map((it, i) => ({
						id: i + 1,
						name: it.item_name || it.name,
						code: it.item_code || it.name,
						group: it.item_group || "General",
						brand: it.brand || "—",
						description: it.description || "",
						uom: it.stock_uom || "Nos",
						sp: Number(it.standard_rate || 0),
						bp: 0,
						tenure: it.tenure || "",
						years: it.years || "",
						months: it.months || ""

					}));
					getAndOpen(me.wizardERP_Items);
				},
			});
		} else {
			getAndOpen(catalogue);
		}
	}



	saveMetaSection() {
		const me = this;
		const record = me.detailRecord || me.selectedRecord;
		if (!record?.name) return;

		const $btn = me.$content.find("#olSaveMetaBtn");
		$btn.html('<i class="ti ti-loader"></i> Saving…').prop("disabled", true);

		// Fetch latest doc first to avoid modified conflict
		frappe.call({
			method: "frappe.client.get",
			args: { doctype: "Opportunity", name: record.name },
			callback: (latest) => {
				if (!latest.message) {
					frappe.show_alert({ message: "Could not fetch latest record.", indicator: "red" });
					$btn.html('<i class="ti ti-device-floppy"></i> Save Details').prop("disabled", false);
					return;
				}
				const latestDoc = latest.message;
				frappe.call({
					method: "frappe.client.save",
					args: {
						doc: {
							...latestDoc,
							company: me.$content.find("#olCompanyInput").val().trim(),
							sales_person: me.$content.find("#olSalesperson").val().trim(),
						}
					},
					callback: (r) => {
						if (r.message) {
							me.detailRecord = r.message;
							frappe.show_alert({ message: "Details saved!", indicator: "green" });
							me.$content.find("#olDetailMetaSaveBar").css("display", "none");
						} else {
							frappe.show_alert({ message: "Save failed.", indicator: "red" });
						}
						$btn.html('<i class="ti ti-device-floppy"></i> Save Details').prop("disabled", false);
					},
					error: () => {
						frappe.show_alert({ message: "Error saving.", indicator: "red" });
						$btn.html('<i class="ti ti-device-floppy"></i> Save Details').prop("disabled", false);
					}
				});
			},
			error: () => {
				frappe.show_alert({ message: "Error fetching latest record.", indicator: "red" });
				$btn.html('<i class="ti ti-device-floppy"></i> Save Details').prop("disabled", false);
			}
		});
	}

	_openRenewalPrompt(items, record) {
		const me = this;
		$("#olRenewalPromptOverlay").remove();
		const customerName = record.party_name || record.customer_name || "";

		const itemRows = items.map((it) => `
			<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(0,0,0,0.05);">
				<div style="width:28px;height:28px;border-radius:7px;background:rgba(217,119,6,0.1);color:#d97706;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="ti ti-refresh" style="font-size:14px;"></i></div>
				<div style="flex:1;min-width:0;">
					<div style="font-size:13px;font-weight:600;color:#111827;">${me.escapeAttr(it.name || "—")}</div>
					<div style="font-size:11px;color:#9ca3af;">Qty ${Number(it.qty || 0)} · ${me.formatCurrency(Number(it.qty || 0) * Number(it.sp || 0))}</div>
				</div>
			</div>`).join("");

		const $ov = $(`
		<div id="olRenewalPromptOverlay" style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9200;display:flex;align-items:center;justify-content:center;padding:20px;">
			<div style="background:#fff;border-radius:16px;width:100%;max-width:460px;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 24px 64px rgba(0,0,0,0.18);">
				<div style="padding:18px 22px 14px;border-bottom:1px solid rgba(0,0,0,0.08);">
					<div style="font-family:Syne,sans-serif;font-size:15px;font-weight:700;color:#111827;display:flex;align-items:center;gap:8px;"><i class="ti ti-refresh" style="color:#d97706;"></i> Create Renewal</div>
					<div style="font-size:12px;color:#6b7280;margin-top:4px;">${items.length} item(s) marked Closed Lost. A renewal must be created before saving.</div>
				</div>
				<div style="flex:1;overflow-y:auto;padding:14px 22px;">
					${itemRows}
					<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px;">
						<div><label style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;display:block;margin-bottom:4px;">Start Date</label><input type="date" id="olRenewStart" class="act-input" style="height:34px;"></div>
						<div><label style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;display:block;margin-bottom:4px;">End Date</label><input type="date" id="olRenewEnd" class="act-input" style="height:34px;"></div>
					</div>
				</div>
				<div style="padding:12px 22px;border-top:1px solid rgba(0,0,0,0.08);display:flex;justify-content:space-between;gap:8px;background:#f8fafc;align-items:center;">
					<button id="olRenewCancel" style="padding:8px 16px;border-radius:6px;border:1px solid rgba(0,0,0,0.1);background:#fff;font-size:13px;cursor:pointer;color:#374151;">Cancel save</button>
					<button id="olRenewYes" class="btn btn-primary" style="padding:8px 18px;">Create renewal & save</button>
				</div>
			</div>
		</div>`);

		me.$content.append($ov);

		const close = () => $ov.remove();
		// Cancel = abort the whole save; items stay unsaved
		$ov.on("click", "#olRenewCancel", () => {
			close();
			frappe.show_alert({ message: "Save cancelled — renewal not created.", indicator: "orange" });
		});
		$ov.on("click", (e) => { if ($(e.target).is($ov)) close(); });

		$ov.on("click", "#olRenewYes", () => {
			const startDate = $ov.find("#olRenewStart").val();
			const endDate = $ov.find("#olRenewEnd").val();
			if (!startDate || !endDate) { frappe.show_alert({ message: "Please set both start and end dates.", indicator: "orange" }); return; }
			if (endDate < startDate) { frappe.show_alert({ message: "End date must be after start date.", indicator: "orange" }); return; }

			const $btn = $ov.find("#olRenewYes");
			if ($btn.prop("disabled")) return;
			$btn.prop("disabled", true).text("Creating…");

			const oppId = record.name || me.detailRecord?.name || "";

			// shared across all renewals from this opportunity
			const rec = me.detailRecord || {};
			const salesTeam = Array.isArray(rec.sales_team) ? rec.sales_team : [];
			const salesUser = salesTeam.length ? (salesTeam[0].sales_person || "") : "";

			// contacts → Renewal Contacts rows (same shape as opp contact_list)
			const renewalContacts = (me._detailContacts || []).map((c, i) => ({
				user_name: c.docname || "",
				mobile_no: c.phone || "",
				email_id: c.email || "",
				designation: c.role || "",
				poc: (i === (me._detailPrimaryIdx || 0)) ? 1 : 0,
			}));

			const creations = items.map(it => new Promise((resolve) => {
				const qty  = Number(it.qty || 0);
				const rate = Number(it.sp || 0);
				const itemRow = {
					item_code: it.code || "",
					item_name: it.name || "",
					item_group: it.group || "",
					brand: (it.brand && it.brand !== "—") ? it.brand : "",
					item_brand: (it.brand && it.brand !== "—") ? it.brand : "",
					description: it.description || "",
					qty: qty,
					uom: it.uom || "Nos",
					stock_uom: it.uom || "Nos",
					rate: rate,
					price_list_rate: rate,
					amount: qty * rate,
					new_add: it.type === "renewal" ? "Renewal"
						: it.type === "additional" ? "Additional" : "New",
					start_date: startDate,
					end_date: endDate,
				};

				frappe.call({
					method: "frappe.client.insert",
					args: {
						doc: {
							doctype: "Renewal List",
							opportunity_id: oppId,
							customer_name: customerName,
							company: rec.company || "",
							product_name: it.name || "",
							start_date: startDate,
							end_date: endDate,
							total_quantity: qty,
							total_amount: qty * rate,
							status: "New",
							subject: rec.title || rec.subject || "",
							description: it.description || "",
							sales_user: salesUser,
							renewal_owner: frappe.session.user,
							items: [itemRow],
							contact_list: renewalContacts,
						}
					},
					callback: (r) => resolve(r.message ? r.message.name : null),
					error: () => resolve(null),
				});
			}));

			Promise.all(creations).then(results => {
				const ok = results.filter(Boolean).length;
				if (!ok) {
					$btn.prop("disabled", false).text("Create renewal & save");
					frappe.show_alert({ message: "Failed to create renewals. Save aborted.", indicator: "red" });
					return;
				}
				frappe.show_alert({ message: `${ok} renewal(s) created.`, indicator: "green" });
				close();
				// renewals done — now resume the item save, skipping the gate
				me._renewalCleared = true;
				me.saveItemsSection();
			});
		});
	}


	discardMetaSection() {
		const record = this.detailRecord || this.selectedRecord;
		if (record) this.injectDetailMeta(record);
		this.$content.find("#olDetailMetaSaveBar").css("display", "none");
		frappe.show_alert({ message: "Changes discarded.", indicator: "blue" });
	}





	saveItemsSection() {
		const me = this;
		// Gate: newly Closed Lost items must create a renewal before saving
		if (!me._renewalCleared) {
			const newlyLost = (me.detailItems || []).filter((it, i) => {
				const wasLost = (me._savedItemStages || [])[i] === "Closed Lost";
				return it.sales_stage === "Closed Lost" && !wasLost;
			});
			if (newlyLost.length) {
				me._openRenewalPrompt(newlyLost, me.detailRecord || {});
				return; // stop here — save resumes only after renewal is created
			}
		}
		me._renewalCleared = false; // reset for next save


		const record = me.detailRecord || me.selectedRecord;
		if (!record?.name) return;

		if (me.detailDescControls) {
			Object.entries(me.detailDescControls).forEach(([idx, ctrl]) => {
				if (me.detailItems[idx] && ctrl)
					me.detailItems[idx].description = ctrl.get_value() || "";
			});
		}

		const $btn = me.$content.find("#olSaveItemsBtn");
		$btn.html('<i class="ti ti-loader"></i> Saving…').prop("disabled", true);

		const items = me.detailItems.map(it => {
			const row = {
				item_name: it.name || "",
				item_code: it.code || "",
				brand: (it.brand && it.brand !== "—") ? it.brand : "",
				description: it.description || "",
				qty: Number(it.qty || 0),
				uom: it.uom || "Nos",
				rate: Number(it.sp || 0),
				amount: Number(it.qty || 0) * Number(it.sp || 0),
				spq_rate: Number(it.bp || 0),
				spq_amount: Number(it.qty || 0) * Number(it.bp || 0),
				sales_stage: it.sales_stage || "Initial Analysis",
				expected_date: it.expected_date || "",
				opportunity_type: it.type === "renewal" ? "Renewal" : it.type === "additional" ? "Additional" : "New",
				renewal_id: it.renewId || "",
				commission_type: it.commission_type || "",
				rate_value: Number(it.rate_value || 0),
				orc: it.orc ? 1 : 0,
				forecast: it.forecast || "",
			};
			if (it.id && !String(it.id).startsWith("new-")) row.name = it.id;
			return row;
		});

		// Fetch latest doc first to avoid modified conflict
		frappe.call({
			method: "frappe.client.get",
			args: { doctype: "Opportunity", name: record.name },
			callback: (latest) => {
				if (!latest.message) {
					frappe.show_alert({ message: "Could not fetch latest record.", indicator: "red" });
					$btn.html('<i class="ti ti-device-floppy"></i> Save Items').prop("disabled", false);
					return;
				}
				frappe.call({
					method: "frappe.client.save",
					args: { doc: { ...latest.message, items } },
					callback: (r) => {
						if (r.message) {
							me.detailRecord = r.message;
							frappe.show_alert({ message: "Items saved!", indicator: "green" });
							me.$content.find("#olItemsSaveBar").css("display", "none");
							me.injectDetailFinancials(r.message);
							// refresh the saved-stage snapshot now that items are persisted
							me._savedItemStages = (me.detailItems || []).map(it => it.sales_stage || "");
							const saved = Array.isArray(r.message.items) ? r.message.items : [];
							saved.forEach((si, i) => {
								if (me.detailItems[i]) me.detailItems[i].id = si.name || me.detailItems[i].id;
							});
						} else {
							frappe.show_alert({ message: "Save failed.", indicator: "red" });
						}
						$btn.html('<i class="ti ti-device-floppy"></i> Save Items').prop("disabled", false);
					},
					error: () => {
						frappe.show_alert({ message: "Error saving items.", indicator: "red" });
						$btn.html('<i class="ti ti-device-floppy"></i> Save Items').prop("disabled", false);
					}
				});
			},
			error: () => {
				frappe.show_alert({ message: "Error fetching latest record.", indicator: "red" });
				$btn.html('<i class="ti ti-device-floppy"></i> Save Items').prop("disabled", false);
			}
		});
	}


	discardItemsSection() {
		const record = this.detailRecord || this.selectedRecord;
		if (record) {
			this.injectItemsTable(record);
			this.injectDetailFinancials(record);
		}
		this.$content.find("#olItemsSaveBar").css("display", "none");
		frappe.show_alert({ message: "Item changes discarded.", indicator: "blue" });
	}









	// ─── CREATE DROPDOWN + ITEMS POPUP ───────────────────────────
	bindCreateDropdown() {
		const me = this;
		const record = this.detailRecord || this.selectedRecord;
		const oppId = record?.name || "";

		// ── Create dropdown — route-based navigation ────────────
		// this.$content.off("click.olCreate", "#olBtnCreate")
		// 	.on("click.olCreate", "#olBtnCreate", (e) => {
		// 		e.stopPropagation();
		// 		this.$content.find("#olConnDropdown").removeClass("open");
		// 		this.$content.find("#olCreateDropdown").toggleClass("open");
		// 	});

		this.$content.off("click.olCreate", "#olBtnCreate")
			.on("click.olCreate", "#olBtnCreate", (e) => {
				e.stopPropagation();
				this.$content.find("#olConnDropdown").removeClass("open");
				const $dd = this.$content.find("#olCreateDropdown");
				const $btn = $(e.currentTarget);
				const isOpen = $dd.hasClass("open");
				if (isOpen) { $dd.removeClass("open"); return; }
				// position fixed below the button so card overflow can't clip it
				const rect = $btn[0].getBoundingClientRect();
				$dd.css({
					position: "fixed",
					top: rect.bottom + 6 + "px",
					right: (window.innerWidth - rect.right) + "px",
					left: "auto",
					zIndex: 9999,
				}).addClass("open");
			});

		this.$content.off("click.olCreate", ".ol-create-item")
			.on("click.olCreate", ".ol-create-item", (e) => {
				e.stopPropagation();
				const route = String($(e.currentTarget).data("route") || "");
				const label = $(e.currentTarget).find("span").text().trim();
				this.$content.find("#olCreateDropdown").removeClass("open");
				if (!route) return;
				this.openItemsPopup(route, label);   // pass the route directly
			});

		// ── Connections dropdown ──────────────────────────────
		this.$content.off("click.olCreate", "#olBtnConn")
			.on("click.olCreate", "#olBtnConn", (e) => {
				e.stopPropagation();
				this.$content.find("#olCreateDropdown").removeClass("open");
				this.$content.find("#olConnDropdown").toggleClass("open");
			});

		// Load connections immediately (count shows on button without clicking)
		if (oppId && !this.$content.find("#olConnList").data("loaded")) {
			me.loadConnections(oppId);
		}

		// Close both on outside click
		$(document).off("click.olD").on("click.olD", (e) => {
			const createWrap = this.$content.find("#olCreateWrap").get(0);
			if (!createWrap || !createWrap.contains(e.target))
				this.$content.find("#olCreateDropdown").removeClass("open");
			const connWrap = this.$content.find("#olConnWrap").get(0);
			if (!connWrap || !connWrap.contains(e.target))
				this.$content.find("#olConnDropdown").removeClass("open");
			const $dd = this.$content.find("#mentionDropdown").get(0);
			if ((!$dd || !$dd.contains(e.target)) && e.target.id !== "commentText")
				this.$content.find("#mentionDropdown").addClass("hidden").hide();
		});
	}

	loadConnections(oppId) {
		const me = this;
		const $list = this.$content.find("#olConnList");
		const $count = this.$content.find("#olConnCount");
		if (!oppId) return;

		$list.data("loaded", true);

		// Only Quotation has a standard "opportunity" link field in ERPNext.
		// For others, we use frappe.get_linked_docs approach via name search.
		// Define each category — field:null means skip filter (show 0).
		const CATEGORIES = [
			{
				key: "quotation",
				label: "Quotations",
				icon: "ti-file-invoice",
				route: "quote-list",
				doctype: "Quotation",
				field: "opportunity",   // valid field on Quotation
			},
			{
				key: "supplier_quotation",
				label: "Supplier Quotations",
				icon: "ti-building-store",
				route: "supplier-quotations",
				doctype: "Supplier Quotation",
				field: "opportunity",            // no standard opportunity link → show 0
			},
			{
				key: "orc",
				label: "ORC List",
				icon: "ti-list-details",
				route: "orc-list",
				doctype: null,            // custom doctype — skip until configured
				field: null,
			},
			{
				key: "renewal_list",
				label: "Renewal List",
				icon: "ti-refresh",
				route: "renewal-list",
				doctype: null,            // custom doctype — skip until configured
				field: null,
			},
		];

		// Render skeleton rows immediately
		$list.html(CATEGORIES.map(cat => `
			<div class="ol-conn-cat" data-key="${cat.key}"
				style="display:flex;align-items:center;gap:10px;padding:9px 14px;
					cursor:pointer;position:relative;transition:background .12s;user-select:none;">
				<div style="width:30px;height:30px;border-radius:8px;background:rgba(59,126,248,0.08);
					display:flex;align-items:center;justify-content:center;flex-shrink:0;">
					<i class="ti ${cat.icon}" style="font-size:14px;color:#3b7ef8;"></i>
				</div>
				<div style="flex:1;min-width:0;">
					<div style="font-size:13px;font-weight:600;color:#111827;white-space:nowrap;">
						${me.escapeAttr(cat.label)}
					</div>
				</div>
				<span class="ol-conn-badge" data-badge="${cat.key}"
					style="min-width:20px;height:20px;border-radius:10px;background:#e5e7eb;
						color:#9ca3af;font-size:11px;font-weight:700;display:inline-flex;
						align-items:center;justify-content:center;padding:0 6px;">0</span>
				<i class="ti ti-chevron-right" style="font-size:12px;color:#d1d5db;flex-shrink:0;"></i>
			</div>`).join(""));

		// ── Raw $.ajax fetch — always resolves, never hangs ──────
		const fetchCat = (cat) => new Promise(resolve => {
			// Skip if no doctype or no field configured
			if (!cat.doctype || !cat.field) {
				return resolve({ ...cat, docs: [] });
			}

			$.ajax({
				url: "/api/method/frappe.client.get_list",
				type: "POST",
				contentType: "application/json",
				data: JSON.stringify({
					doctype: cat.doctype,
					fields: JSON.stringify(["name", "status"]),
					filters: JSON.stringify([[cat.doctype, cat.field, "=", oppId]]),
					limit_page_length: 50,
					order_by: "modified desc",
				}),
				headers: {
					"X-Frappe-CSRF-Token": frappe.csrf_token || "",
					"Accept": "application/json",
				},
				complete: (xhr) => {
					try {
						const data = typeof xhr.responseJSON === "object"
							? xhr.responseJSON
							: JSON.parse(xhr.responseText || "{}");
						resolve({ ...cat, docs: (data && data.message) || [] });
					} catch (e) {
						resolve({ ...cat, docs: [] });
					}
				},
			});
		});

		Promise.all(CATEGORIES.map(fetchCat)).then(results => {
			me._connResults = {};
			let totalCount = 0;

			results.forEach(r => {
				me._connResults[r.key] = r;
				const count = r.docs.length;
				totalCount += count;

				$list.find(`[data-badge="${r.key}"]`)
					.text(count)
					.css({
						background: count > 0 ? "#3b7ef8" : "#e5e7eb",
						color: count > 0 ? "#fff" : "#9ca3af",
					});
			});

			$count.text(totalCount || "0");
			me._bindConnHover();
		});
	}


	// _bindConnHover() {
	// 	const me = this;
	// 	let $activePanel = null;
	// 	let hideTimer = null;

	// 	const CAT_META = {
	// 		quotation: { label: "Quotations", icon: "ti-file-invoice", route: "quote-list", doctype: "Quotation" },
	// 		supplier_quotation: { label: "Supplier Quotations", icon: "ti-building-store", route: "supplier-quotations", doctype: "Supplier Quotation" },
	// 		orc: { label: "ORC List", icon: "ti-list-details", route: "orc-list", doctype: "Customer Order Form" },
	// 		renewal_list: { label: "Renewal List", icon: "ti-refresh", route: "renewal-list", doctype: "Renewal List" },
	// 	};

	// 	const showPanel = ($row, cat) => {
	// 		$(".ol-conn-subpanel").remove();
	// 		if ($activePanel) $activePanel.remove();

	// 		const docs = me._connResults?.[cat.key]?.docs || [];

	// 		const docRows = docs.length
	// 			? docs.map(d => `
	// 				<div class="ol-conn-doc-row"
	// 					data-doctype="${me.escapeAttr(cat.doctype)}"
	// 					data-docname="${me.escapeAttr(d.name)}"
	// 					data-listroute="${me.escapeAttr(cat.route)}"
	// 					style="display:flex;align-items:center;gap:10px;padding:9px 14px;
	// 						cursor:pointer;border-bottom:1px solid rgba(0,0,0,0.05);transition:background .1s;">
	// 					<div style="flex:1;min-width:0;">
	// 						<div style="font-size:12px;font-weight:600;color:#111827;
	// 							white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
	// 							${me.escapeAttr(d.name)}
	// 						</div>
	// 						${d.status ? `<div style="font-size:10px;color:#6b7280;margin-top:1px;">${me.escapeAttr(d.status)}</div>` : ""}
	// 					</div>
	// 					<i class="ti ti-external-link" style="font-size:12px;color:#9ca3af;flex-shrink:0;"></i>
	// 				</div>`).join("")
	// 			: `<div style="padding:20px 14px;text-align:center;font-size:12px;color:#9ca3af;">
	// 					<i class="ti ti-inbox" style="font-size:20px;display:block;margin-bottom:6px;color:#d1d5db;"></i>
	// 					No ${me.escapeAttr(cat.label.toLowerCase())} linked
	// 				</div>`;

	// 		const rowRect = $row[0].getBoundingClientRect();
	// 		const ddEl = me.$content.find("#olConnDropdown")[0];
	// 		const ddRect = ddEl ? ddEl.getBoundingClientRect() : rowRect;
	// 		const panelW = 260;
	// 		const panelTop = rowRect.top;
	// 		const panelLeft = Math.min(ddRect.right + 6, window.innerWidth - panelW - 10);

	// 		const $panel = $(`
	// 		<div class="ol-conn-subpanel"
	// 			style="position:fixed;z-index:9999;
	// 				top:${panelTop}px;left:${panelLeft}px;width:${panelW}px;
	// 				background:#fff;border:1px solid rgba(0,0,0,0.1);
	// 				border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,0.14);overflow:hidden;">
	// 			<div style="padding:10px 14px 8px;border-bottom:1px solid rgba(0,0,0,0.07);
	// 				display:flex;align-items:center;gap:8px;">
	// 				<div style="width:24px;height:24px;border-radius:6px;background:rgba(59,126,248,0.1);
	// 					display:flex;align-items:center;justify-content:center;flex-shrink:0;">
	// 					<i class="ti ${cat.icon}" style="font-size:12px;color:#3b7ef8;"></i>
	// 				</div>
	// 				<span style="font-size:13px;font-weight:700;color:#111827;flex:1;white-space:nowrap;">
	// 					${me.escapeAttr(cat.label)}
	// 				</span>
	// 				<span style="font-size:11px;font-weight:700;color:#3b7ef8;
	// 					background:rgba(59,126,248,0.1);border-radius:20px;padding:2px 8px;">
	// 					${docs.length}
	// 				</span>
	// 			</div>
	// 			<div style="max-height:174px;overflow-y:auto;overflow-x:hidden;">
	// 				${docRows}
	// 			</div>
	// 			${docs.length > 0 ? `
	// 			<div style="padding:8px 14px;border-top:1px solid rgba(0,0,0,0.07);
	// 				display:flex;justify-content:flex-end;">
	// 				<button class="ol-conn-open-all" data-route="${me.escapeAttr(cat.route)}"
	// 					style="font-size:11px;font-weight:600;color:#3b7ef8;background:none;
	// 						border:none;cursor:pointer;display:flex;align-items:center;gap:4px;padding:0;">
	// 					View all ${me.escapeAttr(cat.label)}
	// 					<i class="ti ti-arrow-right" style="font-size:11px;"></i>
	// 				</button>
	// 			</div>` : ""}
	// 		</div>`);

	// 		$("body").append($panel);
	// 		$activePanel = $panel;

	// 		me.$content.find(".ol-conn-cat").css("background", "");
	// 		$row.css("background", "rgba(59,126,248,0.06)");

	// 		$panel.on("mouseenter", () => { if (hideTimer) clearTimeout(hideTimer); });
	// 		$panel.on("mouseleave", () => {
	// 			hideTimer = setTimeout(() => {
	// 				$panel.remove(); $activePanel = null;
	// 				me.$content.find(".ol-conn-cat").css("background", "");
	// 			}, 180);
	// 		});
	// 		$panel.on("click", ".ol-conn-doc-row", function () {
	// 			const route = $(this).data("listroute");   // e.g. "quote-list"
	// 			const docname = $(this).data("docname");     // e.g. "QTN262700026"
	// 			if (route && docname) {
	// 				// Open custom page with doc name as route param
	// 				frappe.set_route(route, docname);
	// 			} else if (route) {
	// 				frappe.set_route(route);
	// 			}
	// 			$panel.remove();
	// 			me.$content.find("#olConnDropdown").removeClass("open");
	// 		});

	// 		$panel.on("click", ".ol-conn-open-all", function () {
	// 			const route = $(this).data("route");
	// 			if (route) frappe.set_route(route);   // just the list, no docname
	// 			$panel.remove();
	// 			me.$content.find("#olConnDropdown").removeClass("open");
	// 		});


	// 	};

	// 	me.$content.find(".ol-conn-cat").each(function () {
	// 		const $row = $(this);
	// 		const key = $row.data("key");

	// 		$row.on("mouseenter.connHover", () => {
	// 			if (hideTimer) clearTimeout(hideTimer);
	// 			const cat = CAT_META[key];
	// 			if (cat) showPanel($row, { ...cat, key });
	// 		});
	// 		$row.on("mouseleave.connHover", () => {
	// 			hideTimer = setTimeout(() => {
	// 				if ($activePanel) { $activePanel.remove(); $activePanel = null; }
	// 				me.$content.find(".ol-conn-cat").css("background", "");
	// 			}, 180);
	// 		});
	// 	});

	// 	$(document).off("click.olConnClose").on("click.olConnClose", (e) => {
	// 		if (!$(e.target).closest("#olConnWrap, .ol-conn-subpanel").length) {
	// 			if ($activePanel) { $activePanel.remove(); $activePanel = null; }
	// 			me.$content.find(".ol-conn-cat").css("background", "");
	// 		}
	// 	});
	// }

	_bindConnHover() {
		const me = this;

		const ROUTE = {
			quotation: "quote-list",
			supplier_quotation: "supplier-quote-list",
			orc: "orc-list",
			renewal_list: "renewal-list",
		};

		me.$content.find(".ol-conn-cat").each(function () {
			const $row = $(this);
			const key = $row.data("key");
			$row.css("cursor", "pointer");
			$row.off("mouseenter.connHover mouseleave.connHover");
			$row.off("click.connNav").on("click.connNav", () => {
				const route = ROUTE[key];
				if (!route) return;
				// read oppId FRESH at click time, not at bind time
				const oppId = me.detailRecord?.name || me.selectedRecord?.id || "";
				frappe.route_options = { opportunity: oppId };
				frappe.set_route(route);
				me.$content.find("#olConnDropdown").removeClass("open");
			});
		});
	}

	openItemsPopup(createType, createLabel) {
		const me = this;
		const record = this.detailRecord || this.selectedRecord;
		const items = Array.isArray(record?.items) ? record.items : [];

		// Build rows — one per item with a checkbox
		const itemRows = items.length
			? items.map((item, i) => `
				<tr class="ol-popup-item-row" data-idx="${i}">
					<td style="width:36px;text-align:center;">
						<input type="checkbox" class="ol-item-check" data-idx="${i}" checked style="accent-color:#3b7ef8;width:14px;height:14px;cursor:pointer;">
					</td>
					<td colspan="2">
						<div style="font-weight:600;font-size:13px;color:#111827;line-height:1.35;">${me.escapeAttr(item.item_name || item.item_code || "—")}</div>
						<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;font-size:11px;color:#6b7280;">
							${item.brand && item.brand !== "—" ? `<span style="display:inline-flex;align-items:center;gap:3px;"><i class="ti ti-tag" style="font-size:10px;color:#9ca3af;"></i>${me.escapeAttr(item.brand)}</span>` : ""}
							${item.item_group ? `<span style="display:inline-flex;align-items:center;gap:3px;"><i class="ti ti-category" style="font-size:10px;color:#9ca3af;"></i>${me.escapeAttr(item.item_group)}</span>` : ""}
							${item.tenure ? `<span style="display:inline-flex;align-items:center;gap:3px;"><i class="ti ti-clock" style="font-size:10px;color:#9ca3af;"></i>${me.escapeAttr(item.tenure)}</span>` : ""}
							${item.tenure_period ? `<span style="display:inline-flex;align-items:center;gap:3px;"><i class="ti ti-calendar" style="font-size:10px;color:#9ca3af;"></i>${me.escapeAttr(item.years || item.months)}</span>` : ""}
						</div>
					</td>
					<td style="text-align:right;">
						<input type="number" class="ol-item-qty" data-idx="${i}" value="${Number(item.qty || item.quantity || 1)}"
							style="width:64px;text-align:right;border:1px solid rgba(0,0,0,0.12);border-radius:6px;padding:4px 6px;font-size:12px;font-family:inherit;">
					</td>
					<td style="text-align:right;font-size:12px;font-weight:500;color:#111827;white-space:nowrap;">
						₹${Number(item.rate || item.price_list_rate || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
					</td>
				</tr>`).join("")
			: `<tr><td colspan="5" style="text-align:center;padding:24px;color:#9ca3af;font-size:13px;">No items on this opportunity.<br><span style="font-size:12px;">You can proceed and add items manually.</span></td></tr>`;

		// Inject popup overlay into page
		const $overlay = $(`
		<div id="olItemsOverlay" style="
			position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9000;
			display:flex;align-items:center;justify-content:center;padding:20px;">
			<div id="olItemsPopup" style="
				background:#fff;border-radius:16px;width:100%;max-width:680px;
				box-shadow:0 20px 60px rgba(0,0,0,0.2);display:flex;flex-direction:column;max-height:90vh;overflow:hidden;">

				<!-- Header -->
				<div style="padding:18px 22px;border-bottom:1px solid rgba(0,0,0,0.08);display:flex;align-items:center;justify-content:space-between;">
					<div>
						<div style="font-family:'Syne',sans-serif;font-size:16px;font-weight:700;color:#111827;">Create ${me.escapeAttr(createLabel)}</div>
						<div style="font-size:12px;color:#9ca3af;margin-top:2px;">Select items to include</div>
					</div>
					<button id="olPopupClose" style="width:32px;height:32px;border:1px solid rgba(0,0,0,0.1);border-radius:8px;background:#f7f8fa;cursor:pointer;font-size:16px;color:#6b7280;display:flex;align-items:center;justify-content:center;">
						<i class="ti ti-x"></i>
					</button>
				</div>

				<!-- Select all row -->
				<div style="padding:10px 22px;border-bottom:1px solid rgba(0,0,0,0.06);background:#f8fafc;display:flex;align-items:center;gap:8px;">
					<input type="checkbox" id="olSelectAll" checked style="accent-color:#3b7ef8;width:14px;height:14px;cursor:pointer;">
					<label for="olSelectAll" style="font-size:12px;font-weight:600;color:#374151;cursor:pointer;">Select All Items</label>
					<span id="olItemCount" style="margin-left:auto;font-size:11px;color:#9ca3af;">${items.length} item${items.length !== 1 ? "s" : ""}</span>
				</div>

				<!-- Items table -->
				<div style="overflow-y:auto;flex:1;min-height:0;">
					<table style="width:100%;border-collapse:collapse;font-size:12px;font-family:'DM Sans',sans-serif;">
						<thead style="position:sticky;top:0;background:#f1f5f9;z-index:1;">
							<tr>
								<th style="width:36px;padding:8px 10px;"></th>
								<th colspan="2" style="padding:8px 10px;text-align:left;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#9ca3af;">Item</th>
								<th style="padding:8px 10px;text-align:right;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#9ca3af;">Qty</th>
								<th style="padding:8px 10px;text-align:right;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#9ca3af;">Rate</th>
							</tr>
						</thead>
						<tbody id="olPopupItemBody">
							${itemRows}
						</tbody>
					</table>
				</div>

				<!-- Footer -->
				<div style="padding:14px 22px;border-top:1px solid rgba(0,0,0,0.08);display:flex;align-items:center;justify-content:space-between;background:#f8fafc;">
					<span id="olPopupSelectedCount" style="font-size:12px;color:#6b7280;">${items.length} item${items.length !== 1 ? "s" : ""} selected</span>
					<div style="display:flex;gap:8px;">
						<button id="olPopupCancel" style="padding:8px 16px;border-radius:6px;border:1px solid rgba(0,0,0,0.1);background:#fff;color:#374151;font-size:13px;font-family:inherit;cursor:pointer;">Cancel</button>
						<button id="olPopupConfirm" style="padding:8px 20px;border-radius:6px;border:none;background:#3b7ef8;color:#fff;font-size:13px;font-weight:600;font-family:inherit;cursor:pointer;">
							<i class="ti ti-check" style="margin-right:4px;"></i> Create ${me.escapeAttr(createLabel)}
						</button>
					</div>
				</div>
			</div>
		</div>`);

		$("body").append($overlay);

		const updateCount = () => {
			const total = $overlay.find(".ol-item-check").length;
			const checked = $overlay.find(".ol-item-check:checked").length;
			$overlay.find("#olPopupSelectedCount").text(`${checked} of ${total} item${total !== 1 ? "s" : ""} selected`);
			$overlay.find("#olSelectAll").prop("indeterminate", checked > 0 && checked < total);
			$overlay.find("#olSelectAll").prop("checked", checked === total);
			// Dim unchecked rows
			$overlay.find(".ol-popup-item-row").each(function () {
				const isChecked = $(this).find(".ol-item-check").prop("checked");
				$(this).css("opacity", isChecked ? "1" : "0.4");
			});
		};

		// Select all toggle
		$overlay.on("change", "#olSelectAll", function () {
			$overlay.find(".ol-item-check").prop("checked", $(this).prop("checked"));
			updateCount();
		});

		// Individual checkbox toggle
		$overlay.on("change", ".ol-item-check", updateCount);

		// Row click selects checkbox
		$overlay.on("click", ".ol-popup-item-row", function (e) {
			if ($(e.target).is("input")) return;
			const $cb = $(this).find(".ol-item-check");
			$cb.prop("checked", !$cb.prop("checked"));
			updateCount();
		});

		// Close
		const closePopup = () => $overlay.remove();
		$overlay.on("click", "#olPopupClose, #olPopupCancel", closePopup);
		$overlay.on("click", function (e) { if ($(e.target).is("#olItemsOverlay")) closePopup(); });

		// Confirm — collect selected items and route
		// $overlay.on("click", "#olPopupConfirm", function() {
		// 	const selectedItems = [];
		// 	$overlay.find(".ol-item-check:checked").each(function() {
		// 		const idx  = parseInt($(this).data("idx"));
		// 		const qty  = parseFloat($overlay.find(`.ol-item-qty[data-idx="${idx}"]`).val()) || 1;
		// 		const item = items[idx];
		// 		if (item) selectedItems.push({ ...item, qty });
		// 	});

		// 	closePopup();

		// 	// Route to the appropriate doctype new form with pre-filled data
		// 	const routeMap = {
		// 		quotation:          "Quotation",
		// 		supplier_quotation: "Supplier Quotation",
		// 		orc_list:           "Customer Order Form",
		// 		renewal_list:       "Renewal",
		// 	};
		// 	const doctype = routeMap[createType];
		// 	if (doctype) {
		// 		// Open new Frappe form with opportunity items pre-filled
		// 		const routeDoc = frappe.model.make_new_doc_and_get_name(doctype);
		// 		if (routeDoc) {
		// 			frappe.set_route("Form", doctype, routeDoc);
		// 		} else {
		// 			frappe.new_doc(doctype, {
		// 				customer: record?.customer_name,
		// 				opportunity: record?.name,
		// 				items: selectedItems.map((it) => ({
		// 					item_code: it.item_code,
		// 					item_name: it.item_name,
		// 					qty: it.qty,
		// 					rate: it.rate || it.price_list_rate || 0,
		// 				})),
		// 			});
		// 		}
		// 	} else {
		// 		frappe.show_alert({ message: `Created ${createLabel} with ${selectedItems.length} item(s)`, indicator: "green" });
		// 	}
		// });

		$overlay.on("click", "#olPopupConfirm", function () {
			const selectedItems = [];
			$overlay.find(".ol-item-check:checked").each(function () {
				const idx = parseInt($(this).data("idx"));
				const qty = parseFloat($overlay.find(`.ol-item-qty[data-idx="${idx}"]`).val()) || 1;
				const item = items[idx];
				if (item) selectedItems.push({ ...item, qty });
			});
			closePopup();

			const oppId = record?.name || "";
			const custName = record?.customer_name || record?.party_name || "";
			const payload = {
				opportunity: oppId,
				customer: custName,
				items: selectedItems,
			};

			// stash selected items + source opp so the target form can pre-fill
			frappe._createFromOpportunity = payload;

			// route per target
			if (createType === "quote-list") {
				frappe._quoteFromOpportunity = payload;     // quotation page reads this payload
				frappe.set_route("quote-list", "new");
			} else if (createType === "orc-list") {
				frappe.set_route("orc-list", "new");        // custom page (to build later)
			} else if (createType === "supplier-quotations") {
				// standard doctype — open new form pre-filled
				frappe.new_doc("Supplier Quotation", {
					items: selectedItems.map(it => ({
						item_code: it.item_code,
						item_name: it.item_name,
						qty: it.qty,
						rate: it.rate || it.price_list_rate || 0,
					})),
				});
			} else if (createType === "renewal-list") {
				// standard doctype
				frappe.new_doc("Renewal List", {
					customer_name: custName,
					opportunity: oppId,
				});
			} else {
				frappe.set_route(createType);
			}
		});

		updateCount();
	}

	// ─── NEW FORM VIEW ────────────────────────────────────────────
	renderNewView() {
		this.page.set_title("New Opportunity");
		document.title = "New Opportunity";
		$("#support-page-content").removeClass("ol-content-fixed").addClass("ol-content-scroll");
		this.$content.html(frappe.opp_list_page_template.newForm);
		this.initWizard();

		const urlParams = new URLSearchParams(window.location.search);
		const customerParam = urlParams.get('customer') || urlParams.get('customer_name') || urlParams.get('party_name') || urlParams.get('name1');
		if (customerParam) {
			frappe.call({
				method: "frappe.client.get_value",
				args: {
					doctype: "Customer",
					filters: { name: customerParam },
					fieldname: ["name", "customer_name"]
				},
				callback: (r) => {
					if (r && r.message) {
						const customer = r.message;
						const label = customer.customer_name || customer.name;
						this.$content.find("#olFCustomer").val(label);
						this.onCustomerSelected(customer.name);
					}
				}
			});
		}
	}

	initWizard() {
		const me = this;
		me.wizardStep = 1;
		me.wizardItems = [];   // items added to step 3
		me.wizardFiles = [];
		// me.wizardContacts = [{ name:"", phone:"", email:"", role:"" }, { name:"", phone:"", email:"", role:"" }];
		me.wizardContacts = [];
		me.wizardCustomers = [];  // full customer list
		me.wizardERP_Items = [];  // items from ERPNext Item doctype
		me.selectedCustomerDoc = null; // { name, customer_name, contacts:[] }
		me.itemLookupReqSeq = 0;
		me.defaultCompanyName = "64 Network Security Pvt Ltd - TG";

		// ── Fetch customers ──────────────────────────────────
		frappe.call({
			method: "frappe.client.get_list",
			args: {
				doctype: "Customer",
				fields: ["name", "customer_name", "customer_group", "territory"],
				limit_page_length: 500, order_by: "customer_name asc"
			},
			callback: (r) => {
				me.wizardCustomers = (r.message || []).map(c => ({
					v: c.customer_name || c.name,
					s: c.name,
					g: c.customer_group || "",
					i: (c.customer_name || c.name).substring(0, 2).toUpperCase(),
					c: "#3b7ef8"
				}));
			}
		});

		// ── Fetch ERPNext items ──────────────────────────────
		frappe.call({
			method: "frappe.client.get_list",
			args: {
				doctype: "Item",
				fields: ["name", "item_name", "item_code", "item_group", "brand", "description", "stock_uom", "standard_rate", "tenure", "years", "months"],
				filters: { disabled: 0 },
				limit_page_length: 1200, order_by: "item_name asc"
			},
			callback: (r) => {
				me.wizardERP_Items = (r.message || []).map((it, idx) => ({
					id: idx + 1,
					name: it.item_name || it.name,
					code: it.item_code || it.name,
					group: it.item_group || "General",
					brand: it.brand || "—",
					description: it.description || "",
					uom: it.stock_uom || "Nos",
					sp: Number(it.standard_rate || 0),
					bp: 0,
					tenure: it.tenure || "",
					years: it.years || "",
					months: it.months || ""
				}));
			}
		});

		// ── Bind back button ────────────────────────────────
		me.$content.on("click.olNew", ".ol-back-btn", () => frappe.set_route("opp-list"));

		// ── Stepper click (backward only) ───────────────────
		me.$content.on("click.olNew", ".ol-step", (e) => {
			const n = parseInt($(e.currentTarget).data("step"));
			if (n < me.wizardStep) me.goWizardStep(n);
		});

		// ── Next / Back buttons ─────────────────────────────
		me.$content.on("click.olNew", "[data-wiz-next]", (e) => {
			// Gate: leaving Items step (step 3) requires forecast + sales_stage on every item
			const goingTo = parseInt($(e.currentTarget).attr("data-wiz-next"));
			if (goingTo === 4) {
				const items = Array.isArray(me.wizardItems) ? me.wizardItems : [];
				if (!items.length) {
					frappe.msgprint({
						title: "No items added",
						message: "Please add at least one item before continuing.",
						indicator: "red",
					});
					return;
				}
				const blank = (v) => !String(v || "").trim();
				const bad = items.filter(it =>
					blank(it.forecast) ||
					blank(it.sales_stage) ||
					blank(it.expected_date)
				);
				if (bad.length) {
					frappe.msgprint({
						title: "Required fields missing",
						message: `Please fill <b>Forecast</b>, <b>Sales Stage</b>, and <b>Expected Date</b> for all items before continuing.<br>${bad.length} item(s) still need them.`,
						indicator: "red",
					});
					return;   // block — stays on Items step
				}
			}
			const n = parseInt($(e.currentTarget).data("wizNext"));
			if (me.validateWizardStep(me.wizardStep)) me.goWizardStep(n);
		});
		me.$content.on("click.olNew", "[data-wiz-back]", (e) => {
			me.goWizardStep(parseInt($(e.currentTarget).data("wizBack")));
		});

		// ── Customer — live search (Customer doctype) ──────────
		me.$content.on("input.olNew focus.olNew", "#olFCustomer", (e) => {
			me.searchLiveLink($(e.currentTarget), "#olCustDD", "Customer", "customer_name", ".ol-cust-item", "ti-building-store");
		});
		me.$content.on("keydown.olNew", "#olFCustomer", (e) => me.linkKeyNav(e, "#olCustDD"));
		me.$content.on("mousedown.olNew", ".ol-cust-item", (e) => {
			e.preventDefault();
			const $item = $(e.currentTarget);
			me.$content.find("#olFCustomer").val($item.data("label"));
			me.$content.find("#olCustDD").removeClass("open");
			me.onCustomerSelected($item.data("docname"));
		});

		// ── Company — live search (Company doctype) ─────────────
		me.$content.on("input.olNew focus.olNew", "#olFCompany", (e) => {
			me.searchLiveLink($(e.currentTarget), "#olCompanyDD", "Company", "name", ".ol-company-item", "ti-building");
		});
		me.$content.on("keydown.olNew", "#olFCompany", (e) => me.linkKeyNav(e, "#olCompanyDD"));
		me.$content.on("mousedown.olNew", ".ol-company-item", (e) => {
			e.preventDefault();
			const $item = $(e.currentTarget);
			me.$content.find("#olFCompany").val($item.data("label"));
			me.$content.find("#olCompanyDD").removeClass("open");
		});

		// ── Sales Person — live search (Sales Person doctype) ──
		me.$content.on("input.olNew focus.olNew", "#olFSalesperson", (e) => {
			me.searchLiveLink($(e.currentTarget), "#olSpDD", "Sales Person", "name", ".ol-sp-item", "ti-user-check");
		});
		me.$content.on("keydown.olNew", "#olFSalesperson", (e) => me.linkKeyNav(e, "#olSpDD"));
		me.$content.on("mousedown.olNew", ".ol-sp-item", (e) => {
			e.preventDefault();
			const $item = $(e.currentTarget);
			const name = $item.data("label");
			const doc = $item.data("docname");
			// Set name immediately
			me.$content.find("#olFSalesperson").val(name).attr("data-docname", doc);
			me.$content.find("#olSpDD").removeClass("open");
			// Show card with name while we fetch details
			me.fillSpCard(name, "", "");

			// Step 1: Get Sales Person doc to find linked Employee
			frappe.call({
				method: "frappe.client.get",
				args: { doctype: "Sales Person", name: doc },
				callback: (r) => {
					const sp = r.message || {};
					// Try direct fields first (some customised installs add these)
					const directEmail = sp.email_id || sp.email || "";
					const directMobile = sp.mobile_no || sp.mobile || "";

					if (directEmail || directMobile) {
						me.fillSpCard(name, directEmail, directMobile);
						return;
					}

					// Step 2: If no direct fields, fetch linked Employee
					const employeeId = sp.employee || "";
					if (!employeeId) {
						// Try searching Employee by name match
						frappe.call({
							method: "frappe.client.get_list",
							args: {
								doctype: "Employee",
								fields: ["name", "company_email", "personal_email", "cell_number", "prefered_contact_email"],
								filters: { employee_name: name, status: "Active" },
								limit_page_length: 1,
							},
							callback: (r2) => {
								const emp = (r2.message || [])[0] || {};
								const email = emp.company_email || emp.personal_email || emp.prefered_email || "";
								const mobile = emp.cell_number || "";
								me.fillSpCard(name, email, mobile);
							},
							error: () => me.fillSpCard(name, "", ""),
						});
						return;
					}

					// Step 2b: Fetch employee by ID
					frappe.call({
						method: "frappe.client.get",
						args: { doctype: "Employee", name: employeeId },
						callback: (r3) => {
							const emp = r3.message || {};
							const email = emp.company_email || emp.personal_email || emp.prefered_email || "";
							const mobile = emp.cell_number || emp.mobile_no || "";
							me.fillSpCard(name, email, mobile);
						},
						error: () => me.fillSpCard(name, "", ""),
					});
				},
				error: () => me.fillSpCard(name, "", ""),
			});
		});
		me.$content.on("click.olNew", "#olSpCardClear", () => {
			me.$content.find("#olFSalesperson").val("").removeAttr("data-docname");
			me.$content.find("#olSpCard").hide();
		});

		$(document).on("click.olNewLink", (e) => {
			if (!$(e.target).closest(".ol-link-wrap").length)
				me.$content.find(".ol-link-dd").removeClass("open");
		});

		// ── Add Item dropdown ────────────────────────────────
		me.$content.on("click.olNew", "#olAddItemBtn", (e) => {
			e.stopPropagation();
			const $m = me.$content.find("#olAddItemMenu");
			$m.css("display", $m.css("display") === "none" ? "block" : "none");
		});
		$(document).on("click.olNewItem", (e) => {
			if (!$(e.target).closest("#olAddItemWrap").length)
				me.$content.find("#olAddItemMenu").css("display", "none");
		});
		me.$content.on("click.olNew", "[data-item-popup]", (e) => {
			const type = $(e.currentTarget).data("itemPopup");
			me.$content.find("#olAddItemMenu").css("display", "none");
			me.openNewFormItemPopup(type);
		});

		// ── Item row delete ──────────────────────────────────


		me.$content.on("click.olNew", ".ol-item-del-btn", (e) => {
			e.stopPropagation();
			const idx = parseInt($(e.currentTarget).data("idx"));
			if (!Number.isFinite(idx) || !me.wizardItems[idx]) return;
			const itemName = me.wizardItems[idx].name || `Item ${idx + 1}`;
			me._showDeleteConfirm(itemName, () => {
				me.wizardItems.splice(idx, 1);
				me.renderItemsTable();
			});
		});

		// ── Item qty/sp/bp edits ────────────────────────────
		me.$content.on("input.olNew", ".ol-item-sp, .ol-item-bp, .ol-item-qty", (e) => {
			const idx = parseInt($(e.currentTarget).closest("tr").data("idx"));
			if (!Number.isFinite(idx) || !me.wizardItems[idx]) return;
			me.wizardItems[idx].qty = parseFloat(me.$content.find(`[data-idx="${idx}"] .ol-item-qty`).val()) || 1;
			me.wizardItems[idx].sp = parseFloat(me.$content.find(`[data-idx="${idx}"] .ol-item-sp`).val()) || 0;
			me.wizardItems[idx].bp = parseFloat(me.$content.find(`[data-idx="${idx}"] .ol-item-bp`).val()) || 0;
			me.calcTotals();
		});

		// ── Attachment upload ────────────────────────────────
		me.$content.on("change.olNew", "#olFileInput", (e) => me.handleFiles(e.target.files));

		// ── Save draft / submit ──────────────────────────────
		// me.$content.on("click.olNew", "#olSaveDraft", () => frappe.show_alert({ message: "Draft saved!", indicator: "blue" }));
		me.$content.on("click.olNew", "#olSubmitForm", () => me.submitWizard());

		if (!me.$content.find("#olFCompany").val().trim()) {
			me.$content.find("#olFCompany").val(me.defaultCompanyName);
		}
	}


	_showDeleteConfirm(itemName, onConfirm) {
		$("#olDelConfirmOverlay").remove();

		const $overlay = $(`
		<div id="olDelConfirmOverlay"
			style="position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:9100;
				display:flex;align-items:center;justify-content:center;padding:20px;
				animation:olFadeIn 0.15s ease;">
			<div
				style="background:#fff;border-radius:16px;width:100%;max-width:380px;
					box-shadow:0 24px 64px rgba(0,0,0,0.18);overflow:hidden;
					animation:olSlideUp 0.18s ease;">
 
				<div style="padding:24px 24px 0;text-align:center;">
					<div style="width:52px;height:52px;border-radius:50%;
						background:rgba(220,38,38,0.08);border:2px solid rgba(220,38,38,0.15);
						display:flex;align-items:center;justify-content:center;margin:0 auto 14px;">
						<i class="ti ti-trash" style="font-size:22px;color:#dc2626;"></i>
					</div>
					<div style="font-family:'Syne',sans-serif;font-size:16px;font-weight:700;
						color:#111827;margin-bottom:8px;">Remove Item?</div>
					<div style="font-size:13px;color:#6b7280;line-height:1.6;">
						Are you sure you want to remove<br>
						<strong style="color:#111827;">${this.escapeAttr(itemName)}</strong>
						from this opportunity?
					</div>
				</div>
 
				<div style="display:flex;gap:10px;padding:20px 24px 24px;">
					<button id="olDelCancel"
						style="flex:1;height:38px;border-radius:8px;
							border:1px solid rgba(0,0,0,0.12);background:#f7f8fa;
							color:#374151;font-family:'DM Sans',sans-serif;
							font-size:13px;font-weight:500;cursor:pointer;transition:background 0.15s;">
						Cancel
					</button>
					<button id="olDelConfirm"
						style="flex:1;height:38px;border-radius:8px;border:none;
							background:#dc2626;color:#fff;font-family:'DM Sans',sans-serif;
							font-size:13px;font-weight:600;cursor:pointer;
							display:inline-flex;align-items:center;justify-content:center;
							gap:6px;transition:background 0.15s;">
						<i class="ti ti-trash" style="font-size:14px;"></i> Remove
					</button>
				</div>
			</div>
		</div>`);

		$("body").append($overlay);

		const onKey = (e) => {
			if (e.key === "Escape") close();
			if (e.key === "Enter") confirm();
		};
		$(document).on("keydown.olDelConfirm", onKey);

		const close = () => {
			$(document).off("keydown.olDelConfirm");
			$overlay.css("animation", "olFadeOut 0.12s ease forwards");
			setTimeout(() => $overlay.remove(), 130);
		};
		const confirm = () => { close(); onConfirm(); };

		$overlay.on("click", "#olDelCancel", close);
		$overlay.on("click", "#olDelConfirm", confirm);
		$overlay.on("click", (e) => { if ($(e.target).is($overlay)) close(); });

		$overlay.on("mouseenter", "#olDelCancel", function () { $(this).css("background", "#eef2f7"); });
		$overlay.on("mouseleave", "#olDelCancel", function () { $(this).css("background", "#f7f8fa"); });
		$overlay.on("mouseenter", "#olDelConfirm", function () { $(this).css("background", "#b91c1c"); });
		$overlay.on("mouseleave", "#olDelConfirm", function () { $(this).css("background", "#dc2626"); });
	}




	// When customer is picked → fetch contacts + salesperson + company
	onCustomerSelected(customerDocname) {
		const me = this;
		me.selectedCustomerDoc = { name: customerDocname, contacts: [], renewals: [] };

		// 1) Fetch full Customer doc (has sales_team child + customer_primary_contact)
		frappe.call({
			method: "frappe.client.get",
			args: { doctype: "Customer", name: customerDocname },
			callback: (r) => {
				const doc = r.message || {};
				// capture salesperson from customer's sales team
				const custSalesTeam = Array.isArray(doc.sales_team) ? doc.sales_team : [];
				if (custSalesTeam.length) {
					me._oppSalesPerson = custSalesTeam[0].sales_person || "";
					me._oppSalesTeam = custSalesTeam.map(st => ({
						sales_person: st.sales_person,
						allocated_percentage: st.allocated_percentage || 100,
					}));
				} else {
					me._oppSalesPerson = "";
					me._oppSalesTeam = [];
				}
				// Auto-fill Company field from customer's company or group
				const companyVal = doc.company || me.defaultCompanyName || "";
				if (companyVal) me.$content.find("#olFCompany").val(companyVal);
				// Sales team — pick first sales person
				const salesTeam = Array.isArray(doc.sales_team) ? doc.sales_team : [];
				if (salesTeam.length) {
					const sp = salesTeam[0];
					const spId = sp.sales_person || "";
					const spNm = sp.sales_person_name || spId;
					me.$content.find("#olFSalesperson").val(spNm || spId).attr("data-docname", spId);
					// Try direct fields first
					const directEmail = sp.sales_person_email || sp.email || "";
					const directMobile = sp.sales_person_mobile || sp.mobile || "";
					if (directEmail || directMobile) {
						me.fillSpCard(spNm, directEmail, directMobile);
					} else if (spId) {
						// Fetch Sales Person → Employee chain
						frappe.call({
							method: "frappe.client.get",
							args: { doctype: "Sales Person", name: spId },
							callback: (rSP) => {
								const spDoc = rSP.message || {};
								const employeeId = spDoc.employee || "";
								if (!employeeId) { me.fillSpCard(spNm, "", ""); return; }
								frappe.call({
									method: "frappe.client.get",
									args: { doctype: "Employee", name: employeeId },
									callback: (rEmp) => {
										const emp = rEmp.message || {};
										const email = emp.company_email || emp.personal_email || "";
										const mobile = emp.cell_number || emp.mobile_no || "";
										me.fillSpCard(spNm, email, mobile);
									},
									error: () => me.fillSpCard(spNm, "", ""),
								});
							},
							error: () => me.fillSpCard(spNm, "", ""),
						});
					} else {
						me.fillSpCard(spNm, "", "");
					}
				} else {
					const spName = doc.default_sales_partner || doc.sales_person || "";
					if (spName) { me.$content.find("#olFSalesperson").val(spName).attr("data-docname", spName); me.fillSpCard(spName, "", ""); }
				}
			}
		});

		// 2) Fetch linked Contacts
		frappe.call({
			method: "frappe.client.get_list",
			args: {
				doctype: "Contact",
				fields: ["name", "first_name", "last_name", "email_id", "mobile_no", "designation"],
				filters: [["Dynamic Link", "link_doctype", "=", "Customer"],
				["Dynamic Link", "link_name", "=", customerDocname]],
				limit_page_length: 20
			},
			callback: (r) => {
				me.selectedCustomerDoc.contacts = (r.message || []).map(c => ({
					docname: c.name,
					name: [c.first_name, c.last_name].filter(Boolean).join(" ") || c.name,
					email: c.email_id || "",
					phone: c.mobile_no || "",
					role: c.designation || "",
					company: ""
				}));
				if (me.wizardStep === 2) me.renderContactPickers();
			}
		});

		// 3) Fetch Active renewals from "Renewal List" doctype
		frappe.call({
			method: "frappe.client.get_list",
			args: {
				doctype: "Renewal List",
				fields: ["name", "customer_name", "start_date", "end_date", "product_name",
					"description", "total_amount", "total_quantity"],
				filters: [["Renewal List", "customer_name", "=", customerDocname]],
				limit_page_length: 100,
				order_by: "end_date asc"
			},
			callback: (r) => {
				me.selectedCustomerDoc.renewals = (r.message || []).map((s, i) => ({
					id: 1000 + i,
					renewId: s.name,           // "Renewal List" document ID
					name: s.product_name || s.name, // product_name as the item name
					product_name: s.product_name || "",
					customer: s.customer_name || "",
					start_date: s.start_date || "",
					end_date: s.end_date || "",
					brand: "—", group: "Renewal",
					qty: Number(s.total_quantity) || 1,
					sp: Number(s.total_amount) || 0,
					bp: 0,
					description: s.description || "",
					expiry: s.end_date || "",
					status: "Active"
				}));
			},
			error: (err) => {
				// Retry without optional fields — may not exist in DocType yet
				console.warn('Renewal List: retrying with minimal fields', err);
				frappe.call({
					method: 'frappe.client.get_list',
					args: {
						doctype: 'Renewal List',
						fields: ['name', 'customer_name', 'start_date', 'end_date'],
						filters: [['Renewal List', 'customer_name', '=', customerDocname]],
						limit_page_length: 100, order_by: 'end_date asc'
					},
					callback: (r2) => {
						me.selectedCustomerDoc.renewals = (r2.message || []).map((s, i) => ({
							id: 1000 + i, renewId: s.name, name: s.name, product_name: s.name,
							customer: s.customer_name || '', start_date: s.start_date || '', end_date: s.end_date || '',
							brand: '—', group: 'Renewal', qty: 1, sp: 0, bp: 0, description: '',
							expiry: s.end_date || '', status: 'Active'
						}));
					},
					error: () => { me.selectedCustomerDoc.renewals = []; }
				});
			}
		});
	}

	goWizardStep(n) {
		const me = this;
		me.wizardStep = n;
		const total = 4;

		me.$content.find(".ol-wiz-panel").removeClass("active");
		me.$content.find(`#olPanel${n}`).addClass("active");

		me.$content.find(".ol-step").each(function () {
			const sn = parseInt($(this).data("step"));
			$(this).removeClass("active done");
			const $c = $(this).find(".ol-step-circle");
			if (sn === n) { $(this).addClass("active"); $c.html(sn); }
			else if (sn < n) { $(this).addClass("done"); $c.html('<i class="ti ti-check" style="font-size:13px;"></i>'); }
			else { $c.html(sn); }
		});

		me.$content.find("#olProgressFill").css("width", (n / total * 100) + "%");

		if (n === 2) me.renderContactPickers();
		if (n === 4) me.buildReview();

		$("#support-page-content").scrollTop(0);
	}

	validateWizardStep(n) {
		const me = this;
		if (n === 1) {
			if (!me.$content.find("#olFSubject").val().trim()) { frappe.msgprint("Please enter a Subject."); return false; }
			if (!me.$content.find("#olFCustomer").val().trim()) { frappe.msgprint("Please select a Customer."); return false; }
		}
		return true;
	}

	// Generic live link search — works for Customer, Company, Sales Person
	searchLiveLink($input, ddSel, doctype, labelField, itemClass, icon) {
		const me = this;
		const q = ($input.val() || "").trim();
		const $dd = me.$content.find(ddSel);
		const sizeDD = () => {
			if ($input && $input.length) {
				$dd.css({ width: $input.outerWidth() + "px", minWidth: "0", maxWidth: "none" });
			}
		};

		$dd.html(`<div style="padding:10px 12px;font-size:12px;color:#9ca3af;"><i class="ti ti-loader" style="margin-right:6px;"></i>Searching...</div>`).addClass("open");

		const timerKey = `_liveSearchTimer_${doctype}`;
		if (me[timerKey]) clearTimeout(me[timerKey]);

		me[timerKey] = setTimeout(() => {
			const filters = q ? [[doctype, labelField, "like", `%${q}%`]] : [];
			const fields = doctype === "Customer"
				? ["name", "customer_name", "customer_group", "territory", "industry"]
				: doctype === "Sales Person"
					? ["name", "sales_person_name", "employee"]
					: ["name"];

			frappe.call({
				method: "frappe.client.get_list",
				args: { doctype, fields, filters, limit_page_length: 12, order_by: `${labelField} asc` },
				callback: (r) => {
					const rows = r.message || [];
					if (!rows.length) {
						$dd.html(`<div style="padding:12px;text-align:center;font-size:12px;color:#9ca3af;"><i class="ti ti-search-off"></i> No ${doctype} found</div>`);
						return;
					}

					// For Customer: batch-fetch sales_team child rows, then render.
					// For others: render immediately.
					if (doctype === "Customer") {
						const custNames = rows.map(row => row.name);
						frappe.call({
							method: "frappe.client.get_list",
							args: {
								doctype: "Sales Team",
								parent: "Customer",
								fields: ["parent", "sales_person", "allocated_percentage"],
								filters: [
									["Sales Team", "parenttype", "=", "Customer"],
									["Sales Team", "parent", "in", custNames],
								],
								limit_page_length: 0,
								order_by: "idx asc",
							},
							callback: (rt) => {
								// Map each customer → first salesperson encountered
								const spMap = {};
								(rt.message || []).forEach(t => {
									if (!spMap[t.parent] && t.sales_person) {
										spMap[t.parent] = t.sales_person;
									}
								});
								me._renderCustomerDropdown($dd, rows, spMap, itemClass, $input);
							},
							error: () => me._renderCustomerDropdown($dd, rows, {}, itemClass),
						});
						return;
					}

					// ── Company / Sales Person: original two-line display ──
					$dd.html(rows.map(row => {
						const label = row.sales_person_name || row.name;
						const av = label.substring(0, 2).toUpperCase();
						const sub = row.name;
						return `
					<div class="${itemClass.replace(".", "")}" style="display:flex;align-items:center;gap:10px;padding:9px 12px;cursor:pointer;transition:0.12s;"
						data-label="${me.escapeAttr(label)}"
						data-docname="${me.escapeAttr(row.name)}"
						data-email="${me.escapeAttr(row.email_id || "")}"
						data-mobile="${me.escapeAttr(row.mobile_no || "")}">
						<div style="width:28px;height:28px;border-radius:50%;background:rgba(59,126,248,0.12);color:#3b7ef8;display:flex;align-items:center;justify-content:center;font-family:Syne,sans-serif;font-size:11px;font-weight:700;flex-shrink:0;">${av}</div>
						<div style="flex:1;min-width:0;">
							<div style="font-size:12px;font-weight:500;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${me.escapeAttr(label)}</div>
							${sub && sub !== label ? `<div style="font-size:10px;color:#9ca3af;">${me.escapeAttr(sub)}</div>` : ""}
						</div>
					</div>`;
					}).join("")).addClass("open");

					$dd.find(`${itemClass}`).on("mouseenter", function () {
						$(this).css("background", "rgba(59,126,248,0.06)");
					}).on("mouseleave", function () {
						$(this).css("background", "");
					});
				}
			});
		}, 250);
	}

	// Render the Customer dropdown rows with sales person from sales_team
	_renderCustomerDropdown($dd, rows, spMap, itemClass, $input) {
		const me = this;
		const w = ($input && $input.length) ? $input.outerWidth() : 260;
		$dd.css({ width: w + "px", minWidth: "0", maxWidth: "none" });
		$dd.html(rows.map(row => {
			const label = row.customer_name || row.name;
			const av = label.substring(0, 2).toUpperCase();
			const sp = spMap[row.name] || "";

			const meta = [];
			if (sp) meta.push(`<span style="display:inline-flex;align-items:center;gap:3px; color:#3b7ef8;"><i class="ti ti-user-check" style="font-size:10px;color:#16a34a;"></i>${me.escapeAttr(sp)}</span>`);
			if (row.territory) meta.push(`<span style="display:inline-flex;align-items:center;gap:3px;"><i class="ti ti-map-pin" style="font-size:10px;color:#9ca3af;"></i>${me.escapeAttr(row.territory)}</span>`);
			if (row.industry) meta.push(`<span style="display:inline-flex;align-items:center;gap:3px;"><i class="ti ti-building-factory-2" style="font-size:10px;color:#9ca3af;"></i>${me.escapeAttr(row.industry)}</span>`);
			if (row.customer_group) meta.push(`<span style="display:inline-flex;align-items:center;gap:3px;"><i class="ti ti-users" style="font-size:10px;color:#9ca3af;"></i>${me.escapeAttr(row.customer_group)}</span>`);

			return `
		<div class="${itemClass.replace(".", "")}" style="display:flex;align-items:flex-start;gap:10px;padding:9px 12px;cursor:pointer;transition:0.12s;"
			data-label="${me.escapeAttr(label)}"
			data-docname="${me.escapeAttr(row.name)}">
			<div style="width:28px;height:28px;border-radius:50%;background:rgba(59,126,248,0.12);color:#3b7ef8;display:flex;align-items:center;justify-content:center;font-family:Syne,sans-serif;font-size:11px;font-weight:700;flex-shrink:0;margin-top:1px;">${av}</div>
			<div style="flex:1;min-width:0;">
				<div style="font-size:12px;font-weight:600;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${me.escapeAttr(label)}</div>
				${meta.length ? `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:3px;font-size:10px;color:#6b7280;">${meta.join("")}</div>` : ""}
			</div>
		</div>`;
		}).join("")).addClass("open");

		$dd.find(`${itemClass}`).on("mouseenter", function () {
			$(this).css("background", "rgba(59,126,248,0.06)");
		}).on("mouseleave", function () {
			$(this).css("background", "");
		});
	}

	// Fill the salesperson card after picking
	fillSpCard(name, email, phone) {
		const me = this;
		const av = (name || "?").substring(0, 2).toUpperCase();
		me.$content.find("#olSpCardAv").text(av);
		me.$content.find("#olSpCardName").text(name || "");
		me.$content.find("#olFSpName").val(name || "");
		me.$content.find("#olFSpEmail").val(email || "");
		me.$content.find("#olFSpPhone").val(phone || "");
		if (email) {
			me.$content.find("#olSpCardEmail").css("display", "flex").find("span").text(email);
		} else {
			me.$content.find("#olSpCardEmail").hide();
		}
		if (phone) {
			me.$content.find("#olSpCardPhone").css("display", "flex").find("span").text(phone);
		} else {
			me.$content.find("#olSpCardPhone").hide();
		}
		me.$content.find("#olSpCard").css("display", "flex");
	}

	linkKeyNav(e, ddSel) {
		const $dd = this.$content.find(ddSel || ".ol-link-dd");
		if (!$dd.hasClass("open")) return;
		const $items = $dd.find(".ol-link-item");
		let idx = $items.index($items.filter(".hi"));
		if (e.key === "ArrowDown") { e.preventDefault(); idx = Math.min(idx + 1, $items.length - 1); }
		else if (e.key === "ArrowUp") { e.preventDefault(); idx = Math.max(idx - 1, 0); }
		else if (e.key === "Enter" && idx >= 0) { e.preventDefault(); $items.eq(idx).trigger("mousedown"); return; }
		else if (e.key === "Escape") { $dd.removeClass("open"); return; }
		$items.removeClass("hi").eq(idx).addClass("hi");
	}

	// Render contact step: show linked contacts as cards + Add Contact button
	renderContactPickers() {
		const me = this;
		const contacts = (me.selectedCustomerDoc && me.selectedCustomerDoc.contacts) || [];
		const custName = me.$content.find("#olFCustomer").val() || "—";
		me.$content.find("#olContactsHeading").text(`Contacts — ${custName}`);

		// wizardContacts holds selected contacts (start empty)
		// Initialize ONCE — never wipe contacts the user already added
		if (!Array.isArray(me.wizardContacts)) me.wizardContacts = [];
		if (!Number.isFinite(me.wizardPocIndex)) me.wizardPocIndex = 0;
		me.renderContactCards();

		// Bind add-contact button
		me.$content.off("click.olCon", "#olAddContactBtn")
			.on("click.olCon", "#olAddContactBtn", () => {
				me.openContactPickerPopup();
			});

		// POC selection — single select
		me.$content.off("change.olCon", ".ol-poc-check")
			.on("change.olCon", ".ol-poc-check", (e) => {
				const idx = parseInt($(e.currentTarget).data("pocIdx"));
				if (!Number.isFinite(idx)) return;
				me.wizardPocIndex = idx;
				me.renderContactCards();  // re-render so only one shows checked
			});
		// Remove contact card

		me.$content.off("click.olCon", ".ol-con-card-remove")
			.on("click.olCon", ".ol-con-card-remove", (e) => {
				const idx = parseInt($(e.currentTarget).data("conIdx"));
				me.wizardContacts.splice(idx, 1);
				// keep POC valid
				if (me.wizardPocIndex === idx) me.wizardPocIndex = 0;
				else if (me.wizardPocIndex > idx) me.wizardPocIndex--;
				me.renderContactCards();
			});

		// Show/hide no-contacts notice
		if (!contacts.length) {
			me.$content.find("#olNoContactsMsg").show();
		} else {
			me.$content.find("#olNoContactsMsg").hide();
		}
	}

	renderContactCards() {
		const me = this;
		const $wrap = me.$content.find("#olContactCardsWrap");
		// const $wrap = me.$content.find("#olContactsList");
		if (!$wrap.length) return;

		if (!me.wizardContacts.length) {
			$wrap.html(`
				<div style="border:2px dashed rgba(0,0,0,0.12);border-radius:12px;padding:32px;text-align:center;color:#9ca3af;">
					<i class="ti ti-user-plus" style="font-size:28px;display:block;margin-bottom:8px;color:#d1d5db;"></i>
					<div style="font-size:13px;font-weight:500;margin-bottom:4px;">No contacts added yet</div>
					<div style="font-size:12px;">Click <strong>Add Contact</strong> to pick from this customer's contacts</div>
				</div>`);
			return;
		}

		$wrap.html(me.wizardContacts.map((c, idx) => {
			const av = (c.name || "?").substring(0, 1).toUpperCase();
			const colors = ["#3b7ef8", "#16a34a", "#d97706", "#7c3aed", "#dc2626", "#0891b2"];
			const color = colors[idx % colors.length];
			return `
			<div class="ol-con-card" style="background:#fff;border:${me.wizardPocIndex === idx ? "2px solid #3b7ef8" : "1px solid rgba(0,0,0,0.09)"};border-radius:14px;padding:16px 18px;display:flex;align-items:center;gap:14px;box-shadow:0 1px 6px rgba(0,0,0,0.06);position:relative;">
			<!-- Avatar -->
				<div style="width:42px;height:42px;border-radius:50%;background:${color}1a;border:2px solid ${color}33;
						display:flex;align-items:center;justify-content:center;font-family:Syne,sans-serif;
						font-size:16px;font-weight:700;color:${color};flex-shrink:0;">${av}</div>
				<!-- Info -->
				<div style="flex:1;min-width:0;">
					<div style="font-family:Syne,sans-serif;font-size:14px;font-weight:600;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
						${me.escapeAttr(c.name || "—")}
						${c.company ? `<span style="font-size:12px;font-weight:400;color:#6b7280;"> — ${me.escapeAttr(c.company)}</span>` : ""}
					</div>
					${c.email ? `<div style="display:flex;align-items:center;gap:6px;margin-top:5px;font-size:12px;color:#3b7ef8;"><i class="ti ti-mail" style="font-size:13px;color:#9ca3af;"></i>${me.escapeAttr(c.email)}</div>` : ""}
					${c.phone ? `<div style="display:flex;align-items:center;gap:6px;margin-top:3px;font-size:12px;color:#374151;"><i class="ti ti-device-mobile" style="font-size:13px;color:#9ca3af;"></i>${me.escapeAttr(c.phone)}</div>` : ""}
					${c.role ? `<div style="display:inline-flex;align-items:center;margin-top:6px;padding:2px 8px;border-radius:20px;background:rgba(59,126,248,0.08);font-size:10px;font-weight:600;color:#3b7ef8;">${me.escapeAttr(c.role)}</div>` : ""}
				</div>


				<label class="ol-poc-toggle" style="display:inline-flex;align-items:center;gap:5px;margin-top:8px;cursor:pointer;">
	<input type="checkbox" class="ol-poc-check" data-poc-idx="${idx}" ${me.wizardPocIndex === idx ? "checked" : ""}
		style="accent-color:#3b7ef8;width:14px;height:14px;cursor:pointer;">
	<span style="font-size:11px;font-weight:600;color:${me.wizardPocIndex === idx ? "#3b7ef8" : "#9ca3af"};">
		${me.wizardPocIndex === idx ? "✓ Point of Contact" : "Set as Point of Contact"}
	</span>
</label>
				<!-- Remove -->
				<button class="ol-con-card-remove" data-con-idx="${idx}"
					style="position:absolute;top:10px;right:10px;width:24px;height:24px;border-radius:50%;
						border:1px solid rgba(0,0,0,0.08);background:transparent;color:#9ca3af;cursor:pointer;
						display:flex;align-items:center;justify-content:center;font-size:12px;"
					title="Remove">
					<i class="ti ti-x"></i>
				</button>
			</div>`;
		}).join(""));
	}

	// Contact picker popup
	openContactPickerPopup() {
		const me = this;
		const contacts = (me.selectedCustomerDoc && me.selectedCustomerDoc.contacts) || [];
		// hide contacts already added to the wizard
		const picked = Array.isArray(me.wizardContacts) ? me.wizardContacts : [];
		const isPicked = (c) => picked.some(p =>
			(c.docname && p.docname && c.docname === p.docname) ||
			((c.name || "") === (p.name || "") && (c.email || "") === (p.email || ""))
		);
		const availableContacts = contacts.filter(c => !isPicked(c));
		$("#olConPickerOverlay").remove();

		const $overlay = $(`
		<div id="olConPickerOverlay" style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9000;display:flex;align-items:center;justify-content:center;padding:20px;">
			<div style="background:#fff;border-radius:16px;width:100%;max-width:520px;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 24px 64px rgba(0,0,0,0.18);">
				<!-- Header -->
				<div style="padding:18px 22px 14px;border-bottom:1px solid rgba(0,0,0,0.08);display:flex;align-items:center;justify-content:space-between;">
					<div>
						<div style="font-family:Syne,sans-serif;font-size:15px;font-weight:700;color:#111827;display:flex;align-items:center;gap:8px;"><i class="ti ti-user-plus" style="color:#3b7ef8;"></i> Add Contact</div>
						<div style="font-size:11px;color:#9ca3af;margin-top:3px;">Select a contact or add manually</div>
					</div>
					<button id="olConPickerClose" style="width:30px;height:30px;border-radius:50%;border:1px solid rgba(0,0,0,0.1);background:transparent;color:#9ca3af;cursor:pointer;font-size:15px;display:flex;align-items:center;justify-content:center;"><i class="ti ti-x"></i></button>
				</div>
				<!-- Tabs -->
				<div style="display:flex;gap:4px;padding:10px 22px;border-bottom:1px solid rgba(0,0,0,0.08);background:#f8fafc;">
					<button class="ol-con-tab active" data-tab="existing" style="padding:6px 14px;border-radius:6px;border:1px solid transparent;background:#fff;font-family:DM Sans,sans-serif;font-size:12px;font-weight:600;cursor:pointer;color:#3b7ef8;border-color:rgba(59,126,248,0.3);">Existing Contacts</button>
					<button class="ol-con-tab" data-tab="manual" style="padding:6px 14px;border-radius:6px;border:1px solid transparent;background:transparent;font-family:DM Sans,sans-serif;font-size:12px;font-weight:500;cursor:pointer;color:#6b7280;">Add Manually</button>
				</div>
				<!-- Body -->
				<div style="flex:1;overflow-y:auto;padding:16px 22px;" id="olConPickerBody">
					${availableContacts.length
				? availableContacts.map((c, ci) => `
							<div class="ol-con-pick-item" data-ci="${ci}" style="display:flex;align-items:center;gap:12px;padding:12px 14px;border:1.5px solid rgba(0,0,0,0.08);border-radius:10px;cursor:pointer;transition:0.15s;margin-bottom:8px;">
								<div style="width:36px;height:36px;border-radius:50%;background:rgba(59,126,248,0.12);display:flex;align-items:center;justify-content:center;font-family:Syne,sans-serif;font-size:13px;font-weight:700;color:#3b7ef8;flex-shrink:0;">${(c.name || "?")[0].toUpperCase()}</div>
								<div style="flex:1;min-width:0;">
									<div style="font-size:13px;font-weight:600;color:#111827;">${me.escapeAttr(c.name)}</div>
									${c.role ? `<div style="font-size:11px;color:#6b7280;">${me.escapeAttr(c.role)}</div>` : ""}
									${c.email ? `<div style="font-size:11px;color:#3b7ef8;margin-top:2px;">${me.escapeAttr(c.email)}</div>` : ""}
									${c.phone ? `<div style="font-size:11px;color:#374151;">${me.escapeAttr(c.phone)}</div>` : ""}
								</div>
								<i class="ti ti-plus" style="font-size:16px;color:#3b7ef8;flex-shrink:0;"></i>
							</div>`).join("")
				: (contacts.length
					? '<div style="text-align:center;padding:24px;color:#9ca3af;font-size:12px;"><i class="ti ti-checks" style="font-size:24px;display:block;margin-bottom:8px;color:#16a34a;"></i>All contacts already added.<br>Use <strong>Add Manually</strong> for more.</div>'
					: '<div style="text-align:center;padding:24px;color:#9ca3af;font-size:12px;"><i class="ti ti-search-off" style="font-size:24px;display:block;margin-bottom:8px;"></i>No linked contacts found for this customer.<br>Use <strong>Add Manually</strong> tab.</div>')
			}
				</div>
				<!-- Manual form (hidden) -->
				<div id="olConManualForm" style="display:none;padding:16px 22px;flex:1;overflow-y:auto;">
					<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
						<div class="ol-field"><label class="ol-field-label">Full Name <span class="ol-req">*</span></label><input class="ol-field-input" id="olManName" placeholder="Contact full name"></div>
						<div class="ol-field"><label class="ol-field-label">Designation</label><input class="ol-field-input" id="olManRole" placeholder="e.g. IT Manager"></div>
						<div class="ol-field"><label class="ol-field-label">Mobile</label><input class="ol-field-input" id="olManPhone" type="tel" placeholder="+91 XXXXX XXXXX"></div>
						<div class="ol-field"><label class="ol-field-label">Email</label><input class="ol-field-input" id="olManEmail" type="email" placeholder="email@company.com"></div>
						<div class="ol-field" style="grid-column:1/-1;"><label class="ol-field-label">Company</label><input class="ol-field-input" id="olManCompany" placeholder="Company name"></div>
					</div>
				</div>
				<!-- Footer -->
				<div style="padding:12px 22px;border-top:1px solid rgba(0,0,0,0.08);display:flex;justify-content:flex-end;gap:8px;background:#f8fafc;">
					<button id="olConPickerCancel" style="padding:8px 16px;border-radius:6px;border:1px solid rgba(0,0,0,0.1);background:#fff;font-family:DM Sans,sans-serif;font-size:13px;cursor:pointer;color:#374151;">Cancel</button>
					<button id="olConManualAdd" style="display:none;padding:8px 20px;border-radius:6px;border:none;background:#3b7ef8;color:#fff;font-family:DM Sans,sans-serif;font-size:13px;font-weight:600;cursor:pointer;"><i class="ti ti-check" style="margin-right:4px;"></i>Add Contact</button>
				</div>
			</div>
		</div>`);

		$("body").append($overlay);

		// Tab switching
		$overlay.on("click", ".ol-con-tab", function () {
			$overlay.find(".ol-con-tab").css({ background: "transparent", color: "#6b7280", "border-color": "transparent", "font-weight": "500" });
			$(this).css({ background: "#fff", color: "#3b7ef8", "border-color": "rgba(59,126,248,0.3)", "font-weight": "600" });
			const tab = $(this).data("tab");
			if (tab === "existing") {
				$overlay.find("#olConPickerBody").show();
				$overlay.find("#olConManualForm").hide();
				$overlay.find("#olConManualAdd").hide();
			} else {
				$overlay.find("#olConPickerBody").hide();
				$overlay.find("#olConManualForm").show();
				$overlay.find("#olConManualAdd").show();
			}
		});


		// Pick existing contact
		$overlay.on("click", ".ol-con-pick-item", function () {
			const ci = parseInt($(this).data("ci"));
			if (!availableContacts[ci]) return;
			me.wizardContacts.push({ ...availableContacts[ci] });
			me.renderContactCards();
			$overlay.remove();
		});

		// Add manual contact
		$overlay.on("click", "#olConManualAdd", () => {
			const name = $overlay.find("#olManName").val().trim();
			if (!name) { frappe.msgprint("Please enter a name."); return; }
			me.wizardContacts.push({
				name,
				role: $overlay.find("#olManRole").val().trim(),
				phone: $overlay.find("#olManPhone").val().trim(),
				email: $overlay.find("#olManEmail").val().trim(),
				company: $overlay.find("#olManCompany").val().trim(),
			});
			me.renderContactCards();
			$overlay.remove();
		});

		// Close
		$overlay.on("click", "#olConPickerClose, #olConPickerCancel", () => $overlay.remove());
		$overlay.on("click", (e) => { if ($(e.target).is($overlay)) $overlay.remove(); });

		// Hover effect on pick items
		$overlay.on("mouseenter", ".ol-con-pick-item", function () {
			$(this).css({ "border-color": "#3b7ef8", background: "rgba(59,126,248,0.04)" });
		}).on("mouseleave", ".ol-con-pick-item", function () {
			$(this).css({ "border-color": "rgba(0,0,0,0.08)", background: "" });
		});
	}

	// Item popup — fetches from ERPNext items
	openNewFormItemPopup(type, replaceIdx = null) {
		const me = this;
		$("#olNFItemOverlay").remove();

		const isRenewal = type !== "new";
		const title = type === "new" ? "Add Item" : type === "renewal" ? "Renewal Items" : "Additional Items";
		const icon = type === "new" ? "ti-box" : type === "renewal" ? "ti-refresh" : "ti-stack-2";
		const iconColor = type === "new" ? "#3b7ef8" : type === "renewal" ? "#16a34a" : "#d97706";

		// Use live ERPNext items if fetched, else fallback
		const CATALOGUE = me.wizardERP_Items.length ? me.wizardERP_Items : [
			{ id: 1, name: "Item 1", code: "ITEM-001", group: "General", brand: "—", sp: 0, bp: 0 }
		];
		// Use live customer renewals if available, fallback to empty
		const RENEWAL_DATA = (me.selectedCustomerDoc && me.selectedCustomerDoc.renewals && me.selectedCustomerDoc.renewals.length)
			? me.selectedCustomerDoc.renewals
			: [];

		const selected = new Set();
		const data = isRenewal ? RENEWAL_DATA : CATALOGUE;

		const groups = [...new Set(CATALOGUE.map(i => i.group).filter(Boolean))].sort();
		const brands = [...new Set(CATALOGUE.map(i => i.brand).filter(g => g && g !== "—"))].sort();

		// Get unique groups and brands for filters
		const toNum = v => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };
		const periodMatch = (i, n) => { const y = toNum(i.years), m = toNum(i.months); return n <= 5 ? (y === n || m === n) : (m === n); };
		const tenures = [...new Set(CATALOGUE.map(i => i.tenure).filter(Boolean))].sort();
		const periodNums = [...new Set(CATALOGUE.flatMap(i => [toNum(i.years), toNum(i.months)]).filter(n => n !== null && n > 0))].sort((a, b) => a - b);
		const selTenures = new Set();
		const selPeriods = new Set();  // holds numbers as strings

		const renderGrid = (filtered) => {
			if (!isRenewal) {
				return filtered.length
					? filtered.map(item => `
						<div class="ol-item-card ${selected.has(item.id) ? "selected" : ""}" data-iid="${item.id}"
							style="cursor:pointer;display:flex;align-items:center;gap:16px;width:100%;
								padding:12px 18px;border:1.5px solid ${selected.has(item.id) ? "#3b7ef8" : "rgba(0,0,0,0.08)"};
								border-radius:10px;background:${selected.has(item.id) ? "rgba(59,126,248,0.04)" : "#fff"};
								transition:all .12s;box-sizing:border-box;">

							<!-- checkbox FIRST -->
							<div class="ol-item-card-check" style="width:20px;height:20px;border-radius:5px;flex-shrink:0;position:static;opacity:1;
								border:1.5px solid ${selected.has(item.id) ? "#3b7ef8" : "rgba(0,0,0,0.2)"};
								background:${selected.has(item.id) ? "#3b7ef8" : "transparent"};
								display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;">
								${selected.has(item.id) ? '<i class="ti ti-check"></i>' : ""}
							</div>

							<!-- item avatar -->
							<!-- item avatar -->
							<div style="width:38px;height:38px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:#3b7ef8;border:2px solid ${selected.has(item.id) ? "#2563eb" : "rgba(59,126,248,0.25)"};transition:all .12s;">
								<span style="font-family:Syne,sans-serif;font-size:13px;font-weight:700;color:#fff;">${me.escapeAttr((item.name || "?").substring(0, 2).toUpperCase())}</span>
							</div>

							<!-- name full width + meta line -->
							<div style="flex:1;min-width:0;">
								<div style="font-size:13px;font-weight:600;color:#111827;white-space:normal;word-break:break-word;line-height:1.35;">${me.escapeAttr(item.name)}</div>
								<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:5px;font-size:11px;">
									${item.code ? `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:20px;background:rgba(107,114,128,0.1);color:#6b7280;font-weight:600;"><i class="ti ti-barcode" style="font-size:11px;"></i>${me.escapeAttr(item.code)}</span>` : ""}
									${item.brand && item.brand !== "—" ? `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:20px;background:rgba(124,58,237,0.1);color:#7c3aed;font-weight:600;"><i class="ti ti-tag" style="font-size:11px;"></i>${me.escapeAttr(item.brand)}</span>` : ""}
									${item.group ? `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:20px;background:rgba(59,126,248,0.1);color:#3b7ef8;font-weight:600;"><i class="ti ti-category" style="font-size:11px;"></i>${me.escapeAttr(item.group)}</span>` : ""}
									${item.tenure ? `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:20px;background:rgba(22,163,74,0.1);color:#16a34a;font-weight:600;"><i class="ti ti-clock" style="font-size:11px;"></i>${me.escapeAttr(item.tenure)}</span>` : ""}
									${item.tenure_period ? `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:20px;background:rgba(217,119,6,0.1);color:#d97706;font-weight:600;"><i class="ti ti-calendar" style="font-size:11px;"></i>${me.escapeAttr(item.tenure_period)}</span>` : ""}
								</div>
							</div>


						</div>`).join("")
					: '<div style="text-align:center;padding:32px;color:#9ca3af;font-size:12px;"><i class="ti ti-search-off" style="font-size:28px;display:block;margin-bottom:8px;"></i>No items found</div>';
			} else {
				// Renewal List table — 3 cols: Renewal ID, product_name Name, End Date
				if (!filtered.length) {
					return '<div style="text-align:center;padding:32px;color:#9ca3af;font-size:12px;"><i class="ti ti-search-off" style="font-size:28px;display:block;margin-bottom:8px;"></i>No active renewals found for this customer.</div>';
				}
				return `<table style="width:100%;border-collapse:collapse;font-size:13px;">
					<thead><tr style="background:#f1f5f9;position:sticky;top:0;z-index:1;">
						<th style="padding:10px 12px;width:40px;border-bottom:1px solid rgba(0,0,0,0.08);"></th>
						<th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#9ca3af;border-bottom:1px solid rgba(0,0,0,0.08);">Renewal ID</th>
						<th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#9ca3af;border-bottom:1px solid rgba(0,0,0,0.08);">Product Name</th>
						<th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#9ca3af;border-bottom:1px solid rgba(0,0,0,0.08);">End Date</th>
					</tr></thead>
					<tbody>${filtered.map(item => `
						<tr data-rid="${item.id}" class="${selected.has(item.id) ? "ol-r-selected" : ""}"
							style="cursor:pointer;border-bottom:1px solid rgba(0,0,0,0.06);transition:background 0.12s;">
							<td style="padding:12px;">
								<input type="checkbox" ${selected.has(item.id) ? "checked" : ""}
									style="accent-color:#3b7ef8;width:15px;height:15px;cursor:pointer;">
							</td>
							<td style="padding:12px;">
								<span style="font-size:12px;font-weight:700;color:#3b7ef8;font-family:Syne,sans-serif;letter-spacing:-.01em;">${me.escapeAttr(item.renewId || item.name)}</span>
							</td>
							<td style="padding:12px;">
								<span style="font-size:13px;font-weight:600;color:#111827;">${me.escapeAttr(item.product_name || item.name)}</span>
							</td>
							<td style="padding:12px;">
								<span style="display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;color:#d97706;background:rgba(217,119,6,0.1);padding:4px 10px;border-radius:20px;">
									<i class="ti ti-calendar-due" style="font-size:11px;"></i>
									${item.end_date || "—"}
								</span>
							</td>
						</tr>`).join("")}
					</tbody>
				</table>`;
			}
		};

		// Build group options
		const groupOpts = groups.map(g => `<option value="${me.escapeAttr(g)}">${me.escapeAttr(g)}</option>`).join("");
		const brandOpts = brands.map(b => `<option value="${me.escapeAttr(b)}">${me.escapeAttr(b)}</option>`).join("");

		const buildChecks = (arr, key) => arr.length
			? arr.map(v => `
				<label class="ol-nf-multi-opt" style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:6px;cursor:pointer;font-size:12px;color:#374151;">
					<input type="checkbox" class="ol-nf-mf-check" data-mf-check="${key}" value="${me.escapeAttr(v)}" style="accent-color:#3b7ef8;width:14px;height:14px;cursor:pointer;">
					<span>${me.escapeAttr(v)}</span>
				</label>`).join("")
			: `<div style="padding:8px 10px;font-size:11px;color:#9ca3af;">No values</div>`;
		const tenureChecks = buildChecks(tenures, "tenure");
		const periodChecks = periodNums.length
			? periodNums.map(n => {
				const label = n <= 5 ? `${n} (Yr/Mo)` : `${n} Mo`;
				return `
					<label class="ol-di-multi-opt" style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:6px;cursor:pointer;font-size:12px;color:#374151;">
						<input type="checkbox" class="ol-di-mf-check" data-mf-check="period" value="${n}" style="accent-color:#3b7ef8;width:14px;height:14px;cursor:pointer;">
						<span>${label}</span>
					</label>`;
			}).join("")
			: `<div style="padding:8px 10px;font-size:11px;color:#9ca3af;">No values</div>`;

		const $overlay = $(`
		<div id="olNFItemOverlay" style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9000;display:flex;align-items:center;justify-content:center;padding:20px;">
			<div style="background:#fff;border-radius:16px;width:100%;max-width:800px;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 24px 64px rgba(0,0,0,0.18);">
				<!-- Header -->
				<div style="padding:18px 22px 14px;border-bottom:1px solid rgba(0,0,0,0.08);display:flex;align-items:flex-start;justify-content:space-between;">
					<div>
						<div style="font-family:Syne,sans-serif;font-size:16px;font-weight:700;color:#111827;display:flex;align-items:center;gap:8px;"><i class="ti ${icon}" style="color:${iconColor};"></i>${title}</div>
						<div style="font-size:11px;color:#9ca3af;margin-top:3px;">${isRenewal ? "Select from customer renewals" : "Search and select from item catalogue"}</div>
					</div>
					<button id="olNFPopupClose" style="width:30px;height:30px;border-radius:50%;border:1px solid rgba(0,0,0,0.1);background:transparent;color:#9ca3af;cursor:pointer;font-size:15px;display:flex;align-items:center;justify-content:center;"><i class="ti ti-x"></i></button>
				</div>
				<!-- Filters -->
				<div style="display:flex;gap:8px;padding:10px 22px;border-bottom:1px solid rgba(0,0,0,0.08);background:#f8fafc;flex-wrap:wrap;">
					<div style="display:flex;align-items:center;gap:8px;flex:1;min-width:180px;background:#fff;border:1px solid rgba(0,0,0,0.1);border-radius:6px;padding:0 10px;height:32px;">
						<i class="ti ti-search" style="font-size:14px;color:#9ca3af;flex-shrink:0;"></i>
						<input id="olNFSearch" placeholder="Search item name or code..." style="flex:1;border:none;background:transparent;outline:none;font-family:'DM Sans',sans-serif;font-size:12px;color:#111827;">
					</div>
					<select id="olNFGroup" style="height:32px;padding:0 10px;border:1px solid rgba(0,0,0,0.1);border-radius:6px;background:#fff;font-size:12px;min-width:120px;outline:none;">
						<option value="">All Groups</option>${groupOpts}
					</select>
					<select id="olNFBrand" style="height:32px;padding:0 10px;border:1px solid rgba(0,0,0,0.1);border-radius:6px;background:#fff;font-size:12px;min-width:120px;outline:none;">
						<option value="">All Brands</option>${brandOpts}
					</select>
					<div class="ol-nf-multi" data-mf="tenure" style="position:relative;">
						<button type="button" class="ol-nf-multi-trigger" data-mf-trigger="tenure" style="height:32px;padding:0 10px;border:1px solid rgba(0,0,0,0.1);border-radius:6px;background:#fff;font-size:12px;min-width:120px;outline:none;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:6px;color:#111827;">
							<span data-mf-label="tenure">All Tenure</span><i class="ti ti-chevron-down" style="font-size:13px;color:#9ca3af;"></i>
						</button>
						<div class="ol-nf-multi-menu" data-mf-menu="tenure" style="display:none;position:absolute;top:calc(100% + 4px);left:0;min-width:160px;max-height:220px;overflow-y:auto;background:#fff;border:1px solid rgba(0,0,0,0.1);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.12);z-index:300;padding:4px;">${tenureChecks}</div>
					</div>
					<div class="ol-nf-multi" data-mf="period" style="position:relative;">
						<button type="button" class="ol-nf-multi-trigger" data-mf-trigger="period" style="height:32px;padding:0 10px;border:1px solid rgba(0,0,0,0.1);border-radius:6px;background:#fff;font-size:12px;min-width:130px;outline:none;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:6px;color:#111827;">
							<span data-mf-label="period">All Year/Months</span><i class="ti ti-chevron-down" style="font-size:13px;color:#9ca3af;"></i>
						</button>
						<div class="ol-nf-multi-menu" data-mf-menu="period" style="display:none;position:absolute;top:calc(100% + 4px);left:0;min-width:160px;max-height:220px;overflow-y:auto;background:#fff;border:1px solid rgba(0,0,0,0.1);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.12);z-index:300;padding:4px;">${periodChecks}</div>
					</div>
				</div>
				<!-- Body -->
				<div id="olNFItemBody" style="flex:1;overflow-y:auto;padding:16px 22px;"></div>
				<!-- Footer -->
				<div style="padding:14px 22px;border-top:1px solid rgba(0,0,0,0.08);display:flex;align-items:center;justify-content:space-between;background:#f8fafc;">
					<span id="olNFSelCount" style="font-size:12px;font-weight:500;color:#6b7280;">0 items selected</span>
					<div style="display:flex;gap:8px;">
						<button id="olNFCancel" style="padding:8px 16px;border-radius:6px;border:1px solid rgba(0,0,0,0.1);background:#fff;font-family:'DM Sans',sans-serif;font-size:13px;cursor:pointer;">Cancel</button>
						<button id="olNFConfirm" style="padding:8px 20px;border-radius:6px;border:none;background:#3b7ef8;color:#fff;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;cursor:pointer;"><i class="ti ti-check" style="margin-right:4px;"></i> Add Selected</button>
					</div>
				</div>
			</div>
		</div>`);

		$("body").append($overlay);

		const $body = $overlay.find("#olNFItemBody");
		const updateSel = () => $overlay.find("#olNFSelCount").text(selected.size + " item(s) selected");

		const renderBody = () => {
			const q = ($overlay.find("#olNFSearch").val() || "").toLowerCase();
			const group = $overlay.find("#olNFGroup").val();
			const brand = $overlay.find("#olNFBrand").val();
			const filtered = data.filter(i =>
				(!q || i.name.toLowerCase().includes(q) || (i.code || "").toLowerCase().includes(q) || i.brand.toLowerCase().includes(q)) &&
				(!group || i.group === group) &&
				(!brand || i.brand === brand) &&
				(!selTenures.size || selTenures.has(i.tenure)) &&
				(!selPeriods.size || [...selPeriods].some(n => periodMatch(i, parseInt(n, 10))))
			);
			if (!isRenewal) {
				$body.css({ display: "flex", "flex-direction": "column", gap: "8px", "grid-template-columns": "" });
			} else {
				$body.css({ display: "block" });
			}
			$body.html(renderGrid(filtered));

			// Card click (new items)
			$body.find(".ol-item-card").off("click").on("click", function () {
				const id = parseInt($(this).data("iid"));
				selected.has(id) ? selected.delete(id) : selected.add(id);
				updateSel();
				renderBody();
			});
			// Row click (renewal)
			$body.find("[data-rid]").off("click").on("click", function (e) {
				if ($(e.target).is("input")) return;
				const id = parseInt($(this).data("rid"));
				selected.has(id) ? selected.delete(id) : selected.add(id);
				$(this).toggleClass("ol-r-selected", selected.has(id));
				$(this).find("input[type=checkbox]").prop("checked", selected.has(id));
				updateSel();
			});
			$body.find("input[type=checkbox]").off("change").on("change", function () {
				const id = parseInt($(this).closest("[data-rid]").data("rid"));
				$(this).prop("checked") ? selected.add(id) : selected.delete(id);
				$(this).closest("[data-rid]").toggleClass("ol-r-selected", selected.has(id));
				updateSel();
			});
		};

		renderBody();
		$overlay.on("input change", "#olNFSearch, #olNFGroup, #olNFBrand", renderBody);


		// multiselect: toggle menu open/close
		$overlay.on("click", "[data-mf-trigger]", function (e) {
			e.stopPropagation();
			const key = $(this).data("mfTrigger");
			const $menu = $overlay.find(`[data-mf-menu='${key}']`);
			const isOpen = $menu.is(":visible");
			$overlay.find(".ol-nf-multi-menu").hide();
			if (!isOpen) $menu.show();
		});
		// multiselect: checkbox change updates the set + label, re-renders
		$overlay.on("change", ".ol-nf-mf-check", function () {
			const key = $(this).data("mfCheck");
			const val = String($(this).val());
			const set = key === "tenure" ? selTenures : selPeriods;
			this.checked ? set.add(val) : set.delete(val);
			const base = key === "tenure" ? "Tenure" : "Year/Months";
			$overlay.find(`[data-mf-label='${key}']`).text(set.size ? `${base} (${set.size})` : `All ${base}`);
			renderBody();
		});
		// close menus when clicking outside them (but keep popup open)
		$overlay.on("click", function (e) {
			if (!$(e.target).closest(".ol-nf-multi").length) $overlay.find(".ol-nf-multi-menu").hide();
		});

		const closeIt = () => $overlay.remove();
		$overlay.on("click", "#olNFPopupClose, #olNFCancel", closeIt);
		$overlay.on("click", (e) => { if ($(e.target).is($overlay)) closeIt(); });

		$overlay.on("click", "#olNFConfirm", async () => {
			const isReplace = Number.isFinite(replaceIdx);
			const selectedRows = data.filter((i) => selected.has(i.id));
			if (isReplace && selectedRows.length === 0) { closeIt(); return; }
			// In replace mode, only the first selected item is used
			const rowsToUse = isReplace ? selectedRows.slice(0, 1) : selectedRows;

			const built = [];
			for (const item of rowsToUse) {
				let resolvedItem = null;
				if (type !== "new") {
					const lookupKey = item.code || item.item_code || item.product_name || item.name || "";
					resolvedItem = await me.fetchERPItemByKey(lookupKey);
				}
				const resolvedCode = (resolvedItem && (resolvedItem.item_code || resolvedItem.name)) || item.code || item.item_code || "";
				const resolvedName = item.product_name || (resolvedItem && (resolvedItem.item_name || resolvedItem.name)) || item.name || "";
				const resolvedBrand = (resolvedItem && resolvedItem.brand) || item.brand || "—";
				const resolvedDesc = (resolvedItem && resolvedItem.description) || item.description || "";
				const resolvedUom = (resolvedItem && resolvedItem.stock_uom) || item.uom || "Nos";
				const resolvedSP = Number((resolvedItem && resolvedItem.standard_rate) || item.sp || 0) || 0;

				built.push({
					name: resolvedName, code: resolvedCode, brand: resolvedBrand,
					group: (resolvedItem && resolvedItem.item_group) || item.group || "General",
					description: resolvedDesc, type: type,
					qty: Number(item.qty || 1) || 1, uom: resolvedUom,
					sp: resolvedSP, bp: Number(item.bp || 0) || 0,
					discount: 0, rate_value: 0, is_orc: false, forecast: "",
					sales_stage: "",
					expected_date: item.expected_date || item.end_date || "",
					renewId: item.renewId || "", start_date: item.start_date || "", end_date: item.end_date || "",
					commission_type: "", expanded: false,
				});
			}

			if (isReplace) {
				// reset = overwrite the slot entirely with the new item's defaults
				if (built.length) me.wizardItems[replaceIdx] = built[0];
			} else {
				built.forEach(b => me.wizardItems.push(b));
			}
			me.renderItemsTable();
			closeIt();
		});
	}

	fetchERPItemByKey(key) {
		const me = this;
		const q = String(key || "").trim();
		if (!q) return Promise.resolve(null);

		const localHit = (me.wizardERP_Items || []).find((it) => {
			const code = String(it.code || "").toLowerCase();
			const name = String(it.name || "").toLowerCase();
			const ql = q.toLowerCase();
			return code === ql || name === ql;
		});
		if (localHit) {
			return Promise.resolve({
				name: localHit.code || localHit.name,
				item_name: localHit.name,
				item_code: localHit.code,
				brand: localHit.brand,
				description: localHit.description,
				stock_uom: localHit.uom,
				standard_rate: localHit.sp,
				item_group: localHit.group,
			});
		}

		const getFirst = (args) => new Promise((resolve) => {
			frappe.call({
				method: "frappe.client.get_list",
				args,
				callback: (r) => resolve(((r && r.message) || [])[0] || null),
				error: () => resolve(null),
			});
		});

		return getFirst({
			doctype: "Item",
			fields: ["name", "item_name", "item_code", "brand", "description", "stock_uom", "standard_rate", "item_group", "tenure", "years", "months"],
			filters: { item_code: q },
			limit_page_length: 1,
		}).then((byCode) => {
			if (byCode) return byCode;
			return getFirst({
				doctype: "Item",
				fields: ["name", "item_name", "item_code", "brand", "description", "stock_uom", "standard_rate", "item_group", "tenure", "years", "months"],
				filters: { item_name: q },
				limit_page_length: 1,
			});
		}).then((hit) => {
			if (hit) return hit;
			return new Promise((resolve) => {
				frappe.call({
					method: "frappe.client.get",
					args: { doctype: "Item", name: q },
					callback: (r) => resolve((r && r.message) || null),
					error: () => resolve(null),
				});
			});
		});
	}

	renderItemsTable() {
		const me = this;
		const $wrap = me.$content.find("#olItemsTbody");
		const typeColor = { new: "#3b7ef8", renewal: "#16a34a", additional: "#d97706" };

		if (!me.wizardItems.length) {
			$wrap.html(`<div class="ol-items-empty" style="text-align:center;padding:36px;color:#9ca3af;font-size:12px;">
			<i class="ti ti-inbox" style="font-size:28px;display:block;margin-bottom:8px;"></i>
			No items added yet. Click <strong>+ Add Item</strong> to get started.
		</div>`);
			me.calcTotals();
			return;
		}

		const typeCls = { new: "ol-type-new", renewal: "ol-type-renewal", additional: "ol-type-additional" };
		const typeLabel = { new: "New", renewal: "Renewal", additional: "Additional" };
		const fmtINR = n => Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
		const stageList = ["Initial Analysis", "POC/Demos/Webinar/Session", "Proposal", "Negotiation", "Order Expected", "Closed Won", "Closed Lost", "Dead"];

		let cards = "";

		me.wizardItems.forEach((item, idx) => {
			const disc = Number(item.discount || 0);
			const effSP = Number(item.sp || 0) * (1 - disc / 100);
			const sa = (Number(item.qty || 0) * effSP).toFixed(2);
			const ba = (Number(item.qty || 0) * Number(item.bp || 0)).toFixed(2);
			const hasDesc = item.description && String(item.description).replace(/<[^>]*>/g, "").trim().length > 0;
			const orcOn = !!item.is_orc;
			const rawSP = Number(item.sp || 0);
			const marginPct = rawSP > 0 ? (((rawSP - Number(item.bp || 0)) / rawSP) * 100) : 0;
			const marginColor = marginPct > 20 ? "#16a34a" : marginPct > 5 ? "#d97706" : "#dc2626";
			const marginAmt = (rawSP - Number(item.bp || 0)) * Number(item.qty || 0);

			const stageOpts = `<option value="" ${!item.sales_stage ? "selected" : ""}>Select stage…</option>` +
				stageList.map(v =>
					`<option value="${v}" ${item.sales_stage === v ? "selected" : ""}>${v}</option>`).join("");
			const forecastOpts = ["", "Include", "Exclude"].map(v =>
				`<option value="${v}" ${(item.forecast || "") === v ? "selected" : ""}>${v || "—"}</option>`).join("");

			cards += `
<div class="ol-item-card2 ol-drag-row" data-idx="${idx}" draggable="true">

	<!-- ROW 1: identity + type + renewal id + pricing + delete -->
	<div class="ol-ic-row1">
		<div class="ol-ic-grip" title="Drag to reorder"><i class="ti ti-grip-vertical"></i></div>
		<div class="ol-ic-num">${idx + 1}</div>

		

		<div class="ol-ic-item ol-ic-replace" data-idx="${idx}" title="Click to change item">
			<div class="ol-ic-name">${me.escapeAttr(item.name || "—")}</div>
			<div class="ol-ic-sub">
				${item.code ? me.escapeAttr(item.code) : ""}${item.code && item.brand && item.brand !== "—" ? "  ·  " : ""}${item.brand && item.brand !== "—" ? me.escapeAttr(item.brand) : ""}${(item.code || (item.brand && item.brand !== "—")) ? "  ·  " : ""}<span class="ol-ic-type-text" style="color:${typeColor[item.type] || "#3b7ef8"};font-weight:700;">${typeLabel[item.type] || "New"}</span>${item.renewId ? `<span class="ol-ic-renewid"><i class="ti ti-refresh"></i> ${me.escapeAttr(item.renewId)}</span>` : ""}
			</div>
		</div>

		<div class="ol-ic-field" style="width:64px;">
			<label class="ol-ic-label">Qty</label>
			<input class="ol-item-qty ol-ic-input" type="number" min="1" step="1" value="${item.qty}" style="text-align:right;">
		</div>
		<div class="ol-ic-field" style="width:110px;">
			<label class="ol-ic-label">SP (₹)</label>
			<input class="ol-item-sp ol-ic-input" type="number" min="0" step="0.01" value="${item.sp}" style="text-align:right;">
		</div>
		<div class="ol-ic-field" style="width:120px;">
			<label class="ol-ic-label">Sell Amt</label>
			<div class="ol-ic-sa ol-sa-cell" style="white-space:nowrap;">₹${fmtINR(sa)}</div>
		</div>
		<div class="ol-ic-field" style="width:110px;">
			<label class="ol-ic-label">BP (₹)</label>
			<input class="ol-item-bp ol-ic-input" type="number" min="0" step="0.01" value="${item.bp || ""}" placeholder="0" style="text-align:right;">
		</div>

		
		<div class="ol-ic-field" style="width:100px;">
			<label class="ol-ic-label">Margin</label>
			<div class="ol-ic-margin ol-margin-cell" style="color:${marginColor};white-space:nowrap;">${marginPct.toFixed(1)}%</div>
		</div>

		<div class="ol-ic-field" style="width:34px;align-items:center;margin-left:auto;">
			<label class="ol-ic-label">&nbsp;</label>
			<button class="ol-item-del-btn ol-ic-del" data-idx="${idx}" type="button" title="Remove item">
				<i class="ti ti-trash"></i>
			</button>
		</div>
	</div>

	<!-- ROW 2: ORC + forecast + stage + date + description -->
	<div class="ol-ic-row2">
		<div class="ol-ic-field" style="width:auto;align-items:flex-start;">
			<label class="ol-ic-label">ORC</label>
			<label class="ol-ic-orc-toggle">
				<input type="checkbox" class="ol-item-orc" ${orcOn ? "checked" : ""} style="position:absolute;opacity:0;width:0;height:0;">
				<span class="ol-ic-orc-slider"></span>
			</label>
		</div>
		<div class="ol-ic-field ol-ic-orc-cond" style="width:148px;${orcOn ? "" : "display:none;"}">
			<label class="ol-ic-label">Commission Type</label>
			<select class="ol-item-commission-type ol-ic-input">
				<option value=""          ${!item.commission_type ? "selected" : ""}>— Select —</option>
				<option value="Unit Rate" ${item.commission_type === "Unit Rate" ? "selected" : ""}>Unit Rate</option>
				<option value="Value"     ${item.commission_type === "Value" ? "selected" : ""}>Value</option>
			</select>
		</div>
		<div class="ol-ic-field ol-ic-orc-cond" style="width:130px;${orcOn ? "" : "display:none;"}">
			<label class="ol-ic-label">Rate / Value (₹)</label>
			<input class="ol-item-ratevalue ol-ic-input" type="number" step="0.01" value="${item.rate_value || ""}" placeholder="0.00" style="text-align:right;">
		</div>

		<div class="ol-ic-field" style="width:118px;">
			<label class="ol-ic-label">Forecast</label>
			<select class="ol-item-forecast ol-ic-input">${forecastOpts}</select>
		</div>
		<div class="ol-ic-field" style="width:158px;">
			<label class="ol-ic-label">Sales Stage</label>
			<select class="ol-item-stage ol-ic-input">${stageOpts}</select>
		</div>
		<div class="ol-ic-field" style="width:148px;">
			<label class="ol-ic-label">Exp. Close</label>
			<input class="ol-item-closing ol-ic-input" type="date" value="${item.expected_date || ""}">
		</div>
		<div class="ol-ic-field" style="width:34px;align-items:center;">
			<label class="ol-ic-label">Desc</label>
			<button class="ol-ic-desc-btn ${hasDesc ? "has-desc" : ""}" data-idx="${idx}" type="button" title="Edit description">
				<i class="ti ${hasDesc ? "ti-file-check" : "ti-file-text"}"></i>
			</button>
		</div>
	</div>

</div>`;
		});

		$wrap.html(cards);
		me.calcTotals();
		me.initDragDrop();
		me.bindItemCards();
	}

	bindItemCards() {
		const me = this;

		const recompute = ($card, idx) => {
			const qty = parseFloat($card.find(".ol-item-qty").val()) || 0;
			const sp = parseFloat($card.find(".ol-item-sp").val()) || 0;
			const bp = parseFloat($card.find(".ol-item-bp").val()) || 0;
			const disc = Number(me.wizardItems[idx].discount || 0);
			const effSp = sp * (1 - disc / 100);
			const sa = qty * effSp;
			const marginAmt = (sp - bp) * qty;
			const marginPct = sp > 0 ? (((sp - bp) / sp) * 100) : 0;
			const fmt = v => "₹" + Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
			$card.find(".ol-sa-cell").text(fmt(sa));
			$card.find(".ol-margin-cell").text(fmt(marginAmt))
				.css("color", marginPct > 20 ? "#16a34a" : marginPct > 5 ? "#d97706" : "#dc2626");
		};

		// qty / sp / bp
		me.$content.off("input.olCard change.olCard", "#olItemsTbody .ol-item-qty, #olItemsTbody .ol-item-sp, #olItemsTbody .ol-item-bp")
			.on("input.olCard change.olCard", "#olItemsTbody .ol-item-qty, #olItemsTbody .ol-item-sp, #olItemsTbody .ol-item-bp", (e) => {
				const $card = $(e.currentTarget).closest(".ol-item-card2");
				const idx = parseInt($card.data("idx"));
				if (!Number.isFinite(idx) || !me.wizardItems[idx]) return;
				me.wizardItems[idx].qty = parseFloat($card.find(".ol-item-qty").val()) || 1;
				me.wizardItems[idx].sp = parseFloat($card.find(".ol-item-sp").val()) || 0;
				me.wizardItems[idx].bp = parseFloat($card.find(".ol-item-bp").val()) || 0;
				recompute($card, idx);
				me.calcTotals();
			});

		// stage / forecast / date
		me.$content.off("change.olCard", "#olItemsTbody .ol-item-stage, #olItemsTbody .ol-item-forecast, #olItemsTbody .ol-item-closing")
			.on("change.olCard", "#olItemsTbody .ol-item-stage, #olItemsTbody .ol-item-forecast, #olItemsTbody .ol-item-closing", (e) => {
				const $card = $(e.currentTarget).closest(".ol-item-card2");
				const idx = parseInt($card.data("idx"));
				if (!Number.isFinite(idx) || !me.wizardItems[idx]) return;
				me.wizardItems[idx].sales_stage = $card.find(".ol-item-stage").val() || "";
				me.wizardItems[idx].forecast = $card.find(".ol-item-forecast").val() || "";
				me.wizardItems[idx].expected_date = $card.find(".ol-item-closing").val() || "";
			});

		// description button → modal
		me.$content.off("click.olCard", "#olItemsTbody .ol-ic-desc-btn")
			.on("click.olCard", "#olItemsTbody .ol-ic-desc-btn", (e) => {
				e.stopPropagation();
				const idx = parseInt($(e.currentTarget).data("idx"));
				if (!Number.isFinite(idx) || !me.wizardItems[idx]) return;
				me.openItemDescModal(idx);
			});

		// ORC toggle → show/hide commission fields
		// ORC toggle → show/hide inline commission fields
		me.$content.off("change.olCard", "#olItemsTbody .ol-item-orc")
			.on("change.olCard", "#olItemsTbody .ol-item-orc", (e) => {
				const $card = $(e.currentTarget).closest(".ol-item-card2");
				const idx = parseInt($card.data("idx"));
				if (!Number.isFinite(idx) || !me.wizardItems[idx]) return;
				const checked = $(e.currentTarget).prop("checked");
				me.wizardItems[idx].is_orc = checked;
				$card.find(".ol-ic-orc-cond").toggle(checked);
				if (!checked) {
					me.wizardItems[idx].commission_type = "";
					me.wizardItems[idx].rate_value = 0;
				}
			});

		// commission / rate
		me.$content.off("input.olCard change.olCard", "#olItemsTbody .ol-item-commission-type, #olItemsTbody .ol-item-ratevalue")
			.on("input.olCard change.olCard", "#olItemsTbody .ol-item-commission-type, #olItemsTbody .ol-item-ratevalue", (e) => {
				const $card = $(e.currentTarget).closest(".ol-item-card2");
				const idx = parseInt($card.data("idx"));
				if (!Number.isFinite(idx) || !me.wizardItems[idx]) return;
				me.wizardItems[idx].commission_type = $card.find(".ol-item-commission-type").val() || "";
				me.wizardItems[idx].rate_value = parseFloat($card.find(".ol-item-ratevalue").val()) || 0;
			});

		// expand toggle
		me.$content.off("click.olCard", "#olItemsTbody .ol-ic-expand-btn")
			.on("click.olCard", "#olItemsTbody .ol-ic-expand-btn", (e) => {
				e.stopPropagation();
				const idx = parseInt($(e.currentTarget).data("idx"));
				if (!Number.isFinite(idx) || !me.wizardItems[idx]) return;
				me.syncItemValues();
				me.wizardItems[idx].expanded = !me.wizardItems[idx].expanded;
				me.renderItemsTable();
			});

		// click item → replace
		me.$content.off("click.olCard", "#olItemsTbody .ol-ic-replace")
			.on("click.olCard", "#olItemsTbody .ol-ic-replace", (e) => {
				const idx = parseInt($(e.currentTarget).data("idx"));
				if (!Number.isFinite(idx) || !me.wizardItems[idx]) return;
				me.openNewFormItemPopup(me.wizardItems[idx].type || "new", idx);
			});

		// delete
		me.$content.off("click.olCard", "#olItemsTbody .ol-item-del-btn")
			.on("click.olCard", "#olItemsTbody .ol-item-del-btn", (e) => {
				e.stopPropagation();
				const idx = parseInt($(e.currentTarget).data("idx"));
				if (!Number.isFinite(idx) || !me.wizardItems[idx]) return;
				const nm = me.wizardItems[idx].name || `Item ${idx + 1}`;
				me._showDeleteConfirm(nm, () => {
					me.wizardItems.splice(idx, 1);
					me.renderItemsTable();
				});
			});

		// Mount Quill into any expanded card's description host
		me.itemDescControls = {};
		me.$content.find("#olItemsTbody .ol-item-desc-host").each(function () {
			const $host = $(this);
			const idx = parseInt($host.data("descIdx"));
			if (!Number.isFinite(idx) || !me.wizardItems[idx]) return;
			$host.empty();
			const ctrl = frappe.ui.form.make_control({
				parent: $host.get(0),
				df: {
					fieldname: `ol_desc_${idx}`, fieldtype: "Text Editor", label: "",
					change: () => { if (me.wizardItems[idx]) me.wizardItems[idx].description = ctrl.get_value() || ""; }
				},
				render_input: true,
			});
			ctrl.set_value(me.wizardItems[idx].description || "");
			me.itemDescControls[idx] = ctrl;
		});
	}

	openItemDescModal(idx) {
		const me = this;
		if (!me.wizardItems[idx]) return;
		$("#olDescModalOverlay").remove();

		const itemName = me.wizardItems[idx].name || `Item ${idx + 1}`;

		const $overlay = $(`
	<div id="olDescModalOverlay" style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9000;display:flex;align-items:center;justify-content:center;padding:20px;">
		<div style="background:#fff;border-radius:16px;width:100%;max-width:640px;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 24px 64px rgba(0,0,0,0.18);">
			<div style="padding:16px 20px 12px;border-bottom:1px solid rgba(0,0,0,0.08);display:flex;align-items:center;justify-content:space-between;">
				<div>
					<div style="font-family:Syne,sans-serif;font-size:15px;font-weight:700;color:#111827;display:flex;align-items:center;gap:8px;"><i class="ti ti-align-left" style="color:#3b7ef8;"></i> Description</div>
					<div style="font-size:11px;color:#9ca3af;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:560px;">${me.escapeAttr(itemName)}</div>
				</div>
				<button id="olDescClose" style="width:28px;height:28px;border-radius:50%;border:1px solid rgba(0,0,0,0.1);background:transparent;color:#9ca3af;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;"><i class="ti ti-x"></i></button>
			</div>
			<div style="flex:1;overflow-y:auto;padding:16px 20px;">
				<div id="olDescEditorHost"></div>
			</div>
			<div style="padding:12px 20px;border-top:1px solid rgba(0,0,0,0.08);background:#f8fafc;display:flex;justify-content:flex-end;gap:8px;">
				<button id="olDescCancel" style="padding:7px 16px;border-radius:6px;border:1px solid rgba(0,0,0,0.1);background:#fff;font-size:13px;cursor:pointer;color:#374151;">Cancel</button>
				<button id="olDescSave" style="padding:7px 18px;border-radius:6px;border:none;background:#3b7ef8;color:#fff;font-size:13px;font-weight:600;cursor:pointer;"><i class="ti ti-check" style="margin-right:4px;"></i> Save</button>
			</div>
		</div>
	</div>`);

		$("body").append($overlay);

		// Lazy-mount Quill
		const ctrl = frappe.ui.form.make_control({
			parent: $overlay.find("#olDescEditorHost").get(0),
			df: { fieldname: "ol_desc_modal", fieldtype: "Text Editor", label: "" },
			render_input: true,
		});
		ctrl.set_value(me.wizardItems[idx].description || "");

		const close = () => $overlay.remove();
		$overlay.on("click", "#olDescClose, #olDescCancel", close);
		$overlay.on("click", (e) => { if ($(e.target).is($overlay)) close(); });
		$overlay.on("click", "#olDescSave", () => {
			me.wizardItems[idx].description = ctrl.get_value() || "";
			// update card button state
			const hasDesc = String(me.wizardItems[idx].description).replace(/<[^>]*>/g, "").trim().length > 0;
			const $btn = me.$content.find(`#olItemsTbody .ol-ic-desc-btn[data-idx="${idx}"]`);
			$btn.toggleClass("has-desc", hasDesc);
			$btn.find("i").attr("class", `ti ${hasDesc ? "ti-file-check" : "ti-file-text"}`);
			close();
		});
	}

	// Bind expand toggle + save expanded field changes back to wizardItems
	bindExpandRows() {
		const me = this;

		// Mount Frappe Text Editor (Quill) into each description host
		me.itemDescControls = me.itemDescControls || {};
		me.$content.find(".ol-item-desc-host").each(function () {
			const $host = $(this);
			const idx = parseInt($host.data("descIdx"));
			if (!Number.isFinite(idx) || !me.wizardItems[idx]) return;
			$host.empty();
			const ctrl = frappe.ui.form.make_control({
				parent: $host.get(0),
				df: {
					fieldname: `ol_desc_${idx}`,
					fieldtype: "Text Editor",
					label: "",
					change: () => {
						if (me.wizardItems[idx]) {
							me.wizardItems[idx].description = ctrl.get_value() || "";
						}
					}
				},
				render_input: true
			});
			ctrl.set_value(me.wizardItems[idx].description || "");
			me.itemDescControls[idx] = ctrl;
		});

		// Toggle expand on button click
		me.$content.off("click.olExpand", ".ol-expand-btn")
			.on("click.olExpand", ".ol-expand-btn", (e) => {
				e.stopPropagation();
				const idx = parseInt($(e.currentTarget).data("expandIdx"));
				if (!Number.isFinite(idx) || !me.wizardItems[idx]) return;
				// Save current inline values before re-render
				me.syncItemValues();
				me.wizardItems[idx].expanded = !me.wizardItems[idx].expanded;
				me.renderItemsTable();
			});

		// Save expanded field changes live
		const expSel = ".ol-item-name,.ol-item-code,.ol-item-brand,.ol-item-type,.ol-item-stage,.ol-item-forecast,.ol-item-closing,.ol-item-startdate,.ol-item-enddate,.ol-item-qty,.ol-item-sp,.ol-item-bp,.ol-item-disc,.ol-item-uom,.ol-item-orc,.ol-item-ratevalue";
		me.$content.off("input.olExpField change.olExpField", expSel)
			.on("input.olExpField change.olExpField", expSel, (e) => {
				const $row = $(e.currentTarget).closest(".ol-expanded-row");
				const idx = parseInt($row.data("expandFor"));
				if (!Number.isFinite(idx) || !me.wizardItems[idx]) return;
				const $er = $row;
				me.wizardItems[idx].name = $er.find(".ol-item-name").val() || me.wizardItems[idx].name;
				me.wizardItems[idx].code = $er.find(".ol-item-code").val() || me.wizardItems[idx].code;
				me.wizardItems[idx].brand = $er.find(".ol-item-brand").val() || "";
				const typeVal = $er.find(".ol-item-type").val();
				if (typeVal) me.wizardItems[idx].type = typeVal; me.wizardItems[idx].qty = parseFloat($er.find(".ol-item-qty").val()) || me.wizardItems[idx].qty || 1;
				me.wizardItems[idx].sp = parseFloat($er.find(".ol-item-sp").val()) || 0;
				me.wizardItems[idx].bp = parseFloat($er.find(".ol-item-bp").val()) || 0;
				me.wizardItems[idx].discount = parseFloat($er.find(".ol-item-disc").val()) || 0;
				me.wizardItems[idx].rate_value = parseFloat($er.find(".ol-item-ratevalue").val()) || 0;
				me.wizardItems[idx].uom = $er.find(".ol-item-uom").val() || "Nos";
				me.wizardItems[idx].is_orc = $er.find(".ol-item-orc").prop("checked");
				me.wizardItems[idx].sales_stage = $er.find(".ol-item-stage").val() || me.wizardItems[idx].sales_stage || "Initial Analysis";
				me.wizardItems[idx].forecast = $er.find(".ol-item-forecast").val() || "";
				me.wizardItems[idx].expected_date = $er.find(".ol-item-closing").val() || "";
				me.wizardItems[idx].start_date = $er.find(".ol-item-startdate").val() || "";
				me.wizardItems[idx].end_date = $er.find(".ol-item-enddate").val() || "";
				// Mirror qty/sp/bp back to compact row so calcTotals reads fresh values
				const $compact = me.$content.find(`#olItemsTbody .ol-drag-row[data-idx="${idx}"]`);
				if ($compact.length) {
					$compact.find(".ol-item-qty").val(me.wizardItems[idx].qty);
					$compact.find(".ol-item-sp").val(me.wizardItems[idx].sp);
					$compact.find(".ol-item-bp").val(me.wizardItems[idx].bp || "");
				}
				me.calcTotals();
			});

		// Compact-row inline edits (qty/sp/bp) — write to wizardItems and mirror to expanded row
		me.$content.off("input.olCompactField change.olCompactField",
			"#olItemsTbody .ol-drag-row .ol-item-qty, #olItemsTbody .ol-drag-row .ol-item-sp, #olItemsTbody .ol-drag-row .ol-item-bp")
			.on("input.olCompactField change.olCompactField",
				"#olItemsTbody .ol-drag-row .ol-item-qty, #olItemsTbody .ol-drag-row .ol-item-sp, #olItemsTbody .ol-drag-row .ol-item-bp",
				(e) => {
					const $cr = $(e.currentTarget).closest(".ol-drag-row");
					const idx = parseInt($cr.data("idx"));
					if (!Number.isFinite(idx) || !me.wizardItems[idx]) return;
					me.wizardItems[idx].qty = parseFloat($cr.find(".ol-item-qty").val()) || me.wizardItems[idx].qty || 1;
					me.wizardItems[idx].sp = parseFloat($cr.find(".ol-item-sp").val()) || 0;
					me.wizardItems[idx].bp = parseFloat($cr.find(".ol-item-bp").val()) || 0;
					const $exp = me.$content.find(`[data-expand-for="${idx}"]`);
					if ($exp.length) {
						$exp.find(".ol-item-qty").val(me.wizardItems[idx].qty);
						$exp.find(".ol-item-sp").val(me.wizardItems[idx].sp);
						$exp.find(".ol-item-bp").val(me.wizardItems[idx].bp || "");
					}
					me.calcTotals();
				});

		// Auto-fill item details when item code is entered in expanded row
		me.$content.off("change.olItemLookup blur.olItemLookup keydown.olItemLookup", ".ol-item-code")
			.on("change.olItemLookup blur.olItemLookup", ".ol-item-code", (e) => {
				me.lookupItemByCodeFromRow(e.currentTarget);
			})
			.on("keydown.olItemLookup", ".ol-item-code", (e) => {
				if (e.key === "Enter") {
					e.preventDefault();
					me.lookupItemByCodeFromRow(e.currentTarget);
				}
			});



		// Sync opportunity type immediately when changed in wizard Step 2
		me.$content.off("change.olTypeSync", ".ol-item-type")
			.on("change.olTypeSync", ".ol-item-type", (e) => {
				const $expRow = $(e.currentTarget).closest(".ol-expanded-row");
				const idx = parseInt($expRow.data("expandFor"));
				if (!Number.isFinite(idx) || !me.wizardItems[idx]) return;
				me.wizardItems[idx].type = $(e.currentTarget).val();
				// Update the type badge in the compact row live
				const typeCls = { new: "ol-type-new", renewal: "ol-type-renewal", additional: "ol-type-additional" };
				const typeLabel = { new: "New", renewal: "Renewal", additional: "Additional" };
				const newType = me.wizardItems[idx].type;
				const $badge = me.$content.find(`#olItemsTbody .ol-drag-row[data-idx="${idx}"] .ol-type-badge`);
				$badge.attr("class", `ol-type-badge ${typeCls[newType] || "ol-type-new"}`).text(typeLabel[newType] || "New");
				// Show/hide Renewal ID field in Step 1 Schedule block
				const showRenew = (newType === "renewal" || newType === "additional") && me.wizardItems[idx].renewId;
				const $renewWrap = $expRow.find(".ol-item-renewid").closest(".ol-exp-field");
				$renewWrap.toggle(!!showRenew);
			});


		// ORC card visual toggle (inside bindExpandRows, after existing bindings)
		me.$content.off("change.olORC", ".ol-item-orc")
			.on("change.olORC", ".ol-item-orc", function (e) {
				e.stopPropagation();
				const $cb = $(this);
				const checked = $cb.prop("checked");
				const idx = parseInt($cb.closest(".ol-expanded-row").data("expandFor"));

				// Force slider color
				$cb.parent().find(".ol-exp-orc-slider")
					.css("background", checked ? "#3b7ef8" : "#e5e7eb");

				// Show/hide ORC conditional fields
				$cb.closest(".ol-expanded-row").find(".ol-orc-conditional")
					.css({ opacity: checked ? 1 : 0.4, "pointer-events": checked ? "" : "none" });

				// Write to wizardItems
				if (Number.isFinite(idx) && me.wizardItems[idx]) {
					me.wizardItems[idx].is_orc = checked;
				}
			});

		// Also sync commission_type on change
		me.$content.off("change.olCommType", ".ol-item-commission-type")
			.on("change.olCommType", ".ol-item-commission-type", (e) => {
				const $expRow = $(e.currentTarget).closest(".ol-expanded-row");
				const idx = parseInt($expRow.data("expandFor"));
				if (Number.isFinite(idx) && me.wizardItems[idx]) {
					me.wizardItems[idx].commission_type = $(e.currentTarget).val();
				}
			});
	}


	/*
	   STEP B — Add wizard navigation bindings
	   ─────────────────────────────────────────
	   Inside bindExpandRows(), at the very END of the method body,
	   FIND this closing line:
	 
			});  // end of me.$content.off("change.olItemLookup blur.olItemLookup keydown.olItemLookup", ".ol-item-code")
	 
	   AFTER that entire block (after all existing bindings), ADD:
	 
			me.bindExpandedWizard();
	 
	   So the last few lines of bindExpandRows() look like:
	 
			...
			.on("keydown.olItemLookup", ".ol-item-code", (e) => {
				if (e.key === "Enter") {
					e.preventDefault();
					me.lookupItemByCodeFromRow(e.currentTarget);
				}
			});
	 
			me.bindExpandedWizard();   // ← ADD THIS LINE
		}                              // ← closing brace of bindExpandRows()
	 
	 
	   STEP C — Add the two new methods to OppListPage class
	   ───────────────────────────────────────────────────────
	   After the closing brace of bindExpandRows() and before lookupItemByCodeFromRow(),
	   ADD the two methods below:
	*/

	bindExpandedWizard() {
		const me = this;

		me.$content.off("click.olExpWiz", ".ol-exp-wiz-step")
			.on("click.olExpWiz", ".ol-exp-wiz-step", (e) => {
				const targetStep = parseInt($(e.currentTarget).data("wizStep"));
				const idx = parseInt($(e.currentTarget).data("forIdx"));
				if (Number.isFinite(idx) && Number.isFinite(targetStep))
					me._goExpWizStep(idx, targetStep);
			});

		me.$content.off("click.olExpWizNav", ".ol-exp-wiz-next, .ol-exp-wiz-back")
			.on("click.olExpWizNav", ".ol-exp-wiz-next, .ol-exp-wiz-back", (e) => {
				e.stopPropagation();
				const targetStep = parseInt($(e.currentTarget).data("wizGoto"));
				const idx = parseInt($(e.currentTarget).data("forIdx"));
				if (Number.isFinite(idx) && Number.isFinite(targetStep))
					me._goExpWizStep(idx, targetStep);
			});
	}

	_goExpWizStep(idx, targetStep) {
		const $expRow = this.$content.find(`.ol-expanded-row[data-expand-for="${idx}"]`);
		if (!$expRow.length) return;

		// Stepper buttons
		$expRow.find(".ol-exp-wiz-step").each(function () {
			const sn = parseInt($(this).data("wizStep"));
			$(this).removeClass("active done");
			if (sn === targetStep) $(this).addClass("active");
			else if (sn < targetStep) $(this).addClass("done");
		});

		// Connector lines: connector[i] sits between step i+1 and i+2
		$expRow.find(".ol-exp-wiz-connector").each(function (i) {
			$(this).toggleClass("done", (i + 1) < targetStep);
		});

		// Show correct panel with animation reset
		const $panels = $expRow.find(".ol-exp-wiz-panel");
		$panels.removeClass("active");
		const $target = $expRow.find(`.ol-exp-wiz-panel[data-wiz-panel="${targetStep}"]`);
		// Trigger animation even if panel was previously active
		$target.get(0) && ($target.get(0).style.animation = "none");
		requestAnimationFrame(() => {
			$target.get(0) && ($target.get(0).style.animation = "");
			$target.addClass("active");
		});
	}

	lookupItemByCodeFromRow(inputEl) {
		const me = this;
		const $input = $(inputEl);
		const $expRow = $input.closest(".ol-expanded-row");
		const idx = parseInt($expRow.data("expandFor"));
		if (!Number.isFinite(idx) || !me.wizardItems[idx]) return;

		const code = ($input.val() || "").trim();
		if (!code) return;

		const codeLc = code.toLowerCase();
		const localHit = (me.wizardERP_Items || []).find((it) => {
			const c = (it.code || "").toLowerCase();
			const n = (it.name || "").toLowerCase();
			return c === codeLc || n === codeLc;
		});
		if (localHit) {
			me.applyLookupItemToRow(idx, {
				item_name: localHit.name,
				item_code: localHit.code,
				brand: localHit.brand,
				description: localHit.description,
				stock_uom: localHit.uom,
				standard_rate: localHit.sp,
				item_group: localHit.group
			}, $expRow);
			return;
		}

		const reqId = ++me.itemLookupReqSeq;
		frappe.call({
			method: "frappe.client.get_list",
			args: {
				doctype: "Item",
				fields: ["name", "item_name", "item_code", "brand", "description", "stock_uom", "standard_rate", "item_group", "tenure", "years", "months"],
				filters: { item_code: code },
				limit_page_length: 1
			},
			callback: (r) => {
				if (reqId !== me.itemLookupReqSeq) return;
				const item = (r.message || [])[0];
				if (item) {
					me.applyLookupItemToRow(idx, item, $expRow);
					return;
				}
				frappe.call({
					method: "frappe.client.get",
					args: { doctype: "Item", name: code },
					callback: (r2) => {
						if (reqId !== me.itemLookupReqSeq) return;
						if (r2.message) {
							me.applyLookupItemToRow(idx, r2.message, $expRow);
						}
					}
				});
			}
		});
	}

	applyLookupItemToRow(idx, itemDoc, $expRow) {
		const me = this;
		if (!me.wizardItems[idx]) return;

		const nextName = itemDoc.item_name || itemDoc.name || me.wizardItems[idx].name || "";
		const nextCode = itemDoc.item_code || itemDoc.name || me.wizardItems[idx].code || "";
		const nextBrand = itemDoc.brand || "—";
		const nextDesc = itemDoc.description || "";
		const nextUom = itemDoc.stock_uom || me.wizardItems[idx].uom || "Nos";
		const nextRate = Number(itemDoc.standard_rate || 0);

		me.wizardItems[idx].name = nextName;
		me.wizardItems[idx].code = nextCode;
		me.wizardItems[idx].brand = nextBrand;
		me.wizardItems[idx].description = nextDesc;
		me.wizardItems[idx].uom = nextUom;
		me.wizardItems[idx].group = itemDoc.item_group || me.wizardItems[idx].group || "General";
		if (!Number(me.wizardItems[idx].sp || 0) || nextRate > 0) {
			me.wizardItems[idx].sp = nextRate;
		}

		if ($expRow && $expRow.length) {
			$expRow.find(".ol-item-name").val(nextName);
			$expRow.find(".ol-item-code").val(nextCode);
			$expRow.find(".ol-item-brand").val(nextBrand);
			$expRow.find(".ol-item-uom").val(nextUom);
			$expRow.find(".ol-item-sp").val(me.wizardItems[idx].sp || 0);
			const descCtrl = me.itemDescControls && me.itemDescControls[idx];
			if (descCtrl) descCtrl.set_value(nextDesc || "");
		}

		const $mainRow = me.$content.find(`#olItemsTbody .ol-drag-row[data-idx="${idx}"]`);
		$mainRow.find("td:eq(2) > div:eq(0)").text(nextName || "—");
		$mainRow.find("td:eq(2) > div:eq(1)").text(nextBrand || "—");

		me.calcTotals();
	}

	initDragDrop() {
		const me = this;
		const $tbody = me.$content.find("#olItemsTbody");
		let dragIdx = null;

		$tbody.find(".ol-drag-row").each(function () {
			const el = this;
			const idx = parseInt($(el).data("idx"));

			el.addEventListener("dragstart", (e) => {
				dragIdx = idx;
				e.dataTransfer.effectAllowed = "move";
				$(el).css("opacity", "0.4");
			});
			el.addEventListener("dragend", () => {
				$(el).css("opacity", "1");
				$tbody.find(".ol-drag-row").css("border-top", "");
			});
			el.addEventListener("dragover", (e) => {
				e.preventDefault();
				e.dataTransfer.dropEffect = "move";
				$tbody.find(".ol-drag-row").css("border-top", "");
				if (parseInt($(el).data("idx")) !== dragIdx)
					$(el).css("border-top", "2px solid #3b7ef8");
			});
			el.addEventListener("drop", (e) => {
				e.preventDefault();
				const dropIdx = parseInt($(el).data("idx"));
				if (dragIdx === null || dragIdx === dropIdx) return;
				// Sync live values before reorder
				me.syncItemValues();
				// Move item
				const moved = me.wizardItems.splice(dragIdx, 1)[0];
				me.wizardItems.splice(dropIdx, 0, moved);
				dragIdx = null;
				me.renderItemsTable();
			});
		});
	}

	// Sync live input values back to wizardItems array before reorder/calc
	syncItemValues() {
		const me = this;
		me.$content.find("#olItemsTbody .ol-item-card2").each(function () {
			const idx = parseInt($(this).data("idx"));
			if (!Number.isFinite(idx) || !me.wizardItems[idx]) return;
			me.wizardItems[idx].qty = parseFloat($(this).find(".ol-item-qty").val()) || 1;
			me.wizardItems[idx].sp = parseFloat($(this).find(".ol-item-sp").val()) || 0;
			me.wizardItems[idx].bp = parseFloat($(this).find(".ol-item-bp").val()) || 0;
			me.wizardItems[idx].sales_stage = $(this).find(".ol-item-stage").val() || me.wizardItems[idx].sales_stage || "";
			me.wizardItems[idx].forecast = $(this).find(".ol-item-forecast").val() || "";
			me.wizardItems[idx].expected_date = $(this).find(".ol-item-closing").val() || "";
			me.wizardItems[idx].is_orc = $(this).find(".ol-item-orc").prop("checked");
			me.wizardItems[idx].commission_type = $(this).find(".ol-item-commission-type").val() || "";
			me.wizardItems[idx].rate_value = parseFloat($(this).find(".ol-item-ratevalue").val()) || 0;
			const ctrl = me.itemDescControls && me.itemDescControls[idx];
			if (ctrl) me.wizardItems[idx].description = ctrl.get_value() || me.wizardItems[idx].description || "";
		});
	}

	calcTotals() {
		const me = this;
		let totalSell = 0, totalBuy = 0;
		me.wizardItems.forEach((item, idx) => {
			const $row = me.$content.find(`#olItemsTbody [data-idx="${idx}"]`);
			const qty = parseFloat($row.find(".ol-item-qty").val()) || item.qty || 1;
			const rawSP = parseFloat($row.find(".ol-item-sp").val()) || item.sp || 0;
			const bp = parseFloat($row.find(".ol-item-bp").val()) || item.bp || 0;
			const disc = Number(item.discount || 0);
			const sp = rawSP * (1 - disc / 100);
			const sa = qty * sp;
			const ba = qty * bp;
			const margin = rawSP > 0 ? (((rawSP - bp) / rawSP) * 100) : 0;
			const fmt = n => "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
			$row.find(".ol-sa-cell").text(fmt(sa));
			$row.find(".ol-ba-cell").text(fmt(ba));
			const marginAmt = (rawSP - bp) * qty;
			$row.find(".ol-margin-cell").text("₹" + marginAmt.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
				.css("color", margin > 20 ? "#16a34a" : margin > 5 ? "#d97706" : "#dc2626");
			totalSell += sa; totalBuy += ba;
		});
		const fmt = n => "₹ " + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
		const totalQty = me.wizardItems.reduce((s, item, idx) =>
			s + (parseFloat(me.$content.find(`#olItemsTbody [data-idx="${idx}"] .ol-item-qty`).val()) || item.qty || 1), 0);
		me.$content.find("#olSumQtyLabel").text(totalQty % 1 === 0 ? totalQty : totalQty.toFixed(1));
		me.$content.find("#olSumGrand").text(fmt(totalSell));
		return { totalSell, totalBuy, tax: 0, grand: totalSell };
	}

	handleFiles(files) {
		const me = this;
		[...files].forEach(f => {
			me.wizardFiles.push(f);
			const ext = f.name.split(".").pop().toLowerCase();
			const imap = { pdf: "ti-file-type-pdf", doc: "ti-file-type-doc", docx: "ti-file-type-doc", xls: "ti-file-spreadsheet", xlsx: "ti-file-spreadsheet", png: "ti-photo", jpg: "ti-photo" };
			me.$content.find("#olAttPreview").append(`
				<div class="ol-att-item" data-fname="${me.escapeAttr(f.name)}">
					<i class="ti ${imap[ext] || "ti-file"}" style="font-size:18px;color:#3b7ef8;flex-shrink:0;"></i>
					<span style="font-size:11px;font-weight:500;color:#111827;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${me.escapeAttr(f.name)}</span>
					<i class="ti ti-x" style="font-size:13px;color:#9ca3af;cursor:pointer;flex-shrink:0;" data-del-file="${me.escapeAttr(f.name)}"></i>
				</div>`);
		});
		me.$content.on("click.olNew", "[data-del-file]", function () {
			const name = $(this).data("delFile");
			me.wizardFiles = me.wizardFiles.filter(f => f.name !== name);
			$(this).closest(".ol-att-item").remove();
		});
	}

	buildReview() {
		const me = this;
		const g = id => (me.$content.find(id).val() || "—").trim();
		const getDefaultCloseDate = () => {
			const datedItems = (me.wizardItems || [])
				.map((it) => (it && it.expected_date ? String(it.expected_date).trim() : ""))
				.filter(Boolean)
				.sort();
			return datedItems[0] || "—";
		};
		me.syncItemValues();
		const tots = me.calcTotals();
		const fmt = n => "₹ " + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
		const subject = g("#olFSubject");
		const customer = g("#olFCustomer");
		const company = g("#olFCompany");
		const salesperson = g("#olFSalesperson");
		const stage = g("#olFStage") || "Open";
		const closure = getDefaultCloseDate();

		// Build contacts HTML
		const colors = ["#3b7ef8", "#16a34a", "#d97706", "#7c3aed", "#dc2626"];
		const contactsHTML = me.wizardContacts.length
			? me.wizardContacts.map((c, i) => {
				const av = (c.name || "?")[0].toUpperCase();
				const clr = colors[i % colors.length];
				return `<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid rgba(0,0,0,0.06);">
					<div style="width:36px;height:36px;border-radius:50%;background:${clr}1a;border:2px solid ${clr}33;display:flex;align-items:center;justify-content:center;font-family:Syne,sans-serif;font-size:14px;font-weight:700;color:${clr};flex-shrink:0;">${av}</div>
					<div style="flex:1;min-width:0;">
						<div style="font-weight:600;font-size:13px;color:#111827;">${me.escapeAttr(c.name || "—")}${c.role ? '<span style="font-weight:400;color:#6b7280;font-size:11px;margin-left:6px;">' + me.escapeAttr(c.role) + '</span>' : ""}</div>
						${c.email ? '<div style="font-size:12px;color:#3b7ef8;margin-top:2px;"><i class="ti ti-mail" style="font-size:11px;margin-right:4px;color:#9ca3af;"></i>' + me.escapeAttr(c.email) + "</div>" : ""}
						${c.phone ? '<div style="font-size:12px;color:#374151;margin-top:2px;"><i class="ti ti-device-mobile" style="font-size:11px;margin-right:4px;color:#9ca3af;"></i>' + me.escapeAttr(c.phone) + "</div>" : ""}
					</div>
				</div>`;
			}).join("")
			: '<div style="padding:16px;text-align:center;color:#9ca3af;font-size:12px;">No contacts added</div>';

		// Build items HTML
		const itemsHTML = me.wizardItems.length
			? `<table style="width:100%;border-collapse:collapse;font-size:12px;">
				<thead><tr style="background:#f8fafc;">
					<th style="padding:7px 10px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:#9ca3af;border-bottom:1px solid rgba(0,0,0,0.08);">#</th>
					<th style="padding:7px 10px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:#9ca3af;border-bottom:1px solid rgba(0,0,0,0.08);">Item</th>
					<th style="padding:7px 10px;font-size:10px;font-weight:700;text-transform:uppercase;color:#9ca3af;border-bottom:1px solid rgba(0,0,0,0.08);">Type</th>
					<th style="padding:7px 10px;text-align:right;font-size:10px;font-weight:700;text-transform:uppercase;color:#9ca3af;border-bottom:1px solid rgba(0,0,0,0.08);">Qty</th>
					<th style="padding:7px 10px;text-align:right;font-size:10px;font-weight:700;text-transform:uppercase;color:#9ca3af;border-bottom:1px solid rgba(0,0,0,0.08);">Rate</th>
					<th style="padding:7px 10px;text-align:right;font-size:10px;font-weight:700;text-transform:uppercase;color:#9ca3af;border-bottom:1px solid rgba(0,0,0,0.08);">Amount</th>
				</tr></thead>
				<tbody>${me.wizardItems.map((item, i) => {
				const sp = item.sp * (1 - (item.discount || 0) / 100);
				const amt = item.qty * sp;
				const typeCls = { new: "ol-type-new", renewal: "ol-type-renewal", additional: "ol-type-additional" }[item.type] || "ol-type-new";
				const typeLabel = { new: "New", renewal: "Renewal", additional: "Additional" }[item.type] || "New";
				return `<tr style="border-bottom:1px solid rgba(0,0,0,0.06);">
						<td style="padding:8px 10px;color:#9ca3af;font-size:11px;">${i + 1}</td>
						<td style="padding:8px 10px;">
							<div style="font-weight:600;color:#111827;">${me.escapeAttr(item.name)}</div>
							${item.code ? '<div style="font-size:10px;color:#9ca3af;">' + me.escapeAttr(item.code) + "</div>" : ""}
						</td>
						<td style="padding:8px 10px;"><span class="ol-type-badge ${typeCls}">${typeLabel}</span></td>
						<td style="padding:8px 10px;text-align:right;">${item.qty}</td>
						<td style="padding:8px 10px;text-align:right;">₹${sp.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
						<td style="padding:8px 10px;text-align:right;font-weight:600;">₹${amt.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
					</tr>`;
			}).join("")}</tbody>
				<tfoot><tr style="background:#f8fafc;">
					<td colspan="5" style="padding:10px;text-align:right;font-weight:700;font-size:13px;color:#111827;">Total Amount</td>
					<td style="padding:10px;text-align:right;font-weight:700;font-size:15px;color:#3b7ef8;font-family:Syne,sans-serif;">${fmt(tots.totalSell)}</td>
				</tr></tfoot>
			</table>`
			: '<div style="padding:20px;text-align:center;color:#9ca3af;font-size:12px;">No items added</div>';

		me.$content.find("#olReviewContent").html(`
			<!-- ① Subject hero -->
			<div style="grid-column:1/-1;background:linear-gradient(135deg,#3b7ef8 0%,#2563eb 100%);border-radius:14px;padding:20px 24px;color:#fff;margin-bottom:4px;">
				<div style="font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;opacity:.7;margin-bottom:6px;">Opportunity</div>
				<div style="font-family:Syne,sans-serif;font-size:20px;font-weight:700;margin-bottom:10px;">${me.escapeAttr(subject)}</div>
				<div style="display:flex;gap:24px;flex-wrap:wrap;font-size:12px;opacity:.85;">
					<span><i class="ti ti-building-store" style="margin-right:4px;"></i>${me.escapeAttr(customer)}</span>
					${stage !== "—" ? '<span><i class="ti ti-git-branch" style="margin-right:4px;"></i>' + me.escapeAttr(stage) + "</span>" : ""}
					${closure !== "—" ? '<span><i class="ti ti-calendar-due" style="margin-right:4px;"></i>' + me.escapeAttr(closure) + "</span>" : ""}
					${salesperson !== "—" ? '<span><i class="ti ti-user-check" style="margin-right:4px;"></i>' + me.escapeAttr(salesperson) + "</span>" : ""}
				</div>
			</div>

			<!-- ② Customer + Salesperson -->
			<div class="ol-review-card">
				<div class="ol-review-card-title">Customer</div>
				<div class="ol-review-row"><span>Name</span><span>${me.escapeAttr(customer)}</span></div>
				${company !== "—" ? '<div class="ol-review-row"><span>Company / Group</span><span>' + me.escapeAttr(company) + "</span></div>" : ""}
				${salesperson !== "—" ? `<div class="ol-review-row"><span>Salesperson</span><span>${me.escapeAttr(salesperson)}</span></div>
				${me.$content.find("#olFSpEmail").val() ? '<div class="ol-review-row"><span>&nbsp; Email</span><span>' + me.$content.find("#olFSpEmail").val() + "</span></div>" : ""}
				${me.$content.find("#olFSpPhone").val() ? '<div class="ol-review-row"><span>&nbsp; Mobile</span><span>' + me.$content.find("#olFSpPhone").val() + "</span></div>" : ""}` : ""}
				<div class="ol-review-row"><span>Attachments</span><span>${me.wizardFiles.length} file(s)</span></div>
			</div>

			<!-- ③ Contacts -->
			<div class="ol-review-card">
				<div class="ol-review-card-title">Contacts (${me.wizardContacts.length})</div>
				${contactsHTML}
			</div>

			<!-- ④ Items table: full width -->
			<div style="grid-column:1/-1;" class="ol-review-card">
				<div class="ol-review-card-title">Items (${me.wizardItems.length})</div>
				<div style="overflow-x:auto;margin-top:8px;">${itemsHTML}</div>
			</div>`);
	}

	submitWizard() {
		const me = this;
		if (!me.validateWizardStep(1)) { me.goWizardStep(1); return; }

		const partyName = me.selectedCustomerDoc?.name || "";
		if (!partyName) {
			frappe.msgprint("Please select a Customer before submitting.");
			me.goWizardStep(1);
			return;
		}

		const subject = (me.$content.find("#olFSubject").val() || "").trim();
		if (!subject) {
			frappe.msgprint("Please enter a Subject.");
			me.goWizardStep(1);
			return;
		}

		const contacts = Array.isArray(me.wizardContacts) ? me.wizardContacts.filter(c => c && (c.name || c.docname)) : [];

		const pocIdx = Number.isFinite(me.wizardPocIndex) ? me.wizardPocIndex : 0;
		const primaryContact = contacts[pocIdx] || contacts.find(c => c.docname) || contacts[0] || null;
		if (!primaryContact || !primaryContact.docname) {
			frappe.msgprint("Please add at least one existing Contact for this customer (required for Opportunity).");
			me.goWizardStep(2);
			return;
		}

		const contactList = contacts.map((c, i) => ({
			user_name: c.docname || "",
			email_id: c.email || "",
			mobile_no: c.phone || "",
			designation: c.role || "",
			is_primary: (i === pocIdx) ? 1 : 0,
		}));

		const $sp = me.$content.find("#olFSalesperson");
		const spDocname = ($sp.attr("data-docname") || "").trim() || ($sp.val() || "").trim();
		// salesperson comes from the customer's sales team (captured in onCustomerSelected)
		const salesTeam = Array.isArray(me._oppSalesTeam) ? me._oppSalesTeam : [];
		console.log("salesTeam from customer:", salesTeam);


		const validTill = (me.wizardItems || [])
			.map((it) => (it && it.expected_date ? String(it.expected_date).trim() : ""))
			.filter(Boolean)
			.sort()[0] || "";
		if (!validTill) {
			frappe.msgprint("Please set Expected Closing date on at least one item.");
			me.goWizardStep(3);
			return;
		}

		// Require a Sales Stage on every item
		me.syncItemValues();
		const missingStage = (me.wizardItems || []).some(it => !it.sales_stage);
		if (missingStage) {
			frappe.msgprint("Please select a Sales Stage for every item.");
			me.goWizardStep(3);
			return;
		}

		const items = (me.wizardItems || []).map((it) => {
			const qty = Number(it.qty || 0) || 0;
			const rate = Number(it.sp || 0) * (1 - (Number(it.discount || 0) / 100));
			const buyingRate = Number(it.bp || 0) || 0;
			const row = {
				item_name: it.name || "",
				description: it.description || it.name || "",
				qty: qty,
				uom: it.uom || "Nos",
				rate: rate,
				amount: qty * rate,
				spq_rate: buyingRate,
				spq_amount: qty * buyingRate,
				sales_stage: it.sales_stage,
				expected_date: it.expected_date || validTill,
				brand: (it.brand && it.brand !== "—") ? it.brand : "",
				opportunity_type: it.type === "renewal" ? "Renewal" :
					it.type === "additional" ? "Additional" : "New",
				renewal_id: it.renewId || "",
				commission_type: it.commission_type || "",
				rate_value: it.rate_value || 0,
				orc: it.is_orc ? 1 : 0,
				forecast: it.forecast || "",
			};
			if (it.code) row.item_code = it.code;
			return row;
		});

		const spEmail = (me.$content.find("#olFSpEmail").val() || "").trim();
		const spMobile = (me.$content.find("#olFSpPhone").val() || "").trim();
		if (salesTeam.length) {
			salesTeam[0].email_id = spEmail;
			salesTeam[0].mobile_no = spMobile;
			salesTeam[0].sales_person_email = spEmail;
			salesTeam[0].sales_person_mobile = spMobile;
		}

		const doc = {
			doctype: "Opportunity",
			opportunity_from: "Customer",
			party_name: partyName,
			title: subject,
			subject: subject,
			customer_name: me.$content.find("#olFCustomer").val(),
			status: me.$content.find("#olFStage").val() || "Open",
			opportunity_amount: me.wizardItems.reduce((s, it) => s + it.qty * it.sp * (1 - (it.discount || 0) / 100), 0),
			expected_closing: validTill,
			expected_date: validTill,
			opportunity_owner: frappe.session.user,
			remarks: me.$content.find("#olFDescription").val() || me.$content.find("#olFItemsDesc").val(),
			contact_person: primaryContact.docname,
			contact_email: primaryContact.email || "",
			contact_mobile: primaryContact.phone || "",
			contact_list: contactList,
			sales_team: salesTeam,
			items: items,
		};
		frappe.call({
			method: "frappe.client.insert",
			args: { doc },
			callback: (r) => {
				if (r.message) {
					me.hasFetched = false;
					frappe.show_alert({ message: "Opportunity created!", indicator: "green" });
					frappe.set_route("opp-list", r.message.name);
				}
			},
		});
	}
}


// ═════════════════════════════════════════════════════════════════
//  HTML TEMPLATES
// ═════════════════════════════════════════════════════════════════
frappe.opp_list_page_template = {

	detail: `
	<div class="ol-page">
		<div class="page-wrap">
 
			<!-- ← FIX 1: Breadcrumb with CRM / Opportunities / ID -->
			<div class="doctype-band" style="position:sticky;top:0;z-index:50;width:100%;display:flex;align-items:center;gap:14px;padding:16px 22px;margin-bottom:16px;border-radius:12px;background:linear-gradient(135deg,#3b7ef8 0%,#2563eb 100%);box-shadow:0 4px 14px rgba(59,126,248,0.25);">
				<div style="width:44px;height:44px;border-radius:11px;background:rgba(255,255,255,0.18);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
					<i class="ti ti-target-arrow" style="font-size:22px;color:#fff;"></i>
				</div>
				<div style="flex:1;min-width:0;">
					<div style="font-family:Syne,sans-serif;font-size:18px;font-weight:700;color:#fff;letter-spacing:-.01em;">Opportunity</div>
					<ol class="breadcrumb" style="background:transparent;padding:0;margin:2px 0 0;display:flex;align-items:center;">
						<li class="breadcrumb-item"><a href="javascript:void(0)" style="color:rgba(255,255,255,0.75);font-size:12px;">CRM</a></li>
						<li class="breadcrumb-item" style="padding-left:5px;"><a href="/app/opp-list" class="ol-back-btn" style="color:rgba(255,255,255,0.75);font-size:12px;">Opportunities</a></li>
						<li class="breadcrumb-item active" style="padding-left:5px;font-size:12px;color:#fff;font-weight:600;" id="olBreadcrumbId">—</li>
					</ol>
				</div>
			</div>
 
			<div class="top-split">
				<!-- LEFT -->
				<div class="top-left1">
					<!-- ← FIX 2: Subject (not Opportunity·ID), truncated with tooltip -->
					<div class="subject-label" id="olSubjectLabel"
						title=""
						style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:420px;cursor:default;">
						—
					</div>
					<div class="top-left-row1">
						<div class="customer-avatar">--</div>
						<div class="customer-info" id="olCustomerField" style="position:relative;">
							<div class="customer-name" id="olCustomerView" style="display:flex;align-items:center;gap:6px;">
								<a id="olCustomerLink" href="javascript:void(0)" style="color:inherit;text-decoration:none;cursor:pointer;word-break:break-word;">—</a>
								<i id="olCustomerEdit" class="ti ti-pencil" style="font-size:13px;color:#9ca3af;cursor:pointer;flex-shrink:0;" title="Change customer"></i>
							</div>
							<div id="olCustomerEditWrap" style="display:none;position:relative;">
								<input id="olCustomerInput" type="text" placeholder="Search customer…" autocomplete="off"
									style="width:100%;font-size:14px;padding:4px 8px;border:1px solid rgba(59,126,248,0.4);border-radius:6px;outline:none;">
								<div id="olCustomerDD" style="display:none;position:fixed;background:#fff;border:1px solid rgba(0,0,0,0.1);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.12);max-height:240px;overflow-y:auto;"></div>
							</div>
							<div class="customer-sub" id="olCustomerSub">Owner · —</div>
						</div>
						<!-- ← FIX 6: custom_status badge (set by injectDetailMeta) -->
						<span class="badge badge-warning" id="statusBadge"><i class="ti ti-circle-dot"></i> Open</span>
					</div>
					<div class="fin-grid">
						<div class="fin-card"><div class="fin-label">Selling Amt</div><div class="fin-value" id="olSellingAmt">₹0.00</div></div>
						<div class="fin-card"><div class="fin-label">Buying Amt</div><div class="fin-value" id="olBuyingAmt">₹0.00</div></div>
						<div class="fin-card"><div class="fin-label">Profit</div><div class="fin-value profit" id="olProfitAmt">₹0.00</div></div>
					</div>
				</div>
 
				<!-- RIGHT -->
				<div class="top-right1">
					<div class="top-actions-row">
						<div class="header-title">Opportunity Detail</div>
						<button class="icon-btn" id="olBtnEdit" title="Edit"><i class="ti ti-edit"></i></button>
						<button class="icon-btn" title="More"><i class="ti ti-dots"></i></button>
						<div class="vdivider"></div>
 
						<!-- ← FIX 4: Connections dropdown — filled by bindCreateDropdown() -->
						<div class="ol-dd-wrap" id="olConnWrap">
							<button class="btn btn-with-badge" id="olBtnConn" type="button">
								<i class="ti ti-link"></i> Connections
								<span class="btn-counter" id="olConnCount">0</span>
								<i class="ti ti-chevron-down" style="font-size:11px;margin-left:2px;"></i>
							</button>
							<div class="ol-dropdown ol-conn-dropdown" id="olConnDropdown"
			style="min-width:220px;padding:6px 0;">
								<div style="padding:6px 14px 4px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;">Linked Documents</div>
								<div id="olConnList"></div>
							</div>
						</div>
 
						<div class="vdivider"></div>
						<button class="btn"><i class="ti ti-phone-call"></i> Follow-up</button>
 
						<!-- ← FIX 5: Create dropdown — correct routes -->
						<div class="ol-dd-wrap" id="olCreateWrap">
							<button class="btn btn-primary" id="olBtnCreate" type="button">
								<i class="ti ti-plus"></i> Create
								<i class="ti ti-chevron-down" style="font-size:11px;margin-left:2px;"></i>
							</button>
							<div class="ol-dropdown ol-dropdown-right" id="olCreateDropdown">
								<div class="ol-dd-label">Create From Opportunity</div>
								<div class="ol-create-item" data-route="quote-list">
									<i class="ti ti-file-invoice"></i><span>Quotation</span>
								</div>
								<div class="ol-create-item" data-route="supplier-quotations">
									<i class="ti ti-building-store"></i><span>Supplier Quotation</span>
								</div>
								<div class="ol-create-item" data-route="orc-list">
									<i class="ti ti-list-details"></i><span>ORC List</span>
								</div>
								<div class="ol-create-item" data-route="renewal-list">
									<i class="ti ti-refresh"></i><span>Renewal List</span>
								</div>
							</div>
						</div>
					</div>
 
					<div style="display:grid;grid-template-columns:1fr 1fr;gap:0;position:relative;">
 
					<!-- Company -->
					<div style="padding:12px 16px 12px 0;border-right:1px solid rgba(0,0,0,0.06);">
						<div style="font-size:10px;font-weight:700;text-transform:uppercase;
							letter-spacing:.07em;color:#9ca3af;margin-bottom:5px;
							display:flex;align-items:center;gap:4px;">
							<i class="ti ti-building" style="font-size:11px;"></i>Company
						
						
					</div>
						<div style="position:relative;display:flex;align-items:center;gap:6px;justify-content:flex-start;">
							<a id="olCompanyOpen" href="#" target="_blank"
								style="display:none;order:2;flex-shrink:0;color:#3b7ef8;
									text-decoration:none;align-items:center;justify-content:center;"
								title="Open Company">
								<i class="ti ti-external-link" style="font-size:14px;"></i>
							</a>
							<input id="olCompanyInput" class="ol-meta-input"
								placeholder="Search company…" autocomplete="off"
								style="width:100%;border:none;border-bottom:1px dashed transparent;
									background:transparent;outline:none;
									font-size:14px;font-weight:500;color:#111827;
									line-height:1.3;transition:border-color .15s;cursor:default;
									white-space:normal;word-break:break-word;"
								onfocus="this.style.borderColor='#3b7ef8';this.style.cursor='text';"
								onblur="this.style.borderColor='transparent';this.style.cursor='default';">
							<div id="olCompanyDD"
								style="display:none;position:absolute;top:calc(100% + 4px);left:0;
									width:240px;max-height:200px;overflow-y:auto;
									background:#fff;border:1px solid rgba(0,0,0,0.1);
									border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.1);z-index:200;">
							</div>
						</div>
					</div>
 
					<!-- Salesperson -->
					<div style="padding:12px 0 12px 16px;">
						<div style="font-size:10px;font-weight:700;text-transform:uppercase;
							letter-spacing:.07em;color:#9ca3af;margin-bottom:5px;
							display:flex;align-items:center;gap:4px;">
							<i class="ti ti-user-check" style="font-size:11px;"></i> Sales Person
						</div>
						<input class="ol-meta-input" id="olSalesperson" placeholder="—"
							style="width:100%;border:none;border-bottom:1px dashed transparent;
								background:transparent;outline:none;
								font-size:14px;font-weight:500;color:#111827;
								line-height:1.3;transition:border-color .15s;cursor:default;"
							onfocus="this.style.borderColor='#3b7ef8';this.style.cursor='text';"
							onblur="this.style.borderColor='transparent';this.style.cursor='default';">
					</div>
 
					<!-- Save bar -->
					<div id="olDetailMetaSaveBar"
						style="display:none;grid-column:1/-1;align-items:center;
							justify-content:flex-end;gap:8px;padding-top:8px;
							border-top:1px solid rgba(0,0,0,0.06);margin-top:4px;">
						<button id="olDiscardMetaBtn" class="btn" type="button"
							style="height:28px;padding:0 12px;font-size:12px;">Discard</button>
						<button id="olSaveMetaBtn" class="btn btn-primary" type="button"
							style="height:28px;padding:0 14px;font-size:12px;
								background:#16a34a;border-color:#16a34a;
								display:flex;align-items:center;gap:5px;">
							<i class="ti ti-device-floppy" style="font-size:13px;"></i> Save Details
						</button>
					</div>
 
				</div><! --- opp grid-->	
				</div>
			</div>

			
			<!-- CONTACTS CARD -->
		<div class="card" style="padding:16px 18px;">
			<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
				<div style="display:flex;align-items:center;gap:8px;">
					<i class="ti ti-users" style="font-size:15px;color:#374151;"></i>
					<span style="font-size:13px;font-weight:700;color:#111827;">Contacts</span>
					<span id="olContactCount"
						style="background:#e5e7eb;color:#6b7280;font-size:10px;font-weight:700;
							padding:1px 7px;border-radius:10px;">0</span>
				</div>
				<button id="olAddContactDetailBtn" class="btn btn-primary" type="button"
					style="height:28px;padding:0 12px;font-size:12px;
						display:flex;align-items:center;gap:4px;">
					<i class="ti ti-plus" style="font-size:13px;"></i> Add Contact
				</button>
			</div>
			<div id="olDetailContactsList"
				style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;">
				<div style="font-size:12px;color:#9ca3af;padding:4px 0;">Loading…</div>
			</div>
		</div>
 
			<!-- ITEMS — action column sticky -->
			<div class="card">
				<div class="section-head">
					<div class="section-title">Opportunity Items</div>
					<div style="position:relative;" id="olDetailAddItemWrap">
						<button class="btn btn-primary" id="olDetailAddItemBtn" type="button">
							<i class="ti ti-plus"></i> Add Item
							<i class="ti ti-chevron-down" style="font-size:11px;margin-left:2px;"></i>
						</button>
						<div id="olDetailAddItemMenu" style="display:none;position:absolute;top:calc(100% + 6px);right:0;min-width:220px;z-index:500;background:#fff;border:1px solid rgba(0,0,0,0.1);border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,0.12);overflow:hidden;">
							<div class="ol-aim-item" data-detail-item-popup="new">
								<div class="ol-aim-icon" style="background:rgba(59,126,248,0.1);color:#3b7ef8;"><i class="ti ti-box"></i></div>
								<div><div class="ol-aim-label">New Item</div><div class="ol-aim-sub">From item catalogue</div></div>
							</div>
							<div style="height:1px;background:rgba(0,0,0,0.06);"></div>
							<div class="ol-aim-item" data-detail-item-popup="renewal">
								<div class="ol-aim-icon" style="background:rgba(22,163,74,0.1);color:#16a34a;"><i class="ti ti-refresh"></i></div>
								<div><div class="ol-aim-label">Renewal Item</div><div class="ol-aim-sub">From customer renewals</div></div>
							</div>
							<div class="ol-aim-item" data-detail-item-popup="additional">
								<div class="ol-aim-icon" style="background:rgba(217,119,6,0.12);color:#d97706;"><i class="ti ti-stack-2"></i></div>
								<div><div class="ol-aim-label">Additional Item</div><div class="ol-aim-sub">Add-on to existing</div></div>
							</div>
						</div>
					</div>
				</div>
 
				<!-- ← FIX 7: Wrapper uses position:relative so last col can be sticky -->
				<div style="border:1px solid rgba(0,0,0,0.08);border-radius:10px;overflow:hidden;">
					<div style="border:1px solid rgba(0,0,0,0.08);border-radius:10px;overflow:hidden;background:#f8fafc;">
						<div id="olItemsTableBody" style="max-height:460px;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:10px;">
							<div style="text-align:center;padding:36px;color:#9ca3af;font-size:12px;">
								<i class="ti ti-inbox" style="font-size:28px;display:block;margin-bottom:8px;"></i>
								No items yet. Click <strong>+ Add Item</strong> to get started.
							</div>
						</div>
					</div>
				</div>


				<!-- Items save bar — shown when items change -->
				<div id="olItemsSaveBar"
					style="display:none;align-items:center;justify-content:space-between;
						padding:8px 12px;border-top:1px solid rgba(0,0,0,0.06);background:#f0fdf4;">
					<span style="font-size:12px;color:#15803d;display:flex;align-items:center;gap:6px;">
						<i class="ti ti-pencil" style="font-size:13px;"></i> Items have unsaved changes
					</span>
					<div style="display:flex;gap:8px;">
						<button id="olDiscardItemsBtn" class="btn" type="button"
							style="height:28px;padding:0 12px;font-size:12px;">Discard</button>
						<button id="olSaveItemsBtn" class="btn btn-primary" type="button"
							style="height:28px;padding:0 14px;font-size:12px;
								background:#16a34a;border-color:#16a34a;display:flex;align-items:center;gap:5px;">
							<i class="ti ti-device-floppy" style="font-size:13px;"></i> Save Items
						</button>
					</div>
				</div>
 
				<div style="padding:12px 10px 4px;display:flex;align-items:center;gap:6px;border-top:1px solid rgba(0,0,0,0.08);">
					<span style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;">Total Qty</span>
					<span class="total-val" id="olItemsTotalQty" style="font-size:14px;font-weight:700;margin-left:4px;">0</span>
					<span style="margin-left:auto;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;">Total Amount</span>
					<span class="total-val" id="olItemsSellAmt" style="font-size:14px;font-weight:700;">₹0.00</span>
				</div>
			</div>
 
		
 
			<!-- ACTIVITY -->
		<div class="card">
 
			<!-- Row 1: "Activity" label + tabs side by side -->
			<div style="display:flex;align-items:center;gap:0;
				border-bottom:2px solid rgba(0,0,0,0.07);
				padding:0 16px;margin:0 -16px 0;">
 
				<!-- Title acts as the Activity tab -->
				<!-- <div class="act-tab active" data-tab="activity"
					style="font-size:14px;font-weight:700;color:#3b7ef8;
						padding:12px 16px 12px 0;white-space:nowrap;flex-shrink:0;cursor:pointer;
						border-right:1px solid rgba(0,0,0,0.08);margin-right:4px;
						border-bottom:2px solid #3b7ef8;margin-bottom:-2px;transition:all .15s;">
					Activity
				</div> -->
				<div class="act-tab active" data-tab="activity"
					style="font-size:14px;font-weight:700;padding:12px 16px 12px 0;white-space:nowrap;flex-shrink:0;cursor:pointer;border-right:1px solid rgba(0,0,0,0.08);margin-right:4px;margin-bottom:-2px;transition:all .15s;">
					Activity
				</div>
 
				<!-- Tabs -->
				<div id="actTabs"
					style="display:flex;gap:0;overflow-x:auto;scrollbar-width:none;flex:1;">
					<div class="act-tab" data-tab="notes"
						style="padding:12px 14px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;margin-bottom:-2px;transition:all .15s;flex-shrink:0;">Notes</div>
					<div class="act-tab" data-tab="calls"
						style="padding:12px 14px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;margin-bottom:-2px;transition:all .15s;flex-shrink:0;">Calls</div>
					<div class="act-tab" data-tab="appointments"
						style="padding:12px 14px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;margin-bottom:-2px;transition:all .15s;flex-shrink:0;">Appointments</div>
					<div class="act-tab" data-tab="comments"
						style="padding:12px 14px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;margin-bottom:-2px;transition:all .15s;flex-shrink:0;">Comments</div>
					<div class="act-tab" data-tab="tasks"
						style="padding:12px 14px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;margin-bottom:-2px;transition:all .15s;flex-shrink:0;">Tasks</div>
					<div class="act-tab" data-tab="attachments"
						style="padding:12px 14px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;margin-bottom:-2px;transition:all .15s;flex-shrink:0;">Attachments</div>
				</div>
			</div>
 
			<!-- Row 2: Filter pills — hidden on attachments tab -->
			<div id="actFilter"
				style="display:flex;gap:6px;padding:8px 16px;
					border-bottom:1px solid rgba(0,0,0,0.05);">
				<div class="act-filter active" data-filter="scheduled"
					style="padding:3px 12px;font-size:11px;font-weight:600;border-radius:20px;
						background:#f1f5f9;color:#6b7280;cursor:pointer;
						border:1px solid rgba(59,126,248,0.2);">Scheduled</div>
				<div class="act-filter" data-filter="completed"
					style="padding:3px 12px;font-size:11px;font-weight:600;border-radius:20px;
						background:#f1f5f9;color:#6b7280;cursor:pointer;
						border:1px solid rgba(0,0,0,0.08);">Completed</div>
				
				<div class="act-filter" data-filter="all"
					style="padding:3px 12px;font-size:11px;font-weight:600;border-radius:20px;
						background:#f1f5f9;color:#6b7280;cursor:pointer;
						border:1px solid rgba(0,0,0,0.08);">All</div>		
			</div>
 
			<!-- Activity list -->
			<div id="activityList">
				<div style="padding:20px;text-align:center;color:#9ca3af;font-size:12px;">
					No activities yet
				</div>
			</div>
 
			<!-- Attachments panel -->
			<div id="attachmentsPanel" class="attachments-panel hidden">
 
				<!-- Description + Upload -->
				<div style="padding:12px 16px;border-bottom:1px solid rgba(0,0,0,0.06);">
					<div class="act-field" style="margin-bottom:10px;">
						<label class="act-field-label">Description (what is this attachment?)</label>
						<input id="olAttDescription" type="text" class="act-input"
							placeholder="e.g. Purchase Order, Product Brochure, Contract">
					</div>
					<div id="olAttUploadZone"
						style="border:2px dashed rgba(0,0,0,0.12);border-radius:10px;
							padding:20px;text-align:center;cursor:pointer;
							transition:all .15s;background:#fafafa;"
						onmouseenter="this.style.borderColor='#3b7ef8';this.style.background='rgba(59,126,248,0.03)';"
						onmouseleave="this.style.borderColor='rgba(0,0,0,0.12)';this.style.background='#fafafa';">
						<i class="ti ti-cloud-upload"
							style="font-size:26px;color:#9ca3af;display:block;margin-bottom:5px;"></i>
						<div style="font-size:13px;font-weight:600;color:#374151;">Click to upload</div>
						<div style="font-size:11px;color:#9ca3af;margin-top:2px;">PDF, DOCX, XLSX, PNG, JPG</div>
					</div>
				</div>
 
				<!-- File list -->
				<div id="olAttFileList"
					style="padding:8px 16px 12px;display:flex;flex-direction:column;gap:6px;">
				</div>
			</div>
 
			<div id="actBottom" class="act-bottom"></div>
 
			<!-- Notes input -->
			<div id="inputNotes" class="act-input-area hidden">
				<textarea id="noteText" class="act-textarea" placeholder="Write a note…"></textarea>
				<div class="act-input-actions">
					<button class="btn btn-primary" type="button" data-action="save-note">
						<i class="ti ti-check"></i> Save Note
					</button>
					<button class="btn" type="button" data-close-tab="notes">Cancel</button>
				</div>
			</div>
 
			<!-- Calls input -->
			<div id="inputCalls" class="act-input-area hidden">
				<div style="padding:14px 16px;border-bottom:1px solid rgba(0,0,0,0.06);">
 
					<!-- Subject: full width -->
					<div class="act-field" style="margin-bottom:12px;">
						<label class="act-field-label">Subject</label>
						<input id="callSubject" type="text" class="act-input"
							placeholder="e.g. Follow-up call regarding renewal">
					</div>
 
					<!-- Date/Time row -->
					<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">
						<div class="act-field">
							<label class="act-field-label">Start Date</label>
							<input id="callStartDate" type="date" class="act-input">
						</div>
						<div class="act-field">
							<label class="act-field-label">Start Time</label>
							<input id="callStartTime" type="time" class="act-input">
						</div>
						<div class="act-field">
							<label class="act-field-label">End Date</label>
							<input id="callEndDate" type="date" class="act-input">
						</div>
						<div class="act-field">
							<label class="act-field-label">End Time</label>
							<input id="callEndTime" type="time" class="act-input">
						</div>
					</div>
					<div class="ol-field" style="margin-top:10px;">
	<label class="ol-field-label">Status</label>
	<select class="ol-field-input" id="callStatus">
		<option value="Scheduled">Scheduled</option>
		<option value="Held">Held</option>
		<option value="Not Responding">Not Responding</option>
		<option value="Cancelled">Cancelled</option>
	</select>
</div>
<div class="ol-field" style="margin-top:10px;">
	<label class="ol-field-label">Description</label>
	<textarea class="ol-field-input" id="callDescription" rows="3" placeholder="Call notes / summary…" style="resize:vertical;"></textarea>
</div>
 
					<!-- Auto-filled info (read-only display) -->
					<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:4px;">
						<div class="act-field">
							<label class="act-field-label">Related To (Customer)</label>
							<input id="callRelatedTo" type="text" class="act-input"
								readonly
								style="background:#f8fafc;color:#6b7280;cursor:default;">
						</div>
						<div class="act-field">
							<label class="act-field-label">Sales Team</label>
							<input id="callSalesTeam" type="text" class="act-input"
								readonly
								style="background:#f8fafc;color:#6b7280;cursor:default;">
						</div>
					</div>
 
				</div>
				<div class="act-input-actions">
					<button class="btn btn-primary" type="button" data-action="save-call">
						<i class="ti ti-check"></i> Log Call
					</button>
					<button class="btn" type="button" data-close-tab="calls">Cancel</button>
				</div>
			</div>
 
			
			<!-- Appointments input -->
			<div id="inputAppointments" class="act-input-area hidden">
				<div style="padding:14px 16px;border-bottom:1px solid rgba(0,0,0,0.06);">
 
					<!-- Subject: full width -->
					<div class="act-field" style="margin-bottom:12px;">
						<label class="act-field-label">Subject <span style="color:#dc2626;">*</span></label>
						<input id="apptSubject" type="text" class="act-input"
							placeholder="e.g. Product demo, Renewal discussion">
					</div>
 
					<!-- Scheduled Time: full width -->
					<div class="act-field" style="margin-bottom:12px;">
						<label class="act-field-label">Scheduled Time <span style="color:#dc2626;">*</span></label>
						<input id="apptScheduledTime" type="datetime-local" class="act-input">
					</div>
 
					<!-- Auto-filled customer info (readonly) -->
					<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
						<div class="act-field">
							<label class="act-field-label">Customer</label>
							<input id="apptCustomerName" type="text" class="act-input"
								readonly style="background:#f8fafc;color:#6b7280;cursor:default;">
						</div>
						<div class="act-field">
							<label class="act-field-label">Phone</label>
							<input id="apptCustomerPhone" type="text" class="act-input"
								placeholder="Phone number">
						</div>
						<div class="act-field" style="grid-column:1/-1;">
							<label class="act-field-label">Email</label>
							<input id="apptCustomerEmail" type="email" class="act-input"
								placeholder="customer@email.com">
						</div>
						<!-- Participants (Table MultiSelect → Multiselect Users) -->
<div class="ol-field" style="margin-top:10px;">
	<label class="ol-field-label">Participants</label>
	<div id="apptPartWrap" style="position:relative;">
	<div id="apptPartChips" style="margin-top:8px;display:flex;flex-wrap:wrap;"></div>
		<div id="apptPartTrigger" style="border:1px solid rgba(0,0,0,0.12);border-radius:8px;padding:8px 12px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;background:#fff;">
			<span id="apptPartLabel" style="font-size:12px;color:#9ca3af;">Select participants…</span>
			<i class="ti ti-chevron-down" style="font-size:13px;color:#9ca3af;"></i>
		</div>
		<div id="apptPartMenu" style="display:none;position:absolute;top:calc(100% + 4px);left:0;right:0;max-height:220px;overflow-y:auto;background:#fff;border:1px solid rgba(0,0,0,0.1);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.12);z-index:600;padding:6px;"></div>
	</div>
</div>

<!-- Details / Description (customer_details, Long Text) -->
<div class="ol-field" style="margin-top:10px;">
	<label class="ol-field-label">Details</label>
	<textarea class="ol-field-input" id="apptDetails" rows="3" placeholder="Appointment details / agenda…" style="resize:vertical;"></textarea>
</div>
					</div>
 
				</div>
				<div class="act-input-actions">
					<button class="btn btn-primary" type="button" data-action="save-appointment">
						<i class="ti ti-check"></i> Schedule
					</button>
					<button class="btn" type="button" data-close-tab="appointments">Cancel</button>
				</div>
			</div>

			<!-- Task input -->
				<div id="inputTasks" class="act-input-area hidden">
					<div style="padding:14px 16px;border-bottom:1px solid rgba(0,0,0,0.06);">
						<div class="act-field" style="margin-bottom:12px;">
							<label class="act-field-label">Subject</label>
							<input id="taskSubject" type="text" class="act-input" placeholder="e.g. Send proposal to client">
						</div>
						<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">
							<div class="act-field">
								<label class="act-field-label">Priority</label>
								<select id="taskPriority" class="act-input">
									<option value="Low">Low</option>
									<option value="Medium" selected>Medium</option>
									<option value="High">High</option>
								</select>
							</div>
							<div class="act-field">
								<label class="act-field-label">Expected End Date</label>
								<input id="taskEndDate" type="datetime-local" class="act-input">
							</div>
						</div>
						<div class="act-field" style="margin-bottom:12px;">
							<label class="act-field-label">Assign To</label>
							<div id="taskAssignWrap" style="position:relative;">
								<button type="button" id="taskAssignTrigger" class="act-input" style="text-align:left;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:6px;">
									<span id="taskAssignLabel" style="color:#9ca3af;">Select users…</span><i class="ti ti-chevron-down" style="font-size:13px;color:#9ca3af;"></i>
								</button>
								<div id="taskAssignMenu" style="display:none;position:absolute;top:calc(100% + 4px);left:0;width:100%;max-height:220px;overflow-y:auto;background:#fff;border:1px solid rgba(0,0,0,0.1);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.12);z-index:300;padding:4px;"></div>
								<div id="taskAssignChips" style="margin-top:8px;display:flex;flex-wrap:wrap;"></div>
							</div>
						</div>
						<div class="act-field">
							<label class="act-field-label">Description</label>
							<div id="taskDescHost"></div>
						</div>
					</div>
					<div class="act-input-actions">
						<button class="btn btn-primary" type="button" data-action="save-task"><i class="ti ti-check"></i> Save Task</button>
						<button class="btn" type="button" data-close-tab="tasks">Cancel</button>
					</div>
				</div>


 
			<!-- Comments input -->
			<div id="inputComments" class="act-input-area hidden">
				<div class="rel-wrap">
					<textarea id="commentText" class="act-textarea"
						placeholder="Write a comment… type @ to mention someone"></textarea>
					<div id="mentionDropdown" class="mention-dropdown hidden">
						<div class="mention-item" data-mention="You">
							<div class="mention-avatar">YO</div>
							<div><div class="mention-name">You</div><div class="mention-role">Current User</div></div>
						</div>
					</div>
				</div>
				<div class="act-input-actions">
					<button class="btn btn-primary" type="button" data-action="save-comment">
						<i class="ti ti-check"></i> Post Comment
					</button>
					<button class="btn" type="button" data-close-tab="comments">Cancel</button>
				</div>
			</div>
 
		</div>`,

	newForm: `
	<div class="ol-page">
		<div class="page-wrap">

			<ol class="breadcrumb" style="background:transparent;padding:0;margin-bottom:16px;">
				<li class="breadcrumb-item"><a href="javascript:void(0)">CRM</a></li>
				<li class="breadcrumb-item" style="padding-left:5px;"><a href="/app/opp-list" class="ol-back-btn">Opportunities</a></li>
				<li class="breadcrumb-item" style="padding-left:5px;">New Opportunity</li>
			</ol>

			<!-- Progress bar -->
			<div style="margin-bottom:20px;">
				<div style="height:4px;background:rgba(0,0,0,0.08);border-radius:2px;overflow:hidden;">
					<div id="olProgressFill" style="height:100%;width:25%;background:#3b7ef8;border-radius:2px;transition:width 0.4s ease;"></div>
				</div>
			</div>

			<!-- 4-step stepper -->
			<div style="display:flex;align-items:flex-start;margin-bottom:28px;">
				<div class="ol-step active" data-step="1" style="display:flex;flex-direction:column;align-items:center;flex:1;position:relative;cursor:pointer;">
					<div class="ol-step-circle" id="olSC1">1</div>
					<div class="ol-step-label">Info</div>
				</div>
				<div class="ol-step" data-step="2" style="display:flex;flex-direction:column;align-items:center;flex:1;position:relative;cursor:pointer;">
					<div class="ol-step-circle" id="olSC2">2</div>
					<div class="ol-step-label">Contacts</div>
				</div>
				<div class="ol-step" data-step="3" style="display:flex;flex-direction:column;align-items:center;flex:1;position:relative;cursor:pointer;">
					<div class="ol-step-circle" id="olSC3">3</div>
					<div class="ol-step-label">Items</div>
				</div>
				<div class="ol-step" data-step="4" style="display:flex;flex-direction:column;align-items:center;flex:1;position:relative;cursor:pointer;">
					<div class="ol-step-circle" id="olSC4">4</div>
					<div class="ol-step-label">Summary</div>
				</div>
			</div>

			<!-- ══ STEP 1: INFO ══ -->
			<div class="ol-wiz-panel active" id="olPanel1">
				<div class="card">
					<div class="card-title">Opportunity Information</div>
					<div class="card-subtitle">Fill in the core details of this opportunity.</div>

					<!-- Subject: full width -->
					<div class="ol-field" style="margin-bottom:20px;">
						<label class="ol-field-label">Subject <span class="ol-req">*</span></label>
						<input class="ol-field-input" id="olFSubject"
							placeholder="e.g. Network Security Renewal – Q3 2025"
							style="font-size:15px;height:44px;letter-spacing:-.01em;">
					</div>

					<!-- 2-column link fields -->
					<div class="ol-wiz-grid" style="margin-bottom:20px;">

						<!-- Customer — live search against Customer doctype -->
						<div class="ol-field">
							<label class="ol-field-label">Customer <span class="ol-req">*</span></label>
							<div class="ol-link-wrap">
								<input class="ol-field-input" id="olFCustomer"
									placeholder="Search Customer…" autocomplete="off">
								<i class="ti ti-building-store ol-link-icon"></i>
								<div class="ol-link-dd" id="olCustDD"></div>
							</div>
						</div>

						<!-- Company — live search against Company doctype -->
						<div class="ol-field">
							<label class="ol-field-label">Company <span class="ol-req">*</span></label>
							<div class="ol-link-wrap">
								<input class="ol-field-input" id="olFCompany"
									placeholder="Search Company…" autocomplete="off">
								<i class="ti ti-building ol-link-icon"></i>
								<div class="ol-link-dd" id="olCompanyDD"></div>
							</div>
						</div>

					</div>

					<!-- Sales Person — link field + contact-card preview below -->
					<div class="ol-section-divider" style="margin-bottom:14px;">
						<span class="ol-section-divider-label">Sales Person</span>
						<div class="ol-section-divider-line"></div>
					</div>

					<!--<div class="ol-field" style="margin-bottom:12px;">
						<label class="ol-field-label">Sales Person <span class="ol-req">*</span></label>
						<div class="ol-link-wrap">
							<input class="ol-field-input" id="olFSalesperson"
								placeholder="Search Sales Person…" autocomplete="off">
							<i class="ti ti-user-check ol-link-icon"></i>
							<div class="ol-link-dd" id="olSpDD"></div>
						</div>
					</div> -->

					<!-- Salesperson card — shown after pick, hidden until then -->
					<div id="olSpCard" style="display:none;background:#fff;border:1px solid rgba(0,0,0,0.09);border-radius:14px;padding:14px 18px;display:none;align-items:center;gap:14px;box-shadow:0 1px 6px rgba(0,0,0,0.06);margin-bottom:4px;">
						<div id="olSpCardAv" style="width:42px;height:42px;border-radius:50%;background:rgba(59,126,248,0.12);border:2px solid rgba(59,126,248,0.25);display:flex;align-items:center;justify-content:center;font-family:Syne,sans-serif;font-size:16px;font-weight:700;color:#3b7ef8;flex-shrink:0;">—</div>
						<div style="flex:1;min-width:0;">
							<div id="olSpCardName" style="font-family:Syne,sans-serif;font-size:14px;font-weight:600;color:#111827;"></div>
							<div id="olSpCardEmail" style="display:none;align-items:center;gap:6px;margin-top:4px;font-size:12px;color:#3b7ef8;">
								<i class="ti ti-mail" style="font-size:13px;color:#9ca3af;"></i><span></span>
							</div>
							<div id="olSpCardPhone" style="display:none;align-items:center;gap:6px;margin-top:3px;font-size:12px;color:#374151;">
								<i class="ti ti-device-mobile" style="font-size:13px;color:#9ca3af;"></i><span></span>
							</div>
						</div>
						<button id="olSpCardClear" style="width:24px;height:24px;border-radius:50%;border:1px solid rgba(0,0,0,0.08);background:transparent;color:#9ca3af;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0;" title="Clear">
							<i class="ti ti-x"></i>
						</button>
					</div>

					<!-- hidden inputs to store SP detail -->
					<input type="hidden" id="olFSpName">
					<input type="hidden" id="olFSpEmail">
					<input type="hidden" id="olFSpPhone">

				</div>
				<div class="ol-wiz-footer">
					<button class="btn ol-back-btn" type="button"><i class="ti ti-arrow-left"></i> Cancel</button>
					<button class="btn btn-primary" data-wiz-next="2" type="button">Next: Contacts <i class="ti ti-arrow-right"></i></button>
				</div>
			</div>

			<!-- ══ STEP 2: CONTACTS ══ -->
			<div class="ol-wiz-panel" id="olPanel2">
				<div class="card">
					<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
						<div>
							<div class="card-title" id="olContactsHeading" style="margin-bottom:0;">Customer Contacts</div>
							<div class="card-subtitle" style="margin-top:2px;margin-bottom:0;">Add contacts linked to the selected customer. You can also add contacts manually.</div>
						</div>
						<button class="btn btn-primary" id="olAddContactBtn" type="button" style="white-space:nowrap;flex-shrink:0;">
							<i class="ti ti-user-plus"></i> Add Contact
						</button>
					</div>

					<!-- No contacts from ERPNext notice -->
					<div id="olNoContactsMsg" style="display:none;background:rgba(217,119,6,0.07);border:1px solid rgba(217,119,6,0.18);border-radius:8px;padding:10px 14px;font-size:12px;color:#d97706;margin:12px 0 0;">
						<i class="ti ti-alert-triangle" style="margin-right:5px;"></i>
						No linked contacts found for this customer. Use <strong>Add Contact → Add Manually</strong>.
					</div>

					<!-- Contact cards grid -->
					<div id="olContactCardsWrap" style="display:flex;flex-direction:column;gap:10px;margin-top:16px;"></div>
				</div>
				<div class="ol-wiz-footer">
					<button class="btn" data-wiz-back="1" type="button"><i class="ti ti-arrow-left"></i> Back</button>
					<button class="btn btn-primary" data-wiz-next="3" type="button">Next: Items <i class="ti ti-arrow-right"></i></button>
				</div>
			</div>

			<!-- ══ STEP 3: ITEMS ══ -->
			<div class="ol-wiz-panel" id="olPanel3">
				<div class="card">
					<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
						<div>
							<div class="card-title" style="margin-bottom:0;">Opportunity Items</div>
							<div class="card-subtitle" style="margin-top:2px;margin-bottom:0;">Add products from your ERPNext item catalogue.</div>
						</div>
						<div style="position:relative;" id="olAddItemWrap">
							<button class="btn btn-primary" id="olAddItemBtn" type="button">
								<i class="ti ti-plus"></i> Add Item <i class="ti ti-chevron-down" style="font-size:11px;margin-left:2px;"></i>
							</button>
							<div id="olAddItemMenu" style="display:none;position:absolute;top:calc(100% + 6px);right:0;min-width:250px;z-index:500;background:#fff;border:1px solid rgba(0,0,0,0.1);border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,0.12);overflow:hidden;">
								<div class="ol-aim-item" data-item-popup="new">
									<div class="ol-aim-icon" style="background:rgba(59,126,248,0.1);color:#3b7ef8;"><i class="ti ti-box"></i></div>
									<div><div class="ol-aim-label">New Item</div><div class="ol-aim-sub">Search from ERPNext item catalogue</div></div>
								</div>
								<div style="height:1px;background:rgba(0,0,0,0.06);"></div>
								<div class="ol-aim-item" data-item-popup="renewal">
									<div class="ol-aim-icon" style="background:rgba(22,163,74,0.1);color:#16a34a;"><i class="ti ti-refresh"></i></div>
									<div><div class="ol-aim-label">Renewal Item</div><div class="ol-aim-sub">From customer active renewals</div></div>
								</div>
								<div class="ol-aim-item" data-item-popup="additional">
									<div class="ol-aim-icon" style="background:rgba(217,119,6,0.12);color:#d97706;"><i class="ti ti-stack-2"></i></div>
									<div><div class="ol-aim-label">Additional Item</div><div class="ol-aim-sub">Add-on to existing subscription</div></div>
								</div>
							</div>
						</div>
					</div>

					<!-- Items table: fixed colgroup, dual scroll -->
					<div style="border:1px solid rgba(0,0,0,0.08);border-radius:10px;overflow:hidden;background:#f8fafc;">
	<div id="olItemsTbody" style="max-height:460px;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:10px;">
		<div class="ol-items-empty" style="text-align:center;padding:36px;color:#9ca3af;font-size:12px;">
			<i class="ti ti-inbox" style="font-size:28px;display:block;margin-bottom:8px;"></i>
			No items added yet. Click <strong>+ Add Item</strong> to get started.
		</div>
	</div>
</div>

					<!-- FIX 4: Summary — Qty + Amount only, no buying -->
					<div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px;padding-top:12px;border-top:1px solid rgba(0,0,0,0.08);">
						<div style="display:flex;align-items:center;gap:16px;">
							<span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;">Total Qty</span>
							<span id="olSumQtyLabel" style="font-family:Syne,sans-serif;font-size:20px;font-weight:700;color:#111827;">0</span>
						</div>
						<div style="text-align:right;">
							<div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;margin-bottom:4px;">Total Amount</div>
							<div id="olSumGrand" style="font-family:Syne,sans-serif;font-size:22px;font-weight:700;color:#3b7ef8;">₹ 0.00</div>
							<div id="olSumSell" style="font-size:11px;color:#6b7280;margin-top:2px;display:none;"></div>
						</div>
					</div>
				</div>

				<!-- Attachments -->
				<div class="card">
					<div class="card-title">Attachments</div>
					<div class="card-subtitle">Upload PO copy, docs, or supporting files.</div>
					<label style="border:2px dashed rgba(0,0,0,0.14);border-radius:14px;padding:28px;display:flex;flex-direction:column;align-items:center;gap:8px;cursor:pointer;background:#f7f8fa;text-align:center;transition:0.18s ease;" id="olUploadZone">
						<i class="ti ti-cloud-upload" style="font-size:32px;color:#9ca3af;"></i>
						<p style="font-size:13px;color:#6b7280;font-weight:500;margin:0;">Click to upload or drag & drop</p>
						<span style="font-size:11px;color:#9ca3af;">PDF, DOCX, XLSX, PNG up to 10MB</span>
						<input type="file" id="olFileInput" style="display:none;" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg">
					</label>
					<div id="olAttPreview" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px;"></div>
				</div>

				<div class="ol-wiz-footer">
					<button class="btn" data-wiz-back="2" type="button"><i class="ti ti-arrow-left"></i> Back</button>
					<button class="btn btn-primary" data-wiz-next="4" type="button">Review & Submit <i class="ti ti-arrow-right"></i></button>
				</div>
			</div>

			<!-- ══ STEP 4: SUMMARY ══ -->
			<div class="ol-wiz-panel" id="olPanel4">
				<div class="card">
					<div class="card-title">Review & Submit</div>
					<div class="card-subtitle">Review all details before submitting.</div>
					<div id="olReviewContent" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:8px;"></div>
				</div>
				<div class="ol-wiz-footer">
					<button class="btn" data-wiz-back="3" type="button"><i class="ti ti-arrow-left"></i> Back</button>
					<div style="display:flex;gap:8px;">
						<!--<button class="btn" id="olSaveDraft" type="button"><i class="ti ti-device-floppy"></i> Save Draft</button> -->
						<button class="btn btn-primary" id="olSubmitForm" type="button" style="background:#16a34a;border-color:transparent;"><i class="ti ti-send"></i> Save Opportunity</button>
					</div>
				</div>
			</div>

		</div>
	</div>`,
};