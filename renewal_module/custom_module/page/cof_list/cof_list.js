frappe.pages['cof-list'].on_page_load = function (wrapper) {
	new CofListPage(wrapper);
};

frappe.pages['cof-list'].on_page_show = function (wrapper) {
	const pageWrapper = wrapper || $(".page")[0] || document.body;
	$("body").attr("data-route", "cof-list");
	ensureCofListAssets();

	const ensureSupportLayoutLoaded = (cb) => {
		if (typeof loadSupportLayout === "function") return cb();
		frappe.require(["/assets/renewal_module/js/issue_themes/support_layout2.js"], () => {
			setTimeout(cb, 10);
		});
		frappe.require(["/assets/renewal_module/css/issue_themes/support_theme2.css"]);
	};

	ensureSupportLayoutLoaded(() => {
		loadSupportLayout(pageWrapper, () => {
			if (!frappe.coflist_page || frappe.coflist_page.wrapper !== pageWrapper) {
				frappe.coflist_page = new CofListPage(pageWrapper);
			}
			frappe.coflist_page.render();
		});
	});
};

function ensureCofListAssets() {
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

class CofListPage {
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
		this.filterDoctype = "Customer Order Form";
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
		this.currentStage = 0;
		this.tabConfig = {
			notes: { label: "+ Add Note", icon: "ti-notes", inputId: "inputNotes" },
			calls: { label: "+ Call", icon: "ti-phone", inputId: "inputCalls" },
			appointments: { label: "+ Appointment", icon: "ti-calendar-event", inputId: "inputAppointments" },
			comments: { label: "+ Add Comment", icon: "ti-message-circle", inputId: "inputComments" },
			attachments: { label: null, icon: null, inputId: null },
		};
		this.wfStages = [
			{
				status: "Draft",
				dot: "#9ca3af",
				label: "Current Stage: Draft",
				actions: [{ label: "Submit for Approval", desc: "Move to pending review", icon: "ti-send", color: "#3b7ef8", bg: "rgba(59,126,248,0.1)", next: 1 }],
			},
			{
				status: "Pending Approval",
				dot: "#d97706",
				label: "Current Stage: Pending Approval",
				actions: [
					{ label: "Approve", desc: "Mark as approved and proceed", icon: "ti-circle-check", color: "#16a34a", bg: "rgba(22,163,74,0.1)", next: 2 },
					{ label: "Reject", desc: "Send back with comments", icon: "ti-circle-x", color: "#dc2626", bg: "rgba(220,38,38,0.1)", next: 3 },
				],
			},
			{
				status: "Approved",
				dot: "#16a34a",
				label: "Current Stage: Approved",
				actions: [{ label: "Convert to Order", desc: "Create sales order", icon: "ti-shopping-cart", color: "#3b7ef8", bg: "rgba(59,126,248,0.1)", next: 4 }],
			},
			{
				status: "Rejected",
				dot: "#dc2626",
				label: "Current Stage: Rejected",
				actions: [{ label: "Revise & Resubmit", desc: "Edit and submit again", icon: "ti-refresh", color: "#d97706", bg: "rgba(217,119,6,0.1)", next: 0 }],
			},
			{ status: "Order Created", dot: "#16a34a", label: "Current Stage: Order Created", actions: [] },
		];
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
		this.page.set_title("Customer Order Forms");
		document.title = "Customer Order Forms";
		this.$content.html(
			`<div class="cof-list-view"><div class="card cof-list-card"><div class="cof-loading">Loading customer order forms...</div></div></div>`
		);
	}

	fetchRecords() {
		if (this.hasFetched) return Promise.resolve();

		const callGetList = (limitStart, limitPageLength) => {
			return new Promise((resolve, reject) => {
				frappe.call({
					method: "frappe.client.get_list",
					args: {
						doctype: "Customer Order Form",
						fields: ["name", "subject", "status", "customer", "owner", "grand_total", "creation"],
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
					subject: doc.subject || doc.name,
					party: doc.customer || "-",
					status: doc.status || "Draft",
					amount: Number(doc.grand_total || 0),
					owner: doc.owner || "-",
					assigned_to: this.formatAge(doc.creation),
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
					doctype: "Customer Order Form",
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
			// Try to fetch from Comment doctype (standard Frappe way to store comments on documents)
			frappe.call({
				method: "frappe.client.get_list",
				args: {
					doctype: "Comment",
					fields: ["name", "content", "comment_type", "owner", "creation"],
					filters: { reference_doctype: "Customer Order Form", reference_name: recordId },
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
					console.warn("Could not fetch comments for record. Make sure the document has comments enabled.");
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
					filters: { attached_to_doctype: "Customer Order Form", attached_to_name: recordId },
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
		this.page.set_title("Customer Order Forms");
		document.title = "Customer Order Forms";

		const customerOptions = Array.from(new Set(this.records.map((row) => String(row.party || "").trim()).filter((name) => name && name !== "-"))).sort();
		const ownerOptions = this.ownerOptions.length
			? this.ownerOptions
			: Array.from(new Set(this.records.map((row) => String(row.owner || "").trim()).filter(Boolean))).sort().map((owner) => ({ value: owner, label: owner }));
		const rows = this.getFilteredRows();
		const visibleRows = rows.slice(0, this.pageSize);
		const visibleCount = visibleRows.length;
			const appliedCount = (this.saved_filters || []).length;
		const amountSortIcon = this.amountSortDir === "asc" ? "ti-sort-ascending" : this.amountSortDir === "desc" ? "ti-sort-descending" : "ti-arrows-sort";
		const amountSortClass = this.amountSortDir ? "cof-sort-active" : "";
		const statusOptions = ["", ...Array.from(new Set(this.records.map((row) => row.status).filter(Boolean)))];
		const tableRows = visibleRows
			.map((row) => {
				const customerName = row.party || "-";
				const safeCustomerName = this.escapeAttr(customerName);
				return `
					<tr class="cof-list-row" data-name="${row.id}">
						<td class="cof-id">${row.id}</td>
						<td>${row.subject}</td>
						<td class="cof-col-customer"><span class="cof-customer-text" title="${safeCustomerName}">${safeCustomerName}</span></td>
						<td><span class="cof-status ${this.getStatusClass(row.status)}">${row.status}</span></td>
						<td class="cof-amt">${this.formatCurrency(row.amount)}</td>
						<td>${row.owner}</td>
						<td>${row.assigned_to}</td>
					</tr>
				`;
			})
			.join("");

		this.$content.html(`
			<div class="cof-list-view">
				<div class="card cof-list-card">
					<div class="cof-list-toolbar">
						${this.renderMultiFilter("customer", customerOptions.map((customer) => ({ value: customer, label: customer })), this.selectedCustomers, "Customer")}
						${this.renderMultiFilter("owner", ownerOptions, this.selectedOwners, "Owner")}
						<select id="cofStatusFilter" class="cof-input cof-select">
							${statusOptions
								.map((status) => {
									const label = status || "Status";
									const selected = this.statusFilter === status ? "selected" : "";
									return `<option value="${status}" ${selected}>${label}</option>`;
								})
								.join("")}
						</select>
						<div class="cof-list-toolbar-right">
							<div class="cof-filter-wrap">
								<button id="cofOpenFilters" class="btn cof-filter-trigger" type="button" style="white-space: nowrap; padding: 0; overflow: hidden;">
									<span class="cof-filter-btn-label" style="display:inline-flex; align-items:center; gap:6px; padding: 7px 12px;"><i class="ti ti-filter"></i> Filters${appliedCount ? ` (${appliedCount})` : ""}</span>
									<span class="cof-filter-btn-close" style="display:none; align-items:center; justify-content:center; min-width:28px; padding: 7px 10px; border-left:1px solid rgba(15,23,42,0.12); cursor:pointer;">x</span>
								</button>
							</div>
							<button id="cofClearFilters" class="btn" type="button"><i class="ti ti-filter-off"></i> Clear</button>
							<button id="cofNewDoc" class="btn btn-primary" type="button"><i class="ti ti-plus"></i> New Customer Order Form</button>
						</div>
					</div>
					<div class="table-wrap cof-list-table-wrap">
						<table class="cof-list-table">
							<thead>
								<tr>
									<th>ID</th>
									<th>Subject</th>
									<th class="cof-col-customer">Customer</th>
									<th>Status</th>
									<th id="cofSortAmount" class="cof-sortable ${amountSortClass}">Amount <i class="ti ${amountSortIcon}"></i></th>
									<th>Owner</th>
									<th>Assigned To</th>
								</tr>
							</thead>
							<tbody>${tableRows || '<tr><td colspan="7" class="cof-empty">No records found</td></tr>'}</tbody>
						</table>
					</div>
					<div class="cof-list-footer">
						<div class="page-size-btns">
							<button class="ps-btn ${this.pageSize === 20 ? "active" : ""}" data-size="20" type="button">20</button>
							<button class="ps-btn ${this.pageSize === 100 ? "active" : ""}" data-size="100" type="button">100</button>
							<button class="ps-btn ${this.pageSize === 500 ? "active" : ""}" data-size="500" type="button">500</button>
							<button class="ps-btn ${this.pageSize === 2500 ? "active" : ""}" data-size="2500" type="button">2500</button>
						</div>
						<div class="record-count">${visibleCount} of ${rows.length}</div>
						<button id="cofLoadMore" class="load-more-btn" type="button" ${visibleCount >= rows.length ? "disabled" : ""}>Load More</button>
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
			<div class="cof-multi-wrap">
				<div class="cof-multi" data-filter="${key}">
					<button type="button" class="cof-multi-trigger" data-filter-trigger="${key}">
						<span>${this.escapeAttr(triggerText)}</span>
						<i class="ti ti-chevron-down"></i>
					</button>
					<div class="cof-multi-menu" data-filter-menu="${key}">
						<div class="cof-multi-search-wrap">
							<input type="text" class="cof-multi-search" data-filter-search="${key}" placeholder="Search ${placeholder.toLowerCase()}..." />
						</div>
						<div class="cof-multi-options">
							${sortedOptions
								.map((option) => {
									const value = String(option.value || "").trim();
									const label = String(option.label || value).trim();
									if (!value) return "";
									const checked = selectedSet.has(value) ? "checked" : "";
									return `
										<label class="cof-multi-option" data-filter-option="${key}" data-label="${this.escapeAttr(label.toLowerCase())}">
											<input type="checkbox" class="cof-multi-checkbox" data-filter-check="${key}" value="${this.escapeAttr(value)}" ${checked}>
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
		candidates.push(this.$content ? this.$content.find("#cofOpenFilters") : $("#cofOpenFilters"));

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
			$btn.find(".cof-filter-btn-close").css("display", "none");
		});

		// Force-remove any stale popover DOM that might survive bootstrap lifecycle edge-cases.
		$("body > .popover.filter-popover").remove();
		$("body > .popover.show").remove();
		this.activeFilterPopoverButton = null;
		$(document).off("mousedown.cofStandardFilter");
	}

	openStandardFilterPopover(button) {
		const me = this;
		const DOCTYPE = this.filterDoctype || "Customer Order Form";
		const $btn = $(button);

		if (this.activeFilterPopoverButton && this.activeFilterPopoverButton.length && this.activeFilterPopoverButton[0] !== $btn[0]) {
			this.closeStandardFilterPopover(this.activeFilterPopoverButton);
		}

		const setFilterButtonState = (isOpen) => {
			const $close = $btn.find(".cof-filter-btn-close");
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
				<div class="filter-action-buttons cof-std-filter-footer mt-1 d-flex justify-content-between align-items-center">
					<button type="button" class="text-muted add-filter btn btn-xs cof-std-btn cof-std-btn-add">+ Add a Filter</button>
					<div class="filter-action-right">
						<button type="button" class="btn btn-secondary btn-xs clear-filters mr-2 cof-std-btn cof-std-btn-clear">Clear</button>
						<button type="button" class="btn btn-primary btn-xs apply-filters cof-std-btn cof-std-btn-apply">Apply</button>
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
			footer.find(".filter-action-right").css({
				display: "inline-flex",
				alignItems: "center",
				gap: "8px",
			});
			footer.find(".cof-std-btn").css({
				height: "26px",
				padding: "0 9px",
				borderRadius: "8px",
				fontSize: "11px",
				fontWeight: "600",
				boxShadow: "none",
			});
			footer.find(".cof-std-btn-add").css({
				background: "#f8fafc",
				color: "#334155",
				border: "1px solid rgba(15,23,42,0.14)",
			});
			footer.find(".cof-std-btn-clear").css({
				background: "#ffffff",
				color: "#0f172a",
				border: "1px solid rgba(15,23,42,0.2)",
				marginRight: "0",
			});
			footer.find(".cof-std-btn-apply").css({
				background: "#2f6fe5",
				color: "#ffffff",
				border: "1px solid #2f6fe5",
			});

			footer.find(".add-filter").on("click", () => FG.add_filter(DOCTYPE, "name", "=", "", false));

			footer.find(".clear-filters").on("click", () => {
				FG.clear_filters();
				me.saved_filters = [];
				me.pageSize = 20;
				safeClosePopover();
				me.renderListView();
			});

			footer.find(".apply-filters").on("click", () => {
				me.saved_filters = FG.get_filters() || [];
				me.pageSize = 20;
				safeClosePopover();
				me.renderListView();
			});

			try {
				$btn.popover({
					html: true,
					placement: "bottom",
					content: popover_content[0],
					trigger: "manual",
					container: document.body,
				});
				if (!$btn.length || !$btn[0] || !document.body.contains($btn[0])) {
					safeClosePopover();
					return;
				}
				$btn.popover("show");
				this.activeFilterPopoverButton = $btn;
				setFilterButtonState(true);
				const tipInstance = $btn.data("bs.popover");
				const tipElement = tipInstance && typeof tipInstance.getTipElement === "function" ? tipInstance.getTipElement() : null;
				if (tipElement) {
					$(tipElement).addClass("filter-popover");
					const popoverWidth = Math.min(920, Math.max(620, window.innerWidth - 24));
					$(tipElement).css({
						maxWidth: `${popoverWidth}px`,
						width: `${popoverWidth}px`,
					});
					$(tipElement).find(".popover-body").css({
						padding: "6px 8px",
						maxHeight: "260px",
						overflowY: "auto",
						overflowX: "hidden",
					});
					$(tipElement).find(".filter-area").css({ lineHeight: "1.15", width: "100%" });
					$(tipElement).find(".filter-group .form-control, .filter-group input, .filter-group select").css({
						height: "26px",
						minHeight: "26px",
						paddingTop: "2px",
						paddingBottom: "2px",
						fontSize: "11px",
					});
					$(tipElement).find(".filter-group .filter-row, .filter-group .filter-field").css({ marginBottom: "2px" });
					$(tipElement).find(".filter-group .text-muted, .filter-group small").css({
						fontSize: "10px",
						lineHeight: "1.1",
						marginTop: "0",
						marginBottom: "0",
						whiteSpace: "nowrap",
						display: "none",
					});
					$(tipElement).find(".filter-group .filter-empty").css({ margin: "2px 0 4px" });
					$(tipElement).find("hr, .filter-group hr, .filter-group .divider, .filter-group .filter-divider").css({ display: "none" });
				}
			} catch (err) {
				console.error("Failed to open standard filter popover", err);
				safeClosePopover();
				return;
			}

			$(document)
				.off("mousedown.cofStandardFilter")
				.on("mousedown.cofStandardFilter", (event) => {
					if (!$(event.target).closest(".filter-popover, #cofOpenFilters").length) {
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
			'<div style="padding:40px;text-align:center;"><div class="spinner-border" role="status"></div><p style="margin-top:15px;">Loading record details...</p></div>'
		);

		Promise.all([
			this.fetchDetailRecord(this.selectedRecord.id),
			this.fetchDetailActivities(this.selectedRecord.id),
			this.fetchDetailAttachments(this.selectedRecord.id),
		])
			.then(() => {
				this.$content.empty().append($(frappe.render_template("cof_list", {})));
				this.injectSelectedRecordInDetail();
				this.injectDetailActivities();
				this.injectDetailAttachments();
				this.setPageTitle();
				this.bindActivityFilters();
				this.bindEnhancedActions();
				this.renderWorkflow();
			})
			.finally(() => {
				this.isLoadingDetail = false;
			});
	}

	injectDetailActivities() {
		const $activityList = this.$content.find("#activityList");
		if (!$activityList.length) return;

		$activityList.empty();

		if (!this.detailActivities.length) {
			$activityList.html('<div style="padding:20px;text-align:center;color:#9ca3af;">No activities yet</div>');
			return;
		}

		this.detailActivities.forEach((activity) => {
			const $item = $(`
				<div class="act-item" data-tab="${activity.tab}" data-status="${activity.status}">
					<div class="act-icon note"><i class="ti ti-${this.getActivityIcon(activity.type)}"></i></div>
					<div class="act-body">
						<div class="act-title">${this.escapeAttr(activity.title)}</div>
						<div class="act-meta">${this.escapeAttr(activity.owner)} · ${activity.created}</div>
					</div>
					<span class="act-type">${activity.type}</span>
				</div>
			`);
			$activityList.append($item);
		});

		this.applyFilter();
	}

	injectDetailAttachments() {
		const $attachPanel = this.$content.find("#attachmentsPanel");
		if (!$attachPanel.length) return;

		$attachPanel.empty();

		if (!this.detailAttachments.length) {
			$attachPanel.html('<div style="padding:20px;text-align:center;color:#9ca3af;">No attachments yet</div>');
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

		$attachPanel.html(attachmentsList);
	}

	getActivityIcon(type) {
		const map = {
			Note: "notes",
			Call: "phone",
			Appointment: "calendar-event",
			Comment: "message-circle",
		};
		return map[type] || "notes";
	}

	bindListActions() {
		this.$content
			.off("click.cofList", "[data-filter-trigger]")
			.on("click.cofList", "[data-filter-trigger]", (event) => {
				event.preventDefault();
				event.stopPropagation();
				const key = String($(event.currentTarget).data("filterTrigger") || "");
				const $currentMenu = this.$content.find(`[data-filter-menu='${key}']`);
				const willOpen = !$currentMenu.hasClass("open");
				this.$content.find("[data-filter-menu]").removeClass("open");
				if (willOpen) $currentMenu.addClass("open");
			});

		this.$content
			.off("change.cofList", ".cof-multi-checkbox")
			.on("change.cofList", ".cof-multi-checkbox", (event) => {
				const key = String($(event.currentTarget).data("filterCheck") || "");
				const values = this.$content
					.find(`.cof-multi-checkbox[data-filter-check='${key}']:checked`)
					.map((_, el) => String(el.value || "").trim())
					.get()
					.filter(Boolean);

				if (key === "customer") this.selectedCustomers = values;
				if (key === "owner") this.selectedOwners = values;
				this.pageSize = 20;
				this.renderListView();
			});

		this.$content
			.off("input.cofList", ".cof-multi-search")
			.on("input.cofList", ".cof-multi-search", (event) => {
				const key = String($(event.currentTarget).data("filterSearch") || "");
				const query = String($(event.currentTarget).val() || "").trim().toLowerCase();
				this.$content.find(`[data-filter-option='${key}']`).each((_, item) => {
					const label = String($(item).data("label") || "").toLowerCase();
					$(item).toggle(!query || label.includes(query));
				});
			});

		this.$content
			.off("click.cofList", "#cofOpenFilters .cof-filter-btn-close")
			.on("click.cofList", "#cofOpenFilters .cof-filter-btn-close", (event) => {
				event.preventDefault();
				event.stopPropagation();
				this.closeStandardFilterPopover(this.$content.find("#cofOpenFilters"));
			});

		this.$content
			.off("click.cofList", "#cofOpenFilters")
			.on("click.cofList", "#cofOpenFilters", (event) => {
				event.preventDefault();
				event.stopPropagation();
				if ($(event.target).closest(".cof-filter-btn-close").length) {
					this.closeStandardFilterPopover(event.currentTarget);
					return;
				}
				this.openStandardFilterPopover(event.currentTarget);
			});

		this.$content
			.off("change.cofList", "#cofStatusFilter")
			.on("change.cofList", "#cofStatusFilter", (event) => {
				this.statusFilter = String($(event.currentTarget).val() || "").trim();
				this.renderListView();
			});

		this.$content
			.off("click.cofList", "#cofClearFilters")
			.on("click.cofList", "#cofClearFilters", () => {
				this.selectedCustomers = [];
				this.selectedOwners = [];
				this.statusFilter = "";
				this.saved_filters = [];
				this.pageSize = 20;
				this.renderListView();
			});

		this.$content
			.off("click.cofList", "#cofSortAmount")
			.on("click.cofList", "#cofSortAmount", (event) => {
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
			.off("click.cofList", ".ps-btn")
			.on("click.cofList", ".ps-btn", (event) => {
				const size = Number($(event.currentTarget).data("size") || 20);
				if (!Number.isFinite(size) || size <= 0) return;
				this.pageSize = size;
				this.renderListView();
			});

		this.$content
			.off("click.cofList", "#cofLoadMore")
			.on("click.cofList", "#cofLoadMore", () => {
				this.pageSize += this.pageStep;
				this.renderListView();
			});

		this.$content
			.off("click.cofList", "#cofNewDoc")
			.on("click.cofList", "#cofNewDoc", () => {
				frappe.set_route("customer-order-forms", "new");
			});

		this.$content
			.off("click.cofList", ".cof-list-row")
			.on("click.cofList", ".cof-list-row", (event) => {
				const name = String($(event.currentTarget).data("name") || "");
				const selected = this.records.find((row) => row.id === name);
				if (!selected) return;
				this.selectedRecord = selected;
				this.currentStage = 0;
				frappe.set_route("cof-list", name);
			});

		$(document)
			.off("click.cofListFilters")
			.on("click.cofListFilters", (event) => {
				if (!$(event.target).closest(".cof-multi").length) {
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
			if ((this.saved_filters || []).length) {
				const matchesAll = this.saved_filters.every((rawFilter) => this.matchStandardFilter(row, rawFilter));
				if (!matchesAll) return false;
			}
			return true;
		});

		if (!this.amountSortDir) return filtered;

		return filtered.sort((a, b) => {
			const amountA = Number(a.amount || 0);
			const amountB = Number(b.amount || 0);
			if (this.amountSortDir === "asc") return amountA - amountB;
			return amountB - amountA;
		});
	}

	getFilterFieldValue(row, field) {
		if (field === "name" || field === "id") return row.id;
		if (field === "subject") return row.subject;
		if (field === "customer") return row.party;
		if (field === "status") return row.status;
		if (field === "owner") return row.owner;
		if (field === "grand_total" || field === "amount") return row.amount;
		if (field === "creation") return row.creation;
		return "";
	}

	normalizeStandardFilter(rawFilter) {
		if (Array.isArray(rawFilter)) {
			if (rawFilter.length >= 4) {
				return {
					field: String(rawFilter[1] || "").trim(),
					op: String(rawFilter[2] || "=").trim().toLowerCase(),
					value: rawFilter[3],
				};
			}
			if (rawFilter.length >= 3) {
				return {
					field: String(rawFilter[0] || "").trim(),
					op: String(rawFilter[1] || "=").trim().toLowerCase(),
					value: rawFilter[2],
				};
			}
		}

		if (rawFilter && typeof rawFilter === "object") {
			return {
				field: String(rawFilter.fieldname || rawFilter.field || "").trim(),
				op: String(rawFilter.operator || rawFilter.op || "=").trim().toLowerCase(),
				value: rawFilter.value,
			};
		}

		return { field: "", op: "=", value: "" };
	}

	matchStandardFilter(row, rawFilter) {
		const { field, op, value } = this.normalizeStandardFilter(rawFilter);
		if (!field) return true;

		const left = this.getFilterFieldValue(row, field);
		const isAmountField = field === "amount" || field === "grand_total";
		const leftText = String(left || "").toLowerCase();

		const normalizeArrayValue = (val) => {
			if (Array.isArray(val)) return val.map((item) => String(item || "").trim()).filter(Boolean);
			return String(val || "")
				.split(",")
				.map((item) => item.trim())
				.filter(Boolean);
		};

		if (op === "set") return left !== null && left !== undefined && String(left).trim() !== "";
		if (op === "not set") return left === null || left === undefined || String(left).trim() === "";

		if (op === "in") {
			const list = normalizeArrayValue(value).map((item) => item.toLowerCase());
			return list.includes(leftText);
		}

		if (op === "not in") {
			const list = normalizeArrayValue(value).map((item) => item.toLowerCase());
			return !list.includes(leftText);
		}

		if (op === "between") {
			const vals = normalizeArrayValue(value);
			if (vals.length < 2) return true;
			if (isAmountField) {
				const lhs = Number(left || 0);
				const low = Number(vals[0]);
				const high = Number(vals[1]);
				if (!Number.isFinite(low) || !Number.isFinite(high)) return true;
				return lhs >= low && lhs <= high;
			}
			return leftText >= String(vals[0] || "").toLowerCase() && leftText <= String(vals[1] || "").toLowerCase();
		}

		if (isAmountField && [">", ">=", "<", "<=", "=", "!="].includes(op)) {
			const lhs = Number(left || 0);
			const rhs = Number(value);
			if (!Number.isFinite(rhs)) return true;
			if (op === ">") return lhs > rhs;
			if (op === ">=") return lhs >= rhs;
			if (op === "<") return lhs < rhs;
			if (op === "<=") return lhs <= rhs;
			if (op === "=") return lhs === rhs;
			if (op === "!=") return lhs !== rhs;
		}

		const rightText = String(value || "").toLowerCase();
		if (!rightText && op !== "=" && op !== "!=") return true;

		if (op === "=") return leftText === rightText;
		if (op === "!=") return leftText !== rightText;
		if (op === "like") {
			const pattern = rightText.replace(/%/g, "").trim();
			return !pattern || leftText.includes(pattern);
		}
		if (op === "not like") {
			const pattern = rightText.replace(/%/g, "").trim();
			return !pattern || !leftText.includes(pattern);
		}
		if (op === ">") return leftText > rightText;
		if (op === ">=") return leftText >= rightText;
		if (op === "<") return leftText < rightText;
		if (op === "<=") return leftText <= rightText;

		return true;
	}

	formatAge(value) {
		if (!value) return "-";
		try {
			const created = frappe.datetime ? frappe.datetime.str_to_obj(value) : new Date(value);
			if (!created) return "-";
			const diffMs = Date.now() - created.getTime();
			const days = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
			return `${days}d`;
		} catch (e) {
			return "-";
		}
	}

	formatCurrency(value) {
		const number = Number(value || 0);
		return `₹${number.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
	}

	getStatusClass(status) {
		const map = {
			Draft: "cof-status-draft",
			"Waiting For Approval": "cof-status-waiting",
			Approved: "cof-status-approved",
			Rejected: "cof-status-rejected",
			"Order Created": "cof-status-order",
		};
		return map[status] || "cof-status-draft";
	}

	escapeAttr(value) {
		return String(value || "").replace(/&/g, "&amp;").replace(/\"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
	}

	getCustomerAvatarText(customerName) {
		const raw = String(customerName || "").trim();
		if (!raw || raw === "-") return "NA";

		const parts = raw
			.split(/\s+/)
			.map((part) => part.replace(/[^A-Za-z0-9]/g, ""))
			.filter(Boolean);

		if (!parts.length) return "NA";
		if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

		return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
	}

	injectSelectedRecordInDetail() {
		if (!this.selectedRecord) return;
		
		const record = this.detailRecord || this.selectedRecord;
		const customerName = record.customer || this.selectedRecord.party || "-";
		const avatarText = this.getCustomerAvatarText(customerName);
		
		this.$content.find(".subject-label").text(`Subject · ${record.name || this.selectedRecord.id}`);
		this.$content.find(".customer-avatar").text(avatarText).attr("title", customerName);
		this.$content.find(".customer-name").text(customerName).attr("title", customerName);
		this.$content.find(".customer-sub").text(`Owner · ${record.owner || this.selectedRecord.owner}`);
		this.injectDetailMeta(record);
		this.injectDetailFinancials(record);
		this.injectItemsTable(record);
		
		const status = record.status || record.workflow_state || this.selectedRecord.status || "Draft";
		this.$content.find("#statusBadge").html(`<i class="ti ti-circle-dot"></i> ${status}`);
	}

	injectDetailMeta(record) {
		const firstNonEmpty = (...values) => {
			for (const value of values) {
				const text = String(value ?? "").trim();
				if (text) return text;
			}
			return "-";
		};

		const getUserDisplayName = (userId) => {
			const user = String(userId || "").trim();
			if (!user) return "";
			const ownerOption = (this.ownerOptions || []).find(
				(option) => String(option?.value || "").trim().toLowerCase() === user.toLowerCase()
			);
			if (ownerOption) {
				const label = String(ownerOption.label || "").trim();
				const suffix = ` (${user})`;
				if (label.endsWith(suffix)) return label.slice(0, -suffix.length).trim();
				return label;
			}
			return "";
		};

		const quotationId = firstNonEmpty(record.quotation_id);
		const cofId = firstNonEmpty(record.name, this.selectedRecord?.id);
		const salesperson = firstNonEmpty(
			record.sales_person_name,
			record.sales_person,
			getUserDisplayName(record.owner),
			getUserDisplayName(this.selectedRecord?.owner)
		);
		const poRefNo = firstNonEmpty(record.po_ref_number, record.customers_purchase_order, record.customer_purchase_order, record.po_ref_no);

		this.$content.find("#cofQuotationId").text(quotationId).attr("title", quotationId);
		this.$content.find("#cofRecordId").text(cofId).attr("title", cofId);
		this.$content.find("#cofSalesperson").text(salesperson).attr("title", salesperson);
		this.$content.find("#cofPoRefNo").text(poRefNo).attr("title", poRefNo);
	}

	injectDetailFinancials(record) {
		const toNumber = (value) => {
			const parsed = Number(value);
			return Number.isFinite(parsed) ? parsed : 0;
		};

		const pickFirstNumber = (source, keys) => {
			if (!source || !Array.isArray(keys)) return null;
			for (const key of keys) {
				if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
				const raw = source[key];
				if (raw === null || raw === undefined || raw === "") continue;
				const parsed = Number(raw);
				if (Number.isFinite(parsed)) return parsed;
			}
			return null;
		};

		const items = Array.isArray(record?.items) ? record.items : [];
		const sumItems = (keys) => items.reduce((sum, item) => sum + toNumber(pickFirstNumber(item, keys)), 0);

		const sellingAmount = pickFirstNumber(record, [
			"total",
			"net_total",
			"base_total",
			"base_net_total",
			"rounded_total",
			"grand_total",
			"base_grand_total",
		]) ?? this.selectedRecord?.amount ?? 0;

		const orcAmount = pickFirstNumber(record, ["orc_amount", "total_orc_amount"]) ?? sumItems(["orc_amount", "custom_orc_amount"]);

		const explicitProfit = pickFirstNumber(record, ["profit", "total_profit", "gross_profit", "margin_amount", "total_margin_amount"]);
		const itemProfit = sumItems(["margin_amount", "gross_profit"]);
		const profitAmount = explicitProfit !== null ? explicitProfit : itemProfit;

		const explicitBuying = pickFirstNumber(record, ["buying_amount", "buying_amt", "total_buying_amount", "cost_amount", "total_cost"]);
		const computedBuying = explicitBuying !== null ? explicitBuying : Math.max(0, toNumber(sellingAmount) - toNumber(profitAmount));

		this.$content.find("#cofSellingAmt").text(this.formatCurrency(sellingAmount));
		this.$content.find("#cofBuyingAmt").text(this.formatCurrency(computedBuying));
		this.$content.find("#cofOrcAmt").text(this.formatCurrency(orcAmount));
		this.$content.find("#cofProfitAmt").text(this.formatCurrency(profitAmount));
	}

	getFirstItemValue(item, keys) {
		if (!item || typeof item !== "object") return 0;
		for (const key of keys) {
			if (!Object.prototype.hasOwnProperty.call(item, key)) continue;
			const value = Number(item[key]);
			if (Number.isFinite(value)) return value;
		}
		return 0;
	}

	formatItemNumber(value, digits = 0) {
		const number = Number(value || 0);
		if (!Number.isFinite(number)) return "0";
		return number.toLocaleString("en-IN", {
			minimumFractionDigits: digits,
			maximumFractionDigits: digits,
		});
	}

	injectItemsTable(record) {
		const items = Array.isArray(record?.items) ? record.items : [];
		const getValue = (item, keys) => this.getFirstItemValue(item, keys);

		const rows = items.map((item, index) => {
			const itemId = index + 1;
			const itemName = this.escapeAttr(item.item_name || item.description || item.item_code || "-");
			const itemCode = this.escapeAttr(item.item_code || "-");
			const brand = this.escapeAttr(item.brand || item.item_brand || "-");
			const qty = getValue(item, ["qty", "stock_qty", "quantity", "stock_quantity", "ordered_qty"]);
			const sellingPrice = getValue(item, ["rate", "base_rate", "selling_rate", "price", "price_list_rate", "net_rate"]);
			const sellAmount = getValue(item, ["amount", "base_net_amount", "net_amount", "base_amount", "total_amount", "subtotal"]);
			const buyingPrice = getValue(item, ["buying_rate", "cost_rate", "buying_price", "purchase_rate"]);
			const buyAmount = getValue(item, ["buying_amount", "buying_amt", "cost_amount", "purchase_amount", "total_cost", "amount_buying"]);

			return `
				<tr>
					<td class="td-muted">${this.escapeAttr(String(itemId))}</td>
					<td>
						<span class="cof-item-name">${itemName}</span>
						<span class="cof-item-code">${itemCode}</span>
					</td>
					<td>${brand}</td>
					<td class="td-right">${this.formatItemNumber(qty)}</td>
					<td class="td-right">${this.formatItemNumber(sellingPrice, 2)}</td>
					<td class="td-right">${this.formatItemNumber(sellAmount, 2)}</td>
					<td class="td-right">${this.formatItemNumber(buyingPrice, 2)}</td>
					<td class="td-right">${this.formatItemNumber(buyAmount, 2)}</td>
				</tr>
			`;
		});

		const totalQty = items.reduce((sum, item) => sum + getValue(item, ["qty", "stock_qty", "quantity", "stock_quantity", "ordered_qty"]), 0);
		const totalSell = items.reduce((sum, item) => sum + getValue(item, ["amount", "base_net_amount", "net_amount", "base_amount", "total_amount", "subtotal"]), 0);
		const recordTaxAmount = this.getFirstItemValue(record, ["total_taxes", "total_tax", "tax_amount", "tax_total"]);
		const itemTaxTotal = items.reduce((sum, item) => sum + getValue(item, ["tax_amount", "tax"]), 0);
		const actualTaxAmount = recordTaxAmount || itemTaxTotal;

		const taxNameValues = Array.isArray(record?.taxes)
			? record.taxes.map((tax) => String(tax?.account_head || tax?.tax_type || tax?.description || "").toUpperCase())
			: [];
		const hasIGST = taxNameValues.some((value) => value.includes("IGST"));
		const hasCGST = taxNameValues.some((value) => value.includes("CGST"));
		const hasSGST = taxNameValues.some((value) => value.includes("SGST"));

		let taxAmount = 0;
		let taxTypeLabel = "0%";
		if (hasIGST) {
			taxAmount = totalSell * 0.18;
			taxTypeLabel = "IGST 18%";
		} else if (hasCGST && hasSGST) {
			taxAmount = totalSell * 0.18;
			taxTypeLabel = "CGST 9% + SGST 9%";
		}

		// Use actual tax amount if present, otherwise calculated
		if (actualTaxAmount > 0) {
			taxAmount = actualTaxAmount;
		}

		const grandTotal = Number(record?.grand_total ?? (totalSell + taxAmount)) || totalSell + taxAmount;

		this.$content.find("#cofItemsTableBody").html(
			rows.length
				? rows.join("")
				: '<tr><td colspan="8" class="td-muted" style="text-align:center;">No items available</td></tr>'
		);

		this.$content.find("#cofItemsTotalQty").text(this.formatItemNumber(totalQty));
		this.$content.find("#cofItemsSellAmt").text(`₹${this.formatItemNumber(totalSell, 2)}`);
		this.$content.find("#cofItemsTaxLabel").text(`Tax (${taxTypeLabel})`);
		this.$content.find("#cofItemsTax").text(`₹${this.formatItemNumber(taxAmount, 2)}`);
		this.$content.find("#cofItemsGrandTotal").text(this.formatCurrency(grandTotal));
	}

	setPageTitle() {
		if (this.view === "list") {
			document.title = "Customer Order Forms";
			this.page.set_title("Customer Order Forms");
			if (this.page && this.page.clear_secondary_action) {
				this.page.clear_secondary_action();
			}
			return;
		}

		const customerName = this.$content.find(".customer-name").text().trim();
		const title = customerName ? `Opportunity Detail — ${customerName}` : "Opportunity Detail";
		document.title = title;
		this.page.set_title(title);
		if (this.page && this.page.clear_secondary_action) {
			this.page.clear_secondary_action();
		}
	}

	bindActivityFilters() {
		const $tabs = this.$content.find("#actTabs");
		const $filter = this.$content.find("#actFilter");

		$tabs.off("click.coflist", ".tab").on("click.coflist", ".tab", (event) => {
			const $tab = $(event.currentTarget);
			$tabs.find(".tab").removeClass("active");
			$tab.addClass("active");
			this.activeTab = String($tab.data("tab") || "notes");
			this.applyFilter();
		});

		$filter.off("click.coflist", ".tab").on("click.coflist", ".tab", (event) => {
			const $tab = $(event.currentTarget);
			$filter.find(".tab").removeClass("active");
			$tab.addClass("active");
			this.activeFilter = String($tab.data("filter") || "all");
			this.applyFilter();
		});

		this.applyFilter();
	}

	bindEnhancedActions() {
		this.$content.off("click.coflistActions");
		this.$content.on("click.coflistActions", "[data-action='toggle-workflow']", (event) => {
			event.stopPropagation();
			this.$content.find("#wfDropdown").toggleClass("open");
		});

		this.$content.on("click.coflistActions", "[data-action='save-note']", () => {
			window.saveNote();
		});

		this.$content.on("click.coflistActions", "[data-action='save-comment']", () => {
			window.saveComment();
		});

		this.$content.on("click.coflistActions", "[data-close-tab]", (event) => {
			const tab = String($(event.currentTarget).data("closeTab") || "");
			if (tab) window.closeInput(tab);
		});

		this.$content.on("click.coflistActions", ".mention-item[data-mention]", (event) => {
			const name = String($(event.currentTarget).data("mention") || "");
			if (name) window.insertMention(name);
		});

		this.$content.on("input.coflistActions", "#commentText", (event) => {
			window.handleMention(event.currentTarget);
		});

		this.$content.on("click.coflistActions", "[data-toggle-input]", (event) => {
			const tab = String($(event.currentTarget).data("toggleInput") || "");
			if (tab) window.toggleInput(tab);
		});

		window.toggleInput = (tab) => {
			const cfg = this.tabConfig[tab];
			if (!cfg || !cfg.inputId) return;
			const $el = this.$content.find(`#${cfg.inputId}`);
			const isOpen = $el.is(":visible");
			this.closeAllInputs();
			if (!isOpen) {
				$el.removeClass("hidden").show();
				const first = $el.find("textarea,input").get(0);
				if (first) first.focus();
			}
		};

		window.closeInput = (tab) => {
			const cfg = this.tabConfig[tab];
			if (!cfg || !cfg.inputId) return;
			this.$content.find(`#${cfg.inputId}`).addClass("hidden").hide();
		};

		window.saveNote = () => {
			const $note = this.$content.find("#noteText");
			const txt = ($note.val() || "").trim();
			if (!txt) return;
			const $item = $(
				`<div class="act-item" data-tab="notes" data-status="completed">
					<div class="act-icon note"><i class="ti ti-notes"></i></div>
					<div class="act-body"><div class="act-title"></div><div class="act-meta">Added by You · Just now</div></div>
					<span class="act-type">Note</span>
				</div>`
			);
			$item.find(".act-title").text(txt);
			this.$content.find("#activityList").prepend($item);
			$note.val("");
			window.closeInput("notes");
			this.applyFilter();
		};

		window.saveComment = () => {
			const $comment = this.$content.find("#commentText");
			const txt = ($comment.val() || "").trim();
			if (!txt) return;
			const $item = $(
				`<div class="act-item" data-tab="comments" data-status="completed">
					<div class="act-icon note"><i class="ti ti-message-circle"></i></div>
					<div class="act-body"><div class="act-title"></div><div class="act-meta">You · Just now</div></div>
					<span class="act-type">Comment</span>
				</div>`
			);
			$item.find(".act-title").text(txt);
			this.$content.find("#activityList").prepend($item);
			$comment.val("");
			this.$content.find("#mentionDropdown").addClass("hidden").hide();
			window.closeInput("comments");
			this.applyFilter();
		};

		window.handleMention = (el) => {
			const val = el.value || "";
			const lastAt = val.lastIndexOf("@");
			const $dd = this.$content.find("#mentionDropdown");
			if (!$dd.length) return;
			if (lastAt !== -1 && lastAt === val.length - 1) {
				$dd.removeClass("hidden").show();
			} else {
				$dd.addClass("hidden").hide();
			}
		};

		window.insertMention = (name) => {
			const $ta = this.$content.find("#commentText");
			const val = String($ta.val() || "");
			const lastAt = val.lastIndexOf("@");
			$ta.val(`${val.slice(0, lastAt)}@${name} `);
			this.$content.find("#mentionDropdown").addClass("hidden").hide();
			$ta.trigger("focus");
		};

		$(document)
			.off("click.coflist")
			.on("click.coflist", (e) => {
				const wfWrap = this.$content.find("#wfWrap").get(0);
				if (!wfWrap || !wfWrap.contains(e.target)) {
					this.$content.find("#wfDropdown").removeClass("open");
				}
				const mentionDropdown = this.$content.find("#mentionDropdown").get(0);
				if ((!mentionDropdown || !mentionDropdown.contains(e.target)) && e.target.id !== "commentText") {
					this.$content.find("#mentionDropdown").addClass("hidden").hide();
				}
			});
	}

	closeAllInputs() {
		this.$content.find(".act-input-area").addClass("hidden").hide();
	}

	renderBottomBtn() {
		const cfg = this.tabConfig[this.activeTab];
		const $bottom = this.$content.find("#actBottom");
		if (!cfg || !cfg.label) {
			$bottom.empty();
			return;
		}
		$bottom.html(
			`<button class="add-btn" type="button" data-toggle-input="${this.activeTab}"><i class="ti ${cfg.icon}"></i> ${cfg.label}</button>`
		);
	}

	applyFilter() {
		const isAttach = this.activeTab === "attachments";
		const $activityList = this.$content.find("#activityList");
		const $attachPanel = this.$content.find("#attachmentsPanel");
		const $filterDivider = this.$content.find("#filterDivider");
		const $filter = this.$content.find("#actFilter");
		const $actBottom = this.$content.find("#actBottom");

		$activityList.toggle(!isAttach);
		$attachPanel.toggleClass("hidden", !isAttach).toggle(isAttach);
		$filterDivider.toggle(!isAttach);
		$filter.toggle(!isAttach);
		$actBottom.toggle(!isAttach);

		if (!isAttach) {
			this.$content.find("#activityList .act-item").each((_, item) => {
				const $item = $(item);
				const tabMatch = $item.data("tab") === this.activeTab;
				const filterMatch = this.activeFilter === "all" || $item.data("status") === this.activeFilter;
				$item.css("display", tabMatch && filterMatch ? "flex" : "none");
			});
		}

		this.closeAllInputs();
		this.renderBottomBtn();
	}

	renderWorkflow() {
		const record = this.detailRecord || this.selectedRecord;
		const status = record?.status || record?.workflow_state || this.selectedRecord?.status || "Draft";
		
		// Map status to stage index
		const statusToStageMap = {
			"Draft": 0,
			"Waiting For Approval": 1,
			"Waiting for Approval": 1,
			"Pending Approval": 1,
			"Approved": 2,
			"Rejected": 3,
			"Order Created": 4,
		};
		
		this.currentStage = Object.prototype.hasOwnProperty.call(statusToStageMap, status) ? statusToStageMap[status] : 0;
		const stage = this.wfStages[this.currentStage];
		
		const $dot = this.$content.find("#wfDot");
		const $stageLabel = this.$content.find("#wfStageLabel");
		const $statusBadge = this.$content.find("#statusBadge");
		const $actions = this.$content.find("#wfActions");

		$dot.css("background", stage.dot);
		$stageLabel.text(stage.label);
		$statusBadge
			.html(`<i class="ti ti-circle-dot"></i> ${status}`)
			.css({
				background: `${stage.dot}1a`,
				color: stage.dot,
				border: `1px solid ${stage.dot}33`,
			});

		$actions.empty();
		if (!stage.actions.length) {
			$actions.html('<div style="padding:10px;font-size:12px;color:#9ca3af;text-align:center;">No further actions</div>');
			return;
		}

		stage.actions.forEach((action) => {
			const $item = $(
				`<div class="wf-action-item">
					<div class="wf-icon" style="background:${action.bg};color:${action.color};"><i class="ti ${action.icon}"></i></div>
					<div><div>${action.label}</div><div class="wf-desc">${action.desc}</div></div>
				</div>`
			);
			$item.on("click", () => {
				this.currentStage = action.next;
				this.renderWorkflow();
				this.$content.find("#wfDropdown").removeClass("open");
			});
			$actions.append($item);
		});
	}
}
