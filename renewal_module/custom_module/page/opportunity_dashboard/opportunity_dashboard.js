// frappe.pages['opportunity-dashboard'].on_page_load = function(wrapper) {
// 	var page = frappe.ui.make_app_page({
// 		parent: wrapper,
// 		title: 'Opportunity Dashboard',
// 		single_column: true
// 	});

// 	wrapper.opp_dash = new erpnext.OpportunityDashboard(wrapper);

// 	frappe.breadcrumbs.add("Selling");
// }


// erpnext.OpportunityDashboard = class OpportunityDashboard {
// 	constructor(wrapper) {
// 		var me = this;
// 		// 0 setTimeout hack - this gives time for canvas to get width and height
// 		setTimeout(function () {
// 			me.setup(wrapper);
// 			me.get_data();
// 		}, 0);
// 	}

// 	setup(wrapper) {
// 		var me = this;

// 		(this.sales_person_field = wrapper.page.add_field({
// 			fieldtype: "Link",
// 			fieldname: "sales_person",
// 			options: "Sales Person",
// 			label: __("Sales Person"),
// 			reqd: 1,
// 			// default: "",
// 			change: function () {
// 				var email_user=frappe.user_info().email;
//             // console.log(email_user);
//             frappe.model.get_value('Employee',{'user_id':email_user},['employee_name','cell_number'],function(d){
//                 // console.log(d);
                
                
//             frappe.model.get_value('Sales Person',{'employee':d.name},['name','parent_sales_person'],function(s){
            
// 			me.sales_person = s.name ;
// 			me.get_data();
    		
    		
    		
//                 });
            
//              });
				
// 			},

// 			default: (function() {
// 				var email_user = frappe.user_info().email;
				
// 				// Query Employee doctype using the logged-in user's email to get the employee record
// 				var default_sales_person = null;
// 				frappe.model.get_value('Employee', {'user_id': email_user}, ['name'], function(d) {
// 					if (d) {
// 						// Once we have the employee record, fetch the associated Sales Person
// 						frappe.model.get_value('Sales Person', {'employee': d.name}, ['name', 'parent_sales_person'], function(s) {
// 							if (s) {
// 								default_sales_person = s.name; // Set the default sales person
// 								me.sales_person_field.set_value(default_sales_person); // Set the value of the field
// 							}
// 						});
// 					}
// 				});
// 				return default_sales_person; // Return the default sales person value
// 			})()
// 		})),
			
// 		(this.elements = {
// 				layout: $(wrapper).find(".layout-main"),
// 				// from_date: wrapper.page.add_date(__("From Date")),
// 				// to_date: wrapper.page.add_date(__("To Date")),
// 				chart: wrapper.page.add_select(__("Chart"), [
// 					{ value: "sales_funnel", label: __("Sales Funnel") },
// 					{ value: "sales_pipeline", label: __("Sales Pipeline") },
// 					{ value: "opp_by_utm_source", label: __("Opportunities by Source") },
// 					{ value: "opp_by_utm_campaign", label: __("Opportunities by Campaign") },
// 					{ value: "opp_by_utm_medium", label: __("Opportunities by Medium") },
// 				]),
// 				refresh_btn: wrapper.page.set_primary_action(
// 					__("Refresh"),
// 					function () {
// 						me.get_data();
// 					},
// 					"fa fa-refresh"
// 				),
// 			});

// 		this.elements.no_data = $('<div class="alert alert-warning">' + __("No Data") + "</div>")
// 			.toggle(false)
// 			.appendTo(this.elements.layout);

// 		this.elements.funnel_wrapper = $('<div class="funnel-wrapper text-center"></div>').appendTo(
// 			this.elements.layout
// 		);

// 		this.sales_person = "Geetha Pudi";
// 		this.options = {
// 			// from_date: frappe.datetime.add_months(frappe.datetime.get_today(), -1),
// 			// to_date: frappe.datetime.get_today(),
// 			chart: "sales_funnel",
// 		};

