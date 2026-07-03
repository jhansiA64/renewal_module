frappe.pages['renewals'].on_page_load = function (wrapper) {
	new RenewalsPage(wrapper);
};

frappe.pages['renewals'].on_page_show = function (wrapper) {

	if (!frappe._rnFilterPopoverCleanup) {
		frappe._rnFilterPopoverCleanup = true;
		const sweep = () => {
			$("body > .popover.filter-popover, body > .popover.show").remove();
			try { $("#rnOpenFilters").popover("dispose"); } catch (e) {}
		};
		if (frappe.router && frappe.router.on) frappe.router.on("change", sweep);
		$(window).on("popstate.rnFilterSweep", sweep);
	}
	const pageWrapper = wrapper || $(".page")[0] || document.body;
	$("body").attr("data-route", "renewals");
	ensureRenewalsAssets();

	const ensureSupportLayoutLoaded = (cb) => {
		if (typeof loadSupportLayout === "function") return cb();
		frappe.require(["/assets/renewal_module/js/issue_themes/support_layout2.js"], () => {
			setTimeout(cb, 10);
		});
		frappe.require(["/assets/renewal_module/css/issue_themes/support_theme2.css"]);
	};

	ensureSupportLayoutLoaded(() => {
		loadSupportLayout(pageWrapper, () => {
			if (!frappe.renewals_page || frappe.renewals_page.wrapper !== pageWrapper) {
				frappe.renewals_page = new RenewalsPage(pageWrapper);
			}
			frappe.renewals_page.render();
		});
	});
};

