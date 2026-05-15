frappe.pages['sales-dashboard'].on_page_load = function(wrapper) {
	// No-op here: actual layout is set up in on_page_show
};

frappe.pages['sales-dashboard'].on_page_show = function(wrapper) {
	$('body').attr('data-route', 'sales-dashboard');

	const pageWrapper = wrapper || $('.page')[0] || document.body;

	const ensureSupportLayoutLoaded = (cb) => {
		if (typeof loadSupportLayout === 'function') return cb();
		frappe.require(['/assets/renewal_module/js/issue_themes/support_layout2.js'], () => {
			setTimeout(cb, 10);
		});
		frappe.require(['/assets/renewal_module/css/issue_themes/support_theme2.css']);
	};

	ensureSupportLayoutLoaded(() => {
		loadSupportLayout(pageWrapper, () => {
			if (!frappe.sales_dashboard_page || frappe.sales_dashboard_page.wrapper !== pageWrapper) {
				frappe.sales_dashboard_page = new salesDashboardPage(pageWrapper);
			}
			frappe.sales_dashboard_page.render();
		});
	});
};

class salesDashboardPage {
	constructor(wrapper) {
		this.wrapper = wrapper;
		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: 'Sales Dashboard',
			single_column: true,
		});
		this.filters = {
			timeRange: 'this week',
			salesPersons: [],
		};
		this.salesPersonRows = [];
		this.salesPersonDropdownDisabled = false;
		this.employeeCache = {};
		this.currentUser = frappe.session.user;
		this.currentUserName = frappe.session.user_fullname || frappe.session.user;
	}

	render() {
		$('body').attr('data-route', 'sales-dashboard');

		const waitForContent = () => {
			const $content = $('#support-page-content');
			if (!$content.length) return setTimeout(waitForContent, 50);
			$content.empty().append($(frappe.sales_dashboard_page_template.body));
			this.init();
		};

		waitForContent();
	}

	init() {
		this.page.set_title('Sales Dashboard');
		this.bindFilterEvents();
		this.toggleCustomDateRange(false);
		this.loadSalesPersons()
			.then(() => this.applyDefaultSalesPersonForUser())
			.then(() => this.refresh())
			.catch((e) => {
				console.error(e);
				frappe.show_alert({ indicator: 'red', message: __('Failed to load dashboard filters') });
			});
	}

	bindFilterEvents() {
		$(this.page.wrapper)
			.off('change', '#time-filter1')
			.on('change', '#time-filter1', (e) => {
				const value = (e.currentTarget.value || 'this week').toLowerCase();
				if (value === 'custom') {
					this.filters.timeRange = 'custom';
					this.toggleCustomDateRange(true);
					this.syncCustomDateInputs();
				} else {
					this.filters.timeRange = value;
					this.toggleCustomDateRange(false);
				}
				if (value !== 'custom') this.refresh();
			});

		$(this.page.wrapper)
			.off('click', '#apply-custom-date-range')
			.on('click', '#apply-custom-date-range', () => {
				const fromDate = ($(this.page.wrapper).find('#custom-from-date').val() || '').trim();
				const toDate = ($(this.page.wrapper).find('#custom-to-date').val() || '').trim();
				if (!fromDate || !toDate) {
					frappe.show_alert({ indicator: 'orange', message: __('Please select both From Date and To Date') });
					return;
				}
				if (fromDate > toDate) {
					frappe.show_alert({ indicator: 'red', message: __('From Date cannot be after To Date') });
					return;
				}
				this.filters.timeRange = 'custom';
				this.filters.customFromDate = fromDate;
				this.filters.customToDate = toDate;
				this.refresh();
			});

		$(this.page.wrapper)
			.off('click', '#sales-person-ms-trigger')
			.on('click', '#sales-person-ms-trigger', (e) => {
				e.preventDefault();
				if (this.salesPersonDropdownDisabled) return;
				const $box = $(this.page.wrapper).find('#sales-person-multiselect');
				$box.toggleClass('is-open');
			});

		$(this.page.wrapper)
			.off('change', '#sales-person-ms-menu input[type="checkbox"]')
			.on('change', '#sales-person-ms-menu input[type="checkbox"]', () => {
				const $checked = $(this.page.wrapper).find('#sales-person-ms-menu input[type="checkbox"]:checked');
				this.filters.salesPersons = $checked.map((_, el) => el.value).get();
				this.updateSalesPersonSummary();
				this.refresh();
			});

		$(document)
			.off('click.sales-dashboard-ms')
			.on('click.sales-dashboard-ms', (e) => {
				const $box = $(this.page.wrapper).find('#sales-person-multiselect');
				if (!$box.length) return;
				if ($(e.target).closest('#sales-person-multiselect').length) return;
				$box.removeClass('is-open');
			});
	}

	toggleCustomDateRange(show) {
		const $row = $(this.page.wrapper).find('#sd-custom-date-range');
		if (!$row.length) return;
		$row.toggleClass('is-visible', !!show);
	}

	syncCustomDateInputs() {
		const $from = $(this.page.wrapper).find('#custom-from-date');
		const $to = $(this.page.wrapper).find('#custom-to-date');
		if ($from.length) $from.val(this.filters.customFromDate || '');
		if ($to.length) $to.val(this.filters.customToDate || '');
	}

	getSalesPersonLabel(name) {
		const row = (this.salesPersonRows || []).find((r) => r.name === name);
		if (!row) return name;
		return row.is_sales_manager_user ? `${row.name} (Sales Manager)` : row.name;
	}

	updateSalesPersonSummary() {
		const $trigger = $(this.page.wrapper).find('#sales-person-ms-trigger');
		if (!$trigger.length) return;
		const count = (this.filters.salesPersons || []).length;
		if (!count) {
			$trigger.text('Sales Person');
			return;
		}
		if (count === 1) {
			$trigger.text(this.getSalesPersonLabel(this.filters.salesPersons[0]));
			return;
		}
		$trigger.text(`${count} selected`);
	}

	renderSalesPersonMultiselect() {
		const $container = $(this.page.wrapper).find('#sales-person-multiselect');
		if (!$container.length) return;
		const selected = new Set(this.filters.salesPersons || []);
		const disabledAttr = this.salesPersonDropdownDisabled ? 'disabled' : '';

		const optionsHtml = (this.salesPersonRows || []).map((row) => {
			const checked = selected.has(row.name) ? 'checked' : '';
			const label = row.is_sales_manager_user ? `${row.name} (Sales Manager)` : row.name;
			return `
				<label class="sd-ms-option">
					<input type="checkbox" value="${frappe.utils.escape_html(row.name)}" ${checked} ${disabledAttr} />
					<span>${frappe.utils.escape_html(label)}</span>
				</label>
			`;
		}).join('');

		$container.toggleClass('is-disabled', this.salesPersonDropdownDisabled);
		$container.html(`
			<button type="button" id="sales-person-ms-trigger" class="sd-ms-trigger" ${disabledAttr}>Sales Person</button>
			<div id="sales-person-ms-menu" class="sd-ms-menu">
				${optionsHtml || '<div class="sd-ms-empty">No sales persons</div>'}
			</div>
		`);
		this.updateSalesPersonSummary();
	}

	async loadSalesPersons() {
		let rows = [];
		try {
			const response = await frappe.call({
				method: 'renewal_module.custom_module.page.sales_dashboard.sales_dashboard.get_active_sales_persons',
			});
			rows = response.message || [];
		} catch (e) {
			console.warn('get_active_sales_persons failed, falling back to client query', e);
			const fallback = await frappe.db.get_list('Sales Person', {
				fields: ['name', 'parent_sales_person', 'employee', 'is_group', 'enabled'],
				filters: {
					enabled: 1,
				},
				limit: 5000,
				order_by: 'name asc',
			});
			rows = fallback || [];
		}

		this.salesPersonRows = (rows || []).filter((r) => Number(r.enabled || 0) === 1);
		this.renderSalesPersonMultiselect();
	}

	getUserRoles() {
		return frappe.user_roles || [];
	}

	isAdminOrSystemManager() {
		if (this.currentUser === 'Administrator') return true;
		return this.getUserRoles().includes('System Manager');
	}

	hasSalesRole() {
		return this.getUserRoles().some((r) => /sales/i.test(r));
	}

	isSalesManager() {
		return this.getUserRoles().includes('Sales Manager');
	}

	async getEmployeeByUser(userId) {
		if (!userId) return null;
		if (this.employeeCache[userId]) return this.employeeCache[userId];

		const rows = await frappe.db.get_list('Employee', {
			fields: ['name', 'employee_name', 'designation', 'user_id'],
			filters: { user_id: userId },
			limit: 1,
		});
		const employee = (rows || [])[0] || null;
		this.employeeCache[userId] = employee;
		return employee;
	}

	async getEmployeeByName(employeeId) {
		if (!employeeId) return null;
		if (this.employeeCache[employeeId]) return this.employeeCache[employeeId];

		const doc = await frappe.db.get_value('Employee', employeeId, ['name', 'employee_name', 'designation', 'user_id']);
		const employee = (doc && doc.message) || null;
		this.employeeCache[employeeId] = employee;
		if (employee && employee.user_id) this.employeeCache[employee.user_id] = employee;
		return employee;
	}

	async applyDefaultSalesPersonForUser() {
		const $container = $(this.page.wrapper).find('#sales-person-multiselect');
		if (!$container.length) return;

		// Admin/System Manager/Sales Manager can view all active sales person data by default.
		if (this.isAdminOrSystemManager() || this.isSalesManager() || !this.hasSalesRole()) {
			this.filters.salesPersons = [];
			this.salesPersonDropdownDisabled = false;
			this.renderSalesPersonMultiselect();
			return;
		}

		const employee = await this.getEmployeeByUser(this.currentUser);
		let salesPerson = null;
		if (employee) {
			salesPerson = (this.salesPersonRows || []).find((r) => r.employee === employee.name);
		}

		if (!salesPerson) {
			salesPerson = (this.salesPersonRows || []).find((r) => r.name === this.currentUserName);
		}

		if (!salesPerson) return;

		this.filters.salesPersons = [salesPerson.name];
		this.salesPersonDropdownDisabled = true;
		this.renderSalesPersonMultiselect();
	}

	async getProfileContext(selectedSalesPersons, dateRange) {
		let displayName = this.currentUserName;
		let designation = this.isSalesManager() ? 'Sales Manager' : 'Sales User';
		let userId = this.currentUser;
		const selectedSalesPerson = (selectedSalesPersons && selectedSalesPersons.length === 1)
			? selectedSalesPersons[0]
			: '';

		if (selectedSalesPerson) {
			displayName = selectedSalesPerson;
			const sp = (this.salesPersonRows || []).find((r) => r.name === selectedSalesPerson);
			if (sp && sp.employee) {
				const emp = await this.getEmployeeByName(sp.employee);
				if (emp) {
					displayName = emp.employee_name || displayName;
					designation = emp.designation || designation;
					userId = emp.user_id || userId;
				}
			}
		} else {
			const emp = await this.getEmployeeByUser(this.currentUser);
			if (emp) {
				displayName = emp.employee_name || displayName;
				designation = emp.designation || designation;
				userId = emp.user_id || userId;
			}
		}

		const createdOppCount = await this.getCreatedOpportunityCount(userId, dateRange);
		return {
			displayName,
			designation,
			userId,
			createdOppCount,
		};
	}

	formatMoney(value) {
		const num = Number(value || 0);
		if (num >= 1000000) return `$${(num / 1000000).toFixed(2)}M`;
		if (num >= 1000) return `$${Math.round(num / 1000)}K`;
		return `$${Math.round(num)}`;
	}

	formatDate(dateObj) {
		const y = dateObj.getFullYear();
		const m = String(dateObj.getMonth() + 1).padStart(2, '0');
		const d = String(dateObj.getDate()).padStart(2, '0');
		return `${y}-${m}-${d}`;
	}

	startOfWeek(d) {
		const out = new Date(d);
		const day = out.getDay();
		const diff = (day === 0 ? -6 : 1) - day;
		out.setDate(out.getDate() + diff);
		out.setHours(0, 0, 0, 0);
		return out;
	}

	endOfWeek(d) {
		const out = this.startOfWeek(d);
		out.setDate(out.getDate() + 6);
		return out;
	}

	startOfMonth(d) {
		return new Date(d.getFullYear(), d.getMonth(), 1);
	}

	endOfMonth(d) {
		return new Date(d.getFullYear(), d.getMonth() + 1, 0);
	}

	startOfQuarter(d) {
		const qStart = Math.floor(d.getMonth() / 3) * 3;
		return new Date(d.getFullYear(), qStart, 1);
	}

	endOfQuarter(d) {
		const start = this.startOfQuarter(d);
		return new Date(start.getFullYear(), start.getMonth() + 3, 0);
	}

	getDateRange(rangeLabel) {
		if (
			(rangeLabel || '').toLowerCase() === 'custom'
			&& this.filters.customFromDate
			&& this.filters.customToDate
		) {
			return {
				fromDate: this.filters.customFromDate,
				toDate: this.filters.customToDate,
			};
		}

		const now = new Date();
		const val = (rangeLabel || 'this week').toLowerCase();
		let from = new Date(now);
		let to = new Date(now);

		if (val === 'last week') {
			to = this.startOfWeek(now);
			to.setDate(to.getDate() - 1);
			from = this.startOfWeek(to);
		} else if (val === 'this week') {
			from = this.startOfWeek(now);
			to = this.endOfWeek(now);
		} else if (val === 'next week') {
			from = this.startOfWeek(now);
			from.setDate(from.getDate() + 7);
			to = this.endOfWeek(from);
		} else if (val === 'last month') {
			const ref = new Date(now.getFullYear(), now.getMonth() - 1, 1);
			from = this.startOfMonth(ref);
			to = this.endOfMonth(ref);
		} else if (val === 'this month') {
			from = this.startOfMonth(now);
			to = this.endOfMonth(now);
		} else if (val === 'next month') {
			const ref = new Date(now.getFullYear(), now.getMonth() + 1, 1);
			from = this.startOfMonth(ref);
			to = this.endOfMonth(ref);
		} else if (val === 'last quarter') {
			const ref = new Date(now.getFullYear(), now.getMonth() - 3, 1);
			from = this.startOfQuarter(ref);
			to = this.endOfQuarter(ref);
		} else if (val === 'this quarter') {
			from = this.startOfQuarter(now);
			to = this.endOfQuarter(now);
		} else if (val === 'next quarter') {
			const ref = new Date(now.getFullYear(), now.getMonth() + 3, 1);
			from = this.startOfQuarter(ref);
			to = this.endOfQuarter(ref);
		} else if (val === 'last 6 months') {
			from = new Date(now.getFullYear(), now.getMonth() - 5, 1);
			to = this.endOfMonth(now);
		} else if (val === 'next 6 months') {
			from = this.startOfMonth(now);
			to = new Date(now.getFullYear(), now.getMonth() + 6, 0);
		} else if (val === 'this year') {
			from = new Date(now.getFullYear(), 0, 1);
			to = new Date(now.getFullYear(), 11, 31);
		}

		return {
			fromDate: this.formatDate(from),
			toDate: this.formatDate(to),
		};
	}

	getDescendantSalesPersons(selectedList) {
		if (!selectedList || !selectedList.length) return [];
		const rows = this.salesPersonRows || [];
		const selectedValues = Array.isArray(selectedList) ? selectedList : [selectedList];
		const out = new Set();

		const childrenByParent = rows.reduce((acc, r) => {
			const p = r.parent_sales_person || '';
			if (!acc[p]) acc[p] = [];
			acc[p].push(r.name);
			return acc;
		}, {});

		selectedValues.forEach((selected) => {
			if (!selected) return;
			const selectedRow = rows.find((r) => r.name === selected);
			if (selectedRow && selectedRow.is_sales_manager_user) {
				rows
					.filter((r) => !r.is_sales_manager_user)
					.forEach((r) => out.add(r.name));
				return;
			}

			out.add(selected);
			const stack = [selected];
			while (stack.length) {
				const cur = stack.pop();
				(childrenByParent[cur] || []).forEach((c) => {
					if (!out.has(c)) {
						out.add(c);
						stack.push(c);
					}
				});
			}
		});

		return Array.from(out);
	}

	async getParentNamesBySalesTeam(parenttype, scopedSalesPersons) {
		if (!scopedSalesPersons || !scopedSalesPersons.length) return [];

		const response = await frappe.call({
			method: 'renewal_module.custom_module.page.sales_dashboard.sales_dashboard.get_sales_team_parents',
			args: {
				parenttype,
				sales_persons: scopedSalesPersons,
			},
		});

		return response.message || [];
	}

	async getDocsByNames(doctype, fields, dateField, dateRange, names) {
		const baseFilters = [[doctype, dateField, 'between', [dateRange.fromDate, dateRange.toDate]]];

		if (names === null) {
			const response = await frappe.call({
				method: 'frappe.client.get_list',
				args: {
					doctype,
					fields,
					filters: baseFilters,
					limit_page_length: 5000,
					order_by: `${dateField} asc`,
				},
			});
			return response.message || [];
		}

		if (!names.length) return [];

		const chunkSize = 300;
		let out = [];
		for (let i = 0; i < names.length; i += chunkSize) {
			const chunk = names.slice(i, i + chunkSize);
			const response = await frappe.call({
				method: 'frappe.client.get_list',
				args: {
					doctype,
					fields,
					filters: [...baseFilters, [doctype, 'name', 'in', chunk]],
					limit_page_length: 5000,
					order_by: `${dateField} asc`,
				},
			});
			out = out.concat(response.message || []);
		}
		return out;
	}

	async getCreatedOpportunityCount(userId, dateRange) {
		if (!userId) return 0;
		const rows = await frappe.db.get_list('Opportunity', {
			fields: ['name'],
			filters: {
				owner: userId,
				transaction_date: ['between', [dateRange.fromDate, dateRange.toDate]],
			},
			limit: 5000,
		});
		return (rows || []).length;
	}

	async getClosedWonAmountForRange(scopedSalesPersons, range) {
		const oppParents = await this.getParentNamesBySalesTeam('Opportunity', scopedSalesPersons);
		const opportunities = await this.getDocsByNames(
			'Opportunity',
			['name', 'status', 'opportunity_amount', 'transaction_date'],
			'transaction_date',
			range,
			oppParents
		);

		return (opportunities || []).reduce((sum, o) => {
			return (String(o.status || '').toLowerCase() === 'closed')
				? sum + Number(o.opportunity_amount || 0)
				: sum;
		}, 0);
	}

	async getWeeklyClosedWonComparison(scopedSalesPersons) {
		const now = new Date();
		const thisWeek = {
			fromDate: this.formatDate(this.startOfWeek(now)),
			toDate: this.formatDate(this.endOfWeek(now)),
		};

		const lastWeekEnd = this.startOfWeek(now);
		lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);
		const lastWeek = {
			fromDate: this.formatDate(this.startOfWeek(lastWeekEnd)),
			toDate: this.formatDate(lastWeekEnd),
		};

		const [thisWeekAmount, lastWeekAmount] = await Promise.all([
			this.getClosedWonAmountForRange(scopedSalesPersons, thisWeek),
			this.getClosedWonAmountForRange(scopedSalesPersons, lastWeek),
		]);

		const pctChange = lastWeekAmount
			? Math.round(((thisWeekAmount - lastWeekAmount) / lastWeekAmount) * 100)
			: (thisWeekAmount > 0 ? 100 : 0);

		return { thisWeekAmount, lastWeekAmount, pctChange };
	}

	buildMonthlySeries(dateRange, opportunities, quotations) {
		const start = new Date(dateRange.fromDate);
		const end = new Date(dateRange.toDate);
		const labels = [];
		const keys = [];
		const d = new Date(start.getFullYear(), start.getMonth(), 1);
		const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

		while (d <= end) {
			labels.push(monthNames[d.getMonth()]);
			keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
			d.setMonth(d.getMonth() + 1);
		}

		const revenue = keys.map(() => 0);
		const quota = keys.map(() => 0);

		quotations.forEach((q) => {
			const dt = q.transaction_date || q.creation;
			if (!dt) return;
			const key = dt.slice(0, 7);
			const idx = keys.indexOf(key);
			if (idx >= 0) revenue[idx] += Number(q.grand_total || 0);
		});

		opportunities.forEach((o) => {
			const dt = o.transaction_date || o.creation;
			if (!dt) return;
			const key = dt.slice(0, 7);
			const idx = keys.indexOf(key);
			if (idx >= 0) quota[idx] += Number(o.opportunity_amount || 0);
		});

		return {
			labels,
			revenue: revenue.map((v) => Math.round(v / 1000)),
			quota: quota.map((v) => Math.round(v / 1000)),
		};
	}

	buildFunnelData(opportunities) {
		const sums = {
			Leads: 0,
			MQLs: 0,
			SQLs: 0,
			Proposals: 0,
			'Closed Won': 0,
		};

		opportunities.forEach((o) => {
			const amt = Number(o.opportunity_amount || 0);
			const status = (o.status || '').toLowerCase();
			sums.Leads += amt;
			if (['open', 'replied', 'quotation'].includes(status)) sums.MQLs += amt;
			if (['quotation', 'converted'].includes(status)) sums.SQLs += amt;
			if (['converted', 'closed'].includes(status)) sums.Proposals += amt;
			if (status === 'closed') sums['Closed Won'] += amt;
		});

		return [
			{ label: 'Leads', value: Math.round(sums.Leads / 1000), color: '#2970c2' },
			{ label: 'MQLs', value: Math.round(sums.MQLs / 1000), color: '#3a9e4a' },
			{ label: 'SQLs', value: Math.round(sums.SQLs / 1000), color: '#f5a623' },
			{ label: 'Proposals', value: Math.round(sums.Proposals / 1000), color: '#1a4a7a' },
			{ label: 'Closed Won', value: Math.round(sums['Closed Won'] / 1000), color: '#0d2a50' },
		];
	}

	async getDashboardData() {
		const dateRange = this.getDateRange(this.filters.timeRange);
		const scopedSalesPersons = this.getDescendantSalesPersons(this.filters.salesPersons);
		const activeSalesPersons = (this.salesPersonRows || []).map((r) => r.name);
		const effectiveSalesPersons = scopedSalesPersons.length ? scopedSalesPersons : activeSalesPersons;
		const profileContext = await this.getProfileContext(this.filters.salesPersons, dateRange);
		const weeklyComparison = await this.getWeeklyClosedWonComparison(effectiveSalesPersons);

		const [oppParents, quoParents] = await Promise.all([
			this.getParentNamesBySalesTeam('Opportunity', effectiveSalesPersons),
			this.getParentNamesBySalesTeam('Quotation', effectiveSalesPersons),
		]);

		const [opportunities, quotations] = await Promise.all([
			this.getDocsByNames(
				'Opportunity',
				['name', 'status', 'opportunity_amount', 'party_name', 'transaction_date', 'creation'],
				'transaction_date',
				dateRange,
				oppParents,
			),
			this.getDocsByNames(
				'Quotation',
				['name', 'party_name', 'status', 'grand_total', 'transaction_date', 'creation'],
				'transaction_date',
				dateRange,
				quoParents,
			),
		]);

		const leadCount = opportunities.length;
		const pipelineValue = opportunities.reduce((s, o) => s + Number(o.opportunity_amount || 0), 0);
		const wonCount = opportunities.filter((o) => (o.status || '').toLowerCase() === 'closed').length;
		const winRate = leadCount ? Math.round((wonCount / leadCount) * 100) : 0;
		const forecastValue = quotations.reduce((s, q) => s + Number(q.grand_total || 0), 0);
		const targetValue = Math.max(250000, Math.round(pipelineValue * 0.75));
		const goalPct = targetValue ? Math.round((forecastValue / targetValue) * 100) : 0;

		const topDeals = [...quotations]
			.sort((a, b) => Number(b.grand_total || 0) - Number(a.grand_total || 0))
			.slice(0, 4);

		const ranked = [...topDeals].slice(0, 3).map((d, idx) => ({
			position: idx + 1,
			name: d.party_name || d.name,
			amount: Number(d.grand_total || 0),
		}));

		const stageRaw = {
			Qualified: 0,
			Proposal: 0,
			Negotiation: 0,
			'Closed Won': 0,
		};
		opportunities.forEach((o) => {
			const amt = Number(o.opportunity_amount || 0);
			const s = (o.status || '').toLowerCase();
			if (['open', 'replied'].includes(s)) stageRaw.Qualified += amt;
			else if (s === 'quotation') stageRaw.Proposal += amt;
			else if (['converted', 'submitted'].includes(s)) stageRaw.Negotiation += amt;
			else if (s === 'closed') stageRaw['Closed Won'] += amt;
			else stageRaw.Qualified += amt;
		});

		const stages = [
			{ label: 'Qualified', value: Math.round(stageRaw.Qualified / 1000), color: '#4a7fc1' },
			{ label: 'Proposal', value: Math.round(stageRaw.Proposal / 1000), color: '#4a7fc1' },
			{ label: 'Negotiation', value: Math.round(stageRaw.Negotiation / 1000), color: '#f5a623' },
			{ label: 'Closed Won', value: Math.round(stageRaw['Closed Won'] / 1000), color: '#2ecc71' },
		];

		return {
			leadCount,
			pipelineValue,
			winRate,
			forecastValue,
			targetValue,
			goalPct,
			topDeals,
			ranked,
			stages,
			funnel: this.buildFunnelData(opportunities),
			trend: this.buildMonthlySeries(dateRange, opportunities, quotations),
			activity: {
				calls: opportunities.length,
				meetings: quotations.length,
				emails: opportunities.length + quotations.length,
			},
			profile: profileContext,
			weeklyClosedWon: weeklyComparison,
		};
	}

	updateKpis(data) {
		$('#sd-win-rate').text(`${data.winRate}%`);
		$('#sd-new-leads').text(data.leadCount);
		$('#sd-pipeline-value').text(this.formatMoney(data.pipelineValue));
		$('#sd-forecast-value').text(this.formatMoney(data.forecastValue));
		$('#sd-target-value').text(this.formatMoney(data.targetValue));
		$('#sd-goal-label').text(`${data.goalPct}% of Goal`);
		$('#sd-kpi-goal-fill').css('width', `${Math.max(0, Math.min(100, data.goalPct))}%`);

		$('#sd-calls').text(data.activity.calls);
		$('#sd-meetings').text(data.activity.meetings);
		$('#sd-emails').text(data.activity.emails);

		const profile = data.profile || {};
		const profileName = profile.displayName || this.currentUserName;
		const initials = profileName.split(' ').map((v) => v[0] || '').join('').slice(0, 2).toUpperCase();
		const closedWon = (data.weeklyClosedWon && data.weeklyClosedWon.thisWeekAmount) || 0;
		const pct = (data.weeklyClosedWon && data.weeklyClosedWon.pctChange) || 0;
		const pctArrow = pct >= 0 ? '&#x25B2;' : '&#x25BC;';
		const pctClass = pct >= 0 ? 'sd-green' : 'sd-red';

		$('#sd-profile-avatar').text(initials || 'NA');
		$('#sd-profile-name').text(profileName);
		$('#sd-profile-title').text(profile.designation || 'Sales User');
		$('#sd-created-opps').text(profile.createdOppCount || 0);
		$('#sd-profile-amount').text(this.formatMoney(closedWon));
		$('#sd-profile-badge').removeClass('sd-green sd-red').addClass(pctClass).html(`${pctArrow} ${Math.abs(pct)}% vs Last Week`);

		const topDealRows = (data.topDeals || []).map((d, idx) => {
			const highlightClass = idx === 0 ? 'sd-deals-highlight' : '';
			return `
				<tr class="sd-deals-row ${highlightClass}">
					<td>${frappe.utils.escape_html(d.party_name || d.name || '-')}</td>
					<td class="sd-deals-amt">${this.formatMoney(d.grand_total || 0)}</td>
				</tr>
			`;
		}).join('');
		$('#sd-top-deals-body').html(topDealRows || '<tr class="sd-deals-row"><td colspan="2">No data</td></tr>');

		const rankedRows = (data.ranked || []).map((r, idx) => {
			const cls = idx === 0 ? 'sd-rank-row sd-rank-1' : 'sd-rank-row';
			const initials = (r.name || 'NA').split(' ').map((v) => v[0] || '').join('').slice(0, 2).toUpperCase();
			return `
				<div class="${cls}">
					<span class="sd-rank-pos">#${r.position}</span>
					<span class="sd-rank-avatar">${initials}</span>
					<span class="sd-rank-name">${frappe.utils.escape_html(r.name)}</span>
					<span class="sd-rank-amt">${this.formatMoney(r.amount)}</span>
				</div>
			`;
		}).join('');
		$('#sd-ranking-list').html(rankedRows || '<div class="sd-rank-row"><span class="sd-rank-name">No data</span></div>');
	}

	async refresh() {
		try {
			frappe.dom.freeze(__('Loading dashboard...'));
			const data = await this.getDashboardData();
			this.updateKpis(data);
			this.renderPipelineChart(data.stages);
			this.renderTrendChart(data.trend);
			this.renderFunnelChart(data.funnel);
		} catch (e) {
			console.error(e);
			frappe.show_alert({ indicator: 'red', message: __('Could not load dashboard data') });
		} finally {
			frappe.dom.unfreeze();
		}
	}

	renderPipelineChart(stageData) {
		const el = document.getElementById('sd-pipeline-chart');
		if (!el) return;
		const stages = (stageData || []).map((s) => s.label);
		const values = (stageData || []).map((s) => Number(s.value || 0));
		const colors = (stageData || []).map((s) => s.color);
		if (!stages.length) {
			el.innerHTML = '<div class="text-muted">No data</div>';
			return;
		}
		const max = Math.max(...values);
		el.innerHTML = `
			<div class="sd-bar-chart">
				${stages.map((s, i) => `
					<div class="sd-bar-col">
						<div class="sd-bar-label-top">$${values[i]}K</div>
						<div class="sd-bar-wrap">
							<div class="sd-bar" style="height:${Math.round((values[i]/(max || 1))*140)}px;background:${colors[i]};"></div>
						</div>
						<div class="sd-bar-label">${s}</div>
					</div>
				`).join('')}
			</div>
		`;
	}

	renderFunnelChart(funnelData) {
		const el = document.getElementById('sd-funnel-chart');
		if (!el) return;

		const stages = funnelData || [];
		if (!stages.length) {
			el.innerHTML = '<div class="text-muted">No data</div>';
			return;
		}

		const W = 300, H_STEP = 44, GAP = 4;
		const totalH = stages.length * (H_STEP + GAP) - GAP;
		const maxVal = Math.max(...stages.map((s) => Number(s.value || 0)), 1);

		// Each stage top-width proportional to value (min 28%)
		const pct = stages.map((s) => Math.max(0.28, Number(s.value || 0) / maxVal));

		const paths = stages.map((s, i) => {
			const topW = pct[i] * W;
			const botW = i < stages.length - 1 ? pct[i + 1] * W : pct[i] * W * 0.82;
			const topX = (W - topW) / 2;
			const botX = (W - botW) / 2;
			const y = i * (H_STEP + GAP);
			return [
				`<path d="M${topX.toFixed(1)},${y} L${(topX+topW).toFixed(1)},${y} L${(botX+botW).toFixed(1)},${y+H_STEP} L${botX.toFixed(1)},${y+H_STEP} Z" fill="${s.color}"/>`,
				`<text x="${W/2}" y="${y + H_STEP/2 + 5}" text-anchor="middle" fill="#fff" font-size="13" font-weight="700" font-family="sans-serif">${s.label} ${s.value}</text>`,
			].join('');
		}).join('');

		el.innerHTML = `<svg viewBox="0 0 ${W} ${totalH}" width="100%" style="display:block;">${paths}</svg>`;
	}

	renderTrendChart(trendData) {
		const el = document.getElementById('sd-trend-chart');
		if (!el) return;
		const months = (trendData && trendData.labels) || [];
		const revenue = (trendData && trendData.revenue) || [];
		const quota = (trendData && trendData.quota) || [];
		if (!months.length) {
			el.innerHTML = '<div class="text-muted">No data</div>';
			return;
		}
		const maxVal  = Math.max(...revenue);
		const H = 140, W_BAR = 52;

		const bars = months.map((m, i) => {
			const rH = Math.round((revenue[i]/maxVal)*H);
			const qH = Math.round((quota[i]/maxVal)*H);
			return `
				<div class="sd-trend-col">
					<div class="sd-trend-bar-wrap" style="height:${H}px;">
						<div class="sd-trend-bar sd-revenue" style="height:${rH}px;"></div>
						<div class="sd-trend-bar sd-quota" style="height:${qH}px;"></div>
					</div>
					<div class="sd-bar-label">${m}</div>
				</div>
			`;
		});

		// SVG line for revenue
		const pts = months.map((m, i) => {
			const x = Math.round(i * (W_BAR + 8) + (W_BAR / 2));
			const y = Math.round(H - (revenue[i]/maxVal)*H);
			return `${x},${y}`;
		}).join(' ');
		const totalW = months.length * (W_BAR + 8);

		el.innerHTML = `
			<div class="sd-trend-wrapper" style="position:relative;">
				<div class="sd-trend-bars" style="display:flex;gap:8px;align-items:flex-end;">
					${bars.join('')}
				</div>
				<svg class="sd-trend-line" viewBox="0 0 ${totalW} ${H}" style="position:absolute;top:0;left:0;width:100%;height:${H}px;pointer-events:none;">
					<polyline points="${pts}" fill="none" stroke="#4fc3f7" stroke-width="2.5" stroke-linejoin="round"/>
					${pts.split(' ').map(p => {
						const [x,y] = p.split(',');
						return `<circle cx="${x}" cy="${y}" r="4" fill="#4fc3f7"/>`;
					}).join('')}
				</svg>
			</div>
			<div class="sd-trend-legend">
				<span class="sd-legend-dot" style="background:#4a7fc1;"></span> Revenue
				<span class="sd-legend-dot" style="background:#2ecc71;margin-left:12px;"></span> Quota
			</div>
		`;
	}
}

