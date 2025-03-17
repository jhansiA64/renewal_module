// frappe.pages['opportunity-dashboar'].on_page_load = function(wrapper) {
// 	var page = frappe.ui.make_app_page({
// 		parent: wrapper,
// 		title: 'Opportunity Dashboard',
// 		single_column: true
// 	});
// }

frappe.pages['opportunity-dashboar'].on_page_load = function (wrapper) {
	new Mypage(wrapper);
};

class Mypage {
	constructor(wrapper) {
		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: 'Opportunity Dashboard',
			single_column: true
		});
		this.make();
	}

	make() {
		let body = frappe.customer_app_page.body; // Access the stored body HTML
		// Append content correctly
		$(this.page.main).append(body);
		// Add Refresh button
		this.add_refresh_button();
		// Add Sales Person dropdown beside Refresh
		this.add_sales_person();

		// Get total price after the page loads
		this.get_won_amount();
		this.get_opp_count();
		this.get_total_amount();
		this.get_lost_amount();
		// this.get_item_group_data();

		//rnwls
		this.get_rnwls_count();
		this.get_cofed_rnwls();
		this.get_pending_rnwls();
		this.get_lost_rnwls();

		// Ensure Chart.js is loaded before rendering the chart
		frappe.require(["https://cdn.jsdelivr.net/npm/chart.js"], () => {
			// console.log("Chart.js loaded");
			this.render_chart_bar(); // Call after ensuring Chart.js is available
			this.render_item_group_bar_chart();
		});
		

		// Delay setup to ensure DOM is fully ready
		setTimeout(() => {
			this.setup();
		}, 1000);

		

	}

	add_refresh_button() {
		let me = this;
		this.page.set_secondary_action('Refresh', function () {
			location.reload(); // Reload the page
		}, 'refresh');
	}

	add_sales_person() {
		let me = this;

		// Create a dropdown input inside the header beside the Refresh button
		this.sales_person_field = $(`
			<select class="form-control" id="sales-person-dropdown" style="width: 200px; padding: 5px; border-radius: 4px;">
				<option value="">Sales Person</option>
			</select>
		`);

		// Add the dropdown beside Refresh button
		this.page.add_inner_button('', null, null).html(this.sales_person_field);
		

		frappe.call({
			method: "renewal_module.custom_module.page.opportunity_dashboar.opportunity_dashboar.get_sales_person",
			callback: function (r) {
				if (r.message) {
					let dropdown = $("#sales-person-dropdown");
					r.message.forEach(sp => {
						dropdown.append(`<option value="${sp}">${sp}</option>`);
					});

					if (r.message.length === 1) {
						$("#sales-person-dropdown").val(r.message[0]).trigger("change"); // Auto-select if only one
						me.sales_person = r.message[0];
						// console.log("r",r)
						// Fetch filtered data based on selected sales person
						me.get_total_amount(r.message[0]);
						me.get_opp_count(r.message[0]);
						me.get_won_amount(r.message[0]);
						me.get_lost_amount(r.message[0]);
						me.render_chart_bar(r.message[0]);
						me.render_item_group_bar_chart(r.message[0]);
						me.get_rnwls_count(r.message[0]);
						me.get_cofed_rnwls(r.message[0]);
						me.get_pending_rnwls(r.message[0]);
						me.get_lost_rnwls(r.message[0]);	

						me.get_data(r.message[0]);
					}
				}
			}
		});

		

		this.sales_person_field.on("change", function () {
			let sales_person = $(this).val();
			// console.log("sale person:",sales_person)
			me.sales_person = sales_person;

			// Fetch filtered data based on selected sales person
			me.get_total_amount(sales_person);
			me.get_opp_count(sales_person);
			me.get_lost_amount(sales_person);
			me.get_won_amount(sales_person);
			me.render_chart_bar(sales_person);
			me.render_item_group_bar_chart(sales_person);

			
			me.get_rnwls_count(sales_person);
			me.get_cofed_rnwls(sales_person);
			me.get_pending_rnwls(sales_person);
			me.get_lost_rnwls(sales_person);

			me.get_data(sales_person);
		});
	}

	get_won_amount(sales_person = null) {
		console.log("sales",sales_person)
		
		frappe.call({
			method: "renewal_module.custom_module.page.opportunity_dashboar.opportunity_dashboar.get_won_amount",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					console.log(r)
					let formatted_price = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(r.message);
					$("#won-amount").text(formatted_price);
					console.log("won-data",r.message)
				}
			}
		});
	}

	get_opp_count(sales_person = null) {
		// console.log("sales person",sales_person)
		frappe.call({
			method: "renewal_module.custom_module.page.opportunity_dashboar.opportunity_dashboar.get_opp_count",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					$("#total-count").text(r.message);
				}
			}
		});
	}

	get_lost_amount(sales_person = null) {
		frappe.call({
			method: "renewal_module.custom_module.page.opportunity_dashboar.opportunity_dashboar.get_lost_amount",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					let formatted_price = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(r.message);
					$("#lost-amount").text(formatted_price);
				}
			}
		});
	}

	get_total_amount(sales_person = null) {
		frappe.call({
			method: "renewal_module.custom_module.page.opportunity_dashboar.opportunity_dashboar.get_total_amount",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					let formatted_price = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(r.message);
					$("#total-amount").text(formatted_price);
				}
			}
		});
	}

	render_chart_bar(sales_person = null) {
		let me = this;
		frappe.call({
			method: "renewal_module.custom_module.page.opportunity_dashboar.opportunity_dashboar.get_opportunity_data",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					let labels = [];
					let data = [];

					r.message.forEach(item => {
						labels.push(item.brand);
						data.push(item.amount);
					});

					me.update_chart(labels, data);
				}
			}
		});
	}

	update_chart(labels, data) {
		let ctx = document.getElementById('sales-chart').getContext('2d');
		new Chart(ctx, {
			type: 'bar',
			data: {
				labels: labels,
				datasets: [{
					label: 'Brand-wise Sales Amount',
					data: data,
					//backgroundColor: labels.map(() => this.getRandomColor()), // Dynamic colors
					backgroundColor:'#03f0fc',
					borderColor: '#03f0fc',
					borderWidth: 1
				}]
			},
			options: {
				indexAxis: 'x',
				responsive: true,
				plugins: {
					legend: {
						display: false
					}
				},
				scales: {
					x: {
						beginAtZero: true,
						ticks: {
							maxRotation: 0,
							minRotation: 0,
							autoSkip: true,
							autoSkipPadding: 5,
							font: { size: 10 }
						}
					},
					y: {
						beginAtZero: true
					}
				}
			}
		});
	}

	// Function to generate random colors for bars
	// getRandomColor() {
	// 	return `#${Math.floor(Math.random() * 16777215).toString(16)}`;
	// }

	render_item_group_bar_chart(sales_person = null) {
		// console.log("item_group",sales_person)
		let me = this;
		frappe.call({
			method: "renewal_module.custom_module.page.opportunity_dashboar.opportunity_dashboar.get_item_group",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					let labels = [];
					let data = [];

					r.message.forEach(item => {
						labels.push(item.item_group);
						data.push(item.amount);
					});

					me.update_item_group_chart(labels, data);
				}
			}
		});
	}

	update_item_group_chart(labels, data) {
		let ctx = document.getElementById('sales-item-group-chart').getContext('2d');
		new Chart(ctx, {
			type: 'bar',
			data: {
				labels: labels,
				datasets: [{
					label: 'item-group-wise Sales Amount',
					data: data,
					//backgroundColor: labels.map(() => this.getRandomColor()), // Dynamic colors
					backgroundColor: '#24124f',
					borderColor: '#24124f',
					borderWidth: 1
				}]
			},
			options: {
				indexAxis: 'x',
				responsive: true,
				plugins: {
					legend: {
						display: false
					}
				},
				scales: {
					x: {
						beginAtZero: true,
						ticks: {
							maxRotation: 0,
							minRotation: 0,
							autoSkip: true,
							autoSkipPadding: 5,
							font: { size: 10 }
						}
					},
					y: {
						beginAtZero: true
					}
				}
			}
		});
	}



	//rewals

	get_rnwls_count(sales_person = null) {
		frappe.call({
			method:"renewal_module.custom_module.page.opportunity_dashboar.renewals.get_rnwls_count",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					$("#rnwls-count").text(r.message);
				}
			}
		});
	}

	get_cofed_rnwls(sales_person = null) {
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


	//funnel

	setup() {
		// console.log("Setting up funnel wrapper");

		setTimeout(() => {
			this.get_data();
		}, 100);
	}

	// get_data() {
	// 	console.log("Fetching static data");
	// 	let data = [
	// 		{ title: "Active Leads", value: 100, color: "#B03B46" },
	// 		{ title: "Opportunities", value: 80, color: "#F09C00" },
	// 		{ title: "Quotations", value: 50, color: "#006685" },
	// 		{ title: "Converted", value: 30, color: "#00AD65" }
	// 	];
	// 	console.log("Data received:", data);
	// 	this.render_funnel(data);
	// }

	get_data(sales_person = null) {
		// console.log("Fetching funnel data from backend...");
		let me = this;
		frappe.call({
			method: "renewal_module.custom_module.page.opportunity_dashboar.opportunity_dashboar.get_funnel_data",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					// console.log("Original Data:", r.message);
					// Sort the data dynamically in descending order of value
					let sorted_data = r.message.sort((a, b) => b.value - a.value);
					// console.log("Sorted Data:", sorted_data);
					me.render_funnel(sorted_data);
				} else {
					console.error("Error: No data received for funnel.");
				}
			},
			error: function (err) {
				console.error("Error fetching funnel data:", err);
			}
		});
	}



	render_funnel(data) {
		// console.log("Rendering funnel chart");

		this.prepare_funnel();

		if (!this.context) {
			console.error("Error: Canvas context is not initialized.");
			return;
		}

		let context = this.context;
		let { width, height } = this.options;

		context.clearRect(0, 0, width, height); // Clear old drawings

		let x_start = width * 0.1;
		let x_end = width * 0.9;
		let y = 0;
		let section_height = height / data.length;

		data.forEach((d, i) => {
			let next_width_factor = 1 - (i + 1) / data.length;
			let current_width_factor = 1 - i / data.length;

			let x_start_next = width * (0.5 - next_width_factor / 2);
			let x_end_next = width * (0.5 + next_width_factor / 2);

			context.fillStyle = d.color;
			context.strokeStyle = "#FFF";
			context.lineWidth = 2;

			context.beginPath();
			context.moveTo(x_start, y);
			context.lineTo(x_end, y);
			context.lineTo(x_end_next, y + section_height);
			context.lineTo(x_start_next, y + section_height);
			context.closePath();
			context.fill();
			context.stroke();

			// Draw text
			context.fillStyle = "#000";
			context.font = "6px Roboto";
			context.fillText(`${d.amount} - ${d.sales_stage}`, width / 2 - 40, y + section_height / 2);

			y += section_height;
			x_start = x_start_next;
			x_end = x_end_next;
		});
	}

	prepare_funnel() {
		// console.log("Preparing funnel dimensions");

		this.canvas = document.getElementById("sales-funnel");
		if (!this.canvas) {
			console.error("Sales Funnel canvas not found!");
			return;
		}

		this.context = this.canvas.getContext("2d");
		this.options = {
			width: this.canvas.width,
			height: this.canvas.height
		};

		// console.log("Canvas initialized", this.canvas);
	}


}