function ensureRenewalsAssets() {
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


class RenewalsPage {
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
		this.filterDoctype = "Renewal List";
		this.activeFilterPopoverButton = null;
		this.amountSortDir = "";
		this.pageSize = 20;
		this.pageStep = 20;
		this.records = [];

		// ── Detail state ────────────────────────────────────
		this.selectedRecord = null;
		this.detailRecord = null;
		this.isLoadingDetail = false;
		this.detailItems = [];
		this.detailActivities = [];
		this.activeFilter = "scheduled";

		// ← add these two lines here
		this.activeTab = "activity";
		this.tabConfig = {
			calls: { label: "+ Log Call", icon: "ti-phone" },
			appointments: { label: "+ Appointment", icon: "ti-calendar-event" },
			tasks: { label: "+ Add Task", icon: "ti-checklist" },
			comments: { label: "+ Comment", icon: "ti-message-circle" },
			attachments: { label: null, icon: null },
		};

		// ── New-form (wizard) state ──────────────────────────
		this.wizardStep = 1;
		this.wizardItems = [];
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

	// Fields per memory: renewal_owner, end_date, total_amount, customer_name, status (RENEWAL_PENDING etc.)
	fetchRecords() {
    if (this.hasFetched) return Promise.resolve();
    const callGetList = (limitStart, limitPageLength) => new Promise((resolve, reject) => {
        frappe.call({
            method: "frappe.client.get_list",
            args: {
                doctype: "Renewal List",
                fields: ["name", "customer_name", "status", "renewal_owner", "total_amount",
                    "total_quantity", "start_date", "end_date", "product_name", "creation", "modified"],
                limit_start: limitStart, limit_page_length: limitPageLength,
                order_by: "modified desc, creation desc",
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
            subject: doc.product_name || doc.name,
            party: doc.customer_name || "-",
            status: doc.status || "New",
            amount: Number(doc.total_amount || 0),
            owner: doc.renewal_owner || "-",
            creation: doc.creation,
            modified: doc.modified,
            creation_fmt: this.formatDate(doc.creation),
            end_date: doc.end_date || "",
            end_date_fmt: doc.end_date ? this.formatDate(doc.end_date) : "—",
            urgency: this.urgencyFromEndDate(doc.end_date),
        }));
        this.hasFetched = true;
    }).catch(() => { this.records = []; });
}

	fetchDetailRecord(recordId) {
		return new Promise((resolve) => {
			frappe.call({
				method: "frappe.client.get",
				args: { doctype: "Renewal List", name: recordId },
				callback: (r) => { this.detailRecord = (r && r.message) || null; resolve(this.detailRecord); },
				error: () => { this.detailRecord = null; resolve(null); },
			});
		});
	}

	// Same shape as opp-list.js's fetchDetailActivities — Call List / Appointment /
	// Task / Comment, each filtered on reference = "Renewal List", reference_to = recordId.
	fetchDetailActivities(recordId) {
		return new Promise((resolve) => {
			Promise.all([
				// Call List
				new Promise(res => frappe.call({
					method: "frappe.client.get_list",
					args: {
						doctype: "Call List",
						fields: ["name", "owner", "creation"],
						filters: [
							["Call List", "reference", "=", "Renewal List"],
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
								meta: c.start_date ? `${c.start_date}${c.start_timing ? " " + c.start_timing : ""}` : "",
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
							["Appointment", "reference", "=", "Renewal List"],
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
									? new Date(c.scheduled_time).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
									: "",
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
							["Task", "reference", "=", "Renewal List"],
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
					error: () => res([]),
				})),

				// Comment
				new Promise(res => frappe.call({
					method: "frappe.client.get_list",
					args: {
						doctype: "Comment",
						fields: ["name", "content", "comment_type", "owner", "creation"],
						filters: [
							["Comment", "reference_doctype", "=", "Renewal List"],
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

			]).then(([calls, appointments, tasks, comments]) => {
				this.detailActivities = [...calls, ...appointments, ...tasks, ...comments];
				resolve(this.detailActivities);
			});
		});
	}

	// ─── HELPERS ──────────────────────────────────────────────────
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

	_htmlToText(html) {
		if (!html) return "";
		let s = String(html).replace(/<br\s*\/?>/gi, "\n");
		const tmp = document.createElement("div");
		tmp.innerHTML = s;
		return (tmp.textContent || tmp.innerText || "").trim();
	}

	// red ≤7 days, orange ≤30 days, green beyond — adjust once real thresholds are confirmed
	urgencyFromEndDate(endDate) {
		if (!endDate) return "green";
		try {
			const end = frappe.datetime ? frappe.datetime.str_to_obj(endDate) : new Date(endDate);
			if (!end) return "green";
			const days = Math.ceil((end.getTime() - Date.now()) / 86400000);
			if (days <= 7) return "red";
			if (days <= 30) return "orange";
			return "green";
		} catch (e) { return "green"; }
	}

	getStatusClass(status) {
		return {
			"New": "rn-b-pending",
			"RENEWAL_PENDING": "rn-b-pending",
			"In Progress": "rn-b-progress",
			"Renewed": "rn-b-won",
			"Lost": "rn-b-lost",
		}[status] || "rn-b-pending";
	}

	escapeAttr(value) {
		return String(value || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
	}

	getAvatarText(name) {
		const raw = String(name || "").trim();
		if (!raw || raw === "-") return "NA";
		const parts = raw.split(/\s+/).map((p) => p.replace(/[^A-Za-z0-9]/g, "")).filter(Boolean);
		if (!parts.length) return "NA";
		if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
		return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
	}

	// ─── LIST LOADING PLACEHOLDER ─────────────────────────────────
	renderListLoading() {
		this.page.set_title("Renewals");
		document.title = "Renewals";
		$("#support-page-content").removeClass("rn-content-scroll").addClass("rn-content-fixed");
		this.$content.html(`<div class="rn-list-view"><div class="card rn-list-card"><div class="rn-loading">Loading renewals...</div></div></div>`);
	}

	// ─── LIST VIEW ────────────────────────────────────────────────
	renderListView() {
    this.page.set_title("Renewals");
    document.title = "Renewals";
    $("#support-page-content").removeClass("rn-content-scroll").addClass("rn-content-fixed");

    const rows = this.getFilteredRows();
    const visibleRows = rows.slice(0, this.pageSize);
    const stats = this.calcListStats();

    const tableRows = visibleRows.map((row) => {
        const safeParty = this.escapeAttr(row.party);
        const safeOwner = this.escapeAttr(row.owner);
        const safeSubject = this.escapeAttr(row.subject);
        return `
        <tr class="rn-list-row" data-name="${row.id}">
            <td><span class="rn-urgency rn-u-${row.urgency}"></span></td>
            <td>
                <div class="rn-cell-primary" title="${safeSubject}">${safeSubject}</div>
                <div class="rn-cell-sub">${row.id}</div>
            </td>
            <td><span title="${safeParty}">${safeParty}</span></td>
            <td>${row.end_date_fmt}</td>
            <td class="rn-amount">${this.formatCurrency(row.amount)}</td>
            <td><div class="rn-owner"><div class="rn-avatar">${this.getAvatarText(row.owner)}</div>${safeOwner}</div></td>
            <td><span class="rn-badge ${this.getStatusClass(row.status)}">${row.status}</span></td>
            <td><i class="ti ti-chevron-right" style="color:var(--rn-text-faint)"></i></td>
        </tr>`;
    }).join("");

    this.$content.html(`
    <div class="rn-list-view">
        <div class="rn-page-head">
            <div><h1>Renewals</h1><p>${rows.length} active renewal(s) · ${this.formatCurrency(stats.totalValue)} total value at stake</p></div>
            <button id="rnNewBtn" class="rn-btn rn-btn-primary" type="button"><i class="ti ti-plus"></i> New Renewal</button>
        </div>

        <div class="rn-stats">
            <div class="rn-stat">
                <div class="rn-stat-top"><span class="rn-stat-label">Due this month</span><div class="rn-stat-icon rn-si-danger"><i class="ti ti-clock-exclamation"></i></div></div>
                <div class="rn-stat-value">${stats.dueThisMonth}</div>
            </div>
            <div class="rn-stat">
                <div class="rn-stat-top"><span class="rn-stat-label">Pending action</span><div class="rn-stat-icon rn-si-warning"><i class="ti ti-hourglass"></i></div></div>
                <div class="rn-stat-value">${stats.pending}</div>
            </div>
            <div class="rn-stat">
                <div class="rn-stat-top"><span class="rn-stat-label">Renewed (QTD)</span><div class="rn-stat-icon rn-si-success"><i class="ti ti-check"></i></div></div>
                <div class="rn-stat-value">${stats.renewedQtd}</div>
            </div>
            <div class="rn-stat">
                <div class="rn-stat-top"><span class="rn-stat-label">Value at risk</span><div class="rn-stat-icon rn-si-primary"><i class="ti ti-currency-rupee"></i></div></div>
                <div class="rn-stat-value">${this.formatCurrency(stats.valueAtRisk)}</div>
            </div>
        </div>

        <div class="card rn-list-card">
            <div class="rn-list-toolbar">
                <div class="rn-search"><i class="ti ti-search"></i><input id="rnSearchInput" placeholder="Search customer, renewal ID..." value="${this.escapeAttr(this._searchQuery || "")}"></div>
                <div class="rn-chip ${this._quickFilter === "all" || !this._quickFilter ? "on" : ""}" data-quick="all"><i class="ti ti-filter"></i> All</div>
                <div class="rn-chip ${this._quickFilter === "overdue" ? "on" : ""}" data-quick="overdue"><span class="rn-urgency rn-u-red" style="margin-right:0"></span> Overdue</div>
                <div class="rn-chip ${this._quickFilter === "mine" ? "on" : ""}" data-quick="mine"><i class="ti ti-user"></i> My renewals</div>
                <div class="rn-chip ${this._quickFilter === "quarter" ? "on" : ""}" data-quick="quarter"><i class="ti ti-calendar"></i> This quarter</div>
                <div style="flex:1"></div>
                <button id="rnClearFilters" class="rn-btn rn-btn-ghost" type="button"><i class="ti ti-filter-off"></i> Clear</button>
            </div>

            <div class="table-wrap rn-list-table-wrap">
                <table class="rn-table">
                    <thead>
                        <tr>
                            <th></th><th>Renewal</th><th>Customer</th><th>End Date</th>
                            <th>Amount</th><th>Owner</th><th>Status</th><th></th>
                        </tr>
                    </thead>
                    <tbody>${tableRows || '<tr><td colspan="8" class="rn-empty">No records found</td></tr>'}</tbody>
                </table>
            </div>

            <div class="rn-list-footer">
                <div class="rn-record-count">${visibleRows.length} of ${rows.length}</div>
                <button id="rnLoadMore" class="rn-btn rn-btn-ghost" type="button" ${visibleRows.length >= rows.length ? "disabled" : ""}>Load More</button>
            </div>
        </div>
    </div>`);

    this.bindListActions();
}

calcListStats() {
    const now = new Date();
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const qStartMonth = Math.floor(now.getMonth() / 3) * 3;
    const qStart = new Date(now.getFullYear(), qStartMonth, 1);

    let dueThisMonth = 0, pending = 0, renewedQtd = 0, valueAtRisk = 0, totalValue = 0;

    this.records.forEach((row) => {
        totalValue += Number(row.amount || 0);
        if (row.urgency === "red" || row.urgency === "orange") valueAtRisk += Number(row.amount || 0);
        if (row.status !== "Renewed" && row.status !== "Lost") pending++;
        if (row.end_date) {
            const end = frappe.datetime.str_to_obj(row.end_date) || new Date(row.end_date);
            if (end && end <= monthEnd && end >= now) dueThisMonth++;
        }
        if (row.status === "Renewed") {
			const mod = row.modified ? (frappe.datetime.str_to_obj(row.modified) || new Date(row.modified)) : null;
			if (mod && mod >= qStart) renewedQtd++;
		}
    });

    return { dueThisMonth, pending, renewedQtd, valueAtRisk, totalValue };
}



// ─── FILTER LOGIC ─────────────────────────────────────────────
	getFilteredRows() {
    const q = String(this._searchQuery || "").trim().toLowerCase();
    const now = new Date();
    const qStartMonth = Math.floor(now.getMonth() / 3) * 3;
    const qStart = new Date(now.getFullYear(), qStartMonth, 1);
    const qEnd = new Date(now.getFullYear(), qStartMonth + 3, 0);

    return this.records.filter((row) => {
        if (q && !(String(row.subject || "").toLowerCase().includes(q)
            || String(row.party || "").toLowerCase().includes(q)
            || String(row.id || "").toLowerCase().includes(q))) return false;

        if (this._quickFilter === "overdue" && row.urgency !== "red") return false;
        if (this._quickFilter === "mine" && row.owner !== frappe.session.user) return false;
        if (this._quickFilter === "quarter") {
            if (!row.end_date) return false;
            const end = frappe.datetime.str_to_obj(row.end_date) || new Date(row.end_date);
            if (!end || end < qStart || end > qEnd) return false;
        }
        return true;
    });
}

	// ─── LIST BINDINGS ────────────────────────────────────────────
	bindListActions() {
		this.$content.off("click.rn", ".rn-list-row")
			.on("click.rn", ".rn-list-row", (e) => {
				const name = String($(e.currentTarget).data("name") || "");
				const selected = this.records.find((r) => r.id === name);
				if (!selected) return;
				this.selectedRecord = selected;
				frappe.set_route("renewals", name);
			});

		this.$content.off("input.rn", "#rnSearchInput")
			.on("input.rn", "#rnSearchInput", (e) => {
				this._searchQuery = $(e.currentTarget).val() || "";
				this.pageSize = 20;
				this.renderListView();
				// re-focus + restore caret after re-render
				const $inp = this.$content.find("#rnSearchInput");
				$inp.val(this._searchQuery).focus();
			});
		
		this.$content.off("click.rn", "[data-quick]")
			.on("click.rn", "[data-quick]", (e) => {
				this._quickFilter = String($(e.currentTarget).data("quick") || "all");
				this.pageSize = 20;
				this.renderListView();
			});	

		this.$content.off("click.rn", "#rnClearFilters")
			.on("click.rn", "#rnClearFilters", () => {
				this._searchQuery = "";
				this.pageSize = 20;
				this.renderListView();
			});

		this.$content.off("click.rn", "#rnLoadMore")
			.on("click.rn", "#rnLoadMore", () => { this.pageSize += this.pageStep; this.renderListView(); });

		this.$content.off("click.rn", "#rnNewBtn")
			.on("click.rn", "#rnNewBtn", () => frappe.set_route("renewals", "new"));
	}

	// ─── DETAIL VIEW ──────────────────────────────────────────────
	renderDetailView() {
		if (!this.selectedRecord) { this.$content.html('<div style="padding:20px;text-align:center;">Record not found</div>'); return; }
		if (this.isLoadingDetail) return;
		this.isLoadingDetail = true;
		$("#support-page-content").removeClass("rn-content-fixed").addClass("rn-content-scroll");

		this.$content.html('<div style="padding:40px;text-align:center;"><div class="spinner-border" role="status"></div><p style="margin-top:15px;">Loading...</p></div>');

		this.fetchDetailRecord(this.selectedRecord.id)
			.then(() => this.fetchDetailActivities(this.selectedRecord.id))
			.then(() => {
				const record = this.detailRecord || this.selectedRecord;
				this.page.set_title(record.name || "Renewal");
				document.title = `Renewal — ${record.customer_name || this.selectedRecord.party}`;

				this.$content.html(`
					<div class="rn-shell-inner">
					<div class="rn-doctype-band">
						<div class="rn-band-icon"><i class="ti ti-refresh"></i></div>
						<div>
							<div class="rn-band-title">Renewal</div>
							<ol class="rn-band-breadcrumb">
								<li>CRM</li>
								<li class="rn-band-sep">/</li>
								<li><a href="javascript:void(0)" class="rn-back-btn">Renewals</a></li>
								<li class="rn-band-sep">/</li>
								<li class="rn-band-current">${this.escapeAttr(record.name)}</li>
							</ol>
						</div>
					</div>
						<div class="rn-detail-header">
    <div>
        <div class="rn-breadcrumb"><a href="javascript:void(0)" class="rn-back-btn">Renewals</a> / ${this.escapeAttr(record.name)}</div>
        <div class="rn-detail-title">
            <h2>${this.escapeAttr(record.product_name || "—")}</h2>
            <span class="rn-badge ${this.getStatusClass(record.status)}">${this.escapeAttr(record.status || "New")}</span>
        </div>
        <div class="rn-detail-customer-row">
            <a class="rn-customer-link" href="/app/customer/${encodeURIComponent(record.customer || record.customer_name || "")}"
                title="${this.escapeAttr(record.customer_name)}">${this.escapeAttr(record.customer_name || "—")}</a>
            <span class="rn-owner-inline"><i class="ti ti-user-check"></i> ${this.escapeAttr(record.renewal_owner || "Unassigned")}</span>
        </div>
        <div class="rn-detail-meta">
            <div class="rn-meta-item"><div class="rn-meta-label">End Date</div><div class="rn-meta-value">${record.end_date ? this.formatDate(record.end_date) : "—"}</div></div>
            <div class="rn-meta-item"><div class="rn-meta-label">Qty</div><div class="rn-meta-value">${Number(record.total_quantity || 0)}</div></div>
            <div class="rn-meta-item"><div class="rn-meta-label">Amount</div><div class="rn-meta-value">${this.formatCurrency(record.total_amount)}</div></div>
        </div>
    </div>
    <div class="rn-detail-actions">
        <button class="rn-btn rn-btn-ghost" id="rnSetReminderBtn"><i class="ti ti-bell"></i> Set Reminder</button>
        <button class="rn-btn rn-btn-primary" id="rnMarkRenewedBtn"><i class="ti ti-check"></i> Mark Renewed</button>
    </div>
</div>

						<div class="rn-detail-grid">
					<div>
						<div class="rn-card" style="margin-bottom:16px;">
							<div class="rn-card-head"><h3>Items</h3></div>
							<div id="rnItemsTableBody"></div>
						</div>

						<div class="rn-card">
    <div class="rn-act-header">
        <div class="rn-act-tab active" data-tab="activity">Activity</div>
        <div id="rnActTabs" class="rn-act-tabs">
            <div class="rn-act-tab" data-tab="calls">Calls</div>
            <div class="rn-act-tab" data-tab="appointments">Appointments</div>
            <div class="rn-act-tab" data-tab="tasks">Tasks</div>
            <div class="rn-act-tab" data-tab="comments">Comments</div>
            <div class="rn-act-tab" data-tab="attachments">Attachments</div>
        </div>
    </div>
    <div class="rn-act-filter" id="rnActFilter">
        <div class="rn-act-pill active" data-filter="scheduled">Scheduled</div>
        <div class="rn-act-pill" data-filter="completed">Completed</div>
        <div class="rn-act-pill" data-filter="all">All</div>
    </div>
    <div id="rnActivityList"></div>
    <div id="rnAttachmentsPanel" class="hidden" style="padding:16px 18px;color:var(--rn-text-faint);font-size:12px;">
        Attachments panel not wired yet — next part.
    </div>
    <div id="rnActBottom" class="rn-act-bottom"></div>
</div>
            </div>
        </div>

        <div>
            <div class="rn-card" style="margin-bottom:16px;">
                <div class="rn-card-head"><h3>Time to Renewal</h3></div>
                <div id="rnTimeToRenewal" class="rn-side-card"></div>
            </div>

            <div class="rn-card" style="margin-bottom:16px;">
                <div class="rn-card-head"><h3>Contact</h3></div>
                <div class="rn-side-card" style="font-size:12px;color:var(--rn-text-faint);">
                    Not wired yet — need to confirm whether Renewal List has a linked contact field.
                </div>
            </div>

            
        </div>
    </div>
</div>`);

this.injectItemsTable(record);
this.injectDetailActivities();
this.injectTimeToRenewal(record);
this.bindDetailActions();
			}).finally(() => { this.isLoadingDetail = false; });
	}

	// Renewal List's "items" child table — item_code, item_name, qty, uom, rate, amount
	// (same shape written by opp-list.js's _openRenewalPrompt when it creates a Renewal List).
	injectItemsTable(record) {
		const $wrap = this.$content.find("#rnItemsTableBody");
		const items = Array.isArray(record?.items) ? record.items : [];

		if (!items.length) {
			$wrap.html(`<div style="text-align:center;padding:28px;color:var(--rn-text-faint);font-size:12px;">
				<i class="ti ti-inbox" style="font-size:24px;display:block;margin-bottom:8px;"></i>No items on this renewal.
			</div>`);
			return;
		}

		const fmt = (n) => this.formatCurrency(n);
		const rows = items.map((it) => `
			<tr>
				<td>
					<div class="rn-cell-primary">${this.escapeAttr(it.item_name || it.item_code || "—")}</div>
					${it.item_code ? `<div class="rn-cell-sub">${this.escapeAttr(it.item_code)}</div>` : ""}
				</td>
				<td>${Number(it.qty || 0)}</td>
				<td>${it.uom || "Nos"}</td>
				<td>${fmt(it.rate)}</td>
				<td class="rn-amount">${fmt(it.amount)}</td>
			</tr>`).join("");

		const total = items.reduce((s, it) => s + Number(it.amount || 0), 0);

		$wrap.html(`
		<table class="rn-table rn-items-table">
			<thead><tr><th>Item</th><th>Qty</th><th>UOM</th><th>Rate</th><th>Amount</th></tr></thead>
			<tbody>${rows}</tbody>
			<tfoot><tr>
				<td colspan="4" style="text-align:right;font-weight:700;padding:12px 18px;">Total</td>
				<td class="rn-amount" style="padding:12px 18px;">${fmt(total)}</td>
			</tr></tfoot>
		</table>`);
	}


	injectTimeToRenewal(record) {
    const $wrap = this.$content.find("#rnTimeToRenewal");
    if (!record.end_date) {
        $wrap.html('<div style="font-size:12px;color:var(--rn-text-faint);">No end date set.</div>');
        return;
    }
    const start = record.start_date ? (frappe.datetime.str_to_obj(record.start_date) || new Date(record.start_date)) : null;
    const end = frappe.datetime.str_to_obj(record.end_date) || new Date(record.end_date);
    const now = new Date();
    const daysLeft = Math.ceil((end.getTime() - now.getTime()) / 86400000);

    let pct = 50;
    if (start) {
        const total = end.getTime() - start.getTime();
        const elapsed = now.getTime() - start.getTime();
        pct = total > 0 ? Math.min(100, Math.max(0, (elapsed / total) * 100)) : 50;
    }
    const barColor = daysLeft <= 7 ? "var(--rn-danger)" : daysLeft <= 30 ? "var(--rn-warning)" : "var(--rn-success)";

    $wrap.html(`
        <div style="display:flex;justify-content:space-between;font-size:12.5px;color:var(--rn-text-muted);">
            <span>${start ? "Contract started" : "Time remaining"}</span>
            <span>${daysLeft >= 0 ? daysLeft + " days left" : Math.abs(daysLeft) + " days overdue"}</span>
        </div>
        <div class="rn-progress-track"><div class="rn-progress-fill" style="width:${pct}%;background:${barColor}"></div></div>
        <div style="font-size:11.5px;color:var(--rn-text-faint);">${start ? this.formatDate(record.start_date) + " → " : ""}${this.formatDate(record.end_date)}</div>
    `);
}

	// Same list-item markup + filter logic as opp-list.js's injectDetailActivities/applyFilter,
	// scoped to Call/Appointment/Task/Comment (no Note doctype tie-in for renewals yet).
	injectDetailActivities() {
		const $list = this.$content.find("#rnActivityList");
		if (!$list.length) return;

		if (!this.detailActivities.length) {
			$list.html('<div style="padding:20px;text-align:center;color:var(--rn-text-faint);font-size:12px;">No activities yet</div>');
			return;
		}

		const iconMap = { Call: "ti-phone", Appointment: "ti-calendar-event", Task: "ti-checklist", Comment: "ti-message-circle" };
		const colorMap = { Call: "#16a34a", Appointment: "#d97706", Task: "#dc2626", Comment: "#7c3aed" };

		$list.html(this.detailActivities.map((a) => {
			const icon = iconMap[a.type] || "ti-notes";
			const color = colorMap[a.type] || "#9ca3af";
			return `
			<div class="rn-act-item" data-tab="${a.tab}" data-status="${a.status}">
				<div class="rn-act-icon" style="background:${color}15;color:${color};"><i class="ti ${icon}"></i></div>
				<div class="rn-act-body">
					<div class="rn-act-title">${this.escapeAttr(a.title)}</div>
					<div class="rn-act-meta">
						<span>${this.escapeAttr(a.owner)}</span><span>·</span><span>${a.created}</span>
						${a.meta ? `<span>·</span><span style="color:var(--rn-text);">${this.escapeAttr(a.meta)}</span>` : ""}
					</div>
				</div>
				<span class="rn-act-type-badge" style="background:${color}15;color:${color};">${this.escapeAttr(a.type)}</span>
			</div>`;
		}).join(""));

		this.applyActivityFilter();
	}

	applyActivityFilter() {
    const isAttach = this.activeTab === "attachments";
    const isActivity = this.activeTab === "activity";

    this.$content.find("#rnActivityList").toggle(!isAttach);
    this.$content.find("#rnAttachmentsPanel").toggleClass("hidden", !isAttach).toggle(isAttach);
    this.$content.find("#rnActFilter").toggle(!isAttach);
    this.$content.find("#rnActBottom").toggle(!isAttach);

    if (!isAttach) {
        this.$content.find("#rnActivityList .rn-act-item").each((_, item) => {
            const $item = $(item);
            const tabOk = isActivity || $item.data("tab") === this.activeTab;
            const isComments = this.activeTab === "comments";
            const filterOk = isComments || this.activeFilter === "all" || $item.data("status") === this.activeFilter;
            $item.css("display", tabOk && filterOk ? "flex" : "none");
        });
    }

    this.renderActBottomBtn();
}

renderActBottomBtn() {
    const cfg = this.tabConfig[this.activeTab];
    const $bottom = this.$content.find("#rnActBottom");
    if (!cfg || !cfg.label) { $bottom.empty(); return; }
    $bottom.html(`<button class="rn-btn rn-btn-ghost" type="button" data-add-tab="${this.activeTab}"><i class="ti ${cfg.icon}"></i> ${cfg.label}</button>`);
}

	bindDetailActions() {
		this.$content.off("click.rnD", ".rn-back-btn")
			.on("click.rnD", ".rn-back-btn", () => frappe.set_route("renewals"));

		this.$content.off("click.rnD", "#rnActFilter .rn-act-pill")
			.on("click.rnD", "#rnActFilter .rn-act-pill", (e) => {
				const $p = $(e.currentTarget);
				this.$content.find("#rnActFilter .rn-act-pill").removeClass("active");
				$p.addClass("active");
				this.activeFilter = String($p.data("filter") || "scheduled");
				this.applyActivityFilter();
			});

		this.$content.off("click.rnD", "#rnSetReminderBtn")
			.on("click.rnD", "#rnSetReminderBtn", () => {
				// TODO: create a Frappe ToDo against the renewal owner — matches
				// the "Set Reminder" pattern from the Renewal List read-only page.
				frappe.show_alert({ message: "Reminder flow not wired yet.", indicator: "orange" });
			});

		this.$content.off("click.rnD", "#rnMarkRenewedBtn")
			.on("click.rnD", "#rnMarkRenewedBtn", () => {
				// TODO: frappe.client.save with status = Renewed (confirm exact status value)
				frappe.show_alert({ message: "Mark Renewed not wired yet.", indicator: "orange" });
			});



	 
			this.$content.off("click.rnD", ".rn-act-tab")
    .on("click.rnD", ".rn-act-tab", (e) => {
        const tab = String($(e.currentTarget).data("tab") || "activity");
        this.$content.find(".rn-act-tab").removeClass("active");
        this.$content.find(`.rn-act-tab[data-tab="${tab}"]`).addClass("active");
        this.activeTab = tab;
        this.applyActivityFilter();
    });

this.$content.off("click.rnD", "#rnActFilter .rn-act-pill")
    .on("click.rnD", "#rnActFilter .rn-act-pill", (e) => {
        const $p = $(e.currentTarget);
        this.$content.find("#rnActFilter .rn-act-pill").removeClass("active");
        $p.addClass("active");
        this.activeFilter = String($p.data("filter") || "scheduled");
        this.applyActivityFilter();
    });
	}

	// ─── NEW FORM (WIZARD) ──────────────────────────────────────────
	renderNewView() {
		this.page.set_title("New Renewal");
		document.title = "New Renewal";
		$("#support-page-content").removeClass("rn-content-fixed").addClass("rn-content-scroll");

		this.wizardStep = 1;
		this.wizardItems = [];
		this.wizardERP_Items = [];

		this.$content.html(`
		<div class="rn-shell-inner rn-narrow">
			<div class="rn-wiz-head">
				<h1>New Renewal</h1>
				<p>Create a renewal record.</p>
			</div>

			<div class="rn-steps" id="rnSteps">
				<div class="rn-step active" data-step="1"><div class="rn-step-circle">1</div><div class="rn-step-label">Customer & Contract</div></div>
				<div class="rn-step-line"></div>
				<div class="rn-step" data-step="2"><div class="rn-step-circle">2</div><div class="rn-step-label">Items</div></div>
				<div class="rn-step-line"></div>
				<div class="rn-step" data-step="3"><div class="rn-step-circle">3</div><div class="rn-step-label">Payment & Terms</div></div>
				<div class="rn-step-line"></div>
				<div class="rn-step" data-step="4"><div class="rn-step-circle">4</div><div class="rn-step-label">Review</div></div>
			</div>

			<div class="rn-card">
				<div class="rn-wiz-panel active" data-panel="1">
					<div class="rn-form-grid" style="padding:22px 24px;">
						<div class="rn-field">
							<label>Customer <span class="req">*</span></label>
							<input class="rn-input" id="rnNewCustomer" placeholder="Search Customer…" autocomplete="off">
						</div>
						<div class="rn-field">
							<label>Renewal Owner <span class="req">*</span></label>
							<input class="rn-input" id="rnNewOwner" placeholder="Search User…" autocomplete="off">
						</div>
						<div class="rn-field">
							<label>Start Date</label>
							<input class="rn-input" type="date" id="rnNewStart">
						</div>
						<div class="rn-field">
							<label>End Date <span class="req">*</span></label>
							<input class="rn-input" type="date" id="rnNewEnd">
						</div>
					</div>
				</div>

				<div class="rn-wiz-panel" data-panel="2">
					<div class="rn-card-head">
						<h3>Items</h3>
						<button class="rn-btn rn-btn-primary" id="rnAddItemBtn" type="button" style="height:30px;padding:0 12px;font-size:12px;">
							<i class="ti ti-plus"></i> Add Item
						</button>
					</div>
					<div id="rnItemsTbody" style="padding:12px 18px;"></div>
					<div style="display:flex;justify-content:flex-end;gap:20px;padding:12px 18px;border-top:1px solid var(--rn-border);">
						<div style="font-size:12px;color:var(--rn-text-muted);">Total Qty: <b id="rnSumQty" style="color:var(--rn-text);">0</b></div>
						<div style="font-size:13px;">Total: <b id="rnSumAmt" class="rn-amount">₹0.00</b></div>
					</div>
				</div>

				<div class="rn-wiz-panel" data-panel="3">
					<div class="rn-form-grid" style="padding:22px 24px;">
						<div class="rn-field">
							<label>Payment Schedule</label>
							<select class="rn-input" id="rnPaySchedule">
								<option value="advance_delivery">Advance / On Delivery</option>
								<option value="full_advance">Full Advance</option>
								<option value="milestone">Milestone-based</option>
							</select>
						</div>
						<div class="rn-field">
							<label>Advance (%)</label>
							<input class="rn-input" type="number" min="0" max="100" id="rnPayAdvancePct" value="30">
						</div>
						<div class="rn-field">
							<label>Payment Due</label>
							<select class="rn-input" id="rnPayDue">
								<option value="Net 15">Net 15</option>
								<option value="Net 30">Net 30</option>
								<option value="Net 45">Net 45</option>
							</select>
						</div>
						<div class="rn-field" style="grid-column:1/-1;">
							<label>Terms & Notes</label>
							<textarea class="rn-input" id="rnPayNotes" rows="3" placeholder="Any special terms for this renewal…"></textarea>
						</div>
					</div>
					<div style="background:var(--rn-bg);border:1px dashed var(--rn-border);border-radius:var(--rn-radius);padding:14px 18px;margin:0 24px 22px;">
						<div style="font-size:11px;font-weight:700;color:var(--rn-text-muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px;">Payment Breakdown</div>
						<div class="rn-pay-line"><span>Advance</span><b id="rnPayAdvanceAmt">₹0.00</b></div>
						<div class="rn-pay-line"><span>Balance</span><b id="rnPayBalanceAmt">₹0.00</b></div>
					</div>
				</div>

				<div class="rn-wiz-panel" data-panel="4">
					<div style="padding:22px 24px;color:var(--rn-text-muted);font-size:13px;">Review — next.</div>
				</div>

				<div class="rn-wiz-footer">
					<button class="rn-btn rn-btn-ghost" id="rnWizBack" type="button" disabled><i class="ti ti-chevron-left"></i> Back</button>
					<div style="display:flex;gap:8px;">
						<button class="rn-btn rn-btn-ghost rn-back-btn" type="button">Cancel</button>
						<button class="rn-btn rn-btn-primary" id="rnWizNext" type="button">Next <i class="ti ti-chevron-right"></i></button>
					</div>
				</div>
			</div>
		</div>`);

		this.bindNewFormActions();
		this.renderItemsTable();
	}

	bindNewFormActions() {
		this.$content.off("click.rnN", ".rn-back-btn")
			.on("click.rnN", ".rn-back-btn", () => frappe.set_route("renewals"));

		this.$content.off("click.rnN", "#rnWizNext")
			.on("click.rnN", "#rnWizNext", () => {
				if (!this.validateWizardStep(this.wizardStep)) return;
				if (this.wizardStep < 4) this.goWizardStep(this.wizardStep + 1);
			});

		this.$content.off("click.rnN", "#rnWizBack")
			.on("click.rnN", "#rnWizBack", () => {
				if (this.wizardStep > 1) this.goWizardStep(this.wizardStep - 1);
			});

		this.$content.off("click.rnN", ".rn-step")
			.on("click.rnN", ".rn-step", (e) => {
				const n = parseInt($(e.currentTarget).data("step"));
				if (n < this.wizardStep) this.goWizardStep(n);
			});

		this.$content.off("click.rnN", "#rnAddItemBtn")
			.on("click.rnN", "#rnAddItemBtn", () => this.openItemPopup());

		this.$content.off("input.rnN change.rnN", "#rnPaySchedule, #rnPayAdvancePct, #rnPayDue, #rnPayNotes")
			.on("input.rnN change.rnN", "#rnPaySchedule, #rnPayAdvancePct, #rnPayDue, #rnPayNotes", () => {
				this.calcPaymentBreakdown();
			});
	}

	goWizardStep(n) {
		this.wizardStep = n;
		this.$content.find(".rn-wiz-panel").removeClass("active");
		this.$content.find(`[data-panel="${n}"]`).addClass("active");
		this.$content.find(".rn-step").each(function () {
			const sn = parseInt($(this).data("step"));
			$(this).removeClass("active done");
			if (sn === n) $(this).addClass("active");
			else if (sn < n) $(this).addClass("done");
		});
		this.$content.find("#rnWizBack").prop("disabled", n === 1);
		this.$content.find("#rnWizNext").html(n === 4 ? 'Create Renewal <i class="ti ti-check"></i>' : 'Next <i class="ti ti-chevron-right"></i>');

		if (n === 3) this.calcPaymentBreakdown();
	}

	validateWizardStep(n) {
		if (n === 1) {
			if (!this.$content.find("#rnNewCustomer").val().trim()) { frappe.msgprint("Please select a Customer."); return false; }
			if (!this.$content.find("#rnNewEnd").val().trim()) { frappe.msgprint("Please set an End Date."); return false; }
		}
		if (n === 2 && !this.wizardItems.length) {
			frappe.msgprint("Please add at least one item.");
			return false;
		}
		return true;
	}

	// Item picker — searches the Item doctype live, same idea as opp-list.js's item popup
	// but trimmed down (no group/brand/tenure filters for now).
	openItemPopup() {
		const me = this;
		$("#rnItemPopupOverlay").remove();

		const $overlay = $(`
		<div id="rnItemPopupOverlay" style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9000;display:flex;align-items:center;justify-content:center;padding:20px;">
			<div style="background:#fff;border-radius:14px;width:100%;max-width:520px;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 24px 64px rgba(0,0,0,0.18);">
				<div style="padding:16px 20px;border-bottom:1px solid var(--rn-border);display:flex;align-items:center;justify-content:space-between;">
					<div style="font-family:Syne,sans-serif;font-size:15px;font-weight:700;">Add Item</div>
					<button id="rnItemPopupClose" style="border:none;background:transparent;cursor:pointer;font-size:16px;color:var(--rn-text-faint);"><i class="ti ti-x"></i></button>
				</div>
				<div style="padding:12px 20px;border-bottom:1px solid var(--rn-border);">
					<input id="rnItemSearch" class="rn-input" placeholder="Search item name or code…">
				</div>
				<div id="rnItemPopupBody" style="flex:1;overflow-y:auto;padding:10px 20px;"></div>
			</div>
		</div>`);
		$("body").append($overlay);

		const renderResults = (rows) => {
			const $body = $overlay.find("#rnItemPopupBody");
			if (!rows.length) { $body.html('<div style="text-align:center;padding:24px;color:var(--rn-text-faint);font-size:12px;">No items found</div>'); return; }
			$body.html(rows.map(it => `
				<div class="rn-item-pick" data-code="${me.escapeAttr(it.item_code || it.name)}"
					style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border:1px solid var(--rn-border);border-radius:8px;margin-bottom:6px;cursor:pointer;">
					<div><div style="font-weight:600;font-size:13px;">${me.escapeAttr(it.item_name || it.name)}</div>
						<div style="font-size:11px;color:var(--rn-text-faint);">${me.escapeAttr(it.item_code || it.name)}</div></div>
					<div class="rn-amount">${me.formatCurrency(it.standard_rate)}</div>
				</div>`).join(""));
			$body.find(".rn-item-pick").on("click", function () {
				const code = $(this).data("code");
				const item = rows.find(r => (r.item_code || r.name) === code);
				if (item) me.addWizardItem(item);
				$overlay.remove();
			});
		};

		const doSearch = (q) => {
			frappe.call({
				method: "frappe.client.get_list",
				args: {
					doctype: "Item",
					fields: ["name", "item_name", "item_code", "stock_uom", "standard_rate"],
					filters: q ? [["Item", "item_name", "like", `%${q}%`]] : { disabled: 0 },
					limit_page_length: 30, order_by: "item_name asc",
				},
				callback: (r) => renderResults(r.message || []),
			});
		};

		doSearch("");
		$overlay.on("input", "#rnItemSearch", (e) => doSearch($(e.currentTarget).val().trim()));
		$overlay.on("click", "#rnItemPopupClose", () => $overlay.remove());
		$overlay.on("click", (e) => { if ($(e.target).is($overlay)) $overlay.remove(); });
	}

	addWizardItem(item) {
		this.wizardItems.push({
			name: item.item_name || item.name,
			code: item.item_code || item.name,
			uom: item.stock_uom || "Nos",
			qty: 1,
			rate: Number(item.standard_rate || 0),
		});
		this.renderItemsTable();
	}

	renderItemsTable() {
		const me = this;
		const $wrap = this.$content.find("#rnItemsTbody");
		if (!$wrap.length) return;

		if (!this.wizardItems.length) {
			$wrap.html('<div style="text-align:center;padding:24px;color:var(--rn-text-faint);font-size:12px;"><i class="ti ti-inbox" style="font-size:22px;display:block;margin-bottom:6px;"></i>No items added yet.</div>');
			this.calcWizardTotals();
			return;
		}

		$wrap.html(this.wizardItems.map((it, idx) => `
			<div class="rn-wiz-item-row" data-idx="${idx}" style="display:grid;grid-template-columns:2fr 70px 110px 110px 34px;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid var(--rn-border);">
				<div><div style="font-weight:600;font-size:13px;">${me.escapeAttr(it.name)}</div><div class="rn-cell-sub">${me.escapeAttr(it.code)}</div></div>
				<input class="rn-input rn-wiz-qty" type="number" min="1" value="${it.qty}" style="padding:6px 8px;">
				<input class="rn-input rn-wiz-rate" type="number" min="0" step="0.01" value="${it.rate}" style="padding:6px 8px;">
				<div class="rn-amount rn-wiz-amt" style="text-align:right;">${me.formatCurrency(it.qty * it.rate)}</div>
				<button class="rn-wiz-item-del" data-idx="${idx}" type="button" style="border:none;background:transparent;color:var(--rn-danger);cursor:pointer;"><i class="ti ti-trash"></i></button>
			</div>`).join(""));

		this.calcWizardTotals();

		$wrap.off("input.rnWizItem", ".rn-wiz-qty, .rn-wiz-rate")
			.on("input.rnWizItem", ".rn-wiz-qty, .rn-wiz-rate", (e) => {
				const $row = $(e.currentTarget).closest(".rn-wiz-item-row");
				const idx = parseInt($row.data("idx"));
				if (!this.wizardItems[idx]) return;
				this.wizardItems[idx].qty = parseFloat($row.find(".rn-wiz-qty").val()) || 1;
				this.wizardItems[idx].rate = parseFloat($row.find(".rn-wiz-rate").val()) || 0;
				$row.find(".rn-wiz-amt").text(this.formatCurrency(this.wizardItems[idx].qty * this.wizardItems[idx].rate));
				this.calcWizardTotals();
			});

		$wrap.off("click.rnWizItem", ".rn-wiz-item-del")
			.on("click.rnWizItem", ".rn-wiz-item-del", (e) => {
				const idx = parseInt($(e.currentTarget).data("idx"));
				this.wizardItems.splice(idx, 1);
				this.renderItemsTable();
			});
	}

	calcWizardTotals() {
		const totalQty = this.wizardItems.reduce((s, it) => s + Number(it.qty || 0), 0);
		const totalAmt = this.wizardItems.reduce((s, it) => s + Number(it.qty || 0) * Number(it.rate || 0), 0);
		this.$content.find("#rnSumQty").text(totalQty);
		this.$content.find("#rnSumAmt").text(this.formatCurrency(totalAmt));
	}

	// No confirmed field names on Renewal List for payment schedule/advance % yet —
	// this computes and displays the breakdown but wizardPayment isn't persisted
	// anywhere on submit until those fields (or a child table) exist on the doctype.
	calcPaymentBreakdown() {
		const totalAmt = this.wizardItems.reduce((s, it) => s + Number(it.qty || 0) * Number(it.rate || 0), 0);
		const schedule = this.$content.find("#rnPaySchedule").val() || "advance_delivery";
		let pct = parseFloat(this.$content.find("#rnPayAdvancePct").val()) || 0;
		if (schedule === "full_advance") pct = 100;
		pct = Math.min(100, Math.max(0, pct));

		const advanceAmt = totalAmt * (pct / 100);
		const balanceAmt = totalAmt - advanceAmt;

		this.$content.find("#rnPayAdvanceAmt").text(`${this.formatCurrency(advanceAmt)} (${pct}%)`);
		this.$content.find("#rnPayBalanceAmt").text(`${this.formatCurrency(balanceAmt)} (${(100 - pct).toFixed(0)}%)`);

		this.wizardPayment = {
			schedule, advance_pct: pct,
			advance_amount: advanceAmt, balance_amount: balanceAmt,
			payment_due: this.$content.find("#rnPayDue").val() || "Net 30",
			notes: this.$content.find("#rnPayNotes").val() || "",
		};
	}
}