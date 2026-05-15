
frappe.pages['home-crm'].on_page_load = function (wrapper) {
	localStorage.removeItem('tickets_page_length');
	new homecrm_page(wrapper);
};

frappe.pages['home-crm'].on_page_show = function (wrapper) {
	//console.log("🔄 home crm page showing", wrapper);
	console.log("🔄 home crm page showing");
	const pageWrapper = wrapper || $(".page")[0] || document.body;
	const ensureSupportLayoutLoaded = (cb) => {
		if (typeof loadSupportLayout === "function") return cb();
		frappe.require(["/assets/renewal_module/js/issue_themes/support_layout2.js"], () => {
			setTimeout(cb, 10);
		});
		frappe.require([
			"/assets/renewal_module/css/issue_themes/support_theme2.css"
		]);
	};
	ensureSupportLayoutLoaded(() => {
		loadSupportLayout(pageWrapper, () => {
			if (!frappe.homecrm_page || frappe.homecrm_page.wrapper !== pageWrapper) {
				frappe.homecrm_page = new homecrm_page(pageWrapper);
			}
			frappe.homecrm_page.render();
		});
	});
};

// Keep the right panel content reachable on small screens by mirroring it into a modal
function showRightPanelModal(title, cardHtml, titleButtonHTML = "") {
	const modal = $("#mobile-sla-modal");
	if (!modal.length) return;

	const isDesktop = window.matchMedia("(min-width: 992px)").matches;
	if (isDesktop) {
		if (window.bootstrap?.Modal) {
			bootstrap.Modal.getInstance(modal[0])?.hide();
		} else if (modal.modal) {
			modal.modal("hide");
		}
		return;
	}

	// modal.find(".modal-title").html(title || "");
	modal.find(".modal-actions").html("");
	modal.find(".modal-body").html(cardHtml || "");

	if (window.bootstrap?.Modal) {
		bootstrap.Modal.getOrCreateInstance(modal[0]).show();
	} else if (modal.modal) {
		modal.modal("show");
	}
}




