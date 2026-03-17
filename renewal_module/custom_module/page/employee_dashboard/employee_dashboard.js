// frappe.pages['employee-dashboard'].on_page_load = function(wrapper) {
// 	var page = frappe.ui.make_app_page({
// 		parent: wrapper,
// 		title: 'Employee Dashboard',
// 		single_column: true
// 	});
// }


frappe.pages['employee-dashboard'].on_page_load = function (wrapper) {
	//console.log("on_page_load triggered");
	new Mypage(wrapper);
};

class Mypage {
	constructor(wrapper) {
		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: 'Employee Dashboard',
			single_column: true
		});
		this.load_css(() => {
			this.make();
		});
	}

	load_css(callback) {
		//console.log("Loading CSS before page content...");
		frappe.require([
			"/assets/renewal_module/css/employee-dashboard/datatables.bundle1.css",
			"/assets/renewal_module/css/employee-dashboard/plugins.bundle1.css",
			"/assets/renewal_module/css/employee-dashboard/style.bundle1.css",
			"/assets/renewal_module/css/employee-dashboard/vis-timeline.bundle1.css"
		], () => {
			//console.log("All CSS files loaded.");
			if (callback) callback(); // Proceed to render the page after CSS loads
		});
	}

	make() {
		//console.log("Appending body content...");
		let body = frappe.customer_app_page.body;
		$(this.page.main).append(body);

		this.add_refresh_button();
		this.add_sales_person();
		this.add_navigation_button();
		this.add_tabs();
		this.get_opp_count();
		this.get_opp_amount();
		this.get_closed_amount();
		this.get_lost_amount();
		this.get_opp_count_tm();
		this.get_closed_amount_tm();
		this.get_lost_amount_tm();
		this.get_rnwls_count_lw();
		this.get_rnwls_amount_lw();
		this.get_rnwls_count_tw();
		this.get_rnwls_amount_tw();
		this.get_rnwls_count_tm();
		this.get_rnwls_amount_tm();
		this.get_cofed_rnwls();
		this.get_pending_rnwls();
		this.get_lost_rnwls();
		this.get_closure_opp_count_tw();
		this.get_closure_opp_amount_tw();
		this.get_closure_opp_count_tm();
		this.get_closure_opp_amount_tm();

		frappe.require(["https://cdnjs.cloudflare.com/ajax/libs/apexcharts/3.41.0/apexcharts.min.js"], () => {
			//console.log("Chart.js loaded");
			this.opp_chart();
			this.brand_donut_chart();
			this.brand_donut_chart_tw();
			this.brand_donut_chart_tm();
			this.get_item_group_donut_chart();
			//this.barrenderChart();
			this.ChartHandler();
			//target dashboard
			this.target_chart();
			//new
			this.target_category_wise_chart();
			//sales target dashboard
			this.sales_target_chart();

		});

		frappe.require(["https://d3js.org/d3.v7.min.js"], () => {
			//console.log("✅ D3.js loaded successfully!");
			this.barrenderChart();
		});

		//target Dashboard
		this.get_sales_target_tm();
		this.get_sales_target_tq();
		this.get_sales_target_ty();
		//new
		this.get_sales_target_category_tm();
		this.get_sales_target_category_bt_tm();

		//sales target dashboard
		this.get_sales_target();


	}

	add_css(css_file) {

		if (!css_file.startsWith('/assets/')) {
			css_file = '/assets' + css_file;
		}

		let link = $('<link>', {
			rel: 'stylesheet',
			type: 'text/css',
			href: `${css_file}?v=${new Date().getTime()}` // Cache-busting
		});
		$('head').append(link);
	}

	// add_refresh_button() {
	// 	this.page.set_secondary_action('Refresh', function () {
	// 		location.reload();
	// 	}, 'refresh');
	// }

	add_refresh_button() {
		this.page.set_secondary_action('Refresh', function () {
			// Store the current active tab in localStorage
			//let activeTab = $(".dropdown-item.active").attr("id");
			//localStorage.setItem("activeTab", activeTab);
			// Reload the page
			location.reload();
		}, 'refresh');
	}

	add_navigation_button() {
		this.page.set_primary_action('CRM Dashboard', () => {
			//frappe.set_route('employee-dashboard');
			window.location.href = "/app/crm-dashboard";

		});
	}


	add_tabs() {
		let me = this;
		this.add_tab_field = $(`
			<div class="dropdown ms-2">
				<button id="dashboard-btn" class="btn btn-light border-light btn-sm dropdown-toggle ellipsis button-sm" type="button" data-bs-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
					Select Dashboard <i class="align-middle ms-1 wh-15" data-feather="chevron-down"></i>
				</button>
				<div class="dropdown-menu dropdown-menu-end">
					<a class="dropdown-item nav-link1 mb-2" id="opp-tab" data-target="#opp-content" role="tab" aria-controls="opp-content" aria-selected="true">
						Opportunity Dashboard
					</a>
					<a class="dropdown-item nav-link1 mb-2" id="target-tab" data-target="#target-content" role="tab" aria-controls="target-content" aria-selected="false">
						Target Dashboard
					</a>
					<a class="dropdown-item nav-link1 mb-2" id="account-tab" data-target="#account-content" role="tab" aria-controls="account-content" aria-selected="false">
						Account Dashboard
					</a>
					<a class="dropdown-item nav-link1 mb-2" id="sales-target-tab" data-target="#sales-target-content" role="tab" aria-controls="sales-target-content" aria-selected="false">
						Sales Target Dashboard
					</a>
				</div>
			</div>
		`);

		$(".page-actions").append(this.add_tab_field);
		// Retrieve the last active tab from localStorage
		let savedTab = localStorage.getItem("activeTab") || "opp-tab"; // Default to "opp-tab" if not found
		let selectedTab = $("#" + savedTab);
		let selectedContent = $(selectedTab.data("target"));
		// Set the active tab and update button text
		$(".dropdown-item").removeClass("active");
		$(".tab-pane").removeClass("show active");
		selectedTab.addClass("active");
		selectedContent.addClass("show active");
		$("#dashboard-btn").html(selectedTab.text().trim() + ' <i class="align-middle ms-1 wh-15" data-feather="chevron-down"></i>');
		// Add event listener for tab switching
		$(".dropdown-item").on("click", function (event) {
			event.preventDefault(); // Prevent default anchor behavior
			let targetTab = $(this).data("target"); // Get target content ID
			let selectedText = $(this).text().trim(); // Get selected tab name
			// Update the button text with the selected dashboard name
			$("#dashboard-btn").html(selectedText + ' <i class="align-middle ms-1 wh-15" data-feather="chevron-down"></i>');
			// Remove active class from all tabs
			$(".dropdown-item").removeClass("active");
			$(".tab-pane").removeClass("show active");
			// Add active class to the clicked tab and its content
			$(this).addClass("active");
			$(targetTab).addClass("show active");
			// Store the selected tab in localStorage
			localStorage.setItem("activeTab", $(this).attr("id"));
		});
	}


	add_sales_person() {
		let me = this;
		this.sales_person_field = $(`
			<div class="ml-2">
				<div class="select-wrapper">
					<select class="form-control" id="sales-person-dropdown">
						<option value="">Sales Person</option>
					</select>
				</div>
			</div>
		`);

		// Append only to visible and valid page-actions container
		$(".page-actions:visible").first().append(this.sales_person_field);

		let $dropdown = $("#sales-person-dropdown");

		//console.log("Dropdown added to:", $dropdown);

		frappe.call({
			method: "renewal_module.custom_module.page.crm_dashboard.crm_dashboard.get_sales_person",
			callback: function (r) {
				//console.log("Sales persons fetched:", r.message);
				if (r.message && $dropdown.length) {
					let storedSalesPerson = localStorage.getItem("sales_person");

					r.message.forEach(sp => {
						$dropdown.append(`<option value="${sp}">${sp}</option>`);
					});

					setTimeout(() => {
						if (r.message.length === 1) {
							$dropdown.val(r.message[0]).trigger("change");
							me.update_dashboard_data(r.message[0]);
						} else if (storedSalesPerson && r.message.includes(storedSalesPerson)) {
							$dropdown.val(storedSalesPerson).trigger("change");
							me.update_dashboard_data(storedSalesPerson);
						}
					}, 100);
				}
			}
		});

		$dropdown.on("change", function () {
			let sales_person = $(this).val();
			me.update_dashboard_data(sales_person);
			//localStorage.setItem("sales_person", sales_person);
		});
	}

	// Function to update all dashboard data
	update_dashboard_data(sales_person) {
		if (sales_person) {
			console.log("Updating dashboard for:", sales_person);
			this.get_opp_count(sales_person);
			this.get_opp_amount(sales_person);
			this.get_closed_amount(sales_person);
			this.get_lost_amount(sales_person);
			this.get_opp_count_tm(sales_person);
			this.get_closed_amount_tm(sales_person);
			this.get_lost_amount_tm(sales_person);
			this.get_rnwls_count_lw(sales_person);
			this.get_rnwls_amount_lw(sales_person);
			this.opp_chart(sales_person);
			this.brand_donut_chart(sales_person);
			this.brand_donut_chart_tw(sales_person);
			this.brand_donut_chart_tm(sales_person);
			this.get_item_group_donut_chart(sales_person);
			this.get_cofed_rnwls(sales_person);
			this.get_lost_rnwls(sales_person);
			this.get_pending_rnwls(sales_person);
			this.get_rnwls_count_tw(sales_person);
			this.get_rnwls_amount_tw(sales_person);
			this.get_rnwls_count_tm(sales_person);
			this.get_rnwls_amount_tm(sales_person);
			this.barrenderChart(sales_person);
			this.get_closure_opp_count_tw(sales_person);
			this.get_closure_opp_amount_tw(sales_person);
			this.get_closure_opp_count_tm(sales_person);
			this.get_closure_opp_amount_tm(sales_person);

			//target dashboard
			this.target_chart(sales_person);
			this.get_sales_target_tm(sales_person);
			this.get_sales_target_tq(sales_person);
			this.get_sales_target_ty(sales_person);
			//new
			this.target_category_wise_chart(sales_person);
			this.get_sales_target_category_tm(sales_person);
			this.get_sales_target_category_bt_tm(sales_person);
			//sales target dashboard
			this.get_sales_target(sales_person);
			this.sales_target_chart(sales_person);
		}
	}


	opp_chart(sales_person = null) {
		//console.log("bar chart", sales_person)
		setTimeout(() => {
			frappe.call({
				method: "renewal_module.custom_module.page.employee_dashboard.employee_dashboard.get_monthly_opp_data", // Replace with your API method
				args: { sales_person: sales_person },
				callback: function (r) {
					//console.log("r", r);
					if (r.message) {
						//console.log("amount", r.message.amounts)
						//console.log("count", r.message.counts)
						let chartElement = document.getElementById("sales-overview");
						let options = {
							colors: ["#4C4EE7", "#0EA5E9"],
							series: [
								{ name: "Sales", data: r.message.amounts.map(val => val || 0), type: "bar" }, // Ensure no null/undefined
								{ name: "Count", data: r.message.counts.map(val => val || 0), type: "bar" }, // Ensure no null/undefined

							],

							chart: { type: "bar", height: 255, toolbar: { show: false } },
							dataLabels: { enabled: false },
							plotOptions: { bar: { borderRadius: 4, columnWidth: "45%" } },
							legend: { show: false },
							xaxis: {
								categories: r.message.months, // Dynamic months
								axisBorder: { show: false },
								axisTicks: { show: false },
								labels: {
									rotate: 0, // Prevent rotation
									hideOverlappingLabels: true, // ✅ Skip labels if needed
									showDuplicates: false, // ✅ Prevent repeated labels
									style: { fontSize: "12px" }
								}
							},
							grid: { padding: { left: 0, right: 0, top: 0, bottom: -10 } },
							yaxis: [
								{
									//labels: { show: false }
									//title: { text: "Sales (Amount)" },
									//labels: { formatter: (val) => val.toLocaleString() }
								},
								{
									opposite: true, // Places second y-axis on the right
									//title: { text: "Opportunities (Count)" },
									//labels: { formatter: (val) => Math.round(val) }
									labels: { show: false }
								}
							],
							tooltip: {
								y: {
									formatter: function (val, { seriesIndex }) {
										if (seriesIndex === 0) {
											return new Intl.NumberFormat('en-IN', {
												style: 'currency',
												currency: 'INR',
												maximumFractionDigits: 0
											}).format(val);
										}
										return val;
									}
								}
							}

						};

						// let chart = new ApexCharts(chartElement, options);
						// chart.render();

						// Destroy the previous chart if it exists
						if (window.oppChart) {
							window.oppChart.destroy();
						}

						// Render new chart
						window.oppChart = new ApexCharts(chartElement, options);
						window.oppChart.render();
					}
				}
			});
		}, 500);
	}

	showLegendModalBrand(labels, values, colors) {
		const modal = document.getElementById("legend-modal-brand");
		const body = document.getElementById("legend-modal-brand-body");
		const closeBtn = modal.querySelector(".legend-close");

		body.innerHTML = "";

		labels.forEach((label, i) => {
			let amount = values[i].toLocaleString();
			let color = colors[i % colors.length];

			let item = document.createElement("div");
			item.classList.add("d-flex", "align-items-center", "my-2");

			item.innerHTML = `
				<div class="bullet w-8px h-6px rounded-2" style="background-color: ${color}; margin-right: 8px;"></div>
				<div class="text-gray-500 flex-grow-1">${label}</div>
				<div class="fw-bolder text-gray-700 text-end">${amount}</div>
			`;

			body.appendChild(item);
		});

		modal.style.display = "block";

		closeBtn.onclick = () => {
			modal.style.display = "none";
		};

		window.onclick = (event) => {
			if (event.target === modal) {
				modal.style.display = "none";
			}
		};
	}

	brand_donut_chart(sales_person = null) {
		setTimeout(() => {
			frappe.call({
				method: "renewal_module.custom_module.page.employee_dashboard.employee_dashboard.get_brand_wise_data",
				args: { sales_person: sales_person },
				callback: (r) => {
					if (r.message) {
						//console.log("brand", r.message);
						const chartElement = document.getElementById("brand_donut_chart");
						const legendContainer = document.getElementById("brand_legend");

						if (!chartElement || !legendContainer) {
							console.error("Chart or legend container not found");
							return;
						}

						const seriesData = r.message.amounts?.map(val => val || 0) || [0];
						const labelsData = r.message.brand || ["No Data"];
						const colors = ["#FEB019", "#EE502D", "#008FFB", "#00E396", "#775DD0", "#546E7A"];

						const chartOptions = {
							chart: { type: "donut", height: 268 },
							series: seriesData,
							labels: labelsData,
							colors: colors,
							dataLabels: { enabled: false },
							legend: { show: false },
							tooltip: { enabled: false },
							stroke: { lineCap: "round", width: 2 },
							plotOptions: {
								pie: {
									size: 100,
									offsetX: 0,
									offsetY: 0,
									donut: {
										size: "50%",
										labels: {
											show: true,
											name: { show: true, fontSize: "12px", offsetY: -8 },
											value: { show: true, fontSize: "12px", color: "#343a40", fontWeight: 500, offsetY: 1 },
											total: { show: true, fontSize: "12px", label: "Total Value", color: "#9599ad", fontWeight: 500 }
										}
									}
								}
							}
						};

						if (window.brandDonutChart) {
							window.brandDonutChart.destroy();
						}

						window.brandDonutChart = new ApexCharts(chartElement, chartOptions);
						window.brandDonutChart.render();

						// Render legends
						legendContainer.innerHTML = "";
						const MAX_VISIBLE_LEGENDS = 4;

						const visibleLabels = labelsData.slice(0, MAX_VISIBLE_LEGENDS);
						const hiddenLabels = labelsData.slice(MAX_VISIBLE_LEGENDS);
						const visibleValues = seriesData.slice(0, MAX_VISIBLE_LEGENDS);
						const hiddenValues = seriesData.slice(MAX_VISIBLE_LEGENDS);

						visibleLabels.forEach((label, index) => {
							const amount = visibleValues[index].toLocaleString();
							const color = colors[index % colors.length];

							const legendItem = document.createElement("div");
							legendItem.classList.add("d-flex", "fs-6", "fw-semibold", "align-items-center", "my-2");

							legendItem.innerHTML = `
								<div class="bullet w-8px h-6px rounded-2" style="background-color: ${color};"></div>
								<div class="text-gray-500 flex-grow-1 me-3">${label}</div>
								<div class="fw-bolder text-gray-700 text-xxl-end pr-2">${amount}</div>
							`;

							legendContainer.appendChild(legendItem);
						});

						if (hiddenLabels.length > 0) {
							const moreButton = document.createElement("button");
							moreButton.textContent = `+${hiddenLabels.length} More`;
							moreButton.classList.add("btn", "btn-sm", "btn-light", "mt-2");
							moreButton.style.cursor = "pointer";

							// ✅ Use arrow function so "this" refers to the class
							moreButton.onclick = () => {
								this.showLegendModalBrand(hiddenLabels, hiddenValues, colors);
							};

							legendContainer.appendChild(moreButton);
						}
					}
				}
			});
		}, 500);
	}

	showLegendModalBrandTw(labels, values, colors) {
		const modal = document.getElementById("legend-modal-brand-tw");
		const body = document.getElementById("legend-modal-brand-tw-body");
		const closeBtn = modal.querySelector(".legend-close");

		if (!modal || !body || !closeBtn) return;

		body.innerHTML = "";

		labels.forEach((label, i) => {
			const amount = values[i].toLocaleString();
			const color = colors[i % colors.length];

			const item = document.createElement("div");
			item.classList.add("d-flex", "align-items-center", "my-2");
			item.innerHTML = `
				<div class="bullet w-8px h-6px rounded-2" style="background-color: ${color}; margin-right: 8px;"></div>
				<div class="text-gray-500 flex-grow-1">${label}</div>
				<div class="fw-bolder text-gray-700 text-end">${amount}</div>
			`;
			body.appendChild(item);
		});

		modal.style.display = "block";

		closeBtn.onclick = () => modal.style.display = "none";
		window.onclick = (event) => {
			if (event.target === modal) {
				modal.style.display = "none";
			}
		};
	}

	brand_donut_chart_tw(sales_person = null) {
		setTimeout(() => {
			frappe.call({
				method: "renewal_module.custom_module.page.employee_dashboard.employee_dashboard.get_brand_wise_data_tw",
				args: { sales_person },
				callback: (r) => {
					if (!r.message) return;

					const chartElement = document.getElementById("brand_donut_chart_tw");
					const legendContainer = document.getElementById("brand_legend_tw");

					if (!chartElement || !legendContainer) {
						console.error("Chart or legend container not found");
						return;
					}

					const seriesData = r.message.amounts?.map(val => val || 0) || [0];
					const labelsData = r.message.brand || ["No Data"];
					const colors = ["#FEB019", "#EE502D", "#008FFB", "#00E396", "#775DD0", "#546E7A"];

					const chartOptions = {
						chart: { type: "donut", height: 268 },
						series: seriesData,
						labels: labelsData,
						colors: colors,
						dataLabels: { enabled: false },
						legend: { show: false },
						tooltip: { enabled: false },
						stroke: { lineCap: "round", width: 2 },
						plotOptions: {
							pie: {
								donut: {
									size: "50%",
									labels: {
										show: true,
										name: { show: true, fontSize: "12px", offsetY: -8 },
										value: { show: true, fontSize: "12px", color: "#343a40", fontWeight: 500, offsetY: 1 },
										total: {
											show: true,
											fontSize: "12px",
											label: "Total Value",
											color: "#9599ad",
											fontWeight: 500
										}
									}
								}
							}
						}
					};

					// Destroy existing chart
					if (window.brandDonutChartTw) {
						window.brandDonutChartTw.destroy();
					}

					window.brandDonutChartTw = new ApexCharts(chartElement, chartOptions);
					window.brandDonutChartTw.render();

					// Render Legends
					legendContainer.innerHTML = "";
					const MAX_VISIBLE = 4;

					const visibleLabels = labelsData.slice(0, MAX_VISIBLE);
					const hiddenLabels = labelsData.slice(MAX_VISIBLE);
					const visibleValues = seriesData.slice(0, MAX_VISIBLE);
					const hiddenValues = seriesData.slice(MAX_VISIBLE);

					visibleLabels.forEach((label, index) => {
						const amount = visibleValues[index].toLocaleString();
						const color = colors[index % colors.length];

						const legendItem = document.createElement("div");
						legendItem.classList.add("d-flex", "fs-6", "fw-semibold", "align-items-center", "my-2");
						legendItem.innerHTML = `
							<div class="bullet w-8px h-6px rounded-2" style="background-color: ${color};"></div>
							<div class="text-gray-500 flex-grow-1 me-3">${label}</div>
							<div class="fw-bolder text-gray-700 text-xxl-end pr-2">${amount}</div>
						`;
						legendContainer.appendChild(legendItem);
					});

					if (hiddenLabels.length > 0) {
						const moreBtn = document.createElement("button");
						moreBtn.textContent = `+${hiddenLabels.length} More`;
						moreBtn.classList.add("btn", "btn-sm", "btn-light", "mt-2");
						moreBtn.style.cursor = "pointer";

						moreBtn.onclick = () => {
							this.showLegendModalBrandTw(hiddenLabels, hiddenValues, colors);
						};

						legendContainer.appendChild(moreBtn);
					}
				}
			});
		}, 500);
	}

	showLegendModalBrandTm(labels, values, colors) {
		const modal = document.getElementById("legend-modal-brand-tm");
		const body = document.getElementById("legend-modal-brand-tm-body");
		const closeBtn = modal.querySelector(".legend-close");

		if (!modal || !body || !closeBtn) return;

		body.innerHTML = "";

		labels.forEach((label, i) => {
			const amount = values[i].toLocaleString();
			const color = colors[i % colors.length];

			const item = document.createElement("div");
			item.classList.add("d-flex", "align-items-center", "my-2");
			item.innerHTML = `
				<div class="bullet w-8px h-6px rounded-2" style="background-color: ${color}; margin-right: 8px;"></div>
				<div class="text-gray-500 flex-grow-1">${label}</div>
				<div class="fw-bolder text-gray-700 text-end">${amount}</div>
			`;
			body.appendChild(item);
		});

		modal.style.display = "block";

		closeBtn.onclick = () => modal.style.display = "none";
		window.onclick = (event) => {
			if (event.target === modal) {
				modal.style.display = "none";
			}
		};
	}

	brand_donut_chart_tm(sales_person = null) {
		setTimeout(() => {
			frappe.call({
				method: "renewal_module.custom_module.page.employee_dashboard.employee_dashboard.get_brand_wise_data_tm",
				args: { sales_person },
				callback: (r) => {
					if (!r.message) return;

					const chartElement = document.getElementById("brand_donut_chart_tm");
					const legendContainer = document.getElementById("brand_legend_tm");

					if (!chartElement || !legendContainer) {
						console.error("Chart or legend container not found");
						return;
					}

					const seriesData = r.message.amounts?.map(val => val || 0) || [0];
					const labelsData = r.message.brand || ["No Data"];
					const colors = ["#FEB019", "#EE502D", "#008FFB", "#00E396", "#775DD0", "#546E7A"];

					const chartOptions = {
						chart: { type: "donut", height: 268 },
						series: seriesData,
						labels: labelsData,
						colors: colors,
						dataLabels: { enabled: false },
						legend: { show: false },
						tooltip: { enabled: false },
						stroke: { lineCap: "round", width: 2 },
						plotOptions: {
							pie: {
								donut: {
									size: "50%",
									labels: {
										show: true,
										name: { show: true, fontSize: "12px", offsetY: -8 },
										value: { show: true, fontSize: "12px", color: "#343a40", fontWeight: 500, offsetY: 1 },
										total: {
											show: true,
											fontSize: "12px",
											label: "Total Value",
											color: "#9599ad",
											fontWeight: 500
										}
									}
								}
							}
						}
					};

					// Destroy existing chart
					if (window.brandDonutChartTm) {
						window.brandDonutChartTm.destroy();
					}

					window.brandDonutChartTm = new ApexCharts(chartElement, chartOptions);
					window.brandDonutChartTm.render();

					// Render Legends
					legendContainer.innerHTML = "";
					const MAX_VISIBLE = 4;

					const visibleLabels = labelsData.slice(0, MAX_VISIBLE);
					const hiddenLabels = labelsData.slice(MAX_VISIBLE);
					const visibleValues = seriesData.slice(0, MAX_VISIBLE);
					const hiddenValues = seriesData.slice(MAX_VISIBLE);

					visibleLabels.forEach((label, index) => {
						const amount = visibleValues[index].toLocaleString();
						const color = colors[index % colors.length];

						const legendItem = document.createElement("div");
						legendItem.classList.add("d-flex", "fs-6", "fw-semibold", "align-items-center", "my-2");
						legendItem.innerHTML = `
							<div class="bullet w-8px h-6px rounded-2" style="background-color: ${color};"></div>
							<div class="text-gray-500 flex-grow-1 me-3">${label}</div>
							<div class="fw-bolder text-gray-700 text-xxl-end pr-2">${amount}</div>
						`;
						legendContainer.appendChild(legendItem);
					});

					if (hiddenLabels.length > 0) {
						const moreBtn = document.createElement("button");
						moreBtn.textContent = `+${hiddenLabels.length} More`;
						moreBtn.classList.add("btn", "btn-sm", "btn-light", "mt-2");
						moreBtn.style.cursor = "pointer";

						moreBtn.onclick = () => {
							this.showLegendModalBrandTw(hiddenLabels, hiddenValues, colors);
						};

						legendContainer.appendChild(moreBtn);
					}
				}
			});
		}, 500);
	}

	showLegendModalItemGroup(labels, values, colors) {
		const modal = document.getElementById("legend-modal-item-group");
		const body = document.getElementById("legend-modal-item-group-body");
		const closeBtn = modal.querySelector(".legend-close");

		body.innerHTML = "";

		labels.forEach((label, i) => {
			let amount = values[i] || 0;
			let formattedAmount = amount.toLocaleString();
			let color = colors[i % colors.length];

			let item = document.createElement("div");
			item.classList.add("d-flex", "align-items-center", "my-2");

			item.innerHTML = `
				<div class="bullet w-8px h-6px rounded-2" style="background-color: ${color}; margin-right: 8px;"></div>
				<div class="text-gray-500 flex-grow-1">${label}</div>
				<div class="fw-bolder text-gray-700 text-end">${formattedAmount}</div>
			`;

			body.appendChild(item);
		});

		modal.style.display = "block";

		closeBtn.onclick = () => {
			modal.style.display = "none";
		};

		window.onclick = (event) => {
			if (event.target === modal) {
				modal.style.display = "none";
			}
		};
	}

	get_item_group_donut_chart(sales_person = null) {
		frappe.call({
			method: "renewal_module.custom_module.page.employee_dashboard.employee_dashboard.get_item_group_wise_data",
			args: { sales_person: sales_person },
			callback: (r) => {
				if (r.message) {
					const chartElement = document.getElementById("item_group_donut_chart");
					const legendContainer = document.getElementById("item_group_legend");

					const colors = ["#FEB019", "#EE502D", "#008FFB", "#00E396", "#775DD0", "#546E7A"];
					const series = r.message.amounts?.map(val => val || 0) || [0];
					const labels = r.message.item_group?.length ? r.message.item_group : ["No Data"];

					const chartOptions = {
						chart: { type: "donut", height: 268 },
						series: series,
						labels: labels,
						colors: colors,
						dataLabels: { enabled: false },
						legend: { show: false },
						tooltip: { enabled: false },
						stroke: { lineCap: "round", width: 2 },
						plotOptions: {
							pie: {
								size: 100,
								donut: {
									size: "50%",
									labels: {
										show: true,
										name: { show: true, fontSize: "12px", offsetY: -8 },
										value: { show: true, fontSize: "12px", color: "#343a40", fontWeight: 500, offsetY: 1 },
										total: { show: true, fontSize: "12px", label: "Total Value", color: "#9599ad", fontWeight: 500 }
									}
								}
							}
						}
					};

					if (window.itemGroupDonutChart) {
						window.itemGroupDonutChart.destroy();
					}

					window.itemGroupDonutChart = new ApexCharts(chartElement, chartOptions);
					window.itemGroupDonutChart.render();

					// Render legends
					legendContainer.innerHTML = "";
					const MAX_VISIBLE_LEGENDS = 4;

					const visibleLabels = labels.slice(0, MAX_VISIBLE_LEGENDS);
					const hiddenLabels = labels.slice(MAX_VISIBLE_LEGENDS);
					const visibleValues = series.slice(0, MAX_VISIBLE_LEGENDS);
					const hiddenValues = series.slice(MAX_VISIBLE_LEGENDS);

					visibleLabels.forEach((label, index) => {
						let amount = visibleValues[index] || 0;
						let formattedAmount = amount.toLocaleString();
						let color = colors[index % colors.length];

						let legendItem = document.createElement("div");
						legendItem.classList.add("d-flex", "fs-6", "fw-semibold", "align-items-center", "my-2");

						legendItem.innerHTML = `
							<div class="bullet w-8px h-6px rounded-2" style="background-color: ${color};"></div>
							<div class="text-gray-500 flex-grow-1 me-3 pl-1">${label}</div>
							<div class="fw-bolder text-gray-700 text-xxl-end pr-3">${formattedAmount}</div>
						`;

						legendContainer.appendChild(legendItem);
					});

					if (hiddenLabels.length > 0) {
						const moreButton = document.createElement("button");
						moreButton.textContent = `+${hiddenLabels.length} More`;
						moreButton.classList.add("btn", "btn-sm", "btn-light", "mt-2");
						moreButton.style.cursor = "pointer";

						moreButton.onclick = () => {
							this.showLegendModalItemGroup(hiddenLabels, hiddenValues, colors);
						};

						legendContainer.appendChild(moreButton);
					}
				}
			}
		});
	}


	/*get_item_group_donut_chart(sales_person = null) {
		//console.log("item group", sales_person)
		// setTimeout(() => {
		//console.log("group2", sales_person)
		frappe.call({
			method: "renewal_module.custom_module.page.employee_dashboard.employee_dashboard.get_item_group_wise_data",
			args: { sales_person: sales_person },
			callback: function (r) {
				//console.log("r", r);
				if (r.message) {
					//console.log("amount", r.message.amounts);

					let chartElement = document.getElementById("item_group_donut_chart");
					let legendContainer = document.getElementById("item_group_legend");
					let colors = ["#FEB019", "#EE502D", "#008FFB", "#00E396", "#775DD0", "#546E7A"];
					let series = (r.message && r.message.amounts && r.message.amounts.length) ? r.message.amounts.map(val => val || 0) : [0];
					let labels = (r.message && r.message.item_group && r.message.item_group.length) ? r.message.item_group : ["No Data"];
					let chartOptions = {
						chart: { type: "donut", height: 268 },
						//series: [7660, 2820, 45257], // Example values
						//labels: ["Shoes", "Gaming", "Others"],
						//series: r.message.amounts.map(val => val || 0),
						//labels: r.message.item_group || [],
						series: series,
						labels: labels,
						colors: colors,
						dataLabels: { enabled: false }, // Removes percentages
						legend: { show: false },
						dataLabels: {
							enabled: false
						},
						tooltip: { enabled: false },
						stroke: {
							lineCap: "round",
							width: 2
						},
						plotOptions: {
							pie: {
								size: 100,
								offsetX: 0,
								offsetY: 0,
								donut: {
									size: "50%",
									labels: {
										show: true,
										name: {
											show: true,
											fontSize: "12px",
											offsetY: -8
										},
										value: {
											show: true,
											fontSize: "12px",
											color: "#343a40",
											fontWeight: 500,
											offsetY: 1
										},
										total: {
											show: true,
											fontSize: "12px",
											label: "Total Value",
											color: "#9599ad",
											fontWeight: 500
										}
									}
								}
							}
						},
					};

					// let chart = new ApexCharts(chartElement, chartOptions);
					// chart.render();

					if (window.itemGroupDonutChart) {
						window.itemGroupDonutChart.destroy();
					}

					if (legendContainer) {
						legendContainer.innerHTML = ""; // Clear old legend items

						r.message.item_group.forEach((label, index) => {
							let amount = r.message.amounts[index] || 0; // Ensure it's a number
							let formattedAmount = amount.toLocaleString(); // Format as currency
							let color = colors[index % colors.length]; // Get color from array

							let legendItem = document.createElement("div");
							legendItem.classList.add("d-flex", "fs-6", "fw-semibold", "align-items-center", "my-2");

							legendItem.innerHTML = `
									<div class="bullet w-8px h-6px rounded-2" style="background-color: ${color};"></div>
									<div class="text-gray-500 flex-grow-1 me-3 pl-1">${label}</div>
									<div class="fw-bolder text-gray-700 text-xxl-end pr-3">${formattedAmount}</div>
								`;

							legendContainer.appendChild(legendItem);
						});
					} else {
						console.error("Legend container not found");
					}

				}
			}
		})
		// }, 500); // Corrected `setTimeout()` syntax
	}*/

	get_opp_count(sales_person = null) {
		//console.log("opp count", sales_person)
		$("#opp-count").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.employee_dashboard.employee_dashboard.get_opp_count",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					$("#opp-count").text(r.message);
				}
			}
		});
	}

	get_opp_amount(sales_person = null) {
		$("#opp-amount").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.employee_dashboard.employee_dashboard.get_total_amount",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					let formatted_price = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(r.message);
					$("#opp-amount").text(formatted_price);
				}
			}
		});
	}

	get_closed_amount(sales_person = null) {
		$("#closed-amount").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.employee_dashboard.employee_dashboard.get_won_amount",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					let formatted_price = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(r.message);
					$("#closed-amount").text(formatted_price);
				}
			}
		});
	}

	get_lost_amount(sales_person = null) {
		$("#lost-amount").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.employee_dashboard.employee_dashboard.get_lost_amount",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					let formatted_price = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(r.message);
					$("#lost-amount").text(formatted_price);
				}
			}
		});
	}

	get_rnwls_count_lw(sales_person = null) {
		$("#renewal-count").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.employee_dashboard.employee_dashboard.get_rnwls_count_lw",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					$("#renewal-count").text(r.message);
				}
			}
		});
	}

	get_rnwls_amount_lw(sales_person = null) {
		$("#renewal-amount").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.employee_dashboard.employee_dashboard.get_rnwls_amount_lw",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					let formatted_price = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(r.message);
					$("#renewal-amount").text(formatted_price);
				}
			}
		});
	}

	get_opp_count_tm(sales_person = null) {
		//console.log("opp count", sales_person)
		$("#opp-count-tm").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.employee_dashboard.employee_dashboard.get_opp_count_tm",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					$("#opp-count-tm").text(r.message);
				}
			}
		});
	}

	get_closed_amount_tm(sales_person = null) {
		$("#closed-amount-tm").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.employee_dashboard.employee_dashboard.get_won_amount_tm",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					let formatted_price = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(r.message);
					$("#closed-amount-tm").text(formatted_price);
				}
			}
		});
	}

	get_lost_amount_tm(sales_person = null) {
		$("#lost-amount-tm").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.employee_dashboard.employee_dashboard.get_lost_amount_tm",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					let formatted_price = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(r.message);
					$("#lost-amount-tm").text(formatted_price);
				}
			}
		});
	}

	/*barrenderChart(sales_person = null) {
		setTimeout(() => {
			frappe.call({
				method: "renewal_module.custom_module.page.employee_dashboard.employee_dashboard.get_funnel_data",
				args: { sales_person: sales_person },
				callback: function (r) {
					//console.log("API Response:", r);

					if (r.message && Array.isArray(r.message.amounts) && Array.isArray(r.message.funnel)) {
						var chartElement = document.getElementById("kt_charts_widget_6");

						if (!chartElement) {
							console.error("Chart container not found: #kt_charts_widget_6");
							return;
						}

						let data = r.message.amounts.map((val, index) => ({ amount: val || 0, funnel: r.message.funnel[index] || "Unknown" }));
						// Sort data in descending order based on amount
						data.sort((a, b) => b.amount - a.amount);
						// Extract sorted values
						let series1 = data.map(item => item.amount);
						let labels1 = data.map(item => item.funnel);


						//let seriesData = r.message.amounts.map(val => val || 0); // Replace null with 0
						//let labelsData = r.message.brand.map(month => month || "Unknown"); // Ensure labels are valid
						//let labelsData = r.message.brand.map(brand => brand || 0 );
						//console.log("labelsData", labels1)
						var options = {
							series: [{ name: "Sales", data: series1 }], // Fixed series format
							chart: { type: "bar", height: 300, toolbar: { show: false } },
							plotOptions: {
								bar: { borderRadius: 8, horizontal: true, distributed: true, barHeight: 15, }
							},
							// dataLabels: {
							// 	enabled: true,
							// 	textAnchor: "start",
							// 	offsetX: 0,
							// 	formatter: function (val) {
							// 		return val ;
							// 	},
							// 	style: { fontSize: "14px", fontWeight: "600", align: "left" }
							// },
							dataLabels: {
								enabled: true,
								textAnchor: "start",
								offsetX: 0,
								formatter: function (val) {
									// Format as currency
									return new Intl.NumberFormat('en-US', {
										style: 'currency',
										currency: 'INR'
									}).format(val); // Change 'USD' to your desired currency
								},
								style: { fontSize: "14px", fontWeight: "600", align: "left" }
							},
							colors: ["#3E97FF", "#F1416C", "#50CD89", "#FFC700", "#7239EA"],
							xaxis: {
								categories: labels1, // Use dynamic labels
								labels: {
									formatter: (val) => val,
									style: { fontSize: "10px", fontWeight: "600" }
								}
							},
							yaxis: {
								labels: {
									//formatter: (val) => `${val} - ${parseInt((100 * val) / Math.max(...seriesData))}%`,
									style: { fontSize: "12px", fontWeight: "600" }
								}
							},
							grid: { show: false },
							tooltip: {
								style: { fontSize: "10px" },
								y: { formatter: (val) => val + "K" }
							},
							legend: { show: false }
						};

						// Destroy existing chart if it exists
						if (window.chartInstance) {
							window.chartInstance.destroy();
						}

						// Create new chart
						window.chartInstance = new ApexCharts(chartElement, options);
						window.chartInstance.render();
					} else {
						console.error("Invalid data received from API:", r.message);
					}
				}
			});
		}, 500);
	}*/


	barrenderChart(sales_person = null) {
		//console.log("barrenderChart", sales_person);
		setTimeout(() => {
			frappe.call({
				method: "renewal_module.custom_module.page.employee_dashboard.employee_dashboard.get_funnel_data",
				args: { sales_person: sales_person },
				callback: function (r) {
					if (r.message && Array.isArray(r.message.amounts) && Array.isArray(r.message.funnel)) {

						let formatIndianCurrency = (amount) => {
							if (isNaN(amount) || amount === null || amount === undefined) return "₹ 0";
							return new Intl.NumberFormat('en-IN', {
								style: 'currency',
								currency: 'INR'
							}).format(amount);
						};

						let data = r.message.amounts.map((val, index) => ({
							amount: Number(val) || 0,
							formattedAmount: formatIndianCurrency(Number(val) || 0),
							funnel: r.message.funnel[index] || "Unknown"
						})).sort((a, b) => b.amount - a.amount);

						let container = d3.select("#kt_charts_widget_6");
						let containerWidth = container.node()?.getBoundingClientRect().width || 900;
						let width = containerWidth;
						let height = Math.min(200, width * 0.3);

						// Legend
						let legendBoxWidth = 180;
						let legendBoxHeight = 18;
						let itemsPerRow = Math.floor(width / legendBoxWidth) || 1;
						let totalLegendRows = Math.ceil(data.length / itemsPerRow);
						let dynamicLegendHeight = totalLegendRows * (legendBoxHeight + 8);

						container.html("");
						d3.selectAll(".custom-tooltip").remove();

						let svg = container.append("svg")
							.attr("width", "100%")
							.attr("viewBox", `0 0 ${width} ${height + dynamicLegendHeight}`)
							.attr("preserveAspectRatio", "xMidYMid meet")
							.attr("height", height + dynamicLegendHeight);

						let funnelHeight = d3.scaleLinear()
							.domain([0, d3.max(data, d => d.amount) || 1])
							.range([50, height]);

						let funnelWidth = width / data.length;
						let colors = d3.schemeCategory10;

						let tooltip = d3.select("body").select(".custom-tooltip");
						if (tooltip.empty()) {
							tooltip = d3.select("body")
								.append("div")
								.attr("class", "custom-tooltip")
								.style("position", "absolute")
								.style("background", "#fff")
								.style("border", "1px solid #ddd")
								.style("padding", "5px 10px")
								.style("border-radius", "5px")
								.style("display", "none")
								.style("pointer-events", "none")
								.style("box-shadow", "0px 4px 6px rgba(0,0,0,0.1)");
						}

						// Funnel polygons
						svg.selectAll("polygon")
							.data(data)
							.enter()
							.append("polygon")
							.attr("points", (d, i) => {
								let leftHeight = funnelHeight(d.amount);
								let rightHeight = (i < data.length - 1) ? funnelHeight(data[i + 1].amount) : 0;
								let y1 = (height - leftHeight) / 2;
								let y2 = (height + leftHeight) / 2;
								let y3 = (height + rightHeight) / 2;
								let y4 = (height - rightHeight) / 2;
								let x1 = i * funnelWidth;
								let x2 = (i + 1) * funnelWidth;
								return `${x1},${y1} ${x1},${y2} ${x2},${y3} ${x2},${y4}`;
							})
							.attr("fill", (d, i) => colors[i % colors.length])
							.attr("stroke", "#fff")
							.attr("stroke-width", 2)
							.on("mouseover", (event, d) => {
								tooltip.style("display", "block")
									.html(`<b>Sales Stage: ${d.funnel}</b><br><b>Amount: ${d.formattedAmount}</b>`)
									.style("left", (event.pageX + 10) + "px")
									.style("top", (event.pageY - 20) + "px");
							})
							.on("mousemove", (event) => {
								tooltip.style("left", (event.pageX + 10) + "px")
									.style("top", (event.pageY - 20) + "px");
							})
							.on("mouseout", () => tooltip.style("display", "none"));

						// Labels
						// Helper function to truncate text with ellipsis
						function truncateText(text, maxChars) {
							return text.length > maxChars ? text.slice(0, maxChars) + "…" : text;
						}
						// Estimate max characters that can fit in each funnel block
						function getMaxChars(width) {
							return Math.floor(width / 8); // Adjust based on font size and padding
						}

						svg.selectAll("text")
							.data(data)
							.enter()
							.append("text")
							.attr("x", (d, i) => i * funnelWidth + funnelWidth / 2)
							.attr("y", height / 2)
							.attr("text-anchor", "middle")
							.attr("fill", "#fff")
							.attr("font-size", "10px")
							.attr("font-weight", "bold")
							.attr("transform", (d, i) => `rotate(0, ${i * funnelWidth + funnelWidth / 2}, ${height / 2})`)
							.each(function (d, i) {
								const maxChars = getMaxChars(funnelWidth);
								const tspanData = [
									truncateText(d.funnel, maxChars),
									truncateText(d.formattedAmount, maxChars)
								];

								d3.select(this)
									.selectAll("tspan")
									.data(tspanData)
									.enter()
									.append("tspan")
									.attr("x", d3.select(this).attr("x"))
									.attr("dy", (d, i) => i * 15)
									.text(d => d);
							});


						// Legends
						let legendGroup = svg.append("g")
							.attr("transform", `translate(0, ${height + 10})`);

						let legend = legendGroup.selectAll(".legend")
							.data(data)
							.enter()
							.append("g")
							.attr("class", "legend")
							.attr("class", "ellipsis")
							.attr("transform", (d, i) => {
								let col = i % itemsPerRow;
								let row = Math.floor(i / itemsPerRow);
								return `translate(${col * legendBoxWidth}, ${row * (legendBoxHeight + 8)})`;
							});

						legend.append("rect")
							.attr("width", 12)
							.attr("height", 12)
							.attr("x", 10)
							.attr("y", 0)
							.attr("fill", (d, i) => colors[i % colors.length]);

						legend.append("text")
							.attr("x", 28)
							.attr("y", 10)
							.attr("font-size", "10px")
							//.text(d => `${d.funnel} = ${d.formattedAmount}`);
							.text(d => truncateText(`${d.funnel} : ${d.formattedAmount}`, 30));
					}
				}
			});
		}, 500);
	}




	ChartHandler() {
		var chartElement = document.getElementById("sales-over");

		if (!chartElement) {
			console.error("Chart container not found: #sales-over");
			return;
		}

		var options = {
			chart: { type: "area", height: 350, toolbar: { show: false } },
			series: [
				{ name: "Expenses", data: [0, 70, 40, 75, 35, 75] },
				{ name: "Income", data: [0, 35, 15, 30, 15, 30] }
			],
			stroke: { curve: "smooth", width: [3, 2], dashArray: [0, 5] },
			colors: ["#3E97FF", "#F1416C"], // Replace with dynamic colors if needed
			xaxis: { categories: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"] },
			legend: { show: false },
			fill: {
				type: "gradient",
				gradient: { shadeIntensity: 1, opacityFrom: 0.3, opacityTo: 0.01, stops: [30, 100, 100, 100] }
			},
			dataLabels: { enabled: false },
			tooltip: { x: { show: false }, y: { title: { formatter: () => "" } } }
		};

		// Destroy existing chart if it exists
		if (window.salesChart) {
			window.salesChart.destroy();
		}

		// Create new chart
		window.salesChart = new ApexCharts(chartElement, options);
		window.salesChart.render();
	}

	//rewals

	get_rnwls_count_tw(sales_person = null) {
		$("#rnwls-count-tw").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.employee_dashboard.rnwls_data.get_rnwls_count_tw",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					$("#rnwls-count-tw").text(r.message);
				}
			}
		});
	}

	get_rnwls_amount_tw(sales_person = null) {
		$("#rnwls-amount-tw").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.employee_dashboard.rnwls_data.get_rnwls_amount_tw",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					//$("#rnwls-amount-tw").text(r.message);
					let formatted_price = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(r.message);
					$("#rnwls-amount-tw").text(formatted_price);
				}
			}
		});
	}

	get_rnwls_count_tm(sales_person = null) {
		$("#rnwls-count-tm").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.employee_dashboard.rnwls_data.get_rnwls_count_tm",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					$("#rnwls-count-tm").text(r.message);
				}
			}
		});
	}

	get_rnwls_amount_tm(sales_person = null) {
		$("#rnwls-amount-tm").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.employee_dashboard.rnwls_data.get_rnwls_amount_tm",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					//$("#rnwls-amount-tm").text(r.message);
					let formatted_price = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(r.message);
					$("#rnwls-amount-tm").text(formatted_price);
				}
			}
		});
	}

	get_cofed_rnwls(sales_person = null) {
		$("#cofed-rnwls").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.opportunity_dashboar.renewals.get_cofed_rnwls",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					$("#cofed-rnwls").text(r.message);
				}
			}
		});
	}

	get_pending_rnwls(sales_person = null) {
		$("#pending-rnwls").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.opportunity_dashboar.renewals.get_pending_rnwls",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					$("#pending-rnwls").text(r.message);
				}
			}
		});
	}

	get_lost_rnwls(sales_person = null) {
		$("#lost-rnwls").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.opportunity_dashboar.renewals.get_lost_rnwls",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					$("#lost-rnwls").text(r.message);
				}
			}
		});
	}

	//closures
	get_closure_opp_count_tw(sales_person = null) {
		$("#closure-opp-count-tw").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.employee_dashboard.employee_dashboard.get_closure_opp_count_tw",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					$("#closure-opp-count-tw").text(r.message);
				}
			}
		});
	}

	get_closure_opp_amount_tw(sales_person = null) {
		$("#closure-opp-amount-tw").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.employee_dashboard.employee_dashboard.get_closure_opp_amount_tw",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					let formatted_price = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(r.message);
					$("#closure-opp-amount-tw").text(formatted_price);
				}
			}
		});
	}

	get_closure_opp_count_tm(sales_person = null) {
		$("#closure-opp-count-tm").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.employee_dashboard.employee_dashboard.get_closure_opp_count_tm",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					$("#closure-opp-count-tm").text(r.message);
				}
			}
		});
	}

	get_closure_opp_amount_tm(sales_person = null) {
		$("#closure-opp-amount-tm").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.employee_dashboard.employee_dashboard.get_closure_opp_amount_tm",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					let formatted_price = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(r.message);
					$("#closure-opp-amount-tm").text(formatted_price);
				}
			}
		});
	}

	//target Dashboard

	target_chart(sales_person = null) {
		//console.log("bar chart", sales_person)
		setTimeout(() => {
			frappe.call({
				method: "renewal_module.custom_module.page.employee_dashboard.target_data.get_target_data1", // Replace with your API method
				args: { sales_person: sales_person },
				callback: function (r) {
					//console.log("r", r);
					if (r.message) {
						//console.log("amount", r.message.amounts)
						//console.log("count", r.message.counts)
						let chartElement = document.getElementById("target-overview");
						let options = {
							colors: ["#5BA6FE", "#6AD49A", "#F35D81"],
							series: [
								{ name: "Sales", data: r.message.amounts.map(val => val || 0), type: "bar" }, // Ensure no null/undefined
								{ name: "Count", data: r.message.counts.map(val => val || 0), type: "bar" }, // Ensure no null/undefined
								{ name: "Sale", data: r.message.amounts.map(val => val || 0), type: "bar" }
							],

							chart: { type: "bar", height: 255, toolbar: { show: false } },
							dataLabels: { enabled: false },
							plotOptions: { bar: { borderRadius: 8, columnWidth: "60%" } },
							legend: { show: false },
							xaxis: {
								categories: r.message.months, // Dynamic months
								axisBorder: { show: false },
								axisTicks: { show: false },
								labels: {
									rotate: 0, // Prevent rotation
									hideOverlappingLabels: true, // ✅ Skip labels if needed
									showDuplicates: false, // ✅ Prevent repeated labels
									style: { fontSize: "12px" }
								}
							},
							grid: { padding: { left: 0, right: 0, top: 0, bottom: -10 } },
							yaxis: [
								{
									//labels: { show: false }
									//title: { text: "Sales (Amount)" },
									//labels: { formatter: (val) => val.toLocaleString() }
								},
								{
									opposite: true, // Places second y-axis on the right
									//title: { text: "Opportunities (Count)" },
									//labels: { formatter: (val) => Math.round(val) }
									labels: { show: false }
								}
							]

						};

						// let chart = new ApexCharts(chartElement, options);
						// chart.render();

						// Destroy the previous chart if it exists
						if (window.targetChart) {
							window.targetChart.destroy();
						}

						// Render new chart
						window.targetChart = new ApexCharts(chartElement, options);
						window.targetChart.render();
					}
				}
			});
		}, 500);
	}

	get_sales_target_tm(sales_person = null) {
		setTimeout(() => {
			frappe.call({
				method: "renewal_module.custom_module.page.employee_dashboard.target_data.get_sales_target_tm",
				args: { sales_person: sales_person },
				callback: function (response) {
					if (response.message) {
						let bottomline_target_tm = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(response.message.bottomline_target);
						let topline_target_tm = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(response.message.topline_target);
						let variable_amount_tm = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(response.message.target_qty);

						document.getElementById("target-amount-tm").innerHTML = bottomline_target_tm;
						document.getElementById("achieved-amount-tm").innerHTML = topline_target_tm;
						document.getElementById("variable-amount-tm").innerHTML = variable_amount_tm;
					}
				}
			});
		})
	}


	get_sales_target_tq(sales_person = null) {
		setTimeout(() => {
			frappe.call({
				method: "renewal_module.custom_module.page.employee_dashboard.target_data.get_sales_target_tq",
				args: { sales_person: sales_person },
				callback: function (response) {
					if (response.message) {
						let bottomline_target_tq = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(response.message.bottomline_target);
						let topline_target_tq = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(response.message.topline_target);
						let variable_amount_tq = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(response.message.target_qty);

						document.getElementById("target-amount-tq").innerHTML = bottomline_target_tq;
						document.getElementById("achieved-amount-tq").innerHTML = topline_target_tq;
						document.getElementById("variable-amount-tq").innerHTML = variable_amount_tq;
					}
				}
			});
		})
	}

	get_sales_target_ty(sales_person = null) {
		setTimeout(() => {
			frappe.call({
				method: "renewal_module.custom_module.page.employee_dashboard.target_data.get_sales_target_ty",
				args: { sales_person: sales_person },
				callback: function (response) {
					if (response.message) {
						let bottomline_target_ty = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(response.message.bottomline_target);
						let topline_target_ty = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(response.message.topline_target);
						let variable_amount_ty = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(response.message.target_qty);

						document.getElementById("target-amount-ty").innerHTML = bottomline_target_ty;
						document.getElementById("achieved-amount-ty").innerHTML = topline_target_ty;
						document.getElementById("variable-amount-ty").innerHTML = variable_amount_ty;
					}
				}
			});
		})
	}

	//new 

	target_category_wise_chart(sales_person = null) {
		setTimeout(() => {
			frappe.call({
				method: "renewal_module.custom_module.page.employee_dashboard.target_data.target_category_wise_chart",
				args: { sales_person: sales_person },
				callback: function (r) {
					if (r.message) {
						//console.log("message", r.message);
						let chartElement = document.getElementById("target-category-wise-overview");
						let options = {
							colors: ["#5BA6FE", "#6AD49A", "#F35D81"],
							series: [
								{ name: "Target Amount", data: r.message.target_amount, type: "bar" },
								{ name: "Topline Amount", data: r.message.topline_target, type: "bar" },
								{ name: "Bottomline Amount", data: r.message.bottomline_target, type: "bar" },
							],
							chart: {
								type: "bar",
								height: 255,
								toolbar: { show: false },
								events: {
									click: function (event, chartContext, config) {
										const dataPointIndex = config.dataPointIndex;
										if (dataPointIndex !== -1) {
											const category = r.message.categories[dataPointIndex];
											const sales_person = document.getElementById("sales-person-dropdown")?.value || "";

											// Helper function to build and open the report URL
											const openReport = (filterType) => {
												let url = "/app/query-report/Sales%20Target%20Month%20Target";
												const params = [];

												if (filterType === "brand") {
													params.push(`brand=${encodeURIComponent(category)}`);
												} else if (filterType === "item_group") {
													params.push(`item_group=${encodeURIComponent(category)}`);
												}

												if (sales_person) {
													params.push(`sales_person=${encodeURIComponent(sales_person)}`);
												}

												if (params.length) {
													url += "?" + params.join("&");
												}

												window.open(url, "_blank");
											};

											// First check if category exists in Brand
											frappe.call({
												method: "frappe.client.get_list",
												args: {
													doctype: "Brand",
													filters: { name: category },
													limit_page_length: 1
												},
												callback: function (brandRes) {
													if (brandRes.message && brandRes.message.length > 0) {
														openReport("brand");
													} else {
														// Check if it exists in Item Group
														frappe.call({
															method: "frappe.client.get_list",
															args: {
																doctype: "Item Group",
																filters: { name: category },
																limit_page_length: 1
															},
															callback: function (itemGroupRes) {
																if (itemGroupRes.message && itemGroupRes.message.length > 0) {
																	openReport("item_group");
																} else {
																	// Category not found in either — just open report with salesperson
																	openReport(null);
																}
															}
														});
													}
												}
											});
										}
									}
								}
							},
							dataLabels: { enabled: false },
							plotOptions: { bar: { borderRadius: 4, columnWidth: "45%" } },
							legend: { show: false },
							xaxis: {
								categories: r.message.categories,  // X-axis is now category type
								axisBorder: { show: false },
								axisTicks: { show: false },
								labels: {
									rotate: 0,
									hideOverlappingLabels: true,
									showDuplicates: false,
									style: { fontSize: "12px" }
								}
							},
							grid: { padding: { left: 0, right: 0, top: 0, bottom: -10 } },
							// yaxis: [
							// 	{ opposite: true, labels: { show: false } },
							// 	{ show: false }
							// ]
						};

						if (window.targetCategoryWiseChart) {
							window.targetCategoryWiseChart.destroy();
						}
						window.targetCategoryWiseChart = new ApexCharts(chartElement, options);
						window.targetCategoryWiseChart.render();
					}
				}
			});
		}, 500);
	}



	get_sales_target_category_tm(sales_person = null) {
		setTimeout(() => {
			frappe.call({
				method: "renewal_module.custom_module.page.employee_dashboard.target_data.get_sales_target_category_tm",
				args: { sales_person: sales_person },
				callback: function (response) {
					if (response.message) {
						let tableBody = document.querySelector("#sales-target-table tbody");
						tableBody.innerHTML = ""; // Clear previous rows

						response.message.forEach((row) => {
							let topline_target_tm = row.topline_target;
							let target_amount_tm = row.target_amount;

							// Format amounts as currency (INR)
							let formatted_target_amount = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(target_amount_tm);
							let formatted_topline_target = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(topline_target_tm);
							let formatted_variance = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(target_amount_tm - topline_target_tm);

							// Calculate achieved percentage
							let achieved_percentage = (topline_target_tm / target_amount_tm) * 100;
							let achieved_color = "red"; // Default color

							if (achieved_percentage >= 0 && achieved_percentage < 50) {
								achieved_color = "#FF0000"; // Red
							} else if (achieved_percentage >= 50 && achieved_percentage < 60) {
								achieved_color = "#FFA500"; // Orange
							} else if (achieved_percentage >= 60 && achieved_percentage < 80) {
								achieved_color = "#0000FF"; // Blue
							} else if (achieved_percentage >= 80 && achieved_percentage < 100) {
								achieved_color = "#4CAF50"; // Green
							} else if (achieved_percentage >= 100) {
								achieved_color = "#FFD700"; // Gold
							}

							// Append new row dynamically
							let newRow = `<tr>
								<td class="ellipsis">${row.category}</td>
								<td class="ellipsis" style="color: blue;">${formatted_topline_target}</td>
								<td class="ellipsis" style="color: ${achieved_color};">${formatted_target_amount}</td>
								<td class="ellipsis" style="color: red;">${formatted_variance}</td>
							</tr>`;

							tableBody.innerHTML += newRow;
						});
					}
				}
			});
		});
	}

	get_sales_target_category_bt_tm(sales_person = null) {
		setTimeout(() => {
			frappe.call({
				method: "renewal_module.custom_module.page.employee_dashboard.target_data.get_sales_target_category_bt_tm",
				args: { sales_person: sales_person },
				callback: function (response) {
					if (response.message) {
						let tableBody = document.querySelector("#sales-target-bt-table tbody");
						tableBody.innerHTML = ""; // Clear previous rows

						response.message.forEach((row) => {
							let bottomline_target_tm = row.bottomline_target;
							let target_amount_tm = row.target_amount;

							// Format amounts as currency (INR)
							let formatted_target_amount = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(target_amount_tm);
							let formatted_bottomline_target = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(bottomline_target_tm);
							let formatted_variance = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(target_amount_tm - bottomline_target_tm);

							// Calculate achieved percentage
							let achieved_percentage = (bottomline_target_tm / target_amount_tm) * 100;
							let achieved_color = "red"; // Default color

							if (achieved_percentage >= 0 && achieved_percentage < 50) {
								achieved_color = "#FF0000"; // Red
							} else if (achieved_percentage >= 50 && achieved_percentage < 60) {
								achieved_color = "#FFA500"; // Orange
							} else if (achieved_percentage >= 60 && achieved_percentage < 80) {
								achieved_color = "#0000FF"; // Blue
							} else if (achieved_percentage >= 80 && achieved_percentage < 100) {
								achieved_color = "#4CAF50"; // Green
							} else if (achieved_percentage >= 100) {
								achieved_color = "#FFD700"; // Gold
							}

							// Append new row dynamically
							let newRow = `<tr>
								<td class="ellipsis">${row.category}</td>
								<td class="ellipsis" style="color: blue;">${formatted_bottomline_target}</td>
								<td class="ellipsis" style="color: ${achieved_color};">${formatted_target_amount}</td>
								<td class="ellipsis" style="color: red;">${formatted_variance}</td>
							</tr>`;

							tableBody.innerHTML += newRow;
						});
					}
				}
			});
		});
	}

	//sales target dashboard

	//new target dashboard

	formatShortNumber(input) {
		const num = Number(input); // Convert string to number

		if (isNaN(num) || num === 0) return "0";

		if (num >= 1_000_000_000) {
			return "₹" + (num / 1_000_000_000).toFixed(2).replace(/\.00$/, '') + 'B';
		} else if (num >= 1_000_000) {
			return "₹" + (num / 1_000_000).toFixed(2).replace(/\.00$/, '') + 'M';
		} else if (num >= 1_000) {
			return "₹" + (num / 1_000).toFixed(2).replace(/\.00$/, '') + 'K';
		} else {
			return num.toString();
		}
	}


	get_sales_target(sales_person = null) {
		setTimeout(() => {
			frappe.call({
				method: "renewal_module.custom_module.page.employee_dashboard.target_data.get_sales_target",
				args: { sales_person: sales_person },
				callback: (response) => {
					if (response.message) {
						let bottomline_target = Number(response.message.bottomline_target || 0);
						let topline_target = Number(response.message.topline_target || 0);
						let variable_amount = Number(response.message.target_qty || 0);
						//console.log("Raw Targets:", bottomline_target, topline_target, variable_amount);

						let formatted_bottomline_target = this.formatShortNumber(bottomline_target);
						let formatted_topline_target = this.formatShortNumber(topline_target);
						let formatted_variable_amount = this.formatShortNumber(variable_amount);
						//console.log("Formatted:", formatted_bottomline_target, formatted_topline_target, formatted_variable_amount);

						// Calculate achieved percentage
						//let achieved_percentage = (topline_target_tm / bottomline_target_tm) * 100;
						let achieved_percentage = (response.message.topline_target / response.message.bottomline_target) * 100;
						// Set colors based on conditions
						let achieved_color = "red"; // Default color
						if (achieved_percentage >= 0 && achieved_percentage < 50) {
							achieved_color = '#FF0000'; // Red
						} else if (achieved_percentage >= 50 && achieved_percentage < 60) {
							achieved_color = '#FFA500'; // Orange
						} else if (achieved_percentage >= 60 && achieved_percentage < 80) {
							achieved_color = '#0000FF'; // Blue
						} else if (achieved_percentage >= 80 && achieved_percentage < 100) {
							achieved_color = '#4CAF50'; // Green
						} else if (achieved_percentage >= 100) {
							achieved_color = '#FFD700'; // Gold
						}

						// Apply styles
						document.getElementById("target-amount").innerHTML = formatted_bottomline_target;
						document.getElementById("target-amount").style.color = "blue";
						document.getElementById("achieved-amount").innerHTML = formatted_topline_target;
						document.getElementById("achieved-amount").style.color = achieved_color;
						document.getElementById("variable-amount").innerHTML = formatted_variable_amount;
						document.getElementById("variable-amount").style.color = "red"; // Variance always red
					}
				}
			});
		});
	}

	sales_target_chart(sales_person = null) {
		setTimeout(() => {
			frappe.call({
				method: "renewal_module.custom_module.page.employee_dashboard.target_data.get_sales_target_data",
				args: { sales_person: sales_person },
				callback: function (r) {
					if (r.message && Array.isArray(r.message)) {
						//console.log("message", r.message);

						let months = [];
						let bottomline_target = [];
						let achieved = [];
						let variance = [];

						r.message.forEach((row) => {
							months.push(row.Month);
							bottomline_target.push(row["Bottomline Target"] || 0);
							achieved.push(row["Achieved"] || 0);
							variance.push(row["Variance"] || 0);
						});

						var chartElement = document.getElementById("sales-target-overview");
						var options = {
							colors: ["#5BA6FE", "#6AD49A", "#F35D81"],
							series: [
								{ name: "Bottomline Target", data: bottomline_target, type: "bar" },
								{ name: "Achieved", data: achieved, type: "bar" },
								{ name: "Variance", data: variance, type: "bar" },
							],
							chart: { type: "bar", height: 200, toolbar: { show: false }, horizontal: false },
							dataLabels: { enabled: false },
							plotOptions: { bar: { borderRadius: 4, columnWidth: "45%" } },
							legend: { show: false },
							xaxis: {
								categories: months,
								axisBorder: { show: false },
								axisTicks: { show: false },
								labels: {
									rotate: 0,
									hideOverlappingLabels: true,
									showDuplicates: false,
									style: { fontSize: "12px" }
								}
							},
							grid: { padding: { left: 0, right: 0, top: 0, bottom: -10 } },
							yaxis: [
								{},
								{ opposite: true, labels: { show: false } },
								{ show: false }
							]
						};

						if (window.salestargetChart) {
							window.salestargetChart.destroy();
						}
						window.salestargetChart = new ApexCharts(chartElement, options);
						window.salestargetChart.render();
					}
				}
			});
		}, 500);
	}

	get_sales_target_tm(sales_person = null) {
		setTimeout(() => {
			frappe.call({
				method: "renewal_module.custom_module.page.employee_dashboard.target_data.get_sales_target_tm",
				args: { sales_person: sales_person },
				callback: (response) => {
					if (response.message) {
						let bottomline_target_tm = Number(response.message.bottomline_target);
						let topline_target_tm = Number(response.message.topline_target);
						let variable_amount_tm = Number(response.message.target_qty);
						// Format amounts as currency (INR)
						let formatted_bottomline_target = this.formatShortNumber(bottomline_target_tm);
						let formatted_topline_target = this.formatShortNumber(topline_target_tm);
						let formatted_variable_amount = this.formatShortNumber(variable_amount_tm);
						// Calculate achieved percentage
						//let achieved_percentage = (topline_target_tm / bottomline_target_tm) * 100;
						let achieved_percentage = (response.message.topline_target / response.message.bottomline_target) * 100;
						// Set colors based on conditions
						let achieved_color = "red"; // Default color
						if (achieved_percentage >= 0 && achieved_percentage < 50) {
							achieved_color = '#FF0000'; // Red
						} else if (achieved_percentage >= 50 && achieved_percentage < 60) {
							achieved_color = '#FFA500'; // Orange
						} else if (achieved_percentage >= 60 && achieved_percentage < 80) {
							achieved_color = '#0000FF'; // Blue
						} else if (achieved_percentage >= 80 && achieved_percentage < 100) {
							achieved_color = '#4CAF50'; // Green
						} else if (achieved_percentage >= 100) {
							achieved_color = '#FFD700'; // Gold
						}

						// Apply styles
						document.getElementById("target-amount-tm").innerHTML = formatted_bottomline_target;
						document.getElementById("target-amount-tm").style.color = "blue";
						document.getElementById("achieved-amount-tm").innerHTML = formatted_topline_target;
						document.getElementById("achieved-amount-tm").style.color = achieved_color;
						document.getElementById("variable-amount-tm").innerHTML = formatted_variable_amount;
						document.getElementById("variable-amount-tm").style.color = "red"; // Variance always red
					}
				}
			});
		})
	}


	get_sales_target_tq(sales_person = null) {
		setTimeout(() => {
			frappe.call({
				method: "renewal_module.custom_module.page.employee_dashboard.target_data.get_sales_target_tq",
				args: { sales_person: sales_person },
				callback: (response) => {
					if (response.message) {
						let bottomline_target_tq = Number(response.message.bottomline_target);
						let topline_target_tq = Number(response.message.topline_target);
						let variable_amount_tq = Number(response.message.target_qty);

						let formatted_bottomline_target_tq = this.formatShortNumber(bottomline_target_tq);
						let formatted_topline_target_tq = this.formatShortNumber(topline_target_tq);
						let formatted_variable_amount_tq = this.formatShortNumber(variable_amount_tq);
						// Calculate achieved percentage
						let achieved_percentage = (response.message.topline_target / response.message.bottomline_target) * 100;
						let achieved_color = "red"; // Default color
						if (achieved_percentage >= 0 && achieved_percentage < 50) {
							achieved_color = '#FF0000'; // Red
						} else if (achieved_percentage >= 50 && achieved_percentage < 60) {
							achieved_color = '#FFA500'; // Orange
						} else if (achieved_percentage >= 60 && achieved_percentage < 80) {
							achieved_color = '#0000FF'; // Blue
						} else if (achieved_percentage >= 80 && achieved_percentage < 100) {
							achieved_color = '#4CAF50'; // Green
						} else if (achieved_percentage >= 100) {
							achieved_color = '#FFD700'; // Gold
						}

						document.getElementById("target-amount-tq").innerHTML = formatted_bottomline_target_tq;
						document.getElementById("target-amount-tq").style.color = "blue";
						document.getElementById("achieved-amount-tq").innerHTML = formatted_topline_target_tq;
						document.getElementById("achieved-amount-tq").style.color = achieved_color;
						document.getElementById("variable-amount-tq").innerHTML = formatted_variable_amount_tq;
						document.getElementById("variable-amount-tq").style.color = "red";
					}
				}
			});
		})
	}

	get_sales_target_ty(sales_person = null) {
		setTimeout(() => {
			frappe.call({
				method: "renewal_module.custom_module.page.employee_dashboard.target_data.get_sales_target_ty",
				args: { sales_person: sales_person },
				callback: (response) => {
					if (response.message) {
						let bottomline_target_ty = Number(response.message.bottomline_target);
						let topline_target_ty = Number(response.message.topline_target);
						let variable_amount_ty = Number(response.message.target_qty);

						let formatted_bottomline_target_ty = this.formatShortNumber(bottomline_target_ty);
						let formatted_topline_target_ty = this.formatShortNumber(topline_target_ty);
						let formatted_variable_amount_ty = this.formatShortNumber(variable_amount_ty);

						// Calculate achieved percentage
						let achieved_percentage = (response.message.topline_target / response.message.bottomline_target) * 100;
						let achieved_color = "red"; // Default color
						if (achieved_percentage >= 0 && achieved_percentage < 50) {
							achieved_color = '#FF0000'; // Red
						} else if (achieved_percentage >= 50 && achieved_percentage < 60) {
							achieved_color = '#FFA500'; // Orange
						} else if (achieved_percentage >= 60 && achieved_percentage < 80) {
							achieved_color = '#0000FF'; // Blue
						} else if (achieved_percentage >= 80 && achieved_percentage < 100) {
							achieved_color = '#4CAF50'; // Green
						} else if (achieved_percentage >= 100) {
							achieved_color = '#FFD700'; // Gold
						}
						document.getElementById("target-amount-ty").innerHTML = formatted_bottomline_target_ty;
						document.getElementById("target-amount-ty").style.color = "blue";
						document.getElementById("achieved-amount-ty").innerHTML = formatted_topline_target_ty;
						document.getElementById("achieved-amount-ty").style.color = achieved_color;
						document.getElementById("variable-amount-ty").innerHTML = formatted_variable_amount_ty;
						document.getElementById("variable-amount-ty").style.color = "red";
					}
				}
			});
		})
	}

}

