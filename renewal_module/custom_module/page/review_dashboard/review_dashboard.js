// frappe.pages['review-dashboard'].on_page_load = function(wrapper) {
// 	var page = frappe.ui.make_app_page({
// 		parent: wrapper,
// 		title: 'None',
// 		single_column: true
// 	});
// }

frappe.pages['review-dashboard'].on_page_load = function (wrapper) {
	//console.log("on_page_load triggered");
	// new Mypage(wrapper);
	frappe._review_dashboard_page= new Mypage(wrapper);
};

frappe.router.on('change',()=>{
	const route= frappe.get_route();
	if ( frappe._review_dashboard_page && route[0] !== "review-dashboard") {
		localStorage.removeItem("activeTab");
		location.reload();
		localStorage.removeItem("sales_person"); // Clear salesperson from localStorage
	}
})

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
		//this.make();
	}

	load_css(callback) {
		frappe.require([
			"/assets/orc/css/datatables.bundle1.css",
			"/assets/orc/css/plugins.bundle1.css",
			"/assets/orc/css/style.bundle1.css",
			"/assets/orc/css/vis-timeline.bundle1.css"
		], () => {
			if (callback) callback(); // CSS loaded, continue
		});
	}

	make() {
		//console.log("Appending body content...");
		let body = frappe.customer_app_page.body;
		$(this.page.main).append(body);
		this.add_sales_person();
		this.add_refresh_button();
		this.update_links();
		this.add_tabs();
		//first row
		this.get_leads_count();
		this.get_quoted_count();
		this.get_demo_count();
		this.get_new_customer_count();
		this.get_appointment_count();
		this.get_client_visit_count();
		//last week
		this.get_opp_count_lw();
		this.get_closed_won_amount_lw();
		this.get_closed_lost_amount_lw();
		this.get_renewal_count_lw();
		this.get_renewal_amount_lw();
		this.get_profit_amount_lw();
		this.setup_widget_click_events3();
		this.populateDropdowns3();
		//this month
		this.get_opp_count_tm();
		this.get_closed_won_amount_tm();
		this.get_closed_lost_amount_tm();
		this.get_renewal_count_tm();
		this.get_renewal_amount_tm();
		this.get_profit_amount_tm();
		this.setup_widget_click_events();
		this.populateDropdowns1();
		//renewal list
		this.get_rnwls_new_opp_count();
		this.get_rnwls_cofed_count();
		this.get_rnwls_lost_count();
		this.get_rnwls_renewed_count();
		this.get_rnwls_pending_count();
		this.setup_widget_click_events2();
		this.populateDropdowns2();
		//closures this week
		this.get_closure_opp_count_tw();
		this.get_closure_opp_amount_tw();
		this.get_closures_rnwls_count_tw();
		this.get_closures_rnwls_amount_tw();
		this.setup_widget_click_events4();
		this.populateDropdowns4();
		//closures this month
		this.get_closure_opp_count_tm();
		this.get_closure_opp_amount_tm();
		this.get_closures_rnwls_count_tm();
		this.get_closures_rnwls_amount_tm();
		//target this month
		this.get_open_opportunity_amount_tm();
		this.get_target_amount_tm();
		this.get_achieved_amount_tm();
		this.setup_widget_click_events5();
		this.populateDropdowns5();

		//target dashboard
		this.get_fixed_amount();
		this.get_variable_amount();
		this.get_sales_target();
		this.get_sales_target_tm();
		this.get_sales_target_tq();
		this.get_sales_target_ty();

		//activity target 
		this.get_calls_tm();
		this.get_appointments_tm();
		this.get_demos_tm();
		this.get_leads_tm();
		this.get_sessions_tm();
		this.get_trainings_tm();

		frappe.require(["https://cdnjs.cloudflare.com/ajax/libs/apexcharts/3.41.0/apexcharts.min.js"], () => {
			//console.log("Chart.js loaded");
			//last week
			this.brand_wise_donut_chart_lw();
			this.Item_group_donut_chart_lw();
			//this month
			//closures this week
			this.brand_wise_donut_chart_tw();
			this.Item_group_donut_chart_tw();
			//closures this month
			this.brand_wise_donut_chart_tm();
			this.Item_group_donut_chart_tm();

			//target dashboard
			this.sales_target_chart();
			this.target_category_wise_chart();
			this.target_category_wise_overall_chart();
		});

		frappe.require(["https://d3js.org/d3.v7.min.js"], () => {
			//console.log("✅ D3.js loaded successfully!");
			//this month
			this.sales_funnel_chart();
		});

		frappe.require([
			"https://cdn.jsdelivr.net/npm/chart.js"
		], () => {
			this.salespersongrowthChart();
			this.salespersongrowthChartyear();
		});

		this.loadData();  // Or "last_month", etc.
		this.bindEvents();
		this.populateDropdowns();

	}

	bindEvents() {
		//console.log("Binding events...");
		const timeFilter = document.getElementById("time-filter");
		const customDateFields = document.getElementById("custom-date-fields");
		if (!timeFilter || !customDateFields) {
			console.error("Missing elements: time-filter or custom-date-fields");
			return;
		}
		// Run toggle once on load
		this.toggleDateFields();
		// Time filter change
		timeFilter.addEventListener("change", (e) => {
			let selected = e.target.value;
			//console.log("Time filter changed to:", selected);
			this.toggleDateFields();
			//this.loadData(selected);
			this.loadData(selected, $("#sales-person-dropdown").val());
		});

		document.getElementById("brand-filter")?.addEventListener("change", () => {
			const itemGroup = document.getElementById("item-group-filter")?.value || "";
			const brand = document.getElementById("brand-filter")?.value || "";
			this.filterTableByItemGroupAndBrand(itemGroup, brand);
		});

		document.getElementById("item-group-filter")?.addEventListener("change", () => {
			const itemGroup = document.getElementById("item-group-filter")?.value || "";
			const brand = document.getElementById("brand-filter")?.value || "";
			this.filterTableByItemGroupAndBrand(itemGroup, brand);
		});

		document.getElementById("from-date").addEventListener("change", () => {
			this.tryLoadData()
		});
		document.getElementById("to-date").addEventListener("change", () => {
			this.tryLoadData()
		});

		document.querySelectorAll('.btn-group button').forEach(btn => {
			btn.addEventListener('click', () => {
				const count = parseInt(btn.dataset.count); // use data-count instead of parsing text
				this.showRows(count, btn);
				console.log("Calling showRows with", count);
			});
		});
		const loadMoreBtn = document.getElementById('load-more-btn');
		if (loadMoreBtn) {
			loadMoreBtn.addEventListener('click', () => {
				this.loadMoreRows();
				console.log("Calling loadmoreRows with", count);
			});
		}

		$('.stage-card').on('click', () => {
			const stage = $(this).data('stage');
			this.handleCardClick(stage); // updates selectedStage + applies filter
		});

		// Setup date fields for custom date selection
		function setupDisplayDateField(displayId, realId, allRealInputs) {
			const displayInput = document.getElementById(displayId);
			const realInput = document.getElementById(realId);

			// Hide all date pickers
			const hideAllPickers = () => {
				allRealInputs.forEach(input => {
					input.style.opacity = "0";
					input.style.pointerEvents = "none";
				});
			};

			displayInput.addEventListener("click", () => {
				hideAllPickers(); // Close others
				// Position real input over display input (for calendar to appear)
				const rect = displayInput.getBoundingClientRect();
				realInput.style.position = "absolute";
				//realInput.style.left = `${rect.left + window.scrollX}px`;
				//realInput.style.top = `${rect.top + window.scrollY}px`;
				realInput.style.top = "30px";
				realInput.style.zIndex = "9999";
				realInput.style.opacity = "0"; // Keep it hidden
				realInput.style.pointerEvents = "auto";
				setTimeout(() => {
					realInput.focus();
					realInput.showPicker?.(); // Show calendar (modern browsers)
				}, 10);
			});

			realInput.addEventListener("change", () => {
				if (realInput.value) {
					displayInput.value = formatDate(realInput.value); // Show formatted
				}
				hideAllPickers(); // Hide again
			});

			realInput.addEventListener("blur", () => {
				setTimeout(hideAllPickers, 100);
			});
		}

		function formatDate(dateStr) {
			if (!dateStr) return "";
			const [yyyy, mm, dd] = dateStr.split("-");
			return `${dd}-${mm}-${yyyy}`;
		}

		// Apply setup
		const allRealInputs = [
			document.getElementById("from-date"),
			document.getElementById("to-date")
		];

		setupDisplayDateField("from-date-display", "from-date", allRealInputs);
		setupDisplayDateField("to-date-display", "to-date", allRealInputs);

		// Setup time filter1 change event
		const timeFilter1 = document.getElementById("time-filter1");
		const salesDropdown = document.getElementById("sales-person-dropdown");

		const updateOpportunityCount = () => {
			let sales_person = salesDropdown.value || "";
			let time_filter1 = timeFilter1.value || "";
			//console.log("Trigger update with:", sales_person, time_filter1);
			this.get_opp_count_tm(sales_person, time_filter1);
			this.get_closed_won_amount_tm(sales_person, time_filter1);
			this.get_closed_lost_amount_tm(sales_person, time_filter1);
			this.get_renewal_count_tm(sales_person, time_filter1);
			this.get_renewal_amount_tm(sales_person, time_filter1);
			this.get_profit_amount_tm(sales_person, time_filter1);
			this.sales_funnel_chart(sales_person, time_filter1);
		};

		timeFilter1.addEventListener("change", updateOpportunityCount);
		salesDropdown.addEventListener("change", updateOpportunityCount);

		// Run this after DOM is ready
		// Update title based on selected time filter
		$(document).ready(function () {
			// On change of dropdown
			$('#time-filter1').on('change', function () {
				let selectedText = $(this).find('option:selected').text();
				$('.title3').text(selectedText);
			});

			// Set initial value on load
			let initialText = $('#time-filter1 option:selected').text();
			$('.title3').text(initialText);
		});
		// Add tooltips to number elements
		// This is for the number elements in the dashboard
		$(".number").each(function () {
			$(this).attr("title", $(this).text().trim());
		});

		// Setup time filter2 change event Renewal list
		// This is for the renewal list section
		const timeFilter2 = document.getElementById("time-filter2");
		const salesDropdown2 = document.getElementById("sales-person-dropdown");

		const updateRenewalCount = () => {
			let sales_person = salesDropdown2.value || "";
			let time_filter2 = timeFilter2.value || "";
			//console.log("Trigger update with:", sales_person, time_filter2);
			this.get_rnwls_new_opp_count(sales_person, time_filter2);
			this.get_rnwls_cofed_count(sales_person, time_filter2);
			this.get_rnwls_lost_count(sales_person, time_filter2);
			this.get_rnwls_renewed_count(sales_person, time_filter2);
			this.get_rnwls_pending_count(sales_person, time_filter2);
		};

		timeFilter2.addEventListener("change", updateRenewalCount);
		salesDropdown2.addEventListener("change", updateRenewalCount);

		// Setup change event opp last week
		// This is for the opp last week section
		const salesDropdown3 = document.getElementById("sales-person-dropdown");

		const updateOppCountLw = () => {
			let sales_person = salesDropdown3.value || "";
			//console.log("Trigger update with:", sales_person, time_filter2);
			//last week
			this.get_opp_count_lw(sales_person);
			this.get_closed_won_amount_lw(sales_person);
			this.get_closed_lost_amount_lw(sales_person);
			this.get_renewal_count_lw(sales_person);
			this.get_renewal_amount_lw(sales_person);
			this.get_profit_amount_lw(sales_person);
			//closures this week
			this.get_closure_opp_count_tw(sales_person);
			this.get_closure_opp_amount_tw(sales_person);
			this.get_closures_rnwls_count_tw(sales_person);
			this.get_closures_rnwls_amount_tw(sales_person);
			//closures this month
			this.get_closure_opp_count_tm(sales_person);
			this.get_closure_opp_amount_tm(sales_person);
			this.get_closures_rnwls_count_tm(sales_person);
			this.get_closures_rnwls_amount_tm(sales_person);
			//target
			this.get_achieved_amount_tm(sales_person);
			
		};
		salesDropdown3.addEventListener("change", updateOppCountLw);

	}

	tryLoadData() {
		const timeFilter = document.getElementById("time-filter").value;
		const fromDate = document.getElementById("from-date").value;
		const toDate = document.getElementById("to-date").value;

		if (timeFilter === "custom" && fromDate && toDate) {
			this.loadData(); // Call only if both dates are filled
		}
	}

	toggleDateFields() {
		const timeFilter = document.getElementById("time-filter");
		const customDateFields = document.getElementById("custom-date-fields");

		if (!timeFilter || !customDateFields) {
			//console.error("toggleDateFields: Missing elements");
			return;
		}

		if (timeFilter.value === "custom") {
			customDateFields.classList.remove("hidden");
			//console.log("Showing custom date fields");
		} else {
			customDateFields.classList.add("hidden");
			//console.log("Hiding custom date fields");
			document.getElementById("from-date").value = '';
			document.getElementById("to-date").value = '';
		}
	}

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
					<a class="dropdown-item nav-link1 mb-2" id="review-tab" data-target="#review-content" role="tab">Opportunity Dashboard</a>
					<a class="dropdown-item nav-link1 mb-2" id="target-tab" data-target="#target-content" role="tab">Target Dashboard</a>
					<a class="dropdown-item nav-link1 mb-2" id="sales-stage-tab" data-target="#sales-stage-content" role="tab">Sales Stage Dashboard</a>
				</div>
			</div>
		`);

		// Add to page-actions
		$(".page-actions").append(this.add_tab_field);

		// Function to activate tab
		const activateTab = (tabId) => {
			const $selectedTab = $("#" + tabId);
			const targetId = $selectedTab.data("target");
			const $selectedContent = $(targetId);

			if (!$selectedTab.length || !$selectedContent.length) {
				console.warn("Tab or content not found");
				return false;
			}

			$(".dropdown-item").removeClass("active");
			$(".tab-pane").removeClass("show active");
			$selectedTab.addClass("active");
			$selectedContent.addClass("show active");

			let selectedText = $selectedTab.text().trim();
			let $btn = $(".page-actions #dashboard-btn");
			if ($btn.length) {
				$btn.html(`${selectedText} <i class="align-middle ms-1 wh-15" data-feather="chevron-down"></i>`);
				if (typeof feather !== "undefined") feather.replace();
			}

			return true;
		};

		// Wait until tab content is available
		let interval = setInterval(() => {
			let savedTab = localStorage.getItem("activeTab") || "review-tab";
			// Try to activate saved tab, or fallback to first one
			if (!activateTab(savedTab)) {
				if (activateTab("review-tab")) {
					localStorage.setItem("activeTab", "review-tab");
				} else {
					// Tab still not ready
					return;
				}
			}
			clearInterval(interval); // stop retrying
		}, 200);

		// Bind click listeners
		$(".dropdown-item").on("click", function (event) {
			event.preventDefault();
			const tabId = $(this).attr("id");
			if (activateTab(tabId)) {
				localStorage.setItem("activeTab", tabId);
			}
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
		//$(".page-actions").append(this.sales_person_field);
		// Append only to visible and valid page-actions container
		$(".page-actions:visible").first().append(this.sales_person_field);
		let $dropdown = $("#sales-person-dropdown");
		//console.log("Adding sales person field to page actions:", $("#sales-person-dropdown"));
		frappe.call({
			method: "renewal_module.custom_module.page.review_dashboard.review_dashboard.get_sales_person",
			callback: function (r) {
				//console.log("Sales persons fetched:", r.message);
				if (r.message && $dropdown.length) {
					//let dropdown = $("#sales-person-dropdown");
					let storedSalesPerson = localStorage.getItem("sales_person");
					// Sort salesperson names alphabetically
					let sortedSalesPersons = r.message.sort((a, b) => a.localeCompare(b));
					sortedSalesPersons.forEach(sp => {
						$dropdown.append(`<option value="${sp}">${sp}</option>`);
					});
					// Automatically select the salesperson if only one exists
					// Delay selection to ensure the dropdown is populated before change event fires
					setTimeout(() => {
						if (r.message.length === 1) {
							$dropdown.val(r.message[0]).trigger("change");
							me.update_dashboard_data(r.message[0]);
						} else if (storedSalesPerson && r.message.includes(storedSalesPerson)) {
							$dropdown.val(storedSalesPerson).trigger("change");
							//me.update_dashboard_data(storedSalesPerson);
						}
					}, 100); // Slight delay to ensure DOM update

				}
			}
		});

		// When the user selects a salesperson, store it and update the dashboard
		//$("#sales-person-dropdown").on("change", function () {
		$dropdown.on("change", function () {
			let sales_person = $(this).val();
			me.update_dashboard_data(sales_person);
			localStorage.setItem("sales_person", sales_person);
		});

	}

	// Function to update all dashboard data
	update_dashboard_data(sales_person) {
		if (sales_person) {
			//console.log("Updating dashboard for:", sales_person);
			this.update_links(sales_person);
			//first row
			this.get_leads_count(sales_person);
			this.get_quoted_count(sales_person);
			this.get_demo_count(sales_person);
			this.get_new_customer_count(sales_person);
			this.get_appointment_count(sales_person);
			this.get_client_visit_count(sales_person);
			//last week
			this.get_opp_count_lw(sales_person);
			this.get_closed_won_amount_lw(sales_person);
			this.get_closed_lost_amount_lw(sales_person);
			this.get_renewal_count_lw(sales_person);
			this.get_renewal_amount_lw(sales_person);
			this.get_profit_amount_lw(sales_person);
			this.brand_wise_donut_chart_lw(sales_person);
			this.Item_group_donut_chart_lw(sales_person);
			//this month
			const time_filter1 = document.getElementById("time-filter1").value;
			this.get_opp_count_tm(sales_person, time_filter1);
			this.get_closed_won_amount_tm(sales_person, time_filter1);
			this.get_closed_lost_amount_tm(sales_person, time_filter1);
			this.get_renewal_count_tm(sales_person, time_filter1);
			this.get_renewal_amount_tm(sales_person, time_filter1);
			this.get_profit_amount_tm(sales_person, time_filter1);
			this.sales_funnel_chart(sales_person, time_filter1);
			//renewal list
			const time_filter2 = document.getElementById("time-filter2").value;
			this.get_rnwls_new_opp_count(sales_person, time_filter2);
			this.get_rnwls_cofed_count(sales_person, time_filter2);
			this.get_rnwls_lost_count(sales_person, time_filter2);
			this.get_rnwls_renewed_count(sales_person, time_filter2);
			this.get_rnwls_pending_count(sales_person, time_filter2);
			//closures this week
			this.get_closure_opp_count_tw(sales_person);
			this.get_closure_opp_amount_tw(sales_person);
			this.get_closures_rnwls_count_tw(sales_person);
			this.get_closures_rnwls_amount_tw(sales_person);
			this.brand_wise_donut_chart_tw(sales_person);
			this.Item_group_donut_chart_tw(sales_person);
			//closures this month
			this.get_closure_opp_count_tm(sales_person);
			this.get_closure_opp_amount_tm(sales_person);
			this.get_closures_rnwls_count_tm(sales_person);
			this.get_closures_rnwls_amount_tm(sales_person);
			this.brand_wise_donut_chart_tm(sales_person);
			this.Item_group_donut_chart_tm(sales_person);
			//target this month
			this.get_open_opportunity_amount_tm(sales_person);
			this.get_target_amount_tm(sales_person);
			this.get_achieved_amount_tm(sales_person);

			//target dashboard
			this.get_fixed_amount(sales_person);
			this.get_variable_amount(sales_person);
			this.sales_target_chart(sales_person);
			this.salespersongrowthChart(sales_person);
			this.salespersongrowthChartyear(sales_person);
			this.target_category_wise_chart(sales_person);
			this.target_category_wise_overall_chart(sales_person);
			this.get_sales_target(sales_person);
			this.get_sales_target_tm(sales_person);
			this.get_sales_target_tq(sales_person);
			this.get_sales_target_ty(sales_person);
			//activity target 
			this.get_calls_tm(sales_person);
			this.get_appointments_tm(sales_person);
			this.get_demos_tm(sales_person);
			this.get_leads_tm(sales_person);
			this.get_sessions_tm(sales_person);
			this.get_trainings_tm(sales_person);

			//sales stages
			const timeFilter = document.getElementById("time-filter").value;
			this.loadData(timeFilter, sales_person);

		}
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
			method: "renewal_module.custom_module.page.review_dashboard.review_dashboard.get_leads_count",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					let count = r.message || 0;
					$("#leads-count").text(count);
				}
			}
		});
	}

	get_quoted_count(sales_person = null) {
		//console.log("count sales person:", sales_person)
		$("#quoted-count").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.review_dashboard.review_dashboard.get_quoted_count",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					let count = r.message || 0;
					$("#quoted-count").text(count);
				}
			}
		});
	}

	get_demo_count(sales_person = null) {
		//console.log("count sales person:", sales_person)
		$("#demo-count").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.review_dashboard.review_dashboard.get_demo_count",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					let count = r.message || 0;
					$("#demo-count").text(count);
				}
			}
		});
	}

	get_new_customer_count(sales_person = null) {
		//console.log("count sales person:", sales_person)
		$("#new-customer-count").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.review_dashboard.review_dashboard.get_new_customer_count",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					let count = r.message || 0;
					$("#new-customer-count").text(count);
				}
			}
		});
	}

	get_appointment_count(sales_person = null) {
		//console.log("count sales person:", sales_person)
		$("#appointment-count").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.review_dashboard.review_dashboard.get_appointment_count",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					let count = r.message || 0;
					$("#appointment-count").text(count);
				}
			}
		});
	}

	get_client_visit_count(sales_person = null) {
		//console.log("count sales person:", sales_person)
		$("#client-visit-count").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.review_dashboard.review_dashboard.get_client_visit_count",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					let count = r.message || 0;
					$("#client-visit-count").text(count);
				}
			}
		});
	}

	//last week 
	get_opp_count_lw(sales_person = null) {
		//console.log("count sales person:", sales_person)
		$("#opp-count-lw").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.review_dashboard.review_dashboard.get_opp_count_lw",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					let count = r.message[0] || 0;
					$("#opp-count-lw").text(count).attr("title", count);
				}
			}
		});
	}

	get_closed_won_amount_lw(sales_person = null) {
		$("#closed-won-amount-lw").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.review_dashboard.review_dashboard.get_closed_won_amount_lw",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					let formatted_price = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(r.message[0]);
					$("#closed-won-amount-lw").text(formatted_price).attr("title", formatted_price);
				}
			}
		});
	}

	get_closed_lost_amount_lw(sales_person = null) {
		$("#closed-lost-amount-lw").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.review_dashboard.review_dashboard.get_closed_lost_amount_lw",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					let formatted_price = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(r.message[0]);
					$("#closed-lost-amount-lw").text(formatted_price).attr("title", formatted_price);
				}
			}
		});
	}

	get_renewal_count_lw(sales_person = null) {
		$("#renewal-count-lw").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.review_dashboard.review_dashboard.get_renewal_count_lw",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					$("#renewal-count-lw").text(r.message[0]).attr("title", r.message[0]);
				}
			}
		});
	}

	get_renewal_amount_lw(sales_person = null) {
		$("#renewal-amount-lw").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.review_dashboard.review_dashboard.get_renewal_amount_lw",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					let formatted_price = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(r.message[0]);
					$("#renewal-amount-lw").text(formatted_price).attr("title", formatted_price);
				}
			}
		});
	}

	get_profit_amount_lw(sales_person = null) {
		$("#profit-amount-lw").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.review_dashboard.review_dashboard.get_profit_amount_lw",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					let formatted_price = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(r.message[0]);
					$("#profit-amount-lw").text(formatted_price).attr("title", formatted_price);
				}
			}
		});
	}

	setup_widget_click_events3() {
		let lastClickedWidget3 = null;
		let tableVisible3 = false;
		let originalData3 = []; // store raw unfiltered data

		// Utility: Filter rows by brand & item group
		function applyTableFilters3() {
			const selectedGroup = $("#item-group-filter3").val();
			const selectedBrand = $("#brand-filter3").val();
			const tbody = $("#widget-data-table3");
			const thead = $("#widget-data-table3").closest("table").find("thead");

			tbody.empty();

			let filtered = originalData3;

			if (selectedGroup) {
				filtered = filtered.filter(row => row.item_group === selectedGroup);
			}
			if (selectedBrand) {
				filtered = filtered.filter(row => row.brand === selectedBrand);
			}

			if (filtered.length === 0) {
				tbody.html("<tr><td colspan='20' class='text-center'>No data found</td></tr>");
				thead.empty();
				return;
			}

			const headers = ["S.No", ...Object.keys(filtered[0])];
			let headerRow = "<tr>";
			headers.forEach(h => {
				const label = h.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
				headerRow += `<th class="text-ellipsis" title="${label ?? ""}">${label ?? ""}</th>`;
			});
			headerRow += "</tr>";
			thead.html(headerRow);

			filtered.forEach((row, index) => {
				let rowHtml = `<tr><td>${index + 1}</td>`;
				Object.keys(filtered[0]).forEach(key => {
					let val = row[key];
					let displayVal = val;
					if (val === null || val === undefined || val === "") {
						displayVal = typeof val === "number" ? 0 : "-";
					}
					if (typeof val === "number" && key !== "qty") {
						displayVal = "₹ " + val.toLocaleString("en-IN");
					}
					// If it's the 'name' column, make it a clickable link
					if (key === "name" && val) {
						const url = `/app/opportunity/${val}`;
						displayVal = `<a href="${url}" target="_blank">${val}</a>`;
					}
					//rowHtml += `<td class="text-ellipsis" title="${displayVal ?? ""}">${displayVal ?? ""}</td>`;
					rowHtml += `<td class="text-ellipsis" title="${(typeof val === 'string' || typeof val === 'number') ? val : ''}">${displayVal ?? ""}</td>`;
				});
				rowHtml += "</tr>";
				tbody.append(rowHtml);
			});
		}

		$(".show-card-popup3").on("click", function () {
			const $this = $(this);
			const method = $this.data("method");
			const widget_type3 = $this.data("type");
			const sales_person = $("#sales-person-dropdown").val() || "";
			//const time_filter2 = $("#time-filter2").val();

			if (!method) return;

			if (lastClickedWidget3 === widget_type3 && tableVisible3) {
				$("#widget-container3").hide();
				$("#widget-filters3").hide();
				$("#widget-data-table3").empty();
				$("#widget-data-table3").closest("table").find("thead").empty();
				$("#widget-title3").text("Data");
				$(".show-card-popup3").removeClass("selected-widget");
				tableVisible3 = false;
				lastClickedWidget3 = null;
				return;
			}

			$(".show-card-popup3").removeClass("selected-widget");
			$this.addClass("selected-widget");

			// Reset filters
			$("#item-group-filter3").val("");
			$("#brand-filter3").val("");

			frappe.call({
				method: `renewal_module.custom_module.page.review_dashboard.review_dashboard.${method}`,
				args: {
					sales_person
				},
				callback: function (r) {
					const data = (r.message && Array.isArray(r.message)) ? r.message[1] || [] : [];

					originalData3 = data;

					const widgetTitle = "Data: " + widget_type3.replace(/_/g, " ").toUpperCase();
					$("#widget-title3").text(widgetTitle);

					if (!data || data.length === 0) {
						$("#widget-data-table3").html("<tr><td colspan='20' class='text-center'>No data found</td></tr>");
						$("#widget-container3").show();
						$("#widget-filters3").show();
						tableVisible3 = true;
						lastClickedWidget3 = widget_type3;
						return;
					}

					applyTableFilters3();
					$("#widget-container3").show();
					$("#widget-filters3").show();
					tableVisible3 = true;
					lastClickedWidget3 = widget_type3;
				}
			});
		});

		// Reset on filter or dropdown change
		$("#sales-person-dropdown").on("change", function () {
			lastClickedWidget3 = null;
			tableVisible3 = false;
			$("#widget-container3").hide();
			$("#widget-filters3").hide();
			$("#widget-data-table3").empty();
			$("#widget-data-table3").closest("table").find("thead").empty();
			$(".show-card-popup3").removeClass("selected-widget");
		});

		// Filter table when dropdowns change
		$("#brand-filter3, #item-group-filter3").on("change", function () {
			if (tableVisible3) {
				applyTableFilters3();
			}
		});
	}


	populateDropdowns3() {
		const itemGroupFilter = document.getElementById("item-group-filter3");
		//console.log("item group:", itemGroupFilter);
		const brandFilter = document.getElementById("brand-filter3");
		//console.log("brand:", brandFilter);
		if (!itemGroupFilter || !brandFilter) return;
		// Fetch all Item Groups
		//console.log("Fetching Item Groups...");
		frappe.call({
			method: "frappe.client.get_list",
			args: {
				doctype: "Item Group",
				fields: ["name"],
				order_by: "name asc",
				limit_page_length: 999
			},
			callback: (r) => {
				if (r.message) {
					//console.log("Item Groups fetched:", r.message);
					const itemGroupFilter = document.getElementById("item-group-filter3");
					if (!itemGroupFilter) {
						console.warn("Item group filter dropdown not found.");
						return;
					}
					itemGroupFilter.innerHTML = '<option value="">item group</option>' +
						r.message.map(i => `<option value="${i.name}">${i.name}</option>`).join('');
					// Add event listener to item group dropdown
					itemGroupFilter.addEventListener("change", function () {
						const selectedItemGroup = this.value;
						//console.log("Selected Item Group:", selectedItemGroup);
						if (!selectedItemGroup) return;
						//console.log("Fetching brands based on items in selected Item Group...");
						frappe.call({
							method: "frappe.client.get_list",
							args: {
								doctype: "Item",
								fields: ["brand"],
								filters: {
									"item_group": selectedItemGroup
								},
								limit_page_length: 999
							},
							callback: (res) => {
								//console.log("Items fetched for filtering brands:", res.message);
								const brandFilter = document.getElementById("brand-filter3");
								if (!brandFilter) {
									console.warn("Brand filter dropdown not found.");
									return;
								}
								const uniqueBrands = [...new Set((res.message || []).map(i => i.brand).filter(Boolean))];
								uniqueBrands.sort((a, b) => a.localeCompare(b));
								//console.log("Filtered brands:", uniqueBrands);
								brandFilter.innerHTML = '<option value="">brand</option>' +
									uniqueBrands.map(b => `<option value="${b}">${b}</option>`).join('');
							}
						});
					});
				}
			}
		});

		// Populate all Brands
		frappe.call({
			method: "frappe.client.get_list",
			args: {
				doctype: "Brand",
				fields: ["name"],
				order_by: "name asc",
				limit_page_length: 999
			},
			callback: (r) => {
				if (r.message) {
					brandFilter.innerHTML = '<option value="">brand</option>' +
						r.message.map(b => `<option value="${b.name}">${b.name}</option>`).join("");
				}
			}
		});


	}


	brand_wise_donut_chart_lw(sales_person = null) {
		setTimeout(() => {
			frappe.call({
				method: "renewal_module.custom_module.page.review_dashboard.review_dashboard.get_brand_wise_data_lw",
				args: { sales_person: sales_person },
				callback: (r) => {
					//console.log("brand wise data:", r.message);
					if (r.message) {
						//console.log("brand:", r.message);
						const chartElement = document.getElementById("brand_donut_chart_lw");

						if (!chartElement) {
							console.error("Chart container not found");
							return;
						}

						const seriesData = r.message.amounts?.map(val => val || 0) || [0];
						//const labelsData = r.message.brand || ["No Data"];
						const labelsData = (r.message.brand || []).map(label => label ? label : "Unnamed Brand");
						const colors = ["#FEB019", "#EE502D", "#008FFB", "#00E396", "#775DD0", "#546E7A"];

						const chartOptions = {
							chart: { type: "donut", height: 180 },
							series: seriesData,
							labels: labelsData,
							colors: colors,
							dataLabels: { enabled: false },
							legend: { show: false },
							tooltip: { enabled: false },
							stroke: { lineCap: "round", width: 0.5 },
							plotOptions: {
								pie: {
									size: 100,
									offsetX: 0,
									offsetY: 0,
									donut: {
										size: "60%",
										labels: {
											show: true,
											name: { show: true, fontSize: "12px", offsetY: -8 },
											value: {
												show: true,
												fontSize: "12px",
												color: "#343a40",
												fontWeight: 500,
												offsetY: 1,
												formatter: function (val, w) {
													// Apply Indian number formatting to the hovered value
													const index = w?.config?.series?.indexOf(parseFloat(val));
													const value = w?.config?.series?.[index];
													return formatIndianNumber(value || val);
												}
											},
											total: {
												show: true,
												fontSize: "12px",
												label: "Total",
												color: "#9599ad",
												fontWeight: 500,
												formatter: function (w) {
													const total = w.globals.seriesTotals.reduce((a, b) => a + b, 0);
													return formatIndianNumber(total);
												}
											}
										}
									}
								}
							}
						};

						if (window.brandDonutChartlw) {
							window.brandDonutChartlw.destroy();
						}

						window.brandDonutChartlw = new ApexCharts(chartElement, chartOptions);
						window.brandDonutChartlw.render();
					}
				}
			});
		}, 500);
		// Utility function
		function formatIndianNumber(x) {
			if (isNaN(x)) return x;
			return x.toLocaleString("en-IN", {
				maximumFractionDigits: 0
			});
		}
	}

	Item_group_donut_chart_lw(sales_person = null) {
		setTimeout(() => {
			frappe.call({
				method: "renewal_module.custom_module.page.review_dashboard.review_dashboard.get_item_group_wise_data_lw",
				args: { sales_person: sales_person },
				callback: (r) => {
					if (r.message) {
						const chartElement = document.getElementById("item_group_donut_chart_lw");

						if (!chartElement) {
							console.error("Chart container not found");
							return;
						}

						const colors = ["#FEB019", "#EE502D", "#008FFB", "#00E396", "#775DD0", "#546E7A"];
						const series = r.message.amounts?.map(val => val || 0) || [0];
						//const labels = r.message.months?.length ? r.message.months : ["No Data"];
						const labels = r.message.item_group?.length ? r.message.item_group : ["No Data"];

						const chartOptions = {
							chart: { type: "donut", height: 180, width: "100%" },
							series: series,
							labels: labels,
							colors: colors,
							legend: { show: false },
							dataLabels: { enabled: false },
							tooltip: { enabled: false },
							stroke: { lineCap: "round", width: 0.5 },
							plotOptions: {
								pie: {
									donut: {
										size: "60%",
										labels: {
											show: true,
											name: { show: true, fontSize: "12px", offsetY: -8 },
											value: {
												show: true,
												fontSize: "12px",
												offsetY: 1,
												color: "#343a40",
												formatter: function (val, w) {
													// Apply Indian number formatting to the hovered value
													const index = w?.config?.series?.indexOf(parseFloat(val));
													const value = w?.config?.series?.[index];
													return formatIndianNumber(value || val);
												}
											},
											total: {
												show: true,
												fontSize: "12px",
												label: "Total",
												color: "#9599ad",
												formatter: function (w) {
													const total = w.globals.seriesTotals.reduce((a, b) => a + b, 0);
													return formatIndianNumber(total);
												}
											}
										}
									}
								}
							}
						};

						if (window.itemGroupDonutChartlw) {
							window.itemGroupDonutChartlw.destroy();
						}

						window.itemGroupDonutChartlw = new ApexCharts(chartElement, chartOptions);
						window.itemGroupDonutChartlw.render();
					}
				}
			});
		}, 500);
		// Utility function
		function formatIndianNumber(x) {
			if (isNaN(x)) return x;
			return x.toLocaleString("en-IN", {
				maximumFractionDigits: 0
			});
		}
	}

	//this month achievd 
	get_opp_count_tm(sales_person = "",time_filter1="this month") {
		//console.log("count sales person:", sales_person)
		$("#opp-count-tm").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.review_dashboard.review_dashboard.get_opp_count_tm",
			args: { sales_person: sales_person,
				time_filter1:time_filter1
			 },
			callback: function (r) {
				if (r.message) {
					let count = r.message[0] || 0;
					$("#opp-count-tm").text(count).attr("title",count);
				}
			}
		});
	}

	get_closed_won_amount_tm(sales_person = "",time_filter1="this month") {
		$("#closed-won-amount-tm").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.review_dashboard.review_dashboard.get_closed_won_amount_tm",
			args: { sales_person: sales_person,
				time_filter1:time_filter1
			 },
			callback: function (r) {
				if (r.message) {
					let formatted_price = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(r.message[0]);
					$("#closed-won-amount-tm").text(formatted_price).attr("title", formatted_price);
				}
			}
		});
	}

	get_closed_lost_amount_tm(sales_person = "",time_filter1="this month") {
		$("#closed-lost-amount-tm").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.review_dashboard.review_dashboard.get_closed_lost_amount_tm",
			args: { sales_person: sales_person,
				time_filter1:time_filter1
			 },
			callback: function (r) {
				if (r.message) {
					let formatted_price = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(r.message[0]);
					$("#closed-lost-amount-tm").text(formatted_price).attr("title", formatted_price);
				}
			}
		});
	}

	get_renewal_count_tm(sales_person = "",time_filter1="this month") {
		$("#renewal-count-tm").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.review_dashboard.review_dashboard.get_renewal_count_tm",
			args: { sales_person: sales_person,
				time_filter1:time_filter1
			 },
			callback: function (r) {
				if (r.message) {
					//console.log("renewal count tm:", r.message);
					$("#renewal-count-tm").text(r.message[0]).attr("title", r.message[0]);
				}
			}
		});
	}

	get_renewal_amount_tm(sales_person = "", time_filter1="this month") {
		$("#renewal-amount-tm").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.review_dashboard.review_dashboard.get_renewal_amount_tm",
			args: { sales_person: sales_person,
				time_filter1:time_filter1
			 },
			callback: function (r) {
				if (r.message) {
					let formatted_price = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(r.message[0]);
					$("#renewal-amount-tm").text(formatted_price).attr("title", formatted_price);
				}
			}
		});
	}

	get_profit_amount_tm(sales_person = "",time_filter1="this month") {
		$("#profit-amount-tm").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.review_dashboard.review_dashboard.get_profit_amount_tm",
			args: { sales_person: sales_person,
				time_filter1:time_filter1
			 },
			callback: function (r) {
				if (r.message) {
					let formatted_price = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(r.message[0]);
					$("#profit-amount-tm").text(formatted_price).attr("title", formatted_price);
				}
			}
		});
	}

	setup_widget_click_events() {
		let lastClickedWidget = null;
		let tableVisible = false;
		let originalData = [];  // store raw unfiltered data

		// Utility: Filter rows by brand & item group
		function applyTableFilters() {
			const selectedGroup = $("#item-group-filter1").val();
			const selectedBrand = $("#brand-filter1").val();
			const tbody = $("#widget-data-table");
			const thead = $("#widget-data-table").closest("table").find("thead");

			tbody.empty();

			let filtered = originalData;

			if (selectedGroup) {
				filtered = filtered.filter(row => row.item_group === selectedGroup);
			}
			if (selectedBrand) {
				filtered = filtered.filter(row => row.brand === selectedBrand);
			}

			if (filtered.length === 0) {
				tbody.html("<tr><td colspan='20' class='text-center'>No data found</td></tr>");
				return;
			}

			const headers = ["S.No", ...Object.keys(filtered[0])];
			let headerRow = "<tr>";
			headers.forEach(h => {
				const label = h.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
				headerRow += `<th class="text-ellipsis" title="${label ?? ""}">${label ?? ""}</th>`;
			});
			thead.html(headerRow);

			filtered.forEach((row, index) => {
				let rowHtml = `<tr><td>${index + 1}</td>`;
				Object.keys(filtered[0]).forEach(key => {
					let val = row[key];
					let displayVal = val;
					if (val === null || val === undefined || val === "") {
						displayVal = typeof val === "number" ? 0 : "-";
					}
					if (typeof val === "number" && key !== "qty") {
						displayVal = "₹ " + val.toLocaleString("en-IN");
					}
					// 👉 If it's the 'name' column, make it a clickable link
					if (key === "name" && val) {
						const url = `/app/opportunity/${val}`;
						displayVal = `<a href="${url}" target="_blank">${val}</a>`;
					}
					//rowHtml += `<td class="text-ellipsis" title="${displayVal ?? ""}">${displayVal ?? ""}</td>`;
					rowHtml += `<td class="text-ellipsis" title="${(typeof val === 'string' || typeof val === 'number') ? val : ''}">${displayVal ?? ""}</td>`;
				});
				rowHtml += "</tr>";
				tbody.append(rowHtml);
			});
		}

		$(".show-card-popup").on("click", function () {
			const $this = $(this);
			const method = $this.data("method");
			const widget_type = $this.data("type");
			const sales_person = $("#sales-person-dropdown").val() || "";
			const time_filter1 = $("#time-filter1").val();

			if (!method) return;

			if (lastClickedWidget === widget_type && tableVisible) {
				$("#widget-container").hide();
				$("#widget-filters").hide(); // hide filters
				$("#widget-data-table").empty();
				$("#widget-data-table").closest("table").find("thead").empty();
				$("#widget-title").text("Data");
				$(".show-card-popup").removeClass("selected-widget");
				tableVisible = false;
				lastClickedWidget = null;
				return;
			}

			$(".show-card-popup").removeClass("selected-widget");
			$this.addClass("selected-widget");
			// 🔁 Reset filters when switching cards
			$("#item-group-filter1").val("");
			$("#brand-filter1").val("");

			frappe.call({
				method: `renewal_module.custom_module.page.review_dashboard.review_dashboard.${method}`,
				args: {
					time_filter1,
					sales_person
				},
				callback: function (r) {
					const data = (r.message && Array.isArray(r.message)) ? r.message[1] || [] : [];
					originalData = data; // store raw
					const timeFilterLabel = time_filter1.replace(/_/g, " ").toUpperCase();
					const widgetTitle = `Data (${timeFilterLabel}): ${widget_type.replace(/_/g, " ").toUpperCase()}`;

					if (!data || data.length === 0) {
						$("#widget-data-table").html("<tr><td colspan='20' class='text-center'>No data found</td></tr>");
						//$("#widget-title").text("Data: " + widget_type.replace(/_/g, " ").toUpperCase());
						$("#widget-title").text(widgetTitle);
						$("#widget-container").show();
						$("#widget-filters").show(); // show filters only when data available
						tableVisible = true;
						lastClickedWidget = widget_type;
						return;
					}

					applyTableFilters();
					//$("#widget-title").text("Data: " + widget_type.replace(/_/g, " ").toUpperCase());
					$("#widget-title").text(widgetTitle);
					$("#widget-container").show();
					tableVisible = true;
					lastClickedWidget = widget_type;
				}
			});
		});

		// Reset on filter change
		$("#sales-person-dropdown, #time-filter1").on("change", function () {
			lastClickedWidget = null;
			tableVisible = false;
			$("#widget-container").hide();
			$("#widget-filters").hide(); // hide filters
			$("#widget-data-table").empty();
			$("#widget-data-table").closest("table").find("thead").empty();
			$(".show-card-popup").removeClass("selected-widget");
		});

		// 🔁 Filter table when brand/item_group dropdown changes
		$("#brand-filter1, #item-group-filter1").on("change", function () {
			if (tableVisible) {
				applyTableFilters();
			}
		});
	}

	populateDropdowns1() {
		const itemGroupFilter = document.getElementById("item-group-filter1");
		//console.log("item group:", itemGroupFilter);
		const brandFilter = document.getElementById("brand-filter1");
		//console.log("brand:", brandFilter);
		if (!itemGroupFilter || !brandFilter) return;
		// Fetch all Item Groups
		//console.log("Fetching Item Groups...");
		frappe.call({
			method: "frappe.client.get_list",
			args: {
				doctype: "Item Group",
				fields: ["name"],
				order_by:"name asc",
				limit_page_length: 999
			},
			callback: (r) => {
				if (r.message) {
					//console.log("Item Groups fetched:", r.message);
					const itemGroupFilter = document.getElementById("item-group-filter1");
					if (!itemGroupFilter) {
						console.warn("Item group filter dropdown not found.");
						return;
					}
					itemGroupFilter.innerHTML = '<option value="">item group</option>' +
						r.message.map(i => `<option value="${i.name}">${i.name}</option>`).join('');
					// Add event listener to item group dropdown
					itemGroupFilter.addEventListener("change", function () {
						const selectedItemGroup = this.value;
						//console.log("Selected Item Group:", selectedItemGroup);
						if (!selectedItemGroup) return;
						//console.log("Fetching brands based on items in selected Item Group...");
						frappe.call({
							method: "frappe.client.get_list",
							args: {
								doctype: "Item",
								fields: ["brand"],
								filters: {
									"item_group": selectedItemGroup
								},
								limit_page_length: 999
							},
							callback: (res) => {
								//console.log("Items fetched for filtering brands:", res.message);
								const brandFilter = document.getElementById("brand-filter1");
								if (!brandFilter) {
									console.warn("Brand filter dropdown not found.");
									return;
								}
								const uniqueBrands = [...new Set((res.message || []).map(i => i.brand).filter(Boolean))];
								uniqueBrands.sort((a, b) => a.localeCompare(b));
								//console.log("Filtered brands:", uniqueBrands);
								brandFilter.innerHTML = '<option value="">brand</option>' +
									uniqueBrands.map(b => `<option value="${b}">${b}</option>`).join('');
							}
						});
					});
				}
			}
		});

		// Populate all Brands
		frappe.call({
			method: "frappe.client.get_list",
			args: {
				doctype: "Brand",
				fields: ["name"],
				order_by:"name asc",
				limit_page_length: 999
			},
			callback: (r) => {
				if (r.message) {
					brandFilter.innerHTML = '<option value="">brand</option>' +
						r.message.map(b => `<option value="${b.name}">${b.name}</option>`).join("");
				}
			}
		});


	}


	sales_funnel_chart(sales_person = "",time_filter1="this month") {
		//console.log("sales funnel", sales_person);
		setTimeout(() => {
			frappe.call({
				method: "renewal_module.custom_module.page.review_dashboard.review_dashboard.get_funnel_data",
				args: { sales_person: sales_person,
					time_filter1:time_filter1
				 },
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

						let container = d3.select("#sales-funnel-chart");
						let containerWidth = container.node()?.getBoundingClientRect().width || 700;
						let width = containerWidth;
						let height = Math.min(180, width * 0.2);

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

	//renewal list 

	get_rnwls_new_opp_count(sales_person = "",time_filter2="last week") {
		//console.log("count sales person:", sales_person)
		$("#rnwls-new-opp-count").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.review_dashboard.rnwls_data.get_rnwls_new_opp_count",
			args: { sales_person: sales_person,
				time_filter2:time_filter2
			 },
			callback: function (r) {
				if (r.message) {
					let count = r.message[0] || 0;
					$("#rnwls-new-opp-count").text(count).attr("title", count);
				}
			}
		});
	}


	get_rnwls_cofed_count(sales_person = "",time_filter2="last week") {
		//console.log("count sales person:", sales_person)
		$("#rnwls-cofed-count").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.review_dashboard.rnwls_data.get_rnwls_cofed_count",
			args: { sales_person: sales_person,
				time_filter2:time_filter2
			 },
			callback: function (r) {
				if (r.message) {
					let count = r.message[0] || 0;
					$("#rnwls-cofed-count").text(count).attr("title", count);
				}
			}
		});
	}

	get_rnwls_lost_count(sales_person = "",time_filter2="last week") {
		//console.log("count sales person:", sales_person)
		$("#rnwls-lost-count").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.review_dashboard.rnwls_data.get_rnwls_lost_count",
			args: { sales_person: sales_person,
				time_filter2:time_filter2
			 },
			callback: function (r) {
				if (r.message) {
					let count = r.message[0] || 0;
					$("#rnwls-lost-count").text(count).attr("title", count);
				}
			}
		});
	}

	get_rnwls_renewed_count(sales_person = "",time_filter2="last week") {
		//console.log("count sales person:", sales_person)
		$("#rnwls-renewed-count").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.review_dashboard.rnwls_data.get_rnwls_renewed_count",
			args: { sales_person: sales_person,
				time_filter2:time_filter2
			 },
			callback: function (r) {
				if (r.message) {
					let count = r.message[0] || 0;
					$("#rnwls-renewed-count").text(count).attr("title", count);
				}
			}
		});
	}

	get_rnwls_pending_count(sales_person = "",time_filter2="last week") {
		//console.log("count sales person:", sales_person)
		$("#rnwls-pending-count").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.review_dashboard.rnwls_data.get_rnwls_pending_count",
			args: { sales_person: sales_person,
				time_filter2:time_filter2
			 },
			callback: function (r) {
				if (r.message) {
					let count = r.message[0] || 0;
					$("#rnwls-pending-count").text(count).attr("title", count);
				}
			}
		});
	}

	setup_widget_click_events2() {
		let lastClickedWidget2 = null;
		let tableVisible2 = false;
		let originalData2 = []; // store raw unfiltered data

		// Utility: Filter rows by brand & item group
		function applyTableFilters2() {
			const selectedGroup = $("#item-group-filter2").val();
			const selectedBrand = $("#brand-filter2").val();
			const tbody = $("#widget-data-table2");
			const thead = $("#widget-data-table2").closest("table").find("thead");

			tbody.empty();

			let filtered = originalData2;

			if (selectedGroup) {
				filtered = filtered.filter(row => row.item_group === selectedGroup);
			}
			if (selectedBrand) {
				filtered = filtered.filter(row => row.brand === selectedBrand);
			}

			if (filtered.length === 0) {
				tbody.html("<tr><td colspan='20' class='text-center'>No data found</td></tr>");
				thead.empty();
				return;
			}

			const headers = ["S.No", ...Object.keys(filtered[0])];
			let headerRow = "<tr>";
			headers.forEach(h => {
				const label = h.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
				headerRow += `<th class="text-ellipsis" title="${label ?? ""}">${label ?? ""}</th>`;
			});
			headerRow += "</tr>";
			thead.html(headerRow);

			filtered.forEach((row, index) => {
				let rowHtml = `<tr><td>${index + 1}</td>`;
				Object.keys(filtered[0]).forEach(key => {
					let val = row[key];
					let displayVal = val;
					if (val === null || val === undefined || val === "") {
						displayVal = typeof val === "number" ? 0 : "-";
					}
					if (typeof val === "number" && key !== "qty") {
						displayVal = "₹ " + val.toLocaleString("en-IN");
					}
					// 👉 If it's the 'name' column, make it a clickable link
					if (key === "name" && val) {
						const url = `/app/renewal-list/${val}`;
						displayVal = `<a href="${url}" target="_blank">${val}</a>`;
					}
					//rowHtml += `<td class="text-ellipsis" title="${displayVal ?? ""}">${displayVal ?? ""}</td>`;
					rowHtml += `<td class="text-ellipsis" title="${(typeof val === 'string' || typeof val === 'number') ? val : ''}">${displayVal ?? ""}</td>`;
				});
				rowHtml += "</tr>";
				tbody.append(rowHtml);
			});
		}

		$(".show-card-popup2").on("click", function () {
			const $this = $(this);
			const method = $this.data("method");
			const widget_type2 = $this.data("type");
			const sales_person = $("#sales-person-dropdown").val() || "";
			const time_filter2 = $("#time-filter2").val();

			if (!method) return;

			if (lastClickedWidget2 === widget_type2 && tableVisible2) {
				$("#widget-container2").hide();
				$("#widget-filters2").hide();
				$("#widget-data-table2").empty();
				$("#widget-data-table2").closest("table").find("thead").empty();
				$("#widget-title2").text("Data");
				$(".show-card-popup2").removeClass("selected-widget");
				tableVisible2 = false;
				lastClickedWidget2 = null;
				return;
			}

			$(".show-card-popup2").removeClass("selected-widget");
			$this.addClass("selected-widget");

			// Reset filters
			$("#item-group-filter2").val("");
			$("#brand-filter2").val("");

			frappe.call({
				method: `renewal_module.custom_module.page.review_dashboard.rnwls_data.${method}`,
				args: {
					time_filter2,
					sales_person
				},
				callback: function (r) {
					const data = (r.message && Array.isArray(r.message)) ? r.message[1] || [] : [];

					originalData2 = data;
					const timeFilterLabel = time_filter2.replace(/_/g, " ").toUpperCase();
					const widgetTitle = `Data (${timeFilterLabel}): ${widget_type2.replace(/_/g, " ").toUpperCase()}`;
					$("#widget-title2").text(widgetTitle);

					//const widgetTitle = "Data: " + widget_type2.replace(/_/g, " ").toUpperCase();
					//$("#widget-title2").text(widgetTitle);

					if (!data || data.length === 0) {
						$("#widget-data-table2").html("<tr><td colspan='20' class='text-center'>No data found</td></tr>");
						$("#widget-container2").show();
						$("#widget-filters2").show();
						tableVisible2 = true;
						lastClickedWidget2 = widget_type2;
						return;
					}

					applyTableFilters2();
					$("#widget-container2").show();
					$("#widget-filters2").show();
					tableVisible2 = true;
					lastClickedWidget2 = widget_type2;
				}
			});
		});

		// Reset on filter or dropdown change
		$("#sales-person-dropdown, #time-filter2").on("change", function () {
			lastClickedWidget2 = null;
			tableVisible2 = false;
			$("#widget-container2").hide();
			$("#widget-filters2").hide();
			$("#widget-data-table2").empty();
			$("#widget-data-table2").closest("table").find("thead").empty();
			$(".show-card-popup2").removeClass("selected-widget");
		});

		// Filter table when dropdowns change
		$("#brand-filter2, #item-group-filter2").on("change", function () {
			if (tableVisible2) {
				applyTableFilters2();
			}
		});
	}


	populateDropdowns2() {
		const itemGroupFilter = document.getElementById("item-group-filter2");
		//console.log("item group:", itemGroupFilter);
		const brandFilter = document.getElementById("brand-filter2");
		//console.log("brand:", brandFilter);
		if (!itemGroupFilter || !brandFilter) return;
		// Fetch all Item Groups
		//console.log("Fetching Item Groups...");
		frappe.call({
			method: "frappe.client.get_list",
			args: {
				doctype: "Item Group",
				fields: ["name"],
				order_by:"name asc",
				limit_page_length: 999
			},
			callback: (r) => {
				if (r.message) {
					//console.log("Item Groups fetched:", r.message);
					const itemGroupFilter = document.getElementById("item-group-filter2");
					if (!itemGroupFilter) {
						console.warn("Item group filter dropdown not found.");
						return;
					}
					itemGroupFilter.innerHTML = '<option value="">item group</option>' +
						r.message.map(i => `<option value="${i.name}">${i.name}</option>`).join('');
					// Add event listener to item group dropdown
					itemGroupFilter.addEventListener("change", function () {
						const selectedItemGroup = this.value;
						//console.log("Selected Item Group:", selectedItemGroup);
						if (!selectedItemGroup) return;
						//console.log("Fetching brands based on items in selected Item Group...");
						frappe.call({
							method: "frappe.client.get_list",
							args: {
								doctype: "Item",
								fields: ["brand"],
								filters: {
									"item_group": selectedItemGroup
								},
								limit_page_length: 999
							},
							callback: (res) => {
								//console.log("Items fetched for filtering brands:", res.message);
								const brandFilter = document.getElementById("brand-filter2");
								if (!brandFilter) {
									console.warn("Brand filter dropdown not found.");
									return;
								}
								const uniqueBrands = [...new Set((res.message || []).map(i => i.brand).filter(Boolean))];
								uniqueBrands.sort((a, b) => a.localeCompare(b));
								//console.log("Filtered brands:", uniqueBrands);
								brandFilter.innerHTML = '<option value="">brand</option>' +
									uniqueBrands.map(b => `<option value="${b}">${b}</option>`).join('');
							}
						});
					});
				}
			}
		});

		// Populate all Brands
		frappe.call({
			method: "frappe.client.get_list",
			args: {
				doctype: "Brand",
				fields: ["name"],
				order_by:"name asc",
				limit_page_length: 999
			},
			callback: (r) => {
				if (r.message) {
					brandFilter.innerHTML = '<option value="">brand</option>' +
						r.message.map(b => `<option value="${b.name}">${b.name}</option>`).join("");
				}
			}
		});


	}

	//closures this week
	get_closure_opp_count_tw(sales_person = null) {
		$("#closure-opp-count-tw").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.review_dashboard.review_dashboard.get_closure_opp_count_tw",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					$("#closure-opp-count-tw").text(r.message[0]).attr("title", r.message[0]);
				}
			}
		});
	}

	get_closure_opp_amount_tw(sales_person = null) {
		$("#closure-opp-amount-tw").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.review_dashboard.review_dashboard.get_closure_opp_amount_tw",
			args: { sales_person: sales_person },
			callback: function (r) {
				//console.log("r", r.message)
				if (r.message) {
					let formatted_price = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(r.message[0]);
					$("#closure-opp-amount-tw").text(formatted_price).attr("title", formatted_price);
				}
			}
		});
	}

	//rewals
	get_closures_rnwls_count_tw(sales_person = null) {
		$("#closures-rnwls-count-tw").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.review_dashboard.review_dashboard.get_closures_rnwls_count_tw",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					$("#closures-rnwls-count-tw").text(r.message[0]).attr("title", r.message[0]);
				}
			}
		});
	}

	get_closures_rnwls_amount_tw(sales_person = null) {
		$("#closures-rnwls-amount-tw").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.review_dashboard.review_dashboard.get_closures_rnwls_amount_tw",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					let formatted_price = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(r.message[0]);
					$("#closures-rnwls-amount-tw").text(formatted_price).attr("title", formatted_price);
				}
			}
		});
	}

	setup_widget_click_events4() {
		let lastClickedWidget4 = null;
		let tableVisible4 = false;
		let originalData4 = []; // store raw unfiltered data

		// Utility: Filter rows by brand & item group
		function applyTableFilters4() {
			const selectedGroup = $("#item-group-filter4").val();
			const selectedBrand = $("#brand-filter4").val();
			const tbody = $("#widget-data-table4");
			const thead = $("#widget-data-table4").closest("table").find("thead");

			tbody.empty();

			let filtered = originalData4;

			if (selectedGroup) {
				filtered = filtered.filter(row => row.item_group === selectedGroup);
			}
			if (selectedBrand) {
				filtered = filtered.filter(row => row.brand === selectedBrand);
			}

			if (filtered.length === 0) {
				tbody.html("<tr><td colspan='20' class='text-center'>No data found</td></tr>");
				thead.empty();
				return;
			}

			const headers = ["S.No", ...Object.keys(filtered[0])];
			let headerRow = "<tr>";
			headers.forEach(h => {
				const label = h.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
				headerRow += `<th class="text-ellipsis" title="${label ?? ""}">${label ?? ""}</th>`;
			});
			headerRow += "</tr>";
			thead.html(headerRow);

			filtered.forEach((row, index) => {
				let rowHtml = `<tr><td>${index + 1}</td>`;
				Object.keys(filtered[0]).forEach(key => {
					let val = row[key];
					let displayVal = val;
					if (val === null || val === undefined || val === "") {
						displayVal = typeof val === "number" ? 0 : "-";
					}
					if (typeof val === "number" && key !== "qty") {
						displayVal = "₹ " + val.toLocaleString("en-IN");
					}
					// If it's the 'name' column, make it a clickable link
					if (key === "name" && val) {
						const url = `/app/opportunity/${val}`;
						displayVal = `<a href="${url}" target="_blank">${val}</a>`;
					}
					//rowHtml += `<td class="text-ellipsis" title="${displayVal ?? ""}">${displayVal ?? ""}</td>`;
					rowHtml += `<td class="text-ellipsis" title="${(typeof val === 'string' || typeof val === 'number') ? val : ''}">${displayVal ?? ""}</td>`;
				});
				rowHtml += "</tr>";
				tbody.append(rowHtml);
			});
		}

		$(".show-card-popup4").on("click", function () {
			const $this = $(this);
			const method = $this.data("method");
			const widget_type4 = $this.data("type");
			const sales_person = $("#sales-person-dropdown").val() || "";
			//const time_filter2 = $("#time-filter2").val();

			if (!method) return;

			if (lastClickedWidget4 === widget_type4 && tableVisible4) {
				$("#widget-container4").hide();
				$("#widget-filters4").hide();
				$("#widget-data-table4").empty();
				$("#widget-data-table4").closest("table").find("thead").empty();
				$("#widget-title4").text("Data");
				$(".show-card-popup4").removeClass("selected-widget");
				tableVisible4 = false;
				lastClickedWidget4 = null;
				return;
			}

			$(".show-card-popup4").removeClass("selected-widget");
			$this.addClass("selected-widget");

			// Reset filters
			$("#item-group-filter4").val("");
			$("#brand-filter4").val("");

			frappe.call({
				method: `renewal_module.custom_module.page.review_dashboard.review_dashboard.${method}`,
				args: {
					sales_person
				},
				callback: function (r) {
					const data = (r.message && Array.isArray(r.message)) ? r.message[1] || [] : [];

					originalData4 = data;

					const widgetTitle = "Data: " + widget_type4.replace(/_/g, " ").toUpperCase();
					$("#widget-title4").text(widgetTitle);

					if (!data || data.length === 0) {
						$("#widget-data-table4").html("<tr><td colspan='20' class='text-center'>No data found</td></tr>");
						$("#widget-container4").show();
						$("#widget-filters4").show();
						tableVisible4 = true;
						lastClickedWidget4 = widget_type4;
						return;
					}

					applyTableFilters4();
					$("#widget-container4").show();
					$("#widget-filters4").show();
					tableVisible4 = true;
					lastClickedWidget4 = widget_type4;
				}
			});
		});

		// Reset on filter or dropdown change
		$("#sales-person-dropdown").on("change", function () {
			lastClickedWidget4 = null;
			tableVisible4 = false;
			$("#widget-container4").hide();
			$("#widget-filters4").hide();
			$("#widget-data-table4").empty();
			$("#widget-data-table4").closest("table").find("thead").empty();
			$(".show-card-popup4").removeClass("selected-widget");
		});

		// Filter table when dropdowns change
		$("#brand-filter4, #item-group-filter4").on("change", function () {
			if (tableVisible4) {
				applyTableFilters4();
			}
		});
	}


	populateDropdowns4() {
		const itemGroupFilter = document.getElementById("item-group-filter4");
		//console.log("item group:", itemGroupFilter);
		const brandFilter = document.getElementById("brand-filter4");
		//console.log("brand:", brandFilter);
		if (!itemGroupFilter || !brandFilter) return;
		// Fetch all Item Groups
		//console.log("Fetching Item Groups...");
		frappe.call({
			method: "frappe.client.get_list",
			args: {
				doctype: "Item Group",
				fields: ["name"],
				order_by:"name asc",
				limit_page_length: 999
			},
			callback: (r) => {
				if (r.message) {
					//console.log("Item Groups fetched:", r.message);
					const itemGroupFilter = document.getElementById("item-group-filter4");
					if (!itemGroupFilter) {
						console.warn("Item group filter dropdown not found.");
						return;
					}
					itemGroupFilter.innerHTML = '<option value="">item group</option>' +
						r.message.map(i => `<option value="${i.name}">${i.name}</option>`).join('');
					// Add event listener to item group dropdown
					itemGroupFilter.addEventListener("change", function () {
						const selectedItemGroup = this.value;
						//console.log("Selected Item Group:", selectedItemGroup);
						if (!selectedItemGroup) return;
						//console.log("Fetching brands based on items in selected Item Group...");
						frappe.call({
							method: "frappe.client.get_list",
							args: {
								doctype: "Item",
								fields: ["brand"],
								filters: {
									"item_group": selectedItemGroup
								},
								limit_page_length: 999
							},
							callback: (res) => {
								//console.log("Items fetched for filtering brands:", res.message);
								const brandFilter = document.getElementById("brand-filter4");
								if (!brandFilter) {
									console.warn("Brand filter dropdown not found.");
									return;
								}
								const uniqueBrands = [...new Set((res.message || []).map(i => i.brand).filter(Boolean))];
								uniqueBrands.sort((a, b) => a.localeCompare(b));
								//console.log("Filtered brands:", uniqueBrands);
								brandFilter.innerHTML = '<option value="">brand</option>' +
									uniqueBrands.map(b => `<option value="${b}">${b}</option>`).join('');
							}
						});
					});
				}
			}
		});

		// Populate all Brands
		frappe.call({
			method: "frappe.client.get_list",
			args: {
				doctype: "Brand",
				fields: ["name"],
				order_by:"name asc",
				limit_page_length: 999
			},
			callback: (r) => {
				if (r.message) {
					brandFilter.innerHTML = '<option value="">brand</option>' +
						r.message.map(b => `<option value="${b.name}">${b.name}</option>`).join("");
				}
			}
		});


	}

	brand_wise_donut_chart_tw(sales_person = null) {
		setTimeout(() => {
			frappe.call({
				method: "renewal_module.custom_module.page.review_dashboard.review_dashboard.get_brand_wise_data_tw",
				args: { sales_person: sales_person },
				callback: (r) => {
					//console.log("brand wise data:", r.message);
					if (r.message) {
						//console.log("brand:", r.message);
						const chartElement = document.getElementById("brand_donut_chart_tw");

						if (!chartElement) {
							console.error("Chart container not found");
							return;
						}

						const seriesData = r.message.amounts?.map(val => val || 0) || [0];
						//const labelsData = r.message.brand || ["No Data"];
						const labelsData = (r.message.brand || []).map(label => label ? label : "Unnamed Brand");
						const colors = ["#FEB019", "#EE502D", "#008FFB", "#00E396", "#775DD0", "#546E7A"];

						const chartOptions = {
							chart: { type: "donut", height: 180 },
							series: seriesData,
							labels: labelsData,
							colors: colors,
							dataLabels: { enabled: false },
							legend: { show: false },
							tooltip: { enabled: false },
							stroke: { lineCap: "round", width: 0.5 },
							plotOptions: {
								pie: {
									size: 100,
									offsetX: 0,
									offsetY: 0,
									donut: {
										size: "60%",
										labels: {
											show: true,
											name: { show: true, fontSize: "12px", offsetY: -8 },
											value: {
												show: true,
												fontSize: "12px",
												color: "#343a40",
												fontWeight: 500,
												offsetY: 1,
												formatter: function (val, w) {
													// Apply Indian number formatting to the hovered value
													const index = w?.config?.series?.indexOf(parseFloat(val));
													const value = w?.config?.series?.[index];
													return formatIndianNumber(value || val);
												}
											},
											total: {
												show: true,
												fontSize: "12px",
												label: "Total",
												color: "#9599ad",
												fontWeight: 500,
												formatter: function (w) {
													const total = w.globals.seriesTotals.reduce((a, b) => a + b, 0);
													return formatIndianNumber(total);
												}
											}
										}
									}
								}
							}
						};

						if (window.brandDonutCharttw) {
							window.brandDonutCharttw.destroy();
						}

						window.brandDonutCharttw = new ApexCharts(chartElement, chartOptions);
						window.brandDonutCharttw.render();
					}
				}
			});
		}, 500);
		// Utility function
		function formatIndianNumber(x) {
			if (isNaN(x)) return x;
			return x.toLocaleString("en-IN", {
				maximumFractionDigits: 0
			});
		}
	}

	Item_group_donut_chart_tw(sales_person = null) {
		setTimeout(() => {
			frappe.call({
				method: "renewal_module.custom_module.page.review_dashboard.review_dashboard.get_item_group_wise_data_tw",
				args: { sales_person: sales_person },
				callback: (r) => {
					if (r.message) {
						const chartElement = document.getElementById("item_group_donut_chart_tw");

						if (!chartElement) {
							console.error("Chart container not found");
							return;
						}

						const colors = ["#FEB019", "#EE502D", "#008FFB", "#00E396", "#775DD0", "#546E7A"];
						const series = r.message.amounts?.map(val => val || 0) || [0];
						//const labels = r.message.months?.length ? r.message.months : ["No Data"];
						const labels = r.message.item_group?.length ? r.message.item_group : ["No Data"];

						const chartOptions = {
							chart: { type: "donut", height: 180, width: "100%" },
							series: series,
							labels: labels,
							colors: colors,
							legend: { show: false },
							dataLabels: { enabled: false },
							tooltip: { enabled: false },
							stroke: { lineCap: "round", width: 0.5 },
							plotOptions: {
								pie: {
									donut: {
										size: "60%",
										labels: {
											show: true,
											name: { show: true, fontSize: "12px", offsetY: -8 },
											value: {
												show: true,
												fontSize: "12px",
												offsetY: 1,
												color: "#343a40",
												formatter: function (val, w) {
													// Apply Indian number formatting to the hovered value
													const index = w?.config?.series?.indexOf(parseFloat(val));
													const value = w?.config?.series?.[index];
													return formatIndianNumber(value || val);
												}
											},
											total: {
												show: true,
												fontSize: "12px",
												label: "Total",
												color: "#9599ad",
												formatter: function (w) {
													const total = w.globals.seriesTotals.reduce((a, b) => a + b, 0);
													return formatIndianNumber(total);
												}
											}
										}
									}
								}
							}
						};

						if (window.itemGroupDonutCharttw) {
							window.itemGroupDonutCharttw.destroy();
						}

						window.itemGroupDonutCharttw = new ApexCharts(chartElement, chartOptions);
						window.itemGroupDonutCharttw.render();
					}
				}
			});
		}, 500);
		// Utility function
		function formatIndianNumber(x) {
			if (isNaN(x)) return x;
			return x.toLocaleString("en-IN", {
				maximumFractionDigits: 0
			});
		}
	}


	//closures this month
	get_closure_opp_count_tm(sales_person = null) {
		$("#closure-opp-count-tm").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.review_dashboard.review_dashboard.get_closure_opp_count_tm",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					$("#closure-opp-count-tm").text(r.message[0]).attr("title", r.message[0]);
				}
			}
		});
	}

	get_closure_opp_amount_tm(sales_person = null) {
		$("#closure-opp-amount-tm").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.review_dashboard.review_dashboard.get_closure_opp_amount_tm",
			args: { sales_person: sales_person },
			callback: function (r) {
				//console.log("r-tm", r.message)
				if (r.message) {
					let formatted_price = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(r.message[0]);
					$("#closure-opp-amount-tm").text(formatted_price).attr("title", formatted_price);
				}
			}
		});
	}

	//rewals
	get_closures_rnwls_count_tm(sales_person = null) {
		$("#closures-rnwls-count-tm").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.review_dashboard.review_dashboard.get_closures_rnwls_count_tm",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					$("#closures-rnwls-count-tm").text(r.message[0]).attr("title", r.message[0]);
				}
			}
		});
	}

	get_closures_rnwls_amount_tm(sales_person = null) {
		$("#closures-rnwls-amount-tm").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.review_dashboard.review_dashboard.get_closures_rnwls_amount_tm",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					let formatted_price = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(r.message[0]);
					$("#closures-rnwls-amount-tm").text(formatted_price).attr("title", formatted_price);
				}
			}
		});
	}

	brand_wise_donut_chart_tm(sales_person = null) {
		setTimeout(() => {
			frappe.call({
				method: "renewal_module.custom_module.page.review_dashboard.review_dashboard.get_brand_wise_data_tm",
				args: { sales_person: sales_person },
				callback: (r) => {
					//console.log("brand wise data:", r.message);
					if (r.message) {
						//console.log("brand:", r.message);
						const chartElement = document.getElementById("brand_donut_chart_tm");

						if (!chartElement) {
							console.error("Chart container not found");
							return;
						}

						const seriesData = r.message.amounts?.map(val => val || 0) || [0];
						//const labelsData = r.message.brand || ["No Data"];
						const labelsData = (r.message.brand || []).map(label => label ? label : "Unnamed Brand");

						const colors = ["#FEB019", "#EE502D", "#008FFB", "#00E396", "#775DD0", "#546E7A"];
						const chartOptions = {
							chart: { type: "donut", height: 180 },
							series: seriesData,
							labels: labelsData,
							colors: colors,
							dataLabels: { enabled: false },
							legend: { show: false },
							tooltip: { enabled: false },
							stroke: { lineCap: "round", width: 0.5 },
							plotOptions: {
								pie: {
									size: 100,
									offsetX: 0,
									offsetY: 0,
									donut: {
										size: "60%",
										labels: {
											show: true,
											name: { show: true, fontSize: "12px", offsetY: -8 },
											value: {
												show: true,
												fontSize: "12px",
												color: "#343a40",
												fontWeight: 500,
												offsetY: 1,
												formatter: function (val, w) {
													// Apply Indian number formatting to the hovered value
													const index = w?.config?.series?.indexOf(parseFloat(val));
													const value = w?.config?.series?.[index];
													return formatIndianNumber(value || val);
												}
											},
											total: {
												show: true,
												fontSize: "12px",
												label: "Total",
												color: "#9599ad",
												fontWeight: 500,
												formatter: function (w) {
													const total = w.globals.seriesTotals.reduce((a, b) => a + b, 0);
													return formatIndianNumber(total);
												}
											}
										}
									}
								}
							}
						};

						if (window.brandDonutCharttm) {
							window.brandDonutCharttm.destroy();
						}

						window.brandDonutCharttm = new ApexCharts(chartElement, chartOptions);
						window.brandDonutCharttm.render();
					}
				}
			});
		}, 500);
		// Utility function
		function formatIndianNumber(x) {
			if (isNaN(x)) return x;
			return x.toLocaleString("en-IN", {
				maximumFractionDigits: 0
			});
		}
	}

	Item_group_donut_chart_tm(sales_person = null) {
		setTimeout(() => {
			frappe.call({
				method: "renewal_module.custom_module.page.review_dashboard.review_dashboard.get_item_group_wise_data_tm",
				args: { sales_person: sales_person },
				callback: (r) => {
					if (r.message) {
						const chartElement = document.getElementById("item_group_donut_chart_tm");

						if (!chartElement) {
							console.error("Chart container not found");
							return;
						}

						const colors = ["#FEB019", "#EE502D", "#008FFB", "#00E396", "#775DD0", "#546E7A"];
						const series = r.message.amounts?.map(val => val || 0) || [0];
						//const labels = r.message.months?.length ? r.message.months : ["No Data"];
						const labels = r.message.item_group?.length ? r.message.item_group : ["No Data"];

						const chartOptions = {
							chart: { type: "donut", height: 180, width: "100%" },
							series: series,
							labels: labels,
							colors: colors,
							legend: { show: false },
							dataLabels: { enabled: false },
							tooltip: { enabled: false },
							stroke: { lineCap: "round", width: 0.5 },
							plotOptions: {
								pie: {
									donut: {
										size: "60%",
										labels: {
											show: true,
											name: { show: true, fontSize: "12px", offsetY: -8 },
											value: {
												show: true,
												fontSize: "12px",
												offsetY: 1,
												color: "#343a40",
												formatter: function (val, w) {
													// Apply Indian number formatting to the hovered value
													const index = w?.config?.series?.indexOf(parseFloat(val));
													const value = w?.config?.series?.[index];
													return formatIndianNumber(value || val);
												}
											},
											total: {
												show: true,
												fontSize: "12px",
												label: "Total",
												color: "#9599ad",
												formatter: function (w) {
													const total = w.globals.seriesTotals.reduce((a, b) => a + b, 0);
													return formatIndianNumber(total);
												}
											}
										}
									}
								}
							}
						};

						if (window.itemGroupDonutCharttm) {
							window.itemGroupDonutCharttm.destroy();
						}

						window.itemGroupDonutCharttm = new ApexCharts(chartElement, chartOptions);
						window.itemGroupDonutCharttm.render();
					}
				}
			});
		}, 500);
		// Utility function
		function formatIndianNumber(x) {
			if (isNaN(x)) return x;
			return x.toLocaleString("en-IN", {
				maximumFractionDigits: 0
			});
		}
	}

	//target


	get_target_amount_tm(sales_person = null) {
		//console.log("target function calling");
		$("#target-amount").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.review_dashboard.review_dashboard.get_target_amount_tm",
			args: { sales_person: sales_person },
			callback: (r) => {
				//console.log("target amount:", r.message);
				if (r.message && r.message.bottomline_target !== undefined) {
					let formatted_price = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(r.message.bottomline_target);
					$("#target-amount").text(formatted_price).attr("title",formatted_price);
					this.get_variance_amount();
				}
			}
		});
	}


	get_achieved_amount_tm(sales_person = null) {
		$("#achieved-amount").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.review_dashboard.review_dashboard.get_achieved_amount_tm",
			args: { sales_person: sales_person },
			callback: (r) => {
				if (r.message) {
					let formatted_price = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(r.message[0]);
					$("#achieved-amount").text(formatted_price).attr("title",formatted_price);
					this.get_variance_amount();
				}
			}
		});
	}

	get_variance_amount() {
		const targetText = document.getElementById("target-amount").textContent;
		const achievedText = document.getElementById("achieved-amount").textContent;

		// Remove currency symbols and commas, then convert to float
		const target = parseFloat(targetText.replace(/[₹,]/g, "")) || 0;
		const achieved = parseFloat(achievedText.replace(/[₹,]/g, "")) || 0;

		const variance = target - achieved;

		const formattedVariance = new Intl.NumberFormat('en-IN', {
			style: 'currency',
			currency: 'INR'
		}).format(variance);

		document.getElementById("variance-amount").textContent = formattedVariance;
		document.getElementById("variance-amount").setAttribute("title", formattedVariance);
	}

	get_open_opportunity_amount_tm(sales_person = null) {
		$("#open-opportunity-amount").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.review_dashboard.review_dashboard.get_open_opportunity_amount_tm",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					let formatted_price = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(r.message);
					$("#open-opportunity-amount").text(formatted_price).attr("title",formatted_price);
				}
			}
		});
	}

	setup_widget_click_events5() {
		let lastClickedWidget5 = null;
		let tableVisible5 = false;
		let originalData5 = []; // store raw unfiltered data

		// Utility: Filter rows by brand & item group
		function applyTableFilters5() {
			const selectedGroup = $("#item-group-filter5").val();
			const selectedBrand = $("#brand-filter5").val();
			const tbody = $("#widget-data-table5");
			const thead = $("#widget-data-table5").closest("table").find("thead");

			tbody.empty();

			let filtered = originalData5;

			if (selectedGroup) {
				filtered = filtered.filter(row => row.item_group === selectedGroup);
			}
			if (selectedBrand) {
				filtered = filtered.filter(row => row.brand === selectedBrand);
			}

			if (filtered.length === 0) {
				tbody.html("<tr><td colspan='20' class='text-center'>No data found</td></tr>");
				thead.empty();
				return;
			}

			const headers = ["S.No", ...Object.keys(filtered[0])];
			let headerRow = "<tr>";
			headers.forEach(h => {
				const label = h.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
				headerRow += `<th class="text-ellipsis" title="${label ?? ""}">${label ?? ""}</th>`;
			});
			headerRow += "</tr>";
			thead.html(headerRow);

			filtered.forEach((row, index) => {
				let rowHtml = `<tr><td>${index + 1}</td>`;
				Object.keys(filtered[0]).forEach(key => {
					let val = row[key];
					let displayVal = val;
					if (val === null || val === undefined || val === "") {
						displayVal = typeof val === "number" ? 0 : "-";
					}
					if (typeof val === "number" && key !== "qty") {
						displayVal = "₹ " + val.toLocaleString("en-IN");
					}
					// If it's the 'name' column, make it a clickable link
					if (key === "name" && val) {
						const url = `/app/opportunity/${val}`;
						displayVal = `<a href="${url}" target="_blank">${val}</a>`;
					}
					//rowHtml += `<td class="text-ellipsis" title="${displayVal ?? ""}">${displayVal ?? ""}</td>`;
					rowHtml += `<td class="text-ellipsis" title="${(typeof val === 'string' || typeof val === 'number') ? val : ''}">${displayVal ?? ""}</td>`;
				});
				rowHtml += "</tr>";
				tbody.append(rowHtml);
			});
		}

		$(".show-card-popup5").on("click", function () {
			const $this = $(this);
			const method = $this.data("method");
			const widget_type5 = $this.data("type");
			const sales_person = $("#sales-person-dropdown").val() || "";
			//const time_filter2 = $("#time-filter2").val();

			if (!method) return;

			if (lastClickedWidget5 === widget_type5 && tableVisible5) {
				$("#widget-container5").hide();
				$("#widget-filters5").hide();
				$("#widget-data-table5").empty();
				$("#widget-data-table5").closest("table").find("thead").empty();
				$("#widget-title5").text("Data");
				$(".show-card-popup5").removeClass("selected-widget");
				tableVisible5 = false;
				lastClickedWidget5 = null;
				return;
			}

			$(".show-card-popup5").removeClass("selected-widget");
			$this.addClass("selected-widget");

			// Reset filters
			$("#item-group-filter5").val("");
			$("#brand-filter5").val("");

			frappe.call({
				method: `renewal_module.custom_module.page.review_dashboard.review_dashboard.${method}`,
				args: {
					sales_person
				},
				callback: function (r) {
					const data = (r.message && Array.isArray(r.message)) ? r.message[1] || [] : [];

					originalData5 = data;

					const widgetTitle = "Data: " + widget_type5.replace(/_/g, " ").toUpperCase();
					$("#widget-title5").text(widgetTitle);

					if (!data || data.length === 0) {
						$("#widget-data-table5").html("<tr><td colspan='20' class='text-center'>No data found</td></tr>");
						$("#widget-container5").show();
						$("#widget-filters5").show();
						tableVisible5 = true;
						lastClickedWidget5 = widget_type5;
						return;
					}

					applyTableFilters5();
					$("#widget-container5").show();
					$("#widget-filters5").show();
					tableVisible5 = true;
					lastClickedWidget5 = widget_type5;
				}
			});
		});

		// Reset on filter or dropdown change
		$("#sales-person-dropdown").on("change", function () {
			lastClickedWidget5 = null;
			tableVisible5 = false;
			$("#widget-container5").hide();
			$("#widget-filters5").hide();
			$("#widget-data-table5").empty();
			$("#widget-data-table5").closest("table").find("thead").empty();
			$(".show-card-popup5").removeClass("selected-widget");
		});

		// Filter table when dropdowns change
		$("#brand-filter5, #item-group-filter5").on("change", function () {
			if (tableVisible5) {
				applyTableFilters5();
			}
		});
	}

	populateDropdowns5() {
		const itemGroupFilter = document.getElementById("item-group-filter5");
		//console.log("item group:", itemGroupFilter);
		const brandFilter = document.getElementById("brand-filter5");
		//console.log("brand:", brandFilter);
		if (!itemGroupFilter || !brandFilter) return;
		// Fetch all Item Groups
		//console.log("Fetching Item Groups...");
		frappe.call({
			method: "frappe.client.get_list",
			args: {
				doctype: "Item Group",
				fields: ["name"],
				order_by:"name asc",
				limit_page_length: 999
			},
			callback: (r) => {
				if (r.message) {
					//console.log("Item Groups fetched:", r.message);
					const itemGroupFilter = document.getElementById("item-group-filter5");
					if (!itemGroupFilter) {
						console.warn("Item group filter dropdown not found.");
						return;
					}
					itemGroupFilter.innerHTML = '<option value="">item group</option>' +
						r.message.map(i => `<option value="${i.name}">${i.name}</option>`).join('');
					// Add event listener to item group dropdown
					itemGroupFilter.addEventListener("change", function () {
						const selectedItemGroup = this.value;
						//console.log("Selected Item Group:", selectedItemGroup);
						if (!selectedItemGroup) return;
						//console.log("Fetching brands based on items in selected Item Group...");
						frappe.call({
							method: "frappe.client.get_list",
							args: {
								doctype: "Item",
								fields: ["brand"],
								filters: {
									"item_group": selectedItemGroup
								},
								limit_page_length: 999
							},
							callback: (res) => {
								//console.log("Items fetched for filtering brands:", res.message);
								const brandFilter = document.getElementById("brand-filter5");
								if (!brandFilter) {
									console.warn("Brand filter dropdown not found.");
									return;
								}
								const uniqueBrands = [...new Set((res.message || []).map(i => i.brand).filter(Boolean))];
								uniqueBrands.sort((a, b) => a.localeCompare(b));
								//console.log("Filtered brands:", uniqueBrands);
								brandFilter.innerHTML = '<option value="">brand</option>' +
									uniqueBrands.map(b => `<option value="${b}">${b}</option>`).join('');
							}
						});
					});
				}
			}
		});

		// Populate all Brands
		frappe.call({
			method: "frappe.client.get_list",
			args: {
				doctype: "Brand",
				fields: ["name"],
				order_by:"name asc",
				limit_page_length: 999
			},
			callback: (r) => {
				if (r.message) {
					brandFilter.innerHTML = '<option value="">brand</option>' +
						r.message.map(b => `<option value="${b.name}">${b.name}</option>`).join("");
				}
			}
		});


	}


	//target dashboard

	sales_target_chart(sales_person = null) {
		setTimeout(() => {
			frappe.call({
				method: "renewal_module.custom_module.page.review_dashboard.target_data.get_target_data",
				args: { sales_person: sales_person },
				callback: (r) => {
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
							chart: { type: "bar", height: 195, toolbar: { show: false }, horizontal: false },
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
							tooltip: {
								y: {
									formatter: function (value) {
										return formatIndianNumber(value);
									}
								}
							},
							yaxis: {
								labels:{
									formatter:function(value){
										return formatIndianNumber(value);
									}
								}
							},
							grid: { padding: { left: 0, right: 0, top: 0, bottom: -10 } },
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
		// Utility function
		function formatIndianNumber(x) {
			if (isNaN(x)) return x;
			return x.toLocaleString("en-IN", {
				maximumFractionDigits: 0
			});
		}
	}

	salespersongrowthChart(sales_person = null) {
		frappe.call({
			method: "renewal_module.custom_module.page.review_dashboard.target_data.get_sales_target_tm",
			args: { sales_person },
			callback: (r) => {
				if (r.message) {
					//console.log("salesgrowthmonth", r.message);
					const achieved = r.message.achieved || 0;
					const target = r.message.bottomline_target || 1; // Prevent divide-by-zero
					const performance = Math.min((achieved / target) * 100, 100); // cap at 100%
					this.drawGaugeChart(performance, target);

				}
			}
		});
	}

	drawGaugeChart(performance, target) {
		const performance_label = performance >= 100 ? "Gold Zone"
			: performance >= 80 ? "Green Zone"
				: performance >= 70 ? "Blue Zone"
					: performance >= 60 ? "Yellow Zone"
						: performance >= 50 ? "Orange Zone"
							: "Red Zone";

		const target_segments = [
			{ from: 0, to: 50, color: "#FF0000" },
			{ from: 50, to: 60, color: "#FC7200" },
			{ from: 60, to: 70, color: "#FCCD00" },
			{ from: 70, to: 80, color: "#73B3FE" },
			{ from: 80, to: 100, color: "#4ECF1A" },
			{ from: 100, to: 105, color: "#ECC440" }
		];


		const arcData = [];
		const arcColors = [];

		for (let i = 0; i < target_segments.length; i++) {
			const seg = target_segments[i];
			const range = seg.to - seg.from;
			arcData.push(range);
			arcColors.push(seg.color);
		}

		// Destroy old chart if exists
		if (window.gaugeChartInstance) {
			window.gaugeChartInstance.destroy();
		}

		const ctx = document.getElementById('salesgrowthChart').getContext('2d');

		// Needle plugin
		const gaugeNeedle = {
			id: 'gaugeNeedle',
			afterDatasetDraw(chart) {
				const { ctx } = chart;
				const centerX = chart._metasets[0].data[0].x;
				const centerY = chart._metasets[0].data[0].y;
				const needleLength = chart._metasets[0].data[0].outerRadius * 0.9;

				const angle = Math.PI * (performance / 100) - Math.PI;
				const needleX = centerX + needleLength * Math.cos(angle);
				const needleY = centerY + needleLength * Math.sin(angle);

				// Draw needle
				ctx.save();
				ctx.beginPath();
				ctx.moveTo(centerX, centerY);
				ctx.lineTo(needleX, needleY);
				ctx.lineWidth = 3;
				ctx.strokeStyle = "#333";
				ctx.stroke();

				// Pivot circle
				ctx.beginPath();
				ctx.arc(centerX, centerY, 5, 0, 2 * Math.PI);
				ctx.fillStyle = "#333";
				ctx.fill();
				ctx.restore();
			}
		};

		const centerText = {
			id: 'centerText',
			beforeDraw(chart) {
				const { width, height, ctx } = chart;
				ctx.save();
				ctx.font = 'bold 20px sans-serif';
				ctx.textAlign = 'center';
				ctx.textBaseline = 'middle';
				ctx.fillStyle = textColor;
				const text = `${performance.toFixed(1)}%`;
				// Adjust Y position to center within the arc
				const centerX = width / 2;
				const centerY = height / 1.4; // adjust denominator to vertically center text inside the gauge
				ctx.fillText(text, centerX, centerY);
				ctx.restore();
			}
		};
		let textColor = '#333'; // fallback
		for (let i = 0; i < target_segments.length; i++) {
			const segment = target_segments[i];
			if (performance >= segment.from && performance < segment.to) {
				textColor = segment.color;
				break;
			}
		}

		window.gaugeChartInstance = new Chart(ctx, {
			type: 'doughnut',
			data: {
				datasets: [{
					data: arcData,
					backgroundColor: arcColors,
					borderWidth: 0,
					cutout: "75%",
					rotation: 270,
					circumference: 180
				}]
			},
			options: {
				responsive: true,
				plugins: {
					legend: { display: false },
					tooltip: { enabled: false },
					title: {
						display: true,
						text: [`${performance_label}`],
						color: textColor,
						font: {
							size: 18,
							weight: "bold"
						},
						padding: { top: 20, bottom: 0 }
					}
				}
			},
			plugins: [gaugeNeedle, centerText]
		});
	}

	salespersongrowthChartyear(sales_person = null) {
		frappe.call({
			method: "renewal_module.custom_module.page.review_dashboard.target_data.get_sales_target_ty",
			args: { sales_person },
			callback: (r) => {
				if (r.message) {
					//console.log("salespersongrowth", r.message);
					const achieved = r.message.Achieved || 0;
					const target = r.message.Target || 1; // Prevent divide-by-zero
					const performance_year = Math.min((achieved / target) * 100, 100); // cap at 100%
					this.drawGaugeChartyear(performance_year, target);
				}
			}
		});
	}


	drawGaugeChartyear(performance_year, target) {
		const performance_label = performance_year >= 100 ? "Gold Zone"
			: performance_year >= 80 ? "Green Zone"
				: performance_year >= 70 ? "Blue Zone"
					: performance_year >= 60 ? "Yellow Zone"
						: performance_year >= 50 ? "Orange Zone"
							: "Red Zone";

		const target_segments = [
			{ from: 0, to: 50, color: "#FF0000" },
			{ from: 50, to: 60, color: "#FC7200" },
			{ from: 60, to: 70, color: "#FCCD00" },
			{ from: 70, to: 80, color: "#73B3FE" },
			{ from: 80, to: 100, color: "#4ECF1A" },
			{ from: 100, to: 105, color: "#ECC440" }
		];

		const arcData = [];
		const arcColors = [];

		for (let i = 0; i < target_segments.length; i++) {
			const seg = target_segments[i];
			const range = seg.to - seg.from;
			arcData.push(range);
			arcColors.push(seg.color);
		}

		// Destroy old chart if exists
		if (window.gaugeChartInstanceyear) {
			window.gaugeChartInstanceyear.destroy();
		}

		const ctx = document.getElementById('salesgrowthChartYear').getContext('2d');

		// Needle plugin
		const gaugeNeedleyear = {
			id: 'gaugeNeedleyear',
			afterDatasetDraw(chart) {
				const { ctx } = chart;
				const centerX = chart._metasets[0].data[0].x;
				const centerY = chart._metasets[0].data[0].y;
				const needleLength = chart._metasets[0].data[0].outerRadius * 0.9;

				const angle = Math.PI * (performance_year / 100) - Math.PI;
				const needleX = centerX + needleLength * Math.cos(angle);
				const needleY = centerY + needleLength * Math.sin(angle);

				// Draw needle
				ctx.save();
				ctx.beginPath();
				ctx.moveTo(centerX, centerY);
				ctx.lineTo(needleX, needleY);
				ctx.lineWidth = 3;
				ctx.strokeStyle = "#333";
				ctx.stroke();

				// Pivot circle
				ctx.beginPath();
				ctx.arc(centerX, centerY, 5, 0, 2 * Math.PI);
				ctx.fillStyle = "#333";
				ctx.fill();
				ctx.restore();
			}
		};

		const centerTextyear = {
			id: 'centerText',
			beforeDraw(chart) {
				const { width, height, ctx } = chart;
				ctx.save();
				ctx.font = 'bold 20px sans-serif';
				ctx.textAlign = 'center';
				ctx.textBaseline = 'middle';
				ctx.fillStyle = textColor;
				const text = `${performance_year.toFixed(1)}%`;
				// Adjust Y position to center within the arc
				const centerX = width / 2;
				const centerY = height / 1.4; // adjust denominator to vertically center text inside the gauge
				ctx.fillText(text, centerX, centerY);
				ctx.restore();
			}
		};
		let textColor = '#333'; // fallback
		for (let i = 0; i < target_segments.length; i++) {
			const segment = target_segments[i];
			if (performance_year >= segment.from && performance_year < segment.to) {
				textColor = segment.color;
				break;
			}
		}

		// Create chart
		window.gaugeChartInstanceyear = new Chart(ctx, {
			type: 'doughnut',
			data: {
				datasets: [{
					data: arcData,
					backgroundColor: arcColors,
					borderWidth: 0,
					cutout: "75%",
					rotation: 270,
					circumference: 180
				}]
			},
			options: {
				responsive: true,
				plugins: {
					legend: { display: false },
					tooltip: { enabled: false },
					title: {
						display: true,
						text: [`${performance_label}`],
						color: textColor,
						font: {
							size: 18,
							weight: "bold"
						},
						padding: { top: 20, bottom: 0 }
					}
				}
			},
			plugins: [gaugeNeedleyear, centerTextyear]
		});
	}


	get_sales_target(sales_person = null) {
		setTimeout(() => {
			frappe.call({
				method: "renewal_module.custom_module.page.review_dashboard.target_data.get_sales_target_tm",
				args: { sales_person: sales_person },
				callback: (response) => {
					if (response.message) {
						let bottomline_target = Number(response.message.bottomline_target || 0);
						let achieved_target = Number(response.message.achieved || 0)
						//let achieved_percentage = (response.message.archieved / response.message.bottomline_target) * 100;
						let achieved_percentage = bottomline_target > 0 ? (achieved_target / bottomline_target) * 100 : 0;
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
						document.getElementById("targetamount").innerHTML = bottomline_target.toLocaleString("en-IN");
						document.getElementById("targetamount").style.color = "blue";
						document.getElementById("achievedamounttm").innerHTML = achieved_target.toLocaleString("en-IN");
						document.getElementById("achievedamounttm").style.color = "blue";
						document.getElementById("achievedamountpercentagetm").innerHTML = achieved_percentage.toLocaleString("en-IN", { maximumFractionDigits: 2 }) + "%";
						document.getElementById("achievedamountpercentagetm").style.color = achieved_color;
					}
				}
			});
		});
	}



	target_category_wise_chart(sales_person = null) {
		setTimeout(() => {
			frappe.call({
				method: "renewal_module.custom_module.page.review_dashboard.target_data.target_category_wise_chart_tm",
				args: { sales_person: sales_person },
				callback: function (r) {
					if (r.message) {
						//console.log("month category data", r.message);
						let message = r.message;
						let categories = [];
						let varianceAmount = [];
						let achivedAmount = [];
						let bottomlineAmount = [];

						for (let key in message) {
							let category = key;
							if (!key || key === "null") {
								category = "Unknown";
							}
							categories.push(key);
							varianceAmount.push(message[key].variance || 0);       // if available
							achivedAmount.push(message[key].achieved || 0);            // assuming this is "topline"
							bottomlineAmount.push(message[key].bottomline_target || 0);
						}
						let chartElement = document.getElementById("target-category-wise-overview");
						let options = {
							colors: ["#5BA6FE", "#6AD49A", "#F35D81"],
							series: [
								{ name: "Bottomline Amount", data: bottomlineAmount },
								{ name: "Archived Amount", data: achivedAmount },
								{ name: "Variance Amount", data: varianceAmount },
							],
							chart: {
								type: "line",
								height: 210,
								toolbar: { show: false },
								animations: {
									enabled: false
								}
							},
							dataLabels: { enabled: false },
							plotOptions: { bar: { borderRadius: 4, columnWidth: "45%" } },
							legend: { show: false },
							xaxis: {
								//categories: r.message.categories,  // X-axis is now category type
								categories: categories,
								axisBorder: { show: false },
								axisTicks: { show: false },
								tooltip: {
									enabled: false
								},
								labels: {
									rotate: 0,
									hideOverlappingLabels: true,
									showDuplicates: false,
									style: { fontSize: "14px", fontFamily: "Arial, sans-serif", fontWeight: 400 }
								}
							},
							grid: { padding: { left: 0, right: 0, top: 0, bottom: -10 } },
							yaxis: {
								labels:{
									formatter:function(value){
										return formatIndianNumber(value);
									}
								}
							},
							tooltip: {

								y: {
									formatter: function (value) {
										return formatIndianNumber(value);
									}
								}
							},
							yaxis: {
								labels:{
									formatter:function(value){
										return formatIndianNumber(value);
									}
								}
							}

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
		// Utility function
		function formatIndianNumber(x) {
			if (isNaN(x)) return x;
			return x.toLocaleString("en-IN", {
				maximumFractionDigits: 0
			});
		}
	}

	target_category_wise_overall_chart(sales_person = null) {
		setTimeout(() => {
			frappe.call({
				method: "renewal_module.custom_module.page.review_dashboard.target_data.target_category_wise_overall_chart",
				args: { sales_person: sales_person },
				callback: function (r) {
					if (r.message) {
						//console.log("overall category Data:", r.message);
						let message = r.message;
						let categories = [];
						let varianceAmount = [];
						let achivedAmount = [];
						let bottomlineAmount = [];

						for (let key in message) {
							let category = key;
							if (!key || key === "null") {
								category = "Unknown";
							}
							categories.push(key);
							varianceAmount.push(message[key].variance || 0);       // if available
							achivedAmount.push(message[key].achieved || 0);            // assuming this is "topline"
							bottomlineAmount.push(message[key].bottomline_target || 0);
						}
						let chartElement = document.getElementById("target-category-wise-overall");
						let options = {
							colors: ["#5BA6FE", "#6AD49A", "#F35D81"],
							series: [
								{ name: "Bottomline Amount", data: bottomlineAmount },
								{ name: "Archived Amount", data: achivedAmount },
								{ name: "Variance Amount", data: varianceAmount },
							],
							// series: [
							// 	{ name: "Target Amount", data: r.message.target_amount, type: "bar" },
							// 	{ name: "Topline Amount", data: r.message.topline_target, type: "bar" },
							// 	{ name: "Bottomline Amount", data: r.message.bottomline_target, type: "bar" },
							// ],
							chart: {
								type: "bar",
								height: 210,
								toolbar: { show: false },
								/*events: {
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
								}*/
							},
							dataLabels: { enabled: false },
							plotOptions: { bar: { borderRadius: 4, columnWidth: "45%" } },
							legend: { show: false },
							xaxis: {
								//categories: r.message.categories,  // X-axis is now category type
								categories: categories,
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
							tooltip: {
								y: {
									formatter: function (value) {
										return formatIndianNumber(value);
									}
								}
							},
							yaxis: {
								labels:{
									formatter:function(value){
										return formatIndianNumber(value);
									}
								}
							}

						};

						if (window.targetCategoryWiseoverallChart) {
							window.targetCategoryWiseoverallChart.destroy();
						}
						window.targetCategoryWiseoverallChart = new ApexCharts(chartElement, options);
						window.targetCategoryWiseoverallChart.render();
					}
				}
			});
		}, 500);
		// Utility function
		function formatIndianNumber(x) {
			if (isNaN(x)) return x;
			return x.toLocaleString("en-IN", {
				maximumFractionDigits: 0
			});
		}
	}

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

	get_sales_target_tm(sales_person = null) {
		setTimeout(() => {
			frappe.call({
				method: "renewal_module.custom_module.page.review_dashboard.target_data.get_sales_target_tm",
				args: { sales_person: sales_person },
				callback: (response) => {
					if (response.message) {
						//console.log("this month:", response.message)
						let bottomline_target_tm = Number(response.message.bottomline_target) || 0;
						let archieved_amount_tm = Number(response.message.archieved) || 0;
						let variance_amount_tm = Number(response.message.variance) || 0;
						// Apply styles
						//console.log("archieved:",archieved_amount_tm)
						document.getElementById("target-amount-tm").innerHTML = bottomline_target_tm.toLocaleString("en-IN");
						document.getElementById("target-amount-tm").style.color = "blue";
						document.getElementById("achieved-amount-tm").innerHTML = archieved_amount_tm.toLocaleString("en-IN");
						document.getElementById("achieved-amount-tm").style.color = "green";
						document.getElementById("variable-amount-tm").innerHTML = variance_amount_tm.toLocaleString("en-IN");
						document.getElementById("variable-amount-tm").style.color = "red"; // Variance always red
					}
				}
			});
		});
	}



	get_sales_target_tq(sales_person = null) {
		setTimeout(() => {
			frappe.call({
				method: "renewal_module.custom_module.page.review_dashboard.target_data.get_sales_target_tq",
				args: { sales_person: sales_person },
				callback: (response) => {
					//console.log("this quarter", response.message)
					if (response.message) {
						let bottomline_target_tq = Number(response.message.bottomline_target) || 0;
						let achieved_amount_tq = Number(response.message.achieved) || 0;
						let variance_amount_tq = Number(response.message.variance) || 0;

						document.getElementById("target-amount-tq").innerHTML = bottomline_target_tq.toLocaleString("en-IN");;
						document.getElementById("target-amount-tq").style.color = "blue";
						document.getElementById("achieved-amount-tq").innerHTML = achieved_amount_tq.toLocaleString("en-IN");;
						document.getElementById("achieved-amount-tq").style.color = "green";
						document.getElementById("variable-amount-tq").innerHTML = variance_amount_tq.toLocaleString("en-IN");;
						document.getElementById("variable-amount-tq").style.color = "red";
						document.getElementById("quarter-heading").innerHTML = response.message.current_quarter_months || "This Quarter";
					}
				}
			});
		})
	}

	get_sales_target_ty(sales_person = null) {
		setTimeout(() => {
			frappe.call({
				method: "renewal_module.custom_module.page.review_dashboard.target_data.get_sales_target_ty",
				args: { sales_person: sales_person },
				callback: (response) => {
					if (response.message) {
						//console.log("this year", response.message);
						let target_ty = Number(response.message.Target) || 0;
						let achieved_amount_ty = Number(response.message.Achieved) || 0;
						let variance_amount_ty = Number(response.message.variance) || 0;
						// Calculate achieved percentage
						let achieved_percentage = (response.message.Achieved / response.message.Target) * 100;
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
						document.getElementById("target-amount-ty").innerHTML = target_ty.toLocaleString("en-IN");;
						document.getElementById("target-amount-ty").style.color = "blue";
						document.getElementById("achieved-amount-ty").innerHTML = achieved_amount_ty.toLocaleString("en-IN");;
						document.getElementById("achieved-amount-ty").style.color = "green";
						document.getElementById("variable-amount-ty").innerHTML = variance_amount_ty.toLocaleString("en-IN");;
						document.getElementById("variable-amount-ty").style.color = "red";
					}
				}
			});
		})
	}

	//activity target 

	get_calls_tm(sales_person = null) {
		frappe.call({
			method: "renewal_module.custom_module.page.review_dashboard.activity_target.get_calls_tm",
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
			method: "renewal_module.custom_module.page.review_dashboard.activity_target.get_appointments_tm",
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
			method: "renewal_module.custom_module.page.review_dashboard.activity_target.get_demos_tm",
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
			method: "renewal_module.custom_module.page.review_dashboard.activity_target.get_leads_tm",
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
			method: "renewal_module.custom_module.page.review_dashboard.activity_target.get_sessions_tm",
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
			method: "renewal_module.custom_module.page.review_dashboard.activity_target.get_trainings_tm",
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
			method: "renewal_module.custom_module.page.review_dashboard.activity_target.get_fixed_amount",
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
			method: "renewal_module.custom_module.page.review_dashboard.activity_target.get_variable_amount",
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


	//sales stage  dashboard

	loadData(timeFilter = null, sales_person = null) {
		if (!timeFilter) {
			timeFilter = document.getElementById("time-filter").value;
		}
		if (!sales_person) {
			sales_person = document.getElementById("sales-person-dropdown")?.value || null;
		}
		const fromDate = document.getElementById("from-date").value;
		const toDate = document.getElementById("to-date").value;
		frappe.call({
			method: "renewal_module.custom_module.page.review_dashboard.sales_stage.get_filtered_opportunities",
			args: {
				time_filter: timeFilter,
				from_date: fromDate,
				to_date: toDate,
				sales_person: sales_person
			},
			/*callback: (r) => {
				if (r.message) {
					console.log("opportunities:", r.message);
					const { funnel_data, opportunities } = r.message;
					this.allOpportunities = opportunities;
					this.renderSalesWidgets(funnel_data);
					this.renderOpportunitiesTable([], false);
				}
			}*/
			callback: (r) => {
				if (r.message) {
					const { funnel_data, opportunities } = r.message;
					this.allOpportunities = opportunities || [];

					this.renderSalesWidgets(funnel_data || {});

					// If no opportunities, clear the table
					if (opportunities && opportunities.length > 0) {
						this.renderOpportunitiesTable([], false); // table hidden by default unless a card is clicked
					} else {
						// No opportunities: clear the table entirely
						this.renderOpportunitiesTable([], false); // show table with "No records found"
					}
				} else {
					this.allOpportunities = [];
					this.renderSalesWidgets({});
					this.renderOpportunitiesTable([], true);
				}
			}
		});

	}


	renderSalesWidgets(data) {
		const container = document.getElementById("sales-stage-cards");
		container.innerHTML = ""; // Clear previous cards
		if (!data || Object.keys(data).length === 0) {
			// Optionally display a message or leave empty
			//container.innerHTML = "<p>No data found</p>";
			return;
		}
		Object.entries(data).forEach(([stage, amount]) => {
			const card = document.createElement("div");
			card.className = "widget number-widget-box";
			card.style.cursor = "pointer";
			card.style.width = "100px"; // consistent card width
			let color = "blue";
			if (stage === "Closed Lost") color = "red";
			if (stage === "Closed Won") color = "green";

			// Store the stage as a data attribute for filtering
			card.setAttribute("data-stage", stage);

			card.innerHTML = `
				<div class="widget-head">
					<div class="widget-label">
						<div class="widget-title">
							<span class="ellipsis" title="${stage}">
								<a href="javascript:void(0);">${stage}</a>
							</span>
						</div>
					</div>
				</div>
				<div class="widget-body">
					<div class="widget-content">
						<div class="number ellipsis text-center fs-4 ${color}">
							₹ ${amount.toLocaleString("en-IN")}
						</div>
					</div>
				</div>
			`;

			card.addEventListener("click", () => {
				if (this.activeStage === stage) {
					this.activeStage = null;
					this.renderOpportunitiesTable([], false); // hide table
					this.clearActiveCardStyles();
				} else {
					this.activeStage = stage;
					// 👇 Reset dropdowns
					this.populateDropdowns();
					// 👇 Filter only by selected sales stage (ignoring brand/item_group)
					this.filterTableByStage(stage);
					this.highlightActiveCard(stage);
				}
			});

			container.appendChild(card);
		});
	}

	highlightActiveCard(stage) {
		const cards = document.querySelectorAll('#sales-stage-cards .widget.number-widget-box');
		cards.forEach(card => {
			if (card.getAttribute('data-stage') === stage) {
				card.classList.add('active');
			} else {
				card.classList.remove('active');
			}
		});
	}

	clearActiveCardStyles() {
		const cards = document.querySelectorAll('#sales-stage-cards .widget.number-widget-box');
		cards.forEach(card => {
			card.classList.remove('active');
		});
	}

	renderOpportunitiesTable(data, show = true) {
		//this.allOpportunities = data; // Store original unfiltered data
		const tableWrapper = document.getElementById("opportunity-table-container");
		// Hide the entire table container if `show` is false or no data
		/*if (!show || data.length === 0) {
			if (tableWrapper) {
				tableWrapper.style.display = "none";
			}
			return; //Stop rendering anything else
		}*/
		if (tableWrapper) {
			tableWrapper.style.display = show ? "block" : "none";
		}
		const table = document.getElementById("opportunities-table");
		table.innerHTML = "";

		// Handle <thead>
		let thead = table.querySelector("thead");
		if (!thead) {
			thead = document.createElement("thead");
			table.insertBefore(thead, table.firstChild);
		}

		const tbody = table.querySelector("tbody") || document.createElement("tbody");
		if (!tbody.parentNode) {
			table.appendChild(tbody);
		}
		tbody.innerHTML = "";
		if (data.length === 0) {
			tbody.innerHTML = `<tr><td colspan="100%" class="text-center">No records found</td></tr>`;
			return;
		}
		// Extract keys from first object
		const keys = Object.keys(data[0]);
		// Create header row
		const headerRow = document.createElement("tr");
		const snTh = document.createElement("th");
		snTh.textContent = "S.No";
		snTh.style.minWidth = "40px";
		snTh.style.maxWidth = "60px";
		snTh.style.textAlign = "center";
		headerRow.appendChild(snTh);
		keys.forEach(key => {
			const th = document.createElement("th");
			th.textContent = this.prettyLabel(key);
			th.style.minWidth = "50px";
			th.style.maxWidth = "100px";
			th.style.overflow = "hidden";
			th.style.textOverflow = "ellipsis";
			th.style.whiteSpace = "nowrap";
			th.title = this.prettyLabel(key);
			headerRow.appendChild(th);
		});
		thead.appendChild(headerRow);
		// Create data rows
		data.forEach((item, index) => {
			const row = document.createElement("tr");
			// Serial number cell
			const snTd = document.createElement("td");
			snTd.textContent = index + 1;
			snTd.style.textAlign = "center";
			snTd.style.fontWeight = "bold";
			row.appendChild(snTd);
			keys.forEach(key => {
				const td = document.createElement("td");
				let value = item[key] !== null && item[key] !== undefined ? item[key] : '';
				// Set ellipsis styles
				td.style.minWidth = "50px";
				td.style.maxWidth = "100px";
				td.style.overflow = "hidden";
				td.style.textOverflow = "ellipsis";
				td.style.whiteSpace = "nowrap";
				if (key === "name") {
					const link = document.createElement("a");
					link.href = `/app/opportunity/${value}`;
					link.textContent = value;
					link.target = "_blank";
					link.rel = "noopener noreferrer";
					link.style.textDecoration = "none";
					link.style.color = "#007bff";
					link.title = value;
					td.appendChild(link);
				}
				else if (["amount", "buying_amount", "gross_profit", "net_profit", "margin", "mdf", "support", "orc"].includes(key) && !isNaN(value)) {
					const formatted = this.formatIndianNumber(value);
					td.textContent = formatted;
					td.title = formatted;
				}
				else {
					td.textContent = value;
					td.title = value;
				}

				row.appendChild(td);
			});
			tbody.appendChild(row);
		});
		this.currentTableBody = tbody;
		this.totalFilteredRows = Array.from(tbody.querySelectorAll("tr"));

		// Show first N rows (default 20 or selected)
		const initialCount = this.selectedRowCount || 20;
		this.showRows(initialCount);
	}

	formatIndianNumber(number) {
		const num = Number(number);
		if (isNaN(num)) return number;

		return num.toLocaleString("en-IN");  // Indian numbering system
	}

	filterTableByStage(stage) {
		if (!Array.isArray(this.allOpportunities)) {
			console.error("allOpportunities is not an array.");
			return;
		}
		const filtered = this.allOpportunities.filter(opp => opp.sales_stage === stage);
		this.renderOpportunitiesTable(filtered, true);
	}

	filterTableByItemGroupAndBrand(itemGroup, brand) {
		const filtered = this.allOpportunities.filter(opp => {
			const matchStage = this.activeStage ? opp.sales_stage === this.activeStage : true;
			const matchGroup = itemGroup ? opp.item_group === itemGroup : true;
			const matchBrand = brand ? opp.brand === brand : true;
			return matchStage && matchGroup && matchBrand;
		});
		this.renderOpportunitiesTable(filtered, true);
	}


	showRows(count = 20, button = null) {
		// Handle button UI
		if (button) {
			document.querySelectorAll(".btn-group .btn").forEach(btn => btn.classList.remove("bl"));
			button.classList.add("bl");
			this.selectedRowCount = count;
		}
		this.visibleRowCount = count;
		if (!this.currentTableBody || !this.totalFilteredRows || this.totalFilteredRows.length === 0) return;
		// Hide all rows first
		this.totalFilteredRows.forEach(row => row.style.display = "none");
		// Show only the selected number of rows
		this.totalFilteredRows.slice(0, this.visibleRowCount).forEach(row => {
			row.style.display = "";
		});
	}

	loadMoreRows() {
		if (!this.currentTableBody || !this.totalFilteredRows || this.totalFilteredRows.length === 0) return;

		const nextCount = 100;
		const rowsToShow = this.totalFilteredRows.slice(this.visibleRowCount, this.visibleRowCount + nextCount);

		rowsToShow.forEach(row => {
			row.style.display = "";
		});

		this.visibleRowCount += rowsToShow.length;
	}

	prettyLabel(key) {
		return key
			.replace(/_/g, " ")
			.replace(/\b\w/g, l => l.toUpperCase());
	}

	populateDropdowns() {
		const visibleTable = document.getElementById("opportunities-table");
		if (!visibleTable) {
			console.warn("Visible table not found:");
			return;
		}
		const itemGroupFilter = document.getElementById("item-group-filter");
		//console.log("item group:", itemGroupFilter);
		const brandFilter = document.getElementById("brand-filter");
		//console.log("brand:", brandFilter);
		if (!itemGroupFilter || !brandFilter) return;
		// Fetch all Item Groups
		//console.log("Fetching Item Groups...");
		frappe.call({
			method: "frappe.client.get_list",
			args: {
				doctype: "Item Group",
				fields: ["name"],
				order_by:"name asc",
				limit_page_length: 999
			},
			callback: (r) => {
				if (r.message) {
					//console.log("Item Groups fetched:", r.message);
					const itemGroupFilter = document.getElementById("item-group-filter");
					if (!itemGroupFilter) {
						console.warn("Item group filter dropdown not found.");
						return;
					}
					itemGroupFilter.innerHTML = '<option value="">item group</option>' +
						r.message.map(i => `<option value="${i.name}">${i.name}</option>`).join('');
					// Add event listener to item group dropdown
					itemGroupFilter.addEventListener("change", function () {
						const selectedItemGroup = this.value;
						//console.log("Selected Item Group:", selectedItemGroup);
						if (!selectedItemGroup) return;
						//console.log("Fetching brands based on items in selected Item Group...");
						frappe.call({
							method: "frappe.client.get_list",
							args: {
								doctype: "Item",
								fields: ["brand"],
								filters: {
									"item_group": selectedItemGroup
								},
								limit_page_length: 999
							},
							callback: (res) => {
								//console.log("Items fetched for filtering brands:", res.message);
								const brandFilter = document.getElementById("brand-filter");
								if (!brandFilter) {
									console.warn("Brand filter dropdown not found.");
									return;
								}
								const uniqueBrands = [...new Set((res.message || []).map(i => i.brand).filter(Boolean))];
								uniqueBrands.sort((a, b) => a.localeCompare(b));
								//console.log("Filtered brands:", uniqueBrands);
								brandFilter.innerHTML = '<option value="">brand</option>' +
									uniqueBrands.map(b => `<option value="${b}">${b}</option>`).join('');
							}
						});
					});
				}
			}
		});

		// Populate all Brands
		frappe.call({
			method: "frappe.client.get_list",
			args: {
				doctype: "Brand",
				fields: ["name"],
				order_by:"name asc",
				limit_page_length: 999
			},
			callback: (r) => {
				if (r.message) {
					brandFilter.innerHTML = '<option value="">brand</option>' +
						r.message.map(b => `<option value="${b.name}">${b.name}</option>`).join("");
				}
			}
		});

		// 👇 Filter on change
		itemGroupFilter.onchange = () => {
			const group = itemGroupFilter.value;
			const brand = brandFilter.value;
		};

		brandFilter.onchange = () => {
			const group = itemGroupFilter.value;
			const brand = brandFilter.value;
		};
	}


	

}

frappe.customer_app_page = {
	body: `
		<div class="tab-content">
			<div class="tab-pane fade show active" id="review-content" role="tabpanel" aria-labelledby="review-tab">
				<div class="mb-4 text-center">
					<button class="btn btn-sm title1" style="background-color:#e4e6ef;color:black;font-weight:bold;">
						Opportunity Dashboard
					</button>
				</div>

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


				<div class="row mt-2" style="border-radius:10px;background-color:#F3F3F3">
					<div class="title1">Last Week</div>
					<div class="col-12 col-md-12 col-lg-6 mb-1">
						<div class="row mt-1">
							<div class="col-6 col-md-2 col-lg-4 mb-1">
								<div class="widget number-widget-box show-card-popup3" data-type="opp_count_lw" data-widget-name="Opp Count(Lw)" data-method="get_opp_count_lw">
									<div class="widget-head">
										<div class="widget-label">
											<div class="widget-title">
												<span class="ellipsis" title="Opp Count(Lw)" style="color:black;">
													Opp Count(Lw)
												</span>
											</div>
										</div>
									</div>
									<div class="widget-body">
										<div class="widget-content">
											<div class="number ellipsis blue" id="opp-count-lw">0</div>
										</div>
									</div>
								</div>
							</div>	
							<div class="col-6 col-md-2 col-lg-4 mb-1">
								<div class="widget number-widget-box show-card-popup3" data-type="closed_won_lw" data-widget-name="Closed Won(Lw)" data-method="get_closed_won_amount_lw">
									<div class="widget-head">
										<div class="widget-label">
											<div class="widget-title">
												<span class="ellipsis" title="Closed Won(Lw)" style="color:black;">
													Closed Won (Lw)
												</span>
											</div>
										</div>
									</div>
									<div class="widget-body">
										<div class="widget-content">
											<div class="number green ellipsis" id="closed-won-amount-lw">₹0</div>
										</div>
									</div>
								</div>
							</div>
							<div class="col-6 col-md-2 col-lg-4 mb-1">
								<div class="widget number-widget-box show-card-popup3" data-type="closed_lost_lw" data-widget-name="Closed Lost(Lw)" data-method="get_closed_lost_amount_lw">
									<div class="widget-head">
										<div class="widget-label">
											<div class="widget-title">
												<span class="ellipsis" title="Closed Lost(Lw)" style="color:black;">
													Closed Lost(Lw)
												</span>
											</div>
										</div>
									</div>
									<div class="widget-body">
										<div class="widget-content">
											<div class="number ellipsis red" id="closed-lost-amount-lw">₹ 0.00</div>
										</div>
									</div>
								</div>
							</div>

							<div class="col-6 col-md-2 col-lg-4 mb-1">
								<div class="widget number-widget-box show-card-popup3" data-type="renewal_count_lw" data-widget-name="Renewal Count(LW)" data-method="get_renewal_count_lw">
									<div class="widget-head">
										<div class="widget-label">
											<div class="widget-title">
												<span class="ellipsis" title="Renewal Count(LW)" style="color:black;">
													Renewal Count(LW)
												</span>
											</div>
										</div>
									</div>
									<div class="widget-body">
										<div class="widget-content">
											<div class="number ellipsis blue" id="renewal-count-lw">0</div>
										</div>
									</div>
								</div>
							</div>
							<div class="col-6 col-md-2 col-lg-4 mb-1">
								<div class="widget number-widget-box show-card-popup3" data-type="renewal_amount_lw" data-widget-name="Renewal Amount(LW)" data-method="get_renewal_amount_lw">
									<div class="widget-head">
										<div class="widget-label">
											<div class="widget-title">
												<span class="ellipsis" title="Renewal Amount(LW)" style="color:black;">
													Renewal Amount(LW)
												</span>
											</div>
										</div>
									</div>
									<div class="widget-body">
										<div class="widget-content">
											<div class="number ellipsis blue" id="renewal-amount-lw">₹ 0.00</div>
										</div>
									</div>
								</div>
							</div>
							<div class="col-6 col-md-2 col-lg-4 mb-1">
								<div class="widget number-widget-box show-card-popup3" data-type="profit_amount_lw" data-widget-name="Profit Amount(LW)" data-method="get_profit_amount_lw">
									<div class="widget-head">
										<div class="widget-label">
											<div class="widget-title">
												<span class="ellipsis" title="Profit Amount(LW)" style="color:black;">
													Profit Amount(LW)
												</span>
											</div>
										</div>
									</div>
									<div class="widget-body">
										<div class="widget-content">
											<div class="number ellipsis blue" id="profit-amount-lw">₹ 0.00</div>
										</div>
									</div>
								</div>
							</div>	
						</div>
					</div>	
					
					<div class="col-12 col-md-6 col-lg-3 mb-1">
						<div class="card1 card1-flush w-100 h-100 lg-100">
							<div class="card1-header">
								<div class="widget-title d-flex1 flex-column1">
									<span class="ellipsis pt-1 fs-6"><a class="sales-link" data-base-url="https://64network.com/app/query-report/Opportunity%20Analytics?company=64+Network+Security+Pvt+Ltd+-+TG&timespan=last+week&from_date=2023-04-01&to_date=2024-03-31&group_by=Brand&based_on=Expected+Date&sales_stage=%5B%22Closed+Won%22%5D&forecast=Include&user=Administrator" target="_blank" class="title2">Brand Wise Sales (Lw)</a></span>
								</div>
							</div>
							<div class="card1-body style="height:auto;">
								<div id="brand_donut_chart_lw"></div>
							</div>
						</div>
					</div>

					<div class="col-12 col-md-6 col-lg-3 mb-1">
						<div class="card1 card1-flush w-100 h-100 lg-100">
							<div class="card1-header">
								<div class="widget-title">
									<span class="pt-1 fs-6 ellipsis"><a class="sales-link" data-base-url="https://64network.com/app/query-report/Opportunity%20Analytics?company=64+Network+Security+Pvt+Ltd+-+TG&timespan=last+week&from_date=2023-04-01&to_date=2024-03-31&group_by=Item+Group&based_on=Expected+Date&sales_stage=%5B%22Closed+Won%22%5D&forecast=Include&user=Administrator" target="_blank" class="title2">Item Group Wise Sales(Lw)</a></span>
								</div>	
							</div>
							<div class="card1-body" style="height:auto;">
								<div id="item_group_donut_chart_lw"></div>
							</div>
						</div>
					</div>

					<div class="col-12 col-md-12 col-lg-12 col-xl-12 mt-3 mb-3" id="widget-container3" style="display:none;">
						<div class="card p-2">
							<div class="d-flex align-items-center justify-content-between mb-3 flex-nowrap">
								<h5 class="mb-0 me-3" id="widget-title3">Data</h5>
								<div class="d-flex align-items-center ms-auto gap-2" style="display:none;">
									<select id="item-group-filter3" class="form-control form-select form-select-sm">
										<option value="">All Item Groups</option>
										<!-- populate with server-side options -->
									</select>
									<select id="brand-filter3" class="form-control form-select form-select-sm">
										<option value="">All Brands</option>
									</select>
								</div>	
							</div>


							<div style="max-height: 300px; overflow-y: auto; overflow-x: auto; width: 100%;">
							<table class="table table-bordered table-sm table-striped table-responsive">
								<thead></thead>
								<tbody id="widget-data-table3"></tbody>
							</table>
							</div>
						</div>
					</div>
					
				</div>

				<div class="row mt-2" style="border-radius:10px;background-color:#F3F3F3">
					<div class="d-flex align-items-center justify-content-between mb-3 flex-nowrap">
						<div class="title3">This Month</div>
						<div class="d-flex flex-wrap align-items-center ms-auto gap-2 mb-2 mt-2">
							<select id="time-filter1" class="form-select form-select-sm me-2" style="width:130px;">
								<option value="last quarter">Last Quarter</option>
								<option value="last month">Last Month</option>
								<option value="this month" selected>This Month</option>
								<option value="this quarter">This Quarter</option>
								<option value="this year">This Year</option>
							</select>
						</div>
					</div>
					<div class="col-12 col-md-12 col-lg-6 mb-1">
						<div class="row mt-1">
							<div class="col-6 col-md-2 col-lg-4 mb-1">
								<div class="widget number-widget-box show-card-popup" data-type="Opp Count" data-widget-name="Opp Count(Tm)" data-method="get_opp_count_tm">
									<div class="widget-head">
										<div class="widget-label">
											<div class="widget-title">
												<span class="ellipsis" title="Opp Count(Tm)" style="color:black;">
													Opp Count
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
							<div class="col-6 col-md-2 col-lg-4 mb-1">
								<div class="widget number-widget-box show-card-popup" data-type="closed_won" data-widget-name="Closed Won(Tm)" data-method="get_closed_won_amount_tm">
									<div class="widget-head">
										<div class="widget-label">
											<div class="widget-title">
												<span class="ellipsis" title="Closed Won(Tm)" style="color:black;">
													Closed Won
												</span>
											</div>
										</div>
									</div>
									<div class="widget-body">
										<div class="widget-content">
											<div class="number green ellipsis" id="closed-won-amount-tm">₹0</div>
										</div>
									</div>
								</div>
							</div>
							<div class="col-6 col-md-2 col-lg-4 mb-1">
								<div class="widget number-widget-box show-card-popup" data-type="closed_lost" data-widget-name="Closed Lost(Tm)" data-method="get_closed_lost_amount_tm">
									<div class="widget-head">
										<div class="widget-label">
											<div class="widget-title">
												<span class="ellipsis" title="Closed Lost(Tm)" style="color:black;">
													Closed Lost
												</span>
											</div>
										</div>
									</div>
									<div class="widget-body">
										<div class="widget-content">
											<div class="number ellipsis red" id="closed-lost-amount-tm">₹ 0.00</div>
										</div>
									</div>
								</div>
							</div>

							<div class="col-6 col-md-2 col-lg-4 mb-1">
								<div class="widget number-widget-box show-card-popup" data-type="Renewal count" data-widget-name="Renewal Count(Tm)" data-method="get_renewal_count_tm">
									<div class="widget-head">
										<div class="widget-label">
											<div class="widget-title">
												<span class="ellipsis" title="Renewal Count" style="color:black;">
													Renewal Count
												</span>
											</div>
										</div>
									</div>
									<div class="widget-body">
										<div class="widget-content">
											<div class="number ellipsis blue" id="renewal-count-tm">0</div>
										</div>
									</div>
								</div>
							</div>
							<div class="col-6 col-md-2 col-lg-4 mb-1">
								<div class="widget number-widget-box show-card-popup" data-type="renewal amount" data-widget-name="Renewal Amount(Tm)" data-method="get_renewal_amount_tm">
									<div class="widget-head">
										<div class="widget-label">
											<div class="widget-title">
												<span class="ellipsis" title="Renewal Amount" style="color:black;">
													Renewal Amount
												</span>
											</div>
										</div>
									</div>
									<div class="widget-body">
										<div class="widget-content">
											<div class="number ellipsis blue" id="renewal-amount-tm">₹ 0.00</div>
										</div>
									</div>
								</div>
							</div>
							<div class="col-6 col-md-2 col-lg-4 mb-1">
								<div class="widget number-widget-box show-card-popup" data-type="profit amount" data-widget-name="Profit Amount(Tm)" data-method="get_profit_amount_tm">
									<div class="widget-head">
										<div class="widget-label">
											<div class="widget-title">
												<span class="ellipsis" title="Profit Amount" style="color:black;">
													Profit Amount
												</span>
											</div>
										</div>
									</div>
									<div class="widget-body">
										<div class="widget-content">
											<div class="number ellipsis blue" id="profit-amount-tm">₹ 0.00</div>
										</div>
									</div>
								</div>
							</div>	
						</div>
					</div>	
					

					<div class="col-12 col-md-12 col-lg-6 mb-1">
						<div class="card1 card1-flush h-lg-100 h-100" style="background-color:white">
							<div class="card1-header">
								<div class="widget-title d-flex1 flex-column1">
									<span class="pt-1 fs-6 ellipsis"><a class="sales-link" data-base-url="https://64network.com/app/query-report/Opportunity%20Analytics?company=64+Network+Security+Pvt+Ltd+-+TG&timespan=this+month&from_date=2023-04-01&to_date=2024-03-31&group_by=Opportunity&based_on=Expected+Date&forecast=Include&user=Administrator" target="_blank" target="_blank" class="title2">Sales Funnel</a></span>
								</div>
							</div>
							<div class="card1-body" style="height:auto;">                 
								<div id="sales-funnel-chart" class="pl-2 pr-2"></div>       
							</div>
						
						</div>
					</div>

					<div class="col-12 col-md-12 col-lg-12 col-xl-12 mt-3 mb-3" id="widget-container" style="display:none;">
						<div class="card p-2">
							<div class="d-flex align-items-center justify-content-between mb-3 flex-nowrap">
								<h5 class="mb-0 me-3" id="widget-title">Data</h5>
								<div class="d-flex align-items-center ms-auto gap-2" style="display:none;">
									<select id="item-group-filter1" class="form-control form-select form-select-sm">
										<option value="">All Item Groups</option>
										<!-- populate with server-side options -->
									</select>
									<select id="brand-filter1" class="form-control form-select form-select-sm">
										<option value="">All Brands</option>
									</select>
								</div>	
							</div>


							<div style="max-height: 300px; overflow-y: auto; overflow-x: auto; width: 100%;">
							<table class="table table-bordered table-sm table-striped table-responsive">
								<thead></thead>
								<tbody id="widget-data-table"></tbody>
							</table>
							</div>
						</div>
					</div>
					
				</div>

				<div class="row mt-2" style="border-radius:10px;background-color:#F3F3F3">
					<div class="d-flex align-items-center justify-content-between mb-3 flex-nowrap">
						<div class="title1">Renewal List</div>
						<div class="d-flex flex-wrap align-items-center ms-auto gap-2 mb-2 mt-2">
							<select id="time-filter2" class="form-select form-select-sm me-2" style="width:130px;">
								<option value="last week" selected>Last Week</option>
								<option value="last month">Last Month</option>
								<option value="this week">This Week</option>
								<option value="this month">This Month</option>
							</select>
						</div>
					</div>
					<div class="col-6 col-md-2 col-lg-2">
						<div class="row mb-2 ms-1 mt-1 me-1">
							<div class="widget number-widget-box show-card-popup2" data-type="rnwls_pending_count" data-widget-name="Rnwls Pending(Lw)" data-method="get_rnwls_pending_count">
								<div class="widget-head">
									<div class="widget-label">
										<div class="widget-title">
											<span class="ellipsis" title="Rnwls PendingLw)" style="color:black;">
												Pending
											</span>
										</div>
									</div>
								</div>
								<div class="widget-body">
									<div class="widget-content">
										<div class="number ellipsis" id="rnwls-pending-count">₹ 0.00</div>
									</div>
								</div>
							</div>
						</div>	
					</div>
					<div class="col-6 col-md-2 col-lg-2">
						<div class="row mb-2 ms-1 mt-1 me-1">
							<div class="widget number-widget-box show-card-popup2" data-type="rnwls_cofed_count" data-widget-name="Cofed Rnwls(Lw)" data-method="get_rnwls_cofed_count">
								<div class="widget-head">
									<div class="widget-label">
										<div class="widget-title">
											<span class="ellipsis" title="Cofed Rnwls(Lw)" style="color:black;">
												Cofed
											</span>
										</div>
									</div>
								</div>
								<div class="widget-body">
									<div class="widget-content">
										<div class="number ellipsis" id="rnwls-cofed-count">₹ 0.00</div>
									</div>
								</div>
							</div>
						</div>
					</div>	
					

					<div class="col-6 col-md-2 col-lg-2">
						<div class="row mb-2 ms-1 mt-1 me-1">
							<div class="widget number-widget-box show-card-popup2" data-type="rnwls_lost_count" data-widget-name="Lost Rnwls(Lw)" data-method="get_rnwls_lost_count">
								<div class="widget-head">
									<div class="widget-label">
										<div class="widget-title">
											<span class="ellipsis" title="Lost Rnwls(Lw)" style="color:black;">
											  Lost
										</span>
										</div>
									</div>
								</div>
								<div class="widget-body">
									<div class="widget-content">
										<div class="number ellipsis" id="rnwls-lost-count">0</div>
									</div>
								</div>
							</div>
						</div>
					</div>


					<div class="col-6 col-md-2 col-lg-2">
						<div class="row mb-2 ms-1 mt-1 me-1">
							<div class="widget number-widget-box show-card-popup2" data-type="rnwls_new_opp_count" data-widget-name="Rnwls New Opp(Lw)" data-method="get_rnwls_new_opp_count">
								<div class="widget-head">
									<div class="widget-label">
										<div class="widget-title">
											<span class="ellipsis" title="Rnwls New Opp(Lw)" style="color:black;">
												New Opp
											</span>
										</div>
									</div>
								</div>
								<div class="widget-body">
									<div class="widget-content">
										<div class="number ellipsis" id="rnwls-new-opp-count">0</div>
									</div>
								</div>
							</div>
						</div>
					</div>

					<div class="col-6 col-md-2 col-lg-2">
						<div class="row mb-2 ms-1 mt-1 me-1">
							<div class="widget number-widget-box show-card-popup2" data-type="rnwls_renewed_count" data-widget-name="Rnwls Renewed(Lw)"
							data-method="get_rnwls_renewed_count">
								<div class="widget-head">
									<div class="widget-label">
										<div class="widget-title">
											<span class="ellipsis" title="Rnwls Renewed(Lw)" style="color:black;">
												Renewed(Lw)
											</span>
										</div>
									</div>
								</div>
								<div class="widget-body">
									<div class="widget-content">
										<div class="number ellipsis" id="rnwls-renewed-count">0</div>
									</div>
								</div>
							</div>
						</div>
					</div>

					<div class="col-12 col-md-12 col-lg-12 col-xl-12 mt-3 mb-3" id="widget-container2" style="display:none;">
						<div class="card p-2">
							<div class="d-flex align-items-center justify-content-between mb-3 flex-nowrap">
								<h5 class="mb-0 me-3" id="widget-title2">Data</h5>
								<div class="d-flex align-items-center ms-auto gap-2" style="display:none;">
									<select id="item-group-filter2" class="form-control form-select form-select-sm">
										<option value="">All Item Groups</option>
										<!-- populate with server-side options -->
									</select>
									<select id="brand-filter2" class="form-control form-select form-select-sm">
										<option value="">All Brands</option>
									</select>
								</div>	
							</div>


							<div style="max-height: 300px; overflow-y: auto; overflow-x: auto; width: 100%;">
							<table class="table table-bordered table-sm table-striped table-responsive">
								<thead></thead>
								<tbody id="widget-data-table2"></tbody>
							</table>
							</div>
						</div>
					</div>
					
				</div>

				<div class="row mt-5" style="border-radius:10px;background-color:#F3F3F3">
					<div class="title">Funnel</div>
					<div class="col-12 col-md-6 col-lg-6 mb-1">
						<div class="title1">This Week</div>
						<div class="row">
							<div class="col-6 mb-2">
								<div class="widget number-widget-box show-card-popup4" data-type="closure_opp_count_tw" data-widget-name="Opp Count(Tw)" data-method="get_closure_opp_count_tw">
									<div class="widget-head">
										<div class="widget-label">
											<div class="widget-title">
												<span class="ellipsis" title="Opp Count(Tw)" style="color:black;">
													Opp Count(Tw)
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
								<div class="widget number-widget-box show-card-popup4" data-type="closures_opp_amount_tw" data-widget-name="Opp Amount(Tw)" data-method="get_closure_opp_amount_tw">
									<div class="widget-head">
										<div class="widget-label">
											<div class="widget-title">
												<span class="ellipsis" title="Opp Amount(Tw)" style="color:black;">
													Opp Amount(Tw)
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
								<div class="widget number-widget-box show-card-popup4" data-type="closures_rnwls_count_tw" data-widget-name="Rnwl Count(Tw)" data-method="get_closures_rnwls_count_tw">
									<div class="widget-head">
										<div class="widget-label">
											<div class="widget-title">
												<span class="ellipsis" title="Rnwl Count(Tw)" style="color:black;">
												  Rnwl Count(Tw)
												</span>
											</div>
										</div>
									</div>
									<div class="widget-body">
										<div class="widget-content">
											<div class="number blue ellipsis" id="closures-rnwls-count-tw">0</div>
										</div>
									</div>
								</div>
							</div>
							<div class="col-6 mb-2">
								<div class="widget number-widget-box show-card-popup4" data-type="closures_rnwl_amount_tw"  data-widget-name="Rnwl Amount(Tw)" data-method="get_closures_rnwls_amount_tw">
									<div class="widget-head">
										<div class="widget-label">
											<div class="widget-title">
												<span class="ellipsis" title="Rnwl Amount(Tw)" style="color:black;">
													Rnwl Amount(Tw)
												</span>
											</div>
										</div>
									</div>
									<div class="widget-body">
										<div class="widget-content">
											<div class="number green ellipsis" id="closures-rnwls-amount-tw">0</div>
										</div>
									</div>
								</div>
							</div>
						</div>

						<div class="row mb-1">
							<div class="col-12 col-md-6 col-lg-6">
								<div class="card1 card1-flush w-100 h-100 lg-100">
									<div class="col-12 col-md-12 col-lg-12">
										<div class="card1-header">
											<div class="widget-title d-flex1 flex-column1">
												<span class="ellipsis pt-1 fs-6"><a class="sales-link" data-base-url="https://64network.com/app/query-report/Opportunity%20Analytics?company=64+Network+Security+Pvt+Ltd+-+TG&timespan=this+week&from_date=2023-04-01&to_date=2024-03-31&group_by=Brand&based_on=Expected+Date&sales_stage=%5B%22Closed+Won%22%5D&forecast=Include&opportunity_type=Renewal&user=Administrator" target="_blank" class="title2">Brand Wise Sales (TW)</a></span>
											</div>
										</div>
										<div class="card1-body style="height:auto;">
											<div id="brand_donut_chart_tw" data-kt-size="250" data-kt-line="18"></div>
										</div>
									</div>	
								</div>
							</div>	
							<div class="col-12 col-md-6 col-lg-6">
								<div class="card1 card1-flush w-100 h-100 lg-100">
									<div class="card1-header">
										<div class="widget-title d-flex1 flex-column1">
											<span class="ellipsis pt-1 fs-6"><a class="sales-link" data-base-url="https://64network.com/app/query-report/Opportunity%20Analytics?company=64+Network+Security+Pvt+Ltd+-+TG&timespan=this+week&from_date=2023-04-01&to_date=2024-03-31&group_by=Item+Group&based_on=Expected+Date&sales_stage=%5B%22Closed+Won%22%5D&forecast=Include&opportunity_type=Renewal&user=Administrator" target="_blank" class="title2 ellipsis">Item Group Wise Sales (TW)</a></span>
										</div>
									</div>
									<div class="card1-body" style="height:auto;">
										<div id="item_group_donut_chart_tw" data-kt-size="250" data-kt-line="18"></div>
									</div>
								</div>
							</div>
						</div>

					</div>
					<div class="col-12 col-md-6 col-lg-6 mb-1">
						<div class="title1">This Month</div>
						<div class="row">
							<div class="col-6 mb-2">
								<div class="widget number-widget-box show-card-popup4" data-type="closures_opp_count_tm" data-widget-name="Opp Count(TM)" data-method="get_closure_opp_count_tm">
									<div class="widget-head">
										<div class="widget-label">
											<div class="widget-title">
												<span class="ellipsis" title="Opp Count(TM)" style="color:black;">
													Opp Count(TM)
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
								<div class="widget number-widget-box show-card-popup4" data-type="closures_opp_amount_tm" data-widget-name="Opp Amount(TM)" data-method="get_closure_opp_amount_tm">
									<div class="widget-head">
										<div class="widget-label">
											<div class="widget-title">
												<span class="ellipsis" title="Opp Amount(TM)" style="color:black;">
													Opp Amount(TM)
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
								<div class="widget number-widget-box show-card-popup4" data-type="closures_rnwls_count_tm" data-widget-name="Rnwl Count(TM)" data-method="get_closures_rnwls_count_tm">
									<div class="widget-head">
										<div class="widget-label">
											<div class="widget-title">
												<span class="ellipsis" title="Rnwl Count(TM)" style="color:black;">
													Rnwl Count(TM)
												</span>
											</div>
										</div>
									</div>
									<div class="widget-body">
										<div class="widget-content">
											<div class="number blue ellipsis" id="closures-rnwls-count-tm">0</div>
										</div>
									</div>
								</div>
							</div>
							<div class="col-6 mb-2">
								<div class="widget number-widget-box show-card-popup4" data-type="closures_rnwls_amount_tw" data-widget-name="Rnwl Amount(TM)" data-method="get_closures_rnwls_amount_tm">
									<div class="widget-head">
										<div class="widget-label">
											<div class="widget-title">
												<span class="ellipsis" title="Rnwl Amount(TM)" style="color:black;">
													Rnwl Amount(TM)
												</span>
											</div>
										</div>
									</div>
									<div class="widget-body">
										<div class="widget-content">
											<div class="number green ellipsis" id="closures-rnwls-amount-tm">0</div>
										</div>
									</div>
								</div>
							</div>
						</div>

						<div class="row">
							<div class="col-12 col-md-6 col-lg-6">
								<div class="card1 card1-flush w-100 h-100 lg-100">
									<div class="card1-header">
										<div class="widget-title d-flex1 flex-column1">
											<span class="ellipsis pt-1 fs-6"><a class="sales-link" data-base-url="https://64network.com/app/query-report/Opportunity%20Analytics?company=64+Network+Security+Pvt+Ltd+-+TG&timespan=this+month&from_date=2023-04-01&to_date=2024-03-31&group_by=Brand&based_on=Expected+Date&sales_stage=%5B%22Closed+Won%22%5D&forecast=Include&user=Administrator" target="_blank" class="title2">Brand Wise Sales (TM)</a></span>
										</div>
									</div>
									<div class="card1-body style="height:auto;">
										<div id="brand_donut_chart_tm"></div>
									</div>
								</div>
							</div>	
							<div class="col-12 col-md-6 col-lg-6">
								<div class="card1 card1-flush w-100 h-100 lg-100">
									<div class="card1-header">
										<div class="widget-title d-flex1 flex-column1">
											<span class="ellipsis pt-1 fs-6"><a class="sales-link" data-base-url="https://64network.com/app/query-report/Opportunity%20Analytics?company=64+Network+Security+Pvt+Ltd+-+TG&timespan=this+month&from_date=2023-04-01&to_date=2024-03-31&group_by=Item+Group&based_on=Expected+Date&sales_stage=%5B%22Closed+Won%22%5D&forecast=Include&user=Administrator" target="_blank" class="title2">Item Group Wise Sales (TM)</a></span>
										</div>
									</div>
									<div class="card1-body" style="height:auto;">
										<div id="item_group_donut_chart_tm" data-kt-size="250" data-kt-line="18"></div>
									</div>
								</div>
							</div>
						</div>	
					</div>
					<div class="col-12 col-md-12 col-lg-12 col-xl-12 mt-3 mb-3" id="widget-container4" style="display:none;">
						<div class="card p-2">
							<div class="d-flex align-items-center justify-content-between mb-3 flex-nowrap">
								<h5 class="mb-0 me-3" id="widget-title4">Data</h5>
								<div class="d-flex align-items-center ms-auto gap-2" style="display:none;">
									<select id="item-group-filter4" class="form-control form-select form-select-sm">
										<option value="">All Item Groups</option>
										<!-- populate with server-side options -->
									</select>
									<select id="brand-filter4" class="form-control form-select form-select-sm">
										<option value="">All Brands</option>
									</select>
								</div>	
							</div>


							<div style="max-height: 300px; overflow-y: auto; overflow-x: auto; width: 100%;">
							<table class="table table-bordered table-sm table-striped table-responsive">
								<thead></thead>
								<tbody id="widget-data-table4"></tbody>
							</table>
							</div>
						</div>
					</div>
				</div>

				<div class="row mt-2" style="border-radius:10px;background-color:#F3F3F3">
					<div class="title1">Target</div>
					<div class="col-4 col-md-4 col-lg-2 mb-2">
						<div class="widget number-widget-box" data-widget-name="Target">
							<div class="widget-head">
								<div class="widget-label">
									<div class="widget-title">
										<span class="ellipsis" title="Target">
											<a class="sales-link" data-base-url="https://64network.com/app/query-report/Target%20Details%20Based%20On%20Invoice?company=64+Network+Security+Pvt+Ltd+-+TG&timespan=this+month&fiscal_year=2025-2026&from_date=2023-04-01&to_date=2024-03-31&group_by=Sales+Person" target="_blank">
											Target(TM)
											</a>
										</span>
									</div>
								</div>
							</div>
							<div class="widget-body">
								<div class="widget-content">
									<div class="number green ellipsis" id="target-amount">0</div>
								</div>
							</div>
						</div>
					</div>
					<div class="col-4 col-md-4 col-lg-2 mb-2">
						<div class="widget number-widget-box show-card-popup5" data-type="achieved_amount_tm" data-widget-name="Achieved" data-method="get_achieved_amount_tm">
							<div class="widget-head">
								<div class="widget-label">
									<div class="widget-title">
										<span class="ellipsis" title="Achieved" style="color:black;">
											Achieved(TM)
											
										</span>
									</div>
								</div>
							</div>
							<div class="widget-body">
								<div class="widget-content">
									<div class="number green ellipsis" id="achieved-amount">0</div>
								</div>
							</div>
						</div>
					</div>
					<div class="col-4 col-md-4 col-lg-2 mb-2">
						<div class="widget number-widget-box" data-widget-name="Variance">
							<div class="widget-head">
								<div class="widget-label">
									<div class="widget-title">
										<span class="ellipsis" title="Variance">
											<a class="sales-link" data-base-url="https://64network.com/app/query-report/Target%20Details%20Based%20On%20Invoice?company=64+Network+Security+Pvt+Ltd+-+TG&timespan=this+month&fiscal_year=2025-2026&from_date=2023-04-01&to_date=2024-03-31&group_by=Sales+Person" target="_blank">
											Variance(TM)
											</a>
										</span>
									</div>
								</div>
							</div>
							<div class="widget-body">
								<div class="widget-content">
									<div class="number red ellipsis" id="variance-amount">0</div>
								</div>
							</div>
						</div>
					</div>
					<div class="col-4 col-md-4 col-lg-2 mb-2">
						<div class="widget number-widget-box" data-widget-name="Open Opportunities">
							<div class="widget-head">
								<div class="widget-label">
									<div class="widget-title">
										<span class="ellipsis" title="Open Opportunities">
											<a class="sales-link" data-base-url="https://64network.com/app/query-report/Opportunity%20Analytics?company=64+Network+Security+Pvt+Ltd+-+TG&timespan=this+month&from_date=2023-04-01&to_date=2024-03-31&group_by=Opportunity&based_on=Expected+Date&forecast=Include&user=Administrator" target="_blank">
											Open Oppportunities(TM)
											</a>
										</span>
									</div>
								</div>
							</div>
							<div class="widget-body">
								<div class="widget-content">
									<div class="number green ellipsis" id="open-opportunity-amount">0</div>
								</div>
							</div>
						</div>
					</div>
					<div class="col-12 col-md-12 col-lg-12 col-xl-12 mt-3 mb-3" id="widget-container5" style="display:none;">
						<div class="card p-2">
							<div class="d-flex align-items-center justify-content-between mb-3 flex-nowrap">
								<h5 class="mb-0 me-3" id="widget-title5">Data</h5>
								<div class="d-flex align-items-center ms-auto gap-2" style="display:none;">
									<select id="item-group-filter5" class="form-control form-select form-select-sm">
										<option value="">All Item Groups</option>
										<!-- populate with server-side options -->
									</select>
									<select id="brand-filter5" class="form-control form-select form-select-sm">
										<option value="">All Brands</option>
									</select>
								</div>	
							</div>


							<div style="max-height: 300px; overflow-y: auto; overflow-x: auto; width: 100%;">
							<table class="table table-bordered table-sm table-striped table-responsive">
								<thead></thead>
								<tbody id="widget-data-table5"></tbody>
							</table>
							</div>
						</div>
					</div>
				</div>
				<div class="row" style="height:50px;"></div>
			</div>

			<div class="tab-pane fade" id="target-content" role="tabpanel" aria-labelledby="target-tab">
				<div class="mb-4 text-center">
					<button class="btn btn-sm title1" style="background-color:#e4e6ef;color:black;font-weight:bold;">Target Dashboard</button>
				</div>
				<div class="row" style="border: 1px solid #e4e6ef; border-radius:20px;">
					<div class="col-4 col-md-4 col-lg-4" style="background-color: #4F8390;border-radius: 20px 0px 0px 20px;">
						<h6 class="ml-2 mt-1" style="color:white;margin-bottom:0px;text-align:center">Salary</h6>
						<p class="ml-2" style="color:white;margin-bottom:0px;text-align:center">fixed + variable</P>
					</div>
					<div class="col-4 col-md-4 col-lg-4" style="background-color:#5EC8CE">
						<h6 style="margin-bottom:0px;color:white;margin-top:1px;text-align:center">Fixed Amount</h6>
						<p style="margin-bottom:0px;color:white;text-align:center" id="fixed-amount">₹2,40,000</p>
					</div>
					<div class="col-4 col-md-4 col-lg-4" style="background-color:#D7C7BA;border-radius: 0px 20px 20px 0px;">
						<h6 style="margin-bottom:0px;color:white;margin-top:1px;text-align:center">Variable Amount</h6>
						<p style="margin-bottom:0px;color:white;text-align:center" id="variable-amount">₹1,00,000</p>
					</div>
					<!--<div class="col-3 col-md-3 col-lg-3" style="background-color:#E8B7A0;border-radius: 0px 20px 20px 0px;">
						<h6 style="margin-bottom:0px;color:white;margin-top:1px;text-align:center">Achievd Progress</h6>
						<p style="margin-bottom:0px;color:white;text-align:center">Good</p>
					</div>-->
				</div>
				<div id="target" style="display:show">
					<div class="row mt-5" style="border-radius:10px;background-color:#F3F3F3">
						<div class="col-12 col-md-3 col-lg-3 col-xl-2 mt-2">
							<div class="card1">
								<div class="card1-header">
									<div class="widget-title d-flex1 flex-column1">
										<span class="ellipsis pt-1 fs-6"><a class="sales-link" data-base-url="https://64network.com/app/query-report/Target%20Details%20Based%20On%20Invoice?company=64+Network+Security+Pvt+Ltd+-+TG&timespan=this+year&fiscal_year=2025-2026&from_date=2023-04-01&to_date=2024-03-31&group_by=Sales+Person" target="_blank" class="title2">Overall</a></span>
									</div>
								</div>
								<div class="card1-body">
									<canvas id="salesgrowthChartYear" class="pl-2 pr-2"></canvas>
								</div>
							</div>
						</div>

						<div class="col-12 col-md-9 col-lg-9 col-xl-10 mb-1">
							<div class="mt-2 mb-1" style="background-color:#FFFFFF;border-radius:10px;">
								<div class="title1 pl-2">Monthly Performance</div>
								<div class="h-lg-100 h-100" id="sales-target-overview" style="width: 100%;"></div>
							</div>
						</div>
						
					</div>

					<div class="row mt-2" style="border-radius:10px;background-color:#F3F3F3">
						<div class="col-12 col-md-6 col-lg-2 col-xl-2 mb-1">
							<div class="row">
								<div class="col-12 col-md-12 col-lg-12 mt-1">
									<div class="widget number-widget-box" data-widget-name="Target">
										<div class="widget-head">
											<div class="widget-label">
												<div class="widget-title">
													<span class="ellipsis" title="Target">
														<a class="sales-link" data-base-url="https://64network.com/app/query-report/Target%20Details%20Based%20On%20Invoice?company=64+Network+Security+Pvt+Ltd+-+TG&timespan=this+month&fiscal_year=2025-2026&from_date=2023-04-01&to_date=2024-03-31&group_by=Sales+Person" target="_blank">Target(TM)</a>
													</span>
												</div>
											</div>
										</div>
										<div class="widget-body">
											<div class="widget-content">
												<div class="number ellipsis" id="targetamount" style="text-align:center;font-size:26px;">103</div>
											</div>
										</div>
									</div>
								</div>
							</div>	
							<div class="row mt-1">
								<div class="col-12 col-md-12 col-lg-12">
									<div class="widget number-widget-box" data-widget-name="Achievd">
										<div class="widget-head">
											<div class="widget-label">
												<div class="widget-title" style="text-align: center;">
													<span class="ellipsis" title="Achieved">
														<a class="sales-link" data-base-url="https://64network.com/app/query-report/Target%20Details%20Based%20On%20Invoice?company=64+Network+Security+Pvt+Ltd+-+TG&timespan=this+month&fiscal_year=2025-2026&from_date=2023-04-01&to_date=2024-03-31&group_by=Sales+Person" target="_blank">Achieved(TM)</a>
													</span>
												</div>
											</div>
										</div>
										<div class="widget-body">
											<div class="widget-content">
												<div class="number ellipsis" id="achievedamounttm" style="text-align:center;font-size:26px;">1</div>
											</div>
										</div>
									</div>
								</div>
							</div>
							<div class="row mt-1">
								<div class="col-12 col-md-12 col-lg-12">
									<div class="widget number-widget-box" data-widget-name="Achievd %">
										<div class="widget-head">
											<div class="widget-label">
												<div class="widget-title">
													<span class="ellipsis" title="Achieved %" style="text-align:center">
														<a class="sales-link" data-base-url="https://64network.com/app/query-report/Target%20Details%20Based%20On%20Invoice?company=64+Network+Security+Pvt+Ltd+-+TG&timespan=this+month&fiscal_year=2025-2026&from_date=2023-04-01&to_date=2024-03-31&group_by=Sales+Person" target="_blank">Achieved %(TM)</a>
													</span>
												</div>
											</div>
										</div>
										<div class="widget-body">
											<div class="widget-content">
												<div class="number ellipsis" id="achievedamountpercentagetm" style="text-align:center;font-size:26px;">1</div>
											</div>
										</div>
									</div>
								</div>
							</div>		
						</div>

						<div class="col-12 col-md-6 col-lg-3 col-xl-2 mt-2">
							<div class="card1">
								<div class="card1-header">
									<div class="widget-title d-flex1 flex-column1">
										<span class="ellipsis pt-1 fs-6"><a class="sales-link" data-base-url="https://64network.com/app/query-report/Target%20Details%20Based%20On%20Invoice?company=64+Network+Security+Pvt+Ltd+-+TG&timespan=this+month&fiscal_year=2025-2026&from_date=2023-04-01&to_date=2024-03-31&group_by=Sales+Person" target="_blank" class="title2" style="font-weight:bold;">This Month</a></span>
									</div>
								</div>
								<div class="card1-body">
									<canvas id="salesgrowthChart" class="pl-2 pr-2"></canvas>
								</div>
							</div>
						</div>

						<div class="col-12 col-md-12 col-lg-7 col-xl-8">
							<div class="mt-2 mb-1" style="background-color:#FFFFFF;border-radius:10px;">
								<div class="title1 pl-2"><a class="sales-link" data-base-url="https://64network.com/app/query-report/Target%20Details%20Based%20On%20Invoice?company=64+Network+Security+Pvt+Ltd+-+TG&timespan=this+month&fiscal_year=2025-2026&from_date=2023-04-01&to_date=2024-03-31&group_by=Sales+Person" target="_blank"> Category Wise Performance(TM)</a></div>
								<div id="target-category-wise-overview"></div>
							</div>	
						</div>
						
					</div>


					<div class="row mt-2" style="border-radius:10px; background-color:#F3F3F3">
						<div class="col-12 col-lg-4 col-xl-3 mb-1 mt-1">
							<div class="d-flex flex-column flex-md-row flex-wrap gap-1">
								<div class="flex-fill">
									<div class="table-responsive">
										<table class="table">
											<thead>
												<tr style="background-color:#f3f3f3;">
													<td colspan="3" style="font-size:14px;font-weight:bold;color:#012739;"><a class="sales-link" data-base-url="https://64network.com/app/query-report/Target%20Details%20Based%20On%20Invoice?company=64+Network+Security+Pvt+Ltd+-+TG&timespan=this+month&fiscal_year=2025-2026&from_date=2023-04-01&to_date=2024-03-31&group_by=Sales+Person" target="_blank">This Month</a></td>
												</tr>
											</thead>
											<tbody>
												<tr>
													<th class="col-4" style="font-weight:bold;">Target</th>
													<th class="col-4" style="font-weight:bold;">Achieved</th>
													<th class="col-4" style="font-weight:bold;">Variance</th>
												</tr>
												<tr>
													<td id="target-amount-tm" class="ellipsis" style="font-weight:bold;">₹0</td>
													<td id="achieved-amount-tm" class="ellipsis" style="font-weight:bold;">₹0</td>
													<td id="variable-amount-tm" class="ellipsis" style="font-weight:bold;">₹0</td>
												</tr>
											</tbody>
										</table>
									</div>
								</div>

								<div class="flex-fill">
									<div class="table-responsive">
										<table class="table">
											<thead>
												<tr style="background-color:#f3f3f3;">
													<td colspan="3" style="font-size:14px;font-weight:bold;color:#012739;" id="quarter-heading">
														<a class="sales-link" data-base-url="https://64network.com/app/query-report/Target%20Details%20Based%20On%20Invoice?company=64+Network+Security+Pvt+Ltd+-+TG&timespan=this+quarter&fiscal_year=2025-2026&from_date=2023-04-01&to_date=2024-03-31&group_by=Sales+Person" target="_blank">This Quarter</a>
													</td>
												</tr>
											</thead>
											<tbody>
												<tr>
													<th class="col-4" style="font-weight:bold;">
													<a class="sales-link" data-base-url="https://64network.com/app/query-report/Target%20Details%20Based%20On%20Invoice?company=64+Network+Security+Pvt+Ltd+-+TG&timespan=this+quarter&fiscal_year=2025-2026&from_date=2023-04-01&to_date=2024-03-31&group_by=Sales+Person" target="_blank">Target</a>
													</th>
													<th class="col-4" style="font-weight:bold;">Achieved</th>
													<th class="col-4" style="font-weight:bold;">Variance</th>
												</tr>
												<tr>
													<td id="target-amount-tq" class="ellipsis" style="font-weight:bold;">₹0</td>
													<td id="achieved-amount-tq" class="ellipsis" style="font-weight:bold;">₹0</td>
													<td id="variable-amount-tq" class="ellipsis" style="font-weight:bold;">₹0</td>
												</tr>
											</tbody>
										</table>
									</div>
								</div>

								<div class="flex-fill">
									<div class="table-responsive">
										<table class="table">
											<thead>
												<tr style="background-color:#f3f3f3;">
													<td colspan="3" style="font-size:14px;font-weight:bold;color:#012739;"><a class="sales-link" data-base-url="https://64network.com/app/query-report/Target%20Details%20Based%20On%20Invoice?company=64+Network+Security+Pvt+Ltd+-+TG&timespan=this+year&fiscal_year=2025-2026&from_date=2023-04-01&to_date=2024-03-31&group_by=Sales+Person" target="_blank">This Year</a></td>
												</tr>
											</thead>
											<tbody>
												<tr>
													<th class="col-4" style="font-weight:bold;">Target</th>
													<th class="col-4" style="font-weight:bold;">Achieved</th>
													<th class="col-4" style="font-weight:bold;">Variance</th>
												</tr>
												<tr>
													<td id="target-amount-ty" class="ellipsis" style="font-weight:bold;">₹0</td>
													<td id="achieved-amount-ty" class="ellipsis" style="font-weight:bold;">₹0</td>
													<td id="variable-amount-ty" class="ellipsis" style="font-weight:bold;">₹0</td>
												</tr>
											</tbody>
										</table>
									</div>
								</div>
							</div>

						</div>

						<div class="col-12 col-lg-8 col-xl-9 mb-1">
							<div class="mt-2 mb-1" style="background-color:#FFFFFF;border-radius:10px;">
								<div class="title1 pl-2"><a class="sales-link" data-base-url="https://64network.com/app/query-report/Target%20Details%20Based%20On%20Invoice?company=64+Network+Security+Pvt+Ltd+-+TG&timespan=this+year&fiscal_year=2025-2026&from_date=2023-04-01&to_date=2024-03-31&group_by=Sales+Person" target="_blank"> Category Wise Performance (Overall)</a></div>
								<div id="target-category-wise-overall"></div>
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

			</div>	

			<!-- sales stage Tab Content -->
			<div class="tab-pane fade show active" id="sales-stage-content" role="tabpanel" aria-labelledby="sales-stage-tab">
				<!-- Time Filter -->
				<div class="mb-4 text-center">
					<button class="btn btn-sm title1" style="background-color:#e4e6ef;color:black;font-weight:bold;">Sales Stage Dashboard</button>
				</div>
				<div class="row mb-5" style="background-color:#f3f3f3;border-radius:10px;">
					<div class="col-12 d-flex justify-content-between align-items-center flex-wrap p-2">
						<div class="title1 fw-bold">Sales stages</div>
						<div class="d-flex flex-wrap align-items-center">
							<select id="time-filter" class="form-select form-select-sm me-2" style="width:150px;">
								<option value="last 6 months">Last 6 Months</option>
								<option value="last quarter">Last Quarter</option>
								<option value="last month">Last Month</option>
								<option value="last week">Last Week</option>
								<option value="this week" selected>This Week</option>
								<option value="this month">This Month</option>
								<option value="this quarter">This Quarter</option>
								<option value="this year">This Year</option>
								<option value="next week">Next Week</option>
								<option value="next month">Next Month</option>
								<option value="next quarter">Next Quarter</option>
								<option value="next 6 months">Next 6 Months</option>
								<option value="custom">Custom</option>
							</select>

							<div id="custom-date-fields" class="d-flex flex-wrap align-items-center ms-2 hidden">
								<input type="text" id="from-date-display" class="form-control form-control-sm me-2"
									placeholder="From Date" readonly style="width:130px; cursor: pointer;background-color:white;">
								<input type="text" id="to-date-display" class="form-control form-control-sm"
									placeholder="To Date" readonly style="width:130px; cursor: pointer;background-color:white;">

								<input type="date" id="from-date" class="real-date" style="position: absolute; opacity: 0; pointer-events: none;">
								<input type="date" id="to-date" class="real-date" style="position: absolute; opacity: 0; pointer-events: none;">
							</div>
						</div>
					</div>

					<div class="col-12" style="margin-bottom:25px;">
						<!--<div id="sales-stage-cards" class="d-flex flex-wrap justify-content-center gap-2 p-2">-->
						<div id="sales-stage-cards" class="box1">
						<!-- Cards will be appended here dynamically -->
						</div>
					</div>
				</div>

				<!-- Opportunities Table -->
				<div id="opportunity-table-container" class="row mt-3 mb-3" style="background-color:#F3F3F3;border-radius:10px; display: none;">
					<div class="col-12 d-flex flex-wrap justify-content-end align-items-center mt-2">
						<select id="item-group-filter" class="form-select form-select-sm mt-2" style="width:150px;">
							<option value="">item group</option>
						</select>
						<select id="brand-filter" class="form-select form-select-sm me-3 ml-1 mt-2" style="width:150px;">
							<option value="">brands</option>
						</select>
					</div>
					<div class="col-12 table-responsive p-2">
						<table id="opportunities-table" class="table table-bordered w-100">
							<!-- Injected table rows -->
						</table>
					</div>
					
					<div class="list-paging-area level mb-2" style="padding:5px">
						<div class="level-left">
							<div class="btn-group">
							<button class="btn btn-sm b1 mr-2" data-count="20">20</button>
							<button class="btn btn-sm bl mr-2" data-count="100">100</button>
							<button class="btn btn-sm b1 mr-2" data-count="500">500</button>
							<button class="btn btn-sm b1" data-count="1500">1500</button>
						</div>
						<div class="level-right">
							<button class="btn btn-sm" id="load-more-btn">Load More</button>
						</div>
					</div>
				</div>

			</div>
		
		</div>

		<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>


	`
}				
