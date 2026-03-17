/*frappe.pages['custom-issue-view'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'None',
		single_column: true
	});
}*/

frappe.router.on('change', () => {
	const route = frappe.get_route();
	if (frappe._custom_issue_view_page && route[0] !== "custom-issue-view") {
		location.reload();
	}
});


frappe.pages['custom-issue-view'].on_page_load = function (wrapper) {
	if (frappe._custom_issue_view_page_initialized) return;
	frappe._custom_issue_view_page_initialized = true;
	if (!$("link[href*='bootstrap-icons']").length) {
		$("head").append(`
            <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css" rel="stylesheet">
        `);
	}
	if (!$("script[src*='bootstrap.bundle.min.js']").length) {
		$("body").append(`
        <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js" integrity="sha384-ENjdO4Dr2bkBIFxQpeoYz1HIcje39W9rZ7ebx5d4R5d5n93N+8Of9p1KLekYV8fF" crossorigin="anonymous"></script>
    `);
	}
	$(document).on("click", ".btn-modal-close", function () {
		//console.log("Close icon clicked");
		const d = cur_dialog; // in v15, frappe stores the last open dialog here
		if (d) {
			d.hide();
		}

		// Cleanup leftover modal classes/backdrop
		setTimeout(() => {
			if (!$(".modal.show").length) {  // no open modals
				$("body").removeClass("modal-open");
				$("body").css("overflow", "");
				$(".modal-backdrop").remove();
			}
		}, 300); // let Bootstrap finish animation first
	});

	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Custom Issue',
		single_column: true
	});
	frappe._custom_issue_view_page = page;
	setTimeout(() => {
		const $actions_area = $(wrapper).find('.page-actions');
		if ($actions_area.length) {
			frappe.db.get_list('Kanban Board', {
				filters: { reference_doctype: 'Issue' },
				fields: ['name'],
				limit: 1
			}).then((result) => {
				let kanban_url = '/app/issue/view/kanban'; // default fallback
				if (result && result.length > 0) {
					kanban_url = `/app/issue/view/kanban/${result[0].name}`;
				}
				// View Dropdown
				const current_route = frappe.get_route();
				let selected_label_html = `
                    <span class="menu-item-icon">
                        <svg class="icon icon-sm"><use href="#icon-kanban"></use></svg>
                    </span>
                    <span class="menu-item-label" data-label="Custom View">
                        <span><span class="alt-underline">C</span>ustom View</span>
                    </span> 
                `;
				const view_dropdown = $(`
                    <div class="dropdown d-none d-md-inline-flex">
                        <button class="btn btn-default dropdown-toggle d-flex align-items-center gap-1" type="button" id="viewDropdown" data-bs-toggle="dropdown" aria-expanded="false" style="font-size:12px;>
                            ${selected_label_html}
                        </button>
                        <ul class="dropdown-menu" aria-labelledby="viewDropdown">
                            <li>
                                <a class="dropdown-item" href="/app/issue">
                                    <span class="menu-item-icon">
                                        <svg class="icon  icon-sm" style="" aria-hidden="true">
                                            <use class="" href="#icon-list"></use>
                                        </svg>
                                    </span>
                                    <span class="menu-item-label" data-label="List View">
                                        <span><span class="alt-underline">L</span>ist View</span>
                                    </span>
                                </a>
                            </li>
                            <li>
                                <a class="dropdown-item" href="/app/issue/view/report">
                                    <span class="menu-item-icon">
                                        <svg class="icon  icon-sm" style="" aria-hidden="true">
                                            <use class="" href="#icon-small-file"></use>
                                        </svg>
                                    </span>
                                    <span class="menu-item-label" data-label="Report">
                                        <span><span class="alt-underline">R</span>eport</span>
                                    </span>
                                </a>
                            </li>
                            <li data-view="Dashboard">
                                <a class="grey-link dropdown-item" href="/app/issue/view/dashboard">
                                    <span class="menu-item-icon">
                                        <svg class="icon  icon-sm" style="" aria-hidden="true">
                                            <use class="" href="#icon-dashboard"></use>
                                        </svg>
                                    </span>
                                    <span class="menu-item-label" data-label="Dashboard"><span><span class="alt-underline">D</span>ashboard</span></span>
                                </a>
                            </li>
                            <li>
                                <a class="grey-link dropdown-item" href="${kanban_url}">
                                    <span class="menu-item-icon">
                                        <svg class="icon icon-sm"><use href="#icon-kanban"></use></svg>
                                    </span>
                                    <span class="menu-item-label" data-label="Kanban View">
                                        <span><span class="alt-underline">K</span>anban View</span>
                                    </span>
                                </a>
                            </li>
                        </ul>
                    </div>
                `);
				const refresh_btn = $(`
                    <button class="btn btn-default refresh-btn d-none d-md-inline-flex" title="Refresh">
                        <i class="bi bi-arrow-clockwise"></i>
                    </button>
                `);
				const actions_dropdown = $(`
                    <div class="dropdown">
                        <button class="btn btn-default" type="button" id="actionsDropdown" data-bs-toggle="dropdown" aria-expanded="false">
                            <i class="bi bi-three-dots"></i>
                        </button>
                        <ul class="dropdown-menu" aria-labelledby="actionsDropdown">
                            <li class="d-md-none"><a class="dropdown-item refresh-page" href="">Refresh</a></li>
                            <li class="user-select"><a class="dropdown-item" href="/app/data-import?reference_doctype=Issue">Import</a></li>
                            <li class="user-select"><a class="dropdown-item" href="/app/user-permission?allow=Issue">User Permission</a></li>
                            <li class="user-select"><a class="dropdown-item" href="/app/permission-manager/issue">Permission Manager</a></li>
                            <li class="user-select"><a class="dropdown-item" href="/app/customize-form">Customize</a></li>
                            <li><a class="dropdown-item">Sidebar</a></li>
                            <li class="user-select"><a class="dropdown-item" href="/app/doctype/Issue">Edit Doctype</a></li>
                        </ul>
                    </div>
                `);
				if (!frappe.user_roles.includes("Support Team") && !frappe.user_roles.includes("System Manager")) {
					actions_dropdown.find(".user-select").remove();
				}
				const new_issue_btn = $(`
                    <button class="btn btn-primary btn-sm primary-action" style="font-size:12px;">
                        <i class="fa fa-plus"></i> ${__('New Issue')}
                    </button>
                `);

				// Your "Actions" button group
				const row_actions_group = $(`
                    <div class="actions-btn-group d-none">
                        <button type="button" class="btn btn-primary btn-sm" data-toggle="dropdown" aria-expanded="false">
                            <span>
                                <span class="hidden-xs actions-btn-group-label" data-label="Actions">
                                    <span><span class="alt-underline">A</span>ctions</span>
                                </span>
                                <svg class="icon icon-xs"><use href="#icon-select"></use></svg>
                            </span>
                        </button>
                        <ul class="dropdown-menu dropdown-menu-right" role="menu">
                            <li class="user-action"><a class="dropdown-item" href="#" data-action="set_open">Set as Open</a></li>
                            <li class="user-action"><a class="dropdown-item" href="#" data-action="set_closed">Set as Closed</a></li>
                            <li class="dropdown-divider"></li>
                            <li><a class="dropdown-item" href="#" data-action="edit">Edit</a></li>
                            <li><a class="dropdown-item" href="#" data-action="export">Export</a></li>
                            <li><a class="dropdown-item" href="#" data-action="assign_to">Assign To</a></li>
                            <li><a class="dropdown-item" href="#" data-action="apply_rule">Apply Assignment Rule</a></li>
                            <li><a class="dropdown-item" href="#" data-action="add_tags">Add Tags</a></li>
                            <li><a class="dropdown-item" href="#" data-action="print">Print</a></li>
                            <li class="delete-action"><a class="dropdown-item" href="#" data-action="delete">Delete</a></li>
                        </ul>
                    </div>
                `);


				$actions_area.empty().append(view_dropdown, refresh_btn, actions_dropdown, new_issue_btn, row_actions_group);

				// Toggle Actions/New Issue button depending on selection
				$(document).on("change", ".row-checkbox, #select-all-checkbox, .select-all-checkbox", function () {
					const anyChecked = $(".row-checkbox:checked").length > 0;
					if (anyChecked) {
						new_issue_btn.addClass("d-none");
						row_actions_group.removeClass("d-none");
					} else {
						row_actions_group.addClass("d-none");
						new_issue_btn.removeClass("d-none");
					}
				});

				if (!frappe.user_roles.includes("Support Team") && !frappe.user_roles.includes("System Manager")) {
					row_actions_group.find(".delete-action").remove();
				}

				// ⬇️ Add this NEW handler right after the above
				$(document).on("click", ".actions-btn-group .dropdown-item", function (e) {
					e.preventDefault();
					const action = $(this).data("action");
					const issues = getSelectedIssues();
					if (!issues.length) {
						frappe.msgprint(__("Please select at least one Issue"));
						return;
					}

					if (action === "set_open") {
						bulkUpdate(issues, { fieldname: "status", value: "Open" });
					}
					else if (action === "set_closed") {
						bulkUpdate(issues, { fieldname: "status", value: "Closed" });
					}
					else if (action === "edit") {
						const doctype = "Issue";
						frappe.model.with_doctype(doctype, () => {
							// Filter editable fields
							const fields = frappe.meta.get_docfields(doctype)
								.filter(df =>
									df.fieldname &&
									df.label &&
									!df.hidden &&
									!df.read_only &&
									df.fieldtype !== "Table"
								);

							const d = new frappe.ui.Dialog({
								title: __("Bulk Edit"),
								fields: [
									{
										label: __("Field"),
										fieldname: "fieldname",
										fieldtype: "Select",
										// ✅ Store fieldname as value, label as text
										options: fields.map(df => ({
											label: `${df.label}`,
											value: df.fieldname
										})),
										reqd: 1,
										onchange() {
											const fieldname = d.get_value("fieldname");
											if (!fieldname) return;
											const df = frappe.meta.get_docfield(doctype, fieldname);
											// Clear old value input
											const wrapper = d.get_field("value_wrapper").$wrapper;
											wrapper.empty();
											// Create correct input control dynamically
											d.__value_control = frappe.ui.form.make_control({
												df: {
													label: __("Value"),
													fieldname: "value",
													fieldtype: df.fieldtype || "Data",
													options: df.options || "",
													reqd: 1
												},
												parent: wrapper,
												render_input: true
											});
											d.__value_control.refresh();
										}
									},
									{
										fieldtype: "HTML",
										fieldname: "value_wrapper"
									}
								],
								primary_action_label: __("Update {0} records", [issues.length]),
								primary_action() {
									const fieldname = d.get_value("fieldname");
									if (!fieldname) {
										frappe.msgprint(__("Please select a field"));
										return;
									}
									if (!d.__value_control) {
										frappe.msgprint(__("Please enter a value"));
										return;
									}
									const value = d.__value_control.get_value();
									d.hide();
									bulkUpdate(issues, { fieldname, value });
								}
							});

							d.show();
						});
					}

					else if (action === "assign_to") {
						const doctype = "Issue";
						const names = issues;

						if (!names.length) {
							frappe.msgprint(__("Please select at least one Issue"));
							return;
						}

						// Assign To Dialog wrapper
						let d = new frappe.ui.form.AssignToDialog({
							doctype,
							docname: names[0], // just to initialize
						});

						// Override primary action
						d.dialog.set_primary_action(__("Assign"), function () {
							const assignments = d.dialog.get_values();
							if (!assignments) return;

							d.dialog.hide();   // ✅ FIXED (was d.hide())

							// Apply assignment for each selected issue
							const calls = names.map(name =>
								frappe.call({
									method: "frappe.desk.form.assign_to.add",
									args: {
										doctype,
										name,
										assign_to: assignments.assign_to,
										assign_to_me: assignments.assign_to_me,
										assign_to_user_group: assignments.assign_to_user_group,
										description: assignments.description,
										due_date: assignments.due_date,
										priority: assignments.priority,
										notify: assignments.notify || 0
									}
								})
							);

							Promise.allSettled(calls).then(() => {
								frappe.show_alert({ message: __("Assigned successfully"), indicator: "green" });
								load_data({ reset: true });
								resetActionBar();
							});
						});

						d.dialog.show();
					}

					else if (action === "apply_rule") {
						const doctype = "Issue";

						frappe.dom.freeze(__("Applying assignment rule..."));

						const calls = issues.map(name =>
							frappe.call({
								method: "renewal_module.custom_module.page.custom_issue_view.custom_issue_view.apply_assignment_rule",
								args: { doctype, name }
							})
						);

						Promise.allSettled(calls).then((res) => {
							frappe.dom.unfreeze();
							const failed = res.filter(r => r.status === "rejected" || r.value?.exc).length;
							if (failed) {
								frappe.msgprint(__("{0} records failed to apply assignment rule.", [failed]));
							} else {
								frappe.show_alert({ message: __("Assignment Rule applied"), indicator: "green" });
							}
							load_data({ reset: true });
							resetActionBar();
						});
					}



					// --- PRINT (simple, reliable bulk print for custom page) ---
					else if (action === "print") {
						const doctype = "Issue";

						// Try to get available print formats; fallback to Standard
						const print_formats = (frappe.meta.get_print_formats && frappe.meta.get_print_formats(doctype)) || ["Standard"];

						const d = new frappe.ui.Dialog({
							title: __("Bulk Print"),
							fields: [
								{
									label: __("Print Format"),
									fieldname: "print_format",
									fieldtype: "Select",
									options: print_formats.join("\n"),
									default: print_formats[0]
								},
								{ label: __("With Letterhead"), fieldname: "with_letterhead", fieldtype: "Check", default: 1 },
								{ label: __("Letterhead (optional)"), fieldname: "letterhead", fieldtype: "Link", options: "Letter Head" }
							],
							primary_action_label: __("Open {0} Print Views", [issues.length]),
							primary_action(values) {
								d.hide();
								// Open each document's print view in a new tab (simplest + works on custom pages)
								issues.forEach(name => {
									// /printview is stable across versions
									const params = new URLSearchParams({
										doctype,
										name,
										format: values.print_format || "Standard",
										no_letterhead: values.with_letterhead ? "0" : "1"
									});
									if (values.letterhead) params.set("letterhead", values.letterhead);
									const url = `/printview?${params.toString()}`;
									window.open(url, "_blank");
								});
							}
						});

						d.show();

					}

					else if (action === "add_tags") {
						const doctype = "Issue";
						const names = issues;

						const dialog = new frappe.ui.Dialog({
							title: __("Add Tags"),
							fields: [
								{
									fieldtype: "Link",
									fieldname: "tag",
									label: __("Tag"),
									options: "Tag",
									reqd: 1
								}
							],
							primary_action_label: __("Add"),
							primary_action(values) {
								dialog.hide();
								let promises = names.map(name =>
									frappe.call({
										method: "frappe.desk.doctype.tag.tag.add_tag",
										args: { tag: values.tag, dt: doctype, dn: name }
									})
								);

								Promise.all(promises).then(() => {
									frappe.show_alert({ message: __("Tag added"), indicator: "green" });
									load_data({ reset: true });
									resetActionBar();
								});
							}
						});

						dialog.show();
					}
					else if (action === "delete") {
						frappe.confirm(__("Delete {0} selected Issues?", [issues.length]), () => {
							let promises = issues.map(name =>
								frappe.call({
									method: "frappe.client.delete",
									args: { doctype: "Issue", name }
								})
							);
							Promise.all(promises).then(() => {
								frappe.show_alert({ message: __("Deleted successfully"), indicator: "red" });
								load_data({ reset: true });
								resetActionBar();
							});
						});
					}
					else {
						frappe.msgprint(__("Action '{0}' not implemented yet", [action]));
					}
				});


				// Bind refresh event
				$(wrapper).on('click', '.refresh-btn, .refresh-page', function (e) {
					e.preventDefault();

					// Always reset back to 1-column layout when refreshing
					$("#extra-panel-wrapper").hide().removeClass("col-lg-6 col-xl-6");
					$("#issue-list-col").removeClass("col-xl-6 col-lg-6").addClass("col-12");
					$(".issue-list").removeClass("compact-mode");

					// Reset panel state
					extraPanelVisible = false;
					lastClickedIssue = null;

					// Reload the data
					load_data({ reset: true });
					resetActionBar();
				});

				new_issue_btn.on('click', () => {
					frappe.new_doc('Issue');
				});
			});
		}
	}, 100);

	// ✅ helper to reset action bar state
	function resetActionBar() {
		// clear all checkboxes
		$(".row-checkbox, #select-all-checkbox, .select-all-checkbox").prop("checked", false);

		// restore UI state
		$(".actions-btn-group").addClass("d-none");
		$(".new-issue-btn, .btn.btn-primary.btn-sm.primary-action").removeClass("d-none");
	}

	function getSelectedIssues() {
		return $(".row-checkbox:checked")
			.map(function () {
				return $(this).data("issue");
			})
			.get();
	}

	function bulkUpdate(issues, updates) {
		if (!issues.length) return;

		frappe.dom.freeze(__("Updating..."));
		let promises = issues.map(name =>
			frappe.call({
				method: "frappe.client.set_value",
				args: {
					doctype: "Issue",
					name,
					fieldname: updates.fieldname,
					value: updates.value
				}
			})
		);

		Promise.all(promises).then(() => {
			frappe.dom.unfreeze();
			frappe.show_alert({ message: __("Updated successfully"), indicator: "green" });
			load_data({ reset: true });
			resetActionBar();
		});
	}

	const toggle_btn = $(`
        <button class="btn btn-sm toggle-sidebar-btn me-3 mr-1" title="Toggle Sidebar" style="border: none; box-shadow: none;">
            <span id="sidebar-toggle-icon">&#9776;</span> 
        </button>
    `);
	page.$title_area.prepend(toggle_btn);
	// Sidebar overlay + drawer for tablet/mobile
	const sidebar_overlay = $('<div class="custom-sidebar-overlay"></div>').appendTo('body');
	const sidebar_drawer = $('<div class="custom-sidebar-drawer" id="mobile-sidebar"></div>').appendTo('body');
	// Reusable sidebar content
	const get_sidebar_content = () => `
		<div class="p-3">
            <label class="form-label">Filter By</label>
            <div class="mb-3"><div id="filter-assigned-to"></div></div>
            <div class="mb-3"><div id="filter-created-by"></div></div>
            <div class="mb-3"><div id="filter-tags"></div></div>
        </div>
	`;
	// Inject sidebar content
	sidebar_drawer.html(get_sidebar_content());
	// Modify initial HTML render
	$(page.body).html(`
        <div id="main-wrapper">
            <div id="desktop-sidebar">${get_sidebar_content()}</div>
            <div id="main-content">
                <div class="summary-cards row"></div>
                <div class="row" id="content-row">
                    <div id="issue-list-col" class="col-12">
                        <div class="issue-list mt-4"></div>
                    </div>
                    <div id="extra-panel-wrapper"
                        style="border-left:1px solid #dddad0; display:none;">
                        <div class="extra-panel"></div>
                    </div>
                </div>
            </div>
        </div>
    `);
	// Toggle logic
	let isSidebarHidden = false;
	toggle_btn
		.on("mouseenter", function () {
			const icon = $('#sidebar-toggle-icon');
			icon.html(isSidebarHidden ? '&raquo;' : '&laquo;');
		})
		.on("mouseleave", function () {
			$('#sidebar-toggle-icon').html('&#9776;');
		})
		.on("click", function () {
			if (window.innerWidth >= 992) {
				isSidebarHidden = !isSidebarHidden;
				$('#desktop-sidebar').toggleClass('hidden', isSidebarHidden);
			} else {
				const isOpen = sidebar_drawer.hasClass("open");
				sidebar_drawer.toggleClass('open');
				sidebar_overlay.toggle();
				isSidebarHidden = !isOpen;
			}
		});
	sidebar_overlay.on('click', function () {
		sidebar_drawer.removeClass('open');
		sidebar_overlay.hide();
		isSidebarHidden = true; // update state
	});

	let assigned_to_filter, created_by_filter, tags_filter;
	function render_filters(container, is_mobile = false) {
		const assignedCtrl = frappe.ui.form.make_control({
			parent: container.find('#filter-assigned-to'),
			df: {
				fieldtype: 'Link',
				options: 'User',
				label: 'Assigned To',
				placeholder: 'Assigned To',
				change: () => {
					let val = assignedCtrl.get_value() || "";
					//console.log(`[${is_mobile ? 'Mobile' : 'Desktop'}] Assigned To changed:`, val);
					load_data({ reset: true });  // reload with updated filters
				}
			},
			render_input: true
		});

		const createdCtrl = frappe.ui.form.make_control({
			parent: container.find('#filter-created-by'),
			df: {
				fieldtype: 'Link',
				options: 'User',
				label: 'Created By',
				placeholder: 'Created By',
				change: () => {
					let val = createdCtrl.get_value() || "";
					//console.log(`[${is_mobile ? 'Mobile' : 'Desktop'}] Created By changed:`, val);
					load_data({ reset: true });
				}
			},
			render_input: true
		});

		const tagsCtrl = frappe.ui.form.make_control({
			parent: container.find('#filter-tags'),
			df: {
				fieldtype: 'Link',
				options: 'Tag',   // ✅ link to Tag DocType
				label: 'Tags',
				placeholder: 'Tag',
				change: () => {
					let val = tagsCtrl.get_value() || "";
					//console.log("Tags filter changed:", val);
					load_data({ reset: true });
				}
			},
			render_input: true
		});

		// Store only one reference for use in load_data()
		if (!is_mobile) {
			assigned_to_filter = assignedCtrl;
			created_by_filter = createdCtrl;
			tags_filter = tagsCtrl;
		}
	}

	// Call it for both desktop and mobile
	render_filters($('#desktop-sidebar'), false);
	render_filters($('#mobile-sidebar'), true);


	let advancedFilterForm;
	let page_length = 20;
	let current_filters = [];
	let total_results = 0;
	let activeQueryId = 0;
	const LOAD_MORE_SIZE = 50;           // always add +50 on each Load More
	let visible_count = 0;
	//Track the currently selected card status
	let active_status_filter = null;

	function load_data({ reset = true, extra_filters = null } = {}) {
		/*if (reset) {
			visible_count = 0;
			console.log("[LOAD_DATA] Reset triggered -> clearing list, start_index=0");
			$(".issue-list").empty();
		}*/
		// Always rebuild filters fresh
		let filters = [];
		if (Array.isArray(current_filters)) filters.push(...current_filters);
		if (Array.isArray(extra_filters)) filters.push(...extra_filters);

		// Side filters (Assigned, Created, Tags)
		const assigned_to = assigned_to_filter?.get_value?.();
		const created_by = created_by_filter?.get_value?.();
		const tags = tags_filter?.get_value?.();
		if (assigned_to) filters.push(["Issue", "_assign", "like", `%${assigned_to}%`]);
		if (created_by) filters.push(["Issue", "raised_by", "=", created_by]);
		if (tags) filters.push(["Issue", "_user_tags", "like", `%${tags}%`]);

		const queryId = ++activeQueryId;
		console.log(`[LOAD_DATA] Sending queryId=${queryId}`);

		//First call → fetch FULL dataset for summary cards
		frappe.call({
			method: "renewal_module.custom_module.page.custom_issue_view.custom_issue_view.get_filtered_issues",
			args: { filters: JSON.stringify(filters) },
			callback: function (r) {
				if (queryId !== activeQueryId) return;
				const fullData = r.message || [];
				console.log(`[CALLBACK] Full dataset size=${fullData.length} (for summary cards)`);

				// Render summary cards with full dataset (ignoring status filter)
				render_summary_cards(fullData);

				//Then filter locally for active_status_filter
				let listData = [...fullData];
				if (active_status_filter) {
					const status = active_status_filter[3];
					listData = listData.filter(issue => issue.status === status);
				}
				// Pagination for list
				// const increment = reset ? page_length : LOAD_MORE_SIZE;
				// const targetVisible = visible_count + increment;
				// const end = Math.min(targetVisible, listData.length);
				// const toRender = listData.slice(0, end);
				// render_issue_list(toRender, { append: false });
				// visible_count = end;

				// Pagination for list
				let toRender, end;
				if (reset) {
					//Pagination change → replace mode
					visible_count = page_length;
					end = Math.min(page_length, listData.length);
					toRender = listData.slice(0, end);

					render_issue_list(toRender, { append: false }); // replace directly
				} else {
					// Load More → append mode
					const increment = LOAD_MORE_SIZE;
					const targetVisible = visible_count + increment;
					end = Math.min(targetVisible, listData.length);
					toRender = listData.slice(0, end);
					render_issue_list(toRender, { append: true }); // append at bottom
					visible_count = end;
				}

				total_results = listData.length;
				toggleLoadMoreButton(visible_count < total_results);
				console.log(`[CALLBACK] After render -> visible_count=${visible_count}, total_results=${total_results}`);
			}
		});
	}


	// ---- HELPER: show/hide Load More ----
	function toggleLoadMoreButton(show) {
		const $btn = $(".btn-more");
		if (show) $btn.prop("disabled", false).show();
		else $btn.prop("disabled", true).hide();
	}

	function load_data_with_filters(extra_filters) {
		//console.log("[FILTER] load_data_with_filters called with:", JSON.stringify(extra_filters));
		current_filters = Array.isArray(extra_filters) ? extra_filters : [];
		load_data({ reset: true });
	}

	function render_summary_cards(data) {
		const status_counts = {};
		data.forEach(issue => {
			const status = issue.status || "Unknown";
			status_counts[status] = (status_counts[status] || 0) + 1;
		});

		const summary = $(".summary-cards").empty();
		const status_options = ["Open", "Replied", "On Hold", "Resolved", "Closed"];

		const status_color_map = {
			"Open": "#e07782ff",
			"Replied": "#80a4daff",
			"On Hold": "#db955cff",
			"Resolved": "#227383ff",
			"Closed": "#5ba884ff",
			"Unknown": "#626f7bff"
		};

		const icon_class_map = {
			"Open": "bi-chat-dots",
			"Replied": "bi-reply",
			"On Hold": "bi-pause-circle",
			"Resolved": "bi-check-circle",
			"Closed": "bi-lock-fill",
			"Unknown": "bi-question-circle"
		};

		status_options.forEach(status => {
			const count = status_counts[status] || 0;
			const isActive = active_status_filter && active_status_filter[3] === status;
			const card = $(`
                <div class="col-6 col-md mb-1">
                    <div class="card p-1 mb-2 status-card ${isActive ? "active" : ""}" data-status="${status}"  style="cursor:pointer;background-color: ${status_color_map[status] || '#f8f9fa'};">
                        <div class="card-body">
                            <div class="fs-3 p-1"><i class="bi ${icon_class_map[status] || 'bi-question-circle'}" style="color:white;"></i></div>
                            <div class="p-1" style="color:white !important;">${status}</div>
                            <div class="ellipsis number p-1" style="color:white;"><strong>${count}</strong></div>
                        </div>
                    </div>
                </div>
            `);

			//Add click handler with toggle logic
			card.find(".status-card").on("click", function () {
				const clickedStatus = $(this).data("status");
				const isActive = $(this).hasClass("active");
				if (isActive) {
					// If already active -> remove filter & active state
					console.log(`[CARD CLICK] Removing filter for status=${clickedStatus}`);
					$(this).removeClass("active");
					active_status_filter = null; // clear status filter
					load_data({ reset: true }); // reload without status filter
				} else {
					//Apply new filter
					console.log(`[CARD CLICK] Filtering by status=${clickedStatus}`);
					$(".status-card").removeClass("active"); // clear old selection
					$(this).addClass("active"); // highlight this card
					active_status_filter = ["Issue", "status", "=", clickedStatus]; // store globally
					load_data({ reset: true });
				}
			});

			summary.append(card);
		});

		if (!advancedFilterForm) {
			render_advanced_filter_form(summary);
		}
	}


	let name_control, subject_control, customer_link_control, status_control, priority_control;

	function render_advanced_filter_form(summary) {
		advancedFilterForm = $(`
			<div class="page-form flex">
				<div class="standard-filter-section flex row gx-2">
					<div class="form-group col-md-2" data-fieldname="name"></div>
					<div class="form-group col-md-2" data-fieldname="subject"></div>
					<div class="form-group col-md-2" data-fieldname="customer"></div>
					<div class="form-group col-md-2" data-fieldname="status"></div>
					<div class="form-group col-md-2" data-fieldname="priority"></div>
				</div>
				<div class="filter-section flex mt-2">
					<div class="filter-selector">
						<div class="btn-group">
							<button class="btn btn-default btn-sm filter-button" title="Filters">
								<span class="filter-icon">
									<svg class="es-icon es-line icon-sm" aria-hidden="true">
										<use href="#es-line-filter"></use>
									</svg>
								</span>
								<span class="button-label hidden-xs">Filter</span>
							</button>
							<button class="btn btn-default btn-sm filter-x-button" title="Clear all filters">
								<span class="filter-icon">
									<svg class="es-icon es-line icon-sm" aria-hidden="true">
										<use href="#es-small-close"></use>
									</svg>
								</span>
							</button>
						</div>
					</div>

					<!--<div class="sort-selector ms-2">
						<div class="btn-group">
							<button class="btn btn-default btn-sm btn-order" data-value="desc" title="descending">
								<span class="sort-order">
									<svg class="icon icon-sm">
										<use href="#icon-sort-descending"></use>
									</svg>
								</span>
							</button>
							<button type="button" class="btn btn-default btn-sm sort-selector-button" data-toggle="dropdown">
								<span class="dropdown-text">Last Updated On</span>
							</button>
							<ul class="dropdown-menu dropdown-menu-right">
								<li><a class="dropdown-item option" data-value="modified">Last Updated On</a></li>
								<li><a class="dropdown-item option" data-value="subject">Subject</a></li>
								<li><a class="dropdown-item option" data-value="name">ID</a></li>
								<li><a class="dropdown-item option" data-value="creation">Created On</a></li>
							</ul>
						</div>
					</div>-->
				</div>
			</div>
		`);

		summary.after(advancedFilterForm);

		// ---------- existing small-controls ----------
		name_control = frappe.ui.form.make_control({
			parent: advancedFilterForm.find('[data-fieldname="name"]'),
			df: { fieldtype: "Data", fieldname: "name", label: "ID", placeholder: "ID" },
			render_input: true
		});

		subject_control = frappe.ui.form.make_control({
			parent: advancedFilterForm.find('[data-fieldname="subject"]'),
			df: { fieldtype: "Data", fieldname: "subject", label: "Subject", placeholder: "Subject" },
			render_input: true
		});

		customer_link_control = frappe.ui.form.make_control({
			parent: advancedFilterForm.find('[data-fieldname="customer"]'),
			df: { fieldtype: "Link", fieldname: "customer", label: "Customer", options: "Customer", placeholder: "Customer" },
			render_input: true
		});

		status_control = frappe.ui.form.make_control({
			parent: advancedFilterForm.find('[data-fieldname="status"]'),
			df: { fieldtype: "Select", fieldname: "status", label: "Status", placeholder: "Status", options: ["", "Open", "Replied", "On Hold", "Resolved", "Closed"].join("\n") },
			render_input: true
		});

		priority_control = frappe.ui.form.make_control({
			parent: advancedFilterForm.find('[data-fieldname="priority"]'),
			df: { fieldtype: "Link", fieldname: "priority", label: "Priority", options: "Issue Priority", placeholder: "Priority" },
			render_input: true
		});

		// wire small-control changes
		[
			{ ctrl: name_control, type: "text" },
			{ ctrl: subject_control, type: "text" },
			{ ctrl: status_control, type: "select" }
		].forEach(({ ctrl }) => {
			if (!ctrl) return;
			ctrl.$input.on("change keyup", frappe.utils.debounce(() => {
				apply_advanced_filters();
			}, 300));
		});

		if (customer_link_control) customer_link_control.df.onchange = () => apply_advanced_filters();
		if (priority_control) priority_control.df.onchange = () => apply_advanced_filters();

		let saved_filters = [];
		let filter_group = null;

		// --- FILTER BUTTON CLICK ---
		advancedFilterForm.find('.filter-button').on("click", function (e) {
			e.preventDefault();
			e.stopPropagation();
			const $btn = $(this);
			// If already open → close it (and teardown guards)
			if ($btn.data("bs.popover")) {
				//console.log("[POP] toggle: disposing existing popover");
				teardownGuards($btn);
				$btn.popover("dispose");
				return;
			}

			//console.log("[POP] opening popover…");

			// Popover content
			let popover_content = $('<div class="filter-area">');

			// Always create fresh FilterGroup
			filter_group = new frappe.ui.FilterGroup({
				parent: popover_content,
				doctype: "Issue",
				on_change: function () {
					saved_filters = filter_group.get_filters();
					console.log("[FILTERS] on_change →", JSON.parse(JSON.stringify(saved_filters)));
					apply_advanced_filters(saved_filters);
					update_filter_button_count($btn, saved_filters.length);
				}
			});

			// --- PATCH: Prevent Frappe error when re-opening ---
			filter_group.update_filter_button = function () {
				// No-op (skip toggleClass to prevent undefined error)
			};

			// --- DIAGNOSTIC + FIX: Keep popover visible when removing rows ---
			// We capture pointerdown INSIDE the popover BEFORE DOM changes,
			// and then ignore the next outside-click close once.
			let lastDownInsidePopover = false;
			let lastDownOnRemove = false;

			// log & mark when pressing any element inside popover
			document.addEventListener("mousedown", onDocMouseDownCapture, true);
			function onDocMouseDownCapture(ev) {
				const inside = !!ev.target.closest(".filter-popover");
				const onRemove = !!ev.target.closest(".filter-popover .filter-remove, .filter-popover .remove-filter");
				lastDownInsidePopover = inside;
				lastDownOnRemove = onRemove;
				//console.log("[POP] mousedown (capture): inside=", inside, "onRemove=", onRemove, "target=", ev.target);
			}

			// also log the exact click on the X in case selectors differ
			popover_content.on("pointerdown", ".filter-remove, .remove-filter", function (ev) {
				//console.log("[POP] pointerdown on row X:", ev.target);
				// ensure stopPropagation so nothing else toggles prematurely
				ev.stopPropagation();
				lastDownInsidePopover = true;
				lastDownOnRemove = true;
			});

			// Restore saved filters OR start with one row
			setTimeout(() => {
				if (saved_filters.length) {
					//console.log("[FILTERS] restoring saved filters:", JSON.parse(JSON.stringify(saved_filters)));
					filter_group.add_filters(saved_filters);
				} else {
					//console.log("[FILTERS] no saved filters → add default row");
					filter_group.add_filter("Issue", "name", "=", "", false);
				}
			}, 0);

			// Footer buttons
			let footer = $(`
				<div class="filter-action-buttons mt-2 flex justify-between items-center">
					<button class="text-muted add-filter btn btn-xs">+ Add a Filter</button>
					<div>
						<button class="btn btn-secondary btn-xs clear-filters mr-2">Clear</button>
						<button class="btn btn-primary btn-xs apply-filters">Apply</button>
					</div>
				</div>
			`);
			popover_content.find(".filter-action-buttons").remove();
			popover_content.append(footer);

			footer.find('.add-filter').on("click", function () {
				//console.log("[FILTERS] add-filter clicked");
				filter_group.add_filter("Issue", "name", "=", "", false);
			});

			footer.find('.clear-filters').on("click", function () {
				//console.log("[FILTERS] clear-filters clicked");
				if (filter_group) filter_group.clear_filters();
				saved_filters = [];
				apply_advanced_filters([]);
				update_filter_button_count($btn, 0);
				closePopover($btn, "clear-filters");
			});

			footer.find('.apply-filters').on("click", function () {
				console.log("[FILTERS] apply-filters clicked");
				if (filter_group) {
					saved_filters = filter_group.get_filters();
					//console.log("[FILTERS] applying:", JSON.parse(JSON.stringify(saved_filters)));
					apply_advanced_filters(saved_filters);
					update_filter_button_count($btn, saved_filters.length);
				}
				closePopover($btn, "apply-filters");
			});

			// Init popover
			$btn.popover({
				html: true,
				placement: "bottom",
				content: popover_content,
				trigger: "manual",
				container: "body",
				template: `
					<div class="popover filter-popover fade bs-popover-bottom" role="tooltip">
						<div class="arrow"></div>
						<div class="popover-body popover-content"></div>
					</div>
				`,
				popperConfig: {
					modifiers: [
						{ name: 'offset', options: { offset: [0, 4] } },
						{ name: 'arrow', options: { element: '.arrow', padding: 6 } }
					]
				}
			}).popover("show");

			// Log popover lifecycle
			$btn.on("shown.bs.popover", () => console.log("[POP] shown.bs.popover"));
			$btn.on("hide.bs.popover", (ev) => {
				//console.log("[POP] hide.bs.popover fired. lastDownInsidePopover=", lastDownInsidePopover, "lastDownOnRemove=", lastDownOnRemove);
				// If the last pointerdown was inside (especially on remove), keep it open
				if (lastDownOnRemove || lastDownInsidePopover) {
					//console.log("[POP] hide prevented (click was inside popover)");
					ev.preventDefault();
				}
			});

			// Close only when clicking truly outside (with strong guards + logs)
			const onDocClick = function (event) {
				const pathInside = isInsidePopoverOrBtn(event);
				// If interaction started inside popover (or on X), ignore this click-close
				if (lastDownOnRemove || lastDownInsidePopover || pathInside) {
					// reset only the onRemove flag; keep inside flag until next mousedown
					lastDownOnRemove = false;
					return;
				}

				// otherwise close
				closePopover($btn, "outside-click");
			};

			// attach guards/handlers and keep references for teardown
			$(document).on("click.filterPopover", onDocClick);
			$btn.data("guardHandlers", { onDocClick, onDocMouseDownCapture });

			function isInsidePopoverOrBtn(event) {
				// fast path using current DOM
				if ($(event.target).closest(".filter-popover, .filter-button").length) return true;

				// robust path using composedPath (works even if node was removed)
				const oe = event.originalEvent;
				if (oe && typeof oe.composedPath === "function") {
					const path = oe.composedPath();
					const inside = path.some(node =>
						node && node.classList && (node.classList.contains("filter-popover") || node.classList.contains("filter-button"))
					);
					if (inside) return true;
				}
				return false;
			}

			function closePopover($btn, reason) {
				//console.log("[POP] disposing popover. reason=", reason);
				teardownGuards($btn);
				$btn.popover("dispose");
			}

			function teardownGuards($btn) {
				const guards = $btn.data("guardHandlers");
				if (guards) {
					$(document).off("click.filterPopover", guards.onDocClick);
					document.removeEventListener("mousedown", guards.onDocMouseDownCapture, true);
					$btn.removeData("guardHandlers");
					//console.log("[POP] guards torn down");
				}
			}
		});

		// --- EXTERNAL CLEAR (X) BUTTON ---
		advancedFilterForm.find('.filter-x-button').on("click", function () {
			if (filter_group) filter_group.clear_filters();
			saved_filters = [];
			reset_all_controls();
			apply_advanced_filters([]);
			update_filter_button_count(advancedFilterForm.find('.filter-button'), 0);
		});

		// --- HELPER: Update filter button count ---
		function update_filter_button_count($btn, count) {
			let $label = $btn.find(".button-label");
			if (count > 0) {
				$label.text(`Filter (${count})`);
			} else {
				$label.text("Filter");
			}
		}

		function reset_all_controls() {
			if (name_control) name_control.set_value("");
			if (subject_control) subject_control.set_value("");
			if (status_control) status_control.set_value("");
			if (customer_link_control) {
				customer_link_control.set_value("");
				customer_link_control.$input && customer_link_control.$input.val("");
			}
			if (priority_control) {
				priority_control.set_value("");
				priority_control.$input && priority_control.$input.val("");
			}
		}
	}



	function apply_advanced_filters(extra_filters = []) {
		//console.log("[FILTER] Applying advanced filters...");
		// Reset extra panel to 1-column view
		$("#extra-panel-wrapper").hide().removeClass("col-lg-6 col-xl-6");
		$("#issue-list-col").removeClass("col-xl-6 col-lg-6").addClass("col-12");
		$(".issue-list").removeClass("compact-mode");
		extraPanelVisible = false;
		lastClickedIssue = null;

		const nameVal = name_control.get_value();
		const subjectVal = subject_control.get_value();
		const customerVal = customer_link_control.get_value();
		const statusVal = status_control.get_value();
		const priorityVal = priority_control.get_value();

		const filters = [];
		if (nameVal) filters.push(["Issue", "name", "like", `%${nameVal}%`]);
		if (subjectVal) filters.push(["Issue", "subject", "like", `%${subjectVal}%`]);
		if (customerVal) filters.push(["Issue", "customer", "=", customerVal]);
		if (statusVal) filters.push(["Issue", "status", "=", statusVal]);
		if (priorityVal) filters.push(["Issue", "priority", "=", priorityVal]);

		// merge with filter group (if any)
		if (extra_filters.length > 0) {
			filters.push(...extra_filters);
		}

		//console.log("[FILTER] Built filters:", JSON.stringify(filters));
		load_data_with_filters(filters);
	}

	function getPriorityColor(priority) {
		switch (priority) {
			case 'High': return '#f43f5e';       // Red
			case 'Medium': return '#facc15';     // Yellow
			case 'Low': return '#10b981';        // Green
			case 'Critical': return '#ef4444';   // Dark Red
			default: return '#d1d5db';           // Gray
		}
	}

	const paginationHTML = `
        <div class="list-paging-area level  m-3">
            <div class="level-left p-1">
                <div class="btn-group" style="border:1px solid #dddad0;border-radius:10px;">
                    <button type="button" class="btn btn-default btn-sm btn-paging" data-value="20">20</button>
                    <button type="button" class="btn btn-default btn-sm btn-paging" data-value="100" style="border-left:1px solid #dddado">100</button>
                    <button type="button" class="btn btn-default btn-sm btn-paging" data-value="500">500</button>
                    <button type="button" class="btn btn-default btn-sm btn-paging" data-value="2500">2500</button>
                </div>
            </div>
            <div class="level-right p-2">
                <button class="btn btn-default btn-more btn-sm">Load More</button>
            </div>
        </div>
    `;
	$(paginationHTML).insertAfter('.issue-list');

	page.body.on("click", ".btn-paging", function () {
		const newLen = parseInt($(this).data("value"), 10);
		//console.log(`[PAGING] Clicked page size -> ${newLen}`);
		page_length = newLen;

		$(".btn-paging").removeClass("btn-info");
		$(this).addClass("btn-info");

		load_data({ reset: true });    // shows first `page_length` rows
	});

	page.body.on("click", ".btn-more", function () {
		//console.log("[PAGING] Load More clicked; will add +50 rows");
		load_data({ reset: false });   // adds +100 more rows each time
	});

	function get_initials(name) {
		if (!name) return "AB";
		const parts = name.trim().split(" ");
		if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
		return (parts[0][0] + parts[1][0]).toUpperCase();
	}

	let lastClickedIssue = null;
	let extraPanelVisible = false;

	function toggleExtraPanel(issueName, panelHTML) {
		// Only enable extra panel for desktop/laptop (≥992px)
		if ($(window).width() < 992) {
			return; // skip for mobile/tablet
		}

		if (extraPanelVisible && lastClickedIssue === issueName) {
			// Hide panel & expand list
			$("#extra-panel-wrapper").hide().removeClass("col-lg-6 col-xl-6");
			$("#issue-list-col").removeClass("col-xl-6 col-lg-6").addClass("col-12");
			$(".issue-list").removeClass("compact-mode");
			extraPanelVisible = false;
			lastClickedIssue = null;
		} else {
			// Show panel & shrink list
			$("#extra-panel-wrapper").show().addClass("col-lg-6 col-xl-6").find(".extra-panel").html(panelHTML);
			$("#issue-list-col").removeClass("col-12").addClass("col-xl-6 col-lg-6");
			$(".issue-list").addClass("compact-mode");
			extraPanelVisible = true;
			lastClickedIssue = issueName;
		}
	}

	function render_issue_list(data, { append = false } = {}) {
		const list_area = $(".issue-list").empty();
		if (!append) {
			$(".issue-list").empty();  // only clear when not appending
		}

		// Containers for two views
		const table_wrapper = $(`<div class="responsive-table table-view"></div>`);
		//const card_wrapper = $(`<div class="card-view"></div>`);
		const card_wrapper = $(`
            <div class="card-view">
                <div class="cards-header d-flex align-items-center gap-2">
                    <input type="checkbox" id="select-all-checkbox" />
                    <div style="width:40px;"></div>
                    <div class="cards-title">Title</div>
                </div>
            </div>
        `);


		// BUILD TABLE (same structure as before)
		const table = $(`
            <table class="table w-100">
                <thead>
                    <tr>
                        <th style="width: 4%; padding: 0; text-align: center; vertical-align: middle;">
                            <label style="margin: 0;">
                                <input type="checkbox" class="select-all-checkbox" style="margin: 0;">
                            </label>
                        </th>
                        <th style="width: 56%;">Title</th>
                        <th style="width: 10%;">Status</th>
                        <th style="width: 10%;">Priority</th>
                        <th style="width: 10%;">Working Agent</th>
                        <th style="width: 10%;">Created</th>
                    </tr>
                </thead>
                <tbody></tbody>
            </table>
        `);
		const tbody = table.find("tbody");

		// Helper to build options (used later)
		function getOptions(options, selected) {
			return options.map(opt => {
				const sel = (opt === selected) ? "selected" : "";
				return `<option value="${opt}" ${sel}>${opt}</option>`;
			}).join("");
		}

		// Iterate docs and create both table rows and card divs
		data.forEach(doc => {
			const initials = get_initials(doc.customer || "");

			const avatarHTML = doc.avatar
				? `<img src="${doc.avatar}" class="rounded-circle flex-shrink-0 avatar-img" 
                data-customer="${doc.customer}" alt="${initials}">`
				: `<div class="avatar-placeholder rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
                data-customer="${doc.customer}" style=" background-color: #e0e0e0; font-weight: bold; color: #555;">
                ${initials}
           </div>`;

			// Table row (keeps your previous markup behavior)
			const row = $(`
                <tr style="vertical-align: middle;" data-issue="${doc.name}">
                    <td class="d-none d-md-table-cell" data-label="Select" style="padding: 0; vertical-align: middle; text-align: center;">
                        <div style="line-height: 1; display: flex; align-items: center; justify-content: center;">
                            <input type="checkbox" class="row-checkbox ml-1" data-issue="${doc.name}" style="margin: 0;" />
                        </div>
                    </td>
                    <td data-label="Title" style="vertical-align:middle">
                        <div class="d-flex gap-2 align-items-center" style="min-width: 0;width:100%">
                            ${avatarHTML}
                            <div class="d-flex flex-column gap-1 ml-3" style="min-width: 0;width:100%">
                                <div class="d-flex justify-content-start text-muted small" style="min-width: 0;">
                                    <div class="ellipsis fontsmall" style="font-weight:600;max-width:70%;" title="${doc.customer}">${doc.customer || ''}</div>
                                    <div class="ellipsis ml-2 fontsmall" style="font-weight:600;text-align: right;max-width:30%;" title="${doc.name}">
                                        <a href="/app/issue/${doc.name}" style="text-decoration: none; color: inherit;">#${doc.name || ''}</a>
                                    </div>
                                </div>
                                ${doc.subject ? `<div class="fw-semibold ellipsis" style="max-width: 100%;" title="${doc.subject}">${doc.subject}</div>` : ''}
                                <div class=" d-flex text-muted small" style="min-width: 0;width:100%;">
                                    ${doc.custom_support_type ? `
                                        <div class="d-flex align-items-center" style="flex: 1 1 0; min-width: 0;" title="${doc.custom_support_type || ""}">
                                        <span class="dot bg-navy flex-shrink-0 mr-2"></span>
                                        <span class="text-truncate fontsmall" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${doc.custom_support_type}</span>
                                        </div>
                                    ` : ''}
                                    ${doc.custom_query_type ? `
                                        <div class="d-flex align-items-center" style="flex: 1 1 0; min-width: 0;" title="${doc.custom_query_type || ""}">
                                        <span class="dot bg-navy flex-shrink-0 mr-2"></span>
                                        <span class="text-truncate fontsmall" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${doc.custom_query_type}</span>
                                        </div>
                                    ` : ''}
                                </div>
                                <div>
                                    ${doc.active_subscription ? `
                                        <span class="badge bg-light border text-muted"
                                            style="display: inline-block; max-width: 100%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;"
                                            title="${doc.active_subscription}">
                                        ${doc.active_subscription}
                                        </span>
                                    ` : ''}
                                </div>
                            </div>
                        </div>
                    </td>

                    <td data-label="Status">
                        <i class="bi bi-activity text-muted"></i>
                        <span class="ml-1">${doc.status || ""}</span>
                    </td>

                    <td data-label="Priority">
                        <span class="priority-dot" style="background:${getPriorityColor(doc.priority)};"></span>
                        <span class="ml-1">${doc.priority || ""}</span>
                    </td>

                    <td data-label="Working Agent">
                        <span class="ellipsis" title="${doc.working_agent}">${doc.working_agent || ""}</span>
                    </td>

                    <td data-label="Created">
                        <div class="d-flex align-items-center gap-2 text-muted small">
                            <i class="bi bi-clock-history"></i>
                            <span class="ellipsis ml-1">${frappe.datetime.comment_when(doc.creation) || ""}</span>
                        </div>
                    </td>
                </tr>
            `);

			tbody.append(row);

			// Card view item (div format)
			const card = $(`
                <div class="issue-card" data-issue="${doc.name}">
                    
                    <!--<div class="card-main d-flex gap-2 align-items-center">
                        <div class="card-checkbox">
                            <input type="checkbox" class="row-checkbox" data-name="${doc.name}" />
                        </div>
                        ${avatarHTML}
                        <div class="card-main-text ml-1" style="min-width:0; flex:1;">
                            <div class="d-flex justify-content-between align-items-start" style="gap:8px;">
                                <div class="title ellipsis" title="${doc.customer || ''}">${doc.customer || ''}</div>
                                <div class="id text-muted" style="white-space:nowrap;">#${doc.name || ''}</div>
                            </div>
                            ${doc.subject ? `<div class="subject" title="${doc.subject}">${doc.subject}</div>` : ''}
                            <div class="card-meta">
                                <div class="meta-item ellipsis" title="${doc.status || ''}">
                                    <i class="bi bi-activity"></i>
                                    <span class="ms-1">${doc.status || ''}</span>
                                </div>
                                <div class="meta-item ellipsis" title="${doc.priority || ''}">
                                    <span class="priority-dot" style="background:${getPriorityColor(doc.priority)};"></span>
                                    <span>${doc.priority || ''}</span>
                                </div>
                                <div class="meta-item ellipsis" title="${doc.working_agent || ''}">
                                    <span class="ms-1">${doc.working_agent || ''}</span>
                                </div>
                                <div class="meta-item d-md-flex d-none" title="${doc.creation || ''}">
                                    <i class="bi bi-clock-history"></i>
                                    <span class="ms-1">${frappe.datetime.comment_when(doc.creation) || ""}</span>
                                </div>
                            </div>
                        </div>
                    </div>-->



                    <div style="line-height: 1; display: flex; align-items: center; justify-content: center;vertical-align:middle;">
                        <input type="checkbox" class="row-checkbox ml-1" data-issue="${doc.name}" style="margin: 0;" />
                    </div>
                    ${avatarHTML}
                    <div class="d-flex flex-column gap-1 ml-1" style="min-width: 0;width:100%">
                        <div class="d-flex justify-content-start text-muted small" style="min-width: 0;">
                            <div class="ellipsis fontsmall" style="font-weight:600;max-width:49%;" title="${doc.customer}">${doc.customer || ''}</div>
                            <div class="ellipsis ml-2 fontsmall" style="font-weight:600;text-align: right;max-width:49%;" title="${doc.name}">
                                <a href="/app/issue/${doc.name}" style="text-decoration: none; color: inherit;">#${doc.name || ''}</a>
                            </div>
                        </div>
                        ${doc.subject ? `
                            <div class="fw-semibold ellipsis" style="max-width: 100%;" title="${doc.subject}">
                                ${doc.subject}
                            </div>
                        ` : ''}
                        <div class="d-flex text-muted small" style="min-width: 0;width:100%;">
                            <div class="d-flex align-items-center" style="flex: 1 1 0; min-width: 0;" title="${doc.status || ""}">
                                <i class="bi bi-activity text-muted flex-shrink-0 mr-2"></i>
                                <span class="text-truncate fontsmall" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${doc.status || ""}</span>
                            </div>
                            <div class="d-flex align-items-center" style="flex: 1 1 0; min-width: 0;" title="${doc.priority || ""}">
                                <span class="priority-dot flex-shrink-0 mr-2" style="background:${getPriorityColor(doc.priority)};"></span>
                                <span class="text-truncate fontsmall" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${doc.priority || ""}</span>
                            </div>
                        </div>
                        ${doc.working_agent ? `
                        <div class="d-flex align-items-center" style="flex: 1 1 0; min-width: 0;" title="${doc.working_agent || ""}">
                            <span class="text-truncate fontsmall" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${doc.working_agent || ""}</span>
                        </div>
                        `: ""}
                        <div>
                            ${doc.active_subscription ? `
                                <span class="badge bg-light border text-muted"
                                    style="display: inline-block; max-width: 100%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;"
                                    title="${doc.active_subscription}">
                                ${doc.active_subscription}
                                </span>
                            ` : ''}
                        </div>
                    </div>

                </div>
            `);

			card_wrapper.append(card);
			// Select All logic
			$(document).on("change", "#select-all-checkbox", function () {
				$(".row-checkbox").prop("checked", $(this).is(":checked"));
			});

			// If avatar not present, replace avatar placeholder when image loads (works for both table & card)
			if (!doc.avatar && doc.customer) {
				frappe.db.get_value("Customer", doc.customer, "image").then(res => {
					const image = res.message.image;
					if (image) {
						// replace in table
						const avatarDiv = row.find(`.avatar-placeholder[data-customer="${doc.customer}"]`);
						if (avatarDiv.length) {
							avatarDiv.replaceWith(`
                            <img src="${image}" class="rounded-circle avatar-img" data-customer="${doc.customer}" width="40" height="40" alt="${initials}">
                        `);
						}
						// replace in card
						const cardAvatarDiv = card.find(`.avatar-placeholder[data-customer="${doc.customer}"]`);
						if (cardAvatarDiv.length) {
							cardAvatarDiv.replaceWith(`
                            <img src="${image}" class="rounded-circle avatar-img" data-customer="${doc.customer}" width="40" height="40" alt="${initials}">
                        `);
						}
					}
				});
			}
		});

		table_wrapper.append(table);
		list_area.append(table_wrapper);
		list_area.append(card_wrapper);

		// Utility: get container (table view or card view) for scoping
		function getActiveContainerFrom(el) {
			return $(el).closest(".table-view, .card-view");
		}

		// Utility: update action bar + log selection
		function updateActionsBar(selectedCount, selectedIds = []) {
			console.log(`[SELECTION] Selected visible rows: ${selectedCount}`);
			console.log(`[SELECTION] Selected IDs:`, selectedIds);

			if (selectedCount > 0) {
				$(".new-issue-btn").addClass("d-none");
				$(".actions-btn-group").removeClass("d-none");
			} else {
				$(".actions-btn-group").addClass("d-none");
				$(".new-issue-btn").removeClass("d-none");
			}
		}

		// ---- Select All Handler ----
		list_area.off("change", "#select-all-checkbox, .select-all-checkbox")
			.on("change", "#select-all-checkbox, .select-all-checkbox", function () {
				const checked = $(this).is(":checked");
				const $container = getActiveContainerFrom(this);

				// Only visible checkboxes
				const $rows = $container.find(".row-checkbox:visible");
				$rows.prop("checked", checked);

				const $checkedRows = $container.find(".row-checkbox:visible:checked");
				const count = $checkedRows.length;
				const ids = $checkedRows.map(function () {
					return $(this).data("issue"); // row must have data-id="<docname>"
				}).get();

				console.log(`[SELECT ALL] Selected visible rows in this view: ${count}`);
				updateActionsBar(count, ids);
			});

		// ---- Single Row Handler ----
		list_area.off("change", ".row-checkbox")
			.on("change", ".row-checkbox", function () {
				const $container = getActiveContainerFrom(this);

				// Only visible checked rows
				const $checkedRows = $container.find(".row-checkbox:visible:checked");
				const count = $checkedRows.length;
				const ids = $checkedRows.map(function () {
					return $(this).data("issue");
				}).get();

				console.log(`[CHECKBOX] Selected visible rows in this view: ${count}`);
				updateActionsBar(count, ids);

				// Sync the "Select All" checkbox
				const totalVisible = $container.find(".row-checkbox:visible").length;
				const allChecked = count === totalVisible && totalVisible > 0;
				$container.find("#select-all-checkbox, .select-all-checkbox").prop("checked", allChecked);
			});

		// CLICK HANDLING: table rows
		list_area.off("click", "tr[data-issue]").on("click", "tr[data-issue]", function (e) {
			if ($(e.target).is("input[type=checkbox], a")) return;
			const issueName = $(this).data("issue");
			handleRowClick(issueName);
		});

		// CLICK HANDLING: cards
		list_area.off("click", ".issue-card").on("click", ".issue-card", function (e) {
			if ($(e.target).is("input[type=checkbox], a")) return;
			const issueName = $(this).data("issue");
			handleRowClick(issueName);
		});

		function getSelectOptions(doctype, fieldname, selectedValue) {
			const field = frappe.meta.get_docfield(doctype, fieldname);
			if (!field || !field.options) return "";

			const options = field.options.split("\n"); // options are newline-separated
			return options.map(opt => {
				const selected = opt === selectedValue ? "selected" : "";
				return `<option value="${opt}" ${selected}>${opt}</option>`;
			}).join("");
		}

		frappe.model.with_doctype("Issue", () => {
			const firstIssue = $(".issue-list tr").first().data("issue");
			if (firstIssue) {
				handleRowClick(firstIssue);
			}
		});

		// central click handler (loads detail panel, highlights row/card)
		function handleRowClick(issueName) {
			// highlight both views
			$(".issue-list tr").removeClass("selected-row");
			$(".issue-list .issue-card").removeClass("selected-card");
			$(`.issue-list tr[data-issue="${issueName}"]`).addClass("selected-row");
			$(`.issue-list .issue-card[data-issue="${issueName}"]`).addClass("selected-card");

			// fetch doc & render panel
			frappe.db.get_doc("Issue", issueName).then(issue => {

				let contactListHTML = "";
				if (issue.issue_contact_list && issue.issue_contact_list.length) {
					contactListHTML = `
						<div class="form-group mb-4">
							<div class="form-label mb-1">Issue Contact List</div>
							<div style="border-radius: 10px; overflow: hidden; border: 1px solid #dddad0;">
							<table class="table table-sm table-bordered" style="width:100%; table-layout: fixed;margin:0px">
								<thead>
									<tr>
										<th style="width: 25%;font-weight:400;white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="User Name">User Name</th>
										<th style="width: 25%;font-weight:400;white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="Email">Email</th>
										<th style="width: 25%;font-weight:400;white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="Phone">Phone</th>
										<th style="width: 25%;font-weight:400;white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="Designation">Designation</th>
									</tr>
								</thead>
								<tbody>
									${issue.issue_contact_list.map(row => `
										<tr>
											<td style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${row.user_name || ''}">${row.user_name || ""}</td>
											<td style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${row.email_id || ''}">${row.email_id || ""}</td>
											<td style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${row.mobile_no || ''}">${row.mobile_no || ""}</td>
											<td style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${row.designation || ''}">${row.designation || ""}</td>
										</tr>
									`).join("")}
								</tbody>
							</table>
							</div>
						</div>

					`;
				} else {
					contactListHTML = `
						<div class="form-group mb-4">
							<label class="form-label">Issue Contact List</label>
							<div class="text-muted">No contacts found</div>
						</div>
					`;
				}


				const panelHTML = `
                    <div class="frappe-form-layout mt-3 ml-3">
                        <div class="form-section">
							<div class="row mb-2 w-100 p-1 align-items-center" 
								style="background-color:#80a4daff;border-radius:10px; color:#ffffff;">
								<div class="col-6">
									<h5 class="mb-0 ellipsis" style="color:#ffffff;" title="${issueName}">
										Details for 
										<span>
											<a href="/app/issue/${issueName}" style="color:#ffffff; text-decoration:none;">
												#${issueName}
											</a>
										</span>
									</h5>
								</div>
								<div class="col-6">
									<div class="row align-items-center">
										<div class="col-3">
											<label class="form-label mb-0" style="color:#ffffff;">Status</label>
										</div>
										<div class="col-9">
											<select id="edit-status" 
													class="form-control ellipsis custom-select-style">
												${getSelectOptions("Issue", "status", issue.status)}
											</select>
										</div>
									</div>  
								</div>
							</div>
							<div class="d-flex justify-content-end mb-3">
								<button class="btn btn-sm btn-success d-none primary-action" id="save-changes-btn">
									Save
								</button>
							</div>
							<hr style="border: 0; height: 1px; background-color: #dddad0;">
							<div class="row align-items-center mb-3">
								<div class="col-2">
									<label class="form-label mb-0">Customer</label>
								</div>
								<div class="col-10">
									<div class="form-control ellipsis">${issue.customer || ""}</div>
								</div>
							</div>

							<div class="row align-items-center mb-3">
								<div class="col-2">
									<label class="form-label mb-0">Subject</label>
								</div>
								<div class="col-10">
									<div class="form-control ellipsis">${issue.subject || ""}</div>
								</div>
							</div>

							<div class="row">
								<div class="col-6">
									<div class="form-group mb-3">
										<div id="edit-working-agent"></div>
									</div>
								</div>

                                <div class="col-6">    
                                    <div class="form-group mb-3">
                                        <label class="form-label">Sales Person</label>
										<div class="form-control ellipsis">${issue.sales_person || ""}</div>
                                        
                                    </div>
                                </div>
                            </div> 

							${issue.active_subscription ? `
								<div class="form-group mb-3">
									<label class="form-label">Active Renewal</label>
									<div class="form-control ellipsis">${issue.active_subscription || ""}</div>
								</div>
							`: ""}

                            <div class="row">
                                <div class="col-6">
                                    <div class="form-group mb-3">
                                        <label class="form-label">Support Type</label>
                                        <select id="edit-support-type" class="form-control ellipsis">
                                            ${getSelectOptions("Issue", "custom_support_type", issue.custom_support_type)}
                                        </select>
                                    </div>
                                </div>
                                <div class="col-6">    
                                    <div class="form-group mb-3">
                                        <label class="form-label">Query Type</label>
										<select id="edit-query-type" class="form-control ellipsis">
											${getSelectOptions("Issue", "custom_query_type", issue.custom_query_type)}
										</select>
                                    </div>
                                </div>
                            </div>
							

                            <div class="row">
                                <div class="col-6">
									<div class="form-group">
										<label class="form-label">Department</label>
										<div class="form-control ellipsis">${issue.department}</div>
									</div>
                                </div>
                                <div class="col-6">    
                                    <div class="form-group mb-3">
                                        <div id="edit-priority"></div>
                                    </div>
                                </div>
                            </div>

                            ${contactListHTML}
                            <!--<div class="form-group mb-4">
                                <label class="form-label">Description</label>
                                <div class="d-flex justify-content-between mb-1">
                                    <button class="btn btn-sm btn-outline-primary" id="edit-description-btn">
                                        <i class="bi bi-pencil"></i> Edit
                                    </button>
                                </div>
                                <div id="description-preview" class="form-control-plaintext border p-2 rounded bg-white" style="min-height:80px;">
                                    ${issue.description || "<span class='text-muted'>No description</span>"}
                                </div>
                            </div>-->

							<div class="form-group mb-4">
                                <div class="d-flex justify-content-between mb-1">
									<label class="form-label">Description</label>
                                    <button class="btn btn-sm btn-outline-primary" id="edit-description-btn">
                                    </button>
                                </div>
                                <div id="description-preview" class="form-control-plaintext border p-2 rounded bg-white" style="min-height:80px;">
                                    ${issue.description || "<span class='text-muted'>No description</span>"}
                                </div>
                            </div>
                        </div>

                        <div class="form-section">
                            <!-- Notes Section -->
                            <div id="notes-container" class="mb-4">
                                <div style="text-align: right; margin-bottom: 10px;">
                                    <button class="btn btn-sm btn-primary" id="add-note-btn">+ New Note</button>
                                </div>
                                <div id="notes-list"></div>
                            </div>
                        </div>

                        <div id="comment-container"></div>

                    </div>
                    `;


				toggleExtraPanel(issueName, panelHTML);

				let $queryType = $("#edit-query-type");
				if ($queryType.children().length === 0 && issue.active_subscription) {
					// fetch Renewal List → Item → tasks
					frappe.call({
						method: "frappe.client.get",
						args: {
							doctype: "Renewal List",
							filters: {
								customer_name: issue.customer,
								product_name: issue.active_subscription
							}
						},
						callback: function (r) {
							if (r.message && r.message.sla_product) {
								////console.log("sla product:",r.message.sla_product);
								frappe.call({
									method: "frappe.client.get",
									args: {
										doctype: "Item",
										name: r.message.sla_product
									},
									callback: function (itemRes) {
										//let data = itemRes.message.custom_tasks || [];
										let data = itemRes.message.custom_sla_tasks || [];
										let tasks = [];
										data.forEach(row => {
											if (row.task && !tasks.includes(row.task)) {
												tasks.push(row.task);
											}
										});

										if (tasks.length > 0) {
											//console.log("Dynamic tasks:", tasks);
											// populate <select> options dynamically
											$queryType.empty();
											tasks.forEach(task => {
												$queryType.append(
													`<option value="${task}" ${task === issue.custom_query_type ? "selected" : ""}>${task}</option>`
												);
											});
										}
									}
								});
							}
						}
					});
				}

				/*let workingAgentControl = frappe.ui.form.make_control({
					parent: $("#edit-working-agent"),   // mount directly into placeholder
					df: {
						fieldtype: 'Link',
						options: 'User',
						fieldname: 'working_agent',
						label: 'Working Agent',
						placeholder: 'Select Working Agent',
						default: issue.working_agent || "",
						onchange: function () {
							markChanged("working_agent", workingAgentControl.get_value());
						}
					},
					render_input: true
				});

				// explicitly set value if issue.working_agent exists
				if (issue.working_agent) {
					workingAgentControl.set_value(issue.working_agent);
				}*/



				// Wire up panel handlers (same as your original)
				/*$("#edit-description-btn").off("click").on("click", function () {
					openRichTextModal("Edit Description", issueName, "description", issue.description || "", "#description-preview");
				});*/

				$("#edit-notes-btn").off("click").on("click", function () {
					openRichTextModal("Edit Notes", issueName, "custom_notes", issue.custom_notes || "", "#notes-preview");
				});

				/*$("#edit-support-type").off("change").on("change", function () {
					saveField(issueName, "custom_support_type", $(this).val());
				});
				$("#edit-query-type").off("change").on("change", function () {
					saveField(issueName, "custom_query_type", $(this).val());
				});
				$("#edit-status").off("change").on("change", function () {
					saveField(issueName, "status", $(this).val());
				});
				$("#edit-priority").off("change").on("change", function () {
					saveField(issueName, "priority", $(this).val());
				});
				$("#edit-working-agent").off("change").on("change", function () {
					saveField(issueName, "working_agent", $(this).val());
				});*/



				// Keep track of original values
				const originalValues = {
					custom_support_type: issue.custom_support_type,
					custom_query_type: issue.custom_query_type,
					status: issue.status,
					priority: issue.priority,
					working_agent: issue.working_agent
				};

				let pendingChanges = {};

				function markChanged(field, value) {
					if (value !== originalValues[field]) {
						pendingChanges[field] = value;
					} else {
						delete pendingChanges[field]; // remove if changed back to original
					}

					if (Object.keys(pendingChanges).length > 0) {
						$("#save-changes-btn").removeClass("d-none");
					} else {
						$("#save-changes-btn").addClass("d-none");
					}
				}

				// For normal select/input fields
				const trackedFields = [
					{ id: "#edit-support-type", field: "custom_support_type" },
					{ id: "#edit-query-type", field: "custom_query_type" },
					{ id: "#edit-status", field: "status" }
					//{ id: "#edit-priority", field: "priority" }
				];

				trackedFields.forEach(({ id, field }) => {
					$(id).off("change").on("change", function () {
						markChanged(field, $(this).val());
					});
				});

				// For frappe control (working agent)
				let workingAgentControl = frappe.ui.form.make_control({
					parent: $("#edit-working-agent"),
					df: {
						fieldtype: 'Link',
						options: 'User',
						fieldname: 'working_agent',
						label: 'Working Agent',
						placeholder: 'Select Working Agent',
						default: issue.working_agent || "",
						onchange: function () {
							markChanged("working_agent", workingAgentControl.get_value());
						}
					},
					render_input: true
				});
				if (issue.working_agent) {
					workingAgentControl.set_value(issue.working_agent);
				}

				let priorityControl = frappe.ui.form.make_control({
					parent: $("#edit-priority"),
					df: {
						fieldtype: 'Link',
						options: 'Issue Priority',
						fieldname: 'priority',
						label: 'Priority',
						placeholder: 'Select Priority',
						default: issue.priority || "",
						onchange: function () {
							const val = priorityControl.get_value();
							//console.log("Priority changed:", val);  // 👈 Debug
							markChanged("priority", val);
						}
					},
					render_input: true
				});

				// Set value if already present
				if (issue.priority) {
					priorityControl.set_value(issue.priority);
				}

				// Save button handler
				$("#save-changes-btn").off("click").on("click", function () {
					if (Object.keys(pendingChanges).length === 0) return;

					frappe.db.set_value("Issue", issueName, pendingChanges)
						.then(() => {
							frappe.show_alert({ message: "Changes saved!", indicator: "green" });
							Object.assign(originalValues, pendingChanges); // update originals
							pendingChanges = {};
							$("#save-changes-btn").addClass("d-none"); // hide after saving
						})
						.catch(() => {
							frappe.show_alert({ message: "Failed to save changes", indicator: "red" });
						});
				});

				// Notes handlers
				$("#notes-container").off("click", "#add-note-btn").on("click", "#add-note-btn", function () {
					frappe.prompt([
						{
							label: 'Note',
							fieldname: 'note',
							fieldtype: 'Small Text',
							reqd: true
						}
					], (values) => {
						const timestamp = frappe.datetime.now_datetime();
						const user = frappe.session.user;

						frappe.call({
							method: "renewal_module.get_user_roles.get_user_roles",
							args: { user },
							callback: function (r) {
								const data = r.message || {};
								frappe.db.insert({
									doctype: "Issue Note",
									parent: issue.name,
									parenttype: "Issue",
									parentfield: "custom_note",
									note: values.note,
									timestamp,
									created_by: data.full_name || user,
									custom_role: data.role_profile || '',
									created_on: timestamp
								}).then(() => {
									renderNotesPanel(issue); // re-render after insert
								});
							}
						});
					}, 'Add Note');
				});

				$("#notes-container").off("click", ".edit-note").on("click", ".edit-note", function () {
					const idx = $(this).data("idx");
					const note = (issue.custom_note || []).find(n => n.idx === idx);
					if (!note) return;

					frappe.prompt([
						{
							label: 'Edit Note',
							fieldname: 'note',
							fieldtype: 'Small Text',
							default: note.note,
							reqd: true
						}
					], (values) => {
						if (note.note === values.note) return;
						frappe.db.set_value("Issue Note", note.name, "note", values.note)
							.then(() => renderNotesPanel(issue));
					}, 'Edit Note');
				});

				// Notes handlers
				$("#notes-container").off("click", "#add-note-btn").on("click", "#add-note-btn", function () {
					frappe.prompt([
						{
							label: 'Note',
							fieldname: 'note',
							fieldtype: 'Small Text',
							reqd: true
						}
					], (values) => {
						const timestamp = frappe.datetime.now_datetime();
						const user = frappe.session.user;

						frappe.call({
							method: "renewal_module.get_user_roles.get_user_roles",
							args: { user },
							callback: function (r) {
								const data = r.message || {};
								frappe.db.insert({
									doctype: "Issue Note",
									parent: issue.name,
									parenttype: "Issue",
									parentfield: "custom_note",
									note: values.note,
									timestamp,
									created_by: data.full_name || user,
									custom_role: data.role_profile || '',
									created_on: timestamp
								}).then(() => {
									renderNotesPanel(issue); // re-render after insert
								});
							}
						});
					}, 'Add Note');
				});

				$("#notes-container").off("click", ".edit-note").on("click", ".edit-note", function () {
					const idx = $(this).data("idx");
					const note = (issue.custom_note || []).find(n => n.idx === idx);
					if (!note) return;

					frappe.prompt([
						{
							label: 'Edit Note',
							fieldname: 'note',
							fieldtype: 'Small Text',
							default: note.note,
							reqd: true
						}
					], (values) => {
						if (note.note === values.note) return;
						frappe.db.set_value("Issue Note", note.name, "note", values.note)
							.then(() => renderNotesPanel(issue));
					}, 'Edit Note');
				});

				$("#notes-container").off("click", ".delete-note").on("click", ".delete-note", function () {
					const idx = $(this).data("idx");
					const note = (issue.custom_note || []).find(n => n.idx === idx);
					if (!note) return;

					frappe.db.delete_doc("Issue Note", note.name).then(() => {
						renderNotesPanel(issue);
					});
				});

				// Render Notes
				renderNotesPanel(issue);
				renderCommentSection(issueName);
				// Load existing comments
				loadComments(issueName);
				// Call this whenever issue data is loaded/refreshed
				renderDescriptionSection(issue);
				//noteDescriptionSection(issue);

			});
		}


		// Save field value helper (same as yours)
		/*function saveField(docname, fieldname, value) {
			frappe.call({
				method: "frappe.client.set_value",
				args: {
					doctype: "Issue",
					name: docname,
					fieldname: { [fieldname]: value }
				},
				callback: function (r) {
					if (!r.exc) {
						frappe.show_alert({ message: `${fieldname} updated`, indicator: "green" });
					}
				}
			});
		}*/

		// Rich text editor modal helper (same as yours)
		/*function openRichTextModal(title, issueName, fieldname, currentValue, previewSelector) {
			ensureBootstrapModal();
			resetStuckModals();
			const d = new frappe.ui.Dialog({
				title: `${title} - #${issueName}`,
				fields: [
					{
						label: title,
						fieldname: "value",
						fieldtype: "Text Editor",
						default: currentValue
					}
				],
				primary_action_label: "Save",
				primary_action(values) {
					frappe.call({
						method: "frappe.client.set_value",
						args: {
							doctype: "Issue",
							name: issueName,
							fieldname: {
								[fieldname]: values.value
							}
						},
						callback: function (r) {
							if (!r.exc) {
								frappe.show_alert({ message: `${title} updated`, indicator: "green" });
								$(previewSelector).html(values.value || `<span class='text-muted'>No ${title.toLowerCase()}</span>`);
								d.hide();
							}
						}
					});
				}
			});
			// Ensure Bootstrap's modal instance is created
			// d.$wrapper.on('shown.bs.modal', function () {
			// 	$(this).removeAttr('aria-hidden'); // prevent close button bug
			// });
			// Remove accidental aria-hidden bug
			// Ensure aria/focus are correct once shown
			d.$wrapper.on('shown.bs.modal', function () {
				$(this).removeAttr('aria-hidden').attr({ 'aria-modal': 'true', role: 'dialog' });
			});

			// Hard-bind the close icon to d.hide() (works even if data API is off)
			d.$wrapper.on('click', '.btn-close, [data-bs-dismiss="modal"]', function (e) {
				e.preventDefault();
				d.hide();
			});


			d.show();
		}*/

		function openRichTextModal(title, issueName, fieldname, currentValue, previewSelector) {
			const d = new frappe.ui.Dialog({
				title: `${title} - #${issueName}`,
				fields: [
					{
						label: title,
						fieldname: "value",
						fieldtype: "Text Editor",
						default: currentValue
					}
				],
				primary_action_label: "Save",
				primary_action(values) {
					frappe.call({
						method: "frappe.client.set_value",
						args: {
							doctype: "Issue",
							name: issueName,
							fieldname: {
								[fieldname]: values.value
							}
						},
						callback: function (r) {
							if (!r.exc) {
								frappe.show_alert({ message: `${title} updated`, indicator: "green" });
								$(previewSelector).html(values.value || `<span class='text-muted'>No ${title.toLowerCase()}</span>`);
								d.hide();
							}
						}
					});
				}
			});

			// DEBUG: log when close button exists
			const $closeBtn = d.$wrapper.find('.btn-close, .modal-close');
			//console.log("Found close buttons:", $closeBtn.length);

			// Bind click
			$closeBtn.off('click.richtextmodal').on('click.richtextmodal', function (e) {
				//console.log("Close button clicked:", this);  // should log when ❌ is clicked
				d.hide();
			});

			d.show();
			setTimeout(() => {
				//console.log("Found close buttons:", d.$wrapper.find(".btn-modal-close").length);
			}, 500);
		}

		function renderDescriptionSection(issue) {
			const hasDescription = issue.description && issue.description.trim() !== "";

			// Update button label & icon based on description availability
			const $btn = $("#edit-description-btn");
			if (hasDescription) {
				$btn.html(`<i class="bi bi-pencil"></i>`);
			} else {
				$btn.html(`<i class="bi bi-plus"></i>`);
			}

			// Update description preview
			$("#description-preview").html(
				hasDescription ? issue.description : "<span class='text-muted'>No description</span>"
			);

			// Re-bind click event
			$btn.off("click").on("click", function () {
				openRichTextModal(
					hasDescription ? "Edit Description" : "Add Description",
					issue.name,
					"description",
					issue.description || "",
					"#description-preview"
				);
			});
		}
		


		function renderNotesPanel(issue) {
			frappe.db.get_doc("Issue", issue.name).then(refreshed => {
				const notes = refreshed.custom_note || [];
				const wrapper = $("#notes-list");
				wrapper.empty();

				if (notes.length === 0) {
					wrapper.append('<p style="color: #888;">No notes added yet.</p>');
					return;
				}

				const user_list = notes.map(n => n.owner);
				frappe.call({
					method: "frappe.client.get_list",
					args: {
						doctype: "User",
						filters: { name: ["in", user_list] },
						fields: ["name", "full_name", "user_image"]
					},
					callback: (r) => {
						const user_map = {};
						(r.message || []).forEach(user => { user_map[user.name] = user; });

						notes.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).forEach(note => {
							const user_email = note.owner;
							const user_info = user_map[user_email] || {};
							const full_name = note.created_by || user_info.full_name || user_email;
							const role = note.custom_role || '';
							const timestamp = note.timestamp ? frappe.datetime.str_to_user(note.timestamp) : '';
							const initials = full_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
							const is_owner = frappe.session.user === user_email;
							const is_admin = frappe.session.user === 'Administrator';

							const profile_html = user_info.user_image
								? `<img src="${user_info.user_image}" style="width: 40px; height: 40px; border-radius: 50%; margin-right: 10px;">`
								: `<div style="width: 40px; height: 40px; background-color: #007bff; color: #fff; border-radius: 50%; text-align: center; line-height: 40px; font-weight: bold; font-size: 14px; margin-right: 10px;">
                                ${initials}
                           </div>`;

							const action_buttons = `
                        ${is_owner || is_admin ? `<a href="#" class="edit-note" data-idx="${note.idx}" style="margin-right: 12px;">✏️ Edit</a>` : ''}
                        ${is_admin ? `<a href="#" class="delete-note" data-idx="${note.idx}" style="color: red;">🗑️ Delete</a>` : ''}
                    `;

							const html = `
                        <div style="border: 1px solid #ddd; border-radius: 8px; padding: 12px; margin-bottom: 12px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                <div style="display: flex; align-items: center;">
                                    ${profile_html}
                                    <div>
                                        <div style="font-weight: bold; font-size: 14px;">${full_name}</div>
                                        ${role ? `<div style="font-size: 12px; color: #666;">${role}</div>` : ''}
                                    </div>
                                </div>
                                <div style="font-size: 12px; color: gray;">${timestamp}</div>
                            </div>
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <div style="white-space: pre-line; flex: 1; color: #444;">
                                    ${frappe.utils.escape_html(note.note)}
                                </div>
                                <div>${action_buttons}</div>
                            </div>
                        </div>
                    `;
							wrapper.append(html);
						});
					}
				});
			});
		}



		// Helper: Load comments list
		function renderCommentSection(issueName) {
			const commentHTML = `
                <div class="comment-section mt-3">
                    <textarea id="new-comment-input" placeholder="Write a comment..." 
                            class="form-control" style="min-height:60px;"></textarea>
                    <button id="add-comment-btn" class="btn btn-primary mt-2">Add Comment</button>
                    <div id="comments-list" class="mt-3"></div>
                </div>
            `;

			$("#comment-container").html(commentHTML);
			loadComments(issueName);

			$("#add-comment-btn").off("click").on("click", function () {
				const text = $("#new-comment-input").val().trim();
				if (!text) {
					frappe.msgprint("Please enter a comment.");
					return;
				}

				frappe.call({
					method: "renewal_module.custom_module.page.custom_issue_view.custom_issue_view.add_custom_comment",
					args: {
						docname: issueName,
						content: text
					},
					callback: function (r) {
						if (!r.exc) {
							frappe.show_alert({ message: "Comment added", indicator: "green" });
							$("#new-comment-input").val("");
							loadComments(issueName);
						}
					}
				});
			});
		}


		function loadComments(issueName) {
			frappe.db.get_list("Comment", {
				filters: {
					reference_doctype: "Issue",
					reference_name: issueName
				},
				fields: ["*"],
				order_by: "creation desc"
			}).then(comments => {
				const $list = $("#comments-list").empty();
				if (comments.length === 0) {
					$list.html(`<span class="text-muted">No comments yet.</span>`);
				} else {
					comments.forEach(c => {
						$list.append(`
                    <div class="mb-2 border-bottom pb-1">
                        <small class="text-muted">${frappe.datetime.comment_when(c.creation)} by ${c.comment_email}</small>
                        <div>${c.content}</div>
                    </div>
                `);
					});
				}
			});
		}



	}

	/*page.body.on("click", ".filter-button", function () {
		load_data({ reset: true });
	});

	page.body.on("click", ".filter-x-button", function () {
		load_data({ reset: true });
	});*/
	$(".btn-paging[data-value='20']").addClass("btn-info");
	load_data();

	/*function ensureBootstrapModal() {
		return new Promise(resolve => {
			if (window.bootstrap && window.bootstrap.Modal) return resolve();
			const s = document.createElement('script');
			s.src = "https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js";
			s.onload = resolve;
			document.body.appendChild(s);
		});
	}


	// 2) Clean up any stuck modals/backdrops that can block focus/close
	function resetStuckModals() {
		document.querySelectorAll('.modal.show').forEach(el => {
			try {
				const inst = window.bootstrap && window.bootstrap.Modal
					? window.bootstrap.Modal.getInstance(el)
					: null;
				if (inst) inst.hide();
			} catch (_) { }
			el.removeAttribute('aria-hidden');
		});
		// Remove orphaned backdrops and body state
		$('.modal-backdrop').remove();
		$('body').removeClass('modal-open')
			.attr('style', function (_, s) {
				return s ? s.replace(/padding-right:\s*\d+px;?/g, '') : s;
			});
	}*/

};