frappe.pages['job-posting'].on_page_load = function (wrapper) {
	localStorage.removeItem('job_postings_page_length');
	// Store the instance in frappe for later access
	frappe.job_posting_page = new jobpostingpage(wrapper);
};

// --- Local helpers for job posting (storage) - SYNCHRONIZED with job_recruitment ---
var REQ_KEY = 'job_reqs_demo_v2'; // Same as job_recruitment.js
var SELECTED_KEY = 'job_selected_req_v3';

function loadReqs() {
	try {
		var v = localStorage.getItem(REQ_KEY);
		return v ? JSON.parse(v) : [];
	} catch (e) {
		return [];
	}
}

function saveReqs(r) {
	try {
		localStorage.setItem(REQ_KEY, JSON.stringify(r || []));
	} catch (e) { }
}

function loadSelected() {
	try {
		var v = localStorage.getItem(SELECTED_KEY);
		var n = parseInt(v);
		return isNaN(n) ? null : n;
	} catch (e) { return null; }
}

function saveSelected(i) {
	try {
		if (i === undefined || i === null) localStorage.setItem(SELECTED_KEY, '');
		else localStorage.setItem(SELECTED_KEY, String(i));
	} catch (e) { }
}

// Seed lightweight demo data so the list shows up on first load
if (!loadReqs().length) {
	saveReqs([
		{
			id: 'JOB-001',
			title: 'Sales Executive',
			dept: 'Sales',
			location: 'Bengaluru',
			type: 'Full-Time',
			experience: '1-3 yrs',
			description: 'Reporting to Sales Manager. Communication, Negotiation, CRM.',
			salary: '3L - 4L',
			posted_on: '2026-02-10',
			status: 'Open'
		},
		{
			id: 'JOB-002',
			title: 'Senior Developer',
			dept: 'Engineering',
			location: 'Remote',
			type: 'Full-Time',
			experience: '4-8 yrs',
			description: 'Full stack JS. React/Node experience.',
			salary: '12L - 18L',
			posted_on: '2026-02-08',
			status: 'Open'
		}
	]);
}


frappe.pages['job-posting'].on_page_show = function (wrapper) {
	const pageWrapper = wrapper || $(".page")[0] || document.body;

	const ensureSupportLayoutLoaded = (cb) => {
		if (typeof loadSupportLayout === "function") return cb();
		frappe.require(["/assets/renewal_module/js/issue_themes/support_layout2.js"], () => {
			setTimeout(cb, 10);
		});
		frappe.require(["/assets/renewal_module/css/issue_themes/support_theme2.css"]);
	};

	ensureSupportLayoutLoaded(() => {
		loadSupportLayout(pageWrapper, () => {
			if (!frappe.job_posting_page || frappe.job_posting_page.wrapper !== pageWrapper) {
				frappe.job_posting_page = new jobpostingpage(pageWrapper);
			}
			frappe.job_posting_page.render();
		});
	});
};

