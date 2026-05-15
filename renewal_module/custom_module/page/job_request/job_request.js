frappe.pages['job-request'].on_page_load = function (wrapper) {
	frappe.job_request_page = new JobRequestPage(wrapper);
};

frappe.pages['job-request'].on_page_show = function (wrapper) {
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
			if (!frappe.job_request_page || frappe.job_request_page.wrapper !== pageWrapper) {
				frappe.job_request_page = new JobRequestPage(pageWrapper);
			}
			frappe.job_request_page.render();
		});
	});
};

class JobRequestPage {
	constructor(wrapper) {
		this.wrapper = wrapper;
		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: 'Job Requisition',
			single_column: true,
		});
		this.page_length = 20;
		this.visible_count = 20;
		this.total_records = 0;
		this.all_requisitions = [];
		this.filtered_requisitions = [];
		this.editing_requisition = null;
		this.data_loaded = false;
		this.list_filters = {
			status: '',
			request_id: '',
			designation: '',
		};
		this.standard_options = {
			designation: null,
			department: null,
			company: null,
			employee: null,
		};
		this.current_form_step = 1;
		this.total_form_steps = 4;
	}

	render() {
		const waitForContent = () => {
			const $content = $("#support-page-content");
			if (!$content.length) {
				setTimeout(waitForContent, 50);
				return;
			}
			$content.empty().append(frappe.job_request_page_template.body);
			this.handleRoute();
		};
		waitForContent();
	}

	handleRoute() {
		const route = frappe.get_route();

		if (!this.data_loaded) {
			this.loadRequisitions(() => this.handleRoute());
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

		$(".side-nav-link[data-page]").each((_, element) => {
			const $link = $(element);
			const linkPage = $link.data("page");
			if (!linkPage) return;

			if (linkPage === baseRoute) {
				$link.addClass("active-menu");
				$link.closest(".side-nav-item").addClass("active-menu-item");
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

	loadRequisitions(callback) {
		frappe.call({
			method: 'renewal_module.custom_module.page.job_request.job_request.get_job_requisitions',
			args: {
				filters: this.list_filters,
				start: 0,
				page_length: 500,
			},
			callback: (r) => {
				const message = r && r.message ? r.message : {};
				this.all_requisitions = message.status === 'success' ? (message.data || []) : [];
				this.total_records = message.total || this.all_requisitions.length;
				this.data_loaded = true;
				this.applyFilters();
				if (typeof callback === 'function') callback();
			},
			error: () => {
				this.all_requisitions = [];
				this.total_records = 0;
				this.data_loaded = true;
				this.applyFilters();
				if (typeof callback === 'function') callback();
			},
		});
	}

	showList() {
		$(this.wrapper).find('.job-request-list-view').removeClass('d-none');
		$(this.wrapper).find('.job-request-details-view').addClass('d-none');
		$(this.wrapper).find('.job-request-form-view').addClass('d-none');
		this.setPageTitle('Job Requisition');
		this.setActiveSidebar();

		this.applyFilters();
		this.renderRows();
		this.bindListEvents();
		this.setupListAutocomplete();
	}

	showDetails(requisitionId) {
		$(this.wrapper).find('.job-request-list-view').addClass('d-none');
		$(this.wrapper).find('.job-request-details-view').removeClass('d-none');
		$(this.wrapper).find('.job-request-form-view').addClass('d-none');
		this.setPageTitle(`Job Requisition: ${requisitionId}`);
		this.setActiveSidebar();

		this.fetchSingleRequisition(requisitionId, (record) => {
			if (!record) {
				frappe.msgprint({
					title: __('Not Found'),
					indicator: 'red',
					message: __('Job Requisition not found'),
				});
				frappe.set_route('job-request');
				return;
			}
			this.renderDetails(record);
			this.bindDetailEvents(record);
		});
	}

	showForm(editData = null) {
		this.editing_requisition = editData ? editData.id : null;

		$(this.wrapper).find('.job-request-list-view').addClass('d-none');
		$(this.wrapper).find('.job-request-details-view').addClass('d-none');
		$(this.wrapper).find('.job-request-form-view').removeClass('d-none');

		this.setPageTitle(editData ? `Edit Job Requisition: ${editData.id}` : 'New Job Requisition');
		this.setActiveSidebar();

		const form = this.getElement('#job-request-form');
		if (!form) return;

		form.reset();
		form.querySelector('[name="status"]').value = 'Open';
		form.querySelector('[name="posting_date"]').value = frappe.datetime.get_today();

		if (editData) {
			this.fillForm(form, editData);
		}

		const submitLabel = form.querySelector('.btn-wizard-submit-label');
		if (submitLabel) {
			submitLabel.textContent = this.editing_requisition ? 'Save Requisition' : 'Create Requisition';
		}

		this.setupFormAutocomplete(form);
		this.setupDescriptionEditor(form);
		this.initializeFormWizard();
		this.bindFormEvents();
	}

	setupDescriptionEditor(form) {
		if (!form) return;

		const descriptionField = form.querySelector('textarea[name="description"]');
		if (!descriptionField) return;

		let editorWrap = form.querySelector('.jrq-description-editor-wrap');
		if (!editorWrap) {
			editorWrap = document.createElement('div');
			editorWrap.className = 'jrq-description-editor-wrap';

			const toolbar = document.createElement('div');
			toolbar.className = 'jrq-description-toolbar';
			toolbar.innerHTML = `
				<button type="button" class="btn btn-default btn-sm" data-cmd="bold"><b>B</b></button>
				<button type="button" class="btn btn-default btn-sm" data-cmd="italic"><i>I</i></button>
				<button type="button" class="btn btn-default btn-sm" data-cmd="insertUnorderedList">• List</button>
				<button type="button" class="btn btn-default btn-sm" data-cmd="insertOrderedList">1. List</button>
				<button type="button" class="btn btn-default btn-sm" data-cmd="createLink">Link</button>
				<button type="button" class="btn btn-default btn-sm" data-cmd="removeFormat">Clear</button>
			`;

			const editor = document.createElement('div');
			editor.className = 'jrq-description-editor';
			editor.contentEditable = 'true';
			editor.setAttribute('role', 'textbox');
			editor.setAttribute('aria-label', 'Description editor');

			const syncDescription = () => {
				descriptionField.value = (editor.innerHTML || '').trim();
			};

			toolbar.querySelectorAll('button[data-cmd]').forEach((btn) => {
				btn.addEventListener('click', () => {
					const cmd = btn.getAttribute('data-cmd');
					if (!cmd) return;

					if (cmd === 'createLink') {
						const url = window.prompt('Enter URL', 'https://');
						if (url) document.execCommand('createLink', false, url);
					} else {
						document.execCommand(cmd, false, null);
					}

					editor.focus();
					syncDescription();
				});
			});

			editor.addEventListener('input', syncDescription);
			editor.addEventListener('blur', syncDescription);

			editorWrap.appendChild(toolbar);
			editorWrap.appendChild(editor);
			descriptionField.insertAdjacentElement('afterend', editorWrap);
		}

		const editor = editorWrap.querySelector('.jrq-description-editor');
		if (editor) {
			editor.innerHTML = descriptionField.value || '';
		}

		descriptionField.style.display = 'none';
	}

	setupListAutocomplete() {
		const designationFilter = this.getElement('#job-request-filter-designation');
		if (!designationFilter) return;

		this.fetchStandardOptions('designation').then((options) => {
			this.populateDatalist('job-request-designation-list', options || []);
		});
	}

	setupFormAutocomplete(form) {
		this.fetchStandardOptions('designation').then((options) => {
			this.populateDatalist('job-request-designation-list', options || []);
		});

		this.fetchStandardOptions('department').then((options) => {
			this.populateDatalist('job-request-department-list', options || []);
		});

		this.fetchStandardOptions('company').then((options) => {
			this.populateDatalist('job-request-company-list', options || []);
		});

		this.fetchStandardOptions('employee').then((options) => {
			this.populateDatalist('job-request-employee-list', options || []);
		});
	}

	fetchStandardOptions(type) {
		if (this.standard_options[type]) {
			return Promise.resolve(this.standard_options[type]);
		}

		const masterConfig = {
			designation: {
				doctype: 'Designation',
				fields: ['name', 'designation_name'],
				order_by: 'modified desc',
				format: (row) => row.designation_name || row.name,
			},
			department: {
				doctype: 'Department',
				fields: ['name', 'department_name'],
				order_by: 'modified desc',
				format: (row) => row.department_name || row.name,
			},
			company: {
				doctype: 'Company',
				fields: ['name', 'company_name', 'abbr'],
				order_by: 'modified desc',
				format: (row) => row.company_name || row.name || row.abbr,
			},
			employee: {
				doctype: 'Employee',
				fields: ['name', 'employee_name'],
				order_by: 'modified desc',
				format: (row) => row.employee_name || row.name,
			},
		};

		const config = masterConfig[type];
		if (!config) return Promise.resolve([]);

		return new Promise((resolve) => {
			frappe.call({
				method: 'frappe.client.get_list',
				args: {
					doctype: config.doctype,
					fields: config.fields,
					order_by: config.order_by,
					limit_page_length: 500,
				},
				callback: (r) => {
					const rows = (r && r.message) || [];
					const values = Array.from(
						new Set(
							rows
								.map((row) => String(config.format(row) || '').trim())
								.filter(Boolean)
						)
					);
					this.standard_options[type] = values;
					resolve(values);
				},
				error: () => {
					this.standard_options[type] = [];
					resolve([]);
				},
			});
		});
	}

	populateDatalist(id, options) {
		const root = this.page.wrapper && this.page.wrapper[0] ? this.page.wrapper[0] : this.page.wrapper;
		if (!root) return;

		const datalist = root.querySelector(`#${id}`);
		if (!datalist) return;

		datalist.innerHTML = (options || [])
			.map((option) => `<option value="${this.escapeHtml(option)}"></option>`)
			.join('');
	}

	bindListEvents() {
		const wrapper = this.wrapper;

		$(wrapper)
			.off('click', '#new-job-request-btn')
			.on('click', '#new-job-request-btn', (e) => {
				e.preventDefault();
				frappe.set_route('job-request', 'new');
			});

		$(wrapper)
			.off('click', '.job-request-link')
			.on('click', '.job-request-link', (e) => {
				e.preventDefault();
				const id = $(e.currentTarget).data('id');
				if (id) frappe.set_route('job-request', id);
			});

		$(wrapper)
			.off('click', '#apply-job-request-filter')
			.on('click', '#apply-job-request-filter', (e) => {
				e.preventDefault();
				this.list_filters = this.readFilterValues();
				this.applyFilters();
				this.renderRows();
			});

		$(wrapper)
			.off('click', '#clear-job-request-filter')
			.on('click', '#clear-job-request-filter', (e) => {
				e.preventDefault();
				this.list_filters = { status: '', request_id: '', designation: '' };
				this.getElement('#job-request-filter-status').value = '';
				this.getElement('#job-request-filter-id').value = '';
				this.getElement('#job-request-filter-designation').value = '';
				this.applyFilters();
				this.renderRows();
			});

		$(wrapper)
			.off('click', '#load-more-job-request')
			.on('click', '#load-more-job-request', (e) => {
				e.preventDefault();
				this.visible_count = Math.min(this.visible_count + this.page_length, this.filtered_requisitions.length);
				this.renderRows();
			});

		$(wrapper)
			.off('change', '#selectAllJobs')
			.on('change', '#selectAllJobs', (e) => {
				const checked = !!e.currentTarget.checked;
				(wrapper.querySelectorAll('.job-select-checkbox') || []).forEach((cb) => {
					cb.checked = checked;
				});
			});
	}

	bindDetailEvents(record) {
		const wrapper = this.wrapper;

		$(wrapper)
			.off('click', '#back-job-request-list')
			.on('click', '#back-job-request-list', (e) => {
				e.preventDefault();
				frappe.set_route('job-request');
			});

		$(wrapper)
			.off('click', '#edit-job-request')
			.on('click', '#edit-job-request', (e) => {
				e.preventDefault();
				this.showForm(record);
			});

		$(wrapper)
			.off('click', '#delete-job-request')
			.on('click', '#delete-job-request', (e) => {
				e.preventDefault();
				frappe.confirm(
					__('Delete Job Requisition {0}?', [record.id]),
					() => this.deleteRequisition(record.id),
					() => { }
				);
			});

		$(wrapper)
			.off('click', '#create-job-opening')
			.on('click', '#create-job-opening', (e) => {
				e.preventDefault();
				this.createJobOpening(record.id);
			});

		$(wrapper)
			.off('click', '#associate-job-opening')
			.on('click', '#associate-job-opening', (e) => {
				e.preventDefault();
				this.associateJobOpening(record.id, record);
			});
	}

	bindFormEvents() {
		const wrapper = this.wrapper;

		$(wrapper)
			.off('click', '#cancel-job-request-form')
			.on('click', '#cancel-job-request-form', (e) => {
				e.preventDefault();
				if (this.editing_requisition) {
					frappe.set_route('job-request', this.editing_requisition);
				} else {
					frappe.set_route('job-request');
				}
			});

		$(wrapper)
			.off('click', '#next-job-request-step')
			.on('click', '#next-job-request-step', (e) => {
				e.preventDefault();
				if (this.validateCurrentFormStep() && this.current_form_step < this.total_form_steps) {
					this.showFormStep(this.current_form_step + 1);
				}
			});

		$(wrapper)
			.off('click', '#prev-job-request-step')
			.on('click', '#prev-job-request-step', (e) => {
				e.preventDefault();
				if (this.current_form_step > 1) {
					this.showFormStep(this.current_form_step - 1);
				}
			});

		$(wrapper)
			.off('submit', '#job-request-form')
			.on('submit', '#job-request-form', (e) => {
				e.preventDefault();
				if (!this.validateCurrentFormStep()) return;
				this.submitForm();
			});
	}

	initializeFormWizard() {
		this.current_form_step = 1;
		this.showFormStep(1);
	}

	showFormStep(stepNumber) {
		const form = this.getElement('#job-request-form');
		if (!form) return;
		const formView = this.getElement('.job-request-form-view');

		form.querySelectorAll('.wizard-step').forEach((step) => step.classList.add('d-none'));
		const stepEl = form.querySelector(`#job-request-step-${stepNumber}`);
		if (stepEl) {
			stepEl.classList.remove('d-none');
		}

		(formView || this.wrapper).querySelectorAll('.wizard-step-indicator').forEach((indicator, idx) => {
			const current = idx + 1;
			indicator.classList.remove('active', 'completed');
			if (current < stepNumber) {
				indicator.classList.add('completed');
			} else if (current === stepNumber) {
				indicator.classList.add('active');
			}
		});

		this.current_form_step = stepNumber;
		this.updateFormWizardNavigation();
	}

	updateFormWizardNavigation() {
		const form = this.getElement('#job-request-form');
		if (!form) return;

		const prevBtn = form.querySelector('#prev-job-request-step');
		const nextBtn = form.querySelector('#next-job-request-step');
		const submitBtn = form.querySelector('#submit-job-request-step');

		if (prevBtn) {
			prevBtn.style.display = this.current_form_step === 1 ? 'none' : 'inline-flex';
		}

		if (nextBtn) {
			nextBtn.style.display = this.current_form_step === this.total_form_steps ? 'none' : 'inline-flex';
		}

		if (submitBtn) {
			submitBtn.style.display = this.current_form_step === this.total_form_steps ? 'inline-flex' : 'none';
		}
	}

	validateCurrentFormStep() {
		const form = this.getElement('#job-request-form');
		if (!form) return true;

		const stepEl = form.querySelector(`#job-request-step-${this.current_form_step}`);
		if (!stepEl) return true;

		const requiredFields = stepEl.querySelectorAll('[required]');
		let firstInvalidField = null;
		const missingFields = [];

		requiredFields.forEach((field) => {
			const value = (field.value || '').trim();
			if (!value) {
				field.style.borderColor = '#ef4444';
				if (!firstInvalidField) firstInvalidField = field;
				const label = field.closest('.jrq-form-group')?.querySelector('label')?.textContent || field.name;
				missingFields.push(String(label).replace('*', '').trim());
			} else {
				field.style.borderColor = '';
			}
		});

		if (missingFields.length) {
			frappe.msgprint({
				title: __('Validation'),
				indicator: 'orange',
				message: __('Please fill the required fields: {0}', [missingFields.join(', ')]),
			});
			if (firstInvalidField) firstInvalidField.focus();
			return false;
		}

		return true;
	}

	readFilterValues() {
		return {
			status: (this.getElement('#job-request-filter-status').value || '').trim(),
			request_id: (this.getElement('#job-request-filter-id').value || '').trim(),
			designation: (this.getElement('#job-request-filter-designation').value || '').trim(),
		};
	}

	applyFilters() {
		const status = (this.list_filters.status || '').toLowerCase();
		const requestId = (this.list_filters.request_id || '').toLowerCase();
		const designation = (this.list_filters.designation || '').toLowerCase();

		this.filtered_requisitions = (this.all_requisitions || []).filter((item) => {
			if (status && String(item.status || '').toLowerCase() !== status) return false;
			if (requestId && !String(item.id || '').toLowerCase().includes(requestId)) return false;
			if (designation && !String(item.designation || '').toLowerCase().includes(designation)) return false;
			return true;
		});

		this.visible_count = Math.min(this.visible_count, this.filtered_requisitions.length || 0);
		if (this.visible_count < this.page_length) {
			this.visible_count = Math.min(this.page_length, this.filtered_requisitions.length || 0);
		}
	}

	renderRows() {
		const tbody = this.getElement('#job-request-table-body');
		if (!tbody) return;

		if (!this.filtered_requisitions.length) {
			tbody.innerHTML = `
				<tr>
					<td colspan="9" class="text-center text-muted py-4">
						<div class="jrq-empty-state">
							<div class="jrq-empty-icon">
								<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/></svg>
							</div>
							<div class="jrq-empty-title">No requisitions found</div>
							<div class="jrq-empty-sub">Try adjusting your filters or create a new one</div>
						</div>
					</td>
				</tr>`;
			this.updateListFooter();
			return;
		}

		const rows = this.filtered_requisitions.slice(0, this.visible_count);
		tbody.innerHTML = rows.map((r) => {
			const statusClass = this.getStatusClass(r.status);
			return `
				<tr>
					<td style="width: 40px;"><input type="checkbox" class="job-select-checkbox" /></td>
					<td><a href="#" class="job-request-link ids link-reset" data-id="${this.escapeHtml(r.id)}">${this.escapeHtml(r.id)}</a></td>
					<td class="ellipsis" title="${this.escapeHtml(r.designation || '—')}">${this.escapeHtml(r.designation || '—')}</td>
					<td>${this.escapeHtml(r.department || '—')}</td>
					<td>${this.escapeHtml(r.requested_by_name || r.requested_by || '—')}</td>
					<td>${this.escapeHtml(r.company || '—')}</td>
					<td><span class="pill ${statusClass}">${this.escapeHtml(r.status || '—')}</span></td>
					<td class="text-right">${this.escapeHtml(this.formatCurrency(r.expected_compensation))}</td>
					<td class="text-center job-date-cell">${this.escapeHtml(this.formatDate(r.posting_date) || '—')}</td>
				</tr>
			`;
		}).join('');

		const selectAll = this.getElement('#selectAllJobs');
		if (selectAll) {
			selectAll.checked = false;
		}

		this.updateListFooter();
	}

	updateListFooter() {
		const countText = `${Math.min(this.visible_count, this.filtered_requisitions.length)} of ${this.filtered_requisitions.length}`;
		const countEl = this.getElement('#job-request-count');
		if (countEl) countEl.textContent = countText;

		const visibleCountEl = this.getElement('#visible-count');
		const totalCountEl = this.getElement('#total-count');
		const countHeaderEl = this.getElement('#count-header');
		if (visibleCountEl) visibleCountEl.textContent = Math.min(this.visible_count, this.filtered_requisitions.length);
		if (totalCountEl) totalCountEl.textContent = this.filtered_requisitions.length;
		if (countHeaderEl) countHeaderEl.setAttribute('title', countText);

		const loadMore = this.getElement('#load-more-job-request');
		if (loadMore) {
			loadMore.style.display = this.visible_count < this.filtered_requisitions.length ? 'inline-block' : 'none';
		}
	}

	fetchSingleRequisition(requisitionId, callback) {
		frappe.call({
			method: 'renewal_module.custom_module.page.job_request.job_request.get_job_requisition',
			args: { job_name: requisitionId },
			callback: (r) => {
				const message = r && r.message ? r.message : {};
				const record = message.status === 'success' ? message.data : null;
				if (typeof callback === 'function') callback(record);
			},
			error: () => {
				if (typeof callback === 'function') callback(null);
			},
		});
	}

	renderDetails(r) {
		const target = this.getElement('#job-request-details-panel');
		if (!target) return;

		const openings = Array.isArray(r.linked_job_openings) ? r.linked_job_openings : [];
		const openingRows = openings.length
			? openings.map((o) => `
				<tr class="jrq-row">
					<td class="jrq-id-cell">${this.escapeHtml(o.name || '—')}</td>
					<td class="jrq-cell-primary">${this.escapeHtml(o.job_title || '—')}</td>
					<td>${this.escapeHtml(o.department || '—')}</td>
					<td><span class="jrq-pill ${this.getStatusClass(o.status)}">${this.escapeHtml(o.status || '—')}</span></td>
					<td class="jrq-amount-cell">${this.escapeHtml(String(o.vacancies || 0))}</td>
				</tr>
			`).join('')
			: `<tr><td colspan="5"><div class="jrq-empty-state jrq-empty-sm"><div class="jrq-empty-title">No linked job openings</div></div></td></tr>`;

		target.innerHTML = `
			<div class="jrq-detail-wrap">
				<div class="row">
					<div class="col-12">
						<div class="page-title-head d-flex align-items-center">
							<div class="flex-grow-1">
								<h3 class="fs-xl fw-bold m-0">Job Request</h3>
							</div>
							<div class="text-end">
								<ol class="breadcrumb m-0 py-0" style="background-color: transparent;">
									<li class="breadcrumb-item"><a href="javascript:void(0)">HR</a></li>
									<li class="breadcrumb-item active">Job Request</li>
								</ol>
							</div>
						</div>
					</div>
				</div>

				<!-- Header banner -->
				<div class="jrq-detail-header">
					<div class="jrq-detail-header-left">
						<div class="jrq-detail-id">${this.escapeHtml(r.id || '')}</div>
						<div class="jrq-detail-meta">
							<span class="jrq-detail-badge">${this.escapeHtml(r.designation || '')}</span>
							${r.department ? `<span class="jrq-detail-badge jrq-detail-badge-soft">${this.escapeHtml(r.department)}</span>` : ''}
							<span class="jrq-pill ${this.getStatusClass(r.status)} jrq-pill-sm">${this.escapeHtml(r.status || '')}</span>
						</div>
					</div>
					<div class="jrq-detail-header-actions">
						<button class="jrq-btn jrq-btn-ghost" id="back-job-request-list">
							Back
						</button>
						<button class="jrq-btn jrq-btn-outline" id="edit-job-request">
							Edit
						</button>
						<button class="jrq-btn jrq-btn-danger" id="delete-job-request">
							Delete
						</button>
					</div>
				</div>

				<!-- Stat cards -->
				<div class="jrq-stat-grid">
					<div class="jrq-stat-card">
						<div class="jrq-stat-body">
							<div class="jrq-stat-label">Requested By</div>
							<div class="jrq-stat-value">${this.escapeHtml(r.requested_by_name || r.requested_by || '—')}</div>
						</div>
					</div>
					<div class="jrq-stat-card">
						<div class="jrq-stat-body">
							<div class="jrq-stat-label">Positions</div>
							<div class="jrq-stat-value">${this.escapeHtml(String(r.no_of_positions || 0))}</div>
						</div>
					</div>
					<div class="jrq-stat-card">
						<div class="jrq-stat-body">
							<div class="jrq-stat-label">Compensation</div>
							<div class="jrq-stat-value">${this.escapeHtml(this.formatCurrency(r.expected_compensation))}</div>
						</div>
					</div>
					<div class="jrq-stat-card">
						<div class="jrq-stat-body">
							<div class="jrq-stat-label">Posting Date</div>
							<div class="jrq-stat-value">${this.escapeHtml(this.formatDate(r.posting_date) || '—')}</div>
						</div>
					</div>
				</div>

				<!-- Detail fields grid -->
				<div class="jrq-detail-card">
					<div class="jrq-detail-section-title">Requisition Details</div>
					<div class="jrq-fields-grid">
						<div class="jrq-field-item">
							<div class="jrq-field-label">Company</div>
							<div class="jrq-field-value">${this.escapeHtml(r.company || '—')}</div>
						</div>
						<div class="jrq-field-item">
							<div class="jrq-field-label">Expected By</div>
							<div class="jrq-field-value">${this.escapeHtml(this.formatDate(r.expected_by) || '—')}</div>
						</div>
						<div class="jrq-field-item">
							<div class="jrq-field-label">Pending Referrals</div>
							<div class="jrq-field-value">${this.escapeHtml(String(r.pending_referrals || 0))}</div>
						</div>
						${r.reason_for_requesting ? `
						<div class="jrq-field-item jrq-field-full">
							<div class="jrq-field-label">Reason for Requesting</div>
							<div class="jrq-field-value jrq-field-text">${this.escapeHtml(r.reason_for_requesting)}</div>
						</div>` : ''}
						${r.description ? `
						<div class="jrq-field-item jrq-field-full">
							<div class="jrq-field-label">Description</div>
							<div class="jrq-field-value jrq-field-text">${this.escapeHtml(r.description)}</div>
						</div>` : ''}
					</div>
				</div>

				<!-- Linked openings -->
				<div class="jrq-detail-card">
					<div class="jrq-detail-section-header">
						<div class="jrq-detail-section-title">Linked Job Openings</div>
						<div class="jrq-section-actions">
							<button class="jrq-btn jrq-btn-primary" id="create-job-opening">
								Create Job Opening
							</button>
							<button class="jrq-btn jrq-btn-outline" id="associate-job-opening">
								Associate
							</button>
						</div>
					</div>
					<div class="jrq-table-wrap">
						<table class="jrq-inner-table">
							<thead>
								<tr>
									<th>Job Opening</th>
									<th>Job Title</th>
									<th>Department</th>
									<th>Status</th>
									<th class="text-right">Vacancies</th>
								</tr>
							</thead>
							<tbody>${openingRows}</tbody>
						</table>
					</div>
				</div>
			</div>
		`;
	}

	fillForm(form, data) {
		const setValue = (name, value) => {
			const field = form.querySelector(`[name="${name}"]`);
			if (field) field.value = value || '';
		};

		setValue('designation', data.designation);
		setValue('department', data.department);
		setValue('company', data.company);
		setValue('requested_by', data.requested_by);
		setValue('status', data.status || 'Open');
		setValue('no_of_positions', data.no_of_positions);
		setValue('expected_compensation', data.expected_compensation);
		setValue('posting_date', data.posting_date);
		setValue('expected_by', data.expected_by);
		setValue('description', data.description);
		setValue('reason_for_requesting', data.reason_for_requesting);
	}

	submitForm() {
		const form = this.getElement('#job-request-form');
		if (!form) return;

		const payload = {
			designation: form.querySelector('[name="designation"]').value,
			department: form.querySelector('[name="department"]').value,
			company: form.querySelector('[name="company"]').value,
			requested_by: form.querySelector('[name="requested_by"]').value,
			status: form.querySelector('[name="status"]').value,
			no_of_positions: form.querySelector('[name="no_of_positions"]').value,
			expected_compensation: form.querySelector('[name="expected_compensation"]').value,
			posting_date: form.querySelector('[name="posting_date"]').value,
			expected_by: form.querySelector('[name="expected_by"]').value,
			description: form.querySelector('[name="description"]').value,
			reason_for_requesting: form.querySelector('[name="reason_for_requesting"]').value,
		};

		if (!payload.designation || !payload.company || !payload.requested_by) {
			frappe.msgprint({
				title: __('Validation'),
				indicator: 'orange',
				message: __('Designation, Company and Requested By are required'),
			});
			return;
		}

		const isEdit = !!this.editing_requisition;
		const method = isEdit
			? 'renewal_module.custom_module.page.job_request.job_request.update_job_requisition'
			: 'renewal_module.custom_module.page.job_request.job_request.create_job_requisition';
		const args = isEdit
			? { job_name: this.editing_requisition, data: payload }
			: { data: payload };

		frappe.call({
			method,
			args,
			freeze: true,
			freeze_message: __('Saving...'),
			callback: (r) => {
				const message = r && r.message ? r.message : {};
				if (message.status !== 'success') {
					frappe.msgprint({
						title: __('Error'),
						indicator: 'red',
						message: __(message.message || 'Unable to save requisition'),
					});
					return;
				}

				frappe.show_alert({
					message: __(message.message || 'Saved'),
					indicator: 'green',
				});

				const id = message.data && message.data.id ? message.data.id : this.editing_requisition;
				this.loadRequisitions(() => {
					if (id) {
						frappe.set_route('job-request', id);
					} else {
						frappe.set_route('job-request');
					}
				});
			},
		});
	}

	deleteRequisition(requisitionId) {
		frappe.call({
			method: 'renewal_module.custom_module.page.job_request.job_request.delete_job_requisition',
			args: { job_name: requisitionId },
			freeze: true,
			freeze_message: __('Deleting...'),
			callback: (r) => {
				const message = r && r.message ? r.message : {};
				if (message.status !== 'success') {
					frappe.msgprint({
						title: __('Error'),
						indicator: 'red',
						message: __(message.message || 'Unable to delete requisition'),
					});
					return;
				}

				frappe.show_alert({ message: __('Deleted successfully'), indicator: 'green' });
				this.loadRequisitions(() => frappe.set_route('job-request'));
			},
		});
	}

	createJobOpening(requisitionId) {
		frappe.call({
			method: 'renewal_module.custom_module.page.job_request.job_request.create_job_opening_from_requisition',
			args: { job_name: requisitionId },
			freeze: true,
			freeze_message: __('Creating Job Opening...'),
			callback: (r) => {
				const message = r && r.message ? r.message : {};
				if (message.status !== 'success') {
					frappe.msgprint({
						title: __('Error'),
						indicator: 'red',
						message: __(message.message || 'Unable to create job opening'),
					});
					return;
				}

				frappe.show_alert({
					message: __(message.message || 'Job Opening created'),
					indicator: 'green',
				});
				this.showDetails(requisitionId);
			},
		});
	}

	associateJobOpening(requisitionId, record) {
		frappe.prompt(
			{
				label: __('Job Opening'),
				fieldname: 'job_opening',
				fieldtype: 'Link',
				options: 'Job Opening',
				reqd: 1,
				get_query: () => {
					const filters = {
						company: record.company,
						status: 'Open',
						designation: record.designation,
					};
					if (record.department) filters.department = record.department;
					return { filters };
				},
			},
			(values) => {
				frappe.call({
					method: 'renewal_module.custom_module.page.job_request.job_request.associate_job_opening',
					args: {
						job_name: requisitionId,
						job_opening: values.job_opening,
					},
					callback: (r) => {
						const message = r && r.message ? r.message : {};
						if (message.status !== 'success') {
							frappe.msgprint({
								title: __('Error'),
								indicator: 'red',
								message: __(message.message || 'Unable to associate job opening'),
							});
							return;
						}
						frappe.show_alert({ message: __(message.message || 'Associated'), indicator: 'green' });
						this.showDetails(requisitionId);
					},
				});
			},
			__('Associate Job Opening'),
			__('Submit')
		);
	}

	getStatusClass(status) {
		const value = String(status || '').toLowerCase();
		if (value.includes('approved') || value === 'filled') return 'pill-success';
		if (value.includes('cancel')) return 'pill-danger';
		if (value.includes('hold')) return 'pill-warning';
		return 'pill-info';
	}

	formatDate(dateStr) {
		if (!dateStr) return '';
		return frappe.datetime.str_to_user(dateStr);
	}

	formatCurrency(value) {
		if (value === null || value === undefined || value === '') return '-';
		const n = Number(value);
		if (Number.isNaN(n)) return String(value);
		const html = frappe.format(n, { fieldtype: 'Currency' });
		const tmp = document.createElement('span');
		tmp.innerHTML = html;
		return tmp.textContent || tmp.innerText || String(n);
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

	getElement(selector) {
		const root = this.page.wrapper && this.page.wrapper[0] ? this.page.wrapper[0] : this.page.wrapper;
		return root ? root.querySelector(selector) : null;
	}
}

frappe.job_request_page_template = {
	body: `
		<div class="jrq-wrapper">

			<!-- ===== LIST VIEW ===== -->
			<div class="job-request-list-view">
				<div class="row">
					<div class="col-12">
						<div class="page-title-head d-flex align-items-center">
							<div class="flex-grow-1">
								<h3 class="fs-xl fw-bold m-0">Job Requisition</h3>
							</div>
							<div class="text-end">
								<ol class="breadcrumb m-0 py-0" style="background-color: transparent;">
									<li class="breadcrumb-item"><a href="javascript: void(0);">HR</a></li>
									<li class="breadcrumb-item active">Job Requisition</li>
								</ol>
							</div>
						</div>
					</div>
				</div>

				<div class="controls-wrapper">
					<div class="controls">
						<div class="left-controls">
							<select id="job-request-filter-status" class="control-select placeholder" data-table-filter="status" aria-label="Status">
								<option value="">Status</option>
								<option value="Open">Open</option>
								<option value="Open & Approved">Open &amp; Approved</option>
								<option value="Rejected">Rejected</option>
								<option value="On Hold">On Hold</option>
								<option value="Cancelled">Cancelled</option>
								<option value="Filled">Filled</option>
							</select>
							<input id="job-request-filter-id" class="control-input placeholder" placeholder="Request ID" aria-label="Request ID" />
							<input id="job-request-filter-designation" class="control-input placeholder" list="job-request-designation-list" placeholder="Designation" aria-label="Designation" />
							<datalist id="job-request-designation-list"></datalist>
						</div>
						<div class="right-controls">
							<div class="btn-group filter-actions">
								<button id="apply-job-request-filter" class="btn btn-default btn-sm filter-button" title="Filters">
									<svg class="es-icon es-line icon-sm"><use href="#es-line-filter"></use></svg>
									<span class="button-label">Filters</span>
								</button>
								<button id="clear-job-request-filter" class="btn btn-default btn-sm filter-x-button" title="Clear filters">
									<svg class="es-icon es-line icon-sm"><use href="#es-small-close"></use></svg>
								</button>
							</div>
							<a id="new-job-request-btn" href="javascript:void(0)" class="btn btn-sm btn-primary1 mr-2">
								<i class="fa fa-plus me-1"></i> New Requisition
							</a>
						</div>
					</div>
				</div>

				<div class="table-container mt-2">
					<table id="jobsTable" class="jobs-table">
							<thead>
								<tr>
									<th style="width: 40px;">
										<input id="selectAllJobs" type="checkbox" />
									</th>
									<th>Request ID</th>
									<th>Designation</th>
									<th>Department</th>
									<th>Requested By</th>
									<th>Company</th>
									<th>Status</th>
									<th>Compensation</th>
									<th class="text-center ellipsis job-date-head" id="count-header" title="0 of 0">
										<span id="visible-count">0</span> of <span id="total-count">0</span>
									</th>
								</tr>
							</thead>
							<tbody id="job-request-table-body"></tbody>
					</table>
				</div>

				<div class="d-flex justify-content-between align-items-center mt-2">
					<div class="list-paging-area d-flex justify-content-between align-items-center w-100">
						<div class="p-2">
							<div id="job-request-count" class="pagination-info">0 of 0</div>
						</div>
						<div class="p-2">
							<button id="load-more-job-request" class="btn btn-default1 btn-light btn-more btn-sm" style="display:none">Load more</button>
						</div>
					</div>
				</div>
			</div>

			<!-- ===== DETAILS VIEW ===== -->
			<div class="job-request-details-view d-none">
				<div id="job-request-details-panel"></div>
			</div>

			<!-- ===== FORM VIEW ===== -->
			<div class="job-request-form-view d-none">
				<div class="row mb-2">
					<div class="col-12">
						<div class="page-title-head d-flex align-items-center">
							<div class="flex-grow-1">
								<h3 class="fs-xl fw-bold m-0">Job Requisition Form</h3>
							</div>
							<div class="text-end">
								<ol class="breadcrumb m-0 py-0" style="background-color: transparent;">
									<li class="breadcrumb-item"><a href="javascript:void(0)">HR</a></li>
									<li class="breadcrumb-item active">Job Requisition Form</li>
								</ol>
							</div>
						</div>
					</div>
				</div>

				<div class="job-request-form-layout">
					<div class="jrq-wizard-card">
						<div class="wizard-progress-bar">
							<div class="wizard-track"></div>
							<div class="wizard-step-indicator active">
								<div class="wizard-step-number">1</div>
								<div class="wizard-step-label">Position</div>
							</div>
							<div class="wizard-step-indicator">
								<div class="wizard-step-number">2</div>
								<div class="wizard-step-label">Request</div>
							</div>
							<div class="wizard-step-indicator">
								<div class="wizard-step-number">3</div>
								<div class="wizard-step-label">Compensation</div>
							</div>
							<div class="wizard-step-indicator">
								<div class="wizard-step-number">4</div>
								<div class="wizard-step-label">Details</div>
							</div>
						</div>
					</div>

					<div class="jrq-form-card">
						<form id="job-request-form" class="jrq-form">
						<div class="wizard-step" id="job-request-step-1">
							<div class="jrq-form-section-label">Position Information</div>
							<div class="jrq-form-grid">
								<div class="jrq-form-group">
									<label class="jrq-label">Designation <span class="jrq-req">*</span></label>
									<input name="designation" class="jrq-field" list="job-request-designation-list" placeholder="e.g. Senior Engineer" required />
								</div>
								<div class="jrq-form-group">
									<label class="jrq-label">Department</label>
									<input name="department" class="jrq-field" list="job-request-department-list" placeholder="e.g. Engineering" />
								</div>
								<div class="jrq-form-group">
									<label class="jrq-label">Company <span class="jrq-req">*</span></label>
									<input name="company" class="jrq-field" list="job-request-company-list" placeholder="Select company" required />
								</div>
							</div>
						</div>

						<div class="wizard-step d-none" id="job-request-step-2">
							<div class="jrq-form-section-label">Request Details</div>
							<div class="jrq-form-grid">
								<div class="jrq-form-group">
									<label class="jrq-label">Requested By <span class="jrq-req">*</span></label>
									<input name="requested_by" class="jrq-field" list="job-request-employee-list" placeholder="Employee name or ID" required />
								</div>
								<div class="jrq-form-group">
									<label class="jrq-label">Status</label>
									<select name="status" class="jrq-field jrq-select-field">
										<option value="Open">Open</option>
										<option value="Open & Approved">Open &amp; Approved</option>
										<option value="Rejected">Rejected</option>
										<option value="On Hold">On Hold</option>
										<option value="Cancelled">Cancelled</option>
										<option value="Filled">Filled</option>
									</select>
								</div>
								<div class="jrq-form-group">
									<label class="jrq-label">No. of Positions</label>
									<input type="number" min="1" name="no_of_positions" class="jrq-field" value="1" placeholder="1" />
								</div>
							</div>
						</div>

						<div class="wizard-step d-none" id="job-request-step-3">
							<div class="jrq-form-section-label">Compensation &amp; Timeline</div>
							<div class="jrq-form-grid">
								<div class="jrq-form-group">
									<label class="jrq-label">Expected Compensation</label>
									<input type="number" min="0" step="0.01" name="expected_compensation" class="jrq-field" placeholder="0.00" />
								</div>
								<div class="jrq-form-group">
									<label class="jrq-label">Posting Date</label>
									<input type="date" name="posting_date" class="jrq-field" />
								</div>
								<div class="jrq-form-group">
									<label class="jrq-label">Expected By</label>
									<input type="date" name="expected_by" class="jrq-field" />
								</div>
							</div>
						</div>

						<div class="wizard-step d-none" id="job-request-step-4">
							<div class="jrq-form-section-label">Additional Information</div>
							<div class="jrq-form-group jrq-form-group-full">
								<label class="jrq-label">Reason for Requesting</label>
								<textarea name="reason_for_requesting" rows="2" class="jrq-field jrq-textarea" placeholder="Brief reason for this requisition..."></textarea>
							</div>
							<div class="jrq-form-group jrq-form-group-full">
								<label class="jrq-label">Description</label>
								<textarea name="description" rows="4" class="jrq-field jrq-textarea" placeholder="Detailed job description, requirements..."></textarea>
							</div>
						</div>

						<div class="jrq-form-actions wizard-nav-row">
							<button type="button" id="prev-job-request-step" class="jrq-btn jrq-btn-ghost btn-wizard-prev" style="display:none;">
								<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
								Previous
							</button>
							<button type="button" id="cancel-job-request-form" class="jrq-btn jrq-btn-ghost">
								<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
								Cancel
							</button>
							<button type="button" id="next-job-request-step" class="jrq-btn jrq-btn-primary btn-wizard-next">
								Next
								<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
							</button>
							<button type="submit" id="submit-job-request-step" class="jrq-btn jrq-btn-primary btn-wizard-submit" style="display:none;">
								<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
								<span class="btn-wizard-submit-label">Create Requisition</span>
							</button>
						</div>

						<datalist id="job-request-department-list"></datalist>
						<datalist id="job-request-company-list"></datalist>
						<datalist id="job-request-employee-list"></datalist>
					</form>
				</div>
			</div>

		</div>
	`,
};
