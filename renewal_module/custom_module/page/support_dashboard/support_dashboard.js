
frappe.pages['support-dashboard'].on_page_load = function (wrapper) {
	new SupportDashboard(wrapper);
};

// };
frappe.pages['support-dashboard'].on_page_show = function (wrapper) {
	//console.log("🔄 Tickets page showing", wrapper);
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
			if (!frappe.support_dashboard_page || frappe.support_dashboard_page.wrapper !== pageWrapper) {
				frappe.support_dashboard_page = new SupportDashboard(pageWrapper);
			}
			frappe.support_dashboard_page.render();
		});
	});
};

class SupportDashboard {
	constructor(wrapper) {
		this.wrapper = wrapper;
		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: 'Support Dashboard',
			single_column: true
		});
	}
	render() {
		const $content = $("#support-page-content");
		if (!$content.length) {
			console.error("❌ support-page-content not found");
			return;
		}
		$content.empty().append(frappe.support_dashboard_page_template.body);
		this.setActiveSidebar();
		this.fetch_ticket_counts();
		this.loadIssue();
		this.loadTasks();
		this.loadCalls();
		this.loadAppointments();
		this.loadOems();
		this.loadOverdueTickets();
	}

	setActiveSidebar() {
		const route = frappe.get_route();
		const baseRoute = route[0]; // "support-dashboard-te"
		
		// Reset states - use new class names
		$(".side-nav-link").removeClass("active-menu");
		$(".side-nav-item").removeClass("active-menu-item");
		$(".menu-parent").removeClass("active");

		// Use data-page for reliable matching
		$(".side-nav-link[data-page]").each((index, element) => {
			const $link = $(element);
			const linkPage = $link.data("page");
			if (!linkPage) return;

			if (linkPage === baseRoute) {
				// Highlight the current link
				$link.addClass("active-menu");
				
				// Mark the item as active
				const $item = $link.closest(".side-nav-item");
				$item.addClass("active-menu-item");
				
				// Open all parent menus
				const $parent = $link.closest(".menu-parent");
				if ($parent.length) {
					$parent.addClass("active");
					
					// Also open any ancestor menus
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



	fetch_ticket_counts() {
		frappe.call({
			method: "renewal_module.custom_module.page.support_dashboard.support_dashboard.get_ticket_counts",
			callback: (r) => {
				if (!r.message) return;

				const data = r.message;
				//console.log("fetch tickets", data);

				this.is_tech_support = data.is_tech_support;
				this.current_user = data.current_user;

				this.render_kpis(data);
			}
		});
	}

	render_kpis(data) {
		const kpiContainer = document.getElementById("kpi-container");
		kpiContainer.innerHTML = "";

		const STATUS_CONFIG = {
			"Open": { icon: "🎫", label: "My Tickets" },
			// "Created": { icon: "✏️", label: "Created" },
			"Resolved": { icon: "✅", label: "Resolved" },
			"Client Input Pending": { icon: "⏳", label: "Client Input Pending" },
			"OEM Escalated": { icon: "⏸️", label: "OEM Escalated" },
			"Closed": { icon: "🔒", label: "Closed" },
			"Overdue": { icon: "⚠️", label: "Overdue" }
		};

		Object.keys(STATUS_CONFIG).forEach(status => {
			const count = data[status];
			if (count === undefined) return; // skip missing statuses

			const { icon, label } = STATUS_CONFIG[status];

			const kpi = document.createElement("div");
			kpi.className = "kpi ticket-status-card";
			kpi.setAttribute("data-status", status);

			kpi.innerHTML = `
            <div class="kpi-icon">${icon}</div>
            <div>
                <div class="kpi-num">${count}</div>
                <div class="kpi-label">${label}</div>
            </div>
        `;

			kpiContainer.appendChild(kpi);
		});

		this.bindCardClickEvents();
	}


	bindCardClickEvents() {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		wrapper.querySelectorAll('.ticket-status-card').forEach(card => {
			card.addEventListener('click', () => {
				let status = card.getAttribute('data-status');
				let url;

				// For "Created" status with tech support, add issue owner filter for current user
				if (status === "Created" && this.is_tech_support && this.current_user) {
					// Build filter for issue owner equal to current user
					const filters = encodeURIComponent(JSON.stringify([
						["Issue", "owner", "=", this.current_user]
					]));
					url = `/app/ticket?status=${encodeURIComponent(status)}&filters=${filters}`;
				}
				// For other statuses, add working_agent filter for tech support agents
				else if (this.is_tech_support && this.current_user) {
					url = `/app/ticket?status=${encodeURIComponent(status)}&working_agent=${encodeURIComponent(this.current_user)}`;
				}
				// For administrators and non-tech support users, show all tickets with just status filter
				else {
					url = `/app/ticket?status=${encodeURIComponent(status)}`;
				}

				window.location.href = url;
			});
		});
	}

	loadIssue() {
		const me = this;
		me.start = 0;
		me.limit = 5;

		if (!$("#issue-list").length) {
			//console.warn("#issue-list not found");
			return;
		}

		const getStatusClass = (status) => {

			switch (status) {
				case "Open": return "bg-warning-subtle text-warning";
				case "Closed": return "bg-success-subtle text-success";
				case "Resolved": return "bg-info-subtle text-info";
				case "Cancelled": return "bg-danger-subtle text-danger";
				case "Overdue": return "bg-danger-subtle text-danger";
				case "Client Input Pending": return "bg-primary-subtle text-primary";
				case "OEM Escalated": return "bg-secondary-subtle text-secondary";
				case "Created": return "bg-primary-subtle text-primary";
				case "Assigned": return "bg-info-subtle text-info";
				default: return "bg-secondary-subtle text-secondary";
			}

		};

		const getPriorityClass = (priority) => {
			switch (priority) {
				case "High": return "bg-danger-subtle text-danger";
				case "Medium": return "bg-warning-subtle text-info";
				case "Low": return "bg-success-subtle text-warning";
				default: return "bg-secondary-subtle text-secondary";
			}

		}

		function buildSLAFilters() {
			const today = frappe.datetime.get_today();
			return encodeURIComponent(JSON.stringify([
				["Issue", "resolution_by", ">=", `${today} 00:00:00`],
				["Issue", "resolution_by", "<=", `${today} 23:59:59`],
				["Issue", "status", "!=", "Closed"]
			]));
		}

		function buildSLAUrl() {
			const filters = buildSLAFilters();
			let url = `/app/ticket?filters=${filters}`;
			if (!frappe.user_roles.includes("System Manager")) {
				url += `&working_agent=${encodeURIComponent(frappe.session.user)}`;
			}
			return url;
		}

		const loadIssues = (append = false) => {
			frappe.call({
				method: "renewal_module.custom_module.page.support_dashboard.support_dashboard.get_todays_sla_issues",
				args: {
					start: me.start,
					limit: me.limit
				},
				callback: function (r) {
					const data = r.message?.data || [];
					const totalCount = r.message?.total_count || 0;

					if (!append) $("#issue-list").empty();

					if (!data.length) {
						$("#issue-list").html(
							`<p class="text-center text-muted mt-3">No issues found</p>`
						);
						$("#issue-load-more").addClass("hidden");
						return;
					}

					data.forEach(issue => {
						const row = `
							<div class="new-row">
								<a href="/app/ticket/${issue.name}" class="text-decoration-none">
									${issue.subject ? `<p class="mb-0 fw-semibold ellipsis">${issue.subject}</p>` : ''}
								</a>	
								<div class="d-flex justify-content-between align-items-center mb-1">
									<a href="/app/ticket/${issue.name}" class="text-decoration-none">
										<p class="mb-0 fw-semibold">${issue.name}</p>
									</a>
									<span class="badge1 ${getStatusClass(issue.status)}">${issue.status}</span>
								</div>
								<div class="d-flex justify-content-between align-items-center mb-1 gap-1">
									${issue.customer ? `<p class="ellipsis mb-0">${issue.customer}</p>` : ''}
									${issue.priority ? `<span class="badge1 ${getPriorityClass(issue.priority)}">${issue.priority}</span>` : ''}
								</div>
								${issue.working_agent ? `<span class="text-info ellipsis">${issue.working_agent}</span>` : ''}
							</div>
						`;
						$("#issue-list").append(row);
					});

					me.start += me.limit;
					$("#today-tickets-count").text(totalCount);

					if (me.start <= totalCount) {
						$("#issue-load-more").show();
					} else {
						$("#issue-load-more").hide();
					}
				}
			});
		};

		loadIssues(false);

		$(".issue-card-header").off("click").on("click", () => {
			window.location.href = buildSLAUrl();
		});

		$("#issue-load-more").off("click").on("click", () => {
			window.location.href = buildSLAUrl();
		});
	}

	loadTasks() {
		const me = this;
		me.task_start = 0;
		me.task_limit = 5;

		if (!$("#task-list").length) {
			//console.warn("#task-list not found");
			return;
		}

		const getStatusClass = (status) => {
			switch (status) {
				case "Open": return "bg-warning-subtle text-warning";
				case "Completed": return "bg-success-subtle text-success";
				case "Cancelled": return "bg-danger-subtle text-danger";
				case "Pending Review": return "bg-info-subtle text-info";
				case "Overdue": return "bg-danger-subtle text-danger";
				case "Working": return "bg-primary-subtle text-primary";
				case "Template": return "bg-primary-subtle text-primary";
				default: return "bg-secondary-subtle text-secondary";
			}
		};

		const getPriorityClass = (priority) => {
			switch (priority) {
				case "High": return "bg-danger-subtle text-danger";
				case "Medium": return "bg-warning-subtle text-warning";
				case "Low": return "bg-success-subtle text-success";
				default: return "bg-secondary-subtle text-secondary";
			}

		};

		function buildTaskFilters() {
			let params = [];
			params.push(`status=${encodeURIComponent("Open")}`);

			if (!frappe.user_roles.includes("System Manager")) {
				params.push(`user=${encodeURIComponent(frappe.session.user)}`);
			}
			return params.join("&");
		}


		const loadTask = (append = false) => {
			frappe.call({
				method: "renewal_module.custom_module.page.support_dashboard.support_dashboard.todays_due_tasks",
				args: {
					start: me.task_start,
					limit: me.task_limit
				},
				callback: function (r) {
					const data = r.message?.data || [];
					//console.log("today task list", data);
					const totalCount = r.message?.total_count || 0;

					if (!append) $("#task-list").empty();

					if (!data.length) {
						$("#task-list").html(
							`<p class="text-center text-muted mt-3">No tasks found</p>`
						);
						$("#task-load-more").addClass("hidden");
						$("#today-task-count").text(0);
						return;
					}

					data.forEach(t => {
						const row = `
                        <div class="new-row">
							<div>
								<!-- Subject -->
								<a href="/app/task/${t.name}" class="text-decoration-none">
									${t.subject ? `<p class="mb-0 fw-semibold ellipsis" title="${t.subject}">${t.subject}</p>` : ''}
								</a>
							</div>
                            <div class="d-flex justify-content-between align-items-center gap-1 mb-1">
								<a href="/app/task/${t.name}" class="text-decoration-none">
									<p class="mb-0">${t.name}</p>
								</a>
								<span class="badge1 ${getStatusClass(t.status)}">Open</span>
							</div>
							<div class="d-flex justify-content-between align-items-center gap-1">
								${t.due_date ? `<p class="mb-0 small text-danger">${me.formatDateDMY(t.due_date)}</p>` : ''}
								<!-- Priority -->
								${t.priority ? `<span class="badge1 ${getPriorityClass(t.priority)} small">${t.priority}</span>` : ''}
							</div>
                        </div>
                    `;
						$("#task-list").append(row);
					});

					me.task_start += me.task_limit;
					$("#today-task-count").text(totalCount);

					if (me.task_start <= totalCount) {
						$("#task-load-more").show();
					} else {
						$("#task-load-more").hide();
					}
				}
			});
		};

		loadTask(false);

		$(".task-card-header").off("click").on("click", () => {
			const filters = buildTaskFilters();
			window.location.href = `/app/task?${filters}`;
			//window.location.href = `/app/task?user=ajay.p%4064network.com&status=Open`;
		});

		$("#task-load-more").off("click").on("click", () => {
			const filters = buildTaskFilters();
			window.location.href = `/app/task?${filters}`;
		});

	}

	formatDateDMY(dateStr) {
		if (!dateStr) return "";

		// Expecting yyyy-mm-dd
		const parts = dateStr.split("-");
		if (parts.length !== 3) return dateStr;

		const [yyyy, mm, dd] = parts;
		return `${dd}-${mm}-${yyyy}`;
	}

	loadCalls() {
		const me = this;

		// ✅ Initialize pagination
		me.call_start = 0;
		me.call_limit = 5;

		// ✅ Ensure container exists
		if (!$("#call-list").length) {
			//console.warn("#call-list container not found in DOM!");
			return;
		}

		// Helper for status badge1 styling
		const getStatusbadge1 = (status) => {
			switch (status) {
				case "Held": return "bg-warning-subtle text-warning";
				case "scheduled": return "bg-success-subtle text-success";
				case "Cancelled": return "bg-danger-subtle text-danger";
				default: return "bg-secondary-subtle text-secondary";
			}
		};

		function buildTaskFilters() {
			let params = [];
			// Timespan Filter (Always)
			params.push(
				`start_date=${encodeURIComponent(JSON.stringify(["Timespan", "today"]))}`
			);
			return params.join("&");
		}



		// ✅ Define the loader
		const loadCall = (append = false) => {
			//console.log("Fetching calls:", me.task_start, me.task_limit);

			frappe.call({
				method: "renewal_module.custom_module.page.support_dashboard.support_dashboard.today_calls",
				args: {
					start: me.call_start,
					limit: me.call_limit
				},
				callback: (r) => {
					//console.log("today call list", r.message);
					if (r.message && r.message.data && r.message.data.length) {
						const tasks = r.message.data;
						const totalCount = r.message.total_count || 0;

						if (!append) $("#call-list").empty();

						tasks.forEach(t => {
							const row = `
									<div class="new-row">
										<div>
											<a href="/app/call-list/${t.name}" class="text-decoration-none">
											 <p class="mb-0 ellipsis fw-semibold" title="${t.subject}">${t.subject}</p>
											</a>
										</div>
										
										<div class="d-flex justify-content-between align-items-center mb-1 gap-1">
											<a href="/app/call-list/${t.name}" class="text-decoration-none">
												<p class="mb-0 fw-semibold">${t.name}</p>
											</a>
											<span class="badge1 ${getStatusbadge1(t.status)}">${t.status}</span>
										</div>
										<div class="d-flex justify-content-between align-items-center mb-1 gap-1">
										${t.name1 ? `<p class="mb-0 text-muted ellipsis">${t.name1}</p>` : ''}
										</div>
										
										<div class="d-flex justify-content-between align-items-center mb-1 gap-1">
										${t.start_date ? `<span class="text-info">${me.formatDateDMY(t.start_date)} ${t.start_timing || ""}</span>` : ''}
										${t.end_date ? `<span class="text-success">${me.formatDateDMY(t.end_date)} ${t.end_timing || ""}</span>` : ''}
										</div>
										
									</div>
								`;
							$("#call-list").append(row);
						});

						// ✅ Update pagination state
						me.task_start += me.task_limit;

						// ✅ Update total count
						$("#today-call-count").text(totalCount);

						// ✅ Show/hide Load More button
						if (me.task_start <= totalCount) {
							$("#call-load-more").show();
						} else {
							$("#call-load-more").hide();
						}
					} else {
						if (!append) {
							$("#call-list").html('<p class="text-center text-muted mt-3">No tasks found.</p>');
						}
						$("#call-load-more").hide();
						$("#today-call-count").text(0);
					}
				}
			});
		};

		// ✅ Initial load
		loadCall(false);

		// ✅ Manual "Load More"
		/*$("#call-load-more").off("click").on("click", function () {
			loadCall(true);
		});*/

		$(document).on("click", ".call-card-header", function () {
			// window.location.href = `/app/call-list?start_date=%5B%22Timespan%22%2C%22today%22%5D`;
			const filters = buildTaskFilters();
			window.location.href = `/app/call-list?${filters}`;
		});


		$("#call-load-more").off("click").on("click", function () {
			// window.location.href = `/app/call-list?start_date=%5B%22Timespan%22%2C%22today%22%5D`;
			const filters = buildTaskFilters();
			window.location.href = `/app/call-list?${filters}`;
		});
	}

	loadAppointments() {
		const me = this;

		// ✅ Initialize pagination values
		me.start = 0;
		me.limit = 5; // set your desired limit (e.g., 10 per load)

		// ✅ Ensure container exists
		if (!$("#appointment-list").length) {
			//console.warn("#appointment-list container not found in DOM!");
			return;
		}

		function buildTaskFilters() {
			let params = [];
			// Timespan Filter (Always)
			params.push(
				`custom_start_date=${encodeURIComponent(JSON.stringify(["Timespan", "today"]))}`
			);
			// Allocated To (Only for non-System Manager)
			if (!frappe.user_roles.includes("System Manager")) {
				params.push(
					`user=${encodeURIComponent(frappe.session.user)}`
				);
			}
			return params.join("&");
		}

		// Helper for status badge1 styling
		const getStatusbadge1 = (status) => {
			switch (status) {
				case "Open": return "bg-warning-subtle text-warning";
				case "Closed": return "bg-success-subtle text-success";
				default: return "bg-secondary-subtle text-secondary";
			}
		};

		// Main loader function
		const loadAppointment = (append = false) => {
			//console.log("Fetching appointments:", me.start, me.limit);

			frappe.call({
				method: "renewal_module.custom_module.page.support_dashboard.support_dashboard.today_appointments",
				args: {
					start: me.start,
					limit: me.limit
				},
				callback: function (r) {
					//console.log("appointment data", r.message);
					if (r.message && r.message.data && r.message.data.length) {

						const appointments = r.message.data;
						const totalCount = r.message.total_count || 0;

						if (!append) $("#appointment-list").empty();

						appointments.forEach(a => {
							const row = `
									<div class="new-row">
										<div class="mb-1">
											<a href="/app/appointment/${a.name}" class="text-decoration-none">
											${a.party ? `<p class="fw-semibold ellipsis mb-0" title="${a.party}">${a.party}</p>` : ''}
											</a>
										</div>
										<div class="d-flex justify-content-between align-items-center mb-1 gap-1">
											<a href="/app/appointment/${a.name}" class="text-decoration-none">
												<p class="mb-0 fw-semibold">${a.name}</p>
											</a>
											<span class="badge1 ${getStatusbadge1(a.status)}">${a.status}</span>
										</div>
										
										<div class="d-flex justify-content-between align-items-center mb-1 gap-1">
											${a.customer_name ? `<p class="mb-0 text-muted ellipsis" title="${a.customer_name}">${a.customer_name}</p>` : ''}
											${a.customer_email ? `<p class="text-secondary ellipsis mb-0" title="${a.customer_email}">${a.customer_email}</p>` : ''}
										</div>
										<div class="d-flex justify-content-between align-items-center mb-1 gap-1">
											${a.custom_start_date ? `<span class="text-info">${me.formatDateDMY(a.custom_start_date)} ${a.custom_start_time}</span>` : ''}
										</div>
									</div>
								`;
							$("#appointment-list").append(row);
						});

						// ✅ Update pagination state
						me.start += me.limit;

						// ✅ Update total count display
						$("#today-appointment-count").text(totalCount);

						// ✅ Show/hide "Load More" button correctly
						if (me.start <= totalCount) {
							$("#appointment-load-more").show();
						} else {
							$("#appointment-load-more").hide();
						}
					} else {
						if (!append) {
							$("#appointment-list").html('<p class="text-center text-muted mt-3">No appointments found.</p>');
						}
						$("#appointment-load-more").hide();
						$("#today-appointment-count").text(0);
					}
				}
			});
		};

		// ✅ Initial load
		loadAppointment(false);

		$(document).on("click", ".appointment-card-header", function () {
			const filters = buildTaskFilters();
			window.location.href = `/app/appointment?${filters}`;
		});


		$("#appointment-load-more").off("click").on("click", function () {
			const filters = buildTaskFilters();
			window.location.href = `/app/appointment?${filters}`;
		});
	}

	loadOems() {
		const me = this;
		me.start = 0;
		me.limit = 5;

		// ✅ Ensure #oem-list exists
		if (!$("#oem-list").length) {
			//console.warn("#oem-list container not found in DOM!");
			return;
		}

		// Helper for status badge1 classes
		const getStatusbadge1 = (status) => {
			switch (status) {
				case "Open": return "bg-warning-subtle text-warning";
				case "Closed": return "bg-success-subtle text-success";
				case "Resolved": return "bg-info-subtle text-info";
				case "Cancelled": return "bg-danger-subtle text-danger";
				default: return "bg-secondary-subtle text-secondary";
			}
		};

		function buildSLAFilters() {
			const today = frappe.datetime.get_today();

			let baseFilters = [
				["Issue", "resolution_by", ">=", `${today} 00:00:00`, false],
				["Issue", "resolution_by", "<=", `${today} 23:59:59`, false],
				["Issue", "status", "!=", "Closed", false]
			];

			return encodeURIComponent(JSON.stringify(baseFilters));
		}

		function buildSLAUrl() {
			const filters = buildSLAFilters();
			let url = `/app/ticket?filters=${filters}`;

			// For non-admin users → append working_agent
			if (!frappe.user_roles.includes("System Manager")) {
				const workingAgent = encodeURIComponent(frappe.session.user);
				url = `/app/ticket?working_agent=${workingAgent}&filters=${filters}`;
			}

			return url;
		}

		// Main function to load issues
		const loadOem = (append = false) => {
			frappe.call({
				method: "renewal_module.custom_module.page.support_dashboard.support_dashboard.get_todays_oem_issues",
				args: {
					start: me.start,
					limit: me.limit
				},
				callback: function (r) {
					if (r.message && r.message.data && r.message.data.length) {
						const issues = r.message.data;
						const totalCount = r.message.total_count || 0;

						if (!append) $("#oem-list").empty();

						issues.forEach(issue => {
							const row = `
							<div class="new-row">
								<div class="d-flex justify-content-between align-items-center mb-1">
									<a href="/app/ticket/${issue.name}" class="text-decoration-none">
										<p class="mb-0 fw-semibold text-primary">${issue.name}</p>
									</a>
									<span class="badge1 ${getStatusbadge1(issue.status)}">${issue.status}</span>
								</div>
								${issue.subject ? `<p class="mb-0 text-muted ellipsis">${issue.subject}</p>` : ''}
								${issue.customer ? `<p class="text-secondary ellipsis mb-0">${issue.customer || ''}</p>` : ''}
								${issue.working_agent ? `<span class="text-info ellipsis">${issue.working_agent}</span>` : ''}
							</div>
						`;
							$("#oem-list").append(row);
						});

						// ✅ Update start pointer
						me.start += me.limit;

						// ✅ Show total (not loaded count)
						$("#today-oem-count").text(totalCount);

						// ✅ Load More visibility
						if (me.start <= totalCount) {
							$("#oem-load-more").show();
						} else {
							$("#oem-load-more").hide();
						}
					} else {
						if (!append) {
							$("#oem-list").html('<p class="text-center text-muted mt-3">No issues found.</p>');
						}
						$("#oem-load-more").hide();
					}
				}
			});
		};

		// Initial load
		loadOem(false);

		$(document).on("click", ".escalated-card-header", function () {
			window.location.href = buildSLAUrl();
		});


		$("#oem-load-more").off("click").on("click", function () {
			window.location.href = buildSLAUrl();
		});
	}

	loadOverdueTickets() {
		const me = this;
		me.start = 0;
		me.limit = 5;

		// Ensure container exists
		if (!$("#overdue-list").length) {
			//console.warn("#overdue-list container not found in DOM!");
			return;
		}

		// badge1 colors
		const getStatusbadge1 = (status) => {
			switch (status) {
				case "Open": return "bg-warning-subtle text-warning";
				case "Completed": return "bg-success-subtle text-success";
				case "Cancelled": return "bg-danger-subtle text-danger";
				case "Pending Review": return "bg-info-subtle text-info";
				case "Overdue": return "bg-danger-subtle text-danger";
				case "Working": return "bg-primary-subtle text-primary";
				case "Template": return "bg-primary-subtle text-primary";
				default: return "bg-secondary-subtle text-secondary";
			}
		};

		const getPriorityClass = (priority) => {
			switch (priority) {
				case "High": return "bg-danger-subtle text-danger";
				case "Medium": return "bg-warning-subtle text-info";
				case "Low": return "bg-success-subtle text-warning";
				default: return "bg-secondary-subtle text-secondary";
			}

		}

		// Function to dynamically build Frappe list-view filters
		function buildOverdueFilters() {
			const today = new Date();
			const formatted = today.toISOString().slice(0, 19).replace("T", " ");

			let filters = [
				["Issue", "status", "=", "Open", false],
				["Issue", "resolution_by", "<", formatted, false]
			];
			return encodeURIComponent(JSON.stringify(filters));
		}

		function buildSLAUrl() {
			const filters = buildOverdueFilters();
			let url = `/app/ticket?filters=${filters}`;

			// For non-admin users → append working_agent
			if (!frappe.user_roles.includes("System Manager")) {
				const workingAgent = encodeURIComponent(frappe.session.user);
				url = `/app/ticket?working_agent=${workingAgent}&filters=${filters}`;
			}
			return url;
		}

		// Main loader function
		const loadOverdue = (append = false) => {
			frappe.call({
				method: "renewal_module.custom_module.page.support_dashboard.support_dashboard.overdue_tickets",
				args: {
					offset: me.start,
					limit: me.limit
				},
				callback: function (r) {
					//console.log("overdue tickets data", r.message);

					if (!r.message) return;
					const issues = r.message.data || [];
					const totalCount = r.message.total_count || 0;
					if (issues.length) {
						if (!append) $("#overdue-list").empty();
						issues.forEach(issue => {
							const row = `
									<div class="new-row">
										<a href="/app/ticket/${issue.name}" class="text-decoration-none">
											${issue.subject ? `<p class="mb-0 fw-semibold text-truncate">${issue.subject}</p>` : ''}
										</a>
										<div class="d-flex justify-content-between align-items-center mb-1 gap-1">
											<a href="/app/ticket/${issue.name}" class="text-decoration-none">
												<p class="mb-0 fw-semibold">${issue.name}</p>
											</a>
											<span class="badge1 ${getStatusbadge1(issue.status)}">${issue.status}</span>
										</div>
										<div class="d-flex justify-content-between align-items-center mb-1 gap-1">
											${issue.customer ? `<p class="text-truncate mb-0">${issue.customer}</p>` : ''}
											${issue.priority ? `<span class="badge1 ${getPriorityClass(issue.priority)}">${issue.priority}</span>` : ''}
										</div>
										${issue.working_agent ? `<span class="text-info text-truncate">${issue.working_agent}</span>` : ''}
									</div>
								`;
							$("#overdue-list").append(row);
						});

						me.start += me.limit;

						// Update count
						$("#today-overdue-count").text(totalCount);

						// Show/Hide Load More
						if (me.start <= totalCount) {
							$("#overdue-load-more").show();
						} else {
							$("#overdue-load-more").hide();
						}
					} else {
						if (!append) {
							$("#overdue-list").html('<p class="text-center text-muted mt-3">No issues found.</p>');
						}
						$("#overdue-load-more").hide();
					}
				}
			});
		};

		// Initial load
		loadOverdue(false);

		// Card header click → open full list with filters
		$(document).on("click", ".overload-card-header", function () {
			window.location.href = buildSLAUrl();
		});

		// Load More button click → open full list with filters
		$("#overdue-load-more").off("click").on("click", function () {
			window.location.href = buildSLAUrl();
		});
	}


}


frappe.support_dashboard_page_template = {
	body: `
		<div class="wrapper">
			<div class="content">
				<div class="row">
					<div class="col-12">
						<div class="page-title-head d-flex align-items-center" >
							<div class="flex-grow-1">
								<h4 class="fs-xl fw-bold m-0">Dashboard</h4>
							</div>
							<div class="text-end">
								<ol class="breadcrumb m-0 py-0" style="background-color: transparent;">
									<li class="breadcrumb-item"><a href="javascript: void(0);">Support</a></li>
									<li class="breadcrumb-item active">Support Dashboard</li>
								</ol>
							</div>
						</div>
					</div>
				</div>		
				
				<div class="row">
					<div class="col-12">
						<div class="page-header">
							<div class="kpis" id="kpi-container"></div>
							
						</div>
					</div>
				</div>		

				
				<div class="row row-cols-lg-3 row-cols-md-2 row-cols-1 align-items-stretch">

					<div class="col mb-3">
						<div class="card support-card">
							<div class="card-header issue-card-header">
								<h3>Today Tickets</h3>
								<div id="today-tickets-count">0</div>
							</div>

							<div class="card-body">
								<div id="issue-list"></div>
							</div>

							<div class="card-footer">
								<button id="issue-load-more"
									class="btn btn-outline-primary btn-sm load-more-btn">
									Load More
								</button>
							</div>
						</div>
					</div>

					<div class="col mb-3">
						<div class="card support-card">
							<!-- Header -->
							<div class="card-header task-card-header">
								<h3>Today Tasks</h3>
								<div id="today-task-count" class="header-actions">0</div>
							</div>

							<!-- Body -->
							<div class="card-body">
								<div id="task-list"></div>
							</div>

							<!-- Footer -->
							<div class="card-footer">
								<button id="task-load-more"
									class="btn btn-outline-primary btn-sm load-more-btn">
									Load More
								</button>
							</div>
						</div>
					</div>

					<div class="col mb-3">
						<div class="card support-card">
							<!-- Header -->
							<div class="card-header call-card-header">
								<h3>Today Calls</h3>
								<div id="today-call-count" class="header-actions">0</div>
							</div>

							<!-- Body -->
							<div class="card-body">
								<div id="call-list"></div>
							</div>

							<!-- Footer -->
							<div class="card-footer">
								<button id="call-load-more"
									class="btn btn-outline-primary btn-sm load-more-btn">
									Load More
								</button>
							</div>
						</div>
					</div>


					<div class="col mb-3">
						<div class="card support-card">
							<!-- Header -->
							<div class="card-header appointment-card-header">
								<h3>Today Appointments</h3>
								<div id="today-appointment-count" class="header-actions">0</div>
							</div>

							<!-- Body -->
							<div class="card-body">
								<div id="appointment-list"></div>
							</div>

							<!-- Footer -->
							<div class="card-footer">
								<button id="appointment-load-more"
									class="btn btn-outline-primary btn-sm load-more-btn">
									Load More
								</button>
							</div>
						</div>
					</div>

					<div class="col mb-3">
						<div class="card support-card">
							<!-- Header -->
							<div class="card-header escalated-card-header">
								<h3>Today Escalated Tickets</h3>
								<div id="today-oem-count" class="header-actions">0</div>
							</div>

							<!-- Body -->
							<div class="card-body">
								<div id="oem-list"></div>
							</div>

							<!-- Footer -->
							<div class="card-footer">
								<button id="oem-load-more"
									class="btn btn-outline-primary btn-sm load-more-btn">
									Load More
								</button>
							</div>
						</div>
					</div>

					<div class="col mb-3">
						<div class="card support-card">
							<!-- Header -->
							<div class="card-header overload-card-header">
								<h3>Today Overdue Tickets</h3>
								<div id="today-overdue-count" class="header-actions">0</div>
							</div>

							<!-- Body -->
							<div class="card-body">
								<div id="overdue-list"></div>
							</div>

							<!-- Footer -->
							<div class="card-footer">
								<button id="overdue-load-more"
									class="btn btn-outline-primary btn-sm load-more-btn ">
									Load More
								</button>
							</div>
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