// 		// set defaults and bind on change
// 		$.each(this.options, function (k, v) {
// 			// if (["from_date", "to_date"].includes(k)) {
// 			// 	me.elements[k].val(frappe.datetime.str_to_user(v));
// 			// } else {
// 			// 	me.elements[k].val(v);
// 			// }

// 			// me.elements[k].on("change", function () {
// 			// 	if (["from_date", "to_date"].includes(k)) {
// 			// 		me.options[k] =
// 			// 			frappe.datetime.user_to_str($(this).val()) != "Invalid date"
// 			// 				? frappe.datetime.user_to_str($(this).val())
// 			// 				: frappe.datetime.get_today();
// 			// 	} else {
// 			// 		me.options.chart = $(this).val();
// 			// 	}
// 			// 	me.get_data();
// 			// });
// 		});

// 		// bind refresh
// 		this.elements.refresh_btn.on("click", function () {
// 			me.get_data(this);
// 		});

// 		// bind resize
// 		$(window).resize(function () {
// 			me.render();
// 		});
// 	}

// 	get_data(btn) {
// 		var me = this;
// 		if (!this.sales_person) {
// 			frappe.throw(__("Please Select a sales_person."));
// 		}

// 		console.log(this.sales_person)

// 		const method_map = {
// 			sales_pipeline: "renewal_module.custom_module.page.opportunity_dashboard.opportunity_dashboard.get_opp_data",
// 		};
// 		frappe.call({
// 			method: method_map[this.options.chart],
// 			args: {
// 				sales_person: this.sales_person,
// 			},
// 			btn: btn,
// 			callback: function (r) {
// 				console.log(r)
// 				if (!r.exc) {
// 					me.options.data = r.message;
// 					if (me.options.data == "empty") {
// 						const $parent = me.elements.funnel_wrapper;
// 						$parent.html(__("No data for this period"));
// 					} else {
// 						me.render();
// 					}
// 				}
// 			},
// 		});
// 	}


// 	render() {
// 		let me = this;
// 		 if (me.options.chart == "sales_pipeline") {
// 			me.render_chart(__("Sales Pipeline by Stage"));
// 		}
// 	}

// 	render_chart(title) {
// 		let me = this;
// 		let currency = frappe.defaults.get_default("currency");

// 		let chart_data = me.options.data ? me.options.data : null;

// 		const parent = me.elements.funnel_wrapper[0];
// 		this.chart = new frappe.Chart(parent, {
// 			title: title,
// 			height: 400,
// 			data: chart_data,
// 			type: "bar",
// 			barOptions: {
// 				stacked: 1,
// 			},
// 			tooltipOptions: {
// 				formatTooltipY: (d) => format_currency(d, currency),
// 			},
// 		});
// 	}

	
// };








frappe.pages['opportunity-dashboard'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Opportunity Dashboard',
		single_column: true
	});

	wrapper.opp_dash = new erpnext.OpportunityDashboard(wrapper);

	frappe.breadcrumbs.add("Selling");
}


