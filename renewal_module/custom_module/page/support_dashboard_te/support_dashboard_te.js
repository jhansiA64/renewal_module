/*frappe.pages['support-dashboard-te'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'None',
		single_column: true
	});
}*/



frappe.pages['support-dashboard-te'].on_page_load = function (wrapper) {
	new SupportDashboard(wrapper);
};

class SupportDashboard {
	constructor(wrapper) {
		this.wrapper = wrapper;

		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: 'Support Dashboard',
			single_column: true
		});

		this.load();
	}

	load() {
		frappe.call({
			method: "renewal_module.api.get_support_theme_page",
			callback: (r) => {
				if (r.message && r.message.rendered_html) {
					this.render(r.message.rendered_html);
				}
			}
		});
	}

	render(html) {
		// Clear page first
		this.page.main.empty();

		// Create a container
		const $container = $('<div class="support-dashboard-container"></div>');

		// 1️⃣ Append theme layout (header/sidebar shell)
		$container.append(html);

		// 2️⃣ Append dashboard content (KPI cards)
		$container.find('.content1').first().append(
			frappe.support_dashboard_page.body
		);

		// Attach to page
		this.page.main.append($container);
		//✅ IMPORTANT: initialize theme JS AFTER DOM exists
		if (window.initSupportTheme) {
			initSupportTheme();
		}
		this.fetch_ticket_counts();
	}

	fetch_ticket_counts() {
		frappe.call({
			method: "renewal_module.custom_module.page.support_dashboard.support_dashboard.get_ticket_counts",
			callback: (r) => {
				if (!r.message) return;

				const data = r.message;
				console.log("fetch tickets", data);

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
			"Open": { icon: "🎫", label: "Open Tickets" },
			"Resolved": { icon: "✅", label: "Resolved" },
			"Pending": { icon: "⏳", label: "Pending" },
			"Escalated": { icon: "⚠️", label: "Escalated" },
			"Closed": { icon: "🔒", label: "Closed" },
			"On Hold": { icon: "⏸️", label: "On Hold" }
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
				const status = card.getAttribute('data-status');
				let url = `/app/ticket?status=${encodeURIComponent(status)}`;

				if (this.is_tech_support && this.current_user) {
					url += `&working_agent=${encodeURIComponent(this.current_user)}`;
				}

				window.location.href = url;
			});
		});
	}

	loadIssue() {
		const me = this;
		me.start = 0;
		me.limit = 5;

		const $issueList = $("#issue-list");
		const $loadMore = $("#issue-load-more");
		const $count = $("#today-tickets-count");

		if (!$issueList.length) return;

		const getStatusBadge = (status) => {
			const map = {
				Open: "bg-warning-subtle1 text-warning",
				Closed: "bg-success-subtle1 text-success",
				Resolved: "bg-info-subtle1 text-info",
				Cancelled: "bg-danger-subtle1 text-danger"
			};
			return map[status] || "bg-secondary-subtle1 text-secondary";
		};


		const buildSLAFilters = () => {
			const today = frappe.datetime.get_today();

			return encodeURIComponent(JSON.stringify([
				["Issue", "resolution_by", ">=", `${today} 00:00:00`],
				["Issue", "resolution_by", "<=", `${today} 23:59:59`],
				["Issue", "status", "!=", "Closed"]
			]));
		};

		const buildSLAUrl = () => {
			const filters = buildSLAFilters();
			let url = `/app/ticket?filters=${filters}`;

			if (!frappe.user_roles.includes("System Manager")) {
				url = `/app/ticket?working_agent=${encodeURIComponent(frappe.session.user)}&filters=${filters}`;
			}
			return url;
		};


		const loadIssues = (append = false) => {
			frappe.call({
				method: "renewal_module.custom_module.page.support_dashboard.support_dashboard.get_todays_sla_issues",
				args: {
					start: me.start,
					limit: me.limit
				},
				callback: (r) => {
					const res = r.message || {};
					const issues = res.data || [];
					const total = res.total_count || 0;

					if (!append) $issueList.empty();

					if (!issues.length && !append) {
						$issueList.html(
							`<p class="text-center text-muted mt-3">No issues found.</p>`
						);
						$loadMore.hide();
						$count.text(0);
						return;
					}

					issues.forEach(issue => {
						$issueList.append(`
                        <div class="card p-1 mb-1 shadow-sm border-0 issue-row">
                            <div class="card-body p-0">
                                <div class="d-flex justify-content-between align-items-center mb-1">
                                    <a href="/app/ticket/${issue.name}" class="fw-semibold text-primary">
                                        ${issue.name}
                                    </a>
                                    <span class="badge1 ${getStatusBadge(issue.status)}">
                                        ${issue.status}
                                    </span>
                                </div>

                                ${issue.subject ? `<p class="mb-0 text-muted ellipsis">${issue.subject}</p>` : ""}
                                ${issue.customer ? `<p class="mb-0 text-secondary ellipsis">${issue.customer}</p>` : ""}
                                ${issue.working_agent ? `<span class="text-info ellipsis">${issue.working_agent}</span>` : ""}
                            </div>
                        </div>
                    `);
					});

					me.start += me.limit;
					$count.text(total);

					me.start >= total ? $loadMore.hide() : $loadMore.show();
				}
			});
		};

		// Initial load
		loadIssues(false);

		// Refresh button
		$(".btn-refresh").off("click").on("click", (e) => {
			e.stopPropagation();
			me.start = 0;
			loadIssues(false);
		});

		// Header click → list view
		$(document).off("click.issueHeader")
			.on("click.issueHeader", ".issue-card-header", () => {
				window.location.href = buildSLAUrl();
			});

		// View all
		$loadMore.off("click").on("click", () => {
			window.location.href = buildSLAUrl();
		});
	}




}


