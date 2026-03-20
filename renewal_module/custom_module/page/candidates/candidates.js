frappe.pages['candidates'].on_page_load = function (wrapper) {
	frappe.candidates_page = new candidatespage(wrapper);
};

frappe.pages['candidates'].on_page_show = function (wrapper) {
	const pageWrapper = wrapper || $(".page")[0] || document.body;
	const ensureSupportLayoutLoaded = (cb) => {
		if (typeof loadSupportLayout === "function") return cb();
		frappe.require(["/assets/renewal_module/js/issue_themes/support_layout2.js"], () => {
			setTimeout(cb, 10);
		});
		frappe.require([
			"/assets/renewal_module/css/issue_themes/support_theme2.css",
		]);
	};
	ensureSupportLayoutLoaded(() => {
		loadSupportLayout(pageWrapper, () => {
			if (!frappe.candidates_page || frappe.candidates_page.wrapper !== pageWrapper) {
				frappe.candidates_page = new candidatespage(pageWrapper);
			}
			frappe.candidates_page.render();
		});
	});
};

// Helper functions
function formatDate(dateStr) {
	if (!dateStr) return '–';
	const date = new Date(dateStr);
	if (Number.isNaN(date.getTime())) return '–';
	const dd = String(date.getDate()).padStart(2, '0');
	const mm = String(date.getMonth() + 1).padStart(2, '0');
	const yyyy = date.getFullYear();
	const hh = String(date.getHours()).padStart(2, '0');
	const min = String(date.getMinutes()).padStart(2, '0');
	return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

function parseDateDDMMYYYY(dateStr) {
	if (!dateStr) return '';
	const trimmed = dateStr.trim();
	const match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
	if (!match) return null;

	const day = Number(match[1]);
	const month = Number(match[2]);
	const year = Number(match[3]);
	const date = new Date(year, month - 1, day);

	if (
		date.getFullYear() !== year ||
		date.getMonth() !== month - 1 ||
		date.getDate() !== day
	) {
		return null;
	}

	return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function getStatusClass(status) {
	switch(status) {
		case 'Pending': return 'status-pending';
		case 'Accepted': return 'status-accepted';
		case 'Rejected': return 'status-rejected';
		default: return '';
	}
}

class candidatespage {
	constructor(wrapper) {
		this.wrapper = wrapper;
		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: '',
			single_column: true
		});
		this.page_length = 20;
		this.visible_count = 0;
		this.all_candidates = [];
		this.filtered_candidates = [];
		this.total_records = 0;
		this.selected_candidates = new Set();
		this.candidate_ids_set = new Set();
	}

	removeDuplicates(candidates) {
		if (!Array.isArray(candidates)) return [];
		return candidates.filter(candidate => {
			if (this.candidate_ids_set.has(candidate.name)) {
				return false;
			}
			this.candidate_ids_set.add(candidate.name);
			return true;
		});
	}

	fetchJobOpenings() {
		return new Promise((resolve) => {
			frappe.call({
				method: "frappe.client.get_list",
				args: {
					doctype: "Job Opening",
					fields: ["name", "job_title"],
					limit_page_length: 100,
					order_by: "job_title asc"
				},
				callback: (r) => {
					const jobs = (r && r.message) ? r.message : [];
					resolve(jobs);
				},
				error: () => resolve([])
			});
		});
	}

	toNumberOrNull(value) {
		if (value === null || value === undefined) return null;
		const parsed = parseFloat(String(value).replace(/[^\d.\-]/g, ""));
		return Number.isFinite(parsed) ? parsed : null;
	}

	normalizeSkillList(raw) {
		if (!raw) return [];
		if (Array.isArray(raw)) {
			return raw
				.map(v => String(v || "").trim().toLowerCase())
				.filter(Boolean);
		}

		return String(raw)
			.split(/[\n,|;/]+/)
			.map(v => v.trim().toLowerCase())
			.filter(Boolean);
	}

	extractJobSkills(job) {
		const req = this.normalizeSkillList(job.required_skills || job.skills || "");
		const pref = this.normalizeSkillList(job.preferred_skills || "");
		const merged = new Set([...req, ...pref]);
		return Array.from(merged);
	}

	getExperienceRangeFromJob(job) {
		const minExp = this.toNumberOrNull(job.min_experience);
		const maxExp = this.toNumberOrNull(job.max_experience);
		if (minExp !== null || maxExp !== null) {
			return { min: minExp, max: maxExp };
		}

		const source = String(job.experience_required || job.experience || "");
		const nums = (source.match(/\d+(?:\.\d+)?/g) || []).map(Number);
		if (nums.length >= 2) return { min: nums[0], max: nums[1] };
		if (nums.length === 1) return { min: nums[0], max: null };
		return { min: null, max: null };
	}

	renderFitDashboard(detailsView, candidate, job) {
		if (!detailsView) return;

		const scoreEl = detailsView.querySelector("#fit-score-value");
		const expFitEl = detailsView.querySelector("#fit-exp-value");
		const skillsFitEl = detailsView.querySelector("#fit-skills-value");
		const missingEl = detailsView.querySelector("#fit-missing-skills");
		const matchedEl = detailsView.querySelector("#fit-matched-skills");
		const workflowEl = detailsView.querySelector("#fit-workflow");

		const candidateSkills = this.normalizeSkillList(candidate.skills || "");
		const jobSkills = this.extractJobSkills(job);
		const candidateSet = new Set(candidateSkills);
		const matched = jobSkills.filter(skill => candidateSet.has(skill));
		const missing = jobSkills.filter(skill => !candidateSet.has(skill));

		const skillPct = jobSkills.length ? Math.round((matched.length / jobSkills.length) * 100) : 0;

		const candidateMin = this.toNumberOrNull(candidate.min_experience);
		const candidateMax = this.toNumberOrNull(candidate.max_experience);
		const candidateExp = candidateMax ?? candidateMin;
		const jobRange = this.getExperienceRangeFromJob(job);

		let expText = "Not enough data";
		let expScore = 0;
		if (candidateExp !== null && jobRange.min !== null && jobRange.max !== null) {
			if (candidateExp >= jobRange.min && candidateExp <= jobRange.max) {
				expText = `In range (${jobRange.min}-${jobRange.max} yrs)`;
				expScore = 100;
			} else if (candidateExp < jobRange.min) {
				expText = `Below range (${jobRange.min}-${jobRange.max} yrs)`;
				expScore = 40;
			} else {
				expText = `Above range (${jobRange.min}-${jobRange.max} yrs)`;
				expScore = 80;
			}
		} else if (candidateExp !== null && jobRange.min !== null) {
			expText = candidateExp >= jobRange.min ? `Meets minimum (${jobRange.min}+ yrs)` : `Below minimum (${jobRange.min}+ yrs)`;
			expScore = candidateExp >= jobRange.min ? 100 : 45;
		}

		const overall = Math.round((skillPct * 0.6) + (expScore * 0.4));

		if (scoreEl) scoreEl.textContent = `${overall}%`;
		if (expFitEl) expFitEl.textContent = expText;
		if (skillsFitEl) skillsFitEl.textContent = `${matched.length}/${jobSkills.length || 0} matched (${skillPct}%)`;

		if (matchedEl) {
			matchedEl.innerHTML = matched.length
				? matched.map(s => `<span class="badge bg-success-subtle text-success me-1 mb-1">${escapeHtml(s)}</span>`).join("")
				: '<span class="text-muted">No matched skills</span>';
		}

		if (missingEl) {
			missingEl.innerHTML = missing.length
				? missing.map(s => `<span class="badge bg-warning-subtle text-warning-emphasis me-1 mb-1">${escapeHtml(s)}</span>`).join("")
				: '<span class="text-muted">No missing skills</span>';
		}

		if (workflowEl) {
			const steps = [];
			steps.push(`1. Job requirement loaded from ${escapeHtml(job.name || "selected posting")}`);
			steps.push(`2. Candidate profile parsed (${candidateSkills.length} skills, exp ${candidateExp ?? "N/A"} yrs)`);
			steps.push(`3. Skill overlap computed (${matched.length} matched, ${missing.length} missing)`);
			steps.push(`4. Experience check: ${escapeHtml(expText)}`);
			steps.push(`5. Final fit score: ${overall}%`);
			workflowEl.innerHTML = steps.map(step => `<div class="small text-muted mb-1">${step}</div>`).join("");
		}
	}

	loadAndRenderFitDashboard(detailsView, candidate) {
		if (!detailsView) return;

		const dashboardTitle = detailsView.querySelector("#fit-job-name");
		if (dashboardTitle) {
			dashboardTitle.textContent = candidate.job_title || candidate.designation || "N/A";
		}

		if (!candidate.job_title) {
			this.renderFitDashboard(detailsView, candidate, {});
			return;
		}

		const tryLoadJob = (doctype, onDone, onFail) => {
			frappe.call({
				method: "frappe.client.get",
				args: {
					doctype,
					name: candidate.job_title
				},
				callback: (jobRes) => {
					if (jobRes && jobRes.message) {
						onDone(jobRes.message);
						return;
					}
					onFail();
				},
				error: onFail
			});
		};

		tryLoadJob(
			"Job Opening",
			(job) => this.renderFitDashboard(detailsView, candidate, job),
			() => {
				tryLoadJob(
					"Job Position",
					(job) => this.renderFitDashboard(detailsView, candidate, job),
					() => this.renderFitDashboard(detailsView, candidate, {})
				);
			}
		);
	}

	render() {
		const waitForContent = () => {
			const $content = $("#support-page-content");
			if (!$content.length) {
				setTimeout(waitForContent, 50);
				return;
			}
			$content.empty().append(frappe.candidates_page_template.body);
			this.handleRoute();
		};
		waitForContent();
	}

	handleRoute() {
		const route = frappe.get_route();
		console.log("handleRoute:", route);

		if (route.length === 1) {
			return this.show_list();
		}
		if (route.length === 2 && route[1] === "new") {
			return this.show_new();
		}
		if (route.length === 2) {
			const candidate_id = route[1];
			return this.show_details(candidate_id);
		}
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
			const linkPage = $(this).data("page");
			if (!linkPage) return;

			if (linkPage === baseRoute) {
				$(this).addClass("active-menu");
				const $item = $(this).closest(".side-nav-item");
				$item.addClass("active-menu-item");
				const $parent = $(this).closest(".menu-parent");
				if ($parent.length) {
					$parent.addClass("active");
					$parent.closest(".sub-menu").each((idx, el) => {
						const $ancestor = $(el).closest(".menu-parent");
						if ($ancestor.length) {
							$ancestor.addClass("active");
						}
					});
				}
			}
		});

		if (window.syncSupportSidebarArrows) {
			window.syncSupportSidebarArrows();
		}
	}

	show_list() {
		$(".candidates-list-view").removeClass("d-none");
		$(".candidates-details-view").addClass("d-none");
		$(".new-candidates").addClass("d-none");
		setTimeout(async () => {
			try {
				this.setPageTitle("Candidates");
				this.setActiveSidebar();
				this.bindPaginationEvents();
				this.bindFilterEvents();
				this.bindRowSelectionHandler();
				await this.fetch_list_data({ reset: true });
			} catch (err) {
				console.error("candidatesPage error:", err);
			}
		}, 200);
	}

	show_details(candidate_id) {
		$(".candidates-list-view").addClass("d-none");
		$(".candidates-details-view").removeClass("d-none");
		$(".new-candidates").addClass("d-none");
		this.setPageTitle(`candidates/${candidate_id}`);
		this.setActiveSidebar();

		if (candidate_id) {
			this.load_candidate_details(candidate_id);
			this.bind_candidate_details_events(candidate_id);
		}
	}

	show_new() {
		$(".candidates-list-view").addClass("d-none");
		$(".candidates-details-view").addClass("d-none");
		$(".new-candidates").removeClass("d-none");
		this.setPageTitle("Create New Candidate");
		this.setActiveSidebar();
		
		setTimeout(() => {
			this.initializeWizard();
			this.bind_candidate_form_events();
		}, 100);
	}


	fetch_list_data({ reset = false } = {}) {
		return new Promise((resolve, reject) => {
			if (!this.page_length) this.page_length = 20;
			if (this._fetch_in_progress) {
				console.warn("[fetch_list_data] fetch already in progress");
				return resolve();
			}
			this._fetch_in_progress = true;

			try {
				if (reset) {
					this.all_candidates = [];
					this.visible_count = 0;
					this.current_page = 1;
					this.candidate_ids_set.clear();
				}

				if (!this.current_page) this.current_page = 1;

				const wrapper = this.page.wrapper[0] || this.page.wrapper;
				const statusEl = wrapper.querySelector('[data-table-filter="status"]');
				const searchEl = wrapper.querySelector('[data-table-search]');

				this.active_status = statusEl ? statusEl.value : "";
				this.active_search = searchEl ? searchEl.value : "";

				// Calculate start position based on current page
				const start = (this.current_page - 1) * this.page_length;

				frappe.call({
					method: "renewal_module.custom_module.page.candidates.candidates.get_list_data",
					args: {
						start: start,
						page_length: this.page_length,
						status: this.active_status || null,
						search: this.active_search || null
					},
					callback: (r) => {
						try {
							if (!r || !r.message) {
								if (reset) {
									this.total_records = 0;
									this.all_candidates = [];
									this.visible_count = 0;
								}
								this.render_rows(true);
								this._fetch_in_progress = false;
								return resolve();
							}

							const { data = [], total = 0 } = r.message || {};
							this.total_records = Number.isFinite(total) ? parseInt(total, 10) : (data.length || 0);

							// For pagination: replace on reset, otherwise append (load more)
							if (reset) {
								this.all_candidates = Array.isArray(data) ? data.slice() : [];
							this.candidate_ids_set.clear();
							data.forEach(c => this.candidate_ids_set.add(c.name));
						} else {
							const uniqueDataToAdd = this.removeDuplicates(Array.isArray(data) ? data.slice() : []);
							this.all_candidates = (this.all_candidates || []).concat(uniqueDataToAdd);
						}
						this.visible_count = this.all_candidates.length;

						if (this.total_records === 0) {
							this.all_candidates = [];
							this.visible_count = 0;
							this.candidate_ids_set.clear();
						}

						// Calculate total pages
						this.total_pages = Math.ceil(this.total_records / this.page_length) || 1;

						this.filtered_candidates = this.all_candidates.slice();
						this.render_rows(true);
						resolve();
					} catch (err) {
						reject(err);
					} finally {
						this._fetch_in_progress = false;
					}
					},
					error: (err) => {
						this._fetch_in_progress = false;
						console.error("fetch_list_data error:", err);
						reject(err);
					}
				});
			} catch (e) {
				this._fetch_in_progress = false;
				console.error(e);
				reject(e);
			}
		});
	}

	render_rows(useFiltered = false) {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const tbody = wrapper.querySelector(".candidates-table tbody");
		if (!tbody) return;

		// If first page, clear the table. Otherwise append (load more behavior).
		const isFirstPage = !this.current_page || this.current_page <= 1;
		if (isFirstPage) tbody.innerHTML = "";
		const data = useFiltered && this.filtered_candidates ? this.filtered_candidates : (this.all_candidates || []);

		// Update row count and email count in header
		this.update_header_counts(wrapper, data);

		if (!Array.isArray(data) || data.length === 0) {
			tbody.insertAdjacentHTML("beforeend", `
				<tr>
					<td colspan="7" class="text-center text-muted py-4">No candidates found.</td>
				</tr>
			`);
			this.update_pagination_controls(wrapper);
			return;
		}

		// Display all candidates in the current page (no slicing)
		data.forEach(candidate => {
			const tr = document.createElement("tr");
			tr.innerHTML = `
				<td class="checkbox-cell">
					<input class="form-check-input form-check-input-light fs-14 candidate-item-check" type="checkbox" data-id="${candidate.name}">
				</td>
				<td><a href="javascript:void(0)" class="link-reset candidate-link" data-candidate-id="${candidate.name}">${escapeHtml(candidate.applicant_name || 'N/A')}</a></td>
				<td title="${escapeHtml(candidate.email)}">${escapeHtml(candidate.email || 'N/A')}</td>
				<td title="${escapeHtml(candidate.phone)}">${escapeHtml(candidate.phone || '')}</td>
				<td title="${escapeHtml(candidate.job_title)}">${escapeHtml(candidate.job_title || '')}</td>
				<td><span class="pill ${getStatusClass(candidate.status)}">${escapeHtml(candidate.status || 'Pending')}</span></td>
				<td title="${candidate.modified}">${formatDate(candidate.modified)}</td>
			`;
			tbody.appendChild(tr);
		});

		// Update pagination controls (show/hide load more)
		this.update_pagination_controls(wrapper);

		// Bind row click events
		tbody.querySelectorAll(".candidate-link").forEach(link => {
			link.addEventListener("click", (e) => {
				e.preventDefault();
				const candidateId = link.getAttribute("data-candidate-id");
				frappe.set_route("candidates", candidateId);
			});
		});

		// Re-bind selection handlers so newly appended rows get listeners
		this.bindRowSelectionHandler();
	}

	update_header_counts(wrapper, data) {
		const visibleCountEl = wrapper.querySelector(".header-visible-count");
		const totalCountEl = wrapper.querySelector(".header-total-count");
		const emailCountEl = wrapper.querySelector(".header-email-count");

		if (visibleCountEl) {
			visibleCountEl.textContent = this.visible_count.toLocaleString();
		}
		if (totalCountEl) {
			totalCountEl.textContent = this.total_records.toLocaleString();
		}

		// Count total emails in visible candidates
		if (emailCountEl && Array.isArray(data)) {
			const emailCount = data.filter(c => c.email && c.email.trim()).length;
			emailCountEl.textContent = emailCount.toLocaleString();
		}
	}

	update_pagination_controls(wrapper) {
		const loadMoreBtn = wrapper.querySelector(".btn-load-more");
		const pageSizeButtons = wrapper.querySelectorAll(".btn-paging");

		if (!this.current_page) this.current_page = 1;
		if (!this.total_pages) this.total_pages = Math.ceil(this.total_records / this.page_length) || 1;

		// Toggle Load more button visibility/disabled state
		if (loadMoreBtn) {
			if (this.current_page >= this.total_pages || this.visible_count >= this.total_records) {
				loadMoreBtn.disabled = true;
				loadMoreBtn.style.display = 'none';
			} else {
				loadMoreBtn.disabled = false;
				loadMoreBtn.style.display = '';
			}
		}

		// Update active state on page-size buttons
		if (pageSizeButtons && pageSizeButtons.length) {
			pageSizeButtons.forEach(btn => {
				const val = parseInt(btn.getAttribute('data-value'), 10);
				if (val === this.page_length) {
					btn.classList.add('active');
					btn.classList.remove('btn-light');
					btn.classList.add('btn-primary1');
				} else {
					btn.classList.remove('active');
					btn.classList.remove('btn-primary1');
					btn.classList.add('btn-light');
				}
			});
		}
	}

	bindPaginationEvents() {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const pagingButtons = wrapper.querySelectorAll(".btn-paging");
		const loadMoreBtn = wrapper.querySelector(".btn-load-more");

		pagingButtons.forEach(btn => {
			btn.addEventListener("click", () => {
				const newPageLength = parseInt(btn.getAttribute("data-value"), 10);
				this.page_length = newPageLength;
				this.current_page = 1;
				// update UI immediately
				this.update_pagination_controls(wrapper);
				this.fetch_list_data({ reset: true }).catch(err => console.error(err));
			});
		});


		// Load more button appends next page
		if (loadMoreBtn) {
			loadMoreBtn.addEventListener('click', () => {
				this.total_pages = Math.ceil(this.total_records / this.page_length) || 1;
				if (!this.current_page) this.current_page = 1;
				if (this.current_page < this.total_pages) {
					this.current_page++;
					this.fetch_list_data({ reset: false }).catch(err => console.error(err));
				}
			});
		}
	}

	bindFilterEvents() {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const statusEl = wrapper.querySelector('[data-table-filter="status"]');
		const searchEl = wrapper.querySelector('[data-table-search]');

		if (statusEl) {
			statusEl.addEventListener("change", () => {
				this.fetch_list_data({ reset: true }).catch(err => console.error(err));
			});
		}

		if (searchEl) {
			let searchTimeout;
			searchEl.addEventListener("input", () => {
				clearTimeout(searchTimeout);
				searchTimeout = setTimeout(() => {
					this.fetch_list_data({ reset: true }).catch(err => console.error(err));
				}, 500);
			});
		}
	}

	bindRowSelectionHandler() {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const selectAllCheckbox = wrapper.querySelector(".selectAllCandidates");
		const itemCheckboxes = wrapper.querySelectorAll(".candidate-item-check");

		if (selectAllCheckbox) {
			selectAllCheckbox.addEventListener("change", () => {
				itemCheckboxes.forEach(cb => cb.checked = selectAllCheckbox.checked);
			});
		}

		itemCheckboxes.forEach(cb => {
			cb.addEventListener("change", () => {
				const allChecked = Array.from(itemCheckboxes).every(c => c.checked);
				if (selectAllCheckbox) selectAllCheckbox.checked = allChecked;
			});
		});
	}

	load_candidate_details(candidate_id) {
		frappe.call({
			method: "frappe.client.get",
			args: {
				doctype: "Job Applicant",
				name: candidate_id
			},
			callback: (r) => {
				if (r.message) {
					const candidate = r.message;
					const detailsView = document.querySelector(".candidates-details-view");

					// Update header with candidate info
					const nameId = detailsView.querySelector("#candidate-name-id");
					if (nameId) nameId.textContent = candidate.name;

				// Update subject and priority in card header
				const subject = detailsView.querySelector("#detail-subject");
				if (subject) subject.textContent = candidate.applicant_name || 'N/A';

				// Update job title in blue header
				const jobTitleBadge = detailsView.querySelector("#detail-job-title");
				if (jobTitleBadge) {
					if (candidate.job_title) {
						jobTitleBadge.innerHTML = `<a href="javascript:void(0)" class="job-posting-link" data-job-posting="${escapeHtml(candidate.job_title)}" style="color: inherit; text-decoration: underline; cursor: pointer;">${escapeHtml(candidate.designation || 'N/A')}</a>`;
						jobTitleBadge.querySelector('.job-posting-link').addEventListener('click', (e) => {
							e.preventDefault();
							frappe.set_route('Form', 'Job Position', candidate.job_title);
						});
					} else {
						jobTitleBadge.textContent = candidate.designation || 'N/A';
					}
				}

				// Update status badge
				const statusBadge = detailsView.querySelector("#candidate-status-badge");
				if (statusBadge) {
					statusBadge.textContent = candidate.status || 'Pending';
					statusBadge.className = 'status-badge ' + getStatusClass(candidate.status);
				}

				// Update all email fields
				detailsView.querySelectorAll(".candidate-email").forEach(el => {
					el.textContent = candidate.email_id || 'N/A';
				});

				// Update all phone fields
				detailsView.querySelectorAll(".candidate-phone").forEach(el => {
					el.textContent = candidate.phone_number || 'N/A';
				});

				// Update all job title fields
				detailsView.querySelectorAll(".candidate-job-title").forEach(el => {
					if (candidate.job_title) {
						el.innerHTML = `<a href="javascript:void(0)" class="job-posting-link" data-job-posting="${escapeHtml(candidate.job_title)}" style="color: inherit; text-decoration: underline; cursor: pointer;">${escapeHtml(candidate.designation || 'N/A')}</a>`;
						el.querySelector('.job-posting-link').addEventListener('click', (e) => {
							e.preventDefault();
							frappe.set_route('Form', 'Job Position', candidate.job_title);
						});
					} else {
						el.textContent = candidate.designation || 'N/A';
					}
				});

				// Update experience fields
				const minExp = detailsView.querySelector(".candidate-min-exp");
				if (minExp) minExp.textContent = candidate.min_experience || 'N/A';

				const maxExp = detailsView.querySelector(".candidate-max-exp");
				if (maxExp) maxExp.textContent = candidate.max_experience || 'N/A';

				// Update CTC fields
				const minCtc = detailsView.querySelector(".candidate-min-ctc");
				if (minCtc) minCtc.textContent = candidate.min_ctc || 'N/A';

				const maxCtc = detailsView.querySelector(".candidate-max-ctc");
				if (maxCtc) maxCtc.textContent = candidate.max_ctc || 'N/A';

				// Update skills
				const skills = detailsView.querySelector(".candidate-skills");
				if (skills) skills.textContent = candidate.skills || 'N/A';

				// Render job-vs-candidate fit mini dashboard
				this.loadAndRenderFitDashboard(detailsView, candidate);

				// Update all status fields
				detailsView.querySelectorAll(".candidate-status").forEach(el => {
					el.textContent = candidate.status || 'Pending';
				});

				// Bind dropdown actions
				const actionDropdown = detailsView.querySelector("#candidate-actions-dropdown");
				if (actionDropdown) {
					const dropdownItems = actionDropdown.querySelectorAll(".dropdown-item");
					dropdownItems.forEach(item => {
						item.addEventListener("click", (e) => {
							e.preventDefault();
							const action = item.getAttribute("data-action");

							if (action === "back") {
								frappe.set_route("candidates");
							} else if (action === "edit") {
								frappe.ui.form.make_quick_entry("Job Applicant", {
									doc: candidate,
									after_insert: () => {
										this.fetch_list_data({ reset: true });
										frappe.set_route("candidates");
										}
									});
								} else if (action === "delete") {
									if (confirm("Are you sure you want to delete this candidate?")) {
										frappe.call({
											method: "renewal_module.custom_module.page.candidates.candidates.delete_candidate",
											args: { candidate_id: candidate_id },
											callback: (r) => {
												if (r.message && r.message.success) {
													frappe.msgprint("Candidate deleted successfully");
													frappe.set_route("candidates");
												}
											}
										});
									}
								}
							});
						});
					}

					// Bind status change dropdown
					const statusDropdown = document.querySelector("button.btn-navblue");
					if (statusDropdown) {
						statusDropdown.addEventListener("click", (e) => {
							const action = e.target.getAttribute("data-action");
							if (!action) return;

							let newStatus = null;
							if (action === "set_pending") newStatus = "Pending";
							else if (action === "set_accepted") newStatus = "Accepted";
							else if (action === "set_rejected") newStatus = "Rejected";

							if (newStatus) {
								frappe.call({
									method: "frappe.client.set_value",
									args: {
										doctype: "Job Applicant",
										name: candidate_id,
										fieldname: "status",
										value: newStatus
									},
									callback: (r) => {
										if (!r.exc) {
											frappe.show_alert({
												message: `Status updated to ${newStatus}`,
												indicator: "green"
											});
											this.load_candidate_details(candidate_id);
										}
									}
								});
							}
						});
					}

					// Update right sidebar information
					const createdAtInfo = detailsView.querySelector("#created-at-info");
					if (createdAtInfo) {
						createdAtInfo.textContent = candidate.creation ? formatDate(candidate.creation) : '–';
					}

					const modifiedAtInfo = detailsView.querySelector("#modified-at-info");
					if (modifiedAtInfo) {
						modifiedAtInfo.textContent = candidate.modified ? formatDate(candidate.modified) : '–';
					}

					const ownerInfo = detailsView.querySelector("#owner-info");
					if (ownerInfo) {
						ownerInfo.textContent = candidate.owner || '–';
					}

					// Update tags if they exist
					const tagsContainer = detailsView.querySelector("#candidate-tags-container");
					if (tagsContainer) {
						if (candidate.tags) {
							const tagsArray = candidate.tags.split(',').map(t => t.trim()).filter(t => t);
							if (tagsArray.length > 0) {
								tagsContainer.innerHTML = tagsArray.map(tag => 
									`<span class="candidate-tag">${tag} <span class="remove-tag">×</span></span>`
								).join('');
							}
						}
					}

					// Fetch and display comments
					frappe.call({
						method: "frappe.client.get_list",
						args: {
							doctype: "Comment",
							filters: {
								reference_doctype: "Job Applicant",
								reference_name: candidate_id
							},
							order_by: "creation desc",
							fields: ["name", "content", "owner", "creation"]
						},
						callback: (r) => {
							if (r.message && r.message.length > 0) {
								const commentsList = detailsView.querySelector("#candidate-comments-list");
								commentsList.innerHTML = r.message.map(comment => `
									<div class="comment-item">
										<div class="comment-avatar">
											<div class="avatar-frame" style="background-color: var(--gray-avatar-bg); color: var(--gray-avatar-color);"></div>
										</div>
										<div class="comment-content">
											<div class="comment-header">
												<span class="comment-author">${comment.owner}</span>
												<span class="comment-time">${formatDate(comment.creation)}</span>
											</div>
											<div class="comment-text">${comment.content}</div>
										</div>
									</div>
								`).join('');
							}
						}
					});

				// Fetch and display attachments
				frappe.call({
					method: "frappe.client.get_list",
					args: {
						doctype: "File",
						filters: {
							attached_to_doctype: "Job Applicant",
							attached_to_name: candidate_id
						},
						fields: ["name", "file_name", "file_url", "creation", "owner"]
					},
					callback: (r) => {
						if (r.message && r.message.length > 0) {
							const attachmentsList = detailsView.querySelector("#candidate-attachments-list");
							attachmentsList.innerHTML = r.message.map(file => `
								<div class="attachment-item border round" style="display: flex; align-items: center; gap: 8px; padding: 6px;">
									<i class="fa fa-file"></i>
									<a href="${file.file_url}" target="_blank" title="${file.file_name}" style="text-decoration: none; color: #007bff;">
										${file.file_name.length > 30 ? file.file_name.substring(0, 30) + '...' : file.file_name}
									</a>
									<button class="btn btn-sm btn-link delete-attachment" data-file-id="${file.name}" style="padding: 0; color: #dc3545;" title="Delete">
										<i class="fa fa-trash"></i>
									</button>
								</div>
							`).join('');

							// Bind delete attachment buttons
							const deleteButtons = attachmentsList.querySelectorAll(".delete-attachment");
							deleteButtons.forEach(btn => {
								btn.addEventListener("click", () => {
									const fileId = btn.getAttribute("data-file-id");
									if (confirm("Are you sure you want to delete this attachment?")) {
										frappe.call({
											method: "frappe.client.delete",
											args: {
												doctype: "File",
												name: fileId
											},
											callback: (r) => {
												if (!r.exc) {
													frappe.show_alert("Attachment deleted", "green");
													this.load_candidate_details(candidate_id);
												}
											}
										});
									}
								});
							});
						}
					}
				});

				}
			}
		});
	}

	bind_candidate_details_events(candidate_id) {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		
		// Bind add attachment button
		const addAttachmentBtn = wrapper.querySelector("#add-attachment-btn");
		if (addAttachmentBtn) {
			addAttachmentBtn.addEventListener("click", () => {
				const input = document.createElement("input");
				input.type = "file";
				input.multiple = true;
				input.onchange = (e) => {
					const files = Array.from(e.target.files);
					if (files.length === 0) return;

					files.forEach(file => {
						const reader = new FileReader();
						reader.onload = () => {
							frappe.call({
								method: "frappe.client.insert",
								args: {
									doc: {
										doctype: "File",
										file_name: file.name,
										attached_to_doctype: "Job Applicant",
										attached_to_name: candidate_id,
										is_private: 1
									}
								},
								callback: () => {
									frappe.call({
										method: "frappe.client.get_list",
										args: {
											doctype: "File",
											filters: {
												file_name: file.name,
												attached_to_doctype: "Job Applicant",
												attached_to_name: candidate_id
											},
											order_by: "creation desc",
											limit_page_length: 1
										},
										callback: (r) => {
											if (r.message && r.message[0]) {
												const fileDoc = r.message[0];
												frappe.call({
													method: "frappe.client.set_value",
													args: {
														doctype: "File",
														name: fileDoc.name,
														fieldname: "file_url",
														value: `/files/${file.name}`
													},
													callback: () => {
														frappe.show_alert("Attachment uploaded", "green");
														this.load_candidate_details(candidate_id);
													}
												});
											}
										}
									});
								}
							});
						};
						reader.readAsArrayBuffer(file);
					});
				};
				input.click();
			});
		}
		
		// Bind comment button
		const commentBtn = wrapper.querySelector("#add-candidate-comment-btn");
		if (commentBtn) {
			commentBtn.addEventListener("click", () => {
				const commentInput = wrapper.querySelector("#new-candidate-comment");
				const text = commentInput?.textContent?.trim();
				
				if (!text) {
					frappe.msgprint("Please enter a note");
					return;
				}
				
				frappe.call({
					method: "frappe.client.insert",
					args: {
						doc: {
							doctype: "Comment",
							reference_doctype: "Job Applicant",
							reference_name: candidate_id,
							content: text
						}
					},
					callback: (r) => {
						if (!r.exc) {
							frappe.show_alert("Note added", "green");
							commentInput.textContent = "";
							this.load_candidate_details(candidate_id);
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
				if (action === "set_pending") newStatus = "Pending";
				else if (action === "set_accepted") newStatus = "Accepted";
				else if (action === "set_rejected") newStatus = "Rejected";
				else return;
				
				frappe.call({
					method: "frappe.client.set_value",
					args: {
						doctype: "Job Applicant",
						name: candidate_id,
						fieldname: "status",
						value: newStatus
					},
					callback: (r) => {
						if (!r.exc) {
							frappe.show_alert({
								message: `Status updated to ${newStatus}`,
								indicator: "green"
							});
							this.load_candidate_details(candidate_id);
						}
					}
				});
			});
		});

		// Bind email send button
		const emailBtn = wrapper.querySelector("#email-send-candidate");
		if (emailBtn) {
			emailBtn.addEventListener("click", () => {
				frappe.call({
					method: "frappe.client.get",
					args: {
						doctype: "Job Applicant",
						name: candidate_id
					},
					callback: (r) => {
						if (r.message) {
							const candidate = r.message;
							const inbox = new frappe.ui.form.InboxItem(frappe.boot.user.name, item => {
								// Send email
								const emailDialog = new frappe.views.CommunicationComposer({
									doc: {
										doctype: "Job Applicant",
										name: candidate_id,
										applicant_name: candidate.applicant_name,
										recipient: candidate.email_id
									},
									title: `Email to ${candidate.applicant_name}`,
									message: "",
									recipients: [candidate.email_id]
								});
							});
						}
					}
				});
			});
		}
	}

	bind_candidate_form_events() {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const form = wrapper.querySelector("#new-candidate-form");
		if (!form) return;

		const submitBtn = form.querySelector(".btn-wizard-submit");
		const cancelBtn = form.querySelector(".btn-cancel");

		// Setup job title autocomplete
		this.setupJobTitleAutocomplete(form);
		this.setupPreviousCompanies(form);

		if (submitBtn) {
			submitBtn.addEventListener("click", () => {
				this.submitCandidateForm();
			});
		}

		if (cancelBtn) {
			cancelBtn.addEventListener("click", () => {
				frappe.set_route("candidates");
			});
		}

		// Handle resume upload
		const resumeInput = form.querySelector("#resume-upload");
		const resumePreview = form.querySelector("#resume-preview");
		const resumeFilename = form.querySelector("#resume-filename");
		const removeResumeBtn = form.querySelector("#remove-resume");

		if (resumeInput) {
			resumeInput.addEventListener("change", (e) => {
				const file = e.target.files[0];
				if (file) {
					// Check file size (5MB max)
					if (file.size > 5 * 1024 * 1024) {
						frappe.msgprint({
							title: "File Too Large",
							message: "Resume file size should not exceed 5MB",
							indicator: "red"
						});
						resumeInput.value = "";
						return;
					}

					// Check file type
					const allowedTypes = ['.pdf', '.doc', '.docx'];
					const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
					if (!allowedTypes.includes(fileExtension)) {
						frappe.msgprint({
							title: "Invalid File Type",
							message: "Please upload a PDF, DOC, or DOCX file",
							indicator: "red"
						});
						resumeInput.value = "";
						return;
					}

					// Show preview
					if (resumeFilename) {
						resumeFilename.textContent = file.name;
					}
					if (resumePreview) {
						resumePreview.style.display = "block";
					}
				}
			});
		}

		if (removeResumeBtn) {
			removeResumeBtn.addEventListener("click", () => {
				if (resumeInput) {
					resumeInput.value = "";
				}
				if (resumePreview) {
					resumePreview.style.display = "none";
				}
				if (resumeFilename) {
					resumeFilename.textContent = "";
				}
			});
		}

		// Define field of study options by qualification
		const fieldOfStudyOptions = {
			"High School": [
				"Science",
				"Commerce",
				"Arts",
				"Vocational Training"
			],
			"Intermediate": [
				"Engineering",
				"Computer Science",
				"Business Management",
				"Nursing",
				"Pharmacy",
				"Hotel Management",
				"Fashion Design",
				"Interior Design",
				"Animation",
				"Mechanical Engineering",
				"Civil Engineering",
				"Electrical Engineering"
			],
			"Graduation": [
				"Computer Science",
				"Information Technology",
				"Engineering",
				"Mechanical Engineering",
				"Civil Engineering",
				"Electrical Engineering",
				"Electronics Engineering",
				"Business Administration",
				"Commerce",
				"Economics",
				"Finance",
				"Accounting",
				"Marketing",
				"Human Resources",
				"Medicine",
				"Nursing",
				"Pharmacy",
				"Law",
				"Arts",
				"Science",
				"Mathematics",
				"Physics",
				"Chemistry",
				"Biology",
				"Psychology",
				"Sociology",
				"Political Science",
				"History",
				"Literature",
				"Architecture",
				"Design",
				"Mass Communication",
				"Journalism"
			]
		};

		this.setupMultiSelectAutocomplete(form, {
			inputId: "technical-skills-input",
			dropdownId: "technical-skills-dropdown",
			tagsId: "technical-skills-tags",
			hiddenId: "technical-skills-hidden",
			options: [
				"Java", "Python", "JavaScript", "TypeScript", "React", "Angular", "Vue.js", "Node.js",
				"SQL", "PostgreSQL", "MongoDB", "AWS", "Azure", "Google Cloud", "Docker", "Kubernetes",
				"Git", "CI/CD", "REST API", "GraphQL", "Machine Learning", "Data Analysis", "Linux",
				"C++", "C#", ".NET", "PHP", "Ruby", "Go", "Swift", "Kotlin", "Android Development", "iOS Development"
			]
		});

		this.setupMultiSelectAutocomplete(form, {
			inputId: "soft-skills-input",
			dropdownId: "soft-skills-dropdown",
			tagsId: "soft-skills-tags",
			hiddenId: "soft-skills-hidden",
			options: [
				"Communication", "Leadership", "Team Management", "Problem Solving", "Critical Thinking",
				"Time Management", "Adaptability", "Collaboration", "Creativity", "Emotional Intelligence",
				"Conflict Resolution", "Decision Making", "Presentation Skills", "Negotiation", "Active Listening",
				"Attention to Detail", "Stress Management", "Project Management", "Customer Service",
				"Strategic Thinking", "Interpersonal Skills", "Analytical Skills", "Mentoring", "Public Speaking"
			]
		});
	}

	setupPreviousCompanies(form) {
		const list = form.querySelector("#previous-companies-list");
		const addBtn = form.querySelector("#add-previous-company");
		if (!list || !addBtn) return;

		const createEntry = () => {
			const item = document.createElement("div");
			item.className = "previous-company-entry";
			item.style.cssText = "background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-bottom: 10px;";
			item.innerHTML = `
				<div class="row">
					<div class="col-12 col-md-2">
						<div class="mb-2">
							<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 12px; margin-bottom: 4px;">From</label>
							<input type="month" class="form-control prev-company-from" style="padding: 6px 8px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 13px;">
						</div>
					</div>
					<div class="col-12 col-md-2">
						<div class="mb-2">
							<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 12px; margin-bottom: 4px;">To</label>
							<input type="month" class="form-control prev-company-to" style="padding: 6px 8px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 13px;">
						</div>
					</div>
					<div class="col-12 col-md-3">
						<div class="mb-2">
							<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 12px; margin-bottom: 4px;">Company</label>
							<input type="text" class="form-control prev-company-name" placeholder="Company name" style="padding: 6px 8px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 13px;">
						</div>
					</div>
					<div class="col-12 col-md-3">
						<div class="mb-2">
							<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 12px; margin-bottom: 4px;">Location</label>
							<input type="text" class="form-control prev-company-location" placeholder="City" style="padding: 6px 8px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 13px;">
						</div>
					</div>
					<div class="col-12 col-md-2">
						<div class="mb-2">
							<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 12px; margin-bottom: 4px;">Role</label>
							<input type="text" class="form-control prev-company-role" placeholder="Role" style="padding: 6px 8px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 13px;">
						</div>
					</div>
				</div>
				<div style="display: flex; justify-content: flex-end;">
					<button type="button" class="btn btn-sm btn-outline-danger remove-previous-company" style="padding: 4px 10px; font-size: 12px;">Remove</button>
				</div>
			`;

			item.querySelector(".remove-previous-company")?.addEventListener("click", () => {
				item.remove();
				if (!list.querySelector(".previous-company-entry")) {
					list.appendChild(createEntry());
				}
			});

			return item;
		};

		if (!list.querySelector(".previous-company-entry")) {
			list.appendChild(createEntry());
		}

		addBtn.addEventListener("click", () => {
			list.appendChild(createEntry());
		});
	}

	setupJobTitleAutocomplete(form) {
		const designationInput = form.querySelector('input[name="designation"]');
		if (!designationInput) return;

		const wrapper = document.createElement('div');
		wrapper.style.position = 'relative';
		designationInput.parentNode.insertBefore(wrapper, designationInput);
		wrapper.appendChild(designationInput);

		const dropdownDiv = document.createElement('div');
		dropdownDiv.id = 'job-title-dropdown';
		dropdownDiv.style.cssText = `
			position: absolute;
			top: 100%;
			left: 0;
			right: 0;
			background: white;
			border: 1px solid #e2e8f0;
			border-radius: 6px;
			max-height: 200px;
			overflow-y: auto;
			display: none;
			z-index: 1000;
			box-shadow: 0 2px 8px rgba(0,0,0,0.1);
		`;
		wrapper.appendChild(dropdownDiv);

		let jobsList = [];
		let inputTimeout;

		// Fetch jobs on input focus
		designationInput.addEventListener('focus', async () => {
			if (!jobsList.length) {
				jobsList = await this.fetchJobOpenings();
			}
			this.renderJobTitleDropdown(designationInput, dropdownDiv, jobsList, '');
		});

		// Filter on input
		designationInput.addEventListener('input', async () => {
			clearTimeout(inputTimeout);
			inputTimeout = setTimeout(async () => {
				if (!jobsList.length) {
					jobsList = await this.fetchJobOpenings();
				}
				const searchText = designationInput.value.toLowerCase().trim();
				this.renderJobTitleDropdown(designationInput, dropdownDiv, jobsList, searchText);
			}, 300);
		});

		// Close dropdown on blur
		designationInput.addEventListener('blur', () => {
			setTimeout(() => {
				dropdownDiv.style.display = 'none';
			}, 200);
		});

		// Close dropdown on outside click
		document.addEventListener('click', (e) => {
			if (!wrapper.contains(e.target)) {
				dropdownDiv.style.display = 'none';
			}
		});
	}

	renderJobTitleDropdown(inputEl, dropdownDiv, jobs, searchText) {
		const filtered = jobs.filter(job => {
			const title = String(job.job_title || '').toLowerCase();
			const jobName = String(job.name || '').toLowerCase();
			return title.includes(searchText) || jobName.includes(searchText);
		});

		if (!filtered.length) {
			dropdownDiv.innerHTML = '<div style="padding: 8px; color: #94a3b8;">No job postings found</div>';
			dropdownDiv.style.display = inputEl.value.length > 0 ? 'block' : 'none';
			return;
		}

		dropdownDiv.innerHTML = filtered.map(job => `
			<button type="button" class="job-title-option" data-value="${escapeHtml(job.name)}"
				style="display: block; width: 100%; padding: 10px 12px; border: none; background: none; text-align: left; cursor: pointer; color: #1e293b; font-size: 14px; transition: all 0.15s;">
				<div style="font-weight: 600;">${escapeHtml(job.job_title)}</div>
				<div style="font-size: 12px; color: #64748b;">${escapeHtml(job.name)}</div>
			</button>
		`).join('');

		dropdownDiv.style.display = 'block';

		// Bind click handlers
		dropdownDiv.querySelectorAll('.job-title-option').forEach(btn => {
			btn.addEventListener('click', (e) => {
				e.preventDefault();
				const jobName = btn.getAttribute('data-value');
				const job = jobs.find(j => j.name === jobName);
				if (job) {
					inputEl.value = job.job_title;
					inputEl.dataset.jobId = jobName;
					dropdownDiv.style.display = 'none';
				}
			});

			btn.addEventListener('mouseenter', () => {
				btn.style.background = '#f1f5f9';
			});
			btn.addEventListener('mouseleave', () => {
				btn.style.background = 'none';
			});
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
			tag.innerHTML = `<span>${value}</span><button type=\"button\" style=\"border:none;background:transparent;color:#1e3a8a;padding:0;line-height:1;cursor:pointer;font-size:14px;\">x</button>`;
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
				`<button type=\"button\" data-value=\"${opt.replace(/\"/g, "&quot;")}\" style=\"display:block;width:100%;text-align:left;border:none;background:#fff;padding:6px 8px;font-size:13px;cursor:pointer;border-bottom:1px solid #f1f5f9;\">${opt}</button>`
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

	initializeWizard() {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
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
			const circle = indicator.querySelector('div:first-child');
			const label = indicator.querySelector('div:last-child');
			
			if (stepNum < stepNumber) {
				// Completed step
				indicator.classList.add('completed');
				indicator.classList.remove('active');
				if (circle) {
					circle.style.background = '#10b981';
					circle.style.color = 'white';
					circle.style.boxShadow = '0 2px 8px rgba(16, 185, 129, 0.3)';
				}
			} else if (stepNum === stepNumber) {
				// Active step
				indicator.classList.add('active');
				indicator.classList.remove('completed');
				if (circle) {
					circle.style.background = '#2563eb';
					circle.style.color = 'white';
					circle.style.boxShadow = '0 2px 8px rgba(37, 99, 235, 0.3)';
				}
			} else {
				// Upcoming step
				indicator.classList.remove('active', 'completed');
				if (circle) {
					circle.style.background = '#e2e8f0';
					circle.style.color = '#64748b';
					circle.style.boxShadow = 'none';
				}
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

	submitCandidateForm() {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const form = wrapper.querySelector("#new-candidate-form");
		if (!form) return;

		const dobRaw = form.querySelector('input[name="date_of_birth"]')?.value || '';
		const dobParsed = parseDateDDMMYYYY(dobRaw);
		if (dobRaw && !dobParsed) {
			frappe.msgprint("Date of Birth must be in dd/mm/yyyy format");
			this.showStep(6);
			return;
		}

		const previousCompanies = Array.from(form.querySelectorAll(".previous-company-entry")).map(entry => ({
			from: entry.querySelector(".prev-company-from")?.value || "",
			to: entry.querySelector(".prev-company-to")?.value || "",
			company: entry.querySelector(".prev-company-name")?.value?.trim() || "",
			location: entry.querySelector(".prev-company-location")?.value?.trim() || "",
			role: entry.querySelector(".prev-company-role")?.value?.trim() || ""
		})).filter(item => item.from || item.to || item.company || item.location || item.role);

		const existingNotes = form.querySelector('textarea[name="additional_notes"]')?.value?.trim() || "";
		const previousCompaniesNote = previousCompanies.length
			? "Previous Companies:\n" + previousCompanies.map((item, index) =>
				`${index + 1}. ${item.company || "N/A"} | ${item.role || "N/A"} | ${item.location || "N/A"} | ${item.from || "N/A"} to ${item.to || "Present"}`
			).join("\n")
			: "";
		const mergedAdditionalNotes = [existingNotes, previousCompaniesNote].filter(Boolean).join("\n\n");

		const candidateData = {
			applicant_name: form.querySelector('input[name="applicant_name"]')?.value || '',
			email_id: form.querySelector('input[name="email_id"]')?.value || '',
			phone_number: form.querySelector('input[name="phone_number"]')?.value || '',
			designation: form.querySelector('input[name="designation"]')?.value || '',
			min_experience: form.querySelector('input[name="min_experience"]')?.value || null,
			max_experience: form.querySelector('input[name="max_experience"]')?.value || null,
			// High School Education
			hs_field_of_study: form.querySelector('select[name="hs_field_of_study"]')?.value || '',
			hs_institution: form.querySelector('input[name="hs_institution"]')?.value || '',
			hs_graduation_year: form.querySelector('input[name="hs_graduation_year"]')?.value || null,
			hs_grade: form.querySelector('input[name="hs_grade"]')?.value || '',
			// Intermediate Education
			int_field_of_study: form.querySelector('select[name="int_field_of_study"]')?.value || '',
			int_institution: form.querySelector('input[name="int_institution"]')?.value || '',
			int_graduation_year: form.querySelector('input[name="int_graduation_year"]')?.value || null,
			int_grade: form.querySelector('input[name="int_grade"]')?.value || '',
			// Graduation Education
			grad_field_of_study: form.querySelector('select[name="grad_field_of_study"]')?.value || '',
			grad_institution: form.querySelector('input[name="grad_institution"]')?.value || '',
			grad_graduation_year: form.querySelector('input[name="grad_graduation_year"]')?.value || null,
			grad_grade: form.querySelector('input[name="grad_grade"]')?.value || '',
			current_ctc: form.querySelector('input[name="current_ctc"]')?.value || null,
			expected_ctc: form.querySelector('input[name="expected_ctc"]')?.value || null,
			min_ctc: form.querySelector('input[name="min_ctc"]')?.value || null,
			max_ctc: form.querySelector('input[name="max_ctc"]')?.value || null,
			notice_period: form.querySelector('input[name="notice_period"]')?.value || null,
			skills: form.querySelector('[name="skills"]')?.value || '',
			soft_skills: form.querySelector('[name="soft_skills"]')?.value || '',
			profile_summary: form.querySelector('textarea[name="profile_summary"]')?.value || '',
			linkedin_url: form.querySelector('input[name="linkedin_url"]')?.value || '',
			portfolio_url: form.querySelector('input[name="portfolio_url"]')?.value || '',
			status: form.querySelector('select[name="status"]')?.value || 'Pending',
			source: form.querySelector('select[name="source"]')?.value || '',
			current_location: form.querySelector('input[name="current_location"]')?.value || '',
			preferred_location: form.querySelector('input[name="preferred_location"]')?.value || '',
			date_of_birth: dobParsed || '',
			gender: form.querySelector('select[name="gender"]')?.value || '',
			additional_notes: mergedAdditionalNotes,
			previous_companies_json: previousCompanies.length ? JSON.stringify(previousCompanies) : "",
			referral_name: form.querySelector('input[name="referral_name"]')?.value || ''
		};

		if (!candidateData.applicant_name || !candidateData.email_id) {
			frappe.msgprint("Name and Email are required");
			this.showStep(1); // Go back to first step
			return;
		}

		// Check if resume is uploaded
		const resumeInput = form.querySelector('#resume-upload');
		const resumeFile = resumeInput?.files[0];

		if (resumeFile) {
			// Upload resume first, then create candidate
			const reader = new FileReader();
			reader.onload = (e) => {
				frappe.call({
					method: "frappe.client.insert",
					args: {
						doc: {
							doctype: "File",
							file_name: resumeFile.name,
							is_private: 1,
							content: e.target.result.split(',')[1], // Base64 content
							decode: true
						}
					},
					callback: (fileResp) => {
						if (fileResp.message) {
							candidateData.resume_attachment = fileResp.message.file_url;
							this.createCandidate(candidateData);
						}
					},
					error: () => {
						frappe.msgprint("Error uploading resume. Creating candidate without resume.");
						this.createCandidate(candidateData);
					}
				});
			};
			reader.readAsDataURL(resumeFile);
		} else {
			// No resume, just create candidate
			this.createCandidate(candidateData);
		}
	}

	createCandidate(candidateData) {
		frappe.call({
			method: "renewal_module.custom_module.page.candidates.candidates.save_candidate",
			args: { candidate_data: candidateData },
			callback: (r) => {
				if (r.message && r.message.success) {
					frappe.msgprint("Candidate created successfully");
					this.fetch_list_data({ reset: true });
					frappe.set_route("candidates");
				}
			}
		});
	}
}

// Helper functions
function escapeHtml(text) {
	const div = document.createElement('div');
	div.textContent = text;
	return div.innerHTML;
}

function formatDate(dateStr) {
	if (!dateStr) return '';
	const date = new Date(dateStr);
	if (Number.isNaN(date.getTime())) return '';
	const dd = String(date.getDate()).padStart(2, '0');
	const mm = String(date.getMonth() + 1).padStart(2, '0');
	const yyyy = date.getFullYear();
	return `${dd}/${mm}/${yyyy}`;
}

function getStatusClass(status) {
	const statusMap = {
		'Pending': 'badge-secondary',
		'Accepted': 'badge-success',
		'Rejected': 'badge-danger',
		'Accepted and Confirmed': 'badge-info',
		'Accepted and Joined': 'badge-success'
	};
	return statusMap[status] || 'badge-secondary';
}

frappe.candidates_page_template = {
	body: `
		<div class="wrapper candidates-wrapper">
			<div class="candidates-list-view d-none">

				<div class="row">
					<div class="col-12">
						<div class="page-title-head d-flex align-items-center">
							<div class="flex-grow-1">
								<h3 class="fs-xl fw-bold m-0">Candidates</h3>
							</div>
							<div class="text-end">
								<ol class="breadcrumb m-0 py-0" style="background-color: transparent;">
									<li class="breadcrumb-item"><a href="javascript: void(0);">HR</a></li>
									<li class="breadcrumb-item active">Candidates</li>
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
									<select id="filterStatus" class="control-select placeholder" data-table-filter="status">
										<option value="">Status</option>
										<option value="Pending">Pending</option>
										<option value="Accepted">Accepted</option>
										<option value="Rejected">Rejected</option>
										<option value="Accepted and Confirmed">Accepted and Confirmed</option>
										<option value="Accepted and Joined">Accepted and Joined</option>
									</select>
									<input type="text" id="searchCandidates" class="control-input placeholder" data-table-search placeholder="Search candidates..." />
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
									<a href="/app/candidates/new" class="btn btn-sm btn-primary1">
										<i class="fa fa-plus me-1"></i> New Candidate
									</a>
									<div class="dropdown d-none" id="job-list-actions-dropdown">
										<button class="btn btn-secondary1 dropdown-toggle job-list-actions-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">
											<span class="job-actions-count">Actions</span>
										</button>
										<ul class="dropdown-menu dropdown-menu-end">
											<li><a class="dropdown-item" href="#" data-action="set_edit">Edit</a></li>
											<li><a class="dropdown-item" href="#" data-action="set_export">Export</a></li>
											<li><a class="dropdown-item" href="#" data-action="set_assign_to">Assign To</a></li>
											<li><a class="dropdown-item" href="#" data-action="set_clear_assignment">Clear Assignment</a></li>
											<li><a class="dropdown-item" href="#" data-action="set_apply_assignment_rule">Apply Assignment Rule</a></li>
											<li><a class="dropdown-item" href="#" data-action="set_add_tags">Add Tags</a></li>
											<li><a class="dropdown-item" href="#" data-action="set_print">Print</a></li>
											<li><a class="dropdown-item text-danger" href="#" data-action="delete">Delete</a></li>
										</ul>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>

				<div class="row">
					<div class="col-12">
						<div class="card" style="background: transparent !important; border: none;box-shadow:none;">

							<div class="table-container mt-0">
								<table class="candidates-table">
									<thead>
										<tr>
											<th><input class="selectAllCandidates" type="checkbox" /></th>
											<th>Name</th>
											<th>Email</th>
											<th>Phone</th>
											<th>Job Title</th>
											<th>Status</th>
											<th>Modified</th>
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
										<button type="button" class="btn btn-default1 btn-light btn-sm btn-load-more" title="Load more">
											Load more
										</button>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>

			<!-- Details View -->
			<div class="candidates-details-view d-none">
				<div class="row">
					<div class="col-12">
						<div class="candidate-header">
							<div class="d-flex align-items-start justify-content-between w-100">
								<!-- Left side: Candidates text and email below -->
								<div>
									<h3 class="page-title mb-2">Candidates</h3>
									<span class="candidate-email-display" id="candidate-email-header">
										<i class="fa fa-envelope me-1"></i>
										<span class="candidate-email">N/A</span>
									</span>
								</div>
								
								<!-- Right side: HR/Candidates breadcrumb and Change Status button at the end -->
								<div class="text-end ms-auto">
									<ol class="breadcrumb m-0 mb-2" style="background-color: transparent;">
										<li class="breadcrumb-item">
											<a href="javascript:void(0)">HR</a>
										</li>
										<li class="breadcrumb-item">
											<a href="/app/candidates">Candidates</a>
										</li>
									</ol>
									<div class="dropdown">
										<button class="btn btn-default2 btn-navblue btn-sm dropdown-toggle" type="button" data-bs-toggle="dropdown">
											Change Status
										</button>
										<ul class="dropdown-menu dropdown-menu-end">
											<li><a class="dropdown-item" href="#" data-action="set_pending">Set Pending</a></li>
											<li><a class="dropdown-item" href="#" data-action="set_accepted">Set Accepted</a></li>
											<li><a class="dropdown-item" href="#" data-action="set_rejected">Set Rejected</a></li>
										</ul>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>	

				<div class="row mt-3">
					<div class="col-12">
						<div class="card" style="border:none;">
							<div class="card-header candidate-card-header">
								<!-- Left : Subject + Job Title -->
								<div class="candidate-header-left">
									<h5 class="candidate-subject-line">
										<span class="candidate-subject" id="detail-subject" title=""></span>
										<span class="mx-1">–</span>
										<span id="detail-job-title" class="job-title-badge"></span>
									</h5>
								</div>

								<!-- Right : Status + Email + Actions -->
								<div class="candidate-header-right">
									<span id="candidate-status-badge" class="status-badge">Pending</span>

									<button id="email-send-candidate" class="icon-btns" title="Send Email">
										<i class="fa fa-envelope"></i>
									</button>

									<div class="dropdown" id="candidate-actions-dropdown">
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
								<!-- Candidate Data Display -->
								<div id="candidate-data-display"></div>

								<!-- Attachments Section -->
								<div class="mb-4" id="attachments-section">
									<div class="d-flex align-items-center gap-1 mb-2">
										<h6 class="text-uppercase text-muted1 mb-0">Attachments</h6>
										<button id="add-attachment-btn" class="btn btn-sm btn-outline-primary btn-default2" title="Add attachment">
											<i class="fa fa-plus"></i>
										</button>
									</div>
									<div id="candidate-attachments-list" class="d-flex flex-wrap gap-2 small text-muted">
										<span class="text-muted">No attachments</span>
									</div>
								</div>

								<!-- Candidate Details Section -->
								<div class="mb-4">
									<div class="candidate-details-info">
										<div class="row mb-3">
											<div class="col-md-6">
												<div class="detail-field">
													<label class="detail-label">Email</label>
													<p class="detail-value candidate-email">N/A</p>
												</div>
											</div>
											<div class="col-md-6">
												<div class="detail-field">
													<label class="detail-label">Phone</label>
													<p class="detail-value candidate-phone">N/A</p>
												</div>
											</div>
										</div>

										<div class="row mb-3">
											<div class="col-md-6">
												<div class="detail-field">
													<label class="detail-label">Job Title</label>
													<p class="detail-value candidate-job-title">N/A</p>
												</div>
											</div>
											<div class="col-md-6">
												<div class="detail-field">
													<label class="detail-label">Status</label>
													<p class="detail-value"><span class="candidate-status">Pending</span></p>
												</div>
											</div>
										</div>

										<div class="row mb-3">
											<div class="col-md-6">
												<div class="detail-field">
													<label class="detail-label">Min Experience (Years)</label>
													<p class="detail-value candidate-min-exp">N/A</p>
												</div>
											</div>
											<div class="col-md-6">
												<div class="detail-field">
													<label class="detail-label">Max Experience (Years)</label>
													<p class="detail-value candidate-max-exp">N/A</p>
												</div>
											</div>
										</div>

										<div class="row mb-3">
											<div class="col-md-6">
												<div class="detail-field">
													<label class="detail-label">Min CTC (LPA)</label>
													<p class="detail-value candidate-min-ctc">N/A</p>
												</div>
											</div>
											<div class="col-md-6">
												<div class="detail-field">
													<label class="detail-label">Max CTC (LPA)</label>
													<p class="detail-value candidate-max-ctc">N/A</p>
												</div>
											</div>
										</div>

										<div class="row mb-3">
											<div class="col-md-12">
												<div class="detail-field">
													<label class="detail-label">Skills</label>
													<p class="detail-value candidate-skills">N/A</p>
												</div>
											</div>
										</div>

										<div class="row mb-3">
											<div class="col-md-12">
												<div class="detail-field" style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px;">
													<div class="d-flex justify-content-between align-items-center mb-2">
														<label class="detail-label mb-0">Job vs Candidate Fit</label>
														<span id="fit-score-value" class="badge bg-primary-subtle text-primary">0%</span>
													</div>
													<div class="small text-muted mb-2">Job Posting: <span id="fit-job-name">N/A</span></div>
													<div class="row">
														<div class="col-md-6 mb-2">
															<div class="small fw-semibold">Skills Match</div>
															<div id="fit-skills-value" class="small text-muted">0/0 matched (0%)</div>
														</div>
														<div class="col-md-6 mb-2">
															<div class="small fw-semibold">Experience Fit</div>
															<div id="fit-exp-value" class="small text-muted">Not enough data</div>
														</div>
													</div>
													<div class="small fw-semibold mb-1">Matched Skills</div>
													<div id="fit-matched-skills" class="mb-2"><span class="text-muted">No matched skills</span></div>
													<div class="small fw-semibold mb-1">Missing Skills</div>
													<div id="fit-missing-skills" class="mb-2"><span class="text-muted">No missing skills</span></div>
													<div class="small fw-semibold mb-1">Comparison Workflow</div>
													<div id="fit-workflow"></div>
												</div>
											</div>
										</div>
									</div>
								</div>

								<!-- Comments Section -->
								<div class="mb-4">
									<div class="comment-section mt-3">
										<!-- Previous Comments Display -->
										<div id="candidate-comments-list" class="comments-list mb-3">
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
														<div id="new-candidate-comment" class="ql-editor ql-blank" data-gramm="false" contenteditable="true" data-placeholder="Add a note..." style="border: 1px solid #ddd; padding: 6px; border-radius: 4px;"><p><br></p></div>
													</div>
												</div>
											</div>
											<button id="add-candidate-comment-btn" class="btn btn-primary btn-default2 btn-comment btn-xs">Add Note</button>
										</div>
									</div>
								</div>

								<!-- Activity Section -->
								<div class="mb-4">
									<h6 class="text-uppercase text-muted mb-4 activity">Activity:</h6>
									<div class="timeline" id="candidate-activity-timeline">
										<p class="text-muted">No activity yet</p>
									</div>
								</div>
							</div>
						</div>
					</div> <!-- end col-->

					
						
					</div>
				</div>
			</div>

			<!-- New Candidate View -->
			<div class="new-candidates d-none">
				<div class="row">
					<div class="col-12">
						<div class="ticket-header">
							<div class="ticket-breadcrumb">
								<h3 class="page-title">Candidates</h3>
								<ol class="breadcrumb">
									<li class="breadcrumb-item">
										<a href="javascript:void(0)">HR</a>
									</li>
									<li class="breadcrumb-item">
										<a href="/app/candidates">Candidates</a>
									</li>
									<li class="breadcrumb-item active">New</li>
								</ol>
							</div>
						</div>
					</div>
				</div>

				<div class="row mt-3">
					<div class="col-12">
						<!-- Wizard Progress -->
						<div class="wizard-progress-bar" style="background: white; padding: 16px; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); margin-bottom: 16px;">
							<div style="display: flex; justify-content: space-between; align-items: center; position: relative;">
								<div style="position: absolute; top: 20px; left: 0; right: 0; height: 2px; background: #e2e8f0; z-index: 1;"></div>
								
								<div class="wizard-step-indicator active" style="flex: 1; text-align: center; position: relative; z-index: 2;">
									<div style="width: 40px; height: 40px; border-radius: 50%; background: #2563eb; color: white; display: flex; align-items: center; justify-content: center; font-weight: 600; margin: 0 auto 8px; border: 3px solid white; box-shadow: 0 2px 8px rgba(37, 99, 235, 0.3);">1</div>
									<div style="font-size: 12px; color: #64748b; font-weight: 500;">Personal Details</div>
								</div>
								
								<div class="wizard-step-indicator" style="flex: 1; text-align: center; position: relative; z-index: 2;">
									<div style="width: 40px; height: 40px; border-radius: 50%; background: #e2e8f0; color: #64748b; display: flex; align-items: center; justify-content: center; font-weight: 600; margin: 0 auto 8px; border: 3px solid white;">2</div>
									<div style="font-size: 12px; color: #64748b; font-weight: 500;">Professional Details</div>
								</div>
								
								<div class="wizard-step-indicator" style="flex: 1; text-align: center; position: relative; z-index: 2;">
									<div style="width: 40px; height: 40px; border-radius: 50%; background: #e2e8f0; color: #64748b; display: flex; align-items: center; justify-content: center; font-weight: 600; margin: 0 auto 8px; border: 3px solid white;">3</div>
									<div style="font-size: 12px; color: #64748b; font-weight: 500;">Education</div>
								</div>
								
								<div class="wizard-step-indicator" style="flex: 1; text-align: center; position: relative; z-index: 2;">
									<div style="width: 40px; height: 40px; border-radius: 50%; background: #e2e8f0; color: #64748b; display: flex; align-items: center; justify-content: center; font-weight: 600; margin: 0 auto 8px; border: 3px solid white;">4</div>
									<div style="font-size: 12px; color: #64748b; font-weight: 500;">Salary & CTC</div>
								</div>
								
								<div class="wizard-step-indicator" style="flex: 1; text-align: center; position: relative; z-index: 2;">
									<div style="width: 40px; height: 40px; border-radius: 50%; background: #e2e8f0; color: #64748b; display: flex; align-items: center; justify-content: center; font-weight: 600; margin: 0 auto 8px; border: 3px solid white;">5</div>
									<div style="font-size: 12px; color: #64748b; font-weight: 500;">Skills & Profile</div>
								</div>
								
								<div class="wizard-step-indicator" style="flex: 1; text-align: center; position: relative; z-index: 2;">
									<div style="width: 40px; height: 40px; border-radius: 50%; background: #e2e8f0; color: #64748b; display: flex; align-items: center; justify-content: center; font-weight: 600; margin: 0 auto 8px; border: 3px solid white;">6</div>
									<div style="font-size: 12px; color: #64748b; font-weight: 500;">Additional Info</div>
								</div>
							</div>
						</div>

						<div class="card w-100" style="min-height:70vh; border: none; box-shadow: 0 2px 12px rgba(0,0,0,0.08); border-radius: 12px;">
							<div class="card-body" style="padding: 24px;">
								<form id="new-candidate-form">
									<!-- Step 1: Basic Information -->
									<div class="wizard-step" id="step-1">
										<h4 style="color: #1e293b; font-weight: 700; margin-bottom: 16px; font-size: 20px;">Basic Information</h4>
										
										<div class="row">
											<div class="col-12 col-md-6">
												<div class="mb-3">
													<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 6px;">Candidate Name <span style="color: #ef4444;">*</span></label>
													<input type="text" name="applicant_name" class="form-control" placeholder="Enter full name" required style="padding: 8px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; transition: all 0.2s;">
												</div>
											</div>
											<div class="col-12 col-md-6">
												<div class="mb-3">
													<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 6px;">Email <span style="color: #ef4444;">*</span></label>
													<input type="email" name="email_id" class="form-control" placeholder="candidate@example.com" required style="padding: 8px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; transition: all 0.2s;">
												</div>
											</div>
										</div>

										<div class="row">
											<div class="col-12 col-md-6">
												<div class="mb-3">
													<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 6px;">Phone</label>
													<input type="text" name="phone_number" class="form-control" placeholder="+91 9876543210" style="padding: 8px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; transition: all 0.2s;">
												</div>
											</div>
										</div>
									</div>

									<!-- Step 2: Professional Details -->
									<div class="wizard-step d-none" id="step-2">
										<h4 style="color: #1e293b; font-weight: 700; margin-bottom: 16px; font-size: 20px;">Professional Details</h4>
										
										<div class="row">
											<div class="col-12 col-md-6">
												<div class="mb-3">
													<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 6px;">Job Title / Designation</label>
													<input type="text" name="designation" class="form-control" placeholder="e.g., Software Engineer, Marketing Manager" style="padding: 8px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; transition: all 0.2s;">
												</div>
											</div>
										</div>

										<div class="row">
											<div class="col-12 col-md-6">
												<div class="mb-3">
													<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 6px;">Min Experience (Years)</label>
													<input type="number" name="min_experience" class="form-control" placeholder="0" min="0" step="0.5" style="padding: 8px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; transition: all 0.2s;">
												</div>
											</div>
											<div class="col-12 col-md-6">
												<div class="mb-3">
													<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 6px;">Max Experience (Years)</label>
													<input type="number" name="max_experience" class="form-control" placeholder="10" min="0" step="0.5" style="padding: 8px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; transition: all 0.2s;">
												</div>
											</div>
										</div>
									</div>

									<!-- Step 3: Education -->
									<div class="wizard-step d-none" id="step-3">
										<h4 style="color: #1e293b; font-weight: 700; margin-bottom: 16px; font-size: 20px;">Education Details</h4>
										
										<!-- High School Section -->
										<div style="background-color: #f8fafc; padding: 16px; border-radius: 8px; margin-bottom: 24px; border-left: 4px solid #3b82f6;">
											<h5 style="color: #1e293b; font-weight: 600; margin-bottom: 14px; font-size: 16px;">High School</h5>
											
											<div class="row">
												<div class="col-12 col-md-6">
													<div class="mb-3">
														<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 6px;">Field of Study</label>
														<select name="hs_field_of_study" id="hs_field_of_study" class="form-control" style="padding: 8px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; transition: all 0.2s;">
															<option value="">Select Stream</option>
															<option value="Science">Science</option>
															<option value="Commerce">Commerce</option>
															<option value="Humanities">Humanities</option>
															<option value="General/Others">General/Others</option>
														</select>
													</div>
												</div>
												<div class="col-12 col-md-6">
													<div class="mb-3">
														<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 6px;">Graduation Year</label>
														<input type="number" name="hs_graduation_year" class="form-control" placeholder="e.g., 2015" min="1950" max="2030" style="padding: 8px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; transition: all 0.2s;">
													</div>
												</div>
											</div>

											<div class="row">
												<div class="col-12 col-md-6">
													<div class="mb-3">
														<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 6px;">School/Institution</label>
														<input type="text" name="hs_institution" class="form-control" placeholder="e.g., Delhi Public School" style="padding: 8px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; transition: all 0.2s;">
													</div>
												</div>
												<div class="col-12 col-md-6">
													<div class="mb-3">
														<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 6px;">Grade/Percentage</label>
														<input type="text" name="hs_grade" class="form-control" placeholder="e.g., 85%" style="padding: 8px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; transition: all 0.2s;">
													</div>
												</div>
											</div>
										</div>

										<!-- Intermediate Section -->
										<div style="background-color: #f8fafc; padding: 16px; border-radius: 8px; margin-bottom: 24px; border-left: 4px solid #8b5cf6;">
											<h5 style="color: #1e293b; font-weight: 600; margin-bottom: 14px; font-size: 16px;">Intermediate (12th Standard)</h5>
											
											<div class="row">
												<div class="col-12 col-md-6">
													<div class="mb-3">
														<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 6px;">Field of Study</label>
														<select name="int_field_of_study" id="int_field_of_study" class="form-control" style="padding: 8px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; transition: all 0.2s;">
															<option value="">Select Stream</option>
															<option value="MPC">MPC (Maths, Physics, Chemistry)</option>
															<option value="BiPC">BiPC (Biology, Physics, Chemistry)</option>
															<option value="MEC">MEC (Maths, Economics, Commerce)</option>
															<option value="HEC">HEC (History, Economics, Commerce)</option>
														</select>
													</div>
												</div>
												<div class="col-12 col-md-6">
													<div class="mb-3">
														<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 6px;">Graduation Year</label>
														<input type="number" name="int_graduation_year" class="form-control" placeholder="e.g., 2017" min="1950" max="2030" style="padding: 8px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; transition: all 0.2s;">
													</div>
												</div>
											</div>

											<div class="row">
												<div class="col-12 col-md-6">
													<div class="mb-3">
														<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 6px;">College/Institution</label>
														<input type="text" name="int_institution" class="form-control" placeholder="e.g., St. Stephen's College" style="padding: 8px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; transition: all 0.2s;">
													</div>
												</div>
												<div class="col-12 col-md-6">
													<div class="mb-3">
														<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 6px;">Grade/Percentage</label>
														<input type="text" name="int_grade" class="form-control" placeholder="e.g., 8.2 CGPA or 82%" style="padding: 8px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; transition: all 0.2s;">
													</div>
												</div>
											</div>
										</div>

										<!-- Graduation Section -->
										<div style="background-color: #f8fafc; padding: 16px; border-radius: 8px; margin-bottom: 24px; border-left: 4px solid #10b981;">
											<h5 style="color: #1e293b; font-weight: 600; margin-bottom: 14px; font-size: 16px;">Graduation</h5>
											
											<div class="row">
												<div class="col-12 col-md-6">
													<div class="mb-3">
														<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 6px;">Field of Study</label>
														<select name="grad_field_of_study" id="grad_field_of_study" class="form-control" style="padding: 8px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; transition: all 0.2s;">
															<option value="">Select Degree/Field</option>
															<optgroup label="---- Engineering & Technology ----">
																<option value="B.Tech - Computer Science & Engineering">B.Tech - CS&E</option>
																<option value="B.Tech - Information Technology">B.Tech - IT</option>
																<option value="B.Tech - Mechanical Engineering">B.Tech - Mechanical</option>
																<option value="B.Tech - Civil Engineering">B.Tech - Civil</option>
																<option value="B.Tech - Electrical Engineering">B.Tech - Electrical</option>
																<option value="B.Tech - Electronics Engineering">B.Tech - Electronics</option>
																<option value="B.Tech - Chemical Engineering">B.Tech - Chemical</option>
																<option value="B.Tech - Aeronautical Engineering">B.Tech - Aeronautical</option>
																<option value="BCA - Bachelor of Computer Applications">BCA - Computer Applications</option>
															</optgroup>
															<optgroup label="---- Science ----">
																<option value="B.Sc - Physics">B.Sc - Physics</option>
																<option value="B.Sc - Chemistry">B.Sc - Chemistry</option>
																<option value="B.Sc - Mathematics">B.Sc - Mathematics</option>
																<option value="B.Sc - Computer Science">B.Sc - Computer Science</option>
																<option value="B.Sc - Biology">B.Sc - Biology</option>
																<option value="B.Sc - Biotechnology">B.Sc - Biotechnology</option>
															</optgroup>
															<optgroup label="---- Commerce ----">
																<option value="B.Com - General Commerce">B.Com - General</option>
																<option value="B.Com - Accounting">B.Com - Accounting</option>
																<option value="BBA - Business Administration">BBA</option>
																<option value="CA - Chartered Accountancy">CA - Chartered Accountancy</option>
															</optgroup>
															<optgroup label="---- Arts & Humanities ----">
																<option value="BA - English">BA - English</option>
																<option value="BA - History">BA - History</option>
																<option value="BA - Political Science">BA - Political Science</option>
																<option value="BA - Psychology">BA - Psychology</option>
																<option value="BA - Journalism">BA - Journalism</option>
															</optgroup>
															<optgroup label="---- Medical & Healthcare ----">
																<option value="MBBS - Doctor of Medicine">MBBS</option>
																<option value="BDS - Dental Surgery">BDS - Dental</option>
																<option value="B.Pharm - Pharmacy">B.Pharm</option>
																<option value="BSc Nursing">BSc Nursing</option>
															</optgroup>
															<optgroup label="---- Law & Management ----">
																<option value="LLB - Law">LLB - Law</option>
																<option value="MBA - Master of Business Admin">MBA</option>
															</optgroup>
															<optgroup label="---- Other Courses ----">
																<option value="Diploma in Engineering">Diploma in Engineering</option>
																<option value="Other">Other</option>
															</optgroup>
														</select>
													</div>
												</div>
												<div class="col-12 col-md-6">
													<div class="mb-3">
														<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 6px;">Graduation Year</label>
														<input type="number" name="grad_graduation_year" class="form-control" placeholder="e.g., 2020" min="1950" max="2030" style="padding: 8px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; transition: all 0.2s;">
													</div>
												</div>
											</div>

											<div class="row">
												<div class="col-12 col-md-6">
													<div class="mb-3">
														<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 6px;">University/Institution</label>
														<input type="text" name="grad_institution" class="form-control" placeholder="e.g., University of Delhi" style="padding: 8px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; transition: all 0.2s;">
													</div>
												</div>
												<div class="col-12 col-md-6">
													<div class="mb-3">
														<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 6px;">Grade/Percentage (CGPA)</label>
														<input type="text" name="grad_grade" class="form-control" placeholder="e.g., 8.5 CGPA or 85%" style="padding: 8px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; transition: all 0.2s;">
													</div>
												</div>
											</div>
										</div>
									</div>

									<!-- Step 4: Salary & CTC -->
									<div class="wizard-step d-none" id="step-4">
										<h4 style="color: #1e293b; font-weight: 700; margin-bottom: 16px; font-size: 20px;">Salary & CTC Details</h4>
										
										<div class="row">
											<div class="col-12 col-md-6">
												<div class="mb-3">
													<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 6px;">Current CTC (LPA)</label>
													<input type="number" name="current_ctc" class="form-control" placeholder="e.g., 6" min="0" step="0.1" style="padding: 8px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; transition: all 0.2s;">
													<small class="text-muted" style="font-size: 12px;">Lakhs Per Annum</small>
												</div>
											</div>
											<div class="col-12 col-md-6">
												<div class="mb-3">
													<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 6px;">Expected CTC (LPA)</label>
													<input type="number" name="expected_ctc" class="form-control" placeholder="e.g., 8" min="0" step="0.1" style="padding: 8px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; transition: all 0.2s;">
													<small class="text-muted" style="font-size: 12px;">Lakhs Per Annum</small>
												</div>
											</div>
										</div>

										<div class="row">
											<div class="col-12 col-md-6">
												<div class="mb-3">
													<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 6px;">Min CTC (LPA)</label>
													<input type="number" name="min_ctc" class="form-control" placeholder="e.g., 5" min="0" step="0.1" style="padding: 8px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; transition: all 0.2s;">
													<small class="text-muted" style="font-size: 12px;">Lakhs Per Annum</small>
												</div>
											</div>
											<div class="col-12 col-md-6">
												<div class="mb-3">
													<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 6px;">Max CTC (LPA)</label>
													<input type="number" name="max_ctc" class="form-control" placeholder="e.g., 10" min="0" step="0.1" style="padding: 8px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; transition: all 0.2s;">
													<small class="text-muted" style="font-size: 12px;">Lakhs Per Annum</small>
												</div>
											</div>
										</div>

										<div class="row">
											<div class="col-12 col-md-6">
												<div class="mb-3">
													<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 6px;">Notice Period (Days)</label>
													<input type="number" name="notice_period" class="form-control" placeholder="e.g., 30" min="0" style="padding: 8px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; transition: all 0.2s;">
												</div>
											</div>
										</div>

																<div style="background-color: #f8fafc; padding: 14px; border-radius: 8px; border-left: 4px solid #0ea5e9; margin-top: 8px;">
																	<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
																		<h5 style="color: #1e293b; font-weight: 600; margin: 0; font-size: 16px;">Previous Companies</h5>
																		<button type="button" id="add-previous-company" class="btn btn-sm btn-outline-primary" style="padding: 4px 10px; font-size: 12px;">+ Add Company</button>
																	</div>
																	<div id="previous-companies-list"></div>
																	<small class="text-muted" style="font-size: 12px;">Add one or more previous companies with From, To, Company, Location, and Role.</small>
																</div>
									</div>

									<!-- Step 5: Skills & Profile -->
									<div class="wizard-step d-none" id="step-5">
										<h4 style="color: #1e293b; font-weight: 700; margin-bottom: 16px; font-size: 20px;">Skills & Profile</h4>
										
										<div class="row">
											<div class="col-12">
												<div class="mb-4" style="background: #f8fafc; padding: 20px; border-radius: 8px; border: 2px dashed #cbd5e1;">
													<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 12px;">
														<i class="fa fa-file-pdf-o me-2" style="color: #ef4444;"></i>Resume/CV
													</label>
													<input type="file" name="resume" id="resume-upload" class="form-control" accept=".pdf,.doc,.docx" style="padding: 8px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; transition: all 0.2s;">
													<small class="text-muted" style="font-size: 12px; display: block; margin-top: 8px;">
														<i class="fa fa-info-circle me-1"></i>Upload resume in PDF, DOC, or DOCX format (Max 5MB)
													</small>
													<div id="resume-preview" class="mt-2" style="display: none;">
														<div class="alert alert-success d-flex align-items-center justify-content-between" style="padding: 6px 10px; margin-bottom: 0; border-radius: 6px;">
															<span><i class="fa fa-check-circle me-2"></i><span id="resume-filename"></span></span>
															<button type="button" class="btn btn-sm btn-link text-danger p-0" id="remove-resume" style="text-decoration: none;">
																<i class="fa fa-times"></i>
															</button>
														</div>
													</div>
												</div>
											</div>
										</div>

										<div class="row">
											<div class="col-12">
												<div class="mb-3">
													<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 6px;">Technical Skills</label>
													<div id="technical-skills-widget" style="border: 1.5px solid #e2e8f0; border-radius: 8px; padding: 6px; background: #fff;">
														<div id="technical-skills-tags" style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px;"></div>
														<div style="position: relative; width: 100%;">
															<input type="text" id="technical-skills-input" class="form-control" placeholder="Type and select technical skills" style="padding: 8px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px;">
															<div id="technical-skills-dropdown" style="display: none; position: absolute; left: 0; right: 0; top: calc(100% + 4px); z-index: 20; background: #fff; border: 1px solid #cbd5e1; border-radius: 6px; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12); max-height: 190px; overflow-y: auto;"></div>
														</div>
														<input type="hidden" name="skills" id="technical-skills-hidden">
													</div>
													<small class="text-muted" style="font-size: 12px;">Type to filter and click to add multiple technical skills</small>
												</div>
											</div>
										</div>

										<div class="row">
											<div class="col-12">
												<div class="mb-3">
													<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 6px;">Soft Skills</label>
													<div id="soft-skills-widget" style="border: 1.5px solid #e2e8f0; border-radius: 8px; padding: 6px; background: #fff;">
														<div id="soft-skills-tags" style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px;"></div>
														<div style="position: relative; width: 100%;">
															<input type="text" id="soft-skills-input" class="form-control" placeholder="Type and select soft skills" style="padding: 8px 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px;">
															<div id="soft-skills-dropdown" style="display: none; position: absolute; left: 0; right: 0; top: calc(100% + 4px); z-index: 20; background: #fff; border: 1px solid #cbd5e1; border-radius: 6px; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12); max-height: 190px; overflow-y: auto;"></div>
														</div>
														<input type="hidden" name="soft_skills" id="soft-skills-hidden">
													</div>
													<small class="text-muted" style="font-size: 12px;">Type to filter and click to add multiple soft skills</small>
												</div>
											</div>
										</div>

										<div class="row">
											<div class="col-12">
												<div class="mb-3">
													<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 6px;">Profile Summary</label>
													<textarea name="profile_summary" class="form-control" rows="5" placeholder="Brief professional summary highlighting key achievements and expertise..." style="padding: 8px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; transition: all 0.2s; resize: vertical;"></textarea>
													<small class="text-muted" style="font-size: 12px;">A concise overview of the candidate's professional background</small>
												</div>
											</div>
										</div>

										<div class="row">
											<div class="col-12 col-md-6">
												<div class="mb-3">
													<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 6px;">LinkedIn Profile</label>
													<input type="url" name="linkedin_url" class="form-control" placeholder="https://linkedin.com/in/username" style="padding: 8px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; transition: all 0.2s;">
												</div>
											</div>
											<div class="col-12 col-md-6">
												<div class="mb-3">
													<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 6px;">Portfolio/Website</label>
													<input type="url" name="portfolio_url" class="form-control" placeholder="https://yourportfolio.com" style="padding: 8px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; transition: all 0.2s;">
												</div>
											</div>
										</div>
									</div>

									<!-- Step 6: Additional Info -->
									<div class="wizard-step d-none" id="step-6">
										<h4 style="color: #1e293b; font-weight: 700; margin-bottom: 16px; font-size: 20px;">Additional Information</h4>
										
										<div class="row">
											<div class="col-12 col-md-6">
												<div class="mb-3">
													<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 8px;">Application Status</label>
													<select name="status" class="form-control candidate-status-select" style="padding: 8px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; transition: all 0.2s;">
														<option value="Pending">Pending</option>
														<option value="Accepted">Accepted</option>
														<option value="Rejected">Rejected</option>
														<option value="Accepted and Confirmed">Accepted and Confirmed</option>
														<option value="Accepted and Joined">Accepted and Joined</option>
													</select>
												</div>
											</div>
											<div class="col-12 col-md-6">
												<div class="mb-3">
													<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 8px;">Source of Application</label>
													<select name="source" class="form-control" style="padding: 8px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; transition: all 0.2s;">
														<option value="">Select Source</option>
														<option value="Job Portal">Job Portal</option>
														<option value="LinkedIn">LinkedIn</option>
														<option value="Referral">Referral</option>
														<option value="Company Website">Company Website</option>
														<option value="Walk-in">Walk-in</option>
														<option value="Recruitment Agency">Recruitment Agency</option>
														<option value="Other">Other</option>
													</select>
												</div>
											</div>
										</div>

										<div class="row">
											<div class="col-12 col-md-6">
												<div class="mb-3">
													<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 8px;">Current Location</label>
													<input type="text" name="current_location" class="form-control" placeholder="e.g., Bangalore, Karnataka" style="padding: 8px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; transition: all 0.2s;">
												</div>
											</div>
											<div class="col-12 col-md-6">
												<div class="mb-3">
													<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 8px;">Preferred Location</label>
													<input type="text" name="preferred_location" class="form-control" placeholder="e.g., Bangalore, Hyderabad" style="padding: 8px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; transition: all 0.2s;">
												</div>
											</div>
										</div>

										<div class="row">
											<div class="col-12 col-md-6">
												<div class="mb-3">
													<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 8px;">Date of Birth</label>
													<input type="text" name="date_of_birth" class="form-control" placeholder="dd/mm/yyyy" pattern="\d{2}/\d{2}/\d{4}" inputmode="numeric" style="padding: 8px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; transition: all 0.2s;">
												</div>
											</div>
											<div class="col-12 col-md-6">
												<div class="mb-3">
													<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 8px;">Gender</label>
													<select name="gender" class="form-control" style="padding: 8px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; transition: all 0.2s;">
														<option value="">Select Gender</option>
														<option value="Male">Male</option>
														<option value="Female">Female</option>
														<option value="Other">Other</option>
														<option value="Prefer not to say">Prefer not to say</option>
													</select>
												</div>
											</div>
										</div>

										<div class="row">
											<div class="col-12">
												<div class="mb-3">
													<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 8px;">Additional Notes</label>
													<textarea name="additional_notes" class="form-control" rows="4" placeholder="Any additional information or special requirements..." style="padding: 8px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; transition: all 0.2s; resize: vertical;"></textarea>
												</div>
											</div>
										</div>

										<div class="row">
											<div class="col-12 col-md-6">
												<div class="mb-3">
													<label class="form-label" style="font-weight: 600; color: #1e293b; font-size: 14px; margin-bottom: 8px;">Referral Name</label>
													<input type="text" name="referral_name" class="form-control" placeholder="If referred by someone" style="padding: 8px 12px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-size: 14px; transition: all 0.2s;">
												</div>
											</div>
										</div>
									</div>

									<!-- Navigation Buttons -->
									<div class="row mt-4" style="padding-top: 20px; border-top: 1px solid #f1f5f9;">
										<div class="col-12 d-flex justify-content-between align-items-center">
											<button type="button" class="btn btn-secondary btn-wizard-prev" style="padding: 8px 20px; border-radius: 8px; font-weight: 500; border: 1.5px solid #e2e8f0; background: white; color: #64748b; display: none;">
												<i class="fa fa-arrow-left me-2"></i>Previous
											</button>
											<div class="ms-auto d-flex gap-2">
												<button type="button" class="btn btn-secondary btn-cancel" style="padding: 8px 16px; border-radius: 8px; font-weight: 500; border: 1.5px solid #e2e8f0; background: white; color: #64748b;">Cancel</button>
												<button type="button" class="btn btn-primary btn-wizard-next" style="padding: 8px 20px; border-radius: 8px; font-weight: 600; background: linear-gradient(135deg, #1E3A8A 0%, #2563EB 100%); border: none; box-shadow: 0 2px 8px rgba(37, 99, 235, 0.25);">
													Next<i class="fa fa-arrow-right ms-2"></i>
												</button>
												<button type="button" class="btn btn-success btn-wizard-submit" style="padding: 8px 20px; border-radius: 8px; font-weight: 600; background: linear-gradient(135deg, #059669 0%, #10b981 100%); border: none; box-shadow: 0 2px 8px rgba(16, 185, 129, 0.25); display: none;">
													<i class="fa fa-check me-2"></i>Save Candidate
												</button>
											</div>
										</div>
									</div>
								</form>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	`
};	