frappe.customer_app_page = {
	body: `

		<div class="tab-content">
			<div class="tab-pane fade show active" id="opp-content" role="tabpanel" aria-labelledby="opp-tab">
				<div class="mb-4 text-center">
					<button class="btn btn-sm title1" style="background-color:blue;color:white;font-weight:bold;">Opportunity Dashboard</button>
				</div>

				<div class="row d-flex align-items-stretch h-100 h-lg-100">
					<div class="col-12 col-md-6 col-lg-5">
						<div class="card1 card1-flush w-100">
							<div class="card1-header">
								<div class="card1-title d-flex flex-column">
									<span class="text-gray-500 pt-1 fw-semibold fs-6"><a href="https://dev.64network.com/app/query-report/Opportunity%20Report?company=64+Network+Security+Pvt+Ltd+-+TG&timespan=last+week&from_date=2023-04-01&to_date=2024-03-31&group_by=Brand&based_on=Expected+Date&sales_stage=%5B%22Closed+Won%22%5D&user=Administrator" target="_blank">Brand Wise Sales</a></span>
								</div>
							</div>
							<div class="card1-body" style="height:auto">
								<div class="brand-chart-wrapper">
									<div id="brand_donut_chart" data-kt-size="250" data-kt-line="18"></div>
									<div id="brand_legend" class="brand-legend"></div>
								</div>
								<div id="legend-modal-brand" class="legend-modal">
									<div class="legend-modal-content">
										<span class="legend-close">&times;</span>
										<h6 class="mb-3">Brands</h6>
										<div id="legend-modal-brand-body"></div>
									</div>
								</div>
							</div>
						</div>
					</div>
					<div class="col-12 col-md-6 col-lg-5">
						<div class="card1 card1-flush w-100">
							<div class="card1-header">
								<div class="card1-title d-flex flex-column">
									<span class="text-gray-500 pt-1 fw-semibold fs-6"><a href="https://dev.64network.com/app/query-report/Opportunity%20Report?company=64+Network+Security+Pvt+Ltd+-+TG&timespan=last+week&from_date=2023-04-01&to_date=2024-03-31&group_by=Opportunity&based_on=Expected+Date&sales_stage=%5B%22Closed+Won%22%5D&user=Administrator" target="_blank">Item Group Wise Sales</a></span>
								</div>
							</div>
							<div class="card1-body" style="height:auto">
								<div class="item-group-chart-wrapper">
									<div id="item_group_donut_chart" data-kt-size="250" data-kt-line="18"></div>
									<div id="item_group_legend" class="item-group-legend"></div>
								</div>
							</div>
						</div>
					</div>
					<div class="col-12 col-md-12 col-lg-2">
						<div class="row">
							<div class="col-6 col-md-4 col-lg-12 mb-2 mt-2">
								<div class="widget number-widget-box" data-widget-name="Opp Count(TM)">
									<div class="widget-head">
										<div class="widget-label">
											<div class="widget-title">
												<span class="ellipsis" title="Opp Count(TM)">
													<a href="#" target="_blank">
													Opp Count(TM)
													</a>
												</span>
											</div>
										</div>
									</div>
									<div class="widget-body">
										<div class="widget-content">
											<div class="number ellipsis blue" id="opp-count-tm">0</div>
										</div>
									</div>
								</div>
							</div>	
						
							<div class="col-6 col-md-4 col-lg-12 mb-2 mt-2">
								<div class="widget number-widget-box" data-widget-name="Closed Won(TM)">
									<div class="widget-head">
										<div class="widget-label">
											<div class="widget-title">
												<span class="ellipsis" title="Closed Won(TM)">
													<a href="/app/sales-funnel">
													Closed Won (TM)
													</a>
												</span>
											</div>
										</div>
									</div>
									<div class="widget-body">
										<div class="widget-content">
											<div class="number green ellipsis" id="closed-amount-tm">₹0</div>
										</div>
									</div>
								</div>
							</div>	

							<div class="col-12 col-md-4 col-lg-12 mb-2 mt-2">
								<div class="widget number-widget-box" data-widget-name="Closed Lost(TM)">
									<div class="widget-head">
										<div class="widget-label">
											<div class="widget-title">
												<span class="ellipsis" title="Closed Lost(TM)">
												<a href="/app/sales-funnel">
													Closed Lost(TM)
												</a>	
												</span>
											</div>
										</div>
										
									</div>
									<div class="widget-body">
										<div class="widget-content">
											<div class="number ellipsis red" id="lost-amount-tm">₹ 0.00</div>
										</div>
									</div>
								</div>
							</div>
						</div>	
					</div>
				</div>
				
				
				<div class="row mt-5">
					<div class="col-12 col-md-4 col-lg-4">
						<div class="card1 card1-flush w-100">
							<div class="row">
								<div class="col-6 col-md-6 col-lg-6">
									<div class="row mb-2 ms-1 mt-2 me-1">
										<div class="widget number-widget-box" data-widget-name="Opp Count(Lw)">
											<div class="widget-head">
												<div class="widget-label">
													<div class="widget-title">
														<span class="ellipsis" title="Opp Count(Lw)">
															<a href="https://dev.64network.com/app/query-report/Opportunity%20Report?company=64+Network+Security+Pvt+Ltd+-+TG&timespan=last+week&from_date=2023-04-01&to_date=2024-03-31&group_by=Opportunity&based_on=Creation&user=Administrator" target="_blank">
															Opp Count(Lw)
															</a>
														</span>
													</div>
												</div>
												
											</div>
											<div class="widget-body">
												<div class="widget-content">
													<div class="number ellipsis blue" id="opp-count">0</div>
													
												</div>
											</div>
										</div>
									</div>

									<div class="row mb-2 ms-1 mt-1 me-1">
										<div class="widget number-widget-box" data-widget-name="Closed Won(Lw)">
											<div class="widget-head">
												<div class="widget-label">
													<div class="widget-title">
														<span class="ellipsis" title="Closed Won(Lw)">
															<a href="https://dev.64network.com/app/query-report/Opportunity%20Report?company=64+Network+Security+Pvt+Ltd+-+TG&timespan=last+week&from_date=2023-04-01&to_date=2024-03-31&group_by=Opportunity&based_on=Expected+Date&sales_stage=%5B%22Closed+Won%22%5D&user=Administrator" target="_blank">
															Closed Won (Lw)
															</a>
														</span>
													</div>
												</div>
												
											</div>
											<div class="widget-body">
												<div class="widget-content">
													<div class="number green ellipsis" id="closed-amount">₹0</div>
												</div>
											</div>
										</div>
									</div>

								</div>

								<div class="col-6 col-md-6 col-lg-6">
									<div class="row mb-2 mt-2 me-1">
										<div class="widget number-widget-box" data-widget-name="Renewal Count(Lw)">
											<div class="widget-head">
												<div class="widget-label">
													<div class="widget-title">
														<span class="ellipsis" title="Renewal Count(Lw)">
														<a href="https://dev.64network.com/app/query-report/Opportunity%20Report?company=64+Network+Security+Pvt+Ltd+-+TG&timespan=last+week&from_date=2023-04-01&to_date=2024-03-31&group_by=Brand&based_on=Expected+Date&sales_stage=%5B%22Closed+Won%22%5D&user=Administrator" target="_blank">
															Renewal Count(Lw)
														</a>	
														</span>
													</div>
												</div>
												
											</div>
											<div class="widget-body">
												<div class="widget-content">
													<div class="number ellipsis blue" id="renewal-count">0</div>
												</div>
											</div>
										</div>
									</div>
									<div class="row mb-2 mt-2 me-1">
										<div class="widget number-widget-box" data-widget-name="Renewal Amount(Lw)">
											<div class="widget-head">
												<div class="widget-label">
													<div class="widget-title">
														<span class="ellipsis" title="Renewal Amount(Lw)">
														<a href="https://dev.64network.com/app/query-report/Renewals%20Analytics?company=64+Network+Security+Pvt+Ltd+-+TG&timespan=last+week&from_date=2023-04-01&to_date=2024-03-31&based_on=End+Date&group_by=Renewals" target="_blank">
															Renewal Amount(Lw)
														</a>	
														</span>
													</div>
												</div>
												
											</div>
											<div class="widget-body">
												<div class="widget-content">
													<div class="number ellipsis blue" id="renewal-amount">₹ 0.00</div>
												</div>
											</div>
										</div>
									</div>
								</div>
							</div>
						</div>	
						<div class="row mt-1">
							<div class="col-lg-6 col-md-12 col-sm-12">
								<div class="widget number-widget-box" data-widget-name="Closed Lost(Lw)">
									<div class="widget-head">
										<div class="widget-label">
											<div class="widget-title">
												<span class="ellipsis" title="Closed Lost(Lw)">
												<a href="https://dev.64network.com/app/query-report/Opportunity%20Report?company=64+Network+Security+Pvt+Ltd+-+TG&timespan=last+week&from_date=2023-04-01&to_date=2024-03-31&group_by=Opportunity&based_on=Expected+Date&sales_stage=%5B%22Closed+Lost%22%5D&user=Administrator" target="_blank">
													Closed Lost(Lw)
												</a>	
												</span>
											</div>
										</div>
										
									</div>
									<div class="widget-body">
										<div class="widget-content">
											<div class="number ellipsis red" id="lost-amount">₹ 0.00</div>
										</div>
									</div>
								</div>
							</div>	
						</div>
					</div>
					
					<div class="col-12 col-md-8 col-lg-8">
						<div class="card1 card1-flush h-lg-100 h-100" style="background-color:white">
							<div class="card1-header mb-1">
								<h3 class="card1-title align-items-start flex-column">
									<span class="card1-label fw-bold text-gray-800"><a href="https://dev.64network.com/app/query-report/Opportunity%20Report?company=64+Network+Security+Pvt+Ltd+-+TG&timespan=last+week&from_date=2023-04-01&to_date=2024-03-31&group_by=Opportunity&based_on=Expected+Date&user=Administrator" target="_blank">Sales Funnel</a></span>
								</h3>
							</div>
							<div class="card1-body">                 
								<div id="kt_charts_widget_6"></div>       
							</div>
						
						</div>
					</div>

				</div>

				


				<div class="row mt-5">
					<div class="title">Closures</div>
					<div class="col-12 col-md-6 col-lg-6">
						<div class="title1">This Week</div>
						<div class="row">
							<div class="col-6 mb-2">
								<div class="widget number-widget-box" data-widget-name="Opp Count(Tw)">
									<div class="widget-head">
										<div class="widget-label">
											<div class="widget-title">
												<span class="ellipsis" title="Opp Count(Tw)">
													<a href="https://dev.64network.com/app/query-report/Opportunity%20Report?company=64+Network+Security+Pvt+Ltd+-+TG&timespan=this+week&from_date=2023-04-01&to_date=2024-03-31&group_by=Opportunity&based_on=Expected+Date&user=Administrator" target="_blank">
													Opp Count(Tw)
													</a>
												</span>
											</div>
										</div>
									</div>
									<div class="widget-body">
										<div class="widget-content">
											<div class="number blue ellipsis" id="closure-opp-count-tw">0</div>
										</div>
									</div>
								</div>
							</div>
							<div class="col-6 mb-2">
								<div class="widget number-widget-box" data-widget-name="Opp Amount(Tw)">
									<div class="widget-head">
										<div class="widget-label">
											<div class="widget-title">
												<span class="ellipsis" title="Opp Amount(Tw)">
													<a href="https://dev.64network.com/app/query-report/Opportunity%20Report?company=64+Network+Security+Pvt+Ltd+-+TG&timespan=this+week&from_date=2023-04-01&to_date=2024-03-31&group_by=Opportunity&based_on=Expected+Date&user=Administrator" target="_blank">
													Opp Amount(Tw)
													</a>
												</span>
											</div>
										</div>
									</div>
									<div class="widget-body">
										<div class="widget-content">
											<div class="number blue ellipsis" id="closure-opp-amount-tw">0</div>
										</div>
									</div>
								</div>
							</div>	
						</div>
						<div class="row">
							<div class="col-6 mb-2">
								<div class="widget number-widget-box" data-widget-name="Rnwl Count(Tw)">
									<div class="widget-head">
										<div class="widget-label">
											<div class="widget-title">
												<span class="ellipsis" title="Rnwl Count(Tw)">
													<a href="http://192.168.23.185:8000/app/query-report/Opportunity%20Report?company=64+Network+Security+Pvt+Ltd+-+TG&timespan=this+week&from_date=2023-04-01&to_date=2024-03-31&group_by=Opportunity&based_on=Expected+Date&forecast=Include&opportunity_type=Renewal&user=Administrator" target="_blank">
													Rnwl Count(Tw)
													</a>
												</span>
											</div>
										</div>
									</div>
									<div class="widget-body">
										<div class="widget-content">
											<div class="number blue ellipsis" id="rnwls-count-tw">0</div>
										</div>
									</div>
								</div>
							</div>
							<div class="col-6 mb-2">
								<div class="widget number-widget-box" data-widget-name="Rnwl Amount(Tw)">
									<div class="widget-head">
										<div class="widget-label">
											<div class="widget-title">
												<span class="ellipsis" title="Rnwl Amount(Tw)">
													<a href="http://192.168.23.185:8000/app/query-report/Opportunity%20Report?company=64+Network+Security+Pvt+Ltd+-+TG&timespan=this+week&from_date=2023-04-01&to_date=2024-03-31&group_by=Opportunity&based_on=Expected+Date&forecast=Include&opportunity_type=Renewal&user=Administrator" target="_blank">
													Rnwl Amount(Tw)
													</a>
												</span>
											</div>
										</div>
									</div>
									<div class="widget-body">
										<div class="widget-content">
											<div class="number green ellipsis" id="rnwls-amount-tw">0</div>
										</div>
									</div>
								</div>
							</div>
						</div>
					</div>
					<div class="col-12 col-md-6 col-lg-6">
						<div class="title1">This Month</div>
						<div class="row">
							<div class="col-6 mb-2">
								<div class="widget number-widget-box" data-widget-name="Opp Count(TM)">
									<div class="widget-head">
										<div class="widget-label">
											<div class="widget-title">
												<span class="ellipsis" title="Opp Count(TM)">
													<a href="#">
													Opp Count(TM)
													</a>
												</span>
											</div>
										</div>
									</div>
									<div class="widget-body">
										<div class="widget-content">
											<div class="number blue ellipsis" id="closure-opp-count-tm">0</div>
										</div>
									</div>
								</div>
							</div>
							<div class="col-6 mb-2">
								<div class="widget number-widget-box" data-widget-name="Opp Amount(TM)">
									<div class="widget-head">
										<div class="widget-label">
											<div class="widget-title">
												<span class="ellipsis" title="Opp Amount(TM)">
													<a href="#">
													Opp Amount(TM)
													</a>
												</span>
											</div>
										</div>
									</div>
									<div class="widget-body">
										<div class="widget-content">
											<div class="number blue ellipsis" id="closure-opp-amount-tm">0</div>
										</div>
									</div>
								</div>
							</div>	
						</div>
							
						<div class="row">
							<div class="col-6 mb-2">
								<div class="widget number-widget-box" data-widget-name="Rnwl Count(TM)">
									<div class="widget-head">
										<div class="widget-label">
											<div class="widget-title">
												<span class="ellipsis" title="Rnwl Count(TM)">
													<a href="#">
													Rnwl Count(TM)
													</a>
												</span>
											</div>
										</div>
									</div>
									<div class="widget-body">
										<div class="widget-content">
											<div class="number blue ellipsis" id="rnwls-count-tm">0</div>
										</div>
									</div>
								</div>
							</div>
							<div class="col-6 mb-2">
								<div class="widget number-widget-box" data-widget-name="Rnwl Amount(TM)">
									<div class="widget-head">
										<div class="widget-label">
											<div class="widget-title">
												<span class="ellipsis" title="Rnwl Amount(TM)">
													<a href="#">
													Rnwl Amount(TM)
													</a>
												</span>
											</div>
										</div>
									</div>
									<div class="widget-body">
										<div class="widget-content">
											<div class="number green ellipsis" id="rnwls-amount-tm">0</div>
										</div>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>

				<div class="row">
					<div class="col-12 col-md-6 col-lg-6">
						<div class="card1 card1-flush w-100 h-lg-100 h-100">
							<div class="card1-header">
								<div class="card1-title d-flex flex-column">
									<span class="text-gray-500 pt-1 fw-semibold fs-6"><a href="https://dev.64network.com/app/query-report/Opportunity%20Report?company=64+Network+Security+Pvt+Ltd+-+TG&timespan=last+week&from_date=2023-04-01&to_date=2024-03-31&group_by=Brand&based_on=Expected+Date&sales_stage=%5B%22Closed+Won%22%5D&user=Administrator" target="_blank">Brand Wise Sales(This Week)</a></span>
								</div>
							</div>
							<div class="card1-body" style="height:auto;">
								<div class="brand-chart-wrapper">
									<div id="brand_donut_chart_tw" data-kt-size="200" data-kt-line="18"></div>
									<div id="brand_legend_tw" class="brand-lengend"></div>
								</div>
							</div>
							<div id="legend-modal-brand-tw" class="legend-modal">
								<div class="legend-modal-content">
									<span class="legend-close">&times;</span>
									<h6 class="mb-3">Brands</h6>
									<div id="legend-modal-brand-tw-body"></div>
								</div>
							</div>
						</div>
					</div>
					<div class="col-12 col-md-6 col-lg-6">
						<div class="card1 card1-flush h-lg-100 h-100 w-100">
							<div class="card1-header">
								<div class="card1-title d-flex flex-column">
									<span class="text-gray-500 pt-1 fw-semibold fs-6"><a href="https://dev.64network.com/app/query-report/Opportunity%20Report?company=64+Network+Security+Pvt+Ltd+-+TG&timespan=last+week&from_date=2023-04-01&to_date=2024-03-31&group_by=Brand&based_on=Expected+Date&sales_stage=%5B%22Closed+Won%22%5D&user=Administrator" target="_blank">Brand Wise Sales(This Month)</a></span>
								</div>
							</div>
							<div class="card1-body" style="height:auto;">
								<div class="brand-chart-wrapper">
									<div id="brand_donut_chart_tm" data-kt-size="200" data-kt-line="18"></div>
									<div id="brand_legend_tm" class="brand-lengend"></div>
								</div>
							</div>
							<div id="legend-modal-brand-tm" class="legend-modal">
								<div class="legend-modal-content">
									<span class="legend-close">&times;</span>
									<h6 class="mb-3">Brands</h6>
									<div id="legend-modal-brand-tm-body"></div>
								</div>
							</div>
						</div>
					</div>
				</div>	

				<div class="row">
					<div class="col-12 col-md-12 col-lg-12">
						<div class="widget-title">
							<span class="ellipsis" title="Monthly Opportunities">
								<a href="https://dev.64network.com/app/query-report/Opportunity%20Report?company=64+Network+Security+Pvt+Ltd+-+TG&timespan=this+year&from_date=2023-04-01&to_date=2024-03-31&group_by=Monthly&based_on=Creation&sales_stage=%5B%22Closed+Won%22%5D&user=Administrator" target="_blank">
								Monthly Opportunities
								</a>
							</span>
						</div>
						<div id="sales-overview" style="width: 100%;"></div>
					</div>
				</div>
				
			
				<div class="row mt-3">
					<div class="col-12 col-md-6 col-lg-6">
						<div class="card1 card1-flush h-lg-100">
							<div class="card1-header py-7 mb-3">
								<h3 class="card1-title align-items-start flex-column">
									<span class="card1-label fw-bold text-gray-800"><a href="#" target="_blank">Sales Over Time By Value</a></span>
								</h3>
								<div class="card1-toolbar">   
									<div class="input-group">
										<div class="dropdown ms-2">
											<button class="btn btn-light border-light btn-sm dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
												Today<i class="align-middle ms-1 wh-15" data-feather="chevron-down"></i>
											</button>
											<div class="dropdown-menu dropdown-menu-end">
												<a class="dropdown-item" href="#">Yearly</a>
												<a class="dropdown-item" href="#">Monthly</a>
												<a class="dropdown-item" href="#">Weekly</a>
												<a class="dropdown-item" href="#">Today</a>
											</div>
										</div>
									</div>    
								</div>
							</div>
							
							<div class="card1-body pb-xl-2">
								<div class="row align-items-center">	
									<div class="apex-chart" data-colors='["#556ee6", "#f1b44c"]' id="sales-over"></div>		
								</div>
							</div>	
						</div>
					</div>
				</div>
				
			</div>
		
		
		
			<div class="tab-pane fade" id="target-content" role="tabpanel" aria-labelledby="target-tab">
				<div class="title1">Target Dashboard</div>
				<div class="row mt-5">
					<div class="col-12 col-md-12 col-lg-12">
						<div id="target-overview" style="width: 100%;"></div>
					</div>
				</div>


				<div class="row mt-5">
					<div class="col-12">
						<div class="title">Target Category Wise Amount</div>
						<div id="target-category-wise-overview"></div>
					</div>
				</div>

				<div class="row mt-5">
					<div class="title1">This Month</div>
					<div class="col-12 col-md-5 col-lg-5">
						<div class="table-responsive">
							<table id="sales-target-table" class="table">
								<thead>
									<tr>
										<th>Category</th>
										<th>Topline Amount</th>
										<th>Achieved</th>
										<th>Variance</th>
									</tr>
								</thead>
								<tbody>
									<!-- Rows will be inserted dynamically -->
								</tbody>
							</table>
						</div>	
					</div>
					<div class="col-12 col-md-5 col-lg-5">
						<div class="table-responsive">
							<table id="sales-target-bt-table" class="table">
								<thead>
									<tr>
										<th>Category</th>
										<th>bottomline Amount</th>
										<th>Achieved</th>
										<th>Variance</th>
									</tr>
								</thead>
								<tbody>
									<!-- Rows will be inserted dynamically -->
								</tbody>
							</table>
						</div>	
					</div>
				</div>
			</div>
		
			<div class="tab-pane fade" id="account-content" role="tabpanel" aria-labelledby="account-tab">
				<p>Account Dashboard </p>
			</div>

			<div class="tab-pane fade" id="sales-target-content" role="tabpanel" aria-labelledby="sales-target-tab">
				<p>Sales Target </p>

				<div class="row" style="border: 1px solid #e4e6ef; border-radius:20px;">
					<div class="col-3 col-md-3 col-lg-3" style="background-color: #4F8390;border-radius: 20px 0px 0px 20px;">
						<h6 class="ml-2 mt-1" style="color:white;margin-bottom:0px;text-align:center">Salary</h6>
						<p class="ml-2" style="color:white;margin-bottom:0px;text-align:center">fixed + variable</P>
					</div>
					<div class="col-3 col-md-3 col-lg-3" style="background-color:#5EC8CE">
						<h6 style="margin-bottom:0px;color:white;margin-top:1px;text-align:center">fixed amount</h6>
						<p style="margin-bottom:0px;color:white;text-align:center">₹2,40,000</p>
					</div>
					<div class="col-3 col-md-3 col-lg-3" style="background-color:#D7C7BA">
						<h6 style="margin-bottom:0px;color:white;margin-top:1px;text-align:center">Variable Amount</h6>
						<p style="margin-bottom:0px;color:white;text-align:center">₹1,00,000</p>
					</div>
					<div class="col-3 col-md-3 col-lg-3" style="background-color:#E8B7A0;border-radius: 0px 20px 20px 0px;">
						<h6 style="margin-bottom:0px;color:white;margin-top:1px;text-align:center">Achievd Progress</h6>
						<p style="margin-bottom:0px;color:white;text-align:center">Good</p>
					</div>
				</div>

				<div class="row mt-5">
					<div class="col-12 col-md-4 col-lg-2">
						<div class="card1 card1-flush h-lg-100 h-100">
							<div class="row widget-height">
								<div class="col-6 col-md-6 col-lg-6" style="padding-right:2px;">
									<div class="widget number-widget-box" data-widget-name="Target">
										<div class="widget-head">
											<div class="widget-label">
												<div class="widget-title">
													<span class="ellipsis" title="Target">
														<a href="#">Target</a>
													</span>
												</div>
											</div>
										</div>
										<div class="widget-body">
											<div class="widget-content">
												<div class="number ellipsis" id="target-amount" style="text-align:center;font-size:26px;">103</div>
											</div>
										</div>
									</div>
								</div>
								<div class="col-6 col-md-6 col-lg-6" style="margin-left:0px;padding-left:0px;">
									<div class="widget number-widget-box" data-widget-name="Achievd">
										<div class="widget-head">
											<div class="widget-label">
												<div class="widget-title" style="text-align: center;">
													<span class="ellipsis" title="Achievd">
														<a href="#"">Achievd</a>
													</span>
												</div>
											</div>
										</div>
										<div class="widget-body">
											<div class="widget-content">
												<div class="number ellipsis" id="achieved-amount" style="text-align:center;font-size:26px;">203</div>
											</div>
										</div>
									</div>
								</div>
							</div>
							<div class="row widget-height">
								<div class="col-12 col-md-12 col-lg-12">
									<div class="widget number-widget-box" data-widget-name="Achievd %">
										<div class="widget-head">
											<div class="widget-label">
												<div class="widget-title">
													<span class="ellipsis" title="Achievd %" style="text-align:center">
														<a href="#">Achievd %</a>
													</span>
												</div>
											</div>
										</div>
										<div class="widget-body">
											<div class="widget-content">
												<div class="number ellipsis" id="#" style="text-align:center;font-size:26px;">0</div>
											</div>
										</div>
									</div>
								</div>
							</div>
						</div>		
					</div>

					<div class="col-12 col-md-8 col-lg-10">
						<div class="h-lg-100 h-100" id="sales-target-overview" style="width: 100%;"></div>
					</div>
					
				</div>

				<div class="row mt-5">
					<div class="col-12 col-md-4 col-lg-4">
						<table class="table">
							<thead>
								<tr>
									<td colspan="3" style="font-size:16px;font-weight:600;">This Month</td>
								</tr>
							
								<tr>
									<td class="col-4">Target</target>
									<td class="col-4">Achieved</td>
									<td class="col-4">Variable</td>
								</tr>
							</thead>
							<tbody>
								<tr>
									<td id="target-amount-tm" class="ellipsis">₹0</td>
									<td id="achieved-amount-tm" class="ellipsis">₹0</td>
									<td id="variable-amount-tm" class="ellipsis">₹0</td>
								</tr>
							</tbody>
						</table>
					</div>

					<div class="col-12 col-md-4 col-lg-4">
						<table class="table">
							<thead>
								<tr>
									<td colspan="3" style="font-size:16px;font-weight:600;">This Quarter</td>
								</tr>
								<tr>
									<td class="col-4">Target</target>
									<td class="col-4">Achieved</td>
									<td class="col-4">Variable</td>
								</tr>
							</thead>
							<tbody>	
								<tr>
									<td id="target-amount-tq" class="ellipsis">₹0</td>
									<td id="achieved-amount-tq" class="ellipsis">₹0</td>
									<td id="variable-amount-tq" class="ellipsis">₹0</td>
								</tr>
							</tbody>	
						</table>
					</div>

					<div class="col-12 col-md-4 col-lg-4">
						<table class="table">
							<thead>
								<tr>
									<td colspan="3" style="font-size:16px;font-weight:600;">This Year</td>
								</tr>
								<tr>
									<td class="col-4">Target</target>
									<td class="col-4">Achieved</td>
									<td class="col-4">Variable</td>
								</tr>
							</thead>
							<tbody>	
								<tr>
									<td id="target-amount-ty" class="ellipsis">₹0</td>
									<td id="achieved-amount-ty" class="ellipsis">₹0</td>
									<td id="variable-amount-ty" class="ellipsis">₹0</td>
								</tr>
							</tbody>	
						</table>
					</div>	
				</div>

			</div>


		</div>


		
		<script>
			$(document).ready(function () {
				$(".dropdown1-toggle").on("click", function (event) {
					event.stopPropagation();
					$(this).next(".dropdown1-menu").toggleClass("show");
				});

				// Hide dropdown when clicking outside
				$(document).on("click", function () {
					$(".dropdown1-menu").removeClass("show");
				});
			});
		</script>

		<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>


	`
};