frappe.support_dashboard_page = {
	body: `
		<div class="wrapper">
			<div class="content">
				<div class="page-title-head1 d-flex align-items-center" >
					<div class="flex-grow-1">
						<h4 class="fs-xl fw-bold m-0">Dashboard</h4>
					</div>
					<div class="text-end">
						<ol class="breadcrumb m-0 py-0" style="background-color: transparent;">
							<!--<li class="breadcrumb-item"><a href="javascript: void(0);">UBold</a></li>-->
							<li class="breadcrumb-item"><a href="javascript: void(0);">Support</a></li>
							<li class="breadcrumb-item active">Support Dashboard</li>
						</ol>
					</div>
				</div>
				<div class="page-header">
					<div class="kpis" id="kpi-container"></div>
				</div>

				<div class="card-container">
        			<div class="card">
						<div class="card-header">
							<h3>Top Projects by Country</h3>
							<h6 id="today-tickets-count"></h6>
							<div class="icons">
								<button title="Collapse"><i class="fa-solid fa-chevron-up"></i></button>
								<button title="Refresh"><i class="fa-solid fa-rotate"></i></button>
								<button title="Close"><i class="fa-solid fa-xmark"></i></button>
							</div>
 
  						</div>
 
						<div class="card-body">
	
						</div>
 
						<div class="card-footer">
							<a href="#">View all</a>
						</div>
					</div>

					<div class="card" id="today-sla-card">
						<div class="card-header issue-card-header" style="cursor:pointer;">
							<h3>Today's SLA Issues</h3>
							<h6 id="today-tickets-count">0</h6>

							<div class="icons">
								<button class="btn-collapse" title="Collapse">
									<i class="fa-solid fa-chevron-up"></i>
								</button>
								<button class="btn-refresh" title="Refresh">
									<i class="fa-solid fa-rotate"></i>
								</button>
								<button class="btn-close" title="Close">
									<i class="fa-solid fa-xmark"></i>
								</button>
							</div>
						</div>

						<div class="card-body">
							<div id="issue-list"></div>
						</div>

						<div class="card-footer issue-load-more" id="issue-load-more">
							<a href="javascript:void(0)">View all</a>
						</div>
					</div>

				
        			<div class="card">
						<div class="card-header">
							<h3>Top Projects by Country</h3>
							<div class="icons">
								<button title="Collapse"><i class="fa-solid fa-chevron-up"></i></button>
								<button title="Refresh"><i class="fa-solid fa-rotate"></i></button>
								<button title="Close"><i class="fa-solid fa-xmark"></i></button>
							</div>
 
  						</div>
 
						<div class="card-body">
							<!-- Row -->
							<div class="row1">
								<div class="left">
									<img src="https://flagcdn.com/w20/in.png" />
									<div>
									<strong>India</strong>
									<span>8 Active Projects</span>
									</div>
								</div>
								<div class="center">E-Commerce Revamp</div>
								<div class="right positive">+3.2%</div>
							</div>
	
							<div class="row1">
								<div class="left">
									<img src="https://flagcdn.com/w20/de.png" />
									<div>
									<strong>Germany</strong>
									<span>5 Active Projects</span>
									</div>
								</div>
								<div class="center">POS Upgrade</div>
								<div class="right positive">+1.5%</div>
							</div>
	
							<div class="row1">
								<div class="left">
									<img src="https://flagcdn.com/w20/fr.png" />
									<div>
									<strong>France</strong>
									<span>4 Active Projects</span>
									</div>
								</div>
								<div class="center">Mobile App</div>
								<div class="right negative">-0.8%</div>
							</div>
	
							<div class="row1">
								<div class="left">
									<img src="https://flagcdn.com/w20/us.png" />
									<div>
									<strong>United States</strong>
									<span>10 Active Projects</span>
									</div>
								</div>
								<div class="center">SaaS Dashboard</div>
								<div class="right positive">+2.1%</div>
							</div>
	
							<div class="row1">
								<div class="left">
									<img src="https://flagcdn.com/w20/gb.png" />
									<div>
									<strong>United Kingdom</strong>
									<span>3 Active Projects</span>
									</div>
								</div>
								<div class="center">CRM System</div>
								<div class="right negative">-1.2%</div>
							</div>
	
							<div class="row1">
								<div class="left">
									<img src="https://flagcdn.com/w20/ca.png" />
									<div>
									<strong>Canada</strong>
									<span>4 Active Projects</span>
									</div>
								</div>
								<div class="center">Inventory Tool</div>
								<div class="right positive">+0.9%</div>
							</div>
	
							<div class="row1">
								<div class="left">
									<img src="https://flagcdn.com/w20/jp.png" />
									<div>
									<strong>Japan</strong>
									<span>6 Active Projects</span>
									</div>
								</div>
								<div class="center">Retail App</div>
								<div class="right neutral">0.0%</div>
							</div>
	
							<div class="row1">
								<div class="left">
									<img src="https://flagcdn.com/w20/au.png" />
									<div>
									<strong>Australia</strong>
									<span>2 Active Projects</span>
									</div>
								</div>
								<div class="center">HR Platform</div>
								<div class="right positive">+1.1%</div>
							</div>
	
						</div>
 
						<div class="card-footer">
							<a href="#">View all Projects 🧾</a>
						</div>
					</div>
				</div>
				
				

			</div>	
		</div>
	`
}			