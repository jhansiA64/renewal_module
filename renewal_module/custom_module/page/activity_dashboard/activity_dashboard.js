/*frappe.pages['activity-dashboard'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'None',
		single_column: true
	});
}*/


frappe.pages['activity-dashboard'].on_page_load = function (wrapper) {
	frappe._activity_dashboard_page = new Mypage(wrapper);  // Store instance globally
};

frappe.router.on('change', () => {
	const route = frappe.get_route();
	if (frappe._activity_dashboard_page && route[0] !== "activity-dashboard") {
		//localStorage.removeItem("activeTab"); // Clear targets from localStorage
		location.reload(); // Reload the page
		localStorage.removeItem("sales_person"); // Clear salesperson from localStorage
	}
});


class Mypage {
	constructor(wrapper) {
		this.wrapper = wrapper;
		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: '', // No page title
			single_column: true
		});
		this.load_css(() => {
			this.make();
		});
	}

	load_css(callback) {
		frappe.require([
			"/assets/renewal_module/css/employee-dashboard/datatables.bundle1.css",
			"/assets/renewal_module/css/employee-dashboard/plugins.bundle1.css",
			"/assets/renewal_module/css/employee-dashboard/style.bundle1.css",
			"/assets/renewal_module/css/employee-dashboard/vis-timeline.bundle1.css"
		], () => {
			if (callback) callback(); // CSS loaded, continue
		});
	}

	make() {
		//console.log("Appending body content...");
		let body = frappe.customer_app_page.body;
		$(this.page.main).append(body);
		this.add_sales_person();
		this.update_links();
		this.add_refresh_button();
		//this.add_navigation_button();
		//first row
		this.get_leads_count();
		this.get_quoted_count();
		this.get_demo_count();
		this.get_new_customer_count();
		this.get_appointment_count();
		this.get_client_visit_count();
		//this.get_calls_count();
		//this.get_training_count();
		//this.get_sessions_count();

		//activity target 
		this.get_calls_tm();
		this.get_appointments_tm();
		this.get_demos_tm();
		this.get_leads_tm();
		this.get_sessions_tm();
		this.get_trainings_tm();

	}

	add_refresh_button() {
		this.page.set_secondary_action('Refresh', function () {
			// Reload the page
			location.reload();
		}, 'refresh');
	}

	bindEvents() {
		//console.log("Binding events...");
		const salesDropdown = document.getElementById("sales-person-dropdown");
		const updatedashboard = () => {
			let sales_person = salesDropdown.value || "";
			//console.log("Trigger Rnwl update with:", sales_person, time_filter2, from_date, to_date);
			//first row
			this.get_leads_count(sales_person);
			this.get_quoted_count(sales_person);
			this.get_demo_count(sales_person);
			this.get_new_customer_count(sales_person);
			this.get_appointment_count(sales_person);
			this.get_client_visit_count(sales_person);
			//this.get_calls_count();
			//this.get_training_count();
			//this.get_sessions_count();
			//activity target 
			this.get_calls_tm(sales_person);
			this.get_appointments_tm(sales_person);
			this.get_demos_tm(sales_person);
			this.get_leads_tm(sales_person);
			this.get_sessions_tm(sales_person);
			this.get_trainings_tm(sales_person);

		};
		salesDropdown.addEventListener("change", updatedashboard);

	}


	add_sales_person() {
		let me = this;
		this.sales_person_field = $(`
			<div class="ml-2">
				<div class="select-wrapper">
					<select class="form-control" id="sales-person-dropdown" style="width:100%;max-width:150px;">
						<option value="">Sales Person</option>
					</select>
				</div>
			</div>
		`);
		//$(".page-actions").append(this.sales_person_field);
		// Append only to visible and valid page-actions container
		$(".page-actions:visible").first().append(this.sales_person_field);
		let $dropdown = $("#sales-person-dropdown");
		//console.log("Adding sales person field to page actions:", $("#sales-person-dropdown"));
		frappe.call({
			method: "renewal_module.custom_module.page.activity_dashboard.activity_dashboard.get_sales_person",
			callback: function (r) {
				if (r.message && $dropdown.length) {
					let list = r.message.sales_person_list || [];
					let defaultSP = r.message.default_sales_person || "";
					let storedSP = localStorage.getItem("sales_person");

					let sortedSalesPersons = list.sort((a, b) => a.localeCompare(b));
					sortedSalesPersons.forEach(sp => {
						$dropdown.append(`<option value="${sp}">${sp}</option>`);
					});

					setTimeout(() => {
						let toSelect = "";
						if (storedSP && list.includes(storedSP)) {
							toSelect = storedSP;
						} else if (defaultSP && list.includes(defaultSP)) {
							toSelect = defaultSP;
						} else if (list.length === 1) {
							toSelect = list[0];
						}
						$dropdown.val(toSelect);
						localStorage.setItem("sales_person", toSelect);
						$dropdown.trigger("change");
						me.update_dashboard_data(toSelect);
					}, 100);
				}
			}
		});
		// When the user selects a salesperson, store it and update the dashboard
		$dropdown.off("change").on("change", function () {
			let sales_person = $(this).val();
			localStorage.setItem("sales_person", sales_person);
			me.update_dashboard_data(sales_person);  // handles all sections
		});
	}

	// Function to update all dashboard data
	update_dashboard_data(sales_person) {
		console.log("Updating dashboard for:", sales_person);
		this.update_links(sales_person);
		//first row
		this.get_leads_count(sales_person);
		this.get_quoted_count(sales_person);
		this.get_demo_count(sales_person);
		this.get_new_customer_count(sales_person);
		this.get_appointment_count(sales_person);
		this.get_client_visit_count(sales_person);
		//this.get_calls_count(sales_person);
		//this.get_training_count(sales_person);
		//this.get_sessions_count(sales_person);
		//activity target 
		this.get_calls_tm(sales_person);
		this.get_appointments_tm(sales_person);
		this.get_demos_tm(sales_person);
		this.get_leads_tm(sales_person);
		this.get_sessions_tm(sales_person);
		this.get_trainings_tm(sales_person);
	}

	//urls dynamically add salesperson
	update_links(sales_person) {
		$(".sales-link").each(function () {
			let baseUrl = $(this).data("base-url");
			if (!baseUrl) return;
			try {
				let updatedUrl = new URL(baseUrl);
				if (sales_person) {
					updatedUrl.searchParams.set("sales_person", sales_person);
				} else {
					updatedUrl.searchParams.delete("sales_person");
				}
				$(this).attr("href", updatedUrl.toString());
				//console.log("Updated link:", updatedUrl.toString());
			} catch (err) {
				console.error("Invalid baseUrl:", baseUrl, err);
			}
		});
	}

	//first row

	get_leads_count(sales_person = null) {
		//console.log("count sales person:", sales_person)
		$("#leads-count").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.activity_dashboard.activity_dashboard.get_leads_count",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					let count = r.message || 0;
					$("#leads-count").text(count).attr("title", count);
				}
			}
		});
	}

	get_quoted_count(sales_person = null) {
		//console.log("count sales person:", sales_person)
		$("#quoted-count").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.activity_dashboard.activity_dashboard.get_quoted_count",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					let count = r.message || 0;
					$("#quoted-count").text(count).attr("title", count);
				}
			}
		});
	}

	get_demo_count(sales_person = null) {
		//console.log("count sales person:", sales_person)
		$("#demo-count").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.activity_dashboard.activity_dashboard.get_demo_count",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					let count = r.message || 0;
					$("#demo-count").text(count).attr("title", count);
				}
			}
		});
	}

	get_new_customer_count(sales_person = null) {
		//console.log("count sales person:", sales_person)
		$("#new-customer-count").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.activity_dashboard.activity_dashboard.get_new_customer_count",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					let count = r.message || 0;
					$("#new-customer-count").text(count).attr("title", count);
				}
			}
		});
	}

	get_appointment_count(sales_person = null) {
		//console.log("count sales person:", sales_person)
		$("#appointment-count").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.activity_dashboard.activity_dashboard.get_appointment_count",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					let count = r.message || 0;
					$("#appointment-count").text(count).attr("title", count);
				}
			}
		});
	}

	get_client_visit_count(sales_person = null) {
		//console.log("count sales person:", sales_person)
		$("#client-visit-count").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.activity_dashboard.activity_dashboard.get_client_visit_count",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					let count = r.message || 0;
					$("#client-visit-count").text(count).attr("title", count);
				}
			}
		});
	}

	get_calls_count(sales_person = null) {
		//console.log("count sales person:", sales_person)
		$("#calls-count").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.activity_dashboard.activity_dashboard.get_calls_count",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					let count = r.message || 0;
					$("#calls-count").text(count).attr("title", count);
				}
			}
		});
	}

	get_training_count(sales_person = null) {
		//console.log("count sales person:", sales_person)
		$("#training-count").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.activity_dashboard.activity_dashboard.get_training_count",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					let count = r.message || 0;
					$("#training-count").text(count).attr("title", count);
				}
			}
		});
	}

	get_sessions_count(sales_person = null) {
		//console.log("count sales person:", sales_person)
		$("#session-count").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.activity_dashboard.activity_dashboard.get_sessions_count",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					let count = r.message || 0;
					$("#session-count").text(count).attr("title", count);
				}
			}
		});
	}

	//activity target 

	get_calls_tm(sales_person = null) {
		frappe.call({
			method: "renewal_module.custom_module.page.activity_dashboard.activity_target.get_calls_tm",
			args: { sales_person: sales_person },
			callback: (response) => {
				if (response.message) {
					//console.log("calls:", response.message);
					let target_tm = Number(response.message.target) || 0;
					// let achieved_tm = Number(response.message.achieved);
					// let achieved_percentage = (achieved_tm / target_tm) * 100;

					// let achieved_color = "red";
					// if (achieved_percentage >= 0 && achieved_percentage < 50) {
					// 	achieved_color = '#FF0000';
					// } else if (achieved_percentage >= 50 && achieved_percentage < 60) {
					// 	achieved_color = '#FFA500';
					// } else if (achieved_percentage >= 60 && achieved_percentage < 80) {
					// 	achieved_color = '#0000FF';
					// } else if (achieved_percentage >= 80 && achieved_percentage < 100) {
					// 	achieved_color = '#4CAF50';
					// } else if (achieved_percentage >= 100) {
					// 	achieved_color = '#FFD700';
					// }

					const targetEl = document.getElementById("calls-target-tm");
					// const achievedEl = document.getElementById("calls-achieved-tm");
					// const percentEl = document.getElementById("calls-achieved-percent-tm"); // ✅ Corrected ID

					if (targetEl) {
						targetEl.innerHTML = target_tm.toLocaleString("en-IN");
						targetEl.style.color = "blue";
						targetEl.setAttribute("title", target_tm.toLocaleString("en-IN"));

					}
					// if (achievedEl) {
					// 	achievedEl.innerHTML = achieved_tm.toLocaleString("en-IN");
					// 	achievedEl.style.color = achieved_color;
					// }
					// if (percentEl) {
					// 	percentEl.innerHTML = achieved_percentage.toFixed(2) + "%";
					// }
				}
			}
		});
	}


	get_appointments_tm(sales_person = null) {
		frappe.call({
			method: "renewal_module.custom_module.page.activity_dashboard.activity_target.get_appointments_tm",
			args: { sales_person: sales_person },
			callback: (response) => {
				if (response.message) {
					//console.log("appointments:", response.message);
					let target_tm = Number(response.message.target) || 0;
					//let achieved_tm = Number(response.message.achieved);
					//let achieved_percentage = (achieved_tm / target_tm) * 100;

					// let achieved_color = "red";
					// if (achieved_percentage >= 0 && achieved_percentage < 50) {
					// 	achieved_color = '#FF0000';
					// } else if (achieved_percentage >= 50 && achieved_percentage < 60) {
					// 	achieved_color = '#FFA500';
					// } else if (achieved_percentage >= 60 && achieved_percentage < 80) {
					// 	achieved_color = '#0000FF';
					// } else if (achieved_percentage >= 80 && achieved_percentage < 100) {
					// 	achieved_color = '#4CAF50';
					// } else if (achieved_percentage >= 100) {
					// 	achieved_color = '#FFD700';
					// }

					const targetEl = document.getElementById("appointments-target-tm");
					//const achievedEl = document.getElementById("appointments-achieved-tm");
					// const percentEl = document.getElementById("appointments-achieved-percent-tm"); // ✅ Fixed ID

					if (targetEl) {
						targetEl.innerHTML = target_tm.toLocaleString("en-IN");
						targetEl.style.color = "blue";
						targetEl.setAttribute("title", target_tm.toLocaleString("en-IN"));
					}
					// if (achievedEl) {
					// 	achievedEl.innerHTML = achieved_tm.toLocaleString("en-IN");
					// 	achievedEl.style.color = achieved_color;
					// }
					// if (percentEl) {
					// 	percentEl.innerHTML = achieved_percentage.toFixed(2) + "%";
					// }
				}
			}
		});
	}


	get_demos_tm(sales_person = null) {
		frappe.call({
			method: "renewal_module.custom_module.page.activity_dashboard.activity_target.get_demos_tm",
			args: { sales_person: sales_person },
			callback: (response) => {
				if (response.message) {
					//console.log("demos:", response.message);
					let target_tm = Number(response.message.target) || 0;
					// let achieved_tm = Number(response.message.achieved);
					// let achieved_percentage = (achieved_tm / target_tm) * 100;

					// let achieved_color = "red";
					// if (achieved_percentage >= 0 && achieved_percentage < 50) {
					// 	achieved_color = '#FF0000';
					// } else if (achieved_percentage >= 50 && achieved_percentage < 60) {
					// 	achieved_color = '#FFA500';
					// } else if (achieved_percentage >= 60 && achieved_percentage < 80) {
					// 	achieved_color = '#0000FF';
					// } else if (achieved_percentage >= 80 && achieved_percentage < 100) {
					// 	achieved_color = '#4CAF50';
					// } else if (achieved_percentage >= 100) {
					// 	achieved_color = '#FFD700';
					// }

					const targetEl = document.getElementById("demos-target-tm");
					// const achievedEl = document.getElementById("demos-achieved-tm");
					// const percentEl = document.getElementById("demos-achieved-percent-tm"); // Fixed ID

					if (targetEl) {
						targetEl.innerHTML = target_tm.toLocaleString("en-IN");
						targetEl.style.color = "blue";
						targetEl.setAttribute("title", target_tm.toLocaleString("en-IN"));
					}
					// if (achievedEl) {
					// 	achievedEl.innerHTML = achieved_tm.toLocaleString("en-IN");
					// 	achievedEl.style.color = achieved_color;
					// }
					// if (percentEl) {
					// 	percentEl.innerHTML = achieved_percentage.toFixed(2) + "%";
					// }
				}
			}
		});
	}


	get_leads_tm(sales_person = null) {
		frappe.call({
			method: "renewal_module.custom_module.page.activity_dashboard.activity_target.get_leads_tm",
			args: { sales_person: sales_person },
			callback: (response) => {
				if (response.message) {
					//console.log("leads:", response.message);
					let target_tm = Number(response.message.target) || 0;
					// let achieved_tm = Number(response.message.achieved);
					// let achieved_percentage = (achieved_tm / target_tm) * 100;

					// let achieved_color = "red";
					// if (achieved_percentage >= 0 && achieved_percentage < 50) {
					// 	achieved_color = '#FF0000';
					// } else if (achieved_percentage >= 50 && achieved_percentage < 60) {
					// 	achieved_color = '#FFA500';
					// } else if (achieved_percentage >= 60 && achieved_percentage < 80) {
					// 	achieved_color = '#0000FF';
					// } else if (achieved_percentage >= 80 && achieved_percentage < 100) {
					// 	achieved_color = '#4CAF50';
					// } else if (achieved_percentage >= 100) {
					// 	achieved_color = '#FFD700';
					// }

					const targetEl = document.getElementById("leads-target-tm");
					// const achievedEl = document.getElementById("leads-achieved-tm");
					// const percentEl = document.getElementById("leads-achieved-percent-tm"); // Renamed

					if (targetEl) {
						targetEl.innerHTML = target_tm.toLocaleString("en-IN");
						targetEl.style.color = "blue";
						targetEl.setAttribute("title", target_tm.toLocaleString("en-IN"));
					}
					// if (achievedEl) {
					// 	achievedEl.innerHTML = achieved_tm.toLocaleString("en-IN");
					// 	achievedEl.style.color = achieved_color;
					// }
					// if (percentEl) {
					// 	percentEl.innerHTML = achieved_percentage.toFixed(2) + "%";
					// }
				}
			}
		});
	}


	get_sessions_tm(sales_person = null) {
		frappe.call({
			method: "renewal_module.custom_module.page.activity_dashboard.activity_target.get_sessions_tm",
			args: { sales_person: sales_person },
			callback: (response) => {
				if (response.message) {
					//console.log("sessions:", response.message);
					let target_tm = Number(response.message.target) || 0;
					// let achieved_tm = Number(response.message.achieved);
					// let achieved_percentage = (achieved_tm / target_tm) * 100;

					// let achieved_color = "red";
					// if (achieved_percentage >= 0 && achieved_percentage < 50) {
					// 	achieved_color = '#FF0000';
					// } else if (achieved_percentage >= 50 && achieved_percentage < 60) {
					// 	achieved_color = '#FFA500';
					// } else if (achieved_percentage >= 60 && achieved_percentage < 80) {
					// 	achieved_color = '#0000FF';
					// } else if (achieved_percentage >= 80 && achieved_percentage < 100) {
					// 	achieved_color = '#4CAF50';
					// } else if (achieved_percentage >= 100) {
					// 	achieved_color = '#FFD700';
					// }

					const targetEl = document.getElementById("sessions-target-tm");
					// const achievedEl = document.getElementById("sessions-achieved-tm");
					// const percentEl = document.getElementById("sessions-achieved-percent-tm"); // Renamed

					if (targetEl) {
						targetEl.innerHTML = target_tm.toLocaleString("en-IN");
						targetEl.style.color = "blue";
						targetEl.setAttribute("title", target_tm.toLocaleString("en-IN"));
					}
					// if (achievedEl) {
					// 	achievedEl.innerHTML = achieved_tm.toLocaleString("en-IN");
					// 	achievedEl.style.color = achieved_color;
					// }
					// if (percentEl) {
					// 	percentEl.innerHTML = achieved_percentage.toFixed(2) + "%";
					// }
				}
			}
		});
	}



	get_trainings_tm(sales_person = null) {
		frappe.call({
			method: "renewal_module.custom_module.page.activity_dashboard.activity_target.get_trainings_tm",
			args: { sales_person: sales_person },
			callback: (response) => {
				if (response.message) {
					//console.log("trainings:", response.message);
					let target_tm = Number(response.message.target) || 0;
					// let achieved_tm = Number(response.message.achieved);
					// let achieved_percentage = (achieved_tm / target_tm) * 100;

					// let achieved_color = "red";
					// if (achieved_percentage >= 0 && achieved_percentage < 50) {
					// 	achieved_color = '#FF0000';
					// } else if (achieved_percentage >= 50 && achieved_percentage < 60) {
					// 	achieved_color = '#FFA500';
					// } else if (achieved_percentage >= 60 && achieved_percentage < 80) {
					// 	achieved_color = '#0000FF';
					// } else if (achieved_percentage >= 80 && achieved_percentage < 100) {
					// 	achieved_color = '#4CAF50';
					// } else if (achieved_percentage >= 100) {
					// 	achieved_color = '#FFD700';
					// }

					// // Update DOM safely
					const targetEl = document.getElementById("trainings-target-tm");
					// const achievedEl = document.getElementById("trainings-achieved-tm");
					// const percentageEl = document.getElementById("trainings-achieved-percent-tm");

					if (targetEl) {
						targetEl.innerHTML = target_tm.toLocaleString("en-IN");
						targetEl.style.color = "blue";
						targetEl.setAttribute("title", target_tm.toLocaleString("en-IN"));
					}
					// if (achievedEl) {
					// 	achievedEl.innerHTML = achieved_tm.toLocaleString("en-IN");
					// 	achievedEl.style.color = achieved_color;
					// }
					// if (percentageEl) {
					// 	percentageEl.innerHTML = achieved_percentage.toFixed(2) + "%";
					// }
				}
			}
		});
	}


	get_fixed_amount(sales_person = null) {
		frappe.call({
			method: "renewal_module.custom_module.page.activity_dashboard.activity_target.get_fixed_amount",
			args: { sales_person: sales_person },
			callback: (response) => {
				if (response.message) {
					//console.log("fixed amount:", response.message);
					// let fixed_amount = Number(response.message.fixed_amount) || 0;
					// const fixedamount = document.getElementById("fixed-amount");
					// fixedamount.innerHTML = fixed_amount.toLocaleString("en-IN");
				}
			}
		});
	}

	get_variable_amount(sales_person = null) {
		frappe.call({
			method: "renewal_module.custom_module.page.activity_dashboard.activity_target.get_variable_amount",
			args: { sales_person: sales_person },
			callback: (response) => {
				if (response.message) {
					//console.log("variable amount:", response.message);
					// let variable_amount = Number(response.message.variable_amount) || 0;
					// const variable = document.getElementById("variable-amount");
					// variable.innerHTML = variable_amount.toLocaleString("en-IN");

					// const target = document.getElementById("target");
					// if (variable_amount === 0) {
					// 	target.style.display = "none";
					// } else {
					// 	target.style.display = "block"; // or "inline" depending on your layout
					// }
				}
			}
		});
	}

	/*get_variable_amount() {
		let variable_amount = 100000;
		const variable = document.getElementById("variable-amount");
		variable.innerHTML = variable_amount.toLocaleString("en-IN");
		
		const target = document.getElementById("target");
		if (variable_amount === 0) {
			target.style.display = "none";
		} else {
			target.style.display = "block"; // or "inline" depending on your layout
		}
	}*/


}



