// frappe.pages['employee-dashboard'].on_page_load = function(wrapper) {
// 	var page = frappe.ui.make_app_page({
// 		parent: wrapper,
// 		title: 'Employee Dashboard',
// 		single_column: true
// 	});
// }


frappe.pages['employee-dashboard'].on_page_load = function (wrapper) {
	console.log("on_page_load triggered");
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
		console.log("Loading CSS before page content...");
		frappe.require([
			"/assets/renewal_module/css/employee-dashboard/datatables.bundle.css",
			"/assets/renewal_module/css/employee-dashboard/plugins.bundle.css",
			"/assets/renewal_module/css/employee-dashboard/style.bundle.css",
			"/assets/renewal_module/css/employee-dashboard/vis-timeline.bundle.css",
			"/assets/renewal_module/css/employee-dashboard/app.css",
		], () => {
			console.log("All CSS files loaded.");
			if (callback) callback(); // Proceed to render the page after CSS loads
		});
	}

	make() {
		console.log("Appending body content...");
		let body = frappe.customer_app_page.body;
		$(this.page.main).append(body);

		this.get_opp_count();
		this.get_opp_amount();
		this.get_closed_amount();
		this.get_lost_amount();
		this.get_renewal_count();
		this.get_renewal_amount();

		frappe.require(["https://cdnjs.cloudflare.com/ajax/libs/apexcharts/3.41.0/apexcharts.min.js"], () => {
			console.log("Chart.js loaded");
			this.opp_chart();
			this.brand_donut_chart();
			this.item_group_donut_chart();
			this.barrenderChart();
			this.ChartHandler();

		});

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
	

	opp_chart() {
		console.log("bar chart")
		setTimeout(() => {
			frappe.call({
				method: "renewal_module.custom_module.page.employee_dashboard.employee_dashboard.get_monthly_opp_data", // Replace with your API method
				callback: function (r) {
					console.log("r", r);
					if (r.message) {
						console.log("amount", r.message.amounts)
						console.log("count", r.message.counts)
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
								axisTicks: { show: false }
							},
							grid: { padding: { left: 0, right: 0, top: 0, bottom: -10 } },
							yaxis: [
								{
									show:false
									//title: { text: "Sales (Amount)" },
									//labels: { formatter: (val) => val.toLocaleString() }
								},
								{
									opposite: true, // Places second y-axis on the right
									//title: { text: "Opportunities (Count)" },
									//labels: { formatter: (val) => Math.round(val) }
									show:false
								}
							]
							
						};

						let chart = new ApexCharts(chartElement, options);
						chart.render();
					}
				}
			});
		}, 100);
	}

	brand_donut_chart() {
		setTimeout(() => {
			frappe.call({
				method: "renewal_module.custom_module.page.employee_dashboard.employee_dashboard.get_brand_wise_data",
				callback: function (r) {
					console.log("r", r);
					if (r.message) {
						console.log("amount", r.message.amounts);
						let chartElement = document.getElementById("brand_donut_chart");
						let legendContainer = document.getElementById("brand_legend");
						// Ensure data is valid
						let seriesData = r.message.amounts.map(val => val || 0); // Replace null with 0
						let labelsData = r.message.brand || [];

						let colors = ["#FEB019", "#EE502D", "#008FFB", "#00E396", "#775DD0", "#546E7A"];

						let chartOptions = {
							chart: { type: "donut", height: 268 },
							series: seriesData,
							labels: labelsData,
							//colors: ["#FEB019", "#EE502D", "#008FFB"],
							colors:colors,
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

						// Destroy the previous chart if it exists
						if (window.brandDonutChart) {
							window.brandDonutChart.destroy();
						}

						// Render new chart
						window.brandDonutChart = new ApexCharts(chartElement, chartOptions);
						window.brandDonutChart.render();

						if (legendContainer) {
							legendContainer.innerHTML = ""; // Clear old legend items

							labelsData.forEach((label, index) => {
								let amounts = seriesData[index].toLocaleString(); // Format as currency
								let color = colors[index % colors.length]; // Get color from array

								let legendItem = document.createElement("div");
								legendItem.classList.add("d-flex", "fs-6", "fw-semibold", "align-items-center", "my-2");

								legendItem.innerHTML = `
									<div class="bullet w-8px h-6px rounded-2" style="background-color: ${color};"></div>
									<div class="text-gray-500 flex-grow-1 me-3 pl-1">${label}</div>
									<div class="fw-bolder text-gray-700 text-xxl-end pr-3">${amounts}</div>
								`;

								legendContainer.appendChild(legendItem);
							});
						} else {
							console.error("Legend container not found");
						}
					}
				}
			});
		}, 100);
	}


	item_group_donut_chart() {
		setTimeout(() => {
			frappe.call({
				method: "renewal_module.custom_module.page.employee_dashboard.employee_dashboard.get_item_group_wise_data",
				callback: function (r) {
					console.log("r", r);
					if (r.message) {
						console.log("amount", r.message.amounts);

						let chartElement = document.getElementById("item_group_donut_chart");
						let legendContainer = document.getElementById("item_group_legend");
						let colors = ["#FEB019", "#EE502D", "#008FFB", "#00E396", "#775DD0", "#546E7A"];
						let chartOptions = {
							chart: { type: "donut", height: 268 },
							//series: [7660, 2820, 45257], // Example values
							//labels: ["Shoes", "Gaming", "Others"],
							series: r.message.amounts.map(val => val || 0),
							labels: r.message.item_group || [],
							colors:colors,
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

						let chart = new ApexCharts(chartElement, chartOptions);
						chart.render();

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
		}, 100); // Corrected `setTimeout()` syntax
	}

	get_opp_count() {
		frappe.call({
			method: "renewal_module.custom_module.page.employee_dashboard.employee_dashboard.get_opp_count",
			callback: function (r) {
				if (r.message) {
					$("#opp-count").text(r.message);
				}
			}
		});
	}

	get_opp_amount() {
		frappe.call({
			method: "renewal_module.custom_module.page.employee_dashboard.employee_dashboard.get_total_amount",
			callback: function (r) {
				if (r.message) {
					let formatted_price = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(r.message);
					$("#opp-amount").text(formatted_price);
				}
			}
		});
	}

	get_closed_amount() {
		frappe.call({
			method: "renewal_module.custom_module.page.employee_dashboard.employee_dashboard.get_won_amount",
			callback: function (r) {
				if (r.message) {
					let formatted_price = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(r.message);
					$("#closed-amount").text(formatted_price);
				}
			}
		});
	}

	get_lost_amount() {
		frappe.call({
			method: "renewal_module.custom_module.page.employee_dashboard.employee_dashboard.get_lost_amount",
			callback: function (r) {
				if (r.message) {
					let formatted_price = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(r.message);
					$("#lost-amount").text(formatted_price);
				}
			}
		});
	}

	get_renewal_count() {
		frappe.call({
			method: "renewal_module.custom_module.page.employee_dashboard.employee_dashboard.get_renewal_count",
			callback: function (r) {
				if (r.message) {
					$("#renewal-count").text(r.message);
				}
			}
		});
	}

	get_renewal_amount() {
		frappe.call({
			method: "renewal_module.custom_module.page.employee_dashboard.employee_dashboard.get_renewal_amount",
			callback: function (r) {
				if (r.message) {
					let formatted_price = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(r.message);
					$("#renewal-amount").text(formatted_price);
				}
			}
		});
	}

	barrenderChart() {
		setTimeout(() => {
			frappe.call({
				method: "renewal_module.custom_module.page.employee_dashboard.employee_dashboard.get_brand_wise_data",
				
				callback: function (r) {
					console.log("API Response:", r);

					if (r.message && Array.isArray(r.message.amounts) && Array.isArray(r.message.brand)) {
						var chartElement = document.getElementById("kt_charts_widget_6");

						if (!chartElement) {
							console.error("Chart container not found: #kt_charts_widget_6");
							return;
						}

						let seriesData = r.message.amounts.map(val => val || 0); // Replace null with 0
						//let labelsData = r.message.brand.map(month => month || "Unknown"); // Ensure labels are valid
						let labelsData = r.message.brand.map(brand => brand || 0 );
						console.log("labelsData", labelsData)
						var options = {
							series: [{ name: "Sales", data: seriesData }], // Fixed series format
							chart: { type: "bar", height: 350, toolbar: { show: false } },
							plotOptions: {
								bar: { borderRadius: 4, horizontal: true, distributed: true, barHeight: 30 }
							},
							dataLabels: {
								enabled: true,
								textAnchor: "start",
								offsetX: 0,
								formatter: function (val) {
									return val + "K";
								},
								style: { fontSize: "14px", fontWeight: "600", align: "left" }
							},
							colors: ["#3E97FF", "#F1416C", "#50CD89", "#FFC700", "#7239EA"],
							xaxis: {
								categories: labelsData, // Use dynamic labels
								labels: {
									formatter: (val) => val,
									style: { fontSize: "12px", fontWeight: "600" }
								}
							},
							yaxis: {
								labels: {
									//formatter: (val) => `${val} - ${parseInt((100 * val) / Math.max(...seriesData))}%`,
									style: { fontSize: "12px", fontWeight: "600" }
								}
							},
							grid: { borderColor: "#ccc", strokeDashArray: 4 },
							tooltip: {
								style: { fontSize: "12px" },
								y: { formatter: (val) => val + "K" }
							}
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
	


}

frappe.customer_app_page = {
	body: `
		<div class="row">
			
			<div class="col-12 col-md-12 col-lg-8">
				<div id="sales-overview" style="width: 100%;"></div>
			</div>
			<div class="col-12 col-md-12 col-lg-4">
				<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-2">
					<div class="rounded-lg bg-slate-150 p-4 dark:bg-navy-700">
						<div class="flex justify-between space-x-1">
							<p class="text-xl font-semibold text-slate-700 dark:text-navy-100 ellipsis" id="opp-count">
								o
							</p>
							<svg xmlns="http://www.w3.org/2000/svg" class="size-5 text-primary dark:text-accent" fill="none"
								viewbox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round"
									d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z">
								</path>
							</svg>
						</div>
						<p class="mt-1 text-xs+">Opp Count</p>
					</div>
						
					<div class="rounded-lg bg-slate-150 p-4 dark:bg-navy-700">
						<div class="flex justify-between">
							<p class="text-xl font-semibold text-slate-700 dark:text-navy-100 ellipsis" id="opp-amount">
								₹ 0.0
							</p>
							<svg xmlns="http://www.w3.org/2000/svg" class="size-5 text-success" fill="none"
								viewbox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round"
									d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z">
								</path>
							</svg>
						</div>
						<p class="mt-1 text-xs+">Opp Amount</p>
					</div>
				
					<div class="rounded-lg bg-slate-150 p-4 dark:bg-navy-700">
						<div class="flex justify-between">
							<p class="text-xl font-semibold text-slate-700 dark:text-navy-100 ellipsis" id="closed-amount">
								₹ 0.0
							</p>
							<svg xmlns="http://www.w3.org/2000/svg" class="size-5 text-warning" fill="none"
								viewbox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round"
									d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z">
								</path>
							</svg>
						</div>
						<p class="mt-1 text-xs+">Closed Won</p>
					</div>
					<div class="rounded-lg bg-slate-150 p-4 dark:bg-navy-700">
						<div class="flex justify-between">
							<p class="text-xl font-semibold text-slate-700 dark:text-navy-100 ellipsis" id="lost-amount">
								₹ 0.0
							</p>
							<svg xmlns="http://www.w3.org/2000/svg" class="size-5 text-info" fill="none" viewbox="0 0 24 24"
								stroke="currentColor" stroke-width="2">
								<path d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z"></path>
								<path stroke-linecap="round" stroke-linejoin="round"
									d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0">
								</path>
							</svg>
						</div>
						<p class="mt-1 text-xs+">Closed Lost</p>
					</div>
							
					<div class="rounded-lg bg-slate-150 p-4 dark:bg-navy-700">
						<div class="flex justify-between space-x-1">
							<p class="text-xl font-semibold text-slate-700 dark:text-navy-100 ellipsis" id="renewal-count">
								0
							</p>
							<svg xmlns="http://www.w3.org/2000/svg" class="size-5 text-secondary" fill="none"
								viewbox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round"
									d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path>
							</svg>
						</div>
						<p class="mt-1 text-xs+">Renewal Count</p>
					</div>
					<div class="rounded-lg bg-slate-150 p-4 dark:bg-navy-700">
						<div class="flex justify-between">
							<p class="text-xl font-semibold text-slate-700 dark:text-navy-100 ellipsis" id="renewal-amount">
								₹ 0.0
							</p>
							<svg xmlns="http://www.w3.org/2000/svg" class="size-5 text-error" fill="none"
								viewbox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round"
									d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z">
								</path>
							</svg>
						</div>
						<p class="mt-1 text-xs+">Renewal Amount</p>
					</div>
            	</div>
			</div>
		</div>	


		<div class="row mt-5">
			<div class="col-xl-6 mb-5 mb-xxl-6">
				<div class="card card-flush">
					<div class="card-header">
						<div class="card-title d-flex flex-column">
							<span class="text-gray-500 pt-1 fw-semibold fs-6">Brand Wise Sales</span>
						</div>
					</div>
					<div class="card-body d-flex align-items-center" style="height:280px;">
						<div class="d-flex flex-center me-5">
							<div id="brand_donut_chart" style="min-width: 250px; min-height: 250px" data-kt-size="250"
								data-kt-line="18">
							</div>
						</div>
						<div class="d-flex flex-column content-justify-center w-100" >
							<div id="brand_legend"></div>
						</div>
					</div>
				</div>
			</div>

			<div class="col-xl-6 mb-5 mb-xxl-10">
				<div class="card card-flush">
					<div class="card-header">
						<div class="card-title d-flex flex-column">
							<span class="text-gray-500 pt-1 fw-semibold fs-6">Item Group Wise Sales</span>
						</div>
					</div>
					<div class="card-body d-flex align-items-center" style="height:280px">
						<div class="d-flex flex-center me-5">
							<div id="item_group_donut_chart" style="min-width: 250px; min-height: 250px" data-kt-size="250"
								data-kt-line="18">
							</div>
						</div>
						<div class="d-flex flex-column content-justify-center w-100">
							<div id="item_group_legend"></div>
						</div>
					</div>
				</div>
			</div>


		</div>	


		<div class="row mt-5">
			<div class="col-12 col-md-6 col-lg-6">
				<div class="card card-flush h-lg-100">
					<div class="card-header py-7 mb-3">
						<h3 class="card-title align-items-start flex-column">
							<span class="card-label fw-bold text-gray-800">Top Selling Categories</span>
							<span class="text-gray-500 mt-1 fw-semibold fs-6">8k social visitors</span>
						</h3>
						<div class="card-toolbar">   
							<a href="/rider-html-pro/apps/ecommerce/sales/listing.html" class="btn btn-sm btn-light">View All</a>    
						</div>
					
					</div>
					<div class="card-body py-0 ps-6 mt-n12">                 
						<div id="kt_charts_widget_6"></div>       
					</div>
				
				</div>
			</div>

			<div class="col-12 col-md-6 col-lg-6">
				<div class="card card-flush h-lg-100">
					<div class="card-header py-7 mb-3">
						<h3 class="card-title align-items-start flex-column">
							<span class="card-label fw-bold text-gray-800">Sales Over Time By Value</span>
						</h3>
						<div class="card-toolbar">   
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
					
					<div class="card-body pb-xl-2">
						<div class="row align-items-center">	
							<div class="apex-chart" data-colors='["#556ee6", "#f1b44c"]' id="sales-over"></div>		
						</div>
					</div>	
				</div>
			</div>

		</div>	
		
		<div class="row mt-5">
			<div class="col-12 col-md-4 col-lg-4">
				<div class="title">Closures</div>
				<div class="row mt-3">
					<div class="col-12 col-md-12 col-lg-6 mb-1">
						<div class="widget number-widget-box" data-widget-name="Opp Count(Tw)">
							<div class="widget-head">
								<div class="widget-label">
									<div class="widget-title">
										
										<span class="ellipsis" title="Opp Count('Tw)">
											<a href="https://dev.64network.com/app/query-report/Renewals%20Analytics?company=64+Network+Security+Pvt+Ltd+-+TG&timespan=last+week&from_date=2023-04-01&to_date=2024-03-31&based_on=End+Date&group_by=Renewals" target="_blank">
											Opp Count(Tw)
											</a>
										</span>
									</div>
								</div>
								<div class="widget-control hidden">
									<div class="card-actions dropdown pull-right">
										<a data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
										...
										</a>
										<ul class="dropdown-menu" style="max-height: 300px; overflow-y: auto;">
											<li class="dropdown-item">
												<a data-action="action-refresh">Refresh</a>
												</li><li class="dropdown-item">
												<a data-action="action-edit">Edit</a>
											</li>
										</ul>
									</div>
								</div>
							</div>
							<div class="widget-body">
								<div class="widget-content">
									<div class="number blue ellipsis" id="#">0</div>
								</div>
							</div>
						</div>
					</div>	

					<div class="col-12 col-md-12 col-lg-6 mb-1">
						<div class="widget number-widget-box" data-widget-name="Opp Amount(Tw)">
							<div class="widget-head">
								<div class="widget-label">
									<div class="widget-title">
										
										<span class="ellipsis" title="Opp amount('Tw)">
											<a href="https://dev.64network.com/app/query-report/Renewals%20Analytics?company=64+Network+Security+Pvt+Ltd+-+TG&timespan=last+week&from_date=2023-04-01&to_date=2024-03-31&based_on=End+Date&group_by=Renewals" target="_blank">
											Opp Amount(Tw)
											</a>
										</span>
									</div>
								</div>
								<div class="widget-control hidden">
									<div class="card-actions dropdown pull-right">
										<a data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
										...
										</a>
										<ul class="dropdown-menu" style="max-height: 300px; overflow-y: auto;">
											<li class="dropdown-item">
												<a data-action="action-refresh">Refresh</a>
												</li><li class="dropdown-item">
												<a data-action="action-edit">Edit</a>
											</li>
										</ul>
									</div>
								</div>
							</div>
							<div class="widget-body">
								<div class="widget-content">
									<div class="number blue ellipsis" id="#">0</div>
								</div>
							</div>
						</div>
					</div>	
				</div>

			</div>
			<div class="col-12 col-md-8 col-lg-8">
				<div class="title">Renewals</div>
				<div class="row mt-3">
					<div class="col-12 col-md-6 col-lg-3 mb-1">
						<div class="widget number-widget-box" data-widget-name="Rnwl Count(Lw)">
							<div class="widget-head">
								<div class="widget-label">
									<div class="widget-title">
										
										<span class="ellipsis" title="Rnwl Count(Lw)">
											<a href="https://dev.64network.com/app/query-report/Renewals%20Analytics?company=64+Network+Security+Pvt+Ltd+-+TG&timespan=last+week&from_date=2023-04-01&to_date=2024-03-31&based_on=End+Date&group_by=Renewals" target="_blank">
											Rnwl Count(Lw)
											</a>
										</span>
									</div>
								</div>
								<div class="widget-control hidden">
									<div class="card-actions dropdown pull-right">
										<a data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
										...
										</a>
										<ul class="dropdown-menu" style="max-height: 300px; overflow-y: auto;">
											<li class="dropdown-item">
												<a data-action="action-refresh">Refresh</a>
												</li><li class="dropdown-item">
												<a data-action="action-edit">Edit</a>
											</li>
										</ul>
									</div>
								</div>
							</div>
							<div class="widget-body">
								<div class="widget-content">
									<div class="number blue ellipsis" id="rnwls-count">0</div>
								</div>
							</div>
						</div>
					</div>
					
					<div class="col-12 col-md-6 col-lg-3 mb-1">

						<div class="widget number-widget-box" data-widget-name="Cofed Rnwls(Lw)">
							<div class="widget-head">
								<div class="widget-label">
									<div class="widget-title">
										<span class="ellipsis" title="Cofed Rnwls(Lw)">
											<a href="https://dev.64network.com/app/query-report/Renewals%20Analytics?company=64+Network+Security+Pvt+Ltd+-+TG&timespan=last+week&from_date=2023-04-01&to_date=2024-03-31&based_on=End+Date&group_by=Renewals" target="_blank">
											Cof Rnwls(Lw)
											</a>
										</span>
									</div>
								</div>
								<div class="widget-control hidden">
									<div class="card-actions dropdown pull-right">
										<a data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
										...
										</a>
										<ul class="dropdown-menu" style="max-height: 300px; overflow-y: auto;">
											<li class="dropdown-item">
												<a data-action="action-refresh">Refresh</a>
												</li><li class="dropdown-item">
												<a data-action="action-edit">Edit</a>
											</li>
										</ul>
									</div>
								</div>
							</div>
							<div class="widget-body">
								<div class="widget-content">
									<div class="number green ellipsis" id="cofed-rnwls">0</div>
								</div>
							</div>
						</div>
					</div>

					<div class="col-12 col-md-6 col-lg-3 mb-1">

						<div class="widget number-widget-box" data-widget-name="Pending Rnwls(Lw)">
							<div class="widget-head">
								<div class="widget-label">
									<div class="widget-title">
										<span class="ellipsis" title="Pending Rnwls(Lw)">
											<a href="https://dev.64network.com/app/query-report/Renewals%20Analytics?company=64+Network+Security+Pvt+Ltd+-+TG&timespan=last+week&from_date=2023-04-01&to_date=2024-03-31&based_on=End+Date&group_by=Renewals" target="_blank">
											Pending Rnwls (Lw)
											</a>
										</span>
									</div>
								</div>
								<div class="widget-control hidden">
									<div class="card-actions dropdown pull-right">
										<a data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
										...
										</a>
										<ul class="dropdown-menu" style="max-height: 300px; overflow-y: auto;">
											<li class="dropdown-item">
												<a data-action="action-refresh">Refresh</a>
												</li><li class="dropdown-item">
												<a data-action="action-edit">Edit</a>
											</li>
										</ul>
									</div>
								</div>
							</div>
							<div class="widget-body">
								<div class="widget-content">
									<div class="number orange ellipsis" id="pending-rnwls">0</div>
								</div>
							</div>
						</div>

					</div>

					<div class="col-12 col-md-6 col-lg-3 mb-1">

						<div class="widget number-widget-box" data-widget-name="lost Rnwls(Lw)">
							<div class="widget-head">
								<div class="widget-label">
									<div class="widget-title">
										<span class="ellipsis" title="lost Rnwls(Lw)">
										<a href="https://dev.64network.com/app/query-report/Renewals%20Analytics?company=64+Network+Security+Pvt+Ltd+-+TG&timespan=last+week&from_date=2023-04-01&to_date=2024-03-31&based_on=End+Date&group_by=Renewals" target="_blank">
											Lost Rnwls(Lw)
										</a>	
										</span>
									</div>
								</div>
								<div class="widget-control hidden">
									<div class="card-actions dropdown pull-right">
										<a data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
										...
										</a>
										<ul class="dropdown-menu" style="max-height: 300px; overflow-y: auto;">
											<li class="dropdown-item">
												<a data-action="action-refresh">Refresh</a>
												</li><li class="dropdown-item">
												<a data-action="action-edit">Edit</a>
											</li>
										</ul>
									</div>
								</div>
							</div>
							<div class="widget-body">
								<div class="widget-content">
									<div class="number red ellipsis" id="lost-rnwls">0</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>

		</div>
		
		
		


	`
};
