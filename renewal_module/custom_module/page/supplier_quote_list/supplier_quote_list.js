// ═══════════════════════════════════════════════════════════
//  Supplier Quotation — Desk Page  (Part 1: Scaffold + List View)
//  Mirrors quote_list.js architecture for STANDARD Supplier
//  Quotation fields. Detail (Part 2) and New Form (Part 3) are
//  stubbed below and get replaced in later parts — no constructor
//  changes required.
// ═══════════════════════════════════════════════════════════

frappe.pages['supplier-quote-list'].on_page_load = function (wrapper) {
	new SupplierQuoteListPage(wrapper);
};

frappe.pages['supplier-quote-list'].on_page_show = function (wrapper) {

	// Global: remove orphaned filter popovers on any route change
	if (!frappe._sqFilterPopoverCleanup) {
		frappe._sqFilterPopoverCleanup = true;
		const sweep = () => {
			$("body > .popover.filter-popover, body > .popover.show").remove();
			try { $("#sqOpenFilters, #qlOpenFilters, #olOpenFilters").popover("dispose"); } catch (e) {}
		};
		if (frappe.router && frappe.router.on) frappe.router.on("change", sweep);
		$(window).on("popstate.filterSweep", sweep);
	}

	const pageWrapper = wrapper || $(".page")[0] || document.body;
	$("body").attr("data-route", "supplier-quote-list");
	ensureSupplierQuoteListAssets();

	const ensureSupportLayoutLoaded = (cb) => {
		if (typeof loadSupportLayout === "function") return cb();
		frappe.require(["/assets/renewal_module/js/issue_themes/support_layout2.js"], () => {
			setTimeout(cb, 10);
		});
		frappe.require(["/assets/renewal_module/css/issue_themes/support_theme2.css"]);
	};

	// capture opportunity from Connections (route_options) before Frappe clears it
	const _routeOpp = (frappe.route_options && frappe.route_options.opportunity) || null;
	if (_routeOpp) frappe.route_options = null;

	ensureSupportLayoutLoaded(() => {
		loadSupportLayout(pageWrapper, () => {
			if (!frappe.supplier_quote_list_page || frappe.supplier_quote_list_page.wrapper !== pageWrapper) {
				frappe.supplier_quote_list_page = new SupplierQuoteListPage(pageWrapper);
			}
			if (_routeOpp) {
				const sf = frappe.supplier_quote_list_page.saved_filters || [];
				if (!sf.some(f => Array.isArray(f) && f[1] === "opportunity")) sf.push(["Supplier Quotation", "opportunity", "=", _routeOpp]);
				frappe.supplier_quote_list_page.saved_filters = sf;
				try {
					const u = new URL(window.location.href);
					u.searchParams.set("opportunity", _routeOpp);
					window.history.replaceState({}, "", u);
				} catch (e) {}
			}
			frappe.supplier_quote_list_page.render();
		});
	});
};

function ensureSupplierQuoteListAssets() {
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

	// Scoped CSS so the sq- page styles itself independently of the ql- page.
	if (!document.getElementById("sq-list-styles")) {
		const style = document.createElement("style");
		style.id = "sq-list-styles";
		style.textContent = `
		body[data-route^="supplier-quote-list"] #support-page-content.sq-content-fixed { overflow: hidden; }
		body[data-route^="supplier-quote-list"] #support-page-content.sq-content-scroll { overflow-y: auto; }

		.sq-page, .sq-list-view { font-family: 'DM Sans', sans-serif; color: #111827; }
		.sq-list-view .card.sq-list-card {
			background: #fff; border: 1px solid rgba(0,0,0,0.07); border-radius: 14px;
			box-shadow: 0 1px 6px rgba(0,0,0,0.05); padding: 0; overflow: hidden;
			display: flex; flex-direction: column;
		}
		.sq-loading { padding: 60px; text-align: center; color: #9ca3af; font-size: 13px; }

		/* Toolbar */
		.sq-list-toolbar {
			display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
			padding: 14px 16px; border-bottom: 1px solid rgba(0,0,0,0.07); background: #fafbfc;
		}
		.sq-list-toolbar-right { display: flex; align-items: center; gap: 8px; margin-left: auto; }
		.sq-input, .sq-select {
			height: 34px; border: 1px solid rgba(0,0,0,0.14); border-radius: 8px;
			padding: 0 10px; font-size: 12px; color: #111827; background: #fff; outline: none;
		}
		.sq-select { cursor: pointer; min-width: 120px; }
		.sq-list-toolbar .btn {
			height: 34px; border-radius: 8px; font-size: 12px; display: inline-flex;
			align-items: center; gap: 6px; padding: 0 12px; white-space: nowrap;
		}

		/* Multi-select filter */
		.sq-multi-wrap { position: relative; }
		.sq-multi-trigger {
			height: 34px; border: 1px solid rgba(0,0,0,0.14); border-radius: 8px; background: #fff;
			padding: 0 12px; font-size: 12px; color: #111827; cursor: pointer;
			display: inline-flex; align-items: center; gap: 8px;
		}
		.sq-multi-trigger i { font-size: 13px; color: #9ca3af; }
		.sq-multi-menu {
			display: none; position: absolute; top: calc(100% + 4px); left: 0; z-index: 400;
			width: 260px; max-height: 320px; background: #fff; border: 1px solid rgba(0,0,0,0.1);
			border-radius: 10px; box-shadow: 0 12px 32px rgba(0,0,0,0.12); overflow: hidden;
			flex-direction: column;
		}
		.sq-multi-menu.open { display: flex; }
		.sq-multi-search-wrap { padding: 8px; border-bottom: 1px solid rgba(0,0,0,0.06); }
		.sq-multi-search { width: 100%; height: 32px; border: 1px solid rgba(0,0,0,0.12); border-radius: 7px; padding: 0 10px; font-size: 12px; outline: none; }
		.sq-multi-options { overflow-y: auto; padding: 4px; max-height: 240px; }
		.sq-multi-option { display: flex; align-items: center; gap: 8px; padding: 7px 10px; border-radius: 7px; cursor: pointer; font-size: 12px; color: #374151; }
		.sq-multi-option:hover { background: rgba(59,126,248,0.06); }
		.sq-multi-checkbox { accent-color: #3b7ef8; width: 14px; height: 14px; cursor: pointer; }

		.sq-filter-trigger { border: 1px solid rgba(0,0,0,0.14); border-radius: 8px; background: #fff; color: #111827; height: 34px; }

		/* Table */
		.sq-list-table-wrap { overflow-x: auto; }
		.sq-list-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
		.sq-list-table thead th {
			text-align: left; padding: 11px 14px; font-size: 10px; font-weight: 700;
			text-transform: uppercase; letter-spacing: .05em; color: #9ca3af;
			border-bottom: 1px solid rgba(0,0,0,0.08); background: #fff; white-space: nowrap;
		}
		.sq-list-table .sq-sortable { cursor: pointer; user-select: none; }
		.sq-list-table .sq-sortable i { font-size: 13px; margin-left: 4px; vertical-align: middle; }
		.sq-list-table .sq-sort-active { color: #3b7ef8; }
		.sq-list-table tbody td { padding: 12px 14px; border-bottom: 1px solid rgba(0,0,0,0.05); vertical-align: middle; }
		.sq-list-row { cursor: pointer; transition: background .12s; }
		.sq-list-row:hover { background: rgba(59,126,248,0.04); }
		.col-id-subject { width: 22%; } .col-customer { width: 22%; } .col-status { width: 12%; }
		.col-amount { width: 16%; } .col-owner { width: 16%; } .col-dates { width: 12%; }
		.sq-cell-subject { color: #3b7ef8; font-weight: 600; }
		.sq-cell-id { font-size: 10px; color: #9ca3af; margin-top: 2px; }
		.sq-customer-text { font-weight: 500; color: #374151; }
		.sq-cell-amt { text-align: right; font-weight: 700; font-family: 'Syne', sans-serif; color: #111827; white-space: nowrap; }
		.sq-cell-owner { color: #6b7280; font-size: 11.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 160px; }
		.sq-cell-dates .sq-date-txn { font-size: 11.5px; color: #374151; }
		.sq-cell-dates .sq-date-valid { font-size: 10.5px; color: #9ca3af; margin-top: 2px; }
		.sq-empty { text-align: center; padding: 40px; color: #9ca3af; font-size: 12px; }

		/* Status pills */
		.sq-status { display: inline-flex; align-items: center; font-size: 10px; font-weight: 700; padding: 3px 10px; border-radius: 20px; text-transform: uppercase; letter-spacing: .03em; white-space: nowrap; }
		.sq-status-draft { background: rgba(107,114,128,0.12); color: #6b7280; }
		.sq-status-submitted { background: rgba(22,163,74,0.12); color: #16a34a; }
		.sq-status-stopped { background: rgba(217,119,6,0.12); color: #d97706; }
		.sq-status-cancelled { background: rgba(220,38,38,0.12); color: #dc2626; }
		.sq-status-expired { background: rgba(59,126,248,0.12); color: #3b7ef8; }

		/* Footer */
		.sq-list-footer { display: flex; align-items: center; gap: 14px; padding: 12px 16px; border-top: 1px solid rgba(0,0,0,0.07); background: #fafbfc; }
		.sq-list-footer .page-size-btns { display: flex; gap: 4px; }
		.sq-list-footer .ps-btn { height: 28px; min-width: 38px; border: 1px solid rgba(0,0,0,0.14); border-radius: 7px; background: #fff; font-size: 11px; color: #6b7280; cursor: pointer; }
		.sq-list-footer .ps-btn.active { background: #3b7ef8; border-color: #3b7ef8; color: #fff; font-weight: 600; }
		.sq-list-footer .record-count { font-size: 11px; color: #9ca3af; margin-left: auto; }
		.sq-list-footer .load-more-btn { height: 28px; border: 1px solid rgba(0,0,0,0.14); border-radius: 7px; background: #fff; font-size: 11px; color: #374151; cursor: pointer; padding: 0 14px; }
		.sq-list-footer .load-more-btn:disabled { opacity: .4; cursor: not-allowed; }
		`;
		document.head.appendChild(style);
	}
}


// ═══════════════════════════════════════════════════════════
//  SupplierQuoteListPage
// ═══════════════════════════════════════════════════════════
class SupplierQuoteListPage {
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
		this.selectedSuppliers = [];
		this.selectedOwners = [];
		this.ownerOptions = [];
		this.saved_filters = [];
		this.filterDoctype = "Supplier Quotation";
		this.activeFilterPopoverButton = null;
		this.amountSortDir = "";
		this.pageSize = 20;
		this.pageStep = 20;
		this.records = [];