class homecrm_page {
	constructor(wrapper) {
		this.wrapper = wrapper;
		this.territoryChart = null;
		this.chartFilters = {
			company: frappe.defaults.get_user_default("Company") || "",
			from_date: frappe.datetime.add_months(frappe.datetime.get_today(), -6),
			to_date: frappe.datetime.get_today()
		};

		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: '',
			single_column: true
		});
	}

	render() {

		const waitForContent = () => {
			const $content = $("#support-page-content");
			if (!$content.length) {
				// wait until layout injects DOM
				setTimeout(waitForContent, 50);
				return;
			}
			$content.empty().append(frappe.homecrm_page_template.body);
			this.handleRoute();
		};

		waitForContent();
	}


	handleRoute() {
		const route = frappe.get_route();
		console.log("handleRoute:", route);
		// home-crm
		if (route.length === 1) {
			return this.show_list();
		}
	}

	setPageTitle(title) {
		document.title = title; // Browser tab title
		this.page.set_title(title); // ERPNext body title
	}
	bindActionDropdown() {
		$(document).off("click.msgclose");

		$(document).on("click.msgclose", ".btn-modal-close", function (e) {
			e.preventDefault();
			e.stopPropagation();

			// Proper way to close msgprint
			if (frappe.msg_dialog && frappe.msg_dialog.hide) {
				frappe.msg_dialog.hide();
			}
		});
	}

	// ...sidebar active code...
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


	show_list() {
		setTimeout(async () => {
			try {
				this.setPageTitle("Home");
				this.setActiveSidebar();
				this.bindWorkspaceActions();
				this.loadTerritoryChart();
			} catch (err) {
				console.error("homecrm_page.make error:", err);
			}
		}, 200);

	}

	bindWorkspaceActions() {
		const root = $(this.wrapper);

		root.off("click.homecrm", ".js-chart-filter");
		root.on("click.homecrm", ".js-chart-filter", () => {
			this.openChartFilterDialog();
		});

		root.off("click.homecrm", ".js-chart-more");
		root.on("click.homecrm", ".js-chart-more", (e) => {
			e.preventDefault();
			e.stopPropagation();
			root.find(".js-chart-more-menu").toggleClass("d-none");
		});

		root.off("click.homecrm", ".js-chart-refresh");
		root.on("click.homecrm", ".js-chart-refresh", (e) => {
			e.preventDefault();
			root.find(".js-chart-more-menu").addClass("d-none");
			this.loadTerritoryChart();
		});

		root.off("click.homecrm", ".js-chart-edit");
		root.on("click.homecrm", ".js-chart-edit", (e) => {
			e.preventDefault();
			root.find(".js-chart-more-menu").addClass("d-none");
			this.openChartFilterDialog();
		});

		root.off("click.homecrm", ".js-open-sales-analytics");
		root.on("click.homecrm", ".js-open-sales-analytics", (e) => {
			e.preventDefault();
			root.find(".js-chart-more-menu").addClass("d-none");
			frappe.set_route("query-report", "Sales Analytics");
		});

		$(document).off("click.homecrm_chartmenu");
		$(document).on("click.homecrm_chartmenu", () => {
			root.find(".js-chart-more-menu").addClass("d-none");
		});
	}

	openChartFilterDialog() {
		const dialog = new frappe.ui.Dialog({
			title: __("Territory Wise Sales Filters"),
			fields: [
				{
					fieldname: "company",
					label: __("Company"),
					fieldtype: "Link",
					options: "Company",
					default: this.chartFilters.company
				},
				{
					fieldname: "from_date",
					label: __("From Date"),
					fieldtype: "Date",
					default: this.chartFilters.from_date,
					reqd: 1
				},
				{
					fieldname: "to_date",
					label: __("To Date"),
					fieldtype: "Date",
					default: this.chartFilters.to_date,
					reqd: 1
				}
			],
			primary_action_label: __("Apply"),
			primary_action: (values) => {
				if (values.from_date > values.to_date) {
					frappe.msgprint(__("From Date cannot be after To Date."));
					return;
				}

				this.chartFilters = {
					...this.chartFilters,
					...values
				};

				dialog.hide();
				this.loadTerritoryChart();
			}
		});

		dialog.show();
	}

	formatCompactIndianNumber(value) {
		const numericValue = Number(value) || 0;

		if (!numericValue) {
			return "0";
		}

		if (frappe.utils?.format_chart_axis_number) {
			return frappe.utils.format_chart_axis_number(numericValue, "India") || "0";
		}

		const absValue = Math.abs(numericValue);
		const sign = numericValue < 0 ? "-" : "";
		const formatUnit = (divisor, suffix) => {
			const shortValue = absValue / divisor;
			const decimals = shortValue >= 100 || Number.isInteger(shortValue) ? 0 : 1;
			return `${sign}${shortValue.toFixed(decimals).replace(/\.0$/, "")}${suffix}`;
		};

		if (absValue >= 10000000) return formatUnit(10000000, "Cr");
		if (absValue >= 100000) return formatUnit(100000, "L");
		if (absValue >= 1000) return formatUnit(1000, "K");

		return `${numericValue}`;
	}

	loadTerritoryChart() {
		const $chart = $(this.wrapper).find("#crm-territory-sales-chart");
		if (!$chart.length) return;

		$chart.html(`<div class="workspace-chart-loading">${__("Loading chart...")}</div>`);

		frappe.call({
			method: "renewal_module.custom_module.page.home_crm.home_crm.get_territory_wise_sales",
			args: {
				company: this.chartFilters.company,
				from_date: this.chartFilters.from_date,
				to_date: this.chartFilters.to_date,
				limit: 12
			},
			callback: (r) => {
				const payload = r.message || {};
				const labels = payload.labels || [];
				const values = payload.values || [];

				this.setLastSynced(payload.last_synced);

				if (!labels.length) {
					this.territoryChart = null;
					$chart.html(`<div class="workspace-chart-empty">${__("No sales data found for selected filters")}</div>`);
					return;
				}

				$chart.empty();
				const chartData = {
					labels,
					datasets: [{
						name: __("Sales"),
						values
					}]
				};

				if (this.territoryChart) {
					this.territoryChart.update(chartData);
				} else {
					$chart.empty();
					this.territoryChart = new frappe.Chart("#crm-territory-sales-chart", {
						data: chartData,
						type: "bar",
						height: 260,
						colors: ["#f08ab7"],
						barOptions: {
							spaceRatio: 0.35
						},
						axisOptions: {
							xIsSeries: false,
							xAxisMode: "tick",
							yAxisMode: "span",
							shortenYAxisNumbers: 1,
							numberFormatter: (value) => this.formatCompactIndianNumber(value)
						},
						tooltipOptions: {
							formatTooltipY: (d) => frappe.format(d, { fieldtype: "Currency" })
						}
					});
				}
			},
			error: () => {
				this.territoryChart = null;
				$chart.html(`<div class="workspace-chart-empty">${__("Unable to load chart data")}</div>`);
			}
		});
	}

	setLastSynced(value) {
		const $label = $(this.wrapper).find(".js-last-synced");
		if (!$label.length) return;

		if (!value) {
			$label.text(__("Last synced just now"));
			return;
		}

		$label.text(`${__("Last synced")}: ${frappe.datetime.str_to_user(value)}`);
	}

}

