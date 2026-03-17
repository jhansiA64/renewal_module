// frappe.pages['crm-dashboard'].on_page_load = function(wrapper) {
// 	var page = frappe.ui.make_app_page({
// 		parent: wrapper,
// 		title: 'Dashboard',
// 		single_column: true
// 	});
// }


// frappe.pages['crm-dashboard'].on_page_load = function (wrapper) {
// 	//console.log("on_page_load triggered");
// 	new Mypage(wrapper);
// };

frappe.pages['salesperson-dashboar'].on_page_load = function (wrapper) {
	frappe._salesperson_dashboard_page = new Mypage(wrapper);  // Store instance globally
};

frappe.router.on('change', () => {
	const route = frappe.get_route();
	if (frappe._salesperson_dashboard_page && route[0] !== "salesperson-dashboar") {
		localStorage.removeItem("activeTab"); // Clear targets from localStorage
		location.reload(); // Reload the page
		localStorage.removeItem("sales_person"); // Clear salesperson from localStorage
	}
});

let selectedSalesStagesGlobal = [];
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
		this.dropdownState = {
			"opportunity-type": new Set(),
			"brand-filter": new Set(),
			"item-group-filter": new Set()
		};
		this.dropdownRegistry2 = {};
		this.dropdownRegistry5 = {};
		this.dropdownRegistry4 = {};
		this.dropdownRegistry1 = {};

	}

	load_css(callback) {
		// Load Font Awesome early (non-blocking)
		const faLink = document.createElement("link");
		faLink.rel = "stylesheet";
		faLink.href = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css";
		document.head.appendChild(faLink);

		// Load other assets via frappe.require
		frappe.require([
			"/assets/renewal_module/css/employee-dashboard/datatables.bundle1.css",
			"/assets/renewal_module/css/employee-dashboard/plugins.bundle1.css",
			"/assets/renewal_module/css/employee-dashboard/style.bundle1.css",
			"/assets/renewal_module/css/employee-dashboard/vis-timeline.bundle1.css"
		], () => {
			if (callback) callback();
		});
	}



	make() {
		//console.log("Appending body content...");
		let body = frappe.customer_app_page.body;
		$(this.page.main).append(body);
		this.add_sales_person();
		//this.update_links();
		this.add_refresh_button();
		this.add_tabs();
		//opp this week
		this.setup_widget_click_events();
		this.setupOppChartAndTable();
		this.populateDropdowns8();
		this.setup_widget_click_events11();
		this.multiselectDropdown1();
		//renewal list
		this.setup_widget_click_events2();
		this.multiselectDropdown2();
		//target this month
		this.multiselectDropdown5();
		this.setup_widget_click_events5();
		//sales stage tab
		this.bindEvents();
		this.bindevents1();
		this.multiselectDropdowns();
		this.hiddencharts();
		//closures this week
		this.setup_widget_click_events4();
		this.multiselectDropdown4();
		//activity target 
		this.setup_widget_click_events6();

	}

	add_refresh_button() {
		this.page.set_secondary_action('Refresh', function () {
			// Reload the page
			location.reload();
		}, 'refresh');
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
			const opportunityType = document.getElementById("opportunity-type")?.value || "";

			this.filterTableByItemGroupAndBrand(itemGroup, brand, opportunityType);
		});

		document.getElementById("item-group-filter")?.addEventListener("change", () => {
			const itemGroup = document.getElementById("item-group-filter")?.value || "";
			const brand = document.getElementById("brand-filter")?.value || "";
			const opportunityType = document.getElementById("opportunity-type")?.value || "";
			this.filterTableByItemGroupAndBrand(itemGroup, brand, opportunityType);
		});

		document.getElementById("opportunity-type")?.addEventListener("change", () => {
			const itemGroup = document.getElementById("item-group-filter")?.value || "";
			const brand = document.getElementById("brand-filter")?.value || "";
			const opportunityType = document.getElementById("opportunity-type")?.value || "";
			this.filterTableByItemGroupAndBrand(itemGroup, brand, opportunityType);
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
				//console.log("Calling showRows with", count);
			});
		});
		const loadMoreBtn = document.getElementById('load-more-btn');
		if (loadMoreBtn) {
			loadMoreBtn.addEventListener('click', () => {
				this.loadMoreRows();
				//console.log("Calling loadmoreRows with", count);
			});
		}

		$('.stage-card').on('click', () => {
			const stage = $(this).data('stage');
			this.handleCardClick(stage); // updates selectedStage + applies filter
		});

		function setupDisplayDateField(displayId, realId, allRealInputs) {
			const displayInput = document.getElementById(displayId);
			const realInput = document.getElementById(realId);
			// Hide all real date pickers
			const hideAllPickers = () => {
				allRealInputs.forEach(input => {
					input.style.opacity = "0";
					input.style.pointerEvents = "none";
				});
			};
			displayInput.addEventListener("click", () => {
				hideAllPickers(); // Close other open pickers
				// Position the real input to overlap the display input
				const rect = displayInput.getBoundingClientRect();
				const parentRect = displayInput.offsetParent?.getBoundingClientRect() || { top: 10, left: 0 };
				realInput.style.position = "absolute";
				//realInput.style.left = `${rect.left + window.scrollX}px`;
				//realInput.style.top = `${rect.top + window.scrollY}px`;
				realInput.style.left = `${rect.left - parentRect.left}px`;
				realInput.style.top = `${rect.bottom - parentRect.top + 4}px`;
				realInput.style.width = `${rect.width}px`;
				realInput.style.height = `${rect.height}px`;
				realInput.style.zIndex = "9999";
				realInput.style.opacity = "1";
				realInput.style.pointerEvents = "auto";
				setTimeout(() => {
					realInput.focus();
					realInput.showPicker?.(); // For modern browsers
				}, 10);
			});
			realInput.addEventListener("change", () => {
				if (realInput.value) {
					displayInput.value = formatDate(realInput.value); // Show formatted date
				}
				hideAllPickers();
			});

			realInput.addEventListener("blur", () => {
				setTimeout(hideAllPickers, 100); // Delay hiding to allow change event
			});
		}

		function formatDate(dateStr) {
			if (!dateStr) return "";
			const [yyyy, mm, dd] = dateStr.split("-");
			return `${dd}-${mm}-${yyyy}`;
		}

		// Apply to all fields
		const allRealInputs = [
			document.getElementById("from-date"),
			document.getElementById("to-date"),
			document.getElementById("from-date1"),
			document.getElementById("to-date1"),
			document.getElementById("from-date2"),
			document.getElementById("to-date2"),
			document.getElementById("from-date5"),
			document.getElementById("to-date5")
		].filter(Boolean);

		// Main Dashboard
		setupDisplayDateField("from-date-display", "from-date", allRealInputs);
		setupDisplayDateField("to-date-display", "to-date", allRealInputs);
		// Time Filter Section (opp custom date dropdown)
		setupDisplayDateField("from-date-display1", "from-date1", allRealInputs);
		setupDisplayDateField("to-date-display1", "to-date1", allRealInputs);
		// Time Filter Section (renewal custom date dropdown)
		setupDisplayDateField("from-date-display2", "from-date2", allRealInputs);
		setupDisplayDateField("to-date-display2", "to-date2", allRealInputs);

		// Time Filter Section (target this month custom date dropdown)
		setupDisplayDateField("from-date-display5", "from-date5", allRealInputs);
		setupDisplayDateField("to-date-display5", "to-date5", allRealInputs);


		// Setup time filter1 change event
		const timeFilter1 = document.getElementById("time-filter1");
		const salesDropdown = document.getElementById("sales-person-dropdown");
		const updateOpportunityCount = () => {
			let sales_person = salesDropdown.value || "";
			let time_filter1 = timeFilter1.value || "";
			const customFields = document.getElementById("custom-date-fields1");
			let from_date = "";
			let to_date = "";

			if (time_filter1 === "custom") {
				customFields.classList.remove("hidden");
				from_date = document.getElementById("from-date1").value;
				to_date = document.getElementById("to-date1").value;
				if (!from_date || !to_date) {
					console.warn("Please select both From and To dates for custom range.");
					return;
				}
			} else {
				customFields.classList.add("hidden");
			}
			this.get_opp_count_tm(sales_person, time_filter1, from_date, to_date);
			this.get_closed_won_amount_tm(sales_person, time_filter1, from_date, to_date);
			this.get_closed_lost_amount_tm(sales_person, time_filter1, from_date, to_date);
			this.get_renewal_count_tm(sales_person, time_filter1, from_date, to_date);
			this.get_renewal_amount_tm(sales_person, time_filter1, from_date, to_date);
			this.get_profit_amount_tm(sales_person, time_filter1, from_date, to_date);
			this.brand_wise_donut_chart_lw(sales_person, time_filter1, from_date, to_date);
			this.Item_group_donut_chart_lw(sales_person, time_filter1, from_date, to_date);
		};
		// Bind once only
		timeFilter1.addEventListener("change", updateOpportunityCount);
		//salesDropdown.addEventListener("change", updateOpportunityCount);
		document.getElementById("from-date1").addEventListener("change", updateOpportunityCount);
		document.getElementById("to-date1").addEventListener("change", updateOpportunityCount);

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

			$('#time-filter5').on('change', function () {
				let selectedText = $(this).find('option:selected').text();
				$('.title5').text(`Sales By Period ${selectedText}`);
			});

			let initialText5 = $('#time-filter5 option:selected').text();
			$('.title5').text(`Sales By Period ${initialText5}`);
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
			let from_date = "";
			let to_date = "";
			const customFields2 = document.getElementById("custom-date-fields2");
			if (time_filter2 === "custom") {
				customFields2.classList.remove("hidden");
				from_date = document.getElementById("from-date2").value;
				to_date = document.getElementById("to-date2").value;

				if (!from_date || !to_date) {
					console.warn("Please select both From and To dates for custom range (Renewal).");
					return;
				}
			} else {
				customFields2.classList.add("hidden");
			}
			this.get_rnwls_new_opp_count(sales_person, time_filter2, from_date, to_date);
			this.get_rnwls_lost_count(sales_person, time_filter2, from_date, to_date);
			this.get_rnwls_renewed_count(sales_person, time_filter2, from_date, to_date);
			frappe.require([
				"https://cdn.jsdelivr.net/npm/chart.js"
			], () => {
				this.loadRnwlsLineGraph(sales_person, time_filter2, from_date, to_date);
			});
		};

		// Bind only once per event type
		timeFilter2.addEventListener("change", updateRenewalCount);
		//salesDropdown2.addEventListener("change", updateRenewalCount);
		document.getElementById("from-date2").addEventListener("change", updateRenewalCount);
		document.getElementById("to-date2").addEventListener("change", updateRenewalCount);

		//sales stages cards
		const timeFilter4 = document.getElementById("time-filter");
		const salesDropdown4 = document.getElementById("sales-person-dropdown");

		const updatesalesstageCount = () => {
			const sales_person = salesDropdown4.value || "";
			const time_filter4 = timeFilter4.value || "";
			let from_date = "";
			let to_date = "";

			if (time_filter4 === "custom") {
				from_date = document.getElementById("from-date").value;
				to_date = document.getElementById("to-date").value;

				if (!from_date || !to_date) {
					console.warn("Please select both From and To dates for custom range (Renewal).");
					return;
				}
			}

			this.loadData(time_filter4, sales_person, from_date, to_date);
		};

		salesDropdown4.addEventListener("change", updatesalesstageCount);
		timeFilter4.addEventListener("change", updatesalesstageCount);
	}

	bindevents1() {
		const self = this;
		const timeFilter5 = document.getElementById("time-filter5");
		const salesDropdown5 = document.getElementById("sales-person-dropdown");
		const periodicity = document.getElementById("periodicity");

		// Toggle custom date fields
		document.getElementById("time-filter5").addEventListener("change", function () {
			const customFields = document.getElementById("custom-date-fields5");
			if (this.value === "custom") {
				customFields.classList.remove("hidden");
			} else {
				customFields.classList.add("hidden");
			}
		});

		function setupCustomDropdown({ doctype, targetId, labelField = "name", options = [], onSelectionChange = null }) {
			const selectBtn = document.getElementById(targetId);
			const btnText = selectBtn?.querySelector(".btn-text");
			const itemList = document.getElementById(`itemsList-${targetId}`);
			const searchBox = document.querySelector(`.search-input[data-target="${targetId}"]`);
			let selectedItems = new Set();

			if (!selectBtn || !btnText || !itemList || !searchBox) return;

			selectBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				document.querySelectorAll(".select-btn").forEach(btn => {
					if (btn !== selectBtn) btn.classList.remove("open");
				});
				selectBtn.classList.toggle("open");
			});

			document.addEventListener("click", (e) => {
				if (!selectBtn.closest(".custom-dropdown-wrapper").contains(e.target)) {
					selectBtn.classList.remove("open");
				}
			});

			searchBox.addEventListener("keyup", function () {
				const searchTerm = this.value.toLowerCase();
				itemList.querySelectorAll(".item").forEach(item => {
					const text = item.innerText.toLowerCase();
					item.style.display = text.includes(searchTerm) ? "flex" : "none";
				});
			});

			function renderItems(list) {
				itemList.innerHTML = "";
				list.forEach(item => {
					const value = item?.[labelField] || item?.name || (typeof item === "string" ? item : "") || "";
					const li = document.createElement("li");
					li.className = "item";
					li.setAttribute("data-value", value);
					li.setAttribute("title", value);
					li.innerHTML = `<span class="item-text">${value}</span>`;
					itemList.appendChild(li);
				});
				bindItemEvents();
			}

			function bindItemEvents() {
				itemList.querySelectorAll(".item").forEach(item => {
					item.addEventListener("click", function () {
						const value = this.getAttribute("data-value");
						if (selectedItems.has(value)) {
							selectedItems.delete(value);
							this.classList.remove("checked");
						} else {
							selectedItems.add(value);
							this.classList.add("checked");
						}

						const selectedArray = Array.from(selectedItems);
						// ✅ always use data-label for reset
						const defaultLabel = selectBtn.getAttribute("data-label")
							|| btnText.dataset.defaultLabel
							|| btnText.textContent.trim();

						if (!btnText.dataset.defaultLabel) {
							btnText.dataset.defaultLabel = defaultLabel;
						}
						// btnText.textContent = selectedArray.length > 0
						// 	? `${selectedArray.length} selected`
						// 	: `Select ${targetId.split("-").map(w => w[0].toUpperCase() + w.slice(1)).join(" ")}`;
						btnText.textContent = selectedArray.length > 0
							? `${selectedArray.length} selected`
							: btnText.dataset.defaultLabel;

						if (typeof onSelectionChange === "function") {
							onSelectionChange(selectedArray);
						}

					});
				});
			}

			if (options.length) {
				renderItems(options);
			} else {
				frappe.call({
					method: "frappe.client.get_list",
					args: {
						doctype,
						fields: [labelField],
						order_by: labelField + " asc",
						limit_page_length: 999
					},
					callback: function (r) {
						if (r.message) renderItems(r.message);
					}
				});
			}
		}
		// Initialize custom multi-select dropdown for Sales Stages
		setupCustomDropdown({
			doctype: "Sales Stage",
			targetId: "sales-stage9",
			onSelectionChange: (selectedArray) => {
				updatesalesstageCount5(selectedArray);
			}
		});
		// Function to update chart
		const updatesalesstageCount5 = (salesstages = []) => {
			const sales_person = $("#sales-person-dropdown").val() || "";
			const time_filter5 = $("#time-filter5").val() || "this week";
			const periodicity = $("#periodicity").val() || "monthly";

			let from_date = "";
			let to_date = "";
			if (time_filter5 === "custom") {
				from_date = $("#from-date5").val();
				to_date = $("#to-date5").val();
				if (!from_date || !to_date) {
					console.warn("Please select both From and To dates for custom range (Renewal).");
					return;
				}
			}
			// Always pass array, even if empty
			const safe_salesstages = Array.isArray(salesstages) ? salesstages : [];
			// Send selected stages as array to backend
			self.loadOppStatusChart(sales_person, time_filter5, periodicity, safe_salesstages, from_date, to_date);
		};
		// Attach other events
		salesDropdown5.addEventListener("change", () => updatesalesstageCount5());
		timeFilter5.addEventListener("change", () => updatesalesstageCount5());
		periodicity.addEventListener("change", () => updatesalesstageCount5());
		$("#from-date5, #to-date5").on("change", () => updatesalesstageCount5());
	}






	tryLoadData() {
		const timeFilter = document.getElementById("time-filter").value;
		const fromDate = document.getElementById("from-date").value;
		const toDate = document.getElementById("to-date").value;
		const salesPerson = document.getElementById("sales-person-dropdown")?.value || "";

		if (timeFilter === "custom" && fromDate && toDate) {
			this.loadData(timeFilter, salesPerson, fromDate, toDate); // Call only if both dates are filled
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

	hiddencharts(salesperson) {
		const chartCol = document.querySelector('.chart-column');
		const targetCol = document.querySelector('.target-column');
		const salesgrowthchartcol = document.querySelector('.salesgrowthchart-column');
		const targetCategoryWiseChartCol = document.querySelector('.target-category-wise-chart-col');
		const cardscol = document.querySelector('.cards-column');

		if (!salesperson) {
			// Hide charts
			chartCol.style.display = "none";
			salesgrowthchartcol.style.display = "none";

			// Expand target columns
			targetCol.classList.remove("col-md-9", "col-lg-9", "col-xl-10");
			targetCol.classList.add("col-12");

			targetCategoryWiseChartCol.classList.remove("col-md-12", "col-lg-7", "col-xl-8");
			targetCategoryWiseChartCol.classList.add("col-12"); // Use full width

			// Hide cards
			cardscol.style.display = "none";

		} else {
			// Show charts
			chartCol.style.display = "block";
			salesgrowthchartcol.style.display = "block";

			// Restore targetCol size
			targetCol.classList.remove("col-12");
			targetCol.classList.add("col-md-9", "col-lg-9", "col-xl-10");

			// Restore targetCategoryWiseChartCol
			targetCategoryWiseChartCol.classList.remove("col-12");
			targetCategoryWiseChartCol.classList.add("col-md-12", "col-lg-7", "col-xl-8");

			// Show cards
			cardscol.style.display = "block";
		}
	}


	get_visible_page_actions() {
		// Always get the visible and first .page-actions
		return $(".page-actions:visible").first();
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
					<a class="dropdown-item nav-link1 mb-2" id="activity-target-tab" data-target="#activity-target-content" role="tab">Activity Dashboard</a>
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
			//console.log("Activating:", tabId, "→", targetId);


			if (!$selectedTab.length || !$selectedContent.length) {
				console.warn("Tab or content not found");
				return false;
			}

			$(".dropdown-item").removeClass("active");
			$(".tab-pane").removeClass("show active");
			$selectedTab.addClass("active");
			$selectedContent.addClass("show active");
			//console.log("Selected content element:", $selectedContent);

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
			method: "renewal_module.custom_module.page.salesperson_dashboar.salesperson_dashboar.get_sales_person",
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
						//me.update_dashboard_data(toSelect);
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
		//this month
		const time_filter1 = document.getElementById("time-filter1").value;
		const from_date1 = document.getElementById("from-date1").value;
		const to_date1 = document.getElementById("to-date1").value;
		this.get_opp_count_tm(sales_person, time_filter1, from_date1, to_date1);
		this.get_closed_won_amount_tm(sales_person, time_filter1, from_date1, to_date1);
		this.get_closed_lost_amount_tm(sales_person, time_filter1, from_date1, to_date1);
		this.get_renewal_count_tm(sales_person, time_filter1, from_date1, to_date1);
		this.get_renewal_amount_tm(sales_person, time_filter1, from_date1, to_date1);
		this.get_profit_amount_tm(sales_person, time_filter1, from_date1, to_date1);
		//renewal list
		const from_date2 = document.getElementById("from-date2").value;
		const to_date2 = document.getElementById("to-date2").value;
		const time_filter2 = document.getElementById("time-filter2").value;
		this.get_rnwls_new_opp_count(sales_person, time_filter2, from_date2, to_date2);
		this.get_rnwls_lost_count(sales_person, time_filter2, from_date2, to_date2);
		this.get_rnwls_renewed_count(sales_person, time_filter2, from_date2, to_date2);
		const time_filter5 = document.getElementById("time-filter5").value;
		const sales_stages = document.getElementById("sales-stage9").value;
		const from_date5 = document.getElementById("from-date5").value;
		const to_date5 = document.getElementById("to-date5").value;
		frappe.require([
			"https://cdn.jsdelivr.net/npm/chart.js"
		], () => {
			this.loadRnwlsLineGraph(sales_person, time_filter2, from_date2, to_date2);
		});
		//frappe.require(["https://cdnjs.cloudflare.com/ajax/libs/apexcharts/3.41.0/apexcharts.min.js"], () => {
		frappe.require([
			"https://cdnjs.cloudflare.com/ajax/libs/apexcharts/3.41.0/apexcharts.min.js",
			"https://d3js.org/d3.v7.min.js"
		], () => {
			//last week
			this.brand_wise_donut_chart_lw(sales_person, time_filter1, from_date1, to_date1);
			this.Item_group_donut_chart_lw(sales_person, time_filter1, from_date1, to_date1);
			this.opportunity_target_chart(sales_person);
			this.loadOppStatusChart(sales_person, time_filter5, "monthly", sales_stages, from_date5, to_date5);
			//target dashboard
			this.sales_target_chart(sales_person);
			this.target_category_wise_chart(sales_person);
			this.target_category_wise_overall_chart(sales_person);
			//sales stage
			//closures this week
			this.brand_wise_donut_chart_tw(sales_person);
			this.Item_group_donut_chart_tw(sales_person);
			//closures this month
			this.Item_group_donut_chart_tm(sales_person);
			this.brand_wise_donut_chart_tm(sales_person);
		});
		//target this month
		this.get_open_opportunity_amount(sales_person);
		this.get_target_amount(sales_person);
		this.get_achieved_amount_tm(sales_person);

		this.get_topline_target(sales_person);
		this.get_topline_achieved(sales_person);
		this.get_bottomline_target(sales_person);
		this.get_bottomline_achieved(sales_person);
		this.get_renewal_amount(sales_person);
		this.get_new_amount(sales_person);
		this.get_renewal_amount_tt(sales_person);
		this.get_new_amount_tt(sales_person);

		//target dashboard
		this.get_fixed_amount(sales_person);
		this.get_variable_amount(sales_person);
		this.get_sales_target(sales_person);
		this.get_sales_target_tm(sales_person);
		this.get_sales_target_tq(sales_person);
		this.get_sales_target_ty(sales_person);
		this.hiddencharts(sales_person);

		//sales stages
		const timeFilter = document.getElementById("time-filter").value;
		const from_date = document.getElementById("from-date").value;
		const to_date = document.getElementById("to-date").value;
		this.loadData(timeFilter, sales_person, from_date, to_date);
		frappe.require([
			"https://cdn.jsdelivr.net/npm/chart.js"
		], () => {
			this.salespersongrowthChart(sales_person);
			this.salespersongrowthChartyear(sales_person);
		});
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

		//activity target Dashboard
		this.get_leads_count(sales_person);
		this.get_quoted_count(sales_person);
		this.get_demo_count(sales_person);
		this.get_new_customer_count(sales_person);
		this.get_appointment_count(sales_person);
		this.get_client_visit_count(sales_person);
		this.get_calls_count(sales_person);
		//this.get_training_count();
		//this.get_sessions_count();
		frappe.require([
			"https://cdn.jsdelivr.net/npm/chart.js"
		], () => {
			this.get_weekly_activity_data(sales_person);
		});

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

		$(".sales-link1, .sales-link2").each(function () {
			let baseUrl = $(this).data("base-url");
			if (!baseUrl) return;

			try {
				// Support relative base URL
				let updatedUrl = new URL(baseUrl, window.location.origin);

				// Add or update creation filter (Frappe expects unencoded JSON string)
				const creationFilter = JSON.stringify(["Timespan", "last week"]);
				updatedUrl.searchParams.set("creation", creationFilter);

				// Only add sales_person if it's a .sales-link1 and value exists
				if ($(this).hasClass("sales-link1") && typeof sales_person !== "undefined" && sales_person) {
					updatedUrl.searchParams.set("sales_person", sales_person);
				}

				// Final href with preserved original params like `status=Open`
				$(this).attr("href", updatedUrl.toString());

			} catch (err) {
				console.error("Invalid baseUrl:", baseUrl, err);
			}
		});


		$(".sales-link3, .sales-link4").each(function () {
			let baseUrl = $(this).data("base-url");
			if (!baseUrl) return;

			try {
				// Support relative base URL
				let updatedUrl = new URL(baseUrl, window.location.origin);

				// Add or update creation filter (Frappe expects unencoded JSON string)
				const creationFilter = JSON.stringify(["Timespan", "this month"]);
				updatedUrl.searchParams.set("creation", creationFilter);

				// Only add sales_person if it's a .sales-link1 and value exists
				if ($(this).hasClass("sales-link3") && typeof sales_person !== "undefined" && sales_person) {
					updatedUrl.searchParams.set("sales_person", sales_person);
				}

				// Final href with preserved original params like `status=Open`
				$(this).attr("href", updatedUrl.toString());

			} catch (err) {
				console.error("Invalid baseUrl:", baseUrl, err);
			}
		});

	}


	//last week 
	brand_wise_donut_chart_lw(sales_person = null, time_filter1 = "this week", from_date = "", to_date = "") {

		frappe.call({
			method: "renewal_module.custom_module.page.salesperson_dashboar.salesperson_dashboar.get_brand_wise_data_lw",
			args: {
				sales_person,
				time_filter1,
				from_date,
				to_date
			},
			callback: (r) => {
				//console.log("Frappe call response:", r);

				if (r.message) {
					const chartElement = document.getElementById("brand_donut_chart_lw");
					if (!chartElement) {
						console.error("Chart container #brand_donut_chart_lw not found");
						return;
					}
					// Store raw data globally
					window.originalData = r.message.raw_data || [];
					//console.log(" Stored raw data for filtering:", window.originalData);
					// Destroy existing chart if exists
					if (window.brandDonutChartlw) {
						window.brandDonutChartlw.destroy();
					}
					const brands = r.message.brand || [];
					const amounts = r.message.amounts || [];
					const labelsData = brands.length ? brands.map(label => label || " ") : ["No Data"];
					const seriesData = amounts.length ? amounts.map(val => val || 0) : [0];

					const chartOptions = {
						chart: {
							type: "donut",
							height: 180,
							events: {
								dataPointSelection: function (event, chartContext, config) {
									event.stopPropagation();
									const clickedIndex = config.dataPointIndex;
									const selectedBrand = labelsData[clickedIndex];
									//console.log("Clicked Brand:", selectedBrand);
									//console.log("index of slice:", clickedIndex);
									// Save the brand globally
									window.selectedBrandFromDonut = selectedBrand;
									//window.selectedItemGroupFromDonut = null;
									window.donutSliceSelected = true; // this is important
									// Simulate a click on the widget to load table with filter
									const methodName = "get_brand_wise_data_lw"; // 🔁 Replace with your actual method
									const widgetButton = $(`.show-card-popup11[data-method="${methodName}"]`);
									if (widgetButton.length > 0 && !widgetButton.hasClass("clicked")) {
										widgetButton.addClass("clicked");
										widgetButton.trigger("click");
										setTimeout(() => widgetButton.removeClass("clicked"), 500);
									} else {
										console.warn("⚠️ Widget button not found for method:", methodName);
									}

								}
							}
						},
						series: seriesData,
						labels: labelsData,
						colors: ["#FEB019", "#EE502D", "#008FFB", "#00E396", "#775DD0", "#546E7A"],
						dataLabels: { enabled: false },
						legend: { show: false },
						tooltip: { enabled: false },
						stroke: { lineCap: "round", width: 0.5 },
						plotOptions: {
							pie: {
								size: 100,
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

					window.brandDonutChartlw = new ApexCharts(chartElement, chartOptions);
					window.brandDonutChartlw.render();
				} else {
					console.warn("⚠️ No message received in callback.");
				}
			}
		});

		function formatIndianNumber(x) {
			if (isNaN(x)) return x;
			return x.toLocaleString("en-IN", {
				maximumFractionDigits: 0
			});
		}
	}




	Item_group_donut_chart_lw(sales_person = null, time_filter1 = "this week", from_date = "", to_date = "") {
		frappe.call({
			method: "renewal_module.custom_module.page.salesperson_dashboar.salesperson_dashboar.get_item_group_wise_data_lw",
			args: {
				sales_person: sales_person,
				time_filter1: time_filter1,
				from_date: from_date,
				to_date: to_date
			},
			callback: (r) => {
				if (r.message) {
					const chartElement = document.getElementById("item_group_donut_chart_lw");

					if (!chartElement) {
						console.error("Chart container not found");
						return;
					}

					if (window.itemGroupDonutChartlw) {
						window.itemGroupDonutChartlw.destroy();
					}

					const brands = r.message?.item_group || [];
					const amounts = r.message?.amounts || [];

					const labels = brands.length ? brands.map(label => label || "Unnamed Item Group") : ["No Data"];
					const series = amounts.length ? amounts.map(val => val || 0) : [0];

					const colors = ["#FEB019", "#EE502D", "#008FFB", "#00E396", "#775DD0", "#546E7A"];

					const chartOptions = {
						chart: {
							type: "donut",
							height: 180,
							width: "100%",
							events: {
								dataPointSelection: function (event, chartContext, config) {
									event.stopPropagation();
									const clickedIndex = config.dataPointIndex;
									const selectedItemGroup = labels[clickedIndex];
									window.selectedItemGroupFromDonut = selectedItemGroup;
									//window.selectedBrandFromDonut = null;
									window.donutitemGroupSliceSelected = true;
									// Simulate a click on the widget to load table with filter
									const methodName = "get_item_group_wise_data_lw"; // Match the data-method
									const widgetButton = $(`.show-card-popup11[data-method="${methodName}"]`);
									if (widgetButton.length > 0 && !widgetButton.hasClass("clicked")) {
										widgetButton.addClass("clicked");
										widgetButton.trigger("click");
										setTimeout(() => widgetButton.removeClass("clicked"), 500);
									} else {
										console.warn("⚠️ Widget button not found for method:", methodName);
									}
								}
							}
						},
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

					window.itemGroupDonutChartlw = new ApexCharts(chartElement, chartOptions);
					window.itemGroupDonutChartlw.render();
				}
			}
		});

		// Utility function to format numbers in Indian style
		function formatIndianNumber(x) {
			if (isNaN(x)) return x;
			return x.toLocaleString("en-IN", {
				maximumFractionDigits: 0
			});
		}
	}




	//this month achievd 

	get_opp_count_tm(sales_person = "", time_filter1 = "this week", from_date = "", to_date = "") {
		//console.log("Final sales person:", sales_person);
		//console.log("Final time filter1:", time_filter1);
		$("#opp-count-tm").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.salesperson_dashboar.salesperson_dashboar.get_opp_count_tm",
			args: {
				sales_person: sales_person,
				time_filter1: time_filter1,
				from_date: from_date,
				to_date: to_date
			},
			callback: function (r) {
				if (r.message !== undefined && r.message !== null) {
					let count = r.message.count || 0;
					$("#opp-count-tm").text(count).attr("title", count);
					//console.log("Opportunity count for this month:", count);
				}
			}
		});
	}


	get_closed_won_amount_tm(sales_person = "", time_filter1 = "this week", from_date = "", to_date = "") {
		$("#closed-won-amount-tm").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.salesperson_dashboar.salesperson_dashboar.get_closed_won_amount_tm",
			args: {
				sales_person: sales_person,
				time_filter1: time_filter1,
				from_date: from_date,
				to_date: to_date
			},
			callback: function (r) {
				if (r.message) {
					let formatted_price = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(r.message.sum || 0);
					$("#closed-won-amount-tm").text(formatted_price).attr("title", formatted_price);
					//console.log("Closed won amount for this month:", formatted_price);
					//console.log("Response data of closed won:", r.message[1]);
				}
			}
		});
	}

	get_closed_lost_amount_tm(sales_person = "", time_filter1 = "this week", from_date = "", to_date = "") {
		$("#closed-lost-amount-tm").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.salesperson_dashboar.salesperson_dashboar.get_closed_lost_amount_tm",
			args: {
				sales_person: sales_person,
				time_filter1: time_filter1,
				from_date: from_date,
				to_date: to_date
			},
			callback: function (r) {
				if (r.message) {
					let formatted_price = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(r.message.sum || 0);
					$("#closed-lost-amount-tm").text(formatted_price).attr("title", formatted_price);
					//console.log("Closed lost amount for this month:", formatted_price);
				}
			}
		});
	}

	get_renewal_count_tm(sales_person = "", time_filter1 = "this week", from_date = "", to_date = "") {
		$("#renewal-count-tm").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.salesperson_dashboar.salesperson_dashboar.get_renewal_count_tm",
			args: {
				sales_person: sales_person,
				time_filter1: time_filter1,
				from_date: from_date,
				to_date: to_date
			},
			callback: function (r) {
				if (r.message) {
					//console.log("renewal count tm:", r.message);
					$("#renewal-count-tm").text(r.message.count || 0).attr("title", r.message.count || 0);
					//console.log("Renewal count for this month:", r.message[0]);
				}
			}
		});
	}

	get_renewal_amount_tm(sales_person = "", time_filter1 = "this week", from_date = "", to_date = "") {
		$("#renewal-amount-tm").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.salesperson_dashboar.salesperson_dashboar.get_renewal_amount_tm",
			args: {
				sales_person: sales_person,
				time_filter1: time_filter1,
				from_date: from_date,
				to_date: to_date
			},
			callback: function (r) {
				if (r.message) {
					let formatted_price = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(r.message.sum || 0);
					$("#renewal-amount-tm").text(formatted_price).attr("title", formatted_price);
					//console.log("Renewal amount for this month:", formatted_price);
				}
			}
		});
	}

	get_profit_amount_tm(sales_person = "", time_filter1 = "this week", from_date = "", to_date = "") {
		$("#profit-amount-tm").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.salesperson_dashboar.salesperson_dashboar.get_profit_amount_tm",
			args: {
				sales_person: sales_person,
				time_filter1: time_filter1,
				from_date: from_date,
				to_date: to_date
			},
			callback: function (r) {
				//console.log("Profit amount response:", r);
				if (r.message) {
					let formatted_price = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(r.message.sum || 0);
					$("#profit-amount-tm").text(formatted_price).attr("title", formatted_price);
					//console.log("Profit amount for this month:", formatted_price);
				}
			}
		});
	}

	/** opportunity status */
	loadOppStatusChart(sales_person = "", time_filter5 = "this week", periodicity = "monthly", sales_stages = [], from_date = "", to_date = "") {
		// Utility: get selected sales stages from dropdown
		function getSelectedSalesStages() {
			return Array.from(document.querySelectorAll("#itemsList-sales-stage9 .item.checked"))
				.map(el => el.querySelector(".item-text")?.innerText.trim())
				.filter(Boolean);
		}

		let selected_time_filter = $("#time-filter5").val() || time_filter5;
		let selected_periodicity = $("#periodicity").val() || periodicity;
		//let selected_sales_stages = Array.isArray(sales_stages) ? sales_stages : [];
		// ✅ Always re-read from dropdown to avoid empty stages
		let selected_sales_stages = getSelectedSalesStages();

		frappe.call({
			method: "renewal_module.custom_module.page.salesperson_dashboar.salesperson_dashboar.get_opp_status_chart",
			args: {
				sales_person: sales_person,
				time_filter5: selected_time_filter,
				periodicity: selected_periodicity,
				sales_stages: selected_sales_stages,
				from_date: from_date,
				to_date: to_date
			},
			callback: (r) => {
				let data = r.message || [];
				console.log("Opportunity Status Chart Data:", data);

				let labels = data.map(d => d.period);
				let amounts = data.map(d => d.amount || 0);

				const chartElement = document.getElementById("opp-bar-chart");
				if (!chartElement) {
					console.error("Chart container #opp-bar-chart not found");
					return;
				}

				// Destroy existing chart if exists
				if (window.oppStatusChart) {
					window.oppStatusChart.destroy();
				}

				const chartOptions = {
					colors: ["#73B3FE", "#28a745", "#dc3545"],
					series: [{ name: "Amount", data: amounts, type: "bar" }],
					chart: {
						type: 'bar',
						height: 250,
						toolbar: { show: false },
						horizontal: false,
						events: {
							dataPointSelection: function (event, chartContext, config) {
								let dataPointIndex = config.dataPointIndex;
								let period = labels[dataPointIndex];
								//console.log("Period:", period, "sales_stages:", selected_sales_stages);
								if (typeof loadTableData === "function") {
									loadTableData(period, selected_sales_stages);
								}
							}
						}
					},
					dataLabels: { enabled: false },
					plotOptions: { bar: { borderRadius: 4, columnWidth: '45%' } },
					legend: { show: false },
					xaxis: {
						categories: labels,
						axisBorder: { show: false },
						labels: {
							rotate: 0,
							hideOverlappingLabels: true,
							style: { fontSize: '12px', colors: '#6c757d' }
						}
					},
					yaxis: {
						labels: {
							formatter: function (value) {
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
					grid: { padding: { left: 0, right: 0, top: 0, bottom: -10 } }
				};

				window.oppStatusChart = new ApexCharts(chartElement, chartOptions);
				window.oppStatusChart.render();
			}
		});

		function formatIndianNumber(x) {
			if (isNaN(x)) return x;
			return x.toLocaleString("en-IN", { maximumFractionDigits: 0 });
		}
	}

	// ================== TABLE HANDLER ==================
	setupOppChartAndTable() {
		self = this;
		console.log("[Setup] Opp Chart + Table Events...");

		let originalData = [];
		let tableVisible = false;
		let lastClickedBar = null;

		// Utility: get checked filter values
		function getSelectedValues(selector) {
			const checkedItems = document.querySelectorAll(`${selector} .item.checked`);
			return Array.from(checkedItems).map(item => item.querySelector('.item-text')?.innerText.trim() || "");
		}

		// Utility: get selected Sales Stages
		function getSelectedSalesStages() {
			return Array.from(document.querySelectorAll("#itemsList-sales-stage9 .item.checked"))
				.map(el => el.querySelector(".item-text")?.innerText.trim())
				.filter(Boolean);
		}

		// Utility: render table with filters applied
		function applyTableFilters() {
			//console.log("[Table] Applying filters...");
			const selectedGroups = getSelectedValues("#itemsList-item-group-filter8");
			const selectedBrands = getSelectedValues("#itemsList-brand-filter8");
			const selectedOppTypes = getSelectedValues("#itemsList-opportunity-type8");
			const selectedsalesstage1 = getSelectedValues("#itemsList-sales-stage8");

			const tbody = $("#widget-data-table8");
			const thead = $("#widget-data-table8").closest("table").find("thead");

			tbody.empty();

			let filtered = originalData;

			if (selectedGroups.length) {
				filtered = filtered.filter(row =>
					selectedGroups.some(group =>
						group.toLowerCase().trim() === String(row.item_group || "").toLowerCase().trim()
					)
				);
			}
			if (selectedBrands.length) {
				filtered = filtered.filter(row =>
					selectedBrands.some(brand =>
						brand.toLowerCase().trim() === String(row.brand || "").toLowerCase().trim()
					)
				);
			}
			if (selectedOppTypes.length) {
				filtered = filtered.filter(row =>
					selectedOppTypes.some(type =>
						type.toLowerCase().trim() === String(row.opportunity_type || "").toLowerCase().trim()
					)
				);
			}

			if (selectedsalesstage1.length) {
				filtered = filtered.filter(row =>
					selectedsalesstage1.some(stage =>
						stage.toLowerCase().trim() === String(row.sales_stage || "").toLowerCase().trim()
					)
				);
			}
			console.log("[Table] Filtered rows:", filtered.length);
			if (filtered.length === 0) {
				tbody.html("<tr><td colspan='20' class='text-center'>No data found</td></tr>");
				return;
			}
			// Render headers
			const keys = Object.keys(filtered[0]).filter(k => k !== "item_row");
			const headers = ["S.No", ...keys];
			let headerRow = "<tr>";
			headers.forEach(h => {
				let label = h;
				if (h === "name") label = "Opportunity Id";
				else label = h.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
				const thStyle = (h === "name" || h === "item_code") ? 'style="min-width:150px; max-width:150px;"' : "";
				headerRow += `<th class="text-ellipsis" title="${label ?? ""}" ${thStyle}>${label ?? ""}</th>`;
			});
			thead.html(headerRow);

			// Render rows
			filtered.forEach((row, index) => {
				let rowHtml = `<tr><td>${index + 1}</td>`;
				keys.forEach(key => {
					let val = row[key];
					let displayVal = val;
					if (val === null || val === undefined || val === "") {
						displayVal = "-";
					}
					if (typeof val === "number" && key !== "qty") {
						displayVal = "₹ " + val.toLocaleString("en-IN");
					}
					if (key === "name" && val) {
						const url = `/app/opportunity/${val}`;
						displayVal = `<a href="${url}" target="_blank">${val}</a>`;
					}
					const tdStyle = (key === "name" || key === "item_code") ? 'style="min-width:150px; max-width:150px;"' : "";
					rowHtml += `<td class="text-ellipsis" title="${(typeof val === 'string' || typeof val === 'number') ? val : ''}" ${tdStyle}>${displayVal ?? ""}</td>`;
				});
				rowHtml += "</tr>";
				tbody.append(rowHtml);
			});
		}
		// Utility: reset item-group, brand, opportunity type filters
		function resetFilters() {
			["item-group-filter8", "brand-filter8", "opportunity-type8", "sales-stage8"].forEach(filterId => {
				const dropdown = document.getElementById(filterId);
				const itemList = document.getElementById(`itemsList-${filterId}`);
				const btnText = dropdown?.querySelector(".btn-text");
				if (itemList && btnText) {
					itemList.querySelectorAll(".item.checked").forEach(el => el.classList.remove("checked"));
					//btnText.textContent = `Select ${filterId.split("-").map(w => w[0].toUpperCase() + w.slice(1)).join(" ")}`;
					// ✅ reset label to HTML's data-label instead of "Select ..."
					const cleanLabel = dropdown.getAttribute("data-label") || btnText.dataset.defaultLabel || btnText.textContent;
					btnText.textContent = cleanLabel;
				}
				if (window[`${filterId}_selectedItems`]) {
					window[`${filterId}_selectedItems`].clear();
				}
			});
		}

		// Called when bar is clicked
		window.loadTableData = function (period, chartSalesStages = []) {
			const sales_stages = chartSalesStages.length
				? chartSalesStages
				: getSelectedSalesStages();

			// Double click same bar -> hide table
			if (lastClickedBar && lastClickedBar.period === period) {
				$("#widget-container8").hide();
				$("#widget-data-table8").empty();
				$("#widget-data-table8").closest("table").find("thead").empty();
				lastClickedBar = null;
				tableVisible = false;
				return;
			}
			// Otherwise, proceed to load data
			lastClickedBar = { period };
			//console.log("[loadTableData] Triggered with:", period);
			// ✅ Reset filters when switching to a new bar
			resetFilters();
			let args = {
				period: period,
				time_filter5: $("#time-filter5").val(),
				periodicity: $("#periodicity").val(),
				sales_person: $("#sales-person-dropdown").val() || "",
				sales_stages: sales_stages
			};

			if (args.time_filter5 === "custom") {
				args.from_date = $("#from-date5").val();
				args.to_date = $("#to-date5").val();
				if (!args.from_date || !args.to_date) {
					frappe.msgprint("Please select both From Date and To Date before loading data.");
					return;
				}
			}

			//console.log("[loadTableData] Filters =>", args);
			frappe.call({
				method: "renewal_module.custom_module.page.salesperson_dashboar.salesperson_dashboar.get_opp_table_data",
				args: args,
				callback: function (r) {
					const data = r.message || [];
					originalData = data;
					console.log("Opportunity Table Data:", data);
					if (!data || data.length === 0) {
						$("#widget-data-table8").html("<tr><td colspan='20' class='text-center'>No data found</td></tr>");
					} else {
						applyTableFilters();
					}

					$("#widget-title8").text(` ${period}`);
					$("#widget-container8").show();
					tableVisible = true;
				}
			});
		};

		// Reset table on filter change
		$("#time-filter5, #periodicity").on("change", function () {
			//console.log("[Filter Change] Resetting table...");
			lastClickedBar = null;
			tableVisible = false;
			$("#widget-container8").hide();
			$("#widget-data-table8").empty();
			$("#widget-data-table8").closest("table").find("thead").empty();
		});

		// ✅ SALES STAGE FILTER CHANGE HANDLER
		$("#itemsList-sales-stage9").on("click", ".item", function () {
			setTimeout(() => {
				const selectedStages = Array.from(
					document.querySelectorAll("#itemsList-sales-stage9 .item.checked")
				).map(el => el.querySelector(".item-text")?.innerText.trim())
					.filter(Boolean);
				//console.log("[Sales Stage Change] Selected stages:", selectedStages);
				// Always hide and clear existing table data
				$("#widget-container8").hide();
				$("#widget-data-table8").empty();
				$("#widget-data-table8").closest("table").find("thead").empty();
				lastClickedBar = null;
				tableVisible = false;
				// Reload chart with new stages
				if (typeof self.loadOppStatusChart === "function") {
					//console.log("[Sales Stage Change] Reloading chart...");
					self.loadOppStatusChart(
						$("#sales-person-dropdown").val() || "",
						$("#time-filter5").val() || "this week",
						$("#periodicity").val() || "monthly",
						selectedStages,
						$("#from-date5").val() || "",
						$("#to-date5").val() || ""
					);
				}
			}, 200); // delay for DOM to update checkbox classes
		});

		// Apply filters dynamically
		$("#itemsList-item-group-filter8, #itemsList-brand-filter8, #itemsList-opportunity-type8, #itemsList-sales-stage8").on("click", function () {
			if (tableVisible) {
				applyTableFilters(); // ✅ always filter, don't hide
			}
		});

	}

	populateDropdowns8() {
		function setupCustomDropdown({ doctype, targetId, labelField = "name", options = [], onSelectionChange = null }) {
			const selectBtn = document.getElementById(targetId);
			const btnText = selectBtn?.querySelector(".btn-text");
			const itemList = document.getElementById(`itemsList-${targetId}`);
			const searchBox = document.querySelector(`.search-input[data-target="${targetId}"]`);
			let selectedItems = new Set();

			if (!selectBtn || !btnText || !itemList || !searchBox) {
				//console.log(` Dropdown setup failed for ${targetId}`);
				return;
			}

			// Toggle dropdown
			selectBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				document.querySelectorAll(".select-btn").forEach(btn => {
					if (btn !== selectBtn) btn.classList.remove("open");
				});
				selectBtn.classList.toggle("open");
			});

			// Close dropdown on outside click
			document.addEventListener("click", (e) => {
				if (!selectBtn.closest(".custom-dropdown-wrapper").contains(e.target)) {
					selectBtn.classList.remove("open");
				}
			});

			// Search filter
			searchBox.addEventListener("keyup", function () {
				const searchTerm = this.value.toLowerCase();
				itemList.querySelectorAll(".item").forEach(item => {
					const text = item.innerText.toLowerCase();
					item.style.display = text.includes(searchTerm) ? "flex" : "none";
				});
			});

			// Render list items
			function renderItems(list) {
				itemList.innerHTML = "";
				list.forEach(item => {
					const value = item?.[labelField] || item?.name || (typeof item === "string" ? item : "") || "";
					const li = document.createElement("li");
					li.className = "item";
					li.setAttribute("data-value", value);
					li.setAttribute("title", value);
					li.innerHTML = `<span class="item-text">${value}</span>`;
					itemList.appendChild(li);
				});
				bindItemEvents();
			}

			// Bind click events
			function bindItemEvents() {
				itemList.querySelectorAll(".item").forEach(item => {
					item.addEventListener("click", function () {
						const value = this.getAttribute("data-value");
						if (selectedItems.has(value)) {
							selectedItems.delete(value);
							this.classList.remove("checked");
						} else {
							selectedItems.add(value);
							this.classList.add("checked");
						}

						const selectedArray = Array.from(selectedItems);
						// ✅ always use data-label for reset
						const defaultLabel = selectBtn.getAttribute("data-label")
							|| btnText.dataset.defaultLabel
							|| btnText.textContent.trim();

						if (!btnText.dataset.defaultLabel) {
							btnText.dataset.defaultLabel = defaultLabel;
						}

						// btnText.textContent = selectedArray.length > 0
						// 	? `${selectedArray.length} selected`
						// 	: `Select ${targetId.split("-").map(w => w[0].toUpperCase() + w.slice(1)).join(" ")}`;
						// Update button text
						btnText.textContent = selectedArray.length > 0
							? `${selectedArray.length} selected`
							: btnText.dataset.defaultLabel;
						console.log(`✅ ${targetId} selected:`, selectedArray);
						if (typeof onSelectionChange === "function") {
							onSelectionChange(selectedArray);
						}
					});
				});
			}

			// Populate options
			if (options.length) {
				renderItems(options);
			} else {
				frappe.call({
					method: "frappe.client.get_list",
					args: {
						doctype,
						fields: [labelField],
						order_by: labelField + " asc",
						limit_page_length: 999
					},
					callback: function (r) {
						//console.log(` Data for ${targetId}:`, r.message);
						if (r.message) renderItems(r.message);
					}
				});
			}
		}

		// Opportunity Type
		frappe.model.with_doctype("Opportunity Item", () => {
			const opts = frappe.meta.get_docfield("Opportunity Item", "opportunity_type", null)?.options;
			const oppTypes = opts ? opts.split('\n').filter(x => x.trim()).map(opt => ({ name: opt.trim() })) : [];
			setupCustomDropdown({ doctype: "Opportunity Type", targetId: "opportunity-type8", options: oppTypes });
		});
		// Sales Stage
		setupCustomDropdown({ doctype: "Sales Stage", targetId: "sales-stage8" });

		// --- Brand (depends on Item Group) ---
		setupCustomDropdown({ doctype: "Brand", targetId: "brand-filter8", options: [] });

		// --- Item Group with Brand dependency ---
		setupCustomDropdown({
			doctype: "Item Group",
			targetId: "item-group-filter8",
			onSelectionChange: function (selectedGroups) {
				const brandList = document.getElementById("itemsList-brand-filter8");
				const brandBtnText = document.querySelector("#brand-filter8 .btn-text");

				brandList.innerHTML = '';
				brandBtnText.textContent = "Brand";

				const updateBrandList = (brands) => {
					const uniqueBrands = [...new Set(brands.filter(Boolean))];
					uniqueBrands.sort().forEach(brand => {
						const li = document.createElement("li");
						li.className = "item";
						li.setAttribute("data-value", brand);
						li.setAttribute("title", brand);
						li.innerHTML = `<span class="item-text">${brand}</span>`;
						brandList.appendChild(li);
					});

					// Rebind brand item clicks
					brandList.querySelectorAll(".item").forEach(item => {
						item.addEventListener("click", function () {
							this.classList.toggle("checked");
							const checkedItems = brandList.querySelectorAll(".item.checked");
							const labels = Array.from(checkedItems).map(i => i.innerText.trim()).join(", ");
							brandBtnText.textContent = labels.length > 15 ? labels.substring(0, 15) + "..." : (labels || "Brand");
						});
					});
				};

				// Fetch brands
				const filters = selectedGroups.length ? [["item_group", "in", selectedGroups]] : [];
				frappe.call({
					method: "frappe.client.get_list",
					args: {
						doctype: "Item",
						fields: ["brand", "item_group"],
						filters,
						limit_page_length: 999
					},
					callback: (res) => {
						//console.log(" Brands fetched:", res.message);
						const items = res.message || [];
						const brands = items.map(i => i.brand);
						updateBrandList(brands);
					}
				});
			}
		});
	}

	setup_widget_click_events() {
		const me = this;
		console.log("Setting up widget click events...");
		let lastClickedWidget = null;
		let tableVisible = false;
		let originalData = [];

		function resetDonutSelection() {
			// Only reset brand donut if it was selected
			if (window.donutSliceSelected) {
				const chartElement = document.getElementById("brand_donut_chart_lw");
				if (chartElement && window.brandDonutChartlw?.render) {
					const existingChart = window.brandDonutChartlw;
					const existingOptions = { ...existingChart.w.config };

					existingChart.destroy();
					window.brandDonutChartlw = new ApexCharts(chartElement, existingOptions);
					window.brandDonutChartlw.render();
				}

				window.donutSliceSelected = false;
				window.selectedBrandFromDonut = null;
			}

			// Only reset item group donut if it was selected
			if (window.donutitemGroupSliceSelected) {
				const chartElement = document.getElementById("item_group_donut_chart_lw");
				if (chartElement && window.itemGroupDonutChartlw?.render) {
					const existingChart = window.itemGroupDonutChartlw;
					const existingOptions = { ...existingChart.w.config };

					existingChart.destroy();
					window.itemGroupDonutChartlw = new ApexCharts(chartElement, existingOptions);
					window.itemGroupDonutChartlw.render();
				}

				window.donutitemGroupSliceSelected = false;
				window.selectedItemGroupFromDonut = null;
			}
		}


		// Get selected values from multiselect dropdowns
		function getSelectedValues(selector) {
			return Array.from(document.querySelectorAll(`${selector} .item.checked`))
				.map(item => item.querySelector('.item-text')?.innerText.trim() || "");
		}
		// Filter and render the table
		function applyTableFilters() {
			const selectedGroups = getSelectedValues("#itemsList-item-group-filter1");
			const selectedBrands = getSelectedValues("#itemsList-brand-filter1");
			const selectedStages = getSelectedValues("#itemsList-sales-stage1");
			const selectedOppTypes = getSelectedValues("#itemsList-opportunity-type1");
			//const tbody = $("#widget-data-table");
			//const thead = $("#widget-data-table").closest("table").find("thead");
			const tbody = $("#widget-table-body");
			const thead = $("#widget-table-head");
			tbody.empty();
			let filtered = originalData;
			// Apply filters
			if (selectedGroups.length) {
				filtered = filtered.filter(row =>
					selectedGroups.some(group =>
						group.toLowerCase().trim() === String(row.item_group || "").toLowerCase().trim()
					)
				);
			}
			if (selectedBrands.length) {
				filtered = filtered.filter(row =>
					selectedBrands.some(brand =>
						brand.toLowerCase().trim() === String(row.brand || "").toLowerCase().trim()
					)
				);
			}
			if (selectedStages.length) {
				filtered = filtered.filter(row =>
					selectedStages.some(stage =>
						stage.toLowerCase().trim() === String(row.sales_stage || "").toLowerCase().trim()
					)
				);
			}
			if (selectedOppTypes.length) {
				filtered = filtered.filter(row =>
					selectedOppTypes.some(type =>
						type.toLowerCase().trim() === String(row.opportunity_type || "").toLowerCase().trim()
					)
				);
			}
			// No data case
			if (filtered.length === 0) {
				tbody.html("<tr><td colspan='20' class='text-center'>No data found</td></tr>");
				return;
			}
			// Render table headers
			const keys = Object.keys(filtered[0]).filter(k => k !== "item_row");
			const headers = ["S.No", ...keys];
			let headerRow = "<tr>";
			headers.forEach(h => {
				let label = (h === "name") ? "Opportunity Id" : h.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
				const thStyle = (h === "name" || h === "item_code") ? 'style="min-width:150px; max-width:150px;"' : "";
				headerRow += `<th class="text-ellipsis" title="${label}" ${thStyle}>${label}</th>`;
			});
			headerRow += "</tr>";
			thead.html(headerRow);
			// Render table rows
			filtered.forEach((row, index) => {
				let rowHtml = `<tr><td>${index + 1}</td>`;
				keys.forEach(key => {
					let val = row[key];
					let displayVal = (val === null || val === undefined || val === "") ? "-" : val;
					if (typeof val === "number" && key !== "qty") {
						displayVal = "₹ " + val.toLocaleString("en-IN");
					}
					if (key === "name" && val) {
						displayVal = `<a href="/app/opportunity/${val}" target="_blank">${val}</a>`;
					}
					const tdStyle = (key === "name" || key === "item_code") ? 'style="min-width:150px; max-width:150px;"' : "";
					rowHtml += `<td class="text-ellipsis" title="${val}" ${tdStyle}>${displayVal}</td>`;
				});
				rowHtml += "</tr>";
				tbody.append(rowHtml);
			});
		}
		$(".show-card-popup").off("click").on("click", function () {
			resetDonutSelection();
			const $this = $(this);
			const method = $this.data("method");
			const widget_type = $this.data("type");
			const sales_person = $("#sales-person-dropdown").val() || "";
			const time_filter1 = $("#time-filter1").val();
			const from_date = $("#from-date1").val();
			const to_date = $("#to-date1").val();
			if (!method) return;
			// Toggle logic
			if (lastClickedWidget === widget_type && tableVisible) {
				$("#widget-container, #widget-filters").hide();
				$("#widget-data-table").empty().closest("table").find("thead").empty();
				$("#widget-title").text("Data");
				$(".show-card-popup,.show-card-popup11").removeClass("selected-widget");
				tableVisible = false;
				lastClickedWidget = null;
				me.resetAllDropdowns1();
				// Clear UI
				$(".custom-dropdown-wrapper .item").removeClass("checked");
				//$(".custom-dropdown-wrapper .btn-text").text("Select");
				$(".custom-dropdown-wrapper .btn-text").each(function () {
					const defaultLabel = $(this).closest(".select-btn").attr("data-label");
					if (defaultLabel) {
						$(this).text(defaultLabel); // set only the label, no "Select"
					}
				});
				return;
			}

			// Reset UI
			$(".custom-dropdown-wrapper .item").removeClass("checked");
			$(".custom-dropdown-wrapper .btn-text").each(function () {
				const defaultLabel = $(this).closest(".select-btn").attr("data-label") || $(this).text().trim();
				$(this).text(defaultLabel);  // <-- corrected line
			});
			me.resetAllDropdowns1();
			$(".show-card-popup,.show-card-popup11").removeClass("selected-widget");
			$this.addClass("selected-widget");
			// Frappe call
			frappe.call({
				method: `renewal_module.custom_module.page.salesperson_dashboar.salesperson_dashboar.${method}`,
				args: { time_filter1, sales_person, from_date, to_date },
				callback: function (r) {
					const data = r.message?.data || [];
					originalData = data;
					let widgetTitle = widget_type.replace(/_/g, " ").toUpperCase();
					widgetTitle += (time_filter1 === "custom" && from_date && to_date)
						? ` : ${from_date} to ${to_date}`
						: ` : ${time_filter1.replace(/_/g, " ").toUpperCase()}`;
					// Clear both tables and headers before showing new data
					// $("#widget-data-table, #widget-data-table11").empty().closest("table").find("thead").empty();
					$("#widget-table-body").empty();
					$("#widget-table-head").empty();
					if (!data.length) {
						// $("#widget-data-table").html("<tr><td colspan='20' class='text-center'>No data found</td></tr>");
						$("#widget-table-body").html("<tr><td colspan='20' class='text-center'>No data found</td></tr>");
						$("#widget-title").text(widgetTitle);
						$("#widget-container, #widget-filters").show();
						tableVisible = true;
						lastClickedWidget = widget_type;
						resetDonutSelection();
						return;
					}
					applyTableFilters();
					$("#widget-title").text(widgetTitle);
					$("#widget-container, #widget-filters").show();
					tableVisible = true;
					lastClickedWidget = widget_type;
				}
			});
		});

		// Reset all when filter dropdowns change
		$("#sales-person-dropdown, #time-filter1").on("change", function () {
			lastClickedWidget = null;
			tableVisible = false;
			$("#widget-container, #widget-filters").hide();
			$("#widget-data-table").empty().closest("table").find("thead").empty();
			//$(".show-card-popup").removeClass("selected-widget");
			$(".show-card-popup, .show-card-popup11").removeClass("selected-widget");
			me.resetAllDropdowns1();
		});

		// Reapply filters if dropdown filters clicked
		$("#itemsList-item-group-filter1, #itemsList-brand-filter1, #itemsList-sales-stage1, #itemsList-opportunity-type1")
			.on("click", function () {
				if (tableVisible) {
					applyTableFilters();
				}
			});
	}

	setup_widget_click_events11() {
		//console.log("Setting up widget click events...");
		const me = this;
		let lastClickedWidget = null;
		let tableVisible = false;
		let originalData = [];
		let previousDonutBrand = null;
		let previousDonutItemGroup = null;
		console.log("show-card-popup11:", previousDonutBrand, previousDonutItemGroup);
		// Get selected values from multiselect dropdowns
		function getSelectedValues(selector) {
			return Array.from(document.querySelectorAll(`${selector} .item.checked`))
				.map(item => item.querySelector('.item-text')?.innerText.trim() || "");
		}
		// Filter and render the table
		function applyTableFilters() {
			const selectedGroups = getSelectedValues("#itemsList-item-group-filter1");
			const selectedBrands = getSelectedValues("#itemsList-brand-filter1");
			const selectedStages = getSelectedValues("#itemsList-sales-stage1");
			const selectedOppTypes = getSelectedValues("#itemsList-opportunity-type1");
			// const tbody = $("#widget-data-table11");
			// const thead = $("#widget-data-table11").closest("table").find("thead");
			const tbody = $("#widget-table-body");
			const thead = $("#widget-table-head");
			tbody.empty();
			let filtered = originalData;
			// Apply filters
			if (selectedGroups.length) {
				filtered = filtered.filter(row =>
					selectedGroups.some(group =>
						group.toLowerCase().trim() === String(row.item_group || "").toLowerCase().trim()
					)
				);
			}
			if (selectedBrands.length) {
				filtered = filtered.filter(row =>
					selectedBrands.some(brand =>
						brand.toLowerCase().trim() === String(row.brand || "").toLowerCase().trim()
					)
				);
			}
			if (selectedStages.length) {
				filtered = filtered.filter(row =>
					selectedStages.some(stage =>
						stage.toLowerCase().trim() === String(row.sales_stage || "").toLowerCase().trim()
					)
				);
			}
			if (selectedOppTypes.length) {
				filtered = filtered.filter(row =>
					selectedOppTypes.some(type =>
						type.toLowerCase().trim() === String(row.opportunity_type || "").toLowerCase().trim()
					)
				);
			}

			// No data case
			if (filtered.length === 0) {
				tbody.html("<tr><td colspan='20' class='text-center'>No data found</td></tr>");
				return;
			}

			// Render table headers
			const keys = Object.keys(filtered[0]).filter(k => k !== "item_row");
			const headers = ["S.No", ...keys];
			let headerRow = "<tr>";
			headers.forEach(h => {
				let label = (h === "name") ? "Opportunity Id" : h.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
				const thStyle = (h === "name" || h === "item_code") ? 'style="min-width:150px; max-width:150px;"' : "";
				headerRow += `<th class="text-ellipsis" title="${label}" ${thStyle}>${label}</th>`;
			});
			headerRow += "</tr>";
			thead.html(headerRow);

			// Render table rows
			filtered.forEach((row, index) => {
				let rowHtml = `<tr><td>${index + 1}</td>`;
				keys.forEach(key => {
					let val = row[key];
					let displayVal = (val === null || val === undefined || val === "") ? "-" : val;
					if (typeof val === "number" && key !== "qty") {
						displayVal = "₹ " + val.toLocaleString("en-IN");
					}
					if (key === "name" && val) {
						displayVal = `<a href="/app/opportunity/${val}" target="_blank">${val}</a>`;
					}
					const tdStyle = (key === "name" || key === "item_code") ? 'style="min-width:150px; max-width:150px;"' : "";
					rowHtml += `<td class="text-ellipsis" title="${val}" ${tdStyle}>${displayVal}</td>`;
				});
				rowHtml += "</tr>";
				tbody.append(rowHtml);
			});
		}

		// Throttle double trigger from donut click
		let donutClickLock = false;
		$(".show-card-popup11").off("click").on("click", function () {
			if (donutClickLock) return;
			donutClickLock = true;
			setTimeout(() => donutClickLock = false, 250); // debounce
			//resetDonutSelection(); 
			const $this = $(this);
			const method = $this.data("method");
			const widget_type = $this.data("type");
			const sales_person = $("#sales-person-dropdown").val() || "";
			const time_filter1 = $("#time-filter1").val();
			const from_date = $("#from-date1").val();
			const to_date = $("#to-date1").val();
			if (!method) return;
			const clickedBrand = window.selectedBrandFromDonut || null;
			const clickedItemGroup = window.selectedItemGroupFromDonut || null;
			//console.log("click slices:", clickedBrand, clickedItemGroup);
			if (!clickedBrand && !clickedItemGroup) {
				console.log("Card click ignored no donut filters set.");
				return;
			}

			const isSameBrand = (clickedBrand || "").toLowerCase() === (previousDonutBrand || "").toLowerCase();
			const isSameItemGroup = (clickedItemGroup || "").toLowerCase() === (previousDonutItemGroup || "").toLowerCase();
			const sameDonutFilters = isSameBrand && isSameItemGroup;
			// Toggle logic
			//if (lastClickedWidget === widget_type && tableVisible && sameDonutFilters) {
			if (sameDonutFilters && lastClickedWidget === widget_type && tableVisible) {
				console.log("Same donut filters + card clicked again. Hiding table.");
				$("#widget-container, #widget-filters").hide();
				$("#widget-data-table11,#widget-data-table").empty().closest("table").find("thead").empty();
				$("#widget-title").text("Data");
				$(".show-card-popup11,.show-card-popup").removeClass("selected-widget");
				tableVisible = false;
				lastClickedWidget = null;
				previousDonutBrand = null;
				previousDonutItemGroup = null;
				window.selectedBrandFromDonut = null;
				window.selectedItemGroupFromDonut = null;
				// VISUAL DEHIGHLIGHT DONUT SLICES SAFELY
				if (clickedBrand) {
					previousDonutBrand = null;
					window.selectedBrandFromDonut = null;
					safelyResetChart(window.brandDonutChartlw, "brand_donut_chart_lw", "brandDonutChartlw");
				}
				if (clickedItemGroup) {
					previousDonutItemGroup = null;
					window.selectedItemGroupFromDonut = null;
					safelyResetChart(window.itemGroupDonutChartlw, "item_group_donut_chart_lw", "itemGroupDonutChartlw");
				}

				// Clear UI
				$(".custom-dropdown-wrapper .item").removeClass("checked");
				$(".custom-dropdown-wrapper .btn-text").each(function () {
					const defaultLabel = $(this).closest(".select-btn").attr("data-label"); // keep original label
					if (defaultLabel) {
						$(this).text(defaultLabel); // set only the label, no "Select"
					}
				});
				me.resetAllDropdowns1();
				//$(".custom-dropdown-wrapper .btn-text").text("Select");
				return;
			}

			// Reset UI
			$(".custom-dropdown-wrapper .item").removeClass("checked");
			$(".custom-dropdown-wrapper .btn-text").each(function () {
				const defaultLabel = $(this).closest(".select-btn").attr("data-label") || $(this).text().trim();
				$(this).text(defaultLabel);  // <-- corrected line
			});
			me.resetAllDropdowns1();

			$(".show-card-popup11,.show-card-popup").removeClass("selected-widget");
			//$this.addClass("selected-widget");
			// Frappe call
			frappe.call({
				method: `renewal_module.custom_module.page.salesperson_dashboar.salesperson_dashboar.${method}`,
				args: { time_filter1, sales_person, from_date, to_date },
				callback: function (r) {
					const data = r.message?.data || [];
					originalData = data;

					let widgetTitle = widget_type.replace(/_/g, " ").toUpperCase();
					widgetTitle += (time_filter1 === "custom" && from_date && to_date)
						? ` : ${from_date} to ${to_date}`
						: ` : ${time_filter1.replace(/_/g, " ").toUpperCase()}`;

					// Update brand filter UI
					if (clickedBrand) {
						$("#itemsList-brand-filter1 .item").removeClass("checked");
						$(`#itemsList-brand-filter1 .item:contains("${clickedBrand}")`).each(function () {
							if ($(this).text().trim() === clickedBrand.trim()) {
								$(this).addClass("checked");
							}
						});
						$("#itemsList-brand-filter1 .btn-text").text(clickedBrand);
					}

					// Update item group filter UI
					if (clickedItemGroup) {
						$("#itemsList-item-group-filter1 .item").removeClass("checked");
						$(`#itemsList-item-group-filter1 .item:contains("${clickedItemGroup}")`).each(function () {
							if ($(this).text().trim() === clickedItemGroup.trim()) {
								$(this).addClass("checked");
							}
						});
						$("#itemsList-item-group-filter1 .btn-text").text(clickedItemGroup);
					}
					$("#widget-data-table, #widget-data-table11").empty().closest("table").find("thead").empty();
					if (!data.length) {
						// $("#widget-data-table11").html("<tr><td colspan='20' class='text-center'>No data found</td></tr>");
						$("#widget-table-body").html("<tr><td colspan='20' class='text-center'>No data found</td></tr>");

						$("#widget-title").text(widgetTitle);
						$("#widget-container, #widget-filters").show();
						tableVisible = true;
						lastClickedWidget = widget_type;
						previousDonutBrand = clickedBrand;
						previousDonutItemGroup = clickedItemGroup;
						window.selectedBrandFromDonut = null;
						window.selectedItemGroupFromDonut = null;
						return;
					}

					applyTableFilters();
					$("#widget-title").text(widgetTitle);
					$("#widget-container, #widget-filters").show();
					tableVisible = true;
					lastClickedWidget = widget_type;
					previousDonutBrand = clickedBrand;
					previousDonutItemGroup = clickedItemGroup;
					window.selectedBrandFromDonut = null;
					window.selectedItemGroupFromDonut = null;
				}
			});
		});

		function safelyResetChart(chartInstance, chartElementId, globalChartVarName) {
			const chartElement = document.getElementById(chartElementId);
			if (!chartElement || !chartInstance || typeof chartInstance.destroy !== "function") return;

			try {
				const existingOptions = chartInstance.w.config;
				chartInstance.destroy();
				window[globalChartVarName] = new ApexCharts(chartElement, existingOptions);
				window[globalChartVarName].render();
			} catch (e) {
				console.error(`Error resetting chart ${chartElementId}:`, e);
			}
		}


		// Reset all when filter dropdowns change
		$("#sales-person-dropdown, #time-filter1").on("change", function () {
			lastClickedWidget = null;
			tableVisible = false;
			previousDonutBrand = null;
			previousDonutItemGroup = null;
			window.selectedBrandFromDonut = null;
			window.selectedItemGroupFromDonut = null;

			$("#widget-container, #widget-filters").hide();
			$("#widget-data-table11").empty().closest("table").find("thead").empty();
			$(".show-card-popup11").removeClass("selected-widget");
			me.resetAllDropdowns1();
			//$(".show-card-popup, .show-card-popup11").removeClass("selected-widget");
		});

		// Reapply filters if dropdown filters clicked
		$("#itemsList-item-group-filter1, #itemsList-brand-filter1, #itemsList-sales-stage1, #itemsList-opportunity-type1")
			.on("click", function () {
				if (tableVisible) {
					applyTableFilters();
				}
			});
	}

	multiselectDropdown1() {
		const me = this;
		function setupCustomDropdown({ doctype, targetId, labelField = "name", options = [], onSelectionChange = null }) {
			const selectBtn = document.getElementById(targetId);
			const btnText = selectBtn?.querySelector(".btn-text");
			const itemList = document.getElementById(`itemsList-${targetId}`);
			const searchBox = document.querySelector(`.search-input[data-target="${targetId}"]`);
			let selectedItems = new Set();

			if (!selectBtn || !btnText || !itemList || !searchBox) return;

			// ✅ Set default label from HTML data-label on load
			const defaultLabel = selectBtn.getAttribute("data-label") || btnText.textContent.trim();
			btnText.dataset.defaultLabel = defaultLabel;
			btnText.textContent = defaultLabel;

			selectBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				document.querySelectorAll(".select-btn").forEach(btn => {
					if (btn !== selectBtn) btn.classList.remove("open");
				});
				selectBtn.classList.toggle("open");
			});

			document.addEventListener("click", (e) => {
				if (!selectBtn.closest(".custom-dropdown-wrapper").contains(e.target)) {
					selectBtn.classList.remove("open");
				}
			});

			searchBox.addEventListener("keyup", function () {
				const searchTerm = this.value.toLowerCase();
				itemList.querySelectorAll(".item").forEach(item => {
					const text = item.innerText.toLowerCase();
					item.style.display = text.includes(searchTerm) ? "flex" : "none";
				});
			});

			function renderItems(list) {
				itemList.innerHTML = "";
				list.forEach(item => {
					const value = item?.[labelField] || item?.name || (typeof item === "string" ? item : "") || "";
					const li = document.createElement("li");
					li.className = "item";
					li.setAttribute("data-value", value);
					li.setAttribute("title", value);
					li.innerHTML = `<span class="item-text">${value}</span>`;
					itemList.appendChild(li);
				});
				bindItemEvents();
				me.dropdownRegistry1[targetId] = {
					selectedItems,
					btnText,
					selectBtn,
					itemList
				};
			}

			function bindItemEvents() {
				// Remove old handlers to avoid duplication
				itemList.querySelectorAll(".item").forEach(item => {
					const newItem = item.cloneNode(true);  // clone removes all old event listeners
					item.replaceWith(newItem);
				});

				// Now re-select fresh items
				itemList.querySelectorAll(".item").forEach(item => {
					item.addEventListener("click", function () {
						const value = this.getAttribute("data-value");
						// Toggle selection
						if (selectedItems.has(value)) {
							selectedItems.delete(value);
							this.classList.remove("checked");
						} else {
							selectedItems.add(value);
							this.classList.add("checked");
						}
						const selectedArray = Array.from(selectedItems);
						// UI update
						btnText.textContent =
							selectedArray.length > 0
								? `${selectedArray.length} selected`
								: btnText.dataset.defaultLabel;

						if (typeof onSelectionChange === "function") {
							onSelectionChange(selectedArray);
						}
					});
				});
			}

			if (options.length) {
				renderItems(options);
			} else {
				frappe.call({
					method: "frappe.client.get_list",
					args: {
						doctype,
						fields: [labelField],
						order_by: labelField + " asc",
						limit_page_length: 999
					},
					callback: function (r) {
						if (r.message) renderItems(r.message);
					}
				});
			}
		}

		// Opportunity Type
		frappe.model.with_doctype("Opportunity Item", () => {
			const opts = frappe.meta.get_docfield("Opportunity Item", "opportunity_type", null)?.options;
			const oppTypes = opts ? opts.split('\n').filter(x => x.trim()).map(opt => ({ name: opt.trim() })) : [];
			setupCustomDropdown({ doctype: "Opportunity Type", targetId: "opportunity-type1", options: oppTypes });
		});
		// Sales Stage
		setupCustomDropdown({ doctype: "Sales Stage", targetId: "sales-stage1" });
		// Brand (initially empty, dynamically populated via Item Group)
		setupCustomDropdown({ doctype: "Brand", targetId: "brand-filter1", options: [] });

		// Item Group with Brand dependency
		setupCustomDropdown({
			doctype: "Item Group",
			targetId: "item-group-filter1",
			onSelectionChange: function (selectedGroups) {
				const brandList = document.getElementById("itemsList-brand-filter1");
				const brandBtnText = document.querySelector("#brand-filter1 .btn-text");

				// Reset brand UI
				brandList.innerHTML = '';
				brandBtnText.textContent = "Brand";

				const updateBrandList = (brands) => {
					const uniqueBrands = [...new Set(brands.filter(Boolean))];
					uniqueBrands.sort().forEach(brand => {
						const li = document.createElement("li");
						li.className = "item";
						li.setAttribute("data-value", brand);
						li.setAttribute("title", brand);
						li.innerHTML = `<span class="item-text">${brand}</span>`;
						brandList.appendChild(li);
					});

					// Rebind click event for brand items
					brandList.querySelectorAll(".item").forEach(item => {
						item.addEventListener("click", function () {
							this.classList.toggle("checked");

							const checkedItems = brandList.querySelectorAll(".item.checked");
							const labels = Array.from(checkedItems).map(i => i.innerText.trim()).join(", ");
							brandBtnText.textContent = labels.length > 15 ? labels.substring(0, 15) + "..." : (labels || "Brand");
						});
					});
				};

				if (!selectedGroups.length) {
					// No filter: show all brands
					frappe.call({
						method: "frappe.client.get_list",
						args: {
							doctype: "Item",
							fields: ["brand"],
							limit_page_length: 999
						},
						callback: (res) => {
							const items = res.message || [];
							const brands = items.map(i => i.brand);
							updateBrandList(brands);
						}
					});
				} else {
					// Filter by selected groups
					frappe.call({
						method: "frappe.client.get_list",
						args: {
							doctype: "Item",
							fields: ["brand", "item_group"],
							filters: [["item_group", "in", selectedGroups]],
							limit_page_length: 999
						},
						callback: (res) => {
							const items = res.message || [];
							const brands = items.map(i => i.brand);
							updateBrandList(brands);
						}
					});
				}
			}
		});
	}

	resetAllDropdowns1() {
		for (const key in this.dropdownRegistry1) {
			const d = this.dropdownRegistry1[key];
			// FULL RESET
			d.selectedItems.clear();
			d.itemList.querySelectorAll(".item").forEach(i => i.classList.remove("checked"));
			const defaultLabel = d.btnText.dataset.defaultLabel || "Select";
			d.btnText.textContent = defaultLabel;
			d.selectBtn.classList.remove("open");
		}
	}

	//renewal list 

	get_rnwls_new_opp_count(sales_person = "", time_filter2 = "this week", from_date = "", to_date = "") {
		//console.log("count sales person:", sales_person, time_filter2);
		$("#rnwls-new-opp-count").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.salesperson_dashboar.rnwls_data.get_rnwls_new_opp_count",
			args: {
				sales_person: sales_person,
				time_filter2: time_filter2,
				from_date: from_date,
				to_date: to_date
			},
			callback: function (r) {
				if (r.message) {
					let count = r.message[0] || 0;
					$("#rnwls-new-opp-count").text(count).attr("title", count);
				}
			}
		});
	}

	get_rnwls_lost_count(sales_person = "", time_filter2 = "this week", from_date = "", to_date = "") {
		//console.log("count sales person:", sales_person)
		$("#rnwls-lost-count").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.salesperson_dashboar.rnwls_data.get_rnwls_lost_count",
			args: {
				sales_person: sales_person,
				time_filter2: time_filter2,
				from_date: from_date,
				to_date: to_date
			},
			callback: function (r) {
				if (r.message) {
					let count = r.message[0] || 0;
					$("#rnwls-lost-count").text(count).attr("title", count);
					//console.log("Lost count:", count);
					//console.log("Response data of lost count:", r.message[1]);
				}
			}
		});
	}

	get_rnwls_renewed_count(sales_person = "", time_filter2 = "this week", from_date = "", to_date = "") {
		//console.log("count sales person:", sales_person)
		$("#rnwls-renewed-count").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.salesperson_dashboar.rnwls_data.get_rnwls_renewed_count",
			args: {
				sales_person: sales_person,
				time_filter2: time_filter2,
				from_date: from_date,
				to_date: to_date
			},
			callback: function (r) {
				if (r.message) {
					let count = r.message[0] || 0;
					$("#rnwls-renewed-count").text(count).attr("title", count);
				}
			}
		});
	}

	setup_widget_click_events2() {
		const me = this;
		let lastClickedWidget2 = null;
		let tableVisible2 = false;
		let originalData2 = []; // store raw unfiltered data
		function getSelectedValues(selector) {
			const checkedItems = document.querySelectorAll(`${selector} .item.checked`);
			console.log(`Checked Items for ${selector}:`, checkedItems);
			return Array.from(checkedItems).map(item => item.querySelector('.item-text')?.innerText.trim() || "");

		}

		// Utility: Filter rows by brand & item group
		function applyTableFilters2() {
			const selectedGroups = getSelectedValues("#itemsList-item-group-filter2");
			const selectedBrands = getSelectedValues("#itemsList-brand-filter2");
			const tbody = $("#widget-data-table2");
			const thead = $("#widget-data-table2").closest("table").find("thead");
			tbody.empty();
			console.log("Selected Groups:", selectedGroups);
			console.log("Selected Brands:", selectedBrands);
			let filtered = originalData2;
			if (selectedGroups.length) {
				filtered = filtered.filter(row =>
					selectedGroups.some(group =>
						group.toLowerCase().trim() === String(row.item_group || "").toLowerCase().trim()
					)
				);
			}
			if (selectedBrands.length) {
				filtered = filtered.filter(row =>
					selectedBrands.some(brand =>
						brand.toLowerCase().trim() === String(row.brand || "").toLowerCase().trim()
					)
				);
			}

			if (filtered.length === 0) {
				tbody.html("<tr><td colspan='20' class='text-center'>No data found</td></tr>");
				thead.empty();
				return;
			}

			const headers = ["S.No", ...Object.keys(filtered[0])];
			let headerRow = "<tr>";
			headers.forEach(h => {
				let label = h;
				if (h === "name") label = "Renewal Id";
				else label = h.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
				const thStyle = (h === "name") ? 'style="min-width:150px; max-width:150px;"' : "";
				headerRow += `<th class="text-ellipsis" title="${label ?? ""}" ${thStyle}>${label ?? ""}</th>`;
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
					const tdStyle = (key === "name") ? 'style="min-width:150px; max-width:150px;"' : "";
					rowHtml += `<td class="text-ellipsis" title="${(typeof val === 'string' || typeof val === 'number') ? val : ''}" ${tdStyle}>${displayVal ?? ""}</td>`;
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
			const from_date = $("#from-date2").val();
			const to_date = $("#to-date2").val();

			if (!method) return;

			if (lastClickedWidget2 === widget_type2 && tableVisible2) {
				$("#widget-container2").hide();
				$("#widget-filters2").hide();
				$("#widget-data-table2").empty();
				$("#widget-data-table2").closest("table").find("thead").empty();
				$("#widget-title2").text("Data");
				$(".show-card-popup2").removeClass("selected-widget");
				me.resetAllDropdowns2();
				tableVisible2 = false;
				lastClickedWidget2 = null;
				return;
			}

			$(".custom-dropdown-wrapper .item").removeClass("checked");
			$(".custom-dropdown-wrapper .btn-text").each(function () {
				const defaultLabel = $(this).closest(".select-btn").attr("data-label"); // use stored label
				if (defaultLabel) {
					$(this).text(defaultLabel); // show only label
				}
			});
			me.resetAllDropdowns2();
			$(".show-card-popup2").removeClass("selected-widget");
			$this.addClass("selected-widget");

			frappe.call({
				method: `renewal_module.custom_module.page.salesperson_dashboar.rnwls_data.${method}`,
				args: {
					time_filter2,
					sales_person,
					from_date,
					to_date
				},
				callback: function (r) {
					const data = (r.message && Array.isArray(r.message)) ? r.message[1] || [] : [];
					originalData2 = data;
					let widgetTitle = widget_type2.replace(/_/g, " ").toUpperCase();
					if (time_filter2 === "custom" && from_date && to_date) {
						widgetTitle += ` : ${from_date} to ${to_date}`;
					} else {
						const timeFilterLabel = time_filter2.replace(/_/g, " ").toUpperCase();
						widgetTitle += ` : ${timeFilterLabel}`;
					}
					$("#widget-title2").text(widgetTitle);

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
			me.resetAllDropdowns2();
		});

		// Filter table when dropdowns change
		$("#itemsList-item-group-filter2, #itemsList-brand-filter2 ").on("click", function () {
			if (tableVisible2) {
				applyTableFilters2();
			}
		});
	}

	multiselectDropdown2() {
		const me = this;
		function setupCustomDropdown({ doctype, targetId, labelField = "name", options = [], onSelectionChange = null }) {
			const selectBtn = document.getElementById(targetId);
			const btnText = selectBtn?.querySelector(".btn-text");
			const itemList = document.getElementById(`itemsList-${targetId}`);
			const searchBox = document.querySelector(`.search-input[data-target="${targetId}"]`);
			let selectedItems = new Set();

			if (!selectBtn || !btnText || !itemList || !searchBox) return;

			//Set default label from HTML data-label on load
			const defaultLabel = selectBtn.getAttribute("data-label") || btnText.textContent.trim();
			btnText.dataset.defaultLabel = defaultLabel;
			btnText.textContent = defaultLabel;

			selectBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				document.querySelectorAll(".select-btn").forEach(btn => {
					if (btn !== selectBtn) btn.classList.remove("open");
				});
				selectBtn.classList.toggle("open");
			});

			document.addEventListener("click", (e) => {
				if (!selectBtn.closest(".custom-dropdown-wrapper").contains(e.target)) {
					selectBtn.classList.remove("open");
				}
			});

			searchBox.addEventListener("keyup", function () {
				const searchTerm = this.value.toLowerCase();
				itemList.querySelectorAll(".item").forEach(item => {
					const text = item.innerText.toLowerCase();
					item.style.display = text.includes(searchTerm) ? "flex" : "none";
				});
			});

			function renderItems(list) {
				itemList.innerHTML = "";
				selectedItems = new Set();   // Always fresh set for UI
				list.forEach(item => {
					const value = item?.[labelField] || item?.name || item;
					const li = document.createElement("li");
					li.className = "item";
					li.setAttribute("data-value", value);
					li.innerHTML = `<span class="item-text">${value}</span>`;
					itemList.appendChild(li);
				});
				bindItemEvents();
				// NOW registry points to the fresh Set
				me.dropdownRegistry2[targetId] = {
					selectedItems,  // <— the new set
					btnText,
					selectBtn,
					itemList
				};
				// console.log("🟩 registry updated inside renderItems:", targetId, selectedItems);
			}

			function bindItemEvents() {
				// Remove old handlers to avoid duplication
				itemList.querySelectorAll(".item").forEach(item => {
					const newItem = item.cloneNode(true);  // clone removes all old event listeners
					item.replaceWith(newItem);
				});

				// Now re-select fresh items
				itemList.querySelectorAll(".item").forEach(item => {
					item.addEventListener("click", function () {
						const value = this.getAttribute("data-value");
						// Toggle selection
						if (selectedItems.has(value)) {
							selectedItems.delete(value);
							this.classList.remove("checked");
						} else {
							selectedItems.add(value);
							this.classList.add("checked");
						}
						// console.log("Clicked item:", value);
						// console.log("selectedItems:", selectedItems);
						// console.log("🟩 CLICK → selectedItems object:", selectedItems);
						// console.log("🟩 CLICK → selectedItems size:", selectedItems.size);
						// console.log("🟩 CLICK → Registry version:", me.dropdownRegistry2[targetId].selectedItems);
						// console.log("🟩 CLICK → SAME OBJECT?", selectedItems === me.dropdownRegistry2[targetId].selectedItems);
						const selectedArray = Array.from(selectedItems);
						// UI update
						btnText.textContent =
							selectedArray.length > 0
								? `${selectedArray.length} selected`
								: btnText.dataset.defaultLabel;

						if (typeof onSelectionChange === "function") {
							onSelectionChange(selectedArray);
						}
					});
				});
			}

			if (options.length) {
				renderItems(options);
			} else {
				frappe.call({
					method: "frappe.client.get_list",
					args: {
						doctype,
						fields: [labelField],
						order_by: labelField + " asc",
						limit_page_length: 999
					},
					callback: function (r) {
						if (r.message) renderItems(r.message);
					}
				});
			}
			// console.log("REGISTERING DROPDOWN:", targetId);
			// console.log("Initial selectedItems size:", selectedItems.size);
			// console.log("🟦 DROPDOWN INIT:", targetId);
			// console.log("🟦 selectedItems object:", selectedItems);
			// console.log("🟦 selectedItems size:", selectedItems.size);
			// console.log("🟦 Registry BEFORE set:", me.dropdownRegistry2);
		}

		// Brand (initially empty, dynamically populated via Item Group)
		setupCustomDropdown({ doctype: "Brand", targetId: "brand-filter2", options: [] });

		// Item Group with Brand dependency
		setupCustomDropdown({
			doctype: "Item Group",
			targetId: "item-group-filter2",
			onSelectionChange: function (selectedGroups) {
				const brandList = document.getElementById("itemsList-brand-filter2");
				const brandBtnText = document.querySelector("#brand-filter2 .btn-text");
				// Reset brand UI
				brandList.innerHTML = '';
				brandBtnText.textContent = "Brand";

				const updateBrandList = (brands) => {
					const uniqueBrands = [...new Set(brands.filter(Boolean))];
					uniqueBrands.sort().forEach(brand => {
						const li = document.createElement("li");
						li.className = "item";
						li.setAttribute("title", brand);
						li.setAttribute("data-value", brand);
						li.innerHTML = `<span class="item-text">${brand}</span>`;
						brandList.appendChild(li);
					});

					// Rebind click event for brand items
					brandList.querySelectorAll(".item").forEach(item => {
						item.addEventListener("click", function () {
							this.classList.toggle("checked");

							const checkedItems = brandList.querySelectorAll(".item.checked");
							const labels = Array.from(checkedItems).map(i => i.innerText.trim()).join(", ");
							brandBtnText.textContent = labels.length > 15 ? labels.substring(0, 15) + "..." : (labels || "Brand");
						});
					});
				};

				if (!selectedGroups.length) {
					// No filter: show all brands
					frappe.call({
						method: "frappe.client.get_list",
						args: {
							doctype: "Item",
							fields: ["brand"],
							limit_page_length: 999
						},
						callback: (res) => {
							const items = res.message || [];
							const brands = items.map(i => i.brand);
							updateBrandList(brands);
						}
					});
				} else {
					// Filter by selected groups
					frappe.call({
						method: "frappe.client.get_list",
						args: {
							doctype: "Item",
							fields: ["brand", "item_group"],
							filters: [["item_group", "in", selectedGroups]],
							limit_page_length: 999
						},
						callback: (res) => {
							const items = res.message || [];
							const brands = items.map(i => i.brand);
							updateBrandList(brands);
						}
					});
				}
			}
		});
	}

	resetAllDropdowns2() {
		//console.log("RESETTING ALL DROPDOWNS", this.dropdownRegistry2);
		for (const key in this.dropdownRegistry2) {
			const d = this.dropdownRegistry2[key];
			// console.log(` RESET ${key}:`);
			// console.log("selectedItems object:", d.selectedItems);
			// console.log("size BEFORE:", d.selectedItems.size);
			// FULL RESET
			d.selectedItems.clear();
			d.itemList.querySelectorAll(".item").forEach(i => i.classList.remove("checked"));
			const defaultLabel = d.btnText.dataset.defaultLabel || "Select";
			d.btnText.textContent = defaultLabel;
			d.selectBtn.classList.remove("open");
			//console.log(`RESET ${key} → AFTER`, d.selectedItems.size);
		}
	}






	loadRnwlsLineGraph(sales_person = "", time_filter2 = "this week", from_date = "", to_date = "") {
		//console.log("loadRnwlsLineGraph:", sales_person, time_filter2);

		const counts = {
			new_opp: 0,
			lost: 0,
			renewed: 0
		};

		Promise.all([
			new Promise(resolve => {
				frappe.call({
					method: "renewal_module.custom_module.page.salesperson_dashboar.rnwls_data.get_rnwls_new_opp_count",
					args: { sales_person, time_filter2, from_date, to_date },
					callback: function (r) {
						counts.new_opp = r.message ? r.message[0] : 0;
						resolve();
					}
				});
			}),
			new Promise(resolve => {
				frappe.call({
					method: "renewal_module.custom_module.page.salesperson_dashboar.rnwls_data.get_rnwls_lost_count",
					args: { sales_person, time_filter2, from_date, to_date },
					callback: function (r) {
						counts.lost = r.message ? r.message[0] : 0;
						resolve();
					}
				});
			}),
			new Promise(resolve => {
				frappe.call({
					method: "renewal_module.custom_module.page.salesperson_dashboar.rnwls_data.get_rnwls_renewed_count",
					args: { sales_person, time_filter2, from_date, to_date },
					callback: function (r) {
						counts.renewed = r.message ? r.message[0] : 0;
						resolve();
					}
				});
			})
		]).then(() => {
			const ctx = document.getElementById("rnwls-line-chart").getContext("2d");

			// ✅ Use `this.rnwlsLineChart` inside class context
			if (this.rnwlsLineChart) {
				this.rnwlsLineChart.destroy();
			}

			this.rnwlsLineChart = new Chart(ctx, {
				type: 'line',
				data: {
					labels: ["New Opp", "Renewed", "Lost"],
					datasets: [{
						label: "Renewal Status Count",
						data: [counts.new_opp, counts.renewed, counts.lost],
						borderColor: "#3e95cd",
						backgroundColor: "rgba(62,149,205,0.2)",
						fill: true,
						tension: 0.3
					}]
				},
				options: {
					responsive: true,
					maintainAspectRatio: false,
					scales: {
						y: {
							beginAtZero: true,
							title: { display: false, text: "Count" }
						},
						x: {
							title: { display: false, text: "Status" },
							ticks: {
								font: { size: 10 },
								autoSkip: true,
								maxRotation: 0,
								minRotation: 0
							}
						}
					},
					plugins: {
						legend: { display: false },
						tooltip: { enabled: true }
					}
				}
			});
		});
	}





	//target

	get_open_opportunity_amount(sales_person = null) {
		$("#open-opportunity-amount").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.salesperson_dashboar.salesperson_dashboar.get_open_opportunity_amount_tm",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					let formatted_price = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(r.message[0]);
					$("#open-opportunity-amount").text(formatted_price).attr("title", formatted_price);
				}
			}
		});
	}

	get_target_amount(sales_person = null) {
		//console.log("target function calling");
		$("#target-amount").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.salesperson_dashboar.salesperson_dashboar.get_target_amount",
			args: { sales_person: sales_person },
			callback: (r) => {
				//console.log("target amount:", r.message);
				if (r.message && r.message.bottomline_target !== undefined) {
					let formatted_price = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(r.message.bottomline_target);
					$("#target-amount").text(formatted_price).attr("title", formatted_price);
					this.get_variance_amount();
				}
			}
		});
	}


	get_achieved_amount_tm(sales_person = null) {
		$("#achieved-amount").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.salesperson_dashboar.salesperson_dashboar.get_achieved_amount_tm",
			args: { sales_person: sales_person },
			callback: (r) => {
				if (r.message) {
					let formatted_price = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(r.message[0]);
					$("#achieved-amount").text(formatted_price).attr("title", formatted_price);
					//console.log("achieved amount:", r.message);
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

	get_topline_target(sales_person = null) {
		$("#topline-target").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.salesperson_dashboar.salesperson_dashboar.get_topline_target",
			args: { sales_person: sales_person },
			callback: (r) => {
				if (r.message && r.message.topline_target !== undefined) {
					let formatted_price = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(r.message.topline_target);
					$("#topline-target").text(formatted_price).attr("title", formatted_price);
					this.get_topline_variance();
				}
			}
		});
	}

	get_topline_achieved(sales_person = null) {
		$("#topline-achieved").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.salesperson_dashboar.salesperson_dashboar.get_topline_achieved",
			args: { sales_person: sales_person },
			callback: (r) => {
				if (r.message && r.message.topline_achieved !== undefined) {
					let formatted_price = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(r.message.topline_achieved);
					$("#topline-achieved").text(formatted_price).attr("title", formatted_price);
					this.get_topline_variance();
				}
			}
		});
	}

	get_topline_variance() {
		const toplineTargetText = document.getElementById("topline-target").textContent
		const toplineAchievedText = document.getElementById("topline-achieved").textContent;
		// Remove currency symbols and commas, then convert to float
		const toplineTarget = parseFloat(toplineTargetText.replace(/[₹,]/g, "")) || 0;
		const toplineAchieved = parseFloat(toplineAchievedText.replace(/[₹,]/g, "")) || 0;
		const toplineVariance = toplineTarget - toplineAchieved;
		const formattedToplineVariance = new Intl.NumberFormat('en-IN', {
			style: 'currency',
			currency: 'INR'
		}).format(toplineVariance);
		document.getElementById("topline-variance").textContent = formattedToplineVariance;
		document.getElementById("topline-variance").setAttribute("title", formattedToplineVariance);
	}

	get_bottomline_target(sales_person = null) {
		$("#bottomline-target").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.salesperson_dashboar.salesperson_dashboar.get_bottomline_target",
			args: { sales_person: sales_person },
			callback: (r) => {
				if (r.message && r.message.bottomline_target !== undefined) {
					let formatted_price = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(r.message.bottomline_target);
					$("#bottomline-target").text(formatted_price).attr("title", formatted_price);
					this.get_bottomline_variance();
				}
			}
		});
	}

	get_bottomline_achieved(sales_person = null) {
		$("#bottomline-achieved").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.salesperson_dashboar.salesperson_dashboar.get_bottomline_achieved",
			args: { sales_person: sales_person },
			callback: (r) => {
				if (r.message && r.message.bottomline_achieved !== undefined) {
					let formatted_price = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(r.message.bottomline_achieved);
					$("#bottomline-achieved").text(formatted_price).attr("title", formatted_price);
					this.get_bottomline_variance();
				}
			}
		});
	}

	get_bottomline_variance() {
		const bottomlineTargetText = document.getElementById("bottomline-target").textContent;
		const bottomlineAchievedText = document.getElementById("bottomline-achieved").textContent;
		// Remove currency symbols and commas, then convert to float
		const bottomlineTarget = parseFloat(bottomlineTargetText.replace(/[₹,]/g, "")) || 0;
		const bottomlineAchieved = parseFloat(bottomlineAchievedText.replace(/[₹,]/g, "")) || 0;
		const bottomlineVariance = bottomlineTarget - bottomlineAchieved;
		const formattedBottomlineVariance = new Intl.NumberFormat('en-IN', {
			style: 'currency',
			currency: 'INR'
		}).format(bottomlineVariance);
		document.getElementById("bottomline-variance").textContent = formattedBottomlineVariance;
		document.getElementById("bottomline-variance").setAttribute("title", formattedBottomlineVariance);
	}


	get_renewal_amount(sales_person = null) {
		$("#renewal-amount").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.salesperson_dashboar.salesperson_dashboar.get_renewal_amount",
			args: {
				sales_person: sales_person,
			},
			callback: function (r) {
				if (r.message) {
					let amount = r.message.amount || 0;
					let formatted_amount = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);
					$("#renewal-amount").text(formatted_amount).attr("title", formatted_amount);
					//console.log("Renewal amount:", amount);
				}
			}
		});
	}


	get_new_amount(sales_person = null) {
		$("#new-amount").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.salesperson_dashboar.salesperson_dashboar.get_new_amount",
			args: {
				sales_person: sales_person,
			},
			callback: function (r) {
				if (r.message) {
					let amount = r.message.amount || 0;
					let formatted_amount = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);
					$("#new-amount").text(formatted_amount).attr("title", formatted_amount);
					//console.log("New amount:", amount);
				}
			}
		});
	}

	get_renewal_amount_tt(sales_person = null) {
		$("#renewal-amount-tt").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.salesperson_dashboar.salesperson_dashboar.get_renewal_amount_tt",
			args: {
				sales_person: sales_person,
			},
			callback: function (r) {
				if (r.message) {
					let amount = r.message.amount || 0;
					let formatted_amount = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);
					$("#renewal-amount-tt").text(formatted_amount).attr("title", formatted_amount);
					//console.log("Renewal amount:", amount);
				}
			}
		});
	}


	get_new_amount_tt(sales_person = null) {
		$("#new-amount-tt").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.salesperson_dashboar.salesperson_dashboar.get_new_amount_tt",
			args: {
				sales_person: sales_person,
			},
			callback: function (r) {
				if (r.message) {
					let amount = r.message.amount || 0;
					let formatted_amount = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);
					$("#new-amount-tt").text(formatted_amount).attr("title", formatted_amount);
					//console.log("New amount:", amount);
				}
			}
		});
	}

	setup_widget_click_events5() {
		const me = this;
		let lastClickedWidget5 = null;
		let tableVisible5 = false;
		let originalData5 = [];

		function getSelectedValues(selector) {
			const checkedItems = document.querySelectorAll(`${selector} .item.checked`);
			//console.log(`Checked Items for ${selector}:`, checkedItems);
			return Array.from(checkedItems).map(item => item.querySelector('.item-text')?.innerText.trim() || "");

		}

		function applyTableFilters5() {
			const selectedGroups = getSelectedValues("#itemsList-item-group-filter5");
			const selectedBrands = getSelectedValues("#itemsList-brand-filter5");
			const selectedStages = getSelectedValues("#itemsList-sales-stage5");
			const selectedOppTypes = getSelectedValues("#itemsList-opportunity-type5");

			const tbody = $("#widget-data-table5");
			const thead = $("#widget-data-table5").closest("table").find("thead");
			tbody.empty();
			let filtered = originalData5;

			if (selectedGroups.length) {
				filtered = filtered.filter(row =>
					selectedGroups.some(group =>
						group.toLowerCase().trim() === String(row.item_group || "").toLowerCase().trim()
					)
				);
			}
			if (selectedBrands.length) {
				filtered = filtered.filter(row =>
					selectedBrands.some(brand =>
						brand.toLowerCase().trim() === String(row.brand || "").toLowerCase().trim()
					)
				);
			}
			if (selectedStages.length) {
				filtered = filtered.filter(row =>
					selectedStages.some(stage =>
						stage.toLowerCase().trim() === String(row.sales_stage || "").toLowerCase().trim()
					)
				);
			}
			if (selectedOppTypes.length) {
				filtered = filtered.filter(row =>
					selectedOppTypes.some(type =>
						type.toLowerCase().trim() === String(row.opportunity_type || "").toLowerCase().trim()
					)
				);
			}

			if (filtered.length === 0) {
				tbody.html("<tr><td colspan='20' class='text-center'>No data found</td></tr>");
				thead.empty();
				return;
			}

			const keys = Object.keys(filtered[0]).filter(k => k !== "item_row");
			const headers = ["S.No", ...keys];
			let headerRow = "<tr>";
			headers.forEach(h => {
				let label = h === "name" ? "Opportunity Id" : h.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
				const thStyle = (h === "name" || h === "item_code") ? 'style="min-width:150px; max-width:150px;"' : "";
				headerRow += `<th class="text-ellipsis" title="${label}" ${thStyle}>${label}</th>`;
			});
			headerRow += "</tr>";
			thead.html(headerRow);

			filtered.forEach((row, index) => {
				let rowHtml = `<tr><td>${index + 1}</td>`;
				keys.forEach(key => {
					let val = row[key];
					let displayVal = val;

					if (val === null || val === undefined || val === "") {
						displayVal = typeof val === "number" ? 0 : "-";
					}
					if (typeof val === "number" && key !== "qty") {
						displayVal = "₹ " + val.toLocaleString("en-IN");
					}
					if (key === "name" && val) {
						const url = `/app/opportunity/${val}`;
						displayVal = `<a href="${url}" target="_blank">${val}</a>`;
					}
					const tdStyle = (key === "name" || key === "item_code") ? 'style="min-width:150px; max-width:150px;"' : "";
					rowHtml += `<td class="text-ellipsis" title="${(typeof val === 'string' || typeof val === 'number') ? val : ''}" ${tdStyle}>${displayVal}</td>`;
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
			if (!method) return;

			if (lastClickedWidget5 === widget_type5 && tableVisible5) {
				$("#widget-container5").hide();
				$("#widget-filters5").hide();
				$("#widget-data-table5").empty();
				$("#widget-data-table5").closest("table").find("thead").empty();
				$("#widget-title5").text("Data");
				$(".show-card-popup5").removeClass("selected-widget");
				me.resetAllDropdowns5();
				tableVisible5 = false;
				lastClickedWidget5 = null;
				return;
			}

			$(".custom-dropdown-wrapper .item").removeClass("checked");
			$(".custom-dropdown-wrapper .btn-text").each(function () {
				const defaultLabel = $(this).closest(".select-btn").attr("data-label"); // use stored label
				if (defaultLabel) {
					$(this).text(defaultLabel); // show only label
				}
			});
			me.resetAllDropdowns5();
			$(".show-card-popup5").removeClass("selected-widget");
			$this.addClass("selected-widget");

			frappe.call({
				method: `renewal_module.custom_module.page.salesperson_dashboar.salesperson_dashboar.${method}`,
				args: { sales_person },
				callback: function (r) {
					//const data = (r.message && Array.isArray(r.message)) ? r.message[1] || [] : [];
					const data = r.message.data || [];
					originalData5 = data;
					const widgetTitle = widget_type5.replace(/_/g, " ").toUpperCase();
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

		$("#sales-person-dropdown").on("change", function () {
			lastClickedWidget5 = null;
			tableVisible5 = false;
			$("#widget-container5").hide();
			$("#widget-filters5").hide();
			$("#widget-data-table5").empty();
			$("#widget-data-table5").closest("table").find("thead").empty();
			$(".show-card-popup5").removeClass("selected-widget");
			me.resetAllDropdowns5();
		});

		// Filter table when dropdowns change
		$("#itemsList-item-group-filter5, #itemsList-brand-filter5, #itemsList-sales-stage5, #itemsList-opportunity-type5").on("click", function () {
			if (tableVisible5) {
				applyTableFilters5();
			}
		});
	}

	multiselectDropdown5() {
		const me = this;
		function setupCustomDropdown({ doctype, targetId, labelField = "name", options = [], onSelectionChange = null }) {
			const selectBtn = document.getElementById(targetId);
			const btnText = selectBtn?.querySelector(".btn-text");
			const itemList = document.getElementById(`itemsList-${targetId}`);
			const searchBox = document.querySelector(`.search-input[data-target="${targetId}"]`);
			let selectedItems = new Set();

			if (!selectBtn || !btnText || !itemList || !searchBox) return;

			// ✅ Set default label from HTML data-label on load
			const defaultLabel = selectBtn.getAttribute("data-label") || btnText.textContent.trim();
			btnText.dataset.defaultLabel = defaultLabel;
			btnText.textContent = defaultLabel;

			selectBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				document.querySelectorAll(".select-btn").forEach(btn => {
					if (btn !== selectBtn) btn.classList.remove("open");
				});
				selectBtn.classList.toggle("open");
			});

			document.addEventListener("click", (e) => {
				if (!selectBtn.closest(".custom-dropdown-wrapper").contains(e.target)) {
					selectBtn.classList.remove("open");
				}
			});

			searchBox.addEventListener("keyup", function () {
				const searchTerm = this.value.toLowerCase();
				itemList.querySelectorAll(".item").forEach(item => {
					const text = item.innerText.toLowerCase();
					item.style.display = text.includes(searchTerm) ? "flex" : "none";
				});
			});

			function renderItems(list) {
				itemList.innerHTML = "";
				selectedItems = new Set();
				list.forEach(item => {
					const value = item?.[labelField] || item?.name || (typeof item === "string" ? item : "") || "";
					const li = document.createElement("li");
					li.className = "item";
					li.setAttribute("data-value", value);
					li.setAttribute("title", value);
					li.innerHTML = `<span class="item-text">${value}</span>`;
					itemList.appendChild(li);
				});
				bindItemEvents();
				me.dropdownRegistry5[targetId] = {
					selectedItems,
					btnText,
					selectBtn,
					itemList
				};
			}

			function bindItemEvents() {
				// Remove old handlers to avoid duplication
				itemList.querySelectorAll(".item").forEach(item => {
					const newItem = item.cloneNode(true);  // clone removes all old event listeners
					item.replaceWith(newItem);
				});

				// Now re-select fresh items
				itemList.querySelectorAll(".item").forEach(item => {
					item.addEventListener("click", function () {
						const value = this.getAttribute("data-value");
						// Toggle selection
						if (selectedItems.has(value)) {
							selectedItems.delete(value);
							this.classList.remove("checked");
						} else {
							selectedItems.add(value);
							this.classList.add("checked");
						}
						const selectedArray = Array.from(selectedItems);
						// UI update
						btnText.textContent =
							selectedArray.length > 0
								? `${selectedArray.length} selected`
								: btnText.dataset.defaultLabel;

						if (typeof onSelectionChange === "function") {
							onSelectionChange(selectedArray);
						}
					});
				});
			}

			if (options.length) {
				renderItems(options);
			} else {
				frappe.call({
					method: "frappe.client.get_list",
					args: {
						doctype,
						fields: [labelField],
						order_by: labelField + " asc",
						limit_page_length: 999
					},
					callback: function (r) {
						if (r.message) renderItems(r.message);
					}
				});
			}
		}

		// Opportunity Type
		frappe.model.with_doctype("Opportunity Item", () => {
			const opts = frappe.meta.get_docfield("Opportunity Item", "opportunity_type", null)?.options;
			const oppTypes = opts ? opts.split('\n').filter(x => x.trim()).map(opt => ({ name: opt.trim() })) : [];
			setupCustomDropdown({ doctype: "Opportunity Type", targetId: "opportunity-type5", options: oppTypes });
		});
		// Sales Stage
		setupCustomDropdown({ doctype: "Sales Stage", targetId: "sales-stage5" });
		// Brand (initially empty, dynamically populated via Item Group)
		setupCustomDropdown({ doctype: "Brand", targetId: "brand-filter5", options: [] });

		// Item Group with Brand dependency
		setupCustomDropdown({
			doctype: "Item Group",
			targetId: "item-group-filter5",
			onSelectionChange: function (selectedGroups) {
				const brandList = document.getElementById("itemsList-brand-filter5");
				const brandBtnText = document.querySelector("#brand-filter5 .btn-text");

				// Reset brand UI
				brandList.innerHTML = '';
				brandBtnText.textContent = "Brand";

				const updateBrandList = (brands) => {
					const uniqueBrands = [...new Set(brands.filter(Boolean))];
					uniqueBrands.sort().forEach(brand => {
						const li = document.createElement("li");
						li.className = "item";
						li.setAttribute("data-value", brand);
						li.setAttribute("title", brand); // 🔥 add this line
						li.innerHTML = `<span class="item-text">${brand}</span>`;
						brandList.appendChild(li);
					});

					// Rebind click event for brand items
					brandList.querySelectorAll(".item").forEach(item => {
						item.addEventListener("click", function () {
							this.classList.toggle("checked");

							const checkedItems = brandList.querySelectorAll(".item.checked");
							const labels = Array.from(checkedItems).map(i => i.innerText.trim()).join(", ");
							brandBtnText.textContent = labels.length > 15 ? labels.substring(0, 15) + "..." : (labels || "Brand");
						});
					});
				};

				if (!selectedGroups.length) {
					// No filter: show all brands
					frappe.call({
						method: "frappe.client.get_list",
						args: {
							doctype: "Item",
							fields: ["brand"],
							limit_page_length: 999
						},
						callback: (res) => {
							const items = res.message || [];
							const brands = items.map(i => i.brand);
							updateBrandList(brands);
						}
					});
				} else {
					// Filter by selected groups
					frappe.call({
						method: "frappe.client.get_list",
						args: {
							doctype: "Item",
							fields: ["brand", "item_group"],
							filters: [["item_group", "in", selectedGroups]],
							limit_page_length: 999
						},
						callback: (res) => {
							const items = res.message || [];
							const brands = items.map(i => i.brand);
							updateBrandList(brands);
						}
					});
				}
			}
		});
	}

	resetAllDropdowns5() {
		for (const key in this.dropdownRegistry5) {
			const d = this.dropdownRegistry5[key];
			// FULL RESET
			d.selectedItems.clear();
			d.itemList.querySelectorAll(".item").forEach(i => i.classList.remove("checked"));
			const defaultLabel = d.btnText.dataset.defaultLabel || "Select";
			d.btnText.textContent = defaultLabel;
			d.selectBtn.classList.remove("open");
		}
	}


	//opportunity target chart
	opportunity_target_chart(sales_person = null) {
		//console.log("opportunity target salesperson:", sales_person);
		setTimeout(() => {
			frappe.call({
				method: "renewal_module.custom_module.page.salesperson_dashboar.salesperson_dashboar.get_opportunity_target_data",
				args: { sales_person: sales_person },
				callback: (r) => {
					//console.log("opportunity sales target data:", r.message);
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

						var chartElement = document.getElementById("opportunity-target-overview");
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
							yaxis: {
								labels: {
									formatter: function (value) {
										return formatIndianNumber(value); // <-- Uses your existing function
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
							grid: { padding: { left: 0, right: 0, top: 0, bottom: -10 } },
						};

						if (window.opportunitytargetChart) {
							window.opportunitytargetChart.destroy();
						}
						window.opportunitytargetChart = new ApexCharts(chartElement, options);
						window.opportunitytargetChart.render();
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


	//target dashboard

	sales_target_chart(sales_person = null) {
		setTimeout(() => {
			frappe.call({
				method: "renewal_module.custom_module.page.salesperson_dashboar.target_data.get_target_data",
				args: { sales_person: sales_person },
				callback: (r) => {
					//console.log("sales target data:", r.message);
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
							yaxis: {
								labels: {
									formatter: function (value) {
										return formatIndianNumber(value); // <-- Uses your existing function
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
			method: "renewal_module.custom_module.page.salesperson_dashboar.target_data.get_sales_target_tm",
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
			method: "renewal_module.custom_module.page.salesperson_dashboar.target_data.get_sales_target_ty",
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
				method: "renewal_module.custom_module.page.salesperson_dashboar.target_data.get_sales_target_tm",
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
						document.getElementById("targetamount").setAttribute("title", bottomline_target.toLocaleString("en-IN"));
						document.getElementById("achievedamounttm").innerHTML = achieved_target.toLocaleString("en-IN");
						document.getElementById("achievedamounttm").style.color = "blue";
						document.getElementById("achievedamounttm").setAttribute("title", achieved_target.toLocaleString("en-IN"));
						document.getElementById("achievedamountpercentagetm").innerHTML = achieved_percentage.toLocaleString("en-IN", { maximumFractionDigits: 2 }) + "%";
						document.getElementById("achievedamountpercentagetm").style.color = achieved_color;
						document.getElementById("achievedamountpercentagetm").setAttribute("title", achieved_percentage.toLocaleString("en-IN", { maximumFractionDigits: 2 }) + "%");
					}
				}
			});
		});
	}



	target_category_wise_chart(sales_person = null) {
		setTimeout(() => {
			frappe.call({
				method: "renewal_module.custom_module.page.salesperson_dashboar.target_data.target_category_wise_chart_tm",
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
								labels: {
									formatter: function (value) {
										return formatIndianNumber(value); // <-- Uses your existing function
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
				method: "renewal_module.custom_module.page.salesperson_dashboar.target_data.target_category_wise_overall_chart",
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
								toolbar: { show: false }
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
								labels: {
									formatter: function (value) {
										return formatIndianNumber(value); // <-- Uses your existing function
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
				method: "renewal_module.custom_module.page.salesperson_dashboar.target_data.get_sales_target_tm",
				args: { sales_person: sales_person },
				callback: (response) => {
					if (response.message) {
						//console.log("this month:", response.message)
						let bottomline_target_tm = Number(response.message.bottomline_target) || 0;
						let archieved_amount_tm = Number(response.message.achieved) || 0;
						let variance_amount_tm = Number(response.message.variance) || 0;
						// Apply styles
						document.getElementById("target-amount-tm").innerHTML = bottomline_target_tm.toLocaleString("en-IN");
						document.getElementById("target-amount-tm").style.color = "blue";
						document.getElementById("target-amount-tm").setAttribute("title", bottomline_target_tm.toLocaleString("en-IN"));
						document.getElementById("achieved-amount-tm").innerHTML = archieved_amount_tm.toLocaleString("en-IN");
						document.getElementById("achieved-amount-tm").style.color = "green";
						document.getElementById("achieved-amount-tm").setAttribute("title", archieved_amount_tm.toLocaleString("en-IN"));
						document.getElementById("variable-amount-tm").innerHTML = variance_amount_tm.toLocaleString("en-IN");
						document.getElementById("variable-amount-tm").style.color = "red"; // Variance always red
						document.getElementById("variable-amount-tm").setAttribute("title", variance_amount_tm.toLocaleString("en-IN"));
					}
				}
			});
		});
	}



	get_sales_target_tq(sales_person = null) {
		setTimeout(() => {
			frappe.call({
				method: "renewal_module.custom_module.page.salesperson_dashboar.target_data.get_sales_target_tq",
				args: { sales_person: sales_person },
				callback: (response) => {
					//console.log("this quarter", response.message)
					if (response.message) {
						let bottomline_target_tq = Number(response.message.bottomline_target) || 0;
						let achieved_amount_tq = Number(response.message.achieved) || 0;
						let variance_amount_tq = Number(response.message.variance) || 0;

						document.getElementById("target-amount-tq").innerHTML = bottomline_target_tq.toLocaleString("en-IN");;
						document.getElementById("target-amount-tq").style.color = "blue";
						document.getElementById("target-amount-tq").setAttribute("title", bottomline_target_tq.toLocaleString("en-IN"));
						document.getElementById("achieved-amount-tq").innerHTML = achieved_amount_tq.toLocaleString("en-IN");;
						document.getElementById("achieved-amount-tq").style.color = "green";
						document.getElementById("achieved-amount-tq").setAttribute("title", achieved_amount_tq.toLocaleString("en-IN"));
						document.getElementById("variable-amount-tq").innerHTML = variance_amount_tq.toLocaleString("en-IN");;
						document.getElementById("variable-amount-tq").style.color = "red";
						document.getElementById("variable-amount-tq").setAttribute("title", variance_amount_tq.toLocaleString("en-IN"));
						document.getElementById("quarter-heading").innerHTML = response.message.current_quarter_months || "This Quarter";
					}
				}
			});
		})
	}

	get_sales_target_ty(sales_person = null) {
		setTimeout(() => {
			frappe.call({
				method: "renewal_module.custom_module.page.salesperson_dashboar.target_data.get_sales_target_ty",
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
						document.getElementById("target-amount-ty").setAttribute("title", target_ty.toLocaleString("en-IN"));
						document.getElementById("achieved-amount-ty").innerHTML = achieved_amount_ty.toLocaleString("en-IN");;
						document.getElementById("achieved-amount-ty").style.color = "green";
						document.getElementById("achieved-amount-ty").setAttribute("title", achieved_amount_ty.toLocaleString("en-IN"));
						document.getElementById("variable-amount-ty").innerHTML = variance_amount_ty.toLocaleString("en-IN");;
						document.getElementById("variable-amount-ty").style.color = "red";
						document.getElementById("variable-amount-ty").setAttribute("title", variance_amount_ty.toLocaleString("en-IN"));
					}
				}
			});
		})
	}


	//sales stage  dashboard

	loadData(timeFilter = "this week", sales_person = "", from_date = "", to_date = "") {
		//console.log("loadData sales_person:", sales_person, "timeFilter:", timeFilter);
		if (!timeFilter) {
			timeFilter = document.getElementById("time-filter").value;
		}
		if (sales_person === null || sales_person === undefined) {
			const dropdown = document.getElementById("sales-person-dropdown");
			sales_person = dropdown ? (dropdown.value || null) : null;

		}
		// Handle custom date range only when selected
		if (timeFilter === "custom") {
			if (!from_date || !to_date) {
				from_date = document.getElementById("from-date").value;
				to_date = document.getElementById("to-date").value;
				if (!from_date || !to_date) {
					console.warn("Custom filter selected but dates missing.");
					return;
				}
			}
		} else {
			// Clear any accidental leftover dates
			from_date = "";
			to_date = "";
		}
		frappe.call({
			method: "renewal_module.custom_module.page.salesperson_dashboar.sales_stage.get_filtered_opportunities",
			args: {
				time_filter: timeFilter,
				from_date: from_date,
				to_date: to_date,
				sales_person: sales_person
			},

			callback: (r) => {
				if (r.message) {
					//console.log("funnel_data:", r.message);
					const { funnel_data, opportunities } = r.message;
					this.allOpportunities = opportunities || [];

					this.renderSalesWidgets(funnel_data || {});
					this.updateDonutChart();
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
			//card.style.width = "100px"; // consistent card width
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
						<div class="number ellipsis text-center fs-4 ${color}" title="₹ ${amount.toLocaleString("en-IN")}">
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
					this.updateDonutChart();
				} else {
					this.resetAllFilters();
					this.activeStage = stage;
					// Reset dropdowns
					// Filter only by selected sales stage (ignoring brand/item_group)
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

	resetAllFilters() {
		// Remove checked UI
		document.querySelectorAll(".item.checked").forEach(el => el.classList.remove("checked"));

		// Reset button text
		document.querySelectorAll(".select-btn .btn-text").forEach(btn => {
			const def = btn.dataset.defaultLabel || "Select";
			btn.textContent = def;
		});

		// Clear search boxes
		document.querySelectorAll(".search-input").forEach(i => i.value = "");

		// ❗ THIS WAS MISSING → reset internal state
		for (const key in this.dropdownState) {
			this.dropdownState[key].clear();
		}
	}




	renderOpportunitiesTable(data, show = true) {
		//this.allOpportunities = data; // Store original unfiltered data
		const tableWrapper = document.getElementById("opportunity-table-container");
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
		//const keys = Object.keys(data[0]);
		const keys = Object.keys(data[0]).filter(key => key !== "item_row");
		// Create header row
		const headerRow = document.createElement("tr");
		const snTh = document.createElement("th");
		snTh.textContent = "S.No";
		snTh.style.minWidth = "40px";
		snTh.style.maxWidth = "60px";
		snTh.style.textAlign = "center";
		snTh.style.top = "0";
		snTh.style.position = "sticky";
		snTh.style.zIndex = "3";
		snTh.style.backgroundColor = "#f8f9fa";
		headerRow.appendChild(snTh);
		keys.forEach(key => {
			const th = document.createElement("th");
			th.textContent = this.prettyLabel(key);
			if (["name", "item_code"].includes(key)) {
				th.style.minWidth = "150px";
				th.style.maxWidth = "150px";
			} else {
				th.style.minWidth = "50px";
				th.style.maxWidth = "100px";
			}
			th.style.overflow = "hidden";
			th.style.textOverflow = "ellipsis";
			th.style.whiteSpace = "nowrap";
			th.style.position = "sticky";
			th.style.top = "0";
			th.style.backgroundColor = "#f8f9fa";

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
				// Custom width for name and item_code
				if (["name", "item_code"].includes(key)) {
					td.style.minWidth = "150px";
					td.style.maxWidth = "150px";
				} else {
					td.style.minWidth = "50px";
					td.style.maxWidth = "100px";
				}
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
		this.updateDonutChart(filtered);
	}

	filterTableByItemGroupAndBrand(itemGroups, brands, opportunityTypes) {
		const filtered = this.allOpportunities.filter(opp => {
			const matchStage = this.activeStage ? opp.sales_stage === this.activeStage : true;
			const matchGroup = itemGroups.length ? itemGroups.includes(opp.item_group) : true;
			const matchBrand = brands.length ? brands.includes(opp.brand) : true;
			const matchOpportunityType = opportunityTypes.length ? opportunityTypes.includes(opp.opportunity_type) : true;

			return matchStage && matchGroup && matchBrand && matchOpportunityType;
		});
		//console.log("Filtered opportunities:", filtered);
		this.renderOpportunitiesTable(filtered, true);
	}

	showRows(count = 20, button = null) {
		// Clear highlight from Load More button
		document.getElementById("load-more-btn").classList.remove("bl");
		if (button) {
			// Remove highlight from number buttons
			document.querySelectorAll(".list-paging-area .btn-group .btn")
				.forEach(btn => btn.classList.remove("bl"));

			button.classList.add("bl");
			this.selectedRowCount = count;
		}
		this.visibleRowCount = count;
		if (!this.currentTableBody || !this.totalFilteredRows || this.totalFilteredRows.length === 0) return;
		// Hide all rows
		this.totalFilteredRows.forEach(row => row.style.display = "none");
		// Show only slice
		this.totalFilteredRows.slice(0, this.visibleRowCount).forEach(row => row.style.display = "");
	}

	loadMoreRows() {
		if (!this.currentTableBody || !this.totalFilteredRows || this.totalFilteredRows.length === 0) return;
		// Remove highlight from number buttons
		document.querySelectorAll(".list-paging-area .btn-group .btn")
			.forEach(btn => btn.classList.remove("bl"));
		// Highlight LOAD MORE button
		document.getElementById("load-more-btn").classList.add("bl");
		const nextCount = 100;
		const rowsToShow = this.totalFilteredRows.slice(
			this.visibleRowCount,
			this.visibleRowCount + nextCount
		);
		rowsToShow.forEach(row => row.style.display = "");
		this.visibleRowCount += rowsToShow.length;
	}


	prettyLabel(key) {
		return key
			.replace(/_/g, " ")
			.replace(/\b\w/g, l => l.toUpperCase());
	}

	multiselectDropdowns() {
		const setupCustomDropdown = ({ doctype, targetId, labelField = "name", options = [], onSelectionChange = null }) => {
			const selectBtn = document.getElementById(targetId);
			const btnText = selectBtn?.querySelector(".btn-text");
			const itemList = document.getElementById(`itemsList-${targetId}`);
			const searchBox = document.querySelector(`.search-input[data-target="${targetId}"]`);
			//let selectedItems = new Set();
			let selectedItems = this.dropdownState[targetId];



			//console.log(`Initializing dropdown for: ${targetId}`);
			//console.log("selectBtn:", selectBtn);
			//console.log("btnText:", btnText);
			//console.log("itemList:", itemList);
			//console.log("searchBox:", searchBox);

			if (!selectBtn || !btnText || !itemList || !searchBox) {
				console.warn(`Missing elements for targetId: ${targetId}`);
				return;
			}

			// ✅ Set default label from HTML data-label on load
			const defaultLabel = selectBtn.getAttribute("data-label") || btnText.textContent.trim();
			btnText.dataset.defaultLabel = defaultLabel;
			btnText.textContent = defaultLabel;

			selectBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				//console.log(`Clicked dropdown: ${targetId}`);
				document.querySelectorAll(".select-btn").forEach(btn => {
					if (btn !== selectBtn) btn.classList.remove("open");
				});
				selectBtn.classList.toggle("open");
			});

			document.addEventListener("click", (e) => {
				if (!selectBtn.closest(".custom-dropdown-wrapper").contains(e.target)) {
					selectBtn.classList.remove("open");
				}
			});

			searchBox.addEventListener("keyup", function () {
				const searchTerm = this.value.toLowerCase();
				itemList.querySelectorAll(".item").forEach(item => {
					const text = item.innerText.toLowerCase();
					item.style.display = text.includes(searchTerm) ? "flex" : "none";
				});
			});

			function renderItems(list) {
				itemList.innerHTML = "";
				list.forEach(item => {
					const value = item?.[labelField] || item?.name || (typeof item === "string" ? item : "") || "";
					const li = document.createElement("li");
					li.className = "item";
					li.setAttribute("data-value", value);
					li.setAttribute("title", value);
					li.innerHTML = `<span class="item-text">${value}</span>`;
					itemList.appendChild(li);
				});
				//console.log(`Rendered ${list.length} items in: ${targetId}`);
				bindItemEvents();
			}

			function bindItemEvents() {
				itemList.querySelectorAll(".item").forEach(item => {
					item.addEventListener("click", function () {
						const value = this.getAttribute("data-value");
						if (selectedItems.has(value)) {
							selectedItems.delete(value);
							this.classList.remove("checked");
						} else {
							selectedItems.add(value);
							this.classList.add("checked");
						}

						const selectedArray = Array.from(selectedItems);
						// btnText.textContent = selectedArray.length > 0
						// 	? `${selectedArray.length} selected`
						// 	: `Select ${targetId.split("-").map(w => w[0].toUpperCase() + w.slice(1)).join(" ")}`;
						btnText.textContent = selectedArray.length > 0
							? `${selectedArray.length} selected`
							: btnText.dataset.defaultLabel;

						//console.log(`Selected values for ${targetId}:`, selectedArray);

						if (typeof onSelectionChange === "function") {
							onSelectionChange(selectedArray);
						}
					});
				});
			}

			if (options.length) {
				//console.log(`Using static options for: ${targetId}`, options);
				renderItems(options);
			} else {
				//console.log(`Fetching items for Doctype: ${doctype}`);
				frappe.call({
					method: "frappe.client.get_list",
					args: {
						doctype,
						fields: [labelField],
						order_by: labelField + " asc",
						limit_page_length: 999
					},
					callback: function (r) {
						if (r.message) {
							//console.log(`Fetched ${r.message.length} items for: ${targetId}`);
							renderItems(r.message);
						}
					}
				});
			}
		};


		// Opportunity Type
		frappe.model.with_doctype("Opportunity Item", () => {
			const opts = frappe.meta.get_docfield("Opportunity Item", "opportunity_type", null)?.options;
			const oppTypes = opts ? opts.split('\n').filter(x => x.trim()).map(opt => ({ name: opt.trim() })) : [];
			setupCustomDropdown({
				doctype: "Opportunity Type",
				targetId: "opportunity-type",
				options: oppTypes,
				onSelectionChange: (selectedOppTypes) => {
					const itemGroups = this.getSelectedValues("item-group-filter");
					const brands = this.getSelectedValues("brand-filter");
					this.filterTableByItemGroupAndBrand(itemGroups, brands, selectedOppTypes);
				}
			});
		});

		// Brand
		setupCustomDropdown({
			doctype: "Brand",
			targetId: "brand-filter",
			options: [],
			onSelectionChange: (selectedBrands) => {
				const itemGroups = this.getSelectedValues("item-group-filter");
				const oppTypes = this.getSelectedValues("opportunity-type");
				this.filterTableByItemGroupAndBrand(itemGroups, selectedBrands, oppTypes);
			}
		});

		// Item Group
		setupCustomDropdown({
			doctype: "Item Group",
			targetId: "item-group-filter",
			onSelectionChange: (selectedGroups) => {
				const brandList = document.getElementById("itemsList-brand-filter");
				const brandBtnText = document.querySelector("#brand-filter .btn-text");

				// Reset brand UI
				brandList.innerHTML = '';
				brandBtnText.textContent = "Brand";

				const updateBrandList = (brands) => {
					const uniqueBrands = [...new Set(brands.filter(Boolean))];
					uniqueBrands.sort().forEach(brand => {
						const li = document.createElement("li");
						li.className = "item";
						li.setAttribute("data-value", brand);
						li.setAttribute("title", brand);
						li.innerHTML = `<span class="item-text">${brand}</span>`;
						brandList.appendChild(li);
					});

					// Rebind click for brand list
					brandList.querySelectorAll(".item").forEach(item => {
						item.addEventListener("click", (e) => {
							const el = e.currentTarget; // This is the clicked <li> element
							el.classList.toggle("checked");

							const checkedItems = brandList.querySelectorAll(".item.checked");
							const labels = Array.from(checkedItems).map(i => i.innerText.trim());

							brandBtnText.textContent = labels.length > 0
								? (labels.join(", ").length > 15 ? labels.join(", ").substring(0, 15) + "..." : labels.join(", "))
								: "Brand";

							const brands = labels;
							const oppTypes = this.getSelectedValues("opportunity-type");
							const itemGroups = selectedGroups;
							this.filterTableByItemGroupAndBrand(itemGroups, brands, oppTypes);
						});
					});
				};

				if (!selectedGroups.length) {
					// No filter: show all brands
					frappe.call({
						method: "frappe.client.get_list",
						args: {
							doctype: "Item",
							fields: ["brand"],
							limit_page_length: 999
						},
						callback: (res) => {
							const items = res.message || [];
							const brands = items.map(i => i.brand);
							updateBrandList(brands);
						}
					});
				} else {
					// Filter brands based on selected item groups
					frappe.call({
						method: "frappe.client.get_list",
						args: {
							doctype: "Item",
							fields: ["brand", "item_group"],
							filters: [["item_group", "in", selectedGroups]],
							limit_page_length: 999
						},
						callback: (res) => {
							const items = res.message || [];
							const brands = items.map(i => i.brand);
							updateBrandList(brands);
						}
					});
				}

				const brands = this.getSelectedValues("brand-filter");
				const oppTypes = this.getSelectedValues("opportunity-type");
				this.filterTableByItemGroupAndBrand(selectedGroups, brands, oppTypes);
			}
		});
	}

	getSelectedValues(targetId) {
		const list = document.querySelectorAll(`#itemsList-${targetId} .item.checked`);
		//console.log(`Selected values for ${targetId}:`, Array.from(list).map(item => item.getAttribute("data-value")));
		return Array.from(list).map(item => item.getAttribute("data-value"));
	}
	//sales stage donut chart code
	renderDonutChart(canvasId, data) {
		//console.log("renderDonutChart called with canvasId:", canvasId);
		const canvas = document.getElementById(canvasId);
		if (!canvas) {
			console.warn(`Canvas with ID "${canvasId}" not found`);
			return;
		}

		if (this[canvasId + 'Chart']) {
			this[canvasId + 'Chart'].destroy();
		}

		const ctx = canvas.getContext("2d");
		const labels = Object.keys(data);
		const values = Object.values(data);
		const total = values.reduce((a, b) => a + b, 0);

		let centerText = {
			display: true,
			label: "Total",
			value: total
		};
		const centerTextPlugin = {
			id: 'centerText',
			afterDraw(chart) {
				if (!centerText.display) return;

				const ctx = chart.ctx;
				ctx.save();

				// Use chart area center instead of whole canvas
				const centerX = chart.chartArea.left + (chart.chartArea.right - chart.chartArea.left) / 2;
				const centerY = chart.chartArea.top + (chart.chartArea.bottom - chart.chartArea.top) / 2;

				const labelFontSize = Math.floor(chart.height / 15);
				const valueFontSize = Math.floor(chart.height / 15);

				const label = centerText.label;
				const value = '₹ ' + centerText.value.toLocaleString('en-IN');

				ctx.textAlign = 'center';
				ctx.textBaseline = 'middle';

				// Measure label height
				ctx.font = `${labelFontSize}px sans-serif`;
				const labelMetrics = ctx.measureText(label);
				const labelHeight = labelMetrics.actualBoundingBoxAscent + labelMetrics.actualBoundingBoxDescent;

				// Measure value height
				ctx.font = `${valueFontSize}px sans-serif`;
				const valueMetrics = ctx.measureText(value);
				const valueHeight = valueMetrics.actualBoundingBoxAscent + valueMetrics.actualBoundingBoxDescent;

				const totalHeight = labelHeight + valueHeight + 8;
				const startY = centerY - totalHeight / 2;

				// Draw label
				ctx.font = `${labelFontSize}px sans-serif`;
				ctx.fillStyle = '#666';
				ctx.fillText(label, centerX, startY + labelHeight / 2);

				// Draw value
				ctx.font = `${valueFontSize}px sans-serif`;
				ctx.fillStyle = '#222';
				ctx.fillText(value, centerX, startY + labelHeight + valueHeight / 2 + 8);

				ctx.restore();
			}
		};

		this[canvasId + 'Chart'] = new Chart(ctx, {
			type: "doughnut",
			data: {
				labels: labels,
				datasets: [{
					data: values,
					backgroundColor: this.generateColors(values.length),
					borderWidth: 0
				}]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				cutout: '65%',
				layout: { padding: 0 },
				elements: { arc: { borderWidth: 0 } },
				plugins: {
					legend: {
						display: false
					},
					title: {
						display: false,
					},
					tooltip: {
						enabled: false,
						external: () => { }
					}
				},
				onHover: (event, chartElement) => {
					const chartInstance = this[canvasId + 'Chart'];
					if (!chartInstance) return;
					if (chartElement.length > 0) {
						const idx = chartElement[0].index;
						centerText.label = labels[idx];
						centerText.value = values[idx];
					} else {
						centerText.label = "Total";
						centerText.value = total;
					}
					//this[canvasId + 'Chart'].draw();
					chartInstance.draw();
				}
			},
			plugins: [centerTextPlugin]
		});
	}


	updateDonutChart(filteredData = null) {
		frappe.require("https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js", () => {
			const data = filteredData || this.allOpportunities;
			// Group by Item Group
			let itemGroupData = {};
			// Group by Brand
			let brandData = {};

			data.forEach(opp => {
				const group = opp.item_group || "Unknown";
				const brand = opp.brand || "Unknown";
				const amount = Number(opp.amount) || 0;

				itemGroupData[group] = (itemGroupData[group] || 0) + amount;
				brandData[brand] = (brandData[brand] || 0) + amount;
			});
			//console.log("Rendering donut-item-group", itemGroupData);
			//console.log("Rendering donut-brand", brandData);
			this.renderDonutChart("donut-item-group", itemGroupData);
			this.renderDonutChart("donut-brand", brandData);
		})
	}

	generateColors(count) {
		/*const palette = [
			"#007bff", "#28a745", "#ffc107", "#dc3545", "#6f42c1",
			"#17a2b8", "#fd7e14", "#20c997", "#6610f2", "#e83e8c"
		];*/
		const palette = [
			"#007bff", "#28a745", "#ffc107", "#dc3545", "#6f42c1",
			"#17a2b8", "#fd7e14", "#20c997", "#6610f2", "#e83e8c",
			"#8e44ad", "#2ecc71", "#f39c12", "#d35400", "#2980b9",
			"#27ae60", "#e74c3c", "#9b59b6", "#1abc9c", "#f1c40f",
			"#34495e", "#95a5a6", "#e67e22", "#7f8c8d", "#ff6b6b"
		];
		let colors = [];
		for (let i = 0; i < count; i++) {
			colors.push(palette[i % palette.length]);
		}
		return colors;
	}

	//funnel section
	//closures this week
	get_closure_opp_count_tw(sales_person = null) {
		$("#closure-opp-count-tw").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.salesperson_dashboar.salesperson_dashboar.get_closure_opp_count_tw",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					$("#closure-opp-count-tw").text(r.message.count).attr("title", r.message.count);
				}
			}
		});
	}

	get_closure_opp_amount_tw(sales_person = null) {
		$("#closure-opp-amount-tw").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.salesperson_dashboar.salesperson_dashboar.get_closure_opp_amount_tw",
			args: { sales_person: sales_person },
			callback: function (r) {
				//console.log("r", r.message)
				if (r.message) {
					let formatted_price = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(r.message.sum);
					$("#closure-opp-amount-tw").text(formatted_price).attr("title", formatted_price);
				}
			}
		});
	}

	//rewals
	get_closures_rnwls_count_tw(sales_person = null) {
		$("#closures-rnwls-count-tw").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.salesperson_dashboar.salesperson_dashboar.get_closures_rnwls_count_tw",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					$("#closures-rnwls-count-tw").text(r.message.count).attr("title", r.message.count);
				}
			}
		});
	}

	get_closures_rnwls_amount_tw(sales_person = null) {
		$("#closures-rnwls-amount-tw").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.salesperson_dashboar.salesperson_dashboar.get_closures_rnwls_amount_tw",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					let formatted_price = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(r.message.sum);
					$("#closures-rnwls-amount-tw").text(formatted_price).attr("title", formatted_price);
				}
			}
		});
	}

	// Updated setup_widget_click_events4 with correct toggle and donut slice comparison
	setup_widget_click_events4() {
		const me = this;
		let lastClickedWidget4 = null;
		let tableVisible4 = false;
		let originalData4 = [];
		function getSelectedValues(selector) {
			const checkedItems = document.querySelectorAll(`${selector} .item.checked`);
			return Array.from(checkedItems).map(item => item.querySelector('.item-text')?.innerText.trim() || "");
		}

		function applyTableFilters4() {
			const selectedGroups = getSelectedValues("#itemsList-item-group-filter4");
			const selectedBrands = getSelectedValues("#itemsList-brand-filter4");
			const selectedStages = getSelectedValues("#itemsList-sales-stage4");
			const selectedOppTypes = getSelectedValues("#itemsList-opportunity-type4");

			const tbody = $("#widget-data-table4");
			const thead = $("#widget-data-table4").closest("table").find("thead");

			tbody.empty();

			let filtered = originalData4;
			if (selectedGroups.length) {
				filtered = filtered.filter(row =>
					selectedGroups.some(group =>
						safeNormalize(group) === safeNormalize(row.item_group)
					)
				);
			}
			if (selectedBrands.length) {
				filtered = filtered.filter(row =>
					selectedBrands.some(brand =>
						safeNormalize(brand) === safeNormalize(row.brand)
					)
				);
			}
			if (selectedStages.length) {
				filtered = filtered.filter(row =>
					selectedStages.some(stage =>
						safeNormalize(stage) === safeNormalize(row.sales_stage)
					)
				);
			}
			if (selectedOppTypes.length) {
				filtered = filtered.filter(row =>
					selectedOppTypes.some(type =>
						safeNormalize(type) === safeNormalize(row.opportunity_type)
					)
				);
			}

			if (filtered.length === 0) {
				tbody.html("<tr><td colspan='20' class='text-center'>No data found</td></tr>");
				thead.empty();
				return;
			}

			const keys = Object.keys(filtered[0]).filter(k => k !== "item_row");
			const headers = ["S.No", ...keys];
			let headerRow = "<tr>";
			headers.forEach(h => {
				let label = h === "name" ? "Opportunity Id" : h.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
				const thStyle = (h === "name" || h === "item_code") ? 'style="min-width:150px; max-width:150px;"' : "";
				headerRow += `<th class="text-ellipsis" title="${label}" ${thStyle}>${label}</th>`;
			});
			headerRow += "</tr>";
			thead.html(headerRow);

			filtered.forEach((row, index) => {
				let rowHtml = `<tr><td>${index + 1}</td>`;
				keys.forEach(key => {
					let val = row[key];
					let displayVal = (val === null || val === undefined || val === "") ? (typeof val === "number" ? 0 : "-") : val;

					if (typeof val === "number" && key !== "qty") {
						displayVal = "₹ " + val.toLocaleString("en-IN");
					}
					if (key === "name" && val) {
						const url = `/app/opportunity/${val}`;
						displayVal = `<a href="${url}" target="_blank">${val}</a>`;
					}
					const tdStyle = (key === "name" || key === "item_code") ? 'style="min-width:150px; max-width:150px;"' : "";
					rowHtml += `<td class="text-ellipsis" title="${(typeof val === 'string' || typeof val === 'number') ? val : ''}" ${tdStyle}>${displayVal}</td>`;
				});
				rowHtml += "</tr>";
				tbody.append(rowHtml);
			});
		}

		$(".show-card-popup4").off("click").on("click", function () {
			const $this = $(this);
			const method = $this.data("method");
			const widget_type4 = $this.data("type");
			const sales_person = $("#sales-person-dropdown").val() || "";

			if (!method) return;
			if (lastClickedWidget4 === widget_type4 && tableVisible4) {
				$(".show-card-popup4").removeClass("selected-widget");
				lastClickedWidget4 = null;
				tableVisible4 = false;
				$("#widget-container4").hide();
				$("#widget-filters4").hide();
				$("#widget-data-table4").empty();
				$("#widget-data-table4").closest("table").find("thead").empty();
				$("#widget-title4").text("Data");
				me.resetAllDropdowns4();
				// Reset UI dropdowns
				$(".custom-dropdown-wrapper .item").removeClass("checked");
				$(".custom-dropdown-wrapper .btn-text").each(function () {
					const defaultLabel = $(this).closest(".select-btn").attr("data-label"); // use stored label
					if (defaultLabel) {
						$(this).text(defaultLabel); // show only label
					}
				});
				return;
			}

			$(".show-card-popup4").removeClass("selected-widget");
			$this.addClass("selected-widget");
			me.resetAllDropdowns4();

			frappe.call({
				method: `renewal_module.custom_module.page.salesperson_dashboar.salesperson_dashboar.${method}`,
				args: { sales_person },
				callback: function (r) {
					const data = r.message.data || [];
					originalData4 = data;

					const widgetTitle = widget_type4.replace(/_/g, " ").toUpperCase();
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

		$("#sales-person-dropdown").on("change", function () {
			lastClickedWidget4 = null;
			tableVisible4 = false;
			$("#widget-container4").hide();
			$("#widget-filters4").hide();
			$("#widget-data-table4").empty();
			$("#widget-data-table4").closest("table").find("thead").empty();
			$(".show-card-popup4").removeClass("selected-widget");
			me.resetAllDropdowns4();
		});

		$("#itemsList-item-group-filter4, #itemsList-brand-filter4, #itemsList-sales-stage4, #itemsList-opportunity-type4").on("click", function () {
			if (tableVisible4) {
				applyTableFilters4();
			}
		});
	}

	multiselectDropdown4() {
		const me = this;
		function setupCustomDropdown({ doctype, targetId, labelField = "name", options = [], onSelectionChange = null }) {
			const selectBtn = document.getElementById(targetId);
			const btnText = selectBtn?.querySelector(".btn-text");
			const itemList = document.getElementById(`itemsList-${targetId}`);
			const searchBox = document.querySelector(`.search-input[data-target="${targetId}"]`);
			let selectedItems = new Set();

			if (!selectBtn || !btnText || !itemList || !searchBox) return;
			// ✅ Set default label from HTML data-label on load
			const defaultLabel = selectBtn.getAttribute("data-label") || btnText.textContent.trim();
			btnText.dataset.defaultLabel = defaultLabel;
			btnText.textContent = defaultLabel;

			selectBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				document.querySelectorAll(".select-btn").forEach(btn => {
					if (btn !== selectBtn) btn.classList.remove("open");
				});
				selectBtn.classList.toggle("open");
			});

			document.addEventListener("click", (e) => {
				if (!selectBtn.closest(".custom-dropdown-wrapper").contains(e.target)) {
					selectBtn.classList.remove("open");
				}
			});

			searchBox.addEventListener("keyup", function () {
				const searchTerm = this.value.toLowerCase();
				itemList.querySelectorAll(".item").forEach(item => {
					const text = item.innerText.toLowerCase();
					item.style.display = text.includes(searchTerm) ? "flex" : "none";
				});
			});

			function renderItems(list) {
				itemList.innerHTML = "";
				list.forEach(item => {
					const value = item?.[labelField] || item?.name || (typeof item === "string" ? item : "") || "";
					const li = document.createElement("li");
					li.className = "item";
					li.setAttribute("data-value", value);
					li.setAttribute("title", value);
					li.innerHTML = `<span class="item-text">${value}</span>`;
					itemList.appendChild(li);
				});
				bindItemEvents();
				me.dropdownRegistry4[targetId] = {
					selectedItems,  // <— the new set
					btnText,
					selectBtn,
					itemList
				};
			}

			function bindItemEvents() {
				// Remove old handlers to avoid duplication
				itemList.querySelectorAll(".item").forEach(item => {
					const newItem = item.cloneNode(true);  // clone removes all old event listeners
					item.replaceWith(newItem);
				});
				// Now re-select fresh items
				itemList.querySelectorAll(".item").forEach(item => {
					item.addEventListener("click", function () {
						const value = this.getAttribute("data-value");
						// Toggle selection
						if (selectedItems.has(value)) {
							selectedItems.delete(value);
							this.classList.remove("checked");
						} else {
							selectedItems.add(value);
							this.classList.add("checked");
						}
						const selectedArray = Array.from(selectedItems);
						// UI update
						btnText.textContent =
							selectedArray.length > 0
								? `${selectedArray.length} selected`
								: btnText.dataset.defaultLabel;

						if (typeof onSelectionChange === "function") {
							onSelectionChange(selectedArray);
						}
					});
				});
			}

			if (options.length) {
				renderItems(options);
			} else {
				frappe.call({
					method: "frappe.client.get_list",
					args: {
						doctype,
						fields: [labelField],
						order_by: labelField + " asc",
						limit_page_length: 999
					},
					callback: function (r) {
						if (r.message) renderItems(r.message);
					}
				});
			}
		}

		// Opportunity Type
		frappe.model.with_doctype("Opportunity Item", () => {
			const opts = frappe.meta.get_docfield("Opportunity Item", "opportunity_type", null)?.options;
			const oppTypes = opts ? opts.split('\n').filter(x => x.trim()).map(opt => ({ name: opt.trim() })) : [];
			setupCustomDropdown({ doctype: "Opportunity Type", targetId: "opportunity-type4", options: oppTypes });
		});
		// Sales Stage
		setupCustomDropdown({ doctype: "Sales Stage", targetId: "sales-stage4" });
		// Brand (initially empty, dynamically populated via Item Group)
		setupCustomDropdown({ doctype: "Brand", targetId: "brand-filter4", options: [] });

		// Item Group with Brand dependency
		setupCustomDropdown({
			doctype: "Item Group",
			targetId: "item-group-filter4",
			onSelectionChange: function (selectedGroups) {
				const brandList = document.getElementById("itemsList-brand-filter4");
				const brandBtnText = document.querySelector("#brand-filter4 .btn-text");

				// Reset brand UI
				brandList.innerHTML = '';
				brandBtnText.textContent = "Brand";

				const updateBrandList = (brands) => {
					const uniqueBrands = [...new Set(brands.filter(Boolean))];
					uniqueBrands.sort().forEach(brand => {
						const li = document.createElement("li");
						li.className = "item";
						li.setAttribute("data-value", brand);
						li.setAttribute("title", brand);
						li.innerHTML = `<span class="item-text">${brand}</span>`;
						brandList.appendChild(li);
					});

					// Rebind click event for brand items
					brandList.querySelectorAll(".item").forEach(item => {
						item.addEventListener("click", function () {
							this.classList.toggle("checked");

							const checkedItems = brandList.querySelectorAll(".item.checked");
							const labels = Array.from(checkedItems).map(i => i.innerText.trim()).join(", ");
							brandBtnText.textContent = labels.length > 15 ? labels.substring(0, 15) + "..." : (labels || "Brand");
						});
					});
				};

				if (!selectedGroups.length) {
					// No filter: show all brands
					frappe.call({
						method: "frappe.client.get_list",
						args: {
							doctype: "Item",
							fields: ["brand"],
							limit_page_length: 999
						},
						callback: (res) => {
							const items = res.message || [];
							const brands = items.map(i => i.brand);
							updateBrandList(brands);
						}
					});
				} else {
					// Filter by selected groups
					frappe.call({
						method: "frappe.client.get_list",
						args: {
							doctype: "Item",
							fields: ["brand", "item_group"],
							filters: [["item_group", "in", selectedGroups]],
							limit_page_length: 999
						},
						callback: (res) => {
							const items = res.message || [];
							const brands = items.map(i => i.brand);
							updateBrandList(brands);
						}
					});
				}
			}

		});
	}

	resetAllDropdowns4() {
		for (const key in this.dropdownRegistry4) {
			const d = this.dropdownRegistry4[key];
			// FULL RESET
			d.selectedItems.clear();
			d.itemList.querySelectorAll(".item").forEach(i => i.classList.remove("checked"));
			const defaultLabel = d.btnText.dataset.defaultLabel || "Select";
			d.btnText.textContent = defaultLabel;
			d.selectBtn.classList.remove("open");
		}
	}

	brand_wise_donut_chart_tw(sales_person = null) {
		//console.log("brand tm salesperson", sales_person);
		//setTimeout(() => {
		frappe.call({
			method: "renewal_module.custom_module.page.salesperson_dashboar.salesperson_dashboar.get_brand_wise_data_tw",
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
					if (window.brandDonutCharttw) {
						window.brandDonutCharttw.destroy();
						//window.brandDonutCharttw = null;
					}
					const brands = r.message?.brand || [];
					const amounts = r.message?.amounts || [];

					const labelsData = brands.length ? brands.map(label => label || "Unnamed Brand") : ["No Data"];
					const seriesData = amounts.length ? amounts.map(val => val || 0) : [0];
					//const seriesData = r.message.amounts?.map(val => val || 0) || [0];
					//const labelsData = r.message.brand || ["No Data"];
					//const labelsData = (r.message.brand || []).map(label => label ? label : "Unnamed Brand");
					const colors = ["#FEB019", "#EE502D", "#008FFB", "#00E396", "#775DD0", "#546E7A"];
					const chartOptions = {
						chart: {
							type: "donut", height: 180,
							events: {
								dataPointSelection: function (event, chartContext, config) {
									event.stopPropagation();
									const clickedIndex = config.dataPointIndex;
									const selectedBrand2 = labelsData[clickedIndex];
									// console.log("Donut slice clicked:");
									// console.log(" Brand:", selectedBrand);
									//console.log("Index:", clickedIndex);
									// Save the brand globally
									window.selectedBrandFromDonut2 = selectedBrand2;
									window.selectedItemGroupFromDonut2 = null;
									// Simulate a click on the widget to load table with filter
									const methodName = "get_brand_wise_data_tw"; // 🔁 Replace with your actual method
									const widgetButton = $(`.show-card-popup4[data-method="${methodName}"]`);
									if (widgetButton.length > 0 && !widgetButton.data("clicked")) {
										widgetButton.data("clicked", true);
										widgetButton.trigger("click");
										setTimeout(() => {
											widgetButton.data("clicked", false);
										}, 500); // Reset after 1 second
									} else {
										console.warn("⚠️ Widget button not found for method:", methodName);
									}
								}
							}

						},
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

					window.brandDonutCharttw = new ApexCharts(chartElement, chartOptions);
					window.brandDonutCharttw.render();
				}
			}
		});
		//}, 500);
		// Utility function
		function formatIndianNumber(x) {
			if (isNaN(x)) return x;
			return x.toLocaleString("en-IN", {
				maximumFractionDigits: 0
			});
		}
	}

	Item_group_donut_chart_tw(sales_person = null) {
		//console.log("Itemgroup tm salesperson", sales_person);
		frappe.call({
			method: "renewal_module.custom_module.page.salesperson_dashboar.salesperson_dashboar.get_item_group_wise_data_tw",
			args: { sales_person: sales_person },
			callback: (r) => {
				if (r.message) {
					//console.log("itemgroup tm data", r.message);
					const chartElement = document.getElementById("item_group_donut_chart_tw");

					if (!chartElement) {
						console.error("Chart container not found");
						return;
					}
					if (window.itemGroupDonutCharttw) {
						window.itemGroupDonutCharttw.destroy();
						window.itemGroupDonutCharttw = null;
					}

					const brands = r.message?.item_group || [];
					const amounts = r.message?.amounts || [];

					const labels = brands.length ? brands.map(label => label || "Unnamed Item Group") : ["No Data"];
					const series = amounts.length ? amounts.map(val => val || 0) : [0];

					const colors = ["#FEB019", "#EE502D", "#008FFB", "#00E396", "#775DD0", "#546E7A"];
					//const series = r.message.amounts?.map(val => val || 0) || [0];
					//const labels = r.message.item_group?.length ? r.message.item_group : ["No Data"];

					const chartOptions = {
						chart: {
							type: "donut", height: 180, width: "100%",
							events: {
								dataPointSelection: function (event, chartContext, config) {
									event.stopPropagation();
									const clickedIndex = config.dataPointIndex;
									const selectedItemGroup2 = labels[clickedIndex];

									// console.log("Donut slice clicked:");
									// console.log("Item Group:", selectedItemGroup);
									//console.log("Index:", clickedIndex);

									// Save the item group globally
									window.selectedItemGroupFromDonut2 = selectedItemGroup2;
									window.selectedBrandFromDonut2 = null;

									// Simulate a click on the widget to load table with filter
									const methodName = "get_item_group_wise_data_tw"; // Match the data-method
									const widgetButton = $(`.show-card-popup4[data-method="${methodName}"]`);
									if (widgetButton.length > 0 && !widgetButton.hasClass("clicked")) {
										widgetButton.addClass("clicked");
										widgetButton.trigger("click");
										setTimeout(() => {
											widgetButton.removeClass("clicked");
										}, 500); // Reset after 0.5 seconds
									} else {
										console.warn("⚠️ Widget button not found for method:", methodName);
									}
								}
							}
						},
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

					window.itemGroupDonutCharttw = new ApexCharts(chartElement, chartOptions);
					window.itemGroupDonutCharttw.render();
				}
			}
		});
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
			method: "renewal_module.custom_module.page.salesperson_dashboar.salesperson_dashboar.get_closure_opp_count_tm",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					$("#closure-opp-count-tm").text(r.message.count).attr("title", r.message.count || 0);
				}
			}
		});
	}

	get_closure_opp_amount_tm(sales_person = null) {
		$("#closure-opp-amount-tm").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.salesperson_dashboar.salesperson_dashboar.get_closure_opp_amount_tm",
			args: { sales_person: sales_person },
			callback: function (r) {
				//console.log("r-tm", r.message)
				if (r.message) {
					let formatted_price = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(r.message.sum);
					$("#closure-opp-amount-tm").text(formatted_price).attr("title", formatted_price);
				}
			}
		});
	}

	//rewals
	get_closures_rnwls_count_tm(sales_person = null) {
		$("#closures-rnwls-count-tm").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.salesperson_dashboar.salesperson_dashboar.get_closures_rnwls_count_tm",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					$("#closures-rnwls-count-tm").text(r.message.count).attr("title", r.message.count);
				}
			}
		});
	}

	get_closures_rnwls_amount_tm(sales_person = null) {
		//console.log("rnwls salesperson:", sales_person);
		$("#closures-rnwls-amount-tm").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.salesperson_dashboar.salesperson_dashboar.get_closures_rnwls_amount_tm",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					let formatted_price = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(r.message.sum);
					$("#closures-rnwls-amount-tm").text(formatted_price).attr("title", formatted_price);
				}
			}
		});
	}

	brand_wise_donut_chart_tm(sales_person = null) {
		//console.log("brand tm salesperson", sales_person);
		//setTimeout(() => {
		frappe.call({
			method: "renewal_module.custom_module.page.salesperson_dashboar.salesperson_dashboar.get_brand_wise_data_tm",
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
					if (window.brandDonutCharttm) {
						window.brandDonutCharttm.destroy();
						window.brandDonutCharttm = null;
					}
					const brands = r.message?.brand || [];
					const amounts = r.message?.amounts || [];

					const labelsData = brands.length ? brands.map(label => label || "Unnamed Brand") : ["No Data"];
					const seriesData = amounts.length ? amounts.map(val => val || 0) : [0];
					//const seriesData = r.message.amounts?.map(val => val || 0) || [0];
					//const labelsData = r.message.brand || ["No Data"];
					//const labelsData = (r.message.brand || []).map(label => label ? label : "Unnamed Brand");
					const colors = ["#FEB019", "#EE502D", "#008FFB", "#00E396", "#775DD0", "#546E7A"];
					const chartOptions = {
						chart: {
							type: "donut",
							height: 180,
							events: {
								dataPointSelection: function (event, chartContext, config) {
									const clickedIndex = config.dataPointIndex;
									const selectedBrand1 = labelsData[clickedIndex];
									// console.log("Donut slice clicked:");
									// console.log(" Brand:", selectedBrand);
									//console.log("Index:", clickedIndex);
									// Save the brand globally
									window.selectedBrandFromDonut1 = selectedBrand1;
									window.selectedItemGroupFromDonut1 = null; // Reset item group selection
									// Simulate a click on the widget to load table with filter
									const methodName = "get_brand_wise_data_tm"; // 🔁 Replace with your actual method
									const widgetButton = $(`.show-card-popup4[data-method="${methodName}"]`);
									if (widgetButton.length > 0 && !widgetButton.hasClass("clicked")) {
										widgetButton.addClass("clicked");
										widgetButton.trigger("click");
										// Reset the clicked state after a short delay
										setTimeout(() => {
											widgetButton.removeClass("clicked");
										}, 1000);
									} else {
										console.warn("⚠️ Widget button not found for method:", methodName);
									}
								}
							}
						},
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

					// if (window.brandDonutCharttm) {
					// 	window.brandDonutCharttm.destroy();
					// 	window.brandDonutCharttm = null;
					// }

					window.brandDonutCharttm = new ApexCharts(chartElement, chartOptions);
					window.brandDonutCharttm.render();
				}
			}
		});
		//}, 500);
		// Utility function
		function formatIndianNumber(x) {
			if (isNaN(x)) return x;
			return x.toLocaleString("en-IN", {
				maximumFractionDigits: 0
			});
		}
	}

	Item_group_donut_chart_tm(sales_person = null) {
		//console.log("Itemgroup tm salesperson", sales_person);
		//setTimeout(() => {
		frappe.call({
			method: "renewal_module.custom_module.page.salesperson_dashboar.salesperson_dashboar.get_item_group_wise_data_tm",
			args: { sales_person: sales_person },
			callback: (r) => {
				if (r.message) {
					//console.log("itemgroup tm data", r.message);
					const chartElement = document.getElementById("item_group_donut_chart_tm");

					if (!chartElement) {
						console.error("Chart container not found");
						return;
					}
					if (window.itemGroupDonutCharttm) {
						window.itemGroupDonutCharttm.destroy();
						window.itemGroupDonutCharttm = null;
					}

					const brands = r.message?.item_group || [];
					const amounts = r.message?.amounts || [];

					const labels = brands.length ? brands.map(label => label || "Unnamed Item Group") : ["No Data"];
					const series = amounts.length ? amounts.map(val => val || 0) : [0];

					const colors = ["#FEB019", "#EE502D", "#008FFB", "#00E396", "#775DD0", "#546E7A"];
					//const series = r.message.amounts?.map(val => val || 0) || [0];
					//const labels = r.message.item_group?.length ? r.message.item_group : ["No Data"];

					const chartOptions = {
						chart: {
							type: "donut",
							height: 180,
							width: "100%",
							events: {
								dataPointSelection: function (event, chartContext, config) {
									const clickedIndex = config.dataPointIndex;
									const selectedItemGroup1 = labels[clickedIndex];

									// console.log("Donut slice clicked:");
									// console.log("Item Group:", selectedItemGroup);
									//console.log("Index:", clickedIndex);

									// Save the item group globally
									window.selectedItemGroupFromDonut1 = selectedItemGroup1;
									window.selectedBrandFromDonut1 = null; // Reset brand selection

									// Simulate a click on the widget to load table with filter
									const methodName = "get_item_group_wise_data_tm"; // Match the data-method
									const widgetButton = $(`.show-card-popup4[data-method="${methodName}"]`);
									if (widgetButton.length > 0 && !widgetButton.hasClass("clicked")) {
										widgetButton.addClass("clicked");
										widgetButton.trigger("click");
										setTimeout(() => {
											widgetButton.removeClass("clicked");
										}, 500); // Reset after 0.5 seconds
									} else {
										console.warn("⚠️ Widget button not found for method:", methodName);
									}
								}
							}
						},
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

					// if (window.itemGroupDonutCharttm) {
					// 	window.itemGroupDonutCharttm.destroy();
					// 	window.itemGroupDonutCharttw = null;
					// }
					window.itemGroupDonutCharttm = new ApexCharts(chartElement, chartOptions);
					window.itemGroupDonutCharttm.render();
				}
			}
		});
		//}, 500);
		// Utility function
		function formatIndianNumber(x) {
			if (isNaN(x)) return x;
			return x.toLocaleString("en-IN", {
				maximumFractionDigits: 0
			});
		}
	}


	//activity target Dashboard
	//first row

	get_leads_count(sales_person = null) {
		//console.log("count sales person:", sales_person)
		$("#leads-count").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.salesperson_dashboar.salesperson_dashboar.get_leads_count",
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
			method: "renewal_module.custom_module.page.salesperson_dashboar.salesperson_dashboar.get_quoted_count",
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
			method: "renewal_module.custom_module.page.salesperson_dashboar.salesperson_dashboar.get_demo_count",
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
			method: "renewal_module.custom_module.page.salesperson_dashboar.salesperson_dashboar.get_new_customer_count",
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
			method: "renewal_module.custom_module.page.salesperson_dashboar.salesperson_dashboar.get_appointment_count",
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
			method: "renewal_module.custom_module.page.salesperson_dashboar.salesperson_dashboar.get_client_visit_count",
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
		//console.log("calls count sales person:", sales_person)
		$("#calls-count").text(0);
		frappe.call({
			method: "renewal_module.custom_module.page.salesperson_dashboar.salesperson_dashboar.get_calls_count",
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
			method: "renewal_module.custom_module.page.salesperson_dashboar.salesperson_dashboar.get_training_count",
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
			method: "renewal_module.custom_module.page.salesperson_dashboar.salesperson_dashboar.get_sessions_count",
			args: { sales_person: sales_person },
			callback: function (r) {
				if (r.message) {
					let count = r.message || 0;
					$("#session-count").text(count).attr("title", count);
				}
			}
		});
	}

	get_weekly_activity_data(sales_person = null) {
		//console.log("weekly activity salesperson:", sales_person);
		let self = this;
		frappe.call({
			method: "renewal_module.custom_module.page.salesperson_dashboar.salesperson_dashboar.get_weekly_activity_data",
			args: { sales_person: sales_person },
			callback: (r) => {
				//console.log("weekly activity data:", r.message.datasets.customers, r.message.datasets.calls, r.message.datasets.appointments);
				if (!r.message) return;

				const ctx = document.getElementById('last-week-line-graph').getContext('2d');
				const data = r.message;

				// 🔥 destroy old chart before re-rendering
				if (self.weeklyLineChart) {
					self.weeklyLineChart.destroy();
				}

				// 🆕 create chart and store in class property
				self.weeklyLineChart = new Chart(ctx, {
					type: 'line',
					data: {
						labels: data.labels,
						datasets: [
							{
								label: 'New Customers',
								data: data.datasets.customers,
								borderColor: 'green',
								backgroundColor: 'rgba(0, 128, 0, 0.1)',
								fill: false,
								tension: 0.4
							},
							{
								label: 'Appointments',
								data: data.datasets.appointments,
								borderColor: 'blue',
								backgroundColor: 'rgba(0, 0, 255, 0.1)',
								fill: false,
								tension: 0.4
							},
							{
								label: 'Calls',
								data: data.datasets.calls,
								borderColor: 'yellow',
								backgroundColor: 'rgba(255, 0, 0, 0.1)',
								fill: false,
								tension: 0.4
							}
						]
					},
					options: {
						responsive: true,
						maintainAspectRatio: false,
						plugins: {
							legend: { position: 'bottom', display: false },
							title: {
								display: false,
								text: 'WEEKLY ACTIVITY: CUSTOMERS, APPOINTMENTS & CALLS',
								align: 'start',
								color: '#000',
								font: {
									weight: 400,
									size: 12,
								}
							}
						},
						scales: {
							x: {
								ticks: {
									font: { size: 10 },
									autoSkip: true,
									maxRotation: 0,
									minRotation: 0
								}
							},
							y: {
								beginAtZero: true,
								ticks: { font: { size: 10 } }
							}
						}
					}
				});
			}
		});
	}



	//activity target 

	get_calls_tm(sales_person = null) {
		frappe.call({
			method: "renewal_module.custom_module.page.salesperson_dashboar.activity_target.get_calls_tm",
			args: { sales_person: sales_person },
			callback: (response) => {
				if (response.message) {
					//console.log("calls:", response.message);
					let target_tm = Number(response.message.target) || 0;
					let achieved_tm = Number(response.message.achieved);
					let achieved_percentage = 0;
					if (target_tm > 0) {
						achieved_percentage = (achieved_tm / target_tm) * 100;
					}

					let achieved_color = "red";
					if (achieved_percentage >= 0 && achieved_percentage < 50) {
						achieved_color = '#FF0000';
					} else if (achieved_percentage >= 50 && achieved_percentage < 60) {
						achieved_color = '#FFA500';
					} else if (achieved_percentage >= 60 && achieved_percentage < 80) {
						achieved_color = '#0000FF';
					} else if (achieved_percentage >= 80 && achieved_percentage < 100) {
						achieved_color = '#4CAF50';
					} else if (achieved_percentage >= 100) {
						achieved_color = '#FFD700';
					}

					const targetEl = document.getElementById("calls-target-tm");
					const achievedEl = document.getElementById("calls-achieved-tm");
					const percentEl = document.getElementById("calls-achieved-percent-tm"); // ✅ Corrected ID

					if (targetEl) {
						targetEl.innerHTML = target_tm.toLocaleString("en-IN");
						targetEl.style.color = "blue";
						targetEl.setAttribute("title", target_tm.toLocaleString("en-IN"));

					}
					if (achievedEl) {
						achievedEl.innerHTML = achieved_tm.toLocaleString("en-IN");
						achievedEl.style.color = achieved_color;
					}
					if (percentEl) {
						percentEl.innerHTML = achieved_percentage.toFixed(2) + "%";
					}
				}
			}
		});
	}


	get_appointments_tm(sales_person = null) {
		frappe.call({
			method: "renewal_module.custom_module.page.salesperson_dashboar.activity_target.get_appointments_tm",
			args: { sales_person: sales_person },
			callback: (response) => {
				if (response.message) {
					//console.log("appointments:", response.message);
					let target_tm = Number(response.message.target) || 0;
					let achieved_tm = Number(response.message.achieved);
					let achieved_percentage = 0;
					if (target_tm > 0) {
						achieved_percentage = (achieved_tm / target_tm) * 100;
					}

					let achieved_color = "red";
					if (achieved_percentage >= 0 && achieved_percentage < 50) {
						achieved_color = '#FF0000';
					} else if (achieved_percentage >= 50 && achieved_percentage < 60) {
						achieved_color = '#FFA500';
					} else if (achieved_percentage >= 60 && achieved_percentage < 80) {
						achieved_color = '#0000FF';
					} else if (achieved_percentage >= 80 && achieved_percentage < 100) {
						achieved_color = '#4CAF50';
					} else if (achieved_percentage >= 100) {
						achieved_color = '#FFD700';
					}

					const targetEl = document.getElementById("appointments-target-tm");
					const achievedEl = document.getElementById("appointments-achieved-tm");
					const percentEl = document.getElementById("appointments-achieved-percent-tm"); // ✅ Fixed ID

					if (targetEl) {
						targetEl.innerHTML = target_tm.toLocaleString("en-IN");
						targetEl.style.color = "blue";
						targetEl.setAttribute("title", target_tm.toLocaleString("en-IN"));
					}
					if (achievedEl) {
						achievedEl.innerHTML = achieved_tm.toLocaleString("en-IN");
						achievedEl.style.color = achieved_color;
					}
					if (percentEl) {
						percentEl.innerHTML = achieved_percentage.toFixed(2) + "%";
					}
				}
			}
		});
	}


	get_demos_tm(sales_person = null) {
		frappe.call({
			method: "renewal_module.custom_module.page.salesperson_dashboar.activity_target.get_demos_tm",
			args: { sales_person: sales_person },
			callback: (response) => {
				if (response.message) {
					//console.log("demos:", response.message);
					let target_tm = Number(response.message.target) || 0;
					// let achieved_tm = Number(response.message.achieved);
					// let achieved_percentage = 0;
					// if (target_tm > 0) {
					// 	achieved_percentage = (achieved_tm / target_tm) * 100;
					// }

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
			method: "renewal_module.custom_module.page.salesperson_dashboar.activity_target.get_leads_tm",
			args: { sales_person: sales_person },
			callback: (response) => {
				if (response.message) {
					//console.log("leads:", response.message);
					let target_tm = Number(response.message.target) || 0;
					// let achieved_tm = Number(response.message.achieved);
					// let achieved_percentage = 0;
					// if (target_tm > 0) {
					// 	achieved_percentage = (achieved_tm / target_tm) * 100;
					// }

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
			method: "renewal_module.custom_module.page.salesperson_dashboar.activity_target.get_sessions_tm",
			args: { sales_person: sales_person },
			callback: (response) => {
				if (response.message) {
					//console.log("sessions:", response.message);
					let target_tm = Number(response.message.target) || 0;
					// let achieved_tm = Number(response.message.achieved);
					// let achieved_percentage = 0;
					// if (target_tm > 0) {
					// 	achieved_percentage = (achieved_tm / target_tm) * 100;
					// }

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
			method: "renewal_module.custom_module.page.salesperson_dashboar.activity_target.get_trainings_tm",
			args: { sales_person: sales_person },
			callback: (response) => {
				if (response.message) {
					//console.log("trainings:", response.message);
					let target_tm = Number(response.message.target) || 0;
					// let achieved_tm = Number(response.message.achieved);
					// let achieved_percentage = 0;
					// if (target_tm > 0) {
					// 	achieved_percentage = (achieved_tm / target_tm) * 100;
					// }

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
			method: "renewal_module.custom_module.page.salesperson_dashboar.activity_target.get_fixed_amount",
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
			method: "renewal_module.custom_module.page.salesperson_dashboar.activity_target.get_variable_amount",
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

	setup_widget_click_events6 = function () {
		let lastClickedWidget6 = null;
		let tableVisible6 = false;
		let originalData6 = []; // store raw unfiltered data

		// Utility: Render table
		function applyTableFilters6() {
			const tbody = $("#widget-data-table6");
			const thead = $("#widget-data-table6").closest("table").find("thead");

			// Always clear
			tbody.empty();
			thead.empty();

			const filtered = originalData6;

			// Show message and skip building header if no data
			if (!filtered || filtered.length === 0) {
				tbody.html("<tr><td colspan='20' class='text-center'>No data found</td></tr>");
				return;
			}

			// Headers
			const keys = Object.keys(filtered[0]).filter(k => k !== "item_row");
			const headers = ["S.No", ...keys];
			let headerRow = "<tr>";
			headers.forEach(h => {
				let label = h.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
				const thStyle = (h === "name" || h === "item_code") ? 'style="min-width:150px; max-width:150px;"' : "";
				headerRow += `<th class="text-ellipsis" title="${label}" ${thStyle}>${label}</th>`;
			});
			headerRow += "</tr>";
			thead.html(headerRow);

			// Rows
			filtered.forEach((row, index) => {
				let rowHtml = `<tr><td>${index + 1}</td>`;
				keys.forEach(key => {
					let val = row[key];
					let displayVal = val;

					if (val === null || val === undefined || val === "") {
						displayVal = typeof val === "number" ? 0 : "-";
					}
					if (typeof val === "number" && key !== "qty") {
						displayVal = "₹ " + val.toLocaleString("en-IN");
					}
					if (key === "appointment_id" && val) {
						displayVal = `<a href="/app/appointment/${val}" target="_blank">${val}</a>`;
					}
					if (key === "lead_id" && val) {
						displayVal = `<a href="/app/lead/${val}" target="_blank">${val}</a>`;
					}
					if (key === "call_id" && val) {
						displayVal = `<a href="/app/call-list/${val}" target="_blank">${val}</a>`;
					}
					const tdStyle = (key === "name") ? 'style="min-width:100px; max-width:150px;"' : "";
					rowHtml += `<td class="text-ellipsis" title="${(typeof val === 'string' || typeof val === 'number') ? val : ''}" ${tdStyle}>${displayVal ?? ""}</td>`;
				});
				rowHtml += "</tr>";
				tbody.append(rowHtml);
			});
		}

		// Widget click handler
		$(".show-card-popup6").on("click", function () {
			const $this = $(this);
			const method = $this.data("method");
			const widget_type6 = $this.data("type");
			const sales_person = $("#sales-person-dropdown").val() || "";

			if (!method) return;

			// Toggle hide on second click
			if (lastClickedWidget6 === widget_type6 && tableVisible6) {
				$("#widget-container6").hide();
				$("#widget-filters6").hide();
				$("#widget-data-table6").empty();
				$("#widget-data-table6").closest("table").find("thead").empty();
				$("#widget-title6").text("Data");
				$(".show-card-popup6").removeClass("selected-widget");
				tableVisible6 = false;
				lastClickedWidget6 = null;
				return;
			}

			$(".show-card-popup6").removeClass("selected-widget");
			$this.addClass("selected-widget");

			frappe.call({
				method: `renewal_module.custom_module.page.salesperson_dashboar.activity_target.${method}`,
				args: {
					sales_person
				},
				callback: function (r) {
					const data = (r.message && Array.isArray(r.message)) ? r.message : [];

					originalData6 = data;

					const widgetTitle = widget_type6.replace(/_/g, " ").toUpperCase();
					$("#widget-title6").text(widgetTitle);

					// Apply filters (shows either table or "No data found")
					applyTableFilters6();

					$("#widget-container6").show();
					$("#widget-filters6").show();
					tableVisible6 = true;
					lastClickedWidget6 = widget_type6;
				}
			});
		});

		// Reset on dropdown change
		$("#sales-person-dropdown").on("change", function () {
			lastClickedWidget6 = null;
			tableVisible6 = false;
			$("#widget-container6").hide();
			$("#widget-filters6").hide();
			$("#widget-data-table6").empty();
			$("#widget-data-table6").closest("table").find("thead").empty();
			$(".show-card-popup6").removeClass("selected-widget");
		});
	}




}



// Define the HTML early
frappe.customer_app_page = {
	body: `
		<div class="tab-content">
			<div class="tab-pane fade" id="review-content" role="tabpanel" aria-labelledby="review-tab">
				<div class="mb-4 text-center">
					<button class="btn btn-sm title1" style="background-color:#e4e6ef;color:black;font-weight:bold;">
						Opportunity Dashboard
					</button>
				</div>

				<div class="row mt-2 d-flex align-items-stretch hidden" style="border-radius:10px;background-color:#F3F3F3">
					<div class="col-12 col-md-12 col-lg-5 col-xl-5 d-flex flex-column">
						<div class="title1 p-2">Target</div>
						<div class="row">
							<div class="col-6 col-md-4 col-xl-4 col-lg-4 mb-2">
								<div class="widget number-widget-box" data-widget-name="Target">
									<div class="widget-head">
										<div class="widget-label">
											<div class="widget-title">
												<span class="ellipsis" title="Target">
													<a class="sales-link" data-base-url="http://192.168.23.185:8000/app/query-report/Target%20Details%20Based%20On%20Invoice?company=64+Network+Security+Pvt+Ltd+-+TG&timespan=this+month&fiscal_year=2025-2026&from_date=2023-04-01&to_date=2024-03-31&group_by=Sales+Person" target="_blank">
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
							<div class="col-6 col-md-4 col-xl-4 col-lg-4 mb-2">
								<div class="widget number-widget-box show-card-popup5" data-type="achieved_(tm)" data-widget-name="Achieved" data-method="get_achieved_amount_tm">
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
						
							<div class="col-6 col-md-4 col-xl-4 col-lg-4 mb-2">
								<div class="widget number-widget-box" data-widget-name="Variance">
									<div class="widget-head">
										<div class="widget-label">
											<div class="widget-title">
												<span class="ellipsis" title="Variance">
													<a class="sales-link" data-base-url="http://192.168.23.185:8000/app/query-report/Target%20Details%20Based%20On%20Invoice?company=64+Network+Security+Pvt+Ltd+-+TG&timespan=this+month&fiscal_year=2025-2026&from_date=2023-04-01&to_date=2024-03-31&group_by=Sales+Person" target="_blank">
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
							<div class="col-6 col-md-4 col-xl-4 col-lg-4 mb-2">
								<div class="widget number-widget-box show-card-popup5" data-type="open_opportunity_(tm)" data-widget-name="Open Opportunities" data-method="get_open_opportunity_amount_tm">
									<div class="widget-head">
										<div class="widget-label">
											<div class="widget-title">
												<span class="ellipsis" title="Open Opportunities" style="color:black;">
													Open Oppportunities(TM)
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
							
						</div>	
					</div>	
					<div class="col-12 col-md-12 col-lg-7 col-xl-7 mb-1 d-flex flex-column">
						<div class="mt-2 mb-1 flex-grow-1" style="background-color:#FFFFFF;border-radius:10px;">
							<div class="title1 p-2">Monthly Performance</div>
							<div class="h-lg-100 h-100" id="opportunity-target-overview1" style="width: 100%;height:100%;"></div>
						</div>
					</div>
					
				</div>

				<div class="row hidden" style="background-color:#f3f3f3;border-radius:10px;padding:5px;margin:5px;">
					<div class="col-12 col-md-12 col-lg-6 col-xl-6">
						<div class="box5 row" style="border-radius:10px;padding:5px;">
							<div class="widget number-widget-box show-card-popup5" data-type="Topline Target(TM)" data-widget-name="Topline Target(TM)" data-method="">
								<div class="widget-head">
									<div class="widget-label">
										<div class="widget-title">
											<span class="ellipsis" title="Topline Target" style="color:black;">
												Topline Target(TM)
											</span>
										</div>
									</div>
								</div>
								<div class="widget-body">
									<div class="widget-content">
										<div class="number blue ellipsis" id="topline-target1">0</div>
									</div>
								</div>
							</div>
							<div class="widget number-widget-box show-card-popup5" data-type="Topline Target Achieved(TM)" data-widget-name="Topline Target Achieved(TM)" data-method="get_topline_achieved">
								<div class="widget-head">
									<div class="widget-label">
										<div class="widget-title">
											<span class="ellipsis" title="Topline Target Achieved(TM)" style="color:black;">
												Topline Target Achieved(TM)
											</span>
										</div>
									</div>
								</div>
								<div class="widget-body">
									<div class="widget-content">
										<div class="number green ellipsis" id="topline-achieved1">0</div>
									</div>
								</div>
							</div>

							<div class="widget number-widget-box show-card-popup5" data-type="Topline Variance" data-widget-name="Topline Variance" data-method="">
								<div class="widget-head">
									<div class="widget-label">
										<div class="widget-title">
											<span class="ellipsis" title="Topline Variance" style="color:black;">
												Topline Variance
											</span>
										</div>
									</div>
								</div>
								<div class="widget-body">
									<div class="widget-content">
										<div class="number red ellipsis" id="topline-variance1">0</div>
									</div>
								</div>
							</div>

							<div class="widget number-widget-box show-card-popup5" data-type="Renewal Amount" data-widget-name="Renewal Amount" data-method="get_renewal_amount_tt">
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
										<div class="number green ellipsis" id="renewal-amount-tt1">0</div>
									</div>
								</div>
							</div>


							<div class="widget number-widget-box show-card-popup5" data-type="new Amount" data-widget-name="new" data-method="get_new_amount_tt">
								<div class="widget-head">
									<div class="widget-label">
										<div class="widget-title">
											<span class="ellipsis" title="Fresh Amount" style="color:black;">
												Fresh Amount
											</span>
										</div>
									</div>
								</div>
								<div class="widget-body">
									<div class="widget-content">
										<div class="number green ellipsis" id="new-amount-tt1">0</div>
									</div>
								</div>
							</div>

							<div class="widget number-widget-box show-card-popup5" data-type="Bottomline Target(TM)" data-widget-name="Bottomline Target(TM)" data-method="">
								<div class="widget-head">
									<div class="widget-label">
										<div class="widget-title">
											<span class="ellipsis" title="Bottomline Target" style="color:black;">
												Bottomline Target
											</span>
										</div>
									</div>
								</div>
								<div class="widget-body">
									<div class="widget-content">
										<div class="number blue ellipsis" id="bottomline-target1">0</div>
									</div>
								</div>
							</div>
	
							<div class="widget number-widget-box show-card-popup5" data-type="Bottomline Target Achieved(TM)" data-widget-name="Bottomline Target Achieved(TM)" data-method="get_bottomline_achieved">
								<div class="widget-head">
									<div class="widget-label">
										<div class="widget-title">
											<span class="ellipsis" title="Bottomline Target Achieved(TM)" style="color:black;">
												Bottomline Target Achieved(TM)
											</span>
										</div>
									</div>
								</div>
								<div class="widget-body">
									<div class="widget-content">
										<div class="number green ellipsis" id="bottomline-achieved1">0</div>
									</div>
								</div>
							</div>
							
							<div class="widget number-widget-box show-card-popup5" data-type="Bottomline Variance" data-widget-name="Bottomline Variance" data-method="">
								<div class="widget-head">
									<div class="widget-label">
										<div class="widget-title">
											<span class="ellipsis" title="Bottomline Variance" style="color:black;">
												Bottomline Variance
											</span>
										</div>
									</div>
								</div>
								<div class="widget-body">
									<div class="widget-content">
										<div class="number red ellipsis" id="bottomline-variance1">0</div>
									</div>
								</div>
							</div>
							
							<div class="widget number-widget-box show-card-popup5" data-type="Renewal Amount" data-widget-name="Renewal Amount" data-method="get_renewal_amount">
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
										<div class="number green ellipsis" id="renewal-amount1">0</div>
									</div>
								</div>
							</div>
							
							
							<div class="widget number-widget-box show-card-popup5" data-type="new Amount" data-widget-name="new" data-method="get_new_amount">
								<div class="widget-head">
									<div class="widget-label">
										<div class="widget-title">
											<span class="ellipsis" title="Fresh Amount" style="color:black;">
												Fresh Amount
											</span>
										</div>
									</div>
								</div>
								<div class="widget-body">
									<div class="widget-content">
										<div class="number green ellipsis" id="new-amount1">0</div>
									</div>
								</div>
							</div>
							
							
						</div>
						
					</div>
					<div class="col-12 col-md-12 col-lg-6 col-xl-6 mb-1 d-flex flex-column">
						<div class="mt-2 mb-1 flex-grow-1" style="background-color:#FFFFFF;border-radius:10px;">
							<div class="title1 p-2">Monthly Performance</div>
							<div class="h-lg-100 h-100" id="opportunity-target-overview1" style="width: 100%;height:100%;"></div>
						</div>
					</div>

					

				</div>	

				

				<div class="row mt-2 d-flex align-items-stretch" style="border-radius:10px;background-color:#F3F3F3;">
					<div class="col-12 col-md-12 col-lg-5 col-xl-5 d-flex flex-column">
						<div class="box6 m-2">
							<div class="widget-card1">
								<div class="top-block1 mt-1">
									<span>TOPLINE TARGET</span>
									<p id="topline-target">₹250,000</p>
								</div>
								<div class="bottom-blocks1">
									<div class="left-block1 show-card-popup5" data-type="Topline Target Achieved(TM)" data-widget-name="Topline Target Achieved(TM)" data-method="get_topline_achieved">
										<h6>ACHIEVED</h6>
										<p class="green" id="topline-achieved">₹200,000</p>
									</div>
									<div class="right-block1">
										<h6>VARIANCE</h6>
										<p class="red" id="topline-variance">₹50,000</p>
									</div>
								</div>
								<div class="bottom-blocks1 mb-1">
									<div class="left-block1 show-card-popup5" data-type="Renewal Amount" data-widget-name="Renewal Amount" data-method="get_renewal_amount_tt">
										<h6>RENEWAL AMOUNT</h6>
										<p id="renewal-amount-tt">₹200,000</p>
									</div>
									<div class="right-block1 show-card-popup5" data-type="new Amount" data-widget-name="new" data-method="get_new_amount_tt">
										<h6>FRESH AMOUNT</h6>
										<p id="new-amount-tt">₹50,000</p>
									</div>
								</div>
							</div>

							<div class="widget-card1">
								<div class="top-block1 mt-1">
									<span>BOTTOMLINE TARGET</span>
									<p id="bottomline-target">₹250,000</p>
								</div>
								<div class="bottom-blocks1">
									<div class="left-block1 show-card-popup5" data-type="Bottomline Target Achieved(TM)" data-widget-name="Bottomline Target Achieved(TM)" data-method="get_bottomline_achieved">
										<h6>ACHIEVED</h6>
										<p class="green" id="bottomline-achieved">₹200,000</p>
									</div>
									<div class="right-block1">
										<h6>VARIANCE</h6>
										<p class="red" id="bottomline-variance">₹50,000</p>
									</div>
								</div>
								<div class="bottom-blocks1 mb-1">
									<div class="left-block1 show-card-popup5" data-type="Renewal Amount" data-widget-name="Renewal Amount" data-method="get_renewal_amount">
										<h6>RENEWAL AMOUNT</h6>
										<p id="renewal-amount">₹200,000</p>
									</div>
									<div class="right-block1 show-card-popup5" data-type="new Amount" data-widget-name="new" data-method="get_new_amount">
										<h6>FRESH AMOUNT</h6>
										<p id="new-amount">₹50,000</p>
									</div>
								</div>
							</div>
							
						</div>
					</div>

					<div class="col-12 col-md-12 col-lg-7 col-xl-7 mb-1 d-flex flex-column">
						<div class="mt-2 mb-1 flex-grow-1" style="background-color:#FFFFFF;border-radius:10px;">
							<div class="title1 p-2">Monthly Performance</div>
							<div class="h-lg-100 h-100" id="opportunity-target-overview" style="width: 100%;height:100%;"></div>
						</div>
					</div>

					<div class="col-12 col-md-12 col-lg-12 col-xl-12 mt-3 mb-3" id="widget-container5" style="display:none;">
						<div class="card p-2">
							<div class="d-flex align-items-center justify-content-between mb-3 flex-nowrap">
								<h5 class="mb-0 me-3" id="widget-title5">Data</h5>
								<div class="filter-section-responsive" id="filter-section5">
									<!-- Sales Stage -->
									<div class="custom-dropdown-wrapper">
										<div class="select-btn" id="sales-stage5">
											<span class="btn-text">Sales Stage</span>
											<span class="arrow-dwn"><i class="fa-solid fa-chevron-down"></i></span>
										</div>
										<div class="list-items">
											<div class="search-box">
												<input type="text" placeholder="Search..." class="search-input" data-target="sales-stage5">
											</div>
											<ul class="items-list" id="itemsList-sales-stage5"></ul>
										</div>
									</div>

									<!-- Opportunity Type -->
									<div class="custom-dropdown-wrapper">
										<div class="select-btn" id="opportunity-type5">
											<span class="btn-text">Opportunity Type</span>
											<span class="arrow-dwn"><i class="fa-solid fa-chevron-down"></i></span>
										</div>
										<div class="list-items">
											<div class="search-box">
												<input type="text" placeholder="Search..." class="search-input" data-target="opportunity-type5">
											</div>
											<ul class="items-list" id="itemsList-opportunity-type5"></ul>
										</div>
									</div>

									<!-- Item Group -->
									<div class="custom-dropdown-wrapper">
										<div class="select-btn" id="item-group-filter5">
											<span class="btn-text">Item Group</span>
											<span class="arrow-dwn"><i class="fa-solid fa-chevron-down"></i></span>
										</div>
										<div class="list-items">
											<div class="search-box">
												<input type="text" placeholder="Search..." class="search-input" data-target="item-group-filter5">
											</div>
											<ul class="items-list" id="itemsList-item-group-filter5"></ul>
										</div>
									</div>

									<!-- Brand -->
									<div class="custom-dropdown-wrapper">
										<div class="select-btn" id="brand-filter5">
											<span class="btn-text">Brand</span>
											<span class="arrow-dwn"><i class="fa-solid fa-chevron-down"></i></span>
										</div>
										<div class="list-items">
											<div class="search-box">
												<input type="text" placeholder="Search..." class="search-input" data-target="brand-filter5">
											</div>
											<ul class="items-list" id="itemsList-brand-filter5"></ul>
										</div>
									</div>
								</div>

							</div>

							<div id="widget-table-container">
								<table class="table">
									<thead></thead>
									<tbody id="widget-data-table5"></tbody>
								</table>
							</div>
						</div>
					</div>
					
				</div>	


				<div class="row mt-2" style="border-radius:10px;background-color:#F3F3F3;">
					<div class="d-flex align-items-center justify-content-between mb-3 flex-nowrap">
						<div class="title3">This Month</div>
						<div class="d-flex flex-wrap align-items-center ms-auto gap-2 mb-2 mt-2">
							<select id="time-filter1" class="form-select form-select-sm me-2" style="width:130px;">
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
							<div id="custom-date-fields1" class="d-flex flex-wrap align-items-center ms-2 hidden">
								<input type="text" id="from-date-display1" class="form-control form-control-sm me-2"
									placeholder="From Date" readonly style="width:130px; cursor: pointer;background-color:white;">
								<input type="text" id="to-date-display1" class="form-control form-control-sm"
									placeholder="To Date" readonly style="width:130px; cursor: pointer;background-color:white;">

								<input type="date" id="from-date1" class="real-date" style="position: absolute; opacity: 0; pointer-events: none;">
								<input type="date" id="to-date1" class="real-date" style="position: absolute; opacity: 0; pointer-events: none;">
							</div>
						</div>
					</div>	
					<div class="col-12 col-md-12 col-lg-6 mb-1">
						<div class="row mt-1">
							<div class="col-6 col-md-2 col-lg-4 mb-2">
								<div class="widget number-widget-box show-card-popup" data-type="opp_count" data-widget-name="Opp Count(Tm)" data-method="get_opp_count_tm">
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
							<div class="col-6 col-md-2 col-lg-4 mb-2">
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
							<div class="col-6 col-md-2 col-lg-4 mb-2">
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

							<div class="col-6 col-md-2 col-lg-4 mb-2">
								<div class="widget number-widget-box show-card-popup" data-type="renewal_count" data-widget-name="Renewal Count(Tm)" data-method="get_renewal_count_tm">
									<div class="widget-head">
										<div class="widget-label">
											<div class="widget-title">
												<span class="ellipsis" title="Renewal Count(Tm)" style="color:black;">
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
							<div class="col-6 col-md-2 col-lg-4 mb-2">
								<div class="widget number-widget-box show-card-popup" data-type="renewal_amount" data-widget-name="Renewal Amount(Tm)" data-method="get_renewal_amount_tm">
									<div class="widget-head">
										<div class="widget-label">
											<div class="widget-title">
												<span class="ellipsis" title="Renewal Amount(Tm)" style="color:black;">
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
							<div class="col-6 col-md-2 col-lg-4 mb-2">
								<div class="widget number-widget-box show-card-popup" data-type="profit_amount" data-widget-name="Profit Amount(Tm)" data-method="get_profit_amount_tm">
									<div class="widget-head">
										<div class="widget-label">
											<div class="widget-title">
												<span class="ellipsis" title="Profit Amount(Tm)" style="color:black;">
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

					<div class="col-12 col-md-6 col-lg-3 mb-1">
						<div class="card1 card1-flush w-100 h-100 lg-100 ">
							<div class="card1-header">
								<div class="widget-title d-flex1 flex-column1">
									<span class="ellipsis pt-1 fs-6">Brand Wise Sales</span>
								</div>
							</div>
							<div class="card1-body" style="height:auto;">
								<div class="show-card-popup11" data-type="sales_by_brand" data-widget-name="Brand Wise Sales" data-method="get_brand_wise_data_lw">
									<div id="brand_donut_chart_lw"></div>
								</div>
							</div>
						</div>
					</div>

					<div class="col-12 col-md-6 col-lg-3 mb-1">
						<div class="card1 card1-flush w-100 h-100 lg-100">
							<div class="card1-header">
								<div class="widget-title d-flex1 flex-column1">
									<span class="pt-1 fs-6 ellipsis">Item Group Wise Sales</span>
								</div>	
							</div>
							<div class="card1-body" style="height:auto;">
								<div class="show-card-popup11" data-type="item_group_wise_sales" data-widget-name="Item Group Wise Sales" data-method="get_item_group_wise_data_lw">
									<div id="item_group_donut_chart_lw"></div>
								</div>
							</div>
						</div>
					</div>

					<div class="col-12 col-md-12 col-lg-12 col-xl-12 mt-3 mb-3" id="widget-container" style="display:none;">
						<div class="card p-2">
							<div class="d-flex align-items-center justify-content-between mb-3 flex-nowrap">
								<h5 class="mb-0 me-3" id="widget-title">Data</h5>
								<div class="filter-section-responsive" id="filter-section1">
									<!-- Sales Stage -->
									<div class="custom-dropdown-wrapper">
										<div class="select-btn" id="sales-stage1" data-label="Sales Stage">
											<span class="btn-text">Sales Stage</span>
											<span class="arrow-dwn"><i class="fa-solid fa-chevron-down"></i></span>
										</div>
										<div class="list-items">
											<div class="search-box">
												<input type="text" placeholder="Search..." class="search-input" data-target="sales-stage1">
											</div>
											<ul class="items-list" id="itemsList-sales-stage1"></ul>
										</div>
									</div>

									<!-- Opportunity Type -->
									<div class="custom-dropdown-wrapper">
										<div class="select-btn" id="opportunity-type1" data-label="Opportunity Type">
											<span class="btn-text">Opportunity Type</span>
											<span class="arrow-dwn"><i class="fa-solid fa-chevron-down"></i></span>
										</div>
										<div class="list-items">
											<div class="search-box">
												<input type="text" placeholder="Search..." class="search-input" data-target="opportunity-type1">
											</div>
											<ul class="items-list" id="itemsList-opportunity-type1"></ul>
										</div>
									</div>

									<!-- Item Group -->
									<div class="custom-dropdown-wrapper">
										<div class="select-btn" id="item-group-filter1" data-label="Item Group">
											<span class="btn-text">Item Group</span>
											<span class="arrow-dwn"><i class="fa-solid fa-chevron-down"></i></span>
										</div>
										<div class="list-items">
											<div class="search-box">
												<input type="text" placeholder="Search..." class="search-input" data-target="item-group-filter1">
											</div>
											<ul class="items-list" id="itemsList-item-group-filter1"></ul>
										</div>
									</div>

									<!-- Brand -->
									<div class="custom-dropdown-wrapper">
										<div class="select-btn" id="brand-filter1" data-label="Brand">
											<span class="btn-text">Brand</span>
											<span class="arrow-dwn"><i class="fa-solid fa-chevron-down"></i></span>
										</div>
										<div class="list-items">
											<div class="search-box">
												<input type="text" placeholder="Search..." class="search-input" data-target="brand-filter1">
											</div>
											<ul class="items-list" id="itemsList-brand-filter1"></ul>
										</div>
									</div>
								</div>
							</div>


							

							<div id="widget-table-container">
								<table class="table">
									<thead id="widget-table-head"></thead>
									<tbody id="widget-table-body"></tbody>
								</table>
							</div>


						</div>
					</div>

				</div>

				<div class="row mt-2" style="border-radius:10px;background-color:#F3F3F3;">
					<div class="d-flex align-items-center justify-content-between mb-3 flex-nowrap">
						<div class="title5">Sales By Period</div>
						<div class="d-flex flex-wrap align-items-center ms-auto gap-2 mb-2 mt-2">
							<div class="custom-dropdown-wrapper" style="width:130px;">
								<div class="select-btn" id="sales-stage9" data-label="Sales Stage">
									<span class="btn-text">Sales Stage</span>
									<span class="arrow-dwn"><i class="fa-solid fa-chevron-down"></i></span>
								</div>
								<div class="list-items">
									<div class="search-box">
										<input type="text" placeholder="Search..." class="search-input" data-target="sales-stage9">
									</div>
									<ul class="items-list" id="itemsList-sales-stage9"></ul>
								</div>
							</div>

							<select id="time-filter5" class="form-select form-select-sm me-2" style="width:130px;">
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
							<div id="custom-date-fields5" class="d-flex flex-wrap align-items-center ms-2 hidden">
								<input type="text" id="from-date-display5" class="form-control form-control-sm me-2"
									placeholder="From Date" readonly style="width:130px; cursor: pointer;background-color:white;">
								<input type="text" id="to-date-display5" class="form-control form-control-sm"
									placeholder="To Date" readonly style="width:130px; cursor: pointer;background-color:white;">

								<input type="date" id="from-date5" class="real-date" style="position: absolute; opacity: 0; pointer-events: none;">
								<input type="date" id="to-date5" class="real-date" style="position: absolute; opacity: 0; pointer-events: none;">
							</div>
							<select id="periodicity" class="form-select form-select-sm me-2" style="width:130px;">
								<option value="daily">Daily</option>
								<option value="weekly">Weekly</option>
								<option value="monthly" selected>Monthly</option>
								<option value="quarterly">Quarterly</option>
								<option value="yearly">Yearly</option>
							</select>

						</div>
					</div>	
					<div class="col-12 col-md-12 col-lg-12 mb-3">
						<div class="card1 card1-flush w-100 h-100 lg-100 ">
							<div class="card1-header">
								<div class="widget-title d-flex1 flex-column1">
									<span class="ellipsis pt-1 fs-6">Opportunities</span>
								</div>
							</div>
							<div class="card1-body" style="height:auto;">
								<div>
									<div id="opp-bar-chart"></div>
								</div>
							</div>
						</div>
					</div>	

					

					<div class="col-12 col-md-12 col-lg-12 col-xl-12 mt-3 mb-3" id="widget-container8" style="display:none;">
						<div class="card p-2">
							<div class="d-flex align-items-center justify-content-between mb-3 flex-nowrap">
								<h5 class="mb-0 me-3" id="widget-title8">Data</h5>
								<div class="filter-section-responsive" id="filter-section8">
									<div class="custom-dropdown-wrapper" style="width:130px;">
										<div class="select-btn" id="sales-stage8" data-label="Sales Stage">
											<span class="btn-text">Sales Stage</span>
											<span class="arrow-dwn"><i class="fa-solid fa-chevron-down"></i></span>
										</div>
										<div class="list-items">
											<div class="search-box">
												<input type="text" placeholder="Search..." class="search-input" data-target="sales-stage8">
											</div>
											<ul class="items-list" id="itemsList-sales-stage8"></ul>
										</div>
									</div>

									<!-- Opportunity Type -->
									<div class="custom-dropdown-wrapper">
										<div class="select-btn" id="opportunity-type8" data-label="Opportunity Type">
											<span class="btn-text" >Opportunity Type</span>
											<span class="arrow-dwn"><i class="fa-solid fa-chevron-down"></i></span>
										</div>
										<div class="list-items">
											<div class="search-box">
												<input type="text" placeholder="Search..." class="search-input" data-target="opportunity-type8">
											</div>
											<ul class="items-list" id="itemsList-opportunity-type8"></ul>
										</div>
									</div>
									<!-- Item Group -->
									<div class="custom-dropdown-wrapper">
										<div class="select-btn" id="item-group-filter8" data-label="Item Group">
											<span class="btn-text">Item Group</span>
											<span class="arrow-dwn"><i class="fa-solid fa-chevron-down"></i></span>
										</div>
										<div class="list-items">
											<div class="search-box">
												<input type="text" placeholder="Search..." class="search-input" data-target="item-group-filter8">
											</div>
											<ul class="items-list" id="itemsList-item-group-filter8"></ul>
										</div>
									</div>

									<!-- Brand -->
									<div class="custom-dropdown-wrapper">
										<div class="select-btn" id="brand-filter8" data-label="Brand">
											<span class="btn-text">Brand</span>
											<span class="arrow-dwn"><i class="fa-solid fa-chevron-down"></i></span>
										</div>
										<div class="list-items">
											<div class="search-box">
												<input type="text" placeholder="Search..." class="search-input" data-target="brand-filter8">
											</div>
											<ul class="items-list" id="itemsList-brand-filter8"></ul>
										</div>
									</div>
								</div>
							</div>


							<div id="widget-table-container">
								<table class="table">
									<thead></thead>
									<tbody id="widget-data-table8"></tbody>
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
							<div id="custom-date-fields2" class="d-flex flex-wrap align-items-center ms-2 hidden">
								<input type="text" id="from-date-display2" class="form-control form-control-sm me-2"
									placeholder="From Date" readonly style="width:130px; cursor: pointer;background-color:white;">
								<input type="text" id="to-date-display2" class="form-control form-control-sm"
									placeholder="To Date" readonly style="width:130px; cursor: pointer;background-color:white;">

								<input type="date" id="from-date2" class="real-date" style="position: absolute; opacity: 0; pointer-events: none;">
								<input type="date" id="to-date2" class="real-date" style="position: absolute; opacity: 0; pointer-events: none;">
							</div>
						</div>
					</div>					

					<div class="col-12 col-md-6 col-lg-6">
						<div class="row box3 mb-2 ms-1 mt-1 me-1">
							<div class="widget number-widget-box show-card-popup2" data-type="lost_count" data-widget-name="Lost Rnwls(Lw)"
							data-method="get_rnwls_lost_count">
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
							<div class="widget number-widget-box show-card-popup2" data-type="new_opp_count" data-widget-name="Rnwls New Opp(Lw)"
							data-method="get_rnwls_new_opp_count">
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

							<div class="widget number-widget-box show-card-popup2" data-type="renewed_count" data-widget-name="Rnwls Renewed(Lw)"
							data-method="get_rnwls_renewed_count">
								<div class="widget-head">
									<div class="widget-label">
										<div class="widget-title">
											<span class="ellipsis" title="Rnwls Renewed(Lw)" style="color:black;">
												Renewed
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


					<div class="col-12 col-md-6 col-lg-6">
						<div class="row mb-2 ms-1 mt-1 me-1" style="width:100%;height:150px;">
							<div class="widget">
								<div class="wiget-head">
									<div class="wiget-label">
										<div class="widget-title">
											<span class="ellipsis" title="Renewals status Count" style="color:black;">Renewals Status Count</span>
										</div>
									</div>
								</div>
								<div class="widget-body" style="width:100%;height:120px;">
									<canvas id="rnwls-line-chart" style="height: 100% !important; width: 100% !important;"></canvas>
								</div>
							</div>
						</div>
					</div>
					

					<div class="col-12 col-md-12 col-lg-12 col-xl-12 mt-3 mb-3" id="widget-container2" style="display:none;">
						<div class="card p-2">
							<div class="d-flex align-items-center justify-content-between mb-3 flex-nowrap">
								<h5 class="mb-0 me-3" id="widget-title2">Data</h5>
								<div class="filter-section-responsive" id="filter-section2">
									<!-- Item Group -->
									<div class="custom-dropdown-wrapper">
										<div class="select-btn" id="item-group-filter2" data-label="Item Group">
											<span class="btn-text">Item Group</span>
											<span class="arrow-dwn"><i class="fa-solid fa-chevron-down"></i></span>
										</div>
										<div class="list-items">
											<div class="search-box">
												<input type="text" placeholder="Search..." class="search-input" data-target="item-group-filter2">
											</div>
											<ul class="items-list" id="itemsList-item-group-filter2"></ul>
										</div>
									</div>

									<!-- Brand -->
									<div class="custom-dropdown-wrapper">
										<div class="select-btn" id="brand-filter2" data-label="Brand">
											<span class="btn-text">Brand</span>
											<span class="arrow-dwn"><i class="fa-solid fa-chevron-down"></i></span>
										</div>
										<div class="list-items">
											<div class="search-box">
												<input type="text" placeholder="Search..." class="search-input" data-target="brand-filter2">
											</div>
											<ul class="items-list" id="itemsList-brand-filter2"></ul>
										</div>
									</div>
								</div>
							</div>


							<div id="widget-table-container">
								<table class="table">
									<thead></thead>
									<tbody id="widget-data-table2"></tbody>
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
						<div class="col-12 col-md-3 col-lg-3 col-xl-2 mt-2 chart-column">
							<div class="card1">
								<div class="card1-header">
									<div class="widget-title d-flex1 flex-column1">
										<span class="ellipsis pt-1 fs-6"><a class="sales-link" data-base-url="http://192.168.23.185:8000/app/query-report/Target%20Details%20Based%20On%20Invoice?company=64+Network+Security+Pvt+Ltd+-+TG&timespan=this+year&fiscal_year=2025-2026&from_date=2023-04-01&to_date=2024-03-31&group_by=Sales+Person" target="_blank" class="title2">Overall</a></span>
									</div>
								</div>
								<div class="card1-body">
									<canvas id="salesgrowthChartYear" class="pl-2 pr-2"></canvas>
								</div>
							</div>
						</div>

						<div class="col-12 col-md-9 col-lg-9 col-xl-10 mb-1 target-column">
							<div class="mt-2 mb-1" style="background-color:#FFFFFF;border-radius:10px;">
								<div class="title1 pl-2">Monthly Performance</div>
								<div class="h-lg-100 h-100" id="sales-target-overview" style="width: 100%;"></div>
							</div>
						</div>
						
					</div>

					<div class="row mt-2" style="border-radius:10px;background-color:#F3F3F3">
						<div class="col-12 col-md-6 col-lg-2 col-xl-2 mb-1 cards-column">
							<div class="row">
								<div class="col-12 col-md-12 col-lg-12 mt-1">
									<div class="widget number-widget-box" data-widget-name="Target">
										<div class="widget-head">
											<div class="widget-label">
												<div class="widget-title">
													<span class="ellipsis" title="Target">
														<a class="sales-link" data-base-url="http://192.168.23.185:8000/app/query-report/Target%20Details%20Based%20On%20Invoice?company=64+Network+Security+Pvt+Ltd+-+TG&timespan=this+month&fiscal_year=2025-2026&from_date=2023-04-01&to_date=2024-03-31&group_by=Sales+Person" target="_blank">Target(TM)</a>
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
														<a class="sales-link" data-base-url="http://192.168.23.185:8000/app/query-report/Target%20Details%20Based%20On%20Invoice?company=64+Network+Security+Pvt+Ltd+-+TG&timespan=this+month&fiscal_year=2025-2026&from_date=2023-04-01&to_date=2024-03-31&group_by=Sales+Person" target="_blank">Achieved(TM)</a>
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
														<a class="sales-link" data-base-url="http://192.168.23.185:8000/app/query-report/Target%20Details%20Based%20On%20Invoice?company=64+Network+Security+Pvt+Ltd+-+TG&timespan=this+month&fiscal_year=2025-2026&from_date=2023-04-01&to_date=2024-03-31&group_by=Sales+Person" target="_blank">Achieved %(TM)</a>
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

						<div class="col-12 col-md-6 col-lg-3 col-xl-2 mt-2 salesgrowthchart-column">
							<div class="card1">
								<div class="card1-header">
									<div class="widget-title d-flex1 flex-column1">
										<span class="ellipsis pt-1 fs-6"><a class="sales-link" data-base-url="http://192.168.23.185:8000/app/query-report/Target%20Details%20Based%20On%20Invoice?company=64+Network+Security+Pvt+Ltd+-+TG&timespan=this+month&fiscal_year=2025-2026&from_date=2023-04-01&to_date=2024-03-31&group_by=Sales+Person" target="_blank" class="title2" style="font-weight:bold;">This Month</a></span>
									</div>
								</div>
								<div class="card1-body">
									<canvas id="salesgrowthChart" class="pl-2 pr-2"></canvas>
								</div>
							</div>
						</div>

						<div class="col-12 col-md-12 col-lg-7 col-xl-8 target-category-wise-chart-col">
							<div class="mt-2 mb-1" style="background-color:#FFFFFF;border-radius:10px;">
								<div class="title1 pl-2"><a class="sales-link" data-base-url="http://192.168.23.185:8000/app/query-report/Target%20Details%20Based%20On%20Invoice?company=64+Network+Security+Pvt+Ltd+-+TG&timespan=this+month&fiscal_year=2025-2026&from_date=2023-04-01&to_date=2024-03-31&group_by=Sales+Person" target="_blank"> Category Wise Performance(TM)</a></div>
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
													<td colspan="3" style="font-size:14px;font-weight:bold;color:#012739;"><a class="sales-link" data-base-url="http://192.168.23.185:8000/app/query-report/Target%20Details%20Based%20On%20Invoice?company=64+Network+Security+Pvt+Ltd+-+TG&timespan=this+month&fiscal_year=2025-2026&from_date=2023-04-01&to_date=2024-03-31&group_by=Sales+Person" target="_blank">This Month</a></td>
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
													<a class="sales-link" data-base-url="http://192.168.23.185:8000/app/query-report/Target%20Details%20Based%20On%20Invoice?company=64+Network+Security+Pvt+Ltd+-+TG&timespan=this+quarter&fiscal_year=2025-2026&from_date=2023-04-01&to_date=2024-03-31&group_by=Sales+Person" target="_blank">This Quarter</a></td>
												</tr>
											</thead>
											<tbody>
												<tr>
													<th class="col-4" style="font-weight:bold;">
													<a class="sales-link" data-base-url="http://192.168.23.185:8000/app/query-report/Target%20Details%20Based%20On%20Invoice?company=64+Network+Security+Pvt+Ltd+-+TG&timespan=this+quarter&fiscal_year=2025-2026&from_date=2023-04-01&to_date=2024-03-31&group_by=Sales+Person" target="_blank">Target</a>
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
													<td colspan="3" style="font-size:14px;font-weight:bold;color:#012739;"><a class="sales-link" data-base-url="http://192.168.23.185:8000/app/query-report/Target%20Details%20Based%20On%20Invoice?company=64+Network+Security+Pvt+Ltd+-+TG&timespan=this+year&fiscal_year=2025-2026&from_date=2023-04-01&to_date=2024-03-31&group_by=Sales+Person" target="_blank">This Year</a></td>
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
								<div class="title1 pl-2"><a class="sales-link" data-base-url="http://192.168.23.185:8000/app/query-report/Target%20Details%20Based%20On%20Invoice?company=64+Network+Security+Pvt+Ltd+-+TG&timespan=this+year&fiscal_year=2025-2026&from_date=2023-04-01&to_date=2024-03-31&group_by=Sales+Person" target="_blank"> Category Wise Performance (Overall)</a></div>
								<div id="target-category-wise-overall"></div>
							</div>
						</div>

					</div>
				</div>	

				<div class="row" style="height:50px;"></div>

			</div>	

			<div class="tab-pane fade" id="activity-target-content" role="tabpanel" aria-labelledby="activity-target-tab">
				<div class="mb-4 text-center">
					<button class="btn btn-sm title1" style="background-color:#e4e6ef;color:black;font-weight:bold;">
						Activity Dashboard
					</button>
				</div>
				<div class="row" style="background-color:#f3f3f3;border-radius:10px;padding:5px;margin:5px;">
					<div class="col-12 col-md-12 col-lg-6 col-xl-6">
						<div class="box2 row" style="border-radius:10px;padding:5px;">
							<div class="widget number-widget-box mb-4" data-widget-name="Lead(lw)">
								<div class="widget-head">
									<div class="widget-label">
										<div class="widget-title">
											<span class="ellipsis" title="Lead(lw)">
												<a class="sales-link2" data-base-url="http://192.168.23.185:8000/app/lead" target="_blank">
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

							<div class="widget number-widget-box hidden" data-widget-name="Quoted(lw)">
								<div class="widget-head">
									<div class="widget-label">
										<div class="widget-title">
											<span class="ellipsis" title="Quoted(lw)">
												<a class="sales-link1" data-base-url="http://192.168.23.185:8000/app/opportunity?status=Quotation" target="_blank">
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
												<a class="sales-link1" data-base-url="http://192.168.23.185:8000/app/opportunity?sales_stage=POC%2FDemos%2FWebinar%2FSession" target="_blank">
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
												<a class="sales-link1" data-base-url="http://192.168.23.185:8000/app/customer" target="_blank">
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
												<a class="sales-link2" data-base-url="http://192.168.23.185:8000/app/appointment" target="_blank">
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
												<a>
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
												<a class="sales-link1" data-base-url="http://192.168.23.185:8000/app/call-list" target="_blank">
												Calls(lw)
												</a>
											</span>
										</div>
									</div>
								</div>
								<div class="widget-body">
									<div class="widget-content">
										<div class="number ellipsis blue" id="calls-count">0</div>
									</div>
								</div>
							</div>

							<div class="widget number-widget-box" data-widget-name="Trainings(lw)">
								<div class="widget-head">
									<div class="widget-label">
										<div class="widget-title">
											<span class="ellipsis" title="Trainings(lw)">
												<a>
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
												<a>
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
					</div>
					
					<div class="col-12 col-md-12 col-lg-6 col-xl-6">
						<div style="width:100%; height:180px; border-radius:10px; padding:5px; overflow: hidden;">
							<div class="widget number-widget-box h-100" data-widget-name="last week activity" style="height: 100%;">
								<div class="widget-head">
									<div class="widget-label">
										<div class="d-flex gap-3 align-items-center mt-1 justify-content-center flex-wrap">
											<label class="d-flex align-items-center gap-1">
												<span style="display:inline-block; width:12px; height:12px; background-color:green; border-radius:2px;"></span>
												<span>Customers</span>
												<span style="display:inline-block; width:12px; height:12px; background-color:blue; border-radius:2px;"></span>
												<span>Appointments</span>
												<span style="display:inline-block; width:12px; height:12px; background-color:yellow; border-radius:2px;"></span>
												<span>Calls</span>
											</label>
										</div>
									</div>
								</div>
								<div class="widget-body" style="height: 120px;">
									<canvas id="last-week-line-graph" style="height: 100% !important; width: 100% !important;"></canvas>
								</div>
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
														<a>Target</a>
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
									<div class="widget number-widget-box show-card-popup6" data-type="calls_achieved_(tm)" data-widget-name="Calls Achieved" data-method="get_calls_achieved_tm">
										<div class="widget-head">
											<div class="widget-label">
												<div class="widget-title">
													<span class="ellipsis" title="Calls Achieved" style="text-align:center">
														<a>Achieved</a>
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
														<a>Achieved%</a>
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
														<a>Target</a>
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
									<div class="widget number-widget-box show-card-popup6" data-type="appointment_achieved_(tm)" data-widget-name="Appointments Achieved" data-method="get_appointment_achieved_tm">
										<div class="widget-head">
											<div class="widget-label">
												<div class="widget-title">
													<span class="ellipsis" title="Appointments Achieved" style="text-align:center">
														<a>Achieved</a>
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
														<a>Achieved%</a>
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
														<a>Target</a>
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
									<div class="widget number-widget-box show-card-popup6" data-type="demo_achieved_(tm)"  data-widget-name="Demos Achieved" data-method="get_demos_achieved_tm">
										<div class="widget-head">
											<div class="widget-label">
												<div class="widget-title">
													<span class="ellipsis" title="Demos Achieved" style="text-align:center">
														<a>Achieved</a>
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
														<a>Achieved%</a>
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
														<a>Target</a>
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
									<div class="widget number-widget-box show-card-popup6" data-type="leads_achieved_(tm)" data-widget-name="Leads Achieved" data-method="get_leads_achieved_tm">
										<div class="widget-head">
											<div class="widget-label">
												<div class="widget-title">
													<span class="ellipsis" title="Leads Achieved" style="text-align:center">
														<a>Achieved</a>
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
														<a>Achieved%</a>
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
														<a>Target</a>
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
														<a >Achieved</a>
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
														<a>Achieved%</a>
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
														<a>Target</a>
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
														<a>Achieved</a>
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
														<a>Achieved%</a>
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

					<div class="col-12 col-md-12 col-lg-12 col-xl-12 mt-3 mb-3" id="widget-container6" style="display:none;">
						<div class="card p-2">
							<div class="d-flex align-items-center justify-content-between mb-3 flex-nowrap">
								<h5 class="mb-0 me-3" id="widget-title6">Data</h5>
							</div>

							<div id="widget-table-container">
								<table class="table">
									<thead></thead>
									<tbody id="widget-data-table6"></tbody>
								</table>
							</div>
						</div>
					</div>

				</div>

				<div class="row" style="height:50px;"></div>
			</div>

			<!-- sales stage Tab Content -->
			<div class="tab-pane fade" id="sales-stage-content" role="tabpanel" aria-labelledby="sales-stage-tab">
				<!-- Time Filter -->
				<div class="row mb-4">
					<div class="mb-4 text-center">
						<button class="btn btn-sm title1" style="background-color:#e4e6ef;color:black;font-weight:bold;">Sales Stage Dashboard</button>
					</div>
					<div class="row mb-5 align-items-stretch" style="background-color:#f3f3f3;border-radius:10px;">
						<div class="col-12 d-flex justify-content-between align-items-center flex-wrap p-2">
							<div class="title1 fw-bold">Sales stages</div>
							<div class="d-flex flex-wrap align-items-center">
								<select id="time-filter" class="form-select form-select-sm me-2" style="width:130px;">
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
					
						<div class="col-12 col-md-12 col-lg-6 col-xl-6 mb-4">
							<div id="sales-stage-cards" class="box1"></div>
						</div>
						
						
						<div class="col-12 col-md-6 col-lg-3 col-xl-3 mb-4">
							<div class="card h-100 d-flex flex-column justify-content-between" style="background:white;">
								<div class="card-head p-2">Item Group Wise Data</div>
								<div class="chart-wrapper d-flex align-items-center justify-content-center flex-grow-1">
									<canvas id="donut-item-group" style="max-height:180px;"></canvas>
								</div>
							</div>
						</div>

						<div class="col-12 col-md-6 col-lg-3 col-xl-3 mb-4">
							<div class="card h-100 d-flex flex-column justify-content-between" style="background:white;">
								<div class="card-head p-2">Brand Wise Data</div>
								<div class="chart-wrapper d-flex align-items-center justify-content-center flex-grow-1">
									<canvas id="donut-brand" style="max-height:180px;"></canvas>
								</div>
							</div>
						</div>


					</div>

					<!-- Opportunities Table -->
					<div id="opportunity-table-container" class="row mt-3 mb-3" style="background-color:#F3F3F3;border-radius:10px; display: none;">
						<div class="col-12 d-flex flex-wrap justify-content-end align-items-center mt-2">
							<div class="filter-section-responsive" id="filter-section">
								<div class="custom-dropdown-wrapper">
									<div class="select-btn" id="opportunity-type">
										<span class="btn-text">Opportunity Type</span>
										<span class="arrow-dwn"><i class="fa-solid fa-chevron-down"></i></span>
									</div>
									<div class="list-items">
										<div class="search-box">
											<input type="text" placeholder="Search..." class="search-input" data-target="opportunity-type">
										</div>
										<ul class="items-list" id="itemsList-opportunity-type"></ul>
									</div>
								</div>
								<div class="custom-dropdown-wrapper">
									<div class="select-btn" id="item-group-filter">
										<span class="btn-text">Item Group</span>
										<span class="arrow-dwn"><i class="fa-solid fa-chevron-down"></i></span>
									</div>
									<div class="list-items">
										<div class="search-box">
											<input type="text" placeholder="Search..." class="search-input" data-target="item-group-filter">
										</div>
										<ul class="items-list" id="itemsList-item-group-filter"></ul>
									</div>
								</div>
								<div class="custom-dropdown-wrapper">
									<div class="select-btn" id="brand-filter">
										<span class="btn-text">Brand</span>
										<span class="arrow-dwn"><i class="fa-solid fa-chevron-down"></i></span>
									</div>
									<div class="list-items">
										<div class="search-box">
											<input type="text" placeholder="Search..." class="search-input" data-target="brand-filter">
										</div>
										<ul class="items-list" id="itemsList-brand-filter"></ul>
									</div>
								</div>
							</div>
						</div>
					
						<div class="col-12 p-2">
							<div style="height:100%;max-height:300px;overflow-y: auto;overflow-x: auto; border: 1px solid #dee2e6; border-radius: 5px;">
								<table id="opportunities-table" class="table table-bordered w-100 mb-0"></table>
							</div>
						</div>

						
						<div class="list-paging-area level mb-2" style="padding:5px">
							<div class="level-left">
								<div class="btn-group">
									<button class="btn btn-sm b1 mr-2" data-count="20">20</button>
									<button class="btn btn-sm bl mr-2" data-count="100">100</button>
									<button class="btn btn-sm b1 mr-2" data-count="500">500</button>
									<button class="btn btn-sm b1" data-count="1500">1500</button>
								</div>
							</div>	
							<div class="level-right">
								<button class="btn btn-sm" id="load-more-btn">Load More</button>
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
								<div class="widget number-widget-box show-card-popup4" data-type="opp_count_(tw)" data-widget-name="Opp Count(Tw)" data-method="get_closure_opp_count_tw">
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
								<div class="widget number-widget-box show-card-popup4" data-type="opp_amount_(tw)" data-widget-name="Opp Amount(Tw)" data-method="get_closure_opp_amount_tw">
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
								<div class="widget number-widget-box show-card-popup4" data-type="rnwls_count_(tw)" data-widget-name="Rnwl Count(Tw)" data-method="get_closures_rnwls_count_tw">
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
								<div class="widget number-widget-box show-card-popup4" data-type="rnwl_amount_(tw)"  data-widget-name="Rnwl Amount(Tw)" data-method="get_closures_rnwls_amount_tw">
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
												<span class="ellipsis pt-1 fs-6">Brand Wise Sales (TW)</span>
											</div>
										</div>
										<div class="card1-body" style="height:auto;">
											<div id="brand_donut_chart_tw"></div>
										</div>
									</div>	
								</div>
							</div>	
							<div class="col-12 col-md-6 col-lg-6">
								<div class="card1 card1-flush w-100 h-100 lg-100">
									<div class="card1-header">
										<div class="widget-title d-flex1 flex-column1">
											<span class="ellipsis pt-1 fs-6">Item Group Wise Sales (TW)</span>
										</div>
									</div>
									<div class="card1-body" style="height:auto;">
										<div id="item_group_donut_chart_tw"></div>
									</div>
								</div>
							</div>
						</div>

					</div>
					<div class="col-12 col-md-6 col-lg-6 mb-1">
						<div class="title1">This Month</div>
						<div class="row">
							<div class="col-6 mb-2">
								<div class="widget number-widget-box show-card-popup4" data-type="opp_count_(tm)" data-widget-name="Opp Count(TM)" data-method="get_closure_opp_count_tm">
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
								<div class="widget number-widget-box show-card-popup4" data-type="opp_amount_(tm)" data-widget-name="Opp Amount(TM)" data-method="get_closure_opp_amount_tm">
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
								<div class="widget number-widget-box show-card-popup4" data-type="rnwls_count_(tm)" data-widget-name="Rnwl Count(TM)" data-method="get_closures_rnwls_count_tm">
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
								<div class="widget number-widget-box show-card-popup4" data-type="rnwls_amount_(tm)" data-widget-name="Rnwl Amount(TM)" data-method="get_closures_rnwls_amount_tm">
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
											<span class="ellipsis pt-1 fs-6">Brand Wise Sales (TM)</span>
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
											<span class="ellipsis pt-1 fs-6">Item Group Wise Sales (TM)</span>
										</div>
									</div>
									<div class="card1-body" style="height:auto;">
										<div id="item_group_donut_chart_tm"></div>
									</div>
								</div>
							</div>
						</div>	
					</div>
					<div class="col-12 col-md-12 col-lg-12 col-xl-12 mt-3 mb-3" id="widget-container4" style="display:none;">
						<div class="card p-2">
							<div class="d-flex align-items-center justify-content-between mb-3 flex-nowrap">
								<h5 class="mb-0 me-3" id="widget-title4">Data</h5>
								<div class="filter-section-responsive" id="filter-section5">
									<!-- Sales Stage -->
									<div class="custom-dropdown-wrapper">
										<div class="select-btn" id="sales-stage4" data-label="Sales Stage">
											<span class="btn-text">Sales Stage</span>
											<span class="arrow-dwn"><i class="fa-solid fa-chevron-down"></i></span>
										</div>
										<div class="list-items">
											<div class="search-box">
												<input type="text" placeholder="Search..." class="search-input" data-target="sales-stage4">
											</div>
											<ul class="items-list" id="itemsList-sales-stage4"></ul>
										</div>
									</div>

									<!-- Opportunity Type -->
									<div class="custom-dropdown-wrapper">
										<div class="select-btn" id="opportunity-type4" data-label="Opportunity Type">
											<span class="btn-text">Opportunity Type</span>
											<span class="arrow-dwn"><i class="fa-solid fa-chevron-down"></i></span>
										</div>
										<div class="list-items">
											<div class="search-box">
												<input type="text" placeholder="Search..." class="search-input" data-target="opportunity-type4">
											</div>
											<ul class="items-list" id="itemsList-opportunity-type4"></ul>
										</div>
									</div>

									<!-- Item Group -->
									<div class="custom-dropdown-wrapper">
										<div class="select-btn" id="item-group-filter4" data-label="Item Group">
											<span class="btn-text">Item Group</span>
											<span class="arrow-dwn"><i class="fa-solid fa-chevron-down"></i></span>
										</div>
										<div class="list-items">
											<div class="search-box">
												<input type="text" placeholder="Search..." class="search-input" data-target="item-group-filter4">
											</div>
											<ul class="items-list" id="itemsList-item-group-filter4"></ul>
										</div>
									</div>

									<!-- Brand -->
									<div class="custom-dropdown-wrapper">
										<div class="select-btn" id="brand-filter4" data-label="Brand">
											<span class="btn-text">Brand</span>
											<span class="arrow-dwn"><i class="fa-solid fa-chevron-down"></i></span>
										</div>
										<div class="list-items">
											<div class="search-box">
												<input type="text" placeholder="Search..." class="search-input" data-target="brand-filter4">
											</div>
											<ul class="items-list" id="itemsList-brand-filter4"></ul>
										</div>
									</div>
								</div>
							</div>


							<div id="widget-table-container">
								<table class="table">
									<thead></thead>
									<tbody id="widget-data-table4"></tbody>
								</table>
							</div>
						</div>
					</div>
				</div>

				<div class="row" style="min-height:50px;"></div>

			</div>

			



		</div>	

		
		<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
		<!-- Bootstrap 5 CSS CDN -->
	
		<script src="https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/js/select2.min.js"></script>
	`
};