		// ── Detail state (used by Part 2) ────────────────────
		this.selectedRecord = null;
		this.detailRecord = null;
		this.detailActivities = [];
		this.detailAttachments = [];
		this.isLoadingDetail = false;
		this.detailItems = [];
		this.activeTab = "notes";
		this.activeFilter = "all";

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
						if ($ancestor.length) $ancestor.addClass("active");
					});
				}
			}
		});

		if (window.syncSupportSidebarArrows) window.syncSupportSidebarArrows();
	}

	loadDataAndRender(routeName = "") {
		// opportunity from Connections (route_options) or URL → standard advanced filter
		const ro = frappe.route_options || {};
		const urlOpp = new URLSearchParams(window.location.search).get("opportunity") || "";
		const incomingOpp = ro.opportunity || urlOpp || "";
		if (ro.opportunity) { frappe.route_options = null; this._writeOppToUrl(incomingOpp); }
		if (incomingOpp) {
			this.saved_filters = this.saved_filters || [];
			if (!this.saved_filters.some(f => Array.isArray(f) && f[1] === "opportunity")) {
				this.saved_filters.push(["Supplier Quotation", "opportunity", "=", incomingOpp]);
			}
		}

		this.closeStandardFilterPopover();   // kill any orphaned popover on navigation

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


	_writeOppToUrl(oppId) {
		try {
			const url = new URL(window.location.href);
			if (oppId) url.searchParams.set("opportunity", oppId);
			else url.searchParams.delete("opportunity");
			window.history.replaceState({}, "", url);
		} catch (e) {}
	}

	_buildServerFilters() {
		const out = [];
		(this.saved_filters || []).forEach((f) => {
			if (Array.isArray(f) && f.length >= 4) out.push([f[0], f[1], f[2], f[3]]);
			else if (Array.isArray(f) && f.length === 3) out.push(["Supplier Quotation", f[0], f[1], f[2]]);
		});
		return out;
	}

	_refetchAndRender() {
		this.renderListLoading();
		this.fetchRecords().then(() => this.renderListView());
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
		const serverFilters = this._buildServerFilters();
		const sig = JSON.stringify(serverFilters);
		if (this.hasFetched && this._lastFilterSig === sig) return Promise.resolve();
		this._lastFilterSig = sig;

		const callGetList = (limitStart, limitPageLength) => new Promise((resolve, reject) => {
			frappe.call({
				method: "frappe.client.get_list",
				args: {
					doctype: "Supplier Quotation",
					fields: [
						"name", "status",
						"supplier", "supplier_name",
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
				party: doc.supplier_name || doc.supplier || "-",
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

	// ─── HELPERS ──────────────────────────────────────────
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

	getStatusClass(status) {
		return {
			"Draft": "sq-status-draft",
			"Submitted": "sq-status-submitted",
			"Stopped": "sq-status-stopped",
			"Cancelled": "sq-status-cancelled",
			"Expired": "sq-status-expired",
		}[status] || "sq-status-draft";
	}

	escapeAttr(value) {
		return String(value || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
	}

	getSupplierAvatarText(name) {
		const raw = String(name || "").trim();
		if (!raw || raw === "-") return "NA";
		const parts = raw.split(/\s+/).map((p) => p.replace(/[^A-Za-z0-9]/g, "")).filter(Boolean);
		if (!parts.length) return "NA";
		if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
		return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
	}

	// ─── LIST LOADING PLACEHOLDER ─────────────────────────
	renderListLoading() {
		this.page.set_title("Supplier Quotations");
		document.title = "Supplier Quotations";
		$("#support-page-content").removeClass("sq-content-scroll").addClass("sq-content-fixed");
		this.$content.html(`<div class="sq-list-view"><div class="card sq-list-card"><div class="sq-loading">Loading supplier quotations...</div></div></div>`);
	}

	// ─── LIST VIEW ────────────────────────────────────────
	renderListView() {
		this.page.set_title("Supplier Quotations");
		document.title = "Supplier Quotations";
		$("#support-page-content").removeClass("sq-content-scroll").addClass("sq-content-fixed");

		const supplierOptions = Array.from(new Set(this.records.map((r) => String(r.party || "").trim()).filter((n) => n && n !== "-"))).sort();
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
			<tr class="sq-list-row" data-name="${row.id}">
				<td class="sq-cell-id-subject">
					<div class="sq-cell-subject" title="${safeSubject}" style="cursor:pointer;">${safeSubject}</div>
					<div class="sq-cell-id" title="${safeSubject}">${safeSubject}</div>
				</td>
				<td><span class="sq-customer-text" title="${safeParty}">${safeParty}</span></td>
				<td><span class="sq-status ${this.getStatusClass(row.status)}">${this.escapeAttr(row.status)}</span></td>
				<td class="sq-cell-amt">${this.formatCurrency(row.amount)}</td>
				<td class="sq-cell-owner" title="${safeOwner}">${safeOwner}</td>
				<td class="sq-cell-dates">
					<div class="sq-date-txn"   title="Transaction Date">${row.creation}</div>
					<div class="sq-date-valid" title="Valid Till">${row.valid_till}</div>
				</td>
			</tr>`;
		}).join("");

		this.$content.html(`
		<div class="sq-list-view">
			<div class="card sq-list-card">
				<div class="sq-list-toolbar">
					${this.renderMultiFilter("supplier", supplierOptions.map((c) => ({ value: c, label: c })), this.selectedSuppliers, "Supplier")}
					${this.renderMultiFilter("owner", ownerOptions, this.selectedOwners, "Owner")}
					<select id="sqStatusFilter" class="sq-input sq-select">
						${statusOptions.map((s) => `<option value="${s}" ${this.statusFilter === s ? "selected" : ""}>${s || "Status"}</option>`).join("")}
					</select>
					<div class="sq-list-toolbar-right">
						<div class="sq-filter-wrap">
							<button id="sqOpenFilters" class="btn sq-filter-trigger" type="button" style="white-space:nowrap;padding:0;overflow:hidden;">
								<span class="sq-filter-btn-label" style="display:inline-flex;align-items:center;gap:6px;padding:7px 12px;"><i class="ti ti-filter"></i> Filters${appliedCount ? ` (${appliedCount})` : ""}</span>
								<span class="sq-filter-btn-close" style="display:none;align-items:center;justify-content:center;min-width:28px;padding:7px 10px;border-left:1px solid rgba(15,23,42,0.12);cursor:pointer;">×</span>
							</button>
						</div>
						<button id="sqClearFilters" class="btn" type="button"><i class="ti ti-filter-off"></i> Clear</button>
						<button id="sqNewDoc" class="btn btn-primary" type="button"><i class="ti ti-plus"></i> New Supplier Quotation</button>
					</div>
				</div>

				<div class="table-wrap sq-list-table-wrap">
					<table class="sq-list-table">
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
								<th>Supplier Quotation</th>
								<th>Supplier</th>
								<th>Status</th>
								<th id="sqSortAmount" class="sq-sortable ${this.amountSortDir ? "sq-sort-active" : ""}">
									Grand Total <i class="ti ${amountSortIcon}"></i>
								</th>
								<th>Owner</th>
								<th>Date / Valid Till</th>
							</tr>
						</thead>
						<tbody>
							${tableRows || '<tr><td colspan="6" class="sq-empty">No records found</td></tr>'}
						</tbody>
					</table>
				</div>

				<div class="sq-list-footer">
					<div class="page-size-btns">
						${[20, 100, 500, 2500].map((s) => `<button class="ps-btn ${this.pageSize === s ? "active" : ""}" data-size="${s}" type="button">${s}</button>`).join("")}
					</div>
					<div class="record-count">${visibleRows.length} of ${rows.length}</div>
					<button id="sqLoadMore" class="load-more-btn" type="button" ${visibleRows.length >= rows.length ? "disabled" : ""}>Load More</button>
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
		<div class="sq-multi-wrap">
			<div class="sq-multi" data-filter="${key}">
				<button type="button" class="sq-multi-trigger" data-filter-trigger="${key}">
					<span>${this.escapeAttr(triggerText)}</span><i class="ti ti-chevron-down"></i>
				</button>
				<div class="sq-multi-menu" data-filter-menu="${key}">
					<div class="sq-multi-search-wrap">
						<input type="text" class="sq-multi-search" data-filter-search="${key}" placeholder="Search ${placeholder.toLowerCase()}..."/>
					</div>
					<div class="sq-multi-options">
						${sortedOptions.map((opt) => {
			const value = String(opt.value || "").trim();
			const label = String(opt.label || value).trim();
			if (!value) return "";
			return `
							<label class="sq-multi-option" data-filter-option="${key}" data-label="${this.escapeAttr(label.toLowerCase())}">
								<input type="checkbox" class="sq-multi-checkbox" data-filter-check="${key}" value="${this.escapeAttr(value)}" ${selectedSet.has(value) ? "checked" : ""}>
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
		candidates.push(this.$content ? this.$content.find("#sqOpenFilters") : $("#sqOpenFilters"));
		candidates.forEach(($btn) => {
			if (!$btn?.length) return;
			try { $btn.popover("hide"); } catch (e) { }
			try { $btn.popover("dispose"); } catch (e) { }
			$btn.find(".sq-filter-btn-close").css("display", "none");
		});
		$("body > .popover.filter-popover, body > .popover.show").remove();
		this.activeFilterPopoverButton = null;
		$(document).off("mousedown.sqStandardFilter");
	}

	openStandardFilterPopover(button) {
		const me = this;
		const DOCTYPE = this.filterDoctype || "Supplier Quotation";
		const $btn = $(button);

		if (this.activeFilterPopoverButton?.length && this.activeFilterPopoverButton[0] !== $btn[0]) {
			this.closeStandardFilterPopover(this.activeFilterPopoverButton);
		}

		const setFilterButtonState = (isOpen) => $btn.find(".sq-filter-btn-close").css("display", isOpen ? "inline-flex" : "none");
		const safeClose = () => { me.closeStandardFilterPopover($btn); setFilterButtonState(false); };

		const isAlreadyOpen = $btn.find(".sq-filter-btn-close").css("display") !== "none";
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
			<div class="filter-action-buttons sq-std-filter-footer mt-1 d-flex justify-content-between align-items-center">
				<button type="button" class="text-muted add-filter btn btn-xs sq-std-btn sq-std-btn-add">+ Add a Filter</button>
				<div class="filter-action-right">
					<button type="button" class="btn btn-secondary btn-xs clear-filters mr-2 sq-std-btn sq-std-btn-clear">Clear</button>
					<button type="button" class="btn btn-primary btn-xs apply-filters sq-std-btn sq-std-btn-apply">Apply</button>
				</div>
			</div>`);

			popover_content.find(".filter-action-buttons").remove();
			popover_content.append(footer);
			footer.css({ marginTop: "2px", paddingTop: "3px", borderTop: "none", gap: "4px" });
			footer.find(".filter-action-right").css({ display: "inline-flex", alignItems: "center", gap: "8px" });
			footer.find(".sq-std-btn").css({ height: "26px", padding: "0 9px", borderRadius: "8px", fontSize: "11px", fontWeight: "600", boxShadow: "none" });
			footer.find(".sq-std-btn-add").css({ background: "#f8fafc", color: "#334155", border: "1px solid rgba(15,23,42,0.14)" });
			footer.find(".sq-std-btn-clear").css({ background: "#fff", color: "#0f172a", border: "1px solid rgba(15,23,42,0.2)", marginRight: "0" });
			footer.find(".sq-std-btn-apply").css({ background: "#2f6fe5", color: "#fff", border: "1px solid #2f6fe5" });
			footer.find(".add-filter").on("click", () => FG.add_filter(DOCTYPE, "name", "=", "", false));
			footer.find(".clear-filters").on("click", () => { FG.clear_filters(); me.saved_filters = []; me.pageSize = 20; safeClose(); me._writeOppToUrl(""); me._refetchAndRender(); });
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
					$(tipElement).find(".filter-area").css({ lineHeight: "1.15", width: "100%" });
					$(tipElement).find(".filter-group .form-control, .filter-group input, .filter-group select").css({ height: "26px", minHeight: "26px", paddingTop: "2px", paddingBottom: "2px", fontSize: "11px" });
					$(tipElement).find(".filter-group .filter-row, .filter-group .filter-field").css({ marginBottom: "2px" });
					$(tipElement).find(".filter-group .text-muted, .filter-group small").css({ display: "none" });
					$(tipElement).find("hr, .filter-group hr").css({ display: "none" });
				}
			} catch (err) { safeClose(); return; }

			$(document).off("mousedown.sqStandardFilter").on("mousedown.sqStandardFilter", (e) => {
				if (!$(e.target).closest(".popover, .filter-popover, #sqOpenFilters").length) safeClose();
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

	getFilteredRows() {
		const sc = new Set(this.selectedSuppliers), so = new Set(this.selectedOwners);
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
		if (field === "supplier_name" || field === "supplier") return row.party;
		if (field === "status") return row.status;
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
			.off("click.sq", "[data-filter-trigger]")
			.on("click.sq", "[data-filter-trigger]", (e) => {
				e.preventDefault(); e.stopPropagation();
				const key = String($(e.currentTarget).data("filterTrigger") || "");
				const $menu = this.$content.find(`[data-filter-menu='${key}']`);
				const open = !$menu.hasClass("open");
				this.$content.find("[data-filter-menu]").removeClass("open");
				if (open) $menu.addClass("open");
			});

		this.$content
			.off("change.sq", ".sq-multi-checkbox")
			.on("change.sq", ".sq-multi-checkbox", (e) => {
				const key = String($(e.currentTarget).data("filterCheck") || "");
				const values = this.$content.find(`.sq-multi-checkbox[data-filter-check='${key}']:checked`).map((_, el) => String(el.value || "").trim()).get().filter(Boolean);
				if (key === "supplier") this.selectedSuppliers = values;
				if (key === "owner") this.selectedOwners = values;
				this.pageSize = 20; this.renderListView();
			});

		this.$content
			.off("input.sq", ".sq-multi-search")
			.on("input.sq", ".sq-multi-search", (e) => {
				const key = String($(e.currentTarget).data("filterSearch") || "");
				const query = String($(e.currentTarget).val() || "").trim().toLowerCase();
				this.$content.find(`[data-filter-option='${key}']`).each((_, item) => $(item).toggle(!query || String($(item).data("label") || "").toLowerCase().includes(query)));
			});

		this.$content
			.off("click.sq", "#sqOpenFilters .sq-filter-btn-close")
			.on("click.sq", "#sqOpenFilters .sq-filter-btn-close", (e) => { e.preventDefault(); e.stopPropagation(); this.closeStandardFilterPopover(this.$content.find("#sqOpenFilters")); });

		this.$content
			.off("click.sq", "#sqOpenFilters")
			.on("click.sq", "#sqOpenFilters", (e) => {
				e.preventDefault(); e.stopPropagation();
				if ($(e.target).closest(".sq-filter-btn-close").length) { this.closeStandardFilterPopover(e.currentTarget); return; }
				this.openStandardFilterPopover(e.currentTarget);
			});

		this.$content
			.off("change.sq", "#sqStatusFilter")
			.on("change.sq", "#sqStatusFilter", (e) => { this.statusFilter = String($(e.currentTarget).val() || "").trim(); this.renderListView(); });

		this.$content
			.off("click.sq", "#sqClearFilters")
			.on("click.sq", "#sqClearFilters", () => { this.selectedSuppliers = []; this.selectedOwners = []; this.statusFilter = ""; this.saved_filters = []; this._writeOppToUrl(""); this.pageSize = 20; this._refetchAndRender(); });

		this.$content
			.off("click.sq", "#sqSortAmount")
			.on("click.sq", "#sqSortAmount", (e) => { e.preventDefault(); this.amountSortDir = !this.amountSortDir ? "asc" : this.amountSortDir === "asc" ? "desc" : ""; this.renderListView(); });

		this.$content
			.off("click.sq", ".ps-btn")
			.on("click.sq", ".ps-btn", (e) => { const s = Number($(e.currentTarget).data("size") || 20); if (!Number.isFinite(s) || s <= 0) return; this.pageSize = s; this.renderListView(); });

		this.$content
			.off("click.sq", "#sqLoadMore")
			.on("click.sq", "#sqLoadMore", () => { this.pageSize += this.pageStep; this.renderListView(); });

		this.$content
			.off("click.sq", "#sqNewDoc")
			.on("click.sq", "#sqNewDoc", () => frappe.set_route("supplier-quote-list", "new"));

		this.$content
			.off("click.sq", ".sq-list-row")
			.on("click.sq", ".sq-list-row", (e) => {
				const name = String($(e.currentTarget).data("name") || "");
				const selected = this.records.find((r) => r.id === name);
				if (!selected) return;
				this.closeStandardFilterPopover();
				this.selectedRecord = selected;
				frappe.set_route("supplier-quote-list", name);
			});

		$(document).off("click.sqListFilters").on("click.sqListFilters", (e) => {
			if (!$(e.target).closest(".sq-multi").length) this.$content.find("[data-filter-menu]").removeClass("open");
		});
	}

	// ─── STUBS (replaced in Part 2 / Part 3) ──────────────
	/* ╔═══════════════════════════════════════════════════════════╗
   ║  SECTION A — paste these methods INSIDE SupplierQuoteListPage ║
   ╚═══════════════════════════════════════════════════════════╝ */
 
	// ─── DETAIL STYLES (idempotent) ───────────────────────
	_ensureDetailStyles() {
		if (document.getElementById("sq-detail-styles")) return;
		const style = document.createElement("style");
		style.id = "sq-detail-styles";
		style.textContent = `
		body[data-route^="supplier-quote-list"] .sq-page .card {
			background:#fff;border:1px solid rgba(0,0,0,0.07);border-radius:14px;
			box-shadow:0 1px 6px rgba(0,0,0,0.05);padding:18px 20px;margin-bottom:14px;
		}
		.sq-page .section-head { display:flex;align-items:center;justify-content:space-between;margin-bottom:10px; }
		.sq-page .section-title { font-family:'Syne',sans-serif;font-size:15px;font-weight:700;color:#111827; }
		.sq-page .sq-field-label { font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af; }
		.sq-page .sq-field-input { width:100%;height:38px;border:1px solid rgba(0,0,0,0.14);border-radius:8px;padding:0 12px;font-size:13px;color:#111827;background:#fff;outline:none; }
		.sq-page .sq-mi-label { font-size:11px;font-weight:600;color:#9ca3af;display:inline-flex;align-items:center;gap:5px;white-space:nowrap; }
		.sq-page .sq-mi-label i { font-size:13px; }
		.sq-page .sq-mi-val { font-size:13.5px;font-weight:500;color:#111827;text-align:right;flex:1;min-width:0; }
 
		/* Top split */
		.sq-page .top-split { display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr);gap:14px;margin-bottom:14px; }
		.sq-page .top-left1, .sq-page .top-right1 { background:#fff;border:1px solid rgba(0,0,0,0.07);border-radius:14px;box-shadow:0 1px 6px rgba(0,0,0,0.05);padding:16px 18px; }
		.sq-page .subject-label { font-family:'Syne',sans-serif;font-size:17px;font-weight:700;color:#111827;margin-bottom:12px; }
		.sq-page .top-left-row1 { display:flex;align-items:center;gap:12px;margin-bottom:14px; }
		.sq-page .customer-avatar { width:46px;height:46px;border-radius:12px;background:rgba(79,70,229,0.12);color:#4f46e5;display:flex;align-items:center;justify-content:center;font-family:'Syne',sans-serif;font-size:16px;font-weight:700;flex-shrink:0; }
		.sq-page .customer-info { flex:1;min-width:0; }
		.sq-page .customer-name { font-size:15px;font-weight:700;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
		.sq-page .customer-sub { font-size:11.5px;color:#9ca3af;margin-top:2px; }
		.sq-page .badge { display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:700;padding:5px 12px;border-radius:20px;background:rgba(107,114,128,0.12);color:#6b7280;white-space:nowrap; }
 
		.sq-page .fin-grid { display:grid;grid-template-columns:repeat(3,1fr);gap:10px; }
		.sq-page .fin-card { background:#f8fafc;border:1px solid rgba(0,0,0,0.06);border-radius:10px;padding:10px 12px; }
		.sq-page .fin-label { font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;margin-bottom:4px; }
		.sq-page .fin-value { font-family:'Syne',sans-serif;font-size:17px;font-weight:700;color:#111827; }
		.sq-page .fin-value.profit { color:#4f46e5; }
		.sq-page .fin-value .currency { font-size:13px;color:#9ca3af;margin-right:1px; }
 
		.sq-page .top-actions-row { display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px; }
		.sq-page .header-title { font-family:'Syne',sans-serif;font-size:14px;font-weight:700;color:#111827;margin-right:auto; }
		.sq-page .top-actions-row .btn { height:32px;border-radius:8px;font-size:12px;display:inline-flex;align-items:center;gap:5px;padding:0 12px; }
		.sq-page .vdivider { width:1px;height:22px;background:rgba(0,0,0,0.1); }
 
		/* Item cards */
		.sq-di-card { background:#fff;border:1px solid rgba(0,0,0,0.08);border-radius:10px;padding:10px 12px; }
		.sq-ic-row1 { display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap; }
		.sq-ic-num { width:24px;height:24px;border-radius:6px;background:#f1f5f9;color:#6b7280;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-bottom:2px; }
		.sq-ic-item { flex:1;min-width:160px; }
		.sq-ic-name { font-size:13px;font-weight:600;color:#111827; }
		.sq-ic-sub { font-size:10.5px;color:#9ca3af;margin-top:2px; }
		.sq-ic-field { display:flex;flex-direction:column;gap:3px; }
		.sq-ic-label { font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#9ca3af; }
		.sq-ic-input { height:30px;border:1px solid rgba(0,0,0,0.14);border-radius:6px;padding:0 8px;font-size:12px;outline:none;width:100%; }
		.sq-ic-roval { font-size:12px;color:#374151;padding:6px 0; }
		.sq-ic-amt { font-weight:700;color:#111827; }
		.sq-di-desc-btn, .sq-di-del-btn { width:30px;height:30px;border-radius:6px;border:1px solid rgba(0,0,0,0.12);background:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:13px;color:#6b7280; }
		.sq-di-desc-btn.has-desc { color:#4f46e5;border-color:rgba(79,70,229,0.3); }
		.sq-di-del-btn { color:#dc2626;border-color:rgba(220,38,38,0.2); }
 
		/* Activity panel */
		.sq-page .act-tab.active { color:#4f46e5;border-bottom:2px solid #4f46e5; }
		.sq-page .act-tab { color:#9ca3af;border-bottom:2px solid transparent; }
		.sq-page .act-input-area.hidden, .sq-page .attachments-panel.hidden, .sq-page .mention-dropdown.hidden { display:none !important; }
		.sq-page .act-bottom { padding:12px 16px; }
		.sq-page .add-btn { height:34px;border-radius:8px;border:1px dashed rgba(79,70,229,0.4);background:rgba(79,70,229,0.04);color:#4f46e5;font-size:12px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:6px;padding:0 14px; }
		.sq-page .act-textarea { width:100%;min-height:80px;border:1px solid rgba(0,0,0,0.14);border-radius:8px;padding:10px 12px;font-size:13px;outline:none;resize:vertical;font-family:'DM Sans',sans-serif; }
		.sq-page .act-input { width:100%;height:34px;border:1px solid rgba(0,0,0,0.14);border-radius:8px;padding:0 10px;font-size:13px;outline:none; }
		.sq-page .act-field-label { font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:4px; }
		.sq-page .act-input-actions { display:flex;gap:8px;padding:12px 16px;border-top:1px solid rgba(0,0,0,0.06); }
		.sq-page .act-input-actions .btn { height:32px;border-radius:8px;font-size:12px;display:inline-flex;align-items:center;gap:5px;padding:0 14px; }
		.sq-page .rel-wrap { position:relative;padding:12px 16px; }
		.sq-page .mention-dropdown { position:absolute;left:16px;right:16px;top:80px;z-index:500;background:#fff;border:1px solid rgba(0,0,0,0.1);border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,0.12);max-height:260px;overflow-y:auto; }
		.sq-page .mention-item { display:flex;align-items:center;gap:10px;padding:8px 12px;cursor:pointer; }
		.sq-page .mention-item:hover { background:rgba(79,70,229,0.06); }
		.sq-page .mention-avatar { width:28px;height:28px;border-radius:50%;background:rgba(79,70,229,0.12);color:#4f46e5;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0; }
		.sq-page .mention-name { font-size:12px;font-weight:600;color:#111827; }
		.sq-page .mention-role { font-size:10px;color:#9ca3af; }
 
		.sq-page .sq-conn-chip:hover { border-color:#4f46e5 !important;background:rgba(79,70,229,0.04) !important; }
		`;
		document.head.appendChild(style);
	}
 
	// ─── DATA FETCH (detail) ──────────────────────────────
	fetchDetailRecord(recordId) {
		return new Promise((resolve) => {
			frappe.call({
				method: "frappe.client.get",
				args: { doctype: "Supplier Quotation", name: recordId },
				callback: (r) => { this.detailRecord = (r && r.message) || null; resolve(this.detailRecord); },
				error: () => { this.detailRecord = null; resolve(null); },
			});
		});
	}
 
	fetchDetailComments(recordId) {
		return new Promise((resolve) => {
			frappe.call({
				method: "frappe.client.get_list",
				args: {
					doctype: "Comment",
					fields: ["name", "content", "comment_type", "owner", "creation"],
					filters: [
						["Comment", "reference_doctype", "=", "Supplier Quotation"],
						["Comment", "reference_name", "=", recordId],
						["Comment", "comment_type", "=", "Comment"],
					],
					limit_page_length: 200,
					order_by: "creation desc",
				},
				callback: (r) => {
					this.detailActivities = ((r && r.message) || []).map((c) => ({
						id: c.name,
						title: this._htmlToText(c.content || ""),
						type: "Comment", tab: "comments",
						owner: c.owner || "",
						created: this.formatActivityTime(c.creation),
						status: "completed", meta: "",
					}));
					resolve(this.detailActivities);
				},
				error: () => { this.detailActivities = []; resolve([]); },
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
					filters: { attached_to_doctype: "Supplier Quotation", attached_to_name: recordId },
					limit_page_length: 100,
					order_by: "creation desc",
				},
				callback: (r) => {
					const files = ((r && r.message) || []).map(f => ({
						id: f.name, name: f.file_name || f.name, url: f.file_url || "",
						size: f.file_size || 0, owner: f.owner || "",
						created: this.formatActivityTime(f.creation), description: "",
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
				line1: a.address_line1 || "", line2: a.address_line2 || "",
				city: a.city || "", state: a.state || "", pincode: a.pincode || "",
				primary: !!a.is_primary_address, shipping: !!a.is_shipping_address,
			}))),
			error: () => cb([]),
		});
	}
 
	// ─── HELPERS (detail) ─────────────────────────────────
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
 
	// ─── DETAIL VIEW ──────────────────────────────────────
	renderDetailView() {
		this._ensureDetailStyles();
		if (!this.selectedRecord) { this.$content.html('<div style="padding:20px;text-align:center;">Record not found</div>'); return; }
		if (this.isLoadingDetail) return;
		this.isLoadingDetail = true;
		this.activeTab = "comments";
		$("#support-page-content").removeClass("sq-content-fixed").addClass("sq-content-scroll");
 
		this.$content.html('<div style="padding:40px;text-align:center;"><div class="spinner-border" role="status"></div><p style="margin-top:15px;">Loading...</p></div>');
 
		this.fetchDetailRecord(this.selectedRecord.id)
			.then(() => Promise.all([
				this.fetchDetailComments(this.selectedRecord.id),
				this.fetchDetailAttachments(this.selectedRecord.id),
			]))
			.then(() => {
				this.$content.empty().html(frappe.supplier_quote_list_page_template.detail);
				this.injectDetailHeader();
				this.injectDetailMeta();
				this.injectDetailSupplier();
				this.injectDetailAddress();
				this.injectDetailItems();
				this.injectDetailFinancialsSummary();
				this.injectPaymentSchedule();
				this.injectConnections();
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
		const supplierName = record.supplier_name || record.supplier || this.selectedRecord.party || "-";
		const status = record.status || this.selectedRecord.status || "Draft";
		const isDraft = Number(record.docstatus || 0) === 0;
		const isSubmitted = Number(record.docstatus || 0) === 1;
 
		this.$content.find("#sqBreadcrumbId").text(record.name || this.selectedRecord.id);
		this.$content.find("#sqSubjectLabel").text(record.name || this.selectedRecord.id).attr("title", record.name || "");
		this.$content.find(".customer-avatar").text(this.getSupplierAvatarText(supplierName)).attr("title", supplierName);
		this.$content.find(".customer-name").text(supplierName);
		this.$content.find(".customer-sub").text(`Owner · ${record.owner || this.selectedRecord.owner}`);
 
		const statusColors = {
			Draft: "#6b7280", Submitted: "#16a34a", Stopped: "#d97706",
			Cancelled: "#dc2626", Expired: "#4f46e5",
		};
		const clr = statusColors[status] || "#6b7280";
		this.$content.find("#statusBadge")
			.css({ background: `${clr}1f`, color: clr })
			.html(`<i class="ti ti-circle-dot"></i> ${this.escapeAttr(status)}`);
 
		// draft-only: Submit ; submitted-only: Create PO + Connections + PDF
		this.$content.find("#sqBtnSubmit").toggle(isDraft);
		this.$content.find("#sqBtnCreatePo").toggle(isSubmitted);
		this.$content.find("#sqConnectionsWrap").toggle(isSubmitted);
		this.$content.find("#sqBtnPdf").toggle(!isDraft || true); // PDF always available
	}
 
	injectDetailMeta() {
		const record = this.detailRecord || this.selectedRecord;
		if (!record) return;
 
		this.$content.find("#sqMetaTxnDate").text(this.formatDate(record.transaction_date));
		this.$content.find("#sqMetaValidTill").text(this.formatDate(record.valid_till));
 
		// Company — editable live-search input + open link
		const companyVal = record.company || "";
		this.$content.find("#sqMetaCompanyInput").val(companyVal);
		this._bindDetailCompanySearch();
		const $companyOpen = this.$content.find("#sqCompanyOpen");
		if (companyVal) {
			$companyOpen.attr("href", "/app/company/" + encodeURIComponent(companyVal))
				.attr("title", "Open " + companyVal).css("display", "inline-flex");
		} else {
			$companyOpen.css("display", "none");
		}
	}
 
	_bindDetailCompanySearch() {
		const me = this;
		const runSearch = () => {
			const $input = me.$content.find("#sqMetaCompanyInput");
			const $dd = me.$content.find("#sqMetaCompanyDD");
			const q = ($input.val() || "").trim();
			$dd.css({ width: $input.outerWidth() + "px" })
				.html(`<div style="padding:10px 12px;font-size:12px;color:#9ca3af;"><i class="ti ti-loader" style="margin-right:6px;"></i>Searching…</div>`).show();
			if (me._dCompanyTimer) clearTimeout(me._dCompanyTimer);
			me._dCompanyTimer = setTimeout(() => {
				const filters = q ? [["Company", "name", "like", `%${q}%`]] : [];
				frappe.call({
					method: "frappe.client.get_list",
					args: { doctype: "Company", fields: ["name"], filters, limit_page_length: 12, order_by: "name asc" },
					callback: (r) => {
						const rows = r.message || [];
						if (!rows.length) { $dd.html(`<div style="padding:12px;text-align:center;font-size:12px;color:#9ca3af;"><i class="ti ti-search-off"></i> No Company found</div>`); return; }
						$dd.html(rows.map(row => `
							<div class="sq-dcompany-item" data-label="${me.escapeAttr(row.name)}" style="display:flex;align-items:center;gap:10px;padding:9px 12px;cursor:pointer;">
								<div style="width:28px;height:28px;border-radius:50%;background:rgba(79,70,229,0.12);color:#4f46e5;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="ti ti-building" style="font-size:13px;"></i></div>
								<div style="font-size:12px;font-weight:500;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${me.escapeAttr(row.name)}</div>
							</div>`).join(""));
						$dd.find(".sq-dcompany-item")
							.on("mouseenter", function () { $(this).css("background", "rgba(79,70,229,0.06)"); })
							.on("mouseleave", function () { $(this).css("background", ""); });
					},
				});
			}, 250);
		};
		me.$content.off("input.sqDCompany focus.sqDCompany", "#sqMetaCompanyInput")
			.on("input.sqDCompany focus.sqDCompany", "#sqMetaCompanyInput", runSearch);
		me.$content.off("mousedown.sqDCompany", ".sq-dcompany-item")
			.on("mousedown.sqDCompany", ".sq-dcompany-item", (e) => {
				e.preventDefault();
				const company = String($(e.currentTarget).data("label") || "");
				me.$content.find("#sqMetaCompanyInput").val(company);
				me.$content.find("#sqMetaCompanyDD").hide().empty();
				me.$content.find("#sqCompanyOpen").attr("href", "/app/company/" + encodeURIComponent(company)).attr("title", "Open " + company).css("display", "inline-flex");
				me._saveDetailField("company", company, "Company updated.");
			});
		$(document).off("click.sqDCompanyDoc").on("click.sqDCompanyDoc", (ev) => {
			if (!$(ev.target).closest("#sqMetaCompanyInput, #sqMetaCompanyDD").length) me.$content.find("#sqMetaCompanyDD").hide();
		});
	}
 
	// Generic single-field save on the Supplier Quotation (get → set → save)
	_saveDetailField(fieldname, value, okMsg) {
		const me = this;
		const record = me.detailRecord || {};
		if (!record.name) return;
		frappe.call({
			method: "frappe.client.get",
			args: { doctype: "Supplier Quotation", name: record.name },
			callback: (r) => {
				const doc = r.message;
				if (!doc) return;
				doc[fieldname] = value;
				frappe.call({
					method: "frappe.client.save",
					args: { doc },
					callback: (r2) => {
						if (r2.message) { me.detailRecord = r2.message; frappe.show_alert({ message: okMsg || "Updated.", indicator: "green" }); }
					},
					error: () => frappe.show_alert({ message: "Update failed (field may be locked on a submitted doc).", indicator: "red" }),
				});
			},
		});
	}
 
	// ─── SUPPLIER CARD ────────────────────────────────────
	injectDetailSupplier() {
		const me = this;
		const record = me.detailRecord || {};
		const $card = me.$content.find("#sqSupplierCard");
		if (!$card.length) return;
		const supplier = record.supplier || "";
		const name = record.supplier_name || supplier || "—";
		const contact = record.contact_display || record.contact_person || "";
		const email = record.contact_email || "";
		const phone = record.contact_mobile || "";
		const av = me.getSupplierAvatarText(name);
 
		$card.html(`
			<div style="background:#fff;border:1px solid rgba(0,0,0,0.09);border-radius:12px;padding:14px 16px;display:flex;align-items:flex-start;gap:14px;">
				<div style="width:42px;height:42px;border-radius:50%;background:rgba(79,70,229,0.12);border:2px solid rgba(79,70,229,0.25);color:#4f46e5;display:flex;align-items:center;justify-content:center;font-family:Syne,sans-serif;font-size:15px;font-weight:700;flex-shrink:0;">${me.escapeAttr(av)}</div>
				<div style="flex:1;min-width:0;">
					${supplier
				? `<a href="/app/supplier/${encodeURIComponent(supplier)}" style="font-size:14px;font-weight:600;color:#4f46e5;text-decoration:none;" title="Open ${me.escapeAttr(name)}">${me.escapeAttr(name)}</a>`
				: `<div style="font-size:14px;font-weight:600;color:#111827;">${me.escapeAttr(name)}</div>`}
					${contact ? `<div style="font-size:11px;color:#6b7280;margin-top:3px;"><i class="ti ti-user" style="font-size:11px;color:#9ca3af;margin-right:4px;"></i>${me.escapeAttr(contact)}</div>` : ""}
					${email ? `<div style="font-size:11px;color:#4f46e5;margin-top:3px;"><i class="ti ti-mail" style="font-size:11px;color:#9ca3af;margin-right:4px;"></i>${me.escapeAttr(email)}</div>` : ""}
					${phone ? `<div style="font-size:11px;color:#374151;margin-top:2px;"><i class="ti ti-device-mobile" style="font-size:11px;color:#9ca3af;margin-right:4px;"></i>${me.escapeAttr(phone)}</div>` : ""}
				</div>
			</div>`);
	}
 
	// ─── ADDRESS ──────────────────────────────────────────
	injectDetailAddress() {
		const me = this;
		const record = me.detailRecord || {};
		me._detailAddrSlots = {
			supplier: { field: "supplier_address", listKey: "_detailSupAddrs", cardId: "sqDetailSupAddrCard", accent: "#4f46e5", icon: "ti-map-pin", label: "Supplier Address", empty: "No supplier addresses found." },
			shipping: { field: "shipping_address", listKey: "_detailCompAddrs", cardId: "sqDetailShipAddrCard", accent: "#16a34a", icon: "ti-truck-delivery", label: "Shipping Address", empty: "No company addresses found." },
		};
		const supplier = record.supplier || "";
		const company = record.company || "";
		me._detailSupAddrs = me._detailSupAddrs || [];
		me._detailCompAddrs = me._detailCompAddrs || [];
		["supplier", "shipping"].forEach(k => me.renderDetailAddressSlot(k));
 
		if (supplier) me._fetchAddresses("Supplier", supplier, (list) => { me._detailSupAddrs = list; me.renderDetailAddressSlot("supplier"); });
		if (company) me._fetchAddresses("Company", company, (list) => { me._detailCompAddrs = list; me.renderDetailAddressSlot("shipping"); });
 
		me.$content.off("click.sqDAddr", ".sq-daddr-add, .sq-daddr-change")
			.on("click.sqDAddr", ".sq-daddr-add, .sq-daddr-change", (e) => me.openDetailAddressPicker(String($(e.currentTarget).data("addrSlot"))));
		me.$content.off("click.sqDAddrRm", ".sq-daddr-remove")
			.on("click.sqDAddrRm", ".sq-daddr-remove", (e) => {
				const slotKey = String($(e.currentTarget).data("addrSlot"));
				const slot = me._detailAddrSlots[slotKey];
				if (!slot) return;
				me.detailRecord[slot.field] = "";
				me._saveDetailField(slot.field, "", "Address removed.");
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
				<button type="button" class="sq-daddr-add" data-addr-slot="${slotKey}" style="width:100%;border:2px dashed rgba(0,0,0,0.14);border-radius:12px;padding:18px;display:flex;align-items:center;justify-content:center;gap:8px;background:#f7f8fa;color:#6b7280;cursor:pointer;font-size:13px;font-weight:500;">
					<i class="ti ti-plus" style="font-size:16px;color:${slot.accent};"></i> Add ${me.escapeAttr(slot.label)}
				</button>`);
			return;
		}
		const renderCard = (a) => {
			const clr = slot.accent;
			const cityLine = [a.city, a.state, a.pincode].filter(Boolean).join(", ");
			const badge = (txt, c) => `<span style="display:inline-flex;align-items:center;margin-left:6px;padding:1px 7px;border-radius:20px;background:${c}1a;font-size:9px;font-weight:700;color:${c};">${txt}</span>`;
			let badges = "";
			if (a.primary) badges += badge("PRIMARY", "#16a34a");
			if (a.shipping) badges += badge("SHIPPING", "#4f46e5");
			$card.html(`
				<div style="background:#fff;border:1px solid rgba(0,0,0,0.09);border-radius:14px;padding:14px 18px;display:flex;align-items:flex-start;gap:14px;box-shadow:0 1px 6px rgba(0,0,0,0.06);position:relative;">
					<div style="width:42px;height:42px;border-radius:50%;background:${clr}1a;border:2px solid ${clr}33;display:flex;align-items:center;justify-content:center;color:${clr};flex-shrink:0;"><i class="ti ${slot.icon}" style="font-size:18px;"></i></div>
					<div style="flex:1;min-width:0;">
						<div style="font-family:Syne,sans-serif;font-size:14px;font-weight:600;color:#111827;">${me.escapeAttr(a.name || name)}${badges}</div>
						${a.line1 ? `<div style="font-size:12px;color:#374151;margin-top:4px;">${me.escapeAttr(a.line1)}</div>` : ""}
						${a.line2 ? `<div style="font-size:12px;color:#374151;margin-top:2px;">${me.escapeAttr(a.line2)}</div>` : ""}
						${cityLine ? `<div style="font-size:12px;color:#6b7280;margin-top:3px;"><i class="ti ti-building-community" style="font-size:13px;color:#9ca3af;margin-right:6px;"></i>${me.escapeAttr(cityLine)}</div>` : ""}
						<button type="button" class="sq-daddr-change" data-addr-slot="${slotKey}" style="margin-top:8px;background:transparent;border:none;color:${clr};font-size:11px;font-weight:600;cursor:pointer;padding:0;display:inline-flex;align-items:center;gap:4px;"><i class="ti ti-switch-horizontal" style="font-size:12px;"></i> Change</button>
					</div>
					<button type="button" class="sq-daddr-remove" data-addr-slot="${slotKey}" style="position:absolute;top:10px;right:10px;width:24px;height:24px;border-radius:50%;border:1px solid rgba(0,0,0,0.08);background:transparent;color:#9ca3af;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;" title="Remove"><i class="ti ti-x"></i></button>
				</div>`);
		};
		if (addr) { renderCard(addr); return; }
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
		$("#sqDAddrPickerOverlay").remove();
		const rows = list.length
			? list.map((a, i) => {
				const cityLine = [a.city, a.state, a.pincode].filter(Boolean).join(", ");
				let tags = "";
				if (a.primary) tags += `<span style="font-size:9px;font-weight:700;color:#16a34a;margin-left:6px;">• PRIMARY</span>`;
				if (a.shipping) tags += `<span style="font-size:9px;font-weight:700;color:#4f46e5;margin-left:6px;">• SHIPPING</span>`;
				return `<div class="sq-daddr-pick" data-ai="${i}" style="display:flex;align-items:flex-start;gap:12px;padding:12px 14px;border:1.5px solid rgba(0,0,0,0.08);border-radius:10px;cursor:pointer;margin-bottom:8px;">
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
		<div id="sqDAddrPickerOverlay" style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9000;display:flex;align-items:center;justify-content:center;padding:20px;">
			<div style="background:#fff;border-radius:16px;width:100%;max-width:520px;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 24px 64px rgba(0,0,0,0.18);">
				<div style="padding:18px 22px 14px;border-bottom:1px solid rgba(0,0,0,0.08);display:flex;align-items:center;justify-content:space-between;">
					<div style="font-family:Syne,sans-serif;font-size:15px;font-weight:700;color:#111827;display:flex;align-items:center;gap:8px;"><i class="ti ${slot.icon}" style="color:${slot.accent};"></i> Select ${me.escapeAttr(slot.label)}</div>
					<button id="sqDAddrClose" style="width:30px;height:30px;border-radius:50%;border:1px solid rgba(0,0,0,0.1);background:transparent;color:#9ca3af;cursor:pointer;font-size:15px;display:flex;align-items:center;justify-content:center;"><i class="ti ti-x"></i></button>
				</div>
				<div style="flex:1;overflow-y:auto;padding:16px 22px;">${rows}</div>
				<div style="padding:12px 22px;border-top:1px solid rgba(0,0,0,0.08);display:flex;justify-content:flex-end;background:#f8fafc;">
					<button id="sqDAddrCancel" style="padding:8px 16px;border-radius:6px;border:1px solid rgba(0,0,0,0.1);background:#fff;font-size:13px;cursor:pointer;color:#374151;">Cancel</button>
				</div>
			</div>
		</div>`);
		$("body").append($overlay);
		$overlay.on("click", ".sq-daddr-pick", function () {
			const a = list[parseInt($(this).data("ai"))];
			if (a) { me.detailRecord[slot.field] = a.name; me._saveDetailField(slot.field, a.name, "Address updated."); me.renderDetailAddressSlot(slotKey); }
			$overlay.remove();
		});
		$overlay.on("mouseenter", ".sq-daddr-pick", function () { $(this).css({ "border-color": slot.accent, "background": slot.accent + "0a" }); })
			.on("mouseleave", ".sq-daddr-pick", function () { $(this).css({ "border-color": "rgba(0,0,0,0.08)", "background": "" }); });
		$overlay.on("click", "#sqDAddrClose, #sqDAddrCancel", () => $overlay.remove());
		$overlay.on("click", (e) => { if ($(e.target).is($overlay)) $overlay.remove(); });
	}
 
	// ─── ITEMS ────────────────────────────────────────────
// 	injectDetailItems() {
// 		const me = this;
// 		me.$content.find("#sqItemsSaveBar").hide();
// 		const record = this.detailRecord || {};
// 		const items = Array.isArray(record.items) ? record.items : [];
// 		const $wrap = this.$content.find("#sqItemsTableBody");
// 		const editable = Number(record.docstatus || 0) === 0; // editable only in Draft
 
// 		if (!items.length) {
// 			$wrap.html(`<div style="text-align:center;padding:32px;color:#9ca3af;font-size:12px;"><i class="ti ti-inbox" style="font-size:26px;display:block;margin-bottom:8px;"></i>No items on this supplier quotation</div>`);
// 			this.$content.find("#sqItemsTotalQty").text("0");
// 			return;
// 		}
// 		const fmtINR = n => Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
 
// 		let cards = "";
// 		items.forEach((item, idx) => {
// 			const qty = Number(item.qty || 0);
// 			const rate = Number(item.rate || 0);
// 			const amt = Number(item.amount || (qty * rate));
// 			const hasDesc = item.description && String(item.description).replace(/<[^>]*>/g, "").trim().length > 0;
// 			cards += `
// <div class="sq-di-card" data-idx="${idx}">
// 	<div class="sq-ic-row1">
// 		<div class="sq-ic-num">${idx + 1}</div>
// 		<div class="sq-ic-item">
// 			<div class="sq-ic-name">${me.escapeAttr(item.item_name || item.item_code || "—")}</div>
// 			<div class="sq-ic-sub">${item.item_code ? me.escapeAttr(item.item_code) : ""}</div>
// 		</div>
// 		<div class="sq-ic-field" style="width:70px;">
// 			<label class="sq-ic-label">Qty</label>
// 			${editable ? `<input class="sq-di-qty sq-ic-input" type="number" min="1" step="1" value="${qty}" style="text-align:right;">` : `<div class="sq-ic-roval" style="text-align:right;">${qty.toLocaleString("en-IN")}</div>`}
// 		</div>
// 		<div class="sq-ic-field" style="width:80px;">
// 			<label class="sq-ic-label">UOM</label>
// 			<div class="sq-ic-roval">${me.escapeAttr(item.uom || item.stock_uom || "Nos")}</div>
// 		</div>
// 		<div class="sq-ic-field" style="width:140px;">
// 			<label class="sq-ic-label">Rate (₹)</label>
// 			${editable ? `<input class="sq-di-rate sq-ic-input" type="number" min="0" step="0.01" value="${rate}" style="text-align:right;">` : `<div class="sq-ic-roval" style="text-align:right;">₹${fmtINR(rate)}</div>`}
// 		</div>
// 		<div class="sq-ic-field" style="width:160px;">
// 			<label class="sq-ic-label">Amount (₹)</label>
// 			<div class="sq-ic-roval sq-ic-amt sq-di-amt" style="text-align:right;">₹${fmtINR(amt)}</div>
// 		</div>
// 		<div class="sq-ic-field" style="width:34px;align-items:center;margin-left:auto;">
// 			<label class="sq-ic-label">Desc</label>
// 			<button class="sq-di-desc-btn ${hasDesc ? "has-desc" : ""}" data-idx="${idx}" type="button"><i class="ti ${hasDesc ? "ti-file-check" : "ti-file-text"}"></i></button>
// 		</div>
// 		${editable ? `
// 		<div class="sq-ic-field" style="width:34px;align-items:center;">
// 			<label class="sq-ic-label">&nbsp;</label>
// 			<button class="sq-di-del-btn" data-idx="${idx}" type="button"><i class="ti ti-trash"></i></button>
// 		</div>` : ""}
// 	</div>
// </div>`;
// 		});
// 		$wrap.html(cards);
 
// 		me.$content.off("input.sqDIEdit", "#sqItemsTableBody .sq-di-qty, #sqItemsTableBody .sq-di-rate")
// 			.on("input.sqDIEdit", "#sqItemsTableBody .sq-di-qty, #sqItemsTableBody .sq-di-rate", (e) => {
// 				const $card = $(e.currentTarget).closest(".sq-di-card");
// 				const idx = parseInt($card.data("idx"));
// 				if (!Number.isFinite(idx) || !items[idx]) return;
// 				const q = parseFloat($card.find(".sq-di-qty").val()) || 0;
// 				const r = parseFloat($card.find(".sq-di-rate").val()) || 0;
// 				items[idx].qty = q; items[idx].rate = r; items[idx].amount = q * r;
// 				$card.find(".sq-di-amt").text("₹" + fmtINR(q * r));
// 				me.$content.find("#sqItemsSaveBar").css("display", "flex");
// 			});
 
// 		const totalQty = items.reduce((s, it) => s + Number(it.qty || 0), 0);
// 		this.$content.find("#sqItemsTotalQty").text(totalQty.toLocaleString("en-IN"));
 
// 		me.$content.off("click.sqDIDesc", "#sqItemsTableBody .sq-di-desc-btn")
// 			.on("click.sqDIDesc", "#sqItemsTableBody .sq-di-desc-btn", (e) => { e.stopPropagation(); me.openDetailDescEdit(parseInt($(e.currentTarget).data("idx"))); });
 
// 		me.$content.off("click.sqDIDel", "#sqItemsTableBody .sq-di-del-btn")
// 			.on("click.sqDIDel", "#sqItemsTableBody .sq-di-del-btn", (e) => {
// 				e.stopPropagation();
// 				const idx = parseInt($(e.currentTarget).data("idx"));
// 				const nm = (items[idx] && (items[idx].item_name || items[idx].item_code)) || `Item ${idx + 1}`;
// 				me._showDeleteConfirm(nm, () => me._deleteDetailItem(idx));
// 			});
// 	}

injectDetailItems() {
		const me = this;
		const REC_FIELD = "_recommended";                       // ◄ NEW: child checkbox fieldname
		me.$content.find("#sqItemsSaveBar").hide();
		const record = this.detailRecord || {};
		const items = Array.isArray(record.items) ? record.items : [];
		const $wrap = this.$content.find("#sqItemsTableBody");
		const editable = Number(record.docstatus || 0) === 0; // editable only in Draft
 
		if (!items.length) {
			$wrap.html(`<div style="text-align:center;padding:32px;color:#9ca3af;font-size:12px;"><i class="ti ti-inbox" style="font-size:26px;display:block;margin-bottom:8px;"></i>No items on this supplier quotation</div>`);
			this.$content.find("#sqItemsTotalQty").text("0");
			return;
		}
		const fmtINR = n => Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
 
		let cards = "";
		items.forEach((item, idx) => {
			const qty = Number(item.qty || 0);
			const rate = Number(item.rate || 0);
			const amt = Number(item.amount || (qty * rate));
			const hasDesc = item.description && String(item.description).replace(/<[^>]*>/g, "").trim().length > 0;
			const recommended = !!item[REC_FIELD];               // ◄ NEW
			cards += `
<div class="sq-di-card ${recommended ? "sq-di-rec-on" : ""}" data-idx="${idx}">
	<div class="sq-ic-row1">
		<div class="sq-ic-num">${idx + 1}</div>
		<div class="sq-ic-item">
			<div class="sq-ic-name">${me.escapeAttr(item.item_name || item.item_code || "—")}</div>
			<div class="sq-ic-sub">${item.item_code ? me.escapeAttr(item.item_code) : ""}</div>
		</div>
		<div class="sq-ic-field" style="width:70px;">
			<label class="sq-ic-label">Qty</label>
			${editable ? `<input class="sq-di-qty sq-ic-input" type="number" min="1" step="1" value="${qty}" style="text-align:right;">` : `<div class="sq-ic-roval" style="text-align:right;">${qty.toLocaleString("en-IN")}</div>`}
		</div>
		<div class="sq-ic-field" style="width:80px;">
			<label class="sq-ic-label">UOM</label>
			<div class="sq-ic-roval">${me.escapeAttr(item.uom || item.stock_uom || "Nos")}</div>
		</div>
		<div class="sq-ic-field" style="width:140px;">
			<label class="sq-ic-label">Rate (₹)</label>
			${editable ? `<input class="sq-di-rate sq-ic-input" type="number" min="0" step="0.01" value="${rate}" style="text-align:right;">` : `<div class="sq-ic-roval" style="text-align:right;">₹${fmtINR(rate)}</div>`}
		</div>
		<div class="sq-ic-field" style="width:160px;">
			<label class="sq-ic-label">Amount (₹)</label>
			<div class="sq-ic-roval sq-ic-amt sq-di-amt" style="text-align:right;">₹${fmtINR(amt)}</div>
		</div>
 
		<!-- ◄ NEW: Recommended checkbox cell (margin-left:auto moved here from Desc) -->
		<div class="sq-ic-field" style="width:50px;align-items:center;margin-left:auto;">
			<label class="sq-ic-label">Rec.</label>
			${editable
				? `<div style="height:30px;display:flex;align-items:center;justify-content:center;"><input class="sq-di-rec" type="checkbox" data-idx="${idx}" ${recommended ? "checked" : ""} style="width:17px;height:17px;accent-color:#16a34a;cursor:pointer;margin:0;"></div>`
				: `<div style="height:30px;display:flex;align-items:center;justify-content:center;">${recommended ? '<i class="ti ti-circle-check" style="color:#16a34a;font-size:17px;"></i>' : '<span style="color:#cbd5e1;">—</span>'}</div>`}
		</div>
 
		<div class="sq-ic-field" style="width:34px;align-items:center;">
			<label class="sq-ic-label">Desc</label>
			<button class="sq-di-desc-btn ${hasDesc ? "has-desc" : ""}" data-idx="${idx}" type="button"><i class="ti ${hasDesc ? "ti-file-check" : "ti-file-text"}"></i></button>
		</div>
		${editable ? `
		<div class="sq-ic-field" style="width:34px;align-items:center;">
			<label class="sq-ic-label">&nbsp;</label>
			<button class="sq-di-del-btn" data-idx="${idx}" type="button"><i class="ti ti-trash"></i></button>
		</div>` : ""}
	</div>
</div>`;
		});
		$wrap.html(cards);
 
		me.$content.off("input.sqDIEdit", "#sqItemsTableBody .sq-di-qty, #sqItemsTableBody .sq-di-rate")
			.on("input.sqDIEdit", "#sqItemsTableBody .sq-di-qty, #sqItemsTableBody .sq-di-rate", (e) => {
				const $card = $(e.currentTarget).closest(".sq-di-card");
				const idx = parseInt($card.data("idx"));
				if (!Number.isFinite(idx) || !items[idx]) return;
				const q = parseFloat($card.find(".sq-di-qty").val()) || 0;
				const r = parseFloat($card.find(".sq-di-rate").val()) || 0;
				items[idx].qty = q; items[idx].rate = r; items[idx].amount = q * r;
				$card.find(".sq-di-amt").text("₹" + fmtINR(q * r));
				me.$content.find("#sqItemsSaveBar").css("display", "flex");
			});
 
		// ◄ NEW: Recommended toggle handler
		// me.$content.off("change.sqDIRec", "#sqItemsTableBody .sq-di-rec")
		// 	.on("change.sqDIRec", "#sqItemsTableBody .sq-di-rec", (e) => {
		// 		const idx = parseInt($(e.currentTarget).data("idx"));
		// 		if (!Number.isFinite(idx) || !items[idx]) return;
		// 		const on = $(e.currentTarget).prop("checked");
		// 		items[idx][REC_FIELD] = on ? 1 : 0;
		// 		const $card = $(e.currentTarget).closest(".sq-di-card");
		// 		$card.toggleClass("sq-di-rec-on", on);
		// 		// live-update the inline tag without a full re-render
		// 		const $name = $card.find(".sq-ic-name");
		// 		$name.find(".sq-rec-tag").remove();
		// 		if (on) $name.append(` <span class="sq-rec-tag" style="display:inline-flex;align-items:center;gap:3px;margin-left:6px;padding:1px 8px;border-radius:12px;background:rgba(22,163,74,0.12);color:#16a34a;font-size:9px;font-weight:700;letter-spacing:.03em;vertical-align:middle;"><i class="ti ti-star-filled" style="font-size:9px;"></i>RECOMMENDED</span>`);
		// 		me.$content.find("#sqItemsSaveBar").css("display", "flex");
		// 	});
		me.$content.off("change.sqDIRec", "#sqItemsTableBody .sq-di-rec")
			.on("change.sqDIRec", "#sqItemsTableBody .sq-di-rec", (e) => {
				const idx = parseInt($(e.currentTarget).data("idx"));
				if (!Number.isFinite(idx) || !items[idx]) return;
				items[idx][REC_FIELD] = $(e.currentTarget).prop("checked") ? 1 : 0;
				me.$content.find("#sqItemsSaveBar").css("display", "flex");
			});
 
		const totalQty = items.reduce((s, it) => s + Number(it.qty || 0), 0);
		this.$content.find("#sqItemsTotalQty").text(totalQty.toLocaleString("en-IN"));
 
		me.$content.off("click.sqDIDesc", "#sqItemsTableBody .sq-di-desc-btn")
			.on("click.sqDIDesc", "#sqItemsTableBody .sq-di-desc-btn", (e) => { e.stopPropagation(); me.openDetailDescEdit(parseInt($(e.currentTarget).data("idx"))); });
 
		me.$content.off("click.sqDIDel", "#sqItemsTableBody .sq-di-del-btn")
			.on("click.sqDIDel", "#sqItemsTableBody .sq-di-del-btn", (e) => {
				e.stopPropagation();
				const idx = parseInt($(e.currentTarget).data("idx"));
				const nm = (items[idx] && (items[idx].item_name || items[idx].item_code)) || `Item ${idx + 1}`;
				me._showDeleteConfirm(nm, () => me._deleteDetailItem(idx));
			});
	}
 
	saveDetailItems() {
		const me = this;
		const record = me.detailRecord || {};
		const editedItems = Array.isArray(record.items) ? record.items : [];
		frappe.call({
			method: "frappe.client.get",
			args: { doctype: "Supplier Quotation", name: record.name },
			callback: (r) => {
				const doc = r.message;
				if (!doc) return;
				const REC_FIELD = "_recommended";   // ← keep identical to injectDetailItems
				let netTotal = 0;
				doc.items.forEach((row, i) => {
					if (editedItems[i]) {
						row.qty = editedItems[i].qty;
						row.rate = editedItems[i].rate;
						row.amount = editedItems[i].qty * editedItems[i].rate;
						row.base_rate = editedItems[i].rate;
						row.base_amount = editedItems[i].qty * editedItems[i].rate;
						row.net_rate = editedItems[i].rate;
						row.net_amount = editedItems[i].qty * editedItems[i].rate;
						row[REC_FIELD] = editedItems[i][REC_FIELD] ? 1 : 0;   // ← must be here
					}
					netTotal += Number(row.amount || 0);
				});
				doc.total = doc.net_total = doc.base_total = doc.base_net_total = netTotal;
				let totalTax = 0;
				(doc.taxes || []).forEach(t => {
					if (t.charge_type === "On Net Total") {
						const amt = netTotal * Number(t.rate || 0) / 100;
						t.tax_amount = t.base_tax_amount = amt;
						totalTax += amt;
						t.total = t.base_total = netTotal + totalTax;
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
							me.$content.find("#sqItemsSaveBar").hide();
							me.injectDetailItems();
							me.injectDetailFinancialsSummary();
							me.injectDetailHeader();
							frappe.show_alert({ message: "Updated.", indicator: "green" });
						}
					},
					error: () => frappe.show_alert({ message: "Save failed.", indicator: "red" }),
				});
			},
		});
	}
 
	_deleteDetailItem(idx) {
		const me = this;
		const record = me.detailRecord || {};
		frappe.call({
			method: "frappe.client.get",
			args: { doctype: "Supplier Quotation", name: record.name },
			callback: (r) => {
				const doc = r.message;
				if (!doc || !Array.isArray(doc.items) || !doc.items[idx]) return;
				doc.items.splice(idx, 1);
				frappe.call({
					method: "frappe.client.save",
					args: { doc },
					callback: (r2) => {
						if (r2.message) { me.detailRecord = r2.message; me.injectDetailItems(); me.injectDetailFinancialsSummary(); me.injectDetailHeader(); frappe.show_alert({ message: "Item removed.", indicator: "green" }); }
					},
					error: () => frappe.show_alert({ message: "Failed to remove item.", indicator: "red" }),
				});
			},
		});
	}
 
	openDetailDescEdit(idx) {
		const me = this;
		const record = me.detailRecord || {};
		const items = Array.isArray(record.items) ? record.items : [];
		const item = items[idx];
		if (!item) return;
		$("#sqDIDescOverlay").remove();
		const itemName = item.item_name || item.item_code || `Item ${idx + 1}`;
		const editable = Number(record.docstatus || 0) === 0;
		const $overlay = $(`
		<div id="sqDIDescOverlay" style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9000;display:flex;align-items:center;justify-content:center;padding:20px;">
			<div style="background:#fff;border-radius:16px;width:100%;max-width:640px;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 24px 64px rgba(0,0,0,0.18);">
				<div style="padding:16px 20px 12px;border-bottom:1px solid rgba(0,0,0,0.08);display:flex;align-items:center;justify-content:space-between;">
					<div><div style="font-family:Syne,sans-serif;font-size:15px;font-weight:700;color:#111827;display:flex;align-items:center;gap:8px;"><i class="ti ti-align-left" style="color:#4f46e5;"></i> ${editable ? "Edit" : "View"} Description</div>
						<div style="font-size:11px;color:#9ca3af;margin-top:2px;max-width:560px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${me.escapeAttr(itemName)}</div></div>
					<button id="sqDIDescClose" style="width:28px;height:28px;border-radius:50%;border:1px solid rgba(0,0,0,0.1);background:transparent;color:#9ca3af;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;"><i class="ti ti-x"></i></button>
				</div>
				<div style="flex:1;overflow-y:auto;padding:16px 20px;"><div id="sqDIDescEditorHost"></div></div>
				<div style="padding:12px 20px;border-top:1px solid rgba(0,0,0,0.08);background:#f8fafc;display:flex;justify-content:flex-end;gap:8px;">
					<button id="sqDIDescCancel" style="padding:7px 16px;border-radius:6px;border:1px solid rgba(0,0,0,0.1);background:#fff;font-size:13px;cursor:pointer;color:#374151;">Close</button>
					${editable ? `<button id="sqDIDescSave" style="padding:7px 18px;border-radius:6px;border:none;background:#4f46e5;color:#fff;font-size:13px;font-weight:600;cursor:pointer;"><i class="ti ti-check" style="margin-right:4px;"></i> Save</button>` : ""}
				</div>
			</div>
		</div>`);
		$("body").append($overlay);
		const ctrl = frappe.ui.form.make_control({ parent: $overlay.find("#sqDIDescEditorHost").get(0), df: { fieldname: "sq_di_desc", fieldtype: "Text Editor", label: "" }, render_input: true });
		ctrl.set_value(item.description || "");
		if (!editable) try { ctrl.$input && ctrl.$input.attr("contenteditable", "false"); } catch (e) { }
		const close = () => $overlay.remove();
		$overlay.on("click", "#sqDIDescClose, #sqDIDescCancel", close);
		$overlay.on("click", (e) => { if ($(e.target).is($overlay)) close(); });
		$overlay.on("click", "#sqDIDescSave", () => {
			const newDesc = ctrl.get_value() || "";
			frappe.call({
				method: "frappe.client.get",
				args: { doctype: "Supplier Quotation", name: record.name },
				callback: (r) => {
					const doc = r.message;
					if (!doc || !Array.isArray(doc.items) || !doc.items[idx]) { close(); return; }
					doc.items[idx].description = newDesc;
					frappe.call({
						method: "frappe.client.save",
						args: { doc },
						callback: (r2) => {
							if (r2.message) { me.detailRecord = r2.message; me.injectDetailItems(); frappe.show_alert({ message: "Description updated.", indicator: "green" }); }
							close();
						},
						error: () => { frappe.show_alert({ message: "Failed to save.", indicator: "red" }); close(); },
					});
				},
			});
		});
	}
 
	injectDetailFinancialsSummary() {
		const me = this;
		const record = this.detailRecord || {};
		const toNum = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
		const fmt = n => me.formatCurrency(n);
		const subtotal = toNum(record.net_total || record.total);
		const tax = toNum(record.total_taxes_and_charges);
		const grand = toNum(record.grand_total || record.rounded_total);
 
		this.$content.find("#sqNetTotal").html(`<span class="currency">₹</span>${(subtotal).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
		this.$content.find("#sqTaxTotal").text(fmt(tax));
		this.$content.find("#sqGrandTotal").text(fmt(grand));
		this.$content.find("#sqSumSubtotal").text(fmt(subtotal));
		this.$content.find("#sqSumTax").text(fmt(tax));
		this.$content.find("#sqSumGrandTotal").text(fmt(grand));
	}
 
	// ─── PAYMENT SCHEDULE (read-only) ─────────────────────
	injectPaymentSchedule() {
		const me = this;
		const record = this.detailRecord || {};
		const $body = this.$content.find("#sqPaymentScheduleBody");
		if (!$body.length) return;
		this.$content.find("#sqPayTermsName").text(record.payment_terms_template || "");
		const sched = Array.isArray(record.payment_schedule) ? record.payment_schedule : [];
		if (!sched.length) {
			$body.html(`<div style="padding:16px;text-align:center;color:#9ca3af;font-size:12px;">No payment schedule set.</div>`);
			return;
		}
		const fmt = n => me.formatCurrency(n);
		const rows = sched.map((p, i) => `
			<tr style="border-bottom:1px solid rgba(0,0,0,0.06);">
				<td style="padding:9px 10px;color:#9ca3af;font-size:11px;text-align:center;">${i + 1}</td>
				<td style="padding:9px 10px;font-size:12px;color:#111827;">${me.escapeAttr(p.description || p.payment_term || "—")}</td>
				<td style="padding:9px 10px;font-size:12px;color:#374151;text-align:right;">${Number(p.credit_days || 0) > 0 ? p.credit_days + " days" : "On invoice"}</td>
				<td style="padding:9px 10px;font-size:12px;color:#374151;text-align:right;">${Number(p.invoice_portion || 0)}%</td>
				<td style="padding:9px 10px;font-size:12px;text-align:right;font-weight:700;color:#4f46e5;">${fmt(p.payment_amount)}</td>
			</tr>`).join("");
		$body.html(`
			<div style="border:1px solid rgba(0,0,0,0.08);border-radius:10px;overflow:hidden;">
				<table style="width:100%;border-collapse:collapse;">
					<thead><tr style="background:#f8fafc;">
						<th style="padding:10px;width:42px;font-size:11px;font-weight:600;color:#6b7280;text-align:center;">No.</th>
						<th style="padding:10px;font-size:11px;font-weight:600;color:#6b7280;text-align:left;">Payment Term</th>
						<th style="padding:10px;font-size:11px;font-weight:600;color:#6b7280;text-align:right;">Due Days</th>
						<th style="padding:10px;font-size:11px;font-weight:600;color:#6b7280;text-align:right;">Portion</th>
						<th style="padding:10px;font-size:11px;font-weight:600;color:#6b7280;text-align:right;">Amount</th>
					</tr></thead>
					<tbody>${rows}</tbody>
				</table>
			</div>`);
	}
 
	// ─── CONNECTIONS → Purchase Orders ────────────────────
	injectConnections() {
		const me = this;
		const record = me.detailRecord || {};
		const $card = me.$content.find("#sqConnectionsCard");
		if (Number(record.docstatus || 0) !== 1) { $card.hide(); return; }
		$card.show();
		frappe.call({
			method: "frappe.client.get_list",
			args: {
				doctype: "Purchase Order Item",
				filters: [["Purchase Order Item", "supplier_quotation", "=", record.name]],
				fields: ["parent"], limit_page_length: 200,
			},
			callback: (r) => {
				const pos = Array.from(new Set((r.message || []).map(x => x.parent).filter(Boolean)));
				me._renderConnections({ po: pos });
			},
			error: () => me._renderConnections({ po: [] }),
		});
	}
 
	_renderConnections(results) {
		const me = this;
		const $body = me.$content.find("#sqConnectionsBody");
		const group = (label, icon, color, names) => {
			if (!names.length) return "";
			const chips = names.map(n => `
				<div class="sq-conn-chip" data-name="${me.escapeAttr(n)}" style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border:1px solid rgba(0,0,0,0.1);border-radius:8px;background:#fff;cursor:pointer;font-size:12px;font-weight:600;color:#111827;">
					<i class="ti ${icon}" style="color:${color};font-size:14px;"></i> ${me.escapeAttr(n)}
				</div>`).join("");
			return `<div><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;margin-bottom:8px;">${label} <span style="color:#cbd5e1;">(${names.length})</span></div><div style="display:flex;flex-wrap:wrap;gap:8px;">${chips}</div></div>`;
		};
		const html = group("Purchase Orders", "ti-clipboard-check", "#16a34a", results.po) ||
			`<div style="padding:16px;text-align:center;color:#9ca3af;font-size:12px;">No linked documents yet.</div>`;
		$body.html(html);
		$body.off("click.sqConn", ".sq-conn-chip").on("click.sqConn", ".sq-conn-chip", function () {
			frappe.set_route("Form", "Purchase Order", $(this).data("name"));
		});
	}
 
	// ─── ACTIVITY (Comments) + ATTACHMENTS ────────────────
	injectDetailActivities() {
		const me = this;
		const $list = this.$content.find("#activityList");
		if (!$list.length) return;
		$list.empty();
		if (!this.detailActivities.length) {
			$list.html('<div style="padding:20px;text-align:center;color:#9ca3af;font-size:12px;">No comments yet</div>');
			return;
		}
		this.detailActivities.forEach((a) => {
			$list.append(`
			<div class="act-item" data-tab="comments" style="display:flex;align-items:flex-start;gap:12px;padding:12px 16px;border-bottom:1px solid rgba(0,0,0,0.05);">
				<div style="width:30px;height:30px;border-radius:8px;background:rgba(79,70,229,0.12);color:#4f46e5;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;margin-top:1px;"><i class="ti ti-message-circle"></i></div>
				<div style="flex:1;min-width:0;">
					<div style="font-size:13px;color:#111827;line-height:1.5;word-break:break-word;">${me.escapeAttr(a.title)}</div>
					<div style="font-size:11px;color:#9ca3af;margin-top:3px;"><span>${me.escapeAttr(a.owner)}</span> · <span>${a.created}</span></div>
				</div>
				<span style="font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;background:rgba(79,70,229,0.12);color:#4f46e5;white-space:nowrap;">Comment</span>
			</div>`);
		});
		this.applyFilter();
	}
 
	injectDetailAttachments() {
		const me = this;
		const $list = this.$content.find("#sqAttFileList");
		if (!$list.length) return;
		const extIcon = (name) => {
			const ext = (name || "").split(".").pop().toLowerCase();
			return { pdf: "ti-file-type-pdf", doc: "ti-file-type-doc", docx: "ti-file-type-doc", xls: "ti-file-spreadsheet", xlsx: "ti-file-spreadsheet", png: "ti-photo", jpg: "ti-photo", jpeg: "ti-photo" }[ext] || "ti-file";
		};
		const fmtSize = (b) => { if (!b) return ""; if (b < 1024) return `${b} B`; if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`; return `${(b / 1048576).toFixed(1)} MB`; };
		const renderFiles = () => {
			if (!me.detailAttachments.length) { $list.html(`<div style="text-align:center;padding:8px;font-size:12px;color:#9ca3af;">No attachments yet</div>`); return; }
			$list.html(me.detailAttachments.map(f => `
				<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:#f8fafc;border:1px solid rgba(0,0,0,0.07);border-radius:8px;">
					<i class="ti ${extIcon(f.name)}" style="font-size:20px;color:#4f46e5;flex-shrink:0;"></i>
					<div style="flex:1;min-width:0;">
						<a href="${me.escapeAttr(f.url)}" target="_blank" style="font-size:12px;font-weight:600;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;text-decoration:none;">${me.escapeAttr(f.name)}</a>
						<div style="font-size:10px;color:#9ca3af;margin-top:1px;">${fmtSize(f.size)}${f.size ? " · " : ""}${me.escapeAttr(f.owner)} · ${f.created}</div>
						${f.description ? `<div style="font-size:11px;color:#374151;margin-top:3px;font-style:italic;">${me.escapeAttr(f.description)}</div>` : ""}
					</div>
					<a href="${me.escapeAttr(f.url)}" download="${me.escapeAttr(f.name)}" style="width:26px;height:26px;border-radius:6px;border:1px solid rgba(0,0,0,0.1);background:#fff;display:flex;align-items:center;justify-content:center;color:#6b7280;text-decoration:none;flex-shrink:0;" title="Download"><i class="ti ti-download" style="font-size:13px;"></i></a>
				</div>`).join(""));
		};
		renderFiles();
		this.$content.off("click.sqAtt", "#sqAttUploadZone").on("click.sqAtt", "#sqAttUploadZone", () => {
			const record = me.detailRecord || me.selectedRecord;
			if (!record?.name) return;
			const description = me.$content.find("#sqAttDescription").val().trim();
			new frappe.ui.FileUploader({
				doctype: "Supplier Quotation", docname: record.name,
				on_success: (file) => {
					if (description && file.name) {
						frappe.call({ method: "frappe.client.insert", args: { doc: { doctype: "Comment", comment_type: "Info", reference_doctype: "File", reference_name: file.name, content: description } } });
					}
					me.detailAttachments.unshift({ id: file.name, name: file.file_name || file.name, url: file.file_url || "", size: file.file_size || 0, owner: frappe.session.user, created: "Just now", description });
					me.$content.find("#sqAttDescription").val("");
					renderFiles();
					frappe.show_alert({ message: "File uploaded!", indicator: "green" });
				},
			});
		});
	}
 
	// ─── ACTIVITY TABS (Comments | Attachments) ───────────
	bindActivityFilters() {
		const me = this;
		const $tabs = this.$content.find("#actTabs");
		const $actHeader = $tabs.closest(".card");
		$actHeader.off("click.sqTab", ".act-tab").on("click.sqTab", ".act-tab", (e) => {
			const tab = String($(e.currentTarget).data("tab") || "comments");
			$actHeader.find(".act-tab").removeClass("active");
			$(e.currentTarget).addClass("active");
			me.activeTab = tab;
			me.applyFilter();
		});
		$actHeader.find(".act-tab").removeClass("active");
		$actHeader.find(`.act-tab[data-tab="${me.activeTab}"]`).addClass("active");
		this.applyFilter();
	}
 
	applyFilter() {
		const isAttach = this.activeTab === "attachments";
		this.$content.find("#activityList").toggle(!isAttach);
		this.$content.find("#attachmentsPanel").toggleClass("hidden", !isAttach).toggle(isAttach);
		this.$content.find("#actBottom").toggle(!isAttach);
		this.closeAllInputs();
		this.renderBottomBtn();
	}
 
	renderBottomBtn() {
		const $bottom = this.$content.find("#actBottom");
		if (this.activeTab !== "comments") { $bottom.empty(); return; }
		$bottom.html(`<button class="add-btn" type="button" data-toggle-input="comments"><i class="ti ti-message-circle"></i> + Comment</button>`);
	}
 
	closeAllInputs() { this.$content.find(".act-input-area").addClass("hidden").hide(); }
 
	setPageTitle() {
		const record = this.detailRecord || this.selectedRecord;
		if (!record) { document.title = "Supplier Quotations"; this.page.set_title("Supplier Quotations"); return; }
		const supplierName = this.$content.find(".customer-name").text().trim();
		document.title = supplierName ? `Supplier Quotation — ${supplierName}` : "Supplier Quotation Detail";
		this.page.set_title("");
		$(this.wrapper).find(".page-head").css("display", "none");
	}
 
	// ─── DELETE CONFIRM ───────────────────────────────────
	_showDeleteConfirm(itemName, onConfirm) {
		$("#sqDelConfirmOverlay").remove();
		const $overlay = $(`
		<div id="sqDelConfirmOverlay" style="position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:9100;display:flex;align-items:center;justify-content:center;padding:20px;">
			<div style="background:#fff;border-radius:16px;width:100%;max-width:380px;box-shadow:0 24px 64px rgba(0,0,0,0.18);overflow:hidden;">
				<div style="padding:24px 24px 0;text-align:center;">
					<div style="width:52px;height:52px;border-radius:50%;background:rgba(220,38,38,0.08);border:2px solid rgba(220,38,38,0.15);display:flex;align-items:center;justify-content:center;margin:0 auto 14px;"><i class="ti ti-trash" style="font-size:22px;color:#dc2626;"></i></div>
					<div style="font-family:'Syne',sans-serif;font-size:16px;font-weight:700;color:#111827;margin-bottom:8px;">Remove Item?</div>
					<div style="font-size:13px;color:#6b7280;line-height:1.6;">Are you sure you want to remove<br><strong style="color:#111827;">${this.escapeAttr(itemName)}</strong>?</div>
				</div>
				<div style="display:flex;gap:10px;padding:20px 24px 24px;">
					<button id="sqDelCancel" style="flex:1;height:38px;border-radius:8px;border:1px solid rgba(0,0,0,0.12);background:#f7f8fa;color:#374151;font-size:13px;cursor:pointer;">Cancel</button>
					<button id="sqDelConfirm" style="flex:1;height:38px;border-radius:8px;border:none;background:#dc2626;color:#fff;font-size:13px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;"><i class="ti ti-trash" style="font-size:14px;"></i> Remove</button>
				</div>
			</div>
		</div>`);
		$("body").append($overlay);
		const close = () => $overlay.remove();
		$overlay.on("click", "#sqDelCancel", close);
		$overlay.on("click", "#sqDelConfirm", () => { close(); onConfirm(); });
		$overlay.on("click", (e) => { if ($(e.target).is($overlay)) close(); });
	}
 
	// ─── PDF PREVIEW ──────────────────────────────────────
	openPdfPreview() {
		const record = this.detailRecord || this.selectedRecord;
		if (!record?.name) return;
		this._showPdfPreviewModal(record.name);
	}
 
	_showPdfPreviewModal(docname) {
		const me = this;
		$("#sqPdfPreviewOverlay").remove();
		const printUrl = `/printview?doctype=Supplier%20Quotation&name=${encodeURIComponent(docname)}&trigger_print=0`;
		const $overlay = $(`
		<div id="sqPdfPreviewOverlay" style="position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9000;display:flex;align-items:center;justify-content:center;padding:20px;">
			<div style="background:#fff;border-radius:14px;width:100%;max-width:880px;height:92vh;display:flex;flex-direction:column;box-shadow:0 24px 64px rgba(0,0,0,0.28);overflow:hidden;">
				<div style="padding:14px 20px;border-bottom:1px solid rgba(0,0,0,0.08);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
					<div style="font-family:Syne,sans-serif;font-size:15px;font-weight:700;color:#111827;display:flex;align-items:center;gap:8px;"><i class="ti ti-file-type-pdf" style="color:#dc2626;"></i> ${me.escapeAttr(docname)}</div>
					<div style="display:flex;gap:8px;align-items:center;">
						<button id="sqPdfPrint" style="padding:8px 18px;border-radius:6px;border:none;background:#4f46e5;color:#fff;font-size:13px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:5px;"><i class="ti ti-printer"></i> Print</button>
						<button id="sqPdfClose" style="width:32px;height:32px;border-radius:6px;border:1px solid rgba(0,0,0,0.1);background:#fff;color:#6b7280;cursor:pointer;display:flex;align-items:center;justify-content:center;"><i class="ti ti-x"></i></button>
					</div>
				</div>
				<div style="flex:1;background:#525659;position:relative;">
					<div id="sqPdfLoading" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#cbd5e1;font-size:13px;"><i class="ti ti-loader-2" style="font-size:22px;margin-right:8px;"></i> Loading preview…</div>
					<iframe id="sqPdfFrame" src="${printUrl}" style="width:100%;height:100%;border:none;position:relative;z-index:1;" onload="(function(f){var l=document.getElementById('sqPdfLoading');if(l)l.style.display='none';try{var doc=f.contentDocument||f.contentWindow.document;var st=doc.createElement('style');st.innerHTML='.action-banner{display:none !important;}';doc.head.appendChild(st);}catch(e){}})(this)"></iframe>
				</div>
			</div>
		</div>`);
		$("body").append($overlay);
		const close = () => $overlay.remove();
		$overlay.on("click", "#sqPdfClose", close);
		$overlay.on("click", (e) => { if ($(e.target).is($overlay)) close(); });
		$overlay.on("click", "#sqPdfPrint", () => {
			const frame = $overlay.find("#sqPdfFrame").get(0);
			if (frame && frame.contentWindow) { frame.contentWindow.focus(); frame.contentWindow.print(); }
		});
	}
 
	// ─── DETAIL BINDINGS (.sqD) ───────────────────────────
	bindDetailActions() {
		const me = this;
		this.$content.off("click.sqD");
 
		this.$content.on("click.sqD", ".sq-back-btn", () => frappe.set_route("supplier-quote-list"));
 
		this.$content.on("click.sqD", "#sqBtnOpenFrappe", () => {
			const record = me.detailRecord || me.selectedRecord;
			if (record?.name) frappe.set_route("Form", "Supplier Quotation", record.name);
		});
 
		this.$content.on("click.sqD", "#sqSaveItemsBtn", () => me.saveDetailItems());
 
		this.$content.on("click.sqD", "#sqBtnPdf", () => me.openPdfPreview());
 
		// Submit
		this.$content.on("click.sqD", "#sqBtnSubmit", () => {
			const record = me.detailRecord || me.selectedRecord;
			if (!record?.name) return;
			frappe.confirm("Submit this supplier quotation? Items can't be edited after submission.", () => {
				frappe.call({
					method: "frappe.client.submit",
					args: { doc: { ...me.detailRecord, docstatus: 1 } },
					callback: (r) => {
						if (r.message) { me.detailRecord = r.message; frappe.show_alert({ message: "Submitted!", indicator: "green" }); me.renderDetailView(); }
					},
					error: () => frappe.show_alert({ message: "Submit failed.", indicator: "red" }),
				});
			});
		});
 
		// Create Purchase Order (standard ERPNext mapper)
		this.$content.on("click.sqD", "#sqBtnCreatePo", () => {
			const record = me.detailRecord;
			if (!record?.name) return;
			frappe.model.open_mapped_doc({
				method: "erpnext.buying.doctype.supplier_quotation.supplier_quotation.make_purchase_order",
				source_name: record.name,
			});
		});
 
		// Connections dropdown
		this.$content.on("click.sqD", "#sqBtnConnections", (e) => {
			e.stopPropagation();
			const record = me.detailRecord;
			if (!record?.name) return;
			frappe.call({
				method: "frappe.client.get_list",
				args: { doctype: "Purchase Order Item", filters: [["Purchase Order Item", "supplier_quotation", "=", record.name]], fields: ["parent"], limit_page_length: 200 },
				callback: (r) => {
					const pos = Array.from(new Set((r.message || []).map(x => x.parent).filter(Boolean)));
					me._openConnectionsDropdown(e.currentTarget, pos);
				},
				error: () => me._openConnectionsDropdown(e.currentTarget, []),
			});
		});
 
		// Toggle comment input
		this.$content.on("click.sqD", "[data-toggle-input]", (e) => {
			const tab = String($(e.currentTarget).data("toggleInput") || "");
			if (tab !== "comments") return;
			const $el = me.$content.find("#inputComments");
			const open = $el.is(":visible");
			me.closeAllInputs();
			if (!open) { $el.removeClass("hidden").show(); $el.find("textarea").first().focus(); }
		});
		this.$content.on("click.sqD", "[data-close-tab]", () => me.$content.find("#inputComments").addClass("hidden").hide());
 
		// Save Comment (with @-mention)
		this.$content.on("click.sqD", "[data-action='save-comment']", () => {
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
					reference_doctype: "Supplier Quotation", reference_name: record?.name || "",
					content: html, comment_email: frappe.session.user,
					comment_by: frappe.session.user_fullname || frappe.session.user,
				},
				callback: (r) => {
					if (r.message) {
						me.detailActivities.unshift({ id: r.message.name, title: txt, type: "Comment", tab: "comments", owner: frappe.session.user, created: "Just now", status: "completed", meta: "" });
						me.injectDetailActivities();
						frappe.show_alert({ message: "Comment posted!", indicator: "green" });
					}
					$comment.val(""); me._mentionMap = {};
					me.$content.find("#mentionDropdown").addClass("hidden").hide();
					me.$content.find("#inputComments").addClass("hidden").hide();
					me.applyFilter();
				},
				error: () => frappe.show_alert({ message: "Failed to post comment.", indicator: "red" }),
			});
		});
 
		// @-mention autocomplete
		this.$content.on("input.sqD keyup.sqD", "#commentText", (e) => {
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
					return `<div class="mention-item" data-email="${me.escapeAttr(u.email)}" data-name="${me.escapeAttr(u.label)}"><div class="mention-avatar">${me.escapeAttr(initials)}</div><div><div class="mention-name">${me.escapeAttr(u.label)}</div><div class="mention-role">${me.escapeAttr(u.email)}</div></div></div>`;
				}).join("")).removeClass("hidden").show();
			};
			const filterAndPaint = () => {
				const users = me._mentionUsers || [];
				const filtered = q ? users.filter(u => u.label.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) : users;
				paint(filtered);
			};
			if (me._mentionUsers) filterAndPaint();
			else frappe.call({
				method: "frappe.client.get_list",
				args: { doctype: "User", filters: { enabled: 1, user_type: "System User" }, fields: ["name", "full_name"], limit_page_length: 0, order_by: "full_name asc" },
				callback: (r) => { me._mentionUsers = (r.message || []).filter(u => u.name && !["Administrator", "Guest"].includes(u.name)).map(u => ({ email: u.name, label: u.full_name || u.name })); filterAndPaint(); },
			});
		});
		this.$content.on("click.sqD", ".mention-item", (e) => {
			const $item = $(e.currentTarget);
			const email = $item.data("email"); const name = $item.data("name");
			const $dd = me.$content.find("#mentionDropdown");
			if (!email || !name) { $dd.addClass("hidden").hide(); return; }
			const ta = me.$content.find("#commentText")[0];
			const caret = ta.selectionStart;
			const beforeTxt = ta.value.slice(0, caret).replace(/@([^\s@]*)$/, "@" + name + " ");
			const after = ta.value.slice(caret);
			ta.value = beforeTxt + after;
			if (!me._mentionMap) me._mentionMap = {};
			me._mentionMap[name] = email;
			$dd.addClass("hidden").hide(); ta.focus(); ta.setSelectionRange(beforeTxt.length, beforeTxt.length);
		});
 
		$(document).off("click.sqD").on("click.sqD", (e) => {
			const $dd = me.$content.find("#mentionDropdown").get(0);
			if ((!$dd || !$dd.contains(e.target)) && e.target.id !== "commentText") me.$content.find("#mentionDropdown").addClass("hidden").hide();
		});
	}
 
	_openConnectionsDropdown(btnEl, pos) {
		const me = this;
		$("#sqConnectionsDropdown").remove();
		const rect = btnEl.getBoundingClientRect();
		const items = (pos || []).map(n => `
			<div class="sq-conn-item" data-name="${me.escapeAttr(n)}" style="display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;border-bottom:1px solid rgba(0,0,0,0.05);">
				<i class="ti ti-clipboard-check" style="color:#16a34a;font-size:16px;flex-shrink:0;"></i>
				<div style="min-width:0;"><div style="font-size:12px;font-weight:600;color:#111827;white-space:nowrap;">${me.escapeAttr(n)}</div><div style="font-size:10px;color:#9ca3af;">Purchase Order</div></div>
			</div>`).join("") || `<div style="padding:18px 16px;text-align:center;color:#9ca3af;font-size:12px;">No linked documents</div>`;
		const $dd = $(`<div id="sqConnectionsDropdown" style="position:fixed;top:${rect.bottom + 6}px;left:${rect.left}px;min-width:240px;max-width:320px;max-height:340px;overflow-y:auto;background:#fff;border:1px solid rgba(0,0,0,0.1);border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,0.15);z-index:9999;">${items}</div>`);
		$("body").append($dd);
		const ddRect = $dd[0].getBoundingClientRect();
		if (ddRect.right > window.innerWidth - 8) $dd.css({ left: "auto", right: (window.innerWidth - rect.right) + "px" });
		$dd.on("mouseenter", ".sq-conn-item", function () { $(this).css("background", "#f1f5f9"); });
		$dd.on("mouseleave", ".sq-conn-item", function () { $(this).css("background", "transparent"); });
		$dd.on("click", ".sq-conn-item", function () { $dd.remove(); frappe.set_route("Form", "Purchase Order", $(this).data("name")); });
		setTimeout(() => {
			$(document).on("click.sqConnDD", (ev) => {
				if (!$(ev.target).closest("#sqConnectionsDropdown, #sqBtnConnections").length) { $dd.remove(); $(document).off("click.sqConnDD"); }
			});
		}, 0);
	}
	// end Section A

	renderNewView() {
		$("#support-page-content").removeClass("sq-content-fixed").addClass("sq-content-scroll");
		this.$content.html(`
			<div class="sq-page"><div class="page-wrap" style="padding:40px;text-align:center;color:#9ca3af;">
				<i class="ti ti-plus" style="font-size:34px;display:block;margin-bottom:10px;color:#cbd5e1;"></i>
				<div style="font-size:14px;font-weight:600;color:#374151;margin-bottom:4px;">New Supplier Quotation wizard — coming in Part 3</div>
				<button class="btn" style="margin-top:16px;" onclick="frappe.set_route('supplier-quote-list')">← Back to list</button>
			</div></div>`);
	}
}

// ═══════════════════════════════════════════════════════════
//  HTML TEMPLATES  (detail + newForm filled in Part 2 / Part 3)
// ═══════════════════════════════════════════════════════════
frappe.supplier_quote_list_page_template = {
	detail: `
	<div class="sq-page">
	<div class="page-wrap">
 
		<!-- Breadcrumb band (buying-side indigo) -->
		<div class="doctype-band" style="position:sticky;top:0;z-index:50;width:100%;display:flex;align-items:center;gap:14px;padding:16px 22px;margin-bottom:16px;border-radius:12px;background:linear-gradient(135deg,#6366f1 0%,#4f46e5 100%);box-shadow:0 4px 14px rgba(79,70,229,0.25);">
			<div style="width:44px;height:44px;border-radius:11px;background:rgba(255,255,255,0.18);display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="ti ti-file-invoice" style="font-size:22px;color:#fff;"></i></div>
			<div style="flex:1;min-width:0;">
				<div style="font-family:Syne,sans-serif;font-size:18px;font-weight:700;color:#fff;letter-spacing:-.01em;">Supplier Quotation</div>
				<ol class="breadcrumb" style="background:transparent;padding:0;margin:2px 0 0;display:flex;align-items:center;">
					<li class="breadcrumb-item"><a href="javascript:void(0)" style="color:rgba(255,255,255,0.75);font-size:12px;">Buying</a></li>
					<li class="breadcrumb-item" style="padding-left:5px;"><a href="/app/supplier-quote-list" class="sq-back-btn" style="color:rgba(255,255,255,0.75);font-size:12px;">Supplier Quotations</a></li>
					<li class="breadcrumb-item active" style="padding-left:5px;font-size:12px;color:#fff;font-weight:600;" id="sqBreadcrumbId">—</li>
				</ol>
			</div>
		</div>
 
		<!-- Top split -->
		<div class="top-split">
			<div class="top-left1">
				<div class="subject-label" id="sqSubjectLabel" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:420px;">—</div>
				<div class="top-left-row1">
					<div class="customer-avatar">--</div>
					<div class="customer-info">
						<div class="customer-name">—</div>
						<div class="customer-sub">Owner · —</div>
					</div>
					<span class="badge" id="statusBadge"><i class="ti ti-circle-dot"></i> Draft</span>
				</div>
				<div class="fin-grid">
					<div class="fin-card"><div class="fin-label">Net Total</div><div class="fin-value" id="sqNetTotal"><span class="currency">₹</span>0.00</div></div>
					<div class="fin-card"><div class="fin-label">Taxes</div><div class="fin-value" id="sqTaxTotal">₹0.00</div></div>
					<div class="fin-card"><div class="fin-label">Grand Total</div><div class="fin-value profit" id="sqGrandTotal">₹0.00</div></div>
				</div>
			</div>
 
			<div class="top-right1">
				<div class="top-actions-row">
					<div class="header-title">Supplier Quotation Detail</div>
					<button class="btn btn-primary" id="sqBtnSubmit" type="button" title="Submit" style="background:#16a34a;border-color:transparent;"><i class="ti ti-send"></i> Submit</button>
					<div id="sqConnectionsWrap" style="position:relative;display:inline-block;">
						<button class="btn" id="sqBtnConnections" type="button" title="Connections"><i class="ti ti-link"></i> Connections <i class="ti ti-chevron-down" style="font-size:11px;"></i></button>
					</div>
					<button class="btn" id="sqBtnPdf" type="button" title="Download PDF"><i class="ti ti-file-type-pdf"></i> PDF</button>
					<div class="vdivider"></div>
					<button class="btn btn-primary" id="sqBtnCreatePo" type="button"><i class="ti ti-plus"></i> Create PO</button>
				</div>
 
				<div style="display:flex;flex-direction:column;gap:0;">
					<div style="display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid rgba(0,0,0,0.06);">
						<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-right:1px solid rgba(0,0,0,0.06);">
							<span class="sq-mi-label"><i class="ti ti-calendar"></i> Date</span>
							<span class="sq-mi-val" id="sqMetaTxnDate">—</span>
						</div>
						<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;">
							<span class="sq-mi-label"><i class="ti ti-calendar-due"></i> Valid Till</span>
							<span class="sq-mi-val" id="sqMetaValidTill">—</span>
						</div>
					</div>
					<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;">
						<span class="sq-mi-label"><i class="ti ti-building"></i> Company</span>
						<div style="position:relative;display:flex;align-items:center;gap:6px;justify-content:flex-start;flex:1;min-width:0;">
							<a id="sqCompanyOpen" href="#" target="_blank" style="display:none;order:2;flex-shrink:0;color:#4f46e5;text-decoration:none;align-items:center;justify-content:center;" title="Open Company"><i class="ti ti-external-link" style="font-size:14px;"></i></a>
							<input id="sqMetaCompanyInput" placeholder="Search company…" autocomplete="off" style="width:100%;max-width:calc(100% - 26px);border:none;border-bottom:1px dashed transparent;background:transparent;outline:none;font-size:14px;font-weight:500;text-align:right;color:#111827;" onfocus="this.style.borderColor='#4f46e5';" onblur="this.style.borderColor='transparent';">
							<div id="sqMetaCompanyDD" style="display:none;position:absolute;top:calc(100% + 4px);left:0;width:240px;max-height:200px;overflow-y:auto;background:#fff;border:1px solid rgba(0,0,0,0.1);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.1);z-index:200;"></div>
						</div>
					</div>
				</div>
			</div>
		</div>
 
		<!-- SUPPLIER -->
		<div class="card">
			<div class="section-head"><div class="section-title">Supplier</div></div>
			<div id="sqSupplierCard"></div>
		</div>
 
		<!-- ADDRESS -->
		<div class="card">
			<div class="section-head"><div class="section-title">Address</div></div>
			<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:6px;">
				<div><label class="sq-field-label" style="display:block;margin-bottom:8px;">Supplier Address</label><div id="sqDetailSupAddrCard"></div></div>
				<div><label class="sq-field-label" style="display:block;margin-bottom:8px;">Shipping Address</label><div id="sqDetailShipAddrCard"></div></div>
			</div>
		</div>
 
		<!-- ITEMS -->
		<div class="card">
			<div class="section-head"><div class="section-title">Items</div></div>
			<div style="border:1px solid rgba(0,0,0,0.08);border-radius:10px;overflow:hidden;background:#f8fafc;">
				<div id="sqItemsTableBody" style="max-height:460px;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:10px;">
					<div style="text-align:center;padding:32px;color:#9ca3af;font-size:12px;">Loading...</div>
				</div>
			</div>
			<div id="sqItemsSaveBar" style="display:none;margin-top:12px;padding:10px 14px;background:rgba(79,70,229,0.08);border:1px solid rgba(79,70,229,0.25);border-radius:8px;align-items:center;justify-content:space-between;">
				<span style="font-size:12px;color:#4f46e5;font-weight:600;">You have unsaved changes</span>
				<button class="btn btn-primary" id="sqSaveItemsBtn" type="button" style="background:#4f46e5;border-color:transparent;"><i class="ti ti-device-floppy"></i> Save Items</button>
			</div>
			<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-top:14px;padding-top:12px;border-top:1px solid rgba(0,0,0,0.08);">
				<div style="display:flex;align-items:center;gap:12px;">
					<span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;">Total Qty</span>
					<span id="sqItemsTotalQty" style="font-family:'Syne',sans-serif;font-size:18px;font-weight:700;color:#111827;">0</span>
				</div>
				<div style="min-width:260px;">
					<div style="display:flex;justify-content:space-between;padding:5px 0;font-size:12px;"><span style="color:#6b7280;">Subtotal</span><span id="sqSumSubtotal" style="font-weight:600;color:#111827;">₹0.00</span></div>
					<div style="display:flex;justify-content:space-between;padding:5px 0;font-size:12px;"><span style="color:#6b7280;">Total Tax</span><span id="sqSumTax" style="font-weight:600;color:#111827;">₹0.00</span></div>
					<div style="display:flex;justify-content:space-between;padding:8px 0 0;margin-top:5px;border-top:1px solid rgba(0,0,0,0.08);font-size:13px;"><span style="font-weight:700;color:#111827;">Grand Total</span><span id="sqSumGrandTotal" style="font-family:'Syne',sans-serif;font-size:18px;font-weight:700;color:#4f46e5;">₹0.00</span></div>
				</div>
			</div>
		</div>
 
		<!-- CONNECTIONS -->
		<div class="card" id="sqConnectionsCard" style="display:none;">
			<div class="section-head"><div class="section-title">Connections</div></div>
			<div id="sqConnectionsBody" style="display:flex;flex-direction:column;gap:14px;"></div>
		</div>
 
		<!-- PAYMENT -->
		<div class="card">
			<div class="section-head"><div class="section-title">Payment Terms</div><div id="sqPayTermsName" style="font-size:12px;color:#6b7280;"></div></div>
			<div id="sqPaymentScheduleBody"></div>
		</div>
 
		<!-- ACTIVITY (Comments | Attachments) -->
		<div class="card">
			<div style="display:flex;align-items:center;gap:0;border-bottom:2px solid rgba(0,0,0,0.07);padding:0 16px;margin:0 -16px 0;">
				<div id="actTabs" style="display:flex;gap:0;overflow-x:auto;flex:1;">
					<div class="act-tab active" data-tab="comments" style="padding:12px 14px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;margin-bottom:-2px;flex-shrink:0;">Comments</div>
					<div class="act-tab" data-tab="attachments" style="padding:12px 14px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;margin-bottom:-2px;flex-shrink:0;">Attachments</div>
				</div>
			</div>
 
			<div id="activityList"><div style="padding:20px;text-align:center;color:#9ca3af;font-size:12px;">No comments yet</div></div>
 
			<div id="attachmentsPanel" class="attachments-panel hidden">
				<div style="padding:12px 16px;border-bottom:1px solid rgba(0,0,0,0.06);">
					<div class="act-field" style="margin-bottom:10px;"><label class="act-field-label">Description</label><input id="sqAttDescription" type="text" class="act-input" placeholder="e.g. Quote PDF, Datasheet"></div>
					<div id="sqAttUploadZone" style="border:2px dashed rgba(0,0,0,0.12);border-radius:10px;padding:20px;text-align:center;cursor:pointer;background:#fafafa;">
						<i class="ti ti-cloud-upload" style="font-size:26px;color:#9ca3af;display:block;margin-bottom:5px;"></i>
						<div style="font-size:13px;font-weight:600;color:#374151;">Click to upload</div>
						<div style="font-size:11px;color:#9ca3af;margin-top:2px;">PDF, DOCX, XLSX, PNG, JPG</div>
					</div>
				</div>
				<div id="sqAttFileList" style="padding:8px 16px 12px;display:flex;flex-direction:column;gap:6px;"></div>
			</div>
 
			<div id="actBottom" class="act-bottom"></div>
 
			<div id="inputComments" class="act-input-area hidden">
				<div class="rel-wrap">
					<textarea id="commentText" class="act-textarea" placeholder="Write a comment…"></textarea>
					<div id="mentionDropdown" class="mention-dropdown hidden"></div>
				</div>
				<div class="act-input-actions">
					<button class="btn btn-primary" type="button" data-action="save-comment" style="background:#4f46e5;border-color:transparent;"><i class="ti ti-check"></i> Post Comment</button>
					<button class="btn" type="button" data-close-tab="comments">Cancel</button>
				</div>
			</div>
		</div>
 
	</div>
</div>`,
	newForm: ``,
};