// Store HTML content in frappe.customer_app_page
frappe.customer_app_page = {
	body: `
		
        <div class="row">
			<div class="col-12 col-md-6 col-lg-8 mb-4">
				<div class="row">
					<div class="col-6 col-md-4 col-lg-3">
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
									<div class="number ellipsis blue" id="total-count">0</div>
								</div>
							</div>
						</div>
					</div>

					<div class="col-6 col-md-4 col-lg-3">
						<div class="widget number-widget-box" data-widget-name="Opp Amount(Lw)">
							<div class="widget-head">
								<div class="widget-label">
									<div class="widget-title">
										<span class="ellipsis" title="Opp Amount(Lw)">
											<a href="https://dev.64network.com/app/query-report/Opportunity%20Report?company=64+Network+Security+Pvt+Ltd+-+TG&timespan=last+week&from_date=2023-04-01&to_date=2024-03-31&group_by=Opportunity&based_on=Creation&user=Administrator" target="_blank">
											Opp Amount(Lw)
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
									<div class="number ellipsis blue" id="total-amount">₹ 0.0</div>
								</div>
							</div>
						</div>
					</div>
					
					<div class="col-6 col-md-4 col-lg-3">

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
									<div class="number green ellipsis" id="won-amount">₹0.00</div>
								</div>
							</div>
						</div>

					</div>
					
					<div class="col-6 col-md-4 col-lg-3">

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
									<div class="number ellipsis red" id="lost-amount">₹ 0.00</div>
								</div>
							</div>
						</div>
					</div>	
            	</div>

				<div class="row mt-2">
					<div class="col-12 col-lg-6">
							<div class="chart-container" style="width: 100%; margin: auto;">
							<div class="widget-title mb-2" style="font-weight:500" >
							<a href="https://dev.64network.com/app/query-report/Opportunity%20Report?company=64+Network+Security+Pvt+Ltd+-+TG&timespan=last+week&from_date=2023-04-01&to_date=2024-03-31&group_by=Brand&based_on=Expected+Date&sales_stage=%5B%22Closed+Won%22%5D&user=Administrator" target="_blank">Brand Wise Sales</a></div>
							<canvas id="sales-chart"></canvas>
						</div>
					</div>
					<div class="col-12 col-lg-6">
						<div class="chart-container" style="width: 100%; margin: auto;">
							<div class="widget-title mb-2" style="font-weight:500" >Item Group Wise Sales</div>
							<canvas id="sales-item-group-chart"></canvas>
						</div>
					</div>
				</div>

			</div>

			<div class="col-12 col-md-6 col-lg-4 mb-4">
				<div class="widget-title mb-2" style="font-weight:500" >Sales Funnel</div>
				<div class="row h-100">
					<canvas id="sales-funnel"></canvas>
				</div>
			</div>
			

        </div>	

		
		<div class="row mt-2">
            <div class="col-6 col-md-2 col-lg-2">
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
			
			<div class="col-6 col-md-2 col-lg-2">

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

			<div class="col-6 col-md-2 col-lg-2">

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

			<div class="col-6 col-md-2 col-lg-2">

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

		

    `
};