frappe.homecrm_page_template = {
	body: `
	<div class="home-crm-wrapper crm-workspace-view">
		<div class="crm-workspace-container container-fluid px-3 px-md-4 py-3 py-md-4">
			<div class="row g-3 g-md-4">
				<div class="col-12">
					<div class="workspace-block workspace-chart-card">
						<div class="workspace-card-head d-flex justify-content-between align-items-start">
							<div>
								<h4 class="workspace-title">Territory Wise Sales</h4>
								<p class="workspace-subtitle js-last-synced">Last synced</p>
							</div>
							<div class="workspace-card-actions position-relative">
								<button class="workspace-icon-btn js-chart-filter" type="button" aria-label="Filter">
									<i class="fa fa-filter"></i>
								</button>
								<button class="workspace-icon-btn js-chart-more" type="button" aria-label="More">
									<i class="fa fa-ellipsis-h"></i>
								</button>
								<div class="workspace-chart-menu js-chart-more-menu d-none">
									<button type="button" class="workspace-chart-menu-item js-chart-refresh">Refresh</button>
									<button type="button" class="workspace-chart-menu-item js-chart-edit">Edit Filters</button>
									<button type="button" class="workspace-chart-menu-item js-open-sales-analytics">Open Sales Analytics</button>
								</div>
							</div>
						</div>
						<div class="chart-placeholder-wrap">
							<div id="crm-territory-sales-chart" class="workspace-chart-host"></div>
						</div>
					</div>
				</div>

				<div class="col-12">
					<div class="workspace-section-title">Your Shortcuts</div>
					<div class="row g-3">
						<div class="col-12 col-md-6 col-xl-3">
							<a class="workspace-shortcut-card" href="/app/lead">
								<span class="shortcut-title">Lead</span>
								<span class="shortcut-badge">0 Open</span>
							</a>
						</div>
						<div class="col-12 col-md-6 col-xl-3">
							<a class="workspace-shortcut-card" href="/app/opportunity">
								<span class="shortcut-title">Opportunity</span>
								<span class="shortcut-badge shortcut-badge-blue">4703 Assigned</span>
							</a>
						</div>
						<div class="col-12 col-md-6 col-xl-3">
							<a class="workspace-shortcut-card" href="/app/customers">
								<span class="shortcut-title">Customer</span>
								<span class="shortcut-badge shortcut-badge-green">71151</span>
							</a>
						</div>
						<div class="col-12 col-md-6 col-xl-3">
							<a class="workspace-shortcut-card" href="/app/customer-order-form">
								<span class="shortcut-title">Customer Order Form</span>
								<span class="shortcut-badge shortcut-badge-blue">2845 Open</span>
							</a>
						</div>

						<div class="col-12 col-md-6 col-xl-3">
							<a class="workspace-shortcut-card" href="/app/query-report/Sales%20Analytics">
								<span class="shortcut-title">Sales Analytics</span>
							</a>
						</div>
						<div class="col-12 col-md-6 col-xl-3">
							<a class="workspace-shortcut-card" href="/app/dashboard-view">
								<span class="shortcut-title">Dashboard</span>
							</a>
						</div>
						<div class="col-12 col-md-6 col-xl-3">
							<a class="workspace-shortcut-card" href="/app/query-report/Customers%20Without%20Contacts">
								<span class="shortcut-title">Customers Data</span>
							</a>
						</div>
						<div class="col-12 col-md-6 col-xl-3">
							<a class="workspace-shortcut-card" href="/app/query-report/Sales%20Report%20Based%20On%20Order%20and%20SPQ">
								<span class="shortcut-title">Sales Order And SP</span>
							</a>
						</div>

						<div class="col-12 col-md-6 col-xl-3">
							<a class="workspace-shortcut-card" href="/app/query-report/Opportunity%20Analytics">
								<span class="shortcut-title">Opportunity Analytics</span>
							</a>
						</div>
						<div class="col-12 col-md-6 col-xl-3">
							<a class="workspace-shortcut-card" href="/app/query-report/Calls%20Analytics">
								<span class="shortcut-title">Calls Analytics</span>
							</a>
						</div>
						<div class="col-12 col-md-6 col-xl-3">
							<a class="workspace-shortcut-card" href="/app/query-report/Duplicate%20Customers">
								<span class="shortcut-title">Duplicate Customers</span>
							</a>
						</div>
						<div class="col-12 col-md-6 col-xl-3">
							<a class="workspace-shortcut-card" href="/desk/query-report/Renewal%20Report?company=64+Network+Security+Pvt+Ltd+-+TG&timespan=this+month&based_on=End+Date&group_by=Renewals">
								<span class="shortcut-title">Renewals Report</span>
							</a>
						</div>
						<div class="col-12 col-md-6 col-xl-3">
							<a class="workspace-shortcut-card" href="/app/query-report/Customers%20Analysis">
								<span class="shortcut-title">Customers Analysis</span>
							</a>
						</div>
					</div>
				</div>

				<div class="col-12">
					<div class="workspace-section-title">Reports &amp; Masters</div>
				</div>
			</div>
		</div>
	</div>
	`
};