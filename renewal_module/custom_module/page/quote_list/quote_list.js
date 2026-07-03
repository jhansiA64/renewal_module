frappe.pages['quote-list'].on_page_load = function (wrapper) {
	new QuoteListPage(wrapper);
};

frappe.pages['quote-list'].on_page_show = function (wrapper) {

	if (!frappe._qlFilterPopoverCleanup) {
	frappe._qlFilterPopoverCleanup = true;
		const sweep = () => {
			$("body > .popover.filter-popover, body > .popover.show").remove();
			try { $("#qlOpenFilters, #sqOpenFilters, #olOpenFilters").popover("dispose"); } catch (e) {}
		};
		if (frappe.router && frappe.router.on) frappe.router.on("change", sweep);
		$(window).on("popstate.filterSweep", sweep);
	}
	// Capture route_options NOW, before Frappe clears it
	const _routeOpp = (frappe.route_options && frappe.route_options.opportunity) || null;
	if (_routeOpp) frappe.route_options = null;   // consume it

	const pageWrapper = wrapper || $(".page")[0] || document.body;
	$("body").attr("data-route", "quote-list");
	ensureQuoteListAssets();

	const ensureSupportLayoutLoaded = (cb) => {
		if (typeof loadSupportLayout === "function") return cb();
		frappe.require(["/assets/renewal_module/js/issue_themes/support_layout2.js"], () => {
			setTimeout(cb, 10);
		});
		frappe.require(["/assets/renewal_module/css/issue_themes/support_theme2.css"]);
	};

	ensureSupportLayoutLoaded(() => {
		loadSupportLayout(pageWrapper, () => {
			if (!frappe.quote_list_page || frappe.quote_list_page.wrapper !== pageWrapper) {
				frappe.quote_list_page = new QuoteListPage(pageWrapper);
			}
			// hand the captured filter to the instance as a standard advanced filter (+ persist to URL)
			if (_routeOpp) {
				const sf = frappe.quote_list_page.saved_filters || [];
				const hasOpp = sf.some(f => Array.isArray(f) && f[1] === "opportunity");
				if (!hasOpp) sf.push(["Quotation", "opportunity", "=", _routeOpp]);
				frappe.quote_list_page.saved_filters = sf;
				try {
					const u = new URL(window.location.href);
					u.searchParams.set("opportunity", _routeOpp);
					window.history.replaceState({}, "", u);
				} catch (e) {}
			}
			frappe.quote_list_page.render();
		});
	});
};

function ensureQuoteListAssets() {
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


// ═══════════════════════════════════════════════════════════
//  QuoteListPage
// ═══════════════════════════════════════════════════════════
class QuoteListPage {
	constructor(wrapper) {
		this.wrapper = wrapper;
		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: "",
			single_column: true,
		});

		// ── List state ──────────────────────────────────────
		this.hasFetched = false;
		this.hasFetchedOwners = false;
		this.isLoading = false;
		this.statusFilter = "";
		this.selectedCustomers = [];
		this.selectedOwners = [];
		this.ownerOptions = [];
		this.saved_filters = [];
		this.filterDoctype = "Quotation";
		this.activeFilterPopoverButton = null;
		this.amountSortDir = "";
		this.pageSize = 20;
		this.pageStep = 20;
		this.records = [];

		// ── Detail state ─────────────────────────────────────
		this.selectedRecord = null;
		this.detailRecord = null;
		this.detailActivities = [];
		this.detailAttachments = [];
		this.isLoadingDetail = false;
		this.detailItems = [];
		this.activeTab = "notes";
		this.activeFilter = "scheduled";

		this.tabConfig = {
			notes: { label: "+ Add Note", icon: "ti-notes", inputId: "inputNotes" },
			calls: { label: "+ Log Call", icon: "ti-phone", inputId: "inputCalls" },
			tasks: { label: "+ Add Task", icon: "ti-checklist", inputId: "inputTasks" },
			appointments: { label: "+ Appointment", icon: "ti-calendar-event", inputId: "inputAppointments" },
			comments: { label: "+ Comment", icon: "ti-message-circle", inputId: "inputComments" },
			attachments: { label: null, icon: null, inputId: null },
		};
	}

	// ─── RENDER ENTRY ─────────────────────────────────────
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

	loadDataAndRender(routeName = "") {
		// pick up opportunity — from Connections (route_options) or the URL — as a standard advanced filter
		const ro = frappe.route_options || {};
		const urlOpp = new URLSearchParams(window.location.search).get("opportunity") || "";
		const incomingOpp = ro.opportunity || urlOpp || "";
		if (ro.opportunity) { frappe.route_options = null; this._writeOppToUrl(incomingOpp); }
		if (incomingOpp) {
			this.saved_filters = this.saved_filters || [];
			if (!this.saved_filters.some(f => Array.isArray(f) && f[1] === "opportunity")) {
				this.saved_filters.push(["Quotation", "opportunity", "=", incomingOpp]);
			}
		}

		if (this.isLoading) return;
		this.isLoading = true;
		this.renderListLoading();

		Promise.all([this.fetchRecords(), this.fetchOwnerOptions()])
			.then(() => {
				if (routeName === "new") {
					this.selectedRecord = null;
					this.detailRecord = null;
					return this.renderNewView();
				}
				if (routeName && routeName !== "new") {
					this.selectedRecord = this.records.find((r) => r.id === routeName) || null;
					this.detailRecord = null;
				} else {
					this.selectedRecord = null;
					this.detailRecord = null;
				}
				if (this.selectedRecord) return this.renderDetailView();
				this.applyUrlFilters();
				this.renderListView();
			})
			.finally(() => { this.isLoading = false; });
	}

	_refetchAndRender() {
		this.renderListLoading();
		this.fetchRecords().then(() => this.renderListView());
	}


	_writeOppToUrl(oppId) {
		try {
			const url = new URL(window.location.href);
			if (oppId) url.searchParams.set("opportunity", oppId);
			else url.searchParams.delete("opportunity");
			window.history.replaceState({}, "", url);
		} catch (e) { /* no-op */ }
	}

	// ─── DATA FETCH ───────────────────────────────────────
	fetchOwnerOptions() {
		if (this.hasFetchedOwners) return Promise.resolve();
		return new Promise((resolve) => {
			frappe.call({
				method: "frappe.client.get_list",
				args: {
					doctype: "User",
					fields: ["name", "full_name"],
					filters: { enabled: 1 },
					limit_page_length: 2000,
					order_by: "full_name asc",
				},
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
		// advanced filters → server. Build a signature so we only refetch when they change.
		const serverFilters = this._buildServerFilters();
		const sig = JSON.stringify(serverFilters);
		if (this.hasFetched && this._lastFilterSig === sig) return Promise.resolve();
		this._lastFilterSig = sig;

		const callGetList = (limitStart, limitPageLength) => new Promise((resolve, reject) => {
			frappe.call({
				method: "frappe.client.get_list",
				args: {
					doctype: "Quotation",
					fields: [
						"name", "status", "subject", "custom_status",
						"party_name", "customer_name",
						"owner", "grand_total",
						"transaction_date", "valid_till",
						"opportunity",
					],
					filters: serverFilters,
					limit_start: limitStart,
					limit_page_length: limitPageLength,
					order_by: "modified desc",
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
				subject: doc.name,
				party: doc.customer_name || doc.party_name || "-",
				status: doc.status || "Draft",
				amount: Number(doc.grand_total || 0),
				owner: doc.owner || "-",
				creation: this.formatDate(doc.transaction_date),
				valid_till: doc.valid_till ? this.formatDate(doc.valid_till) : "—",
				opportunity: doc.opportunity || "",
			}));
			this.hasFetched = true;
		}).catch(() => { this.records = []; });
	}

	// Convert saved_filters (FilterGroup output) into get_list-ready filter arrays.
	_buildServerFilters() {
		const out = [];
		(this.saved_filters || []).forEach((f) => {
			// FilterGroup emits ["Quotation", fieldname, operator, value]
			if (Array.isArray(f) && f.length >= 4) {
				out.push([f[0], f[1], f[2], f[3]]);
			} else if (Array.isArray(f) && f.length === 3) {
				out.push(["Quotation", f[0], f[1], f[2]]);
			}
		});
		return out;
	}

	fetchDetailRecord(recordId) {
		return new Promise((resolve) => {
			frappe.call({
				method: "frappe.client.get",
				args: { doctype: "Quotation", name: recordId },
				callback: (r) => { this.detailRecord = (r && r.message) || null; resolve(this.detailRecord); },
				error: () => { this.detailRecord = null; resolve(null); },
			});
		});
	}

	fetchDetailActivities(recordId) {
		return new Promise((resolve) => {
			Promise.all([
				// Notes — CRM Note rows on Quotation.notes (added_by / added_on)
				new Promise(res => {
					const oppName = this.detailRecord?.name || recordId;
					if (!oppName) { res([]); return; }
					frappe.call({
						method: "renewal_module.custom_module.page.quote_list.quote_list.get_crm_notes",
						args: { parent: oppName, parenttype: "Quotation" },
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

				// Comments — Comment doctype, type "Comment" only
				new Promise(res => frappe.call({
					method: "frappe.client.get_list",
					args: {
						doctype: "Comment",
						fields: ["name", "content", "comment_type", "owner", "creation"],
						filters: [
							["Comment", "reference_doctype", "=", "Quotation"],
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
						status: "completed", meta: "",
					}))),
					error: () => res([]),
				})),

				// Call List
				new Promise(res => frappe.call({
					method: "frappe.client.get_list",
					args: {
						doctype: "Call List",
						fields: ["name", "owner", "creation"],
						filters: [
							["Call List", "reference", "=", "Quotation"],
							["Call List", "reference_to", "=", recordId],
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
									? `${c.start_date}${c.start_timing ? " " + c.start_timing : ""}` : "",
							})));
						});
					},
					error: () => res([]),
				})),

				// Appointment
				new Promise(res => frappe.call({
					method: "frappe.client.get_list",
					args: {
						doctype: "Appointment",
						fields: ["name", "owner", "creation"],
						filters: [
							["Appointment", "reference", "=", "Quotation"],
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
					error: () => res([]),
				})),

				// Task
				new Promise(res => frappe.call({
					method: "frappe.client.get_list",
					args: {
						doctype: "Task",
						fields: ["name", "owner", "creation"],
						filters: [
							["Task", "reference", "=", "Quotation"],
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
									id: c.name, title: c.subject || c.name,
									type: "Task", tab: "tasks", owner: c.owner || "",
									created: this.formatActivityTime(c.creation),
									status: (endDay && endDay >= today) ? "scheduled" : "completed",
									meta: [c.priority, c.exp_end_date ? this.formatDate(c.exp_end_date) : ""].filter(Boolean).join(" · "),
								};
							}));
						});
					},
					error: () => res([]),
				})),
			]).then(([notes, comments, calls, appointments, tasks]) => {
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
						attached_to_doctype: "Quotation",
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
						description: "",
					}));
					this.detailAttachments = files;
					if (!files.length) { resolve(files); return; }

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
							(rc.message || []).forEach(c => { descMap[c.reference_name] = c.content || ""; });
							this.detailAttachments.forEach(f => { f.description = descMap[f.id] || ""; });
							resolve(this.detailAttachments);
						},
						error: () => resolve(this.detailAttachments),
					});
				},
				error: () => { this.detailAttachments = []; resolve([]); },
			});
		});
	}

	// ─── HELPERS ──────────────────────────────────────────
	formatActivityTime(timestamp) {
		if (!timestamp) return "Just now";
		try {
			const created = frappe.datetime ? frappe.datetime.str_to_obj(timestamp) : new Date(timestamp);
			if (!created) return "Just now";
			const s = Math.floor((Date.now() - created.getTime()) / 1000);
			const m = Math.floor(s / 60), h = Math.floor(m / 60), d = Math.floor(h / 24);
			if (s < 60) return "Just now";
			if (m < 60) return `${m}m ago`;
			if (h < 24) return `${h}h ago`;
			if (d < 7) return `${d}d ago`;
			return created.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
		} catch (e) { return "Just now"; }
	}

	formatDate(value) {
		if (!value) return "—";
		try {
			const d = frappe.datetime ? frappe.datetime.str_to_obj(value) : new Date(value);
			if (!d) return "—";
			return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
		} catch (e) { return "—"; }
	}

	formatCurrency(value) {
		return `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
	}

	_stripHtml(html) {
		if (!html) return "";
		const tmp = document.createElement("div");
		tmp.innerHTML = String(html);
		return (tmp.textContent || tmp.innerText || "").trim();
	}

	_htmlToText(html) {
		if (!html) return "";
		let s = String(html).replace(/<br\s*\/?>/gi, "\n");
		const tmp = document.createElement("div");
		tmp.innerHTML = s;
		return (tmp.textContent || tmp.innerText || "").trim();
	}

	getStatusClass(status) {
		return {
			"Draft": "ql-status-draft",
			"Open": "ql-status-open",
			"Replied": "ql-status-replied",
			"Ordered": "ql-status-ordered",
			"Lost": "ql-status-lost",
			"Cancelled": "ql-status-cancelled",
			"Expired": "ql-status-expired",
		}[status] || "ql-status-draft";
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

	// ─── LIST LOADING PLACEHOLDER ─────────────────────────
	renderListLoading() {
		this.page.set_title("Quotations");
		document.title = "Quotations";
		$("#support-page-content").removeClass("ql-content-scroll").addClass("ql-content-fixed");
		this.$content.html(`<div class="ql-list-view"><div class="card ql-list-card"><div class="ql-loading">Loading quotations...</div></div></div>`);
	}

	// ─── LIST VIEW ────────────────────────────────────────
	renderListView() {
		this.page.set_title("Quotations");
		document.title = "Quotations";
		$("#support-page-content").removeClass("ql-content-scroll").addClass("ql-content-fixed");

		const customerOptions = Array.from(new Set(this.records.map((r) => String(r.party || "").trim()).filter((n) => n && n !== "-"))).sort();
		const ownerOptions = this.ownerOptions.length
			? this.ownerOptions
			: Array.from(new Set(this.records.map((r) => String(r.owner || "").trim()).filter(Boolean))).sort().map((o) => ({ value: o, label: o }));
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
			<tr class="ql-list-row" data-name="${row.id}">
				<td class="ql-cell-id-subject">
					<div class="ql-cell-subject" title="${safeSubject}" style="color:#3b7ef8;font-weight:600;cursor:pointer;">${safeSubject}</div>
					<div class="ql-cell-id" title="${safeSubject}">${safeSubject}</div>
				</td>
				<td><span class="ql-customer-text" title="${safeParty}">${safeParty}</span></td>
				<td><span class="ql-status ${this.getStatusClass(row.custom_status)}">${row.custom_status}</span></td>
				<td class="ql-cell-amt">${this.formatCurrency(row.amount)}</td>
				<td class="ql-cell-owner" title="${safeOwner}">${safeOwner}</td>
				<td class="ql-cell-dates">
					<div class="ql-date-txn"   title="Transaction Date">${row.creation}</div>
					<div class="ql-date-valid"  title="Valid Till">${row.valid_till}</div>
				</td>
			</tr>`;
		}).join("");

		this.$content.html(`
		<div class="ql-list-view">
			<div class="card ql-list-card">
				<div class="ql-list-toolbar">
					${this.renderMultiFilter("customer", customerOptions.map((c) => ({ value: c, label: c })), this.selectedCustomers, "Customer")}
					${this.renderMultiFilter("owner", ownerOptions, this.selectedOwners, "Owner")}
					<select id="qlStatusFilter" class="ql-input ql-select">
						${statusOptions.map((s) => `<option value="${s}" ${this.statusFilter === s ? "selected" : ""}>${s || "Status"}</option>`).join("")}
					</select>
					
					<div class="ql-list-toolbar-right">
						<div class="ql-filter-wrap">
							<button id="qlOpenFilters" class="btn ql-filter-trigger" type="button" style="white-space:nowrap;padding:0;overflow:hidden;">
								<span class="ql-filter-btn-label" style="display:inline-flex;align-items:center;gap:6px;padding:7px 12px;"><i class="ti ti-filter"></i> Filters${appliedCount ? ` (${appliedCount})` : ""}</span>
								<span class="ql-filter-btn-close" style="display:none;align-items:center;justify-content:center;min-width:28px;padding:7px 10px;border-left:1px solid rgba(15,23,42,0.12);cursor:pointer;">×</span>
							</button>
						</div>
						<button id="qlClearFilters" class="btn" type="button"><i class="ti ti-filter-off"></i> Clear</button>
						<button id="qlNewDoc" class="btn btn-primary" type="button"><i class="ti ti-plus"></i> New Quotation</button>
					</div>
				</div>

				<div class="table-wrap ql-list-table-wrap">
					<table class="ql-list-table">
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
								<th>Quotation</th>
								<th>Customer</th>
								<th>Status</th>
								<th id="qlSortAmount" class="ql-sortable ${this.amountSortDir ? "ql-sort-active" : ""}">
									Grand Total <i class="ti ${amountSortIcon}"></i>
								</th>
								<th>Owner</th>
								<th>Date / Valid Till</th>
							</tr>
						</thead>
						<tbody>
							${tableRows || '<tr><td colspan="6" class="ql-empty">No records found</td></tr>'}
						</tbody>
					</table>
				</div>

				<div class="ql-list-footer">
					<div class="page-size-btns">
						${[20, 100, 500, 2500].map((s) => `<button class="ps-btn ${this.pageSize === s ? "active" : ""}" data-size="${s}" type="button">${s}</button>`).join("")}
					</div>
					<div class="record-count">${visibleRows.length} of ${rows.length}</div>
					<button id="qlLoadMore" class="load-more-btn" type="button" ${visibleRows.length >= rows.length ? "disabled" : ""}>Load More</button>
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
		<div class="ql-multi-wrap">
			<div class="ql-multi" data-filter="${key}">
				<button type="button" class="ql-multi-trigger" data-filter-trigger="${key}">
					<span>${this.escapeAttr(triggerText)}</span><i class="ti ti-chevron-down"></i>
				</button>
				<div class="ql-multi-menu" data-filter-menu="${key}">
					<div class="ql-multi-search-wrap">
						<input type="text" class="ql-multi-search" data-filter-search="${key}" placeholder="Search ${placeholder.toLowerCase()}..."/>
					</div>
					<div class="ql-multi-options">
						${sortedOptions.map((opt) => {
			const value = String(opt.value || "").trim();
			const label = String(opt.label || value).trim();
			if (!value) return "";
			return `
							<label class="ql-multi-option" data-filter-option="${key}" data-label="${this.escapeAttr(label.toLowerCase())}">
								<input type="checkbox" class="ql-multi-checkbox" data-filter-check="${key}" value="${this.escapeAttr(value)}" ${selectedSet.has(value) ? "checked" : ""}>
								<span>${this.escapeAttr(label)}</span>
							</label>`;
		}).join("")}
					</div>
				</div>
			</div>
		</div>`;
	}

	// ─── FILTER POPOVER ───────────────────────────────────
	closeStandardFilterPopover(button) {
		const candidates = [];
		if (button) candidates.push($(button));
		if (this.activeFilterPopoverButton?.length) candidates.push(this.activeFilterPopoverButton);
		candidates.push(this.$content ? this.$content.find("#qlOpenFilters") : $("#qlOpenFilters"));
		candidates.forEach(($btn) => {
			if (!$btn?.length) return;
			try { $btn.popover("hide"); } catch (e) { }
			try { $btn.popover("dispose"); } catch (e) { }
			$btn.find(".ql-filter-btn-close").css("display", "none");
		});
		$("body > .popover.filter-popover, body > .popover.show").remove();
		this.activeFilterPopoverButton = null;
		$(document).off("mousedown.qlStandardFilter");
	}

	openStandardFilterPopover(button) {
		const me = this;
		const DOCTYPE = this.filterDoctype || "Quotation";
		const $btn = $(button);

		if (this.activeFilterPopoverButton?.length && this.activeFilterPopoverButton[0] !== $btn[0]) {
			this.closeStandardFilterPopover(this.activeFilterPopoverButton);
		}

		const setFilterButtonState = (isOpen) => $btn.find(".ql-filter-btn-close").css("display", isOpen ? "inline-flex" : "none");
		const safeClose = () => { me.closeStandardFilterPopover($btn); setFilterButtonState(false); };

		const isAlreadyOpen = $btn.find(".ql-filter-btn-close").css("display") !== "none";
		if (isAlreadyOpen) { safeClose(); return; }

		frappe.model.with_doctype(DOCTYPE, () => {
			if (!$btn.length || !document.body.contains($btn[0])) return;
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
			footer.find(".ql-std-btn").css({ height: "26px", padding: "0 9px", borderRadius: "8px", fontSize: "11px", fontWeight: "600", boxShadow: "none" });
			footer.find(".ql-std-btn-add").css({ background: "#f8fafc", color: "#334155", border: "1px solid rgba(15,23,42,0.14)" });
			footer.find(".ql-std-btn-clear").css({ background: "#fff", color: "#0f172a", border: "1px solid rgba(15,23,42,0.2)", marginRight: "0" });
			footer.find(".ql-std-btn-apply").css({ background: "#2f6fe5", color: "#fff", border: "1px solid #2f6fe5" });
			footer.find(".add-filter").on("click", () => FG.add_filter(DOCTYPE, "name", "=", "", false));
			footer.find(".clear-filters").on("click", () => { FG.clear_filters(); me.saved_filters = []; me.pageSize = 20; safeClose(); me._refetchAndRender(); });
			footer.find(".apply-filters").on("click", () => { me.saved_filters = FG.get_filters() || []; me.pageSize = 20; safeClose(); me._refetchAndRender(); });


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
				}
			} catch (err) { safeClose(); return; }

			$(document).off("mousedown.qlStandardFilter").on("mousedown.qlStandardFilter", (e) => {
				if (!$(e.target).closest(".popover, .filter-popover, #qlOpenFilters").length) safeClose();
			});
		});
	}

	// ─── FILTER LOGIC ─────────────────────────────────────
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

	// ─── FILTER LOGIC ─────────────────────────────────────
	getFilteredRows() {
		const sc = new Set(this.selectedCustomers), so = new Set(this.selectedOwners);
		const filtered = this.records.filter((row) => {
			if (this.statusFilter && row.status !== this.statusFilter) return false;
			if (sc.size && !sc.has(String(row.party || ""))) return false;
			if (so.size && !so.has(String(row.owner || ""))) return false;
			return true;
		});
		if (!this.amountSortDir) return filtered;
		return filtered.sort((a, b) => { const d = Number(a.amount) - Number(b.amount); return this.amountSortDir === "asc" ? d : -d; });
	}

	getFilterFieldValue(row, field) {
		if (field === "name" || field === "id") return row.id;
		if (field === "customer_name" || field === "party_name") return row.party;
		if (field === "custom_status") return row.custom_status;
		if (field === "owner") return row.owner;
		if (field === "grand_total" || field === "amount") return row.amount;
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
		const isAmt = field === "amount" || field === "grand_total";
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

	// ─── LIST BINDINGS ────────────────────────────────────
	bindListActions() {
		this.$content
			.off("click.ql", "[data-filter-trigger]")
			.on("click.ql", "[data-filter-trigger]", (e) => {
				e.preventDefault(); e.stopPropagation();
				const key = String($(e.currentTarget).data("filterTrigger") || "");
				const $menu = this.$content.find(`[data-filter-menu='${key}']`);
				const open = !$menu.hasClass("open");
				this.$content.find("[data-filter-menu]").removeClass("open");
				if (open) $menu.addClass("open");
			});

		this.$content
			.off("change.ql", ".ql-multi-checkbox")
			.on("change.ql", ".ql-multi-checkbox", (e) => {
				const key = String($(e.currentTarget).data("filterCheck") || "");
				const values = this.$content.find(`.ql-multi-checkbox[data-filter-check='${key}']:checked`).map((_, el) => String(el.value || "").trim()).get().filter(Boolean);
				if (key === "customer") this.selectedCustomers = values;
				if (key === "owner") this.selectedOwners = values;
				this.pageSize = 20; this.renderListView();
			});

		this.$content
			.off("input.ql", ".ql-multi-search")
			.on("input.ql", ".ql-multi-search", (e) => {
				const key = String($(e.currentTarget).data("filterSearch") || "");
				const query = String($(e.currentTarget).val() || "").trim().toLowerCase();
				this.$content.find(`[data-filter-option='${key}']`).each((_, item) => $(item).toggle(!query || String($(item).data("label") || "").toLowerCase().includes(query)));
			});

		this.$content
			.off("click.ql", "#qlOpenFilters .ql-filter-btn-close")
			.on("click.ql", "#qlOpenFilters .ql-filter-btn-close", (e) => { e.preventDefault(); e.stopPropagation(); this.closeStandardFilterPopover(this.$content.find("#qlOpenFilters")); });

		this.$content
			.off("click.ql", "#qlOpenFilters")
			.on("click.ql", "#qlOpenFilters", (e) => {
				e.preventDefault(); e.stopPropagation();
				if ($(e.target).closest(".ql-filter-btn-close").length) { this.closeStandardFilterPopover(e.currentTarget); return; }
				this.openStandardFilterPopover(e.currentTarget);
			});

		this.$content
			.off("change.ql", "#qlStatusFilter")
			.on("change.ql", "#qlStatusFilter", (e) => { this.statusFilter = String($(e.currentTarget).val() || "").trim(); this.renderListView(); });

		this.$content
			.off("click.ql", "#qlClearFilters")
			.on("click.ql", "#qlClearFilters", () => { this.selectedCustomers = []; this.selectedOwners = []; this.statusFilter = ""; this.saved_filters = []; this._writeOppToUrl(""); this.pageSize = 20; this._refetchAndRender(); });

		this.$content
			.off("click.ql", "#qlSortAmount")
			.on("click.ql", "#qlSortAmount", (e) => { e.preventDefault(); this.amountSortDir = !this.amountSortDir ? "asc" : this.amountSortDir === "asc" ? "desc" : ""; this.renderListView(); });

		this.$content
			.off("click.ql", ".ps-btn")
			.on("click.ql", ".ps-btn", (e) => { const s = Number($(e.currentTarget).data("size") || 20); if (!Number.isFinite(s) || s <= 0) return; this.pageSize = s; this.renderListView(); });

		this.$content
			.off("click.ql", "#qlLoadMore")
			.on("click.ql", "#qlLoadMore", () => { this.pageSize += this.pageStep; this.renderListView(); });

		this.$content
			.off("click.ql", "#qlNewDoc")
			.on("click.ql", "#qlNewDoc", () => frappe.set_route("quote-list", "new"));

		this.$content
			.off("click.ql", ".ql-list-row")
			.on("click.ql", ".ql-list-row", (e) => {
				const name = String($(e.currentTarget).data("name") || "");
				const selected = this.records.find((r) => r.id === name);
				if (!selected) return;
				this.selectedRecord = selected;
				frappe.set_route("quote-list", name);
			});

		$(document).off("click.qlListFilters").on("click.qlListFilters", (e) => {
			if (!$(e.target).closest(".ql-multi").length) this.$content.find("[data-filter-menu]").removeClass("open");
		});
	}

	// ─── DETAIL VIEW ──────────────────────────────────────
	renderDetailView() {
		if (!this.selectedRecord) { this.$content.html('<div style="padding:20px;text-align:center;">Record not found</div>'); return; }
		if (this.isLoadingDetail) return;
		this.isLoadingDetail = true;
		$("#support-page-content").removeClass("ql-content-fixed").addClass("ql-content-scroll");

		this.$content.html('<div style="padding:40px;text-align:center;"><div class="spinner-border" role="status"></div><p style="margin-top:15px;">Loading...</p></div>');

		this.fetchDetailRecord(this.selectedRecord.id)
			.then(() => Promise.all([
				this.fetchDetailActivities(this.selectedRecord.id),
				this.fetchDetailAttachments(this.selectedRecord.id),
			]))
			.then(() => {
				this.$content.empty().html(frappe.quote_list_page_template.detail);
				this.injectDetailHeader();
				this.injectDetailMeta();
				this.injectDetailContacts(this.detailRecord || {});
				this.injectDetailAddress();
				this.injectDetailItems();
				this.injectConnections();
				this.injectDetailFinancials();
				this.injectDetailActivities();
				this.injectDetailAttachments();
				this.setPageTitle();
				this.bindActivityFilters();
				this.bindDetailActions();
			})
			.then(() => {
				const fixHeights = () => {
					["support-layout", "support-layout-row", "support-sidebar", "support-main", "support-page-content"].forEach(id => {
						const el = document.getElementById(id);
						if (!el) return;
						el.style.height = "auto"; el.style.minHeight = "unset"; el.style.alignSelf = "flex-start";
					});
				};
				fixHeights(); setTimeout(fixHeights, 100);
			})
			.finally(() => { this.isLoadingDetail = false; });
	}

	injectDetailHeader() {
		if (!this.selectedRecord) return;
		const record = this.detailRecord || this.selectedRecord;
		const customerName = record.customer_name || record.party_name || this.selectedRecord.party || "-";
		const status = record.status || this.selectedRecord.status || "Draft";
		const isDraft = Number(record.docstatus || 0) === 0;
		this.$content.find("#qlBtnSubmit").toggle(isDraft);



		const isSubmitted = Number(record.docstatus || 0) === 1;
		// submitted-only: Create + Connections + PDF
		this.$content.find("#qlBtnCreate").toggle(isSubmitted);
		this.$content.find("#qlConnectionsCard").toggle(isSubmitted);
		// draft-only: Submit button + item delete + desc edit
		this.$content.find("#qlBtnSubmit").toggle(!isSubmitted);

		this.$content.find("#qlBreadcrumbId").text(record.name || this.selectedRecord.id);
		this.$content.find("#qlSubjectLabel").text(record.name || this.selectedRecord.id).attr("title", record.name || "");
		this.$content.find(".customer-avatar").text(this.getCustomerAvatarText(customerName)).attr("title", customerName);
		this._bindDetailCustomerField(record.party_name || customerName, record.customer_name || customerName);
		this.$content.find(".customer-sub").text(`Owner · ${record.owner || this.selectedRecord.owner}`);
		this.$content.find("#statusBadge").html(`<i class="ti ti-circle-dot"></i> ${status}`);

		// ── custom_status: Draft / Quote Sent / Confirmed ──
		const cstatus = record.custom_status || "Draft";
		const isConfirmed = (cstatus === "Confirmed") || (Number(record.docstatus || 0) === 1);

		// PDF visible on Quote Sent + Confirmed (hidden on Draft)
		this.$content.find("#qlBtnPdf").toggle(cstatus === "Quote Sent" || isConfirmed);

		// Submit visible only while not yet confirmed
		this.$content.find("#qlBtnSubmit").toggle(!isConfirmed);

		// status badge reflects custom_status
		this.$content.find("#statusBadge").html(`<i class="ti ti-circle-dot"></i> ${this.escapeAttr(cstatus)}`);

		// status dropdown (Draft ↔ Quote Sent) while not confirmed; read-only once confirmed
		this.renderStatusDropdown(cstatus, isConfirmed);



	}


	renderStatusDropdown(cstatus, isConfirmed) {
		const me = this;
		const $row = me.$content.find(".top-actions-row");
		if (!$row.length) return;
		me.$content.find("#qlStatusSelectWrap").remove();

		if (isConfirmed) return;   // confirmed → no dropdown, badge shows "Confirmed"

		const opts = ["Draft", "Quote Sent"];
		const html = `
			<div id="qlStatusSelectWrap" style="display:inline-flex;align-items:center;gap:6px;">
				<select id="qlStatusSelect" style="height:28px;border:1px solid rgba(0,0,0,0.14);border-radius:8px;padding:0 10px;font-size:13px;color:#111827;background:#fff;cursor:pointer;outline:none;">
					${opts.map(o => `<option value="${o}" ${o === cstatus ? "selected" : ""}>${o}</option>`).join("")}
				</select>
			</div>`;

		// place it just before the PDF button (or at the start of the actions row)
		const $pdf = me.$content.find("#qlBtnPdf");
		if ($pdf.length) $pdf.before(html);
		else $row.prepend(html);
	}




	injectDetailMeta() {
		const record = this.detailRecord || this.selectedRecord;
		if (!record) return;

		// Row 1: Opportunity ID (clickable link) | Salesperson
		const opp = record.opportunity || "";
		if (opp) {
			this.$content.find("#qlMetaOpp").html(
				`<a href="javascript:void(0)" class="ql-link-opp" data-opp="${this.escapeAttr(opp)}"
					style="color:#3b7ef8;text-decoration:none;font-weight:600;">${this.escapeAttr(opp)}</a>`
			);
			this.$content.on("click.qlMeta", ".ql-link-opp", (e) => {
				frappe.set_route("opp-list", $(e.currentTarget).data("opp"));
			});
		} else {
			this.$content.find("#qlMetaOpp").text("—");
		}

		// Salesperson — try multiple field names ERPNext uses
		const sp = record.sales_person_name
			|| record.sales_person
			|| (Array.isArray(record.sales_team) && record.sales_team.length
				? record.sales_team[0].sales_person_name || record.sales_team[0].sales_person
				: "")
			|| "";
		this.$content.find("#qlMetaSalesperson").text(sp || "—");

		// Row 2: Transaction Date | Valid Till
		this.$content.find("#qlMetaTxnDate").text(this.formatDate(record.transaction_date));
		this.$content.find("#qlMetaValidTill").text(this.formatDate(record.valid_till));

		// Row 3: Company full-width
		// Row 3: Company — editable live-search input + open link
		const companyVal = record.company || "";
		this.$content.find("#qlMetaCompanyInput").val(companyVal);
		this._bindDetailCompanySearch();
		const $companyOpen = this.$content.find("#qlCompanyOpen");
		if (companyVal) {
			$companyOpen.attr("href", "/app/company/" + encodeURIComponent(companyVal))
				.attr("title", "Open " + companyVal)
				.css("display", "inline-flex");
		} else {
			$companyOpen.css("display", "none");
		}
	}


	_bindDetailCompanySearch() {
		const me = this;

		const runSearch = () => {
			const $input = me.$content.find("#qlMetaCompanyInput");
			const $dd = me.$content.find("#qlMetaCompanyDD");
			const q = ($input.val() || "").trim();
			$dd.css({ width: $input.outerWidth() + "px" })
				.html(`<div style="padding:10px 12px;font-size:12px;color:#9ca3af;"><i class="ti ti-loader" style="margin-right:6px;"></i>Searching…</div>`)
				.show();
			if (me._dCompanyTimer) clearTimeout(me._dCompanyTimer);
			me._dCompanyTimer = setTimeout(() => {
				const filters = q ? [["Company", "name", "like", `%${q}%`]] : [];
				frappe.call({
					method: "frappe.client.get_list",
					args: { doctype: "Company", fields: ["name"], filters, limit_page_length: 12, order_by: "name asc" },
					callback: (r) => {
						const rows = r.message || [];
						if (!rows.length) {
							$dd.html(`<div style="padding:12px;text-align:center;font-size:12px;color:#9ca3af;"><i class="ti ti-search-off"></i> No Company found</div>`);
							return;
						}
						$dd.html(rows.map(row => `
							<div class="ql-dcompany-item" data-label="${me.escapeAttr(row.name)}" style="display:flex;align-items:center;gap:10px;padding:9px 12px;cursor:pointer;transition:0.12s;">
								<div style="width:28px;height:28px;border-radius:50%;background:rgba(59,126,248,0.12);color:#3b7ef8;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="ti ti-building" style="font-size:13px;"></i></div>
								<div style="font-size:12px;font-weight:500;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${me.escapeAttr(row.name)}</div>
							</div>`).join(""));
						$dd.find(".ql-dcompany-item")
							.on("mouseenter", function () { $(this).css("background", "rgba(59,126,248,0.06)"); })
							.on("mouseleave", function () { $(this).css("background", ""); });
					},
				});
			}, 250);
		};

		me.$content.off("input.qlDCompany focus.qlDCompany", "#qlMetaCompanyInput")
			.on("input.qlDCompany focus.qlDCompany", "#qlMetaCompanyInput", runSearch);

		me.$content.off("mousedown.qlDCompany", ".ql-dcompany-item")
			.on("mousedown.qlDCompany", ".ql-dcompany-item", (e) => {
				e.preventDefault();
				const company = String($(e.currentTarget).data("label") || "");
				me.$content.find("#qlMetaCompanyInput").val(company);
				me.$content.find("#qlMetaCompanyDD").hide().empty();
				const $companyOpen = me.$content.find("#qlCompanyOpen");
				$companyOpen.attr("href", "/app/company/" + encodeURIComponent(company))
					.attr("title", "Open " + company)
					.css("display", "inline-flex");
				me._saveDetailCompany(company);
			});

		$(document).off("click.qlDCompanyDoc").on("click.qlDCompanyDoc", (ev) => {
			if (!$(ev.target).closest("#qlMetaCompanyInput, #qlMetaCompanyDD").length)
				me.$content.find("#qlMetaCompanyDD").hide();
		});
	}

	_saveDetailCompany(company) {
		const me = this;
		const record = me.detailRecord || {};
		if (!record.name) return;
		frappe.call({
			method: "frappe.client.get",
			args: { doctype: "Quotation", name: record.name },
			callback: (r) => {
				const doc = r.message;
				if (!doc) return;
				doc.company = company;
				frappe.call({
					method: "frappe.client.save",
					args: { doc },
					callback: (r2) => {
						if (r2.message) {
							me.detailRecord = r2.message;
							frappe.show_alert({ message: "Company updated.", indicator: "green" });
						}
					},
					error: () => frappe.show_alert({ message: "Failed to update company.", indicator: "red" }),
				});
			},
		});
	}


	_bindDetailCustomerField(custDocname, custDisplay) {
	const me = this;
	const $view = this.$content.find(".customer-name");
	if (!$view.length) return;

	const disp = String(custDisplay || custDocname || "").trim();
	const dn   = String(custDocname || "").trim();
	const linkHref = dn ? `/app/customers/${encodeURIComponent(dn)}` : "javascript:void(0)";
	const pencil = `<i id="qlCustEdit" class="ti ti-pencil" style="font-size:13px;color:#9ca3af;cursor:pointer;flex-shrink:0;margin-left:6px;" title="Change customer"></i>`;

	$view.css({ display: "flex", alignItems: "center", gap: "6px", position: "relative" }).html(
		`<a id="qlCustLink" href="${linkHref}" title="${me.escapeAttr(disp || "—")}" style="color:inherit;text-decoration:none;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;">${me.escapeAttr(disp || "—")}</a>`
		+ pencil
		+ `<div id="qlCustEditWrap" style="display:none;position:absolute;top:0;left:0;right:0;z-index:50;">
				<input id="qlCustInput" type="text" placeholder="Search customer…" autocomplete="off"
					style="width:100%;font-size:14px;padding:4px 8px;border:1px solid rgba(59,126,248,0.4);border-radius:6px;outline:none;background:#fff;">
				<div id="qlCustDD" style="display:none;position:fixed;background:#fff;border:1px solid rgba(0,0,0,0.1);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.12);max-height:240px;overflow-y:auto;z-index:9999;"></div>
			</div>`
	);

	const $input    = $view.find("#qlCustInput");
	const $dd       = $view.find("#qlCustDD");
	const $editWrap = $view.find("#qlCustEditWrap");
	const $link     = $view.find("#qlCustLink");
	let timer = null;

	const positionDD = () => {
		const rect = $input[0].getBoundingClientRect();
		$dd.css({ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 220) });
	};

	// click name → open customer record
	$view.off("click.qlCustLink", "#qlCustLink").on("click.qlCustLink", "#qlCustLink", (e) => {
		const href = $link.attr("href");
		if (href && href !== "javascript:void(0)") { e.preventDefault(); window.location.href = href; }
	});

	// pencil → edit mode
	$view.off("click.qlCustEdit", "#qlCustEdit").on("click.qlCustEdit", "#qlCustEdit", () => {
		$link.hide(); $view.find("#qlCustEdit").hide();
		$editWrap.show();
		$input.val("").focus();
	});

	// live search
	$input.off("input.qlCust focus.qlCust").on("input.qlCust focus.qlCust", function () {
		const q = ($input.val() || "").trim();
		clearTimeout(timer);
		timer = setTimeout(() => {
			frappe.call({
				method: "frappe.client.get_list",
				args: {
					doctype: "Customer",
					fields: ["name", "customer_name"],
					filters: q ? [["Customer", "customer_name", "like", `%${q}%`]] : [],
					limit_page_length: 10,
					order_by: "customer_name asc",
				},
				callback: (r) => {
					const rows = r.message || [];
					if (!rows.length) { $dd.hide(); return; }
					$dd.html(rows.map(row => `
						<div class="ql-cust-opt" data-docname="${me.escapeAttr(row.name)}" data-label="${me.escapeAttr(row.customer_name || row.name)}"
							style="padding:9px 12px;cursor:pointer;font-size:13px;color:#111827;border-bottom:1px solid rgba(0,0,0,0.05);display:flex;align-items:center;gap:8px;">
							<i class="ti ti-building-store" style="font-size:12px;color:#9ca3af;flex-shrink:0;"></i>
							<span>${me.escapeAttr(row.customer_name || row.name)}</span>
						</div>`).join(""));
					positionDD();
					$dd.css("display", "block");
				}
			});
		}, 220);
	});

	$dd.off("mouseenter mouseleave", ".ql-cust-opt")
		.on("mouseenter", ".ql-cust-opt", function () { $(this).css("background", "rgba(59,126,248,0.06)"); })
		.on("mouseleave", ".ql-cust-opt", function () { $(this).css("background", ""); });

	// pick → save
	$dd.off("mousedown.qlCust", ".ql-cust-opt").on("mousedown.qlCust", ".ql-cust-opt", function (e) {
		e.preventDefault();
		const newCust  = $(this).data("docname");
		const newLabel = $(this).data("label");
		$dd.hide();
		me._saveDetailCustomerLink(newCust, newLabel);
	});

	// click outside → cancel back to view
	$(document).off("click.qlCustDD").on("click.qlCustDD", (e) => {
		if (!$(e.target).closest(".customer-name").length) {
			$dd.hide(); $editWrap.hide();
			$link.show(); $view.find("#qlCustEdit").show();
		}
	});
}

_saveDetailCustomerLink(newCust, newLabel) {
	const me = this;
	const record = me.detailRecord || me.selectedRecord;
	if (!record?.name || !newCust) return;

	frappe.call({
		method: "frappe.client.get",
		args: { doctype: "Quotation", name: record.name },
		callback: (r) => {
			const doc = r.message;
			if (!doc) return;
			doc.party_name    = newCust;
			doc.customer_name = newLabel || newCust;
			// clear contacts — user re-selects manually for the new customer
			doc.contact_person  = "";
			doc.contact_email   = "";
			doc.contact_mobile  = "";
			doc.contact_display = "";
			if (Array.isArray(doc.contact_list)) doc.contact_list = [];
			frappe.call({
				method: "frappe.client.save",
				args: { doc },
				callback: (r2) => {
					if (r2.message) {
						me.detailRecord = r2.message;
						me._detailContacts = [];
						me._detailPrimaryIdx = 0;
						me._bindDetailCustomerField(r2.message.party_name, r2.message.customer_name);
						if (typeof me.injectDetailContacts === "function") me.injectDetailContacts(r2.message);
						frappe.show_alert({ message: "Customer updated. Add contacts manually.", indicator: "green" });
					}
				},
				error: () => frappe.show_alert({ message: "Failed to update customer.", indicator: "red" }),
			});
		},
	});
}

	injectDetailFinancials() {
		const record = this.detailRecord || {};
		const toNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
		const netTotal = toNum(record.net_total || record.total);
		const taxTotal = toNum(record.total_taxes_and_charges);
		const grandTotal = toNum(record.grand_total || record.rounded_total);
		const discount = toNum(record.discount_amount);

		this.$content.find("#qlNetTotal").text(this.formatCurrency(netTotal));

		this.$content.find("#qlTaxTotal").text(this.formatCurrency(taxTotal));
		this.$content.find("#qlGrandTotal").text(this.formatCurrency(grandTotal));
		this.$content.find("#qlDiscount").text(discount ? this.formatCurrency(discount) : "—");
	}


	injectDetailFinancialsSummary() {
		const me = this;
		const record = this.detailRecord || {};
		const toNum = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
		const fmt = n => me.formatCurrency(n);

		const subtotal = toNum(record.net_total || record.total);
		const tax = toNum(record.total_taxes_and_charges);
		const grand = toNum(record.grand_total || record.rounded_total);

		this.$content.find("#qlSumSubtotal").text(fmt(subtotal));
		this.$content.find("#qlSumTax").text(fmt(tax));
		this.$content.find("#qlSumGrandTotal").text(fmt(grand));
	}



	injectDetailContacts(record) {
		const me = this;
		const $list = this.$content.find("#qlDetailContactsList");
		const $count = this.$content.find("#qlContactCount");
		if (!$list.length) return;
		me._detailPrimaryIdx = undefined;

		const partyName = record.party_name || record.customer_name || "";
		const colors = ["#3b7ef8", "#16a34a", "#d97706", "#7c3aed", "#dc2626", "#0891b2"];

		me._detailContacts = (Array.isArray(record.contact_list) ? record.contact_list : [])
			.map(c => ({
				docname: c.user_name || "",
				name: c.user_name || "—",
				email: c.email_id || "",
				phone: c.mobile_no || "",
				role: c.designation || "",
				poc: Number(c.poc) || 0,
			}));

		me._detailPrimaryIdx = me._detailContacts.findIndex(c => c.poc === 1);
		if (me._detailPrimaryIdx < 0) {
			const primaryRef = String(record.contact_person || "").trim();
			me._detailPrimaryIdx = me._detailContacts.findIndex(c => primaryRef && String(c.docname).trim() === primaryRef);
		}
		if (me._detailPrimaryIdx < 0) me._detailPrimaryIdx = 0;

		const renderContacts = () => {
			$count.text(me._detailContacts.length);
			if (!me._detailContacts.length) {
				$list.html(`<div style="font-size:12px;color:#9ca3af;padding:4px 0;grid-column:1/-1;">No contacts linked to this quotation</div>`);
				return;
			}
			$list.html(me._detailContacts.map((c, i) => {
				const av = (c.name !== "—" ? c.name : c.docname || "?").substring(0, 2).toUpperCase();
				const color = colors[i % colors.length];
				const isPrimary = (i === me._detailPrimaryIdx);
				const dispName = c.name || c.docname || "—";
				const nameHtml = c.docname
					? `<a href="/app/contact/${encodeURIComponent(c.docname)}" style="font-size:13px;font-weight:600;color:#3b7ef8;text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;" title="Open ${me.escapeAttr(dispName)}">${me.escapeAttr(dispName)}</a>`
					: `<div style="font-size:13px;font-weight:600;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${me.escapeAttr(dispName)}</div>`;
				return `
				<div style="background:${isPrimary ? "rgba(59,126,248,0.05)" : "#f8fafc"};border:${isPrimary ? "2px solid #3b7ef8" : "1px solid rgba(0,0,0,0.08)"};border-radius:10px;padding:12px 14px;position:relative;display:flex;flex-direction:column;gap:8px;">
					<div style="display:flex;align-items:flex-start;gap:10px;">
						<div style="position:relative;width:34px;height:34px;border-radius:50%;background:${color}18;color:${color};display:flex;align-items:center;justify-content:center;font-family:Syne,sans-serif;font-size:13px;font-weight:700;flex-shrink:0;">
							${me.escapeAttr(av)}
							${isPrimary ? `<span style="position:absolute;bottom:-1px;right:-1px;width:11px;height:11px;border-radius:50%;background:#3b7ef8;border:2px solid #fff;"></span>` : ""}
						</div>
						<div style="flex:1;min-width:0;padding-right:${isPrimary ? "72px" : "26px"};">
							${nameHtml}
							${c.role ? `<div style="font-size:10px;color:#9ca3af;margin-top:1px;">${me.escapeAttr(c.role)}</div>` : ""}
							${c.email ? `<div style="font-size:11px;color:#3b7ef8;margin-top:4px;display:flex;align-items:center;gap:4px;">
								<i class="ti ti-mail" style="font-size:10px;color:#9ca3af;flex-shrink:0;"></i>
								<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${me.escapeAttr(c.email)}</span>
								<button class="ql-copy-btn" data-copy="${me.escapeAttr(c.email)}" title="Copy email" style="border:none;background:transparent;cursor:pointer;color:#9ca3af;padding:0 2px;display:inline-flex;flex-shrink:0;"><i class="ti ti-copy" style="font-size:12px;"></i></button>
								</div>` : ""}
							${c.phone ? `<div style="font-size:11px;color:#374151;margin-top:2px;display:flex;align-items:center;gap:4px;">
								<i class="ti ti-device-mobile" style="font-size:10px;color:#9ca3af;flex-shrink:0;"></i>
								<span>${me.escapeAttr(c.phone)}</span>
								<button class="ql-copy-btn" data-copy="${me.escapeAttr(c.phone)}" title="Copy mobile" style="border:none;background:transparent;cursor:pointer;color:#9ca3af;padding:0 2px;display:inline-flex;flex-shrink:0;"><i class="ti ti-copy" style="font-size:12px;"></i></button>
								</div>` : ""}
						</div>
					</div>
					${isPrimary ? `<span style="position:absolute;top:12px;right:12px;display:inline-flex;align-items:center;gap:4px;background:#3b7ef8;color:#fff;font-size:9px;font-weight:700;padding:2px 8px;border-radius:10px;text-transform:uppercase;letter-spacing:.04em;">
						<span style="width:6px;height:6px;border-radius:50%;background:#fff;display:inline-block;"></span>Primary
					</span>` : ""}
					<button class="ql-contact-remove" data-ci="${i}" style="position:absolute;top:12px;right:12px;width:22px;height:22px;border-radius:50%;border:1px solid rgba(220,38,38,0.2);background:rgba(220,38,38,0.06);color:#dc2626;cursor:pointer;display:${isPrimary ? "none" : "flex"};align-items:center;justify-content:center;font-size:11px;" title="Remove"><i class="ti ti-x"></i></button>
					${!isPrimary && c.docname ? `
					<button class="ql-set-primary" data-ci="${i}" style="width:100%;padding:5px;border-radius:6px;border:1px solid rgba(59,126,248,0.3);background:rgba(59,126,248,0.04);color:#3b7ef8;font-size:11px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;">
						<i class="ti ti-star" style="font-size:12px;"></i> Set as Primary
					</button>` : ""}
				</div>`;
			}).join(""));
		};

		renderContacts();

		$list.off("click.qlPrimary", ".ql-set-primary").on("click.qlPrimary", ".ql-set-primary", function (e) {
			e.preventDefault(); e.stopPropagation();
			const i = parseInt($(this).data("ci"));
			if (!Number.isFinite(i) || !me._detailContacts[i]) return;
			me._detailPrimaryIdx = i;
			me._detailContacts.forEach((c, j) => { c.poc = (j === i) ? 1 : 0; });
			renderContacts();
			me._saveDetailContacts(record);
		});

		$list.off("click.qlRemove", ".ql-contact-remove").on("click.qlRemove", ".ql-contact-remove", function (e) {
			e.preventDefault(); e.stopPropagation();
			const i = parseInt($(this).data("ci"));
			me._showDeleteConfirm(me._detailContacts[i]?.name || "this contact", () => {
				me._detailContacts.splice(i, 1);
				if (me._detailPrimaryIdx >= me._detailContacts.length) me._detailPrimaryIdx = 0;
				renderContacts();
				me._saveDetailContacts(record);
			});
		});

		$list.off("click.qlCopy", ".ql-copy-btn").on("click.qlCopy", ".ql-copy-btn", function (e) {
			e.preventDefault(); e.stopPropagation();
			const val = String($(this).data("copy") || "");
			navigator.clipboard.writeText(val)
				.then(() => frappe.show_alert({ message: "Copied to clipboard", indicator: "green" }))
				.catch(() => frappe.show_alert({ message: "Copy failed", indicator: "red" }));
		});

		this.$content.off("click.qlDCon", "#qlAddContactDetailBtn")
			.on("click.qlDCon", "#qlAddContactDetailBtn", () => {
				me._openDetailContactPicker(partyName, record, renderContacts);
			});
	}

	_saveDetailContacts(record) {
		const me = this;
		if (!record?.name) return;
		const contactList = (me._detailContacts || []).map((c, i) => ({
			user_name: c.docname || "",
			email_id: c.email || "",
			mobile_no: c.phone || "",
			designation: c.role || "",
			poc: (i === me._detailPrimaryIdx) ? 1 : 0,
		}));
		frappe.call({
			method: "frappe.client.get",
			args: { doctype: "Quotation", name: record.name },
			callback: (r) => {
				const doc = r.message;
				if (!doc) return;
				doc.contact_list = contactList;
				const pocIdx = Number.isFinite(me._detailPrimaryIdx) ? me._detailPrimaryIdx : 0;
				const primary = (me._detailContacts || [])[pocIdx];
				if (primary && primary.docname) {
					doc.contact_person = primary.docname;
					doc.contact_email = primary.email || "";
				}
				frappe.call({
					method: "frappe.client.save",
					args: { doc },
					callback: (r2) => {
						if (r2.message) {
							me.detailRecord = r2.message;
							frappe.show_alert({ message: "Contacts updated.", indicator: "green" });
						}
					},
					error: () => frappe.show_alert({ message: "Failed to save contacts.", indicator: "red" }),
				});
			},
		});
	}

	_openDetailContactPicker(partyName, record, onAdded) {
		const me = this;
		$("#qlDConPickerOverlay").remove();

		frappe.call({
			method: "frappe.client.get_list",
			args: {
				doctype: "Contact",
				fields: ["name", "first_name", "last_name", "email_id", "mobile_no", "designation"],
				filters: [["Dynamic Link", "link_doctype", "=", "Customer"], ["Dynamic Link", "link_name", "=", partyName]],
				limit_page_length: 50,
			},
			callback: (r) => {
				const all = (r.message || []).map(c => ({
					docname: c.name,
					name: [c.first_name, c.last_name].filter(Boolean).join(" ") || c.name,
					email: c.email_id || "", phone: c.mobile_no || "", role: c.designation || "",
				}));
				const addedDocnames = new Set((me._detailContacts || []).map(c => c.docname));
				const available = all.filter(c => !addedDocnames.has(c.docname));

				const $overlay = $(`
				<div id="qlDConPickerOverlay" style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9000;display:flex;align-items:center;justify-content:center;padding:20px;">
					<div style="background:#fff;border-radius:14px;width:100%;max-width:480px;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 24px 64px rgba(0,0,0,0.18);">
						<div style="padding:16px 20px 12px;border-bottom:1px solid rgba(0,0,0,0.08);display:flex;align-items:center;justify-content:space-between;">
							<div>
								<div style="font-family:Syne,sans-serif;font-size:15px;font-weight:700;color:#111827;">Add Contact</div>
								<div style="font-size:11px;color:#9ca3af;margin-top:2px;">${me.escapeAttr(partyName || "Customer")}</div>
							</div>
							<button id="qlDConClose" style="width:28px;height:28px;border-radius:50%;border:1px solid rgba(0,0,0,0.1);background:transparent;color:#9ca3af;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;"><i class="ti ti-x"></i></button>
						</div>
						<div style="display:flex;gap:4px;padding:10px 20px;border-bottom:1px solid rgba(0,0,0,0.08);background:#f8fafc;">
							<button class="ql-dcon-tab active" data-tab="existing" style="padding:6px 14px;border-radius:6px;border:1.5px solid rgba(59,126,248,0.3);background:#fff;font-size:12px;font-weight:600;cursor:pointer;color:#3b7ef8;">Existing Contacts</button>
							<button class="ql-dcon-tab" data-tab="new" style="padding:6px 14px;border-radius:6px;border:1px solid transparent;background:transparent;font-size:12px;font-weight:500;cursor:pointer;color:#6b7280;">+ Create New</button>
						</div>
						<div id="qlDConExisting" style="flex:1;overflow-y:auto;padding:14px 20px;display:flex;flex-direction:column;gap:8px;">
							${available.length ? available.map((c, i) => `
							<div class="ql-dcon-pick" data-ci="${i}" style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1.5px solid rgba(0,0,0,0.08);border-radius:10px;cursor:pointer;transition:all .12s;">
								<div style="width:32px;height:32px;border-radius:50%;background:rgba(59,126,248,0.1);color:#3b7ef8;display:flex;align-items:center;justify-content:center;font-family:Syne,sans-serif;font-size:12px;font-weight:700;flex-shrink:0;">${me.escapeAttr((c.name || "?").substring(0, 2).toUpperCase())}</div>
								<div style="flex:1;min-width:0;">
									<div style="font-size:13px;font-weight:600;color:#111827;">${me.escapeAttr(c.name)}</div>
									${c.role ? `<div style="font-size:10px;color:#9ca3af;">${me.escapeAttr(c.role)}</div>` : ""}
									${c.email ? `<div style="font-size:11px;color:#3b7ef8;">${me.escapeAttr(c.email)}</div>` : ""}
									${c.phone ? `<div style="font-size:11px;color:#374151;">${me.escapeAttr(c.phone)}</div>` : ""}
								</div>
								<i class="ti ti-plus" style="font-size:15px;color:#3b7ef8;flex-shrink:0;"></i>
							</div>`).join("") : `
							<div style="text-align:center;padding:24px;color:#9ca3af;font-size:12px;">
								<i class="ti ti-user-off" style="font-size:24px;display:block;margin-bottom:8px;color:#d1d5db;"></i>
								All contacts already added, or none found.<br>Use <strong>+ Create New</strong> to add one.
							</div>`}
						</div>
						<div id="qlDConNew" style="display:none;flex:1;overflow-y:auto;padding:16px 20px;">
							<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
								<div><label style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:4px;">First Name <span style="color:#dc2626;">*</span></label><input id="qlDConFirstName" type="text" class="act-input" placeholder="First name" style="height:34px;"></div>
								<div><label style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:4px;">Last Name</label><input id="qlDConLastName" type="text" class="act-input" placeholder="Last name" style="height:34px;"></div>
								<div style="grid-column:1/-1;"><label style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:4px;">Designation / Role</label><input id="qlDConRole" type="text" class="act-input" placeholder="e.g. IT Manager" style="height:34px;"></div>
								<div style="grid-column:1/-1;"><label style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:4px;">Email</label><input id="qlDConEmail" type="email" class="act-input" placeholder="email@company.com" style="height:34px;"></div>
								<div style="grid-column:1/-1;"><label style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:4px;">Mobile</label><input id="qlDConPhone" type="tel" class="act-input" placeholder="+91 XXXXX XXXXX" style="height:34px;"></div>
							</div>
						</div>
						<div style="padding:12px 20px;border-top:1px solid rgba(0,0,0,0.08);background:#f8fafc;display:flex;justify-content:flex-end;gap:8px;">
							<button id="qlDConCancel" style="padding:7px 16px;border-radius:6px;border:1px solid rgba(0,0,0,0.1);background:#fff;font-size:13px;cursor:pointer;color:#374151;">Cancel</button>
							<button id="qlDConSaveNew" style="display:none;padding:7px 16px;border-radius:6px;border:none;background:#3b7ef8;color:#fff;font-size:13px;font-weight:600;cursor:pointer;"><i class="ti ti-check" style="margin-right:4px;"></i> Save & Add</button>
						</div>
					</div>
				</div>`);
				$("body").append($overlay);

				$overlay.on("click", ".ql-dcon-tab", function () {
					const tab = $(this).data("tab");
					$overlay.find(".ql-dcon-tab").css({ border: "1px solid transparent", background: "transparent", color: "#6b7280", fontWeight: "500" });
					$(this).css({ border: "1.5px solid rgba(59,126,248,0.3)", background: "#fff", color: "#3b7ef8", fontWeight: "600" });
					if (tab === "existing") {
						$overlay.find("#qlDConExisting").show();
						$overlay.find("#qlDConNew").hide();
						$overlay.find("#qlDConSaveNew").hide();
					} else {
						$overlay.find("#qlDConExisting").hide();
						$overlay.find("#qlDConNew").show();
						$overlay.find("#qlDConSaveNew").show();
					}
				});

				$overlay.on("mouseenter", ".ql-dcon-pick", function () { $(this).css({ "border-color": "#3b7ef8", background: "rgba(59,126,248,0.04)" }); })
					.on("mouseleave", ".ql-dcon-pick", function () { $(this).css({ "border-color": "rgba(0,0,0,0.08)", background: "" }); });

				$overlay.on("click", ".ql-dcon-pick", function () {
					const i = parseInt($(this).data("ci"));
					if (!me._detailContacts) me._detailContacts = [];
					me._detailContacts.push({ ...available[i], poc: 0 });
					onAdded();
					me._saveDetailContacts(record);
					$overlay.remove();
				});

				$overlay.on("click", "#qlDConSaveNew", () => {
					const firstName = $overlay.find("#qlDConFirstName").val().trim();
					if (!firstName) { frappe.show_alert({ message: "First name is required.", indicator: "orange" }); return; }
					const lastName = $overlay.find("#qlDConLastName").val().trim();
					const role = $overlay.find("#qlDConRole").val().trim();
					const email = $overlay.find("#qlDConEmail").val().trim();
					const phone = $overlay.find("#qlDConPhone").val().trim();
					const fullName = [firstName, lastName].filter(Boolean).join(" ");
					const $btn = $overlay.find("#qlDConSaveNew");
					$btn.html('<i class="ti ti-loader"></i> Saving…').prop("disabled", true);

					frappe.call({
						method: "frappe.client.insert",
						args: {
							doc: {
								doctype: "Contact",
								first_name: firstName, last_name: lastName, designation: role,
								email_ids: email ? [{ email_id: email, is_primary: 1 }] : [],
								phone_nos: phone ? [{ phone: phone, is_primary_mobile_no: 1 }] : [],
								links: partyName ? [{ link_doctype: "Customer", link_name: partyName }] : [],
							}
						},
						callback: (r) => {
							if (r.message) {
								if (!me._detailContacts) me._detailContacts = [];
								me._detailContacts.push({ docname: r.message.name, name: fullName, email, phone, role, poc: 0 });
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

				$overlay.on("click", "#qlDConClose, #qlDConCancel", () => $overlay.remove());
				$overlay.on("click", e => { if ($(e.target).is($overlay)) $overlay.remove(); });
			},
			error: () => frappe.show_alert({ message: "Could not load contacts. Try again.", indicator: "orange" }),
		});
	}

	injectDetailAddress() {
		const me = this;
		const record = me.detailRecord || {};
		me._detailAddrSlots = {
			billing: { field: "customer_address", inputKey: "customer_address", cardId: "qlDetailBillingCard", listKey: "_detailCustAddrs", accent: "#3b7ef8", icon: "ti-map-pin", label: "Billing Address", empty: "No customer addresses found." },
			shipping: { field: "shipping_address_name", inputKey: "shipping_address_name", cardId: "qlDetailShippingCard", listKey: "_detailCustAddrs", accent: "#16a34a", icon: "ti-truck-delivery", label: "Shipping Address", empty: "No customer addresses found." },
			company: { field: "company_address", inputKey: "company_address", cardId: "qlDetailCompanyCard", listKey: "_detailCompAddrs", accent: "#d97706", icon: "ti-building", label: "Company Address", empty: "No company addresses found." },
		};

		// current saved values live on detailRecord
		const party = record.party_name || record.customer_name || "";
		const company = record.company || "";

		// fetch both address sets, then render all three slots
		const renderAll = () => ["billing", "shipping", "company"].forEach(k => me.renderDetailAddressSlot(k));

		me._detailCustAddrs = me._detailCustAddrs || [];
		me._detailCompAddrs = me._detailCompAddrs || [];
		renderAll();   // render immediately (may show loading-less empty until fetch returns)

		if (party) {
			me._fetchAddresses("Customer", party, (list) => { me._detailCustAddrs = list; me.renderDetailAddressSlot("billing"); me.renderDetailAddressSlot("shipping"); });
		}
		if (company) {
			me._fetchAddresses("Company", company, (list) => { me._detailCompAddrs = list; me.renderDetailAddressSlot("company"); });
		}

		// Add / Change → picker ; Remove → clear + save
		me.$content.off("click.qlDAddr", ".ql-daddr-add, .ql-daddr-change")
			.on("click.qlDAddr", ".ql-daddr-add, .ql-daddr-change", (e) => {
				me.openDetailAddressPicker(String($(e.currentTarget).data("addrSlot")));
			});
		me.$content.off("click.qlDAddrRm", ".ql-daddr-remove")
			.on("click.qlDAddrRm", ".ql-daddr-remove", (e) => {
				const slotKey = String($(e.currentTarget).data("addrSlot"));
				const slot = me._detailAddrSlots[slotKey];
				if (!slot) return;
				me._saveDetailAddress(slot.inputKey, "");
				me.detailRecord[slot.field] = "";
				me.renderDetailAddressSlot(slotKey);
			});
	}

	renderDetailAddressSlot(slotKey) {
		const me = this;
		const slot = me._detailAddrSlots && me._detailAddrSlots[slotKey];
		if (!slot) return;
		const $card = me.$content.find(`#${slot.cardId}`);
		if (!$card.length) return;
		const record = me.detailRecord || {};
		const list = me[slot.listKey] || [];
		const name = (record[slot.field] || "").trim();
		const addr = list.find(a => a.name === name);

		if (!name) {
			$card.html(`
				<button type="button" class="ql-daddr-add" data-addr-slot="${slotKey}"
					style="width:100%;border:2px dashed rgba(0,0,0,0.14);border-radius:12px;padding:18px;display:flex;align-items:center;justify-content:center;gap:8px;background:#f7f8fa;color:#6b7280;cursor:pointer;font-size:13px;font-weight:500;">
					<i class="ti ti-plus" style="font-size:16px;color:${slot.accent};"></i> Add ${me.escapeAttr(slot.label)}
				</button>`);
			return;
		}

		// have a name but address details not loaded yet → fetch single value for display
		const renderCard = (a) => {
			const clr = slot.accent;
			const cityLine = [a.city, a.state, a.pincode].filter(Boolean).join(", ");
			const badge = (txt, c) => `<span style="display:inline-flex;align-items:center;margin-left:6px;padding:1px 7px;border-radius:20px;background:${c}1a;font-size:9px;font-weight:700;letter-spacing:.04em;color:${c};">${txt}</span>`;
			let badges = "";
			if (a.primary) badges += badge("PRIMARY", "#16a34a");
			if (a.shipping) badges += badge("SHIPPING", "#3b7ef8");
			$card.html(`
				<div style="background:#fff;border:1px solid rgba(0,0,0,0.09);border-radius:14px;padding:14px 18px;display:flex;align-items:flex-start;gap:14px;box-shadow:0 1px 6px rgba(0,0,0,0.06);position:relative;">
					<div style="width:42px;height:42px;border-radius:50%;background:${clr}1a;border:2px solid ${clr}33;display:flex;align-items:center;justify-content:center;color:${clr};flex-shrink:0;">
						<i class="ti ${slot.icon}" style="font-size:18px;"></i>
					</div>
					<div style="flex:1;min-width:0;">
						<div style="font-family:Syne,sans-serif;font-size:14px;font-weight:600;color:#111827;">${me.escapeAttr(a.name || name)}${badges}</div>
						${a.line1 ? `<div style="font-size:12px;color:#374151;margin-top:4px;">${me.escapeAttr(a.line1)}</div>` : ""}
						${a.line2 ? `<div style="font-size:12px;color:#374151;margin-top:2px;">${me.escapeAttr(a.line2)}</div>` : ""}
						${cityLine ? `<div style="font-size:12px;color:#6b7280;margin-top:3px;display:flex;align-items:center;gap:6px;"><i class="ti ti-building-community" style="font-size:13px;color:#9ca3af;"></i>${me.escapeAttr(cityLine)}</div>` : ""}
						<button type="button" class="ql-daddr-change" data-addr-slot="${slotKey}" style="margin-top:8px;background:transparent;border:none;color:${clr};font-size:11px;font-weight:600;cursor:pointer;padding:0;display:inline-flex;align-items:center;gap:4px;"><i class="ti ti-switch-horizontal" style="font-size:12px;"></i> Change</button>
					</div>
					<button type="button" class="ql-daddr-remove" data-addr-slot="${slotKey}" style="position:absolute;top:10px;right:10px;width:24px;height:24px;border-radius:50%;border:1px solid rgba(0,0,0,0.08);background:transparent;color:#9ca3af;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;" title="Remove"><i class="ti ti-x"></i></button>
				</div>`);
		};

		if (addr) { renderCard(addr); return; }
		// fallback: fetch the single address's details for display
		frappe.call({
			method: "frappe.client.get_value",
			args: { doctype: "Address", filters: { name }, fieldname: ["address_line1", "address_line2", "city", "state", "pincode", "is_primary_address", "is_shipping_address"] },
			callback: (r) => {
				const a = r.message || {};
				renderCard({ name, line1: a.address_line1 || "", line2: a.address_line2 || "", city: a.city || "", state: a.state || "", pincode: a.pincode || "", primary: !!a.is_primary_address, shipping: !!a.is_shipping_address });
			},
			error: () => renderCard({ name }),
		});
	}

	openDetailAddressPicker(slotKey) {
		const me = this;
		const slot = me._detailAddrSlots && me._detailAddrSlots[slotKey];
		if (!slot) return;
		const list = me[slot.listKey] || [];
		$("#qlDAddrPickerOverlay").remove();

		const rows = list.length
			? list.map((a, i) => {
				const cityLine = [a.city, a.state, a.pincode].filter(Boolean).join(", ");
				let tags = "";
				if (a.primary) tags += `<span style="font-size:9px;font-weight:700;color:#16a34a;margin-left:6px;">• PRIMARY</span>`;
				if (a.shipping) tags += `<span style="font-size:9px;font-weight:700;color:#3b7ef8;margin-left:6px;">• SHIPPING</span>`;
				return `<div class="ql-daddr-pick" data-ai="${i}" style="display:flex;align-items:flex-start;gap:12px;padding:12px 14px;border:1.5px solid rgba(0,0,0,0.08);border-radius:10px;cursor:pointer;transition:0.15s;margin-bottom:8px;">
					<div style="width:34px;height:34px;border-radius:50%;background:${slot.accent}1a;display:flex;align-items:center;justify-content:center;color:${slot.accent};flex-shrink:0;"><i class="ti ti-map-pin" style="font-size:15px;"></i></div>
					<div style="flex:1;min-width:0;">
						<div style="font-size:13px;font-weight:600;color:#111827;">${me.escapeAttr(a.name)}${tags}</div>
						${a.line1 ? `<div style="font-size:11px;color:#6b7280;margin-top:2px;">${me.escapeAttr(a.line1)}</div>` : ""}
						${cityLine ? `<div style="font-size:11px;color:#9ca3af;">${me.escapeAttr(cityLine)}</div>` : ""}
					</div>
					<i class="ti ti-plus" style="font-size:16px;color:${slot.accent};flex-shrink:0;"></i>
				</div>`;
			}).join("")
			: `<div style="text-align:center;padding:24px;color:#9ca3af;font-size:12px;"><i class="ti ti-map-pin-off" style="font-size:24px;display:block;margin-bottom:8px;"></i>${me.escapeAttr(slot.empty)}</div>`;

		const $overlay = $(`
		<div id="qlDAddrPickerOverlay" style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9000;display:flex;align-items:center;justify-content:center;padding:20px;">
			<div style="background:#fff;border-radius:16px;width:100%;max-width:520px;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 24px 64px rgba(0,0,0,0.18);">
				<div style="padding:18px 22px 14px;border-bottom:1px solid rgba(0,0,0,0.08);display:flex;align-items:center;justify-content:space-between;">
					<div style="font-family:Syne,sans-serif;font-size:15px;font-weight:700;color:#111827;display:flex;align-items:center;gap:8px;"><i class="ti ${slot.icon}" style="color:${slot.accent};"></i> Select ${me.escapeAttr(slot.label)}</div>
					<button id="qlDAddrClose" style="width:30px;height:30px;border-radius:50%;border:1px solid rgba(0,0,0,0.1);background:transparent;color:#9ca3af;cursor:pointer;font-size:15px;display:flex;align-items:center;justify-content:center;"><i class="ti ti-x"></i></button>
				</div>
				<div style="flex:1;overflow-y:auto;padding:16px 22px;">${rows}</div>
				<div style="padding:12px 22px;border-top:1px solid rgba(0,0,0,0.08);display:flex;justify-content:flex-end;background:#f8fafc;">
					<button id="qlDAddrCancel" style="padding:8px 16px;border-radius:6px;border:1px solid rgba(0,0,0,0.1);background:#fff;font-size:13px;cursor:pointer;color:#374151;">Cancel</button>
				</div>
			</div>
		</div>`);
		$("body").append($overlay);

		$overlay.on("click", ".ql-daddr-pick", function () {
			const a = list[parseInt($(this).data("ai"))];
			if (a) {
				me.detailRecord[slot.field] = a.name;
				me._saveDetailAddress(slot.inputKey, a.name);
				me.renderDetailAddressSlot(slotKey);
			}
			$overlay.remove();
		});
		$overlay.on("mouseenter", ".ql-daddr-pick", function () { $(this).css({ "border-color": slot.accent, "background": slot.accent + "0a" }); })
			.on("mouseleave", ".ql-daddr-pick", function () { $(this).css({ "border-color": "rgba(0,0,0,0.08)", "background": "" }); });
		$overlay.on("click", "#qlDAddrClose, #qlDAddrCancel", () => $overlay.remove());
		$overlay.on("click", (e) => { if ($(e.target).is($overlay)) $overlay.remove(); });
	}

	_saveDetailAddress(fieldname, value) {
		const me = this;
		const record = me.detailRecord || {};
		if (!record.name) return;
		frappe.call({
			method: "frappe.client.get",
			args: { doctype: "Quotation", name: record.name },
			callback: (r) => {
				const doc = r.message;
				if (!doc) return;
				doc[fieldname] = value;
				frappe.call({
					method: "frappe.client.save",
					args: { doc },
					callback: (r2) => {
						if (r2.message) {
							me.detailRecord = r2.message;
							frappe.show_alert({ message: "Address updated.", indicator: "green" });
						}
					},
					error: () => frappe.show_alert({ message: "Failed to update address.", indicator: "red" }),
				});
			},
		});
	}

	injectDetailItems() {
		const me = this;
		me.$content.find("#qlItemsSaveBar").hide();   // ← reset to hidden on render
		const record = this.detailRecord || {};
		const items = Array.isArray(record.items) ? record.items : [];
		const $wrap = this.$content.find("#qlItemsTableBody");
		const isDraft = Number(record.docstatus || 0) === 0;
		const isCancelled = Number(record.docstatus || 0) === 2;
		const editable = !isCancelled;   // editable in draft AND submitted

		if (!items.length) {
			$wrap.html(`<div style="text-align:center;padding:32px;color:#9ca3af;font-size:12px;">
				<i class="ti ti-inbox" style="font-size:26px;display:block;margin-bottom:8px;"></i>No items on this quotation
			</div>`);
			this.$content.find("#qlItemsTotalQty").text("0");
			this.injectDetailFinancialsSummary();
			this.injectPaymentSchedule();
			this.injectConnections();    // ← add this
			return;
		}

		const typeLabel = { new: "New", renewal: "Renewal", additional: "Additional", "add-on": "Add-on", "monthly usage": "Monthly Usage" };
		const typeColor = { new: "#3b7ef8", renewal: "#16a34a", additional: "#d97706" };
		const fmtINR = n => Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

		let cards = "";
		items.forEach((item, idx) => {
			const qty = Number(item.qty || 0);
			const rate = Number(item.rate || 0);
			const amt = Number(item.amount || (qty * rate));
			const rstat = String(item.renewal_status || "new");
			const tkey = rstat.toLowerCase();
			const renewId = (tkey === "renewal" || tkey === "additional") ? (item.renewal_id || "") : "";
			const hasDesc = item.description && String(item.description).replace(/<[^>]*>/g, "").trim().length > 0;

			cards += `
<div class="ql-di-card" data-idx="${idx}">
	<div class="ql-ic-row1">
		<div class="ql-ic-num">${idx + 1}</div>
		<div class="ql-ic-item" style="cursor:default;">
			<div class="ql-ic-name">${me.escapeAttr(item.item_name || item.item_code || "—")}</div>
			<div class="ql-ic-sub">
				${item.item_code ? me.escapeAttr(item.item_code) : ""}${item.item_code ? "  ·  " : ""}<span style="color:${typeColor[tkey] || "#3b7ef8"};font-weight:700;">${typeLabel[tkey] || me.escapeAttr(rstat)}</span>${renewId ? `<span class="ql-ic-renewid"><i class="ti ti-refresh"></i> ${me.escapeAttr(renewId)}</span>` : ""}
			</div>
		</div>

		<div class="ql-ic-field" style="width:70px;">
			<label class="ql-ic-label">Qty</label>
			${editable
					? `<input class="ql-di-qty ql-ic-input" type="number" min="1" step="1" value="${qty}" style="text-align:right;">`
					: `<div class="ql-ic-roval" style="text-align:right;">${qty.toLocaleString("en-IN")}</div>`}
		</div>
		<div class="ql-ic-field" style="width:80px;">
			<label class="ql-ic-label">UOM</label>
			<div class="ql-ic-roval">${me.escapeAttr(item.uom || "Nos")}</div>
		</div>
		<div class="ql-ic-field" style="width:140px;">
			<label class="ql-ic-label">Rate (₹)</label>
			${editable
					? `<input class="ql-di-rate ql-ic-input" type="number" min="0" step="0.01" value="${rate}" style="text-align:right;">`
					: `<div class="ql-ic-roval" style="text-align:right;">₹${fmtINR(rate)}</div>`}
		</div>
		<div class="ql-ic-field" style="width:160px;">
			<label class="ql-ic-label">Amount (₹)</label>
			<div class="ql-ic-roval ql-ic-amt ql-di-amt" style="text-align:right;">₹${fmtINR(amt)}</div>
		</div>

		<div class="ql-ic-field" style="width:34px;align-items:center;">
			<label class="ql-ic-label">Desc</label>
			<button class="ql-di-desc-btn ${hasDesc ? "has-desc" : ""}" data-idx="${idx}" type="button"><i class="ti ${hasDesc ? "ti-file-check" : "ti-file-text"}"></i></button>
		</div>
		${editable ? `
		<div class="ql-ic-field" style="width:34px;align-items:center;">
			<label class="ql-ic-label">&nbsp;</label>
			<button class="ql-di-del-btn ql-ic-del" data-idx="${idx}" type="button"><i class="ti ti-trash"></i></button>
		</div>` : ""}
	</div>
</div>`;
		});

		$wrap.html(cards);
		// editable qty/rate (Draft only)
		me.$content.off("input.qlDIEdit", "#qlItemsTableBody .ql-di-qty, #qlItemsTableBody .ql-di-rate")
			.on("input.qlDIEdit", "#qlItemsTableBody .ql-di-qty, #qlItemsTableBody .ql-di-rate", (e) => {
				const $card = $(e.currentTarget).closest(".ql-di-card");
				const idx = parseInt($card.data("idx"));
				if (!Number.isFinite(idx) || !items[idx]) return;
				const q = parseFloat($card.find(".ql-di-qty").val()) || 0;
				const r = parseFloat($card.find(".ql-di-rate").val()) || 0;
				items[idx].qty = q;
				items[idx].rate = r;
				items[idx].amount = q * r;
				$card.find(".ql-di-amt").text("₹" + fmtINR(q * r));
				me._markItemsDirty();
			});

		// total qty
		const totalQty = items.reduce((s, it) => s + Number(it.qty || 0), 0);
		this.$content.find("#qlItemsTotalQty").text(totalQty.toLocaleString("en-IN"));

		// desc edit button
		me.$content.off("click.qlDIDesc", "#qlItemsTableBody .ql-di-desc-btn")
			.on("click.qlDIDesc", "#qlItemsTableBody .ql-di-desc-btn", (e) => {
				e.stopPropagation();
				me.openDetailDescEdit(parseInt($(e.currentTarget).data("idx")));
			});

		// delete button (Draft only)
		me.$content.off("click.qlDIDel", "#qlItemsTableBody .ql-di-del-btn")
			.on("click.qlDIDel", "#qlItemsTableBody .ql-di-del-btn", (e) => {
				e.stopPropagation();
				const idx = parseInt($(e.currentTarget).data("idx"));
				const nm = (items[idx] && (items[idx].item_name || items[idx].item_code)) || `Item ${idx + 1}`;
				me._showDeleteConfirm(nm, () => me._deleteDetailItem(idx));
			});

		this.injectDetailFinancialsSummary();
		this.injectPaymentSchedule();
		this.injectConnections();
	}

	_markItemsDirty() {
		this.$content.find("#qlItemsSaveBar").css("display", "flex");
	}

	saveDetailItems() {
		const me = this;
		const record = me.detailRecord || {};
		const editedItems = Array.isArray(record.items) ? record.items : [];

		me._checkDetailItemsMatchOpp().then((check) => {
			if (!check.ok) {
				if (!check.ok) {
					const lines = check.mismatches.map(m =>
						`<div style="padding:8px 0;border-bottom:1px solid rgba(0,0,0,0.06);font-size:13px;color:#374151;">
						<strong style="color:#111827;">${me.escapeAttr(m.name)}</strong><br>
						Qty: <b style="color:#dc2626;">${m.qty}</b> (opp <span style="color:#3b7ef8;font-weight:600;">${m.oQty}</span>) &nbsp;·&nbsp; Rate: <b style="color:#dc2626;">₹${m.rate}</b> (opp <span style="color:#3b7ef8;font-weight:600;">₹${m.oRate}</span>)
					</div>`
					).join("");
					$("#qlMismatchOverlay").remove();
					const $ov = $(`
				<div id="qlMismatchOverlay" style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9500;display:flex;align-items:center;justify-content:center;padding:20px;">
					<div style="background:#fff;border-radius:16px;width:100%;max-width:460px;box-shadow:0 24px 64px rgba(0,0,0,0.2);overflow:hidden;">
						<div style="padding:18px 22px;border-bottom:1px solid rgba(0,0,0,0.08);display:flex;align-items:center;justify-content:space-between;">
							<div style="font-family:Syne,sans-serif;font-size:15px;font-weight:700;color:#dc2626;display:flex;align-items:center;gap:8px;"><i class="ti ti-alert-triangle"></i> Item Qty/Rate Mismatch</div>
							<button id="qlMismatchClose" style="width:30px;height:30px;border-radius:50%;border:1px solid rgba(0,0,0,0.1);background:transparent;color:#9ca3af;cursor:pointer;font-size:15px;display:flex;align-items:center;justify-content:center;"><i class="ti ti-x"></i></button>
						</div>
						<div style="padding:16px 22px;max-height:50vh;overflow-y:auto;">
							<div style="font-size:12px;color:#6b7280;margin-bottom:10px;">These items differ from the source Opportunity. Qty and rate must match:</div>
							${lines}
						</div>
						<div style="padding:14px 22px;border-top:1px solid rgba(0,0,0,0.08);background:#f8fafc;display:flex;justify-content:flex-end;">
							<button id="qlMismatchOk" style="padding:8px 20px;border-radius:6px;border:none;background:#3b7ef8;color:#fff;font-size:13px;font-weight:600;cursor:pointer;">OK</button>
						</div>
					</div>
				</div>`);
					$("body").append($ov);
					const close = () => $ov.remove();
					$ov.on("click", "#qlMismatchClose, #qlMismatchOk", close);
					$ov.on("click", (e) => { if ($(e.target).is($ov)) close(); });
					return;
				}  // block the save
			}

			frappe.call({
				method: "frappe.client.get",
				args: { doctype: "Quotation", name: record.name },
				callback: (r) => {
					const doc = r.message;
					if (!doc) return;

					// (removed doc.ignore_pricing_rule — can't change after submit)

					let netTotal = 0;
					doc.items.forEach((row, i) => {
						if (editedItems[i]) {
							row.qty = editedItems[i].qty;
							row.rate = editedItems[i].rate;
							row.amount = editedItems[i].qty * editedItems[i].rate;
							row.net_rate = editedItems[i].rate;
							row.net_amount = editedItems[i].qty * editedItems[i].rate;
							row.base_rate = editedItems[i].rate;
							row.base_amount = editedItems[i].qty * editedItems[i].rate;
							row.base_net_rate = editedItems[i].rate;
							row.base_net_amount = editedItems[i].qty * editedItems[i].rate;
						}
						netTotal += Number(row.amount || 0);
					});

					doc.total = doc.net_total = doc.base_total = doc.base_net_total = netTotal;

					let totalTax = 0;
					(doc.taxes || []).forEach(t => {
						if (t.charge_type === "On Net Total") {
							const amt = netTotal * Number(t.rate || 0) / 100;
							t.tax_amount = amt;
							t.base_tax_amount = amt;
							totalTax += amt;
							t.total = netTotal + totalTax;
							t.base_total = netTotal + totalTax;
							t.tax_amount_after_discount_amount = amt;
							t.base_tax_amount_after_discount_amount = amt;
						}
					});

					doc.total_taxes_and_charges = doc.base_total_taxes_and_charges = totalTax;
					doc.grand_total = doc.base_grand_total = netTotal + totalTax;
					doc.rounded_total = doc.base_rounded_total = Math.round(netTotal + totalTax);

					frappe.call({
						method: "frappe.client.save",
						args: { doc },
						callback: (r2) => {
							if (r2.message) {
								me.detailRecord = r2.message;
								me.$content.find("#qlItemsSaveBar").hide();
								me.injectDetailItems();
								frappe.show_alert({ message: "Updated.", indicator: "green" });
							}
						},
						error: () => frappe.show_alert({ message: "Save failed.", indicator: "red" }),
					});
				},
			});
		});
	}

	_checkDetailItemsMatchOpp() {
		const me = this;
		const record = me.detailRecord || {};
		const oppName = record.opportunity || "";
		const items = Array.isArray(record.items) ? record.items : [];

		// no source opportunity → nothing to enforce
		if (!oppName) return Promise.resolve({ ok: true });

		return new Promise((resolve) => {
			frappe.call({
				method: "frappe.client.get",
				args: { doctype: "Opportunity", name: oppName },
				callback: (r) => {
					const opp = r.message;
					if (!opp || !Array.isArray(opp.items)) { resolve({ ok: true }); return; }
					// map opp item row name → {qty, rate}
					const oppMap = {};
					opp.items.forEach(oi => { oppMap[oi.name] = { qty: Number(oi.qty || 0), rate: Number(oi.rate || 0) }; });

					const mismatches = [];
					items.forEach((it, i) => {
						const link = it.opportunity_item || "";
						if (!link || !oppMap[link]) return;   // only items linked to an opp item
						const qty = Number(it.qty || 0);
						const rate = Number(it.rate || 0);
						const o = oppMap[link];
						if (qty !== o.qty || rate !== o.rate) {
							mismatches.push({ name: it.item_name || it.item_code || `Item ${i + 1}`, qty, rate, oQty: o.qty, oRate: o.rate });
						}
					});
					resolve({ ok: mismatches.length === 0, mismatches });
				},
				error: () => resolve({ ok: true }),   // if opp can't be fetched, don't block
			});
		});
	}



	injectConnections() {
		const me = this;
		const record = me.detailRecord || {};
		const $card = me.$content.find("#qlConnectionsCard");
		if (Number(record.docstatus || 0) !== 1) { $card.hide(); return; }
		$card.show();

		// only COFs (no Sales Order query)
		frappe.call({
			method: "frappe.client.get_list",
			args: { doctype: "Customer Order Form", filters: { quotation_id: record.name }, fields: ["name"], limit_page_length: 100 },
			callback: (rcof) => {
				me._renderConnections({ so: [], cof: (rcof.message || []).map(r => r.name) });
			},
			error: () => me._renderConnections({ so: [], cof: [] }),
		});
	}

	_renderConnections(results) {
		const me = this;
		const $body = me.$content.find("#qlConnectionsBody");

		const group = (label, icon, color, route, names) => {
			if (!names.length) return "";
			const chips = names.map(n => `
				<div class="ql-conn-chip" data-route="${route}" data-name="${me.escapeAttr(n)}" style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border:1px solid rgba(0,0,0,0.1);border-radius:8px;background:#fff;cursor:pointer;font-size:12px;font-weight:600;color:#111827;transition:all .12s;">
					<i class="ti ${icon}" style="color:${color};font-size:14px;"></i> ${me.escapeAttr(n)}
				</div>`).join("");
			return `
				<div style="margin-bottom:14px;">
					<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;margin-bottom:8px;">${label} <span style="color:#cbd5e1;">(${names.length})</span></div>
					<div style="display:flex;flex-wrap:wrap;gap:8px;">${chips}</div>
				</div>`;
		};

		let html = "";
		html += group("Sales Orders", "ti-clipboard-check", "#16a34a", "sales-order", results.so);
		html += group("Customer Order Forms", "ti-file-invoice", "#3b7ef8", "cof-list", results.cof);

		if (!html) {
			html = `<div style="padding:16px;text-align:center;color:#9ca3af;font-size:12px;">No linked documents yet.</div>`;
		}
		$body.html(html);

		// click → open the linked doc
		$body.off("click.qlConn", ".ql-conn-chip").on("click.qlConn", ".ql-conn-chip", function () {
			const route = $(this).data("route");
			const name = $(this).data("name");
			if (route === "sales-order") {
				frappe.set_route("Form", "Sales Order", name);   // standard SO form
			} else {
				frappe.set_route(route, name);                    // custom cof-list detail
			}
		});
	}






	_deleteDetailItem(idx) {
		const me = this;
		const record = me.detailRecord || {};
		frappe.call({
			method: "frappe.client.get",
			args: { doctype: "Quotation", name: record.name },
			callback: (r) => {
				const doc = r.message;
				if (!doc || !Array.isArray(doc.items) || !doc.items[idx]) return;
				doc.items.splice(idx, 1);
				frappe.call({
					method: "frappe.client.save",
					args: { doc },
					callback: (r2) => {
						if (r2.message) {
							me.detailRecord = r2.message;
							me.injectDetailItems();
							frappe.show_alert({ message: "Item removed.", indicator: "green" });
						}
					},
					error: () => frappe.show_alert({ message: "Failed to remove item.", indicator: "red" }),
				});
			},
		});
	}

	injectPaymentSchedule() {
		const me = this;
		const repaintOnly = !!me._payRepaintOnly;
		me._payRepaintOnly = false;
		const record = this.detailRecord || {};
		const $body = this.$content.find("#qlPaymentScheduleBody");
		const $name = this.$content.find("#qlPayTermsName");
		if (!$body.length) return;
		$name.text(record.payment_terms_template || "");

		const grandTotal = Number(record.grand_total || record.rounded_total || 0);
		const combos = me._payComboConfig();
		const describe = (c) => {
			const parts = [];
			if (c.adv) parts.push(`Advance ${c.adv}%`);
			if (c.del) parts.push(`On Delivery ${c.del}%`);
			if (c.after) parts.push(`After Delivery ${c.after}%`);
			return parts.join(" / ");
		};

		// working state — seed from saved schedule if present
		if (me._detailPayCombo === undefined) me._detailPayCombo = "";
		if (me._detailPayDays === undefined) me._detailPayDays = 0;
		if (!repaintOnly) {
			me._paySched = (Array.isArray(record.payment_schedule) ? record.payment_schedule : []).map(p => ({
				description: p.description || p.payment_term || "",
				credit_days: Number(p.credit_days || 0),
				invoice_portion: Number(p.invoice_portion || 0),
				payment_amount: Number(p.payment_amount || 0),
			}));
		}

		// Prefer stored Custom Payment Terms grid if present
		const cpt = Array.isArray(me.detailRecord?.custom_payment_terms) ? me.detailRecord.custom_payment_terms : [];
		if (!repaintOnly && cpt.length) {
			const pctRow  = cpt.find(r => String(r.type).toLowerCase() === "percentage") || {};
			const dayRow  = cpt.find(r => String(r.type).toLowerCase() === "days") || {};
			const n = (x) => { const v = Number(x); return Number.isFinite(v) ? v : 0; };
			me._detailCustAdv   = n(pctRow.advance);
			me._detailCustDel   = n(pctRow.on_delivery);
			me._detailCustAfter = n(pctRow.after_delivery);
			me._detailDelDays   = n(dayRow.on_delivery);
			me._detailPayDays   = n(dayRow.after_delivery);
			// detect whether these percentages map to a known combo, else custom
			const combos = me._payComboConfig();
			const hit = Object.keys(combos).find(k => {
				const c = combos[k];
				if (c.custom) return false;
				return Number(c.adv) === me._detailCustAdv && Number(c.del) === me._detailCustDel && Number(c.after) === me._detailCustAfter;
			});
			me._detailPayCombo = hit || "custom";
			me._cptSeeded = true;
		} else if (!repaintOnly) {
			me._cptSeeded = false;
		}

		// detect which combo the saved schedule matches, and pre-select it
		const matchCombo = () => {
			if (!me._paySched.length) return "";
			let adv = 0, del = 0, after = 0, delDays = 0, afterDays = 0;
			me._paySched.forEach(p => {
				const d = String(p.description || "").toLowerCase();
				if (d.includes("advance")) adv = p.invoice_portion;
				else if (d.includes("on delivery")) { del = p.invoice_portion; delDays = p.credit_days || 0; }
				else if (d.includes("after")) { after = p.invoice_portion; afterDays = p.credit_days || 0; }
			});
			const combos = me._payComboConfig();
			const hit = Object.keys(combos).find(k => {
				const c = combos[k];
				if (c.custom) return false;
				return Number(c.adv) === Number(adv) && Number(c.del) === Number(del) && Number(c.after) === Number(after);
			});
			// stash resolved days/percentages for paint()
			me._detailDelDays = delDays;
			me._detailPayDays = afterDays;
			me._detailCustAdv = adv; me._detailCustDel = del; me._detailCustAfter = after;
			return hit || (me._paySched.length ? "custom" : "");
		};
		if (!repaintOnly && !me._cptSeeded && (me._detailPayCombo === undefined || me._detailPayCombo === "")) {
			me._detailPayCombo = matchCombo();
		}

		const buildFromCombo = () => {
			const c = combos[me._detailPayCombo];
			if (!c) { me._paySched = []; return; }
			me._payAfterDays = Number(me._detailPayDays || 0);
			me._paySched = me._buildPayMilestones(c, "", grandTotal).map(m => ({
				description: m.label, credit_days: Number(m.credit_days || 0),
				invoice_portion: m.portion, payment_amount: m.amount,
			}));
		};

		const renderRows = () => {
			const fmt = n => me.formatCurrency(n);
			if (!me._paySched.length) {
				return `<tr><td colspan="5" style="padding:16px;text-align:center;color:#9ca3af;font-size:12px;">Select a payment combo to generate the schedule.</td></tr>`;
			}
			return me._paySched.map((p, i) => `
				<tr style="border-bottom:1px solid rgba(0,0,0,0.06);">
					<td style="padding:9px 10px;color:#9ca3af;font-size:11px;text-align:center;">${i + 1}</td>
					<td style="padding:9px 10px;font-size:12px;color:#111827;">${me.escapeAttr(p.description)}</td>
					<td style="padding:9px 10px;font-size:12px;color:#374151;text-align:right;">${p.credit_days > 0 ? p.credit_days + " days" : "On invoice"}</td>
					<td style="padding:9px 10px;font-size:12px;color:#374151;text-align:right;">${p.invoice_portion}%</td>
					<td style="padding:9px 10px;font-size:12px;text-align:right;font-weight:700;color:#3b7ef8;">${fmt(p.payment_amount)}</td>
				</tr>`).join("");
		};

		const renderSummary = () => {
			const fmt = n => me.formatCurrency(n);
			if (!me._paySched.length) {
				return `<div style="background:#f8fafc;border-radius:10px;padding:16px;text-align:center;color:#9ca3af;font-size:12px;">Select a payment combo to generate the schedule.</div>`;
			}
			const total = me._paySched.reduce((s, p) => s + Number(p.payment_amount || 0), 0);
			const count = me._paySched.length;
			const lines = me._paySched.map(p =>
				`${me.escapeAttr(p.description)} · ${p.invoice_portion}%`
			).join("  ·  ");
			return `
				<div style="background:#f8fafc;border-radius:10px;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;">
					<div style="min-width:0;">
						<div style="font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:.04em;margin-bottom:3px;">Payment Schedule</div>
						<div style="font-size:12px;color:#6b7280;white-space:normal;word-break:break-word;">${count} milestone${count !== 1 ? "s" : ""} · ${lines}</div>
					</div>
					<div style="text-align:right;flex-shrink:0;">
						<div style="font-size:22px;font-weight:700;color:#3b7ef8;font-family:Syne,sans-serif;">${fmt(total)}</div>
						<div style="font-size:11px;color:#9ca3af;">grand total, incl. tax</div>
					</div>
				</div>`;
		};

		const paint = () => {
			const showDays = combos[me._detailPayCombo] && combos[me._detailPayCombo].after > 0;
			$body.html(`
				<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap;">
					<select id="qlPayComboDetail" class="ql-field-input" style="max-width:340px;height:38px;">
						<option value="">Choose payment combo…</option>
						${Object.keys(combos).map(k => {
							const label = combos[k].custom ? "Custom (enter manually)" : describe(combos[k]) + (combos[k].permission ? " (Approval)" : "");
							return `<option value="${k}" ${me._detailPayCombo === k ? "selected" : ""}>${me.escapeAttr(label)}</option>`;
						}).join("")}
					</select>
				</div>
				<div id="qlPayTermsTableDetail" style="display:none;margin-bottom:14px;"></div>
				<div id="qlPaySchedSummary">${renderSummary()}</div>
				<div id="qlPaySaveBar" style="display:none;align-items:center;justify-content:space-between;padding:10px 0 0;margin-top:14px;border-top:1px solid rgba(0,0,0,0.06);">
					<span style="font-size:12px;color:#15803d;display:flex;align-items:center;gap:6px;"><i class="ti ti-pencil" style="font-size:13px;"></i> Payment terms have unsaved changes</span>
					<div style="display:flex;gap:8px;">
						<button id="qlPayDiscard" class="btn" type="button" style="height:30px;padding:0 12px;font-size:12px;">Discard</button>
						<button id="qlPaySave" class="btn btn-primary" type="button" style="height:30px;padding:0 14px;font-size:12px;background:#16a34a;border-color:#16a34a;display:flex;align-items:center;gap:5px;"><i class="ti ti-device-floppy" style="font-size:13px;"></i> Save Payment Terms</button>
					</div>
				</div>
			`);
		};

		paint();

		$body.off("change.qlPS", "#qlPayComboDetail").on("change.qlPS", "#qlPayComboDetail", (e) => {
			me._detailPayCombo = String($(e.currentTarget).val());
			me._detailCustAdv = 0; me._detailCustDel = 0; me._detailCustAfter = 0;
			me._detailDelDays = 0; me._detailPayDays = 0;
			buildFromCombo();
			paint();
			me.renderDetailPayTermsTable();
		});


		me.renderDetailPayTermsTable();

		

		$body.off("click.qlPS", "#qlPaySave").on("click.qlPS", "#qlPaySave", () => me._saveDetailPaymentSchedule());
		$body.off("click.qlPSd", "#qlPayDiscard").on("click.qlPSd", "#qlPayDiscard", () => me.injectPaymentSchedule());
	}



	_saveDetailPaymentSchedule() {
		const me = this;
		const record = me.detailRecord || {};
		if (!record.name) return;

		const total = me._paySched.reduce((s, p) => s + Number(p.invoice_portion || 0), 0);
		if (Math.round(total) !== 100) {
			frappe.msgprint(`Payment portions must total 100%. Currently ${total}%.`);
			return;
		}

		frappe.call({
			method: "frappe.client.get",
			args: { doctype: "Quotation", name: record.name },
			callback: (r) => {
				const doc = r.message;
				if (!doc) return;
				doc.payment_schedule = me._paySched.map(p => ({
					description: p.description,
					invoice_portion: p.invoice_portion,
					credit_days: p.credit_days,
					payment_amount: p.payment_amount,
					due_date_based_on: "Day(s) after invoice date",
					due_date: frappe.datetime.add_days(frappe.datetime.now_date(), Number(p.credit_days || 0)),
				}));
				// Custom Payment Terms grid (percentage + days rows)
				const dv = me._detailPayTermValues();
				doc.custom_payment_terms = [
					{ type: "Percentage", advance: String(dv.adv), on_delivery: String(dv.del), after_delivery: String(dv.after) },
					{ type: "Days",       advance: String(dv.advDays || 0), on_delivery: String(dv.delDays || 0), after_delivery: String(dv.afterDays || 0) },
				];

				// Guard: payment-schedule due dates must be unique
				const seenDates = {};
				for (const row of doc.payment_schedule) {
					const d = String(row.due_date || "");
					if (seenDates[d]) {
						frappe.msgprint(`Two payment milestones fall on the same due date (${d}). Enter different days in the Payment Terms table so each milestone has its own date.`);
						return;
					}
					seenDates[d] = true;
				}

				frappe.call({
					method: "frappe.client.save",
					args: { doc },
					callback: (r2) => {
						if (r2.message) {
							me.detailRecord = r2.message;
							me.injectPaymentSchedule();
							frappe.show_alert({ message: "Payment terms updated.", indicator: "green" });
						}
					},
					error: (err) => frappe.show_alert({ message: "Save failed (field may be locked on submitted quote).", indicator: "red" }),
				});
			},
		});
	}


	_checkPaymentApprovalGate(record) {
		const me = this;
		const cpt = Array.isArray(record.custom_payment_terms) ? record.custom_payment_terms : [];
		const pctRow = cpt.find(r => r.type === "Percentage");
		if (!pctRow) return Promise.resolve(true);

		const adv = Number(pctRow.advance || 0);
		const del = Number(pctRow.on_delivery || 0);
		const after = Number(pctRow.after_delivery || 0);
		const nonZeroCount = [adv, del, after].filter(v => v > 0).length;
		if (nonZeroCount < 3) return Promise.resolve(true);   // no approval needed

		return new Promise((resolve) => {
			frappe.call({
				method: "frappe.client.get_list",
				args: {
					doctype: "Payment Terms Approval",
					filters: { quotation: record.name, status: "Active" },
					fields: ["advance_pct", "on_delivery_pct", "after_delivery_pct"],
					limit_page_length: 1,
				},
				callback: (r) => {
					const approval = (r.message || [])[0];
					const matches = approval
						&& Number(approval.advance_pct) === adv
						&& Number(approval.on_delivery_pct) === del
						&& Number(approval.after_delivery_pct) === after;
					if (!matches) {
						frappe.msgprint({
							title: "Approval Required",
							indicator: "orange",
							message: "This quotation's payment terms split across all three milestones and require approval before the status can change or the document can be submitted. Please approve the current payment terms first.",
						});
					}
					resolve(!!matches);
				},
				error: () => resolve(false),
			});
		});
	}

	_doStatusChange(newStatus, record) {
		const me = this;
		frappe.call({
			method: "frappe.client.get",
			args: { doctype: "Quotation", name: record.name },
			callback: (r) => {
				const doc = r.message;
				if (!doc) return;
				doc.custom_status = newStatus;
				frappe.call({
					method: "frappe.client.save",
					args: { doc },
					callback: (r2) => {
						if (r2.message) {
							me.detailRecord = r2.message;
							frappe.show_alert({ message: `Status: ${newStatus}`, indicator: "green" });
							me.injectDetailHeader();
						}
					},
					error: () => frappe.show_alert({ message: "Failed to update status.", indicator: "red" }),
				});
			},
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

		this.detailActivities.forEach((a) => {
			const icon = iconMap[a.type] || "ti-notes";
			const color = colorMap[a.type] || "#9ca3af";
			$list.append(`
			<div class="act-item" data-tab="${a.tab}" data-status="${a.status}"
				style="display:flex;align-items:flex-start;gap:12px;padding:12px 16px;border-bottom:1px solid rgba(0,0,0,0.05);">
				<div style="width:30px;height:30px;border-radius:8px;background:${color}15;color:${color};display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;margin-top:1px;">
					<i class="ti ${icon}"></i>
				</div>
				<div style="flex:1;min-width:0;">
					<div style="font-size:13px;color:#111827;line-height:1.5;word-break:break-word;">${me.escapeAttr(a.title)}</div>
					<div style="font-size:11px;color:#9ca3af;margin-top:3px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
						<span>${me.escapeAttr(a.owner)}</span><span>·</span><span>${a.created}</span>
						${a.meta ? `<span>·</span><span style="color:#374151;">${me.escapeAttr(a.meta)}</span>` : ""}
					</div>
				</div>
				<div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0;margin-top:2px;">
					<span style="font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;background:${color}15;color:${color};white-space:nowrap;">${me.escapeAttr(a.type)}</span>
					${["Note","Call","Appointment","Task"].includes(a.type) ? `
					<button class="ql-act-edit" data-act-type="${a.type}" data-act-id="${me.escapeAttr(a.id)}"
						title="Edit" style="border:none;background:transparent;color:#9ca3af;cursor:pointer;padding:2px;display:inline-flex;">
						<i class="ti ti-pencil" style="font-size:13px;"></i>
					</button>` : ""}
				</div>
			</div>`);
		});

		$list.off("click.qlActEdit", ".ql-act-edit").on("click.qlActEdit", ".ql-act-edit", function (e) {
			e.preventDefault();
			e.stopPropagation();
			me._openActivityEditModal($(this).data("actType"), $(this).data("actId"));
		});

		this.applyFilter();
	}

	injectDetailAttachments() {
		const me = this;
		const $list = this.$content.find("#qlAttFileList");
		if (!$list.length) return;

		const extIcon = (name) => {
			const ext = (name || "").split(".").pop().toLowerCase();
			return { pdf: "ti-file-type-pdf", doc: "ti-file-type-doc", docx: "ti-file-type-doc", xls: "ti-file-spreadsheet", xlsx: "ti-file-spreadsheet", png: "ti-photo", jpg: "ti-photo", jpeg: "ti-photo" }[ext] || "ti-file";
		};
		const fmtSize = (b) => {
			if (!b) return "";
			if (b < 1024) return `${b} B`;
			if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
			return `${(b / 1048576).toFixed(1)} MB`;
		};

		const renderFiles = () => {
			if (!me.detailAttachments.length) {
				$list.html(`<div style="text-align:center;padding:8px;font-size:12px;color:#9ca3af;">No attachments yet</div>`);
				return;
			}
			$list.html(me.detailAttachments.map(f => `
				<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:#f8fafc;border:1px solid rgba(0,0,0,0.07);border-radius:8px;">
					<i class="ti ${extIcon(f.name)}" style="font-size:20px;color:#3b7ef8;flex-shrink:0;"></i>
					<div style="flex:1;min-width:0;">
						<a href="${me.escapeAttr(f.url)}" target="_blank" style="font-size:12px;font-weight:600;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;text-decoration:none;" onmouseenter="this.style.color='#3b7ef8'" onmouseleave="this.style.color='#111827'">
							${me.escapeAttr(f.name)}
						</a>
						<div style="font-size:10px;color:#9ca3af;margin-top:1px;">${fmtSize(f.size)}${f.size ? " · " : ""}${me.escapeAttr(f.owner)} · ${f.created}</div>
						${f.description ? `<div style="font-size:11px;color:#374151;margin-top:3px;font-style:italic;">${me.escapeAttr(f.description)}</div>` : ""}
					</div>
					<a href="${me.escapeAttr(f.url)}" download="${me.escapeAttr(f.name)}" style="width:26px;height:26px;border-radius:6px;border:1px solid rgba(0,0,0,0.1);background:#fff;display:flex;align-items:center;justify-content:center;color:#6b7280;text-decoration:none;flex-shrink:0;" title="Download">
						<i class="ti ti-download" style="font-size:13px;"></i>
					</a>
				</div>`).join(""));
		};

		renderFiles();

		this.$content.off("click.qlAtt", "#qlAttUploadZone").on("click.qlAtt", "#qlAttUploadZone", () => {
			const record = me.detailRecord || me.selectedRecord;
			if (!record?.name) return;
			const description = me.$content.find("#qlAttDescription").val().trim();
			new frappe.ui.FileUploader({
				doctype: "Quotation",
				docname: record.name,
				on_success: (file) => {
					if (description && file.name) {
						frappe.call({ method: "frappe.client.insert", args: { doc: { doctype: "Comment", comment_type: "Info", reference_doctype: "File", reference_name: file.name, content: description } } });
					}
					me.detailAttachments.unshift({ id: file.name, name: file.file_name || file.name, url: file.file_url || "", size: file.file_size || 0, owner: frappe.session.user, created: "Just now", description });
					me.$content.find("#qlAttDescription").val("");
					renderFiles();
					frappe.show_alert({ message: "File uploaded!", indicator: "green" });
				},
			});
		});
	}

	setPageTitle() {
		const record = this.detailRecord || this.selectedRecord;
		if (!record) { document.title = "Quotations"; this.page.set_title("Quotations"); return; }
		const customerName = this.$content.find(".customer-name").text().trim();
		const title = customerName ? `Quotation — ${customerName}` : "Quotation Detail";
		document.title = title;
		this.page.set_title("");
		$(this.wrapper).find(".page-head").css("display", "none");
	}

	// ─── ACTIVITY FILTERS ─────────────────────────────────
	// bindActivityFilters() {
	// 	const me      = this;
	// 	const $tabs   = this.$content.find("#actTabs");
	// 	const $filter = this.$content.find("#actFilter");

	// 	$tabs.off("click.ql", ".act-tab").on("click.ql", ".act-tab", (e) => {
	// 		const $t  = $(e.currentTarget);
	// 		const tab = String($t.data("tab") || "notes");
	// 		$tabs.find(".act-tab").css({ color: "#9ca3af", borderBottom: "2px solid transparent" });
	// 		$t.css({ color: "#3b7ef8", borderBottom: "2px solid #3b7ef8" });
	// 		me.activeTab = tab;
	// 		$filter.toggle(tab !== "attachments");
	// 		me.applyFilter();
	// 	});

	// 	$filter.off("click.ql", ".act-filter").on("click.ql", ".act-filter", (e) => {
	// 		const $f = $(e.currentTarget);
	// 		$filter.find(".act-filter").css({ background: "#f1f5f9", color: "#6b7280", border: "1px solid rgba(0,0,0,0.08)" });
	// 		$f.css({ background: "rgba(59,126,248,0.1)", color: "#3b7ef8", border: "1px solid rgba(59,126,248,0.2)" });
	// 		me.activeFilter = String($f.data("filter") || "all");
	// 		me.applyFilter();
	// 	});

	// 	this.applyFilter();
	// }
	bindActivityFilters() {
		const me = this;
		const $tabs = this.$content.find("#actTabs");
		const $filter = this.$content.find("#actFilter");
		const $actHeader = $tabs.closest(".card");

		$actHeader.off("click.qlTab", ".act-tab").on("click.qlTab", ".act-tab", (e) => {
			const tab = String($(e.currentTarget).data("tab") || "notes");
			$actHeader.find(".act-tab").removeClass("active");
			$(e.currentTarget).addClass("active");
			me.activeTab = tab;
			me.applyFilter();
		});

		$filter.off("click.ql", ".act-filter").on("click.ql", ".act-filter", (e) => {
			const $f = $(e.currentTarget);
			$filter.find(".act-filter").css({ background: "#f1f5f9", color: "#6b7280", border: "1px solid rgba(0,0,0,0.08)" });
			$f.css({ background: "rgba(59,126,248,0.1)", color: "#3b7ef8", border: "1px solid rgba(59,126,248,0.2)" });
			me.activeFilter = String($f.data("filter") || "all");
			me.applyFilter();
		});

		// sync the active TAB highlight on render
		$actHeader.find(".act-tab").removeClass("active");
		$actHeader.find(`.act-tab[data-tab="${me.activeTab}"]`).addClass("active");

		// sync the active FILTER pill highlight on render (Scheduled by default)
		$filter.find(".act-filter").css({ background: "#f1f5f9", color: "#6b7280", border: "1px solid rgba(0,0,0,0.08)" });
		$filter.find(`.act-filter[data-filter="${me.activeFilter}"]`)
			.css({ background: "rgba(59,126,248,0.1)", color: "#3b7ef8", border: "1px solid rgba(59,126,248,0.2)" });

		this.applyFilter();
	}

	// applyFilter() {
	// 	const isAttach = this.activeTab === "attachments";
	// 	this.$content.find("#activityList").toggle(!isAttach);
	// 	this.$content.find("#attachmentsPanel").toggleClass("hidden", !isAttach).toggle(isAttach);
	// 	this.$content.find("#actFilter").toggle(!isAttach);
	// 	this.$content.find("#actBottom").toggle(!isAttach);

	// 	if (!isAttach) {
	// 		this.$content.find("#activityList .act-item").each((_, item) => {
	// 			const $item  = $(item);
	// 			const tabOk  = $item.data("tab") === this.activeTab;
	// 			const filtOk = this.activeFilter === "all" || $item.data("status") === this.activeFilter;
	// 			$item.css("display", tabOk && filtOk ? "flex" : "none");
	// 		});
	// 	}

	// 	this.closeAllInputs();
	// 	this.renderBottomBtn();
	// }

	
	applyFilter() {
		if (!this.activeFilter) this.activeFilter = "scheduled";
		const isAttach = this.activeTab === "attachments";
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

	// ─── DETAIL BINDINGS ──────────────────────────────────
	// ─── DETAIL BINDINGS ──────────────────────────────────
	bindDetailActions() {
		this.$content.off("click.qlD");

		this.$content.on("click.qlD", ".ql-back-btn", () => frappe.set_route("quote-list"));

		this.$content.on("click.qlD", "#qlBtnOpenFrappe", () => {
			const record = this.detailRecord || this.selectedRecord;
			if (record?.name) frappe.set_route("Form", "Quotation", record.name);
		});

		this.$content.on("change.qlD", "#qlStatusSelect", (e) => {
			const me = this;
			const newStatus = $(e.currentTarget).val();
			const record = me.detailRecord || me.selectedRecord;
			if (!record?.name) return;

			me._checkPaymentApprovalGate(record).then((ok) => {
				if (!ok) {
					$(e.currentTarget).val(record.custom_status || "Draft");
					return;
				}
				me._doStatusChange(newStatus, record);
			});
		});

		this.$content.on("click.qlD", "#qlBtnSubmit", () => {
			const me = this;
			const record = me.detailRecord || me.selectedRecord;
			if (!record?.name) return;

			me._checkPaymentApprovalGate(record).then((ok) => {
				if (!ok) return;
				frappe.confirm("Submit this quotation? This will mark it Confirmed and items can't be edited.", () => {
					frappe.call({
						method: "frappe.client.submit",
						args: { doc: { ...me.detailRecord, custom_status: "Confirmed", docstatus: 1 } },
						callback: (r) => {
							if (r.message) {
								me.detailRecord = r.message;
								frappe.show_alert({ message: "Quotation confirmed!", indicator: "green" });
								me.renderDetailView();
							}
						},
						error: () => frappe.show_alert({ message: "Submit failed.", indicator: "red" }),
					});
				});
			});
		});

		this.$content.on("click.qlD", "#qlSaveItemsBtn", () => this.saveDetailItems());



		this.$content.on("click.qlD", "#qlBtnPdf", () => this.openPdfPreview());

		// Create → Customer Order Form (routes to custom cof-list new form, pre-filled)
		this.$content.on("click.qlD", "#qlBtnCreate", (e) => {
			const me = this;
			const record = me.detailRecord;
			if (!record?.name) return;

			this.runQuoteToCofGate(record, () => {
				// stash full quote data for the cof-list new form to pre-fill
				frappe._cofFromQuotation = {
					quotation_id: record.name,
					title: record.title || record.name,
					customer: record.party_name,
					customer_name: record.customer_name,
					company: record.company,
					transaction_date: record.transaction_date,
					customer_address: record.customer_address,
					shipping_address_name: record.shipping_address_name,
					company_address: record.company_address,
					contact_person: record.contact_person,
					contact_email: record.contact_email,
					contact_list: record.contact_list || [],
					tax_category: record.tax_category,
					taxes_and_charges: record.taxes_and_charges,
					taxes: record.taxes || [],
					tc_name: record.tc_name,
					terms: record.terms,
					payment_terms_template: record.payment_terms_template,
					payment_schedule: record.payment_schedule || [],
					sales_team: record.sales_team || [],
					items: (record.items || []).map(it => ({
						item_code: it.item_code, item_name: it.item_name, description: it.description,
						qty: it.qty, rate: it.rate, uom: it.uom, amount: it.amount,
						renewal_status: it.renewal_status, renewal_id: it.renewal_id,
					})),
				};
				frappe.set_route("cof-list", "new");
			});
		});



		// Connections dropdown
		this.$content.on("click.qlD", "#qlBtnConnections", (e) => {
			e.stopPropagation();
			const me = this;
			const record = me.detailRecord;
			if (!record?.name) return;

			// COFs only — no Sales Order Item query
			frappe.call({
				method: "frappe.client.get_list",
				args: { doctype: "Customer Order Form", filters: { quotation_id: record.name }, fields: ["name"], limit_page_length: 100 },
				callback: (rcof) => {
					const results = { so: [], cof: (rcof.message || []).map(r => r.name) };
					me._openConnectionsDropdown(e.currentTarget, results);
				},
				error: () => me._openConnectionsDropdown(e.currentTarget, { so: [], cof: [] }),
			});
		});



		this.$content.on("click.qlD", "[data-toggle-input]", (e) => {
			const tab = String($(e.currentTarget).data("toggleInput") || "");
			const cfg = this.tabConfig[tab]; if (!cfg?.inputId) return;
			const $el = this.$content.find(`#${cfg.inputId}`);
			const open = $el.is(":visible");
			this.closeAllInputs();
			if (!open) {
				$el.removeClass("hidden").show();
				$el.find("textarea,input:not([readonly])").first().focus();

				if (tab === "calls") {
					const record = this.detailRecord || this.selectedRecord;
					const today = new Date().toISOString().split("T")[0];
					const now = new Date().toTimeString().slice(0, 5);
					if (!this.$content.find("#callStartDate").val()) this.$content.find("#callStartDate").val(today);
					if (!this.$content.find("#callStartTime").val()) this.$content.find("#callStartTime").val(now);
					if (!this.$content.find("#callEndDate").val()) this.$content.find("#callEndDate").val(today);
					const custName = record?.party_name || record?.customer_name || this.selectedRecord?.party || "";
					this.$content.find("#callRelatedTo").val(custName);
				}
				if (tab === "tasks" && !this.$content.find("#taskDescHost").data("built")) {
					this._taskDescCtrl = frappe.ui.form.make_control({
						parent: this.$content.find("#taskDescHost").get(0),
						df: { fieldname: "ql_task_desc", fieldtype: "Text Editor", label: "" },
						render_input: true,
					});
					this.$content.find("#taskDescHost").data("built", true);
				}

				if (tab === "appointments") {
					const me = this;
					const record = this.detailRecord || this.selectedRecord;
					const custName = record?.party_name || record?.customer_name || this.selectedRecord?.party || "";
					this.$content.find("#apptCustomerName").val(custName);

					const now = new Date();
					now.setHours(now.getHours() + 1, 0, 0, 0);
					const pad = n => String(n).padStart(2, "0");
					const dt = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:00`;
					if (!this.$content.find("#apptScheduledTime").val())
						this.$content.find("#apptScheduledTime").val(dt);

					const contact = (me._detailContacts || [])[0];
					if (contact) {
						if (!this.$content.find("#apptCustomerEmail").val())
							this.$content.find("#apptCustomerEmail").val(contact.email || "");
						if (!this.$content.find("#apptCustomerPhone").val())
							this.$content.find("#apptCustomerPhone").val(contact.phone || "");
					}

					me._buildParticipantsPicker({
						triggerSel: "#apptPartTrigger",
						menuSel: "#apptPartMenu",
						labelSel: "#apptPartLabel",
						chipsSel: "#apptPartChips",
						preselected: [],
						ns: "qlApptPart",
					});
				}
			}
		});

		this.$content.on("click.qlD", "[data-close-tab]", (e) => {
			const tab = String($(e.currentTarget).data("closeTab") || "");
			const cfg = this.tabConfig[tab];
			if (cfg?.inputId) this.$content.find(`#${cfg.inputId}`).addClass("hidden").hide();
		});

		// ── Save Note ────────────────────────────────────
		// ── Save Note → CRM Note (on Quotation.notes) ─────
		this.$content.on("click.qlD", "[data-action='save-note']", () => {
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
						note: txtHtml,
						added_by: frappe.session.user,
						added_on: frappe.datetime.now_datetime(),
						parenttype: "Quotation",
						parentfield: "notes",
						parent: record?.name || "",
					}
				},
				callback: (r) => {
					if (r.message) {
						me.detailActivities.unshift({ id: r.message.name, title: txt, type: "Note", tab: "notes", owner: frappe.session.user, created: "Just now", status: "completed", meta: "" });
						me.injectDetailActivities();
						frappe.show_alert({ message: "Note saved!", indicator: "green" });
					}
					$note.val("");
					me.$content.find("#inputNotes").addClass("hidden").hide();
					me.applyFilter();
				},
				error: () => frappe.show_alert({ message: "Failed to save note.", indicator: "red" }),
			});
		});

		// ── Save Call ─────────────────────────────────────
		this.$content.on("click.qlD", "[data-action='save-call']", () => {
			const me = this;
			const record = me.detailRecord || me.selectedRecord;

			// double-submit guard
			const $btn = me.$content.find("[data-action='save-call']");
			if ($btn.prop("disabled")) return;

			const subject = me.$content.find("#callSubject").val().trim();
			const startDate = me.$content.find("#callStartDate").val().trim();
			const startTime = me.$content.find("#callStartTime").val().trim();
			const endDate = me.$content.find("#callEndDate").val().trim();
			const endTime = me.$content.find("#callEndTime").val().trim();
			const relatedTo = me.$content.find("#callRelatedTo").val().trim();
			const spName = me.$content.find("#callSalesTeam").val().trim();
			const status = me.$content.find("#callStatus").val() || "Scheduled";
			const description = me.$content.find("#callDescription").val().trim();

			if (!subject) { frappe.show_alert({ message: "Subject is required.", indicator: "orange" }); return; }

			$btn.prop("disabled", true);

			// build sales_team child row (with SP email/mobile fetched at prefill)
			const sp = me._callSP || {};
			const salesTeamRow = spName ? [{
				doctype: "sales_team",
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
						custom_date: new Date().toISOString().split("T")[0],
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
						reference: "Quotation",
						reference_to: record?.name || "",
					}
				},
				callback: (r) => {
					if (r.message) {
						me.detailActivities.unshift({
							id: r.message.name, title: subject, type: "Call", tab: "calls",
							owner: frappe.session.user, created: "Just now",
							status: (status === "Scheduled" ? "scheduled" : "completed"),
							meta: startDate ? `${startDate}${startTime ? " " + startTime : ""}` : ""
						});
						me.injectDetailActivities();
						frappe.show_alert({ message: "Call logged!", indicator: "green" });
					}
					me.$content.find("#callSubject,#callStartDate,#callStartTime,#callEndDate,#callEndTime,#callDescription").val("");
					me.$content.find("#callStatus").val("Scheduled");
					me._callSP = null;
					me.$content.find("#inputCalls").addClass("hidden").hide();
					$btn.prop("disabled", false);
					me.applyFilter();
				},
				error: () => {
					$btn.prop("disabled", false);
					frappe.show_alert({ message: "Failed to log call.", indicator: "red" });
				},
			});
		});



		// ── Save Appointment ──────────────────────────────
		this.$content.on("click.qlD", "[data-action='save-appointment']", () => {
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

			if (!subject) { frappe.show_alert({ message: "Subject is required.", indicator: "orange" }); return; }
			if (!scheduledTime) { frappe.show_alert({ message: "Scheduled time is required.", indicator: "orange" }); return; }

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
						reference: "Quotation",
						reference_to: record?.name || "",
					}
				},
				callback: (r) => {
					if (r.message) {
						const displayTime = scheduledTime
							? new Date(scheduledTime).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
							: "";
						me.detailActivities.unshift({
							id: r.message.name, title: subject, type: "Appointment", tab: "appointments",
							owner: frappe.session.user, created: "Just now", status: "scheduled", meta: displayTime,
						});
						me.injectDetailActivities();
						frappe.show_alert({ message: "Appointment scheduled!", indicator: "green" });
					}
					me.$content.find("#apptSubject, #apptScheduledTime, #apptCustomerPhone, #apptCustomerEmail, #apptDetails").val("");
					me.$content.find("#apptPartMenu").data("selected", new Set());
					me.$content.find("#apptPartChips").html("");
					me.$content.find("#apptPartLabel").text("Search & select participants…").css("color", "#9ca3af");
					me.$content.find("#inputAppointments").addClass("hidden").hide();
					me.applyFilter();
				},
				error: () => frappe.show_alert({ message: "Failed to schedule appointment.", indicator: "red" }),
			});
		});



		// Task: assign-user dropdown
		this.$content.on("click.qlD", "#taskAssignTrigger", (e) => {
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
								<input type="checkbox" class="ql-task-user" value="${this.escapeAttr(u.name)}" style="accent-color:#3b7ef8;width:14px;height:14px;cursor:pointer;">
								<span>${this.escapeAttr(u.full_name ? u.full_name + " (" + u.name + ")" : u.name)}</span>
							</label>`).join("")).data("loaded", true);
					},
				});
			}
		});
		this.$content.on("change.qlD", ".ql-task-user", () => {
			const n = this.$content.find(".ql-task-user:checked").length;
			this.$content.find("#taskAssignLabel").text(n ? `${n} user(s) selected` : "Select users…").css("color", n ? "#111827" : "#9ca3af");
		});

		// Task: save
		this.$content.on("click.qlD", "[data-action='save-task']", () => {
			const me = this;
			const record = me.detailRecord || me.selectedRecord;
			const subject = me.$content.find("#taskSubject").val().trim();
			if (!subject) { frappe.show_alert({ message: "Subject is required.", indicator: "orange" }); return; }
			const priority = me.$content.find("#taskPriority").val() || "Medium";
			const endRaw = me.$content.find("#taskEndDate").val();
			const endVal = endRaw ? endRaw.replace("T", " ") + ":00" : "";
			const desc = me._taskDescCtrl ? (me._taskDescCtrl.get_value() || "") : "";
			const users = me.$content.find(".ql-task-user:checked").map((_, el) => ({ user: el.value })).get();

			frappe.call({
				method: "frappe.client.insert",
				args: {
					doc: {
						doctype: "Task", subject, priority,
						exp_end_date: endVal, description: desc,
						reference: "Quotation", reference_to: record?.name || "",
						custom_users: users, status: "Open",
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
					me.$content.find(".ql-task-user").prop("checked", false);
					me.$content.find("#taskAssignLabel").text("Select users…").css("color", "#9ca3af");
					if (me._taskDescCtrl) me._taskDescCtrl.set_value("");
					me.$content.find("#inputTasks").addClass("hidden").hide();
					me.applyFilter();
				},
				error: () => frappe.show_alert({ message: "Failed to create task.", indicator: "red" }),
			});
		});

		// ── Save Comment ──────────────────────────────────
		this.$content.on("click.qlD", "[data-action='save-comment']", () => {
			const me = this;
			const record = me.detailRecord || me.selectedRecord;
			const $comment = me.$content.find("#commentText");
			const txt = ($comment.val() || "").trim();
			if (!txt) return;
			const mentionMap = me._mentionMap || {};
			let html = frappe.utils.escape_html ? frappe.utils.escape_html(txt) : txt;
			Object.keys(mentionMap).forEach(nameKey => {
				const email = mentionMap[nameKey];
				const span = `<span class="mention" data-id="${email}" data-value="${frappe.utils.escape_html(nameKey)}" data-denotation-char="@">@${frappe.utils.escape_html(nameKey)}</span>`;
				html = html.split("@" + nameKey).join(span);
			});

			frappe.call({
				method: "frappe.desk.form.utils.add_comment",
				args: {
					reference_doctype: "Quotation",
					reference_name: record?.name || "",
					content: html,
					comment_email: frappe.session.user,
					comment_by: frappe.session.user_fullname || frappe.session.user,
				},
				callback: (r) => {
					if (r.message) {
						me.detailActivities.unshift({ id: r.message.name, title: txt, type: "Comment", tab: "comments", owner: frappe.session.user, created: "Just now", status: "completed", meta: "" });
						me.injectDetailActivities();
						frappe.show_alert({ message: "Comment posted!", indicator: "green" });
					}
					$comment.val("");
					me._mentionMap = {};
					me.$content.find("#mentionDropdown").addClass("hidden").hide();
					me.$content.find("#inputComments").addClass("hidden").hide();
					me.applyFilter();
				},
				error: () => frappe.show_alert({ message: "Failed to post comment.", indicator: "red" }),
			});
		});


		// ── @-mention autocomplete (comments) ──────────────
		this.$content.on("input.qlD keyup.qlD", "#commentText", (e) => {
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
						me._mentionUsers = (r.message || []).filter(u => u.name && !["Administrator", "Guest"].includes(u.name)).map(u => ({ email: u.name, label: u.full_name || u.name }));
						filterAndPaint();
					},
				});
			}
		});

		// pick a mention → insert "@Full Name " and record email
		this.$content.on("click.qlD", ".mention-item", (e) => {
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

		$(document).off("click.qlD").on("click.qlD", (e) => {
			const $dd = this.$content.find("#mentionDropdown").get(0);
			if ((!$dd || !$dd.contains(e.target)) && e.target.id !== "commentText")
				this.$content.find("#mentionDropdown").addClass("hidden").hide();
			if (!$(e.target).closest("#taskAssignWrap").length)
				this.$content.find("#taskAssignMenu").hide();
		});
	}


	_checkPaymentApprovalGate(record) {
		const me = this;
		const cpt = Array.isArray(record.custom_payment_terms) ? record.custom_payment_terms : [];
		const pctRow = cpt.find(r => r.type === "Percentage");
		if (!pctRow) return Promise.resolve(true);   // no payment terms set → nothing to gate

		const adv = Number(pctRow.advance || 0);
		const del = Number(pctRow.on_delivery || 0);
		const after = Number(pctRow.after_delivery || 0);
		const nonZeroCount = [adv, del, after].filter(v => v > 0).length;

		if (nonZeroCount < 3) return Promise.resolve(true);   // not a 3-milestone split → no approval needed

		return new Promise((resolve) => {
			frappe.call({
				method: "frappe.client.get_list",
				args: {
					doctype: "Payment Terms Approval",
					filters: { quotation: record.name, status: "Active" },
					fields: ["advance_pct", "on_delivery_pct", "after_delivery_pct"],
					limit_page_length: 1,
				},
				callback: (r) => {
					const approval = (r.message || [])[0];
					const matches = approval
						&& Number(approval.advance_pct) === adv
						&& Number(approval.on_delivery_pct) === del
						&& Number(approval.after_delivery_pct) === after;

					if (!matches) {
						frappe.msgprint({
							title: "Approval Required",
							indicator: "orange",
							message: "This quotation's payment terms split across all three milestones (Advance / On Delivery / After Delivery) and require approval before the status can change or the document can be submitted. Please approve the current payment terms first.",
						});
					}
					resolve(!!matches);
				},
				error: () => {
					frappe.show_alert({ message: "Could not verify payment terms approval.", indicator: "red" });
					resolve(false);
				},
			});
		});
	}

	_doStatusChange(newStatus, record) {
		const me = this;
		frappe.call({
			method: "frappe.client.get",
			args: { doctype: "Quotation", name: record.name },
			callback: (r) => {
				const doc = r.message;
				if (!doc) return;
				doc.custom_status = newStatus;
				frappe.call({
					method: "frappe.client.save",
					args: { doc },
					callback: (r2) => {
						if (r2.message) {
							me.detailRecord = r2.message;
							frappe.show_alert({ message: `Status: ${newStatus}`, indicator: "green" });
							me.injectDetailHeader();   // refresh PDF visibility + badge
						}
					},
					error: () => frappe.show_alert({ message: "Failed to update status.", indicator: "red" }),
				});
			},
		});
	}

	_renderActivityEditModal(type, doctype, doc) {
		const me = this;
		$("#qlActEditOverlay").remove();
		const esc = (v) => me.escapeAttr(v == null ? "" : String(v));
		let body = "";

		if (type === "Note") {
			body = `
				<div class="ql-field">
					<label class="ql-field-label">Note</label>
					<textarea class="ql-field-input act-input" id="aeNote" rows="5" style="resize:vertical;">${esc(me._htmlToText(doc.note))}</textarea>
				</div>`;
		} else if (type === "Call") {
			const opts = ["Scheduled","Held","Cancelled","Not Responding"];
			body = `
				<div class="ql-field"><label class="ql-field-label">Subject</label>
					<input class="ql-field-input act-input" id="aeSubject" value="${esc(doc.subject)}"></div>
				<div class="ql-field" style="margin-top:10px;"><label class="ql-field-label">Status</label>
					<select class="ql-field-input act-input" id="aeStatus">
						${opts.map(o => `<option value="${o}" ${doc.status === o ? "selected" : ""}>${o}</option>`).join("")}
					</select></div>
				<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px;">
					<div class="ql-field"><label class="ql-field-label">Start Date</label>
						<input type="date" class="ql-field-input act-input" id="aeStartDate" value="${esc(doc.start_date)}"></div>
					<div class="ql-field"><label class="ql-field-label">Start Time</label>
						<input type="time" class="ql-field-input act-input" id="aeStartTime" value="${esc(doc.start_timing)}"></div>
					<div class="ql-field"><label class="ql-field-label">End Date</label>
						<input type="date" class="ql-field-input act-input" id="aeEndDate" value="${esc(doc.end_date)}"></div>
					<div class="ql-field"><label class="ql-field-label">End Time</label>
						<input type="time" class="ql-field-input act-input" id="aeEndTime" value="${esc(doc.end_timing)}"></div>
				</div>
				<div class="ql-field" style="margin-top:10px;"><label class="ql-field-label">Description</label>
					<textarea class="ql-field-input act-input" id="aeDesc" rows="3" style="resize:vertical;">${esc(doc.description)}</textarea></div>`;
		} else if (type === "Appointment") {
			const dt = (doc.scheduled_time || "").replace(" ", "T").slice(0, 16);
			body = `
				<div class="ql-field"><label class="ql-field-label">Subject</label>
					<input class="ql-field-input act-input" id="aeSubject" value="${esc(doc.subject)}"></div>
				<div class="ql-field" style="margin-top:10px;"><label class="ql-field-label">Scheduled Time</label>
					<input type="datetime-local" class="ql-field-input act-input" id="aeSched" value="${esc(dt)}"></div>
				<div class="ql-field" style="margin-top:10px;"><label class="ql-field-label">Details</label>
					<textarea class="ql-field-input act-input" id="aeDetails" rows="3" style="resize:vertical;">${esc(doc.customer_details)}</textarea></div>
				<div class="ql-field" style="margin-top:10px;">
					<label class="ql-field-label">Participants</label>
					<div style="position:relative;">
						<div id="aePartChips" style="margin-bottom:8px;display:flex;flex-wrap:wrap;"></div>
						<div id="aePartTrigger" style="border:1px solid rgba(0,0,0,0.12);border-radius:8px;padding:8px 12px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;background:#fff;">
							<span id="aePartLabel" style="font-size:12px;color:#9ca3af;">Search & select participants…</span>
							<i class="ti ti-chevron-down" style="font-size:13px;color:#9ca3af;"></i>
						</div>
						<div id="aePartMenu" style="display:none;position:absolute;top:calc(100% + 4px);left:0;right:0;max-height:240px;overflow-y:auto;background:#fff;border:1px solid rgba(0,0,0,0.1);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.12);z-index:9300;padding:6px;"></div>
					</div>
				</div>`;
		} else if (type === "Task") {
			const prio = ["Low","Medium","High"];
			const end = (doc.exp_end_date || "").replace(" ", "T").slice(0, 16);
			body = `
				<div class="ql-field"><label class="ql-field-label">Subject</label>
					<input class="ql-field-input act-input" id="aeSubject" value="${esc(doc.subject)}"></div>
				<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px;">
					<div class="ql-field"><label class="ql-field-label">Priority</label>
						<select class="ql-field-input act-input" id="aePriority">
							${prio.map(p => `<option value="${p}" ${doc.priority === p ? "selected" : ""}>${p}</option>`).join("")}
						</select></div>
					<div class="ql-field"><label class="ql-field-label">Expected End</label>
						<input type="datetime-local" class="ql-field-input act-input" id="aeEnd" value="${esc(end)}"></div>
				</div>
				<div class="ql-field" style="margin-top:10px;"><label class="ql-field-label">Description</label>
					<textarea class="ql-field-input act-input" id="aeDesc" rows="3" style="resize:vertical;">${esc(me._stripHtml(doc.description))}</textarea></div>
				<div class="ql-field" style="margin-top:10px;">
					<label class="ql-field-label">Assign To</label>
					<div style="position:relative;">
						<div id="aeTaskAssignChips" style="margin-bottom:8px;display:flex;flex-wrap:wrap;"></div>
						<div id="aeTaskAssignTrigger" style="border:1px solid rgba(0,0,0,0.12);border-radius:8px;padding:8px 12px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;background:#fff;">
							<span id="aeTaskAssignLabel" style="font-size:12px;color:#9ca3af;">Search & select users…</span>
							<i class="ti ti-chevron-down" style="font-size:13px;color:#9ca3af;"></i>
						</div>
						<div id="aeTaskAssignMenu" style="display:none;position:absolute;top:calc(100% + 4px);left:0;right:0;max-height:240px;overflow-y:auto;background:#fff;border:1px solid rgba(0,0,0,0.1);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.12);z-index:9300;padding:6px;"></div>
					</div>
				</div>`;
		}

		const $ov = $(`
		<div id="qlActEditOverlay" style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9200;display:flex;align-items:center;justify-content:center;padding:20px;">
			<div style="background:#fff;border-radius:16px;width:100%;max-width:520px;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 24px 64px rgba(0,0,0,0.18);">
				<div style="padding:16px 22px;border-bottom:1px solid rgba(0,0,0,0.08);display:flex;align-items:center;justify-content:space-between;">
					<div style="font-family:Syne,sans-serif;font-size:15px;font-weight:700;color:#111827;">Edit ${esc(type)}</div>
					<button id="aeClose" style="width:30px;height:30px;border-radius:50%;border:1px solid rgba(0,0,0,0.1);background:transparent;color:#9ca3af;cursor:pointer;display:flex;align-items:center;justify-content:center;"><i class="ti ti-x"></i></button>
				</div>
				<div class="ql-ae-body" style="flex:1;overflow-y:auto;overflow-x:visible;padding:18px 22px;">${body}</div>
				<div style="padding:12px 22px;border-top:1px solid rgba(0,0,0,0.08);display:flex;justify-content:flex-end;gap:8px;background:#f8fafc;">
					<button id="aeCancel" style="padding:8px 16px;border-radius:6px;border:1px solid rgba(0,0,0,0.1);background:#fff;font-size:13px;cursor:pointer;color:#374151;">Cancel</button>
					<button id="aeSave" class="btn btn-primary" style="padding:8px 20px;"><i class="ti ti-device-floppy" style="margin-right:4px;"></i>Save</button>
				</div>
			</div>
		</div>`);
		me.$content.append($ov);

		if (type === "Appointment") {
			const pre = (Array.isArray(doc.custom_participants) ? doc.custom_participants : []).map(r => r.user).filter(Boolean);
			me._buildParticipantsPicker({ triggerSel: "#aePartTrigger", menuSel: "#aePartMenu", labelSel: "#aePartLabel", chipsSel: "#aePartChips", preselected: pre, ns: "aeApptPart" });
			me._floatModalMenu("#aePartTrigger", "#aePartMenu");
		}
		if (type === "Task") {
			const pre = (Array.isArray(doc.custom_users) ? doc.custom_users : []).map(r => r.user).filter(Boolean);
			me._buildParticipantsPicker({ triggerSel: "#aeTaskAssignTrigger", menuSel: "#aeTaskAssignMenu", labelSel: "#aeTaskAssignLabel", chipsSel: "#aeTaskAssignChips", preselected: pre, ns: "aeTaskAssign" });
			me._floatModalMenu("#aeTaskAssignTrigger", "#aeTaskAssignMenu");
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
				const recId = me.detailRecord?.name || me.selectedRecord?.id;
				me.fetchDetailActivities(recId).then(() => me.injectDetailActivities());
			};

			if (type === "Note") {
				frappe.call({
					method: "renewal_module.api.update_crm_note",
					args: { name: doc.name, note: updates.note },
					callback: (r) => { if (r.message) afterSave(); },
					error: () => frappe.show_alert({ message: "Failed to update Note.", indicator: "red" }),
				});
			} else if (type === "Appointment") {
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



	_floatModalMenu(triggerSel, menuSel) {
		const me = this;
		const $trigger = me.$content.find(triggerSel);
		const $menu = me.$content.find(menuSel);
		if (!$trigger.length || !$menu.length) return;

		const reposition = () => {
			const t = $trigger[0].getBoundingClientRect();
			$menu.css({
				position: "fixed",
				top: (t.bottom + 4) + "px",
				left: t.left + "px",
				width: t.width + "px",
				right: "auto",
				zIndex: 9400,
			});
		};

		// reposition whenever the trigger is clicked (menu toggles open)
		$trigger.on("click.floatMenu", () => setTimeout(reposition, 0));
	}

	_buildParticipantsPicker(opts) {
		const me = this;
		const ns = opts.ns || "qlPart";
		const $menu = me.$content.find(opts.menuSel);
		const $trigger = me.$content.find(opts.triggerSel);
		const $label = me.$content.find(opts.labelSel);
		const $chips = me.$content.find(opts.chipsSel);
		if (!$menu.length) return;

		const selected = new Set(opts.preselected || []);
		$menu.data("selected", selected);

		const loadUsers = () => {
			if (me._mentionUsers) return Promise.resolve(me._mentionUsers);
			return new Promise(res => frappe.call({
				method: "frappe.client.get_list",
				args: { doctype: "User", fields: ["name", "full_name"], filters: { enabled: 1, user_type: "System User" }, limit_page_length: 0, order_by: "full_name asc" },
				callback: r => {
					me._mentionUsers = (r.message || []).filter(u => !["Administrator", "Guest"].includes(u.name)).map(u => ({ email: u.name, label: u.full_name || u.name }));
					res(me._mentionUsers);
				},
				error: () => { me._mentionUsers = []; res([]); },
			}));
		};
		const nameFor = (id) => { const u = (me._mentionUsers || []).find(x => x.email === id); return u ? u.label : id; };

		const renderChips = () => {
			if (!$chips.length) return;
			if (!selected.size) { $chips.html(`<span style="font-size:11px;color:#9ca3af;">No participants selected</span>`); return; }
			$chips.html([...selected].map(id => `
				<span style="display:inline-flex;align-items:center;gap:5px;background:rgba(59,126,248,0.1);color:#3b7ef8;font-size:11px;font-weight:600;padding:3px 8px;border-radius:14px;margin:2px 4px 2px 0;">
					${me.escapeAttr(nameFor(id))}
					<i class="ti ti-x ${ns}-chip-x" data-id="${me.escapeAttr(id)}" style="cursor:pointer;font-size:12px;"></i>
				</span>`).join(""));
		};
		const updateLabel = () => {
			const n = selected.size;
			$label.text(n ? `${n} participant(s) selected` : "Search & select participants…").css("color", n ? "#111827" : "#9ca3af");
		};
		const renderMenu = (filter) => {
			const q = (filter || "").toLowerCase();
			const users = (me._mentionUsers || []).filter(u => !q || u.label.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
			const list = users.map(u => `
				<label style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:6px;cursor:pointer;font-size:12px;color:#374151;">
					<input type="checkbox" class="${ns}-cb" value="${me.escapeAttr(u.email)}" ${selected.has(u.email) ? "checked" : ""} style="accent-color:#3b7ef8;width:14px;height:14px;cursor:pointer;">
					<span>${me.escapeAttr(u.label)} <span style="color:#9ca3af;">(${me.escapeAttr(u.email)})</span></span>
				</label>`).join("");
			$menu.html(`
				<div style="position:sticky;top:0;background:#fff;padding:4px 4px 8px;">
					<input type="text" class="${ns}-search ql-field-input" placeholder="Search users…" style="height:32px;font-size:12px;">
				</div>
				<div class="${ns}-list">${list || `<div style="padding:10px;color:#9ca3af;font-size:12px;">No users found</div>`}</div>`);
		};

		$trigger.off("click." + ns).on("click." + ns, (ev) => {
			ev.stopPropagation();
			const open = $menu.is(":visible");
			$menu.toggle(!open);
			if (!open) loadUsers().then(() => renderMenu(""));
		});
		$menu.off("input." + ns, "." + ns + "-search").on("input." + ns, "." + ns + "-search", function () {
			const q = (this.value || "").toLowerCase();
			const users = (me._mentionUsers || []).filter(u => !q || u.label.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
			$menu.find("." + ns + "-list").html(users.length
				? users.map(u => `
					<label style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:6px;cursor:pointer;font-size:12px;color:#374151;">
						<input type="checkbox" class="${ns}-cb" value="${me.escapeAttr(u.email)}" ${selected.has(u.email) ? "checked" : ""} style="accent-color:#3b7ef8;width:14px;height:14px;cursor:pointer;">
						<span>${me.escapeAttr(u.label)} <span style="color:#9ca3af;">(${me.escapeAttr(u.email)})</span></span>
					</label>`).join("")
				: `<div style="padding:10px;color:#9ca3af;font-size:12px;">No users found</div>`);
		});
		$menu.off("change." + ns, "." + ns + "-cb").on("change." + ns, "." + ns + "-cb", function () {
			if (this.checked) selected.add(this.value); else selected.delete(this.value);
			updateLabel(); renderChips();
		});
		me.$content.off("click." + ns + "chip", "." + ns + "-chip-x").on("click." + ns + "chip", "." + ns + "-chip-x", function (ev) {
			ev.stopPropagation();
			selected.delete($(this).data("id"));
			updateLabel(); renderChips();
			$menu.find("." + ns + "-cb[value='" + $.escapeSelector($(this).data("id")) + "']").prop("checked", false);
		});
		me.$content.off("click." + ns + "hide").on("click." + ns + "hide", (ev) => {
			if (!$(ev.target).closest(opts.menuSel + "," + opts.triggerSel).length) $menu.hide();
		});

		loadUsers().then(() => { updateLabel(); renderChips(); });
	}


	runQuoteToCofGate(record, onPass) {
		const oppId = record && record.opportunity;
		if (!oppId) { onPass(); return; }   // no linked opportunity → just proceed

		const quoteItemCodes = (record.items || [])
			.map((it) => it.item_code)
			.filter(Boolean);

		frappe.call({
			method: "frappe.client.get",
			args: { doctype: "Opportunity", name: oppId },
			callback: (r) => {
				const oppDoc = r && r.message;
				const oppItems = (oppDoc && oppDoc.items) || [];

				// Match opportunity items against the items being carried into this COF
				const relevantOppItems = quoteItemCodes.length
					? oppItems.filter((oi) => quoteItemCodes.includes(oi.item_code))
					: oppItems;

				const notClosedWon = relevantOppItems.filter((oi) => oi.sales_stage !== "Closed Won");

				// hard gate: every item going into this COF must be Closed Won
				if (notClosedWon.length) {
					const names = notClosedWon
						.map((oi) => oi.item_name || oi.item_code || "Item")
						.join(", ");
					frappe.throw(`Please change the sales stage to “Closed Won” for: ${names}`);
					return;
				}

				// ORC confirm chain
				frappe.confirm(
					"Does any item have ORC?",
					() => {   // Yes
						frappe.confirm(
							"Have you created the ORC?",
							() => onPass(),                                       // Yes → open COF wizard
							() => frappe.set_route("Form", "Opp-list", oppId)  // No  → go create ORC
						);
					},
					() => onPass()   // No ORC → open COF wizard
				);
			},
		});
	}

	_checkItemsMatchOpportunity() {
		const me = this;
		// only applies when the quote came from an opportunity
		if (!me.fromOpportunity) return { ok: true };
		const mismatches = [];
		(me.wizardItems || []).forEach((it, i) => {
			// only items that originated from the opportunity carry _oppQty/_oppRate
			if (it._oppQty === undefined && it._oppRate === undefined) return;
			const qty = Number(it.qty || 0);
			const rate = Number(it.sp || 0);
			const oQty = Number(it._oppQty || 0);
			const oRate = Number(it._oppRate || 0);
			if (qty !== oQty || rate !== oRate) {
				mismatches.push({ name: it.name || `Item ${i + 1}`, qty, rate, oQty, oRate });
			}
		});
		return { ok: mismatches.length === 0, mismatches };
	}





	// PDF button handler → preview modal
	openPdfPreview() {
		const me = this;
		const record = me.detailRecord || me.selectedRecord;
		if (!record?.name) return;
		me._showPdfPreviewModal(record.name);
	}

	_showPdfPreviewModal(docname) {
		const me = this;
		$("#qlPdfPreviewOverlay").remove();

		// standard print view URL (default format, no auto-trigger print)
		const printUrl = `/printview?doctype=Quotation&name=${encodeURIComponent(docname)}&trigger_print=0`;
		// direct PDF download URL (default format → omit &format=)
		const downloadUrl = `/api/method/frappe.utils.print_format.download_pdf?doctype=Quotation&name=${encodeURIComponent(docname)}`;

		const $overlay = $(`
		<div id="qlPdfPreviewOverlay" style="position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9000;display:flex;align-items:center;justify-content:center;padding:20px;">
			<div style="background:#fff;border-radius:14px;width:100%;max-width:880px;height:92vh;display:flex;flex-direction:column;box-shadow:0 24px 64px rgba(0,0,0,0.28);overflow:hidden;">
				<div style="padding:14px 20px;border-bottom:1px solid rgba(0,0,0,0.08);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
					<div style="font-family:Syne,sans-serif;font-size:15px;font-weight:700;color:#111827;display:flex;align-items:center;gap:8px;">
						<i class="ti ti-file-type-pdf" style="color:#dc2626;"></i> ${me.escapeAttr(docname)}
					</div>
					<div style="display:flex;gap:8px;align-items:center;">
						<button id="qlPdfPrint" style="padding:8px 18px;border-radius:6px;border:none;background:#3b7ef8;color:#fff;font-size:13px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:5px;">
							<i class="ti ti-printer"></i> Print
						</button>
						<button id="qlPdfClose" style="width:32px;height:32px;border-radius:6px;border:1px solid rgba(0,0,0,0.1);background:#fff;color:#6b7280;cursor:pointer;display:flex;align-items:center;justify-content:center;"><i class="ti ti-x"></i></button>
					</div>
				</div>
				<div style="flex:1;background:#525659;position:relative;">
					<div id="qlPdfLoading" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#cbd5e1;font-size:13px;">
						<i class="ti ti-loader-2" style="font-size:22px;margin-right:8px;animation:qlspin 1s linear infinite;"></i> Loading preview…
					</div>
					<iframe id="qlPdfFrame" src="${printUrl}" style="width:100%;height:100%;border:none;position:relative;z-index:1;" onload="(function(f){var l=document.getElementById('qlPdfLoading'); if(l) l.style.display='none'; try { var doc = f.contentDocument || f.contentWindow.document; var style = doc.createElement('style'); style.innerHTML = '.action-banner { display: none !important; }'; doc.head.appendChild(style); } catch(e) { console.error(e); } })(this)"></iframe>
				</div>
			</div>
		</div>
		<style>@keyframes qlspin{to{transform:rotate(360deg);}}</style>`);
		$("body").append($overlay);

		const close = () => $overlay.remove();
		$overlay.on("click", "#qlPdfClose", close);
		$overlay.on("click", (e) => { if ($(e.target).is($overlay)) close(); });
		$overlay.on("click", "#qlPdfPrint", () => {
			const frame = $overlay.find("#qlPdfFrame").get(0);
			if (frame && frame.contentWindow) {
				frame.contentWindow.focus();
				frame.contentWindow.print();
			}
		});
	}




	_openConnectionsDropdown(btnEl, results) {
		const me = this;
		$("#qlConnectionsDropdown").remove();

		const items = [];
		(results.so || []).forEach(name => items.push({ route: "sales-order", name, icon: "ti-clipboard-check", color: "#16a34a", label: "Sales Order" }));
		(results.cof || []).forEach(name => items.push({ route: "cof-list", name, icon: "ti-file-invoice", color: "#3b7ef8", label: "Customer Order Form" }));

		const rect = btnEl.getBoundingClientRect();

		const inner = items.length
			? items.map(it => `
				<div class="ql-conn-item" data-route="${it.route}" data-name="${me.escapeAttr(it.name)}"
					style="display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;transition:background .12s;border-bottom:1px solid rgba(0,0,0,0.05);">
					<i class="ti ${it.icon}" style="color:${it.color};font-size:16px;flex-shrink:0;"></i>
					<div style="min-width:0;">
						<div style="font-size:12px;font-weight:600;color:#111827;white-space:nowrap;">${me.escapeAttr(it.name)}</div>
						<div style="font-size:10px;color:#9ca3af;">${it.label}</div>
					</div>
				</div>`).join("")
			: `<div style="padding:18px 16px;text-align:center;color:#9ca3af;font-size:12px;">No linked documents</div>`;

		const $dd = $(`
			<div id="qlConnectionsDropdown" style="position:fixed;top:${rect.bottom + 6}px;left:${rect.left}px;min-width:240px;max-width:320px;max-height:340px;overflow-y:auto;background:#fff;border:1px solid rgba(0,0,0,0.1);border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,0.15);z-index:9999;">
				${inner}
			</div>`);
		$("body").append($dd);

		// keep within viewport (right-align if overflowing)
		const ddRect = $dd[0].getBoundingClientRect();
		if (ddRect.right > window.innerWidth - 8) {
			$dd.css({ left: "auto", right: (window.innerWidth - rect.right) + "px" });
		}

		$dd.on("mouseenter", ".ql-conn-item", function () { $(this).css("background", "#f1f5f9"); });
		$dd.on("mouseleave", ".ql-conn-item", function () { $(this).css("background", "transparent"); });

		$dd.on("click", ".ql-conn-item", function () {
			const route = $(this).data("route");
			const name = $(this).data("name");
			$dd.remove();
			if (route === "sales-order") {
				frappe.set_route("Form", "Sales Order", name);
			} else {
				frappe.set_route(route, name);   // cof-list detail
			}
		});

		// close on outside click
		setTimeout(() => {
			$(document).on("click.qlConnDD", (ev) => {
				if (!$(ev.target).closest("#qlConnectionsDropdown, #qlBtnConnections").length) {
					$dd.remove();
					$(document).off("click.qlConnDD");
				}
			});
		}, 0);
	}








	// ─── NEW FORM ─────────────────────────────────────────
	renderNewView() {
		this.page.set_title("New Quotation");
		document.title = "New Quotation";
		$("#support-page-content").removeClass("ql-content-fixed").addClass("ql-content-scroll");
		this.$content.html(frappe.quote_list_page_template.newForm);
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
						this.$content.find("#qlFCustomer").val(label);
						this.onCustomerSelected(customer.name);
					}
				}
			});
		}
	}

	initWizard() {
		const me = this;
		me.wizardStep = 1;
		me.wizardItems = [];
		me.wizardFiles = [];
		me.wizardContacts = [];
		me.wizardCustomers = [];
		me.wizardERP_Items = [];
		me.customerAddresses = [];
		me.companyAddresses = [];

		me._addrSlots = {
			billing: { label: "Billing Address", inputId: "qlFAddress", cardId: "qlAddrCard", listKey: "customerAddresses", accent: "#3b7ef8", icon: "ti-map-pin", empty: "Select a customer first to load addresses." },
			shipping: { label: "Shipping Address", inputId: "qlFShipAddress", cardId: "qlShipAddrCard", listKey: "customerAddresses", accent: "#16a34a", icon: "ti-truck-delivery", empty: "Select a customer first to load addresses." },
			company: { label: "Company Address", inputId: "qlFCompanyAddress", cardId: "qlCompanyAddrCard", listKey: "companyAddresses", accent: "#d97706", icon: "ti-building", empty: "Select a company first to load addresses." },
		};
		["billing", "shipping", "company"].forEach(k => me.renderAddressSlot(k));
		me.selectedCustomerDoc = null;
		me._payCombo = "";
		me._payAfterDays = 0;
		me._payDelDays = 0;
		me._payCustomAdv = 0;
		me._payCustomDel = 0;
		me._payCustomAfter = 0;
		me._payApproved = false;
		me._wizardTaxAmount = 0;
		me._wizardCustomerGstCategory = "";
		me._wizardBillGstCategory = "";
		me._wizardShipGstCategory = "";
		me.itemLookupReqSeq = 0;
		me.defaultCompanyName = "64 Network Security Pvt Ltd - TG";

		// Fetch customers
		frappe.call({
			method: "frappe.client.get_list",
			args: { doctype: "Customer", fields: ["name", "customer_name", "customer_group", "territory"], limit_page_length: 500, order_by: "customer_name asc" },
			callback: (r) => {
				me.wizardCustomers = (r.message || []).map(c => ({
					v: c.customer_name || c.name, s: c.name,
					g: c.customer_group || "",
					i: (c.customer_name || c.name).substring(0, 2).toUpperCase(),
				}));
			}
		});

		// Fetch ERPNext items
		frappe.call({
			method: "frappe.client.get_list",
			args: { doctype: "Item", fields: ["name", "item_name", "item_code", "item_group", "brand", "description", "stock_uom", "standard_rate"], filters: { disabled: 0 }, limit_page_length: 500, order_by: "item_name asc" },
			callback: (r) => {
				me.wizardERP_Items = (r.message || []).map((it, idx) => ({
					id: idx + 1, name: it.item_name || it.name, code: it.item_code || it.name,
					group: it.item_group || "General", brand: it.brand || "—",
					description: it.description || "", uom: it.stock_uom || "Nos",
					sp: Number(it.standard_rate || 0), bp: 0,
				}));
			}
		});

		// Back button
		me.$content.on("click.qlNew", ".ql-back-btn", () => frappe.set_route("quote-list"));

		// Stepper click (backward only)
		me.$content.on("click.qlNew", ".ql-step", (e) => {
			const n = parseInt($(e.currentTarget).data("step"));
			if (n < me.wizardStep) me.goWizardStep(n);
		});

		// Next / Back buttons
		me.$content.on("click.qlNew", "[data-wiz-next]", (e) => {
			const n = parseInt($(e.currentTarget).data("wizNext"));
			if (me.validateWizardStep(me.wizardStep)) me.goWizardStep(n);
		});
		me.$content.on("click.qlNew", "[data-wiz-back]", (e) => {
			me.goWizardStep(parseInt($(e.currentTarget).data("wizBack")));
		});

		// Customer live search
		me.$content.on("input.qlNew focus.qlNew", "#qlFCustomer", (e) => {
			me.searchLiveLink($(e.currentTarget), "#qlCustDD", "Customer", "customer_name", ".ql-cust-item", "ti-building-store");
		});
		me.$content.on("keydown.qlNew", "#qlFCustomer", (e) => me.linkKeyNav(e, "#qlCustDD"));
		me.$content.on("mousedown.qlNew", ".ql-cust-item", (e) => {
			e.preventDefault();
			const $item = $(e.currentTarget);
			me.$content.find("#qlFCustomer").val($item.data("label"));
			me.$content.find("#qlCustDD").removeClass("open");
			me.onCustomerSelected($item.data("docname"));
		});

		// Company live search
		me.$content.on("input.qlNew focus.qlNew", "#qlFCompany", (e) => {
			me.searchLiveLink($(e.currentTarget), "#qlCompanyDD", "Company", "name", ".ql-company-item", "ti-building");
		});
		me.$content.on("keydown.qlNew", "#qlFCompany", (e) => me.linkKeyNav(e, "#qlCompanyDD"));
		me.$content.on("mousedown.qlNew", ".ql-company-item", (e) => {
			e.preventDefault();
			const company = $(e.currentTarget).data("label");
			me.$content.find("#qlFCompany").val(company);
			me.$content.find("#qlCompanyDD").removeClass("open");
			me.loadCompanyAddresses(company);
		});

		// Salesperson live search
		me.$content.on("input.qlNew focus.qlNew", "#qlFSalesperson", (e) => {
			me.searchLiveLink($(e.currentTarget), "#qlSpDD", "Sales Person", "name", ".ql-sp-item", "ti-user-check");
		});
		me.$content.on("keydown.qlNew", "#qlFSalesperson", (e) => me.linkKeyNav(e, "#qlSpDD"));
		me.$content.on("mousedown.qlNew", ".ql-sp-item", (e) => {
			e.preventDefault();
			const $item = $(e.currentTarget);
			const name = $item.data("label");
			const doc = $item.data("docname");
			me.$content.find("#qlFSalesperson").val(name).attr("data-docname", doc);
			me.$content.find("#qlSpDD").removeClass("open");
			me.fillSpCard(name, "", "");
			frappe.call({
				method: "frappe.client.get",
				args: { doctype: "Sales Person", name: doc },
				callback: (r) => {
					const sp = r.message || {};
					if (sp.email_id || sp.email) { me.fillSpCard(name, sp.email_id || sp.email, sp.mobile_no || sp.mobile || ""); return; }
					const empId = sp.employee || "";
					if (!empId) { me.fillSpCard(name, "", ""); return; }
					frappe.call({
						method: "frappe.client.get",
						args: { doctype: "Employee", name: empId },
						callback: (r2) => {
							const emp = r2.message || {};
							me.fillSpCard(name, emp.company_email || emp.personal_email || "", emp.cell_number || emp.mobile_no || "");
						},
						error: () => me.fillSpCard(name, "", ""),
					});
				},
				error: () => me.fillSpCard(name, "", ""),
			});
		});
		me.$content.on("click.qlNew", "#qlSpCardClear", () => {
			me.$content.find("#qlFSalesperson").val("").removeAttr("data-docname");
			me.$content.find("#qlSpCard").hide();
		});

		// Payment Terms live search
		me.$content.on("change.qlNew", "#qlPayComboSelect", (e) => {
			me.selectPayCombo(String($(e.currentTarget).val()));
		});
		me.$content.on("change.qlNew", "#qlPayAfterDays", (e) => {
			me._payAfterDays = parseInt($(e.currentTarget).val()) || 0;
			me.renderPaymentScheduleFromCombo();
		});
		me.$content.on("change.qlNew", "#qlPayApprovedChk", (e) => {
			me._payApproved = $(e.currentTarget).prop("checked");
		});
		// Taxes & Charges live search
		me.$content.on("input.qlNew focus.qlNew", "#qlFTaxes", (e) => me.searchLiveLink($(e.currentTarget), "#qlTaxesDD", "Sales Taxes and Charges Template", "name", ".ql-taxes-item", "ti-percentage"));
		me.$content.on("keydown.qlNew", "#qlFTaxes", (e) => me.linkKeyNav(e, "#qlTaxesDD"));
		me.$content.on("mousedown.qlNew", ".ql-taxes-item", (e) => {
			e.preventDefault();
			const tpl = $(e.currentTarget).data("label");
			me.$content.find("#qlFTaxes").val(tpl);
			me.$content.find("#qlTaxesDD").removeClass("open");
			me.renderTaxBreakdown(tpl);    // ← show the tax rows
		});

		me.$content.on("click.qlNew", ".ql-addr-add, .ql-addr-change", (e) => {
			me.openAddressPicker(String($(e.currentTarget).data("addrSlot")));
		});
		me.$content.on("click.qlNew", ".ql-addr-remove", (e) => {
			const slotKey = String($(e.currentTarget).data("addrSlot"));
			const slot = me._addrSlots[slotKey];
			if (!slot) return;
			me.$content.find(`#${slot.inputId}`).val("");
			me.renderAddressSlot(slotKey);
		});

		// // Customer Address — list restricted to selected customer's addresses
		// me.$content.on("focus.qlNew input.qlNew", "#qlFAddress", (e) =>
		// 	me.renderAddressOptions($(e.currentTarget), "#qlAddressDD", me.customerAddresses, "ql-address-item", "Select a customer first to load its addresses."));
		// me.$content.on("mousedown.qlNew", ".ql-address-item", (e) => {
		// 	e.preventDefault();
		// 	me.$content.find("#qlFAddress").val($(e.currentTarget).data("name"));
		// 	me.$content.find("#qlAddressDD").removeClass("open");
		// 	me._syncAddressCard("#qlFAddress", "#qlAddrCard", me.customerAddresses);   // ← add
		// });

		// 		// Shipping Address — list restricted to selected customer's addresses
		// 		me.$content.on("focus.qlNew input.qlNew", "#qlFShipAddress", (e) =>
		// 			me.renderAddressOptions($(e.currentTarget), "#qlShipAddressDD", me.customerAddresses, "ql-shipaddress-item", "Select a customer first to load its addresses."));
		// 		me.$content.on("mousedown.qlNew", ".ql-shipaddress-item", (e) => {
		//     e.preventDefault();
		//     me.$content.find("#qlFShipAddress").val($(e.currentTarget).data("name"));
		//     me.$content.find("#qlShipAddressDD").removeClass("open");
		//     me._syncAddressCard("#qlFShipAddress", "#qlShipAddrCard", me.customerAddresses);   // ← add
		// });

		// 		// Company Address — list restricted to selected company's addresses
		// 		me.$content.on("focus.qlNew input.qlNew", "#qlFCompanyAddress", (e) =>
		// 			me.renderAddressOptions($(e.currentTarget), "#qlCompanyAddressDD", me.companyAddresses, "ql-companyaddress-item", "Select a company first to load its addresses."));
		// 		me.$content.on("mousedown.qlNew", ".ql-companyaddress-item", (e) => {
		//     e.preventDefault();
		//     me.$content.find("#qlFCompanyAddress").val($(e.currentTarget).data("name"));
		//     me.$content.find("#qlCompanyAddressDD").removeClass("open");
		//     me._syncAddressCard("#qlFCompanyAddress", "#qlCompanyAddrCard", me.companyAddresses);   // ← add
		// });

		// Terms & Conditions live search
		me.$content.on("input.qlNew focus.qlNew", "#qlFTerms", (e) => me.searchLiveLink($(e.currentTarget), "#qlTermsDD", "Terms and Conditions", "name", ".ql-terms-item", "ti-file-text"));
		me.$content.on("keydown.qlNew", "#qlFTerms", (e) => me.linkKeyNav(e, "#qlTermsDD"));
		me.$content.on("mousedown.qlNew", ".ql-terms-item", (e) => {
			e.preventDefault();
			const tpl = $(e.currentTarget).data("label");
			me.$content.find("#qlFTerms").val(tpl);
			me.$content.find("#qlTermsDD").removeClass("open");
			me.renderTermsContent(tpl);   // ← show content
		});

		$(document).on("click.qlNewLink", (e) => {
			if (!$(e.target).closest(".ql-link-wrap").length)
				me.$content.find(".ql-link-dd").removeClass("open");
		});

		// Add Item dropdown
		me.$content.on("click.qlNew", "#qlAddItemBtn", (e) => {
			e.stopPropagation();
			const $m = me.$content.find("#qlAddItemMenu");
			$m.css("display", $m.css("display") === "none" ? "block" : "none");
		});
		$(document).on("click.qlNewItem", (e) => {
			if (!$(e.target).closest("#qlAddItemWrap").length)
				me.$content.find("#qlAddItemMenu").css("display", "none");
		});
		me.$content.on("click.qlNew", "[data-item-popup]", (e) => {
			const type = $(e.currentTarget).data("itemPopup");
			me.$content.find("#qlAddItemMenu").css("display", "none");
			me.openItemPopup(type);
		});

		// Item row delete
		me.$content.on("click.qlNew", ".ql-item-del-btn", (e) => {
			e.stopPropagation();
			const idx = parseInt($(e.currentTarget).data("idx"));
			if (!Number.isFinite(idx) || !me.wizardItems[idx]) return;
			const itemName = me.wizardItems[idx].name || `Item ${idx + 1}`;
			me._showDeleteConfirm(itemName, () => { me.wizardItems.splice(idx, 1); me.renderItemsTable(); });
		});

		// Item qty/sp/bp inline edits
		me.$content.on("input.qlNew", ".ql-item-sp, .ql-item-bp, .ql-item-qty", (e) => {
			const idx = parseInt($(e.currentTarget).closest("tr").data("idx"));
			if (!Number.isFinite(idx) || !me.wizardItems[idx]) return;
			me.wizardItems[idx].qty = parseFloat(me.$content.find(`[data-idx="${idx}"] .ql-item-qty`).val()) || 1;
			me.wizardItems[idx].sp = parseFloat(me.$content.find(`[data-idx="${idx}"] .ql-item-sp`).val()) || 0;
			me.wizardItems[idx].bp = parseFloat(me.$content.find(`[data-idx="${idx}"] .ql-item-bp`).val()) || 0;
			me.calcTotals();
		});

		// Attachment upload
		me.$content.on("change.qlNew", "#qlFileInput", (e) => me.handleFiles(e.target.files));

		// Submit
		me.$content.on("click.qlNew", "#qlSubmitForm", () => me.submitWizard());
		me.$content.on("click.qlNew", "#qlSaveDraft", () => frappe.show_alert({ message: "Draft saved!", indicator: "blue" }));

		// Pre-fill company
		if (!me.$content.find("#qlFCompany").val().trim()) {
			me.$content.find("#qlFCompany").val(me.defaultCompanyName);
		}
		me.loadCompanyAddresses(me.$content.find("#qlFCompany").val().trim());

		// Prefill from a source Opportunity (set by opp-list "Create → Quotation")
		// me.fromOpportunity = "";
		// if (frappe._quoteFromOpportunity) {
		// 	const oppId = frappe._quoteFromOpportunity;
		// 	frappe._quoteFromOpportunity = null;
		// 	me.prefillFromOpportunity(oppId);
		// }
		me.fromOpportunity = "";
		if (frappe._quoteFromOpportunity) {
			const payload = frappe._quoteFromOpportunity;
			frappe._quoteFromOpportunity = null;
			const oppId = (payload && typeof payload === "object") ? payload.opportunity : payload;
			const selectedItems = (payload && typeof payload === "object" && Array.isArray(payload.items)) ? payload.items : null;
			me.prefillFromOpportunity(oppId, selectedItems);
		}
		// default terms & conditions
		if (!me.$content.find("#qlFTerms").val().trim()) {
			me.$content.find("#qlFTerms").val("Standard_Terms and Conditions");
			me.renderTermsContent("Standard_Terms and Conditions");
		}
		me.renderPayCombos();
	}

	// ── Prefill the wizard from an Opportunity ──────────────
	prefillFromOpportunity(oppId, selectedItems) {
		const me = this;
		if (!oppId) return;
		me.fromOpportunity = oppId;

		frappe.call({
			method: "frappe.client.get",
			args: { doctype: "Opportunity", name: oppId },
			callback: (r) => {
				const opp = r.message;
				if (!opp) return;

				// Subject
				const subject = opp.title || `Quotation against ${oppId}`;
				me.$content.find("#qlFSubject").val(subject);

				// Company (opportunity wins over customer auto-fill)
				if (opp.company) {
					me.$content.find("#qlFCompany").val(opp.company);
					me.loadCompanyAddresses(opp.company);
				}

				// Customer Address — keep the opportunity's address if it has one
				if (opp.customer_address) me.$content.find("#qlFAddress").val(opp.customer_address);

				// ── Items → wizard items ──────────────────────────
				// ── Items → wizard items ──────────────────────────
				const allOppItems = Array.isArray(opp.items) ? opp.items : [];
				// Filter to only the items the person checked in the opp-list popup.
				// Match by the Opportunity Item child row name (most reliable), falling
				// back to item_code if a row name isn't present.
				let items = allOppItems;
				if (Array.isArray(selectedItems) && selectedItems.length) {
					const selectedNames = new Set(selectedItems.map(it => it.name).filter(Boolean));
					const selectedCodes = new Set(selectedItems.map(it => it.item_code).filter(Boolean));
					items = allOppItems.filter(it =>
						(it.name && selectedNames.has(it.name)) ||
						(!it.name && it.item_code && selectedCodes.has(it.item_code))
					);
				}

				// DEBUG: what the opportunity actually returned
				console.log("RAW opp.items:", JSON.stringify(
					items.map(it => ({
						name: it.item_name,
						opportunity_type: it.opportunity_type,
						renewal_id: it.renewal_id,
						orc: it.orc,
					})), null, 2));
				// Carry over ALL contacts from the opportunity's contact_list
				const oppContacts = Array.isArray(opp.contact_list) ? opp.contact_list : [];
				me.wizardContacts = oppContacts.map(c => ({
					docname: c.user_name || "",      // Contact docname (Link field)
					name: c.user_name || "—",     // display
					email: c.email_id || "",
					phone: c.mobile_no || "",
					role: c.designation || "",
				}));
				// set POC index from the row with poc===1
				const pocPos = oppContacts.findIndex(c => Number(c.poc) === 1);
				me.wizardPocIndex = pocPos >= 0 ? pocPos : 0;

				me.wizardItems = items.map(it => ({
					name: it.item_name || it.item_code || "—",
					code: it.item_code || "",
					brand: it.brand || "—",
					group: it.item_group || "General",
					description: it.description || "",
					renewal_status: (it.opportunity_type || "new").toLowerCase(),  // type field
					type: (it.opportunity_type || "new").toLowerCase(),   // in-memory
					qty: Number(it.qty || 1),
					uom: it.uom || it.stock_uom || "Nos",
					sp: Number(it.rate || 0),
					_oppQty: Number(it.qty || 1),
					_oppRate: Number(it.rate || 0),
					bp: Number(it.spq_rate || 0),
					discount: 0,
					orc: !!(it.orc),
					commission_type: it.commission_type || "",
					rate_value: Number(it.rate_value || 0),
					renewal_id: it.renewal_id || "",                            // renewal id
					_oppItemName: it.name || "",          // ← capture the Opportunity Item row name
				}));

				// DEBUG: what got mapped into the cards
				console.log("MAPPED wizardItems:", JSON.stringify(
					me.wizardItems.map(i => ({
						name: i.name,
						renewal_status: i.renewal_status,
						renewal_id: i.renewal_id,
						orc: i.orc,
					})), null, 2));

				me.renderItemsTable();

				// Customer — only the standard "Customer" opportunity_from maps cleanly
				const party = opp.party_name || "";
				if (party && (opp.opportunity_from === "Customer" || !opp.opportunity_from)) {
					me.$content.find("#qlFCustomer").val(opp.customer_name || party);
					me._prefillContactPerson = "";
					me.onCustomerSelected(party, { skipCompany: !!opp.company });
				} else if (party) {
					me.$content.find("#qlFCustomer").val(opp.customer_name || party);
				}

				// Carry sales team from opportunity
				const oppSalesTeam = Array.isArray(opp.sales_team) ? opp.sales_team : [];
				me._quoteSalesTeam = oppSalesTeam.map(st => ({
					sales_person: st.sales_person,
					allocated_percentage: st.allocated_percentage || 100,
				}));
				// also fill the salesperson display field if you have one
				if (oppSalesTeam.length) {
					const sp = oppSalesTeam[0];
					me.$content.find("#qlFSalesperson").val(sp.sales_person || "").attr("data-docname", sp.sales_person || "");
				}
			},
		});
	}

	// ── Delete confirm modal ────────────────────────────────
	_showDeleteConfirm(itemName, onConfirm) {
		$("#qlDelConfirmOverlay").remove();
		const $overlay = $(`
		<div id="qlDelConfirmOverlay" style="position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:9100;display:flex;align-items:center;justify-content:center;padding:20px;">
			<div style="background:#fff;border-radius:16px;width:100%;max-width:380px;box-shadow:0 24px 64px rgba(0,0,0,0.18);overflow:hidden;">
				<div style="padding:24px 24px 0;text-align:center;">
					<div style="width:52px;height:52px;border-radius:50%;background:rgba(220,38,38,0.08);border:2px solid rgba(220,38,38,0.15);display:flex;align-items:center;justify-content:center;margin:0 auto 14px;">
						<i class="ti ti-trash" style="font-size:22px;color:#dc2626;"></i>
					</div>
					<div style="font-family:'Syne',sans-serif;font-size:16px;font-weight:700;color:#111827;margin-bottom:8px;">Remove Item?</div>
					<div style="font-size:13px;color:#6b7280;line-height:1.6;">Are you sure you want to remove<br><strong style="color:#111827;">${this.escapeAttr(itemName)}</strong>?</div>
				</div>
				<div style="display:flex;gap:10px;padding:20px 24px 24px;">
					<button id="qlDelCancel" style="flex:1;height:38px;border-radius:8px;border:1px solid rgba(0,0,0,0.12);background:#f7f8fa;color:#374151;font-size:13px;cursor:pointer;">Cancel</button>
					<button id="qlDelConfirm" style="flex:1;height:38px;border-radius:8px;border:none;background:#dc2626;color:#fff;font-size:13px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;"><i class="ti ti-trash" style="font-size:14px;"></i> Remove</button>
				</div>
			</div>
		</div>`);
		$("body").append($overlay);
		const close = () => $overlay.remove();
		const confirm = () => { close(); onConfirm(); };
		$overlay.on("click", "#qlDelCancel", close);
		$overlay.on("click", "#qlDelConfirm", confirm);
		$overlay.on("click", (e) => { if ($(e.target).is($overlay)) close(); });
	}

	// ── Customer selected ───────────────────────────────────
	onCustomerSelected(customerDocname, opts = {}) {
		const me = this;
		me.selectedCustomerDoc = { name: customerDocname, contacts: [], renewals: [] };

		// Load this customer's addresses (auto-fills the primary one)
		me.loadCustomerAddresses(customerDocname);

		frappe.call({
			method: "frappe.client.get",
			args: { doctype: "Customer", name: customerDocname },
			callback: (r) => {
				const doc = r.message || {};
				me._wizardCustomerGstCategory = doc.gst_category || "";
				const companyVal = doc.company || me.defaultCompanyName || "";

				if (companyVal && !opts.skipCompany) {
					me.$content.find("#qlFCompany").val(companyVal);
					me.loadCompanyAddresses(companyVal);
				}
				me.fetchDefaultTaxes();   // ← add this
				const salesTeam = Array.isArray(doc.sales_team) ? doc.sales_team : [];
				if (salesTeam.length) {
					const sp = salesTeam[0];
					const spId = sp.sales_person || "";
					const spNm = sp.sales_person_name || spId;
					me.$content.find("#qlFSalesperson").val(spNm || spId).attr("data-docname", spId);
					me.fillSpCard(spNm, "", "");
					if (spId) {
						frappe.call({
							method: "frappe.client.get",
							args: { doctype: "Sales Person", name: spId },
							callback: (rSP) => {
								const spDoc = rSP.message || {};
								const empId = spDoc.employee || "";
								if (!empId) { me.fillSpCard(spNm, "", ""); return; }
								frappe.call({
									method: "frappe.client.get",
									args: { doctype: "Employee", name: empId },
									callback: (rEmp) => {
										const emp = rEmp.message || {};
										me.fillSpCard(spNm, emp.company_email || emp.personal_email || "", emp.cell_number || emp.mobile_no || "");
									},
									error: () => me.fillSpCard(spNm, "", ""),
								});
							},
							error: () => me.fillSpCard(spNm, "", ""),
						});
					}
				}
			}
		});

		// Contacts
		frappe.call({
			method: "frappe.client.get_list",
			args: {
				doctype: "Contact",
				fields: ["name", "first_name", "last_name", "email_id", "mobile_no", "designation"],
				filters: [["Dynamic Link", "link_doctype", "=", "Customer"], ["Dynamic Link", "link_name", "=", customerDocname]],
				limit_page_length: 20,
			},
			callback: (r) => {
				me.selectedCustomerDoc.contacts = (r.message || []).map(c => ({
					docname: c.name,
					name: [c.first_name, c.last_name].filter(Boolean).join(" ") || c.name,
					email: c.email_id || "", phone: c.mobile_no || "", role: c.designation || "",
				}));

				// Auto-add the opportunity's primary contact (prefill flow)
				if (me._prefillContactPerson) {
					const match = me.selectedCustomerDoc.contacts.find(c => c.docname === me._prefillContactPerson);
					if (match) {
						me.wizardContacts = me.wizardContacts || [];
						if (!me.wizardContacts.some(c => c.docname === match.docname)) {
							me.wizardContacts.push({ ...match });
						}
					}
					me._prefillContactPerson = "";
				}

				if (me.wizardStep === 2) me.renderContactCards();
			}
		});
	}

	// ── Address loading (filtered to a linked party) ────────
	loadCustomerAddresses(customerDocname) {
		const me = this;
		if (!customerDocname) { me.customerAddresses = []; return; }
		me._fetchAddresses("Customer", customerDocname, (list) => {
			me.customerAddresses = list;
			me._autoFillAddress("#qlFAddress", list, [a => a.primary]);
			me._autoFillAddress("#qlFShipAddress", list, [a => a.shipping, a => a.primary]);
			me.renderAddressSlot("billing");
			me.renderAddressSlot("shipping");
			me.autoSetTaxCategory();
			// in loadCustomerAddresses callback, after renderAddressSlot("billing"):
			me.autoSetTaxCategory();


		});
	}

	loadCompanyAddresses(company) {
		const me = this;
		if (!company) { me.companyAddresses = []; return; }
		me._fetchAddresses("Company", company, (list) => {
			me.companyAddresses = list;
			me._autoFillAddress("#qlFCompanyAddress", list, [a => a.primary]);
			me.renderAddressSlot("company");
		});
	}

	_fetchAddresses(linkDoctype, linkName, cb) {
		frappe.call({
			method: "frappe.client.get_list",
			args: {
				doctype: "Address",
				fields: ["name", "address_line1", "address_line2", "city", "state", "pincode", "is_primary_address", "is_shipping_address"],
				filters: [
					["Dynamic Link", "link_doctype", "=", linkDoctype],
					["Dynamic Link", "link_name", "=", linkName],
				],
				limit_page_length: 50,
				order_by: "`tabAddress`.is_primary_address desc, `tabAddress`.modified desc",

			},
			callback: (r) => cb((r.message || []).map(a => ({
				name: a.name,
				label: [a.address_line1, a.address_line2, a.city, a.state, a.pincode].filter(Boolean).join(", ") || a.name,
				line1: a.address_line1 || "",
				line2: a.address_line2 || "",
				city: a.city || "",
				state: a.state || "",
				pincode: a.pincode || "",
				primary: !!a.is_primary_address,
				shipping: !!a.is_shipping_address,
			}))),
			error: () => cb([]),
		});
	}

	// Auto-fill an address input with the first match from preferFns, else the first
	// address — but only when the field is still empty (don't clobber a manual pick).
	_autoFillAddress(inputSel, list, preferFns) {
		const $input = this.$content.find(inputSel);
		if (!list.length || ($input.val() || "").trim()) return;
		let pick = null;
		for (const fn of (preferFns || [])) { pick = list.find(fn); if (pick) break; }
		pick = pick || list[0];
		$input.val(pick.name);
	}

	renderAddressSlot(slotKey) {
		const me = this;
		const slot = me._addrSlots && me._addrSlots[slotKey];
		if (!slot) return;
		const $card = me.$content.find(`#${slot.cardId}`);
		if (!$card.length) return;
		const list = me[slot.listKey] || [];
		const name = (me.$content.find(`#${slot.inputId}`).val() || "").trim();
		const addr = list.find(a => a.name === name);

		if (!name || !addr) {
			$card.html(`
            <button type="button" class="ql-addr-add" data-addr-slot="${slotKey}"
                style="width:100%;border:2px dashed rgba(0,0,0,0.14);border-radius:12px;padding:18px;display:flex;align-items:center;justify-content:center;gap:8px;background:#f7f8fa;color:#6b7280;cursor:pointer;font-size:13px;font-weight:500;">
                <i class="ti ti-plus" style="font-size:16px;color:${slot.accent};"></i> Add ${me.escapeAttr(slot.label)}
            </button>`);
			return;
		}

		const clr = slot.accent;
		const cityLine = [addr.city, addr.state, addr.pincode].filter(Boolean).join(", ");
		const badge = (txt, c) => `<span style="display:inline-flex;align-items:center;margin-left:6px;padding:1px 7px;border-radius:20px;background:${c}1a;font-size:9px;font-weight:700;letter-spacing:.04em;color:${c};">${txt}</span>`;
		let badges = "";
		if (addr.primary) badges += badge("PRIMARY", "#16a34a");
		if (addr.shipping) badges += badge("SHIPPING", "#3b7ef8");

		$card.html(`
        <div style="background:#fff;border:1px solid rgba(0,0,0,0.09);border-radius:14px;padding:14px 18px;display:flex;align-items:flex-start;gap:14px;box-shadow:0 1px 6px rgba(0,0,0,0.06);position:relative;">
            <div style="width:42px;height:42px;border-radius:50%;background:${clr}1a;border:2px solid ${clr}33;display:flex;align-items:center;justify-content:center;color:${clr};flex-shrink:0;">
                <i class="ti ${slot.icon}" style="font-size:18px;"></i>
            </div>
            <div style="flex:1;min-width:0;">
                <div style="font-family:Syne,sans-serif;font-size:14px;font-weight:600;color:#111827;">${me.escapeAttr(addr.name)}${badges}</div>
                ${addr.line1 ? `<div style="font-size:12px;color:#374151;margin-top:4px;">${me.escapeAttr(addr.line1)}</div>` : ""}
                ${addr.line2 ? `<div style="font-size:12px;color:#374151;margin-top:2px;">${me.escapeAttr(addr.line2)}</div>` : ""}
                ${cityLine ? `<div style="font-size:12px;color:#6b7280;margin-top:3px;display:flex;align-items:center;gap:6px;"><i class="ti ti-building-community" style="font-size:13px;color:#9ca3af;"></i>${me.escapeAttr(cityLine)}</div>` : ""}
                <button type="button" class="ql-addr-change" data-addr-slot="${slotKey}" style="margin-top:8px;background:transparent;border:none;color:${clr};font-size:11px;font-weight:600;cursor:pointer;padding:0;display:inline-flex;align-items:center;gap:4px;"><i class="ti ti-switch-horizontal" style="font-size:12px;"></i> Change</button>
            </div>
            <button type="button" class="ql-addr-remove" data-addr-slot="${slotKey}" style="position:absolute;top:10px;right:10px;width:24px;height:24px;border-radius:50%;border:1px solid rgba(0,0,0,0.08);background:transparent;color:#9ca3af;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;" title="Remove"><i class="ti ti-x"></i></button>
        </div>`);
	}




	openAddressPicker(slotKey) {
		const me = this;
		const slot = me._addrSlots && me._addrSlots[slotKey];
		if (!slot) return;
		const list = me[slot.listKey] || [];
		$("#qlAddrPickerOverlay").remove();

		const rows = list.length
			? list.map((a, i) => {
				const cityLine = [a.city, a.state, a.pincode].filter(Boolean).join(", ");
				let tags = "";
				if (a.primary) tags += `<span style="font-size:9px;font-weight:700;color:#16a34a;margin-left:6px;">• PRIMARY</span>`;
				if (a.shipping) tags += `<span style="font-size:9px;font-weight:700;color:#3b7ef8;margin-left:6px;">• SHIPPING</span>`;
				return `<div class="ql-addr-pick-item" data-ai="${i}" style="display:flex;align-items:flex-start;gap:12px;padding:12px 14px;border:1.5px solid rgba(0,0,0,0.08);border-radius:10px;cursor:pointer;transition:0.15s;margin-bottom:8px;">
                <div style="width:34px;height:34px;border-radius:50%;background:${slot.accent}1a;display:flex;align-items:center;justify-content:center;color:${slot.accent};flex-shrink:0;"><i class="ti ti-map-pin" style="font-size:15px;"></i></div>
                <div style="flex:1;min-width:0;">
                    <div style="font-size:13px;font-weight:600;color:#111827;">${me.escapeAttr(a.name)}${tags}</div>
                    ${a.line1 ? `<div style="font-size:11px;color:#6b7280;margin-top:2px;">${me.escapeAttr(a.line1)}</div>` : ""}
                    ${cityLine ? `<div style="font-size:11px;color:#9ca3af;">${me.escapeAttr(cityLine)}</div>` : ""}
                </div>
                <i class="ti ti-plus" style="font-size:16px;color:${slot.accent};flex-shrink:0;"></i>
            </div>`;
			}).join("")
			: `<div style="text-align:center;padding:24px;color:#9ca3af;font-size:12px;"><i class="ti ti-map-pin-off" style="font-size:24px;display:block;margin-bottom:8px;"></i>${me.escapeAttr(slot.empty)}</div>`;

		const $overlay = $(`
    <div id="qlAddrPickerOverlay" style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9000;display:flex;align-items:center;justify-content:center;padding:20px;">
        <div style="background:#fff;border-radius:16px;width:100%;max-width:520px;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 24px 64px rgba(0,0,0,0.18);">
            <div style="padding:18px 22px 14px;border-bottom:1px solid rgba(0,0,0,0.08);display:flex;align-items:center;justify-content:space-between;">
                <div style="font-family:Syne,sans-serif;font-size:15px;font-weight:700;color:#111827;display:flex;align-items:center;gap:8px;"><i class="ti ${slot.icon}" style="color:${slot.accent};"></i> Select ${me.escapeAttr(slot.label)}</div>
                <button id="qlAddrPickerClose" style="width:30px;height:30px;border-radius:50%;border:1px solid rgba(0,0,0,0.1);background:transparent;color:#9ca3af;cursor:pointer;font-size:15px;display:flex;align-items:center;justify-content:center;"><i class="ti ti-x"></i></button>
            </div>
            <div style="flex:1;overflow-y:auto;padding:16px 22px;">${rows}</div>
            <div style="padding:12px 22px;border-top:1px solid rgba(0,0,0,0.08);display:flex;justify-content:flex-end;background:#f8fafc;">
                <button id="qlAddrPickerCancel" style="padding:8px 16px;border-radius:6px;border:1px solid rgba(0,0,0,0.1);background:#fff;font-size:13px;cursor:pointer;color:#374151;">Cancel</button>
            </div>
        </div>
    </div>`);
		$("body").append($overlay);

		$overlay.on("click", ".ql-addr-pick-item", function () {
			const a = list[parseInt($(this).data("ai"))];
			if (a) { me.$content.find(`#${slot.inputId}`).val(a.name); me.renderAddressSlot(slotKey); }
			$overlay.remove();
			if (slotKey === "billing") me.autoSetTaxCategory();   // ← re-determine taxes

		});
		$overlay.on("mouseenter", ".ql-addr-pick-item", function () { $(this).css({ "border-color": slot.accent, "background": slot.accent + "0a" }); })
			.on("mouseleave", ".ql-addr-pick-item", function () { $(this).css({ "border-color": "rgba(0,0,0,0.08)", "background": "" }); });
		$overlay.on("click", "#qlAddrPickerClose, #qlAddrPickerCancel", () => $overlay.remove());
		$overlay.on("click", (e) => { if ($(e.target).is($overlay)) $overlay.remove(); });
	}

	// Render the formatted details card for whatever address is in the input.
	_syncAddressCard(inputSel, cardSel, list) {
		const me = this;
		const $card = me.$content.find(cardSel);
		if (!$card.length) return;
		const name = (me.$content.find(inputSel).val() || "").trim();
		const addr = (list || []).find(a => a.name === name);
		if (!name || !addr) { $card.hide().empty(); return; }

		const cityLine = [addr.city, addr.state, addr.pincode].filter(Boolean).join(", ");
		const badge = (txt, clr) =>
			`<span style="font-size:9px;font-weight:700;letter-spacing:.04em;color:${clr};background:${clr}1a;padding:1px 6px;border-radius:10px;margin-left:6px;vertical-align:middle;">${txt}</span>`;
		let badges = "";
		if (addr.primary) badges += badge("PRIMARY", "#16a34a");
		if (addr.shipping) badges += badge("SHIPPING", "#3b7ef8");

		$card.html(`
        <div style="display:flex;align-items:flex-start;gap:10px;">
            <div style="width:30px;height:30px;border-radius:8px;background:rgba(59,126,248,0.1);color:#3b7ef8;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                <i class="ti ti-map-pin" style="font-size:15px;"></i>
            </div>
            <div style="flex:1;min-width:0;">
                <div style="font-size:12px;font-weight:700;color:#111827;font-family:'Syne',sans-serif;">${me.escapeAttr(addr.name)}${badges}</div>
                ${addr.line1 ? `<div style="font-size:12px;color:#374151;margin-top:3px;">${me.escapeAttr(addr.line1)}</div>` : ""}
                ${addr.line2 ? `<div style="font-size:12px;color:#374151;">${me.escapeAttr(addr.line2)}</div>` : ""}
                ${cityLine ? `<div style="font-size:12px;color:#6b7280;margin-top:2px;">${me.escapeAttr(cityLine)}</div>` : ""}
            </div>
        </div>`).css("display", "block");
	}

	// renderAddressOptions($input, ddSel, list, itemClass, emptyMsg) {
	// 	const me  = this;
	// 	const $dd = me.$content.find(ddSel);
	// 	if (!list || !list.length) {
	// 		$dd.html(`<div style="padding:12px;text-align:center;font-size:12px;color:#9ca3af;"><i class="ti ti-map-pin-off" style="display:block;font-size:22px;margin-bottom:6px;"></i>${emptyMsg}</div>`).addClass("open");
	// 		return;
	// 	}
	// 	const q = ($input.val() || "").trim().toLowerCase();
	// 	const filtered = list.filter(a => !q || a.name.toLowerCase().includes(q) || a.label.toLowerCase().includes(q));
	// 	if (!filtered.length) {
	// 		$dd.html(`<div style="padding:12px;text-align:center;font-size:12px;color:#9ca3af;"><i class="ti ti-search-off"></i> No matching address</div>`).addClass("open");
	// 		return;
	// 	}
	// 	$dd.html(filtered.map(a => `
	// 		<div class="${itemClass}" style="display:flex;align-items:flex-start;gap:10px;padding:9px 12px;cursor:pointer;transition:0.12s;" data-name="${me.escapeAttr(a.name)}">
	// 			<i class="ti ti-map-pin" style="font-size:14px;color:#3b7ef8;margin-top:2px;flex-shrink:0;"></i>
	// 			<div style="flex:1;min-width:0;">
	// 				<div style="font-size:12px;font-weight:600;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${me.escapeAttr(a.name)}${a.primary ? ' <span style="font-size:9px;color:#16a34a;font-weight:700;">• PRIMARY</span>' : ""}</div>
	// 				<div style="font-size:10px;color:#9ca3af;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${me.escapeAttr(a.label)}</div>
	// 			</div>
	// 		</div>`).join("")).addClass("open");
	// 	$dd.find(`.${itemClass}`)
	// 		.on("mouseenter", function() { $(this).css("background", "rgba(59,126,248,0.06)"); })
	// 		.on("mouseleave", function() { $(this).css("background", ""); });
	// }

	// ── Wizard navigation ───────────────────────────────────
	goWizardStep(n) {
		const me = this;
		me.wizardStep = n;
		me.$content.find(".ql-wiz-panel").removeClass("active");
		me.$content.find(`#qlPanel${n}`).addClass("active");
		me.$content.find(".ql-step").each(function () {
			const sn = parseInt($(this).data("step"));
			$(this).removeClass("active done");
			const $c = $(this).find(".ql-step-circle");
			if (sn === n) { $(this).addClass("active"); $c.html(sn); }
			else if (sn < n) { $(this).addClass("done"); $c.html('<i class="ti ti-check" style="font-size:13px;"></i>'); }
			else { $c.html(sn); }
		});
		me.$content.find("#qlProgressFill").css("width", (n / 7 * 100) + "%");
		if (n === 2) me.renderContactCards();
		if (n === 7) me.buildReview();
		$("#support-page-content").scrollTop(0);
	}

	validateWizardStep(n) {
		const me = this;
		if (n === 1) {
			if (!me.$content.find("#qlFSubject").val().trim()) { frappe.msgprint("Please enter a Subject."); return false; }
			if (!me.$content.find("#qlFCustomer").val().trim()) { frappe.msgprint("Please select a Customer."); return false; }
		}
		return true;
	}

	// ── Live link search ────────────────────────────────────
	// Generic live link search — works for Customer, Company, Sales Person
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
			if (sp) meta.push(`<span style="display:inline-flex;align-items:center;gap:3px;"><i class="ti ti-user-check" style="font-size:10px;color:#3b7ef8;"></i>${me.escapeAttr(sp)}</span>`);
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

	fillSpCard(name, email, phone) {
		const me = this;
		const av = (name || "?").substring(0, 2).toUpperCase();
		me.$content.find("#qlSpCardAv").text(av);
		me.$content.find("#qlSpCardName").text(name || "");
		me.$content.find("#qlFSpEmail").val(email || "");
		me.$content.find("#qlFSpPhone").val(phone || "");
		if (email) me.$content.find("#qlSpCardEmail").css("display", "flex").find("span").text(email);
		else me.$content.find("#qlSpCardEmail").hide();
		if (phone) me.$content.find("#qlSpCardPhone").css("display", "flex").find("span").text(phone);
		else me.$content.find("#qlSpCardPhone").hide();
		me.$content.find("#qlSpCard").css("display", "flex");
	}

	linkKeyNav(e, ddSel) {
		const $dd = this.$content.find(ddSel || ".ql-link-dd");
		if (!$dd.hasClass("open")) return;
		const $items = $dd.find(".ql-link-item");
		let idx = $items.index($items.filter(".hi"));
		if (e.key === "ArrowDown") { e.preventDefault(); idx = Math.min(idx + 1, $items.length - 1); }
		else if (e.key === "ArrowUp") { e.preventDefault(); idx = Math.max(idx - 1, 0); }
		else if (e.key === "Enter" && idx >= 0) { e.preventDefault(); $items.eq(idx).trigger("mousedown"); return; }
		else if (e.key === "Escape") { $dd.removeClass("open"); return; }
		$items.removeClass("hi").eq(idx).addClass("hi");
	}

	// ── Contact cards (Step 2) ──────────────────────────────
	renderContactCards() {
		const me = this;
		const contacts = (me.selectedCustomerDoc && me.selectedCustomerDoc.contacts) || [];
		const custName = me.$content.find("#qlFCustomer").val() || "—";
		me.$content.find("#qlContactsHeading").text(`Contacts — ${custName}`);

		// init once — never wipe contacts already added
		if (!Array.isArray(me.wizardContacts)) me.wizardContacts = [];
		if (!Number.isFinite(me.wizardPocIndex)) me.wizardPocIndex = 0;

		me._renderContactCardsList();

		me.$content.off("click.qlCon", "#qlAddContactBtn").on("click.qlCon", "#qlAddContactBtn", () => me.openContactPickerPopup());

		// POC single-select
		me.$content.off("change.qlCon", ".ql-poc-check").on("change.qlCon", ".ql-poc-check", (e) => {
			const idx = parseInt($(e.currentTarget).data("pocIdx"));
			if (!Number.isFinite(idx)) return;
			me.wizardPocIndex = idx;
			me._renderContactCardsList();
		});

		me.$content.off("click.qlCon", ".ql-con-card-remove").on("click.qlCon", ".ql-con-card-remove", (e) => {
			const idx = parseInt($(e.currentTarget).data("conIdx"));
			me.wizardContacts.splice(idx, 1);
			if (me.wizardPocIndex === idx) me.wizardPocIndex = 0;
			else if (me.wizardPocIndex > idx) me.wizardPocIndex--;
			me._renderContactCardsList();
		});

		me.$content.find("#qlNoContactsMsg").toggle(!contacts.length);
	}

	_renderContactCardsList() {
		const me = this;
		const $wrap = me.$content.find("#qlContactCardsWrap");
		if (!$wrap.length) return;
		if (!me.wizardContacts.length) {
			$wrap.html(`<div style="border:2px dashed rgba(0,0,0,0.12);border-radius:12px;padding:32px;text-align:center;color:#9ca3af;">
				<i class="ti ti-user-plus" style="font-size:28px;display:block;margin-bottom:8px;color:#d1d5db;"></i>
				<div style="font-size:13px;font-weight:500;margin-bottom:4px;">No contacts added yet</div>
				<div style="font-size:12px;">Click <strong>Add Contact</strong> to pick from this customer's contacts</div>
			</div>`);
			return;
		}
		if (!Number.isFinite(me.wizardPocIndex)) me.wizardPocIndex = 0;
		const colors = ["#3b7ef8", "#16a34a", "#d97706", "#7c3aed", "#dc2626"];
		$wrap.html(me.wizardContacts.map((c, idx) => {
			const av = (c.name || "?")[0].toUpperCase();
			const clr = colors[idx % colors.length];
			const isPoc = (idx === me.wizardPocIndex);
			return `<div style="background:${isPoc ? "rgba(59,126,248,0.05)" : "#fff"};border:${isPoc ? "2px solid #3b7ef8" : "1px solid rgba(0,0,0,0.09)"};border-radius:14px;padding:16px 18px;display:flex;align-items:center;gap:14px;box-shadow:0 1px 6px rgba(0,0,0,0.06);position:relative;">
				<div style="position:relative;width:42px;height:42px;border-radius:50%;background:${clr}1a;border:2px solid ${clr}33;display:flex;align-items:center;justify-content:center;font-family:Syne,sans-serif;font-size:16px;font-weight:700;color:${clr};flex-shrink:0;">${av}
					${isPoc ? `<span style="position:absolute;bottom:-1px;right:-1px;width:13px;height:13px;border-radius:50%;background:#3b7ef8;border:2px solid #fff;"></span>` : ""}
				</div>
				<div style="flex:1;min-width:0;">
					<div style="font-family:Syne,sans-serif;font-size:14px;font-weight:600;color:#111827;">${me.escapeAttr(c.name || "—")}</div>
					${c.email ? `<div style="font-size:12px;color:#3b7ef8;margin-top:4px;display:flex;align-items:center;gap:6px;"><i class="ti ti-mail" style="font-size:13px;color:#9ca3af;"></i>${me.escapeAttr(c.email)}</div>` : ""}
					${c.phone ? `<div style="font-size:12px;color:#374151;margin-top:3px;display:flex;align-items:center;gap:6px;"><i class="ti ti-device-mobile" style="font-size:13px;color:#9ca3af;"></i>${me.escapeAttr(c.phone)}</div>` : ""}
					${c.role ? `<div style="display:inline-flex;align-items:center;margin-top:6px;padding:2px 8px;border-radius:20px;background:rgba(59,126,248,0.08);font-size:10px;font-weight:600;color:#3b7ef8;">${me.escapeAttr(c.role)}</div>` : ""}
					<label class="ql-poc-toggle" style="display:inline-flex;align-items:center;gap:5px;margin-top:8px;cursor:pointer;">
						<input type="checkbox" class="ql-poc-check" data-poc-idx="${idx}" ${isPoc ? "checked" : ""} style="accent-color:#3b7ef8;width:14px;height:14px;cursor:pointer;">
						<span style="font-size:11px;font-weight:600;color:${isPoc ? "#3b7ef8" : "#9ca3af"};">${isPoc ? "✓ Point of Contact" : "Set as Point of Contact"}</span>
					</label>
				</div>
				<button class="ql-con-card-remove" data-con-idx="${idx}" style="position:absolute;top:10px;right:10px;width:24px;height:24px;border-radius:50%;border:1px solid rgba(0,0,0,0.08);background:transparent;color:#9ca3af;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;" title="Remove"><i class="ti ti-x"></i></button>
			</div>`;
		}).join(""));
	}

	openContactPickerPopup() {
		const me = this;
		const allContacts = (me.selectedCustomerDoc && me.selectedCustomerDoc.contacts) || [];
		const addedDocnames = new Set((me.wizardContacts || []).map(c => c.docname).filter(Boolean));
		const contacts = allContacts.filter(c => !c.docname || !addedDocnames.has(c.docname));
		$("#qlConPickerOverlay").remove();
		const $overlay = $(`
		<div id="qlConPickerOverlay" style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9000;display:flex;align-items:center;justify-content:center;padding:20px;">
			<div style="background:#fff;border-radius:16px;width:100%;max-width:520px;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 24px 64px rgba(0,0,0,0.18);">
				<div style="padding:18px 22px 14px;border-bottom:1px solid rgba(0,0,0,0.08);display:flex;align-items:center;justify-content:space-between;">
					<div style="font-family:Syne,sans-serif;font-size:15px;font-weight:700;color:#111827;display:flex;align-items:center;gap:8px;"><i class="ti ti-user-plus" style="color:#3b7ef8;"></i> Add Contact</div>
					<button id="qlConPickerClose" style="width:30px;height:30px;border-radius:50%;border:1px solid rgba(0,0,0,0.1);background:transparent;color:#9ca3af;cursor:pointer;font-size:15px;display:flex;align-items:center;justify-content:center;"><i class="ti ti-x"></i></button>
				</div>
				<div style="flex:1;overflow-y:auto;padding:16px 22px;" id="qlConPickerBody">
					${contacts.length
				? contacts.map((c, ci) => `
							<div class="ql-con-pick-item" data-ci="${ci}" style="display:flex;align-items:center;gap:12px;padding:12px 14px;border:1.5px solid rgba(0,0,0,0.08);border-radius:10px;cursor:pointer;transition:0.15s;margin-bottom:8px;">
								<div style="width:36px;height:36px;border-radius:50%;background:rgba(59,126,248,0.12);display:flex;align-items:center;justify-content:center;font-family:Syne,sans-serif;font-size:13px;font-weight:700;color:#3b7ef8;flex-shrink:0;">${(c.name || "?")[0].toUpperCase()}</div>
								<div style="flex:1;min-width:0;">
									<div style="font-size:13px;font-weight:600;color:#111827;">${me.escapeAttr(c.name)}</div>
									${c.role ? `<div style="font-size:11px;color:#6b7280;">${me.escapeAttr(c.role)}</div>` : ""}
									${c.email ? `<div style="font-size:11px;color:#3b7ef8;">${me.escapeAttr(c.email)}</div>` : ""}
									${c.phone ? `<div style="font-size:11px;color:#374151;">${me.escapeAttr(c.phone)}</div>` : ""}
								</div>
								<i class="ti ti-plus" style="font-size:16px;color:#3b7ef8;flex-shrink:0;"></i>
							</div>`).join("")
				: `<div style="text-align:center;padding:24px;color:#9ca3af;font-size:12px;"><i class="ti ti-search-off" style="font-size:24px;display:block;margin-bottom:8px;"></i>No linked contacts found for this customer.</div>`}
				</div>
				<div style="padding:12px 22px;border-top:1px solid rgba(0,0,0,0.08);display:flex;justify-content:flex-end;gap:8px;background:#f8fafc;">
					<button id="qlConPickerCancel" style="padding:8px 16px;border-radius:6px;border:1px solid rgba(0,0,0,0.1);background:#fff;font-size:13px;cursor:pointer;color:#374151;">Cancel</button>
				</div>
			</div>
		</div>`);
		$("body").append($overlay);
		$overlay.on("click", ".ql-con-pick-item", function () {
			const ci = parseInt($(this).data("ci"));
			if (!me.wizardContacts) me.wizardContacts = [];
			me.wizardContacts.push({ ...contacts[ci] });
			me._renderContactCardsList();
			$overlay.remove();
		});
		$overlay.on("mouseenter", ".ql-con-pick-item", function () { $(this).css({ "border-color": "#3b7ef8", "background": "rgba(59,126,248,0.04)" }); })
			.on("mouseleave", ".ql-con-pick-item", function () { $(this).css({ "border-color": "rgba(0,0,0,0.08)", "background": "" }); });
		$overlay.on("click", "#qlConPickerClose, #qlConPickerCancel", () => $overlay.remove());
		$overlay.on("click", (e) => { if ($(e.target).is($overlay)) $overlay.remove(); });
	}

	// ── Item popup ──────────────────────────────────────────
	openItemPopup(type) {
		const me = this;
		const isRenewal = type !== "new";
		const title = type === "new" ? "Add Item" : type === "renewal" ? "Renewal Items" : "Additional Items";
		const icon = type === "new" ? "ti-box" : type === "renewal" ? "ti-refresh" : "ti-stack-2";
		const iconColor = type === "new" ? "#3b7ef8" : type === "renewal" ? "#16a34a" : "#d97706";
		const CATALOGUE = me.wizardERP_Items.length ? me.wizardERP_Items : [];
		const RENEWALS = (me.selectedCustomerDoc && me.selectedCustomerDoc.renewals) || [];
		const data = isRenewal ? RENEWALS : CATALOGUE;
		const selected = new Set();
		const groups = [...new Set(CATALOGUE.map(i => i.group).filter(Boolean))].sort();
		const brands = [...new Set(CATALOGUE.map(i => i.brand).filter(g => g && g !== "—"))].sort();
		const groupOpts = groups.map(g => `<option value="${me.escapeAttr(g)}">${me.escapeAttr(g)}</option>`).join("");
		const brandOpts = brands.map(b => `<option value="${me.escapeAttr(b)}">${me.escapeAttr(b)}</option>`).join("");

		const renderGrid = (filtered) => {
			if (!isRenewal) {
				return filtered.length
					? filtered.map(item => `
							<div class="ql-item-card ${selected.has(item.id) ? "selected" : ""}" data-iid="${item.id}"
								style="cursor:pointer;display:flex;align-items:center;gap:16px;width:100%;
									padding:12px 18px;border:1.5px solid ${selected.has(item.id) ? "#3b7ef8" : "rgba(0,0,0,0.08)"};
									border-radius:10px;background:${selected.has(item.id) ? "rgba(59,126,248,0.04)" : "#fff"};
									transition:all .12s;box-sizing:border-box;">
								<div class="ql-item-card-check" style="width:20px;height:20px;border-radius:5px;flex-shrink:0;position:static;opacity:1;
									border:1.5px solid ${selected.has(item.id) ? "#3b7ef8" : "rgba(0,0,0,0.2)"};
									background:${selected.has(item.id) ? "#3b7ef8" : "transparent"};
									display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;">
									${selected.has(item.id) ? '<i class="ti ti-check"></i>' : ""}
								</div>
								<div style="flex:1;min-width:0;">
									<div style="font-size:13px;font-weight:600;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${me.escapeAttr(item.name)}</div>
									<div style="font-size:11px;color:#9ca3af;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${me.escapeAttr(item.code)}${item.brand && item.brand !== "—" ? ` · ${me.escapeAttr(item.brand)}` : ""}</div>
								</div>
								<div style="flex-shrink:0;width:160px;display:flex;justify-content:flex-start;">
									${item.group ? `<span style="font-size:10px;font-weight:600;color:#6b7280;background:#f1f5f9;padding:3px 10px;border-radius:20px;white-space:nowrap;">${me.escapeAttr(item.group)}</span>` : ""}
								</div>
								<div style="flex-shrink:0;width:120px;text-align:right;">
									<div style="font-size:13px;font-weight:700;color:#3b7ef8;">₹${Number(item.sp || 0).toLocaleString("en-IN")}</div>
									${item.bp ? `<div style="font-size:10px;color:#9ca3af;">BP: ₹${Number(item.bp).toLocaleString("en-IN")}</div>` : ""}
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
					<tr data-rid="${item.id}" class="${selected.has(item.id) ? "ql-r-selected" : ""}" style="cursor:pointer;border-bottom:1px solid rgba(0,0,0,0.06);transition:background 0.12s;">
						<td style="padding:12px;"><input type="checkbox" ${selected.has(item.id) ? "checked" : ""} style="accent-color:#3b7ef8;width:15px;height:15px;cursor:pointer;"></td>
						<td style="padding:12px;"><span style="font-size:12px;font-weight:700;color:#3b7ef8;font-family:Syne,sans-serif;">${me.escapeAttr(item.renewId || item.name)}</span></td>
						<td style="padding:12px;"><span style="font-size:13px;font-weight:600;color:#111827;">${me.escapeAttr(item.product_name || item.name)}</span></td>
						<td style="padding:12px;"><span style="display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;color:#d97706;background:rgba(217,119,6,0.1);padding:4px 10px;border-radius:20px;"><i class="ti ti-calendar-due" style="font-size:11px;"></i>${item.end_date || "—"}</span></td>
					</tr>`).join("")}
				</tbody>
			</table>`;
		};

		$("#qlItemOverlay").remove();
		const $overlay = $(`
		<div id="qlItemOverlay" style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9000;display:flex;align-items:center;justify-content:center;padding:20px;">
			<div style="background:#fff;border-radius:16px;width:100%;max-width:800px;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 24px 64px rgba(0,0,0,0.18);">
				<div style="padding:18px 22px 14px;border-bottom:1px solid rgba(0,0,0,0.08);display:flex;align-items:flex-start;justify-content:space-between;">
					<div>
						<div style="font-family:Syne,sans-serif;font-size:16px;font-weight:700;color:#111827;display:flex;align-items:center;gap:8px;"><i class="ti ${icon}" style="color:${iconColor};"></i>${title}</div>
						<div style="font-size:11px;color:#9ca3af;margin-top:3px;">${isRenewal ? "Select from customer renewals" : "Search and select from item catalogue"}</div>
					</div>
					<button id="qlItemPopupClose" style="width:30px;height:30px;border-radius:50%;border:1px solid rgba(0,0,0,0.1);background:transparent;color:#9ca3af;cursor:pointer;font-size:15px;display:flex;align-items:center;justify-content:center;"><i class="ti ti-x"></i></button>
				</div>
				<div style="display:flex;gap:8px;padding:10px 22px;border-bottom:1px solid rgba(0,0,0,0.08);background:#f8fafc;flex-wrap:wrap;">
					<div style="display:flex;align-items:center;gap:8px;flex:1;min-width:180px;background:#fff;border:1px solid rgba(0,0,0,0.1);border-radius:6px;padding:0 10px;height:32px;">
						<i class="ti ti-search" style="font-size:14px;color:#9ca3af;flex-shrink:0;"></i>
						<input id="qlItemSearch" placeholder="Search..." style="flex:1;border:none;background:transparent;outline:none;font-family:'DM Sans',sans-serif;font-size:12px;color:#111827;">
					</div>
					<select id="qlItemGroup" style="height:32px;padding:0 10px;border:1px solid rgba(0,0,0,0.1);border-radius:6px;background:#fff;font-size:12px;min-width:120px;outline:none;"><option value="">All Groups</option>${groupOpts}</select>
					<select id="qlItemBrand" style="height:32px;padding:0 10px;border:1px solid rgba(0,0,0,0.1);border-radius:6px;background:#fff;font-size:12px;min-width:120px;outline:none;"><option value="">All Brands</option>${brandOpts}</select>
				</div>
				<div id="qlItemBody" style="flex:1;overflow-y:auto;padding:16px 22px;"></div>
				<div style="padding:14px 22px;border-top:1px solid rgba(0,0,0,0.08);display:flex;align-items:center;justify-content:space-between;background:#f8fafc;">
					<span id="qlItemSelCount" style="font-size:12px;font-weight:500;color:#6b7280;">0 items selected</span>
					<div style="display:flex;gap:8px;">
						<button id="qlItemCancel" style="padding:8px 16px;border-radius:6px;border:1px solid rgba(0,0,0,0.1);background:#fff;font-size:13px;cursor:pointer;">Cancel</button>
						<button id="qlItemConfirm" style="padding:8px 20px;border-radius:6px;border:none;background:#3b7ef8;color:#fff;font-size:13px;font-weight:600;cursor:pointer;"><i class="ti ti-check" style="margin-right:4px;"></i> Add Selected</button>
					</div>
				</div>
			</div>
		</div>`);
		$("body").append($overlay);
		const $body = $overlay.find("#qlItemBody");
		const updateSel = () => $overlay.find("#qlItemSelCount").text(selected.size + " item(s) selected");

		const renderBody = () => {
			const q = ($overlay.find("#qlItemSearch").val() || "").toLowerCase();
			const group = $overlay.find("#qlItemGroup").val();
			const brand = $overlay.find("#qlItemBrand").val();
			const filtered = data.filter(i =>
				(!q || (i.name || "").toLowerCase().includes(q) || (i.code || "").toLowerCase().includes(q)) &&
				(!group || i.group === group) &&
				(!brand || i.brand === brand)
			);
			if (!isRenewal) $body.css({ display: "flex", "flex-direction": "column", gap: "8px", "grid-template-columns": "" });
			else $body.css({ display: "block" });
			$body.html(renderGrid(filtered));
			$body.find(".ql-item-card").off("click").on("click", function () {
				const id = parseInt($(this).data("iid"));
				selected.has(id) ? selected.delete(id) : selected.add(id);
				updateSel();
				renderBody();
			});
			$body.find("[data-rid]").off("click").on("click", function (e) {
				if ($(e.target).is("input")) return;
				const id = parseInt($(this).data("rid"));
				selected.has(id) ? selected.delete(id) : selected.add(id);
				$(this).toggleClass("ql-r-selected", selected.has(id));
				$(this).find("input[type=checkbox]").prop("checked", selected.has(id));
				updateSel();
			});
			$body.find("input[type=checkbox]").off("change").on("change", function () {
				const id = parseInt($(this).closest("[data-rid]").data("rid"));
				$(this).prop("checked") ? selected.add(id) : selected.delete(id);
				$(this).closest("[data-rid]").toggleClass("ql-r-selected", selected.has(id));
				updateSel();
			});
		};

		renderBody();
		$overlay.on("input change", "#qlItemSearch, #qlItemGroup, #qlItemBrand", renderBody);
		const closeIt = () => $overlay.remove();
		$overlay.on("click", "#qlItemPopupClose, #qlItemCancel", closeIt);
		$overlay.on("click", (e) => { if ($(e.target).is($overlay)) closeIt(); });
		$overlay.on("click", "#qlItemConfirm", () => {
			const rows = data.filter(i => selected.has(i.id));
			if (!Array.isArray(me.wizardItems)) me.wizardItems = [];
			rows.forEach(item => {
				me.wizardItems.push({
					name: item.product_name || item.name || "",
					code: item.code || item.item_code || "",
					brand: item.brand || "—",
					group: item.group || "General",
					description: item.description || "",
					renewal_status: type,           // ← type field
					type: type,
					qty: Number(item.qty || 1),
					uom: item.uom || "Nos",
					sp: Number(item.sp || 0),
					bp: Number(item.bp || 0),
					discount: 0,
					orc: false, commission_type: "", rate_value: 0,
					renewId: item.renewId || "",
				});
			});
			me.renderItemsTable();
			closeIt();
		});
	}

	// ── Items table (Step 3) ────────────────────────────────
	renderItemsTable() {
		const me = this;
		const $wrap = me.$content.find("#qlItemsTbody");

		if (!me.wizardItems.length) {
			$wrap.html(`<div style="text-align:center;padding:36px;color:#9ca3af;font-size:12px;">
				<i class="ti ti-inbox" style="font-size:28px;display:block;margin-bottom:8px;"></i>
				No items added yet. Click <strong>+ Add Item</strong> to get started.
			</div>`);
			me.calcTotals();
			return;
		}

		const typeLabel = { new: "New", renewal: "Renewal", additional: "Additional" };
		const typeColor = { new: "#3b7ef8", renewal: "#16a34a", additional: "#d97706" };
		const fmtINR = n => Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

		let cards = "";
		me.wizardItems.forEach((item, idx) => {
			const disc = Number(item.discount || 0);
			const effSP = Number(item.sp || 0) * (1 - disc / 100);
			const sa = Number(item.qty || 0) * effSP;
			const rawSP = Number(item.sp || 0);
			const marginPct = rawSP > 0 ? (((rawSP - Number(item.bp || 0)) / rawSP) * 100) : 0;
			const marginColor = marginPct > 20 ? "#16a34a" : marginPct > 5 ? "#d97706" : "#dc2626";
			const marginAmt = (rawSP - Number(item.bp || 0)) * Number(item.qty || 0);
			const hasDesc = item.description && String(item.description).replace(/<[^>]*>/g, "").trim().length > 0;
			const orcOn = !!item.orc;
			// type comes from renewal_status (fallback to .type for in-memory items)
			const itemType = item.renewal_status || item.type || "new";

			cards += `
<div class="ql-item-card2 ql-drag-row" data-idx="${idx}" draggable="true">
	<div class="ql-ic-row1">
		<div class="ql-ic-grip" title="Drag to reorder"><i class="ti ti-grip-vertical"></i></div>
		<div class="ql-ic-num">${idx + 1}</div>

		<div class="ql-ic-item ql-ic-replace" data-idx="${idx}" title="Click to change item">
			<div class="ql-ic-name">${me.escapeAttr(item.name || "—")}</div>
			<div class="ql-ic-sub">
				${item.code ? me.escapeAttr(item.code) : ""}${item.code && item.brand && item.brand !== "—" ? "  ·  " : ""}${item.brand && item.brand !== "—" ? me.escapeAttr(item.brand) : ""}${(item.code || (item.brand && item.brand !== "—")) ? "  ·  " : ""}<span style="color:${typeColor[itemType] || "#3b7ef8"};font-weight:700;">${typeLabel[itemType] || "New"}</span>${(itemType === "renewal" || itemType === "additional") && item.renewId ? `<span class="ql-ic-renewid"><i class="ti ti-refresh"></i> ${me.escapeAttr(item.renewId)}</span>` : ""}
			</div>
		</div>

		<div class="ql-ic-field" style="width:64px;">
			<label class="ql-ic-label">Qty</label>
			<input class="ql-item-qty ql-ic-input" type="number" min="1" step="1" value="${item.qty}" style="text-align:right;">
		</div>
		<div class="ql-ic-field" style="width:130px;">
			<label class="ql-ic-label">SP (₹)</label>
			<input class="ql-item-sp ql-ic-input" type="number" min="0" step="0.01" value="${item.sp}" style="text-align:right;">
		</div>
		<div class="ql-ic-field" style="width:150px;">
			<label class="ql-ic-label">Sell Amt</label>
			<div class="ql-ic-sa ql-sa-cell" style="white-space:nowrap;">₹${fmtINR(sa)}</div>
		</div>

		<div class="ql-ic-field" style="width:34px;align-items:center;margin-left:auto;">
			<label class="ql-ic-label">Desc</label>
			<button class="ql-ic-desc-btn ${hasDesc ? "has-desc" : ""}" data-idx="${idx}" type="button" title="Edit description">
				<i class="ti ${hasDesc ? "ti-file-check" : "ti-file-text"}"></i>
			</button>
		</div>
		<div class="ql-ic-field" style="width:34px;align-items:center;">
			<label class="ql-ic-label">&nbsp;</label>
			<button class="ql-item-del-btn ql-ic-del" data-idx="${idx}" type="button" title="Remove item">
				<i class="ti ti-trash"></i>
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
			const qty = parseFloat($card.find(".ql-item-qty").val()) || 0;
			const sp = parseFloat($card.find(".ql-item-sp").val()) || 0;
			const bp = parseFloat($card.find(".ql-item-bp").val()) || 0;
			const disc = Number(me.wizardItems[idx].discount || 0);
			const sa = qty * sp * (1 - disc / 100);
			const marginAmt = (sp - bp) * qty;
			const marginPct = sp > 0 ? (((sp - bp) / sp) * 100) : 0;
			const fmt = v => "₹" + Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
			$card.find(".ql-sa-cell").text(fmt(sa));
			$card.find(".ql-margin-cell").text(fmt(marginAmt))
				.css("color", marginPct > 20 ? "#16a34a" : marginPct > 5 ? "#d97706" : "#dc2626");
		};

		// qty / sp / bp
		me.$content.off("input.qlCard change.qlCard", "#qlItemsTbody .ql-item-qty, #qlItemsTbody .ql-item-sp, #qlItemsTbody .ql-item-bp")
			.on("input.qlCard change.qlCard", "#qlItemsTbody .ql-item-qty, #qlItemsTbody .ql-item-sp, #qlItemsTbody .ql-item-bp", (e) => {
				const $card = $(e.currentTarget).closest(".ql-item-card2");
				const idx = parseInt($card.data("idx"));
				if (!Number.isFinite(idx) || !me.wizardItems[idx]) return;
				me.wizardItems[idx].qty = parseFloat($card.find(".ql-item-qty").val()) || 1;
				me.wizardItems[idx].sp = parseFloat($card.find(".ql-item-sp").val()) || 0;

				recompute($card, idx);
				me.calcTotals();
				// flag if this item now differs from the opportunity
				const it = me.wizardItems[idx];
				if (me.fromOpportunity && (it._oppQty !== undefined || it._oppRate !== undefined)) {
					const bad = Number(it.qty) !== Number(it._oppQty) || Number(it.sp) !== Number(it._oppRate);
					$card.css("border", bad ? "1.5px solid #dc2626" : "");
					$card.find(".ql-item-qty, .ql-item-sp").css("color", bad ? "#dc2626" : "");
				}
			});

		// ORC toggle
		me.$content.off("change.qlCard", "#qlItemsTbody .ql-item-orc")
			.on("change.qlCard", "#qlItemsTbody .ql-item-orc", (e) => {
				const $card = $(e.currentTarget).closest(".ql-item-card2");
				const idx = parseInt($card.data("idx"));
				if (!Number.isFinite(idx) || !me.wizardItems[idx]) return;
				const checked = $(e.currentTarget).prop("checked");
				me.wizardItems[idx].orc = checked;
				$card.find(".ql-ic-orc-cond").toggle(checked);
				if (!checked) {
					me.wizardItems[idx].commission_type = "";
					me.wizardItems[idx].rate_value = 0;
				}
			});

		// commission / rate
		me.$content.off("input.qlCard change.qlCard", "#qlItemsTbody .ql-item-commission-type, #qlItemsTbody .ql-item-ratevalue")
			.on("input.qlCard change.qlCard", "#qlItemsTbody .ql-item-commission-type, #qlItemsTbody .ql-item-ratevalue", (e) => {
				const $card = $(e.currentTarget).closest(".ql-item-card2");
				const idx = parseInt($card.data("idx"));
				if (!Number.isFinite(idx) || !me.wizardItems[idx]) return;
				me.wizardItems[idx].commission_type = $card.find(".ql-item-commission-type").val() || "";
				me.wizardItems[idx].rate_value = parseFloat($card.find(".ql-item-ratevalue").val()) || 0;
			});

		// click item → replace
		me.$content.off("click.qlCard", "#qlItemsTbody .ql-ic-replace")
			.on("click.qlCard", "#qlItemsTbody .ql-ic-replace", (e) => {
				const idx = parseInt($(e.currentTarget).data("idx"));
				if (!Number.isFinite(idx) || !me.wizardItems[idx]) return;
				me.openItemPopup(me.wizardItems[idx].renewal_status || me.wizardItems[idx].type || "new");
			});

		// description button → modal
		me.$content.off("click.qlCard", "#qlItemsTbody .ql-ic-desc-btn")
			.on("click.qlCard", "#qlItemsTbody .ql-ic-desc-btn", (e) => {
				e.stopPropagation();
				const idx = parseInt($(e.currentTarget).data("idx"));
				if (!Number.isFinite(idx) || !me.wizardItems[idx]) return;
				me.openItemDescModal(idx);
			});

		// delete
		me.$content.off("click.qlCard", "#qlItemsTbody .ql-item-del-btn")
			.on("click.qlCard", "#qlItemsTbody .ql-item-del-btn", (e) => {
				e.stopPropagation();
				const idx = parseInt($(e.currentTarget).data("idx"));
				if (!Number.isFinite(idx) || !me.wizardItems[idx]) return;
				const nm = me.wizardItems[idx].name || `Item ${idx + 1}`;
				me._showDeleteConfirm(nm, () => {
					me.wizardItems.splice(idx, 1);
					me.renderItemsTable();
				});
			});
	}

	openItemDescModal(idx) {
		const me = this;
		if (!me.wizardItems[idx]) return;
		$("#qlDescModalOverlay").remove();
		const itemName = me.wizardItems[idx].name || `Item ${idx + 1}`;

		const $overlay = $(`
		<div id="qlDescModalOverlay" style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9000;display:flex;align-items:center;justify-content:center;padding:20px;">
			<div style="background:#fff;border-radius:16px;width:100%;max-width:640px;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 24px 64px rgba(0,0,0,0.18);">
				<div style="padding:16px 20px 12px;border-bottom:1px solid rgba(0,0,0,0.08);display:flex;align-items:center;justify-content:space-between;">
					<div>
						<div style="font-family:Syne,sans-serif;font-size:15px;font-weight:700;color:#111827;display:flex;align-items:center;gap:8px;"><i class="ti ti-align-left" style="color:#3b7ef8;"></i> Description</div>
						<div style="font-size:11px;color:#9ca3af;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:560px;">${me.escapeAttr(itemName)}</div>
					</div>
					<button id="qlDescClose" style="width:28px;height:28px;border-radius:50%;border:1px solid rgba(0,0,0,0.1);background:transparent;color:#9ca3af;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;"><i class="ti ti-x"></i></button>
				</div>
				<div style="flex:1;overflow-y:auto;padding:16px 20px;">
					<div id="qlDescEditorHost"></div>
				</div>
				<div style="padding:12px 20px;border-top:1px solid rgba(0,0,0,0.08);background:#f8fafc;display:flex;justify-content:flex-end;gap:8px;">
					<button id="qlDescCancel" style="padding:7px 16px;border-radius:6px;border:1px solid rgba(0,0,0,0.1);background:#fff;font-size:13px;cursor:pointer;color:#374151;">Cancel</button>
					<button id="qlDescSave" style="padding:7px 18px;border-radius:6px;border:none;background:#3b7ef8;color:#fff;font-size:13px;font-weight:600;cursor:pointer;"><i class="ti ti-check" style="margin-right:4px;"></i> Save</button>
				</div>
			</div>
		</div>`);
		$("body").append($overlay);

		const ctrl = frappe.ui.form.make_control({
			parent: $overlay.find("#qlDescEditorHost").get(0),
			df: { fieldname: "ql_desc_modal", fieldtype: "Text Editor", label: "" },
			render_input: true,
		});
		ctrl.set_value(me.wizardItems[idx].description || "");

		const close = () => $overlay.remove();
		$overlay.on("click", "#qlDescClose, #qlDescCancel", close);
		$overlay.on("click", (e) => { if ($(e.target).is($overlay)) close(); });
		$overlay.on("click", "#qlDescSave", () => {
			me.wizardItems[idx].description = ctrl.get_value() || "";
			const hasDesc = String(me.wizardItems[idx].description).replace(/<[^>]*>/g, "").trim().length > 0;
			const $btn = me.$content.find(`#qlItemsTbody .ql-ic-desc-btn[data-idx="${idx}"]`);
			$btn.toggleClass("has-desc", hasDesc);
			$btn.find("i").attr("class", `ti ${hasDesc ? "ti-file-check" : "ti-file-text"}`);
			close();
		});
	}

	calcTotals() {
		const me = this;
		let totalSell = 0;
		me.wizardItems.forEach((item, idx) => {
			const $row = me.$content.find(`#qlItemsTbody [data-idx="${idx}"]`);
			const qty = parseFloat($row.find(".ql-item-qty").val()) || item.qty || 1;
			const sp = parseFloat($row.find(".ql-item-sp").val()) || item.sp || 0;
			const disc = item.discount || 0;
			const sa = qty * sp * (1 - disc / 100);
			totalSell += sa;
			$row.find(".ql-sa-cell").text("₹" + Number(sa).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
		});
		const fmt = n => "₹ " + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
		const totalQty = me.wizardItems.reduce((s, it, idx) =>
			s + (parseFloat(me.$content.find(`#qlItemsTbody [data-idx="${idx}"] .ql-item-qty`).val()) || it.qty || 1), 0);
		me.$content.find("#qlSumQtyLabel").text(totalQty % 1 === 0 ? totalQty : totalQty.toFixed(1));
		me.$content.find("#qlSumGrand").text(fmt(totalSell));
		return totalSell;
	}

	initDragDrop() {
		const me = this;
		const $tbody = me.$content.find("#qlItemsTbody");
		let dragIdx = null;
		$tbody.find(".ql-drag-row").each(function () {
			const el = this;
			const idx = parseInt($(el).data("idx"));
			el.addEventListener("dragstart", (e) => { dragIdx = idx; e.dataTransfer.effectAllowed = "move"; $(el).css("opacity", "0.4"); });
			el.addEventListener("dragend", () => { $(el).css("opacity", "1"); $tbody.find(".ql-drag-row").css("border-top", ""); });
			el.addEventListener("dragover", (e) => { e.preventDefault(); $tbody.find(".ql-drag-row").css("border-top", ""); if (parseInt($(el).data("idx")) !== dragIdx) $(el).css("border-top", "2px solid #3b7ef8"); });
			el.addEventListener("drop", (e) => {
				e.preventDefault();
				const dropIdx = parseInt($(el).data("idx"));
				if (dragIdx === null || dragIdx === dropIdx) return;
				const moved = me.wizardItems.splice(dragIdx, 1)[0];
				me.wizardItems.splice(dropIdx, 0, moved);
				dragIdx = null;
				me.renderItemsTable();
			});
		});
	}

	handleFiles(files) {
		const me = this;
		[...files].forEach(f => {
			me.wizardFiles.push(f);
			const ext = f.name.split(".").pop().toLowerCase();
			const imap = { pdf: "ti-file-type-pdf", doc: "ti-file-type-doc", docx: "ti-file-type-doc", xls: "ti-file-spreadsheet", xlsx: "ti-file-spreadsheet", png: "ti-photo", jpg: "ti-photo" };
			me.$content.find("#qlAttPreview").append(`
				<div class="ql-att-item" data-fname="${me.escapeAttr(f.name)}">
					<i class="ti ${imap[ext] || "ti-file"}" style="font-size:18px;color:#3b7ef8;flex-shrink:0;"></i>
					<span style="font-size:11px;font-weight:500;color:#111827;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${me.escapeAttr(f.name)}</span>
					<i class="ti ti-x" style="font-size:13px;color:#9ca3af;cursor:pointer;flex-shrink:0;" data-del-file="${me.escapeAttr(f.name)}"></i>
				</div>`);
		});
		me.$content.on("click.qlNew", "[data-del-file]", function () {
			const name = $(this).data("delFile");
			me.wizardFiles = me.wizardFiles.filter(f => f.name !== name);
			$(this).closest(".ql-att-item").remove();
		});
	}


	openDetailDescEdit(idx) {
		const me = this;
		const record = me.detailRecord || {};
		const items = Array.isArray(record.items) ? record.items : [];
		const item = items[idx];
		if (!item) return;
		$("#qlDIDescOverlay").remove();
		const itemName = item.item_name || item.item_code || `Item ${idx + 1}`;

		const $overlay = $(`
		<div id="qlDIDescOverlay" style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9000;display:flex;align-items:center;justify-content:center;padding:20px;">
			<div style="background:#fff;border-radius:16px;width:100%;max-width:640px;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 24px 64px rgba(0,0,0,0.18);">
				<div style="padding:16px 20px 12px;border-bottom:1px solid rgba(0,0,0,0.08);display:flex;align-items:center;justify-content:space-between;">
					<div>
						<div style="font-family:Syne,sans-serif;font-size:15px;font-weight:700;color:#111827;display:flex;align-items:center;gap:8px;"><i class="ti ti-align-left" style="color:#3b7ef8;"></i> Edit Description</div>
						<div style="font-size:11px;color:#9ca3af;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:560px;">${me.escapeAttr(itemName)}</div>
					</div>
					<button id="qlDIDescClose" style="width:28px;height:28px;border-radius:50%;border:1px solid rgba(0,0,0,0.1);background:transparent;color:#9ca3af;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;"><i class="ti ti-x"></i></button>
				</div>
				<div style="flex:1;overflow-y:auto;padding:16px 20px;">
					<div id="qlDIDescEditorHost"></div>
				</div>
				<div style="padding:12px 20px;border-top:1px solid rgba(0,0,0,0.08);background:#f8fafc;display:flex;justify-content:flex-end;gap:8px;">
					<button id="qlDIDescCancel" style="padding:7px 16px;border-radius:6px;border:1px solid rgba(0,0,0,0.1);background:#fff;font-size:13px;cursor:pointer;color:#374151;">Cancel</button>
					<button id="qlDIDescSave" style="padding:7px 18px;border-radius:6px;border:none;background:#3b7ef8;color:#fff;font-size:13px;font-weight:600;cursor:pointer;"><i class="ti ti-check" style="margin-right:4px;"></i> Save</button>
				</div>
			</div>
		</div>`);
		$("body").append($overlay);

		const ctrl = frappe.ui.form.make_control({
			parent: $overlay.find("#qlDIDescEditorHost").get(0),
			df: { fieldname: "ql_di_desc", fieldtype: "Text Editor", label: "" },
			render_input: true,
		});
		ctrl.set_value(item.description || "");

		const close = () => $overlay.remove();
		$overlay.on("click", "#qlDIDescClose, #qlDIDescCancel", close);
		$overlay.on("click", (e) => { if ($(e.target).is($overlay)) close(); });
		$overlay.on("click", "#qlDIDescSave", () => {
			const newDesc = ctrl.get_value() || "";
			// save the item's description back to the quotation
			frappe.call({
				method: "frappe.client.get",
				args: { doctype: "Quotation", name: record.name },
				callback: (r) => {
					const doc = r.message;
					if (!doc || !Array.isArray(doc.items) || !doc.items[idx]) { close(); return; }
					doc.items[idx].description = newDesc;
					frappe.call({
						method: "frappe.client.save",
						args: { doc },
						callback: (r2) => {
							if (r2.message) {
								me.detailRecord = r2.message;
								me.injectDetailItems();   // re-render cards
								frappe.show_alert({ message: "Description updated.", indicator: "green" });
							}
							close();
						},
						error: () => { frappe.show_alert({ message: "Failed to save.", indicator: "red" }); close(); },
					});
				},
			});
		});
	}

	// Fetch tax_category + taxes_and_charges template from company + customer (GST territory)

	fetchDefaultTaxes() {
		const me = this;
		const customer = me.selectedCustomerDoc?.name || "";
		if (!customer) return;
		frappe.call({
			method: "frappe.client.get_value",
			args: { doctype: "Customer", filters: { name: customer }, fieldname: "tax_category" },
			callback: (rc) => {
				// SEZ / Overseas → never show tax, never repaint breakdown
				const effCat = String(me._wizardCustomerGstCategory || me._wizardBillGstCategory || "").toLowerCase();
				if (effCat === "sez" || effCat === "overseas") {
					me._quoteTaxCategory = "";
					me.$content.find("#qlFTaxes").val("");
					me._wizardTaxAmount = 0;
					me.$content.find("#qlTaxBreakdown").hide().empty();
					return;
				}
				me._quoteTaxCategory = (rc.message && rc.message.tax_category) || "";
				if (me._quoteTaxCategory) me.$content.find("#qlFTaxCategory").val(me._quoteTaxCategory);
				const tpl = me.$content.find("#qlFTaxes").val().trim();
				if (tpl) me.renderTaxBreakdown(tpl);
			},
		});
	}

	// Standard ERPNext-style tax table: No · Type · Account Head · Tax Rate · Net Amount · Amount · Total
	renderTaxBreakdown(templateName) {
		const me = this;
		const $box = me.$content.find("#qlTaxBreakdown");
		if (!templateName) { me._wizardTaxAmount = 0; $box.hide().empty(); return; }

		// Net total of items (taxable value)
		const netTotal = (me.wizardItems || []).reduce((s, it) =>
			s + Number(it.qty || 0) * Number(it.sp || 0) * (1 - (Number(it.discount || 0) / 100)), 0);

		frappe.call({
			method: "frappe.client.get",
			args: { doctype: "Sales Taxes and Charges Template", name: templateName },
			callback: (r) => {
				const taxes = (r.message && r.message.taxes) || [];
				if (!taxes.length) { me._wizardTaxAmount = 0; $box.hide().empty(); return; }

				const fmt = n => "₹ " + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

				// Running total like standard ERPNext: each row's "Total" = net + cumulative taxes so far
				let cumulativeTax = 0;
				const rows = taxes.map((t, i) => {
					const rate = Number(t.rate || 0);
					const chargeType = t.charge_type || "On Net Total";
					// Amount for this tax row
					let amount = 0;
					if (chargeType === "On Net Total") amount = netTotal * rate / 100;
					else if (chargeType === "Actual") amount = Number(t.tax_amount || 0);
					else if (chargeType === "On Previous Row Total") amount = (netTotal + cumulativeTax) * rate / 100;
					else amount = netTotal * rate / 100;

					cumulativeTax += amount;
					const rowTotal = netTotal + cumulativeTax;   // running total

					return `
						<tr style="border-bottom:1px solid rgba(0,0,0,0.06);">
							<td style="padding:9px 10px;color:#9ca3af;font-size:11px;text-align:center;">${i + 1}</td>
							<td style="padding:9px 10px;font-size:12px;color:#111827;font-weight:500;">${me.escapeAttr(chargeType)}</td>
							<td style="padding:9px 10px;font-size:12px;color:#374151;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px;">${me.escapeAttr(t.account_head || t.description || "—")}</td>
							<td style="padding:9px 10px;font-size:12px;text-align:right;color:#374151;">${rate}</td>
							<td style="padding:9px 10px;font-size:12px;text-align:right;color:#6b7280;">${fmt(netTotal)}</td>
							<td style="padding:9px 10px;font-size:12px;text-align:right;font-weight:600;color:#3b7ef8;">${fmt(amount)}</td>
							<td style="padding:9px 10px;font-size:12px;text-align:right;font-weight:700;color:#111827;">${fmt(rowTotal)}</td>
						</tr>`;
				}).join("");

				const grandTotal = netTotal + cumulativeTax;
				me._wizardTaxAmount = cumulativeTax;   // capture for payment schedule
				if (me._payCombo) me.renderPaymentScheduleFromCombo();

				$box.html(`
					<div style="font-size:13px;font-weight:600;color:#111827;margin-bottom:10px;">Sales Taxes and Charges</div>
					<div style="border:1px solid rgba(0,0,0,0.08);border-radius:10px;overflow:hidden;">
						<table style="width:100%;border-collapse:collapse;">
							<thead><tr style="background:#f8fafc;">
								<th style="padding:10px;width:42px;border-bottom:1px solid rgba(0,0,0,0.08);font-size:11px;font-weight:600;color:#6b7280;text-align:center;">No.</th>
								<th style="padding:10px;border-bottom:1px solid rgba(0,0,0,0.08);font-size:11px;font-weight:600;color:#6b7280;text-align:left;">Type</th>
								<th style="padding:10px;border-bottom:1px solid rgba(0,0,0,0.08);font-size:11px;font-weight:600;color:#6b7280;text-align:left;">Account Head</th>
								<th style="padding:10px;border-bottom:1px solid rgba(0,0,0,0.08);font-size:11px;font-weight:600;color:#6b7280;text-align:right;">Tax Rate</th>
								<th style="padding:10px;border-bottom:1px solid rgba(0,0,0,0.08);font-size:11px;font-weight:600;color:#6b7280;text-align:right;">Net Amount</th>
								<th style="padding:10px;border-bottom:1px solid rgba(0,0,0,0.08);font-size:11px;font-weight:600;color:#6b7280;text-align:right;">Amount (INR)</th>
								<th style="padding:10px;border-bottom:1px solid rgba(0,0,0,0.08);font-size:11px;font-weight:600;color:#6b7280;text-align:right;">Total (INR)</th>
							</tr></thead>
							<tbody>${rows}</tbody>
							<tfoot>
								<tr style="background:#f8fafc;">
									<td colspan="5" style="padding:10px;text-align:right;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:.04em;">Total Taxes</td>
									<td style="padding:10px;text-align:right;font-weight:700;font-size:13px;color:#3b7ef8;">${fmt(cumulativeTax)}</td>
									<td style="padding:10px;text-align:right;font-weight:700;font-size:14px;color:#111827;">${fmt(grandTotal)}</td>
								</tr>
							</tfoot>
						</table>
					</div>`).show();
			},
			error: () => { me._wizardTaxAmount = 0; $box.hide().empty(); },
		});
	}
	// Determine tax category + template from billing address GST state (like standard)
	determineTaxFromAddress() {
		const me = this;
		const company = me.$content.find("#qlFCompany").val().trim();
		const addrName = me.$content.find("#qlFAddress").val().trim();
		if (!company || !addrName) return;

		// 1) get billing address GST state
		frappe.call({
			method: "frappe.client.get_value",
			args: { doctype: "Address", filters: { name: addrName }, fieldname: ["gst_state", "state"] },
			callback: (ra) => {
				const custState = (ra.message && (ra.message.gst_state || ra.message.state)) || "";

				// 2) get company GST state (from company's default address or gst_category)
				frappe.call({
					method: "frappe.client.get_value",
					args: { doctype: "Company", filters: { name: company }, fieldname: ["gstin"] },
					callback: (rcomp) => {
						// company state from its address — fetch company's primary address gst_state
						const compAddrName = me.$content.find("#qlFCompanyAddress").val().trim();
						const finishWith = (compState) => {
							const sameState = custState && compState && (custState.trim().toLowerCase() === compState.trim().toLowerCase());
							const taxCategory = sameState ? "In-State - TG" : "Out-State - TG";  // adjust to your category names
							me._quoteTaxCategory = taxCategory;
							me.$content.find("#qlFTaxCategory").val(taxCategory);
							me.resolveTemplateForCategory(taxCategory, company);
						};
						if (compAddrName) {
							frappe.call({
								method: "frappe.client.get_value",
								args: { doctype: "Address", filters: { name: compAddrName }, fieldname: ["gst_state", "state"] },
								callback: (rca) => finishWith((rca.message && (rca.message.gst_state || rca.message.state)) || ""),
								error: () => finishWith(""),
							});
						} else {
							finishWith("");
						}
					},
				});
			},
		});
	}

	// Find the taxes template matching this tax category
	resolveTemplateForCategory(taxCategory, company) {
		const me = this;
		if (!taxCategory) return;
		frappe.call({
			method: "frappe.client.get_list",
			args: {
				doctype: "Sales Taxes and Charges Template",
				filters: [["tax_category", "=", taxCategory], ["company", "=", company]],
				fields: ["name"],
				limit_page_length: 1,
			},
			callback: (rt) => {
				const tpl = (rt.message && rt.message[0] && rt.message[0].name) || "";
				if (tpl) {
					me.$content.find("#qlFTaxes").val(tpl);
					me.renderTaxBreakdown(tpl);
				}
			},
		});
	}





	// Auto-fill tax category (In-State / Out-State) from GST states — like India Compliance

	autoSetTaxCategory() {
		const me = this;
		const billAddr = me.$content.find("#qlFAddress").val().trim();
		const company = me.$content.find("#qlFCompany").val().trim();
		console.log("autoSetTaxCategory:", { billAddr, company });
		if (!billAddr || !company) { console.log("  → missing billAddr or company, abort"); return; }

		frappe.call({
			method: "frappe.client.get_value",
			args: { doctype: "Address", filters: { name: billAddr }, fieldname: ["gst_state_number", "gstin", "gst_category"] },
			callback: (ra) => {
				me._wizardBillGstCategory = (ra.message && ra.message.gst_category) || "";

				// SEZ / Overseas → no GST: clear category, template, and breakdown
				const effCat = String(me._wizardBillGstCategory || me._wizardCustomerGstCategory || "").toLowerCase();
				if (effCat === "sez" || effCat === "overseas") {
					me._quoteTaxCategory = "";
					me.$content.find("#qlFTaxCategory").val(me._wizardBillGstCategory || "");
					me.$content.find("#qlFTaxes").val("");
					me._wizardTaxAmount = 0;
					me.$content.find("#qlTaxBreakdown").hide().empty();
					if (me._payCombo) me.renderPaymentScheduleFromCombo();
					return;
				}

				if (me._payCombo) me.renderPaymentScheduleFromCombo();
				const custCode = me._gstStateCode(ra.message);
				console.log("  customer GST code:", custCode, ra.message);
				if (!custCode) { console.log("  → no customer GST code, abort"); return; }

				frappe.call({
					method: "frappe.client.get_value",
					args: { doctype: "Company", filters: { name: company }, fieldname: ["gstin"] },
					callback: (rc) => {
						const compCode = me._gstStateCode(rc.message);
						console.log("  company GST code:", compCode);
						if (!compCode) return;
						const category = (custCode === compCode) ? "In-State" : "Out-State";
						console.log("  → tax category:", category);
						me._quoteTaxCategory = category;
						me.$content.find("#qlFTaxCategory").val(category);
						me.autoSetTaxTemplate(category, company);
					},
				});
			},
		});
	}

	// Extract 2-digit GST state code from address/company (gst_state_number, else first 2 of GSTIN)
	_gstStateCode(obj) {
		if (!obj) return "";
		if (obj.gst_state_number) return String(obj.gst_state_number).trim();
		if (obj.gstin) return String(obj.gstin).trim().substring(0, 2);
		return "";
	}

	// Auto-pick the taxes_and_charges template matching the tax category + company
	autoSetTaxTemplate(taxCategory, company) {
		const me = this;
		console.log("autoSetTaxTemplate:", { taxCategory, company });
		if (!taxCategory || !company) return;
		frappe.call({
			method: "frappe.client.get_list",
			args: {
				doctype: "Sales Taxes and Charges Template",
				filters: [["tax_category", "=", taxCategory], ["company", "=", company], ["disabled", "=", 0]],
				fields: ["name"],
				limit_page_length: 1,
			},
			callback: (rt) => {
				console.log("  template found:", JSON.stringify(rt.message));
				const tpl = (rt.message && rt.message[0] && rt.message[0].name) || "";
				if (tpl) {
					me.$content.find("#qlFTaxes").val(tpl);
					me.renderTaxBreakdown(tpl);
				} else {
					console.log("  → NO template for", taxCategory);
				}
			},
		});
	}












	renderPaymentSchedule(templateName) {
		const me = this;
		const $box = me.$content.find("#qlPaymentSchedule");
		if (!templateName) { $box.hide().empty(); return; }

		const grandTotal = (me.wizardItems || []).reduce((s, it) =>
			s + Number(it.qty || 0) * Number(it.sp || 0) * (1 - (Number(it.discount || 0) / 100)), 0);

		frappe.call({
			method: "frappe.client.get",
			args: { doctype: "Payment Terms Template", name: templateName },
			callback: (r) => {
				const terms = (r.message && r.message.terms) || [];
				if (!terms.length) { $box.hide().empty(); return; }

				const fmt = n => "₹ " + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
				const today = frappe.datetime.get_today();

				const rows = terms.map((t, i) => {
					const portion = Number(t.invoice_portion || 0);
					const amount = grandTotal * portion / 100;
					// due date = today + credit_days (simple estimate)
					let dueDate = today;
					if (t.credit_days) {
						const d = frappe.datetime.add_days(today, Number(t.credit_days));
						dueDate = d;
					}
					return `
						<tr style="border-bottom:1px solid rgba(0,0,0,0.06);">
							<td style="padding:9px 10px;color:#9ca3af;font-size:11px;text-align:center;">${i + 1}</td>
							<td style="padding:9px 10px;font-size:12px;color:#111827;">${me.escapeAttr(t.payment_term || t.description || "—")}</td>
							<td style="padding:9px 10px;font-size:12px;color:#374151;">${me.escapeAttr(me.formatDate(dueDate))}</td>
							<td style="padding:9px 10px;font-size:12px;text-align:right;color:#374151;">${portion}%</td>
							<td style="padding:9px 10px;font-size:12px;text-align:right;font-weight:700;color:#3b7ef8;">${fmt(amount)}</td>
						</tr>`;
				}).join("");

				$box.html(`
					<div style="font-size:13px;font-weight:600;color:#111827;margin:14px 0 10px;">Payment Schedule</div>
					<div style="border:1px solid rgba(0,0,0,0.08);border-radius:10px;overflow:hidden;">
						<table style="width:100%;border-collapse:collapse;">
							<thead><tr style="background:#f8fafc;">
								<th style="padding:10px;width:42px;border-bottom:1px solid rgba(0,0,0,0.08);font-size:11px;font-weight:600;color:#6b7280;text-align:center;">No.</th>
								<th style="padding:10px;border-bottom:1px solid rgba(0,0,0,0.08);font-size:11px;font-weight:600;color:#6b7280;text-align:left;">Payment Term</th>
								<th style="padding:10px;border-bottom:1px solid rgba(0,0,0,0.08);font-size:11px;font-weight:600;color:#6b7280;text-align:left;">Due Days</th>
						<th style="padding:10px;border-bottom:1px solid rgba(0,0,0,0.08);font-size:11px;font-weight:600;color:#6b7280;text-align:left;">Due Date</th><th style="padding:10px;border-bottom:1px solid rgba(0,0,0,0.08);font-size:11px;font-weight:600;color:#6b7280;text-align:right;">Invoice Portion</th>
								<th style="padding:10px;border-bottom:1px solid rgba(0,0,0,0.08);font-size:11px;font-weight:600;color:#6b7280;text-align:right;">Payment Amount</th>
							</tr></thead>
							<tbody>${rows}</tbody>
						</table>
					</div>`).show();
			},
			error: () => $box.hide().empty(),
		});
	}


	_payComboConfig() {
		return {
			adv100:     { adv: 100, del: 0,   after: 0, permission: false },
			del100:     { adv: 0,   del: 100, after: 0, permission: false },
			adv50del50: { adv: 50,  del: 50,  after: 0, permission: false },
			custom:     { adv: 0,   del: 0,   after: 0, permission: false, custom: true },
		};
	}


	// Resolve the active payment-term values from combo + editable state.
	// advDays is always 0 (not editable). delDays / afterDays come from state.
	// For "custom", percentages come from state too.
	_payTermValues() {
		const me = this;
		const cfg = me._payComboConfig()[me._payCombo] || {};
		const isCustom = !!cfg.custom;
		const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
		return {
			isCustom,
			permission: !!cfg.permission,
			adv:   isCustom ? num(me._payCustomAdv)   : num(cfg.adv),
			del:   isCustom ? num(me._payCustomDel)   : num(cfg.del),
			after: isCustom ? num(me._payCustomAfter) : num(cfg.after),
			advDays: 0,
			delDays: num(me._payDelDays, 0),
			afterDays: num(me._payAfterDays, 0),
		};
	}

	// Detail-view resolver: active values from combo + detail editable state.
	_detailPayTermValues() {
		const me = this;
		const cfg = me._payComboConfig()[me._detailPayCombo] || {};
		const isCustom = !!cfg.custom;
		const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
		return {
			isCustom,
			permission: !!cfg.permission,
			adv:   isCustom ? num(me._detailCustAdv)   : num(cfg.adv),
			del:   isCustom ? num(me._detailCustDel)   : num(cfg.del),
			after: isCustom ? num(me._detailCustAfter) : num(cfg.after),
			advDays: 0,
			delDays: num(me._detailDelDays, 0),
			afterDays: num(me._detailPayDays, 0),
		};
	}

	_detailPayPercentValid() {
		const v = this._detailPayTermValues();
		return Math.round(v.adv + v.del + v.after) === 100;
	}

	renderDetailPayTermsTable() {
		const me = this;
		const $box = me.$content.find("#qlPayTermsTableDetail");
		if (!$box.length) return;
		if (!me._detailPayCombo) { $box.hide().empty(); return; }
		const v = me._detailPayTermValues();
		const isCustom = v.isCustom;
		const record = me.detailRecord || {};
		const grand = Number(record.grand_total || record.rounded_total || 0);

		const PCT_OPTS = [0, 25, 50, 75, 100];
		const DAY_OPTS = [0, 7, 15, 30, 45, 60];
		const fmt = n => "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

		const pctInput = (key, val) => isCustom
			? `<select class="ql-dpt-pct ql-field-input" data-pt="${key}" style="height:32px;text-align:center;width:84px;">
					${PCT_OPTS.map(o => `<option value="${o}" ${Number(val) === o ? "selected" : ""}>${o}%</option>`).join("")}
				</select>`
			: `<span style="font-size:14px;font-weight:500;">${val}%</span>`;

		const daysInput = (key, val, editable) => editable
			? `<select class="ql-dpt-days ql-field-input" data-pt="${key}" style="height:32px;text-align:center;width:74px;">
					${DAY_OPTS.map(o => `<option value="${o}" ${Number(val) === o ? "selected" : ""}>${o}</option>`).join("")}
				</select>`
			: `<span style="font-size:12px;color:#9ca3af;">0</span>`;

		const total = Math.round(v.adv + v.del + v.after);
		const totalOk = total === 100;

		const row = (cfg) => {
			const active = cfg.pct > 0;
			const amt = grand * cfg.pct / 100;
			return `
			<div style="display:grid;grid-template-columns:36px 1fr 92px 84px 104px;align-items:center;gap:10px;padding:9px 12px;border:${active ? "2px solid #3b7ef8" : "1px solid rgba(0,0,0,0.08)"};border-radius:10px;background:${active ? "#eef3ff" : "#fff"};">
				<div style="width:30px;height:30px;border-radius:8px;background:${active ? "#3b7ef8" : "#f8fafc"};display:flex;align-items:center;justify-content:center;">
					<i class="ti ${cfg.icon}" style="font-size:15px;color:${active ? "#fff" : "#9ca3af"};"></i>
				</div>
				<div>
					<div style="font-size:13px;font-weight:600;color:${active ? "#0c447c" : "#111827"};">${cfg.label}</div>
					<div style="font-size:11px;color:${active ? "#185fa5" : "#9ca3af"};">${cfg.sub}</div>
				</div>
				<div style="text-align:center;">${pctInput(cfg.key, cfg.pct)}</div>
				<div style="text-align:center;">${daysInput(cfg.daysKey, cfg.days, cfg.daysEditable)}</div>
				<div style="text-align:right;font-size:13px;font-weight:${active ? "600" : "400"};color:${active ? "#3b7ef8" : "#9ca3af"};">${fmt(amt)}</div>
			</div>`;
		};

		$box.html(`
			<div style="display:grid;grid-template-columns:36px 1fr 92px 84px 104px;gap:10px;padding:0 12px 6px;">
				<div></div>
				<div style="font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:.04em;">Milestone</div>
				<div style="font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:.04em;text-align:center;">Percent</div>
				<div style="font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:.04em;text-align:center;">Days</div>
				<div style="font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:.04em;text-align:right;">Amount</div>
			</div>
			<div style="display:flex;flex-direction:column;gap:8px;">
				${row({ key: "adv",   daysKey: "advDays",   label: "Advance",        sub: "on order",      icon: "ti-cash",            pct: v.adv,   days: 0,          daysEditable: false })}
				${row({ key: "del",   daysKey: "delDays",   label: "On Delivery",    sub: "at delivery",   icon: "ti-truck-delivery",  pct: v.del,   days: v.delDays,  daysEditable: v.del > 0 })}
				${row({ key: "after", daysKey: "afterDays", label: "After Delivery", sub: "post delivery", icon: "ti-calendar-due",    pct: v.after, days: v.afterDays,daysEditable: v.after > 0 })}
			</div>
			<div style="display:flex;align-items:center;gap:10px;margin-top:12px;">
				<div style="flex:1;height:6px;border-radius:3px;background:#f1f5f9;overflow:hidden;">
					<div style="width:${Math.min(total, 100)}%;height:100%;background:${totalOk ? "#16a34a" : "#dc2626"};border-radius:3px;transition:width .2s;"></div>
				</div>
				<span style="font-size:12px;font-weight:600;color:${totalOk ? "#0f6e56" : "#dc2626"};white-space:nowrap;">
					${totalOk ? '<i class="ti ti-check" style="font-size:13px;vertical-align:-1px;"></i> ' : ""}Total ${total}%${totalOk ? "" : " — must equal 100%"}
				</span>
			</div>
		`).show();

		$box.off("change.qlDPT", ".ql-dpt-pct").on("change.qlDPT", ".ql-dpt-pct", function () {
			const key = $(this).data("pt"); const val = parseFloat(this.value) || 0;
			if (key === "adv") me._detailCustAdv = val;
			else if (key === "del") me._detailCustDel = val;
			else if (key === "after") me._detailCustAfter = val;
			me.renderDetailPayTermsTable();
			me._rebuildDetailScheduleFromTerms();
			me._markPayDirty();
		});
		$box.off("change.qlDPTd", ".ql-dpt-days").on("change.qlDPTd", ".ql-dpt-days", function () {
			const key = $(this).data("pt"); const val = parseInt(this.value) || 0;
			if (key === "delDays") me._detailDelDays = val;
			else if (key === "afterDays") me._detailPayDays = val;
			me.renderDetailPayTermsTable();
			me._rebuildDetailScheduleFromTerms();
			me._markPayDirty();
		});
	}

	_markPayDirty() {
		this.$content.find("#qlPaySaveBar").css("display", "flex");
	}

	// Rebuild me._paySched from the detail terms table, then repaint the schedule.
	_rebuildDetailScheduleFromTerms() {
		const me = this;
		const v = me._detailPayTermValues();
		const record = me.detailRecord || {};
		const grandTotal = Number(record.grand_total || record.rounded_total || 0);
		const out = [];
		if (v.adv)   out.push({ description: "Advance",        credit_days: 0,          invoice_portion: v.adv,   payment_amount: grandTotal * v.adv / 100 });
		if (v.del)   out.push({ description: `On Delivery${v.delDays ? ` (${v.delDays} days)` : ""}`, credit_days: v.delDays, invoice_portion: v.del, payment_amount: grandTotal * v.del / 100 });
		if (v.after) out.push({ description: `After Delivery (${v.afterDays} days)`, credit_days: v.afterDays, invoice_portion: v.after, payment_amount: grandTotal * v.after / 100 });
		me._paySched = out;
		me._payRepaintOnly = true;     // preserve in-memory edits; don't re-seed from saved doc
		me.injectPaymentSchedule();   // repaint both tables + schedule rows
	}

	// True only when the three percentages total exactly 100.
	_payPercentValid() {
		const v = this._payTermValues();
		return Math.round(v.adv + v.del + v.after) === 100;
	}

	renderPayCombos() {
		const me = this;
		const $sel = me.$content.find("#qlPayComboSelect");
		if (!$sel.length) return;
		const combos = me._payComboConfig();
		const describe = (c) => {
			const parts = [];
			if (c.adv) parts.push(`Advance ${c.adv}%`);
			if (c.del) parts.push(`On Delivery ${c.del}%`);
			if (c.after) parts.push(`After Delivery ${c.after}%`);
			return parts.join(" / ") + (c.permission ? "  (Approval)" : "");
		};
		const opts = ['<option value="">Select payment terms…</option>']
			.concat(Object.keys(combos).map(key => {
				const label = combos[key].custom ? "Custom (enter manually)" : describe(combos[key]);
				return `<option value="${key}" ${me._payCombo === key ? "selected" : ""}>${me.escapeAttr(label)}</option>`;
			}));
		$sel.html(opts.join(""));
	}

	selectPayCombo(key) {
		const me = this;
		const c = me._payComboConfig()[key];
		if (!c) return;
		me._payCombo = key;
		me._payApproved = false;
		// reset editable state on each change
		me._payCustomAdv = 0; me._payCustomDel = 0; me._payCustomAfter = 0;
		me._payDelDays = 0; me._payAfterDays = 0;
		me.renderPayCombos();
		me.$content.find("#qlPayAfterDaysWrap").hide();   // days now live in the terms table
		me.$content.find("#qlPayApprovalWrap").toggle(!!c.permission);
		me.$content.find("#qlPayApprovedChk").prop("checked", false);
		me.renderPaymentTermsTable();
		me.renderPaymentScheduleFromCombo();
	}

	// _buildPayMilestones(c, baseDate, grandTotal) {
	// 	const me = this;
	// 	const out = [];
	// 	const used = new Set();
	// 	const uniqueDate = (date) => {
	// 		let d = date;
	// 		while (used.has(d)) d = frappe.datetime.add_days(d, 1);
	// 		used.add(d);
	// 		return d;
	// 	};

	// 	if (c.adv) {
	// 		out.push({ term: "Advance", label: "Advance", portion: c.adv, due_date: uniqueDate(baseDate), amount: grandTotal * c.adv / 100 });
	// 	}
	// 	if (c.del) {
	// 		out.push({ term: "On Delivery", label: "On Delivery", portion: c.del, due_date: uniqueDate(baseDate), amount: grandTotal * c.del / 100 });
	// 	}
	// 	if (c.after) {
	// 		const days = Number(me._payAfterDays || 0);
	// 		const target = days ? frappe.datetime.add_days(baseDate, days) : baseDate;
	// 		out.push({ term: "After Delivery", label: `After Delivery (${days} days)`, portion: c.after, due_date: uniqueDate(target), amount: grandTotal * c.after / 100 });
	// 	}
	// 	return out;
	// }

	_buildPayMilestones(c, baseDate, grandTotal) {
		const me = this;
		const out = [];
		if (c.adv) {
			out.push({ term: "Advance", label: "Advance", portion: c.adv, credit_days: 0, amount: grandTotal * c.adv / 100 });
		}
		if (c.del) {
			const delDays = Number(me._payDelDays != null ? me._payDelDays : 7);  // On Delivery default, distinct from Advance
			out.push({ term: "On Delivery", label: `On Delivery${delDays ? ` (${delDays} days)` : ""}`, portion: c.del, credit_days: delDays, amount: grandTotal * c.del / 100 });
		}
		if (c.after) {
			const days = Number(me._payAfterDays || 0);
			out.push({ term: "After Delivery", label: `After Delivery (${days} days)`, portion: c.after, credit_days: days, amount: grandTotal * c.after / 100 });
		}
		return out;
	}

	renderPaymentTermsTable() {
		const me = this;
		const $box = me.$content.find("#qlPayTermsTable");
		if (!me._payCombo) { $box.hide().empty(); return; }
		const v = me._payTermValues();
		const isCustom = v.isCustom;

		const PCT_OPTS = [0, 25, 50, 75, 100];
		const DAY_OPTS = [0, 7, 15, 30, 45, 60];

		// % cell: read-only for combos, dropdown for Custom
		const pctCell = (key, val) => isCustom
			? `<select class="ql-pt-pct ql-field-input" data-pt="${key}" style="height:30px;text-align:center;width:84px;">
					${PCT_OPTS.map(o => `<option value="${o}" ${Number(val) === o ? "selected" : ""}>${o}%</option>`).join("")}
				</select>`
			: `<div style="font-weight:700;color:#111827;">${val}%</div>`;

		// Days cell: Advance locked at 0; On Delivery + After Delivery = dropdown
		const daysCell = (key, val, editable) => editable
			? `<select class="ql-pt-days ql-field-input" data-pt="${key}" style="height:30px;text-align:center;width:74px;">
					${DAY_OPTS.map(o => `<option value="${o}" ${Number(val) === o ? "selected" : ""}>${o}</option>`).join("")}
				</select>`
			: `<div style="color:#9ca3af;">${val || 0}</div>`;

		const total = Math.round(v.adv + v.del + v.after);
		const totalOk = total === 100;

		// term column: stacked % (top) and Days (bottom) sub-cells
		const termCol = (pctHtml, daysHtml) => `
			<td style="padding:0;border-left:1px solid rgba(0,0,0,0.08);">
				<div style="padding:10px;border-bottom:1px solid rgba(0,0,0,0.06);">${pctHtml}</div>
				<div style="padding:10px;">${daysHtml}</div>
			</td>`;

		$box.html(`
			<div style="font-size:13px;font-weight:600;color:#111827;margin-bottom:10px;">Payment Terms</div>
			<div style="border:1px solid rgba(0,0,0,0.08);border-radius:10px;overflow:hidden;">
				<table style="width:100%;border-collapse:collapse;text-align:center;">
					<thead><tr style="background:#f8fafc;">
						<th style="padding:10px;width:64px;font-size:11px;font-weight:600;color:#6b7280;border-right:1px solid rgba(0,0,0,0.08);"></th>
						<th style="padding:10px;font-size:11px;font-weight:600;color:#6b7280;border-left:1px solid rgba(0,0,0,0.08);">Advance</th>
						<th style="padding:10px;font-size:11px;font-weight:600;color:#6b7280;border-left:1px solid rgba(0,0,0,0.08);">On Delivery</th>
						<th style="padding:10px;font-size:11px;font-weight:600;color:#6b7280;border-left:1px solid rgba(0,0,0,0.08);">After Delivery</th>
					</tr></thead>
					<tbody><tr>
						<td style="padding:0;border-right:1px solid rgba(0,0,0,0.08);font-size:11px;font-weight:600;color:#6b7280;">
							<div style="padding:10px;border-bottom:1px solid rgba(0,0,0,0.06);">%</div>
							<div style="padding:10px;">Days</div>
						</td>
						${termCol(pctCell("adv", v.adv),   daysCell("advDays", 0, false))}
						${termCol(pctCell("del", v.del),   daysCell("delDays", v.delDays, v.del > 0))}
						${termCol(pctCell("after", v.after), daysCell("afterDays", v.afterDays, v.after > 0))}
					</tr></tbody>
				</table>
			</div>
			<div style="display:flex;justify-content:flex-end;margin-top:6px;">
				<span style="font-size:11px;font-weight:600;color:${totalOk ? "#16a34a" : "#dc2626"};">
					Total: ${total}%${totalOk ? "" : " — must equal 100%"}
				</span>
			</div>
		`).show();

		// % dropdown (Custom)
		$box.off("change.qlPT", ".ql-pt-pct").on("change.qlPT", ".ql-pt-pct", function () {
			const key = $(this).data("pt"); const val = parseFloat(this.value) || 0;
			if (key === "adv") me._payCustomAdv = val;
			else if (key === "del") me._payCustomDel = val;
			else if (key === "after") me._payCustomAfter = val;
			me.renderPaymentTermsTable();
			me.renderPaymentScheduleFromCombo();
		});

		// Days dropdown (On Delivery + After Delivery)
		$box.off("change.qlPTd", ".ql-pt-days").on("change.qlPTd", ".ql-pt-days", function () {
			const key = $(this).data("pt"); const val = parseInt(this.value) || 0;
			if (key === "delDays") me._payDelDays = val;
			else if (key === "afterDays") me._payAfterDays = val;
			me.renderPaymentScheduleFromCombo();
		});
	}

	renderPaymentScheduleFromCombo() {
		const me = this;
		const $box = me.$content.find("#qlPaymentSchedule");
		if (!me._payCombo) { $box.hide().empty(); return; }
		const v = me._payTermValues();

		// current (pre-tax):
		// will become (tax-inclusive):
		const subtotal = (me.wizardItems || []).reduce((s, it) =>
			s + Number(it.qty || 0) * Number(it.sp || 0) * (1 - (Number(it.discount || 0) / 100)), 0);
		// SEZ / Overseas → zero tax (address gst_category wins over customer)
		const addrCat = String(me._wizardShipGstCategory || me._wizardBillGstCategory || "").toLowerCase();
		const custCat = String(me._wizardCustomerGstCategory || "").toLowerCase();
		const effCat = addrCat || custCat;   // address takes precedence
		const isZeroTax = (effCat === "sez" || effCat === "overseas");

		const taxAmount = isZeroTax ? 0 : Number(me._wizardTaxAmount || 0);
		let grandTotal = subtotal + taxAmount;
		const fmt = n => "₹ " + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

		// build milestones from resolved values
		const milestones = [];
		if (v.adv)   milestones.push({ label: "Advance",        portion: v.adv,   credit_days: 0,          amount: grandTotal * v.adv / 100 });
		if (v.del)   milestones.push({ label: `On Delivery${v.delDays ? ` (${v.delDays} days)` : ""}`,     portion: v.del,   credit_days: v.delDays,   amount: grandTotal * v.del / 100 });
		if (v.after) milestones.push({ label: `After Delivery (${v.afterDays} days)`,                      portion: v.after, credit_days: v.afterDays, amount: grandTotal * v.after / 100 });

		// keep a copy for submit
		me._payMilestones = milestones;

		const rows = milestones.length
			? milestones.map((m, i) => `
				<tr style="border-bottom:1px solid rgba(0,0,0,0.06);">
					<td style="padding:9px 10px;color:#9ca3af;font-size:11px;text-align:center;">${i + 1}</td>
					<td style="padding:9px 10px;font-size:12px;color:#111827;">${me.escapeAttr(m.label)}</td>
					<td style="padding:9px 10px;font-size:12px;color:#374151;">${m.credit_days > 0 ? m.credit_days + " days" : "0 (on invoice)"}</td>
					<td style="padding:9px 10px;font-size:12px;text-align:right;color:#374151;">${m.portion}%</td>
					<td style="padding:9px 10px;font-size:12px;text-align:right;font-weight:700;color:#3b7ef8;">${fmt(m.amount)}</td>
				</tr>`).join("")
			: `<tr><td colspan="5" style="padding:14px;text-align:center;color:#9ca3af;font-size:12px;">Set percentages above to generate the schedule.</td></tr>`;

		$box.html(`
			<div style="font-size:13px;font-weight:600;color:#111827;margin:16px 0 10px;">Payment Schedule <span style="font-size:11px;font-weight:500;color:#9ca3af;">(estimated on grand total, incl. tax)</span></div>
			<div style="border:1px solid rgba(0,0,0,0.08);border-radius:10px;overflow:hidden;">
				<table style="width:100%;border-collapse:collapse;">
					<thead><tr style="background:#f8fafc;">
						<th style="padding:10px;width:42px;font-size:11px;font-weight:600;color:#6b7280;text-align:center;">No.</th>
						<th style="padding:10px;font-size:11px;font-weight:600;color:#6b7280;text-align:left;">Milestone</th>
						<th style="padding:10px;font-size:11px;font-weight:600;color:#6b7280;text-align:left;">Due Days</th>
						<th style="padding:10px;font-size:11px;font-weight:600;color:#6b7280;text-align:right;">Portion</th>
						<th style="padding:10px;font-size:11px;font-weight:600;color:#6b7280;text-align:right;">Amount</th>
					</tr></thead>
					<tbody>${rows}</tbody>
				</table>
			</div>`).show();
	}



	renderTermsContent(termsName) {
		const me = this;
		const $box = me.$content.find("#qlTermsContent");
		if (!termsName) { $box.hide().empty(); return; }
		frappe.call({
			method: "frappe.client.get",
			args: { doctype: "Terms and Conditions", name: termsName },
			callback: (r) => {
				const html = (r.message && (r.message.terms || r.message.terms_and_conditions)) || "";
				if (!html) { $box.hide().empty(); return; }
				$box.html(`
					<div style="font-size:13px;font-weight:600;color:#111827;margin:14px 0 10px;">Terms &amp; Conditions Preview</div>
					<div style="border:1px solid rgba(0,0,0,0.08);border-radius:10px;padding:14px 16px;background:#f8fafc;font-size:12px;color:#374151;line-height:1.6;max-height:240px;overflow-y:auto;">${html}</div>
				`).show();
			},
			error: () => $box.hide().empty(),
		});
	}

	// ── Review (Step 4) ─────────────────────────────────────
	buildReview() {
		const me = this;
		const g = id => (me.$content.find(id).val() || "—").trim();
		const totalSell = me.calcTotals();
		const fmt = n => "₹ " + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
		const subject = g("#qlFSubject");
		const customer = g("#qlFCustomer");
		const company = g("#qlFCompany");
		const salesperson = g("#qlFSalesperson");
		const validTill = g("#qlFValidTill");
		const payTerms = g("#qlFPayTerms");
		const taxes = g("#qlFTaxes");
		const address = g("#qlFAddress");
		const shipAddress = g("#qlFShipAddress");
		const compAddress = g("#qlFCompanyAddress");
		const terms = g("#qlFTerms");
		const colors = ["#3b7ef8", "#16a34a", "#d97706", "#7c3aed", "#dc2626"];

		const contactsHTML = me.wizardContacts.length
			? me.wizardContacts.map((c, i) => {
				const av = (c.name || "?")[0].toUpperCase();
				const clr = colors[i % colors.length];
				return `<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid rgba(0,0,0,0.06);">
					<div style="width:36px;height:36px;border-radius:50%;background:${clr}1a;border:2px solid ${clr}33;display:flex;align-items:center;justify-content:center;font-family:Syne,sans-serif;font-size:14px;font-weight:700;color:${clr};flex-shrink:0;">${av}</div>
					<div style="flex:1;min-width:0;">
						<div style="font-weight:600;font-size:13px;color:#111827;">${me.escapeAttr(c.name || "—")}</div>
						${c.email ? `<div style="font-size:12px;color:#3b7ef8;margin-top:2px;"><i class="ti ti-mail" style="font-size:11px;margin-right:4px;color:#9ca3af;"></i>${me.escapeAttr(c.email)}</div>` : ""}
						${c.phone ? `<div style="font-size:12px;color:#374151;margin-top:2px;"><i class="ti ti-device-mobile" style="font-size:11px;margin-right:4px;color:#9ca3af;"></i>${me.escapeAttr(c.phone)}</div>` : ""}
					</div>
				</div>`;
			}).join("")
			: '<div style="padding:16px;text-align:center;color:#9ca3af;font-size:12px;">No contacts added</div>';

		const typeCls = { new: "ql-type-new", renewal: "ql-type-renewal", additional: "ql-type-additional" };
		const typeLabel = { new: "New", renewal: "Renewal", additional: "Additional" };
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
				return `<tr style="border-bottom:1px solid rgba(0,0,0,0.06);">
						<td style="padding:8px 10px;color:#9ca3af;font-size:11px;">${i + 1}</td>
						<td style="padding:8px 10px;"><div style="font-weight:600;color:#111827;">${me.escapeAttr(item.name)}</div>${item.code ? `<div style="font-size:10px;color:#9ca3af;">${me.escapeAttr(item.code)}</div>` : ""}</td>
						<td style="padding:8px 10px;"><span class="ql-type-badge ${typeCls[item.type] || "ql-type-new"}">${typeLabel[item.type] || "New"}</span></td>
						<td style="padding:8px 10px;text-align:right;">${item.qty}</td>
						<td style="padding:8px 10px;text-align:right;">₹${sp.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
						<td style="padding:8px 10px;text-align:right;font-weight:600;">₹${amt.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
					</tr>`;
			}).join("")}</tbody>
				<tfoot><tr style="background:#f8fafc;">
					<td colspan="5" style="padding:10px;text-align:right;font-weight:700;font-size:13px;color:#111827;">Grand Total</td>
					<td style="padding:10px;text-align:right;font-weight:700;font-size:15px;color:#3b7ef8;font-family:Syne,sans-serif;">${fmt(totalSell)}</td>
				</tr></tfoot>
			</table>`
			: '<div style="padding:20px;text-align:center;color:#9ca3af;font-size:12px;">No items added</div>';

		me.$content.find("#qlReviewContent").html(`
			<!-- Header hero -->
			<div style="grid-column:1/-1;background:linear-gradient(135deg,#3b7ef8 0%,#2563eb 100%);border-radius:14px;padding:20px 24px;color:#fff;margin-bottom:4px;">
				<div style="font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;opacity:.7;margin-bottom:6px;">New Quotation</div>
				<div style="font-family:Syne,sans-serif;font-size:20px;font-weight:700;margin-bottom:10px;">${me.escapeAttr(subject !== "—" ? subject : customer)}</div>
				<div style="display:flex;gap:24px;flex-wrap:wrap;font-size:12px;opacity:.85;">
					<span><i class="ti ti-building-store" style="margin-right:4px;"></i>${me.escapeAttr(customer)}</span>
					${validTill !== "—" ? `<span><i class="ti ti-calendar-due" style="margin-right:4px;"></i>Valid till ${me.escapeAttr(validTill)}</span>` : ""}
					${salesperson !== "—" ? `<span><i class="ti ti-user-check" style="margin-right:4px;"></i>${me.escapeAttr(salesperson)}</span>` : ""}
				</div>
			</div>
			<!-- Quotation details card -->
			<div class="ql-review-card">
				<div class="ql-review-card-title">Quotation Details</div>
				${subject !== "—" ? `<div class="ql-review-row"><span>Subject</span><span>${me.escapeAttr(subject)}</span></div>` : ""}
				<div class="ql-review-row"><span>Customer</span><span>${me.escapeAttr(customer)}</span></div>
				${company !== "—" ? `<div class="ql-review-row"><span>Company</span><span>${me.escapeAttr(company)}</span></div>` : ""}
				${salesperson !== "—" ? `<div class="ql-review-row"><span>Salesperson</span><span>${me.escapeAttr(salesperson)}</span></div>` : ""}
				${validTill !== "—" ? `<div class="ql-review-row"><span>Valid Till</span><span>${me.escapeAttr(validTill)}</span></div>` : ""}
				${payTerms !== "—" ? `<div class="ql-review-row"><span>Payment Terms</span><span>${me.escapeAttr(payTerms)}</span></div>` : ""}
				${terms !== "—" ? `<div class="ql-review-row"><span>Terms &amp; Conditions</span><span>${me.escapeAttr(terms)}</span></div>` : ""}
				${taxes !== "—" ? `<div class="ql-review-row"><span>Taxes &amp; Charges</span><span>${me.escapeAttr(taxes)}</span></div>` : ""}
				${address !== "—" ? `<div class="ql-review-row"><span>Customer Address</span><span>${me.escapeAttr(address)}</span></div>` : ""}
				${shipAddress !== "—" ? `<div class="ql-review-row"><span>Shipping Address</span><span>${me.escapeAttr(shipAddress)}</span></div>` : ""}
				${compAddress !== "—" ? `<div class="ql-review-row"><span>Company Address</span><span>${me.escapeAttr(compAddress)}</span></div>` : ""}
				<div class="ql-review-row"><span>Attachments</span><span>${me.wizardFiles.length} file(s)</span></div>
			</div>
			<!-- Contacts card -->
			<div class="ql-review-card">
				<div class="ql-review-card-title">Contacts (${me.wizardContacts.length})</div>
				${contactsHTML}
			</div>
			<!-- Items full width -->
			<div style="grid-column:1/-1;" class="ql-review-card">
				<div class="ql-review-card-title">Items (${me.wizardItems.length})</div>
				<div style="overflow-x:auto;margin-top:8px;">${itemsHTML}</div>
			</div>`);
	}

	// ── Submit ──────────────────────────────────────────────
	async submitWizard() {
		const me = this;
		if (!me.validateWizardStep(1)) { me.goWizardStep(1); return; }

		const partyName = me.selectedCustomerDoc?.name || "";
		if (!partyName) { frappe.msgprint("Please select a Customer."); me.goWizardStep(1); return; }


		// fetch customer GST category
		let gstCategory = "Registered Regular";
		if (partyName) {
			try {
				const gc = await frappe.call({
					method: "frappe.client.get_value",
					args: { doctype: "Customer", filters: { name: partyName }, fieldname: "gst_category" },
				});
				if (gc.message && gc.message.gst_category) gstCategory = gc.message.gst_category;
			} catch (e) { }
		}

		// categories that should NOT charge GST
		const noTaxCategories = ["SEZ", "Overseas", "Deemed Export"];
		const skipTax = noTaxCategories.includes(gstCategory);

		const taxesTemplate = me.$content.find("#qlFTaxes").val().trim();

		// fetch tax rows only if NOT a no-tax category
		let taxRows = [];
		let finalTaxTemplate = "";
		if (!skipTax && taxesTemplate) {
			finalTaxTemplate = taxesTemplate;
			try {
				const tr = await frappe.call({
					method: "frappe.client.get",
					args: { doctype: "Sales Taxes and Charges Template", name: taxesTemplate },
				});
				taxRows = (tr.message && tr.message.taxes || []).map(t => ({
					charge_type: t.charge_type,
					account_head: t.account_head,
					description: t.description,
					rate: t.rate,
					cost_center: t.cost_center,
					included_in_print_rate: t.included_in_print_rate,
				}));
			} catch (e) { }
		}

		const contacts = (me.wizardContacts || []).filter(c => c && (c.name || c.docname));
		const pocIdx = Number.isFinite(me.wizardPocIndex) ? me.wizardPocIndex : 0;
		const primaryContact = contacts[pocIdx] || contacts.find(c => c.docname) || contacts[0] || null;

		// build contact_list rows (user_name = Contact docname, poc flag)
		const contactList = contacts.map((c, i) => ({
			user_name: c.docname || "",
			email_id: c.email || "",
			mobile_no: c.phone || "",
			designation: c.role || "",
			poc: (i === pocIdx) ? 1 : 0,
		}));

		const $sp = me.$content.find("#qlFSalesperson");
		const spDocname = ($sp.attr("data-docname") || "").trim() || ($sp.val() || "").trim();

		// sales team — from opportunity prefill, else from salesperson field
		let salesTeam = Array.isArray(me._quoteSalesTeam) ? me._quoteSalesTeam : [];
		if (!salesTeam.length) {
			const $sp = me.$content.find("#qlFSalesperson");
			const spDocname = ($sp.attr("data-docname") || "").trim() || ($sp.val() || "").trim();
			salesTeam = spDocname ? [{ sales_person: spDocname, allocated_percentage: 100 }] : [];
		}

		const validTill = me.$content.find("#qlFValidTill").val().trim();
		const subject = me.$content.find("#qlFSubject").val().trim();
		const payTerms = me.$content.find("#qlFPayTerms").val().trim();
		// ── Custom payment-terms combo → payment_schedule rows ──
		// ── Payment-terms validation ──
		const payCombo = me._payComboConfig()[me._payCombo];
		if (me._payCombo && !me._payPercentValid()) {
			const v = me._payTermValues();
			frappe.msgprint(`Payment term percentages must total 100%. Currently ${Math.round(v.adv + v.del + v.after)}%.`);
			me.goWizardStep(6);
			return;
		}
		if (me._payCombo && payCombo && payCombo.permission && !me._payApproved) {
			frappe.msgprint(`This payment term requires approval. Tick the approval confirmation in the Terms step before submitting.`);
			me.goWizardStep(6);
			return;
		}


		const matchCheck = me._checkItemsMatchOpportunity();
		if (!matchCheck.ok) {
			const lines = matchCheck.mismatches.map(m =>
				`• ${frappe.utils.escape_html(m.name)}: qty ${m.qty} (opp ${m.oQty}), rate ₹${m.rate} (opp ₹${m.oRate})`
			).join("<br>");
			frappe.msgprint({
				title: "Item Qty/Rate Mismatch",
				indicator: "red",
				message: `These items differ from the Opportunity. Qty and rate must match before creating the quotation:<br><br>${lines}`,
			});
			me.goWizardStep(4);   // Items step (Info→Contacts→Address→Items = step 4)
			return;
		}



		// let paymentSchedule = [];
		// if (me._payCombo && payCombo) {
		// 	const baseDate = new Date().toISOString().split("T")[0];
		// 	const grandForSchedule = (me.wizardItems || []).reduce((s, it) =>
		// 		s + Number(it.qty || 0) * Number(it.sp || 0) * (1 - (Number(it.discount || 0) / 100)), 0);
		// 	paymentSchedule = me._buildPayMilestones(payCombo, baseDate, grandForSchedule).map(m => ({
		// 		payment_term:    m.term,          // ← links to the Payment Term record (keeps rows)
		// 		description:     m.label,
		// 		due_date:        m.due_date,
		// 		invoice_portion: m.portion,
		// 		payment_amount:  m.amount,
		// 	}));
		// }

		let paymentSchedule = [];

		if (me._payCombo) {
			const baseDate = new Date().toISOString().split("T")[0];
			const grandForSchedule = (me.wizardItems || []).reduce((s, it) =>
				s + Number(it.qty || 0) * Number(it.sp || 0) * (1 - (Number(it.discount || 0) / 100)), 0);
			// ensure _payMilestones reflects the latest table state
			me.renderPaymentScheduleFromCombo();
			paymentSchedule = (me._payMilestones || []).map(m => ({
				description: m.label,
				due_date_based_on: "Day(s) after invoice date",
				credit_days: Number(m.credit_days || 0),
				due_date: frappe.datetime.add_days(baseDate, Number(m.credit_days || 0)),
				invoice_portion: m.portion,
				payment_amount: m.amount,
			}));
		}

		// Custom Payment Terms grid → two rows (percentage + days)
		let customPaymentTerms = [];
		if (me._payCombo) {
			const v = me._payTermValues();
			customPaymentTerms = [
				{ type: "Percentage", advance: String(v.adv), on_delivery: String(v.del), after_delivery: String(v.after) },
				{ type: "Days",       advance: String(v.advDays || 0), on_delivery: String(v.delDays || 0), after_delivery: String(v.afterDays || 0) },
			];
		}
		// Guard: payment-schedule due dates must be unique
		if (paymentSchedule.length > 1) {
			const seen = {};
			for (const row of paymentSchedule) {
				const d = String(row.due_date || "");
				if (seen[d]) {
					frappe.msgprint(`Two payment milestones fall on the same due date (${d}). Enter different days in the Payment Terms table so each milestone has its own date.`);
					me.goWizardStep(6);
					return;
				}
				seen[d] = true;
			}
		}


		const taxes = me.$content.find("#qlFTaxes").val().trim();
		const address = me.$content.find("#qlFAddress").val().trim();
		const shipAddr = me.$content.find("#qlFShipAddress").val().trim();
		const compAddr = me.$content.find("#qlFCompanyAddress").val().trim();
		const terms = me.$content.find("#qlFTerms").val().trim();


		// // ── Payment terms combo: approval gate + schedule rows ──
		// const payCombo = me._payComboConfig()[me._payCombo];
		// if (me._payCombo && payCombo && payCombo.permission && !me._payApproved) {
		// 	frappe.msgprint(`Payment term "Option ${me._payCombo}" requires approval. Please tick the approval confirmation in the Terms step before submitting.`);
		// 	me.goWizardStep(6);
		// 	return;
		// }
		// let paymentSchedule = [];
		// if (me._payCombo && payCombo) {
		// 	const baseDate = new Date().toISOString().split("T")[0];
		// 	const grandForSchedule = (me.wizardItems || []).reduce((s, it) =>
		// 		s + Number(it.qty || 0) * Number(it.sp || 0) * (1 - (Number(it.discount || 0) / 100)), 0);
		// 	paymentSchedule = me._buildPayMilestones(payCombo, baseDate, grandForSchedule).map(m => ({
		// 		description:     m.label,
		// 		due_date:        m.due_date,
		// 		invoice_portion: m.portion,
		// 		payment_amount:  m.amount,
		// 	}));
		// }



		const termsTemplate = me.$content.find("#qlFTerms").val().trim();



		// fetch terms text from the template
		let termsText = "";
		if (termsTemplate) {
			try {
				const tt = await frappe.call({
					method: "frappe.client.get",
					args: { doctype: "Terms and Conditions", name: termsTemplate },
				});
				termsText = (tt.message && (tt.message.terms || "")) || "";
			} catch (e) { }
		}






		const items = (me.wizardItems || []).map(it => ({
			item_code: it.code || "",
			item_name: it.name || "",
			description: it.description || it.name || "",
			qty: Number(it.qty || 0),
			uom: it.uom || "Nos",
			rate: Number(it.sp || 0) * (1 - (Number(it.discount || 0) / 100)),
			amount: Number(it.qty || 0) * Number(it.sp || 0) * (1 - (Number(it.discount || 0) / 100)),
			item_tax_template: "",          // ← don't take item's tax template
			item_tax_rate: "{}",        // ← clear item tax rate
			renewal_status: it.renewal_status || it.type || "new",   // ← type field (label "Type")
			renewal_status: ((it.renewal_status || it.type || "new").charAt(0).toUpperCase() + (it.renewal_status || it.type || "new").slice(1)),
			orc: it.orc ? 1 : 0,
			commission_type: it.commission_type || "",
			rate_value: Number(it.rate_value || 0),
			// spq_rate / bp if the Quotation Item has a buying-price field — add here
			prevdoc_doctype: "Opportunity",
			prevdoc_docname: me.fromOpportunity || "",   // ← source opportunity
			opportunity_item: it._oppItemName || "",       // ← source opp item row
			price_list_rate: Number(it.sp || 0),     // ← set price list rate to your rate
		}));

		const doc = {
			doctype: "Quotation",
			quotation_to: "Customer",
			party_name: partyName,
			customer_name: me.$content.find("#qlFCustomer").val(),
			subject: subject || me.$content.find("#qlFCustomer").val(),
			title: subject || me.$content.find("#qlFCustomer").val(),
			company: me.$content.find("#qlFCompany").val(),
			transaction_date: new Date().toISOString().split("T")[0],
			valid_till: validTill || "",

			payment_terms_template: "",
			payment_schedule: paymentSchedule,
			custom_payment_terms: customPaymentTerms,


			customer_address: address || "",
			shipping_address_name: shipAddr || "",
			company_address: compAddr || "",
			opportunity: me.fromOpportunity || "",
			contact_person: primaryContact?.docname || "",
			contact_email: primaryContact?.email || "",
			contact_list: contactList,
			sales_team: salesTeam,

			taxes: taxRows,           // ← actual tax rows
			tc_name: termsTemplate || "",
			terms: termsText,          // ← actual terms text
			gst_category: gstCategory,
			tax_category: skipTax ? "" : (me._quoteTaxCategory || ""),
			taxes_and_charges: finalTaxTemplate,      // empty for SEZ



			ignore_pricing_rule: 1,        // ← don't apply pricing rules


			items,
		};

		frappe.call({
			method: "frappe.client.insert",
			args: { doc },
			callback: (r) => {
				if (r.message) {
					me.hasFetched = false;
					frappe.show_alert({ message: "Quotation created!", indicator: "green" });
					frappe.set_route("quote-list", r.message.name);
				}
			},
		});
	}
}

// ═══════════════════════════════════════════════════════════
//  HTML TEMPLATES
// ═══════════════════════════════════════════════════════════
frappe.quote_list_page_template = {

	newForm: `
	<div class="ql-page">
		<div class="page-wrap">

			<ol class="breadcrumb" style="background:transparent;padding:0;margin-bottom:16px;">
				<li class="breadcrumb-item"><a href="javascript:void(0)">CRM</a></li>
				<li class="breadcrumb-item" style="padding-left:5px;"><a href="/app/quote-list" class="ql-back-btn">Quotations</a></li>
				<li class="breadcrumb-item" style="padding-left:5px;">New Quotation</li>
			</ol>

			<!-- Progress bar -->
			<div style="margin-bottom:20px;">
				<div style="height:4px;background:rgba(0,0,0,0.08);border-radius:2px;overflow:hidden;">
					<div id="qlProgressFill" style="height:100%;width:14.28%;background:#3b7ef8;border-radius:2px;transition:width 0.4s ease;"></div>
				</div>
			</div>

			<!-- Stepper -->
			<div style="display:flex;align-items:flex-start;margin-bottom:28px;">
				<div class="ql-step active" data-step="1" style="display:flex;flex-direction:column;align-items:center;flex:1;position:relative;cursor:pointer;">
					<div class="ql-step-circle">1</div>
					<div class="ql-step-label">Info</div>
				</div>
				<div class="ql-step" data-step="2" style="display:flex;flex-direction:column;align-items:center;flex:1;position:relative;cursor:pointer;">
					<div class="ql-step-circle">2</div>
					<div class="ql-step-label">Contacts</div>
				</div>
				<div class="ql-step" data-step="3" style="display:flex;flex-direction:column;align-items:center;flex:1;position:relative;cursor:pointer;">
					<div class="ql-step-circle">3</div>
					<div class="ql-step-label">Address</div>
				</div>
				<div class="ql-step" data-step="4" style="display:flex;flex-direction:column;align-items:center;flex:1;position:relative;cursor:pointer;">
					<div class="ql-step-circle">4</div>
					<div class="ql-step-label">Items</div>
				</div>
				<div class="ql-step" data-step="5" style="display:flex;flex-direction:column;align-items:center;flex:1;position:relative;cursor:pointer;">
					<div class="ql-step-circle">5</div>
					<div class="ql-step-label">Taxes</div>
				</div>
				<div class="ql-step" data-step="6" style="display:flex;flex-direction:column;align-items:center;flex:1;position:relative;cursor:pointer;">
					<div class="ql-step-circle">6</div>
					<div class="ql-step-label">Terms</div>
				</div>
				<div class="ql-step" data-step="7" style="display:flex;flex-direction:column;align-items:center;flex:1;position:relative;cursor:pointer;">
					<div class="ql-step-circle">7</div>
					<div class="ql-step-label">Summary</div>
				</div>
			</div>

			<!-- ══ STEP 1: INFO ══ -->
			<div class="ql-wiz-panel active" id="qlPanel1">
				<div class="card">
					<div class="card-title">Quotation Information</div>
					<div class="card-subtitle">Fill in the core details of this quotation.</div>

					<!-- Subject — full width -->
					<div class="ql-field" style="margin-bottom:20px;">
						<label class="ql-field-label">Subject <span class="ql-req">*</span></label>
						<input class="ql-field-input" id="qlFSubject" placeholder="e.g. Network Security Renewal – Q3 2025" style="font-size:15px;height:44px;letter-spacing:-.01em;">
					</div>

					<!-- Row: Customer | Company -->
					<div class="ql-wiz-grid" style="margin-bottom:16px;">
						<div class="ql-field">
							<label class="ql-field-label">Customer <span class="ql-req">*</span></label>
							<div class="ql-link-wrap">
								<input class="ql-field-input" id="qlFCustomer" placeholder="Search Customer…" autocomplete="off">
								<i class="ti ti-building-store ql-link-icon"></i>
								<div class="ql-link-dd" id="qlCustDD"></div>
							</div>
						</div>
						<div class="ql-field">
							<label class="ql-field-label">Company <span class="ql-req">*</span></label>
							<div class="ql-link-wrap">
								<input class="ql-field-input" id="qlFCompany" placeholder="Search Company…" autocomplete="off">
								<i class="ti ti-building ql-link-icon"></i>
								<div class="ql-link-dd" id="qlCompanyDD"></div>
							</div>
						</div>
					</div>

					<!-- Row: Valid Till -->
					<div class="ql-wiz-grid" style="margin-bottom:16px;">
						<div class="ql-field">
							<label class="ql-field-label">Valid Till</label>
							<input class="ql-field-input" id="qlFValidTill" type="date">
						</div>
						<div class="ql-field"></div>
					</div>

					<!-- Divider -->
					<div style="margin:4px 0 14px;height:1px;background:rgba(0,0,0,0.07);"></div>

					<!-- Salesperson -->
					<!--<div class="ql-field" style="margin-bottom:12px;">
						<label class="ql-field-label">Sales Person</label>
						<div class="ql-link-wrap">
							<input class="ql-field-input" id="qlFSalesperson" placeholder="Search Sales Person…" autocomplete="off">
							<i class="ti ti-user-check ql-link-icon"></i>
							<div class="ql-link-dd" id="qlSpDD"></div>
						</div>
					</div> -->

					<!-- Salesperson card -->
					<div id="qlSpCard" style="display:none;background:#fff;border:1px solid rgba(0,0,0,0.09);border-radius:14px;padding:14px 18px;align-items:center;gap:14px;box-shadow:0 1px 6px rgba(0,0,0,0.06);margin-bottom:4px;">
						<div id="qlSpCardAv" style="width:42px;height:42px;border-radius:50%;background:rgba(59,126,248,0.12);border:2px solid rgba(59,126,248,0.25);display:flex;align-items:center;justify-content:center;font-family:Syne,sans-serif;font-size:16px;font-weight:700;color:#3b7ef8;flex-shrink:0;">—</div>
						<div style="flex:1;min-width:0;">
							<div id="qlSpCardName" style="font-family:Syne,sans-serif;font-size:14px;font-weight:600;color:#111827;"></div>
							<div id="qlSpCardEmail" style="display:none;align-items:center;gap:6px;margin-top:4px;font-size:12px;color:#3b7ef8;"><i class="ti ti-mail" style="font-size:13px;color:#9ca3af;"></i><span></span></div>
							<div id="qlSpCardPhone" style="display:none;align-items:center;gap:6px;margin-top:3px;font-size:12px;color:#374151;"><i class="ti ti-device-mobile" style="font-size:13px;color:#9ca3af;"></i><span></span></div>
						</div>
						<button id="qlSpCardClear" style="width:24px;height:24px;border-radius:50%;border:1px solid rgba(0,0,0,0.08);background:transparent;color:#9ca3af;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0;" title="Clear"><i class="ti ti-x"></i></button>
					</div>

					<input type="hidden" id="qlFSpName">
					<input type="hidden" id="qlFSpEmail">
					<input type="hidden" id="qlFSpPhone">
				</div>
				<div class="ql-wiz-footer">
					<button class="btn ql-back-btn" type="button"><i class="ti ti-arrow-left"></i> Cancel</button>
					<button class="btn btn-primary" data-wiz-next="2" type="button">Next: Contacts <i class="ti ti-arrow-right"></i></button>
				</div>
			</div>

			<!-- ══ STEP 2: CONTACTS ══ -->
			<div class="ql-wiz-panel" id="qlPanel2">
				<div class="card">
					<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
						<div>
							<div class="card-title" id="qlContactsHeading" style="margin-bottom:0;">Customer Contacts</div>
							<div class="card-subtitle" style="margin-top:2px;margin-bottom:0;">Add contacts linked to the selected customer.</div>
						</div>
						<button class="btn btn-primary" id="qlAddContactBtn" type="button" style="white-space:nowrap;flex-shrink:0;"><i class="ti ti-user-plus"></i> Add Contact</button>
					</div>
					<div id="qlNoContactsMsg" style="display:none;background:rgba(217,119,6,0.07);border:1px solid rgba(217,119,6,0.18);border-radius:8px;padding:10px 14px;font-size:12px;color:#d97706;margin:12px 0 0;">
						<i class="ti ti-alert-triangle" style="margin-right:5px;"></i>No linked contacts found for this customer.
					</div>
					<div id="qlContactCardsWrap" style="display:flex;flex-direction:column;gap:10px;margin-top:16px;"></div>
				</div>
				<div class="ql-wiz-footer">
					<button class="btn" data-wiz-back="1" type="button"><i class="ti ti-arrow-left"></i> Back</button>
					<button class="btn btn-primary" data-wiz-next="3" type="button">Next: Address <i class="ti ti-arrow-right"></i></button>
				</div>
			</div>

			<!-- ══ STEP 3: ADDRESS ══ -->
			<div class="ql-wiz-panel" id="qlPanel3">
    <div class="card">
        <div class="card-title">Address</div>
        <div class="card-subtitle">Billing, shipping &amp; company addresses auto-fill from the customer / opportunity. Use <strong>Add</strong> or <strong>Change</strong> to pick another.</div>

        <input type="hidden" id="qlFAddress">
        <input type="hidden" id="qlFShipAddress">
        <input type="hidden" id="qlFCompanyAddress">

        <div style="margin-top:8px;">
            <label class="ql-field-label" style="display:block;margin-bottom:8px;">Billing Address</label>
            <div id="qlAddrCard"></div>
        </div>
        <div style="margin-top:16px;">
            <label class="ql-field-label" style="display:block;margin-bottom:8px;">Shipping Address</label>
            <div id="qlShipAddrCard"></div>
        </div>
        <div style="margin-top:16px;">
            <label class="ql-field-label" style="display:block;margin-bottom:8px;">Company Address</label>
            <div id="qlCompanyAddrCard"></div>
        </div>
    </div>
    <div class="ql-wiz-footer">
        <button class="btn" data-wiz-back="2" type="button"><i class="ti ti-arrow-left"></i> Back</button>
        <button class="btn btn-primary" data-wiz-next="4" type="button">Next: Items <i class="ti ti-arrow-right"></i></button>
    </div>
</div>

			<!-- ══ STEP 4: ITEMS ══ -->
			<div class="ql-wiz-panel" id="qlPanel4">
				<div class="card">
					<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
						<div>
							<div class="card-title" style="margin-bottom:0;">Quotation Items</div>
							<div class="card-subtitle" style="margin-top:2px;margin-bottom:0;">Add products from your ERPNext item catalogue.</div>
						</div>
						<div style="position:relative;" id="qlAddItemWrap">
							<button class="btn btn-primary" id="qlAddItemBtn" type="button">
								<i class="ti ti-plus"></i> Add Item <i class="ti ti-chevron-down" style="font-size:11px;margin-left:2px;"></i>
							</button>
							<div id="qlAddItemMenu" style="display:none;position:absolute;top:calc(100% + 6px);right:0;min-width:240px;z-index:500;background:#fff;border:1px solid rgba(0,0,0,0.1);border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,0.12);overflow:hidden;">
								<div class="ql-aim-item" data-item-popup="new">
									<div class="ql-aim-icon" style="background:rgba(59,126,248,0.1);color:#3b7ef8;"><i class="ti ti-box"></i></div>
									<div><div class="ql-aim-label">New Item</div><div class="ql-aim-sub">From ERPNext catalogue</div></div>
								</div>
								<div style="height:1px;background:rgba(0,0,0,0.06);"></div>
								<div class="ql-aim-item" data-item-popup="renewal">
									<div class="ql-aim-icon" style="background:rgba(22,163,74,0.1);color:#16a34a;"><i class="ti ti-refresh"></i></div>
									<div><div class="ql-aim-label">Renewal Item</div><div class="ql-aim-sub">From customer renewals</div></div>
								</div>
								<div class="ql-aim-item" data-item-popup="additional">
									<div class="ql-aim-icon" style="background:rgba(217,119,6,0.12);color:#d97706;"><i class="ti ti-stack-2"></i></div>
									<div><div class="ql-aim-label">Additional Item</div><div class="ql-aim-sub">Add-on to existing</div></div>
								</div>
							</div>
						</div>
					</div>

					 <div style="border:1px solid rgba(0,0,0,0.08);border-radius:10px;overflow:hidden;background:#f8fafc;">
						<div id="qlItemsTbody" style="max-height:460px;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:10px;">
							<div style="text-align:center;padding:36px;color:#9ca3af;font-size:12px;">
								<i class="ti ti-inbox" style="font-size:28px;display:block;margin-bottom:8px;"></i>
								No items added yet. Click <strong>+ Add Item</strong> to get started.
							</div>
						</div>
					</div>

					<div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px;padding-top:12px;border-top:1px solid rgba(0,0,0,0.08);">
						<div style="display:flex;align-items:center;gap:16px;">
							<span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;">Total Qty</span>
							<span id="qlSumQtyLabel" style="font-family:Syne,sans-serif;font-size:20px;font-weight:700;color:#111827;">0</span>
						</div>
						<div style="text-align:right;">
							<div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;margin-bottom:4px;">Grand Total</div>
							<div id="qlSumGrand" style="font-family:Syne,sans-serif;font-size:22px;font-weight:700;color:#3b7ef8;">₹ 0.00</div>
						</div>
					</div>
				</div>

				<!-- Attachments -->
				<div class="card">
					<div class="card-title">Attachments</div>
					<div class="card-subtitle">Upload supporting files, PO copy, etc.</div>
					<label style="border:2px dashed rgba(0,0,0,0.14);border-radius:14px;padding:28px;display:flex;flex-direction:column;align-items:center;gap:8px;cursor:pointer;background:#f7f8fa;text-align:center;" id="qlUploadZone">
						<i class="ti ti-cloud-upload" style="font-size:32px;color:#9ca3af;"></i>
						<p style="font-size:13px;color:#6b7280;font-weight:500;margin:0;">Click to upload or drag & drop</p>
						<span style="font-size:11px;color:#9ca3af;">PDF, DOCX, XLSX, PNG up to 10MB</span>
						<input type="file" id="qlFileInput" style="display:none;" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg">
					</label>
					<div id="qlAttPreview" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px;"></div>
				</div>

				<div class="ql-wiz-footer">
					<button class="btn" data-wiz-back="3" type="button"><i class="ti ti-arrow-left"></i> Back</button>
					<button class="btn btn-primary" data-wiz-next="5" type="button">Next: Taxes <i class="ti ti-arrow-right"></i></button>
				</div>
			</div>

			<!-- ══ STEP 5: TAXES ══ -->
			<div class="ql-wiz-panel" id="qlPanel5">
			
				
				<div class="card">
	<div class="card-title">Taxes &amp; Charges</div>
	<div class="card-subtitle">Tax category auto-fills from the customer. The template determines GST rates.</div>

	<!-- Two columns: Tax Category | Taxes & Charges Template -->
	<div class="ql-wiz-grid" style="margin-top:8px;">
		<div class="ql-field">
			<label class="ql-field-label">Tax Category</label>
			<input class="ql-field-input" id="qlFTaxCategory" placeholder="Auto-filled from customer" readonly style="background:#f8fafc;color:#6b7280;">
		</div>
		<div class="ql-field">
			<label class="ql-field-label">Taxes &amp; Charges Template</label>
			<div class="ql-link-wrap">
				<input class="ql-field-input" id="qlFTaxes" placeholder="Search Tax Template…" autocomplete="off">
				<i class="ti ti-percentage ql-link-icon"></i>
				<div class="ql-link-dd" id="qlTaxesDD"></div>
			</div>
		</div>
	</div>

	<!-- Tax breakdown table (shows when a template is picked) -->
	<div id="qlTaxBreakdown" style="margin-top:18px;display:none;"></div>
</div>
				<div class="ql-wiz-footer">
					<button class="btn" data-wiz-back="4" type="button"><i class="ti ti-arrow-left"></i> Back</button>
					<button class="btn btn-primary" data-wiz-next="6" type="button">Next: Terms <i class="ti ti-arrow-right"></i></button>
				</div>
			</div>

			<!-- ══ STEP 6: TERMS ══ -->
			<div class="ql-wiz-panel" id="qlPanel6">
				<div class="card">
					<div class="card-title">Payment &amp; Terms</div>
					<div class="card-subtitle">Set payment terms and attach the terms &amp; conditions.</div>

					<div style="margin-top:8px;margin-bottom:16px;">
						<label class="ql-field-label" style="display:block;margin-bottom:10px;">Payment Terms</label>
						<input type="hidden" id="qlFPayTerms">
						<select id="qlPayComboSelect" class="ql-field-input" style="max-width:420px;height:42px;">
							<option value="">Select payment terms…</option>
						</select>

						<div id="qlPayAfterDaysWrap" style="display:none;margin-top:16px;">
							<label class="ql-field-label" style="display:block;margin-bottom:6px;">After Delivery — Credit Days</label>
							<select id="qlPayAfterDays" class="ql-field-input" style="max-width:220px;height:40px;">
								<option value="0">0 days</option>
								<option value="15">15 days</option>
								<option value="30">30 days</option>
								<option value="45">45 days</option>
								<option value="60">60 days</option>
							</select>
						</div>

						<div id="qlPayApprovalWrap" style="display:none;margin-top:16px;background:rgba(217,119,6,0.06);border:1px solid rgba(217,119,6,0.25);border-radius:10px;padding:12px 14px;">
							<div style="display:flex;align-items:flex-start;gap:8px;">
								<i class="ti ti-alert-triangle" style="color:#d97706;font-size:16px;margin-top:1px;"></i>
								<div style="flex:1;">
									<div style="font-size:12px;font-weight:600;color:#92400e;">This payment term requires approval</div>
									<div style="font-size:11px;color:#b45309;margin-top:2px;">You cannot submit until approval is confirmed.</div>
									<label style="display:inline-flex;align-items:center;gap:6px;margin-top:8px;cursor:pointer;">
										<input type="checkbox" id="qlPayApprovedChk" style="accent-color:#d97706;width:14px;height:14px;cursor:pointer;">
										<span style="font-size:12px;font-weight:600;color:#92400e;">I have obtained approval for this payment term</span>
									</label>
								</div>
							</div>
						</div>

						<div id="qlPayTermsTable" style="display:none;margin-top:16px;"></div>
						<div id="qlPaymentSchedule" style="display:none;"></div>
					</div>

					<div class="ql-field">
						<label class="ql-field-label">Terms &amp; Conditions</label>
						<div class="ql-link-wrap">
							<input class="ql-field-input" id="qlFTerms" placeholder="Search Terms &amp; Conditions…" autocomplete="off">
							<i class="ti ti-file-text ql-link-icon"></i>
							<div class="ql-link-dd" id="qlTermsDD"></div>
						</div>
						<div id="qlTermsContent" style="display:none;"></div>
					</div>
				</div>
				<div class="ql-wiz-footer">
					<button class="btn" data-wiz-back="5" type="button"><i class="ti ti-arrow-left"></i> Back</button>
					<button class="btn btn-primary" data-wiz-next="7" type="button">Review & Submit <i class="ti ti-arrow-right"></i></button>
				</div>
			</div>

			<!-- ══ STEP 7: SUMMARY ══ -->
			<div class="ql-wiz-panel" id="qlPanel7">
				<div class="card">
					<div class="card-title">Review & Submit</div>
					<div class="card-subtitle">Review all details before submitting.</div>
					<div id="qlReviewContent" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:8px;"></div>
				</div>
				<div class="ql-wiz-footer">
					<button class="btn" data-wiz-back="6" type="button"><i class="ti ti-arrow-left"></i> Back</button>
					<div style="display:flex;gap:8px;">
						<!-- <button class="btn" id="qlSaveDraft" type="button"><i class="ti ti-device-floppy"></i> Save Draft</button> -->
						<button class="btn btn-primary" id="qlSubmitForm" type="button" style="background:#16a34a;border-color:transparent;"><i class="ti ti-send"></i> Save Quotation</button>
					</div>
				</div>
			</div>

		</div>
	</div>`,

	detail: `
	<div class="ql-page">
		<div class="page-wrap">

			<!-- Breadcrumb -->
			<div class="doctype-band" style="position:sticky;top:0;z-index:50;width:100%;display:flex;align-items:center;gap:14px;padding:16px 22px;margin-bottom:16px;border-radius:12px;background:linear-gradient(135deg,#16a34a 0%,#15803d 100%);box-shadow:0 4px 14px rgba(22,163,74,0.25);">
				<div style="width:44px;height:44px;border-radius:11px;background:rgba(255,255,255,0.18);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
					<i class="ti ti-file-invoice" style="font-size:22px;color:#fff;"></i>
				</div>
				<div style="flex:1;min-width:0;">
					<div style="font-family:Syne,sans-serif;font-size:18px;font-weight:700;color:#fff;letter-spacing:-.01em;">Quotation</div>
					<ol class="breadcrumb" style="background:transparent;padding:0;margin:2px 0 0;display:flex;align-items:center;">
						<li class="breadcrumb-item"><a href="javascript:void(0)" style="color:rgba(255,255,255,0.75);font-size:12px;">CRM</a></li>
						<li class="breadcrumb-item" style="padding-left:5px;"><a href="/app/quote-list" class="ql-back-btn" style="color:rgba(255,255,255,0.75);font-size:12px;">Quotations</a></li>
						<li class="breadcrumb-item active" style="padding-left:5px;font-size:12px;color:#fff;font-weight:600;" id="qlBreadcrumbId">—</li>
					</ol>
				</div>
			</div>

			<!-- Top split: left info + right actions -->
			<div class="top-split">

				<!-- LEFT -->
				<div class="top-left1">
					<div class="subject-label" id="qlSubjectLabel" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:420px;cursor:default;">—</div>
					<div class="top-left-row1">
						<div class="customer-avatar">--</div>
						<div class="customer-info">
							<div class="customer-name">—</div>
							<div class="customer-sub">Owner · —</div>
						</div>
						<span class="badge badge-warning" id="statusBadge"><i class="ti ti-circle-dot"></i> Draft</span>
					</div>

					<!-- Financial summary -->
					<div class="fin-grid">
						<div class="fin-card">
							<div class="fin-label">Net Total</div>
							<div class="fin-value" id="qlNetTotal"><span class="currency">₹</span>0.00</div>
						</div>
						<div class="fin-card">
							<div class="fin-label">Taxes</div>
							<div class="fin-value" id="qlTaxTotal">₹0.00</div>
						</div>
						<div class="fin-card">
							<div class="fin-label">Grand Total</div>
							<div class="fin-value profit" id="qlGrandTotal">₹0.00</div>
						</div>
					</div>
				</div>

				<!-- RIGHT -->
				<div class="top-right1">
					<div class="top-actions-row">
					
						<div class="header-title">Quotation Detail</div>
						<button class="btn btn-primary" id="qlBtnSubmit" type="button" title="Submit Quotation" style="background:#16a34a;border-color:transparent;">
							<i class="ti ti-send"></i> Submit
						</button>
						<div id="qlConnectionsWrap" style="position:relative;display:inline-block;">
	<button class="btn" id="qlBtnConnections" type="button" title="Connections">
		<i class="ti ti-link"></i> Connections <i class="ti ti-chevron-down" style="font-size:11px;"></i>
	</button>
</div>
						<button class="btn" id="qlBtnPdf" type="button" title="Download PDF">
	<i class="ti ti-file-type-pdf"></i> PDF
</button>
						<div class="vdivider"></div>
						<button class="btn btn-primary" id="qlBtnCreate" type="button">
	<i class="ti ti-plus"></i> Create COF
</button>
						<!--<button class="btn ql-back-btn" type="button"><i class="ti ti-arrow-left"></i> Back</button>-->
					</div> 

					<!-- Meta: inline label+value pairs, 2 per row -->
					<div style="display:flex;flex-direction:column;gap:0;">

						<!-- Row 1: Opportunity ID | Salesperson -->
						<div style="display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid rgba(0,0,0,0.06);">
							<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-right:1px solid rgba(0,0,0,0.06);">
								<span class="ql-mi-label"><i class="ti ti-link"></i> Opportunity ID</span>
								<span class="ql-mi-val" id="qlMetaOpp">—</span>
							</div>
							<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;">
								<span class="ql-mi-label"><i class="ti ti-user-check"></i> Salesperson</span>
								<span class="ql-mi-val" id="qlMetaSalesperson">—</span>
							</div>
						</div>

						<!-- Row 2: Date | Valid Till -->
						<div style="display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid rgba(0,0,0,0.06);">
							<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-right:1px solid rgba(0,0,0,0.06);">
								<span class="ql-mi-label"><i class="ti ti-calendar"></i> Date</span>
								<span class="ql-mi-val" id="qlMetaTxnDate">—</span>
							</div>
							<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;">
								<span class="ql-mi-label"><i class="ti ti-calendar-due"></i> Valid Till</span>
								<span class="ql-mi-val" id="qlMetaValidTill">—</span>
							</div>
						</div>

						<!-- Row 3: Company full width -->
						<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;">
							<span class="ql-mi-label"><i class="ti ti-building"></i> Company</span>
							<div style="position:relative;display:flex;align-items:center;gap:6px;justify-content:flex-start;flex:1;min-width:0;">
								<a id="qlCompanyOpen" href="#" target="_blank" style="display:none;order:2;flex-shrink:0;color:#3b7ef8;text-decoration:none;align-items:center;justify-content:center;" title="Open Company"><i class="ti ti-external-link" style="font-size:14px;"></i></a>
								<input id="qlMetaCompanyInput" class="ql-meta-input" placeholder="Search company…" autocomplete="off" style="width:100%;max-width:calc(100% - 26px);border:none;border-bottom:1px dashed transparent;background:transparent;outline:none;font-size:14px;font-weight:500;text-align:right;color:#111827;line-height:1.3;transition:border-color .15s;cursor:default;white-space:normal;word-break:break-word;" onfocus="this.style.borderColor='#3b7ef8';this.style.cursor='text';" onblur="this.style.borderColor='transparent';this.style.cursor='default';">
								<div id="qlMetaCompanyDD" style="display:none;position:absolute;top:calc(100% + 4px);left:0;width:240px;max-height:200px;overflow-y:auto;background:#fff;border:1px solid rgba(0,0,0,0.1);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.1);z-index:200;"></div>
							</div>
						</div>

					</div>
				</div>
			</div>

			<!-- CONTACTS -->
			<div class="card">
				<div class="section-head">
					<div class="section-title">Contacts <span id="qlContactCount" style="color:#cbd5e1;font-weight:600;">0</span></div>
					<button class="btn btn-primary" id="qlAddContactDetailBtn" type="button" style="white-space:nowrap;"><i class="ti ti-user-plus"></i> Add Contact</button>
				</div>
				<div id="qlDetailContactsList" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;margin-top:6px;"></div>
			</div>

			<!-- ADDRESS -->
			<div class="card">
				<div class="section-head">
					<div class="section-title">Address</div>
				</div>
				<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:6px;">
					<div>
						<label class="ql-field-label" style="display:block;margin-bottom:8px;">Billing Address</label>
						<div id="qlDetailBillingCard"></div>
					</div>
					<div>
						<label class="ql-field-label" style="display:block;margin-bottom:8px;">Shipping Address</label>
						<div id="qlDetailShippingCard"></div>
					</div>
					<div style="grid-column:1/-1;">
						<label class="ql-field-label" style="display:block;margin-bottom:8px;">Company Address</label>
						<div id="qlDetailCompanyCard"></div>
					</div>
				</div>
			</div>

			<!-- ITEMS TABLE -->
			<div class="card">
				<div class="section-head">
					<div class="section-title">Items</div>
					<div style="font-size:12px;color:#6b7280;">
						Discount: <span id="qlDiscount" style="font-weight:600;color:#d97706;">—</span>
					</div>
				</div>

				<div style="border:1px solid rgba(0,0,0,0.08);border-radius:10px;overflow:hidden;background:#f8fafc;">
				
            <div id="qlItemsTableBody" style="max-height:460px;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:10px;">
                <div style="text-align:center;padding:32px;color:#9ca3af;font-size:12px;">Loading...</div>
            </div>
        </div>
		<div id="qlItemsSaveBar" style="display:none;margin-top:12px;padding:10px 14px;background:rgba(59,126,248,0.08);border:1px solid rgba(59,126,248,0.25);border-radius:8px;align-items:center;justify-content:space-between;">
	<span style="font-size:12px;color:#3b7ef8;font-weight:600;">You have unsaved changes</span>
	<button class="btn btn-primary" id="qlSaveItemsBtn" type="button"><i class="ti ti-device-floppy"></i> Save Items</button>
</div>

				<!--<div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;padding-top:10px;border-top:1px solid rgba(0,0,0,0.08);">
					<div style="display:flex;align-items:center;gap:12px;">
						<span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;">Total Qty</span>
						<span id="qlItemsTotalQty" style="font-family:'Syne',sans-serif;font-size:18px;font-weight:700;color:#111827;">0</span>
					</div>
					<div style="text-align:right;">
						<div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;margin-bottom:3px;">Total Amount</div>
						<div id="qlItemsTotalAmt" style="font-family:'Syne',sans-serif;font-size:20px;font-weight:700;color:#3b7ef8;">₹0.00</div>
					</div>
				</div> -->
				<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-top:14px;padding-top:12px;border-top:1px solid rgba(0,0,0,0.08);">
            <div style="display:flex;align-items:center;gap:12px;">
                <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;">Total Qty</span>
                <span id="qlItemsTotalQty" style="font-family:'Syne',sans-serif;font-size:18px;font-weight:700;color:#111827;">0</span>
            </div>
            <div style="min-width:260px;">
                <div style="display:flex;justify-content:space-between;padding:5px 0;font-size:12px;">
                    <span style="color:#6b7280;">Subtotal</span>
                    <span id="qlSumSubtotal" style="font-weight:600;color:#111827;">₹0.00</span>
                </div>
                <div style="display:flex;justify-content:space-between;padding:5px 0;font-size:12px;">
                    <span style="color:#6b7280;">Total Tax</span>
                    <span id="qlSumTax" style="font-weight:600;color:#111827;">₹0.00</span>
                </div>
                <div style="display:flex;justify-content:space-between;padding:8px 0 0;margin-top:5px;border-top:1px solid rgba(0,0,0,0.08);font-size:13px;">
                    <span style="font-weight:700;color:#111827;">Grand Total</span>
                    <span id="qlSumGrandTotal" style="font-family:'Syne',sans-serif;font-size:18px;font-weight:700;color:#3b7ef8;">₹0.00</span>
                </div>
            </div>
        </div>
			</div>

			<!-- Payment Card -->

			<div class="card">
            <div class="section-head">
                <div class="section-title">Payment Terms</div>
                <div id="qlPayTermsName" style="font-size:12px;color:#6b7280;"></div>
            </div>
            <div id="qlPaymentScheduleBody"></div>
        </div>

			<!-- ACTIVITY -->
			<div class="card">
				<div style="display:flex;align-items:center;gap:0;border-bottom:2px solid rgba(0,0,0,0.07);padding:0 16px;margin:0 -16px 0;">
					<div class="act-tab active" data-tab="activity"
					style="font-size:14px;font-weight:700;padding:12px 16px 12px 0;white-space:nowrap;flex-shrink:0;cursor:pointer;border-right:1px solid rgba(0,0,0,0.08);margin-right:4px;margin-bottom:-2px;transition:all .15s;">
					Activity
				</div>
					<div id="actTabs" style="display:flex;gap:0;overflow-x:auto;scrollbar-width:none;flex:1;">
					<div class="act-tab" data-tab="notes" style="padding:12px 14px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;margin-bottom:-2px;transition:all .15s;flex-shrink:0;">Notes</div>
					<div class="act-tab" data-tab="calls" style="padding:12px 14px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;margin-bottom:-2px;transition:all .15s;flex-shrink:0;">Calls</div>
					<div class="act-tab" data-tab="appointments" style="padding:12px 14px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;margin-bottom:-2px;transition:all .15s;flex-shrink:0;">Appointments</div>
					<div class="act-tab" data-tab="comments" style="padding:12px 14px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;margin-bottom:-2px;transition:all .15s;flex-shrink:0;">Comments</div>
					<div class="act-tab" data-tab="tasks" style="padding:12px 14px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;margin-bottom:-2px;transition:all .15s;flex-shrink:0;">Tasks</div>
					<div class="act-tab" data-tab="attachments" style="padding:12px 14px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;margin-bottom:-2px;transition:all .15s;flex-shrink:0;">Attachments</div>
				</div>
				</div>

				<div id="actFilter"
				style="display:flex;gap:6px;padding:8px 16px;
					border-bottom:1px solid rgba(0,0,0,0.05);">
				<div class="act-filter active" data-filter="scheduled"
					style="padding:3px 12px;font-size:11px;font-weight:600;border-radius:20px;
						background:rgba(59,126,248,0.1);color:#3b7ef8;cursor:pointer;
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

				<div id="activityList"><div style="padding:20px;text-align:center;color:#9ca3af;font-size:12px;">No activities yet</div></div>

				<!-- Attachments panel -->
				<div id="attachmentsPanel" class="attachments-panel hidden">
					<div style="padding:12px 16px;border-bottom:1px solid rgba(0,0,0,0.06);">
						<div class="act-field" style="margin-bottom:10px;">
							<label class="act-field-label">Description</label>
							<input id="qlAttDescription" type="text" class="act-input" placeholder="e.g. Purchase Order, Product Brochure">
						</div>
						<div id="qlAttUploadZone" style="border:2px dashed rgba(0,0,0,0.12);border-radius:10px;padding:20px;text-align:center;cursor:pointer;transition:all .15s;background:#fafafa;" onmouseenter="this.style.borderColor='#3b7ef8';this.style.background='rgba(59,126,248,0.03)';" onmouseleave="this.style.borderColor='rgba(0,0,0,0.12)';this.style.background='#fafafa';">
							<i class="ti ti-cloud-upload" style="font-size:26px;color:#9ca3af;display:block;margin-bottom:5px;"></i>
							<div style="font-size:13px;font-weight:600;color:#374151;">Click to upload</div>
							<div style="font-size:11px;color:#9ca3af;margin-top:2px;">PDF, DOCX, XLSX, PNG, JPG</div>
						</div>
					</div>
					<div id="qlAttFileList" style="padding:8px 16px 12px;display:flex;flex-direction:column;gap:6px;"></div>
				</div>

				<div id="actBottom" class="act-bottom"></div>

				<!-- Notes input -->
				<div id="inputNotes" class="act-input-area hidden">
					<textarea id="noteText" class="act-textarea" placeholder="Write a note…"></textarea>
					<div class="act-input-actions">
						<button class="btn btn-primary" type="button" data-action="save-note"><i class="ti ti-check"></i> Save Note</button>
						<button class="btn" type="button" data-close-tab="notes">Cancel</button>
					</div>
				</div>

				<!-- Calls input -->
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
						<select class="ol-field-input act-input" id="callStatus">
							<option value="Scheduled">Scheduled</option>
							<option value="Held">Held</option>
							<option value="Not Responding">Not Responding</option>
							<option value="Cancelled">Cancelled</option>
						</select>
					</div>

					<div class="ol-field" style="margin-top:10px;">
						<label class="ol-field-label">Description</label>
						<textarea class="ol-field-input act-input" id="callDescription" rows="3" placeholder="Call notes / summary…" style="resize:vertical;"></textarea>
					</div>

					<!-- Auto-filled info (read-only display) -->
					<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:4px;margin-top:12px;">
						<div class="act-field">
							<label class="act-field-label">Related To (Customer)</label>
							<input id="callRelatedTo" type="text" class="act-input"
								readonly style="background:#f8fafc;color:#6b7280;cursor:default;">
						</div>
						<div class="act-field">
							<label class="act-field-label">Sales Team</label>
							<input id="callSalesTeam" type="text" class="act-input"
								readonly style="background:#f8fafc;color:#6b7280;cursor:default;">
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

				<!-- Appointments input -->
				<div id="inputAppointments" class="act-input-area hidden">
					<div style="padding:14px 16px;border-bottom:1px solid rgba(0,0,0,0.06);">
						<div class="act-field" style="margin-bottom:12px;">
							<label class="act-field-label">Subject <span style="color:#dc2626;">*</span></label>
							<input id="apptSubject" type="text" class="act-input" placeholder="e.g. Product demo, Renewal discussion">
						</div>
						<div class="act-field" style="margin-bottom:12px;">
							<label class="act-field-label">Scheduled Time <span style="color:#dc2626;">*</span></label>
							<input id="apptScheduledTime" type="datetime-local" class="act-input">
						</div>
						<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
							<div class="act-field">
								<label class="act-field-label">Customer</label>
								<input id="apptCustomerName" type="text" class="act-input" readonly style="background:#f8fafc;color:#6b7280;cursor:default;">
							</div>
							<div class="act-field">
								<label class="act-field-label">Phone</label>
								<input id="apptCustomerPhone" type="text" class="act-input" placeholder="Phone number">
							</div>
							<div class="act-field" style="grid-column:1/-1;">
								<label class="act-field-label">Email</label>
								<input id="apptCustomerEmail" type="email" class="act-input" placeholder="customer@email.com">
							</div>
							<div class="ql-field" style="grid-column:1/-1;margin-top:2px;">
								<label class="ql-field-label">Participants</label>
								<div id="apptPartWrap" style="position:relative;">
									<div id="apptPartChips" style="margin-bottom:8px;display:flex;flex-wrap:wrap;"></div>
									<div id="apptPartTrigger" style="border:1px solid rgba(0,0,0,0.12);border-radius:8px;padding:8px 12px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;background:#fff;">
										<span id="apptPartLabel" style="font-size:12px;color:#9ca3af;">Search & select participants…</span>
										<i class="ti ti-chevron-down" style="font-size:13px;color:#9ca3af;"></i>
									</div>
									<div id="apptPartMenu" style="display:none;position:absolute;top:calc(100% + 4px);left:0;right:0;max-height:220px;overflow-y:auto;background:#fff;border:1px solid rgba(0,0,0,0.1);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.12);z-index:600;padding:6px;"></div>
								</div>
							</div>
							<div class="ql-field" style="grid-column:1/-1;margin-top:2px;">
								<label class="ql-field-label">Details</label>
								<textarea class="ql-field-input act-input" id="apptDetails" rows="3" placeholder="Appointment details / agenda…" style="resize:vertical;"></textarea>
							</div>
						</div>
					</div>
					<div class="act-input-actions">
						<button class="btn btn-primary" type="button" data-action="save-appointment"><i class="ti ti-check"></i> Schedule</button>
						<button class="btn" type="button" data-close-tab="appointments">Cancel</button>
					</div>
				</div>

				<!-- Comments input -->
				<div id="inputComments" class="act-input-area hidden">
					<div class="rel-wrap">
						<textarea id="commentText" class="act-textarea" placeholder="Write a comment…"></textarea>
						<div id="mentionDropdown" class="mention-dropdown hidden">
							<div class="mention-item" data-mention="You">
								<div class="mention-avatar">YO</div>
								<div><div class="mention-name">You</div><div class="mention-role">Current User</div></div>
							</div>
						</div>
					</div>
					<div class="act-input-actions">
						<button class="btn btn-primary" type="button" data-action="save-comment"><i class="ti ti-check"></i> Post Comment</button>
						<button class="btn" type="button" data-close-tab="comments">Cancel</button>
					</div>
				</div>
			</div>

		</div>
	</div>`,
};