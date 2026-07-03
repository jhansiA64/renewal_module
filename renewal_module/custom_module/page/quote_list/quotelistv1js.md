frappe.pages['quote-list'].on_page_load = function (wrapper) {
	new QuoteListPage(wrapper);
};

frappe.pages['quote-list'].on_page_show = function (wrapper) {
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
		this.hasFetched       = false;
		this.hasFetchedOwners = false;
		this.isLoading        = false;
		this.statusFilter     = "";
		this.selectedCustomers = [];
		this.selectedOwners   = [];
		this.ownerOptions     = [];
		this.saved_filters    = [];
		this.filterDoctype    = "Quotation";
		this.activeFilterPopoverButton = null;
		this.amountSortDir    = "";
		this.pageSize         = 20;
		this.pageStep         = 20;
		this.records          = [];

		// ── Detail state ─────────────────────────────────────
		this.selectedRecord    = null;
		this.detailRecord      = null;
		this.detailActivities  = [];
		this.detailAttachments = [];
		this.isLoadingDetail   = false;
		this.detailItems       = [];
		this.activeTab         = "notes";
		this.activeFilter      = "all";

		this.tabConfig = {
			notes:        { label: "+ Add Note",    icon: "ti-notes",          inputId: "inputNotes" },
			calls:        { label: "+ Log Call",    icon: "ti-phone",          inputId: "inputCalls" },
			comments:     { label: "+ Comment",     icon: "ti-message-circle", inputId: "inputComments" },
			attachments:  { label: null,            icon: null,                inputId: null },
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
		};
		waitForContent();
	}

	loadDataAndRender(routeName = "") {
		if (this.isLoading) return;
		this.isLoading = true;
		this.renderListLoading();

		Promise.all([this.fetchRecords(), this.fetchOwnerOptions()])
			.then(() => {
				if (routeName === "new") {
					this.selectedRecord = null;
					this.detailRecord   = null;
					return this.renderNewView();
				}
				if (routeName && routeName !== "new") {
					this.selectedRecord = this.records.find((r) => r.id === routeName) || null;
					this.detailRecord   = null;
				} else {
					this.selectedRecord = null;
					this.detailRecord   = null;
				}
				if (this.selectedRecord) return this.renderDetailView();
				this.renderListView();
			})
			.finally(() => { this.isLoading = false; });
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
		if (this.hasFetched) return Promise.resolve();

		const callGetList = (limitStart, limitPageLength) => new Promise((resolve, reject) => {
			frappe.call({
				method: "frappe.client.get_list",
				args: {
					doctype: "Quotation",
					fields: [
						"name", "status",
						"party_name", "customer_name",
						"owner", "grand_total",
						"transaction_date", "valid_till",
					],
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
				id:           doc.name,
				subject:      doc.name,
				party:        doc.customer_name || doc.party_name || "-",
				status:       doc.status || "Draft",
				amount:       Number(doc.grand_total || 0),
				owner:        doc.owner || "-",
				creation:     this.formatDate(doc.transaction_date),
				valid_till:   doc.valid_till ? this.formatDate(doc.valid_till) : "—",
			}));
			this.hasFetched = true;
		}).catch(() => { this.records = []; });
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
				// Notes — Comment doctype, type "Comment"
				new Promise(res => frappe.call({
					method: "frappe.client.get_list",
					args: {
						doctype: "Comment",
						fields: ["name", "content", "comment_type", "owner", "creation"],
						filters: [
							["Comment", "reference_doctype", "=", "Quotation"],
							["Comment", "reference_name",    "=", recordId],
							["Comment", "comment_type",      "in", ["Comment", "Info"]],
						],
						limit_page_length: 100,
						order_by: "creation desc",
					},
					callback: r => res((r.message || []).map(c => ({
						id:      c.name,
						title:   c.content || "",
						type:    c.comment_type === "Comment" ? "Comment" : "Note",
						tab:     c.comment_type === "Comment" ? "comments" : "notes",
						owner:   c.owner || "",
						created: this.formatActivityTime(c.creation),
						status:  "completed", meta: "",
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
							["Call List", "reference",    "=", "Quotation"],
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
								error:    ()  => resDoc(row),
							}))
						)).then(docs => {
							res(docs.map(c => ({
								id:      c.name,
								title:   c.subject || c.name,
								type:    "Call", tab: "calls",
								owner:   c.owner || "",
								created: this.formatActivityTime(c.creation),
								status:  "completed",
								meta:    c.start_date
									? `${c.start_date}${c.start_timing ? " " + c.start_timing : ""}` : "",
							})));
						});
					},
					error: () => res([]),
				})),
			]).then(([notesAndComments, calls]) => {
				const notes    = notesAndComments.filter(a => a.tab === "notes");
				const comments = notesAndComments.filter(a => a.tab === "comments");
				this.detailActivities = [...notes, ...calls, ...comments];
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
						attached_to_name:    recordId,
					},
					limit_page_length: 100,
					order_by: "creation desc",
				},
				callback: (r) => {
					const files = ((r && r.message) || []).map(f => ({
						id:          f.name,
						name:        f.file_name || f.name,
						url:         f.file_url  || "",
						size:        f.file_size || 0,
						owner:       f.owner     || "",
						created:     this.formatActivityTime(f.creation),
						description: "",
					}));
					this.detailAttachments = files;
					if (!files.length) { resolve(files); return; }

					const fileNames = files.map(f => f.id);
					frappe.call({
						method: "frappe.client.get_list",
						args: {
							doctype: "Comment",
							fields:  ["name", "reference_name", "content"],
							filters: [
								["Comment", "comment_type",      "=", "Info"],
								["Comment", "reference_doctype", "=", "File"],
								["Comment", "reference_name",    "in", fileNames],
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
			if (d < 7)  return `${d}d ago`;
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

	getStatusClass(status) {
		return {
			"Draft":     "ql-status-draft",
			"Open":      "ql-status-open",
			"Replied":   "ql-status-replied",
			"Ordered":   "ql-status-ordered",
			"Lost":      "ql-status-lost",
			"Cancelled": "ql-status-cancelled",
			"Expired":   "ql-status-expired",
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
		const ownerOptions    = this.ownerOptions.length
			? this.ownerOptions
			: Array.from(new Set(this.records.map((r) => String(r.owner || "").trim()).filter(Boolean))).sort().map((o) => ({ value: o, label: o }));
		const rows            = this.getFilteredRows();
		const visibleRows     = rows.slice(0, this.pageSize);
		const appliedCount    = (this.saved_filters || []).length;
		const amountSortIcon  = this.amountSortDir === "asc" ? "ti-sort-ascending" : this.amountSortDir === "desc" ? "ti-sort-descending" : "ti-arrows-sort";
		const statusOptions   = ["", ...Array.from(new Set(this.records.map((r) => r.status).filter(Boolean)))];

		const tableRows = visibleRows.map((row) => {
			const safeParty   = this.escapeAttr(row.party || "-");
			const safeOwner   = this.escapeAttr(row.owner || "-");
			const safeSubject = this.escapeAttr(row.subject || "-");
			return `
			<tr class="ql-list-row" data-name="${row.id}">
				<td class="ql-cell-id-subject">
					<div class="ql-cell-subject" title="${safeSubject}">${safeSubject}</div>
					<div class="ql-cell-id" title="${safeParty}">${safeParty}</div>
				</td>
				<td><span class="ql-customer-text" title="${safeParty}">${safeParty}</span></td>
				<td><span class="ql-status ${this.getStatusClass(row.status)}">${row.status}</span></td>
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
		const selectedSet   = new Set(selectedValues || []);
		const selectedCount = selectedSet.size;
		const triggerText   = selectedCount ? `${placeholder} (${selectedCount})` : placeholder;
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
			try { $btn.popover("hide"); } catch (e) {}
			try { $btn.popover("dispose"); } catch (e) {}
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
			try { $btn.popover("dispose"); } catch (e) {}

			const popover_content = $('<div class="filter-area">');
			const FG = new frappe.ui.FilterGroup({ parent: popover_content, doctype: DOCTYPE, on_change: function () {} });
			FG.update_filter_button = function () {};
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
				const tipElement  = tipInstance?.getTipElement?.() || null;
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
		if (field === "name" || field === "id")                          return row.id;
		if (field === "customer_name" || field === "party_name")         return row.party;
		if (field === "status")                                          return row.status;
		if (field === "owner")                                           return row.owner;
		if (field === "grand_total" || field === "amount")               return row.amount;
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
		const left  = this.getFilterFieldValue(row, field);
		const isAmt = field === "amount" || field === "grand_total";
		const lt    = String(left || "").toLowerCase();
		const normArr = (v) => Array.isArray(v) ? v.map((i) => String(i || "").trim()).filter(Boolean) : String(v || "").split(",").map((i) => i.trim()).filter(Boolean);
		if (op === "set")     return left !== null && left !== undefined && String(left).trim() !== "";
		if (op === "not set") return !left || String(left).trim() === "";
		if (op === "in")      return normArr(value).map((i) => i.toLowerCase()).includes(lt);
		if (op === "not in")  return !normArr(value).map((i) => i.toLowerCase()).includes(lt);
		if (isAmt && [">", ">=", "<", "<=", "=", "!="].includes(op)) {
			const lhs = Number(left || 0), rhs = Number(value);
			if (!Number.isFinite(rhs)) return true;
			if (op === ">")  return lhs > rhs;  if (op === ">=") return lhs >= rhs;
			if (op === "<")  return lhs < rhs;  if (op === "<=") return lhs <= rhs;
			if (op === "=")  return lhs === rhs; if (op === "!=") return lhs !== rhs;
		}
		const rt = String(value || "").toLowerCase();
		if (op === "=")        return lt === rt;
		if (op === "!=")       return lt !== rt;
		if (op === "like")     { const p = rt.replace(/%/g, "").trim(); return !p || lt.includes(p); }
		if (op === "not like") { const p = rt.replace(/%/g, "").trim(); return !p || !lt.includes(p); }
		if (op === ">")  return lt > rt; if (op === ">=") return lt >= rt;
		if (op === "<")  return lt < rt; if (op === "<=") return lt <= rt;
		return true;
	}

	// ─── LIST BINDINGS ────────────────────────────────────
	bindListActions() {
		this.$content
			.off("click.ql", "[data-filter-trigger]")
			.on("click.ql",  "[data-filter-trigger]", (e) => {
				e.preventDefault(); e.stopPropagation();
				const key   = String($(e.currentTarget).data("filterTrigger") || "");
				const $menu = this.$content.find(`[data-filter-menu='${key}']`);
				const open  = !$menu.hasClass("open");
				this.$content.find("[data-filter-menu]").removeClass("open");
				if (open) $menu.addClass("open");
			});

		this.$content
			.off("change.ql", ".ql-multi-checkbox")
			.on("change.ql",  ".ql-multi-checkbox", (e) => {
				const key    = String($(e.currentTarget).data("filterCheck") || "");
				const values = this.$content.find(`.ql-multi-checkbox[data-filter-check='${key}']:checked`).map((_, el) => String(el.value || "").trim()).get().filter(Boolean);
				if (key === "customer") this.selectedCustomers = values;
				if (key === "owner")    this.selectedOwners    = values;
				this.pageSize = 20; this.renderListView();
			});

		this.$content
			.off("input.ql",  ".ql-multi-search")
			.on("input.ql",   ".ql-multi-search", (e) => {
				const key   = String($(e.currentTarget).data("filterSearch") || "");
				const query = String($(e.currentTarget).val() || "").trim().toLowerCase();
				this.$content.find(`[data-filter-option='${key}']`).each((_, item) => $(item).toggle(!query || String($(item).data("label") || "").toLowerCase().includes(query)));
			});

		this.$content
			.off("click.ql",  "#qlOpenFilters .ql-filter-btn-close")
			.on("click.ql",   "#qlOpenFilters .ql-filter-btn-close", (e) => { e.preventDefault(); e.stopPropagation(); this.closeStandardFilterPopover(this.$content.find("#qlOpenFilters")); });

		this.$content
			.off("click.ql",  "#qlOpenFilters")
			.on("click.ql",   "#qlOpenFilters", (e) => {
				e.preventDefault(); e.stopPropagation();
				if ($(e.target).closest(".ql-filter-btn-close").length) { this.closeStandardFilterPopover(e.currentTarget); return; }
				this.openStandardFilterPopover(e.currentTarget);
			});

		this.$content
			.off("change.ql", "#qlStatusFilter")
			.on("change.ql",  "#qlStatusFilter", (e) => { this.statusFilter = String($(e.currentTarget).val() || "").trim(); this.renderListView(); });

		this.$content
			.off("click.ql",  "#qlClearFilters")
			.on("click.ql",   "#qlClearFilters", () => { this.selectedCustomers = []; this.selectedOwners = []; this.statusFilter = ""; this.saved_filters = []; this.pageSize = 20; this.renderListView(); });

		this.$content
			.off("click.ql",  "#qlSortAmount")
			.on("click.ql",   "#qlSortAmount", (e) => { e.preventDefault(); this.amountSortDir = !this.amountSortDir ? "asc" : this.amountSortDir === "asc" ? "desc" : ""; this.renderListView(); });

		this.$content
			.off("click.ql",  ".ps-btn")
			.on("click.ql",   ".ps-btn", (e) => { const s = Number($(e.currentTarget).data("size") || 20); if (!Number.isFinite(s) || s <= 0) return; this.pageSize = s; this.renderListView(); });

		this.$content
			.off("click.ql",  "#qlLoadMore")
			.on("click.ql",   "#qlLoadMore", () => { this.pageSize += this.pageStep; this.renderListView(); });

		this.$content
			.off("click.ql",  "#qlNewDoc")
			.on("click.ql",   "#qlNewDoc", () => frappe.set_route("quote-list", "new"));

		this.$content
			.off("click.ql",  ".ql-list-row")
			.on("click.ql",   ".ql-list-row", (e) => {
				const name     = String($(e.currentTarget).data("name") || "");
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
				this.injectDetailItems();
				this.injectDetailFinancials();
				this.injectDetailActivities();
				this.injectDetailAttachments();
				this.setPageTitle();
				this.bindActivityFilters();
				this.bindDetailActions();
			})
			.then(() => {
				const fixHeights = () => {
					["support-layout","support-layout-row","support-sidebar","support-main","support-page-content"].forEach(id => {
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
		const record     = this.detailRecord || this.selectedRecord;
		const customerName = record.customer_name || record.party_name || this.selectedRecord.party || "-";
		const status       = record.status || this.selectedRecord.status || "Draft";

		this.$content.find("#qlBreadcrumbId").text(record.name || this.selectedRecord.id);
		this.$content.find("#qlSubjectLabel").text(record.name || this.selectedRecord.id).attr("title", record.name || "");
		this.$content.find(".customer-avatar").text(this.getCustomerAvatarText(customerName)).attr("title", customerName);
		this.$content.find(".customer-name").text(customerName);
		this.$content.find(".customer-sub").text(`Owner · ${record.owner || this.selectedRecord.owner}`);
		this.$content.find("#statusBadge").html(`<i class="ti ti-circle-dot"></i> ${status}`);
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
		this.$content.find("#qlMetaCompany").text(record.company || "—");
	}

	injectDetailFinancials() {
		const record = this.detailRecord || {};
		const toNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
		const netTotal   = toNum(record.net_total   || record.total);
		const taxTotal   = toNum(record.total_taxes_and_charges);
		const grandTotal = toNum(record.grand_total  || record.rounded_total);
		const discount   = toNum(record.discount_amount);

		this.$content.find("#qlNetTotal").text(this.formatCurrency(netTotal));
		this.$content.find("#qlTaxTotal").text(this.formatCurrency(taxTotal));
		this.$content.find("#qlGrandTotal").text(this.formatCurrency(grandTotal));
		this.$content.find("#qlDiscount").text(discount ? this.formatCurrency(discount) : "—");
	}

	injectDetailItems() {
		const record = this.detailRecord || {};
		const items  = Array.isArray(record.items) ? record.items : [];

		if (!items.length) {
			this.$content.find("#qlItemsTableBody").html(
				`<tr><td colspan="6" style="text-align:center;padding:32px;color:#9ca3af;font-size:12px;">
					<i class="ti ti-inbox" style="font-size:26px;display:block;margin-bottom:8px;"></i>No items on this quotation
				</td></tr>`
			);
			return;
		}

		const fmt = (n) => Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

		const rows = items.map((item, i) => `
		<tr style="border-bottom:1px solid rgba(0,0,0,0.06);">
			<td style="padding:10px 8px;color:#9ca3af;font-size:11px;text-align:center;">${i + 1}</td>
			<td style="padding:10px 10px;">
				<div style="font-size:12px;font-weight:600;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px;">${this.escapeAttr(item.item_name || item.item_code || "—")}</div>
				<div style="font-size:10px;color:#9ca3af;margin-top:1px;">${this.escapeAttr(item.item_code || "")}</div>
			</td>
			<td style="padding:10px 8px;font-size:12px;color:#374151;">${this.escapeAttr(item.uom || "Nos")}</td>
			<td style="padding:10px 8px;font-size:12px;text-align:right;font-weight:600;">${Number(item.qty || 0).toLocaleString("en-IN")}</td>
			<td style="padding:10px 8px;font-size:12px;text-align:right;">₹${fmt(item.rate)}</td>
			<td style="padding:10px 8px;font-size:12px;text-align:right;font-weight:700;color:#111827;">₹${fmt(item.amount)}</td>
		</tr>`).join("");

		this.$content.find("#qlItemsTableBody").html(rows);

		// Summary
		const totalQty = items.reduce((s, it) => s + Number(it.qty || 0), 0);
		const totalAmt = items.reduce((s, it) => s + Number(it.amount || 0), 0);
		this.$content.find("#qlItemsTotalQty").text(totalQty.toLocaleString("en-IN"));
		this.$content.find("#qlItemsTotalAmt").text(this.formatCurrency(totalAmt));
	}

	injectDetailActivities() {
		const me    = this;
		const $list = this.$content.find("#activityList");
		if (!$list.length) return;
		$list.empty();

		if (!this.detailActivities.length) {
			$list.html('<div style="padding:20px;text-align:center;color:#9ca3af;font-size:12px;">No activities yet</div>');
			return;
		}

		const iconMap  = { Note:"ti-notes", Call:"ti-phone", Comment:"ti-message-circle" };
		const colorMap = { Note:"#3b7ef8",  Call:"#16a34a",  Comment:"#7c3aed" };

		this.detailActivities.forEach((a) => {
			const icon  = iconMap[a.type]  || "ti-notes";
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
				<span style="font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;background:${color}15;color:${color};white-space:nowrap;flex-shrink:0;margin-top:2px;">${me.escapeAttr(a.type)}</span>
			</div>`);
		});

		this.applyFilter();
	}

	injectDetailAttachments() {
		const me    = this;
		const $list = this.$content.find("#qlAttFileList");
		if (!$list.length) return;

		const extIcon = (name) => {
			const ext = (name || "").split(".").pop().toLowerCase();
			return { pdf:"ti-file-type-pdf", doc:"ti-file-type-doc", docx:"ti-file-type-doc", xls:"ti-file-spreadsheet", xlsx:"ti-file-spreadsheet", png:"ti-photo", jpg:"ti-photo", jpeg:"ti-photo" }[ext] || "ti-file";
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
	bindActivityFilters() {
		const me      = this;
		const $tabs   = this.$content.find("#actTabs");
		const $filter = this.$content.find("#actFilter");

		$tabs.off("click.ql", ".act-tab").on("click.ql", ".act-tab", (e) => {
			const $t  = $(e.currentTarget);
			const tab = String($t.data("tab") || "notes");
			$tabs.find(".act-tab").css({ color: "#9ca3af", borderBottom: "2px solid transparent" });
			$t.css({ color: "#3b7ef8", borderBottom: "2px solid #3b7ef8" });
			me.activeTab = tab;
			$filter.toggle(tab !== "attachments");
			me.applyFilter();
		});

		$filter.off("click.ql", ".act-filter").on("click.ql", ".act-filter", (e) => {
			const $f = $(e.currentTarget);
			$filter.find(".act-filter").css({ background: "#f1f5f9", color: "#6b7280", border: "1px solid rgba(0,0,0,0.08)" });
			$f.css({ background: "rgba(59,126,248,0.1)", color: "#3b7ef8", border: "1px solid rgba(59,126,248,0.2)" });
			me.activeFilter = String($f.data("filter") || "all");
			me.applyFilter();
		});

		this.applyFilter();
	}

	applyFilter() {
		const isAttach = this.activeTab === "attachments";
		this.$content.find("#activityList").toggle(!isAttach);
		this.$content.find("#attachmentsPanel").toggleClass("hidden", !isAttach).toggle(isAttach);
		this.$content.find("#actFilter").toggle(!isAttach);
		this.$content.find("#actBottom").toggle(!isAttach);

		if (!isAttach) {
			this.$content.find("#activityList .act-item").each((_, item) => {
				const $item  = $(item);
				const tabOk  = $item.data("tab") === this.activeTab;
				const filtOk = this.activeFilter === "all" || $item.data("status") === this.activeFilter;
				$item.css("display", tabOk && filtOk ? "flex" : "none");
			});
		}

		this.closeAllInputs();
		this.renderBottomBtn();
	}

	renderBottomBtn() {
		const cfg     = this.tabConfig[this.activeTab];
		const $bottom = this.$content.find("#actBottom");
		if (!cfg || !cfg.label) { $bottom.empty(); return; }
		$bottom.html(`<button class="add-btn" type="button" data-toggle-input="${this.activeTab}"><i class="ti ${cfg.icon}"></i> ${cfg.label}</button>`);
	}

	closeAllInputs() { this.$content.find(".act-input-area").addClass("hidden").hide(); }

	// ─── DETAIL BINDINGS ──────────────────────────────────
	bindDetailActions() {
		this.$content.off("click.qlD");

		this.$content.on("click.qlD", ".ql-back-btn", () => frappe.set_route("quote-list"));

		this.$content.on("click.qlD", "#qlBtnOpenFrappe", () => {
			const record = this.detailRecord || this.selectedRecord;
			if (record?.name) frappe.set_route("Form", "Quotation", record.name);
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
					const today  = new Date().toISOString().split("T")[0];
					const now    = new Date().toTimeString().slice(0, 5);
					if (!this.$content.find("#callStartDate").val()) this.$content.find("#callStartDate").val(today);
					if (!this.$content.find("#callStartTime").val()) this.$content.find("#callStartTime").val(now);
					if (!this.$content.find("#callEndDate").val())   this.$content.find("#callEndDate").val(today);
					const custName = record?.party_name || record?.customer_name || this.selectedRecord?.party || "";
					this.$content.find("#callRelatedTo").val(custName);
				}
			}
		});

		this.$content.on("click.qlD", "[data-close-tab]", (e) => {
			const tab = String($(e.currentTarget).data("closeTab") || "");
			const cfg = this.tabConfig[tab];
			if (cfg?.inputId) this.$content.find(`#${cfg.inputId}`).addClass("hidden").hide();
		});

		// ── Save Note ────────────────────────────────────
		this.$content.on("click.qlD", "[data-action='save-note']", () => {
			const me     = this;
			const record = me.detailRecord || me.selectedRecord;
			const $note  = me.$content.find("#noteText");
			const txt    = ($note.val() || "").trim();
			if (!txt) return;
			frappe.call({
				method: "frappe.client.insert",
				args: { doc: { doctype: "Comment", comment_type: "Info", reference_doctype: "Quotation", reference_name: record?.name || "", content: txt } },
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
			const me        = this;
			const record    = me.detailRecord || me.selectedRecord;
			const subject   = me.$content.find("#callSubject").val().trim();
			const startDate = me.$content.find("#callStartDate").val().trim();
			const startTime = me.$content.find("#callStartTime").val().trim();
			const endDate   = me.$content.find("#callEndDate").val().trim();
			const endTime   = me.$content.find("#callEndTime").val().trim();
			const relatedTo = me.$content.find("#callRelatedTo").val().trim();
			if (!subject) { frappe.show_alert({ message: "Subject is required.", indicator: "orange" }); return; }
			frappe.call({
				method: "frappe.client.insert",
				args: { doc: { doctype: "Call List", custom_date: new Date().toISOString().split("T")[0], subject, start_date: startDate, start_timing: startTime, end_date: endDate, end_timing: endTime, related_to: "Customer", name1: relatedTo, reference: "Quotation", reference_to: record?.name || "" } },
				callback: (r) => {
					if (r.message) {
						me.detailActivities.unshift({ id: r.message.name, title: subject, type: "Call", tab: "calls", owner: frappe.session.user, created: "Just now", status: "completed", meta: startDate ? `${startDate}${startTime ? " " + startTime : ""}` : "" });
						me.injectDetailActivities();
						frappe.show_alert({ message: "Call logged!", indicator: "green" });
					}
					me.$content.find("#callSubject,#callStartDate,#callStartTime,#callEndDate,#callEndTime").val("");
					me.$content.find("#inputCalls").addClass("hidden").hide();
					me.applyFilter();
				},
				error: () => frappe.show_alert({ message: "Failed to log call.", indicator: "red" }),
			});
		});

		// ── Save Comment ──────────────────────────────────
		this.$content.on("click.qlD", "[data-action='save-comment']", () => {
			const me      = this;
			const record  = me.detailRecord || me.selectedRecord;
			const $comment = me.$content.find("#commentText");
			const txt      = ($comment.val() || "").trim();
			if (!txt) return;
			frappe.call({
				method: "frappe.client.insert",
				args: { doc: { doctype: "Comment", comment_type: "Comment", reference_doctype: "Quotation", reference_name: record?.name || "", content: txt } },
				callback: (r) => {
					if (r.message) {
						me.detailActivities.unshift({ id: r.message.name, title: txt, type: "Comment", tab: "comments", owner: frappe.session.user, created: "Just now", status: "completed", meta: "" });
						me.injectDetailActivities();
						frappe.show_alert({ message: "Comment posted!", indicator: "green" });
					}
					$comment.val("");
					me.$content.find("#inputComments").addClass("hidden").hide();
					me.applyFilter();
				},
				error: () => frappe.show_alert({ message: "Failed to post comment.", indicator: "red" }),
			});
		});

		$(document).off("click.qlD").on("click.qlD", (e) => {
			const $dd = this.$content.find("#mentionDropdown").get(0);
			if ((!$dd || !$dd.contains(e.target)) && e.target.id !== "commentText")
				this.$content.find("#mentionDropdown").addClass("hidden").hide();
		});
	}

	// ─── NEW FORM ─────────────────────────────────────────
	renderNewView() {
		this.page.set_title("New Quotation");
		document.title = "New Quotation";
		$("#support-page-content").removeClass("ql-content-fixed").addClass("ql-content-scroll");
		this.$content.html(frappe.quote_list_page_template.newForm);
		this.initWizard();
	}

	initWizard() {
		const me = this;
		me.wizardStep       = 1;
		me.wizardItems      = [];
		me.wizardFiles      = [];
		me.wizardContacts   = [];
		me.wizardCustomers  = [];
		me.wizardERP_Items  = [];
		me.customerAddresses = [];
		me.companyAddresses  = [];
		me._addrSlots = {
    billing:  { label: "Billing Address",  inputId: "qlFAddress",        cardId: "qlAddrCard",        listKey: "customerAddresses", accent: "#3b7ef8", icon: "ti-map-pin",        empty: "Select a customer first to load addresses." },
    shipping: { label: "Shipping Address", inputId: "qlFShipAddress",    cardId: "qlShipAddrCard",    listKey: "customerAddresses", accent: "#16a34a", icon: "ti-truck-delivery", empty: "Select a customer first to load addresses." },
    company:  { label: "Company Address",  inputId: "qlFCompanyAddress", cardId: "qlCompanyAddrCard", listKey: "companyAddresses",  accent: "#d97706", icon: "ti-building",       empty: "Select a company first to load addresses." },
};
["billing", "shipping", "company"].forEach(k => me.renderAddressSlot(k));
		me.selectedCustomerDoc = null;
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
			const name  = $item.data("label");
			const doc   = $item.data("docname");
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
		me.$content.on("input.qlNew focus.qlNew", "#qlFPayTerms", (e) => me.searchLiveLink($(e.currentTarget), "#qlPayTermsDD", "Payment Terms", "name", ".ql-payterms-item", "ti-receipt"));
		me.$content.on("keydown.qlNew", "#qlFPayTerms", (e) => me.linkKeyNav(e, "#qlPayTermsDD"));
		me.$content.on("mousedown.qlNew", ".ql-payterms-item", (e) => { e.preventDefault(); me.$content.find("#qlFPayTerms").val($(e.currentTarget).data("label")); me.$content.find("#qlPayTermsDD").removeClass("open"); });

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
		me.$content.on("mousedown.qlNew", ".ql-terms-item", (e) => { e.preventDefault(); me.$content.find("#qlFTerms").val($(e.currentTarget).data("label")); me.$content.find("#qlTermsDD").removeClass("open"); });

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
			me.wizardItems[idx].sp  = parseFloat(me.$content.find(`[data-idx="${idx}"] .ql-item-sp`).val())  || 0;
			me.wizardItems[idx].bp  = parseFloat(me.$content.find(`[data-idx="${idx}"] .ql-item-bp`).val())  || 0;
			me.calcTotals();
		});

		// Attachment upload
		me.$content.on("change.qlNew", "#qlFileInput", (e) => me.handleFiles(e.target.files));

		// Submit
		me.$content.on("click.qlNew", "#qlSubmitForm", () => me.submitWizard());
		me.$content.on("click.qlNew", "#qlSaveDraft",  () => frappe.show_alert({ message: "Draft saved!", indicator: "blue" }));

		// Pre-fill company
		if (!me.$content.find("#qlFCompany").val().trim()) {
			me.$content.find("#qlFCompany").val(me.defaultCompanyName);
		}
		me.loadCompanyAddresses(me.$content.find("#qlFCompany").val().trim());

		// Prefill from a source Opportunity (set by opp-list "Create → Quotation")
		me.fromOpportunity = "";
		if (frappe._quoteFromOpportunity) {
			const oppId = frappe._quoteFromOpportunity;
			frappe._quoteFromOpportunity = null;
			me.prefillFromOpportunity(oppId);
		}
	}

	// ── Prefill the wizard from an Opportunity ──────────────
	// ── Prefill the wizard from an Opportunity ──────────────
	prefillFromOpportunity(oppId) {
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
				const items = Array.isArray(opp.items) ? opp.items : [];

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
					name:    c.user_name || "—",     // display
					email:   c.email_id  || "",
					phone:   c.mobile_no || "",
					role:    c.designation || "",
				}));
				// set POC index from the row with poc===1
				const pocPos = oppContacts.findIndex(c => Number(c.poc) === 1);
				me.wizardPocIndex = pocPos >= 0 ? pocPos : 0;	

				me.wizardItems = items.map(it => ({
					name:            it.item_name || it.item_code || "—",
					code:            it.item_code || "",
					brand:           it.brand || "—",
					group:           it.item_group || "General",
					description:     it.description || "",
					renewal_status:  (it.opportunity_type || "new").toLowerCase(),  // type field
					type:            (it.opportunity_type || "new").toLowerCase(),   // in-memory
					qty:             Number(it.qty || 1),
					uom:             it.uom || it.stock_uom || "Nos",
					sp:              Number(it.rate || 0),
					bp:              Number(it.spq_rate || 0),
					discount:        0,
					orc:             !!(it.orc),
					commission_type: it.commission_type || "",
					rate_value:      Number(it.rate_value || 0),
					renewId:         it.renewal_id || "",                            // renewal id
				}));

				// DEBUG: what got mapped into the cards
				console.log("MAPPED wizardItems:", JSON.stringify(
					me.wizardItems.map(i => ({
						name: i.name,
						renewal_status: i.renewal_status,
						renewId: i.renewId,
						orc: i.orc,
					})), null, 2));

				me.renderItemsTable();

				// Customer — only the standard "Customer" opportunity_from maps cleanly
				const party = opp.party_name || "";
				if (party && (opp.opportunity_from === "Customer" || !opp.opportunity_from)) {
					me.$content.find("#qlFCustomer").val(opp.customer_name || party);
					me._prefillContactPerson =  "";
					me.onCustomerSelected(party, { skipCompany: !!opp.company });
				} else if (party) {
					me.$content.find("#qlFCustomer").val(opp.customer_name || party);
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
		const close   = () => $overlay.remove();
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
				const companyVal = doc.company || me.defaultCompanyName || "";

				if (companyVal && !opts.skipCompany) {
					me.$content.find("#qlFCompany").val(companyVal);
					me.loadCompanyAddresses(companyVal);
				}
				me.fetchDefaultTaxes();   // ← add this
				const salesTeam = Array.isArray(doc.sales_team) ? doc.sales_team : [];
				if (salesTeam.length) {
					const sp   = salesTeam[0];
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
    me._autoFillAddress("#qlFAddress",     list, [a => a.primary]);
    me._autoFillAddress("#qlFShipAddress", list, [a => a.shipping, a => a.primary]);
    me.renderAddressSlot("billing");
    me.renderAddressSlot("shipping");
	me.determineTaxFromAddress();
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
					["Dynamic Link", "link_name",    "=", linkName],
				],
				limit_page_length: 50,
				order_by: "is_primary_address desc, modified desc",
			},
			callback: (r) => cb((r.message || []).map(a => ({
				name:     a.name,
				label:    [a.address_line1, a.address_line2, a.city, a.state, a.pincode].filter(Boolean).join(", ") || a.name,
				line1:    a.address_line1 || "",
				line2:    a.address_line2 || "",
				city:     a.city    || "",
				state:    a.state   || "",
				pincode:  a.pincode || "",
				primary:  !!a.is_primary_address,
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
    const me   = this;
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

    const clr      = slot.accent;
    const cityLine = [addr.city, addr.state, addr.pincode].filter(Boolean).join(", ");
    const badge = (txt, c) => `<span style="display:inline-flex;align-items:center;margin-left:6px;padding:1px 7px;border-radius:20px;background:${c}1a;font-size:9px;font-weight:700;letter-spacing:.04em;color:${c};">${txt}</span>`;
    let badges = "";
    if (addr.primary)  badges += badge("PRIMARY",  "#16a34a");
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
                ${cityLine   ? `<div style="font-size:12px;color:#6b7280;margin-top:3px;display:flex;align-items:center;gap:6px;"><i class="ti ti-building-community" style="font-size:13px;color:#9ca3af;"></i>${me.escapeAttr(cityLine)}</div>` : ""}
                <button type="button" class="ql-addr-change" data-addr-slot="${slotKey}" style="margin-top:8px;background:transparent;border:none;color:${clr};font-size:11px;font-weight:600;cursor:pointer;padding:0;display:inline-flex;align-items:center;gap:4px;"><i class="ti ti-switch-horizontal" style="font-size:12px;"></i> Change</button>
            </div>
            <button type="button" class="ql-addr-remove" data-addr-slot="${slotKey}" style="position:absolute;top:10px;right:10px;width:24px;height:24px;border-radius:50%;border:1px solid rgba(0,0,0,0.08);background:transparent;color:#9ca3af;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;" title="Remove"><i class="ti ti-x"></i></button>
        </div>`);
}




openAddressPicker(slotKey) {
    const me   = this;
    const slot = me._addrSlots && me._addrSlots[slotKey];
    if (!slot) return;
    const list = me[slot.listKey] || [];
    $("#qlAddrPickerOverlay").remove();

    const rows = list.length
        ? list.map((a, i) => {
            const cityLine = [a.city, a.state, a.pincode].filter(Boolean).join(", ");
            let tags = "";
            if (a.primary)  tags += `<span style="font-size:9px;font-weight:700;color:#16a34a;margin-left:6px;">• PRIMARY</span>`;
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

    $overlay.on("click", ".ql-addr-pick-item", function() {
		const a = list[parseInt($(this).data("ai"))];
		if (a) { me.$content.find(`#${slot.inputId}`).val(a.name); me.renderAddressSlot(slotKey); }
		$overlay.remove();
		if (slotKey === "billing") me.determineTaxFromAddress();   // ← re-determine taxes
	});
    $overlay.on("mouseenter", ".ql-addr-pick-item", function() { $(this).css({ "border-color": slot.accent, "background": slot.accent + "0a" }); })
            .on("mouseleave", ".ql-addr-pick-item", function() { $(this).css({ "border-color": "rgba(0,0,0,0.08)", "background": "" }); });
    $overlay.on("click", "#qlAddrPickerClose, #qlAddrPickerCancel", () => $overlay.remove());
    $overlay.on("click", (e) => { if ($(e.target).is($overlay)) $overlay.remove(); });
}

	// Render the formatted details card for whatever address is in the input.
_syncAddressCard(inputSel, cardSel, list) {
    const me    = this;
    const $card = me.$content.find(cardSel);
    if (!$card.length) return;
    const name = (me.$content.find(inputSel).val() || "").trim();
    const addr = (list || []).find(a => a.name === name);
    if (!name || !addr) { $card.hide().empty(); return; }

    const cityLine = [addr.city, addr.state, addr.pincode].filter(Boolean).join(", ");
    const badge = (txt, clr) =>
        `<span style="font-size:9px;font-weight:700;letter-spacing:.04em;color:${clr};background:${clr}1a;padding:1px 6px;border-radius:10px;margin-left:6px;vertical-align:middle;">${txt}</span>`;
    let badges = "";
    if (addr.primary)  badges += badge("PRIMARY",  "#16a34a");
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
                ${cityLine   ? `<div style="font-size:12px;color:#6b7280;margin-top:2px;">${me.escapeAttr(cityLine)}</div>` : ""}
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
		me.$content.find(".ql-step").each(function() {
			const sn = parseInt($(this).data("step"));
			$(this).removeClass("active done");
			const $c = $(this).find(".ql-step-circle");
			if (sn === n)    { $(this).addClass("active"); $c.html(sn); }
			else if (sn < n) { $(this).addClass("done"); $c.html('<i class="ti ti-check" style="font-size:13px;"></i>'); }
			else             { $c.html(sn); }
		});
		me.$content.find("#qlProgressFill").css("width", (n / 7 * 100) + "%");
		if (n === 2) me.renderContactCards();
		if (n === 7) me.buildReview();
		$("#support-page-content").scrollTop(0);
	}

	validateWizardStep(n) {
		const me = this;
		if (n === 1) {
			if (!me.$content.find("#qlFSubject").val().trim())  { frappe.msgprint("Please enter a Subject.");  return false; }
			if (!me.$content.find("#qlFCustomer").val().trim()) { frappe.msgprint("Please select a Customer."); return false; }
		}
		return true;
	}

	// ── Live link search ────────────────────────────────────
	// Generic live link search — works for Customer, Company, Sales Person
// Generic live link search — works for Customer, Company, Sales Person
searchLiveLink($input, ddSel, doctype, labelField, itemClass, icon) {
	const me  = this;
	const q   = ($input.val() || "").trim();
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
		const fields  = doctype === "Customer"
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
							parent:  "Customer",
							fields:  ["parent", "sales_person", "allocated_percentage"],
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
							me._renderCustomerDropdown($dd, rows, spMap, itemClass,$input);
						},
						error: () => me._renderCustomerDropdown($dd, rows, {}, itemClass),
					});
					return;
				}

				// ── Company / Sales Person: original two-line display ──
				$dd.html(rows.map(row => {
					const label = row.sales_person_name || row.name;
					const av    = label.substring(0, 2).toUpperCase();
					const sub   = row.name;
					return `
					<div class="${itemClass.replace(".","")}" style="display:flex;align-items:center;gap:10px;padding:9px 12px;cursor:pointer;transition:0.12s;"
						data-label="${me.escapeAttr(label)}"
						data-docname="${me.escapeAttr(row.name)}"
						data-email="${me.escapeAttr(row.email_id||"")}"
						data-mobile="${me.escapeAttr(row.mobile_no||"")}">
						<div style="width:28px;height:28px;border-radius:50%;background:rgba(59,126,248,0.12);color:#3b7ef8;display:flex;align-items:center;justify-content:center;font-family:Syne,sans-serif;font-size:11px;font-weight:700;flex-shrink:0;">${av}</div>
						<div style="flex:1;min-width:0;">
							<div style="font-size:12px;font-weight:500;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${me.escapeAttr(label)}</div>
							${sub && sub !== label ? `<div style="font-size:10px;color:#9ca3af;">${me.escapeAttr(sub)}</div>` : ""}
						</div>
					</div>`;
				}).join("")).addClass("open");

				$dd.find(`${itemClass}`).on("mouseenter", function() {
					$(this).css("background","rgba(59,126,248,0.06)");
				}).on("mouseleave", function() {
					$(this).css("background","");
				});
			}
		});
	}, 250);
}

