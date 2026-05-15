frappe.pages['interview-schedulers'].on_page_load = function (wrapper) {
	frappe.interview_schedulers_page = new InterviewSchedulersPage(wrapper);
};

frappe.pages['interview-schedulers'].on_page_show = function (wrapper) {
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
			if (!frappe.interview_schedulers_page || frappe.interview_schedulers_page.wrapper !== pageWrapper) {
				frappe.interview_schedulers_page = new InterviewSchedulersPage(pageWrapper);
			}
			frappe.interview_schedulers_page.render();
		});
	});
};

class InterviewSchedulersPage {
	constructor(wrapper) {
		this.wrapper = wrapper;
		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: 'Interview Schedulers',
			single_column: true,
		});
		this.data_loaded = false;
		this.all_interviews = [];
		this.filtered_interviews = [];
		this.total_records = 0;
		this.page_length = 100;
		this.editing_interview = null;
		this.round_options = [];
		this.applicant_options = [];
	}

	render() {
		const waitForContent = () => {
			const $content = $("#support-page-content");
			if (!$content.length) {
				setTimeout(waitForContent, 50);
				return;
			}

			$content.empty().append(frappe.interview_schedulers_template.body);
			this.handleRoute();
		};

		waitForContent();
	}

	handleRoute() {
		const route = frappe.get_route();

		if (!this.data_loaded) {
			this.loadInterviews(() => this.handleRoute());
			return;
		}

		if (route.length === 1) {
			this.showList();
			return;
		}

		if (route.length === 2 && route[1] === 'new') {
			this.showForm();
			return;
		}

		if (route.length === 2) {
			this.showDetails(route[1]);
			return;
		}

		this.showList();
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

	loadInterviews(callback) {
		frappe.call({
			method: 'renewal_module.custom_module.page.interview_schedulers.interview_schedulers.get_interview_schedulers',
			args: {
				filters: {},
				start: 0,
				page_length: 500,
			},
			callback: (r) => {
				const message = r && r.message ? r.message : {};
				this.all_interviews = message.status === 'success' ? (message.data || []) : [];
				this.filtered_interviews = [...this.all_interviews];
				this.total_records = message.total || this.all_interviews.length;
				this.data_loaded = true;
				if (typeof callback === 'function') callback();
			},
			error: () => {
				this.all_interviews = [];
				this.filtered_interviews = [];
				this.total_records = 0;
				this.data_loaded = true;
				if (typeof callback === 'function') callback();
			},
		});
	}

	showList() {
		$(this.wrapper).find('.interview-list-view').removeClass('d-none');
		$(this.wrapper).find('.interview-details-view').addClass('d-none');
		$(this.wrapper).find('.interview-form-view').addClass('d-none');

		this.setPageTitle('Interview Schedulers');
		this.setActiveSidebar();
		this.loadRoundFilterOptions();
		this.applyFilters();
		this.renderRows();
		this.bindListEvents();
	}

	showDetails(interviewId) {
		$(this.wrapper).find('.interview-list-view').addClass('d-none');
		$(this.wrapper).find('.interview-details-view').removeClass('d-none');
		$(this.wrapper).find('.interview-form-view').addClass('d-none');

		this.setPageTitle(`Interview: ${interviewId}`);
		this.setActiveSidebar();

		frappe.call({
			method: 'renewal_module.custom_module.page.interview_schedulers.interview_schedulers.get_interview_scheduler',
			args: { name: interviewId },
			callback: (r) => {
				const message = r && r.message ? r.message : {};
				if (message.status !== 'success' || !message.data) {
					frappe.msgprint({
						title: __('Not Found'),
						indicator: 'red',
						message: __('Interview not found'),
					});
					frappe.set_route('interview-schedulers');
					return;
				}

				this.renderDetails(message.data);
				this.bindDetailEvents(message.data);
			},
		});
	}

	showForm(record = null) {
		this.editing_interview = record ? record.id : null;

		$(this.wrapper).find('.interview-list-view').addClass('d-none');
		$(this.wrapper).find('.interview-details-view').addClass('d-none');
		$(this.wrapper).find('.interview-form-view').removeClass('d-none');

		this.setPageTitle(record ? `Edit Interview: ${record.id}` : 'New Interview Scheduler');
		this.setActiveSidebar();

		const form = this.getElement('#interview-scheduler-form');
		if (!form) return;

		form.reset();
		form.querySelector('[name="status"]').value = 'Pending';
		form.querySelector('[name="scheduled_on"]').value = frappe.datetime.get_today();

		if (record) {
			this.fillForm(form, record);
		}

		this.loadFormOptions(form);
		this.bindFormEvents();
	}

	loadRoundFilterOptions() {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const select = wrapper.querySelector('#interview-filter-round');
		if (!select) return;

		if (this.round_options && this.round_options.length) {
			this._populateRoundSelect(select);
			return;
		}

		frappe.call({
			method: 'renewal_module.custom_module.page.interview_schedulers.interview_schedulers.get_interview_round_options',
			callback: (r) => {
				const message = r && r.message ? r.message : {};
				this.round_options = message.status === 'success' ? (message.data || []) : [];
				this._populateRoundSelect(select);
			},
		});
	}

	_populateRoundSelect(select) {
		const current = select.value;
		select.innerHTML = '<option value="">All Rounds</option>';
		(this.round_options || []).forEach((row) => {
			const option = document.createElement('option');
			option.value = row.name;
			option.textContent = row.name;
			select.appendChild(option);
		});
		if (current) select.value = current;
	}

	loadFormOptions(form) {
		frappe.call({
			method: 'renewal_module.custom_module.page.interview_schedulers.interview_schedulers.get_interview_round_options',
			callback: (r) => {
				const message = r && r.message ? r.message : {};
				this.round_options = message.status === 'success' ? (message.data || []) : [];
				const select = form.querySelector('[name="interview_round"]');
				if (!select) return;

				const selected = select.value;
				select.innerHTML = '<option value="">Select Interview Round</option>';
				this.round_options.forEach((row) => {
					const option = document.createElement('option');
					option.value = row.name;
					option.textContent = row.name;
					select.appendChild(option);
				});
				if (selected) select.value = selected;
			},
		});

		frappe.call({
			method: 'renewal_module.custom_module.page.interview_schedulers.interview_schedulers.get_job_applicant_options',
			callback: (r) => {
				const message = r && r.message ? r.message : {};
				this.applicant_options = message.status === 'success' ? (message.data || []) : [];
				const select = form.querySelector('[name="job_applicant"]');
				if (!select) return;

				const selected = select.value;
				select.innerHTML = '<option value="">Select Job Applicant</option>';
				this.applicant_options.forEach((row) => {
					const option = document.createElement('option');
					option.value = row.name;
					option.textContent = row.applicant_name ? `${row.applicant_name} (${row.name})` : row.name;
					select.appendChild(option);
				});
				if (selected) select.value = selected;
			},
		});
	}

	fillForm(form, row) {
		form.querySelector('[name="interview_round"]').value = row.interview_round || '';
		form.querySelector('[name="job_applicant"]').value = row.job_applicant || '';
		form.querySelector('[name="status"]').value = row.status || 'Pending';
		form.querySelector('[name="scheduled_on"]').value = row.scheduled_on || '';
		form.querySelector('[name="from_time"]').value = row.from_time || '';
		form.querySelector('[name="to_time"]').value = row.to_time || '';
		form.querySelector('[name="interview_summary"]').value = row.interview_summary || '';
		form.querySelector('[name="interviewers"]').value = (row.interviewers || []).join(', ');
	}

	bindListEvents() {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const me = this;

		$(wrapper).off('click', '.interview-id-link').on('click', '.interview-id-link', function (e) {
			e.preventDefault();
			const interviewId = $(this).data('id');
			if (interviewId) frappe.set_route('interview-schedulers', interviewId);
		});

		$(wrapper).off('input', '#interview-filter-id, #interview-filter-applicant')
			.on('input', '#interview-filter-id, #interview-filter-applicant', function () {
				me.applyFilters();
				me.renderRows();
			});

		$(wrapper).off('change', '#interview-filter-round, #interview-filter-status').on('change', '#interview-filter-round, #interview-filter-status', function () {
			me.applyFilters();
			me.renderRows();
		});

		$(wrapper).off('click', '#clear-interview-filter').on('click', '#clear-interview-filter', function (e) {
			e.preventDefault();
			wrapper.querySelector('#interview-filter-id').value = '';
			wrapper.querySelector('#interview-filter-round').value = '';
			wrapper.querySelector('#interview-filter-applicant').value = '';
			wrapper.querySelector('#interview-filter-status').value = '';
			me.applyFilters();
			me.renderRows();
		});

		$(wrapper).off('click', '#apply-interview-filter').on('click', '#apply-interview-filter', function (e) {
			e.preventDefault();
			me.applyFilters();
			me.renderRows();
		});

		$(wrapper).off('click', '#new-interview-btn').on('click', '#new-interview-btn', function (e) {
			e.preventDefault();
			frappe.set_route('interview-schedulers', 'new');
		});

		$(wrapper).off('change', '#selectAllInterviews').on('change', '#selectAllInterviews', function (e) {
			const checked = !!e.currentTarget.checked;
			(wrapper.querySelectorAll('.interview-select-checkbox') || []).forEach((cb) => {
				cb.checked = checked;
			});
		});
	}

	bindDetailEvents(record) {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const me = this;

		$(wrapper).off('click', '#back-interview-list').on('click', '#back-interview-list', function () {
			frappe.set_route('interview-schedulers');
		});

		$(wrapper).off('click', '#edit-interview').on('click', '#edit-interview', function () {
			me.showForm(record);
		});

		$(wrapper).off('click', '#delete-interview').on('click', '#delete-interview', function () {
			frappe.confirm(__('Delete this interview?'), () => {
				me.deleteInterview(record.id);
			});
		});
	}

	bindFormEvents() {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const me = this;

		$(wrapper).off('click', '#cancel-interview-form').on('click', '#cancel-interview-form', function (e) {
			e.preventDefault();
			if (me.editing_interview) {
				frappe.set_route('interview-schedulers', me.editing_interview);
			} else {
				frappe.set_route('interview-schedulers');
			}
		});

		$(wrapper).off('submit', '#interview-scheduler-form').on('submit', '#interview-scheduler-form', function (e) {
			e.preventDefault();
			me.submitForm();
		});
	}

	submitForm() {
		const form = this.getElement('#interview-scheduler-form');
		if (!form) return;

		const payload = {
			interview_round: form.querySelector('[name="interview_round"]').value,
			job_applicant: form.querySelector('[name="job_applicant"]').value,
			status: form.querySelector('[name="status"]').value,
			scheduled_on: form.querySelector('[name="scheduled_on"]').value,
			from_time: form.querySelector('[name="from_time"]').value,
			to_time: form.querySelector('[name="to_time"]').value,
			interview_summary: form.querySelector('[name="interview_summary"]').value,
			interviewers: String(form.querySelector('[name="interviewers"]').value || '')
				.split(',')
				.map(v => v.trim())
				.filter(Boolean),
		};

		const method = this.editing_interview
			? 'renewal_module.custom_module.page.interview_schedulers.interview_schedulers.update_interview_scheduler'
			: 'renewal_module.custom_module.page.interview_schedulers.interview_schedulers.create_interview_scheduler';

		const args = this.editing_interview ? { name: this.editing_interview, data: payload } : { data: payload };

		frappe.call({
			method,
			args,
			freeze: true,
			freeze_message: __('Saving Interview...'),
			callback: (r) => {
				const message = r && r.message ? r.message : {};
				if (message.status !== 'success') {
					frappe.msgprint({
						title: __('Error'),
						indicator: 'red',
						message: __(message.message || 'Unable to save interview'),
					});
					return;
				}

				frappe.show_alert({ message: __(message.message || 'Saved'), indicator: 'green' });
				const id = message.data && message.data.id ? message.data.id : this.editing_interview;
				this.data_loaded = false;
				this.loadInterviews(() => {
					if (id) frappe.set_route('interview-schedulers', id);
					else frappe.set_route('interview-schedulers');
				});
			},
		});
	}

	deleteInterview(interviewId) {
		frappe.call({
			method: 'renewal_module.custom_module.page.interview_schedulers.interview_schedulers.delete_interview_scheduler',
			args: { name: interviewId },
			freeze: true,
			freeze_message: __('Deleting...'),
			callback: (r) => {
				const message = r && r.message ? r.message : {};
				if (message.status !== 'success') {
					frappe.msgprint({
						title: __('Error'),
						indicator: 'red',
						message: __(message.message || 'Unable to delete interview'),
					});
					return;
				}

				frappe.show_alert({ message: __('Deleted successfully'), indicator: 'green' });
				this.data_loaded = false;
				this.loadInterviews(() => frappe.set_route('interview-schedulers'));
			},
		});
	}

	applyFilters() {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const id = String(wrapper.querySelector('#interview-filter-id')?.value || '').toLowerCase();
		const round = String(wrapper.querySelector('#interview-filter-round')?.value || '');
		const applicant = String(wrapper.querySelector('#interview-filter-applicant')?.value || '').toLowerCase();
		const status = String(wrapper.querySelector('#interview-filter-status')?.value || '').toLowerCase();

		this.filtered_interviews = this.all_interviews.filter((row) => {
			const idMatch = !id || String(row.id || '').toLowerCase().includes(id);
			const roundMatch = !round || String(row.interview_round || '') === round;
			const applicantMatch = !applicant || String(row.job_applicant_name || row.job_applicant || '').toLowerCase().includes(applicant);
			const statusMatch = !status || String(row.status || '').toLowerCase() === status;
			return idMatch && roundMatch && applicantMatch && statusMatch;
		});
	}

	renderRows() {
		const wrapper = this.page.wrapper[0] || this.page.wrapper;
		const tbody = wrapper.querySelector('#interview-table-body');
		const count = wrapper.querySelector('#interview-count');
		if (!tbody) return;

		if (!this.filtered_interviews.length) {
			tbody.innerHTML = `
				<tr>
					<td colspan="9" class="text-center text-muted py-4">
						<div class="jrq-empty-state">
							<div class="jrq-empty-icon">
								<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
							</div>
							<div class="jrq-empty-title">No interviews found</div>
							<div class="jrq-empty-sub">Try adjusting your filters or create a new one</div>
						</div>
					</td>
				</tr>`;
			if (count) count.textContent = '0 of 0';
			return;
		}

		const rows = this.filtered_interviews.slice(0, this.page_length);
		tbody.innerHTML = rows.map((row) => {
			const statusClass = this.getStatusClass(row.status);
			return `
				<tr>
					<td style="width:40px;text-align:center;"><input type="checkbox" class="interview-select-checkbox" /></td>
					<td><a href="javascript:void(0)" class="interview-id-link ids" data-id="${this.escapeHtml(row.id)}">${this.escapeHtml(row.id)}</a></td>
					<td>${this.escapeHtml(row.interview_round || '—')}</td>
					<td>${this.escapeHtml(row.job_applicant_name || row.job_applicant || '—')}</td>
					<td>${this.escapeHtml(row.designation || '—')}</td>
					<td>${this.escapeHtml(row.scheduled_on ? frappe.datetime.str_to_user(row.scheduled_on) : '—')}</td>
					<td>${this.escapeHtml(this.formatTimeRange(row.from_time, row.to_time))}</td>
					<td class="text-center">${this.escapeHtml(this.formatRating(row.average_rating))}</td>
					<td><span class="pill ${statusClass}">${this.escapeHtml(row.status)}</span></td>
				</tr>
			`;
		}).join('');

		const visibleCount = rows.length;
		const totalCount = this.filtered_interviews.length;
		if (count) count.textContent = `${visibleCount} of ${totalCount}`;

		const visibleEl = wrapper.querySelector('#interview-visible-count');
		const totalEl = wrapper.querySelector('#interview-total-count');
		if (visibleEl) visibleEl.textContent = visibleCount;
		if (totalEl) totalEl.textContent = totalCount;

		const selectAll = wrapper.querySelector('#selectAllInterviews');
		if (selectAll) selectAll.checked = false;
	}

	renderDetails(row) {
		const panel = this.getElement('#interview-details-panel');
		if (!panel) return;

		const interviewers = (row.interviewers || []).length ? row.interviewers.join(', ') : '—';
		const statusClass = this.getStatusClass(row.status);
		const scheduledDate = row.scheduled_on ? frappe.datetime.str_to_user(row.scheduled_on) : '—';
		const timeRange = this.formatTimeRange(row.from_time, row.to_time);
		const rating = this.formatRating(row.average_rating);

		panel.innerHTML = `
			<div class="jrq-detail-wrap">
				<div class="row">
					<div class="col-12">
						<div class="page-title-head d-flex align-items-center">
							<div class="flex-grow-1">
								<h3 class="fs-xl fw-bold m-0">Interview Schedulers</h3>
							</div>
							<div class="text-end">
								<ol class="breadcrumb m-0 py-0" style="background-color: transparent;">
									<li class="breadcrumb-item"><a href="javascript:void(0)">HR</a></li>
									<li class="breadcrumb-item active">Interview Schedulers</li>
								</ol>
							</div>
						</div>
					</div>
				</div>

				<div class="jrq-detail-header">
					<div class="jrq-detail-header-left">
						<div class="jrq-detail-id">${this.escapeHtml(row.id || '')}</div>
						<div class="jrq-detail-meta">
							<span class="jrq-detail-badge">${this.escapeHtml(row.interview_round || '')}</span>
							${row.designation ? `<span class="jrq-detail-badge jrq-detail-badge-soft">${this.escapeHtml(row.designation)}</span>` : ''}
							<span class="jrq-pill ${statusClass} jrq-pill-sm">${this.escapeHtml(row.status || 'Pending')}</span>
						</div>
					</div>
					<div class="jrq-detail-header-actions">
						<button class="jrq-btn jrq-btn-ghost" id="back-interview-list">Back</button>
						<button class="jrq-btn jrq-btn-outline" id="edit-interview">Edit</button>
						<button class="jrq-btn jrq-btn-danger" id="delete-interview">Delete</button>
					</div>
				</div>

				<div class="jrq-stat-grid">
					<div class="jrq-stat-card">
						<div class="jrq-stat-body">
							<div class="jrq-stat-label">Scheduled On</div>
							<div class="jrq-stat-value">${this.escapeHtml(scheduledDate)}</div>
						</div>
					</div>
					<div class="jrq-stat-card">
						<div class="jrq-stat-body">
							<div class="jrq-stat-label">Time</div>
							<div class="jrq-stat-value">${this.escapeHtml(timeRange)}</div>
						</div>
					</div>
					<div class="jrq-stat-card">
						<div class="jrq-stat-body">
							<div class="jrq-stat-label">Status</div>
							<div class="jrq-stat-value"><span class="jrq-pill ${statusClass}">${this.escapeHtml(row.status || 'Pending')}</span></div>
						</div>
					</div>
					<div class="jrq-stat-card">
						<div class="jrq-stat-body">
							<div class="jrq-stat-label">Average Rating</div>
							<div class="jrq-stat-value">${this.escapeHtml(rating)}</div>
						</div>
					</div>
				</div>

				<div class="jrq-detail-card">
					<div class="jrq-detail-section-title">Interview Details</div>
					<div class="jrq-fields-grid">
						<div class="jrq-field-item">
							<div class="jrq-field-label">Interview Round</div>
							<div class="jrq-field-value">${this.escapeHtml(row.interview_round || '—')}</div>
						</div>
						<div class="jrq-field-item">
							<div class="jrq-field-label">Job Applicant</div>
							<div class="jrq-field-value">${this.escapeHtml(row.job_applicant_name || row.job_applicant || '—')}</div>
						</div>
						<div class="jrq-field-item">
							<div class="jrq-field-label">Designation</div>
							<div class="jrq-field-value">${this.escapeHtml(row.designation || '—')}</div>
						</div>
						<div class="jrq-field-item">
							<div class="jrq-field-label">Job Opening</div>
							<div class="jrq-field-value">${this.escapeHtml(row.job_opening || '—')}</div>
						</div>
						<div class="jrq-field-item jrq-field-full">
							<div class="jrq-field-label">Interviewers</div>
							<div class="jrq-field-value">${this.escapeHtml(interviewers)}</div>
						</div>
						${row.interview_summary ? `
						<div class="jrq-field-item jrq-field-full">
							<div class="jrq-field-label">Interview Summary</div>
							<div class="jrq-field-value jrq-field-text">${this.escapeHtml(row.interview_summary)}</div>
						</div>` : ''}
					</div>
				</div>
			</div>
		`;
	}

	getStatusClass(status) {
		const value = String(status || '').toLowerCase();
		if (value === 'cleared') return 'pill-success';
		if (value === 'rejected' || value === 'cancelled') return 'pill-danger';
		if (value === 'under review') return 'pill-warning';
		return 'pill-info';
	}

	formatTimeRange(fromTime, toTime) {
		if (!fromTime && !toTime) return '—';
		if (!toTime) return fromTime || '—';
		if (!fromTime) return toTime || '—';
		return `${fromTime} - ${toTime}`;
	}

	formatRating(value) {
		if (value === null || value === undefined || value === '') return '—';
		return String(value);
	}

	getElement(selector) {
		const root = this.page.wrapper && this.page.wrapper[0] ? this.page.wrapper[0] : this.page.wrapper;
		return root ? root.querySelector(selector) : null;
	}

	escapeHtml(value) {
		if (value === null || value === undefined) return '';
		return String(value)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	}
}