class jobpostingpage {
	constructor(wrapper) {
		this.wrapper = wrapper;
		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: 'Job Posting',
			single_column: true
		});
		this.page_length = 20;
		this.LOAD_MORE_SIZE = 50;
		this.visible_count = 0;
		this.all_jobs = [];
		this.selected_jobs = new Set();
		this.departmentsMaster = [];
		// cache for standard designations used in autocomplete/validation
		this.designationsMaster = [];
	}

	render() {
		const waitForContent = () => {
			const $content = $("#support-page-content");
			if (!$content.length) {
				setTimeout(waitForContent, 50);
				return;
			}
			$content.empty().append(frappe.job_posting_page_template.body);
			this.handleRoute();
		};
		waitForContent();
	}

	handleRoute() {
		const route = frappe.get_route();
		console.log("handleRoute:", route);

		// Load data first
		if (!this.data_loaded) {
			this.loadJobData();
		} else if (route.length === 1) {
			this.show_list();
		} else if (route.length === 2 && route[1] === "new") {
			this.show_new();
		} else if (route.length === 2) {
			const jobId = route[1];
			this.show_details(jobId);
		}
	}

	loadJobData() {
		// Fetch data from Python backend using Frappe RPC
		frappe.call({
			method: 'renewal_module.custom_module.page.job_posting.job_posting.get_job_openings',
			args: {
				filters: {},
				start: 0,
				page_length: 100
			},
			callback: (r) => {
				if (r.message && r.message.status === 'success') {
					this.all_jobs = r.message.data || [];
					this.total_records = r.message.total || 0;
				} else {
					this.all_jobs = loadReqs() || [];
					this.total_records = this.all_jobs.length;
				}

				if (!Array.isArray(this.all_jobs)) {
					this.all_jobs = [];
				}

				this.visible_count = Math.min(this.page_length, this.all_jobs.length);
				this.data_loaded = true;

				// Now handle the route
				const route = frappe.get_route();
				setTimeout(() => {
					if (route.length === 1) {
						this.show_list();
					} else if (route.length === 2 && route[1] === "new") {
						this.show_new();
					} else if (route.length === 2) {
						const jobId = route[1];
						this.show_details(jobId);
					}
				}, 100);
			},
			error: (err) => {
				this.all_jobs = loadReqs() || [];
				this.total_records = this.all_jobs.length;
				this.visible_count = Math.min(this.page_length, this.total_records);
				if (!Array.isArray(this.all_jobs)) {
					this.all_jobs = [];
				}
				this.data_loaded = true;
				const route = frappe.get_route();
				setTimeout(() => {
					if (route.length === 1) {
						this.show_list();
					} else if (route.length === 2 && route[1] === "new") {
						this.show_new();
					} else if (route.length === 2) {
						const jobId = route[1];
						this.show_details(jobId);
					}
				}, 100);
			}
		});
	}

	setPageTitle(title) {
		document.title = title;
		this.page.set_title(title);
	}

	setActiveSidebar() {
		const route = frappe.get_route();
		const baseRoute = route[0];

		$(".side-nav-link").removeClass("active-menu");
		$(".side-nav-item").removeClass("active-menu-item");
		$(".menu-parent").removeClass("active");

		$(".side-nav-link[data-page]").each(function () {
			const $link = $(this);
			const linkPage = $link.data("page");
			if (!linkPage) return;

			if (linkPage === baseRoute) {
				$link.addClass("active-menu");
				const $item = $link.closest(".side-nav-item");
				$item.addClass("active-menu-item");
				const $parent = $link.closest(".menu-parent");
				if ($parent.length) {
					$parent.addClass("active");
				}
			}
		});

		if (window.syncSupportSidebarArrows) {
			window.syncSupportSidebarArrows();
		}
	}

	show_list() {
		$(".job-list-view").removeClass("d-none");
		$(".job-details-view").addClass("d-none");
		$(".new-job-form").addClass("d-none");
		this.setPageTitle("Job Postings");
		this.setActiveSidebar();

		setTimeout(() => {
			this.restoreFiltersFromUrlOrStorage();
			this.render_rows();
			this.bindTableEvents();
			this.bindCreateJobButton();
		}, 100);
	}

	show_details(jobId) {
		$(".job-list-view").addClass("d-none");
		$(".job-details-view").removeClass("d-none");
		$(".new-job-form").addClass("d-none");

		const job = this.all_jobs.find(j => j.id === jobId);

		if (job) {
			this.setPageTitle(`Job Posting: ${job.title}`);
			this.renderJobDetails(job);
		} else {
		}
		this.setActiveSidebar();
	}

	show_new() {
		$(".job-list-view").addClass("d-none");
		$(".job-details-view").addClass("d-none");
		$(".new-job-form").removeClass("d-none");
		this.setPageTitle("Create New Job Posting");
		this.setActiveSidebar();

		setTimeout(() => {
			const wrapper = this.page.wrapper[0] || this.page.wrapper;
			const form = wrapper.querySelector("#new-job-form");

			if (form) {
				this.resetJobForm(form);
				this.initializeWizard();
				this.bindJobFormEvents();
			}
		}, 100);
	}


	// APPLY FILTERS TO DATA - Read filter values from DOM and filter all_jobs
	applyFilters() {
		try {
			const wrapper = this.page.wrapper[0] || this.page.wrapper;

			// Get filter values from DOM
			const statusEl = wrapper.querySelector('[data-table-filter="status"]');
			const idEl = wrapper.querySelector('#ID');
			const titleEl = wrapper.querySelector('#jobTitle');

			const statusVal = statusEl ? statusEl.value.toLowerCase() : "";
			const idVal = idEl ? idEl.value.toLowerCase() : "";
			const titleVal = titleEl ? titleEl.value.toLowerCase() : "";

			// Store active filters
			this.active_filters = {
				status: statusVal,
				id: idVal,
				title: titleVal
			};

			// Filter all_jobs based on values
			this.filtered_jobs = (this.all_jobs || []).filter(job => {
				// Status filter
				if (statusVal && (job.status || '').toLowerCase() !== statusVal) {
					return false;
				}

				// ID filter
				if (idVal && !(job.id || '').toLowerCase().includes(idVal)) {
					return false;
				}

				// Title filter
				if (titleVal && !(job.title || '').toLowerCase().includes(titleVal)) {
					return false;
				}

				return true;
			});

			// Update total records and visible count based on filtered data
			this.filtered_total = this.filtered_jobs.length;
			this.visible_count = Math.min(this.page_length, this.filtered_total);


		} catch (err) {
			this.filtered_jobs = this.all_jobs || [];
		}
	}

	render_rows() {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const tbody = wrapper.querySelector(".jobs-table tbody");

		if (!tbody) {
			return;
		}
		tbody.innerHTML = "";

		if (!Array.isArray(this.all_jobs) || this.all_jobs.length === 0) {
			tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">No job postings found</td></tr>';
			return;
		}

		this.visible_count = Math.min(this.visible_count || 0, this.total_records || this.all_jobs.length);
		const data_to_render = this.filtered_jobs && this.active_filters && (this.active_filters.status || this.active_filters.id || this.active_filters.title) ? this.filtered_jobs : this.all_jobs;
		const visible_jobs = data_to_render.slice(0, this.visible_count);

		visible_jobs.forEach((job, idx) => {
			const row = document.createElement('tr');
			row.className = 'job-row';
			row.dataset.jobId = job.id || 'UNKNOWN';

			const statusClass = this.getStatusClass(job.status);
			const createdDate = this.formatDate(job.posted_on);

			const jobId = job.id || 'N/A';
			const jobTitle = job.title || 'Untitled';
			const jobStatus = job.status || 'Open';
			const jobDept = job.dept || 'N/A';
			const jobLocation = job.location || 'N/A';

			row.innerHTML = `
				<td style="width: 40px;">
					<input type="checkbox" class="job-select-checkbox" data-idx="${idx}" />
				</td>
				<td>
					<a href="javascript:void(0)" class="job-link fw-medium text-dark" title="${this.escapeHtml(jobTitle)}">${this.escapeHtml(jobTitle)}</a>
				</td>
				<td>
					<span class="pill ${statusClass}" title="${jobStatus}">${this.escapeHtml(jobStatus)}</span>
				</td>
				<td class="ellipsis" title="${this.escapeHtml(jobDept)}">
					${this.escapeHtml(jobDept)}
				</td>
				<td class="ellipsis" title="${this.escapeHtml(jobLocation)}">
					${this.escapeHtml(jobLocation)}
				</td>
				<td class="ellipsis text-muted" title="${this.escapeHtml(jobId)}">
					${this.escapeHtml(jobId)}
				</td>
				<td class="text-center job-date-cell">
					${createdDate}
				</td>
			`;
			tbody.appendChild(row);
		});

		// Update pagination info
		const infoBlocks = wrapper.querySelectorAll(".pagination-info");
		infoBlocks.forEach(info => {
			info.textContent = `${this.visible_count} of ${this.total_records}`;
		});

		// Update count header
		const visible = wrapper.querySelector("#visible-count");
		const total = wrapper.querySelector("#total-count");
		if (visible) visible.textContent = this.visible_count;
		if (total) total.textContent = this.total_records;

		// Load More button visibility
		const loadMoreBtn = wrapper.querySelector(".btn-more");
		if (loadMoreBtn) {
			loadMoreBtn.style.display = this.visible_count < this.total_records ? "block" : "none";
		}
	}

	bindTableEvents() {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const me = this;

		// Handle job ID click
		$(wrapper)
			.off("click", ".job-link")
			.on("click", ".job-link", function (e) {
				e.preventDefault();
				const jobId = $(this).closest("tr").data("jobId");
				frappe.set_route("job-posting", jobId);
			});

		// Select all checkbox
		$(wrapper)
			.off("change", "#selectAllJobs")
			.on("change", "#selectAllJobs", function () {
				const isChecked = $(this).prop("checked");
				wrapper.querySelectorAll(".job-select-checkbox").forEach(cb => {
					cb.checked = isChecked;
				});
			});

		// Load more button
		const loadMoreBtn = wrapper.querySelector(".btn-more");
		if (loadMoreBtn) {
			$(loadMoreBtn)
				.off("click")
				.on("click", function () {
					me.visible_count = Math.min(me.visible_count + me.LOAD_MORE_SIZE, me.total_records);
					me.render_rows();
					me.bindTableEvents();
				});
		}

		// Pagination buttons (20, 100, 500, 2500)
		$(wrapper)
			.off("click", ".btn-paging")
			.on("click", ".btn-paging", function () {
				const pageLength = parseInt($(this).data("value"));
				me.page_length = pageLength;
				me.visible_count = Math.min(pageLength, me.total_records);

				// Update active button styling
				$(wrapper).find(".btn-paging").removeClass("active");
				$(this).addClass("active");

				me.render_rows();
				me.bindTableEvents();
			});

		// Filter button - Apply filters and update URL
		const filterBtn = wrapper.querySelector("#filter-btn");
		if (filterBtn) {
			$(filterBtn)
				.off("click")
				.on("click", function (e) {
					e.preventDefault();
					// Update URL with filters and refresh
					me.updateUrlWithFilters();
					me.render_rows();
					me.bindTableEvents();
				});
		}

		// Status filter change event
		const statusEl = wrapper.querySelector('[data-table-filter="status"]');
		if (statusEl) {
			$(statusEl)
				.off("change")
				.on("change", function () {
					me.updateUrlWithFilters();
					me.applyFilters();
					me.render_rows();
				});
		}

		// ID input filter event
		const idEl = wrapper.querySelector('#ID');
		if (idEl) {
			$(idEl)
				.off("keyup")
				.on("keyup", function () {
					me.updateUrlWithFilters();
					me.applyFilters();
					me.render_rows();
				});
		}

		// Job Title input filter event
		const titleEl = wrapper.querySelector('#jobTitle');
		if (titleEl) {
			$(titleEl)
				.off("keyup")
				.on("keyup", function () {
					me.updateUrlWithFilters();
					me.applyFilters();
					me.render_rows();
				});
		}

		// Clear filters button
		const clearFilterBtn = wrapper.querySelector(".filter-x-button");
		if (clearFilterBtn) {
			$(clearFilterBtn)
				.off("click")
				.on("click", function (e) {
					e.preventDefault();
					// Clear all filter inputs
					if (statusEl) statusEl.value = "";
					if (idEl) idEl.value = "";
					if (titleEl) titleEl.value = "";
					// Update URL
					me.updateUrlWithFilters();
					// Clear localStorage filters
					localStorage.removeItem("job_posting_filters");
					// Refresh table
					me.applyFilters();
					me.render_rows();
					me.bindTableEvents();
				});
		}

		// Sort button
		const sortBtn = wrapper.querySelector("#sort-btn");
		if (sortBtn) {
			$(sortBtn)
				.off("click")
				.on("click", function (e) {
					e.preventDefault();
					frappe.msgprint({
						title: "Info",
						message: "Sort functionality coming soon",
						indicator: "blue"
					});
				});
		}

	}

	bindCreateJobButton() {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const createBtn = wrapper.querySelector("#new-job-btn");

		if (createBtn) {
			$(createBtn)
				.off("click")
				.on("click", function (e) {
					e.preventDefault();
					frappe.set_route("job-posting", "new");
				});
		} else {
		}
	}

	bindJobFormEvents() {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const form = wrapper.querySelector("#new-job-form");
		const me = this;

		if (!form) {
			return;
		}

		// Ensure wizard actions are present even if template rendering gets truncated.
		this.ensureWizardNavigation(form);

		// Reset form to empty state
		this.resetJobForm(form);

		// Setup multi-select autocomplete for skills
		this.setupMultiSelectAutocomplete(form, {
			inputId: "required-skills-input",
			dropdownId: "required-skills-dropdown",
			tagsId: "required-skills-tags",
			hiddenId: "required-skills-hidden",
			options: [
				"Java", "Python", "JavaScript", "TypeScript", "React", "Angular", "Vue.js", "Node.js",
				"SQL", "PostgreSQL", "MongoDB", "AWS", "Azure", "Google Cloud", "Docker", "Kubernetes",
				"Git", "CI/CD", "REST API", "GraphQL", "Machine Learning", "Data Analysis", "Linux",
				"C++", "C#", ".NET", "PHP", "Ruby", "Go", "Swift", "Kotlin", "Android Development", "iOS Development"
			]
		});

		this.setupMultiSelectAutocomplete(form, {
			inputId: "preferred-skills-input",
			dropdownId: "preferred-skills-dropdown",
			tagsId: "preferred-skills-tags",
			hiddenId: "preferred-skills-hidden",
			options: [
				"Communication", "Leadership", "Team Management", "Problem Solving", "Critical Thinking",
				"Time Management", "Adaptability", "Collaboration", "Creativity", "Emotional Intelligence",
				"Conflict Resolution", "Decision Making", "Presentation Skills", "Negotiation", "Active Listening",
				"Attention to Detail", "Stress Management", "Project Management", "Customer Service",
				"Strategic Thinking", "Interpersonal Skills", "Analytical Skills", "Mentoring", "Public Speaking"
			]
		});

		// Department autocomplete from existing Department records
		this.setupJobTitleAutocomplete(form);
		this.fetchJobTitles();
		this.setupDepartmentAutocomplete(form);
		this.fetchDepartments();
		// Designation should be taken from standard list
		this.setupDesignationAutocomplete(form);
		this.fetchDesignations();
		this.setupBenefitsEditor(form);
		this.setupDescriptionEditor(form);

		// Bind cancel button
		const cancelBtn = form.querySelector('.btn-cancel');
		if (cancelBtn) {
			cancelBtn.addEventListener('click', () => {
				frappe.set_route('job-posting');
			});
		}

		// Bind submit button (final step)
		const submitBtn = form.querySelector(".btn-wizard-submit");
		if (submitBtn) {
			submitBtn.addEventListener("click", () => {
				this.submitJobForm();
			});
		}
	}

	fetchJobTitles() {
		return new Promise((resolve) => {
			frappe.call({
				method: "frappe.client.get_list",
				args: {
					doctype: "Job Opening",
					fields: ["name", "job_title", "department"],
					filters: [["job_title", "is", "set"]],
					limit_page_length: 500,
					order_by: "job_title asc"
				},
				callback: (r) => {
					const rows = (r && r.message) ? r.message : [];
					if (rows.length) {
						resolve(rows);
						return;
					}

					const localUnique = Array.from(new Set((this.all_jobs || []).map(x => String(x.title || "").trim()).filter(Boolean)));
					resolve(localUnique.map(t => ({ name: t, job_title: t, department: "" })));
				},
				error: () => {
					const localUnique = Array.from(new Set((this.all_jobs || []).map(x => String(x.title || "").trim()).filter(Boolean)));
					resolve(localUnique.map(t => ({ name: t, job_title: t, department: "" })));
				}
			});
		});
	}

	setupJobTitleAutocomplete(form) {
		const titleInput = form.querySelector('input[name="title"]');
		const departmentInput = form.querySelector('input[name="department"]');
		if (!titleInput) return;

		const wrapper = document.createElement("div");
		wrapper.style.position = "relative";
		titleInput.parentNode.insertBefore(wrapper, titleInput);
		wrapper.appendChild(titleInput);

		const dropdownDiv = document.createElement("div");
		dropdownDiv.id = "job-title-dropdown-create";
		dropdownDiv.style.cssText = "position:absolute;top:100%;left:0;right:0;background:#fff;border:1px solid #e2e8f0;border-radius:6px;max-height:220px;overflow-y:auto;display:none;z-index:1000;box-shadow:0 2px 8px rgba(0,0,0,0.1);";
		wrapper.appendChild(dropdownDiv);

		let titles = [];
		let inputTimeout;

		const render = (searchText) => {
			const q = String(searchText || "").toLowerCase().trim();
			const filtered = titles.filter(t => {
				const title = String(t.job_title || "").toLowerCase();
				const name = String(t.name || "").toLowerCase();
				return title.includes(q) || name.includes(q);
			});

			if (!filtered.length) {
				dropdownDiv.innerHTML = '<div style="padding:8px;color:#94a3b8;">No job titles found</div>';
				dropdownDiv.style.display = "block";
				return;
			}

			dropdownDiv.innerHTML = filtered.map(t => {
				const rawTitle = String(t.job_title || "");
				const safeTitle = this.escapeHtml(rawTitle);
				const safeName = this.escapeHtml(t.name || rawTitle);
				const encodedTitle = encodeURIComponent(rawTitle);
				const encodedDept = encodeURIComponent(String(t.department || ""));
				return `
					<button type="button" class="job-title-option-create" data-value="${encodedTitle}" data-department="${encodedDept}" style="display:block;width:100%;padding:10px 12px;border:none;background:none;text-align:left;cursor:pointer;color:#1e293b;font-size:14px;transition:all .15s;">
						<div style="font-weight:600;">${safeTitle}</div>
						<div style="font-size:12px;color:#64748b;">${safeName}</div>
					</button>
				`;
			}).join("");

			dropdownDiv.style.display = "block";

			dropdownDiv.querySelectorAll(".job-title-option-create").forEach(btn => {
				const applyTitleSelection = (e) => {
					e.preventDefault();
					e.stopPropagation();
					const selectedTitle = decodeURIComponent(btn.getAttribute("data-value") || "");
					const selectedDept = decodeURIComponent(btn.getAttribute("data-department") || "");
					titleInput.value = selectedTitle;

					if (departmentInput && selectedDept) {
						departmentInput.value = selectedDept;
						departmentInput.dataset.standardDepartment = selectedDept;
						departmentInput.style.borderColor = "#e2e8f0";
					}

					dropdownDiv.style.display = "none";
				};

				btn.addEventListener("mousedown", applyTitleSelection);
				btn.addEventListener("click", applyTitleSelection);
				btn.addEventListener("mouseenter", () => {
					btn.style.background = "#f1f5f9";
				});
				btn.addEventListener("mouseleave", () => {
					btn.style.background = "none";
				});
			});
		};

		titleInput.addEventListener("focus", async () => {
			if (!titles.length) {
				titles = await this.fetchJobTitles();
			}
			render("");
		});

		titleInput.addEventListener("input", async () => {
			clearTimeout(inputTimeout);
			inputTimeout = setTimeout(async () => {
				if (!titles.length) {
					titles = await this.fetchJobTitles();
				}
				render(titleInput.value);
			}, 250);
		});

		titleInput.addEventListener("blur", () => {
			setTimeout(() => {
				dropdownDiv.style.display = "none";
			}, 200);
		});

		document.addEventListener("click", (e) => {
			if (!wrapper.contains(e.target)) {
				dropdownDiv.style.display = "none";
			}
		});
	}

	fetchDepartments() {
		return new Promise((resolve) => {
			frappe.call({
				method: "frappe.client.get_list",
				args: {
					doctype: "Department",
					fields: ["name", "department_name"],
					limit_page_length: 200,
					order_by: "name asc"
				},
				callback: (r) => {
					const departments = (r && r.message) ? r.message : [];
					if (departments.length) {
						this.departmentsMaster = departments;
						resolve(departments);
						return;
					}

					// Fallback: pull unique departments from existing Job Openings
					frappe.call({
						method: "frappe.client.get_list",
						args: {
							doctype: "Job Opening",
							fields: ["department"],
							filters: [["department", "is", "set"]],
							limit_page_length: 500,
							order_by: "department asc"
						},
						callback: (jr) => {
							const rows = (jr && jr.message) ? jr.message : [];
							const unique = Array.from(new Set(rows.map(x => String(x.department || "").trim()).filter(Boolean)));
							const mapped = unique.map(d => ({ name: d, department_name: d }));
							this.departmentsMaster = mapped;
							resolve(mapped);
						},
						error: () => {
							const localUnique = Array.from(new Set((this.all_jobs || []).map(x => String(x.dept || "").trim()).filter(Boolean)));
							const mapped = localUnique.map(d => ({ name: d, department_name: d }));
							this.departmentsMaster = mapped;
							resolve(mapped);
						}
					});
				},
				error: () => {
					const localUnique = Array.from(new Set((this.all_jobs || []).map(x => String(x.dept || "").trim()).filter(Boolean)));
					const mapped = localUnique.map(d => ({ name: d, department_name: d }));
					this.departmentsMaster = mapped;
					resolve(mapped);
				}
			});
		});
	}

	// -----------------------------------------------------------------
	// New methods for designations
	// -----------------------------------------------------------------

	fetchDesignations() {
		return new Promise((resolve) => {
			frappe.call({
				method: "frappe.client.get_list",
				args: {
					doctype: "Designation",
					fields: ["name", "designation_name"],
					limit_page_length: 500,
					order_by: "name asc"
				},
				callback: (r) => {
					const list = (r && r.message) ? r.message : [];
					this.designationsMaster = list;
					resolve(list);
				},
				error: () => {
					// fallback: use unique designation values already present in jobs
					const unique = Array.from(new Set((this.all_jobs || []).map(x => String(x.designation || "").trim()).filter(Boolean)));
					const mapped = unique.map(d => ({ name: d, designation_name: d }));
					this.designationsMaster = mapped;
					resolve(mapped);
				}
			});
		});
	}

	getStandardDesignationValue(rawValue, designations) {
		const source = Array.isArray(designations) ? designations : this.designationsMaster;
		const text = String(rawValue || "").trim().toLowerCase();
		if (!text) return "";

		const match = source.find(d => {
			const name = String(d.name || "").trim().toLowerCase();
			const label = String(d.designation_name || "").trim().toLowerCase();
			return text === name || text === label;
		});

		return match ? String(match.name || "").trim() : "";
	}

	setupDesignationAutocomplete(form) {
		const designationInput = form.querySelector('input[name="designation"]');
		if (!designationInput) return;

		const wrapper = document.createElement("div");
		wrapper.style.position = "relative";
		designationInput.parentNode.insertBefore(wrapper, designationInput);
		wrapper.appendChild(designationInput);

		const dropdownDiv = document.createElement("div");
		dropdownDiv.id = "designation-dropdown";
		dropdownDiv.style.cssText = "position:absolute;top:100%;left:0;right:0;background:#fff;border:1px solid #e2e8f0;border-radius:6px;max-height:200px;overflow-y:auto;display:none;z-index:1000;box-shadow:0 2px 8px rgba(0,0,0,0.1);";
		wrapper.appendChild(dropdownDiv);

		let designations = [];
		let inputTimeout;

		const render = (searchText) => {
			const q = String(searchText || "").toLowerCase().trim();
			const filtered = designations.filter(d => {
				const name = String(d.name || "").toLowerCase();
				const label = String(d.designation_name || "").toLowerCase();
				return name.includes(q) || label.includes(q);
			});

			if (!filtered.length) {
				dropdownDiv.innerHTML = '<div style="padding:8px;color:#94a3b8;">No designations found</div>';
				dropdownDiv.style.display = "block";
				return;
			}

			dropdownDiv.innerHTML = filtered.map(d => {
				const raw = String(d.designation_name || d.name || "");
				const safe = this.escapeHtml(raw);
				const encoded = encodeURIComponent(raw);
				return `
					<button type="button" class="designation-option" data-value="${encoded}" style="display:block;width:100%;padding:10px 12px;border:none;background:none;text-align:left;cursor:pointer;color:#1e293b;font-size:14px;transition:all .15s;">
						<div style="font-weight:600;">${safe}</div>
					</button>
				`;
			}).join("");

			dropdownDiv.style.display = "block";

			dropdownDiv.querySelectorAll(".designation-option").forEach(btn => {
				const apply = (e) => {
					e.preventDefault();
					e.stopPropagation();
					const val = decodeURIComponent(btn.getAttribute("data-value") || "");
					designationInput.value = val;
					// mark as selected from standard list
					designationInput.dataset.standardDesignation = val;
					designationInput.style.borderColor = "#e2e8f0";
					dropdownDiv.style.display = "none";
				};

				btn.addEventListener("mousedown", apply);
				btn.addEventListener("click", apply);
				btn.addEventListener("mouseenter", () => { btn.style.background = "#f1f5f9"; });
				btn.addEventListener("mouseleave", () => { btn.style.background = "none"; });
			});
		};

		designationInput.addEventListener("focus", async () => {
			if (!designations.length) {
				designations = await this.fetchDesignations();
			}
			render("");
		});

		designationInput.addEventListener("input", async () => {
			clearTimeout(inputTimeout);
			inputTimeout = setTimeout(async () => {
				if (!designations.length) {
					designations = await this.fetchDesignations();
				}
				render(designationInput.value);
			}, 250);
		});

		designationInput.addEventListener("blur", () => {
			setTimeout(() => { dropdownDiv.style.display = "none"; }, 200);
		});

		document.addEventListener("click", (e) => {
			if (!wrapper.contains(e.target)) {
				dropdownDiv.style.display = "none";
			}
		});
	}

	getStandardDepartmentValue(rawValue, departments) {
		const source = Array.isArray(departments) ? departments : this.departmentsMaster;
		const text = String(rawValue || "").trim().toLowerCase();
		if (!text) return "";

		const match = source.find((d) => {
			const name = String(d.name || "").trim().toLowerCase();
			const label = String(d.department_name || "").trim().toLowerCase();
			return text === name || text === label;
		});

		return match ? String(match.name || "").trim() : "";
	}

	setupDepartmentAutocomplete(form) {
		const departmentInput = form.querySelector('input[name="department"]');
		if (!departmentInput) return;

		const wrapper = document.createElement("div");
		wrapper.style.position = "relative";
		departmentInput.parentNode.insertBefore(wrapper, departmentInput);
		wrapper.appendChild(departmentInput);

		const dropdownDiv = document.createElement("div");
		dropdownDiv.id = "department-dropdown";
		dropdownDiv.style.cssText = "position:absolute;top:100%;left:0;right:0;background:#fff;border:1px solid #e2e8f0;border-radius:6px;max-height:200px;overflow-y:auto;display:none;z-index:1000;box-shadow:0 2px 8px rgba(0,0,0,0.1);";
		wrapper.appendChild(dropdownDiv);

		let departments = [];
		let inputTimeout;

		const render = (searchText) => {
			const q = String(searchText || "").toLowerCase().trim();
			const filtered = departments.filter(d => {
				const name = String(d.name || "").toLowerCase();
				const label = String(d.department_name || "").toLowerCase();
				return name.includes(q) || label.includes(q);
			});

			if (!filtered.length) {
				dropdownDiv.innerHTML = '<div style="padding:8px;color:#94a3b8;">No departments found</div>';
				dropdownDiv.style.display = "block";
				return;
			}

			dropdownDiv.innerHTML = filtered.map(d => {
				const rawDeptName = String(d.name || "");
				const deptName = this.escapeHtml(rawDeptName);
				const deptLabel = this.escapeHtml(d.department_name || d.name || "");
				const encodedDeptName = encodeURIComponent(rawDeptName);
				return `
					<button type="button" class="department-option" data-value="${encodedDeptName}" style="display:block;width:100%;padding:10px 12px;border:none;background:none;text-align:left;cursor:pointer;color:#1e293b;font-size:14px;transition:all .15s;">
						<div style="font-weight:600;">${deptLabel}</div>
						<div style="font-size:12px;color:#64748b;">${deptName}</div>
					</button>
				`;
			}).join("");

			dropdownDiv.style.display = "block";

			dropdownDiv.querySelectorAll(".department-option").forEach(btn => {
				const applyDepartmentSelection = (e) => {
					e.preventDefault();
					e.stopPropagation();
					const selectedValue = decodeURIComponent(btn.getAttribute("data-value") || "");
					departmentInput.value = selectedValue;
					departmentInput.dataset.standardDepartment = selectedValue;
					departmentInput.style.borderColor = "#e2e8f0";
					dropdownDiv.style.display = "none";
				};

				// Use mousedown so value is applied before input blur hides dropdown.
				btn.addEventListener("mousedown", applyDepartmentSelection);
				btn.addEventListener("click", applyDepartmentSelection);
				btn.addEventListener("mouseenter", () => {
					btn.style.background = "#f1f5f9";
				});
				btn.addEventListener("mouseleave", () => {
					btn.style.background = "none";
				});
			});
		};

		departmentInput.addEventListener("focus", async () => {
			if (!departments.length) {
				departments = await this.fetchDepartments();
			}
			render("");
		});

		departmentInput.addEventListener("input", async () => {
			delete departmentInput.dataset.standardDepartment;
			clearTimeout(inputTimeout);
			inputTimeout = setTimeout(async () => {
				if (!departments.length) {
					departments = await this.fetchDepartments();
				}
				render(departmentInput.value);
			}, 250);
		});

		departmentInput.addEventListener("blur", () => {
			setTimeout(() => {
				const standardValue = this.getStandardDepartmentValue(departmentInput.value, departments);
				if (departmentInput.value && standardValue) {
					departmentInput.value = standardValue;
					departmentInput.dataset.standardDepartment = standardValue;
					departmentInput.style.borderColor = "#e2e8f0";
				} else if (departmentInput.value) {
					departmentInput.style.borderColor = "#ef4444";
				}
				dropdownDiv.style.display = "none";
			}, 200);
		});

		document.addEventListener("click", (e) => {
			if (!wrapper.contains(e.target)) {
				dropdownDiv.style.display = "none";
			}
		});
	}

	setupBenefitsEditor(form) {
		const benefitsTextarea = form.querySelector('textarea[name="benefits"]');
		if (!benefitsTextarea) return;

		const existingEditor = form.querySelector("#benefits-rich-editor .rich-editor-content");
		if (existingEditor) {
			existingEditor.innerHTML = benefitsTextarea.value || "";
			return;
		}

		benefitsTextarea.style.display = "none";

		const editorWrap = document.createElement("div");
		editorWrap.id = "benefits-rich-editor";
		editorWrap.style.cssText = "border:1.5px solid #e2e8f0;border-radius:8px;overflow:hidden;background:#fff;";

		const toolbar = document.createElement("div");
		toolbar.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;padding:8px;border-bottom:1px solid #e2e8f0;background:#f8fafc;";
		toolbar.innerHTML = `
			<button type="button" data-cmd="bold" class="btn btn-sm btn-light" style="padding:2px 8px;">B</button>
			<button type="button" data-cmd="italic" class="btn btn-sm btn-light" style="padding:2px 8px;"><i>I</i></button>
			<button type="button" data-cmd="insertUnorderedList" class="btn btn-sm btn-light" style="padding:2px 8px;">• List</button>
			<button type="button" data-cmd="insertOrderedList" class="btn btn-sm btn-light" style="padding:2px 8px;">1. List</button>
			<button type="button" data-cmd="createLink" class="btn btn-sm btn-light" style="padding:2px 8px;">Link</button>
			<button type="button" data-cmd="removeFormat" class="btn btn-sm btn-light" style="padding:2px 8px;">Clear</button>
		`;

		const editor = document.createElement("div");
		editor.className = "rich-editor-content";
		editor.contentEditable = "true";
		editor.setAttribute("role", "textbox");
		editor.setAttribute("aria-label", "Benefits and Perks editor");
		editor.style.cssText = "min-height:120px;padding:10px 12px;font-size:14px;color:#1e293b;outline:none;";
		editor.innerHTML = benefitsTextarea.value || "";

		const syncBenefits = () => {
			benefitsTextarea.value = editor.innerHTML.trim();
		};

		toolbar.querySelectorAll("button[data-cmd]").forEach((btn) => {
			btn.addEventListener("click", () => {
				const cmd = btn.getAttribute("data-cmd");
				if (cmd === "createLink") {
					const url = window.prompt("Enter URL", "https://");
					if (url) document.execCommand("createLink", false, url);
				} else {
					document.execCommand(cmd, false, null);
				}
				editor.focus();
				syncBenefits();
			});
		});

		editor.addEventListener("input", syncBenefits);
		editor.addEventListener("blur", syncBenefits);

		editorWrap.appendChild(toolbar);
		editorWrap.appendChild(editor);
		benefitsTextarea.parentNode.insertBefore(editorWrap, benefitsTextarea);
	}

	setupDescriptionEditor(form) {
		const descriptionTextarea = form.querySelector('textarea[name="description"]');
		if (!descriptionTextarea) return;

		const existingEditor = form.querySelector("#description-rich-editor .rich-editor-content");
		if (existingEditor) {
			existingEditor.innerHTML = descriptionTextarea.value || "";
			return;
		}

		descriptionTextarea.style.display = "none";

		const editorWrap = document.createElement("div");
		editorWrap.id = "description-rich-editor";
		editorWrap.style.cssText = "border:1.5px solid #e2e8f0;border-radius:8px;overflow:hidden;background:#fff;";

		const toolbar = document.createElement("div");
		toolbar.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;padding:8px;border-bottom:1px solid #e2e8f0;background:#f8fafc;";
		toolbar.innerHTML = `
			<button type="button" data-cmd="bold" class="btn btn-sm btn-light" style="padding:2px 8px;">B</button>
			<button type="button" data-cmd="italic" class="btn btn-sm btn-light" style="padding:2px 8px;"><i>I</i></button>
			<button type="button" data-cmd="insertUnorderedList" class="btn btn-sm btn-light" style="padding:2px 8px;">• List</button>
			<button type="button" data-cmd="insertOrderedList" class="btn btn-sm btn-light" style="padding:2px 8px;">1. List</button>
			<button type="button" data-cmd="createLink" class="btn btn-sm btn-light" style="padding:2px 8px;">Link</button>
			<button type="button" data-cmd="removeFormat" class="btn btn-sm btn-light" style="padding:2px 8px;">Clear</button>
		`;

		const editor = document.createElement("div");
		editor.className = "rich-editor-content";
		editor.contentEditable = "true";
		editor.setAttribute("role", "textbox");
		editor.setAttribute("aria-label", "Job Description editor");
		editor.style.cssText = "min-height:150px;padding:10px 12px;font-size:14px;color:#1e293b;outline:none;";
		editor.innerHTML = descriptionTextarea.value || "";

		const syncDescription = () => {
			descriptionTextarea.value = editor.innerHTML.trim();
		};

		toolbar.querySelectorAll("button[data-cmd]").forEach((btn) => {
			btn.addEventListener("click", () => {
				const cmd = btn.getAttribute("data-cmd");
				if (cmd === "createLink") {
					const url = window.prompt("Enter URL", "https://");
					if (url) document.execCommand("createLink", false, url);
				} else {
					document.execCommand(cmd, false, null);
				}
				editor.focus();
				syncDescription();
			});
		});

		editor.addEventListener("input", syncDescription);
		editor.addEventListener("blur", syncDescription);

		editorWrap.appendChild(toolbar);
		editorWrap.appendChild(editor);
		descriptionTextarea.parentNode.insertBefore(editorWrap, descriptionTextarea);
	}

	ensureWizardNavigation(form) {
		if (!form) return;

		let navRow = form.querySelector('.wizard-nav-row');
		if (navRow && navRow.closest('.wizard-step')) {
			// If malformed template nesting places nav inside a step (e.g. step-5),
			// move it out so it stays visible across all steps.
			form.appendChild(navRow);
		}

		if (!navRow) {
			navRow = document.createElement('div');
			navRow.className = 'row wizard-nav-row';
			navRow.style.cssText = 'margin-top: 32px; padding-top: 16px; border-top: 2px solid #f1f5f9; margin-bottom: 0;';
			navRow.innerHTML = `
				<div class="col-12 d-flex justify-content-between align-items-center wizard-nav-actions">
					<button type="button" class="btn btn-secondary btn-wizard-prev" style="padding: 8px 20px; border-radius: 8px; font-weight: 600; border: 1.5px solid #e2e8f0; background: white; color: #64748b; display: none;">
						<i class="fa fa-arrow-left me-2"></i>Previous
					</button>
					<div class="wizard-nav-spacer" style="flex: 1;"></div>
					<button type="button" class="btn btn-secondary btn-cancel me-3" style="padding: 8px 20px; border-radius: 8px; font-weight: 500; border: 1.5px solid #e2e8f0; background: white; color: #64748b;">
						Cancel
					</button>
					<button type="button" class="btn btn-primary btn-wizard-next" style="padding: 8px 20px; border-radius: 8px; font-weight: 600; background: linear-gradient(135deg, #1E3A8A 0%, #2563EB 100%); border: none; box-shadow: 0 2px 8px rgba(37, 99, 235, 0.25);">
						Next<i class="fa fa-arrow-right ms-2"></i>
					</button>
					<button type="button" class="btn btn-success btn-wizard-submit" style="padding: 8px 24px; border-radius: 8px; font-weight: 600; background: linear-gradient(135deg, #059669 0%, #10b981 100%); border: none; box-shadow: 0 2px 8px rgba(16, 185, 129, 0.25); display: none;">
						<i class="fa fa-check me-2"></i>Create Job Posting
					</button>
				</div>
			`;
			form.appendChild(navRow);
		}

		const navActions = navRow.querySelector('.wizard-nav-actions');
		if (navActions) {
			navActions.style.display = 'flex';
			navActions.style.visibility = 'visible';
		}

		navRow.style.display = 'block';
		navRow.style.visibility = 'visible';

		this.normalizeWizardSteps(form, navRow);
	}

	normalizeWizardSteps(form, navRow) {
		if (!form) return;

		for (let i = 1; i <= 6; i++) {
			const stepEl = form.querySelector(`#step-${i}`);
			if (!stepEl) continue;

			// Keep each wizard step at form root level so hiding step-N
			// does not hide nested step-(N+1).
			if (stepEl.parentElement !== form) {
				if (navRow && navRow.parentElement === form) {
					form.insertBefore(stepEl, navRow);
				} else {
					form.appendChild(stepEl);
				}
			}
		}
	}

	initializeWizard() {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const form = wrapper.querySelector('#new-job-form');
		this.ensureWizardNavigation(form);
		this.currentStep = 1;
		this.totalSteps = 6;

		this.showStep(1);
		this.updateWizardNavigation();
	}

	showStep(stepNumber) {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;

		// Hide all steps
		wrapper.querySelectorAll('.wizard-step').forEach(step => {
			step.classList.add('d-none');
		});

		// Show current step
		const currentStepEl = wrapper.querySelector(`#step-${stepNumber}`);
		if (currentStepEl) {
			currentStepEl.classList.remove('d-none');
		}

		// Update step indicators
		wrapper.querySelectorAll('.wizard-step-indicator').forEach((indicator, idx) => {
			const stepNum = idx + 1;
			if (stepNum < stepNumber) {
				indicator.classList.add('completed');
				indicator.classList.remove('active');
			} else if (stepNum === stepNumber) {
				indicator.classList.add('active');
				indicator.classList.remove('completed');
			} else {
				indicator.classList.remove('active', 'completed');
			}
		});

		this.currentStep = stepNumber;
		this.updateWizardNavigation();
	}

	updateWizardNavigation() {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;

		const prevBtn = wrapper.querySelector('.btn-wizard-prev');
		const nextBtn = wrapper.querySelector('.btn-wizard-next');
		const submitBtn = wrapper.querySelector('.btn-wizard-submit');

		if (prevBtn) {
			prevBtn.style.display = this.currentStep === 1 ? 'none' : 'inline-block';
		}

		if (nextBtn) {
			nextBtn.style.display = this.currentStep === this.totalSteps ? 'none' : 'inline-block';
		}

		if (submitBtn) {
			submitBtn.style.display = this.currentStep === this.totalSteps ? 'inline-block' : 'none';
		}

		// Bind navigation events
		if (prevBtn) {
			prevBtn.onclick = () => {
				if (this.currentStep > 1) {
					this.showStep(this.currentStep - 1);
				}
			};
		}

		if (nextBtn) {
			nextBtn.onclick = () => {
				if (this.validateCurrentStep() && this.currentStep < this.totalSteps) {
					this.showStep(this.currentStep + 1);
				}
			};
		}
	}

	validateCurrentStep() {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const currentStepEl = wrapper.querySelector(`#step-${this.currentStep}`);

		if (!currentStepEl) return true;

		const requiredFields = currentStepEl.querySelectorAll('[required]');
		let isValid = true;
		const missingFields = [];

		requiredFields.forEach(field => {
			if (!field.value || !field.value.trim()) {
				field.style.borderColor = '#ef4444';
				isValid = false;
				const label = field.closest('.mb-3')?.querySelector('label')?.textContent || field.name;
				missingFields.push(label.replace('*', '').trim());
			} else {
				field.style.borderColor = '#e2e8f0';
			}
		});

		if (!isValid) {
			frappe.msgprint({
				title: "Validation Error",
				message: `Please fill in the following required fields: ${missingFields.join(', ')}`,
				indicator: "red"
			});
		}

		return isValid;
	}

	async submitJobForm() {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const form = wrapper.querySelector("#new-job-form");
		const me = this;

		if (!this.validateCurrentStep()) {
			return;
		}

		if (!this.departmentsMaster.length) {
			await this.fetchDepartments();
		}
		if (!this.designationsMaster.length) {
			await this.fetchDesignations();
		}

		const departmentInput = form.querySelector('input[name="department"]');
		const rawDepartment = departmentInput?.value || "";
		const normalizedDepartment = this.getStandardDepartmentValue(rawDepartment);

		if (rawDepartment && !normalizedDepartment) {
			frappe.msgprint({
				title: "Invalid Department",
				message: "Please select Department from the existing department list.",
				indicator: "red"
			});
			if (departmentInput) {
				departmentInput.style.borderColor = "#ef4444";
				departmentInput.focus();
			}
			return;
		}

		const designationInput = form.querySelector('input[name="designation"]');
		const rawDesignation = designationInput?.value || "";
		const normalizedDesignation = this.getStandardDesignationValue(rawDesignation);

		if (rawDesignation && !normalizedDesignation) {
			frappe.msgprint({
				title: "Invalid Designation",
				message: "Please select Designation from the standard list.",
				indicator: "red"
			});
			if (designationInput) {
				designationInput.style.borderColor = "#ef4444";
				designationInput.focus();
			}
			return;
		}

		const jobData = {
			// Basic Information
			title: form.querySelector('input[name="title"]')?.value || '',
			dept: normalizedDepartment || '',
			department: normalizedDepartment || '',
			designation: normalizedDesignation || form.querySelector('input[name="designation"]')?.value || '',
			role_category: form.querySelector('select[name="role_category"]')?.value || '',
			industry_type: form.querySelector('select[name="industry_type"]')?.value || '',

			// Job Details
			employment_type: form.querySelector('select[name="employment_type"]')?.value || '',
			type: form.querySelector('select[name="employment_type"]')?.value || '',
			work_mode: form.querySelector('select[name="work_mode"]')?.value || '',
			job_type: form.querySelector('select[name="job_type"]')?.value || '',
			number_of_openings: form.querySelector('input[name="number_of_openings"]')?.value || '1',

			// Location & Experience
			location: form.querySelector('input[name="location"]')?.value || '',
			city: form.querySelector('input[name="city"]')?.value || '',
			state: form.querySelector('input[name="state"]')?.value || '',
			country: form.querySelector('input[name="country"]')?.value || 'India',
			min_experience: form.querySelector('input[name="min_experience"]')?.value || '0',
			max_experience: form.querySelector('input[name="max_experience"]')?.value || '',
			experience: `${form.querySelector('input[name="min_experience"]')?.value || '0'}-${form.querySelector('input[name="max_experience"]')?.value || '0'} yrs`,

			// Salary & Benefits
			min_salary: form.querySelector('input[name="min_salary"]')?.value || '',
			max_salary: form.querySelector('input[name="max_salary"]')?.value || '',
			salary: `${form.querySelector('input[name="min_salary"]')?.value || ''} - ${form.querySelector('input[name="max_salary"]')?.value || ''}`,
			currency: form.querySelector('select[name="currency"]')?.value || 'INR',
			hide_salary: form.querySelector('input[name="hide_salary"]')?.checked || false,
			benefits: form.querySelector('textarea[name="benefits"]')?.value || '',

			// Skills & Education
			required_skills: form.querySelector('input[name="required_skills"]')?.value || '',
			preferred_skills: form.querySelector('input[name="preferred_skills"]')?.value || '',
			education_qualification: form.querySelector('select[name="education_qualification"]')?.value || '',
			other_qualifications: form.querySelector('textarea[name="other_qualifications"]')?.value || '',

			// Job Description
			description: form.querySelector('textarea[name="description"]')?.value || '',
			responsibilities: form.querySelector('textarea[name="responsibilities"]')?.value || '',
			requirements: form.querySelector('textarea[name="requirements"]')?.value || '',

			// Application Details
			application_deadline: form.querySelector('input[name="application_deadline"]')?.value || '',
			contact_person: form.querySelector('input[name="contact_person"]')?.value || '',
			contact_email: form.querySelector('input[name="contact_email"]')?.value || '',
			contact_phone: form.querySelector('input[name="contact_phone"]')?.value || '',
			company_website: form.querySelector('input[name="company_website"]')?.value || '',

			// Status
			status: 'Open',
			posted_on: frappe.datetime.get_today()
		};

		// Validate only essential fields
		const missingFields = [];
		if (!jobData.title || !jobData.title.trim()) missingFields.push('Job Title');
		if (!jobData.dept || !jobData.dept.trim()) missingFields.push('Department');
		if (!jobData.location || !jobData.location.trim()) missingFields.push('Location');

		if (missingFields.length > 0) {
			frappe.msgprint({
				title: "Required Fields Missing",
				message: `Please fill in: ${missingFields.join(', ')}`,
				indicator: "red"
			});
			return;
		}

		// Log data for debugging
		console.log('Submitting job data:', jobData);

		frappe.call({
			method: 'renewal_module.custom_module.page.job_posting.job_posting.create_job_opening',
			args: { data: jobData },
			callback: (r) => {
				if (r.message && r.message.status === 'success') {
					frappe.show_alert({
						message: "Job posting created successfully!",
						indicator: "green"
					}, 5);
					me.loadJobData();
					frappe.set_route("job-posting");
				} else {
					frappe.msgprint({
						title: "Error",
						message: r.message?.message || "Failed to create job posting",
						indicator: "red"
					});
				}
			},
			error: (err) => {
				console.error('Error creating job posting:', err);
				frappe.msgprint({
					title: "Error",
					message: "An error occurred while creating the job posting",
					indicator: "red"
				});
			}
		});
	}

	resetJobForm(form) {
		if (!form) {
			return;
		}


		// Reset all input fields
		const textInputs = form.querySelectorAll('input[type="text"]');
		textInputs.forEach((input, idx) => {
			input.value = '';
			if (input.name === "department") {
				delete input.dataset.standardDepartment;
				input.style.borderColor = '#e2e8f0';
			}
			if (input.name === "designation") {
				delete input.dataset.standardDesignation;
				input.style.borderColor = '#e2e8f0';
			}
		});

		// Reset select fields
		const selects = form.querySelectorAll('select');
		selects.forEach((select, idx) => {
			select.value = '';
		});

		// Reset textarea fields
		const textareas = form.querySelectorAll('textarea');
		textareas.forEach((textarea, idx) => {
			textarea.value = '';
		});

	}

	setupMultiSelectAutocomplete(form, config) {
		const input = form.querySelector(`#${config.inputId}`);
		const dropdown = form.querySelector(`#${config.dropdownId}`);
		const tagsWrap = form.querySelector(`#${config.tagsId}`);
		const hidden = form.querySelector(`#${config.hiddenId}`);
		if (!input || !dropdown || !tagsWrap || !hidden) return;

		const selected = new Set();

		const syncHidden = () => {
			hidden.value = Array.from(selected).join(", ");
		};

		const createTag = (value) => {
			const tag = document.createElement("span");
			tag.style.cssText = "display:inline-flex;align-items:center;gap:6px;background:#e0e7ff;color:#1e3a8a;border:1px solid #c7d2fe;border-radius:999px;padding:3px 8px;font-size:12px;font-weight:600;";
			tag.innerHTML = `<span>${value}</span><button type="button" style="border:none;background:transparent;color:#1e3a8a;padding:0;line-height:1;cursor:pointer;font-size:14px;">x</button>`;
			tag.querySelector("button").addEventListener("click", () => {
				selected.delete(value);
				tag.remove();
				syncHidden();
				renderDropdown(input.value.trim());
			});
			tagsWrap.appendChild(tag);
		};

		const renderDropdown = (term) => {
			const q = term.toLowerCase();
			const available = config.options.filter(opt => !selected.has(opt) && opt.toLowerCase().includes(q));
			if (!available.length) {
				dropdown.style.display = "none";
				dropdown.innerHTML = "";
				return;
			}

			dropdown.innerHTML = available.map(opt =>
				`<button type="button" data-value="${opt.replace(/"/g, "&quot;")}" style="display:block;width:100%;text-align:left;border:none;background:#fff;padding:6px 8px;font-size:13px;cursor:pointer;border-bottom:1px solid #f1f5f9;">${opt}</button>`
			).join("");
			dropdown.style.display = "block";

			dropdown.querySelectorAll("button").forEach(btn => {
				btn.addEventListener("mouseenter", () => btn.style.background = "#f8fafc");
				btn.addEventListener("mouseleave", () => btn.style.background = "#fff");
				btn.addEventListener("click", () => {
					const value = btn.getAttribute("data-value");
					if (!value || selected.has(value)) return;
					selected.add(value);
					createTag(value);
					syncHidden();
					input.value = "";
					renderDropdown("");
					input.focus();
				});
			});
		};

		input.addEventListener("focus", () => renderDropdown(input.value.trim()));
		input.addEventListener("input", () => renderDropdown(input.value.trim()));

		document.addEventListener("click", (e) => {
			if (!dropdown.contains(e.target) && e.target !== input) {
				dropdown.style.display = "none";
			}
		});
	}

	renderJobDetails(job) {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const escape = this.escapeHtml.bind(this);
		const displayOrDash = (value) => {
			const text = value === null || value === undefined ? '' : String(value).trim();
			return text ? escape(text) : 'N/A';
		};

		// Update header with job info
		const jobIdHeader = wrapper.querySelector("#job-id-header");
		if (jobIdHeader) {
			jobIdHeader.innerHTML = `<i class="fa fa-briefcase me-1"></i><span class="job-id">${displayOrDash(job.id)}</span>`;
		}

		// Update subject (title) and department in card header
		const subject = wrapper.querySelector("#detail-subject");
		if (subject) {
			subject.textContent = displayOrDash(job.title);
			subject.setAttribute("title", displayOrDash(job.title));
		}

		// Update department in blue header
		const departmentBadge = wrapper.querySelector("#detail-department");
		const departmentText = String(job.dept || "").trim();
		if (departmentBadge) {
			departmentBadge.textContent = departmentText || "";
			departmentBadge.style.display = departmentText ? "inline-flex" : "none";
		}

		const separator = wrapper.querySelector(".job-subject-separator");
		if (separator) {
			separator.style.display = departmentText ? "inline" : "none";
		}

		// Update status badge
		const statusBadge = wrapper.querySelector("#job-status-badge");
		if (statusBadge) {
			statusBadge.textContent = displayOrDash(job.status);
			statusBadge.className = 'status-badge ' + this.getStatusClass(job.status);
		}

		// Update all job type fields
		wrapper.querySelectorAll(".job-type").forEach(el => {
			el.textContent = displayOrDash(job.type);
		});

		// Update all experience fields
		wrapper.querySelectorAll(".job-experience").forEach(el => {
			el.textContent = displayOrDash(job.experience);
		});

		// Update all location fields
		wrapper.querySelectorAll(".job-location").forEach(el => {
			el.textContent = displayOrDash(job.location);
		});

		// Update all salary fields
		wrapper.querySelectorAll(".job-salary").forEach(el => {
			el.textContent = displayOrDash(job.salary);
		});

		// Update posted on date
		wrapper.querySelectorAll(".job-posted-on").forEach(el => {
			el.textContent = displayOrDash(this.formatDate(job.posted_on));
		});

		// Update all description fields (HTML format)
		wrapper.querySelectorAll(".job-description").forEach(el => {
			if (job.description) {
				el.innerHTML = job.description;
			} else {
				el.textContent = 'N/A';
			}
		});

		// Update all status fields
		wrapper.querySelectorAll(".job-status").forEach(el => {
			el.textContent = displayOrDash(job.status);
		});

		// Bind dropdown actions
		const actionDropdown = wrapper.querySelector("#job-actions-dropdown");
		if (actionDropdown) {
			const dropdownItems = actionDropdown.querySelectorAll(".dropdown-item");
			dropdownItems.forEach(item => {
				item.addEventListener("click", (e) => {
					e.preventDefault();
					const action = item.getAttribute("data-action");

					if (action === "back") {
						frappe.set_route("job-posting");
					} else if (action === "edit") {
						frappe.msgprint({
							title: "Edit Job",
							message: "Edit functionality coming soon",
							indicator: "blue"
						});
					} else if (action === "delete") {
						if (confirm("Are you sure you want to delete this job posting?")) {
							// Delete functionality
							frappe.msgprint({
								title: "Delete Job",
								message: "Job deleted successfully",
								indicator: "green"
							});
							frappe.set_route("job-posting");
						}
					}
				});
			});
		}

		// Bind status change dropdown
		const statusItems = wrapper.querySelectorAll(".dropdown-menu .dropdown-item[data-action^='set_']");
		statusItems.forEach(item => {
			item.addEventListener("click", (e) => {
				e.preventDefault();
				const action = item.getAttribute("data-action");

				let newStatus = null;
				if (action === "set_open") newStatus = "Open";
				else if (action === "set_closed") newStatus = "Closed";
				else if (action === "set_onhold") newStatus = "On Hold";
				else return;

				// Update job status
				job.status = newStatus;
				const statusBadgeEl = wrapper.querySelector("#job-status-badge");
				if (statusBadgeEl) {
					statusBadgeEl.textContent = newStatus;
					statusBadgeEl.className = 'status-badge ' + this.getStatusClass(newStatus);
				}

				frappe.show_alert({
					message: `Job status updated to ${newStatus}`,
					indicator: "green"
				});
			});
		});

		// Fetch and render candidates for this job
		this.fetchAndRenderCandidatesForJob(job.id);
	}

	fetchAndRenderCandidatesForJob(jobId) {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;

		frappe.call({
			method: 'renewal_module.custom_module.page.job_posting.job_posting.get_candidates_for_job',
			args: {
				job_id: jobId
			},
			callback: (r) => {
				console.log('Candidates response:', r);
				if (r.message && r.message.status === 'success') {
					const candidates = r.message.data || [];
					console.log('Fetched candidates:', candidates);
					this.renderCandidatesDashboard(wrapper, candidates, jobId);
				} else {
					console.warn("Failed to fetch candidates", r.message);
					// Still render empty candidates list
					this.renderCandidatesDashboard(wrapper, [], jobId);
				}
			},
			error: (err) => {
				console.error("Error fetching candidates:", err);
				// Render empty list on error
				this.renderCandidatesDashboard(wrapper, [], jobId);
			}
		});
	}

	renderCandidatesDashboard(detailsContainer, candidates, jobId) {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const candidatesContainer = wrapper.querySelector("#job-candidates-container");

		if (!candidatesContainer) {
			return;
		}

		const safeCandidates = Array.isArray(candidates) ? candidates : [];
		this.candidates_for_current_job = safeCandidates;

		candidatesContainer.innerHTML = `
			<div class="candidate-list-shell">
				<div class="candidate-list-head">
					<div>
						<h6 class="candidate-list-title">Candidate List</h6>
						<p class="candidate-list-subtitle">Applied for Job ID: ${this.escapeHtml(jobId || 'N/A')}</p>
					</div>
					<span class="candidate-total-pill"><span id="candidate-total-count">${safeCandidates.length}</span> total</span>
				</div>
				<div class="candidate-list-controls">
					<input
						type="text"
						id="candidate-search-input"
						class="candidate-control-input"
						placeholder="Search name, id, email or phone"
						aria-label="Search candidates"
					/>
					<select id="candidate-status-filter" class="candidate-control-select" aria-label="Filter by status">
						<option value="">All Statuses</option>
						<option value="Pending">Pending</option>
						<option value="Accepted">Accepted</option>
						<option value="Rejected">Rejected</option>
						<option value="Accepted and Confirmed">Accepted and Confirmed</option>
						<option value="Accepted and Joined">Accepted and Joined</option>
					</select>
				</div>
				<div class="candidate-table-wrap">
					<table class="candidate-list-table">
						<thead>
							<tr>
								<th>Candidate</th>
								<th>Email</th>
								<th>Phone</th>
								<th>Status</th>
								<th class="candidate-date-head">Applied On</th>
								<th class="text-end">Actions</th>
							</tr>
						</thead>
						<tbody id="candidate-list-tbody"></tbody>
					</table>
				</div>
			</div>
		`;

		this.renderCandidateListRows(safeCandidates);
		this.bindCandidateListEvents();
	}

	renderCandidateListRows(candidates) {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const tbody = wrapper.querySelector('#candidate-list-tbody');
		const countEl = wrapper.querySelector('#candidate-total-count');
		const rows = Array.isArray(candidates) ? candidates : [];

		if (countEl) {
			countEl.textContent = rows.length;
		}

		if (!tbody) {
			return;
		}

		if (!rows.length) {
			tbody.innerHTML = `
				<tr>
					<td colspan="6" class="candidate-empty-cell">No candidates found</td>
				</tr>
			`;
			return;
		}

		tbody.innerHTML = rows.map(candidate => {
			const status = candidate.status || 'Pending';
			const statusClass = this.getCandidateStatusClass(status);
			const resumeLink = candidate.resume
				? `<a href="${this.escapeHtml(candidate.resume)}" target="_blank" rel="noopener" class="candidate-action-link">Resume</a>`
				: '<span class="candidate-action-muted">No Resume</span>';

			return `
				<tr>
					<td>
						<div class="candidate-main-cell">
							<div class="candidate-name">${this.escapeHtml(candidate.name || 'N/A')}</div>
							<div class="candidate-id">${this.escapeHtml(candidate.id || 'N/A')}</div>
						</div>
					</td>
					<td>
						<a href="mailto:${this.escapeHtml(candidate.email || '')}" class="candidate-email">${this.escapeHtml(candidate.email || 'N/A')}</a>
					</td>
					<td>${this.escapeHtml(candidate.phone || 'N/A')}</td>
					<td>
						<span class="candidate-status-badge ${statusClass}">${this.escapeHtml(status)}</span>
					</td>
					<td class="candidate-date-cell">${this.escapeHtml(this.formatDate(candidate.appliedOn) || candidate.appliedOn || 'N/A')}</td>
					<td class="text-end">
						<div class="candidate-actions">
							${resumeLink}
							<a href="javascript:void(0)" class="candidate-action-link candidate-view-profile" data-candidate-id="${this.escapeHtml(candidate.id || '')}">Profile</a>
						</div>
					</td>
				</tr>
			`;
		}).join('');
	}

	bindCandidateListEvents() {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const me = this;

		const applyCandidateFilters = () => {
			const searchEl = wrapper.querySelector('#candidate-search-input');
			const statusEl = wrapper.querySelector('#candidate-status-filter');

			const searchVal = (searchEl && searchEl.value ? searchEl.value : '').trim().toLowerCase();
			const statusVal = (statusEl && statusEl.value ? statusEl.value : '').trim().toLowerCase();

			const baseRows = Array.isArray(me.candidates_for_current_job) ? me.candidates_for_current_job : [];

			const filtered = baseRows.filter(candidate => {
				const status = (candidate.status || '').toLowerCase();
				const haystack = [candidate.name, candidate.id, candidate.email, candidate.phone]
					.map(v => (v || '').toString().toLowerCase())
					.join(' ');

				if (statusVal && status !== statusVal) {
					return false;
				}

				if (searchVal && !haystack.includes(searchVal)) {
					return false;
				}

				return true;
			});

			me.renderCandidateListRows(filtered);
		};

		$(wrapper)
			.off('input', '#candidate-search-input')
			.on('input', '#candidate-search-input', applyCandidateFilters);

		$(wrapper)
			.off('change', '#candidate-status-filter')
			.on('change', '#candidate-status-filter', applyCandidateFilters);

		$(wrapper)
			.off('click', '.candidate-view-profile')
			.on('click', '.candidate-view-profile', function (e) {
				e.preventDefault();
				const candidateId = $(this).data('candidateId');
				if (candidateId) {
					frappe.set_route('candidates', candidateId);
				}
			});
	}

	getCandidateStatusClass(status) {
		const normalized = (status || '').toLowerCase();
		if (normalized === 'accepted' || normalized === 'accepted and joined') {
			return 'candidate-status-success';
		}
		if (normalized === 'rejected') {
			return 'candidate-status-danger';
		}
		if (normalized === 'accepted and confirmed') {
			return 'candidate-status-info';
		}
		return 'candidate-status-warning';
	}

	getStatusClass(status) {
		const statusMap = {
			'Open': 'bg-success',
			'Closed': 'bg-danger',
			'On Hold': 'bg-warning'
		};
		return statusMap[status] || 'bg-secondary';
	}

	formatDate(dateStr) {
		if (!dateStr) return '';
		const date = new Date(dateStr);
		const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
		return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
	}

	escapeHtml(s) {
		if (!s) return '';
		const map = {
			'&': '&amp;',
			'<': '&lt;',
			'>': '&gt;',
			'"': '&quot;',
			"'": '&#039;'
		};
		return String(s).replace(/[&<>"']/g, (c) => map[c]);
	}

	// UPDATE URL WITH FILTERS - DYNAMIC FUNCTIONALITY
	updateUrlWithFilters() {
		try {
			const wrapper = this.page.wrapper[0] || this.page.wrapper;
			const newUrl = new URL(window.location.href);

			// Get filter values from DOM
			const statusEl = wrapper.querySelector('[data-table-filter="status"]');
			const idEl = wrapper.querySelector('#ID');
			const titleEl = wrapper.querySelector('#jobTitle');

			const statusVal = statusEl ? statusEl.value : "";
			const idVal = idEl ? idEl.value : "";
			const titleVal = titleEl ? titleEl.value : "";

			// Basic filters
			if (statusVal) {
				newUrl.searchParams.set("status", statusVal);
			} else {
				newUrl.searchParams.delete("status");
			}

			if (idVal) {
				newUrl.searchParams.set("id", idVal);
			} else {
				newUrl.searchParams.delete("id");
			}

			if (titleVal) {
				newUrl.searchParams.set("title", titleVal);
			} else {
				newUrl.searchParams.delete("title");
			}

			// Pagination
			if (this.page_length) {
				newUrl.searchParams.set("page_length", String(this.page_length));
			} else {
				newUrl.searchParams.delete("page_length");
			}

			// Update browser history without reload
			window.history.replaceState({}, "", newUrl.toString());

			// Store current filters in localStorage for persistence
			const filters = {
				status: statusVal,
				id: idVal,
				title: titleVal,
				page_length: this.page_length
			};
			localStorage.setItem("job_posting_filters", JSON.stringify(filters));

		} catch (err) {
		}
	}

	// RESTORE FILTERS FROM URL/LOCALSTORAGE
	restoreFiltersFromUrlOrStorage() {
		try {
			const wrapper = this.page.wrapper[0] || this.page.wrapper;
			const params = new URLSearchParams(window.location.search);

			// Get saved filters from localStorage
			let savedFilters = {};
			try {
				const stored = localStorage.getItem("job_posting_filters");
				if (stored) {
					savedFilters = JSON.parse(stored);
				}
			} catch (e) {
			}

			// Restore status filter
			const statusVal = params.get("status") || savedFilters.status || "";
			const statusEl = wrapper.querySelector('[data-table-filter="status"]');
			if (statusEl && statusVal) {
				statusEl.value = statusVal;
			}

			// Restore ID filter
			const idVal = params.get("id") || savedFilters.id || "";
			const idEl = wrapper.querySelector('#ID');
			if (idEl && idVal) {
				idEl.value = idVal;
			}

			// Restore title filter
			const titleVal = params.get("title") || savedFilters.title || "";
			const titleEl = wrapper.querySelector('#jobTitle');
			if (titleEl && titleVal) {
				titleEl.value = titleVal;
			}

			// Restore page length
			const pageLengthParam = params.get("page_length");
			if (pageLengthParam) {
				this.page_length = parseInt(pageLengthParam);
				localStorage.setItem("job_postings_page_length", String(this.page_length));
			}

		} catch (err) {
		}
		this.applyFilters();
		// Apply filters to data after restoring them

	}
}

frappe.job_posting_page_template = {
	body: `
		<div class="wrapper job-posting-wrapper">
			<div class="job-list-view d-none">
				<div class="row">
					<div class="col-12">
						<div class="page-title-head d-flex align-items-center">
							<div class="flex-grow-1">
								<h3 class="fs-xl fw-bold m-0">Job Postings</h3>
							</div>
							<div class="text-end">
								<ol class="breadcrumb m-0 py-0" style="background-color: transparent;">
									<li class="breadcrumb-item"><a href="javascript: void(0);">HR</a></li>
									<li class="breadcrumb-item active">Job Postings</li>
								</ol>
							</div>
						</div>
					</div>
				</div>	
				
				<div class="row">
					<div class="col-12">
						<div class="controls-wrapper">
							<div class="controls">
								<div class="left-controls">
									<select id="filterStatus" class="control-select placeholder" data-table-filter="status" aria-label="Status">
										<option value="">Status</option>
										<option value="Open">Open</option>
										<option value="Closed">Closed</option>
									</select>
									<input type="text" id="ID" class="control-input placeholder" placeholder="Job ID" aria-label="Job ID" />
									<input type="text" id="jobTitle" class="control-input placeholder" placeholder="Job Title" aria-label="Job Title" />
								</div>
								<div class="right-controls">
									<div class="btn-group filter-actions">
										<button class="btn btn-default btn-sm filter-button" title="Filters">
											<svg class="es-icon es-line icon-sm"><use href="#es-line-filter"></use></svg>
											<span class="button-label">Filters</span>
										</button>
										<button class="btn btn-default btn-sm filter-x-button" title="Clear filters">
											<svg class="es-icon es-line icon-sm"><use href="#es-small-close"></use></svg>
										</button>
									</div>
									<a id="new-job-btn" href="javascript:void(0)" class="btn btn-sm btn-primary1 mr-2">
										<i class="fa fa-plus me-1"></i> New Job
									</a>
								</div>
							</div>
						</div>
					</div>
				</div>

				<div class="row">
					<div class="col-12">
						<div class="card" style="background: none !important; border: none;box-shadow:none;">
							<div class="table-container mt-0">
							<table id="jobsTable" class="jobs-table">
								<thead>
									<tr>
										<th style="width: 40px;">
											<input id="selectAllJobs" type="checkbox" />
										</th>
										<th>Job Title</th>
										<th>Status</th>
										<th>Department</th>
										<th>Location</th>
										<th>Job ID</th>
										<th class="text-center ellipsis job-date-head" id="count-header" title="0 of 0">
											<span id="visible-count">0</span> of <span id="total-count">0</span>
										</th>
									</tr>
								</thead>
								<tbody>
								</tbody>
							</table>
							</div>

							<div class="d-flex justify-content-between align-items-center mt-0">
								<div class="list-paging-area d-flex justify-content-between align-items-center w-100">
									<div class="p-2">
										<div class="btn-group">
											<button type="button" class="btn btn-default1 btn-light btn-sm btn-paging" data-value="20">20</button>
											<button type="button" class="btn btn-default1 btn-light btn-sm btn-paging" data-value="100">100</button>
											<button type="button" class="btn btn-default1 btn-light btn-sm btn-paging" data-value="500">500</button>
											<button type="button" class="btn btn-default1 btn-light btn-sm btn-paging" data-value="2500">2500</button>
										</div>
									</div>
									<div class="p-2 d-flex gap-2 align-items-center">
										<button class="btn btn-default1 btn-light btn-more btn-sm">Load more</button>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>	
			</div>

			<!-- Job Details View -->
			<div class="job-details-view d-none">
				<div class="row">
					<div class="col-12">
						<div class="job-header">
							<div class="d-flex align-items-start justify-content-between w-100">
								<!-- Left side: Job Postings text and job id below -->
								<div>
									<h3 class="page-title mb-2">Job Postings</h3>
									<span class="job-id-display" id="job-id-header">
										<i class="fa fa-briefcase me-1"></i>
										<span class="job-id">N/A</span>
									</span>
								</div>
								
								<!-- Right side: HR/Job Postings breadcrumb and Change Status button at the end -->
								<div class="text-end ms-auto">
									<ol class="breadcrumb m-0 mb-2" style="background-color: transparent;">
										<li class="breadcrumb-item">
											<a href="javascript:void(0)">HR</a>
										</li>
										<li class="breadcrumb-item">
											<a href="/app/job-posting">Job Postings</a>
										</li>
									</ol>
									<div class="dropdown">
										<button class="btn btn-default2 btn-navblue btn-sm dropdown-toggle" type="button" data-bs-toggle="dropdown">
											Change Status
										</button>
										<ul class="dropdown-menu dropdown-menu-end">
											<li><a class="dropdown-item" href="#" data-action="set_open">Set Open</a></li>
											<li><a class="dropdown-item" href="#" data-action="set_closed">Set Closed</a></li>
											<li><a class="dropdown-item" href="#" data-action="set_onhold">Set On Hold</a></li>
										</ul>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>	

				<div class="row mt-3">
					<div class="col-12">
						<div class="card">
							<div class="card-header job-card-header">
								<!-- Left : Title + Department -->
								<div class="job-header-left">
									<h5 class="job-subject-line">
										<span class="job-subject" id="detail-subject" title=""></span>
										<span class="mx-1 job-subject-separator">–</span>
										<span id="detail-department" class="department-badge"></span>
									</h5>
								</div>

								<!-- Right : Status + Actions -->
								<div class="job-header-right">
									<span id="job-status-badge" class="status-badge">Open</span>

									<div class="dropdown" id="job-actions-dropdown">
										<button class="btn btn-secondary btn-sm dropdown-toggle" type="button" data-bs-toggle="dropdown">
											Actions
										</button>
										<ul class="dropdown-menu dropdown-menu-end">
											<li>
												<a class="dropdown-item" href="#" data-action="edit">
													Edit
												</a>
											</li>
											<li>
												<a class="dropdown-item btn-back-to-list" href="#" data-action="back">
													Back to List
												</a>
											</li>
											<li><hr class="dropdown-divider"></li>
											<li>
												<a class="dropdown-item" href="#" data-action="delete" style="color: #dc3545;">
													Delete
												</a>
											</li>
										</ul>
									</div>
								</div>
							</div>

							<div class="card-body">
								<!-- Job Data Display -->
								<div id="job-data-display"></div>

								<!-- Job Details Section -->
								<div class="mb-4">
									<div class="job-details-info">
										<div class="row mb-3">
											<div class="col-md-6">
												<div class="detail-field">
													<label class="detail-label">Job Type</label>
													<p class="detail-value job-type">N/A</p>
												</div>
											</div>
											<div class="col-md-6">
												<div class="detail-field">
													<label class="detail-label">Experience Required</label>
													<p class="detail-value job-experience">N/A</p>
												</div>
											</div>
										</div>

										<div class="row mb-3">
											<div class="col-md-6">
												<div class="detail-field">
													<label class="detail-label">Location</label>
													<p class="detail-value job-location">N/A</p>
												</div>
											</div>
											<div class="col-md-6">
												<div class="detail-field">
													<label class="detail-label">Status</label>
													<p class="detail-value"><span class="job-status">Open</span></p>
												</div>
											</div>
										</div>

										<div class="row mb-3">
											<div class="col-md-6">
												<div class="detail-field">
													<label class="detail-label">Salary Range</label>
													<p class="detail-value job-salary">N/A</p>
												</div>
											</div>
											<div class="col-md-6">
												<div class="detail-field">
													<label class="detail-label">Posted On</label>
													<p class="detail-value job-posted-on">N/A</p>
												</div>
											</div>
										</div>

										<div class="row mb-3">
											<div class="col-md-12">
												<div class="detail-field">
													<label class="detail-label">Description</label>
													<p class="detail-value job-description" style="white-space: pre-wrap;">N/A</p>
												</div>
											</div>
										</div>
									</div>
								</div>

								<!-- Candidates Section -->
								<div class="mb-4">
									<div class="d-flex align-items-center gap-1 mb-2">
										<h6 class="text-uppercase text-muted1 mb-0">Candidates Applied</h6>
									</div>
									<div id="job-candidates-container" class="candidates-container">
										<p class="text-muted">No candidates have applied yet</p>
									</div>
								</div>

								<!-- Comments Section -->
								<div class="mb-4">
									<div class="comment-section mt-3">
										<!-- Previous Comments Display -->
										<div id="job-comments-list" class="comments-list mb-3">
											<span class="text-muted small">No notes yet</span>
										</div>

										<!-- Add New Comment -->
										<div class="comment-box">
											<div class="comment-input-wrapper">
												<div class="comment-input-header">
													<span>Add Note</span>
												</div>
												<div class="comment-input-container">
													<div class="frappe-control col" data-fieldtype="Comment" data-fieldname="comment">
														<div id="new-job-comment" class="ql-editor ql-blank" data-gramm="false" contenteditable="true" data-placeholder="Add a note..." style="border: 1px solid #ddd; padding: 6px; border-radius: 4px;"><p><br></p></div>
													</div>
												</div>
											</div>
											<button id="add-job-comment-btn" class="btn btn-primary btn-default2 btn-comment btn-xs">Add Note</button>
										</div>
									</div>
								</div>

								<!-- Activity Section -->
								<div class="mb-4">
									<h6 class="text-uppercase text-muted mb-4 activity">Activity:</h6>
									<div class="timeline" id="job-activity-timeline">
										<p class="text-muted">No activity yet</p>
									</div>
								</div>
							</div>
						</div>
					</div> <!-- end col-->
				</div>
			</div>

			<div class="new-job-form d-none">
				<div class="row">
					<div class="col-12">
						<div class="ticket-header">
							<div class="ticket-breadcrumb" style="display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;">
								<h3 class="page-title" style="margin: 0;">Create Job Posting</h3>
								<ol class="breadcrumb" style="margin: 0; padding: 0; display: flex; gap: 8px; align-items: center;">
									<li class="breadcrumb-item" style="margin: 0;">
										<a href="javascript:void(0)">HR</a>
									</li>
									<li class="breadcrumb-item" style="margin: 0;">
										<a href="/app/job-posting">Job Postings</a>
									</li>
									<li class="breadcrumb-item active" style="margin: 0;">New</li>
								</ol>
							</div>
						</div>
					</div>
				</div>

				<div class="row mt-3" style="margin-bottom: 32px;">
					<div class="col-12">
						<!-- Wizard Progress -->
						<div class="wizard-progress-bar" style="background: white; padding: 12px; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); margin-bottom: 16px;">
							<div style="display: flex; justify-content: space-between; align-items: center; position: relative;">
								<div style="position: absolute; top: 20px; left: 0; right: 0; height: 2px; background: #e2e8f0; z-index: 1;"></div>
								
								<div class="wizard-step-indicator active" style="flex: 1; text-align: center; position: relative; z-index: 2;">
									<div style="width: 40px; height: 40px; border-radius: 50%; background: #2563eb; color: white; display: flex; align-items: center; justify-content: center; font-weight: 600; margin: 0 auto 6px; border: 3px solid white; box-shadow: 0 2px 8px rgba(37, 99, 235, 0.3);">1</div>
									<div style="font-size: 12px; color: #64748b; font-weight: 500;">Basic Info</div>
								</div>
								
								<div class="wizard-step-indicator" style="flex: 1; text-align: center; position: relative; z-index: 2;">
									<div style="width: 40px; height: 40px; border-radius: 50%; background: #e2e8f0; color: #64748b; display: flex; align-items: center; justify-content: center; font-weight: 600; margin: 0 auto 6px; border: 3px solid white;">2</div>
									<div style="font-size: 12px; color: #64748b; font-weight: 500;">Job Details</div>
								</div>
								
								<div class="wizard-step-indicator" style="flex: 1; text-align: center; position: relative; z-index: 2;">
									<div style="width: 40px; height: 40px; border-radius: 50%; background: #e2e8f0; color: #64748b; display: flex; align-items: center; justify-content: center; font-weight: 600; margin: 0 auto 6px; border: 3px solid white;">3</div>
									<div style="font-size: 12px; color: #64748b; font-weight: 500;">Location & Experience</div>
								</div>
								
								<div class="wizard-step-indicator" style="flex: 1; text-align: center; position: relative; z-index: 2;">
									<div style="width: 40px; height: 40px; border-radius: 50%; background: #e2e8f0; color: #64748b; display: flex; align-items: center; justify-content: center; font-weight: 600; margin: 0 auto 6px; border: 3px solid white;">4</div>
									<div style="font-size: 12px; color: #64748b; font-weight: 500;">Salary & Benefits</div>
								</div>
								
								<div class="wizard-step-indicator" style="flex: 1; text-align: center; position: relative; z-index: 2;">
									<div style="width: 40px; height: 40px; border-radius: 50%; background: #e2e8f0; color: #64748b; display: flex; align-items: center; justify-content: center; font-weight: 600; margin: 0 auto 6px; border: 3px solid white;">5</div>
									<div style="font-size: 12px; color: #64748b; font-weight: 500;">Skills & Education</div>
								</div>
								
								<div class="wizard-step-indicator" style="flex: 1; text-align: center; position: relative; z-index: 2;">
									<div style="width: 40px; height: 40px; border-radius: 50%; background: #e2e8f0; color: #64748b; display: flex; align-items: center; justify-content: center; font-weight: 600; margin: 0 auto 6px; border: 3px solid white;">6</div>
									<div style="font-size: 12px; color: #64748b; font-weight: 500;">Description & Contact</div>
								</div>
							</div>
						</div>

						<div class="card w-100" style="min-height:70vh; border: none; box-shadow: 0 2px 12px rgba(0,0,0,0.08); border-radius: 12px;">
							<div class="card-body" style="padding: 16px;">
								<form id="new-job-form">
									<!-- Step 1: Basic Information -->
									<div class="wizard-step" id="step-1">
										<h4 style="color: #1e293b; font-weight: 700; margin-bottom: 16px; font-size: 20px;">Basic Job Information</h4>

															<div class="row">
																<div class="col-12 col-md-6">
																	<div class="mb-3">
																		<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 6px;">Job Title</label>
																		<input type="text" name="title" class="form-control" placeholder="e.g., Sales Executive" style="padding: 6px 10px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px;" />
																	</div>
																</div>
																<div class="col-12 col-md-6">
																	<div class="mb-3">
																		<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 6px;">Department</label>
																		<input type="text" name="department" class="form-control" placeholder="Select Department" style="padding: 6px 10px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px;" />
																	</div>
																</div>
															</div>

															<div class="row">
																<div class="col-12 col-md-6">
																	<div class="mb-3">
																		<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 6px;">Designation</label>
																		<input type="text" name="designation" class="form-control" placeholder="e.g., Team Lead, Manager" style="padding: 6px 10px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px;" />
																	</div>
																</div>
																<div class="col-12 col-md-6">
																	<div class="mb-3">
																		<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 6px;">Employment Type</label>
																		<select name="employment_type" class="form-control" style="padding: 6px 10px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px;">
																			<option value="">Select Type</option>
																			<option value="Full-Time">Full-Time</option>
																			<option value="Part-Time">Part-Time</option>
																			<option value="Contract">Contract</option>
																			<option value="Temporary">Temporary</option>
																			<option value="Internship">Internship</option>
																	</select>
																</div>
																</div>
															</div>

															<div class="row">
																<div class="col-12 col-md-6">
																<div class="mb-3">
																	<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 6px;">Role Category</label>
																	<select name="role_category" class="form-control" style="padding: 6px 10px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px;">
																		<option value="">Select Category</option>
																		<option value="Software Development">Software Development</option>
																		<option value="Data Science">Data Science & Analytics</option>
																		<option value="Design">Design & Creative</option>
																		<option value="Sales">Sales & Business Development</option>
																		<option value="Marketing">Marketing & Communication</option>
																		<option value="HR">Human Resources</option>
																		<option value="Finance">Finance & Accounting</option>
																		<option value="Operations">Operations & Support</option>
																		<option value="Customer Service">Customer Service</option>
																		<option value="Management">Management & Leadership</option>
																	</select>
																</div>
																</div>
																<div class="col-12 col-md-6">
																<div class="mb-3">
																	<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 6px;">Industry Type</label>
																	<select name="industry_type" class="form-control" style="padding: 6px 10px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px;">
																		<option value="">Select Industry</option>
																		<option value="IT Services">IT Services & Consulting</option>
																		<option value="Software Product">Software Product</option>
																		<option value="Internet">Internet & E-commerce</option>
																		<option value="Manufacturing">Manufacturing</option>
																		<option value="Healthcare">Healthcare</option>
																		<option value="Education">Education & Training</option>
																		<option value="Finance">Finance & Banking</option>
																		<option value="Retail">Retail</option>
																		<option value="Real Estate">Real Estate</option>
																		<option value="FMCG">FMCG</option>
																		<option value="Telecom">Telecom</option>
																		<option value="Media">Media & Entertainment</option>
																	</select>
																</div>
																</div>
															</div>
												</div>

																								<!-- Step 2: Job Details -->
												<div class="wizard-step d-none" id="step-2">
													<h4 style="color: #1e293b; font-weight: 700; margin-bottom: 16px; font-size: 20px;">Job Details & Requirements</h4>
													<div class="row">
														<div class="col-12 col-md-4">
															<div class="mb-3">
																<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 6px;">Work Mode</label>
																<select name="work_mode" class="form-control" style="padding: 6px 10px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px;">
																	<option value="">Select Mode</option>
																	<option value="Work from Office">Work from Office</option>
																	<option value="Work from Home">Work from Home</option>
																	<option value="Hybrid">Hybrid</option>
																	<option value="Field Work">Field Work</option>
														</select>
													</div>
												</div>
												<div class="col-12 col-md-4">
														<div class="mb-3">
															<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 6px;">Job Type</label>
															<select name="job_type" class="form-control" style="padding: 6px 10px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px;">
																	<option value="">Select Type</option>
																	<option value="Permanent">Permanent</option>
																	<option value="Contractual">Contractual</option>
																	<option value="Freelance">Freelance</option>
														</select>
														</div>
												</div>
												<div class="col-12 col-md-4">
														<div class="mb-3">
															<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 6px;">Number of Openings</label>
															<input type="number" name="number_of_openings" class="form-control" placeholder="e.g., 5" value="1" min="1" style="padding: 6px 10px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px;" />
														</div>
												</div>
										</div>
								</div>

									<!-- Step 3: Location & Experience -->
									<div class="wizard-step d-none" id="step-3">
										<h4 style="color: #1e293b; font-weight: 700; margin-bottom: 16px; font-size: 20px;">Location & Experience</h4>
										
										<div class="row">
											<div class="col-12 col-md-6">
												<div class="mb-3">
													<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 6px;">Location <span style="color: #ef4444;">*</span></label>
													<input type="text" name="location" class="form-control" placeholder="e.g., Bengaluru, Mumbai, Remote" required style="padding: 6px 10px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px;" />
												</div>
											</div>
											<div class="col-12 col-md-6">
												<div class="mb-3">
													<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 6px;">City</label>
													<input type="text" name="city" class="form-control" placeholder="e.g., Bengaluru" style="padding: 6px 10px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px;" />
												</div>
											</div>
										</div>

										<div class="row">
											<div class="col-12 col-md-4">
												<div class="mb-3">
													<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 6px;">State</label>
													<input type="text" name="state" class="form-control" placeholder="e.g., Karnataka" style="padding: 6px 10px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px;" />
												</div>
											</div>
											<div class="col-12 col-md-4">
												<div class="mb-3">
													<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 6px;">Country</label>
													<input type="text" name="country" class="form-control" value="India" placeholder="India" style="padding: 6px 10px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px;" />
												</div>
											</div>
										</div>

										<div class="row">
											<div class="col-12 col-md-6">
												<div class="mb-3">
													<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 6px;">Minimum Experience (Years)</label>
													<input type="number" name="min_experience" class="form-control" placeholder="e.g., 2" value="0" min="0" step="0.5" style="padding: 6px 10px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px;" />
												</div>
											</div>
											<div class="col-12 col-md-6">
												<div class="mb-3">
													<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 6px;">Maximum Experience (Years)</label>
													<input type="number" name="max_experience" class="form-control" placeholder="e.g., 5" min="0" step="0.5" style="padding: 6px 10px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px;" />
												</div>
											</div>
										</div>
									</div>

									<!-- Step 4: Salary & Benefits -->
									<div class="wizard-step d-none" id="step-4">
										<h4 style="color: #1e293b; font-weight: 700; margin-bottom: 16px; font-size: 20px;">Salary & Benefits</h4>
										
										<div class="row">
											<div class="col-12 col-md-4">
												<div class="mb-3">
													<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 6px;">Minimum Salary (Annual)</label>
													<input type="number" name="min_salary" class="form-control" placeholder="e.g., 500000" min="0" step="10000" style="padding: 6px 10px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px;" />
													<small class="text-muted">Leave blank if not disclosed</small>
												</div>
											</div>
											<div class="col-12 col-md-4">
												<div class="mb-3">
													<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 6px;">Maximum Salary (Annual)</label>
													<input type="number" name="max_salary" class="form-control" placeholder="e.g., 800000" min="0" step="10000" style="padding: 6px 10px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px;" />
												</div>
											</div>
											<div class="col-12 col-md-4">
												<div class="mb-3">
													<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 6px;">Currency</label>
													<select name="currency" class="form-control" style="padding: 6px 10px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px;">
														<option value="INR">INR (₹)</option>
														<option value="USD">USD ($)</option>
														<option value="EUR">EUR (€)</option>
														<option value="GBP">GBP (£)</option>
													</select>
												</div>
											</div>
										</div>

										<div class="row">
											<div class="col-12">
												<div class="mb-3">
													<div class="form-check">
														<input type="checkbox" name="hide_salary" class="form-check-input" id="hideSalary" style="width: 18px; height: 18px; border: 1.5px solid #e2e8f0; border-radius: 4px;" />
														<label class="form-check-label" for="hideSalary" style="font-weight: 500; color: #475569; margin-left: 8px;">
															Hide salary details from candidates
														</label>
													</div>
												</div>
											</div>
										</div>

										<div class="row">
											<div class="col-12">
												<div class="mb-3">
													<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 6px;">Benefits & Perks</label>
													<textarea name="benefits" class="form-control" rows="4" placeholder="e.g., Health insurance, Flexible work hours, Performance bonus, Work from home allowance..." style="padding: 6px 10px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px;"></textarea>
													<small class="text-muted">Enter each benefit on a new line or separated by commas</small>
												</div>
											</div>
										</div>
									</div>

									<!-- Step 5: Skills & Education -->
									<div class="wizard-step d-none" id="step-5">
										<h4 style="color: #1e293b; font-weight: 700; margin-bottom: 16px; font-size: 20px;">Skills & Education Requirements</h4>
										
										<div class="row">
							<div class="col-12">
								<div class="mb-3">
									<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 6px;">Required Skills (Technical)</label>
									<div id="required-skills-widget" style="border: 1.5px solid #e2e8f0; border-radius: 8px; padding: 8px; background: #fff;">
										<div id="required-skills-tags" style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px;"></div>
										<div style="position: relative; width: 100%;">
											<input type="text" id="required-skills-input" class="form-control" placeholder="Type and select required skills" style="padding: 8px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px;">
											<div id="required-skills-dropdown" style="display: none; position: absolute; left: 0; right: 0; top: calc(100% + 4px); z-index: 20; background: #fff; border: 1px solid #cbd5e1; border-radius: 6px; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12); max-height: 190px; overflow-y: auto;"></div>
										</div>
										<input type="hidden" name="required_skills" id="required-skills-hidden">
									</div>
									<small class="text-muted" style="font-size: 12px;">Type to filter and click to add multiple required skills</small>
								</div>
							</div>
						</div>

						<div class="row">
							<div class="col-12">
								<div class="mb-3">
									<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 6px;">Preferred Skills (Soft Skills)</label>
									<div id="preferred-skills-widget" style="border: 1.5px solid #e2e8f0; border-radius: 8px; padding: 8px; background: #fff;">
										<div id="preferred-skills-tags" style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px;"></div>
										<div style="position: relative; width: 100%;">
											<input type="text" id="preferred-skills-input" class="form-control" placeholder="Type and select preferred skills" style="padding: 8px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px;">
											<div id="preferred-skills-dropdown" style="display: none; position: absolute; left: 0; right: 0; top: calc(100% + 4px); z-index: 20; background: #fff; border: 1px solid #cbd5e1; border-radius: 6px; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12); max-height: 190px; overflow-y: auto;"></div>
										</div>
										<input type="hidden" name="preferred_skills" id="preferred-skills-hidden">
									</div>
									<small class="text-muted" style="font-size: 12px;">Type to filter and click to add multiple preferred skills</small>
											</div>
										</div>

										<div class="row">
											<div class="col-12 col-md-6">
												<div class="mb-3">
													<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 8px;">Education Qualification</label>
													<select name="education_qualification" class="form-control" style="padding: 8px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px;">
														<option value="">Select Qualification</option>
														<option value="Any Graduate">Any Graduate</option>
														<option value="B.Tech/B.E.">B.Tech/B.E.</option>
														<option value="MCA">MCA</option>
														<option value="M.Tech">M.Tech</option>
														<option value="BCA">BCA</option>
														<option value="B.Sc">B.Sc</option>
														<option value="M.Sc">M.Sc</option>
														<option value="MBA">MBA</option>
														<option value="B.Com">B.Com</option>
														<option value="M.Com">M.Com</option>
														<option value="BA">BA</option>
														<option value="MA">MA</option>
														<option value="Diploma">Diploma</option>
														<option value="12th Pass">12th Pass</option>
														<option value="Graduate/Post Graduate">Graduate/Post Graduate</option>
													</select>
												</div>
											</div>
											<div class="col-12 col-md-6">
												<div class="mb-3">
													<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 6px;">Additional Qualifications</label>
													<textarea name="other_qualifications" class="form-control" rows="3" placeholder="e.g., Certifications, specific courses..." style="padding: 6px 10px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px;"></textarea>
												</div>
											</div>
										</div>
									</div>

									<!-- Step 6: Job Description & Contact -->
									<div class="wizard-step d-none" id="step-6">
										<h4 style="color: #1e293b; font-weight: 700; margin-bottom: 16px; font-size: 20px;">Job Description & Contact Details</h4>
										
										<div class="row">
											<div class="col-12">
												<div class="mb-3">
													<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 6px;">Job Description</label>
													<textarea name="description" class="form-control" rows="5" placeholder="Provide a detailed job description..." style="padding: 6px 10px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px;"></textarea>
												</div>
											</div>
										</div>

										<div class="row">
											<div class="col-12 col-md-6">
												<div class="mb-3">
													<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 6px;">Key Responsibilities</label>
													<textarea name="responsibilities" class="form-control" rows="4" placeholder="List key responsibilities..." style="padding: 6px 10px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px;"></textarea>
												</div>
											</div>
											<div class="col-12 col-md-6">
												<div class="mb-3">
													<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 6px;">Key Requirements</label>
													<textarea name="requirements" class="form-control" rows="4" placeholder="List key requirements..." style="padding: 6px 10px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px;"></textarea>
												</div>
											</div>
										</div>

										<div class="row">
											<div class="col-12 col-md-6">
												<div class="mb-3">
													<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 6px;">Application Deadline</label>
													<input type="text" name="application_deadline" class="form-control" placeholder="dd/mm/yyyy" pattern="\d{2}/\d{2}/\d{4}" style="padding: 6px 10px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px;" />
													<small class="text-muted">Format: dd/mm/yyyy</small>
												</div>
											</div>
											<div class="col-12 col-md-6">
												<div class="mb-3">
													<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 6px;">Company Website</label>
													<input type="url" name="company_website" class="form-control" placeholder="https://www.example.com" style="padding: 6px 10px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px;" />
												</div>
											</div>
										</div>

										<div class="row">
											<div class="col-12 col-md-6">
												<div class="mb-3">
													<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 6px;">Contact Person</label>
													<input type="text" name="contact_person" class="form-control" placeholder="e.g., HR Manager Name" style="padding: 6px 10px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px;" />
												</div>
											</div>
											<div class="col-12 col-md-6">
												<div class="mb-3">
													<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 6px;">Contact Email</label>
													<input type="email" name="contact_email" class="form-control" placeholder="hr@company.com" style="padding: 6px 10px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px;" />
												</div>
											</div>
										</div>

										<div class="row">
											<div class="col-12 col-md-6">
												<div class="mb-3">
													<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 6px;">Contact Phone</label>
													<input type="tel" name="contact_phone" class="form-control" placeholder="+91 1234567890" style="padding: 6px 10px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px;" />
												</div>
											</div>
										</div>
									</div>

									<!-- Navigation Buttons -->
									<div class="row wizard-nav-row" style=" padding-top: 16px; border-top: 2px solid #f1f5f9; margin-bottom: 0;">
										<div class="col-12 d-flex justify-content-between align-items-center wizard-nav-actions">
											<button type="button" class="btn btn-secondary btn-wizard-prev" style="padding: 8px 20px; border-radius: 8px; font-weight: 600; border: 1.5px solid #e2e8f0; background: white; color: #64748b; display: none;">
												<i class="fa fa-arrow-left me-2"></i>Previous
											</button>
											<div class="wizard-nav-spacer" style="flex: 1;"></div>
											<button type="button" class="btn btn-secondary btn-cancel me-3" style="padding: 8px 20px; border-radius: 8px; font-weight: 500; border: 1.5px solid #e2e8f0; background: white; color: #64748b;">
												Cancel
											</button>
											<button type="button" class="btn btn-primary btn-wizard-next" style="padding: 8px 20px; border-radius: 8px; font-weight: 600; background: linear-gradient(135deg, #1E3A8A 0%, #2563EB 100%); border: none; box-shadow: 0 2px 8px rgba(37, 99, 235, 0.25);">
												Next<i class="fa fa-arrow-right ms-2"></i>
											</button>
											<button type="button" class="btn btn-success btn-wizard-submit" style="padding: 8px 24px; border-radius: 8px; font-weight: 600; background: linear-gradient(135deg, #059669 0%, #10b981 100%); border: none; box-shadow: 0 2px 8px rgba(16, 185, 129, 0.25); display: none;">
												<i class="fa fa-check me-2"></i>Create Job Posting
											</button>
										</div>
									</div>
								</form>
							</div>
						</div>
					</div>
				</div>

				<style>
					.new-job-form {
						--corp-bg: #f6f8fb;
						--corp-surface: #ffffff;
						--corp-border: #d9e1ea;
						--corp-muted: #5f6b7a;
						--corp-text: #1f2a37;
						--corp-accent: #0f4c81;
						--corp-accent-soft: #dbe9f6;
					}

					.new-job-form .wizard-progress-bar {
						background: var(--corp-surface) !important;
						border: 1px solid var(--corp-border);
						border-radius: 10px !important;
						box-shadow: 0 1px 2px rgba(16, 24, 40, 0.04) !important;
					}

					.new-job-form .card.w-100 {
						background: var(--corp-surface);
						border: 1px solid var(--corp-border) !important;
						border-radius: 10px !important;
						box-shadow: 0 1px 2px rgba(16, 24, 40, 0.04) !important;
						margin-bottom: 32px !important;
					}

					.new-job-form .card-body {
						padding: 16px !important;
						padding-bottom: 80px !important;
					}

					.new-job-form .wizard-step > h4 {
						font-size: 18px !important;
						font-weight: 600 !important;
						color: var(--corp-text) !important;
						margin-bottom: 14px !important;
						letter-spacing: 0.1px;
					}

					.new-job-form .form-label {
						color: #334155 !important;
						font-weight: 600 !important;
						font-size: 13px !important;
					}

					.new-job-form .form-control,
					.new-job-form select.form-control,
					.new-job-form textarea.form-control {
						padding: 7px 10px !important;
						border: 1px solid var(--corp-border) !important;
						border-radius: 8px !important;
						font-size: 13px !important;
						color: var(--corp-text);
						background: #fff;
					}

					.new-job-form .form-control:focus {
						border-color: var(--corp-accent) !important;
						box-shadow: 0 0 0 2px rgba(15, 76, 129, 0.12) !important;
					}

					.new-job-form .text-muted,
					.new-job-form small.text-muted {
						color: var(--corp-muted) !important;
						font-size: 12px;
					}

					.new-job-form .wizard-step-indicator > div:first-child {
						width: 34px !important;
						height: 34px !important;
						border: 1px solid var(--corp-border) !important;
						background: #f8fafc !important;
						color: #64748b !important;
						box-shadow: none !important;
					}

					.new-job-form .wizard-step-indicator > div:last-child {
						font-size: 11px !important;
						font-weight: 600 !important;
						color: #64748b !important;
					}

					.new-job-form .wizard-step-indicator.active > div:first-child {
						background: var(--corp-accent) !important;
						border-color: var(--corp-accent) !important;
						color: #ffffff !important;
					}

					.new-job-form .wizard-step-indicator.active > div:last-child {
						color: var(--corp-accent) !important;
					}

					.new-job-form .wizard-step-indicator.completed > div:first-child {
						background: #1f6f57 !important;
						border-color: #1f6f57 !important;
						color: #ffffff !important;
					}

					.new-job-form .btn-wizard-prev,
					.new-job-form .btn-cancel {
						border: 1px solid var(--corp-border) !important;
						color: #334155 !important;
						background: #ffffff !important;
						border-radius: 8px !important;
						font-weight: 600 !important;
						padding: 9px 20px !important;
					}

					.new-job-form .btn-wizard-next {
						background: var(--corp-accent) !important;
						border: 1px solid var(--corp-accent) !important;
						color: #ffffff !important;
						border-radius: 8px !important;
						font-weight: 600 !important;
						box-shadow: none !important;
						padding: 9px 20px !important;
						margin-left: 12px !important;
					}

					.new-job-form .btn-wizard-submit {
						background: #1f6f57 !important;
						border: 1px solid #1f6f57 !important;
						color: #ffffff !important;
						border-radius: 8px !important;
						font-weight: 600 !important;
						box-shadow: none !important;
						padding: 9px 24px !important;
						margin-left: 12px !important;
					}

					.new-job-form .btn-cancel {
						margin-right: 12px !important;
					}

					.new-job-form .row[style*="border-top: 2px solid #f1f5f9"] {
						border-top: 1px solid var(--corp-border) !important;
						margin-top: 32px !important;
						padding-top: 20px !important;
						margin-bottom: 0 !important;
						padding-bottom: 0 !important;
					}

					.new-job-form .wizard-nav-row {
						position: sticky;
						bottom: 0;
						z-index: 10;
						background: var(--corp-surface);
						padding-bottom: 10px !important;
					}

					.new-job-form .wizard-nav-actions {
						gap: 10px;
					}

					.new-job-form .wizard-nav-spacer {
						flex: 1 1 auto;
					}

					@media (max-width: 767px) {
						.new-job-form .wizard-progress-bar {
							padding: 14px !important;
						}
						.new-job-form .wizard-step-indicator > div:last-child {
							font-size: 10px !important;
						}
						.new-job-form .card-body {
							padding: 16px !important;
						}

						.new-job-form .wizard-nav-actions {
							justify-content: flex-end !important;
							flex-wrap: wrap;
						}

						.new-job-form .wizard-nav-spacer {
							display: none;
						}

						.new-job-form .btn-wizard-prev,
						.new-job-form .btn-cancel,
						.new-job-form .btn-wizard-next,
						.new-job-form .btn-wizard-submit {
							width: 100%;
							margin-left: 0 !important;
							margin-right: 0 !important;
						}
					}
				</style>
			</div>
		</div>
	`
};