// Render the Customer dropdown rows with sales person from sales_team
_renderCustomerDropdown($dd, rows, spMap, itemClass,$input) {
	const me = this;
	const w = ($input && $input.length) ? $input.outerWidth() : 260;
	$dd.css({ width: w + "px", minWidth: "0", maxWidth: "none" });
	$dd.html(rows.map(row => {
		const label = row.customer_name || row.name;
		const av    = label.substring(0, 2).toUpperCase();
		const sp    = spMap[row.name] || "";

		const meta = [];
		if (sp)                 meta.push(`<span style="display:inline-flex;align-items:center;gap:3px;"><i class="ti ti-user-check" style="font-size:10px;color:#3b7ef8;"></i>${me.escapeAttr(sp)}</span>`);
		if (row.territory)      meta.push(`<span style="display:inline-flex;align-items:center;gap:3px;"><i class="ti ti-map-pin" style="font-size:10px;color:#9ca3af;"></i>${me.escapeAttr(row.territory)}</span>`);
		if (row.industry)       meta.push(`<span style="display:inline-flex;align-items:center;gap:3px;"><i class="ti ti-building-factory-2" style="font-size:10px;color:#9ca3af;"></i>${me.escapeAttr(row.industry)}</span>`);
		if (row.customer_group) meta.push(`<span style="display:inline-flex;align-items:center;gap:3px;"><i class="ti ti-users" style="font-size:10px;color:#9ca3af;"></i>${me.escapeAttr(row.customer_group)}</span>`);

		return `
		<div class="${itemClass.replace(".","")}" style="display:flex;align-items:flex-start;gap:10px;padding:9px 12px;cursor:pointer;transition:0.12s;"
			data-label="${me.escapeAttr(label)}"
			data-docname="${me.escapeAttr(row.name)}">
			<div style="width:28px;height:28px;border-radius:50%;background:rgba(59,126,248,0.12);color:#3b7ef8;display:flex;align-items:center;justify-content:center;font-family:Syne,sans-serif;font-size:11px;font-weight:700;flex-shrink:0;margin-top:1px;">${av}</div>
			<div style="flex:1;min-width:0;">
				<div style="font-size:12px;font-weight:600;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${me.escapeAttr(label)}</div>
				${meta.length ? `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:3px;font-size:10px;color:#6b7280;">${meta.join("")}</div>` : ""}
			</div>
		</div>`;
	}).join("")).addClass("open");

	$dd.find(`${itemClass}`).on("mouseenter", function() {
		$(this).css("background","rgba(59,126,248,0.06)");
	}).on("mouseleave", function() {
		$(this).css("background","");
	});
}

	fillSpCard(name, email, phone) {
		const me = this;
		const av = (name || "?").substring(0, 2).toUpperCase();
		me.$content.find("#qlSpCardAv").text(av);
		me.$content.find("#qlSpCardName").text(name || "");
		me.$content.find("#qlFSpEmail").val(email || "");
		me.$content.find("#qlFSpPhone").val(phone || "");
		if (email) me.$content.find("#qlSpCardEmail").css("display","flex").find("span").text(email);
		else        me.$content.find("#qlSpCardEmail").hide();
		if (phone) me.$content.find("#qlSpCardPhone").css("display","flex").find("span").text(phone);
		else        me.$content.find("#qlSpCardPhone").hide();
		me.$content.find("#qlSpCard").css("display","flex");
	}

	linkKeyNav(e, ddSel) {
		const $dd    = this.$content.find(ddSel || ".ql-link-dd");
		if (!$dd.hasClass("open")) return;
		const $items = $dd.find(".ql-link-item");
		let idx = $items.index($items.filter(".hi"));
		if (e.key === "ArrowDown")  { e.preventDefault(); idx = Math.min(idx + 1, $items.length - 1); }
		else if (e.key === "ArrowUp")   { e.preventDefault(); idx = Math.max(idx - 1, 0); }
		else if (e.key === "Enter" && idx >= 0) { e.preventDefault(); $items.eq(idx).trigger("mousedown"); return; }
		else if (e.key === "Escape") { $dd.removeClass("open"); return; }
		$items.removeClass("hi").eq(idx).addClass("hi");
	}

	// ── Contact cards (Step 2) ──────────────────────────────
	renderContactCards() {
		const me      = this;
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
		const me    = this;
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
		const colors = ["#3b7ef8","#16a34a","#d97706","#7c3aed","#dc2626"];
		$wrap.html(me.wizardContacts.map((c, idx) => {
			const av  = (c.name || "?")[0].toUpperCase();
			const clr = colors[idx % colors.length];
			const isPoc = (idx === me.wizardPocIndex);
			return `<div style="background:${isPoc?"rgba(59,126,248,0.05)":"#fff"};border:${isPoc?"2px solid #3b7ef8":"1px solid rgba(0,0,0,0.09)"};border-radius:14px;padding:16px 18px;display:flex;align-items:center;gap:14px;box-shadow:0 1px 6px rgba(0,0,0,0.06);position:relative;">
				<div style="position:relative;width:42px;height:42px;border-radius:50%;background:${clr}1a;border:2px solid ${clr}33;display:flex;align-items:center;justify-content:center;font-family:Syne,sans-serif;font-size:16px;font-weight:700;color:${clr};flex-shrink:0;">${av}
					${isPoc?`<span style="position:absolute;bottom:-1px;right:-1px;width:13px;height:13px;border-radius:50%;background:#3b7ef8;border:2px solid #fff;"></span>`:""}
				</div>
				<div style="flex:1;min-width:0;">
					<div style="font-family:Syne,sans-serif;font-size:14px;font-weight:600;color:#111827;">${me.escapeAttr(c.name || "—")}</div>
					${c.email ? `<div style="font-size:12px;color:#3b7ef8;margin-top:4px;display:flex;align-items:center;gap:6px;"><i class="ti ti-mail" style="font-size:13px;color:#9ca3af;"></i>${me.escapeAttr(c.email)}</div>` : ""}
					${c.phone ? `<div style="font-size:12px;color:#374151;margin-top:3px;display:flex;align-items:center;gap:6px;"><i class="ti ti-device-mobile" style="font-size:13px;color:#9ca3af;"></i>${me.escapeAttr(c.phone)}</div>` : ""}
					${c.role  ? `<div style="display:inline-flex;align-items:center;margin-top:6px;padding:2px 8px;border-radius:20px;background:rgba(59,126,248,0.08);font-size:10px;font-weight:600;color:#3b7ef8;">${me.escapeAttr(c.role)}</div>` : ""}
					<label class="ql-poc-toggle" style="display:inline-flex;align-items:center;gap:5px;margin-top:8px;cursor:pointer;">
						<input type="checkbox" class="ql-poc-check" data-poc-idx="${idx}" ${isPoc?"checked":""} style="accent-color:#3b7ef8;width:14px;height:14px;cursor:pointer;">
						<span style="font-size:11px;font-weight:600;color:${isPoc?"#3b7ef8":"#9ca3af"};">${isPoc?"✓ Point of Contact":"Set as Point of Contact"}</span>
					</label>
				</div>
				<button class="ql-con-card-remove" data-con-idx="${idx}" style="position:absolute;top:10px;right:10px;width:24px;height:24px;border-radius:50%;border:1px solid rgba(0,0,0,0.08);background:transparent;color:#9ca3af;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;" title="Remove"><i class="ti ti-x"></i></button>
			</div>`;
		}).join(""));
	}

	openContactPickerPopup() {
		const me       = this;
		const contacts = (me.selectedCustomerDoc && me.selectedCustomerDoc.contacts) || [];
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
								<div style="width:36px;height:36px;border-radius:50%;background:rgba(59,126,248,0.12);display:flex;align-items:center;justify-content:center;font-family:Syne,sans-serif;font-size:13px;font-weight:700;color:#3b7ef8;flex-shrink:0;">${(c.name||"?")[0].toUpperCase()}</div>
								<div style="flex:1;min-width:0;">
									<div style="font-size:13px;font-weight:600;color:#111827;">${me.escapeAttr(c.name)}</div>
									${c.role  ? `<div style="font-size:11px;color:#6b7280;">${me.escapeAttr(c.role)}</div>` : ""}
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
		$overlay.on("click", ".ql-con-pick-item", function() {
			const ci = parseInt($(this).data("ci"));
			if (!me.wizardContacts) me.wizardContacts = [];
			me.wizardContacts.push({ ...contacts[ci] });
			me._renderContactCardsList();
			$overlay.remove();
		});
		$overlay.on("mouseenter", ".ql-con-pick-item", function() { $(this).css({"border-color":"#3b7ef8","background":"rgba(59,126,248,0.04)"}); })
				.on("mouseleave", ".ql-con-pick-item", function() { $(this).css({"border-color":"rgba(0,0,0,0.08)","background":""}); });
		$overlay.on("click", "#qlConPickerClose, #qlConPickerCancel", () => $overlay.remove());
		$overlay.on("click", (e) => { if ($(e.target).is($overlay)) $overlay.remove(); });
	}

	// ── Item popup ──────────────────────────────────────────
	openItemPopup(type) {
		const me        = this;
		const isRenewal = type !== "new";
		const title     = type === "new" ? "Add Item" : type === "renewal" ? "Renewal Items" : "Additional Items";
		const icon      = type === "new" ? "ti-box" : type === "renewal" ? "ti-refresh" : "ti-stack-2";
		const iconColor = type === "new" ? "#3b7ef8" : type === "renewal" ? "#16a34a" : "#d97706";
		const CATALOGUE = me.wizardERP_Items.length ? me.wizardERP_Items : [];
		const RENEWALS  = (me.selectedCustomerDoc && me.selectedCustomerDoc.renewals) || [];
		const data      = isRenewal ? RENEWALS : CATALOGUE;
		const selected  = new Set();
		const groups    = [...new Set(CATALOGUE.map(i => i.group).filter(Boolean))].sort();
		const brands    = [...new Set(CATALOGUE.map(i => i.brand).filter(g => g && g !== "—"))].sort();
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
					<tr data-rid="${item.id}" class="${selected.has(item.id)?"ql-r-selected":""}" style="cursor:pointer;border-bottom:1px solid rgba(0,0,0,0.06);transition:background 0.12s;">
						<td style="padding:12px;"><input type="checkbox" ${selected.has(item.id)?"checked":""} style="accent-color:#3b7ef8;width:15px;height:15px;cursor:pointer;"></td>
						<td style="padding:12px;"><span style="font-size:12px;font-weight:700;color:#3b7ef8;font-family:Syne,sans-serif;">${me.escapeAttr(item.renewId||item.name)}</span></td>
						<td style="padding:12px;"><span style="font-size:13px;font-weight:600;color:#111827;">${me.escapeAttr(item.product_name||item.name)}</span></td>
						<td style="padding:12px;"><span style="display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;color:#d97706;background:rgba(217,119,6,0.1);padding:4px 10px;border-radius:20px;"><i class="ti ti-calendar-due" style="font-size:11px;"></i>${item.end_date||"—"}</span></td>
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
		const $body     = $overlay.find("#qlItemBody");
		const updateSel = () => $overlay.find("#qlItemSelCount").text(selected.size + " item(s) selected");

		const renderBody = () => {
			const q      = ($overlay.find("#qlItemSearch").val() || "").toLowerCase();
			const group  = $overlay.find("#qlItemGroup").val();
			const brand  = $overlay.find("#qlItemBrand").val();
			const filtered = data.filter(i =>
				(!q     || (i.name||"").toLowerCase().includes(q) || (i.code||"").toLowerCase().includes(q)) &&
				(!group || i.group === group) &&
				(!brand || i.brand === brand)
			);
			if (!isRenewal) $body.css({ display:"flex", "flex-direction":"column", gap:"8px", "grid-template-columns":"" });
			else            $body.css({ display:"block" });
			$body.html(renderGrid(filtered));
			$body.find(".ql-item-card").off("click").on("click", function() {
	            const id = parseInt($(this).data("iid"));
	            selected.has(id) ? selected.delete(id) : selected.add(id);
	            updateSel();
	            renderBody();
	        });
			$body.find("[data-rid]").off("click").on("click", function(e) {
				if ($(e.target).is("input")) return;
				const id = parseInt($(this).data("rid"));
				selected.has(id) ? selected.delete(id) : selected.add(id);
				$(this).toggleClass("ql-r-selected", selected.has(id));
				$(this).find("input[type=checkbox]").prop("checked", selected.has(id));
				updateSel();
			});
			$body.find("input[type=checkbox]").off("change").on("change", function() {
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
					qty:  Number(item.qty || 1),
					uom:  item.uom || "Nos",
					sp:   Number(item.sp || 0),
					bp:   Number(item.bp || 0),
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
		const me    = this;
		const $wrap = me.$content.find("#qlItemsTbody");
 
		if (!me.wizardItems.length) {
			$wrap.html(`<div style="text-align:center;padding:36px;color:#9ca3af;font-size:12px;">
				<i class="ti ti-inbox" style="font-size:28px;display:block;margin-bottom:8px;"></i>
				No items added yet. Click <strong>+ Add Item</strong> to get started.
			</div>`);
			me.calcTotals();
			return;
		}
 
		const typeLabel = { new:"New", renewal:"Renewal", additional:"Additional" };
		const typeColor = { new:"#3b7ef8", renewal:"#16a34a", additional:"#d97706" };
		const fmtINR    = n => Number(n||0).toLocaleString("en-IN", { minimumFractionDigits:2, maximumFractionDigits:2 });
 
		let cards = "";
		me.wizardItems.forEach((item, idx) => {
			const disc        = Number(item.discount || 0);
			const effSP       = Number(item.sp || 0) * (1 - disc/100);
			const sa          = Number(item.qty||0) * effSP;
			const rawSP       = Number(item.sp||0);
			const marginPct   = rawSP > 0 ? (((rawSP - Number(item.bp||0)) / rawSP) * 100) : 0;
			const marginColor = marginPct > 20 ? "#16a34a" : marginPct > 5 ? "#d97706" : "#dc2626";
			const marginAmt   = (rawSP - Number(item.bp||0)) * Number(item.qty||0);
			const hasDesc     = item.description && String(item.description).replace(/<[^>]*>/g,"").trim().length > 0;
			const orcOn       = !!item.orc;
			// type comes from renewal_status (fallback to .type for in-memory items)
			const itemType    = item.renewal_status || item.type || "new";
 
			cards += `
<div class="ql-item-card2 ql-drag-row" data-idx="${idx}" draggable="true">
 
	<!-- ROW 1: identity + pricing + delete -->
	<div class="ql-ic-row1">
		<div class="ql-ic-grip" title="Drag to reorder"><i class="ti ti-grip-vertical"></i></div>
		<div class="ql-ic-num">${idx+1}</div>
 
		<div class="ql-ic-item ql-ic-replace" data-idx="${idx}" title="Click to change item">
			<div class="ql-ic-name">${me.escapeAttr(item.name||"—")}</div>
			<div class="ql-ic-sub">
				${item.code ? me.escapeAttr(item.code) : ""}${item.code && item.brand && item.brand!=="—" ? "  ·  " : ""}${item.brand && item.brand!=="—" ? me.escapeAttr(item.brand) : ""}${(item.code || (item.brand && item.brand!=="—")) ? "  ·  " : ""}<span style="color:${typeColor[itemType]||"#3b7ef8"};font-weight:700;">${typeLabel[itemType]||"New"}</span>${item.renewId ? `<span class="ql-ic-renewid"><i class="ti ti-refresh"></i> ${me.escapeAttr(item.renewId)}</span>` : ""}
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
			<label class="ql-ic-label">&nbsp;</label>
			<button class="ql-item-del-btn ql-ic-del" data-idx="${idx}" type="button" title="Remove item">
				<i class="ti ti-trash"></i>
			</button>
		</div>
	</div>
 
	<!-- ROW 2: ORC · commission · rate · description (right aligned) -->
	<div class="ql-ic-row2">
		<div class="ql-ic-field" style="width:auto;align-items:flex-start;">
			<label class="ql-ic-label">ORC</label>
			<label class="ql-ic-orc-toggle">
				<input type="checkbox" class="ql-item-orc" ${orcOn?"checked":""} style="position:absolute;opacity:0;width:0;height:0;">
				<span class="ql-ic-orc-slider"></span>
			</label>
		</div>
		<div class="ql-ic-field ql-ic-orc-cond" style="width:150px;${orcOn?"":"display:none;"}">
			<label class="ql-ic-label">Commission Type</label>
			<select class="ql-item-commission-type ql-ic-input">
				<option value=""          ${!item.commission_type?"selected":""}>— Select —</option>
				<option value="Unit Rate" ${item.commission_type==="Unit Rate"?"selected":""}>Unit Rate</option>
				<option value="Value"     ${item.commission_type==="Value"?"selected":""}>Value</option>
			</select>
		</div>
		<div class="ql-ic-field ql-ic-orc-cond" style="width:140px;${orcOn?"":"display:none;"}">
			<label class="ql-ic-label">Rate / Value (₹)</label>
			<input class="ql-item-ratevalue ql-ic-input" type="number" step="0.01" value="${item.rate_value||""}" placeholder="0.00" style="text-align:right;">
		</div>
 
		<div class="ql-ic-field" style="width:34px;align-items:center;">
			<label class="ql-ic-label">Desc</label>
			<button class="ql-ic-desc-btn ${hasDesc?"has-desc":""}" data-idx="${idx}" type="button" title="Edit description">
				<i class="ti ${hasDesc?"ti-file-check":"ti-file-text"}"></i>
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
			const sp  = parseFloat($card.find(".ql-item-sp").val())  || 0;
			const bp  = parseFloat($card.find(".ql-item-bp").val())  || 0;
			const disc = Number(me.wizardItems[idx].discount || 0);
			const sa = qty * sp * (1 - disc/100);
			const marginAmt = (sp - bp) * qty;
			const marginPct = sp > 0 ? (((sp - bp) / sp) * 100) : 0;
			const fmt = v => "₹" + Number(v||0).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});
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
				me.wizardItems[idx].sp  = parseFloat($card.find(".ql-item-sp").val())  || 0;
				me.wizardItems[idx].bp  = parseFloat($card.find(".ql-item-bp").val())  || 0;
				recompute($card, idx);
				me.calcTotals();
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
				const nm = me.wizardItems[idx].name || `Item ${idx+1}`;
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
		const itemName = me.wizardItems[idx].name || `Item ${idx+1}`;
 
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
			const hasDesc = String(me.wizardItems[idx].description).replace(/<[^>]*>/g,"").trim().length > 0;
			const $btn = me.$content.find(`#qlItemsTbody .ql-ic-desc-btn[data-idx="${idx}"]`);
			$btn.toggleClass("has-desc", hasDesc);
			$btn.find("i").attr("class", `ti ${hasDesc?"ti-file-check":"ti-file-text"}`);
			close();
		});
	}

	calcTotals() {
		const me = this;
		let totalSell = 0;
		me.wizardItems.forEach((item, idx) => {
			const $row = me.$content.find(`#qlItemsTbody [data-idx="${idx}"]`);
			const qty  = parseFloat($row.find(".ql-item-qty").val()) || item.qty || 1;
			const sp   = parseFloat($row.find(".ql-item-sp").val())  || item.sp  || 0;
			const bp   = parseFloat($row.find(".ql-item-bp").val())  || item.bp  || 0;
			const disc = item.discount || 0;
			const sa   = qty * sp * (1 - disc / 100);
			const marginAmt = (sp - bp) * qty;
			const marginPct = sp > 0 ? (((sp - bp) / sp) * 100) : 0;
			totalSell += sa;
			const fmt = v => `₹${Number(v||0).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
			$row.find(".ql-sa-cell").text(fmt(sa));
			$row.find(".ql-margin-cell").text(fmt(marginAmt))
				.css("color", marginPct > 20 ? "#16a34a" : marginPct > 5 ? "#d97706" : "#dc2626");
		});
		const fmt = n => "₹ " + n.toLocaleString("en-IN", { minimumFractionDigits:2, maximumFractionDigits:2 });
		const totalQty = me.wizardItems.reduce((s, it, idx) =>
			s + (parseFloat(me.$content.find(`#qlItemsTbody [data-idx="${idx}"] .ql-item-qty`).val()) || it.qty || 1), 0);
		me.$content.find("#qlSumQtyLabel").text(totalQty % 1 === 0 ? totalQty : totalQty.toFixed(1));
		me.$content.find("#qlSumGrand").text(fmt(totalSell));
		return totalSell;
	}

	initDragDrop() {
		const me    = this;
		const $tbody = me.$content.find("#qlItemsTbody");
		let dragIdx  = null;
		$tbody.find(".ql-drag-row").each(function() {
			const el  = this;
			const idx = parseInt($(el).data("idx"));
			el.addEventListener("dragstart", (e) => { dragIdx = idx; e.dataTransfer.effectAllowed = "move"; $(el).css("opacity","0.4"); });
			el.addEventListener("dragend",   () => { $(el).css("opacity","1"); $tbody.find(".ql-drag-row").css("border-top",""); });
			el.addEventListener("dragover",  (e) => { e.preventDefault(); $tbody.find(".ql-drag-row").css("border-top",""); if (parseInt($(el).data("idx")) !== dragIdx) $(el).css("border-top","2px solid #3b7ef8"); });
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
			const ext  = f.name.split(".").pop().toLowerCase();
			const imap = { pdf:"ti-file-type-pdf", doc:"ti-file-type-doc", docx:"ti-file-type-doc", xls:"ti-file-spreadsheet", xlsx:"ti-file-spreadsheet", png:"ti-photo", jpg:"ti-photo" };
			me.$content.find("#qlAttPreview").append(`
				<div class="ql-att-item" data-fname="${me.escapeAttr(f.name)}">
					<i class="ti ${imap[ext]||"ti-file"}" style="font-size:18px;color:#3b7ef8;flex-shrink:0;"></i>
					<span style="font-size:11px;font-weight:500;color:#111827;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${me.escapeAttr(f.name)}</span>
					<i class="ti ti-x" style="font-size:13px;color:#9ca3af;cursor:pointer;flex-shrink:0;" data-del-file="${me.escapeAttr(f.name)}"></i>
				</div>`);
		});
		me.$content.on("click.qlNew", "[data-del-file]", function() {
			const name = $(this).data("delFile");
			me.wizardFiles = me.wizardFiles.filter(f => f.name !== name);
			$(this).closest(".ql-att-item").remove();
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
				me._quoteTaxCategory = (rc.message && rc.message.tax_category) || "";
				if (me._quoteTaxCategory) me.$content.find("#qlFTaxCategory").val(me._quoteTaxCategory);
				// if a template is already set, show its breakdown
				const tpl = me.$content.find("#qlFTaxes").val().trim();
				if (tpl) me.renderTaxBreakdown(tpl);
			},
		});
	}

	renderTaxBreakdown(templateName) {
		const me = this;
		const $box = me.$content.find("#qlTaxBreakdown");
		if (!templateName) { $box.hide().empty(); return; }

		// net total of items (taxable value)
		const netTotal = (me.wizardItems || []).reduce((s, it) =>
			s + Number(it.qty || 0) * Number(it.sp || 0) * (1 - (Number(it.discount || 0) / 100)), 0);

		frappe.call({
			method: "frappe.client.get",
			args: { doctype: "Sales Taxes and Charges Template", name: templateName },
			callback: (r) => {
				const taxes = (r.message && r.message.taxes) || [];
				if (!taxes.length) { $box.hide().empty(); return; }

				const fmt = n => "₹" + Number(n||0).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});
				let totalTax = 0;

				const rows = taxes.map((t, i) => {
					const rate = Number(t.rate || 0);
					// amount: On Net Total → netTotal × rate%. Actual amount field if present.
					let amt = Number(t.tax_amount || 0);
					if (!amt && t.charge_type === "On Net Total") amt = netTotal * rate / 100;
					totalTax += amt;
					return `
						<tr style="border-bottom:1px solid rgba(0,0,0,0.06);">
							<td style="padding:9px 12px;color:#9ca3af;font-size:11px;text-align:center;">${i+1}</td>
							<td style="padding:9px 12px;font-size:12px;color:#111827;">${me.escapeAttr(t.description || t.account_head || "—")}</td>
							<td style="padding:9px 12px;font-size:12px;color:#374151;">${me.escapeAttr(t.charge_type || "")}</td>
							<td style="padding:9px 12px;font-size:12px;text-align:right;font-weight:600;color:#3b7ef8;">${rate}%</td>
							<td style="padding:9px 12px;font-size:12px;text-align:right;font-weight:700;color:#111827;">${fmt(amt)}</td>
						</tr>`;
				}).join("");

				$box.html(`
					<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;margin-bottom:8px;">
						<i class="ti ti-receipt-tax" style="margin-right:4px;"></i>Tax Breakdown
					</div>
					<div style="border:1px solid rgba(0,0,0,0.08);border-radius:10px;overflow:hidden;">
						<table style="width:100%;border-collapse:collapse;">
							<thead><tr style="background:#f1f5f9;">
								<th style="padding:9px 12px;width:36px;border-bottom:1px solid rgba(0,0,0,0.08);font-size:10px;font-weight:700;text-transform:uppercase;color:#9ca3af;text-align:center;">#</th>
								<th style="padding:9px 12px;border-bottom:1px solid rgba(0,0,0,0.08);font-size:10px;font-weight:700;text-transform:uppercase;color:#9ca3af;text-align:left;">Description</th>
								<th style="padding:9px 12px;border-bottom:1px solid rgba(0,0,0,0.08);font-size:10px;font-weight:700;text-transform:uppercase;color:#9ca3af;text-align:left;">Type</th>
								<th style="padding:9px 12px;border-bottom:1px solid rgba(0,0,0,0.08);font-size:10px;font-weight:700;text-transform:uppercase;color:#9ca3af;text-align:right;">Rate</th>
								<th style="padding:9px 12px;border-bottom:1px solid rgba(0,0,0,0.08);font-size:10px;font-weight:700;text-transform:uppercase;color:#9ca3af;text-align:right;">Amount</th>
							</tr></thead>
							<tbody>${rows}</tbody>
							<tfoot><tr style="background:#f8fafc;">
								<td colspan="4" style="padding:10px 12px;text-align:right;font-weight:700;font-size:12px;color:#111827;">Total Tax</td>
								<td style="padding:10px 12px;text-align:right;font-weight:700;font-size:13px;color:#3b7ef8;">${fmt(totalTax)}</td>
							</tr></tfoot>
						</table>
					</div>`).show();
			},
			error: () => $box.hide().empty(),
		});
	}
	// Determine tax category + template from billing address GST state (like standard)
	determineTaxFromAddress() {
		const me = this;
		const company    = me.$content.find("#qlFCompany").val().trim();
		const addrName   = me.$content.find("#qlFAddress").val().trim();
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

	// ── Review (Step 4) ─────────────────────────────────────
	buildReview() {
		const me  = this;
		const g   = id => (me.$content.find(id).val() || "—").trim();
		const totalSell = me.calcTotals();
		const fmt = n => "₹ " + n.toLocaleString("en-IN", { minimumFractionDigits:2, maximumFractionDigits:2 });
		const subject     = g("#qlFSubject");
		const customer    = g("#qlFCustomer");
		const company     = g("#qlFCompany");
		const salesperson = g("#qlFSalesperson");
		const validTill   = g("#qlFValidTill");
		const payTerms    = g("#qlFPayTerms");
		const taxes       = g("#qlFTaxes");
		const address     = g("#qlFAddress");
		const shipAddress = g("#qlFShipAddress");
		const compAddress = g("#qlFCompanyAddress");
		const terms       = g("#qlFTerms");
		const colors = ["#3b7ef8","#16a34a","#d97706","#7c3aed","#dc2626"];

		const contactsHTML = me.wizardContacts.length
			? me.wizardContacts.map((c, i) => {
				const av  = (c.name||"?")[0].toUpperCase();
				const clr = colors[i % colors.length];
				return `<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid rgba(0,0,0,0.06);">
					<div style="width:36px;height:36px;border-radius:50%;background:${clr}1a;border:2px solid ${clr}33;display:flex;align-items:center;justify-content:center;font-family:Syne,sans-serif;font-size:14px;font-weight:700;color:${clr};flex-shrink:0;">${av}</div>
					<div style="flex:1;min-width:0;">
						<div style="font-weight:600;font-size:13px;color:#111827;">${me.escapeAttr(c.name||"—")}</div>
						${c.email ? `<div style="font-size:12px;color:#3b7ef8;margin-top:2px;"><i class="ti ti-mail" style="font-size:11px;margin-right:4px;color:#9ca3af;"></i>${me.escapeAttr(c.email)}</div>` : ""}
						${c.phone ? `<div style="font-size:12px;color:#374151;margin-top:2px;"><i class="ti ti-device-mobile" style="font-size:11px;margin-right:4px;color:#9ca3af;"></i>${me.escapeAttr(c.phone)}</div>` : ""}
					</div>
				</div>`;
			}).join("")
			: '<div style="padding:16px;text-align:center;color:#9ca3af;font-size:12px;">No contacts added</div>';

		const typeCls   = { new:"ql-type-new", renewal:"ql-type-renewal", additional:"ql-type-additional" };
		const typeLabel = { new:"New", renewal:"Renewal", additional:"Additional" };
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
					const sp  = item.sp * (1 - (item.discount||0)/100);
					const amt = item.qty * sp;
					return `<tr style="border-bottom:1px solid rgba(0,0,0,0.06);">
						<td style="padding:8px 10px;color:#9ca3af;font-size:11px;">${i+1}</td>
						<td style="padding:8px 10px;"><div style="font-weight:600;color:#111827;">${me.escapeAttr(item.name)}</div>${item.code?`<div style="font-size:10px;color:#9ca3af;">${me.escapeAttr(item.code)}</div>`:""}</td>
						<td style="padding:8px 10px;"><span class="ql-type-badge ${typeCls[item.type]||"ql-type-new"}">${typeLabel[item.type]||"New"}</span></td>
						<td style="padding:8px 10px;text-align:right;">${item.qty}</td>
						<td style="padding:8px 10px;text-align:right;">₹${sp.toLocaleString("en-IN",{minimumFractionDigits:2})}</td>
						<td style="padding:8px 10px;text-align:right;font-weight:600;">₹${amt.toLocaleString("en-IN",{minimumFractionDigits:2})}</td>
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
					${validTill   !== "—" ? `<span><i class="ti ti-calendar-due" style="margin-right:4px;"></i>Valid till ${me.escapeAttr(validTill)}</span>` : ""}
					${salesperson !== "—" ? `<span><i class="ti ti-user-check" style="margin-right:4px;"></i>${me.escapeAttr(salesperson)}</span>` : ""}
				</div>
			</div>
			<!-- Quotation details card -->
			<div class="ql-review-card">
				<div class="ql-review-card-title">Quotation Details</div>
				${subject     !== "—" ? `<div class="ql-review-row"><span>Subject</span><span>${me.escapeAttr(subject)}</span></div>` : ""}
				<div class="ql-review-row"><span>Customer</span><span>${me.escapeAttr(customer)}</span></div>
				${company     !== "—" ? `<div class="ql-review-row"><span>Company</span><span>${me.escapeAttr(company)}</span></div>` : ""}
				${salesperson !== "—" ? `<div class="ql-review-row"><span>Salesperson</span><span>${me.escapeAttr(salesperson)}</span></div>` : ""}
				${validTill   !== "—" ? `<div class="ql-review-row"><span>Valid Till</span><span>${me.escapeAttr(validTill)}</span></div>` : ""}
				${payTerms    !== "—" ? `<div class="ql-review-row"><span>Payment Terms</span><span>${me.escapeAttr(payTerms)}</span></div>` : ""}
				${terms       !== "—" ? `<div class="ql-review-row"><span>Terms &amp; Conditions</span><span>${me.escapeAttr(terms)}</span></div>` : ""}
				${taxes       !== "—" ? `<div class="ql-review-row"><span>Taxes &amp; Charges</span><span>${me.escapeAttr(taxes)}</span></div>` : ""}
				${address     !== "—" ? `<div class="ql-review-row"><span>Customer Address</span><span>${me.escapeAttr(address)}</span></div>` : ""}
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
	submitWizard() {
		const me = this;
		if (!me.validateWizardStep(1)) { me.goWizardStep(1); return; }

		const partyName = me.selectedCustomerDoc?.name || "";
		if (!partyName) { frappe.msgprint("Please select a Customer."); me.goWizardStep(1); return; }

		const contacts       = (me.wizardContacts || []).filter(c => c && (c.name || c.docname));
		const pocIdx = Number.isFinite(me.wizardPocIndex) ? me.wizardPocIndex : 0;
		const primaryContact = contacts[pocIdx] || contacts.find(c => c.docname) || contacts[0] || null;

		// build contact_list rows (user_name = Contact docname, poc flag)
		const contactList = contacts.map((c, i) => ({
			user_name:   c.docname || "",
			email_id:    c.email || "",
			mobile_no:   c.phone || "",
			designation: c.role || "",
			poc:         (i === pocIdx) ? 1 : 0,
		}));

		const $sp       = me.$content.find("#qlFSalesperson");
		const spDocname = ($sp.attr("data-docname") || "").trim() || ($sp.val() || "").trim();
		const salesTeam = spDocname ? [{ sales_person: spDocname, allocated_percentage: 100 }] : [];

		const validTill = me.$content.find("#qlFValidTill").val().trim();
		const subject   = me.$content.find("#qlFSubject").val().trim();
		const payTerms  = me.$content.find("#qlFPayTerms").val().trim();
		const taxes     = me.$content.find("#qlFTaxes").val().trim();
		const address   = me.$content.find("#qlFAddress").val().trim();
		const shipAddr  = me.$content.find("#qlFShipAddress").val().trim();
		const compAddr  = me.$content.find("#qlFCompanyAddress").val().trim();
		const terms     = me.$content.find("#qlFTerms").val().trim();

		const items = (me.wizardItems || []).map(it => ({
			item_code:       it.code  || "",
			item_name:       it.name  || "",
			description:     it.description || it.name || "",
			qty:             Number(it.qty || 0),
			uom:             it.uom || "Nos",
			rate:            Number(it.sp || 0) * (1 - (Number(it.discount || 0) / 100)),
			amount:          Number(it.qty || 0) * Number(it.sp || 0) * (1 - (Number(it.discount || 0) / 100)),
			renewal_status:  it.renewal_status || it.type || "new",   // ← type field (label "Type")
			orc:             it.orc ? 1 : 0,
			commission_type: it.commission_type || "",
			rate_value:      Number(it.rate_value || 0),
			// spq_rate / bp if the Quotation Item has a buying-price field — add here
		}));

		const doc = {
			doctype:                    "Quotation",
			quotation_to:               "Customer",
			party_name:                 partyName,
			customer_name:              me.$content.find("#qlFCustomer").val(),
			title:                      subject || me.$content.find("#qlFCustomer").val(),
			company:                    me.$content.find("#qlFCompany").val(),
			transaction_date:           new Date().toISOString().split("T")[0],
			valid_till:                 validTill || "",
			payment_terms_template:     payTerms  || "",
			tc_name:                    terms     || "",
			taxes_and_charges:          taxes     || "",
			customer_address:           address   || "",
			shipping_address_name:      shipAddr  || "",
			company_address:            compAddr  || "",
			opportunity:                me.fromOpportunity || "",
			contact_person:             primaryContact?.docname || "",
			contact_email:              primaryContact?.email   || "",
			contact_list:               contactList,
			sales_team:                 salesTeam,
			
			
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
			<div class="ql-field" style="margin-top:8px;margin-bottom:16px;">
	<label class="ql-field-label">Tax Category</label>
	<input class="ql-field-input" id="qlFTaxCategory" placeholder="Auto-filled from customer" readonly style="background:#f8fafc;color:#6b7280;">
</div>
				
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

					<div class="ql-field" style="margin-top:8px;margin-bottom:16px;">
						<label class="ql-field-label">Payment Terms</label>
						<div class="ql-link-wrap">
							<input class="ql-field-input" id="qlFPayTerms" placeholder="Search Payment Terms…" autocomplete="off">
							<i class="ti ti-receipt ql-link-icon"></i>
							<div class="ql-link-dd" id="qlPayTermsDD"></div>
						</div>
					</div>

					<div class="ql-field">
						<label class="ql-field-label">Terms &amp; Conditions</label>
						<div class="ql-link-wrap">
							<input class="ql-field-input" id="qlFTerms" placeholder="Search Terms &amp; Conditions…" autocomplete="off">
							<i class="ti ti-file-text ql-link-icon"></i>
							<div class="ql-link-dd" id="qlTermsDD"></div>
						</div>
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
						<button class="btn" id="qlSaveDraft" type="button"><i class="ti ti-device-floppy"></i> Save Draft</button>
						<button class="btn btn-primary" id="qlSubmitForm" type="button" style="background:#16a34a;border-color:transparent;"><i class="ti ti-send"></i> Submit Quotation</button>
					</div>
				</div>
			</div>

		</div>
	</div>`,

	detail: `
	<div class="ql-page">
		<div class="page-wrap">

			<!-- Breadcrumb -->
			<ol class="breadcrumb" style="background:transparent;padding:0;margin-bottom:10px;">
				<li class="breadcrumb-item"><a href="javascript:void(0)" style="color:#9ca3af;font-size:12px;">CRM</a></li>
				<li class="breadcrumb-item" style="padding-left:5px;"><a href="/app/quote-list" class="ql-back-btn" style="color:#9ca3af;font-size:12px;">Quotations</a></li>
				<li class="breadcrumb-item active" style="padding-left:5px;font-size:12px;color:#374151;" id="qlBreadcrumbId">—</li>
			</ol>

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
							<div class="fin-value" id="qlNetTotal">₹0.00</div>
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
						<button class="btn btn-primary" id="qlBtnOpenFrappe" type="button" title="Open in ERPNext">
							<i class="ti ti-external-link"></i> Open in ERPNext
						</button>
						<div class="vdivider"></div>
						<button class="btn ql-back-btn" type="button"><i class="ti ti-arrow-left"></i> Back</button>
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
							<span class="ql-mi-val" id="qlMetaCompany">—</span>
						</div>

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

				<div style="border:1px solid rgba(0,0,0,0.08);border-radius:10px;overflow:hidden;">
					<div style="overflow-x:auto;max-height:360px;overflow-y:auto;">
						<table style="width:100%;border-collapse:collapse;font-size:12px;min-width:560px;">
							<thead style="position:sticky;top:0;z-index:2;background:#f1f5f9;">
								<tr>
									<th style="padding:9px 8px;border-bottom:1px solid rgba(0,0,0,0.08);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;text-align:center;width:36px;">#</th>
									<th style="padding:9px 10px;border-bottom:1px solid rgba(0,0,0,0.08);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;text-align:left;">Item</th>
									<th style="padding:9px 8px;border-bottom:1px solid rgba(0,0,0,0.08);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;width:60px;">UOM</th>
									<th style="padding:9px 8px;border-bottom:1px solid rgba(0,0,0,0.08);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;text-align:right;width:70px;">Qty</th>
									<th style="padding:9px 8px;border-bottom:1px solid rgba(0,0,0,0.08);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;text-align:right;width:110px;">Rate (₹)</th>
									<th style="padding:9px 8px;border-bottom:1px solid rgba(0,0,0,0.08);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;text-align:right;width:120px;">Amount (₹)</th>
								</tr>
							</thead>
							<tbody id="qlItemsTableBody">
								<tr><td colspan="6" style="text-align:center;padding:32px;color:#9ca3af;font-size:12px;">Loading...</td></tr>
							</tbody>
						</table>
					</div>
				</div>

				<div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;padding-top:10px;border-top:1px solid rgba(0,0,0,0.08);">
					<div style="display:flex;align-items:center;gap:12px;">
						<span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;">Total Qty</span>
						<span id="qlItemsTotalQty" style="font-family:'Syne',sans-serif;font-size:18px;font-weight:700;color:#111827;">0</span>
					</div>
					<div style="text-align:right;">
						<div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;margin-bottom:3px;">Total Amount</div>
						<div id="qlItemsTotalAmt" style="font-family:'Syne',sans-serif;font-size:20px;font-weight:700;color:#3b7ef8;">₹0.00</div>
					</div>
				</div>
			</div>

			<!-- ACTIVITY -->
			<div class="card">
				<div style="display:flex;align-items:center;gap:0;border-bottom:2px solid rgba(0,0,0,0.07);padding:0 16px;margin:0 -16px 0;">
					<div style="font-size:14px;font-weight:700;color:#111827;padding:12px 16px 12px 0;white-space:nowrap;flex-shrink:0;border-right:1px solid rgba(0,0,0,0.08);margin-right:4px;">Activity</div>
					<div id="actTabs" style="display:flex;gap:0;overflow-x:auto;scrollbar-width:none;flex:1;">
						<div class="act-tab active" data-tab="notes"    style="padding:12px 14px;font-size:12px;font-weight:600;color:#3b7ef8;cursor:pointer;white-space:nowrap;border-bottom:2px solid #3b7ef8;margin-bottom:-2px;transition:all .15s;flex-shrink:0;">Notes</div>
						<div class="act-tab"        data-tab="calls"    style="padding:12px 14px;font-size:12px;font-weight:600;color:#9ca3af;cursor:pointer;white-space:nowrap;border-bottom:2px solid transparent;margin-bottom:-2px;transition:all .15s;flex-shrink:0;">Calls</div>
						<div class="act-tab"        data-tab="comments" style="padding:12px 14px;font-size:12px;font-weight:600;color:#9ca3af;cursor:pointer;white-space:nowrap;border-bottom:2px solid transparent;margin-bottom:-2px;transition:all .15s;flex-shrink:0;">Comments</div>
						<div class="act-tab"        data-tab="attachments" style="padding:12px 14px;font-size:12px;font-weight:600;color:#9ca3af;cursor:pointer;white-space:nowrap;border-bottom:2px solid transparent;margin-bottom:-2px;transition:all .15s;flex-shrink:0;">Attachments</div>
					</div>
				</div>

				<div id="actFilter" style="display:flex;gap:6px;padding:8px 16px;border-bottom:1px solid rgba(0,0,0,0.05);">
					<div class="act-filter active" data-filter="all"       style="padding:3px 12px;font-size:11px;font-weight:600;border-radius:20px;background:rgba(59,126,248,0.1);color:#3b7ef8;cursor:pointer;border:1px solid rgba(59,126,248,0.2);">All</div>
					<div class="act-filter"        data-filter="completed" style="padding:3px 12px;font-size:11px;font-weight:600;border-radius:20px;background:#f1f5f9;color:#6b7280;cursor:pointer;border:1px solid rgba(0,0,0,0.08);">Completed</div>
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
				<div id="inputCalls" class="act-input-area hidden">
					<div style="padding:14px 16px;border-bottom:1px solid rgba(0,0,0,0.06);">
						<div class="act-field" style="margin-bottom:12px;">
							<label class="act-field-label">Subject</label>
							<input id="callSubject" type="text" class="act-input" placeholder="e.g. Follow-up call">
						</div>
						<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">
							<div class="act-field"><label class="act-field-label">Start Date</label><input id="callStartDate" type="date" class="act-input"></div>
							<div class="act-field"><label class="act-field-label">Start Time</label><input id="callStartTime" type="time" class="act-input"></div>
							<div class="act-field"><label class="act-field-label">End Date</label><input id="callEndDate" type="date" class="act-input"></div>
							<div class="act-field"><label class="act-field-label">End Time</label><input id="callEndTime" type="time" class="act-input"></div>
						</div>
						<div class="act-field">
							<label class="act-field-label">Related To (Customer)</label>
							<input id="callRelatedTo" type="text" class="act-input" readonly style="background:#f8fafc;color:#6b7280;cursor:default;">
						</div>
					</div>
					<div class="act-input-actions">
						<button class="btn btn-primary" type="button" data-action="save-call"><i class="ti ti-check"></i> Log Call</button>
						<button class="btn" type="button" data-close-tab="calls">Cancel</button>
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