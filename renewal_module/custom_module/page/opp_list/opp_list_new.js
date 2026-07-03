frappe.pages['opp-list'].on_page_load = function (wrapper) {
	new OppListPage(wrapper);
};

frappe.pages['opp-list'].on_page_show = function (wrapper) {
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
			if (!frappe.opplist_page || frappe.opplist_page.wrapper !== pageWrapper) {
				frappe.opplist_page = new OppListPage(pageWrapper);
			}
			frappe.opplist_page.render();
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
		this.view = "list";
		this.hasFetched = false;
		this.hasFetchedOwners = false;
		this.isLoading = false;
		this.searchText = "";
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
		this.selectedRecord = null;
		this.records = [];
		this.detailRecord = null;
		this.detailActivities = [];
		this.detailAttachments = [];
		this.isLoadingDetail = false;
		this.activeTab = "notes";
		this.activeFilter = "all";
	}

	render() {
		const waitForContent = () => {
			const $content = $("#support-page-content");
			if (!$content.length) {
				setTimeout(waitForContent, 50);
				return;
			}

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
				if (routeName && routeName !== "new") {
					this.selectedRecord = this.records.find((row) => row.id === routeName) || null;
					this.detailRecord = null;
				} else {
					this.selectedRecord = null;
					this.detailRecord = null;
				}

				if (this.selectedRecord) {
					this.renderDetailView();
					return;
				}

				this.renderListView();
			})
			.finally(() => {
				this.isLoading = false;
			});
	}

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
				callback: (response) => {
					const rows = (response && response.message) || [];
					this.ownerOptions = rows.map((row) => ({
						value: row.name,
						label: row.full_name ? `${row.full_name} (${row.name})` : row.name,
					}));
					this.hasFetchedOwners = true;
					resolve();
				},
				error: () => {
					this.ownerOptions = [];
					resolve();
				},
			});
		});
	}

	renderListLoading() {
		this.page.set_title("Opportunities");
		document.title = "Opportunities";
		this.$content.html(
			`<div class="opp-list-view"><div class="card opp-list-card"><div class="opp-loading">Loading opportunities...</div></div></div>`
		);
	}

	fetchRecords() {
		if (this.hasFetched) return Promise.resolve();

		const callGetList = (limitStart, limitPageLength) => {
			return new Promise((resolve, reject) => {
				frappe.call({
					method: "frappe.client.get_list",
					args: {
						doctype: "Opportunity",
						fields: ["name", "customer_name", "party_name", "opportunity_from", "status", "opportunity_amount", "currency", "sales_stage", "expected_closing", "opportunity_owner", "company", "probability", "contact_email", "contact_mobile", "transaction_date", "creation"],
						limit_start: limitStart,
						limit_page_length: limitPageLength,
						order_by: "modified desc",
					},
					callback: (response) => {
						resolve((response && response.message) || []);
					},
					error: reject,
				});
			});
		};

		const pageLength = 500;
		let start = 0;
		let allRows = [];

		const fetchNextPage = () => {
			return callGetList(start, pageLength)
				.then((rows) => {
					allRows = allRows.concat(rows);
					if (rows.length < pageLength) return;
					start += pageLength;
					return fetchNextPage();
				});
		};

		return fetchNextPage()
			.then(() => {
				this.records = allRows.map((doc) => ({
					id: doc.name,
					subject: doc.party_name || doc.customer_name || doc.name,
					party: doc.customer_name || doc.party_name || "-",
					status: doc.status || "Open",
					amount: Number(doc.opportunity_amount || 0),
					owner: doc.opportunity_owner || "-",
					assigned_to: this.formatAge(doc.creation),
					stage: doc.sales_stage || "Prospecting",
					probability: doc.probability || 100,
					closing_date: doc.expected_closing || "",
				}));
				this.hasFetched = true;
			})
			.catch(() => {
				this.records = [];
			});
	}

	fetchDetailRecord(recordId) {
		return new Promise((resolve) => {
			frappe.call({
				method: "frappe.client.get",
				args: {
					doctype: "Opportunity",
					name: recordId,
				},
				callback: (response) => {
					this.detailRecord = (response && response.message) || null;
					resolve(this.detailRecord);
				},
				error: () => {
					this.detailRecord = null;
					resolve(null);
				},
			});
		});
	}

	fetchDetailActivities(recordId) {
		return new Promise((resolve) => {
			frappe.call({
				method: "frappe.client.get_list",
				args: {
					doctype: "Comment",
					fields: ["name", "content", "comment_type", "owner", "creation"],
					filters: { reference_doctype: "Opportunity", reference_name: recordId },
					limit_page_length: 500,
					order_by: "creation desc",
				},
				callback: (response) => {
					const comments = (response && response.message) || [];
					this.detailActivities = comments.map((comment) => {
						const type = comment.comment_type === "Comment" ? "Comment" : "Note";
						return {
							id: comment.name,
							title: comment.content || "",
							description: comment.content || "",
							type: type,
							tab: this.mapActivityTypeToTab(type),
							owner: comment.owner || frappe.session.user,
							created: this.formatActivityTime(comment.creation),
							status: "completed",
						};
					});
					resolve(this.detailActivities);
				},
				error: () => {
					console.warn("Could not fetch comments for record.");
					this.detailActivities = [];
					resolve([]);
				},
			});
		});
	}

	fetchDetailAttachments(recordId) {
		return new Promise((resolve) => {
			frappe.call({
				method: "frappe.client.get_list",
				args: {
					doctype: "File",
					fields: ["name", "file_name", "file_url", "creation", "owner"],
					filters: { attached_to_doctype: "Opportunity", attached_to_name: recordId },
					limit_page_length: 500,
					order_by: "creation desc",
				},
				callback: (response) => {
					const files = (response && response.message) || [];
					this.detailAttachments = files.map((file) => ({
						id: file.name,
						name: file.file_name || "",
						url: file.file_url || "",
						owner: file.owner || "",
						created: this.formatActivityTime(file.creation),
					}));
					resolve(this.detailAttachments);
				},
				error: () => {
					this.detailAttachments = [];
					resolve([]);
				},
			});
		});
	}

	mapActivityTypeToTab(type) {
		const map = {
			Note: "notes",
			Call: "calls",
			Appointment: "appointments",
			Comment: "comments",
		};
		return map[type] || "notes";
	}

	formatActivityTime(timestamp) {
		if (!timestamp) return "Just now";
		try {
			const created = frappe.datetime ? frappe.datetime.str_to_obj(timestamp) : new Date(timestamp);
			if (!created) return "Just now";
			const diffMs = Date.now() - created.getTime();
			const seconds = Math.floor(diffMs / 1000);
			const minutes = Math.floor(seconds / 60);
			const hours = Math.floor(minutes / 60);
			const days = Math.floor(hours / 24);
			
			if (seconds < 60) return "Just now";
			if (minutes < 60) return `${minutes}m ago`;
			if (hours < 24) return `${hours}h ago`;
			if (days < 7) return `${days}d ago`;
			
			const date = created.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
			return date;
		} catch (e) {
			return "Just now";
		}
	}

	renderListView() {
		this.view = "list";
		this.page.set_title("Opportunities");
		document.title = "Opportunities";

		const customerOptions = Array.from(new Set(this.records.map((row) => String(row.party || "").trim()).filter((name) => name && name !== "-"))).sort();
		const ownerOptions = this.ownerOptions.length
			? this.ownerOptions
			: Array.from(new Set(this.records.map((row) => String(row.owner || "").trim()).filter(Boolean))).sort().map((owner) => ({ value: owner, label: owner }));
		const rows = this.getFilteredRows();
		const visibleRows = rows.slice(0, this.pageSize);
		const visibleCount = visibleRows.length;
		const appliedCount = (this.saved_filters || []).length;
		const amountSortIcon = this.amountSortDir === "asc" ? "ti-sort-ascending" : this.amountSortDir === "desc" ? "ti-sort-descending" : "ti-arrows-sort";
		const amountSortClass = this.amountSortDir ? "opp-sort-active" : "";
		const statusOptions = ["", ...Array.from(new Set(this.records.map((row) => row.status).filter(Boolean)))];
		const tableRows = visibleRows
			.map((row) => {
				const customerName = row.party || "-";
				const safeCustomerName = this.escapeAttr(customerName);
				return `
					<tr class="opp-list-row" data-name="${row.id}">
						<td class="opp-id">${row.id}</td>
						<td>${row.subject}</td>
						<td class="opp-col-customer"><span class="opp-customer-text" title="${safeCustomerName}">${safeCustomerName}</span></td>
						<td><span class="opp-status ${this.getStatusClass(row.status)}">${row.status}</span></td>
						<td class="opp-amt">${this.formatCurrency(row.amount)}</td>
						<td>${row.owner}</td>
						<td>${row.assigned_to}</td>
					</tr>
				`;
			})
			.join("");

		this.$content.html(`
			<div class="opp-list-view">
				<div class="card opp-list-card">
					<div class="opp-list-toolbar">
						${this.renderMultiFilter("customer", customerOptions.map((customer) => ({ value: customer, label: customer })), this.selectedCustomers, "Customer")}
						${this.renderMultiFilter("owner", ownerOptions, this.selectedOwners, "Owner")}
						<select id="oppStatusFilter" class="opp-input opp-select">
							${statusOptions
								.map((status) => {
									const label = status || "Status";
									const selected = this.statusFilter === status ? "selected" : "";
									return `<option value="${status}" ${selected}>${label}</option>`;
								})
								.join("")}
						</select>
						<div class="opp-list-toolbar-right">
							<div class="opp-filter-wrap">
								<button id="oppOpenFilters" class="btn opp-filter-trigger" type="button" style="white-space: nowrap; padding: 0; overflow: hidden;">
									<span class="opp-filter-btn-label" style="display:inline-flex; align-items:center; gap:6px; padding: 7px 12px;"><i class="ti ti-filter"></i> Filters${appliedCount ? ` (${appliedCount})` : ""}</span>
									<span class="opp-filter-btn-close" style="display:none; align-items:center; justify-content:center; min-width:28px; padding: 7px 10px; border-left:1px solid rgba(15,23,42,0.12); cursor:pointer;">x</span>
								</button>
							</div>
							<button id="oppClearFilters" class="btn" type="button"><i class="ti ti-filter-off"></i> Clear</button>
							<button id="oppNewDoc" class="btn btn-primary" type="button"><i class="ti ti-plus"></i> New Opportunity</button>
						</div>
					</div>
					<div class="table-wrap opp-list-table-wrap">
						<table class="opp-list-table">
							<thead>
								<tr>
									<th>ID</th>
									<th>Subject</th>
									<th class="opp-col-customer">Customer</th>
									<th>Status</th>
									<th id="oppSortAmount" class="opp-sortable ${amountSortClass}">Amount <i class="ti ${amountSortIcon}"></i></th>
									<th>Owner</th>
									<th>Assigned To</th>
								</tr>
							</thead>
							<tbody>${tableRows || '<tr><td colspan="7" class="opp-empty">No records found</td></tr>'}</tbody>
						</table>
					</div>
					<div class="opp-list-footer">
						<div class="page-size-btns">
							<button class="ps-btn ${this.pageSize === 20 ? "active" : ""}" data-size="20" type="button">20</button>
							<button class="ps-btn ${this.pageSize === 100 ? "active" : ""}" data-size="100" type="button">100</button>
							<button class="ps-btn ${this.pageSize === 500 ? "active" : ""}" data-size="500" type="button">500</button>
							<button class="ps-btn ${this.pageSize === 2500 ? "active" : ""}" data-size="2500" type="button">2500</button>
						</div>
						<div class="record-count">${visibleCount} of ${rows.length}</div>
						<button id="oppLoadMore" class="load-more-btn" type="button" ${visibleCount >= rows.length ? "disabled" : ""}>Load More</button>
					</div>
				</div>
			</div>
		`);

		this.bindListActions();
	}

	renderMultiFilter(key, options, selectedValues, placeholder) {
		const selectedSet = new Set(selectedValues || []);
		const selectedCount = selectedSet.size;
		const triggerText = selectedCount ? `${placeholder} (${selectedCount})` : placeholder;
		const sortedOptions = [...(options || [])].sort((a, b) => {
			const aValue = String(a?.value || "").trim();
			const bValue = String(b?.value || "").trim();
			const aSelected = selectedSet.has(aValue) ? 0 : 1;
			const bSelected = selectedSet.has(bValue) ? 0 : 1;
			if (aSelected !== bSelected) return aSelected - bSelected;
			return String(a?.label || aValue).localeCompare(String(b?.label || bValue));
		});

		return `
			<div class="opp-multi-wrap">
				<div class="opp-multi" data-filter="${key}">
					<button type="button" class="opp-multi-trigger" data-filter-trigger="${key}">
						<span>${this.escapeAttr(triggerText)}</span>
						<i class="ti ti-chevron-down"></i>
					</button>
					<div class="opp-multi-menu" data-filter-menu="${key}">
						<div class="opp-multi-search-wrap">
							<input type="text" class="opp-multi-search" data-filter-search="${key}" placeholder="Search ${placeholder.toLowerCase()}..." />
						</div>
						<div class="opp-multi-options">
							${sortedOptions
								.map((option) => {
									const value = String(option.value || "").trim();
									const label = String(option.label || value).trim();
									if (!value) return "";
									const checked = selectedSet.has(value) ? "checked" : "";
									return `
										<label class="opp-multi-option" data-filter-option="${key}" data-label="${this.escapeAttr(label.toLowerCase())}">
											<input type="checkbox" class="opp-multi-checkbox" data-filter-check="${key}" value="${this.escapeAttr(value)}" ${checked}>
											<span>${this.escapeAttr(label)}</span>
										</label>
									`;
								})
								.join("")}
						</div>
					</div>
				</div>
			</div>
		`;
	}

	closeStandardFilterPopover(button) {
		const candidates = [];
		if (button) candidates.push($(button));
		if (this.activeFilterPopoverButton && this.activeFilterPopoverButton.length) candidates.push(this.activeFilterPopoverButton);
		candidates.push(this.$content ? this.$content.find("#oppOpenFilters") : $("#oppOpenFilters"));

		candidates.forEach(($btn) => {
			if (!$btn || !$btn.length) return;
			const instance = $btn.data("bs.popover");
			if (instance) {
				try {
					$btn.popover("hide");
				} catch (e) {}
				try {
					$btn.popover("dispose");
				} catch (e) {}
			}
			$btn.find(".opp-filter-btn-close").css("display", "none");
		});

		$("body > .popover.filter-popover").remove();
		$("body > .popover.show").remove();
		this.activeFilterPopoverButton = null;
		$(document).off("mousedown.oppStandardFilter");
	}

	openStandardFilterPopover(button) {
		const me = this;
		const DOCTYPE = this.filterDoctype || "Opportunity";
		const $btn = $(button);

		if (this.activeFilterPopoverButton && this.activeFilterPopoverButton.length && this.activeFilterPopoverButton[0] !== $btn[0]) {
			this.closeStandardFilterPopover(this.activeFilterPopoverButton);
		}

		const setFilterButtonState = (isOpen) => {
			const $close = $btn.find(".opp-filter-btn-close");
			if (!$close.length) return;
			$close.css("display", isOpen ? "inline-flex" : "none");
		};
		const safeClosePopover = () => {
			me.closeStandardFilterPopover($btn);
			setFilterButtonState(false);
		};

		if ($btn.data("bs.popover")) {
			safeClosePopover();
			return;
		}

		frappe.model.with_doctype(DOCTYPE, () => {
			if (!$btn.length || !$btn[0] || !document.body.contains($btn[0])) {
				return;
			}

			let popover_content = $('<div class="filter-area">');

			let FG = new frappe.ui.FilterGroup({
				parent: popover_content,
				doctype: DOCTYPE,
				on_change: function () {},
			});

			FG.update_filter_button = function () {};

			setTimeout(() => {
				if ((me.saved_filters || []).length) FG.add_filters(me.saved_filters);
				else FG.add_filter(DOCTYPE, "name", "=", "", false);
			}, 0);

			const footer = $(`
				<div class="filter-action-buttons opp-std-filter-footer mt-1 d-flex justify-content-between align-items-center">
					<button type="button" class="text-muted add-filter btn btn-xs opp-std-btn opp-std-btn-add">+ Add a Filter</button>
					<div class="filter-action-right">
						<button type="button" class="btn btn-secondary btn-xs clear-filters mr-2 opp-std-btn opp-std-btn-clear">Clear</button>
						<button type="button" class="btn btn-primary btn-xs apply-filters opp-std-btn opp-std-btn-apply">Apply</button>
					</div>
				</div>
			`);

			popover_content.find(".filter-action-buttons").remove();
			popover_content.append(footer);

			footer.css({
				marginTop: "2px",
				paddingTop: "3px",
				borderTop: "none",
				gap: "4px",
			});

			$btn.popover({
				content: popover_content,
				html: true,
				placement: "bottom",
				sanitize: false,
				customClass: "filter-popover",
				boundary: "viewport",
				trigger: "manual",
			});

			const show_popover = () => {
				$btn.popover("show");
				setFilterButtonState(true);
				me.activeFilterPopoverButton = $btn;
			};

			show_popover();

			footer.find(".add-filter").on("click", () => FG.add_filter(DOCTYPE, "name", "=", "", false));

			footer.find(".clear-filters").on("click", () => {
				FG.clear_filters();
			});

			footer.find(".apply-filters").on("click", () => {
				me.saved_filters = FG.get_filters() || [];
				safeClosePopover();
				me.pageSize = 20;
				me.renderListView();
			});

			$(document)
				.off("mousedown.oppStandardFilter")
				.on("mousedown.oppStandardFilter", (event) => {
					const $target = $(event.target);
					if (!$target.closest(".popover.filter-popover").length && !$target.closest("#oppOpenFilters").length) {
						safeClosePopover();
					}
				});
		});
	}

	renderDetailView() {
		this.view = "detail";
		
		if (!this.selectedRecord) {
			this.$content.html('<div style="padding:20px;text-align:center;">Record not found</div>');
			return;
		}

		if (this.isLoadingDetail) return;
		this.isLoadingDetail = true;

		this.$content.empty().html(
			'<div style="padding:40px;text-align:center;"><div class="spinner-border" role="status"></div><p style="margin-top:15px;">Loading opportunity details...</p></div>'
		);

		Promise.all([
			this.fetchDetailRecord(this.selectedRecord.id),
			this.fetchDetailActivities(this.selectedRecord.id),
			this.fetchDetailAttachments(this.selectedRecord.id),
		])
			.then(() => {
				this.$content.empty().append(this.renderDetailViewHtml());
				this.injectSelectedRecordInDetail();
				this.injectDetailActivities();
				this.injectDetailAttachments();
				this.setPageTitle();
				this.bindDetailActions();
			})
			.finally(() => {
				this.isLoadingDetail = false;
			});
	}

	renderDetailViewHtml() {
		return $(`
			<div class="opp-detail-view">
				<div class="opp-detail-header">
					<button id="oppDetailBack" class="btn btn-ghost"><i class="ti ti-arrow-left"></i> Back</button>
					<h3 id="oppDetailTitle">Opportunity</h3>
					<button id="oppDetailOpen" class="btn btn-primary"><i class="ti ti-external-link"></i> Open in ERPNext</button>
				</div>
				<div class="opp-detail-content">
					<div id="oppDetailMain"></div>
					<div id="activityList" style="margin-top:20px;"></div>
					<div id="attachmentsPanel" style="margin-top:20px;"></div>
				</div>
			</div>
		`);
	}

	injectSelectedRecordInDetail() {
		const doc = this.detailRecord;
		if (!doc) return;
		
		const $main = this.$content.find("#oppDetailMain");
		$main.html(`
			<div class="detail-card">
				<div class="detail-row">
					<span class="detail-label">Customer</span>
					<span class="detail-value">${this.escapeAttr(doc.customer_name || doc.party_name || "-")}</span>
				</div>
				<div class="detail-row">
					<span class="detail-label">Status</span>
					<span class="detail-value"><span class="badge" style="background:${this.getStatusColor(doc.status)}">${this.escapeAttr(doc.status)}</span></span>
				</div>
				<div class="detail-row">
					<span class="detail-label">Amount</span>
					<span class="detail-value">${this.formatCurrency(doc.opportunity_amount, doc.currency)}</span>
				</div>
				<div class="detail-row">
					<span class="detail-label">Stage</span>
					<span class="detail-value">${this.escapeAttr(doc.sales_stage || "-")}</span>
				</div>
				<div class="detail-row">
					<span class="detail-label">Probability</span>
					<span class="detail-value">${doc.probability || 100}%</span>
				</div>
				<div class="detail-row">
					<span class="detail-label">Owner</span>
					<span class="detail-value">${this.escapeAttr((doc.opportunity_owner || "").split("@")[0])}</span>
				</div>
				<div class="detail-row">
					<span class="detail-label">Expected Closing</span>
					<span class="detail-value">${doc.expected_closing ? frappe.datetime.str_to_user(doc.expected_closing) : "-"}</span>
				</div>
				<div class="detail-row">
					<span class="detail-label">Description</span>
					<span class="detail-value">${this.escapeAttr(doc.description || "-")}</span>
				</div>
			</div>
		`);
	}

	injectDetailActivities() {
		const $activityList = this.$content.find("#activityList");
		if (!$activityList.length) return;

		$activityList.empty().append('<h5 style="margin-bottom:15px;">Activities</h5>');

		if (!this.detailActivities.length) {
			$activityList.append('<div style="padding:20px;text-align:center;color:#9ca3af;">No activities yet</div>');
			return;
		}

		const $list = $('<div class="activity-list"></div>');
		this.detailActivities.forEach((activity) => {
			const $item = $(`
				<div class="activity-item">
					<div class="activity-icon"><i class="ti ti-message"></i></div>
					<div class="activity-body">
						<div class="activity-title">${this.escapeAttr(activity.title)}</div>
						<div class="activity-meta">${this.escapeAttr(activity.owner)} · ${activity.created}</div>
					</div>
				</div>
			`);
			$list.append($item);
		});
		$activityList.append($list);
	}

	injectDetailAttachments() {
		const $attachPanel = this.$content.find("#attachmentsPanel");
		if (!$attachPanel.length) return;

		$attachPanel.empty().append('<h5 style="margin-bottom:15px;">Attachments</h5>');

		if (!this.detailAttachments.length) {
			$attachPanel.append('<div style="padding:20px;text-align:center;color:#9ca3af;">No attachments yet</div>');
			return;
		}

		const attachmentsList = this.detailAttachments.map((file) => `
			<div style="display:flex;align-items:center;gap:12px;padding:12px;border-bottom:1px solid rgba(15,23,42,0.08);">
				<i class="ti ti-file" style="font-size:18px;color:#64748b;"></i>
				<div style="flex:1;min-width:0;">
					<div style="font-size:13px;font-weight:500;color:#0f172a;word-break:break-word;"><a href="${this.escapeAttr(file.url)}" target="_blank">${this.escapeAttr(file.name)}</a></div>
					<div style="font-size:12px;color:#9ca3af;margin-top:2px;">${this.escapeAttr(file.owner)} · ${file.created}</div>
				</div>
			</div>
		`).join("");

		$attachPanel.append(attachmentsList);
	}

	bindDetailActions() {
		this.$content
			.off("click.oppDetail", "#oppDetailBack")
			.on("click.oppDetail", "#oppDetailBack", () => {
				frappe.set_route("opp-list");
			});

		this.$content
			.off("click.oppDetail", "#oppDetailOpen")
			.on("click.oppDetail", "#oppDetailOpen", () => {
				frappe.set_route("Form", "Opportunity", this.selectedRecord.id);
			});
	}

	bindListActions() {
		this.$content
			.off("click.oppList", "[data-filter-trigger]")
			.on("click.oppList", "[data-filter-trigger]", (event) => {
				event.preventDefault();
				event.stopPropagation();
				const key = String($(event.currentTarget).data("filterTrigger") || "");
				const $currentMenu = this.$content.find(`[data-filter-menu='${key}']`);
				const willOpen = !$currentMenu.hasClass("open");
				this.$content.find("[data-filter-menu]").removeClass("open");
				if (willOpen) $currentMenu.addClass("open");
			});

		this.$content
			.off("change.oppList", ".opp-multi-checkbox")
			.on("change.oppList", ".opp-multi-checkbox", (event) => {
				const key = String($(event.currentTarget).data("filterCheck") || "");
				const values = this.$content
					.find(`.opp-multi-checkbox[data-filter-check='${key}']:checked`)
					.map((_, el) => String(el.value || "").trim())
					.get()
					.filter(Boolean);

				if (key === "customer") this.selectedCustomers = values;
				if (key === "owner") this.selectedOwners = values;
				this.pageSize = 20;
				this.renderListView();
			});

		this.$content
			.off("input.oppList", ".opp-multi-search")
			.on("input.oppList", ".opp-multi-search", (event) => {
				const key = String($(event.currentTarget).data("filterSearch") || "");
				const query = String($(event.currentTarget).val() || "").trim().toLowerCase();
				this.$content.find(`[data-filter-option='${key}']`).each((_, item) => {
					const label = String($(item).data("label") || "").toLowerCase();
					$(item).toggle(!query || label.includes(query));
				});
			});

		this.$content
			.off("click.oppList", "#oppOpenFilters .opp-filter-btn-close")
			.on("click.oppList", "#oppOpenFilters .opp-filter-btn-close", (event) => {
				event.preventDefault();
				event.stopPropagation();
				this.closeStandardFilterPopover(this.$content.find("#oppOpenFilters"));
			});

		this.$content
			.off("click.oppList", "#oppOpenFilters")
			.on("click.oppList", "#oppOpenFilters", (event) => {
				event.preventDefault();
				event.stopPropagation();
				if ($(event.target).closest(".opp-filter-btn-close").length) {
					this.closeStandardFilterPopover(event.currentTarget);
					return;
				}
				this.openStandardFilterPopover(event.currentTarget);
			});

		this.$content
			.off("change.oppList", "#oppStatusFilter")
			.on("change.oppList", "#oppStatusFilter", (event) => {
				this.statusFilter = String($(event.currentTarget).val() || "").trim();
				this.renderListView();
			});

		this.$content
			.off("click.oppList", "#oppClearFilters")
			.on("click.oppList", "#oppClearFilters", () => {
				this.selectedCustomers = [];
				this.selectedOwners = [];
				this.statusFilter = "";
				this.saved_filters = [];
				this.pageSize = 20;
				this.renderListView();
			});

		this.$content
			.off("click.oppList", "#oppSortAmount")
			.on("click.oppList", "#oppSortAmount", (event) => {
				event.preventDefault();
				if (!this.amountSortDir) {
					this.amountSortDir = "asc";
				} else if (this.amountSortDir === "asc") {
					this.amountSortDir = "desc";
				} else {
					this.amountSortDir = "";
				}
				this.renderListView();
			});

		this.$content
			.off("click.oppList", ".ps-btn")
			.on("click.oppList", ".ps-btn", (event) => {
				const size = Number($(event.currentTarget).data("size") || 20);
				if (!Number.isFinite(size) || size <= 0) return;
				this.pageSize = size;
				this.renderListView();
			});

		this.$content
			.off("click.oppList", "#oppLoadMore")
			.on("click.oppList", "#oppLoadMore", () => {
				this.pageSize += this.pageStep;
				this.renderListView();
			});

		this.$content
			.off("click.oppList", "#oppNewDoc")
			.on("click.oppList", "#oppNewDoc", () => {
				frappe.set_route("Form", "Opportunity");
			});

		this.$content
			.off("click.oppList", ".opp-list-row")
			.on("click.oppList", ".opp-list-row", (event) => {
				const name = String($(event.currentTarget).data("name") || "");
				const selected = this.records.find((row) => row.id === name);
				if (!selected) return;
				this.selectedRecord = selected;
				frappe.set_route("opp-list", name);
			});

		$(document)
			.off("click.oppListFilters")
			.on("click.oppListFilters", (event) => {
				if (!$(event.target).closest(".opp-multi").length) {
					this.$content.find("[data-filter-menu]").removeClass("open");
				}
			});
	}

	getFilteredRows() {
		const selectedCustomers = new Set(this.selectedCustomers);
		const selectedOwners = new Set(this.selectedOwners);
		const filtered = this.records.filter((row) => {
			if (this.statusFilter && row.status !== this.statusFilter) return false;
			if (selectedCustomers.size && !selectedCustomers.has(String(row.party || ""))) return false;
			if (selectedOwners.size && !selectedOwners.has(String(row.owner || ""))) return false;
			return true;
		});

		let sorted = [...filtered];
		if (this.amountSortDir === "asc") {
			sorted.sort((a, b) => a.amount - b.amount);
		} else if (this.amountSortDir === "desc") {
			sorted.sort((a, b) => b.amount - a.amount);
		}

		return sorted;
	}

	getStatusClass(status) {
		const classes = {
			"Open": "status-open",
			"Quotation": "status-quotation",
			"Converted": "status-converted",
			"Lost": "status-lost",
			"Replied": "status-replied",
			"Closed": "status-closed",
		};
		return classes[status] || "status-default";
	}

	getStatusColor(status) {
		const colors = {
			"Open": "#2490ef",
			"Quotation": "#d97706",
			"Converted": "#059669",
			"Lost": "#dc2626",
			"Replied": "#7c3aed",
			"Closed": "#6b7280",
		};
		return colors[status] || "#9ca3af";
	}

	formatCurrency(value, currency = "") {
		if (!value) return "-";
		try {
			return format_currency(flt(value), currency);
		} catch (e) {
			return `${currency || ""} ${flt(value).toFixed(2)}`;
		}
	}

	formatAge(timestamp) {
		if (!timestamp) return "Just now";
		try {
			const created = frappe.datetime ? frappe.datetime.str_to_obj(timestamp) : new Date(timestamp);
			if (!created) return "Just now";
			const diffMs = Date.now() - created.getTime();
			const seconds = Math.floor(diffMs / 1000);
			const minutes = Math.floor(seconds / 60);
			const hours = Math.floor(minutes / 60);
			const days = Math.floor(hours / 24);
			
			if (seconds < 60) return "Just now";
			if (minutes < 60) return `${minutes}m ago`;
			if (hours < 24) return `${hours}h ago`;
			if (days < 7) return `${days}d ago`;
			if (days < 30) return `${Math.floor(days / 7)}w ago`;
			if (days < 365) return `${Math.floor(days / 30)}mo ago`;
			
			return `${Math.floor(days / 365)}y ago`;
		} catch (e) {
			return "Just now";
		}
	}

	setPageTitle() {
		if (this.detailRecord) {
			const title = this.detailRecord.party_name || this.detailRecord.customer_name || this.detailRecord.name;
			this.page.set_title(title);
			document.title = title;
		}
	}

	escapeAttr(str) {
		return (str || "").replace(/[&<>"']/g, (char) => ({
			"&": "&amp;",
			"<": "&lt;",
			">": "&gt;",
			'"': "&quot;",
			"'": "&#39;",
		}[char]));
	}
}