// Define the HTML early
frappe.customer_app_page = {
	body: `
		<div class="box1 row" style="border-radius:10px;padding:5px;">
			<div class="widget number-widget-box" data-widget-name="Lead(lw)">
				<div class="widget-head">
					<div class="widget-label">
						<div class="widget-title">
							<span class="ellipsis" title="Lead(lw)">
								<a href="#" target="_blank">
								Lead(lw) 
								</a>
							</span>
						</div>
					</div>
				</div>
				<div class="widget-body">
					<div class="widget-content">
						<div class="number ellipsis blue" id="leads-count">0</div>
					</div>
				</div>
			</div>

			<div class="widget number-widget-box" data-widget-name="Quoted(lw)">
				<div class="widget-head">
					<div class="widget-label">
						<div class="widget-title">
							<span class="ellipsis" title="Quoted(lw)">
								<a href="#" target="_blank">
								Quoted(lw)
								</a>
							</span>
						</div>
					</div>
				</div>
				<div class="widget-body">
					<div class="widget-content">
						<div class="number ellipsis blue" id="quoted-count">0</div>
					</div>
				</div>
			</div>

			<div class="widget number-widget-box" data-widget-name="Demo/poc(lw)">
				<div class="widget-head">
					<div class="widget-label">
						<div class="widget-title">
							<span class="ellipsis" title="Demo/poc(lw)">
								<a href="#" target="_blank">
								Demo/poc(lw)
								</a>
							</span>
						</div>
					</div>
				</div>
				<div class="widget-body">
					<div class="widget-content">
						<div class="number ellipsis blue" id="demo-count">0</div>
					</div>
				</div>
			</div>

			<div class="widget number-widget-box" data-widget-name="New Customers(lw)">
				<div class="widget-head">
					<div class="widget-label">
						<div class="widget-title">
							<span class="ellipsis" title="New Customers(lw)">
								<a href="#" target="_blank">
								New Customers(lw)
								</a>
							</span>
						</div>
					</div>
				</div>
				<div class="widget-body">
					<div class="widget-content">
						<div class="number ellipsis blue" id="new-customer-count">0</div>
					</div>
				</div>
			</div>

			<div class="widget number-widget-box" data-widget-name="Appointment(lw)">
				<div class="widget-head">
					<div class="widget-label">
						<div class="widget-title">
							<span class="ellipsis" title="Appointment(lw)">
								<a href="#" target="_blank">
								Appointment(lw)
								</a>
							</span>
						</div>
					</div>
				</div>
				<div class="widget-body">
					<div class="widget-content">
						<div class="number ellipsis blue" id="appointment-count">0</div>
					</div>
				</div>
			</div>

			<div class="widget number-widget-box" data-widget-name="Client Visit(lw)">
				<div class="widget-head">
					<div class="widget-label">
						<div class="widget-title">
							<span class="ellipsis" title="Client Visit(lw)">
								<a href="#" target="_blank">
								Client Visit(lw)
								</a>
							</span>
						</div>
					</div>
				</div>
				<div class="widget-body">
					<div class="widget-content">
						<div class="number ellipsis blue" id="client-visit-count">0</div>
					</div>
				</div>
			</div>

			<div class="widget number-widget-box" data-widget-name="Calls(lw)">
				<div class="widget-head">
					<div class="widget-label">
						<div class="widget-title">
							<span class="ellipsis" title="Calls(lw)">
								<a href="#" target="_blank">
								Calls(lw)
								</a>
							</span>
						</div>
					</div>
				</div>
				<div class="widget-body">
					<div class="widget-content">
						<div class="number ellipsis blue" id="#">0</div>
					</div>
				</div>
			</div>

			<div class="widget number-widget-box" data-widget-name="Trainings(lw)">
				<div class="widget-head">
					<div class="widget-label">
						<div class="widget-title">
							<span class="ellipsis" title="Trainings(lw)">
								<a href="#" target="_blank">
								Trainings(lw)
								</a>
							</span>
						</div>
					</div>
				</div>
				<div class="widget-body">
					<div class="widget-content">
						<div class="number ellipsis blue" id="#">0</div>
					</div>
				</div>
			</div>

			<div class="widget number-widget-box" data-widget-name="Sessions(lw)">
				<div class="widget-head">
					<div class="widget-label">
						<div class="widget-title">
							<span class="ellipsis" title="Sessions(lw)">
								<a href="#" target="_blank">
								Sessions(lw)
								</a>
							</span>
						</div>
					</div>
				</div>
				<div class="widget-body">
					<div class="widget-content">
						<div class="number ellipsis blue" id="#">0</div>
					</div>
				</div>
			</div>

		</div>

		<div class="row mt-2">
			<div class="title1 mb-1">Activity Target</div>
			<div class="col-12 col-md-3 col-lg-2 mb-2">
				<div class="mb-1" style="border-radius:10px;background-color:#F3F3F3">
					<div class="row mt-1 ml-1 mr-1 mb-1">
						<div class="title2 ml-2 mt-1">Calls(TM)</div>
						<div class="col-4 col-md-12 col-lg-12 mt-1 mb-1">
							<div class="widget number-widget-box" data-widget-name="Calls Target">
								<div class="widget-head">
									<div class="widget-label">
										<div class="widget-title">
											<span class="ellipsis" title="Calls Target" style="text-align:center">
												<a href="#">Target</a>
											</span>
										</div>
									</div>
								</div>
								<div class="widget-body">
									<div class="widget-content">
										<div class="number ellipsis blue" id="calls-target-tm" style="text-align:center;font-size:26px;">0</div>
									</div>
								</div>
							</div>
						</div>
						<div class="col-4 col-md-12 col-lg-12 mt-1 mb-1">
							<div class="widget number-widget-box" data-widget-name="Calls Achieved">
								<div class="widget-head">
									<div class="widget-label">
										<div class="widget-title">
											<span class="ellipsis" title="Calls Achieved" style="text-align:center">
												<a href="#">Achieved</a>
											</span>
										</div>
									</div>
								</div>
								<div class="widget-body">
									<div class="widget-content">
										<div class="number ellipsis" id="calls-achieved-tm" style="text-align:center;font-size:26px;">0</div>
									</div>
								</div>
							</div>
						</div>
						<div class="col-4 col-md-12 col-lg-12 mt-1 mb-3">
							<div class="widget number-widget-box" data-widget-name="Calls Achieved%">
								<div class="widget-head">
									<div class="widget-label">
										<div class="widget-title">
											<span class="ellipsis" title="Calls Achieved%" style="text-align:center">
												<a href="#">Achieved%</a>
											</span>
										</div>
									</div>
								</div>
								<div class="widget-body">
									<div class="widget-content">
										<div class="number ellipsis" id="calls-achieved-percent-tm" style="text-align:center;font-size:26px;">0</div>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>		
			</div>
			<div class="col-12 col-md-3 col-lg-2 mb-2">
				<div class="mb-1" style="border-radius:10px;background-color:#F3F3F3">
					<div class="row mt-1 ml-1 mr-1 mb-1">
						<div class="title2 ml-2 mt-1">Appointment(TM)</div>
						<div class="col-4 col-md-12 col-lg-12 mt-1 mb-1">
							<div class="widget number-widget-box" data-widget-name="Appointments Target">
								<div class="widget-head">
									<div class="widget-label">
										<div class="widget-title">
											<span class="ellipsis" title="Appointments target" style="text-align:center">
												<a href="#">Target</a>
											</span>
										</div>
									</div>
								</div>
								<div class="widget-body">
									<div class="widget-content">
										<div class="number ellipsis blue" id="appointments-target-tm" style="text-align:center;font-size:26px;">0</div>
									</div>
								</div>
							</div>
						</div>
						<div class="col-4 col-md-12 col-lg-12 mt-1 mb-1">
							<div class="widget number-widget-box" data-widget-name="Appointments Achieved">
								<div class="widget-head">
									<div class="widget-label">
										<div class="widget-title">
											<span class="ellipsis" title="Appointments Achieved" style="text-align:center">
												<a href="#">Achieved</a>
											</span>
										</div>
									</div>
								</div>
								<div class="widget-body">
									<div class="widget-content">
										<div class="number ellipsis" id="appointments-achieved-tm" style="text-align:center;font-size:26px;">0</div>
									</div>
								</div>
							</div>
						</div>
						<div class="col-4 col-md-12 col-lg-12 mt-1 mb-3">
							<div class="widget number-widget-box" data-widget-name="Appointments Achieved%">
								<div class="widget-head">
									<div class="widget-label">
										<div class="widget-title">
											<span class="ellipsis" title="Appointments Achieved%" style="text-align:center">
												<a href="#">Achieved%</a>
											</span>
										</div>
									</div>
								</div>
								<div class="widget-body">
									<div class="widget-content">
										<div class="number ellipsis" id="appointments-achieved-percent-tm" style="text-align:center;font-size:26px;">0</div>
									</div>
								</div>
							</div>
						</div>
					</div>	
				</div>	
			</div>
			<div class="col-12 col-md-3 col-lg-2 mb-2">
				<div class="mb-1" style="border-radius:10px;background-color:#F3F3F3">
					<div class="row mt-1 ml-1 mr-1 mb-1">
						<div class="title2 ml-2 mt-1">Demos(TM)</div>
						<div class="col-4 col-md-12 col-lg-12 mt-1 mb-1">
							<div class="widget number-widget-box" data-widget-name="Demos Target">
								<div class="widget-head">
									<div class="widget-label">
										<div class="widget-title">
											<span class="ellipsis" title="Demos Target" style="text-align:center">
												<a href="#">Target</a>
											</span>
										</div>
									</div>
								</div>
								<div class="widget-body">
									<div class="widget-content">
										<div class="number ellipsis blue" id="demos-target-tm" style="text-align:center;font-size:26px;">0</div>
									</div>
								</div>
							</div>
						</div>
						<div class="col-4 col-md-12 col-lg-12 mt-1 mb-1">
							<div class="widget number-widget-box" data-widget-name="Demos Achieved">
								<div class="widget-head">
									<div class="widget-label">
										<div class="widget-title">
											<span class="ellipsis" title="Demos Achieved" style="text-align:center">
												<a href="#">Achieved</a>
											</span>
										</div>
									</div>
								</div>
								<div class="widget-body">
									<div class="widget-content">
										<div class="number ellipsis" id="demos-achieved-tm" style="text-align:center;font-size:26px;">0</div>
									</div>
								</div>
							</div>
						</div>
						<div class="col-4 col-md-12 col-lg-12 mt-1 mb-3">
							<div class="widget number-widget-box" data-widget-name="Demos Achieved%">
								<div class="widget-head">
									<div class="widget-label">
										<div class="widget-title">
											<span class="ellipsis" title="Demos Achieved%" style="text-align:center">
												<a href="#">Achieved%</a>
											</span>
										</div>
									</div>
								</div>
								<div class="widget-body">
									<div class="widget-content">
										<div class="number ellipsis" id="demos-achieved-percent-tm" style="text-align:center;font-size:26px;">0</div>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>		
			</div>
			<div class="col-12 col-md-3 col-lg-2 mb-2">
				<div class="mb-1" style="border-radius:10px;background-color:#F3F3F3">
					<div class="row mt-1 ml-1 mr-1 mb-1">
						<div class="title2 ml-2 mt-1">Leads(TM)</div>
						<div class="col-4 col-md-12 col-lg-12 mt-1 mb-1">
							<div class="widget number-widget-box" data-widget-name="Leads Target">
								<div class="widget-head">
									<div class="widget-label">
										<div class="widget-title">
											<span class="ellipsis" title="Leads Target" style="text-align:center">
												<a href="#">Target</a>
											</span>
										</div>
									</div>
								</div>
								<div class="widget-body">
									<div class="widget-content">
										<div class="number ellipsis" id="leads-target-tm" style="text-align:center;font-size:26px;">0</div>
									</div>
								</div>
							</div>
						</div>
						<div class="col-4 col-md-12 col-lg-12 mt-1 mb-1">
							<div class="widget number-widget-box" data-widget-name="Leads Achieved">
								<div class="widget-head">
									<div class="widget-label">
										<div class="widget-title">
											<span class="ellipsis" title="Leads Achieved" style="text-align:center">
												<a href="#">Achieved</a>
											</span>
										</div>
									</div>
								</div>
								<div class="widget-body">
									<div class="widget-content">
										<div class="number ellipsis" id="leads-achieved-tm" style="text-align:center;font-size:26px;">0</div>
									</div>
								</div>
							</div>
						</div>
						<div class="col-4 col-md-12 col-lg-12 mt-1 mb-3">
							<div class="widget number-widget-box" data-widget-name="Leads Achieved%">
								<div class="widget-head">
									<div class="widget-label">
										<div class="widget-title">
											<span class="ellipsis" title="Leads Achieved%" style="text-align:center">
												<a href="#">Achieved%</a>
											</span>
										</div>
									</div>
								</div>
								<div class="widget-body">
									<div class="widget-content">
										<div class="number ellipsis" id="leads-achieved-percent-tm" style="text-align:center;font-size:26px;">0</div>
									</div>
								</div>
							</div>
						</div>
					</div>	
				</div>		
			</div>
			<div class="col-12 col-md-12 col-lg-2 mb-2">
				<div style="border-radius:10px;background-color:#F3F3F3">
					<div class="row mt-1 ml-1 mr-1 mb-1">
						<div class="title2 ml-2 mt-1">Sessions(TM)</div>
						<div class="col-4 col-md-4 col-lg-12 mt-1 mb-1">
							<div class="widget number-widget-box" data-widget-name="Sessions Target">
								<div class="widget-head">
									<div class="widget-label">
										<div class="widget-title">
											<span class="ellipsis" title="Sessions Target" style="text-align:center">
												<a href="#">Target</a>
											</span>
										</div>
									</div>
								</div>
								<div class="widget-body">
									<div class="widget-content">
										<div class="number ellipsis" id="sessions-target-tm" style="text-align:center;font-size:26px;">0</div>
									</div>
								</div>
							</div>
						</div>
						<div class="col-4 col-md-4 col-lg-12 mt-1 mb-1">
							<div class="widget number-widget-box" data-widget-name="Sessions Achieved">
								<div class="widget-head">
									<div class="widget-label">
										<div class="widget-title">
											<span class="ellipsis" title="Sessions Achieved" style="text-align:center">
												<a href="#">Achieved</a>
											</span>
										</div>
									</div>
								</div>
								<div class="widget-body">
									<div class="widget-content">
										<div class="number ellipsis" id="sessions-achieved-tm" style="text-align:center;font-size:26px;">0</div>
									</div>
								</div>
							</div>
						</div>
						<div class="col-4 col-md-4 col-lg-12 mt-1 mb-3">
							<div class="widget number-widget-box" data-widget-name="Sessions Achieved%">
								<div class="widget-head">
									<div class="widget-label">
										<div class="widget-title">
											<span class="ellipsis" title="Sessions Achieved%" style="text-align:center">
												<a href="#">Achieved%</a>
											</span>
										</div>
									</div>
								</div>
								<div class="widget-body">
									<div class="widget-content">
										<div class="number ellipsis" id="sessions-achieved-percent-tm" style="text-align:center;font-size:26px;">0</div>
									</div>
								</div>
							</div>
						</div>
					</div>	
				</div>	
			</div>
			<div class="col-12 col-md-12 col-lg-2 mb-2">
				<div class="mb-1" style="border-radius:10px;background-color:#F3F3F3">
					<div class="row mt-1 ml-1 mr-1 mb-1">
						<div class="title2 ml-2 mt-1">Trainings(TM)</div>
						<div class="col-4 col-md-4 col-lg-12 mt-1 mb-1">
							<div class="widget number-widget-box" data-widget-name="Trainings Target">
								<div class="widget-head">
									<div class="widget-label">
										<div class="widget-title">
											<span class="ellipsis" title="Trainings Target" style="text-align:center">
												<a href="#">Target</a>
											</span>
										</div>
									</div>
								</div>
								<div class="widget-body">
									<div class="widget-content">
										<div class="number ellipsis" id="trainings-target-tm" style="text-align:center;font-size:26px;">0</div>
									</div>
								</div>
							</div>
						</div>
						<div class="col-4 col-md-4 col-lg-12 mt-1 mb-1">
							<div class="widget number-widget-box" data-widget-name="Trainings Achieved">
								<div class="widget-head">
									<div class="widget-label">
										<div class="widget-title">
											<span class="ellipsis" title="Trainings Achieved" style="text-align:center">
												<a href="#">Achieved</a>
											</span>
										</div>
									</div>
								</div>
								<div class="widget-body">
									<div class="widget-content">
										<div class="number ellipsis" id="trainings-achieved-tm" style="text-align:center;font-size:26px;">0</div>
									</div>
								</div>
							</div>
						</div>
						<div class="col-4 col-md-4 col-lg-12 mt-1 mb-3">
							<div class="widget number-widget-box" data-widget-name="Trainings Achieved%">
								<div class="widget-head">
									<div class="widget-label">
										<div class="widget-title">
											<span class="ellipsis" title="Trainings Achieved%" style="text-align:center">
												<a href="#">Achieved%</a>
											</span>
										</div>
									</div>
								</div>
								<div class="widget-body">
									<div class="widget-content">
										<div class="number ellipsis" id="trainings-achieved-percent-tm" style="text-align:center;font-size:26px;">0</div>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>	
						
			</div>
		</div>

		<div class="row" style="height:50px;"></div>

		
		<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
		<!-- Bootstrap 5 CSS CDN -->


	`
};