frappe.sales_dashboard_page_template = {
	body: `
<div class="sd-root">

	<!-- Top header bar -->
	<div class="sd-header">
		<div class="sd-header-title">
			Sales Performer Dashboard
		</div>
		<div class="sd-header-filters">
			<select id="time-filter1" class="form-select form-select-sm me-2 sd-filter-select" style="width:130px;">
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
			<div id="sales-person-multiselect" class="sd-ms" style="width:100%;width:130px;"></div>
			<div id="sd-custom-date-range" class="sd-custom-date-range">
				<input type="date" id="custom-from-date" class="sd-filter-select" />
				<input type="date" id="custom-to-date" class="sd-filter-select" />
				<button type="button" id="apply-custom-date-range" class="btn btn-sm btn-primary">Apply</button>
			</div>
		</div>
	</div>

	<!-- Main body -->
	<div class="sd-body">

		<!-- Left profile card -->
		<div class="sd-profile-card">
			<div class="sd-avatar-wrap">
				<div class="sd-avatar" id="sd-profile-avatar">NA</div>
			</div>
			<div class="sd-profile-name" id="sd-profile-name">-</div>
			<div class="sd-profile-title" id="sd-profile-title">Sales User</div>
			<hr class="sd-divider"/>
			<div class="sd-profile-stat-row">
				<span class="sd-stat-num" id="sd-created-opps">0</span>
				<span class="sd-stat-label">Created Opportunities</span>
			</div>
			<div class="sd-profile-amount" id="sd-profile-amount">$0</div>
			<div class="sd-profile-badge sd-green" id="sd-profile-badge">&#x25B2; 0% vs Last Week</div>
			<div class="sd-profile-target">This Week Closed Won</div>
		</div>

		<!-- Right main panel -->
		<div class="sd-main">

			<!-- KPI row -->
			<div class="sd-kpi-row">
				<div class="sd-kpi-card">
					<div class="sd-kpi-label">Win Rate</div>
					<div class="sd-kpi-value" id="sd-win-rate">0%</div>
					<div class="sd-kpi-sub sd-green">&#x25B2; vs Team Avg: 45%</div>
				</div>
				<div class="sd-kpi-card">
					<div class="sd-kpi-label">New Leads</div>
					<div class="sd-kpi-value" id="sd-new-leads">0</div>
					<div class="sd-kpi-sub sd-green">&#x25B2; 20% This Month</div>
				</div>
				<div class="sd-kpi-card">
					<div class="sd-kpi-label">Pipeline Value</div>
					<div class="sd-kpi-value" id="sd-pipeline-value">$0</div>
					<div class="sd-kpi-sub sd-muted">75 Deals</div>
				</div>
				<div class="sd-kpi-card">
					<div class="sd-kpi-label">Earning MGIT</div>
					<div class="sd-kpi-progress-bar">
						<div class="sd-kpi-progress-fill" style="width:60%;"></div>
					</div>
				</div>
				<div class="sd-kpi-card">
					<div class="sd-kpi-label">Forecast vs. Target</div>
					<div class="sd-kpi-value"><span id="sd-forecast-value">$0</span> <span class="sd-kpi-slash">/ <span id="sd-target-value">$0</span></span></div>
					<div class="sd-kpi-goal-bar">
						<div class="sd-kpi-goal-fill" id="sd-kpi-goal-fill"></div>
					</div>
					<div class="sd-kpi-goal-label" id="sd-goal-label">0% of Goal</div>
				</div>
			</div>

			<!-- Mid row -->
			<div class="sd-mid-row">

				<!-- Pipeline chart -->
				<div class="sd-card sd-pipeline">
					<div class="sd-card-title">Sales Pipeline by Stage</div>
					<div id="sd-pipeline-chart"></div>
				</div>

				<!-- Top Deals -->
				<div class="sd-card sd-top-deals">
					<div class="sd-card-title">Top Deals Closed</div>
					<table class="sd-deals-table">
						<tbody id="sd-top-deals-body">
							<tr class="sd-deals-row">
								<td colspan="2">No data</td>
							</tr>
						</tbody>
					</table>
				</div>

				<!-- Right col: Activity + Rankings -->
				<div class="sd-right-col">
					<div class="sd-card sd-activity">
						<div class="sd-card-title">Activity Overview</div>
						<div class="sd-activity-row">
							<div class="sd-activity-item">
								<div class="sd-activity-icon">&#x260E;</div>
								<div class="sd-activity-num" id="sd-calls">0</div>
								<div class="sd-activity-label">Calls</div>
							</div>
							<div class="sd-activity-item">
								<div class="sd-activity-icon">&#x1F4C5;</div>
								<div class="sd-activity-num" id="sd-meetings">0</div>
								<div class="sd-activity-label">Meetings</div>
							</div>
							<div class="sd-activity-item">
								<div class="sd-activity-icon">&#x2709;</div>
								<div class="sd-activity-num" id="sd-emails">0</div>
								<div class="sd-activity-label">Emails</div>
							</div>
						</div>
					</div>
					<div class="sd-card sd-ranking">
						<div class="sd-card-title">&#x1F3C6; Ranking vs. Team</div>
						<div id="sd-ranking-list">
							<div class="sd-rank-row"><span class="sd-rank-name">No data</span></div>
						</div>
					</div>
				</div>
			</div>

			<!-- Bottom row: Funnel + Trend -->
			<div class="sd-bottom-row">
				<div class="sd-card sd-funnel-card">
					<div class="sd-card-title">Sales Funnel</div>
					<div id="sd-funnel-chart"></div>
				</div>
				<div class="sd-card sd-trend">
					<div class="sd-card-title">Revenue &amp; Quota Trend</div>
					<div id="sd-trend-chart"></div>
				</div>
			</div>

		</div><!-- /.sd-main -->
	</div><!-- /.sd-body -->
</div><!-- /.sd-root -->
	`,
};