frappe.interview_schedulers_template = {
	body: `
		<div class="jrq-wrapper">

			<!-- ===== LIST VIEW ===== -->
			<div class="interview-list-view">
				<div class="row">
					<div class="col-12">
						<div class="page-title-head d-flex align-items-center">
							<div class="flex-grow-1">
								<h3 class="fs-xl fw-bold m-0">Interview Schedulers</h3>
							</div>
							<div class="text-end">
								<ol class="breadcrumb m-0 py-0" style="background-color: transparent;">
									<li class="breadcrumb-item"><a href="javascript: void(0);">HR</a></li>
									<li class="breadcrumb-item active">Interview Schedulers</li>
								</ol>
							</div>
						</div>
					</div>
				</div>

				<div class="controls-wrapper">
					<div class="controls">
						<div class="left-controls">
							<select id="interview-filter-status" class="control-select placeholder" data-table-filter="status" aria-label="Status">
								<option value="">Status</option>
								<option value="Pending">Pending</option>
								<option value="Under Review">Under Review</option>
								<option value="Cleared">Cleared</option>
								<option value="Rejected">Rejected</option>
								<option value="Cancelled">Cancelled</option>
							</select>
							<input id="interview-filter-id" class="control-input placeholder" placeholder="Interview ID" aria-label="Interview ID" />
							<select id="interview-filter-round" class="control-select placeholder" aria-label="Interview Round">
								<option value="">All Rounds</option>
							</select>
							<input id="interview-filter-applicant" class="control-input placeholder" placeholder="Job Applicant" aria-label="Job Applicant" />
						</div>
						<div class="right-controls">
							<div class="btn-group filter-actions">
								<button id="apply-interview-filter" class="btn btn-default btn-sm filter-button" title="Filters">
									<svg class="es-icon es-line icon-sm"><use href="#es-line-filter"></use></svg>
									<span class="button-label">Filters</span>
								</button>
								<button id="clear-interview-filter" class="btn btn-default btn-sm filter-x-button" title="Clear filters">
									<svg class="es-icon es-line icon-sm"><use href="#es-small-close"></use></svg>
								</button>
							</div>
							<a id="new-interview-btn" href="javascript:void(0)" class="btn btn-sm btn-primary1 mr-2">
								<i class="fa fa-plus me-1"></i> New Schedule
							</a>
						</div>
					</div>
				</div>

				<div class="table-container mt-2">
					<table id="interviewTable" class="jobs-table">
						<thead>
							<tr>
								<th style="width: 40px;">
									<input id="selectAllInterviews" type="checkbox" />
								</th>
								<th>Interview ID</th>
								<th>Interview Round</th>
								<th>Job Applicant</th>
								<th>Designation</th>
								<th>Scheduled On</th>
								<th>Time</th>
								<th class="text-center">Rating</th>
								<th class="text-center ellipsis" id="interview-count-header" title="0 of 0">
									<span id="interview-visible-count">0</span> of <span id="interview-total-count">0</span>
								</th>
							</tr>
						</thead>
						<tbody id="interview-table-body"></tbody>
					</table>
				</div>

				<div class="d-flex justify-content-between align-items-center mt-2">
					<div class="list-paging-area d-flex justify-content-between align-items-center w-100">
						<div class="p-2">
							<div id="interview-count" class="pagination-info">0 of 0</div>
						</div>
					</div>
				</div>
			</div>

			<!-- ===== DETAILS VIEW ===== -->
			<div class="interview-details-view d-none">
				<div id="interview-details-panel"></div>
			</div>

			<!-- ===== FORM VIEW ===== -->
			<div class="interview-form-view d-none">
				<div class="row mb-2">
					<div class="col-12">
						<div class="page-title-head d-flex align-items-center">
							<div class="flex-grow-1">
								<h3 class="fs-xl fw-bold m-0">Interview Scheduler Form</h3>
							</div>
							<div class="text-end">
								<ol class="breadcrumb m-0 py-0" style="background-color: transparent;">
									<li class="breadcrumb-item"><a href="javascript:void(0)">HR</a></li>
									<li class="breadcrumb-item active">Interview Scheduler Form</li>
								</ol>
							</div>
						</div>
					</div>
				</div>

				<div class="jrq-form-card">
					<form id="interview-scheduler-form" class="jrq-form">
						<div class="jrq-form-section-label">Interview Information</div>
						<div class="jrq-form-grid">
							<div class="jrq-form-group">
								<label class="jrq-label">Interview Round <span class="jrq-req">*</span></label>
								<select class="jrq-field jrq-select-field" name="interview_round" required></select>
							</div>
							<div class="jrq-form-group">
								<label class="jrq-label">Job Applicant <span class="jrq-req">*</span></label>
								<select class="jrq-field jrq-select-field" name="job_applicant" required></select>
							</div>
							<div class="jrq-form-group">
								<label class="jrq-label">Status</label>
								<select class="jrq-field jrq-select-field" name="status">
									<option value="Pending">Pending</option>
									<option value="Under Review">Under Review</option>
									<option value="Cleared">Cleared</option>
									<option value="Rejected">Rejected</option>
									<option value="Cancelled">Cancelled</option>
								</select>
							</div>
						</div>

						<div class="jrq-form-section-label">Schedule</div>
						<div class="jrq-form-grid">
							<div class="jrq-form-group">
								<label class="jrq-label">Scheduled On <span class="jrq-req">*</span></label>
								<input type="date" class="jrq-field" name="scheduled_on" required />
							</div>
							<div class="jrq-form-group">
								<label class="jrq-label">From Time <span class="jrq-req">*</span></label>
								<input type="time" class="jrq-field" name="from_time" required />
							</div>
							<div class="jrq-form-group">
								<label class="jrq-label">To Time <span class="jrq-req">*</span></label>
								<input type="time" class="jrq-field" name="to_time" required />
							</div>
						</div>

						<div class="jrq-form-section-label">Additional Details</div>
						<div class="jrq-form-grid">
							<div class="jrq-form-group jrq-form-group-full">
								<label class="jrq-label">Interviewers (User IDs, comma separated)</label>
								<input type="text" class="jrq-field" name="interviewers" placeholder="user1@example.com, user2@example.com" />
							</div>
							<div class="jrq-form-group jrq-form-group-full">
								<label class="jrq-label">Interview Summary</label>
								<textarea class="jrq-field jrq-textarea" rows="4" name="interview_summary" placeholder="Add notes or summary..."></textarea>
							</div>
						</div>

						<div class="jrq-form-actions">
							<button type="button" class="jrq-btn jrq-btn-ghost" id="cancel-interview-form">Cancel</button>
							<button type="submit" class="jrq-btn jrq-btn-primary">Save Interview</button>
						</div>
					</form>
				</div>
			</div>
		</div>
	`,
};