erpnext.OpportunityDashboard = class OpportunityDashboard {
	constructor(wrapper) {
		var me = this;
		// 0 setTimeout hack - this gives time for canvas to get width and height
		setTimeout(function () {
			me.setup(wrapper);
			me.get_data();
		}, 0);
	}

	setup(wrapper) {
		var me = this;

		// Sales Person field setup
		(this.sales_person_field = wrapper.page.add_field({
			fieldtype: "Link",
			fieldname: "sales_person",
			options: "Sales Person",
			label: __("Sales Person"),
			reqd: 1,
			change: function () {
				var email_user = frappe.user_info().email;
				frappe.model.get_value('Employee', {'user_id': email_user}, ['employee_name', 'cell_number'], function(d) {
					frappe.model.get_value('Sales Person', {'employee': d.name}, ['name', 'parent_sales_person'], function(s) {
						me.sales_person = s.name;
						me.get_data();
					});
				});
			},
			default: (function() {
				var email_user = frappe.user_info().email;
				var default_sales_person = null;
				frappe.model.get_value('Employee', {'user_id': email_user}, ['name'], function(d) {
					if (d) {
						frappe.model.get_value('Sales Person', {'employee': d.name}, ['name', 'parent_sales_person'], function(s) {
							if (s) {
								default_sales_person = s.name;
								me.sales_person_field.set_value(default_sales_person);
							}
						});
					}
				});
				return default_sales_person;
			})()
		})),

		// Elements to render chart
		(this.elements = {
			layout: $(wrapper).find(".layout-main"),
			chart: wrapper.page.add_select(__("Chart"), [
				// { value: "sales_funnel", label: __("Sales Funnel") },
				{ value: "sales_pipeline", label: __("Sales Pipeline") },
				{ value: "opp_by_utm_source", label: __("Opportunities by Source") },
				{ value: "opp_by_utm_campaign", label: __("Opportunities by Campaign") },
				{ value: "opp_by_utm_medium", label: __("Opportunities by Medium") },
			]),
			refresh_btn: wrapper.page.set_primary_action(
				__("Refresh"),
				function () {
					me.get_data();
				},
				"fa fa-refresh"
			),
		});

		this.elements.no_data = $('<div class="alert alert-warning">' + __("No Data") + "</div>")
			.toggle(false)
			.appendTo(this.elements.layout);

		this.elements.funnel_wrapper = $('<div class="funnel-wrapper text-center"></div>').appendTo(
			this.elements.layout
		);

		this.sales_person = "Geetha Pudi"; // Default sales person
		this.options = {
			chart: "sales_pipeline", // Default chart type
		};

		// set defaults and bind on change (no date fields)
		$.each(this.options, function (k, v) {
			// me.elements[k].val(v); // No need for date-related code
		});

		// bind refresh
		this.elements.refresh_btn.on("click", function () {
			me.get_data(this);
		});

		// bind resize
		$(window).resize(function () {
			me.render();
		});
	}

	get_data(btn) {
		var me = this;
		if (!this.sales_person) {
			frappe.throw(__("Please Select a sales_person."));
		}
	
		console.log("Selected Sales Person: ", this.sales_person);
	
		// Ensure that 'this.options.chart' is a valid method in the method_map
		const method_map = {
			// sales_funnel: "renewal_module.custom_module.page.opportunity_dashboard.opportunity_dashboard.get_funnel_data",
			sales_pipeline: "renewal_module.custom_module.page.opportunity_dashboard.opportunity_dashboard.get_opp_data",
			// Add other chart types here as needed
		};
	
		// Check if the chart option is valid
		if (!method_map[this.options.chart]) {
			frappe.throw(__("Invalid chart selection: ") + this.options.chart);
		}
	
		console.log("Calling method: ", method_map[this.options.chart]);
	
		// Call the method via frappe.call
		frappe.call({
			method: method_map[this.options.chart],  // Now, it's guaranteed to be a valid method
			args: {
				sales_person: this.sales_person,
			},
			btn: btn,
			callback: function (r) {
				console.log("Response from server: ", r);
				if (!r.exc) {
					me.options.data = r.message;
					if (me.options.data == "empty") {
						const $parent = me.elements.funnel_wrapper;
						$parent.html(__("No data for this period"));
					} else {
						me.render();
					}
				}
			},
		});
	}
	

	render() {
		let me = this;
		if (me.options.chart == "sales_pipeline") {
			me.render_chart(__("Sales Pipeline by Stage"));
		}
	}

	render_chart(title) {
		let me = this;
		let currency = frappe.defaults.get_default("currency");

		let chart_data = me.options.data ? me.options.data : null;

		const parent = me.elements.funnel_wrapper[0];
		this.chart = new frappe.Chart(parent, {
			title: title,
			height: 400,
			data: chart_data,
			type: "bar",
			barOptions: {
				stacked: 1,
			},
			tooltipOptions: {
				formatTooltipY: (d) => format_currency(d, currency),
			},
		});
	}
};
