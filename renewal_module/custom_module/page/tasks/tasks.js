frappe.pages['tasks'].on_page_load = function (wrapper) {
	localStorage.removeItem('task_page_length');
	new taskspage(wrapper);
};

frappe.pages['tasks'].on_page_show = function (wrapper) {
	console.log("🔄 Tasks page showing");
	const pageWrapper = wrapper || $(".page")[0] || document.body;
	const ensureSupportLayoutLoaded = (cb) => {
		if (typeof loadSupportLayout === "function") return cb();
		frappe.require(["/assets/renewal_module/js/issue_themes/support_layout2.js"], () => {
			setTimeout(cb, 10);
		});
		frappe.require([
			"/assets/renewal_module/css/issue_themes/support_theme2.css",
		]);
	};
	ensureSupportLayoutLoaded(() => {
		loadSupportLayout(pageWrapper, () => {
			if (!frappe.tasks_page || frappe.tasks_page.wrapper !== pageWrapper) {
				frappe.tasks_page = new taskspage(pageWrapper);
			}
			frappe.tasks_page.render();
		});
	});
};

class taskspage {
	constructor(wrapper) {
		this.wrapper = wrapper;

		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: '',
			single_column: true
		});
		const savedPageLength = localStorage.getItem('task_page_length');
		this.page_length = savedPageLength ? parseInt(savedPageLength, 10) : 20;
		this.all_tasks = [];
		this.total_records = 0;
		this.visible_count = 0;
		this.selected_tasks = new Set();
		this._permission_cache = null;
		this._tasks_enabled_users_cache = null;
		this._task_panel_assign_control = null;
		this._task_panel_apt_participants_control = null;
		this._task_panel_call_name_control = null;
		this._task_panel_call_selected_customer = "";
		this._current_task_details = null;
	}

	render() {
		const waitForContent = () => {
			const $content = $("#support-page-content");
			if (!$content.length) {
				setTimeout(waitForContent, 50);
				return;
			}
			$content.empty().append(frappe.tasks_page_template.body);
			this.handleRoute();
		};
		waitForContent();
	}

	handleRoute() {
		const route = frappe.get_route();
		console.log("handleRoute:", route);
		if (route.length === 1) {
			return this.show_list();
		}
		if (route.length === 2 && route[1] === "new-tasks") {
			return this.show_new();
		}
		if (route.length === 2) {
			const task_id = route[1];
			return this.show_details(task_id);
		}
	}

	setPageTitle(title) {
		document.title = title;
		this.page.set_title(title);
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

	// ===================== LIST VIEW =====================
	show_list() {
		$(".task-list-view").removeClass("d-none");
		$(".task-details-view").addClass("d-none");
		$(".new-tasks").addClass("d-none");
		setTimeout(async () => {
			try {
				this.setPageTitle("Tasks");
				this.setActiveSidebar();
				this.bindListHeaderActions();
				this.bindPaginationEvents();
				this.bindFilterEvents();
				this.bindRowSelectionHandler();
				this.bindActionDropdownHandler();
				this.applyRoleBasedActionVisibility("list");
				this.applyUrlFilters();
			} catch (err) {
				console.error("taskspage.show_list error:", err);
			}
		}, 200);
	}

	bindListHeaderActions() {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const $newTaskBtn = $(wrapper).find("#new-task-btn");

		if (!$newTaskBtn.length) {
			return;
		}

		$newTaskBtn.off("click.tasks_new").on("click.tasks_new", (e) => {
			e.preventDefault();
			frappe.set_route("tasks", "new-tasks");
		});
	}

	async fetch_list_data({ reset = false } = {}) {
		if (this._fetch_in_progress) return;
		this._fetch_in_progress = true;

		try {
			if (reset) {
				this.all_tasks = [];
				this.visible_count = 0;
			}

			const status = this.active_status || "";
			const id = this.active_id || "";
			const advFiltersJson = (this.saved_filters && this.saved_filters.length > 0)
				? JSON.stringify(this.saved_filters)
				: "";

			const r = await frappe.call({
				method: "renewal_module.custom_module.page.tasks.tasks.get_list_data",
				args: {
					start: reset ? 0 : (this.all_tasks ? this.all_tasks.length : 0),
					page_length: this.page_length,
					status: status,
					id: id,
					filters: advFiltersJson
				}
			});

			if (!r || !r.message) {
				if (reset) { this.all_tasks = []; this.visible_count = 0; this.total_records = 0; }
				this.render_rows();
				return;
			}

			const { data = [], total = 0 } = r.message || {};
			this.total_records = parseInt(total, 10) || 0;

			if (reset) {
				this.all_tasks = Array.isArray(data) ? data.slice() : [];
			} else if (Array.isArray(data) && data.length > 0) {
				this.all_tasks = [...(this.all_tasks || []), ...data];
			}

			this.visible_count = Math.min(this.all_tasks.length, this.total_records);

			const wrapper = this.page.wrapper[0] || this.page.wrapper;
			const visibleEl = wrapper.querySelector("#task-visible-count");
			const totalEl = wrapper.querySelector("#task-total-count");
			if (visibleEl) visibleEl.textContent = this.visible_count.toLocaleString();
			if (totalEl) totalEl.textContent = this.total_records.toLocaleString();

			this.render_rows();
		} catch (e) {
			console.error("fetch_list_data error:", e);
		} finally {
			this._fetch_in_progress = false;
		}
	}

	render_rows() {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const tbody = wrapper.querySelector(".tasks-table tbody");
		if (!tbody) return;
		tbody.innerHTML = "";

		const data = this.all_tasks || [];

		if (!Array.isArray(data) || data.length === 0) {
			tbody.insertAdjacentHTML("beforeend", `
				<tr><td colspan="8" class="text-center text-muted py-4">No tasks found.</td></tr>
			`);
			const loadMoreBtn = wrapper.querySelector(".task-btn-more");
			if (loadMoreBtn) loadMoreBtn.style.display = "none";
			return;
		}

		data.forEach(task => {
			const tr = document.createElement("tr");
			tr.innerHTML = `
				<td class="checkbox-cell">
					<input class="form-check-input form-check-input-light fs-14 product-item-check" type="checkbox" data-task-name="${task.name}">
				</td>
				<td>
					<a href="/app/tasks/${task.name}" class="task-id-link link-reset task-link"
					   data-task-name="${task.name}" title="${task.name}">${task.name}</a>
				</td>
				<td class="ellipsis" title="${escapeHtml(task.subject)}">${escapeHtml(task.subject)}</td>
				<td>
					<span class="pill ${getStatusPillClass(task.status)}" title="${escapeHtml(task.status)}">${escapeHtml(task.status)}</span>
				</td>
				<td>
					<span class="priority-pill priority-${(task.priority || '').toLowerCase()}" title="${escapeHtml(task.priority)}">${escapeHtml(task.priority)}</span>
				</td>
				<td class="ellipsis" title="${escapeHtml(task.exp_start_date)}">${formatCustomDate(task.exp_start_date)}</td>
				<td class="ellipsis" title="${escapeHtml(task.exp_end_date)}">${formatCustomDate(task.exp_end_date)}</td>
				<td>
					<div class="d-flex align-items-center justify-content-center gap-1 task-link"
					     data-task-name="${task.name}" style="cursor:pointer;">
						<span title="${escapeHtml(task.modified || '')}">${formatRelativeDate(task.modified)}</span>
						<span class="d-flex align-items-center gap-1 ml-1" title="${task.comment_count || 0}">
								<i class="fa fa-comment fs-lg"></i>
								${task.comment_count || 0}
							</span>
					</div>
				</td>
			`;
			tbody.appendChild(tr);

			const taskCheckbox = tr.querySelector('input[type="checkbox"]');
			if (this.selected_tasks.has(task.name)) {
				taskCheckbox.checked = true;
			}
		});

		const loadMoreBtn = wrapper.querySelector(".task-btn-more");
		if (loadMoreBtn) {
			loadMoreBtn.style.display = (this.visible_count >= (this.total_records || 0)) ? "none" : "inline-block";
		}

		$(wrapper).off("click", ".task-link").on("click", ".task-link", function (e) {
			e.preventDefault();
			const taskName = $(this).data("task-name");
			if (!taskName) return;
			frappe.set_route("tasks", taskName);
		});

		function escapeHtml(s) {
			if (s == null) return "";
			return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
		}

		function getStatusPillClass(status) {
			switch (status) {
				case "Open": return "task-pill-open";
				case "Working": return "task-pill-working";
				case "Pending Review": return "task-pill-pending-review";
				case "Overdue": return "task-pill-overdue";
				case "Completed": return "task-pill-completed";
				case "Cancelled": return "task-pill-cancelled";
				default: return "task-pill-cancelled";
			}
		}

		function formatCustomDate(dateStr) {
			if (!dateStr) return "";
			const d = new Date(dateStr);
			if (isNaN(d.getTime())) return dateStr;
			const day = String(d.getDate()).padStart(2, '0');
			const month = String(d.getMonth() + 1).padStart(2, '0');
			const year = String(d.getFullYear()).slice(-2);
			return `${day}-${month}-${year}`;
		}

		function formatRelativeDate(dateString) {
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

		const table = wrapper.querySelector(".tasks-table");
		const newTaskBtn = wrapper.querySelector("#new-task-btn");
		const actionsDropdownEl = wrapper.querySelector("#task-actions-dropdown");
		if (table) {
			const all = table.querySelectorAll('tbody input[type="checkbox"]').length;
			const checked = table.querySelectorAll('tbody input[type="checkbox"]:checked').length;
			const selectAll = table.querySelector('#selectAllTasks');
			if (selectAll) selectAll.checked = (all > 0 && all === checked);
			this.updateActionBarState(table, newTaskBtn, actionsDropdownEl);
		}
	}

	bindRowSelectionHandler() {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const table = wrapper.querySelector(".tasks-table");
		const newTaskBtn = wrapper.querySelector("#new-task-btn");
		const actionsDropdown = wrapper.querySelector("#task-actions-dropdown");

		if (!table || !newTaskBtn || !actionsDropdown) return;
		if (table.dataset.selectionHandlerBound === "1") return;
		table.dataset.selectionHandlerBound = "1";

		const selectAllCheckbox = table.querySelector("#selectAllTasks");

		if (selectAllCheckbox) {
			selectAllCheckbox.addEventListener("change", (e) => {
				const allRowCheckboxes = table.querySelectorAll('tbody input[type="checkbox"]');
				allRowCheckboxes.forEach(cb => {
					cb.checked = e.target.checked;
					const taskName = cb.dataset.taskName;
					if (taskName) {
						if (e.target.checked) this.selected_tasks.add(taskName);
						else this.selected_tasks.delete(taskName);
					}
				});
				this.updateActionBarState(table, newTaskBtn, actionsDropdown);
			});
		}

		table.addEventListener("change", (e) => {
			if (e.target.matches('tbody input[type="checkbox"]')) {
				const taskName = e.target.dataset.taskName;
				if (taskName) {
					if (e.target.checked) this.selected_tasks.add(taskName);
					else this.selected_tasks.delete(taskName);
				}
				if (selectAllCheckbox) {
					const all = table.querySelectorAll('tbody input[type="checkbox"]').length;
					const checked = table.querySelectorAll('tbody input[type="checkbox"]:checked').length;
					selectAllCheckbox.checked = (all > 0 && all === checked);
				}
				this.updateActionBarState(table, newTaskBtn, actionsDropdown);
			}
		});
	}

	updateActionBarState(table, newBtn, actionsDropdown) {
		const selectedCount = table.querySelectorAll('tbody input[type="checkbox"]:checked').length;
		const hasVisibleActions = this.hasVisibleActionItems(actionsDropdown);
		if (selectedCount > 0 && hasVisibleActions) {
			newBtn.classList.add("d-none");
			actionsDropdown.classList.remove("d-none");
		} else {
			newBtn.classList.remove("d-none");
			actionsDropdown.classList.add("d-none");
		}
	}

	hasVisibleActionItems(dropdownEl) {
		if (!dropdownEl) return false;
		const actionItems = dropdownEl.querySelectorAll(".dropdown-item[data-task-action]");
		for (const item of actionItems) {
			if (item.style.display !== "none") return true;
		}
		return false;
	}

	bindActionDropdownHandler() {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const actionsDropdown = wrapper.querySelector("#task-actions-dropdown");

		if (!actionsDropdown) return;

		const $actionsDropdown = $(actionsDropdown);
		$actionsDropdown.off("click").on("click", async (e) => {
			const item = e.target.closest(".dropdown-item");
			if (!item) return;

			e.preventDefault();
			const action = item.dataset.taskAction || item.dataset.action;
			const table = wrapper.querySelector(".tasks-table");
			const checkedBoxes = table ? table.querySelectorAll('tbody input[type="checkbox"]:checked') : [];

			if (!checkedBoxes.length) {
				frappe.msgprint(__("Please select at least one Task"));
				return;
			}

			const taskNames = Array.from(checkedBoxes)
				.map(cb => cb.dataset.taskName)
				.filter(Boolean);

			if (!taskNames.length) {
				frappe.msgprint(__("No valid Task IDs found."));
				return;
			}

			const me = this;

			if (action === "set_completed") {
				me.bulkUpdate(taskNames, { fieldname: "status", value: "Completed" });
			} else if (action === "delete") {
				frappe.confirm(__("Delete {0} selected Task(s)?", [taskNames.length]), () => {
					frappe.dom.freeze(__("Deleting..."));
					Promise.all(taskNames.map(name =>
						frappe.call({ method: "frappe.client.delete", args: { doctype: "Task", name } })
					)).then(() => {
						frappe.dom.unfreeze();
						frappe.show_alert({ message: __("Deleted successfully"), indicator: "red" });
						me.resetActionBar();
						me.refreshAllData();
					}).catch(() => {
						frappe.dom.unfreeze();
					});
				});
			} else {
				frappe.msgprint(__("Action '{0}' not implemented yet", [action]));
			}
		});
	}

	getTaskPermissions(forceRefresh = false) {
		if (!forceRefresh && this._permission_cache) {
			return Promise.resolve(this._permission_cache);
		}

		return new Promise((resolve) => {
			frappe.call({
				method: "renewal_module.custom_module.page.tasks.tasks.get_task_permissions",
				callback: (r) => {
					const permissions = {
						write: !!r?.message?.write,
						delete: !!r?.message?.delete,
						export: !!r?.message?.export,
						print: !!r?.message?.print
					};
					this._permission_cache = permissions;
					resolve(permissions);
				},
				error: () => {
					// Fallback keeps UI stable even when permission API fails.
					const fallback = { write: false, delete: false, export: false, print: false };
					this._permission_cache = fallback;
					resolve(fallback);
				}
			});
		});
	}

	cleanupDropdownDividers(dropdownMenu) {
		if (!dropdownMenu) return;
		const children = Array.from(dropdownMenu.children);
		let lastVisibleWasDivider = true;

		children.forEach((child) => {
			const divider = child.querySelector(".dropdown-divider");
			if (divider) {
				if (lastVisibleWasDivider) {
					child.style.display = "none";
				} else {
					child.style.display = "";
					lastVisibleWasDivider = true;
				}
				return;
			}

			const hasVisibleAction = !!Array.from(
				child.querySelectorAll(".dropdown-item[data-task-action]")
			).find((item) => item.style.display !== "none");

			if (hasVisibleAction) {
				child.style.display = "";
				lastVisibleWasDivider = false;
			} else {
				child.style.display = "none";
			}
		});

		for (let i = children.length - 1; i >= 0; i--) {
			if (children[i].style.display === "none") continue;
			if (children[i].querySelector(".dropdown-divider")) {
				children[i].style.display = "none";
			}
			break;
		}
	}

	async applyRoleBasedActionVisibility(view = "all") {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const perm = await this.getTaskPermissions();

		const permissionMap = {
			"set_completed": perm.write,
			"delete": perm.delete
		};

		if (view === "list" || view === "all") {
			const actionsDropdown = wrapper.querySelector("#task-actions-dropdown");
			if (actionsDropdown) {
				Object.keys(permissionMap).forEach(action => {
					const items = actionsDropdown.querySelectorAll(`.dropdown-item[data-task-action="${action}"]`);
					items.forEach(item => { item.style.display = permissionMap[action] ? "" : "none"; });
				});
				const menu = actionsDropdown.querySelector(".dropdown-menu");
				this.cleanupDropdownDividers(menu);
				if (!this.hasVisibleActionItems(actionsDropdown)) {
					actionsDropdown.classList.add("d-none");
				}
			}
			const table = wrapper.querySelector(".tasks-table");
			const newBtn = wrapper.querySelector("#new-task-btn");
			if (table && newBtn && actionsDropdown) this.updateActionBarState(table, newBtn, actionsDropdown);
		}

		if (view === "details" || view === "all") {
			const editButtons = wrapper.querySelectorAll("#edit-task-details-btn, .edit-inline-task-btn, .edit-inline-btn[data-task-edit]");
			editButtons.forEach((btn) => {
				btn.style.display = perm.write ? "" : "none";
			});
		}
	}

	resetActionBar() {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const newTaskBtn = wrapper.querySelector("#new-task-btn");
		const actionsDropdown = wrapper.querySelector("#task-actions-dropdown");

		if (newTaskBtn && actionsDropdown) {
			newTaskBtn.classList.remove("d-none");
			actionsDropdown.classList.add("d-none");
		}

		this.selected_tasks.clear();

		const table = wrapper.querySelector(".tasks-table");
		if (table) {
			const selectAllCheckbox = table.querySelector('#selectAllTasks');
			if (selectAllCheckbox) selectAllCheckbox.checked = false;
			table.querySelectorAll('tbody input[type="checkbox"]').forEach(cb => (cb.checked = false));
		}
	}

	bulkUpdate(taskNames, updates) {
		return new Promise((resolve, reject) => {
			if (!taskNames.length) return resolve();

			frappe.dom.freeze(__("Updating..."));

			Promise.all(taskNames.map(name =>
				frappe.call({
					method: "frappe.client.set_value",
					args: { doctype: "Task", name, fieldname: updates.fieldname, value: updates.value }
				})
			)).then(async () => {
				frappe.dom.unfreeze();
				frappe.show_alert({ message: __("Updated successfully"), indicator: "green" });
				this.resetActionBar();
				await this.refreshAllData();
				resolve();
			}).catch((err) => {
				frappe.dom.unfreeze();
				console.error("Bulk update failed:", err);
				reject(err);
			});
		});
	}

	async refreshAllData() {
		try {
			await this.fetch_list_data({ reset: true });
			setTimeout(() => { this.applyRoleBasedActionVisibility(); }, 100);
		} catch (err) {
			console.error("[refreshAllData] Failed to refresh:", err);
		}
	}

	bindPaginationEvents() {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		let pageButtons = wrapper.querySelectorAll(".task-btn-paging");

		pageButtons.forEach(btn => btn.replaceWith(btn.cloneNode(true)));
		pageButtons = wrapper.querySelectorAll(".task-btn-paging");

		pageButtons.forEach(btn => {
			btn.addEventListener("click", async () => {
				pageButtons.forEach(b => {
					b.classList.remove("active-pagination");
					b.style.backgroundColor = "";
					b.style.color = "";
				});
				btn.classList.add("active-pagination");
				btn.style.backgroundColor = "#6C5CE7";
				btn.style.color = "white";
				this.page_length = parseInt(btn.dataset.value, 10);
				localStorage.setItem('task_page_length', this.page_length);
				await this.fetch_list_data({ reset: true });
			});
		});

		const defaultBtn = wrapper.querySelector(`.task-btn-paging[data-value="${this.page_length}"]`);
		if (defaultBtn && !wrapper.querySelector(".active-pagination")) {
			defaultBtn.classList.add("active-pagination");
			defaultBtn.style.backgroundColor = "#6C5CE7";
			defaultBtn.style.color = "white";
		}

		const loadMoreBtn = wrapper.querySelector(".task-btn-more");
		if (loadMoreBtn) {
			loadMoreBtn.addEventListener("click", async () => {
				loadMoreBtn.style.backgroundColor = "#E7E5F9";
				await this.fetch_list_data({ reset: false });
				setTimeout(() => { loadMoreBtn.style.backgroundColor = ""; }, 500);
			});
		}
	}

	updateFilterUrl() {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const statusEl = wrapper.querySelector('[data-task-filter="status"]');
		const idEl = wrapper.querySelector('[data-task-filter="ID"]');

		const status = statusEl ? statusEl.value : "";
		const id = idEl ? idEl.value.trim() : "";

		const params = new URLSearchParams();
		if (status) params.set("status", status);
		if (id) params.set("id", id);
		if (this.saved_filters && this.saved_filters.length) {
			params.set("filters", encodeURIComponent(JSON.stringify(this.saved_filters)));
		}

		const qs = params.toString() ? "?" + params.toString() : "";
		window.history.replaceState({}, "", window.location.pathname + window.location.hash.split("?")[0] + qs);

		if (qs) localStorage.setItem("task_last_filters", qs);
		else localStorage.removeItem("task_last_filters");
	}

	applyUrlFilters() {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const savedQs = localStorage.getItem("task_last_filters") || "";
		if (!window.location.search && savedQs) {
			window.history.replaceState({}, "", window.location.pathname + savedQs);
		}

		const params = new URLSearchParams(window.location.search);
		const status = params.get("status") || "";
		const id = params.get("id") || "";
		const filters_encoded = params.get("filters") || "";

		const statusEl = wrapper.querySelector('[data-task-filter="status"]');
		const idEl = wrapper.querySelector('[data-task-filter="ID"]');
		if (statusEl) statusEl.value = status;
		if (idEl) idEl.value = id;

		this.active_status = status;
		this.active_id = id;

		let restored_saved_filters = [];
		if (filters_encoded) {
			try {
				const parsed = JSON.parse(decodeURIComponent(filters_encoded));
				restored_saved_filters = parsed.map(f => {
					if (f[2] === "Equals") f[2] = "=";
					if (f[2] === "Not Equal") f[2] = "!=";
					return [f[0], f[1], f[2], f[3], f[4] ?? false];
				});
			} catch (e) { console.warn("applyUrlFilters: failed to parse advanced filters:", e); }
		}
		this.saved_filters = restored_saved_filters;

		const filterButton = wrapper.querySelector('.filter-button');
		if (filterButton && restored_saved_filters.length > 0) {
			const $label = $(filterButton).find(".button-label");
			if ($label.length) $label.text(`Filters (${restored_saved_filters.length})`);
		}

		this.fetch_list_data({ reset: true });
	}

	bindFilterEvents() {
		const me = this;
		const wrapper = this.page.wrapper[0] || this.page.wrapper;

		const statusFilter = wrapper.querySelector('[data-task-filter="status"]');
		const idFilter = wrapper.querySelector('[data-task-filter="ID"]');
		const filterButton = wrapper.querySelector('.filter-button');
		const clearFilterButton = wrapper.querySelector('.filter-x-button');

		me.saved_filters = me.saved_filters || [];

		function update_filter_button_count($btn, count) {
			let $label = $btn.find(".button-label");
			$label.text(count > 0 ? `Filters (${count})` : "Filters");
		}

		function updateUrlWithFilters(advancedFilters) {
			try {
				const newUrl = new URL(window.location.href);
				const status = statusFilter ? statusFilter.value : "";
				const id = idFilter ? idFilter.value.trim() : "";

				if (status) newUrl.searchParams.set("status", status);
				else newUrl.searchParams.delete("status");

				if (id) newUrl.searchParams.set("id", id);
				else newUrl.searchParams.delete("id");

				if (advancedFilters && advancedFilters.length) {
					newUrl.searchParams.set("filters", encodeURIComponent(JSON.stringify(advancedFilters)));
				} else {
					newUrl.searchParams.delete("filters");
				}

				window.history.replaceState({}, "", newUrl.toString());
				const qs = newUrl.search;
				if (qs) localStorage.setItem("task_last_filters", qs);
				else localStorage.removeItem("task_last_filters");
			} catch (e) {
				console.warn("updateUrlWithFilters error:", e);
			}
		}

		// Show filter count badge on page load if saved_filters exist
		setTimeout(() => {
			if (filterButton) {
				update_filter_button_count($(filterButton), me.saved_filters.length);
			}
		}, 100);

		if (statusFilter) {
			statusFilter.addEventListener("change", () => {
				me.active_status = statusFilter.value;
				updateUrlWithFilters(me.saved_filters);
				me.fetch_list_data({ reset: true });
			});
		}

		if (idFilter) {
			let debounceTimer;
			idFilter.addEventListener("input", () => {
				clearTimeout(debounceTimer);
				debounceTimer = setTimeout(() => {
					me.active_id = idFilter.value.trim();
					updateUrlWithFilters(me.saved_filters);
					me.fetch_list_data({ reset: true });
				}, 400);
			});
		}

		if (clearFilterButton) {
			clearFilterButton.addEventListener("click", () => {
				if (me._filter_group) me._filter_group.clear_filters();
				me.saved_filters = [];
				me.active_status = "";
				me.active_id = "";
				if (statusFilter) statusFilter.value = "";
				if (idFilter) idFilter.value = "";
				me._fetch_in_progress = false;
				localStorage.removeItem("task_last_filters");
				updateUrlWithFilters([]);
				if (filterButton) update_filter_button_count($(filterButton), 0);
				me.fetch_list_data({ reset: true });
			});
		}

		if (filterButton) {
			$(filterButton).on("click", async function (e) {
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
				await frappe.model.with_doctype("Task");

				me._filter_group = new frappe.ui.FilterGroup({
					parent: popover_content,
					doctype: "Task",
					on_change: function () {
						if (me._suspend_on_change) return;
						me.saved_filters = me._filter_group.get_filters();
						me.fetch_list_data({ reset: true });
						update_filter_button_count($btn, me.saved_filters.length);
						updateUrlWithFilters(me.saved_filters);
					}
				});
				me._filter_group.update_filter_button = function () { };

				let lastDownInsidePopover = false;
				let lastDownOnRemove = false;

				function isDatepickerNode(node) {
					if (!node) return false;
					return !!node.closest && !!node.closest(
						'.flatpickr-calendar, .ui-datepicker, .datepicker, .pika-single, .daterangepicker'
					);
				}

				function onDocMouseDownCapture(ev) {
					const inside = !!ev.target.closest(".filter-popover");
					const onRemove = !!ev.target.closest(".filter-popover .filter-remove, .filter-popover .remove-filter");
					const clickedDatepicker = isDatepickerNode(ev.target) ||
						(ev.composedPath && ev.composedPath().some(n => n && n.classList && (
							n.classList.contains('flatpickr-calendar') ||
							n.classList.contains('ui-datepicker') ||
							n.classList.contains('datepicker') ||
							n.classList.contains('pika-single') ||
							n.classList.contains('daterangepicker')
						)));
					lastDownInsidePopover = inside || clickedDatepicker;
					lastDownOnRemove = onRemove;
				}
				function onDatepickerPointerDown(ev) {
					if (isDatepickerNode(ev.target)) lastDownInsidePopover = true;
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
						me._filter_group.add_filters(me.saved_filters);
					} else {
						me._filter_group.add_filter("Task", "name", "=", "", false);
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

				footer.find('.add-filter').on("click", () =>
					me._filter_group.add_filter("Task", "name", "=", "", false)
				);

				footer.find('.clear-filters').on("click", () => {
					if (me._filter_group) me._filter_group.clear_filters();
					me.saved_filters = [];
					me._suspend_on_change = false;
					me.fetch_list_data({ reset: true });
					update_filter_button_count($btn, 0);
					updateUrlWithFilters([]);
					closePopover($btn);
				});

				footer.find('.apply-filters').on("click", () => {
					if (me._filter_group) {
						me.saved_filters = me._filter_group.get_filters();
						me._suspend_on_change = false;
						me.fetch_list_data({ reset: true });
						update_filter_button_count($btn, me.saved_filters.length);
						updateUrlWithFilters(me.saved_filters);
					}
					closePopover($btn);
				});

				$btn.popover({
					html: true,
					placement: "bottom",
					content: popover_content,
					trigger: "manual",
					container: document.body,
					template: `
						<div class="popover filter-popover fade bs-popover-bottom" role="tooltip">
							<div class="arrow"></div>
							<div class="popover-body popover-content"></div>
						</div>`,
					popperConfig: {
						modifiers: [
							{ name: 'offset', options: { offset: [0, 4] } },
							{ name: 'arrow', options: { element: '.arrow', padding: 6 } },
							{ name: 'preventOverflow', options: { padding: 10, altBoundary: true, tether: false } }
						]
					}
				}).popover("show");

				const onDocClick = function (event) {
					const pathInside = $(event.target).closest(".filter-popover, .filter-button").length ||
						(event.composedPath && event.composedPath().some(n => n && n.classList &&
							(n.classList.contains('filter-popover') || n.classList.contains('filter-button') || n.classList.contains('flatpickr-calendar'))
						));
					if (lastDownOnRemove || lastDownInsidePopover || pathInside) {
						lastDownOnRemove = false;
						return;
					}
					closePopover($btn);
				};
				$(document).on("click.taskFilterPopover", onDocClick);
				$btn.data("guardHandlers", { onDocClick, onDocMouseDownCapture, onDatepickerPointerDown });

				function closePopover($btn) {
					teardownGuards($btn);
					$btn.popover("dispose");
				}
				function teardownGuards($btn) {
					const guards = $btn.data("guardHandlers");
					if (guards) {
						$(document).off("click.taskFilterPopover", guards.onDocClick);
						document.removeEventListener("mousedown", guards.onDocMouseDownCapture, true);
						document.removeEventListener("pointerdown", guards.onDatepickerPointerDown, true);
						$btn.removeData("guardHandlers");
					}
				}
			});
		}

		this._updateUrlWithFilters = updateUrlWithFilters;
	}

	// ===================== DETAILS VIEW =====================
	async show_details(task_id) {
		$(".task-list-view").addClass("d-none");
		$(".task-details-view").removeClass("d-none");
		$(".new-tasks").addClass("d-none");
		this.setPageTitle(`tasks/${task_id}`);
		this.setActiveSidebar();

		try {
			// Always clear the permission cache before fetching details so
			// stale cached values never hide/show buttons incorrectly.
			this._permission_cache = null;

			// Fetch fresh permissions first so we can pass canEdit into render
			const perm = await this.getTaskPermissions(true);
			const canEdit = !!perm.write;

			const r = await frappe.call({
				method: "renewal_module.custom_module.page.tasks.tasks.get_task_details",
				args: { task_name: task_id }
			});
			if (r.message) {
				this._current_task_details = r.message;
				this.render_details_view(r.message, canEdit);
				this.bindTaskDetailEvents(r.message, canEdit);
			}
		} catch (e) { console.error("show_details error:", e); }
	}

	bindTaskDetailEvents(task, canEdit = true) {
		if (!task || !task.name) return;
		this.loadTaskActivityTimeline(task.name);
		this.bindTaskCommentEvents(task.name);
		this.bindTaskEmailHandler(task.name);
		this.bindTaskNotesPanel(task.name);

		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		$(wrapper).off("click.taskdetail").on("click.taskdetail", "[data-task-action]", (e) => {
			e.preventDefault();
			const action = $(e.currentTarget).data("task-action");
			const taskName = task.name;
			if (action === "set_open") {
				this.update_status(taskName, "Open");
			} else if (action === "set_working") {
				this.update_status(taskName, "Working");
			} else if (action === "set_completed") {
				this.update_status(taskName, "Completed");
			} else if (action === "set_cancelled") {
				this.update_status(taskName, "Cancelled");
			} else if (action === "delete") {
				frappe.confirm(__("Are you sure you want to delete this task?"), () => {
					frappe.call({
						method: "frappe.client.delete",
						args: { doctype: "Task", name: taskName },
						callback: (r) => {
							frappe.show_alert({ message: __("Task deleted."), indicator: "green" });
							frappe.set_route("tasks");
						}
					});
				});
			}
		});
	}

	bindTaskNotesPanel(taskName) {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const self = this;

		const $wrapper = $(wrapper);
		const updateAddBtnLabel = (type) => {
			const labels = {
				Notes: "New Note",
				Calls: "New Call",
				Appointments: "New Appointment",
				Tasks: "New Task",
			};
			$wrapper.find("#tasks-btn-panel-add").html(`<i class="fa fa-plus"></i> ${labels[type] || "Add"}`);
		};

		const switchTab = (type) => {
			self.hideTaskPanelForm(wrapper);
			this._active_task_panel_type = type;
			$wrapper.find(".tasks-detail-panel .ptab").removeClass("is-active");
			$wrapper.find(`.tasks-detail-panel .ptab[data-type="${type}"]`).addClass("is-active");
			$wrapper.find("#tasks-panel-subtitle").text(type || "Notes");
			$wrapper.find(".tasks-panel-section").addClass("d-none");
			$wrapper.find(`#tasks-activity-${String(type || "notes").toLowerCase()}-section`).removeClass("d-none");
			updateAddBtnLabel(type || "Notes");

			if (type === "Notes") self.loadTaskNotes(taskName, wrapper);
			if (type === "Calls") self.loadTaskCalls(taskName, wrapper);
			if (type === "Appointments") self.loadTaskAppointments(taskName, wrapper);
			if (type === "Tasks") self.loadRelatedTasks(taskName, wrapper);
		};

		switchTab("Notes");

		$wrapper.off("click", ".tasks-detail-panel .ptab").on("click", ".tasks-detail-panel .ptab", function (e) {
			e.preventDefault();
			switchTab($(this).data("type") || "Notes");
		});

		$(wrapper).off("click", "#tasks-btn-panel-add").on("click", "#tasks-btn-panel-add", function (e) {
			e.preventDefault();
			const type = self._active_task_panel_type || "Notes";
			if (type === "Notes") {
				$wrapper.find("#quick-note-text").trigger("focus");
				return;
			}
			self.showTaskPanelForm(type, taskName, wrapper);
		});

		$wrapper.off("click", "#tasks-btn-panel-close").on("click", "#tasks-btn-panel-close", function (e) {
			e.preventDefault();
			self.hideTaskPanelForm(wrapper);
		});

		$wrapper.off("click", "#tasks-panel-save-btn").on("click", "#tasks-panel-save-btn", async function (e) {
			e.preventDefault();
			const $btn = $(this);
			$btn.prop("disabled", true).text("Saving...");
			try {
				await self.saveTaskPanelData(self._active_task_panel_type || "Notes", taskName, wrapper);
			} finally {
				$btn.prop("disabled", false).text("Save");
			}
		});

		$(wrapper).off("click", "#save-quick-note-btn").on("click", "#save-quick-note-btn", function (e) {
			e.preventDefault();
			const $btn = $(this);
			const text = ($(wrapper).find("#quick-note-text").val() || "").trim();

			if (!text) {
				frappe.msgprint(__("Please enter a note"));
				return;
			}

			$btn.prop("disabled", true).text("Saving...");

			frappe.call({
				method: "renewal_module.custom_module.page.tasks.tasks.add_task_note",
				args: {
					task_name: taskName,
					note_text: text
				},
				callback: function (r) {
					$btn.prop("disabled", false).text("Save Note");
					if (!r.exc) {
						$(wrapper).find("#quick-note-text").val("");
						frappe.show_alert({ message: __("Note added"), indicator: "green" });
						self.loadTaskNotes(taskName, wrapper);
					}
				},
				error: function () {
					$btn.prop("disabled", false).text("Save Note");
				}
			});
		});

		$(wrapper).off("click", ".note-edit").on("click", ".note-edit", function () {
			const idx = $(this).data("idx");
			const currentText = $(this).closest(".note-card").find(".note-text").text().trim();

			const editDialog = frappe.prompt(
				[{ fieldname: "note_text", label: "Edit Note", fieldtype: "Small Text", reqd: 1, default: currentText }],
				(values) => {
					frappe.call({
						method: "renewal_module.custom_module.page.tasks.tasks.update_task_note",
						args: {
							task_name: taskName,
							idx: idx,
							note_text: values.note_text,
						},
						callback: function (r) {
							if (!r.exc) {
								frappe.show_alert({ message: __("Note updated"), indicator: "green" });
								self.loadTaskNotes(taskName, wrapper);
							}
						},
					});
				},
				__("Update Note"),
				__("Update")
			);

			setTimeout(() => {
				try {
					const closeBtn = editDialog?.get_close_btn ? editDialog.get_close_btn() : null;
					if (closeBtn && closeBtn.length) {
						closeBtn.off("click.task_note_edit_close").on("click.task_note_edit_close", function () {
							editDialog.hide();
						});
					}
				} catch (err) {
					console.error("Failed to bind note edit dialog close:", err);
				}
			}, 50);
		});

		$(wrapper).off("click", ".note-delete").on("click", ".note-delete", function (e) {
			e.preventDefault();
			const idx = $(this).data("idx");

			frappe.confirm(
				__("Are you sure you want to delete this note?"),
				() => {
					frappe.call({
						method: "renewal_module.custom_module.page.tasks.tasks.delete_task_note",
						args: {
							task_name: taskName,
							idx: idx,
						},
						callback: function (r) {
							if (!r.exc) {
								frappe.show_alert({ message: __("Note deleted"), indicator: "green" });
								self.loadTaskNotes(taskName, wrapper);
							}
						},
					});
				}
			);
		});
	}

	hideTaskPanelForm(wrapper) {
		$(wrapper).find("#tasks-panel-form-section").addClass("d-none");
		$(wrapper).find("#tasks-panel-cards-section").removeClass("d-none");
		$(wrapper).find("#tasks-btn-panel-add").show();
		$(wrapper).find(".tasks-detail-panel .panel__header").show();
		this._task_panel_assign_control = null;
		this._task_panel_apt_participants_control = null;
		this._task_panel_call_name_control = null;
		this._task_panel_call_selected_customer = "";
	}

	async showTaskPanelForm(type, taskName, wrapper) {
		$(wrapper).find("#tasks-panel-cards-section").addClass("d-none");
		$(wrapper).find("#tasks-panel-form-section").removeClass("d-none");
		$(wrapper).find("#tasks-btn-panel-add").hide();
		$(wrapper).find(".tasks-detail-panel .panel__header").hide();

		let enabledUsers = this._tasks_enabled_users_cache || [];
		if (!enabledUsers.length) {
			try {
				const usersRes = await frappe.call({
					method: "renewal_module.custom_module.page.tasks.tasks.get_enabled_users",
					silent: true,
				});
				enabledUsers = Array.isArray(usersRes?.message) ? usersRes.message : [];
			} catch (e) {
				enabledUsers = [];
			}
			this._tasks_enabled_users_cache = enabledUsers;
		}

		const usersOptions = enabledUsers.map((u) => {
			const label = frappe.utils.escape_html(String(u.full_name || u.name || u.email || "User"));
			const value = frappe.utils.escape_html(String(u.email || u.name || ""));
			return `<option value="${value}">${label}</option>`;
		}).join("");

		const getPanelUserOptions = () => (enabledUsers || []).map((u) => {
			const value = String(u?.email || u?.name || "").trim();
			const label = String(u?.full_name || u?.name || u?.email || value).trim();
			if (!value) return null;
			return { label, value, description: u?.email || value };
		}).filter(Boolean);

		if (type === "Tasks") {
			$(wrapper).find("#tasks-panel-form-title").text("New Task");
			$(wrapper).find("#tasks-panel-save-btn").text("Save Task");
			$(wrapper).find("#tasks-panel-form-body").html(`
				<div class="tasks-form-grid">
					<div class="mb-2"><label class="form-label">Subject *</label><input type="text" id="task-panel-subject" class="form-control" /></div>
					<div class="mb-2"><label class="form-label">Assign To</label><div id="task-panel-assign-control" class="tasks-multi-control"></div><select id="task-panel-assign-to" class="form-control d-none" multiple>${usersOptions}</select></div>
					<div class="row g-2">
						<div class="col-6 mb-2"><label class="form-label">Expected End Date</label><input type="datetime-local" id="task-panel-exp-end" class="form-control" /></div>
						<div class="col-6 mb-2"><label class="form-label">Priority</label><select id="task-panel-priority" class="form-control"><option value="Low" selected>Low</option><option value="Medium">Medium</option><option value="High">High</option></select></div>
					</div>
					<div class="mb-2"><label class="form-label">Description</label><textarea id="task-panel-description" class="form-control" rows="3"></textarea></div>
				</div>
			`);

			this._task_panel_assign_control = null;
			const $host = $(wrapper).find("#task-panel-assign-control");
			if ($host.length && frappe?.ui?.form?.make_control) {
				$host.empty();
				this._task_panel_assign_control = frappe.ui.form.make_control({
					parent: $host,
					df: {
						fieldtype: "MultiSelect",
						fieldname: "task_panel_assign_to",
						label: "",
						options: getPanelUserOptions(),
					},
					render_input: true,
				});
				if (this._task_panel_assign_control?.refresh) {
					this._task_panel_assign_control.refresh();
				}
			}

			if (!this._task_panel_assign_control) {
				$(wrapper).find("#task-panel-assign-to").removeClass("d-none");
			}
			return;
		}

		if (type === "Calls") {
			const activeTaskDoc = this._current_task_details && this._current_task_details.name === taskName
				? this._current_task_details
				: {};

			const refDoctype = String(activeTaskDoc.reference || activeTaskDoc.reference_type || "").trim();
			const refName = String(activeTaskDoc.reference_to || activeTaskDoc.reference_name || "").trim();

			let defaultRelatedTo = "Customer";
			let defaultCustomer = "";
			let defaultContact = "";

			if (refDoctype === "Contact" && refName) {
				defaultRelatedTo = "Contact";
				defaultContact = refName;
			} else if (refDoctype === "Customer" && refName) {
				defaultRelatedTo = "Customer";
				defaultCustomer = refName;
			}

			this._task_panel_call_selected_customer = defaultCustomer;

			const getContactLinkedCustomer = async (contactName) => {
				const name = String(contactName || "").trim();
				if (!name) return "";
				try {
					const res = await frappe.call({
						method: "frappe.client.get",
						args: { doctype: "Contact", name },
						silent: true,
					});
					const links = res?.message?.links || [];
					const customerLink = links.find((l) => l.link_doctype === "Customer" && l.link_name);
					return customerLink?.link_name || "";
				} catch (e) {
					return "";
				}
			};

			if (!this._task_panel_call_selected_customer && defaultContact) {
				this._task_panel_call_selected_customer = await getContactLinkedCustomer(defaultContact);
			}

			$(wrapper).find("#tasks-panel-form-title").text("New Call");
			$(wrapper).find("#tasks-panel-save-btn").text("Save Call");
			$(wrapper).find("#tasks-panel-form-body").html(`
				<div class="tasks-form-grid">
					<div class="mb-2"><label class="form-label">Subject *</label><input type="text" id="task-call-subject" class="form-control" /></div>
					<div class="mb-2"><label class="form-label">Status</label><select id="task-call-status" class="form-control"><option value="Held">Held</option><option value="Scheduled">Scheduled</option><option value="Cancelled">Cancelled</option></select></div>
					<div class="row g-2">
						<div class="col-6 mb-2"><label class="form-label">Start Date</label><input type="date" id="task-call-start-date" class="form-control" /></div>
						<div class="col-6 mb-2"><label class="form-label">Start Time</label><input type="time" id="task-call-start-time" class="form-control" /></div>
					</div>
					<div class="row g-2">
						<div class="col-6 mb-2"><label class="form-label">End Date</label><input type="date" id="task-call-end-date" class="form-control" /></div>
						<div class="col-6 mb-2"><label class="form-label">End Time</label><input type="time" id="task-call-end-time" class="form-control" /></div>
					</div>
					<div class="row g-2">
						<div class="col-6 mb-2"><label class="form-label">Related To</label><select id="task-call-related-to" class="form-control"><option value="Customer">Customer</option><option value="Contact">Contact</option></select></div>
						<div class="col-6 mb-2"><label class="form-label">Full Name *</label><div id="task-call-name1-control"></div></div>
					</div>
					<div class="mb-2"><label class="form-label">Description</label><textarea id="task-call-description" class="form-control" rows="3"></textarea></div>
				</div>
			`);

			$(wrapper).find("#task-call-related-to").val(defaultRelatedTo);

			const renderCallNameControl = async () => {
				const relatedTo = String($(wrapper).find("#task-call-related-to").val() || "Customer").trim();
				const $host = $(wrapper).find("#task-call-name1-control");
				$host.empty();

				this._task_panel_call_name_control = frappe.ui.form.make_control({
					parent: $host[0],
					df: {
						fieldtype: "Link",
						fieldname: "task_call_name1",
						label: "",
						options: relatedTo,
						reqd: 1,
						onchange: () => {
							if (relatedTo === "Customer") {
								this._task_panel_call_selected_customer = this._task_panel_call_name_control?.get_value?.() || this._task_panel_call_selected_customer;
							}
						},
					},
					render_input: true,
				});

				this._task_panel_call_name_control.refresh();
				// Keep the Link field search/autocomplete, but disable the open-document arrow button.
				$host.find(".link-btn")
					.addClass("d-none")
					.attr("tabindex", "-1")
					.attr("aria-hidden", "true");
				$host.off("click.task_call_name_link", ".link-btn").on("click.task_call_name_link", ".link-btn", function (e) {
					e.preventDefault();
					e.stopPropagation();
					return false;
				});

				if (relatedTo === "Contact") {
					this._task_panel_call_name_control.get_query = () => {
						const selectedCustomer = String(this._task_panel_call_selected_customer || "").trim();
						if (!selectedCustomer) {
							return {};
						}
						return {
							query: "frappe.contacts.doctype.contact.contact.contact_query",
							filters: {
								link_doctype: "Customer",
								link_name: selectedCustomer,
							},
						};
					};
					this._task_panel_call_name_control.set_value(defaultContact || "");
				} else {
					this._task_panel_call_name_control.set_value(this._task_panel_call_selected_customer || defaultCustomer || "");
				}
				
			};

			const pad2 = (value) => String(value).padStart(2, "0");
			const toInputDate = (dt) => `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
			const toInputTime = (dt) => `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;

			const now = new Date();
			const end = new Date(now.getTime() + (10 * 60 * 1000));

			$(wrapper).find("#task-call-start-date").val(toInputDate(now));
			$(wrapper).find("#task-call-start-time").val(toInputTime(now));
			$(wrapper).find("#task-call-end-date").val(toInputDate(end));
			$(wrapper).find("#task-call-end-time").val(toInputTime(end));

			$(wrapper).find("#task-call-related-to").off("change").on("change", async () => {
				const relatedTo = String($(wrapper).find("#task-call-related-to").val() || "Customer").trim();
				if (relatedTo === "Contact") {
					const currentCustomer = this._task_panel_call_name_control?.get_value?.();
					if (currentCustomer) this._task_panel_call_selected_customer = currentCustomer;
				}
				await renderCallNameControl();
			});

			await renderCallNameControl();
			return;
		}

		if (type === "Appointments") {
			const nowDate = frappe.datetime.now_date ? frappe.datetime.now_date() : new Date().toISOString().slice(0, 10);
			$(wrapper).find("#tasks-panel-form-title").text("New Appointment");
			$(wrapper).find("#tasks-panel-save-btn").text("Save Appointment");
			$(wrapper).find("#tasks-panel-form-body").html(`
				<div class="tasks-form-grid">
					<div class="mb-2"><label class="form-label">Appointment With</label><select id="task-apt-with" class="form-control"><option value="Customer" selected>Customer</option><option value="Lead">Lead</option></select></div>
					<div class="mb-2"><label class="form-label">Party</label><input type="text" id="task-apt-party" class="form-control" /></div>
					<div class="mb-2"><label class="form-label">Subject *</label><input type="text" id="task-apt-subject" class="form-control" /></div>
					<div class="mb-2"><label class="form-label">Name *</label><input type="text" id="task-apt-name" class="form-control" /></div>
					<div class="mb-2"><label class="form-label">Email</label><input type="email" id="task-apt-email" class="form-control" /></div>
					<div class="mb-2"><label class="form-label">Phone Number</label><input type="text" id="task-apt-phone" class="form-control" /></div>
					<div class="row g-2">
						<div class="col-6 mb-2"><label class="form-label">Start Date *</label><input type="date" id="task-apt-start-date" class="form-control" value="${nowDate}" /></div>
						<div class="col-6 mb-2"><label class="form-label">Start Time</label><input type="time" id="task-apt-start-time" class="form-control" /></div>
					</div>
					<div class="row g-2">
						<div class="col-6 mb-2"><label class="form-label">End Date</label><input type="date" id="task-apt-end-date" class="form-control" /></div>
						<div class="col-6 mb-2"><label class="form-label">End Time</label><input type="time" id="task-apt-end-time" class="form-control" /></div>
					</div>
					<div class="row g-2">
						<div class="col-6 mb-2"><label class="form-label">Scheduled Time</label><input type="datetime-local" id="task-apt-scheduled-time" class="form-control" /></div>
					</div>
					<div class="mb-2"><label class="form-label">Participants *</label><div id="task-apt-participants-control" class="tasks-multi-control"></div><select id="task-apt-participants" class="form-control d-none" multiple>${usersOptions}</select></div>	
					<div class="mb-2"><label class="form-label">Details</label><textarea id="task-apt-details" class="form-control" rows="3"></textarea></div>
				</div>
			`);

			this._task_panel_apt_participants_control = null;
			const $participantsHost = $(wrapper).find("#task-apt-participants-control");
			if ($participantsHost.length && frappe?.ui?.form?.make_control) {
				$participantsHost.empty();
				this._task_panel_apt_participants_control = frappe.ui.form.make_control({
					parent: $participantsHost,
					df: {
						fieldtype: "MultiSelect",
						fieldname: "task_apt_participants",
						label: "",
						options: getPanelUserOptions(),
					},
					render_input: true,
				});

				if (this._task_panel_apt_participants_control?.refresh) {
					this._task_panel_apt_participants_control.refresh();
				}
			}

			if (!this._task_panel_apt_participants_control) {
				$(wrapper).find("#task-apt-participants").removeClass("d-none");
			}
		}
	}

	async saveTaskPanelData(type, taskName, wrapper) {
		if (type === "Notes") return;
		try {
			if (type === "Tasks") {
				const subject = ($(wrapper).find("#task-panel-subject").val() || "").trim();
				let selectedUsers = [];
				if (this._task_panel_assign_control && typeof this._task_panel_assign_control.get_value === "function") {
					const raw = this._task_panel_assign_control.get_value();
					if (Array.isArray(raw)) {
						selectedUsers = raw.map((v) => String(v || "").trim()).filter(Boolean);
					} else {
						selectedUsers = String(raw || "").split(",").map((v) => v.trim()).filter(Boolean);
					}
				} else {
					selectedUsers = $(wrapper).find("#task-panel-assign-to").val() || [];
				}
				let expEndDate = ($(wrapper).find("#task-panel-exp-end").val() || "").trim();
				if (expEndDate.includes("T")) {
					expEndDate = expEndDate.replace("T", " ");
					if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(expEndDate)) expEndDate += ":00";
				}
				if (!subject) {
					frappe.msgprint(__("Please enter task subject"));
					return;
				}
				await frappe.call({
					method: "frappe.client.insert",
					args: {
						doc: {
							doctype: "Task",
							subject,
							description: $(wrapper).find("#task-panel-description").val() || "",
							exp_end_date: expEndDate,
							priority: $(wrapper).find("#task-panel-priority").val() || "Low",
							parent_task: taskName,
							custom_users: (Array.isArray(selectedUsers) ? selectedUsers : [selectedUsers]).filter(Boolean).map((email) => ({ user: email })),
							reference: "Task",
							reference_to: taskName,
						}
					}
				});
				frappe.show_alert({ message: __("Task created"), indicator: "green" });
				this.loadRelatedTasks(taskName, wrapper);
				this.hideTaskPanelForm(wrapper);
				return;
			}

			if (type === "Calls") {
				const subject = ($(wrapper).find("#task-call-subject").val() || "").trim();
				const relatedTo = ($(wrapper).find("#task-call-related-to").val() || "Customer").trim();
				let name1 = this._task_panel_call_name_control?.get_value?.() || "";
				if (!name1) {
					name1 = ($(wrapper).find("#task-call-name1").val() || "").trim();
				}
				if (!name1 && relatedTo === "Customer") {
					name1 = String(this._task_panel_call_selected_customer || "").trim();
				}
				if (!subject || !name1) {
					frappe.msgprint(__("Please fill required call fields"));
					return;
				}
				await frappe.call({
					method: "frappe.client.insert",
					args: {
						doc: {
							doctype: "Call List",
							subject,
							name1,
							related_to: relatedTo,
							status: $(wrapper).find("#task-call-status").val() || "Held",
							description: $(wrapper).find("#task-call-description").val() || "",
							start_date: $(wrapper).find("#task-call-start-date").val() || "",
							start_timing: $(wrapper).find("#task-call-start-time").val() || "",
							end_date: $(wrapper).find("#task-call-end-date").val() || "",
							end_timing: $(wrapper).find("#task-call-end-time").val() || "",
							custom_date: frappe.datetime.get_today(),
							reference: "Task",
							reference_to: taskName,
						}
					}
				});
				frappe.show_alert({ message: __("Call created"), indicator: "green" });
				this.loadTaskCalls(taskName, wrapper);
				this.hideTaskPanelForm(wrapper);
				return;
			}

			if (type === "Appointments") {
				const customer_name = ($(wrapper).find("#task-apt-name").val() || "").trim();
				let participants = [];
				if (this._task_panel_apt_participants_control && typeof this._task_panel_apt_participants_control.get_value === "function") {
					const raw = this._task_panel_apt_participants_control.get_value();
					if (Array.isArray(raw)) {
						participants = raw.map((v) => String(v || "").trim()).filter(Boolean);
					} else {
						participants = String(raw || "").split(",").map((v) => v.trim()).filter(Boolean);
					}
				} else {
					participants = $(wrapper).find("#task-apt-participants").val() || [];
				}
				const custom_subject = ($(wrapper).find("#task-apt-subject").val() || "").trim();
				if (!customer_name && !custom_subject) {
					frappe.msgprint(__("Please enter appointment name or subject"));
					return;
				}
				if (!participants.length) {
					frappe.msgprint(__("Please select participants"));
					return;
				}
				let scheduledTime = ($(wrapper).find("#task-apt-scheduled-time").val() || "").trim();
				if (scheduledTime) {
					scheduledTime = scheduledTime.replace("T", " ");
					if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(scheduledTime)) scheduledTime += ":00";
				}
				let customStartTime = ($(wrapper).find("#task-apt-start-time").val() || "").trim();
				if (customStartTime && /^\d{2}:\d{2}$/.test(customStartTime)) customStartTime += ":00";
				let customEndTime = ($(wrapper).find("#task-apt-end-time").val() || "").trim();
				if (customEndTime && /^\d{2}:\d{2}$/.test(customEndTime)) customEndTime += ":00";
				await frappe.call({
					method: "frappe.client.insert",
					args: {
						doc: {
							doctype: "Appointment",
							appointment_with: $(wrapper).find("#task-apt-with").val() || "Customer",
							party: $(wrapper).find("#task-apt-party").val() || "",
							custom_subject,
							customer_name,
							customer_email: $(wrapper).find("#task-apt-email").val() || "",
							customer_phone_number: $(wrapper).find("#task-apt-phone").val() || "",
							custom_start_date: $(wrapper).find("#task-apt-start-date").val() || "",
							custom_start_time: customStartTime,
							custom_end_date: $(wrapper).find("#task-apt-end-date").val() || "",
							custom_end_time: customEndTime,
							customer_details: $(wrapper).find("#task-apt-details").val() || "",
							custom_participants: (Array.isArray(participants) ? participants : [participants]).filter(Boolean).map((email) => ({ user: email })),
							scheduled_time: scheduledTime,
							reference: "Task",
							reference_to: taskName,
						}
					}
				});
				frappe.show_alert({ message: __("Appointment created"), indicator: "green" });
				this.loadTaskAppointments(taskName, wrapper);
				this.hideTaskPanelForm(wrapper);
			}
		} catch (err) {
			console.error("Error saving task panel data:", err);
			frappe.msgprint(__("Error saving. Please check required fields and try again."));
		}
	}

	loadTaskNotes(taskName, wrapper) {
		const notesContainer = $(wrapper).find("#main-notes-list");
		if (!notesContainer.length) return;

		notesContainer.html('<div class="text-center p-3 text-muted small">Loading notes...</div>');

		frappe.call({
			method: "renewal_module.custom_module.page.tasks.tasks.get_task_notes",
			args: { task_name: taskName },
			callback: (r) => {
				const notes = Array.isArray(r.message)
					? r.message
					: (r.message?.notes || []);

				if (!notes.length) {
					notesContainer.html(`
						<div class="empty-state-list text-center py-4">
							<i class="fa fa-file-text-o text-muted mb-2" style="font-size: 24px;"></i>
							<p class="text-muted mb-0" style="font-size: 13px;">No notes found.</p>
						</div>
					`);
					return;
				}

				const sortedNotes = [...notes].sort((a, b) => new Date(b.timestamp || b.creation) - new Date(a.timestamp || a.creation));
				const notesHtml = sortedNotes.map((note) => {
					const displayNameRaw = note.created_by || note.owner || "";
					const initials = displayNameRaw.split(" ").map((n) => n[0]).join("").substring(0, 2).toUpperCase();
					const timestampRaw = note.timestamp || note.creation;
					const timestamp = timestampRaw ? frappe.datetime.str_to_user(timestampRaw) : "";
					const isOwner = frappe.session.user === note.owner;
					const isAdmin = frappe.session.user === "Administrator";
					const creatorName = frappe.utils.escape_html(displayNameRaw);
					const customRole = frappe.utils.escape_html(note.custom_role || "");
					const noteBody = frappe.utils.escape_html(note.note || note.description || "").replace(/\n/g, "<br>");
					const avatarInitials = frappe.utils.escape_html(initials || "NA");
					const actionButtons = `
						${isOwner || isAdmin ? `<button class="note-edit btn btn-sm btn-light border me-1" data-idx="${note.idx}" title="Edit note" aria-label="Edit note">✏️</button>` : ""}
						${isAdmin ? `<button class="note-delete btn btn-sm btn-light border text-danger" data-idx="${note.idx}" title="Delete note" aria-label="Delete note">🗑️</button>` : ""}
					`;

					return `
						<div class="note-card mb-2 p-2 border rounded bg-white">
							<div class="d-flex justify-content-between align-items-start gap-2">
								<div class="d-flex align-items-center flex-grow-1" style="min-width:0;">
									<div class="rounded-circle bg-primary text-white d-flex align-items-center justify-content-center fw-bold me-2 flex-shrink-0" style="width:32px;height:32px;">${avatarInitials}</div>
									<div class="flex-grow-1" style="min-width:0;">
										<div class="text-muted text-truncate" title="${creatorName}">${creatorName}</div>
										${customRole ? `<div class="small text-muted">${customRole}</div>` : ""}
									</div>
								</div>
								<div class="d-flex align-items-center">${actionButtons}</div>
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

				notesContainer.html(notesHtml);
			},
			error: () => {
				notesContainer.html(`
					<div class="alert alert-danger" role="alert">
						Failed to load notes. Please try again.
					</div>
				`);
			}
		});
	}

	loadTaskCalls(taskName, wrapper) {
		const container = $(wrapper).find("#activity-calls-container");
		const loadMoreBtn = $(wrapper).find("#calls-card-load-more");
		if (!container.length) return;
		container.html('<div class="text-center p-3 text-muted small">Loading calls...</div>');
		loadMoreBtn.hide();
		const MAX_VISIBLE_CALLS = 5;
		let activeCallFilter = this._task_panel_call_filter || "all";
		const esc = frappe.utils.escape_html;
		const normalizeStatus = (status) => (status || "").toLowerCase();
		const safeId = (v) => String(v || "").replace(/[^a-zA-Z0-9-_]/g, "_");
		const formatDate = (dt) => {
			if (!dt) return "";
			const iso = String(dt).split(" ")[0];
			const [y, m, d] = iso.split("-");
			if (!y || !m || !d) return String(dt);
			return `${d}-${m}-${y}`;
		};
		const formatTime = (tm) => {
			if (!tm) return "";
			const parts = String(tm).split(":");
			if (parts.length < 2) return String(tm);
			const hh = String(parts[0]).padStart(2, "0");
			const mm = String(parts[1]).padStart(2, "0");
			return `${hh}:${mm}`;
		};
		const statusBadgeClass = (status) => {
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
		};
		const simpleInitialAvatar = (owner) => {
			const init = (owner || "U").substring(0, 2).toUpperCase();
			return `<span class="task-panel-avatar task-panel-avatar-initials">${init}</span>`;
		};
		const buildCallCard = (c) => {
			const id = safeId(c.name);
			return `
				<div class="call-card p-2 mb-2 rounded shadow-sm" style="background:#f8f9fa;border:1px solid #e6e6e6;">
					<div class="d-flex justify-content-between align-items-center mb-1 gap-1">
						<div class="fw-bold text-primary text-truncate" title="${esc(c.subject || "")}">
							${esc(c.subject || "")}
						</div>
						<div id="task-call-avatar-${id}" title="${esc(c.owner || "")}">${simpleInitialAvatar(c.owner)}</div>
					</div>
					<div class="d-flex justify-content-between align-items-center mb-1 gap-1">
						<span class="text-dark text-truncate" title="${esc(c.name1 || "")}">${esc(c.name1 || "")}</span>
						<span class="text-truncate status-badge ${statusBadgeClass(c.status)} rounded" title="${esc(c.status || "")}">${esc(c.status || "")}</span>
						<span class="task-call-open badge bg-light p-1" data-name="${esc(c.name)}" title="${esc(c.name)}" style="cursor:pointer;border:1px solid #ddd;">
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
		};
		const loadCallAvatars = async (list) => {
			if (!frappe.model.can_read("User")) return;

			const owners = [...new Set((list || []).map((x) => x.owner).filter(Boolean))];
			if (!owners.length) return;

			const res = await frappe.call({
				method: "renewal_module.custom_module.page.tasks.tasks.get_users_basic_info",
				args: { users: owners },
				silent: true,
			});

			const map = {};
			(res.message || []).forEach((u) => { map[u.name] = u; });

			list.forEach((c) => {
				const u = map[c.owner];
				const holder = container.find(`#task-call-avatar-${safeId(c.name)}`)[0];
				if (!holder || !u?.user_image) return;

				holder.innerHTML = `<img src="${u.user_image}" class="task-panel-avatar task-panel-avatar-img">`;
			});
		};
		frappe.call({
			method: "renewal_module.custom_module.page.tasks.tasks.get_task_calls",
			args: { task_name: taskName },
			callback: async (r) => {
				const calls = r.message || [];
				if (!calls.length) {
					loadMoreBtn.hide();
					container.html('<div class="empty-state-list text-center py-4"><i class="fa fa-phone text-muted mb-2" style="font-size: 24px;"></i><p class="text-muted mb-0" style="font-size: 13px;">No calls found.</p></div>');
					return;
				}

				const getFilteredCalls = (filter) => {
					if (filter === "all") return calls;
					return calls.filter((c) => normalizeStatus(c.status) === filter);
				};

				const updateTabCounts = () => {
					const totalCount = calls.length;
					const heldCount = calls.filter((c) => normalizeStatus(c.status) === "held").length;
					const scheduledCount = calls.filter((c) => normalizeStatus(c.status) === "scheduled").length;
					const cancelledCount = calls.filter((c) => normalizeStatus(c.status) === "cancelled").length;
					$(wrapper).find("#task-calls-card-tabs .call-tab").each(function () {
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

				const updateTabStyles = (filter) => {
					$(wrapper).find("#task-calls-card-tabs .call-tab").each(function () {
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
					if (!filteredCalls.length) {
						loadMoreBtn.hide();
						container.html('<div class="empty-state-list text-center py-4"><i class="fa fa-phone text-muted mb-2" style="font-size: 24px;"></i><p class="text-muted mb-0" style="font-size: 13px;">No calls found.</p></div>');
						return;
					}

					const visibleCalls = filteredCalls.slice(0, MAX_VISIBLE_CALLS);
					const html = visibleCalls.map((c) => buildCallCard(c)).join("");

					container.html(html);
					await loadCallAvatars(visibleCalls).catch((err) => {
						console.error("Failed to load call avatars:", err);
					});
					loadMoreBtn.toggle(filteredCalls.length > MAX_VISIBLE_CALLS);
				};

				updateTabCounts();
				updateTabStyles(activeCallFilter);
				await renderCalls(activeCallFilter);

				$(wrapper).off("click", "#task-calls-card-tabs .call-tab").on("click", "#task-calls-card-tabs .call-tab", (e) => {
					activeCallFilter = $(e.currentTarget).data("callFilter") || "all";
					this._task_panel_call_filter = activeCallFilter;
					updateTabStyles(activeCallFilter);
					renderCalls(activeCallFilter);
				});

				$(wrapper).off("click", ".task-call-open").on("click", ".task-call-open", function () {
					const name = $(this).data("name");
					if (name) {
						const url = `/app/call-lists/` + name;
						window.open(url, "_blank");
					}
				});

				$(wrapper).off("click", "#calls-card-load-more").on("click", "#calls-card-load-more", () => {
					const advancedFilters = [
						["Call List", "reference", "=", "Task"],
						["Call List", "reference_to", "=", taskName]
					];
					const params = new URLSearchParams();
					params.set("filters", encodeURIComponent(JSON.stringify(advancedFilters)));
					if (activeCallFilter === "held") params.set("status", "Held");
					if (activeCallFilter === "scheduled") params.set("status", "Scheduled");
					if (activeCallFilter === "cancelled") params.set("status", "Cancelled");
					const url = `/app/call-lists?${params.toString()}`;
					window.open(url, "_blank");
				});
			},
			error: () => {
				loadMoreBtn.hide();
				container.html('<div class="alert alert-danger">Failed to load calls.</div>');
			}
		});
	}

	loadTaskAppointments(taskName, wrapper) {
		const container = $(wrapper).find("#activity-appointments-container");
		const loadMoreBtn = $(wrapper).find("#appointments-card-load-more");
		if (!container.length) return;
		container.html('<div class="text-center p-3 text-muted small">Loading appointments...</div>');
		loadMoreBtn.hide();
		const MAX_VISIBLE_APPOINTMENTS = 5;
		let activeAppointmentFilter = this._task_panel_appointment_filter || "all";
		let expandedAppointments = false;
		const esc = frappe.utils.escape_html;
		const normalizeStatus = (status) => (status || "").toLowerCase();
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
		const simpleInitialAvatar = (label) => {
			const init = (label || "U").substring(0, 2).toUpperCase();
			return `<span class="task-panel-avatar task-panel-avatar-initials">${init}</span>`;
		};
		const getAppointmentInitials = (name) => {
			const parts = (name || "User").trim().split(/\s+/);
			return ((parts[0]?.[0] || "U") + (parts[1]?.[0] || "")).toUpperCase();
		};
		const buildAppointmentAvatar = (user) => {
			if (user.image) return `<img src="${user.image}" class="task-panel-avatar task-panel-avatar-img">`;
			return `<span class="avatar-initials task-panel-avatar task-panel-avatar-initials">${getAppointmentInitials(user.full_name)}</span>`;
		};
		const buildAppointmentAvatarGroup = (users) => {
			const visible = users.slice(0, 3);
			const extra = users.length - visible.length;
			return `
				<div class="task-panel-avatar-group">
					${visible.map((u, i) => `
						<div class="avatar-item task-panel-avatar-item" title="${esc(u.full_name || "")}" style="margin-left:${i === 0 ? 0 : "-6px"};">
							${buildAppointmentAvatar(u)}
						</div>
					`).join("")}
					${extra > 0 ? `<div class="extra-avatar task-panel-avatar-extra" title="${esc(users.slice(3).map((u) => u.full_name).join(", "))}">+${extra}</div>` : ""}
				</div>
			`;
		};
		frappe.call({
			method: "renewal_module.custom_module.page.tasks.tasks.get_task_appointments",
			args: { task_name: taskName },
			callback: async (r) => {
				let appts = r.message || [];

				const participantIds = [...new Set(
					appts.flatMap((a) => a.custom_participants || []).filter(Boolean)
				)];
				let participantMap = {};

				if (participantIds.length && frappe.model.can_read("User")) {
					try {
						const usersRes = await frappe.call({
							method: "renewal_module.custom_module.page.tasks.tasks.get_users_basic_info",
							args: { users: participantIds },
							silent: true,
						});
						(usersRes.message || []).forEach((u) => {
							participantMap[u.name] = {
								full_name: u.full_name || u.name,
								image: u.user_image ? frappe.utils.get_file_link(u.user_image) : null,
							};
						});
					} catch (err) {
						console.error("Failed to load appointment participants:", err);
					}
				}

				appts = appts.map((a) => ({
					...a,
					participant_info: (a.custom_participants || []).map((id) => participantMap[id]).filter(Boolean),
				}));

				if (!appts.length) {
					loadMoreBtn.hide();
					container.html('<div class="empty-state-list text-center py-4"><i class="fa fa-calendar text-muted mb-2" style="font-size: 24px;"></i><p class="text-muted mb-0" style="font-size: 13px;">No appointments found.</p></div>');
					return;
				}

				const getFilteredAppointments = (filter) => {
					if (filter === "all") return appts;
					return appts.filter((a) => normalizeStatus(a.status) === filter);
				};

				const updateTabCounts = () => {
					const totalCount = appts.length;
					const openCount = appts.filter((a) => normalizeStatus(a.status) === "open").length;
					const unverifiedCount = appts.filter((a) => normalizeStatus(a.status) === "unverified").length;
					const closedCount = appts.filter((a) => normalizeStatus(a.status) === "closed").length;
					$(wrapper).find("#task-appointments-card-tabs .appointment-tab").each(function () {
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

				const updateTabStyles = (filter) => {
					$(wrapper).find("#task-appointments-card-tabs .appointment-tab").each(function () {
						const $btn = $(this);
						const isActive = $btn.data("appointmentFilter") === filter;
						$btn.toggleClass("active", isActive);
						$btn.css("border", isActive ? "1px solid #007bff" : "");
						$btn.css("color", isActive ? "#007bff" : "");
						$btn.toggleClass("btn-outline-secondary", !isActive);
					});
				};

				const renderAppointments = (filter) => {
					const filteredAppts = getFilteredAppointments(filter);
					if (!filteredAppts.length) {
						loadMoreBtn.hide();
						container.html('<div class="empty-state-list text-center py-4"><i class="fa fa-calendar text-muted mb-2" style="font-size: 24px;"></i><p class="text-muted mb-0" style="font-size: 13px;">No appointments found.</p></div>');
						return;
					}

					const listToRender = expandedAppointments
						? filteredAppts
						: filteredAppts.slice(0, MAX_VISIBLE_APPOINTMENTS);

					container.html(listToRender.map((a) => `
					<div class="call-card p-2 mb-2 rounded shadow-sm" style="background:#f8f9fa;border:1px solid #e6e6e6;">
						<div class="d-flex justify-content-between align-items-center mb-1 gap-1">
							<div class="fw-bold text-primary text-truncate" title="${esc(a.customer_name || "")}">${esc(a.customer_name || a.name || "Appointment")}</div>
							<div>${(a.participant_info || []).length ? buildAppointmentAvatarGroup(a.participant_info) : simpleInitialAvatar(a.owner || a.customer_name || a.name || "Appointment")}</div>
						</div>
						${a.custom_subject ? `<div class="text-truncate text-dark mb-1" title="${esc(a.custom_subject)}">${esc(a.custom_subject)}</div>` : ""}
						<div class="d-flex justify-content-between align-items-center mb-1 gap-1">
							<span class="text-dark text-truncate" title="${esc(a.customer_phone_number || "")}">${esc(a.customer_phone_number || "")}</span>
							<span class="text-truncate status-badge ${appointmentStatusBadgeClass(a.status)} rounded" title="${esc(a.status || "")}">${esc(a.status || "")}</span>
							<span class="task-appointment-open badge bg-light p-1" data-name="${esc(a.name)}" title="${esc(a.name)}" style="cursor:pointer;border:1px solid #ddd;">${esc(a.name || "")}</span>
						</div>
						<div class="row small">
							<div class="col-12">
								${a.customer_email ? `<div title="${esc(a.customer_email)}"><i class="fa fa-envelope text-primary mr-1"></i>${esc(a.customer_email)}</div>` : ""}
							</div>
						</div>
						<div class="d-flex justify-content-between align-items-center mb-1 gap-1">
							<div>
								${a.custom_start_date ? `<div><i class="fa fa-calendar-days text-warning mr-1"></i>${esc(formatDate(a.custom_start_date))}</div>` : ""}
								${a.custom_start_time ? `<div><i class="fa fa-clock text-primary mr-1"></i>${esc(a.custom_start_time)}</div>` : ""}
							</div>
							<div>
								${a.custom_end_date ? `<div><i class="fa fa-calendar-days text-warning mr-1"></i>${esc(formatDate(a.custom_end_date))}</div>` : ""}
								${a.custom_end_time ? `<div><i class="fa fa-clock text-primary mr-1"></i>${esc(a.custom_end_time)}</div>` : ""}
							</div>
						</div>
					</div>
				`).join(""));

					loadMoreBtn.toggle(!expandedAppointments && filteredAppts.length > MAX_VISIBLE_APPOINTMENTS);
				};

				updateTabCounts();
				updateTabStyles(activeAppointmentFilter);
				renderAppointments(activeAppointmentFilter);

				$(wrapper).off("click", "#task-appointments-card-tabs .appointment-tab").on("click", "#task-appointments-card-tabs .appointment-tab", (e) => {
					activeAppointmentFilter = $(e.currentTarget).data("appointmentFilter") || "all";
					this._task_panel_appointment_filter = activeAppointmentFilter;
					expandedAppointments = false;
					updateTabStyles(activeAppointmentFilter);
					renderAppointments(activeAppointmentFilter);
				});

				$(wrapper).off("click", "#appointments-card-load-more").on("click", "#appointments-card-load-more", () => {
					const advancedFilters = [
						["Appointment", "reference", "=", "Task"],
						["Appointment", "reference_to", "=", taskName]
					];
					const params = new URLSearchParams();
					params.set("filters", encodeURIComponent(JSON.stringify(advancedFilters)));

					if (activeAppointmentFilter === "open") params.set("status", "Open");
					if (activeAppointmentFilter === "unverified") params.set("status", "Unverified");
					if (activeAppointmentFilter === "closed") params.set("status", "Closed");

					const url = `/app/appointments?${params.toString()}`;
					window.open(url, "_blank");
				});

				$(wrapper).off("click", ".task-appointment-open").on("click", ".task-appointment-open", function () {
					const name = $(this).data("name");
					if (name) {
						const url = `/app/appointments/` + name;
						window.open(url, "_blank");
					}
				});
			},
			error: () => {
				loadMoreBtn.hide();
				container.html('<div class="alert alert-danger">Failed to load appointments.</div>');
			}
		});
	}

	loadRelatedTasks(taskName, wrapper) {
		const container = $(wrapper).find("#activity-related-tasks-container");
		const loadMoreBtn = $(wrapper).find("#related-tasks-card-load-more");
		if (!container.length) return;
		container.html('<div class="text-center p-3 text-muted small">Loading tasks...</div>');
		loadMoreBtn.hide();
		const MAX_VISIBLE_TASKS = 5;
		let activeTaskFilter = this._task_panel_task_filter || "all";
		let expandedTasks = false;
		const esc = frappe.utils.escape_html;
		const normalizeStatus = (status) => (status || "").toLowerCase();
		const isCompleted = (task) => normalizeStatus(task.status) === "completed";
		const safeId = (v) => String(v || "").replace(/[^a-zA-Z0-9-_]/g, "_");

		const statusBadgeClass = (status) => {
			switch (status) {
				case "Open":
					return "bg-warning text-white";
				case "Working":
					return "bg-primary text-white";
				case "Pending Review":
					return "bg-success text-white";
				case "Overdue":
					return "bg-secondary text-white";
				case "Templated":
					return "bg-info text-white";
				case "Cancelled":
					return "bg-danger text-white";
				default:
					return "bg-light text-dark";
			}
		};

		const formatDateTimeDisplay = (value) => {
			if (!value) return "";
			const dt = value instanceof Date ? value : new Date(value);
			if (Number.isNaN(dt.getTime())) return "";
			const dd = String(dt.getDate()).padStart(2, "0");
			const mm = String(dt.getMonth() + 1).padStart(2, "0");
			const yy = String(dt.getFullYear()).slice(-2);
			const hh = String(dt.getHours()).padStart(2, "0");
			const min = String(dt.getMinutes()).padStart(2, "0");
			return `${dd}-${mm}-${yy} ${hh}:${min}`;
		};

		const getInitials = (name) => {
			const p = (name || "User").trim().split(/\s+/);
			return ((p[0]?.[0] || "U") + (p[1]?.[0] || "")).toUpperCase();
		};

		const buildAvatar = (user) => {
			if (user.image) {
				return `<img src="${user.image}" class="task-user-avatar-img">`;
			}

			return `<span class="task-user-avatar-initials">${getInitials(user.full_name)}</span>`;
		};

		const buildAvatarGroup = (users) => {
			if (!users?.length) return "";
			const shown = users.slice(0, 2);
			const extra = users.length - shown.length;
			return `
				<div class="task-user-avatar-group">
					${shown.map((u, i) => `
						<div class="task-user-avatar-item" title="${esc(u.full_name || "")}" style="margin-left:${i === 0 ? "0" : "-8px"};">
							${buildAvatar(u)}
						</div>`)
					.join("")}
					${extra > 0 ? `
						<div class="task-user-avatar-extra" title="${users.slice(2).map((u) => esc(u.full_name)).join(", ")}">
							+${extra}
						</div>
					` : ""}
				</div>
			`;
		};

		const fillTaskAvatars = (taskList, userMap) => {
			taskList.forEach((t) => {
				const holder = document.getElementById(`related-task-avatars-${safeId(t.name)}`);
				if (!holder) return;

				const assigned = (t.custom_users || []).map((u) => userMap[u.user]).filter(Boolean);
				holder.innerHTML = buildAvatarGroup(assigned);
			});
		};

		const fetchUserMap = async (users) => {
			if (!users.length) return {};
			const res = await frappe.call({
				method: "renewal_module.custom_module.page.tasks.tasks.get_users_basic_info",
				args: { users },
				silent: true,
			});

			const map = {};
			(res.message || []).forEach((u) => {
				map[u.name] = {
					full_name: u.full_name || u.name,
					image: u.user_image ? frappe.utils.get_file_link(u.user_image) : null,
				};
			});
			return map;
		};
		frappe.call({
			method: "renewal_module.custom_module.page.tasks.tasks.get_related_tasks",
			args: { task_name: taskName },
			callback: async (r) => {
				const tasks = r.message || [];
				if (!tasks.length) {
					loadMoreBtn.hide();
					container.html('<div class="empty-state-list text-center py-4"><i class="fa fa-tasks text-muted mb-2" style="font-size: 24px;"></i><p class="text-muted mb-0" style="font-size: 13px;">No related tasks found.</p></div>');
					return;
				}

				const getFilteredTasks = (filter) => {
					switch (filter) {
						case "completed":
							return tasks.filter(isCompleted);
						case "pending":
							return tasks.filter((t) => !isCompleted(t));
						default:
							return tasks;
					}
				};

				const updateTabCounts = () => {
					const totalCount = tasks.length;
					const completedCount = tasks.filter(isCompleted).length;
					const pendingCount = totalCount - completedCount;
					$(wrapper).find("#task-related-tasks-card-tabs .task-tab").each(function () {
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
					$(wrapper).find("#task-related-tasks-card-tabs .task-tab").each(function () {
						const $btn = $(this);
						const isActive = $btn.data("taskFilter") === filter;
						$btn.toggleClass("active", isActive);
						$btn.css("border", isActive ? "1px solid #007bff" : "");
						$btn.css("color", isActive ? "#007bff" : "");
						$btn.toggleClass("btn-outline-secondary", !isActive);
					});
				};

				const allUsers = [
					...new Set(tasks.flatMap((t) => (t.custom_users || []).map((u) => u.user)).filter(Boolean))
				];
				const userMapPromise = fetchUserMap(allUsers).catch(() => ({}));

				const renderTasks = async (filter, userMap) => {
					const filteredTasks = getFilteredTasks(filter);
					if (!filteredTasks.length) {
						loadMoreBtn.hide();
						container.html('<div class="empty-state-list text-center py-4"><i class="fa fa-tasks text-muted mb-2" style="font-size: 24px;"></i><p class="text-muted mb-0" style="font-size: 13px;">No related tasks found.</p></div>');
						return;
					}

					const listToRender = expandedTasks
						? filteredTasks
						: filteredTasks.slice(0, MAX_VISIBLE_TASKS);

					container.html(listToRender.map((t) => `
					<div class="task-card p-2 mb-2 rounded shadow-sm" style="background:#f8f9fa; border:1px solid #eee;">
						<div class="d-flex justify-content-between align-items-center gap-1 mb-1">
							<div style="width:70%;">
								<div class="fw-bold text-primary text-truncate mb-1" title="${esc(t.subject || "")}">
									${esc(t.subject || "")}
								</div>
							</div>
							<div style="width:30%; display:flex; justify-content:end;">
								<div class="related-task-avatar-holder" id="related-task-avatars-${safeId(t.name)}"></div>
							</div>
						</div>

						<div class="d-flex justify-content-between align-items-center gap-1 mb-1">
							<span class="related-task-open text-truncate" data-name="${esc(t.name || "")}" style="cursor:pointer;" title="${esc(t.name || "")}">
								${esc(t.name || "")}
							</span>
							<span class="status-badge ${statusBadgeClass(t.status)} text-truncate rounded" title="${esc(t.status || "")}">${esc(t.status || "")}</span>
							<span class="priority-badge bg-info text-white text-truncate rounded" title="${esc(t.priority || "")}">${esc(t.priority || "")}</span>
						</div>

						<div class="mb-1">
							${t.exp_end_date ? `<span class="text-danger" title="${esc(formatDateTimeDisplay(t.exp_end_date))}">${esc(formatDateTimeDisplay(t.exp_end_date))}</span>` : ""}
						</div>
					</div>
				`).join(""));

					fillTaskAvatars(listToRender, userMap);

					loadMoreBtn.toggle(!expandedTasks && filteredTasks.length > MAX_VISIBLE_TASKS);
				};

				updateTabCounts();
				updateTabStyles(activeTaskFilter);
				await userMapPromise.then((userMap) => renderTasks(activeTaskFilter, userMap));

				$(wrapper).off("click", "#task-related-tasks-card-tabs .task-tab").on("click", "#task-related-tasks-card-tabs .task-tab", (e) => {
					activeTaskFilter = $(e.currentTarget).data("taskFilter") || "all";
					this._task_panel_task_filter = activeTaskFilter;
					expandedTasks = false;
					updateTabStyles(activeTaskFilter);
					userMapPromise.then((userMap) => renderTasks(activeTaskFilter, userMap));
				});

				$(wrapper).off("click", "#related-tasks-card-load-more").on("click", "#related-tasks-card-load-more", () => {
					const advancedFilters = [
						["Task", "parent_task", "=", taskName]
					];

					if (activeTaskFilter === "completed") {
						advancedFilters.push(["Task", "status", "=", "Completed"]);
					} else if (activeTaskFilter === "pending") {
						advancedFilters.push(["Task", "status", "!=", "Completed"]);
					}

					const params = new URLSearchParams();
					params.set("filters", encodeURIComponent(JSON.stringify(advancedFilters)));
					const url = `/app/tasks?${params.toString()}`;
					window.open(url, "_blank");
				});

				$(wrapper).off("click", ".related-task-open").on("click", ".related-task-open", function () {
					const name = $(this).data("name");
					if (name) {
						const url = "/app/tasks/" + name;
						window.open(url, "_blank");
					}
				});
			},
			error: () => {
				loadMoreBtn.hide();
				container.html('<div class="alert alert-danger">Failed to load related tasks.</div>');
			}
		});
	}

	update_status(taskName, status) {
		frappe.call({
			method: "frappe.client.set_value",
			args: {
				doctype: "Task",
				name: taskName,
				fieldname: "status",
				value: status
			},
			callback: (r) => {
				frappe.show_alert({ message: __("Status updated to {0}", [status]), indicator: "green" });
				this.show_details(taskName);
			}
		});
	}

	render_details_view(task, canEdit = true) {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const normalizeTagValue = (value) => String(value || "").trim().toLowerCase();
		const statusColors = {
			open: { text: "#E8F5E9", bg: "#1B5E20", border: "#A5D6A7" },
			working: { text: "#E3F2FD", text: "#0D47A1", border: "#90CAF9" },
			completed: { text: "#E8F5E9", text: "#1B5E20", border: "#A5D6A7" },
			cancelled: { text: "#FFEBEE", text: "#B71C1C", border: "#EF9A9A" },
			closed: { text: "#ECEFF1", text: "#263238", border: "#B0BEC5" },
			default: { text: "#F5F5F5", text: "#424242", border: "#E0E0E0" }
		};
		const priorityColors = {
			high: { text: "#FFF3E0", bg: "#E65100", border: "#FFCC80" },
			medium: { text: "#FFFDE7", bg: "#827717", border: "#FFF59D" },
			low: { text: "#E8F5E9", bg: "#1B5E20", border: "#A5D6A7" },
			default: { text: "#F5F5F5", bg: "#424242", border: "#E0E0E0" }
		};
		const applyPillColors = (el, colorSet) => {
			if (!el || !colorSet) return;
			el.style.backgroundColor = colorSet.bg;
			el.style.color = colorSet.text;
			el.style.border = `1px solid ${colorSet.border}`;
			el.style.fontWeight = "600";
		};

		// Update header elements
		const nameEl = document.getElementById("task-detail-name");
		const subjectEl = document.getElementById("task-detail-subject");
		const statusBadge = document.getElementById("task-detail-status");
		const priorityBadge = document.getElementById("task-detail-priority")

		if (nameEl) nameEl.textContent = task.name;
		if (subjectEl) subjectEl.textContent = task.subject || "";
		if (statusBadge) {
			const statusText = task.status || "Open";
			statusBadge.textContent = statusText;
			const statusKey = normalizeTagValue(statusText);
			applyPillColors(statusBadge, statusColors[statusKey] || statusColors.default);
		}

		if (priorityBadge) {
			const priorityText = task.priority || "Medium";
			priorityBadge.textContent = priorityText;
			const priorityKey = normalizeTagValue(priorityText);
			applyPillColors(priorityBadge, priorityColors[priorityKey] || priorityColors.default);
		}

		const detailsContainer = wrapper.querySelector(".task-details-view-content");
		if (!detailsContainer) return;
		const assignees = Array.isArray(task.assignees_display) && task.assignees_display.length
			? task.assignees_display
			: (Array.isArray(task.custom_users)
				? task.custom_users.map((row) => row.user || row.name || row.email || "").filter(Boolean)
				: []);

		function esc(s) {
			if (s == null) return "";
			return String(s)
				.replace(/&/g, "&amp;")
				.replace(/</g, "&lt;")
				.replace(/>/g, "&gt;")
				.replace(/\"/g, "&quot;")
				.replace(/'/g, "&#039;");
		}
		function fmtDt(d) {
			if (!d) return "";
			const raw = String(d).trim();
			const hasTime = /\d{1,2}:\d{2}/.test(raw);
			const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
			const parsed = new Date(normalized);
			if (isNaN(parsed.getTime())) return raw;
			const datePart = parsed.toLocaleDateString("en-GB", {
				day: "2-digit",
				month: "short",
				year: "numeric",
			});
			if (!hasTime) return datePart;
			const timePart = parsed.toLocaleTimeString("en-GB", {
				hour: "2-digit",
				minute: "2-digit",
				hour12: false,
			});
			return `${datePart} ${timePart}`;
		}
		// helper: returns true when a field value is considered "set"
		function hasVal(v) {
			if (v === null || v === undefined || v === "" || v === 0 || v === false) return false;
			if (typeof v === "string" && v.trim() === "") return false;
			return true;
		}
		// left-panel info row — only icon + value, hidden when empty
		function infoRow(icon, value, extraClass = "") {
			if (!hasVal(value)) return "";
			return `<div class="task-info-row ${extraClass}">
				<span class="task-info-icon"><i class="fa ${icon}"></i></span>
				<span class="task-info-value" title="${esc(value)}">${esc(value)}</span>
			</div>`;
		}
		// right-panel detail cell — hidden when empty (with optional edit button)
		function detailCell(colClass, label, value, editField = "", extraValueClass = "") {
			if (!hasVal(value)) return "";
			const editBtn = editField
				? `<button type="button" class="btn btn-xs btn-link py-0 px-0 shadow-none edit-inline-task-btn${canEdit ? '' : ' d-none'}" data-task-edit="${editField}" title="Edit ${label}"><i class="fa fa-pencil text-muted" style="font-size:10px;"></i></button>`
				: "";
			const displayVal = editField
				? `<div class="task-detail-cell-value d-flex align-items-center gap-1"><span>${esc(value)}</span>${editBtn}</div>`
				: `<div class="task-detail-cell-value ${extraValueClass}">${esc(value)}</div>`;
			return `<div class="${colClass}"><div class="task-detail-cell"><span class="task-detail-cell-label">${label}</span>${displayVal}</div></div>`;
		}
		// same but for date values
		function detailCellDate(colClass, label, value, editField = "", extraValueClass = "") {
			const fmt = fmtDt(value);
			if (!fmt) return "";
			const editBtn = editField
				? `<button type="button" class="btn btn-xs btn-link py-0 px-0 shadow-none edit-inline-task-btn${canEdit ? '' : ' d-none'}" data-task-edit="${editField}" title="Edit ${label}"><i class="fa fa-pencil text-muted" style="font-size:10px;"></i></button>`
				: "";
			const displayVal = editField
				? `<div class="task-detail-cell-value d-flex align-items-center gap-1"><span>${fmt}</span>${editBtn}</div>`
				: `<div class="task-detail-cell-value ${extraValueClass}">${fmt}</div>`;
			return `<div class="${colClass}"><div class="task-detail-cell"><span class="task-detail-cell-label">${label}</span>${displayVal}</div></div>`;
		}



		// Pre-build conditional right-panel sections
		const timelineCells = [
			detailCellDate("col-6 col-md-3", "Expected Start", task.exp_start_date),
			detailCellDate("col-6 col-md-3", "Expected End", task.exp_end_date),
			detailCellDate("col-6 col-md-3", "Actual Start", task.act_start_date),
			detailCellDate("col-6 col-md-3", "Actual End", task.act_end_date),
			hasVal(task.expected_time) ? `<div class="col-6 col-md-3"><div class="task-detail-cell"><span class="task-detail-cell-label">Expected Time (hrs)</span><div class="task-detail-cell-value">${esc(String(task.expected_time))}</div></div></div>` : "",
			hasVal(task.actual_time) ? `<div class="col-6 col-md-3"><div class="task-detail-cell"><span class="task-detail-cell-label">Actual Time (hrs)</span><div class="task-detail-cell-value text-muted">${esc(String(task.actual_time))}</div></div></div>` : "",
			detailCellDate("col-6 col-md-3", "Review Date", task.review_date, "review_date"),
			detailCellDate("col-6 col-md-3", "Closing Date", task.closing_date, "closing_date"),
		].join("");

		const completionCells = [
			detailCell("col-6 col-md-4", "Completed By", task.completed_by, "completed_by"),
			detailCellDate("col-6 col-md-4", "Completed On", task.completed_on, "completed_on"),
			`<div class="col-6 col-md-4"><div class="task-detail-cell"><span class="task-detail-cell-label">Last Modified</span><div class="task-detail-cell-value text-muted">${this.formatRelDate(task.modified)}</div></div></div>`,
		].join("");

		const timelineSection = timelineCells ? `<div class="task-section-label"><i class="fa fa-calendar-o me-1"></i> Schedule Timeline</div><div class="row g-3 mb-4">${timelineCells}</div>` : "";
		const completionSection = completionCells ? `<div class="task-section-label"><i class="fa fa-check-circle me-1"></i> Completion</div><div class="row g-3 mb-4">${completionCells}</div>` : "";

		detailsContainer.innerHTML = `
			<div class="row g-3 tasks-details-view">

				<!-- ========== LEFT PANEL ========== -->
				<div class="col-lg-8 col-md-12">
					<div class="corporate-card p-3 mb-3 task-section-card">
						<div class="task-section-head mb-3 pb-2 border-bottom">
							<h6 class="mb-0 task-section-title-compact"><i class="fa fa-tasks me-1"></i> Task Overview</h6>
						</div>
						<div class="task-info-grid-2">
							<div class="task-info-item">
								<h6 class="text-uppercase text-muted1">Subject</h6>
								<span title="${esc(task.subject || '')}">${esc(task.subject || '—')}</span>
							</div>
							<div class="task-info-item">
								<h6 class="text-uppercase text-muted1">Owner</h6>
								<span title="${esc(task.owner_full_name || task.owner || '')}">${esc(task.owner_full_name || task.owner || '—')}</span>
							</div>
							<div class="task-info-item">
								<h6 class="text-uppercase text-muted1">Status</h6>
								<span title="${esc(task.status || '')}">${esc(task.status || '—')}</span>
							</div>
							<div class="task-info-item">
								<h6 class="text-uppercase text-muted1">Priority</h6>
								<span title="${esc(task.priority || '')}">${esc(task.priority || '—')}</span>
							</div>
							<div class="task-info-item">
								<h6 class="text-uppercase text-muted1">Project</h6>
								<span title="${esc(task.project || '')}">${esc(task.project || '—')}</span>
							</div>
							<div class="task-info-item">
								<h6 class="text-uppercase text-muted1">Type</h6>
								<span title="${esc(task.type || '')}">${esc(task.type || '—')}</span>
							</div>
							<div class="task-info-item">
								<h6 class="text-uppercase text-muted1">Parent Task</h6>
								<span title="${esc(task.parent_task || '')}">${esc(task.parent_task || '—')}</span>
							</div>
							<div class="task-info-item">
								<h6 class="text-uppercase text-muted1">Reference To</h6>
								<span title="${esc(task.reference_to || '')}">${esc(task.reference_to || '—')}</span>
							</div>
						</div>
					</div>

					<div class="corporate-card p-3 mb-3 task-section-card">
						<div class="d-flex align-items-center justify-content-between mb-3 pb-2 border-bottom">
							<h6 class="mb-0 task-section-title-compact"><i class="fa fa-calendar-check-o me-1"></i> Schedule and Ownership</h6>
						</div>
						<div class="task-info-grid-3">
							<div class="task-info-item">
								<h6 class="text-uppercase text-muted1">Expected Start</h6>
								<span title="${esc(task.exp_start_date || '')}">${task.exp_start_date ? esc(fmtDt(task.exp_start_date)) : '—'}</span>
							</div>
							<div class="task-info-item">
								<h6 class="text-uppercase text-muted1">Expected End</h6>
								<span title="${esc(task.exp_end_date || '')}">${task.exp_end_date ? esc(fmtDt(task.exp_end_date)) : '—'}</span>
							</div>
							<div class="task-info-item">
								<h6 class="text-uppercase text-muted1">Actual Start</h6>
								<span title="${esc(task.act_start_date || '')}">${task.act_start_date ? esc(fmtDt(task.act_start_date)) : '—'}</span>
							</div>
							<div class="task-info-item">
								<h6 class="text-uppercase text-muted1">Actual End</h6>
								<span title="${esc(task.act_end_date || '')}">${task.act_end_date ? esc(fmtDt(task.act_end_date)) : '—'}</span>
							</div>
							<div class="task-info-item">
								<h6 class="text-uppercase text-muted1">Department</h6>
								<span title="${esc(task.department || '')}">${esc(task.department || '—')}</span>
							</div>
							<div class="task-info-item">
								<h6 class="text-uppercase text-muted1">Company</h6>
								<span title="${esc(task.company || '')}">${esc(task.company || '—')}</span>
							</div>
						</div>
					</div>

					<div class="corporate-card p-3 mb-3 task-section-card">
						<div class="d-flex align-items-center justify-content-between mb-2">
							<h6 class="mb-0 task-section-title-compact"><i class="fa fa-users me-1"></i> Assignment</h6>
							<button type="button" class="btn btn-xs btn-light text-primary py-0 shadow-none edit-inline-task-btn" data-task-edit="custom_users" title="Edit Assign To">
								<i class="fa fa-pencil"></i>
							</button>
						</div>
						<div class="fw-semibold fs-sm flex-grow-1 mb-2">
							${assignees.length ? assignees.map(a => `<span class="task-assignee-chip">${esc(a)}</span>`).join('') : '<span class="text-muted">No assignees</span>'}
						</div>
						<div class="d-flex flex-wrap gap-2 mt-1">
							${task.is_milestone ? `<span class="task-flag-badge task-flag-yes"><i class="fa fa-check-circle"></i> Milestone</span>` : ""}
							${task.is_group ? `<span class="task-flag-badge task-flag-yes"><i class="fa fa-check-circle"></i> Group</span>` : ""}
						</div>
					</div>


				</div>

				<!-- ========== RIGHT PANEL ========== -->
				<div class="col-md-12 col-lg-4 col-xl-4 mb-2">
					<aside class="tasks-detail-panel flex-grow-1">
						<div class="panel__tabs">
							<button class="ptab is-active" data-type="Notes" title="Notes"><span class="ptab__icon">📝</span><span class="ptab__label">Notes</span></button>
							<button class="ptab" data-type="Calls" title="Calls"><span class="ptab__icon">📞</span><span class="ptab__label">Calls</span></button>
							<button class="ptab" data-type="Appointments" title="Appointments"><span class="ptab__icon">📅</span><span class="ptab__label">Appointments</span></button>
							<button class="ptab" data-type="Tasks" title="Tasks"><span class="ptab__icon">✅</span><span class="ptab__label">Tasks</span></button>
						</div>
						<div class="panel__header">
							<div class="panel__subtitle" id="tasks-panel-subtitle">Notes</div>
							<button class="btn-panel-create" id="tasks-btn-panel-add"><i class="fa fa-plus"></i> Add</button>
						</div>
						<div class="panel__cards" id="tasks-panel-cards-section">
							<!-- Notes section (default visible) -->
							<div id="tasks-activity-notes-section" class="tasks-panel-section">
								<textarea id="quick-note-text" class="panel__input form-control mb-2" rows="2" placeholder="Write a quick note..."></textarea>
								<div class="d-flex justify-content-end mb-2">
									<button id="save-quick-note-btn" class="btn btn-sm btn-primary">Save Note</button>
								</div>
								<div id="main-notes-list">
									<div class="text-center p-3 text-muted small">Loading notes...</div>
								</div>
							</div>
							<div id="tasks-activity-calls-section" class="tasks-panel-section d-none">
								<div class="mb-2" role="group" id="task-calls-card-tabs" aria-label="Call filters">
									<button type="button" class="btn btn-sm call-tab active" data-call-filter="all">All</button>
									<button type="button" class="btn btn-sm call-tab" data-call-filter="held">Held</button>
									<button type="button" class="btn btn-sm call-tab" data-call-filter="scheduled">Scheduled</button>
									<button type="button" class="btn btn-sm call-tab" data-call-filter="cancelled">Cancelled</button>
								</div>
								<div id="activity-calls-container"></div>
								<div id="calls-card-load-more" class="text-center mt-2" style="cursor:pointer; display:none;">Load More</div>
							</div>
							<div id="tasks-activity-appointments-section" class="tasks-panel-section d-none">
								<div class="mb-2" role="group" id="task-appointments-card-tabs" aria-label="Appointment filters">
									<button type="button" class="btn btn-sm appointment-tab active" data-appointment-filter="all">All</button>
									<button type="button" class="btn btn-sm appointment-tab" data-appointment-filter="open">Open</button>
									<button type="button" class="btn btn-sm appointment-tab" data-appointment-filter="unverified">Unverified</button>
									<button type="button" class="btn btn-sm appointment-tab" data-appointment-filter="closed">Closed</button>
								</div>
								<div id="activity-appointments-container"></div>
								<div id="appointments-card-load-more" class="text-center mt-2" style="cursor:pointer; display:none;">Load More</div>
							</div>
							<div id="tasks-activity-tasks-section" class="tasks-panel-section d-none">
								<div class="mb-2" role="group" id="task-related-tasks-card-tabs" aria-label="Task filters">
									<button type="button" class="btn btn-sm task-tab active" data-task-filter="all">All</button>
									<button type="button" class="btn btn-sm task-tab" data-task-filter="pending">Pending</button>
									<button type="button" class="btn btn-sm task-tab" data-task-filter="completed">Completed</button>
								</div>
								<div id="activity-related-tasks-container"></div>
								<div id="related-tasks-card-load-more" class="text-center mt-2" style="cursor:pointer; display:none;">Load More</div>
							</div>
						</div>
						<div id="tasks-panel-form-section" class="panel__form d-none">
							<div class="panel__form-head d-flex justify-content-between align-items-center mb-2">
								<div class="panel__form-title" id="tasks-panel-form-title">New Activity</div>
								<button type="button" class="btn btn-sm btn-light" id="tasks-btn-panel-close"><i class="fa fa-times"></i></button>
							</div>
							<div id="tasks-panel-form-body"></div>
							<div class="d-flex justify-content-end gap-2 mt-2">
								<button type="button" class="btn btn-sm btn-primary" id="tasks-panel-save-btn">Save</button>
							</div>
						</div>
					</aside>
				</div>
			</div>

			<div class="row mt-2">
				<div class="col-12">
					<div class="corporate-card p-3 mb-2">
						<div class="d-flex align-items-center justify-content-between mb-3 pb-2 border-bottom">
							<h6 class="mb-0 fw-bold text-uppercase text-muted d-flex align-items-center gap-2" style="font-size:11px;letter-spacing:0.7px;">
								<i class="fa fa-file-text-o"></i> Description
							</h6>
							<button type="button"
								class="btn btn-xs btn-light text-primary contact-info-action-btn shadow-sm rounded-pill px-3 d-flex align-items-center gap-1 edit-inline-btn"
								data-task-edit="description">
								<i class="fa fa-pencil me-1"></i> Edit
							</button>
						</div>	
						${task.description ? `
							<div class="task-description-rendered">${(task.description).replace(/\n/g, '<br>')}</div>`
				: `<div class="text-muted fst-italic text-center py-3" style="font-size:13px;">
							<i class="fa fa-file-text-o me-1"></i> No description provided</div>`
			}
					</div>
				</div>
				</div>
			</div>
			
			<div class="row">
			 	<div class="col-12">		
				<div class="comment-section mb-3 mt-3">
					<div class="corporate-card comment-box p-3" style="border: none !important;">
						<div class="comment-input-wrapper">
							<div class="comment-input-header mb-3 pb-2">
								<span class="fw-bold text-dark"><i class="fa fa-comments-o me-2"></i>Comments</span>
							</div>
							<div class="comment-input-container w-100">
								<div class="comment-user-identity">
									<span class="avatar avatar-medium shadow-sm d-flex align-items-center justify-content-center bg-primary text-white rounded-circle fw-bold" style="width: 40px; height: 40px;" title="">
										<div class="avatar-frame standard-image" style="background-color: var(--dark-green-avatar-bg); color: var(--dark-green-avatar-color)" title="">
											
										</div>
									</span>
									
								</div>
								<div class="frappe-control col" data-fieldtype="Comment" data-fieldname="comment">
									<div class="ql-container ql-bubble rounded-3 border border-light" style="position: relative; background: #fdfdfd;">
										<div id="task-new-comment-input" class="ql-editor ql-blank p-3" data-gramm="false" contenteditable="true" data-placeholder="Type a reply / comment..."><p><br></p></div>
									</div>
								</div>
							</div>
						</div>
						<div class="comment-actions d-flex justify-content-end mt-3 gap-2">
							<button id="task-add-comment-btn" class="btn btn-primary btn-default2 btn-comment btn-xs rounded-pill px-4 shadow-sm"><i class="fa fa-paper-plane me-1"></i> Comment</button>
							<button class="btn btn-sm btn-outline-primary btn-default2 btn-comment rounded-pill px-4" id="task-email-send"><i class="fa fa-envelope-o me-1"></i> New Email</button>
						</div>
					</div>
				</div>

				<div class="corporate-card p-4">
					<h6 class="text-uppercase text-muted pb-2 activity fw-bold"><i class="fa fa-history mr-2"></i>Activity</h6>
					<div class="timeline" id="task-activity-timeline">
						<p class="text-muted text-center py-4 bg-light rounded">Loading activity...</p>
					</div>
				</div>
				</div>
			</div>
		`;

		const detailsView = wrapper.querySelector(".task-details-view");
		const editBtn = detailsView ? detailsView.querySelector("#edit-task-details-btn") : null;
		if (editBtn) {
			$(editBtn).off("click").on("click", (e) => {
				e.preventDefault();
				e.stopPropagation();
				this.openTaskEditDialog(task.name);
			});
		}

		const inlineEditBtns = detailsContainer.querySelectorAll(".edit-inline-task-btn, .edit-inline-btn[data-task-edit]");
		inlineEditBtns.forEach((btn) => {
			$(btn).off("click").on("click", (e) => {
				e.preventDefault();
				e.stopPropagation();
				const fieldname = $(e.currentTarget).attr("data-task-edit");
				this.openSpecificTaskEditDialog(task.name, fieldname);
			});
		});
	}

	openTaskEditDialog(taskName) {
		const doctype = "Task";
		frappe.model.with_doctype(doctype, () => {
			const fields = frappe.meta.get_docfields(doctype)
				.filter((df) => df.fieldname && df.label && !df.hidden && !df.read_only)
				.filter((df) => !["Section Break", "Column Break", "Tab Break", "HTML", "Button", "Table", "Table MultiSelect"].includes(df.fieldtype));

			const d = new frappe.ui.Dialog({
				title: __("Edit Task Details"),
				fields: [
					{
						label: __("Field"),
						fieldname: "fieldname",
						fieldtype: "Select",
						options: fields.map((df) => ({ label: `${df.label} `, value: df.fieldname })),
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
									reqd: !!df.reqd
								},
								parent: wrapper,
								render_input: true
							});
							d.__value_control.refresh();
						}
					},
					{ fieldtype: "HTML", fieldname: "value_wrapper" }
				],
				primary_action_label: __("Update"),
				primary_action: () => {
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

					frappe.call({
						method: "frappe.client.set_value",
						args: { doctype, name: taskName, fieldname, value },
						callback: () => {
							frappe.show_alert({ message: __("Task updated successfully"), indicator: "green" });
							this.show_details(taskName);
						}
					});
				}
			});

			d.show();
			setTimeout(() => {
				const closeBtn = d.get_close_btn();
				if (!closeBtn || !closeBtn.length) return;
				closeBtn.off("click.taskdialog").on("click.taskdialog", function () {
					d.hide();
				});
			}, 50);
		});
	}

	async openSpecificTaskEditDialog(taskName, fieldname) {
		if (!taskName || !fieldname) return;

		const doctype = "Task";
		const isChildTableField = fieldname === "custom_users";

		if (isChildTableField) {
			let taskDoc;
			try {
				const docRes = await frappe.call({ method: "frappe.client.get", args: { doctype, name: taskName } });
				taskDoc = docRes && docRes.message;
			} catch (err) {
				console.error("Failed to load Task for custom_users edit", err);
			}
			if (!taskDoc) return;

			let userOptions = [];
			try {
				const usersResp = await frappe.call({ method: "renewal_module.custom_module.page.tasks.tasks.get_enabled_users" });
				const users = usersResp?.message || [];
				userOptions = users.map((u) => ({
					label: u.full_name || u.name || u.email,
					value: u.email || u.name,
					description: u.name || ""
				}));
			} catch (err) {
				console.warn("Failed to load users for custom_users", err);
			}

			const currentAssignees = Array.isArray(taskDoc.custom_users)
				? taskDoc.custom_users.map((row) => row.user).filter(Boolean).join(", ")
				: "";

			const dialog = new frappe.ui.Dialog({
				title: __("Edit Assign To"),
				fields: [
					{
						label: __("Assign To"),
						fieldname: "users",
						fieldtype: "MultiSelect",
						options: userOptions,
						default: currentAssignees,
						reqd: 1
					}
				],
				primary_action_label: __("Update"),
				primary_action: async () => {
					const selected = dialog.get_value("users");
					const users = this.normalize_assignees(selected);
					if (!users.length) {
						frappe.msgprint(__("Assign To is required."));
						return;
					}

					dialog.hide();
					taskDoc.custom_users = users.map((user) => ({ doctype: "Task Users", user }));

					frappe.call({
						method: "frappe.client.save",
						args: { doc: taskDoc },
						callback: () => {
							frappe.show_alert({ message: __("Task assignees updated"), indicator: "green" });
							this.show_details(taskName);
						}
					});
				}
			});

			dialog.show();
			setTimeout(() => {
				const closeBtn = dialog.get_close_btn();
				if (!closeBtn || !closeBtn.length) return;
				closeBtn.off("click.taskassigneedialog").on("click.taskassigneedialog", function () {
					dialog.hide();
				});
			}, 50);
			return;
		}

		frappe.model.with_doctype(doctype, () => {
			const df = frappe.meta.get_docfield(doctype, fieldname);
			if (!df) {
				frappe.msgprint(__("Field not found: {0}", [fieldname]));
				return;
			}

			const dialog = new frappe.ui.Dialog({
				title: __("Edit {0}", [df.label || fieldname]),
				fields: [
					{
						label: df.label || fieldname,
						fieldname: "value",
						fieldtype: df.fieldtype || "Data",
						options: df.options || "",
						reqd: !!df.reqd
					}
				],
				primary_action_label: __("Update"),
				primary_action: () => {
					const value = dialog.get_value("value");
					if ((value === undefined || value === null || value === "") && df.reqd) {
						frappe.msgprint(__("Value is required."));
						return;
					}
					dialog.hide();
					frappe.call({
						method: "frappe.client.set_value",
						args: { doctype, name: taskName, fieldname, value: value || "" },
						callback: () => {
							frappe.show_alert({ message: __("Successfully updated {0}", [df.label || fieldname]), indicator: "green" });
							this.show_details(taskName);
						}
					});
				}
			});

			frappe.call({
				method: "frappe.client.get_value",
				args: { doctype, filters: { name: taskName }, fieldname: [fieldname] },
				callback: (r) => {
					if (r && r.message) {
						dialog.set_value("value", r.message[fieldname]);
					}
				}
			});

			dialog.show();
			setTimeout(() => {
				const closeBtn = dialog.get_close_btn();
				if (!closeBtn || !closeBtn.length) return;
				closeBtn.off("click.taskspecificdialog").on("click.taskspecificdialog", function () {
					dialog.hide();
				});
			}, 50);
		});
	}

	getTimelineIcon(type) {
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
			"updated": "fa-pen"
		};
		return map[key] || "fa-circle";
	}

	linkifyEmails(html, plainText) {
		if (!html) return html;
		const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
		if (!emailRegex.test(plainText || "")) return html;
		const wrapper = document.createElement("div");
		wrapper.innerHTML = html;
		const walker = document.createTreeWalker(wrapper, NodeFilter.SHOW_TEXT, null);
		const textNodes = [];
		let node;
		while ((node = walker.nextNode())) {
			if (!node.nodeValue || !node.nodeValue.trim()) continue;
			if (node.parentNode && node.parentNode.nodeName.toLowerCase() === "a") continue;
			textNodes.push(node);
		}

		textNodes.forEach((tn) => {
			const txt = tn.nodeValue;
			let lastIndex = 0;
			const frag = document.createDocumentFragment();
			txt.replace(emailRegex, (match, offset) => {
				if (offset > lastIndex) {
					frag.appendChild(document.createTextNode(txt.slice(lastIndex, offset)));
				}
				const a = document.createElement("a");
				a.href = `mailto:${match} `;
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

	isFullHtml(content) {
		return /<html|<table|<body|<meta|<style|<head/i.test(content || "");
	}

	buildStyledContent(rawHtml) {
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
			table { border-collapse: collapse; width: 100%; }
			td, th { border: 1px solid #e5e7eb; padding: 8px; }
		</style>`;
		return injectedCSS + (rawHtml || "");
	}

	loadTaskActivityTimeline(taskName) {
		const me = this;
		frappe.call({
			method: "renewal_module.custom_module.page.tasks.tasks.get_task_activity",
			args: { task_name: taskName },
			callback: function (res) {
				const container = $("#task-activity-timeline");
				if (!container.length) return;

				const activities = res.message || [];
				let html = "";

				if (activities.length) {
					activities.forEach((act) => {
						let descriptionContent = act.is_html
							? (act.description || "")
							: frappe.utils.escape_html(act.description || "");

						let descriptionHtml = "";

						if (me.isFullHtml(descriptionContent)) {
							// full HTML/email — inject a style into the srcdoc so iframe has our CSS
							const iframeId = "task-email-frame-" + (Math.random().toString(36).substr(2, 9));
							const styled = me.buildStyledContent(descriptionContent);
							descriptionHtml = `
								<div class="scrollable-description text-muted iframe-wrapper">
									<iframe id="${iframeId}" class="email-iframe" sandbox="allow-popups allow-scripts"></iframe>
								</div>
								<script>
								(function(){
									const ifr = document.getElementById("${iframeId}");
									if (!ifr) return;
									ifr.srcdoc = ${JSON.stringify(styled)};
									ifr.onload = function () {
										try {
											const doc = ifr.contentDocument || ifr.contentWindow.document;
											const height = Math.min(doc.body.scrollHeight + 10, 400);
											ifr.style.height = height + "px";
										} catch (e) {
											// cross-origin or other issues — leave default height
										}
									};
								})();
								<\/script>
							`;
						} else {
							// plain/html fragment — inject the same style at the start of the fragment
							const styledFragment = me.buildStyledContent(descriptionContent);
							descriptionHtml = `
								<div class="scrollable-description text-muted">
									${styledFragment}
								</div>
							`;
						}

						// ensure any plaintext email addresses are converted into links
						try {
							const plainText = $("<div>").html(descriptionHtml).text();
							descriptionHtml = me.linkifyEmails(descriptionHtml, plainText);
						} catch (e) {
							// ignore if jQuery isn't available or other errors
						}

						html += `
							<div class="timeline-item d-block d-md-flex align-items-stretch w-100">
								<div class="timeline-time pe-3 text-muted mb-1 mb-md-0">${act.timestamp || ""}</div>
								<div class="timeline-dot bg-${act.color || "secondary"} mx-md-2 my-1 my-md-0 d-none d-md-flex align-items-center justify-content-center">
									<i class="fa ${me.getTimelineIcon(act.type)} text-white"></i>
								</div>
								<div class="timeline-content frappe-card ps-md-3 pb-4 mb-1 ml-1">
									<span class="mb-1 fs-sm text-muted">${act.title || ""}</span>
									${descriptionHtml}
									<span class="text-primary fs-sm d-block mt-2">By ${act.by || ""}</span>
								</div>
							</div>`;
					});
				} else {
					html = `<p class="text-muted text-center">No activity found for this task.</p>`;
				}

				container.html(html);
			}
		});
	}

	bindTaskCommentEvents(taskName) {
		const me = this;
		const $commentBtn = $("#task-add-comment-btn");

		if ($commentBtn.length === 0) return;

		$commentBtn.off("click").on("click", function () {
			const $editor = $("#task-new-comment-input");
			const html = ($editor.html() || "").trim();
			const plain = $("<div>").html(html).text().trim();

			if (!plain) {
				frappe.msgprint("Please enter a comment.");
				return;
			}

			const finalHtml = me.linkifyEmails(html, plain);

			frappe.call({
				method: "renewal_module.custom_module.page.tasks.tasks.add_task_comment",
				args: {
					task_name: taskName,
					content: finalHtml
				},
				callback: function (r) {
					if (!r.exc) {
						frappe.show_alert({ message: "Comment added", indicator: "green" });
						$("#task-new-comment-input").html("<p><br></p>");
						me.loadTaskActivityTimeline(taskName);
						hideMentionDropdown();
					}
				}
			});
		});

		(function setCommentAvatar() {
			const fullName = (frappe.session && (frappe.session.user_fullname || frappe.session.user)) || "User";
			const initials = fullName.trim().split(/\s+/).map((s) => s[0] || "").join("").toUpperCase().slice(0, 2) || "U";
			const $frame = $(".comment-section .avatar-frame");
			const $name = $("#task-comment-user-name");
			if ($frame.length) {
				$frame.attr("title", fullName).text(initials);
				$frame.closest(".avatar").attr("title", fullName);
			}
			if ($name.length) {
				$name.text(fullName);
				$name.attr("title", fullName);
			}
		})();

		(function bindPlaceholderToggle() {
			const $editor = $("#task-new-comment-input");
			const toggle = () => {
				const text = ($editor.text() || "").trim();
				if (text) {
					$editor.removeClass("ql-blank");
				} else {
					$editor.addClass("ql-blank");
				}
			};
			["input", "keyup", "paste", "blur", "change"].forEach((evt) => {
				$editor.off(`${evt}.placeholder`).on(`${evt}.placeholder`, toggle);
			});
			toggle();
		})();

		// ============================================
		// MENTIONS AUTOCOMPLETE SYSTEM
		// ============================================

		let _mention_users = [];
		frappe.call({
			method: "renewal_module.custom_module.page.tasks.tasks.get_enabled_users",
			callback: (r) => {
				_mention_users = (r.message || [])
					.map((u) => ({
						email: u.email || u.name,
						name: u.full_name || u.name
					}))
					.filter((u) => !!u.email);
			}
		});

		const $mentionDropdown = $(
			'<div id="task-mention-dropdown" class="mention-dropdown d-none card shadow-sm" style="position:absolute;z-index:10000;min-width:220px;max-height:220px;overflow:auto;padding:4px;"></div>'
		);
		$(document.body).append($mentionDropdown);

		function hideMentionDropdown() {
			$mentionDropdown.addClass("d-none").empty();
		}

		function positionDropdown(rect) {
			if (!rect) return hideMentionDropdown();
			const scrollTop = $(window).scrollTop() || 0;
			$mentionDropdown.css({
				top: (rect.bottom + scrollTop) + "px",
				left: rect.left + "px"
			}).removeClass("d-none");
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
			let currentNode;
			let count = 0;
			let range = null;
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
						const rangeEndNode = (function () {
							const it2 = document.createNodeIterator(root, NodeFilter.SHOW_TEXT, null);
							let cur2;
							let c2 = 0;
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
			const lastAt = text.lastIndexOf("@", caret - 1);
			if (lastAt === -1) return null;
			if (lastAt > 0 && /\S@\S/.test(text.substring(lastAt - 1, lastAt + 2))) return null;
			const query = text.substring(lastAt + 1, caret);
			if (/\s/.test(query)) return null;
			return { start: lastAt, end: caret, query };
		}

		let mentionSelectionIndex = -1;
		const $editor = $("#task-new-comment-input");

		$editor.on("keyup paste input", function () {
			const mention = getMentionQuery($editor);
			if (!mention) return hideMentionDropdown();
			const q = (mention.query || "").toLowerCase();
			const matches = _mention_users.filter((u) =>
				(u.email && u.email.toLowerCase().includes(q)) || (u.name && u.name.toLowerCase().includes(q))
			);
			if (!matches.length) return hideMentionDropdown();

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
				console.warn("task mention rect failed", err);
			}
			positionDropdown(rect);

			$mentionDropdown.empty();
			matches.slice(0, 10).forEach((m, idx) => {
				const $item = $(`<div class="mention-item p-1" data-idx="${idx}" data-email="${frappe.utils.escape_html(m.email)}" style="cursor:pointer;border-radius:4px;padding:6px;font-size:13px;">${frappe.utils.escape_html(m.name)}</div>`);
				$item.on("mousedown touchstart", function (ev) {
					ev.preventDefault();
					$(this).attr("data-start", mention.start).attr("data-end", mention.end);
					const start = parseInt($(this).attr("data-start"), 10);
					const end = parseInt($(this).attr("data-end"), 10);
					insertMentionAtRange(start, end, m);
					hideMentionDropdown();
				});
				$mentionDropdown.append($item);
			});
			mentionSelectionIndex = -1;
		});

		$editor.on("keydown", function (e) {
			if ($mentionDropdown.hasClass("d-none")) return;
			const items = $mentionDropdown.children();
			if (!items.length) return;
			if (e.key === "ArrowDown") {
				e.preventDefault();
				mentionSelectionIndex = Math.min(mentionSelectionIndex + 1, items.length - 1);
				items.removeClass("active");
				$(items.get(mentionSelectionIndex)).addClass("active");
				return;
			}
			if (e.key === "ArrowUp") {
				e.preventDefault();
				mentionSelectionIndex = Math.max(mentionSelectionIndex - 1, 0);
				items.removeClass("active");
				$(items.get(mentionSelectionIndex)).addClass("active");
				return;
			}
			if (e.key === "Enter") {
				if (mentionSelectionIndex >= 0 && mentionSelectionIndex < items.length) {
					e.preventDefault();
					$(items.get(mentionSelectionIndex)).trigger("mousedown");
				}
			}
			if (e.key === "Escape") {
				hideMentionDropdown();
			}
		});

		$(document).off("mousedown.taskmention").on("mousedown.taskmention", function (e) {
			if (!$(e.target).closest("#task-mention-dropdown, #task-new-comment-input").length) hideMentionDropdown();
		});

		function insertMentionAtRange(start, end, user) {
			const editor = $editor[0];
			const range = createRangeFromCharacterOffsets(editor, start, end);
			if (!range) return;
			const mentionEmail = user.email || user.name || "";
			const mentionName = user.name || mentionEmail;
			const a = document.createElement("a");
			a.href = mentionEmail ? `mailto:${mentionEmail} ` : "#";
			a.textContent = `@${mentionName} `;
			a.setAttribute("data-id", mentionEmail);
			a.setAttribute("class", "mention");
			a.setAttribute("data-mention-email", mentionEmail);
			range.deleteContents();
			range.insertNode(a);
			range.setStartAfter(a);
			range.setEndAfter(a);
			range.collapse(false);

			try {
				const sel = window.getSelection();
				sel.removeAllRanges();
				sel.addRange(range);
			} catch (err) {
				console.warn("task mention range select failed", err);
			}

			$editor.trigger("input");
		}
	}

	bindTaskEmailHandler(taskName) {
		const me = this;
		const $emailBtn = $("#task-email-send");

		if ($emailBtn.length === 0) return;

		$emailBtn.off("click").on("click", async function (e) {
			e.preventDefault();

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

			const readMultiSelect = (dialog, fieldname) => {
				const value = dialog.get_value(fieldname);
				if (Array.isArray(value)) {
					return value
						.map((item) => (item && typeof item === "object")
							? (item.value || item.email || item.name || item.label || "")
							: item)
						.filter(Boolean);
				}
				if (typeof value === "string") {
					return value.split(",").map((item) => item.trim()).filter(Boolean);
				}
				return [];
			};

			const task = await frappe.db.get_doc("Task", taskName);

			let enabledUsers = [];
			try {
				const usersRes = await frappe.call({
					method: "renewal_module.custom_module.page.tasks.tasks.get_enabled_users",
					silent: true
				});
				enabledUsers = Array.isArray(usersRes?.message) ? usersRes.message : [];
			} catch (err) {
				console.warn("Failed to load enabled users for email options", err);
			}

			const enabledUserEmailMap = new Map();
			enabledUsers.forEach((u) => {
				const keyName = (u?.name || "").trim().toLowerCase();
				const email = (u?.email || u?.name || "").trim();
				if (!email) return;
				enabledUserEmailMap.set(email.toLowerCase(), email);
				if (keyName) enabledUserEmailMap.set(keyName, email);
			});

			let taskEmails = [];
			if (task.owner) taskEmails.push(task.owner);
			if (task.assigned_to) taskEmails.push(task.assigned_to);
			if (task.completed_by) taskEmails.push(task.completed_by);

			try {
				const assignedUsers = JSON.parse(task._assign || "[]");
				if (Array.isArray(assignedUsers)) taskEmails = [...taskEmails, ...assignedUsers];
			} catch (e2) {
				// Ignore malformed assignment payload.
			}

			taskEmails = taskEmails.map((value) => {
				const key = String(value || "").trim().toLowerCase();
				return enabledUserEmailMap.get(key) || value;
			});
			taskEmails = normalizeEmails(taskEmails);

			const systemUserEmails = normalizeEmails(
				enabledUsers.map((u) => (u?.email || u?.name || "").trim()).filter(Boolean)
			);
			const recipientOptions = normalizeEmails([...taskEmails, ...systemUserEmails]);

			const emailDialog = new frappe.ui.Dialog({
				title: __("Send Email"),
				fields: [
					{
						label: __("TO"),
						fieldname: "recipients",
						fieldtype: "MultiSelect",
						reqd: 1,
						options: recipientOptions,
						default: taskEmails,
						description: __("Select one or more recipients")
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
						options: recipientOptions
					},
					{
						label: __("BCC"),
						fieldname: "bcc",
						fieldtype: "MultiSelect",
						options: recipientOptions,
						hidden: 1
					},
					{
						label: __("Subject"),
						fieldname: "subject",
						fieldtype: "Data",
						reqd: 1,
						default: `Task: ${task.name} `
					},
					{
						label: __("Message"),
						fieldname: "content",
						fieldtype: "TextEditor",
						reqd: 1
					},
					{
						fieldtype: "Section Break",
						label: __("Attachments")
					},
					{
						fieldtype: "HTML",
						fieldname: "attachments_list",
						options: `< div id = "task-email-attachments-list" class="text-muted small" > ${__("No attachments")}</div > `
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
					const recipientsList = readMultiSelect(emailDialog, "recipients");
					const ccList = readMultiSelect(emailDialog, "cc");
					const bccList = readMultiSelect(emailDialog, "bcc");

					if (!recipientsList.length || !values.subject || !values.content) {
						frappe.msgprint(__("Please fill in all required fields."));
						return;
					}

					let attachments = Array.isArray(emailDialog.__attachments) ? emailDialog.__attachments : [];

					frappe.call({
						method: "renewal_module.custom_module.page.tasks.tasks.send_task_email",
						args: {
							task_name: taskName,
							recipients: recipientsList.join(", "),
							cc: ccList.join(", "),
							bcc: bccList.join(", "),
							subject: values.subject,
							content: values.content,
							attachments: attachments,
							send_me_a_copy: values.send_me_a_copy || 0
						},
						freeze_message: __("Sending email..."),
						callback: function (r) {
							if (!r.exc) {
								frappe.show_alert({ message: __("Email sent successfully"), indicator: "green" });
								emailDialog.hide();
								me.loadTaskActivityTimeline(taskName);
							} else {
								frappe.msgprint(__("Failed to send email."));
							}
						}
					});
				}
			});

			emailDialog.__attachments = [];
			const getAttachmentsList = () => emailDialog.get_field("attachments_list")?.$wrapper.find("#task-email-attachments-list");

			function renderAttachmentList() {
				const $list = getAttachmentsList();
				if (!$list || !$list.length) return;
				const items = emailDialog.__attachments || [];
				if (!items.length) {
					$list.html(__("No attachments"));
					return;
				}
				const html = items.map((att, idx) => {
					const name = att.file_name || att.file_url || att.name || `File ${idx + 1} `;
					return `< div class="d-flex align-items-center gap-1 mb-1" >
						<i class="fa fa-paperclip text-muted"></i>
						<span class="text-truncate" title="${frappe.utils.escape_html(name)}">${frappe.utils.escape_html(name)}</span>
						<a href="#" data-idx="${idx}" class="text-danger remove-att" title="${__("Remove")}" >& times;</a >
					</div > `;
				}).join("");
				$list.html(html);
			}

			const addBtn = emailDialog.get_field("add_attachments_btn");
			if (addBtn) {
				addBtn.$input.off("click.addatt").on("click.addatt", () => {
					new frappe.ui.FileUploader({
						allow_multiple: true,
						on_success(file) {
							emailDialog.__attachments.push({
								file_url: file.file_url,
								file_name: file.file_name || file.name || null
							});
							renderAttachmentList();
						}
					});
				});
			}

			emailDialog.get_field("attachments_list").$wrapper.off("click.removeatt").on("click.removeatt", "a.remove-att", function (ev) {
				ev.preventDefault();
				const idx = Number($(this).data("idx"));
				if (Number.isInteger(idx) && emailDialog.__attachments[idx]) {
					emailDialog.__attachments.splice(idx, 1);
					renderAttachmentList();
				}
			});

			renderAttachmentList();
			emailDialog.show();

			emailDialog.$wrapper.find(".add-cc").on("click", function (ev) {
				ev.preventDefault();
				const ccField = emailDialog.get_field("cc");
				ccField.df.hidden = 0;
				ccField.refresh();
				$(this).hide();
			});

			emailDialog.$wrapper.find(".add-bcc").on("click", function (ev) {
				ev.preventDefault();
				const bccField = emailDialog.get_field("bcc");
				bccField.df.hidden = 0;
				bccField.refresh();
				$(this).hide();
			});

			setTimeout(() => {
				const closeBtn = emailDialog.get_close_btn();
				if (!closeBtn || !closeBtn.length) {
					return;
				}
				closeBtn.off("click.task_email_dialog").on("click.task_email_dialog", function () {
					emailDialog.hide();
				});
			}, 50);

			$(document).off("click.taskmsgprintclose").on("click.taskmsgprintclose", ".msgprint-dialog .btn-modal-close, .msgprint-dialog .modal-header .close", function (ev) {
				ev.preventDefault();
				ev.stopPropagation();

				if (frappe.msg_dialog && frappe.msg_dialog.hide) {
					frappe.msg_dialog.hide();
					return;
				}

				const $dialog = $(this).closest(".msgprint-dialog");
				$dialog.remove();
				$(".modal-backdrop").remove();
			});
		});
	}

	formatRelDate(dateString) {
		if (!dateString) return "";
		const modifiedDate = new Date(dateString);
		const now = new Date();
		const diffMs = now - modifiedDate;
		const seconds = Math.floor(diffMs / 1000);
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);
		const days = Math.floor(hours / 24);
		if (days > 0) return `${days}d ago`;
		if (hours > 0) return `${hours}h ago`;
		if (minutes > 0) return `${minutes}m ago`;
		return "Just now";
	}

	normalize_assignees(value) {
		const result = [];

		if (Array.isArray(value)) {
			value.forEach((item) => {
				if (!item) return;
				if (typeof item === "string") {
					result.push(item.trim());
					return;
				}
				if (typeof item === "object") {
					const picked = item.user || item.value || item.name || item.email || "";
					if (picked) result.push(String(picked).trim());
				}
			});
		}

		if (!Array.isArray(value) && typeof value === "string") {
			value.split(",").forEach((item) => {
				const v = item.trim();
				if (v) result.push(v);
			});
		}

		const unique = Array.from(new Set(result.filter(Boolean)));
		if (!unique.length && frappe.session && frappe.session.user) {
			unique.push(frappe.session.user);
		}
		return unique;
	}

	// ===================== NEW FORM VIEW =====================
	show_new() {
		$(".task-list-view").addClass("d-none");
		$(".task-details-view").addClass("d-none");
		$(".new-tasks").removeClass("d-none");
		this.setPageTitle("New Task");
		this.setActiveSidebar();
		this.render_new_task_form();
		this.bind_new_task_form_events();
	}

	render_new_task_form() {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const formContainer = wrapper.querySelector(".new-tasks-content");
		if (!formContainer) return;

		formContainer.innerHTML = `
	< div class="card shadow-sm border-0 rounded-4" >
		<div class="card-body p-4">
			<div id="new-task-form-status" class="mb-2"></div>
			<div class="row g-4">
				<div class="col-md-12"><div id="task-subject-field"></div></div>
				<div class="col-md-6"><div id="task-status-field"></div></div>
				<div class="col-md-6"><div id="task-priority-field"></div></div>
				<div class="col-md-6"><div id="task-exp-start-field"></div></div>
				<div class="col-md-6"><div id="task-exp-end-field"></div></div>
				<div class="col-md-6"><div id="task-assignees-field"></div></div>
				<div class="col-md-12"><div id="task-description-field"></div></div>
			</div>
			<div class="text-end mt-4">
				<button type="button" class="btn btn-primary rounded-pill px-5" id="task-create-btn">save Task</button>
			</div>
		</div>
			</div >
	`;
	}

	async bind_new_task_form_events() {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const formContainer = wrapper.querySelector(".new-tasks-content");
		if (!formContainer) return;

		const subjectControl = frappe.ui.form.make_control({
			parent: formContainer.querySelector("#task-subject-field"),
			df: { fieldtype: "Data", label: "Subject", reqd: 1 },
			render_input: true
		});

		const statusControl = frappe.ui.form.make_control({
			parent: formContainer.querySelector("#task-status-field"),
			df: {
				fieldtype: "Select",
				label: "Status",
				options: ["Open", "Working", "Pending Review", "Overdue", "Completed", "Cancelled"].join("\n")
			},
			render_input: true
		});

		const priorityControl = frappe.ui.form.make_control({
			parent: formContainer.querySelector("#task-priority-field"),
			df: {
				fieldtype: "Select",
				label: "Priority",
				options: ["Low", "Medium", "High", "Urgent"].join("\n")
			},
			render_input: true
		});

		const startDateControl = frappe.ui.form.make_control({
			parent: formContainer.querySelector("#task-exp-start-field"),
			df: { fieldtype: "Date", label: "Expected Start Date" },
			render_input: true
		});

		const endDateControl = frappe.ui.form.make_control({
			parent: formContainer.querySelector("#task-exp-end-field"),
			df: { fieldtype: "Date", label: "Expected End Date", reqd: 1 },
			render_input: true
		});
		await frappe.model.with_doctype("Task Users");
		const assigneesControl = frappe.ui.form.make_control({
			parent: formContainer.querySelector("#task-assignees-field"),
			df: { fieldtype: "Table MultiSelect", label: "Assign To", name: "custom_users", options: "Task Users" },
			render_input: true
		});

		const descriptionControl = frappe.ui.form.make_control({
			parent: formContainer.querySelector("#task-description-field"),
			df: { fieldtype: "Text Editor", label: "Description" },
			render_input: true
		});

		statusControl.set_value("Open");
		priorityControl.set_value("Medium");
		if (frappe.session && frappe.session.user) {
			try {
				assigneesControl.set_value([frappe.session.user]);
			} catch (e) {
				// Ignore control-level defaulting issues and rely on submit fallback.
			}
		}

		const createBtn = formContainer.querySelector("#task-create-btn");
		const cancelBtn = formContainer.querySelector("#task-cancel-btn");

		if (cancelBtn) {
			cancelBtn.addEventListener("click", () => {
				frappe.set_route("tasks");
			});
		}

		if (createBtn) {
			createBtn.addEventListener("click", async () => {
				const subject = (subjectControl.get_value() || "").trim();
				const status = statusControl.get_value() || "Open";
				const priority = priorityControl.get_value() || "Medium";
				const exp_start_date = startDateControl.get_value() || null;
				const exp_end_date = endDateControl.get_value() || null;
				const description = descriptionControl.get_value() || "";
				const raw_custom_users = assigneesControl.get_value();
				const custom_users = normalize_assignees(raw_custom_users);

				if (!subject) {
					frappe.msgprint(__("Subject is required."));
					return;
				}

				if (exp_start_date && exp_end_date && exp_end_date < exp_start_date) {
					frappe.msgprint(__("Expected End Date cannot be before Expected Start Date."));
					return;
				}

				if (!exp_end_date) {
					frappe.msgprint(__("Expected End Date is required."));
					return;
				}

				if (!custom_users.length) {
					frappe.msgprint(__("Assign To is required."));
					return;
				}

				try {
					const r = await frappe.call({
						method: "frappe.client.insert",
						args: {
							doc: {
								doctype: "Task",
								subject,
								status,
								priority,
								exp_start_date,
								exp_end_date,
								custom_users: custom_users.map((user) => ({ doctype: "Task Users", user })),
								description
							}
						},
						freeze: true,
						freeze_message: __("Creating Task...")
					});

					if (r && r.message && r.message.name) {
						frappe.show_alert({ message: __("Task Created"), indicator: "green" });
						frappe.set_route("tasks", r.message.name);
					}
				} catch (err) {
					console.error("New Task creation failed:", err);
					frappe.msgprint(__("Unable to create task. Please try again."));
				}
			});
		}

		function normalize_assignees(value) {
			const result = [];

			if (Array.isArray(value)) {
				value.forEach((item) => {
					if (!item) return;
					if (typeof item === "string") {
						result.push(item.trim());
						return;
					}
					if (typeof item === "object") {
						const picked = item.user || item.value || item.name || item.email || "";
						if (picked) result.push(String(picked).trim());
					}
				});
			}

			if (!Array.isArray(value) && typeof value === "string") {
				value.split(",").forEach((item) => {
					const v = item.trim();
					if (v) result.push(v);
				});
			}

			const unique = Array.from(new Set(result.filter(Boolean)));
			if (!unique.length && frappe.session && frappe.session.user) {
				unique.push(frappe.session.user);
			}
			return unique;
		}
	}
}

frappe.tasks_page_template = {
	body: `
		<div class="wrapper tasks-wrapper">
			<div class="task-list-view">
				<div class="row mb-3">
					<div class="col-12">
						<div class="page-title-head d-flex align-items-center justify-content-between p-2">
							<div>
								<h3 class="page-title">Tasks</h3>
							</div>
							<nav>
								<ol class="breadcrumb">
									<li class="breadcrumb-item"><a href="javascript:voild(0);">Activity</a></li>
									<li class="breadcrumb-item active">Tasks</li>
								</ol>
							</nav>
						</div>
					</div>
				</div>

				<div class="controls-wrapper mb-2">
					<div class="controls">
						<div class="left-controls">
							<select class="control-select" data-task-filter="status">
								<option value="">All Status</option>
								<option value="Open">Open</option>
								<option value="Working">Working</option>
								<option value="Pending Review">Pending Review</option>
								<option value="Overdue">Overdue</option>
								<option value="Completed">Completed</option>
								<option value="Cancelled">Cancelled</option>
							</select>
							<input type="text" data-task-filter="ID" placeholder="Search ID..." class="form-control">
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
							<button class="btn btn-primary1 rounded-pill px-4" id="new-task-btn"><i class="fa fa-plus me-1"></i> New Task</button>
							<div class="dropdown d-none" id="task-actions-dropdown">
								<button class="btn btn-outline-secondary rounded-pill px-4 dropdown-toggle" data-bs-toggle="dropdown">Actions</button>
								<ul class="dropdown-menu shadow">
									<li><a class="dropdown-item" href="#" data-task-action="set_completed">Mark as Completed</a></li>
									<li><a class="dropdown-item text-danger" href="#" data-task-action="delete">Delete Selected</a></li>
								</ul>
							</div>
						</div>
					</div>
				</div>

				<div class="table-container shadow-sm">
					<table class="tasks-table">
						<thead>
							<tr>
								<th><input class="form-check-input" type="checkbox" id="selectAllTasks"></th>
								<th>ID</th>
								<th>Subject</th>
								<th>Status</th>
								<th>Priority</th>
								<th>Start Date</th>
								<th>End Date</th>
								<th class="text-center" id="task-count-header" title="0 of 0">
									<span id="task-visible-count">0</span> of <span id="task-total-count">0</span>
								</th>
							</tr>
						</thead>
						<tbody></tbody>
					</table>
				</div>

				<div class="d-flex justify-content-between align-items-center mt-2">
					<div class="list-paging-area d-flex justify-content-between align-items-center w-100">
						<div class="p-2">
							<div class="btn-group">
								<button type="button" class="btn btn-default1 btn-light btn-sm task-btn-paging" data-value="20">20</button>
								<button type="button" class="btn btn-default1 btn-light btn-sm task-btn-paging" data-value="100">100</button>
								<button type="button" class="btn btn-default1 btn-light btn-sm task-btn-paging" data-value="500">500</button>
								<button type="button" class="btn btn-default1 btn-light btn-sm task-btn-paging" data-value="1500">1500</button>
							</div>
						</div>
						<div class="p-2">
							<button class="btn btn-default1 btn-light task-btn-more btn-sm">Load More</button>
						</div>
					</div>
				</div>
			</div>

			<div class="task-details-view d-none">
				<div class="row">
					<div class="col-12">
						<div class="d-flex align-items-center justify-content-between">
							<div class="d-flex align-items-center">
								<h3 class="page-title">Task Details</h3>
							</div>
							<nav>
								<ol class="breadcrumb">
									<li class="breadcrumb-item"><a href="/app/tasks">Tasks</a></li>
									<li class="breadcrumb-item active">Details</li>
								</ol>
							</nav>
						</div>
					</div>
				</div>
				<div class="row mb-2">
					<div class="col-12">
						<div class="task-meta">
							<div class="task-title">
								<span id="task-detail-name" class="task-id"></span>
								<span class="separator">-</span>
								<span id="task-detail-status" class="badge badge-sm rounded-pill"></span>
							</div>

							<div class="d-flex align-items-center justify-content-between gap-2 mt-2">
								<div id="task-detail-priority" class="btn btn-default2"></div>
								<div id="edit-task-details-btn" class="btn btn-default2 btn-light contact-info-action-btn d-flex align-items-center">
									<i class="fa fa-pencil me-1"></i>Edit
								</div>
								<div class="dropdown" id="task-details-actions-dropdown">
									<button class="btn btn-default2 btn-navblue btn-sm dropdown-toggle"
											type="button" data-bs-toggle="dropdown">
										Actions
									</button>
									
									<ul class="dropdown-menu dropdown-menu-end">
										<li><a class="dropdown-item" href="#" data-task-action="set_open">Set as Open</a></li>
										<li><a class="dropdown-item" href="#" data-task-action="set_working">Set as Working</a></li>
										<li><a class="dropdown-item" href="#" data-task-action="set_completed">Set as Completed</a></li>
										<li><a class="dropdown-item" href="#" data-task-action="set_cancelled">Set as Cancelled</a></li>
										<li><hr class="dropdown-divider"></li>
										<li><a class="dropdown-item text-danger" href="#" data-task-action="delete">Delete</a></li>
									</ul>
								</div>
							</div>
						</div>
					</div>
				</div>
				<div class="task-details-view-content"></div>
			</div>

			<div class="new-tasks d-none">
				<div class="row mb-4">
					<div class="col-12">
						<div class="d-flex align-items-center justify-content-between">
							<div class="d-flex align-items-center">
								<button class="btn btn-light rounded-circle p-2 me-3" onclick="frappe.set_route('tasks')">
									<i class="fa fa-arrow-left"></i>
								</button>
								<h3 class="page-title">New Task</h3>
							</div>
							<nav>
								<ol class="breadcrumb">
									<li class="breadcrumb-item"><a href="/app/tasks">Tasks</a></li>
									<li class="breadcrumb-item active">New</li>
								</ol>
							</nav>
						</div>
					</div>
				</div>
				<div class="new-tasks-content"></div>
			</div>

			<footer class="footer mt-5 py-3 text-center">
				<span class="text-muted small">© 2026 64 Network Security Pvt Ltd. All rights reserved.</span>
			</footer>
		</div >
	`
};