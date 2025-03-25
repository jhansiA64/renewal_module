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
			"/assets/renewal_module/css/employee-dashboard/datatables.bundle.css",
			"/assets/renewal_module/css/employee-dashboard/plugins.bundle.css",
			"/assets/renewal_module/css/employee-dashboard/style.bundle.css",
			"/assets/renewal_module/css/employee-dashboard/vis-timeline.bundle.css"
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
		this.add_tabs();
		this.get_opp_count();
		this.get_opp_amount();
		this.get_closed_amount();
		this.get_lost_amount();
		this.get_opp_count_tm();
		this.get_closed_amount_tm();
		this.get_lost_amount_tm();
		this.get_renewal_count();
		this.get_renewal_amount();
		this.get_rnwls_count();
		this.get_rnwls_amount();
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
			this.get_item_group_donut_chart();
			this.barrenderChart();
			this.ChartHandler();
			//target dashboard
			this.target_chart();

		});

		//target Dashboard
		this.get_sales_target_tm();
		this.get_sales_target_tq();
		this.get_sales_target_ty();


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
				<select class="form-control" id="sales-person-dropdown">
					<option value="">Sales Person</option>
				</select>
			</div>
		`);
		$(".page-actions").append(this.sales_person_field);
		frappe.call({
			method: "renewal_module.custom_module.page.employee_dashboard.employee_dashboard.get_sales_person",
			callback: function (r) {
				if (r.message) {
					let dropdown = $("#sales-person-dropdown");
					let storedSalesPerson = localStorage.getItem("sales_person");

					r.message.forEach(sp => {
						dropdown.append(`<option value="${sp}">${sp}</option>`);
					});
					// Automatically select the salesperson if only one exists
					if (r.message.length === 1) {
						dropdown.val(r.message[0]).trigger("change");  // Ensure change event fires

					} else if (storedSalesPerson && r.message.includes(storedSalesPerson)) {
						dropdown.val(storedSalesPerson).trigger("change");  // Restore previous selection
					}
				}
			}
		});

		// When the user selects a salesperson, store it and update the dashboard
		$("#sales-person-dropdown").on("change", function () {
			let sales_person = $(this).val();
			//localStorage.setItem("sales_person", sales_person);  // Store for refresh persistence
			me.update_dashboard_data(sales_person);
		});

		// If there's a stored salesperson, set it after a short delay to ensure the dropdown is populated
		setTimeout(() => {
			let storedSalesPerson = localStorage.getItem("sales_person");
			if (storedSalesPerson) {
				$("#sales-person-dropdown").val(storedSalesPerson).trigger("change");
			}
		}, 500);
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
			this.get_renewal_count(sales_person);
			this.get_renewal_amount(sales_person);
			this.opp_chart(sales_person);
			this.brand_donut_chart(sales_person);
			this.get_item_group_donut_chart(sales_person);
			this.get_cofed_rnwls(sales_person);
			this.get_lost_rnwls(sales_person);
			this.get_pending_rnwls(sales_person);
			this.get_rnwls_count(sales_person);
			this.get_rnwls_amount(sales_person);
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
		}
	}


	opp_chart(sales_person=null) {
		console.log("bar chart",sales_person)
		setTimeout(() => {
			frappe.call({
				method: "renewal_module.custom_module.page.employee_dashboard.employee_dashboard.get_monthly_opp_data", // Replace with your API method
				args:{sales_person:sales_person},
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
							]
							
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

	brand_donut_chart(sales_person=null) {
		setTimeout(() => {
			frappe.call({
				method: "renewal_module.custom_module.page.employee_dashboard.employee_dashboard.get_brand_wise_data",
				args:{sales_person:sales_person},
				callback: function (r) {
					//console.log("r", r);
					if (r.message) {
						//console.log("amount", r.message.amounts);
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
		}, 500);
	}


	get_item_group_donut_chart(sales_person=null) {
		console.log("item group",sales_person)
		// setTimeout(() => {
			console.log("group2",sales_person)
			frappe.call({
				method: "renewal_module.custom_module.page.employee_dashboard.employee_dashboard.get_item_group_wise_data",
				args:{sales_person:sales_person},
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
							series:series,
							labels: labels,
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

						// let chart = new ApexCharts(chartElement, chartOptions);
						// chart.render();

						if (window.itemGroupDonutChart) {
							window.itemGroupDonutChart.destroy();
						}

						// Render Chart
						window.itemGroupDonutChart = new ApexCharts(chartElement, chartOptions);
						window.itemGroupDonutChart.render();

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
	}

	get_opp_count(sales_person=null) {
		console.log("opp count",sales_person)
		$("#opp-count").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.employee_dashboard.employee_dashboard.get_opp_count",
			args:{sales_person:sales_person},
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
			args:{sales_person:sales_person},
			callback: function (r) {
				if (r.message) {
					let formatted_price = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(r.message);
					$("#opp-amount").text(formatted_price);
				}
			}
		});
	}

	get_closed_amount(sales_person=null) {
		$("#closed-amount").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.employee_dashboard.employee_dashboard.get_won_amount",
			args:{sales_person:sales_person},
			callback: function (r) {
				if (r.message) {
					let formatted_price = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(r.message);
					$("#closed-amount").text(formatted_price);
				}
			}
		});
	}

	get_lost_amount(sales_person=null) {
		$("#lost-amount").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.employee_dashboard.employee_dashboard.get_lost_amount",
			args:{sales_person:sales_person},
			callback: function (r) {
				if (r.message) {
					let formatted_price = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(r.message);
					$("#lost-amount").text(formatted_price);
				}
			}
		});
	}

	get_renewal_count(sales_person=null) {
		$("#renewal-count").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.employee_dashboard.employee_dashboard.get_renewal_count",
			args:{sales_person:sales_person},
			callback: function (r) {
				if (r.message) {
					$("#renewal-count").text(r.message);
				}
			}
		});
	}

	get_renewal_amount(sales_person=null) {
		$("#renewal-amount").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.employee_dashboard.employee_dashboard.get_renewal_amount",
			args:{sales_person:sales_person},
			callback: function (r) {
				if (r.message) {
					let formatted_price = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(r.message);
					$("#renewal-amount").text(formatted_price);
				}
			}
		});
	}

	get_opp_count_tm(sales_person=null) {
		console.log("opp count",sales_person)
		$("#opp-count-tm").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.employee_dashboard.employee_dashboard.get_opp_count_tm",
			args:{sales_person:sales_person},
			callback: function (r) {
				if (r.message) {
					$("#opp-count-tm").text(r.message);
				}
			}
		});
	}

	get_closed_amount_tm(sales_person=null) {
		$("#closed-amount-tm").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.employee_dashboard.employee_dashboard.get_won_amount_tm",
			args:{sales_person:sales_person},
			callback: function (r) {
				if (r.message) {
					let formatted_price = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(r.message);
					$("#closed-amount-tm").text(formatted_price);
				}
			}
		});
	}

	get_lost_amount_tm(sales_person=null) {
		$("#lost-amount-tm").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.employee_dashboard.employee_dashboard.get_lost_amount_tm",
			args:{sales_person:sales_person},
			callback: function (r) {
				if (r.message) {
					let formatted_price = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(r.message);
					$("#lost-amount-tm").text(formatted_price);
				}
			}
		});
	}

	barrenderChart(sales_person=null) {
		setTimeout(() => {
			frappe.call({
				method: "renewal_module.custom_module.page.employee_dashboard.employee_dashboard.get_funnel_data",
				args:{sales_person:sales_person},
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
							grid:{show:false},
							tooltip: {
								style: { fontSize: "10px" },
								y: { formatter: (val) => val + "K" }
							},
							legend: {show:false}
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

	//rewals

	get_rnwls_count(sales_person = null) {
		$("#rnwls-count-tw").text(0);
		frappe.call({
			method:"renewal_module.custom_module.page.opportunity_dashboar.renewals.get_rnwls_count",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					$("#rnwls-count-tw").text(r.message);
				}
			}
		});
	}

	get_rnwls_amount(sales_person = null) {
		$("#rnwls-amount-tw").text(0);
		frappe.call({
			method:"renewal_module.custom_module.page.opportunity_dashboar.renewals.get_rnwls_amount",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					$("#rnwls-amount-tw").text(r.message);
				}
			}
		});
	}

	get_rnwls_count_tm(sales_person = null) {
		$("#rnwls-count-tm").text(0);
		frappe.call({
			method:"renewal_module.custom_module.page.opportunity_dashboar.renewals.get_rnwls_count_tm",
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
			method:"renewal_module.custom_module.page.opportunity_dashboar.renewals.get_rnwls_amount_tm",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					$("#rnwls-amount-tm").text(r.message);
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
	get_closure_opp_count_tw (sales_person=null){
		$("#closure-opp-count-tw").text(0);
		frappe.call({
			method:"renewal_module.custom_module.page.employee_dashboard.employee_dashboard.get_closure_opp_count_tw",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					$("#closure-opp-count-tw").text(r.message);
				}
			}
		});
	}

	get_closure_opp_amount_tw(sales_person=null){
		$("#closure-opp-amount-tw").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.employee_dashboard.employee_dashboard.get_closure_opp_amount_tw",
			args:{sales_person:sales_person},
			callback: function (r) {
				if (r.message) {
					let formatted_price = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(r.message);
					$("#closure-opp-amount-tw").text(formatted_price);
				}
			}
		});
	}

	get_closure_opp_count_tm (sales_person=null){
		$("#closure-opp-count-tm").text(0);
		frappe.call({
			method:"renewal_module.custom_module.page.employee_dashboard.employee_dashboard.get_closure_opp_count_tm",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					$("#closure-opp-count-tm").text(r.message);
				}
			}
		});
	}

	get_closure_opp_amount_tm(sales_person=null){
		$("#closure-opp-amount-tm").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.employee_dashboard.employee_dashboard.get_closure_opp_amount_tm",
			args:{sales_person:sales_person},
			callback: function (r) {
				if (r.message) {
					let formatted_price = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(r.message);
					$("#closure-opp-amount-tm").text(formatted_price);
				}
			}
		});
	}

	//target Dashboard

	target_chart(sales_person=null) {
		console.log("bar chart",sales_person)
		setTimeout(() => {
			frappe.call({
				method: "renewal_module.custom_module.page.employee_dashboard.target_data.get_target_data1", // Replace with your API method
				args:{sales_person:sales_person},
				callback: function (r) {
					//console.log("r", r);
					if (r.message) {
						//console.log("amount", r.message.amounts)
						//console.log("count", r.message.counts)
						let chartElement = document.getElementById("target-overview");
						let options = {
							colors: ["#5BA6FE","#6AD49A","#F35D81"],
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
				method: "renewal_module.custom_module.page.employee_dashboard.employee_dashboard.get_sales_target_tm",
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
				method: "renewal_module.custom_module.page.employee_dashboard.employee_dashboard.get_sales_target_tq",
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
				method: "renewal_module.custom_module.page.employee_dashboard.employee_dashboard.get_sales_target_ty",
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

}

frappe.customer_app_page = {
	body: `

		<div class="tab-content">
			<div class="tab-pane fade show active" id="opp-content" role="tabpanel" aria-labelledby="opp-tab">
				<div class="title1 mb-4">Opportunity Dashboard</div>

				<div class="row">
					<div class="col-12 col-md-12 col-lg-10">
						<div class="widget-title">
							<span class="ellipsis" title="Monthly Opportunities">
								<a href="https://dev.64network.com/app/query-report/Opportunity%20Report?company=64+Network+Security+Pvt+Ltd+-+TG&timespan=this+year&from_date=2023-04-01&to_date=2024-03-31&group_by=Monthly&based_on=Creation&sales_stage=%5B%22Closed+Won%22%5D&user=Administrator" target="_blank">
								Monthly Opportunities
								</a>
							</span>
						</div>
						<div id="sales-overview" style="width: 100%;"></div>
					</div>
					<div class="col-12 col-md-12 col-lg-2">
						<div class="row">
							<div class="col-6 col-md-4 col-lg-12 mb-2">
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
						
							<div class="col-6 col-md-4 col-lg-12 mb-2">
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

							<div class="col-6 col-md-4 col-lg-12 mb-2">
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
					<div class="col-12 col-md-4 col-lg-4 card">
						<div class="row">
							<div class="col-6">
								<div class="row mb-2">
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

								<div class="row mb-2">
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

								<div class="row mb-2">
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

							<div class="col-6">
								<div class="row mb-2">
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
								<div class="row mb-2">
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
					
					<div class="col-12 col-md-4 col-lg-6">
						<div class="card card-flush">
							<div class="card-header py-2 mb-3">
								<h3 class="card-title align-items-start flex-column">
									<span class="card-label fw-bold text-gray-800"><a href="https://dev.64network.com/app/query-report/Opportunity%20Report?company=64+Network+Security+Pvt+Ltd+-+TG&timespan=last+week&from_date=2023-04-01&to_date=2024-03-31&group_by=Opportunity&based_on=Expected+Date&user=Administrator" target="_blank">Sales Stages</a></span>
									<span class="text-gray-500 mt-1 fw-semibold fs-6"></span>
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
													<a href="https://dev.64network.com/app/query-report/Renewals%20Analytics?company=64+Network+Security+Pvt+Ltd+-+TG&timespan=last+week&from_date=2023-04-01&to_date=2024-03-31&based_on=End+Date&group_by=Renewals" target="_blank">
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
													<a href="#">
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
						<div class="row">
						<div class="title1">This Month</div>
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



				

				<div class="row mt-5">
					<div class="col-xl-6 mb-5 mb-xxl-6">
						<div class="card card-flush">
							<div class="card-header">
								<div class="card-title d-flex flex-column">
									<span class="text-gray-500 pt-1 fw-semibold fs-6"><a href="https://dev.64network.com/app/query-report/Opportunity%20Report?company=64+Network+Security+Pvt+Ltd+-+TG&timespan=last+week&from_date=2023-04-01&to_date=2024-03-31&group_by=Brand&based_on=Expected+Date&sales_stage=%5B%22Closed+Won%22%5D&user=Administrator" target="_blank">Brand Wise Sales</a></span>
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
									<span class="text-gray-500 pt-1 fw-semibold fs-6"><a href="https://dev.64network.com/app/query-report/Opportunity%20Report?company=64+Network+Security+Pvt+Ltd+-+TG&timespan=last+week&from_date=2023-04-01&to_date=2024-03-31&group_by=Opportunity&based_on=Expected+Date&sales_stage=%5B%22Closed+Won%22%5D&user=Administrator" target="_blank">Item Group Wise Sales</a></span>
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
				
			
				<div class="row mt-3">
					<div class="col-12 col-md-6 col-lg-6">
						<div class="card card-flush h-lg-100">
							<div class="card-header py-7 mb-3">
								<h3 class="card-title align-items-start flex-column">
									<span class="card-label fw-bold text-gray-800"><a href="#" target="_blank">Sales Over Time By Value</a></span>
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
			</div>
		
		
		
			<div class="tab-pane fade" id="target-content" role="tabpanel" aria-labelledby="target-tab">
				<div class="title1">Target Dashboard</div>
				<div class="row mt-5">
					<div class="col-12 col-md-12 col-lg-12">
						<div id="target-overview" style="width: 100%;"></div>
					</div>
				</div>

				<div class="row mt-5">
					<div class="col-12 col-md-6 col-lg-4">
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

					<div class="col-12 col-md-6 col-lg-4">
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

					<div class="col-12 col-md-6 col-lg-4">
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
		
			<div class="tab-pane fade" id="account-content" role="tabpanel" aria-labelledby="account-tab">
				<p>Account Dashboard </p>
			
			</div>

		</div>


		<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
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


	`
};


